import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { useAuth } from '../state/auth';
import { useConnectivity } from '../state/connectivity';
import { apiMutate, apiRead, QueuedResult } from '../api/client';
import type { Wallet } from '../lib/models';
import { PageHead, Card, Field, useToast, money } from '../ui/ui';

export function QrScreen() {
  const { profile } = useAuth();
  const conn = useConnectivity();
  const toast = useToast();
  const nav = useNavigate();
  const uid = profile?.id ?? 'anon';
  const [mode, setMode] = useState<'receive' | 'pay'>('receive');

  // receive
  const [ccy, setCcy] = useState('USD');
  const [amount, setAmount] = useState('');
  const [payload, setPayload] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // pay
  const [input, setInput] = useState('');
  const [resolved, setResolved] = useState<any>(null);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [wallet, setWallet] = useState<Wallet | null>(null);

  useEffect(() => {
    void apiRead<Wallet>('/v1/wallet', { userId: uid, cacheName: 'wallet', live: conn.live }).then((w) => setWallet(w.data)).catch(() => undefined);
  }, [uid, conn.live]);

  useEffect(() => {
    if (payload && canvasRef.current) {
      void QRCode.toCanvas(canvasRef.current, payload, { width: 240, margin: 1, color: { dark: '#0b1020', light: '#ffffff' } });
    }
  }, [payload]);

  const generate = async () => {
    const minor = amount ? Math.round(parseFloat(amount) * 100) : undefined;
    try {
      const r = (await apiMutate<{ payload: string; paytag: string; currency: string; amountMinor?: number }>('/v1/qr/code', {
        currency: ccy, ...(minor ? { amountMinor: minor } : {}), note: undefined
      }, { userId: uid, live: conn.live })) as { payload: string };
      setPayload(r.payload);
      toast('ok', 'QR code ready — signed, safe to screenshot');
    } catch (e: any) { toast('err', conn.live ? e?.message : 'Creating a payment code needs a connection (HMAC signing happens server-side)'); }
  };

  const resolve = async () => {
    setResolved(null);
    if (!input.trim()) return;
    try {
      const data = await apiMutate<any>('/v1/qr/resolve', { payload: input.trim() }, { userId: uid, live: conn.live });
      setResolved(data);
    } catch (e: any) { toast('err', e?.message ?? 'Invalid or tampered code'); }
  };

  const pay = async () => {
    if (!resolved) return;
    setBusy(true);
    try {
      const res = await apiMutate<any>('/v1/qr/pay', { payload: input.trim(), pin }, {
        userId: uid, live: conn.live,
        queue: { label: `QR pay ${money(resolved.amountMinor ?? 0, ccy)} to @${resolved.payee?.paytag}`, meta: { type: 'qr_pay', amountMinor: resolved.amountMinor, currency: resolved.currency, counterparty: resolved.payee?.paytag, description: 'QR payment' } },
        optimistic: { type: 'qr_pay', amountMinor: resolved.amountMinor ?? 0, currency: resolved.currency ?? ccy, description: 'QR pay', counterpartyName: resolved.payee?.paytag }
      });
      toast((res as QueuedResult)?.queued ? 'info' : 'ok', (res as QueuedResult)?.queued ? 'Payment queued — will process when online' : 'Paid via QR 🎉');
      nav('/activity');
    } catch (e: any) { toast('err', e?.message ?? 'Payment failed'); }
    finally { setBusy(false); }
  };

  return (
    <>
      <PageHead title="QR payments" sub="Signed payloads — tampering voids the code" />
      <div className="crumb">
        <button className={mode === 'receive' ? 'active' : ''} onClick={() => setMode('receive')}>↙️ Receive</button>
        <button className={mode === 'pay' ? 'active' : ''} onClick={() => setMode('pay')}>📷 Pay</button>
      </div>

      {mode === 'receive' && (
        <Card>
          <div className="row between mb">
            <span className="t1">@{profile?.paytag ?? profile?.email}</span>
            <span className="pill completed">signed</span>
          </div>
          <div className="fieldgroup">
            <Field label="Currency">
              <select value={ccy} onChange={(e) => setCcy(e.target.value)}>{(wallet?.balances.map((b) => b.currency) ?? ['USD', 'EUR']).map((c) => <option key={c}>{c}</option>)}</select>
            </Field>
            <Field label="Amount (optional)"><input inputMode="decimal" placeholder="leave open" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          </div>
          <button className="btn primary" onClick={generate} disabled={!conn.live}>Generate code</button>
          {!conn.live && <div className="banner warn mt">QR codes are signed by the server — generation requires a connection. Any code you already created stays valid.</div>}
          {payload && (
            <>
              <div className="qrbox"><canvas ref={canvasRef} /></div>
              <div className="code">{payload}</div>
              <div className="tiny muted mt" style={{ textAlign: 'center' }}>Show this code or copy the payload for another PayInter user.</div>
            </>
          )}
        </Card>
      )}

      {mode === 'pay' && (
        <Card>
          <Field label="Paste the code payload" hint="On a real device this box is a camera scanner — in the web demo, paste the string.">
            <textarea rows={4} value={input} onChange={(e) => { setInput(e.target.value); setResolved(null); }} style={{ resize: 'vertical' }} />
          </Field>
          <button className="btn ghost mb" onClick={resolve} disabled={!conn.live || !input.trim()}>Inspect code</button>
          {resolved && (
            <>
              <div className="kv"><span className="k">Pay to</span><span className="v">@{resolved.payee.paytag} — {resolved.payee.firstName} {resolved.payee.lastName}</span></div>
              {resolved.amountMinor != null && <div className="kv"><span className="k">Amount</span><span className="v">{money(resolved.amountMinor, resolved.currency === 'USD' ? '$' : resolved.currency === 'EUR' ? '€' : resolved.currency)}</span></div>}
              <div className="kv"><span className="k">Signature</span><span className="v">✓ valid</span></div>
              {profile?.hasPin && (
                <Field label="Wallet PIN"><input type="password" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} /></Field>
              )}
              <button className="btn primary mt" onClick={pay} disabled={busy}>
                {busy ? 'Paying…' : 'Pay now'}
              </button>
            </>
          )}
          {!conn.live && <div className="banner warn mt">Resolving/paying needs the server — saved codes work offline inside your own receipt book (Activity).</div>}
        </Card>
      )}
    </>
  );
}
