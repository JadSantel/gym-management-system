# S-05 approved local outage procedure and paper templates

**Status: APPROVED for local synthetic S-05 only, October 25, 2026.** The user approved all seven decisions through the in-session policy question. This does not authorize live operation. Physical forms below are approved for synthetic rehearsal; live authority, evidence handling and operational coverage remain gated.

Decision required by [PROJECT FR-09, AC-09a–f and §9 O-02/O-06](PROJECT.md), [product BR-10/11/16 and PR-08/09](product.md), and [design UX-10](design.md). The settled full-cash, one-visit, pending-until-verified and original-date rules remain controlling. The following seven decisions supply the approved local details.

## Approved decisions for local synthetic implementation

1. **Numbering and registry.** A freshly reauthenticated owner registers a physically pre-numbered booklet before use, with an immutable gym-unique uppercase booklet code, inclusive numeric range and assigned custodian. The full paper identifier is `BOOKLET-NUMBER`; its scope is the gym, with database uniqueness on gym/booklet/number. Booklet codes and numbers are never recycled. Register the whole range, including unused leaves; reject overlapping or duplicate registration. Printing and physical issuance remain outside the app. A registry entry alone proves neither collection nor admission.
2. **Collection and entry authority.** An active owner or cash-capable staff member may collect only from a booklet assigned to their custody. Record the actual authorized collector separately from the later entrant. Back-entry requires member-management and cash capabilities; owners satisfy those existing checks. Preserve historical attribution after offboarding. Do not rewrite the collector to the person entering the record.
3. **Independent verification.** A freshly reauthenticated owner designates active owner/staff outage verifiers separately from digital-account verification authority. Designation is required even for an owner. The verifier must differ from both collector and entrant, and independently match the paper receipt, full cash collection record and custody/handover evidence. All three evidence references and an explicit attestation are required. If no independent authorized verifier is available, keep the entry pending; do not activate normal access. Staff cannot use this verification to change existing confirmed finance. Missing-payment recovery/correction remains in the existing owner-only S-04 flow.
4. **One visit and later visits.** The first valid full-cash receipt may document one provisional visit, including member, authorizer and actual admission time. It never establishes an online paid term before verification. An old receipt alone never admits a later visit. For the local scope, permit no automatic repeat exception: without normal verified eligibility, staff must seek a separately documented owner decision for that particular visit. Record its separate paper incident reference, reason, authorizer and time for owner review; keep repeat-visit approval unavailable in the application until its separate terms are approved. Do not demand another membership payment solely because entry is pending.
5. **Lost, missing, void and conflicting receipts.** A lost member copy does not authorize a replacement payment or visit. Preserve the original identifier; seek the retained booklet copy and independent cash/custody records. Verification may proceed only if those establish the original transaction unambiguously; otherwise retain an owner-visible exception and investigation. Keep void leaves physically attached, with reason/actor/time and no invented amount. A missing leaf remains missing with an investigation reference. Conflicting reuse appends evidence linked to the original number and an investigation; it never overwrites facts, consumes another number silently or creates another payment. An exception cannot erase a documented provisional visit or an already confirmed payment.
6. **Shift handover and prolonged outage.** Use actual shift boundaries, not a new daily closing cutoff. At every handover, outgoing and incoming identified custodians physically check every number as used, unused, void or missing, count cash still held, list cash already transferred with evidence, list outstanding receipt/verification items, and sign the paper handover with the actual time. Identify the next custodian even if connectivity remains unavailable. Repeat at every later shift boundary; alert the owner at each handover with unresolved missing/conflicting items. Enter each original handover after recovery with a distinct system entry timestamp. Record unresolved differences as open; signatures do not settle them. No cash float, closing total, forced balancing, aging timeout or automatic write-off is introduced.
7. **Recovery and historical uncertainty.** Enter all used receipts, exceptions and handovers promptly when service returns; keep payment claims pending. Verify against an approved historical plan/price snapshot, original cash date and independent evidence. If the historical price/date cannot be established, leave the case pending for owner review; do not substitute today's price or entry date. For valid late full-cash collection on D and verification on D+2, use D at 00:00 Asia/Manila only after confirmation. Preserve early-renewal adjacency, fixed 30/90/180 elapsed days, one queued paid term and `[start,end)` eligibility. Existing conflicting periods or another paid term must block unsafe confirmation. Same-key retry returns the committed result; number reuse must also be blocked across different keys and competing requests.

Approval permits local synthetic implementation and rehearsal only. Real booklet procurement/control, named operators and backups, privacy/evidence custody/retention, pilot coverage and live-readiness evidence remain separate gates.

## Paper forms — synthetic rehearsal only

These forms must be printed or prepared before the simulated outage. No app access, network, spreadsheet synchronization or online identifier generation is needed during physical issuance/handover.

### Booklet assignment

