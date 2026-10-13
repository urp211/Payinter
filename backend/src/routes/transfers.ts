import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { requireAuth, currentUser } from '../middleware/auth';
import { parse, minorUnits, currencyCode, pinSchema } from '../lib/validate';
import { idempotency } from '../middleware/idempotency';
import { reference } from '../lib/ids';
import { errors } from '../lib/errors';
import { post, walletAccount } from '../services/ledger';
import { calculateFee } from '../services/fees';
import { evaluateTransfer, flag } from '../services/fraud';
import { notify } from '../services/notifications';
import { audit } from '../services/audit';
import { assertPin } from './auth';

export const transfersRouter = Router();
const wrap = (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

transfersRouter.post('/send', requireAuth, idempotency, wrap(async (req, res) => {
  const b = parse(
    z.object({
      identifier: z.string().min(3).max(120),
      currency: currencyCode,
      amountMinor: minorUnits.max(100_000_000),
      note: z.string().max(120).optional(),
      pin: pinSchema
    }),
    req.body
  );
  const sender = await currentUser(req);
  await assertPin(sender, b.pin);

  const identifier = b.identifier.trim().replace(/^@/, '');
  const { rows: payees } = await db.query(
    `SELECT id, paytag, first_name, last_name, status FROM users
     WHERE id<>$1 AND status='active' AND (
       lower(paytag)=lower($2) OR lower(email)=lower($2) OR phone=$2 OR paytag=$2
     ) LIMIT 1`,
    [sender.id, identifier]
  );
  const payee = payees[0];
  if (!payee) throw errors.notFound('Recipient');

  const { rows: wallets } = await db.query<{ id: string }>('SELECT id FROM wallets WHERE user_id=$1', [sender.id]);
  const sendRef = reference('SEN');
  const recvRef = reference('RCV');
  const fee = await calculateFee('p2p_send', b.amountMinor, b.currency);

  // fraud gate → review queue
  const fraud = await evaluateTransfer(sender.id, b.amountMinor, b.currency, 'send');
  const status = fraud.flagged ? 'pending_review' : 'completed';

  const { ledgerTxId } = await post({
    userId: sender.id,
    type: 'p2p_send',
    description: `P2P ${sender.paytag} → ${payee.paytag}`,
    reference: sendRef,
    legs: [
      { accountCode: walletAccount(sender.id, b.currency), currency: b.currency, amountMinor: b.amountMinor + fee.feeMinor, direction: 'debit' },
      { accountCode: walletAccount(payee.id, b.currency), currency: b.currency, amountMinor: b.amountMinor, direction: 'credit' },
      ...(fee.feeMinor > 0 ? [{ accountCode: `SYS:REVENUE:${b.currency}`, currency: b.currency, amountMinor: fee.feeMinor, direction: 'credit' as const }] : [])
    ]
  });

  const { rows: sendTx } = await db.query(
    `INSERT INTO transactions (user_id, wallet_id, reference, type, status, amount_minor, currency, fee_minor, description, note, counterparty_name, counterparty_ref, completed_at, ledger_tx_id)
     VALUES ($1,$2,$3,'send',$4,$5,$6,$7,'Send money',$8,$9,$10, now(), $11) RETURNING *`,
    [sender.id, wallets[0].id, sendRef, status, b.amountMinor, b.currency, fee.feeMinor,
     b.note ?? null, `${payee.first_name ?? ''} ${payee.last_name ?? ''}`.trim() || `@${payee.paytag}`, `@${payee.paytag}`, ledgerTxId]
  );
  const tx = sendTx[0];
  if (status === 'completed') {
    const { rows: payeeWallet } = await db.query<{ id: string }>('SELECT id FROM wallets WHERE user_id=$1', [payee.id]);
    await db.query(
      `INSERT INTO transactions (user_id, wallet_id, reference, type, status, amount_minor, currency, fee_minor, description, note, counterparty_name, counterparty_ref, completed_at, ledger_tx_id)
       VALUES ($1,$2,$3,'receive','completed',$4,$5,0,'Received money',$6,$7,$8, now(), $9)`,
      [payee.id, payeeWallet[0].id, recvRef, b.amountMinor, b.currency,
       b.note ?? null, `${sender.first_name ?? ''} ${sender.last_name ?? ''}`.trim() || `@${sender.paytag}`, `@${sender.paytag}`, ledgerTxId]
    );
    await notify(payee.id, 'money_received', 'Money received', `You received a payment from @${sender.paytag}.`);
    await notify(sender.id, 'money_sent', 'Money sent', `Sent to @${payee.paytag} — completed.`);
  } else {
    for (const rule of fraud.rules) await flag(sender.id, tx.id, rule, rule === 'velocity' ? 'medium' : 'high');
    await notify(sender.id, 'review', 'Payment under review', 'Your transfer is being reviewed by our team (24h max).');
  }
  await audit({ actorType: 'user', actorId: sender.id, action: 'transfer.send', entity: 'transaction', entityId: tx.id, metadata: { amountMinor: b.amountMinor, currency: b.currency, payee: payee.paytag, status } });
  res.status(status === 'completed' ? 201 : 202).json(tx);
}));
