import assert from "node:assert/strict";
import test from "node:test";
import { createLocalProjectRepository } from "../public/project-repository.js";
import { createRuntime } from "../server.js";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    has(key) { return values.has(key); }
  };
}

test("device-local repository persists and clears an isolated project session", () => {
  const storage = memoryStorage();
  const repository = createLocalProjectRepository(storage);
  const session = { state: { id: "project_one" }, result: null, routing: null };
  repository.saveSession(session);
  assert.equal(repository.kind, "DEVICE_LOCAL");
  assert.deepEqual(repository.loadSession().state, {
    ...session.state,
    domainProfile: "BUSINESS",
    domainProfileVersion: "1.0.0",
    claimLedger: { version: 1, claims: [], evidenceRelationships: [] },
    provenanceLedger: { version: 1, artifacts: [], relationships: [] },
    temporalLedger: { version: 1, assessments: [], relationships: [] },
    reasoningIntegrityLedger: { version: 1, capabilityAssessments: [] }
  });
  repository.clearSession();
  assert.equal(repository.loadSession(), null);
});

test("device-local repository migrates the legacy single-project key", () => {
  const storage = memoryStorage({
    "rethink.project.v0.1": JSON.stringify({ state: { id: "legacy_project" }, result: null, routing: null })
  });
  const repository = createLocalProjectRepository(storage);
  assert.equal(repository.loadSession().state.id, "legacy_project");
  assert.equal(repository.loadSession().state.domainProfile, "BUSINESS");
  assert.equal(repository.loadSession().state.domainProfileVersion, "1.0.0");
  assert.deepEqual(repository.loadSession().state.claimLedger, { version: 1, claims: [], evidenceRelationships: [] });
  assert.deepEqual(repository.loadSession().state.provenanceLedger, { version: 1, artifacts: [], relationships: [] });
  assert.deepEqual(repository.loadSession().state.temporalLedger, { version: 1, assessments: [], relationships: [] });
  assert.deepEqual(repository.loadSession().state.reasoningIntegrityLedger, { version: 1, capabilityAssessments: [] });
  assert.equal(storage.has("rethink.project.v0.1"), false);
  assert.equal(storage.has("rethink.workspace.v0.1"), true);
});

test("repository refuses sessions without a project identity", () => {
  const repository = createLocalProjectRepository(memoryStorage());
  assert.throws(() => repository.saveSession({ state: {} }), /project ID/i);
});

