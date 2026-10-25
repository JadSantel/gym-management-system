# S-06 closing SOP proposal — local synthetic scope only

**Status: APPROVED for local synthetic S-06.** The user explicitly approved all three decisions on October 25, 2026 (Asia/Manila), answering "Approve all three for local synthetic S-06". This authorizes the scoped implementation and local verification below. Live/pilot approval remains separate.

## Approved decisions

The user's explicit approval covers decisions 1–3 together for local synthetic implementation. PROJECT FR-10, AC-10d and Section 9 "Derived closing detail" require an agreed cutoff, cash-counting convention and late-adjustment procedure. This approval supplies those local decisions; O-06 alone establishes no daily cutoff, and O-09 pilot operating-day approval remains separate.

### 1. Business day and cutoff

Use the Asia/Manila calendar day: inclusive 00:00 on D to exclusive 00:00 on D+1. A payment belongs to its independently established actual collection/receipt time, never its later entry or verification time. Final submission is available only after the day ends; an earlier view is a preview. Record preparation, submission and approval as actual server timestamps. A digital claim remains pending until existing designated-account verification succeeds; existing cross-date digital confirmation restrictions remain in force.

Example: October 25 runs from October 24 at 16:00 UTC through, but excluding, October 25 at 16:00 UTC. An exact-end collection belongs to October 26. Membership effective dates retain their separate existing rules.

### 2. Counting convention and allocation

For this local scope, use zero opening membership cash float. Keep non-membership receipts, petty cash, expenses and owner injections outside membership collection batches; record their presence as an exception and block a count that cannot separate them. Do not add a general ledger or an expense/removal feature. Existing evidenced custody transfers are allowed and remain attributed to the original collector; the receiving custodian is not a new collector. Unexplained removals remain a shortage/custody exception, never a balancing adjustment.

For each actual collector and method (CASH, GCASH, BANK), show separately:

- Original confirmed payment records, with unique payment/source references; recovery adds the confirmed source once, never both its pending claim/paper entry and payment.
- Executed record corrections: exclude the identified false duplicate record or confirmed funds-absent record from adjusted collections, retaining its original row, amount, owner execution and retained-payment link. A zero-movement date/access correction changes no collection amount. An incorrect amount without an approved explicit replacement stays visible for investigation; do not infer a replacement amount from a zero adjustment.
- Independently evidenced actual gross collections and their count/account evidence. For cash, count the day's segregated collection batch and include evidenced portions already transferred or paid out from that batch exactly once. Preserve physical cash held, transfer/payout references and the reconstructed gross count. Never add prior-day cash to today's collection count. Unknown or unallocatable cash stays an open exception. For digital, require the existing designated account viewer's independently checked receiving-account evidence; staff preparation or a screenshot alone is insufficient. A zero actual requires an explicit count/check, not a default.
- Refund outflows only after existing owner settlement evidence, on the actual settlement day, with the original payment and original collector shown. Attribute the outflow to that original collector/method for reconciliation reporting, while separately identifying the actual settling owner; this is not a claim that the original collector paid the refund. Approval or execution awaiting settlement contributes zero outflow. Two actual collections remain two gross collections before any settled refund.

Preserve the actual payout method beside that original-method reporting allocation. Physical cash-batch payout evidence is bounded by actual cash settlements, including a bank collection refunded in cash; a non-cash payout supplies no physical cash coverage. Show these movement facts and their original/later timestamps in current review and captured history.

All calculations use integer PHP centavos:

`adjusted recorded gross = confirmed recorded gross - executed false-record exclusions`

`gross difference = independently counted/verified gross actual - adjusted recorded gross`

`expected net = adjusted recorded gross - evidenced refunds settled in this day`

`actual net = independently counted/verified gross actual - the same evidenced refund outflows`

Keep gross collections, corrections, settled outflows and net side by side; never disguise an outflow as a negative payment or a new collection. Net may be negative on a refund-only day. Refund evidence must establish actual payout; closing approval cannot establish it.

Example: staff A recorded PHP 1,600 cash but independently counted PHP 1,550: shortage PHP 50. Staff B's verified GCash PHP 800 and bank PHP 2,100 reconcile separately; a pending PHP 800 transfer contributes no confirmed total. A PHP 800 approved but unsettled refund changes none of these amounts. Its later evidenced settlement produces a PHP 800 outflow on the settlement day, linked to the original collection. A false second PHP 800 record for one actual collection is shown as original gross PHP 1,600, executed record exclusion PHP 800, adjusted gross PHP 800, and no refund movement.

Cross-method example: an original BANK PHP 800 excess is actually refunded in CASH on D+2 by the owner. D+2 net reporting allocates PHP 800 to the original collector/BANK, while the separate actual-settlement record shows CASH, the settling owner, reference and timestamps. That actual CASH payout may explain PHP 800 paid from an evidenced cash batch. A BANK payout supplies zero physical-cash payout coverage, even if the original collection was CASH. Allocated net totals describe collection attribution; the movement record preserves the actual payout method.

