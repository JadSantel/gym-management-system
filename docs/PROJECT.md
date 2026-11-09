# Independent Gym Management System — MVP Delivery Specification

## Enrollment and Online collection revision - user approved November 7, 2026

FR-02/03/04/05/06, AC-01/04/05/06, UX-04/07/08: redesign membership assignment as Plan, Payment, Review with selectable approved fixed-term plans and a persistent full-charge summary. Cash and Online (GCash, GoTyme, MariBank) are enabled. The collecting Owner or Staff with collection permission may confirm Online only after personally checking the exact full funds in the gym's receiving account; require provider, transaction reference and explicit funds-checked attestation. A screenshot or sender claim alone remains insufficient. This narrowly supersedes cash-only retirement and designated-viewer requirements for these enrollment confirmations. The existing collection capability covers both methods; member-management permission remains required to prepare charges. No gateway, automatic bank access, pending-claim queue, account-management screen or other retired workflow is restored. Use current server verification time/date, immutable provider/reference evidence, one receipt/paid period, original-key retry, duplicate-reference denial and atomic rollback. Preserve exact centavos, automatic PHT dates, fixed 30/90/180-day terms, one paid future term, current eligibility/QR rules and server/RLS isolation. No editable start date, recurring billing, setup fees or activation toggle from the reference prototype is approved. Local synthetic implementation/verification only; live finance/operations and hosting remain separate gates.


**Signup password revision — user approved November 6, 2026 (FR-13/15 / AC-13a-f, AC-15a-f):** Members choose and confirm a private 12–128 character password during public gym-link registration, with no initial email setup step. Atomically create a member-only login and Pending profile; signup records no payment, entitlement, QR or operator authority. The member may sign in immediately to view Pending status, but only current paid eligibility permits personal QR/display/download. Leave email unverified at signup; owner/staff verified-email requirements remain unchanged. Keep optional 30-minute delivered single-use email recovery, which verifies inbox control on consumption and revokes old sessions, plus the existing paid-activation/48-hour setup path for staff-created profiles without a login. Never claim or overwrite an existing provider identity: duplicate contacts or globally reserved login email refer generically to reception. Same-request retries create no duplicate profile/account and reject a changed password without retaining plaintext passwords. This supersedes the older initial-email-setup and registration-creates-no-login clauses below only within member registration/access. No live email, real records, unattended entry or payment/access-policy change is authorized.

**Status:** Working delivery specification; conditional requirements remain gated by the decisions in Section 9.  
**Date:** 2026-11-06 (user-approved password during member registration; earlier approval dates remain recorded with each decision)
**Authority:** This document is the source of truth for current MVP requirements, approved behavior, and implementation gates. [product.md](product.md) provides aligned product context and policy references.  
**Accountable product owner:** To assign. Pilot gym owners and operational reviewers: to assign.  
**Implementation status:** S-01-S-03, supported S-04 paths, S-05, S-06 and S-07 have historical local synthetic evidence. On 2026-11-01 the user approved retiring new use of digital claims, Exceptions/investigations/corrections/refunds, outage receipts/custody, and daily closing. On 2026-11-09, new FR-11 legacy evidence entry/review was also retired. These mutation workflows are unavailable; existing records and links remain preserved for audit and relevant history, and previously approved legacy intervals remain effective through their recorded ends. Full-cash and approved Online collection, receipt retrieval, paid periods and eligibility remain supported. See [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) for exact evidence and remaining gates; this specification does not certify release readiness.

## 1. Authority, outcome, and interpretation

Deliver a focused operational system for independent gyms serving approximately 80–150 members. Owners and authorized staff record full cash membership payments, retrieve receipts and history, and determine paid access accurately. Digital collections, Exceptions, outage receipt/custody, and daily closing workflows are retired as of 2026-11-01. Their historical records remain preserved and readable where linked to member/payment history.

### Approved scope revision — 2026-11-01

The user approved retirement of digital claims, Exceptions, outage receipts/custody, and daily closing on 2026-11-01; the November 7 revision enables bounded Online confirmations; the November 9 revision retires new FR-11 legacy entry/review. This supersedes active use of FR-04 and FR-07 through FR-11 and the related legacy, investigation, outage, and closing mutation workflows. Their identifiers, accepted decisions, SOPs, schema, and records remain as historical context; no existing financial or operational record may be deleted or rewritten. New writes and edits through retired APIs must be rejected. Previously approved historical entitlements remain effective through their recorded end. No emergency procedure outside the CRM is implied or approved here. Any such procedure requires a separate operational decision. Historical payment methods and member/payment links remain visible for audit.

### Approved registration and attendance extension — 2026-11-02

**Member dashboard correction — user approved November 3, 2026 (FR-15 / AC-15a-f):** The user explicitly selected member login and a private My Gym QR dashboard as well as a separate registration page. This supersedes the earlier member-login/portal deferral below within this bounded correction. (a) `/join/[code]`, `/member/login`, `/member/setup` and protected `/member` use a member-only layout without CRM navigation, operator account menus or operator clock, including when an operator session exists. CRM URLs and server permissions remain unchanged. (b) Reuse Better Auth users, password hashing and sessions, with a separate gym-scoped member-account binding and no Operator record/capability. One identity cannot hold both member and operator bindings. Resolve only the signed-in member's own profile, current eligibility and QR; ignore no client-selected account/member/gym authority. (c) Full verified cash activation creates a random persistent attendance credential atomically if the newly paid interval is currently effective and no current credential exists. Pending registration creates neither a login nor a QR. Reads, downloads and renewals retain the credential; explicit staff replacement revokes it. (d) Member-management staff may issue a private member email setup link after activation; reuse existing verified-email/password setup semantics with a hashed, 48-hour, single-use/replaced link. Recovery is a hashed, 30-minute, single-use link to the verified login email, with generic public responses and session revocation after password changes. Contact edits do not silently change verified login identity. Synthetic email capture only; no live email provisioning. (e) A member may sign in after expiry to view status/recover login, but only current paid eligibility displays an operational QR/download. Downloaded PNG remains locally viewable; scanner always rechecks eligibility. Disabled account/gym denies existing member sessions immediately. (f) Preserve FR-13/14 input/RLS/payment/concurrency and eight-second camera/scan controls, including checkout after expiry for an already-open visit. This correction adds no birthdate collection, suspension policy, unattended kiosk, live records or hosted access; those require their own defined scope. Verify provider/operator regression, member-to-member/operator denials, setup/recovery replay/expiry/delivery, no unpaid QR, automatic issuance/download decode and both-theme responsive member pages.

