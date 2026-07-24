import assert from "node:assert/strict";
import test from "node:test";
import {
  CORE_PROVENANCE_ARTIFACT_KINDS,
  MATERIAL_DEPENDENCY_RELATIONSHIPS,
  PROVENANCE_ANALYSIS_STATUSES,
  PROVENANCE_ENDPOINT_TYPES,
  PROVENANCE_LEDGER_VERSION,
  PROVENANCE_ORIGIN_ROLES,
  PROVENANCE_RELATIONSHIP_TYPES,
  analyzeClaimIndependentEvidenceChains,
  analyzeIndependentEvidenceChains,
  createEmptyProvenanceLedger,
  listProvenanceArtifacts,
  listProvenanceRelationships,
  normalizeProvenanceLedger,
  removeProvenanceRelationship,
  upsertProvenanceArtifact,
  upsertProvenanceRelationship,
  validateProvenanceLedger
} from "../rethink-provenance.js";
import {
  applyCycleOutput,
  createDemoCycle,
  createDemoRouting,
  createNotebookExport,
  createProjectBackup,
  createProjectReport,
  importProjectBackup,
  initializeProject,
  isActualEvidence,
  lockProjectState,
  manageProjectState,
  normalizeProjectState
} from "../rethink-engine.js";
import {
  CYCLE_INSTRUCTIONS,
  ROUTER_INSTRUCTIONS,
  buildCycleInput,
  buildRoutingInput
} from "../rethink-prompt.js";
import { createHumanReportArtifact } from "../public/report-export.js";

const fixedNow = new Date("2026-07-24T12:00:00.000Z");

function at(minutes) {
  return new Date(fixedNow.getTime() + minutes * 60_000);
}

function project(input = "A contractor uptime service needs evidence from traceable equipment records.") {
  return initializeProject(input, { now: fixedNow });
}

function addEvidence(state, claim, minutes, extra = {}) {
  return manageProjectState(state, {
    type: "UPSERT_EVIDENCE",
    reason: "Recorded evidence for provenance and independence verification.",
    item: {
      claim,
      intakeType: "TEST_RESULT",
      provenanceOrigin: "USER_INPUT",
      reliability: "MODERATE",
      relationship: "NONE_UNLINKED",
      assessment: "Retained as an Evidence Item independently from its source lineage.",
      assumptionIds: [],
      questionRefs: [],
      ...extra
    }
  }, { now: at(minutes) }).state;
}

function addProjectArtifact(state, title, minutes, extra = {}) {
  return manageProjectState(state, {
    type: "UPSERT_PROVENANCE_ARTIFACT",
    reason: "Recorded an explicit source or origin artifact.",
    item: {
      title,
      kind: "DOCUMENT",
      originRole: "UNKNOWN",
      ...extra
    }
  }, { now: at(minutes) });
}

function addProjectRelationship(state, item, minutes) {
  return manageProjectState(state, {
    type: "UPSERT_PROVENANCE_RELATIONSHIP",
    reason: "Recorded the explicit directed provenance relationship.",
    item
  }, { now: at(minutes) });
}

function addArtifact(ledger, title, minutes, extra = {}) {
  return upsertProvenanceArtifact(ledger, {
    title,
    kind: "DOCUMENT",
    originRole: "UNKNOWN",
    ...extra
  }, { now: at(minutes) });
}

function addRelationship(ledger, item, evidenceIds, minutes) {
  return upsertProvenanceRelationship(ledger, item, {
    evidenceIds,
    now: at(minutes)
  });
}

test("Provenance Ledger contract is versioned, Core-neutral, extensible, and uses one relationship source of truth", () => {
  assert.equal(PROVENANCE_LEDGER_VERSION, 1);
  assert.deepEqual(createEmptyProvenanceLedger(), { version: 1, artifacts: [], relationships: [] });
  assert.deepEqual(PROVENANCE_ORIGIN_ROLES, ["FOUNDATIONAL", "DERIVATIVE", "UNKNOWN"]);
  assert.deepEqual(PROVENANCE_ENDPOINT_TYPES, ["EVIDENCE_ITEM", "PROVENANCE_ARTIFACT"]);
  assert.deepEqual(PROVENANCE_ANALYSIS_STATUSES, ["RESOLVED", "PARTIAL", "UNRESOLVED"]);
  assert.ok(CORE_PROVENANCE_ARTIFACT_KINDS.includes("DATASET"));
  assert.deepEqual(MATERIAL_DEPENDENCY_RELATIONSHIPS, ["DERIVED_FROM", "SUMMARIZES", "SYNDICATES", "REANALYZES"]);
  assert.deepEqual(PROVENANCE_RELATIONSHIP_TYPES, [
    "DERIVED_FROM",
    "CITES",
    "SUMMARIZES",
    "REPLICATES",
    "REANALYZES",
    "SYNDICATES"
  ]);
  assert.deepEqual(validateProvenanceLedger(createEmptyProvenanceLedger()), createEmptyProvenanceLedger());
  assert.throws(
    () => validateProvenanceLedger({ version: 99, artifacts: [], relationships: [] }),
    /unsupported provenance ledger version/i
  );
  assert.throws(
    () => upsertProvenanceArtifact(createEmptyProvenanceLedger(), {
      title: "Embedded mutable lineage",
      relationshipIds: ["relationship_1"]
    }, { now: fixedNow }),
    /one canonical source of truth/i
  );
});

