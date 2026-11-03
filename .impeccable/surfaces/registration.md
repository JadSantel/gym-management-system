---
version: 1
slug: "registration"
primary_target: "src/app/join/[code]/page.tsx"
related_targets: ["src/components/registration-form.tsx", "src/components/registration-link.tsx", "src/components/member-contacts.tsx", "src/components/contact-fields.tsx"]
---

# Member registration

Mode: Operate. Supplied prototype and existing DESIGN.md pin the simple form and reception workflow; code-led extension.

THESIS: Save contact details once, then complete cash activation with reception.

FIRST VIEWPORT: Gym-specific heading, full-name/email/mobile form, unverified-contact explanation, Save my profile and reception help. A single restrained panel inherits the existing warm paper/light and near-black/dark surfaces, semantic tokens and local Input/Button. Mobile contact fields stack. No member login, marketing claims or personal attendance QR.

INTERACTION: Save transitions to Pending confirmation with explicit no paid access; duplicates direct to reception without records; uncertainty freezes details and retries the same request. Expired/replaced links show reception recovery. Staff find the profile in existing Members, edit optional unverified contacts and use existing full cash/receipt/eligibility actions.

CONSTRAINTS: Keep shell/navigation/financial contracts and existing responsive directory. Reception QR create/replace/PNG download lives after Members creation with expiry and replacement consequences. Physical devices and hosted/phone HTTPS remain separate gates. Personal QR/attendance is implemented as a separate staff-operated flow in [attendance.md](attendance.md); the public registration form issues no personal QR or member login.

## Shipped extension

The public route uses a centered narrow form and the existing border-led panel. Email and Philippine mobile sit side by side from the small-screen breakpoint and stack on phones. Public registration requires both contacts; staff creation and profile editing label them optional. Shared contact help explicitly marks values unverified and states that no email or text is sent. Associated field errors and focused feedback preserve recovery; uncertain submission locks details and offers Retry same submission.

The reception panel uses existing outline Button and action-link treatments. Its black-on-white QR is machine-readable content in both themes, not a palette change. Opening, expiry, PNG download and replacement controls stack within the narrow layout; replacement explains the old printed QR consequence. Pending confirmation, expired-link recovery and cash activation retain the direction contract above.

FINISH: `.impeccable/review/registration/finish-review.md` records ship for 33 initial captures and the three-image phone addendum. This is a local artifact review; builder-run interaction and cash acceptance evidence is separate. Established DESIGN.md tokens and visual world remain unchanged.
