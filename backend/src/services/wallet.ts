/** Wallet service: registration bootstrap, balances with USD equivalents, conversion. */
import { db } from '../db';
import { errors } from '../lib/errors';
import { listCurrencies, convert as fxConvert, getRate } from './fx';
import { post, walletAccount, sysAccount } from './ledger';
import { calculateFee } from './fees';

export async function provisionWallet(userId: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO wallets (user_id) VALUES ($1)
     ON CONFLICT (user_id) DO UPDATE SET user_id=EXCLUDED.user_id RETURNING id`,
    [userId]
  );
  const walletId = rows[0].id;
  const curs = await listCurrencies(true);
  for (const c of curs) {
    await db.query(
      `INSERT INTO wallet_balances (wallet_id, currency, available_minor, pending_minor)
       VALUES ($1,$2,0,0) ON CONFLICT DO NOTHING`,
      [walletId, c.code]
    );
    await db.query(
      `INSERT INTO ledger_accounts (code, type, currency, owner_user_id, display_name, balance_minor)
       VALUES ($1,'wallet',$2,$3,$4,0) ON CONFLICT DO NOTHING`,
      [walletAccount(userId, c.code), c.code, userId, `Wallet ${c.code}`]
    );
  }
  return walletId;
}

export async function getWalletFor(userId: string) {
  const { rows: wallets } = await db.query<{ id: string }>('SELECT id FROM wallets WHERE user_id=$1', [userId]);
  if (!wallets.length) throw errors.notFound('Wallet');
  const walletId = wallets[0].id;
  const { rows } = await db.query<{
    currency: string; symbol: string; name: string; decimals: number;
    available_minor: string; pending_minor: string;
  }>(
    `SELECT wb.currency, c.symbol, c.name, c.decimals, wb.available_minor, wb.pending_minor
     FROM wallet_balances wb JOIN currencies c ON c.code=wb.currency
     WHERE wb.wallet_id=$1 AND c.is_active ORDER BY wb.currency`,
    [walletId]
  );
  const balances: any[] = [];
  let totalUsdMinor = 0;
  for (const b of rows) {
    let usd: number | null = null;
    try {
      const r = b.currency === 'USD'
        ? 1
        : Number((await getRate('USD', b.currency)).rate);
      usd = Math.round(Number(b.available_minor) / r);
      totalUsdMinor += usd;
    } catch { usd = null; }
    balances.push({
      currency: b.currency,
      symbol: b.symbol,
      name: b.name,
      decimals: Number(b.decimals),
      availableMinor: Number(b.available_minor),
      pendingMinor: Number(b.pending_minor),
      usdEquivalentMinor: usd
    });
  }
  return { walletId, totalUsdMinor, balances };
}

export interface ConvertQuote {
  fromCurrency: string; toCurrency: string; fromAmountMinor: number;
  rate: string; feeMinor: number; receiveMinor: number; expiresAt: string;
}

export async function convertQuote(fromCurrency: string, toCurrency: string, amountMinor: number): Promise<ConvertQuote> {
  const fee = await calculateFee('convert', amountMinor, fromCurrency);
  const netFrom = amountMinor - fee.feeMinor;
  const { rateInfo, quoteMinor } = await fxConvert(fromCurrency, toCurrency, netFrom);
  return {
    fromCurrency, toCurrency, fromAmountMinor: amountMinor,
    rate: rateInfo.rate, feeMinor: fee.feeMinor, receiveMinor: quoteMinor,
    expiresAt: new Date(Date.now() + 60_000).toISOString()
  };
}

export async function executeConvert(userId: string, fromCurrency: string, toCurrency: string, amountMinor: number): Promise<{
  transaction: any;
}> {
  const quote = await convertQuote(fromCurrency, toCurrency, amountMinor);
  const walletAccountIn = walletAccount(userId, fromCurrency);
  const walletAccountOut = walletAccount(userId, toCurrency);
  const settlementIn = sysAccount('settlement', fromCurrency);
  const settlementOut = sysAccount('settlement', toCurrency);
  const revenue = sysAccount('revenue', fromCurrency);
  const netFrom = amountMinor - quote.feeMinor;

  const { ledgerTxId, reference } = await post({
    userId,
    type: 'convert',
    description: `Convert ${fromCurrency}→${toCurrency}`,
    legs: [
      // user funds out (fromCurrency)
      { accountCode: walletAccountIn, currency: fromCurrency, amountMinor: netFrom, direction: 'debit' },
      { accountCode: settlementIn, currency: fromCurrency, amountMinor: netFrom, direction: 'credit' },
      // fee
      ...(quote.feeMinor > 0 ? [
        { accountCode: walletAccountIn, currency: fromCurrency, amountMinor: quote.feeMinor, direction: 'debit' as const },
        { accountCode: revenue, currency: fromCurrency, amountMinor: quote.feeMinor, direction: 'credit' as const }
      ] : []),
      // user funds in (toCurrency)
      { accountCode: settlementOut, currency: toCurrency, amountMinor: quote.receiveMinor, direction: 'debit' },
      { accountCode: walletAccountOut, currency: toCurrency, amountMinor: quote.receiveMinor, direction: 'credit' }
    ],
    meta: { fromCurrency, toCurrency, rate: quote.rate }
  });

  const { rows } = await db.query(
    `INSERT INTO transactions (user_id, wallet_id, reference, type, status, amount_minor, currency, fee_minor, exchange_rate, net_amount_minor, description, completed_at, ledger_tx_id)
     VALUES ($1,(SELECT id FROM wallets WHERE user_id=$1),$2,'convert','completed',$3,$4,$5,$6,$7,'Currency exchange',now(),$8)
     RETURNING *`,
    [userId, reference, amountMinor, fromCurrency, quote.feeMinor, quote.rate, quote.receiveMinor, ledgerTxId]
  );
  const tx = rows[0];
  (tx as any).toAmountMinor = quote.receiveMinor;
  (tx as any).toCurrency = toCurrency;
  return { transaction: tx };
}
