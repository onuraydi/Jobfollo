# Jobfollo

**Keep your follow-ups on schedule.** A local-first desktop app that tells you the next step and its date for every job application or outreach you are running, and reminds you by email. Your data never leaves your computer.

> Status: pre-alpha. Design docs are in [`docs/`](docs/).

## Why

Follow-up cadences (apply → connect → message → remind at day 7 → remind at day 14 → close) are easy to lose track of in spreadsheets and notes apps. Jobfollo turns that cadence into editable templates and a "what do I do today?" screen.

## Principles

- **Local-first:** one SQLite file, no accounts, no cloud, no telemetry.
- **Reminds, never acts:** no LinkedIn or messaging automation. You do the outreach.
- **Cadence is data:** workflows are templates you can edit.
- **Email reminders** through your own SMTP account; credentials stay in your OS keychain.

## Documentation

| File | Purpose |
|---|---|
| [docs/PRD.md](docs/PRD.md) | What we are building and why |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Stack, layering rules, data model, email subsystem |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Phase checklist |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Decision log |
| [docs/ANTIGRAVITY.md](docs/ANTIGRAVITY.md) | How to develop this repo with Antigravity |
| [AGENTS.md](AGENTS.md) | Rules for AI coding agents |

## Development

```
pnpm install
pnpm test        # core tests
pnpm typecheck
```

The desktop app (`apps/desktop`) is created in Phase 3; see `docs/ROADMAP.md`.

## License

MIT
