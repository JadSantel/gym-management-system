---
version: 1
slug: "registration"
primary_target: "src/app/join/[code]/page.tsx"
related_targets: ["src/app/join/layout.tsx", "src/components/member-shell.tsx", "src/components/registration-form.tsx", "src/components/registration-link.tsx", "src/components/member-contacts.tsx", "src/components/contact-fields.tsx", "src/components/attendance-history.tsx", "src/app/(crm)/attendance/scanner/page.tsx"]
---

# Member registration

Mode: Operate. Supplied prototype and existing DESIGN.md pin the simple form and reception workflow; code-led extension.

THESIS: Save contact details and choose a private password once, then complete cash activation with reception.

November 6 revision supersedes the older no-login/email-setup descriptions below: signup now includes labelled Password and Confirm password fields, 12–128 character guidance, new-password autocomplete and a Show passwords checkbox. Confirmation links directly to member sign-in; the chosen password immediately opens a Pending dashboard. No initial email setup is needed. Pending registration still records no payment, entitlement or QR. Passwords clear on confirmed completion; uncertain requests retain the same submission only in memory. Preserve the existing form composition, local shadcn controls and semantic themes.

FIRST VIEWPORT: Member registration header with Member sign in (Sign in on phones), appearance control, gym-specific heading, full-name/email/mobile form, unverified-contact explanation, Save my profile and reception help. A single restrained panel inherits the existing warm paper/light and near-black/dark surfaces, semantic tokens and local Input/Button. Mobile contact fields stack. The dedicated MemberShell excludes the CRM sidebar, operator account and clock, including for signed-in operators.

INTERACTION: Save transitions to Pending confirmation with explicit no paid access; duplicates direct to reception without records; uncertainty freezes details and retries the same request. Expired/replaced links show reception recovery. Staff find the profile in existing Members, edit optional unverified contacts and use existing full cash/receipt/eligibility actions.

CONSTRAINTS: Keep CRM navigation/financial contracts and existing responsive directory. The same gym-specific reception QR lives after Members creation and on Scanner at `#registration-link`, with create/replace/PNG download, expiry and replacement consequences. Attendance's New member QR shortcut opens `/attendance/scanner#registration-link`. Physical devices, printed QR and hosted/phone HTTPS remain NOT VERIFIED. The public form creates only a Pending profile; it issues neither personal QR nor login. Paid activation and private setup lead to the separate [member surface](member.md); [attendance.md](attendance.md) retains staff scanning/presenter checks and credential replacement.

## Shipped extension

The public route uses a centered narrow form and the existing border-led panel. Email and Philippine mobile sit side by side from the small-screen breakpoint and stack on phones. Public registration requires both contacts; staff creation and profile editing label them optional. Shared contact help explicitly marks values unverified and states that no email or text is sent. Associated field errors and focused feedback preserve recovery; uncertain submission locks details and offers Retry same submission.

The shared reception panel leads with New here? Scan to join. and three ordered steps: register on a phone, pay in full and activate at the front desk, then set up a member login to view/download the personal QR. Instructions and QR form two columns from the medium breakpoint and stack on phones. Existing outline Button and action-link treatments handle create/replace, opening and PNG download; expiry uses PHT and replacement explains the old printed QR consequence. Its black-on-white QR is machine-readable content in both themes, not a palette change. During replacement or an unconfirmed response, QR and sharing links are hidden. Reload registration QR performs a full reload before sharing resumes. Pending confirmation adds the local attention-colored Badge and explicit front-desk cash payment, private email setup and member-dashboard QR steps; staff still scan and confirm the presenter. No payment or paid access is granted by registration.

SYSTEM CHECK: `src/app/globals.css`, DESIGN.md and the shipped registration/scanner/history source confirm existing warm light / near-black dark semantic surfaces, Geist, border-led panels, local Button/Input/Badge and text-backed attention states. No tokens or visual-world rules were added; DESIGN.md and its sidecar remain unchanged.

FINISH: The November 3 independent member/registration finish review returned ship with no material fixes over 31 validated captures, including registration in both themes at desktop/tablet/phone/320px and member setup/login/dashboard plus recovery/error states. Earlier registration/Scanner reviews remain historical evidence. Exact browser/HTTP, authenticated PNG-byte/decode and cash acceptance results belong to `docs/IMPLEMENTATION_STATUS.md`. Native PNG save, the uncaptured private expired-dashboard visual state, physical devices, hosted access and live email remain outside this finish claim. Established DESIGN.md tokens and visual world remain unchanged.
