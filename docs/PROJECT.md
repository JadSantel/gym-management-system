# Independent Gym Management System — MVP Delivery Specification

**Status:** Working delivery specification; conditional requirements remain gated by the decisions in Section 9.  
**Date:** 2026-10-25 (documentation reconciliation; approval dates remain recorded with each decision)
**Authority:** This document is the source of truth for current MVP requirements, approved behavior, and implementation gates. [product.md](product.md) provides aligned product context and policy references.  
**Accountable product owner:** To assign. Pilot gym owners and operational reviewers: to assign.  
**Implementation status:** S-01-S-03, supported S-04 recovery/correction/refund-settlement paths and S-05 outage receipt/custody recovery have recorded local synthetic verification as of 2026-10-25. S-06/S-07, full S-04 closing integration, real physical operating rehearsal and live/pilot readiness remain unverified. See [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) for exact evidence and conditional limits; this requirements document does not certify release readiness.

## 1. Authority, outcome, and interpretation

Deliver a focused operational system for independent gyms serving approximately 80–150 members. Owners and staff must be able to record verified full membership payments, determine paid access accurately, investigate discrepancies, and reconcile collections without relying on delayed spreadsheet transcription.

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
| Full-payment collection | Cash, GCash, and bank-transfer records; verified confirmation; retrievable receipt/reference | FR-03, FR-04 |
| Membership lifecycle | Approved fixed 30/90/180-day periods, advance and late renewal, reliable eligibility check | FR-05, FR-06 |
| Payment investigation | Searchable history, evidence-backed missing-payment recovery, escalation | FR-07 |
| Owner-controlled corrections | Preserved originals, classified reason, approval, explicit money and access outcomes | FR-08 |
| Outage recovery | Physical numbered-receipt procedure, one-visit exceptions, back-entry and custody reconciliation | FR-09 |
| Daily closing | Expected/actual totals, differences, owner review, outstanding-item visibility | FR-10 |
| Verified migration | Traceable historical entitlements and unresolved legacy flags | FR-11 |
| Pilot evidence | Defined collection/entry timestamps, categorized incidents, closing-time and eligibility measurements | FR-12 |

**O-07 approved by the user on 2026-10-24:** Monthly — **₱800 / 30 elapsed days**; 3 Months — **₱2,100 / 90 elapsed days**; 6 Months — **₱4,000 / 180 elapsed days**. Each day is exactly 24 hours; none uses calendar-month arithmetic. These initial catalogue prices remain owner-controlled for later changes, preserving historical snapshots. No other duration, promotion, discount, guest pass, or grandfathered contract is approved.

### Excluded

- Partial membership payments, installments, membership receivables, debt collection, and payment plans.
- Class booking, personal-training schedules, inventory, equipment management, and public booking.
- Marketing CRM, referral campaigns, loyalty, lead funnels, and mass messaging.
- Advanced attendance analytics, biometric entry, turnstiles, and hardware automation.
- Member self-service portal or mobile app.
- Multi-branch/franchise administration and complex financial accounting.
- Automated payment gateways or POS integration; reconsider only if pilot evidence shows manual verification cannot meet the goal.
- Automated renewal reminders until need and communication preferences are validated.
- Fully offline digital capture, local-first synchronization, device-to-device synchronization, and automatic offline membership activation.

Basic eligibility checks and incident evidence are included; a comprehensive attendance product is not. Outage receipt issuance and access authorization happen manually while disconnected. Recovery support is in the application after connectivity returns.

Additions require evidence that they improve payment correctness, eligibility, traceability, or closing. Record them in a later backlog until product scope is explicitly revised.

## 3. User stories and traceability

| ID | User story | Deliverable / acceptance | Source |
|---|---|---|---|
| US-01 | As an owner, I can give each operator only the authority needed so collections and sensitive actions remain attributable. | FR-01; AC-01a–c | BR-04, BR-15, BR-19; Section 6.1a.4 |
| US-02 | As an operator, I can find or create a member and show the exact plan price before collecting funds. | FR-02; AC-02a–c | BR-18; Section 8 |
| US-03 | As a collector, I can record a full cash payment once and provide a durable reference so the member's payment is recognized. | FR-03; AC-03a–d | BR-01–04; PR-01–04 |
| US-04 | As an account-authorized verifier, I can confirm GCash/bank funds against the receiving account so screenshots cannot activate access. | FR-04; AC-04a–d | BR-08, BR-14; Section 6.1a.4 |
| US-05 | As a collector, I can renew early without losing paid time or renew after expiry from the correct payment date. | FR-05; AC-05a–e | BR-02, BR-07, BR-12–13; Section 6.1a.1, .6 |
| US-06 | As front-desk staff, I can quickly distinguish active, scheduled, unpaid, expired, and provisional cases before admission. | FR-06; AC-06a–c | BR-06, BR-11; Section 6.3 |
| US-07 | As an owner, I can approve and recover an independently proven omitted payment without changing an existing confirmed transaction. | FR-07; AC-07a–d | BR-05, BR-19; Section 6.1a.5 |
| US-08 | As an owner, I can approve a reason-specific correction/refund and its access consequences while preserving the original record. | FR-08; AC-08a–d | BR-09, BR-15; Section 6.1a.3 |
| US-09 | As an outage collector, I can issue a numbered full-cash receipt, document one visit, and account for it after recovery and at handover. | FR-09; AC-09a–f | BR-10–11, BR-16; Section 6.1a.2, .6 |
| US-10 | As closing staff, I can compare actual collections with recorded totals; as owner, I can review unresolved differences without hiding them. | FR-10; AC-10a–d | BR-17; PR-06; Appendix C |
| US-11 | As a pilot owner, I can approve verified historical access and isolate uncertain legacy records without fabricating payments or balances. | FR-11; AC-11a–c | BR-18; O-08 |
| US-12 | As a pilot reviewer, I can measure discrepancies, closing work, recording delays, and incorrect admissions using defensible evidence. | FR-12; AC-12a–c | Sections 7, 10; O-09 |

