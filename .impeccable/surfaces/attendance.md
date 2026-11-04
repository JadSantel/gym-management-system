---
version: 1
slug: "attendance"
primary_target: "src/app/(crm)/attendance/page.tsx"
related_targets: ["src/app/(crm)/attendance/scanner/page.tsx", "src/components/attendance-scanner.tsx", "src/components/visit-correction.tsx", "src/app/(crm)/members/[id]/qr/page.tsx", "src/components/member-qr.tsx"]
---

# Personal QR and attendance

Mode: Operate. User-supplied clickable prototype and FR-14 pin the workflow. Extend the established DESIGN.md world with code-led surfaces; no new visual identity or raster artwork.

THESIS: Identify the member, confirm their presenter and record one server-authoritative arrival or departure.

FIRST VIEWPORT: Attendance heading/Scanner action, today's three summary cards, hourly peak occupancy chart and search/status/date toolbar above paginated visit records. Visit details disclose original events and audited corrections. Scanner pairs a focused keyboard field and text-backed outcome with an explicit start/stop camera panel. The personal QR page keeps identity, functional QR, download/print and replacement consequences together.

INTERACTION: IN/OUT, repeated scan suppressed, denied, camera permission/unavailable and not-confirmed recovery are explicit. Uncertainty retries the same request without a new toggle. Past-day unclosed visits show Missing checkout with no departure. Corrections/voids require a reason and current revision; original actor/events remain visible. No missed historical creation, member login, kiosk or offline queue.

WORLD: Existing warm neutral light / near-black dark tokens, Geist, local Button/Input/Table and native labelled fields/details. Narrow records reflow. Functional black-on-white QR is content, not a palette change. No new visual system tokens.

CONSTRAINTS: MEMBERS authorization applies to every operation and navigation; cash/entitlement remains separate. Physical devices, hosted access and reachable phone HTTPS remain separate evidence gates.

## Direction contract

THESIS: Make today's recorded occupancy and each visit's progress readable at a glance. The user pins three summary cards, an hourly bar chart, filters, five-column table and reference pagination; preserve the sidebar.

OWN-WORLD: Inherit Geist, warm light/near-black dark semantic surfaces, compact controls and the existing orange accent. Local shadcn Card, Chart, Input, ToggleGroup, Button, Table, Popover and Sheet supply familiar controls.

STORY: Reception sees today's arrivals, current inside count and recorded departures, then searches or filters visits. Missing checkout and void history stay explicit; audited corrections remain reachable in visit details.

FIRST VIEWPORT: Heading and scanner action; three compact cards; a full-width hourly chart; search/status/date toolbar directly above the table. Snapshot time and Refresh make freshness explicit. Narrow tables reflow into labelled records, with the same fields.

FORM: User-pinned composition, code-led extension of the existing world; seed: none (user-pinned). Bar height is peak simultaneous recorded occupancy per Manila hour, confirmed by the user. Future hours are unobserved, not zero. Summary reads today's tenant records independently of history filters/pages. No invented exits for missing checkout.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Implemented extension

The attendance redesign preserves the shared sidebar and navigation. Three local shadcn Cards remain across phones as compact summaries: Checked in today, Inside now and Checked out. Today's nonvoided tenant records supply these counts independently of history search, status, dates and pagination. The local Chart adapts shadcn `chart-bar-default` with pinned Recharts 3.8.0 to peak simultaneous recorded occupancy per Manila hour. Future hours have no values; textual hourly values, snapshot time and manual Refresh explain the recorded snapshot.

The history toolbar combines member Input search, single-selection ToggleGroup controls All / Inside / Finished and a date Popover with From/To, Today and Missing checkout. Finished excludes voided visits; All keeps voided and missing-checkout records explicit. The local Table presents Member name / Time In / Time Out / Duration / Status and reflows into labelled records at content-container widths of 650px or less. Ongoing duration uses the server read time; missing-checkout duration remains unknown. Server pagination offers 10 (page default), 20 or 30 rows, result range, Page N of M and first/previous/next/last controls; existing API calls retain their default of 20.

A visit-details Sheet is full-width on phones and restores focus to its invoker on close. It retains original event times, actors, revisions and reasons; existing audited correction/void forms keep PHT fields, the required reason and current revision together. Empty history offers filter recovery. No departure is invented, and no schema, authorization, financial or attendance-mutation contract changes.

The scanner's keyboard and camera panels stack until the large-screen breakpoint. Local Button/Input, text-backed IN/OUT/SUPPRESSED/DENIED results and focused status feedback preserve the existing visual world. Camera frames decode locally; explicit start/stop and route cleanup release the camera. Not-confirmed recovery retains the original scan request, while correction and QR uncertainty retain their original action.

The profile-linked personal QR surface groups member identity, the functional QR, PNG download, print and replacement consequences in a narrow panel. The QR persists across renewals and carries no contact details or membership claims. Print rules hide application chrome and use light paper; physical paper, real devices, hosted HTTPS and screen-reader operation remain unverified. No new tokens, fonts, raster artwork or visual-world replacement are introduced.
