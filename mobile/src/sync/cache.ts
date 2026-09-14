/**
 * Read-through data cache (IndexedDB, namespaced per user) powers the
 * offline experience: every successful read becomes the snapshot the app
 * falls back to when the API is unreachable.
 */
import { idb } from '../lib/idb';
import type { TxItem } from '../lib/models';

export type CacheName =
  | 'wallet' | 'txs' | 'cards' | 'recipients' | 'notifications' | 'me'
  | 'bootstrap' | 'rates' | 'tickets' | 'kyc' | 'qrReceive';

const PREFIX = 'payinter';

function key(userId: string | 'anon', name: string): string {
  return `${PREFIX}:${userId}:${name}`;
}

export interface CacheEntry<T> { syncedAt: string; data: T }

export async function setCache<T>(userId: string | 'anon', name: string, data: T): Promise<void> {
  await idb.put('cache', key(userId, name), { syncedAt: new Date().toISOString(), data } satisfies CacheEntry<T>);
}

export async function getCache<T>(userId: string | 'anon', name: string): Promise<CacheEntry<T> | undefined> {
  return idb.get<CacheEntry<T>>(userId === 'anon' ? 'cache' : 'cache', key(userId, name));
}

export function emitCacheChanged(name: string) {
  window.dispatchEvent(new CustomEvent('payinter:cache', { detail: { name } }));
}

/** Insert an optimistic transaction row at the top of the cached list. */
export async function addOptimisticTx(userId: string, opId: string, tx: Omit<TxItem, 'id' | 'reference' | 'offlineQueued'>): Promise<TxItem> {
  const entry = { ...tx, id: `local-${opId}`, reference: `SYNC-${opId.slice(0, 8).toUpperCase()}`, offlineQueued: true } as TxItem;
  const cur = await getCache<TxItem[]>(userId, 'txs');
  await setCache(userId, 'txs', [entry, ...(cur?.data ?? [])].slice(0, 60));
  return entry;
}

export async function removeOptimisticTx(userId: string, opId: string): Promise<void> {
  const cur = await getCache<TxItem[]>(userId, 'txs');
  if (!cur) return;
  const next = cur.data.filter((t) => t.id !== `local-${opId}`);
  if (next.length !== cur.data.length) await setCache(userId, 'txs', next);
}
