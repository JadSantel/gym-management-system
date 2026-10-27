# Gym CRM — Product Interface and Interaction Design (`design.md`)

**Status:** Proposed UX/UI specification for review; **not** an approval of new product policies, implementation, pilot readiness, or visual brand identity.  
**Prepared:** 2026-10-24 (Asia/Manila)  
**Reviewed:** 2026-10-25; approved S-02-S-04 behavior reconciled, remaining UX proposals and live gates retained.
**Project:** Independent Gym Management System (multi-tenant SaaS for independent Philippine gyms)  
**Scope:** S-01 through S-07 interaction guidance. S-01-S-03, supported S-04, S-05 and S-06 paths have recorded local synthetic verification; S-07 and live/pilot operations remain future/unverified scope. See `IMPLEMENTATION_STATUS.md` for evidence and current handoff.
**Source of truth:** `PROJECT.md` for product requirements, acceptance criteria, and operational decision gates; `product.md` for aligned customer problem and policy intent; `architecture.md` for approved technology, identity, isolation, security, and integrity rules. The conversation handoff provides historical context only.  
**Decision rule:** The layouts, navigation, labels, colors, and responsive behavior in this file are **design proposals** until reviewed. They may be changed without changing a product rule. Where this file and an authoritative document differ, do **not** silently implement the difference; record and resolve it before the affected feature ships.

## 1. Experience goal and boundaries

Build a clear, fast, evidence-oriented tool for owners and authorized front-desk staff at small gyms (working segment: about 80–150 members). Optimize for common counter tasks: find a member, check verified access, display the exact full charge, accurately record a verified collection, retrieve its receipt, and understand unresolved items at closing.

Design for **correctness ahead of speed** when confirmation changes membership or financial history. Faster entry must never mean silently accepting unverified funds, hiding discrepancies, or bypassing owner authorization.

**In scope:** Individual operator account access; member/plan directory; verified full cash collections; pending/verified digital funds; approved fixed 30/90/180-day paid terms and renewal; eligibility; investigations; owner-approved linked corrections/refunds; numbered outage-paper recovery; closing; verified migration; pilot review evidence.

**Not in MVP:** Public signup for gym accounts, member portal/app, installment balances, sales/marketing automation, gym class bookings, biometrics/turnstiles, a payment gateway, automated POS, fully offline digital app, broad attendance analytics, multi-branch admin, or general accounting.

**Working assumptions requiring validation, not product commitments:** Desktop or laptop at reception with occasional phone use; intermittent connectivity; owner reviewing exceptions after shifts; real pilot member fields and gym branding selected later. Use owner/staff prototype testing to validate these assumptions.

## 2. Non-negotiable interaction contracts

1. **One person, one attributable operator account.** Product roles are **Owner** and **Staff**; staff capabilities are assignments, not additional roles. Ordinary gym operators cannot perform private platform-administrator bootstrap/recovery functions.
2. **No public owner or staff self-registration.** First owner is privately bootstrapped after platform-admin verification, then completes verified setup. Owner invites staff to their own gym; the staff member privately sets their password. Pending setup is not active access.
3. **Money must be verified before confirmation.** Cash: authorized collector physically receives the entire charge. GCash/bank transfer: designated receiving-account verifier independently sees settled full funds. Screenshots/references alone remain unconfirmed. No partial membership purchases, debt, or installment UI.
4. **Four separate concepts remain visible:** payment state; paid-period state; admission decision; exception/case state. A paid scheduled period is not an uncompleted purchase. A provisional outage visit is not an activated membership.
5. **For the MVP monthly-labeled plan, duration is exactly 30 consecutive 24-hour days.** New/late verified payment begins at **00:00 Asia/Manila on the verified payment date**; an early paid renewal begins precisely at the previous valid term's end. Use `[start, end)`; access ends at the stated end instant. A 6:30 p.m. payment does not permit admission before verification even though its period's nominal start is midnight on that date.
6. **The exact expiry instant must be shown.** Per user approval on 2026-10-25 (`PROJECT.md` FR-05/§9), show remaining whole 24-hour days and whole hours, rounded down at the displayed server check time; below one hour show “less than 1 hour.” Show this only for the current active paid term, with scheduled terms separate. No relative counter may overstate eligible time.
7. **Financial facts stay auditable.** Confirmation creates a retrievable reference and original record. Owner-approved corrections/refunds append linked events with explicit money and access outcomes; UI must never silently overwrite original confirmed facts.
8. **No second automatic online record for a paper outage receipt.** During outage, controlled full-cash paper receipt + authorization allows **one provisional visit** only; after reconnection, back-entry begins pending evidence verification. Mandatory physical shift-end accounting still applies while disconnected.
9. **Failures fail closed.** No success/active wording before a committed confirmation; repeat submits and lost responses must resolve to the same stored result, not a second payment or second period.
10. **All protected controls must be enforced on the server.** A hidden or disabled interface element is informational, not an authorization guarantee.

