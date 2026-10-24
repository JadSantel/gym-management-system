# Gym CRM - Implementation Status

**Reviewed:** 2026-10-24 (Asia/Manila) | **HEAD audited:** `5362cd8` | **Data:** synthetic only
**Current task:** RR-00 post-MVP release-readiness audit — **VERIFIED (audit completed)**.
**Release:** **BLOCKED**. Existing checks pass, but targeted audit probes reproduce four requirement failures. This checkout corroborates S-01 and some renewal logic; S-03–S-07 implementation is absent. User-reported milestone completion is not treated as release evidence.
**Execution:** PAUSED for the user's GitHub checkpoint. No application fix, new feature, commit/push, production access, deployment or real onboarding performed.

Detailed severity, source references, FR/AC and AD coverage, reproducible checks and minimum fixes: [release-readiness audit](RELEASE_READINESS_AUDIT.md).

## Verified baseline and milestone reconciliation

| Task / slice | State | Evidence / limitation |
|---|---|---|
| S-01a/b identity and tenant baseline | VERIFIED (local baseline) | Better Auth/Prisma lifecycle, owner/staff, TTL/replay/reset/revocation, current capabilities and real restricted-role RLS checks pass. All 12 tenant tables FORCE RLS; no runtime table ownership/superuser/BYPASSRLS/CREATEDB/CREATEROLE. Live identity and shared throttling remain release blockers. |
| S-01c member directory | VERIFIED (local baseline) | Shared Zod create/search, normalization, strict fields, duplicate review/concurrent create, authorization and gym isolation pass. |
| S-01d–g cash, receipt and eligibility baseline | VERIFIED (existing tests); release BLOCKED | Exact centavos, approved snapshots, atomic rollback, same-key concurrency/retry, immutable originals, linked receipt/history and half-open eligibility pass. R-01 recovery replacement and R-02 renewal review fail requirements. |
| S-02 renewal | BLOCKED (partial implementation) | Early adjacent cash renewal and extra queued-term confirmation denial pass; preview dates/gating fail. Late renewal/rollover/distinct-key concurrency exit evidence incomplete. R-09 lock mechanism needs architecture reconciliation. |
| S-03–S-07 | BLOCKED (not present in audited checkout) | No digital verification, case/correction/refund, outage/custody, closing, historical onboarding or pilot evidence workflows/tests. Confirm intended branch/commit before proposing implementation. |
| RR-00 audit | VERIFIED | Read required docs/source/schema/eight migrations/tests; ran checks and reproduced defects; detailed report linked above. Release remains blocked. |

## Current release findings and next tasks

| Task | State | Severity / smallest next action |
|---|---|---|
| R-01 payment recovery | TODO | HIGH: lost success response → replacement preview → new confirmation produced **2 payments for 1 simulated collection**. Resolve/retrieve original operation before enabling replacement; retain recovery across navigation/catalogue changes; add browser regression. **Next engineering task after user resumes.** |
| R-02 renewal preview | TODO | HIGH: preview starts today while committed early term starts at prior expiry; queued term still permits preview/collection UI. Compute/recheck reviewed interval and block unsupported sale before collecting funds. |
| R-03 throttling | TODO | HIGH: five anonymous reauth requests returned 401; next valid owner returned 429. Scope authenticated limits and verify deployment proxy/IP trust; keep enumeration protection. |
| R-04 checkout/evidence mismatch | BLOCKED | HIGH: identify source/evidence for reported S-03–S-07; do not restart or silently mark missing milestones complete. |
| R-05 live operations | BLOCKED | HIGH: synthetic-only identity/email; no verified staging/regions/hosted-pool, real bootstrap/recovery SOP, domain/Brevo delivery, restore/PITR/backup, monitors or incident evidence. Separate authorization required for external changes. |
| R-06 identity mutation strictness | TODO | MEDIUM: valid reauth plus protected `gymId`/`role` returns 200; fields are ignored, not trusted. Strict schema per application-owned workflow; preserve provider ownership and generic recovery responses. |
| R-07 configuration | TODO | HIGH: raw env consumption lacks accepted server-only validation/key-only safe diagnostics and negative tests (VAL-05). Validate existing required keys before use. |
| R-08 identity form recovery | TODO | MEDIUM: setup mismatch/invite errors lack field association/invalid state/focus recovery; reuse member form pattern. Baseline axe pass does not prove this interaction. |
| R-09 lock contract | BLOCKED | MEDIUM: AD-016/architecture §6 require member row locks; source uses transaction advisory lock plus exclusion. Reconcile narrowly; do not broadly grant member UPDATE. |
| R-10 coverage/observability | TODO | MEDIUM: add missing meaningful tests with fixes; safe error correlation/denial evidence and reviewed CI/staging/restore verification. |
| R-11 documentation/tooling | TODO | LOW: stale README/architecture handoffs; isolated install warns pinned dev ESLint is unsupported. Align evidence; no automatic upgrades. |

## Fresh executable evidence (2026-10-24)