The user's supplied implementation brief authorizes FR-13/14 below. These specific flows supersede earlier deferrals of public member registration, contact fields and basic QR attendance. Operator signup, member login/portal, birthdate, suspended-member features, email delivery, unattended kiosks and offline queues remain excluded. Cash-only finance and all retired-workflow denials remain unchanged. Initial delivery is local/synthetic; public/hosted access and physical devices require separate evidence. Deliver **two engineering tasks**, with a GitHub checkpoint after each: (1) registration through existing cash activation; (2) personal QR issuance, attendance and audited visit corrections. Do not implement task 2 before resumption after task 1's checkpoint.

**FR-13 / AC-13a–f — Registration through cash activation.** An active gym-specific `/join/[code]` resolves the gym on the server. Require normalized name, email and Philippine mobile (`09` or `+639`); contacts remain unverified. Immediately save a Pending profile, with public-registration provenance and no invented staff creator, payment or entitlement. Matching email **or** phone within the gym blocks another profile and directs the visitor to reception without exposing records. Preserve name-only members/staff creation; member-management authority may optionally enter/edit contacts. Add nullable contacts and gym-scoped uniqueness without rewriting history. Bound request bodies, validate strict allowlists, check origins, rate-limit anonymous traffic independently of operators, and replay identical request IDs without another write. Expired/replaced links deny submissions; anonymous callers cannot read/update members or create operators. Registration-link creation/replacement uses member-management authority; links expire after 30 elapsed days and replacement invalidates the prior link. This bounded local implementation choice is visible to staff. Continue using the existing full-cash charge/payment/receipt/eligibility flow for activation.

**FR-14 / AC-14a–h — Personal QR and attendance (task 2).** Eligible members can receive/download/print a random opaque personal QR without paying again. It contains no contacts or membership claims, survives renewals and is replaceable by member-management staff with immediate revocation. `/attendance` has Manila-today default, date/member filters, All visits / Currently in gym / Missing checkout and paginated arrivals/departures. `/attendance/scanner` supports QR keyboard input and local camera decoding using pinned, registry-verified `qrcode` / `@zxing/browser`. All handling, scanning, history and corrections use member-management authority. Server eligibility permits OUT→IN; an existing IN visit can check OUT after expiry. Serialize by member; suppress repeats across devices for eight seconds; replay request IDs without toggling. Cameras require code departure before rearming and stop tracks on leaving. At Manila midnight an unclosed visit becomes Missing checkout with no fabricated departure; the next day's first scan creates a new visit, consistently derived on reads/writes without a scheduled job. Staff may void or correct an existing visit with a reason; preserve original events/actor/change, reject future/reversed/overlapping/conflicting times. Entirely missed historical visits are excluded. Network uncertainty says “not confirmed” and retries the same request; no offline queue. Enforce tenant RLS, consistent references and one open visit per member. Add Attendance navigation and Scanner action only with this implemented task. A personal QR identifies a record; staff confirms the presenter.

**Attendance presentation update — user approved November 3, 2026:** Preserve sidebar navigation. `/attendance` adds shadcn cards for Checked in today, Inside now and Checked out; `chart-bar-default` for peak simultaneous recorded occupancy per Manila hour today; member search and All / Inside / Finished status buttons; a Member name / Time In / Time Out / Duration / Status table; and reference-style 10 (page default) / 20 / 30 row pagination with first/previous/next/last controls. This supersedes the original page's fixed 20-row presentation above; API callers omitting page size retain 20. Daily totals/chart remain independent of history filters and pages. Finished means nonvoided visits with recorded departure. Missing checkout filtering stays in the date panel; voided and missing-checkout records remain explicit in All. Original events and audited correction/void controls remain in visit details. Ongoing duration uses the server read time; missing-checkout duration remains unknown. Exclude voided visits from totals and never extrapolate future occupancy or invent departures. No change to attendance writes, permissions, payment or entitlement.

**Verification:** AC-13 requires contact/duplicate races, repeated submissions, expired links, malformed/protected inputs, anonymous/revoked/cross-tenant denials, restricted-role RLS and existing cash regression. AC-14 requires simultaneous/alternating scans, eight-second boundaries/retries, exact expiry/renewal/revocation, Manila midnight/missing checkout and audited corrections. Both require sequential overlapping-fixture DB/HTTP/browser checks, typecheck/lint/build, accessible keyboard/errors and Light/Dark desktop/tablet/phone review. QR decoding is executable evidence; real scanners/cameras/phone HTTPS and hosted signup remain separate unverified gates. Preserve current runtime restrictions.

**Task 2 implementation contract:** resume after task 1 checkpoint `627455a`. The existing member row lock serializes issuance, scans and corrections. An unclosed past-Manila-day visit is read as Missing checkout; the next write retires its open projection without writing a departure before creating today's visit. The database permits one open projection per member and excludes overlapping nonvoided visits; an unclosed interval extends to its arrival day's midnight for overlap checks. Recorded departures may cross midnight when corrected from evidence, subject to overlap checks. Corrections require the current revision and a reason. Already committed request-ID retries return their original result after authorization, including after later QR replacement; they perform no new scan. New requests with an old QR are denied. Eight-second suppression also spans midnight; the first accepted scan of the new day starts its own visit. Original events and retry outcomes remain immutable. These are local implementation controls for FR-14, not live or device readiness evidence.

This document governs current MVP policy and delivery requirements. If a conflict with `product.md` appears, follow this specification and synchronize the product definition before implementing the affected behavior. New business policies still require an explicit recorded decision. Discovery estimates remain unverified, and pilot targets remain hypotheses.

Requirements use these classifications:

- **Policy:** Derived from agreed BR rules, approved Section 6.1a clarifications, or decisions D-01 through D-08 in the source.
- **Proposed control:** A concrete implementation requirement derived from PR-01 through PR-10, source minimum capabilities, or integrity/security needs. Included in the delivery plan for validation; not represented as an already approved gym policy.
- **Conditional:** Depends on a remaining operational decision. Implement and test settled invariants now; do not enable the affected production behavior until the stated decision has a recorded answer.

BR, PR, D, and O identifiers refer to `product.md`. US, FR, AC, and S identifiers are local to this document. No framework, database, hosting service, payment provider integration, or delivery estimate is selected here.

## 2. MVP boundaries and deliverables

### Included

