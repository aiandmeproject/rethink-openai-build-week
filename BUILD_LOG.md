# Rethink Build Log

## 2026-07-18 — repository audit

- The assigned workspace contained only empty `work/` and `outputs/` directories.
- `README.md`, `ARCHITECTURE.md`, `BUILD_WEEK_SUBMISSION.md`, `CHOICE_CASE_STUDY_SEED.md`, `server.js`, prompts, schemas, frontend files, package metadata, Git metadata, and tests were absent.
- There was therefore no seed runtime or demo workflow to launch, preserve, or repair. The supplied product specification became the canonical implementation source.

## Core implementation

- Built a dependency-free Node.js HTTP application and guided web interface.
- Implemented all twelve PEC phases as canonical state.
- Implemented STM highest-leverage-question selection and a visible reasoning router.
- Kept one primary method per cycle.
- Added strict routing and cycle JSON Schemas plus manual validation before state mutation.
- Added a deterministic, visibly labeled Demo Mode.
- Added the Florida disabled-veterans sample with DEFINE → VALIDATE continuity.
- Added direct Validate, Stress-Test, Clean It Up, and Lock It In actions.
- Recorded route overrides with both recommended and selected methods.
- Added assumption/evidence/tangent state reduction and explicit dispositions.
- Added a first-class human gate.
- Added a chronological Lab Notebook, device-local persistence, and JSON export.
- Promoted assumption, evidence, and locked-version counters into persistent state-management controls available throughout PEC and method cycles.
- Added dedicated inspect/edit panels, bidirectional assumption/evidence links, affected-question references, reason-gated soft removal, and before/after trace events.
- Expanded Lock It In snapshots to include evidence, added current-vs-locked comparison, and implemented controlled reopening with explicit triggers.
- Enforced project-context isolation with project-ID echo checks, context-bound prompt compaction, and quarantine of unidentified legacy notebook entries.
- Required STM and every method cycle to account for the complete active evidence register and expose material/relevant/irrelevant/discounted evidence traces plus threshold gaps.
- Added evidence-intake classification, reliability, relationship, source date, population, method, observation, and distinction between observations and routed plans/questions/hypotheses.
- Added the public evidence gate: authoritative web research now precedes customer interviews when the missing facts are publicly discoverable.
- Added persistent human-gate resolution, auditable human disposition overrides, and reason-gated PEC stage controls.
- Added state-signature loop detection that stops repeated public/human gates and equivalent reasoning cycles with no new evidence or material state change.
- Refactored every Core method into a validated, versioned reasoning-module contract consumed by the engine, prompt, API status, and frontend selector.
- Added explicit project lifecycle/disposition fields and lineage placeholders without introducing silent cross-project transfer.
- Added a browser persistence adapter, legacy-key migration, versioned project backup/import, import audit history, and focused Lab Notebook export.
- Added production binding, health/module endpoints, graceful shutdown, baseline browser security headers, Docker packaging, and a Render deployment blueprint.

## GPT-5.6 runtime

- Audited current official OpenAI model, Structured Outputs, Responses, and web-search guidance.
- Chose the explicit flagship model ID `gpt-5.6-sol` with configurable environment override.
- Used the Responses API and explicit `medium` reasoning.
- Used strict `text.format` JSON Schema rather than parsing unconstrained prose.
- Added hosted `web_search` with required tool choice only for routes that declare `PUBLIC_RESEARCH_REQUIRED`.
- Parsed native URL annotations and search source metadata for the UI.
- Added provenance enforcement: no tool call means model reasoning; a tool call without native source metadata is rejected.
- Kept the API key server-side and set `store: false`.
- Live Mode was not executed against the paid API because no key was present in this development environment.

## Bugs discovered and repaired

- The supplied seed repository was missing entirely.
- The first live-error message did not explicitly state that Demo Mode remained available; corrected and tested.
- Node's default test discovery picked up a smoke script whose filename contained `test`; renamed it to keep the suite deterministic.
- Browser QA found that an already completed routing decision could be executed again; added an execution guard and disabled completed-cycle control.
- Static assets could remain cached during the acceptance loop; changed local serving to revalidate assets and versioned the module reference.
- Added a refusal boundary for web research that lacks native citation/source metadata.
- Found the cross-project contamination source: the deterministic demo executor emitted Florida workforce/fair-work content for unrelated projects. Split the sample executor from the generic context-bound executor and added a regression acceptance test.
- Evidence intake previously allowed a planned action to count as evidence. Routed non-observations now remain traceable but do not satisfy evidence thresholds or link as support.
- DECIDE/CAPTURE and repeated-gate cycles could continue without new information. Added state-signature and equivalent-conclusion stops.
- Browser acceptance found that an imported project with no saved route displayed state but no general “Run Rethink” control. Added a context-bound workspace resume control, which also repairs the same dead end after manual state edits and locks clear stale routing.

