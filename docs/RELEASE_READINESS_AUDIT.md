# Gym CRM release-readiness audit

**Date:** 2026-10-24 (Asia/Manila). **Audited HEAD:** `5362cd8` (`feat: validate member creation and search with Zod`). Initial working tree was clean.
**Verdict: BLOCKED for release.** Existing S-01 checks pass, but targeted audit checks reproduce payment-recovery, renewal-preview, throttling and validation defects. This checkout does not contain the reported S-03–S-07 implementation. No application fixes, policy changes, live onboarding or deployment were authorized or performed.

## Scope and evidence limits

Read `AGENTS.md`, `PROJECT.md`, `architecture.md`, `design.md`, the previous implementation ledger, source routes/components/services, Prisma schema/eight migrations, all three test files and the browser acceptance script. Applied Ponytail, Caveman, UI/UX Pro Max, agent-browser and verification guidance. Interface recommendations follow existing design contracts; no redesign is proposed.

Tests used only the existing isolated synthetic PostgreSQL at `127.0.0.1:55432/gym_crm_synthetic`. Both runtime and migration destinations were asserted before tests. No cloud account, deployment, real receiving account, member data or live email was inspected. Absence of repository evidence does not prove an external system does not exist.

## Findings, severity and minimum fixes

Severity: **High** blocks the affected release journey or security/operational gate; **Medium** requires bounded correction or explicit acceptance; **Low** is documentation/tooling debt. No confirmed Critical finding was established. Passing dependency advisories are not a security certification.

### R-01 — HIGH: An unknown payment outcome can be replaced with a new collection

- **Evidence:** `src/components/charge-preview.tsx:45` leaves preview creation available while `pending` exists; its button at line 57 disables only during `busy`. A replacement URL remounts the component and creates a new operation key. The key is stored per charge, so it does not guard the replacement charge. Same-key server retry remains correct.
- **Reproduced:** discard a successful `/api/payments` response after commit; observe the unknown-outcome state; select **Prepare charge preview**, then **Confirm full cash**. PostgreSQL contains **two payments for one simulated collection**. No second funds-received event was supplied during the reproduction. The second payment creates an advance term rather than colliding with the first charge's uniqueness constraint.
- **Impact/trace:** duplicate financial history/entitlement through the recovery UI; AC-03c, AD-012, design §7.2/§15 and UX-06.
- **Minimum fix:** preserve an unresolved operation across preview changes/navigation and require retrieval or same-key resolution before enabling a replacement sale. Keep recovery usable after catalogue changes: line 79 currently hides confirmation/retry when `saved.priceChanged`, although server replay checks the committed result before current pricing. Do not assume every 4xx proves the previous attempt did not commit. Add browser regressions for replacement, reload, price-change and permission-restoration recovery; retain current transaction/idempotency guarantees.

### R-02 — HIGH: Renewal review shows different dates from the paid term

- **Evidence:** `src/lib/charges.ts:22` always previews midnight today; renewal sequencing is evaluated only during confirmation at lines 59–66. UI describes these dates as estimates and still permits collection when a queued term already exists.
- **Reproduced:** early-renewal preview starts `2026-10-23T16:00:00.000Z`; committed renewal starts `2026-11-22T16:00:00.000Z`, exactly at the prior end. A further preview succeeds despite an existing queued paid term; confirmation then rejects it with 409. Correct confirmation dates do not repair the incorrect pre-collection review.
- **Impact/trace:** operator collects funds against misleading dates or for a blocked sale; AC-02a, AC-05b/e, UX-05/07.
- **Minimum fix:** compute preview dates from current gym-scoped entitlement and enforce queued-term restrictions before collection. Recheck under the existing member lock at confirmation. When time/entitlement changes invalidate reviewed dates, require renewed review before accepting funds; keep late-renewal midnight policy unchanged. Test early, late, queued, midnight rollover and competing previews.

### R-03 — HIGH: Anonymous traffic can exhaust every owner's sensitive-action limit

- **Evidence:** `src/lib/http.ts:7` keys application limits by action only; `src/app/api/identity/[action]/route.ts:18` consumes that bucket before authentication. Other application mutation limits use the same pattern. Better Auth also warns that local login requests fall back to one shared per-path bucket; `auth.ts` has no explicit deployment proxy trust configuration. README identifies shared buckets as intentional for local mode.
- **Reproduced:** five anonymous reauthentication requests return `[401,401,401,401,401]`; the next valid owner request returns **429**. Origin checks do not prevent a non-browser caller from supplying the permitted Origin header. This is denial of service, not an authorization bypass.
- **Minimum fix before live use:** separate authenticated actor/action limits from bounded anonymous abuse limits. Configure trusted client-IP/proxy behavior only against the actual hosting contract, preserving provider enumeration protections. Test independent owners, unauthenticated floods and spoofed forwarding headers. Do not remove rate limits.

