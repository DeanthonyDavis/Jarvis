# Dashboard Modernization Roadmap

This roadmap turns the UI recommendations into implementation phases for APEX.

## Product Direction: Mobile-First

APEX should be reviewed as a mobile app first. The desktop dashboard is a power-user expansion, not the source layout. Every new feature should pass a phone-sized flow review before desktop polish begins.

- Primary navigation should favor bottom sheets, quick actions, and command/search access on small screens.
- Setup flows should fit one decision per screen: add syllabus, connect school, connect calendar, connect finance, tune schedule.
- Widget work should start with single-column cards and only expand into multi-column desktop layouts afterward.
- Touch targets should stay at least 44px tall, with clear labels on icon actions.
- Safe-area support should be preserved for home-screen and mobile browser usage.

## Shipped

- Workspace personalization state with theme, density, font scale, accent profile, and layout profile.
- Command Center personalization controls that persist with the workspace.
- CSS class hooks for `theme-*`, `density-*`, `text-*`, and `layout-*` profiles.
- Skip link, primary navigation label, `aria-current` on active navigation, and reduced-motion handling.
- Command Center widget records with `id`, `type`, `title`, `visible`, `pinned`, `order`, `size`, and `profile`.
- Widget controls for pinning, hiding, restoring, manual ordering, and resetting the Command Center layout.
- Profile-specific Command Center widget layouts for Guided, Operator, and Focus profiles.
- Command palette / quick switcher with keyboard navigation and deep links to setup, widgets, connectors, sources, uploads, and notifications.
- Mobile bottom-sheet navigation for small screens with section links and high-value setup actions.

## Next: Modular Widgets

- Design the mobile widget model first: stacked widgets, pinning, hide/show, and one clear primary action per widget.
- Promote widget state into normalized Supabase tables after the workspace-state fallback proves stable.
- Add drag-and-drop once the component shell is split enough to avoid full-app rerenders.
- Extend the widget model to Academy, Works, Life, Future, Mind, and Notebook.
- Add named layout presets and duplicate/save-as flows once users can manage more than the three built-in profiles.

## Later: Framework Migration

The current app is still a vanilla module renderer. A React/Vue rewrite should be planned as a migration, not mixed into random feature patches.

- Extract stable UI primitives first: `Panel`, `EmptyState`, `StateNotice`, `PreferenceGroup`, `ConnectorCard`, `SetupStep`, and `WidgetShell`.
- Move state into scoped stores so a single widget update does not call the full `renderApp()`.
- Keep optimistic UI local, then save workspace/preferences in the background.
- Use URL state for tabs, command palette targets, and expanded detail panels when routing is introduced.

## Navigation Upgrades

- Treat the mobile bottom sheet as the primary app navigation pattern.
- Keep the desktop sidebar as a wide-screen convenience only.
- Keep the command palette for fast navigation and deep links on all screen sizes.
- Add pinned/favorite destinations once widgets have IDs and saved ordering.

## Accessibility Guardrails

- Icon-only controls need `aria-label`.
- Active nav should use `aria-current="page"`.
- Toasts and notification updates should use live regions.
- Honor `prefers-reduced-motion`.
- Preserve keyboard focus outlines and skip-to-content behavior.
- Maintain text/icon contrast for every new theme before it becomes a default.
