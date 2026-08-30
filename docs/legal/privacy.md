# Privacy Policy

**Effective date:** 2025-01-01 · **Version:** 1.0 · Sandbox edition

## 1. Controller

The operator of this PayInter deployment is the data controller for personal data processed through the Service.

## 2. Data we process

| Category | Examples | Purpose |
| --- | --- | --- |
| Account data | name, e-mail, phone, country, @paytag | authentication, discovery (send money to @paytag) |
| Security artefacts | password hash, hashed PIN (peppered), OTP hashes (never stored in clear), sessions, security event log | account security, abuse prevention |
| Transaction records | amounts, currencies, counterparties, references, failed-attempt metadata | ledger integrity, statements, dispute support |
| Verification data | KYC submissions (document type/number references) | tier upgrade reviews in demo mode |
| Support data | tickets and messages | customer support |

**What we never store:** full card numbers (PAN), CVV, or PINs in plain text. Cards are referenced by token + brand + last-4 only, in line with PCI-DSS tokenisation practices.

## 3. Legal bases (production posture)

Contract necessity (executing your transfers), legitimate interests (security, fraud prevention), and legal obligations (AML/KYC record keeping where applicable).

## 4. Sharing & processors

In sandbox mode, **no data leaves the platform**: all providers are in-process simulators. In production, data would be shared only with the payment providers strictly needed to execute an instructed operation, listed in the admin console's provider registry, under data-processing agreements, with encryption in transit.

## 5. Retention

Transaction ledger records are retained as append-only accounting records. Support tickets are retained for 24 months. OTP codes self-expire within minutes. Sessions can be revoked individually from your Security screen.

## 6. Your rights

From **Profile → Privacy** you can:

- **Export** all of your personal data as JSON (`/v1/privacy/export`),
- View the **card statement** data we hold about your payment methods,
- Delete your account and associated profile data (accounting ledger records are anonymised, not erased, to preserve double-entry integrity).

You also have rights of access, rectification, restriction, objection and complaint to a supervisory authority (ANGOLA: APD — Agência de Protecção de Dados; EU: your local DPA).

## 7. Security measures

Passwords bcrypt-hashed; PINs hashed with a server-side pepper; HMAC-signed QR payment payloads; short-lived access tokens with refresh rotation; audit-logging of every staff and user administration action; TLS in transit (production).

## 8. Contact

privacy@payinter.app — we respond within 72 hours.
