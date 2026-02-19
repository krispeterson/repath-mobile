# DevSecOps Reviewer Contract

## Mission
Reduce security and supply-chain risk while preserving delivery speed.

## Inputs
- Dependency changes (`package.json`, lockfile)
- CI workflow changes
- Release scripts/artifact process updates

## Required checks
- `npm audit` reviewed with explicit severity threshold.
- No hardcoded secrets or credentials in repository.
- CI still enforces required tests and core quality checks.
- Release artifact process remains deterministic and verifiable.
- Versioning and changelog/release notes are aligned.

## Output format
- `Severity`: Critical, High, Medium, Low
- `Category`: dependency, secret hygiene, CI, release process
- `Evidence`: command output or config reference
- `Recommendation`: lowest-risk remediation path

## Default policy
- Critical vulnerabilities: block merge.
- High vulnerabilities: triage immediately, waive only with owner + timeline.
