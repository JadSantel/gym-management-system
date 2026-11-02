---
name: Form & Function - Gym CRM
description: Warm paper, ink controls, and one orange operations accent.
colors:
  scrim: "rgb(0 0 0 / 50%)"
  light-background: "#f4f4f0"
  light-foreground: "#121212"
  light-card: "#fcfcfa"
  light-card-foreground: "#121212"
  light-popover: "#fcfcfa"
  light-popover-foreground: "#121212"
  light-sidebar: "#fcfcfa"
  light-muted: "#eeeee8"
  light-muted-foreground: "#5c5c56"
  light-border: "#dcdcd5"
  light-input: "#898982"
  light-primary: "#121212"
  light-primary-foreground: "#ffffff"
  light-secondary: "#eeeee8"
  light-secondary-foreground: "#42423d"
  light-accent: "#eeeee8"
  light-accent-foreground: "#121212"
  light-brand: "#ff5a14"
  light-brand-foreground: "#b53800"
  light-brand-surface: "#ffe5d6"
  light-chart: "#ffd3bc"
  light-on-brand: "#121212"
  light-success: "#177348"
  light-success-surface: "#e0f0e6"
  light-attention: "#7a5a00"
  light-attention-surface: "#f8ecc2"
  light-destructive: "#b3261e"
  light-destructive-foreground: "#ffffff"
  light-ring: "#c03c00"
  dark-background: "#0c0c0c"
  dark-foreground: "#f1f1ed"
  dark-card: "#141414"
  dark-card-foreground: "#f1f1ed"
  dark-popover: "#141414"
  dark-popover-foreground: "#f1f1ed"
  dark-sidebar: "#141414"
  dark-muted: "#1c1c1b"
  dark-muted-foreground: "#a3a39c"
  dark-border: "#333330"
  dark-input: "#777770"
  dark-primary: "#f1f1ed"
  dark-primary-foreground: "#121212"
  dark-secondary: "#1c1c1b"
  dark-secondary-foreground: "#d4d4ce"
  dark-accent: "#1c1c1b"
  dark-accent-foreground: "#f1f1ed"
  dark-brand: "#ff6a22"
  dark-brand-foreground: "#ff8a4f"
  dark-brand-surface: "#2e1b10"
  dark-chart: "#7e4729"
  dark-success: "#5fd49a"
  dark-success-surface: "#12261c"
  dark-attention: "#e8c15a"
  dark-attention-surface: "#312809"
  dark-destructive: "#ff8d84"
  dark-destructive-foreground: "#321a19"
  dark-ring: "#ff8a4f"
typography:
  headline:
    fontFamily: 'Geist, ui-sans-serif, system-ui, sans-serif'
    fontSize: "28px"
    fontWeight: 600
    lineHeight: "1.25"
    letterSpacing: "-0.03em"
  body:
    fontFamily: 'Geist, ui-sans-serif, system-ui, sans-serif'
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "1.5"
  supporting:
    fontFamily: 'Geist, ui-sans-serif, system-ui, sans-serif'
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "1.5"
  micro:
    fontFamily: 'Geist, ui-sans-serif, system-ui, sans-serif'
    fontSize: "10px"
    fontWeight: 500
    lineHeight: "1.5"
  caption:
    fontFamily: 'Geist, ui-sans-serif, system-ui, sans-serif'
    fontSize: "11px"
    fontWeight: 500
    lineHeight: "1.5"
  control:
    fontFamily: 'Geist, ui-sans-serif, system-ui, sans-serif'
    fontSize: "13px"
    fontWeight: 500
    lineHeight: "1.5"
  section:
    fontFamily: 'Geist, ui-sans-serif, system-ui, sans-serif'
    fontSize: "15px"
    fontWeight: 600
    lineHeight: "1.5"
  field:
    fontFamily: 'Geist, ui-sans-serif, system-ui, sans-serif'
    fontSize: "16px"
    fontWeight: 500
    lineHeight: "1.5"
  phone-headline:
    fontFamily: 'Geist, ui-sans-serif, system-ui, sans-serif'
    fontSize: "24px"
    fontWeight: 600
    lineHeight: "1.25"
    letterSpacing: "-0.03em"
  banner:
    fontFamily: 'Geist, ui-sans-serif, system-ui, sans-serif'
    fontSize: "26px"
    fontWeight: 600
    lineHeight: "1.5"
rounded:
  control: "6px"
  panel: "8px"
  status: "4px"
spacing:
  compact: "12px"
  panel: "20px"
  gutter: "30px"
