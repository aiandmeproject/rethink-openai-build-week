import assert from "node:assert/strict";
import test from "node:test";
import {
  ABSENCE_INFERENCE_STATUSES,
  CAPABILITY_OVERALL_FIT_STATUSES,
  CORE_SCOPE_DIMENSION_TYPES,
  DETECTION_CAPABILITY_STATUSES,
  REASONING_INTEGRITY_ANALYSIS_STATUSES,
  REASONING_INTEGRITY_LEDGER_VERSION,
  SCOPE_DIMENSION_FIT_STATUSES,
  analyzeClaimReasoningIntegrity,
  analyzeProjectReasoningIntegrity,
  createEmptyReasoningIntegrityLedger,
  listCapabilityAssessments,
  normalizeReasoningIntegrityLedger,
  removeCapabilityAssessment,
  upsertCapabilityAssessment,
  validateCapabilityAssessment,
  validateReasoningIntegrityLedger,
  validateScopeDimension
} from "../rethink-reasoning-integrity.js";
import {
  analyzeProjectClaimReasoningIntegrity,
  analyzeProjectReasoningIntegrity as analyzeProjectIntegrityFromState,
  applyCycleOutput,
  applyMethodOverride,
  createDemoCycle,
  createDemoRouting,
  createNotebookExport,
  createProjectBackup,
  createProjectReport,
  importProjectBackup,
  initializeProject,
  lockProjectState,
  manageProjectState,
  normalizeProjectState
} from "../rethink-engine.js";
import { buildCycleInput, buildRoutingInput } from "../rethink-prompt.js";
import { createHumanReportArtifact } from "../public/report-export.js";
import { createLocalProjectRepository } from "../public/project-repository.js";

const fixedNow = new Date("2026-07-24T12:00:00.000Z");
const AS_OF = fixedNow.toISOString();

function at(minutes) {
  return new Date(fixedNow.getTime() + minutes * 60_000);
}

function project(input = "A contractor equipment uptime service needs evidence-capability validation.") {
  return initializeProject(input, { now: fixedNow });
}

function relationshipRecord(id, claimId, evidenceId, relationship = "SUPPORTS", status = "ACTIVE") {
  return {
    id,
    claimId,
    evidenceId,
    relationship,
    status,
    notes: "",
    createdAt: AS_OF,
    updatedAt: AS_OF,
    removedAt: status === "REMOVED" ? AS_OF : "",
    removedReason: status === "REMOVED" ? "Retained historical relationship." : ""
  };
}

function dimension(dimensionType = "POPULATION", fitStatus = "MATCHED", extra = {}) {
  return {
    dimension: dimensionType,
    claimScope: "All contractor equipment at the named operating site.",
    evidenceScope: "The inspected contractor equipment at the named operating site.",
    fitStatus,
    rationale: "The recorded scopes are compared explicitly for this relationship.",
    ...extra
  };
}

function capabilityInput(claimEvidenceRelationshipId, extra = {}) {
  return {
    claimEvidenceRelationshipId,
    overallFit: "FIT",
    scopeDimensions: [dimension()],
    detectionMaterial: false,
    detectionCapability: "NOT_APPLICABLE",
    absenceInferenceStatus: "NOT_APPLICABLE",
    rationale: "The Evidence Item is capable of bearing on this claim within the recorded scope.",
    notes: "",
    ...extra
  };
}

function capabilityRecord(id, claimEvidenceRelationshipId, extra = {}) {
  return {
    id,
    ...capabilityInput(claimEvidenceRelationshipId),
    status: "ACTIVE",
    createdAt: AS_OF,
    updatedAt: AS_OF,
    removedAt: "",
    removedReason: "",
    ...extra
  };
}

function addEvidence(state, claim, minutes, extra = {}) {
  return manageProjectState(state, {
    type: "UPSERT_EVIDENCE",
    reason: "Recorded evidence for Reasoning Integrity verification.",
    item: {
      claim,
      intakeType: "TEST_RESULT",
      provenanceOrigin: "USER_INPUT",
      reliability: "MODERATE",
      relationship: "NONE_UNLINKED",
      assessment: "A canonical Evidence Item for capability testing.",
      assumptionIds: [],
      questionRefs: [],
      ...extra
    }
  }, { now: at(minutes) });
}

function addClaim(state, text, status, minutes) {
  return manageProjectState(state, {
    type: "UPSERT_CLAIM",
    reason: "Recorded an explicit claim for Reasoning Integrity verification.",
    item: { text, type: "MATERIAL", status, notes: "" }
  }, { now: at(minutes) });
}

function linkClaimEvidence(state, claimId, evidenceId, relationship, minutes) {
  return manageProjectState(state, {
    type: "UPSERT_CLAIM_EVIDENCE_RELATIONSHIP",
    reason: "Recorded the canonical claim-specific evidence meaning.",
    item: { claimId, evidenceId, relationship, notes: "" }
  }, { now: at(minutes) });
}

function addCapability(state, claimEvidenceRelationshipId, minutes, extra = {}) {
  return manageProjectState(state, {
    type: "UPSERT_CAPABILITY_ASSESSMENT",
    reason: "Recorded an explicit claim-specific capability assessment.",
    item: capabilityInput(claimEvidenceRelationshipId, extra)
  }, { now: at(minutes) });
}

function addRoot(state, evidenceIds, minutes, {
  title = "Foundational contractor inspection record",
  originRole = "FOUNDATIONAL"
} = {}) {
  const artifactResult = manageProjectState(state, {
    type: "UPSERT_PROVENANCE_ARTIFACT",
    reason: "Recorded an explicit foundational origin.",
    item: { title, kind: "OFFICIAL_RECORD", originRole }
  }, { now: at(minutes) });
  state = artifactResult.state;
  let nextMinute = minutes + 1;
  for (const evidenceId of evidenceIds) {
    state = manageProjectState(state, {
      type: "UPSERT_PROVENANCE_RELATIONSHIP",
      reason: "Connected evidence to its explicit material origin.",
      item: {
        subjectType: "EVIDENCE_ITEM",
        subjectId: evidenceId,
        objectType: "PROVENANCE_ARTIFACT",
        objectId: artifactResult.artifact.id,
        relationship: "DERIVED_FROM"
      }
    }, { now: at(nextMinute) }).state;
    nextMinute += 1;
  }
  return { state, artifact: artifactResult.artifact, nextMinute };
}

