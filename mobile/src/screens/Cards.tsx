import React, { useEffect, useState } from 'react';
import { useAuth } from '../state/auth';
import { useConnectivity } from '../state/connectivity';
import { apiRead, apiMutate } from '../api/client';
import type { Card as CardT } from '../lib/models';
import { PageHead, Card, Field, useToast } from '../ui/ui';

export function CardsScreen() {
  const { profile } = useAuth();
  const conn = useConnectivity();
  const toast = useToast();
  const uid = profile?.id ?? 'anon';
  const [cards, setCards] = useState<CardT[]>([]);
  const [form, setForm] = useState({ pan: '', expMonth: '12', expYear: '2030', label: '' });
  const [busy, setBusy] = useState(false);

  const load = () => apiRead<{ items: CardT[] }>('/v1/cards', { userId: uid, cacheName: 'cards', live: conn.live })
    .then((r) => setCards(r.data.items)).catch(() => undefined);
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [uid, conn.live]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const pan = form.pan.replace(/\s/g, '');
    if (!/^\d{12,19}$/.test(pan)) { toast('err', 'Enter a valid card number'); return; }
    if (!conn.live) { toast('err', 'Tokenization is a server handshake — needs a connection'); return; }
    setBusy(true);
    try {
      // tokenize-first: the app sends ONLY a PSP-style token + last4 — never the PAN
      const token = `tok_sim_${pan.slice(-4)}_${Date.now().toString(36)}`;
      const brand = pan.startsWith('4') ? 'Visa' : pan.startsWith('5') ? 'Mastercard' : pan.startsWith('3') ? 'Amex' : 'Card';
      await apiMutate<CardT>('/v1/cards', {
        token, brand, last4: pan.slice(-4), expMonth: Number(form.expMonth), expYear: Number(form.expYear), label: form.label || undefined
      }, { userId: uid, live: conn.live });
      toast('ok', 'Card tokenized & linked — the full number never left this device');
      setForm({ pan: '', expMonth: '12', expYear: '2030', label: '' });
      await load();
    } catch (e: any) { toast('err', e?.message ?? 'Failed to add card'); }
    finally { setBusy(false); }
  };

  const act = async (card: CardT, action: 'freeze' | 'unfreeze' | 'default') => {
    try {
      await apiMutate<CardT>(`/v1/cards/${card.id}/${action}`, {}, {
        userId: uid, live: conn.live,
        queue: { label: `${action} card •••• ${card.last4}`, meta: { type: 'card_state' } }
      });
      toast('ok', action === 'default' ? 'Set as default' : `Card ${action === 'freeze' ? 'frozen' : 'unfrozen'}`);
      await load();
    } catch (e: any) { toast('err', e?.message ?? 'Action failed'); }
  };

  return (
    <>
      <PageHead title="Cards" sub="Tokenized payment methods — PAN never stored anywhere" />
      <Card tight>
        <div className="list">
          {cards.map((c) => (
            <div className="item" key={c.id}>
              <div className="ico">💳</div>
              <div className="grow">
                <div className="t1">{c.brand} •••• {c.last4} {c.isDefault && <span className="pill completed">default</span>}</div>
                <div className="t2">{c.label ?? ''} · exp {c.expMonth}/{c.expYear} · {c.status}</div>
              </div>
              <div className="col" style={{ gap: 6 }}>
                <button className="btn ghost small" onClick={() => act(c, c.status === 'active' ? 'freeze' : 'unfreeze')}>
                  {c.status === 'active' ? 'Freeze' : 'Unfreeze'}
                </button>
                {!c.isDefault && <button className="btn ghost small" onClick={() => act(c, 'default')}>Default</button>}
              </div>
            </div>
          ))}
          {cards.length === 0 && <div className="empty col"><div className="big">💳</div>No cards yet.</div>}
        </div>
      </Card>

      <form className="card" onSubmit={add} style={{ marginTop: 12 }}>
        <h3>Add a card</h3>
        <Field label="Card number" hint="Sandbox only — use 4242 4242 4242 4242. The PAN is never transmitted; only a token + last 4 are stored.">
          <input inputMode="numeric" placeholder="4242 4242 4242 4242" value={form.pan} onChange={(e) => setForm({ ...form, pan: e.target.value })} required />
        </Field>
        <div className="fieldgroup">
          <Field label="Exp month"><input inputMode="numeric" maxLength={2} value={form.expMonth} onChange={(e) => setForm({ ...form, expMonth: e.target.value })} /></Field>
          <Field label="Exp year"><input inputMode="numeric" maxLength={4} value={form.expYear} onChange={(e) => setForm({ ...form, expYear: e.target.value })} /></Field>
        </div>
        <Field label="Label (optional)"><input placeholder="Everyday card" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} maxLength={40} /></Field>
        <button className="btn primary" disabled={busy || !conn.live}>{busy ? 'Tokenizing…' : 'Add card securely'}</button>
        {!conn.live && <div className="banner warn mt">Adding a card requires a connection (tokenization handshake).</div>}
      </form>
    </>
  );
}
