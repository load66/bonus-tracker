# Audit progress

Active agent: none

Public-safe fields only: versions, commit hashes, PR links, sanitized issue titles, test status.

## Handoff

- Source: SimpleFIN add-bank frontend v3.4.97 ready for merge, PR #155
- In progress: Finance v3.4.98 retirement/cash product-aware classifier, PR #160 pending release verification
- Next step: verify PR #160 CI/three-browser matrix, merge, confirm GitHub Pages exact assets and production audit; resume deferred releases

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

## Finance v3.4.98 — account product classification

- PR: https://github.com/load66/bonus-tracker/pull/160
- Fix: retirement savings plans no longer enter cash solely because their names contain generic savings terms; investment and brokerage product evidence takes precedence while real deposits remain cash
- Accuracy: existing provider account and history remain unchanged; explicit saved owner classifications and balance exclusions retain priority
- Regression coverage: synthetic SimpleFIN/Plaid investment and cash group totals, exact cents, metadata contradictions, and 320/375/390px browser detail sheets
- Version: 3.4.98, offline cache bt-v3.4.98-retirement1, unified classifier asset cache-busted
- Status: pending exact merge commit and GitHub Pages production audit
- Handoff: Active agent none once the source release candidate is staged; deferred categorization and auto-sync workstreams require a fresh ownership checkpoint
