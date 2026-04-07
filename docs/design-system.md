# Ember UI System

This file defines the current product UI rules so new screens feel intentional instead of fragmented.

## Foundations

- Mobile-first: design phone layouts first, then expand to tablet and desktop. Ember should feel like a mobile app with optional desktop power views, not a desktop dashboard squeezed onto a phone.
- Icon sizes: use `--icon-sm`, `--icon-md`, and `--icon-lg`. Domain navigation icons default to `--icon-md`; empty-state icons use `--icon-lg`.
- Spacing scale: use `--space-1` through `--space-6` for gaps and padding. Prefer fewer, larger gaps over crowded micro-spacing.
- Type scale: use `--type-xs`, `--type-sm`, `--type-md`, `--type-lg`, and `--type-xl`. Panel labels stay uppercase and small; section titles should be short and direct.
- Radius scale: use `--radius-sm`, `--radius-md`, and `--radius-lg`. Routine rows use medium radius; panels and empty states use large radius.
- Personalization classes: use `theme-*`, `density-*`, `text-*`, and `layout-*` on `.app-shell`. These are the bridge to saved layout profiles and a future widget system.
- Brand system: Ember defaults to the Dawn-to-Dusk palette, moving from deep brown midnight through ember orange into warm cream. Do not use flat black as the primary background; use `--ember-midnight` and related palette stops instead.
- Logo: use `.ember-logo-mark` for the flame identity mark. The outer stroke represents the world the user is navigating, the warm middle flame represents Ember's guidance, and the bright core represents the student.

## Patterns

- Panels: use `.panel` for major surfaces and `.panel--empty` when a whole area is waiting for setup.
- Rows: use `.row` for list items with a left badge, primary title, secondary detail, and optional action or status pill.
- Forms: use `.field-shell` for grouped labels and inputs. Add `.is-success`, `.is-error`, or `.is-loading` when a field has a clear state.
- Alerts: use `.state-notice` for inline success, error, and loading states. Toasts should mirror real records, not act as source of truth.
- Empty states: use `.empty-state` whenever a section has no real user data. Always include what is missing and the next useful action.
- Section identity: every primary section needs a distinct job, main metric, primary action, and empty-state path. Plan combines domains; School, Work, Money, Path, Recovery, and Sources should feel like separate tools.
- Ember surfaces: treat Ember as a persistent guidance layer, not a chatbot page. Use the home card for the emotional center, the planner rail for schedule coaching, upload guidance for cautious parsing review, and check-ins as context for planning.
- Manual entry: never hide manual entry behind connector setup. If a section can import or connect, it should also offer a side-by-side manual action.
- Loading states: use `.skeleton-line` when a future fetch needs a visible placeholder instead of a blank surface.
- Preferences: use `.preference-chip` inside `.preference-grid`; chips should use `aria-pressed` when selectable.
- Widget layout: use `.widget-manager-panel`, `.widget-manager-list`, and `.widget-manager-row` for dashboard module visibility/order controls. Pin, hide, and move controls must have labels and disabled states. Profile-specific layouts should explain which profile is being edited.
- Activity log: use simple row entries with entity label, action, timestamp, and one-line summary. It should support trust/debugging without becoming a noisy feed.
- Command palette: use `.command-palette` for app-wide quick switching. It must support `Ctrl`/`Cmd` + `K`, Escape, arrow keys, Enter, focus management, and descriptive result copy.
- Mobile navigation: use `.mobile-nav-sheet` for small-screen navigation. Keep high-value actions above section links and preserve large touch targets.
- Mobile shell: hide desktop-only sidebars below tablet widths. The phone experience should rely on bottom sheets, single-column content, and topbar quick actions.
- Touch targets: primary actions, surface actions, navigation rows, and icon-only buttons should be at least 44px tall on touch layouts.
- Safe areas: preserve `viewport-fit=cover` behavior and use `env(safe-area-inset-*)` where fixed or edge-aligned UI touches mobile browser chrome.
- Appearance: use the bottom-right `.appearance-settings` panel for visual identity controls. Theme switching must update CSS custom properties on `:root` instead of rerendering the full shell.
- Theme tokens: curated themes and custom themes must provide `bg`, `surface`, `surfaceStrong`, `border`, `accent1`, `accent2`, `accent3`, `text`, `textSecondary`, `textSoft`, `gradientA`, `gradientB`, and `glow`.
- Custom themes: save user-created themes in localStorage under `ember_themes` and treat them the same as built-in themes once loaded.

## Empty-State Copy Rules

- Say what is missing: "No classes imported yet."
- Say why it matters: "Ember will not invent grade data."
- Offer the next action: "Upload syllabus" or "Open connectors."
- Keep the tone calm and operational. Avoid marketing copy in app surfaces.
- Prefer "Connected when possible. Manual when needed." over "connect everything first."

## Current Coverage

- Plan: empty briefing, school signal, conflict, recommendation, load, and schedule states.
- School: empty classes, study plan, and academic deadlines, each with add/upload/connect options.
- Work / Shift Board: empty shifts, work tasks, and career pipeline, each with manual shift/task options.
- Money: empty safe-to-spend, next bills, and life admin states with manual bill/income/target options.
- Money MVP: safe-to-spend should lead, followed by manual accounts, transactions, recurring bills/subscriptions, income/paydays, and savings goals. Bank linking is an enhancement, not a gate.
- Upgrade moments: never paywall signup. Use the Ember paywall only when intent is clear: syllabus parsing, LMS sync, automatic weekly planning, conflict fixing, or upload limits. Always show a manual/free alternative beside the upgrade action.
- Ember Phase 1: dashboard home-base card, planner take panel, upload review guidance, and check-in copy are live. Backend tables for states/actions/messages/memory exist in the Phase 2 schema, and the client now persists check-ins plus deduped state/message snapshots when those tables are available. `/api/ember/hourly-scan` handles urgent/conflict-style scans, `/api/ember/morning-brief` handles once-daily dashboard briefs, and durable planner moves plus real push delivery are later phases.
- Path: empty goals and milestones with manual goal/note options.
- Recovery: empty recovery signal and insight states with check-in/rest-block options.
- Sources: empty notes, uploads, and syllabus review queue with upload and manual-source options.
- Ingestion: source uploads show extraction status, parser method, preview text, and review confidence without scheduling unconfirmed data.
- Personalization: Plan controls for theme, density, type scale, accent profile, and layout profile.
- Appearance settings: curated Dawn, Void, Retro, Floral, Solar, Arctic, Forest, Candy, and Midnight themes plus custom My Theme builder, surface opacity, blur, border style, motion, compact mode, and accent override.
- Brand welcome: the auth surface uses the Dawn horizon scene as Ember's product poster. Keep it warm, mobile-first, and specific to school/work/money planning instead of turning it into a generic AI splash page.
- Logged-in atmosphere: `.ember-atmosphere` is the main visual anchor for app screens. Each domain must use a distinct temperature modifier so the user can tell where they are before reading the page title.
- Widgets: Plan layout controls for visible/hidden state, pinned priority, manual ordering, and profile-specific Guided/Operator/Focus layouts.
- Activity: Plan audit panel for setup, upload, syllabus, note, and connector actions.
- Navigation: app-wide command palette for sections, setup surfaces, uploads, connectors, notifications, and scheduler panels.
- Mobile: bottom-sheet navigation for sections plus Search, Personalize, and Upload actions.
- Mobile install: web app manifest, theme color, safe-area viewport behavior, and SVG app icon for home-screen testing.
