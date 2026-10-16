# SimpleFIN bank-sync trial

Open the header data menu → **Bank sync · trial**. Use the existing cloud-backup sign-in. Check bank support at https://beta-bridge.simplefin.org/search-institutions before buying a subscription. For a small trial, choose monthly billing in SimpleFIN and connect one active bank. Create an app setup token named BonusTracker at https://bridge.simplefin.org/simplefin/create and paste it only into the app's setup field. All discovered accounts enter read-only transaction monitoring automatically; linking a checking/savings account to a bank-bonus cycle remains optional and must identify the exact eligible open cycle.

The backend exchanges the single-use setup token over HTTPS, encrypts the Access URL and saved evidence with a separate server key, and stores it in an owner-scoped R2 prefix outside backups and screenshots. No bank token or transaction evidence is saved in browser storage, ordinary tracker exports, or AI requests. Existing signed owner verification applies to every route. Provider redirects, arbitrary hosts and custom ports are rejected.

Discovered accounts sync automatically at most once every 24 hours while the backend is running. The initial transaction fetch starts after linking when provider capacity permits; connecting another institution during an existing daily window may delay new transactions until the next eligible check. The scheduler resumes after a restart; missed offline changes are not represented as current. An overlapping 30-day retrieval window catches delayed records. Provider IDs are scoped by connection, account, and transaction. Pending rows are excluded. Missing rows do not prove reversal, closure, completed requirements or nonpayment. Changed rows are identified; explicitly described reversal debits are review candidates. The first trial shows activity and possible promotional credits, and **does not mark tracker milestones or bonuses paid automatically**. It does not certify direct-deposit qualification or continuous balance maintenance.

All discovered accounts' eligible transaction evidence is retained (90 days maximum); account-list discovery retains basic account labels and balance snapshots. The user does not enable a separate monitoring checkbox. Bonus matches must still be selected explicitly and never create a confirmed tracker milestone. Changing a mapped cycle clears its previous trial evidence. A missing or replaced tracker cycle is not presented as evidence for a new cycle. Warnings and incomplete responses stay visible. Retrieval time, source balance date and unknown transaction completeness are distinguished.

Disconnect removes the whole SimpleFIN Bridge connection's locally stored credential and sync data by writing a disconnected tombstone. It does not close bank accounts, revoke the upstream SimpleFIN token or cancel the SimpleFIN subscription; manage those in SimpleFIN.

Backend deployment requires a stable `SIMPLEFIN_ENCRYPTION_KEY` (Fernet key). Never rotate it casually: existing encrypted state would become unreadable. There is no database migration, new paid hosting service, or extra bank-provider account activated by deploying this feature. No automatic paid upgrade exists.

Verification: backend unit/route tests cover encryption, owner isolation, URL restrictions, duplicate/pending handling, corrections, retention, rate limits, credential persistence and disconnect. `tests/bank-sync.e2e.cjs` exercises phone widths in Chromium, Firefox and WebKit with synthetic bank data; no live account is used by tests. Live coverage and refresh reliability remain unverified until an authorized account trial.

## Plaid Trial fallback (2026-10 automatic sync)

SimpleFIN remains the primary provider. Plaid is an optional fallback for institutions SimpleFIN cannot connect. A successful Plaid authorization creates a permanent lifetime Trial Item; the global ten-Item allowance **never increases again** when an Item is disconnected. The app independently discovers each newly authorized Plaid bank and
attempts that Item's initial read-only history sync even if a different Plaid
bank is in its daily cooldown. If Plaid's first response is empty, the account
shows **Awaiting bank activity** until later provider data arrives. Each Item
is tracked separately for scheduled follow-up and error recovery; existing
connected Items retain daily provider throttling. Pending transactions appear
as pending but never count as posted spending or bonus evidence. Backfill is
bounded, bank data can still be delayed, and no paid refresh endpoint is called.

Finances → Accounts exposes a direct, per-bank **Remove bank** control for Plaid. The confirmed removal invokes Plaid Item revocation, purges saved data for that Item, and preserves bank-bonus tracker records. The SimpleFIN disconnect removes all Bridge-connected institutions and requires separate provider-side token revocation. Neither operation closes an actual bank account, confirms a bank bonus, or makes transfers.
