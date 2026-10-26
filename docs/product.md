# Product Definition — Independent Gym CRM (MVP)

**Status:** Product policies approved for MVP planning; limited operational details and pilot validation remain open  
**Last updated:** 2026-10-25 (aligned with PROJECT.md; approved S-02-S-04 decisions and remaining operational gates)
**Document owner:** Product team (to assign)  
**Purpose:** Describe the customer problem, proposed value, business constraints, MVP boundaries, and pilot evidence supporting the delivery specification.  
**Source of truth:** [PROJECT.md](PROJECT.md) governs current MVP requirements, approved behavior, and implementation gates. This product definition is maintained to match it; resolve conflicts in PROJECT.md first, then synchronize this document.  
**Technology decisions:** Intentionally excluded.

## Evidence labels and interpretation

- **Reported discovery finding:** Information supplied from an initial mixture of gym-owner interviews and research. Not independently verified in this document. Interview count, sample size, and source attribution have not been documented.
- **Agreed product policy:** A product rule explicitly selected for this MVP. It still needs confirmation that each participating pilot gym will adopt it.
- **Proposed requirement / target:** A solution or threshold to test; not a validated customer fact.
- **Open decision:** Behavior requiring an explicit owner/product decision before implementation.

Do not interpret reported figures as representative of independent gyms generally, or assume the observations all came from one gym.

## 1. Product overview and target customers

### Product concept

A focused operational tool for small independent gyms to record and verify full membership payments, maintain accurate membership dates and eligibility, investigate payment disagreements, and reconcile collections at closing.

The MVP is **not** intended to be a broad marketing, sales, or enterprise gym-management suite. Its initial value hypothesis is dependable payment accountability and membership status, with less after-hours administrative work.

### Target customer

- **Primary customer / buyer:** Owner or owner-manager of an independent gym serving approximately **80–150 members**.
- **Primary operators:** Owner and staff who may both receive payments, manage membership records, and check members in.
- **Affected end user:** Gym member who pays, renews, requests a receipt, or needs eligibility checked.

**Target segment status:** Working segment identified during discovery; prevalence and willingness to pay are unverified.

## 2. Problem statement and observed pain points

Independent gym owners managing approximately 80–150 members report using paper attendance records, verbal confirmation of membership transactions, and manual transfer of paper information into spreadsheets. These disconnected steps can leave payments incorrectly entered or unrecorded, renewals missed, and attendance or membership information unreliable.

Reported consequences include extra investigation after operations, late collection of dues, and expired members mistakenly being allowed to train. These are operational and control problems; **actual lost revenue has not yet been quantified**.

### Specific reported discrepancy types

1. Staff or owner receives a payment but does not record it promptly or at all.
2. Partial-payment amounts or remaining balances were forgotten in earlier operating practices.
3. A member claims to have paid, but the available records do not clearly verify payment.
4. An amount is entered incorrectly or recorded late in a spreadsheet.

**Policy change:** Although partial-payment discrepancies were part of the reported historical problems, **this MVP's agreed policy prohibits partial payments for new memberships and renewals**. The MVP must therefore prevent partial payments rather than build an installment or balance-management workflow.

## 3. Discovery evidence and baseline metrics

| Evidence | Reported finding | Confidence / qualification |
|---|---|---|
| Recordkeeping | Paper attendance, verbal confirmations, subsequent spreadsheet entry | Reported discovery finding; source attribution pending |
| Payment responsibility | Both owner and staff collect, depending on availability | Reported operating arrangement |
| Common issues | Payment discrepancies, missed renewals, inaccurate attendance | Reported; no frequency split available |
| Payment discrepancies | Approximately **15 per month** | Baseline estimate; denominator, period, and definition not yet validated |
| Daily reconciliation time | **1–2 hours after operations** | Reported estimate; number of operating days and participants unknown |
| Consequences | Time spent investigating, late collection, expired-member admission | Reported; incidence counts and financial impact unknown |

### Baseline interpretation

- If a gym operates 26–30 days per month, 1–2 hours daily would imply **26–60 hours monthly**, but this is a derived scenario, **not a measured result**.
- The approximately 15 monthly discrepancies may comprise errors of different severity. Track missing payments, amount errors, recording delays, and disputed claims **separately**.
- No credible baseline has yet been established for renewal misses, unauthorized check-ins, same-day recording rate, digital-transfer verification, or actual revenue loss.
- Preserve raw interview notes, source, gym identifier (anonymized if appropriate), timeframe, and calculation method before treating figures as pilot baselines.

## 4. Jobs to be done and user personas

These are **working personas inferred from reported roles**, not validated demographic profiles.

### Owner / owner-manager — buyer and accountable reviewer

**Job:** When collecting dues and closing the gym, I need to know which payments actually occurred, who handled them, and who has an active membership, so I can resolve disagreements and avoid lengthy reconciliation.

**Current friction:** Searching paper and spreadsheets, following up with staff, identifying missing records, and determining whether disputed payments were received.

**Desired outcome:** A trustworthy transaction history, clear exceptions, and fast daily closing.

### Front-desk or operational staff — day-to-day operator

**Job:** When a member joins, renews, or checks in, I need a fast, unambiguous way to confirm the required amount, record a verified full payment, and check eligibility, without relying on memory or later transcription.

**Current friction:** Paper entry, duplicate copying, uncertain payment status, and differing handoff practices.