## Tests and validation

- Added automated coverage for project initialization, all PEC phases, router schema, highest-leverage question, method selection, invalid JSON, schema-invalid model output, notebook creation, multi-cycle continuity, forced methods, Lock It In, Demo Mode, live missing-key/API/network failures, human gate, every disposition, web-search request shape, citation provenance, static serving, and HTTP continuity.
- Current automated result: 49 tests passing.
- Smoke test passes: home → project → route → cycle → notebook.
- Browser-tested the equipment-uptime acceptance path through DEFINE and VALIDATE; confirmed project isolation, zero-evidence threshold language, and `PUBLIC_RESEARCH_REQUIRED` before human interviews.
- Browser-tested the persistent state dock and all three panels: added and edited an assumption, added evidence linked to an assumption and cycle question, followed the bidirectional link, compared a checkpoint, reopened it with a `NEW_EVIDENCE` trigger, soft-removed evidence, and confirmed every audit record survived reload.
- Browser console errors observed: none.
- Browser-tested routed planned-test intake, the five-tab persistent state drawer, neutral intake defaults, and a complete human disposition override preserving system recommendation, uncertainty, unmet threshold, risk, and reopening condition.
- Mobile responsive check: the full-screen state drawer and persistent dock fit a 390px viewport with no horizontal overflow.
- Productization browser acceptance imported a versioned project backup, confirmed the imported project ID and lifecycle, resumed STM from only that state, received a DEFINE route, and verified project-backup export feedback with no console errors.

## Architectural decisions

- Guided Mode is two-stage: routing is visible before execution.
- The model returns proposed changes; a deterministic reducer owns canonical state mutation.
- State continuity is explicit and portable rather than hidden in an API conversation identifier.
- Browser localStorage was selected over a database for a reliable Build Week vertical slice.
- Demo and Live Mode share contracts but never share provenance labels.
- Lock It In is a version checkpoint, not permanent truth.
- Manual state edits are deterministic reducer operations, clear stale routing, preserve the reasoning cycle number, and append separate Lab Notebook audit records.
- Public and human evidence gates are semantically distinct. Available project evidence is evaluated first; authorized public acquisition comes next; real-world human evidence is last.
- Human disposition overrides never erase the prior system recommendation or make unmet evidence disappear.
- CHOICE remains a case study and is not in the runtime method registry.
- Module registration is a trusted build-time extension seam for v0.1, not a speculative third-party marketplace.
- Kept one active device-local project for v0.1 and introduced a repository contract rather than destabilizing the Build Week UI with an unverified dashboard.
- Selected a stateless single-origin Node container as the simplest deployment path. User project data remains client-local and portable; it is not written to the ephemeral host.
- Distinguished restorable project backup from focused Notebook export and documented the limits of each.

## Productization pass

- Added `ROADMAP.md` with Core v0.1, personal-use v0.2, modular-platform v0.3, and future product boundaries without dates.
- Added `DEPLOYMENT.md`, container artifacts, environment guidance, health checks, release steps, data-survival behavior, and security boundaries.
- Added `PRODUCTIZATION_AUDIT.md` answering the requested 15 production-readiness questions conservatively.
- Added module and persistence contract documentation.
- Documented frameworks used by Rethink versus products created through Rethink, with CHOICE kept outside Core.
- Preserved Tangent Protocol behavior and reserved explicit project lineage for a future, user-authorized child-project workflow.
- No public host was created during this pass; paid Live Mode and public-origin acceptance remain release gates rather than claimed capabilities.

## How Codex accelerated the work

- Converted the complete product doctrine into executable state, schema, routing, persistence, and UI contracts.
- Cross-checked the GPT-5.6 request shape against current official documentation.
- Implemented the complete vertical slice, tests, browser acceptance, and reviewer documentation in one continuous development record.
- Found and repaired interaction defects during the live browser pass.

## Major tradeoffs

