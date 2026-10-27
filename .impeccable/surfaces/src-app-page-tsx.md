---
version: 1
slug: "src-app-page-tsx"
primary_target: "src/app/page.tsx"
related_targets: ["src/components/operator-settings.tsx","src/components/app-shell.tsx","src/components/theme-control.tsx"]
---

# Team and access workspace

Mode: Operate. Primary target: src/app/page.tsx. Related: operator-settings.tsx, app-shell.tsx, theme-control.tsx and globals.css.

## Direction contract

THESIS: Make individual operator access understandable at a glance. Replace the scattered welcome hub with stable navigation and a roster-first workspace.

OWN-WORLD: User-pinned neutral light surfaces and charcoal dark surfaces, restrained emerald actions, fine separators, system UI typography, local shadcn primitives and explicit textual statuses.

STORY: Owners scan identity and account state, invite staff through an individual mailbox, and verify their own password before protected changes. Staff see only their workspace destinations. No invented activity metrics.

FIRST VIEWPORT: A 256px desktop sidebar and 80px header frame the Team & access title. The roster leads the main area; a 360px secondary column contains invitation and protected verification. Below 1280px, supporting panels flow below the roster; below 1024px navigation becomes a native disclosure. One visible current-location accent carries across routes. Motion is limited to nonblocking color transitions with reduced-motion support.

FORM: User-pinned SaaS operations shell; code-led. No concept roll or comp is applicable to this explicitly selected direction. seed: none (user-pinned).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Constraints: FR-01/AC-01a-c, AD-030/032/033, UX-01 and design.md sections 4-5. Existing server contracts, field IDs, tenant permissions, five-minute freshness, 48-hour invite, reset/disable/revocation, validation and financial invariants remain authoritative. Synthetic data only. No shipping raster assets are created.
