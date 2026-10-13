import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { initApp, DEMO, login, auth } from './helpers';
import { db } from '../src/db';

let app: Express;
beforeAll(async () => { app = await initApp(); });

let newUserTok = '';

describe('auth lifecycle', () => {
  it('registers a new user, provisions wallet + default balances', async () => {
    const res = await request(app).post('/v1/auth/register').send({
      email: 'newuser@test.dev', password: 'Sup3rSecret!1', firstName: 'New', lastName: 'User', countryCode: 'PT'
    });
    expect(res.status).toBe(201);
    expect(res.body.tokens.accessToken).toBeTruthy();
    newUserTok = res.body.tokens.accessToken as string;
    const me = await request(app).get('/v1/auth/me').set(auth(newUserTok));
    expect(me.status).toBe(200);
    expect(me.body.email).toBe('newuser@test.dev');
    expect(me.body.kyc).toBeTruthy();
    expect(me.body.hasPin).toBe(false);
    const w = await request(app).get('/v1/wallet').set(auth(newUserTok));
    expect(w.status).toBe(200);
    expect(Array.isArray(w.body.balances)).toBe(true);
  });

  it('rejects a duplicate registration', async () => {
    const res = await request(app).post('/v1/auth/register').send({
      email: 'NEWUSER@test.dev', password: 'Sup3rSecret!1', firstName: 'Xx', lastName: 'Yy', countryCode: 'PT'
    });
    expect([400, 409]).toContain(res.status);
  });

  it('rejects wrong password but succeeds with the right one', async () => {
    const bad = await request(app).post('/v1/auth/login').send({ email: DEMO.email, password: 'wrong' });
    expect(bad.status).toBe(401);
    const ok = await request(app).post('/v1/auth/login').send({ email: DEMO.email, password: DEMO.password });
    expect(ok.status).toBe(200);
    expect(ok.body.tokens.refreshToken).toBeTruthy();
  });

  it('logout revokes the refresh session (access token expires naturally within minutes)', async () => {
    const res = await request(app).post('/v1/auth/login').send({ email: DEMO.email, password: DEMO.password });
    const { accessToken, refreshToken } = res.body.tokens;
    const lo = await request(app).post('/v1/auth/logout').set(auth(accessToken)).send({ refreshToken });
    expect(lo.status).toBe(204);
    const rf = await request(app).post('/v1/auth/refresh').send({ refreshToken });
    expect(rf.status).toBeGreaterThanOrEqual(400);
  });

  it('OTP verify_email: request then verify (demo code leaks only in sandbox)', async () => {
    const req0 = await request(app).post('/v1/auth/request-otp').set(auth(newUserTok))
      .send({ purpose: 'verify_email' });
    expect(req0.status).toBe(200);
    expect(req0.body.demoCode).toBeTruthy(); // sandbox only
    const code: string = req0.body.demoCode;
    const bad = await request(app).post('/v1/auth/verify-otp').set(auth(newUserTok))
      .send({ purpose: 'verify_email', code: '000000' });
    expect(bad.status).toBeGreaterThanOrEqual(400);
    const good = await request(app).post('/v1/auth/verify-otp').set(auth(newUserTok))
      .send({ purpose: 'verify_email', code });
    expect(good.status).toBe(200);
    const me = await request(app).get('/v1/auth/me').set(auth(newUserTok));
    expect(me.body.emailVerified).toBe(true);
  });
});

describe('wallet PIN second factor', () => {
  it('5 wrong PIN attempts lock the PIN for 15 minutes', async () => {
    const set = await request(app).post('/v1/auth/pin').set(auth(newUserTok)).send({ pin: '0000' });
    expect(set.status).toBe(201);
    const badChange = await request(app).post('/v1/auth/pin/change').set(auth(newUserTok))
      .send({ currentPin: '9999', newPin: '1111' });
    expect(badChange.status).toBeGreaterThanOrEqual(400);
    // wrong-pin attempts against a PIN-protected operation
    let locked = false;
    for (let i = 0; i < 5; i++) {
      const r = await request(app).post('/v1/transfers/send').set(auth(newUserTok))
        .send({ identifier: '@friend-9021', amountMinor: 100, currency: 'USD', pin: '7777' });
      if (r.status === 423) locked = true; // lock after the 5th
    }
    expect(locked).toBe(true);
    // even the correct PIN is now rejected while locked
    const sixth = await request(app).post('/v1/transfers/send').set(auth(newUserTok))
      .send({ identifier: '@friend-9021', amountMinor: 100, currency: 'USD', pin: '0000' });
    expect(sixth.status).toBe(423);
    expect(sixth.body.error.code).toBe('PIN_LOCKED');
    const row = await db.query<{ pin_locked_until: string | null }>(
      `SELECT pin_locked_until FROM users WHERE email='newuser@test.dev'`
    );
    expect(row.rows[0].pin_locked_until).toBeTruthy();
  });
});
