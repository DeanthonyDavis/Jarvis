# Ember Prototype

This workspace contains a self-contained front-end prototype for the Ember Life OS concept.

Ember is mobile-first. Build and review new product surfaces for phone-sized flows first, then expand them into tablet and desktop layouts. Desktop dashboards are helpful for power review, but the primary user experience should feel like a mobile app: bottom-sheet navigation, large touch targets, short guided steps, and setup actions that fit one screen at a time.

## Files

- `index.html`: app shell
- `styles.css`: design system, layout, motion, responsive behavior
- `apex-data.js`: seeded product data for tasks, courses, schedule, bills, and notes
- `intelligence.js`: command-center scoring, conflict detection, weekly heat, and a constraint-aware schedule solver
- `app.js`: dashboard rendering, persistent local state, live-source syncing, and UI wiring
- `auth.js`: Supabase Auth and private per-user workspace persistence
- `server.js`: local connector server and runtime config endpoint
- `supabase/schema.sql`: Supabase table plus row-level security policies
- `supabase/phase2_schema.sql`: additive normalized schema foundation for the production data model
- `docs/phase-5-intelligence-map.md`: full Phase 5 intelligence definition of done and build order
- `docs/design-system.md`: UI system rules for icons, spacing, typography, states, cards, and empty-state behavior
- `docs/dashboard-modernization-roadmap.md`: phased plan for personalization, widgets, navigation, accessibility, and framework migration
- `api/config.js`: Vercel runtime config endpoint for public Supabase keys

## Dashboards

- Plan
- School
- Work / Shift Board
- Money
- Path
- Recovery
- Sources

## Open it

Run the local server for the full app plus connector endpoints:

Example:

```powershell
node server.js
```

Then visit `http://127.0.0.1:4173`.

You can still open `index.html` directly for a static-only pass, but the local server enables the live JSON source flow.

## Current interaction layer

