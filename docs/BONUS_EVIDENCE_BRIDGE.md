# Bank Activity Review — Bank Bonus Tracker integration

## User workflow

Open the **Tracker** tab, tap **Review bank activity**, and sign in with the
same BonusTracker cloud account if prompted. BonusTracker requests a read-only
combined SimpleFIN + Plaid snapshots only after that tap and shows a compact, opt-in review panel.

- Review counts of **possible direct deposits**, **possible bonus payouts**,
  **possible service fees** and **possible reversals** for accounts already linked
  to an **open** bonus campaign.
- Each campaign uses the saved exact `entryId`, `bank` and `opened` triplet.
  Bank-name guesses and account-name similarity are **never** enough to assign
  private transaction evidence to an entry.
- Tap **Open tracker** to open that precise campaign. Tap **Review payout** to
  enter the **existing** explicit payout confirmation flow.
- **Manage bonus-account links** opens the existing secure SimpleFIN account
  selector. Unlinked open offers are surfaced without guessing their account.
- Amounts are masked by default. The panel clears private response data after
  leaving the Tracker, or immediately through **Clear**. No private account
  data or transaction text is written to browser storage by this feature.

## Evidence semantics

The read-only panel uses owner-authorized SimpleFIN and Plaid transaction signals:

| Signal | Required direction | Display |
|---|---|---|
| `possible_direct_deposit` | positive, posted | Possible direct deposit |
| `possible_bonus` / `kind=possible_bonus` | positive, posted | Possible bonus payout |
| `possible_fee` | negative, posted | Possible bank fee |
| `possible_reversal` | negative, posted | Possible bonus reversal |
| `possible_recurring` | negative, posted | Possible recurring debit |

Pending, pre-opening, future-dated and non-USD activity is excluded from USD
evidence counts. An observation is placed into at most one evidence category,
favoring reversals and bonus candidates before deposits or fee/recurring
classification. This prevents accidentally counting the same credit as both
an observed bonus and a direct deposit.

The panel is **not proof that a promotional requirement was met**. It does
not evaluate qualifying direct-deposit source codes, aggregate thresholds,
recurring promotional periods, direct-deposit account exclusions, fee waivers,
account closure eligibility or cooldown/rechurn dates. Those rules remain
in the authoritative tracker engines and saved promotion terms.

Possible evidence must never be written as `reqMet`, `bonusRecd`, an account
closure, a fee waiver or a new account link without an explicit user action in
the existing confirmation workflow. Missing activity, stale sync, missing
accounts and stale links are **review gaps**, not proof of an unpaid bonus.

## Security

- The frontend calls only the existing owner-scoped
  `GET /api/bonus-tracker/simplefin` and `GET /api/bonus-tracker/plaid/accounts` endpoints with the user's bearer session.
- No provider setup token, raw provider account ID or connection ID is
  handled by the new integration.
- Descriptions, institution names, dates and errors are rendered with
  `textContent` only; never set `innerHTML` using bank data.
- Requests omit cookies, disable HTTP caching and are cancelled after a
  bounded timeout. The response is kept only in component memory.
- The app never silently reads banking data when the Tracker opens.
- Evidence checks do not initiate provider refreshes, purchases, payment
  instructions, transfers, changes to account preferences or bank bonus
  milestones.

## Release criteria

Run `node tests/bonus-evidence.test.js` and
`node tests/bonus-evidence.e2e.cjs` plus the full frontend release
workflow. Browser tests verify actual tracker linking and manual payout review
without any tracker writes in Chromium, Firefox, WebKit and at
320/390/430 px widths. Do not release a failed CI run.
