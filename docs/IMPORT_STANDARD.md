# BonusTracker JSON generation standard

Adopted October 13, 2026; revised October 14, 2026. Applies to every future BonusTracker import for Philip, including new conversations. Compatibility baseline: BonusTracker v3.4.50, strict numeric schemaVersion 3, and financialRules version 1, 2, 3 or 4. Existing schema v1/v2 records remain compatible; they are not the standard for new generated files. This document is a generation standard, not an importable offer or a claim that any bank's terms have been verified today.

## Mandatory per-bank research and autofill

Read [NEW_BANK_IMPORT_PLAYBOOK.md](NEW_BANK_IMPORT_PLAYBOOK.md) alongside this standard and the current financial-rule contract before generating any new bank/product/cycle file, whether the user pastes all T&C or provides only a bank name or offer link. The assistant researches the specific applicable official promotion, enrolled terms and complete bank/companion fee schedules, checks every churn restriction and current-customer exception, and fills all **source-verifiable** supported bank-card fields (requirements, timing, fees, waivers, payout, closure, future eligibility). The user need not manually research the bank. When the user opens, edits, closes, or reopens an account, recalculate projections from the same canonical engines using confirmed events; never invent activity or reuse another bank's rules. Officially documented unconditional **no early-closing fee** is displayed plainly and clears its fee check; an unlisted fee remains unconfirmed, and a fee-free closure does not mean no bonus clawback.

## Responsibility and release rule

The assistant researches the official promotion and fee schedule, resolves the applicable product and enrollment terms, generates the JSON, and verifies its import and calculations. The user supplies the offer/enrolled terms and actual account events. The user should not have to fill in researched rules manually afterward.

Do not hand over a finalized import when an unresolved term could change the bonus amount, required activity, fees, closure safety or repeat eligibility. State what is unconfirmed and what source or enrollment detail is needed. Unknown is never converted to zero, no fee, no restriction, a fabricated date or confirmed eligibility.

## Required contents

| Area | Generation requirement | Current supported fields |
|---|---|---|
| Identity | Exact institution, applicable account/product, personal/business category, verified bonus or selected tier, actual opening date | `bank`, `accountType`, `bonus`, `opened`, product wording in `tcSourceRaw` |
| Provenance | Official promotion and applicable fee-schedule URLs, verification date, complete original promotion wording | envelope `verification.promoSourceUrl`, `verification.feeScheduleSourceUrl`, `verification.termsVerifiedAt`; `entry.tcSourceRaw` |
| Requirements | Exact qualifying deposit/activity definition, amount, transaction count, every recurring period, balance requirement and enrollment/promo-code condition | `completeBonusText`, `requiredDaysText`, `fundingAmount`, `fundingAmountText`, `fundedDays`, `promoCodeText`, `customTimers` where representable |
| Timing | Exact deadline anchor and unit; distinguish calendar days, business days and calendar months; distinguish enrollment from opening | `reqDays` only for a supported day-based rule; `requiredDaysText`, `couponEnrollmentDate`, `offerEnrollmentDate`, supported timer start/date fields |
| Payout | Exact trigger, waiting period, applicable maximum window and keep-open/good-standing conditions | `payoutTimingText`, `completeBonusText`, `closeRuleText` |
| Monthly fees | Applicable maintenance charge, frequency and all alternative or combined waiver conditions | `monthlyFeeYNText`, `monthlyFeeAmountText`, `monthlyFeeFrequency`, `monthlyFeeWaiverType`, `monthlyFeeWaiverAmountText`, `monthlyFeeWaiverText`, `avoidMonthlyFeeText` |
| Companion accounts | Required membership/share/savings account, minimum retained balance, its fees and waiver conditions, and any membership-only exception | Full applicable terms and explicit companion wording in supported requirement/fee-waiver text fields; never conceal these facts only in `notes` |
| Closure | Early-close charge, bonus forfeiture, hold period, exact anchor, contractual keep-open condition and separately identified safety buffer | `earlyCloseFee`, `earlyTerminationFeeText`, `closeRestrictionType`, `closeRuleBasis`, `minHoldDays`, `closeBufferDays`, `closeRuleText` |
| Repeat eligibility | Every applicable restriction with its scope, exact basis, period/unit, evidence and any closure prerequisite | `eligibilityRules`, `churnability`, `churnable`, `sourceEligibilityBasis`, `churnPeriodValue`, `churnPeriodUnit`, `currentCustomerExcluded`, `mustCloseBeforeReapply`, evidence text fields |

