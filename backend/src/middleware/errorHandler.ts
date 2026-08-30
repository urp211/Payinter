import { NextFunction, Request, Response } from 'express';
import { isApiError } from '../lib/errors';

/** PG unique violation code */
const PG_UNIQUE = '23505';
/** PG check violation */
const PG_CHECK = '23514';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (isApiError(err)) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) } });
  }
  const anyErr = err as any;
  if (anyErr?.code === PG_UNIQUE) {
    return res.status(409).json({ error: { code: 'CONFLICT', message: 'Duplicate value for a unique field' } });
  }
  if (anyErr?.code === PG_CHECK) {
    // In a ledger guarded by CHECKs this most often means funds guard tripped
    return res.status(422).json({ error: { code: 'INSUFFICIENT_FUNDS', message: 'Operation would violate a balance constraint' } });
  }
  if (anyErr?.type === 'entity.parse.failed' || anyErr?.type === 'entity.too.large') {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Malformed request body' } });
  }
  console.error('[unhandled]', err);
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal error' } });
}