**Desired outcome:** Fewer steps, immediate confirmation, and clear handling of exceptions.

### Gym member — affected participant

**Job:** When I pay or enter the gym, I want my membership recognized correctly and a way to reference the payment if questions arise.

**Desired outcome:** Accurate membership dates and a retrievable receipt or transaction reference. Member self-service is **not** required for the initial MVP.

## 5. Value proposition and smallest useful improvement

**Value proposition hypothesis:** For independent gyms with owner-and-staff payment handling, a single, traceable process for verified full payments and membership eligibility will reduce payment discrepancies and time spent closing accounts compared with mixed paper, verbal, and spreadsheet workflows.

**Smallest useful improvement:** Replace delayed, duplicated payment entry with an at-the-counter workflow that:

1. Shows the exact full membership charge before collection.
2. Records a **verified, full** new-membership or renewal payment once, associated with the authenticated collector.
3. Produces a durable payment reference/receipt and accurate membership period.
4. Enables quick active/expired membership checks.
5. Surfaces differences between system-recorded and actual collections during day-end reconciliation.

This is **not** a claim that software alone prevents unrecorded cash. The pilot must test staff adoption and actual cash-control practices.

## 6. Core business rules

### 6.1 Agreed policies

| ID | Rule | Classification |
|---|---|---|
| BR-01 | A new membership requires **full payment upfront** before activation. | Agreed product policy |
| BR-02 | A renewal requires **full payment upfront** before its new period becomes active. | Agreed product policy |
| BR-03 | **Partial payments, installments, and outstanding membership balances are not permitted** for new memberships or renewals. | Agreed product policy |
| BR-04 | Owner and staff may both accept payments; payment handling must be attributable to the actual operator. | Reported arrangement; proposed system control |
| BR-05 | A member claiming to have paid must present available supporting evidence; the claim is not accepted as a payment until verified. | Agreed policy; verification procedure open |
| BR-06 | An unpaid or expired membership period cannot be used for normal check-in; a documented full-cash outage receipt may authorize **temporary access** under BR-11. | Agreed product policy; current-visit outage exception defined |
| BR-07 | When a member renews before expiration, the next paid membership period starts **at the exact end** of the currently paid period; early renewal must not shorten existing access. | Agreed product policy; adjacent fixed-duration periods |
| BR-08 | Supported payment methods are **cash, GCash, and bank transfer**. Acceptance is distinct from verification: digital funds must be verified in the receiving account before final confirmation. | Agreed methods; proposed confirmation control |
| BR-09 | Refunds and corrections follow **transaction-dependent policies**, not a single blanket rule. Eligibility, approval, and consequences for membership periods require a documented decision matrix. | Agreed product policy; reason-based case approval required |
| BR-10 | During connectivity outages, staff use **pre-numbered temporary receipts**, then enter and verify the original transactions after service returns. Full cash payment with a numbered receipt may authorize provisional access according to BR-11; synchronization remains outstanding. | Agreed fallback process; one-visit access and back-entry rules defined |
| BR-11 | During an outage, an owner or authorized staff member may grant **temporary access** only after receiving the entire membership price **in cash** and issuing a numbered receipt. This is a documented provisional entitlement, not a synchronized CRM confirmation. | Agreed product policy; temporary access limited to current visit |
| BR-12 | A new membership or late renewal (previous membership already expired) begins at **00:00 Asia/Manila on the local date of the verified full payment**. A valid late full-cash outage renewal uses the original verified collection date. An early renewal begins immediately after the existing paid period ends; before accepting it, display remaining active days and recommend advance renewal. | Agreed product policy |
| BR-13 | Approved plans: Monthly **30 days / ₱800**, 3 Months **90 days / ₱2,100**, 6 Months **180 days / ₱4,000** (user approval, 2026-10-24). Each day is 24 hours; intervals are start-inclusive/end-exclusive. Never advance by calendar month or clamp month end. | Agreed duration, initial pricing and midnight-start policy |
| BR-14 | For GCash and bank transfers, staff must verify **actual receipt of funds in the designated receiving account** before confirming payment. A screenshot or transaction reference alone is insufficient. | Agreed product policy |
| BR-15 | Refunds and corrections require **owner approval** and an explicit rule per transaction type. Whether a refund terminates, shortens, or preserves access depends on the documented refund reason, never an implicit default. | Agreed authority/principle; per-reason access disposition mandatory |
| BR-16 | Offline receipts are entered upon reconnection, with mandatory shift-end custody/count/handover of any outstanding receipts. Voids, gaps, and missing numbers must remain traceable. | Agreed policy |
| BR-17 | Staff prepare day-end reconciliation; the owner approves unresolved differences. | Agreed policy |
| BR-18 | MVP uses simple time-based plans and owner-controlled prices; existing member records are migrated only after verification. Unsupported/uncertain historical payments remain flagged, not invented. | Agreed product boundary |
| BR-19 | Owner and authorized staff may investigate/document/escalate **missing-payment claims**. Only the owner may approve and execute omitted-payment recovery with independent corroboration of actual collection. Staff cannot approve/execute recovery or alter confirmed finances (approved October 25, 2026). | Agreed exception policy |

### 6.1a Approved policy clarifications (2026-10-23; date rules superseded 2026-10-24)

