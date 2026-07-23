# Rethink Architecture

## Architectural intent

Rethink is not a chatbot, checklist, project manager, framework catalog, or undirected research agent. It is a routed reasoning runtime that repeatedly reduces the uncertainty with the greatest downstream decision leverage.

The architectural invariant is:

> One visible highest-leverage question and one primary reasoning method per cycle.

The system may move PEC backward or forward when evidence changes the project. It must never imply that a later phase is permanently complete.

## Rethink Engine layering

Rethink Engine is the complete platform. Rethink Core is the shared domain-independent reasoning, Claim Ledger, evidence, uncertainty, integrity, and decision foundation. A Domain Profile is a versioned overlay that can add domain terminology, modules, and safeguards without copying PEC, STM, the Claim Ledger, the Evidence Registry, reducers, the Lab Notebook, or the reasoning engine.

`rethink-domain-profiles.js` is the build-time profile registry. Branch 1 registers:

- `BUSINESS` `1.0.0` — active and operational;
- `GENERAL` `1.0.0` — known, planned, and unavailable;
- `APPS` `1.0.0` — known, planned, and unavailable;
- `NEWS` `1.0.0` — known, planned, and unavailable.

Known unavailable profiles fail differently from unknown profile IDs. Only the resolved active profile enters prompt context. BUSINESS is deliberately a minimal overlay over the accepted Build Week behavior; the registry does not implement General, Apps, or News reasoning.

Canonical project state carries `domainProfile` and `domainProfileVersion`. New projects default to BUSINESS. Legacy projects, local sessions, and v1/v2 backups that lack these additive fields normalize to BUSINESS without creating cycles, notebook entries, evidence, or timestamps. Existing profile assignment is preserved through reducers, reports, backups, and imports. Profile switching and profile-version migration are intentionally deferred.

## Runtime layers

### 1. PEC — project state

PEC answers: **Where are we in the project?**

`rethink-schema.js` defines the twelve canonical phases:

0. Capture
1. Define
2. Assumptions
3. Adversarial Review
4. Root Cause
5. Success Metrics
6. Opportunity Cost
7. Option Preservation
8. MVP Planning
9. Testing
10. Knowledge Capture
11. Decision

Project state includes the original input, current problem definition, current PEC phase, assumptions with status and confidence, a versioned Claim Ledger, classified evidence, canonical evidence-to-claim relationships, locks, human gates, human decisions, stage overrides, tangents, notebook entries, and cycle metadata.

Every state has a unique project ID and context-boundary version. Router and cycle outputs must echo that ID. Prompt compaction includes only that project's original input, structured state, current evidence, locks, manual changes, and notebook entries whose project ID matches. Older entries without an identity are marked `LEGACY_UNVERIFIED`: they remain visible for audit but never enter model context or deterministic route selection.

### 2. STM — reasoning priority

STM answers: **What should we think about next?**

The router prompt and deterministic engine ask:

> What unanswered question, if answered now, would most change what we do next?

STM does not execute every available framework. It selects the uncertainty first.

### 3. Reasoning Router — method selection

The router returns a strict object containing:

- highest-leverage unanswered question;
- selected method;
- why the question matters now;
- why the method fits;
- what would resolve the uncertainty;
- evidence needed;
- evidence gate (`NONE`, `USE_EXISTING_EVIDENCE`, `PUBLIC_RESEARCH_REQUIRED`, or `HUMAN_REAL_WORLD_INPUT_REQUIRED`);
- the evidence IDs and gaps considered by STM;
- whether a no-new-state loop was detected or execution is paused;
- recommended PEC phase.

The versioned registry in `rethink-modules.js` contains `DEFINE`, `VALIDATE`, `STRESS_TEST`, `ROOT_CAUSE`, `MEASURE`, `PRIORITIZE`, `SIMPLIFY`, `OPTIMIZE`, `OIP`, `CDIL`, `OAMPES`, `TEST`, `CAPTURE`, and `DECIDE`.

