import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { config } from '../config';
import { hashPassword, verifyPassword, hashPin, verifyPin, otpCode } from '../lib/crypto';
import { signAccess } from '../lib/jwt';
import { randomToken, sha256, paytag as makePaytag } from '../lib/ids';
import { ApiError, errors } from '../lib/errors';
import { parse, emailSchema, passwordSchema, phoneSchema, countyCode2, pinSchema } from '../lib/validate';
import { requireAuth, currentUser } from '../middleware/auth';
import { authRateLimit, otpRateLimit } from '../middleware/rateLimit';
import { provisionWallet } from '../services/wallet';
import { audit, securityEvent } from '../services/audit';
import { notify } from '../services/notifications';

export const authRouter = Router();

const wrap = (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

function sessionTokens(user: { id: string }, scope: 'user' | 'admin', role?: string) {
  return { accessToken: signAccess({ sub: user.id, scope, role }), refreshToken: null as string | null };
}

async function issueTokens(userId: string, req: Request, meta: { platform?: string; deviceId?: string }) {
  const refresh = randomToken(48);
  const accessToken = signAccess({ sub: userId, scope: 'user' });
  const expiresAt = new Date(Date.now() + config.jwt.refreshTtlSeconds * 1000);
  await db.query(
    `INSERT INTO user_sessions (user_id, device_id, platform, ip, user_agent, refresh_token_hash, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [userId, meta.deviceId ?? null, meta.platform ?? (req.headers['x-app-platform'] as string) ?? null,
     req.ip ?? null, req.headers['user-agent'] ?? null, sha256(refresh), expiresAt]
  );
  return { tokens: { accessToken, refreshToken: refresh, expiresIn: config.jwt.accessTtlSeconds } };
}

function profileOut(u: any) {
  return {
    id: u.id,
    email: u.email,
    phone: u.phone ?? undefined,
    paytag: u.paytag,
    status: u.status,
    countryCode: u.country_code,
    emailVerified: u.email_verified,
    hasPin: !!u.pin_hash,
    firstName: u.first_name,
    lastName: u.last_name,
    profile: { firstName: u.first_name, lastName: u.last_name, countryCode: u.country_code },
    kyc: { status: u.kyc_status, rejectionReason: u.kyc_rejection_reason ?? null },
    createdAt: u.created_at
  };
}

// ------- register -------
const registerSchema = z.object({
  firstName: z.string().min(2).max(60),
  lastName: z.string().min(2).max(60),
  email: emailSchema,
  phone: phoneSchema.optional(),
  password: passwordSchema,
  countryCode: countyCode2
});

authRouter.post('/register', authRateLimit, wrap(async (req, res) => {
  const b = parse(registerSchema, req.body);
  const tag = makePaytag(b.firstName);
  const passwordHash = await hashPassword(b.password);
  const { rows } = await db.query(
    `INSERT INTO users (email, phone, paytag, password_hash, country_code, first_name, last_name)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [b.email, b.phone ?? null, tag, passwordHash, b.countryCode, b.firstName, b.lastName]
  );
  const user = rows[0];
  await provisionWallet(user.id);
  await db.query('INSERT INTO notification_prefs (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [user.id]);
  await securityEvent({ userId: user.id, userEmail: user.email, type: 'register', ip: req.ip });
  await audit({ actorType: 'user', actorId: user.id, actorLabel: user.email, action: 'user.register', entity: 'user', entityId: user.id, ip: req.ip });
  await notify(user.id, 'welcome', 'Welcome to PayInter', 'Verify your email and set a transaction PIN to activate your wallet.');
  const tokens = await issueTokens(user.id, req, {});
  res.status(201).json({ user: profileOut(user), ...tokens });
}));

// ------- login -------
const loginSchema = z.object({ email: emailSchema, password: z.string().min(1), deviceFingerprint: z.string().max(200).optional() });

authRouter.post('/login', authRateLimit, wrap(async (req, res) => {
  const b = parse(loginSchema, req.body);
  const { rows } = await db.query('SELECT * FROM users WHERE lower(email)=lower($1)', [b.email]);
  const user = rows[0];
  if (!user || !(await verifyPassword(b.password, user.password_hash))) {
    await securityEvent({ userEmail: b.email, type: 'login_failed', ip: req.ip });
    throw errors.unauthorized('Invalid email or password');
  }
  if (user.status !== 'active') throw errors.forbidden(`Account ${user.status}`);
  await db.query('UPDATE users SET last_login_at=now() WHERE id=$1', [user.id]);
  await securityEvent({ userId: user.id, userEmail: user.email, type: 'login', ip: req.ip, metadata: { device: b.deviceFingerprint ? 'new' : undefined } });
  const tokens = await issueTokens(user.id, req, { deviceId: b.deviceFingerprint });
  res.json({ user: profileOut(user), ...tokens });
}));