Gym members benefit from accurate dates and retrievable payment confirmation. They do not require an application login in this MVP.

## 4. Permission rules

Owner and staff are the two product roles. Staff capabilities below are explicit authorizations, not additional business roles. The exact assignment procedure is a proposed control to validate with each pilot. An owner also needs designated receiving-account access before verifying digital settlement.

| Action | Owner | Staff | Basis / restriction |
|---|---|---|---|
| Search/create members; inspect eligibility and relevant payment history | Yes | Authorized operational staff | Source minimum capabilities; proposed least-privilege boundary |
| Set plan prices and supported plan definitions | Yes | No | Owner-controlled pricing, BR-18 |
| Accept and confirm full cash collection | Yes | Authorized collectors | Actual collector must be recorded, BR-04 |
| Record a pending digital payment | Yes | Authorized collectors | Pending entry does not verify receipt or activate membership |
| Confirm GCash/bank settlement | Only with designated account-view authorization | Only with designated account-view authorization | Must inspect actual receiving-account funds, BR-14 |
| Record a paid early/late renewal | Yes | Authorized collectors, subject to verification authority | BR-02, BR-07, BR-12 |
| Record a claim or report a discrepancy | Yes | Authorized operational staff | Reporting does not confer resolution/approval authority |
| Resolve a verified omitted-payment claim | Owner-only approval and execution | Investigate/document/escalate only | Independent actual collection evidence; October 25, 2026 approval; digital verification still needs designated account authority |
| Reverse, refund, void, or correct an existing confirmed financial transaction | Owner approval required | No | Staff may submit a request, never approve or execute the financial change |
| Decide a correction/refund's access outcome | Owner approval required | No | Reason, rationale, effective date, and affected periods required |
| Register physical booklet/range and designate/revoke outage verifiers | Freshly reauthenticated owner only | No | O-06 local approval October 25, 2026; preserve assigned custody and approved paper price snapshot |
| Grant current-visit outage access | With assigned custody, full cash and numbered receipt | Cash-authorized assigned outage custodians, with the same evidence | One manual visit only; BR-11; no automatic repeat admission |
| Back-enter assigned outage receipts and prepare custody counts | Yes | Member-management and cash capabilities required | Actual collector remains distinct from later entrant; cannot self-certify missing evidence by typing it into CRM |
| Independently verify recovered outage full cash | Explicit designation required; cannot be collector or entrant | Same explicit designation and independence required | Match receipt/cash/signed custody evidence; owner role alone grants no verification authority |
| Resolve a missing/invalid/disputed receipt exception | Yes | Investigate and escalate | Owner resolution; retain number and history |
| Prepare daily reconciliation | Yes | Authorized closing staff | BR-17 |
| Approve unresolved closing differences | Yes | No | Approval retains the unresolved amount and status |
| Approve imported historical entitlement | Proposed owner sign-off | May prepare records; no approval by default | Conditional on O-08 |
| Assign/revoke operator capabilities | Proposed owner-only administration | No | Implementation control; validate pilot responsibility |
| Silently overwrite/delete confirmed financial history | No | No | Original plus linked corrective events, PR-02, PR-10 |

Permission checks apply to each underlying operation, including direct requests; hiding a button is insufficient. Back-entry records the actual collector separately from the authenticated entrant and verifier. Shared accounts cannot satisfy collector attribution. Members and unauthenticated users have no operational access.

## 5. Functional requirements and acceptance criteria

### FR-01 — Operator identity and authorization

**Classification:** Policy-derived attribution/authority; proposed access controls. **Sources:** BR-04, BR-15, BR-19; PR-05; Section 6.1a.4–5.

Provide individual authentication and explicit capabilities from Section 4. Attribute records to authenticated actors, with separate collector/entrant/verifier fields where the workflow requires them. Prevent staff from changing confirmed financial history through any entry point.

- **AC-01a:** Given an authenticated collector, when they confirm a cash payment, then the transaction and history identify that collector; a back-entry also identifies the different entrant when applicable.
- **AC-01b:** Given staff without correction approval authority, when they attempt to reverse, refund, void, alter a confirmed payment, or approve a closing difference through UI or direct request, then the operation is rejected and financial/access records remain unchanged.
- **AC-01c:** Given an operator without receiving-account authorization, when they attempt digital confirmation, then confirmation is rejected even if they can collect cash or investigate claims. Revoking a capability prevents subsequent protected actions.

### FR-02 — Members, plans, and exact charges

**Classification:** Policy for owner-controlled prices; proposed member/charge controls; conditional supported plan set. **Sources:** BR-18; Sections 5, 8; O-07.

Search/create members, associate their transaction history and paid periods, and show the selected plan's duration, full price, and intended period before collection. Define only necessary member fields after operational validation. Preserve the charged plan/price/duration on historical transactions so later plan changes do not rewrite history. Staff cannot introduce ad hoc prices or discounts.

- **AC-02a:** Given a selected member and plan, when preparing a join/renewal, then the operator sees the full charge, method, and proposed period before confirming payment.
- **AC-02b:** Given a prior confirmed payment, when the owner changes the plan price for later sales, then its historical amount, receipt, and paid period remain unchanged.
- **AC-02c:** Given staff or an unsupported plan/discount request, when attempting to change pricing or sell an unapproved duration, then the action is blocked; the approved O-07 catalogue is not silently replaced by an unsupported plan, discount or duration.

