# Federal bonus tax estimate — v3.6.75

## Purpose and boundaries
The Tax tab retains the existing read-only receipt ledger, source reconciliation, Personal/Business filters, prior cycles, and full-year CSV export. It adds a **planning estimate**, not a tax return, tax filing, or a verified IRS balance. Do not represent a calculated result as an IRS bill.

The only automatically supplied tax amounts are completed bank bonuses with an actual received date on or before the user's device date, including retained previous cycles, deduplicated using the existing `taxReceiptRows` policy. No unearned bonus, projected bonus, account opening date, or future-dated receipt enters the estimate. Audience filter changes the visible estimate; full-year CSV export still includes both audiences.

User provides filing status and *other annual ordinary income before standard deduction*, excluding the tracked bonuses. The initial calculator never guesses income, withholding, credits or filing status. It compares progressive federal **ordinary-income** tax before and after including recorded taxable bonuses, across the exact brackets, calculating the additional tax to set aside. A second number shows approximate total federal income tax *before payments*. Only when the user enters projected full-year federal withholding does the UI show a possible federal balance/refund after withholding and separately entered estimated tax payments. Do not conflate incremental tax with net refund or total liability.

The optional advanced controls allow a user to exclude recorded receipts that are not taxable to them, enter actual/custom deduction instead of standard deduction and projected payments. Exclusions cannot exceed total tracked receipts. Partial dollars and all calculations use USD cents. No user income, withholding, exclusions or filing-status inputs are saved, synced, exported or included in cloud backups. Values remain only in app memory during the open page session, and can be cleared.

## Federal tables
This self-contained calculation uses seven progressive ordinary-income rates (10%, 12%, 22%, 24%, 32%, 35%, 37%) and annual limits for Single, Married Filing Jointly, Married Filing Separately, and Head of Household. It supports **tax year 2025 and 2026 only**. Other years explicitly disable numeric estimates rather than recycling old tables. 2026 standard deductions are $16,100 (Single/MFS), $32,200 (MFJ), and $24,150 (HOH). 2025 amounts are $15,750, $31,500 and $23,625.

Authoritative IRS references:
- 2026 ordinary federal tax bracket tables and standard deductions: https://www.irs.gov/irb/2025-45_IRB
- 2025 schedules, standard deductions and bracket method: https://www.irs.gov/filing/federal-income-tax-rates-and-brackets
- Taxable interest generally reportable even if no 1099-INT issued: https://www.irs.gov/taxtopics/tc403

## Deliberately unmodeled
This is an approximate **ordinary federal income tax** estimate and does not model tax-table rounding, state income taxes, local tax, employment FICA, self-employment tax, alternative minimum tax, additional Medicare tax, net investment income tax, qualified dividends, long-term capital gains, refundable or nonrefundable credits, QBI, special deductions (including qualified overtime/tips), itemization eligibility, dependent deductions, age/blindness additions, alternate marginal interactions, capital losses, business-entity classification, backup withholding, IRS prior balances, interest or penalties. It does not assess due dates or quarterly penalties.

Classification of business account bonuses and other bank incentives is not assumed correct merely because a bonus appears in the tracker. Users must reconcile actual 1099-INT/1099-MISC and their accountant/return. Form reporting thresholds do not create nontaxable income.

## Regression requirements
- Published 2025/2026 tables, progressive thresholds and deductions for all filing statuses
- Marginal bracket crossings and excluded receipt behavior
- No numeric estimate without explicit income and filing status; no projected IRS balance without annual withholding
- No use of unsupported future year rates
- Read-only tracker, archive, historical cycles, backup keys and CSV unchanged
- Mobile Chromium/WebKit 320, 375, 390, 430px input navigation and no horizontal overflow
