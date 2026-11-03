---
version: 1
slug: "attendance"
primary_target: "src/app/attendance/page.tsx"
related_targets: ["src/app/attendance/scanner/page.tsx", "src/components/attendance-scanner.tsx", "src/components/visit-correction.tsx", "src/app/members/[id]/qr/page.tsx", "src/components/member-qr.tsx"]
---

# Personal QR and attendance

Mode: Operate. User-supplied clickable prototype and FR-14 pin the workflow. Extend the established DESIGN.md world with code-led surfaces; no new visual identity or raster artwork.

THESIS: Identify the member, confirm their presenter and record one server-authoritative arrival or departure.

FIRST VIEWPORT: Attendance heading/Scanner action, labelled Manila date/member/view filters, paginated arrival/departure/status records and original event details. Scanner pairs a focused keyboard field and text-backed outcome with an explicit start/stop camera panel. The personal QR page keeps identity, functional QR, download/print and replacement consequences together.

INTERACTION: IN/OUT, repeated scan suppressed, denied, camera permission/unavailable and not-confirmed recovery are explicit. Uncertainty retries the same request without a new toggle. Past-day unclosed visits show Missing checkout with no departure. Corrections/voids require a reason and current revision; original actor/events remain visible. No missed historical creation, member login, kiosk or offline queue.

WORLD: Existing warm neutral light / near-black dark tokens, Geist, local Button/Input/Table and native labelled fields/details. Narrow records reflow. Functional black-on-white QR is content, not a palette change. No new visual system tokens.

CONSTRAINTS: MEMBERS authorization applies to every operation and navigation; cash/entitlement remains separate. Physical devices, hosted access and reachable phone HTTPS remain separate evidence gates.

## Implemented extension

Attendance appears in Workspace and mobile bottom navigation; Scanner is a Quick Action. Phone filters use two compact columns. The local Table reflows into labelled records at content-container widths of 900px or less. Native details disclose original event times, actors, revisions and reasons; correction/void forms keep PHT fields, the required reason and current revision together. Empty history explains Missing checkout without inventing a departure.

The scanner's keyboard and camera panels stack until the large-screen breakpoint. Local Button/Input, text-backed IN/OUT/SUPPRESSED/DENIED results and focused status feedback preserve the existing visual world. Camera frames decode locally; explicit start/stop and route cleanup release the camera. Not-confirmed recovery retains the original scan request, while correction and QR uncertainty retain their original action.

The profile-linked personal QR surface groups member identity, the functional QR, PNG download, print and replacement consequences in a narrow panel. The QR persists across renewals and carries no contact details or membership claims. Print rules hide application chrome and use light paper; physical paper, real devices, hosted HTTPS and screen-reader operation remain unverified. No new tokens, fonts, raster artwork or visual-world replacement are introduced.
