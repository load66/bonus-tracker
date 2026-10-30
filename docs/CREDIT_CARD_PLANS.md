# Read-only credit-card plans

Credit-card plans are separate from bank-bonus entries, tax totals, bank eligibility and bank payment milestones. The feature runs in the static GitHub Pages app without a server or subscription. Plans persist on the current device and are included in the existing full portable backup. Saving a file to iCloud Drive is a manual user action; cross-device synchronization is not implied.

The assistant prepares a JSON file with `format: "BonusTrackerCreditCard"`, `version: 1`, and `card`. The user opens it using Tracker → Credit cards → Open a prepared card plan, reviews the full plan and explicitly saves it. There is no editable financial form. Updated plans preserve the prior record in history and reject stale previews. No actual card details belong in the public repository.

## Card fields

Required identity: `id` (stable ASCII letters/digits/underscore/hyphen), `issuer`, `name`, `reviewedOn` (actual ISO date). Optional actual dates: `opened`, `closed`. Unknown dates are null. `annualFee` is a nonnegative confirmed number or null; `nextFeeOn` is only an evidenced fee date, never an assumed anniversary.

`welcomeOffer` describes the original enrolled reward, qualifying spending, deadline, progress and payment status, with uncertainty retained. Do not substitute a current advertised offer for enrollment evidence.

`benefits` contains `{title, detail, status?}`. Distinguish a paid charge from an actually posted statement credit and a benefit from its redemption or renewal date. Explain qualifying usage and expiration in ordinary language.

`reviews` contains `{title, on: ISO-date-or-null, kind: "suggested"|"issuer-confirmed"|"unknown", detail}`. Explain what each date means. A suggested anniversary/annual-fee review is not a product-change entitlement or safe-closing deadline. Do not convert monthly billing cycles into a fabricated calendar date. Unsupported `closeBefore` promises are rejected.

`sources` contains `{label, url: secure-HTTPS-URL, note}` and must be nonempty. Record what official sources support and what remains user-specific. `notes` covers product-change options, rewards protection, pending credits/refunds, recurring payments, final balance, annual-fee refunds, keep-open/bonus-repayment rules and future-offer eligibility where evidenced. Never store full card numbers, security codes, passwords or authentication tokens.

The isolated storage key is `bt_credit_cards_v1`, containing `{version:1,cards:[{current:card,history:[priorCard,...]}]}`. Reading and switching categories do not modify bank data. Saving is transactional. A malformed existing store is never replaced by an import. File-based recovery preserves exact plan/history bytes; the additive backend allowlist is compatibility only and not a runtime requirement.


## Collections and organized dashboard (v3.8.0)

A reviewed collection uses `format: "BonusTrackerCreditCards"`, `version: 1`, `cards: [card,...]`. All cards validate before any write. Review and save the entire collection transactionally. Matching IDs update the same account with prior history retained; two different accounts of the same product keep distinct IDs. Keep the stable ID and original opening date for a product change. An initially unknown opening date can be filled later without creating another record.

Optional card metadata: `accountType` (personal/business/unknown), `role` (primary/authorized/unknown), `five24` (counts/excluded/unknown), `five24Reason` (required for exclusions), `annualFeeDateKind` (confirmed/estimated/unknown), `annualFeeNote`, `sourceNote`, `bonusDeadline`, and `bonusReceived` (actual ISO date). Defaults stay unresolved; old plans are never silently upgraded or rewritten. An annual-fee forecast from another app is estimated, not issuer-confirmed. A missing deadline never means a bonus is complete. Membership costs are distinct from card annual fees.

The directory shows compact disclosures, search and personal/business display filters. The dashboard derives countable listed accounts, unresolved records, fee dates in 45 days and recorded bonus deadlines in 30 days. No global new keys, server subscription or bank connection is needed.

5/24 is a reported unpublished policy. This read-only planner uses the first day after the month containing the 24-month anniversary, matching the reported conservative month-boundary method. Closed accounts remain counted until they age out. Exclusion must be stated in the prepared plan; never blanket-exclude business cards. Missing opening dates or counting classifications remain unresolved. A projected below-five date applies to the listed known records and is not a complete report, welcome-offer qualification or approval. Group same-day drop-offs; retain leap/month-end behavior. UI references Travel Freely and the first-hand reporting summarized by The Points Guy. Recheck policy before preparing future plans.
