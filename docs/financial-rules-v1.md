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

## Fee-free closure presentation and source completeness

A verified unconditional early-closing fee of $0 is stored as `closure.earlyCloseFee: 0` only when the applicable official fee-schedule excerpt explicitly supports no fee. The user-facing display is **No early-closing fee**, not a generic fee-review warning. Positive or conditional fees keep their source-backed window. A schedule's silence does not prove zero and must follow the supported financialRules v2 manual-review/unknown pathway; use **No early-closing fee listed in verified terms** rather than presenting a source omission as a bank promise. A no-fee finding does not clear bonus forfeiture, keep-open requirements or other closure checks. See [NEW_BANK_IMPORT_PLAYBOOK.md](NEW_BANK_IMPORT_PLAYBOOK.md) for the required bank-specific research and JSON field coverage workflow.

## Validation and maintenance

Run `node scripts/validate-entry.cjs /absolute/path/ENTRY.json`. It validates strict intake, review/save projection, retained original fee text, current rule compatibility and bounded AI context in an isolated in-memory app. It never reads a user's account storage. It accepts only schema v3 for new generated imports. Nonzero exit means no finalized delivery.

Tests: `tests/financial-rules.test.js`, `tests/structured-import.test.js`, existing eligibility/date/persistence suites, and real browser tests. Synthetic fixtures model companion fees, recurring deposits, ALL/ANY waivers, unsupported rules and contradictory data; they are not verified current bank promotions.

Changing financial meaning requires a versioned contract change, fixtures and an import/storage/AI round trip. Do not weaken validation to make a broken offer pass. Legacy records remain unchanged and use their existing wording; they are not automatically upgraded or declared verified.

## Optional date cushion

From runtime v3.4.64, the app adds a two-calendar-day optional cushion after the latest supported repeat-eligibility restriction. Keep the bank restriction and its exact anchor unchanged. This does not extend qualification or payout deadlines, verify an unresolved legacy rule, or replace a separately saved account-closure buffer. Legacy Lafayette Boost300 closure uses six calendar months plus two days; structured closure terms continue to control their own saved buffer.

## Per-offer eligibility editor

From v3.4.65, the account editor exposes all six existing eligibility anchors, exact calendar days/months/years, multiple saved restrictions, source wording, product/customer scope and negative-balance closure conditions. It uses the same eligibility engine as imports. A user can explicitly copy a known opening date into enrollment; missing dates remain unresolved. Changing a rule's anchor clears its old explicit anchor date. Preserve every applicable restriction and select the latest clearing date; a bank name alone never establishes the applicable rule. These controls do not create new schema fields or make unverified legacy terms verified.

## Financial rule version 2 (runtime v3.4.67)

SchemaVersion remains 3. financialRules version 1 remains supported unchanged; use version 2 for the following additions.

- Balance-waiver metrics `minimum-beginning-day-balance` and `average-beginning-day-balance` preserve exact beginning-of-day wording. They are distinct from daily balance, average daily balance and statement-ending balance. Their evidence must explicitly establish the selected metric.
- An unconfirmed early-close charge uses `closure.earlyCloseFee: null` only with `restrictionType: "manual-review"` and `basis: "manual"`. Retain the applicable official closure condition, original fee source evidence and an explicit explanation that the charge is unconfirmed. No zero-fee claim is made. Legacy numeric `earlyCloseFee: 0` is only a compatibility projection, never the authoritative charge. The structured null remains authoritative through import, review, save, backup and AI context.
- Such an account can be imported for tracking known requirements, but closure remains blocked and no safe-close date may be shown, including after payout. This is a validated tracking import with an explicit unresolved closure check, not certification of complete closure terms or personal bonus eligibility. New offers still require exact bonus, activity, fee and waiver terms. Other unresolved material rules must not be finalized.
- Research drafts are rejected with a draft-specific error before eligibility parsing. Generate a proper BonusTrackerEntry envelope with every applicable eligibility rule. Ordinary account closure wording does not create an additional account-ownership lookback.



## Estimated bonus arrival (runtime v3.6.84)

Keep numeric `schemaVersion: 3`. Use `financialRules.version: 3` for an optional source-backed `payout.window`; rule versions 1 and 2 remain supported unchanged. Do not add a top-level estimated date, confidence field or display status. Generate original payout wording and exact evidence as before. For an explicit numeric range or a “within/up to” interval with a clear supported trigger, add:

```json
"payout": {
  "text": "Bonus is paid between the 90th and 120th calendar day after account opening.",
  "evidence": {"source": "promotion", "quote": "Bonus is paid between the 90th and 120th calendar day after account opening."},
  "window": {"basis": "opened", "unit": "calendar-days", "min": 90, "max": 120}
}
```

This is a synthetic rule shape, not a verified bank promotion. `window` contains only `basis`, `unit`, `min` and `max`. Bounds are nonnegative ordered whole numbers with a positive maximum. Bases are `opened`, `reqmet`, `enrollment` and `qualifying-period-end`; units are `calendar-days`, `business-days`, `calendar-months` and `statement-cycles`. The validator must recognize the original quotation's exact interval and trigger. An optional existing `payout.timing` must agree with the window's basis, unit and maximum. For “within 60 days after requirements are met,” encode min 0/max 60; do not manufacture a narrower earliest date. Retain conditions in payout text and original evidence. Distinct reward components with different clocks must not be combined into one fabricated window; preserve their separate wording and leave a single arrival range unresolved when it cannot faithfully represent them.

