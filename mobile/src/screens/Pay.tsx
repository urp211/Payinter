import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../state/auth';
import { useConnectivity } from '../state/connectivity';
import { apiRead, apiMutate, QueuedResult } from '../api/client';
import type { Wallet } from '../lib/models';
import { PageHead, Card, Field, useToast, money } from '../ui/ui';
import { getCache } from '../sync/cache';

interface LookupUser { paytag: string; firstName?: string; lastName?: string; countryCode?: string }

export function PayScreen() {
  const { profile } = useAuth();
  const conn = useConnectivity();
  const toast = useToast();
  const nav = useNavigate();
  const uid = profile?.id ?? 'anon';
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [mode, setMode] = useState<'send' | 'convert'>('send');

  // send state
  const [identifier, setIdentifier] = useState('');
  const [found, setFound] = useState<LookupUser | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [pin, setPin] = useState('');
  // convert state
  const [from, setFrom] = useState('USD');
  const [to, setTo] = useState('EUR');
  const [quote, setQuote] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void apiRead<Wallet>('/v1/wallet', { userId: uid, cacheName: 'wallet', live: conn.live })
      .then((w) => setWallet(w.data)).catch(() => undefined);
  }, [uid, conn.live]);

  const balances = useMemo(() => (wallet?.balances ?? []).filter((b) => b.availableMinor > 0), [wallet]);
  const [ccy, setCcy] = useState('USD');
  const balanceOf = (c: string) => wallet?.balances.find((b) => b.currency === c);

  // lookup payee (debounced)
  useEffect(() => {
    setFound(null);
    const id = identifier.trim().replace(/^@/, '');
    if (id.length < 3) return;
    const t = setTimeout(async () => {
      try {
        const r = await apiRead<{ found: boolean; user?: LookupUser }>(`/v1/users/lookup?identifier=${encodeURIComponent(id)}`, { userId: uid, live: conn.live });
        if (r.data.found && r.data.user) setFound(r.data.user);
      } catch { /* offline: unverifiable */ }
    }, 350);
    return () => clearTimeout(t);
  }, [identifier, uid, conn.live]);

  const toMajor = (v: string) => Math.round(parseFloat(v.replace(',', '.')) * 100);
  const majorOk = () => Number.isFinite(toMajor(amount)) && toMajor(amount) > 0;

  const submitSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!majorOk()) { toast('err', 'Enter a valid amount'); return; }
    const minor = toMajor(amount);
    setBusy(true);
    try {
      const res = await apiMutate<any>('/v1/transfers/send', {
        identifier: identifier.trim(), currency: ccy, amountMinor: minor, note: note || undefined, pin: pin || undefined
      }, {
        userId: uid, live: conn.live,
        queue: { label: `Send ${money(minor, symbolFor(ccy))} to ${identifier}`, meta: { type: 'send', amountMinor: minor, currency: ccy, counterparty: identifier } },
        optimistic: { type: 'send', amountMinor: minor, currency: ccy, description: 'Send money', counterpartyName: found ? `${found.firstName ?? ''} ${found.lastName ?? ''}`.trim() || `@${found.paytag}` : identifier, note }
      });
      if ((res as QueuedResult).queued) { toast('info', 'Saved offline — will send automatically when online'); nav('/activity'); }
      else {
        toast((res as any).status === 'completed' ? 'ok' : 'info',
          (res as any).status === 'completed' ? 'Money sent 🎉' : 'Sent for compliance review — you\'ll be notified');
        nav('/activity');
      }
    } catch (e: any) { toast('err', e?.message ?? 'Transfer failed'); }
    finally { setBusy(false); }
  };

  // convert
  useEffect(() => {
    setQuote(null);
    if (mode !== 'convert' || !majorOk()) return;
    const t = setTimeout(async () => {
      try {
        const r = await apiMutate<any>('/v1/wallet/convert/quote', { from, to, amountMinor: toMajor(amount) }, { userId: uid, live: conn.live });
        setQuote(r);
      } catch { setQuote(null); }
    }, 300);
    return () => clearTimeout(t);
  }, [amount, from, to, mode, conn.live, uid]);

  const submitConvert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!majorOk()) { toast('err', 'Enter a valid amount'); return; }
    const minor = toMajor(amount);
    setBusy(true);
    try {
      await apiMutate<any>('/v1/wallet/convert', { from, to, amountMinor: minor, pin: pin || undefined }, {
        userId: uid, live: conn.live,
        queue: { label: `Convert ${money(minor, symbolFor(from))} → ${to}`, meta: { type: 'convert', amountMinor: minor, currency: from } },
        optimistic: { type: 'convert', amountMinor: minor, currency: from, description: `Convert ${from} → ${to}` }
      });
      toast('ok', 'Conversion queued/completed — check Activity');
      nav('/activity');
    } catch (e: any) { toast('err', e?.message ?? 'Conversion failed'); }
    finally { setBusy(false); }
  };

  return (
    <>
      <PageHead title="Pay" sub={conn.live ? 'Send to users or convert between currencies' : 'Offline — sends queue up and sync later'} />
      <div className="crumb">
        <button className={mode === 'send' ? 'active' : ''} onClick={() => setMode('send')}>💸 Send to someone</button>
        <button className={mode === 'convert' ? 'active' : ''} onClick={() => setMode('convert')}>🔄 Convert currency</button>
      </div>

      {mode === 'send' ? (
        <form className="card" onSubmit={submitSend}>
          <Field label="Paytag, email or phone" hint={conn.live ? 'We\'ll look them up as you type' : 'Lookup needs a connection — you can still queue by paytag if you know it'}>
            <input placeholder="@demo-2436" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required autoCapitalize="off" />
          </Field>
          {found && (
            <div className="banner ok mb">✓ {found.firstName ?? ''} {found.lastName ?? ''} — @{found.paytag} {found.countryCode ? `· ${found.countryCode}` : ''}</div>
          )}
          <div className="fieldgroup">
            <Field label="Amount">
              <input inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </Field>
            <Field label="Currency">
              <select value={ccy} onChange={(e) => setCcy(e.target.value)}>
                {(wallet?.balances.map((b) => b.currency) ?? ['USD', 'EUR', 'GBP']).map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          </div>
          {majorOk() && balanceOf(ccy) && toMajor(amount) > balanceOf(ccy)!.availableMinor && !conn.live && (
            <div className="banner warn mb">⚠ Offline: we can't verify your balance. The send may be rejected when syncing.</div>
          )}
          {majorOk() && balanceOf(ccy) && conn.live && toMajor(amount) > balanceOf(ccy)!.availableMinor && (
            <div className="banner off mb">Insufficient {ccy} balance ({money(balanceOf(ccy)!.availableMinor, symbolFor(ccy))}).</div>
          )}
          <Field label="Note (optional)"><input placeholder="Dinner 🍜" value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} /></Field>
          {profile?.hasPin && (
            <Field label="Wallet PIN" hint={conn.live ? 'Verified online' : 'Rechecked automatically when the send syncs'}>
              <input type="password" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} required />
            </Field>
          )}
          <button className="btn primary" disabled={busy || !majorOk()}>
            {busy ? 'Working…' : conn.live ? 'Send now' : 'Queue send (offline)'}
          </button>
        </form>
      ) : (
        <form className="card" onSubmit={submitConvert}>
          <div className="fieldgroup">
            <Field label="From"><select value={from} onChange={(e) => setFrom(e.target.value)}>{(wallet?.balances.map((b) => b.currency) ?? ['USD']).map((c) => <option key={c} value={c}>{c}</option>)}</select></Field>
            <Field label="To"><select value={to} onChange={(e) => setTo(e.target.value)}>{['USD', 'EUR', 'GBP', 'AOA', 'BRL', 'CAD', 'NGN', 'KES'].filter((c) => c !== from).map((c) => <option key={c} value={c}>{c}</option>)}</select></Field>
          </div>
          <Field label="Amount"><input inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} required /></Field>
          {quote && (
            <div className="banner info mb">
              Rate {typeof quote.rate === 'string' ? Number(quote.rate).toFixed(4) : quote.rate} · fee {quote.feeMinor} minor · you'll receive ≈ {(quote.receiveMinor / 100).toFixed(2)} {to}
            </div>
          )}
          {!conn.live && <div className="banner warn mb">Offline: conversion runs at the next available live rate when synced.</div>}
          {profile?.hasPin && (
            <Field label="Wallet PIN"><input type="password" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} required /></Field>
          )}
          <button className="btn primary" disabled={busy || !majorOk() || from === to}>
            {busy ? 'Working…' : conn.live ? 'Convert now' : 'Queue conversion (offline)'}
          </button>
        </form>
      )}

      {!conn.live && (
        <CachedRatesFootnote userId={uid} />
      )}
    </>
  );
}

function symbolFor(c: string) { return c === 'USD' ? '$' : c === 'EUR' ? '€' : c === 'GBP' ? '£' : c === 'AOA' ? 'Kz' : ''; }

function CachedRatesFootnote({ userId }: { userId: string }) {
  const [rates, setRates] = useState<any>(null);
  useEffect(() => { void getCache<any>(userId, 'rates').then((r) => setRates(r?.data ?? null)); }, [userId]);
  if (!rates) return null;
  return (
    <div className="tiny muted mt" style={{ textAlign: 'center' }}>
      Last synced rates (USD): {(rates.pairs ?? []).slice(0, 4).map((p: any) => `${p.quote} ${Number(p.rate).toFixed(3)}`).join(' · ')}
    </div>
  );
}
