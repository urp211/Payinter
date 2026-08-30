import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { requireAuth } from '../middleware/auth';
import { legsOf } from '../services/ledger';

export const transactionsRouter = Router();
const wrap = (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

function out(t: any) {
  if (!t) return t;
  return {
    id: t.id, reference: t.reference, type: t.type, status: t.status,
    amountMinor: Number(t.amount_minor), currency: t.currency,
    feeMinor: Number(t.fee_minor), exchangeRate: t.exchange_rate != null ? String(t.exchange_rate) : null,
    netAmountMinor: t.net_amount_minor != null ? Number(t.net_amount_minor) : null,
    description: t.description, note: t.note, counterpartyName: t.counterparty_name,
    counterpartyRef: t.counterparty_ref, provider: t.payment_provider ?? undefined,
    failureCode: t.failure_code, failureMessage: t.failure_message, sandbox: t.sandbox,
    trackingStatus: t.tracking_status ?? undefined,
    trackingEvents: t.tracking_events ?? [],
    refundOf: t.refund_of ?? undefined,
    refundedAmountMinor: t.refunded_amount_minor != null ? Number(t.refunded_amount_minor) : undefined,
    createdAt: t.created_at, completedAt: t.completed_at
  };
}

transactionsRouter.get('/', requireAuth, wrap(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit ?? 20), 1), 100);
  const { type, status, q, cursor } = req.query as Record<string, string | undefined>;
  const conds = ['user_id=$1'];
  const params: unknown[] = [req.auth!.userId];
  if (type && type !== 'all') { params.push(type); conds.push(`type=$${params.length}`); }
  if (status && status !== 'all') { params.push(status); conds.push(`status=$${params.length}`); }
  if (q && q.trim()) {
    params.push(`%${q.trim().toLowerCase()}%`);
    conds.push(`(lower(reference) LIKE $${params.length} OR lower(description) LIKE $${params.length} OR lower(COALESCE(counterparty_name,'')) LIKE $${params.length})`);
  }
  if (cursor) {
    try {
      const [iso, id] = Buffer.from(cursor, 'base64').toString('utf8').split('|');
      if (iso && id) { params.push(iso, id); conds.push(`(created_at < $${params.length - 1} OR (created_at = $${params.length - 1} AND id < $${params.length}))`); }
    } catch { /* ignore bad cursor */ }
  }
  const { rows } = await db.query(
    `SELECT * FROM transactions WHERE ${conds.join(' AND ')}
     ORDER BY created_at DESC, id DESC LIMIT ${limit + 1}`,
    params
  );
  const items = rows.slice(0, limit).map(out);
  let nextCursor: string | null = null;
  if (rows.length > limit) {
    const last = rows[limit - 1];
    const iso = new Date(last.created_at).toISOString();
    nextCursor = Buffer.from(`${iso}|${last.id}`).toString('base64');
  }
  res.json({ items, nextCursor });
}));

transactionsRouter.get('/:id', requireAuth, wrap(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM transactions WHERE id=$1 AND user_id=$2', [req.params.id, req.auth!.userId]);
  if (!rows.length) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Transaction not found' } }); return; }
  const tx = out(rows[0]);
  const legs = rows[0].ledger_tx_id ? await legsOf(rows[0].ledger_tx_id) : [];
  // timeline synthesis
  const timeline: { event: string; at: string }[] = [{ event: 'created', at: rows[0].created_at }];
  for (const e of (tx.trackingEvents ?? []) as any[]) timeline.push({ event: `tracking:${e.status}`, at: e.at });
  if (rows[0].status === 'pending_review') timeline.push({ event: 'under_review', at: rows[0].updated_at });
  if (rows[0].completed_at) timeline.push({ event: rows[0].status === 'failed' ? 'failed' : 'completed', at: rows[0].completed_at });
  res.json({ ...(tx as object), legs, timeline } as any);
}));

transactionsRouter.post('/:id/dispute', requireAuth, wrap(async (req, res) => {
  const { rows } = await db.query('SELECT id, reference FROM transactions WHERE id=$1 AND user_id=$2', [req.params.id, req.auth!.userId]);
  if (!rows.length) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Transaction not found' } }); return; }
  const reason = String(req.body?.reason ?? 'Needs investigation').slice(0, 300);
  const { rows: ticket } = await db.query(
    `INSERT INTO support_tickets (user_id, subject, priority) VALUES ($1,$2,'high') RETURNING id`,
    [req.auth!.userId, `Dispute — ${rows[0].reference}`]
  );
  await db.query(
    `INSERT INTO support_messages (ticket_id, sender_type, sender_id, body) VALUES ($1,'user',$2,$3)`,
    [ticket[0].id, req.auth!.userId, `I'd like to dispute transaction ${rows[0].reference}: ${reason}`]
  );
  res.status(201).json({ ticketId: ticket[0].id });
}));