- Chose zero runtime dependencies for launch reliability and a small attack surface.
- Chose deterministic local sample reasoning over a brittle fake model simulation.
- Chose explicit state replay over persisted reasoning for portable notebook continuity.
- Deferred Autonomous Mode, accounts, collaboration, server persistence, telemetry, and a full eval harness.

## Remaining limitations

- Live GPT-5.6 requires an API key and network access; a real paid call still needs environment-level verification.
- Device-local data is not synchronized or automatically backed up; versioned project JSON is the manual restore path.
- General route quality depends on the live model; the deterministic engine is designed for demonstration, not arbitrary problem coverage.
- A controlled public demo is deployable, but public multi-user production still needs authentication, ownership enforcement, durable storage, abuse controls, observability, and formal security/privacy work.

## 2026-07-20 — evidence, validation, research, and reporting pass

- Migrated Evidence Items to a multidimensional contract: intake classification, provenance/origin, primary/secondary/tertiary source classification, standardized source category, reliability, relationship, standardized collection method, and optional method details.
- Preserved old project backups by normalizing legacy `EVIDENCE`, `ANECDOTAL_OBSERVATION`, `sourceType`, `NONE` reliability/relationship, and free-text method fields into the new contract. Legacy fields remain inspectable in imported JSON but no longer drive new UI input.
- Kept assumptions, questions, planned tests, inferred statements, and model hypotheses traceable while excluding them from observed-evidence counts. Browser acceptance confirmed that a planned interview action increments the routed-intake count but leaves active Evidence at zero.
- Added a persistent question registry. Evidence can link to current, resolved, reopened, or superseded questions; material contradictory evidence reopens an earlier resolved/superseded question.
- Split validation-process status from proposition status. `evaluationThresholdMet` means enough evidence existed to perform the bounded evaluation; it never means the proposition was validated.
- Added explicit proposition outcomes and disconfirmation trace fields. Evidence-driven prompts now require supporting and disconfirming searches, seek null/low-prevalence/narrow-population/methodological/existing-solution/alternate-cause/actionability findings, and flag supportive-only work as `DISCONFIRMATION_SEARCH_INCOMPLETE`.
- Added confidence origin plus before/after rationale records and qualitative UI labels, reducing false precision without discarding the internal numeric estimate.
- Added Responses background execution for Live public research, persistent job envelopes, queued/in-progress/retrieving/evaluating/hung/failure/completed UI states, polling, configurable hung protection, state-signature guards, safe retry, response/fingerprint duplicate prevention, refresh recovery, and delayed successful ingestion.
- Added a bounded public-research budget. Two completed unresolved searches for the same normalized question transition to a precise `HUMAN_REAL_WORLD_INPUT_REQUIRED` gate instead of repeating indefinitely.
- Added a conservative structured project report with executive summary, proposition/process status, balanced evidence, source quality, assumptions, gaps, research history, real-world needs, risks, human overrides, next action, and confidence/readiness summary.
- Expanded automated coverage from 49 to 62 passing tests. New tests cover background timeout/polling/retry/deduplication/delayed ingestion, evidence taxonomy, model-inference boundaries, question reopening, validation terminology, confidence changes, research exhaustion, and reporting.
- Browser acceptance completed the sample DEFINE cycle, confirmed validation/disconfirmation terminology, inspected the full evidence taxonomy, verified current-plus-prior question linkage, routed a planned test without counting it as evidence, generated the conservative final report, and found no browser console errors.
- A real paid GPT-5.6 Sol research call remains unverified in this environment because no `OPENAI_API_KEY` is configured. Background behavior is verified with deterministic mocked Responses payloads and the official OpenAI background-mode contract.

## 2026-07-20 — research outcome and failure-recovery UX

- Split research execution from evidentiary outcome. Jobs now record `PENDING`, `COMPLETED`, `FAILED_TECHNICALLY`, or `CANCELLED` independently from support, disconfirmation, mixed, inconclusive, no-relevant-evidence, or not-evaluated outcomes.
- Technical failures now persist a redacted activity/error log with timestamp, job and response identifiers, retry count, current job state, human-readable summary, and copyable technical detail. Authorization values and API-key patterns are removed before storage.
- Added a non-trapping failure panel with **Retry Safely**, **View Error Log**, and **Proceed Without Research**. Proceeding is rationale-gated, creates no Evidence Item, leaves the research question active, preserves the evidence gap, records the human judgment, and returns control to STM.
- Completed searches with no applicable finding are now `NO_RELEVANT_EVIDENCE_FOUND`, not technical errors. Completed inconclusive outcomes expose reassess, revised-scope search, proceed-under-uncertainty, and real-world-evidence routes.
- Added scope-aware research fingerprints so a deliberate revised search is distinct from an idempotent retry of the same scope.
- Extended project reports and Notebook state-edit records with execution status, evidence outcome, recovery decision, and sanitized error trace.
- Expanded the automated suite from 62 to 69 passing tests. New coverage verifies failure persistence, cancellation, redaction, zero-evidence semantics, unresolved-question continuity, STM recovery, no-relevant-evidence completion, and the separation of supportive research outcome from proposition validation.

