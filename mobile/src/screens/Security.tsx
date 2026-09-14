import React, { useEffect, useState } from 'react';
import { useAuth } from '../state/auth';
import { useConnectivity } from '../state/connectivity';
import { apiRead, apiMutate } from '../api/client';
import { PageHead, Card, Field, useToast, longDate } from '../ui/ui';

export function SecurityScreen() {
  const { profile, setProfile } = useAuth();
  const conn = useConnectivity();
  const toast = useToast();
  const uid = profile?.id ?? 'anon';
  const [pin, setPin] = useState('');
  const [curPin, setCurPin] = useState('');
  const [otp, setOtp] = useState<{ code: string; demo?: string }>({ code: '' });
  const [sessions, setSessions] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const loadSessions = () => {
    void apiRead<{ items: any[] }>('/v1/auth/sessions', { userId: uid, cacheName: 'sessions', live: conn.live })
      .then((r) => setSessions(r.data.items)).catch(() => undefined);
    void apiRead<{ items: any[] }>('/v1/auth/security-events', { userId: uid, cacheName: 'security-events', live: conn.live })
      .then((r) => setEvents(r.data.items)).catch(() => undefined);
  };
  useEffect(loadSessions, [uid, conn.live]); // eslint-disable-line

  const needLive = () => { if (!conn.live) { toast('err', 'Security changes require a connection'); return true; } return false; };

  const setNewPin = async () => {
    if (needLive()) return;
    if (!/^\d{4}$/.test(pin)) { toast('err', 'PIN must be 4 digits'); return; }
    setBusy(true);
    try {
      await apiMutate('/v1/auth/pin', { pin }, { userId: uid, live: conn.live });
      toast('ok', 'PIN set — it now authorizes money movements');
      if (profile) setProfile({ ...profile, hasPin: true });
      setPin('');
    } catch (e: any) { toast('err', e?.message); } finally { setBusy(false); }
  };

  const changePin = async () => {
    if (needLive()) return;
    if (!/^\d{4}$/.test(curPin) || !/^\d{4}$/.test(pin)) { toast('err', 'Both PINs are 4 digits'); return; }
    setBusy(true);
    try {
      await apiMutate('/v1/auth/pin/change', { currentPin: curPin, newPin: pin }, { userId: uid, live: conn.live });
      toast('ok', 'PIN changed'); setCurPin(''); setPin('');
    } catch (e: any) { toast('err', e?.message); } finally { setBusy(false); }
  };

  const requestOtp = async () => {
    if (needLive()) return;
    try {
      const r = await apiMutate<any>('/v1/auth/request-otp', { purpose: 'verify_email' }, { userId: uid, live: conn.live });
      setOtp({ code: '', demo: r?.demoCode });
      toast('info', `Code sent by email (demo mode: included as ${r?.demoCode})`);
    } catch (e: any) { toast('err', e?.message); }
  };
  const verifyOtp = async () => {
    if (needLive()) return;
    try {
      await apiMutate<any>('/v1/auth/verify-otp', { purpose: 'verify_email', code: otp.code }, { userId: uid, live: conn.live });
      toast('ok', 'Email verified ✓');
      if (profile) setProfile({ ...profile, emailVerified: true });
    } catch (e: any) { toast('err', e?.message); }
  };
  const revoke = async (sid: string) => {
    if (needLive()) return;
    try {
      await apiMutate(`/v1/auth/sessions/${sid}`, {}, { userId: uid, live: conn.live, method: 'POST' });
      loadSessions();
    } catch (e: any) { toast('err', e?.message); }
  };

  return (
    <>
      <PageHead title="Security" sub="Second factor on money movements" />
      <Card title={profile?.hasPin ? 'Change wallet PIN' : 'Set your wallet PIN'}>
        <div className="banner info mb">A 4‑digit PIN authorizes sends, conversions, top ups and international payouts. 5 wrong attempts = 15 min lock.</div>
        {profile?.hasPin && <Field label="Current PIN"><input type="password" inputMode="numeric" maxLength={4} value={curPin} onChange={(e) => setCurPin(e.target.value.replace(/\D/g, ''))} /></Field>}
        <Field label={profile?.hasPin ? 'New PIN' : 'PIN (4 digits)'}><input type="password" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} /></Field>
        <button className="btn primary" disabled={busy || !conn.live} onClick={profile?.hasPin ? changePin : setNewPin}>{profile?.hasPin ? 'Change PIN' : 'Set PIN'}</button>
      </Card>

      <Card title="Email verification">
        {profile?.emailVerified ? (
          <div className="banner ok">✓ {profile.email} verified</div>
        ) : (
          <>
            <div className="tiny muted mb">Sandbox OTP: request returns the code directly (simulated email deliverability).</div>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn ghost small" onClick={requestOtp} disabled={!conn.live}>Request code</button>
              <input className="mono" style={{ flex: 1, background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 10, padding: 10, color: 'var(--text)' }} inputMode="numeric" maxLength={6} placeholder={`6-digit ${otp.demo ? `(got ${otp.demo})` : ''}`} value={otp.code} onChange={(e) => setOtp({ ...otp, code: e.target.value.replace(/\D/g, '') })} />
              <button className="btn primary small" onClick={verifyOtp} disabled={otp.code.length !== 6}>Verify</button>
            </div>
          </>
        )}
      </Card>

      <Card title="Sessions">
        <div className="list">
          {sessions.map((s) => (
            <div className="item" key={s.id}>
              <div className="ico">{s.platform?.includes('web') || !s.platform ? '🖥️' : '📱'}</div>
              <div className="grow">
                <div className="t1 tiny">{s.user_agent?.slice(0, 44) ?? s.platform ?? 'device'}</div>
                <div className="t2 tiny">{s.ip ?? '—'} · last used {longDate(s.last_used_at ?? s.created_at)}{s.revoked_at ? ' · revoked' : ''}</div>
              </div>
              {!s.revoked_at && <button className="btn ghost small" onClick={() => revoke(s.id)} disabled={!conn.live}>Revoke</button>}
            </div>
          ))}
          {sessions.length === 0 && <div className="tiny muted" style={{ padding: 8 }}>{conn.live ? 'Loading…' : 'Offline — will load when connected'}</div>}
        </div>
      </Card>

      <Card title="Recent security events" tight>
        <div className="list">
          {events.slice(0, 10).map((e) => (
            <div className="item" key={e.id} style={{ cursor: 'default' }}>
              <div className="grow"><div className="t1 tiny">{e.type.replace(/_/g, ' ')}</div><div className="t2 tiny">{longDate(e.created_at)}</div></div>
            </div>
          ))}
          {events.length === 0 && <div className="tiny muted" style={{ padding: 8 }}>{conn.live ? 'Loading…' : 'Offline snapshot empty'}</div>}
        </div>
      </Card>
    </>
  );
}
