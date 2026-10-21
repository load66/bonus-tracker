# Quick Add source-backed catalog (v1)

Quick Add shortcuts are **historical navigation aids**. They do not carry confirmed amounts, deposit definitions, fees, early-closing penalties, hold rules, churnability, or observed opening dates into a new account. The existing enrolled promotion and all saved financial records are immutable with respect to public catalog changes.

## Current source review (October 20, 2026)

The catalog in `quick-add-catalog.js` contains only two curated official-source review records:

- **Wells Fargo Everyday Checking:** the published $325 offer ends October 13, 2026. It advertises a $15 monthly charge rather than the historical $10 shortcut. Status **Expired** and the original promotion and fee disclosure links remain available for review. A historical enrollment may still be valid under its own terms.
- **Capital One 360 Checking:** the published $250 promotion offers distinct **CHECKING250** (qualifying direct deposits) and **DEBIT250** (qualifying debit purchases) paths. Status **Changed** relative to the older one-path shortcut. Official promotion and 360 Checking fee disclosures are linked. A new customer must identify their actual enrollment path and product.

The other ten shortcuts remain **Unverified**—not assumed active, expired or changed. A source-reviewed card does **not** establish personal eligibility, a fee rule for another product, or valid enrollment after a deadline.

## Source requirements and state derivation

The `BTQuickAddCatalog` registry is a read-only, independently loaded frontend module. Each reviewed record names a legal bank identity, product, consumer/business audience, exact offer key, source-check date, bounded source links and status rationale. Source links must use HTTPS and exact approved bank domains; lookalike or credentialed links are rejected.

The classifier understands:

1. `expired`: explicit, valid offer end date is in the past and an approved promotion link is present.
2. `changed`: reviewed promotion and fee links, bounded changed fields and source check within the preceding 14 days.
3. `stale`: a changed example has aged beyond the 14-day review window; show **Recheck** instead of describing it as current.
4. `verified-active`: only a synthetic/test or future record with the exact product, audience, offer key, both approved official source links, SHA-256 document fingerprints, all three promotion/fee/eligibility checks and a check no older than 24 hours. This means **official documents checked**, not personally eligible.
5. `unverified`: missing/incomplete/untrusted evidence; the default for most shortcuts.

**No production record currently qualifies for verified-active.** Do not manufacture content hashes, applicability claims, fee waivers, customer eligibility or new-account events merely to fill the state.

## Maintaining and extending

Update the catalog via reviewed source changes and peer-reviewed releases. Compare exact offer/product/audience/enrollment channel/expiry, read applicable official promotion and fee disclosures, record a current check time and document hashes only when actually calculated from complete source documents. If either source changes, mark changed or recheck until separately validated. The public bank-offer feed is only a discovery aid, not a catalog verification source.

For complete future imports, continue to follow `AGENTS.md`, `docs/IMPORT_STANDARD.md`, `docs/financial-rules-v1.md` and `docs/NEW_BANK_IMPORT_PLAYBOOK.md`, and run the entry validator. The Quick Add catalog deliberately never auto-generates imports or overwrites enrolled terms.

CI: `node tests/quick-add-catalog.test.js`, full bonus/cloud/UI suites and Chromium/WebKit.


## Automated official-page change monitoring (v3.6.61)

The six-hour bank-feed publisher now runs a read-only source check against the curated Quick Add promotion and fee URLs in data/quick-add-source-manifest.json. scripts/watch-quick-add-sources.py allows only explicitly approved HTTPS bank hosts, rejects untrusted redirects, access challenges, and oversized responses, and fingerprints relevant publicly visible terms text rather than volatile scripts.

A first successful observation creates a baseline: it is NOT verification. Subsequent differences raise a potential-change flag that remains until human review, even when an outage or reversion follows. Failed fetches are unavailable, never unchanged. HTML fingerprint changes are review signals, not evidence of a new reward, fee, or eligibility rule.

Public results live only in data/quick-add-source-monitor.json: offer scope, URL, source status, timestamps, and SHA-256 fingerprints. No customer accounts, transactions, terms archives or tracker details are transmitted. Quick Add fetches this public read-only file and displays recheck notes for changed or unavailable sources. Expired historical offers stay expired. Actual account terms and private data never change.

The monitor runs only on the six-hour schedule or manual workflow dispatch, not on post-deployment workflow_run events, avoiding deployment feedback loops. Manual review of the applicable official promotion and account fee schedule is required before advancing any status; a page hash never establishes personal eligibility.


## Official-source review queue — v3.6.62

The six-hour publisher performs bounded HTTPS checks of the two curated promotion and fee disclosure pairs. Its first **source fingerprint is a baseline, not verification**. Subsequent fingerprint differences remain flagged as **Source changed** until separately reviewed. Failed fetches and access challenges show **Unavailable**, never "unchanged"; checks older than 36 hours show **Overdue**. These source changes are public-only observations, not a newly approved promotion or an account eligibility decision.

Bank Offers displays a compact expandable **Official sources · N need review** panel only when such issues exist. Each entry links to the previously approved bank-owned official URL, not a URL from an untrusted watch snapshot. Selecting a link opens the official page for manual confirmation; it does **not** modify the user's saved bonus, cooldown, fee schedule, historical terms or direct-deposit datapoints.

The release-triggered publisher is permitted to **initialize an empty monitoring snapshot exactly once**, then only normal six-hour scheduled/manual executions perform further checks. This avoids publication loops while making the source watch operational without manual setup. Browser refreshes of this public snapshot are throttled to 15 minutes, including repeated UI renders. Snapshot dates in the future or missing official-source evidence never certify an offer.

All new offer terms still require product-specific promotion and fee evidence before import or eligibility determination.


## Source-change categories — v3.6.64

The scheduled public official-page monitor records separate SHA-256 digests for wording associated with bonus/reward amounts, monthly fees, direct deposits, deadlines, customer eligibility, and closure rules. These **category names are search clues, not extracted or verified rules**. No page text, credentials, customer records or private bonus terms are stored in the public snapshot. When a page's relevant text changes, the review queue shows compact *Possible: …* category hints and links to approved official sources.

A legacy, hash-only baseline cannot retrospectively identify which rules changed. Until a full document hash matches the saved baseline, its category is **Other terms**, rather than an invented fee/deposit change. A matching historical fingerprint can safely add category digests for future comparisons. Outages, redirects, or subsequent page reversion cannot silently clear existing review flags. Changes remain pending until separately reviewed. An official page may change for editorial reasons, so no category observation independently establishes a new bonus, exact fee, closure rule, direct-deposit qualification, or user eligibility.

The application never automatically imports a watched change, modifies an enrolled promotion, or changes the canonical eligibility and fee engines. Browser UI shows only bounded, allowlisted category names from the public snapshot; bank URLs come from the approved catalog, not from remote JSON.
