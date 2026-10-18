# Audit progress

Active agent: none

Public-safe fields only: versions, commit hashes, PR links, sanitized issue titles, test status.

## Handoff

- v3.6.8: safe Railway usage field messages, forced refresh, and regression tests on `codex/v3.6.8-usage-diagnostics-ui`. Backend `c86b658` is live; UI CI and release remain pending. Next: PR checks, merge, verify GitHub Pages. No stored financial data changed.

- v3.6.7 monthly hero chart PR #177 (`codex/v3.6.7-tappable-hero-months`): tappable and keyboard-accessible month buttons, 44×44px minimum swipeable targets, selected receipt panel with bank/product, received date, amount, account-detail navigation and explicit empty month, single Tax-backed monthly source, filtered by year and Personal/Business. Tests: https://github.com/load66/bonus-tracker/actions/runs/39114463767 PASS (bonus/cloud/UI, Chromium, WebKit, release); selected-month 390px screenshots retained in browser CI artifacts. No backend or financial storage changes. Next: merge PR #177, verify exact main CI and Pages publish commit.

- v3.6.6 frontend PR #176: single detail header and 5-step progress strip, stage-correct fixed Ask AI + action footer with Manage under •••, unified legacy churn date, compact Tracker rows, refined Requirements/Timers, ready-to-close phone editor, individual Data rows, safe verified/partial Railway usage display, bonus-feed reward parsing/dedup/baseline, and parallel Chromium/WebKit browser gate. PR CI https://github.com/load66/bonus-tracker/actions/runs/39113301874 PASS: bonus/cloud/UI, Chromium, WebKit, release validation. Mobile 390px screenshot artifacts available in CI. No real financial records or Railway credentials changed. Backend PR #234 deployed at `99e1a1d39dab51b9d6c7169f6a319a6a53bb9585`. Next: merge PR #176, verify exact main CI and GitHub Pages; next separate requested chart release adds tappable hero months without altering verified v3.6.6 history or calculations.

- BonusTracker v3.6.5 concern release on `codex/v3.6.5-concern-fixes`, rebased onto the v3.6.4 Chromium focus hotfix and current retained bank-offer feed. Quick Add and Review promo terms reveal, scroll to, and focus their real panels; cloud protection is a compact outlined status instead of an oversized green pill. App/cache metadata is v3.6.5. Bonus, cloud, UI, syntax, and release verification pass locally; Chromium CI remains the release gate. No stored financial records changed.

