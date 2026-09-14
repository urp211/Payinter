import React, { useEffect, useState } from 'react';
import { useAuth } from '../state/auth';
import { useConnectivity } from '../state/connectivity';
import { apiRead, apiMutate, QueuedResult } from '../api/client';
import type { Ticket } from '../lib/models';
import { PageHead, Card, Field, useToast, longDate } from '../ui/ui';

export function SupportScreen() {
  const { profile } = useAuth();
  const conn = useConnectivity();
  const toast = useToast();
  const uid = profile?.id ?? 'anon';
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [faq, setFaq] = useState<any[]>([]);
  const [openTicket, setOpenTicket] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [form, setForm] = useState({ subject: '', body: '' });
  const [busy, setBusy] = useState(false);

  const load = () => apiRead<{ items: Ticket[] }>('/v1/support/tickets', { userId: uid, cacheName: 'tickets', live: conn.live })
    .then((r) => setTickets(r.data.items)).catch(() => undefined);
  useEffect(() => {
    void load();
    void apiRead<{ items: any[] }>('/v1/support/faq', { userId: uid, cacheName: 'faq', live: conn.live })
      .then((r) => setFaq(r.data.items)).catch(() => undefined);
    // eslint-disable-next-line
  }, [uid, conn.live]);

  useEffect(() => {
    if (!openTicket) { setDetail(null); return; }
    void apiRead<any>(`/v1/support/tickets/${openTicket}/messages`, { userId: uid, cacheName: `ticket:${openTicket}`, live: conn.live })
      .then((r) => setDetail(r.data)).catch(() => undefined);
  }, [openTicket, uid, conn.live]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await apiMutate<Ticket>('/v1/support/tickets', form, {
        userId: uid, live: conn.live,
        queue: { label: `Ticket: ${form.subject.slice(0, 30)}` }
      });
      toast((res as QueuedResult)?.queued ? 'info' : 'ok', (res as QueuedResult)?.queued ? 'Ticket saved — will open when online' : 'Ticket opened — we reply fast (sandbox)');
      setForm({ subject: '', body: '' });
      await load();
    } catch (e: any) { toast('err', e?.message ?? 'Failed'); }
    finally { setBusy(false); }
  };

  return (
    <>
      <PageHead title="Support" sub={conn.live ? '' : 'Offline — new tickets sync later'} />
      {detail && (
        <Card title={detail.ticket?.subject ?? 'Ticket'}>
          <div className="kv"><span className="k">Status</span><span className="v">{detail.ticket?.status ?? 'open'}</span></div>
          <div className="col mt" style={{ gap: 8 }}>
            {detail.items.map((m: any) => (
              <div key={m.id} className={`card tight ${m.sender_type === 'support' ? '' : ''}`} style={{ alignSelf: m.sender_type === 'support' ? 'flex-start' : 'flex-end', maxWidth: '92%', boxShadow: 'none' }}>
                <div className="tiny muted">{m.sender_type === 'support' ? 'Support' : 'You'} · {longDate(m.created_at)}</div>
                <div style={{ fontSize: 14 }}>{m.body}</div>
              </div>
            ))}
          </div>
          <button className="btn ghost small mt" onClick={() => setOpenTicket(null)}>← All tickets</button>
        </Card>
      )}

      {!detail && (
        <>
          <Card tight title="Your tickets">
            <div className="list">
              {tickets.map((t) => (
                <div className="item" key={t.id} onClick={() => setOpenTicket(t.id)}>
                  <div className="ico">🎫</div>
                  <div className="grow">
                    <div className="t1">{t.subject}</div>
                    <div className="t2">{t.status ?? 'open'} · {longDate(t.updated_at ?? t.created_at)}</div>
                  </div>
                  <span className="muted">›</span>
                </div>
              ))}
              {tickets.length === 0 && <div className="empty col"><div className="big">🎫</div>No tickets yet.</div>}
            </div>
          </Card>

          <form className="card" onSubmit={create} style={{ marginTop: 12 }}>
            <h3>Open a ticket</h3>
            <Field label="Subject"><input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} minLength={4} maxLength={160} required /></Field>
            <Field label="Describe the issue"><textarea rows={4} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} minLength={10} maxLength={4000} required style={{ resize: 'vertical' }} /></Field>
            <button className="btn primary" disabled={busy}>{busy ? 'Opening…' : conn.live ? 'Open ticket' : 'Save offline (opens on sync)'}</button>
          </form>

          {faq.length > 0 && (
            <Card title="FAQ" tight>
              <div className="list">
                {faq.map((f: any, i: number) => (
                  <div className="item" key={i} style={{ cursor: 'default' }}>
                    <div className="grow">
                      <div className="t1">{f.q}</div>
                      <div className="t2" style={{ whiteSpace: 'normal' }}>{f.a}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </>
  );
}