Staff with the existing cash capability may prepare/submit; only a freshly reauthenticated owner may approve unresolved differences. Every difference needs evidence/notes. Link a member investigation when its member is identified; an unidentified discrepancy stays on the closing with accountable follow-up notes rather than inventing a member. Later case/count evidence can be linked through a supplement. Approval acknowledges accountability and leaves the signed shortage/excess and open issues visible; it does not resolve cases, missing numbers or custody gaps.

### 3. Immutable closing and later changes

Keep every submitted snapshot, its source references, actual evidence, original differences and any owner approval immutable and retrievable. At submission/approval reject stale source evidence rather than silently substituting changed totals. Repeated/concurrent commands must create only one result per operation key and approved snapshot.

Later recovered payments and executed corrections are allocated to the original collection day, with actual later entry/verification/execution/approval timestamps. Later refund settlements belong financially to their settlement day and also appear as linked subsequent events on the original collection day's history. Show these later events alongside the original snapshot without rewriting it. Do not add a recovered prior-day payment to today's collections merely because it was entered today.

Use an explicit append-only supplemental closing submission linked to the original snapshot when totals/count evidence need amendment. Show original and supplemental totals/differences separately, with reason, evidence and fresh owner approval for unresolved differences. Original actual counts are not silently copied as newly checked actuals: require an explicit attestation that the earlier count remains applicable, or new independently evidenced count values. A supplement does not itself create payment/refund movement or erase an earlier shortage/excess. Open-item status may have later linked evidence; original snapshot status remains as recorded.

Example: D closes with PHP 800 recorded and PHP 1,600 independently counted: excess PHP 800 remains in that snapshot. On D+2 an omitted D PHP 800 cash receipt is independently verified. A linked supplement can show adjusted D collections PHP 1,600 and explicitly reaffirmed D actual PHP 1,600, difference zero. D's original excess and approval remain retrievable. D+2 shows the recovery event and timestamps, but no new PHP 800 collection. Pending transfers, used-but-unentered receipts, void/missing numbers, custody gaps and unresolved investigations stay visible until separate evidence explains them; approval alone clears none.

## Verification after approval

FR-10 / US-10 / AC-10a–d / UX-11 use existing tenant, transaction, immutable-event and operation-key patterns. Executable coverage includes all methods/multiple collectors, shortage/excess, pending transfer, controlled receipt gaps, settled versus approved refund, later recovery/correction/supplement, exact boundaries, concurrent submit/approval, lost-response retry, rollback, direct unauthorized/cross-tenant attempts and S-01–S-05 regressions. Real restricted PostgreSQL/RLS and owner/staff browser checks are recorded with their actual results in [the implementation ledger](IMPLEMENTATION_STATUS.md). Read the current ledger rather than treating this SOP as test evidence.

## Repeatable synthetic manual check

Prerequisites: isolated `127.0.0.1:55432/gym_crm_synthetic`, `SYNTHETIC_DATA_ONLY=true`, local app, synthetic owner and cash-capable staff, approved plans, designated GCash/bank viewers and retained fictional count/account/paper evidence. Historical fixtures must be explicitly synthetic; never change immutable real transaction timestamps to make a closing test possible.

1. Open `/closing?day=YYYY-MM-DD` for an ended Manila day with independently established cash/GCash/bank collections from multiple collectors. Review pending transfers, paper receipt gaps and linked investigations. Check actual counts/accounts for each collector/method, including every receiving account of each digital method and explicit zero where appropriate. A staff member without an account-viewer grant must be denied a digital check even if they prepared the closing.
2. Record a synthetic shortage/excess with count/batch references and notes; link the member investigation if known. Submit as cash-capable staff. Attempt staff approval by direct request: expect 403 and unchanged records. As freshly reauthenticated owner, acknowledge the snapshot. Expect the original signed difference and outstanding items to remain visible; no payment, case resolution or refund is created.
3. Independently verify a late paper/omitted cash entry, execute an approved false-record correction or record an actual evidenced refund settlement through its existing supported workflow. Expect original collection versus later entry/approval/settlement times and source links. Recovery affects the original collection day once; a refund affects settlement day only. Approval without settlement creates no outflow. Earlier snapshot/count/difference remains retrievable.
4. Review changed evidence, obtain current independent checks or explicitly recheck/reaffirm the original counts, then submit a linked supplement. Every latest reported actual must be included, even for an unrecorded collector; stale/replaced/omitted evidence must fail. Review original and supplement separately. Before day end, expect preview and blocked final submission. Repeat at 375px and by keyboard; validation moves focus to linked errors and retains entered values.

Local approval does not approve real cash handling, named people/account access, live evidence retention, physical rehearsal, O-09 pilot design or hosted/live readiness. S-07 and R-04 remain outside this task.
