# Verification and releases

`Verify and Deploy BonusTracker` checks structural release/cache integrity first,
then runs unit suites in four areas: Finance, bonus rules/imports, cloud backup,
and UI. `tests/ci-units.cjs` inventories every `.test.js` and `.test.py` file;
a missing or duplicated assignment fails verification instead of silently dropping tests.
Each suite has a 60-second deadline.

Browser jobs wait for every selected unit area. Each uses
`mcr.microsoft.com/playwright:v1.58.2-noble` and the exact matching
`@playwright/test@1.58.2` API. Browser binaries come from the image; CI never
installs them again. Only the small Node API is cached separately. Container
home-directory ownership is aligned with the actual user for Firefox.

Every original browser harness remains intact. `BT_BROWSER` selects one engine
per job; running a harness directly without it still checks all three.
Each harness is a separate Playwright test with a 180-second timeout and one
retry. A failed harness is retried alone, with its original assertions. JSON
reports retain all attempts; tests passing only on retry produce a warning and
appear in the job summary. Matrix fail-fast is disabled.

Only a PR whose complete file list matches the conservative Finance allowlist
uses Finance units plus WebKit and Chromium. Any other PR, main push, manual
verification, or nightly run executes every unit area and all three engines.
CI files, app.js, missing file-list coverage, and unknown files always request
full verification. WebKit is never omitted.

The nightly trigger is once daily at 08:23 UTC. It has a separate concurrency
group and verifies without republishing. Releases cannot be canceled by another
run; a new revision may cancel only its own superseded PR verification.

Deployment waits for the aggregate verification gate and publishes the verified
artifact. Production auditing starts after successful release verification,
checks exact published asset hashes every 15 seconds for at most ten minutes,
then runs WebKit first. Chromium and Firefox follow in parallel. Production
browser tests retain the original synthetic mocks; they never connect a real bank.

Local unit areas: `node tests/ci-units.cjs finance` (or bonus/cloud/ui).
Browser harnesses: use the pinned API and `playwright test --config tests/playwright.config.cjs`,
with `BT_BROWSER=webkit`, `chromium`, or `firefox`. Node module resolution must
include the directory where the pinned API was installed.
