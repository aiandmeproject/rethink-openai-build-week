import assert from "node:assert/strict";
import test from "node:test";
import {
  applyCycleOutput,
  applyMethodOverride,
  createNotebookExport,
  createProjectBackup,
  createProjectReport,
  createDemoCycle,
  createDemoRouting,
  enforceRoutingProgressGuard,
  initializeProject,
  importProjectBackup,
  lockProjectState,
  manageProjectState,
  normalizeProjectState,
  validateRoutingForState
} from "../rethink-engine.js";
import {
  CYCLE_OUTPUT_SCHEMA,
  DISPOSITIONS,
  METHODS,
  PEC_PHASES,
  ROUTING_OUTPUT_SCHEMA,
  ValidationError,
  getPecPhase,
  validateCycleOutput,
  validateRoutingOutput
} from "../rethink-schema.js";

const sample = "I think Florida-based disabled veterans could provide lower-cost remote work for companies.";
const fixedNow = new Date("2026-07-18T12:00:00.000Z");

function makeProject() {
  return initializeProject(sample, { now: fixedNow });
}

function applyDemo(state, routing, offsetMinutes = 1) {
  const output = createDemoCycle(state, routing);
  return applyCycleOutput(state, routing, output, { mode: "demo", model: "deterministic-demo" }, {
    now: new Date(fixedNow.getTime() + offsetMinutes * 60_000)
  });
}

test("new project initialization captures the original idea and creates explicit assumptions", () => {
  const state = makeProject();
  assert.match(state.id, /^project_/);
  assert.equal(state.originalInput, sample);
  assert.equal(state.problemDefinition, sample);
  assert.equal(state.cycle, 0);
  assert.equal(state.assumptions.length, 3);
  assert.ok(state.assumptions.every((item) => item.status === "UNTESTED"));
  assert.deepEqual(state.notebook, []);
});

test("PEC phase state contains all twelve phases and starts at Capture", () => {
  assert.equal(PEC_PHASES.length, 12);
  assert.deepEqual(makeProject().pecPhase, { index: 0, id: "CAPTURE", label: "Capture" });
  assert.deepEqual(getPecPhase(11), { index: 11, id: "DECISION", label: "Decision" });
  assert.throws(() => getPecPhase("NOT_A_PHASE"), ValidationError);
});

test("router schema is strict and exposes the visible decision contract", () => {
  assert.equal(ROUTING_OUTPUT_SCHEMA.additionalProperties, false);
  assert.deepEqual(ROUTING_OUTPUT_SCHEMA.properties.selectedMethod.enum, METHODS);
  assert.ok(ROUTING_OUTPUT_SCHEMA.required.includes("highestLeverageQuestion"));
  assert.ok(ROUTING_OUTPUT_SCHEMA.required.includes("resolutionCriteria"));
  assert.ok(ROUTING_OUTPUT_SCHEMA.required.includes("projectId"));
  assert.ok(ROUTING_OUTPUT_SCHEMA.required.includes("evidenceGate"));
  assert.ok(ROUTING_OUTPUT_SCHEMA.required.includes("evidenceState"));
  assert.equal(CYCLE_OUTPUT_SCHEMA.additionalProperties, false);
  assert.ok(CYCLE_OUTPUT_SCHEMA.required.includes("evidenceEvaluation"));
});

test("demo routing generates a highest-leverage question instead of optimizing the sample", () => {
  const routing = createDemoRouting(makeProject());
  assert.match(routing.highestLeverageQuestion, /actual problem/i);
  assert.doesNotMatch(routing.highestLeverageQuestion, /optimi[sz]e/i);
  assert.equal(routing.selectedMethod, "DEFINE");
  assert.match(routing.whyQuestionNow, /trunk/i);
});

test("method selection validates all required router fields", () => {
  const routing = createDemoRouting(makeProject());
  assert.equal(validateRoutingOutput(routing), routing);
  assert.throws(() => validateRoutingOutput({ ...routing, selectedMethod: "CHOICE" }), ValidationError);
  assert.throws(() => validateRoutingOutput({ ...routing, highestLeverageQuestion: "" }), ValidationError);
});

test("completed cycle creates a complete Lab Notebook entry", () => {
  const state = makeProject();
  const routing = applyMethodOverride(createDemoRouting(state));
  const completed = applyDemo(state, routing);
  assert.equal(completed.state.cycle, 1);
  assert.equal(completed.state.notebook.length, 1);
  const entry = completed.state.notebook[0];
  assert.equal(entry.pecPhaseBefore, "CAPTURE");
  assert.equal(entry.pecPhaseAfter, "ASSUMPTIONS");
  assert.equal(entry.selectedMethod, "DEFINE");
  assert.equal(entry.disposition, "VALIDATE");
  assert.ok(entry.learned.length > 0);
  assert.ok(entry.remainingUncertainty.length > 0);
});

test("multiple cycles preserve state continuity and respond to prior learning", () => {
  const initial = makeProject();
  const firstRoute = applyMethodOverride(createDemoRouting(initial));
  const first = applyDemo(initial, firstRoute, 1);
  const secondRoute = applyMethodOverride(createDemoRouting(first.state));
  assert.equal(secondRoute.selectedMethod, "VALIDATE");
  assert.match(secondRoute.highestLeverageQuestion, /unmet demand/i);
  const second = applyDemo(first.state, secondRoute, 2);
  assert.equal(second.state.cycle, 2);
  assert.equal(second.state.notebook.length, 2);
  assert.equal(second.state.notebook[0].selectedMethod, "DEFINE");
  assert.equal(second.state.notebook[1].selectedMethod, "VALIDATE");
  assert.equal(second.state.problemDefinition, first.state.problemDefinition);
});

test("user-forced operator invocation records recommendation and override", () => {
  const state = makeProject();
  const recommendation = createDemoRouting(state);
  const routing = applyMethodOverride(recommendation, "STRESS_TEST");
  assert.equal(routing.recommendedMethod, "DEFINE");
  assert.equal(routing.selectedMethod, "STRESS_TEST");
  assert.equal(routing.override, true);
  const completed = applyDemo(state, routing);
  const entry = completed.state.notebook[0];
  assert.equal(entry.override, true);
  assert.equal(entry.recommendedMethod, "DEFINE");
  assert.equal(entry.selectedMethod, "STRESS_TEST");
});

