# Contributing to Jobfollo

Thank you for your interest in contributing to **Jobfollo**!

## Project Principles

Before opening a pull request, please review [docs/PRD.md](docs/PRD.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), and [AGENTS.md](AGENTS.md):

1. **Local-first & private:** No cloud sync, no telemetry, no network calls outside the user's own SMTP server.
2. **Reminds, never acts:** Never add platform scraping, automated messaging, or browser driving.
3. **Pure domain logic:** All scheduling, date math, digest building, and analytics live in `packages/core` with `today` passed as an explicit parameter.
4. **Immutable migrations:** Never modify a released SQL migration under `packages/data/migrations/`. Add a new numbered migration instead.
5. **Bilingual UI (TR + EN):** Every user-visible string must exist in both `apps/desktop/src/i18n/locales/en.json` and `tr.json`.

## Local Setup

Prerequisites:
- Node.js 22+ with Corepack (`pnpm`)
- Rust stable toolchain (for `apps/desktop/src-tauri`)

```bash
pnpm install
pnpm typecheck
pnpm test
```

To run the desktop app in development mode:

```bash
pnpm --filter @jobfollo/desktop tauri dev
```

To build a production installer locally:

```bash
pnpm --filter @jobfollo/desktop tauri build
```

## Before Opening a PR

Run all checks locally:

```bash
pnpm typecheck
pnpm test
pnpm --filter @jobfollo/desktop build
cd apps/desktop/src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
```

## Commit Style

We use [Conventional Commits](https://www.conventionalcommits.org/):
- `feat:` — new user-facing feature
- `fix:` — bug fix
- `test:` — tests only
- `docs:` — documentation changes
- `chore:` — tooling, dependencies, CI
