# APEX UI System

This file defines the current product UI rules so new screens feel intentional instead of fragmented.

## Foundations

- Mobile-first: design phone layouts first, then expand to tablet and desktop. APEX should feel like a mobile app with optional desktop power views, not a desktop dashboard squeezed onto a phone.
- Icon sizes: use `--icon-sm`, `--icon-md`, and `--icon-lg`. Domain navigation icons default to `--icon-md`; empty-state icons use `--icon-lg`.
- Spacing scale: use `--space-1` through `--space-6` for gaps and padding. Prefer fewer, larger gaps over crowded micro-spacing.
- Type scale: use `--type-xs`, `--type-sm`, `--type-md`, `--type-lg`, and `--type-xl`. Panel labels stay uppercase and small; section titles should be short and direct.
- Radius scale: use `--radius-sm`, `--radius-md`, and `--radius-lg`. Routine rows use medium radius; panels and empty states use large radius.
- Personalization classes: use `theme-*`, `density-*`, `text-*`, and `layout-*` on `.app-shell`. These are the bridge to saved layout profiles and a future widget system.

## Patterns

- Panels: use `.panel` for major surfaces and `.panel--empty` when a whole area is waiting for setup.
- Rows: use `.row` for list items with a left badge, primary title, secondary detail, and optional action or status pill.
- Forms: use `.field-shell` for grouped labels and inputs. Add `.is-success`, `.is-error`, or `.is-loading` when a field has a clear state.
- Alerts: use `.state-notice` for inline success, error, and loading states. Toasts should mirror real records, not act as source of truth.
- Empty states: use `.empty-state` whenever a section has no real user data. Always include what is missing and the next useful action.
- Loading states: use `.skeleton-line` when a future fetch needs a visible placeholder instead of a blank surface.
- Preferences: use `.preference-chip` inside `.preference-grid`; chips should use `aria-pressed` when selectable.
- Widget layout: use `.widget-manager-panel`, `.widget-manager-list`, and `.widget-manager-row` for dashboard module visibility/order controls. Pin, hide, and move controls must have labels and disabled states. Profile-specific layouts should explain which profile is being edited.
- Command palette: use `.command-palette` for app-wide quick switching. It must support `Ctrl`/`Cmd` + `K`, Escape, arrow keys, Enter, focus management, and descriptive result copy.
- Mobile navigation: use `.mobile-nav-sheet` for small-screen navigation. Keep high-value actions above section links and preserve large touch targets.
- Mobile shell: hide desktop-only sidebars below tablet widths. The phone experience should rely on bottom sheets, single-column content, and topbar quick actions.
- Touch targets: primary actions, surface actions, navigation rows, and icon-only buttons should be at least 44px tall on touch layouts.
- Safe areas: preserve `viewport-fit=cover` behavior and use `env(safe-area-inset-*)` where fixed or edge-aligned UI touches mobile browser chrome.

## Empty-State Copy Rules

- Say what is missing: "No classes imported yet."
- Say why it matters: "APEX will not invent grade data."
- Offer the next action: "Upload syllabus" or "Open connectors."
- Keep the tone calm and operational. Avoid marketing copy in app surfaces.

## Current Coverage

- Command Center: empty briefing, GPA, conflict, recommendation, load, and schedule states.
- Academy: empty classes, study plan, and academic deadlines.
- Works: empty shifts, work tasks, and career pipeline.
- Life: empty budget, bills, and life tasks.
- Future: empty goals and milestones.
- Mind: empty wellness signal and Mind insight states.
- Notebook: empty notes, uploads, and syllabus review queue.
- Personalization: Command Center controls for theme, density, type scale, accent profile, and layout profile.
- Widgets: Command Center layout controls for visible/hidden state, pinned priority, manual ordering, and profile-specific Guided/Operator/Focus layouts.
- Navigation: app-wide command palette for sections, setup surfaces, uploads, connectors, notifications, and scheduler panels.
- Mobile: bottom-sheet navigation for sections plus Search, Personalize, and Upload actions.
- Mobile install: web app manifest, theme color, safe-area viewport behavior, and SVG app icon for home-screen testing.