### FR-03 — Full-payment recording and confirmation

**Classification:** Policy for full payment; proposed durable records and duplicate/failure controls. **Sources:** BR-01–04; PR-01–04; Sections 5, 6.3.

Confirm a membership charge only when the entire required amount has been received and verified. Reject a short payment without posting a partial membership payment, installment balance, or entitlement. An unresolved mismatch/excess collection is an exception; do not invent an overpayment, change, or credit policy. A confirmed record includes unique ID/reference, member, plan/charge snapshot, full amount, method, actual collector, collection time, entry time, verification actor/time, and related period/receipt. The confirmation must be retrievable without dependence on a notification channel.

- **AC-03a:** Given a required charge of 1,000 and verified receipt of 900, when confirmation is attempted, then no confirmed membership payment, debt balance, or paid period is created. The operator receives a clear full-payment requirement.
- **AC-03b:** Given the full verified cash amount and an authorized collector, when confirmation succeeds, then one confirmed transaction, its linked period, and retrievable reference exist; history shows the actor, amount, method, and timestamps.
- **AC-03c:** Given a successful request whose response was lost, when the same request is retried or concurrently repeated, then it returns/references the existing result without a second collection record or period. A new real collection is handled separately and is not discarded merely because its amount matches.
- **AC-03d:** Given failure during confirmation, then the operation cannot leave a spendable paid period without its confirmed payment or an apparently completed payment with its required linked period missing. Recovery/retry has a determinate result. Reopening the reference retrieves that same result.

### FR-04 — GCash and bank verification

**Classification:** Policy with proposed evidence capture. **Sources:** BR-08, BR-14; PR-04; Section 6.1a.4; O-04.

Support GCash and bank transfer as manually verified methods. Keep pending/delayed/mismatched transfers distinct from confirmed payments. A designated verifier checks actual funds in the designated receiving account and records receiving-account match, appropriate reference, reviewer, and confirmation time. Never store banking login credentials. No payment gateway is required.

**S-03 local synthetic approval (user, 2026-10-25):** owner-managed receiving-account labels/methods and explicitly named owner/staff verifiers; owners have no automatic settlement bypass. Record matched designated account, exact full amount, transaction reference and an opaque account-activity evidence reference, plus collector, entry, actual funds-received and verifier/time attribution. Account/grant changes require fresh owner reauthentication. Existing member/cash collectors may record pending claims; member-authorized operators may flag confirmed digital payments for owner review. Unavailable verifier: keep pending and contact the owner. No credentials or evidence uploads. This settles the local synthetic test configuration only, not real account/viewer assignments or a live evidence-retention SOP. **Cross-date digital confirmation remains blocked:** both the reported and actual funds-received Manila date must equal the confirmation date; preserve claims for owner review rather than infer an effective date. Same-date new/late terms use that date's Manila midnight; early terms preserve exact adjacency and the one-queued-term limit. Dispute flags append review events without changing original confirmation, refunds or access.

- **AC-04a:** Given only a screenshot, reference, pending transfer, or mismatched account/amount, when an operator records it, then it remains unconfirmed or is flagged for review and grants no new normal access.
- **AC-04b:** Given actual full funds in the designated receiving account and an authorized verifier, when confirmation is recorded, then the audit captures the reference, account match, reviewer/time, collector, and one linked paid period.
- **AC-04c:** Given the verifier is unavailable, then another collector can preserve the pending case but cannot bypass verification. Existing independently paid access remains evaluated on its own merits.
- **AC-04d:** Given a previously confirmed transfer is later disputed/reversed or found absent, then it is flagged for owner review; staff cannot silently rewrite it, and no universal access outcome is inferred. FR-08 governs disposition.

### FR-05 — Membership periods and renewal

**Classification:** Policy; conditional start convention and unsupported cases. **Sources:** BR-02, BR-07, BR-12–13; PR-07; Section 6.1a.1, .6; O-01, O-07.

Use the gym's local timezone (Asia/Manila for the Philippines pilot) for display. The approved MVP monthly-labeled plan lasts **exactly 30 consecutive 24-hour days**. Store/evaluate start-inclusive, end-exclusive intervals: eligible at start and ineligible at end unless an adjacent verified paid interval applies. Compute the end as start plus 30 elapsed days, **not** calendar-month advancement or end-of-month clamping. A new membership or late renewal starts at **00:00 Asia/Manila on the local date of the verified full payment**. For a valid offline cash renewal, use 00:00 on the original verified cash-collection date. A payment received later in the day therefore yields less than 30 × 24 hours of prospective access; the term still spans exactly 30 midnight-to-midnight days.

For an active member, show actual expiry and remaining active days, recommend optional advance renewal, preserve current access, and schedule the paid next term at the current term's exact end. For an expired member, start on the confirmed payment date. A verified late full-cash outage renewal uses the original verified collection date after recovery, not entry/verification date. Preserve all timestamps. A queued future paid period is not an unpaid renewal or receivable.

The midnight effective-start convention is approved. **S-02 decisions approved by the user, 2026-10-25:** show exact PHT expiry plus remaining whole 24-hour days and whole hours, rounded down at the displayed server check time; show “less than 1 hour” below one hour. Show remaining time only for the current active paid period, separately from any scheduled term. Allow one queued paid advance term; block another sale until that term starts. Same-key recovery of an already confirmed payment remains available. No overlapping periods are permitted.

