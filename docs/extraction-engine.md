# Extraction pipeline, version 3

Specter compiles a user's URL and instructions into a reusable extraction plan.
Models participate in configuration and bounded recovery. Scheduled extraction
uses a deterministic executor and does not invoke models.

## Contracts and dependencies

The public contracts live in `backend/src/extraction/contracts.ts`. The frontend
imports these as types; they contain no browser, database, queue or model code.
Runtime validation lives in `types/extractionPlan.ts`.

An extraction plan contains independently defined contracts:

- `intent`: entity, descriptions and types of fields, identity, filters, scope
  and alert conditions.
- `strategy`: transport, record source, field sources, associations, record
  filters, document context, replayable setup actions, readiness and pagination.

`contractRevision` identifies extraction intent and isolates comparison
baselines. `planRevision` identifies an executable strategy. Recovery preserves
intent; changing selectors alone does not reset the baseline. Editing URL,
instructions or alert rules establishes a new comparison baseline.

The composition root is `server.ts`, assisted by `extraction/composition.ts`.
Application services receive their dependencies. A stage can be replaced with
a fake or another implementation without constructing a real browser, CLI,
database or notification provider.

## Configuration stages

1. **Acquire** a bounded browser observation using an optional saved session.
2. **Interpret** the request using page evidence to establish field meaning,
   source-supported locale, identity and requested scope. Recovery reuses the
   existing intent instead of interpreting it again.
3. **Discover** additional regions or responses through typed inspect, click,
   scroll and wait operations. Only the backend controls the browser. No
   generated JavaScript, arbitrary commands, form submission or detail crawl
   is part of the execution language.
4. **Generate** a strategy for the fixed intent. Conditions, sources and actions
   are checked by the version-3 schema. Necessary preparation actions must be
   stored in `strategy.setup` so validation and routine execution reproduce them.
5. **Execute and validate** using the same core used by scheduled runs.
   Candidate errors return feedback; remaining discovery budget can gather
   additional evidence before another attempt.
6. **Review semantics**, if enabled. The reviewer receives the original request,
   intent, extracted values, provenance and page evidence.
7. **Activate** a validated plan, initial snapshot and scheduling state.
   Database changes and alert deliveries are persisted transactionally.

Each AI stage has a separate port in `extraction/model.ts`. `modelStages.ts`
provides implementations over an interchangeable `IModelProvider`. The current
transports are AGY CLI and Codex CLI. Each task uses an isolated temporary
directory; CLI output is drained, deadlines are enforced and output is parsed
as JSON. Task instructions are separate from untrusted evidence.

## Routine execution

`ExtractionExecutor` owns limits, cancellation, progression, source-record
identities, accepted records, conflicts and completeness. It uses document
sessions rather than depending on Playwright directly.

Document adapters implement HTTP acquisition or a stateful browser. Source
readers implement DOM, JSON-LD and observed JSON responses. A new document
adapter or source reader must satisfy its port and capability checks.

Browser sessions support CSS/accessible-role interactions, an iframe context,
open shadow trees, scrollable containers and bounded response observations.
Response matching uses literal URL fragments, optional HTTP methods and
entity-relative paths. Endpoints are observed during navigation; arbitrary
endpoint replay is not implemented.

DOM scalar sources must be unambiguous. JSON-LD selection recognizes short
Schema.org types and their HTTP/HTTPS URLs. Numeric conversion validates
grouping according to the declared locale and rejects multiple numeric values.
Booleans use explicit value mappings; dates require ISO sources.

Cross-source fields require an explicit association: a required primary key
field and foreign key path. Exactly one foreign entity must match. Association
by list position is never used. Response-based association needs browser
capabilities.

Record filters run after conversion. Coverage tracks source identities even
when records do not pass a filter, allowing pagination through pages with no
matching records. An initially empty result is acceptable only if actual source
records validated the field definitions; an empty page alone cannot establish
valid field sources.

Readiness and termination are declarative conditions. Supported conditions are
existence, absence, visibility, disabled state, an attribute value, a converted
field and an observed response. Condition lists require all conditions.
A page's absence of new identities is not completion. Pagination must provide
positive termination evidence. Timeouts, repeated links and exhausted limits
cannot produce a complete collection.

A single deadline covers browser startup, navigation and extraction. Navigation
and actions have distinct timeouts. Optional screenshot failure does not
invalidate otherwise valid extraction.

## Results, review policy and evidence

Only COMPLETE and EMPTY results become baselines. Integrity, coverage and
semantic review are recorded separately. PARTIAL, INVALID, BLOCKED and
INCONCLUSIVE results do not replace a valid baseline.

