# S-07 owner/staff training and synthetic rehearsal

**Scope:** local synthetic workflows only, October 26, 2026. Training material
is not evidence that real staff have been trained. Follow [PROJECT](PROJECT.md),
the [approved outage SOP/forms](S05_OUTAGE_POLICY_PROPOSAL.md),
[closing SOP](S06_CLOSING_POLICY_PROPOSAL.md) and
[approved local legacy/measurement protocol](S07_LOCAL_POLICY_PROPOSAL.md).

## Before the exercise

Use individual synthetic owner/staff accounts, a member-capable/cash-capable
staff operator, explicitly designated account viewers and a separate outage
verifier independent of collector and entrant. Verify local origin, synthetic
mode and both local DB destinations before fixture/migration writes. Use fictional
source references only. Never collect real money or send live email in this exercise.
Keep an exercise ID, participant role, facilitator, actual exercise time,
source/record links, observed result and PASS/FAIL/NOT OBSERVED per checklist row.
Do not enter real names or signatures to claim a synthetic exercise was physical.

## Staff quick instructions

1. **Join / collect:** search `/members` before creating a person. Review the
   approved plan, exact full amount and dates before collection. Full cash only;
   partial payments are not membership. Keep the retrievable confirmed receipt.
   Pending GCash/bank claims grant no access. Only a designated account viewer
   may independently verify actual receiving-account funds; a screenshot is not
   funds verification. Do not collect twice to resolve an unknown response.
2. **Renew / admit:** inspect current access and exact PHT expiry. At the exclusive
   end there is no access from that interval. Early renewal follows verified
   access; one queued paid term blocks another sale. A pending claim or uncertain
   legacy record does not revoke separate independently verified access. Record
   actual admission/denial incidents independently; a lookup is not attendance.
3. **Investigate:** open `/investigations`, find immutable original records, record
   the claim and independent evidence, then escalate. Staff cannot approve or
   execute recovered omitted payments or alter confirmed finance. Distinguish
   one collection with duplicate records from two actual collections. Seek fresh
   owner approval and an explicit access outcome; never edit originals.
4. **Outage:** use only a registered, assigned, pre-numbered booklet, full cash,
   the original approved price and actual collection/issuance times. One documented
   provisional visit only. Check every number and perform signed handover at each
   actual shift boundary, including a prolonged outage. Preserve lost/void/missing
   leaves and custody gaps. Enter `/outage-receipts` after recovery; keep pending
   until separately designated independent verification. Never grant a second
   visit from the first receipt or invent another collection on recovery day.
5. **Legacy / closing / review:** on the member page prepare original source and
   corroborating references, interval meaning, dates and uncertainty. This is
   historical access review, not a payment. Staff do not approve it. At `/closing`,
   inspect every collector/method and independently evidenced actuals; submit only
   after Manila day-end. Escalate differences. At `/pilot`, reconcile source links
   with the [worksheet](S07_MEASUREMENT_WORKSHEET.md); never use CRM row count as
   proof that every real collection is recorded.

## Owner quick instructions

- Assign capabilities and verifier grants explicitly. Owner status alone does not
  grant receiving-account or independent outage-verifier authority. Require fresh
  password verification for sensitive owner actions; keep passwords private.
- Verify legacy sources independently, review exact interval and uncertainty, and
  approve only supported evidence. Duplicate/overlapping approval is blocked.
  Flag/reject immutable evidence; link a new proposal when facts change. No dummy
  collection, receipt, unpaid balance or historical sales total is permitted.
- Approve and execute only supported S-04 cases: independently evidenced omitted
  full cash, zero-movement correction or exact full unintended duplicate excess.
  Preserve originals and explicit access disposition. Approval does not transfer
  money. Record independently verified external refund settlement separately with
  actual payout method/time. Discretionary cancellation remains unavailable.