- **AC-05a:** Given a 30-day membership beginning at 2027-01-31 00:00 Asia/Manila, its end is 2027-03-02 00:00; given a start at 2028-01-31 00:00, its end is 2028-03-01 00:00. A start on 2027-04-15 00:00 ends 2027-05-15 00:00. These are fixed elapsed durations, not calendar-month billing anniversaries. A full payment at 18:30 on the start date still uses 00:00 that date as the effective start.
- **AC-05b:** Given a current interval ending at boundary E and one paid advance renewal, then the new interval starts exactly at E, current access is preserved, and both sides of E have the correct eligibility with no gap/overlap. Remaining days/expiry are visible before collection.
- **AC-05c:** Given an expired membership and an online payment confirmed on local date D, then the new term starts at 00:00 Asia/Manila on D, never on the old expiration date.
- **AC-05d:** Given a valid full-cash outage renewal collected on D and entered/verified later on D+2, then after verification its term starts at 00:00 Asia/Manila on D; entry and verification still show D+2. The earlier one-visit exception remains separately traceable.
- **AC-05e:** Given only a proposed renewal or unconfirmed payment, then no future paid period is created. Given an already queued paid term, another advance sale is blocked until that term starts; committed same-key recovery still returns the original result.

### FR-06 — Eligibility and basic check-in

**Classification:** Policy for eligibility; proposed status presentation/evidence. **Sources:** BR-06, BR-11; Sections 6.3, 8; Section 6.1a.2.

Show whether a fully paid, currently effective period exists and its expiry. Distinguish scheduled future access, expired/no verified access, unresolved payment, and recorded provisional outage visits. A claim, screenshot, pending payment, or old provisional visit is insufficient for normal admission. Existing verified active access is not removed merely because a separate renewal is pending.

- **AC-06a:** Given a valid interval [S, E), then the member is eligible at S and immediately before E; at E they are ineligible unless another verified interval begins there.
- **AC-06b:** Given only a future paid term, expired term, unresolved claim, or pending payment, then normal eligibility is denied with a clear reason. A separate active verified term still qualifies.
- **AC-06c:** Given an outage visit authorized on a full-cash numbered receipt, then it appears as a one-visit provisional exception after recovery; it does not authorize another visit. Capture eligibility/admission incidents sufficient for pilot review; a full attendance ledger is optional and requires scope validation.

### FR-07 — History and missing-payment investigations

**Classification:** Policy with proposed case record and duplicate controls. **Sources:** BR-05, BR-19; PR-01–03, PR-05; Section 6.1a.5; Appendix C; O-05.

Search by member, transaction/receipt reference, collection date, method, and collector. Record claims and evidence references, reviewer, original collection time, reasoning, and outcome. Authorized staff may create, investigate, document and escalate claims. Only the owner may approve and execute recovery, with current authorization and independent evidence of actual collection (approved October 25, 2026). Verbal claims and screenshots alone are insufficient. Preserve opaque evidence references, reasoning, reviewer, actual collection time, entry time and verification time. Uncertain, contradictory or high-risk claims stay unresolved and escalated; never invent a payment or store account credentials or unnecessary sensitive evidence. Recovered full cash uses 00:00 Asia/Manila on the independently verified original collection date for new/late membership; preserve 30/90/180 elapsed-day durations, early-renewal adjacency and one queued term. Uncertain dates or entitlement conflicts reject recovery without shifting, overwriting or terminating another period. Digital confirmation still requires reported, actual-received and verification Manila dates to agree; cross-date claims stay pending/escalated with no retroactive digital activation. Escalate unclear, inconsistent, high-risk, or historically disputed claims to the owner. Preserve existing confirmed entries.

- **AC-07a:** Given a verbal claim or screenshot without independent corroboration, or uncertain, contradictory or high-risk evidence, then the case remains unresolved/documented/escalated and creates no confirmed payment or entitlement.
- **AC-07b:** Given independently corroborated collection evidence, a verified original cash collection date and current owner approval, when a truly omitted full payment is recovered, then one recovered transaction links to the case/evidence, original collection time, entrant, reviewer, reasoning, and resulting period using original-date Manila midnight for new/late cash terms, exact early-term adjacency and the one-queued-term limit; uncertain/conflicting dates produce no financial writes.
- **AC-07c:** Given the evidence already matches a recorded payment or receipt, then recovery references that record or escalates a duplicate question; it does not create a second payment/period. Repeated and concurrent recovery is idempotent; an individual corroborated collection reference cannot be recovered through another case.
- **AC-07d:** Given resolving the case would require changing an existing confirmed transaction, then staff must route it to owner-controlled FR-08, retaining the investigation history. Staff recovery approval/execution requests are rejected on the server even with investigation capability.

### FR-08 — Corrections, reversals, and refunds

**Classification:** Policy for approval and reason-specific access; proposed linked adjustment records; conditional refund eligibility/amounts. **Sources:** BR-09, BR-15; PR-02, PR-05, PR-10; Section 6.1a.3; O-03.

Classify each case using Section 7. Preserve the original entry; record a linked owner-approved adjustment with evidence, reason, amount, method, money movement/disposition, affected periods, and access outcome (stays, ends, or adjusts), rationale, and effective date. Staff may request/investigate but cannot approve or execute recovery or financial changes, including direct API calls. No blanket refund rule or automatic access cancellation applies.

