import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../state/auth';
import { useConnectivity } from '../state/connectivity';
import { apiRead, apiMutate, QueuedResult } from '../api/client';
import type { Recipient, Wallet } from '../lib/models';
import { PageHead, Card, Field, useToast, money, longDate } from '../ui/ui';

export function IntlScreen() {
  const { profile } = useAuth();
  const conn = useConnectivity();
  const toast = useToast();
  const uid = profile?.id ?? 'anon';

  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [selected, setSelected] = useState<string>('');
  const [from, setFrom] = useState('USD');
  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState('family support');
  const [note, setNote] = useState('');
  const [pin, setPin] = useState('');
  const [quote, setQuote] = useState<any>(null);
  const [receipt, setReceipt] = useState<any>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  // new recipient form
  const [nr, setNr] = useState({ fullName: '', countryCode: 'PT', currency: 'EUR', iban: '', swift: '' });

  const load = () => {
    void apiRead<{ items: Recipient[] }>('/v1/recipients', { userId: uid, cacheName: 'recipients', live: conn.live })
      .then((r) => { setRecipients(r.data.items); if (!selected && r.data.items.length) setSelected(r.data.items[0].id); })
      .catch(() => undefined);
    void apiRead<Wallet>('/v1/wallet', { userId: uid, cacheName: 'wallet', live: conn.live })
      .then((r) => setWallet(r.data)).catch(() => undefined);
  };
  useEffect(load, [uid, conn.live]); // eslint-disable-line
  const recipient = useMemo(() => recipients.find((r) => r.id === selected), [recipients, selected]);
  const minor = () => Math.round(parseFloat(amount.replace(',', '.')) * 100);
  const valid = () => Number.isFinite(minor()) && minor() > 0;

  useEffect(() => {
    setQuote(null);
    if (!valid() || !recipient || !conn.live) return;
    const t = setTimeout(async () => {
      try {
        setQuote(await apiMutate<any>('/v1/payments/international/quote', {
          fromCurrency: from, toCurrency: recipient.currency, amountMinor: minor()
        }, { userId: uid, live: conn.live }));
      } catch { /* kyc gate / no rate */ }
    }, 350);
    return () => clearTimeout(t);
  }, [amount, from, recipient, conn.live, uid]); // eslint-disable-line

  const addRecipient = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiMutate<{ recipient?: Recipient }>('/v1/recipients', {
        type: 'international', fullName: nr.fullName.trim(), countryCode: nr.countryCode, currency: nr.currency,
        details: { iban: nr.iban, swift: nr.swift || undefined }
      }, {
        userId: uid, live: conn.live,
        queue: { label: `Save recipient ${nr.fullName}` }
      });
      toast('ok', 'Recipient saved');
      setAdding(false); setNr({ fullName: '', countryCode: 'PT', currency: 'EUR', iban: '', swift: '' });
      if ((res as QueuedResult)?.queued) { toast('info', 'Saved offline — will sync when online'); return; }
      setSelected((res as any).recipient?.id ?? selected);
      load();
    } catch (e: any) { toast('err', e?.message ?? 'Invalid recipient'); }
  };

  const send = async () => {
    if (!recipient || !valid()) return;
    setBusy(true); setReceipt(null);
    try {
      const res = await apiMutate<any>('/v1/payments/international', {
        recipientId: recipient.id, fromCurrency: from, toCurrency: recipient.currency,
        amountMinor: minor(), purpose, note: note || undefined, pin: pin || undefined
      }, {
        userId: uid, live: conn.live,
        queue: { label: `Intl transfer ${money(minor(), '$')} → ${recipient.fullName}`, meta: { type: 'international', amountMinor: minor(), currency: from, counterparty: recipient.fullName } },
        optimistic: { type: 'international', amountMinor: minor(), currency: from, description: 'International transfer (queued)', counterpartyName: recipient.fullName }
      });
      if ((res as QueuedResult).queued) { toast('info', 'Saved — will send when online at the then-current rate'); setReceipt({ queued: true }); }
      else { setReceipt(res); toast('ok', 'Delivered (sandbox) 🌍'); }
    } catch (e: any) { toast('err', e?.message ?? 'Transfer failed'); }
    finally { setBusy(false); }
  };

  return (
    <>
      <PageHead title="International" sub="Live quote, all-in cost before you confirm" />
      {!conn.live && <div className="banner warn mb">Offline: you'll queue the transfer; it executes at the live rate when you reconnect.</div>}

      <Card>
        <Field label="Recipient">
          <select value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">— choose —</option>
            {recipients.map((r) => <option key={r.id} value={r.id}>{r.fullName} · {r.currency} · {String(r.details?.iban ?? '').replace(/.(?=.{4})/g, '•')}</option>)}
          </select>
        </Field>
        <button className="btn ghost small mb" onClick={() => setAdding(!adding)}>{adding ? '− cancel' : '+ New recipient'}</button>

        {adding && (
          <form className="card tight mb" onSubmit={addRecipient} style={{ boxShadow: 'none' }}>
            <Field label="Full name"><input value={nr.fullName} onChange={(e) => setNr({ ...nr, fullName: e.target.value })} minLength={2} required /></Field>
            <div className="fieldgroup">
              <Field label="Country">
                <select value={nr.countryCode} onChange={(e) => setNr({ ...nr, countryCode: e.target.value })}>{['PT', 'BR', 'GB', 'US', 'AO', 'ES', 'FR'].map((c) => <option key={c}>{c}</option>)}</select>
              </Field>
              <Field label="Payout currency">
                <select value={nr.currency} onChange={(e) => setNr({ ...nr, currency: e.target.value })}>{['EUR', 'USD', 'GBP', 'BRL', 'AOA'].map((c) => <option key={c}>{c}</option>)}</select>
              </Field>
            </div>
            <Field label="IBAN / account"><input value={nr.iban} onChange={(e) => setNr({ ...nr, iban: e.target.value })} minLength={8} required /></Field>
            <Field label="SWIFT (optional)"><input value={nr.swift} onChange={(e) => setNr({ ...nr, swift: e.target.value })} maxLength={11} /></Field>
            <button className="btn primary small">Save recipient</button>
          </form>
        )}

        <div className="fieldgroup">
          <Field label="You send">
            <select value={from} onChange={(e) => setFrom(e.target.value)}>{(wallet?.balances.filter((b) => b.availableMinor > 0).map((b) => b.currency) ?? ['USD']).map((c) => <option key={c}>{c}</option>)}</select>
          </Field>
          <Field label="Amount"><input inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        </div>
        <Field label="Purpose"><input value={purpose} onChange={(e) => setPurpose(e.target.value)} minLength={2} maxLength={60} required /></Field>
        <Field label="Note (optional)"><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} /></Field>

        {quote && recipient && (
          <div className="card tight mb" style={{ boxShadow: 'none' }}>
            <div className="kv"><span className="k">Rate</span><span className="v">{Number(quote.rate).toFixed(5)} (1 {from} → {recipient.currency})</span></div>
            <div className="kv"><span className="k">Fee</span><span className="v">{money(quote.feeMinor, '$')} · {quote.feeLabel}</span></div>
            <div className="kv"><span className="k">Total debit</span><span className="v">{money(quote.totalDebitMinor, '$')} {from}</span></div>
            <div className="kv"><span className="k">{recipient.fullName.split(' ')[0]} receives</span><span className="v">≈ {(quote.recipientMinor / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })} {recipient.currency}</span></div>
            <div className="kv"><span className="k">Provider</span><span className="v">{quote.providerLabel} · ETA {quote.eta}</span></div>
          </div>
        )}

        {profile?.hasPin && (
          <Field label="Wallet PIN"><input type="password" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} required /></Field>
        )}
        <button className="btn primary" onClick={send} disabled={busy || !valid() || !recipient || !purpose.trim()}>
          {busy ? 'Sending…' : conn.live ? `Send ${valid() ? money(minor(), '$') : ''} →` : 'Queue transfer (offline)'}
        </button>
        <div className="tiny muted mt">KYC verified account required for international payouts.</div>
      </Card>

      {receipt && !receipt.queued && receipt.tracking && (
        <Card title={`Tracking ${receipt.tracking.reference}`}>
          <div className="kv"><span className="k">Status</span><span className="v">{receipt.tracking.status}</span></div>
          <div className="col mt" style={{ gap: 10 }}>
            {receipt.tracking.events.map((e: any, i: number) => (
              <div className="row" key={i}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--ok)' }} />
                <span className="grow tiny">{e.status} — {e.note}</span>
                <span className="time">{longDate(e.at)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
      {receipt?.queued && <Card><div className="banner info">📥 Queued offline. After sync, the receipt with live tracking shows in Activity.</div></Card>}
    </>
  );
}