Use only the deployed runtime's recognized fields and values. New generated files must use numeric schemaVersion 3 and financialRules version 1, 2, 3 or 4. Include feeScheduleRaw and the complete financialRules package. Do not invent top-level properties or silently downgrade to bypass a failed validation. Checklist and arbitrary AI metadata remain unsupported import fields. Account-scoped companion objects are supported only inside financialRules.accounts, with explicit required status, charge, waiver logic and original evidence.

Preserve the enrolled promotion when current public wording differs. Identify the relevant version and enrollment period. Source URLs and dates alone do not prove the chosen product or offer applies.

## Evidence and unknowns

Capture the exact supporting wording for eligibility and closure anchors. Keep fee evidence with the applicable fee and waiver fields, its official source and verification context. Keep original terms separate from interpretation. Explicitly distinguish a bank's stated rule from an assistant safety buffer.

Do not label an offer repeatable without supporting terms. Capture all repeat restrictions and let the canonical engine choose the latest applicable eligibility date; a missing required anchor blocks a confirmed date. Apply closure prerequisites and product/customer scope. Do not silently equate enrollment and opening unless the source and importer-supported fallback justify it.

Distinguish fee-schedule research from the user's actual fee-review acknowledgement. Do not mark requirements complete, bonus received, account closed, deposits qualified or waiver conditions satisfied merely because the terms have been verified. Actual event dates require the user's confirmation.

A required savings/share account can create a fee risk even when checking is free. Keep each account's charge and minimum distinct; do not put a combined descriptive string in a numeric field that the engine might misread. If the current format cannot faithfully represent a material rule, flag the compatibility gap and implement/test the schema support before finalizing the import.

## Structured financial-rule contract and cross-conversation procedure

At the beginning of each import task, load this current standard and the current repository docs/financial-rules-v1.md from load66/bonus-tracker. Read repository AGENTS.md. If the discoverable skill is available, use $generate-bonus-import. Confirm that the deployed version supports the intended schema. Do not substitute recalled conversations, stale sample JSON, or an earlier downloaded standard for the current files. If authoritative instructions or runtime support are unavailable, report that gap rather than guessing a finalized import.

The financialRules package requires a selected bonus tier, one primary account, every applicable companion account, all scoped requirements, payout conditions, and closure restrictions. Original fee/membership text belongs in feeScheduleRaw; original promotion text remains in tcSourceRaw. Quotes must be exact source excerpts. Currency amounts, counts, periods, ALL/ANY expressions and supported balance metrics are typed, not extracted from display wording at answer time.

Preserve minimum-daily, average-daily and statement-ending balance distinctions. Keep a membership retention floor separate from a fee-waiver threshold. Never translate a calendar month, business-day deadline or statement cycle into an approximate calendar-day count. Unsupported material rules need review or implemented schema support. Match structured closure and payout rules to existing tracker calculation fields; conflicting imports must fail.

Run node scripts/validate-entry.cjs /absolute/path/ENTRY.json against the current checkout. Retain the actual successful validation receipt with the working task. It verifies strict intake, the review/save projection, original fee text and actual AI context. A failing receipt or unresolved material requirement blocks final delivery. Source presence and numeric checks are not proof of every semantic interpretation: verify product, selected tier, evidence applicability and enrolled promotion before the technical test.

Keep this document, the repository mirror docs/IMPORT_STANDARD.md, contract docs/financial-rules-v1.md and the generate-bonus-import skill synchronized. Update them only with an implemented and tested runtime change. A new conversation still needs to load the standard; the importer's rejection gate provides a second independent check if a generator overlooks it.

## AI context contract

Important rules belong in supported requirement, payout, fee, closure, eligibility or full-term fields. Notes are excluded from Ask AI and must not be the only source for a material rule. Account numbers, credentials and other personal identifiers do not belong in the terms/evidence package.

