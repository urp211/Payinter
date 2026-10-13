/** Predictable error envelope: { error: { code, message, details? } } */

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const errors = {
  validation: (msg = 'Validation failed', details?: unknown) => new ApiError(400, 'VALIDATION_ERROR', msg, details),
  unauthorized: (msg = 'Authentication required') => new ApiError(401, 'UNAUTHORIZED', msg),
  tokenExpired: () => new ApiError(401, 'TOKEN_EXPIRED', 'Token expired or invalid'),
  forbidden: (msg = 'Insufficient permissions') => new ApiError(403, 'FORBIDDEN', msg),
  notFound: (what = 'Resource') => new ApiError(404, 'NOT_FOUND', `${what} not found`),
  conflict: (msg: string) => new ApiError(409, 'CONFLICT', msg),
  insufficientFunds: (msg = 'Insufficient funds') => new ApiError(422, 'INSUFFICIENT_FUNDS', msg),
  kycBlocked: () => new ApiError(403, 'KYC_TIER_BLOCKED', 'Complete identity verification to unlock this feature'),
  pinNotSet: () => new ApiError(400, 'PIN_NOT_SET', 'Set your transaction PIN first'),
  pinInvalid: (attemptsLeft?: number) => new ApiError(403, 'PIN_INVALID', attemptsLeft !== undefined ? `Wrong PIN — ${attemptsLeft} attempt(s) left` : 'Wrong PIN', { attemptsLeft }),
  rateLimited: (msg = 'Too many requests, slow down') => new ApiError(429, 'RATE_LIMITED', msg),
  idempotencyMismatch: () => new ApiError(409, 'IDEMPOTENCY_MISMATCH', 'This idempotency key was used with different request data'),
  breakerOpen: () => new ApiError(503, 'BREAKER_OPEN', 'Service temporarily unavailable'),
  internal: (msg = 'Internal error') => new ApiError(500, 'INTERNAL_ERROR', msg),
  ledgerUnbalanced: (msg = 'Ledger posting must balance per currency') => new ApiError(500, 'LEDGER_UNBALANCED', msg)
};

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}
