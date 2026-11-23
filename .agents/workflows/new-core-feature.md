---
description: Implement a new behaviour in packages/core test-first
---

# New core feature

1. Read `docs/PRD.md`, `docs/ARCHITECTURE.md` and `packages/core/AGENTS.md`.
2. Restate the behaviour as concrete scenarios (inputs, `today`, expected output). Show them to the user before coding.
3. Write failing tests in `packages/core/test/` for every scenario, including edge cases (month/year boundary, leap day, late completion, outcome mid-flow).
4. Run `pnpm --filter @jobfollo/core test` and confirm the new tests fail for the right reason.
5. Implement the minimum code in `packages/core/src/` to make them pass. Keep the function pure; `today` is a parameter.
6. Export public API from `packages/core/src/index.ts`.
7. Run `/pre-commit-check`.
8. Tick the matching box in `docs/ROADMAP.md` and propose a Conventional Commit message.
