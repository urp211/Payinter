/**
 * Admin API — every route is permission-checked (RBAC) and audit-logged.
 * Roles: super_admin | finance_admin | compliance_admin | operations_admin | support_agent | read_only
 */
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db } from '../../db';
import { config } from '../../config';
import { hashPassword, verifyPassword } from '../../lib/crypto';
import { signAccess } from '../../lib/jwt';
import { randomToken, sha256, reference } from '../../lib/ids';
import { errors } from '../../lib/errors';
import { parse } from '../../lib/validate';
import { requireAdmin, hasPermission } from '../../middleware/auth';
import { authRateLimit } from '../../middleware/rateLimit';
import { audit } from '../../services/audit';
import { reconcile, post, walletAccount, sysAccount } from '../../services/ledger';
import { calculateFee, listFeeRules } from '../../services/fees';
import { listRates, setManualRate, listCurrencies } from '../../services/fx';
import { broadcast, notify } from '../../services/notifications';
import { settleGeneric } from '../payments';

export const adminRouter = Router();
const wrap = (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

const auditAdmin = (req: Request, action: string, entity: string, entityId?: string | number | null, metadata?: Record<string, unknown>) =>
  audit({ actorType: 'admin', actorId: req.auth!.userId, actorLabel: req.auth!.role, action, entity, entityId, ip: req.ip, metadata });

// ============================== AUTH ==============================
adminRouter.post('/auth/login', authRateLimit, wrap(async (req, res) => {
  const b = parse(z.object({ email: z.string().email().transform((s) => s.toLowerCase()), password: z.string().min(1) }), req.body);
  const { rows } = await db.query('SELECT * FROM admin_users WHERE lower(email)=lower($1)', [b.email]);
  const admin = rows[0];
  if (!admin || admin.status !== 'active' || !(await verifyPassword(b.password, admin.password_hash))) {
    throw errors.unauthorized('Invalid credentials');
  }
  await db.query('UPDATE admin_users SET last_login_at=now() WHERE id=$1', [admin.id]);
  await audit({ actorType: 'admin', actorId: admin.id, actorLabel: admin.email, action: 'admin.login', entity: 'admin_user', entityId: admin.id, ip: req.ip });
  res.json({
    admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
    tokens: { accessToken: signAccess({ sub: admin.id, scope: 'admin', role: admin.role }), refreshToken: randomToken(48), expiresIn: config.jwt.accessTtlSeconds }
  });
}));

adminRouter.get('/me', requireAdmin(), wrap(async (req, res) => {
  const { rows } = await db.query('SELECT id, email, name, role, status, last_login_at FROM admin_users WHERE id=$1', [req.auth!.userId]);
  const r = rows[0];
  res.json({ ...r, roleLabel: roleLabels(r.role) });
}));

// ============================== STATS ==============================
adminRouter.get('/stats/overview', requireAdmin('stats:read'), wrap(async (_req, res) => {
  const [u, t24, t7, pending, fraud, kyc, sums] = await Promise.all([
    db.query<{ c: string; v: string }>("SELECT count(*)::text c, count(*) FILTER (WHERE kyc_status='verified')::text v FROM users"),
    db.query<{ c: string; vol: string }>("SELECT count(*)::text c, COALESCE(sum(amount_minor),0)::text vol FROM transactions WHERE created_at > now() - interval '24 hours' AND status='completed'"),
    db.query<{ c: string; vol: string }>("SELECT count(*)::text c, COALESCE(sum(amount_minor),0)::text vol FROM transactions WHERE created_at > now() - interval '7 days' AND status='completed'"),
    db.query<{ c: string }>("SELECT count(*)::text c FROM transactions WHERE status IN ('pending','pending_review')"),
    db.query<{ c: string }>("SELECT count(*)::text c FROM fraud_alerts WHERE status='open'"),
    db.query<{ s: string; c: string }>('SELECT kyc_status s, count(*)::text c FROM users GROUP BY kyc_status'),
    db.query<{ day: string; c: string; vol: string }>(
      `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, count(*)::text AS c, COALESCE(sum(amount_minor),0)::text AS vol
       FROM transactions WHERE created_at > now() - interval '14 days' AND status='completed'
       GROUP BY 1 ORDER BY 1`
    )
  ]);
  const { rows: fees } = await db.query<{ vol: string }>(
    `SELECT COALESCE(sum(balance_minor),0)::text vol FROM ledger_accounts WHERE type='revenue'`
  );
  res.json({
    users: Number(u.rows[0].c),
    verifiedUsers: Number(u.rows[0].v),
    txns24h: Number(t24.rows[0].c),
    volume24hMinor: Number(t24.rows[0].vol),
    txns7d: Number(t7.rows[0].c),
    volume7dMinor: Number(t7.rows[0].vol),
    pendingTxns: Number(pending.rows[0].c),
    openFraudAlerts: Number(fraud.rows[0].c),
    feeRevenueMinor: Number(fees[0].vol),
    kycBreakdown: kyc.rows.map((r) => ({ status: r.s, count: Number(r.c) })),
    daily: sums.rows.map((r) => ({ day: r.day, txns: Number(r.c), volumeMinor: Number(r.vol) }))
  });
}));

// ============================== USERS ==============================
adminRouter.get('/users', requireAdmin('users:read'), wrap(async (req, res) => {
  const q = String(req.query.q ?? '').trim().toLowerCase();
  const status = String(req.query.status ?? 'all');
  const conds: string[] = [];
  const params: unknown[] = [];
  if (status !== 'all') { params.push(status); conds.push(`status=$${params.length}`); }
  if (q) { params.push(`%${q}%`); conds.push(`(lower(email) LIKE $${params.length} OR lower(paytag) LIKE $${params.length} OR lower(first_name||' '||COALESCE(last_name,'')) LIKE $${params.length})`); }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  const { rows } = await db.query(`SELECT * FROM users ${where} ORDER BY created_at DESC LIMIT 100`, params);
  res.json({
    items: rows.map((u: any) => ({
      id: u.id, email: u.email, phone: u.phone, paytag: u.paytag, status: u.status,
      countryCode: u.country_code, firstName: u.first_name, lastName: u.last_name,
      kycStatus: u.kyc_status, emailVerified: u.email_verified, createdAt: u.created_at, lastLoginAt: u.last_login_at
    }))
  });
}));

adminRouter.get('/users/:id', requireAdmin('users:read'), wrap(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM users WHERE id=$1', [req.params.id]);
  if (!rows.length) throw errors.notFound('User');
  const u = rows[0];
  const [bal, sessions, txns, notif] = await Promise.all([
    db.query('SELECT wb.currency, wb.available_minor, wb.pending_minor FROM wallets w JOIN wallet_balances wb ON wb.wallet_id=w.id WHERE w.user_id=$1 ORDER BY wb.currency', [u.id]),
    db.query('SELECT id, device_id, platform, ip, created_at, last_used_at, revoked_at FROM user_sessions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 10', [u.id]),
    db.query('SELECT count(*)::text c, COALESCE(sum(amount_minor),0)::text vol FROM transactions WHERE user_id=$1', [u.id]),
    db.query('SELECT id, type, title, created_at FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 5', [u.id])
  ]);
  res.json({
    ...{
      id: u.id, email: u.email, phone: u.phone, paytag: u.paytag, status: u.status,
      countryCode: u.country_code, firstName: u.first_name, lastName: u.last_name,
      kycStatus: u.kyc_status, kycRejectionReason: u.kyc_rejection_reason, emailVerified: u.email_verified,
      createdAt: u.created_at, lastLoginAt: u.last_login_at
    },
    balances: bal.rows, sessions: sessions.rows,
    activity: { txnCount: Number(txns.rows[0].c), volumeMinor: Number(txns.rows[0].vol) },
    recentNotifications: notif.rows
  });
}));

