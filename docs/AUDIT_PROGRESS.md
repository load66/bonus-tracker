# Audit progress

Active agent: ChatGPT Codex | v3.6.0 UI redesign | codex/v3.6.0-mockup-redesign

Public-safe fields only: versions, commit hashes, PR links, sanitized issue titles, test status.

## Handoff

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