function addTemporalAssessment(state, targetType, targetId, temporalStatus, minutes) {
  return manageProjectState(state, {
    type: "UPSERT_TEMPORAL_ASSESSMENT",
    reason: "Recorded an explicit as-of temporal assessment.",
    item: {
      targetType,
      targetId,
      temporalStatus,
      statusAsOf: AS_OF,
      rationale: `Explicit ${temporalStatus.toLowerCase()} assessment for integrity testing.`
    }
  }, { now: at(minutes) });
}

function linkedClaimFixture({
  claimStatus = "UNKNOWN",
  relationship = "SUPPORTS",
  synthetic = false
} = {}) {
  let state = project();
  const evidenceResult = addEvidence(state, "Observed contractor equipment result.", 1, synthetic ? {
    evidenceAuthenticity: "SYNTHETIC_SIMULATED",
    authenticityBasis: "EXPLICIT_TEST_FIXTURE"
  } : {});
  state = evidenceResult.state;
  const claimResult = addClaim(state, "The contractor equipment remains available during the stated interval.", claimStatus, 2);
  state = claimResult.state;
  const linkResult = linkClaimEvidence(
    state,
    claimResult.claim.id,
    state.evidence[0].id,
    relationship,
    3
  );
  return {
    state: linkResult.state,
    claim: claimResult.claim,
    evidence: linkResult.state.evidence[0],
    relationship: linkResult.relationship
  };
}

function rawAnalysisContext(state) {
  return {
    reasoningIntegrityLedger: state.reasoningIntegrityLedger,
    claimLedger: state.claimLedger,
    provenanceLedger: state.provenanceLedger,
    temporalLedger: state.temporalLedger,
    evidenceItems: state.evidence,
    linkableEvidenceIds: state.evidence
      .filter((item) => item.status === "ACTIVE")
      .map((item) => item.id),
    eligibleEvidenceIds: state.evidence
      .filter((item) =>
        item.status === "ACTIVE" && item.evidenceAuthenticity !== "SYNTHETIC_SIMULATED"
      )
      .map((item) => item.id)
  };
}

function memoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };
}

test("Reasoning Integrity Ledger contract is versioned, Core-neutral, explicit, and extensible", () => {
  assert.equal(REASONING_INTEGRITY_LEDGER_VERSION, 1);
  assert.deepEqual(createEmptyReasoningIntegrityLedger(), {
    version: 1,
    capabilityAssessments: []
  });
  assert.deepEqual(CAPABILITY_OVERALL_FIT_STATUSES, ["UNKNOWN", "FIT", "PARTIAL", "NOT_FIT"]);
  assert.deepEqual(SCOPE_DIMENSION_FIT_STATUSES, [
    "MATCHED", "PARTIAL", "MISMATCHED", "UNKNOWN", "NOT_APPLICABLE"
  ]);
  assert.deepEqual(DETECTION_CAPABILITY_STATUSES, [
    "UNKNOWN", "ADEQUATE", "LIMITED", "INADEQUATE", "NOT_APPLICABLE"
  ]);
  assert.deepEqual(ABSENCE_INFERENCE_STATUSES, [
    "NOT_APPLICABLE", "SUPPORTED", "LIMITED", "UNSUPPORTED"
  ]);
  assert.deepEqual(REASONING_INTEGRITY_ANALYSIS_STATUSES, [
    "RESOLVED", "PARTIAL", "UNRESOLVED"
  ]);
  assert.ok(CORE_SCOPE_DIMENSION_TYPES.includes("GENERALIZABILITY"));
  assert.equal(validateScopeDimension(dimension("DEPLOYMENT_CONTEXT")).dimension, "DEPLOYMENT_CONTEXT");
  assert.throws(
    () => validateReasoningIntegrityLedger({ version: 2, capabilityAssessments: [] }),
    /unsupported Reasoning Integrity Ledger version/i
  );
});

test("Capability Assessment validation keeps endpoints canonical and scope dimensions strict", () => {
  const valid = capabilityRecord("CA1", "R1");
  assert.equal(validateCapabilityAssessment(valid), valid);
  assert.throws(
    () => validateCapabilityAssessment({ ...valid, claimId: "C1" }),
    /must not duplicate claimId/i
  );
  assert.throws(
    () => validateCapabilityAssessment({
      ...valid,
      scopeDimensions: [dimension("population")]
    }),
    /uppercase extensible dimension token/i
  );
  assert.throws(
    () => validateCapabilityAssessment({
      ...valid,
      scopeDimensions: [dimension(), dimension()]
    }),
    /duplicate scope dimension/i
  );
  assert.throws(
    () => validateCapabilityAssessment({
      ...valid,
      scopeDimensions: [dimension("POPULATION", "PERFECT")]
    }),
    /fitStatus/i
  );
  assert.throws(
    () => validateCapabilityAssessment({ ...valid, removedAt: AS_OF }),
    /while active/i
  );
  assert.throws(
    () => validateCapabilityAssessment({ ...valid, status: "REMOVED" }),
    /removedAt/i
  );
});

test("fit, detection, and absence-inference consistency rules fail closed without deriving fit", () => {
  const valid = capabilityRecord("CA1", "R1");
  assert.throws(
    () => validateCapabilityAssessment({
      ...valid,
      scopeDimensions: [dimension("POPULATION", "MISMATCHED")]
    }),
    /cannot be FIT.*MISMATCHED/i
  );
  assert.throws(
    () => validateCapabilityAssessment({
      ...valid,
      detectionMaterial: true,
      detectionCapability: "INADEQUATE"
    }),
    /material detection capability is INADEQUATE/i
  );
  assert.throws(
    () => validateCapabilityAssessment({
      ...valid,
      detectionMaterial: true,
      detectionCapability: "LIMITED",
      absenceInferenceStatus: "SUPPORTED"
    }),
    /ADEQUATE detection capability/i
  );
  assert.throws(
    () => validateCapabilityAssessment({
      ...valid,
      detectionMaterial: true,
      detectionCapability: "UNKNOWN",
      absenceInferenceStatus: "LIMITED"
    }),
    /ADEQUATE or LIMITED/i
  );
  assert.throws(
    () => validateCapabilityAssessment({
      ...valid,
      detectionMaterial: true,
      detectionCapability: "NOT_APPLICABLE"
    }),
    /cannot be NOT_APPLICABLE when detection is material/i
  );
  assert.throws(
    () => validateCapabilityAssessment({
      ...valid,
      detectionMaterial: false,
      detectionCapability: "ADEQUATE",
      absenceInferenceStatus: "SUPPORTED"
    }),
    /detectionMaterial must be true/i
  );
  assert.equal(validateCapabilityAssessment({
    ...valid,
    overallFit: "PARTIAL",
    scopeDimensions: [dimension("POPULATION", "MISMATCHED")],
    detectionMaterial: true,
    detectionCapability: "LIMITED",
    absenceInferenceStatus: "LIMITED"
  }).overallFit, "PARTIAL");
});

