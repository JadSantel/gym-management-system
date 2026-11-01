# Gym CRM — Product Interface and Interaction Design (`design.md`)

**Status:** Proposed UX/UI specification for review; **not** an approval of new product policies, implementation, pilot readiness, or visual brand identity.  
**Prepared:** 2026-10-24 (Asia/Manila)  
**Reviewed:** 2026-11-01: current scope is cash-only; retired S-03-S-06 interface guidance and prior pilot measures below are historical context. Earlier behavior reconciliation and live gates remain governed by PROJECT.md and IMPLEMENTATION_STATUS.md.
**Project:** Independent Gym Management System (multi-tenant SaaS for independent Philippine gyms)  
**Scope:** Current S-01/S-02 cash collection, receipt/history, eligibility and S-07 historical-record review guidance. S-03-S-06 designs below are retired. No pilot or live operation is authorized; see `IMPLEMENTATION_STATUS.md` for exact evidence and current gates.

**Current scope revision — user-approved 2026-11-01:** ordinary online collection is full cash only. Digital collections, Exceptions/investigations/corrections/refunds, outage receipts/custody, and daily closing are retired. Their routes and mutations are unavailable; existing records stay preserved and read-only in relevant history. No out-of-CRM emergency workflow is implied. This revision supersedes the earlier S-03–S-06 interface guidance below.
**Source of truth:** `PROJECT.md` for product requirements, acceptance criteria, and operational decision gates; `product.md` for aligned customer problem and policy intent; `architecture.md` for approved technology, identity, isolation, security, and integrity rules. The conversation handoff provides historical context only.  
**Decision rule:** The layouts, navigation, labels, colors, and responsive behavior in this file are **design proposals** until reviewed. They may be changed without changing a product rule. Where this file and an authoritative document differ, do **not** silently implement the difference; record and resolve it before the affected feature ships.

## 1. Experience goal and boundaries

Build a clear, fast, evidence-oriented tool for owners and authorized front-desk staff at small gyms (working segment: about 80–150 members). Optimize for common counter tasks: find a member, check paid eligibility, display the exact full cash charge, record the cash collection, and retrieve its receipt and history.

Design for **correctness ahead of speed** when confirmation changes membership or financial history. Faster entry must never mean recording funds that were not received, rewriting historical records, or bypassing authorization.

**In scope:** Individual operator account access; member/plan directory; full cash collections and receipts; approved fixed 30/90/180-day paid terms and renewal; eligibility; read-only member/payment history including retained historical records; verified migration; historical pilot evidence archive.

**Not in MVP:** Digital collection/verification; Exceptions and correction/refund actions; outage receipt/custody or provisional visits; daily closing/reconciliation; public signup for gym accounts; member portal/app; installment balances; sales/marketing automation; gym class bookings; biometrics/turnstiles; payment gateway; automated POS; fully offline digital app; broad attendance analytics; multi-branch admin; or general accounting. Existing retired-workflow records remain read-only. No outside-CRM emergency process is implied.

**Working assumptions requiring validation, not product commitments:** Desktop or laptop at reception with occasional phone use; real pilot member fields and gym branding selected later. Connectivity failure has no defined CRM or outside-CRM process; any operational response requires a separate decision. Use owner/staff prototype testing to validate these assumptions.

## 2. Non-negotiable interaction contracts

1. **One person, one attributable operator account.** Product roles are **Owner** and **Staff**; staff capabilities are assignments, not additional roles. Ordinary gym operators cannot perform private platform-administrator bootstrap/recovery functions.
2. **No public owner or staff self-registration.** First owner is privately bootstrapped after platform-admin verification, then completes verified setup. Owner invites staff to their own gym; the staff member privately sets their password. Pending setup is not active access.
3. **Ordinary money entry is full cash only.** The authorized collector physically receives the entire charge before confirmation. No partial membership purchases, debt, installments, digital claims, or pending non-cash queue.
4. **Current states remain clear:** cash confirmation; paid-period state; and eligibility decision. A paid scheduled period is not an uncompleted purchase. Retained provisional/outage and case states are labeled historical and read-only.
5. **For the MVP monthly-labeled plan, duration is exactly 30 consecutive 24-hour days.** New/late verified payment begins at **00:00 Asia/Manila on the verified payment date**; an early paid renewal begins precisely at the previous valid term's end. Use `[start, end)`; access ends at the stated end instant. A 6:30 p.m. payment does not permit admission before verification even though its period's nominal start is midnight on that date.
6. **The exact expiry instant must be shown.** Per user approval on 2026-10-25 (`PROJECT.md` FR-05/§9), show remaining whole 24-hour days and whole hours, rounded down at the displayed server check time; below one hour show “less than 1 hour.” Show this only for the current active paid term, with scheduled terms separate. No relative counter may overstate eligible time.
7. **Financial facts stay auditable.** Cash confirmation creates a retrievable reference and original record. Historical corrections/refunds remain linked read-only; the UI never offers a new adjustment or settlement action.
8. **Outage workflows are retired.** Existing paper receipt and custody records remain historical and read-only. This design defines no external emergency process.
9. **Failures fail closed.** No success/active wording before a committed confirmation; repeat submits and lost responses must resolve to the same stored result, not a second payment or second period.
10. **All protected controls must be enforced on the server.** A hidden or disabled interface element is informational, not an authorization guarantee.