1. **Fixed-30-day membership dates (superseding clarification, 2026-10-24):** Follow PROJECT.md FR-05: the monthly-labeled plan lasts exactly **30 consecutive 24-hour days**, replacing the earlier calendar-month rule. Represent a paid membership as a start-inclusive, end-exclusive interval, with end = start + 30 elapsed days. A new membership or late renewal starts at **00:00 Asia/Manila on the local date of the verified full payment**; a valid late full-cash outage renewal uses the original verified cash-collection date. A payment at 18:30 therefore has a midnight effective start that day and less than 30 × 24 hours of prospective access. An interval beginning 2027-01-31 00:00 ends 2027-03-02 00:00; one beginning 2028-01-31 00:00 ends 2028-03-01 00:00; one beginning 2027-04-15 00:00 ends 2027-05-15 00:00. Consecutive fully paid renewals begin at the previous interval's exact end, without gaps or overlap. User approval on 2026-10-25 settles the S-02 display and advance limit: exact PHT expiry plus whole 24-hour days and whole hours rounded down at the displayed server check time, or "less than 1 hour" below one hour, for the current active term only. Allow one queued paid term; block another sale until it starts while preserving committed same-key recovery. October 25, 2026 approval resolves independently verified omitted full-cash recovery dates under PROJECT.md FR-07. Uncertain/conflicting cash dates/prices and all cross-date digital confirmation remain gated.
2. **Offline temporary access:** When an authorized owner/staff collector receives the *entire price in cash* and issues a controlled numbered temporary receipt, they may grant **access for that visit only**. This is a documented exception, not normal digital membership activation and not blanket access for subsequent visits. Subsequent visits require normal verified eligibility or a separately documented, authorized outage exception if service is still unavailable. Any invalid, missing, or disputed receipt is flagged for owner review; never silently erase the receipt or associated access record.
3. **Refund reason-to-access handling:** Classify the reason first (duplicate *record* without duplicate collection; duplicate *actual* collection; incorrect entry; cancellation before use; cancellation after some use; payment reversal). The owner approves each reversal/refund/correction and records **whether access stays, ends, or is adjusted**, plus rationale and effective date. Reversing a duplicate ledger record does not itself justify refunding funds never collected twice. Two real collections require verified funds and an approved excess-payment disposition. Cancellation and used-membership refunds follow disclosed gym terms and applicable consumer protections. **No single automatic membership outcome applies to all refunds.** Discretionary cancellation eligibility/amount/evidence/access terms still require each pilot gym's written approval. The narrow independently evidenced full unintended duplicate-excess refund was approved October 25, 2026; its explicit access outcome and verified external settlement remain mandatory.
4. **Digital payment verification authority:** Only an owner or staff member specifically authorized to view the gym's designated receiving GCash/bank account may confirm digital settlement. A screenshot or reference number alone never verifies funds. Record the reviewer, confirmation time, receiving-account match, and appropriate transaction reference; never retain banking login credentials. Pending, delayed, mismatched, or reversed transfers remain unconfirmed or flagged for owner review until actual receipt is established.

   **Local synthetic approval, user 2026-10-25:** owners designate account labels/methods and explicitly assign named owner/staff verifiers, including themselves; no owner bypass. Match full funds, account and transaction reference; retain an opaque activity-evidence reference and distinct collection/entry/verification attribution. Unavailable verifier means pending plus owner escalation. Cross-Manila-date confirmations stay blocked. These are synthetic test decisions; live named accounts/viewers and evidence-retention procedures remain required. Flags on confirmed transfers append owner review without changing historical confirmation, funds or access.
5. **Missing-payment proof and staff authority:** Only the owner may approve and execute recovery of a previously omitted payment **when independent evidence of actual collection is sufficient and documented** (approved October 25, 2026); staff may investigate/document/escalate (e.g., matched issued receipt plus collection records, or verified receiving-account activity). Record evidence reference, reviewer, collection time, and reasoning. An uncorroborated verbal claim or screenshot is insufficient on its own. Unclear, inconsistent, high-risk, or historically disputed claims escalate to the owner. Staff cannot reverse, refund, void, or modify a previously confirmed financial transaction.
6. **Late renewal paid during an outage:** For a fully paid cash renewal supported by a valid numbered receipt, use **00:00 Asia/Manila on the verified original cash-collection date** as the late-renewal start after back-entry/reconciliation, not the later data-entry date. Preserve distinct collection, receipt issuance, system entry, and verification timestamps. Temporary access on the payment day remains a separately auditable one-visit exception until verification completes.

These are **approved product-level directions**. Precise refund eligibility, supported edge-case plans, and pilot-specific operating instructions must be verified with participating gyms; do not invent them during coding.

**Important distinction:** No outstanding *membership charges* does not imply there can never be refunds, disputed cash, accounting differences, or legacy data to reconcile. Such exceptions must be tracked without creating installment balances.

### 6.2 Proposed controls to validate with pilot gyms