test("Capability Assessments have stable IDs, immutable targets, deterministic updates, and one active record per relationship", () => {
  const relationships = [
    relationshipRecord("R1", "C1", "E1"),
    relationshipRecord("R2", "C2", "E1")
  ];
  const created = upsertCapabilityAssessment(
    createEmptyReasoningIntegrityLedger(),
    capabilityInput("R1"),
    { now: at(1), claimEvidenceRelationships: relationships }
  );
  assert.match(created.assessment.id, /^capability_assessment_/);
  const unchanged = upsertCapabilityAssessment(
    created.ledger,
    capabilityInput("R1"),
    { now: at(2), claimEvidenceRelationships: relationships }
  );
  assert.equal(unchanged.unchanged, true);
  assert.equal(unchanged.assessment.updatedAt, created.assessment.updatedAt);
  const updated = upsertCapabilityAssessment(created.ledger, {
    ...capabilityInput("R1"),
    overallFit: "PARTIAL",
    scopeDimensions: [dimension("POPULATION", "PARTIAL")]
  }, { now: at(3), claimEvidenceRelationships: relationships });
  assert.equal(updated.assessment.id, created.assessment.id);
  assert.equal(updated.assessment.createdAt, created.assessment.createdAt);
  assert.throws(
    () => upsertCapabilityAssessment(updated.ledger, {
      id: updated.assessment.id,
      ...capabilityInput("R2")
    }, { now: at(4), claimEvidenceRelationships: relationships }),
    /cannot be reassigned/i
  );
  assert.throws(
    () => upsertCapabilityAssessment(updated.ledger, capabilityInput("missing"), {
      now: at(4),
      claimEvidenceRelationships: relationships
    }),
    /does not exist/i
  );
  const duplicate = structuredClone(updated.ledger);
  duplicate.capabilityAssessments.push({
    ...capabilityRecord("CA_DUPLICATE", "R1"),
    createdAt: at(5).toISOString(),
    updatedAt: at(5).toISOString()
  });
  assert.throws(
    () => validateReasoningIntegrityLedger(duplicate, {
      claimEvidenceRelationships: relationships
    }),
    /duplicate active Capability Assessment/i
  );
});

test("Capability Assessment removal is soft and retained relationships preserve historical inspection", () => {
  const active = relationshipRecord("R1", "C1", "E1");
  const created = upsertCapabilityAssessment(
    createEmptyReasoningIntegrityLedger(),
    capabilityInput("R1"),
    { now: at(1), claimEvidenceRelationships: [active] }
  );
  const removedRelationship = { ...active, status: "REMOVED", removedAt: at(2).toISOString(), removedReason: "Retired." };
  assert.equal(normalizeReasoningIntegrityLedger(created.ledger, {
    claimEvidenceRelationships: [removedRelationship]
  }).capabilityAssessments.length, 1);
  assert.throws(
    () => upsertCapabilityAssessment(createEmptyReasoningIntegrityLedger(), capabilityInput("R1"), {
      now: at(2),
      claimEvidenceRelationships: [removedRelationship]
    }),
    /only an active Claim Ledger relationship/i
  );
  const removed = removeCapabilityAssessment(created.ledger, created.assessment.id, {
    reason: "The explicit capability assessment is no longer current.",
    now: at(3),
    claimEvidenceRelationships: [removedRelationship]
  });
  assert.equal(removed.assessment.status, "REMOVED");
  assert.equal(listCapabilityAssessments(removed.ledger).length, 0);
  assert.equal(listCapabilityAssessments(removed.ledger, { includeRemoved: true }).length, 1);
  assert.throws(
    () => upsertCapabilityAssessment(removed.ledger, {
      id: removed.assessment.id,
      notes: "Cannot revive history."
    }, { now: at(4), claimEvidenceRelationships: [removedRelationship] }),
    /does not exist or has been removed/i
  );
});

test("new and legacy projects receive an empty ledger without fabricated capability state or history", () => {
  const initialized = project();
  assert.deepEqual(initialized.reasoningIntegrityLedger, createEmptyReasoningIntegrityLedger());
  const legacy = structuredClone(initialized);
  delete legacy.reasoningIntegrityLedger;
  const notebookBefore = structuredClone(legacy.notebook);
  const eventsBefore = structuredClone(legacy.stateEvents);
  const updatedAtBefore = legacy.updatedAt;
  const normalized = normalizeProjectState(legacy);
  assert.deepEqual(normalized.reasoningIntegrityLedger, createEmptyReasoningIntegrityLedger());
  assert.deepEqual(normalized.notebook, notebookBefore);
  assert.deepEqual(normalized.stateEvents, eventsBefore);
  assert.equal(normalized.updatedAt, updatedAtBefore);
  assert.equal(normalized.reasoningIntegrityLedger.capabilityAssessments.length, 0);
});