## 3. Users, contexts, and proposed information architecture

### 3.1 User contexts

| Context | Frequent questions | UX requirement |
|---|---|---|
| Front-desk authorized operator | “Is this person eligible now?” “How much do they owe for a *new* full purchase?” | Fast member search, clear access outcome, concise charge review; no collection without verified full funds. |
| Primary owner | “Which actions and receipts are attributable?” “What remains unresolved?” | At-a-glance exceptions, filterable history, capabilities and account lifecycle, visible closing differences. |
| Designated digital-funds verifier | “Did money actually arrive in our receiving account?” | Separate pending and confirmed state, explicit evidence-checking step, recorded reviewer/time. |
| Platform administrator (separate trust boundary) | “Has independent gym ownership been verified?” | **Private and audited** pending-owner bootstrap/recovery; never exposed in normal gym navigation. |

### 3.2 Suggested navigation (progressive by delivery slice)

| Area (suggested label) | Main purpose | Earliest slice | Notes |
|---|---|---|---|
| **Overview** | Today’s verified activity, attention items, quick links | S-01g onward | No fabricated revenue or closing totals. A simple signed-in landing page is enough for S-01a. |
| **Members** | Search/create; detail with access and paid history | S-01c | Present access independently from collection status. |
| **Collections** | Prepare exact charge, verify/capture confirmed payment, references | S-01d–f | Cash first; GCash/bank states added S-03. |
| **Cases** | Claims, missing entries, proposed corrections, owner decisions | S-04 | Original transactions preserved. |
| **Outage receipts** | Registered paper receipts, back-entry, custody/issues | S-05 | Physical offline process exists outside app; no offline web promises. |
| **Closing** | Method/collector totals, actual counts, unresolved differences | S-06 | Preparing is different from owner approval. |
| **Settings** | Gym plan/pricing, operator accounts and capabilities, appropriate configuration | S-01a/b/d | Owner and capability checks per operation. |
| **Pilot review** | Migration evidence and reproducible metrics | S-07 | Only if useful during pilot; no broad analytics dashboard. |

**Navigation principle:** Show only authorized actions. Staff may still see a read-only status/clear “not permitted” explanation where useful; a direct forbidden request is rejected by the server. Do not reveal another gym’s existence or data. Avoid inventing a gym selector; an operator account belongs to one gym.

### 3.3 Suggested route inventory (illustrative, not framework or API contracts)

- Public/account: `/login`, `/setup/invitation`, `/reset-password`, `/account/reconfirm-password`.
- Authenticated app: `/app`, `/app/members`, `/app/members/[memberId]`, `/app/collections`, `/app/collections/[reference]`, `/app/settings/operators`, `/app/settings/plans`.
- Proposed route labels above are conceptual. Local investigation and outage routes are `/investigations` and `/outage-receipts`; the local closing route is `/closing`; pilot review remains later scope.
- Private platform operations **must not** be implemented as an unprotected variant of an `/app` route. Actual path and access architecture must be decided in the relevant implementation slice.