test("Lock It In creates a canonical checkpoint without pretending it is permanent", () => {
  const state = makeProject();
  const locked = lockProjectState(state, { now: fixedNow });
  assert.equal(locked.state.cycle, 1);
  assert.equal(locked.state.lockedDecisions.length, 1);
  assert.equal(locked.state.notebook.length, 1);
  assert.match(locked.state.notebook[0].reasoningConclusion, /reopened/i);
  assert.equal(locked.result.nextAction.disposition, "CONTINUE");
});

test("Demo Mode is deterministic, transparent, and does not invent external research", () => {
  const state = makeProject();
  const routeA = createDemoRouting(state);
  const routeB = createDemoRouting(state);
  assert.deepEqual(routeA, routeB);
  const output = createDemoCycle(state, applyMethodOverride(routeA));
  assert.equal(output.reasoning.sourceType, "MODEL_REASONING");
  assert.equal(output.newEvidence.length, 0);
  assert.match(output.reasoning.limitations.join(" "), /does not perform live research/i);
});

test("public research is required before a human gate for discoverable market evidence", () => {
  const initial = makeProject();
  const first = applyDemo(initial, applyMethodOverride(createDemoRouting(initial)), 1);
  const secondRoute = applyMethodOverride(createDemoRouting(first.state));
  const secondOutput = createDemoCycle(first.state, secondRoute);
  assert.equal(secondOutput.nextAction.disposition, "PUBLIC_RESEARCH_REQUIRED");
  assert.match(secondOutput.nextAction.why, /public sources/i);
});

test("every disposition value is accepted by the strict cycle validator", () => {
  const state = makeProject();
  const routing = applyMethodOverride(createDemoRouting(state));
  const template = createDemoCycle(state, routing);
  for (const disposition of DISPOSITIONS) {
    const candidate = structuredClone(template);
    candidate.nextAction.disposition = disposition;
    assert.equal(validateCycleOutput(candidate), candidate);
  }
});

test("assumption and evidence edits maintain bidirectional links and a trace", () => {
  const state = makeProject();
  const evidenceAdded = manageProjectState(state, {
    type: "UPSERT_EVIDENCE",
    reason: "Captured from a buyer interview.",
    item: {
      claim: "Two employers reported a recurring backlog in document remediation.",
      sourceType: "USER_INPUT",
      sourceTitle: "Buyer interview notes",
      sourceUrl: "",
      assessment: "Directional qualitative support; not yet a purchase signal.",
      assumptionIds: [state.assumptions[0].id],
      questionRefs: ["Is there meaningful employer demand?"]
    }
  }, { now: new Date("2026-07-18T12:05:00.000Z") });
  const evidence = evidenceAdded.state.evidence[0];
  assert.deepEqual(evidence.assumptionIds, [state.assumptions[0].id]);
  assert.deepEqual(evidence.questionRefs, ["Is there meaningful employer demand?"]);
  assert.deepEqual(evidenceAdded.state.assumptions[0].evidenceIds, [evidence.id]);

  const assumptionEdited = manageProjectState(evidenceAdded.state, {
    type: "UPSERT_ASSUMPTION",
    reason: "Updated confidence after reviewing the interview.",
    item: {
      ...evidenceAdded.state.assumptions[0],
      status: "SUPPORTED",
      confidence: 0.6,
      evidenceIds: [evidence.id]
    }
  }, { now: new Date("2026-07-18T12:06:00.000Z") });
  assert.equal(assumptionEdited.state.assumptions[0].status, "SUPPORTED");
  assert.equal(assumptionEdited.state.evidence[0].assumptionIds[0], state.assumptions[0].id);
  assert.equal(assumptionEdited.state.stateEvents.length, 2);
  assert.equal(assumptionEdited.state.notebook.filter((entry) => entry.entryType === "STATE_EDIT").length, 2);
  assert.equal(assumptionEdited.state.cycle, 0);
  assert.equal(createDemoRouting(assumptionEdited.state).selectedMethod, "DEFINE");
});

test("removing evidence is soft, traceable, and clears assumption links", () => {
  const state = makeProject();
  const added = manageProjectState(state, {
    type: "UPSERT_EVIDENCE",
    reason: "Added a test observation.",
    item: {
      claim: "A bounded test observation.",
      sourceType: "USER_INPUT",
      sourceTitle: "Test notes",
      sourceUrl: "",
      assessment: "Useful but preliminary.",
      assumptionIds: [state.assumptions[0].id],
      questionRefs: []
    }
  }, { now: new Date("2026-07-18T12:05:00.000Z") });
  const evidenceId = added.state.evidence[0].id;
  const removed = manageProjectState(added.state, {
    type: "REMOVE_EVIDENCE",
    id: evidenceId,
    reason: "The observation was duplicated in error."
  }, { now: new Date("2026-07-18T12:07:00.000Z") });
  assert.equal(removed.state.evidence[0].status, "REMOVED");
  assert.match(removed.state.evidence[0].removedReason, /duplicated/i);
  assert.deepEqual(removed.state.assumptions[0].evidenceIds, []);
  assert.equal(removed.event.action, "REMOVED");
  assert.equal(removed.event.before.id, evidenceId);
});

test("removing an assumption preserves its audit record and clears evidence links", () => {
  const state = makeProject();
  const added = manageProjectState(state, {
    type: "UPSERT_EVIDENCE",
    reason: "Linked evidence for removal coverage.",
    item: {
      claim: "Evidence linked to the first assumption.",
      sourceType: "USER_INPUT",
      sourceTitle: "Notes",
      sourceUrl: "",
      assessment: "Used to verify link cleanup.",
      assumptionIds: [state.assumptions[0].id],
      questionRefs: []
    }
  }, { now: new Date("2026-07-18T12:05:00.000Z") });
  const removed = manageProjectState(added.state, {
    type: "REMOVE_ASSUMPTION",
    id: state.assumptions[0].id,
    reason: "The assumption was superseded by a more precise claim."
  }, { now: new Date("2026-07-18T12:08:00.000Z") });
  assert.ok(removed.state.assumptions[0].removedAt);
  assert.deepEqual(removed.state.evidence[0].assumptionIds, []);
  assert.equal(removed.state.assumptions.length, 3);
});