test("Core capability mutations are reason-gated, audited, stable, and do not mutate claim meaning", () => {
  const fixture = linkedClaimFixture({ claimStatus: "SUPPORTED" });
  const claimBefore = structuredClone(fixture.state.claimLedger.claims[0]);
  const relationshipBefore = structuredClone(fixture.relationship);
  const created = addCapability(fixture.state, fixture.relationship.id, 4);
  assert.equal(created.state.stateEvents.at(-1).entityType, "CAPABILITY_ASSESSMENT");
  assert.equal(created.state.notebook.at(-1).entryType, "STATE_EDIT");
  assert.equal(created.state.notebook.at(-1).stateEventId, created.state.stateEvents.at(-1).id);
  assert.deepEqual(created.state.claimLedger.claims[0], claimBefore);
  assert.deepEqual(created.state.claimLedger.evidenceRelationships[0], relationshipBefore);
  assert.throws(
    () => manageProjectState(created.state, {
      type: "UPSERT_CAPABILITY_ASSESSMENT",
      reason: "",
      item: { id: created.assessment.id, notes: "Untraced update." }
    }, { now: at(5) }),
    /reason/i
  );
  const removed = manageProjectState(created.state, {
    type: "REMOVE_CAPABILITY_ASSESSMENT",
    id: created.assessment.id,
    reason: "Retired the explicit capability assessment while preserving history."
  }, { now: at(6) });
  assert.equal(removed.assessment.status, "REMOVED");
  assert.deepEqual(removed.state.claimLedger.claims[0], claimBefore);
  assert.deepEqual(removed.state.claimLedger.evidenceRelationships[0], relationshipBefore);
});

test("removing a Claim Ledger relationship or Evidence Item excludes current analysis without erasing capability history", () => {
  const fixture = linkedClaimFixture();
  let state = addCapability(fixture.state, fixture.relationship.id, 4).state;
  state = manageProjectState(state, {
    type: "REMOVE_CLAIM_EVIDENCE_RELATIONSHIP",
    id: fixture.relationship.id,
    reason: "Retired the current relationship while preserving its audited history."
  }, { now: at(5) }).state;
  assert.equal(state.reasoningIntegrityLedger.capabilityAssessments.length, 1);
  assert.equal(state.reasoningIntegrityLedger.capabilityAssessments[0].status, "ACTIVE");
  let analysis = analyzeProjectClaimReasoningIntegrity(state, {
    claimId: fixture.claim.id,
    asOf: AS_OF
  });
  assert.equal(analysis.activeRelationshipIds.length, 0);
  assert.equal(analysis.capabilityAssessedRelationshipIds.length, 0);

  const second = linkedClaimFixture();
  state = addCapability(second.state, second.relationship.id, 4).state;
  state = manageProjectState(state, {
    type: "REMOVE_EVIDENCE",
    id: second.evidence.id,
    reason: "Removed the Evidence Item from current use while preserving history."
  }, { now: at(5) }).state;
  assert.equal(state.evidence[0].status, "REMOVED");
  assert.equal(state.claimLedger.evidenceRelationships[0].status, "REMOVED");
  assert.equal(state.reasoningIntegrityLedger.capabilityAssessments.length, 1);
  analysis = analyzeProjectClaimReasoningIntegrity(state, {
    claimId: second.claim.id,
    asOf: AS_OF
  });
  assert.equal(analysis.activeRelationshipIds.length, 0);
});

test("capability remains claim-specific when the same Evidence Item bears differently on two claims", () => {
  let state = project();
  state = addEvidence(state, "One observed equipment inspection.", 1).state;
  const firstClaim = addClaim(state, "The inspected equipment was operational.", "UNKNOWN", 2);
  state = firstClaim.state;
  const secondClaim = addClaim(state, "All contractor equipment is always operational.", "UNKNOWN", 3);
  state = secondClaim.state;
  const firstLink = linkClaimEvidence(state, firstClaim.claim.id, state.evidence[0].id, "SUPPORTS", 4);
  state = firstLink.state;
  const secondLink = linkClaimEvidence(state, secondClaim.claim.id, state.evidence[0].id, "SUPPORTS", 5);
  state = secondLink.state;
  state = addCapability(state, firstLink.relationship.id, 6, {
    overallFit: "FIT",
    scopeDimensions: [dimension("POPULATION", "MATCHED")]
  }).state;
  state = addCapability(state, secondLink.relationship.id, 7, {
    overallFit: "NOT_FIT",
    scopeDimensions: [dimension("GENERALIZABILITY", "MISMATCHED")]
  }).state;
  assert.equal(state.reasoningIntegrityLedger.capabilityAssessments.length, 2);
  assert.ok(!Object.hasOwn(state.evidence[0], "overallFit"));
  assert.equal(
    analyzeProjectClaimReasoningIntegrity(state, {
      claimId: firstClaim.claim.id,
      asOf: AS_OF
    }).fitGroups.FIT.length,
    1
  );
  assert.equal(
    analyzeProjectClaimReasoningIntegrity(state, {
      claimId: secondClaim.claim.id,
      asOf: AS_OF
    }).fitGroups.NOT_FIT.length,
    1
  );
});

test("claim analysis groups explicit fit and surfaces scope boundaries without rewriting the claim", () => {
  const fixture = linkedClaimFixture({ claimStatus: "SUPPORTED" });
  const claimBefore = structuredClone(fixture.claim);
  const state = addCapability(fixture.state, fixture.relationship.id, 4, {
    overallFit: "PARTIAL",
    scopeDimensions: [
      dimension("POPULATION", "MISMATCHED"),
      dimension("SETTING", "PARTIAL")
    ]
  }).state;
  const analysis = analyzeProjectClaimReasoningIntegrity(state, {
    claimId: fixture.claim.id,
    asOf: AS_OF
  });
  assert.deepEqual(analysis.fitGroups.PARTIAL, [fixture.relationship.id]);
  assert.equal(analysis.scopeMismatches.length, 2);
  assert.ok(analysis.integrityWarnings.includes("CLAIM_EXCEEDS_EVIDENCE_SCOPE"));
  assert.ok(analysis.integrityWarnings.includes("EVIDENCE_SCOPE_MISMATCH"));
  assert.ok(analysis.integrityWarnings.includes("EVIDENCE_SCOPE_PARTIAL"));
  assert.deepEqual(state.claimLedger.claims[0], claimBefore);
  assert.equal(state.claimLedger.evidenceRelationships[0].relationship, "SUPPORTS");
});