| Deliverable | Minimum usable result | Requirement group |
|---|---|---|
| Individual owner/staff access | Authenticated operators, explicit authority, attributable actions | FR-01 |
| Member and plan records | Search/create member, show paid periods and status, owner-controlled exact prices | FR-02 |
| Full-payment collection | Full cash only; retrievable receipt/reference | FR-03 |
| Membership lifecycle | Approved fixed 30/90/180-day periods, advance and late renewal, reliable eligibility check | FR-05, FR-06 |
| Historical financial/operational evidence | Preserve existing digital, investigation/correction/refund, outage/custody, and closing records and their member/payment links; show relevant history read-only | Retired FR-04, FR-07–10 |
| Verified migration | Retired 2026-11-09; preserve existing records and previously approved entitlement intervals read-only | FR-11 |
| Pilot evidence | Future cash-only collection, receipt/history and eligibility measures; revise O-09 before use | FR-12 |

**O-07 approved by the user on 2026-10-24:** Monthly — **₱800 / 30 elapsed days**; 3 Months — **₱2,100 / 90 elapsed days**; 6 Months — **₱4,000 / 180 elapsed days**. Each day is exactly 24 hours; none uses calendar-month arithmetic. These initial catalogue prices remain owner-controlled for later changes, preserving historical snapshots. No other duration, promotion, discount, guest pass, or grandfathered contract is approved.

### Excluded

- Partial membership payments, installments, membership receivables, debt collection, and payment plans.
- Class booking, personal-training schedules, inventory, equipment management, and public booking.
- Marketing CRM, referral campaigns, loyalty, lead funnels, and mass messaging.
- Advanced attendance analytics, biometric entry, turnstiles, and hardware automation.
- Member self-service portal or mobile app.
- Multi-branch/franchise administration and complex financial accounting.
- Automated payment gateway or POS integration. Any future non-cash collection requires a separate explicit scope and policy decision; evidence alone does not re-enable digital collection.
- Automated renewal reminders until need and communication preferences are validated.
- Fully offline digital capture, local-first synchronization, device-to-device synchronization, and automatic offline membership activation.

Basic eligibility checks are included; a comprehensive attendance product is not. Incident evidence for the retired workflows remains historical and read-only.

The 2026-11-01 retirement is a user-approved scope revision. Do not re-enable retired workflows without new explicit authorization. Preserve historical policy documents as superseded context. No CRM emergency fallback is defined by this revision.

## 3. User stories and traceability

| ID | User story | Deliverable / acceptance | Source |
|---|---|---|---|
| US-01 | As an owner, I can give each operator only the authority needed so collections and sensitive actions remain attributable. | FR-01; AC-01a–c | BR-04, BR-15, BR-19; Section 6.1a.4 |
| US-02 | As an operator, I can find or create a member and show the exact plan price before collecting funds. | FR-02; AC-02a–c | BR-18; Section 8 |
| US-03 | As a collector, I can record a full cash payment once and provide a durable reference so the member's payment is recognized. | FR-03; AC-03a–d | BR-01–04; PR-01–04 |
| US-04 | Retired 2026-11-01: digital collection/verification is no longer supported. | Historical FR-04; read-only records retained | BR-08, BR-14 remain historical context |
| US-05 | As a collector, I can renew early without losing paid time or renew after expiry from the correct payment date. | FR-05; AC-05a–e | BR-02, BR-07, BR-12–13; Section 6.1a.1, .6 |
| US-06 | As front-desk staff, I can quickly distinguish active, scheduled, unpaid, and expired cases before admission. | FR-06; AC-06a–b | BR-06; Section 6.3 |
| US-07 | Retired 2026-11-01: claim investigation and omitted-payment recovery are no longer supported; historical records remain readable. | Historical FR-07; mutation denied | BR-05, BR-19 remain historical context |
| US-08 | Retired 2026-11-01: corrections/refunds are no longer supported; original and linked historical records remain readable. | Historical FR-08; mutation denied | BR-09, BR-15 remain historical context |
| US-09 | Retired 2026-11-01: outage receipt/custody workflow is no longer supported; existing records remain preserved. | Historical FR-09; mutation denied | BR-10–11, BR-16 remain historical context |
| US-10 | Retired 2026-11-01: in-app daily closing is no longer supported; existing closing records remain preserved. | Historical FR-10; mutation denied | BR-17; PR-06; Appendix C remain historical context |
| US-11 | Retired 2026-11-09: new historical evidence entry and review are unavailable; existing records remain readable and approved intervals remain effective until their recorded end. | Historical FR-11; mutation denied | BR-18; O-08 remain historical context |
| US-12 | Future pilot reviewers can measure cash collection accuracy, receipt/history retrieval, recording delay, and eligibility under revised O-09. | FR-12; AC-12a–c | Sections 7, 10; O-09 |

Gym members benefit from accurate dates and retrievable payment confirmation. They do not require an application login in this MVP.

## 4. Permission rules

Owner and staff are the two product roles. Staff capabilities below are explicit authorizations, not additional business roles. Owners and authorized staff may record full cash and retrieve relevant member/payment history. Capabilities and APIs for retired workflows confer no permission to write; direct requests are rejected regardless of role.

| Action | Owner | Staff | Basis / restriction |
|---|---|---|---|
| Search/create members; inspect eligibility and relevant payment history | Yes | Authorized operational staff | Source minimum capabilities; proposed least-privilege boundary |
| Set plan prices and supported plan definitions | Yes | No | Owner-controlled pricing, BR-18 |
| Accept and confirm full cash collection | Yes | Authorized collectors | Actual collector must be recorded, BR-04 |
| Create or verify a digital payment claim | No | No | Retired 2026-11-01; historical records are read-only |
| Record a paid early/late renewal | Yes | Authorized collectors, subject to verification authority | BR-02, BR-07, BR-12 |
| Create or alter investigation/correction/refund records | No | No | Retired 2026-11-01; preserved historical records are read-only |
| Create or alter outage receipt, custody, or provisional access records | No | No | Retired 2026-11-01; preserved historical records are read-only |
| Create or alter daily closing records or approvals | No | No | Retired 2026-11-01; preserved historical records are read-only |
| Enter or approve imported historical entitlement | No | No | Retired 2026-11-09; route and runtime database inserts denied; retained records are read-only and existing approved intervals remain effective through their recorded end |
| Assign/revoke operator capabilities | Proposed owner-only administration | No | Implementation control; validate pilot responsibility |
| Silently overwrite/delete confirmed financial or retained operational history | No | No | Original records and historical links remain preserved |

Permission checks apply to each underlying operation, including direct requests; hiding a button is insufficient. Back-entry records the actual collector separately from the authenticated entrant and verifier. Shared accounts cannot satisfy collector attribution. Members and unauthenticated users have no operational access.

## 5. Functional requirements and acceptance criteria

### FR-01 — Operator identity and authorization

