import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { requireAuth, currentUser } from '../middleware/auth';

export const privacyRouter = Router();
const wrap = (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

/** Data-protection export: everything we store about the user. */
privacyRouter.get('/export', requireAuth, wrap(async (req, res) => {
  const u = await currentUser(req);
  const [wallet, txs, cards, recs, kyc, sessions] = await Promise.all([
    db.query('SELECT wb.currency, wb.available_minor, wb.pending_minor FROM wallets w JOIN wallet_balances wb ON wb.wallet_id=w.id WHERE w.user_id=$1', [u.id]),
    db.query('SELECT reference, type, status, amount_minor, currency, fee_minor, created_at, completed_at FROM transactions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 10000', [u.id]),
    db.query('SELECT brand, last4, kind, status, exp_month, exp_year, created_at FROM payment_cards WHERE user_id=$1', [u.id]),
    db.query('SELECT type, full_name, nickname, country_code, currency, details, created_at FROM recipients WHERE user_id=$1', [u.id]),
    db.query('SELECT document_type, document_country, status, created_at, reviewed_at FROM kyc_submissions WHERE user_id=$1', [u.id]),
    db.query('SELECT device_id, platform, ip, created_at, last_used_at, revoked_at FROM user_sessions WHERE user_id=$1', [u.id])
  ]);
  res.json({
    exportedAt: new Date().toISOString(),
    profile: {
      email: u.email, phone: u.phone, paytag: u.paytag, countryCode: u.country_code,
      firstName: u.first_name, lastName: u.last_name, emailVerified: u.email_verified,
      kycStatus: u.kyc_status, status: u.status, createdAt: u.created_at
    },
    wallet: wallet.rows,
    transactions: txs.rows,
    cards: cards.rows,
    recipients: recs.rows,
    kycSubmissions: kyc.rows,
    sessions: sessions.rows
  });
}));

/** Card statement (JSON). */
privacyRouter.get('/cards/:id/statement', requireAuth, wrap(async (req, res) => {
  const { rows: cards } = await db.query('SELECT * FROM payment_cards WHERE id=$1 AND user_id=$2', [req.params.id, req.auth!.userId]);
  if (!cards.length) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Card not found' } }); return; }
  const days = Math.min(Number(req.query.days ?? 90), 730);
  const { rows } = await db.query(
    `SELECT reference, type, status, amount_minor, currency, fee_minor, created_at, completed_at
     FROM transactions WHERE user_id=$1 AND counterparty_ref=$2 AND created_at > now() - ($3 || ' days')::interval
     ORDER BY created_at DESC`,
    [req.auth!.userId, cards[0].id, String(days)]
  );
  res.json({ card: { brand: cards[0].brand, last4: cards[0].last4 }, days, items: rows });
}));