test("locked versions capture evidence and require a controlled reopening trigger", () => {
  const state = makeProject();
  const normalized = normalizeProjectState(state);
  const locked = lockProjectState(normalized, { now: new Date("2026-07-18T12:10:00.000Z") });
  assert.equal(locked.state.lockedDecisions[0].status, "ACTIVE");
  assert.deepEqual(locked.state.lockedDecisions[0].evidence, []);
  assert.throws(() => manageProjectState(locked.state, {
    type: "REOPEN_LOCK",
    lockId: locked.state.lockedDecisions[0].id,
    trigger: "BECAUSE_I_WANT_TO",
    reason: "Invalid trigger."
  }), ValidationError);
  const reopened = manageProjectState(locked.state, {
    type: "REOPEN_LOCK",
    lockId: locked.state.lockedDecisions[0].id,
    trigger: "NEW_EVIDENCE",
    reason: "A new buyer commitment contradicts the locked demand assessment."
  }, { now: new Date("2026-07-18T12:12:00.000Z") });
  const lock = reopened.state.lockedDecisions[0];
  assert.equal(lock.status, "REOPENED");
  assert.equal(lock.reopeningTrigger, "NEW_EVIDENCE");
  assert.match(lock.reopeningReason, /buyer commitment/i);
  assert.equal(reopened.event.action, "REOPENED");
});

test("project context is isolated from the sample and every output echoes the active project id", () => {
  const equipment = initializeProject("Determine whether contractors need guaranteed access to functioning commercial equipment through a bundled uptime subscription.", { now: fixedNow });
  const routing = createDemoRouting(equipment);
  const output = createDemoCycle(equipment, routing);
  const serialized = JSON.stringify({ routing, output }).toLowerCase();
  assert.equal(routing.projectId, equipment.id);
  assert.equal(output.projectId, equipment.id);
  assert.doesNotMatch(serialized, /disabled veteran|fair-work|workforce concept|employer segment/);
  assert.equal(validateRoutingForState(equipment, routing), routing);
  assert.throws(() => validateRoutingForState(equipment, { ...routing, projectId: makeProject().id }), /different project context/i);
});

test("every active evidence item must be explicitly evaluated exactly once", () => {
  const state = initializeProject("A product concept depends on a recurring customer operations problem.", { now: fixedNow });
  const added = manageProjectState(state, {
    type: "UPSERT_EVIDENCE",
    reason: "Recorded an observed test result.",
    item: {
      claim: "Four observed work orders exceeded the declared downtime threshold.",
      intakeType: "TEST_RESULT",
      reliability: "MODERATE",
      relationship: "SUPPORTS",
      sourceType: "USER_INPUT",
      sourceTitle: "Work order sample",
      sourceUrl: "",
      observation: "Four of six observed work orders exceeded 48 hours.",
      assessment: "Relevant to the recurring downtime assumption.",
      assumptionIds: [state.assumptions[0].id],
      questionRefs: ["Does downtime recur?"]
    }
  }, { now: new Date("2026-07-18T12:03:00.000Z") }).state;
  const routing = createDemoRouting(added);
  const output = createDemoCycle(added, routing);
  assert.deepEqual(output.evidenceEvaluation.considered.map((item) => item.evidenceId), [added.evidence[0].id]);
  const invalid = structuredClone(output);
  invalid.evidenceEvaluation.considered = [];
  assert.throws(() => applyCycleOutput(added, routing, invalid, { mode: "demo" }, { now: fixedNow }), /did not evaluate every active evidence item/i);
  assert.throws(() => applyCycleOutput(added, routing, { ...output, projectId: makeProject().id }, { mode: "demo" }, { now: fixedNow }), /different project context/i);
});

test("evidence intake routes plans and classifies weak assertions without treating them equally", () => {
  const state = initializeProject("A proposed service may solve a costly buyer problem.", { now: fixedNow });
  const planned = manageProjectState(state, {
    type: "UPSERT_EVIDENCE",
    reason: "Captured a proposed research action for later execution.",
    item: {
      claim: "Collect five problem interviews or equivalent behavioral evidence.",
      sourceType: "USER_INPUT",
      assessment: "This is a plan, not an observation.",
      assumptionIds: [state.assumptions[0].id],
      questionRefs: []
    }
  }, { now: new Date("2026-07-18T12:04:00.000Z") }).state;
  assert.equal(planned.evidence[0].intakeType, "PLANNED_TEST");
  assert.equal(planned.evidence[0].status, "ROUTED");
  assert.equal(planned.evidence[0].reliability, "UNKNOWN_NOT_ASSESSED");
  assert.equal(planned.evidence[0].relationship, "NEUTRAL_CONTEXT_ONLY");
  assert.deepEqual(planned.evidence[0].assumptionIds, []);
  assert.deepEqual(planned.assumptions[0].evidenceIds, []);

  const asserted = manageProjectState(planned, {
    type: "UPSERT_EVIDENCE",
    reason: "Preserved the user's directional assertion with its limitations.",
    item: {
      claim: "Customers want this.",
      sourceType: "USER_INPUT",
      assessment: "Unverified assertion; useful only as a hypothesis source.",
      assumptionIds: [state.assumptions[0].id],
      questionRefs: []
    }
  }, { now: new Date("2026-07-18T12:05:00.000Z") }).state;
  assert.equal(asserted.evidence[1].intakeType, "USER_ASSERTION");
  assert.equal(asserted.evidence[1].reliability, "LOW");
  assert.equal(asserted.evidence[1].status, "ACTIVE");
});

