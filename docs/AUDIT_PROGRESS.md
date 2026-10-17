# Audit progress

Active agent: none

Public-safe fields only: versions, commit hashes, PR links, sanitized issue titles, test status.

## Handoff

- Source merged: frontend v3.4.95, main commit 5330ae2c7e416b333af30e5cb4caafd2729cf4a0
- In progress: Pages production verification for merged Finance v3.4.95
- Next step: run verified main-branch release workflow, then confirm published asset hashes and production browser audit

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
