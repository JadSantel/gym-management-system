# Gym CRM - Implementation Status

**Reviewed:** 2026-10-24 (Asia/Manila) | **R-02 baseline HEAD:** `f1e7a4f` (clean working tree) | **Data:** synthetic only
**Current task:** R-02 accurate renewal review and stale-date rejection — **VERIFIED (local synthetic)**; R-09 architecture decision remains open.
**Release:** **BLOCKED** by remaining audit findings. This checkout corroborates S-01 and some renewal logic; S-03–S-07 implementation is absent. User-reported milestone completion is not treated as release evidence.
**Execution:** PAUSED for the user's GitHub checkpoint after R-02. No commit/push, production access, deployment or real onboarding performed.

Detailed severity, source references, FR/AC and AD coverage, reproducible checks and minimum fixes: [release-readiness audit](RELEASE_READINESS_AUDIT.md).

## Verified baseline and milestone reconciliation

| Task / slice | State | Evidence / limitation |
|---|---|---|
| S-01a/b identity and tenant baseline | VERIFIED (local baseline) | Better Auth/Prisma lifecycle, owner/staff, TTL/replay/reset/revocation, current capabilities and real restricted-role RLS checks pass. All 12 tenant tables FORCE RLS; no runtime table ownership/superuser/BYPASSRLS/CREATEDB/CREATEROLE. Live identity and shared throttling remain release blockers. |
| S-01c member directory | VERIFIED (local baseline) | Shared Zod create/search, normalization, strict fields, duplicate review/concurrent create, authorization and gym isolation pass. |
| S-01d–g cash, receipt and eligibility baseline | VERIFIED (local tests); release BLOCKED | Exact centavos, approved snapshots, atomic rollback, same-key concurrency/retry, immutable originals, linked receipt/history and half-open eligibility pass. R-01 recovery and R-02 review repaired. |
| S-02 renewal | BLOCKED (milestone acceptance) | Local early/late renewal, reviewed/stored interval equality, queued-preview gating, midnight rollover and distinct-key contention now pass. Remaining-day wording/multiple-advance policy and R-09 architecture reconciliation remain gates. |
| S-03–S-07 | BLOCKED (not present in audited checkout) | No digital verification, case/correction/refund, outage/custody, closing, historical onboarding or pilot evidence workflows/tests. Confirm intended branch/commit before proposing implementation. |
| RR-00 audit | VERIFIED | Read required docs/source/schema/eight migrations/tests; ran checks and reproduced defects; detailed report linked above. Release remains blocked. |

## Current release findings and next tasks

