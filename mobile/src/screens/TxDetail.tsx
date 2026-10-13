import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../state/auth';
import { useConnectivity } from '../state/connectivity';
import { apiRead, apiMutate } from '../api/client';
import type { TxDetail } from '../lib/models';
import { PageHead, Card, StatusPill, TX_ICON, longDate, useToast, money } from '../ui/ui';
import type { TxItem } from '../lib/models';
import { getCache } from '../sync/cache';
import { isIncoming, fmtAmt } from './Activity';

export function TxDetailScreen() {
  const { id } = useParams();
  const { profile } = useAuth();
  const conn = useConnectivity();
  const toast = useToast();
  const nav = useNavigate();
  const uid = profile?.id ?? 'anon';
  const [tx, setTx] = useState<TxDetail | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [disputing, setDisputing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const r = await apiRead<TxDetail>(`/v1/transactions/${id}`, { userId: uid, cacheName: `tx:${id}`, live: conn.live });
      setTx(r.data); setFromCache(r.fromCache);
    } catch {
      // offline and never opened → synthesize from cached list
      const list = await getCache<TxItem[]>(uid, 'txs');
      const hit = list?.data.find((t) => t.id === id);
      if (hit) { setTx({ ...hit, timeline: [] }); setFromCache(true); }
    }
  }, [id, uid, conn.live]);
  useEffect(() => { void load(); }, [load]);

  if (!tx) return <div className="spin" />;
  const sym = tx.currency === 'USD' ? '$' : tx.currency === 'EUR' ? '€' : tx.currency === 'AOA' ? 'Kz' : tx.currency;

  const dispute = async () => {
    if (!tx) return;
    setDisputing(true);
    try {
      const res = await apiMutate<{ ticketId?: string }>(`/v1/transactions/${tx.id}/dispute`,
        { reason: 'Needs investigation from the customer' }, {
          userId: uid, live: conn.live,
          queue: { label: `Dispute ${tx.reference}` }
        }) as any;
      toast((res as any)?.queued ? 'info' : 'ok', (res as any)?.queued ? 'Dispute saved — will be filed when online' : 'Support ticket opened');
      if (!(res as any)?.queued) nav('/support');
    } catch (e: any) { toast('err', e?.message ?? 'Failed'); }
    finally { setDisputing(false); }
  };

  return (
    <>
      <PageHead title={TX_ICON[tx.type] ? 'Receipt' : 'Receipt'} sub={tx.reference} />
      <Card>
        <div className="flex-center col" style={{ gap: 6, padding: '6px 0 14px' }}>
          <span style={{ fontSize: 30 }}>{TX_ICON[tx.type] ?? '📄'}</span>
          <div style={{ fontSize: 28, fontWeight: 800 }}>{fmtAmt(tx as TxItem)} {tx.currency}</div>
          <StatusPill status={tx.status} offline={(tx as TxItem).offlineQueued} />
        </div>
        <div className="kv"><span className="k">Type</span><span className="v">{tx.type.replace(/_/g, ' ')}</span></div>
        <div className="kv"><span className="k">Reference</span><span className="v mono tiny">{tx.reference}</span></div>
        {tx.counterpartyName && <div className="kv"><span className="k">{isIncoming(tx as TxItem) ? 'From' : 'To'}</span><span className="v">{tx.counterpartyName}</span></div>}
        {tx.note && <div className="kv"><span className="k">Note</span><span className="v">{tx.note}</span></div>}
        <div className="kv"><span className="k">Amount</span><span className="v">{money(Number(tx.amountMinor), sym)} {tx.currency}</span></div>
        <div className="kv"><span className="k">Fee</span><span className="v">{money(Number(tx.feeMinor ?? 0), sym)} {tx.currency}</span></div>
        {tx.exchangeRate && <div className="kv"><span className="k">Rate</span><span className="v">{tx.exchangeRate}</span></div>}
        {tx.netAmountMinor != null && <div className="kv"><span className="k">Recipient gets</span><span className="v">{Number(tx.netAmountMinor).toLocaleString()} minor units</span></div>}
        <div className="kv"><span className="k">Created</span><span className="v">{longDate(tx.createdAt)}</span></div>
        {tx.completedAt && <div className="kv"><span className="k">{tx.status === 'failed' ? 'Failed at' : 'Completed'}</span><span className="v">{longDate(tx.completedAt)}</span></div>}
        {tx.failureMessage && <div className="kv"><span className="k">Reason</span><span className="v">{tx.failureMessage}</span></div>}
        {(tx.refundedAmountMinor ?? 0) > 0 && <div className="kv"><span className="k">Refunded</span><span className="v">{money(Number(tx.refundedAmountMinor), sym)} {tx.currency}</span></div>}
        {tx.paymentProvider && <div className="kv"><span className="k">Provider</span><span className="v tiny mono">{tx.paymentProvider}</span></div>}
      </Card>

      {(tx.timeline ?? []).length > 0 && (
        <Card title="Timeline">
          <div className="col" style={{ gap: 10 }}>
            {(tx.timeline ?? []).map((e, i) => (
              <div className="row" key={i} style={{ gap: 10 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--primary)' }} />
                <span className="grow tiny">{e.event.replace(/_/g, ' ')}</span>
                <span className="time">{longDate(e.at)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {fromCache && <div className="banner info mt">Showing cached receipt — reconnect for live timeline and dispute filing.</div>}

      <div className="mt col" style={{ gap: 10 }}>
        {tx.type !== 'refund' && (tx.status === 'completed' || tx.status === 'failed') && (
          <button className="btn ghost" onClick={dispute} disabled={disputing}>🙋 Something wrong? Dispute / contact support</button>
        )}
        <button className="btn ghost" onClick={() => nav('/activity')}>Back to activity</button>
      </div>
    </>
  );
}
