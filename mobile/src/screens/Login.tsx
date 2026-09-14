import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../state/auth';
import { useConnectivity } from '../state/connectivity';
import { apiBase } from '../lib/apiBase';
import { Field, useToast } from '../ui/ui';

async function raw(path: string, body: unknown) {
  const res = await fetch(`${apiBase()}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-app-platform': 'web' }, body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export function LoginScreen() {
  const { signIn, continueOffline } = useAuth();
  const conn = useConnectivity();
  const toast = useToast();
  const nav = useNavigate();
  const [email, setEmail] = useState('demo@payinter.app');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const hasSnapshot = typeof localStorage !== 'undefined' && !!localStorage.getItem('payinter.lastProfile');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!conn.live) { toast('err', 'No connection to the server. Enter offline mode or try again when connected.'); return; }
    setBusy(true);
    try {
      const { ok, data } = await raw('/v1/auth/login', { email: email.trim().toLowerCase(), password });
      if (!ok) { toast('err', data?.error?.message ?? 'Login failed'); return; }
      const { user, tokens } = data;
      signIn({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, expiresAt: Date.now() + tokens.expiresIn * 1000 }, user);
      nav('/');
    } catch {
      toast('err', 'Could not reach the server.');
    } finally { setBusy(false); }
  };

  const fillDemo = () => { setEmail('demo@payinter.app'); setPassword('Demo1234!'); };

  return (
    <div className="auth-wrap">
      <div>
        <div className="logo">PayInter</div>
        <div className="muted tiny">International payments made simple · sandbox demo</div>
      </div>
      <form className="card" onSubmit={submit}>
        <Field label="Email"><input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
        <Field label="Password"><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
        <button className="btn primary" disabled={busy || !conn.live}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <div className="row between mt">
          <button type="button" className="btn ghost small" onClick={fillDemo}>Use demo credentials</button>
          <Link to="/register" className="tiny">Create account →</Link>
        </div>
      </form>
      {!conn.live && hasSnapshot && (
        <button className="btn ghost" onClick={continueOffline}>
          📡 Continue offline with your last synced data
        </button>
      )}
      {!conn.live && !hasSnapshot && (
        <div className="banner off">No network. Install/open again when connected to sign in once — afterwards the app works offline.</div>
      )}
      <div className="tiny muted" style={{ textAlign: 'center' }}>
        Sandbox: no real money moves. Docs: <Link to="/legal/terms">Terms</Link> · <Link to="/legal/sandbox-notice">Sandbox notice</Link>
      </div>
    </div>
  );
}