## 2026-07-20 — live research output-limit recovery

- Audited the Responses request builder and found that public-research jobs inherited the ordinary 8,000-output-token budget. Split the configuration so initial public research now receives 32,000 output tokens while ordinary routes and cycles remain at 8,000.
- Added a bounded 64,000-token retry ceiling used only after a recorded `OUTPUT_TOKEN_LIMIT_REACHED` failure. Both research values are environment-configurable and visible through `/api/status`.
- Added explicit handling for `status: incomplete` with `incomplete_details.reason: max_output_tokens`. Rethink now records the specific failure code plus secret-safe response/token metadata, keeps the question unresolved, and ingests no partial output or Evidence Items.
- Tightened the research output contract to concise ingestion-ready JSON. Full narrative synthesis remains the responsibility of the project report; supporting and disconfirming searches, citations, limitations, applicability, source quality, and confidence/update rationale remain required.
- Expanded the automated suite from 69 to 72 tests. New coverage verifies the research-only budget, concise balanced prompt contract, explicit incomplete-response classification, metadata preservation, safe 32k-to-64k retry, and zero partial/duplicate evidence ingestion.

## 2026-07-20 — native citation reconciliation

- Traced a fresh construction-equipment research rejection to brittle exact equality between model-emitted source URLs and native Responses citation URLs. Citation enforcement remained fail-closed; the model is no longer authoritative for the final stored URL.
- Added a server-side native citation registry. `url_citation` annotations are preferred, web-search source records add provenance, equivalent records deduplicate, and each trusted source receives a stable response-scoped citation ID.
- Added conservative URL reconciliation for trailing slashes, fragments, known tracking parameters, and query ordering. Hosts, protocols, paths, and substantive query values remain distinct. Accepted external Evidence Items receive the trusted title/URL and internal citation ID.
- Added stage-specific failure codes: `RESEARCH_API_FAILED`, `RESEARCH_OUTPUT_LIMIT_REACHED`, `RESEARCH_OUTPUT_SCHEMA_FAILED`, `CITATION_VALIDATION_FAILED`, and `EVIDENCE_INGESTION_FAILED`. Citation failures now preserve the post-processing stage, counts, and affected items in a secret-safe error log.
- Kept v0.1 research ingestion atomic. If any external Evidence Item cannot be mapped, none of the cycle output is ingested because its conclusions and state updates may depend on that unsupported item.
- Expanded the automated suite from 72 to 80 tests. New coverage verifies exact and normalized mapping, tracking removal, rejection of genuinely different sources, stable IDs, all five research failure stages, corrected safe retry, and exactly-once ingestion.
- The real post-fix construction-equipment call could not be rerun from this development process: the live API key exists only inside the already-running pre-fix Node process, no key is present in `.env` or inherited environment configuration, and the active browser session currently contains the Florida workforce project rather than the construction-equipment project. The precise construction-equipment citation failure/retry path is covered by the passing integration test without exposing or copying credentials.
- Browser acceptance verified the technical-failure screen, persistent copyable error details, rationale-gated recovery, zero evidence creation, hidden completed failure panel after recovery, and auditable Notebook entries.

## 2026-07-20 — acceptance-test polish and recoverable Core reasoning