## 3. Users, contexts, and proposed information architecture

### 3.1 User contexts

| Context | Frequent questions | UX requirement |
|---|---|---|
| Front-desk authorized operator | “Is this person eligible now?” “How much do they owe for a *new* full purchase?” | Fast member search, clear access outcome, concise charge review; no collection without verified full funds. |
| Primary owner | “Which actions and receipts are attributable?” | Filterable history, capabilities and account lifecycle. Historical records are clearly read-only. |
| Platform administrator (separate trust boundary) | “Has independent gym ownership been verified?” | **Private and audited** pending-owner bootstrap/recovery; never exposed in normal gym navigation. |

### 3.2 Implemented navigation - November 1, 2026

The sidebar and responsive drawer use **Quick Actions**, **Workspace**, and **Management**, in that order. Empty groups are hidden. The shortcuts deliberately add rows for faster access; grouping alone does not reduce the destination count.

| Group | Label | Route | Visibility / purpose |
|---|---|---|---|
| Quick Actions | Add Member | `/members#member-name` | Owner or staff with member access; targets the existing name field. Creation records no payment and grants no paid access. |
| Quick Actions | Record Cash Payment | `/members#search-name` | Owner or staff with both member access and cash collection permission; targets lookup in Members, then opens the existing profile/full-cash flow. |
| Workspace | Dashboard | `/` | Owner only; existing overview page. |
| Workspace | Members | `/members` | Owner or staff with member access; unified operational lookup, search/create, paid periods, eligibility and profile/payment access. |
| Workspace | Payments | `/transactions` | Owner or staff with member access; confirmed payment history. Historical non-cash records remain read-only. |
| Management | Plans & pricing | `/plans` | Owner only. |
| Management | Team & access / Your account | `/team` | Owner sees Team & access; staff see Your account with existing account permissions. |
| Management | Historical pilot evidence | `/pilot` | Owner or staff with member access; archive only, no current pilot authorization. |

Workspace and Management destinations use exact or descendant route highlighting; Dashboard matches `/` only. Quick Actions are shortcuts, without current-page styling, so Record Cash Payment and Add Member do not duplicate Members' active state. The header uses the destination label. Desktop and mobile both say **Payments**. Below 1024px the drawer contains all permitted groups and the bottom navigation contains Members and Payments for member-capable operators. The drawer retains focus containment, Escape dismissal, focus return and close-on-navigation. The brand link preserves owner `/`, member-capable staff `/members`, other staff `/team`.

**Authorization:** Navigation reflects existing capabilities; server/API checks remain authoritative, including direct requests, fresh capability checks and tenant isolation. Cash permission alone does not expose the shortcut because member lookup/charge preparation also requires member access.

**Deferred:** Reports, Attendance, QR Scanner, public registration, member login/portal and QR attendance require separately approved scope. Do not add placeholders. Payments has no pending/failed/refunded tabs or membership balances. Member eligibility remains Active, Scheduled, Expired and No membership; no undefined "expiring soon" window is introduced.

**Front Desk merge (step 3):** Members reuses the existing lookup/eligibility/creation component and its row list; no duplicate search panel or banner. Creation still grants no paid access, and current admission decisions are rechecked on the member profile. Lookup, creation and full-cash access were verified on Members before replacing `/operate` with a temporary 307 compatibility redirect to `/members` and removing its navigation link. Member-capable staff now land at `/members`. Dashboard, payment-history and profile links use Members directly; the cash shortcut targets the search field. The old desk-only card layout and decorative banner styles are removed.

### 3.3 Current route inventory

- Public/account: `/login` (including owner recovery) and `/setup` for private invitation/reset completion; no public registration.
- Authenticated app: `/`, `/members`, `/members/[id]`, `/transactions`, `/receipts/[id]`, `/plans`, `/team`, `/pilot`, subject to existing server authorization.
- Compatibility: `/operate` redirects to `/members`; destination authorization still applies to signed-out and permission-limited operators.
- Retired routes `/digital`, `/investigations`, `/outage-receipts`, and `/closing` are removed. Existing linked history remains read-only on member/payment pages.
- Private platform operations remain outside normal gym navigation. A route/resource ID never establishes authority; every protected resource is checked within the authenticated gym.

## 4. Selected dual-theme visual direction (presentation only; editable tokens)

**User-selected replacement, October 30, 2026:** follow the supplied `gym-crm-prototype-v2.html` screens and flow. Its final v2 style block supersedes the earlier green CSS: warm paper, ink, one orange accent, and Geist. Root `DESIGN.md` and runtime semantic tokens record the implemented palette and composition. This replaces the October 26 emerald presentation; business and architecture policies remain unchanged.

Both Light and Dark are first-class, with persisted Light/Dark/System selection. Light uses a warm neutral canvas and off-white panels; dark uses near-black layers. Primary actions reverse ink/paper between themes. Orange marks navigation, selected controls and focus; green means confirmed/effective, amber pending/attention, red blocked/destructive. The prototype's dark front-desk banner is adapted to neutral light in light mode under the existing AGENTS.md contract. All text/control contrast still requires rendered checks.

