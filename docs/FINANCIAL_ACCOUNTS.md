# Financial accounts — source of truth and release contract

## Purpose

BonusTracker's **Financial accounts** integration is a read-only view of accounts
the user has connected through SimpleFIN Bridge (primary) or Plaid Trial (fallback). It can show account
balances and observed posted transactions **independently** of a bank-bonus
campaign. Bank-bonus eligibility, deadlines and milestone status remain owned
by the canonical tracker lifecycle engines.

The app does not initiate payments, transfers, securities trades or bank
applications, and it never interprets a bank transaction as definitive
qualifying direct-deposit or bonus-payout evidence without review.

## Architecture

- Frontend: `bank-sync.js`, `bank-sync.css` and
  `finance-overview-core.js`. No provider access secret is persisted in
  browser storage or passed to a public analytics service.
- Backend: `load66/Trading-Journal-AI/backend/bonus_simplefin.py`,
  `backend/bonus_plaid_accounts.py`, and `backend/bonus_plaid_trial.py`.
  Bearer-token ownership checks and encrypted owner-scoped financial activity
  are enforced on private routes. Plaid Trial capacity is global and irreversible.
- The backend uses R2 conditional writes, verifies saved state by readback,
  and coordinates competing operations with leases. A disconnect stores a
  tombstone to prevent a stale operation from recreating access.
- `GET /api/bonus-tracker/simplefin`: connection status, sanitized account
  aliases, balances, hashes and available posted activity. Returns no raw
  provider account IDs, connection IDs or provider access token.
- `POST /connect`: one-time SimpleFIN setup token, securely exchanged and
  encrypted server-side.
- `POST /discover`: bounded account discovery, provider refresh rate limited.
- Read-only transaction monitoring starts automatically for every discovered account.
  The existing `PUT /monitoring` compatibility route remains available internally,
  but the Finances UI does not require an additional opt-in toggle.
- `PUT /selection`: optional account-to-open-bonus linkage.
- `POST /sync`: bounded read-only provider transaction retrieval, with a
  24-hour owner/provider budget and background checks for already-connected
  owners. A new bank may be discovered during a cooldown but its transactions
  can remain pending until the next eligible provider window. No app action
  initiates payments or transfers.
- `DELETE /` (SimpleFIN): disconnect all SimpleFIN institutions and remove
  locally held SimpleFIN credentials and saved evidence. Revoke the Bridge token
  and handle subscription billing separately in SimpleFIN.
- `DELETE /api/bonus-tracker/plaid/accounts/items/{handle}` (Plaid): revoke one
  Plaid Item through `/item/remove` and purge its saved financial activity.
  Removing it **never** recycles an already-used lifetime Trial slot.

## Definitions and accuracy rules

- **Balance**: provider-supplied figure for an individual account, displayed
  as unavailable if the number is missing. Never infer that missing means $0.
- **Last synced**: last successful transaction retrieval for the connection,
  not necessarily the latest individual account balance or transaction.
- **Financial overview**: past 30 days of available, posted **USD** observations
  for discovered accounts with available, posted provider evidence only. Credits,
  debits and net observed activity use exact-cent arithmetic, without
  combining all account balances.
- **Observed money in/out** is **not** verified income, expenses, cash flow or
  spending. Inter-account transfers can appear on both sides and investment
  events can inflate totals; keep user-facing caveats.
- **Net worth** must not be shown without account product types, liability
  treatment, and reliable deduplication/reconciliation. Brokerage balances
  must not automatically be classified as cash.
- **Other currencies** are excluded from USD aggregates. Do not silently
  convert or combine them.
- Plaid Trial permits up to ten *lifetime* Items for the entire deployment;
  an unsuccessful or uncertain link can require operator reconciliation.
  Automatic syncing cannot guarantee that all transactions are immediately
  available, and does not override provider access scopes.
- The provider may return delayed, incomplete or corrected transactions.
  Absence of transactions does not prove that a bonus was unpaid, a fee was
  waived, or a recurring requirement was met.
- Pending transactions are excluded from observed posted activity. The backend
  retains 90 days of previous posted observations and tracks corrections.
- **Hide balances** also masks observation summary amounts and individual
  transaction amounts in the current panel, without modifying persisted data.
- **No data / unknown / stale** are distinct states. Do not show false totals
  or an open-now connection inference when the provider is unavailable.

## Security and regression gates

Before release, execute both repository suites:

1. Backend: `pytest backend/tests/test_bonus_simplefin.py` plus full backend
   CI, validating auth, encryption, ownership, provider URL allowlisting,
   transaction scope, automatic enrollment, throttling, missing-account handling and
   disconnect tombstones.
2. Frontend: `node tests/finance-overview.test.js` and the full
   `Verify and Deploy BonusTracker` workflow. Its Chromium, Firefox and
   WebKit checks must protect mobile viewport sizing, escaped descriptions,
   local token isolation, the exact unchanged tracker record and cloud
   recovery.

Deployment order: backend first, then frontend after both suites pass.
Backend or frontend changes must not introduce automatic lifecycle writes.
Production release status must be confirmed from the relevant GitHub Pages
and Railway deployments rather than inferred from a successful merge alone.

## Roadmap, not currently supported

A full personal-finance dashboard needs bank-specific account type and
available-balance mapping, internal-transfer reconciliation, an auditable
category engine with user corrections, historical completeness markers, and
separate asset/liability semantics before showing reliable **income,
expenses, cash flow, net worth or investment performance**.
