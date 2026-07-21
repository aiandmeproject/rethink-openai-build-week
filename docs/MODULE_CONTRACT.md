# Rethink Reasoning-Module Contract

`rethink-modules.js` is the versioned extension seam between STM/Router and a reasoning method. PEC, Evidence, the Lab Notebook, state reduction, and dispositions do not contain per-module execution maps.

## Required definition

Every module declares:

- `id`, `name`, `type`, and semantic `version`;
- `purpose`, `triggerConditions`, `whenToUse`, and `whenNotToUse`;
- `requiredInputs`, `availableTools`, and `evidenceRequirements`;
- bounded `executionInstructions` and `expectedStructuredOutput`;
- `stateEffects` and `possibleDispositions`;
- `dependencies` and `safeguards`;
- `publicResearchPossible` and `evidenceGatePolicy`;
- default PEC phase, question, routing rationale, priority rationale, and resolution criteria.

The registry validates a definition before registration. IDs are stable uppercase identifiers; versions use `major.minor.patch`; possible dispositions must be in the Core disposition registry. Duplicate registration fails unless replacement is explicitly requested.

## Invocation boundary

The current v0.1 registry is build-time and trusted. A compatible module can be registered and invoked through `createReasoningModuleRegistry()` without editing PEC, STM, the notebook reducer, or evidence linkage. The default engine and model prompt consume registry metadata directly.

The module proposes a strict output; it never mutates state. Core validation and `applyCycleOutput` own the canonical transition. This preserves:

- project-ID isolation;
- complete evidence participation;
- human override records;
- append-only notebook history;
- one primary method per cycle;
- fail-closed output and citation checks.

Dynamic third-party installation is intentionally not supported in v0.1. A future installer needs trust/signing, compatibility, permissions, migrations, evals, rollback, and version pinning.

## Evidence policies

- `EXISTING_OR_NONE`: use current relevant evidence when present; model reasoning may proceed without manufacturing evidence.
- `PUBLIC_THEN_EXISTING`: acquire authoritative public evidence when the project lacks it, then evaluate the resulting evidence.
- `HUMAN_REAL_WORLD`: stop for private, physical, behavioral, ethical, preference, authorization, or real-world test input.
- `EVIDENCE_REQUIRED`: do not claim a decision threshold without relevant evidence; route to public or human acquisition as appropriate.

Modules may name available tools, but the Core runtime decides whether a tool is authorized. A module cannot silently expand permissions.

## Core operators versus domain products

Frameworks used **by** Rethink are general mechanisms such as DEFINE, VALIDATE, STRESS_TEST, ROOT_CAUSE, MEASURE, PRIORITIZE, SIMPLIFY, OPTIMIZE, TEST, DECIDE, OIP, CDIL, and OAMPES.

Frameworks created **through** Rethink are intellectual products or domain systems. CHOICE is the current example. It is documented as a case study and is not registered in Core. A future domain pack may invoke such a framework explicitly, but ordinary projects must not be routed through it by default.

## Minimal registration example

```js
const registry = createReasoningModuleRegistry();
registry.register({
  ...compatibleDefinition,
  id: "NEW_METHOD",
  version: "1.0.0"
});

const invocation = registry.invoke("NEW_METHOD", {
  state: activeProject,
  routing: acceptedRoute
});
```

`test/modules.test.js` verifies the common contract, registration, invocation, and the engine's consumption of module metadata.
