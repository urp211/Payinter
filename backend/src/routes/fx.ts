import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { listRates, getRate, convert } from '../services/fx';
import { requireAuth } from '../middleware/auth';
import { parse } from '../lib/validate';

export const fxRouter = Router();
const wrap = (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

fxRouter.get('/rates', wrap(async (req, res) => {
  const base = typeof req.query.base === 'string' && /^[A-Z]{3}$/.test(req.query.base) ? req.query.base : 'USD';
  const rows = await listRates(base);
  res.json({ base, pairs: rows.map((r: any) => ({ base: r.base, quote: r.quote, rate: Number(r.rate), provider: r.provider, sandbox: r.sandbox, fetchedAt: r.fetched_at })), sandbox: rows[0]?.sandbox ?? true });
}));

fxRouter.get('/quote', requireAuth, wrap(async (req, res) => {
  const b = parse(z.object({ from: z.string().regex(/^[A-Z]{3}$/), to: z.string().regex(/^[A-Z]{3}$/), amountMinor: z.number().int().min(1) }), req.query);
  const c = await convert(b.from, b.to, b.amountMinor);
  res.json({ from: b.from, to: b.to, amountMinor: b.amountMinor, receiveMinor: c.quoteMinor, rate: c.rateInfo.rate, provider: c.rateInfo.provider, sandbox: c.rateInfo.sandbox, fetchedAt: c.rateInfo.fetchedAt });
}));
