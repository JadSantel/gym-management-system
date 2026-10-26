# Gym CRM

Project documents:

- [MVP requirements and acceptance criteria](docs/PROJECT.md)
- [Product policies and context](docs/product.md)
- [Software architecture](docs/architecture.md)
- [Interface and interaction design](docs/design.md)
- [Implementation status and next task](docs/IMPLEMENTATION_STATUS.md)
- [S-07 approved local legacy/measurement protocol](docs/S07_LOCAL_POLICY_PROPOSAL.md)
- [Pilot measurement worksheet and synthetic calculations](docs/S07_MEASUREMENT_WORKSHEET.md)
- [Owner/staff training, rehearsal and incident procedure](docs/S07_OPERATOR_TRAINING.md)

Local synthetic development only. Requires Node **24.21.0**, npm **11.19.0**, and PostgreSQL **18** tools on PATH.

```powershell
npm ci
npm run db:local
npm run db:generate
npm run db:migrate
npm run dev
```

`db:local` creates an isolated password-protected cluster under ignored `.local/postgres`, listening only on `127.0.0.1:55432`. It never uses the service on 5432. Restricted `gym_runtime` credentials stay in `.env.local`. Migration credentials stay in `.env.migration.local`, explicitly loaded by CLI/tests, never by Next.js. Windows sandboxes may require permission to start PostgreSQL or connect to loopback.

The server validates `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` and `SYNTHETIC_DATA_ONLY` before database/auth initialization. Only the isolated synthetic database and an exact HTTP(S) origin on `127.0.0.1` are enabled. Database URLs require credentials and reject query/fragment overrides. Use an auth secret of at least 32 characters without surrounding whitespace; the example placeholder is rejected. Invalid configuration reports key names only. This does not enable hosted/live operation.

Configuration uses the pinned `server-only` marker. The test, browser and bootstrap npm scripts supply `--conditions=react-server` for Node execution; include that condition when running these TypeScript modules directly. Migration configuration is not part of the four-key web runtime configuration.

To stop without deleting records: `pg_ctl -D .local/postgres -m fast -w stop`.

Manual synthetic identity check:

1. Run `npm run bootstrap:synthetic -- owner@example.test "Synthetic Gym" 42ee5912-3e69-48a8-a9da-b9eef51a6d70`. Use a different stable UUID for each gym. Pending repeats replace the invitation; active repeats fail. This private CLI records synthetic verification, not actual ownership proof.
2. Privately open the matching capture in `.local/mailbox`, open its `url`, and choose a 12-128-character password. Sign in at `http://127.0.0.1:3000/login` in Owner mode.
3. Verify the owner password, invite `staff@example.test` with an individual username, and complete that recipient's capture. Staff choose their password and sign in in Staff mode.
4. From the owner screen, request reset or disable staff. Reused/replaced/expired/failed-delivery links fail. Disabled staff cookies, login, and outstanding links fail. Public `/api/auth/sign-up/email` returns 404.

Setup links last 48 hours; reset links last 30 minutes; both are single-use. Captured files contain synthetic bearer links: no HTTP viewer, no general logging, no live email. Do not share these files. Application mutation limits use verified actor/action buckets; anonymous requests use separate bounded shared action buckets. Setup and owner recovery always use the public bucket. Better Auth ignores forwarding headers and retains its database-backed shared per-path fallback limit. Non-local application APIs and Better Auth operations fail closed until deployment ingress/proxy trust is verified (503 at the trust guard; existing provider limits may return 429 earlier). No caller-supplied IP header is trusted; live proxy/IP/resend policy remains gated.

Member check: as owner, open **Find or create a member**, create a synthetic name, and repeat it. Review the warning and matches before confirming a separate same-name person. Open its stable reference: a member record alone does not establish eligibility. Staff need an explicit **Manage members** grant; revoking it denies their next member request with the same cookie.

S-01d/e manual check (synthetic owner/member from the steps above):

1. Open **Plans and pricing**, verify the owner password, and select **Apply approved catalogue**. Expect Monthly PHP 800/30 days, 3 Months PHP 2,100/90 days, and 6 Months PHP 4,000/180 days. Initialization never overwrites a later owner-edited price.
2. Open a member, select a plan, and choose **Prepare charge preview**. Expect the full PHP amount, member, fixed duration, cash method, preparer, and proposed inclusive-start/exclusive-end dates in PHT. Reload the URL: the same saved preview must remain.
3. Change Monthly to a synthetic test price such as PHP 900.25, then reopen the old preview. Its original terms must remain with a catalogue-change notice. A new preview must use PHP 900.25. Staff pricing calls, unsupported durations/discounts, and prices with more than two decimal places must fail.
4. Count the exact cash first. Submit a short amount; expect rejection and no payment or paid period. Submit the exact full amount; expect one confirmed payment, paid period, entitlement projection, audit event, payment reference and receipt reference. A same-key retry after an unknown response returns those same references.
5. Staff need **Confirm full cash** to confirm a charge. Revoke the capability and retry with the same session: expect denial.

Prices are stored as integer centavos. The input range is PHP 0.01-PHP 21,474,836.47 (PostgreSQL integer capacity). Saved previews are proposals; confirmation records actual paid dates. Tenant RLS, composite references, restricted grants, immutable-history triggers and financial integrity constraints enforce storage boundaries.

