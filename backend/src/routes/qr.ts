import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { config } from '../config';
import { requireAuth, currentUser } from '../middleware/auth';
import { parse, minorUnits, currencyCode, pinSchema } from '../lib/validate';
import { idempotency } from '../middleware/idempotency';
import { errors } from '../lib/errors';
import { hmacSha256 } from '../lib/crypto';
import { reference } from '../lib/ids';
import { post, walletAccount } from '../services/ledger';
import { calculateFee } from '../services/fees';
import { notify } from '../services/notifications';
import { assertPin } from './auth';

export const qrRouter = Router();
const wrap = (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

function sign(paytag: string, currency: string, amountMinor: number | null): string {
  return hmacSha256(config.qrSigningSecret, `${paytag}|${currency}|${amountMinor ?? ''}`).slice(0, 24);
}

function encode(payload: { v: number; p: string; c: string; a: number | null; s: string }) {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}
function decode(raw: string): any {
  try { return JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')); } catch { return null; }
}

/** My QR — paytag + server signature; amount optional. */
qrRouter.post('/code', requireAuth, wrap(async (req, res) => {
  const b = parse(z.object({ currency: currencyCode.optional(), amountMinor: minorUnits.optional() }), req.body ?? {});
  const u = await currentUser(req);
  const ccy = b.currency ?? 'USD';
  const amt = b.amountMinor ?? null;
  const payload = { v: 1, p: u.paytag, c: ccy, a: amt, s: sign(u.paytag, ccy, amt) };
  res.json({ payload: encode(payload), paytag: u.paytag, currency: ccy, amountMinor: amt });
}));

/** Resolve someone else's code (client shows payee preview). */
qrRouter.post('/resolve', requireAuth, wrap(async (req, res) => {
  const b = parse(z.object({ payload: z.string().min(10) }), req.body);
  const data = decode(b.payload);
  if (!data || data.v !== 1 || !data.p || !data.c) throw errors.validation('Unrecognized QR payload');
  if (data.s !== sign(data.p, data.c, data.a ?? null)) throw errors.validation('QR signature invalid — code was not issued by PayInter');
  const { rows } = await db.query(
    `SELECT paytag, first_name, last_name, country_code FROM users WHERE paytag=$1 AND status='active'`, [data.p]
  );
  if (!rows.length) throw errors.notFound('Payee');
  const r = rows[0];
  res.json({ payee: { paytag: r.paytag, firstName: r.first_name, lastName: r.last_name, countryCode: r.country_code }, currency: data.c, amountMinor: data.a ?? null, payload: b.payload });
}));

/** Pay a QR code — server re-validates the signature regardless of client. */
qrRouter.post('/pay', requireAuth, idempotency, wrap(async (req, res) => {
  const b = parse(z.object({
    payload: z.string().min(10), amountMinor: minorUnits.optional(), note: z.string().max(120).optional(), pin: pinSchema
  }), req.body);
  const sender = await currentUser(req);
  const data = decode(b.payload);
  if (!data || data.v !== 1 || !data.p || !data.c) throw errors.validation('Unrecognized QR payload');
  if (data.s !== sign(data.p, data.c, data.a ?? null)) throw errors.validation('QR signature invalid — tampered or forged code');
  const amount = b.amountMinor ?? data.a;
  if (!amount) throw errors.validation('amountMinor required — the code has no fixed amount');

  await assertPin(sender, b.pin);
  const { rows: payees } = await db.query('SELECT id, paytag, first_name, last_name FROM users WHERE paytag=$1 AND status=\'active\'', [data.p]);
  const payee = payees[0];
  if (!payee) throw errors.notFound('Payee');
  if (payee.id === sender.id) throw errors.validation('Cannot pay yourself');

  const fee = await calculateFee('qr_pay', amount, data.c);
  const sendRef = reference('QRP');
  const { ledgerTxId } = await post({
    userId: sender.id,
    type: 'qr_pay',
    description: `QR pay @${payee.paytag}`,
    reference: sendRef,
    legs: [
      { accountCode: walletAccount(sender.id, data.c), currency: data.c, amountMinor: amount + fee.feeMinor, direction: 'debit' },
      { accountCode: walletAccount(payee.id, data.c), currency: data.c, amountMinor: amount, direction: 'credit' },
      ...(fee.feeMinor > 0 ? [{ accountCode: `SYS:REVENUE:${data.c}`, currency: data.c, amountMinor: fee.feeMinor, direction: 'credit' as const }] : [])
    ]
  });

  const { rows: wallets } = await db.query<{ id: string }>('SELECT id FROM wallets WHERE user_id=$1', [sender.id]);
  const { rows: sendTx } = await db.query(
    `INSERT INTO transactions (user_id, wallet_id, reference, type, status, amount_minor, currency, fee_minor, description, note, counterparty_name, completed_at, ledger_tx_id)
     VALUES ($1,$2,$3,'qr_pay','completed',$4,$5,$6,'QR payment',$7,$8, now(), $9) RETURNING *`,
    [sender.id, wallets[0].id, sendRef, amount, data.c, fee.feeMinor, b.note ?? null, `@${payee.paytag}`, ledgerTxId]
  );
  const { rows: payeeWallets } = await db.query<{ id: string }>('SELECT id FROM wallets WHERE user_id=$1', [payee.id]);
  await db.query(
    `INSERT INTO transactions (user_id, wallet_id, reference, type, status, amount_minor, currency, fee_minor, description, note, counterparty_name, completed_at, ledger_tx_id)
     VALUES ($1,$2,$3,'qr_receive','completed',$4,$5,0,'QR payment received',$6,$7, now(), $8)`,
    [payee.id, payeeWallets[0].id, reference('QRR'), amount, data.c, b.note ?? null, `@${sender.paytag}`, ledgerTxId]
  );
  await notify(payee.id, 'qr_received', 'QR payment received', `Payment from @${sender.paytag} completed.`);
  res.status(201).json(sendTx[0]);
}));
