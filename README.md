# Rethink

**AI that determines what question should be answered first.**

Most AI systems try to answer the question the user asks. Rethink first determines whether that is the question that should be answered.

Rethink is a routed reasoning architecture for managing uncertainty over the life of a problem. It identifies the unanswered question whose answer would change the greatest number of downstream decisions, selects one appropriate reasoning method, makes the route visible, executes it, updates project state, and records the change in a persistent Lab Notebook.

> Do not optimize branches before validating the trunk.

## Rethink Engine

The current application is the first operational profile of Rethink Engine:

```text
Rethink Engine
└── Rethink Core
    └── Domain Profile: BUSINESS 1.0.0
```

Rethink Core remains the shared PEC, STM, Claim Ledger, evidence, uncertainty, integrity, reducer, and Lab Notebook foundation. The universal Claim Ledger stores multiple explicit claims plus canonical `SUPPORTS`, `CONTRADICTS`, and `LIMITS` evidence relationships while keeping claims, assumptions, evidence, and the existing overall proposition behavior distinct. The versioned domain-profile registry also recognizes GENERAL, APPS, and NEWS as planned but unavailable; they are not selectable or operational in this branch. New and legacy projects resolve to BUSINESS unless an explicit supported profile is assigned.

## Project Links

- **OpenAI Build Week Submission:**https://devpost.com/software/rethink-1jx9f2
- **Demo Video:**https://www.youtube.com/watch?v=lPCGCD-YetA&t=18s

## Quick start

Requirements: Node.js 20 or newer. The project has no runtime package dependencies.

