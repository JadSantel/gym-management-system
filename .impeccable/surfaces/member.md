---
version: 1
slug: "member"
primary_target: "src/app/member/page.tsx"
related_targets: ["src/app/member/layout.tsx", "src/app/member/login/page.tsx", "src/app/member/setup/page.tsx", "src/app/member/loading.tsx", "src/app/member/error.tsx", "src/components/member-shell.tsx", "src/components/member-login.tsx", "src/components/member-dashboard.tsx", "src/components/member-access.tsx", "src/components/setup-form.tsx", "src/app/join/layout.tsx"]
---

# Private member area

Mode: Operate. User-approved FR-15 / AC-15a-f extends the incumbent Form & Function world; no new palette, concept tournament or motion grammar.

THESIS: Give a member a private, readable membership status, with a personal attendance QR after paid activation and reception as the help path.

November 6 revision supersedes the initial email setup sequence below for new self-registrations: members choose their password during signup and may sign in immediately with an unverified email to view Pending status. Only current paid eligibility displays/downloads the QR. Optional email recovery proves inbox control on link consumption and revokes old sessions. Staff-created profiles without a login retain private setup after activation. Login/recovery and operator profile help reflect this distinction; operator verification remains unchanged.

FIRST VIEWPORT: Member area header and appearance control, then My Gym QR, gym name, Sign out and one border-led membership Card. The member's own name and text-backed Active/Expired/Scheduled/Pending activation Badge precede the QR or reception guidance. The black-on-white square is machine-readable content in either theme. Login and setup use narrow, visibly labelled email/password forms with a clear primary action.

INTERACTION: After paid activation, authorized staff send a private setup link from Member dashboard access on the existing member profile. Shared SetupForm handles password confirmation, safe errors, busy state, completion and removal of the URL fragment. Login recovery gives generic responses. The private dashboard shows only the signed-in member's name, gym, status, membership period/check time and current operational QR. Refresh membership rechecks the server; eligibility expiry hides the QR/download. A missing QR directs eligible members to reception. Download QR uses authenticated `/api/member/qr` with no-store responses. Sign-out failure remains visible and retryable. Member contact edits do not change the verified login email.

COMPOSITION: MemberShell is separate from AppShell, even with an operator session: no CRM navigation, operator account menu or operator clock. Root layout supplies only document/theme/skip-link infrastructure; `(crm)` retains operator URLs. Header and main share a centered container capped at 48rem; login/setup cap at 28rem and the dashboard at 36rem. Phone actions wrap; the QR scales within available width. Registration adds a sign-in link, shortened to Sign in on phones with its member-access label retained. See [registration.md](registration.md).

SYSTEM CHECK: Compared `src/app/globals.css`, root layout, MemberShell, MemberLogin, MemberDashboard, MemberAccess and SetupForm against incumbent DESIGN.md. Warm light / near-black dark semantic surfaces, self-hosted Geist, ink/paper controls, success/attention/destructive roles, visible ring focus, flat bordered panels and local shadcn Button/Input/Card/Badge carry forward. Member headings use the observed 30px utility; this surface does not redefine the global type ramp. Existing DESIGN.md/sidecar drift, including deferred-member prose, is outside this task and remains unmodified.

FINISH: The fresh independent member/registration review returned ship with no material fixes across 31 validated captures: both-theme desktop/tablet/phone setup/login/dashboard and registration, 320px dashboard/registration, plus errors/recovery. This documents the review supplied for the completed build; this documentation pass ran no browser, tests or detector. Native PNG saving was not confirmed; authenticated response bytes and independent decoding are separate evidence. The private expired-dashboard visual state was not captured. Physical scanning, hosted access and live email remain NOT VERIFIED; synthetic local capture is the current delivery scope. See `docs/IMPLEMENTATION_STATUS.md` for exact executable evidence and gates.