Navigation follows the implemented Quick Actions, Workspace and Management groups in section 3.2: Dashboard, Members and Payments, with Plans & pricing, Team & access and Historical pilot evidence under Management. Digital collection, Exceptions, outage receipt/custody, and daily closing are absent. Owners land at `/`; staff with member access land at `/members`; other staff land at `/team`. Authenticated account identity determines role and capabilities; the prototype's role switch is not implemented.

Member profiles separate current access, queued paid periods, cash payment/receipt history, and retained historical digital, case, adjustment and outage records. Payment follows Plan / Payment / Review using an exact full-cash charge and same-key recovery. Retired historical records are read-only. Prototype attendance storage/check-ins, fictional metrics and optional phone data remain outside scope. Current eligibility remains authoritative.

Use actual local shadcn Button/Input/Card/Badge and native accessible controls where appropriate. Maintain 44px controls, associated errors, busy/retry/empty/permission states, visible keyboard focus, safe-area navigation and responsive tables. No new dependency or external font call is needed; Geist is self-hosted with its OFL license.

## 5. Layout, responsiveness, and accessibility

### Layout proposals

**Sidebar selection (2026-10-31):** the user selected shadcn `sidebar-04`: floating 19rem desktop navigation, grouped submenus, and a header toggle. Below 1024px use its labelled Sheet drawer with keyboard focus containment, visible close, Escape dismissal, and focus return; retain the existing bottom quick navigation. Map sidebar tokens to the current light/dark system and preserve all route permission checks.

- **Wide desktop (≥1024px):** persistent labeled side navigation, page title + context, main content and compact task/status summary. Use tables with aligned monetary amounts and secondary detail sections.
- **Tablet (768–1023px):** collapsible side navigation; important action and access status appear above supplementary history. Avoid hidden destructive action menus.
- **Phone (<768px):** single-column cards, prominent search, full-width action controls, stack field labels, show essential financial/eligibility attributes without horizontal scrolling. For dense ledgers, use accessible responsive record cards or intentional table scroll with headers.
- **Touch:** provide comfortably sized targets (aim ≥44×44 CSS px for principal actions), clear spacing between “confirm” and “cancel”.

### Accessibility contract

- Target **WCAG 2.2 AA** in delivered interfaces where applicable; verify contrast and accessible name/role/state with tooling and keyboard testing. This is a proposed quality target, not a certification claim.
- Form fields have visible labels, format help, and programmatically associated errors. Show currency as `₱` and amount plus textual context; use explicit timestamps with **PHT / Asia/Manila** where ambiguity matters.
- Forms work without a mouse. Initial focus follows dialog conventions; return focus to launcher on close. An async result is announced in an appropriate live region, not just color.
- Ensure screen readers can distinguish **“Payment pending verification”** from **“Payment confirmed”**, and **“Not eligible”** from **“Provisional access recorded for this visit.”**
- Avoid time-limited input sessions tied solely to an animation countdown; show expired invitation/reset link state and clear next step.
- Do not mask financial or access consequences behind a tooltip or a color swatch.

## 6. Content model, formatting, and language

**Initial content language:** English UI copy is proposed; Filipino/Cebuano localization is **not an approved requirement**. Keep strings centralized to support later decisions. User research should validate comprehension of current terms “confirmed,” “scheduled,” and “expired.” Provisional and reconciled labels are historical-only.

**Dates and money**

- Display PHP amounts as `₱1,000.00` using stored integer centavos; user input parsed and validated explicitly. `₱1,000.00` in examples is synthetic, **not** an agreed pilot plan price.
- Preserve exact instants internally; display operator-facing date/time in **Asia/Manila** with full date for evidence records. Suggested: `24 Oct 2026, 6:30 PM PHT`.
- Prefer expiry language: **“Eligible until 2 Mar 2027, 12:00 AM PHT (not valid at or after this time).”** For eligibility checks use server-evaluated current time.
- Do not show rounded “30 days left” after a same-day afternoon purchase without product approval; display exact expiry and a simple **Eligible / Not eligible** determination.
- Use **“30-day membership”** near the plan’s *monthly* label until user research confirms the naming; never imply variable calendar-month length.

### State labels (independent dimensions)

| Dimension | Display labels | Key caution |
|---|---|---|
| **Payment** | Confirmed cash payment | “Confirmed” requires receipt of the full amount. Historical non-cash methods and flags remain read-only. |
| **Membership period** | Scheduled paid period / Active paid period / Expired paid period | “Scheduled” means paid; an unpaid request is **Uncompleted purchase request**. Historical adjustments remain read-only. |
| **Eligibility** | Eligible / Not eligible | A retained provisional outage event is historical and does not authorize current access. |
| **Historical case** | Read-only historical status and event trail | Case state alone never changes current access or payment confirmation. |
| **Operator setup** | Invitation pending / Account active / Account disabled / Link expired | Proposed presentation labels; actual identity state must reflect server truth. |

Do not render a single generic “Active” badge next to a pending transfer or uncertain legacy member. Show reason/help text (e.g., “No currently effective verified paid period”) so staff can explain the decision.

## 7. Common patterns and safeguards

### 7.1 Page shell and search

- Show current gym name read-only in the shell **only if the operator has a valid active gym context**; never expose or offer switching by client-provided ID.
- Page header contains an unambiguous title, short purpose, and no more than one primary next action. Search is forgiving of formatting while respecting gym-scoped data and minimal member fields.
- Lists offer distinct **loading**, **empty**, **filtered-no-result**, **error**, and **permission-denied** states. Avoid showing zero collections during an API failure.
- Deep links to receipts/history are retrievable after refresh; not merely success toasts.

