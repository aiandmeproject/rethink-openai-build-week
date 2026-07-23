import assert from "node:assert/strict";
import test from "node:test";
import {
  CLAIM_EVIDENCE_RELATIONSHIPS,
  CLAIM_LEDGER_VERSION,
  CLAIM_STATUSES,
  createEmptyClaimLedger,
  listClaimEvidenceRelationships,
  listClaims,
  normalizeClaimLedger,
  upsertClaim,
  upsertClaimEvidenceRelationship,
  validateClaimLedger
} from "../rethink-claims.js";
import {
  applyCycleOutput,
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
import { ValidationError } from "../rethink-schema.js";

const fixedNow = new Date("2026-07-23T14:00:00.000Z");

function project(input = "A recurring operational delay may justify a focused service intervention.") {
  return initializeProject(input, { now: fixedNow });
}

function addEvidence(state, claim, offsetMinutes = 1, extra = {}) {
  return manageProjectState(state, {
    type: "UPSERT_EVIDENCE",
    reason: "Recorded observed evidence for explicit claim evaluation.",
    item: {
      claim,
      intakeType: "TEST_RESULT",
      provenanceOrigin: "USER_INPUT",
      reliability: "MODERATE",
      relationship: "NONE_UNLINKED",
      assessment: "Observed evidence retained independently from its Claim Ledger relationships.",
      assumptionIds: [],
      questionRefs: [],
      ...extra
    }
  }, { now: new Date(fixedNow.getTime() + offsetMinutes * 60_000) }).state;
}

function addClaim(state, text, offsetMinutes = 2, extra = {}) {
  return manageProjectState(state, {
    type: "UPSERT_CLAIM",
    reason: "Captured an explicit material assertion for evaluation.",
    item: { text, ...extra }
  }, { now: new Date(fixedNow.getTime() + offsetMinutes * 60_000) });
}

function linkEvidence(state, claimId, evidenceId, relationship, offsetMinutes = 3, extra = {}) {
  return manageProjectState(state, {
    type: "UPSERT_CLAIM_EVIDENCE_RELATIONSHIP",
    reason: "Recorded how this evidence bears on this specific claim.",
    item: { claimId, evidenceId, relationship, ...extra }
  }, { now: new Date(fixedNow.getTime() + offsetMinutes * 60_000) });
}

test("Claim Ledger contract is versioned, explicit, extensible, and keeps one relationship source of truth", () => {
  assert.equal(CLAIM_LEDGER_VERSION, 1);
  assert.deepEqual(CLAIM_STATUSES, [
    "UNKNOWN",
    "SUPPORTED",
    "CONTRADICTED",
    "DISPUTED",
    "INSUFFICIENT_EVIDENCE"
  ]);
  assert.deepEqual(CLAIM_EVIDENCE_RELATIONSHIPS, ["SUPPORTS", "CONTRADICTS", "LIMITS"]);
  assert.deepEqual(createEmptyClaimLedger(), {
    version: 1,
    claims: [],
    evidenceRelationships: []
  });

  const created = upsertClaim(createEmptyClaimLedger(), {
    text: "A domain extension can use its own claim type.",
    type: "BUSINESS_RISK",
    status: "UNKNOWN",
    notes: ""
  }, { now: fixedNow });
  assert.equal(validateClaimLedger(created.ledger), created.ledger);
  assert.equal(listClaims(created.ledger)[0].type, "BUSINESS_RISK");
  assert.throws(
    () => upsertClaim(created.ledger, { text: "Invalid type.", type: "business-risk" }, { now: fixedNow }),
    /uppercase extensible type token/i
  );
  assert.throws(
    () => upsertClaim(createEmptyClaimLedger(), { text: "Embedded links are forbidden.", evidenceIds: ["evidence_1"] }, { now: fixedNow }),
    /one canonical source of truth/i
  );
});

test("new and legacy projects have an empty ledger without fabricated claims, links, or history", () => {
  const state = project();
  assert.deepEqual(state.claimLedger, createEmptyClaimLedger());
  assert.equal(state.claimLedger.claims.length, 0);
  assert.equal(state.claimLedger.evidenceRelationships.length, 0);

  const legacy = structuredClone(state);
  delete legacy.claimLedger;
  const before = {
    createdAt: legacy.createdAt,
    updatedAt: legacy.updatedAt,
    notebook: structuredClone(legacy.notebook),
    evidence: structuredClone(legacy.evidence),
    assumptions: structuredClone(legacy.assumptions)
  };
  const normalized = normalizeProjectState(legacy);
  assert.deepEqual(normalized.claimLedger, createEmptyClaimLedger());
  assert.equal(normalized.createdAt, before.createdAt);
  assert.equal(normalized.updatedAt, before.updatedAt);
  assert.deepEqual(normalized.notebook, before.notebook);
  assert.deepEqual(normalized.evidence, before.evidence);
  assert.deepEqual(normalized.assumptions.map((item) => ({
    id: item.id,
    text: item.text,
    status: item.status,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  })), before.assumptions.map((item) => ({
    id: item.id,
    text: item.text,
    status: item.status,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  })));

  const importedV1 = importProjectBackup({
    format: "rethink.project.backup",
    formatVersion: 1,
    exportedAt: "2026-07-23T14:01:00.000Z",
    projectId: legacy.id,
    project: legacy
  }, { now: new Date("2026-07-23T14:02:00.000Z") });
  assert.deepEqual(importedV1.claimLedger, createEmptyClaimLedger());
  assert.deepEqual(importedV1.notebook, before.notebook);
  assert.deepEqual(importedV1.evidence, before.evidence);
});

test("claim creation and updates preserve stable identity and never create evidence or assumptions", () => {
  const state = project();
  const added = addClaim(state, "Target operators experience a material recurring delay.");
  const claim = added.claim;
  assert.match(claim.id, /^claim_/);
  assert.equal(claim.type, "MATERIAL");
  assert.equal(claim.status, "UNKNOWN");
  assert.equal(added.state.stateEvents.at(-1).entityType, "CLAIM");
  assert.equal(added.state.notebook.at(-1).entryType, "STATE_EDIT");
  assert.deepEqual(added.state.evidence, []);
  assert.deepEqual(added.state.assumptions, normalizeProjectState(state).assumptions);

  const updated = manageProjectState(added.state, {
    type: "UPSERT_CLAIM",
    reason: "A human reviewed the available evidence and set the explicit status.",
    item: {
      id: claim.id,
      status: "DISPUTED",
      notes: "Support and contradiction both remain material."
    }
  }, { now: new Date("2026-07-23T14:03:00.000Z") });
  assert.equal(updated.claim.id, claim.id);
  assert.equal(updated.claim.createdAt, claim.createdAt);
  assert.equal(updated.claim.status, "DISPUTED");
  assert.ok(updated.claim.updatedAt > claim.updatedAt);
  assert.throws(
    () => manageProjectState(updated.state, {
      type: "UPSERT_CLAIM",
      reason: "Reject an invalid status value.",
      item: { id: claim.id, status: "VALIDATED" }
    }, { now: fixedNow }),
    /Claim status must be one of/i
  );
});

test("canonical evidence relationships support many-to-many and claim-specific meanings", () => {
  let state = project();
  state = addEvidence(state, "Observed work orders exceeded the delay threshold.", 1);
  state = addEvidence(state, "A narrower segment resolved the delay without the proposed service.", 2);
  const firstEvidenceId = state.evidence[0].id;
  const secondEvidenceId = state.evidence[1].id;
  const firstClaimResult = addClaim(state, "The delay is material across the target population.", 3);
  state = firstClaimResult.state;
  const secondClaimResult = addClaim(state, "The proposed service is required to resolve the delay.", 4);
  state = secondClaimResult.state;

  state = linkEvidence(state, firstClaimResult.claim.id, firstEvidenceId, "SUPPORTS", 5).state;
  state = linkEvidence(state, secondClaimResult.claim.id, firstEvidenceId, "CONTRADICTS", 6).state;
  state = linkEvidence(state, firstClaimResult.claim.id, secondEvidenceId, "LIMITS", 7).state;
  const relationships = listClaimEvidenceRelationships(state.claimLedger);
  assert.equal(relationships.length, 3);
  assert.deepEqual(
    relationships.map((item) => item.relationship).sort(),
    ["CONTRADICTS", "LIMITS", "SUPPORTS"]
  );
  assert.equal(relationships.filter((item) => item.evidenceId === firstEvidenceId).length, 2);
  assert.equal(relationships.filter((item) => item.claimId === firstClaimResult.claim.id).length, 2);
  assert.ok(state.claimLedger.claims.every((claim) => claim.status === "UNKNOWN"));
  assert.ok(state.claimLedger.claims.every((claim) => !Object.hasOwn(claim, "evidenceIds")));
  assert.ok(state.evidence.every((item) => !Object.hasOwn(item, "claimIds")));
});

test("duplicate linking is deterministic and relationship changes keep the stable relationship ID", () => {
  let state = addEvidence(project(), "A bounded observation bears on the material claim.");
  const claimResult = addClaim(state, "The observed condition recurs often enough to matter.");
  state = claimResult.state;
  const linked = linkEvidence(state, claimResult.claim.id, state.evidence[0].id, "SUPPORTS");
  const relationship = linked.relationship;
  const eventCount = linked.state.stateEvents.length;
  const notebookCount = linked.state.notebook.length;
  const projectUpdatedAt = linked.state.updatedAt;

  const duplicate = linkEvidence(linked.state, claimResult.claim.id, state.evidence[0].id, "SUPPORTS", 4);
  assert.equal(duplicate.unchanged, true);
  assert.equal(duplicate.relationship.id, relationship.id);
  assert.equal(duplicate.state.stateEvents.length, eventCount);
  assert.equal(duplicate.state.notebook.length, notebookCount);
  assert.equal(duplicate.state.updatedAt, projectUpdatedAt);

  const changed = linkEvidence(duplicate.state, claimResult.claim.id, state.evidence[0].id, "LIMITS", 5);
  assert.equal(changed.unchanged, false);
  assert.equal(changed.relationship.id, relationship.id);
  assert.equal(changed.relationship.relationship, "LIMITS");
  assert.equal(changed.state.claimLedger.evidenceRelationships.length, 1);

  const evidenceUpdated = manageProjectState(changed.state, {
    type: "UPSERT_EVIDENCE",
    reason: "Updated source metadata without changing its claim relationship.",
    item: {
      id: state.evidence[0].id,
      claim: state.evidence[0].claim,
      intakeType: "TEST_RESULT",
      provenanceOrigin: "USER_INPUT",
      reliability: "HIGH",
      relationship: "NONE_UNLINKED",
      assessment: "The evidence metadata was reviewed.",
      assumptionIds: [],
      questionRefs: []
    }
  }, { now: new Date("2026-07-23T14:06:00.000Z") });
  assert.equal(evidenceUpdated.state.claimLedger.evidenceRelationships[0].id, relationship.id);
  assert.equal(evidenceUpdated.state.claimLedger.evidenceRelationships[0].relationship, "LIMITS");
});

test("supporting and contradicting link counts never auto-set claim status or imply independence", () => {
  let state = project();
  state = addEvidence(state, "First supporting document.", 1);
  state = addEvidence(state, "Second supporting document.", 2);
  state = addEvidence(state, "One contradictory document.", 3);
  const claimResult = addClaim(state, "The target condition is widespread.", 4);
  state = claimResult.state;
  state = linkEvidence(state, claimResult.claim.id, state.evidence[0].id, "SUPPORTS", 5).state;
  state = linkEvidence(state, claimResult.claim.id, state.evidence[1].id, "SUPPORTS", 6).state;
  state = linkEvidence(state, claimResult.claim.id, state.evidence[2].id, "CONTRADICTS", 7).state;
  assert.equal(state.claimLedger.claims[0].status, "UNKNOWN");
  assert.equal(state.claimLedger.evidenceRelationships.length, 3);
  assert.ok(state.claimLedger.evidenceRelationships.every((item) => !Object.hasOwn(item, "independentEvidenceChain")));
  assert.ok(state.claimLedger.evidenceRelationships.every((item) => !Object.hasOwn(item, "sourceChain")));
});

test("referential integrity rejects unknown records and duplicate canonical relationships", () => {
  let state = addEvidence(project(), "Observed evidence for integrity testing.");
  const claimResult = addClaim(state, "A real material claim exists.");
  state = claimResult.state;
  assert.throws(
    () => linkEvidence(state, "claim_missing", state.evidence[0].id, "SUPPORTS"),
    /linked claim does not exist/i
  );
  assert.throws(
    () => linkEvidence(state, claimResult.claim.id, "evidence_missing", "SUPPORTS"),
    /linked evidence item does not exist/i
  );
  const linked = linkEvidence(state, claimResult.claim.id, state.evidence[0].id, "SUPPORTS").state;
  const invalid = structuredClone(linked.claimLedger);
  invalid.evidenceRelationships.push({
    ...invalid.evidenceRelationships[0],
    id: "claim_evidence_duplicate"
  });
  assert.throws(
    () => normalizeClaimLedger(invalid, { evidenceIds: linked.evidence.map((item) => item.id) }),
    /Duplicate active claim-evidence relationship/i
  );
  assert.throws(
    () => normalizeClaimLedger({ ...invalid, version: 2 }),
    /Unsupported claim ledger version/i
  );
});

test("active and retired relationships fail closed when a canonical claim or evidence endpoint is physically missing", () => {
  let state = addEvidence(project(), "Observed evidence for retained-reference verification.");
  const claimResult = addClaim(state, "A retained relationship must keep both canonical endpoints.");
  state = linkEvidence(claimResult.state, claimResult.claim.id, state.evidence[0].id, "SUPPORTS").state;

  const activeMissingEvidence = structuredClone(state);
  activeMissingEvidence.evidence = [];
  assert.throws(
    () => normalizeProjectState(activeMissingEvidence),
    /references unknown evidence/i
  );

  const activeMissingClaim = structuredClone(state);
  activeMissingClaim.claimLedger.claims = [];
  assert.throws(
    () => normalizeProjectState(activeMissingClaim),
    /references unknown claim/i
  );

  const retired = manageProjectState(state, {
    type: "REMOVE_CLAIM_EVIDENCE_RELATIONSHIP",
    id: state.claimLedger.evidenceRelationships[0].id,
    reason: "Retired specifically to verify historical referential integrity."
  }, { now: new Date("2026-07-23T14:05:00.000Z") }).state;
  assert.equal(retired.claimLedger.evidenceRelationships[0].status, "REMOVED");

  const retiredMissingEvidence = structuredClone(retired);
  retiredMissingEvidence.evidence = [];
  assert.throws(
    () => normalizeProjectState(retiredMissingEvidence),
    /references unknown evidence/i
  );
  assert.throws(
    () => importProjectBackup({
      format: "rethink.project.backup",
      formatVersion: 1,
      projectId: retiredMissingEvidence.id,
      project: retiredMissingEvidence
    }, { now: fixedNow }),
    /references unknown evidence/i
  );

  const retiredMissingClaim = structuredClone(retired);
  retiredMissingClaim.claimLedger.claims = [];
  assert.throws(
    () => normalizeProjectState(retiredMissingClaim),
    /references unknown claim/i
  );
});

test("relationship removal is historical and evidence removal retires remaining active links", () => {
  let state = addEvidence(project(), "Observed evidence will later be removed.");
  const claimResult = addClaim(state, "A material claim needs this evidence.");
  state = claimResult.state;
  const linked = linkEvidence(state, claimResult.claim.id, state.evidence[0].id, "SUPPORTS");
  const removedLink = manageProjectState(linked.state, {
    type: "REMOVE_CLAIM_EVIDENCE_RELATIONSHIP",
    id: linked.relationship.id,
    reason: "The relationship was entered against the wrong interpretation."
  }, { now: new Date("2026-07-23T14:04:00.000Z") });
  assert.equal(removedLink.relationship.status, "REMOVED");
  assert.ok(removedLink.relationship.removedAt);
  assert.equal(listClaimEvidenceRelationships(removedLink.state.claimLedger).length, 0);
  assert.equal(listClaimEvidenceRelationships(removedLink.state.claimLedger, { includeRemoved: true }).length, 1);

  const relinked = linkEvidence(removedLink.state, claimResult.claim.id, state.evidence[0].id, "LIMITS", 5);
  assert.notEqual(relinked.relationship.id, linked.relationship.id);
  const removedEvidence = manageProjectState(relinked.state, {
    type: "REMOVE_EVIDENCE",
    id: state.evidence[0].id,
    reason: "The observation was found to be a duplicate record."
  }, { now: new Date("2026-07-23T14:06:00.000Z") });
  assert.equal(removedEvidence.state.evidence[0].status, "REMOVED");
  assert.equal(removedEvidence.state.evidence[0].id, state.evidence[0].id);
  assert.equal(removedEvidence.state.claimLedger.claims[0].id, claimResult.claim.id);
  assert.equal(listClaimEvidenceRelationships(removedEvidence.state.claimLedger).length, 0);
  const historicalRelationships = listClaimEvidenceRelationships(removedEvidence.state.claimLedger, { includeRemoved: true });
  assert.equal(historicalRelationships.length, 2);
  assert.ok(historicalRelationships.every((relationship) =>
    removedEvidence.state.evidence.some((item) => item.id === relationship.evidenceId)
    && removedEvidence.state.claimLedger.claims.some((claim) => claim.id === relationship.claimId)
  ));
  assert.doesNotThrow(() => normalizeProjectState(removedEvidence.state));
});

test("claims and links persist through cycle, lock, notebook, report, v1 backup, and import", () => {
  let state = addEvidence(project(), "Observed evidence supports the bounded explicit claim.");
  const claimResult = addClaim(state, "The bounded condition exists in the target segment.");
  state = linkEvidence(claimResult.state, claimResult.claim.id, state.evidence[0].id, "SUPPORTS").state;
  const beforeCycleLedger = structuredClone(state.claimLedger);
  const routing = createDemoRouting(state);
  const completed = applyCycleOutput(
    state,
    routing,
    createDemoCycle(state, routing),
    { mode: "demo", model: "deterministic-demo" },
    { now: new Date("2026-07-23T14:10:00.000Z") }
  ).state;
  assert.deepEqual(completed.claimLedger, beforeCycleLedger);

  const locked = lockProjectState(completed, { now: new Date("2026-07-23T14:11:00.000Z") }).state;
  assert.deepEqual(locked.lockedDecisions.at(-1).claimLedger, beforeCycleLedger);
  const notebook = createNotebookExport(locked, { now: new Date("2026-07-23T14:12:00.000Z") });
  assert.deepEqual(notebook.claimLedger, beforeCycleLedger);
  const report = createProjectReport(locked, { now: new Date("2026-07-23T14:13:00.000Z") });
  assert.equal(report.claimLedger.claims[0].status, "UNKNOWN");
  assert.equal(report.claimLedger.evidenceRelationships[0].relationship, "SUPPORTS");
  assert.equal(report.claimLedger.statusPolicy, "EXPLICIT_NOT_INFERRED_FROM_RELATIONSHIPS");
  assert.equal(report.propositionStatus.status, "UNRESOLVED");

  const backup = createProjectBackup(locked, { now: new Date("2026-07-23T14:14:00.000Z") });
  assert.equal(backup.formatVersion, 1);
  assert.deepEqual(backup.project.claimLedger, beforeCycleLedger);
  const imported = importProjectBackup(backup, { now: new Date("2026-07-23T14:15:00.000Z") });
  assert.deepEqual(imported.claimLedger, beforeCycleLedger);
});

test("legacy evidence remains valid and unlinked without becoming Claim Ledger support", () => {
  const withEvidence = addEvidence(project(), "Legacy evidence remains available after migration.", 1, {
    relationship: "SUPPORTS"
  });
  const legacy = structuredClone(withEvidence);
  delete legacy.claimLedger;
  const normalized = normalizeProjectState(legacy);
  const report = createProjectReport(normalized, { now: fixedNow });
  assert.equal(normalized.evidence.length, 1);
  assert.equal(normalized.evidence[0].status, "ACTIVE");
  assert.deepEqual(normalized.claimLedger, createEmptyClaimLedger());
  assert.equal(report.claimLedger.claims.length, 0);
  assert.equal(report.claimLedger.evidenceRelationships.length, 0);
  assert.equal(report.evidenceBase.supporting.length, 1);
});

test("prompt context distinguishes claims, assumptions, and evidence without mutating status", () => {
  let state = addEvidence(project(), "A direct observation bears on the explicit claim.");
  const claimResult = addClaim(state, "The target condition recurs.");
  state = linkEvidence(claimResult.state, claimResult.claim.id, state.evidence[0].id, "SUPPORTS").state;
  const routingInput = buildRoutingInput(state);
  const cycleInput = buildCycleInput(state, createDemoRouting(state));
  for (const input of [routingInput, cycleInput]) {
    assert.match(input, /"claimLedger"/);
    assert.match(input, new RegExp(claimResult.claim.id));
    assert.match(input, /"relationship": "SUPPORTS"/);
    assert.match(input, /"status": "UNKNOWN"/);
    assert.match(input, /"assumptions"/);
    assert.match(input, /"evidenceRegister"/);
  }
  assert.equal(state.claimLedger.claims[0].status, "UNKNOWN");
});

test("synthetic evidence may be linked for traceability but remains ineligible in the Claim Ledger report", () => {
  let state = addEvidence(project(), "Synthetic fixture reports strong support.", 1, {
    evidenceAuthenticity: "SYNTHETIC_SIMULATED",
    provenanceOrigin: "REAL_WORLD_TEST_OBSERVATION",
    relationship: "SUPPORTS",
    assessment: "Synthetic acceptance fixture only."
  });
  const claimResult = addClaim(state, "The real-world outcome exceeds the threshold.");
  state = linkEvidence(claimResult.state, claimResult.claim.id, state.evidence[0].id, "SUPPORTS").state;
  const report = createProjectReport(state, { now: fixedNow });
  assert.equal(report.claimLedger.evidenceRelationships[0].evidence.evidenceAuthenticity, "SYNTHETIC_SIMULATED");
  assert.equal(report.claimLedger.evidenceRelationships[0].evidence.eligibleForRealWorldValidation, false);
  assert.equal(report.claimLedger.claims[0].status, "UNKNOWN");
  assert.equal(report.evidenceBase.totalObservedItems, 0);
});

test("equipment contractor validation remains materially unchanged and isolated from workforce context", () => {
  let state = project("Determine whether contractors need guaranteed access to functioning commercial equipment through a bundled uptime subscription.");
  const claimResult = addClaim(state, "Contractors experience material downtime from unavailable equipment.");
  state = claimResult.state;
  const routing = createDemoRouting(state);
  const output = createDemoCycle(state, routing);
  const defined = applyCycleOutput(
    state,
    routing,
    output,
    { mode: "demo", model: "deterministic-demo" },
    { now: new Date("2026-07-23T14:10:00.000Z") }
  ).state;
  const validationRoute = createDemoRouting(defined);
  const serialized = JSON.stringify({ routing, output, validationRoute, prompt: buildCycleInput(state, routing) });
  assert.equal(routing.selectedMethod, "DEFINE");
  assert.match(routing.highestLeverageQuestion, /trunk problem|actual problem/i);
  assert.equal(validationRoute.selectedMethod, "VALIDATE");
  assert.equal(validationRoute.evidenceGate, "PUBLIC_RESEARCH_REQUIRED");
  assert.doesNotMatch(serialized, /disabled veteran|remote labor|workforce concept|employer segment/i);
  assert.equal(state.domainProfile, "BUSINESS");
});
