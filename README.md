# APEX Universal 2.0 Prototype

This workspace contains a self-contained front-end prototype for the APEX Life OS concept.

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

- Command Center
- Academy
- Works
- Life
- Future
- Mind
- Notebook

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
- Command Center first-time setup checklist for uploading syllabi and connecting school, work/calendar, and finance sources
- Consistent SVG domain icon system across navigation, topbar, help, and setup surfaces
- Notification center with read/dismiss state, local fallback, and optional Supabase-backed records from the Phase 2 schema
- Connector framework panel with provider type, auth state, webhook status, sync status, last/next sync, token refresh state, error count, last result, event logs, local fallback, and optional Supabase-backed `apex_integrations` records
- Notebook source upload panel with local fallback and optional Supabase-backed `apex_uploads` metadata records
- User-created Notebook notes with editable title, body, tags, and domain, plus optional Supabase-backed `apex_notes` records
- Syllabus review queue that turns an upload into a safe `needs_review -> confirmed` workflow before any scheduling data is trusted
- Domain switching with a collapsible sidebar
- Command Center driven by computed priorities, conflicts, load, weekly heat, and a real slot-assignment solver pass
- Phase 5 schedule modes (`Balanced`, `Focus Week`, `Light Recovery`, `Finals Mode`, `Work-Heavy`, `Catch-Up`) that overlay solver weights without deleting custom constraints
- Mode preview before apply, with best-use context, tradeoffs, watch-outs, and planner deltas
- Scheduler explanation text on assigned blocks so users can see why work landed in a given time window
- Command Center "Why this plan?" panel with constraints, tradeoffs, confidence, and unscheduled carryover
- Local "What changed since last plan" schedule-run comparison for plan deltas after recalculation
- Human override rules for earliest/latest scheduling windows, max deep-work blocks, and reserved dayparts
- Outcome-focused onboarding with setup-state progress, completion feedback, unlocked value, and missing next steps
- Design-system primitives for icon sizing, spacing, typography, cards, form states, inline notices, loading placeholders, and empty states
- Empty states across Command Center, Academy, Works, Life, Future, Mind, and Notebook so missing data feels intentional
- Personalization controls for theme, density, font scale, accent profile, and layout profile
- Interactive tasks across Academy, Works, and Life
- Academy and Works sub-tabs
- Mind daily check-in with burnout recalculation
- Notebook search and brain-dump routing
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
5. Open the app, create an account, and you should land in a clean APEX workspace with no demo tasks or classes.

For local testing, copy `.env.example` to `.env` and fill in the same Supabase values, then run `node server.js`.

### Phase 2 Schema

`supabase/phase2_schema.sql` adds the normalized production-model foundation without removing the current workspace blob. It creates workspace membership, classes, assignments, syllabi, tasks, calendar events, finance records, notebooks, uploads, integrations, notifications, activity logs, scheduler preferences, and constraint rules with RLS policies and supporting indexes.

Run it only after `supabase/schema.sql`. The app still uses `apex_user_state` as its compatibility layer until the UI and API are migrated table-by-table. If this file has been run, APEX will create/read a real workspace row and use `apex_notifications` for notification records, `apex_integrations` plus `apex_integration_events` for connector lifecycle state and logs, `apex_notes` for Notebook notes, `apex_uploads` for upload metadata, and `apex_syllabi` for syllabus review state. If it has not been run yet, notifications, connector status, connector events, notes, uploads, and syllabus reviews fall back to local workspace state.

The syllabus review flow is intentionally conservative right now: it creates placeholder extraction cards from upload metadata and filename hints only. It does not parse PDF/DOCX text yet. Users must confirm the review before later phases turn parsed dates and assignments into schedule data.

## First User Testing

1. Start the server with `node server.js`.
2. Open `http://127.0.0.1:4173`.
3. Claim the local first-user profile:

```powershell
$body = @{ name = "Dean"; role = "Founder beta user" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://127.0.0.1:4173/api/user/first" -Method Post -ContentType "application/json" -Body $body
```

4. In the app, use Command Center -> Live Data Sources -> Use local live source -> Sync now.
5. Use APEX like a real beta user: change constraints, complete tasks, submit a Mind check-in, add a Brain Dump, and post webhook payloads for calendar/LMS changes.

## Next step

The next clean layer is connecting this front-end shell to authenticated product services for academic ingestion, calendar/webhook sync, durable storage, and model-backed notebook workflows.