| Task | State | Severity / smallest next action |
|---|---|---|
| R-01 payment recovery | VERIFIED | AC-03c/d, AD-012, UX-06 / design §7.2/§15: operator/gym-scoped browser-tab recovery retains original key, charge and amount across reload/member/preview navigation and price changes. Replacement preview and new confirmation remain gated. Lost-response and restored-permission browser regressions each leave exactly **1 payment and 1 period**. |
| R-02 renewal preview | VERIFIED | AC-02a, AC-05b/c/e; UX-05/07: preview uses current gym/member effective entitlement. Queued sale blocked before snapshot creation. Confirmation recalculates under existing member lock and rejects changed reviewed dates before writes. Early/late, midnight, competing previews, recovery and stored-date equality pass locally. |
| R-03 throttling | TODO | HIGH: five anonymous reauth requests returned 401; next valid owner returned 429. Scope authenticated limits and verify deployment proxy/IP trust; keep enumeration protection. |
| R-04 checkout/evidence mismatch | BLOCKED | HIGH: identify source/evidence for reported S-03–S-07; do not restart or silently mark missing milestones complete. |
| R-05 live operations | BLOCKED | HIGH: synthetic-only identity/email; no verified staging/regions/hosted-pool, real bootstrap/recovery SOP, domain/Brevo delivery, restore/PITR/backup, monitors or incident evidence. Separate authorization required for external changes. |
| R-06 identity mutation strictness | TODO | MEDIUM: valid reauth plus protected `gymId`/`role` returns 200; fields are ignored, not trusted. Strict schema per application-owned workflow; preserve provider ownership and generic recovery responses. |
| R-07 configuration | TODO | HIGH: raw env consumption lacks accepted server-only validation/key-only safe diagnostics and negative tests (VAL-05). Validate existing required keys before use. |
| R-08 identity form recovery | TODO | MEDIUM: setup mismatch/invite errors lack field association/invalid state/focus recovery; reuse member form pattern. Baseline axe pass does not prove this interaction. |
| R-09 lock contract | BLOCKED (decision) | AD-016/architecture §6 prescribe member `SELECT ... FOR UPDATE`; runtime has SELECT/INSERT, no member UPDATE. R-02 tests observe two runtime waiters on the existing gym/member transaction advisory lock, one winner/one rejection, and exclusion rollback. No lock/grant/schema changes were needed for this behavioral repair. This does **not** approve the deviation: decide whether to approve advisory serialization explicitly or separately implement a reviewed least-privilege row-lock path. No broad UPDATE grant. |
| R-10 coverage/observability | TODO | MEDIUM: add missing meaningful tests with fixes; safe error correlation/denial evidence and reviewed CI/staging/restore verification. |
| R-11 documentation/tooling | TODO | LOW: stale README/architecture handoffs; isolated install warns pinned dev ESLint is unsupported. Align evidence; no automatic upgrades. |

## R-02 changed files and executable evidence (2026-10-24)

- `src/lib/charges.ts`: shared proposed-period calculation uses current effective gym/member intervals; active renewal starts at current end, late/new term at collection-date midnight PHT; any future paid interval blocks preview. Confirmation rereads intervals/time under the unchanged advisory lock, compares both reviewed endpoints, and returns safe 409/no-write rejection on mismatch. Original charge remains immutable; committed same-key replay still precedes price/date/queued checks. No schema, migration, dependency, grant or policy changes.
- `src/components/charge-preview.tsx`: replace estimate wording with the reviewed-term/recheck contract; a definitive serialized 409 removes the stale confirmation form until a new preview. Unknown outcomes retain the R-01 same-key recovery gate.
- `tests/business.test.ts`: real restricted-runtime route tests compare saved previews with stored early/late periods; reject queued preview without snapshot/audit writes; reject/retry stale late dates across midnight without new financial records; accept unchanged early dates across midnight; replay committed keys after rollover/queue. Distinct-key join and renewal races wait on the actual advisory lock (`pg_locks`), produce 200/409 and exact payment/period/projection/receipt counts. Explicit overlapping insert fails `effective_entitlement_no_overlap` and rolls back. Runtime remains non-superuser/non-BYPASSRLS without member UPDATE. Only the synthetic shared preview throttle is reset between independent scenarios (R-03 unchanged); Node mocks application Date, not PostgreSQL or locking.
- `scripts/test-identity-browser.ts`: displayed early dates equal saved/stored dates; queued preview denied; competing real confirmation invalidates another review, focuses announced error, removes stale submit and allows payment only after a fresh preview; R-01 lost-response/permission-restoration tests retained.
- `docs/IMPLEMENTATION_STATUS.md`: this handoff. These **five files** are the task changes; generated `next-env.d.ts` restored and final diff reviewed.
- Environment assertion: stdin Node script with `--env-file=.env.local --env-file=.env.migration.local --input-type=module` **PASS**: both destinations exactly `127.0.0.1:55432/gym_crm_synthetic`; synthetic flag true; no secrets printed.
- `node --env-file=.env.local --env-file=.env.migration.local --import tsx --test --test-concurrency=1 tests/business.test.ts` **PASS 19/19**. `npm.cmd test` **PASS 36/36**, zero skips; repeated after strengthening late-midnight/unchanged-early coverage, **PASS 36/36**. Existing Better Auth shared-IP and pg concurrent-query warnings remain baseline issues.
- `npm.cmd run typecheck` **PASS**; initial `npm.cmd run lint` **FAIL** `react/no-unescaped-entities` on new copy, wording fixed; lint rerun **PASS**. `npm.cmd run build` **PASS**. Final typecheck/lint and `git diff --check` **PASS**.
- `$env:BETTER_AUTH_URL='http://127.0.0.1:3001'; npm.cmd start -- --port 3001` **PASS**. Browser command: same origin override plus `$env:AGENT_BROWSER_BIN=(Resolve-Path '.local/browser-tools/agent-browser-win32-x64.exe').Path; npm.cmd run test:browser`. Sandboxed Chrome attempt failed `Browser step 'close' failed`; `agent-browser doctor --offline --quick` passed (optional ffmpeg absent). Authorized Chrome-launch retry **PASS exit 0**, including cleanup; **18** axe states with zero violations/incomplete checks, existing keyboard/375px/recovery regressions included. Task-owned port-3001 server stopped with Ctrl+C (expected exit 1); existing port 3000 untouched.
- Limits: R-02 behavior verified locally with the existing advisory mechanism, **not** AD-016 row-lock compliance, hosted Neon pooling, live collection or full S-02 acceptance. R-09 and other release findings remain open.