test("artifact creation and permitted updates preserve stable identity and validate extensible kinds and origin roles", () => {
  const created = addArtifact(createEmptyProvenanceLedger(), "Original inspection dataset", 1, {
    kind: "EQUIPMENT_TELEMETRY",
    originRole: "FOUNDATIONAL",
    creator: "Inspection team",
    publisher: "Operations unit",
    sourceLocator: "record://inspection/17",
    notes: "Primary collection record."
  });
  assert.match(created.artifact.id, /^provenance_artifact_/);
  assert.equal(listProvenanceArtifacts(created.ledger)[0].kind, "EQUIPMENT_TELEMETRY");
  const updated = upsertProvenanceArtifact(created.ledger, {
    id: created.artifact.id,
    title: "Original inspection dataset — corrected label",
    notes: "Label corrected without replacing identity."
  }, { now: at(2) });
  assert.equal(updated.artifact.id, created.artifact.id);
  assert.equal(updated.artifact.createdAt, created.artifact.createdAt);
  assert.notEqual(updated.artifact.updatedAt, created.artifact.updatedAt);
  assert.throws(
    () => addArtifact(created.ledger, "Bad kind", 3, { kind: "domain-specific" }),
    /uppercase extensible type token/i
  );
  assert.throws(
    () => addArtifact(created.ledger, "Bad role", 3, { originRole: "PRIMARY" }),
    /origin role/i
  );
  const duplicate = structuredClone(created.ledger);
  duplicate.artifacts.push(structuredClone(created.artifact));
  assert.throws(() => validateProvenanceLedger(duplicate), /duplicate provenance artifact ID/i);
});

test("relationship creation, meaning updates, deterministic duplicates, and soft removal preserve stable identity", () => {
  let ledger = createEmptyProvenanceLedger();
  const foundation = addArtifact(ledger, "Foundational record", 1, { originRole: "FOUNDATIONAL" });
  ledger = foundation.ledger;
  const created = addRelationship(ledger, {
    subjectType: "EVIDENCE_ITEM",
    subjectId: "evidence_1",
    objectType: "PROVENANCE_ARTIFACT",
    objectId: foundation.artifact.id,
    relationship: "CITES",
    notes: "Citation only."
  }, ["evidence_1"], 2);
  const duplicate = addRelationship(created.ledger, {
    subjectType: "EVIDENCE_ITEM",
    subjectId: "evidence_1",
    objectType: "PROVENANCE_ARTIFACT",
    objectId: foundation.artifact.id,
    relationship: "CITES",
    notes: "Citation only."
  }, ["evidence_1"], 3);
  assert.equal(duplicate.unchanged, true);
  assert.equal(duplicate.relationship.id, created.relationship.id);
  assert.equal(duplicate.ledger.relationships.length, 1);

  const updated = addRelationship(created.ledger, {
    id: created.relationship.id,
    relationship: "DERIVED_FROM",
    notes: "Material derivation was explicitly established."
  }, ["evidence_1"], 4);
  assert.equal(updated.relationship.id, created.relationship.id);
  assert.equal(updated.relationship.createdAt, created.relationship.createdAt);
  assert.equal(updated.relationship.relationship, "DERIVED_FROM");
  assert.throws(
    () => addRelationship(updated.ledger, {
      id: updated.relationship.id,
      subjectType: "EVIDENCE_ITEM",
      subjectId: "evidence_2",
      objectType: "PROVENANCE_ARTIFACT",
      objectId: foundation.artifact.id,
      relationship: "DERIVED_FROM"
    }, ["evidence_1", "evidence_2"], 5),
    /cannot be reassigned/i
  );

  const removed = removeProvenanceRelationship(updated.ledger, updated.relationship.id, {
    reason: "The recorded derivation was withdrawn but remains historical.",
    evidenceIds: ["evidence_1"],
    now: at(6)
  });
  assert.equal(removed.relationship.status, "REMOVED");
  assert.equal(listProvenanceRelationships(removed.ledger).length, 0);
  assert.equal(listProvenanceRelationships(removed.ledger, { includeRemoved: true }).length, 1);
  assert.equal(removed.relationship.id, created.relationship.id);
  assert.throws(
    () => removeProvenanceRelationship(removed.ledger, removed.relationship.id, {
      reason: "Duplicate removal is invalid.",
      evidenceIds: ["evidence_1"],
      now: at(7)
    }),
    /already been removed/i
  );
});

test("typed endpoint and canonical referential integrity fail closed in normalization and v1/v2 import", () => {
  let state = addEvidence(project(), "An inspection measured repeatable downtime.", 1);
  const artifactResult = addProjectArtifact(state, "Inspection source record", 2, { originRole: "FOUNDATIONAL" });
  state = artifactResult.state;
  state = addProjectRelationship(state, {
    subjectType: "EVIDENCE_ITEM",
    subjectId: state.evidence[0].id,
    objectType: "PROVENANCE_ARTIFACT",
    objectId: artifactResult.artifact.id,
    relationship: "DERIVED_FROM"
  }, 3).state;

  const missingEvidence = structuredClone(state);
  missingEvidence.evidence = [];
  assert.throws(() => normalizeProjectState(missingEvidence), /unknown evidence/i);
  assert.throws(() => importProjectBackup({
    format: "rethink.project.backup",
    formatVersion: 1,
    project: missingEvidence
  }), /unknown evidence/i);
  assert.throws(() => importProjectBackup({
    format: "rethink.project.backup",
    formatVersion: 2,
    project: missingEvidence,
    runtimeSession: { mode: "demo" }
  }), /unknown evidence/i);

  const missingArtifact = structuredClone(state);
  missingArtifact.provenanceLedger.artifacts = [];
  assert.throws(() => normalizeProjectState(missingArtifact), /unknown artifact/i);
  const badEndpointType = structuredClone(state);
  badEndpointType.provenanceLedger.relationships[0].subjectType = "CLAIM";
  assert.throws(() => normalizeProjectState(badEndpointType), /subjectType must be one of/i);

  const duplicateRelationshipId = structuredClone(state);
  duplicateRelationshipId.provenanceLedger.relationships.push(structuredClone(
    duplicateRelationshipId.provenanceLedger.relationships[0]
  ));
  assert.throws(() => normalizeProjectState(duplicateRelationshipId), /duplicate provenance relationship ID/i);
});

