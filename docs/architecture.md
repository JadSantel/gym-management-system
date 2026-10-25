# Gym CRM — Software Architecture (`architecture.md`)

**Status:** Working architecture, updated 2026-10-24 for approved account-email defaults, controlled first-owner bootstrap, and the user's confirmation that no sending domain is currently owned. Approved choices are distinguished from implementation proposals, vendor subscriptions, and live-pilot gates. No domain purchase, Brevo account provisioning, live email delivery, dependency installation, deployment, or backup validation is asserted.
**Updated:** 2026-10-24 (Asia/Manila)
**Authoritative inputs:** `PROJECT.md` governs MVP requirements/acceptance/implementation gates; `product.md` defines business-policy intent and discovery context. Flag inconsistencies rather than choosing silently. `GYM_CRM_HANDOFF.md` is historical context, not an overriding source.
**Implementation baseline:** Seven business milestones S-01–S-07, with S-01a–S-01g engineering tasks. Scope and accepted membership/payment policy are inherited, not altered here.

## 1. Approved decisions versus open selections

| ID | Topic | Decision / remaining scope | State |
|---|---|---|---|
| AD-001 | Customer tenancy | One shared application serving multiple independent gyms (multi-tenant SaaS) | **APPROVED** |
| AD-002 | Primary stack | Next.js + TypeScript + PostgreSQL | **APPROVED** |
| AD-003 | Hosting model | Managed cloud; vendors selected in AD-020; Singapore regions approved in AD-024; plan/account provisioning remains open | **APPROVED** |
| AD-004 | Logins | Owner: email/password. Staff: username/password, with a genuine verified email for recovery | **APPROVED** |
| AD-005 | Staff provisioning | Gym primary owner exclusively invites/creates staff for that gym; no public staff self-signup | **APPROVED** |
| AD-006 | Staff reset | Owner initiates controlled reset delivered to verified staff email; owner never sees permanent password | **APPROVED** |
| AD-007 | Sensitive actions | Fresh password reauthentication; MFA deferred (remaining risk accepted as a design choice, subject to pilot review) | **APPROVED direction** |
| AD-008 | Operator affiliation | Each operator identity/account belongs to **one** gym; multiple gym jobs require separate accounts | **APPROVED** |
| AD-009 | Tenant enforcement | Server authorization **and** PostgreSQL Row-Level Security (RLS) | **APPROVED** |
| AD-010 | Primary owner | One primary owner per operational gym (replacement/transfer require controlled path) | **APPROVED** |
| AD-011 | ORM | Prisma is primary database access layer; reviewed parameterized SQL permitted for PostgreSQL-specific guarantees | **APPROVED** |
| AD-012 | Financial commands | Atomic DB transaction + uniquely scoped idempotency operation + member locks | **APPROVED** |
| AD-013 | Tenant DB context | Transaction-local gym context using a restricted database runtime role | **APPROVED** |
| AD-014 | Owner recovery | Verified-email self-service reset **plus** audited, independently verified manual platform recovery if normal recovery fails | **APPROVED direction**; evidence/approval SOP OPEN |
| AD-015 | Version policy | Pin exact, verified stable Prisma/dependency versions and commit the lockfile | **APPROVED**; exact patch OPEN |
| AD-016 | Renewal collision prevention | Member-level row locks **plus PostgreSQL exclusion constraint** for overlapping current effective entitlement intervals | **APPROVED**; migration shape to verify |
| AD-017 | PHP money | Store all PHP membership monetary values in **integer centavos**, never binary floats | **APPROVED**; integer width/serialization convention PROPOSED |
| AD-018 | App structure | One modular monolith, with clear modules and one deployment unit | **PROPOSED**, not independently approved |
| AD-019 | Authentication library | **Self-hosted Better Auth** + Prisma adapter + username plugin (not Neon's managed auth) | **APPROVED**; exact compatible versions and adapter behavior to verify |
| AD-020 | Managed vendor choice | **Vercel** for Next.js app + **Neon** for PostgreSQL | **APPROVED**; plan/account provisioning OPEN; region approved in AD-024 |
| AD-021 | Prisma baseline | Use a verified stable **Prisma 7** patch (not Prisma 8 release candidate) | **APPROVED**; exact patch OPEN |
| AD-022 | Entitlement model | Separate immutable original **membership_periods** from current **effective_entitlement_intervals**, with append-preserving adjustments | **APPROVED**; migration design to verify |
| AD-023 | Recovery objectives | Evaluate **RPO <= 1 hour** and **RTO <= 4 hours** | **APPROVED as targets for evaluation**, not a provider promise or demonstrated SLA |
| AD-024 | Cloud region | Vercel `sin1` + Neon `aws-ap-southeast-1` in Singapore | **APPROVED**; account availability, latency, plan pricing and privacy review before creating production |
| AD-025 | Environment/privilege boundaries | Separate dev/staging/prod environments; separate migration credentials outside app runtime; restricted pooled runtime role | **APPROVED**; deployment details, access grants and cost OPEN |
| AD-026 | Sessions and sensitive actions | 7-day rolling sessions; 24-hour renewal cadence; fresh password within 5 minutes for sensitive owner changes; database-backed immediate revocation and no cached authorization for protected mutations | **APPROVED**; verify library semantics and test timing |
| AD-027 | Staff/owner onboarding and email | Controlled initial owner provisioning, verified-email owner-managed staff invitations, transactional email delivery | **APPROVED direction**; owner bootstrap verification SOP OPEN |
| AD-028 | Backup and resilience approach | Evaluate Neon **Launch or higher** with **7-day** PITR history, independent backups and restore rehearsal; retain RPO ≤1h/RTO ≤4h as unproven targets | **APPROVED for evaluation**; plan/retention/backup storage and measured recovery OPEN |
| AD-029 | Transactional email vendor | **Brevo** for owner/staff email verification, invitations, and password-reset delivery through a server-side adapter | **APPROVED vendor**; account/domain/sender/API configuration and live-plan choice OPEN |
| AD-030 | Account email controls | Staff invitation/setup link expires after **48 hours**; password-reset link after **30 minutes**; all setup/reset links single-use; use a platform-owned authenticated sending address when available; failed sends leave invitations pending with controlled authorized resend | **APPROVED**; resend limits/notification templates and exact provider-library configuration to implement and test |
| AD-031 | Sending-domain readiness | The user **does not yet own a sending domain**. Use isolated local/test email transport for S-01a development; do not claim Brevo real-email readiness. Obtain/control and authenticate the platform domain, sender address and production mail configuration **before real invitations or resets** | **RECORDED FACT + LIVE-EMAIL GATE**; domain name, purchase, DNS and verification OPEN |
| AD-032 | Initial gym-owner onboarding | **Controlled platform-admin bootstrap**: a designated platform administrator independently verifies gym ownership, provisions a pending gym and its single primary-owner account, and sends a single-use **48-hour** owner setup invitation. Only successful verified setup may activate operational owner access. No public owner registration, ordinary-staff self-promotion, or unreviewed production seeding. | **APPROVED process**; specific proof documents, reviewers, evidence-retention and dispute SOP OPEN |
| AD-033 | Runtime validation | Use Zod for application-owned untrusted input and environment configuration; reuse browser-safe schemas for forms. Preserve authorization, database constraints and transactional business checks. See §17. | **APPROVED direction by user request, 2026-10-24**; installed version and integration coverage NOT VERIFIED |

**Current release guidance (verified 2026-10-24):** Prisma's release-status page dated its package snapshot **2026-10-23** and lists Prisma 8 as a *release candidate* and **7.10.1** as the stable Prisma 7 line. The user approved a **stable Prisma 7 baseline**; pin its exact supported patch at setup and verify release notes before upgrading. Pin the exact versions and test actual APIs. Prisma 7 uses `prisma.$transaction(...)`; Prisma 8 documents `db.transaction(...)` and a different migrations workflow. **Never mix their code examples.**

**Approval scope (2026-10-24):** The user's latest approval covered five previously proposed defaults: self-hosted Better Auth with Prisma/username; seven-day rolling sessions, daily renewal and five-minute sensitive-action password checks with DB-backed revocation; controlled owner bootstrap and verified-email staff invitations using a transactional email service; Singapore Vercel/Neon with separate dev/staging/prod and migration credentials outside runtime; and evaluation of Neon Launch-or-higher with seven-day PITR, independent backups and isolated restore rehearsals. This is approval of the **architecture direction**, not selection of an email vendor, paid subscription, token expiry, staff identity-proofing procedure, or proof that recovery targets have been achieved.

**Brevo and account-email defaults (2026-10-24):** The user selected **Brevo** (AD-029), subsequently approved the **48-hour staff invitation expiry, 30-minute password-reset expiry, single-use links, platform-owned sending address, and failed-send pending/controlled-resend policy** (AD-030), and stated that they **do not yet own a domain** (AD-031). No Brevo account, subscribed plan, verified sender, domain purchase or live email service exists by implication. Real invitation/reset delivery is a later environment readiness gate; owner identity proof for initial provisioning and manual recovery remains open.

**First-owner bootstrap decision (2026-10-24):** The user explicitly approved **platform-admin-managed first-owner onboarding** (AD-032): independent gym-ownership verification, pending gym/owner creation and a one-time setup invitation. This approves **the procedure**, not a particular evidence checklist, support team/person, production operator provisioning mechanism, or proof that any gym has been verified. S-01a can use only synthetic bootstrap fixtures until production verification and sending-domain gates are satisfied.

## 2. Architecture and trust boundaries

```text
Owner / staff browser (untrusted inputs)
            |
       HTTPS + session
            v
Next.js server (one modular monolith; proposed topology)
  - Authenticated identity -> unique gym / active operator status
  - Explicit role + capability authorization
  - Members / plans / immutable charge snapshots
  - Payments / verification / receipts / idempotency
  - Membership terms / eligibility
  - Cases / owner-approved adjustments / audit
  - Paper outage recovery / provisional visits
  - Daily closing / reporting / pilot evidence
            |
       Scoped transaction client only
            v
PostgreSQL (shared tenant tables, tenant-consistent FKs,
            restricted runtime role + RLS + financial constraints)

Separately privileged: migration/admin infrastructure; audited platform
recovery workflow. Neither may be exposed as ordinary gym-owner powers.
```

Keep modules logically separate: **Identity**, **Members & Plans**, **Collections**, **Membership Eligibility**, **Disputes & Adjustments**, **Outage Recovery**, **Reconciliation**, **Audit & Pilot Evidence**. They share one codebase/deployment; service methods should call other modules through explicit interfaces, not bypass their invariants with ad hoc table writes.

**Not in MVP:** microservices; payment gateway/POS; member portal; biometrics/turnstiles; marketing; partial payments/receivables; local-first offline application; automated offline digital capture; complex accounting or multi-branch franchise management.

## 3. Accounts, permissions and recovery

- **Owners** sign in with verified email/password; **staff** sign in with username/password while having a verified email for initial setup/recovery. Each operator has their own account; shared cash-desk credentials are prohibited.
- `auth_users` (or provider-specific identity tables) and `gym_operators` are separate. `gym_operators.user_id` is unique so one user/account maps to at most one gym. A person working at two gyms needs two independently managed identities; verify whether the selected auth provider requires different email addresses. Never generate fake email addresses.
- Staff permissions are capabilities, **not additional product roles**: cash collector, digital receiving-account verifier, missing-payment investigator, outage collector, closing preparer. Only owners approve refunds/corrections and unresolved closings, according to `PROJECT.md` §4. The digital verification capability requires designated real receiving-account access, even for the owner.
- An operational gym must have one primary owner. A database partial unique index can enforce **at most one** current primary owner; an onboarding/activation transaction and operational checks must separately enforce **at least one** before activation. Do not claim a partial unique index proves exactly one.
- Every sensitive operation checks both active operator/gym membership and exact capability **at execution time**. Password reauthentication is additional evidence, not a substitute for permission. The user **approved a five-minute freshness window** for sensitive owner changes; enforce the window server-side, with library semantics validated at implementation.
- Staff reset: owner authorizes after verifying employee identity; send expiring, single-use token to the staff member's verified email; staff sets their own password; invalidate relevant sessions; audit request/issuance/use. Never expose reset tokens or passwords to owners, logs or normal customer support.

### First gym owner: approved platform-admin bootstrap (AD-032)

1. A **designated platform administrator**, through a private audited administrative pathway, receives an onboarding request and checks independent evidence that the requester is authorized to represent the gym. The exact acceptable evidence and who may approve it remain an explicit **pre-live operational gate**; an email address or staff assertion alone does not establish ownership.
2. After the required verification is recorded, create a **pending** gym and reserve exactly one primary owner identity, binding the intended verified email and gym together. Make the operation transaction-safe and idempotent: repeat requests or parallel attempts must not create duplicate operational gyms or multiple primary owners. No ordinary gym user may call the bootstrap pathway.
3. Issue a **single-use owner setup invitation** that expires after **48 hours**, using the same approved secure-token and failed-send controls as staff invitations. Account setup is not activated simply because an email was dispatched. While no platform domain is owned, send **only through the isolated synthetic/local transport**; do not send real invitations.
4. The invited owner proves mailbox control, privately sets their own password, and completes the invitation. Atomically activate the owner-to-gym link and the gym's operational status only after all required verified checks succeed; otherwise remain pending and fail closed. Enforce **at most one** primary owner in the database and **at least one** for operational activation.
5. Audit the platform initiator, verification/approval outcome, recipient identity, pending/active transitions, token issuance/consumption metadata and failures, excluding passwords, raw tokens and sensitive proof from ordinary logs. Replays, expired links, duplicate bootstrap, unauthorized initiation and attempts to use a pending gym are rejected.

**Separation of duties:** A platform administrator is **not** a gym `Owner`/`Staff` role and gains no implicit ability to operate that gym's payments or change financial history. Production bootstrap must not be implemented as public registration, a silently privileged application route, or a reusable database seed script.


### Owner recovery: approved path, unsettled operating procedure

**Ordinary recovery:** self-service, short-lived single-use reset delivered to the existing verified owner email; revoke affected sessions and notify the owner of recovery.

**Exceptional recovery:** if email access is lost, suspected compromised, or ordinary recovery is unsafe, a designated **platform** operator opens a recovery case. Independent corroboration of the gym's ownership/identity is required; a request from gym staff or control of the current email alone is **not** proof. Preserve existing payment/audit history; review account takeover risk; notify previously verified contact channels where safe; revoke compromised sessions; retain evidence references, reviewers, approvals and timestamps. Recover original owner identity or transfer only through an approved process. No ordinary staff promotion or undocumented DB-level back door.

**Before live onboarding, decide:** platform support personnel and backup, acceptable independent evidence for first-owner bootstrap and exceptional recovery, whether two-person approval is mandatory, contact/notification and challenge process, disputed-ownership freeze/hold, and evidence retention. **The initial bootstrap workflow itself is approved in AD-032; its verification SOP is not yet finalized.** A **two-person review** is recommended for loss-of-email recovery when staffing permits, but is **not approved** as a mandatory product policy yet. NIST SP 800-63B-4 discusses recovery contacts, codes/re-proofing, and recovery notices; tailor safeguards to the application's actual identity-proofing level rather than claiming formal NIST compliance.

MFA is deferred per decision. Record residual credential-theft risk, provide rate limiting and login/recovery alerts, revoke sessions on offboarding, and re-evaluate MFA before broader rollout.

## 4. Tenant isolation: PostgreSQL and Prisma contract

Every gym-owned business row carries `gym_id NOT NULL`. Enforce tenant-consistent relationships using composite `(gym_id, record_id)` references where appropriate, indexed scoped searches, least-privilege grants and RLS.

**Server-controlled request sequence:**

1. Validate session using the authentication infrastructure. Resolve the **one** active `gym_id` through a tightly scoped auth/operator lookup; **never** accept the browser's gym ID as authority.
2. Authorize the action and check operator capabilities.
3. Start a **single** Prisma database transaction. As its first tenant-sensitive step, set transaction-local context (illustrative SQL: `SELECT set_config('app.current_gym_id', $1, true)` with a bound value).
4. Pass the **same transaction handle** to all tenant repositories; do not issue a root-client query halfway through. Avoid independently started nested transactions.
5. Have RLS `USING` and `WITH CHECK` policies compare table `gym_id` with `current_setting('app.current_gym_id', true)::uuid`; absent context must fail closed. Use both policy checks and DB constraints for INSERT/UPDATE; restrict DELETE on ledger records independently of RLS.
6. Commit or roll back. The local DB setting must not persist to the next tenant sharing the pooled connection.

Runtime DB role: not superuser, not table-owner bypass, no `BYPASSRLS`; separate privileged migration credential. Enable and FORCE RLS on tenant tables; review default privileges, table/view/function ownership, any platform-admin access path, and security-definer functions. PostgreSQL's RLS protects against accidentally unscoped queries **but not malicious ability to set an arbitrary context**; correct authenticated context derivation and SQL-injection defenses remain essential. RLS by itself does **not** enforce proper parent/child gym relationship; composite foreign keys do.

**Authentication exception:** global identity tables and the narrow session-to-operator lookup require a separately documented access pathway, not unlimited tenant-table privileges. Test authorization with the **actual restricted production-like DB role**, not only migration credentials.

**Integration tests:** no context -> no tenant reads/writes; gym A cannot query/update/delete/reference gym B data; changing `gym_id` on UPDATE rejected; concurrent gym A/B requests through pooled connections do not leak context; permission revocation takes effect; queries in nested services never escape the scoped transaction.

## 5. Conceptual physical schema (candidate, not a committed migration)

| Table/group | Essential columns or relationship | Key rules |
|---|---|---|
| `gyms` | gym ID, configuration/timezone, onboarding state | Independent tenant; one primary owner before operational activation |
| `auth_users` / auth provider tables | stable auth ID, verified email, credentials/session references | Provider-owned; don't invent its schema until selected |
| `gym_operators` + `operator_grants` | `user_id`, `gym_id`, owner/staff, active state, granted capabilities | `UNIQUE(user_id)`; partial unique primary owner per active gym; preserved attribution after disablement |
| `members` | `gym_id`, stable member ID, minimum approved fields | Composite tenant-aware references and member search indexes |
| `plans` | gym owner-controlled price, duration, active version | Validated full price; historical sales keep immutable snapshots |
| `idempotency_operations` | gym, command type, operation key, canonical request fingerprint, committed result | `UNIQUE(gym_id, operation_type, operation_key)` |
| `payments` | gym, member, method, **amount_centavos**, currency, plan/price snapshot, collector, distinct time fields, verifier, state, external reference | Pending digital payment gives no entitlement; confirmed entries not silently edited/deleted |
| `membership_periods` | source payment OR verified migration provenance; start/end, original immutable paid promise | For purchases, exactly one corresponding confirmed membership payment; `[start,end)` |
| `effective_entitlement_intervals` (**approved separate model**) | gym, member, period/adjustment provenance, effective `[start,end)`, current projection flag | DB exclusion prevents overlapping **current effective** segments; source payment/period preserved |
| `payment_receipts` | unique reference, gym, confirmed payment, issued timestamp | One retrievable issued reference per confirmed collection; controlled physical outage receipt scope separate |
| `audit_events` | actor, gym, action, target, timestamp, safe metadata | Append-preserving history, no credential secrets |
| Later: `investigation_cases`, `adjustments`, `evidence_references` | linked evidence, reason, owner decision, money result, explicit access result | Never infer refund behavior without approved gym terms |
| Later: `offline_receipts`, `custody_events`, `provisional_visits` | physical numbered source, collector/entrant/verifier, one visit, shift-end custody | Full cash only while disconnected; back-entry pending until verified |
| Later: `closing_snapshots`, `closing_lines`, `closing_adjustments` | business cutoff, method/collector totals, counted cash, exceptions and later events | Immutable closing snapshot and explained late changes |
| Later: `migration_provenance`, `pilot_metrics` | verified source and reviewer; original event timestamps | Unverified legacy records cannot fabricate paid periods |

Recommended PostgreSQL type for monetary amounts is **`BIGINT` centavos**, checked for valid positive values and reasonable product ceilings. JavaScript/TypeScript must use `bigint` or another verified exact integer representation across arithmetic, and serialize BigInt at the JSON boundary explicitly (for example as decimal strings). `BIGINT` is a **proposal** under the approved integer-centavos policy; `INTEGER` may suffice if validated maximums are small enough. Never use JS floating-point money calculations, including reconciliation totals. Payments store `currency_code = 'PHP'` until a future explicit multi-currency decision. Refund/correction amounts need method/reason-specific direction and evidence; do not subtract from the immutable original payment row.

Use `timestamptz` for event instants. Record **actual collection time**, receipt issuance time, application entry time, verification time, and any effective adjustment time distinctly; set audit server timestamps from a trusted source. For offline receipts, preserve separately the actor who actually collected cash and the operator who entered it later.

## 6. Approved membership rules and preventing overlap

O-07 user approval (2026-10-24): Monthly **₱800 / 30 days**, 3 Months **₱2,100 / 90 days**, 6 Months **₱4,000 / 180 days**. Days are consecutive 24-hour periods, never calendar months. Snapshot duration and integer-centavo price. New membership or late renewal starts **00:00 Asia/Manila on the verified full-payment date**. Valid outage back-entry uses midnight of the verified original collection date. Early renewal starts at the existing interval's end. Use `[start,end)`; no verified period, no normal eligibility. Payment at 18:30 never proves earlier admission. Store/evaluate UTC instants; display Asia/Manila.

- `membership_periods` holds the original confirmed financial provenance and sold term. Corrective/refund actions preserve this history, with linked owner approval.
- A **separate current effective entitlement projection is approved** so authorized access-shortening/termination does not delete historical paid terms. Every paid-term creation updates this projection in the same transaction; later owner-approved adjustments append correction evidence and atomically supersede affected projection rows.
- Member-level `SELECT ... FOR UPDATE` locks serialize overlapping sales and read/recompute membership sequencing within one transaction. A database exclusion constraint is the final invariant if application locking is missed.
- The exclusion constraint must cover **all current effective future/present/past** intervals as applicable, not just rows whose display label is `active` today. Avoid `CURRENT_TIMESTAMP` in a predicate: a time-dependent predicate cannot reliably represent lifetime overlap safety.

**Illustrative PostgreSQL constraint only (not an applied migration):**

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;  -- migration role only

ALTER TABLE effective_entitlement_intervals
  ADD CONSTRAINT effective_entitlement_no_overlap
  EXCLUDE USING gist (
    gym_id WITH =,
    member_id WITH =,
    tstzrange(start_at, end_at, '[)') WITH &&
  ) WHERE (is_current_projection);
```

Prerequisites: `gym_id`, `member_id`, `start_at`, `end_at` are non-null, timestamps have `CHECK(start_at < end_at)`, `is_current_projection` is trusted server-maintained data, and proper FK / RLS checks exist. A cancellation/adjustment must *append* an approval event, deactivate superseded projection segments (not delete original paid history), then create the approved replacement projection atomically. For consistency and because the model is now approved, **create one projection row for every S-01 confirmed paid period in the same transaction**; later correction workflows may supersede segments atomically. The exact Prisma/SQL migration syntax must be integration-tested. An exclusion constraint cannot determine whether a given refund is legally/policy-eligible; `PROJECT.md` refund gates remain controlling.

Mandatory acceptance examples: contiguous terms meeting exactly at `end` are allowed; overlaps of one second are rejected; attempts by two concurrent sessions are rejected/serialized; two different gyms may each have the same member UUID only within their own namespace without colliding; approved termination/correction preserves original ledger and updates eligibility according to explicit owner decision.

**S-02 policy approval (2026-10-25):** exact PHT expiry plus current-term whole days/hours rounded down at server check time, or "less than 1 hour" below one hour. Allow one queued paid term; block another sale until it starts and preserve committed same-key recovery. **Unsettled product cases remain blocked:** delayed GCash/bank confirmation crossing dates, non-outage historical recovered-payment effective date, and gym-specific refund/access dispositions.

## 7. Atomic financial transaction + idempotency

**Cash join/renewal command (S-01e):**

```text
Server: authenticate operator; derive one gym; authorize cash collector;
        validate request syntax and operation key (not client price authority).
BEGIN DB TRANSACTION via pinned Prisma API
  SET LOCAL app.current_gym_id = derived gym (bound parameter)
  INSERT or read idempotency operation with
     UNIQUE(gym_id, operation_type, operation_key)
  If same key + same canonical fingerprint committed: return saved result
  If same key + different fingerprint: reject as conflict
  Acquire member sequence row lock (stable lock order)
  Re-read current/scheduled paid intervals and product-policy gates
  Load approved price + duration from DB, snapshot for sale
  Validate actual **full cash received**, authenticated collector and date
  INSERT confirmed payment (integer centavos) and immutable sale snapshot
  INSERT exactly one sourced membership period using its approved 30/90/180-day snapshot
  INSERT current-effective entitlement segment(s) if projection exists
  INSERT unique retrievable receipt/reference and audit event
  Mark scoped operation complete with immutable result reference
COMMIT
Return same result for a retry
```

The idempotency record, payment, period, effective entitlement where modeled, receipt and audit are one commit/rollback unit. A duplicate operation key from a competing transaction waits/resolves consistently via a unique constraint; bounded conflict/deadlock retry rules and failure mapping are required. A retry after an unknown commit first looks up the scoped operation key. **Never** create a different confirmed collection just because the server lost its response. Conversely, matching `(member, amount, date)` alone never proves duplication; distinct actual collections remain legitimate.

Choose/read supported transaction API for the pinned Prisma version. For Prisma 7, use the interactive `prisma.$transaction(async tx => ...)` pattern, pass `tx` to all repositories and issue reviewed parameterized SQL for row locking / tenant context. Do not wait for emails, manual GCash verification or user input inside an open DB transaction. Confirm digital settlement evidence *before* final atomic payment/period creation. Sensitive commands require active authorization at execution time.

**Isolation:** start with PostgreSQL `READ COMMITTED` + consistent member lock order + unique constraints + exclusion constraint; this is a **proposed** level, not user approval of a particular isolation level. Consider `SERIALIZABLE` with bounded retries only if tests demonstrate need. Handle potential deadlocks, statement/transaction timeouts and unknown commit results explicitly; do not automatically replay a financial command under a new operation key.

**Other atomic commands (later slices):** verified digital conversion; authenticated missing-payment recovery; verified offline cash receipt conversion; owner-approved adjustment including explicit access disposition; closing review/snapshot. Every path must preserve the same identity, tenant, monetary and audit guarantees.

## 8. Business statuses must stay separate

- **Payment:** pending verification / confirmed / flagged, with linked reversal/correction events.
- **Paid period:** scheduled / active / expired / adjusted-or-terminated, derived from time plus verified financial provenance and approved adjustments.
- **Admission:** eligible / not eligible / one-visit provisional offline access. An outage receipt is **not** a durable digital paid membership by itself.
- **Investigation:** open / under review / escalated / resolved.

A currently active member can simultaneously have a pending digital renewal and remain eligible on the current verified period. A future scheduled period is fully paid; an unpaid or screenshot-only proposal has **no** paid period. Do not collapse these into one generic `member_status` or `pending_renewal` field.

## 9. Outage, digital verification, refunds and closing

- **Digital:** cash, GCash and bank transfer are supported methods. Only explicitly authorized verifiers with designated receiving-account access can confirm actual funds. Screenshot/reference alone never suffices. Pending digital collection cannot activate a period. Keep verifier, account-match reference, collection and confirmation times distinct; credentials for receiving accounts are never stored.
- **Physical outage:** full cash + controlled pre-numbered paper receipt may authorize **one visit only**, documented manually. There is no offline digital sync app. Back-entry when service returns remains unconfirmed until checked against independent cash/receipt/custody evidence, with original collection date preserved for applicable late renewals. Number reuse and missing/void receipts require traceable exception states. Mandatory shift-end custody handover occurs even without reconnection.
- **Missing payment:** owner or specifically authorized staff can verify and recover a truly omitted collection using independent corroboration, but staff may not alter an existing confirmed transaction. Digital recovery still needs receiving-account verifier capability.
- **Adjustments/refunds:** only owner approves changes to confirmed financial records, preserving original and linking explicit evidence, money disposition, access stays/ends/adjusts, rationale and effective date. Gym-specific refund eligibility/amount remains a product gate.
- **Closing:** staff prepare method/collector expected amounts and physically counted cash; owner approves unresolved differences without erasing them. Preserve original close snapshot after later verified back-entry or corrections. Exact cutoff, float and late-adjustment SOP are still open.

## 10. Security, privacy and operational controls

- TLS, secure/HttpOnly cookies, anti-CSRF measures where required, session expiry/revocation, sign-in/reset rate limiting and account enumeration protection.
- Apply active gym/capability checks at protected server action/data layer; hiding UI controls is insufficient. Enforce least privilege for members, evidence, payment history and platform support.
- Use parameterized SQL; review raw SQL, migration SQL, extensions, privileged functions and database roles. No tenant bypass via a client-selected gym ID.
- Preserve audit trails for price changes, membership changes, confirmed payments, digital verification, staff reset and recovery, permissions, corrections and closing. Do not log passwords, tokens, bank credentials or sensitive evidence payloads.
- Decide minimum necessary member data, consent/privacy notice, secure evidence storage, access retention and deletion/archival, operational audit retention, breach response and staff account offboarding before real pilot data.
- Restore plans must include separate verification of user privileges, RLS policies, custom PostgreSQL extensions, migration version, external receipt/evidence links and payment invariants.

## 11. Managed deployment, authentication and operations — approved choices with launch gates

### 11.1 Vercel + Neon topology

**Approved:** one Next.js/TypeScript application deployed to **Vercel**, with **Neon PostgreSQL**, managed cloud, Prisma **7**, and separate immutable paid-period history and effective-entitlement projections. One modular monolith remains the proposed code organization; no microservices are needed for S-01.

**Approved primary region:** Vercel functions in Singapore (`sin1`) with Neon AWS Singapore (`aws-ap-southeast-1`); both providers list these regions (checked 2026-10-24). Neon project region is immutable after project creation, so verify account-level availability and the selections **before creating production**. Benchmark Philippine front-desk request latency. Run authorization, financial writes, and database queries in the Node.js server runtime, not in the browser or at the Edge unless independently validated.

**Approved environment isolation:** distinct development, staging, and production app/database environments and separately scoped credentials. Actual provider accounts, budgets, and automation remain to be configured.

| Environment | App | Database | Data and credentials |
|---|---|---|---|
| Development | Local Next.js | Local PostgreSQL (preferred), optionally separate dev Neon project | Synthetic data only, local credentials; never use prod access |
| Staging | Restricted Vercel pre-production deployment | Separate Neon **project**, not merely prod child branch | Synthetic/de-identified data; independent DB users/secrets/auth keys; migrations tested first |
| Production | Protected Vercel production deployment | Separate Neon project, root branch | Real data only after pilot gates; restricted runtime role, dedicated migration role; backup/PITR |

Vercel **Preview** deployments are not the same as a controlled staging environment: unreviewed branch builds must never receive production secrets or production DB credentials. Prefer per-branch short-lived synthetic test DBs if preview database integration is added; do not automatically run migrations against any shared production/staging database from every preview. The production app should not cache payment, entitlement, or authorization decisions in a way that makes revocation/expiry stale.

### 11.2 Database connections, RLS and Prisma 7

- **Runtime:** Neon **pooled** PostgreSQL URL under a restricted `gym_runtime` role, using Prisma 7 with `@prisma/adapter-pg` and a bounded connection pool. Neon uses PgBouncer **transaction pooling**; treat each interactive Prisma transaction as the only permitted scope for tenant SQL. Set `set_config('app.current_gym_id', ..., true)` on that very connection, then execute all gym-scoped queries on its transaction client; after commit/rollback the setting expires. Fail closed if not set. `SET`/`RESET` session settings and session-level advisory locks are **not** safe through the pooler. Confirm transaction pinning and RLS with live Neon integration tests before S-01b/e.
- **Migrations, `pg_dump`, administration:** use a **direct**, non-pooled Neon connection and independently restricted elevated role. Migration credentials must not be available to the Vercel web runtime. Prisma 7 production migrations run via **`prisma migrate deploy`** in a gated CI/release job, not `migrate dev`, `db push`, or automatically on web startup. Version-control reviewed custom SQL migrations for `btree_gist`, `FORCE ROW LEVEL SECURITY`, partial unique indexes, and GiST exclusion constraints; verify their grants and post-restore presence.
- **Identity lookup exception:** auth session/profile lookup may need a tightly scoped global auth-data path, separate from tenant-scoped transactions. It must not become a public read path or a privileged escape hatch. After identifying the authenticated user, server resolves the single `gym_id`; financial tables are inaccessible except through RLS-verified tenant transactions. Validate design against actual Better Auth schema, pooler and migration tooling.
- **Prisma baseline:** pin exact mutually compatible `prisma`, `@prisma/client`, `@prisma/adapter-pg`, `pg`, TypeScript, Node LTS patch and framework dependencies. Keep lockfile. The official 2026-10-23 status snapshot lists 7.10.1 as stable; this is a **candidate exact version**, not installation verification. Do not use Prisma 8 CLI defaults or migration examples with a Prisma 7 project.

### 11.3 Approved self-hosted Better Auth baseline (implementation pending)

**Approved: Better Auth (self-hosted in the app) + its Prisma adapter and username plugin.** This does **not** select Neon's Managed Better Auth service. Documentation supports the planned username/password and Prisma integration, but verify the installed versions and generated migrations before implementation.

**Required behavior inherited from prior approvals:** primary owner email/password, staff username/password **with real verified email**, **platform-admin-verified first-owner bootstrap (AD-032)**, owner-only staff provisioning and initiating staff reset, one gym per operator identity, fresh password reauthentication for sensitive owner actions, MFA deferred. No anonymous owner/staff registration. Users always set their own private password; no plaintext or recoverable password stored or exposed to owners.

**Approved defaults and the controls needed to implement them** (technical parameters such as cookie attributes remain subject to library/browser integration testing):

1. DB-backed, secure `HttpOnly`, `SameSite=Lax` (if compatible with final auth flow), production `Secure` cookies, one first-party app origin; CSRF/origin protection. A **7-day rolling session** with **1-day update cadence** is **approved**; implement and verify the exact Better Auth settings and expiry/renewal tests. For immediate revocation, **do not enable Better Auth cookie session caching** for sensitive/admin flows; check status and current capabilities against the database on each protected mutation.
2. For high-risk owner operations (refund approval, corrections, operator permission change, staff reset, ownership recovery), require fresh password verification, approved freshness **5 minutes**. Reauthentication is not itself an additional owner capability; both checks must succeed. Protect against concurrent replay and expiry.
3. Owner-controlled invitation: create a pending staff invitation tied to one gym, a real email address and intended username; generate a **single-use setup link expiring 48 hours after issuance** (AD-030), and verify mailbox control when accepted. Do not treat the email as verified merely because the owner typed it. Activate the operator only after safe completion and authorized provisioning. No public staff sign-up. Assign no financial permissions by default. Owner cannot set/view the staff's password. Expired/replaced/used links cannot be replayed.
4. Staff password recovery: authenticate and freshly reauthenticate the owner, verify staff identity outside the app, initiate a **single-use email reset expiring 30 minutes after issuance** (AD-030); invalidate old staff sessions when reset succeeds and audit authorization/request/consumption without storing raw tokens. Normal owner password recovery uses the existing verified email and the same **30-minute, single-use** reset rule; exceptional manual platform recovery follows Section 3 and is gated on a separately approved independent-proof SOP. A reset email merely being generated/sent is not evidence that the account was recovered.
5. Offboarding disables `gym_operators` access **before** revoking sessions; permission and active-state checks fail on the next protected request even if a stale auth cookie exists. Rate-limit login/reset/invitations, use generic login/reset error text to reduce enumeration, monitor abnormal patterns.
6. Initial owner bootstrap follows **AD-032 and Section 3**: platform-authorized verification first, pending gym/owner, **48-hour single-use** owner setup invitation, verified private password setup, and audited transition to exactly one operational primary owner. Reject anonymous signup and unaudited production seed-based owner creation.

**Important auth schema constraint:** Better Auth email addresses are unique per auth user. The approved one-gym-per-account rule means **one human serving two gyms needs two separately provisioned accounts**; whether the provider and gym policy can accommodate distinct **verified** email addresses is unresolved. Do **not** invent `user+gym@...` aliases, fake addresses, email reuse exceptions or extra accounts without user approval. Controlled first-owner provisioning and **Brevo as the eventual real-email provider** are approved, and the link expiry/resend baseline is set by AD-030. **No domain is owned yet**: S-01a development uses an isolated test sender until Brevo and a platform-owned authenticated domain are configured. The **bootstrap process is approved** (AD-032); exact acceptable ownership evidence, approvers and safe resend limits remain open.

**Recommended proof before S-01a implementation:** pin Better Auth and adapter versions; generate schema into Prisma migrations (Better Auth generation alone does not apply migration); test email-verified staff invitations, no public staff signup, login by role-specific method, revocation, reset, fresh owner password verification, two users with same username request, and cross-gym access. Verify the adapter's password-reset token/session behavior against the installed version, not only documentation examples.

### 11.4 Brevo transactional email — approved vendor, implementation proposal

**Approved vendor (AD-029): Brevo.** Use it only for transactional account email in S-01a: staff invitation/account setup, staff email verification, owner email verification, owner password reset, and owner-initiated staff password reset. Do not add marketing lists, member campaigns, or member receipt emails to MVP scope on this decision alone. Authentication remains **self-hosted Better Auth**; Brevo is a **delivery provider**, not the source of identity, session, operator membership, or authorization truth.

**Proposed integration boundary:** Keep a `TransactionalEmailSender` server-side interface and a Brevo implementation; connect Better Auth's email-verification/password-reset callbacks and the app's owner-authorized staff invitation flow to it. The official Brevo HTTP API supports `POST https://api.brevo.com/v3/smtp/email` authenticated with an `api-key` header and returns a `messageId` on API acceptance. Using its SDK is optional; pin the SDK version if adopted. API acceptance is **not proof of inbox delivery or user verification**. Keep tokens/links generated and validated by the auth/invitation system, not by Brevo. Never let the browser call the Brevo API directly.

**Configuration / deliverability gates (not completed):**

1. **Domain not owned as of 2026-10-24** (AD-031). For production email, first obtain a platform-controlled domain, create a legitimate platform-owned sender mailbox/address, register/verify sender in Brevo, and authenticate the sending domain using provider-directed DNS records (including DKIM/DMARC). Do not use a fabricated sender, assume a free Gmail address can be authenticated as a Brevo sending domain, or send from gyms' domains without authorization. Only after verification should real invitations and password resets be enabled. Keep `BREVO_API_KEY` and `BREVO_SENDER_EMAIL` as per-environment server secrets, never `NEXT_PUBLIC_*`, source control or logs. Acquire no domain or subscription by implication of these specifications.
2. **While no domain exists, S-01a proceeds in local/synthetic mode:** use an `EmailSender` abstraction with fake/in-memory or local capture transport; test the actual token lifecycle, invite acceptance and recovery UI without sending real emails. Keep development links tied to the local/test origin; never log raw links or tokens to general application/production logs, and keep captured tokens restricted to synthetic test tooling. Configure Brevo transport and real inbox end-to-end tests only after sender/domain verification. Staging and production use isolated secrets/recipients. Do not treat a Vercel preview domain as authorization to send mail from it, and do not send real reset links to unintended recipients.
3. Use a generic, consistent email adapter interface for verification, invitation and reset templates; keep email content minimal, with correct app origin and expiry copy. No passwords, banking details, member financial data, or credentials in email. Avoid exposing reset/invitation URLs, token strings, raw provider request payloads or API keys in logs/audit events.
4. **Approved failure rule:** create pending invitation/reset state **before** dispatch. If the email transport fails, times out or is disabled for the environment, leave the invitation pending/unactivated. An authorized owner may request a controlled resend; rotate/invalidate the previously issued invite token, issue a fresh single-use **48-hour** invitation token and apply rate limits. Reset-token resends issue a new single-use **30-minute** token and invalidate prior applicable reset links. Record non-sensitive delivery attempts/errors; never assume API acceptance means inbox delivery, and avoid unbounded repeat email after ambiguous timeouts. Use safe after-response/queued sending appropriate for deployment; never hold a financial DB transaction open waiting for external email.
5. Before real use, test successful delivery, sender rejection, bounced/blocked recipient, API `429`, provider timeout, delayed email arriving after token expiry, replayed and replaced links, compromised mailbox, and operator disabled before accepting an invitation. Where delivery-status webhooks are used, authenticate/validate incoming calls, bound payload size, deduplicate events by stable ID, and treat their status as **operational evidence only**, never authentication proof.
6. Choose live plan after measuring volume and deliverability. Brevo's published Free plan currently lists 300 emails/day with additional transactional-message queueing on quota exhaustion; the API also returns `429` for rate limits. Provider quotas/pricing are not approval to buy or claims of account-specific entitlement.

**Approved now:** 48-hour invite expiry, 30-minute reset expiry, single-use links, platform-owned sender once a domain exists, failed delivery => pending invitation, and authorized resend (AD-030). **Live-email gate still open:** buy/control platform domain; create/verify sender; authenticate sending domain in Brevo; secure API credentials; prove real end-to-end delivery and bounce handling. **Other open decisions:** exact independent proof/approval SOP and designated platform-bootstrap operator; exact resend rate limits, failure escalation SOP, delivery-webhook necessity, owner reset-success notice, and production support coverage. None blocks isolated synthetic-data S-01a scaffolding.

### 11.5 Backups and achievable recovery

**Approved evaluation targets:** **RPO <= 1 hour** (maximum tolerated unrecoverable confirmed data) and **RTO <= 4 hours** (time to restore usable operation). Neither is a contracted Neon/Vercel service-level guarantee or currently demonstrated result.

- Neon has **instant point-in-time restore (PITR)** bounded by the project's **history window**. Current docs list Free default **6 hours** (subject to history size cap), Launch default **1 day** with a max **7 days**, and Scale max **30 days**. **Approved evaluation direction:** assess Neon **Launch or higher** and a **7-day PITR history window** for production. This does not authorize purchasing a subscription or claim the configuration exists; verify plan costs and limits first. Scheduled snapshots are available on paid plans. Point-in-time history, snapshots and `pg_dump` protect against different failure classes; do not claim PITR solves complete account compromise/provider loss.
- **Approved direction:** maintain independent backups beyond Neon PITR, plus pre-migration recovery checkpoints. Encrypted periodic `pg_dump` in access-restricted storage is the proposed implementation; exact cadence, storage location, retention and budget remain open. Store/check backup audit metadata in a location not solely dependent on the failed primary database.
- **Approved direction:** run a **restore rehearsal to an isolated project** before the first live pilot, then at a recurring cadence to be agreed: recover historical payment/entitlement data, check RLS, DB grants, auth tables, indexes/`btree_gist`, original receipts, operator attribution and migrations. Time the restoration including access reconfiguration and validation. Never run an untested destructive restore directly against live data.
- **Financial replay/reconciliation is mandatory** for any gap: if restored to time `T`, list all acknowledgements/cash collections and physical outage receipts that may postdate `T`; use independently preserved receipts/references and verified funds to resolve without duplicate payments. Hold new financial writes during reconciliation if ledger state is uncertain. Record incident, root cause, approved reopen time and audit evidence.
- Establish owner and backup operator responsible for incidents; define operating-hours coverage, data export/retention, privacy access, incident severity, notifications and support escalation. Even if backups exist, the targets remain **unverified** until a representative rehearsal proves them.

### 11.5 CI/CD, secrets, monitoring and incident handling

**Proposed release sequence:** reviewed PR -> typecheck/lint/unit tests -> integration PostgreSQL tests (actual RLS role, membership exclusion constraint, rollback and retries) -> staging deploy + end-to-end tests -> reviewed SQL migration + pre-change recovery checkpoint -> gated `prisma migrate deploy` using direct migration URL -> production deployment -> smoke checks + monitors. Use expand/migrate/contract rollout for incompatible schema changes and explicit stop criteria. Rolling back application code does not automatically reverse a database migration.

**Secrets:** Vercel per-environment secret variables (`AUTH_SECRET`, reset-email API key, runtime pooled DB URL); direct migration DB credentials stored only in separately controlled CI environment. Least-privilege cloud/team permissions, 2FA for *platform accounts* even though Gym CRM owner MFA is deferred, secret rotation and no credentials in repositories/logs. Vercel's environment variables apply to new deployments; redeploy after changing configuration.

**Minimum operational signals:** synthetic uptime checks for login + read-only gym status, server/DB latency, transaction retries/rollbacks, payment failures, RLS rejects, out-of-scope cross-gym attempts, unexpected entitlement overlaps, missing receipt/operation result, delayed digital verification, owner recovery requests and email delivery failures, DB disk/connections/history window/snapshot schedule, failed production deploy/migration. Errors should carry safe correlation IDs, no password/reset token/financial account credentials/member PII. Route high-severity payment-integrity alerts to a designated responsible human.

**Incident procedure:** detect -> classify financial integrity/privacy/access impact -> stop or restrict unsafe workflows -> communicate approved physical receipt fallback where applicable -> preserve diagnostic/audit evidence -> restore/test -> reconcile post-restore records -> review before resuming. For an outage the approved manual fallback allows only full cash + controlled numbered receipt + one provisional visit; the app does not become an offline-capable digital system.

**Open before live pilot:** production plan/cost ceiling, actual region/provisioning, snapshots/PITR settings, independent backup retention/location, restore runbook and operator coverage, **purchase/control and authentication of platform email domain (none owned yet), Brevo verified sender, real delivery/incident handling and quota verification**, incident notification recipients, platform recovery proof standard, legal/privacy review of retention and data access. These do **not** prevent coding S-01a with synthetic data.

## 12. Essential automated acceptance tests

| Test ID | Scenario | Expected invariant |
|---|---|---|
| T-01 | Gym A operator submits Gym B member/payment ID by URL or API | Denied at application and RLS layers; no cross-tenant FK mutation |
| T-02 | Same DB pool connection reused by Gym A and Gym B | No prior tenant context leakage |
| T-03 | Same operation key submitted concurrently | One payment, one term, one receipt; same result |
| T-04 | Same operation key with changed member/amount/plan | Conflict; no second financial result |
| T-05 | Failure after payment row but before period/receipt | Total rollback; neither paid period nor misleading confirmed outcome |
| T-06 | Two distinct concurrent member renewals that would overlap | Lock / exclusion prevents overlapping currently effective intervals; additional advance sale blocked while a queued paid term exists |
| T-07 | New/late payment at 18:30 and leap-year/month-end dates | 00:00 local effective start; fixed 30×24-hour end; exclusive end; never pre-payment access |
| T-08 | At `end`, next paid interval begins at exactly same instant | Adjacent paid terms allowed, continuous correct eligibility |
| T-09 | Staff executes direct refund or owner-recovery request | Denied and audited |
| T-10 | Cash receipt after offline outage entered two days later | Original collection and entry/verification times distinct; only one provisional visit |
| T-11 | Owner-approved early termination/refund | Original payment and sold term retained, current entitlement projection correctly updated |
| T-12 | Restored database in a clean environment | RLS, roles, `btree_gist`, constraints, schema version, recovery checks and audit references all valid |
| T-13 | Brevo acceptance, rejection, timeout, rate limit or bounce | Activation/reset gates unaffected; safe retry/alert state; no token or API secret leaks |
| T-14 | Invitation/reset email is late, replayed, or followed by disabled operator | **48-hour** invite and **30-minute** reset cutoffs enforced, used/replaced token denied; disabled user never gains access; audited without token contents |
| T-15 | No platform sending domain is configured | Local/synthetic email capture and token tests work; real Brevo sending stays disabled with a clear configuration/readiness error; no fake sender or accidental live recipient |
| T-16 | Invite delivery fails or owner retries a pending invitation | Invitation stays pending; authorized rate-limited resend rotates token, old link fails and fresh link has its own **48-hour** expiry |
| T-17 | First-owner bootstrap attempted anonymously, repeatedly or without approved verification | Rejected or remains pending; no active gym/owner; authorized verified bootstrap creates only one owner; single-use 48-hour invitation and full audit proven in synthetic tests |

Map each test to the applicable `PROJECT.md` FR/AC IDs. Use synthetic data until all pilot privacy, recovery and operational gates are satisfied. Add negative tests for unavailable digital verifier, receipt mismatch and missing evidence, closing differences, and session revocation. Instrument pilot measurement timestamps honestly.

## 13. Delivery sequence (do not redefine the seven business milestones)

- **S-01a:** individual owner/staff identity and login; controlled initial provisioning.
- **S-01b:** owner/staff capability boundaries, strict gym binding, RLS foundation and direct API denial tests.
- **S-01c:** tenant-scoped member create/search with minimal approved fields.
- **S-01d:** owner-only plan pricing and immutable at-sale snapshot.
- **S-01e:** exact full cash confirmation, transaction-local tenant client, idempotency, row lock, exclusion, financial atomicity.
- **S-01f:** retrievable receipt and attributable payment history.
- **S-01g:** eligibility, approved fixed 30/90/180-day calculations, complete cash join -> receipt -> eligibility.
- **S-02:** early/late renewal with adjacency and no paid-time loss; one queued paid term, with another sale allowed only once it starts (user approval 2026-10-25).
- **S-03:** receiving-account verified GCash/bank workflows.
- **S-03 synthetic configuration (user approval 2026-10-25):** owner-managed account labels/methods and explicit per-account verifier grants, including owners; changes use fresh owner reauthentication and the existing exclusive gym lock. Settlement uses the shared gym authorization lock, rechecks the grant, then serializes the operation key and member before financial writes. Pending claims and settlement evidence are separate append-only tenant records with composite foreign keys and FORCE RLS. Digital payments atomically link one claim, payment, original period, entitlement, receipt, evidence, audit and completed operation; deferred PostgreSQL checks reject incomplete digital results. Transaction references are unique per designated account. Verifier revocation denies subsequent confirmation/recovery. Distinct collection, entry and verification times remain attributable. Both reported and actual received Manila dates must equal verification date; cross-date claims remain pending. Owner-review flags append without changing funds/access. No new business role, banking credentials, evidence upload, live account authority or S-04 disposition is introduced.
- **S-04:** evidence-backed investigations and owner-approved linked correction/refund, with separate access projection if used.
- **S-05:** physical outage receipt custody/back-entry and one-visit exceptions.
- **S-06:** daily reconciliation, exception visibility, retained closing snapshots.
- **S-07:** verified historical migration and credible pilot measurement.

## 14. Open decisions and implementation gates

**Remaining architecture choices (not settled by the latest decisions):**

1. **S-01a integration details:** Better Auth + Prisma adapter + username plugin and Brevo **approved**. AD-030 now fixes the link TTLs and baseline resend/failure rules. Build/test against a synthetic email sink now; **do not block coding on a domain purchase**. Real Brevo setup awaits a platform-owned authenticated domain and verified sender (AD-031). The **platform-controlled first-owner bootstrap procedure is approved (AD-032)**; still settle its proof-of-ownership checklist/authorized reviewers before live onboarding, detailed resend limits, and exact `gym_operators` provisioning flow. Handle one-person/two-gyms email collisions explicitly, not with invented addresses.
2. **Session/security implementation:** 7-day rolling sessions, 24-hour update cadence, five-minute sensitive-action password reauthentication, DB-backed revocation, and no cached authorization for protected mutations are **approved**. Verify actual library configuration, session invalidation, request-level capability checks, rate-limit store, and negative tests. MFA for gym owners remains deferred; platform-infrastructure MFA is a separate safeguard.
3. **Exact dependency pins:** verify the Prisma 7 patch and compatible Better Auth/Prisma adapter/Node patch, commit lockfile; do not assume a previously quoted patch is already installed.
4. **Cloud and budget:** Singapore Vercel `sin1` + Neon `aws-ap-southeast-1` and separate dev/staging/prod environments **approved**. Still provision environments, set budget/spend limits, verify production Neon Launch-or-higher eligibility/cost and seven-day PITR, and configure snapshots/independent backup storage.
5. **Operational readiness:** independent backup cadence/retention, named primary/backup incident responders, actual restore rehearsal evidence against **RPO ≤1h / RTO ≤4h**, monitoring/alerts, secret management, and manual owner-recovery proof/approval SOP. Independent backups and restore rehearsals are approved directions, not yet configured or demonstrated.
6. **Physical migration:** implement the approved separate entitlement projection from S-01, enforce exclusion constraint, and test Prisma 7 + Neon pooled RLS on real transactions before accepting Slice 1.

**Product/pilot gates still owned by `PROJECT.md` §9 (do not answer them in architecture):** delayed digital confirmation crossing dates; effective date for recovered non-outage historical claims; lost receipts and repeat visits during prolonged outage; refund case eligibility and amounts; designated account verifiers/evidence standards; daily cash cutoff/float and late closing; verified migration criteria; pilot protocol; evidence retention and personal-data stewardship. O-07 launch plans were approved on 2026-10-24: PHP 800/30 days, PHP 2,100/90 days and PHP 4,000/180 days, each day exactly 24 hours. Region/plan approval does not establish hosted provisioning or operational readiness.

## 15. S-01a engineering kickoff: prerequisites, acceptance, and handoff

**S-01a can begin now with synthetic data without buying a domain.** Pin versions, set up Better Auth/Prisma models, implement a server-only `EmailSender` interface with local/test capture, and exercise the **48-hour invite / 30-minute reset / single-use / pending-on-failure / authorized-resend** contracts. Brevo is selected for later real delivery, but no domain is yet owned or authenticated; do not enable real staff onboarding or recovery emails until verified. The **bootstrap workflow is approved (AD-032)**, but the evidence/approval SOP remains a live-onboarding gate; do not turn a development seed script into a public or unaudited production owner-creation endpoint. Do not onboard real gyms until the separate production, privacy and recovery gates are satisfied.

### Proposed implementation order for S-01a

1. Pin framework/Node/TypeScript/Prisma 7/driver versions with lockfile; use local PostgreSQL and a repeatable test database. Keep `prisma.config.ts` on the v7 API. Record exact package versions and commands in the agent handoff.
2. Add auth provider tables/migration reviewed against provider-generated Prisma schema. Implement `gyms`, `gym_operators` and unique `user_id` binding in a **pending -> active** provisioning flow; preserve account attribution after offboarding. Deny sign-in-to-gym access if no active operator. Implement AD-032 as a **private, audited platform-admin first-owner bootstrap** with a synthetic verification fixture, pending gym/owner, single-use **48-hour** email setup and guarded activation; no public self-signup or unaudited production seeding. Keep real-world evidence acceptance and operator designation behind the pre-live SOP gate.
3. Implement owner verified-email sign-in and staff username sign-in; owner-initiated invitations and staff-set passwords. Use the `EmailSender` fake/local capture in automated tests, with a future Brevo implementation behind the same interface. Test the approved **48-hour invitation** and **30-minute reset** expiries, single-use acceptance, owner authorization, invalidation/replacement on resend, and failed-send pending state. Verify staff mailbox control before setting verified status and activating access. No financial data path or payment UI required yet.
4. Add auth/session and gym-operator checks on **server handlers**; test disabled staff, invalid owner credentials, cross-gym claim, token replay, expired invitation/reset, simultaneous invite, and existing-email collisions. Introduce RLS in S-01b but verify identity resolution does not depend on unsafe broad tenant table access.
5. Run unit + Postgres integration + browser acceptance tests using synthetic identities; output changed files, exact dependency versions, verification evidence, open gates and manual test steps.

### S-01a acceptance contract

- A verified gym owner can sign in with email/password; a provisioned staff user can sign in with username/password. Each resolved actor is bound to **one active gym**; no shared accounts.
- Anonymous public sign-up cannot create either a gym owner or staff membership. Only the designated platform-admin bootstrap path can initiate a **pending first owner** after recorded verification; single-use 48-hour setup and successful verification activate exactly one owner. Pending and duplicate bootstraps never grant operational access. Owner can invite staff only into their own gym. A staff member chooses their private password through verified setup; owner never sees it.
- Sign-out, revoked/expired session, and disabled staff are rejected at the server. Staff reset can only be initiated by the authorized owner; a **30-minute single-use** reset link is delivered to the verified mailbox only once live Brevo sending is configured, or captured safely by an isolated test transport for synthetic users. Failed/delayed sends never activate staff or weaken authorization.
- Audit events identify initiator and affected account, without saving secrets. A lost response or repeated invitation/reset request cannot create duplicate active operators or unsafe reusable credentials.
- No production/staging secret, live member data, or other gym records are required to finish this slice; sensitive owner-only financial actions are **authorization-tested in S-01b** and implemented in later slices.

**Agent stop rule:** If auth-library schema behavior, email uniqueness for a multi-gym worker, initial owner-bootstrap verification/approval, or reset-token delivery cannot satisfy these invariants with approved settings, implement only the safe groundwork and surface the exact blocker. Do not silently change the product roles or invent alternate email identities.

## 16. References verified for implementation planning (2026-10-24)

- [Brevo transactional email API](https://developers.brevo.com/docs/send-a-transactional-email) and [senders/domains](https://developers.brevo.com/docs/getting-started-with-senders-and-domains) — approved delivery provider, server-side `api-key`, verified sender, API acceptance vs delivery.
- [Brevo domain authentication](https://help.brevo.com/hc/en-us/articles/12163873383186-Authenticate-your-domain-with-Brevo-Brevo-code-DKIM-DMARC), [rate limits](https://developers.brevo.com/docs/api-limits), and [Free quota](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan) — setup and operational gates.
- [Brevo no-domain authentication FAQ](https://help.brevo.com/hc/en-us/articles/17286219877778-FAQs-About-domain-authentication-Brevo-code-DKIM-DMARC) and [mailbox-sender requirements](https://help.brevo.com/hc/en-us/articles/14925263522578-Comply-with-Gmail-Yahoo-and-Microsoft-s-requirements-for-email-senders) — sending-domain ownership, DKIM/DMARC, and temporary provider sender rewriting are not substitutes for configured platform domain.
- [Better Auth custom email sending](https://better-auth.com/docs/concepts/email) — authentication-generated verification/reset links may use external delivery provider.


- [Prisma ORM release status](https://www.prisma.io/docs/orm/release-status) — v8 RC vs v7 stable as of 2026-10-23 snapshot.
- [Prisma ORM v7 transactions](https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions) — interactive `$transaction` and retry/isolation features.
- [Prisma ORM v8 transactions](https://www.prisma.io/docs/orm/fundamentals/transactions) — illustrates why major-version APIs cannot be mixed.
- [Prisma ORM v7 custom SQL migrations](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/customizing-migrations); [Prisma ORM v8 migration editing](https://www.prisma.io/docs/orm/migrations/editing-a-migration).
- [PostgreSQL row security policies](https://www.postgresql.org/docs/18/ddl-rowsecurity.html) — runtime bypass rules, default deny, `USING`/`WITH CHECK`.
- [PostgreSQL exclusion constraints](https://www.postgresql.org/docs/18/sql-createtable.html) — GiST exclusions, ranges and partial predicates.
- [NIST SP 800-63B-4 account recovery](https://pages.nist.gov/800-63-4/sp800-63b.html) — recovery methods and independent notifications (reference guidance, not a claim of compliance).
- [Prisma 7 production migrations](https://www.prisma.io/docs/orm/v7/more/best-practices) — use gated `migrate deploy` and serverless client reuse.
- [Better Auth Prisma integration](https://better-auth.com/docs/adapters/prisma) and [username login](https://better-auth.com/docs/plugins/username) — approved self-hosted authentication baseline; pin and verify compatible versions.
- [Better Auth session management](https://better-auth.com/docs/concepts/session-management) — rolling sessions, revocation, cached-session caveat.
- [Neon transaction pooling](https://neon.com/docs/connect/connection-pooling) — PgBouncer transaction mode and direct connections for migrations/backups.
- [Neon regions](https://neon.com/docs/introduction/regions) and [Vercel regions](https://vercel.com/docs/regions) — Singapore availability.
- [Neon history window](https://neon.com/docs/postgres/backup-restore/history-window) and [backup/restore](https://neon.com/docs/guides/backup-restore) — point-in-time history and snapshots; verify plan/cost.
- [Vercel environments](https://vercel.com/docs/deployments/environments) — isolate production/preview/development config.

**Rule for coding agents:** Keep this document synchronized with approved user decisions. Do not treat a recommendation as approval or invent a gym policy from an unresolved decision; implement safe invariants, record blockers, include changed files / tests / manual testing steps in every task handoff.

## 17. Zod runtime validation contract (AD-033)

**Added 2026-10-24.** This is the requested validation integration, not evidence of installed packages or working code. Inspect the repository, package manifest, lockfile and current validators first. Reuse a compatible existing Zod version; otherwise select and pin one verified stable compatible version and commit its lockfile. Do not upgrade unrelated libraries or introduce a second validation framework.

### Boundaries and schema ownership

- Validate application-owned untrusted inputs on the server: route parameters, query strings, request bodies, Server Action/FormData inputs, relevant headers (including idempotency keys), import rows and external integration payloads actually consumed. Validate configuration before its first use and fail closed with safe diagnostics. Enforce payload/file/row limits before expensive parsing; Zod does not replace transport limits or file-content checks.
- Keep feature schemas near their owning module; a small shared validation directory is appropriate for genuinely reused primitives. Paths are illustrative until the repository is inspected. Do not create a central validation engine, wrappers for every schema, or generated duplicate schema trees.
- Export browser-safe form/request schemas and inferred TypeScript types where useful. Separate raw form input from parsed domain output when conversion occurs. Client imports must never pull in database clients, secrets or server-only environment schemas. Shared code does not make client validation authoritative.
- Reuse the same business field constraints across client and server. The server parses again and uses only parsed, allowlisted values. Reject unexpected keys on application-owned mutation objects; explicitly select permitted fields from framework envelopes. Never spread raw request objects into Prisma writes. For external provider payloads, permit unrelated provider fields as needed while validating consumed fields.
- Better Auth continues to own its internal authentication protocol and token/session validation. Apply Zod to application-owned setup/invite/reset commands without rewriting auth internals, altering password policy, trimming passwords or duplicating cryptographic checks.

### Domain and integrity rules

- IDs must match the actual repository identifier format; do not assume all record IDs are UUIDs. Validate supported enums, required/optional/null semantics, bounded text, list sizes and pagination against existing product rules. Do not invent new member fields or limits as gym policy.
- Derive gym, actor, role/capabilities, verified status and authoritative plan price/duration on the server. Reject attempts to set protected fields. A syntactically valid foreign ID still requires tenant-scoped lookup and authorization; Zod cannot prove ownership or prevent races.
- Preserve integer PHP centavos. Parse a peso form string with an explicit decimal format and exact conversion; reject invalid precision, non-finite values, unsafe integers and amounts outside the approved operation. Never multiply a binary floating-point money value and round it into an accepted charge. Match the database integer width and wire representation actually used; never silently convert an unsafe bigint to Number. Compare the parsed amount with the current server charge inside the existing transaction.
- Parse timestamps with explicit timezone semantics; a date-only collection field uses the approved Asia/Manila interpretation. Reject impossible dates and ambiguous conversions. Do not change midnight starts, fixed elapsed-day durations or exclusive ends. Supported plan durations come from approved policy, not a hardcoded assumption that every plan lasts 30 days.
- Schema refinements can check static relationships. Fresh authorization, current plan state, real-funds verification, eligibility, overlap prevention, idempotency and concurrency remain server/domain/database responsibilities in their existing protected transaction. Do not replace constraints or locks with preflight validation.

### Safe failures and incremental rollout

- Use controlled parse failures at application boundaries. Map schema issues to a stable field-error/form-error result compatible with existing endpoints; preserve established HTTP conventions. Keep validation, unauthenticated/forbidden, domain conflict, unknown financial outcome and unexpected server failure distinct. Avoid account enumeration and cross-tenant existence leaks.
- Return actionable field messages without raw input, stack traces or internal schema details. Configuration errors identify only invalid/missing key names and safe reasons; never print values, database URLs or raw error objects. Keep server secrets out of browser bundles and logs.
- Inventory validation first, then migrate one coherent workflow at a time. Preserve existing contracts, normalization, idempotency fingerprints and retry behavior. Remove obsolete validators only after equivalent checks pass; do not bulk-rewrite completed slices or reset migration history.
- Verify valid cases and malformed/direct requests, unexpected protected fields, wrong types, null/empty values, oversized input, exact-money/date boundaries, safe configuration failures and accessible form recovery. Include existing restricted-role PostgreSQL/RLS, authorization, concurrency and lost-response retry regressions wherever touched. Record actual commands/results in IMPLEMENTATION_STATUS.md; documentation changes alone prove no integration coverage.

### S-04 execution integrity - approved October 25, 2026 (AD-012/013/016/017/022)

Extend append-only investigation events for owner recovery approval, recovery, linked adjustment execution and verified external settlement. Bind execution to the exact immutable proposal and owner approval; use fresh owner reauthentication/current authorization, tenant-local transactions and member locks. Unique tenant operation keys/fingerprints, one recovery per case, one executed adjustment per payment and one settlement per execution prevent duplicate effects. Preserve original payment/receipt/period history. Only the derived entitlement projection may change to explicit approved dates/disposition, guarded by an executed linked event; preserve PostgreSQL exclusion constraints. All event, financial, projection and audit writes commit or roll back together. Store exact integer centavos, opaque independent references and separate collection/entry/verification/settlement times; never store credentials or evidence uploads. Approval never completes external settlement; no external money-transfer integration. Digital cross-date checks remain unchanged. Unsupported case procedures, discretionary cancellation terms and live evidence/privacy/account-authority/hosting/recovery gates remain blocked.