**Classification:** Policy-derived attribution/authority; proposed access controls. **Sources:** BR-04, BR-15, BR-19; PR-05; Section 6.1a.4–5.

Provide individual authentication and explicit capabilities from Section 4. Attribute records to authenticated actors, with separate collector/entrant/verifier fields where the workflow requires them. Prevent staff from changing confirmed financial history through any entry point.

- **AC-01a:** Given an authenticated collector, when they confirm a cash payment, then the transaction and history identify that collector; a back-entry also identifies the different entrant when applicable.
- **AC-01b:** Given any operator, when they attempt to alter a confirmed payment or linked history through an ordinary endpoint, then the operation is rejected and financial/access records remain unchanged.
- **AC-01c:** Given an operator who calls a retired digital, investigation/correction/refund, outage/custody, or closing API, then the request returns the documented retired response and changes no records.

### FR-02 — Members, plans, and exact charges

**Classification:** Policy for owner-controlled prices; proposed member/charge controls; conditional supported plan set. **Sources:** BR-18; Sections 5, 8; O-07.

Search/create members, associate their transaction history and paid periods, and show the selected plan's duration, full price, and intended period before collection. Define only necessary member fields after operational validation. Preserve the charged plan/price/duration on historical transactions so later plan changes do not rewrite history. Staff cannot introduce ad hoc prices or discounts.

- **AC-02a:** Given a selected member and plan, when preparing a join/renewal, then the operator sees the full cash charge and proposed period before confirming payment.
- **AC-02b:** Given a prior confirmed payment, when the owner changes the plan price for later sales, then its historical amount, receipt, and paid period remain unchanged.
- **AC-02c:** Given staff or an unsupported plan/discount request, when attempting to change pricing or sell an unapproved duration, then the action is blocked; the approved O-07 catalogue is not silently replaced by an unsupported plan, discount or duration.

### FR-03 — Full-payment recording and confirmation

**Classification:** Policy for full payment; proposed durable records and duplicate/failure controls. **Sources:** BR-01–04; PR-01–04; Sections 5, 6.3.

Confirm a membership charge only when the entire required amount has been received in cash by an authorized collector. Reject non-cash methods and short payments without posting a partial membership payment, installment balance, or entitlement. Ordinary online cash confirmation creates a unique ID/reference, member, plan/charge snapshot, full amount, CASH method, actual collector, collection and entry times, and linked paid period/receipt. The confirmation and relevant member/payment history remain retrievable. Digital, recovery, correction/refund, outage, and closing workflows are retired under the 2026-11-01 scope revision; any related old record stays read-only.

- **AC-03a:** Given a required charge of 1,000 and verified receipt of 900, when confirmation is attempted, then no confirmed membership payment, debt balance, or paid period is created. The operator receives a clear full-payment requirement.
- **AC-03b:** Given the full verified cash amount and an authorized collector, when confirmation succeeds, then one confirmed transaction, its linked period, and retrievable reference exist; history shows the actor, amount, method, and timestamps.
- **AC-03c:** Given a successful request whose response was lost, when the same request is retried or concurrently repeated, then it returns/references the existing result without a second collection record or period. A new real collection is handled separately and is not discarded merely because its amount matches.
- **AC-03d:** Given failure during confirmation, then the operation cannot leave a spendable paid period without its confirmed payment or an apparently completed payment with its required linked period missing. Recovery/retry has a determinate result. Reopening the reference retrieves that same result.

### FR-04 — Digital collections (RETIRED 2026-11-01)

Digital claims and verification are no longer supported. No role may create, verify, flag, or otherwise mutate digital collection records through the CRM. Existing claims and payments remain preserved and readable as historical evidence. Requests to the former mutation APIs must be rejected without writes. The 2026-10-25 S-03 local design approval and O-04 verifier decisions are retained as historical context and no longer authorize current operations.

- **AC-04a:** A former digital collection mutation route/API is unavailable or rejects the request; persisted historical records remain unchanged.
- **AC-04b:** Relevant prior digital payment/claim information remains retrievable in read-only member/payment history.

### FR-05 — Membership periods and renewal

**Classification:** Policy; conditional start convention and unsupported cases. **Sources:** BR-02, BR-07, BR-12–13; PR-07; Section 6.1a.1, .6; O-01, O-07.

Use the gym's local timezone (Asia/Manila for the Philippines pilot) for display. The approved MVP monthly-labeled plan lasts **exactly 30 consecutive 24-hour days**. Store/evaluate start-inclusive, end-exclusive intervals: eligible at start and ineligible at end unless an adjacent verified paid interval applies. Compute the end as start plus 30 elapsed days, **not** calendar-month advancement or end-of-month clamping. A new membership or late renewal starts at **00:00 Asia/Manila on the local date of the verified full cash payment**. The previously approved original-date rule for offline cash renewal is historical; the retired outage workflow does not authorize offline renewal or back-entry. A payment received later in the day therefore yields less than 30 × 24 hours of prospective access; the term still spans exactly 30 midnight-to-midnight days.

For an active member, show actual expiry and remaining active days, recommend optional advance renewal, preserve current access, and schedule the paid next term at the current term's exact end. For an expired member, a newly confirmed full-cash payment starts on its local collection date. Preserve all timestamps. A queued future paid period is not an unpaid renewal or receivable.

The midnight effective-start convention is approved. **S-02 decisions approved by the user, 2026-10-25:** show exact PHT expiry plus remaining whole 24-hour days and whole hours, rounded down at the displayed server check time; show “less than 1 hour” below one hour. Show remaining time only for the current active paid period, separately from any scheduled term. Allow one queued paid advance term; block another sale until that term starts. Same-key recovery of an already confirmed payment remains available. No overlapping periods are permitted.

- **AC-05a:** Given a 30-day membership beginning at 2027-01-31 00:00 Asia/Manila, its end is 2027-03-02 00:00; given a start at 2028-01-31 00:00, its end is 2028-03-01 00:00. A start on 2027-04-15 00:00 ends 2027-05-15 00:00. These are fixed elapsed durations, not calendar-month billing anniversaries. A full payment at 18:30 on the start date still uses 00:00 that date as the effective start.
- **AC-05b:** Given a current interval ending at boundary E and one paid advance renewal, then the new interval starts exactly at E, current access is preserved, and both sides of E have the correct eligibility with no gap/overlap. Remaining days/expiry are visible before collection.
- **AC-05c:** Given an expired membership and an online payment confirmed on local date D, then the new term starts at 00:00 Asia/Manila on D, never on the old expiration date.
- **AC-05d:** Given an ordinary full-cash payment confirmed on local date D, then the new or late term starts at 00:00 Asia/Manila on D and stored collection/entry timestamps reflect their actual events.
- **AC-05e:** Given only a proposed renewal or unconfirmed payment, then no future paid period is created. Given an already queued paid term, another advance sale is blocked until that term starts; committed same-key recovery still returns the original result.

