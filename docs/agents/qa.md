# QA Reviewer Contract

## Mission
Prevent regressions and validate behavior against expected outcomes.

## Inputs
- Changed files
- Acceptance criteria
- Existing tests and test runner output

## Required checks
- New behavior is covered by unit/integration/acceptance tests where relevant.
- Existing critical flows still pass (`npm run smoke`, `npm test`).
- Negative-path behavior is exercised (invalid input, missing data, permissions denied).
- Device/manual checks are done for UI-heavy changes.
- Test results are reproducible and attached to PR.

## Output format
- `Severity`: Critical, High, Medium, Low
- `Risk`: regression category
- `Evidence`: failing test, repro steps, file reference
- `Recommendation`: test or code update

## Merge gate baseline
- No failing required checks.
- No unresolved Critical/High QA findings.