- **AC-08a:** Given an existing confirmed payment, when a correction/refund is approved, then the original remains retrievable and the linked event identifies owner approval, reason, evidence, amount/method, money outcome, and explicit access outcome/effective date. Investigation, owner decision, execution/awaiting external settlement and verified completion/unresolved failure remain distinct.
- **AC-08b:** Given missing owner approval, missing access disposition, or an unset required gym refund rule, then execution is blocked; the request remains available for review.
- **AC-08c:** Given one actual collection and two ledger records, then owner-approved duplicate-record correction does not refund nonexistent duplicate funds. Given two actual collections, then independent evidence must establish both actual collections, the same obligation, unintended excess and the exact full refundable excess. Owner approval includes explicit access disposition; actual external settlement must be independently verified before completion. A legitimate second purchase is not presumed erroneous.
- **AC-08d:** Given an approved correction affecting current/future periods, then eligibility, receipt/history, and closing totals reflect the explicit approved result consistently without erasing prior values. Repeating the approved action creates no second adjustment or refund record.


**S-04 execution contract (approved October 25, 2026):** Keep investigation/request, owner approval/rejection, execution/awaiting external settlement, and verified completion/unresolved failure distinct. Immutable original payments, periods and receipts remain retrievable. Linked attributable adjustments require rationale, evidence, exact centavos/method, effective timestamp and explicit approved access outcome; approval alone never proves settlement. The CRM never transfers money. Atomic writes, tenant authorization, member locks and idempotency prevent partial records or duplicate adjustments/settlements. Duplicate ledger records with one actual collection have zero refund. Two collections are not inherently a duplicate; require evidence of the same obligation and unintended excess. Unsupported corrections and discretionary cancellations remain documentable/escalatable, with execution blocked. Live privacy, evidence retention/access, named account/investigation authorities and backup coverage, hosting/email/monitoring/backups/recovery remain separate unverified gates.

### FR-09 — Numbered outage receipts and recovery

**Classification:** Approved policy and local synthetic receipt/custody SOP (user approval October 25, 2026); live operations remain conditional. **Sources:** BR-10–11, BR-16; PR-08–09; Section 6.1a.2, .6; O-02, O-06.

Prepare controlled pre-numbered receipt books/ranges and assigned custody. Offline, an authorized collector may accept the entire price in cash and issue a receipt containing number, member, plan, full amount, actual collection/issuance time, and collector. Document the current visit if provisional access is granted. Physical issuance does not require the application to work offline.

On reconnection, back-enter each original receipt promptly and mark it pending verification until matched to receipt/cash/custody evidence. Capture actual collector, entrant, original collection/issuance times, entry time, verifier/time, and any provisional visit. Prevent reuse of a receipt reference within its controlled numbering scope. Used, unused, void, missing, duplicate, and pending receipts remain accountable. Every shift ends with custody counts/handover even while disconnected; enter the handover after recovery. Invalid evidence goes to owner review.

**Local S-05 decision, approved by the user October 25, 2026:** Apply all seven decisions in [the approved local outage SOP](S05_OUTAGE_POLICY_PROPOSAL.md): gym-unique immutable booklet/number ranges and assigned custody; existing member/cash capabilities for entry; explicit separately designated verification independent of both collector and entrant; signed physical counts/handover at each actual shift boundary; retained lost/void/missing/conflict evidence and owner investigations; no automatic repeat admission or extra payment; original-date recovery only with unambiguous historical price/date evidence. Physical forms work without connectivity. Repeat admission approval remains unavailable in the app; an independently documented owner decision is required outside it. Live named operators/backups, evidence custody/retention and pilot operating coverage remain gated.

- **AC-09a:** Given an outage, full cash, a controlled receipt, and an authorized collector, then the manual procedure permits one documented visit; a partial amount or unverified digital transfer does not qualify for this cash exception.
- **AC-09b:** Given a later visit, then the old receipt's provisional authorization alone grants no access. A separately documented authorized exception is required if still offline, subject to the repeat-visit SOP; do not infer that another full payment is always due.
- **AC-09c:** Given receipt back-entry, then it remains pending and grants no new normal digital entitlement until evidence is verified; confirmation then uses the correct original-date rule and keeps the provisional visit separate.
- **AC-09d:** Given retry, concurrent entry, or reuse of a receipt already entered, then only one underlying payment/period results; conflicting member/amount/number evidence is flagged rather than overwritten.
- **AC-09e:** Given connectivity remains unavailable at shift end, then the manual handover accounts for used/unused/void/missing numbers and outstanding cash/receipts, with custody passed to an identified person; recovery records retain actual handover time and later entry time.
- **AC-09f:** Given a missing/void/invalid receipt, then its number, status, investigation, and any associated provisional access remain visible to the owner; no amount or payment is invented to close the gap.

### FR-10 — Day-end reconciliation

**Classification:** Policy for preparation/owner approval; proposed closing controls; conditional cutoff/cash-handling details. **Sources:** BR-17; PR-06; Section 6.3; Appendix C; O-06, O-09.

Show recorded collections by method and actual collector for the agreed business-day cutoff. Capture physically counted cash and independently verified digital receipts, compare with expected amounts, and link differences to cases. Expose pending digital transfers, outstanding outage receipts/custody gaps, and owner-approved corrections/refunds separately so totals remain explainable. Opening cash, cash removals, and any non-membership cash handling need a signed-off counting convention; do not build a general ledger.

- **AC-10a:** Given cash, GCash, and bank records from multiple collectors, then preparation shows each method/collector subtotal, actual values, and a traceable difference. A pending transfer is not counted as confirmed funds, and a verified back-entry is not counted twice.
- **AC-10b:** Given a shortage or excess, then staff can submit the difference with evidence/notes; only the owner approves the unresolved difference. Approval records accountability and leaves the unresolved amount visible without changing transaction amounts.
- **AC-10c:** Given outstanding receipts, missing numbers, or unverified transfers, then closing surfaces them separately and does not silently mark them reconciled when the daily summary is approved.
- **AC-10d:** Given a back-entry or correction after an earlier closing, then preserve the earlier closing snapshot and trace the later change to its original collection date and later entry/approval time. The pilot's late-adjustment procedure must be agreed before this behavior is enabled.

