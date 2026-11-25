<div align="center">

# Jobfollo

**Keep your job applications and follow-ups on schedule — 100% local-first.**

A privacy-respecting desktop app for tracking open job postings, spontaneous general applications, follow-up cadences, calendars, and reusable email/message templates. Your data never leaves your computer.

[![CI](https://github.com/onuraydi/Jobfollo/actions/workflows/ci.yml/badge.svg)](https://github.com/onuraydi/Jobfollo/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/onuraydi/Jobfollo?include_prereleases&label=release)](https://github.com/onuraydi/Jobfollo/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platforms](https://img.shields.io/badge/Platforms-Windows%20%7C%20macOS%20%7C%20Linux-slate)](https://github.com/onuraydi/Jobfollo/releases/latest)

[Website](https://onuraydi.github.io/Jobfollo/) · [Download Latest](https://github.com/onuraydi/Jobfollo/releases/latest) · [Architecture](docs/ARCHITECTURE.md) · [Contributing](CONTRIBUTING.md) · [Changelog](CHANGELOG.md)

</div>

---

## Download

Pre-built desktop installers are compiled transparently via GitHub Actions and published on [GitHub Releases](https://github.com/onuraydi/Jobfollo/releases/latest):

| Platform | Recommended Installer | Alternative |
|---|---|---|
| **Windows** (10/11 x64) | `Jobfollo_..._x64-setup.exe` | `.msi` |
| **macOS** (Apple Silicon M1–M4) | `Jobfollo_..._aarch64.dmg` | — |
| **macOS** (Intel) | `Jobfollo_..._x64.dmg` | — |
| **Linux** (x64) | `.AppImage` | `.deb` |

> **First-launch note (unsigned open-source builds):**
> - **Windows:** If SmartScreen appears, click **More info → Run anyway**.
> - **macOS:** Right-click `Jobfollo.app` → **Open**, or run `xattr -cr /Applications/Jobfollo.app` in Terminal.

---

## Why Jobfollo?

Job searches and outreach campaigns break down in spreadsheets: you apply, send a connection request, mean to follow up in 7 days, and forget. Jobfollo turns your follow-up cadence into editable templates and a focused **Today** view — without cloud accounts, subscriptions, or risky browser automation.

## Key Features

- **Dedicated Tracking Views:** Separate sidebar tabs for **Job Postings**, **General Applications**, and **All Items**, with both **Table** and **Kanban** board views, rich filters (workflow, outcome, priority, work mode), search, sorting, and bulk actions.
- **Today Dashboard:** Overdue, due-today, and upcoming steps in one place with 1-click completion, **Undo**, **Snooze** (+1d / +3d / next Monday), business-day-only scheduling (**skip weekends**), and `Ctrl+K` Command Palette.
- **Email & Message Templates:** Dedicated **Templates** library with 6 built-in TR/EN templates (job posting, general application, 7-day follow-up, post-interview thank-you, LinkedIn connection note, short DM), live variable preview (`{{company}}`, `{{role}}`, `{{contact}}`, `{{title}}`) bound to any saved item, 1-click copy, and `mailto:` handoff.
- **Monthly Calendar & `.ics` Export:** Visualize every scheduled follow-up across the month and export any step to your external calendar.
- **Local Analytics & Weekly Goal:** Response, interview, and offer conversion rates, outcome funnel, weekly application goal tracker, and breakdowns by application type, channel, work mode, and priority.
- **Customizable Workflows:** Built-in TR/EN follow-up templates plus a full workflow editor to duplicate, customize, or create multi-step cadences.
- **Reminders & System Tray:** Native OS desktop notifications plus optional daily email digests sent through your own SMTP server, minimize-to-tray on close, and launch-at-login.
- **Personalization & Portability:** Full **Turkish & English** UI, Light/Dark/System theme, 5 color palettes, 4 offline typography presets, comfortable/compact density, CSV import/export, and full JSON backup/restore.

---

## Security & Privacy Guarantees

| Guarantee | Implementation |
|---|---|
| **100% Local-First** | Single local SQLite database (`WAL` + `foreign_keys = ON`). No cloud sync, no accounts, no telemetry. |
| **OS Keychain Only** | SMTP passwords are stored exclusively in the OS keychain (Windows Credential Manager, macOS Keychain, Linux Secret Service) and scrubbed from error messages, logs, SQLite, and backups. |
| **Locked-Down SQLite Engine** | Custom Rust SQLite authorizer denies `ATTACH`, `DETACH`, `PRAGMA`, virtual tables, and `LOAD_EXTENSION`; enforces read-only selects and strict single-statement execution. |
| **Reminds, Never Acts** | Zero LinkedIn scraping, zero automated messaging, zero browser driving. You stay in full control. |

See [SECURITY.md](SECURITY.md) for vulnerability reporting and our full security model.

---

## Architecture

Jobfollo is a strict, layered monorepo:

```text
jobfollo/
├── packages/core/     # Pure TypeScript domain logic (scheduling, digest, templates, stats, .ics)
├── packages/data/     # SQLite repositories & immutable numbered SQL migrations
├── apps/desktop/      # Tauri 2 (Rust) + React 19 + Tailwind CSS v4 desktop application
├── site/              # Zero-dependency static landing page deployed to GitHub Pages
└── docs/              # PRD, Architecture, Decisions (ADRs), Roadmap, Task specs
```

- **Pure core:** `packages/core` has zero I/O, zero network, and never reads wall-clock time (`today` is always passed explicitly).
- **Immutable migrations:** Every schema change is a numbered `.sql` migration verified with SHA-256 checksums and tested against the locked-down Rust SQLite engine.
- **Bilingual by contract:** Automated tests enforce exact key parity between `en.json` and `tr.json`.

---

## Development

### Prerequisites

- **Node.js 22+** with Corepack (`pnpm`)
- **Rust stable** toolchain (`rustup`, `cargo`, `clippy`, `rustfmt`)
- On Linux: Tauri v2 system libraries (`libwebkit2gtk-4.1-dev`, `libssl-dev`, `libdbus-1-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`)

### Commands

```bash
# Install dependencies
pnpm install

# Run full typecheck and test suites (core + data + desktop)
pnpm typecheck
pnpm test

# Launch the desktop app in development mode
pnpm --filter @jobfollo/desktop tauri dev

# Build production desktop installers locally
pnpm --filter @jobfollo/desktop tauri build

# Run Rust checks and tests
cd apps/desktop/src-tauri
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
```

---

## Documentation

- [docs/PRD.md](docs/PRD.md) — Product requirements and scope
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — System design, data model, and layering rules
- [docs/DECISIONS.md](docs/DECISIONS.md) — Architectural Decision Records (ADRs)
- [docs/ROADMAP.md](docs/ROADMAP.md) — Project milestones and status
- [CONTRIBUTING.md](CONTRIBUTING.md) — Contribution guidelines and pre-PR checklist
- [CHANGELOG.md](CHANGELOG.md) — Release history

## License

Released under the [MIT License](LICENSE). Copyright © 2026 Onur Aydi.