Route names above are proposals. A route ID must never be trusted as authorization; all member/payment resources are checked within the active authenticated gym.

## 4. Selected dual-theme visual direction (presentation only; editable tokens)

**User-selected design direction, 2026-10-26:** Build a coherent modern SaaS interface supporting **Light, Dark, and System** preferences. The references supplied by the user guide *navigation organization, visual hierarchy, table density, cards, typography, and spacing*; do not copy their business features, specific content, pricing, or brand. This presentation choice does **not** approve a final gym brand, new product policies, hosted services, or production readiness.

**Dark mode:** layered dark charcoal canvas, navigation, and cards; strong but not glaring text; fine neutral borders and subtle insets. **Light mode:** equally polished near-white/light-neutral canvas with white cards, defined dividers and legible dark text; charcoal backgrounds must not leak into the light theme. Use a restrained green/emerald primary-action accent in both themes and amber only for real attention states. Reserve red for destructive/blocked states. Consistent spacing and information hierarchy are more important than hue changes.

**Illustrative semantic palette (not a fixed hardcoded CSS mandate; check contrast when implementing):**

| Semantic role | Light-mode reference | Dark-mode reference | Usage |
|---|---|---|---|
| Canvas | `#F7F9FC` | `#0B0D10` | App background outside contained work areas |
| Sidebar / surface | `#FFFFFF` | `#111317` | Persistent app navigation |
| Card / panel | `#FFFFFF` | `#171A1F` | Data, forms, dialogs |
| Subtle inset / muted | `#F1F4F8` | `#20242A` | Grouped metrics, secondary surfaces |
| Main text | `#111827` | `#F3F5F7` | Headings, amounts and primary copy |
| Secondary text | `#4B5563` | `#B6BDC6` | Supporting descriptions |
| Border | `#E2E8F0` | `#30343B` | Panel outlines and dividers |
| Primary fill | `#047857` | `#10B981` | Key actions; check foreground contrast separately |
| Primary fill foreground | `#FFFFFF` | `#07130E` | Text/icons on primary buttons |
| Attention | accessible amber | accessible amber | Needs review, not generic decoration |
| Destructive | accessible red | accessible red | Disabled/danger/denial as appropriate, always with a text label |

Implement using **semantic CSS variables and shadcn-compatible Tailwind utility classes** (`bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-primary`, `text-primary-foreground` and status variants), with theme overrides selected via `.dark` or the project's existing equivalent. Avoid repeated inline hex colors and separate page-specific themes. If theme infrastructure does not exist, consider `next-themes` for a keyboard-operable Light/Dark/System control; verify hydration and persistence. Support system preference without requiring manual selection, and preserve deliberate user choice across navigation/reload when technically available.

**Component system:** Favor real locally installed **shadcn/ui** primitives and composed domain components, not merely shadcn-like styling. Before adding components, inspect `components.json`, installed dependencies, existing `src/components/ui` files, project aliases, and actual imports. Prefer accessible `Button`, `Input`, `Label`/`Field`, `Card`, `Badge`, `Dialog` and `AlertDialog`, `Sheet`, `Select`, `DropdownMenu`, `Table`, `Skeleton`, `Alert`, and `Sidebar` only when needed by a real task. Do not blindly run `init`, overwrite customized components, install an entire catalog, or replace valid native HTML unnecessarily. No UI component makes an authorization decision; server contracts remain authoritative.

**Composition:** persistent labeled sidebar on desktop with permission-appropriate groups and clear current-location highlighting; a purposeful page header and one dominant next action; data panels and scannable lists/tables rather than large repeated form cards; aligned labels, states, compact supporting text, and meaningful empty/loading/error states. For sensitive owner actions, keep the five-minute reauthentication requirement and security explanation easy to find, even if presented contextually in a dialog. Phone layouts collapse navigation and keep core actions, results, and labels usable.