test("detection and absence-inference weaknesses remain explicit warnings rather than negative findings", () => {
  const fixture = linkedClaimFixture({ relationship: "CONTRADICTS" });
  let state = addCapability(fixture.state, fixture.relationship.id, 4, {
    overallFit: "PARTIAL",
    scopeDimensions: [dimension("METHOD", "PARTIAL")],
    detectionMaterial: true,
    detectionCapability: "LIMITED",
    absenceInferenceStatus: "LIMITED"
  }).state;
  let analysis = analyzeProjectClaimReasoningIntegrity(state, {
    claimId: fixture.claim.id,
    asOf: AS_OF
  });
  assert.ok(analysis.integrityWarnings.includes("DETECTION_CAPABILITY_LIMITED"));
  assert.ok(analysis.integrityWarnings.includes("ABSENCE_INFERENCE_LIMITED"));
  assert.equal(state.claimLedger.evidenceRelationships[0].relationship, "CONTRADICTS");
  state = manageProjectState(state, {
    type: "UPSERT_CAPABILITY_ASSESSMENT",
    reason: "Recorded that non-detection cannot support an absence inference.",
    item: {
      id: state.reasoningIntegrityLedger.capabilityAssessments[0].id,
      absenceInferenceStatus: "UNSUPPORTED",
      detectionCapability: "INADEQUATE",
      detectionMaterial: true,
      overallFit: "PARTIAL"
    }
  }, { now: at(5) }).state;
  analysis = analyzeProjectClaimReasoningIntegrity(state, {
    claimId: fixture.claim.id,
    asOf: AS_OF
  });
  assert.ok(analysis.integrityWarnings.includes("DETECTION_CAPABILITY_INADEQUATE"));
  assert.ok(analysis.integrityWarnings.includes("ABSENCE_INFERENCE_UNSUPPORTED"));
  assert.equal(state.claimLedger.claims[0].status, "UNKNOWN");
});

test("independent-chain safeguards distinguish Evidence Item count from roots and preserve shared support/contradiction origin", () => {
  let state = project();
  state = addEvidence(state, "First document summarizing the inspection.", 1).state;
  state = addEvidence(state, "Second document summarizing the same inspection.", 2).state;
  const claimResult = addClaim(state, "The contractor equipment met the inspection threshold.", "UNKNOWN", 3);
  state = claimResult.state;
  const support = linkClaimEvidence(state, claimResult.claim.id, state.evidence[0].id, "SUPPORTS", 4);
  state = support.state;
  const contradict = linkClaimEvidence(state, claimResult.claim.id, state.evidence[1].id, "CONTRADICTS", 5);
  state = contradict.state;
  state = addCapability(state, support.relationship.id, 6).state;
  state = addCapability(state, contradict.relationship.id, 7).state;
  const rooted = addRoot(state, state.evidence.map((item) => item.id), 8);
  state = rooted.state;
  state = addTemporalAssessment(state, "EVIDENCE_ITEM", state.evidence[0].id, "CURRENT", 12).state;
  state = addTemporalAssessment(state, "EVIDENCE_ITEM", state.evidence[1].id, "CURRENT", 13).state;
  state = addTemporalAssessment(state, "PROVENANCE_ARTIFACT", rooted.artifact.id, "CURRENT", 14).state;
  const analysis = analyzeProjectClaimReasoningIntegrity(state, {
    claimId: claimResult.claim.id,
    asOf: AS_OF
  });
  assert.equal(analysis.independentChains.SUPPORTS.evidenceItemCount, 1);
  assert.equal(analysis.independentChains.SUPPORTS.knownIndependentFoundationalRootCount, 1);
  assert.equal(analysis.independentChains.CONTRADICTS.evidenceItemCount, 1);
  assert.equal(analysis.independentChains.CONTRADICTS.knownIndependentFoundationalRootCount, 1);
  assert.deepEqual(
    analysis.sharedFoundationalRootsAcrossRelationshipTypes[0].foundationalRootIds,
    [rooted.artifact.id]
  );
  assert.equal(state.claimLedger.evidenceRelationships[0].relationship, "SUPPORTS");
  assert.equal(state.claimLedger.evidenceRelationships[1].relationship, "CONTRADICTS");
});

test("multiple Evidence Items from one root produce one known chain and unresolved origins never become independent support", () => {
  let state = project();
  state = addEvidence(state, "First derivative source.", 1).state;
  state = addEvidence(state, "Second derivative source.", 2).state;
  state = addEvidence(state, "Unresolved source.", 3).state;
  const claimResult = addClaim(state, "The equipment pattern occurs across the recorded observations.", "UNKNOWN", 4);
  state = claimResult.state;
  const links = [];
  for (let index = 0; index < state.evidence.length; index += 1) {
    const linked = linkClaimEvidence(
      state,
      claimResult.claim.id,
      state.evidence[index].id,
      "SUPPORTS",
      5 + index
    );
    links.push(linked.relationship);
    state = linked.state;
    state = addCapability(state, linked.relationship.id, 9 + index).state;
  }
  const rooted = addRoot(state, state.evidence.slice(0, 2).map((item) => item.id), 13);
  state = rooted.state;
  const analysis = analyzeProjectClaimReasoningIntegrity(state, {
    claimId: claimResult.claim.id,
    asOf: AS_OF
  });
  assert.equal(analysis.independentChains.SUPPORTS.evidenceItemCount, 3);
  assert.equal(analysis.independentChains.SUPPORTS.knownIndependentFoundationalRootCount, 1);
  assert.deepEqual(analysis.independentChains.SUPPORTS.unresolvedOriginEvidenceIds, [state.evidence[2].id]);
  assert.ok(analysis.integrityWarnings.includes("MULTIPLE_ITEMS_SHARE_ONE_FOUNDATIONAL_CHAIN"));
  assert.ok(analysis.integrityWarnings.includes("SUPPORT_HAS_UNRESOLVED_ORIGIN"));
  assert.equal(links.length, 3);
});

