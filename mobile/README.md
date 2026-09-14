# PayInter Web App — offline-first PWA

The customer-facing PayInter app: an installable, **offline-first** web app
(Vite + React SPA) that also packages into an Android APK via Capacitor.
Dark-first fintech UI, HTTP API contract identical to the backend `/v1`.

## Offline architecture (the point of this build)

| Concern | How it works offline |
|---|---|
| **Boot without network** | Service worker (injectManifest/Workbox) precaches the full app shell; SPA navigation falls back to `index.html`. |
| **Read data offline** | Every successful API read is snapshotted to **IndexedDB**, namespaced per user (wallet, transactions, cards, recipients, notifications, KYC, tickets, legal docs). Offline reads fall back automatically and the UI shows "offline snapshot · synced HH:MM". |
| **Operate offline** | Mutations (send, convert, top-ups, QR pay, intl send, tickets, recipients) are persisted to an IndexedDB **outbox** with a unique **Idempotency-Key** per operation. An optimistic entry appears in Activity ("queued · will sync"). |
| **Re-sync** | Connectivity probes (`/ops/health`, 15 s) + browser `online` events trigger an ordered **flush**. Server idempotency storage makes replays safe; permanent 4xx rejects drop with a toast explanation. Pending count shows in a banner. |
| **Session offline** | Access/refresh tokens live in localStorage; while unreachable you can "continue offline" against your last snapshot. Token refresh re-runs transparently when the API returns. |
| **Limits (by design)** | Login/register, OTP issuance, card tokenization, QR *generation* (HMAC signing is server-side) require connectivity and are clearly flagged in the UI. |

## Screens

Onboarding (login/register + offline entry) · Home (total USD, wallets, quick actions, sandbox + offline banners) · Activity (typed filters, search, receipts with timeline, dispute → ticket) · Pay (P2P lookup+send, FX convert) · QR (signed receive codes rendered to canvas, paste-payload pay with tamper rejection) · Add money (card top-up with fee quote, bank instructions, mobile-money prompt) · International (recipients CRUD, all-in quote, send, tracking events) · Cards (tokenize-only, freeze/default) · Notifications · More (KYC, Security: PIN/OTP/sessions, Privacy export, Legal docs, Support + FAQ).

## Run

```bash
cd mobile
npm install
npm run dev        # http://localhost:5173 — proxies /v1 + /ops to the API on :4000
npm run typecheck  # tsc
npm run build      # → dist-web/ (PWA with precached shell)
npm run preview    # serves the production build on :5173
```

Baking an API origin into a **production build**: `VITE_API_BASE=https://api.example.com npm run build`.
In Arena sandboxes the web app auto-discovers the API preview on the same host (`https://4000-<sandbox>.e2b.app`).

## Android APK

`ci/android-apk.yml` (repo root) is a one-command GitHub Actions workflow that
builds the PWA and wraps it with Capacitor (`npm run build` → `cap add android` →
`cap sync` → `assembleDebug`). Enable it once inside GitHub (see the header of
that file) and download the artifact.

## Demo credentials (sandbox)

- User: `demo@payinter.app` / `Demo1234!` · PIN `2468`
- Admin: `admin@payinter.app` / `Admin1234!`
- Card simulator: `4242 4242 4242 4242` success · `…9995` decline · `…3155` 3DS review

**Demo money only — no real payments are processed anywhere.**
