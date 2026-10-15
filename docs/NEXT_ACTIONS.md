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
