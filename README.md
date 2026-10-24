# Gym CRM

Local synthetic development only. Requires Node **24.21.0**, npm **11.19.0**, PostgreSQL **18** tools on PATH.

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
2. Privately open the matching capture in `.local/mailbox`, open its `url`, and choose a 12–128-character password. Sign in at `http://127.0.0.1:3000/login` in Owner mode.
3. Verify the owner password, invite `staff@example.test` with an individual username, and complete that recipient's capture. Staff choose their password and sign in in Staff mode.
4. From the owner screen, request reset or disable staff. Reused/replaced/expired/failed-delivery links fail. Disabled staff cookies, login, and outstanding links fail. Public `/api/auth/sign-up/email` returns 404.

Setup links last 48 hours; reset links last 30 minutes; both are single-use. Captured files contain synthetic bearer links: no HTTP viewer, no general logging, no live email. Do not share these files. Shared durable throttle buckets are intentional for local mode; live proxy/IP/resend policy remains gated.

Member check: as owner, open **Find or create a member**, create a synthetic name, and repeat it. Review the warning and matches before confirming a separate same-name person. Open its stable reference: creating a member must show **No confirmed membership**. Staff need an explicit **Manage members** grant; revoking it denies their next member request with the same cookie.

S-01d manual check (synthetic owner/member from the steps above):

1. Open **Plans and pricing**, verify the owner password, and select **Apply approved catalogue**. Expect Monthly ₱800/30 days, 3 Months ₱2,100/90 days, and 6 Months ₱4,000/180 days. Initialization never overwrites a later owner-edited price.
2. Open a member, select a plan, and choose **Prepare charge preview**. Expect the full PHP amount, member, fixed duration, cash method, preparer, and proposed inclusive-start/exclusive-end dates in PHT. Reload the URL: the same saved preview must remain.
3. Change Monthly to a synthetic test price such as ₱900.25, then reopen the old preview. Its ₱800 terms must remain, with a catalogue-change notice. A new preview must use ₱900.25. Staff pricing calls, unsupported durations/discounts, and prices with more than two decimal places must fail.
4. Staff need both **Manage members** and **Confirm full cash** to prepare a preview. Revoke either and retry with the same session: expect denial. A preview must still show **Payment not recorded** and **No confirmed membership**.

Prices are stored as integer centavos. The input range is ₱0.01–₱21,474,836.47 (PostgreSQL integer capacity). The owner uses a current plan version when saving; concurrent stale updates receive a conflict. Tenant RLS, composite references, restricted column grants and an immutable-snapshot trigger enforce storage boundaries. Saved previews are proposals, not paid promises. Actual confirmed-payment/receipt/period preservation will be tested in S-01e–f.

Development pauses after each resolved S-01 task for the user's GitHub checkpoint. S-01a–d are verified; S-01e requires explicit approval. S-01a–c were committed at `17a611e`; current S-01d changes remain uncommitted. No payment, receipt or paid eligibility workflow is implemented yet.

Checks: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. Database tests use the real restricted runtime role; migration credentials create fixtures/control timestamps. Provider-generated auth schema is compared with actual columns.

Browser acceptance requires **agent-browser 0.39.2**, a running local server, and a dedicated session:

```powershell
$env:AGENT_BROWSER_BIN = "C:/path/to/agent-browser-win32-x64.exe"
$env:AGENT_BROWSER_EXECUTABLE_PATH = "C:/Program Files/Google/Chrome/Application/chrome.exe"
npm run test:browser
```

It verifies actual HTTP denials, owner/staff setup/login, invitation, reauthentication, reset/disable, replay rejection, approved pricing, durable charge previews, historical price preservation, mobile overflow, keyboard entry and axe WCAG A/AA checks. Synthetic screenshots stay under `.local`. Run browser/database checks sequentially: both reset synthetic rate buckets. Automated checks do not establish full WCAG certification.

Auth behavior was checked against installed source and [Prisma adapter](https://better-auth.com/docs/adapters/prisma), [username](https://better-auth.com/docs/plugins/username), and [session](https://better-auth.com/docs/concepts/session-management) documentation. See `IMPLEMENTATION_STATUS.md` for current evidence/gates. No production, Brevo, domain, live identity, or real member data is configured.
