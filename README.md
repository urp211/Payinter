# PayInter — International payments, made simple

A production-shaped fintech reference: mobile wallet (iOS/Android), Node.js REST API
with a **double-entry ledger**, and a React admin console with role-based access.

> **Sandbox by design.** The default deployment is clearly-labelled demo
> infrastructure: simulated card processor, FX feed, KYC review and payouts.
> No real money moves, no real cards charged. See `docs/legal/SANDBOX_NOTICE.md`.

## Quickstart (60 seconds, zero infrastructure)

```bash
# 1) API (PGlite embedded Postgres — migrations + demo seed run automatically)
cd backend && npm install && npm run dev       # → http://127.0.0.1:4000  /ops/health

# 2) Admin console (proxies API calls to :4000)
cd ../admin && npm install && npm run dev      # → http://127.0.0.1:5173

# 3) Mobile app
cd ../mobile && npm install && npm start       # → Expo Go / simulator
```

Everything required for the demo seeds on first boot: currencies (USD EUR GBP CAD BRL
AOA ZAR), fees, FX rates, demo users, cards, transactions, fraud alerts and tickets.

**Demo credentials**

| Context | Login | Extra |
|---|---|---|
| Mobile app | `demo@payinter.app` / `Demo1234!` | PIN `2468`, OTP `123456` |
| Admin console | `admin@payinter.app` / `Admin1234!` | super_admin role |

Sandbox card numbers: `4242 4242 4242 4242` (success), `4000 0000 0000 9995` (decline),
`4000 0025 0000 3155` (3-D Secure pending).

## Full stack with Docker

```bash
docker compose up --build
# Admin  → http://localhost:8080
# API    → http://localhost:4000   (PostgreSQL 16 on :5433)
```

`docker compose` runs real PostgreSQL, migrations, and demo seed; `DEMO_MODE=true`
keeps the simulated providers. To go live (licenses + providers engaged, get counsel
first — `docs/legal/REGULATORY.md`): set `DEMO_MODE=false` and supply real provider
environment variables.

## Repository layout

```
database/   PostgreSQL migrations (the schema source of truth)
backend/    Node.js + TypeScript API (auth, double-entry ledger, payments, admin)
mobile/     React Native (Expo) customer app — iOS & Android
admin/      React + Vite operations console (RBAC dashboards, queues, audit)
docs/       Architecture, API overview, legal/regulatory placeholders
tests/      (backend/tests — vitest: 52 unit + integration tests against PGlite)
```

## Engineering guarantees

- **Financial correctness**: double-entry ledger; balances are a derived cache that a
  reconciliation task re-verifies; no direct balance mutation anywhere.
- **Security**: bcrypt passwords/PINs, JWT+rotating refresh sessions, OTP, PIN pepper,
  idempotency keys, rate limits, RBAC enforced server-side, audit log of admin/money
  actions, secrets only via env vars (see `.env.example` files).
- **Honesty**: sandbox is badged everywhere money appears; KYC flow is explicitly
  labelled simulated; no claims of real licensing.

## Testing

```bash
cd backend && npm run test       # 52 tests: unit (ledger, money, jwt, fees) + API integration
cd mobile && npx tsc --noEmit    # typecheck mobile
cd admin && npx tsc -b --noEmit  # typecheck admin
```

## Configuration

All knobs live in env vars and are documented, without secrets, in:
- `backend/.env.example` — database, JWT, OTP, providers, fraud thresholds
- `mobile/.env.example`  — API URL & demo credentials
- `.env.example` (root)  — compose-level overview

## Docs

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — ledger model, auth, RBAC, providers, fraud
- [`docs/API_OVERVIEW.md`](docs/API_OVERVIEW.md) — endpoint map & error contract
- [`docs/legal/`](docs/legal) — sandbox notice & regulatory placeholders
