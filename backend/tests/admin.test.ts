import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { initApp, ADMIN, login, adminLogin, auth } from './helpers';
import { db } from '../src/db';

let app: Express;
beforeAll(async () => { app = await initApp(); });

describe('admin auth + RBAC matrix', () => {
  it('non-privileged users cannot use the admin API at all', async () => {
    const tok = await login(app); // regular user token
    const r = await request(app).get('/v1/admin/stats/overview').set(auth(tok));
    expect(r.status).toBe(403);
  });

  it('role permission matrix is enforced (finance vs compliance vs support)', async () => {
    const finance = await adminLogin(app, 'finance@payinter.app');
    const compliance = await adminLogin(app, 'compliance@payinter.app');
    const support = await adminLogin(app, 'support@payinter.app');
    // finance touches refunds/fees; not user write
    expect((await request(app).post('/v1/admin/fees').set(auth(finance)).send({
      kind: 'flat_test', name: 'Flat', percentBps: 0, fixedMinor: 10
    })).status).toBe(201);
    expect((await request(app).post('/v1/admin/kyc/x/review').set(auth(finance)).send({ decision: 'verified' })).status).toBe(403);
    // compliance reviews kyc; cannot edit fees
    expect((await request(app).post('/v1/admin/fees').set(auth(compliance)).send({
      kind: 'nope', name: 'No', percentBps: 0, fixedMinor: 1
    })).status).toBe(403);
    // support can read users but not set fee rules
    expect((await request(app).get('/v1/admin/users').set(auth(support))).status).toBe(200);
    expect((await request(app).post('/v1/admin/providers/x/toggle').set(auth(support))).status).toBe(403);
    // read_only can read audit, cannot write anything
    const viewer = await adminLogin(app, 'viewer@payinter.app');
    expect((await request(app).get('/v1/admin/audit-logs').set(auth(viewer))).status).toBe(200);
    expect((await request(app).post('/v1/admin/notifications/broadcast').set(auth(viewer)).send({
      title: 'Hi', body: 'Should fail'
    })).status).toBe(403);
    expect(ADMIN.email).toBeTruthy();
  });

  it('KYC review: compliance verifies the pending user; user gets notified', async () => {
    const compliance = await adminLogin(app, 'compliance@payinter.app');
    const list = await request(app).get('/v1/admin/kyc?status=submitted').set(auth(compliance));
    expect(list.body.items.length).toBeGreaterThanOrEqual(1);
    const sub = list.body.items.find((s: any) => s.email === 'kyc.pending@payinter.app');
    const rej = await request(app).post(`/v1/admin/kyc/${sub.id}/review`).set(auth(compliance))
      .send({ decision: 'rejected' }); // missing reason → validation error
    expect(rej.status).toBeGreaterThanOrEqual(400);
    const ok = await request(app).post(`/v1/admin/kyc/${sub.id}/review`).set(auth(compliance))
      .send({ decision: 'verified' });
    expect(ok.status).toBe(200);
    const { rows } = await db.query<{ kyc_status: string }>(`SELECT kyc_status FROM users WHERE email='kyc.pending@payinter.app'`);
    expect(rows[0].kyc_status).toBe('verified');
  });

  it('suspend user blocks login; reactivate restores', async () => {
    const admin = await adminLogin(app);
    const users = await request(app).get('/v1/admin/users?q=kyc.pending').set(auth(admin));
    const uid = users.body.items[0].id;
    expect((await request(app).post(`/v1/admin/users/${uid}/status`).set(auth(admin))
      .send({ status: 'suspended', reason: 'fraud review' })).status).toBe(200);
    const blocked = await request(app).post('/v1/auth/login')
      .send({ email: 'kyc.pending@payinter.app', password: 'TestUser123!' });
    expect(blocked.status).toBe(403);
    expect((await request(app).post(`/v1/admin/users/${uid}/status`).set(auth(admin))
      .send({ status: 'active' })).status).toBe(200);
    const tok = await login(app, 'kyc.pending@payinter.app', 'TestUser123!');
    expect((await request(app).get('/v1/wallet').set(auth(tok))).status).toBe(200);
  });

  it('sandbox settlement: pending bank top up is settled via admin sandbox endpoint', async () => {
    const ops = await adminLogin(app, 'ops@payinter.app');
    const pend = await request(app).get('/v1/admin/sandbox/pending').set(auth(ops));
    expect(pend.body.items.length).toBeGreaterThanOrEqual(1);
    const target = pend.body.items[0];
    const settle = await request(app).post('/v1/admin/sandbox/settle').set(auth(ops))
      .send({ transactionId: target.id, outcome: 'completed' });
    expect(settle.status).toBe(200);
    const { rows } = await db.query<{ status: string }>(`SELECT status FROM transactions WHERE id=$1`, [target.id]);
    expect(rows[0].status).toBe('completed');
  });

  it('broadcast reaches all users; fx set manual rate visible via public fx endpoint', async () => {
    const admin = await adminLogin(app);
    const fx = await request(app).post('/v1/admin/fx-rates').set(auth(admin))
      .send({ base: 'USD', quote: 'AOA', rate: 999.99 });
    expect(fx.status).toBe(200);
    const rates = await request(app).get('/v1/fx/rates?base=USD');
    const pair = rates.body.pairs.find((r: any) => r.quote === 'AOA');
    expect(Number(pair.rate)).toBeCloseTo(999.99, 2);
    const bc = await request(app).post('/v1/admin/notifications/broadcast').set(auth(admin))
      .send({ title: 'Maintenance', body: 'Sandbox maintenance window' });
    expect(bc.status).toBe(200);
    expect(bc.body.sent).toBeGreaterThanOrEqual(3);
    const tok = await login(app);
    const notif = await request(app).get('/v1/notifications?limit=1').set(auth(tok));
    expect(notif.body.items[0].title).toBe('Maintenance');
  });

  it('audit trail contains the administrative actions performed', async () => {
    const admin = await adminLogin(app);
    const logs = await request(app).get('/v1/admin/audit-logs?limit=100').set(auth(admin));
    const actions = logs.body.items.map((l: any) => l.action);
    expect(actions).toContain('admin.notifications.broadcast');
    expect(actions).toContain('admin.sandbox.settle');
    expect(actions).toContain('admin.user.suspend');
    expect(actions).toContain('admin.user.reactivate');
    expect(actions).toContain('admin.kyc.review');
  });

  it('reconcile endpoint reports a healthy ledger', async () => {
    const admin = await adminLogin(app);
    const rec = await request(app).get('/v1/admin/reconcile').set(auth(admin));
    expect(rec.status).toBe(200);
    expect(rec.body.ok).toBe(true);
  });
});
