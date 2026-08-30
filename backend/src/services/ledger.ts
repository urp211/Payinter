/**
 * Double-entry ledger — money is never mutated directly.
 *
 * Invariants (enforced inside one DB transaction per posting):
 *  1. Debits == credits per currency for every ledger transaction.
 *  2. wallet-type accounts can never go negative (DB CHECK + guarded UPDATE
 *     yields INSUFFICIENT_FUNDS instead of a constraint blow-up).
 *  3. wallet_balances is a derived cache updated in the same tx; reconcile
 *     recomputes from ledger_accounts to prove cache == ledger.
 *
 * NOTE: we deliberately use ensure-row (INSERT ... ON CONFLICT DO NOTHING)
 * followed by a guarded UPDATE. PostgreSQL evaluates CHECK constraints on
 * the speculative row of INSERT ... ON CONFLICT DO UPDATE before conflict
 * resolution, so delta-upserts on CHECK-guarded numeric columns mis-fire.
 */
import { db, Queryable } from '../db';
import { errors } from '../lib/errors';
import { uuid, reference as makeRef } from '../lib/ids';

export type Direction = 'debit' | 'credit';
export interface Leg {
  accountCode: string;
  currency: string;
  amountMinor: number;
  direction: Direction;
}

export function walletAccount(userId: string, currency: string) {
  return `WALLET:${userId}:${currency}`;
}
export const sysAccount = (kind: 'clearing' | 'revenue' | 'settlement' | 'suspense', currency: string) =>
  `SYS:${kind.toUpperCase()}:${currency}`;

const SYSTEM_ACCOUNT_LABELS: Record<string, string> = {
  clearing: 'Processor funds in flight',
  revenue: 'Fee revenue',
  settlement: 'Settlement payable to beneficiaries',
  suspense: 'Unmatched / under investigation'
};

export async function ensureAccount(q: Queryable, code: string, currency: string, ownerUserId?: string | null): Promise<void> {
  let type: string = 'wallet';
  let label = `Wallet ${currency}`;
  let isSystem = false;
  if (code.startsWith('SYS:')) {
    const kind = code.slice(4, code.lastIndexOf(':')).toLowerCase();
    const mapped = kind === 'fx' ? 'provider_staging' : kind;
    type = mapped;
    label = `${SYSTEM_ACCOUNT_LABELS[mapped] ?? 'FX desk liquidity'} ${currency}`;
    isSystem = true;
  }
  await q.query(
    `INSERT INTO ledger_accounts (code, type, currency, owner_user_id, is_system, display_name, balance_minor)
     VALUES ($1,$2,$3,$4,$5,$6,0)
     ON CONFLICT (code) DO NOTHING`,
    [code, type, currency, ownerUserId ?? null, isSystem, label]
  );
}

/**
 * Apply a delta to a ledger account. Only WALLET-type accounts are guarded
 * against negative balances. System accounts (clearing, revenue, settlement,
 * suspense, provider_staging) may carry a negative balance by design — its
 * sign is meaningful (e.g. negative CLEARING = funds owed to users until
 * settlement).
 */
async function applyDelta(q: Queryable, code: string, delta: number): Promise<number> {
  const { rows: meta } = await q.query<{ type: string }>(
    'SELECT type FROM ledger_accounts WHERE code=$1', [code]
  );
  const guarded = meta[0]?.type === 'wallet';
  if (delta >= 0 || !guarded) {
    const { rows } = await q.query<{ balance_minor: string }>(
      'UPDATE ledger_accounts SET balance_minor = balance_minor + $2 WHERE code=$1 RETURNING balance_minor',
      [code, delta]
    );
    return Number(rows[0].balance_minor);
  }
  const { rows } = await q.query<{ balance_minor: string }>(
    'UPDATE ledger_accounts SET balance_minor = balance_minor + $2 WHERE code=$1 AND balance_minor + $2 >= 0 RETURNING balance_minor',
    [code, delta]
  );
  if (!rows.length) throw errors.insufficientFunds('Insufficient balance on account');
  return Number(rows[0].balance_minor);
}

/** Sync the wallet_balances cache from a wallet ledger account. Returns new balance. */
async function syncWalletCache(q: Queryable, userId: string, currency: string): Promise<void> {
  const account = walletAccount(userId, currency);
  const { rows: bal } = await q.query<{ balance_minor: string }>(
    'SELECT balance_minor FROM ledger_accounts WHERE code=$1',
    [account]
  );
  const balance = bal.length ? Number(bal[0].balance_minor) : 0;
  await q.query(
    `INSERT INTO wallet_balances AS wb (wallet_id, currency, available_minor, updated_at)
     SELECT w.id, $2, $3, now() FROM wallets w WHERE w.user_id=$1
     ON CONFLICT (wallet_id, currency) DO UPDATE SET available_minor=EXCLUDED.available_minor, updated_at=now()`,
    [userId, currency, balance]
  );
}

