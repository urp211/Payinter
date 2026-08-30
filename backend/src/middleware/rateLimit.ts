import { NextFunction, Request, Response } from 'express';
import { errors } from '../lib/errors';

/** Sliding-window in-memory rate limiter (REDIS_URL optional upgrade). */
const buckets = new Map<string, number[]>();

export function rateLimit(opts: { windowMs: number; max: number; key?: (req: Request) => string }) {
  const { windowMs, max } = opts;
  const keyFn = opts.key ?? ((req: Request) => `${req.ip}:${req.path}`);
  return (req: Request, _res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = keyFn(req);
    const arr = (buckets.get(key) ?? []).filter((t) => t > now - windowMs);
    if (arr.length >= max) return next(errors.rateLimited());
    arr.push(now);
    buckets.set(key, arr);
    if (buckets.size > 5000) {
      // crude GC
      for (const [k, v] of buckets) {
        const fresh = v.filter((t) => t > now - windowMs);
        if (!fresh.length) buckets.delete(k);
        else buckets.set(k, fresh);
      }
    }
    next();
  };
}

export const authRateLimit = rateLimit({ windowMs: 60_000, max: 20, key: (req) => `auth:${req.ip}` });
export const otpRateLimit = rateLimit({ windowMs: 60_000, max: 5, key: (req) => `otp:${req.ip}:${(req.body?.email ?? '').toLowerCase()}` });