### 7.2 Form and server result behavior

- Client validation helps typing but does not confirm funds, membership eligibility, or authorization.
- For meaningful writes, show **Saving…** without inventing success. Disable accidental repeats locally, but rely on server idempotency for duplicates.
- If a network response is lost after an attempted financial confirmation, show **“Confirmation status unknown. Check the saved reference or retry safely using the same request.”** Requery the operation; do not create a new operation ID automatically.
- A server-recognized retry shows the **same** reference and result. A reused key with different request details shows an actionable conflict, not a second charge.
- Cash submission review displays **member, selected plan, approved elapsed-day duration, exact full amount, actual cash collection timestamp, collector, and intended start/end** before confirmation. Do not rely solely on a confirmation button.
- Destructive or restricted changes require explicit explanation and, where policy requires, recent owner password reauthentication; no shared staff passwords and no simple “Are you sure?” substitute for approval/evidence.

### 7.3 Feedback messages — suggested wording

| Condition | Copy pattern |
|---|---|
| Cash collected and transaction committed | **“Cash payment confirmed. Receipt [reference] is ready.”** Show amount, linked period and collector. |
| Collected amount below full plan charge | **“Full payment required. No membership was activated.”** |
| Historical digital payment | **“Historical digital payment retained read-only. New digital claims and verification are unavailable.”** |
| Future term paid | **“Payment confirmed. Next paid period starts [date/time]. Current access is unchanged.”** |
| Request without authority | **“You do not have permission to perform this action.”** Do not disclose protected records. |
| Historical outage receipt | **“Historical paper receipt retained read-only. It does not grant current access.”** |
| Historical correction or refund record | **“Historical financial decision retained read-only. No new correction or refund action is available.”** |
| Historical closing record | **“Historical closing snapshot retained read-only.”** |

Examples specify semantics, not final microcopy; validate with pilots and translate only upon a product decision.

## 8. Screen and workflow catalog

Each item names the *earliest* slice. Do not build later screen functionality in S-01a just because it appears in this document.

### UX-01 — Login and account protection (**S-01a**)

**Proposed presentation:** One sign-in page with clear **Owner** and **Staff** modes (tabs or segmented choice). Owner enters verified email + password; Staff enters username + password. An account belongs to one gym, so no gym selector. Prevent mode-based account enumeration and ensure the server validates identity, state and gym binding, not the selected tab alone.

- Success: valid session resolves one **active** operator tied to one **active** gym, then shows a minimal authorized landing page.
- Validation/error: generic credential failure, account-disabled/pending path with privacy-safe text, temporary rate-limit message without revealing whether an email/username exists.
- Actions: sign in, sign out, and permitted recovery initiation (owner verified-email reset; staff requires owner-controlled initiation).
- Show a clear “You are signed out” state on logout; protected routes reject expired/revoked sessions at server execution time.
- **Sensitive owner change:** prompt for password reauthentication when the last verified password check is older than **5 minutes**; this is an *additional* check, not an authorization override. Sessions are **7-day rolling**, renewal cadence **24 hours**, with DB-backed revocation (implementation semantics tested, not guessed).

**Prototype test:** Wrong credential, pending/disabled user, expired session, staff trying to use owner-only action through direct request, valid owner/staff entry with distinct accounts. Test credentials are synthetic.

### UX-02 — Private owner bootstrap and invitation completion (**S-01a**)

This is **not** a public gym signup page. A designated platform admin completes independent ownership verification in a private, audited workflow before creating a pending gym/primary owner and issuing the one-use **48-hour** owner setup invitation. The exact real-world proof checklist/reviewer SOP is still open; synthetic verification fixtures only in S-01a.

**Invitation completion page** (reachable only with a valid invitation): identify the expected purpose and intended email in a privacy-safe way, verify mailbox ownership, accept a privately chosen password, show invitation expiry/errors, then activate the owner/gym only after verified setup succeeds. Link reuse, link expiry, replaced link, pending gym, and already-used invitation cannot grant operational access.

**Pending/error views:** “Invitation expired,” “Invitation already used,” “Invitation replaced — use the latest link,” “Account not yet active,” with a controlled resend/help path rather than open registration. Exact text may be adjusted; never expose a raw token on screen or in logs beyond its unavoidable link use.

**Development gate:** No platform sending domain exists. Use an isolated local/test email capture, never real Brevo sending to production recipients during S-01a. Brevo is approved later once domain, sender DNS authentication, secrets and delivery have been validated.

### UX-03 — Staff invitation, setup, offboarding, and reset (**S-01a**, capabilities in **S-01b**)

