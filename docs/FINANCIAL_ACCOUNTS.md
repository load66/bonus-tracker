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
- Pending transactions are **visible** as pending in Plaid account history but
  excluded from posted spending, income, balances, and all bonus candidate
  qualification. Plaid-linked posted replacements supersede pending IDs.
  The backend retains 90 days of observed activity and tracks corrections.
- Every newly linked Plaid bank receives a separately budgeted initial
  `/transactions/sync` request, even while another Plaid bank is in the
  owner's daily refresh window. An empty first response means **awaiting
  provider history**, not zero transactions.
- Per-account transaction history status, first-sync date and next eligible
  date are returned without exposing Plaid IDs or credentials.
- The background worker picks up newly linked and discovered Items without
  needing the user to navigate to Finances. A failed Item does not discard
  a different bank's successful sync. Existing Items remain on the daily
  provider budget; no paid refresh or extra Trial Item is used.
- **Hide amounts** masks balance, summary, spending-chart and transaction amounts
  throughout Finances only until the user shows them or reloads the app.
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


## Finance v3.4.75 — incremental safeguards

These enhancements are Finance-only and remain independent of the Tracker lifecycle:

- Financial amounts default to **visible** on the Finance screen. "Hide amounts"
  temporarily masks money throughout Finances for screenshots. Reloading the PWA
  restores visible amounts; the legacy `bt_finance_hide_amounts` preference is
  ignored. Neither the mask nor financial records are persisted by this toggle.
- One Cash figure uses fresh, classified checking/savings balances. A missing,
  stale, or inconsistent balance remains unknown; it is never interpreted as zero.
- Net-worth calculations omit accounts explicitly marked `exclude`. A credit
  balance on a liability product increases assets instead of becoming a debt.
  This remains a partial snapshot, not proof of full personal net worth.
- Finance account settings have an additive, reversible `hidden` attribute.
  Hiding an account or institution excludes it from Finance lists and totals
  while retaining encrypted provider activity, credentials, reviews, and all
  tracker records. An older client omitting `hidden` does not undo a prior hide.
  Hiding is NOT disconnecting a bank or removing a Plaid lifetime Item.
- Plaid transaction status differentiates historical loading from readiness.
  An initial update is not proof of complete history, and an empty history
  is never declared complete. Newly awaiting Items use independent bounded
  follow-up checks; no new Item or paid request is needed.
- SimpleFIN malformed transaction rows are skipped with a warning instead of
  invalidating all accounts. A disappeared pending row can be marked cleared
  without deleting its encrypted original. Provider omissions of posted rows
  remain inconclusive.
- Account-verification transactions (including zero-value prenotes and
  low-value matching test deposits) use a separate `verification` category
  excluded from income, expense, and cash-flow aggregates.
- Charts and month summaries use the device's local calendar; the underlying
  immutable transaction timestamps remain unchanged.

The Finance UI can label *categorized* observations as Income, Expenses and
Net flow, but estimates remain partial whenever bank history, classification
or provider coverage is uncertain. Neither this release nor earlier versions
certifies complete reconciled cash flow, all assets/liabilities, or bonus
qualification. Safe reconciliation requires explicit verified account
identities and user confirmation, not name-based automatic deduplication.

## Finance v3.4.78 — account and connection management

This section supersedes conflicting privacy/retention wording above. Financial amounts
start **visible** as explicitly requested. The eye toggle persists only a boolean privacy
preference (`bt_finance_hide_v2`); all financial records remain server-side. Hiding masks
values, comparisons and chart geometry. Both device color preferences use the scoped
Finance palette; other app tabs and the bonus engine remain unchanged.

Account profiles are additive patches. Display names, type, inclusion in spending and
net worth, sync choice and visibility are independent. Missing legacy fields preserve
existing values. Hiding removes balances and activity from Finance views and summaries;
removal stops that account's future imports but keeps earlier transactions in reports.
Persistent owner-scoped exclusions survive discovery. Removed/hidden accounts can be
restored without creating a bank connection. Unknown balances remain unknown; available
net worth is explicitly partial if included balances are missing or stale.