```bash
npm start
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

Demo Mode is the default and needs no API key or network connection.

The same application is used for the Build Week submission and continued Rethink Core development; there is no separate scripted judge build.

## Live GPT-5.6 Mode

Copy `.env.example` to `.env` and add a server-side OpenAI API key. Rethink loads this file when Node starts, while a deployment-provided environment variable still takes precedence:

```dotenv
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-5.6-sol
OPENAI_REASONING_EFFORT=medium
PORT=3000
```

Restart the server. The interface will enable **Live GPT-5.6** after `/api/status` confirms that a key is configured. Keeping the development key in the ignored `.env` file prevents a normal local server restart from silently dropping Live Mode. The key never enters browser storage, project backups, report exports, or logs.

The live integration uses:

- the OpenAI Responses API;
- `gpt-5.6-sol` by default, with explicit `medium` reasoning;
- strict JSON Schema through `text.format`;
- the hosted `web_search` tool only for evidence-dependent cycles;
- Responses background execution and polling for long-running public research and selected long-running Core methods (`TEST`, `VALIDATE`, `STRESS_TEST`, `ROOT_CAUSE`, `MEASURE`, `OIP`, `CDIL`, and `OAMPES`);
- persistent queued/in-progress/retrieving/evaluating states with bounded hung-request protection and safe retry;
- required tool use when the router declares `PUBLIC_RESEARCH_REQUIRED`;
- native web-search citation/source metadata;
- structured public findings linked to assumptions and cycle questions;
- explicit refusal when required search does not run, returns no structured public evidence, or lacks native source metadata.

The request shapes follow OpenAI's current [GPT-5.6 Sol model page](https://developers.openai.com/api/docs/models/gpt-5.6-sol), [Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs), [web search guide](https://developers.openai.com/api/docs/guides/tools-web-search), and [background mode guide](https://developers.openai.com/api/docs/guides/background).

## How I Used Codex

Codex served as my engineering partner throughout OpenAI Build Week 2026.

I used Codex to turn the Rethink framework into a working application, including:

- the reasoning engine and method routing
- evidence classification and traceability
- live GPT-5.6 research and citation handling
- background execution and recovery
- project persistence and backup/restore
- report generation
- automated testing and regression fixes

My role was to define the product logic, reasoning architecture, test scenarios, acceptance criteria, and system behavior. Codex accelerated implementation, debugging, refactoring, and test coverage while I continuously evaluated whether the system was behaving according to the Rethink framework.

## What to test

The fastest judge path is:

1. Leave **Demo** selected.
2. Click **Use sample problem**.
3. Click **Run Rethink**.
4. Observe PEC **Capture**, the highest-leverage question, and the recommended **DEFINE** route.
5. Read why that question and method come first.
6. Click **Run Define**.
7. Observe the problem definition, assumptions, state change, remaining uncertainty, and **VALIDATE** disposition.
8. Click **Run Next Cycle**.
9. Observe that Cycle 2 asks about unmet employer demand and recommends **VALIDATE** because of Cycle 1's learning.
10. Click **Run Validate** and observe `PUBLIC_RESEARCH_REQUIRED`: Demo Mode identifies the public gap but does not simulate research.
11. Try **Stress-Test**, **Clean It Up**, or **Validate** to override the route; the override is preserved in the notebook.
12. Click **Lock It In** to create a canonical checkpoint with explicit reopening conditions.
13. Open the persistent **Assumptions**, **Evidence**, and **Versions** controls. Add an evidence item; separately classify intake, provenance, source class/category, reliability, relationship, collection method, affected assumptions, and current or prior questions. Try entering a planned action and confirm it is routed rather than counted as evidence.
14. Compare the locked version with current state, then use **Controlled reopening** and record the evidence-based trigger.
15. Reload the page to confirm the state controls and edit history persist, click **Export Project Backup**, and restore it with **Import Project Backup**.
16. Export **Notebook JSON** as the focused reasoning-history artifact.
17. Open **Stage control** and **Final judgment** to inspect the reason-gated human-authority controls. A disposition override preserves the original system recommendation and unresolved uncertainty.
18. Generate the final report. Use **Download Final Report** for the human-readable UTF-8 HTML document, **Download Report JSON** for the structured report data, and **Export Project Backup** only for complete restoration.

For the external-research acceptance path, enter the commercial-equipment uptime problem described in `test/engine.test.js`. After DEFINE, VALIDATE should identify public research as the next gate. In configured Live Mode, execution requires OpenAI web search, saves cited findings as Evidence Items, invalidates the stale route, and reruns STM before requesting customer interviews.

## The core loop

```text
INPUT
  → PEC PROJECT STATE
  → STM HIGHEST-LEVERAGE QUESTION
  → REASONING ROUTER
  → ONE SELECTED METHOD
  → RESEARCH / ANALYSIS / TEST
  → EVIDENCE
  → ASSUMPTION + STATE UPDATE
  → LAB NOTEBOOK
  → NEXT ACTION / DISPOSITION
  → REPEAT
