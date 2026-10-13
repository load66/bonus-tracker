# Bank Bonuses tab — v3.4.35

The separate discovery tab displays bank and credit-union deposit-bonus RSS metadata from Doctor of Credit. It does not connect to financial accounts or overwrite saved account data, requirements, enrolled terms, or eligibility calculations.

GitHub Actions checks the RSS source on release and on a six-hour schedule (`23 */6 * * *`, UTC). A verified Pages deployment publishes the generated JSON. GitHub scheduling and full verification can delay delivery; this is not a real-time guarantee. While the tab is open it reloads the published snapshot every 15 minutes. Check updates reloads that snapshot, not the original source.

The collector includes RSS titles, links, source identity, and publication dates only. It rejects brokerage, crypto, credit-card, IRA, expired-title, roundup and unrelated posts. It also rejects invalid links/dates and future-dated posts. The result is a conservative recent-post feed, **not a complete active-offer catalog**. Ambiguous offers can be excluded and missed expiration changes are possible. All items require checking official terms before applying.

Feed failures fall back to the last published snapshot without changing its checked timestamp. The UI warns after 24 hours and retains the current loaded results on network failure. If neither the RSS feed nor the published snapshot is valid, the build fails rather than claiming a fresh empty feed.

No paid service, credentials, bank-history upload, third-party CORS proxy, or BankRewards.io scraping is used. Provider permission would be needed for broader content ingestion or additional restricted sources. No manually maintained bank offer list exists.

Verification: `python3 tests/bank-feed.test.py`, `node tests/bank-feed.test.js`, existing regression suites, and the three-engine browser workflow. Browser fixtures verify escaped titles, stale/offline handling, navigation, account isolation, and mobile layout separately from the scheduled live source collection.