- Owner-only operator list (within own gym): show name/username/email verification or invitation state, assigned capabilities (when implemented), created/invited timestamp, and active/disabled state. Proposed list fields depend on the eventually agreed minimum personal data.
- Owner **invites staff with a genuine verified email workflow**; the staff member chooses their own password. Owner never chooses, sees, resets to, or emails a permanent password.
- Staff setup links expire after **48 hours**, are single-use, and stay pending if sending fails. Authorized resends rotate/invalidate earlier tokens. Display pending status; do not label email API acceptance “delivered” unless actual delivery status is known.
- Staff password recovery begins only after authorized owner initiation; send the **30-minute**, single-use reset link to the verified staff mailbox. Owner sees audit-safe status, not the link or password.
- Disable/revoke UI communicates effects on current sessions. Revoke server-side immediately; require clear owner confirmation and do not let disabled staff regain access by completing an old invitation or reset.
- One account maps to one gym; account uniqueness/email collision for a person working at multiple gyms is an **integration design blocker to surface**, not permission to manufacture fake email addresses.

### UX-04 — Member list and member detail (**S-01c**, extended S-01f/g and later)

- List: search, stable member identifier, minimal approved display fields, current eligibility, exact paid expiry if known, review flag. Decide personal fields under the data-stewardship gate before live data entry.
- Detail: separate panels for **Admission decision**, **Paid-period timeline**, **Payment/receipt history**, and **Open cases** (when available). History is read-only for staff except the authorized workflows.
- Distinguish no verified history from expired, future scheduled access, pending digital funds, and unverified legacy claim; do not fabricate membership from an imported spreadsheet row.
- Include a safe action to start **New full membership** or **Renew** only when the flow and plan are approved.

### UX-05 — Plan and exact full charge (**S-01d**)

- O-07 approved 2026-10-24: Monthly **₱800 / 30 days**, 3 Months **₱2,100 / 90 days**, 6 Months **₱4,000 / 180 days**. Show fixed elapsed days beside each label. Later prices remain owner-controlled; development stays synthetic.
- Before collection: member, selected approved plan, locked price/duration snapshot, exact **full** charge, method, operator and intended time interval appear in a confirmation review.
- Staff cannot alter plan price, offer unsupported discounts, extend duration, or turn a short payment into a balance.
- If O-07 unresolved for a real gym, show an informational disabled sale state rather than a made-up launch plan.

### UX-06 — Full cash confirmation and receipt (**S-01e–f**)

Flow: select member → server loads active approved plan and amount → enter/verify physical **full cash** receipt → show exact charge and projected period → commit atomically → display **retrievable receipt and payment reference**.

- The success page is visible **only** after the committed payment + original paid period + effective entitlement interval + audit + receipt/reference are present.
- Show real original collector and collection time, with separate entry/verifier timestamps if they differ. Display amount in PHP and date/time in PHT.
- On uncertain network outcome, retain the original client operation key and show a safe “check result”/same-key retry path. No second submit path with a new key unless starting an independently real new collection.
- Receipt includes minimum confirmed facts and a stable reference; do not invent invoice/tax/legal receipt wording, PDF requirement, SMS/email receipt delivery, or printable fiscal compliance without validation.
- Negative cases: short amount, altered price, unauthorized collector, duplicate submission, conflicting idempotency payload, and no completion after partial database failure.

### UX-07 — Eligibility and membership dates (**S-01g**, extended **S-02**)

- Show **Eligible / Not eligible** with rationale and exact effective paid period/expiry. Use authoritative server time and UTC-stored instants converted to PHT; `[start, end)` is the boundary.
- Normal access requires confirmed, **currently effective** paid entitlement. A separately scheduled fully paid future term does not grant access *before* its start. An active earlier term continues to count during a pending future payment.
- For an expired member, late renewal begins at midnight on the verified full payment's local date. A display showing a period starting at midnight must not suggest the staff should have granted access *before verification*.
- **S-02 early renewal:** preview current expiry, rounded-down remaining days/hours, new period start at the exact old end, and unchanged existing paid time. Per user approval on 2026-10-25, allow one queued paid term; prohibit another advance sale until it starts. Keep committed same-key recovery available.
- Suggested date example for QA (synthetic): start `31 Jan 2027, 12:00 AM PHT`; end `2 Mar 2027, 12:00 AM PHT`; at that end instant the term alone is no longer eligible.

### UX-08 — Digital collection and verification (RETIRED 2026-11-01; historical context)

No digital claim or verification interface is available. The previous S-03 screens and policies are retained below only as historical design context; records remain read-only in member/payment history.

**Local synthetic decisions approved 2026-10-25:** record claims from a saved member charge, then use the digital collections queue. Owners designate synthetic account labels and explicitly assign/revoke verifiers after password reauthentication; owner status alone cannot reveal a confirmation action. Confirmation requires independently entered actual amount/reference/time, activity-evidence reference and account-match attestation. Unknown responses preserve the original operation across reloads; retry it before confirming another transfer. Cross-date transfers remain pending for owner review. Show pending claims separately from confirmed history and existing eligibility. Confirmed receipts show method, matched account and evidence reference; dispute flags show owner review with no automatic money/access change. This does not approve live receiving accounts or evidence custody.

- Separate **Record transfer claim** from **Confirm received funds**. Claim UI stores only necessary reference and evidence link; it clearly remains pending.
- Designated verifier reviews actual designated receiving-account funds **outside this app** and records matched account, full amount, reference, time and identity; never ask for or store bank/GCash credentials.
- If no authorized verifier is available: leave transfer pending, show next authorized action, grant no new normal access. Screenshot alone cannot reveal a confirm/activate flow.
- A reversed/flagged confirmed digital payment opens owner-review case; do not unilaterally change the historical confirmed amount or entitlement.