- **Typography:** legible system/approved font; clear hierarchy for headings, monetary amounts and status decisions; avoid tiny critical text. Use consistent type scale and weights rather than headline decoration.
- **Density:** designed for operating a gym quickly. Allow compact scannable rows where legible; never truncate price, collector, verification state, access decision or exact expiry in a critical review.
- **Shape/spacing:** consistently scaled radius, 4/8/12/16/24 spacing progression, restrained shadow, differentiated surfaces and subtle dividers. Avoid gratuitous nested cards.
- **States/accessibility:** status must carry text, not only green/amber/red. Aim for WCAG 2.2 AA across both themes; verify keyboard use, touch targets and visible focus rings.
- **Animation:** subtle, nonblocking transitions respecting reduced-motion preferences; do not imply financial completion before a server-committed result.
- **Branding:** platform branding and tenant-specific logos remain pending. Visual inspiration does not authorize copying a third-party gym identity.

**Acceptance condition for a user-authorized structural redesign:** measurable improvement in information architecture, hierarchy, grouping, navigation, responsive composition and component consistency, **not** a color-only or image-only pass. Current markup is not a requirement; approved product behavior and evidence/security rules are.

## 5. Layout, responsiveness, and accessibility

### Layout proposals

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

**Initial content language:** English UI copy is proposed; Filipino/Cebuano localization is **not an approved requirement**. Keep strings centralized to support later decisions. User research should validate comprehension of “confirmed,” “provisional,” “scheduled,” “expired,” and “reconciled.”

**Dates and money**

- Display PHP amounts as `₱1,000.00` using stored integer centavos; user input parsed and validated explicitly. `₱1,000.00` in examples is synthetic, **not** an agreed pilot plan price.
- Preserve exact instants internally; display operator-facing date/time in **Asia/Manila** with full date for evidence records. Suggested: `24 Oct 2026, 6:30 PM PHT`.
- Prefer expiry language: **“Eligible until 2 Mar 2027, 12:00 AM PHT (not valid at or after this time).”** For eligibility checks use server-evaluated current time.
- Do not show rounded “30 days left” after a same-day afternoon purchase without product approval; display exact expiry and a simple **Eligible / Not eligible** determination.
- Use **“30-day membership”** near the plan’s *monthly* label until user research confirms the naming; never imply variable calendar-month length.

### State labels (independent dimensions)

| Dimension | Display labels | Key caution |
|---|---|---|
| **Payment** | Pending verification / Confirmed / Flagged | “Confirmed” requires verified full funds; a flag is not a financial reversal. |
| **Membership period** | Scheduled paid period / Active paid period / Expired paid period / Adjusted or terminated | “Scheduled” means paid; an unpaid request is **Uncompleted purchase request**. |
| **Admission** | Eligible / Not eligible / Provisional access for this visit | Provisional access is a manually authorized outage exception only. |
| **Case** | Open / Under review / Escalated / Resolved | Case state alone never changes access or payment confirmation. |
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
- Financial submission review displays **member, selected plan, approved elapsed-day duration, exact full amount, method, original collection timestamp, collector, and intended start/end** before approval. Do not rely solely on a confirmation button.
- Destructive or restricted changes require explicit explanation and, where policy requires, recent owner password reauthentication; no shared staff passwords and no simple “Are you sure?” substitute for approval/evidence.

### 7.3 Feedback messages — suggested wording