- v3.6.4 feed-browser release follow-up: PR pending from `codex/v3.6.4-feed-browser-hotfix`. Maintains exactly the 3.6.3 canonical offer/six-hour publisher data model (PR #171 merged as `8f1686d3df5d85797f6b9bc505a463176a27bd9d`); repairs intermittent Chromium search-focus loss by keeping the original active input node attached during synchronous list rerenders rather than replacing its DOM node inside its own input event. App 3.6.4, SW `bt-v3.6.4-feed2`; no financial data changes. v3.6.3 PR CI passed 290 Chromium checks; main-source GitHub Pages deployed but main browser check exposed focus flake. Next: all CI, squash merge, exact main-branch CI and Pages pass, confirm first six-hour/after-release publisher delivery.

- v3.6.3 canonical bank-offer feed, branch `codex/v3.6.3-bank-feed-lifecycle`: six-hour scheduled refresh writes retained JSON to main and publishes GitHub Pages in that same workflow, replacing discarded release-job-only metadata. Canonical bank alias/product/reward/region keys, source-provenance links, explicit expiry/ended tombstones and 90-day no-post retention; latest original headline, New/Increased/Decreased/Updated/Ending soon badges. No feed monitoring, alerts, health checks or new feed-status UI; no financial records touched. Last-good 2026-10-14 snapshot migrated from 24 source rows to 21 canonical rows (3 duplicates merged), historical checkedAt retained. App 3.6.3, SW `bt-v3.6.3-feed1`. Next: full bonus/cloud/UI + Chromium tests, merge on green, verify Pages and scheduled publication, report any owner-limited connectivity or branch permission gaps.

- BonusTracker v3.6.2 remaining mockup release: PR pending on `codex/v3.6.2-remaining-mockup`, built on verified v3.6.1; no rework of `panel()` fix. Personal/Business Tracker stage chips hide zero-count states, Needs you task count pluralized, single year selector replaces three buttons, FAB menu exposes Quick Add, promo-term analyzer, and manual entry; data is untouched. Bonuses grouped by supported tracker date and uncertainty (not personal eligibility claims), compact offer rows, About sources disclosure, one amber stale alert; existing official evidence and geography checks retained. Data opens search-first with compact outcome pills, filters and education collapsed below reports. Settings header ellipsis and owner-authenticated hosting endpoint unchanged; live costs display only from valid backend response. Mobile 390px screenshot assertions for Tracker, Bonuses, Data and Settings, synthetic hosting amounts only in tests. Core rules, cloud backups, Finance retirement untouched. Next step: complete bonus/cloud/UI unit suites, Chromium Playwright, deploy verified Pages; report exact commit and screenshot artifacts.

- v3.6.1 panel title rendering patch: `codex/v3.6.1-panel-title-release` based on post-PR166 main. Correct three literal-tag header displays (Needs you count, Eligible soon subtitle and Archive cooling subtitle) without disabling escaped heading titles. App/mobile `3.6.1`, service-worker cache `bt-v3.6.1-panel1`, all affected asset cache tags updated. Added smoke test and Chromium Playwright regression assertion; preserved storage, Finance retirement, rules and backups. Next step: PR CI, merge, verify exact production Pages commit; never claim live user backups were tested.

- Chromium-only Playwright CI update: `codex/chromium-only-playwright-ci` (PR pending creation), no app code or saved account data changed. One Chromium job follows bonus/cloud/UI units on PR, main and nightly. Pinned Playwright image/API cache; preserved 284 browser assertions, mobile layouts, retries, trace/artifact collection, and zero-console-error requirement. `AGENTS.md`, `docs/CI.md`, and `tests/ci-workflow.test.js` updated to prohibit Firefox and WebKit. Next step: PR verification, merge, exact main-run/Pages checks.

- BonusTracker v3.6.0 mockup UI (Finance remains removed): frontend PR https://github.com/load66/bonus-tracker/pull/165. Tracker, focused detail, Bonuses, Tax, Data, combined Archive and Settings; Personal/Business scopes; owner hosting usage card and read-only notification center. App and service-worker cache `bt-v3.6.0-ui1`.
- Full PR release CI https://github.com/load66/bonus-tracker/actions/runs/39086571663 PASS, including bonus/cloud/UI unit groups, release verification, and Playwright Chromium, Firefox and WebKit (284 browser checks on each engine). Synthetic provider/backup/usage test fixtures only, no live financial reset/restore.
- Backend usage endpoint and GraphQL correction: https://github.com/load66/Trading-Journal-AI/pull/231 and https://github.com/load66/Trading-Journal-AI/pull/232; Railway production SUCCESS at `d83172974cc46de6bd4ccff7dd99b80b8332d85b`; backend CI 385 passed. Railway API token not created or modified; owner must configure `RAILWAY_API_TOKEN` for real estimates.
- v3.6.0 PR #165 merged as `9507cbf41278716c49c7880baf981431540c469f`; main-branch CI and GitHub Pages deployment PASS. Chromium-only policy supersedes the previously used three-engine matrix.

- BonusTracker v3.5.2 release audit: PR https://github.com/load66/bonus-tracker/pull/164. Downloaded-file restore now stops when its cloud safety backup or file export fails; device reset clears its local cloud-protection setting, not server backups or login.
- Failing-before synthetic regression: https://github.com/load66/bonus-tracker/actions/runs/39080914103 (downloaded restore continued after failed safety backup). Passing PR full CI: https://github.com/load66/bonus-tracker/actions/runs/39081160600 (bonus/cloud/UI and Chromium, Firefox, WebKit).
- Independent local baseline check: exact v3.5.1 Pages deployment artifact, Node bonus/cloud/UI suites and release verification PASS after restoring the workflow files excluded from the published package. PR candidate verification executed in isolated GitHub Actions workers, not against production user data.
- Verification limits: real cloud-account backup/restore and destructive device reset were NOT attempted. Browser cloud requests and provider responses are synthetic; live Pages JavaScript response could not be independently fetched. Owner-only Finance R2 retirement is a separate, unexecuted procedure.
- Next step: merge green frontend PR #164, verify Pages deploy on the merged commit and rerun local suites against the exact published v3.5.2 artifact. No backend change required.

- Release checkpoint (2026-10-17): Finance frontend removed via PR #162, merge `28d110b3330da4d0d3e6a8b00c3984ba0f248e6e`; v3.5.1 and service-worker cache `bt-v3.5.1-retire1`.
- Main-branch Verify and Deploy https://github.com/load66/bonus-tracker/actions/runs/39079048818 PASS: bonus/cloud/UI suites and Playwright Chromium, Firefox and WebKit. Main-branch Pages build/deploy https://github.com/load66/bonus-tracker/actions/runs/39079048358 PASS on the same merge commit.
- Backend PR https://github.com/load66/Trading-Journal-AI/pull/229 merged, and Railway production SUCCESS on exact backend merge commit. Backend full pytest 377 passed, journal frontend build/tests PASS.
- Owner separately authorized retirement of the optional provider-backed Tracker bank-activity review; manual bank-bonus workflows, rules, cloud backups, and journal remain supported.
- Frontend Finance-only browser preferences are removed by migration; no bank or journal data purged by the agent. The permanent Plaid slot ledger is preserved.
- Owner-only action remains: review dry-run and, if desired, execute guarded Finance R2 cleanup using backend `docs/FINANCE_RETIREMENT_RUNBOOK.md`. Agent MUST NOT invoke the destructive route.
- Verification gap: live Pages `sw.js` content was not fetchable from this runtime; GitHub source and Pages deployment CI confirm the new asset version.
- Status: implementation/release complete; historical queued Finance work below is superseded.


- Owner decision (2026-10-17): supersede Finance/Plaid enhancement queue with full Finance retirement, subject to manual revocation and a protected Tracker-evidence decision.
- Source of truth for read-only inventory and owner checklist: backend draft PR https://github.com/load66/Trading-Journal-AI/pull/229.
- Phase: owner confirmed manual provider disconnections and authorized retirement of Tracker bank-activity review. Finance frontend modules, navigation, provider UI, evidence panel, obsolete suites/workflow removed on branch; no production deployment or R2 purge yet.
- Unmerged Finance PRs abandoned without merge: #157, #123, #113, #109, #108, #106, #105, #99, #98, #97.
- Next step: backend full CI, merge and Railway SUCCESS; then remaining frontend units and three-browser checks, merge, Pages and live service-worker audit. Owner alone runs guarded R2 purge.


- Backend production: v3.4.98 SimpleFIN automatic linked-bank ingestion, PR https://github.com/load66/Trading-Journal-AI/pull/226
- Railway SUCCESS: merge commit 26dc4b2076f89157d6fe8356a90eaa244ac59cc3
- Frontend release candidate: v3.4.98 automatic account discovery and Finance snapshot polling, PR https://github.com/load66/bonus-tracker/pull/159
- Frontend tests: finance, cloud, bonus, UI unit suites PASS; three-browser matrix pending final commit
- Next step: verify v3.4.99 full tests + browser, merge clean main release, verify Pages and resume queued categorization work
- Paused separate branch: Finance Categories v2; do not combine release branches

## Release 1 (v3.4.94)

- Issue: P1 — Manual category precedence across Finance reports
- Issue: P1 — Prevent false-positive transfer matching
- Test status: pending verification

## Finance v3.4.95 mortgage and loan accuracy

- Issue: P1 — Monthly-updated loan balances omitted after seven days
- Issue: P1 — Plaid checking and mortgage balances without a bank-dated timestamp
- Issue: P1 — Housing payment memos misclassified as transfers
- Issue: P2 — Mortgage servicer accounts with missing product subtype
- Issue: P0 — Prevent outstanding mortgage debt from becoming an asset due to provider balance sign
- Test status: PASS — source PR CI runs 39050206863 and 39050497589 (Finance, bonus, cloud, UI; Chromium, Firefox, WebKit)
- Backend PR: https://github.com/load66/Trading-Journal-AI/pull/220
- Backend deployment: SUCCESS — Railway commit 3f4e0980c3a758cf00340704ffbdbab5d762537c
- Frontend PR: https://github.com/load66/bonus-tracker/pull/149
- Frontend release: source merged, main-branch verified deployment and production audit pending

## Release 2 — v3.4.96 Finance accuracy

- Backend PR: https://github.com/load66/Trading-Journal-AI/pull/222
- Frontend PR: https://github.com/load66/bonus-tracker/pull/154
- Issue: https://github.com/load66/bonus-tracker/issues/151
- Issue: P1 — Plaid balances missing persisted observation history
- Issue: P0 — Unverified totals lack runtime invariant checks
- Issue: P1 — Sync errors can conceal missing accounts or reviews
- Issue: P1 — Cross-provider ledger lacks pinned cents baseline
- Test status: Backend 631 tests and build PASS (CI 39053785663); frontend four unit areas and Chromium/Firefox/WebKit PASS (CI 39053638068); final doc-only CI pending
- Deployment: pending complete CI, merge, Railway and GitHub Pages verification

## SimpleFIN v3.4.97 Add Bank release

- Issue: https://github.com/load66/bonus-tracker/issues/153
- Backend PR: https://github.com/load66/Trading-Journal-AI/pull/223
- Backend Railway: SUCCESS exact merge commit 827cc014330e0fa612256855a8f0c8d5fc83df85
- Frontend PR: https://github.com/load66/bonus-tracker/pull/155
- Test status: Backend CI 39056471927 PASS; frontend four unit areas and Chromium/Firefox/WebKit PASS on 39057944836
- Deployment status: Frontend pending main-branch Pages release and production asset/browser audit
- Handoff: Active agent none after verified branch tests; queued next release is Finance Categories v2 issue #156

## Finance v3.4.99 — Cash versus Investments product inference

- Scope: pure frontend classification of automatic account types from provider metadata and product descriptions
- Classification: retirement plans outrank generic savings, brokerage portfolios and investment securities enter Investments, genuine deposit checking/savings stay Cash
- Protections: manually saved product types override inference; source balances, reviews, connections and transaction history are immutable
- Regression: synthetic SimpleFIN and Plaid accounts, exact-cent Cash, Investments, Retirement and Net Worth totals; three mobile widths and browser engines
- Release: v3.4.99, service worker bt-v3.4.99-classify1, unified classifier asset cache-busted
- Merge: pending PR, CI and GitHub Pages production audit; preserves merged v3.4.98 zero-click SimpleFIN/Plaid integration
- Handoff: Active agent none after finished code changes, with final verification still required
