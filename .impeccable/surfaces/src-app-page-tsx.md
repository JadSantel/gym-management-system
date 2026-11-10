---
version: 1
slug: "src-app-page-tsx"
primary_target: "src/app/(crm)/page.tsx"
related_targets: ["src/components/app-shell.tsx", "src/components/member-directory.tsx", "src/app/(crm)/operate/page.tsx", "src/app/(crm)/members/page.tsx", "src/app/(crm)/members/[id]/page.tsx", "src/app/(crm)/transactions/page.tsx", "src/app/(crm)/team/page.tsx"]
---

# Workspace navigation and owner daily dashboard

## Direction contract — owner dashboard, November 10, 2026

THESIS: Give the owner a daily snapshot of confirmed collections, current eligibility and recorded attendance, followed by receipts and direct workflow links. Replace the dashboard's policy-explanation panel with useful data.

OWN-WORLD: Inherit the existing Geist, paper/ink, border-led semantic Light/Dark/System world and local shadcn components. Cash is solid; Online is hatched, with explicit labels and a daily value table.

STORY: Read today's confirmed money and method split; check eligible members and occupancy; compare seven Manila collection dates; open a member, payment flow, scanner or receipt.

FIRST VIEWPORT: Welcome and three workflow links; three compact KPI Cards; snapshot time; full-width paired collections bars and seven-day method totals; recent payments below. Phone money card spans both columns above the two member/attendance cards. Loading and safe retry errors belong only to this snapshot.

FORM: User-specified dashboard inside the established world; direct code implementation, no new visual identity or comp selection. Competitor references: Gymdesk Dashboard Overview and PushPress Check-Ins documentation. No unsupported analytics or financial mutations.

FINISH: Both-theme desktop/tablet/phone visual and keyboard review, synthetic record/date/authority checks, finish review and documentation; then stop at the user's GitHub checkpoint.

SHIPPED EXPRESSION: Three local shadcn Cards show today's confirmed total/count with Cash and Online values, current verified eligibility, and current inside/today's check-ins. They form three columns from 640px; the money Card spans both phone columns above eligibility and attendance. A server snapshot time precedes the full-width seven-day collection panel: solid left Cash bars, hatched right Online bars, labelled totals and an expandable daily-amount Table with Manila dates. Four recent confirmed payments retain member and receipt links. Record payment, Find a member and Open scanner remain above the snapshot during loading or safe-retry errors. Owner-only routing and staff redirects are unchanged.

RENDERED EVIDENCE: `.impeccable/review/dashboard/after/` contains 57 PNG captures across light/dark, 1440/768/390/320 widths and populated/empty/loading/error states, including scrolled collections, payments and expanded daily amounts. The finish reviewer returned ship with no material fixes. These are local synthetic interface evidence; the status ledger records executable checks and remaining live gates.

The navigation notes below are historical where superseded by this dashboard direction or PROJECT's November 7 Online enrollment revision.

Mode: Operate. User-pinned reference: gym-crm-prototype-v2.html, final v2 restyle, October 30, 2026. No invention/comp selection round; the supplied functioning prototype is the approved reference. Compare rendered reference and implementation at the same sizes.

THESIS: Keep member lookup, eligibility, full-cash collection and confirmed payment history easy to find; use clear navigation labels without implying unsupported workflows.
OWN-WORLD: Warm paper, near-black ink controls, Geist, orange selection accents, green confirmed/effective states, rectangular controls and border-led panels. First-class Light/Dark/System. Light panels remain neutral light per AGENTS.md; the duplicated desk banner is removed.
STORY: November 3 navigation: Quick Actions has Add Members (`/members?add=member`) and Record Payment (`/members#search-name`, member plus cash capability). Owner-only Overview has Dashboard and disabled Reports — Coming soon, without a reporting route. Management has Members, Payments, Attendance and QR Scanner, all with member capability. Account holds owner-only Plans & Pricing, Team & Access / Your account, and member-authorized Historical Pilot Evidence. Empty sidebar groups hide; brand fallback remains owner `/`, member staff `/members`, other staff `/team`. QR Scanner has its own active state, taking precedence over Attendance. Account routes retain header labels and current-link styling. All server checks remain authoritative.
FIRST VIEWPORT: user-selected shadcn sidebar-04 floating 19rem sidebar (October 31, 2026), header toggle, 30px gutters, two owner metrics, cash-only scope guidance and recorded seven-day cash collections; recent confirmed records below. Below 1024px use the labelled Sheet drawer with Escape/focus return; show the four permitted Management destinations in bottom navigation, stacking and labelled table rows. Both themes retain drawer focus containment, Escape/focus return and close-on-navigation.
FORM: Implementation follows the user-supplied HTML design directly, not AI-generated replacement comps. No raster asset generation or comp build gates are applicable.
CONSTRAINTS: FR-01-12, AC-01-12, UX-01-12, AD-030/032/033. No financial mutation, approval, auth or RLS contract changes. No changes to existing attendance, member/contact, payment, auth, schema or live-data contracts. This navigation increment reuses installed sidebar-04 primitives and semantic tokens; no API, schema or dependency changes. Payments is confirmed history with historical non-cash records read-only. No pending/failed/refunded tabs, debt or undefined expiring-soon state. Creating a member grants no paid access. Reports functionality and member portal/login remain deferred; FR-13/14 registration and attendance are implemented separately. Digital collection, Exceptions, outage and daily closing are retired. After verifying Members lookup, eligibility, creation and payment access, `/operate` becomes a temporary 307 compatibility redirect to `/members`; no Front Desk navigation link remains. Dashboard/payment-history links target Members lookup directly. Keep destination authorization authoritative.
NAVBAR (November 2, 2026 reference): right-aligned live Manila time with seconds, PHT/date, icon Appearance button with persisted Light/Dark/System choices, then far-right operator initials/name/Owner or Staff. Local Button/Popover compose account/team access and sign-out; identity no longer appears in the sidebar footer. Phones retain clock, initials, role and controls, collapsing name/route text. Device clock is informational; no gym/location dropdown, notifications, role switch or permission changes.

FINISH: Rendered comparison, both-theme responsive/accessibility checks, real synthetic regression, focused rendered finish review and synchronized design/status docs, then GitHub checkpoint after the authorized task.
