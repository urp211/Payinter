import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../state/auth';
import { useConnectivity } from '../state/connectivity';
import { apiRead } from '../api/client';
import type { TxItem } from '../lib/models';
import { StatusPill, TX_ICON, shortDate, PageHead, Card } from '../ui/ui';

const OUT_TYPES = ['send', 'qr_pay', 'international', 'convert', 'card_payment'];
const IN_TYPES = ['receive', 'qr_receive', 'card_topup', 'bank_topup', 'mobile_money', 'refund'];

export function isIncoming(t: TxItem) { return IN_TYPES.includes(t.type); }
export function fmtAmt(t: TxItem) {
  const sign = isIncoming(t) ? '+' : '−';
  return `${sign}$${(Math.abs(Number(t.amountMinor)) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}

const FILTERS = [
  { id: 'all', l: 'All' }, { id: 'in', l: 'Money in' }, { id: 'out', l: 'Money out' },
  { id: 'pending', l: 'Pending' }, { id: 'card_topup', l: 'Top ups' }, { id: 'international', l: 'International' }
];

export function ActivityScreen() {
  const { profile } = useAuth();
  const conn = useConnectivity();
  const nav = useNavigate();
  const uid = profile?.id ?? 'anon';
  const [items, setItems] = useState<TxItem[]>([]);
  const [syncedAt, setSyncedAt] = useState<string | undefined>();
  const [fromCache, setFromCache] = useState(false);
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await apiRead<{ items: TxItem[] }>('/v1/transactions?limit=50', { userId: uid, cacheName: 'txs', live: conn.live });
      setItems(r.data.items); setSyncedAt(r.syncedAt); setFromCache(r.fromCache);
    } catch (e: any) { if (e?.code !== 'OFFLINE_NO_DATA') setError(e?.message); }
  }, [uid, conn.live]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const onCache = () => void load();
    window.addEventListener('payinter:cache', onCache);
    return () => window.removeEventListener('payinter:cache', onCache);
  }, [load]);

  const filtered = useMemo(() => items.filter((t) => {
    if (filter === 'in' && !isIncoming(t)) return false;
    if (filter === 'out' && !OUT_TYPES.includes(t.type)) return false;
    if (filter === 'pending' && !['pending', 'pending_review'].includes(t.status)) return false;
    if (['card_topup', 'international'].includes(filter) && t.type !== filter) return false;
    if (q) {
      const needle = q.toLowerCase();
      const hay = [t.reference, t.description, t.counterpartyName, t.note].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  }), [items, filter, q]);

  return (
    <>
      <PageHead title="Activity" sub={fromCache ? `Offline snapshot · ${syncedAt ? new Date(syncedAt).toLocaleString() : ''}` : `${items.length} transactions (latest 50)`} />
      <div className="crumb">
        {FILTERS.map((f) => <button key={f.id} className={filter === f.id ? 'active' : ''} onClick={() => setFilter(f.id)}>{f.l}</button>)}
      </div>
      <div className="field mb">
        <input placeholder="Search by reference, note or name…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <Card tight>
        <div className="list">
          {error && items.length === 0 && <div className="banner off">{error}</div>}
          {filtered.map((t) => (
            <div className="item" key={t.id} onClick={() => !t.offlineQueued && nav(`/activity/${t.id}`)}>
              <div className="ico">{t.offlineQueued ? '📤' : (TX_ICON[t.type] ?? '📄')}</div>
              <div className="grow">
                <div className="t1">{t.counterpartyName ?? t.description}</div>
                <div className="t2"><StatusPill status={t.status} offline={t.offlineQueued} /> {t.status === 'failed' && t.failureCode}</div>
              </div>
              <div className="col" style={{ alignItems: 'flex-end' }}>
                <div className={`amt ${isIncoming(t) ? 'pos' : 'neg'}`}>{fmtAmt(t)}</div>
                <div className="time">{shortDate(t.createdAt)} · {t.currency}</div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && <div className="empty col"><div className="big">🔍</div>Nothing matches.</div>}
        </div>
      </Card>
      {fromCache && <div className="tiny muted mt" style={{ textAlign: 'center' }}>Cached page — will refresh when you're back online.</div>}
    </>
  );
}