### FR-06 — Eligibility and basic check-in

**Classification:** Policy for eligibility; proposed status presentation/evidence. **Sources:** BR-06, BR-11; Sections 6.3, 8; Section 6.1a.2.

Show whether a fully paid, currently effective period exists and its expiry. Distinguish scheduled future access and expired/no verified access. Historical digital claims and provisional outage visits do not establish normal eligibility. Existing verified active access is not changed merely because retained historical evidence exists.

- **AC-06a:** Given a valid interval [S, E), then the member is eligible at S and immediately before E; at E they are ineligible unless another verified interval begins there.
- **AC-06b:** Given only a future paid term, expired term, unresolved claim, or pending payment, then normal eligibility is denied with a clear reason. A separate active verified term still qualifies.
- **AC-06c:** Given a retained historical outage visit, then it remains visible as historical evidence and does not create or extend ordinary membership eligibility.

### FR-07 — Investigations and omitted-payment recovery (RETIRED 2026-11-01)

No role may create or mutate claims, investigations, evidence, omitted-payment recoveries, or linked paid periods through the CRM. Existing case/event data and payment/member links remain preserved and read-only. The October 25, 2026 O-05/S-04 decisions remain historical context and no longer authorize new actions.

- **AC-07a:** Former investigation and recovery mutation routes/APIs reject requests without database changes.
- **AC-07b:** Existing case/evidence/payment links remain readable in relevant member/payment history.

### FR-08 — Corrections, reversals, and refunds (RETIRED 2026-11-01)

No role may request, approve, execute, or otherwise mutate a correction, reversal, refund, or related access outcome through the CRM. Existing original and linked adjustment/refund/settlement records remain preserved and read-only. O-03 and the October 25, 2026 S-04 execution contract remain historical context; neither authorizes current operations.

- **AC-08a:** Former correction/refund mutation routes/APIs reject requests without changing original payments, periods, receipts, or adjustment records.
- **AC-08b:** Existing original and linked historical financial records remain retrievable from relevant member/payment history.

### FR-09 — Outage receipt and custody workflow (RETIRED 2026-11-01)

The CRM no longer supports offline/outage receipt issuance, provisional access, back-entry, custody, handover, or recovery. No in-CRM or outside-CRM emergency process is defined by this specification. Existing outage and custody records remain preserved and read-only. O-02/O-06 and the October 25, 2026 S-05 policy remain historical context.

- **AC-09a:** Former outage/custody mutation routes/APIs reject requests without database changes.
- **AC-09b:** Historical outage/payment links remain readable; they do not create or extend ordinary eligibility.

### FR-10 — Daily closing (RETIRED 2026-11-01)

The CRM no longer supports daily reconciliation, closing snapshots/supplements, differences, or closing approvals. No replacement CRM workflow is defined. Existing closing records remain preserved and read-only. The October 25, 2026 local S-06 decisions and closing SOP remain historical context and do not direct current operations.

- **AC-10a:** Former closing mutation routes/APIs reject requests without database changes.
- **AC-10b:** Existing closing records remain preserved and are not represented as a current reconciliation result.

### FR-11 — Verified legacy onboarding (RETIRED 2026-11-09)

**Classification:** Historical migration policy; retired by user authorization on 2026-11-09. **Sources:** BR-18; O-08; Section 9 risks.

No new legacy proposals, reviews, decisions, or entitlements may be entered. Preserve all existing legacy records and decisions as read-only history. Previously approved historical intervals continue to determine eligibility over their exact recorded `[startsAt, endsAt)` interval; retirement does not revoke or rewrite them. New eligibility must come from supported confirmed payments. Historical records remain distinct from new collections, and no payment, receipt, or balance is fabricated.

- **AC-11a:** Legacy entry/review API methods return HTTP 410 and the runtime database role cannot insert `legacy_records`; these denials create no record or entitlement.
- **AC-11b:** Existing approved intervals remain eligible only during their recorded half-open interval; existing uncertain or unresolved records grant no access. All retained legacy records and decisions remain immutable and readable.
- **AC-11c:** Existing historical records remain distinguishable from current payments and remain excluded from new-collection counts. No new legacy records can be added through the CRM.

### FR-12 — Cash-only pilot measurement and operational evidence

**Classification:** Proposed measurement deliverable; conditional pilot protocol. **Sources:** Sections 3, 7, 10; Appendix A; O-09.

Before any future pilot, revise O-09 for the currently supported cash-only scope. A manual worksheet is acceptable where reliable. Define independent cash collection denominators, receipt retrieval/history checks, recording delay and eligibility observations. Preserve actual collection, system entry and receipt timestamps. No CRM closing-time, investigation, outage, digital verification or exception measure is current scope. There is no active pilot under this scope revision.

- **AC-12a:** Given a full-cash collection and later CRM entry, then any approved future measure uses actual event times and never backdates entry.
- **AC-12b:** Given an approved cash-only reporting period, then reviewers can reproduce independently supported cash denominators, receipt/history results and eligibility observations under revised O-09 definitions.
- **AC-12c:** Given missing independent evidence, unknown denominators or missing observations, then the report exposes those limits and makes no validated improvement claim.

## 6. Record model and integrity contract

These are conceptual records and required relationships, not a prescribed database schema. Lifecycle labels are proposed controls; they must preserve the product distinctions even if implementation naming differs.

| Record | Minimum information / relationship |
|---|---|
| Operator and authority | Identity, owner/staff role, granted capabilities, account-verification authorization; attributable changes |
| Member | Stable identity, validated search/display fields, linked periods, payments, cases; personal-field scope to confirm |
| Plan / charge snapshot | Approved duration and price; historical charge terms independent of later catalog changes |
| Payment | Unique ID, full charge/method, member, collector, collection/entry/verification times, verifier, receipt/reference, confirmation state, linked period/case |
| Membership period | Start/end, timezone convention, linked confirmed payment or verified migration provenance; correction/access decisions retained |
| Historical receipt / custody | Preserve any existing controlled number/booklet, custody, handover, issuance, and recovery records as read-only historical evidence; no new records |
| Historical provisional visit | Preserve existing member/visit/receipt/outage links as read-only; never treat as ordinary membership entitlement |
| Historical exception / claim | Preserve existing case/evidence/payment/receipt links, reviewer, reasoning, outcome and linked events as read-only |
| Historical correction / refund | Preserve original transaction links, approvals, evidence, amounts, settlements and access outcomes as read-only |
| Historical reconciliation | Preserve existing cutoff, totals, differences, source records, approvals and snapshots as read-only; do not imply a current close |
| Migration evidence | Source, reviewed historical period, verifier/sign-off, uncertainty flags, pilot cutoff classification |