`POST /simplefin/account-action` and `POST /plaid/accounts/account-action` accept remove,
restore and explicitly confirmed delete-history actions. A unique removal receipt and
10-second Undo window protect account-history deletion. Choosing keep-history never
purges saved data. Explicit delete-history removes only that account's hot and encrypted
monthly transaction/balance history; a cutoff prevents restored accounts from importing
the deleted interval again. Tracker entries and canonical bonus mappings never change.
SimpleFIN `/institution-action` excludes only the chosen institution. Upstream sharing
and subscription controls remain in SimpleFIN Bridge.

Plaid reconnect/account selection uses `/plaid/items/{handle}/link-token` in update mode
with the EXISTING Item; no new reservation, public-token exchange or Trial increment is
performed. The completion route refreshes shared accounts. Disconnect persists a
`disconnectingAt` state BEFORE revocation, excludes it from all sync loops, replaces
credentials with a tombstone, then performs idempotent local cleanup. History stays by
default; deleting it requires a separate explicit user choice. Lifetime counts never fall.

Confirmed cross-bank duplicates choose one primary balance and deduplicate matched
transaction multiplicities; unique secondary rows retain their original editing route.
Unconfirmed matches remain outside trusted totals. Similar institution names plus mask
and type produce review candidates, never automatic identity declarations.

Existing spending, recurring estimates, category corrections, merchant learning,
24-month encrypted monthly history, revision-safe Finance preferences, Trial guards,
cloud recovery, and bonus engines are preserved. Tests are entirely synthetic and do
not verify actual bank connectivity or production categorization accuracy.

## Finance v3.4.90 — descriptive transaction and recurring presentation

- Source-reported balances and transaction evidence remain immutable. Finance identifies
  unique reciprocal transfer pairs across distinct linked accounts, shows one neutral
  transaction row with two masked account names and an unsigned amount, and preserves
  both underlying provider legs for account history/editing.
- Bank-to-bank transfers (including From/To financial institution descriptors), personal
  savings/checking moves, contributions and card payments are excluded from spending
  and paycheck income. An unmatched generic financial payment is suggested for
  manual transfer review, not presumed employer income.
- Recurring candidates require three consistent occurrences, or two plus a saved user
  confirmation. Accounts transfers and card payments have their own sections.
  Overdue streams appear as "Possibly ended" without a past Next date.
- Promotional credits are identified as Bonus / possible payout evidence for the
  user's review; Finance never marks a Tracker payout as received.
- Transaction history notices disclose the exact Plaid banks, last historical check
  and next eligible check where provided, independently of actionable connection errors.
- All release regression data is synthetic. Exact live income deltas require a
  separate authorized same-scope before/after snapshot and cannot be inferred from
  fixtures or provider connection freshness alone.


## Finance v3.4.93 — cross-provider, no-double-count transfer contract

- Finance's unified read-only adapter recomputes unique reciprocal movements across
  SimpleFIN and Plaid every time either private provider snapshot changes. It requires
  opposite signs, exact-cent absolute amounts, different account keys, timestamps
  no more than three days apart and exactly one candidate in **each** direction.
  A second equal-amount candidate prevents automatic pairing.
- Provider evidence and manually reviewed categories (including learned user rules)
  are immutable. Payroll, bonuses, refunds, account-verification and pending rows
  are excluded from automatic self-transfer matching.
- A generic positive `Payment` received at a linked bank is provisional
  `possible_transfer` rather than confirmed income. The UI displays a gray,
  unsigned amount and `Waiting for the other side`, with confirmation offered
  even after five days. No spending/income/recurring total counts such rows.
- Verified reciprocal pairs receive `matched_internal_transfer` in the temporary
  unified projection, retain both original provider transactions for audit, and
  display as a single neutral source-to-destination row. Confirmation optionally
  writes an `applySimilar` merchant rule through the existing authenticated
  provider transaction-review endpoint; no browser persistence or bonus changes.