test("FOUNDATIONAL artifacts with active material ancestry fail closed in validation, normalization, and v1/v2 import", () => {
  let state = project();
  const child = addProjectArtifact(state, "Derivative child artifact", 1, {
    kind: "STUDY",
    originRole: "DERIVATIVE"
  });
  state = child.state;
  const parent = addProjectArtifact(state, "Foundational parent artifact", 2, {
    kind: "DATASET",
    originRole: "FOUNDATIONAL"
  });
  state = parent.state;
  state = addProjectRelationship(state, {
    subjectType: "PROVENANCE_ARTIFACT",
    subjectId: child.artifact.id,
    objectType: "PROVENANCE_ARTIFACT",
    objectId: parent.artifact.id,
    relationship: "DERIVED_FROM"
  }, 3).state;

  const conflict = structuredClone(state);
  conflict.provenanceLedger.artifacts.find((item) => item.id === child.artifact.id).originRole = "FOUNDATIONAL";
  assert.throws(
    () => validateProvenanceLedger(conflict.provenanceLedger),
    /foundational provenance artifact.+cannot be the subject of active material dependency/i
  );
  assert.throws(
    () => normalizeProjectState(conflict),
    /foundational provenance artifact.+active material dependency/i
  );
  assert.throws(
    () => importProjectBackup({
      format: "rethink.project.backup",
      formatVersion: 1,
      project: conflict
    }),
    /foundational provenance artifact.+active material dependency/i
  );
  assert.throws(
    () => importProjectBackup({
      format: "rethink.project.backup",
      formatVersion: 2,
      project: conflict,
      runtimeSession: { mode: "demo" }
    }),
    /foundational provenance artifact.+active material dependency/i
  );
  assert.throws(
    () => analyzeIndependentEvidenceChains(conflict.provenanceLedger, { evidenceItems: [] }),
    /foundational provenance artifact.+active material dependency/i
  );
});

test("Core operations enforce foundational roots while allowing parent, citation, replication, and removed-history roles", () => {
  let state = project();
  const foundation = addProjectArtifact(state, "Foundational collection record", 1, {
    kind: "DATASET",
    originRole: "FOUNDATIONAL"
  });
  state = foundation.state;
  const otherFoundation = addProjectArtifact(state, "Other foundational record", 2, {
    kind: "TEST",
    originRole: "FOUNDATIONAL"
  });
  state = otherFoundation.state;

  for (const [index, relationship] of MATERIAL_DEPENDENCY_RELATIONSHIPS.entries()) {
    assert.throws(
      () => addProjectRelationship(state, {
        subjectType: "PROVENANCE_ARTIFACT",
        subjectId: foundation.artifact.id,
        objectType: "PROVENANCE_ARTIFACT",
        objectId: otherFoundation.artifact.id,
        relationship
      }, index + 3),
      /foundational provenance artifact.+active material dependency/i
    );
  }

  state = addProjectRelationship(state, {
    subjectType: "PROVENANCE_ARTIFACT",
    subjectId: foundation.artifact.id,
    objectType: "PROVENANCE_ARTIFACT",
    objectId: otherFoundation.artifact.id,
    relationship: "CITES"
  }, 7).state;
  state = addProjectRelationship(state, {
    subjectType: "PROVENANCE_ARTIFACT",
    subjectId: foundation.artifact.id,
    objectType: "PROVENANCE_ARTIFACT",
    objectId: otherFoundation.artifact.id,
    relationship: "REPLICATES"
  }, 8).state;

  const derivative = addProjectArtifact(state, "Derivative report", 9, {
    kind: "DOCUMENT",
    originRole: "DERIVATIVE"
  });
  state = derivative.state;
  const material = addProjectRelationship(state, {
    subjectType: "PROVENANCE_ARTIFACT",
    subjectId: derivative.artifact.id,
    objectType: "PROVENANCE_ARTIFACT",
    objectId: foundation.artifact.id,
    relationship: "SUMMARIZES"
  }, 10);
  state = material.state;
  assert.throws(
    () => manageProjectState(state, {
      type: "UPSERT_PROVENANCE_ARTIFACT",
      reason: "Attempt to contradict active material ancestry.",
      item: {
        id: derivative.artifact.id,
        originRole: "FOUNDATIONAL"
      }
    }, { now: at(11) }),
    /foundational provenance artifact.+active material dependency/i
  );

  state = manageProjectState(state, {
    type: "REMOVE_PROVENANCE_RELATIONSHIP",
    id: material.relationship.id,
    reason: "Retire the material assertion while preserving its history."
  }, { now: at(12) }).state;
  const changedRole = manageProjectState(state, {
    type: "UPSERT_PROVENANCE_ARTIFACT",
    reason: "The retained artifact is now explicitly classified as a foundational origin.",
    item: {
      id: derivative.artifact.id,
      originRole: "FOUNDATIONAL"
    }
  }, { now: at(13) });
  assert.equal(changedRole.artifact.originRole, "FOUNDATIONAL");
  assert.equal(changedRole.state.provenanceLedger.relationships.find((item) => item.id === material.relationship.id).status, "REMOVED");
  assert.equal(changedRole.state.provenanceLedger.relationships.filter((item) => item.relationship === "CITES").length, 1);
  assert.equal(changedRole.state.provenanceLedger.relationships.filter((item) => item.relationship === "REPLICATES").length, 1);
  assert.doesNotThrow(() => normalizeProjectState(changedRole.state));
});

