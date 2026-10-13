/** Tiny IndexedDB wrapper — one store for cache entries, one for the outbox. */

const DB_NAME = 'payinter-offline';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache');
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { dbPromise = null; reject(req.error); };
  });
  return dbPromise;
}

function withStore<T>(store: 'cache' | 'outbox', mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | Promise<T>): Promise<T> {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const s = tx.objectStore(store);
    const req = fn(s);
    if (req instanceof IDBRequest) {
      tx.oncomplete = () => resolve((req as IDBRequest).result as T);
    } else {
      void req.then(resolve);
    }
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}

export const idb = {
  get: <T>(store: 'cache' | 'outbox', key: string): Promise<T | undefined> =>
    withStore(store, 'readonly', (s) => s.get(key) as IDBRequest<T>),
  getAll: <T>(store: 'cache' | 'outbox'): Promise<T[]> =>
    withStore(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>),
  put: <T>(store: 'cache' | 'outbox', key: string, value: T): Promise<void> =>
    withStore(store, 'readwrite', (s) => s.put(value, key)),
  putKeyed: <T>(store: 'outbox', value: T & { id: string }): Promise<void> =>
    withStore(store, 'readwrite', (s) => s.put(value)),
  del: (store: 'cache' | 'outbox', key: string): Promise<void> =>
    withStore(store, 'readwrite', (s) => s.delete(key)),
  clear: (store: 'cache' | 'outbox'): Promise<void> =>
    withStore(store, 'readwrite', (s) => s.clear())
};
