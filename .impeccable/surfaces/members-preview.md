---
version: 1
slug: members-preview
primary_target: src/app/(crm)/members/preview/page.tsx
related_targets: [src/components/members-preview.tsx, src/components/payment-activity.module.css]
---

# Members payment activity preview

Mode: Operate. User-specified composition; seed: none (pinned layout, no concept round).

## Direction contract

THESIS: A reviewable payment-activity screen inside Members, using synthetic records. Preserve the existing sidebar and production member workflows.

OWN-WORLD: Inherit Form & Function's Geist, warm paper/ink, semantic orange selection, green confirmation and amber pending states. Both themes remain first-class. Use actual local shadcn primitives.

STORY: Scan confirmed revenue and transaction/method totals; narrow by name, date, method and payment status; open a row or receipt. Pending amounts never count as revenue or produce a receipt.

FIRST VIEWPORT: Members title, concise sample-data notice, four equal stat cards, one wrapping filter bar and a five-column table (Member, Method, Amount, Status, Receipt). Dates sit beneath member names. A right Sheet shows transaction details without losing filters. On phones the semantic table becomes labelled rows.

FORM: Code-led interactive screen preview following the user's exact structure. Native date pickers in a shadcn Popover; shadcn Toggle Group for Confirmed/Pending; Button method options. No generated imagery.

FINISH: Exercise search, composed filters, invalid/empty date range, no results, row/receipt details, keyboard dismissal/focus return, theme persistence and desktop/tablet/phone reflow. Development-only authenticated route; no financial writes or new collection workflow. User design/GitHub checkpoint before integration.
