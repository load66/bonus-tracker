# Agent rules

This file is the single source of truth for every coding agent working in this repository (Claude Code, ChatGPT/Codex, others). Agent-specific files such as `CLAUDE.md` only point here and add tool-specific notes; they never add or relax rules.

## Multi-agent coordination

- Only one agent works on this repository at a time.
- Before starting, read the **Active agent** line in `docs/AUDIT_PROGRESS.md`. If it names another agent, stop and ask the user instead of starting work.
- When starting, set **Active agent** to your agent name, the release and your branch, and commit that on your branch with your first change.
- Use branch prefixes `claude/` (Claude Code) or `codex/` (ChatGPT/Codex). Never push work to another agent's branch.
- When done, update the **Handoff** section (deployed versions, in progress, exact next step) and set `Active agent: none`, bundled with your final change on the release branch. No standalone checkpoint commits to `main`.
- `docs/AUDIT_PROGRESS.md` is public-safe: versions, commit hashes, PR links, sanitized issue titles and test status only. Never account names, numbers, amounts, transactions, secrets, logs, or details of unfixed security issues (write "Security review pending").
- The Finances backend lives in `load66/Trading-Journal-AI`; its `AGENTS.md` carries the same coordination rules plus backend data-safety rules.

## Finances data safety

- Never delete, reset or overwrite real financial history; migrations are additive and recoverable. Manual user decisions always override automation.
- Never call real provider APIs in tests (mock SimpleFIN, Plaid and Groq). Never log tokens or private transactions.
- Every frontend release bumps the app version and the service-worker cache, passes the test suites, and is verified on GitHub Pages after deploy.

# Bonus Tracker maintenance and imports

Before generating, changing or reviewing a bonus import, read `docs/IMPORT_STANDARD.md` and `docs/financial-rules-v1.md` from the current repository state. Do not rely on conversation memory or old sample files for the schema. The generation standard is normative; the deployed importer is authoritative for supported fields and versions.

For every new offer import, verify the applicable official promotion and fee schedule, preserve exact source evidence and the enrolled offer version, and run `node scripts/validate-entry.cjs /absolute/path/ENTRY.json`. Do not finalize a failing or materially incomplete import. Keep checking and companion fees separate, preserve ALL/ANY conditions and recurring periods, and never infer zero fees, qualifying activity or eligibility from missing evidence.

Keep eligibility, closure and date decisions in the canonical engines. AI explains validated results and identifies gaps; it does not override them. Preserve the single active rTracker renderer, per-entry section state, normal replacement review and transactional persistence. Do not rewrite existing financial records from new public terms or automatically upgrade legacy records.

When editing schema or rules, test financial-rules and structured-import fixtures plus the affected existing suites and three-browser release checks. Update the generation document, rule contract and discoverable import skill together; do not release mismatched schema instructions.

Cloud recovery must preserve exact stored values, verify SHA-256/readback, keep per-owner immutable versions with verified bounded retention (three distinct states plus current checkpoint, maximum four after cleanup) and never export authentication or R2 credentials. Extend backend backup allowlists and restore tests whenever adding a persistent tracker key. Never claim a phone's records are protected before its first verified upload. Scheduled checkpoints protect already uploaded state; offline phone changes are not available to a server. Keep safety snapshots and transactional rollback before destructive restore/reset operations.

Never mark automatic backup ON before a verified first upload, or show current-data protection while changes are pending. Retention deletes only superseded owner recovery objects after replacement and retained-state readback; preserve screenshots, other owners and safety snapshots during restore/reset. Keep popup success tied to verified receipts, and downloaded-file history separate from cloud protection.

Tracker visibility uses isArchivedTrackerEntry: only closed accounts identified as non-repeatable by the canonical lifecycle helper leave the Tracker. Keep open non-repeatable accounts, repeatable cooldowns and unresolved eligibility visible. Archived accounts must remain searchable and manageable from the header menu using the same card renderer, without copying, deleting or rewriting financial records. Preserve archived entries in tax, datapoints, terms, downloaded backups and cloud recovery. Undoing closure or correcting eligibility must automatically restore Tracker visibility.

Bank offer discovery may read tracker identity, lifecycle and canonical review dates for ranking only. Never mutate accounts from feed changes or claim new-offer eligibility from a cooldown date. Match bank family and personal/business audience conservatively; investment offers require separate product review. Source-reported geography can demote explicit out-of-state posts, but missing availability remains unknown and visible. Use Missouri as the default discovery view area with an editable state selector; view filters do not store financial records.

Official availability verification must retain exact offer fingerprint, reward/product/deadline applicability, original geographic quotes, document hash, source URL and per-record freshness/expiry. Never treat reported geography, a bank footprint, nationwide ATMs, absent restrictions or a reached tracker date as personal eligibility. Priority bodies contain only bounded public catalog URLs; no private tracker data. New official domains require identity verification and backend/frontend trust alignment. Failed checks and unrecognized institutions remain unconfirmed.
