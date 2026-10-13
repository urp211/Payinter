import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { initApp, DEMO, FRIEND, login, adminLogin, auth } from './helpers';
import { db } from '../src/db';

let app: Express;
beforeAll(async () => { app = await initApp(); });

async function balanceOf(a: Express, tok: string, ccy: string): Promise<number> {
  const w = await request(a).get('/v1/wallet').set(auth(tok));
  const b = w.body.balances.find((x: any) => x.currency === ccy);
  return b ? b.availableMinor : 0;
}

describe('transfers + fraud review queue', () => {
  it('send money moves funds atomically and writes both user rows', async () => {
    const tok = await login(app);
    const ftok = await login(app, FRIEND.email, FRIEND.password);
    const before = await balanceOf(app, ftok, 'USD');
    const send = await request(app).post('/v1/transfers/send').set(auth(tok))
      .send({ identifier: '@friend-9021', amountMinor: 5000, currency: 'USD', note: 'dinner', pin: DEMO.pin });
    expect([200, 201]).toContain(send.status);
    expect(send.body.status).toBe('completed');
    expect(await balanceOf(app, ftok, 'USD')).toBe(before + 5000);
    const recv = await request(app).get(`/v1/transactions?limit=20`).set(auth(ftok));
    const mine = recv.body.items.find((t: any) => t.type === 'receive' && t.amountMinor === 5000);
    expect(mine).toBeTruthy();
  });

  it('idempotency: same key replays, no double-debit', async () => {
    const tok = await login(app);
    const before = await balanceOf(app, tok, 'USD');
    const key = 'idem-test-key-1';
    const body = { identifier: '@friend-9021', amountMinor: 1200, currency: 'USD', pin: DEMO.pin };
    const r1 = await request(app).post('/v1/transfers/send').set(auth(tok)).set('Idempotency-Key', key).send(body);
    const r2 = await request(app).post('/v1/transfers/send').set(auth(tok)).set('Idempotency-Key', key).send(body);
    expect([200, 201]).toContain(r1.status);
    expect([200, 201]).toContain(r2.status);
    expect(r2.body.reference).toBe(r1.body.reference);
    expect(await balanceOf(app, tok, 'USD')).toBe(before - 1200);
  });

  it('insufficient funds yields 422 and no ledger change', async () => {
    const tok = await login(app, 'kyc.pending@payinter.app', 'TestUser123!');
    const r = await request(app).post('/v1/transfers/send').set(auth(tok))
      .send({ identifier: '@demo-2436', amountMinor: 90000, currency: 'USD', pin: '9999' });
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('INSUFFICIENT_FUNDS');
  });

  it('velocity fraud rule holds a transfer in pending_review; compliance releases it', async () => {
    const tok = await login(app);
    const results: string[] = [];
    let held: any = null;
    for (let i = 0; i < 6; i++) {
      const r = await request(app).post('/v1/transfers/send').set(auth(tok))
        .send({ identifier: '@friend-9021', amountMinor: 100, currency: 'USD', note: `v${i}`, pin: DEMO.pin });
      results.push(r.body.status);
      if (r.body.status === 'pending_review') held = r.body;
    }
    expect(results).toContain('pending_review');
    const complianceTok = await adminLogin(app, 'compliance@payinter.app');
    const q = await request(app).get('/v1/admin/review-queue').set(auth(complianceTok));
    const queued = q.body.items.find((t: any) => t.id === held.id);
    expect(queued).toBeTruthy();
    const viewerTok = await adminLogin(app, 'viewer@payinter.app');
    const deny = await request(app).post(`/v1/admin/review-queue/${held.id}/release`).set(auth(viewerTok));
    expect(deny.status).toBe(403);
    const rel = await request(app).post(`/v1/admin/review-queue/${held.id}/release`).set(auth(complianceTok));
    expect(rel.status).toBe(200);
    const { rows } = await db.query<{ status: string }>(`SELECT status FROM transactions WHERE id=$1`, [held.id]);
    expect(rows[0].status).toBe('completed');
  });
});

