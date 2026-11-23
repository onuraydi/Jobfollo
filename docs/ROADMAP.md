# Roadmap

Task specs live in `docs/tasks/`. Tick a box only when the Definition of Done in `AGENTS.md` is met.

## Phase 0 — Foundation
- [x] PRD, ARCHITECTURE, AGENTS written
- [x] Repo scaffold, workflows, CI skeleton
- [ ] GitHub repo created, first commit pushed
- [ ] License holder name set in `LICENSE`

## Phase 1 — Core (`packages/core`) — spec: `tasks/phase-1-core.md`
- [x] T1.1 Types and template validation
- [x] T1.2 Calendar date utilities
- [x] T1.3 `computeSchedule`
- [x] T1.4 `computeNextStep`
- [x] T1.5 Outcomes stop the flow
- [x] T1.6 `buildDigest`
- [x] T1.7 `renderDigest` (TR + EN, text + HTML)
- [x] T1.8 Additional built-in templates

## Phase 2 — Data (`packages/data`) — spec: `tasks/phase-2-data.md`
- [x] T2.0 Package scaffold and decisions
- [ ] T2.1 Migration runner and `0001_init.sql`
- [ ] T2.2 Workflow repository
- [ ] T2.3 Item repository
- [ ] T2.4 Steps, contacts and outcome
- [ ] T2.5 Settings and reminder log
- [ ] T2.6 Restart-persistence integration test

## Phase 3 — UI
- [ ] Scaffold Tauri 2 + React in `apps/desktop`
- [ ] Today screen
- [ ] All items (table, kanban)
- [ ] Item detail
- [ ] Theme (light/dark), TR/EN

## Phase 4 — Reminders and tools
- [ ] Scheduler spike: hidden-window reliability on Windows, macOS, Linux
- [ ] SMTP settings, keychain storage, test email
- [ ] Daily digest sender with reminder log and catch-up on launch
- [ ] Tray, minimize-on-close, launch at login
- [ ] Excel/CSV import and export
- [ ] Workflow editor
- [ ] Backup and restore

## Phase 5 — Packaging
- [ ] GitHub Actions release builds for Windows, macOS, Linux
- [ ] Signed installers where possible

## Phase 6 — Public release
- [ ] README with screenshots
- [ ] CONTRIBUTING, issue labels, `good first issue`s
