import assert from "node:assert/strict";
import test from "node:test";
import {
  TEMPORAL_ANALYSIS_PURPOSES,
  TEMPORAL_ANALYSIS_STATUSES,
  TEMPORAL_LEDGER_VERSION,
  TEMPORAL_RELATIONSHIP_TYPES,
  TEMPORAL_STATUSES,
  TEMPORAL_TARGET_TYPES,
  analyzeClaimTemporalIntegrity,
  analyzeSourceChainTemporalIntegrity,
  analyzeTemporalIntegrity,
  createEmptyTemporalLedger,
  listTemporalAssessments,
  listTemporalRelationships,
  normalizeTemporalLedger,
  removeTemporalAssessment,
  removeTemporalRelationship,
  upsertTemporalAssessment,
  upsertTemporalRelationship,
  validateTemporalAssessment,
  validateTemporalLedger,
  validateTemporalRelationship
} from "../rethink-temporal.js";
import {
  analyzeProjectClaimTemporalIntegrity,
  analyzeProjectSourceChainTemporalIntegrity,
  analyzeProjectTemporalTarget,
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
import { analyzeIndependentEvidenceChains } from "../rethink-provenance.js";
import { buildCycleInput, buildRoutingInput } from "../rethink-prompt.js";
import { createHumanReportArtifact } from "../public/report-export.js";

const fixedNow = new Date("2026-07-24T12:00:00.000Z");
const AS_OF = "2026-07-24T12:00:00.000Z";

function at(minutes) {
  return new Date(fixedNow.getTime() + minutes * 60_000);
}

function assessmentInput(targetType, targetId, temporalStatus, extra = {}) {
  return {
    targetType,
    targetId,
    temporalStatus,
    statusAsOf: AS_OF,
    rationale: `Explicit ${temporalStatus.toLowerCase()} assessment for test coverage.`,
    ...extra
  };
}

function addAssessment(ledger, targetType, targetId, temporalStatus, minutes, options = {}) {
  return upsertTemporalAssessment(
    ledger,
    assessmentInput(targetType, targetId, temporalStatus, options.item),
    {
      now: at(minutes),
      evidenceIds: options.evidenceIds ?? ["E1", "E2", "E3", "E4"],
      artifactIds: options.artifactIds ?? ["A1", "A2", "A3", "A4"]
    }
  );
}

function addRelationship(ledger, relationship, minutes, options = {}) {
  return upsertTemporalRelationship(ledger, relationship, {
    now: at(minutes),
    evidenceIds: options.evidenceIds ?? ["E1", "E2", "E3", "E4"],
    artifactIds: options.artifactIds ?? ["A1", "A2", "A3", "A4"]
  });
}

function project(input = "A contractor equipment uptime service needs time-bounded source validation.") {
  return initializeProject(input, { now: fixedNow });
}

function addProjectEvidence(state, claim, minutes, extra = {}) {
  return manageProjectState(state, {
    type: "UPSERT_EVIDENCE",
    reason: "Recorded evidence for temporal-integrity verification.",
    item: {
      claim,
      intakeType: "TEST_RESULT",
      provenanceOrigin: "USER_INPUT",
      reliability: "MODERATE",
      relationship: "NONE_UNLINKED",
      assessment: "A canonical Evidence Item for temporal testing.",
      assumptionIds: [],
      questionRefs: [],
      ...extra
    }
  }, { now: at(minutes) }).state;
}

function addProjectArtifact(state, title, minutes, extra = {}) {
  return manageProjectState(state, {
    type: "UPSERT_PROVENANCE_ARTIFACT",
    reason: "Recorded an explicit source artifact for temporal verification.",
    item: {
      title,
      kind: "DOCUMENT",
      originRole: "UNKNOWN",
      ...extra
    }
  }, { now: at(minutes) });
}

function addProjectProvenanceRelationship(state, item, minutes) {
  return manageProjectState(state, {
    type: "UPSERT_PROVENANCE_RELATIONSHIP",
    reason: "Recorded explicit material provenance for temporal verification.",
    item
  }, { now: at(minutes) });
}

function addProjectTemporalAssessment(state, item, minutes) {
  return manageProjectState(state, {
    type: "UPSERT_TEMPORAL_ASSESSMENT",
    reason: "Recorded an explicit time-bounded assessment.",
    item
  }, { now: at(minutes) });
}

test("Temporal Ledger contract is versioned, Core-neutral, typed, and explicit", () => {
  assert.equal(TEMPORAL_LEDGER_VERSION, 1);
  assert.deepEqual(createEmptyTemporalLedger(), { version: 1, assessments: [], relationships: [] });
  assert.deepEqual(TEMPORAL_TARGET_TYPES, ["EVIDENCE_ITEM", "PROVENANCE_ARTIFACT"]);
  assert.deepEqual(TEMPORAL_STATUSES, [
    "UNKNOWN", "CURRENT", "HISTORICAL", "OUTDATED", "CORRECTED", "SUPERSEDED"
  ]);
  assert.deepEqual(TEMPORAL_RELATIONSHIP_TYPES, ["CORRECTS", "SUPERSEDES"]);
  assert.deepEqual(TEMPORAL_ANALYSIS_PURPOSES, ["CURRENT_STATE", "HISTORICAL_AS_OF"]);
  assert.deepEqual(TEMPORAL_ANALYSIS_STATUSES, ["RESOLVED", "PARTIAL", "UNRESOLVED"]);
  assert.equal(validateTemporalLedger(createEmptyTemporalLedger()).version, 1);
  assert.throws(
    () => validateTemporalLedger({ version: 2, assessments: [], relationships: [] }),
    /unsupported temporal ledger version/i
  );
});

test("assessment validation enforces typed targets, statuses, ISO dates, intervals, and removal metadata", () => {
  const valid = {
    id: "TA1",
    ...assessmentInput("EVIDENCE_ITEM", "E1", "CURRENT", {
      observedAt: "2026-07-20",
      publishedAt: "2026-07-21T12:00:00Z",
      effectiveFrom: "2026-01-01",
      effectiveTo: "2026-12-31",
      notes: "Explicit dates only."
    }),
    status: "ACTIVE",
    createdAt: AS_OF,
    updatedAt: AS_OF,
    removedAt: "",
    removedReason: ""
  };
  assert.equal(validateTemporalAssessment(valid), valid);
  for (const [field, value, pattern] of [
    ["targetType", "CLAIM", /targetType/i],
    ["temporalStatus", "RECENT", /temporalStatus/i],
    ["statusAsOf", "not-a-date", /statusAsOf/i],
    ["observedAt", "not-a-date", /observedAt/i]
  ]) {
    assert.throws(() => validateTemporalAssessment({ ...valid, [field]: value }), pattern);
  }
  assert.throws(
    () => validateTemporalAssessment({ ...valid, effectiveFrom: "2027-01-01", effectiveTo: "2026-01-01" }),
    /effectiveFrom cannot be after/i
  );
  assert.throws(
    () => validateTemporalAssessment({ ...valid, statusAsOf: "2025-12-31" }),
    /before effectiveFrom/i
  );
  assert.throws(
    () => validateTemporalAssessment({ ...valid, statusAsOf: "2027-01-01" }),
    /after effectiveTo/i
  );
  assert.throws(
    () => validateTemporalAssessment({ ...valid, removedAt: AS_OF }),
    /while active/i
  );
  assert.throws(
    () => validateTemporalAssessment({ ...valid, status: "REMOVED" }),
    /removedAt/i
  );
});

test("assessment creation, stable updates, deterministic duplicates, and soft removal preserve history", () => {
  const created = addAssessment(createEmptyTemporalLedger(), "EVIDENCE_ITEM", "E1", "UNKNOWN", 1);
  assert.match(created.assessment.id, /^temporal_assessment_/);
  assert.equal(listTemporalAssessments(created.ledger)[0].temporalStatus, "UNKNOWN");
  const updated = upsertTemporalAssessment(created.ledger, {
    targetType: "EVIDENCE_ITEM",
    targetId: "E1",
    temporalStatus: "CURRENT",
    statusAsOf: "2026-07-24T12:01:00Z",
    rationale: "Current as of the explicitly recorded review."
  }, { now: at(2), evidenceIds: ["E1"], artifactIds: [] });
  assert.equal(updated.assessment.id, created.assessment.id);
  assert.equal(updated.assessment.createdAt, created.assessment.createdAt);
  assert.equal(updated.ledger.assessments.length, 1);
  const unchanged = upsertTemporalAssessment(updated.ledger, {
    targetType: "EVIDENCE_ITEM",
    targetId: "E1",
    temporalStatus: "CURRENT",
    statusAsOf: "2026-07-24T12:01:00Z",
    rationale: "Current as of the explicitly recorded review."
  }, { now: at(3), evidenceIds: ["E1"], artifactIds: [] });
  assert.equal(unchanged.unchanged, true);
  assert.equal(unchanged.assessment.updatedAt, updated.assessment.updatedAt);
  assert.throws(
    () => upsertTemporalAssessment(updated.ledger, {
      id: updated.assessment.id,
      targetType: "PROVENANCE_ARTIFACT",
      targetId: "A1"
    }, { now: at(3), evidenceIds: ["E1"], artifactIds: ["A1"] }),
    /cannot be reassigned/i
  );
  const removed = removeTemporalAssessment(updated.ledger, updated.assessment.id, {
    reason: "Superseded by a later explicit assessment record.",
    now: at(4),
    evidenceIds: ["E1"],
    artifactIds: []
  });
  assert.equal(removed.assessment.status, "REMOVED");
  assert.equal(listTemporalAssessments(removed.ledger).length, 0);
  assert.equal(listTemporalAssessments(removed.ledger, { includeRemoved: true }).length, 1);
  const replacement = addAssessment(removed.ledger, "EVIDENCE_ITEM", "E1", "HISTORICAL", 5, {
    evidenceIds: ["E1"],
    artifactIds: []
  });
  assert.notEqual(replacement.assessment.id, removed.assessment.id);
  assert.equal(replacement.ledger.assessments.length, 2);
  const duplicateId = structuredClone(replacement.ledger);
  duplicateId.assessments.push(structuredClone(replacement.assessment));
  assert.throws(() => validateTemporalLedger(duplicateId, { evidenceIds: ["E1"], artifactIds: [] }), /duplicate temporal assessment ID/i);
});

test("CORRECTS and SUPERSEDES use stable typed endpoints, deterministic identities, and soft history", () => {
  let ledger = addAssessment(createEmptyTemporalLedger(), "EVIDENCE_ITEM", "E1", "CORRECTED", 1).ledger;
  ledger = addAssessment(ledger, "PROVENANCE_ARTIFACT", "A1", "SUPERSEDED", 2).ledger;
  const corrects = addRelationship(ledger, {
    subjectType: "EVIDENCE_ITEM",
    subjectId: "E2",
    objectType: "EVIDENCE_ITEM",
    objectId: "E1",
    relationship: "CORRECTS",
    effectiveAt: "2026-07-24T12:00:00Z",
    notes: "The later record corrects the earlier observation."
  }, 3);
  assert.match(corrects.relationship.id, /^temporal_relationship_/);
  const duplicate = addRelationship(corrects.ledger, {
    subjectType: "EVIDENCE_ITEM",
    subjectId: "E2",
    objectType: "EVIDENCE_ITEM",
    objectId: "E1",
    relationship: "CORRECTS",
    effectiveAt: "2026-07-24T12:00:00Z",
    notes: "The later record corrects the earlier observation."
  }, 4);
  assert.equal(duplicate.unchanged, true);
  assert.equal(duplicate.relationship.id, corrects.relationship.id);
  const notesUpdated = addRelationship(corrects.ledger, {
    id: corrects.relationship.id,
    notes: "Updated rationale without endpoint reassignment."
  }, 5);
  assert.equal(notesUpdated.relationship.id, corrects.relationship.id);
  assert.equal(notesUpdated.relationship.createdAt, corrects.relationship.createdAt);
  assert.throws(
    () => addRelationship(notesUpdated.ledger, {
      id: notesUpdated.relationship.id,
      subjectType: "EVIDENCE_ITEM",
      subjectId: "E3"
    }, 6),
    /cannot be reassigned/i
  );
  assert.throws(
    () => addRelationship(notesUpdated.ledger, {
      id: notesUpdated.relationship.id,
      relationship: "SUPERSEDES",
      effectiveAt: AS_OF
    }, 6),
    /explicit affected assessment update/i
  );
  const meaningUpdated = addRelationship(notesUpdated.ledger, {
    id: notesUpdated.relationship.id,
    relationship: "SUPERSEDES",
    effectiveAt: AS_OF,
    affectedAssessment: {
      id: notesUpdated.ledger.assessments.find((item) => item.targetId === "E1").id,
      temporalStatus: "SUPERSEDED",
      statusAsOf: AS_OF,
      rationale: "The affected item is explicitly superseded under the updated relationship meaning."
    }
  }, 6);
  assert.equal(meaningUpdated.relationship.id, notesUpdated.relationship.id);
  assert.equal(meaningUpdated.relationship.relationship, "SUPERSEDES");
  assert.equal(meaningUpdated.affectedAssessment.temporalStatus, "SUPERSEDED");
  assert.equal(meaningUpdated.ledger.assessments.find((item) => item.targetId === "E1").temporalStatus, "SUPERSEDED");
  const supersedes = addRelationship(meaningUpdated.ledger, {
    subjectType: "EVIDENCE_ITEM",
    subjectId: "E3",
    objectType: "PROVENANCE_ARTIFACT",
    objectId: "A1",
    relationship: "SUPERSEDES",
    effectiveAt: AS_OF
  }, 7);
  assert.equal(supersedes.relationship.relationship, "SUPERSEDES");
  assert.equal(listTemporalRelationships(supersedes.ledger).length, 2);
  const removed = removeTemporalRelationship(supersedes.ledger, corrects.relationship.id, {
    reason: "Retired while preserving the correction history.",
    now: at(8),
    evidenceIds: ["E1", "E2", "E3"],
    artifactIds: ["A1"]
  });
  assert.equal(removed.relationship.status, "REMOVED");
  assert.equal(listTemporalRelationships(removed.ledger).length, 1);
  assert.equal(listTemporalRelationships(removed.ledger, { includeRemoved: true }).length, 2);
  assert.equal(validateTemporalRelationship(removed.relationship), removed.relationship);
});

test("temporal endpoints and canonical relationship consistency fail closed without rewriting state", () => {
  let corrected = addAssessment(createEmptyTemporalLedger(), "EVIDENCE_ITEM", "E1", "CORRECTED", 1).ledger;
  assert.throws(
    () => addRelationship(corrected, {
      subjectType: "EVIDENCE_ITEM",
      subjectId: "E1",
      objectType: "EVIDENCE_ITEM",
      objectId: "E1",
      relationship: "CORRECTS",
      effectiveAt: AS_OF
    }, 2),
    /itself/i
  );
  assert.throws(
    () => addRelationship(corrected, {
      subjectType: "EVIDENCE_ITEM",
      subjectId: "MISSING",
      objectType: "EVIDENCE_ITEM",
      objectId: "E1",
      relationship: "CORRECTS",
      effectiveAt: AS_OF
    }, 2, { evidenceIds: ["E1"], artifactIds: [] }),
    /unknown evidence/i
  );
  assert.throws(
    () => addAssessment(corrected, "PROVENANCE_ARTIFACT", "MISSING", "UNKNOWN", 2, {
      evidenceIds: ["E1"],
      artifactIds: []
    }),
    /unknown provenance artifact/i
  );
  const current = addAssessment(createEmptyTemporalLedger(), "EVIDENCE_ITEM", "E1", "CURRENT", 1).ledger;
  assert.throws(
    () => addRelationship(current, {
      subjectType: "PROVENANCE_ARTIFACT",
      subjectId: "A1",
      objectType: "EVIDENCE_ITEM",
      objectId: "E1",
      relationship: "CORRECTS",
      effectiveAt: AS_OF
    }, 2),
    /assessed CORRECTED, not CURRENT/i
  );
  const before = structuredClone(corrected);
  assert.throws(
    () => addRelationship(corrected, {
      subjectType: "PROVENANCE_ARTIFACT",
      subjectId: "A1",
      objectType: "EVIDENCE_ITEM",
      objectId: "E1",
      relationship: "SUPERSEDES",
      effectiveAt: AS_OF
    }, 2),
    /assessed SUPERSEDED, not CORRECTED/i
  );
  assert.deepEqual(corrected, before);
  assert.equal(corrected.assessments[0].temporalStatus, "CORRECTED");
});

test("relationship effective time and active assessment semantics remain mutually consistent", () => {
  let ledger = addAssessment(createEmptyTemporalLedger(), "EVIDENCE_ITEM", "E1", "SUPERSEDED", 1, {
    item: { statusAsOf: "2026-07-24T12:00:00Z" }
  }).ledger;
  assert.throws(
    () => addRelationship(ledger, {
      subjectType: "EVIDENCE_ITEM",
      subjectId: "E2",
      objectType: "EVIDENCE_ITEM",
      objectId: "E1",
      relationship: "SUPERSEDES",
      effectiveAt: "2026-07-25T00:00:00Z"
    }, 2),
    /cannot become effective after/i
  );
  ledger = addRelationship(ledger, {
    subjectType: "EVIDENCE_ITEM",
    subjectId: "E2",
    objectType: "EVIDENCE_ITEM",
    objectId: "E1",
    relationship: "SUPERSEDES",
    effectiveAt: "2026-07-24T12:00:00Z"
  }, 2).ledger;
  assert.throws(
    () => removeTemporalAssessment(ledger, ledger.assessments[0].id, {
      reason: "Attempted removal while the active relationship still requires it.",
      now: at(3),
      evidenceIds: ["E1", "E2"],
      artifactIds: []
    }),
    /requires an active assessment/i
  );
  const removedRelationship = removeTemporalRelationship(ledger, ledger.relationships[0].id, {
    reason: "Retire current replacement link while preserving its record.",
    now: at(3),
    evidenceIds: ["E1", "E2"],
    artifactIds: []
  });
  const updated = upsertTemporalAssessment(removedRelationship.ledger, {
    id: removedRelationship.ledger.assessments[0].id,
    temporalStatus: "CURRENT",
    statusAsOf: "2026-07-24T12:03:00Z",
    rationale: "Current after the prior replacement relationship was retired."
  }, { now: at(4), evidenceIds: ["E1", "E2"], artifactIds: [] });
  assert.equal(updated.assessment.temporalStatus, "CURRENT");
  assert.equal(updated.ledger.relationships[0].status, "REMOVED");
});

test("active correction and supersession cycles fail closed while removed history is ignored", () => {
  let correctionCycle = createEmptyTemporalLedger();
  correctionCycle = addAssessment(correctionCycle, "EVIDENCE_ITEM", "E1", "CORRECTED", 1).ledger;
  correctionCycle = addAssessment(correctionCycle, "EVIDENCE_ITEM", "E2", "CORRECTED", 2).ledger;
  correctionCycle = addRelationship(correctionCycle, {
    subjectType: "EVIDENCE_ITEM", subjectId: "E2",
    objectType: "EVIDENCE_ITEM", objectId: "E1",
    relationship: "CORRECTS", effectiveAt: AS_OF
  }, 3).ledger;
  assert.throws(
    () => addRelationship(correctionCycle, {
      subjectType: "EVIDENCE_ITEM", subjectId: "E1",
      objectType: "EVIDENCE_ITEM", objectId: "E2",
      relationship: "CORRECTS", effectiveAt: AS_OF
    }, 4),
    /cycle/i
  );

  let ledger = createEmptyTemporalLedger();
  ledger = addAssessment(ledger, "EVIDENCE_ITEM", "E1", "SUPERSEDED", 1).ledger;
  ledger = addAssessment(ledger, "EVIDENCE_ITEM", "E2", "SUPERSEDED", 2).ledger;
  ledger = addAssessment(ledger, "EVIDENCE_ITEM", "E3", "CORRECTED", 3).ledger;
  ledger = addRelationship(ledger, {
    subjectType: "EVIDENCE_ITEM", subjectId: "E2",
    objectType: "EVIDENCE_ITEM", objectId: "E1",
    relationship: "SUPERSEDES", effectiveAt: AS_OF
  }, 4).ledger;
  assert.throws(
    () => addRelationship(ledger, {
      subjectType: "EVIDENCE_ITEM", subjectId: "E1",
      objectType: "EVIDENCE_ITEM", objectId: "E2",
      relationship: "SUPERSEDES", effectiveAt: AS_OF
    }, 5),
    /cycle/i
  );
  let multiNode = createEmptyTemporalLedger();
  for (const [id, minute] of [["E1", 1], ["E2", 2], ["E3", 3]]) {
    multiNode = addAssessment(multiNode, "EVIDENCE_ITEM", id, "SUPERSEDED", minute).ledger;
  }
  multiNode = addRelationship(multiNode, {
    subjectType: "EVIDENCE_ITEM", subjectId: "E2",
    objectType: "EVIDENCE_ITEM", objectId: "E1",
    relationship: "SUPERSEDES", effectiveAt: AS_OF
  }, 4).ledger;
  multiNode = addRelationship(multiNode, {
    subjectType: "EVIDENCE_ITEM", subjectId: "E3",
    objectType: "EVIDENCE_ITEM", objectId: "E2",
    relationship: "SUPERSEDES", effectiveAt: AS_OF
  }, 5).ledger;
  assert.throws(
    () => addRelationship(multiNode, {
      subjectType: "EVIDENCE_ITEM", subjectId: "E1",
      objectType: "EVIDENCE_ITEM", objectId: "E3",
      relationship: "SUPERSEDES", effectiveAt: AS_OF
    }, 6),
    /cycle/i
  );
  ledger = addRelationship(ledger, {
    subjectType: "EVIDENCE_ITEM", subjectId: "E3",
    objectType: "EVIDENCE_ITEM", objectId: "E2",
    relationship: "SUPERSEDES", effectiveAt: AS_OF
  }, 5).ledger;
  assert.throws(
    () => addRelationship(ledger, {
      subjectType: "EVIDENCE_ITEM", subjectId: "E1",
      objectType: "EVIDENCE_ITEM", objectId: "E3",
      relationship: "CORRECTS", effectiveAt: AS_OF
    }, 6),
    /cycle/i
  );
  const removed = removeTemporalRelationship(ledger, ledger.relationships[0].id, {
    reason: "Retired edge no longer imposes an active replacement dependency.",
    now: at(7),
    evidenceIds: ["E1", "E2", "E3"],
    artifactIds: []
  });
  const nonCycle = addRelationship(removed.ledger, {
    subjectType: "EVIDENCE_ITEM", subjectId: "E1",
    objectType: "EVIDENCE_ITEM", objectId: "E3",
    relationship: "CORRECTS", effectiveAt: AS_OF
  }, 8);
  assert.equal(nonCycle.relationship.status, "ACTIVE");
});

test("as-of analysis is explicit, deterministic, status-preserving, and interval-aware", () => {
  let ledger = createEmptyTemporalLedger();
  ledger = addAssessment(ledger, "EVIDENCE_ITEM", "E1", "CURRENT", 1, {
    item: {
      statusAsOf: "2025-06-01T00:00:00Z",
      effectiveFrom: "2025-01-01",
      effectiveTo: "2025-12-31"
    }
  }).ledger;
  ledger = addAssessment(ledger, "EVIDENCE_ITEM", "E2", "HISTORICAL", 2, {
    item: { statusAsOf: "2024-06-01", effectiveFrom: "2024-01-01", effectiveTo: "2024-12-31" }
  }).ledger;
  ledger = addAssessment(ledger, "EVIDENCE_ITEM", "E3", "OUTDATED", 3, {
    item: { statusAsOf: "2026-01-01", effectiveFrom: "2027-01-01" }
  }).ledger;
  ledger = addAssessment(ledger, "EVIDENCE_ITEM", "E4", "UNKNOWN", 4, {
    item: { statusAsOf: "2030-01-01" }
  }).ledger;
  const options = {
    evidenceItems: ["E1", "E2", "E3", "E4"].map((id) => ({ id, status: "ACTIVE" })),
    provenanceLedger: { artifacts: [] },
    targetRefs: ["E1", "E2", "E3", "E4"].map((targetId) => ({ targetType: "EVIDENCE_ITEM", targetId })),
    asOf: "2026-07-24T12:00:00Z",
    purpose: "CURRENT_STATE"
  };
  assert.throws(() => analyzeTemporalIntegrity(ledger, { ...options, asOf: undefined }), /asOf/i);
  const first = analyzeTemporalIntegrity(ledger, options);
  const second = analyzeTemporalIntegrity(ledger, options);
  assert.deepEqual(first, second);
  assert.deepEqual(first.currentTargetIds, ["E1"]);
  assert.deepEqual(first.historicalTargetIds, ["E2"]);
  assert.deepEqual(first.outdatedTargetIds, ["E3"]);
  assert.deepEqual(first.unknownTargetIds, ["E4"]);
  const e1 = first.assessedTargets.find((item) => item.targetId === "E1");
  assert.ok(e1.asOfWarnings.includes("CURRENT_STATUS_AS_OF_PREVIOUS_DATE"));
  assert.ok(e1.asOfWarnings.includes("TEMPORAL_ASSESSMENT_STALE_FOR_REQUESTED_AS_OF"));
  assert.ok(e1.asOfWarnings.includes("EFFECTIVE_INTERVAL_ENDED_BEFORE_ANALYSIS_DATE"));
  assert.ok(first.assessedTargets.find((item) => item.targetId === "E3")
    .asOfWarnings.includes("EFFECTIVE_INTERVAL_BEGINS_AFTER_ANALYSIS_DATE"));
  assert.equal(ledger.assessments.find((item) => item.targetId === "E1").temporalStatus, "CURRENT");
  assert.equal(ledger.assessments.find((item) => item.targetId === "E4").temporalStatus, "UNKNOWN");
});

test("unassessed targets and unresolved replacements produce warnings without fabricated current state", () => {
  let ledger = addAssessment(createEmptyTemporalLedger(), "EVIDENCE_ITEM", "E1", "CORRECTED", 1).ledger;
  ledger = addAssessment(ledger, "EVIDENCE_ITEM", "E2", "SUPERSEDED", 2).ledger;
  const analysis = analyzeTemporalIntegrity(ledger, {
    evidenceItems: ["E1", "E2", "E3"].map((id) => ({ id, status: "ACTIVE" })),
    provenanceLedger: { artifacts: [] },
    asOf: AS_OF
  });
  assert.equal(analysis.status, "PARTIAL");
  assert.deepEqual(analysis.unassessedTargets, [{ targetType: "EVIDENCE_ITEM", targetId: "E3" }]);
  assert.equal(analysis.unresolvedCorrectingSourceWarnings[0].code, "CORRECTING_SOURCE_UNRESOLVED");
  assert.equal(analysis.unresolvedSupersedingSourceWarnings[0].code, "SUPERSEDING_SOURCE_UNRESOLVED");
  assert.deepEqual(analysis.currentTargetIds, []);
  assert.ok(analysis.unknownTargetIds.includes("E3"));
});

test("malformed temporal state can be inspected for conflicts and cycles without weakening canonical validation", () => {
  const malformed = {
    version: 1,
    assessments: [
      {
        id: "TA1", ...assessmentInput("EVIDENCE_ITEM", "E1", "CURRENT"),
        observedAt: "", publishedAt: "", effectiveFrom: "", effectiveTo: "", notes: "",
        status: "ACTIVE", createdAt: AS_OF, updatedAt: AS_OF, removedAt: "", removedReason: ""
      },
      {
        id: "TA2", ...assessmentInput("EVIDENCE_ITEM", "E2", "CURRENT"),
        observedAt: "", publishedAt: "", effectiveFrom: "", effectiveTo: "", notes: "",
        status: "ACTIVE", createdAt: AS_OF, updatedAt: AS_OF, removedAt: "", removedReason: ""
      }
    ],
    relationships: [
      {
        id: "TR1", subjectType: "EVIDENCE_ITEM", subjectId: "E1",
        objectType: "EVIDENCE_ITEM", objectId: "E2", relationship: "CORRECTS",
        effectiveAt: AS_OF, notes: "", status: "ACTIVE", createdAt: AS_OF, updatedAt: AS_OF,
        removedAt: "", removedReason: ""
      },
      {
        id: "TR2", subjectType: "EVIDENCE_ITEM", subjectId: "E2",
        objectType: "EVIDENCE_ITEM", objectId: "E1", relationship: "SUPERSEDES",
        effectiveAt: AS_OF, notes: "", status: "ACTIVE", createdAt: AS_OF, updatedAt: AS_OF,
        removedAt: "", removedReason: ""
      }
    ]
  };
  assert.throws(
    () => validateTemporalLedger(malformed, { evidenceIds: ["E1", "E2"], artifactIds: [] }),
    /requires its affected target/i
  );
  const inspection = analyzeTemporalIntegrity(malformed, {
    evidenceItems: [{ id: "E1", status: "ACTIVE" }, { id: "E2", status: "ACTIVE" }],
    provenanceLedger: { artifacts: [] },
    asOf: AS_OF,
    inspectMalformed: true
  });
  assert.equal(inspection.relationshipAssessmentConflicts.length, 2);
  assert.equal(inspection.temporalCycleWarnings[0].code, "TEMPORAL_REPLACEMENT_CYCLE");
});

test("source-chain analysis reports direct, artifact, and root status without changing provenance counts", () => {
  let state = addProjectEvidence(project(), "The current derivative cites an older foundational dataset.", 1);
  const derivative = addProjectArtifact(state, "Current derivative document", 2, {
    originRole: "DERIVATIVE"
  });
  state = derivative.state;
  const root = addProjectArtifact(state, "Foundational dataset", 3, {
    kind: "DATASET",
    originRole: "FOUNDATIONAL"
  });
  state = root.state;
  state = addProjectProvenanceRelationship(state, {
    subjectType: "EVIDENCE_ITEM", subjectId: state.evidence[0].id,
    objectType: "PROVENANCE_ARTIFACT", objectId: derivative.artifact.id,
    relationship: "DERIVED_FROM"
  }, 4).state;
  state = addProjectProvenanceRelationship(state, {
    subjectType: "PROVENANCE_ARTIFACT", subjectId: derivative.artifact.id,
    objectType: "PROVENANCE_ARTIFACT", objectId: root.artifact.id,
    relationship: "DERIVED_FROM"
  }, 5).state;
  for (const [targetType, targetId, temporalStatus, minute] of [
    ["EVIDENCE_ITEM", state.evidence[0].id, "CURRENT", 6],
    ["PROVENANCE_ARTIFACT", derivative.artifact.id, "CURRENT", 7],
    ["PROVENANCE_ARTIFACT", root.artifact.id, "SUPERSEDED", 8]
  ]) {
    state = addProjectTemporalAssessment(
      state,
      assessmentInput(targetType, targetId, temporalStatus),
      minute
    ).state;
  }
  const provenanceBefore = structuredClone(state.provenanceLedger);
  const chainBefore = analyzeIndependentEvidenceChains(state.provenanceLedger, {
    evidenceItems: state.evidence,
    evidenceIds: [state.evidence[0].id],
    eligibleEvidenceIds: [state.evidence[0].id]
  });
  const analysis = analyzeProjectSourceChainTemporalIntegrity(state, {
    evidenceId: state.evidence[0].id,
    asOf: AS_OF
  });
  assert.equal(analysis.directEvidenceState.temporalStatus, "CURRENT");
  assert.equal(analysis.provenanceArtifactStates.length, 2);
  assert.equal(analysis.foundationalRootStates[0].temporalStatus, "SUPERSEDED");
  assert.ok(analysis.warnings.includes("CURRENT_DERIVATIVE_HAS_SUPERSEDED_FOUNDATIONAL_ROOT"));
  assert.equal(analysis.provenanceStatus, "RESOLVED");
  assert.deepEqual(state.provenanceLedger, provenanceBefore);
  const chainAfter = analyzeIndependentEvidenceChains(state.provenanceLedger, {
    evidenceItems: state.evidence,
    evidenceIds: [state.evidence[0].id],
    eligibleEvidenceIds: [state.evidence[0].id]
  });
  assert.equal(chainAfter.knownIndependentChainCount, chainBefore.knownIndependentChainCount);

  for (const [temporalStatus, warning] of [
    ["CORRECTED", "CURRENT_DERIVATIVE_HAS_CORRECTED_FOUNDATIONAL_ROOT"],
    ["OUTDATED", "CURRENT_DERIVATIVE_HAS_OUTDATED_FOUNDATIONAL_ROOT"]
  ]) {
    const changed = addProjectTemporalAssessment(state, {
      id: state.temporalLedger.assessments.find((item) => item.targetId === root.artifact.id).id,
      temporalStatus,
      statusAsOf: AS_OF,
      rationale: `Explicitly ${temporalStatus.toLowerCase()} foundational root.`
    }, 9);
    const result = analyzeProjectSourceChainTemporalIntegrity(changed.state, {
      evidenceId: changed.state.evidence[0].id,
      asOf: AS_OF
    });
    assert.ok(result.warnings.includes(warning));
  }
});

test("claim temporal analysis preserves claim semantics and distinguishes active relationship meanings", () => {
  let state = addProjectEvidence(project(), "Current supporting evidence.", 1);
  state = addProjectEvidence(state, "Historical contradictory evidence.", 2);
  state = addProjectEvidence(state, "Outdated limiting evidence.", 3);
  const claimResult = manageProjectState(state, {
    type: "UPSERT_CLAIM",
    reason: "Recorded an explicit material claim.",
    item: { text: "The service improves equipment uptime.", status: "SUPPORTED" }
  }, { now: at(4) });
  state = claimResult.state;
  for (const [evidenceId, relationship, minute] of [
    [state.evidence[0].id, "SUPPORTS", 5],
    [state.evidence[1].id, "CONTRADICTS", 6],
    [state.evidence[2].id, "LIMITS", 7]
  ]) {
    state = manageProjectState(state, {
      type: "UPSERT_CLAIM_EVIDENCE_RELATIONSHIP",
      reason: "Linked evidence to the selected claim.",
      item: { claimId: claimResult.claim.id, evidenceId, relationship }
    }, { now: at(minute) }).state;
  }
  for (const [id, temporalStatus, minute] of [
    [state.evidence[0].id, "SUPERSEDED", 8],
    [state.evidence[1].id, "HISTORICAL", 9],
    [state.evidence[2].id, "OUTDATED", 10]
  ]) {
    state = addProjectTemporalAssessment(state, assessmentInput("EVIDENCE_ITEM", id, temporalStatus), minute).state;
  }
  const claimBefore = structuredClone(state.claimLedger.claims[0]);
  const analysis = analyzeProjectClaimTemporalIntegrity(state, {
    claimId: claimResult.claim.id,
    asOf: AS_OF
  });
  assert.deepEqual(analysis.evidenceRelationships.SUPPORTS, [state.evidence[0].id]);
  assert.deepEqual(analysis.evidenceRelationships.CONTRADICTS, [state.evidence[1].id]);
  assert.deepEqual(analysis.evidenceRelationships.LIMITS, [state.evidence[2].id]);
  assert.ok(analysis.evidenceLinkedToSupersededSources.includes(state.evidence[0].id));
  assert.ok(analysis.historicalEvidenceIds.includes(state.evidence[1].id));
  assert.ok(analysis.evidenceLinkedToOutdatedSources.includes(state.evidence[2].id));
  assert.ok(analysis.warnings.includes("SUPPORTED_CLAIM_HAS_NO_KNOWN_CURRENT_SUPPORT"));
  assert.ok(analysis.warnings.includes("SUPPORT_RELIES_ON_SUPERSEDED_SOURCE"));
  assert.ok(analysis.warnings.includes("CLAIM_USES_HISTORICAL_EVIDENCE_FOR_CURRENT_CONTEXT"));
  assert.deepEqual(state.claimLedger.claims[0], claimBefore);
  assert.equal(analysis.claimStatus, "SUPPORTED");

  const relationshipId = state.claimLedger.evidenceRelationships[0].id;
  state = manageProjectState(state, {
    type: "REMOVE_CLAIM_EVIDENCE_RELATIONSHIP",
    id: relationshipId,
    reason: "Retired the supporting relationship while retaining history."
  }, { now: at(11) }).state;
  const afterRemoval = analyzeProjectClaimTemporalIntegrity(state, {
    claimId: claimResult.claim.id,
    asOf: AS_OF
  });
  assert.equal(afterRemoval.evidenceRelationships.SUPPORTS.length, 0);

  state = manageProjectState(state, {
    type: "REMOVE_EVIDENCE",
    id: state.evidence[1].id,
    reason: "Retired the historical Evidence Item while retaining canonical history."
  }, { now: at(12) }).state;
  const afterEvidenceRemoval = analyzeProjectClaimTemporalIntegrity(state, {
    claimId: claimResult.claim.id,
    asOf: AS_OF
  });
  assert.ok(!afterEvidenceRemoval.activeEvidenceIds.includes(state.evidence[1].id));
  assert.equal(
    state.temporalLedger.assessments.find((item) => item.targetId === state.evidence[1].id).temporalStatus,
    "HISTORICAL"
  );
});

test("claim warning codes cover corrected, outdated, historical, and unresolved support", () => {
  let state = addProjectEvidence(project(), "A source supports the explicit claim.", 1);
  const claim = manageProjectState(state, {
    type: "UPSERT_CLAIM",
    reason: "Recorded a supported claim for warning coverage.",
    item: { text: "The source establishes the proposition.", status: "SUPPORTED" }
  }, { now: at(2) });
  state = manageProjectState(claim.state, {
    type: "UPSERT_CLAIM_EVIDENCE_RELATIONSHIP",
    reason: "Linked the source as explicit support.",
    item: { claimId: claim.claim.id, evidenceId: claim.state.evidence[0].id, relationship: "SUPPORTS" }
  }, { now: at(3) }).state;
  const unresolved = analyzeProjectClaimTemporalIntegrity(state, { claimId: claim.claim.id, asOf: AS_OF });
  assert.ok(unresolved.warnings.includes("TEMPORAL_STATE_UNRESOLVED"));
  for (const [temporalStatus, warning, minute] of [
    ["CORRECTED", "SUPPORT_RELIES_ON_CORRECTED_SOURCE", 4],
    ["OUTDATED", "SUPPORT_RELIES_ON_OUTDATED_SOURCE", 5],
    ["HISTORICAL", "CLAIM_USES_HISTORICAL_EVIDENCE_FOR_CURRENT_CONTEXT", 6]
  ]) {
    const current = state.temporalLedger.assessments[0];
    state = addProjectTemporalAssessment(state, {
      ...(current ? { id: current.id } : {
        targetType: "EVIDENCE_ITEM",
        targetId: state.evidence[0].id
      }),
      temporalStatus,
      statusAsOf: AS_OF,
      rationale: `Explicitly ${temporalStatus.toLowerCase()} supporting evidence.`
    }, minute).state;
    const analysis = analyzeProjectClaimTemporalIntegrity(state, { claimId: claim.claim.id, asOf: AS_OF });
    assert.ok(analysis.warnings.includes(warning));
  }
  const historical = analyzeProjectClaimTemporalIntegrity(state, {
    claimId: claim.claim.id,
    asOf: AS_OF,
    purpose: "HISTORICAL_AS_OF"
  });
  assert.ok(!historical.warnings.includes("CLAIM_USES_HISTORICAL_EVIDENCE_FOR_CURRENT_CONTEXT"));
});

test("historical-as-of analysis records retrospective publication and interval applicability", () => {
  let ledger = addAssessment(createEmptyTemporalLedger(), "EVIDENCE_ITEM", "E1", "HISTORICAL", 1, {
    item: {
      statusAsOf: "2024-12-31",
      publishedAt: "2025-01-10",
      effectiveFrom: "2024-01-01",
      effectiveTo: "2024-12-31"
    }
  }).ledger;
  const historical = analyzeTemporalIntegrity(ledger, {
    evidenceItems: [{ id: "E1", status: "ACTIVE" }],
    provenanceLedger: { artifacts: [] },
    asOf: "2024-06-01",
    purpose: "HISTORICAL_AS_OF"
  });
  assert.equal(historical.assessedTargets[0].historicallyApplicable, true);
  assert.ok(historical.assessedTargets[0].asOfWarnings.includes("PUBLISHED_AFTER_ANALYSIS_DATE"));
  assert.equal(historical.assessedTargets[0].temporalStatus, "HISTORICAL");
});

test("synthetic evidence may be temporally current but remains quarantined and ineligible", () => {
  let state = addProjectEvidence(project(), "Synthetic uptime test fixture.", 1, {
    evidenceAuthenticity: "SYNTHETIC_SIMULATED",
    authenticityBasis: "EXPLICIT_TEST_FIXTURE"
  });
  const root = addProjectArtifact(state, "Synthetic foundational test fixture", 2, {
    kind: "TEST",
    originRole: "FOUNDATIONAL"
  });
  state = addProjectProvenanceRelationship(root.state, {
    subjectType: "EVIDENCE_ITEM",
    subjectId: root.state.evidence[0].id,
    objectType: "PROVENANCE_ARTIFACT",
    objectId: root.artifact.id,
    relationship: "DERIVED_FROM"
  }, 3).state;
  state = addProjectTemporalAssessment(state, assessmentInput(
    "EVIDENCE_ITEM",
    state.evidence[0].id,
    "CURRENT"
  ), 4).state;
  state = addProjectTemporalAssessment(state, assessmentInput(
    "PROVENANCE_ARTIFACT",
    root.artifact.id,
    "CURRENT"
  ), 5).state;
  const source = analyzeSourceChainTemporalIntegrity({
    temporalLedger: state.temporalLedger,
    provenanceLedger: state.provenanceLedger,
    evidenceItems: state.evidence,
    evidenceId: state.evidence[0].id,
    eligibleEvidenceIds: [],
    asOf: AS_OF
  });
  assert.equal(source.directEvidenceState.temporalStatus, "CURRENT");
  assert.equal(source.foundationalRootStates[0].temporalStatus, "CURRENT");
  assert.equal(source.eligibleForRealWorldValidation, false);
  const report = createProjectReport(state, { now: fixedNow });
  assert.equal(report.evidenceBase.syntheticOrSimulated.length, 1);
  assert.equal(report.evidenceBase.totalObservedItems, 0);
  assert.equal(report.temporalIntegrity.summary.syntheticOrOtherwiseIneligibleEvidenceCount, 1);
  assert.equal(report.provenance.summary.knownIndependentChainCount, 0);
  assert.equal(report.provenance.analysis.traceableChainCount, 1);
  assert.equal(report.propositionStatus.status, "INSUFFICIENT_EVIDENCE");
});

test("new and legacy projects receive an empty ledger without fabricated temporal state or history", () => {
  const initialized = project();
  assert.deepEqual(initialized.temporalLedger, createEmptyTemporalLedger());
  const legacy = structuredClone(initialized);
  delete legacy.temporalLedger;
  legacy.evidence.push({
    id: "legacy_evidence",
    claim: "Legacy evidence with a source date.",
    sourceType: "USER_INPUT",
    sourceDate: "2020-01-01",
    capturedAt: "2021-01-01T00:00:00Z",
    assessment: "Legacy metadata remains metadata.",
    assumptionIds: [],
    questionRefs: []
  });
  const notebookBefore = structuredClone(legacy.notebook);
  const eventsBefore = structuredClone(legacy.stateEvents);
  const normalized = normalizeProjectState(legacy);
  assert.deepEqual(normalized.temporalLedger, createEmptyTemporalLedger());
  assert.deepEqual(normalized.notebook, notebookBefore);
  assert.deepEqual(normalized.stateEvents, eventsBefore);
  assert.equal(normalized.evidence[0].sourceDate, "2020-01-01");
  assert.equal(normalized.evidence[0].capturedAt, "2021-01-01T00:00:00Z");
  assert.equal(normalized.temporalLedger.assessments.length, 0);
  assert.equal(normalized.temporalLedger.relationships.length, 0);
});

test("Core temporal mutations are reason-gated, auditable, stable, and exposed through read-only analyzers", () => {
  let state = addProjectEvidence(project(), "Audited time-bounded Evidence Item.", 1);
  const created = addProjectTemporalAssessment(
    state,
    assessmentInput("EVIDENCE_ITEM", state.evidence[0].id, "CURRENT"),
    2
  );
  state = created.state;
  assert.equal(state.stateEvents.at(-1).entityType, "TEMPORAL_ASSESSMENT");
  assert.equal(state.notebook.at(-1).entryType, "STATE_EDIT");
  assert.equal(state.notebook.at(-1).stateEventId, state.stateEvents.at(-1).id);
  assert.throws(
    () => manageProjectState(state, {
      type: "UPSERT_TEMPORAL_ASSESSMENT",
      reason: "",
      item: { id: created.assessment.id, notes: "Untraced edit." }
    }, { now: at(3) }),
    /reason/i
  );
  const analyzed = analyzeProjectTemporalTarget(state, {
    targetType: "EVIDENCE_ITEM",
    targetId: state.evidence[0].id,
    asOf: AS_OF
  });
  assert.equal(analyzed.assessedTargets[0].temporalStatus, "CURRENT");
  assert.equal(state.temporalLedger.assessments[0].temporalStatus, "CURRENT");
  assert.throws(
    () => analyzeProjectTemporalTarget(state, {
      targetType: "EVIDENCE_ITEM",
      targetId: state.evidence[0].id
    }),
    /asOf/i
  );
});

test("temporal state persists through cycle, lock, Notebook, reports, human export, and v1 backup", () => {
  let state = addProjectEvidence(project(), "Persistent time-bounded source.", 1);
  state = addProjectTemporalAssessment(state, assessmentInput(
    "EVIDENCE_ITEM",
    state.evidence[0].id,
    "CURRENT",
    { effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31" }
  ), 2).state;
  const ledgerBefore = structuredClone(state.temporalLedger);
  const routing = applyMethodOverride(createDemoRouting(state));
  state = applyCycleOutput(state, routing, createDemoCycle(state, routing), { now: at(3) }).state;
  assert.deepEqual(state.temporalLedger, ledgerBefore);
  const locked = lockProjectState(state, { note: "Temporal snapshot", now: at(4) });
  assert.deepEqual(locked.state.lockedDecisions.at(-1).temporalLedger, ledgerBefore);
  const notebook = createNotebookExport(locked.state, { now: at(5) });
  assert.deepEqual(notebook.temporalLedger, ledgerBefore);
  const report = createProjectReport(locked.state, { now: at(6) });
  assert.deepEqual(report.temporalIntegrity.assessments, ledgerBefore.assessments);
  assert.equal(report.temporalIntegrity.analysisAsOf, at(6).toISOString());
  const human = createHumanReportArtifact(report);
  assert.match(human.content, /Temporal Integrity/);
  assert.match(human.content, /Analysis as of/);
  assert.match(human.content, /historically valid but not current/i);
  const backup = createProjectBackup(locked.state, { now: at(7) });
  assert.equal(backup.formatVersion, 1);
  const restored = importProjectBackup(backup, { now: at(8) });
  assert.deepEqual(restored.temporalLedger, ledgerBefore);
});

test("normalization and v1/v2 import reject missing temporal endpoints and contradictory canonical state", () => {
  const base = project();
  const malformed = structuredClone(base);
  malformed.temporalLedger = {
    version: 1,
    assessments: [{
      id: "TA_MISSING",
      ...assessmentInput("EVIDENCE_ITEM", "missing_evidence", "CURRENT"),
      observedAt: "", publishedAt: "", effectiveFrom: "", effectiveTo: "", notes: "",
      status: "ACTIVE", createdAt: AS_OF, updatedAt: AS_OF, removedAt: "", removedReason: ""
    }],
    relationships: []
  };
  assert.throws(() => normalizeProjectState(malformed), /unknown evidence/i);
  for (const formatVersion of [1, 2]) {
    assert.throws(() => importProjectBackup({
      format: "rethink.project.backup",
      formatVersion,
      exportedAt: AS_OF,
      projectId: malformed.id,
      project: malformed,
      ...(formatVersion === 2 ? { runtimeSession: { mode: "demo" } } : {})
    }, { now: fixedNow }), /unknown evidence/i);
  }

  const contradictory = addProjectEvidence(base, "Canonical target.", 1);
  const missingRelationshipEndpoint = structuredClone(contradictory);
  missingRelationshipEndpoint.temporalLedger = {
    version: 1,
    assessments: [{
      id: "TA_CORRECTED",
      ...assessmentInput("EVIDENCE_ITEM", missingRelationshipEndpoint.evidence[0].id, "CORRECTED"),
      observedAt: "", publishedAt: "", effectiveFrom: "", effectiveTo: "", notes: "",
      status: "ACTIVE", createdAt: AS_OF, updatedAt: AS_OF, removedAt: "", removedReason: ""
    }],
    relationships: [{
      id: "TR_MISSING_SUBJECT",
      subjectType: "EVIDENCE_ITEM", subjectId: "missing_corrector",
      objectType: "EVIDENCE_ITEM", objectId: missingRelationshipEndpoint.evidence[0].id,
      relationship: "CORRECTS", effectiveAt: AS_OF, notes: "", status: "ACTIVE",
      createdAt: AS_OF, updatedAt: AS_OF, removedAt: "", removedReason: ""
    }]
  };
  assert.throws(() => normalizeProjectState(missingRelationshipEndpoint), /unknown evidence/i);
  for (const formatVersion of [1, 2]) {
    assert.throws(() => importProjectBackup({
      format: "rethink.project.backup",
      formatVersion,
      exportedAt: AS_OF,
      projectId: missingRelationshipEndpoint.id,
      project: missingRelationshipEndpoint,
      ...(formatVersion === 2 ? { runtimeSession: { mode: "demo" } } : {})
    }, { now: fixedNow }), /unknown evidence/i);
  }

  const invalid = structuredClone(contradictory);
  invalid.temporalLedger = {
    version: 1,
    assessments: [{
      id: "TA_CURRENT",
      ...assessmentInput("EVIDENCE_ITEM", invalid.evidence[0].id, "CURRENT"),
      observedAt: "", publishedAt: "", effectiveFrom: "", effectiveTo: "", notes: "",
      status: "ACTIVE", createdAt: AS_OF, updatedAt: AS_OF, removedAt: "", removedReason: ""
    }],
    relationships: [{
      id: "TR_INVALID",
      subjectType: "EVIDENCE_ITEM", subjectId: invalid.evidence[0].id,
      objectType: "EVIDENCE_ITEM", objectId: invalid.evidence[0].id,
      relationship: "CORRECTS", effectiveAt: AS_OF, notes: "", status: "ACTIVE",
      createdAt: AS_OF, updatedAt: AS_OF, removedAt: "", removedReason: ""
    }]
  };
  assert.throws(() => normalizeProjectState(invalid), /itself/i);
});

test("prompt context is bounded to the active project and includes explicit reproducible as-of analysis", () => {
  let state = addProjectEvidence(project(), "Prompt-visible current evidence.", 1);
  state = addProjectTemporalAssessment(state, assessmentInput(
    "EVIDENCE_ITEM",
    state.evidence[0].id,
    "CURRENT"
  ), 2).state;
  const routingPrompt = buildRoutingInput(state, { asOf: "2026-07-25T00:00:00Z" });
  const cyclePrompt = buildCycleInput(state, createDemoRouting(state), {
    asOf: "2026-07-25T00:00:00Z"
  });
  for (const prompt of [routingPrompt, cyclePrompt]) {
    assert.match(prompt, /"temporalIntegrity"/);
    assert.match(prompt, /"analysisAsOf": "2026-07-25T00:00:00Z"/);
    assert.match(prompt, /"temporalStatus": "CURRENT"/);
    assert.match(prompt, /"CURRENT_STATUS_AS_OF_PREVIOUS_DATE"/);
    assert.match(prompt, /historically valid but not current/i);
    assert.doesNotMatch(prompt, /unrelated_workforce_project/);
  }
  const implicitCanonicalAsOf = buildRoutingInput(state);
  assert.match(implicitCanonicalAsOf, new RegExp(state.updatedAt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(implicitCanonicalAsOf, /PROJECT_UPDATED_AT/);
});

test("empty temporal state leaves contractor routing, proposition, profile, Claim Ledger, and gates unchanged", () => {
  const state = initializeProject(
    "An equipment uptime contractor validates the service using maintenance records before hiring decisions.",
    { now: fixedNow }
  );
  const legacy = structuredClone(state);
  delete legacy.temporalLedger;
  const normalized = normalizeProjectState(legacy);
  assert.deepEqual(normalized.temporalLedger, createEmptyTemporalLedger());
  assert.equal(normalized.domainProfile, "BUSINESS");
  assert.deepEqual(normalized.claimLedger, state.claimLedger);
  assert.deepEqual(normalized.humanGates, state.humanGates);
  const routeA = createDemoRouting(state);
  const routeB = createDemoRouting(normalized);
  assert.equal(routeB.selectedMethod, routeA.selectedMethod);
  assert.equal(routeB.evidenceGate, routeA.evidenceGate);
  const resultA = createDemoCycle(state, applyMethodOverride(routeA));
  const resultB = createDemoCycle(normalized, applyMethodOverride(routeB));
  assert.equal(resultB.evidenceEvaluation.propositionStatus, resultA.evidenceEvaluation.propositionStatus);
  assert.equal(resultB.nextAction.disposition, resultA.nextAction.disposition);
});