| Condition | Copy pattern |
|---|---|
| Cash collected and transaction committed | **“Cash payment confirmed. Receipt [reference] is ready.”** Show amount, linked period and collector. |
| Collected amount below full plan charge | **“Full payment required. No membership was activated.”** |
| Screenshot or unverified digital transfer | **“Payment awaiting receiving-account verification. No new paid access has been granted.”** |
| Future term paid | **“Payment confirmed. Next paid period starts [date/time]. Current access is unchanged.”** |
| Request without authority | **“You do not have permission to perform this action.”** Do not disclose protected records. |
| Outage receipt back-entered | **“Receipt recorded for review. Membership is not yet digitally confirmed.”** |
| Correction awaiting gym policy | **“Approval cannot be completed until the required refund/correction policy is recorded.”** |
| Closing with discrepancy | **“Closing review recorded. Difference remains unresolved: [amount].”** |

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

### UX-08 — Pending digital collection and verification (**S-03**)

**Local synthetic decisions approved 2026-10-25:** record claims from a saved member charge, then use the digital collections queue. Owners designate synthetic account labels and explicitly assign/revoke verifiers after password reauthentication; owner status alone cannot reveal a confirmation action. Confirmation requires independently entered actual amount/reference/time, activity-evidence reference and account-match attestation. Unknown responses preserve the original operation across reloads; retry it before confirming another transfer. Cross-date transfers remain pending for owner review. Show pending claims separately from confirmed history and existing eligibility. Confirmed receipts show method, matched account and evidence reference; dispute flags show owner review with no automatic money/access change. This does not approve live receiving accounts or evidence custody.

- Separate **Record transfer claim** from **Confirm received funds**. Claim UI stores only necessary reference and evidence link; it clearly remains pending.
- Designated verifier reviews actual designated receiving-account funds **outside this app** and records matched account, full amount, reference, time and identity; never ask for or store bank/GCash credentials.
- If no authorized verifier is available: leave transfer pending, show next authorized action, grant no new normal access. Screenshot alone cannot reveal a confirm/activate flow.
- A reversed/flagged confirmed digital payment opens owner-review case; do not unilaterally change the historical confirmed amount or entitlement.

### UX-09 — Investigations and controlled adjustments (**S-04**)

- Case list/detail: case type, member, linked receipt/payment, evidence references, claim/report time, investigating actor, current case state, decisions and resolution trail.
- Staff investigate/document/escalate; only the owner may approve and execute independently corroborated omitted **full cash** recovery (approved October 25, 2026). Show original collection time separately from later entry/verification. New/late terms use original-date Manila midnight; conflicts stay unresolved. Digital cross-date claims remain blocked.
- Staff may submit a proposed existing-transaction correction/refund; only owner may approve/execute it. Owner review requires explicit **reason, evidence, financial outcome, access outcome (stays/ends/adjusts), and effective date**. Reauthentication as required.
- Treat **duplicate ledger record with one collection** differently from **two actual collections**. Never show a refund as completed until actual money movement is recorded and verified.
- If gym-specific refund eligibility/amount (O-03) is unresolved, case can be documented but discretionary execution remains disabled.

- **October 25, 2026 execution:** separate owner approval, execution and independently verified external settlement controls. Show exact approved amount/method, affected/retained periods and explicit access disposition before execution. Adjusted intervals require explicit dates; never infer from prose. No money-transferred claim. Duplicate-record correction moves zero money; full evidenced unintended duplicate excess alone supports refunds. Discretionary cancellation remains documentable but execution disabled pending written pilot terms. Maintain labelled fields, inline errors/focusable summary, saved retry payloads, keyboard access and mobile layout.

### UX-10 — Paper outage receipts, one visit, and recovery (**S-05**)

**Offline:** application is unavailable by definition. A controlled **numbered paper receipt** plus authorized full-cash collection may grant **only the current provisional visit**. A paper handover and receipt/cash count remain required at shift end. No offline web form, offline digital entitlement, or second-visit reuse is promised.

**After reconnection:** receipt registry/entry UI captures booklet/number scope, actual collector, member/plan, full amount, original collection + issuance times, later entrant + entry time, custody references and recorded one-visit event. Back-entry is **pending verification**, not paid activation. Verify against real cash/booklet/handover evidence; preserve original local collection date for approved late-cash-outage renewal after confirmation.