```

Guided Mode deliberately separates routing from method execution. A user sees the proposed question and route before deciding to run or override it. Rethink presents concise rationale and state changes; it does not expose private chain-of-thought.

The Claim Ledger is currently a Core/data capability exposed through canonical state, the existing state-management API, Report JSON, the human-readable report, notebook export, locks, and project backups. New and legacy projects safely begin with an empty ledger. Claims are never inferred from project text or assumptions, legacy evidence remains unlinked unless a relationship is explicitly created, and relationship counts never auto-set claim status. A large Guided Mode Claim Ledger editor is intentionally outside this branch.

## Persistence and failure behavior

- Project state, Claim Ledger records and evidence relationships, assumptions, evidence links, locked-version snapshots, reopening decisions, trace events, tangents, and notebook entries persist in browser `localStorage` on the current device.
- The three state counters and bottom dock remain available throughout PEC phases and reasoning cycles. Their dedicated panels support inspect/add/edit/soft-remove workflows; every edit requires a reason and appends audit history rather than erasing it.
- Versioned project backup/import provides a portable restorable record, including resumable research/reasoning job metadata and all canonical project state. Human-readable Report HTML, Report JSON, and Notebook JSON are deliberately separate, non-restorable artifacts.
- `public/project-repository.js` isolates the current device-local implementation behind a small repository contract so later durable storage does not need to rewrite the reasoning runtime.
- Demo Mode is deterministic and visibly labeled. It never presents simulated output as live research.
- Live API, authentication, network, rate-limit, refusal, timeout, or schema errors are surfaced without mutating project state. Demo Mode remains available.
- Long-running public research is stored in the device-local session by response ID and research fingerprint. Refresh resumes polling; delayed completion is ingested once; timeout or hung states offer a bounded safe retry without duplicating Evidence Items. Research calls use a dedicated 32,000-output-token budget (configurable with `OPENAI_RESEARCH_MAX_OUTPUT_TOKENS`); only an `OUTPUT_TOKEN_LIMIT_REACHED` retry escalates, up to the configurable 64,000-token ceiling.
- Selected long-running Core methods use a separate recoverable background path with a 12,000-output-token default (`OPENAI_LONG_REASONING_MAX_OUTPUT_TOKENS`). Accepted response IDs survive refresh and expose **Resume / Check Status**; state remains unchanged until one complete schema-valid cycle is available, and execution keys prevent duplicate cycles. Short routes and ordinary methods remain synchronous and lightweight.
- An incomplete response caused by `max_output_tokens` is recorded as `RESEARCH_OUTPUT_LIMIT_REACHED`, distinctly from API, output-schema, citation-validation, and evidence-ingestion failures. Rethink preserves secret-safe response status and token-usage metadata for inspection, rejects all partial Evidence Items, and offers a safe retry. The research prompt requests concise ingestion-ready JSON and defers full business narrative to the project report without dropping supporting/disconfirming search, citations, limitations, or applicability.
- Native Responses `url_citation` annotations and web-search source metadata are registered server-side with stable response-scoped citation IDs. External Evidence Items are reconciled through exact or conservatively normalized URLs; trusted native metadata supplies the stored title and URL. Fragments, trailing slashes, known tracking parameters, and query ordering may normalize, but substantive query differences, host changes, and protocol changes do not. A mapping failure is `CITATION_VALIDATION_FAILED`, identifies every affected item, and atomically ingests nothing so an unsupported source cannot silently influence project reasoning.
- Research execution and evidence outcome are separate. A technical failure creates no Evidence Item and makes no claim about the proposition. The persistent recovery panel offers **Retry Safely**, **View Error Log**, and a rationale-gated **Proceed Without Research** path that preserves the unresolved gap and returns control to STM.
- A completed bounded search may independently report support, contradictory evidence, mixed/limiting findings, no conclusive evidence, or no relevant evidence. These research outcomes remain separate from proposition status. Completed-but-inconclusive work can be reassessed, rerun with a revised supporting/disconfirming scope, accepted under uncertainty, or routed to real-world evidence.
- `PUBLIC_RESEARCH_REQUIRED` distinguishes publicly discoverable evidence from genuinely human evidence and requires hosted web search in Live Mode.
- `HUMAN_REAL_WORLD_INPUT_REQUIRED` stops only for private context, authorization, interviews, physical inspection, ethical judgment, or real-world testing. **Resolve Human Gate** can provide information, add evidence or test results, mark evidence unavailable, authorize action, proceed under uncertainty, or force a disposition.
- Project IDs, strict output echo checks, and context-filtered notebook input prevent one project's concepts from entering another project's reasoning. Legacy entries without a project identity remain inspectable but are excluded from active prompts.
- Each route accounts for every active evidence item, and each cycle classifies every item as material, relevant, irrelevant, or discounted. Repeated equivalent cycles are blocked until evidence or structured state changes.

## Tests

```bash
npm test
npm run smoke
npm run verify
```

The 118-test automated suite covers initialization, Claim Ledger contracts and stable IDs, explicit claim status, canonical many-to-many evidence relationships, referential integrity for active and retired relationships, deterministic duplicate handling, soft unlinking, non-automatic claim validation, legacy no-fabrication migration, v1/v2/resumable persistence, domain-profile contracts and availability, active-profile prompt isolation, PEC phases, router and cycle schemas, project-context isolation, complete evidence participation, taxonomy/provenance separation, synthetic-evidence exclusion, planned-test exclusion, source quality and collection-method persistence, prior-question reopening, validation-process versus proposition status, confidence trace, highest-leverage questions, method selection, invalid model output, notebook continuity, forced methods, linked state CRUD, controlled lock reopening, background research and Core-reasoning timeout/polling/retry/deduplication/recovery, research-specific token budgets, stage-specific research failure classification, rejection of partial evidence, stable native citation IDs, safe URL normalization, citation-failure diagnostics, technical-failure persistence and redaction, proceed-under-uncertainty recovery, completed-but-inconclusive outcomes, research exhaustion, UTF-8 human and JSON reports, readable enums and citations, human gates and evidence references, loop detection, module and profile registration, repository migration, versioned cross-origin backup/import, contractor/workforce isolation, credential exclusion, security headers, health/module endpoints, static serving, and HTTP end-to-end paths.

## Public deployment

The recommended Build Week path is the included Docker/Render deployment. It keeps the OpenAI key on the server, serves the UI and API from one origin, exposes `/api/health`, and leaves Demo Mode available without a key.

See [DEPLOYMENT.md](./DEPLOYMENT.md) before publishing. v0.1 is appropriate for a controlled public demo; it is not an authenticated multi-user service. A public Live URL can consume the configured OpenAI budget, so use host access controls or a restricted/revocable key with spending limits.

Current user data is device-local. It normally survives server restarts and same-origin redeploys but is not an account-backed guarantee. Export a project backup before consequential use or an origin change. See [docs/PERSISTENCE.md](./docs/PERSISTENCE.md).

## Reasoning modules

The 14 Core methods implement a common versioned contract in `rethink-modules.js`. The router prompt, deterministic engine, API, and UI consume the registry. A trusted build-time module can be registered without rewriting PEC, STM, Evidence, the Lab Notebook, or the central state reducer. Dynamic third-party plugins are deliberately deferred.

CHOICE and other domain products remain frameworks created through Rethink, not universal Core operators. See [docs/MODULE_CONTRACT.md](./docs/MODULE_CONTRACT.md).

## Repository map

```text
server.js                 HTTP server and API boundary
rethink-engine.js         State reducer and deterministic demo runtime
rethink-schema.js         PEC/method/disposition registries and strict schemas
rethink-modules.js        Versioned Core reasoning-module registry
rethink-domain-profiles.js Versioned Domain Profile registry and resolution
rethink-claims.js         Versioned Core Claim Ledger and canonical evidence relationships
rethink-prompt.js         GPT-5.6 router and cycle instructions
openai-client.js          Responses API, structured output, web search, citations
public/                   Guided Mode interface
test/                     Behavioral and HTTP tests
scripts/smoke.js          Fast end-to-end smoke test
ARCHITECTURE.md           Runtime design and invariants
DEPLOYMENT.md             Public hosting, security, and data behavior
ROADMAP.md                Core-first product direction without dates
PRODUCTIZATION_AUDIT.md   Conservative production-readiness boundary
BUILD_LOG.md              Concise Codex development record
BUILD_WEEK_SUBMISSION.md  Submission story and demo script
docs/                     Product concept and CHOICE case-study boundary
```

## Scope

This is a polished Build Week vertical slice and the first usable Rethink Core, not the complete future platform. Guided Mode is the priority. There is no database, account system, multi-project dashboard, collaborative workspace, autonomous multi-cycle runner, or production telemetry. The Claim Ledger does not yet implement provenance chains, source independence, evidence capability/scope, or full temporal integrity. OIP, CDIL, and OAMPES are routeable in Live Mode and represented by bounded Demo Mode behavior, but they are not expanded into separate research products.

CHOICE is intentionally excluded from the runtime. It is documented only as a Rethink case study.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the state contract, [ROADMAP.md](./ROADMAP.md) for the staged product direction, [PRODUCTIZATION_AUDIT.md](./PRODUCTIZATION_AUDIT.md) for the honest capability boundary, and [BUILD_WEEK_SUBMISSION.md](./BUILD_WEEK_SUBMISSION.md) for the submission narrative.