### FR-11 — Verified legacy onboarding

**Classification:** Policy for verified migration; conditional acceptance/sign-off details. **Sources:** BR-18; O-08; Section 9 risks.

Support a small pilot's verified historical member entitlements, whether by reviewed manual entry or a minimal import; a general import engine is not required. Keep source reference, verifier/sign-off, dates, and unresolved issues. Historical entitlement evidence is distinguishable from a newly collected payment; never manufacture a collection merely to satisfy a current-payment workflow.

- **AC-11a:** Given independently verified historical access and the approved migration authority, then the member receives the reviewed historical interval with provenance, not a fabricated new transaction or collection date.
- **AC-11b:** Given contradictory expiry evidence, unsupported historical payment, or legacy unpaid balance, then flag it for review without inventing funds, normal eligibility, or an installment balance. Other independently verified entitlement remains assessable.
- **AC-11c:** Given imported records in pilot reports, then historical records and unresolved legacy exceptions are distinguishable from new pilot collections under the approved measurement cutoff.

### FR-12 — Pilot measurement and operational evidence

**Classification:** Proposed measurement deliverable; conditional pilot protocol. **Sources:** Sections 3, 7, 10; Appendix A; O-09.

Provide sufficient records for a weekly pilot review; a manual review worksheet is acceptable where reliable. Categorize missing entry, wrong amount, duplicate, recording delay, disputed claim, and admission incidents separately. Preserve real collection, receipt issuance, system entry, and verification timestamps. Collect closing active-time and timed eligibility samples with consistent definitions.

- **AC-12a:** Given an outage payment collected/receipted on D but entered on D+2, then same-day CRM entry measurement records the delay; the receipt's on-day issuance is reported separately. Entry time is never backdated to improve the metric.
- **AC-12b:** Given a reporting period, then reviewers can reproduce discrepancy counts and rates per transaction, collection denominators supported by independent evidence, closing active-time, and admission incidents including authorized exceptions and wrongful denials.
- **AC-12c:** Given unresolved incidents, unknown denominators, outages, or missing measurement data, then the report exposes those limitations rather than claiming a validated improvement.

## 6. Record model and integrity contract

These are conceptual records and required relationships, not a prescribed database schema. Lifecycle labels are proposed controls; they must preserve the product distinctions even if implementation naming differs.

| Record | Minimum information / relationship |
|---|---|
| Operator and authority | Identity, owner/staff role, granted capabilities, account-verification authorization; attributable changes |
| Member | Stable identity, validated search/display fields, linked periods, payments, cases; personal-field scope to confirm |
| Plan / charge snapshot | Approved duration and price; historical charge terms independent of later catalog changes |
| Payment | Unique ID, full charge/method, member, collector, collection/entry/verification times, verifier, receipt/reference, confirmation state, linked period/case |
| Membership period | Start/end, timezone convention, linked confirmed payment or verified migration provenance; correction/access decisions retained |
| Receipt / custody | Controlled number/booklet, assigned custodian, issued/unused/void/missing status, collection/issuance times, back-entry match, handovers |
| Provisional visit | Member, visit/time, authorizer/collector, full-cash receipt, outage context, recovery linkage; no reusable digital membership |
| Exception / claim | ID/type, reporter/time, member and payment/receipt links where known, evidence reference, reviewer/time, reasoning, outcome, related recovery/correction and access effect |
| Correction / refund | Original transaction link, owner approval, classified reason, evidence, amount/method, actual money disposition, explicit access outcome/effective date |
| Reconciliation | Business-day cutoff, collector/method totals, actual counts, differences, open-item links, preparer, owner approval, snapshot and later adjustments |
| Migration evidence | Source, reviewed historical period, verifier/sign-off, uncertainty flags, pilot cutoff classification |

### Status vocabulary — do not combine unrelated dimensions

| Dimension | Controlled terms | Rules |
|---|---|---|
| Payment | Pending verification; Confirmed; Flagged | A confirmed payment is immutable financial history; reversal/refund/correction is a linked event, not an overwritten status. |
| Membership period | Scheduled; Active; Expired; Adjusted/terminated | Scheduled means **fully paid** but not yet effective. An incomplete purchase has no paid period. |
| Admission decision | Eligible; Not eligible; Provisional single-visit access | A provisional offline visit is not an active CRM-confirmed membership. |
| Exception case | Open; Under review; Escalated; Resolved | Case progress never automatically grants or revokes membership access. |

Display these dimensions independently. Do not treat “pending renewal” as a partly paid membership: use **uncompleted purchase request** for an unpaid transaction and **scheduled paid period** for a fully paid advance renewal. These product terms do not prescribe a database enum.

Required distinctions:

1. **Unconfirmed payment → confirmed:** Only after full receipt and authorized verification. Back-entry and evidence attachment alone cannot cross this boundary. A failed/unmatched transfer remains pending or flagged.
2. **Confirmed payment → linked corrective event:** Preserve the original. A dispute flag alone is not a reversal; only the approved correction records the money/access result.
3. **Paid period:** Scheduled before its start, active within [start, end), expired at end. Adjusted access follows explicit owner decisions. A provisional visit and an unresolved claim are separate records, never paid-period substitutes.
4. **Exception:** Open/investigating/escalated/resolved with evidence and outcome. Owner acknowledgment of an unresolved difference is not evidence that the discrepancy disappeared.
5. **Collection vs. entry vs. verification:** Preserve all three, plus physical receipt issuance when applicable; do not conflate the collector with the later data entrant or verifier.

Proposed implementation controls across all slices:

