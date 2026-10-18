# Verification and releases

BonusTracker uses Playwright **Chromium only** for pull requests, main pushes,
manual runs, nightly checks, and production release verification. Firefox and
WebKit are intentionally not scheduled. This owner-selected policy supersedes
the previous three-browser matrix.

`Verify and Deploy BonusTracker` first checks structural release and cache
integrity (including every JavaScript file), then runs every remaining unit suite
in the three areas: **bonus rules/imports, cloud backup, and UI**.
`tests/ci-units.cjs` inventories all `.test.js` and `.test.py` files; a missing
or duplicated suite fails verification. Each suite has a 60-second deadline.
Finance is retired and never gets a testing or navigation entry.

The single browser job waits for all unit areas to pass. It uses the pinned
`mcr.microsoft.com/playwright:v1.58.2-noble` image and the matching
`@playwright/test@1.58.2` Node API. Browser binaries come from that image;
CI never downloads or installs them. The Node API is separately cached using
its pinned version. The container user's home directory remains writable.

All existing Chromium browser harness assertions remain enabled. The standalone
harness defaults to Chromium, and an unsupported `BT_BROWSER` selection is
rejected. Each Playwright harness has a 180-second timeout and one isolated
retry, with a 165-second child-process deadline. All attempts and failure
artifacts are retained, including screenshots, logs, and Playwright traces.
Retry-only passes remain visible as warnings rather than hidden.
Mobile visual checks cover 320, 375, 390, and 430 pixels, plus desktop.
No assertion may be removed solely to accelerate CI.

The nightly trigger is once daily at 08:23 UTC, with its own concurrency
group. It verifies without republishing. Only superseded pull-request
runs may be canceled; release pushes and scheduled runs cannot cancel one
another.

Deployment waits for the complete unit, Chromium, and release verification
gate and publishes the exact verified source artifact. Synthetic provider
and cloud mocks are used by all browser tests; tests never connect real banks.

Local unit areas: `node tests/ci-units.cjs bonus` (or `cloud`/`ui`).
Browser harness: use the pinned API with
`BT_BROWSER=chromium playwright test --config tests/playwright.config.cjs`,
with `NODE_PATH` pointing to the pinned `@playwright/test` install.
Direct `node tests/browser-e2e.cjs` also selects Chromium alone.

## Bank offer publication

`refresh-bank-feed.yml` collects source RSS articles every six hours (17 minutes after 00:00/06:00/12:00/18:00 UTC), and on its first code release. It commits `data/bank-bonuses.json` to `main` only when changed and dispatches the existing verified deployment workflow, because a GitHub Actions bot's own push does not trigger ordinary push workflows. The collector reads the committed snapshot before applying updates, preserves unexpired offers through source outages, expires offers only by explicit terms, ended announcements or 90 days since the newest post, and retains exact source-specific article links. No page-side alerts, monitoring panels or feed-health UI are introduced.

The release workflow publishes the exact committed snapshot and does not refresh only its temporary checkout. Tests use synthetic RSS and never contact real financial providers.