test("removed evidence and removed relationships retain valid historical endpoints without entering active analysis", () => {
  let state = addEvidence(project(), "A retained test record supports historical inspection.", 1);
  const artifactResult = addProjectArtifact(state, "Retained historical test record", 2, {
    kind: "TEST",
    originRole: "FOUNDATIONAL"
  });
  state = artifactResult.state;
  const relationshipResult = addProjectRelationship(state, {
    subjectType: "EVIDENCE_ITEM",
    subjectId: state.evidence[0].id,
    objectType: "PROVENANCE_ARTIFACT",
    objectId: artifactResult.artifact.id,
    relationship: "DERIVED_FROM"
  }, 3);
  state = relationshipResult.state;
  state = manageProjectState(state, {
    type: "REMOVE_EVIDENCE",
    id: state.evidence[0].id,
    reason: "Evidence is no longer active but its provenance remains historical."
  }, { now: at(4) }).state;
  assert.equal(state.evidence[0].status, "REMOVED");
  assert.equal(state.provenanceLedger.relationships[0].status, "ACTIVE");
  assert.doesNotThrow(() => normalizeProjectState(state));
  const report = createProjectReport(state, { now: at(5) });
  assert.equal(report.provenance.analysis.evidenceMappings.length, 0);
  assert.equal(report.provenance.summary.knownIndependentChainCount, 0);
  assert.equal(report.provenance.relationships.length, 1);

  const retired = manageProjectState(relationshipResult.state, {
    type: "REMOVE_PROVENANCE_RELATIONSHIP",
    id: relationshipResult.relationship.id,
    reason: "Retire the current lineage assertion without erasing history."
  }, { now: at(5) }).state;
  assert.equal(retired.provenanceLedger.relationships[0].status, "REMOVED");
  assert.doesNotThrow(() => normalizeProjectState(retired));
});

test("material dependency cycles fail closed while citation cycles remain inspectable warnings", () => {
  let ledger = createEmptyProvenanceLedger();
  const a = addArtifact(ledger, "Source A", 1);
  ledger = a.ledger;
  const b = addArtifact(ledger, "Source B", 2);
  ledger = b.ledger;
  const c = addArtifact(ledger, "Source C", 3);
  ledger = c.ledger;

  const selfCycle = {
    subjectType: "PROVENANCE_ARTIFACT",
    subjectId: a.artifact.id,
    objectType: "PROVENANCE_ARTIFACT",
    objectId: a.artifact.id,
    relationship: "DERIVED_FROM"
  };
  assert.throws(() => addRelationship(ledger, selfCycle, [], 4), /material provenance dependency cycle/i);

  let material = addRelationship(ledger, {
    subjectType: "PROVENANCE_ARTIFACT",
    subjectId: a.artifact.id,
    objectType: "PROVENANCE_ARTIFACT",
    objectId: b.artifact.id,
    relationship: "DERIVED_FROM"
  }, [], 4).ledger;
  material = addRelationship(material, {
    subjectType: "PROVENANCE_ARTIFACT",
    subjectId: b.artifact.id,
    objectType: "PROVENANCE_ARTIFACT",
    objectId: c.artifact.id,
    relationship: "SUMMARIZES"
  }, [], 5).ledger;
  assert.throws(() => addRelationship(material, {
    subjectType: "PROVENANCE_ARTIFACT",
    subjectId: c.artifact.id,
    objectType: "PROVENANCE_ARTIFACT",
    objectId: a.artifact.id,
    relationship: "REANALYZES"
  }, [], 6), /material provenance dependency cycle/i);

  let citations = addRelationship(ledger, {
    subjectType: "PROVENANCE_ARTIFACT",
    subjectId: a.artifact.id,
    objectType: "PROVENANCE_ARTIFACT",
    objectId: b.artifact.id,
    relationship: "CITES"
  }, [], 7).ledger;
  citations = addRelationship(citations, {
    subjectType: "PROVENANCE_ARTIFACT",
    subjectId: b.artifact.id,
    objectType: "PROVENANCE_ARTIFACT",
    objectId: a.artifact.id,
    relationship: "CITES"
  }, [], 8).ledger;
  assert.doesNotThrow(() => validateProvenanceLedger(citations));
  const analysis = analyzeIndependentEvidenceChains(citations, { evidenceItems: [] });
  assert.equal(analysis.citationCycleWarnings.length, 1);
  assert.equal(analysis.knownIndependentChainCount, 0);
  assert.match(analysis.citationCycleWarnings[0].warning, /does not establish material derivation/i);
});

test("summaries, syndications, reanalyses, and multiple documents collapse to one explicit foundational chain", () => {
  const evidenceItems = ["evidence_summary", "evidence_copy", "evidence_reanalysis", "evidence_document"].map((id) => ({
    id,
    status: "ACTIVE"
  }));
  const evidenceIds = evidenceItems.map((item) => item.id);
  let ledger = createEmptyProvenanceLedger();
  const root = addArtifact(ledger, "Foundational equipment dataset", 1, {
    kind: "DATASET",
    originRole: "FOUNDATIONAL"
  });
  ledger = root.ledger;
  const derivativeKinds = [
    ["Summary document", "SUMMARIZES"],
    ["Syndicated copy", "SYNDICATES"],
    ["Dataset reanalysis", "REANALYZES"],
    ["Derived document", "DERIVED_FROM"]
  ];
  const derivatives = [];
  for (const [index, [title, relationship]] of derivativeKinds.entries()) {
    const artifactResult = addArtifact(ledger, title, index + 2, { originRole: "DERIVATIVE" });
    ledger = artifactResult.ledger;
    derivatives.push(artifactResult.artifact);
    ledger = addRelationship(ledger, {
      subjectType: "PROVENANCE_ARTIFACT",
      subjectId: artifactResult.artifact.id,
      objectType: "PROVENANCE_ARTIFACT",
      objectId: root.artifact.id,
      relationship
    }, evidenceIds, index + 10).ledger;
  }
  for (const [index, evidence] of evidenceItems.entries()) {
    ledger = addRelationship(ledger, {
      subjectType: "EVIDENCE_ITEM",
      subjectId: evidence.id,
      objectType: "PROVENANCE_ARTIFACT",
      objectId: derivatives[index].id,
      relationship: "DERIVED_FROM"
    }, evidenceIds, index + 20).ledger;
  }
  const analysis = analyzeIndependentEvidenceChains(ledger, { evidenceItems });
  assert.equal(analysis.status, "RESOLVED");
  assert.equal(analysis.knownIndependentChainCount, 1);
  assert.deepEqual(analysis.foundationalRootIds, [root.artifact.id]);
  assert.ok(analysis.evidenceMappings.every((item) => item.chainClassification === "KNOWN_SHARED_ORIGIN"));
  assert.equal(analysis.evidenceMappings.length, 4);
  assert.notEqual(analysis.evidenceMappings.length, analysis.knownIndependentChainCount);
});

