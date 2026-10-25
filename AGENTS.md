# Gym CRM — Coding Agent Contract (`AGENTS.md`)

**Updated:** 2026-10-26 (Asia/Manila)
**Mode:** Small verified increments; **pause after each resolved engineering task for the user's GitHub checkpoint** (user update, 2026-10-24). Continue within the current task only.
**Historical starting milestone:** S-01 / S-01a. **Current handoff:** S-01-S-03, supported S-04, S-05 and S-06 have recorded local synthetic verification. S-06 is stopped for the user's GitHub checkpoint; S-07 and live/pilot readiness remain unverified. Read `docs/IMPLEMENTATION_STATUS.md` for exact evidence and limits. **Data:** synthetic only.
**Reality check:** The earlier report of S-01-S-07 completion was not acceptance evidence. Current source and recorded checks support only the implemented scope in the ledger. Deployment, domain, email sender and live readiness require separate evidence.

> Objective: build the **smallest correct, demonstrable increment**, test it, record evidence, then advance safely. Never trade away financial integrity, security, accessibility or acceptance criteria to reduce code or tokens.

## 1. Authority and startup (read selectively)

Source order and purpose:

1. `docs/PROJECT.md`: **controlling** MVP behavior, FR/AC acceptance, S-01–S-07 and §9 decisions/gates.
2. `docs/product.md`: business rationale/approved BR policies; align after approved policy changes.
3. `docs/architecture.md`: AD-001-AD-033, integrations, tenant/financial contracts; distinguish approved/proposed/open.
4. `docs/design.md`: proposed UX, route labels, accessibility, state/confirmation patterns.
5. `docs/IMPLEMENTATION_STATUS.md`: **current implementation state**, next increment, actual check evidence and blockers—not a policy authority.
6. This `AGENTS.md`: implementation process and stop rules. Historical handoffs are context only.

On session start, inspect `git status`, the local package scripts/dependencies, `docs/IMPLEMENTATION_STATUS.md`, and **only the sections relevant to the next task**. Search for headings/IDs before reading large documents. Never invent missing source code, dependency versions, commands, CI, migrations or cloud resources. Preserve uncommitted human changes; do not override without resolving the conflict.

**Conflict rule:** If any docs contradict each other, identify exact references and stop **only the affected operation**. `docs/PROJECT.md` governs current delivery behavior; do not silently rewrite an approved business policy or architecture decision. Non-policy, reversible code choices may be made minimally and recorded.

## 2. Required skills and response budget

Use the installed skill's real instructions when available. **Do not pretend an uninstalled skill was invoked.** These fallback rules apply even when a skill is unavailable.