| ID | Proposed rule | Rationale |
|---|---|---|
| PR-01 | Confirmed payments get a unique transaction ID, timestamp, method, amount, member, and authenticated collector. | Investigate missing or disputed transactions |
| PR-02 | No silent deletion or overwriting of confirmed payments; corrections retain original entries and reasons. | Auditability |
| PR-03 | Repeated submission of the same request must not create duplicate payments or membership periods. | Network retries and operator mistakes |
| PR-04 | Cash payments are confirmed by the collector upon receipt; non-cash payments require verification via the receiving account, not only a screenshot or reference. | Avoid false confirmation |
| PR-05 | Only the owner may approve financial corrections/refunds; only the owner may approve/execute missing-payment recovery using independently corroborated actual collection evidence; staff investigate and escalate. | Separation of duties |
| PR-06 | Daily closing compares recorded collections with physically counted cash and verified digital receipts, logging unresolved differences. | Make reconciliation measurable |
| PR-07 | For early renewal, retain the current period and queue the next fully paid period to start at its exact end, without overlap or loss of paid time. | Implements BR-07; rounded-down days/hours and one queued term approved 2026-10-25 |
| PR-08 | Temporary receipt numbers are unique, pre-issued, and accounted for (including voids, missing numbers, and duplicates); re-entry retains collection time, staff member, and receipt reference. | Outage accountability |
| PR-09 | Re-entered outage transactions are marked as pending verification until matching receipt, cash/digital receipt, and owner/staff reconciliation requirements are met. | Avoid treating back-entry as independent evidence |
| PR-10 | Refunds and corrections retain the original entry and reason; a refund's effect on any active or future membership is explicitly determined under an approved case policy. | Auditability and eligibility consistency |

### 6.3 Conceptual workflows (implementation-independent)

**New membership:** Select/create member → choose an approved plan and display exact price and intended 30/90/180-day period → receive and verify full payment → record confirmed transaction → issue reference/receipt → activate the selected period starting at 00:00 Asia/Manila on the verified payment date. Insufficient/unverified payment never activates access or posts a partial membership payment.

**Renewal:** Locate member → show expiration, remaining active days without overstating eligibility, and full price → recommend optional **advance renewal** when active → receive and verify full payment → record transaction and receipt. Early renewal schedules the selected plan-duration period at the current term's exact end; late renewal starts at 00:00 Asia/Manila on its confirmed payment date, with the verified original-collection-date rule for valid outages. Per user approval on 2026-10-25, do not offer another advance sale while a future paid period exists; allow another once that term starts. Preserve committed same-key recovery.

**Normal check-in:** Identify member → determine whether a fully paid membership period is currently effective → admit or show clear inactive/expired outcome → record check-in if enabled. Eligibility must not be inferred from a payment screenshot or unresolved dispute.

**Payment dispute:** Search history; owner or authorized staff investigates/documents/escalates. Only owner approves and executes independently proven omitted cash recovery with original-date rules. Existing confirmed corrections/refunds remain owner-only; approval and verified external settlement are separate. Claims alone never activate access (approved October 25, 2026).

**Daily closing:** Staff prepare method/collector totals, count cash, check verified digital receipts, and reconcile every offline receipt (including void/missing numbers) → owner reviews and approves unresolved differences; open discrepancies remain visible and are not silently cleared. For local synthetic S-06, the user approved all three [closing SOP decisions](S06_CLOSING_POLICY_PROPOSAL.md) on October 25, 2026: Manila midnight cutoff, zero opening membership float with segregated/evidenced cash portions, settled refund outflows on settlement day, executed false-record exclusions and immutable originals with explicit supplements. Staff preparation uses existing cash authority; digital actuals require designated account viewers; owner acknowledgement requires fresh reauthentication and creates no money movement. Live cash handling, physical rehearsal, named authorities/evidence custody and O-09 pilot approval remain separate gates.

**Connectivity outage (agreed manual fallback):** Accept **full cash payment only** during the fallback → an owner or authorized staff member counts cash and issues a controlled, pre-numbered receipt showing member, plan, full amount, actual collection time, staff collector, and number → may grant **documented temporary training access** pending synchronization → when connectivity returns, enter the original transaction using its receipt number and original collection time and verify it without duplication → account for used, unused, void, and missing receipts during mandatory shift-end handover, even when connectivity has not returned. Offline GCash/bank payments must await independent confirmation; receipt issuance alone never verifies a digital transfer. Provisional access is limited to the current visit. Back-entered receipts remain pending verification until matched to physical cash and receipt records; suspicious or invalid entries escalate to the owner.

**Refund or incorrect entry:** Classify the case (wrong amount, duplicate ledger entry, two actual collections, cancellation, transfer reversal, etc.) → preserve original records → obtain **owner approval** for any refund, reversal, or correction of an existing confirmed transaction → record reason, supporting evidence, amount, method, and an explicit access outcome based on the **refund reason**. Staff may separately resolve a verified previously omitted payment claim without altering an existing confirmed transaction. Owner-approved refund reason, money movement, and membership-access outcome are required for each case; gym-specific refund eligibility and amount rules must be documented before those cases are supported.

### 6.4 Status vocabulary

Use the separate dimensions defined in PROJECT.md Section 6:

| Dimension | Controlled terms | Rule |
|---|---|---|
| Payment | Pending verification; Confirmed; Flagged | Preserve confirmed financial history; reversals, refunds, and corrections are linked events. |
| Membership period | Scheduled; Active; Expired; Adjusted/terminated | Scheduled means fully paid but not yet effective. An incomplete purchase has no paid period. |
| Admission decision | Eligible; Not eligible; Provisional single-visit access | A provisional visit is separate from a CRM-confirmed membership. |
| Exception case | Open; Under review; Escalated; Resolved | Case progress does not automatically grant or revoke access. |