### R-04 — HIGH: S-03–S-07 completion is not present in this checkout

- **Evidence:** build exposes identity, members, plans, charges, cash payments and receipts only. `prisma/schema.prisma` has no digital claim/verification, investigation, adjustment/refund, outage/custody/provisional-visit, closing or migration-provenance models. The SQL payment method constraint accepts only `CASH` (`202610240006_cash_confirmation/migration.sql:11`). No corresponding workflow tests, manual SOPs or pilot worksheet/report were found.
- **Impact/trace:** FR-04, FR-07–12, AC-01c, AC-05d and AC-06c cannot be demonstrated. Read-only member payment history does not satisfy searchable investigations or correction workflows. Missing refund execution safely prevents refunds, but does not satisfy request/escalation requirements.
- **Minimum next action:** identify the intended branch/commit and its executable evidence before considering implementation. If this is the intended checkout, record the missing scope honestly and obtain authorization for one existing-requirement task at a time. Do not recreate milestones or waive acceptance based on the completion report.

### R-05 — HIGH: Live identity, environment, recovery and operational gates remain unverified

- **Evidence:** `src/lib/email.ts` implements local capture only; identity setup/invite/reset call `assertSynthetic`; identity input accepts reserved `.test` addresses. Bootstrap is a synthetic migration-credential CLI, not an approved production provisioning path. No Brevo transport, independently verified bootstrap/manual-recovery runbook, recovery-success notice, deployed environment evidence, restore rehearsal, independent-backup evidence, production monitors or release CI were found. No tracked `.github` pipeline or Vercel region configuration exists; region may be configured externally, which was not checked.
- **Impact/trace:** AD-014/020/023–025/027–032, architecture §10–12 and PROJECT §9/§10. Local PostgreSQL connection reuse is not Neon PgBouncer verification. RPO ≤1h/RTO ≤4h and seven-day PITR are targets, not proven capabilities.
- **Minimum next action:** collect approved SOPs and environment evidence first. After separate authorization, verify isolated staging, `sin1`/Singapore DB, restricted pooled runtime/direct migration credentials, security-definer function ownership under FORCE RLS, domain/sender delivery, restore/reconciliation, incident ownership and alerts. Preserve the synthetic guard until an explicitly authorized live-mode task supplies those controls. No cloud provisioning or purchase is implied.

### R-06 — MEDIUM: Identity mutations ignore disallowed/protected fields

- **Evidence/reproduction:** authenticated `reauthenticate` with valid password plus `gymId` and `role` returns **200**, rather than rejecting the unexpected keys. All seven application-owned identity actions select fields without strict mutation schemas. This does **not** promote the caller or trust the supplied gym, but fails VAL-01 and architecture §17's rejection requirement.
- **Minimum fix:** one identity workflow at a time, use strict browser-safe schemas and parsed allowlisted output; preserve password bytes, provider token/session ownership, generic recovery messages and existing permissions. Test extra fields, wrong types, boundaries and no unauthorized writes. Zod 4.6.7 is already directly installed; add no validation package.

### R-07 — HIGH: Required application configuration lacks the accepted safe validation boundary

- **Evidence:** `src/lib/db.ts:7`, `auth.ts:10` and `http.ts:48` consume raw environment values. Selected synthetic workflows validate local destinations, and Better Auth has its own secret checks, but these do not establish application-wide validation before first use. Installed Better Auth warns, rather than universally rejecting, secrets shorter than 32 characters. No application config-negative tests or key-only diagnostic contract exist.
- **Impact/trace:** AD-025/033 and VAL-05; live configuration cannot be marked verified. No secret disclosure or privileged connection was demonstrated.
- **Minimum fix:** a small server-only configuration schema for the keys actually consumed; fail closed with key names and safe reasons. Verify missing/malformed URL, invalid origin/secret and synthetic/live mode combinations without connecting to unintended databases or emitting input values. Keep migration secrets outside the web runtime.

### R-08 — MEDIUM: Identity form errors lack field association and focus recovery