test("equipment uptime acceptance flow reaches bounded public research before real-world demand testing", () => {
  const equipment = initializeProject("Determine whether dealer, manufacturer, leasing, rental, and fleet programs already provide contractors guaranteed access to functioning commercial equipment, or whether a bundled uptime subscription fills a fragmented gap.", { now: fixedNow });
  const defined = applyDemo(equipment, createDemoRouting(equipment), 1).state;
  const route = createDemoRouting(defined);
  assert.equal(route.selectedMethod, "VALIDATE");
  assert.equal(route.evidenceGate, "PUBLIC_RESEARCH_REQUIRED");
  const output = createDemoCycle(defined, route);
  assert.equal(output.nextAction.disposition, "PUBLIC_RESEARCH_REQUIRED");
  assert.match(output.nextAction.action, /public evidence/i);
  assert.doesNotMatch(JSON.stringify(output), /workforce|fair-work|employer segment/i);
});

test("human gates can be resolved and human dispositions preserve the original recommendation", () => {
  const state = initializeProject("A proposed service now depends on an authorized real-world pilot result.", { now: fixedNow });
  const routing = applyMethodOverride(createDemoRouting(state), "TEST", state);
  const completed = applyCycleOutput(state, routing, createDemoCycle(state, routing), { mode: "demo" }, { now: new Date("2026-07-18T12:06:00.000Z") });
  assert.equal(completed.state.humanGates.length, 1);
  assert.equal(completed.state.humanGates[0].status, "OPEN");
  const resolved = manageProjectState(completed.state, {
    type: "RESOLVE_HUMAN_GATE",
    gateId: completed.state.humanGates[0].id,
    resolutionType: "MARK_UNAVAILABLE",
    resolution: "The pilot cannot run in this decision window.",
    reason: "No authorized participant or budget is available."
  }, { now: new Date("2026-07-18T12:07:00.000Z") }).state;
  assert.equal(resolved.humanGates[0].status, "RESOLVED");
  const judged = manageProjectState(resolved, {
    type: "OVERRIDE_DISPOSITION",
    systemRecommendation: "HUMAN_REAL_WORLD_INPUT_REQUIRED",
    humanDisposition: "PROCEED_UNDER_UNCERTAINTY",
    rationale: "The current decision is a reversible internal prototype.",
    unresolvedUncertainty: ["Customer willingness to pay remains unknown."],
    unmetEvidenceThresholds: ["No pilot behavior observed."],
    knownRisks: ["False-positive demand signal."],
    reopeningConditions: ["Pilot failure or contradictory market evidence."]
  }, { now: new Date("2026-07-18T12:08:00.000Z") }).state;
  assert.equal(judged.humanDecisions[0].systemRecommendation, "HUMAN_REAL_WORLD_INPUT_REQUIRED");
  assert.equal(judged.humanDecisions[0].humanDisposition, "PROCEED_UNDER_UNCERTAINTY");
  assert.deepEqual(judged.humanDecisions[0].unresolvedUncertainty, ["Customer willingness to pay remains unknown."]);
});

test("stage controls are reason-gated, auditable, and update PEC state", () => {
  const state = initializeProject("A project needs a deliberate PEC-stage judgment.", { now: fixedNow });
  assert.throws(() => manageProjectState(state, { type: "OVERRIDE_STAGE", action: "BYPASS", pecPhase: "DEFINE", reason: "" }), /reason/i);
  const result = manageProjectState(state, {
    type: "OVERRIDE_STAGE",
    action: "PROCEED_UNRESOLVED",
    pecPhase: "DEFINE",
    unresolvedEvidence: ["Problem frequency is not yet measured."],
    reason: "The next step is reversible and time-bounded."
  }, { now: new Date("2026-07-18T12:09:00.000Z") });
  assert.equal(result.state.pecPhase.id, "ASSUMPTIONS");
  assert.equal(result.state.stageOverrides.length, 1);
  assert.equal(result.event.entityType, "PEC_STAGE");
});

test("evidence taxonomy separates intake, provenance, source quality, and collection method", () => {
  const state = initializeProject("A narrow proposition needs classified evidence before investment.", { now: fixedNow });
  const publicFinding = manageProjectState(state, {
    type: "UPSERT_EVIDENCE",
    reason: "Recorded an authoritative public finding.",
    item: {
      claim: "A regulator reports a bounded result for the target population.",
      intakeType: "PUBLIC_SOURCE_FINDING",
      provenanceOrigin: "EXTERNAL_SOURCE",
      sourceClassification: "PRIMARY_SOURCE",
      sourceCategory: "REGULATORY_LEGAL",
      reliability: "HIGH",
      relationship: "SUPPORTS",
      collectionMethod: "DOCUMENT_RECORDS_REVIEW",
      methodDetails: "Reviewed the regulator's published decision record.",
      assessment: "Directly applicable to the stated population.",
      assumptionIds: [state.assumptions[0].id],
      questionRefs: ["Does the narrow proposition hold?"]
    }
  }, { now: fixedNow }).state.evidence[0];
  assert.equal(publicFinding.provenanceOrigin, "EXTERNAL_SOURCE");
  assert.equal(publicFinding.sourceClassification, "PRIMARY_SOURCE");
  assert.equal(publicFinding.sourceCategory, "REGULATORY_LEGAL");
  assert.equal(publicFinding.collectionMethod, "DOCUMENT_RECORDS_REVIEW");
  assert.match(publicFinding.methodDetails, /published decision/i);
});

test("model inference remains traceable but never masquerades as external observed evidence", () => {
  const state = initializeProject("A project contains a model-generated causal hypothesis.", { now: fixedNow });
  const updated = manageProjectState(state, {
    type: "UPSERT_EVIDENCE",
    reason: "Preserved a model hypothesis for later testing.",
    item: {
      claim: "The apparent effect may be caused by selection bias.",
      provenanceOrigin: "MODEL_INFERENCE",
      intakeType: "MODEL_GENERATED_HYPOTHESIS",
      assessment: "A reasoning hypothesis, not an external fact.",
      assumptionIds: [state.assumptions[0].id],
      questionRefs: []
    }
  }, { now: fixedNow }).state;
  assert.equal(updated.evidence[0].status, "ROUTED");
  assert.equal(createDemoRouting(updated).evidenceState.consideredEvidenceCount, 0);
  assert.deepEqual(updated.assumptions[0].evidenceIds, []);
});

