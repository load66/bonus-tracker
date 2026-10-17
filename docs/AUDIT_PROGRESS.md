# Audit progress

Active agent: none

Public-safe fields only: versions, commit hashes, PR links, sanitized issue titles, test status.

## Handoff

- Deployed: frontend v3.4.94 on main (prior verified Pages release)
- In progress: frontend v3.4.95 release candidate on PR #149; code and tests complete
- Next step: merge passing frontend PR #149, then verify exact production Pages assets and authorization

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
- Test status: PASS — PR CI 39050206863 (Finance, bonus, cloud, UI; Chromium, Firefox, WebKit)
- Backend PR: https://github.com/load66/Trading-Journal-AI/pull/220
- Backend deployment: SUCCESS — Railway commit 3f4e0980c3a758cf00340704ffbdbab5d762537c
- Frontend PR: https://github.com/load66/bonus-tracker/pull/149
- Frontend deployment: pending PR merge and GitHub Pages production audit
