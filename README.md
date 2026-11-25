# Jobfollo

**Keep your follow-ups on schedule.** A local-first desktop app that tracks your job postings, general applications, and outreach follow-ups, tells you what to do today, and reminds you via local desktop notifications or daily email digests. Your data never leaves your computer.

## Download

- **Website:** https://onuraydi.github.io/Jobfollo/
- **Direct installers:** [GitHub Releases](https://github.com/onuraydi/Jobfollo/releases/latest)
  - **Windows:** `.exe` (NSIS setup) or `.msi`
  - **macOS:** `aarch64.dmg` (Apple Silicon M1–M4) or `x64.dmg` (Intel)
  - **Linux:** `.AppImage` or `.deb`

## Features

- **Dedicated Tracking Views:** Manage **Job Postings**, **General Applications**, and **All Items** in Table or Kanban board views with search, filters, sorting, and bulk actions.
- **Today Dashboard:** Grouped view of overdue, due-today, and upcoming steps with 1-click completion, snooze (+1d / +3d / next Monday), business-day-only mode (skip weekends), and copyable message templates.
- **Monthly Calendar & `.ics` Export:** Visualize scheduled follow-ups across the month and export any step to your calendar.
- **Local Analytics:** Funnel conversion metrics (response, interview, offer rates), weekly application goal tracker, and breakdowns by application type, channel, work mode, and priority.
- **Customizable Workflows:** Built-in TR/EN templates plus a full workflow editor to create or duplicate cadences with custom steps and message templates.
- **Reminders & System Tray:** Local OS desktop notifications + optional daily email digest over your own SMTP server (credentials stored exclusively in your OS keychain), minimize-to-tray, and launch-at-login.
- **Personalization & Portability:** Light/Dark/System themes, 5 color palettes, 4 offline typography presets, comfortable/compact density, full Turkish & English UI, CSV import/export, and JSON backup/restore.

## Principles

- **Local-first:** one SQLite file, no accounts, no cloud, no telemetry.
- **Reminds, never acts:** no LinkedIn or messaging automation. You do the outreach.
- **Cadence is data:** workflows are templates you can edit.
- **Zero secrets in storage:** SMTP credentials live only in the OS keychain.

## Documentation

| File | Purpose |
|---|---|
| [docs/PRD.md](docs/PRD.md) | What we are building and why |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Stack, layering rules, data model, email subsystem |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Phase checklist |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Decision log |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute and run checks |
| [AGENTS.md](AGENTS.md) | Rules for AI coding agents |

## Development

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm --filter @jobfollo/desktop tauri dev
```

Build a production desktop installer:

```bash
pnpm --filter @jobfollo/desktop tauri build
```

## License

[MIT](LICENSE)