### UX-09 — Exceptions and controlled adjustments (RETIRED 2026-11-01; historical context)

No investigation, recovery, correction or refund interface is available. The previous S-04 design below is superseded; existing records remain read-only and linked to member/payment history.

- Case list/detail: case type, member, linked receipt/payment, evidence references, claim/report time, investigating actor, current case state, decisions and resolution trail.
- Staff investigate/document/escalate; only the owner may approve and execute independently corroborated omitted **full cash** recovery (approved October 25, 2026). Show original collection time separately from later entry/verification. New/late terms use original-date Manila midnight; conflicts stay unresolved. Digital cross-date claims remain blocked.
- Staff may submit a proposed existing-transaction correction/refund; only owner may approve/execute it. Owner review requires explicit **reason, evidence, financial outcome, access outcome (stays/ends/adjusts), and effective date**. Reauthentication as required.
- Treat **duplicate ledger record with one collection** differently from **two actual collections**. Never show a refund as completed until actual money movement is recorded and verified.
- If gym-specific refund eligibility/amount (O-03) is unresolved, case can be documented but discretionary execution remains disabled.

- **October 25, 2026 execution:** separate owner approval, execution and independently verified external settlement controls. Show exact approved amount/method, affected/retained periods and explicit access disposition before execution. Adjusted intervals require explicit dates; never infer from prose. No money-transferred claim. Duplicate-record correction moves zero money; full evidenced unintended duplicate excess alone supports refunds. Discretionary cancellation remains documentable but execution disabled pending written pilot terms. Maintain labelled fields, inline errors/focusable summary, saved retry payloads, keyboard access and mobile layout.

### UX-10 — Paper outage receipts, visits, and recovery (RETIRED 2026-11-01; historical context)

No outage receipt, custody, back-entry or provisional-visit interface is available. The previous S-05 design below is superseded. No external emergency procedure is implied.

**Offline:** application is unavailable by definition. A controlled **numbered paper receipt** plus authorized full-cash collection may grant **only the current provisional visit**. A paper handover and receipt/cash count remain required at shift end. No offline web form, offline digital entitlement, or second-visit reuse is promised.

**After reconnection:** receipt registry/entry UI captures booklet/number scope, actual collector, member/plan, full amount, original collection + issuance times, later entrant + entry time, custody references and recorded one-visit event. Back-entry is **pending verification**, not paid activation. Verify against real cash/booklet/handover evidence; preserve original local collection date for approved late-cash-outage renewal after confirmation.

Flag duplicate receipt number, missing/void/invalid number, mismatched cash, or uncertainty to owner review without deleting original facts. O-02/O-06 local design was approved by the user October 25, 2026 in [the outage SOP](S05_OUTAGE_POLICY_PROPOSAL.md). Show independent-verifier availability, assigned custody, full number accountability, exceptions and distinct actual/entry times. Automatic repeat admission remains unavailable; live operational coverage remains gated.

### UX-11 — Daily closing and review (RETIRED 2026-11-01; historical context)

No daily closing, difference approval or supplement interface is available. The previous S-06 design below is superseded; existing snapshots remain preserved read-only.

- Staff-prepared summary by actual collector and method: confirmed recorded total; counted physical cash and verified digital actuals; resulting difference; independently visible **pending transfers, receipt gaps, corrections, refunds and other unresolved items**.
- Owner reviews and, when permitted, **approves the unresolved difference without changing its amount or hiding the exception**. Staff cannot approve their own discrepancy resolution by role bypass.
- Closing snapshot remains retrievable; later back-entry/adjustment is visibly linked by original collection date and later entry/approval date. Do not silently rewrite a prior closing.
- Local synthetic decisions approved October 25, 2026: Manila calendar-day cutoff, zero opening membership float and segregated batch counts, actual-settlement refund allocation and explicit append-only supplements. `/closing?day=YYYY-MM-DD` shows current source review, independent actual evidence, immutable original/supplement history and linked later events. Final submission is unavailable before day end. Counts require evidence/notes; member-linked investigations can be attached when identified, while unassigned differences remain on the closing with follow-up notes. A designated account viewer must check digital actuals, including explicit zero. Fresh owner acknowledgement changes no amount or open-item status. Live/pilot procedures remain gated; see [approved SOP](S06_CLOSING_POLICY_PROPOSAL.md).

### UX-12 — Historical record review and pilot evidence archive (S-07; revise O-09 before a pilot)

- Historical entitlement onboarding records original independent source, verifier, approved interval and owner/sign-off; contradictory records are **flagged**. Do not create fictitious paid receipts or collections from historical membership data.
- The `/pilot` route is a read-only archive of prior S-07 local synthetic evidence. It does not measure current cash-only operations or establish pilot success.
- Any future pilot needs a revised O-09 with cash-only measures, baseline, denominator and independent evidence. Keep uncertainty and missing data clear; do not use retired outage, exception, digital, or closing measures as current requirements.

Local implementation follows both user-approved October 26, 2026 decisions in
[the S-07 protocol](S07_LOCAL_POLICY_PROPOSAL.md). The member page prepares exact
source evidence and preserves immutable owner decisions; historical access is
labelled separately from paid periods. Staff preparation grants no access;
fresh owner sign-off requires independent sources. Duplicate/overlap conflicts
retain evidence for further review. Saved operations support same-key recovery
after an unknown response. Field errors retain inputs and link to invalid fields.
`/pilot` is a read-only historical archive. Its data and worksheet reflect the old
S-03–S-06 scope and are not current pilot measures. Revise O-09 before any future
cash-only pilot. Bounded source lists disclose truncation; no success claim follows
from synthetic records.

