// Payinter - IndexedDB wrapper 100% offline
const DB_NAME = 'payinter-db';
const DB_VERSION = 2;

const DEFAULT_CATEGORIES = [
  { id: 'cat_food', name: 'Alimentação', icon: '🍔', color: '#FB923C', type: 'expense' },
  { id: 'cat_transport', name: 'Transporte', icon: '🚗', color: '#60A5FA', type: 'expense' },
  { id: 'cat_home', name: 'Casa', icon: '🏠', color: '#A78BFA', type: 'expense' },
  { id: 'cat_health', name: 'Saúde', icon: '💊', color: '#F472B6', type: 'expense' },
  { id: 'cat_leisure', name: 'Lazer', icon: '🎮', color: '#34D399', type: 'expense' },
  { id: 'cat_bills', name: 'Contas', icon: '💡', color: '#FBBF24', type: 'expense' },
  { id: 'cat_shopping', name: 'Compras', icon: '🛍️', color: '#F87171', type: 'expense' },
  { id: 'cat_salary', name: 'Salário', icon: '💼', color: '#10B981', type: 'income' },
  { id: 'cat_freela', name: 'Freelance', icon: '💻', color: '#06B6D4', type: 'income' },
  { id: 'cat_invest', name: 'Investimentos', icon: '📈', color: '#8B5CF6', type: 'income' },
  { id: 'cat_other', name: 'Outros', icon: '📦', color: '#9CA3AF', type: 'both' },
];

class PayinterDB {
  constructor() {
    this.db = null;
  }

  async open() {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('transactions')) {
          const store = db.createObjectStore('transactions', { keyPath: 'id' });
          store.createIndex('date', 'date', { unique: false });
          store.createIndex('type', 'type', { unique: false });
          store.createIndex('categoryId', 'categoryId', { unique: false });
        }
        if (!db.objectStoreNames.contains('categories')) {
          const cStore = db.createObjectStore('categories', { keyPath: 'id' });
          cStore.createIndex('type', 'type', { unique: false });
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' });
        }
      };
      req.onsuccess = async (e) => {
        this.db = e.target.result;
        // seed categories if empty
        const count = await this._count('categories');
        if (count === 0) {
          await this._bulkPut('categories', DEFAULT_CATEGORIES);
        }
        resolve(this.db);
      };
      req.onerror = () => reject(req.error);
    });
  }

  _tx(storeName, mode = 'readonly') {
    return this.db.transaction(storeName, mode).objectStore(storeName);
  }

  _count(storeName) {
    return new Promise((res, rej) => {
      const req = this._tx(storeName).count();
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }

  _bulkPut(storeName, items) {
    return new Promise((res, rej) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      items.forEach(i => store.put(i));
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }

  // Transactions
  async getAllTransactions() {
    await this.open();
    return new Promise((resolve, reject) => {
      const req = this._tx('transactions').getAll();
      req.onsuccess = () => resolve(req.result.sort((a,b)=> new Date(b.date)-new Date(a.date)));
      req.onerror = () => reject(req.error);
    });
  }

  async addTransaction(tx) {
    await this.open();
    return new Promise((resolve, reject) => {
      const request = this._tx('transactions','readwrite').put(tx);
      request.onsuccess = () => resolve(tx);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteTransaction(id) {
    await this.open();
    return new Promise((resolve, reject) => {
      const req = this._tx('transactions','readwrite').delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async getCategories() {
    await this.open();
    return new Promise((resolve, reject) => {
      const req = this._tx('categories').getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async addCategory(cat) {
    await this.open();
    return new Promise((resolve, reject) => {
      const req = this._tx('categories','readwrite').put(cat);
      req.onsuccess = () => resolve(cat);
      req.onerror = () => reject(req.error);
    });
  }

  // Export / Import
  async exportData() {
    const [transactions, categories] = await Promise.all([
      this.getAllTransactions(),
      this.getCategories()
    ]);
    return { transactions, categories, exportedAt: new Date().toISOString(), version: DB_VERSION };
  }

  async importData(data) {
    await this.open();
    if (data.transactions) await this._bulkPut('transactions', data.transactions);
    if (data.categories) await this._bulkPut('categories', data.categories);
  }

  async clearAll() {
    await this.open();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['transactions','categories'],'readwrite');
      tx.objectStore('transactions').clear();
      tx.objectStore('categories').clear();
      tx.oncomplete = async () => {
        await this._bulkPut('categories', DEFAULT_CATEGORIES);
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  }

  async getStorageEstimate() {
    if (navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      return est;
    }
    return null;
  }
}

window.payinterDB = new PayinterDB();