## Prior R-01 changed files and executable evidence (2026-10-24)

- `src/components/charge-preview.tsx`: strict browser-safe Zod recovery record; persist before sending; disable replacement until resolved; independent same-key retry despite absent/different/stale preview; safe storage failure gate; retain attempts after unclassified 4xx. Existing per-preview record is recovered when its saved preview is opened.
- `src/app/members/[id]/page.tsx`: server-derived gym/operator recovery scope; remount by member/preview to avoid stale form state.
- `src/lib/charges.ts`, `src/app/api/payments/route.ts`: explicit `cash-confirmation-outcome: not-confirmed` only for domain rejection **after serialized original-key/fingerprint lookup and before financial writes**. HTTP statuses, bodies, auth, RLS, locks, atomic writes and committed-result replay ordering remain intact. Authorization, malformed input, fingerprint conflict and unexpected errors do not emit this marker. No schema/migration/dependency/settings changes.
- `tests/business.test.ts`: real restricted-PostgreSQL lost-response/price-change/permission-restoration replay and rejection-marker checks; existing rollback, immutability, cross-gym and concurrency checks retained.
- `scripts/test-identity-browser.ts`: committed response discarded; disabled-button and submit-handler replacement attempts; later synthetic 409; reload, other member and other saved-preview navigation; catalogue change; original key/result; real staff 403/reload/permission restoration; exact payment/period counts. Resets only the isolated synthetic reauth bucket between independent scenarios because R-03 remains open.
- `docs/IMPLEMENTATION_STATUS.md`: this handoff. These **seven files** are the task's changes; generated `next-env.d.ts` restored.
- Environment assertion: stdin script via `node --env-file=.env.local --env-file=.env.migration.local --input-type=module` **PASS**: both DB destinations exactly `127.0.0.1:55432/gym_crm_synthetic`. Initial `-e` invocation failed from PowerShell quoting before any database operation; stdin retry fixed it.
- `node --env-file=.env.local --env-file=.env.migration.local --import tsx --test --test-concurrency=1 tests/business.test.ts` **PASS 17/17**; `npm.cmd test` **PASS 34/34**, zero skips. Existing Better Auth shared-IP and pg concurrent-query deprecation warnings remain.
- `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build` **PASS**. Build repeated after the member/preview remount-key adjustment and passed.
- `$env:BETTER_AUTH_URL='http://127.0.0.1:3001'; npm.cmd start -- --port 3001` **PASS**; task-owned built server only. Browser command: same origin override plus `$env:AGENT_BROWSER_BIN=(Resolve-Path '.local/browser-tools/agent-browser-win32-x64.exe').Path; npm.cmd run test:browser`. Sandboxed run failed `Browser step 'close' failed`; `./.local/browser-tools/agent-browser-win32-x64.exe doctor --offline --quick` passed diagnostics. Chrome-authorized first run passed R-01 scenarios but failed final reauth at R-03's shared limit; fixture isolation fixed the harness. Rebuilt final run **PASS exit 0**, including cleanup, **15** axe states with zero violations/incomplete checks and 375px no-overflow recovery check. No real collections or external services used.
- Final `npm.cmd run typecheck`, `npm.cmd run lint`, `git diff --check` **PASS**; all seven changed-file diffs reviewed. Task-owned port-3001 server stopped with Ctrl+C (expected process exit 1); existing port-3000 listener untouched. No remaining R-01 check blocker. Recovery is browser-tab scoped; closing/clearing that tab's storage and cross-device coordination are outside this increment's verification.