components:
  button-primary:
    backgroundColor: "{colors.light-primary}"
    textColor: "{colors.light-primary-foreground}"
    rounded: "{rounded.control}"
    height: "44px"
  panel:
    backgroundColor: "{colors.light-card}"
    textColor: "{colors.light-card-foreground}"
    rounded: "{rounded.panel}"
    padding: "20px"
---

# Design System: Form & Function

## Overview

The user-provided `gym-crm-prototype-v2.html` (October 30, 2026) is the visual and flow reference. Its final v2 CSS overrides the earlier green prototype: warm paper, ink, Geist, compact rectangular controls, and orange selection accents. This replaces the prior emerald workspace presentation. Mode: Operate.

The prototype is design input, not product-policy authority. `docs/PROJECT.md` and `docs/architecture.md` still control authorization, money, time, history, and data boundaries. Fictional names, totals, attendance, role switching, and simplified verification logic in the prototype are not application behavior.

## Colors

`globals.css` owns light/dark semantic pairs, mapped to Tailwind tokens. Light canvas is warm paper with off-white panels. Dark canvas and panels are near-black. Primary controls reverse ink/paper between themes. Orange identifies current navigation, selected payment methods, focus, and the front-desk signature. Green means effective or confirmed; amber means pending/attention; red means blocked/destructive. Always accompany color with text.

The shared `scrim` token darkens the content behind a modal drawer by 50% in either theme.

Members uses neutral, border-led summary cards, search/table and creation panels in both themes. The duplicate Front Desk banner and its decoration have been removed. No charcoal content panel is imported into light mode. Dashboard amounts show recorded cash collections. Retired financial/operational records remain preserved and read-only in linked history.

## Typography

Self-hosted Geist Latin, copied unmodified from pinned Next.js 16.4.3. The font and SIL OFL license are in `public/fonts/`. No external font request. Page headings are 28px/600 with -0.03em tracking; 24px on phones. Section titles are 15px/600. Body is 14px, field text 16px, supporting text 12px. Amounts use tabular numerals. Status and table labels use restrained tracking, never color alone. Long references wrap.

## Layout

Desktop: user-selected shadcn `sidebar-04`, a 19rem floating sidebar with grouped submenus, header toggle, and 30px content gutters. Implemented groups are Quick Actions (Add Member at `/members#member-name`, Record Cash Payment at `/members#search-name`), Workspace (Dashboard at `/`, Members at `/members`, Payments at `/transactions`) and Management (Plans & pricing at `/plans`, Team & access at `/team`, Historical pilot evidence at `/pilot`). Dashboard and Plans & pricing are owner-only; member access gates Members, Payments, historical evidence and Add Member; Record Cash Payment additionally requires cash permission. Staff see Your account at `/team`. Empty groups are hidden. Shortcuts add two owner rows deliberately; they have no current-page styling. Destinations retain exact/descendant highlighting and the header uses their labels. Server/API checks remain authoritative. Team administration is `/team`; owners land at `/`, member-enabled staff at `/members`, other staff at `/team`.

Below 1024px the header toggle opens a labelled Radix Sheet with focus containment, a visible close control, Escape dismissal, and return focus. Choosing a destination closes the drawer. Bottom navigation contains Members and Payments for member-capable operators, with Payments wording shared across desktop and mobile. The drawer contains every permitted group; the brand link keeps the existing authorized landing route. The authenticated shell is anchored to the viewport and fills 100dvh: header, independently scrolling content, then bottom navigation with safe-area padding. Changing route resets the content scroll container. Phone content gutters are 18px. Owner metric cards use one column on phones and two from the small-screen breakpoint. The profile groups identity, access, history, and front-desk actions; membership payment follows Plan, Payment, Review while keeping saved-charge and lost-response recovery.

Members places three equal summary Cards above its search/status toolbar and six-column table, with creation below. The Cards stack on phones and form three columns from the small-screen breakpoint. Total members, Active and Expiring soon cover the complete tenant snapshot independently of name search, status selection and client pagination; the directory has no former 25-result cap. Typing filters names immediately. Refresh reads a new server snapshot and updates its check time; a failed refresh retains the last loaded records and offers a safe retry. Profiles recheck current eligibility before admission.

The Members table presents Member, Email, Phone #, Membership started, Membership expires and a trailing actions menu. Member and Email sort through TanStack Table 9.3.1; client pages offer 10 (default), 20 or 30 rows with a result range, Page N of M and first/previous/next/last controls. Changing row size resets page 1. Search and status changes return to page 1. At container widths of 760px or less, rows become labelled records with separate Member/Email sort controls and the actions menu beside the member identity. Email and phone display “Not recorded”; no contact collection or schema is implied.

