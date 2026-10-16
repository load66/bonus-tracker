# Verified bonus-product linking and candidate progress

## Why this exists

A bank promotion may require a checking account **and** a share-savings or
membership account. SimpleFIN returns financial accounts, but provider account
names and balances do not establish which product satisfies each promotion
requirement. BonusTracker must never guess.

## Account matching

1. Open **Tracker → Bank Activity Review → Manage bonus-account links**.
2. Choose the exact **open** bonus campaign for each real linked account.
3. Choose **Bonus product (verified terms)** only from the validated, structured
   list of products in the official promotion rule package. Selecting a checking
   or savings product is an explicit user assignment.
4. Save account matches. The backend saves optional `productId` alongside
   `entryId`, `bank`, and `opened`; legacy matches remain valid with no product.
5. If terms are unverified or the product choice is ambiguous, leave the account
   unassigned and review the requirement manually.

## What can appear in candidate progress

- A single exact product must be assigned to one eligible bank account.
- Only **posted**, correct-direction, date-scoped deposit observations from
  that account can appear as direct-deposit candidates.
- Transactions from a separately linked membership savings account must not
  count toward the checking direct-deposit requirement.
- A deposit counts as a **reviewed candidate** only if the owner explicitly
  reviews that exact transaction and attaches it to a structured requirement.
- Candidate amounts use exact cents, with no floating-point rounding.
- Missing accounts, duplicate product assignments, unknown product IDs,
  unsupported currencies, and invalid rules fail closed to manual review.

## Not automatically established

Candidate deposits are **not proof** of qualifying employer payroll or
government-benefit direct deposit. The tool does not independently verify
ACH source codes, bank-specific acceptable sources, qualifying payout
windows, recurring periods, membership savings minimums, monthly fees or
closure constraints.

Never mark `reqMet`, `bonusRecd`, account closure, cooldown completion or
another tracker lifecycle milestone based solely on candidate evidence.
The official verified terms and explicit tracker confirmation are authoritative.

## Backward compatibility and privacy

- Existing account-to-bonus mappings remain valid without product identities.
- Connected-bank credentials, transaction IDs, and encrypted review receipts
  stay owner-private on the backend.
- Existing bonus tracker history, backups, lifecycle rules, eligibility and
  account opening dates are unchanged.
- Changing a bonus cycle must never reattach old evidence automatically.
- Preserving the current mobile layout and cloud recovery behavior is a release
  requirement, not optional cosmetic work.

## Release verification

The backend must first pass its full CI and be healthy on Railway. Frontend
unit tests cover checking/savings isolation, duplicate product assignments,
source-verification failures and no automatic requirements-met decisions.
Chromium, Firefox and WebKit browser tests cover selecting the correct verified
product, saving the mapping, reviewing bank evidence and retaining existing
navigation and connection management. Only merge and deploy after these checks.
