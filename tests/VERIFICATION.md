# v3.6.37 safe lifecycle Undo

Synthetic failing-before regression demonstrates that a closure Undo discarded a later-created account and reverted another account's newer notes. Coverage retains later accounts and supporting reports, blocks target/supporting conflicts and newer other-tab account writes, verifies exact storage after injected failure and retry, preserves closure revisions in Archive, and covers Undo plus failed saves for open-account corrections. Browser coverage adds a different account after closure and verifies it survives the actual Undo button. Existing release checks remain required on Chromium and WebKit.

# v3.6.36 cycle preservation

Synthetic regression reproduces missing closure dates in dedicated Archive snapshots before the fix. Coverage includes full lifecycle/source/notes retention, unknown opening dates, atomic account/Archive storage failure and exact rollback, closure retry and undo revisions, explicit enrollment-at-opening without overwriting confirmed dates, corrupt-history preservation, exact backup/restore, rollover retention and analyzer-summary provenance. Cloud tests verify live Archive status, in-flight terms edits and retry after upload failure. Chromium/WebKit check the actual closure review at 320/390/430px, saved cycle equality and separate cloud status; full existing assertions remain enabled. No real provider or owner financial-record mutations.

# BonusTracker v3.4.34 verification

Verified on October 11, 2026 with synthetic data. Browser results are recorded in the GitHub Actions `browser-verification` artifact. The test server uses the exact checked-out release; each browser starts with a fresh, isolated storage context.

## Defects found and corrected

| Defect | Correction | Regression coverage |
| --- | --- | --- |
| Add/Edit hid bank name, account type, and bonus amount | Restrict the churn-control replacement to a single label/select | Fully installed runtime and real Quick Add/Edit screens |
| Saved requirement text appeared blank in a number input | Keep the requirement window as exact text, including units | Runtime renderer and actual browser input value |
| Restore confirmation downloaded another backup instead of restoring | Match only the exact toolbar Backup/Restore controls | Delegated-click regression and downloaded-file restore |
| Firefox redraw discarded a typed milestone date | Update unsaved milestone, closure, and timer drafts on input | Draft/redraw regression and cross-browser lifecycle saves |
| Closure prompts claimed every eligibility clock started at closure | Describe closure separately from the source eligibility clock | Source-based date tests and closure review |

## Coverage

| Area | Verification |
| --- | --- |
| Startup and assets | 34 runtime scripts; release references, cache assets, MIME handling, syntax |
| Creation and import | Quick Add; JSON v1/v2; embedded HTML/link parsing; provenance and evidence rejection; review before save; duplicate/replacement routing |
| Editing | Bank/account/bonus fields; notes; exact requirement wording; identity preservation; escaped output |
| Lifecycle | Requirements, bonus received, close review, actual closure, Undo, one-time archive, and repeatable cooldown |
| Dates | Calendar days, DST, leap dates, month-end clamping, days/months/years, correct anchors, multiple restrictions, conditional rules, separate two-day safety buffer |
| Action Center | Canonical status; direct confirmations; recurring requirements sent to review; stale close-action protection; missing/unsupported dates remain unconfirmed |
| Tasks and timers | Add/edit/toggle; history; start-plus-days and due-date modes; invalid input; subsection state preservation |
| Tax | Received bonuses on open accounts; year filtering; totals; actual CSV download; quoting and formula-injection guard |
| Data preservation | Notes, IDs, history, timers, existing rows, import staging, reload, update, backup and restore |
| Restore failures | Injected storage write failures, rollback, verified multi-key commit, and commit before live-state replacement |
| Datapoints and terms | Successful method persistence; structured datapoints; saved T&C archives; original-cycle source preservation |
| Offline and mobile | Service-worker atomic install, typed fallback, actual offline reload, 390-pixel viewport, no horizontal overflow |
| Analyzer | Ten built-in bank fixtures plus Wells consumer and FourLeaf accuracy, profile isolation, and evidence/fee-source validation |

## Reproduction

Run from the repository root:

```sh
python3 tests/verify-latest.py
for f in tests/*.test.js; do TZ=America/Chicago node "$f" || exit; done
```

The deployment workflow additionally installs pinned Playwright 1.58.2 into the runner temporary directory and runs `node tests/browser-e2e.cjs` against Chromium, Firefox, and WebKit. Dependencies, synthetic backups, reports, screenshots, and traces stay outside the deployed site. A failing check prevents the verified Pages deployment.

## Calculation example

Synthetic account opened January 31, 2026. A 90-calendar-day requirement deadline is May 1, 2026. Requirements met April 1 give a 30-calendar-day payout deadline of May 1. A bonus received April 15 with a 12-month bonus-receipt lookback clears April 15, 2027; the two-day safety buffer makes April 17 the suggested reapply date. Recording closure May 1 does not move that bonus-based clock.

WebKit network-loss testing disconnects the local test server; Chromium and Firefox use browser offline mode. This avoids the observed WebKit offline-emulation navigation error, which matches the [reported Playwright issue](https://github.com/microsoft/playwright/issues/42775), while still requiring the app to reload from its service-worker cache with failed network requests.

## Limits

This is workflow and scenario coverage, not exhaustive coverage of every function or branch. WebKit on Linux is not a physical iPhone/Safari test. Native mobile share sheets, browser storage eviction/quota behavior on real devices, and every possible future bank disclosure are not fully covered. The tracker cannot verify actual bank deposits or payouts automatically; the tests verify behavior after user confirmation. No existing user account data was used or modified. No storage keys or data schemas were changed by these fixes.

As of v3.4.68, repeat-eligibility suggestions add two calendar days to the latest supported bank restriction. Requirement and payout deadlines are not extended. Existing explicit close buffers remain as saved; the legacy Lafayette six-calendar-month fee calculation uses a two-day cushion.