| Skill | Use | Rules |
|---|---|---|
| **Ponytail** (`DietrichGebert/ponytail`) | Every coding, refactor and review increment; prefer default/**full**, not ultra | Understand the touched flow; reuse existing code/browser/framework primitives; use the smallest readable solution; no speculative layers, wrappers, generalized engines, caches, packages, premature microservices or unrelated cleanup. Never cut tests, validation, auth, accessibility, audit or error handling. |
| **Caveman** (`JuliusBrussee/caveman`) | Routine updates, plans, reports; **standard**, not ultra | Answer first, short precise sentences, no narration or repeated context. **Never shorten code, paths, commands, error evidence, security warnings, critical conditions or manual test steps until ambiguous.** Its plain skill reduces reply verbosity; a separate proxy is not required or implicitly enabled. |
| **UI/UX Pro Max** | New/changed screens, UX flows and visual choices | Consult for usable layout and interaction; design decisions remain subordinate to `docs/design.md` and approved business behavior. No visual redesign of backend-only tasks. |
| **shadcn/ui** | Implementing frontend components | Prefer existing project-configured primitives and accessible patterns; only add components actually required. Do not install a broad component catalog or duplicate component libraries. |

**Default simplification ladder:** (1) existing code, (2) built-in browser/Next.js/TypeScript feature, (3) existing installed dependency, (4) one small local helper, (5) a **justified** new dependency. Prefer explicit straightforward code over clever one-liners. For auth, use verified Better Auth behavior instead of custom crypto/session machinery. Use Prisma where appropriate; reviewed parameterized PostgreSQL SQL only where its constraints require it.

**Token discipline:**

- Avoid reprinting whole documents, full files, massive tool output, or extensive diffs. Read targeted portions. For failed commands show the exact relevant error; summarize passing output with command + result.
- Do not generate long speculative plans, multiple approaches or repeated progress chatter. One short task plan, then execute.
- Batch related file inspection and checks where safe. Do not run a full test suite after every keystroke; run focused checks during editing, required checks at the increment boundary.
- Do not build extra reporting scripts, caches, agents, orchestration or tracking systems merely to save tokens. Update the compact status file instead.
- Short replies are **not** evidence of reduced total API costs. Prioritize fewer unnecessary steps and smaller correct implementations.

## 3. Continuous implementation loop (foreground execution only)

**Business scope:** Work only within the latest user-authorized task. S-01 is closed for local acceptance; S-02, S-03, supported S-04, S-05 and S-06 were subsequently authorized and locally verified. The continuous-work exception applied only within the authorized S-06 task, now complete; it does not authorize S-07, live onboarding, production changes or background work. Preserve task-boundary GitHub checkpoints unless the user explicitly overrides them for the current task.

For each engineering task, subdivide **only as needed** into the smallest coherent, end-to-end increments. Do not split work into artificial UI-only/backend-only phases. Repeat:

1. **Resume** — read `docs/IMPLEMENTATION_STATUS.md`, inspect git diff/state and relevant files, confirm what really exists; recheck prior failures.
2. **Scope** — state one observable outcome, affected FR/AC/AD/UX IDs, permitted files, necessary negative cases and open gates in **2–5 short lines**. Follow the seven tasks in `docs/PROJECT.md` §8.
3. **Implement** — smallest correct code + schema/migration when needed + focused tests. Reuse patterns. No future-slice features or speculative settings.
4. **Verify** — run relevant static/unit/integration/E2E checks available in the actual repository, including negative and authorization cases. Investigate failures, fix root cause, rerun. Never manufacture PASS or substitute mocked tests for required production-like DB/RLS tests.
5. **Review** — inspect diff for scope, complexity, unintended behavior, secrets, cross-tenant access, concurrency and backward compatibility. Remove unneeded code. Review UX states where touched.
6. **Record** — update `docs/IMPLEMENTATION_STATUS.md` with task status, changed paths, **actual** commands/results, FR/AC evidence, blockers and next task. Keep it concise; replace old transient narrative instead of appending logs.
7. **Continue within the current task** while checks pass and dependencies are safe. **Pause at every verified or blocked engineering task** for the user's GitHub checkpoint. Do not start another engineering task or milestone until the user resumes or explicitly authorizes that scope. Git commits/pushes still require explicit instructions.

**On a session/context boundary:** leave a truthful status file and clear next action. A future agent can pick up. Do not promise to work after the session ends. Multiple agents may review in parallel, but **one writer owns a given branch/schema/migration** at a time; don't let concurrent agents edit the same files or run conflicting migrations.

**Historical S-01 completion gate (closed locally; retain as a regression contract):** demonstrate join → full cash → durable receipt → current eligibility with synthetic data; verify acceptance criteria and negative cases, then **STOP for milestone review/approval**. Do not automatically start S-02 merely because some tests pass. Full business milestones S-01–S-07 retain `docs/PROJECT.md`'s names/order.

## 4. Quality gates before moving forward

Required at the relevant slice, not all upfront:

- **Every increment:** correct user-visible behavior, validated untrusted input, server-enforced permissions, reproducible positive/negative tests, no secrets or unsafe errors, no unrelated changes. Check TypeScript/lint/tests as configured; record exact commands and skipped checks.
- **S-01a (identity):** individual owner email and staff username login; controlled private verified owner bootstrap; no public owner/staff signup; verified-email staff invitations, owner-initiated staff reset; 48h single-use invite / 30m single-use reset; 7-day rolling/24h session renewal; 5-minute owner reauth for sensitive operations; database-backed session revocation; pending/disabled denial; local/test email capture. Verify Better Auth Prisma/username compatibility. Never send live Brevo mail in synthetic development.
- **S-01b (tenant/capabilities):** direct endpoint deny tests, least privilege and a **real restricted PostgreSQL runtime role + RLS** tested under transaction-local gym context, including missing context, cross-tenant references and pooled connections.
- **S-01c–d (members/plans):** tenant-safe create/search, minimum validated fields, owner-controlled **approved** plan prices/durations, historical price snapshot; block unsupported sales when O-07 not approved.
- **S-01e–f (money/history):** full verified cash only; amounts in **integer PHP centavos**; atomic payment + immutable original period + current entitlement + receipt/reference + audit; tenant-scoped idempotency key/fingerprint, member lock, PostgreSQL exclusion constraint; rollback, concurrent submit, same-key lost-response retry, direct unauthorized calls and historical immutability tests.
- **S-01g (eligibility):** fixed plan-duration paid periods `[start,end)`; O-07 user approval on 2026-10-24 sets Monthly ₱800/30 days, 3 Months ₱2,100/90 days, 6 Months ₱4,000/180 days, each day exactly 24 hours. New/late verified terms start **00:00 Asia/Manila on the verified collection date**; early paid terms begin at previous term end; store instants in UTC; a scheduled paid future period is not currently eligible, and no pre-verification admission is implied. Test exact end, leap year and month-end. Pending/unverified payment grants no normal access.
- **Beyond S-01 (implemented/future contracts; see ledger for state):** digital receipt of **actual funds** verified by designated account viewers; owner-only confirmed-finance alterations; append-preserving corrections with explicit access outcomes; full-cash numbered paper outage receipt grants **one visit only**; daily closing preserves unresolved differences; reviewed legacy imports and defensible pilot evidence.

Use available test tools, not imaginary scripts. Missing critical test infrastructure means **NOT VERIFIED**, not PASS. Block advancement into work that depends on an unverified security/financial invariant. A narrow independent task may still continue if safely isolated.

## 5. Non-negotiable trust and business boundaries

- Product roles: **Owner** and **Staff**; each authenticated identity belongs to **one gym**; capabilities are not extra business roles; **platform admin is separate**. Real first-owner activation requires independently verified gym ownership; private audited pending-gym invite; exactly one active primary owner. Staff owner-invited; password chosen privately. No fake emails, shared credentials, self-promotion or unreviewed admin seed.
- Gym-scoped records: `gym_id`, server-resolved actor/gym, capability check at action time, tenant-consistent foreign keys, PostgreSQL RLS (`USING` and `WITH CHECK`), non-bypass runtime DB role, **transaction-local** tenant setting and same Prisma transaction client. Never trust client gym IDs, UI hiding or session-level `SET` with pooled connections.
- Finance: reject partial, screenshot-only, unverified or pending settlement as confirmed membership. No installments/receivables, fabricated sales plans, discounts, store credits, unapproved refunds or extra future renewals. The October 25, 2026 narrow full duplicate-excess refund and zero-movement corrections follow PROJECT.md FR-08; discretionary cancellation refunds remain gated. Original confirmed transactions/paid periods remain auditably preserved; only owner approves corrections/refunds, with explicit real-funds and entitlement outcome. Cash outage provisional access and its later reconciliation are different states.
- Scope: **no** member portal, class/PT booking, marketing CRM, payment gateway/POS, biometric entry, offline digital sync, large analytics suite, multi-branch admin or complex general ledger unless explicitly approved.
- Infrastructure: Next.js + TypeScript, stable **pinned Prisma 7** + PostgreSQL, self-hosted Better Auth (Prisma adapter/username), Vercel `sin1`, Neon `aws-ap-southeast-1`, Brevo **later**. Exact Node/package patches must be verified and pinned at setup; do not mix Prisma 8 APIs. No domain owned; use local/synthetic email until a domain/sender is acquired, authenticated and tested. Separate dev/staging/prod and runtime/migration credentials. Recovery target RPO ≤1h/RTO ≤4h is **unproven**.
- Logging/privacy: no raw password, invitation/reset token, cookies, bank credentials, API keys, DB URLs, real member records or sensitive ownership evidence in logs. No real customer data without privacy/retention and operations gates.

## 6. Stop, escalate and resume rules

**STOP the affected operation** and report a precise decision needed when:

1. `docs/PROJECT.md` §9 has an unresolved required policy (e.g. repeat-outage/lost-receipt procedures, ambiguous historical cash dates/prices, discretionary cancellation terms, evidence/receipt custody, closing cutoff) or documents conflict.
2. A change would alter an approved AD/BR/FR/AC, introduce major dependencies/infrastructure complexity or change scope without authorization.
3. You would create live users, use real personal/payment data, activate live Brevo, buy/enable paid services, change production secrets, access live bank accounts, run destructive migrations, push/deploy to production or modify external services without explicit approval.
4. Critical checks fail and cannot be repaired safely; verified RLS, auth, idempotency or atomic money invariants are missing; the repository has conflicting unexplained edits.
5. A security vulnerability, credential leak or irreversible data-loss risk requires owner choice. Describe impact and safer path, not a silent workaround.

**Continue only independent safe work** where permitted; update status with `BLOCKED` and owner decision. Do not repeatedly ask already-answered questions. Do not mark a task or milestone finished on UI screenshots alone.

## 7. Status file and compact reporting

Maintain `docs/IMPLEMENTATION_STATUS.md` as the resumable single-page ledger. Each task has `TODO / IN_PROGRESS / VERIFIED / BLOCKED`, concrete evidence and next action; update it **after** verification, not as a claim of progress. Record a known baseline failure separately from a new regression. No huge terminal logs or chat transcript dumps.

After each finished or blocked increment, communicate briefly:

```text
[S-01x] VERIFIED | PARTIAL | BLOCKED — what now works
Changed: path — short reason (FR/AC/AD link)
Checks: exact command → PASS/FAIL/NOT RUN (cause)
Manual: prerequisites → 2–5 repeatable steps + expected result, including a negative case
Risk/gate: none | precise outstanding issue
Next: smallest safe task; paused for user GitHub checkpoint before starting it
```

For schema, auth, financial, destructive or security changes, include enough extra explanation for a human to reproduce/check safely. Never say “done” without evidence, falsely assert a test ran, or promise asynchronous completion. Git commits/pushes are not implied by auto-continue; follow the user's repository permissions and normal review practice.

## 8. One reusable kickoff instruction

Historical S-01 kickoff, retained for reference. Do not use to restart completed work; use the current handoff in §9 instead:

```text
Resume our Gym CRM. Follow AGENTS.md and docs/IMPLEMENTATION_STATUS.md.
CONTINUE_SCOPE=S-01; PAUSE_AT_TASK_BOUNDARY=true: resume the next unverified
task with synthetic data only, then pause for my GitHub checkpoint. Activate Ponytail for
simple correct code and Caveman for concise communication if installed.
For touched frontend work use UI/UX Pro Max and shadcn/ui if installed.
Read only relevant docs/PROJECT.md FR/AC/§9, docs/architecture.md ADs and docs/design.md UX.
Inspect repo and existing changes; use exact installed scripts/versions.
For each increment: implement → run focused tests → fix → review diff →
update docs/IMPLEMENTATION_STATUS.md → continue within the current task if safe.
At the task boundary, stop before starting the next task until I resume.
Never guess an open policy or bypass a security/financial test. Stop at a real
blocker or the S-01 milestone review. Explain final changes, check results,
manual synthetic tests, and any missing verification. Do not claim background
execution after this session ends.
```

## 9. Validation and current implementation handoff (reviewed 2026-10-25)

The earlier S-01-S-07 completion report and Zod-documentation-only handoff are historical. S-01-S-03, supported S-04, S-05 and S-06 now have source/migration/test evidence in the ledger, including supported S-04 closing integration. Zod is pinned at 4.6.7 with boundary-specific coverage. This does not certify unsupported corrections/refunds, S-07, physical operating rehearsal or live/pilot readiness. Resume only the latest explicitly authorized task and preserve its GitHub checkpoint.

For application validation, follow architecture.md AD-033/§17 and PROJECT.md VAL-01–VAL-06:

- Inspect installed Zod, current schemas, request adapters, environment access and tests first. Reuse existing conventions and pin compatible dependency versions; no speculative validation framework or unrelated refactor.
- Validate application-owned untrusted input on the server and consume only parsed, allowlisted values. Reuse browser-safe schemas for forms; keep environment/secrets/database imports server-only. Use inferred types rather than manually duplicating schema types.
- Preserve exact centavo conversion, timezone rules, Better Auth ownership, current endpoint contracts and idempotency semantics. Never trust client gym/actor/capabilities or replace transaction checks, RLS, constraints or locks with Zod.
- Map failures to safe field/form errors. Never log raw credentials, tokens, configuration values, DB URLs or raw parse errors containing sensitive input. Preserve auth enumeration protections.
- Migrate one workflow per task, add meaningful boundary/negative tests and rerun relevant existing integrity checks. Do not extend the existing Zod/workflow verification claims to another boundary or milestone without source and executable evidence. Track the inventory, next task and exact results in docs/IMPLEMENTATION_STATUS.md.