Payments at `/transactions` combines four date-scoped summary cards, server member search, an inclusive PHT date-range Popover, All/Confirmed/Pending status selection, method buttons and reference/collector filters with a five-column Member/Method/Amount/Status/Receipt table. The summary covers complete tenant records in the date range independently of list filters and pagination; Revenue is original confirmed collections, not net historical refunds. Payment rows are confirmed only; Pending explains the empty result without issuing receipts. Historical non-cash records remain read-only. Real payment details open in a Sheet with member/receipt links. Shared payment-activity styles keep two summary columns below the four-column container breakpoint and preserve table semantics with labelled records on narrow containers. The footer offers server pagination with 10 (default), 20 or 30 rows, Page N of M and first/previous/next/last buttons. Filter and size changes reset page 1; summary totals remain independent of the selected page. No membership balances are introduced.

## Elevation & Depth

Flat surfaces with one-pixel borders; the floating sidebar uses its block's subtle shadow. Active navigation uses orange text, a neutral selected surface, and `aria-current`. Members retains one directory with membership status and exact dates, followed by creation; profiles retain current admission checks and payment access. No stock imagery, raster comps, fake charts, or fabricated activity.

## Shapes

Controls and avatars: 6px corners. Panels: 8px. Status labels: 4px. Local shadcn Card/Badge remain editable source. Controls retain 44px minimum targets, visible focus, semantic input strokes, and disabled/busy states.

## Components

Actively imported local shadcn Button, Input, Card/CardContent and Badge support the interface. Members composes Table with TanStack sorting/pagination, ToggleGroup for status filters, DropdownMenu for profile/payment links, and Skeleton for its route loading state. Payments also actively imports Table, Popover and ToggleGroup for its payment activity, date/reference filters and status selector, and Sheet for real payment details; Skeleton supports its loading boundary. The shell composes the installed `sidebar-04` AppSidebar and SidebarProvider/Trigger with local Sidebar, Sheet, Separator, Skeleton and Tooltip primitives. Existing Button/Input files are preserved. Generated `cn` imports reuse the project utility; required `radix-ui` and `lucide-react` versions are pinned. Native date inputs, selects, labels, checkbox confirmations, and other tables remain where simpler.

Members offers All members / Active / Expiring soon / Pending. Active means a currently effective verified paid or owner-approved legacy interval. Expiring soon overlaps Active when the current interval has more than zero and at most seven elapsed 24-hour days remaining, including the exact seven-day threshold. A prepaid next term does not remove that current term from Expiring soon; it is separately labelled “Paid next term scheduled.” Pending means no verified membership history yet; scheduled, expired and withdrawn-history records are not Pending. Dates show the current interval, otherwise the next scheduled or latest expired interval, in PHT with an exclusive expiry. “View customer” opens the existing member profile; “View payment details” opens its `#member-payments` section. Route-local loading and retryable error boundaries cover the directory read.

The shell displays the authenticated role; it has no demo role switch. Appearance remains Light/Dark/System, persisted with pre-paint initialization, live system preference updates, and storage failure fallback. Existing identity summaries, field associations, focus restoration, permission filtering, and server-enforced five-minute owner verification remain.

The navbar's right utility group follows the November 2 reference: live Manila time with seconds, PHT/date, an icon Appearance button and the far-right operator account button. Local Button/Popover primitives provide theme choices and account access/sign-out. Initials, name and Owner/Staff replace the old sidebar identity block; only gym/synthetic context stays in its footer. Phone layouts retain the initials and role while hiding the longer name and route label. The device clock is informational; server business timestamps remain authoritative.

Payment Plan prepares the existing durable full-cash charge; Payment and Review retain exact-amount confirmation. Digital collection, Exceptions, outage receipt/custody and daily closing workflows are retired. Reports, Attendance, QR Scanner, public registration, member login/portal and QR attendance remain deferred without placeholder destinations. Creating a member alone grants no paid access. Front Desk lookup/eligibility, member creation and profile/payment access are unified at `/members`; the directory redesign preserves the creation form and existing profile/payment workflows. The old desk layout is removed. `/operate` remains a temporary 307 compatibility redirect to `/members`, without a navigation destination; authorization remains enforced by the destination and APIs. Cash shortcuts target `#search-name`; creation shortcuts target `#member-name`. The Members redesign leaves sidebar, shell, navigation, authorization and tenant isolation unchanged. Retried cash operations retain their original key, amount, member, and charge. No attendance/check-in action or invented phone field is implemented.

## Do's and Don'ts

- Follow the supplied v2 composition and actual product data.
- Keep every state legible in both themes and at phone/tablet/desktop sizes.
- Preserve server authorization, exact centavos, PHT boundaries, and append-only history.
- Never infer total-gym metrics from a capped search result or call pending funds confirmed.
- Never treat prototype simulation, local verification, or screenshots as pilot/live readiness.