**Current local scope (reviewed 2026-10-26):** S-01-S-03, supported S-04 investigations/recovery/correction/refund settlement, S-05 outage recovery, S-06 daily closing and S-07 reviewed legacy access, measurement/training artifacts and synthetic rehearsal have recorded local acceptance. Final S-07 checks passed 154/154 tests, zero skips, typecheck/lint/build, migrations and compiled-app owner/staff browser acceptance. Unsupported correction/refund paths, real training/physical rehearsal, actual pilot operation, baseline validation, measured improvement and live readiness remain unavailable or unverified. See the [implementation ledger](docs/IMPLEMENTATION_STATUS.md) for exact evidence and manual steps. Stop at the completed S-07 GitHub checkpoint; no commit/push/deploy is implied.

Unexpected application JSON API failures return an opaque `errorReference`, also included in the visible error message. Match it to the server's redacted `REQUEST_FAILED` event. These events contain only the reference, fixed event name, allowlisted method/route and HTTP status; no raw error, stack, payload, query, credentials or member data. This covers the application API adapter, not every framework/provider error path or hosted monitoring.

Authenticated application API 401/403 denials record `ACCESS_DENIED <method> <route> <status> <reference>` in the existing append-protected `identity_audit`, in a separate tenant-scoped transaction after the denied business operation rolls back. Initiator/subject identify the verified active actor; client-supplied targets are excluded. Anonymous, revoked and inactive identities have no fabricated attribution. An audit-write failure preserves the denial and records a redacted `DENIAL_AUDIT_FAILED` event with the response reference; it cannot settle an unknown cash outcome. Log retention, alert routing and hosted audit availability remain operational gates.

Checks: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. Database tests use the real restricted runtime role; migration credentials create fixtures/control timestamps. Provider-generated auth schema is compared with actual columns.

Browser acceptance requires **agent-browser 0.39.2**, Chrome, and a running local server. An installed CLI is present under ignored `.local/browser-tools` in this checkout. Set executable paths for your own machine; do not assume another checkout has saved browser settings. For this installed layout, use:

```powershell
$env:AGENT_BROWSER_BIN = (Resolve-Path ".local/browser-tools/agent-browser-win32-x64.exe").Path
$env:AGENT_BROWSER_EXECUTABLE_PATH = "C:/Program Files/Google/Chrome/Application/chrome.exe"
npm.cmd run test:browser
```

For a repeat run, start `npm.cmd run db:local` and `npm.cmd run dev` in one terminal; run `npm.cmd run test:browser` in another. The coding sandbox may need permission to launch isolated headless Chrome; a normal PowerShell session does not use that sandbox.

The browser script covers identity/HTTP denials, pricing, cash joins, renewal, digital verification, supported S-04 investigation/correction/refund settlement, S-05 receipt/custody recovery, S-06 closing/owner acknowledgement/supplements and S-07 staff legacy preparation, fresh owner historical sign-off and pilot source review. Committed response-loss/reload retry, direct staff approval denial, protected-field recovery, historical/uncertain source separation, open-day denial, owner/staff 30/90/180-day journeys, keyboard flow, 375px overflow and axe A/AA checks are included. Screenshots stay ignored under `.local/`. Run browser and database checks sequentially because both reset synthetic rate buckets. These checks establish local synthetic behavior only, not full WCAG certification, real training/physical rehearsal, actual pilot operation, measured improvement or live readiness.

Auth behavior was checked against installed source and [Prisma adapter](https://better-auth.com/docs/adapters/prisma), [username](https://better-auth.com/docs/plugins/username), and [session](https://better-auth.com/docs/concepts/session-management) documentation. See [implementation status](docs/IMPLEMENTATION_STATUS.md) for current evidence/gates. No production, Brevo, domain, live identity, or real member data is configured.

S-05 local synthetic outage procedure and printable forms: [approved SOP](docs/S05_OUTAGE_POLICY_PROPOSAL.md). On `/outage-receipts`, a freshly reauthenticated owner registers physical booklets before use and designates independent verifiers. Preserve the approved booklet price list on paper. An authorized custodian collects full cash and documents at most one original provisional visit; use physical signed counts at every shift even with no app access. After recovery, back-enter claims and handovers; no normal access appears until an independent designated person matches receipt, cash and custody evidence. Collector/entrant self-verification is denied even for an owner. Missing/void/conflicting numbers and cash differences stay open; member and digital receipt history link to the originals. No automatic repeat admission or extra payment is implied.

Local synthetic reproduction: use two active operators with member/cash capabilities. Owner registers a booklet with the staff custodian, and explicitly designates the owner to verify. Disconnect the app; fill one full-cash paper receipt and the first-visit fields, then complete two signed handovers using the SOP forms and retain any void/missing leaves as open items. Reconnect and enter the receipt and both handovers chronologically as staff. Expect pending status and no new normal entitlement. Try self-verification as staff and expect denial. Independently verify as the designated owner, then follow the linked member/digital receipt; expect one confirmed payment, original collection date and the separately preserved visit. Use `tests/outage.test.ts` and `npm.cmd run test:browser` for reproducible D/D+2, full-duration, concurrency, rollback, offline-shift-fixture, loss/retry and authorization checks. The browser uses historical pre-outage registry fixtures for D/D+2; it does not backdate app registration or claim that real people physically signed paper. Live authority/evidence/retention and operating rehearsal remain gates.


S-06 local synthetic closing: [approved SOP and manual checks](docs/S06_CLOSING_POLICY_PROPOSAL.md). On `/closing?day=YYYY-MM-DD`, review an ended Manila day, record independent cash/account actuals with evidence and optional identified-member case links, submit as cash-capable staff, then freshly reauthenticate as owner to acknowledge unresolved differences. Approval preserves signed differences and every outstanding item; it moves no funds. Later original-date recovery/corrections and actual refund settlements link to original history, with an explicit supplemental submission and reviewed/rechecked evidence rather than an overwrite. New or replaced reported actuals cannot be omitted, including unrecorded collectors. Current-day views are previews. All live/pilot gates remain separate.