test("explicit independent foundations, genuine replication, and multi-parent derivatives map deterministically", () => {
  const evidenceItems = [
    { id: "evidence_original", status: "ACTIVE" },
    { id: "evidence_replication", status: "ACTIVE" },
    { id: "evidence_combined", status: "ACTIVE" }
  ];
  const evidenceIds = evidenceItems.map((item) => item.id);
  let ledger = createEmptyProvenanceLedger();
  const original = addArtifact(ledger, "Original foundational test", 1, {
    kind: "TEST",
    originRole: "FOUNDATIONAL"
  });
  ledger = original.ledger;
  const replication = addArtifact(ledger, "Independent replication test", 2, {
    kind: "TEST",
    originRole: "FOUNDATIONAL"
  });
  ledger = replication.ledger;
  const combined = addArtifact(ledger, "Combined derivative analysis", 3, {
    kind: "STUDY",
    originRole: "DERIVATIVE"
  });
  ledger = combined.ledger;
  ledger = addRelationship(ledger, {
    subjectType: "PROVENANCE_ARTIFACT",
    subjectId: replication.artifact.id,
    objectType: "PROVENANCE_ARTIFACT",
    objectId: original.artifact.id,
    relationship: "REPLICATES"
  }, evidenceIds, 4).ledger;
  for (const [index, [evidenceId, artifactId]] of [
    ["evidence_original", original.artifact.id],
    ["evidence_replication", replication.artifact.id],
    ["evidence_combined", combined.artifact.id]
  ].entries()) {
    ledger = addRelationship(ledger, {
      subjectType: "EVIDENCE_ITEM",
      subjectId: evidenceId,
      objectType: "PROVENANCE_ARTIFACT",
      objectId: artifactId,
      relationship: "DERIVED_FROM"
    }, evidenceIds, index + 5).ledger;
  }
  ledger = addRelationship(ledger, {
    subjectType: "PROVENANCE_ARTIFACT",
    subjectId: combined.artifact.id,
    objectType: "PROVENANCE_ARTIFACT",
    objectId: original.artifact.id,
    relationship: "SUMMARIZES"
  }, evidenceIds, 8).ledger;
  ledger = addRelationship(ledger, {
    subjectType: "PROVENANCE_ARTIFACT",
    subjectId: combined.artifact.id,
    objectType: "PROVENANCE_ARTIFACT",
    objectId: replication.artifact.id,
    relationship: "REANALYZES"
  }, evidenceIds, 9).ledger;

  const analysis = analyzeIndependentEvidenceChains(ledger, { evidenceItems });
  assert.equal(analysis.knownIndependentChainCount, 2);
  assert.deepEqual(analysis.foundationalRootIds.sort(), [original.artifact.id, replication.artifact.id].sort());
  assert.deepEqual(
    analysis.evidenceMappings.find((item) => item.evidenceId === "evidence_combined").foundationalRootIds.sort(),
    [original.artifact.id, replication.artifact.id].sort()
  );
  assert.equal(
    analysis.evidenceMappings.find((item) => item.evidenceId === "evidence_replication").foundationalRootIds[0],
    replication.artifact.id
  );
});

test("unlinked, citation-only, UNKNOWN, and orphan DERIVATIVE origins remain unresolved without inference", () => {
  const evidenceItems = [
    { id: "evidence_unlinked", status: "ACTIVE" },
    { id: "evidence_unknown", status: "ACTIVE" },
    { id: "evidence_derivative", status: "ACTIVE" },
    { id: "evidence_citation", status: "ACTIVE" }
  ];
  const evidenceIds = evidenceItems.map((item) => item.id);
  let ledger = createEmptyProvenanceLedger();
  const unknown = addArtifact(ledger, "Unknown-origin document", 1, { originRole: "UNKNOWN" });
  ledger = unknown.ledger;
  const derivative = addArtifact(ledger, "Orphan derivative document", 2, { originRole: "DERIVATIVE" });
  ledger = derivative.ledger;
  const foundation = addArtifact(ledger, "Cited foundational record", 3, { originRole: "FOUNDATIONAL" });
  ledger = foundation.ledger;
  for (const [index, [evidenceId, artifactId, relationship]] of [
    ["evidence_unknown", unknown.artifact.id, "DERIVED_FROM"],
    ["evidence_derivative", derivative.artifact.id, "DERIVED_FROM"],
    ["evidence_citation", foundation.artifact.id, "CITES"]
  ].entries()) {
    ledger = addRelationship(ledger, {
      subjectType: "EVIDENCE_ITEM",
      subjectId: evidenceId,
      objectType: "PROVENANCE_ARTIFACT",
      objectId: artifactId,
      relationship
    }, evidenceIds, index + 4).ledger;
  }
  const analysis = analyzeIndependentEvidenceChains(ledger, { evidenceItems });
  assert.equal(analysis.status, "UNRESOLVED");
  assert.equal(analysis.knownIndependentChainCount, 0);
  assert.deepEqual(analysis.unresolvedEvidenceIds.sort(), evidenceIds.sort());
  assert.ok(analysis.evidenceMappings.every((item) => item.chainClassification === "UNRESOLVED"));
  assert.ok(analysis.lineageWarnings.length >= 4);
});

