import { describe, it, expect, beforeAll } from 'vitest';
import { initApp, ADMIN, adminLogin, auth } from './helpers';
import type { Express } from 'express';
import request from 'supertest';
import { db } from '../src/db';
import { post, walletAccount, sysAccount, reconcile } from '../src/services/ledger';

let app: Express;
beforeAll(async () => { app = await initApp(); });

describe('double-entry ledger invariants', () => {
  it('posts a balanced topup-style entry and increases the wallet', async () => {
    const { rows } = await db.query<{ id: string }>(`SELECT id FROM users WHERE email='demo@payinter.app'`);
    const uid = rows[0].id;
    const before = await db.query<{ balance_minor: string }>(
      `SELECT balance_minor FROM ledger_accounts WHERE code=$1`, [walletAccount(uid, 'EUR')]
    );
    await post({
      userId: uid, type: 'seed', description: 'test topup',
      legs: [
        { accountCode: sysAccount('clearing', 'EUR'), currency: 'EUR', amountMinor: 12345, direction: 'debit' },
        { accountCode: walletAccount(uid, 'EUR'), currency: 'EUR', amountMinor: 12345, direction: 'credit' }
      ]
    });
    const after = await db.query<{ balance_minor: string }>(
      `SELECT balance_minor FROM ledger_accounts WHERE code=$1`, [walletAccount(uid, 'EUR')]
    );
    expect(Number(after.rows[0].balance_minor) - Number(before.rows[0].balance_minor)).toBe(12345);
    // derived cache equals ledger
    const cache = await db.query<{ available_minor: string }>(
      `SELECT available_minor FROM wallet_balances wb JOIN wallets w ON w.id=wb.wallet_id WHERE w.user_id=$1 AND wb.currency='EUR'`,
      [uid]
    );
    expect(Number(cache.rows[0].available_minor)).toBe(Number(after.rows[0].balance_minor));
  });

  it('rejects an unbalanced posting', async () => {
    await expect(post({
      userId: null, type: 'test', description: 'bad',
      legs: [
        { accountCode: 'SYS:CLEARING:USD', currency: 'USD', amountMinor: 100, direction: 'debit' },
        { accountCode: 'SYS:REVENUE:USD', currency: 'USD', amountMinor: 50, direction: 'credit' }
      ]
    })).rejects.toMatchObject({ status: 500 });
  });

  it('wallet accounts can never go negative (INSUFFICIENT_FUNDS rolls back the whole posting)', async () => {
    const { rows } = await db.query<{ id: string }>(`SELECT id FROM users WHERE email='kyc.pending@payinter.app'`);
    const uid = rows[0].id; // starts at 0 USD
    await expect(post({
      userId: uid, type: 'test', description: 'overdraft attempt',
      legs: [
        { accountCode: walletAccount(uid, 'USD'), currency: 'USD', amountMinor: 100, direction: 'debit' },
        { accountCode: 'SYS:SUSPENSE:USD', currency: 'USD', amountMinor: 100, direction: 'credit' }
      ]
    })).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS', status: 422 });
    const { rows: bal } = await db.query<{ balance_minor: string }>(
      `SELECT balance_minor FROM ledger_accounts WHERE code=$1`, [walletAccount(uid, 'USD')]
    );
    expect(Number(bal[0]?.balance_minor ?? 0)).toBe(0);
  });

  it("reconcile() reports no drift and no unbalanced postings after a session of activity", async () => {
    const report = await reconcile();
    expect(report.ok).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it('refund endpoint credits the user back and records audit', async () => {
    const adminTok = await adminLogin(app);
    const tok = await (await import('./helpers')).login(app);
    const w = await request(app).get('/v1/wallet').set(auth(tok));
    const send = await request(app).post('/v1/transfers/send').set(auth(tok))
      .send({ identifier: '@friend-9021', amountMinor: 3500, currency: 'USD', note: 'refund me', pin: '2468' });
    expect([200, 201]).toContain(send.status);
    const txId = send.body.id;
    const refund = await request(app).post(`/v1/admin/transactions/${txId}/refund`).set(auth(adminTok))
      .send({ amountMinor: 3500, reason: 'Duplicate charge' });
    expect([200, 201]).toContain(refund.status);
    expect(refund.body.refundedAmountMinor).toBe(3500);
    const wAfter = await request(app).get('/v1/wallet').set(auth(tok));
    const usd = (b: any) => b.body.balances.find((x: any) => x.currency === 'USD').availableMinor;
    expect(usd(wAfter)).toBe(usd(w)); // send -3500, refund +3500
    // admin sees the refund flag on the transaction row
    const { rows } = await db.query<{ refunded_amount_minor: string }>(
      `SELECT refunded_amount_minor FROM transactions WHERE id=$1`, [txId]);
    expect(Number(rows[0].refunded_amount_minor)).toBe(3500);
    await request(app).post('/v1/auth/logout').set(auth(tok));
    expect(ADMIN.email).toContain('@');
  });
});