test("prior resolved questions persist and contradictory evidence reopens them", () => {
  const initial = initializeProject("A recurring customer problem may justify a new service.", { now: fixedNow });
  const completed = applyDemo(initial, createDemoRouting(initial), 1).state;
  const prior = completed.questions[0];
  assert.equal(prior.status, "RESOLVED");
  const changed = manageProjectState(completed, {
    type: "UPSERT_EVIDENCE",
    reason: "A contradictory primary result affects the earlier framing.",
    item: {
      claim: "A representative operational sample found no recurring delay.",
      intakeType: "TEST_RESULT",
      provenanceOrigin: "REAL_WORLD_TEST_OBSERVATION",
      sourceClassification: "PRIMARY_SOURCE",
      sourceCategory: "OPERATIONAL_TRANSACTIONAL_DATA",
      reliability: "HIGH",
      relationship: "CONTRADICTS",
      collectionMethod: "ADMINISTRATIVE_OPERATIONAL_DATA",
      assessment: "Directly contradicts the prior problem framing.",
      assumptionIds: [completed.assumptions[0].id],
      questionRefs: [prior.text]
    }
  }, { now: new Date("2026-07-18T12:04:00.000Z") }).state;
  assert.equal(changed.questions.find((item) => item.id === prior.id).status, "REOPENED");
  assert.ok(changed.evidence[0].questionRefs.includes(prior.text));
});

test("validation process completion remains distinct from proposition validation", () => {
  const initial = initializeProject("A narrow buyer segment may have a frequent unrecoverable outage problem.", { now: fixedNow });
  const withBroadSupport = manageProjectState(initial, {
    type: "UPSERT_EVIDENCE",
    reason: "Added broad but incompletely applicable support.",
    item: {
      claim: "A broad industry survey reports that outages occur.",
      intakeType: "OBSERVED_EVIDENCE",
      provenanceOrigin: "EXTERNAL_SOURCE",
      sourceClassification: "SECONDARY_SOURCE",
      sourceCategory: "INDUSTRY_ASSOCIATION",
      reliability: "MODERATE",
      relationship: "SUPPORTS",
      population: "All firms, not the narrow buyer segment",
      collectionMethod: "SURVEY",
      assessment: "Broad evidence that does not establish frequency or recoverability in the target segment.",
      assumptionIds: [initial.assumptions[0].id],
      questionRefs: []
    }
  }, { now: fixedNow }).state;
  const routing = applyMethodOverride(createDemoRouting(withBroadSupport), "VALIDATE", withBroadSupport);
  const output = createDemoCycle(withBroadSupport, routing);
  assert.equal(output.evidenceEvaluation.evaluationThresholdMet, true);
  assert.equal(output.evidenceEvaluation.propositionStatus, "PARTIALLY_SUPPORTED");
  assert.notEqual(output.evidenceEvaluation.propositionStatus, "VALIDATED");
  assert.equal(output.evidenceEvaluation.disconfirmation.flag, "DISCONFIRMATION_SEARCH_INCOMPLETE");

  const noEvidenceOutput = createDemoCycle(initial, applyMethodOverride(createDemoRouting(initial), "VALIDATE", initial));
  assert.equal(noEvidenceOutput.evidenceEvaluation.propositionStatus, "INSUFFICIENT_EVIDENCE");
  assert.notEqual(noEvidenceOutput.evidenceEvaluation.propositionStatus, "FALSIFIED");
});

test("confidence changes expose before, after, origin, and rationale", () => {
  const state = makeProject();
  const routing = createDemoRouting(state);
  const output = createDemoCycle(state, routing);
  output.assumptionChanges = [{
    assumption: state.assumptions[0].text,
    status: "CHALLENGED",
    confidence: 0.15,
    confidenceOrigin: "MODEL_GENERATED",
    rationale: "The definition cycle exposed two unresolved dependency assumptions."
  }];
  const completed = applyCycleOutput(state, routing, output, { mode: "demo" }, { now: fixedNow });
  assert.deepEqual(completed.result.confidenceChanges[0], {
    assumption: state.assumptions[0].text,
    before: { confidence: 0.25, confidenceOrigin: "FRAMEWORK_DEFINED" },
    after: { confidence: 0.15, confidenceOrigin: "MODEL_GENERATED" },
    reason: "The definition cycle exposed two unresolved dependency assumptions."
  });
});

test("repeated bounded public research exhaustion transitions to a precise human gate", () => {
  const initial = initializeProject("A public market proposition needs validation before a private demand test.", { now: fixedNow });
  const defined = applyDemo(initial, createDemoRouting(initial), 1).state;
  const firstRoute = createDemoRouting(defined);
  const exhausted = normalizeProjectState({
    ...defined,
    researchHistory: [1, 2].map((attempt) => ({
      researchKey: `attempt_${attempt}`,
      responseId: `resp_${attempt}`,
      status: "COMPLETED",
      question: firstRoute.highestLeverageQuestion,
      propositionStatus: "INSUFFICIENT_EVIDENCE",
      disconfirmationStatus: "INCONCLUSIVE"
    }))
  });
  const next = createDemoRouting(exhausted);
  assert.equal(next.evidenceGate, "HUMAN_REAL_WORLD_INPUT_REQUIRED");
  assert.equal(next.requiresExternalResearch, false);
  const output = createDemoCycle(exhausted, next);
  assert.equal(output.nextAction.disposition, "HUMAN_REAL_WORLD_INPUT_REQUIRED");
  assert.match(output.nextAction.action, /precise private|real-world evidence/i);
});

