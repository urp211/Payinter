import React, { useEffect, useState, useCallback } from 'react';
import { Routes, Route, Navigate, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './state/auth';
import { useConnectivity } from './state/connectivity';
import { bindSessionHandlers } from './api/client';
import { outbox, OutboxOp } from './sync/outbox';
import { useToast } from './ui/ui';
import { idb } from './lib/idb';
import { appIconSvgInliner } from './lib/appIcon';

import { LoginScreen } from './screens/Login';
import { RegisterScreen } from './screens/Register';
import { HomeScreen } from './screens/Home';
import { ActivityScreen } from './screens/Activity';
import { TxDetailScreen } from './screens/TxDetail';
import { PayScreen } from './screens/Pay';
import { QrScreen } from './screens/Qr';
import { MoneyScreen } from './screens/Money';
import { IntlScreen } from './screens/Intl';
import { CardsScreen } from './screens/Cards';
import { NotificationsScreen } from './screens/Notifications';
import { MoreScreen } from './screens/More';
import { SupportScreen } from './screens/Support';
import { SecurityScreen } from './screens/Security';
import { LegalScreen } from './screens/Legal';
import { PrivacyScreen } from './screens/Privacy';
import { KycScreen } from './screens/Kyc';

/** Wires the API client's session refresh + the outbox to connectivity. */
function RuntimeWiring() {
  const { session, signOut, setProfile, profile } = useAuth();
  const conn = useConnectivity();
  const toast = useToast();
  const loc = useLocation();
  const [pendingOps, setPendingOps] = useState(0);

  // bind session handlers once
  useEffect(() => {
    bindSessionHandlers({
      get: () => session,
      set: (s) => {
        if (!s) void signOut(true);
        else {
          localStorage.setItem('payinter.session', JSON.stringify(s));
          // state update via re-sign-in would loop; store is source of truth for api client
        }
      }
    });
  }, [session, signOut]);

  // flush whenever the API becomes reachable
  useEffect(() => {
    if (!conn.live || !session) return;
    let cancelled = false;
    const run = async () => {
      const res = await outbox.flush();
      if (!cancelled && res.sent > 0) {
        toast('ok', `${res.sent} queued operation${res.sent > 1 ? 's' : ''} synced`);
        window.dispatchEvent(new CustomEvent('payinter:cache', { detail: { name: 'refresh' } }));
      }
      if (!cancelled) for (const d of res.dropped) {
        toast('err', `Could not sync "${d.op.label}": ${d.error}`);
      }
      const left = await outbox.list();
      if (!cancelled) setPendingOps(left.length);
    };
    void run();
    const t = setInterval(run, 12_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [conn.live, session, toast]);

  // track outbox depth + events
  useEffect(() => {
    void outbox.list().then((l) => setPendingOps(l.length));
    const onOp = (e: Event) => {
      const d = (e as CustomEvent).detail as { type: string; op?: OutboxOp; error?: string };
      if (d.type === 'queued') { toast('info', `Saved offline — "${d.op?.label}" will sync when you're back online`); }
      void outbox.list().then((l) => setPendingOps(l.length));
    };
    window.addEventListener('payinter:outbox', onOp);
    return () => window.removeEventListener('payinter:outbox', onOp);
  }, [toast]);

  const offline = !conn.live;
  return (
    <div className="shell">
      <div className="strip">
        <div className="row between">
          <div className="row" style={{ gap: 8 }}>
            <span style={{ fontWeight: 800, letterSpacing: '-0.02em' }}>PayInter</span>
            <span className="pill pending" style={{ background: 'rgba(99,102,241,0.18)', color: '#c7d2fe' }}>SANDBOX</span>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <span className={`pill ${conn.live ? 'completed' : 'offline'}`}>
              {conn.live ? 'online' : (!conn.online ? 'offline' : 'server unreachable')}
            </span>
          </div>
        </div>
        {offline && (
          <div className="banner off">
            📡 You're offline — showing your last synced data. New operations queue up and sync automatically.
          </div>
        )}
        {pendingOps > 0 && (
          <div className="banner warn">
            ⏳ {pendingOps} operation{pendingOps > 1 ? 's' : ''} waiting to sync {conn.live ? '— syncing…' : '— will retry when online'}
          </div>
        )}
        {!offline && pendingOps === 0 && (
          <SandboxBanner />
        )}
      </div>

      <div className="page">
        <Routes>
          <Route path="/login" element={<LoginScreen />} />
          <Route path="/register" element={<RegisterScreen />} />
          <Route path="/" element={<HomeScreen />} />
          <Route path="/activity" element={<ActivityScreen />} />
          <Route path="/activity/:id" element={<TxDetailScreen />} />
          <Route path="/pay" element={<PayScreen />} />
          <Route path="/qr" element={<QrScreen />} />
          <Route path="/money" element={<MoneyScreen />} />
          <Route path="/cards" element={<CardsScreen />} />
          <Route path="/intl" element={<IntlScreen />} />
          <Route path="/notifications" element={<NotificationsScreen />} />
          <Route path="/support" element={<SupportScreen />} />
          <Route path="/profile" element={<MoreScreen />} />
          <Route path="/security" element={<SecurityScreen />} />
          <Route path="/kyc" element={<KycScreen />} />
          <Route path="/legal/:doc" element={<LegalScreen />} />
          <Route path="/privacy" element={<PrivacyScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>

      {session && <TabsBar pendingOps={pendingOps} />}
      <div style={{ display: 'none' }}>{loc.pathname}{profile?.id}</div>
      <MountIcon />
    </div>
  );
}

function SandboxBanner() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    void fetch('/v1/meta/bootstrap').then((r) => r.json()).then((b) => setMsg(b?.demoBanner ?? null)).catch(() => undefined);
  }, []);
  if (!msg) return null;
  return <div className="banner info">🧪 {msg}</div>;
}

const TABS = [
  { to: '/', label: 'Home', ic: '🏠', end: true },
  { to: '/activity', label: 'Activity', ic: '📄' },
  { to: '/qr', label: 'QR', ic: '📷' },
  { to: '/pay', label: 'Pay', ic: '💸' },
  { to: '/profile', label: 'More', ic: '⚙️' }
];

function TabsBar({ pendingOps }: { pendingOps: number }) {
  return (
    <nav className="tabs">
      <div className="tabs-inner">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end as never} className={({ isActive }) => (isActive ? 'active' : '')}>
            <span className="ic">{t.ic}</span>
            {t.label}
            {t.to === '/' && pendingOps > 0 && <span className="dot" />}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

function MountIcon() {
  useEffect(() => { void appIconSvgInliner(); }, []);
  return null;
}

/** Root guard: auth vs anonymous. */
export function App() {
  const { session, profile, ready, continueOffline, offlineSession } = useAuth();
  const conn = useConnectivity();
  const nav = useNavigate();
  const loc = useLocation();

  const onAuthRoute = loc.pathname === '/login' || loc.pathname === '/register';

  useEffect(() => {
    if (!ready) return;
    if (!session && !offlineSession && !onAuthRoute) nav('/login');
    if (session && onAuthRoute) nav('/');
  }, [ready, session, offlineSession, onAuthRoute, nav]);

  // offline entry: no server but we hold a snapshot → offer/enter offline mode
  useEffect(() => {
    if (!ready || session || onAuthRoute) return;
    if (!conn.live && localStorage.getItem('payinter.lastProfile')) continueOffline();
  }, [ready, session, conn.live, onAuthRoute, continueOffline]);

  if (!ready) return <div className="spin" />;
  return <RuntimeWiring />;
}