- **Evidence:** `src/components/setup-form.tsx:19` reports password mismatch only in a general status paragraph; confirmation has no invalid state/error description or focus move. `operator-settings.tsx` likewise reports invitation failures in one general status without field association. Announcements exist, and the baseline axe run passes; axe does not prove this interaction contract.
- **Trace/minimum fix:** design §5/§15, VAL-02. Reuse the member form's inline errors/focusable summary pattern for the touched identity workflow. Preserve generic credential failures and non-sensitive entered values; do not persist secrets. Verify mismatch correction, server rejection and keyboard/screen-reader behavior. No visual redesign needed.

### R-09 — MEDIUM: Approved member-row-lock contract differs from implementation

- **Evidence:** AD-016 and architecture §6 prescribe member `SELECT ... FOR UPDATE`; `charges.ts:51` uses transaction-scoped advisory locking on gym/member instead. The prior ledger explains that the runtime lacks member UPDATE privilege. Advisory serialization plus exclusion is exercised, but this is not evidence of compliance with the specifically approved row-lock mechanism.
- **Minimum next action:** reconcile this narrow architecture deviation explicitly before approving the invariant. Preserve least privilege; do not broadly grant member UPDATE as a shortcut. Retain/exercise exclusion and add distinct-key simultaneous renewal coverage. Audit continues on independent work; no approved AD was silently rewritten.

### R-10 — MEDIUM: Failure observability and release coverage are incomplete

- **Evidence:** `src/lib/http.ts:50` converts unexpected errors to a generic 500 without recording an opaque correlation reference or a safe server diagnostic. Denied identity/financial service paths generally throw without an attributable denial audit. Tests verify same-key concurrency and sequential advance renewal, not simultaneous distinct-key renewals; no clean-environment restore, hosted-pool integration, or S-03–S-07 acceptance suite exists. Auth-backed audit and financial originals are otherwise append protected under runtime grants.
- **Minimum fix:** add narrowly scoped, redacted diagnostics/denial evidence with opaque references where required; avoid raw errors, credentials or payloads. Add missing regression scenarios alongside each authorized fix. Establish reviewed CI/staging/restore evidence before release; avoid a new observability platform by default.

### R-11 — LOW: Stale handoffs and development-tool lifecycle warning

- README still says only S-01a–e are verified and S-01f is next; old status narrative mixed several checkpoints. Architecture AD-003 says region unresolved despite AD-024; §14 still lists launch plan selection despite PROJECT O-07 being resolved. These are stale references, not permission to alter settled decisions. AGENTS §9's documentation-only handoff is superseded for this task by the explicit audit request.
- Isolated install warns that pinned development ESLint 9.39.5 is unsupported. npm audit reports no known advisories. Verify maintenance compatibility in a separate bounded tooling task; no dependency upgrade is needed to record this audit.
- Minimum fix: keep the status ledger current, then align stale handoffs with verified evidence and existing approvals. No business policy changed in this audit.

## FR/AC coverage against actual repository

| Requirement | Current executable/source evidence | Release result |
|---|---|---|
| FR-01; AC-01a–c | Owner/staff lifecycle, attribution, current capability/revocation and RLS checks pass. Immutable cash history resists staff edits. Digital verifier and closing/correction command paths are absent; denial auditing incomplete. | Partial; R-03/04/05/10 |
| FR-02; AC-02a–c | Member create/search/duplicate handling, approved catalog, owner pricing, snapshot preservation and forbidden fields/durations pass. Renewal review dates fail. | Partial; R-02 |
| FR-03; AC-03a–d | Full-only exact centavos, atomic rollback, same-key concurrent replay, conflicting payload and linked receipt/history pass. Alternate recovery path creates a replacement collection. | Partial; R-01 |
| FR-04; AC-04a–d | No GCash/bank pending queue, designated account authorization or settlement verification. CASH-only constraint safely rejects other storage methods. | Missing/gated; R-04/05; O-04 |
| FR-05; AC-05a–e | Fixed 30/90/180-day arithmetic and leap/month-end unit tests pass; early adjacent cash renewal and queued-term confirmation denial pass. Preview fails; late-renewal command, rollover and distinct-key races lack focused integrated exit evidence. Outage original-date recovery absent. | Partial; R-02/04/09/10; O-01/date details |
| FR-06; AC-06a–c | Current server-time interval evaluation, exact start/end, adjacent, expired, no-period and future-only tests pass. Browser distinguishes unpaid preview from current eligibility. Provisional/incident records absent. No historical admission reconstruction test proves verification-time cutoff. | Partial; R-04/10 |
| FR-07; AC-07a–d | Member-linked read-only cash history exists; no reference/date/method/collector search, case, evidence or omitted-payment recovery workflow. | Missing/gated; R-04; O-05/date details |
| FR-08; AC-08a–d | Originals protected by triggers/grants. No request/escalation, linked approval, actual refund disposition or entitlement adjustment workflow. | Missing/gated; R-04; O-03 |
| FR-09; AC-09a–f | No controlled receipt/custody SOP artifact, registry, provisional visit, pending back-entry or number-conflict recovery. Ordinary digital cash receipts are a different record. | Missing/gated; R-04; O-02/06 |
| FR-10; AC-10a–d | No method/collector close, actual cash count, persistent difference, owner approval or immutable close/late-adjustment history. | Missing/gated; R-04; closing cutoff/float/late-change decisions |
| FR-11; AC-11a–c | No reviewed historical-entitlement/provenance/manual-entry workflow or uncertainty flags. Payment-sourced period cannot be repurposed as verified migration. | Missing/gated; R-04; O-08 |
| FR-12; AC-12a–c | Online collection/entry/verification timestamps exist. No pilot worksheet/report, independent denominator, admission incidents, closing timing, adoption or baseline protocol evidence. A manual worksheet would be acceptable. | Missing/gated; R-04/05; O-09 |