Flag duplicate receipt number, missing/void/invalid number, mismatched cash, or uncertainty to owner review without deleting original facts. O-02/O-06 local design was approved by the user October 25, 2026 in [the outage SOP](S05_OUTAGE_POLICY_PROPOSAL.md). Show independent-verifier availability, assigned custody, full number accountability, exceptions and distinct actual/entry times. Automatic repeat admission remains unavailable; live operational coverage remains gated.

### UX-11 — Daily closing and review (**S-06**)

- Staff-prepared summary by actual collector and method: confirmed recorded total; counted physical cash and verified digital actuals; resulting difference; independently visible **pending transfers, receipt gaps, corrections, refunds and other unresolved items**.
- Owner reviews and, when permitted, **approves the unresolved difference without changing its amount or hiding the exception**. Staff cannot approve their own discrepancy resolution by role bypass.
- Closing snapshot remains retrievable; later back-entry/adjustment is visibly linked by original collection date and later entry/approval date. Do not silently rewrite a prior closing.
- Local synthetic decisions approved October 25, 2026: Manila calendar-day cutoff, zero opening membership float and segregated batch counts, actual-settlement refund allocation and explicit append-only supplements. `/closing?day=YYYY-MM-DD` shows current source review, independent actual evidence, immutable original/supplement history and linked later events. Final submission is unavailable before day end. Counts require evidence/notes; member-linked investigations can be attached when identified, while unassigned differences remain on the closing with follow-up notes. A designated account viewer must check digital actuals, including explicit zero. Fresh owner acknowledgement changes no amount or open-item status. Live/pilot procedures remain gated; see [approved SOP](S06_CLOSING_POLICY_PROPOSAL.md).

### UX-12 — Verified history and pilot evidence (**S-07**)

- Historical entitlement onboarding records original independent source, verifier, approved interval and owner/sign-off; contradictory records are **flagged**. Do not create fictitious paid receipts or collections from historical membership data.
- Review screen shows separate incident categories, original collection/issuance/entry/verification timestamps, missing denominators, outages, staff adoption and parallel-ledger observations. Any baseline/target is a pilot hypothesis until verified.
- Show uncertainty and unresolved missing data clearly rather than presenting “improvements” as proven.

Local implementation follows both user-approved October 26, 2026 decisions in
[the S-07 protocol](S07_LOCAL_POLICY_PROPOSAL.md). The member page prepares exact
source evidence and preserves immutable owner decisions; historical access is
labelled separately from paid periods. Staff preparation grants no access;
fresh owner sign-off requires independent sources. Duplicate/overlap conflicts
retain evidence for further review. Saved operations support same-key recovery
after an unknown response. Field errors retain inputs and link to invalid fields.
`/pilot` shows tenant-scoped original collection, paper issuance, actual first CRM
entry and verification, linked source history, historical/legacy-exception labels,
settlements and unresolved investigations. It explicitly reports UNKNOWN
denominators and NOT VERIFIED outcomes. Complete measurements use the approved
manual worksheet; timed checks, physical admission and shift use require observed
evidence. Bounded source lists disclose truncation. No chart or automatic success
claim substitutes for independent collection or adoption evidence.

## 9. Critical state transitions (UX representation)

```text
Uncompleted purchase request
      | actual full cash received OR designated actual digital funds verified
      | + authorized, atomic server confirmation
      v
Confirmed payment + original paid period + current effective entitlement
      |                   |
      |                   +-- if future start: Scheduled paid period
      |                   +-- if start <= now < end: Active paid period -> Eligible
      |                   +-- if now >= end: Expired paid period -> Not eligible
      |
      +-- owner-approved linked financial/access adjustment (original preserved)

Unverified digital claim -> Pending verification (NO new paid entitlement)
Unverified paper receipt back-entry -> Pending evidence review (NO new normal access)
Offline paper full cash + numbered receipt + authorized action -> ONE provisional visit
Claim / investigation -> separate case state (never implicitly changes payment or access)
```

