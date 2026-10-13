import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { requireAuth } from '../middleware/auth';
import { parse } from '../lib/validate';
import { idempotency } from '../middleware/idempotency';
import { errors } from '../lib/errors';

export const supportRouter = Router();
const wrap = (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

supportRouter.get('/tickets', requireAuth, wrap(async (req, res) => {
  const { rows } = await db.query(
    `SELECT t.*, (SELECT count(*) FROM support_messages m WHERE m.ticket_id=t.id)::int AS message_count
     FROM support_tickets t WHERE t.user_id=$1 ORDER BY updated_at DESC LIMIT 50`,
    [req.auth!.userId]
  );
  res.json({ items: rows });
}));

supportRouter.post('/tickets', requireAuth, idempotency, wrap(async (req, res) => {
  const b = parse(z.object({ subject: z.string().min(4).max(160), body: z.string().min(10).max(4000) }), req.body);
  const { rows } = await db.query(
    `INSERT INTO support_tickets (user_id, subject) VALUES ($1,$2) RETURNING *`,
    [req.auth!.userId, b.subject]
  );
  await db.query(
    `INSERT INTO support_messages (ticket_id, sender_type, sender_id, body) VALUES ($1,'user',$2,$3)`,
    [rows[0].id, req.auth!.userId, b.body]
  );
  res.status(201).json(rows[0]);
}));

supportRouter.get('/tickets/:id/messages', requireAuth, wrap(async (req, res) => {
  const { rows: tickets } = await db.query('SELECT * FROM support_tickets WHERE id=$1 AND user_id=$2', [req.params.id, req.auth!.userId]);
  if (!tickets.length) throw errors.notFound('Ticket');
  const { rows } = await db.query(
    'SELECT id, sender_type, body, created_at FROM support_messages WHERE ticket_id=$1 ORDER BY created_at',
    [req.params.id]
  );
  res.json({ ticket: tickets[0], items: rows });
}));

supportRouter.post('/tickets/:id/messages', requireAuth, wrap(async (req, res) => {
  const b = parse(z.object({ body: z.string().min(1).max(4000) }), req.body);
  const { rows: tickets } = await db.query('SELECT status FROM support_tickets WHERE id=$1 AND user_id=$2', [req.params.id, req.auth!.userId]);
  if (!tickets.length) throw errors.notFound('Ticket');
  if (tickets[0].status === 'closed') throw errors.validation('Ticket is closed');
  const { rows } = await db.query(
    `INSERT INTO support_messages (ticket_id, sender_type, sender_id, body) VALUES ($1,'user',$2,$3) RETURNING *`,
    [req.params.id, req.auth!.userId, b.body]
  );
  await db.query('UPDATE support_tickets SET updated_at=now() WHERE id=$1', [req.params.id]);
  res.status(201).json(rows[0]);
}));

const FAQ = [
  { q: 'When is my transaction PIN required?', a: 'Sending money, card top-ups and international payments always ask for your 4-digit PIN (or biometrics). Never share it — PayInter staff will never ask.' },
  { q: 'Why is my payment "under review"?', a: 'Velocity or amount rules flagged it for a human review — usually resolved within 24h. Your money stays in your wallet until release.' },
  { q: 'What happens if an international transfer fails?', a: 'Funds are released back to your wallet immediately and the fee is refunded. You receive a notification with the reason.' },
  { q: 'Is this a real bank?', a: 'This build is a clearly-marked sandbox — demo money only, no real payments are processed. In production PayInter operates with licensed partners per corridor.' },
  { q: 'How do I verify my identity?', a: 'Profile → Identity verification submits your document for review. International payments and card top-ups unlock at the Standard tier.' }
];

supportRouter.get('/faq', requireAuth, wrap(async (_req, res) => {
  res.json({ items: FAQ });
}));
