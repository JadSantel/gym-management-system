---
version: 1
slug: "src-app-members-page-tsx"
primary_target: "src/app/members/page.tsx"
related_targets: ["src/components/member-directory.tsx"]
---

# Members directory

Mode: Operate. User-selected shadcn data-table reference, November 2, 2026. Keep sidebar and app shell unchanged.

## Direction contract

THESIS: Scan membership coverage, find a person and open their existing profile or payment details from one compact table.

OWN-WORLD: Inherit warm neutral light surfaces, near-black dark surfaces, Geist, semantic status colors, border-led shadcn primitives and 44px controls.

STORY: Three complete-tenant counts precede search and All members / Active / Expiring soon / Pending filters. Active overlaps Expiring soon. Pending means no verified membership yet; scheduled paid and expired members remain distinctly labeled. Email and phone display unverified recorded contacts or Not recorded when absent.

FIRST VIEWPORT: Members heading and Add member action; three equal stat cards; compact search/status toolbar; table with Member, Email, Phone #, Membership started, Membership expires and trailing menu. Sort Member/Email; paginate 10 (default), 20 or 30 rows with a result range, page count and first/previous/next/last controls. Narrow layouts keep labelled records and accessible sorting controls. Existing creation remains below the directory, reachable through #member-name.

FORM: User-specified composition, code-led inside the established world. No concept roll or generated raster. Exact seven-day inclusive threshold on the active interval, exact PHT date/time display; profiles recheck admission. Counts ignore search, status and pagination. FR-13 adds optional contacts and the reception registration QR below the existing creation form; cash and navigation remain unchanged.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