Use **uncompleted purchase request** for an unpaid transaction and **scheduled paid period** for a fully paid advance renewal. Do not combine these under “pending renewal” or imply a partly paid membership. These terms do not prescribe database enums. Normal eligibility requires verified access; a midnight effective start does not bypass payment verification. Existing independently verified active access remains valid while a separate renewal is pending.

## 7. Product goals and measurable success criteria

### Primary outcomes

1. **Payment accuracy:** Fewer missing, wrong-amount, delayed, or disputed membership records.
2. **Operational time:** Less time spent reconciling after operating hours.
3. **Eligibility accuracy:** Staff can reliably distinguish active from expired or unpaid memberships.
4. **Accountability:** Collections and exceptions can be traced to specific records and operators.

### Proposed pilot thresholds — not validated benchmarks

| Metric | Reported baseline | Proposed target | Measurement method |
|---|---|---|---|
| Payment discrepancies per gym per month | ~15 | **5 or fewer** | Categorized exception log; verify against cash/digital evidence |
| Reconciliation time per operating day | 1–2 hours | **30 minutes or less** | Owner/staff time log using same start/end definition |
| Same-day recording rate | Unknown | **≥95%** | Payments recorded on collection date / independently verified payments received |
| Expired-member admissions | Occurs; rate unknown | **0 mistaken admissions during pilot** | Sampled check-in logs plus documented incidents |
| Time to verify membership eligibility | Unknown | **≤15 seconds**, exploratory | Timed common check-in tasks; establish baseline first |

**Measurement safeguards:** Distinguish true discrepancy reduction from underreporting. Do not count a decrease as success if staff stop recording exceptions, cash discrepancies remain unexplained, or legitimate memberships are incorrectly rejected. Report absolute counts **and rates per transaction** so month-to-month volume changes do not distort results.

### Additional pilot adoption measures — approved

Track the measures approved in PROJECT.md Section 10:

1. **Point-of-collection entry rate:** CRM entry during collection rather than deferred entry; report authorized offline receipts separately.
2. **Staff adoption across shifts:** Proportion of applicable shifts/operators using the approved workflow.
3. **Unapproved parallel recordkeeping:** Occurrences of paper/spreadsheet shadow ledgers outside the authorized outage fallback.

Define denominators and independent verification in O-09. These measures help explain outcomes; numerical targets remain unset until baseline evidence is collected.

### Pilot quality gates

- No unresolved high-severity payment-integrity issue caused by the product.
- No unauthorized alteration of confirmed transactions.
- No routine need to keep a second paper/spreadsheet payment ledger to compensate for product defects.
- Staff can reliably follow the workflow under ordinary operating conditions.

## 8. MVP scope and non-goals

### In scope — minimum capabilities

1. **Member records:** Search/create members; associate membership plan, paid period, and current status.
2. **Plans and exact charges:** Show defined full prices and payment obligations before confirming a new membership or renewal.
3. **Full-payment transaction recording:** Capture method, verified amount, authenticated collector, time, and transaction reference; issue retrievable confirmation.
4. **Membership eligibility:** Determine whether the member has a currently effective, fully paid period and support a basic check-in status check.
5. **Payment history and corrections:** Search transactions; record disputes, evidence references, and authorized corrections with an audit trail.
6. **Daily reconciliation:** Group expected collections by method/operator, capture actual totals, and record discrepancies.
7. **Basic owner/staff access:** Appropriate permission boundaries and accountability for sensitive actions.
8. **Connectivity fallback support:** Track pre-numbered temporary receipts entered after recovery, prevent repeated receipt reference use, and expose unreconciled outage transactions for owner review. Printing or issuing physical receipts occurs outside the application while offline; a fully offline digital application is out of scope.

### Explicitly out of scope for initial MVP

- Partial payments, installments, accounts receivable, debt collection, and payment plans.
- Public booking, classes, personal training scheduling, equipment management, and gym inventory.
- Marketing CRM, referral campaigns, lead funnels, loyalty rewards, and mass messaging.
- Sophisticated attendance analytics, biometric entry, turnstile integrations, or hardware automation.
- A member-facing mobile app or self-service portal.
- Multi-branch enterprise administration, franchise management, and complex financial accounting.
- Automated payment gateway or POS integration **unless evidence shows manual verification cannot meet the pilot goal**.
- Automated renewal reminders until their necessity and channel preferences are validated.
- Local-first offline digital payment capture, device-to-device sync, or automatic offline activation; the selected fallback is physical numbered receipts followed by verification and re-entry.

### Scope guardrail

A feature belongs in the MVP only if it materially improves payment correctness, membership eligibility, traceability, or daily reconciliation for pilot gyms. Additional requests go into a later backlog and require evidence.

## 9. Assumptions, risks, and unresolved decisions

### Key assumptions to test

- A small gym will consistently use a single digital transaction workflow at the time of payment.
- The biggest source of reconciliation work is missing/incorrect transaction records rather than unrelated bookkeeping tasks.
- Owners will review and act on exceptions at closing.
- Staff can perform the flow quickly enough during busy periods.
- The full-payment-upfront rule reflects the policy that pilot owners are actually willing to enforce, including any grandfathered memberships.
- A lightweight eligibility check provides enough attendance control without additional hardware.

### Material risks

