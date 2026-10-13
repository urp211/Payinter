# Regulatory & Compliance Disclaimer

**Effective date:** 2025-01-01 · **Version:** 1.0

## 1. Service status

This instance of PayInter ("the Service") runs in **sandbox/demo mode** and is **not** a licensed financial product being offered to the public. No regulated activity — deposit-taking, e-money issuance, money transmission, foreign exchange dealing or payment initiation services — is carried out.

## 2. Production operation would require

Actual financial services in any market require the licences and registrations applicable in each jurisdiction, including, as examples:

- **Angola (AO):** licensing/supervision by the **Banco Nacional de Angola (BNA)** for payment services and FX operations under Law No. 5/05 (Payment Systems) and related exchange control rules.
- **Portugal / EU:** PSD2 payment institution or e-money institution authorisation; GDPR (Reg. (EU) 2016/679) compliance; AMLD5/AMLD6 identity verification duties.
- **United States:** state money transmitter licences, FinCEN registration, BSA/AML programme, OFAC screening.
- **United Kingdom:** FCA authorisation (API/EMI), UK GDPR, MLRs 2017.

The platform's design already implements the controls such regimes expect: tiered KYC review (admin-approved verification), sanctions-style review queues, velocity & large-amount fraud rules, segregation of accounting through a double-entry ledger, full audit trails, and per-operation PIN second-factor confirmation.

## 3. Anti-money-laundering posture (demo)

The sandbox demonstrates, with synthetic data only: identity documents submitted for review, large and anomalous transactions being held in a **pending review** state, a fraud alert console for compliance officers, and blocked-action auditing. These demonstrations must not be mistaken for an operational AML programme.

## 4. No advice

Nothing in the Service constitutes financial, legal, tax or investment advice.

*For production enquiries, contact the platform operator.*