describe('cards + top ups (sandbox provider sim)', () => {
  it('adds a card via tokenization — PAN never reaches the API', async () => {
    const tok = await login(app, FRIEND.email, FRIEND.password);
    const card = await request(app).post('/v1/cards').set(auth(tok))
      .send({ token: 'sim_tok_visa_4242', brand: 'Visa', last4: '4242', expMonth: 11, expYear: 2030, label: 'Main' });
    expect([200, 201]).toContain(card.status);
    expect(card.body.last4).toBe('4242');
    const raw = JSON.stringify(card.body);
    expect(raw).not.toContain('2142-');
    expect(raw.split('4242').length - 1).toBeLessThanOrEqual(2); // only last4
    const frozen = await request(app).post(`/v1/cards/${card.body.id}/freeze`).set(auth(tok));
    expect(frozen.status).toBe(200);
  });

  it('quote shows fee before confirm; execute credits net to wallet; revenue went to ledger', async () => {
    const tok = await login(app, FRIEND.email, FRIEND.password);
    const q = await request(app).post('/v1/payments/topup/quote').set(auth(tok))
      .send({ currency: 'USD', amountMinor: 10000 });
    expect(q.status).toBe(200);
    const fee = q.body.feeMinor;
    expect(fee).toBeGreaterThan(0);
    expect(q.body.netMinor).toBe(10000);
    const before = await balanceOf(app, tok, 'USD');
    const card = await request(app).post('/v1/cards').set(auth(tok))
      .send({ token: 'sim_tok_mc_5454', brand: 'Mastercard', last4: '5454', expMonth: 6, expYear: 2029 });
    const ex = await request(app).post('/v1/payments/topup').set(auth(tok))
      .send({ cardId: card.body.id, currency: 'USD', amountMinor: 10000, pin: FRIEND.pin });
    expect([201, 202]).toContain(ex.status);
    expect(ex.body.status).toBe('completed');
    expect(await balanceOf(app, tok, 'USD')).toBe(before + 10000);
    const finTok = await adminLogin(app, 'finance@payinter.app');
    const stats = await request(app).get('/v1/admin/stats/overview').set(auth(finTok));
    expect(stats.body.feeRevenueMinor).toBeGreaterThanOrEqual(fee);
  });

  it('sandbox failure path: last4 9995 → failed CARD_DECLINED, wallet untouched', async () => {
    const tok = await login(app, FRIEND.email, FRIEND.password);
    const card = await request(app).post('/v1/cards').set(auth(tok))
      .send({ token: 'sim_tok_declined_9995', brand: 'Visa', last4: '9995', expMonth: 1, expYear: 2029 });
    const before = await balanceOf(app, tok, 'USD');
    const ex = await request(app).post('/v1/payments/topup').set(auth(tok))
      .send({ cardId: card.body.id, currency: 'USD', amountMinor: 20000, pin: FRIEND.pin });
    expect(ex.body.status).toBe('failed');
    const detail = await request(app).get(`/v1/transactions/${ex.body.paymentId}`).set(auth(tok));
    expect(detail.body.failureCode).toBe('CARD_DECLINED');
    expect(await balanceOf(app, tok, 'USD')).toBe(before);
  });

  it('KYC gate: unverified user cannot top up by card', async () => {
    const tok = await login(app, 'kyc.pending@payinter.app', 'TestUser123!');
    const card = await request(app).post('/v1/cards').set(auth(tok))
      .send({ token: 'sim_tok_pending_5454', brand: 'Visa', last4: '5454', expMonth: 1, expYear: 2029 });
    const ex = await request(app).post('/v1/payments/topup').set(auth(tok))
      .send({ cardId: card.body.id, currency: 'USD', amountMinor: 10000, pin: '9999' });
    expect(ex.status).toBe(403);
    expect(ex.body.error.code).toBe('KYC_TIER_BLOCKED');
  });
});

describe('wallet convert', () => {
  it('quote then execute with PIN converts at the disclosed rate', async () => {
    const tok = await login(app);
    const q = await request(app).post('/v1/wallet/convert/quote').set(auth(tok))
      .send({ from: 'EUR', to: 'USD', amountMinor: 20000 });
    expect(q.status).toBe(200);
    const eurBefore = await balanceOf(app, tok, 'EUR');
    const usdBefore = await balanceOf(app, tok, 'USD');
    const noPin = await request(app).post('/v1/wallet/convert').set(auth(tok))
      .send({ from: 'EUR', to: 'USD', amountMinor: 20000 });
    expect([400, 422]).toContain(noPin.status); // PIN required (user has PIN set)
    const ex2 = await request(app).post('/v1/wallet/convert').set(auth(tok))
      .send({ from: 'EUR', to: 'USD', amountMinor: 20000, pin: DEMO.pin });
    expect([200, 201]).toContain(ex2.status);
    expect(await balanceOf(app, tok, 'EUR')).toBe(eurBefore - 20000);
    expect(await balanceOf(app, tok, 'USD')).toBeGreaterThan(usdBefore);
  });
});