OIP, CDIL, and OAMPES are conditional. CHOICE is not in this registry.

### Reasoning-module contract

Every registered module declares its identity/version, purpose and triggers, when to use or avoid it, required inputs and tools, evidence policy, execution instructions, output/state effects, dispositions, dependencies, safeguards, PEC phase, default question, routing rationales, and resolution criteria. The router prompt, deterministic engine, API status, and UI method selector consume this registry instead of maintaining separate method maps.

Registration is trusted and build-time in v0.1. A module proposes output through the common strict cycle contract; it cannot mutate canonical state or bypass evidence, project-ID, citation, or human-authority checks. This allows a compatible method to be added without materially rewriting PEC, STM, Evidence, the Lab Notebook, or the reducer. Dynamic plugin loading is deliberately deferred. See `docs/MODULE_CONTRACT.md`.

### 4. Operator execution

Guided Mode pauses after the route is visible. The user can:

- run the proposed method;
- select another method;
- invoke Validate, Stress-Test, or Clean It Up directly;
- ask for the product-level explanation of why routing occurs first.

An override preserves both the recommended and selected methods. The chosen method executes exactly one bounded cycle.

The live operator uses GPT-5.6 through the Responses API. The deterministic operator creates a transparent demonstration result without network access.

### 5. Evidence and state reducer

The model never mutates project state directly. It returns a strict cycle result. `applyCycleOutput` validates and reduces that result into the canonical state.

The result contract contains:

- concise reasoning conclusion and findings;
- evidence quality and source type;
- learned facts or bounded conclusions;
- state changes;
- assumption changes with numeric confidence, qualitative UI label, confidence origin, and before/after rationale;
- new evidence;
- an explicit evaluation of every active Evidence Item, including material, relevant, irrelevant, or discounted classification;
- separate validation-process status (`evaluationThresholdMet`) and proposition status, so completing an evaluation never implies validation;
- a disconfirmation record containing search status, strongest support, strongest contradiction, strongest limitation, conclusion-changing evidence, and an incomplete-search flag;
- remaining uncertainty;
- next action and disposition;
- PEC phase after the cycle;
- updated problem definition;
- captured tangents.

Evidence intake distinguishes observed/verified findings and test results from inferred statements, assumptions, research questions, planned tests, user assertions, anecdotes, expert opinion, private data, calculations, public-source findings, and model-generated hypotheses. Plans, questions, assumptions, inferred statements, and model hypotheses are preserved as `ROUTED` intake records but are not counted toward evidence thresholds or linked as support.

The evidence contract separates five independent dimensions:

- intake classification: what the record is;
- provenance/origin: where it entered Rethink;
- source classification: primary, secondary, tertiary/aggregated, or unknown/not applicable;
- source category: government, academic, company, journalism, survey, experiment, operational data, and other standardized categories;
- reliability and relationship: how much weight it deserves and whether it supports, contradicts, mixes, contextualizes, or remains unlinked.

Collection method is a standardized value plus optional method details. The persistent question registry retains current, resolved, reopened, and superseded questions. A contradictory item linked to a resolved or superseded question reopens that question instead of silently leaving the prior conclusion closed.

When a route declares public research, Live Mode requires the hosted search tool. Each factual finding must become a `PUBLIC_SOURCE_FINDING` resolved to an internal citation ID created from native Responses metadata, with links identifying affected assumptions and cycle questions. No search call or missing native source metadata causes a technical fail-closed outcome. A completed, cited bounded search with no applicable structured finding is instead recorded as `NO_RELEVANT_EVIDENCE_FOUND`; it is not treated as a technical failure or as evidence that the proposition is false.

### Core Claim Ledger

`rethink-claims.js` defines the universal versioned Claim Ledger contract. A project begins with an empty ledger; neither initialization nor legacy normalization infers a claim from `originalInput`, `title`, `problemDefinition`, assumptions, or evidence. Existing cycle-level proposition evaluation therefore remains separate and unchanged.