- **Offline or unreliable connectivity:** authorized temporary access is allowed for full-cash numbered receipts, but the provisional entitlement, physical custody, back-entry, and reconciliation require stringent controls.
- **False verification:** transfer screenshots or staff mistakes can be mistaken for settled payments.
- **Unrecorded cash:** software cannot prove a cash collection happened if nobody records it.
- **Shared accounts or weak permissions:** collector attribution becomes unreliable.
- **Migration and legacy disputes:** old spreadsheets may include debts or unclear renewals incompatible with the new no-balance rule.
- **Operational burden:** excessive confirmation steps could cause employees to bypass the system.
- **Privacy and security:** member data, staff accounts, and financial records require appropriate safeguards and retention policies.

### Decisions confirmed on 2026-10-23, reconciled with PROJECT.md on 2026-10-24

| ID | Decision | Agreed policy |
|---|---|---|
| D-01 | Early and late renewals | For an active membership, show remaining days and offer optional advance renewal; its next term begins at the paid current term's exact end. An expired membership's new term starts at **00:00 Asia/Manila on the confirmed payment date**; a valid full-cash outage renewal uses the verified original collection date. |
| D-02 | Duration and effective start | The monthly-labeled term is **exactly 30 consecutive 24-hour days**. New memberships and late renewals use the approved midnight start; advance renewals begin at the preceding paid period's exact end. This supersedes the earlier calendar-month policy. |
| D-03 | Payment methods and verification | Cash, GCash, and bank transfer; independently verify actual funds before confirming digital payments. |
| D-04 | Refunds/corrections | **Owner approval**, transaction-type-specific handling, and reason-dependent impact on membership access. |
| D-05 | Disputed missing payments | Staff may investigate/document/escalate; only owner approves/executes independently proven omitted-payment recovery or edits/reversals of existing confirmed finances (October 25, 2026). |
| D-06 | Closing | Staff prepares reconciliation, owner approves unresolved differences. |
| D-07 | Outage fallback | Full cash payment may be accepted with controlled numbered receipts and **authorized temporary access**; enter/verify after reconnection and account for open receipts at shift end. |
| D-08 | Plans and legacy records | Simple time-based plans, controlled pricing, and verified migration. |

### Remaining material decisions (do not allow implementation to improvise)

| ID | Open detail | Proposed resolution to evaluate | Priority |
|---|---|---|---|
| O-01 | **Resolved — fixed 30 days and midnight start:** 00:00 Asia/Manila on verified payment date for new/late terms, start-inclusive/end-exclusive periods, adjacent renewals. | User approval on 2026-10-25: exact PHT expiry plus whole days/hours rounded down at server check time; "less than 1 hour" below one hour, current active term only. One queued paid term; another sale only once it starts, with committed same-key recovery preserved. | Resolved |
| O-02 | **Resolved — offline provisional access:** full-cash numbered receipt permits one visit with authorized staff/owner approval; unverified/invalid evidence escalates. | Local synthetic physical instructions approved October 25, 2026 in the outage SOP; live coverage/evidence handling remains gated. | Local design resolved / live P1 |
| O-03 | **Partly resolved October 25, 2026:** exact full independently evidenced unintended duplicate excess refund for the same obligation approved. | Discretionary cancellations before/after use require written pilot eligibility, amount, evidence and access terms; no prorating default. | Design approved; cancellation/live terms blocked |
| O-04 | **Resolved — only designated account-authorized owner/staff verify actual receipt;** references/screenshots alone are insufficient. | Assign named verifiers at the pilot gym and define escalation when unavailable. | Resolved / detail P1 |
| O-05 | **Design resolved October 25, 2026:** staff investigate/escalate; owner alone approves and executes recovery with independently corroborated actual collection and verified original cash dates. | Named live investigators/account authorities and backups, secure evidence access/handling/retention SOP need pilot approval. | Design approved; live operations blocked |
| O-06 | Local numbering/custody/independent verification and every-shift signed handovers approved October 25, 2026 in the outage SOP. No new daily closing cutoff or automatic write-off. | Live booklet control, named operators/backups, evidence custody/retention and operational coverage remain required. | Local design resolved / live P1 |
| O-07 | **Resolved 2026-10-24:** Monthly ₱800/30 elapsed days, 3 Months ₱2,100/90 elapsed days, 6 Months ₱4,000/180 elapsed days. | User approved initial prices/fixed durations; later prices owner-only with historical snapshots. Other variants/discounts unsupported. | Resolved |
| O-08 | Migration acceptance: who verifies historical expiration, how to handle contradictory evidence or legacy unpaid balances, and cutoff for pilot metrics. | Owner sign-off on imported entitlements; unresolved legacy records are flagged and excluded from new-payment metrics until resolved. | P1 |
| O-09 | Pilot definition and measurement: participating gyms, baseline dates, trial duration, outages and partial days, independent evidence, collection timestamp, and denominators/verification for approved adoption measures. | Define pilot protocol and track **time of collection**, **receipt issuance**, **CRM entry**, and **verification** separately; define point-of-collection entry, shift adoption, and unapproved parallel-recordkeeping observations. | P1 |

PROJECT.md Section 9 resolves independently verified recovered cash dates as of October 25, 2026; uncertain cash dates and delayed digital confirmations across dates remain gated, alongside live cash handling and pilot adoption of the approved local closing SOP; and member/evidence data stewardship, retention, and backup/restore responsibilities. The one-queued-term rule was approved on 2026-10-25. Preserve evidence and timestamps, and block or escalate the remaining affected journeys until their decisions are recorded.

