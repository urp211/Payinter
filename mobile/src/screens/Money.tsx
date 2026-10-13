import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../state/auth';
import { useConnectivity } from '../state/connectivity';
import { apiRead, apiMutate, QueuedResult } from '../api/client';
import type { Card as CardT, Wallet } from '../lib/models';
import { PageHead, Card, Field, useToast, money } from '../ui/ui';

export function MoneyScreen() {
  const { profile } = useAuth();
  const conn = useConnectivity();
  const toast = useToast();
  const uid = profile?.id ?? 'anon';
  const [tab, setTab] = useState<'card' | 'bank' | 'mobile'>('card');
  const [cards, setCards] = useState<CardT[]>([]);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [cardId, setCardId] = useState('');
  const [ccy, setCcy] = useState('USD');
  const [amount, setAmount] = useState('');
  const [pin, setPin] = useState('');
  const [quote, setQuote] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void apiRead<{ items: CardT[] }>('/v1/cards', { userId: uid, cacheName: 'cards', live: conn.live })
      .then((r) => { setCards(r.data.items); const d = r.data.items.find((c) => c.isDefault) ?? r.data.items[0]; if (d) setCardId(d.id); })
      .catch(() => undefined);
    void apiRead<Wallet>('/v1/wallet', { userId: uid, cacheName: 'wallet', live: conn.live })
      .then((r) => setWallet(r.data)).catch(() => undefined);
  }, [uid, conn.live]);

  const minor = () => Math.round(parseFloat(amount.replace(',', '.')) * 100);
  const valid = () => Number.isFinite(minor()) && minor() > 0;

  useEffect(() => {
    setQuote(null);
    if (tab !== 'card' || !valid() || !conn.live) return;
    const t = setTimeout(async () => {
      try { setQuote(await apiMutate<any>('/v1/payments/topup/quote', { currency: ccy, amountMinor: minor() }, { userId: uid, live: conn.live })); }
      catch (e: any) { toast('info', e?.message ?? 'Quote failed'); }
    }, 300);
    return () => clearTimeout(t);
  }, [tab, amount, ccy, conn.live, uid, toast]);

  const executeCard = async () => {
    if (!valid()) return;
    setBusy(true); setResult(null);
    try {
      const res = await apiMutate<any>('/v1/payments/topup', { cardId, currency: ccy, amountMinor: minor(), pin: pin || undefined }, {
        userId: uid, live: conn.live,
        queue: { label: `Card top up ${money(minor(), '$')} ${ccy}`, meta: { type: 'card_topup', amountMinor: minor(), currency: ccy, description: 'Card top up' } },
        optimistic: { type: 'card_topup', amountMinor: minor(), currency: ccy, description: 'Card top up (queued)' }
      });
      if ((res as QueuedResult).queued) { setResult({ queued: true }); toast('info', 'Top up saved — will process when online'); }
      else { setResult(res); toast(res.status === 'completed' ? 'ok' : res.status === 'failed' ? 'err' : 'info', `Top up ${res.status}`); }
    } catch (e: any) { toast('err', e?.message ?? 'Top up failed'); }
    finally { setBusy(false); }
  };

  const executeBank = async () => {
    if (!valid()) return;
    setBusy(true); setResult(null);
    try {
      const res = await apiMutate<any>('/v1/topups/bank/create', { currency: ccy, amountMinor: minor() }, {
        userId: uid, live: conn.live,
        queue: { label: `Bank top up ${money(minor(), '$')} ${ccy}`, meta: { type: 'bank_topup', amountMinor: minor(), currency: ccy, description: 'Bank transfer top up' } },
        optimistic: { type: 'bank_topup', amountMinor: minor(), currency: ccy, description: 'Bank transfer top up (queued)' }
      });
      if ((res as QueuedResult).queued) { setResult({ queued: true }); toast('info', 'Saved — instructions will be issued when online'); }
      else setResult(res);
    } catch (e: any) { toast('err', e?.message ?? 'Failed'); }
    finally { setBusy(false); }
  };

  const executeMobile = async () => {
    if (!valid()) return;
    setBusy(true); setResult(null);
    try {
      const res = await apiMutate<any>('/v1/topups/mobile-money/initiate', { currency: ccy, amountMinor: minor() }, {
        userId: uid, live: conn.live,
        queue: { label: `Mobile money ${money(minor(), '$')} ${ccy}`, meta: { type: 'mobile_money', amountMinor: minor(), currency: ccy, description: 'Mobile money top up' } },
        optimistic: { type: 'mobile_money', amountMinor: minor(), currency: ccy, description: 'Mobile money top up (queued)' }
      });
      if ((res as QueuedResult).queued) { setResult({ queued: true }); toast('info', 'Saved — will initiate when online'); }
      else setResult(res);
    } catch (e: any) { toast('err', e?.message ?? 'Failed'); }
    finally { setBusy(false); }
  };

  return (
    <>
      <PageHead title="Add money" sub={conn.live ? 'Card, bank transfer or mobile money' : 'Offline — requests queue for when you reconnect'} />
      <div className="crumb">
        <button className={tab === 'card' ? 'active' : ''} onClick={() => { setTab('card'); setResult(null); }}>💳 Card top up</button>
        <button className={tab === 'bank' ? 'active' : ''} onClick={() => { setTab('bank'); setResult(null); }}>🏦 Bank transfer</button>
        <button className={tab === 'mobile' ? 'active' : ''} onClick={() => { setTab('mobile'); setResult(null); }}>📱 Mobile money</button>
      </div>

      <Card>
        <div className="fieldgroup">
          <Field label="Currency">
            <select value={ccy} onChange={(e) => setCcy(e.target.value)}>{(wallet?.balances.map((b) => b.currency) ?? ['USD', 'EUR', 'AOA']).map((c) => <option key={c}>{c}</option>)}</select>
          </Field>
          <Field label="Amount"><input inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        </div>

        {tab === 'card' && (
          <>
            {cards.length === 0 && <div className="banner warn mb">No cards yet. <Link to="/cards">Tokenize a card</Link> first (demo: 4242 4242 4242 4242).</div>}
            <Field label="Card">
              <select value={cardId} onChange={(e) => setCardId(e.target.value)}>
                {cards.map((c) => <option key={c.id} value={c.id}>{c.brand} •••• {c.last4}{c.isDefault ? ' (default)' : ''}{c.status === 'frozen' ? ' — frozen' : ''}</option>)}
                {cards.length === 0 && <option value="">— add one in Cards</option>}
              </select>
            </Field>
            {quote && <div className="banner info mb">Fee {money(quote.feeMinor, '$')} · you receive the full {money(quote.netMinor, '$')} {ccy} — gross debit {money(quote.grossMinor, '$')}</div>}
            {profile?.hasPin && (
              <Field label="Wallet PIN"><input type="password" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} /></Field>
            )}
            <button className="btn primary" onClick={executeCard} disabled={busy || !valid() || !cardId}>
              {busy ? 'Processing…' : conn.live ? 'Top up now' : 'Queue top up (offline)'}
            </button>
            <div className="tiny muted mt">Sandbox card processor: •••• 9995 always declines, •••• 3155 requires review (3DS). KYC verified account required.</div>
          </>
        )}

        {tab === 'bank' && (
          <>
            <div className="tiny muted mb">You get fake transfer instructions; in sandbox the top up settles from the admin console. Pending amounts show in your wallet until then.</div>
            <button className="btn primary" onClick={executeBank} disabled={busy || !valid()}>{busy ? 'Creating…' : 'Get transfer instructions'}</button>
          </>
        )}

        {tab === 'mobile' && (
          <>
            <div className="tiny muted mb">Simulated prompt to your handset (Unitel Money / Africell style). Approved from the admin sandbox.</div>
            <button className="btn primary" onClick={executeMobile} disabled={busy || !valid()}>{busy ? 'Initiating…' : 'Send mobile prompt'}</button>
          </>
        )}
      </Card>

      {result && !result.queued && tab === 'card' && result.paymentId && (
        <Card>
          <div className="kv"><span className="k">Status</span><span className="v">{result.status}</span></div>
          <div className="kv"><span className="k">Reference</span><span className="v mono tiny">{result.reference}</span></div>
          <div className="tiny muted mt">See the receipt and any failure reason in Activity.</div>
          {result.status === 'failed' && <div className="banner off mt" style={{ marginTop: 10 }}>Declined by the sandbox processor — try a card not ending in 9995.</div>}
          {result.status === 'pending' && <div className="banner warn mt" style={{ marginTop: 10 }}>3-D Secure simulated: the admin sandbox will settle it (then your wallet updates).</div>}
        </Card>
      )}

      {result && !result.queued && tab === 'bank' && result.bankDetails && (
        <Card title="Transfer to (sandbox account — no real money)">
          <div className="kv"><span className="k">Bank</span><span className="v">{result.bankDetails.bankName}</span></div>
          <div className="kv"><span className="k">Account name</span><span className="v">{result.bankDetails.accountName}</span></div>
          <div className="kv"><span className="k">IBAN</span><span className="v mono tiny">{result.bankDetails.iban}</span></div>
          <div className="kv"><span className="k">SWIFT</span><span className="v mono">{result.bankDetails.swift}</span></div>
          <div className="kv"><span className="k">Reference</span><span className="v mono">{result.reference}</span></div>
          <div className="tiny muted mt">{result.note}</div>
        </Card>
      )}

      {result && !result.queued && tab === 'mobile' && result.paymentId && (
        <Card><div className="banner info">{result.note ?? 'Prompt sent — check your handset (simulated).'}</div><div className="tiny muted mt">Reference {result.reference}</div></Card>
      )}

      {result?.queued && (
        <Card><div className="banner info">📥 Saved in your outbox. It will execute automatically when you're back online and you'll see it in Activity with full fee disclosure.</div></Card>
      )}
    </>
  );
}
