# Mobile UI cleanup — v3.4.40

This release changes presentation and navigation, not bank rules, enrolled terms, records, histories or calculations.

The Tracker dashboard now belongs to the scrolling content, leaving a compact fixed header. Totals remain visible at the top in a readable two-column mobile layout. Action rows retain their stage, date status and primary action; long explanations are collapsed under Why this action? using the existing per-entry disclosure-state architecture. Unconfirmed date labels remain visible in amber. The urgent count describes urgent work rather than implying the Action Center has no workflow items.

Bank Bonuses keeps search, availability and uncertainty warnings visible. Routine source timestamps, coverage notes and advanced evidence filters are expandable and retain state during rerenders. Copy succeeds without opening a long text block; clipboard denial opens the same read-only text for manual copying. The chat JSON workflow remains unchanged.

Tracker, Datapoints and Terms Archive search inputs preserve focus/cursor across rerenders. Tab navigation starts at the top and announces the active page. Dashboard year controls appear only on Tracker; Tax retains its independent year selector. Datapoint banks and checklist/timer controls use accessible buttons with explicit expanded/checked state.

The shared mobile stylesheet provides readable typography, larger tap targets, safe-area spacing, stacked form fields, visible editor step labels, horizontally scrollable tax years and wrapped archive content. It preserves analyzer scrolling and offline assets. Desktop and mobile renderers continue using the same canonical lifecycle/calculation functions.

Verification includes all existing Node and Python feed suites, asset/cache checks and actual Chromium/Firefox/WebKit tests. Mobile coverage exercises every tab at 320px and 390px, header height, touch targets, field font sizes, navigation reset, consecutive search keystrokes, guidance/filter state, editor cancellation, account storage isolation and existing import/restore/closure behavior. The CI report and deployment status are the release gates; screenshots use synthetic test data only.

Pre-release verification passed all 15 Node suites and 81 checks per engine in Chromium, Firefox and WebKit. WebKit and Chromium mobile screenshots were visually reviewed. A final styling adjustment makes the promo-review action consistent with the dark theme; the latest CI/deployment remains the publication gate.

The final offline run exposed an external Google Fonts download failure in Firefox. External font loading was removed in favor of native system fonts, and mobile pinch zoom is enabled. Offline verification continues to require no uncaught application errors.

## v3.4.41 compact bank offers

Discovery cards default to the source headline and one source link. Repeated badges, dates, copy controls and evidence panels are available only when “Show offer review tools” is enabled in More filters. Additional source links remain available in that mode. No bonus amount is inferred from an ambiguous headline. Outage and stale-feed warnings remain visible; stored accounts and calculation rules are unchanged. Browser checks cover compact card structure, opting into tools, returning to compact view, and all existing review/filter flows. Each engine saves an offers screenshot with synthetic data.

## v3.4.42 Ask AI on Tracker

Offer review controls, AI metadata panels and advanced evidence filters are removed from the Bank Bonuses interface. Source health warnings, search, availability filtering, refresh and compact cards remain. Discovery publishing no longer invokes paid evidence extraction.

Expanded accounts and Bank Actions expose Ask AI. The modal uses owner sign-in, a question and optional suggested prompts. It sends only the selected bonus's allowed saved facts after the user presses Ask AI, displays cited facts and missing information, and never writes account records. Native mobile forms, focus trapping, dismissal, session disconnect, stale-result checks and rate-limit handling are covered with synthetic browser fixtures. Provider answers are explanations of saved facts rather than freshly verified terms or replacement calculations.

## v3.4.43 richer JSON evidence in Ask AI

Nine prefilled questions cover progress, payout, closure, monthly fees, fee waivers, direct deposits, early-close charges, companion accounts and repeat eligibility. Context now includes supported requirement/funding wording, complete waiver fields, closure evidence, canonical normalized eligibility rules and conditional states, custom reminders, and source verification metadata. Private notes, record IDs, phone fields and other accounts remain excluded.

Structured rules and canonical dates take priority over raw terms. The adapter reserves room for a 500-character question within the API input limit, handles JSON escaping and Unicode boundaries, and explicitly marks shortened fields or terms. Oversized inputs cannot silently turn omitted evidence into assumed facts. Import/save/context tests verify a strict schemaVersion 2 payload retains fees, waivers, recurring wording, timers, evidence, and other accounts. Browser fixtures exercise all prefilled questions and existing AI, lifecycle, persistence and offline flows.

## v3.4.44 readable tracker cards

Long bank names wrap. Supporting text spans the card below its bank/status/bonus header, with separate countdown and due-date metadata for active requirement timers. Saved requirement and payout wording is preserved rather than shortened with ellipses. No lifecycle calculations or account storage formats change. Browser fixtures check long recurring requirements at 320, 390 and 1024 pixels and verify saved records are unchanged.

## v3.4.45 compact Action Center

Two-column mobile shortcut tiles show the square bank icon, bank name, bonus and one timing/status indicator. Compact buttons retain the canonical prefilled action handlers and 44px touch targets. The tile body opens, scrolls to and focuses its full account card. Date evidence and action explanations live in the expanded account rather than repeating in the shortcuts; their existing per-entry disclosure state is preserved. Desktop uses up to four columns. No storage or calculation rules change.

## v3.4.47 actionable AI explanations

Answers include a canonical next step, expandable supporting saved facts and explicit unresolved information. Closure questions get a tracker-derived Ready, Wait, Needs verification or Already closed verdict; early-close fee questions do not imply permission. Qualifying activity and the canonical next action are included in bounded AI context. Missing original terms and shortened evidence are visible. Malformed output is rejected before rendering. No additional background calls, automatic changes to entries or replacement calculations are introduced. Browser verification uses synthetic AI responses, not a paid live-provider conversation.


## v3.4.48 login-free bonus questions

Common questions return labeled saved-rule answers on the device without network calls. Other questions and Ask AI for more send one bounded account context to the isolated public bonus-question route, with no cookies, credentials or Supabase sign-in. Failed or rate-limited AI calls do not disable local answers. Browser fixtures verify the absent login fields, local-versus-remote behavior, malformed-answer rejection and preserved records.
