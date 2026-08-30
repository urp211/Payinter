import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { requireAuth } from '../middleware/auth';
import { parse } from '../lib/validate';
import { idempotency } from '../middleware/idempotency';
import { errors } from '../lib/errors';

export const cardsRouter = Router();
const wrap = (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

function out(c: any) {
  return {
    id: c.id, kind: c.kind, brand: c.brand, last4: c.last4,
    expMonth: c.exp_month, expYear: c.exp_year, status: c.status,
    isDefault: c.is_default, label: c.label,
    spendLimitMinor: c.spend_limit_minor != null ? Number(c.spend_limit_minor) : null,
    limitCurrency: c.limit_currency, createdAt: c.created_at
  };
}

cardsRouter.get('/', requireAuth, wrap(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM payment_cards WHERE user_id=$1 ORDER BY is_default DESC, created_at DESC', [req.auth!.userId]);
  res.json({ items: rows.map(out) });
}));

/**
 * Add a card — tokenize-first contract: the client sends a PSP `token`,
 * never PAN/CVV. Demo hints for the sandbox processor: use token
 * `sim_4021` for success, `sim_9995` for decline, `sim_3155` for 3DS.
 */
cardsRouter.post('/', requireAuth, idempotency, wrap(async (req, res) => {
  const b = parse(z.object({
    token: z.string().min(4).max(200),
    brand: z.enum(['Visa', 'Mastercard', 'Amex', 'Unknown']).default('Unknown'),
    last4: z.string().regex(/^\d{4}$/),
    expMonth: z.number().int().min(1).max(12),
    expYear: z.number().int().min(2024).max(2100),
    kind: z.enum(['tokenized', 'virtual', 'physical']).default('tokenized'),
    label: z.string().max(40).default('card')
  }), req.body);
  const { rowCount } = await db.query('SELECT 1 FROM payment_cards WHERE token=$1 AND user_id=$2', [b.token, req.auth!.userId]);
  if (rowCount) throw errors.conflict('Card already added');
  const { rows: count } = await db.query<{ c: string }>('SELECT count(*)::text c FROM payment_cards WHERE user_id=$1', [req.auth!.userId]);
  const isDefault = Number(count[0].c) === 0;
  const { rows } = await db.query(
    `INSERT INTO payment_cards (user_id, token, brand, last4, exp_month, exp_year, kind, label, is_default)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [req.auth!.userId, b.token, b.brand, b.last4, b.expMonth, b.expYear, b.kind, b.label, isDefault]
  );
  res.status(201).json(out(rows[0]));
}));

async function setStatus(req: Request, id: string, status: 'frozen' | 'active') {
  const { rowCount, rows } = await db.query(
    'UPDATE payment_cards SET status=$3, updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING *',
    [id, req.auth!.userId, status]
  );
  if (!rowCount) throw errors.notFound('Card');
  return rows[0];
}

cardsRouter.post('/:id/freeze', requireAuth, wrap(async (req, res) => {
  const c = await setStatus(req, req.params.id, 'frozen');
  res.json(out(c));
}));
cardsRouter.post('/:id/unfreeze', requireAuth, wrap(async (req, res) => {
  const c = await setStatus(req, req.params.id, 'active');
  res.json(out(c));
}));

cardsRouter.post('/:id/default', requireAuth, wrap(async (req, res) => {
  await db.transaction(async (q) => {
    await q.query('UPDATE payment_cards SET is_default=false WHERE user_id=$1', [req.auth!.userId]);
    await q.query('UPDATE payment_cards SET is_default=true WHERE id=$1 AND user_id=$2', [req.params.id, req.auth!.userId]);
  });
  res.status(204).end();
}));