- `node --version`, `npm.cmd --version`, `npm.cmd ls --depth=0` PASS: Node **24.21.0**, npm **11.19.0** and installed manifest pins, including Prisma/client/adapter **7.10.1**, Better Auth/adapter **1.7.12**, Next **16.4.3**, direct Zod **4.6.7**.
- Inline Node environment assertions PASS: both DB URLs target isolated synthetic PostgreSQL `127.0.0.1:55432/gym_crm_synthetic`; flag/origin checked without printing secrets. Read-only catalog assertions PASS: 12 FORCE-RLS tables, restricted role, eight finished migrations, `btree_gist` present. No migration applied.
- `npm.cmd test` **PASS 33/33**, zero skips, actual restricted PostgreSQL. Existing warnings: Better Auth shared client-IP bucket; pg concurrent-query deprecation. No existing test fails; the new audit reproductions reveal gaps in coverage.
- `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build` **PASS**. Generated `next-env.d.ts` restored. `git diff --check` **PASS**; historical AGENTS whitespace failure did not recur in this clean baseline.
- `npm.cmd audit --json --fetch-retries=0 --fetch-timeout=15000`: initial certificate failure; retry with `$env:NODE_OPTIONS='--use-system-ca'` **PASS**, **0 known vulnerabilities**. TLS verification remained enabled.
- Isolated `.local/readiness-install`, copied manifest/lockfile: `npm.cmd ci --ignore-scripts --no-audit --no-fund --cache ../npm-audit-cache --fetch-retries=0 --fetch-timeout=15000` with `NODE_OPTIONS=--use-system-ca` **PASS**, 531 packages. Existing dependencies untouched. Full lifecycle/bootstrap/build from clean install **NOT VERIFIED**.
- `npm.cmd start` failed `EADDRINUSE` on 3000; existing server untouched. With `$env:BETTER_AUTH_URL='http://127.0.0.1:3001'`, `npm.cmd start -- --port 3001` **PASS**. Audit-owned server stopped after checks.
- Same origin override, `npm.cmd run test:browser`: sandbox attempt failed `Browser step 'close' failed`; local doctor passed. Retry with Chrome-launch permission **PASS exit 0**, including cleanup. Owner/staff, member validation/correction, keyboard, 375px layout, short/full cash, same-key lost-response retry/reload, receipt/history and current eligibility pass. All **13** audited states have zero axe WCAG A/AA violations/incomplete checks. `.local/member-validation-mobile.png` visually inspected; no full WCAG certification claimed.
- Same origin override, `node --env-file=.env.local --env-file=.env.migration.local --import tsx .local/readiness-probes.mjs` exited 0 confirming defects **R-01/02/03/06**. Requirement outcomes **FAIL**: replacement created two payments; renewal preview differed from commit by 30 days; anonymous traffic blocked owner; extra identity keys accepted. Ignored local harness is not committed regression coverage. Synthetic fixtures retained; no real funds involved.

## Validation inventory and prior checkpoints

| Task / boundary | State | Coverage / remaining work |
|---|---|---|
| Z-00 documentation; Z-01 inventory | VERIFIED (prior tasks) | AD-033 / PROJECT VAL-01–06 accepted; repository inventory reconciled in this audit. |
| Z-02 member create/search | VERIFIED | Browser-safe strict schemas/inferred types in `member-schema.ts`; parsed server values, field errors, safe no-write denials, retained values/focus/correction, auth/RLS/financial regressions pass. Direct Zod 4.6.7 installed/pinned. |
| Z-03 identity | TODO | Setup/invite/reset/reauth/disable/capabilities still manually validated; extra keys ignored. R-06/08. Better Auth continues to own authentication internals. |
| Z-03 plans/charges/payments | TODO | Existing manual strict allowlists, UUID/exact-money checks remain; server-derived authority, locks, constraints and retry semantics retained. Migrate one workflow per task. |
| Z-03 params/query/storage/config | TODO | Parse actual dynamic query shapes; cash retry storage currently uses a type assertion/truthiness. Config-before-use remains R-07. No speculative import/provider schemas: those workflows do not exist. |
| Z-04 integrated validation review | TODO | Full VAL-01–06 acceptance remains unverified; member integration alone does not close it. |

Prior S-01/Z-02 evidence is retained in repository history; this ledger replaces stale transient narratives with fresh results. Current checks do not prove hosted Neon transaction pooling, restore RPO/RTO, live email or S-03–S-07 acceptance.

## Gates and reproducible manual checks

Open: O-01 rounding/expiry wording; extra queued renewals and cross-date historical/digital rules; O-02/06 outage/custody; O-03 refund terms; O-04 named verifiers; O-05 claim evidence; closing cutoff/float/late adjustments; O-08 legacy sign-off; O-09 pilot evidence; live privacy/retention, ownership/recovery SOPs and operational coverage. **O-07 remains resolved**: PHP 800/30 days, PHP 2,100/90 days, PHP 4,000/180 days. No unresolved rule was guessed.

Synthetic reproduction prerequisites: isolated DB and built app, individual authorized owner, initialized approved plans and new synthetic member.

1. Verify ordinary join: no payment → Not eligible; short cash → rejection/no records; exact full cash → one receipt/period and current eligibility.
2. Simulate successful payment with response lost. Same-key retry returns the same record. **Defect:** replace preview before resolving, then confirm; currently creates a second payment for the simulated collection.
3. Preview early renewal: compare proposed start with current expiry; currently differs. Queue one paid term; another preview still succeeds although confirmation rejects it.
4. Send five anonymous valid-format reauthentication requests, then a correct owner request: currently 401 × 5, then 429. Clear only synthetic test throttle state afterward.
5. Send valid owner reauth with extra `gymId`/`role`: currently 200; expected strict-input rejection. No privilege escalation observed.

**Next / checkpoint:** review the audit, then authorize R-01's bounded fix and regression. Reconcile the reported later-milestone source independently. No subsequent engineering task has started.