A claim has a stable ID, text, extensible uppercase type, explicit universal status, notes, and created/updated timestamps. Claims, assumptions, and evidence are different records: no reducer automatically converts one into another. Claim status is human-auditable state and is never calculated from the number of supporting or contradicting links.

The ledger stores evidence relationships once in a canonical `evidenceRelationships` collection. Each active relationship references an existing claim and active Evidence Item and records `SUPPORTS`, `CONTRADICTS`, or `LIMITS`. This supports many-to-many and claim-specific meanings without mutable copies inside claims or Evidence Items. Duplicate links are idempotent; changing a relationship preserves its stable ID. Unlinking is soft, and removing evidence retires its active claim relationships while preserving the historical records.

Legacy evidence remains valid under the existing proposition/evidence model but receives no fabricated Claim Ledger link. Claim Ledger state is included in compact project prompts, lock snapshots, reports, notebook exports, project backups, imports, device-local sessions, and resumable v2 backups. Prompt instructions keep claims, assumptions, evidence, and cycle-level proposition status distinct. Full provenance chains, evidence independence, source-chain weighting, evidence capability/scope, and temporal-integrity semantics remain deferred.

### 6. Lab Notebook and disposition

Every executed method and Lock It In checkpoint creates a notebook entry containing the required before/after state, route, rationale, evidence, changes, remaining uncertainty, next action, disposition, runtime mode, and model metadata.

The notebook is appended, never rewritten by a later cycle. Manual claim, claim-evidence relationship, assumption, evidence, and locked-version actions also append a `STATE_EDIT` notebook record and a structured `stateEvents` before/after trace without incrementing the reasoning cycle. A browser repository adapter holds the canonical device-local active session in `localStorage`. Versioned project backup/import and focused Notebook export provide portable records.

The disposition registry also distinguishes `PUBLIC_RESEARCH_REQUIRED` and `HUMAN_REAL_WORLD_INPUT_REQUIRED`, while retaining the legacy `HUMAN_INPUT_REQUIRED` value for old records. Human judgment can record `HOLD`, `STOP`, or `PROCEED_UNDER_UNCERTAINTY` without rewriting the system recommendation.

## Guided Mode sequence

```text
POST /api/projects
  creates Cycle 0 / PEC Capture state

POST /api/rethink/route
  state → STM + Router → visible routing decision

POST /api/rethink/cycle
  state + accepted/overridden route
    → one method
    → strict cycle output
    → provenance checks
    → state reducer
    → notebook entry

POST /api/rethink/research/start
  public-research route -> background Responses job + persistent research envelope

POST /api/rethink/research/status
  response ID -> queued / in-progress / completed / failed
  completed result -> provenance validation + deduplicated evidence ingestion

POST /api/rethink/reasoning/start
  selected long-running Core method -> background Responses job + execution envelope

POST /api/rethink/reasoning/status
  response ID -> queued / in-progress / completed / incomplete / failed
  completed result -> schema validation + exactly-once cycle reduction

POST /api/projects/report
  canonical project state -> conservative structured report data

POST /api/rethink/lock
  current state → immutable checkpoint snapshot + notebook entry
```

`POST /api/rethink/state` accepts one reasoned mutation at a time. The reducer validates claim creation/update, canonical claim-evidence links, assumption/evidence links, evidence intake quality, human-gate resolution, human disposition, PEC-stage control, or controlled reopening; synchronizes references; clears stale routing client-side; and appends both a state event and Lab Notebook record.

`POST /api/projects/import` validates a versioned backup and records an isolated import. The browser renders structured report data into a standalone UTF-8 human report, while Report JSON and the restorable Project Backup remain distinct downloads. `GET /api/modules` exposes safe module metadata to the UI, and `GET /api/health` provides the deployment health check.

The browser does not call the OpenAI API. The key and API client remain server-side.

## Live GPT-5.6 integration