### Cross-policy conflict audit

1. **Offline access vs. confirmed-payment activation:** Provisional access after full cash/numbered receipt is an explicit *operational exception*, not a fully synchronized membership. It must be labeled provisional and reconciled. Temporary access lasts one visit; suspicious or invalid receipts trigger owner review and do not create an automatically verified digital entitlement.
2. **Owner-only corrections vs. staff resolving missing-payment claims:** Both roles may investigate an *omitted* payment, but only owners may approve/execute recovery, change, void, reverse, or refund confirmed finances (October 25, 2026). A newly recorded recovered payment must include evidence, reviewer, original collection timestamp, and duplicate safeguards (O-05).
3. **No outstanding balances vs. payment disputes:** No partial sales or installment entitlements are permitted. Disputes, refund liabilities, reversed transfers, and historical errors are tracked as exceptions, not installment plans.
4. **Late renewal vs. early renewal:** An expired membership starts its new period at 00:00 Asia/Manila on confirmed payment date; advance renewal starts at the exact end of existing paid access. An offline receipt may state original collection time while confirmation occurs later; use midnight on the original verified collection date for a valid late full-cash renewal after reconciliation, preserving system-entry and verification times.
5. **Fixed duration and exact dates:** End = effective start + 30 elapsed days, using start-inclusive/end-exclusive periods. Do not advance by calendar month or clamp to month end. The midnight start is approved. S-02 display approval on 2026-10-25 requires exact PHT expiry and current-term whole days/hours rounded down at server check time, or "less than 1 hour" below one hour. Test month ends, leap years, and payments made later in the day.
6. **Digital fund verification vs. payment screenshot:** Screenshot/reference is supporting evidence only. Confirmation requires verified actual receipt in a designated GCash/bank account.
7. **Same-day entry metric vs. outage fallback:** Count receipt issuance on collection day independently from later CRM entry. Never backdate system creation time to make same-day recording targets look achieved.
8. **Refund impact depends on reason:** No automatic access cancellation or extension should be inferred from the refund event; owner approval must capture the specific reason, eligibility determination, and access disposition.

## 10. MVP validation strategy

### Stage A — confirm discovery and baselines

- Recruit pilot gyms matching the intended segment; document recruitment and participant count.
- Observe actual join, renewal, check-in, disputed-payment, and closing procedures.
- Collect 2–4 weeks of baseline data if feasible, with explicit dates and definitions.
- Categorize each payment discrepancy and measure independently verified transaction counts, closing duration, and expired-member admission incidents.
- Confirm the full-payment policy and validate the remaining pilot-specific operational details, especially O-03 and O-06 through O-09, with participating gyms.

### Stage B — low-fidelity workflow validation

- Test sample workflows with owner and staff before development: full cash payment, verified GCash/bank renewal, early renewal, expired check-in, disputed cash claim, incorrect entry, closing mismatch, and numbered offline-receipt re-entry.
- Confirm that displayed terms, transaction details, and exception handling match the gym's real-world process.
- Measure task time and identify where staff might defer recording.

### Stage C — limited operational pilot

- Roll out to a small number of participating gyms (exact count TBD).
- Agree on a clear pilot start date, responsible reviewer, fallback process, and incident protocol.
- Record the metrics in Section 7 weekly; review discrepancies by cause rather than only total count.
- Capture staff workarounds, outages, incorrect membership denials, and user confidence in records.

### Stage D — go/no-go review

Proceed to broaden scope only if the product demonstrates meaningful improvement in discrepancies and reconciliation time, supports accurate paid-period eligibility, and has no unresolved critical integrity issues. If outcomes are weak, diagnose whether the cause is product design, unrecorded transactions, business-policy mismatch, training, or unreliable measurement before adding features.

## Appendix A — Glossary and proposed measurement definitions

- **Confirmed payment:** Payment whose receipt has been verified using the gym's approved method and committed to the transaction record. A cash outage receipt can support **authorized provisional training access** but is not automatically a synchronized, reconciled CRM transaction.
- **Membership period:** A start-inclusive, end-exclusive interval tied to a fully paid membership charge, or verified historical entitlement accepted through migration. The MVP monthly-labeled term lasts exactly 30 consecutive 24-hour days.
- **Uncompleted purchase request:** An intended join/renewal without confirmed full payment; it creates no paid period, outstanding debt, or part-payment plan.
- **Scheduled paid period:** A fully paid advance renewal whose start is in the future; distinct from an unpaid request or pending verification.
- **Payment discrepancy:** A material difference between the transaction record and independently checked facts, including missing entry, wrong amount, duplicate, disputed evidence, or delayed entry. Categories must be reported separately.
- **Reconciliation time:** Active time used to match recorded payments with actual collections and investigate differences after a defined daily cutoff; excludes unrelated cleaning or operations.
- **Unauthorized expired-member admission:** A documented instance of gym access when no eligible membership period or approved exception existed.

## Appendix B — Relationship to `PROJECT.md` and readiness gates

