# OpenAI Build Week Submission — Rethink

## One sentence

Rethink identifies the uncertainty that matters most, then chooses the reasoning method best suited to reduce it.

## The problem

AI is very good at producing answers, but answer quality is irrelevant when the user has framed the wrong question. Messy projects commonly mix a proposed solution, an untested problem, assumptions about users or markets, and premature implementation detail. A fluent answer can accelerate the wrong branch.

## The insight

> Most AI systems try to answer your question. Rethink first asks whether that is the question you should be answering.

The highest-leverage unanswered question is the one whose answer changes the greatest number of downstream decisions. Rethink makes that priority and its method selection inspectable before it executes.

## What the prototype does

Given a messy input, the working vertical slice:

1. initializes a PEC project state;
2. identifies the highest-leverage unanswered question;
3. visibly routes to one method;
4. explains why the question and method come first;
5. lets the user run or override the method;
6. separates model reasoning from external research;
7. updates assumptions and project state;
8. records the cycle in a persistent Lab Notebook;
9. returns a specific next action and disposition;
10. evaluates existing evidence, acquires available public evidence, or stops at a genuine human/real-world gate;
11. preserves final disposition authority for the human without erasing uncertainty.

The project-state counters are also persistent controls rather than decorative summaries. A judge can inspect and edit assumptions, classify evidence by source/reliability/relationship, connect evidence to assumptions and cycle questions, trace every change, compare canonical versions, and reopen a lock only after recording a valid trigger. Planned tests and model hypotheses remain traceable but do not masquerade as observed evidence.

## OpenAI usage

Live Mode uses GPT-5.6 Sol through the Responses API with strict Structured Outputs. Rethink sends project state to two bounded prompt surfaces:

- the STM/Router prompt selects the uncertainty and method;
- the cycle prompt executes exactly that method and returns a state-update object.

When STM identifies a public evidence gap, the cycle requires OpenAI's hosted `web_search` tool. The UI labels the source type and renders only native source/citation metadata as clickable evidence. Findings become structured Evidence Items linked to affected assumptions and the cycle question. A missing search call, missing structured finding, or missing native source metadata causes a fail-closed result with no state mutation.

Every router output echoes the active project ID and accounts for the complete evidence register. Every cycle echoes the same ID and classifies every active Evidence Item as material, relevant, irrelevant, or discounted. Legacy unidentified history remains inspectable but is excluded from reasoning context.

## Demo Mode

The deterministic, no-key fallback uses the same state, route, cycle, and notebook contracts. It is clearly labeled and never claims to be live model output or external research.

The included sample is:

> I think Florida-based disabled veterans could provide lower-cost remote work for companies.

Rethink does not optimize a staffing business immediately. It recognizes an assumed employer need, an assumed workforce opportunity, and a proposed solution. The first route is DEFINE. Cycle 2 responds to the new problem definition by asking whether meaningful employer demand exists, then identifies a public-research gate before interviews.

## Demo script

1. Start the app and leave Demo selected.
2. Load the sample and click **Run Rethink**.
3. Point out PEC Capture, the trunk question, the visible DEFINE route, and the resolution criteria.
4. Click **Run Define**.
5. Point out the solution-neutral problem definition, challenged assumptions, state changes, remaining uncertainty, and VALIDATE disposition.
6. Click **Run Next Cycle**.
7. Show that the route now asks about employer demand because of Cycle 1.
8. Run Validate and show `PUBLIC_RESEARCH_REQUIRED` rather than invented buyer evidence or a premature interview request.
9. Run Stress-Test as a direct override and show the override in the notebook.
10. Lock the state and show the canonical checkpoint.
11. Open **Evidence**, add an item linked to an assumption and unanswered question, then follow the bidirectional link and trace history.
12. Open **Versions**, compare the checkpoint with current state, and demonstrate controlled reopening.
13. Open **Final judgment**, show the preserved system recommendation, and record a reasoned human disposition with unresolved uncertainty and reopening conditions.

The commercial-equipment uptime regression test demonstrates the generalized acquisition loop: DEFINE the trunk, map publicly discoverable dealer/manufacturer/leasing/rental/fleet offerings through cited research in Live Mode, reassess STM, and require contractor interviews only for willingness-to-pay evidence public sources cannot establish.

## Why the architecture matters

The interface is not a chat transcript. The judge can see the runtime's decision surfaces:

- where the project is;
- what question has the most leverage;
- which method was chosen;
- why that route was chosen;
- what was learned;
- what state changed;
- what remains uncertain;
- what should happen next.

The private reasoning process is not exposed. The product displays bounded rationale, evidence, conclusions, and state changes.

## Validation completed

- 80 automated behavior and HTTP tests for state, project isolation, evidence participation/intake, public acquisition, research-only token budgets, safe output-limit recovery, native citation reconciliation, stage-specific failure classification, routing, errors, persistence adapters, backup/import, module registration, overrides, locks, human gates, loop stops, dispositions, provenance, health, and security headers.
- End-to-end smoke test for home → initialize → route → execute → notebook.
- Browser acceptance through the equipment-uptime DEFINE → VALIDATE → PUBLIC_RESEARCH_REQUIRED path, routed planned-test intake, persistent state controls, and an auditable human disposition override.
- Responsive check with no mobile horizontal overflow.
- No browser console errors observed in the acceptance path.

## Honest limitations

- Live Mode request shape is implemented against current official documentation, but this development environment did not provide an API key, so no paid live inference was executed in this session.
- Persistence is device-local, not multi-user or server-backed.
- Autonomous Mode is deferred in favor of a reliable Guided Mode.
- The deterministic demo is intentionally narrow and does not simulate live evidence.
- Conditional modules are routeable but not expanded into standalone full-featured products.
- Public deployment artifacts are present, but a final hosted URL and paid Live acceptance require environment credentials and have not been claimed as completed.

## Deployment and continuity

The submitted application is the real Rethink Core product. The same Node service supports local development and the recommended Docker/Render deployment; Demo and Live Mode share the same contracts. The OpenAI key remains server-side, and `/api/health` supports hosted checks.

Project state remains device-local in v0.1. Versioned project backup/import and a separate Lab Notebook export protect portability, while strict project IDs prevent silent cross-project merging. This is appropriate for a controlled judge deployment but is not represented as an authenticated multi-user production service.

## Next after Build Week

The most useful next work is an eval set for route quality: messy inputs with expert judgments about the highest-leverage question, acceptable alternative methods, human gates, and harmful premature optimization. Product expansion should follow measured router quality, not precede it.