adminRouter.post('/users/:id/status', requireAdmin('users:write'), wrap(async (req, res) => {
  const b = parse(z.object({ status: z.enum(['active', 'suspended']), reason: z.string().min(3).max(300).optional() }), req.body);
  const { rowCount } = await db.query('UPDATE users SET status=$2, updated_at=now() WHERE id=$1', [req.params.id, b.status]);
  if (!rowCount) throw errors.notFound('User');
  await auditAdmin(req, `admin.user.${b.status === 'suspended' ? 'suspend' : 'reactivate'}`, 'user', req.params.id, { reason: b.reason });
  if (b.status === 'suspended') await notify(req.params.id, 'security', 'Account suspended', `Your account was suspended by compliance. Reason: ${b.reason ?? 'policy review'}`);
  res.json({ ok: true, status: b.status });
}));

// ============================== KYC ==============================
adminRouter.get('/kyc', requireAdmin('kyc:read'), wrap(async (req, res) => {
  const status = String(req.query.status ?? 'submitted');
  const { rows } = await db.query(
    `SELECT k.*, u.email, u.first_name, u.last_name, u.kyc_status AS user_status FROM kyc_submissions k
     JOIN users u ON u.id=k.user_id
     WHERE ${status === 'all' ? 'true' : 'k.status=$1'} ORDER BY k.created_at DESC LIMIT 100`,
    status === 'all' ? [] : [status]
  );
  res.json({ items: rows });
}));

