import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { config } from '../config';
import { requireAuth, currentUser } from '../middleware/auth';
import { parse, minorUnits, currencyCode, pinSchema } from '../lib/validate';
import { idempotency } from '../middleware/idempotency';
import { errors } from '../lib/errors';
import { reference } from '../lib/ids';
import { post, walletAccount, sysAccount } from '../services/ledger';
import { calculateFee } from '../services/fees';
import { evaluateTransfer, flag } from '../services/fraud';
import { notify } from '../services/notifications';
import { audit } from '../services/audit';
import { assertPin } from './auth';

export const paymentsRouter = Router();
const wrap = (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

async function requireKycVerified(user: any) {
  if (user.kyc_status !== 'verified') throw errors.kycBlocked();
}

/** Card top up */
paymentsRouter.post('/topup/quote', requireAuth, wrap(async (req, res) => {
  const b = parse(z.object({ currency: currencyCode, amountMinor: minorUnits }), req.body);
  const fee = await calculateFee('card_topup', b.amountMinor, b.currency);
  res.json({ amountMinor: b.amountMinor, feeMinor: fee.feeMinor, grossMinor: b.amountMinor + fee.feeMinor, netMinor: b.amountMinor, ruleName: fee.ruleName });
}));

async function settleTopUp(t: any, outcome: 'completed' | 'failed', failure?: { code: string; message: string }) {
  if (outcome === 'completed') {
    const { ledgerTxId } = await post({
      userId: t.user_id,
      type: 'card_topup',
      description: 'Card top up settlement',
      reference: `${t.reference}-SET`,
      legs: [
        { accountCode: sysAccount('clearing', t.currency), currency: t.currency, amountMinor: Number(t.amount_minor) + Number(t.fee_minor), direction: 'debit' },
        { accountCode: walletAccount(t.user_id, t.currency), currency: t.currency, amountMinor: Number(t.amount_minor), direction: 'credit' },
        ...(Number(t.fee_minor) > 0 ? [{ accountCode: sysAccount('revenue', t.currency), currency: t.currency, amountMinor: Number(t.fee_minor), direction: 'credit' as const }] : [])
      ]
    });
    await db.query('UPDATE transactions SET status=$2, completed_at=now(), ledger_tx_id=$3, updated_at=now() WHERE id=$1', [t.id, 'completed', ledgerTxId]);
  } else {
    await db.query('UPDATE transactions SET status=$2, failure_code=$3, failure_message=$4, completed_at=now(), updated_at=now() WHERE id=$1', [t.id, 'failed', failure?.code ?? 'CARD_DECLINED', failure?.message ?? 'Declined by processor']);
  }
  await notify(t.user_id, outcome === 'completed' ? 'topup_completed' : 'topup_failed',
    outcome === 'completed' ? 'Top up completed' : 'Top up failed',
    outcome === 'completed' ? 'Your funds are available in your wallet.' : (failure?.message ?? 'The card was declined.'));
}

paymentsRouter.post('/topup', requireAuth, idempotency, wrap(async (req, res) => {
  const b = parse(z.object({
    cardId: z.string().uuid(), currency: currencyCode, amountMinor: minorUnits.max(2_000_000), pin: pinSchema.optional()
  }), req.body);
  const user = await currentUser(req);
  await requireKycVerified(user);
  if (user.pin_hash) await assertPin(user, b.pin);

  const { rows: cards } = await db.query(
    `SELECT * FROM payment_cards WHERE id=$1 AND user_id=$2 AND kind IN ('tokenized','virtual','physical')`,
    [b.cardId, user.id]
  );
  const card = cards[0];
  if (!card) throw errors.notFound('Card');
  if (card.status !== 'active') throw errors.validation(`Card is ${card.status}`);

  const fee = await calculateFee('card_topup', b.amountMinor, b.currency);
  const gross = b.amountMinor + fee.feeMinor;
  if (card.spend_limit_minor && currencyMatches(card.limit_currency, b.currency) && gross > Number(card.spend_limit_minor)) {
    throw errors.validation('Exceeds card spend limit');
  }

  const fraud = await evaluateTransfer(user.id, gross, b.currency, 'card_topup');
  // Sandbox processor: last4 drives the outcome
  const last4: string = card.last4;
  let status: string = 'completed';
  let failure: { code: string; message: string } | undefined;
  if (fraud.flagged) status = 'pending_review';
  else if (last4 === '9995') { status = 'failed'; failure = { code: 'CARD_DECLINED', message: 'Insufficient funds on card' }; }
  else if (last4 === '3155') { status = 'pending'; } // simulated 3-D Secure: settle via sandbox endpoint

  const ref = reference('TOP');
  const { rows: wallets } = await db.query<{ id: string }>('SELECT id FROM wallets WHERE user_id=$1', [user.id]);
  const { rows } = await db.query(
    `INSERT INTO transactions (user_id, wallet_id, reference, type, status, amount_minor, currency, fee_minor, description, counterparty_name, counterparty_ref, payment_provider, sandbox)
     VALUES ($1,$2,$3,'card_topup',$4,$5,$6,$7,'Card top up',$8,$9,'sim_card_processor',true) RETURNING *`,
    [user.id, wallets[0].id, ref, status, b.amountMinor, b.currency, fee.feeMinor,
     `${card.brand} •••• ${card.last4}`, card.id]
  );
  const t = rows[0];

  if (fraud.flagged) {
    for (const rule of fraud.rules) await flag(user.id, t.id, rule, 'high');
  } else {
    await settleTopUp(t, status === 'pending_review' ? 'completed' : (status as 'completed' | 'failed'), failure);
    if (status === 'pending') {
      // stays pending; sandbox endpoint flips it
    }
  }
  await audit({ actorType: 'user', actorId: user.id, action: 'payment.topup', entity: 'transaction', entityId: t.id, metadata: { amountMinor: b.amountMinor, status } });
  const { rows: fresh } = await db.query('SELECT * FROM transactions WHERE id=$1', [t.id]);
  res.status(fresh[0].status === 'completed' ? 201 : 202).json({ paymentId: t.id, status: fresh[0].status, reference: ref });
}));

/** Bank transfer instructions (pending until sandbox settlement). */
export const topupsRouter = Router();
topupsRouter.post('/bank/create', requireAuth, idempotency, wrap(async (req, res) => {
  const b = parse(z.object({ currency: currencyCode, amountMinor: minorUnits.max(5_000_000) }), req.body);
  const user = await currentUser(req);
  const ref = reference('BANK');
  const { rows: wallets } = await db.query<{ id: string }>('SELECT id FROM wallets WHERE user_id=$1', [user.id]);
  await db.query(
    'UPDATE wallet_balances SET pending_minor = pending_minor + $3, updated_at=now() WHERE wallet_id=$1 AND currency=$2',
    [wallets[0].id, b.currency, b.amountMinor]
  );
  const { rows } = await db.query(
    `INSERT INTO transactions (user_id, wallet_id, reference, type, status, amount_minor, currency, fee_minor, description, sandbox)
     VALUES ($1,$2,$3,'bank_topup','pending',$4,$5,0,'Bank transfer top up',true) RETURNING *`,
    [user.id, wallets[0].id, ref, b.amountMinor, b.currency]
  );
  res.status(201).json({
    transactionId: rows[0].id,
    reference: ref,
    amountMinor: b.amountMinor,
    bankDetails: { bankName: 'PayInter Sandbox Bank S.A.', accountName: 'PayInter Client Funds', iban: `AO06 0069 0000 000${String(user.id).replace(/-/g, '').slice(0, 10)}`, swift: 'PAYSAOXX', country: 'AO' },
    note: 'Include the reference in your transfer. This is a simulated account — no real bank movement occurs.'
  });
}));

/** Mobile money prompt */
topupsRouter.post('/mobile-money/initiate', requireAuth, idempotency, wrap(async (req, res) => {
  const b = parse(z.object({
    currency: currencyCode, amountMinor: minorUnits.max(2_000_000),
    phoneNumber: z.string().min(8).max(24), provider: z.string().max(60).optional()
  }), req.body);
  const user = await currentUser(req);
  const fee = await calculateFee('mobile_money', b.amountMinor, b.currency);
  const ref = reference('MMO');
  const { rows: wallets } = await db.query<{ id: string }>('SELECT id FROM wallets WHERE user_id=$1', [user.id]);
  const { rows } = await db.query(
    `INSERT INTO transactions (user_id, wallet_id, reference, type, status, amount_minor, currency, fee_minor, description, counterparty_name, sandbox)
     VALUES ($1,$2,$3,'mobile_money','pending',$4,$5,$6,'Mobile money top up',$7,true) RETURNING id`,
    [user.id, wallets[0].id, ref, b.amountMinor, b.currency, fee.feeMinor, b.provider ?? 'Mobile Money Operator']
  );
  res.status(201).json({ paymentId: rows[0].id, reference: ref, status: 'pending', note: 'Approve the prompt on your handset — sandbox simulates it instantly upon settle.' });
}));

/** shared by sandbox settle for bank/mobile/pending card */
export async function settleGeneric(t: any, outcome: 'completed' | 'failed') {
  if (t.status !== 'pending' && t.status !== 'pending_review') return;
  if (outcome === 'completed') {
    const { ledgerTxId } = await post({
      userId: t.user_id,
      type: t.type,
      description: `${t.type} settlement`,
      reference: `${t.reference}-SET`,
      legs: [
        { accountCode: sysAccount('clearing', t.currency), currency: t.currency, amountMinor: Number(t.amount_minor) + Number(t.fee_minor), direction: 'debit' },
        { accountCode: walletAccount(t.user_id, t.currency), currency: t.currency, amountMinor: Number(t.amount_minor), direction: 'credit' },
        ...(Number(t.fee_minor) > 0 ? [{ accountCode: sysAccount('revenue', t.currency), currency: t.currency, amountMinor: Number(t.fee_minor), direction: 'credit' as const }] : [])
      ]
    });
    await db.transaction(async (q) => {
      await q.query('UPDATE transactions SET status=$2, completed_at=now(), ledger_tx_id=$3, updated_at=now() WHERE id=$1', [t.id, 'completed', ledgerTxId]);
      if (t.type === 'bank_topup' || t.type === 'mobile_money') {
        await q.query(
          'UPDATE wallet_balances SET pending_minor = GREATEST(pending_minor - $3, 0), updated_at=now() WHERE wallet_id=$1 AND currency=$2',
          [t.wallet_id, t.currency, t.amount_minor]
        );
      }
    });
  } else {
    await db.transaction(async (q) => {
      await q.query("UPDATE transactions SET status='failed', completed_at=now(), updated_at=now() WHERE id=$1", [t.id]);
      if (t.type === 'bank_topup' || t.type === 'mobile_money') {
        await q.query(
          'UPDATE wallet_balances SET pending_minor = GREATEST(pending_minor - $3, 0), updated_at=now() WHERE wallet_id=$1 AND currency=$2',
          [t.wallet_id, t.currency, t.amount_minor]
        );
      }
    });
  }
  await notify(t.user_id, `settle_${outcome}`, outcome === 'completed' ? 'Payment completed' : 'Payment failed', `${t.reference} — ${outcome}.`);
}

function currencyMatches(a: string | null | undefined, b: string) {
  return !!a && a.toUpperCase() === b.toUpperCase();
}
