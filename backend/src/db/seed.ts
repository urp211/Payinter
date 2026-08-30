/**
 * Demo seed: users, wallets funded via ledger postings (never raw balance sets),
 * admin roles, sample transactions for the demo scenarios.
 */
import type { Db } from './index';
import { config } from '../config';
import { hashPassword, hashPin } from '../lib/crypto';
import { provisionWallet } from '../services/wallet';
import { post, walletAccount, sysAccount } from '../services/ledger';
import { reference } from '../lib/ids';

interface SeedUser { email: string; first: string; last: string; kyc: string; pin: string; country: string }

const USERS: SeedUser[] = [
  { email: config.seed.demoUserEmail, first: 'Demo', last: 'User', kyc: 'verified', pin: '2468', country: 'US' },
  { email: 'friend@payinter.app', first: 'Friends', last: 'Ofyou', kyc: 'verified', pin: '1357', country: 'GB' },
  { email: 'kyc.pending@payinter.app', first: 'Pending', last: 'Review', kyc: 'submitted', pin: '9999', country: 'BR' }
];

export async function seedDemoDataIfEmpty(db: Db): Promise<void> {
  const { rows } = await db.query<{ c: string }>('SELECT count(*)::text c FROM users');
  if (Number(rows[0].c) > 0) return;
  console.log('seeding demo data…');
  const secret = process.env;
  const demoTag = ['demo-2436', 'friend-9021', 'pending-3344'][0];

  const userIds: Record<string, string> = {};
  for (let i = 0; i < USERS.length; i++) {
    const u = USERS[i];
    const tag = ['demo-2436', 'friend-9021', 'pending-3344'][i];
    const { rows: r } = await db.query<{ id: string }>(
      `INSERT INTO users (email, paytag, password_hash, pin_hash, country_code, first_name, last_name, email_verified, kyc_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8) RETURNING id`,
      [u.email, tag, await hashPassword(config.seed.demoUserPassword), await hashPin(u.pin), u.country, u.first, u.last, u.kyc]
    );
    userIds[u.email] = r[0].id;
    await provisionWallet(r[0].id);
  }

  const demo = userIds[config.seed.demoUserEmail];
  const friend = userIds['friend@payinter.app'];
  const wallets = {} as Record<string, string>;
  for (const uid of Object.values(userIds)) {
    const { rows } = await db.query<{ id: string }>('SELECT id FROM wallets WHERE user_id=$1', [uid]);
    wallets[uid] = rows[0].id;
  }

  // Fund demo wallets via the LEDGER (topup-style postings) — never raw balance mutation.
  const fund = async (uid: string, ccy: string, minor: number, type: string, desc: string) => {
    const { ledgerTxId, reference: ref } = await post({
      userId: uid, type, description: desc,
      legs: [
        { accountCode: sysAccount('clearing', ccy), currency: ccy, amountMinor: minor, direction: 'debit' },
        { accountCode: walletAccount(uid, ccy), currency: ccy, amountMinor: minor, direction: 'credit' }
      ],
      reference: reference('SEED')
    });
    return { ledgerTxId, ref };
  };

  await db.query(
    `INSERT INTO transactions (user_id, wallet_id, reference, type, status, amount_minor, currency, fee_minor, description, counterparty_name, completed_at, created_at, ledger_tx_id)
     VALUES ($1,$2,$3,'card_topup','completed',$4,'USD',30,'Card top up','Visa •••• 4242', now() - interval '3 days', now() - interval '3 days', $5)`,
    [demo, wallets[demo], reference('TOP'), 25000, (await fund(demo, 'USD', 25000, 'seed', 'seed topup')).ledgerTxId]
  );
  await db.query(
    `INSERT INTO transactions (user_id, wallet_id, reference, type, status, amount_minor, currency, fee_minor, description, counterparty_name, completed_at, created_at, ledger_tx_id)
     VALUES ($1,$2,$3,'card_topup','completed',$4,'EUR',45,'Card top up','Visa •••• 4242', now() - interval '3 days', now() - interval '3 days', $5)`,
    [demo, wallets[demo], reference('TOP'), 30000, (await fund(demo, 'EUR', 30000, 'seed', 'seed eur')).ledgerTxId]
  );
  await db.query(
    `INSERT INTO transactions (user_id, wallet_id, reference, type, status, amount_minor, currency, fee_minor, description, completed_at, created_at, ledger_tx_id)
     VALUES ($1,$2,$3,'bank_topup','completed',$4,'AOA',0,'Bank transfer top up', now() - interval '7 days', now() - interval '7 days', $5)`,
    [demo, wallets[demo], reference('BANK'), 500_000, (await fund(demo, 'AOA', 500_000, 'seed', 'seed aoa')).ledgerTxId]
  );
  // friend has a small USD balance
  await fund(friend, 'USD', 12000, 'seed', 'friend seed');
  // pending kyc user starts empty

  // Sample demo transactions
  await db.query(
    `INSERT INTO transactions (user_id, wallet_id, reference, type, status, amount_minor, currency, fee_minor, description, note, counterparty_name, completed_at, created_at)
     VALUES ($1,$2,$3,'send','completed',5000,'USD',0,'Send money','Dinner 🍜','@friend-9021', now() - interval '2 days', now() - interval '2 days')`,
    [demo, wallets[demo], reference('SEN')]
  );
  await db.query(
    `INSERT INTO transactions (user_id, wallet_id, reference, type, status, amount_minor, currency, fee_minor, exchange_rate, net_amount_minor, description, counterparty_name, payment_provider, completed_at, created_at, tracking_status, tracking_events)
     VALUES ($1,$2,$3,'international','completed',10000,'USD',279,'0.9200000000',9200,'International transfer','Maria dos Santos','wise_sim', now() - interval '1 day', now() - interval '1 day','delivered',
       $4)`,
    [demo, wallets[demo], reference('INT'),
     JSON.stringify([
       { status: 'created', at: new Date(Date.now() - 2 * 86400000).toISOString(), note: 'Payment received' },
       { status: 'processing', at: new Date(Date.now() - 2 * 86400000 + 30000).toISOString(), note: 'Sent to payout partner' },
       { status: 'delivered', at: new Date(Date.now() - 86400000).toISOString(), note: 'Delivered via Standard bank' }
     ])]
  );
  await db.query(
    `INSERT INTO transactions (user_id, wallet_id, reference, type, status, amount_minor, currency, fee_minor, description, counterparty_name, failure_code, failure_message, completed_at, created_at)
     VALUES ($1,$2,$3,'card_topup','failed',20000,'USD',330,'Card top up','Mastercard •••• 9995','CARD_DECLINED','Insufficient funds on card', now() - interval '12 hours', now() - interval '12 hours')`,
    [demo, wallets[demo], reference('TOP')]
  );
  await db.query(
    `INSERT INTO transactions (user_id, wallet_id, reference, type, status, amount_minor, currency, fee_minor, description, sandbox)
     VALUES ($1,$2,$3,'bank_topup','pending',100000,'AOA',0,'Bank transfer top up',true)`,
    [demo, wallets[demo], reference('BANK')]
  );
  await db.query('UPDATE wallet_balances SET pending_minor=100000 WHERE wallet_id=$1 and currency=$2', [wallets[demo], 'AOA']);

  // KYC submission for the pending user
  await db.query(
    `INSERT INTO kyc_submissions (user_id, document_type, document_number, document_country) VALUES ($1,'passport','X99887766','BR')`,
    [userIds['kyc.pending@payinter.app']]
  );
  // A demo support ticket + notifications + fraud sample
  const { rows: tk } = await db.query<{ id: string }>(
    `INSERT INTO support_tickets (user_id, subject, priority) VALUES ($1,'Where is my top up?','normal') RETURNING id`,
    [demo]
  );
  await db.query(`INSERT INTO support_messages (ticket_id, sender_type, sender_id, body) VALUES ($1,'user',$2,'My bank transfer is still pending, please check.'),($1,'support','support','Thanks — sandbox settlements are manual, we just flipped it.'),($1,'user',$2,'Got the notification, perfect.')`, [tk[0].id, demo]);
  await db.query(`INSERT INTO notifications (user_id, type, title, body) VALUES ($1,'welcome','Welcome to PayInter','Your sandbox wallet is ready. Add money or try a QR payment.'),($1,'money_received','Money received','+ R$ 1.250,00 from QR payment'),($1,'review','Friend request pending','Identity review on your last bank transfer.')`, [demo]);
  await db.query(`INSERT INTO notification_prefs (user_id) VALUES ($1) ON CONFLICT DO NOTHING`, [demo]);
  await db.query(
    `INSERT INTO fraud_alerts (user_id, rule, severity, status) VALUES ($1,'velocity','medium','open')`,
    [userIds['kyc.pending@payinter.app']]
  );

  // A card for the demo user (tokenized: no PAN ever stored)
  await db.query(
    `INSERT INTO payment_cards (user_id, token, brand, last4, exp_month, exp_year, kind, label, is_default)
     VALUES ($1,'sim_4258','Visa','4258',12,2028,'tokenized','Everyday card',true)`,
    [demo]
  );
  // Favorite recipient (Maria, Portugal)
  await db.query(
    `INSERT INTO recipients (user_id, type, full_name, nickname, country_code, currency, details)
     VALUES ($1,'international','Maria dos Santos','Maria','PT','EUR',$2)`,
    [demo, JSON.stringify({ iban: 'PT50000201231234567890154', swift: 'BCELPTPL' })]
  );

  // Admins (one per major role for RBAC demo)
  const admins: [string, string, string][] = [
    [config.seed.adminEmail, 'Ana Admin', 'super_admin'],
    ['finance@payinter.app', 'Felipe Finance', 'finance_admin'],
    ['compliance@payinter.app', 'Catarina Compliance', 'compliance_admin'],
    ['ops@payinter.app', 'Otávio Ops', 'operations_admin'],
    ['support@payinter.app', 'Sérgio Support', 'support_agent'],
    ['viewer@payinter.app', 'Vera View', 'read_only']
  ];
  for (const [email, name, role] of admins) {
    await db.query(
      `INSERT INTO admin_users (email, name, password_hash, role) VALUES ($1,$2,$3,$4)`,
      [email, name, await hashPassword(config.seed.adminPassword), role]
    );
  }

  // Provider routing matrix (non-secret by design)
  const cfg = [
    ['sim_card_processor', 'card_payments', null, { providerRef: 'card_sim_01' }],
    ['wise_sim', 'international', null, { speed: 'standard' }],
    ['rapid_sim', 'international', null, { speed: 'express' }],
    ['sim_mobile_money', 'topup_mobile', 'AO', { smsSimulated: true }],
    ['sim_bank_rails', 'bank_rails', null, {}]
  ];
  for (const [k, p, cc, c] of cfg) {
    await db.query(
      `INSERT INTO provider_configs (provider_key, product, country_code, enabled, config) VALUES ($1,$2,$3,true,$4) ON CONFLICT DO NOTHING`,
      [k, p, cc, JSON.stringify(c)]
    );
  }

  console.log('seed done');
  console.log(`demo user: ${config.seed.demoUserEmail} / ${config.seed.demoUserPassword} (PIN 2468)`);
  console.log(`admin    : ${config.seed.adminEmail} / ${config.seed.adminPassword} (super_admin)`);
}

/** Standalone runner: npm run seed */
if (require.main === module) {
  (async () => {
    const { db } = await import('./index');
    await db.init();
    await db.migrate();
    await seedDemoDataIfEmpty(db);
    await db.close();
  })().catch((e) => { console.error(e); process.exit(1); });
}
