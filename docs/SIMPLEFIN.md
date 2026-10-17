# SimpleFIN bank-sync trial

Open the header data menu → **Bank sync · trial**. Use the existing cloud-backup sign-in. Check bank support at https://beta-bridge.simplefin.org/search-institutions before buying a subscription. For a small trial, choose monthly billing in SimpleFIN and connect one active bank. Create an app setup token named BonusTracker at https://bridge.simplefin.org/simplefin/create and paste it only into the app's setup field. Accounts discovered during initial setup enter read-only monitoring subject to provider capacity. Additional banks found through the Add-bank checklist require an explicit Save of per-account Sync choices (default ON in the unsaved draft). Linking checking/savings to a bank-bonus cycle remains optional and must identify the exact eligible open cycle.

The backend exchanges the single-use setup token over HTTPS, encrypts the Access URL and saved evidence with a separate server key, and stores it in an owner-scoped R2 prefix outside backups and screenshots. No bank token or transaction evidence is saved in browser storage, ordinary tracker exports, or AI requests. Existing signed owner verification applies to every route. Provider redirects, arbitrary hosts and custom ports are rejected.

The full SimpleFIN sync is rate-limited by its normal cadence, and all requests consume from one 24-call rolling-day provider budget. The initial transaction fetch starts after linking when provider capacity permits; connecting another institution during an existing daily window may delay new transactions until the next eligible check. The scheduler resumes after a restart; missed offline changes are not represented as current. An overlapping 30-day retrieval window catches delayed records. Provider IDs are scoped by connection, account, and transaction. Pending rows are excluded. Missing rows do not prove reversal, closure, completed requirements or nonpayment. Changed rows are identified; explicitly described reversal debits are review candidates. The first trial shows activity and possible promotional credits, and **does not mark tracker milestones or bonuses paid automatically**. It does not certify direct-deposit qualification or continuous balance maintenance.

All discovered accounts' eligible transaction evidence is retained (90 days maximum); account-list discovery retains basic account labels and balance snapshots. First-connection monitoring is initially automatic; a newly added bank has explicit staged Sync ON/OFF choices and must be saved before its first history fetch. Bonus matches must still be selected explicitly and never create a confirmed tracker milestone. Changing a mapped cycle clears its previous trial evidence. A missing or replaced tracker cycle is not presented as evidence for a new cycle. Warnings and incomplete responses stay visible. Retrieval time, source balance date and unknown transaction completeness are distinguished.

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


## Adding a bank to an existing SimpleFIN connection (v3.4.97)

Once connected to SimpleFIN Bridge, adding a new bank **does not require another one-time setup token or a Plaid Item**. In BonusTracker, select Add bank → Connect with SimpleFIN, sign in at https://bridge.simplefin.org/, add the institution there, and return to BonusTracker. The checklist only uses the existing encrypted Access URL; it never accesses bank credentials or verification codes in the app.

While that particular checklist is active, visibility/focus return triggers **one** debounced owner-authenticated \`POST /api/bonus-tracker/simplefin/discover-now\`. This bypasses the old guided discovery cooldown but still consumes one request from the existing 24-call rolling budget, under the same R2 conditional-write/lease rules as the other owner operations. A request is not made when the budget has run out; the app displays its reset time. Identical checks within a short observation interval are cached without spending another call. The new account listing is verified from a successful provider response; an empty/error response cannot erase old financial records or report a new bank as found.

A successful match lists the newly discovered bank and accounts. Individual Sync switches start **ON only as a draft**. Save commits the chosen monitoring configuration; Cancel discards every draft change. After an approved Save, the server makes at most **one** additional quota-charged first-history request for those newly enabled accounts, leaving existing banks' activity alone. If provider data is delayed or the shared budget is exhausted, the UI reports Waiting for first update instead of showing an invented successful sync.

If no bank is found, the checklist shows a provider-connection-in-progress message. It offers Check again and at most five retry attempts (approximately 30 seconds, 1 minute, 2 minutes, 3 minutes and 4 minutes between checks). These stop on close, Cancel, navigation, sign-out, success or budget exhaustion. All provider account names are rendered as text, never injected as HTML.

Mock-only backend tests and three-browser frontend checks exercise this flow; a **real bank link must still be performed manually by the owner** to validate actual institution availability and provider-side delays. Never add another SimpleFIN setup token just to link a second Bridge institution; reconnection with a replacement token is a separate, explicit recovery operation.