- A confirmation and its required financial/period links succeed together or recover consistently; retries and concurrent actions cannot duplicate the same operation.
- Enforce controlled receipt uniqueness and repeated-action safety for recovery, case resolution, and corrections as well as ordinary sales.
- Enforce permissions on the trusted execution path. Keep an attributable history of sensitive approved actions and preserve original financial facts.
- Restrict evidence access, avoid unnecessary sensitive data, and store no banking login credentials. Evidence retention/access and backup/restore procedures require pilot readiness decisions in Section 9.
- Present pending, provisional, confirmed, scheduled, and unresolved states clearly; never use a generic success message that implies unverified membership activation.

## 7. Reason-specific correction and refund matrix

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
| S-03 — Verified digital collection | Pending GCash/bank payment, designated verifier work queue, account-match confirmation, member receipt/eligibility | S-01, S-02 | Demonstrate US-04; pass AC-01c, AC-04a–d; screenshot-only and unauthorized confirmation fail; proper verification creates one period | O-04 named account verifiers and unavailable-verifier SOP |
| S-04 — Evidence-backed discrepancy resolution | Search history, open/escalate cases, recover an omitted full payment; owner-controlled linked corrections and gated refunds with explicit access disposition | S-01–03 | Demonstrate US-07–08; pass AC-07a–d, AC-08a–d; compare duplicate ledger entry with two actual collections; staff modification attempts fail | October 25, 2026 approved supported recovery/duplicate correction/full excess refund; discretionary cancellation and live SOPs remain gated |
| S-05 — Recover an outage shift | Controlled receipt registry, manual booklet/access SOP, one-visit record, back-entry verification, receipt uniqueness and custody handover | S-01–04 | Demonstrate US-09; pass AC-09a–f, AC-05d; simulate continued outage across shifts, lost receipt, duplicate entry, and late full-cash renewal | O-02/O-06 local design approved 2026-10-25; local synthetic evidence in ledger; live physical controls/authorities/rehearsal remain gates |
| S-06 — Close a business day | Collector/method summaries, counted cash/verified digital actuals, visible pending items, difference submission, owner approval and later-adjustment history | S-01–05 | Demonstrate US-10; pass AC-10a–d; include shortage, pending transfer, unentered receipt, owner refund and back-entry after an earlier close | Business-day cutoff, cash counting and late-adjustment procedure |
| S-07 — Onboard and evaluate a pilot | Reviewed legacy entitlements, uncertainty flags, metric worksheet/report, training and incident procedure | S-01–06 | Demonstrate US-11–12; pass AC-11a–c, AC-12a–c; rehearse join → renewal → eligibility → dispute → outage recovery → closing with owner/staff | O-08, O-09; security/data stewardship and release readiness |

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

S-04 supported recovery and exact full duplicate-excess execution may proceed under the October 25, 2026 decisions; discretionary refunds cannot be enabled until their case policies are approved. The final pilot must support the agreed exception process, either through supported approved cases or an explicitly accepted manual escalation procedure. An open gate must not be hidden by marking its slice complete.

## 9. Decision register and implementation gates

All owners below are **proposed accountable roles, people to assign**. The source resolves product direction for O-01, O-02, O-04, and O-05; this register concerns their remaining operational details. P1 source priority does not mean a detail can be guessed when a slice needs it.

| Source / detail | Still required | Accountable role | Blocks / safe interim behavior |
|---|---|---|---|
| O-01 — Local interval convention | **RESOLVED 2026-10-25:** exact PHT expiry and whole days/hours rounded down at server check time; “less than 1 hour” below one hour; current paid term only | User approval recorded | Verify display and exclusive-end boundaries; no remaining-time display for expired/future-only terms |
| Advance renewal limit | **RESOLVED 2026-10-25:** one queued paid term; another sale only once it starts; preserve committed same-key recovery | User approval recorded | Verify preview/confirmation denial, concurrent requests and recovery |
| Derived date detail | **RESOLVED October 25, 2026 for verified omitted full cash:** original-date Manila midnight for new/late terms; preserve adjacency, duration and queue limits. Digital cross-date remains blocked | Product owner + pilot owner | Blocks uncertain/conflicting cash dates and all cross-date digital confirmation; verified nonconflicting cash recovery is supported. Preserve actual collection, later entry and verification times |
| O-02 — Repeat outage visits/lost receipts | **LOCAL DESIGN RESOLVED 2026-10-25 by user:** approved outage SOP decisions 4–5; no automatic reuse/extra payment, separate documented owner later-visit decision, retained-copy/cash/custody corroboration for lost member copy | Pilot owner + operations lead | Local synthetic implementation authorized; live operating coverage/evidence SOP remains gated |
| O-03 — P0 refund details | **PARTLY RESOLVED October 25, 2026:** full independently evidenced unintended duplicate excess refund for the same obligation approved; discretionary cancellation before/after use still needs written pilot terms | Pilot owner + product owner | Blocks affected discretionary refunds; retain requests, approval/access structure and owner escalation |
| O-04 — Named digital verifiers | Local synthetic mechanism approved 2026-10-25 in FR-04; live account/viewer assignments and evidence/retention SOP remain open | Pilot owner | Explicit designation required even for owners. Synthetic evidence references and owner escalation only; no live settlement authorization |
| O-05 — Claim SOP | **DESIGN RESOLVED October 25, 2026:** staff investigate/escalate; owner alone approves/executes recovery; independently corroborated actual collection required. Named live authorities, backup coverage, evidence handling/access/retention SOP remain pilot gates | Pilot owner + operations lead | Staff recovery approval/execution forbidden; live evidence SOP and authority coverage remain blocked pending pilot approval |
| O-06 — Receipt custody | **LOCAL DESIGN RESOLVED 2026-10-25 by user:** approved outage SOP decisions 1–3, 6–7; gym/booklet/number uniqueness, assigned custody, independent designated verification, every-shift physical counts/signatures/escalation and preserved actual/entry times; no automatic write-off or closing cutoff | Pilot owner + operations lead | Local synthetic implementation/rehearsal authorized; live booklet control, authorities/backups and evidence handling remain gated |
| O-07 — Launch plan catalog | **RESOLVED 2026-10-24:** Monthly ₱800/30 days, 3 Months ₱2,100/90 days, 6 Months ₱4,000/180 days; all fixed elapsed days | User approval recorded; future price changes owner-controlled | Only these durations; no discounts/other variants. Live readiness gates remain separate. |
| O-08 — Legacy acceptance | Source verification, sign-off authority, contradictory records/legacy balances, historical entitlement acceptance and metric cutoff | Pilot owner + product owner | Blocks unverified migration/activation; flag uncertain records and preserve provenance |
| O-09 — Pilot protocol | Participants, baseline/trial dates, duration, collection evidence/denominator, operating-day definition, outages/partial days, reviewers and incident protocol | Product owner + pilot reviewer | Blocks credible success claims and pilot launch; record real timestamps without manufactured baselines |
| Derived closing detail | Daily cutoff/timezone, cash float/removal treatment, adjustment allocation, closing snapshot amendments | Pilot owner + operations lead | Blocks final closing totals/sign-off; show underlying records and open items |
| Derived data stewardship detail | Necessary member fields, evidence access/retention, operational record retention, backup/restore ownership, recovery expectations | Product owner + implementation lead + pilot owner | Blocks use of live personal/financial data without an accepted operational procedure |