The canonical read-only `BTFinancialRules.estimatedArrival(entry)` derives start/end from confirmed saved account events. Display only **Estimated bonus arrival: [start]–[end]** on account cards/details. No confidence badge, new status label, automatic milestone completion or stored derived display string. Recalculate on every render after changed/cleared dates, restore or import. Remove the estimate after recorded payment or closure. Missing/invalid anchors, conflicting rules and ambiguous multiple clocks produce no range. A requirement checkbox or deposit ledger total never substitutes for confirmed all-requirements completion.

Calendar-day addition is date-only and timezone-safe; calendar months retain exact end-of-month clamping. Business days and statement cycles are retained exactly in JSON but remain unresolved without applicable bank calendars; never approximate them as fixed days. Qualification-period-end requires every scoped requirement to have an exact supported opening/enrollment deadline; use the latest deadline. Do not substitute the actual requirements-met date. Enrollment requires a recorded enrollment date and conflicting enrollment dates block the estimate.

Existing structured v1/v2 or legacy records may be adapted read-only from a single unambiguous saved payout interval/trigger. Invalid structured rules never fall back to legacy text, bank names or generic averages. Do not rewrite or upgrade historical records. Preserve the nested rule in import/review/save, portable/cloud backups, historical terms and AI context. Test strict import validation, both bounds and anchors, missing dates, corrected/cleared dates, month/year/leap boundaries, multi-clock rejection, no financial writes, receipt suppression and mobile Chromium/WebKit rendering before release.


## Source completeness and arrival validation (runtime v3.6.91)

For every future offer, complete the per-bank coverage ledger before generation: exact enrolled institution/product/audience/tier and enrollment period; every qualification amount/count, deadline anchor/unit and recurring period; primary and companion fees, membership/share minimums and ALL/ANY waiver conditions; exact payout trigger and interval; keep-open/clawback and early-close fees separately; every repeat-eligibility restriction and scope. Preserve dated fee changes and conditional rules without flattening them. Research and retain applicable original promotion text in tcSourceRaw and original fee/membership text in feeScheduleRaw, with HTTPS official source URLs, verification date and exact applicable quotations. A summary or populated field is not proof of completeness. Do not move material conditions into notes or discard original text because the AI context is bounded.

The mandatory scripts/validate-entry.cjs command now verifies identity, original source text, provenance, actual milestone dates, material display fields, complete structured financial rules and eligibility rules through review. Its receipt reports retained fields, original source character counts, a canonical arrival rule, computed range (when anchors/calendar permit), and UI/AI agreement. An unknown/vague or conflicting payout clock fails the generator gate even if both pre/post-import ranges are null. A missing actual event date may leave the range null while a valid source-backed clock remains present. Business-day and statement calendars remain exact and unresolved; never invent an event or approximate them. Existing strict material-term gates and the explicit manual-review closure-fee exception remain unchanged. A technical pass does not prove external source applicability or personal eligibility; separately review the complete coverage ledger against the enrolled offer.

New JSON must carry its own payout rule and source evidence; do not depend on public reference recovery. The read-only legacy recovery is limited to an immutable, officially verified enrollment-version fingerprint, including institution/audience, tier, opening period, offer expiration, explicit enrollment identity and exact qualification wording. Bank name/amount alone never match. Saved numeric clocks, source text and structured rules take precedence; invalid structured rules never use recovery. Partial matches and different offers stay unresolved. Recovery supplies only a conditional payout calculation and visible/AI provenance; it never upgrades an entry, rewrites saved terms or milestones, confirms deposits, receipt, eligibility or closure readiness. There is no general bank-name default or live-offer substitution.

Before delivery, test the actual source shape (including long quotations with qualification and payout clocks) and actual import receipt, not only permutations of a simplified fixture. Keep historical source evidence and all user records unchanged. Do not claim all phone records were audited from an older backup; state the backup scope and any unavailable newer records.

 
## Exact calendar-month closure hold (financialRules v4)

Numeric `schemaVersion: 3` remains unchanged. `financialRules.version: 4` adds an optional source-backed `closure.hold` for **opened-date calendar-month** retention periods. The form is:

```json
"closure": {
  "restrictionType": "manual-review",
  "basis": "manual",
  "minHoldDays": 0,
  "earlyCloseFee": null,
  "hold": {"basis": "opened", "value": 12, "unit": "calendar-months"},
  "text": "Exact applicable enrolled retention clause",
  "evidence": {"source": "promotion", "quote": "Exact supporting source wording with the hold length"},
  "feeEvidence": {"source": "fee-schedule", "quote": "Exact applicable fee schedule text"}
}
```

Only use the v4 `hold` when the source explicitly establishes the account-open retention duration in months. Do not set `minHoldDays` to an approximation such as 365 or 360. This v4 initial implementation recognizes `basis: opened` and `unit: calendar-months`. `closeBufferDays` remains an **optional planning buffer** separate from the contractual hold; preserve the bank's actual anniversary independently. The canonical `BTFinancialRules.closeHoldInfo(entry)` derives the anniversary with end-of-month clamping and returns the review date and independently unconfirmed fee status, with no record writes.

The absence of an explicit closing-fee provision does **not** prove a $0 fee. Keep `earlyCloseFee: null`, `restrictionType: manual-review`, `basis: manual` and a supported generic fee quotation when the closing fee is unconfirmed; this does not prevent showing the **hold anniversary** and **review date**, but it must block a Safe to Close verdict. Never imply that holding time alone satisfies the payout, fee or lifecycle checks. The account must actually receive the bonus and confirm closure conditions before a safe-closing verdict. Do not automatically mark activities complete, or store derived dates as actual events.

Older financialRules v1/v2/v3 and older day-based close policies retain their existing semantics. New generation files can use v4 only once the target runtime supports it; run the strict `scripts/validate-entry.cjs` full read/review/AI receipt and Chromium/WebKit checks before release.
