import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../state/auth';
import { useConnectivity } from '../state/connectivity';
import { apiRead } from '../api/client';
import type { Wallet, TxItem } from '../lib/models';
import { money, usd, StatusPill, TX_ICON, shortDate } from '../ui/ui';

export function HomeScreen() {
  const { profile } = useAuth();
  const conn = useConnectivity();
  const nav = useNavigate();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [txs, setTxs] = useState<TxItem[]>([]);
  const [syncedAt, setSyncedAt] = useState<string | undefined>();
  const [fromCache, setFromCache] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uid = profile?.id ?? 'anon';

  const load = useCallback(async () => {
    setError(null);
    try {
      const w = await apiRead<Wallet>('/v1/wallet', { userId: uid, cacheName: 'wallet', live: conn.live });
      setWallet(w.data); setFromCache(w.fromCache); setSyncedAt(w.syncedAt);
    } catch (e: any) {
      if (e?.code !== 'OFFLINE_NO_DATA') setError(e?.message ?? 'Failed to load wallet');
    }
    try {
      const t = await apiRead<{ items: TxItem[] }>('/v1/transactions?limit=8', { userId: uid, cacheName: 'txs', live: conn.live });
      setTxs(t.data.items);
    } catch { /* txs stay whatever they were — offline */ }
  }, [uid, conn.live]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const onCache = (e: Event) => {
      const name = (e as CustomEvent).detail?.name as string;
      if (name === 'refresh' || name === 'txs' || name === 'wallet') void load();
    };
    window.addEventListener('payinter:cache', onCache);
    return () => window.removeEventListener('payinter:cache', onCache);
  }, [load]);

  const pending = txs.filter((t) => t.status === 'pending' || t.status === 'pending_review').length;

  return (
    <>
      <div className="header">
        <div className="col" style={{ flex: 1 }}>
          <span className="sub">Welcome back,</span>
          <h1>{profile?.firstName ?? profile?.email?.split('@')[0] ?? 'there'}</h1>
        </div>
        <Link to="/notifications" className="back" aria-label="Notifications">🔔</Link>
      </div>

      <div className="hero">
        <div className="label">Total balance (USD equivalent)</div>
        <div className="total">{wallet ? usd(wallet.totalUsdMinor) : '—'}</div>
        <div className="hint">
          {fromCache ? `⚡ Offline snapshot · synced ${syncedAt ? new Date(syncedAt).toLocaleTimeString() : '—'}` : 'Live from the ledger'}
        </div>
      </div>

      {pending > 0 && (
        <div className="banner warn mt">⏳ {pending} transfer{pending > 1 ? 's' : ''} pending — check Activity for details.</div>
      )}

      <div className="quick">
        {[
          { to: '/pay', ic: '💸', l: 'Send' },
          { to: '/money', ic: '➕', l: 'Add money' },
          { to: '/qr', ic: '📷', l: 'QR' },
          { to: '/intl', ic: '🌍', l: 'Intl.' }
        ].map((a) => (
          <button key={a.to} onClick={() => nav(a.to)}><span className="ico">{a.ic}</span>{a.l}</button>
        ))}
      </div>

      <div className="card mt" style={{ padding: '8px 14px' }}>
        <div className="list">
          {(wallet?.balances ?? []).filter((b) => b.availableMinor > 0 || b.pendingMinor > 0).map((b) => (
            <div className="item" key={b.currency}>
              <div className="ico">{b.symbol}</div>
              <div className="grow">
                <div className="t1">{b.name}</div>
                <div className="t2">≈ {usd(b.usdEquivalentMinor)}</div>
              </div>
              <div className="col" style={{ alignItems: 'flex-end' }}>
                <div className="amt">{money(b.availableMinor, b.symbol, b.decimals)}</div>
                {b.pendingMinor > 0 && <div className="t2" style={{ color: 'var(--warn)' }}>+{money(b.pendingMinor, b.symbol, b.decimals)} pending</div>}
              </div>
            </div>
          ))}
          {wallet && !wallet.balances.some((b) => b.availableMinor > 0 || b.pendingMinor > 0) && (
            <div className="empty col"><div className="big">💰</div>No funds yet — add money to get started.</div>
          )}
          {error && !wallet && <div className="banner off mt">{error}</div>}
        </div>
      </div>

      <div className="row between mt mb">
        <h3 style={{ margin: 0, fontSize: 15 }}>Recent activity</h3>
        <Link to="/activity" className="tiny">See all →</Link>
      </div>
      <div className="card tight">
        <div className="list">
          {txs.slice(0, 6).map((t) => (
            <div className="item" key={t.id} onClick={() => !t.offlineQueued && nav(`/activity/${t.id}`)}>
              <div className="ico">{t.offlineQueued ? '📤' : (TX_ICON[t.type] ?? '📄')}</div>
              <div className="grow">
                <div className="t1">{t.counterpartyName ?? t.description}</div>
                <div className="t2"><StatusPill status={t.status} offline={t.offlineQueued} /></div>
              </div>
              <div className="col" style={{ alignItems: 'flex-end' }}>
                <div className={`amt ${['receive', 'qr_receive', 'card_topup', 'bank_topup', 'mobile_money', 'refund'].includes(t.type) ? 'pos' : 'neg'}`}>
                  {['receive', 'qr_receive', 'card_topup', 'bank_topup', 'mobile_money', 'refund'].includes(t.type) ? '+' : '−'}
                  ${(Math.abs(Number(t.amountMinor)) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                <div className="time">{shortDate(t.createdAt)} · {t.currency}</div>
              </div>
            </div>
          ))}
          {txs.length === 0 && <div className="empty col"><div className="big">🧾</div>Nothing here yet.</div>}
        </div>
      </div>
    </>
  );
}