Record each resolution here with date, approver, selected behavior, examples, and affected FR/AC/slices; then synchronize `product.md` if it changes or adds product policy. Unresolved details keep the affected acceptance criteria conditional, not silently waived.

## 10. Verification, pilot measures, and completion

### Implementation verification

Verify each slice with realistic owner/staff workflows and relevant negative cases. Use automated integration checks for financial/permission/date integrity and focused UI checks for complete operator journeys. Test style and tooling remain implementation decisions.

Required coverage includes full-vs-short payment, screenshot-only digital claims, unauthorized direct actions, repeated/concurrent submissions, partial-write recovery, 30-day expiry across month ends/leap years, one-visit outage access, custody gaps, original collection versus later entry, duplicate record versus duplicate collection, explicit correction access outcomes, and visible unresolved closing differences. Exercise both GCash and bank transfer. Use synthetic data until live-data readiness is satisfied.

Keep acceptance results linked to AC identifiers with evidence, failures, and any decision gates. A proposed control's successful test proves implementation behavior, not pilot acceptance of the policy or a measured business outcome.

### Proposed pilot targets

| Measure | Source baseline | Proposed target / interpretation |
|---|---|---|
| Discrepancies per gym/month | Approximately 15, unvalidated | 5 or fewer; report separate categories, absolute counts, and rates per transaction |
| Daily reconciliation active time | Reported 1–2 hours, unvalidated | 30 minutes or less using a consistent cutoff/start/end definition |
| Same-day CRM recording | Unknown | At least 95% of independently verified received payments; measure real entry date separately from physical receipt issuance |
| Mistaken expired-member admissions | Frequency unknown | Zero during pilot; distinguish valid one-visit exceptions and also record wrongful denials |
| Common eligibility check time | Unknown | At most 15 seconds, exploratory; establish baseline first |

Confirm discovery and preferably 2–4 weeks of baseline observations where feasible, then validate low-fidelity workflows with owner/staff before development of the affected journeys. For the limited operational pilot, assign reviewers, train operators, agree incident/fallback procedures, and review results weekly. Participant count, dates, trial duration, sample sizes, and baseline evidence remain O-09.

### Additional pilot adoption measures (approved)

Track (1) **point-of-collection entry rate**: CRM entry recorded during collection rather than deferred (report authorized offline receipts separately); (2) **staff adoption across shifts**: proportion of applicable shifts/operators actually using the approved workflow; and (3) **unapproved parallel recordkeeping**: occurrences of paper/spreadsheet shadow ledgers outside the authorized outage fallback. Define denominators and how each observation is verified in O-09. These measures diagnose why outcomes improve or fail; pilot targets are not assumed until baseline evidence is collected.

### Definition of done

- Every in-scope story is delivered through its vertical slice, with applicable acceptance evidence and no undisclosed skipped cases.
- All production-relevant decision gates have recorded answers; unsupported conditional paths are blocked and disclosed. Deferred capabilities have an explicitly accepted operational treatment consistent with the source, not an invented default.
- Permissions, payment/period integrity, duplicate protection, receipt traceability, and owner-approved adjustment behavior pass verification.
- Owner and staff can complete the ordinary join, digital collection, renewal, eligibility, claim, correction, outage recovery, and closing journeys using agreed operating instructions.
- Live-data stewardship and recovery procedures are accepted; historical access is verified before migration approval.
- No unresolved high-severity product-caused payment-integrity issue or unauthorized alteration remains. A second routine payment ledger is not needed to compensate for product defects; controlled outage receipts remain the agreed fallback.
- Pilot reviewers can reproduce measurements and disclose missing evidence, open discrepancies, workarounds, incorrect denials, and outages.

Delivery readiness and pilot success are separate decisions. Broader rollout requires credible evidence of improved payment accuracy and closing time, accurate eligibility, and no unresolved critical integrity issues. Weak results require diagnosis of workflow, adoption, policy fit, or measurement before expanding scope.

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
