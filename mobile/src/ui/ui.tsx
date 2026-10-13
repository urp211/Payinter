import React, { useEffect, useState, createContext, useContext, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

export function money(minor: number, symbol: string, decimals = 2): string {
  const n = minor / Math.pow(10, decimals ?? 2);
  return `${symbol}${n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}
export function usd(minor: number): string {
  return `US$${(minor / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
export function shortDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  const same = d.toDateString() === today.toDateString();
  return same ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
              : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}
export function longDate(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export const TX_ICON: Record<string, string> = {
  send: '↗️', receive: '↙️', qr_pay: '📷', qr_receive: '↙️', card_topup: '💳',
  bank_topup: '🏦', mobile_money: '📱', convert: '🔄', international: '🌍',
  card_payment: '🛒', refund: '🔁', seed: '🌱'
};

export function StatusPill({ status, offline }: { status: string; offline?: boolean }) {
  if (offline) return <span className="pill offline">queued · will sync</span>;
  const lab: Record<string, string> = {
    completed: 'completed', pending: 'pending', pending_review: 'under review',
    failed: 'failed', cancelled: 'cancelled'
  };
  return <span className={`pill ${status}`}>{lab[status] ?? status}</span>;
}

export function PageHead({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  const nav = useNavigate();
  return (
    <div className="header">
      <button className="back" onClick={() => nav(-1)} aria-label="Back">←</button>
      <div className="col" style={{ flex: 1 }}>
        <h1>{title}</h1>
        {sub && <span className="sub">{sub}</span>}
      </div>
      {right}
    </div>
  );
}

export function Card({ children, tight, title }: { children: React.ReactNode; tight?: boolean; title?: string }) {
  return <div className={`card ${tight ? 'tight' : ''}`}>{title && <h3>{title}</h3>}{children}</div>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <div className="field"><label>{label}</label>{children}{hint && <span className="hint">{hint}</span>}</div>;
}

/* ---------- toasts ---------- */
interface Toast { id: number; kind: 'ok' | 'err' | 'info'; text: string }
const ToastCtx = createContext<(kind: Toast['kind'], text: string) => void>(null as never);
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4600);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-host">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}

export function Loadable<T>({ load, render }: { load: () => Promise<T>; render: (v: T) => React.ReactNode }) {
  const [val, setVal] = useState<T | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setVal(null); setErr(null);
    load().then(setVal).catch((e) => setErr(String(e?.message ?? e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (err) return <div className="card tight banner off">{err}</div>;
  if (val === null) return <div className="spin" />;
  return <>{render(val)}</>;
}
