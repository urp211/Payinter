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

describe('QR payments (signed payload)', () => {
  it('code → resolve → pay transfers money to the QR owner', async () => {
    const waiter = await login(app); // demo receives
    const payerTok = await login(app, FRIEND.email, FRIEND.password);
    const code = await request(app).post('/v1/qr/code').set(auth(waiter))
      .send({ currency: 'USD', amountMinor: 2500, note: 'bill split' });
    expect([200, 201]).toContain(code.status);
    const payload = code.body.payload as string;

    const resolve = await request(app).post('/v1/qr/resolve').set(auth(payerTok)).send({ payload });
    expect(resolve.status).toBe(200);
    expect(resolve.body.payee.paytag).toBe('demo-2436');
    expect(resolve.body.amountMinor).toBe(2500);

    const before = await balanceOf(app, waiter, 'USD');
    const pay = await request(app).post('/v1/qr/pay').set(auth(payerTok))
      .send({ payload, pin: FRIEND.pin });
    expect([200, 201]).toContain(pay.status);
    expect(pay.body.type).toBe('qr_pay');
    expect(pay.body.status).toBe('completed');
    expect(await balanceOf(app, waiter, 'USD')).toBe(before + 2500);
  });

  it('tampered payload is rejected (HMAC)', async () => {
    const payerTok = await login(app, FRIEND.email, FRIEND.password);
    const code = await request(app).post('/v1/qr/code').set(auth(await login(app)))
      .send({ currency: 'USD', amountMinor: 2500 });
    const data = JSON.parse(Buffer.from(code.body.payload, 'base64url').toString());
    data.a = 2; // downgrade the amount — signature must catch it
    const evil = Buffer.from(JSON.stringify(data)).toString('base64url');
    const resolve = await request(app).post('/v1/qr/resolve').set(auth(payerTok)).send({ payload: evil });
    expect(resolve.status).toBeGreaterThanOrEqual(400);
    const pay = await request(app).post('/v1/qr/pay').set(auth(payerTok))
      .send({ payload: evil, pin: FRIEND.pin });
    expect(pay.status).toBeGreaterThanOrEqual(400);
  });
});

describe('international payments', () => {
  it('quote discloses all-in cost; pay creates tracking events and balanced ledger', async () => {
    const tok = await login(app);
    const q = await request(app).post('/v1/payments/international/quote').set(auth(tok))
      .send({ fromCurrency: 'USD', toCurrency: 'EUR', amountMinor: 10000 });
    expect(q.status).toBe(200);
    expect(q.body.feeMinor).toBeGreaterThan(0);
    expect(q.body.rate).toBeTruthy();
    expect(q.body.recipientMinor).toBeGreaterThan(0);
    expect(q.body.totalDebitMinor).toBe(10000 + q.body.feeMinor);

    const rec = await request(app).post('/v1/recipients').set(auth(tok))
      .send({ type: 'international', fullName: 'Maria dos Santos', countryCode: 'PT', currency: 'EUR', details: { iban: 'PT50000201231234567890154', swift: 'BCELPTPL' } });
    expect([200, 201]).toContain(rec.status);
    const recipientId: string = rec.body.recipient?.id ?? rec.body.id;

    const before = await balanceOf(app, tok, 'USD');
    const pay = await request(app).post('/v1/payments/international').set(auth(tok))
      .send({ recipientId, fromCurrency: 'USD', toCurrency: 'EUR', amountMinor: 10000, purpose: 'family support', pin: DEMO.pin });
    expect([201, 202]).toContain(pay.status);
    expect(pay.body.payment.status).toBe('completed');
    expect(pay.body.tracking.status).toBe('delivered');
    const events = pay.body.tracking.events ?? [];
    expect(events.map((e: any) => e.status)).toEqual(['created', 'processing', 'delivered']);
    expect(await balanceOf(app, tok, 'USD')).toBe(before - q.body.totalDebitMinor);
    // the ledger posting behind it is balanced
    const detail = await request(app).get(`/v1/transactions/${pay.body.payment.id}`).set(auth(tok));
    expect(detail.body.legs.length).toBeGreaterThanOrEqual(6);
    const sums = new Map<string, number>();
    for (const leg of detail.body.legs) {
      sums.set(leg.currency, (sums.get(leg.currency) ?? 0) + (leg.direction === 'credit' ? leg.amount_minor : -leg.amount_minor));
    }
    for (const [, s] of sums) expect(s).toBe(0);
  });

  it('recipients CRUD with IBAN sanity check', async () => {
    const tok = await login(app);
    const bad = await request(app).post('/v1/recipients').set(auth(tok))
      .send({ type: 'international', fullName: 'Bad Iban', countryCode: 'PT', currency: 'EUR', details: { iban: 'XX00' } });
    expect(bad.status).toBeGreaterThanOrEqual(400);
    const ok = await request(app).post('/v1/recipients').set(auth(tok))
      .send({ type: 'international', fullName: 'João Silva', countryCode: 'PT', currency: 'EUR', details: { iban: 'PT50000201231234567890154' } });
    expect([200, 201]).toContain(ok.status);
    const list = await request(app).get('/v1/recipients').set(auth(tok));
    expect(list.body.items.find((r: any) => r.fullName === 'João Silva')).toBeTruthy();
  });
});

describe('support + privacy exports', () => {
  it('ticket with messages round-trips to the admin support console', async () => {
    const tok = await login(app);
    const t = await request(app).post('/v1/support/tickets').set(auth(tok))
      .send({ subject: 'Why was my QR rejected?', body: 'I scanned the payload and got an error' });
    expect(t.status).toBe(201);
    const support = await adminLogin(app, 'support@payinter.app');
    const reply = await request(app).post(`/v1/admin/support/tickets/${t.body.id}/reply`).set(auth(support))
      .send({ body: 'We checked — all good now', status: 'closed' });
    expect(reply.status).toBe(200);
    const msgs = await request(app).get(`/v1/support/tickets/${t.body.id}/messages`).set(auth(tok));
    expect(msgs.body.items.length).toBe(2);
  });

  it('privacy export returns all user data; transactions cursor pagination stable', async () => {
    const tok = await login(app);
    const exp = await request(app).get('/v1/privacy/export').set(auth(tok));
    expect(exp.status).toBe(200);
    expect(exp.body.profile.email).toBe(DEMO.email);
    expect(Array.isArray(exp.body.transactions)).toBe(true);
    const p1 = await request(app).get('/v1/transactions?limit=2').set(auth(tok));
    expect(p1.body.items.length).toBe(2);
    if (p1.body.nextCursor) {
      const p2 = await request(app).get(`/v1/transactions?limit=2&cursor=${encodeURIComponent(p1.body.nextCursor)}`).set(auth(tok));
      expect(p2.body.items[0]?.id).not.toBe(p1.body.items[0]?.id);
    }
  });
});