For structured entries, Ask AI prioritizes the validated financial-rule evaluation, applicable quotations and explanation boundary; ambiguous legacy fee and requirement strings are excluded. For legacy entries, the adapter includes supported requirement and funding wording, complete fee-waiver fields, closure evidence, canonical normalized eligibility rules and conditional states, custom reminders, source verification metadata, canonical closure checks/dates and task counts. Structured rules take priority over raw promotion terms. Up to 10,000 characters of terms are included within a request budget that reserves space for a full question; any shortened field or omitted term passage is explicitly marked. Therefore, a richer JSON does not by itself guarantee every field reaches AI: verify the actual context projection. Put concise applicable rules in their proper fields and confirm the adapter reads them; extend and test the adapter when needed. Never assume that text omitted by truncation was reviewed.

AI explains saved facts, cites its supporting fields and identifies missing information. It does not replace the date/fee engines, confirm live bank activity, establish current eligibility or automatically modify the entry. Additional JSON detail improves evidence; it is not a guarantee of correct AI interpretation.

## Verification before delivery

1. Recheck official source applicability and the promotion/fee version.
2. Generate schemaVersion 3 with financialRules version 1, 2, 3 or 4, exact promotion/fee source text and only supported entry fields; run the current strict validator.
3. Test the review-and-save round trip in an isolated context; compare important fields after saving.
4. Test each deadline anchor, repeat rule and applicable closure/fee restriction against the canonical engine. Include end-of-month/calendar-month behavior, missing anchors and recurring-period cases when relevant.
5. Confirm timers, requirement wording, closure readiness, fee review and repeat countdown agree. Do not let a generic buffer replace the bank's verified restriction.
6. Inspect the actual Ask AI facts for fee amount/waivers, companion requirements, payout and eligibility. Flag any unsupported or omitted material field.
7. Confirm a new import does not overwrite existing records. Repeat-bonus replacements require the normal explicit review flow.
8. Deliver the verified offer-specific JSON with a short summary of key requirements and any remaining limitation.

No offer-specific financial values or dates have been invented in this standard. Each future import must be generated from its own verified sources and the user's actual enrollment/account information.
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

## Immutable historical T&C cloud archive (v3.6.14)

Every saved enrollment, replacement, and later correction must retain the original promotion wording, the original fee schedule text, structured financial/eligibility rules and companion-account conditions, bank/product identity, dates, official URLs and saved verification evidence. Never replace historical cycles with a bank's newer public promotion or fee schedule. The runtime projects those already-saved fields read-only and, when owner-authenticated Cloudflare R2 backup is available, uploads content-addressed, immutable terms snapshots through `/api/bonus-tracker/terms`. Uploads are SHA-256 readback verified, do not mutate the tracker, and are retained independently of rotating recovery snapshots. Cloud terms are accessible through Archive > Cloud T&C history. Failed/unsynced versions must never be shown as verified. Legacy terms missing from all existing records cannot be reconstructed from public sites without original-enrollment evidence. The JSON schemaVersion 3 importer and canonical financial-rules/eligibility/closure engines remain unchanged; run strict import and cloud regression suites before each release.



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

 
## Calendar-exact bonus retention for future imports (financialRules v4)

When enrolled official terms require a fixed number of **calendar months** the account must remain open, generate `financialRules.version: 4` and `financialRules.closure.hold: {"basis":"opened","value":12,"unit":"calendar-months"}` with a direct supporting exact promotion quotation. Keep `minHoldDays: 0`: never approximate twelve months as 365 days. Preserve the `closeBufferDays` assistant cushion separately from the contract. The tracker derives anniversary and closure-review dates from the actual opening date and recalculates after record edits. A review date is not a Safe to Close decision.

Where the applicable fee schedule does not explicitly confirm no closing service charge, keep `financialRules.closure.earlyCloseFee: null`, `restrictionType: "manual-review"`, `basis: "manual"` and a source-backed fee disclosure quotation. Preserve bonus clawback separately in closure wording. A manual fee review must block Safe to Close even after the 12-month hold and bonus receipt. The calculation must not invent observed deposits, account activity, bonus receipt or eligibility dates. The bank's 12-month retention clock is separate from its 24-month bonus-received and 12-month account-ownership lookbacks for future churn. Run the current strict import validator and both browser engines before declaring an import ready.