- Frontend and backend release versions are 3.4.93; backend CI, Railway production,
  frontend CI and Pages deployment must be verified independently in that order.

## Finance v3.4.95 — mortgage, loan and balance accuracy

- Balances use their product's reporting cadence: checking, savings, credit cards and
  brokerage accounts are current for seven days; mortgages, installment loans,
  other liabilities and retirement accounts are current for 35 days. Older
  balances are shown as needing an update rather than represented as zero.
  A balance 8–35 days old in a long-window category is labeled "Balance as of"
  with the date, rather than as a just-updated balance.
- Plaid accounts can supply an observed balance without a provider-certified
  balance date. Recent observations in any classified account type can contribute
  provisionally to cash, assets, liabilities and net worth, but remain flagged
  "Refresh suggested", and the resulting totals are marked partial. No bank date
  is invented and original provider rows remain unchanged.
- A recognized mortgage or installment loan represents an outstanding debt, not
  a credit/asset merely because a provider uses a negative balance sign. Such
  debts enter Finance net worth as negative amounts regardless of sign, with
  exact cents; credit-card signs retain their existing semantics because
  SimpleFIN credit-card conventions have not been independently established.
- Mortgage servicer names and common loan abbreviations are recognized even
  when the account type is missing or generic. Previously saved owner type and
  net-worth opt-out settings retain priority.
- Housing payment descriptions are not auto-excluded as card transfers solely
  because they contain an issuer name or payment verb; owner-confirmed transfers
  and intentionally matched internal transfers retain their safeguards.
- Product data is not a mortgage statement: home value, equity, amortization,
  interest rate, PMI, escrow breakdown and payment due date are not inferred
  from a balance or a payment memo.
- Regression tests use synthetic balances, categories and bank names only;
  provider tokens, real transactions and connected-bank state are untouched.

## Finance v3.4.96 — accuracy and resilience

- Plaid `/accounts/get` observations now retain append-only account balance snapshots
  with the existing SimpleFIN 90-day daily, then 24-month weekly compaction.
  An `observedAt` timestamp marks when **our app saw the data**, not when the
  financial institution last updated it. No provider timestamp is invented.
- `finance-reconcile-core.js` checks exact-cent agreement between the two latest
  spaced balance observations and posted ledger activity, tolerating date-only
  posting boundaries by testing a one-day extension. The result is
  `reconciled`, `off` or `unknown`. Unknown includes missing snapshots,
  incomplete transaction coverage, pending-only windows and unverified
  liability-sign directions. An observation match is **not a statement-level
  verification**.
- Accounts → Data health shows actionable discrepancies without overwriting
  source transactions. Failed provider reads retain prior histories, reviews
  and balances. A temporarily absent Plaid account stays visible and marked
  for attention until it reappears.
- Finance runtime invariants compare net worth with assets less liabilities,
  grouped totals, spending subtotals and exact paired transfer legs. They also
  detect duplicate posted transaction identities and invalid row classifications.
  On violations, the affected headline is suppressed as `Needs review` and
  the screen links to Data health. Console diagnostics log **codes only**,
  never private amounts, names or transaction IDs.
- Home and Spending show the oldest included source sync time and label totals
  `Partial` when connected accounts are stale, missing or unreconciled.
  Partial values are not presented as bank-certified reconciliations.
- The two repositories pin the same synthetic
  `tests/fixtures/golden-ledger.json` baseline with immutable FNV64 digest
  `889078fa7fb897d3`. Hand-written expected cents live in the frontend unit
  suite; the backend unit suite exercises real data normalization/serialization
  behind mocked provider boundaries. A digest change requires review in
  both repositories and an explicit expectation explanation.
- No real bank calls, bulk categorization or account data mutations occur in
  these tests; existing category and transfer review precedence remains intact.