## Architecture and validation coverage

| AD / validation group | Audit result |
|---|---|
| AD-001/002/011/018 | One Next.js/TypeScript/PostgreSQL application with Prisma and bounded parameterized SQL; modular monolith direction present. |
| AD-004–008/010/019/026 | Local identity/session lifecycle, one-gym binding, primary-owner uniqueness/activation, no public signup, Better Auth Prisma/username, 48h/30m single-use links, 7-day/24h renewal and 5-minute reauth verified. Live recovery/notification remains R-05. |
| AD-009/013 | All **12** current tenant tables ENABLE/FORCE RLS; runtime owns none and lacks superuser/BYPASSRLS/CREATEDB/CREATEROLE. Existing actual-role tests verify context, composite cross-gym references, pooled reuse, rollback and revocation. Global auth exceptions use fixed-path qualified security-definer functions. Hosted pool/function ownership still unverified. |
| AD-012/016/022 | Atomic cash payment/original period/projection/receipt/audit/idempotency and no-overlap constraint verified locally. R-01 recovery defect, R-09 lock deviation and absent corrective projection workflow prevent full acceptance. |
| AD-015/017/021 | Node 24.21.0/npm 11.19.0, Prisma/client/adapter 7.10.1, Better Auth/adapter 1.7.12, Next 16.4.3 and Zod 4.6.7 match installed direct pins. Exact bounded PostgreSQL INTEGER centavos and decimal-string parsing pass; no float-based collection calculation. |
| AD-003/020/024/025 | Local build succeeds; separate web/migration env files are used. Actual Vercel/Neon environments, Singapore regions, bounded hosted pool, privilege separation and gated delivery are NOT VERIFIED. |
| AD-014/023/027–032 | Synthetic-only onboarding/recovery/email verified. Production ownership/recovery proof, transactional delivery, backups/PITR, restore targets and operations remain gated; R-05. |
| AD-033 / VAL-01–06 | Shared browser-safe member schemas and safe errors verified. Identity strictness and configuration fail accepted coverage, R-06/07/08. Plan/charge/payment transport still uses manual validators; exact money/auth/RLS/retry regressions pass but do not certify complete Zod integration. |

Architecture T-01–05, T-07–08 and local parts of T-14–17 have existing evidence. T-06 lacks distinct-key simultaneous renewal coverage; T-09 has staff storage denials but not implemented/audited correction endpoints; T-10/11 workflows are absent; T-12 restore and T-13 live provider failure handling are NOT VERIFIED. No claim of hosted-pool, full WCAG 2.2 AA or pilot acceptance is made.

## Commands and actual results

