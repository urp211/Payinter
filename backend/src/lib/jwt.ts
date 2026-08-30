import jwt from 'jsonwebtoken';
import { config } from '../config';
import { errors } from './errors';

export interface AccessPayload {
  sub: string;          // user id or admin id
  typ: 'access';
  scope: 'user' | 'admin';
  role?: string;        // admin role when scope=admin
}

export function signAccess(payload: { sub: string; scope: 'user' | 'admin'; role?: string }): string {
  const body: AccessPayload = { sub: payload.sub, typ: 'access', scope:payload.scope, role: payload.role };
  return jwt.sign(body, config.jwt.accessSecret, { expiresIn: config.jwt.accessTtlSeconds });
}

export function verifyAccess(token: string): AccessPayload {
  try {
    const p = jwt.verify(token, config.jwt.accessSecret) as AccessPayload;
    if (p.typ !== 'access') throw new Error('bad typ');
    return p;
  } catch {
    throw errors.tokenExpired();
  }
}
