# Extraction pipeline

Specter turns a URL and the user's original request into a declarative extraction
plan. A bounded configurator investigates the document with backend tools. Routine
runs use the same deterministic executor used to validate configuration and do not
invoke models. There are no host-specific extraction rules or prompts.

## Contracts and ownership

There is one strict plan shape, with no version discriminator or compatibility adapters.
Plans contain `intent` (meaning, fields, identity, filters, scope and alerts) and
`strategy` (transport, sources, associations, setup, readiness and pagination).
The original request remains authoritative during initial configuration. Intent
may be refined from evidence, but requested fields or scope must not be dropped to
make validation succeed. Recovery receives a fixed approved intent; strategy
changes must preserve it exactly. Editing the user's request establishes a new
contract revision and comparison baseline.

`IModelProvider` is the vendor-independent transport. `configurationSchemas.ts` derives model guidance from the domain plan schema; JSON
Schema references prevent duplicating nested contracts. `ConfigurationModel` exposes
`decide` and `review`; API and CLI providers implement the same structured-output
contract. Decisions request a typed tool or propose a complete extraction plan.
The prior interpreter/discovery/generator orchestration has been removed.

Document acquisition accepts an optional strategy and does not require a fabricated
empty extraction plan. Session lifecycle/replay, progress policy, semantic review
and evidence budgeting have separate owners. Protocol identifiers are centralized
in `configurationConstants.ts`. Document ports separate browser/HTTP acquisition from extraction. Business
services retain lifecycle, scheduling, transactions and notification ownership.

## Configuration and recovery

1. Acquire a bounded observation, optionally with an authenticated saved session.
2. Ask the configurator for a tool request or candidate. A simple document needs
   only one configuration decision and one final semantic review.
3. Execute tools in the backend and return bounded, redacted observations with
   operation IDs, context, sample counts, truncation and errors.
4. Validate candidate schemas and capabilities. Close investigation, release its
   browser slot, and run the deterministic executor in a fresh session with the
   same URL and saved authentication. The candidate must replay needed actions.
5. Return rejected execution feedback for repair within the original budget.
   Reopening investigation replays previously successful interactions.
6. Review the accepted extraction using its actual execution snapshot, values,
   provenance and coverage, together with the original request and proposed intent.
7. Activate only after applicable acceptance checks. Commit baseline, monitor
   changes and notification deliveries through the existing transactional service.

Tools inspect a region, query CSS selectors (count, values, attributes), inspect
JSON-LD, query observed JSON responses by literal URL fragment, and perform typed
click/scroll/wait/inspect actions. There is no generated JavaScript, shell,
arbitrary endpoint replay, form submission, login or unrestricted navigation.
Capability limitations produce diagnostics rather than site-specific workarounds.
HTTP observations do not acquire browser interaction capabilities.

The backend retains a bounded history of observations, operations and feedback.
Model packets prioritize the original request and fixed recovery contract over
page evidence. Oversized authoritative inputs fail rather than silently truncate
the user's request. Sanitization strips executable HTML and tracking attributes.
JSON-LD is supplied as passive data; it is not projected into synthetic DOM meta
tags that would create selectors absent from the execution document.

A single compilation deadline covers observation, tools, decisions, validation
and review. `CONFIGURATION_REVIEW_RESERVE_MS` reserves time inside that deadline.
`CONFIGURATION_MAX_DECISIONS` defaults to 6; invalid output consumes a decision.
`COMPILATION_MAX_ATTEMPTS` defaults to 3 and counts candidates, including invalid
candidate plans. Only one final semantic review runs. Identical rejected plans
are not executed twice. Repeated identical tool operations without state progress
stop after two repeats. There is no hidden expensive fallback or additional retry
loop. Existing bounded provider/queue retries apply only to transient failures.

`CONFIGURATION_MAX_INPUT_CHARS` defaults to 250000 and includes model instructions,
schema and evidence packet. Evidence is truncated explicitly before authoritative
inputs. `COMPILER_MAX_OUTPUT_CHARS` defaults to 30000; API providers also enforce
`COMPILER_MAX_OUTPUT_TOKENS` (8192). CLI output files are size-checked and model
calls receive cancellation/deadline signals. CLI internal usage is not measurable
through the current provider interface; output limits are not a monetary cap.

