# Gym CRM — Implementation Status

**Reviewed:** 2026-10-24 (Asia/Manila) · **Scope:** S-01 only · **Data:** synthetic only
**Execution:** PAUSED for the user's GitHub checkpoint after S-01c. User requested a pause after every resolved task.
**Next on explicit resume:** S-01d — Approved catalogue, owner pricing and immutable charge snapshots. Do not start automatically.

| Task | State | Evidence / next action |
|---|---|---|
| S-01a — Identity & controlled setup | VERIFIED | Actual PostgreSQL/Better Auth lifecycle, HTTP denials, browser owner/staff flows and axe checks pass. |
| S-01b — Capabilities & tenant enforcement | VERIFIED | FORCE RLS with restricted role; narrow auth exceptions; cross-gym references/context/pool/revocation tests and browser grants/denials pass. |
| S-01c — Member directory | VERIFIED | Name-only create/search, stable IDs, explicit duplicate review, concurrent create and direct authorization/tenant checks; browser and axe pass. |
| S-01d — Approved plan & exact charge | TODO | O-07 resolved: Monthly ₱800/30 days, 3 Months ₱2,100/90 days, 6 Months ₱4,000/180 days. Implement approved catalogue and snapshots. |
| S-01e — Atomic full-cash confirmation | TODO | Requires RLS, approved charge, concurrency/idempotency/immutability evidence. |
| S-01f — Receipt & history | TODO | Requires confirmed records. |
| S-01g — Eligibility & demonstration | TODO | Requires full S-01 acceptance suite. |

## Latest evidence

- Baseline: clean `main`, documentation-only commit `8522fd9`. All S-01a–c changes remain **uncommitted/unpushed** in one working tree. Added configs/dependencies, `prisma/`, `src/`, `scripts/`, `tests/`, env example and ignore rules. Policy documents changed only for explicit O-07 approval; AGENTS also records per-task pauses.
- Versions: Node 24.21.0; npm 11.19.0; Next 16.4.3; React 19.3.1; TypeScript 5.9.3; Prisma/client/pg adapter 7.10.1; Better Auth/adapter 1.7.12; PostgreSQL 18.4; browser CLI 0.39.2. Lockfile pins dependencies. ESLint 9.39.5 fits Next plugins' peer range but warns it is out of support; reevaluate when plugins support v10. Installation audit: zero vulnerabilities.
- `npm run db:local` PASS after Windows sandbox escalation; isolated `55432` cluster, non-superuser/non-BYPASSRLS runtime, separate migrator. `npm run db:generate`, `npm run db:migrate` PASS; four migrations applied: identity, tenant security, preserved UTC instants, members.
- Final `npm test` PASS **21/21** on actual PostgreSQL: generated auth schema/username compatibility; signup denial; pending bootstrap/exactly one owner; 48h setup/30m reset; concurrent single use; rotation/failure/expiry; role-specific login; five-minute reauth; seven-day rolling/24h renewal; revocation/logout; RLS/pool/foreign-key/capability checks; member create/search/duplicates/concurrency and direct endpoint denial/revocation. No mocked DB substitutes.
- Final `npm run test:browser` PASS: actual HTTP denials; owner/staff setup/login, invite/reauth/reset/disable, owner capability grant/revoke, member create/same-name review/detail, no confirmed-membership state. Login/setup/owner/staff/member axe WCAG A/AA: zero violations/incomplete checks. Keyboard skip link and 375px overflow PASS. Private screenshots remain ignored.
- `npm run typecheck`, `npm run lint`, `npm run build`, `git diff --check` PASS. Private bootstrap CLI smoke PASS with `owner-cli-smoke@example.test`, fixture `2bf998ef-feca-42d5-bd14-ecf93fe8742f`. Tokens/passwords not logged; captures ignored.
- Fixed verification failures: shared throttle test buckets; setup hash navigation; UTC driver behavior; Prisma void-return advisory locks (`$executeRaw`); base anchor CSS overriding link-button contrast (moved base styles into Tailwind's base layer).

## Limits / gates

- RLS FORCE on gyms/operators/invitations/audit/members; runtime cannot insert gyms or edit/delete members/audit. Narrow read-only SECURITY DEFINER auth/setup functions have fixed search paths and revoked public execution. One physical connection tested across ten concurrent tenant transactions plus rollback. Capability changes rechecked under a gym lock in the same transaction.
- RLS caught a UTC issue: PostgreSQL's local timezone and pinned Prisma driver interpreted offset-free date parameters incorrectly. All persisted instants now use `timestamptz(3)` and every Prisma pool starts in UTC. Preserving migration applied; actual database/application instant comparison and all 30-minute resets pass.
- Built local Next server `127.0.0.1:3000` restarted with runtime credentials only; migration secrets stay in ignored `.env.migration.local`. No deployment/domain/Brevo/live users/production secrets.
- No production proxy/IP contract: Better Auth reports a shared per-path throttle bucket. Durable shared local limits protect synthetic mode; production IP/resend and ownership/recovery/privacy/hosting/backup SOPs remain open.
- O-07 resolved by user this session; PROJECT/product/architecture/design/AGENTS aligned to approved 30/90/180-day plans. Live-readiness gates remain; no real sales authorized. RPO/RTO unproven. Do not start S-02.

**Manual checkpoint:** Follow README setup and identity steps; open Members, create a synthetic name, repeat it and review the duplicate warning, explicitly create a separate person, then open the stable member record. It must show no confirmed membership. Revoke staff member capability and repeat `/api/members`: expect denial with the same cookie.

**Next:** S-01d only after the user resumes. S-01d–g have no implementation yet; no cash engine, receipts or paid eligibility claim. Git commits/pushes remain the user's action unless explicitly requested.