## 9. Current state transitions (UX representation)

Only the full-cash flow below is current. Digital verification, outage access,
investigations, corrections/refunds and daily closing transitions shown in older
design sections are superseded as of 2026-11-01.

```text
Uncompleted purchase request
      | actual full cash received
      | + authorized, atomic server confirmation
      v
Confirmed payment + original paid period + current effective entitlement
      |                   |
      |                   +-- if future start: Scheduled paid period
      |                   +-- if start <= now < end: Active paid period -> Eligible
      |                   +-- if now >= end: Expired paid period -> Not eligible
      |
      +-- owner-approved linked financial/access adjustment (original preserved)

Historical digital claims, outage visits, cases and adjustments -> read-only retained records
```

**Special temporal caveat:** The stored effective interval for an afternoon full payment can begin at local midnight, but a *historical admission decision* still must respect when payment was actually verified. The display must not suggest retroactive authorization of a visit before collection/confirmation. Verify this with time-based tests.

## 10. Consistent empty, loading, and failure states

| Screen situation | UX behavior |
|---|---|
| Invitation has not yet been delivered | “Invitation pending,” authorized resend, delivery problem details only for permitted owner/platform support. No active operator. |
| No platform email domain configured | Clearly marked **local/test only** for development; real invitation/reset delivery disabled. No fictional sender address. |
| Loading member eligibility | Neutral **Checking eligibility…**; do not show stale Eligible as current. |
| Service unavailable during a live collection | Do not imply an offline receipt or provisional-access workflow. Escalate to the gym owner for a separate operational decision; this interface specification defines no external emergency process. |
| Financial request timed out | **Status unknown** until the same idempotent operation is queried/retried. Do not reassure that no charge occurred. |
| Failed read or server exception | Explain the load failed; provide safe retry and opaque support reference; do not claim zero records or expose technical secrets. |
| No permission | Remove action affordance and deny direct requests; generic protection-aware messaging. |
| Unresolved configuration/product policy | Block the affected action; state what requires owner/product setup and keep evidence/request available. |
| No member results | State “No matching members in this gym”; provide authorized Create Member, but never reveal external gym records. |

## 11. Design-to-acceptance traceability

| UX item | Slice | Main `PROJECT.md` trace | Core verification |
|---|---|---|---|
| UX-01–03 | S-01a–b | FR-01, AC-01a–c; `architecture.md` AD-004–010, AD-026–032 | Login, verified setup, 48h/30m token TTLs, permissions, disabled/pending sessions, no public signup. |
| UX-04–05 | S-01c–d | FR-02, AC-02a–c | Member access scope, price snapshot, staff forbidden pricing. |
| UX-06 | S-01e–f | FR-03, AC-03a–d | Full-only funds, one confirmed record, same-key retry/rollback, receipt retrievability. |
| UX-07 | S-01g, S-02 | FR-05–06, AC-05a–e, AC-06a–c | 30×24h, midnight PHT start, leap month-end, end-exclusive, paid early renewal, actual verification time. |
| UX-08 | Historical S-03, retired | FR-04, AC-04a–b | No digital mutation; retained records readable. |
| UX-09 | Historical S-04, retired | FR-07–08, AC-07a–08b | No investigation/correction/refund mutation; history preserved. |
| UX-10 | Historical S-05, retired | FR-09, AC-09a–b | No outage/custody mutation; history preserved. |
| UX-11 | Historical S-06, retired | FR-10, AC-10a–b | No closing mutation; history preserved. |
| UX-12 | Historical S-07 archive; future pilot needs revised O-09 | FR-11–12, AC-11a–c, AC-12a–c | Verified historical provenance; no current pilot claim or retired-workflow metric. |

## 12. Design decisions and research gates (not silently approved)

| ID | UX/design decision | Current recommendation | Required action / owner |
|---|---|---|---|
| UX-D01 | Navigation and screen naming | Use §3; progressively expose only built screens | Team reviews prototype; non-policy. |
| UX-D02 | UI theme, tokens and density | **User-selected replacement 2026-10-30:** prototype v2 warm-paper/ink/orange/Geist; responsive Light/Dark/System, charcoal only in dark mode, semantic tokens, actual shadcn/ui composition. See section 4. | Implement and contrast/accessibility-test both themes; final gym-specific branding remains open, with no product-policy change. |
| UX-D03 | Phone vs desktop priority | Desktop reception first, phone-responsive | Validate with operator device research. |
| UX-D04 | English initial copy | Draft in English; localize only with evidence/decision | Validate comprehension with pilots. |
| UX-D05 | Remaining-time display / expiry | Approved 2026-10-25: exact PHT expiry plus whole 24-hour days and hours rounded down at server check time; below one hour show "less than 1 hour"; current active term only | PROJECT FR-05; locally verified in S-02. |
| UX-D06 | Member identity fields and evidence access | Prototype with synthetic minimal labels; don't store real unapproved PII | Data-stewardship gate. |
| UX-D07 | Queued advance renewals | Approved 2026-10-25: one queued paid term; block another sale until that term starts, preserve committed same-key recovery | PROJECT FR-05 / AC-05e; locally verified in S-02. |
| UX-D08 | Cross-date digital confirmation / uncertain cash dates | Historical S-03/S-04 decisions; digital and recovery workflows retired 2026-11-01 | Preserve prior decision context; do not enable current mutations. |
| UX-D09 | Refunds, outage procedures and closing | Historical S-04–S-06 decisions are superseded 2026-11-01; existing records remain read-only | No current workflow or external fallback is implied. |
| UX-D10 | Launch plan catalog/prices | Approved Monthly ₱800/30 days, 3 Months ₱2,100/90 days, 6 Months ₱4,000/180 days; live readiness remains gated | O-07 resolved 2026-10-24. |
| UX-D11 | First-owner identity proof, owner manual recovery, real email sender | Private synthetic admin fixture only for build | Before real onboarding: admin SOP, domain, authenticated Brevo sender and verified delivery. |

