/**
 * API client with offline semantics:
 *  - apiRead: network-first; network/5xx failure → cached snapshot (per user)
 *  - apiMutate: when offline (or the request dies on the network), the op is
 *    persisted to the outbox with its idempotency key and replayed on flush.
 */
import { apiBase } from '../lib/apiBase';
import { setCache, getCache, emitCacheChanged, addOptimisticTx } from '../sync/cache';
import { outbox, makeOp } from '../sync/outbox';
import type { Session } from '../lib/models';

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status; this.code = code; this.details = details;
  }
}
export const OFFLINE_NO_DATA = new ApiError(0, 'OFFLINE_NO_DATA', 'Offline and no cached data yet');

/* ------- session binder (registered by the auth context) ------- */
let getSession: (() => Session | null) | null = null;
let setSessionFn: ((s: Session | null) => void) | null = null;
export function bindSessionHandlers(h: { get: () => Session | null; set: (s: Session | null) => void }) {
  getSession = h.get; setSessionFn = h.set;
}
function currentToken(): string | null {
  const s = getSession?.();
  return s ? s.accessToken : null;
}
async function refreshSessionIfNeeded(): Promise<string | null> {
  const s = getSession?.();
  if (!s) return null;
  if (Date.now() < s.expiresAt - 30_000) return s.accessToken;
  try {
    const res = await fetch(`${apiBase()}/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-app-platform': 'web' },
      body: JSON.stringify({ refreshToken: s.refreshToken })
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.accessToken) { setSessionFn?.(null); return null; }
    const next: Session = { accessToken: body.accessToken, refreshToken: body.refreshToken, expiresAt: Date.now() + body.expiresIn * 1000 };
    setSessionFn?.(next);
    return next.accessToken;
  } catch {
    return null; // network down — caller will treat as offline
  }
}

/* ------- primitives ------- */
async function parse(res: Response): Promise<any> {
  const text = await res.text();
  try { return text ? JSON.parse(text) : {}; } catch { return { raw: text }; }
}

async function doFetch<T>(path: string, init: RequestInit, token: string | null): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-app-platform': 'web', ...(init.headers as Record<string, string> ?? {}) };
  if (token) headers['authorization'] = `Bearer ${token}`;
  const res = await fetch(`${apiBase()}${path}`, { ...init, headers, cache: 'no-store' });
  const body = await parse(res);
  if (!res.ok) {
    const e = body?.error ?? {};
    throw new ApiError(res.status, e.code ?? 'UNKNOWN', e.message ?? `HTTP ${res.status}`, e.details);
  }
  return body as T;
}

/* ------- public API ------- */
export interface ReadOpts {
  userId?: string;
  cacheName?: string;
  live: boolean;
  cacheOnly?: boolean;
}

export async function apiRead<T>(path: string, opts: ReadOpts): Promise<{ data: T; fromCache: boolean; syncedAt?: string }> {
  const { userId = 'anon', cacheName, live } = opts;
  const ns = userId || 'anon';
  if (opts.cacheOnly) {
    const hit = cacheName ? await getCache<T>(ns, cacheName) : undefined;
    if (hit) return { data: hit.data, fromCache: true, syncedAt: hit.syncedAt };
    throw OFFLINE_NO_DATA;
  }
  try {
    const data = await doFetch<T>(path, { method: 'GET' }, await refreshSessionIfNeeded());
    if (cacheName) {
      const syncedAt = new Date().toISOString();
      await setCache(ns, cacheName, data);
      emitCacheChanged(cacheName);
      return { data, fromCache: false, syncedAt };
    }
    return { data, fromCache: false };
  } catch (e) {
    // definite API problem (4xx/5xx with an answer) → don't mask it behind cache
    if (e instanceof ApiError && e.status >= 400) throw e;
    const hit = cacheName ? await getCache<T>(ns, cacheName) : undefined;
    void live;
    if (hit) return { data: hit.data, fromCache: true, syncedAt: hit.syncedAt };
    throw e instanceof ApiError ? e : OFFLINE_NO_DATA;
  }
}

export interface MutateOpts {
  userId: string;
  live: boolean;
  method?: 'POST' | 'PATCH';
  /** if provided the request can queue while offline */
  queue?: { label: string; meta?: { type?: string; amountMinor?: number; currency?: string; counterparty?: string | null; description?: string } };
  optimistic?: { type: string; amountMinor: number; currency: string; description: string; note?: string | null; counterpartyName?: string | null };
}

export interface QueuedResult { queued: true; opId: string; optimistic: unknown }

export async function apiMutate<T>(path: string, body: unknown, opts: MutateOpts): Promise<T | QueuedResult> {
  const method = opts.method ?? 'POST';
  if (!opts.queue) {
    const res = await doFetch<T>(path, { method, body: JSON.stringify(body) }, await refreshSessionIfNeeded());
    return res;
  }

  const queue = async (reason: string): Promise<QueuedResult> => {
    const token = currentToken();
    const op = makeOp({
      path, method, body, label: opts.queue!.label, meta: opts.queue!.meta,
      token: token ?? '', userId: opts.userId
    });
    await outbox.enqueue(op);
    let optimistic: unknown = null;
    if (opts.optimistic) {
      optimistic = await addOptimisticTx(opts.userId, op.id, {
        type: opts.optimistic.type, status: 'pending', amountMinor: opts.optimistic.amountMinor,
        currency: opts.optimistic.currency, description: opts.optimistic.description,
        note: opts.optimistic.note ?? null, counterpartyName: opts.optimistic.counterpartyName ?? null,
        createdAt: new Date().toISOString()
      });
      emitCacheChanged('txs');
    }
    window.dispatchEvent(new CustomEvent('payinter:outbox', { detail: { type: 'queued', op, reason } }));
    return { queued: true, opId: op.id, optimistic };
  };

  if (!opts.live) return queue('offline');
  try {
    const res = await doFetch<T>(path, {
      method, body: JSON.stringify(body),
      headers: { 'idempotency-key': `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}` }
    }, await refreshSessionIfNeeded());
    return res;
  } catch (e) {
    // network failure after trying → queue it (idempotent) ; real API error → throw
    if (e instanceof ApiError && e.status >= 400) throw e;
    return queue('network failure mid-request');
  }
}