test("claim-level independence uses only active Claim Ledger links and never changes claim semantics", () => {
  let state = project();
  state = addEvidence(state, "First report supports the service claim.", 1);
  state = addEvidence(state, "Second report contradicts a boundary condition.", 2);
  state = addEvidence(state, "Third report limits applicability.", 3);
  const artifactResult = addProjectArtifact(state, "Shared foundational contractor dataset", 4, {
    kind: "DATASET",
    originRole: "FOUNDATIONAL"
  });
  state = artifactResult.state;
  for (const [index, evidence] of state.evidence.entries()) {
    state = addProjectRelationship(state, {
      subjectType: "EVIDENCE_ITEM",
      subjectId: evidence.id,
      objectType: "PROVENANCE_ARTIFACT",
      objectId: artifactResult.artifact.id,
      relationship: "DERIVED_FROM"
    }, index + 5).state;
  }
  const claimResult = manageProjectState(state, {
    type: "UPSERT_CLAIM",
    reason: "Captured the explicit claim without inferring its status.",
    item: {
      text: "Contractor uptime improves under the proposed service.",
      status: "DISPUTED"
    }
  }, { now: at(8) });
  state = claimResult.state;
  const claimRelationshipIds = [];
  for (const [index, relationship] of ["SUPPORTS", "CONTRADICTS", "LIMITS"].entries()) {
    const result = manageProjectState(state, {
      type: "UPSERT_CLAIM_EVIDENCE_RELATIONSHIP",
      reason: "Recorded the evidence meaning separately from provenance lineage.",
      item: {
        claimId: claimResult.claim.id,
        evidenceId: state.evidence[index].id,
        relationship
      }
    }, { now: at(index + 9) });
    state = result.state;
    claimRelationshipIds.push(result.relationship.id);
  }
  const linkableEvidenceIds = state.evidence.map((item) => item.id);
  const before = structuredClone(state.claimLedger);
  let analysis = analyzeClaimIndependentEvidenceChains({
    provenanceLedger: state.provenanceLedger,
    claimLedger: state.claimLedger,
    evidenceItems: state.evidence,
    claimId: claimResult.claim.id,
    linkableEvidenceIds,
    eligibleEvidenceIds: linkableEvidenceIds
  });
  assert.equal(analysis.claimStatus, "DISPUTED");
  assert.equal(analysis.activeEvidenceIds.length, 3);
  assert.equal(analysis.knownIndependentChainCount, 1);
  assert.deepEqual(analysis.evidenceRelationships.LIMITS, [state.evidence[2].id]);
  assert.deepEqual(state.claimLedger, before);

  state = manageProjectState(state, {
    type: "REMOVE_CLAIM_EVIDENCE_RELATIONSHIP",
    id: claimRelationshipIds[1],
    reason: "The contradiction link was retired without deleting either endpoint."
  }, { now: at(12) }).state;
  analysis = analyzeClaimIndependentEvidenceChains({
    provenanceLedger: state.provenanceLedger,
    claimLedger: state.claimLedger,
    evidenceItems: state.evidence,
    claimId: claimResult.claim.id,
    linkableEvidenceIds,
    eligibleEvidenceIds: linkableEvidenceIds
  });
  assert.equal(analysis.activeEvidenceIds.length, 2);
  assert.deepEqual(analysis.evidenceRelationships.CONTRADICTS, []);
  assert.equal(state.claimLedger.claims[0].status, "DISPUTED");
});

test("removed Evidence Items leave provenance inspectable but are excluded from active claim chain counts", () => {
  let state = addEvidence(project(), "A removable observation has a traceable source.", 1);
  const artifactResult = addProjectArtifact(state, "Retained source record", 2, { originRole: "FOUNDATIONAL" });
  state = artifactResult.state;
  state = addProjectRelationship(state, {
    subjectType: "EVIDENCE_ITEM",
    subjectId: state.evidence[0].id,
    objectType: "PROVENANCE_ARTIFACT",
    objectId: artifactResult.artifact.id,
    relationship: "DERIVED_FROM"
  }, 3).state;
  const claimResult = manageProjectState(state, {
    type: "UPSERT_CLAIM",
    reason: "Captured a claim for removed-evidence analysis.",
    item: { text: "The removable observation remains current." }
  }, { now: at(4) });
  state = claimResult.state;
  state = manageProjectState(state, {
    type: "UPSERT_CLAIM_EVIDENCE_RELATIONSHIP",
    reason: "Linked the active evidence to the claim before removal.",
    item: {
      claimId: claimResult.claim.id,
      evidenceId: state.evidence[0].id,
      relationship: "SUPPORTS"
    }
  }, { now: at(5) }).state;
  state = manageProjectState(state, {
    type: "REMOVE_EVIDENCE",
    id: state.evidence[0].id,
    reason: "The evidence is inactive; retain both histories."
  }, { now: at(6) }).state;
  const analysis = analyzeClaimIndependentEvidenceChains({
    provenanceLedger: state.provenanceLedger,
    claimLedger: state.claimLedger,
    evidenceItems: state.evidence,
    claimId: claimResult.claim.id,
    linkableEvidenceIds: [],
    eligibleEvidenceIds: []
  });
  assert.equal(analysis.activeEvidenceIds.length, 0);
  assert.equal(analysis.knownIndependentChainCount, 0);
  assert.equal(state.provenanceLedger.relationships.length, 1);
  assert.equal(state.provenanceLedger.relationships[0].objectId, artifactResult.artifact.id);
  assert.equal(state.claimLedger.evidenceRelationships[0].status, "REMOVED");
});

