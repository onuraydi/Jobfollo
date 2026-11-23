# Jobfollo — Product Requirements

## 1. One-line definition

A local-first desktop app that tells you the **next step and its date** for every application, proposal or outreach you are running, and reminds you by **email**. Your data never leaves your computer.

## 2. Problem

People who run long, multi-touch processes (job hunting, freelance client acquisition, grant and scholarship applications, sales outreach) lose track of follow-ups. Spreadsheets need manual date math, notes apps have no notion of "what is due today", and CRMs are heavy, cloud-based and built for sales teams.

## 3. Target users

Any individual running a repeatable follow-up cadence: job seekers (any profession), freelancers, students applying to programs, researchers applying for grants. The core is profession-agnostic; the job-search flow is one built-in template.

## 4. Principles

1. **Local-first.** One SQLite file on the user's machine. No accounts, no cloud, no telemetry.
2. **Reminds, never acts.** The app never sends messages on third-party platforms (LinkedIn, etc.) and never scrapes. The user performs every outreach action. The only outgoing network traffic is the user-configured SMTP connection for reminders.
3. **Jobfollo is data, not code.** Workflows are editable templates (steps + day offsets), not hardcoded rules.
4. **Today-first.** The main screen answers "what do I do today?" in under 3 seconds.
5. **Boring and reliable.** Predictable date math, fully tested, no surprises.

## 5. Core concepts

| Concept | Meaning |
|---|---|
| **Workflow** | A template: ordered steps, each with an anchor and a day offset. |
| **Item** | One tracked thing (e.g. an application to a company), bound to a workflow, with a start date. |
| **Contact** | A person tied to an item (name, profile link, status: pending / accepted / not accepted). |
| **Step instance** | A workflow step for a specific item: planned date, completed date, skipped flag. |
| **Outcome** | Item-level result: in progress, reply, interview, offer, negative (customizable labels). Setting a terminal outcome stops pending steps. |

### Anchor rule
Each step is due `offsetDays` after an anchor. The anchor is either the item's **start date** or the **completion date of another step**. The user picks per step. (This resolves the "7 days from application or from message?" ambiguity.)

## 6. Built-in workflow templates

1. **Job application + networking** (default; data in `ARCHITECTURE.md`): apply → LinkedIn connection request → next-day acceptance check → message if accepted → reminder at day 7 → reminder at day 14 → suggest marking negative 3 days later.
2. **Freelance client outreach:** send proposal → follow-up day 3 → last follow-up day 10 → close.
3. **Grant / scholarship application:** submit → confirmation check day 7 → status check day 30.
4. **Blank:** user defines steps.

## 7. Email reminders (MVP feature)

### Behaviour
- **Daily digest**, not one email per step. One email per day listing: overdue items, due today, and (optional) due in the next N days. If nothing is due, nothing is sent.
- User sets: recipient address (defaults to own address), send time (default 09:00 local), include-upcoming days (default 0), digest language (follows app language).
- **Catch-up on launch:** if the app was closed at send time, the digest for today is sent when it next starts (once per day, never duplicated; tracked in a reminder log).
- Each digest line: item name, step title, due date, days overdue. Plain-text + HTML parts.
- **Test email** button in settings; clear error messages on failure; retries with backoff (max 3 per day).

### Delivery model (no cloud)
- The user supplies their own **SMTP** server (presets: Gmail, Outlook/Microsoft 365, Yahoo, Yandex, custom). Gmail and Outlook require an **app password**; the setup screen explains how.
- Credentials are stored in the **OS keychain** only — never in SQLite, config files, logs or exports.
- The app must be running to send. Mitigations: minimize-to-tray on close, optional launch at login, catch-up on launch. The UI states this limit honestly: "No cloud means no reminders while your computer is off."

### Out of scope for MVP
OAuth sign-in for Gmail/Outlook, per-step immediate emails, mobile push, calendar sync (ICS export is post-MVP).

## 8. MVP screens

1. **Today** — overdue, due today, upcoming; one-click "done" and "skip".
2. **All items** — filterable table, kanban view.
3. **Item detail** — step timeline, contacts, notes, outcome.
4. **Workflow editor** — add/reorder steps, set anchor and offset.
5. **Settings** — language (TR/EN), theme, email reminders, backup/restore, data location.

## 9. Non-goals

Messaging automation, browser extensions that scrape, team features, cloud sync, accounts.

## 10. Success criteria (v0.1)

- The author runs their own job search from the app instead of the spreadsheet.
- Import of the author's existing Excel tracker works.
- A stranger can install from a release page and get a working email reminder in under 5 minutes.

## 11. Roadmap

Checklist version with task links: [`ROADMAP.md`](ROADMAP.md).


| Phase | Scope | Done when |
|---|---|---|
| 0 | Repo, license, `PRD.md`, `ARCHITECTURE.md`, `AGENTS.md` | Agent can be pointed at the repo and stay in bounds |
| 1 | `core` package: workflow engine, next-step calc, digest builder, tests | All spreadsheet scenarios pass as tests |
| 2 | SQLite layer, migrations, CRUD | Data survives restart |
| 3 | UI: Today, items, detail, theme, TR/EN | Author can manage real applications |
| 4 | Email reminders (SMTP, keychain, scheduler, tray, catch-up), Excel/CSV import-export, workflow editor, backup | Reminder email arrives with app in tray; spreadsheet imported |
| 5 | Packaging, CI, signed releases for Win/macOS/Linux | Installers on the Releases page |
| 6 | README with screenshots, CONTRIBUTING, issue templates | First outside contributor can run and test |