adminRouter.post('/kyc/:id/review', requireAdmin('kyc:write'), wrap(async (req, res) => {
  const b = parse(z.object({
    decision: z.enum(['verified', 'rejected', 'requires_info']),
    reason: z.string().max(300).optional()
  }), req.body);
  if (b.decision !== 'verified' && !b.reason) throw errors.validation('reason required for rejection / info request');
  const { rows } = await db.query(
    `UPDATE kyc_submissions SET status=$2, reviewed_by=$3, reviewed_at=now(), rejection_reason=$4
     WHERE id=$1 AND status IN ('submitted','requires_info') RETURNING *`,
    [req.params.id, b.decision, req.auth!.role, b.decision === 'verified' ? null : b.reason]
  );
  const sub = rows[0];
  if (!sub) throw errors.validation('Submission not pending review');
  await db.query('UPDATE users SET kyc_status=$2, kyc_rejection_reason=$3, updated_at=now() WHERE id=$1', [sub.user_id, b.decision, b.decision === 'verified' ? null : b.reason]);
  await notify(sub.user_id, 'kyc',
    b.decision === 'verified' ? 'Identity verified 🎉' : b.decision === 'rejected' ? 'Verification rejected' : 'More info needed',
    b.decision === 'verified' ? 'Full access unlocked: international payments & card top ups.'
    : b.decision === 'rejected' ? `Reason: ${b.reason}. You can resubmit from your profile.`
    : `Our team needs more information: ${b.reason}`);
  await auditAdmin(req, 'admin.kyc.review', 'kyc_submission', req.params.id, { decision: b.decision });
  res.json({ ok: true, decision: b.decision });
}));

// ============================== TRANSACTIONS / REFUNDS ==============================
adminRouter.get('/transactions', requireAdmin('transactions:read'), wrap(async (req, res) => {
  const { status, type, q } = req.query as Record<string, string | undefined>;
  const limit = Math.min(Math.max(Number(req.query.limit ?? 50), 1), 200);
  const conds: string[] = ['true'];
  const params: unknown[] = [];
  if (status && status !== 'all') { params.push(status); conds.push(`t.status=$${params.length}`); }
  if (type && type !== 'all') { params.push(type); conds.push(`t.type=$${params.length}`); }
  if (q && q.trim()) { params.push(`%${q.trim().toLowerCase()}%`); conds.push(`(lower(t.reference) LIKE $${params.length} OR lower(u.email) LIKE $${params.length})`); }
  const { rows } = await db.query(
    `SELECT t.*, u.email AS user_email, u.paytag AS user_paytag
     FROM transactions t JOIN users u ON u.id=t.user_id
     WHERE ${conds.join(' AND ')} ORDER BY t.created_at DESC LIMIT ${limit}`,
    params
  );
  res.json({
    items: rows.map((t: any) => ({
      id: t.id, userEmail: t.user_email, userPaytag: t.user_paytag, reference: t.reference, type: t.type,
      status: t.status, amountMinor: Number(t.amount_minor), currency: t.currency, feeMinor: Number(t.fee_minor),
      description: t.description, counterpartyName: t.counterparty_name, paymentProvider: t.payment_provider,
      failureCode: t.failure_code, createdAt: t.created_at, completedAt: t.completed_at, ledgerTxId: t.ledger_tx_id,
      refundedAmountMinor: t.refunded_amount_minor != null ? Number(t.refunded_amount_minor) : 0
    }))
  });
}));

