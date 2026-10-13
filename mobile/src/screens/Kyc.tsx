import React, { useEffect, useState } from 'react';
import { useAuth } from '../state/auth';
import { useConnectivity } from '../state/connectivity';
import { apiRead, apiMutate, QueuedResult } from '../api/client';
import { PageHead, Card, Field, useToast, longDate } from '../ui/ui';

export function KycScreen() {
  const { profile } = useAuth();
  const conn = useConnectivity();
  const toast = useToast();
  const uid = profile?.id ?? 'anon';
  const [info, setInfo] = useState<any>(null);
  const [fromCache, setFromCache] = useState(false);
  const [form, setForm] = useState({ documentType: 'passport', documentNumber: '', documentCountry: profile?.countryCode ?? 'AO' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void apiRead<any>('/v1/kyc', { userId: uid, cacheName: 'kyc', live: conn.live })
      .then((r) => { setInfo(r.data); setFromCache(r.fromCache); })
      .catch(() => undefined);
  }, [uid, conn.live]);

  const status = (info?.status ?? (profile?.kyc as any)?.status ?? 'not_started') as string;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await apiMutate<any>('/v1/kyc', form, {
        userId: uid, live: conn.live,
        queue: { label: 'KYC submission' }
      });
      toast((res as QueuedResult)?.queued ? 'info' : 'ok', (res as QueuedResult)?.queued ? 'Saved — will be submitted when online' : 'Submitted — sandbox reviewer will decide shortly');
      void apiRead<any>('/v1/kyc', { userId: uid, cacheName: 'kyc', live: conn.live }).then((r) => setInfo(r.data)).catch(() => undefined);
    } catch (e: any) { toast('err', e?.message); }
    finally { setBusy(false); }
  };

  return (
    <>
      <PageHead title="Identity verification" sub="Sandbox simulation — an admin reviews it" />
      <Card>
        <div className="kv"><span className="k">Current status</span><span className="v">{status.replace(/_/g, ' ')}</span></div>
        <div className="kv"><span className="k">Unlocked with "verified"</span><span className="v">Card top ups + international payouts</span></div>
        {fromCache && <div className="banner warn mt" style={{ marginTop: 8 }}>Offline snapshot of your review status.</div>}
      </Card>

      {['not_started', 'rejected'].includes(status) && (
        <form className="card" onSubmit={submit} style={{ marginTop: 12 }}>
          <h3>Submit documents</h3>
          <div className="banner warn mb">🧪 Demo: do NOT enter real ID numbers. Any plausible value works.</div>
          <Field label="Document type">
            <select value={form.documentType} onChange={(e) => setForm({ ...form, documentType: e.target.value })}>
              {['passport', 'national_id', 'drivers_license'].map((d) => <option key={d}>{d.replace(/_/g, ' ')}</option>)}
            </select>
          </Field>
          <Field label="Document number"><input value={form.documentNumber} onChange={(e) => setForm({ ...form, documentNumber: e.target.value })} minLength={4} maxLength={40} required /></Field>
          <Field label="Issuing country">
            <select value={form.documentCountry} onChange={(e) => setForm({ ...form, documentCountry: e.target.value })}>{['AO', 'PT', 'BR', 'US', 'GB'].map((c) => <option key={c}>{c}</option>)}</select>
          </Field>
          <button className="btn primary" disabled={busy}>{busy ? 'Submitting…' : conn.live ? 'Submit for review' : 'Save offline (submits on sync)'}</button>
        </form>
      )}

      {info?.submissions?.length > 0 && (
        <Card title="History" tight>
          <div className="list">
            {info.submissions.map((s: any) => (
              <div className="item" key={s.id} style={{ cursor: 'default' }}>
                <div className="ico">🪪</div>
                <div className="grow">
                  <div className="t1 tiny">{s.document_type} · {s.status}</div>
                  <div className="t2 tiny">{longDate(s.created_at)}{s.rejection_reason ? ` · ${s.rejection_reason}` : ''}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
