# Phase 1 — Core (`packages/core`)

Goal: reproduce every behaviour of the original follow-up spreadsheet as tested, pure functions. Types and the job-application template already exist; see `src/types.ts` and `src/templates/job-application-networking.json`.

Conventions for all tasks: dates are `YYYY-MM-DD`; `today` is a parameter; no dependencies; tests in `test/`.

## T1.1 Types and template validation
Add `validateWorkflow(workflow): ValidationError[]`. Rules: unique step keys, every `step:<key>` anchor references an existing step, no anchor cycles, `offsetDays >= 0`, `runIf` only uses `contactStatus`. Validate the built-in template in a test.

## T1.2 Calendar date utilities
`addDays(date, n)`, `diffDays(a, b)`, `isValidISODate(s)`, all integer-based (no local-time `Date`). Tests: month/year boundary, leap day (2028-02-29), DST change weeks, invalid input.

## T1.3 `computeSchedule(item, workflow, today)`
Returns a `StepInstance[]` with `dueDate`, `completedOn`, `status` (`done | skipped | pending | overdue | due_today | blocked`). Anchors: `start` = `item.startDate`; `step:<key>` = completion date of that step (step is `blocked` until it is completed). A step with `runIf` not satisfied by the item's contact status is `skipped`.

## T1.4 `computeNextStep(item, workflow, today)`
The earliest non-done, non-skipped, non-blocked step as `{ stepKey, title, dueDate, daysLeft }`, or `null`. `daysLeft` is negative when overdue, `0` for today. Scenarios:
- Fresh item: next is `apply` due on `startDate`.
- `apply` done, `connect_request` pending: due same day.
- `connect_request` done on D: `check_accept` due D+1.
- Contact `accepted`: `first_message` appears. Contact `not_accepted`: it is skipped and reminders continue.
- `followup_1` anchored to `start` is due start+7; `followup_2` start+14.
- `followup_2` done, 3 days later: next step is `close` with `suggestsOutcome: "negative"`.

## T1.5 Outcomes stop the flow
If `item.outcome` is in `workflow.stopOutcomes`, `computeNextStep` returns `null` and all pending steps report `status: "stopped"`.

## T1.6 `buildDigest(items, workflows, today, { upcomingDays })`
Groups next steps into `overdue`, `today`, `upcoming` (within `upcomingDays`, default 0). Sorted by due date then item title. An empty digest (all three empty) is detectable via `isEmpty`.

## T1.7 `renderDigest(digest, locale)`
Returns `{ subject, text, html }` for `tr` and `en`. Subject includes counts ("3 due today, 1 overdue"). HTML must escape user-provided text. No network, no templates engine dependency.

## T1.8 Additional templates
Add JSON templates: freelance client outreach (proposal → follow-up day 3 → last follow-up day 10 → close), grant/scholarship (submit → confirmation check day 7 → status check day 30), blank. Validate each in tests.

## Prompt for any task
```
Task: T1.x from docs/tasks/phase-1-core.md.
Context: read docs/PRD.md, docs/ARCHITECTURE.md, AGENTS.md, packages/core/AGENTS.md.
Run /new-core-feature. Do not add dependencies. Do not touch files outside packages/core and docs/ROADMAP.md.
```