**Special temporal caveat:** The stored effective interval for an afternoon full payment can begin at local midnight, but a *historical admission decision* still must respect when payment was actually verified. The display must not suggest retroactive authorization of a visit before collection/confirmation. Verify this with time-based tests.

## 10. Consistent empty, loading, and failure states

| Screen situation | UX behavior |
|---|---|
| Invitation has not yet been delivered | “Invitation pending,” authorized resend, delivery problem details only for permitted owner/platform support. No active operator. |
| No platform email domain configured | Clearly marked **local/test only** for development; real invitation/reset delivery disabled. No fictional sender address. |
| Loading member eligibility | Neutral **Checking eligibility…**; do not show stale Eligible as current. |
| Service unavailable during a live collection | No silent online confirmation. Point to the documented **physical full-cash receipt** process only when that gym's outage SOP is approved; otherwise escalate. |
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
| UX-08 | S-03 | FR-04, AC-04a–d; AC-01c | No screenshot activation; designated settlement verifier. |
| UX-09 | S-04 | FR-07–08, AC-07a–d, AC-08a–d | Corroboration, owner-controlled linked events, non-invented refund outcome. |
| UX-10 | S-05 | FR-09, AC-09a–f; AC-05d | Physical numbering, one visit, pending back-entry, date/collector distinction. |
| UX-11 | S-06 | FR-10, AC-10a–d | Visible differences, owner approval, immutable earlier closing. |
| UX-12 | S-07 | FR-11–12, AC-11a–c, AC-12a–c | Verified historical provenance, honest timestamps and metrics. |

## 12. Design decisions and research gates (not silently approved)

| ID | UX/design decision | Current recommendation | Required action / owner |
|---|---|---|---|
| UX-D01 | Navigation and screen naming | Use §3; progressively expose only built screens | Team reviews prototype; non-policy. |
| UX-D02 | UI theme, tokens and density | **User-selected 2026-10-26:** responsive Light/Dark/System visual direction; charcoal only in dark mode, neutral light mode, semantic theme tokens, restrained emerald actions, shadcn/ui composition as appropriate. See §4. | Implement and contrast/accessibility-test both themes; final gym-specific branding remains open, with no change to product policy. |
| UX-D03 | Phone vs desktop priority | Desktop reception first, phone-responsive | Validate with operator device research. |
| UX-D04 | English initial copy | Draft in English; localize only with evidence/decision | Validate comprehension with pilots. |
| UX-D05 | Remaining-time display / expiry | Approved 2026-10-25: exact PHT expiry plus whole 24-hour days and hours rounded down at server check time; below one hour show "less than 1 hour"; current active term only | PROJECT FR-05; locally verified in S-02. |
| UX-D06 | Member identity fields and evidence access | Prototype with synthetic minimal labels; don't store real unapproved PII | Data-stewardship gate. |
| UX-D07 | Queued advance renewals | Approved 2026-10-25: one queued paid term; block another sale until that term starts, preserve committed same-key recovery | PROJECT FR-05 / AC-05e; locally verified in S-02. |
| UX-D08 | Cross-date digital confirmation / uncertain cash dates | Verified recovered full-cash original-date rule approved 2026-10-25; uncertain/conflicting cash dates and cross-date digital confirmation remain pending/escalated | PROJECT FR-04/07 and Section 9; no digital backdating exception. |
| UX-D09 | Conditional refunds, outage procedures and closing | Approved S-04 paths and approved local S-05 registry/custody/independent verification are available; block discretionary cancellations, automatic repeat admission, live outage and closing operations | PROJECT FR-08/09; approved local outage SOP; remaining O-03, live O-02/O-06 and pilot closing gates. |
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
