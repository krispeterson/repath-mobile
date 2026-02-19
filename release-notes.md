# RePath Mobile Release Notes

## Version
- `v0.2.0`

## Summary
- Delivers pathway-based recommendations with reuse channels and donation places from bundled packs.
- Improves location fallback and recommendation UX for faster, clearer disposal guidance.
- Adds system-driven dark mode support with semantic theming across core app surfaces.

## User-Facing Additions
- Pathway recommendations now include reusable channels and donation places:
  - Reuse options can include online/community channels (for example: Freecycle, Buy Nothing, Craigslist, eBay, Depop).
  - Donate pathways can include local donation places (for example: Goodwill, Habitat ReStore when present in pack data).
  - Follow-up question prompts (city/ZIP) appear only when needed to resolve channel links.
- ZIP fallback behavior now supports broader coverage:
  - Unknown valid U.S. ZIPs now load a nationwide fallback pack instead of hard-failing.
  - App shows a clear warning when location guidance is less precise.
- Recommendation flow UX improvements:
  - Home content scrolls from search through full recommendations.
  - Search action uses clearer copy (`Get guidance`) and recent-search chips.
  - In-context location controls (`Use current location again`, `Clear location`) are available from Home.
- “More info needed” improvements:
  - top and bottom update actions
  - city suggestions and graceful unknown-city fallback messaging
  - optional ZIP-inferred city fill
- Recommendation cards include prioritization + progressive disclosure:
  - `Best next step`, `High impact`, `Good fallback`, `Last resort`
  - secondary pathways collapse by default with `Show details` / `Hide details`
- Camera scan POC UX adjustments:
  - scan moved to secondary `Try camera scan (Beta)` entry
  - clear limitations copy and supported-example hints
  - first-use confirmation modal and `Use text search instead` fallback
- App now follows system light/dark mode automatically with improved contrast consistency.

## Developer and Integration Additions
- Automated Android release artifact verification:
  - checksum validation
  - embedded JS bundle validation (`assets/index.android.bundle`)
  - metadata/tag/version validation
- Manual GitHub Actions workflow: `Android Release Guardrails`.
- Verification is wired into `npm run release:android*` before publish.
- `scripts/release-android.js` now supports `--artifact auto|apk|aab|all`.
- Release builds enforce signing credentials by default:
  - `REPATH_UPLOAD_STORE_FILE`
  - `REPATH_UPLOAD_STORE_PASSWORD`
  - `REPATH_UPLOAD_KEY_ALIAS`
  - `REPATH_UPLOAD_KEY_PASSWORD`
- Local-only fallback remains available via `--allow-debug-signing`.
- Android versioning is now injected from release tag into Gradle properties:
  - `REPATH_ANDROID_VERSION_NAME`
  - `REPATH_ANDROID_VERSION_CODE`
- Added semantic theme tokens and device-driven theme selection in app UI code.
- Added `test/unit/theme.unit.cjs` and manual QA checklist coverage for light/dark validation.

## Release Artifacts
- Android APK: `app-release-v0.2.0.apk`
- Android APK SHA256: `app-release-v0.2.0.apk.sha256`
- Android AAB: `app-release-v0.2.0.aab`
- Android AAB SHA256: `app-release-v0.2.0.aab.sha256`
- Android output metadata: `output-metadata-release-v0.2.0.json`

## Validation Snapshot
- `npm run smoke` passed.
- `npm test` passed (`206/206`).
- `npm run review:devsecops` passed.
- Release APK contains `assets/index.android.bundle`.
- Manual QA checklist completed, including light/dark mode checks.

## Known Limitations
- iOS release artifact (IPA) is not included in this release.
- Android `v0.2.0` artifacts were built with `--allow-debug-signing` because upload keystore credentials were not configured.