Semantic review is configurable globally and per monitor:

- Global defaults: enabled, minimum score 4.
- A monitor may inherit defaults or override `enabled` and `threshold`.
- Disabled means SKIPPED: no reviewer call, score or activation gate.
- Scores below the threshold reject the candidate; scores 4-6 at the default
  threshold are accepted with WARNING; higher scores receive PASSED.
- An unavailable reviewer or invalid reviewer output yields ERROR and a warning,
  without blocking deterministic acceptance.
- The score is a rubric-based opinion, not a probability or proof of correctness.
- Policy changes apply on the next configuration/recovery, not through periodic
  model calls. Deterministic checks cannot be disabled.

Provenance records field, source, original/converted value and entity identity.
Persisted evidence is capped and redacted. Session state and request headers are
never added to model inputs or provenance. Detailed evidence expires after
seven days by default; snapshots, quality and review summaries remain available.
Stage traces record duration, status and reason codes. Rejected candidates
retain review information in their failed configuration report.

Monitor pauses/edits and a lost execution lease invalidate stale work.
Accepted snapshot commits lock and check the monitor before persisting changes.
Persistent readiness or progression failures can enter bounded recovery;
access blocks and transient navigation errors retain their distinct handling.
Recovery failure retains the previous plan and baseline.

## Comparison and delivery

Collections are compared by stable identity. Diffs identify added, modified and
removed entities and changed fields. Relative conditions use the same entity's
previous values. Initial baselines do not notify.

Snapshot, optional job update and per-channel delivery records are inserted in
one PostgreSQL transaction. The outbox worker claims deliveries with row locks,
a claim token and a work-lease expiry. Successful channels are not retried
when another channel fails. Failures receive exponential backoff and a bounded
attempt count; FAILED rows remain for diagnostics.

Delivery attempts have a configurable timeout and retry ceiling, including expired claims after worker crashes. Resend receives the stable delivery ID as an idempotency key.

Delivery is at least once. A crash after external acceptance but before the
database acknowledgement can duplicate a message. Webhooks carry the stable
delivery ID so receivers can deduplicate. Credentials are resolved at send time
and are not copied into the outbox payload.

## Settings and deployment

Defaults and validation are in `config/env.ts`; examples and the deployment
environment generator expose all new settings. Candidate-plan retries use
COMPILATION_MAX_ATTEMPTS. BullMQ retries for transient compilation failures use
COMPILATION_QUEUE_MAX_ATTEMPTS.

Stop and drain previous workers before applying migration 0009 and deploying
the new backend/frontend together. This is a breaking execution-contract change:
there is no version-2 adapter or executor. Migration 0009 clears old plans and
scheduler references, queues previously active/healing monitors for compilation
and preserves paused/failed status and historical snapshots. Startup reconciles
Redis schedules and queues pending compilation. Paused monitors compile when
resumed.

The deployment workflow remains responsible for production deployment; local
development does not apply migrations to a remote production database.

## Validation and evaluation

Run `npm run build`, `npm run lint`, `npm test` in the backend and frontend
typecheck/build. Tests include real Chromium against isolated local fixtures
and PostgreSQL-compatible PGlite for migration and transaction checks.

`npm run evaluate:extraction` runs the versioned golden corpus and reports field
accuracy, exact entity matches, quality classification, false alerts, duration
and model calls. This corpus evaluates deterministic extraction behavior; it
does not establish live-site coverage or semantic-model accuracy. Extend it
with sanitized production failures and separately assess live compiler/provider
quality before making broad coverage claims.

### Shared vocabulary and maintenance

`backend/src/extraction/constants.ts` owns extraction identifiers shared by the domain, runtime schemas and frontend. Domain contracts derive their types from these constants; `types/enums.ts` reexports the identifiers used by application services. Keep framework event names and human-readable messages local rather than treating them as domain identifiers.

`extraction/prompts.ts` owns trusted model instructions; `modelStages.ts` supplies untrusted evidence separately and parses stage responses. Discovery and setup share the same action schema. `comparison.ts` owns payload record interpretation and identity-aligned comparison; the former `utils/planExtraction.ts` facade has been removed.

The executor uses a single quality acceptance rule and a single pagination progress predicate. Timeout, origin, identity and completion checks remain intentional integrity boundaries. They must not be removed as cosmetic cleanup.

Live readiness/end checks run before capturing the HTML used for extraction. This prevents a newly observed terminal marker from validating an older snapshot that omits the final virtualized records. A deterministic regression test covers this ordering.
Static CSS and response conditions are evaluated from the captured snapshot instead of reading live browser state a second time. Visibility and role conditions still use the browser; discovery waits retain their live checks.
