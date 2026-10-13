# Mobile UI cleanup — v3.4.40

This release changes presentation and navigation, not bank rules, enrolled terms, records, histories or calculations.

The Tracker dashboard now belongs to the scrolling content, leaving a compact fixed header. Totals remain visible at the top in a readable two-column mobile layout. Action rows retain their stage, date status and primary action; long explanations are collapsed under Why this action? using the existing per-entry disclosure-state architecture. Unconfirmed date labels remain visible in amber. The urgent count describes urgent work rather than implying the Action Center has no workflow items.

Bank Bonuses keeps search, availability and uncertainty warnings visible. Routine source timestamps, coverage notes and advanced evidence filters are expandable and retain state during rerenders. Copy succeeds without opening a long text block; clipboard denial opens the same read-only text for manual copying. The chat JSON workflow remains unchanged.

Tracker, Datapoints and Terms Archive search inputs preserve focus/cursor across rerenders. Tab navigation starts at the top and announces the active page. Dashboard year controls appear only on Tracker; Tax retains its independent year selector. Datapoint banks and checklist/timer controls use accessible buttons with explicit expanded/checked state.

The shared mobile stylesheet provides readable typography, larger tap targets, safe-area spacing, stacked form fields, visible editor step labels, horizontally scrollable tax years and wrapped archive content. It preserves analyzer scrolling and offline assets. Desktop and mobile renderers continue using the same canonical lifecycle/calculation functions.

Verification includes all existing Node and Python feed suites, asset/cache checks and actual Chromium/Firefox/WebKit tests. Mobile coverage exercises every tab at 320px and 390px, header height, touch targets, field font sizes, navigation reset, consecutive search keystrokes, guidance/filter state, editor cancellation, account storage isolation and existing import/restore/closure behavior. The CI report and deployment status are the release gates; screenshots use synthetic test data only.

Pre-release verification passed all 15 Node suites and 81 checks per engine in Chromium, Firefox and WebKit. WebKit and Chromium mobile screenshots were visually reviewed. A final styling adjustment makes the promo-review action consistent with the dark theme; the latest CI/deployment remains the publication gate.