test("synthetic FIT evidence remains ineligible for real-world chains, validation, and Human Gates", () => {
  const fixture = linkedClaimFixture({ claimStatus: "SUPPORTED", synthetic: true });
  let state = addCapability(fixture.state, fixture.relationship.id, 4).state;
  const rooted = addRoot(state, [fixture.evidence.id], 5, {
    title: "Synthetic foundational test fixture"
  });
  state = rooted.state;
  state = addTemporalAssessment(state, "EVIDENCE_ITEM", fixture.evidence.id, "CURRENT", 8).state;
  state = addTemporalAssessment(state, "PROVENANCE_ARTIFACT", rooted.artifact.id, "CURRENT", 9).state;
  const analysis = analyzeProjectClaimReasoningIntegrity(state, {
    claimId: fixture.claim.id,
    asOf: AS_OF
  });
  assert.deepEqual(analysis.fitGroups.FIT, [fixture.relationship.id]);
  assert.deepEqual(analysis.syntheticOrIneligibleEvidenceIds, [fixture.evidence.id]);
  assert.equal(analysis.independentChains.SUPPORTS.knownIndependentFoundationalRootCount, 0);
  assert.ok(
    analysis.claimStatusConsistencyWarnings.includes(
      "CLAIM_MARKED_SUPPORTED_WITH_ONLY_SYNTHETIC_SUPPORT"
    )
  );
  const report = createProjectReport(state, { now: fixedNow });
  assert.equal(report.evidenceBase.totalObservedItems, 0);
  assert.equal(report.evidenceBase.syntheticOrSimulated.length, 1);
  assert.equal(report.provenance.summary.knownIndependentChainCount, 0);
});

test("explicit temporal analysis is composed without copying temporal state into capability records", () => {
  const fixture = linkedClaimFixture({ claimStatus: "SUPPORTED" });
  let state = addCapability(fixture.state, fixture.relationship.id, 4).state;
  const rooted = addRoot(state, [fixture.evidence.id], 5);
  state = rooted.state;
  state = addTemporalAssessment(state, "EVIDENCE_ITEM", fixture.evidence.id, "HISTORICAL", 8).state;
  state = addTemporalAssessment(state, "PROVENANCE_ARTIFACT", rooted.artifact.id, "OUTDATED", 9).state;
  const analysis = analyzeProjectClaimReasoningIntegrity(state, {
    claimId: fixture.claim.id,
    asOf: AS_OF
  });
  assert.ok(analysis.integrityWarnings.includes("SUPPORT_RELIES_ON_HISTORICAL_SOURCE"));
  assert.ok(analysis.integrityWarnings.includes("SUPPORT_RELIES_ON_OUTDATED_SOURCE"));
  assert.equal(analysis.temporalAnalysis.asOf, AS_OF);
  assert.ok(!Object.hasOwn(state.reasoningIntegrityLedger.capabilityAssessments[0], "temporalStatus"));
  const historical = analyzeProjectClaimReasoningIntegrity(state, {
    claimId: fixture.claim.id,
    asOf: "2025-07-24T12:00:00.000Z",
    purpose: "HISTORICAL_AS_OF"
  });
  assert.equal(historical.purpose, "HISTORICAL_AS_OF");
  assert.equal(historical.temporalAnalysis.purpose, "HISTORICAL_AS_OF");
});

test("disconfirmation coverage distinguishes none recorded, recorded, and materially unresolved", () => {
  const noDisconfirmation = linkedClaimFixture();
  let analysis = analyzeProjectClaimReasoningIntegrity(noDisconfirmation.state, {
    claimId: noDisconfirmation.claim.id,
    asOf: AS_OF
  });
  assert.equal(analysis.disconfirmationCoverage.status, "NONE_RECORDED");
  assert.ok(
    analysis.disconfirmationCoverage.warnings.includes(
      "NO_RECORDED_DISCONFIRMING_EVIDENCE"
    )
  );

  let state = project();
  state = addEvidence(state, "Contradicting inspected result.", 1).state;
  const claimResult = addClaim(state, "The equipment always met the threshold.", "UNKNOWN", 2);
  state = claimResult.state;
  const link = linkClaimEvidence(state, claimResult.claim.id, state.evidence[0].id, "CONTRADICTS", 3);
  state = addCapability(link.state, link.relationship.id, 4).state;
  const rooted = addRoot(state, [state.evidence[0].id], 5);
  state = rooted.state;
  state = addTemporalAssessment(state, "EVIDENCE_ITEM", state.evidence[0].id, "CURRENT", 8).state;
  state = addTemporalAssessment(state, "PROVENANCE_ARTIFACT", rooted.artifact.id, "CURRENT", 9).state;
  analysis = analyzeProjectClaimReasoningIntegrity(state, {
    claimId: claimResult.claim.id,
    asOf: AS_OF
  });
  assert.equal(analysis.disconfirmationCoverage.status, "RECORDED");

  const unresolved = linkedClaimFixture({ relationship: "LIMITS" });
  analysis = analyzeProjectClaimReasoningIntegrity(unresolved.state, {
    claimId: unresolved.claim.id,
    asOf: AS_OF
  });
  assert.equal(analysis.disconfirmationCoverage.status, "UNRESOLVED");
  assert.ok(
    analysis.disconfirmationCoverage.warnings.includes(
      "DISCONFIRMATION_CAPABILITY_UNRESOLVED"
    )
  );
  assert.ok(
    analysis.disconfirmationCoverage.warnings.includes(
      "DISCONFIRMATION_COVERAGE_UNRESOLVED"
    )
  );
});

