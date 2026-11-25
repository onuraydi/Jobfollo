# Contributing to Jobfollo

Thank you for contributing to **Jobfollo**! This guide covers our architecture rules, local setup, and pull request workflow.

## Core Principles

All contributions must respect the project's non-negotiable invariants (see [docs/PRD.md](docs/PRD.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)):

1. **Local-first & private:** No cloud accounts, no telemetry, no analytics, and no network calls outside the user's configured SMTP server.
2. **Reminds, never acts:** Never add platform scraping, automated messaging, or browser automation.
3. **Pure domain logic (`packages/core`):** All date math, scheduling, digest building, template rendering, and analytics live in `packages/core`. Never call `Date.now()` or `new Date()` without arguments inside `core` — `today` is always a parameter.
4. **Immutable migrations (`packages/data/migrations/`):** Never edit a released migration file. Add a new sequentially numbered `.sql` file instead, separate multiple statements with `-- statement-break`, and avoid `CHECK (...)` clauses inside `ALTER TABLE ... ADD COLUMN` statements (validate in repository code so SQLite's locked-down authorizer accepts the migration).
5. **Zero secrets in storage or logs:** SMTP credentials belong exclusively in the OS keychain. Never write them to SQLite, exports, backups, or test fixtures.
6. **Bilingual UI (TR + EN):** Every user-visible string must exist in both `apps/desktop/src/i18n/locales/en.json` and `tr.json`.
7. **Theme & layout quality:** UI changes must work cleanly in both Light and Dark themes across all 5 palettes.

---

## Local Setup

### Prerequisites
- **Node.js 22+** with Corepack enabled (`corepack enable`)
- **Rust stable** with `rustfmt` and `clippy` (`rustup component add rustfmt clippy`)
- **Linux only:** `libwebkit2gtk-4.1-dev`, `build-essential`, `libssl-dev`, `libdbus-1-dev`, `pkg-config`, `libayatana-appindicator3-dev`, `librsvg2-dev`

### Install & Verify

```bash
pnpm install
pnpm typecheck
pnpm test
```

### Run Desktop App

```bash
pnpm --filter @jobfollo/desktop tauri dev
```

---

## Pre-PR Verification Checklist

Before opening a pull request, make sure all checks pass locally:

```bash
# TypeScript typecheck & unit/integration tests
pnpm typecheck
pnpm test

# Desktop frontend production bundle
pnpm --filter @jobfollo/desktop build

# Rust formatting, lints, and tests (including locked-down SQLite migration tests)
cd apps/desktop/src-tauri
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
```

---

## Commit & PR Conventions

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — new user-facing capability
- `fix:` — bug fix
- `test:` — test additions or fixes
- `docs:` — documentation updates
- `style:` — formatting-only changes (`cargo fmt`, etc.)
- `refactor:` — internal code restructuring without behavior change
- `ci:` / `chore:` — CI workflows, build tooling, dependencies

Keep pull requests focused on a single topic and update `docs/DECISIONS.md` or `docs/ARCHITECTURE.md` if you introduce a schema or architectural change.

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).
