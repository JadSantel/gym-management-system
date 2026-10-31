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

The light front-desk banner uses a neutral light surface to preserve the first-class light-mode contract; dark mode supplies the ink treatment. No charcoal content panel is imported into light mode. Overview amounts are original confirmed gross collections; daily closing keeps adjustments, refunds, and actual-funds differences.

## Typography

Self-hosted Geist Latin, copied unmodified from pinned Next.js 16.4.3. The font and SIL OFL license are in `public/fonts/`. No external font request. Page headings are 28px/600 with -0.03em tracking; 24px on phones. Section titles are 15px/600. Body is 14px, field text 16px, supporting text 12px. Amounts use tabular numerals. Status and table labels use restrained tracking, never color alone. Long references wrap.

## Layout

Desktop: user-selected shadcn `sidebar-04`, a 19rem floating sidebar with grouped submenus, header toggle, and 30px content gutters. Workspace navigation mirrors the prototype: Overview (owner), Operate, Members, Transactions, Daily closing, Exceptions. Management retains all existing digital verification, outage, pilot, plan, and account workflows. Team administration is `/team`; owners land at `/`, member-enabled staff at `/operate`, other staff at `/team`.

Below 1024px the header toggle opens a labelled Radix Sheet with focus containment, a visible close control, Escape dismissal, and return focus. Choosing a destination closes the drawer. Five-destination bottom navigation remains. The authenticated shell is anchored to the viewport and fills 100dvh: header, independently scrolling content, then bottom navigation with safe-area padding. Changing route resets the content scroll container. Phone content gutters are 18px. Metric cards use four/two/one columns. The profile groups identity, access, history, and front-desk actions; membership payment follows Plan, Payment, Review while keeping saved-charge and lost-response recovery.

Member status filters scope the displayed maximum 25 search results. Search refreshes the recorded check time. Profiles recheck current eligibility before admission. Transactions show the latest 50 confirmed records and pending claims; full filtered history stays in Exceptions. Responsive tables preserve native table semantics while showing labelled records on phones.

## Elevation & Depth

Flat surfaces with one-pixel borders; the floating sidebar uses its block's subtle shadow. Active navigation uses orange text, a neutral selected surface, and `aria-current`. The front-desk banner has a restrained dithered orange corner in CSS. No stock imagery, raster comps, fake charts, or fabricated activity.

## Shapes

Controls and avatars: 6px corners. Panels: 8px. Status labels: 4px. Local shadcn Card/Badge remain editable source. Controls retain 44px minimum targets, visible focus, semantic input strokes, and disabled/busy states.

## Components

Actively imported local shadcn Button, Input, Card/CardContent and Badge support the interface. The shell composes the installed `sidebar-04` AppSidebar and SidebarProvider/Trigger with local Sidebar, Sheet, Separator, Skeleton and Tooltip primitives. Existing Button/Input files are preserved. Generated `cn` imports reuse the project utility; required `radix-ui` and `lucide-react` versions are pinned. Native selects, labels, checkbox confirmations, and tables remain where simpler.

The shell displays the authenticated role; it has no demo role switch. Appearance remains Light/Dark/System, persisted with pre-paint initialization, live system preference updates, and storage failure fallback. Existing identity summaries, field associations, focus restoration, permission filtering, and server-enforced five-minute owner verification remain.

Payment Plan prepares the existing durable charge. Payment chooses Cash/GCash/Bank and Review adds a cash confirmation step. Digital claims keep the full evidence/reference form and designated-verifier queue. Retried cash operations retain their original key, amount, member, and charge. No attendance/check-in action or invented phone field is implemented.

## Do's and Don'ts

- Follow the supplied v2 composition and actual product data.
- Keep every state legible in both themes and at phone/tablet/desktop sizes.
- Preserve server authorization, exact centavos, PHT boundaries, and append-only history.
- Never infer total-gym metrics from a capped search result or call pending funds confirmed.
- Never treat prototype simulation, local verification, or screenshots as pilot/live readiness.