## Execution and integrity

The executor owns limits, cancellation, source identities, accepted records,
conflicts and completeness. DOM, JSON-LD and observed JSON use source readers.
Browser adapters support scoped documents, open shadow trees, bounded response
observations and replayable setup. Browser capacity is shared through Redis,
including configuration and API probes; resources close in all exit paths.

Scalar DOM fields must be unambiguous. Conversion uses declared locale or explicit
boolean mappings. Associations require exactly one foreign entity matching an
explicit key; list position is never an association. Collections compare stable
identities, independent of record order.

Readiness and pagination completion require declarative evidence. No progress,
repeated URLs, timeouts or exhausted limits cannot establish a complete collection.
An empty initial page cannot validate field definitions unless source records
validated those definitions. Static conditions use the same snapshot as extracted
records; live browser checks precede snapshot capture.

Only COMPLETE and EMPTY results can become baselines. PARTIAL, INVALID, BLOCKED
and INCONCLUSIVE results preserve the previous accepted baseline. Access blocks
and transient navigation failures are distinct from selector/readiness failures;
transient failures stay inside one bounded run, and only ready pages with
structural extraction evidence can start automatic recovery. Recovery failure
does not replace the approved plan or baseline.

## Semantic acceptance and delivery

`SEMANTIC_REVIEW_ENABLED` defaults to true. With review enabled, a rejected,
unavailable or invalid review prevents activation. Transient provider failures
remain eligible for the existing bounded queue retry. The score must reach
`SEMANTIC_REVIEW_THRESHOLD` (default 4); accepted scores below 7 carry WARNING.
The score is a rubric judgment, not a probability or proof of correctness.
Explicitly disabled review yields SKIPPED and deterministic-only acceptance.

Monitor edits, pauses and lost execution leases invalidate stale commits. Initial
baselines do not notify. Collections compare by identity and alert rules use the
same entity's previous values. Snapshot and delivery records commit atomically.
The outbox leases deliveries and retries channels independently. Delivery is at
least once; stable delivery IDs support receiver deduplication and Resend
idempotency. Credentials resolve at send time and are not copied into payloads.

Public diagnostics and persisted evidence are redacted and bounded. Evidence
retention is independent of snapshot/quality summaries. Detailed diagnostic logs
are controlled by the existing compilation diagnostics settings.

## Validation and evaluation

From `backend/`:

```sh
npm run build
npm run lint
npm run typecheck
npm test
npm run evaluate:regression
```

The offline regression gate combines deterministic extraction, fixture-backed
configuration/routine replay and isolated configurator/reviewer checks. The
configuration corpus revision is 2 (dataset metadata, never a model plan field) and stores the new decision protocol directly;
there is no old-stage replay adapter. Expected intent, values, quality, semantic
status, rejection reason, alerts and call budgets are independent oracles.
Isolated review receives a gold execution, not a configurator prediction.

`reports/evals/regression.json` includes the corpus hash, runtime, mode, stage
metrics and per-case checks. The workflow uploads JSON/JUnit artifacts and runs
behavioral tests, including real Chromium local fixtures and PGlite transactions.
The deployment workflow runs the offline gate before image publication. Branch
protection must separately require the PR check if merges should be blocked.

The snapshot adapter changes state only on matching recorded actions, and every
execution starts from the initial document. Chromium tests cover rendering,
pagination, frames, Shadow DOM and virtualized scrolling. Service/transaction
tests cover actual baseline persistence, recovery, queues, acquisition and delivery.

`evaluate:configuration` may explicitly use real models when
`EVALS_LIVE_MODELS_ENABLED=true`; `evaluate:regression` is always offline. Automated
tests never call real models or send real notifications. Fixture timings measure
local execution, not provider latency or VPS capacity. Call budgets do not measure
tokens or monetary cost. Compare old/new implementations manually on identical
providers and controlled, held-out documents before claiming increased coverage.
No live-provider comparison or deployment is implicit in running the offline gate.

Add sanitized production failures with documented provenance and independently
reviewed expectations. Negative configurations require an error code and reason,
so unrelated exceptions cannot pass as correct rejections. Do not update oracles
merely to match a failing implementation. Lack of a supported capability should
remain an explicit failure until a generic operation and its tests are added.