- Acknowledge closing differences without clearing them. Retain originals and
  submit an explicit linked supplement after late evidence, with rechecked or
  explicitly reaffirmed counts. Refunds belong to actual settlement day; recovery
  remains on original collection day. Never silently balance a shortage.
- Review independent measurement coverage, unresolved incidents, missing timing,
  admission exceptions/wrongful denials, shift adoption and shadow ledgers weekly.
  Retain worksheet revisions and follow-up owners. UNKNOWN is an honest result.

## Facilitator checklist and reproducible sequence

| Exercise | Expected result / required negative case | Evidence slot |
|---|---|---|
| Individual login/capabilities | Owner and staff login; pending/disabled/unauthorized denied | |
| Join / digital collection | Staff creates member; pending claim grants no access; designated actual-funds confirmation creates one receipt/period; screenshot-only denied | |
| Renewal / eligibility | Early term starts at current end; queued second sale blocked; exact-end boundary and current historical access distinguished | |
| Investigation | Staff records/escalates claim; staff direct approval denied; original history preserved | |
| Approved correction/refund | Owner reviews/executes supported case; one collection/two records has zero movement; two actual excess collections retain separate events; approval alone no payout | |
| Outage / recovery | Controlled receipt on D, one visit; entry on D+2; separate verifier; duplicate/conflicting number blocked; no second collection or automatic second visit | |
| Closing | Ended day, multiple collectors/methods, independent actuals, visible difference; staff submits, owner acknowledges; late supplement preserves original | |
| Legacy access | Staff proposes two sources; uncertainty flagged; owner signs exact historical interval; no fabricated money; staff/anonymous/cross-tenant denied | |
| Measurement | `/pilot` source links and actual timestamps; reproduce worksheet 3-event denominator, 48h delay and missing-data cases | |
| Usability/recovery | 375px, keyboard error links/focus, readable labels, retained correction values, saved-key retry after lost response/reload; no duplicate result | |

Automated local reproduction: guarded local database → `npm.cmd run db:generate`
and `npm.cmd run db:migrate` → `npm.cmd test` → `npm.cmd run build` → start the
compiled app with `npm.cmd run start` → set `AGENT_BROWSER_BIN` to the existing
installed executable → `npm.cmd run test:browser`. Check the current
[ledger](IMPLEMENTATION_STATUS.md) for actual results and browser environment.
The configured browser script rehearses the supported S-01–S-07 workflows in
order with owner/staff roles. Distinct synthetic members isolate the conflicting
financial/legacy scenarios; it is one staged rehearsal, not a live gym session.

## Incident and escalation procedure

1. Record exercise/incident ID, actual occurrence and reporting times, source
   references, affected member/payment/case/booklet/closing links, category and
   current access/funds uncertainty. Do not log secrets or raw credentials.
2. For suspected unauthorized finance, cross-tenant exposure or corrupted history,
   stop the affected workflow and escalate to the owner/implementation lead.
   Preserve evidence; do not test further against real data. General outage permits
   only the separately approved controlled full-cash fallback when its prerequisites
   exist. No digital offline confirmation or automatic repeat admission is allowed.
3. Staff preserve/escalate. Owner authorizes only supported procedures. Unsupported
   cancellation, uncertain historical prices/dates, cross-date digital confirmation,
   lost evidence or unavailable independent verifier stay blocked/pending. Do not
   demand a second payment as a workaround. Use the approved external documented
   owner process for a particular later-visit exception; record it separately.
4. Record accountable follow-up, containment, evidence check, linked correction or
   actual settlement, access outcome and owner review. Reconcile recovery/closing
   supplements and measurement revisions. Closing acknowledgement does not resolve
   an incident. Resume only after evidence supports safe behavior.

**Still NOT VERIFIED:** named live participants/backups, real baseline/trial dates,
real staff training, physical cash/booklet rehearsal, actual admission/adoption,
live custody/access/retention, privacy/operations, hosting/email/monitoring/restore,
business improvement and pilot launch. R-04 remains deferred. No live readiness
approval follows from completing this synthetic checklist.