test("professional report preserves gaps, contradictions, assumptions, and human overrides", () => {
  let state = initializeProject("A business proposition has both support and a material limitation.", { now: fixedNow });
  for (const [relationship, claim, minute] of [
    ["SUPPORTS", "A target-population pilot observed recurring delays.", 1],
    ["CONTRADICTS", "A comparable population showed the delay was uncommon.", 2]
  ]) {
    state = manageProjectState(state, {
      type: "UPSERT_EVIDENCE",
      reason: "Added balanced evidence for reporting.",
      item: {
        claim,
        intakeType: "TEST_RESULT",
        provenanceOrigin: "REAL_WORLD_TEST_OBSERVATION",
        sourceClassification: "PRIMARY_SOURCE",
        sourceCategory: "EXPERIMENT_PILOT",
        reliability: "MODERATE",
        relationship,
        collectionMethod: "EXPERIMENT_PILOT",
        assessment: relationship === "SUPPORTS" ? "Applicable support." : "Material limiting evidence.",
        assumptionIds: [state.assumptions[0].id],
        questionRefs: []
      }
    }, { now: new Date(fixedNow.getTime() + minute * 60_000) }).state;
  }
  const route = applyMethodOverride(createDemoRouting(state), "VALIDATE", state);
  state = applyCycleOutput(state, route, createDemoCycle(state, route), { mode: "demo" }, { now: new Date("2026-07-18T12:05:00.000Z") }).state;
  state = manageProjectState(state, {
    type: "OVERRIDE_DISPOSITION",
    humanDisposition: "PROCEED_UNDER_UNCERTAINTY",
    rationale: "The current decision is reversible.",
    unresolvedUncertainty: ["Willingness to pay remains unknown."],
    knownRisks: ["The observed effect may not generalize."],
    reopeningConditions: ["A failed pilot."]
  }, { now: new Date("2026-07-18T12:06:00.000Z") }).state;
  const report = createProjectReport(state, { now: fixedNow });
  assert.equal(report.evidenceBase.supporting.length, 1);
  assert.equal(report.evidenceBase.contradictory.length, 1);
  assert.ok(report.remainingAssumptions.length > 0);
  assert.ok(report.humanDecisionsAndOverrides.length > 0);
  assert.equal(report.currentDisposition.humanDisposition, "PROCEED_UNDER_UNCERTAINTY");
  assert.notEqual(report.propositionStatus.status, "VALIDATED");
});

test("no-new-evidence loop detection blocks repeated demo reasoning but permits live public acquisition", () => {
  const initial = initializeProject("A current market claim must be validated before product design.", { now: fixedNow });
  const defined = applyDemo(initial, createDemoRouting(initial), 1).state;
  const validationRoute = createDemoRouting(defined);
  const gated = applyDemo(defined, validationRoute, 2).state;
  const repeated = createDemoRouting(gated);
  assert.equal(repeated.loopDetected, true);
  assert.equal(repeated.executionBlocked, true);
  assert.throws(() => createDemoCycle(gated, repeated), /blocked until new evidence/i);
  const liveRoute = enforceRoutingProgressGuard(gated, { ...repeated, executionBlocked: false }, { mode: "live" });
  assert.equal(liveRoute.executionBlocked, false);

  const changed = manageProjectState(gated, {
    type: "UPSERT_EVIDENCE",
    reason: "Added a newly observed market fact.",
    item: {
      claim: "A published provider program includes replacement equipment during covered repairs.",
      intakeType: "PUBLIC_SOURCE_FINDING",
      reliability: "MODERATE",
      relationship: "MIXED",
      sourceType: "EXTERNAL_SOURCE",
      sourceTitle: "Provider program terms",
      sourceUrl: "https://example.com/program",
      observation: "Replacement equipment is available only for a subset of covered repairs.",
      assessment: "Relevant to market fragmentation.",
      assumptionIds: [gated.assumptions[0].id],
      questionRefs: [repeated.highestLeverageQuestion]
    }
  }, { now: new Date("2026-07-18T12:10:00.000Z") }).state;
  assert.equal(createDemoRouting(changed).loopDetected, false);
});

test("equivalent repeated decision cycles stop when structured state does not change", () => {
  let state = initializeProject("A reversible project decision has enough bounded evidence for a prototype judgment.", { now: fixedNow });
  for (let index = 0; index < 2; index += 1) {
    state = manageProjectState(state, {
      type: "UPSERT_EVIDENCE",
      reason: `Recorded independent supporting observation ${index + 1}.`,
      item: {
        claim: `Independent observed result ${index + 1} supports the bounded proposition.`,
        intakeType: "TEST_RESULT",
        reliability: "MODERATE",
        relationship: "SUPPORTS",
        sourceType: "USER_INPUT",
        assessment: "Counts toward the prototype threshold.",
        assumptionIds: [state.assumptions[0].id],
        questionRefs: []
      }
    }, { now: new Date(fixedNow.getTime() + (index + 1) * 60_000) }).state;
  }
  const firstRoute = applyMethodOverride(createDemoRouting(state), "DECIDE", state);
  const first = applyCycleOutput(state, firstRoute, createDemoCycle(state, firstRoute), { mode: "demo" }, { now: new Date("2026-07-18T12:03:00.000Z") });
  const secondRoute = createDemoRouting(first.state);
  assert.equal(secondRoute.selectedMethod, "DECIDE");
  assert.equal(secondRoute.executionBlocked, false);
  const second = applyCycleOutput(first.state, secondRoute, createDemoCycle(first.state, secondRoute), { mode: "demo" }, { now: new Date("2026-07-18T12:04:00.000Z") });
  const repeated = createDemoRouting(second.state);
  assert.equal(repeated.loopDetected, true);
  assert.equal(repeated.executionBlocked, true);
});

test("project backups round-trip the same isolated project and preserve an import audit record", () => {
  const state = makeProject();
  const completed = applyDemo(state, applyMethodOverride(createDemoRouting(state)), 1).state;
  const backup = createProjectBackup(completed, { now: new Date("2026-07-18T12:15:00.000Z") });
  assert.equal(backup.format, "rethink.project.backup");
  assert.equal(backup.formatVersion, 1);
  assert.equal(backup.projectId, completed.id);

  const imported = importProjectBackup(backup, { now: new Date("2026-07-18T12:16:00.000Z") });
  assert.equal(imported.id, completed.id);
  assert.equal(imported.originalInput, completed.originalInput);
  assert.equal(imported.notebook.length, completed.notebook.length);
  assert.equal(imported.importHistory.length, 1);
  assert.equal(imported.importHistory[0].format, "rethink.project.backup");
});