// ------- refresh -------
authRouter.post('/refresh', authRateLimit, wrap(async (req, res) => {
  const token = String(req.body?.refreshToken ?? '');
  if (!token || token.length < 20) throw errors.validation('refreshToken required');
  const hash = sha256(token);
  const { rows } = await db.query(
    `SELECT s.id, s.user_id, s.expires_at, s.revoked_at, u.status FROM user_sessions s
     JOIN users u ON u.id=s.user_id WHERE s.refresh_token_hash=$1`,
    [hash]
  );
  const session = rows[0];
  if (!session || session.revoked_at || new Date(session.expires_at).getTime() < Date.now() || session.status !== 'active') {
    throw errors.tokenExpired();
  }
  const newRefresh = randomToken(48);
  const newExpiry = new Date(Date.now() + config.jwt.refreshTtlSeconds * 1000);
  await db.query(
    'UPDATE user_sessions SET refresh_token_hash=$2, expires_at=$3, last_used_at=now() WHERE id=$1',
    [session.id, sha256(newRefresh), newExpiry]
  );
  res.json({ accessToken: signAccess({ sub: session.user_id, scope: 'user' }), refreshToken: newRefresh, expiresIn: config.jwt.accessTtlSeconds });
}));

// ------- logout -------
authRouter.post('/logout', requireAuth, wrap(async (req, res) => {
  const token = String(req.body?.refreshToken ?? '');
  if (token) {
    await db.query(
      'UPDATE user_sessions SET revoked_at=now() WHERE refresh_token_hash=$1 AND user_id=$2',
      [sha256(token), req.auth!.userId]
    );
  }
  res.status(204).end();
}));

// ------- me -------
authRouter.get('/me', requireAuth, wrap(async (req, res) => {
  const u = await currentUser(req);
  res.json(profileOut(u));
}));

// ------- OTP -------
const requestOtpSchema = z.object({ purpose: z.enum(['verify_email', 'forgot_password', 'login_2fa', 'change_pin']) });

authRouter.post('/request-otp', requireAuth, otpRateLimit, wrap(async (req, res) => {
  const b = parse(requestOtpSchema, req.body);
  const code = config.demoMode ? config.otp.demoCode : otpCode();
  const expiresAt = new Date(Date.now() + config.otp.ttlSeconds * 1000);
  await db.query(
    `INSERT INTO otp_codes (user_id, purpose, code_hash, max_attempts, expires_at)
     VALUES ($1,$2,$3,$4,$5)`,
    [req.auth!.userId, b.purpose, sha256(code + req.auth!.userId), config.otp.maxAttempts, expiresAt]
  );
  await securityEvent({ userId: req.auth!.userId, type: 'otp_requested', ip: req.ip, metadata: { purpose: b.purpose } });
  // In production this goes out via email; demo mode returns it for the sandbox app
  res.json({ sent: true, channel: 'email', expiresInSeconds: config.otp.ttlSeconds, ...(config.demoMode ? { demoCode: code } : {}) });
}));

const verifyOtpSchema = z.object({ code: z.string().regex(/^\d{6}$/), purpose: z.enum(['verify_email', 'forgot_password', 'login_2fa', 'change_pin']) });

authRouter.post('/verify-otp', requireAuth, wrap(async (req, res) => {
  const b = parse(verifyOtpSchema, req.body);
  const { rows } = await db.query(
    `SELECT id, attempts, max_attempts, expires_at, consumed_at FROM otp_codes
     WHERE user_id=$1 AND purpose=$2 AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1`,
    [req.auth!.userId, b.purpose]
  );
  const otp = rows[0];
  if (!otp || otp.consumed_at || new Date(otp.expires_at).getTime() < Date.now()) {
    throw errors.validation('Code expired — request a new one');
  }
  if (otp.attempts >= otp.max_attempts) throw errors.validation('Too many attempts — request a new code');
  const hash = sha256(b.code + req.auth!.userId);
  const { rows: found } = await db.query('SELECT id FROM otp_codes WHERE id=$1 AND code_hash=$2', [otp.id, hash]);
  if (!found.length) {
    await db.query('UPDATE otp_codes SET attempts=attempts+1 WHERE id=$1', [otp.id]);
    throw errors.validation('Invalid code', { attemptsLeft: otp.max_attempts - otp.attempts - 1 });
  }
  await db.query('UPDATE otp_codes SET consumed_at=now() WHERE id=$1', [otp.id]);
  await db.query(
    'UPDATE users SET email_verified=true, updated_at=now() WHERE id=$1',
    [req.auth!.userId]
  );
  await securityEvent({ userId: req.auth!.userId, type: 'otp_verified', ip: req.ip, metadata: { purpose: b.purpose } });
  const u = await currentUser(req);
  res.json({ verified: true, user: profileOut(u) });
}));