export interface Posting {
  userId?: string | null;
  type: string;
  description: string;
  legs: Leg[];
  meta?: Record<string, unknown>;
  reference?: string;
}

export async function post(entry: Posting): Promise<{ ledgerTxId: string; reference: string }> {
  const ref = entry.reference ?? makeRef('LGR');
  // fast pre-check (still validated again inside the tx)
  const sums = new Map<string, number>();
  for (const l of entry.legs) {
    if (l.amountMinor <= 0) throw errors.validation('Leg amounts must be positive');
    sums.set(l.currency, (sums.get(l.currency) ?? 0) + (l.direction === 'credit' ? l.amountMinor : -l.amountMinor));
  }
  const txId = uuid();
  await db.transaction(async (q) => {
    await q.query(
      `INSERT INTO ledger_transactions (id, reference, type, description, posted_by_user_id, meta)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [txId, ref, entry.type, entry.description, entry.userId ?? null, JSON.stringify(entry.meta ?? {})]
    );
    const perCurrency = new Map<string, number>();
    for (const leg of entry.legs) {
      await ensureAccount(q, leg.accountCode, leg.currency, entry.userId ?? null);
      const delta = leg.direction === 'credit' ? leg.amountMinor : -leg.amountMinor;
      const after = await applyDelta(q, leg.accountCode, delta);
      await q.query(
        `INSERT INTO ledger_entries (transaction_id, account_code, currency, amount_minor, direction, balance_after_minor)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [txId, leg.accountCode, leg.currency, leg.amountMinor, leg.direction, after]
      );
      perCurrency.set(leg.currency, (perCurrency.get(leg.currency) ?? 0) + delta);
    }
    for (const [ccy, sum] of perCurrency) {
      if (sum !== 0) throw errors.ledgerUnbalanced(`Posting ${ref} unbalanced in ${ccy}: ${sum}`);
    }
    // sync caches for EVERY wallet account touched (sender AND receiver,
    // not just entry.userId — p2p/QR postings move money between users)
    const touched = new Set<string>();
    for (const leg of entry.legs) {
      if (!leg.accountCode.startsWith('WALLET:')) continue;
      const m = /^WALLET:([0-9a-fA-F-]+):([A-Z]{3})$/.exec(leg.accountCode);
      if (!m) continue;
      const key = `${m[1]}:${m[2]}`;
      if (touched.has(key)) continue;
      touched.add(key);
      await syncWalletCache(q, m[1], m[2]);
    }
  });
  return { ledgerTxId: txId, reference: ref };
}

/** Balance of any account code. */
export async function accountBalance(code: string): Promise<number> {
  const { rows } = await db.query<{ balance_minor: string }>(
    'SELECT balance_minor FROM ledger_accounts WHERE code=$1', [code]
  );
  return rows.length ? Number(rows[0].balance_minor) : 0;
}

/** Full reconcile: ledger-derived balances vs wallet_balances cache. */
export async function reconcile(): Promise<{ ok: boolean; issues: string[]; checkedAt: string }> {
  const issues: string[] = [];
  const { rows: walletAccounts } = await db.query<{ code: string; balance_minor: string; owner_user_id: string; currency: string }>(
    `SELECT code, balance_minor, owner_user_id, currency FROM ledger_accounts WHERE type='wallet'`
  );
  for (const wa of walletAccounts) {
    const { rows: cache } = await db.query<{ available_minor: string }>(
      `SELECT wb.available_minor FROM wallet_balances wb
       JOIN wallets w ON w.id=wb.wallet_id WHERE w.user_id=$1 AND wb.currency=$2`,
      [wa.owner_user_id, wa.currency]
    );
    const ledgerBal = Number(wa.balance_minor);
    const cacheBal = cache.length ? Number(cache[0].available_minor) : 0;
    if (ledgerBal !== cacheBal) {
      issues.push(`${wa.owner_user_id} ${wa.currency}: ledger=${ledgerBal} cache=${cacheBal}`);
    }
  }
  // per-transaction balance invariant
  const { rows: bad } = await db.query<{ transaction_id: string; currency: string }>(
    `SELECT transaction_id, currency FROM ledger_entries
     GROUP BY transaction_id, currency
     HAVING SUM(CASE WHEN direction='credit' THEN amount_minor ELSE -amount_minor END) <> 0 LIMIT 20`
  );
  for (const b of bad) issues.push(`unbalanced posting ${b.transaction_id} (${b.currency})`);
  return { ok: issues.length === 0, issues, checkedAt: new Date().toISOString() };
}

/** Ledger legs for customer-facing transaction detail. */
export async function legsOf(ledgerTxId: string) {
  const { rows } = await db.query(
    `SELECT account_code, currency, amount_minor, direction, balance_after_minor
     FROM ledger_entries WHERE transaction_id=$1 ORDER BY id`,
    [ledgerTxId]
  );
  return rows;
}