**S-07 local design approval, October 26, 2026:** The user approved both decisions
in [the legacy/measurement protocol](S07_LOCAL_POLICY_PROPOSAL.md). Member-capable
operators prepare historical evidence; a freshly reauthenticated owner independently
checks original gym evidence and separate corroboration before exact-interval
sign-off. Uncertain/duplicate/overlapping proposals grant no additional access;
other verified access remains assessable. No dummy payment, receipt, receivable or
historical sales total is created. Renewal uses accepted access without changing
existing purchases. The [manual worksheet](S07_MEASUREMENT_WORKSHEET.md) defines
independent event denominators, Manila cutoffs, collection/issuance/entry/verification
times, incidents, active-time, eligibility samples and adoption coverage. UNKNOWN
and zero-denominator results are explicit. Synthetic exercises prove neither live
baseline nor improvement. Named live participants, actual baseline/trial dates,
source custody/retention, real training and pilot sign-off remain separate gates.

[PROJECT.md](PROJECT.md) is the **source of truth** for current MVP requirements, implementation slices, acceptance criteria, and decision gates. This document supplies aligned product context and policy references. Record approved changes in PROJECT.md first, then synchronize the affected BR/D/O entries, workflows, glossary, and pilot measures here.

Settled invariants may be implemented and tested with synthetic data while conditional paths remain gated. Confirm written discretionary cancellation eligibility/amount/evidence/access terms (O-03); the narrow full unintended duplicate-excess refund is already approved. Confirm operational SOP details (O-06 through O-09), baseline measurement sources, and the derived readiness details in PROJECT.md Section 9 before enabling the affected live behavior. Fixed 30/90/180-day terms, verified cash original-date rules and midnight starts are settled; remaining operational decisions must stay visible and must not be invented during implementation.

## Appendix C — Approved exception scenarios and authority

These scenarios record the product team's agreed operating direction; exact evidence thresholds and time-bound effects remain governed by Section 9's open decisions.

| Scenario | Approved handling | Who may resolve |
|---|---|---|
| Payment marked confirmed but receiving account has no funds | Flag for review; verify against actual account; owner authorizes reversal of incorrect confirmation and reviews granted access; retain original entry. | Owner |
| Missing numbered offline receipt | Flag number; inspect booklet copies, collector, cash and member records; document void or unresolved discrepancy; never invent amount or assume misconduct. | Owner |
| Duplicate entry versus two actual payments | If one collection, reverse the duplicate ledger entry; if two collections, owner authorizes appropriate refund or other policy-compliant disposition. | Owner |
| Advance renewal while current term is active | Display exact remaining active days and actual expiration; recommend optional fully paid advance renewal beginning immediately after current term; don't overwrite current entitlement. | Owner or authorized staff may record advance renewal |
| Day-end cash shortage | Record expected versus physically counted cash; investigate; keep unresolved shortage visible; no silent changes to ledger. | Owner approves unresolved difference |
| Member reports payment missing from CRM | Owner/authorized staff investigate/document/escalate. Owner alone approves and executes independently proven omitted cash recovery with original-date rules; uncertainty stays unresolved. Existing confirmed history remains immutable. | Staff investigation; owner-only recovery approval/execution (October 25, 2026) |

### Minimum exception record (proposed)

Exception ID and type; affected member and payment/receipt reference where applicable; who reported it and when; evidence reference; reviewer and action timestamp; investigation notes; outcome; linkage to recovered payment, authorized correction or refund; and any change to membership access. Retain original records and avoid storing unnecessary sensitive financial credentials.

### S-04 superseding policy clarification - approved October 25, 2026

Staff investigate, document and escalate; only the owner approves and executes recovery/corrections/refunds. Verbal claims and screenshots alone never establish actual collection. Preserve independent opaque evidence references, reasoning, reviewer, actual collection time, entry and verification timestamps. Uncertain, contradictory and high-risk claims stay unresolved. No financial credentials or unnecessary sensitive evidence. Recovered full cash starts on original verified collection-date Manila midnight for new/late terms, with 30/90/180-day durations, early adjacency, no overlaps and one queued term. Reject uncertain/conflicting dates; never shift other periods. Digital reported, actual-received and verification Manila dates must still agree; no cross-date exception.

One actual collection with duplicate records requires an owner-approved zero-movement correction. The narrow approved refund requires two independently verified actual collections for the same obligation, unintended excess, exact full excess amount and explicit owner-approved access outcome. A legitimate second purchase is not an error. Approval, execution/awaiting external settlement and verified completion are distinct; the CRM does not transfer funds. Preserve immutable originals with linked attributable, atomic, idempotent adjustments. Discretionary cancellation before/after partial use remains blocked pending pilot written eligibility/amount/evidence/access terms; no prorating defaults, store credit, installments or general ledger. Live evidence handling/retention, named investigation/account authorities and backup coverage, privacy/data stewardship and hosted operations remain unapproved operational gates.

### S-05 local operating detail approved October 25, 2026

The user approved all seven decisions in [the local outage SOP and paper templates](S05_OUTAGE_POLICY_PROPOSAL.md), resolving O-02/O-06 design for synthetic implementation and physical rehearsal. Apply gym-scoped immutable booklet/number uniqueness, assigned custody, independent designated verification separate from collector/entrant, signed counts and handovers at each actual shift boundary, retained exception/investigation evidence and original-date verified recovery. A lost member copy requires corroborated retained receipt/cash/custody evidence. No automatic repeat admission or second payment is implied; separate owner visit authorization remains outside the app. Live named authorities/backups, physical booklet control, evidence custody/retention and pilot coverage still require approval/evidence.
