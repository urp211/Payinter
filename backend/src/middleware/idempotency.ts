import { NextFunction, Request, Response } from 'express';
import { db } from '../db';
import { errors } from '../lib/errors';

/**
 * Idempotency middleware: when an `Idempotency-Key` header is present, a
 * replay returns the stored original response. Keys are scoped per user.
 */
export async function idempotency(req: Request, res: Response, next: NextFunction) {
  const key = req.headers['idempotency-key'];
  if (!key || typeof key !== 'string') return next();
  if (key.length < 4 || key.length > 120) return next(errors.validation('Idempotency-Key length 4–120'));

  const userId = req.auth?.userId ?? null;
  const { rows } = await db.query<{ method: string; path: string; status_int: number; response: any }>(
    'SELECT method, path, status_int, response FROM idempotency_keys WHERE key=$1',
    [key]
  );
  if (rows.length) {
    const stored = rows[0];
    if (stored.method !== req.method || (userId && stored.path !== req.baseUrl + req.path)) {
      return next(errors.idempotencyMismatch());
    }
    res.setHeader('Idempotent-Replay', 'true');
    return res.status(stored.status_int).json(stored.response);
  }

  const originalJson = res.json.bind(res);
  res.json = ((body: any) => {
    // persist only successful business responses (never 4xx/5xx)
    const status = res.statusCode;
    if (status >= 200 && status < 300) {
      void db.query(
        `INSERT INTO idempotency_keys (key, user_id, method, path, status_int, response)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (key) DO NOTHING`,
        [key, userId, req.method, req.baseUrl + req.path, status, body]
      ).catch(() => undefined);
    }
    return originalJson(body);
  }) as typeof res.json;

  next();
}
