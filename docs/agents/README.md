# Agent Review Contracts

This folder defines role contracts for structured reviews during implementation and release.
These contracts are written for AI coding/review agents (for example GPT-Codex or Claude Code) and can also be used as manual reviewer checklists.

## Roles
- `ux.md`: user flows, clarity, friction, accessibility, and interaction quality.
- `qa.md`: functional correctness, regression risk, and test quality.
- `devsecops.md`: dependency/security posture, secrets hygiene, release/process hardening.
- `pm.md`: issue alignment, scope control, acceptance criteria, and release communication.

## How to use
1. Open the role contracts before implementation and before merge.
2. Record findings in the PR under `Agent Reviews`.
3. Treat critical/high findings as merge blockers unless waived.
4. Keep recommendations scoped and actionable.
5. Invoke one role at a time in your AI tool and request output in the contract format.
