# Financial rule contract v1

Runtime: `financial-rules.js` (`BTFinancialRules`). Import envelope: `BonusTrackerEntry`, numeric `schemaVersion: 3`. This contract is supported from v3.4.50. Rules supplement existing eligibility and date calculations; they do not confirm account activity or calculate business/statement dates.

## Required entry fields

Retain the schema v2 identity, provenance, original promotion text, eligibility evidence and applicable legacy calculation/display fields. Add `feeScheduleRaw` containing the applicable original fee/membership wording, and `financialRules` below. Use only fields in the importer allowlist. Verification URLs must use HTTPS; `termsVerifiedAt` must be a real ISO date. Every quotation must occur in its designated original text after whitespace normalization.

```json
{
  "version": 1,
  "bonus": {"amount": 250, "currency": "USD", "text": "Selected bonus tier", "evidence": {"source": "promotion", "quote": "Exact original wording including the selected amount"}},
  "accounts": [],
  "requirements": [],
  "payout": {},
  "closure": {}
}
```

The example amount is synthetic, not a bank offer. Each generated import must use its own verified values. Do not copy example evidence or amounts into a real offer.

## Accounts and fees

List exactly one primary account and each applicable companion account separately (maximum eight). Account keys:

- `id`: unique lowercase identifier, 1–40 letters/digits/underscores/hyphens.
- `label`: applicable product name; `role`: `primary` or `companion`; `required`: boolean (primary must be true).
- `fee`: `{amount, currency, frequency, waiver, evidence}`. Amount is a non-negative number, currency is `USD`, frequency is `monthly`, `statement-cycle`, `quarterly`, `annually`, or `none`. `none` requires amount 0. A required account with unknown fee is rejected. An optional unknown fee uses null and produces a warning. A zero fee requires explicit zero/no-fee evidence; absence is not zero.
- Optional `minimumBalance`: `{amount, text, evidence}` for a membership/share retention floor. Keep this distinct from the balance that waives a fee.

Every fee and minimum-balance quotation comes from `fee-schedule`. Never assign a companion account's fee to checking or merge amounts into one account field.

### Waiver expression

Use null when unconfirmed (paid-fee rules then warn); use `{operator: "none", evidence}` only with explicit no-waiver evidence. Otherwise use `{operator: "any" | "all", conditions: [...], evidence}`. An `any` node means one alternative is sufficient; an `all` node means every condition is necessary. Nodes may nest up to four levels, with up to twelve children per node. Preserve parentheses when combining alternatives and requirements. The group quotation must establish the ALL/ANY relationship.

Each leaf: `{id, kind, text, amount?, count?, period?, metric?, evidence}`. Kinds: `direct-deposit`, `new-money`, `balance-hold`, `transactions`, `enrollment`, `relationship`, `other`. Periods: `one-time`, `calendar-month`, `statement-cycle`, `calendar-quarter`, `calendar-year`. A balance-hold waiver must include its exact supported metric: `minimum-daily-balance`, `average-daily-balance`, or `statement-ending-balance`, with matching source wording. Unsupported metrics need review/schema support; never substitute one basis for another.

Amounts/counts remain numeric, must match their quotation, and are never treated as observed user balances/deposits. Dollar values must be explicitly quoted; whole counts may use number words zero through twelve.

## Bonus requirements

Include one to twenty scoped requirements: `{id, accountId, kind, text, amount?, count?, recurrence?, timing?, evidence}`. IDs must be unique, accountId must name an account, and evidence comes from `promotion`.

- `recurrence`: `{period, count}`. Period excludes `one-time`; count is positive. Preserve every required period and number of periods in the source wording and description. One checked task does not confirm all periods.
- `timing`: `{basis, value, unit}`. Basis: `opened`, `reqmet`, `bonus`, `enrollment`. Units: `calendar-days`, `business-days`, `calendar-months`, `statement-cycles`. Value must be a positive integer present in the quotation. The source must support the unit. Do not project non-calendar units into `reqDays`; keep `reqDays: 0` and use exact bank/statement dates in supported reminders when known. No 30-day approximation of a month or statement cycle is permitted.

Use complete `text` for conditional branches, tier-specific definitions and bank exceptions. The engine validates types, supporting numbers and recognized units; it cannot prove every semantic interpretation or product applicability. Research and source review remain mandatory. Unsupported material conditions are not finalized as importable rules.

## Payout and closure

`payout`: `{text, evidence, timing?}`. Text must agree with `payoutTimingText`. Timing uses the same value/units, with basis `opened`, `reqmet`, `bonus`, or `qualifying-period-end`. Preserve keep-open/good-standing conditions and exact trigger. A timing window is not a guaranteed payment date.

`closure`: `{restrictionType, basis, minHoldDays, earlyCloseFee, text, evidence, feeEvidence}`.

- Restriction types: `payout-only`, `minimum-open`, `explicit-clawback`, `manual-review`, `none`.
- Basis: `opened`, `reqmet`, `bonus`, `manual`. Manual-review requires manual basis and blocks a ready-to-close verdict.
- minHoldDays: non-negative integer calendar days; earlyCloseFee: non-negative number. Match the existing `minHoldDays`, `earlyCloseFee`, `closeRuleBasis` and `closeRestrictionType` fields exactly. Positive holds must be supported by calendar-day source wording; business/statement/month-based holds require manual review or implemented exact-date support. Never silently convert them.
- `evidence` comes from the promotion and establishes the closure/forfeiture condition. `feeEvidence` uses the applicable promotion or fee schedule and proves the charge. Zero early-close fees require explicit no-fee/zero-fee evidence.
- Keep the app safety buffer separate from the contractual hold; do not introduce a second buffer in this object.

Repeat eligibility remains in the existing `eligibilityRules` contract and evidence gate. Do not duplicate or recalculate its clock here. Multiple applicable restrictions and closure prerequisites remain authoritative in the existing engine.

## Validation and maintenance

Run `node scripts/validate-entry.cjs /absolute/path/ENTRY.json`. It validates strict intake, review/save projection, retained original fee text, current rule compatibility and bounded AI context in an isolated in-memory app. It never reads a user's account storage. It accepts only schema v3 for new generated imports. Nonzero exit means no finalized delivery.

Tests: `tests/financial-rules.test.js`, `tests/structured-import.test.js`, existing eligibility/date/persistence suites, and real browser tests. Synthetic fixtures model companion fees, recurring deposits, ALL/ANY waivers, unsupported rules and contradictory data; they are not verified current bank promotions.

Changing financial meaning requires a versioned contract change, fixtures and an import/storage/AI round trip. Do not weaken validation to make a broken offer pass. Legacy records remain unchanged and use their existing wording; they are not automatically upgraded or declared verified.
