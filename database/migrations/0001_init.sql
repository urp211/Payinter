-- PayInter core schema — money is double-entry; balances are never mutated directly.
BEGIN;

CREATE TABLE IF NOT EXISTS users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text NOT NULL UNIQUE,
  phone           text UNIQUE,
  paytag          text UNIQUE,
  password_hash   text NOT NULL,
  pin_hash        text,
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','closed')),
  country_code    char(2) NOT NULL DEFAULT 'US',
  first_name      text,
  last_name       text,
  email_verified  boolean NOT NULL DEFAULT false,
  kyc_status      text NOT NULL DEFAULT 'not_started'
                    CHECK (kyc_status IN ('not_started','submitted','verified','rejected','requires_info')),
  kyc_rejection_reason text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  last_login_at   timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS users_paytag_key ON users (paytag) WHERE paytag IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id     text,
  platform      text,
  ip            text,
  user_agent    text,
  refresh_token_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz,
  last_used_at  timestamptz
);
CREATE INDEX IF NOT EXISTS user_sessions_user_idx ON user_sessions(user_id, revoked_at);

CREATE TABLE IF NOT EXISTS wallets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Derived cache over the ledger (source of truth = ledger_accounts)
CREATE TABLE IF NOT EXISTS wallet_balances (
  wallet_id       uuid NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  currency        char(3) NOT NULL,
  available_minor bigint NOT NULL DEFAULT 0 CHECK (available_minor >= 0),
  pending_minor   bigint NOT NULL DEFAULT 0 CHECK (pending_minor >= 0),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (wallet_id, currency)
);

-- Double-entry ledger --------------------------------------------------------
CREATE TABLE IF NOT EXISTS currencies (
  code           char(3) PRIMARY KEY,
  name           text NOT NULL,
  symbol         text NOT NULL,
  decimals       smallint NOT NULL DEFAULT 2,
  is_active      boolean NOT NULL DEFAULT true,
  supports_topup boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS ledger_accounts (
  code         text PRIMARY KEY,          -- e.g. WALLET:<userId>:USD, SYS:CLEARING:USD
  type         text NOT NULL CHECK (type IN ('wallet','clearing','revenue','settlement','suspense','provider_staging')),
  currency     char(3) NOT NULL REFERENCES currencies(code),
  owner_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  is_system    boolean NOT NULL DEFAULT false,
  display_name text NOT NULL,
  balance_minor bigint NOT NULL DEFAULT 0
    CHECK (
      (type = 'wallet' AND balance_minor >= 0)
      OR type IN ('clearing','revenue','settlement','suspense','provider_staging')
    ),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ledger_transactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference   text NOT NULL UNIQUE,
  type        text NOT NULL,
  description text NOT NULL DEFAULT '',
  posted_at   timestamptz NOT NULL DEFAULT now(),
  posted_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  meta        jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id            bigserial PRIMARY KEY,
  transaction_id uuid NOT NULL REFERENCES ledger_transactions(id) ON DELETE CASCADE,
  account_code  text NOT NULL REFERENCES ledger_accounts(code),
  currency      char(3) NOT NULL REFERENCES currencies(code),
  amount_minor  bigint NOT NULL CHECK (amount_minor > 0),
  direction     text NOT NULL CHECK (direction IN ('debit','credit')),
  balance_after_minor bigint NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ledger_entries_tx_idx ON ledger_entries(transaction_id);
CREATE INDEX IF NOT EXISTS ledger_entries_account_idx ON ledger_entries(account_code);

-- Customer-facing transactions ----------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_id       uuid NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  reference       text NOT NULL UNIQUE,
  type            text NOT NULL,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','completed','failed','cancelled','pending_review')),
  amount_minor    bigint NOT NULL,
  currency        char(3) NOT NULL REFERENCES currencies(code),
  fee_minor       bigint NOT NULL DEFAULT 0,
  exchange_rate   numeric(24,10),
  net_amount_minor bigint,
  description     text NOT NULL DEFAULT '',
  note            text,
  counterparty_name  text,
  counterparty_ref   text,
  payment_provider   text,
  failure_code    text,
  failure_message text,
  sandbox         boolean NOT NULL DEFAULT true,
  ledger_tx_id    uuid REFERENCES ledger_transactions(id),
  provider_payment_id text,
  secondary      jsonb NOT NULL DEFAULT '{}'::jsonb,
  tracking_status text,
  tracking_events jsonb NOT NULL DEFAULT '[]'::jsonb,
  refund_of       uuid REFERENCES transactions(id),
  refunded_amount_minor bigint,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz
);
CREATE INDEX IF NOT EXISTS transactions_user_idx ON transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS transactions_status_idx ON transactions(status) WHERE status IN ('pending','pending_review');
CREATE INDEX IF NOT EXISTS transactions_reference_idx ON transactions(reference);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key         text PRIMARY KEY,
  user_id     uuid REFERENCES users(id) ON DELETE CASCADE,
  method      text NOT NULL,
  path        text NOT NULL,
  status_int  int NOT NULL,
  response    jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT now() + interval '24 hours'
);

