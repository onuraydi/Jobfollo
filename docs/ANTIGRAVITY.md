# Developing Jobfollo with Antigravity

## Setup
1. Open the **repo root** (`jobfollo/`) as the workspace so the root `AGENTS.md` loads on every prompt.
2. Antigravity also loads `AGENTS.md` files in subfolders (`packages/core`, `apps/desktop`) when the agent reads or edits files there; those hold the stricter, area-specific rules.
3. Workflows in `.agents/workflows/` are invoked as slash commands: `/new-core-feature`, `/pre-commit-check`, `/update-docs`. If your version does not list them, create them from Customizations → Workflows and paste the file contents.

## Session routine
1. **One task per conversation.** Open `docs/tasks/<phase>.md`, copy one task prompt.
2. Ask the agent to produce its plan first; review it before it edits files.
3. For core work, start with `/new-core-feature`.
4. Review the diff yourself. Pay extra attention to the data model, migrations, anything touching credentials, and any new dependency.
5. Run `/pre-commit-check`, commit (Conventional Commits), then tick `docs/ROADMAP.md`.

## Prompt template
```
Task: <T-number and title from docs/tasks/...>
Context: read docs/PRD.md, docs/ARCHITECTURE.md and the AGENTS.md files that apply.
Constraints: follow the hard rules in AGENTS.md; no new dependencies.
Deliver: failing tests first, then implementation, then /pre-commit-check.
Do not touch: anything outside <folder>.
```

## When the agent drifts
- Business rule appears in React or Rust → reject; move it into `core`.
- New dependency added without asking → revert and ask for a stdlib approach.
- Spec contradicted → stop; update `docs/ARCHITECTURE.md` and `docs/DECISIONS.md` first, then continue.