- Extended recoverable Responses background execution beyond public research to selected long-running Core methods: `TEST`, `VALIDATE`, `STRESS_TEST`, `ROOT_CAUSE`, `MEASURE`, `OIP`, `CDIL`, and `OAMPES`. Short routing and ordinary cycles stay synchronous.
- Added persistent reasoning execution envelopes, response-ID polling, refresh recovery, safe retry/resume, project-state signatures, execution fingerprints, terminal-status classification, and exactly-once notebook guards. No partial or stale result can mutate PEC or project state.
- Added a dedicated 12,000-token long-reasoning budget (`OPENAI_LONG_REASONING_MAX_OUTPUT_TOKENS`) without increasing public-research or ordinary-call budgets.
- Separated report artifacts into a professional standalone UTF-8 HTML report, structured Report JSON with the correct extension/MIME, and a distinct versioned full Project Backup. Added readable enum labels and preserved citations/URLs throughout report rendering.
- Upgraded backups to v2 so safe resumable UI/research/reasoning state can move across origins with the full canonical project; v1 remains importable. No credentials are written to browser storage, backups, reports, or logs.
- Labeled a completed cycle's top routing panel as its pre-execution STM recommendation and added the current Evidence count so historic routing language cannot masquerade as current state.
- Replaced the overly strong “contradictory / failing” research wording with support, contradictory, mixed/limiting, inconclusive, no-relevant, and not-evaluated labels that remain distinct from proposition status.
- Added evidence authenticity. Synthetic, simulated, hypothetical, fixture, and acceptance-test results remain traceable but do not satisfy real-world evidence thresholds or close a human gate.
- Kept Human Gate resolution separate from evidence payloads: the Evidence Registry stores the findings once, and the gate stores references to active non-synthetic Evidence Item IDs plus the resolution decision.
- Added dependency-free `.env` loading with deployment environment precedence, documented durable local Live Mode setup, and verified `.env` remains excluded from source control.
- Expanded the automated suite from 80 to 93 passing tests. New coverage includes background Core reasoning recovery/deduplication/no-partial-mutation, UTF-8 report artifacts and readable labels, stale STM presentation, softened research outcomes, synthetic-evidence integrity, evidence-referenced human-gate resolution, v1/v2 cross-origin backup restoration, and credential exclusion.
- Smoke validation passes: home → project → route → cycle → notebook. A latest-build server passed `/api/health` and exposed the new background-reasoning configuration on `/api/status`; a paid GPT-5.6 call remains unverified in this process because its environment has no API key.

## 2026-07-20 — final Live background-TEST acceptance

- Configured the ignored local `.env` without exposing its API key and launched the latest server on `127.0.0.1:3000`. `/api/health` returned `ok`; `/api/status` reported Live GPT-5.6, recoverable background reasoning, the eight selected background methods, and the 12,000-token long-reasoning budget.
- Ran a paid Live `TEST` override. The accepted OpenAI response ID survived a browser refresh, manual **Resume / Check Status**, and repeated reload. Cycle remained 0 and PEC remained Capture until the complete schema-valid response arrived; completion produced exactly one Cycle 1 TEST notebook entry and moved PEC to Testing.
- Confirmed exactly-once ingestion after another refresh: Cycle remained 1 and the notebook retained one cycle entry. No duplicate cycle was created.
- Added a Unicode-rich synthetic Test Result. It remained active and linked for traceability, but the report still counted zero observed real-world evidence and retained `INSUFFICIENT_EVIDENCE` plus `HUMAN_REAL_WORLD_INPUT_REQUIRED`.
- Attempted to close the real-world Human Gate using only the synthetic Evidence Item. The reducer rejected the mutation and left the gate open with the explicit requirement for at least one active non-synthetic Evidence Item.
- Exported a UTF-8 HTML Final Report, Report JSON, and v2 Project Backup. Smart quotes, en dash, em dash, and ellipsis survived in both report artifacts without mojibake. Secret-pattern checks found no API key, bearer token, or authorization field in any export.
- Restored the v2 backup under the independent `127.0.0.1:3100` origin. Project ID, Cycle 1, Testing PEC phase, assumptions, active and routed evidence, question registry, two notebook records, state event, open Human Gate, Live mode, and complete report state were preserved. The temporary restore server was then stopped.
- Reran the full suite after acceptance: 93 tests passed, 0 failed, skipped, cancelled, or todo.

## 2026-07-21 — Final Report synthetic-evidence consistency fix

- Added a report-only defensive quarantine for records whose content explicitly says synthetic, simulated, hypothetical, fixture, or acceptance-test even when stale metadata incorrectly labels them as real-world evidence.
- Synthetic items no longer enter Supporting Evidence, observed-evidence totals, source-quality scoring, or report validation thresholds. A synthetic-only report remains `INSUFFICIENT_EVIDENCE` with the evaluation threshold not met.
- Human-readable HTML and the in-app report now give synthetic data its own section and state: **Synthetic / Simulated**, **Test or method-validation only**, **Cannot validate real-world propositions**, and **Cannot satisfy Human Gate**.
- Canonical evidence state and Core reasoning behavior were not changed; this is a conservative report-generation and presentation correction.
- Added regression coverage for contradictory legacy metadata and synthetic report rendering. Full automated result: 95 tests passed, 0 failed.