CREATE TABLE IF NOT EXISTS otp_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose     text NOT NULL CHECK (purpose IN ('verify_email','forgot_password','login_2fa','change_pin')),
  code_hash   text NOT NULL,
  attempts    int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 5,
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Cards / recipients ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_cards (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        text NOT NULL DEFAULT 'tokenized' CHECK (kind IN ('tokenized','virtual','physical')),
  brand       text NOT NULL,
  last4       char(4) NOT NULL,
  exp_month   smallint,
  exp_year    smallint,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active','frozen','closed')),
  is_default  boolean NOT NULL DEFAULT false,
  label       text NOT NULL DEFAULT 'card',
  token       text NOT NULL UNIQUE,      -- PSP token; PAN/CVV never stored
  spend_limit_minor bigint,
  limit_currency char(3),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recipients (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type          text NOT NULL CHECK (type IN ('internal','international','bank_account')),
  nickname      text,
  full_name     text NOT NULL,
  country_code  char(2),
  currency      char(3),
  details       jsonb NOT NULL DEFAULT '{}'::jsonb,  -- IBAN / SWIFT / paytag (no card data)
  is_favorite   boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recipients_user_idx ON recipients(user_id);

-- Fees / FX / providers -------------------------------------------------------
CREATE TABLE IF NOT EXISTS fee_rules (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         text NOT NULL,                -- card_topup | international | convert | mobile_money | p2p_send | qr_pay
  name         text NOT NULL,
  currency     char(3),
  percent_bps  numeric(10,4) NOT NULL DEFAULT 0,   -- 150 = 1.5%
  fixed_minor  bigint NOT NULL DEFAULT 0,
  min_minor    bigint NOT NULL DEFAULT 0,
  max_minor    bigint,
  active       boolean NOT NULL DEFAULT true,
  priority     int NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fx_rates (
  base       char(3) NOT NULL,
  quote      char(3) NOT NULL,
  rate       numeric(24,10) NOT NULL CHECK (rate > 0),
  provider   text NOT NULL DEFAULT 'sandbox',
  sandbox    boolean NOT NULL DEFAULT true,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (base, quote)
);

CREATE TABLE IF NOT EXISTS provider_configs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_key text NOT NULL,
  product      text NOT NULL,             -- card_payments | international | topup_mobile | bank_rails
  country_code char(2),
  enabled      boolean NOT NULL DEFAULT true,
  config       jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_key, product, country_code)
);

-- KYC / fraud ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kyc_submissions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_type    text NOT NULL,
  document_number  text NOT NULL,
  document_country char(2) NOT NULL,
  status           text NOT NULL DEFAULT 'submitted'
                     CHECK (status IN ('submitted','verified','rejected','requires_info')),
  reviewed_by      text,
  reviewed_at      timestamptz,
  rejection_reason text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fraud_alerts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  transaction_id  uuid REFERENCES transactions(id) ON DELETE SET NULL,
  rule            text NOT NULL,
  severity        text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz,
  resolved_by     text
);

-- Notifications / support ------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       text NOT NULL DEFAULT 'info',
  title      text NOT NULL,
  body       text NOT NULL,
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notification_prefs (
  user_id      uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  prefs        jsonb NOT NULL DEFAULT '{"push":true,"email":true,"sms":false,"marketing":false}'::jsonb,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject    text NOT NULL,
  status     text NOT NULL DEFAULT 'open' CHECK (status IN ('open','pending','closed')),
  priority   text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS support_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_type text NOT NULL CHECK (sender_type IN ('user','support')),
  sender_id   text,
  body        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Admin --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  name          text NOT NULL,
  password_hash text NOT NULL,
  role          text NOT NULL DEFAULT 'read_only'
                  CHECK (role IN ('super_admin','finance_admin','compliance_admin','operations_admin','support_agent','read_only')),
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id          bigserial PRIMARY KEY,
  actor_type  text NOT NULL CHECK (actor_type IN ('user','admin','system')),
  actor_id    text,
  actor_label text,
  action      text NOT NULL,
  entity      text NOT NULL,
  entity_id   text,
  ip          text,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON audit_logs(action);

CREATE TABLE IF NOT EXISTS security_events (
  id          bigserial PRIMARY KEY,
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  user_email  text,
  type        text NOT NULL,
  ip          text,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS security_events_user_idx ON security_events(user_id, created_at DESC);

COMMIT;
