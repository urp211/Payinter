import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { requireAuth } from '../middleware/auth';

export const usersRouter = Router();
const wrap = (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

usersRouter.get('/lookup', requireAuth, wrap(async (req, res) => {
  const id = String(req.query.identifier ?? '').trim().replace(/^@/, '');
  if (!id || id.length < 3) { res.json({ found: false }); return; }
  const { rows } = await db.query(
    `SELECT paytag, first_name, last_name, country_code FROM users
     WHERE id<>$1 AND status='active' AND (
       lower(paytag)=lower($2) OR lower(email)=lower($2) OR phone=$2 OR paytag=$2
     ) LIMIT 1`,
    [req.auth!.userId, id]
  );
  if (!rows.length) { res.json({ found: false }); return; }
  const r = rows[0];
  res.json({ found: true, user: { paytag: r.paytag, firstName: r.first_name, lastName: r.last_name, countryCode: r.country_code } });
}));
