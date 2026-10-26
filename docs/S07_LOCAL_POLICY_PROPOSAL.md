# S-07 local legacy and measurement protocol proposal

**Status: APPROVED for local synthetic S-07.** October 26, 2026 (Asia/Manila).
The user answered: "Approve both local decisions as written" to the combined
O-08/O-09 decision question. This does not approve live operations.
Applies only to synthetic local implementation and rehearsal of FR-11/12,
AC-11a–c, AC-12a–c and UX-12. Neither this document nor silence approves policy.
The two decisions below resolve local design only. Named live participants,
baseline/trial dates, operational evidence custody, retention, real training,
pilot launch and operational sign-off remain separate gates.

Controlling gates: [PROJECT §9 O-08 and O-09](PROJECT.md#9-decision-register-and-implementation-gates).

## Decision 1 — O-08: reviewed manual legacy access

1. Use manual entry, not an import engine. An operator with member-management
   authority may prepare a member-linked proposal. Only a freshly reauthenticated
   owner may verify and approve access. Record preparer, actual entry time,
   verifying/signing owner, actual approval time and immutable decision reason.
   Verification requires an independent contemporaneous gym access record and a
   separately referenced corroborating record; a member assertion, unsupported
   payment claim or screenshot alone is insufficient. An owner may prepare and
   approve only after independently checking these sources; this proposal does
   not introduce a mandatory second-owner role.
2. Preserve source identifiers (the specific member entry/item, not merely the
   name of an entire register), source types, claimed dates, uncertainty and the
   exact proposed/approved interval. Evidence references are references to fictional
   local evidence, not uploads or sensitive source contents. A later decision links
   to its predecessor; neither proposals nor decisions are overwritten.
3. Interpret explicit instants as given. Interpret a documented local start date
   as 00:00 Asia/Manila; an explicitly inclusive "valid through D" ends at 00:00
   D+1. Store UTC and evaluate `[start,end)`. Missing start, ambiguous date meaning,
   conflicting expiry, unsupported historical payment and legacy unpaid balance
   remain flagged with no access from that proposal. Do not derive a historical
   interval from today's price or assume a 30-day historical purchase. Starts must
   be at or before actual entry; an evidenced expiry may be after entry.
4. Approval grants independently verified access only after approval; it does not
   prove earlier admission. Store legacy provenance separately from purchases and
   connect it to the effective entitlement projection. Create no charge, payment,
   receipt, collection date, sales total, receivable or refund right.
5. Duplicate source identifiers in the same gym cannot grant access twice. Keep
   conflicting assertions for review. Reject approval overlapping any existing
   current effective interval, including other accepted legacy access. Do not merge,
   trim, shift or overwrite intervals automatically. A different source proposing
   the same dates also cannot grant duplicate access. Preserve rejected attempts.
6. Existing independently verified access remains assessable while a separate
   legacy proposal is uncertain. Future sales use accepted legacy access in the
   existing renewal calculation: early paid renewal follows its exact end; one
   queued paid term still blocks another sale. Historical onboarding must not
   resequence an already confirmed purchase. A conflicting approval remains under
   review; supported owner corrections retain their existing financial scope.

Example: fictional register `LEG-A` and independent access card `CARD-A` establish
September 20 through October 31 inclusive. Accept `[2026-09-20T00:00+08:00,
2026-11-01T00:00+08:00)` after owner verification, with actual October entry/approval
times. No money is added to September or October. A new paid renewal may begin
November 1. Another source claiming November 5 expiry stays flagged; it neither
extends this interval nor revokes other verified access. An overlapping paid term
blocks approval rather than being rewritten.

## Decision 2 — O-09: reproducible manual measurement protocol

Use a small versioned worksheet with linked application IDs and independent
fictional source references. Application records supply event times and source
history; independent observations supply missing collections, timing and adoption.
Do not build a general analytics system. Preserve revisions and reviewer sign-off.

- **Windows and cutoff:** configurable, explicitly recorded half-open Manila
  calendar-day windows. Synthetic demonstration only: baseline September 17–30,
  2026; trial October 1–14, 2026; cutoff October 1 at 00:00 PHT; as-of October 17 at
  00:00 PHT. These are fictional fixture dates, never an observed live baseline.
  Compare only windows with equivalent coverage; label partial days, outages and
  unresolved coverage. Report weekly within each window. No extrapolation to a
  month and no improvement claim from synthetic observations.
- **Classification:** classify by original actual collection time, not CRM entry
  or verification. Accepted legacy access is `HISTORICAL_ENTITLEMENT`, uncertain
  proposals are `LEGACY_EXCEPTION`; neither is a collection. All rehearsal rows
  also carry `SYNTHETIC`. Pre-cutoff recoveries remain pre-cutoff collections and
  are shown as later entry events, not new trial receipts. Separate original gross,
  executed false-record exclusions and actual settled refund outflows as in the
  [approved closing SOP](S06_CLOSING_POLICY_PROPOSAL.md). Refund approval alone is
  zero movement. Keep original collection and actual refund-settlement methods.
- **Independent denominator:** reconcile actual collection events to independently
  checked cash counts plus controlled receipt/custody evidence, or receiving-account
  ledger entries. Give each actual collection a stable source identity; link all
  CRM records to it. Two actual transfers count twice even for one obligation;
  duplicate CRM records for one actual transfer count once. Recovery is the same
  event, never a second collection. Unsupported claims are disputed incidents,
  outside the verified count. Incomplete evidence means the true denominator is
  UNKNOWN; report the known subtotal and coverage gap without a percentage.
- **Discrepancies:** categories `MISSING_ENTRY`, `WRONG_AMOUNT`, `DUPLICATE_RECORD`,
  `RECORDING_DELAY`, `DISPUTED_CLAIM`; separately report `DUPLICATE_COLLECTION`.
  Count distinct incident IDs by category and affected actual collection IDs.
  Categories may overlap: do not sum category counts into a unique total. Report
  open/resolved state without erasing the original incident. Category rate =
  distinct independently verified collections affected in that category / all
  independently verified collections in the window. Show unlinked/disputed
  incidents separately; they cannot enter a collection-rate numerator until linked.
- **Recording:** delay = actual first CRM entry minus actual collection instant;
  retain verification lag separately. Same-day rate = actual collections first
  entered on their collection's Manila date / independent collection denominator.
  A known missing entry fails the numerator. Report unknown entry times and
  coverage; never replace an unknown time with zero. Paper same-day issuance has
  its own numerator/coverage. Point-of-collection entry requires an independently
  observed collection interaction start/end containing the first CRM entry;
  a same-day timestamp alone does not prove it. Rate uses all actual collections;
  observed authorized offline paper interactions are reported separately. Missing
  observations make this rate UNKNOWN, with observed counts still shown.
- **Timing:** closing active minutes = sum of nonoverlapping, attributed work
  segments after that day's cutoff, including investigation and supplements,
  excluding documented breaks/unrelated work. Parallel operators' person-minutes
  are summed; report elapsed time separately. Show days with no log as missing,
  never zero. Eligibility samples start when the operator begins member lookup
  and end when a defensible decision is displayed; include lookup and corrections.
  Preselect consecutive applicable checks in declared observation shifts, retain
  failures, sample size, missing times, median and range; disclose sampling limits.
- **Admission and escalation:** log actual admission/denial time, decision,
  effective verified access known then, evidence, operator, reviewer and outcome.
  Categories: mistaken admission, wrongful denial, authorized single-visit outage
  exception, separately documented owner-authorized exception, pending/uncertain.
  Do not infer actual attendance from opening a member page. Admission error rates
  need an independently observed complete admission-attempt denominator; otherwise
  show counts only. An authorized exception does not become normal entitlement.
- **Adoption:** predeclare applicable shifts and operator-shift pairs from a
  fictional roster with collection/eligibility duties. Mark each as approved
  workflow used, not used, or unobserved, with independent observation evidence.
  Report used / all applicable shifts, and used / all applicable operator-shift
  pairs separately; UNKNOWN if coverage is missing. Nonapplicable shifts need a
  reason. Count distinct unapproved shadow-ledger occurrences by operator, shift
  and source; authorized controlled outage receipts are separate. Zero requires
  observation, not absence of a report.
- **Missing data:** unknown or zero denominators produce `UNKNOWN` or `N/A (zero
  denominator)`, never 0% or 100%. Missing numerator observations produce UNKNOWN
  with known counts. Every result retains source links, window, as-of time,
  reviewer, exclusions and coverage limitations. Unresolved critical incidents
  prohibit a readiness/success conclusion. Live baseline validation and business
  improvement remain NOT VERIFIED.

Worked collection fixture: `C1` cash collected/receipted October 3, entered October
5; `C2` transfer collected/entered October 4 with two CRM records; `C3` a second
independently verified unintended transfer October 4, entered that day. Denominator
is 3 actual collections, not 4 CRM records. Same-day CRM rate is 2/3 (66.67%);
same-day paper issuance is 1/1 (100%, cash-paper subset only). `C1` is a recording
delay despite on-day paper issuance. One duplicate-record incident affects `C2`:
1/3 (33.33%). `C3` remains a second collection even if its excess is later refunded.
Approval is not settlement. A recovered September collection entered October 5
does not enter this October denominator. Add an uncounted source gap and all
whole-window collection rates become UNKNOWN, preserving the known count of 3.

## Approval record and implementation gate

- Decision 1 (O-08 local): **APPROVED by user October 26, 2026**.
- Decision 2 (O-09 local): **APPROVED by user October 26, 2026**.
- Live O-08/O-09, data stewardship and operational readiness: **NOT APPROVED**.

Both explicit answers are recorded above. PROJECT/product/architecture/design
reflect local approval. Implementation/check evidence belongs in the ledger;
this protocol alone is not S-07 acceptance evidence. Preserve the user's full
S-07 goal and final GitHub checkpoint.
