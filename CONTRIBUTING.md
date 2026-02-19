# Contributing

Thanks for helping improve RePath Mobile.

## Scope and architecture
- This repo is a thin Expo mobile client.
- Decision logic and pack generation live primarily in `repath-core`.
- Keep bundled pack/model assets in sync with the upstream release artifacts.

## Setup
```bash
npm install
```

## Common development commands
```bash
npm run start
npm run android
npm run ios
```

## Testing and quality gates
Run these before opening a PR:
```bash
npm run smoke
npm test
npm run review:devsecops
npm run review:pm
```

Test discovery for `npm test`:
- `test/unit/**/*.unit.cjs`
- `test/integration/**/*.integration.cjs`
- `test/acceptance/**/*.acceptance.cjs`

Notes:
- Do not add root-level `test/*.test.cjs`; they are not executed by the current runner.
- Changes to `src/domain/**` should include/update unit tests, plus integration tests when behavior depends on bundled pack/model data.
- For UI-heavy changes, run and attach results from `docs/manual-qa-checklist.md`.

## Pack and model asset updates
- Packs are bundled under `assets/packs/` and should reflect `repath-core` outputs.
- Model artifacts are managed via:
  - `npm run pull:model:release`
  - `npm run pull:model:release:latest`

## Release process
- Keep `release-notes.md` updated for user-visible behavior changes and release artifact/process changes.
- Use the Android release scripts in `package.json` (`release:android*`) and verify artifacts with:
  - `npm run verify:release:android -- --tag vX.Y.Z`

## Role contracts
- Role expectations live in:
  - `docs/agents/README.md`
  - `docs/agents/ux.md`
  - `docs/agents/qa.md`
  - `docs/agents/devsecops.md`
  - `docs/agents/pm.md`

## AI role-contract workflow
Role contracts are AI-oriented reviewer specs. They define:
- the role's mission and scope
- required checks
- expected output format and severity rubric

They are intended for local AI coding/review tools (for example GPT-Codex or Claude Code) so reviews stay consistent across contributors.

Recommended invocation pattern:
1. Pick one role contract (`ux.md`, `qa.md`, `devsecops.md`, or `pm.md`).
2. Ask your AI tool to run only that role against your current changes.
3. Request findings in the contract format and paste the result into your PR's `Agent Reviews` section.
4. Run local gates (`smoke`, `test`, `review:devsecops`, `review:pm`) before opening the PR.

Example prompts for Codex/Claude-style tools:
```text
Use docs/agents/qa.md as the review contract.
Review my current branch changes against that contract only.
Return findings ordered by severity with file references and concrete fixes.
```

```text
Use docs/agents/devsecops.md as the review contract.
Run the relevant local checks and summarize risks, evidence, and remediations.
```

Notes:
- Run one role at a time to avoid mixed recommendations.
- AI role reviews do not replace CI; they prepare cleaner PRs for CI gates.

## Pull requests
- Fill `.github/pull_request_template.md` completely, including `Agent Reviews`.
- Link the relevant issue(s), or explicitly state why no issue is linked.
- Include validation output, or note why a command could not be run.
- Call out user-visible impact and confirm `release-notes.md` changes when applicable.

## CI gate behavior
- `Role Review Gates` runs on pull requests and can be run manually (`workflow_dispatch`).
- `REPATH_AUDIT_FAIL_LEVEL` controls audit failure threshold (`off`, `low`, `moderate`, `high`, `critical`).
- `REPATH_PM_STRICT=true` (repo variable) makes PM contract checks blocking.