| Field | Record |
|---|---|
| Synthetic gym / booklet code / inclusive range | |
| Registry reference prepared before outage | |
| Custodian identity / authorizing owner | |
| Physical leaf count / retained-copy arrangement | |
| Assignment actual time (Asia/Manila) / signatures | |

### Full-cash paper receipt and first provisional visit

| Field | Record |
|---|---|
| Full controlled receipt identifier | |
| Member name and stable member reference if known | |
| Approved plan / fixed duration / historical price evidence | |
| Full amount actually counted (PHP) / method CASH | |
| Actual collection time / actual issuance time (Asia/Manila) | |
| Collector identity / signature / booklet assignment reference | |
| One provisional visit granted? YES / NO | |
| If YES: actual admission time / authorizer / incident reference | |
| Retained receipt copy / cash record references | |

Partial cash and unverified digital transfers do not qualify. If member identity, full price or authorized custody cannot be established, escalate; this form supplies no permission to guess. Preserve actual timestamps; never backdate later entry or verification.

### Shift custody handover

| Field | Record |
|---|---|
| Handover reference / gym / booklet and range | |
| Outgoing custodian / incoming custodian | |
| Actual handover time (Asia/Manila) | |
| Used numbers / count, with receipt and cash record references | |
| Unused numbers / count physically inspected | |
| Void numbers / count, attached leaves and reasons | |
| Missing numbers / count and investigation references | |
| Cash physically held and transferred (PHP) | |
| Prior cash transfers / amounts / independent references | |
| Outstanding entries, pending verification, gaps and differences | |
| Owner escalation reference for unresolved exceptions | |
| Both custodians' signatures | |
| Later recovery entrant / actual system entry time | |

Account for each number exactly once in the physical status counts. Pending/verified are separate recovery states of used receipts, not extra leaves to add to physical totals. A claimed cash amount must never fill a missing receipt or cash gap.

### Exception or later-visit incident

| Field | Record |
|---|---|
| Incident reference / original receipt number / member | |
| Missing / lost copy / void / invalid / duplicate / conflict / later visit | |
| Known facts / conflicting evidence / actual incident time | |
| Any provisional visit already granted, authorizer and time | |
| Independent receipt, cash and custody references available | |
| Owner notified / investigation reference / unresolved issues | |
| Separate owner later-visit decision and evidence, if one exists | |

This form records evidence only. It does not approve admission, funds, replacement receipts, refunds or entitlement.

## Synthetic paper simulation and manual rehearsal

**Local synthetic simulation verified October 25, 2026.** `tests/outage.test.ts` and the configured compiled-app browser suite exercise the following cases; exact results are in [the implementation ledger](IMPLEMENTATION_STATUS.md). Browser offline emulation confirms application requests fail while simulated paper facts and two shift handovers remain independently available for later recovery. Historical pre-outage registry/price fixtures and fictional signature attestations are test setup. No real people physically counted cash, signed paper or rehearsed live operation. Use the printable forms and steps below for that separate pre-live rehearsal; do not present synthetic attestations as real signatures.

1. Before disconnecting, register one synthetic booklet and assignment; prepare printed forms and approved plan/price evidence. Simulate full cash for one member on D, record issuance and one visit. Attempt partial cash/unverified digital and deny this exception. Attempt reuse for another visit and require a separate owner decision; do not infer another payment due.
2. Remain disconnected across two shifts. Physically classify every leaf, record used/unused/void/missing numbers, cash and open differences; both custodians sign each handover. Preserve original times and linked incidents. Rehearse a lost member copy and a missing retained leaf without making up amounts or replacement payment.
3. Reconnect on D+2; back-enter receipts, visits, exceptions and handovers. Expect pending entries, actual later entry times, owner-visible exceptions and no new normal entitlement. Attempt staff without capabilities, foreign-gym references and unassigned custody; expect no writes.
4. A designated independent verifier checks all evidence. Verify valid late renewal from D midnight and an early renewal adjacent to the existing period. Verify 30/90/180 days, exact expiry and queued-term limit. Reject collector/entrant self-verification, stale owner administration, uncertain historical dates/prices and conflicting evidence without financial changes.
5. Use real restricted PostgreSQL tests for same-key replay/lost response, distinct-key receipt reuse, concurrent entry/verification, rollback after injected failure, unique number scope, immutable originals, missing tenant context and pooled tenant isolation. Browser-check owner/staff pending, verified, unavailable and exception states, receipt/member links, keyboard flow and narrow screens. Confirm one payment/period/receipt linkage and one original provisional visit.

Required milestone commands remain those in the user task: `npm.cmd run db:generate`, `npm.cmd run db:migrate`, `npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build`, `npm.cmd run test:browser`, `git diff --check`. Assert both isolated database destinations, synthetic guard and local origin before any fixture writes or migrations. Record actual results in [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md); do not promote this plan to PASS.
