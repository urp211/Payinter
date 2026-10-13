import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../state/auth';
import { useConnectivity } from '../state/connectivity';
import { apiBase } from '../lib/apiBase';
import { Field, useToast } from '../ui/ui';

export function RegisterScreen() {
  const { signIn } = useAuth();
  const conn = useConnectivity();
  const toast = useToast();
  const nav = useNavigate();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '', countryCode: 'AO' });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!conn.live) { toast('err', 'Registration needs a connection. Offline mode is for existing users.'); return; }
    setBusy(true);
    try {
      const res = await fetch(`${apiBase()}/v1/auth/register`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-app-platform': 'web' },
        body: JSON.stringify({ ...form, email: form.email.trim().toLowerCase() })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast('err', data?.error?.message ?? 'Registration failed'); return; }
      const { user, tokens } = data;
      signIn({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, expiresAt: Date.now() + tokens.expiresIn * 1000 }, user);
      toast('ok', `Welcome, ${user.firstName ?? 'there'}! Verify your email and set a PIN from More → Security.`);
      nav('/');
    } catch {
      toast('err', 'Could not reach the server.');
    } finally { setBusy(false); }
  };

  return (
    <div className="auth-wrap">
      <div>
        <div className="logo">Create your account</div>
        <div className="muted tiny">Multi-currency wallet · free P2P · sandbox</div>
      </div>
      <form className="card" onSubmit={submit}>
        <div className="fieldgroup">
          <Field label="First name"><input value={form.firstName} onChange={set('firstName')} minLength={2} required /></Field>
          <Field label="Last name"><input value={form.lastName} onChange={set('lastName')} minLength={2} required /></Field>
        </div>
        <Field label="Email"><input type="email" value={form.email} onChange={set('email')} required /></Field>
        <Field label="Password" hint="At least 10 characters with a number and a symbol">
          <input type="password" value={form.password} onChange={set('password')} minLength={10} required />
        </Field>
        <Field label="Country">
          <select value={form.countryCode} onChange={set('countryCode')}>
            {['AO', 'PT', 'BR', 'US', 'GB', 'NG', 'ZA', 'ES', 'FR', 'DE'].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <button className="btn primary" disabled={busy || !conn.live}>{busy ? 'Creating…' : 'Create account'}</button>
        <div className="tiny muted mt" style={{ textAlign: 'center' }}>
          Already registered? <Link to="/login">Sign in</Link>
        </div>
      </form>
    </div>
  );
}
