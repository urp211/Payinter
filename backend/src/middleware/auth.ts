import { NextFunction, Request, Response } from 'express';
import { verifyAccess } from '../lib/jwt';
import { errors } from '../lib/errors';
import { db } from '../db';

declare module 'express' {
  interface Request {
    auth?: { userId: string; scope: 'user' | 'admin'; role?: string };
    idem?: Request;
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return next(errors.unauthorized());
  try {
    const p = verifyAccess(h.slice(7));
    if (p.scope !== 'user') return next(errors.forbidden('User token required'));
    req.auth = { userId: p.sub, scope: 'user' };
    next();
  } catch (e) { next(e); }
}

export function requireAdmin(permission?: string) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) return next(errors.unauthorized());
    let p;
    try { p = verifyAccess(h.slice(7)); } catch (e) { return next(e); }
    if (p.scope !== 'admin') return next(errors.forbidden('Admin token required'));
    const { rows } = await db.query<{ role: string; status: string }>(
      'SELECT role, status FROM admin_users WHERE id=$1', [p.sub]
    );
    if (!rows.length || rows[0].status !== 'active') return next(errors.forbidden('Admin account inactive'));
    const role = rows[0].role;
    req.auth = { userId: p.sub, scope: 'admin', role };
    if (permission && !hasPermission(role, permission)) {
      return next(errors.forbidden(`Missing permission ${permission}`));
    }
    next();
  };
}

const WILDCARD_ROLES = new Set(['super_admin']);
/** Permission matrix: resource:action (read/write) per role. */
const ROLE_PERMS: Record<string, Set<string>> = {
  super_admin: new Set(['*']),
  finance_admin: new Set([
    'stats:read', 'transactions:read', 'transactions:write', 'refunds:write', 'payments:read', 'payments:write',
    'fees:read', 'fees:write', 'currencies:read', 'currencies:write', 'fx:read', 'fx:write', 'providers:read', 'providers:write',
    'settlements:read', 'reconcile:read', 'audit:read'
  ]),
  compliance_admin: new Set([
    'stats:read', 'users:read', 'users:write', 'kyc:read', 'kyc:write', 'fraud:read', 'fraud:write',
    'transactions:read', 'audit:read', 'security:read', 'review_queue:read', 'review_queue:write', 'notifications:read'
  ]),
  operations_admin: new Set([
    'stats:read', 'users:read', 'transactions:read', 'payments:read', 'payments:write', 'cards:read', 'cards:write',
    'review_queue:read', 'review_queue:write', 'providers:read', 'currencies:read', 'fx:read', 'fees:read',
    'notifications:read', 'notifications:write', 'support:read', 'support:write', 'reconcile:read'
  ]),
  support_agent: new Set([
    'users:read', 'transactions:read', 'support:read', 'support:write', 'kyc:read', 'stats:read'
  ]),
  read_only: new Set([
    'stats:read', 'users:read', 'transactions:read', 'kyc:read', 'fraud:read', 'audit:read', 'support:read',
    'fees:read', 'currencies:read', 'fx:read', 'providers:read', 'cards:read'
  ])
};

export function hasPermission(role: string, permission: string): boolean {
  if (WILDCARD_ROLES.has(role)) return true;
  const perms = ROLE_PERMS[role];
  if (!perms) return false;
  if (perms.has(permission)) return true;
  const [resource] = permission.split(':');
  return perms.has(resource + ':*');
}

export async function currentUser(req: Request) {
  if (!req.auth) throw errors.unauthorized();
  const { rows } = await db.query('SELECT * FROM users WHERE id=$1', [req.auth.userId]);
  if (!rows.length) throw errors.unauthorized('Account not found');
  const u = rows[0];
  if (u.status === 'suspended') throw errors.forbidden('Account suspended');
  if (u.status === 'closed') throw errors.forbidden('Account closed');
  return u;
}
