---
version: 1
slug: "src-app-page-tsx"
primary_target: "src/app/page.tsx"
related_targets: ["src/components/app-shell.tsx", "src/app/operate/page.tsx", "src/app/members/page.tsx", "src/app/members/[id]/page.tsx", "src/app/transactions/page.tsx", "src/app/team/page.tsx"]
---

# Prototype v2 operations overhaul

Mode: Operate. User-pinned reference: gym-crm-prototype-v2.html, final v2 restyle, October 30, 2026. No invention/comp selection round; the supplied functioning prototype is the approved reference. Compare rendered reference and implementation at the same sizes.

THESIS: Make daily operations the entry point, with member lookup, access, payment, transaction review, exceptions, and closing in one coherent workspace.
OWN-WORLD: Warm paper, near-black ink controls, Geist, orange selection accents, green confirmed/effective states, rectangular controls and border-led panels. First-class Light/Dark/System. Light banner remains neutral light per AGENTS.md.
STORY: Owners scan actual tenant records; staff land at front-desk work only when authorized. Administration moves to /team. Preserve all existing recovery and evidence tools.
FIRST VIEWPORT: user-selected shadcn sidebar-04 floating 19rem sidebar (October 31, 2026), header toggle, 30px gutters, four owner metrics, attention/recent case review and real seven-day gross amounts; table of recent confirmed records below. Below 1024px use the labelled Sheet drawer with Escape/focus return; preserve bottom navigation, stacking and labelled table rows.
FORM: Implementation follows the user-supplied HTML design directly, not AI-generated replacement comps. No raster asset generation or comp build gates are applicable.
CONSTRAINTS: FR-01-12, AC-01-12, UX-01-12, AD-030/032/033. No financial mutation, approval, auth or RLS contract changes. No attendance storage, invented metrics, phone fields, role switch, schema, production, or live-data changes. Sidebar-04 adds pinned radix-ui/lucide-react dependencies and reuses the existing visual tokens.
FINISH: Rendered comparison, both-theme responsive/accessibility checks, real synthetic regression, independent finish review, DESIGN.md and sidecar, then GitHub checkpoint.