test("claim-status consistency warnings are advisory across supported, contradicted, and insufficient claims", () => {
  let fixture = linkedClaimFixture({ claimStatus: "SUPPORTED" });
  let state = addCapability(fixture.state, fixture.relationship.id, 4, {
    overallFit: "NOT_FIT",
    scopeDimensions: [dimension("GENERALIZABILITY", "MISMATCHED")]
  }).state;
  let analysis = analyzeProjectClaimReasoningIntegrity(state, {
    claimId: fixture.claim.id,
    asOf: AS_OF
  });
  assert.ok(
    analysis.claimStatusConsistencyWarnings.includes(
      "CLAIM_MARKED_SUPPORTED_WITH_ONLY_NOT_FIT_SUPPORT"
    )
  );
  assert.ok(analysis.integrityWarnings.includes("CLAIM_STATUS_REQUIRES_REVIEW"));
  assert.equal(state.claimLedger.claims[0].status, "SUPPORTED");

  fixture = linkedClaimFixture({ claimStatus: "CONTRADICTED", relationship: "CONTRADICTS" });
  state = addCapability(fixture.state, fixture.relationship.id, 4, {
    overallFit: "NOT_FIT",
    scopeDimensions: [dimension("METHOD", "MISMATCHED")]
  }).state;
  analysis = analyzeProjectClaimReasoningIntegrity(state, {
    claimId: fixture.claim.id,
    asOf: AS_OF
  });
  assert.ok(
    analysis.claimStatusConsistencyWarnings.includes(
      "CLAIM_MARKED_CONTRADICTED_WITH_ONLY_NOT_FIT_CONTRADICTION"
    )
  );
  assert.equal(state.claimLedger.claims[0].status, "CONTRADICTED");

  fixture = linkedClaimFixture({ claimStatus: "INSUFFICIENT_EVIDENCE" });
  state = addCapability(fixture.state, fixture.relationship.id, 4).state;
  analysis = analyzeProjectClaimReasoningIntegrity(state, {
    claimId: fixture.claim.id,
    asOf: AS_OF
  });
  assert.ok(
    analysis.claimStatusConsistencyWarnings.includes(
      "CLAIM_MARKED_INSUFFICIENT_BUT_EVIDENCE_STATE_REQUIRES_REVIEW"
    )
  );
  assert.equal(state.claimLedger.claims[0].status, "INSUFFICIENT_EVIDENCE");

  const noSupport = addClaim(project(), "Stored supported claim without a support link.", "SUPPORTED", 1);
  analysis = analyzeProjectClaimReasoningIntegrity(noSupport.state, {
    claimId: noSupport.claim.id,
    asOf: AS_OF
  });
  assert.ok(
    analysis.claimStatusConsistencyWarnings.includes(
      "CLAIM_MARKED_SUPPORTED_WITH_NO_ACTIVE_SUPPORT"
    )
  );
});

test("project analysis derives warning lists without truth scores, claim ranking, or disposition changes", () => {
  let state = project();
  const emptyClaim = addClaim(state, "A claim with no active evidence relationships.", "UNKNOWN", 1);
  state = emptyClaim.state;
  state = addEvidence(state, "Narrow supporting result.", 2).state;
  const scopedClaim = addClaim(state, "A broad claim requiring a scope qualification.", "SUPPORTED", 3);
  state = scopedClaim.state;
  const link = linkClaimEvidence(state, scopedClaim.claim.id, state.evidence[0].id, "SUPPORTS", 4);
  state = addCapability(link.state, link.relationship.id, 5, {
    overallFit: "PARTIAL",
    scopeDimensions: [dimension("POPULATION", "PARTIAL")],
    detectionMaterial: true,
    detectionCapability: "LIMITED",
    absenceInferenceStatus: "LIMITED"
  }).state;
  const dispositionBefore = state.currentDisposition;
  const analysis = analyzeProjectIntegrityFromState(state, { asOf: AS_OF });
  assert.equal(analysis.totalExplicitClaims, 2);
  assert.ok(analysis.claimsWithNoActiveEvidenceRelationships.includes(emptyClaim.claim.id));
  assert.ok(analysis.claimsWithOnlyPartialOrNotFitSupport.includes(scopedClaim.claim.id));
  assert.ok(analysis.claimsWithUnsupportedAbsenceInference.includes(scopedClaim.claim.id));
  assert.ok(analysis.claimsWithNoRecordedDisconfirmingEvidence.includes(scopedClaim.claim.id));
  assert.equal(state.currentDisposition, dispositionBefore);
  assert.ok(!Object.hasOwn(analysis, "truthScore"));
  assert.ok(!Object.hasOwn(analysis, "claimRanking"));
  assert.ok(!JSON.stringify(analysis).includes("sourceCredibilityWeight"));
});

test("technical research failure is surfaced as uncertainty and never becomes absence evidence", () => {
  const fixture = linkedClaimFixture();
  const analysis = analyzeProjectReasoningIntegrity({
    ...rawAnalysisContext(fixture.state),
    asOf: AS_OF,
    researchHistory: [{
      status: "FAILED",
      executionStatus: "FAILED_TECHNICALLY",
      evidenceOutcome: "NOT_EVALUATED"
    }]
  });
  assert.equal(analysis.technicalFailureCount, 1);
  assert.ok(analysis.warningCodes.includes("TECHNICAL_FAILURE_IS_NOT_NEGATIVE_EVIDENCE"));
  assert.equal(
    analysis.claimAnalyses[0].disconfirmationCoverage.status,
    "NONE_RECORDED"
  );
  assert.equal(analysis.claimAnalyses[0].activeRelationships.CONTRADICTS.length, 0);
});

test("Capability state persists through cycles, locks, Notebook, reports, human export, and v1 backup/import", () => {
  const fixture = linkedClaimFixture();
  let state = addCapability(fixture.state, fixture.relationship.id, 4).state;
  const ledgerBefore = structuredClone(state.reasoningIntegrityLedger);
  const routing = applyMethodOverride(createDemoRouting(state));
  state = applyCycleOutput(
    state,
    routing,
    createDemoCycle(state, routing),
    { now: at(5) }
  ).state;
  assert.deepEqual(state.reasoningIntegrityLedger, ledgerBefore);
  const locked = lockProjectState(state, { note: "Reasoning Integrity snapshot", now: at(6) });
  assert.deepEqual(
    locked.state.lockedDecisions.at(-1).reasoningIntegrityLedger,
    ledgerBefore
  );
  const notebook = createNotebookExport(locked.state, { now: at(7) });
  assert.deepEqual(notebook.reasoningIntegrityLedger, ledgerBefore);
  const report = createProjectReport(locked.state, { now: at(8) });
  assert.deepEqual(report.reasoningIntegrity.capabilityAssessments, ledgerBefore.capabilityAssessments);
  assert.equal(report.reasoningIntegrity.analysisAsOf, at(8).toISOString());
  assert.equal(report.reasoningIntegrity.analysis.claimAnalyses.length, 1);
  const human = createHumanReportArtifact(report);
  assert.match(human.content, /Reasoning Integrity/);
  assert.match(human.content, /Evidence Item count is not independent-chain count/i);
  assert.match(human.content, /does not automatically validate/i);
  const backup = createProjectBackup(locked.state, { now: at(9) });
  assert.equal(backup.formatVersion, 1);
  const restored = importProjectBackup(backup, { now: at(10) });
  assert.deepEqual(restored.reasoningIntegrityLedger, ledgerBefore);
});

