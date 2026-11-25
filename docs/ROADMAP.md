# Roadmap

Task specs live in `docs/tasks/`. Tick a box only when the Definition of Done in `AGENTS.md` is met.

## Phase 0 — Foundation
- [x] PRD, ARCHITECTURE, AGENTS written
- [x] Repo scaffold, workflows, CI skeleton
- [ ] GitHub repo created, first commit pushed
- [x] License holder name set in `LICENSE`

## Phase 1 — Core (`packages/core`) — spec: `tasks/phase-1-core.md`
- [x] T1.1 Types and template validation
- [x] T1.2 Calendar date utilities
- [x] T1.3 `computeSchedule`
- [x] T1.4 `computeNextStep`
- [x] T1.5 Outcomes stop the flow
- [x] T1.6 `buildDigest`
- [x] T1.7 `renderDigest` (TR + EN, text + HTML)
- [x] T1.8 Additional built-in templates
- [x] T1.9 Localized workflow titles (before T3.5)
- [x] T1.10 `shouldSendDigest` (before Phase 4)

## Phase 2 — Data (`packages/data`) — spec: `tasks/phase-2-data.md`
- [x] T2.0 Package scaffold and decisions
- [x] T2.1 Migration runner and `0001_init.sql`
- [x] T2.2 Workflow repository
- [x] T2.3 Item repository
- [x] T2.4 Steps, contacts and outcome
- [x] T2.5 Settings and reminder log
- [x] T2.6 Restart-persistence integration test

## Phase 3 — UI (`apps/desktop`) — spec: `tasks/phase-3-ui.md`
- [x] T3.0 Scaffold and decisions
- [x] T3.1 Rust SQLite pipe (`src-tauri`)
- [x] T3.2a TypeScript bridge, contract fixtures, and `@jobfollo/data/testing`
- [x] T3.2b App services, bootstrap, and boot screens
- [x] T3.3 App shell, i18n, theme
- [x] T3.4 Clock and refresh
- [x] T3.5 Today screen
- [x] T3.6 Items list and create/edit form
- [x] T3.7 Item detail
- [x] T3.8 Kanban view (optional)
- [x] T3.9 Settings, test support, CI, smoke tests

## Phase 4 — Reminders and tools
- [ ] Scheduler spike: hidden-window reliability on Windows, macOS, Linux
- [x] SMTP settings, keychain storage, test email
- [x] Daily digest sender with reminder log and catch-up on launch
- [x] Tray, minimize-on-close, launch at login
- [x] Excel/CSV import and export
- [x] Workflow editor
- [x] Backup and restore

## Phase 5 — Packaging
- [x] GitHub Actions release builds for Windows, macOS, Linux
- [ ] Signed installers where possible

## Phase 6 — Public release
- [ ] README with screenshots
- [x] CONTRIBUTING, issue labels, `good first issue`s
