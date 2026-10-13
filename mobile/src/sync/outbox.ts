/**
 * Outbox — mutations created while offline. Each op carries its own
 * Idempotency-Key, so replays after a crash are safe on the server side.
 */
import { idb } from '../lib/idb';
import { apiBase } from '../lib/apiBase';
import type { TxItem } from '../lib/models';
import { removeOptimisticTx } from './cache';

export interface OutboxOp {
  id: string;
  path: string;
  method: 'POST' | 'PATCH';
  body: unknown;
  token: string;
  userId: string;
  label: string;
  createdAt: number;
  tries: number;
  lastError?: string;
  meta?: { type?: string; amountMinor?: number; currency?: string; counterparty?: string | null; description?: string };
}

export interface OutboxBusy {
  list(): Promise<OutboxOp[]>;
  enqueue(op: OutboxOp): Promise<void>;
  flush(): Promise<{ sent: number; failed: number; dropped: { op: OutboxOp; error: string }[] }>;
}

function uuid(): string {
  if ('randomUUID' in crypto) return crypto.randomUUID();
  return `op-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function list(): Promise<OutboxOp[]> {
  const ops = await idb.getAll<OutboxOp>('outbox');
  return (ops ?? []).sort((a, b) => a.createdAt - b.createdAt);
}

async function enqueue(op: OutboxOp): Promise<void> {
  await idb.putKeyed('outbox', op);
}

function emit(type: 'queued' | 'flushed' | 'failed' | 'rejected', detail: { op?: OutboxOp; error?: string; pending?: number }) {
  window.dispatchEvent(new CustomEvent('payinter:outbox', { detail: { type, ...detail } }));
}

let flushing = false;

async function flush(): Promise<{ sent: number; failed: number; dropped: { op: OutboxOp; error: string }[] }> {
  if (flushing) return { sent: 0, failed: 0, dropped: [] };
  flushing = true;
  const dropped: { op: OutboxOp; error: string }[] = [];
  let sent = 0; let failed = 0;
  try {
    const ops = await list();
    for (const op of ops) {
      let res: Response;
      try {
        res = await fetch(`${apiBase()}${op.path}`, {
          method: op.method,
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${op.token}`,
            'idempotency-key': op.id,
            'x-app-platform': 'web'
          },
          body: JSON.stringify(op.body)
        });
      } catch {
        failed++; break; // offline again — stop the batch
      }
      if (res.status >= 200 && res.status < 300) {
        await idb.del('outbox', op.id);
        if (op.userId) await removeOptimisticTx(op.userId, op.id);
        sent++;
        emit('flushed', { op, pending: ops.length - sent });
        continue;
      }
      const text = await res.text().catch(() => '');
      // 429 / 5xx / network-ish → keep for later, stop the batch
      if (res.status === 429 || res.status >= 500) {
        await idb.putKeyed('outbox', { ...op, tries: op.tries + 1, lastError: `${res.status}` });
        failed++; break;
      }
      // definite rejection (validation, insufficient funds, PIN wrong…) → drop with a record
      let message = `${res.status}`;
      try { message = JSON.parse(text).error?.message ?? message; } catch { /* raw */ }
      await idb.del('outbox', op.id);
      if (op.userId) await removeOptimisticTx(op.userId, op.id);
      dropped.push({ op, error: message });
      emit('rejected', { op, error: message });
    }
  } finally {
    flushing = false;
  }
  return { sent, failed, dropped };
}

export const outbox: OutboxBusy = { list, enqueue, flush };

export function makeOp(input: Omit<OutboxOp, 'id' | 'createdAt' | 'tries'>): OutboxOp {
  return { ...input, id: uuid(), createdAt: Date.now(), tries: 0 };
}

export { emit as emitOutbox, uuid as makeOpId };
export type { TxItem };
