---
version: 1
slug: "member-profile"
primary_target: "src/app/(crm)/members/[id]/page.tsx"
related_targets: ["src/components/charge-preview.tsx", "src/components/member-payment-dialog.tsx", "src/components/member-qr.tsx"]
---

# Operator member profile

Mode: Operate.

## Direction contract

THESIS: Put membership dates, recorded payments and payment entry together in Billing, with the personal QR beside it.

OWN-WORLD: Inherit the existing Geist, warm neutral light surfaces, charcoal dark surfaces, semantic status colors and border-led shadcn components. Preserve the application shell.

STORY: Staff review the member and effective access, record actual received funds through Plan, Payment, Review, retrieve a receipt, or download/replace the member's QR.

FIRST VIEWPORT: Member identity and Member details lead. A wider Billing card sits left of a narrower Personal member QR card on desktop; both stack on smaller screens. Record payment sits in Billing's header. Exact PHT start/expiry, elapsed-day progress and access badge precede the four-column payment table.

FORM: The user supplied the composition and reference; this is code-led work within the incumbent system. One payment dialog combines the guided form and charge preview without nested cards. Destructive QR replacement opens an AlertDialog, with safe cancellation and focus return.

FINISH: Verify both themes at desktop/tablet/phone widths, keyboard and dialog behavior, empty/expired/scheduled states, actual synthetic cash/online confirmation, original-operation recovery, receipt navigation and QR revocation. Pause for GitHub checkpoint.

## Shipped expression — November 9, 2026

- Identity and Member details share one local Card. Phone/email show recorded values or Not recorded; the membership Badge is server-derived, and monthly visits exclude voided entries. The existing application shell and theme controls remain.
- Below identity, Billing and Personal member QR form a wider-left/narrower-right layout from 1280px and stack below it. Billing owns Record payment, Membership access and Payment history. Former front-desk, account-access and historical-evidence cards are removed from this profile; underlying records are unchanged.
- Membership access shows exact inclusive start and exclusive expiry in PHT. The progress bar follows elapsed time; its used-days label counts whole elapsed 24-hour days. Remaining whole days/hours are rounded down at the displayed server check. Current eligibility, scheduled paid access and unverified funds remain separate. A queued paid term blocks another advance sale but retains original-payment recovery.
- History is a local Table with Entry recorded / Amount / Receipt / Status, ordered by entry-recorded time descending. At container widths of 460px or less, rows become labelled two-column records. Receipt return navigation uses the real `#member-payments` target.
- Record payment opens one scrollable local Dialog containing the existing Plan / Payment / Review flow and charge/access summary. From 1024px those sections form border-separated columns without nested Cards; below it, the summary follows the form. Focus stays in the modal and returns to its invoker. Outside clicks do not close it, and busy requests prevent closing.
- Personal member QR retains Download QR and removes Print. Replace personal QR opens a destructive AlertDialog explaining that the old code stops working immediately, with Cancel and focus return. Missing QR retains the current-eligibility issue requirement. Busy or uncertain QR actions hide the image/download; uncertainty retries the stored original action.
- Local shadcn Card, Button, Badge and Table are actively imported. Dialog and AlertDialog use the existing Button, `cn` utility and semantic scrim. No new final dependency, token, artwork or visual world is introduced.

## Evidence and limits

Source checked: `src/app/(crm)/members/[id]/page.tsx`, its `profile.module.css`, `src/components/member-payment-dialog.tsx`, `charge-preview.tsx`, `member-qr.tsx`, local `ui/dialog.tsx` and `ui/alert-dialog.tsx`, and `src/app/(crm)/receipts/[id]/page.tsx`. Existing `PRODUCT.md`, `DESIGN.md` and `.impeccable/design.json` supplied incumbent context.

Documentation samples checked in `.impeccable/review/member-profile/`: `light-desktop.png`, `dark-phone-payment.png`, `light-phone-replace.png` and `dark-recovered-online.png`. The supplied independent finish-review handoff records **ship**, with no material fixes, after 43 captures/contact sheets and incumbent snapshots. The evidence directory also contains both-theme desktop/tablet/phone/narrow Billing, QR, payment and replacement views plus expired, Pending and confirmed-payment states. Local synthetic money/QR verification is recorded separately in the implementation ledger; this documentation pass does not rerun those checks or establish hosted, physical-device, screen-reader, pilot or live readiness.

This is an ordinary extension of the established world. DESIGN.md token frontmatter and `.impeccable/design.json` remain unchanged; pre-existing system/sidecar drift is reported without repair or canonization.
