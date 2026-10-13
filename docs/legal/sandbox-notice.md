# Sandbox & Demo Environment Notice

**Effective date:** 2025-01-01 · **Version:** 1.0

PayInter is currently operated as a **demonstration / sandbox environment**. Before using the service, every user must understand and accept the following:

## 1. Nature of this environment

- This deployment processes **simulated money only**. No real funds, real bank accounts, real cards or real payment rails are involved.
- Card processing, bank transfers, mobile money prompts, FX quotes and international payouts are executed by **built-in provider simulators** (`sandbox` mode). No external financial institution is contacted.
- Balances shown in the app are internal ledger entries maintained for demonstration purposes. They have **no monetary value**, cannot be withdrawn to any real account, and do not constitute deposits, e-money, or any claim against the operators.

## 2. Data handling in sandbox

- Account data you create (names, e-mails, transactions) is stored to demonstrate realistic flows, including admin tooling, review queues and audit logs.
- You may delete your data at any time from **Profile → Privacy**, or by deleting your account.
- Two-factor one-time codes are in a **deterministic demo mode**: request the code and the response includes the code itself (visible also in e-mail *simulation*). Never reuse real credentials here.

## 3. What you must not do

- Do not enter real card numbers, real bank credentials, real identity documents or any genuinely sensitive personal data.
- Do not rely on this service for any actual payment obligation. Simulated transfers do not settle anything.

## 4. Roadmap towards production

The same codebase supports real providers (card processor, bank rails, FX data feed, international payout partner) via configuration. Activation of production mode is subject to the licensing and compliance requirements described in the [Regulatory Disclaimer](/v1/legal/regulatory-disclaimer).

*Continued use of the sandbox environment constitutes acceptance of this notice.*
