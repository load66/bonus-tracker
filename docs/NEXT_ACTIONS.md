# Action Center task projection

From v3.4.72, the Action Center leads with a concrete saved activity instead of a lifecycle stage. This is a read-only presentation and navigation layer over the existing lifecycle, financial validation, eligibility and closure engines. It does not add import fields or change financial-rule meaning.

- Valid structured requirements supply typed amounts, transaction counts and recurrence periods. Never mix fee-waiver conditions into bonus qualification or calculate an observed balance/deposit shortfall from required amounts.
- Existing checklist and timer completion is user-recorded activity. An exact completed one-time task may leave the task queue; recurring periods remain unresolved after a single check. Whole-offer requirement, payout and closure milestones remain separate confirmations.
- Legacy records use their unfinished task/timer text and explicit funding fields. Completed funding timers are not offered again from fallback fields. When the activity is unknown, request review rather than inventing a funding or direct-deposit requirement.
- Pending tasks with saved dates come first; remaining activities use a stable enrollment/funding/deposit/transaction/balance order. This is a review order, not an assertion of contractual dependencies.
- Task dates reuse canonical date-context checks and saved timers. Unknown funding deadlines and business/statement units remain unconfirmed; no calendar-day approximation is introduced.
- Concrete activity actions open Lifecycle & Tasks and the saved task details. They do not mark tasks done or open whole-offer completion implicitly. A separate Confirm all requirements action re-evaluates the canonical milestone decision. Payout/closure actions continue through their existing confirmations.
- Invalid financial packages lead to rule verification. Closed accounts require eligibility review; closure remains blocked when canonical checks require review. Day-refresh and per-account disclosure state remain unchanged.

Verification: `tests/specific-actions.test.js`, `tests/next-actions.test.js`, `tests/smart-attention.test.js` and three-browser end-to-end coverage. All fixtures are synthetic.

## Shared requirement date projection (v3.6.50)

`btRequirementDeadlineContext` supplies the exact requirement date to `reqDeadline`, lifecycle urgency, action guidance, account headers, requirement rows and derived timers. Structured timing takes precedence over legacy `reqDays`; an individual activity keeps its own clock and the account summary shows the earliest calculable clock. This does not change rule validation or certify that all requirements have known deadlines.

Calendar-day clocks use only the specified recorded opening, enrollment, requirements-completed or bonus-received event. Enrollment never falls back to opening, and conflicting saved enrollment dates remain unresolved. Missing or invalid dates, unsupported calendars, untimed structured requirements and invalid durations never inherit a legacy day count. Manual reminders remain separate saved reminders and are not rewritten as offer deadlines. Existing financial validation continues to gate milestone actions; no financial record, rule schema, source evidence or storage key changes.

Verification: `tests/requirement-deadlines.test.js` and both browser engines cover conflicting legacy days, rendered deadline agreement and no writes; unit coverage also checks missing anchors, enrollment conflicts, unsupported calendars, multiple clocks and legacy compatibility.


## Dashboard queues and add tools (v3.6.51)

The presentation groups existing canonical suggestions into Needs you, Waiting and Opportunities. Only confirmed future payout or hold dates are passive waits; missing, invalid, unconfirmed or reached dates stay in review. Current-offer opportunities remain separate from required task counts and open bank-filtered offer discovery without changing eligibility. Verified future cooldowns within 60 days use the existing Eligible soon row once. Every group retains independent card selection, details, source-specific deposit research and the applicable canonical action. No new financial status or persisted state is introduced.

Quick Add and the inline terms panel have visible close controls; closing returns focus to Add. Terms input changes remain an in-memory draft and closing/reopening does not clear it. The full source-review wizard retains all analysis, evidence, learning, tier and apply controls, with a dark surface and header close button. Analysis and financial rules are unchanged.

Verification: `tests/dashboard-queue.test.js`, `tests/tracker-tools.test.js`, full existing suites and Chromium/WebKit mobile queue/tool tests at 320, 375, 390 and 430 pixels. All financial fixtures are synthetic.


## Dashboard space and Add controls (v3.6.52)

The earnings summary retains its original Tax-backed data and all twelve month buttons. A shorter chart reduces unused height; every existing 44px touch-target assertion remains in place. Add bonus uses a reserved bar outside the scrollable account area, with the same menu and actions. The account scroller ends above the bar rather than relying on bottom padding to protect only the last row. Undo sits above Add in the same layout, and focused Quick Add/promo-review forms keep both the summary and Add bar hidden. No business-rule, financial-record or persistent-key changes.

Chromium/WebKit checks cover reserved geometry at 320/375/390/430px and desktop, compact unselected summaries, and actual hit targets for selected action, waiting and opportunity cards. Existing month, navigation, Undo, add/import and record-preservation workflows remain release gates.
