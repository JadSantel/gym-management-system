---
version: 1
slug: "src-app-page-tsx"
primary_target: "src/app/page.tsx"
related_targets: ["src/components/app-shell.tsx", "src/app/operate/page.tsx", "src/app/members/page.tsx", "src/app/members/[id]/page.tsx", "src/app/transactions/page.tsx", "src/app/team/page.tsx"]
---

# Cash-only workspace navigation

Mode: Operate. User-pinned reference: gym-crm-prototype-v2.html, final v2 restyle, October 30, 2026. No invention/comp selection round; the supplied functioning prototype is the approved reference. Compare rendered reference and implementation at the same sizes.

THESIS: Keep member lookup, eligibility, full-cash collection and confirmed payment history easy to find; use clear navigation labels without implying unsupported workflows.
OWN-WORLD: Warm paper, near-black ink controls, Geist, orange selection accents, green confirmed/effective states, rectangular controls and border-led panels. First-class Light/Dark/System. Light banner remains neutral light per AGENTS.md.
STORY: Owners scan actual tenant records; staff land at front-desk work only when authorized. Quick Actions: Add Member (`/members#member-name`, member access) and Record Cash Payment (`/operate`, member plus cash access). Workspace: owner-only Dashboard (`/`), Front Desk (`/operate`), Members (`/members`), Payments (`/transactions`), with member access on the latter three. Management: owner-only Plans & pricing (`/plans`), Team & access for owners / Your account for staff (`/team`), Historical pilot evidence (`/pilot`, member access). Owner implies these capabilities. Empty groups hide; server authorization remains authoritative. Brand links preserve the existing authorized home. Shortcuts deliberately add rows and never show a current-page highlight; destination routes do. Payments wording is consistent across desktop and mobile.
FIRST VIEWPORT: user-selected shadcn sidebar-04 floating 19rem sidebar (October 31, 2026), header toggle, 30px gutters, two owner metrics, cash-only scope guidance and recorded seven-day cash collections; recent confirmed records below. Below 1024px use the labelled Sheet drawer with Escape/focus return; preserve Front Desk / Members / Payments bottom navigation, stacking and labelled table rows. Both themes retain drawer focus containment, Escape/focus return and close-on-navigation.
FORM: Implementation follows the user-supplied HTML design directly, not AI-generated replacement comps. No raster asset generation or comp build gates are applicable.
CONSTRAINTS: FR-01-12, AC-01-12, UX-01-12, AD-030/032/033. No financial mutation, approval, auth or RLS contract changes. No attendance storage, invented metrics, phone fields, role switch, schema, production, or live-data changes. This navigation increment reuses installed sidebar-04 primitives and semantic tokens; no API, schema or dependency changes. Payments is confirmed history with historical non-cash records read-only. No pending/failed/refunded tabs, debt or undefined expiring-soon state. Creating a member grants no paid access. Reports, Attendance, QR Scanner, public registration, member portal/login and QR attendance remain deferred. Digital collection, Exceptions, outage and daily closing are retired. Front Desk lookup/eligibility merge into Members and `/operate` compatibility redirect are a separate task after the navigation GitHub checkpoint.
FINISH: Rendered comparison, both-theme responsive/accessibility checks, real synthetic regression, focused rendered finish review and synchronized design/status docs, then GitHub checkpoint before the separate Front Desk merge.