## Prior RR-00 audit evidence (2026-10-24; historical, before R-01 fix)

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
| Z-03 params/query/storage/config | TODO (partial storage coverage) | R-01 cash recovery storage now uses a strict browser-safe Zod schema; broader dynamic query/config boundaries remain open. Config-before-use remains R-07. No speculative import/provider schemas: those workflows do not exist. |
| Z-04 integrated validation review | TODO | Full VAL-01–06 acceptance remains unverified; member integration alone does not close it. |

Prior S-01/Z-02 evidence is retained in repository history; this ledger replaces stale transient narratives with fresh results. Current checks do not prove hosted Neon transaction pooling, restore RPO/RTO, live email or S-03–S-07 acceptance.

## Gates and reproducible manual checks

Open: O-01 rounding/expiry wording; extra queued renewals and cross-date historical/digital rules; O-02/06 outage/custody; O-03 refund terms; O-04 named verifiers; O-05 claim evidence; closing cutoff/float/late adjustments; O-08 legacy sign-off; O-09 pilot evidence; live privacy/retention, ownership/recovery SOPs and operational coverage. **O-07 remains resolved**: PHP 800/30 days, PHP 2,100/90 days, PHP 4,000/180 days. No unresolved rule was guessed.

Synthetic reproduction prerequisites: isolated DB and built app, individual authorized owner, initialized approved plans and new synthetic member.

1. Active synthetic member: prepare an early renewal. Proposed start must equal current paid expiry; after exact full-cash confirmation, receipt/history endpoints must equal both reviewed endpoints. Existing paid time remains unchanged.
2. Expired synthetic member: prepare a late renewal. Start must be 00:00 PHT on today's verified collection date, not old expiry. Confirm the exact amount; stored duration remains the approved fixed elapsed days.
3. Member with a queued paid term: select **Prepare charge preview**. Expect the future-paid-period error and no new preview/payment; an older competing preview must also fail confirmation.
4. Two tabs, no queued term: prepare both reviews before confirming either. Confirm one simulated collection in the first tab. The other confirmation must reject changed dates (join) or a queued term (early renewal), with no second payment. Prepare/review a fresh charge only if the sale is still allowed. Browser regression verifies focus and stale-form removal.
5. Late review spanning PHT midnight: prepare before midnight and submit after midnight. Expect 409/no new payment; fresh preview must start at the new date's midnight. Unchanged early-renewal dates remain valid across midnight. Reproduce without changing the machine clock using the focused `tests/business.test.ts` command above. Original committed same-key retries still retrieve their original result after rollover or queue changes; never simulate another collection for recovery.

**Next / checkpoint:** R-02 verified locally; paused for user review/GitHub checkpoint. R-03 is the next ordered audit repair only after the user resumes. R-09 needs the explicit narrow architecture decision described above; all other unresolved audit/release gates remain. No next task started.