## 2026-07-23 — Rethink Engine Branch 1 domain-profile scaffolding

- Added a versioned Domain Profile registry alongside the reasoning-module registry. BUSINESS `1.0.0` is active; GENERAL, APPS, and NEWS are known but planned/unavailable.
- Added distinct resolution failures for known unavailable, unknown, and unsupported profile-version requests. Existing `{ input }` project creation remains backward compatible and defaults to BUSINESS.
- Added `domainProfile` and `domainProfileVersion` to canonical project state. Existing normalization assigns missing legacy fields without fabricating cycles, notebook entries, evidence, or timestamps.
- Preserved profile identity through cycles, reports, notebook export, v1/v2 project backups, imports, device-local session hydration, and resumable v2 runtime state. Backup format versions were not changed.
- Added only the resolved active profile to router/cycle prompt state. The BUSINESS overlay is intentionally minimal and adds no General, Apps, or News behavior.
- Extended `/api/status` with profile availability metadata while keeping only BUSINESS operational and unexposed as a mode selector.
- Added profile contract, duplicate-registration, future-extension, migration, API, prompt-isolation, backup/resumability, contractor-validation, and workforce-contamination regression coverage.
- Full automated result after Branch 1 implementation: 103 tests passed, 0 failed. Smoke validation: home → project → route → cycle → notebook passed.
- Deferred exactly as planned: profile switching, General/Apps/News behavior, Test Lab, Claim Ledger, provenance, Evidence Lineage, Independent Evidence Chains, Evidence Capability/Scope, and Evidence-Origin Audit.

## 2026-07-23 â€” Rethink Engine Branch 2 Core Claim Ledger

- Added `rethink-claims.js` as a universal, versioned Rethink Core contract. Claims have stable IDs, extensible Core-neutral types, explicit universal statuses, notes, and created/updated timestamps. Claims remain distinct from assumptions, Evidence Items, and the existing cycle-level proposition evaluation.
- Added one canonical evidence-to-claim relationship collection supporting `SUPPORTS`, `CONTRADICTS`, and `LIMITS`, including many-to-many and claim-specific relationships. Claims and Evidence Items do not store independently mutable relationship-ID copies.
- Added reason-gated Core reducer operations for claim creation/update, evidence linking/relationship change, and soft unlinking. Duplicate identical links are idempotent; relationship changes preserve identity; removing evidence retires active claim links without deleting history.
- Preserved human authority: relationship counts never auto-set claim status, supporting documents are not treated as independent evidence chains, and cycle output cannot create or mutate Claim Ledger state.
- New projects receive an empty ledger. Legacy projects, local sessions, v1 backups, and v2 backups missing Claim Ledger fields normalize to the same empty version without fabricated claims, relationships, cycles, notebook entries, state events, conclusions, or timestamps. Legacy evidence remains valid and unlinked at claim level.
- Persisted Claim Ledger state through normal cycles, progress signatures, lock snapshots, Lab Notebook exports, structured and human reports, project backup/import, device-local storage, and resumable v2 runtime sessions. Backup format versions remain unchanged.
- Added compact prompt context plus explicit claim/assumption/evidence semantics. Only bounded active relationships enter prompts; claim status is passed through exactly and remains separate from overall proposition status.
- Added a conservative read-only Claim Ledger section to the human report. Synthetic or removed evidence may remain linked for traceability but is labeled ineligible for real-world validation.
- Added contract, stable-ID, CRUD, status, relationship, referential-integrity, duplicate, legacy, persistence, report, prompt, HTTP, v1/v2/resumability, synthetic-integrity, contractor-route, and project-isolation regression coverage. A focused architectural-review test additionally proves that active and retired relationships fail closed if either canonical endpoint is physically absent. Full automated result: 118 tests passed, 0 failed. Smoke validation: home â†’ project â†’ route â†’ cycle â†’ notebook passed.
- Deferred exactly as planned: provenance chains, Evidence Lineage, Independent Evidence Chains, source-chain weighting, Evidence Capability/Scope, Evidence-Origin Audit, full temporal integrity, profile-specific claim behavior, Test Lab, and a large Claim Ledger UI.