test("normalization plus v1 and v2 import reject malformed Capability state and preserve valid resumable state", () => {
  const fixture = linkedClaimFixture();
  const valid = addCapability(fixture.state, fixture.relationship.id, 4).state;
  const malformed = structuredClone(valid);
  malformed.reasoningIntegrityLedger.capabilityAssessments[0].claimEvidenceRelationshipId = "missing_relationship";
  assert.throws(() => normalizeProjectState(malformed), /unknown Claim Ledger relationship/i);
  for (const formatVersion of [1, 2]) {
    assert.throws(() => importProjectBackup({
      format: "rethink.project.backup",
      formatVersion,
      exportedAt: AS_OF,
      projectId: malformed.id,
      project: malformed,
      ...(formatVersion === 2 ? {
        runtimeSession: {
          mode: "demo",
          routing: { projectId: malformed.id },
          reasoning: { projectId: malformed.id, status: "PENDING" }
        }
      } : {})
    }, { now: fixedNow }), /unknown Claim Ledger relationship/i);
  }
  for (const formatVersion of [1, 2]) {
    const backup = {
      format: "rethink.project.backup",
      formatVersion,
      exportedAt: AS_OF,
      projectId: valid.id,
      project: valid,
      ...(formatVersion === 2 ? {
        runtimeSession: {
          mode: "demo",
          routing: { projectId: valid.id },
          reasoning: { projectId: valid.id, status: "PENDING" }
        }
      } : {})
    };
    const restored = importProjectBackup(backup, { now: at(5) });
    assert.deepEqual(restored.reasoningIntegrityLedger, valid.reasoningIntegrityLedger);
  }
});

test("device-local persistence hydrates legacy state and preserves populated capability assessments across origins", () => {
  const legacyRepository = createLocalProjectRepository(memoryStorage());
  legacyRepository.saveSession({ state: { id: "legacy_local_project" }, routing: null, result: null });
  assert.deepEqual(
    legacyRepository.loadSession().state.reasoningIntegrityLedger,
    createEmptyReasoningIntegrityLedger()
  );

  const fixture = linkedClaimFixture();
  const state = addCapability(fixture.state, fixture.relationship.id, 4).state;
  const originA = createLocalProjectRepository(memoryStorage());
  const originB = createLocalProjectRepository(memoryStorage());
  originA.saveSession({ state, routing: null, result: null });
  const portable = originA.loadSession();
  originB.saveSession(portable);
  assert.deepEqual(
    originB.loadSession().state.reasoningIntegrityLedger,
    state.reasoningIntegrityLedger
  );
});

test("prompt context is bounded, explicit-as-of, claim-specific, and distinguishes stored assessments from derived warnings", () => {
  const fixture = linkedClaimFixture();
  const state = addCapability(fixture.state, fixture.relationship.id, 4, {
    overallFit: "PARTIAL",
    scopeDimensions: [dimension("POPULATION", "PARTIAL")],
    detectionMaterial: true,
    detectionCapability: "LIMITED",
    absenceInferenceStatus: "LIMITED"
  }).state;
  const routingPrompt = buildRoutingInput(state, { asOf: "2026-07-25T00:00:00.000Z" });
  const cyclePrompt = buildCycleInput(state, createDemoRouting(state), {
    asOf: "2026-07-25T00:00:00.000Z"
  });
  for (const prompt of [routingPrompt, cyclePrompt]) {
    assert.match(prompt, /"reasoningIntegrity"/);
    assert.match(prompt, /"storedLedger"/);
    assert.match(prompt, /"derivedAnalysis"/);
    assert.match(prompt, /"analysisAsOf": "2026-07-25T00:00:00.000Z"/);
    assert.match(prompt, /"overallFit": "PARTIAL"/);
    assert.match(prompt, /"EVIDENCE_SCOPE_PARTIAL"/);
    assert.match(prompt, /No recorded disconfirmation does not mean no disconfirmation exists/i);
    assert.match(prompt, /Technical failure and incomplete search are not substantive negative findings/i);
    assert.doesNotMatch(prompt, /unrelated_workforce_project/);
  }
  assert.ok(!Object.hasOwn(state.claimLedger.evidenceRelationships[0], "overallFit"));
});

test("empty Reasoning Integrity state preserves BUSINESS routing, contractor validation, Claim/Provenance/Temporal state, and Human Gates", () => {
  const state = initializeProject(
    "An equipment uptime contractor validates the service using maintenance records before hiring decisions.",
    { now: fixedNow }
  );
  const legacy = structuredClone(state);
  delete legacy.reasoningIntegrityLedger;
  const normalized = normalizeProjectState(legacy);
  assert.deepEqual(normalized.reasoningIntegrityLedger, createEmptyReasoningIntegrityLedger());
  assert.equal(normalized.domainProfile, "BUSINESS");
  assert.deepEqual(normalized.claimLedger, state.claimLedger);
  assert.deepEqual(normalized.provenanceLedger, state.provenanceLedger);
  assert.deepEqual(normalized.temporalLedger, state.temporalLedger);
  assert.deepEqual(normalized.humanGates, state.humanGates);
  const routeA = createDemoRouting(state);
  const routeB = createDemoRouting(normalized);
  assert.equal(routeB.selectedMethod, routeA.selectedMethod);
  assert.equal(routeB.evidenceGate, routeA.evidenceGate);
  const resultA = createDemoCycle(state, applyMethodOverride(routeA));
  const resultB = createDemoCycle(normalized, applyMethodOverride(routeB));
  assert.equal(resultB.evidenceEvaluation.propositionStatus, resultA.evidenceEvaluation.propositionStatus);
  assert.equal(resultB.nextAction.disposition, resultA.nextAction.disposition);
  assert.equal(routeB.selectedMethod, "DEFINE");
  const validateRoute = applyMethodOverride(routeB, "VALIDATE", normalized);
  const validation = createDemoCycle(normalized, validateRoute);
  assert.equal(validation.nextAction.disposition, "PUBLIC_RESEARCH_REQUIRED");
  assert.doesNotMatch(JSON.stringify(normalized), /workforce/i);
});