### Status vocabulary — do not combine unrelated dimensions

| Dimension | Controlled terms | Rules |
|---|---|---|
| Payment | Confirmed cash for new ordinary collection; historical methods/states retained | New ordinary CRM payments are CASH only. Historical records remain immutable and readable. |
| Membership period | Scheduled; Active; Expired; Adjusted/terminated | Scheduled means **fully paid** but not yet effective. An incomplete purchase has no paid period. |
| Historical admission evidence | Existing eligible/not-eligible/provisional context | Historical provisional access never creates current entitlement; new outage exception workflow is retired. |
| Historical case state | Existing case status retained | Cases are read-only historical records; no new progress or resolution writes. |

Display these dimensions independently. Do not treat “pending renewal” as a partly paid membership: use **uncompleted purchase request** for an unpaid transaction and **scheduled paid period** for a fully paid advance renewal. These product terms do not prescribe a database enum.

Required distinctions:

1. **New payment:** Only ordinary full cash collection is supported. Digital claims and verification are retired; existing states remain read-only.
2. **Historical financial evidence:** Preserve original payments, linked periods/receipts and any existing corrective events. The CRM exposes no correction/refund mutation.
3. **Paid period:** Scheduled before its start, active within [start, end), expired at end. Existing access history remains readable and no retired workflow may alter it.
4. **Retired workflow records:** Existing cases, outage/custody events and closings are read-only; their existence does not imply the workflow remains available.
5. **Collection vs. entry:** Retain ordinary cash collector, collection, entry and receipt attribution. Preserve historical verification/issuance fields without enabling new workflow writes.

Proposed implementation controls across all slices:

- A confirmation and its required financial/period links succeed together or recover consistently; retries and concurrent actions cannot duplicate the same operation.
- Enforce repeated-action safety for ordinary cash collection. Retired workflow APIs must not perform writes.
- Enforce permissions on the trusted execution path. Keep an attributable history of sensitive approved actions and preserve original financial facts.
- Restrict evidence access, avoid unnecessary sensitive data, and store no banking login credentials. Evidence retention/access and backup/restore procedures require pilot readiness decisions in Section 9.
- Present ordinary cash confirmation and scheduled/active/expired paid periods clearly. Historical pending, provisional, and unresolved records must be labeled historical; never imply they are actionable or grant current membership access.

## 7. Historical reason-specific correction and refund matrix — superseded 2026-11-01

The following approved policy matrix is retained as historical context only. The user retired all CRM investigation, correction and refund operations on 2026-11-01. It does not authorize current actions. Existing original and linked records remain preserved and read-only. Do not delete this historic decision record.

October 25, 2026 approval: the narrow full duplicate-excess refund below is permitted. Discretionary cancellation eligibility and amounts remain blocked until each pilot gym approves written terms for before-use and partial-use cases, evidence and access disposition. No prorating formula is implied.

| Case | Required investigation and money handling | Required access decision | Gate |
|---|---|---|---|
| Duplicate record, one actual collection | Prove one collection; owner links reversal of duplicate ledger record; no refund of funds never collected twice | Identify the valid entitlement and explicitly decide duplicate-period disposition | Independent proof of one collection; owner-approved explicit access disposition |
| Two actual collections | Independently verify both actual collections, same obligation and unintended excess; owner approves the exact full refundable excess and method | Explicitly identify retained/affected periods and stays/ends/adjusts outcome | Approved October 25, 2026; verify actual external settlement separately before completion. Legitimate second purchases are not duplicates |
| Incorrect entry | Independently evidenced owner-approved linked correction; zero money movement supported under October 25, 2026 approval; preserve originals | Explicit stays/ends/adjusts outcome and effective date; adjusted dates must be specified | Amount-changing/funds-moving corrections beyond the narrow excess refund remain conditional |
| Cancellation before use | Determine eligibility and amount under written gym terms; record approved refund and settlement evidence | Explicit outcome and effective date | O-03: written cancellation/refund policy |
| Cancellation after some use | Establish usage evidence and applicable written terms; no invented prorating formula | Explicit outcome and effective date | O-03: written used-membership policy |
| Payment reversal / funds absent | Verify receiving-account facts; owner approves linked zero-movement correction; preserve original and review trail | Owner explicitly decides stays/ends/adjusts and effective time; no automatic access revocation | October 25, 2026 no-movement execution supported; actual funds movement beyond the narrow excess refund remains conditional |

For every row, staff may gather evidence and submit a request; only the owner approves/executes an alteration of confirmed finances. Actual refund completion is distinct from approval and must be recorded; automatic bank/GCash refund execution is outside scope. If a required case policy is unset, retain/escalate the case and block discretionary execution rather than selecting a default.

## 8. Vertical implementation slices

Each slice delivers a demonstrable operator journey across interface, authorization, stored records, and relevant evidence. Do not split the plan into isolated frontend/backend/database phases. Every slice inherits applicable integrity controls and acceptance criteria; no slice is a standalone permission to run a live gym before pilot gates are met.

| Slice | End-to-end deliverable | Depends on | Exit demonstration and verification | Decision gate |
|---|---|---|---|---|
| S-01 — First verified cash membership | Individual owner/staff access; approved owner-priced plans; member search/create; exact charge; full cash confirmation; receipt/history; current eligibility | None | Demonstrate US-01–03 and first membership eligibility; pass AC-01a–b, AC-02a–c, AC-03a–d and applicable AC-06a–b, including short payment and lost-response retry | O-07 resolved; initial capability assignments |
| S-02 — Renewal without lost time | Early/late cash renewal, expiry/remaining-time display, adjacent periods, distinct uncompleted-request versus scheduled-paid-period status | S-01 | Demonstrate US-05–06; pass AC-05a–c, AC-05e, AC-06a–b; check 30-day boundaries across leap years and month ends, exact expiry and concurrent duplicate renewal requests | Display rounding and one-queued-term rule approved 2026-10-25; verify implementation and acceptance |
| S-03 — Verified digital collection | **RETIRED 2026-11-01.** Historical local acceptance only; no current digital collection writes. | Historical S-01, S-02 | Current acceptance is retired-route/API denial plus retained read-only history | O-04 is superseded for current operations; preserve historical decision |
| S-04 — Evidence-backed discrepancy resolution | **RETIRED 2026-11-01.** Historical local acceptance only; no current investigation/recovery/correction/refund writes. | Historical S-01–03 | Current acceptance is retired-route/API denial plus retained read-only history | O-03/O-05 decisions remain historical context; preserve records |
| S-05 — Recover an outage shift | **RETIRED 2026-11-01.** Historical local acceptance only; no CRM outage/custody/provisional visit writes. | Historical S-01–04 | Current acceptance is retired-route/API denial plus preserved history | O-02/O-06 and the S-05 SOP remain superseded context |
| S-06 — Close a business day | **RETIRED 2026-11-01.** Historical local acceptance only; no CRM closing writes. | Historical S-01–05 | Current acceptance is retired-route/API denial plus preserved history | Local closing decisions/SOP remain superseded context |
| S-07 — Onboard and evaluate a pilot | Historical milestone evidence only; FR-11 legacy entry/review retired 2026-11-09. Existing history and approved intervals remain read-only/effective; no current pilot authorized. | S-01–02 | FR-11 acceptance is retired-route denial, database insert denial, preserved history, and retained interval eligibility. FR-12 remains a historical archive; any future pilot requires revised O-09 and separate readiness approval. | O-08 superseded; revised O-09; security/data stewardship and release readiness |

