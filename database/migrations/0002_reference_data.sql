-- Reference data: currencies, fee rules, sandbox FX rates.
BEGIN;

INSERT INTO currencies (code, name, symbol, decimals, is_active, supports_topup) VALUES
  ('USD','US Dollar','$',2,true,true),
  ('EUR','Euro','€',2,true,true),
  ('GBP','British Pound','£',2,true,true),
  ('CAD','Canadian Dollar','CA$',2,true,true),
  ('BRL','Brazilian Real','R$',2,true,true),
  ('AOA','Angolan Kwanza','Kz',2,true,true),
  ('ZAR','South African Rand','R',2,true,true)
ON CONFLICT (code) DO NOTHING;

-- System ledger accounts per currency (clearing / revenue / settlement / suspense)
INSERT INTO ledger_accounts (code, type, currency, is_system, display_name, balance_minor)
SELECT 'SYS:CLEARING:' || c.code, 'clearing', c.code, true, 'Clearing account (processor funds in flight) ' || c.code, 0
FROM currencies c
ON CONFLICT (code) DO NOTHING;

INSERT INTO ledger_accounts (code, type, currency, is_system, display_name, balance_minor)
SELECT 'SYS:REVENUE:' || c.code, 'revenue', c.code, true, 'Fee revenue ' || c.code, 0
FROM currencies c
ON CONFLICT (code) DO NOTHING;

INSERT INTO ledger_accounts (code, type, currency, is_system, display_name, balance_minor)
SELECT 'SYS:SETTLEMENT:' || c.code, 'settlement', c.code, true, 'Settlement payable ' || c.code, 0
FROM currencies c
ON CONFLICT (code) DO NOTHING;

INSERT INTO ledger_accounts (code, type, currency, is_system, display_name, balance_minor)
SELECT 'SYS:SUSPENSE:' || c.code, 'suspense', c.code, true, 'Suspense / unmatched flows ' || c.code, 0
FROM currencies c
ON CONFLICT (code) DO NOTHING;

-- Fee rules (bps = basis points of percent; e.g. 150 = 1.5%)
INSERT INTO fee_rules (id, kind, name, currency, percent_bps, fixed_minor, min_minor, max_minor, active, priority)
VALUES
  (gen_random_uuid(), 'card_topup', 'Visa/Mastercard top-up', NULL, 150, 30, 50, NULL, true, 10),
  (gen_random_uuid(), 'international', 'International transfer', NULL, 80, 199, 0, 1500, true, 10),
  (gen_random_uuid(), 'international', 'Express international', NULL, 240, 399, 0, 5000, true, 20),
  (gen_random_uuid(), 'convert', 'Currency exchange', NULL, 75, 0, 0, NULL, true, 10),
  (gen_random_uuid(), 'mobile_money', 'Mobile money top-up', NULL, 100, 20, 0, NULL, true, 10),
  (gen_random_uuid(), 'p2p_send', 'P2P send', NULL, 0, 0, 0, 0, true, 10),
  (gen_random_uuid(), 'qr_pay', 'QR payment', NULL, 0, 0, 0, 0, true, 10)
ON CONFLICT DO NOTHING;

-- Sandbox FX feed (USD based; cross computed via USD)
INSERT INTO fx_rates (base, quote, rate, provider, sandbox) VALUES
  ('USD','EUR',0.9200000000,'sandbox',true),
  ('USD','GBP',0.7900000000,'sandbox',true),
  ('USD','CAD',1.3600000000,'sandbox',true),
  ('USD','BRL',5.4500000000,'sandbox',true),
  ('USD','AOA',915.0000000000,'sandbox',true),
  ('USD','ZAR',18.3000000000,'sandbox',true)
ON CONFLICT (base, quote) DO NOTHING;

COMMIT;