test("version 2 backup restores a complete project across independent browser origins and can continue", async () => {
  const runtime = createRuntime({ apiKey: "" });
  const originA = createLocalProjectRepository(memoryStorage());
  const originB = createLocalProjectRepository(memoryStorage());
  let state = runtime.initialize("A portable project must retain its complete isolated reasoning history.");
  state = runtime.manageState({
    state,
    operation: {
      type: "UPSERT_EVIDENCE",
      reason: "Portable evidence relationship coverage.",
      item: {
        claim: "A recorded observation bears on a portable explicit claim.",
        intakeType: "TEST_RESULT",
        provenanceOrigin: "USER_INPUT",
        reliability: "MODERATE",
        relationship: "NONE_UNLINKED",
        assessment: "Used to verify v2 portability.",
        assumptionIds: [],
        questionRefs: []
      }
    }
  }).state;
  state = runtime.manageState({
    state,
    operation: {
      type: "UPSERT_TEMPORAL_ASSESSMENT",
      reason: "Portable temporal assessment coverage.",
      item: {
        targetType: "EVIDENCE_ITEM",
        targetId: state.evidence[0].id,
        temporalStatus: "CURRENT",
        statusAsOf: "2026-07-20T12:00:00.000Z",
        effectiveFrom: "2026-01-01",
        effectiveTo: "2026-12-31",
        rationale: "Explicitly current for the portable-state verification interval."
      }
    }
  }).state;
  const provenanceArtifactResult = runtime.manageState({
    state,
    operation: {
      type: "UPSERT_PROVENANCE_ARTIFACT",
      reason: "Portable provenance artifact coverage.",
      item: {
        title: "Portable foundational test record",
        kind: "TEST",
        originRole: "FOUNDATIONAL",
        sourceLocator: "portable-record-1"
      }
    }
  });
  state = provenanceArtifactResult.state;
  state = runtime.manageState({
    state,
    operation: {
      type: "UPSERT_PROVENANCE_RELATIONSHIP",
      reason: "Portable provenance relationship coverage.",
      item: {
        subjectType: "EVIDENCE_ITEM",
        subjectId: state.evidence[0].id,
        objectType: "PROVENANCE_ARTIFACT",
        objectId: provenanceArtifactResult.artifact.id,
        relationship: "DERIVED_FROM"
      }
    }
  }).state;
  const claimResult = runtime.manageState({
    state,
    operation: {
      type: "UPSERT_CLAIM",
      reason: "Portable claim coverage.",
      item: { text: "The observed condition is material." }
    }
  });
  state = claimResult.state;
  const claimRelationshipResult = runtime.manageState({
    state,
    operation: {
      type: "UPSERT_CLAIM_EVIDENCE_RELATIONSHIP",
      reason: "Portable relationship coverage.",
      item: {
        claimId: claimResult.claim.id,
        evidenceId: state.evidence[0].id,
        relationship: "SUPPORTS"
      }
    }
  });
  state = claimRelationshipResult.state;
  state = runtime.manageState({
    state,
    operation: {
      type: "UPSERT_CAPABILITY_ASSESSMENT",
      reason: "Portable claim-specific capability coverage.",
      item: {
        claimEvidenceRelationshipId: claimRelationshipResult.relationship.id,
        overallFit: "FIT",
        scopeDimensions: [{
          dimension: "POPULATION",
          claimScope: "The observed condition in the recorded population.",
          evidenceScope: "The observed condition in the recorded population.",
          fitStatus: "MATCHED",
          rationale: "The claim and evidence use the same explicitly recorded population."
        }],
        detectionMaterial: false,
        detectionCapability: "NOT_APPLICABLE",
        absenceInferenceStatus: "NOT_APPLICABLE",
        rationale: "The Evidence Item is capable of bearing on the linked claim.",
        notes: ""
      }
    }
  }).state;
  const routed = await runtime.route({ state, mode: "demo" });
  const completed = await runtime.cycle({ state, routing: routed.routing, mode: "demo" });
  const legacyProject = structuredClone(completed.state);
  delete legacyProject.domainProfile;
  delete legacyProject.domainProfileVersion;
  const backup = {
    format: "rethink.project.backup",
    formatVersion: 2,
    exportedAt: "2026-07-20T12:00:00.000Z",
    projectId: completed.state.id,
    project: legacyProject,
    runtimeSession: {
      routing: routed.routing,
      result: completed.result,
      research: null,
      reasoning: {
        projectId: completed.state.id,
        status: "PENDING",
        responseId: "resp_resumable_profile_migration"
      },
      report: runtime.report({ state: completed.state }),
      mode: "demo"
    }
  };
  originA.saveSession({ state: completed.state, routing: routed.routing, result: completed.result });

  const importedState = runtime.importProject(backup);
  const importedSession = runtime.importRuntimeSession(backup, importedState);
  originB.saveSession({ state: importedState, ...importedSession });
  const restored = originB.loadSession();
  assert.equal(restored.state.id, completed.state.id);
  assert.equal(restored.state.cycle, completed.state.cycle);
  assert.deepEqual(restored.state.assumptions, completed.state.assumptions);
  assert.deepEqual(restored.state.evidence, completed.state.evidence);
  assert.deepEqual(restored.state.claimLedger, completed.state.claimLedger);
  assert.equal(restored.state.claimLedger.claims.length, 1);
  assert.equal(restored.state.claimLedger.evidenceRelationships.length, 1);
  assert.deepEqual(restored.state.provenanceLedger, completed.state.provenanceLedger);
  assert.equal(restored.state.provenanceLedger.artifacts.length, 1);
  assert.equal(restored.state.provenanceLedger.relationships.length, 1);
  assert.deepEqual(restored.state.temporalLedger, completed.state.temporalLedger);
  assert.equal(restored.state.temporalLedger.assessments.length, 1);
  assert.equal(restored.state.temporalLedger.relationships.length, 0);
  assert.deepEqual(restored.state.reasoningIntegrityLedger, completed.state.reasoningIntegrityLedger);
  assert.equal(restored.state.reasoningIntegrityLedger.capabilityAssessments.length, 1);
  assert.deepEqual(restored.state.questions, completed.state.questions);
  assert.equal(restored.state.notebook.length, completed.state.notebook.length);
  assert.equal(restored.state.domainProfile, "BUSINESS");
  assert.equal(restored.state.domainProfileVersion, "1.0.0");
  assert.equal(restored.result.cycle, completed.result.cycle);
  assert.equal(restored.reasoning.responseId, "resp_resumable_profile_migration");
  assert.doesNotMatch(JSON.stringify(backup), /OPENAI_API_KEY|Bearer\s+|\bsk-[A-Za-z0-9_-]{8,}/i);

  const nextRoute = await runtime.route({ state: restored.state, mode: "demo" });
  const nextCycle = await runtime.cycle({ state: restored.state, routing: nextRoute.routing, mode: "demo" });
  assert.equal(nextCycle.state.cycle, restored.state.cycle + 1);
});
