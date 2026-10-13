import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../state/auth';
import { useConnectivity } from '../state/connectivity';
import { PageHead, Card, useToast } from '../ui/ui';

export function MoreScreen() {
  const { profile, signOut } = useAuth();
  const conn = useConnectivity();
  const toast = useToast();
  const nav = useNavigate();

  const rows: { to: string | null; ic: string; t: string; s: string; onClick?: () => void }[] = [
    { to: '/kyc', ic: '🪪', t: 'Identity verification (KYC)', s: (profile?.kyc as any)?.status ? `Status: ${String((profile?.kyc as any).status)}` : 'Unlocks card top ups & international' },
    { to: '/cards', ic: '💳', t: 'Cards', s: 'Tokenized methods, freeze/default' },
    { to: '/security', ic: '🔐', t: 'Security', s: 'PIN, password, OTP, sessions' },
    { to: '/notifications', ic: '🔔', t: 'Notifications', s: 'Alerts & preferences' },
    { to: '/support', ic: '🎧', t: 'Support', s: 'FAQs, tickets, disputes' },
    { to: '/privacy', ic: '🗂️', t: 'Privacy', s: 'Export data, deletion request' },
    { to: '/legal/terms', ic: '📜', t: 'Legal & notices', s: 'Terms, sandbox, regulatory' },
  ];

  return (
    <>
      <PageHead title="More" sub={`@${profile?.paytag ?? ''}`} />
      <Card tight>
        <div className="row" style={{ padding: '6px 2px' }}>
          <div className="ico" style={{ width: 46, height: 46, borderRadius: 14, background: 'var(--card-2)', display: 'grid', placeItems: 'center', fontSize: 20 }}>👤</div>
          <div className="col grow">
            <span className="t1">{profile?.firstName} {profile?.lastName}</span>
            <span className="t2">{profile?.email}{profile?.emailVerified ? ' ✓' : ' · email not verified'} · {profile?.countryCode}</span>
          </div>
        </div>
      </Card>
      <Card tight>
        <div className="list">
          {rows.map((r) => (
            <div className="item" key={r.t} onClick={() => r.to && nav(r.to)}>
              <div className="ico">{r.ic}</div>
              <div className="grow">
                <div className="t1">{r.t}</div>
                <div className="t2">{r.s}</div>
              </div>
              <span className="muted">›</span>
            </div>
          ))}
        </div>
      </Card>
      <button className="btn danger mt" onClick={async () => { await signOut(); toast('info', 'Signed out — offline snapshot kept locally'); nav('/login'); }}>Sign out</button>
      <div className="tiny muted mt" style={{ textAlign: 'center' }}>
        v1.0 · sandbox build · data stays on this device when offline
      </div>
    </>
  );
}