Record any newly accepted UX decisions with approver, date, impacted screens, tests, and source-policy check. **Do not reinterpret design proposals as owner approval simply because they are written here.**

## 13. S-01a concrete UI implementation checklist

**Historical S-01a checklist, preserved as test/audit evidence:** This marked an early-slice scope limit, **not** a permanent prohibition on redesigning currently implemented later-slice UI within a newly authorized task. Do not use it to invent unsupported future features.

**Build only these visible surfaces now, using synthetic data:**

- [ ] Owner email/password login mode and staff username/password login mode; appropriate failures, loading state and sign-out.
- [ ] Verified invitation acceptance/setup page for first owner and staff (48-hour single-use), plus expired/used/replaced/pending states.
- [ ] Owner-managed staff invitation and list/status for own gym, with safe pending/resend/disable affordances limited to what has backend authorization.
- [ ] Owner password-reset flow and owner-initiated staff reset using 30-minute single-use link and verified mailbox, with safe dev capture.
- [ ] Minimal signed-in landing view proving authenticated actor and active gym context; no collection/member screen or production fake metrics.
- [ ] Recent-password confirmation UI only for implemented sensitive S-01a owner actions requiring it; server enforces five-minute freshness regardless of UI.
- [ ] All routes respond correctly for unauthenticated, pending, disabled, revoked, wrong-gym, expired-token and unauthorized states.
- [ ] Test mobile width, keyboard only, screen-reader labels, focus management, error and loading copy.
- [ ] Use **local/test email capture only**; no real gym/member identities, purchased domain assumptions, or live Brevo sending.
- [ ] Attach automated and manual evidence to `architecture.md` S-01a acceptance and relevant `PROJECT.md` criteria; acknowledge deferred capability/financial tests for S-01b and later.

**S-01a design exit:** A reviewer can distinguish owner/staff login, confirm the intended invitation/reset security flow on synthetic accounts, see a pending/disabled user denied, and navigate a minimal accessible owner/staff shell. **It does not mean the gym can accept payments or go live.**

## 14. Recommended low-fidelity prototype review

Before significant implementation of each screen family, test the smallest complete job with representative owner/staff participants using **synthetic** gym and member details: identify task, observe actions without coaching, record errors/terms misunderstood, and evaluate time to complete and confidence in eligibility/financial status. Specifically probe how operators interpret **Confirmed vs Pending**, **Scheduled vs Uncompleted**, midnight expiry, one-time outage access, and an unresolved closing difference.

Keep feedback separate from approved changes. Proposed UX refinements can be accepted by the implementation/product team; a rule that changes price, entitlement, evidence, exception or approval authority must first update the authoritative `PROJECT.md` decision record and related source documents.

## 15. Validation interaction contract — Zod (AD-033)

Apply to existing forms as validation is integrated; preserve their **workflow, validation states, authorization consequences and accessibility**. Their layout and appearance may change under an explicitly authorized visual redesign and must conform to the dual-theme system in §4. Zod is an implementation detail and must not appear in operator-facing copy.

- Share browser-safe field rules with the server where practical. Validate on submit; after an attempted submission, revalidate corrected fields without noisy errors on every initial keystroke. Server validation always remains required.
- Show specific inline messages associated with labels/controls using accessible descriptions and invalid state. Do not rely on color or a toast alone. On failed submission, focus the first invalid field or an accessible error summary with links to fields; announce updates without repeatedly interrupting typing.
- Preserve non-sensitive entered values and selections on validation failure. Never persist or echo passwords, setup/reset tokens or other secrets in retry storage, returned errors or logs. A rejected form creates no success receipt or eligibility state.
- Explain the correction: for example, “Enter the full amount shown” or “Use at most two decimal places.” Keep approved formatting and optional-field rules; do not silently change money, dates or credentials to make them valid.
- Keep invalid input distinct from permission denial, stale plan/operation conflict, connectivity failure and unknown payment confirmation. An unknown financial outcome retains the same operation key and recovery path in §7.2. If the user edits a payload after an attempted operation, resolve its previous outcome before creating a new operation; never reuse a key for changed financial details.
- Check keyboard navigation, screen-reader error association, narrow layouts, corrected resubmission and direct server rejection with JavaScript/client checks bypassed. Preserve generic authentication messages where required to prevent enumeration.