adminRouter.post('/transactions/:id/refund', requireAdmin('refunds:write'), wrap(async (req, res) => {
  const b = parse(z.object({ amountMinor: z.number().int().min(1).optional(), reason: z.string().min(3).max(300) }), req.body);
  const { rows } = await db.query('SELECT * FROM transactions WHERE id=$1', [req.params.id]);
  const t = rows[0];
  if (!t) throw errors.notFound('Transaction');
  if (t.status !== 'completed') throw errors.validation('Only completed transactions can be refunded');
  if (!['send', 'card_topup', 'international', 'qr_pay', 'bank_topup', 'mobile_money'].includes(t.type)) {
    throw errors.validation(`Type ${t.type} cannot be refunded via this tool`);
  }
  const already = Number(t.refunded_amount_minor ?? 0);
  const refundable = Number(t.amount_minor) - already;
  const amt = b.amountMinor ?? refundable;
  if (amt <= 0 || amt > refundable) throw errors.validation(`Refund amount must be 1..${refundable}`);

  const refundRef = reference('RFD');
  const counterparty = t.counterparty_name ?? 'counterparty';
  const wallet = walletAccount(t.user_id, t.currency);
  await post({
    userId: t.user_id,
    type: 'refund',
    description: `Refund of ${t.reference} — ${b.reason}`,
    reference: refundRef,
    legs: [
      { accountCode: sysAccount('clearing', t.currency), currency: t.currency, amountMinor: amt, direction: 'debit' },
      { accountCode: wallet, currency: t.currency, amountMinor: amt, direction: 'credit' }
    ],
    meta: { refundOf: t.id, reason: b.reason }
  });
  await db.query(
    'UPDATE transactions SET refunded_amount_minor=COALESCE(refunded_amount_minor,0)+$2, updated_at=now() WHERE id=$1',
    [t.id, amt]
  );
  await notify(t.user_id, 'refund', 'Refund issued', `We returned funds for ${t.reference} (${counterparty}). Reason: ${b.reason}`);
  await auditAdmin(req, 'admin.transaction.refund', 'transaction', t.id, { amountMinor: amt, reason: b.reason });
  res.json({ ok: true, refundedAmountMinor: amt, reference: refundRef });
}));

// ============================== REVIEW QUEUE / SANDBOX ==============================
adminRouter.get('/review-queue', requireAdmin('review_queue:read'), wrap(async (_req, res) => {
  const { rows } = await db.query(
    `SELECT t.id, t.reference, t.type, t.amount_minor, t.currency, t.created_at, u.email,
            (SELECT array_agg(rule) FROM fraud_alerts f WHERE f.transaction_id=t.id) AS rules
     FROM transactions t JOIN users u ON u.id=t.user_id WHERE t.status='pending_review' ORDER BY t.created_at`
  );
  res.json({ items: rows });
}));

adminRouter.post('/review-queue/:id/release', requireAdmin('review_queue:write'), wrap(async (req, res) => {
  const { rows } = await db.query("SELECT * FROM transactions WHERE id=$1 AND status='pending_review'", [req.params.id]);
  if (!rows.length) throw errors.notFound('Queued transaction');
  await settleGeneric(rows[0], 'completed');
  await db.query("UPDATE fraud_alerts SET status='resolved', resolved_at=now(), resolved_by=$2 WHERE transaction_id=$1", [req.params.id, req.auth!.role]);
  await auditAdmin(req, 'admin.review.release', 'transaction', req.params.id);
  res.json({ ok: true, outcome: 'completed' });
}));

adminRouter.post('/review-queue/:id/reject', requireAdmin('review_queue:write'), wrap(async (req, res) => {
  const b = parse(z.object({ reason: z.string().min(3).max(300) }), req.body);
  const { rows } = await db.query("SELECT * FROM transactions WHERE id=$1 AND status='pending_review'", [req.params.id]);
  if (!rows.length) throw errors.notFound('Queued transaction');
  await settleGeneric(rows[0], 'failed');
  await db.query('UPDATE transactions SET failure_message=$2 WHERE id=$1', [req.params.id, `Compliance rejection: ${b.reason}`]);
  await db.query("UPDATE fraud_alerts SET status='resolved', resolved_at=now(), resolved_by=$2, note=$3 WHERE transaction_id=$1", [req.params.id, req.auth!.role, b.reason]);
  await auditAdmin(req, 'admin.review.reject', 'transaction', req.params.id, { reason: b.reason });
  res.json({ ok: true, outcome: 'failed' });
}));

adminRouter.get('/sandbox/pending', requireAdmin('payments:read'), wrap(async (_req, res) => {
  const { rows } = await db.query(
    `SELECT t.id, t.reference, t.type, t.amount_minor, t.currency, t.created_at, u.email
     FROM transactions t JOIN users u ON u.id=t.user_id
     WHERE t.status='pending' AND t.sandbox ORDER BY t.created_at DESC LIMIT 100`
  );
  res.json({ items: rows });
}));

