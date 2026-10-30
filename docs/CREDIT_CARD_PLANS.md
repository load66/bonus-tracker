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