| Command / check | Result |
|---|---|
| `git status --short`; `git log -1 --format='%h %s'` | Clean baseline; HEAD `5362cd8`. |
| `node --version`; `npm.cmd --version`; `npm.cmd ls --depth=0` | PASS; exact manifest pins installed. |
| Inline Node assertions with `--env-file=.env.local --env-file=.env.migration.local` | PASS; both URLs restricted to local synthetic target, flag/origin checked without disclosing values. |
| `npm.cmd test` | **PASS 33/33**, zero skips, actual PostgreSQL and restricted runtime; no failing existing test. Better Auth shared-IP-bucket and pg concurrent-query deprecation warnings remain. |
| `npm.cmd run typecheck`; `npm.cmd run lint`; `npm.cmd run build` | PASS. Build inventory confirms only existing S-01/cash routes. Build-generated `next-env.d.ts` changes restored. |
| `npm.cmd audit --json --fetch-retries=0 --fetch-timeout=15000` | Initial attempt failed certificate verification. Retry with `$env:NODE_OPTIONS='--use-system-ca'` **PASS**, zero known vulnerabilities; TLS verification remained enabled. |
| Isolated `.local/readiness-install`: same manifest/lockfile, `npm.cmd ci --ignore-scripts --no-audit --no-fund --cache ../npm-audit-cache --fetch-retries=0 --fetch-timeout=15000` with `NODE_OPTIONS=--use-system-ca` | PASS, 531 packages. Existing workspace dependencies untouched. Lifecycle scripts, generated Prisma client and a build from that clean installation were **not** verified. |
| Read-only PostgreSQL catalog probe | PASS: all 12 tenant tables FORCE RLS/non-runtime-owned, restricted runtime role, eight finished/non-rolled-back migrations, `btree_gist` present. No migration applied. |
| `npm.cmd start` | Initial start failed `EADDRINUSE` on 3000. Existing listener left running. Process inspection was sandbox-denied; no process killed. |
| `$env:BETTER_AUTH_URL='http://127.0.0.1:3001'; npm.cmd start -- --port 3001` | PASS; isolated built local app used for browser testing. Audit-owned server stopped afterward. |
| Same origin override; `npm.cmd run test:browser` | Sandboxed attempt failed with `Browser step 'close' failed`, masking initial launch failure. `agent-browser doctor --offline --quick` passed basic diagnostics. Authorized Chrome-launch retry **PASS exit 0**, including close. All **13** audited page/states report zero axe WCAG A/AA violations/incomplete checks; keyboard/375px layout, member recovery, owner/staff, short/full cash, lost-response same-key replay, receipt/history and current eligibility pass. Mobile validation screenshot visually inspected. |
| Same origin override; `node --env-file=.env.local --env-file=.env.migration.local --import tsx .local/readiness-probes.mjs` | Reproduction harness **exit 0**: R-01 two payments; R-02 preview mismatch/queued-preview acceptance; R-03 valid owner 429 after five anonymous 401s; R-06 extra protected identity fields accepted. These are **failed requirements**, not passing acceptance checks. Harness is an ignored local audit artifact, not committed regression coverage. |
| `git diff --check` | PASS at final documentation boundary. Historical AGENTS whitespace failure was not present in this clean baseline. |

Browser/database scripts run sequentially because they reset synthetic rate buckets. Tests/probes create isolated synthetic fixtures; no real money changes hands. No production-like restore, cloud latency, load test, live email, external evidence custody or pilot data checks ran.

## Decisions and ordered next tasks

1. **R-01 repair** — smallest existing-flow fix plus regression demonstrating one simulated collection remains one payment through lost response, reload, replacement preview and catalogue change. Pause for GitHub checkpoint.
2. **R-02 repair** — correct renewal review/queued-sale gating and date/concurrency tests. Resolve R-09's approved lock-mechanism deviation before accepting that invariant; preserve least privilege. Pause.
3. **R-03 repair** — scoped limits and tested trusted-proxy contract before any live deployment. Pause.
4. **Reconcile R-04 checkout/evidence** — locate reported S-03–S-07 implementation. Audit that source before proposing missing-work implementation; no new feature authorized here.
5. **Z-03 bounded workflows** — identity strict schemas/form recovery (R-06/08); safe server configuration (R-07); then existing plan, charge/payment and dynamic query boundaries. Preserve money/date/authorization/retry behavior and record each workflow separately.
6. **Release gates** — R-05/10 staging/CI, hosted RLS, recovery/monitoring and approved operations, each under its own authorization. Only then reassess release/pilot readiness.

Open decisions remain **O-01** rounding/expiry wording; extra queued renewals and cross-date digital/non-outage historical effective dates; **O-02/06** repeat/lost receipt and custody; **O-03** refund/excess-payment rules; **O-04** named receiving-account verifiers; **O-05** claim evidence/retention; closing cutoff/float/late adjustments; **O-08** legacy sign-off; **O-09** pilot protocol/denominators. Minimum PII, evidence/operational retention, ownership/recovery reviewers and support coverage also need approval. **O-07 catalog is resolved** and was not reopened. Pending decisions do not authorize fabricated defaults.

**Checkpoint:** audit complete, release blocked; fixes remain TODO. No commit/push, production deploy, live email, real onboarding or new feature started.