test("Lab Notebook export is a focused structured backup with traceable state context", () => {
  const state = makeProject();
  const completed = applyDemo(state, applyMethodOverride(createDemoRouting(state)), 1).state;
  const notebook = createNotebookExport(completed, { now: new Date("2026-07-18T12:17:00.000Z") });
  assert.equal(notebook.format, "rethink.lab-notebook");
  assert.equal(notebook.projectId, completed.id);
  assert.equal(notebook.notebook.length, 1);
  assert.equal(notebook.assumptions.length, completed.assumptions.length);
  assert.deepEqual(notebook.currentPecPhase, completed.pecPhase);
});

test("synthetic test results remain traceable but never satisfy real-world evidence thresholds", () => {
  const state = makeProject();
  const assumptionId = state.assumptions[0].id;
  const added = manageProjectState(state, {
    type: "UPSERT_EVIDENCE",
    reason: "Acceptance-test fixture must be explicitly synthetic.",
    item: {
      claim: "Synthetic acceptance-test dataset exceeds every project threshold.",
      intakeType: "TEST_RESULT",
      evidenceAuthenticity: "SYNTHETIC_SIMULATED",
      provenanceOrigin: "REAL_WORLD_TEST_OBSERVATION",
      sourceClassification: "PRIMARY_SOURCE",
      sourceCategory: "EXPERIMENT_PILOT",
      reliability: "HIGH",
      relationship: "SUPPORTS",
      collectionMethod: "EXPERIMENT_PILOT",
      observation: "The simulated values exceed the threshold.",
      assessment: "Synthetic acceptance-test data only.",
      assumptionIds: [assumptionId],
      questionRefs: ["Would real customers exhibit this result?"]
    }
  }, { now: new Date("2026-07-18T12:10:00.000Z") });
  const item = added.state.evidence.at(-1);
  assert.equal(item.status, "ACTIVE");
  assert.equal(item.evidenceAuthenticity, "SYNTHETIC_SIMULATED");
  assert.ok(added.state.assumptions[0].evidenceIds.includes(item.id));
  assert.equal(createDemoRouting(added.state).evidenceState.consideredEvidenceCount, 0);
  const report = createProjectReport(added.state, { now: fixedNow });
  assert.equal(report.evidenceBase.totalObservedItems, 0);
  assert.equal(report.evidenceBase.syntheticOrSimulated.length, 1);
  assert.match(report.risksAndLimitations.join(" "), /excluded from real-world proposition validation/i);
});

test("Final Report quarantines synthetic content even when legacy metadata calls it real-world support", () => {
  const state = makeProject();
  const added = manageProjectState(state, {
    type: "UPSERT_EVIDENCE",
    reason: "Reproduce contradictory legacy report metadata.",
    item: {
      claim: "Synthetic acceptance-test dataset strongly supports the proposition.",
      intakeType: "TEST_RESULT",
      evidenceAuthenticity: "REAL_WORLD",
      provenanceOrigin: "REAL_WORLD_TEST_OBSERVATION",
      sourceClassification: "PRIMARY_SOURCE",
      sourceCategory: "SURVEY",
      reliability: "HIGH",
      relationship: "SUPPORTS",
      collectionMethod: "SURVEY",
      observation: "Simulated respondents exceeded the target threshold.",
      assessment: "Synthetic method-validation fixture, not observed customer behavior.",
      assumptionIds: [state.assumptions[0].id],
      questionRefs: ["Would real customers exhibit this result?"]
    }
  }, { now: new Date("2026-07-18T12:10:30.000Z") });

  assert.equal(added.state.evidence.at(-1).evidenceAuthenticity, "REAL_WORLD");
  const report = createProjectReport(added.state, { now: fixedNow });
  assert.equal(report.evidenceBase.totalObservedItems, 0);
  assert.equal(report.evidenceBase.supporting.length, 0);
  assert.equal(report.evidenceBase.syntheticOrSimulated.length, 1);
  assert.equal(report.evidenceBase.syntheticOrSimulated[0].evidenceAuthenticity, "SYNTHETIC_SIMULATED");
  assert.equal(report.evidenceBase.syntheticOrSimulated[0].permittedUse, "TEST_OR_METHOD_VALIDATION_ONLY");
  assert.equal(report.evidenceBase.syntheticOrSimulated[0].canValidateRealWorldProposition, false);
  assert.equal(report.evidenceBase.syntheticOrSimulated[0].canSatisfyHumanGate, false);
  assert.equal(report.propositionStatus.status, "INSUFFICIENT_EVIDENCE");
  assert.equal(report.propositionStatus.validationProcessStatus, "EVALUATION_THRESHOLD_NOT_MET");
  assert.equal(report.sourceQualityAssessment.length, 0);
});

test("Human Gate resolution references Evidence Items without duplicating their payload", () => {
  let state = makeProject();
  state.humanGates = [{
    id: "gate_reference_test",
    projectId: state.id,
    cycle: 0,
    status: "OPEN",
    gateType: "HUMAN_REAL_WORLD_INPUT_REQUIRED",
    question: "What did the real-world test show?",
    requiredInput: "Supply the test result in the Evidence Register.",
    why: "The result is private.",
    unresolvedUncertainty: ["Real-world behavior remains unknown."],
    createdAt: state.createdAt,
    resolvedAt: "",
    resolutionType: "",
    resolution: "",
    evidenceIds: []
  }];
  const added = manageProjectState(state, {
    type: "UPSERT_EVIDENCE",
    reason: "Record the actual test result once.",
    item: {
      claim: "A completed field test observed the requested behavior.",
      intakeType: "TEST_RESULT",
      evidenceAuthenticity: "REAL_WORLD",
      provenanceOrigin: "REAL_WORLD_TEST_OBSERVATION",
      sourceClassification: "PRIMARY_SOURCE",
      sourceCategory: "EXPERIMENT_PILOT",
      reliability: "MODERATE",
      relationship: "SUPPORTS",
      collectionMethod: "FIELD_TEST",
      observation: "Observed behavior was recorded during the field test.",
      assessment: "A real-world result with a limited sample.",
      assumptionIds: [state.assumptions[0].id],
      questionRefs: ["What did the real-world test show?"]
    }
  }, { now: new Date("2026-07-18T12:11:00.000Z") });
  const evidenceId = added.state.evidence.at(-1).id;
  assert.throws(() => manageProjectState(added.state, {
    type: "RESOLVE_HUMAN_GATE", gateId: "gate_reference_test", resolutionType: "ENTER_TEST_RESULT",
    resolution: "The requested result is available.", reason: "Close the gate."
  }, { now: new Date("2026-07-18T12:12:00.000Z") }), /reference at least one active non-synthetic/i);
  const resolved = manageProjectState(added.state, {
    type: "RESOLVE_HUMAN_GATE",
    gateId: "gate_reference_test",
    resolutionType: "ENTER_TEST_RESULT",
    resolution: "Evidence Item supplied; no duplicate dataset is stored here.",
    evidenceIds: [evidenceId],
    reason: "The requested field-test result is now linked."
  }, { now: new Date("2026-07-18T12:13:00.000Z") });
  assert.equal(resolved.state.evidence.length, 1);
  assert.deepEqual(resolved.state.humanGates[0].evidenceIds, [evidenceId]);
  assert.match(resolved.state.humanGates[0].resolution, /no duplicate dataset/i);
});