adminRouter.post('/sandbox/settle', requireAdmin('payments:write'), wrap(async (req, res) => {
  const b = parse(z.object({ transactionId: z.string().uuid(), outcome: z.enum(['completed', 'failed']) }), req.body);
  const { rows } = await db.query('SELECT * FROM transactions WHERE id=$1', [b.transactionId]);
  if (!rows.length) throw errors.notFound('Transaction');
  await settleGeneric(rows[0], b.outcome);
  await auditAdmin(req, 'admin.sandbox.settle', 'transaction', b.transactionId, { outcome: b.outcome });
  res.json({ ok: true, outcome: b.outcome });
}));

// ============================== FRAUD ==============================
adminRouter.get('/fraud-alerts', requireAdmin('fraud:read'), wrap(async (req, res) => {
  const status = String(req.query.status ?? 'open');
  const { rows } = await db.query(
    `SELECT f.*, u.email, t.reference FROM fraud_alerts f
     JOIN users u ON u.id=f.user_id LEFT JOIN transactions t ON t.id=f.transaction_id
     WHERE ${status === 'all' ? 'true' : 'f.status=$1'} ORDER BY f.created_at DESC LIMIT 100`,
    status === 'all' ? [] : [status]
  );
  res.json({ items: rows });
}));

adminRouter.post('/fraud-alerts/:id/resolve', requireAdmin('fraud:write'), wrap(async (req, res) => {
  const b = parse(z.object({ note: z.string().max(300).optional() }), req.body ?? {});
  const { rowCount } = await db.query(
    `UPDATE fraud_alerts SET status='resolved', resolved_at=now(), resolved_by=$2, note=$3 WHERE id=$1`,
    [req.params.id, req.auth!.role, b.note ?? null]
  );
  if (!rowCount) throw errors.notFound('Alert');
  await auditAdmin(req, 'admin.fraud.resolve', 'fraud_alert', req.params.id);
  res.json({ ok: true });
}));

adminRouter.post('/fraud-alerts/:id/dismiss', requireAdmin('fraud:write'), wrap(async (req, res) => {
  const { rowCount } = await db.query(
    `UPDATE fraud_alerts SET status='dismissed', resolved_at=now(), resolved_by=$2 WHERE id=$1`,
    [req.params.id, req.auth!.role]
  );
  if (!rowCount) throw errors.notFound('Alert');
  await auditAdmin(req, 'admin.fraud.dismiss', 'fraud_alert', req.params.id);
  res.json({ ok: true });
}));

// ============================== FEES / CURRENCIES / FX / PROVIDERS ==============================
adminRouter.get('/fees', requireAdmin('fees:read'), wrap(async (_req, res) => {
  res.json({ items: await listFeeRules() });
}));

