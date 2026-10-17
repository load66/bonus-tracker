# Audit progress

Active agent: codex — Release 1 mortgage/balance accuracy — branch codex/finance-balances

Public-safe fields only: versions, commit hashes, PR links, sanitized issue titles, test status.

## Handoff

- Deployed: frontend v3.4.94 merged to main at 6da0fedd8be3555d846d9649c42aa2ff0370f6a0 (GitHub Pages status: to be verified)
- In progress: Finance v3.4.95 mortgage/loan and Plaid balance accuracy
- Next step: full unit/browser PR CI; verify backend Railway v3.4.95 before frontend merge/deploy

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
- Test status: Synthetic exact-cent unit cases and connected-SimpleFIN browser checks added; PR CI pending
- Backend PR: https://github.com/load66/Trading-Journal-AI/pull/220
- Frontend deployment: pending backend Railway verification and three-browser CI