- Supabase login/signup gate for beta testing
- Fresh first-run workspace with no preset demo data after signup
- Guided onboarding tutorial with Back, Next, Skip, and visible setup progress
- Contextual section guide boxes that can be dismissed after each section is understood
- Plan first-time setup checklist for uploading syllabi and connecting school, work/calendar, and finance sources
- Consistent SVG domain icon system across navigation, topbar, help, and setup surfaces
- Notification center with read/dismiss state, local fallback, and optional Supabase-backed records from the Phase 2 schema
- Connector framework panel with provider type, auth state, webhook status, sync status, last/next sync, token refresh state, error count, last result, event logs, local fallback, and optional Supabase-backed `apex_integrations` records
- Activity log widget with local fallback plus optional Supabase-backed `apex_activity_log` audit records for uploads, syllabus reviews, notes, and connector events
- Global source upload sheet that can be opened from any section without navigating to Sources, plus the Sources panel for deeper review
- Text extraction and AI-style parsing through `/api/ingest` for source uploads, with plain text support, optional PDF/DOCX packages, optional OpenAI/external parser, and Tesseract OCR fallback for images
- User-created Sources notes with editable title, body, tags, and domain, plus optional Supabase-backed `apex_notes` records
- Syllabus review queue that turns an upload into a safe `needs_review -> confirmed` workflow, then creates Academy course/task records only after confirmation
- Structured parser stages for section detection, schedule/table rows, important dates, exams, labs, homework, quizzes, breaks, holidays, confidence scoring, and dedupe
- Uploaded source removal from Sources and the global upload sheet, including Supabase upload/review cleanup when Phase 2 tables are active
- Domain switching with a collapsible sidebar
- Plan driven by computed priorities, conflicts, load, weekly heat, and a real slot-assignment solver pass
- Phase 5 schedule modes (`Balanced`, `Focus Week`, `Light Recovery`, `Finals Mode`, `Work-Heavy`, `Catch-Up`) that overlay solver weights without deleting custom constraints
- Mode preview before apply, with best-use context, tradeoffs, watch-outs, and planner deltas
- Scheduler explanation text on assigned blocks so users can see why work landed in a given time window
- Plan "Why this plan?" panel with constraints, tradeoffs, confidence, and unscheduled carryover
- Local "What changed since last plan" schedule-run comparison for plan deltas after recalculation
- Human override rules for earliest/latest scheduling windows, max deep-work blocks, and reserved dayparts
- Outcome-focused onboarding with setup-state progress, completion feedback, unlocked value, and missing next steps
- Section-specific page identity for Plan, School, Work, Money, Path, Recovery, and Sources, with different purpose copy, primary metrics, and default actions
- First-class manual entry across the app: add classes, assignments, exams, shifts, work tasks, bills, income, weekly targets, goals, notes, sources, rest blocks, and time blocks without requiring an integration
- Rocket Money-style Money foundation: manual accounts, transactions, subscriptions, recurring bills, income/paydays, savings goals, and safe-to-spend math before Plaid exists
- High-intent upgrade flow: an in-app Ember paywall appears for syllabus parsing, LMS sync, auto-planning, conflict fixing, and upload-limit moments instead of interrupting signup
- Ember interaction layer foundation with a home-base dashboard card, planner take panel, upload review guidance, daily check-in copy, local state detection, and schema tables for future persisted Ember states/messages/actions/memory
- Design-system primitives for icon sizing, spacing, typography, cards, form states, inline notices, loading placeholders, and empty states
- Empty states across Plan, School, Work, Money, Path, Recovery, and Sources so missing data feels intentional
- Personalization controls for theme, density, font scale, accent profile, and layout profile
- Bottom-right Appearance Settings panel with live CSS-variable theme switching, card blur, surface opacity, animation, compact mode, border personality, and accent override controls
- Curated Ember themes: Void, Retro, Floral, Solar, Arctic, Forest, Candy, and Midnight
- "My Theme" builder for custom background, surface, text, accent, gradient, and preview settings saved locally under `ember_themes`
- Student optimizer visual direction with selectable gradient profiles: Study Neon, Campus Sunrise, Library Blue, Focus Lime, and Exam Ember
- A more student-planner visual direction with desk-board language, notebook-line texture, quieter surfaces, and less generic AI-dashboard glow
- Plan widget controls for pinning, hiding, restoring, manual ordering, and resetting the dashboard layout
- Profile-specific widget layouts for Guided, Operator, and Focus Plan views
- App-wide command palette with `Ctrl`/`Cmd` + `K`, search, keyboard navigation, deep links into setup/widgets/connectors/notifications, and upload opening that keeps the current section in place
- Mobile bottom-sheet navigation with section links plus Search, Personalize, and Upload actions
- Mobile web app metadata for home-screen usage, safe-area viewport behavior, and mobile status-bar treatment
- Mobile app manifest and SVG app icon for installable home-screen testing
- Mobile shell rules that hide the desktop sidebar on phone/tablet widths and rely on bottom-sheet navigation instead
- Interactive tasks across School, Work, and Money
- School and Work sub-tabs
- Recovery daily check-in with burnout recalculation
- Sources search and brain-dump routing
- User-adjustable hard and soft scheduling constraints, persisted in local storage
- Live JSON source syncing through manual payloads, remote fetch, and cross-tab storage updates
- Local connector routes:
  - `GET /api/user/first`
  - `POST /api/user/first`
  - `GET /api/source/live`
  - `GET /api/connectors/calendar?refresh=1`
  - `GET /api/connectors/lms?refresh=1`
  - `POST /api/webhooks/calendar`
  - `POST /api/webhooks/lms`
  - `POST /api/webhooks/apex`
- Action-scoped toast notifications only; no background notification loop

## Connector Notes

- Set optional environment variables from `.env.example` for Google Calendar or Canvas sync.
- The server reads a local `.env` file automatically.
- The connector framework tracks an explicit lifecycle for each provider: connect, disconnect, test connection, sync now, re-auth, last sync result, error count, token expiration, refresh status, and recent connector events.
- `apex_integration_events` stores the connector audit stream when `supabase/phase2_schema.sql` is installed. If that table is not available yet, recent events stay in local connector metadata so the UI remains usable.
- Without external credentials, the webhook endpoints are the easiest way to feed live events and assignments into the app.
- If you set `APEX_WEBHOOK_SECRET`, send the same value in the `x-apex-secret` header for webhook requests.

