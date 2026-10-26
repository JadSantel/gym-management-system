# S-07 measurement worksheet and fixed synthetic example

**Protocol:** [approved local O-09 decision](S07_LOCAL_POLICY_PROPOSAL.md#decision-2--o-09-reproducible-manual-measurement-protocol).
**Use:** copy the blank fields for each review and retain numbered revisions.
No real observations, baseline or business improvement are established here.
The [fixed fictional source fixture](fixtures/s07-measurement.json) is executable
through `tests/pilot-measurement.test.ts`. Its source IDs denote independent
fictional observations, not actual bank/cash evidence. `/pilot` supplies linked
application records to reconcile with a worksheet; its rows are not a denominator.

## Review cover sheet (blank template)

| Required field | Record before calculation |
|---|---|
| Gym / synthetic flag / revision / previous revision | |
| Reviewer / independent checker / sign-off / actual review time | |
| Baseline or trial / start inclusive / end exclusive / PHT cutoff | |
| Evidence as-of time / application retrieval time | |
| Complete cash, paper/custody and receiving-account sources | |
| Applicable operating days / partial days / outages and source gaps | |
| Cutoff classification / exclusions / unresolved legacy issues | |
| Denominator complete? YES / NO / UNKNOWN, with proof | |
| Source-to-application mapping / missing links / truncation | |
| Critical incidents / limits / follow-up owner / due time | |

Never fill an absent observation with zero. A missing denominator is UNKNOWN;
an independently verified empty denominator is N/A (zero denominator). Keep
known counts visible. A source list truncated by `/pilot` is incomplete.

## Source worksheets (one row per event, retain revisions)

| Sheet | Required columns and links |
|---|---|
| Collections | Stable actual-event ID, independent source IDs, collector, method, integer centavos, actual collection instant, first CRM entry or MISSING/UNKNOWN, verification instant, controlled paper issuance if applicable, all linked payment/receipt/outage IDs, observed interaction start/end, observation source, original classification |
| Source coverage | Every cash batch, booklet range/shift handover and receiving-account interval, independent checker, completeness, uncovered amount/event range, source reference; sources do not become extra collections |
| Legacy | Proposal/decision/member links, historical interval, source references, uncertainty, entry/approval times; HISTORICAL_ENTITLEMENT / LEGACY_EXCEPTION / pending review; always excluded from new collections |
| Financial changes | Original payment IDs, duplicate-record versus two-actual-collection evidence, executed exclusion, owner request/approval/execution IDs, actual refund settlement time/method/reference; approval alone moves zero |
| Incidents | Stable incident ID, category, occurrence and report times, affected actual-event IDs or UNLINKED, application case/closing links, independent evidence, actor, reviewer, impact, open/resolved and resolution reference |
| Closing work | Business day, operator, work-segment start/end, active or break/unrelated, task and original/supplement links, observation reference; include investigation and later supplements |
| Eligibility sample | Predeclared shift/sample rule, consecutive attempt ID, lookup start, defensible result time or MISSING, failure/correction, observed decision and source; do not omit slow/failed checks |
| Admission | Actual attempt ID/time, admit/deny, access and approval facts known then, eligible/expired/provisional/uncertain, category, authorizer, evidence and escalation link; a page view is not attendance |
| Adoption | Roster shift and operator IDs, applicable duties/reason excluded, workflow used/not used/unobserved, independent observer/source; record operator-shift and whole-shift coverage separately |
| Parallel records | Occurrence ID, source, operator/shift, purpose, approved outage fallback or unauthorized shadow ledger, independent observation; observed zero needs coverage evidence |

All links must resolve inside the same gym or to the fictional source attachment.
Do not copy passwords, tokens, account credentials or live personal data.

## Calculation rules

Apply the full definitions in the approved protocol. Use the source collection
identity, not the number of CRM payment rows. Two actual transfers are two
collections; duplicate rows and later recovery never increase the denominator.
Window membership uses actual collection time and Manila `[start,end)` dates.
Round displayed rates to two decimals after counting; preserve exact fractions.

| Measure | Reproducible calculation |
|---|---|
| Category count | Distinct incident IDs by MISSING_ENTRY / WRONG_AMOUNT / DUPLICATE_RECORD / RECORDING_DELAY / DISPUTED_CLAIM / DUPLICATE_COLLECTION, with open/resolved breakdown |
| Category rate | Distinct independently verified actual-event IDs affected in category / independently established collections in window; unlinked incidents shown separately |
| All affected collections | Union of affected actual-event IDs; never sum overlapping categories |
| Same-day CRM | Actual events with first entry on actual collection's PHT date / independent collection denominator; known missing entries fail numerator; unknown entry times make result UNKNOWN |
| Entry / verification delays | First CRM entry minus collection; verification minus collection, separately; no backdating or substitution of receipt issuance |
| Paper same-day | Independently established applicable paper events issued on collection date / complete applicable paper-event subset; report subset and coverage |
| Point of collection | Actual events whose independently observed interaction contains first CRM entry / all actual collections; UNKNOWN if interactions are unobserved; offline paper subset separately |
| Closing work | Sum nonoverlapping active segments per operator after cutoff, including investigations/supplements; sum operators' person-minutes; also report elapsed span and missing day logs |
| Eligibility samples | Durations lookup-to-defensible-result; retain failed/missing rows; observed n, missing n, median, min/max and sampling scope; incomplete sample result marked incomplete |
| Admissions | Counts by mistaken admission, wrongful denial, authorized outage visit, separately owner-authorized exception, pending/uncertain; rates only with complete independently observed attempt denominator |
| Adoption | Used / applicable shifts and used / applicable operator-shift pairs, separately; incomplete observation yields UNKNOWN with known counts |
| Shadow ledgers | Distinct unauthorized occurrences; authorized numbered outage fallback is separate; unknown observation coverage prevents an observed-zero claim |

## Fixed example and independent arithmetic

Fictional baseline September 17–30; trial October 1–14; cutoff October 1 00:00
PHT; as-of October 17 00:00 PHT. The baseline has **no observations**. Trial source
events `C1`–`C3` link to independently enumerated fictional receipt/cash/account
evidence in the fixture. An older recovered event `OLD` belongs before cutoff.

| Result | Fixed synthetic calculation / expected value |
|---|---|
| Actual trial collections | C1, C2, C3 = 3; four CRM rows because C2 has a duplicate; OLD excluded |
| Recorded gross | 4 × 80,000 = 320,000 centavos; actual collections 240,000; executed false-record exclusion 80,000; adjusted gross 240,000 |
| Same-day CRM | C2 and C3: 2/3 = **66.67%** |
| D / D+2 | C1 collected October 3 10:00 PHT; paper 10:01; CRM entry October 5 10:00; verification 11:00. Entry delay **48h**; verification lag **49h** |
| On-day paper issuance | C1: 1/1 = **100.00%**, paper subset only; distinct from CRM entry rate |
| Recording-delay rate | C1: 1/3 = **33.33%** |
| Duplicate-record rate | C2: 1/3 = **33.33%**, one incident despite two CRM rows |
| Duplicate-collection rate | C3: 1/3 = **33.33%**; it remains an actual collection despite subsequent refund |
| Missing-entry / wrong-amount categories | Zero observed incidents in this complete fictional window: each 0/3 = **0.00%**. The executable variant adds one of each on C1: each 1/3 = **33.33%**, without increasing the 3-event denominator |
| Disputed claim | I4 is one OPEN, unlinked claim. Show count 1 separately; no attributable actual-event rate is established for it |
| Unique affected collections | C1, C2, C3 = 3; category counts are not added for a total |
| Refund | C3: owner approval October 6 moves zero; independent actual CASH payout October 7 moves 80,000; original BANK attribution retained. Net on settlement day may be negative |
| Point-of-collection entry | Observed C2 and C3 interaction contains entry; C1 deferred: 2/3 = **66.67%**; authorized offline paper collection: 1/3 separately |
| Closing active work | A: 10 + 15; B: 5 concurrent; later supplement A: 5 = **35 person-minutes**; initial elapsed span 30 minutes, later 5 separately |
| Eligibility | Three observed checks: 8, 12, 20 seconds; median **12s**, range **8–20s**; one additional untimed failure retained; complete timing UNKNOWN |
| Admissions | One each mistaken admission, wrongful denial, authorized outage visit, separately owner-authorized exception and pending/uncertain; observed attempt denominator UNKNOWN, counts only |
| Adoption | Whole shifts: 1 used / 2 applicable = **50.00%**; operator-shifts: 2 used / 3 applicable = **66.67%**; excluded shift has no applicable duties |
| Shadow ledger | 1 observed unauthorized occurrence; 1 controlled outage-paper occurrence reported separately |
| Missing/zero checks | Add uncovered source: whole-window denominator UNKNOWN, known subtotal 3; zero verified collections: N/A; remove interaction/adoption observations: relevant rate UNKNOWN |
| Baseline / improvement | **NOT VERIFIED**, synthetic fixtures cannot establish either |

This example does not prove real training, cash/booklet custody, admission
accuracy, pilot adoption, baseline validity, measured improvement or live readiness.
