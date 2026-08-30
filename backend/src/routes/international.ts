import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { requireAuth, currentUser } from '../middleware/auth';
import { parse, minorUnits, currencyCode, pinSchema } from '../lib/validate';
import { idempotency } from '../middleware/idempotency';
import { errors } from '../lib/errors';
import { reference, uuid } from '../lib/ids';
import { post, walletAccount, sysAccount } from '../services/ledger';
import { calculateFee } from '../services/fees';
import { getRate } from '../services/fx';
import { evaluateTransfer, flag } from '../services/fraud';
import { notify } from '../services/notifications';
import { audit } from '../services/audit';
import { assertPin } from './auth';

export const internationalRouter = Router();
const wrap = (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

function providerMeta(provider?: string) {
  return provider === 'rapid_sim'
    ? { provider: 'rapid_sim', label: 'Express', priority: 20, eta: 'Minutes' }
    : { provider: 'wise_sim', label: 'Standard bank', priority: 10, eta: 'Same day' };
}

internationalRouter.post('/quote', requireAuth, wrap(async (req, res) => {
  const b = parse(z.object({
    fromCurrency: currencyCode, toCurrency: currencyCode, amountMinor: minorUnits, provider: z.string().optional()
  }), req.body);
  const meta = providerMeta(b.provider);
  const fee = await calculateFee('international', b.amountMinor, b.fromCurrency, { priority: meta.priority });
  const rate = await getRate(b.fromCurrency, b.toCurrency);
  const recipientMinor = Math.round(b.amountMinor * Number(rate.rate));
  res.json({
    fromCurrency: b.fromCurrency, toCurrency: b.toCurrency, amountMinor: b.amountMinor,
    rate: rate.rate, provider: meta.provider, providerLabel: meta.label,
    feeMinor: fee.feeMinor, feeLabel: fee.ruleName, inclusive: false,
    recipientMinor, totalDebitMinor: b.amountMinor + fee.feeMinor,
    eta: meta.eta, sandbox: rate.sandbox,
    quoteTtlSeconds: 60, expiresAt: new Date(Date.now() + 60_000).toISOString()
  });
}));

internationalRouter.post(
  '/',
  requireAuth,
  idempotency,
  wrap(async (req, res) => {
    const b = parse(z.object({
      recipientId: z.string().uuid(),
      fromCurrency: currencyCode,
      toCurrency: currencyCode,
      amountMinor: minorUnits.max(10_000_000),
      provider: z.string().optional(),
      purpose: z.string().max(60),
      note: z.string().max(120).optional(),
      pin: pinSchema
    }), req.body);
    const user = await currentUser(req);
    if (user.kyc_status !== 'verified') throw errors.kycBlocked();
    await assertPin(user, b.pin);

    const { rows: recs } = await db.query('SELECT * FROM recipients WHERE id=$1 AND user_id=$2', [b.recipientId, user.id]);
    const rec = recs[0];
    if (!rec) throw errors.notFound('Recipient');

    const meta = providerMeta(b.provider);
    const fee = await calculateFee('international', b.amountMinor, b.fromCurrency, { priority: meta.priority });
    const rate = await getRate(b.fromCurrency, b.toCurrency);
    const recipientMinor = Math.round(b.amountMinor * Number(rate.rate));
    const totalDebit = b.amountMinor + fee.feeMinor;
    const ref = reference('INT');

    const fraud = await evaluateTransfer(user.id, totalDebit, b.fromCurrency, 'international');
    const status = fraud.flagged ? 'pending_review' : 'completed';
    const now = new Date().toISOString();
    const trackingEvents = status === 'completed'
      ? [
          { status: 'created', at: now, note: 'Payment received' },
          { status: 'processing', at: now, note: 'Sent to payout partner' },
          { status: 'delivered', at: now, note: `Delivered via ${meta.label} (${meta.eta})` }
        ]
      : [{ status: 'created', at: now, note: 'Awaiting compliance review' }];

    const fxFrom = 'SYS:FX:' + b.fromCurrency;
    const fxTo = 'SYS:FX:' + b.toCurrency;
    const { ledgerTxId } = await post({
      userId: user.id,
      type: 'international',
      description: `International ${b.fromCurrency}→${b.toCurrency}@${rate.rate}`,
      reference: ref,
      legs: [
        // customer side
        { accountCode: walletAccount(user.id, b.fromCurrency), currency: b.fromCurrency, amountMinor: totalDebit, direction: 'debit' },
        { accountCode: sysAccount('clearing', b.fromCurrency), currency: b.fromCurrency, amountMinor: b.amountMinor, direction: 'credit' },
        ...(fee.feeMinor > 0 ? [{ accountCode: sysAccount('revenue', b.fromCurrency), currency: b.fromCurrency, amountMinor: fee.feeMinor, direction: 'credit' as const }] : []),
        // conversion: FROM currency flows into FX desk
        { accountCode: sysAccount('clearing', b.fromCurrency), currency: b.fromCurrency, amountMinor: b.amountMinor, direction: 'debit' },
        { accountCode: fxFrom, currency: b.fromCurrency, amountMinor: b.amountMinor, direction: 'credit' },
        // TO currency flows out of FX desk into settlement payable
        { accountCode: fxTo, currency: b.toCurrency, amountMinor: recipientMinor, direction: 'debit' },
        { accountCode: sysAccount('settlement', b.toCurrency), currency: b.toCurrency, amountMinor: recipientMinor, direction: 'credit' }
      ],
      meta: { rate: rate.rate, purpose: b.purpose, provider: meta.provider }
    });

    const { rows: wallets } = await db.query<{ id: string }>('SELECT id FROM wallets WHERE user_id=$1', [user.id]);
    const { rows } = await db.query(
      `INSERT INTO transactions (user_id, wallet_id, reference, type, status, amount_minor, currency, fee_minor, exchange_rate, net_amount_minor, description, note, counterparty_name, counterparty_ref, payment_provider, completed_at, ledger_tx_id, tracking_status, tracking_events, secondary)
       VALUES ($1,$2,$3,'international',$4,$5,$6,$7,$8,$9,'International transfer',$10,$11,$12,$13, CASE WHEN $4='completed' THEN now() ELSE NULL END, $14, $15, $16, $17) RETURNING *`,
      [user.id, wallets[0].id, ref, status, b.amountMinor, b.fromCurrency, fee.feeMinor, rate.rate, recipientMinor,
       b.note ?? null, rec.full_name, rec.details?.iban ? `•••• ${String(rec.details.iban).slice(-4)}` : rec.country_code,
       meta.provider, ledgerTxId,
       status === 'completed' ? 'delivered' : 'in_transit', JSON.stringify(trackingEvents),
       JSON.stringify({ toCurrency: b.toCurrency, recipientMinor, purpose: b.purpose, eta: meta.eta })]
    );
    const t = rows[0];
    for (const rule of fraud.rules) await flag(user.id, t.id, rule, rule === 'velocity' ? 'medium' : 'high');
    await notify(user.id, status === 'completed' ? 'intl_delivered' : 'review',
      status === 'completed' ? 'International payment delivered' : 'Transfer under review',
      status === 'completed'
        ? `${ref} delivered to ${rec.full_name} (${meta.eta}).`
        : `${ref} is being reviewed by our compliance team.`);
    await audit({ actorType: 'user', actorId: user.id, action: 'payment.international', entity: 'transaction', entityId: t.id, metadata: { amountMinor: b.amountMinor, from: b.fromCurrency, to: b.toCurrency, status } });
    res.status(status === 'completed' ? 201 : 202).json({
      payment: t,
      tracking: { reference: ref, status: status === 'completed' ? 'delivered' : 'in_transit', events: trackingEvents, recipientAmountMinor: recipientMinor }
    });
  }
));
