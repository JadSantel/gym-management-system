# Gym CRM — Implementation Status

**Reviewed:** 2026-10-24 (Asia/Manila) · **Scope:** S-01 only · **Data:** synthetic only
**Execution:** PAUSED after verified S-01d for the user's GitHub checkpoint. **S-01e requires explicit user approval.**
**Current outcome:** Approved catalogue, owner pricing and immutable charge previews; PostgreSQL/static/build/browser checks pass.

| Task | State | Evidence / next action |
|---|---|---|
| S-01a — Identity & controlled setup | VERIFIED | Actual PostgreSQL/Better Auth lifecycle, HTTP denials, browser owner/staff flows and axe checks pass. |
| S-01b — Capabilities & tenant enforcement | VERIFIED | FORCE RLS with restricted role; narrow auth exceptions; cross-gym references/context/pool/revocation tests and browser grants/denials pass. |
| S-01c — Member directory | VERIFIED | Name-only create/search, stable IDs, explicit duplicate review, concurrent create and direct authorization/tenant checks; browser and axe pass. |
| S-01d — Approved plan & exact charge | VERIFIED | Approved 30/90/180-day catalogue, owner price changes, exact integer-centavo previews, immutable snapshots; PostgreSQL and browser acceptance pass. |
| S-01e — Atomic full-cash confirmation | TODO | Requires RLS, approved charge, concurrency/idempotency/immutability evidence. |
| S-01f — Receipt & history | TODO | Requires confirmed records. |
| S-01g — Eligibility & demonstration | TODO | Requires full S-01 acceptance suite. |

## Latest evidence

- S-01d baseline: clean working tree at `17a611e` (`feat: add operator auth, tenant isolation, and member directory`). Earlier S-01a–c work is committed. Only current S-01d changes remain uncommitted; no commit/push performed by agent.
- Versions: Node 24.21.0; npm 11.19.0; Next 16.4.3; React 19.3.1; TypeScript 5.9.3; Prisma/client/pg adapter 7.10.1; Better Auth/adapter 1.7.12; PostgreSQL 18.4; browser CLI 0.39.2. Lockfile pins dependencies. ESLint 9.39.5 fits Next plugins' peer range but warns it is out of support; reevaluate when plugins support v10. Installation audit: zero vulnerabilities.
- `npm run db:generate`, `npm run db:migrate` PASS; fifth additive migration `202610240005_plans_charges` applied only to isolated synthetic `55432`. New plans/charge tables FORCE RLS with tenant-consistent member/plan/preparer references, column-limited price updates and immutable snapshot UPDATE/DELETE trigger.
- Final `npm test` PASS **27/27** on actual PostgreSQL. Prior auth/RLS/member checks still pass. S-01d adds exact decimal parsing, fixed 30/90/180-day proposed intervals, approved-only/idempotent catalogue setup, fresh owner checks, concurrent version conflict, staff/direct-endpoint denial, immediate capability revocation, cross-tenant/missing-context denial, price tampering rejection and preserved snapshots after catalogue edits. No mocked DB substitutes.
- Final `npm run test:browser` PASS: prior auth/member journeys plus owner catalogue setup/reauth, invalid precision, staff pricing denial, saved preview reload, old ₱800 preview preserved after a synthetic ₱900.25 price edit, new preview at current price. Login/setup/pricing/owner/staff/member/charge axe WCAG A/AA: zero violations/incomplete checks. Keyboard and 375px overflow PASS. `.local/charge-review-mobile.png` inspected; captures/screenshots remain ignored.
- `npm run typecheck`, `npm run lint`, `npm run build`, `git diff --check` PASS for S-01d. Earlier S-01a bootstrap CLI smoke evidence retained; not rerun in S-01d. Tokens/passwords not logged; captures ignored.
- S-01d paths: `prisma/schema.prisma`, new migration; `src/lib/{plans,charges,money}.ts`; `/api/plans`, `/api/charges`, `/plans`; pricing/preview components and member/overview pages; reused owner guard/input helpers; `tests/business.test.ts`, browser script, README and this ledger. No dependencies added. React/UI review reused current shadcn primitives and semantic styling.
- `next-env.d.ts` also contains framework-regenerated development type paths; retained as generated output for review.
- Fixed verification failures: shared throttle test buckets; setup hash navigation; UTC driver behavior; Prisma void-return advisory locks (`$executeRaw`); base anchor CSS overriding link-button contrast (moved base styles into Tailwind's base layer).

## Limits / gates

- RLS FORCE on gyms/operators/invitations/audit/members/plans/charge snapshots. Runtime cannot edit/delete member/audit/snapshot records; privileged direct snapshot edits also fail the trigger. Narrow auth/setup functions remain unchanged. Tenant/capability checks run under the same scoped Prisma transaction and gym lock.
- RLS caught a UTC issue: PostgreSQL's local timezone and pinned Prisma driver interpreted offset-free date parameters incorrectly. All persisted instants now use `timestamptz(3)` and every Prisma pool starts in UTC. Preserving migration applied; actual database/application instant comparison and all 30-minute resets pass.
- Built local Next server `127.0.0.1:3000` restarted with runtime credentials only; migration secrets stay in ignored `.env.migration.local`. No deployment/domain/Brevo/live users/production secrets.
- No production proxy/IP contract: Better Auth reports a shared per-path throttle bucket. Durable shared local limits protect synthetic mode; production IP/resend and ownership/recovery/privacy/hosting/backup SOPs remain open.
- Non-failing test warning: pinned `pg` 8 reports deprecated concurrent query scheduling in Prisma relation reads (future pg 9 behavior). No dependency upgrade performed; all assertions pass.
- O-07 resolved by user this session; PROJECT/product/architecture/design/AGENTS aligned to approved 30/90/180-day plans. Live-readiness gates remain; no real sales authorized. RPO/RTO unproven. Do not start S-02.

**Manual checkpoint:** Follow README S-01d steps: owner reauth → apply approved catalogue → prepare/reload a member preview → edit price → verify original preview unchanged and new preview updated. Staff pricing and revoked-capability preview calls must fail. Preview records no payment/admission.

**Next, only on approval:** S-01e atomic full-cash confirmation. S-01d verifies pre-sale snapshot preservation; AC-02b's confirmed payment/receipt/paid-period preservation still requires S-01e–f. Revalidate reviewed charge terms and collection-date context before any future confirmation. No cash engine, receipts or paid eligibility implemented. Current changes uncommitted/unpushed.
