# AGENTS.md — Jobfollo

Local-first desktop app that reminds users of follow-up steps (job applications, outreach) and emails a daily digest. Read `docs/PRD.md` and `docs/ARCHITECTURE.md` before any task. If a task conflicts with them, stop and ask.

## Project map

- `packages/core` — pure TypeScript domain logic (has its own `AGENTS.md`)
- `apps/desktop` — Tauri 2 + React UI, Rust capabilities (has its own `AGENTS.md`)
- `docs/` — PRD, architecture, roadmap, decisions, task specs in `docs/tasks/`
- `.agents/workflows/` — slash-command workflows (`/new-core-feature`, `/pre-commit-check`, `/update-docs`)

Current phase and task list: `docs/ROADMAP.md`. Work only on the task you were given.

## Hard rules

1. **Business logic lives only in `packages/core`.** No date math, step scheduling or digest building in React components or Rust.
2. **`core` is pure.** No `Date.now()`, no `new Date()` without arguments, no filesystem, network or global state. `today` is always a parameter.
3. **No third-party platform automation.** Never write code that sends LinkedIn messages, scrapes sites or drives a browser. The app only reminds.
4. **No secrets in storage or logs.** SMTP credentials go to the OS keychain only. Never log them, write them to SQLite, config, exports or test fixtures.
5. **No network calls except the user-configured SMTP connection.** No telemetry or analytics.
6. **No unrequested dependencies.** Ask before adding a package.
7. **Released migrations are immutable.** Add a new migration instead.
8. **Every user-visible string goes through i18n** (TR + EN). No hardcoded UI text.

## Working style

- One narrow task per conversation. Plan briefly, then implement.
- Tests first for `core`: write the failing test from the scenario, then the code.
- Small commits, Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`).
- No unrelated refactors in the same change.
- Do not silently change the data model or workflow format; propose it in `docs/ARCHITECTURE.md` first and record it in `docs/DECISIONS.md`.

## Definition of done

- `pnpm typecheck` and `pnpm test` pass; Rust: `cargo test` and `cargo clippy` clean once `apps/desktop/src-tauri` exists.
- New core behaviour has tests including edge cases: month and year boundaries, leap day, step completed late, outcome set mid-flow.
- UI changes work in light and dark themes and in both languages.
- Docs and `docs/ROADMAP.md` checkboxes updated if behaviour or scope changed.

## Commands

```
pnpm install
pnpm test
pnpm typecheck
pnpm --filter @jobfollo/core test
```
