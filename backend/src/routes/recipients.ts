import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { requireAuth } from '../middleware/auth';
import { parse, countyCode2 } from '../lib/validate';
import { idempotency } from '../middleware/idempotency';
import { errors } from '../lib/errors';

export const recipientsRouter = Router();
const wrap = (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

function out(r: any) {
  return {
    id: r.id, type: r.type, nickname: r.nickname ?? undefined, fullName: r.full_name,
    countryCode: r.country_code, currency: r.currency, details: r.details,
    isFavorite: r.is_favorite, createdAt: r.created_at
  };
}

recipientsRouter.get('/', requireAuth, wrap(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM recipients WHERE user_id=$1 ORDER BY is_favorite DESC, updated_at DESC LIMIT 100', [req.auth!.userId]);
  res.json({ items: rows.map(out) });
}));

recipientsRouter.post('/', requireAuth, idempotency, wrap(async (req, res) => {
  const b = parse(z.object({
    type: z.enum(['internal', 'international', 'bank_account']).default('international'),
    fullName: z.string().min(2).max(120),
    nickname: z.string().max(40).optional(),
    countryCode: countyCode2,
    currency: z.string().regex(/^[A-Z]{3}$/),
    details: z.record(z.any()).default({})
  }), req.body);
  // light validation of bank details (IBAN may contain spaces; never a card PAN)
  const iban = typeof b.details.iban === 'string' ? b.details.iban.replace(/\s/g, '') : undefined;
  if (b.type === 'international' && iban && (iban.length < 8 || iban.length > 34 || /^\d{13,19}$/.test(iban))) {
    throw errors.validation('Invalid IBAN/account identifier');
  }
  const { rows } = await db.query(
    `INSERT INTO recipients (user_id, type, full_name, nickname, country_code, currency, details)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [req.auth!.userId, b.type, b.fullName, b.nickname ?? null, b.countryCode, b.currency,
     JSON.stringify({ ...b.details, ...(iban ? { iban } : {}) })]
  );
  res.status(201).json({ recipient: out(rows[0]) });
}));

recipientsRouter.patch('/:id', requireAuth, wrap(async (req, res) => {
  const b = parse(z.object({
    nickname: z.string().max(40).optional(), isFavorite: z.boolean().optional(), fullName: z.string().min(2).max(120).optional()
  }), req.body);
  const sets: string[] = [];
  const params: unknown[] = [req.params.id, req.auth!.userId];
  if (b.nickname !== undefined) { params.push(b.nickname); sets.push(`nickname=$${params.length}`); }
  if (b.fullName !== undefined) { params.push(b.fullName); sets.push(`full_name=$${params.length}`); }
  if (b.isFavorite !== undefined) { params.push(b.isFavorite); sets.push(`is_favorite=$${params.length}`); }
  if (!sets.length) throw errors.validation('nothing to update');
  const { rows } = await db.query(
    `UPDATE recipients SET ${sets.join(', ')}, updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING *`,
    params
  );
  if (!rows.length) throw errors.notFound('Recipient');
  res.json({ recipient: out(rows[0]) });
}));

recipientsRouter.delete('/:id', requireAuth, wrap(async (req, res) => {
  const { rowCount } = await db.query('DELETE FROM recipients WHERE id=$1 AND user_id=$2', [req.params.id, req.auth!.userId]);
  if (!rowCount) throw errors.notFound('Recipient');
  res.status(204).end();
}));
