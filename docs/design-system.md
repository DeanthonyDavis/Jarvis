# APEX UI System

This file defines the current product UI rules so new screens feel intentional instead of fragmented.

## Foundations

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
- Widget layout: use `.widget-manager-panel`, `.widget-manager-list`, and `.widget-manager-row` for dashboard module visibility/order controls. Pin, hide, and move controls must have labels and disabled states.

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
- Widgets: Command Center layout controls for visible/hidden state, pinned priority, and manual ordering.
