# Bonus Tracker maintenance and imports

Before generating, changing or reviewing a bonus import, read `docs/IMPORT_STANDARD.md` and `docs/financial-rules-v1.md` from the current repository state. Do not rely on conversation memory or old sample files for the schema. The generation standard is normative; the deployed importer is authoritative for supported fields and versions.

For every new offer import, verify the applicable official promotion and fee schedule, preserve exact source evidence and the enrolled offer version, and run `node scripts/validate-entry.cjs /absolute/path/ENTRY.json`. Do not finalize a failing or materially incomplete import. Keep checking and companion fees separate, preserve ALL/ANY conditions and recurring periods, and never infer zero fees, qualifying activity or eligibility from missing evidence.

Keep eligibility, closure and date decisions in the canonical engines. AI explains validated results and identifies gaps; it does not override them. Preserve the single active rTracker renderer, per-entry section state, normal replacement review and transactional persistence. Do not rewrite existing financial records from new public terms or automatically upgrade legacy records.

When editing schema or rules, test financial-rules and structured-import fixtures plus the affected existing suites and three-browser release checks. Update the generation document, rule contract and discoverable import skill together; do not release mismatched schema instructions.