### S-01 engineering task breakdown (same business milestone)

Each task is small enough for an individual coding-agent prompt, but **S-01 is not complete or safe for live use until its integrated acceptance criteria pass**.

| Task | Small deliverable | Target verification |
|---|---|---|
| S-01a — Operator identity | Individual owner/staff sign-in, identifiable actor, deny unauthenticated requests | FR-01 authentication and actor attribution tests |
| S-01b — Capability enforcement | Owner-controlled capabilities; cash collection permitted only to authorized actors; deny staff corrections | AC-01a–b; direct-request denial, not only hidden UI controls |
| S-01c — Member directory | Find/create member with minimum validated fields and stable identity | FR-02 member search/create and duplicates review |
| S-01d — Approved plan/charge | Owner maintains approved plan and exact full price; immutable price snapshot before sale | AC-02a–c; changing current catalog does not rewrite an old sale |
| S-01e — Cash confirmation engine | Full-only cash confirmation with immutable payment reference, atomic paid-period linkage, idempotent retry | AC-03a–d; short payment, failed writes, lost response, concurrent retry |
| S-01f — Receipt and history | Retrievable receipt and attributable member payment history | AC-03b–d; collector, amount, method, timestamp and linked period visible |
| S-01g — Eligibility and end-to-end demo | Compute status from confirmed 30/90/180-day plan interval; owner/staff complete join → full cash → receipt → access check | AC-06a–b and complete S-01 acceptance suite, including expiry boundary |

All tasks may use synthetic data. Tasks S-01e–g use the approved 00:00 Asia/Manila effective-start convention; remaining-day display rounding must not overstate eligibility. Keep nonessential features out of S-01.

S-03 through S-06 are retired for new use by the user-approved 2026-11-01 scope revision. Their historical local evidence and policy decisions remain in the ledger and source documents. Do not infer or implement an external emergency procedure. Any non-CRM operating process requires a separate operational decision.

## 9. Decision register and implementation gates

All owners below are **proposed accountable roles, people to assign**. O-02–O-06 entries preserve superseded history and do not define current operations. P1 source priority does not mean a detail can be guessed when a slice needs it.

| Source / detail | Still required | Accountable role | Blocks / safe interim behavior |
|---|---|---|---|
| O-01 — Local interval convention | **RESOLVED 2026-10-25:** exact PHT expiry and whole days/hours rounded down at server check time; “less than 1 hour” below one hour; current paid term only | User approval recorded | Verify display and exclusive-end boundaries; no remaining-time display for expired/future-only terms |
| Advance renewal limit | **RESOLVED 2026-10-25:** one queued paid term; another sale only once it starts; preserve committed same-key recovery | User approval recorded | Verify preview/confirmation denial, concurrent requests and recovery |
| Derived date detail | **RESOLVED October 25, 2026:** current full-cash new/late terms use original payment-date Manila midnight; preserve adjacency, duration and queue limits. The omitted-payment recovery extension is historical and retired. | User approval recorded | Current cash purchase date/time behavior remains; no recovery or digital-cross-date action is available |
| O-02 — Repeat outage visits/lost receipts | **HISTORICAL; SUPERSEDED 2026-11-01:** the October 25, 2026 user-approved outage decisions are retained as context. CRM outage workflow retired; no outside-CRM fallback is inferred. | Historical owner: pilot owner + operations lead | No current outage workflow authorized |
| O-03 — Refund details | **HISTORICAL; SUPERSEDED 2026-11-01:** October 25 supported refund/correction decisions and unresolved cancellation terms are preserved in the history. All CRM correction/refund actions retired. | Historical owner: pilot owner + product owner | No current investigation/correction/refund workflow authorized |
| O-04 — Named digital verifiers | **HISTORICAL; SUPERSEDED 2026-11-01:** local synthetic verifier mechanism and open live account SOP are preserved as past decisions. Digital collection retired. | Historical owner: pilot owner | No current digital payment verification authorized |
| O-05 — Claim SOP | **HISTORICAL; SUPERSEDED 2026-11-01:** October 25 investigation/recovery authority decision and its live gates remain historical. | Historical owner: pilot owner + operations lead | No current investigation/recovery workflow authorized |
| O-06 — Receipt custody | **HISTORICAL; SUPERSEDED 2026-11-01:** approved custody and closing-related decisions remain preserved in source/SOP history. | Historical owner: pilot owner + operations lead | No current outage/custody workflow authorized |
| O-07 — Launch plan catalog | **RESOLVED 2026-10-24:** Monthly ₱800/30 days, 3 Months ₱2,100/90 days, 6 Months ₱4,000/180 days; all fixed elapsed days | User approval recorded; future price changes owner-controlled | Only these durations; no discounts/other variants. Live readiness gates remain separate. |
| O-08 — Legacy acceptance | **HISTORICAL; SUPERSEDED 2026-11-09:** prior local decision and records remain preserved; new CRM entry/review is retired. Previously approved intervals remain effective only through their recorded end. No live migration is authorized. | Historical owner: pilot owner + product owner | Retained legacy history is read-only; runtime insert and API mutations are denied |
| O-09 — Pilot protocol | **HISTORICAL; REVISE BEFORE PILOT:** October 26 local protocol and synthetic fixtures remain historical; its measures assumed now-retired digital, outage, exception and closing workflows. Future pilot scope must be limited to currently supported cash collection, receipt/history and eligibility unless separately authorized. | Product owner + pilot reviewer | Real participants, baseline/trial dates, independent evidence, reviewers, training and operational sign-off remain required; no launch or success claim authorized |
| Derived closing detail | **HISTORICAL; SUPERSEDED 2026-11-01:** the three locally approved S-06 decisions remain in the superseded SOP as historical context. | Historical owner: pilot owner + operations lead | No in-app daily closing authorized; no external process inferred |
| Derived data stewardship detail | Necessary member fields, evidence access/retention, operational record retention, backup/restore ownership, recovery expectations | Product owner + implementation lead + pilot owner | Blocks use of live personal/financial data without an accepted operational procedure |

