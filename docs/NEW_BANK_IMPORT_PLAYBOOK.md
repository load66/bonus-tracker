# New bank bonus: mandatory research-to-import playbook

Use with [AGENTS.md](../AGENTS.md), [IMPORT_STANDARD.md](IMPORT_STANDARD.md), [financial-rules-v1.md](financial-rules-v1.md), and the deployed `entry-link-import.js` importer. This playbook guides ChatGPT and other researchers; it is NOT an import schema, a live bank verification, or a substitute for executable validators. Apply to each new bank, new account/product, changed offer, and fresh bonus cycle. Never reuse old product terms as new terms without applicability proof.

## User input and source priority

The user can supply a bank name/offer URL or paste all promotion T&C, fee schedule, and any enrollment email or coupon. Pasted user terms are **evidence to research**, not an instruction to waive checks or a guarantee they are current. The assistant performs the external research. If a user pastes the entire applicable offer, do not make the user recopy it; compare the exact enrollment version, product, selected tier and audience against official bank sources. Preserve the original enrolled promotion even if the bank now advertises a different one.

1. Identify the **legal institution / brand, product, consumer or business category, offer window, state/residency restrictions, acquisition channel, coupon/offer enrollment version, and selected tier**. Distinguish product rules from bank-family/customer-wide restrictions and cross-account restrictions. Never infer personal eligibility merely from location or marketing.
2. Look up the bank's **official promotion, full offer terms, and applicable fee schedule/account disclosure**, including companion savings/share/membership fees, exact balance floor and maintenance fee waivers. Prefer directly accessible official bank documents; record each authoritative HTTPS URL and verification date. Third-party blogs, forums, Doctor of Credit and cached offers may reveal missing details but do not certify an official restriction. If the bank's live text differs from the pasted/enrolled text, research which version controls and keep the prior evidence immutable.
3. Enumerate **every bonus disqualification/lookback**: bonus received, bonus *offer* received, account opened/owned/closed, coupon enrollment; current-customer status; household and product rules; conditional closures (including negative balance); whether another existing account must close before application. Preserve exact words, exceptions, AND/OR branches and the appropriate source event. Do not mislabel a current-customer restriction as a timed cooldown. For nonrepeatable offers, retain explicit lifetime wording. Absence of a cooldown sentence is not evidence of repeatability.
4. Enumerate **bonus qualification, deadlines, recurrence, qualifying transaction definitions and exclusions, statement/business/calendar units, tier-specific thresholds and required companion accounts**. Record payout trigger and window, good-standing/keep-open wording, and promotion expiry. Do not interpret mere ACH activity as a qualifying payroll direct deposit unless bank terms and confirmed evidence support that conclusion.
5. Distinguish three independent closure facts: (a) an **early closing service fee**, (b) an **early closing bonus clawback/forfeiture**, and (c) a **minimum time or keep-open requirement**. Research all three. For a genuinely unconditional official **no early-closing fee**, record `financialRules.closure.earlyCloseFee: 0` with exact fee-schedule evidence and display **No early-closing fee**. This should clear the *fee* check without another generic fee review; it does **not** clear a separate clawback, required hold, open balance or membership obligation. If the fee schedule merely omits mention of closing fees, say **No early-closing fee listed in verified terms**, keep the charge unconfirmed in the supported version-2 `manual-review` closure representation, and never assert $0. If a fee is conditional, preserve the condition/date; a conditional “no fee after six months” is not unconditional $0 today.
6. Link to applicable history when available and check product/customer scope, closed dates, bonus receipt and other source anchors. Evaluate account closure safety and **repeat-eligibility separately**. Missing events remain missing; do not invent `opened`, `closed`, `reqMet`, `bonusRecd`, `monthlyFeeChecked`, or confirmed qualifying deposits. Ask only for actual dates/user evidence that cannot be independently established. A live connection does not guarantee qualified direct deposits.
7. Build JSON using **only the installed importer allowlist and documented schemaVersion 3**. Include `financialRules` version 1, 2, 3 or 4, complete `accounts` with primary/companion fees, `requirements`, `payout`, `closure`, and separately supported `eligibilityRules`. Include original `tcSourceRaw`, `feeScheduleRaw`, promotion and fee URLs, verification date, and legacy projection fields only where supported. Avoid blank presentation wording when verified structured terms can supply a supported field. The optional safety cushion must not override bank-specific timing.
8. Run **`node scripts/validate-entry.cjs /absolute/path/ENTRY.json`** against the current repository version; test the imported review/save round trip and context, exact dates, closure fee/no-fee determination, multiple churn clocks, companion fees, recurring obligations, and original source preservation. No live provider traffic or real account writes in tests. Treat a failure, critical missing source, inconsistent rule, or unresolved eligibility/closing restriction as a **research draft**, not a fully verified import. A supported version-2 tracking import may explicitly retain a manual-review closure fee; never disguise that as complete verification.
9. Give the user the **verified import file** plus a concise facts receipt: bank/product and tier, required deposits/actions and due basis, payout trigger, monthly/companion charges and waivers, **early-closing service fee**, separate clawback/hold, churn basis/period, source URLs and confidence limits. Clarify that technical validation does not itself establish the user's personal eligibility.