// ------- PIN -------
authRouter.post('/pin', requireAuth, wrap(async (req, res) => {
  const b = parse(z.object({ pin: pinSchema }), req.body);
  const u = await currentUser(req);
  const hash = await hashPin(b.pin);
  await db.query('UPDATE users SET pin_hash=$2, failed_pin_attempts=0, pin_locked_until=NULL, updated_at=now() WHERE id=$1', [u.id, hash]);
  await securityEvent({ userId: u.id, type: 'pin_set', ip: req.ip });
  await audit({ actorType: 'user', actorId: u.id, action: 'user.pin_set', entity: 'user', entityId: u.id, ip: req.ip });
  res.status(201).json({ ok: true });
}));

authRouter.post('/pin/change', requireAuth, wrap(async (req, res) => {
  const b = parse(z.object({ currentPin: pinSchema, newPin: pinSchema }), req.body);
  const u = await currentUser(req);
  if (!u.pin_hash) throw errors.pinNotSet();
  if (!(await verifyPin(b.currentPin, u.pin_hash))) throw errors.pinInvalid();
  if (b.currentPin === b.newPin) throw errors.validation('New PIN must differ');
  await db.query('UPDATE users SET pin_hash=$2, updated_at=now() WHERE id=$1', [u.id, await hashPin(b.newPin)]);
  await securityEvent({ userId: u.id, type: 'pin_changed', ip: req.ip });
  await notify(u.id, 'security', 'PIN changed', 'Your transaction PIN was just changed. If this wasn’t you, contact support immediately.');
  res.json({ ok: true });
}));

/** Used internally by money-moving routes. Throttles attempts server-side. */
export async function assertPin(user: any, pin: string | undefined): Promise<void> {
  if (!user.pin_hash) throw errors.pinNotSet();
  if (user.pin_locked_until && new Date(user.pin_locked_until).getTime() > Date.now()) {
    throw new ApiError(423, 'PIN_LOCKED', 'PIN locked — try again later');
  }
  if (!pin) throw errors.validation('PIN required for this action');
  const ok = await verifyPin(pin, user.pin_hash);
  if (ok) {
    if (user.failed_pin_attempts) await db.query('UPDATE users SET failed_pin_attempts=0 WHERE id=$1', [user.id]);
    return;
  }
  const attempts = (user.failed_pin_attempts ?? 0) + 1;
  if (attempts >= config.otp.maxAttempts) {
    await db.query("UPDATE users SET failed_pin_attempts=0, pin_locked_until=now() + interval '15 minutes' WHERE id=$1", [user.id]);
    await securityEvent({ userId: user.id, type: 'pin_locked', metadata: {} });
    throw new ApiError(423, 'PIN_LOCKED', 'Too many wrong attempts — PIN locked for 15 minutes');
  }
  await db.query('UPDATE users SET failed_pin_attempts=$2 WHERE id=$1', [user.id, attempts]);
  throw errors.pinInvalid(config.otp.maxAttempts - attempts);
}

// ------- sessions -------
authRouter.get('/sessions', requireAuth, wrap(async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, device_id, platform, ip, user_agent, created_at, expires_at, revoked_at, last_used_at
     FROM user_sessions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20`,
    [req.auth!.userId]
  );
  res.json({ items: rows });
}));

authRouter.delete('/sessions/:id', requireAuth, wrap(async (req, res) => {
  await db.query('UPDATE user_sessions SET revoked_at=now() WHERE id=$1 AND user_id=$2', [req.params.id, req.auth!.userId]);
  res.status(204).end();
}));

authRouter.get('/security-events', requireAuth, wrap(async (req, res) => {
  const { rows } = await db.query(
    'SELECT id, type, ip, metadata, created_at FROM security_events WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50',
    [req.auth!.userId]
  );
  res.json({ items: rows });
}));