## Supabase Login Setup

1. Create a Supabase project.
2. In Supabase SQL Editor, run `supabase/schema.sql`.
3. In Vercel Project Settings -> Environment Variables, set:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
4. Redeploy the Vercel project.
5. Open the app, create an account, and you should land in a clean Ember workspace with no demo tasks or classes.

For local testing, copy `.env.example` to `.env` and fill in the same Supabase values, then run `node server.js`.

### Phase 2 Schema

`supabase/phase2_schema.sql` adds the normalized production-model foundation without removing the current workspace blob. It creates workspace membership, classes, assignments, syllabi, tasks, calendar events, finance records, notebooks, uploads, parser evidence tables, integrations, notifications, activity logs, scheduler preferences, and constraint rules with RLS policies and supporting indexes.

The Money schema is additive and manual-first: it extends financial accounts and transactions, then adds recurring finance items, savings goals, and shift pay records. The current app still stores Money records in the workspace compatibility blob, but the tables are ready for Plaid/payroll/schedule sync.

The access schema is additive too: `apex_user_profiles`, `apex_subscriptions`, and `apex_feature_usage` support Free, Pro monthly/yearly, Pro+, and Semester Pass states. The current client uses a local beta upgrade simulation; connect Stripe or another billing provider before charging real users.

The Ember schema is additive: `apex_user_check_ins`, `apex_ember_states`, `apex_ember_actions`, `apex_ember_messages`, `apex_ember_memory`, and `apex_ember_notification_events` prepare the backend for persisted state detection, action tracking, dashboard/planner/upload messages, long-term pattern memory, and notification guardrails. The current client uses a local Phase 1 engine in `ember-engine.js` and now writes check-ins, state/message snapshots, planner action requests, and in-app notification guardrail events when the Ember tables exist. Edge Function scans, real push delivery, and durable planner block moves are still future work.

Run it only after `supabase/schema.sql`. The app still uses `apex_user_state` as its compatibility layer until the UI and API are migrated table-by-table. If this file has been run, Ember will create/read a real workspace row and use `apex_notifications` for notification records, `apex_integrations` plus `apex_integration_events` for connector lifecycle state and logs, `apex_activity_log` for audit records, `apex_notes` for Notebook notes, `apex_uploads` for upload metadata, and `apex_syllabi` for syllabus review state. If it has not been run yet, notifications, connector status, connector events, activity, notes, uploads, and syllabus reviews fall back to local workspace state.

The syllabus review flow is intentionally conservative: `/api/ingest` extracts text, runs section-aware parsers first, creates a parsed review card, and waits for user confirmation before parsed dates and assignments become Academy data. After confirmation, Ember adds the imported course plus extracted homework/lab/quiz/exam tasks when they are present and avoids duplicating existing rows. Breaks, holidays, policies, and info rows are retained as review evidence but do not create task rows. Plain text works without extra packages. PDF/DOCX extraction uses optional `pdf-parse` and `mammoth` dependencies. Image OCR uses `tesseract.js` as the fallback when available. If `APEX_AI_PARSE_URL` or `OPENAI_API_KEY` is configured, AI parsing is treated as an enrichment layer; Ember keeps the structured parser result if the AI response returns fewer extracted items.

## First User Testing

1. Start the server with `node server.js`.
2. Open `http://127.0.0.1:4173`.
3. Claim the local first-user profile:

```powershell
$body = @{ name = "Dean"; role = "Founder beta user" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://127.0.0.1:4173/api/user/first" -Method Post -ContentType "application/json" -Body $body
```

4. In the app, use Plan -> Live Data Sources -> Use local live source -> Sync now.
5. Use Ember like a real beta user: change constraints, complete tasks, submit a Mind check-in, add a Brain Dump, and post webhook payloads for calendar/LMS changes.

## Next step

The next clean layer is connecting this front-end shell to authenticated product services for academic ingestion, calendar/webhook sync, durable storage, and model-backed notebook workflows.