test("synthetic evidence can carry lineage for traceability but cannot become eligible real-world independence", () => {
  let state = addEvidence(project(), "Synthetic fixture result for provenance testing.", 1, {
    evidenceAuthenticity: "SYNTHETIC_SIMULATED",
    collectionMethod: "STATISTICAL_MODELING_ESTIMATION"
  });
  const artifactResult = addProjectArtifact(state, "Synthetic fixture generator", 2, {
    kind: "TEST",
    originRole: "FOUNDATIONAL"
  });
  state = artifactResult.state;
  state = addProjectRelationship(state, {
    subjectType: "EVIDENCE_ITEM",
    subjectId: state.evidence[0].id,
    objectType: "PROVENANCE_ARTIFACT",
    objectId: artifactResult.artifact.id,
    relationship: "DERIVED_FROM"
  }, 3).state;
  const analysis = analyzeIndependentEvidenceChains(state.provenanceLedger, {
    evidenceItems: state.evidence,
    evidenceIds: [state.evidence[0].id],
    eligibleEvidenceIds: []
  });
  assert.equal(analysis.traceableChainCount, 1);
  assert.equal(analysis.knownIndependentChainCount, 0);
  assert.deepEqual(analysis.ineligibleForRealWorldValidationEvidenceIds, [state.evidence[0].id]);
  assert.equal(state.evidence[0].evidenceAuthenticity, "SYNTHETIC_SIMULATED");
  assert.equal(isActualEvidence(state.evidence[0]), false);
  const report = createProjectReport(state, { now: at(4) });
  assert.equal(report.provenance.summary.syntheticOrOtherwiseIneligibleEvidenceCount, 1);
  assert.equal(report.propositionStatus.status, "INSUFFICIENT_EVIDENCE");
  assert.equal(report.evidenceBase.totalObservedItems, 0);
});

test("new and legacy projects receive an empty ledger without fabricated provenance or history", () => {
  const current = project();
  assert.deepEqual(current.provenanceLedger, createEmptyProvenanceLedger());
  const legacy = structuredClone(current);
  delete legacy.provenanceLedger;
  legacy.evidence.push({
    id: "legacy_evidence",
    claim: "Legacy source metadata remains exactly available for ordinary normalization.",
    sourceTitle: "Existing title",
    sourceUrl: "https://example.com/existing",
    provenanceOrigin: "EXTERNAL_SOURCE",
    intakeType: "PUBLIC_SOURCE_FINDING",
    evidenceAuthenticity: "REAL_WORLD",
    sourceClassification: "SECONDARY",
    sourceCategory: "INDUSTRY",
    reliability: "MODERATE",
    relationship: "NONE_UNLINKED",
    collectionMethod: "DOCUMENT_REVIEW",
    assessment: "Legacy evidence metadata.",
    status: "ACTIVE",
    assumptionIds: [],
    questionRefs: [],
    capturedAt: current.createdAt
  });
  const before = {
    cycle: legacy.cycle,
    createdAt: legacy.createdAt,
    updatedAt: legacy.updatedAt,
    notebook: structuredClone(legacy.notebook),
    stateEvents: structuredClone(legacy.stateEvents),
    evidenceSourceTitle: legacy.evidence[0].sourceTitle,
    evidenceSourceUrl: legacy.evidence[0].sourceUrl
  };
  const normalized = normalizeProjectState(legacy);
  assert.deepEqual(normalized.provenanceLedger, createEmptyProvenanceLedger());
  assert.equal(normalized.provenanceLedger.artifacts.length, 0);
  assert.equal(normalized.provenanceLedger.relationships.length, 0);
  assert.equal(normalized.cycle, before.cycle);
  assert.equal(normalized.createdAt, before.createdAt);
  assert.equal(normalized.updatedAt, before.updatedAt);
  assert.deepEqual(normalized.notebook, before.notebook);
  assert.deepEqual(normalized.stateEvents, before.stateEvents);
  assert.equal(normalized.evidence[0].sourceTitle, before.evidenceSourceTitle);
  assert.equal(normalized.evidence[0].sourceUrl, before.evidenceSourceUrl);
});