`openai-client.js` sends `POST https://api.openai.com/v1/responses` with:

- `model: gpt-5.6-sol` by default;
- explicit `reasoning.effort: medium`;
- `store: false`;
- developer and user inputs;
- `text.verbosity: medium`;
- strict `text.format` JSON Schema;
- an 8,000-token cycle ceiling;
- a 60-second synchronous abort boundary;
- short connection boundaries for background start/retrieval and a configurable end-to-end hung-job deadline.

The router does not search. An executed cycle adds `{ "type": "web_search" }` and `tool_choice: "required"` only when the route declares public research. Native `url_citation` annotations and `web_search_call.action.sources` become the only user-facing citation list.

Public research uses [Responses background mode](https://developers.openai.com/api/docs/guides/background). The start call sets `background: true`, returns a response ID, and stores a research envelope in the device-local session. Polling retrieves `queued` and `in_progress` jobs until a terminal status. Project progress signatures prevent ingestion into a state that changed while research ran. Response IDs and research fingerprints make delayed refresh and retry idempotent at the state reducer: a completed result can enter the Evidence Registry once, and duplicate polling returns `ALREADY_INGESTED`.

The potentially long-running `TEST`, `VALIDATE`, `STRESS_TEST`, `ROOT_CAUSE`, `MEASURE`, `OIP`, `CDIL`, and `OAMPES` methods use the same recoverable transport without enabling web search. A reasoning execution envelope records the request fingerprint, project progress signature, response ID, lifecycle status, retry count, and safe diagnostics. Browser refresh restores the envelope and resumes polling. A state change makes the result stale; an incomplete, failed, or schema-invalid response is never reduced; and notebook response/execution identifiers make completion exactly-once. Short routing and ordinary Core calls remain synchronous. The long-reasoning default is 12,000 output tokens and can be bounded with `OPENAI_LONG_REASONING_MAX_OUTPUT_TOKENS`.

Evidence acquisition has a separate output budget from ordinary Rethink calls. The default is 32,000 output tokens for initial public research and a 64,000-token ceiling for a safe retry after the specific `incomplete_details.reason = max_output_tokens` outcome; deployments may override both with `OPENAI_RESEARCH_MAX_OUTPUT_TOKENS` and `OPENAI_RESEARCH_RETRY_MAX_OUTPUT_TOKENS`. Router and ordinary reasoning calls remain at 8,000. Research requests use low text verbosity and a compact ingestion contract because the response needs structured evidence and coverage metadata, not a duplicated business report.

An incomplete response caused by the output limit is classified as `RESEARCH_OUTPUT_LIMIT_REACHED`, not as a generic network failure or evidentiary outcome. Rethink stores only a secret-safe diagnostic envelope (response ID/status, model, incomplete reason, configured budget, token usage, and output item types/statuses). Partial response text and partial Evidence Items are never persisted or ingested. Retry retains the same research scope and state fingerprint, raises the bounded research budget, and continues to rely on the normal completion schema and duplicate guards.

Completed web research enters a server-side citation post-processing stage before canonical state mutation. Native `url_citation` annotations are preferred as the authoritative title/URL, with `web_search_call.action.sources` retained as additional native provenance. Equivalent native records collapse into stable response-scoped IDs. Model-emitted URLs are mapping hints only: comparison removes fragments, trailing-slash differences, known tracking parameters, and query ordering while preserving hosts, protocols, paths, and substantive query values. Accepted Evidence Items receive the internal ID and canonical native title/URL. Any unmatched external item produces `CITATION_VALIDATION_FAILED` with safe item-level diagnostics. v0.1 deliberately keeps atomic ingestion because conclusions and state changes may depend on every submitted item.

Research failures are classified by stage: `RESEARCH_API_FAILED`, `RESEARCH_OUTPUT_LIMIT_REACHED`, `RESEARCH_OUTPUT_SCHEMA_FAILED`, `CITATION_VALIDATION_FAILED`, or `EVIDENCE_INGESTION_FAILED`. The error log records the reached stage, underlying code, native citation count, submitted item count, and affected items without retaining credentials or unsupported response content.

Each research envelope records a supporting search and a disconfirming search. Evidence-driven prompts explicitly seek null findings, low prevalence/materiality, narrower applicability, stronger-methodology reversals, existing solutions, alternate causal explanations, and non-actionability. A validation cycle with only supportive evidence is marked `DISCONFIRMATION_SEARCH_INCOMPLETE` and cannot silently become high-confidence validation. Two completed, bounded, unresolved searches for the same normalized question exhaust public research and transition the gate to precise real-world/human evidence.

Research has two independent state dimensions. `executionStatus` is `PENDING`, `COMPLETED`, `FAILED_TECHNICALLY`, or `CANCELLED`; `evidenceOutcome` is supporting, disconfirming, mixed, no conclusive evidence, no relevant evidence, or `NOT_EVALUATED`. Technical failure always maps to `NOT_EVALUATED`: it creates no evidence, leaves the question active, persists a redacted timestamped error/activity record, and cannot affect proposition status. The user may safely retry or record a rationale-gated decision to proceed under uncertainty. That decision preserves the gap, creates a state event and Notebook entry, and prevents STM from immediately trapping the project on the same failed search.

State continuity is explicit in the compact project-state input rather than dependent on `previous_response_id`. This keeps the notebook portable and avoids hidden server conversation state.

## Demo Mode

Demo Mode follows the same route and reducer contracts. Its sample path is deterministic:

```text
Cycle 0: CAPTURE
  → DEFINE the trunk problem

Cycle 1: ASSUMPTIONS
  → VALIDATE employer demand

Cycle 2:
  → PUBLIC_RESEARCH_REQUIRED before buyer interviews
```

Demo Mode never calls external research. Its result includes that limitation and contains no citations or external evidence items.

## Evidence gates and human authority

`PUBLIC_RESEARCH_REQUIRED` is used when authoritative public sources can reduce the gap. In Live Mode, successful acquisition creates structured cited Evidence Items and causes STM to reassess from changed state.

`HUMAN_REAL_WORLD_INPUT_REQUIRED` prevents the runtime from fabricating:

- private organizational knowledge;
- preferences or ethical judgments;
- interviews and purchase behavior;
- physical inspections;
- real-world test results;
- authorizations or commitments.

An open gate creates a persistent structured record and a prominent **Resolve Human Gate** control. Actual evidence or test-result payloads are stored once in the Evidence Registry; the gate resolution references their Evidence Item IDs and records the information/decision needed to close the gate. At least one active, non-synthetic item is required when resolution claims evidence or a real-world test result. Resolution can also provide authorization, unavailability, an uncertainty override, or a forced disposition. Final judgment and stage-level controls require a rationale. The audit record preserves the system recommendation, human decision, unresolved uncertainty, unmet thresholds, known risks, and reopening conditions.

Loop detection compares claim/claim-link/evidence/assumption/lock/gate/decision/stage signatures across cycles. A public or human gate cannot generate another equivalent Demo cycle, and two equivalent method conclusions with unchanged state are paused. Live public acquisition is the deliberate exception because its next execution can add new evidence.

## Tangents and locks

Cycle output can capture a tangent as a minor observation, future investigation, current-project modification, or potential standalone project. The reducer links it to the cycle and leaves the active route unchanged.

Lock It In snapshots the current problem definition, PEC phase, assumptions, Claim Ledger, and evidence. Locked versions can be inspected and compared against the current canonical state. Reopening never rolls the project backward: it marks the checkpoint reopened and requires a recorded trigger and rationale. Valid triggers include new evidence, a failed critical assumption, an integration conflict, or a demonstrably better version.

Assumptions and evidence remain first-class linked records under the existing bidirectional reducer contract. Active assumptions hold evidence IDs; active evidence holds affected assumption IDs and question references. Claim-evidence links deliberately use a separate single-source-of-truth relationship collection because one Evidence Item may bear differently on multiple claims. Explicitly synthetic, simulated, hypothetical, fixture, or acceptance-test findings remain active and traceable but carry `SYNTHETIC_SIMULATED` authenticity and are excluded from real-world validation thresholds, routing evidence counts, and human-gate satisfaction even when linked to a claim. Removal is soft: the item and history remain inspectable while active links are cleared or retired.

A project also carries lineage fields for a future tangent-to-child-project action. v0.1 only captures and classifies tangents; it does not silently create a project or import data. A future promotion must preserve the parent project/tangent IDs and create a new isolated state.

## Persistence boundary and future workspace

`public/project-repository.js` is the first persistence interface. The v0.1 adapter exposes load, save, and clear for one active device-local session and migrates the legacy storage key. Missing legacy Claim Ledger state hydrates to the versioned empty ledger without claims, links, or timestamps. Project Backup v2 contains the complete normalized project plus safe resumable UI/runtime job envelopes, but never credentials. Import accepts v1 and v2, validates the project and Claim Ledger, records the import event, and restores it under the destination origin. Human-readable Report HTML, Report JSON, and Notebook JSON are intentionally separate from the restorable backup.

The current product is not a multi-project dashboard. A future repository can add create/list/open/archive/resume operations and replace browser storage with durable storage while the reasoning API continues to receive exactly one explicitly authorized project state. Dashboard projections would read project title/status, PEC phase, highest-leverage question, evidence state, disposition, next action, and last activity from those isolated records.

Cross-project reasoning is prohibited by default. A future feature may surface a suggestion such as “Project X may contain a structurally similar mechanism”; the user must authorize a bounded transfer, and the imported fields/provenance must enter `lineage.explicitImports` and the notebook. Mere co-existence in a workspace never authorizes semantic transfer.

## Core operators and products created through Rethink

Core contains general reasoning mechanisms used **by** Rethink. Domain frameworks and intellectual products created **through** Rethink remain outside the universal registry. CHOICE is the documented case study. Knowledge Confirmation, education frameworks, metric registries, and future domain systems should become explicit modules or separate products only when their trigger and contract justify it; they must not accumulate in Core by default.

## Deployment topology

v0.1 is a single-origin stateless Node web service: the same process serves the Guided Mode frontend and API, while the OpenAI key remains server-side. It binds to `127.0.0.1` in development and `0.0.0.0` in production, exposes `/api/health`, sends baseline browser security headers, and shuts down cleanly on platform termination signals. The supplied container and Render Blueprint are the recommended Build Week hosting path.

Project data is not written to the container. This makes horizontal server replicas safe for the current device-local model, but it does not provide accounts, synchronization, or server backups. See `DEPLOYMENT.md` and `docs/PERSISTENCE.md`.

## Failure boundaries

- Invalid request or project state: HTTP 400; no mutation.
- Missing live key: HTTP 503; Demo Mode remains available.
- OpenAI authentication, rate-limit, timeout, refusal, or network failure during research: no evidence or reasoning-state mutation, but a redacted execution-failure audit record is persisted so retry and human recovery survive refresh.
- Invalid or schema-incomplete model output: rejected; no state mutation.
- Search without native citation/source metadata: rejected; not shown as research.
- Local persistence corruption: discarded on load; a new project can start.

## Current tradeoffs

- Device-local storage is sufficient for the Build Week demo and portable through manual backups, but is not collaborative or server durable.
- The HTTP layer is dependency-free, container-ready, and includes health/security/shutdown boundaries, but does not include production authentication, rate limiting, abuse controls, or observability.
- Guided Mode is complete; autonomous multi-cycle execution is intentionally deferred.
- Demo outputs are deterministic and narrow. They demonstrate the architecture, not general model intelligence.
- Module registration is versioned and tested but remains a trusted build-time capability, not a third-party plugin ecosystem.
