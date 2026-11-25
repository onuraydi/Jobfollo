# Security Policy

## Security & Privacy Model

Jobfollo is designed as a **100% local-first** desktop application:

- **Local storage only:** All user data resides in a single SQLite file inside the OS application data directory.
- **No telemetry or external services:** The application makes zero network connections except when the user explicitly configures and triggers SMTP email reminders.
- **OS Keychain isolation:** SMTP passwords are stored exclusively in the operating system's native keychain (Windows Credential Manager, macOS Keychain, Linux Secret Service). Passwords are never stored in SQLite, JSON backups, CSV exports, or logs, and are scrubbed from SMTP error output.
- **Locked-down SQLite IPC:** The Rust backend installs a custom SQLite authorizer blocking `ATTACH`, `DETACH`, `PRAGMA`, virtual tables, and `LOAD_EXTENSION`, enforces read-only queries in `db_select`, rejects multi-statement SQL strings, and runs all writes inside atomic transactions.
- **Strict CSP & safe links:** Tauri's Content Security Policy restricts origins, and user-provided URLs (job postings, contact profiles) are validated to allow only `http:` and `https:` schemes before opening.

## Supported Versions

| Version | Supported |
|---|---|
| `0.1.x` | Yes |

## Reporting a Vulnerability

If you discover a security vulnerability, **please do not open a public GitHub issue**.

Instead, report it privately using **GitHub Security Advisories** ("Report a vulnerability" under the repository's **Security** tab) or email the maintainer directly at the address listed in Git commit metadata.

Please include:
- A clear description of the vulnerability and its potential impact
- Steps to reproduce or a proof of concept
- Affected OS and Jobfollo version

We will acknowledge receipt within 72 hours and work with you on a coordinated fix before public disclosure.
