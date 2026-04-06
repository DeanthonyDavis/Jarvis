# Dashboard Modernization Roadmap

This roadmap turns the UI recommendations into implementation phases for APEX.

## Shipped

- Workspace personalization state with theme, density, font scale, accent profile, and layout profile.
- Command Center personalization controls that persist with the workspace.
- CSS class hooks for `theme-*`, `density-*`, `text-*`, and `layout-*` profiles.
- Skip link, primary navigation label, `aria-current` on active navigation, and reduced-motion handling.
- Command Center widget records with `id`, `type`, `title`, `visible`, `pinned`, `order`, `size`, and `profile`.
- Widget controls for pinning, hiding, restoring, manual ordering, and resetting the Command Center layout.

## Next: Modular Widgets

- Promote widget state into normalized Supabase tables after the workspace-state fallback proves stable.
- Add profile-specific visibility so Guided, Operator, and Focus can each have independent widget layouts.
- Add drag-and-drop once the component shell is split enough to avoid full-app rerenders.
- Extend the widget model to Academy, Works, Life, Future, Mind, and Notebook.

## Later: Framework Migration

The current app is still a vanilla module renderer. A React/Vue rewrite should be planned as a migration, not mixed into random feature patches.

- Extract stable UI primitives first: `Panel`, `EmptyState`, `StateNotice`, `PreferenceGroup`, `ConnectorCard`, `SetupStep`, and `WidgetShell`.
- Move state into scoped stores so a single widget update does not call the full `renderApp()`.
- Keep optimistic UI local, then save workspace/preferences in the background.
- Use URL state for tabs, command palette targets, and expanded detail panels when routing is introduced.

## Navigation Upgrades

- Keep the sidebar for now, but add a command palette before replacing navigation.
- Add a mobile bottom-sheet navigation pattern after the component split.
- Add pinned/favorite destinations once widgets have IDs and saved ordering.

## Accessibility Guardrails

- Icon-only controls need `aria-label`.
- Active nav should use `aria-current="page"`.
- Toasts and notification updates should use live regions.
- Honor `prefers-reduced-motion`.
- Preserve keyboard focus outlines and skip-to-content behavior.
- Maintain text/icon contrast for every new theme before it becomes a default.
