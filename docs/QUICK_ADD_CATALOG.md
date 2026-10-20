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
