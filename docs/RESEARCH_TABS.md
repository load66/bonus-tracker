# Community reports and saved terms

Datapoints is a public, curated research snapshot plus private user notes. It never determines financial eligibility, qualifying activity, closure readiness or dates. T&C Archive is the read-only view of enrolled offer records and previous cycles. New public offers never replace enrolled terms.

## Catalog provenance

`community-reports.js` contains selected reports checked on October 15, 2026. Each record has a stable ID, bank, recipient product/account type where established, activity, explicit outcome, source URL, evidence kind and checked date. `eventDate` describes a reported transaction/payment; `reportedAt` is only populated with an established publication date. Thread dates are separate and never substituted for comment dates. Missing dates display “Not provided.” Master-list summaries are historical index evidence, not dated firsthand reports or success-rate estimates.

The September Reddit threads contain explicit 2026 timelines. Where a commenter gives month/day within that thread, the catalog uses the thread year. The October 6 and 13 threads exposed no usable reports. Doctor of Credit comments were inconsistently retrievable; the catalog does not infer their outcomes from incomplete snippets. Searches also covered FlyerTalk and Bogleheads; no sufficiently current, applicable firsthand report from those sources was added. Coverage is intentionally described as selected, not exhaustive or live.

The source-index summaries use the Doctor of Credit direct-deposit list, sections Chase, PNC, Regions, BMO, Simmons, CommunityAmerica, TD and Fifth Third. Original Reddit permalinks are supplied when retrieved; otherwise the source thread and specific event timeline identify the report. Questions, pending payments and transaction labels alone are not treated as bonus success. A shared thread containing a repost is not counted as a new independent result.

## Existing data

No persistent keys were added. Existing community records remain stored and backed up. Exact unchanged built-in defaults are excluded from the report view; third-party offer summaries appear under Older offer references in T&C Archive with a warning that they are not enrolled terms. Edited defaults and private notes remain visible. The public catalog stays in versioned application assets instead of reseeding user storage at startup. Unknown metadata is retained by normalization and backup/restore.

Removing a report only removes that report. `deleteDPBankGroup` now removes saved reports only, preserving accounts, requirements and terms. No bank deletion control is displayed in Datapoints. Public catalog records are read-only. Existing backup key compatibility is retained.

## Mobile and accessibility

Single-column bank accordions, wrapped text, minimum 44px controls, result labels with text, labeled filters and visible focus rings. The report editor has a fixed header/footer and separately scrolling body. The archive shows all retained cycles and supports full-text search across original saved evidence. Links and text are escaped; non-HTTP source links are not rendered.

Validation: `tests/research-tabs.test.js` covers catalog provenance, unknown dates, filters, personal/business identity, read-only rendering, legacy routing, metadata round-trip, preserved cycles, unsafe content and report-only deletion. Browser coverage exercises these views at 320, 390 and 430px and the actual report editor.
