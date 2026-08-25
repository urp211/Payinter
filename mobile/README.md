# PayInter Mobile (React Native / Expo)

Customer-facing iOS & Android app for PayInter. Dark-first, clean fintech UI with
rounded cards, subtle gradients and a bottom-tab shell.

## Features

- **Onboarding**: welcome → 3-step register → 6-digit email OTP → 4-digit transaction PIN
- **Home**: total USD-equivalent balance hero, per-currency wallets, quick actions,
  pending-transfer banner, live (sandbox) rates card, recent activity
- **Payments hub**: P2P send (paytag/email/phone lookup), international transfers
  (live quote → recipient → purpose → PIN → tracking), QR receive & pay, FX convert
- **Cards**: tokenized card list, add card (PAN never stored), freeze/unfreeze, card top up flow
- **Activity**: searchable, typed + status filters, cursor pagination, receipt view with
  tracking timeline, share receipt, one-tap dispute → support ticket
- **More**: profile, KYC flow (with explicit sandbox notice), security center
  (PIN/password change, sessions, biometric hook), legal & notices, support (FAQs + tickets)
- **Security**: tokens in expo-secure-store, transparent JWT refresh, idempotency keys on
  every mutating call, biometric confirmation hook (expo-local-authentication)

## Demo (sandbox)

| Credential | Value |
|---|---|
| Email | `demo@payinter.app` |
| Password | `Demo1234!` |
| PIN | `2468` |
| Admin | `admin@payinter.app` / `Admin1234!` |

Everything here runs against the **sandbox**: simulated FX feed, simulated card processor
(`4242 4242 4242 4242` → success, `4000 0000 0000 9995` → decline, `4000 0025 0000 3155` → 3DS),
simulated KYC. The app is clearly badged SANDBOX wherever money-related data is shown.

## Run

```bash
cd mobile
npm install            # or: expo install
cp .env.example .env   # point EXPO_PUBLIC_API_URL at the backend (LAN IP on device)
npm start              # Expo dev server; scan QR with Expo Go
```

For physical devices, set `EXPO_PUBLIC_API_URL=http://<your-lan-ip>:4000` — `localhost`
only works in the Android emulator / iOS simulator.

## Notes

- Card entry is **tokenize-first**: the PAN leaves the device straight to a Payment-Method
  (simulated) endpoint; the app only keeps brand + last4.
- The PAN/CVV inputs exist purely to demo PCI-journey UX; swap the POST body for a real
  PSP tokenization SDK (Stripe elements / Adyen) in production.
- Camera QR scanning is a progressive enhancement around `expo-camera`; pasting a payload
  works without it.
- Biometrics are a **hook**: confirm-with-FaceID falls back to the 4-digit PIN.

## 📲 Instalar no celular

### Opção A — PWA (já funciona agora)
1. Abra a preview pública no Chrome do Android (ou Safari no iPhone):
   `https://8080-io1kqve5n5ubr3bk9oibi.e2b.app`
2. Toque em **"Instalar app" / "Adicionar à tela inicial"**.
3. Ícone PayInter aparece na tela; abre em tela cheia, com service worker
   (cache do app shell). Usa a API da preview (sandbox) — demo@payinter.app.

### Opção B — APK Android nativo (CI)
O build nativo precisa de rede para baixar Android SDK + dependências Maven
(esta sandbox só permite npm/github). O workflow completo está pronto em
`ci/android-apk.yml` — mova-o para `.github/workflows/android-apk.yml` num
commit (pelo site do GitHub, 60s) e rode **Actions → Build Android APK**.
O APK sai nos artefatos do run e na release `apk-latest`.