Record each resolution here with date, approver, selected behavior, examples, and affected FR/AC/slices; then synchronize `product.md` if it changes or adds product policy. Unresolved details keep the affected acceptance criteria conditional, not silently waived.

## 10. Verification, pilot measures, and completion

### Implementation verification

Verify each slice with realistic owner/staff workflows and relevant negative cases. Use automated integration checks for financial/permission/date integrity and focused UI checks for complete operator journeys. Test style and tooling remain implementation decisions.

Required current coverage includes full-vs-short cash payment, rejection of non-cash methods, unauthorized direct requests, repeated/concurrent cash submission, partial-write recovery, 30-day expiry across month ends/leap years, receipt retrieval, retained historical member/payment links, and read-only denials for each retired mutation family. Use synthetic data until live-data readiness is satisfied. Prior digital, exception, outage and closing evidence remains historical and does not count as current workflow acceptance.

Keep acceptance results linked to AC identifiers with evidence, failures, and any decision gates. A proposed control's successful test proves implementation behavior, not pilot acceptance of the policy or a measured business outcome.

### Historical pilot targets (superseded 2026-11-01; not current targets)

These earlier targets assumed digital collections, Exceptions, outage workflows, and daily closing. Preserve them as historical context only. Revised O-09 must define cash-only measures, baselines, denominators, independent evidence, and targets before any pilot; none of the following values authorizes a pilot or represents current acceptance.

| Measure | Source baseline | Proposed target / interpretation |
|---|---|---|
| Discrepancies per gym/month | Approximately 15, unvalidated | 5 or fewer; report separate categories, absolute counts, and rates per transaction |
| Same-day CRM recording | Unknown | At least 95% of independently verified received payments; measure real entry date separately from physical receipt issuance |
| Eligibility decisions | Frequency and timing unknown | Define baseline, denominator, and target before pilot; no provisional outage admissions are in current CRM scope |
| Common eligibility check time | Unknown | At most 15 seconds, exploratory; establish baseline first |

Confirm discovery and preferably 2–4 weeks of baseline observations where feasible. Any future pilot must evaluate only currently supported cash collection, receipt/history and eligibility, with separately approved procedures for matters outside the CRM. Assign reviewers, train operators, and define participants, dates, trial duration, measures, incident handling and evidence custody under a revised O-09 before launch.

### Historical pilot adoption measures (superseded 2026-11-01)

The prior adoption measures, including approved outage fallback and shadow-ledger classifications, belong to the superseded local O-09 protocol. Redefine measures and denominators for cash-only CRM use before any pilot; do not report old synthetic measurements as current operational results.

### Definition of done

- Every in-scope story is delivered through its vertical slice, with applicable acceptance evidence and no undisclosed skipped cases.
- All production-relevant decision gates have recorded answers; unsupported conditional paths are blocked and disclosed. Deferred capabilities have an explicitly accepted operational treatment consistent with the source, not an invented default.
- Permissions, payment/period integrity, duplicate protection, receipt traceability, and retired-workflow no-write behavior pass verification.
- Owner and authorized staff can complete ordinary full-cash join/renewal, retrieve receipt and payment history, and check eligibility. Retired mutation paths reject writes, and retained records stay readable.
- Live-data stewardship and recovery procedures are accepted; historical access is verified before migration approval.
- No unresolved high-severity product-caused payment-integrity issue or unauthorized alteration remains. Any process outside the supported CRM scope needs a separate operational decision.
- Pilot reviewers can reproduce current cash-only measures after O-09 has been revised and approved for that scope.

Delivery readiness and pilot success are separate decisions. Broader rollout requires credible evidence of cash payment accuracy and eligibility under revised O-09, plus no unresolved critical integrity issues. Do not carry forward the retired closing-time target. Weak results require diagnosis of workflow, adoption, policy fit, or measurement before expanding scope.

## 11. Runtime validation acceptance supplement (2026-10-24)

Zod is the selected application runtime-validation library (architecture.md AD-033/§17). This adds engineering acceptance criteria across existing FR-01–FR-12, not a new business milestone or changed membership/payment policy. Existing milestones must not be marked incomplete solely because the supplied documentation snapshot is older than the repository.

| ID | Acceptance criterion | Applies to |
|---|---|---|
| VAL-01 | Application-owned untrusted input is parsed on the server before relevant domain processing/writes. Malformed, wrong-type, missing and disallowed mutation fields fail safely with no domain/financial mutation. Necessary denial auditing remains permitted without sensitive payloads. Client bypass tests prove enforcement. | Existing input boundaries across FR-01–FR-12 |
| VAL-02 | Forms reuse browser-safe schemas where useful, show accessible field/form errors, preserve non-sensitive values and allow correction/resubmission. Server-only imports and secret configuration do not enter client bundles. | Existing owner/staff forms |
| VAL-03 | Money conversion is exact to integer centavos; unsafe/out-of-range/unsupported-precision amounts and invalid or ambiguous dates are rejected. Approved plan durations and Asia/Manila interval semantics remain unchanged. | FR-02–FR-05, FR-08–FR-11 |
| VAL-04 | Schema success does not grant authorization or verify funds. Existing tenant lookup, current capability checks, RLS, constraints, atomicity and idempotency pass relevant regressions, including valid-format cross-gym IDs. | All protected reads/writes |
| VAL-05 | Required configuration is validated before use; invalid configuration fails closed with key-only safe diagnostics. No secrets/raw configuration or sensitive validation payloads appear in logs, responses or browser bundles. | Authentication, database, email and deployment configuration |
| VAL-06 | A repository-backed inventory records covered/uncovered boundaries and incremental migration evidence. Relevant positive/negative checks and retry behavior pass before declaring a workflow integrated; unresolved coverage and skipped checks remain explicit. | Release-readiness evidence and IMPLEMENTATION_STATUS.md |

No live email, real-member onboarding or production deployment is authorized by this supplement. Existing release gates still apply.
