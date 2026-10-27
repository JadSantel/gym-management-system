---
name: Gym CRM
description: A calm, traceable operations workspace in light and dark.
colors:
  light-background: "#f6f8f7"
  light-foreground: "#18221e"
  light-card: "#ffffff"
  light-sidebar: "#ffffff"
  light-muted: "#eef2f0"
  light-muted-foreground: "#55635c"
  light-border: "#dce3df"
  light-input: "#82948a"
  light-primary: "#047857"
  light-primary-foreground: "#ffffff"
  light-secondary-foreground: "#35463c"
  light-accent: "#e5f2eb"
  light-accent-foreground: "#096443"
  light-success: "#14633f"
  light-success-surface: "#e9f5ee"
  light-attention: "#85500c"
  light-attention-surface: "#fff3d9"
  light-destructive: "#b42332"
  light-destructive-foreground: "#ffffff"
  light-ring: "#047857"
  dark-background: "#101315"
  dark-foreground: "#f1f4f2"
  dark-card: "#191d20"
  dark-sidebar: "#14181a"
  dark-muted: "#242a2d"
  dark-muted-foreground: "#aebbb4"
  dark-border: "#343d39"
  dark-input: "#74857b"
  dark-primary: "#34d399"
  dark-primary-foreground: "#08271c"
  dark-secondary-foreground: "#d4ded8"
  dark-accent: "#203b30"
  dark-accent-foreground: "#8ce5b8"
  dark-success: "#8ce5b8"
  dark-success-surface: "#203b30"
  dark-attention: "#f3cd87"
  dark-attention-surface: "#3a301f"
  dark-destructive: "#ff8e99"
  dark-destructive-foreground: "#3c0911"
  dark-ring: "#58dca7"
typography:
  headline:
    fontFamily: '"Segoe UI", Arial, Helvetica, sans-serif'
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: "2.25rem"
    letterSpacing: "-0.025em"
  title:
    fontFamily: '"Segoe UI", Arial, Helvetica, sans-serif'
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: "1.75rem"
  body:
    fontFamily: '"Segoe UI", Arial, Helvetica, sans-serif'
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.25rem"
  label:
    fontFamily: '"Segoe UI", Arial, Helvetica, sans-serif'
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: "1.25rem"
  supporting:
    fontFamily: '"Segoe UI", Arial, Helvetica, sans-serif'
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: "1rem"
rounded:
  md: "0.375rem"
  lg: "0.5rem"
  xl: "0.75rem"
  full: "9999px"
spacing:
  "2": "0.5rem"
  "3": "0.75rem"
  "4": "1rem"
  "5": "1.25rem"
  "6": "1.5rem"
  "8": "2rem"
  "10": "2.5rem"
components:
  button-primary:
    backgroundColor: "{colors.light-primary}"
    textColor: "{colors.light-primary-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0.5rem 1rem"
  button-outline:
    backgroundColor: "{colors.light-card}"
    textColor: "{colors.light-foreground}"
    rounded: "{rounded.md}"
    padding: "0.5rem 1rem"
  button-destructive:
    backgroundColor: "{colors.light-destructive}"
    textColor: "{colors.light-destructive-foreground}"
    rounded: "{rounded.md}"
    padding: "0.5rem 1rem"
  input:
    backgroundColor: "{colors.light-card}"
    textColor: "{colors.light-foreground}"
    rounded: "{rounded.md}"
    padding: "0.5rem 0.75rem"
  navigation-current:
    backgroundColor: "{colors.light-accent}"
    textColor: "{colors.light-accent-foreground}"
    rounded: "{rounded.lg}"
    padding: "0.5rem 0.75rem"
  badge-secondary:
    backgroundColor: "{colors.light-muted}"
    textColor: "{colors.light-secondary-foreground}"
    rounded: "{rounded.full}"
    padding: "0.125rem 0.5rem"
  card:
    backgroundColor: "{colors.light-card}"
    textColor: "{colors.light-foreground}"
    rounded: "{rounded.xl}"
    padding: "1.5rem"
---

# Design System: Gym CRM

## Overview

**Creative North Star: "The calm operations workspace"**

Neutral surfaces, restrained emerald actions, and clear account states support reception work and careful review. The system uses ordinary system typography, fine separators, and stable navigation; hierarchy comes from placement and spacing rather than decoration. This describes the implemented user-selected direction, not a new gym brand.

This file records visual implementation. `docs/PROJECT.md` and `docs/architecture.md` remain authoritative for behavior and permissions. The roster-first Team & access composition is documented in `.impeccable/surfaces/src-app-page-tsx.md`; other screens need not repeat that composition. No shipping raster assets are used.

**Key Characteristics:**
- First-class light and dark surfaces.
- Restrained emerald actions and explicit textual statuses.
- Flat panels, fine borders, and consistent spacing.
- Responsive, permission-appropriate navigation.

## Colors

### Primary

Emerald identifies primary actions and links; the softer accent pair identifies the current navigation destination. Keep their foreground pairs intact when switching themes.

### Neutral

Light mode uses a cool pale canvas and white panels. Dark mode uses a charcoal canvas, slightly raised charcoal cards, and a separate sidebar tone. Muted surfaces group supporting content; muted foreground remains readable supporting copy. Inputs have a stronger stroke than ordinary panel borders.