test("provenance persists through cycles, locks, Notebook, reports, human export, and v1/v2 backups", () => {
  let state = addEvidence(project(), "A measured equipment record has an explicit origin.", 1);
  const artifactResult = addProjectArtifact(state, "Foundational maintenance log", 2, {
    kind: "OFFICIAL_RECORD",
    originRole: "FOUNDATIONAL",
    publisher: "Equipment operator"
  });
  state = artifactResult.state;
  state = addProjectRelationship(state, {
    subjectType: "EVIDENCE_ITEM",
    subjectId: state.evidence[0].id,
    objectType: "PROVENANCE_ARTIFACT",
    objectId: artifactResult.artifact.id,
    relationship: "DERIVED_FROM"
  }, 3).state;
  const ledgerBeforeCycle = structuredClone(state.provenanceLedger);

  const routing = createDemoRouting(state);
  const completed = applyCycleOutput(
    state,
    routing,
    createDemoCycle(state, routing),
    { mode: "demo", model: "deterministic-demo" },
    { now: at(4) }
  ).state;
  assert.deepEqual(completed.provenanceLedger, ledgerBeforeCycle);

  const locked = lockProjectState(completed, { note: "Preserve the traced working state.", now: at(5) }).state;
  assert.deepEqual(locked.lockedDecisions.at(-1).provenanceLedger, ledgerBeforeCycle);
  const notebook = createNotebookExport(locked, { now: at(6) });
  assert.deepEqual(notebook.provenanceLedger, ledgerBeforeCycle);

  const report = createProjectReport(locked, { now: at(7) });
  assert.equal(report.provenance.summary.artifactCount, 1);
  assert.equal(report.provenance.summary.evidenceAnalyzedCount, 1);
  assert.equal(report.provenance.summary.knownIndependentChainCount, 1);
  assert.equal(report.provenance.summary.unresolvedEvidenceCount, 0);
  assert.equal(report.provenance.summary.derivativeArtifactCount, 0);
  assert.equal(report.provenance.summary.derivativeRelationshipCount, 1);
  assert.equal(report.provenance.summary.citationCycleCount, 0);
  assert.equal(report.provenance.summary.syntheticOrOtherwiseIneligibleEvidenceCount, 0);
  const human = createHumanReportArtifact(report);
  assert.match(human.content, /Evidence Lineage \/ Provenance/);
  assert.match(human.content, /Known eligible independent chains/);
  assert.match(human.content, /Active derivative relationships/);
  assert.match(human.content, /do not validate any proposition/i);

  const v1 = createProjectBackup(locked, { now: at(8) });
  assert.equal(v1.formatVersion, 1);
  assert.deepEqual(v1.project.provenanceLedger, ledgerBeforeCycle);
  const importedV1 = importProjectBackup(v1, { now: at(9) });
  assert.deepEqual(importedV1.provenanceLedger, ledgerBeforeCycle);
  const v2 = {
    ...v1,
    formatVersion: 2,
    runtimeSession: {
      mode: "demo",
      reasoning: { status: "PENDING", responseId: "resp_provenance_restore" }
    }
  };
  const importedV2 = importProjectBackup(v2, { now: at(10) });
  assert.deepEqual(importedV2.provenanceLedger, ledgerBeforeCycle);
  const nextRouting = createDemoRouting(importedV2);
  const continued = applyCycleOutput(
    importedV2,
    nextRouting,
    createDemoCycle(importedV2, nextRouting),
    { mode: "demo", model: "deterministic-demo" },
    { now: at(11) }
  ).state;
  assert.equal(continued.cycle, importedV2.cycle + 1);
  assert.deepEqual(continued.provenanceLedger, ledgerBeforeCycle);
});

test("prompt context contains bounded relevant provenance and never equates source count with independence", () => {
  let state = addEvidence(project("A pump-maintenance contractor needs a traceable validation sequence."), "A logged test measured pump downtime.", 1);
  const relevant = addProjectArtifact(state, "Relevant pump test record", 2, {
    kind: "TEST",
    originRole: "FOUNDATIONAL"
  });
  state = relevant.state;
  state = addProjectRelationship(state, {
    subjectType: "EVIDENCE_ITEM",
    subjectId: state.evidence[0].id,
    objectType: "PROVENANCE_ARTIFACT",
    objectId: relevant.artifact.id,
    relationship: "DERIVED_FROM"
  }, 3).state;
  state = addProjectArtifact(state, "UNRELATED_PRIVATE_ORIGIN_SHOULD_NOT_ENTER_PROMPT", 4, {
    originRole: "FOUNDATIONAL"
  }).state;
  const routing = createDemoRouting(state);
  const prompt = `${ROUTER_INSTRUCTIONS}\n${CYCLE_INSTRUCTIONS}\n${buildRoutingInput(state)}\n${buildCycleInput(state, routing)}`;
  assert.match(prompt, /Relevant pump test record/);
  assert.match(prompt, /knownIndependentChainCount/);
  assert.match(prompt, /never infer independence|do not treat source count as independent-chain count/i);
  assert.doesNotMatch(prompt, /UNRELATED_PRIVATE_ORIGIN_SHOULD_NOT_ENTER_PROMPT/);
  assert.doesNotMatch(prompt, /disabled veteran|florida workforce|fair-work|employer segment/i);
  assert.match(prompt, /"domainProfile":\s*\{[\s\S]*"id":\s*"BUSINESS"/);
  assert.doesNotMatch(prompt, /"id":\s*"(GENERAL|APPS|NEWS)"/);
});

test("empty and populated provenance do not change contractor routing, proposition, Claim Ledger, or profile behavior", () => {
  const input = "A construction-equipment repair contractor needs to validate whether downtime justifies a service.";
  const empty = project(input);
  const emptyRoute = createDemoRouting(empty);
  let populated = addEvidence(empty, "A bounded equipment log exists but does not itself validate demand.", 1);
  const artifactResult = addProjectArtifact(populated, "Equipment log source", 2, { originRole: "FOUNDATIONAL" });
  populated = artifactResult.state;
  populated = addProjectRelationship(populated, {
    subjectType: "EVIDENCE_ITEM",
    subjectId: populated.evidence[0].id,
    objectType: "PROVENANCE_ARTIFACT",
    objectId: artifactResult.artifact.id,
    relationship: "DERIVED_FROM"
  }, 3).state;
  const populatedRoute = createDemoRouting(populated);
  assert.equal(empty.domainProfile, "BUSINESS");
  assert.equal(populated.domainProfile, "BUSINESS");
  assert.equal(emptyRoute.selectedMethod, "DEFINE");
  assert.equal(populatedRoute.selectedMethod, "DEFINE");
  assert.equal(empty.claimLedger.claims.length, 0);
  assert.equal(populated.claimLedger.claims.length, 0);
  const report = createProjectReport(populated, { now: at(4) });
  assert.notEqual(report.propositionStatus.status, "VALIDATED");
  assert.doesNotMatch(JSON.stringify({ emptyRoute, populatedRoute, report }), /disabled veteran|florida workforce|fair-work|employer segment/i);
});