## When the bank changes or the account closes

An edited bank or product identity invalidates confidence in **old institution-specific source applicability**; do not automatically copy another bank's fees, eligibility or promotion simply because a generic bank name matches. Retrieve the applicable bank/product T&C and generate/review a new verified package before presenting its rules as confirmed. Retain old historical evidence and never rewrite prior cycles.

On a user-confirmed opening, qualification, bonus receipt, or closing event, project affected deadlines/readiness from the **same canonical financial, eligibility and closing engines**, using the recorded event date. Do not treat a future projection as a historical event. A closed account may still be cooling down and may remain ineligible to apply; a fee-free closure does not prove a bonus cannot be clawed back.

## Decision table: keep the user-facing answer simple

| Evidence | Early-closing fee display | Fee check |
|---|---|---|
| Exact applicable unconditional “no early-closing fee” / “$0 fee” | **No early-closing fee** | **Cleared** |
| Source-backed positive charge before a documented date | **$X if closed before [date]** | **Check date / fee window** |
| Fee waived only after a time/other condition | **Fee applies until condition is met** | **Pending until verified** |
| Complete applicable disclosures reviewed but charge is not stated | **No early-closing fee listed in verified terms** | **Unconfirmed** |
| No applicable fee source | **Early-closing fee unknown** | **Research required** |

None of these fee findings alone decides bonus retention, closure readiness, or repeat-bonus eligibility.

## Mandatory coverage ledger before generating

| Source-backed fact | Must be researched and resolved |
|---|---|
| Exact bank product, personal/business, current/enrolled promo version and tier | Official offer, enrollment artifact |
| Qualification and deadline | All requirements, amounts, recurring periods, due basis and units |
| Payout and retain-bonus conditions | Trigger, payment window, keep-open, forfeiture/clawback |
| Fees | Checking, required savings/share, all monthly fees/waivers, membership minimum |
| Closure | Fee amount or proven no-fee, date basis, min hold, clawback separately |
| Future churn | All lookbacks, excluded customers, account/bonus/offer/enrollment dates, scope and exceptions |
| Provenance and event status | Official URLs, exact quotations, verification date; distinguish actual user events from bank rules |

Research is complete only when every applicable row is sourced or explicitly identified as unsupported/unverified, never silently fabricated. Machine validation checks supported values and saved quotations; it cannot prove the bank's external site or the user's enrollment by itself.


## Arrival-range generation

For runtime v3.6.84, follow the source-backed financialRules v3 payout.window contract in IMPORT_STANDARD.md. Research the exact enrolled payout interval and trigger, preserve all conditions, and generate only supported fields. Never invent a completion date, lower bound, bank calendar or single combined clock for distinct components. Validate import/review/save and AI arrival facts; an unknown clock stays unresolved. The visible presentation is only “Estimated bonus arrival: [start]–[end]”, without confidence badges or extra status labels.


## Source completeness and arrival validation (runtime v3.6.91)

