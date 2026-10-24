# Gym CRM

Project documents:

- [MVP requirements and acceptance criteria](docs/PROJECT.md)
- [Product policies and context](docs/product.md)
- [Software architecture](docs/architecture.md)
- [Interface and interaction design](docs/design.md)
- [Implementation status and next task](docs/IMPLEMENTATION_STATUS.md)

Local synthetic development only. Requires Node **24.21.0**, npm **11.19.0**, and PostgreSQL **18** tools on PATH.

```powershell
npm ci
npm run db:local
npm run db:generate
npm run db:migrate
npm run dev
```

`db:local` creates an isolated password-protected cluster under ignored `.local/postgres`, listening only on `127.0.0.1:55432`. It never uses the service on 5432. Restricted `gym_runtime` credentials stay in `.env.local`. Migration credentials stay in `.env.migration.local`, explicitly loaded by CLI/tests, never by Next.js. Windows sandboxes may require permission to start PostgreSQL or connect to loopback.

To stop without deleting records: `pg_ctl -D .local/postgres -m fast -w stop`.

Manual synthetic identity check:

1. Run `npm run bootstrap:synthetic -- owner@example.test "Synthetic Gym" 42ee5912-3e69-48a8-a9da-b9eef51a6d70`. Use a different stable UUID for each gym. Pending repeats replace the invitation; active repeats fail. This private CLI records synthetic verification, not actual ownership proof.
2. Privately open the matching capture in `.local/mailbox`, open its `url`, and choose a 12-128-character password. Sign in at `http://127.0.0.1:3000/login` in Owner mode.
3. Verify the owner password, invite `staff@example.test` with an individual username, and complete that recipient's capture. Staff choose their password and sign in in Staff mode.
4. From the owner screen, request reset or disable staff. Reused/replaced/expired/failed-delivery links fail. Disabled staff cookies, login, and outstanding links fail. Public `/api/auth/sign-up/email` returns 404.

Setup links last 48 hours; reset links last 30 minutes; both are single-use. Captured files contain synthetic bearer links: no HTTP viewer, no general logging, no live email. Do not share these files. Shared durable throttle buckets are intentional for local mode; live proxy/IP/resend policy remains gated.

Member check: as owner, open **Find or create a member**, create a synthetic name, and repeat it. Review the warning and matches before confirming a separate same-name person. Open its stable reference: a member record alone does not establish eligibility. Staff need an explicit **Manage members** grant; revoking it denies their next member request with the same cookie.

S-01d/e manual check (synthetic owner/member from the steps above):

1. Open **Plans and pricing**, verify the owner password, and select **Apply approved catalogue**. Expect Monthly PHP 800/30 days, 3 Months PHP 2,100/90 days, and 6 Months PHP 4,000/180 days. Initialization never overwrites a later owner-edited price.
2. Open a member, select a plan, and choose **Prepare charge preview**. Expect the full PHP amount, member, fixed duration, cash method, preparer, and proposed inclusive-start/exclusive-end dates in PHT. Reload the URL: the same saved preview must remain.
3. Change Monthly to a synthetic test price such as PHP 900.25, then reopen the old preview. Its original terms must remain with a catalogue-change notice. A new preview must use PHP 900.25. Staff pricing calls, unsupported durations/discounts, and prices with more than two decimal places must fail.
4. Count the exact cash first. Submit a short amount; expect rejection and no payment or paid period. Submit the exact full amount; expect one confirmed payment, paid period, entitlement projection, audit event, payment reference and receipt reference. A same-key retry after an unknown response returns those same references.
5. Staff need **Confirm full cash** to confirm a charge. Revoke the capability and retry with the same session: expect denial.

Prices are stored as integer centavos. The input range is PHP 0.01-PHP 21,474,836.47 (PostgreSQL integer capacity). Saved previews are proposals; confirmation records actual paid dates. Tenant RLS, composite references, restricted grants, immutable-history triggers and financial integrity constraints enforce storage boundaries.

Development pauses after each resolved S-01 task for the user's GitHub checkpoint. S-01a-e are verified. S-01f starts only after the user reviews the checkpoint and asks to resume. No commit or push was made.

Checks: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. Database tests use the real restricted runtime role; migration credentials create fixtures/control timestamps. Provider-generated auth schema is compared with actual columns.

Browser acceptance requires **agent-browser 0.39.2**, Chrome, and a running local server. This checkout's CLI lives under ignored `.local/browser-tools`; both browser paths are already saved in ignored `.env.local`. To override them in a PowerShell session:

```powershell
$env:AGENT_BROWSER_BIN = (Resolve-Path ".local/browser-tools/agent-browser-win32-x64.exe").Path
$env:AGENT_BROWSER_EXECUTABLE_PATH = "C:/Program Files/Google/Chrome/Application/chrome.exe"
npm.cmd run test:browser
```

For a repeat run, start `npm.cmd run db:local` and `npm.cmd run dev` in one terminal; run `npm.cmd run test:browser` in another. The coding sandbox may need permission to launch isolated headless Chrome; a normal PowerShell session does not use that sandbox.

The browser script covers HTTP denials, owner/staff setup, invitation, reauthentication, reset/disable, approved pricing, saved previews, historical price preservation, short/full cash confirmation, lost-response retry after reload, receipt/period linkage, mobile overflow, keyboard entry and axe WCAG A/AA checks. S-01e browser acceptance passes. Synthetic screenshots stay under `.local`. Run browser/database checks sequentially: both reset synthetic rate buckets. Automated checks do not establish full WCAG certification.

Auth behavior was checked against installed source and [Prisma adapter](https://better-auth.com/docs/adapters/prisma), [username](https://better-auth.com/docs/plugins/username), and [session](https://better-auth.com/docs/concepts/session-management) documentation. See [implementation status](docs/IMPLEMENTATION_STATUS.md) for current evidence/gates. No production, Brevo, domain, live identity, or real member data is configured.
