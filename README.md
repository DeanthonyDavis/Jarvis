# APEX Universal 2.0 Prototype

This workspace contains a self-contained front-end prototype for the APEX Life OS concept.

## Files

- `index.html`: app shell
- `styles.css`: design system, layout, motion, responsive behavior
- `apex-data.js`: seeded product data for tasks, courses, schedule, bills, and notes
- `intelligence.js`: command-center scoring, conflict detection, weekly heat, and a constraint-aware schedule solver
- `app.js`: dashboard rendering, persistent local state, live-source syncing, and UI wiring

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

- Domain switching with a collapsible sidebar
- Command Center driven by computed priorities, conflicts, load, weekly heat, and a real slot-assignment solver pass
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
- Rotating APEX toast notifications

## Connector Notes

- Set optional environment variables from `.env.example` for Google Calendar or Canvas sync.
- The server reads a local `.env` file automatically.
- Without external credentials, the webhook endpoints are the easiest way to feed live events and assignments into the app.
- If you set `APEX_WEBHOOK_SECRET`, send the same value in the `x-apex-secret` header for webhook requests.

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