Frontmatter keys prefix each runtime semantic token with its theme. In `src/app/globals.css`, `:root` supplies light values and `.dark` supplies dark values. Popover mirrors card, card/popover foreground mirror foreground, and secondary mirrors muted. The component tokens above preview light mode; implementation uses semantic CSS variables to select both sets.

Success uses the success foreground/surface pair; pending setup uses attention; errors and destructive actions use destructive. Disabled account labels use muted. These treatments accompany text.

**The Semantic Pair Rule.** Use semantic foreground/background pairs; do not carry a light-mode literal into a dark-mode component.

## Typography

One system stack serves headings, body, and controls. The headline role is the page title; title is the section heading. Body and labels share a size but differ in weight. Supporting text carries context, not the sole expression of a critical result. Inputs use larger text (1rem, line height 1.5rem); ordinary body inheritance is also 1rem with line height 1.5.

Headings use balanced wrapping. Names and addresses wrap rather than truncate in the roster. No web font, display face, decorative uppercase system, or separate mono family is installed for this interface.

## Layout

The authenticated desktop shell has a fixed sidebar (256px) from the `lg` breakpoint (1024px), a header with minimum height (80px), and a centered main area with maximum width (1440px). Main gutters step from 20px to 32px at `sm` (640px), then 40px at `lg`; vertical padding steps from 32px to 40px. Below `lg`, navigation becomes a native disclosure with the current location in its summary.

Team & access places the roster before supporting tasks. At `xl` (1280px), a flexible roster and a 360px task column have a 24px gap. Below `xl`, supporting panels follow the roster; between `md` (768px) and `xl` they share two columns. On phones, panels and row content stack. Panel and row padding is generally 24px; form fields use 16px gaps. Principal controls have minimum height (44px).

## Elevation & Depth

The touched workspace is flat at rest: no card shadows or gradients. Background, card, sidebar, and muted tones establish layers, while one-pixel borders separate panels and roster rows. Focus outlines are interaction cues, not decorative elevation. State transitions use the installed Tailwind default (150ms, standard easing); reduced-motion preference removes animation and transition duration.

## Shapes

Small rounded controls use `md`, navigation and inline confirmation use `lg`, and panels use `xl`. Status pills and initial avatars are fully rounded. These names map to Tailwind's actual radius scale in the frontmatter; the separate CSS `--radius` value does not redefine that scale. Line icons use restrained strokes and are hidden from assistive technology when adjacent text supplies their meaning.

## Components

### Local primitives

`components.json` configures shadcn/ui New York style, CSS variables, and the `@/components/ui` alias. Local `Button`, `Input`, `Card`/`CardHeader`/`CardContent`, and `Badge` are actively imported by `operator-settings.tsx`; Button and Input also compose `ReauthenticationForm`. Button is a minimal native-button variant using class-variance-authority. Navigation, appearance selection, checkboxes, labels, and roster lists use native elements; no additional catalog components are implied.

### Buttons and fields

Primary buttons use the primary pair; outline buttons use card, border, and foreground; confirmed destructive actions use the destructive pair. Buttons and fields have visible focus outlines (2px with 2px offset); general links, select, summary, and native controls use the global outline (2px with 4px offset). Disabled primitives use 60% opacity. Fields have persistent visible labels, associated help/errors, and an invalid destructive border. Loading actions use explicit progress wording.

### Cards, navigation, and badges

Cards group one task with a title and content; avoid nested containers when separators suffice. Permission-appropriate navigation groups carry a single `aria-current="page"` destination. Inactive items use muted copy and a muted hover surface. Status badges use explicit labels such as Active · Email verified, Pending setup, or Disabled; a numeric badge describes the roster count.

### Feedback and protected actions

The roster includes textual loading, empty, and retryable error states. `IdentityFeedback` announces success with `status`, errors with `alert`, and links errors to fields; error feedback receives focus. Inline disable confirmation names its consequence, focuses confirmation, supports Escape/cancel with focus restoration, and uses a distinct destructive button. Successful disable returns focus to the roster heading.

Owner verification sits in a supporting card with an inline shield and the heading “Verify before account changes.” Its explanation and password field remain visible. Styling does not establish authority or change the server-enforced verification lifetime.

### Appearance

The native Appearance select offers Light, Dark, and System. A pre-hydration script applies the preference; `gym-appearance` in local storage preserves it across reloads when storage is available. System follows the operating-system preference, including later changes. Storage failures keep a choice for the current page. Theme selection updates `.dark` and `color-scheme`; reduced motion is respected globally.

## Do's and Don'ts

### Do:
- **Do** use semantic theme tokens and preserve foreground/background pairs.
- **Do** keep status text, associated field errors, visible focus, and 44px principal targets.
- **Do** reuse the actively imported local primitives and native controls where suitable.
- **Do** inspect light and dark rendering at phone, tablet, and desktop widths.

### Don't:
- **Don't** introduce charcoal panels into light mode or separate page-specific palettes.
- **Don't** use color alone to imply account state, payment completion, or authority.
- **Don't** add decorative metrics, stock imagery, or nested cards to fill space.
- **Don't** treat this visual record as pilot, accessibility-certification, or live-readiness evidence.
