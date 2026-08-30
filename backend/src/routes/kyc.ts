import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { requireAuth, currentUser } from '../middleware/auth';
import { parse, countyCode2 } from '../lib/validate';
import { idempotency } from '../middleware/idempotency';
import { notify } from '../services/notifications';
import { audit } from '../services/audit';

export const kycRouter = Router();
const wrap = (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

/**
 * KYC submission — clearly a SIMULATION of an identity check. In production
 * this posts to a licensed KYC vendor; storage mirrors only what the flow
 * needs. users.kyc_status never becomes 'verified' here; review happens in
 * the admin console.
 */
kycRouter.post('/submit', requireAuth, idempotency, wrap(async (req, res) => {
  const b = parse(z.object({
    documentType: z.enum(['passport', 'national_id', 'drivers_license']),
    documentNumber: z.string().min(4).max(60),
    documentCountry: countyCode2
  }), req.body);
  const user = await currentUser(req);
  await db.transaction(async (q) => {
    await q.query(
      `INSERT INTO kyc_submissions (user_id, document_type, document_number, document_country, status)
       VALUES ($1,$2,$3,$4,'submitted')`,
      [user.id, b.documentType, b.documentNumber, b.documentCountry]
    );
    await q.query("UPDATE users SET kyc_status='submitted', updated_at=now() WHERE id=$1", [user.id]);
  });
  await notify(user.id, 'kyc', 'Documents received', 'Your identity documents are under review.');
  await audit({ actorType: 'user', actorId: user.id, action: 'kyc.submit', entity: 'kyc_submission', metadata: { documentType: b.documentType } });
  res.status(201).json({ status: 'submitted', note: 'Sandbox simulation — a reviewer (admin console) will decide.' });
}));

kycRouter.get('/', requireAuth, wrap(async (req, res) => {
  const { rows } = await db.query(
    'SELECT document_type, document_country, status, rejection_reason, created_at, reviewed_at FROM kyc_submissions WHERE user_id=$1 ORDER BY created_at DESC',
    [req.auth!.userId]
  );
  const u = await currentUser(req);
  res.json({
    current: { status: u.kyc_status, rejectionReason: u.kyc_rejection_reason },
    tiers: [
      { level: 'Basic', desc: 'Sign up', limit: 'P2P up to $1,000/mo' },
      { level: 'Standard', desc: 'Identity verified', limit: '$10,000/mo · International & cards' },
      { level: 'Plus', desc: 'Address verified', limit: 'Higher limits' }
    ],
    submissions: rows
  });
}));
