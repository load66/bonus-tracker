# Smart bank-offer ranking — v3.6.60

Bank offers are ordered from the best **verifiable opportunity to review** to offers with known blockers. The default algorithm runs on every render and after official availability/feed updates. It does not calculate or claim unconditional personal eligibility.

## Priority and monetary sort

1. **Top matches**: an exact product audience, no known blocker in saved tracker history, and a fresh official verification indicating that the selected state is included or truly nationwide without additional geographic conditions. Sort by proven official bonus amounts descending. Exact bonus amounts outrank advertised maxima (up to) and unverified headline amounts.
2. **More bonuses, unverified eligibility**: no known account/cooldown blocker, but official area applicability or other evidence is missing. Prefer officially supported fixed amounts, then higher headline values clearly labeled unverified.
3. **Tracker cooldown pending**: next supported tracker review date first, then verified fixed bonus descending. A cooldown date never grants eligibility.
4. **Requirements need review**: open accounts, nonrepeatable or ambiguous product/customer status, unavailable tracker dates, or unclassified product audience.
5. **Outside selected area**: explicitly excluded geographic offers remain at the bottom (or are hidden by a chosen filter). Officially expired offers are excluded.

Current-area defaults remain Missouri, with the state selector editable. Official scope evidence expires within 24 hours; if stale or unavailable, the ranking drops the offer out of Top matches. Current feed refresh and official availability checks trigger recomputation; the ranking never writes financial records.

An official document alone cannot establish a user's personal bonus eligibility. Before applying, confirm product/account eligibility, prior/current customer disqualifications, location and membership, promo code, exact qualifying activity and deposit definitions, and the enrolled version. Only exact promotion-specific evidence may justify any such decision.

No automatic offer action, bank application, account migration, or saved-terms override is performed. Unit and browser regression tests include a blocked high-dollar offer, a future-cooldown high-dollar offer, unverified large headlines, fixed versus up-to amounts, and zero personal financial writes.


## New or modified offer holdback (v3.6.61)

Offers with New, Increased, or Updated badges, or an evidence change record, remain in Requirements need review until the current exact official fixed bonus, eligibility, qualifying activity, and fee/waiver wording have been independently reviewed. Unverified large headlines and expired evidence cannot leap above stable current top matches. Sorting never writes tracker records.


## v3.6.65 — proof-backed Top matches

Official state availability is necessary but no longer sufficient for the Top matches group. Its reward must have a current (maximum 24-hour-old), offer-scoped official promotion source and exact fixed bonus amount, plus sourced eligibility and qualifying-activity wording. An official fee source must have applicable monthly-fee or waiver wording. The offer must not have pending changed evidence, an unsupported upper-bound tier, or a source-monitor warning for that same exact official URL.

When any evidence is missing, otherwise-applicable offers remain discoverable under **More bonuses · eligibility unverified**. New or increased offers with incomplete evidence remain in **Requirements need review**. They do not leap above documented fixed-value bonuses. Unresolved source-change warnings demote only matching official document URLs, never other offers from the same bank based on a broad name match.

Fresh page checks and document quotes do not prove that a user personally qualifies. The tracker does not write, replace, or migrate saved offers as a result of source evidence or ranking.
