import React, { useState } from 'react';
import { useAuth } from '../state/auth';
import { useConnectivity } from '../state/connectivity';
import { apiMutate } from '../api/client';
import { apiBase } from '../lib/apiBase';
import { PageHead, Card, useToast } from '../ui/ui';

export function PrivacyScreen() {
  const { profile, session, signOut } = useAuth();
  const conn = useConnectivity();
  const toast = useToast();
  const uid = profile?.id ?? 'anon';
  const [busy, setBusy] = useState(false);

  const download = async () => {
    if (!conn.live) { toast('err', 'Export requires a connection'); return; }
    setBusy(true);
    try {
      const res = await fetch(`${apiBase()}/v1/privacy/export`, {
        headers: { authorization: `Bearer ${session?.accessToken}`, 'x-app-platform': 'web' }
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `payinter-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast('ok', 'Export downloaded');
    } catch (e: any) { toast('err', e?.message); }
    finally { setBusy(false); }
  };

  const deleteAccount = async () => {
    if (!conn.live) { toast('err', 'Deletion requires a connection'); return; }
    if (!window.confirm('Delete your account? Ledger records are anonymized accounting entries; profile data is removed.')) return;
    setBusy(true);
    try {
      await apiMutate('/v1/privacy/delete', {}, { userId: uid, live: conn.live, method: 'POST' });
      toast('ok', 'Account deleted — goodbye');
      await signOut();
    } catch (e: any) { toast('err', e?.message ?? 'Deletion endpoint unavailable in this build'); }
    finally { setBusy(false); }
  };

  return (
    <>
      <PageHead title="Privacy" sub="You own your data — sandbox friendly" />
      <Card>
        <div className="kv"><span className="k">Storage while offline</span><span className="v">This device only (IndexedDB)</span></div>
        <div className="kv"><span className="k">Cards</span><span className="v">Token + last4 · never PAN/CVV</span></div>
        <div className="kv"><span className="k">PIN</span><span className="v">bcrypt-hashed with server pepper</span></div>
        <div className="kv"><span className="k">Passwords</span><span className="v">bcrypt-hashed</span></div>
      </Card>
      <div className="col mt" style={{ gap: 10 }}>
        <button className="btn primary" onClick={download} disabled={busy || !conn.live}>⬇️ Export my data (JSON)</button>
        <button className="btn danger" onClick={deleteAccount} disabled={busy || !conn.live}>🗑 Delete my account</button>
      </div>
      {!conn.live && <div className="banner warn mt">Both actions require a connection.</div>}
    </>
  );
}
