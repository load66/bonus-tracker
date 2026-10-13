# Bank Bonuses tab — v3.4.37

The discovery tab automatically retrieves RSS metadata from Doctor of Credit, Frequent Miler, and Hustler Money Blog. It does not connect to banks or read, upload, or overwrite saved account history, requirements, enrolled terms, or eligibility calculations. Connecting saved countdowns was explicitly removed from this update's scope.

GitHub Actions checks sources on release and every hour at minute 23 (`23 * * * *`, UTC). Full verification gates publication. Scheduling and deployments can delay delivery; this is not real time. The open tab loads the published snapshot every 15 minutes. Check updates retrieves that snapshot rather than initiating a server job.

Sources are fetched independently, with bounded timeouts and a 2 MB limit each. Frequent Miler uses its bank-bonus tag feed, with its officially published general RSS feed as a fallback. A general feed may contain no bank posts in its recent window. Each source has its own successful-check timestamp and update status. A failure preserves that source's last valid posts and timestamps, while successful sources continue. Missing initialized data for every source prevents publication.

Only bank/credit-union deposit bonus posts are included. Credit-card, brokerage, crypto, IRA, expired-title and roundup posts are excluded. An American Express checking bonus is allowed. Unsafe links, invalid dates, future posts, posts older than 90 days, and explicit expired `Ends MM/DD/YY` title dates are excluded. End-date checks are metadata checks, not authoritative expiration verification.

Nationwide reported requires explicit source wording in the title, category, or a labeled availability phrase in the RSS summary. A major bank name does not imply nationwide availability. Regional source tags identify regional posts. Missing, conflicting, or negated nationwide wording stays unclear. Search, U.S. Bank/Wells Fargo shortcuts, and availability filters operate on automatically fetched data; the shortcuts contain no hardcoded offers.

Matching normalized titles share a card with attributed source links. Amounts, products, location tokens, and dates remain part of the matching key. Different amounts/products remain separate, and conflicting availability becomes unclear. Some duplicates remain when titles differ substantially; distinct offers are not fuzzily merged.

This is a recent-post discovery feed, not an exhaustive active-offer catalog. Recently posted can mean an existing promotion was updated rather than a newly launched bonus. Geography, targeting, promo codes, eligibility and expiry require official-term verification. RSS feeds have finite windows and can omit updates. No missing offers are manually inserted. No full article content is republished. No paid backend, credentials, account-history upload, CORS proxy, or BankRewards.io scraping is used.

Verification: `python3 -B tests/bank-feed.test.py` covers filtering, nationwide evidence/negation/conflicts, safe links, title keys, partial outage, v1 fallback and unchanged successful timestamps. `node tests/bank-feed.test.js` covers v1/v2 intake, URL isolation, grouping, conflicting availability, search and saved-data isolation. Chromium/Firefox/WebKit checks exercise nationwide filtering, major-bank shortcuts, search focus, outage disclosure, stale/error retention, mobile layout and prior account workflows.
