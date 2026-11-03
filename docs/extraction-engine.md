# Validated extraction engine

A monitor compiles user instructions into a versioned extraction plan. The same deterministic executor validates compilation and performs scheduled runs. No LLM is called during routine extraction. Plan validation is centralized in `extractionPlanSchema`.

Supported sources are scoped DOM selectors and entity-relative JSON-LD paths. Requested fields are required by default. Numeric fields declare their locale; boolean fields declare their observed value mappings. Date fields accept ISO dates and timestamps with explicit timezones. Other date formats can be extracted as strings. Volatile-text normalization is opt-in per field.

Collections require stable identity fields. Page scope is the default. Complete collection scope requires pagination plus positive completion evidence. Links, load-more clicks, and scrolling are bounded. A limit, missing progress, or unknown termination cannot produce a complete result. Detail-page traversal, form submission, login automation, and arbitrary generated code are not supported.

## Outcomes

- COMPLETE: requested records and coverage validated.
- EMPTY: readiness and explicit empty-state evidence validated.
- PARTIAL: collection completion could not be established within limits.
- INVALID: fields or identities failed validation.
- BLOCKED: an access barrier prevented collection.
- INCONCLUSIVE: insufficient evidence to establish completeness or emptiness.

Only COMPLETE and EMPTY runs become comparison baselines. Partial data may be inspected but never replaces the latest valid baseline. An initially empty collection cannot be activated without validating field sources. Conditions are evaluated within a changed entity, and relative conditions use that entity's previous values. Initial baselines do not notify.

## Operations

All runtime budgets are validated environment variables documented in `.env.example`. Extraction and compilation workers share Redis browser slots and a per-monitor renewable lease. Healing uses a persistent attempt count within a time window, independent from consecutive extraction failures. Schema changes that alter extraction intent require user review during recovery.

Stop and drain old workers before deployment. Apply Drizzle migrations 0007 and 0008, then start the new workers. Migration 0007 invalidates old plans and clears scheduler references. Previously active/healing monitors are queued for recompilation on startup. Paused and failed monitors remain inactive. Historical runs remain readable; contract revisions isolate comparison baselines. There is no legacy plan executor.

The historical user-ID conversion migration now casts valid UUID strings explicitly. The timezone migration is idempotent to tolerate the column being present when migration history is incomplete. The application database contained two `default-user` monitor rows; they were reassigned to the existing owner UUID before conversion. A pre-migration PostgreSQL dump and the previous static frontend export are retained under `/home/ubuntu/backups/specter/`. The full migration chain was validated against an empty database and the upgrade migrations were applied to the VPS database.

## Verification

Unit tests use mocked compiler and notification providers. Interactive extraction tests use a real Chromium browser against an isolated local HTTP fixture; the fixture network exception exists only in the test. The AGY provider was invoked on the VPS with a sanitized public-page fixture and produced a validated extraction plan. A public product page also produced a candidate plan, while repeated live validation encountered provider timeouts and an HTTP 500 from the site-access cascade. This confirms compiler operation and records a practical limit: an individual website can make end-to-end acceptance inconclusive even when compilation succeeds.
