# Manual UI QA Checklist

Use this checklist for UI-heavy changes, especially when behavior spans native permissions, navigation, and scan flows.

## Environment
- Device/simulator:
- OS version:
- App build type:
- Branch/commit:

## Core flow checks
- [ ] Onboarding renders without warnings/errors.
- [ ] App follows device light/dark appearance without low-contrast text or controls.
- [ ] Enter ZIP flow accepts valid ZIP and rejects invalid input.
- [ ] Location permission denied path shows a clear fallback to ZIP entry.
- [ ] Home recommendations load and scroll correctly.

## Recommendation UI checks
- [ ] `Get guidance` triggers updated pathways.
- [ ] Recent search chips appear and are tappable.
- [ ] `More info needed` card allows full input and update actions work.
- [ ] City suggestions appear for known municipalities.

## Scan (Beta) checks
- [ ] `Try camera scan (Beta)` appears as a secondary action.
- [ ] First scan attempt shows the experimental notice modal.
- [ ] `Use text search` dismisses modal and keeps user on Home.
- [ ] `Continue to scan` opens scan view.
- [ ] `Use text search instead` from scan returns to Home.
- [ ] Permission denied/no camera/model not loaded states show clear messages.

## Navigation checks
- [ ] Android hardware back button returns to previous in-app screen.
- [ ] Back from scan returns to Home without app exit.

## Notes
- Record any failures with exact repro steps and screenshot/video references.
- Add unresolved items to PR under `Agent Reviews -> QA`.
