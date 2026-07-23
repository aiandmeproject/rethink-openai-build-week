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
    domainProfileVersion: "1.0.0"
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
  const state = runtime.initialize("A portable project must retain its complete isolated reasoning history.");
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
