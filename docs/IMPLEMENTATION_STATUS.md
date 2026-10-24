# Gym CRM - Implementation Status

**Reviewed:** 2026-10-24 (Asia/Manila) | **Scope:** S-01 only | **Data:** synthetic only
**Execution:** PAUSED after verified S-01f for the user's GitHub checkpoint. Do not start S-01g until the user resumes.
**Current outcome:** S-01f exposes tenant-scoped member payment history and retrievable linked receipts with financial and period details; synthetic browser checks pass.

| Task | State | Evidence / next action |
|---|---|---|
| S-01a - Identity and controlled setup | VERIFIED | Actual PostgreSQL/Better Auth lifecycle, HTTP denials, browser owner/staff flows and axe checks pass. |
| S-01b - Capabilities and tenant enforcement | VERIFIED | FORCE RLS with restricted role; cross-gym references/context/pool/revocation tests pass. |
| S-01c - Member directory | VERIFIED | Validated create/search, duplicate review, concurrent create and direct authorization/tenant checks pass. |
| S-01d - Approved plan and exact charge | VERIFIED | Approved catalogue, owner pricing, exact centavo previews and immutable snapshots pass PostgreSQL and prior browser checks. |
| S-01e - Atomic full-cash confirmation | VERIFIED | PostgreSQL rollback/concurrency/immutability checks pass; browser short/full cash, lost-response retry after reload, receipt linkage, mobile and axe checks pass. |
| S-01f - Receipt and history | VERIFIED | Member history shows collector, amount, method, collection/entry/verification timestamps and paid interval; linked receipt page retrieves immutable receipt/payment details. Actual browser flow and axe checks pass. |
| S-01g - Eligibility and demonstration | TODO | Requires S-01f and full S-01 acceptance suite. |

## Documentation layout

- Project requirements, product policies, architecture, design and this ledger live in `docs/`. Root `README.md` indexes them; root `AGENTS.md` retains agent discovery and uses the new paths.
- Documentation reorganization checks: SHA256 comparisons preserved all five files during their moves; all nine local Markdown links resolve; root document-path checks and `git diff --check` PASS. Application checks were not rerun for this documentation-only task; S-01e evidence below is retained.

## S-01e evidence

- `npm.cmd run db:generate` PASS; `npm.cmd run db:migrate` PASS on isolated synthetic PostgreSQL `127.0.0.1:55432`. Additive migrations `202610240006_cash_confirmation`, `202610240007_cash_integrity`, and `202610240008_idempotency_immutability` are applied there only.
- `npm.cmd test` PASS, **30/30**, against PostgreSQL using the restricted `gym_runtime` role. Added checks cover full-only centavo amounts, stale price/authorization/cross-gym denial, transaction rollback after a forced period-write failure, same-key concurrent retry, conflicting payload, single future renewal, exact period duration/start, overlap exclusion, forced RLS, immutable records and audit linkage.
- Financial writes commit together: confirmed cash payment, immutable paid period, effective entitlement projection, receipt/reference, audit event and scoped idempotency result. Database triggers also validate charge amount, member, duration and period linkage.
- `/api/payments` accepts `chargeId`, exact `cashReceived`, and a UUID `Idempotency-Key`; server derives gym/operator, rechecks current capability, locks current plan and member sequence, and rejects partial or stale charges. The member sequence uses a transaction advisory lock keyed by gym/member because the restricted runtime has no member UPDATE privilege required by PostgreSQL `SELECT FOR UPDATE`; this avoids granting unsafe member-edit access.
- The member charge screen supports full-cash confirmation, retained same-key retry after an unknown response, and a success result with payment and receipt references plus the actual paid interval. The saved-preview label is neutral so it cannot falsely claim that a completed payment was not recorded. Existing shadcn patterns and semantic tokens are reused; no project dependency added.
- `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build`, `git diff --check` PASS. Build-generated `next-env.d.ts` changes were restored.
- `npm.cmd run test:browser` PASS against the built local Next server and actual synthetic PostgreSQL. Short cash creates no payment/period; exact cash commits linked records. The test deliberately discards a successful response after commit, reloads, retries the stored key and verifies the same reference with exactly one payment/period. All ten audited pages/states report zero axe WCAG A/AA violations/incomplete checks. Keyboard entry and 375px overflow pass; `.local/cash-confirmed-mobile.png` was visually inspected.
- Browser setup gap resolved: pinned CLI 0.39.2 was already installed in npm's `_npx` cache. Its native executable was copied to ignored `.local/browser-tools/agent-browser-win32-x64.exe`; that path and installed Chrome's path are saved in ignored `.env.local`. A download attempt exposed a certificate-chain error, so the existing CLI was reused without disabling TLS. Chrome requires permission to launch outside the restricted coding sandbox; the successful browser command used that permission.
- Non-failing test warnings: Better Auth cannot resolve a trusted client IP in this local setup; pinned `pg` warns about concurrent query scheduling ahead of pg 9. No production proxy contract or dependency changes were made.

## S-01f evidence

- Member detail history reads only payments within the authenticated gym transaction and orders by collection time. It shows plan snapshot, exact amount, method, collector, entry timestamp, verifier/time, linked paid interval and payment reference.
- Each history item links to `/receipts/[id]`. The receipt page rechecks active identity/capability and gym context, then displays immutable receipt/payment references, gym/member, amount/method, plan snapshot, collector, recorded/verified/issued times and linked paid interval. Unknown or cross-gym receipt IDs are not found under tenant RLS.
- `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test` PASS (30/30), `npm.cmd run build`, `npm.cmd run test:browser`, and `git diff --check` PASS. Restricted PostgreSQL runtime confirms another gym cannot read the receipt. Browser test used synthetic PostgreSQL and the built local app; member history and receipt retrieval passed, as did axe WCAG A/AA checks with zero violations/incomplete checks. The existing CLI/Chrome needed sandbox permission to launch.
- No schema or dependency change. No new financial mutation; S-01e confirmation remains the source of immutable receipt and history records.

## Next action and manual checkpoint

Review the S-01f diff and take the user's GitHub checkpoint. Resume S-01g only on the user's instruction. Browser paths are configured locally; start the synthetic database/app and use `npm.cmd run test:browser` to repeat the checks. Task-owned Chrome sessions and the test app server were closed after verification. No commit or push was made.

Synthetic manual flow: sign in as owner or member-authorized staff; open a member with a confirmed cash payment; verify history shows collector, amount, cash method, collection and entry times, verifier/time, payment reference and paid period; follow the receipt link and verify its receipt reference and matching payment/period details. A guessed receipt ID from another gym must return not found. Eligibility remains pending S-01g.

**Limits:** Synthetic data only. No live users, actual cash, production migration, Brevo, deployment, domain, S-02 or real-member data. RPO/RTO and live readiness remain unproven.
