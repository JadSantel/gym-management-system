# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Owners and owner-managers of small independent gyms are the accountable reviewers and buyers. Front-desk and operational staff handle day-to-day collections, member records, eligibility checks, and shift handoffs. Gym members are affected participants who pay, renew, request receipts, or need eligibility checked; member self-service is outside the initial MVP.

## Product Purpose

Help independent gyms record and verify full membership payments, maintain accurate paid periods and eligibility, investigate payment disagreements, and reconcile collections. Success means fewer missing or incorrect payment records, less after-hours reconciliation, and reliable eligibility decisions. These outcomes remain hypotheses until measured in an actual pilot.

## Positioning

The product centers on one traceable workflow connecting a verified collection to its authenticated operator, durable receipt/reference, paid membership period, and eligibility result. It also preserves evidence-backed investigations and compares recorded collections with actual closing totals. A payment claim or screenshot alone does not create a confirmed payment or normal access.

## Operating Context

Operators use the system at the reception counter to record joins and renewals, at check-in to determine current eligibility, while investigating payment differences, and during shift or day-end closing. Connectivity outages use a separate physical, pre-numbered full-cash receipt process with controlled handoff and later evidence review; the app does not provide offline digital payment verification. Current demonstrations and recorded acceptance evidence use synthetic data only.

## Capabilities and Constraints

- The MVP supports owner and staff identities, gym-scoped member and plan records, cash and verified digital collection records, receipts, fixed paid periods, eligibility checks, investigations, supported owner-controlled corrections, outage receipt recovery, daily closing, and verified legacy access review with pilot measurement artifacts.
- Approved plans are Monthly (₱800 / 30 elapsed days), 3 Months (₱2,100 / 90 elapsed days), and 6 Months (₱4,000 / 180 elapsed days). Each day is exactly 24 hours. Full payment is required; partial payments, installments, and membership balances are not supported.
- Cash is confirmed by the collector when received. GCash and bank-transfer payments require designated receiving-account verification. Pending claims do not grant new paid access.
- Early renewal preserves the current paid term and schedules one fully paid next term at its end. New or late paid terms follow the approved Manila-date rules. Access is based on effective, fully paid periods; a physical outage receipt may grant one provisional visit under its separate rules.
- Financial records preserve original entries. Owner approval, evidence, actual money movement, and the explicit access result are distinct requirements for supported corrections and refunds. Unsupported reasons remain blocked or escalated.
- Tenant isolation, server-enforced authority, attributable actions, audit history, idempotent financial writes, and exact centavo/time semantics are durable constraints. `docs/PROJECT.md` is authoritative for current behavior and gates; `docs/product.md` contains aligned business context.
- Live cancellation terms, evidence custody and retention, named operational authorities, actual pilot procedures, and hosted readiness remain open gates. Do not infer product or release readiness from local verification.

## Evidence on Hand

- `docs/IMPLEMENTATION_STATUS.md` records local synthetic verification for S-01–S-07 and exact scope limits. This is evidence of the recorded local implementation only; actual pilot operation, validated baselines, measured improvement, physical rehearsal, and live readiness remain unverified or blocked.
- `docs/PROJECT.md`, `docs/product.md`, and related protocol/worksheet documents contain approved requirements, qualified discovery reports, and synthetic demonstration materials. Reported estimates such as roughly 15 discrepancies per month and 1–2 hours of daily reconciliation are unvalidated and must not be presented as representative or measured results.
- No real customer records, verified pilot outcomes, testimonials, or confirmed brand assets are established by this record. Do not fabricate them.

## Product Principles

- Confirm actual funds before creating paid entitlement.
- Keep original financial and historical evidence retrievable; attach later decisions and corrections.
- Make authority and operator actions attributable and gym-scoped.
- Show uncertainty and unresolved evidence plainly; do not imply a settlement, access decision, or pilot result that the evidence cannot support.
- Treat business improvement as unproven until independent pilot evidence includes clear definitions and denominators.
