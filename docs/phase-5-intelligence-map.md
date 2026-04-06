# Phase 5 Intelligence Upgrade Map

Phase 5 turns APEX from a solver-backed dashboard into an understandable decision system. The goal is not more widgets. The goal is that a user can see what APEX decided, why it decided that, what tradeoff it made, and how to override it.

## Current Phase 5 Foundation

Already shipped:

- Schedule modes: Balanced, Focus Week, Light Recovery, Finals Mode, Work-Heavy, and Catch-Up.
- Mode overlays that adjust solver weights without deleting user-defined hard and soft constraints.
- Structured solver explanations on assigned, locked, open, and unscheduled schedule outcomes.
- A Command Center "Why this plan?" panel with reasons, tradeoffs, constraints, confidence, and carryover.
- Load Index setup behavior for empty accounts instead of a fake baseline percentage.
- Constraint-aware schedule assignment with hard-locked blocks and unscheduled urgent work detection.

## Full Phase 5 Definition Of Done

Phase 5 is complete when APEX can do all of the following:

- Explain every scheduled block in plain language.
- Explain every unscheduled item in plain language.
- Show what changed after a mode, constraint, check-in, or source sync update.
- Let users choose planning modes and understand the tradeoff each mode creates.
- Let users override schedule decisions without fighting the system.
- Distinguish confidence levels for schedule decisions, warnings, and recommendations.
- Feed burnout and low-energy signals into the planner as workload rules, not motivational content.
- Keep recommendations source-grounded to the user's own tasks, notes, uploads, courses, bills, and connector states.
- Produce a Daily Briefing and Weekly Briefing from real app state.

## Workstream 1: Scheduler Explainability

Current state:

- Assigned chunks include structured explanations with primary reason, supporting reasons, constraints, tradeoffs, and confidence.
- Locked and open blocks include block-level explanations.
- Unscheduled chunks include carryover explanations.
- Command Center includes a "Why this plan?" panel.

Remaining work:

- Add a "What changed since last plan" summary after each schedule recalculation.

Definition of done:

- A user can inspect any schedule outcome and understand why it happened without reading solver internals.

## Workstream 2: Schedule Modes

Current state:

- Mode buttons exist and adjust hard/soft constraint overlays.

Remaining work:

- Add mode-specific copy for expected tradeoffs.
- Add mode-specific warning thresholds.
- Add a "mode preview" before applying changes.
- Add a "reset to my normal settings" action.
- Add mode memory per user so APEX can remember what mode was active for the current week.

Definition of done:

- Modes feel like real operating modes, not just UI presets.

## Workstream 3: Human Override Rules

Current state:

- Users can adjust hard/soft constraints manually.

Remaining work:

- Add explicit override rules:
  - Never schedule before a chosen time.
  - Avoid scheduling after a chosen time.
  - Max deep-work blocks per day.
  - Reserve a daypart for planning or recovery.
  - Avoid scheduling a domain after another domain.
  - Keep commute or transition buffers around locked events.
- Store overrides in `apex_constraint_rules`.
- Show which override blocked or moved work.

Definition of done:

- Users can teach APEX their real life rules without editing JSON or guessing which slider matters.

## Workstream 4: Burnout And Recovery Signals

Current state:

- Mind check-ins affect load and scheduling.

Remaining work:

- Add a trend-based burnout risk model using:
  - Check-in history.
  - Workload spikes.
  - Unscheduled urgent work.
  - Consecutive high-load days.
  - Sleep and recovery placeholders until real health connectors exist.
- Add "soften next plan" logic when risk crosses thresholds.
- Add resource-oriented copy that does not imply therapy or diagnosis.
- Add a "protect recovery" mode recommendation when risk is sustained.

Definition of done:

- Mind becomes an operational safety layer for scheduling, not a separate wellness widget.

## Workstream 5: Daily And Weekly Briefings

Current state:

- Command Center has top priorities and recommendations.

Remaining work:

- Add Daily Briefing sections:
  - Today’s focus.
  - Conflicts to resolve.
  - Schedule changes.
  - Risk signals.
  - One recommended next action.
- Add Weekly Briefing sections:
  - Peak pressure day.
  - Academic risk.
  - Work and bill collisions.
  - Recovery needs.
  - Carryover work.
- Ground every briefing item in app state and link it to a visible source record where possible.

Definition of done:

- A first-time user can open Command Center and understand the day without scanning every dashboard.

## Workstream 6: Confidence And Trust Layer

Current state:

- Solver assignments include a score and basic explanation.

Remaining work:

- Normalize confidence into readable levels:
  - High confidence.
  - Medium confidence.
  - Low confidence.
  - Needs user review.
- Show confidence on recommendations and schedule decisions.
- Add "needs review" states when data is incomplete, stale, or placeholder-derived.
- Prevent unconfirmed syllabus review data from creating tasks automatically.

Definition of done:

- APEX is transparent about what it knows, what it inferred, and what still needs user confirmation.

## Workstream 7: Source-Grounded Recommendations

Current state:

- Recommendations use tasks, courses, bills, check-ins, and solver output.

Remaining work:

- Add source references to recommendation objects.
- Use Notebook notes, uploads, syllabus reviews, and connector status in recommendations.
- Mark generated recommendations as:
  - Direct from data.
  - Inferred from multiple sources.
  - Placeholder until parsing/sync is connected.
- Add a "show source" affordance in the UI.

Definition of done:

- Recommendations feel trustworthy because the user can see what APEX used to produce them.

## Workstream 8: Intelligence Persistence

Current state:

- Intelligence is recomputed client-side from current state.

Remaining work:

- Store planning snapshots in a table such as `apex_schedule_runs`.
- Store:
  - mode
  - constraints used
  - load score
  - scheduled blocks
  - unscheduled chunks
  - explanations
  - created_at
- Add comparison between the current and previous schedule run.

Definition of done:

- APEX can explain not just the current plan, but what changed over time.

## Recommended Build Order

1. Expand schedule explanations to cover assigned, locked, open, and unscheduled blocks.
2. Add the "Why this plan?" Command Center panel.
3. Add mode preview and mode tradeoff copy.
4. Add explicit human override rules and store them in `apex_constraint_rules`.
5. Add Daily Briefing and Weekly Briefing objects to the intelligence engine.
6. Add confidence levels and source-reference fields.
7. Add trend-based burnout risk from check-in history and load spikes.
8. Add persisted schedule run snapshots.

## Not Phase 5

These should wait until after Phase 5 is complete:

- Phase 6 visual polish and motion cleanup.
- Full Vercel/production observability.
- Real Plaid OAuth.
- Real Canvas OAuth.
- HealthKit or Health Connect.
- Full document OCR and RAG.
- Analytics dashboards.