test("unsupported project backup versions fail closed", () => {
  const backup = createProjectBackup(makeProject(), { now: fixedNow });
  assert.throws(
    () => importProjectBackup({ ...backup, formatVersion: 99 }, { now: fixedNow }),
    /Unsupported Rethink project backup format/i
  );
});

test("technical research failure is durable, redacted, non-evidentiary, and leaves the question open", () => {
  const initial = makeProject();
  const defined = applyDemo(initial, createDemoRouting(initial)).state;
  const routing = createDemoRouting(defined);
  const failed = manageProjectState(defined, {
    type: "RECORD_RESEARCH_FAILURE",
    research: {
      jobId: "research_failed_1",
      researchKey: "scope-key",
      projectId: defined.id,
      question: routing.highestLeverageQuestion,
      status: "FAILED",
      retryCount: 2,
      remainingGap: [routing.highestLeverageQuestion]
    },
    errorSummary: "The background response could not be retrieved.",
    technicalError: "Authorization: Bearer sk-secret-should-never-survive",
    jobState: "FAILED"
  }, { now: new Date("2026-07-18T12:02:00.000Z") });

  assert.equal(failed.state.evidence.length, defined.evidence.length);
  assert.equal(failed.state.researchHistory[0].executionStatus, "FAILED_TECHNICALLY");
  assert.equal(failed.state.researchHistory[0].evidenceOutcome, "NOT_EVALUATED");
  assert.equal(failed.state.questions.find((item) => item.text === routing.highestLeverageQuestion).status, "ACTIVE");
  assert.doesNotMatch(JSON.stringify(failed.state), /sk-secret-should-never-survive/);
  assert.match(failed.state.researchHistory[0].errorLog[0].technicalError, /REDACTED/);
  assert.equal(failed.state.notebook.at(-1).researchExecutionStatus, "FAILED_TECHNICALLY");
});

test("proceeding after technical failure preserves the gap and returns routing to STM", () => {
  const initial = makeProject();
  const defined = applyDemo(initial, createDemoRouting(initial)).state;
  const routing = createDemoRouting(defined);
  const failed = manageProjectState(defined, {
    type: "RECORD_RESEARCH_FAILURE",
    research: { jobId: "research_failed_2", researchKey: "same-scope", question: routing.highestLeverageQuestion, retryCount: 0 },
    errorSummary: "The network request failed.",
    technicalError: "Network connection reset.",
    jobState: "FAILED"
  }, { now: new Date("2026-07-18T12:02:00.000Z") });
  const decided = manageProjectState(failed.state, {
    type: "DECIDE_AFTER_RESEARCH",
    action: "PROCEED_UNDER_UNCERTAINTY",
    research: failed.state.researchHistory[0],
    rationale: "Existing evidence is adequate for a limited reversible next step."
  }, { now: new Date("2026-07-18T12:03:00.000Z") });

  assert.equal(decided.state.currentDisposition, "PROCEED_UNDER_UNCERTAINTY");
  assert.equal(decided.state.evidence.length, 0);
  assert.equal(decided.state.humanDecisions.at(-1).systemRecommendation, "PUBLIC_RESEARCH_REQUIRED");
  assert.ok(decided.state.humanDecisions.at(-1).unresolvedUncertainty.includes(routing.highestLeverageQuestion));
  assert.equal(decided.state.researchHistory[0].userDecision, "PROCEED_UNDER_UNCERTAINTY");
  const reassessed = createDemoRouting(decided.state);
  assert.notEqual(reassessed.evidenceGate, "PUBLIC_RESEARCH_REQUIRED");
});

test("completed inconclusive research remains distinct from technical failure and does not resolve its question", () => {
  const initial = makeProject();
  const defined = applyDemo(initial, createDemoRouting(initial)).state;
  const routing = createDemoRouting(defined);
  const output = createDemoCycle(defined, routing);
  const completed = applyCycleOutput(defined, routing, output, {
    mode: "live",
    model: "gpt-5.6-sol",
    research: {
      jobId: "research_inconclusive",
      researchKey: "inconclusive-scope",
      question: routing.highestLeverageQuestion,
      executionStatus: "COMPLETED",
      evidenceOutcome: "NO_RELEVANT_EVIDENCE_FOUND",
      researchScope: { supportingSearch: "support", disconfirmingSearch: "disconfirm" }
    }
  }, { now: new Date("2026-07-18T12:02:00.000Z") });

  const record = completed.state.researchHistory.at(-1);
  assert.equal(record.executionStatus, "COMPLETED");
  assert.equal(record.evidenceOutcome, "NO_RELEVANT_EVIDENCE_FOUND");
  assert.equal(completed.state.questions.find((item) => item.text === routing.highestLeverageQuestion).status, "ACTIVE");
  assert.notEqual(record.evidenceOutcome, "NOT_EVALUATED");
  const report = createProjectReport(completed.state);
  assert.equal(report.researchConducted.at(-1).executionStatus, "COMPLETED");
  assert.equal(report.researchConducted.at(-1).evidenceOutcome, "NO_RELEVANT_EVIDENCE_FOUND");
});
