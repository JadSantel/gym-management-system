---
version: 1
slug: payments
primary_target: src/app/transactions/page.tsx
related_targets: [src/components/transaction-list.tsx, src/components/payment-activity.module.css]
---

# Payments - approved preview integration

Mode: Operate. User approved the Members payment-activity preview for the original Payments route on November 2, 2026. Code-led, pinned composition; seed: none (approved screen).

## Direction contract

THESIS: Implement the approved four-card, filter-bar, five-column screen using real tenant-scoped payment history. Keep the sidebar and Members workspace intact.

OWN-WORLD: Inherit Geist, warm light paper and neutral dark surfaces, semantic selection/status colors and existing shadcn primitives. Reuse the preview's responsive styles.

STORY: Scan original confirmed collections, search all matching records on the server, narrow dates/method/status, inspect a row, then open its real member or durable receipt. Reference and collector filtering remain in More filters.

FIRST VIEWPORT: Payments heading and cash-payment action; four summary cards; search, date Popover, status Toggle Group and method buttons; Member/Method/Amount/Status/Receipt table. Dates appear beneath names. Responsive labelled rows depend on available content width. The footer follows the supplied navigation reference: 10/20/30 rows, Page N of M and first/previous/next/last buttons, wrapping on phones.

FORM: Approved preview is the composition reference. Summary cards aggregate all confirmed collections in selected Manila dates, independent of pagination/name/method filters. Pagination counts and fetches all matching tenant records in stable order, defaulting to 10 rows; filter or size changes reset page 1. Pending is an explanatory empty state: this history contains committed payments only. Historical digital records stay read-only. Preserve exact centavos and original receipt/member links; no new finance writes, dependencies, schema or sidebar changes.

FINISH: Database tests for uncapped totals, range boundaries, filters and tenant/permission denial; static/build/HTTP checks; native or automated rendered review in both themes at desktop/tablet/phone; fresh finish review and compact status evidence. Pause at the user's GitHub checkpoint.