adminRouter.post('/fees', requireAdmin('fees:write'), wrap(async (req, res) => {
  const b = parse(z.object({
    kind: z.string().min(2), name: z.string().min(2), currency: z.string().regex(/^[A-Z]{3}$/).nullable().optional(),
    percentBps: z.number().min(0).max(5000), fixedMinor: z.number().int().min(0), minMinor: z.number().int().min(0).default(0),
    maxMinor: z.number().int().positive().nullable().optional(), active: z.boolean().default(true), priority: z.number().int().default(10)
  }), req.body);
  const { rows } = await db.query(
    `INSERT INTO fee_rules (kind, name, currency, percent_bps, fixed_minor, min_minor, max_minor, active, priority)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [b.kind, b.name, b.currency ?? null, b.percentBps, b.fixedMinor, b.minMinor, b.maxMinor ?? null, b.active, b.priority]
  );
  await auditAdmin(req, 'admin.fees.create', 'fee_rule', rows[0].id, b);
  res.status(201).json(rows[0]);
}));

adminRouter.patch('/fees/:id', requireAdmin('fees:write'), wrap(async (req, res) => {
  const b = parse(z.object({
    name: z.string().min(2).optional(), percentBps: z.number().min(0).max(5000).optional(),
    fixedMinor: z.number().int().min(0).optional(), minMinor: z.number().int().min(0).optional(),
    maxMinor: z.number().int().positive().nullable().optional(), active: z.boolean().optional(), priority: z.number().int().optional()
  }), req.body);
  const sets: string[] = [];
  const params: unknown[] = [req.params.id];
  const map: Record<string, string> = { name: 'name', percentBps: 'percent_bps', fixedMinor: 'fixed_minor', minMinor: 'min_minor', maxMinor: 'max_minor', active: 'active', priority: 'priority' };
  for (const [k, col] of Object.entries(map)) {
    if ((b as any)[k] !== undefined) { params.push((b as any)[k]); sets.push(`${col}=$${params.length}`); }
  }
  if (!sets.length) throw errors.validation('nothing to update');
  const { rowCount } = await db.query(`UPDATE fee_rules SET ${sets.join(', ')}, updated_at=now() WHERE id=$1`, params);
  if (!rowCount) throw errors.notFound('Fee rule');
  await auditAdmin(req, 'admin.fees.update', 'fee_rule', req.params.id, b);
  res.json({ ok: true });
}));

adminRouter.get('/currencies', requireAdmin('currencies:read'), wrap(async (_req, res) => {
  res.json({ items: await listCurrencies(false) });
}));

adminRouter.post('/currencies', requireAdmin('currencies:write'), wrap(async (req, res) => {
  const b = parse(z.object({
    code: z.string().regex(/^[A-Z]{3}$/), name: z.string().min(2), symbol: z.string().min(1).max(8),
    decimals: z.number().int().min(0).max(4)
  }), req.body);
  await db.query('INSERT INTO currencies (code, name, symbol, decimals) VALUES ($1,$2,$3,$4)', [b.code, b.name, b.symbol, b.decimals]);
  // auto-provision system accounts for the new currency
  for (const kind of ['CLEARING', 'REVENUE', 'SETTLEMENT', 'SUSPENSE']) {
    await db.query(
      `INSERT INTO ledger_accounts (code, type, currency, is_system, display_name, balance_minor)
       VALUES ($1,$2,$3,true,$4,0) ON CONFLICT DO NOTHING`,
      [`SYS:${kind}:${b.code}`, kind.toLowerCase(), b.code, `System ${kind.toLowerCase()} ${b.code}`]
    );
  }
  await auditAdmin(req, 'admin.currencies.create', 'currency', b.code);
  res.status(201).json({ code: b.code });
}));

adminRouter.patch('/currencies/:code', requireAdmin('currencies:write'), wrap(async (req, res) => {
  const b = parse(z.object({ isActive: z.boolean().optional(), supportsTopup: z.boolean().optional() }), req.body);
  const sets: string[] = [];
  const params: unknown[] = [req.params.code];
  if (b.isActive !== undefined) { params.push(b.isActive); sets.push(`is_active=$${params.length}`); }
  if (b.supportsTopup !== undefined) { params.push(b.supportsTopup); sets.push(`supports_topup=$${params.length}`); }
  if (!sets.length) throw errors.validation('nothing to update');
  const { rowCount } = await db.query(`UPDATE currencies SET ${sets.join(', ')} WHERE code=$1`, params);
  if (!rowCount) throw errors.notFound('Currency');
  await auditAdmin(req, 'admin.currencies.patch', 'currency', req.params.code, b);
  res.json({ ok: true });
}));

adminRouter.get('/fx-rates', requireAdmin('fx:read'), wrap(async (_req, res) => {
  res.json({ items: await listRates() });
}));

adminRouter.post('/fx-rates', requireAdmin('fx:write'), wrap(async (req, res) => {
  const b = parse(z.object({
    base: z.string().regex(/^[A-Z]{3}$/), quote: z.string().regex(/^[A-Z]{3}$/), rate: z.number().positive()
  }), req.body);
  await setManualRate(b.base, b.quote, b.rate);
  await auditAdmin(req, 'admin.fx.set', 'fx_rate', `${b.base}/${b.quote}`, { rate: b.rate });
  res.json({ ok: true });
}));

adminRouter.post('/fx-rates/refresh', requireAdmin('fx:write'), wrap(async (_req, res) => {
  // sandbox: jitter the USD-pairs 0.3% to mimic a live feed pull
  await db.query(
    `UPDATE fx_rates SET rate = rate * (1 + (random()-0.5)*0.006), fetched_at=now(), provider='sandbox', sandbox=true
     WHERE provider = 'sandbox'`
  );
  const { rows } = await db.query<{ c: string }>(`SELECT count(*)::text c FROM fx_rates WHERE sandbox`);
  res.json({ provider: config.providers.fx, updated: Number(rows[0].c) });
}));

adminRouter.get('/providers', requireAdmin('providers:read'), wrap(async (_req, res) => {
  const { rows } = await db.query('SELECT * FROM provider_configs ORDER BY product, provider_key');
  res.json({
    registered: {
      cardProcessors: ['sim_card_processor'],
      internationalProviders: ['wise_sim', 'rapid_sim'],
      bankProviders: ['sim_bank_rails'],
      mobileMoneyProviders: ['sim_mobile_money'],
      configured: { card: config.providers.card, intl: config.providers.intl, fx: config.providers.fx }
    },
    configs: rows
  });
}));

adminRouter.post('/providers/:id/toggle', requireAdmin('providers:write'), wrap(async (req, res) => {
  const { rows } = await db.query('UPDATE provider_configs SET enabled = NOT enabled, updated_at=now() WHERE id=$1 RETURNING *', [req.params.id]);
  if (!rows.length) throw errors.notFound('Provider config');
  await auditAdmin(req, 'admin.providers.toggle', 'provider_config', req.params.id, { enabled: rows[0].enabled });
  res.json({ enabled: rows[0].enabled });
}));

// ============================== CARDS ==============================
adminRouter.get('/cards', requireAdmin('cards:read'), wrap(async (_req, res) => {
  const { rows } = await db.query(
    `SELECT c.*, u.email FROM payment_cards c JOIN users u ON u.id=c.user_id ORDER BY c.created_at DESC LIMIT 100`
  );
  res.json({ items: rows });
}));

adminRouter.post('/cards/:id/status', requireAdmin('cards:write'), wrap(async (req, res) => {
  const b = parse(z.object({ status: z.enum(['active', 'frozen']) }), req.body);
  const { rowCount } = await db.query('UPDATE payment_cards SET status=$2, updated_at=now() WHERE id=$1', [req.params.id, b.status]);
  if (!rowCount) throw errors.notFound('Card');
  await auditAdmin(req, 'admin.cards.status', 'payment_card', req.params.id, { status: b.status });
  res.json({ ok: true });
}));

// ============================== NOTIFICATIONS ==============================
adminRouter.post('/notifications/broadcast', requireAdmin('notifications:write'), wrap(async (req, res) => {
  const b = parse(z.object({ title: z.string().min(3).max(120), body: z.string().min(3).max(1000) }), req.body);
  const sent = await broadcast('broadcast', b.title, b.body);
  await auditAdmin(req, 'admin.notifications.broadcast', 'notification', null, { sent });
  res.json({ sent });
}));

// ============================== SUPPORT ==============================
adminRouter.get('/support/tickets', requireAdmin('support:read'), wrap(async (req, res) => {
  const status = String(req.query.status ?? 'all');
  const { rows } = await db.query(
    `SELECT t.*, u.email,
       (SELECT count(*) FROM support_messages m WHERE m.ticket_id=t.id)::int AS message_count
     FROM support_tickets t JOIN users u ON u.id=t.user_id
     ${status === 'all' ? '' : 'WHERE t.status=$1'} ORDER BY t.updated_at DESC LIMIT 100`,
    status === 'all' ? [] : [status]
  );
  res.json({ items: rows });
}));

adminRouter.get('/support/tickets/:id/messages', requireAdmin('support:read'), wrap(async (req, res) => {
  const { rows: tickets } = await db.query('SELECT t.*, u.email FROM support_tickets t JOIN users u ON u.id=t.user_id WHERE t.id=$1', [req.params.id]);
  if (!tickets.length) throw errors.notFound('Ticket');
  const { rows } = await db.query('SELECT id, sender_type, body, created_at FROM support_messages WHERE ticket_id=$1 ORDER BY created_at', [req.params.id]);
  res.json({ ticket: tickets[0], items: rows });
}));

adminRouter.post('/support/tickets/:id/reply', requireAdmin('support:write'), wrap(async (req, res) => {
  const b = parse(z.object({ body: z.string().min(1).max(4000), status: z.enum(['open', 'pending', 'closed']).optional() }), req.body);
  const { rows: tickets } = await db.query('SELECT user_id FROM support_tickets WHERE id=$1', [req.params.id]);
  if (!tickets.length) throw errors.notFound('Ticket');
  await db.query(
    `INSERT INTO support_messages (ticket_id, sender_type, sender_id, body) VALUES ($1,'support',$2,$3)`,
    [req.params.id, req.auth!.role, b.body]
  );
  await db.query('UPDATE support_tickets SET status=$2, updated_at=now() WHERE id=$1', [req.params.id, b.status ?? 'pending']);
  await notify(tickets[0].user_id, 'support', 'Support replied', 'You have a new message on your support ticket.');
  await auditAdmin(req, 'admin.support.reply', 'support_ticket', req.params.id);
  res.json({ ok: true });
}));

// ============================== ROLES / ADMINS / AUDIT ==============================
const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin', finance_admin: 'Finance Admin', compliance_admin: 'Compliance Admin',
  operations_admin: 'Operations Admin', support_agent: 'Support Agent', read_only: 'Read Only'
};
function roleLabels(role: string) { return ROLE_LABELS[role] ?? role; }

const ROLE_PERM_DOC: Record<string, string[]> = {
  super_admin: ['*'],
  finance_admin: ['stats:read', 'transactions:read', 'transactions:write', 'refunds:write', 'payments:read', 'payments:write', 'fees:read', 'fees:write', 'currencies:read', 'currencies:write', 'fx:read', 'fx:write', 'providers:read', 'providers:write', 'settlements:read', 'reconcile:read', 'audit:read'],
  compliance_admin: ['stats:read', 'users:read', 'users:write', 'kyc:read', 'kyc:write', 'fraud:read', 'fraud:write', 'transactions:read', 'audit:read', 'security:read', 'review_queue:read', 'review_queue:write', 'notifications:read'],
  operations_admin: ['stats:read', 'users:read', 'transactions:read', 'payments:read', 'payments:write', 'cards:read', 'cards:write', 'review_queue:read', 'review_queue:write', 'providers:read', 'currencies:read', 'fx:read', 'fees:read', 'notifications:read', 'notifications:write', 'support:read', 'support:write', 'reconcile:read'],
  support_agent: ['users:read', 'transactions:read', 'support:read', 'support:write', 'kyc:read', 'stats:read'],
  read_only: ['stats:read', 'users:read', 'transactions:read', 'kyc:read', 'fraud:read', 'audit:read', 'support:read', 'fees:read', 'currencies:read', 'fx:read', 'providers:read', 'cards:read']
};

adminRouter.get('/roles', requireAdmin(), wrap(async (_req, res) => {
  res.json({
    roles: Object.entries(ROLE_PERM_DOC).map(([role, permissions]) => ({ role, label: ROLE_LABELS[role], permissions }))
  });
}));

adminRouter.get('/admin-users', requireAdmin(), wrap(async (_req, res) => {
  const { rows } = await db.query('SELECT id, email, name, role, status, last_login_at, created_at FROM admin_users ORDER BY created_at');
  res.json({ items: rows });
}));

adminRouter.post('/admin-users', requireAdmin(), wrap(async (req, res) => {
  if (req.auth!.role !== 'super_admin') throw errors.forbidden('Only super admins create admin accounts');
  const b = parse(z.object({
    email: z.string().email().transform((s) => s.toLowerCase()), name: z.string().min(2),
    password: z.string().min(12), role: z.enum(['super_admin', 'finance_admin', 'compliance_admin', 'operations_admin', 'support_agent', 'read_only'])
  }), req.body);
  const { rows } = await db.query(
    `INSERT INTO admin_users (email, name, password_hash, role) VALUES ($1,$2,$3,$4) RETURNING id, email, name, role`,
    [b.email, b.name, await hashPassword(b.password), b.role]
  );
  await auditAdmin(req, 'admin.admins.create', 'admin_user', rows[0].id, { role: b.role });
  res.status(201).json(rows[0]);
}));

adminRouter.get('/audit-logs', requireAdmin('audit:read'), wrap(async (req, res) => {
  const action = String(req.query.action ?? '');
  const limit = Math.min(Math.max(Number(req.query.limit ?? 80), 1), 200);
  const { rows } = await db.query(
    `SELECT * FROM audit_logs ${action ? 'WHERE action LIKE $1' : ''} ORDER BY created_at DESC LIMIT ${limit}`,
    action ? [`${action}%`] : []
  );
  res.json({ items: rows });
}));

adminRouter.get('/security-events', requireAdmin(), wrap(async (_req, res) => {
  const { rows } = await db.query('SELECT * FROM security_events ORDER BY created_at DESC LIMIT 200');
  res.json({ items: rows });
}));

// ============================== HEALTH / RECONCILE ==============================
adminRouter.get('/reconcile', requireAdmin(), wrap(async (_req, res) => {
  res.json(await reconcile());
}));
