import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { requireAuth } from '../middleware/auth';
import { parse } from '../lib/validate';

export const notificationsRouter = Router();
const wrap = (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

notificationsRouter.get('/', requireAuth, wrap(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit ?? 30), 1), 100);
  const { rows } = await db.query(
    `SELECT id, type, title, body, read_at, created_at FROM notifications WHERE user_id=$1
     ORDER BY created_at DESC LIMIT $2`,
    [req.auth!.userId, limit]
  );
  const { rows: unread } = await db.query<{ c: string }>('SELECT count(*)::text c FROM notifications WHERE user_id=$1 AND read_at IS NULL', [req.auth!.userId]);
  res.json({ items: rows, unreadCount: Number(unread[0].c) });
}));

notificationsRouter.post('/:id/read', requireAuth, wrap(async (req, res) => {
  await db.query('UPDATE notifications SET read_at=now() WHERE id=$1 AND user_id=$2', [req.params.id, req.auth!.userId]);
  res.status(204).end();
}));

notificationsRouter.post('/read-all', requireAuth, wrap(async (req, res) => {
  await db.query('UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL', [req.auth!.userId]);
  res.status(204).end();
}));

notificationsRouter.get('/prefs', requireAuth, wrap(async (req, res) => {
  const { rows } = await db.query('SELECT prefs FROM notification_prefs WHERE user_id=$1', [req.auth!.userId]);
  res.json({ prefs: rows[0]?.prefs ?? { push: true, email: true, sms: false, marketing: false } });
}));

notificationsRouter.patch('/prefs', requireAuth, wrap(async (req, res) => {
  const b = parse(z.object({
    push: z.boolean().optional(), email: z.boolean().optional(), sms: z.boolean().optional(), marketing: z.boolean().optional()
  }), req.body);
  await db.query(
    `INSERT INTO notification_prefs (user_id, prefs) VALUES ($1,$2)
     ON CONFLICT (user_id) DO UPDATE SET prefs = notification_prefs.prefs || $2, updated_at=now()`,
    [req.auth!.userId, JSON.stringify(b)]
  );
  res.json({ ok: true });
}));