For every future offer, complete the per-bank coverage ledger before generation: exact enrolled institution/product/audience/tier and enrollment period; every qualification amount/count, deadline anchor/unit and recurring period; primary and companion fees, membership/share minimums and ALL/ANY waiver conditions; exact payout trigger and interval; keep-open/clawback and early-close fees separately; every repeat-eligibility restriction and scope. Preserve dated fee changes and conditional rules without flattening them. Research and retain applicable original promotion text in tcSourceRaw and original fee/membership text in feeScheduleRaw, with HTTPS official source URLs, verification date and exact applicable quotations. A summary or populated field is not proof of completeness. Do not move material conditions into notes or discard original text because the AI context is bounded.

The mandatory scripts/validate-entry.cjs command now verifies identity, original source text, provenance, actual milestone dates, material display fields, complete structured financial rules and eligibility rules through review. Its receipt reports retained fields, original source character counts, a canonical arrival rule, computed range (when anchors/calendar permit), and UI/AI agreement. An unknown/vague or conflicting payout clock fails the generator gate even if both pre/post-import ranges are null. A missing actual event date may leave the range null while a valid source-backed clock remains present. Business-day and statement calendars remain exact and unresolved; never invent an event or approximate them. Existing strict material-term gates and the explicit manual-review closure-fee exception remain unchanged. A technical pass does not prove external source applicability or personal eligibility; separately review the complete coverage ledger against the enrolled offer.

New JSON must carry its own payout rule and source evidence; do not depend on public reference recovery. The read-only legacy recovery is limited to an immutable, officially verified enrollment-version fingerprint, including institution/audience, tier, opening period, offer expiration, explicit enrollment identity and exact qualification wording. Bank name/amount alone never match. Saved numeric clocks, source text and structured rules take precedence; invalid structured rules never use recovery. Partial matches and different offers stay unresolved. Recovery supplies only a conditional payout calculation and visible/AI provenance; it never upgrades an entry, rewrites saved terms or milestones, confirms deposits, receipt, eligibility or closure readiness. There is no general bank-name default or live-offer substitution.

Before delivery, test the actual source shape (including long quotations with qualification and payout clocks) and actual import receipt, not only permutations of a simplified fixture. Keep historical source evidence and all user records unchanged. Do not claim all phone records were audited from an older backup; state the backup scope and any unavailable newer records.

 
## Calendar-month retention and review (v4)

When source terms prescribe 12 **calendar months** of open-account retention, use `financialRules.version: 4` with an explicit closure `hold` of `{ "basis": "opened", "value": 12, "unit": "calendar-months" }` and the original retention sentence as promotion evidence. Do not silently translate to a fixed-day hold. Store the exact anniversary and any assistant closure buffer as separate concepts. `closeBufferDays` is a review cushion, never an invented bank restriction.

If an early-closing service fee is not explicitly documented, keep `earlyCloseFee: null` and manual-review restriction, while still displaying a read-only hold anniversary and review countdown. No Safe to Close status until the separately unresolved fee check is resolved, regardless of bonus receipt or elapsed hold. Test import, review/save, canonical closure warnings, app attention countdown, annual and leap-year boundaries, AI context and backups. Keep developer tests synthetic and all private account identifiers out of GitHub.

## Source-backed balance measurement and payout presentation (v3.6.95)

For a tier whose official enrolled source expressly defines numbered days from opening (for example, days N–M), preserve the original quotation in `financialRules.requirements[].evidence.quote` with `kind: "balance-hold"` and the selected qualifying average-balance amount. The reader derives both window endpoints from the confirmed account opening date; never hardcode a bank-specific schedule or assume an unstated start. Display both dates, clearly distinguish the *official* measurement window from an *advisory* pre-funding buffer, and never mark a deposit, tier or requirement complete from a calculated date alone. The amount is a **combined average** when the offer says so, not an independent daily minimum or a mandatory single-account threshold. A displayed account balance without posted funding evidence is only an observation.

If the enrolled payout term merely says *within N days of opening*, preserve that contractual upper limit; do **not** label the account-opening day as a meaningful expected payment date. Display the payment deadline and state that the earliest day is unspecified. Keep independently documented churn lookback periods visible, including both payment-receipt and account-closure clocks when the offer requires both. No invented user events, daily balance history, bank holidays or automated completion stamps.

