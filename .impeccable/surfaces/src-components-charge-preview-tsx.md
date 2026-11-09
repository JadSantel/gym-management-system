---
version: 1
slug: "src-components-charge-preview-tsx"
primary_target: "src/components/charge-preview.tsx"
related_targets: ["src/app/(crm)/members/[id]/page.tsx"]
---

# Membership enrollment

Mode: Operate.

## Direction contract

THESIS: Make assignment one deliberate Plan, Payment, Review flow, with current access and the charge visible together.

OWN-WORLD: Existing warm-paper/ink and dark semantic themes, Geist, rectangular shadcn controls, border-led panels. Preserve the shell.

STORY: Choose an approved fixed term, check Cash or Online funds, review immutable server terms and confirm exactly once. Recovery resolves the original attempt.

FIRST VIEWPORT: Billing's Record payment opens one scrollable dialog. Selected plan cards lead the form, beside a narrower full-charge/current-access summary on wide screens and above it on smaller screens. Detailed history remains on the profile.

FORM: The user's supplied membership-enrollment-shadcn-preview.html pins composition. No concept roll or generated comp; translate its structure to actual product terms and existing tokens. Do not copy recurring billing, date editing, invented fees, fake profile tabs or access toggles.

FINISH: Both-theme responsive and accessibility checks, synthetic money/permission/concurrency/retry acceptance, finish review and factual documentation, then GitHub checkpoint.

## Shipped expression — November 9, 2026

- Plan, Payment and Review are separate working steps. Plan uses full-width native radio cards for the approved catalogue, pairing name and exact amount with fixed duration and one-time payment wording. Continuing prepares a durable server charge; it records no payment or access.
- Payment offers Cash and Online. Online uses a native provider select for GCash, GoTyme and MariBank, a transaction-reference field, the exact received amount and an explicit funds-checked checkbox. The collecting operator personally checks the gym receiving account; a sender screenshot alone is insufficient. Editing provider, reference or amount clears the checkbox.
- Review shows the member, saved plan/duration, method, Online reference, exact amount and automatic inclusive/exclusive PHT dates. Confirmation records the received payment and exposes the payment reference, receipt reference/link and paid period. Both the success body and summary use committed paid dates. The summary changes from Estimate to Saved charge preview to Confirmed, and from Due in full to Paid in full.
- The profile's Billing launcher opens one scrollable Dialog containing the form and charge/access summary without nested Cards. From 1024px the larger form column sits beside a narrower summary, separated by a border; below that width, the summary follows the form. Long references wrap, controls retain the existing minimum target size, and the step row compacts for narrow phones. Current access remains separately labelled and server-derived; a paid future term does not imply current admission. Outside clicks do not close the dialog; busy requests prevent closing, with focus containment and return on close.
- Unknown Cash or Online confirmation uses the shared original-operation recovery scope. It preserves the original key, method, amount, member, charge and Online evidence, blocks preparing or switching to another operation and offers resolution without collecting again. Stale terms require fresh review; an already paid future period blocks another sale while preserving original-attempt recovery.
- The profile requires member-management access; the Owner or Staff also needs existing collection permission to prepare and confirm either method. Permission, empty-catalogue, unavailable-storage, stale-term and advance-sale states remain explicit. Error alerts receive focus, step changes focus the heading, and busy/locked controls prevent duplicate actions. The profile's payment history retains its real `#member-payments` target, including receipt return navigation.
- Local shadcn Button, Input, Label, Badge and Separator are actively imported in the charge flow; its launcher uses Dialog and Button. The profile uses Card/Badge/Table. Native radios, select and checkbox remain. Existing semantic light/dark tokens, Geist, shell and navigation are preserved; no generated assets, new final dependency or new visual system were introduced.

## Evidence and limits

Source checked: `src/components/charge-preview.tsx`, `src/app/(crm)/members/[id]/page.tsx`, `src/app/globals.css`, local Card/Button primitives, `components.json`, and the current enrollment revisions at the top of `docs/PROJECT.md` and `PRODUCT.md`. Visual evidence checked: `.impeccable/review/enrollment/reference.png`, `light-desktop-plan.png`, `dark-phone-online.png` and `light-desktop-paid-summary.png`.

November 9 documentation update additionally checks `src/components/member-payment-dialog.tsx`, local Dialog source and the receipt return-link. Current visual samples checked: `.impeccable/review/member-profile/light-desktop.png`, `dark-phone-payment.png` and `dark-recovered-online.png`; the latter shows the committed Online result after original-operation recovery. The supplied finish-review handoff records ship with no material fixes. Separate local synthetic financial checks remain evidence for money invariants; the documentation samples do not replace them.

The reference supplies composition only. Recurring billing, editable dates, setup fees and activation toggles were not adopted. Earlier retirement, member-account and attendance tasks remain separate historical scope. Local synthetic checks and screenshots do not establish hosted, pilot or live financial readiness. Existing DESIGN.md frontmatter and `.impeccable/design.json` remain unchanged; pre-existing system documentation drift is reported separately rather than canonized or repaired here.
