import assert from "node:assert/strict";
import test from "node:test";
import {
  DOMAIN_PROFILES,
  DOMAIN_PROFILE_REGISTRY,
  DomainProfileError,
  createDomainProfileAssignment,
  createDomainProfileRegistry,
  validateDomainProfile
} from "../rethink-domain-profiles.js";
import {
  applyCycleOutput,
  createDemoCycle,
  createDemoRouting,
  createProjectBackup,
  createProjectReport,
  importProjectBackup,
  initializeProject,
  normalizeProjectState
} from "../rethink-engine.js";
import { buildCycleInput, buildRoutingInput } from "../rethink-prompt.js";

const fixedNow = new Date("2026-07-23T12:00:00.000Z");
const genericInput = "A contractor equipment uptime service may address a costly and fragmented access problem.";

test("domain profiles satisfy the versioned contract and registry enumerates known availability", () => {
  assert.deepEqual(DOMAIN_PROFILE_REGISTRY.ids(), ["BUSINESS", "GENERAL", "APPS", "NEWS"]);
  assert.equal(DOMAIN_PROFILE_REGISTRY.list().filter((profile) => profile.availability === "ACTIVE").length, 1);
  for (const profile of DOMAIN_PROFILES) {
    assert.equal(validateDomainProfile(profile), profile);
    assert.match(profile.version, /^\d+\.\d+\.\d+$/);
  }
  assert.equal(DOMAIN_PROFILE_REGISTRY.resolve("BUSINESS").name, "Business");
  assert.throws(
    () => validateDomainProfile({ ...DOMAIN_PROFILES[0], version: "one" }),
    /semantic versioning/i
  );
});

test("profile registry rejects duplicates and can register a future overlay without copying the reasoning engine", () => {
  const registry = createDomainProfileRegistry();
  registry.register(DOMAIN_PROFILES[0]);
  assert.throws(() => registry.register(DOMAIN_PROFILES[0]), /already registered/i);
  registry.register({
    id: "SCIENCE",
    name: "Science",
    version: "0.1.0",
    availability: "ACTIVE",
    purpose: "Exercise the extension contract without creating another PEC, STM, notebook, or reasoning engine.",
    terminology: { project: "investigation" },
    additionalModuleIds: ["REPLICATION_CHECK"],
    safeguards: ["Preserve Rethink Core evidence integrity."]
  });
  assert.deepEqual(createDomainProfileAssignment("SCIENCE", { registry }), {
    domainProfile: "SCIENCE",
    domainProfileVersion: "0.1.0"
  });
});

test("new projects default to BUSINESS and accept only the active supported profile version", () => {
  const defaulted = initializeProject(genericInput, { now: fixedNow });
  assert.equal(defaulted.domainProfile, "BUSINESS");
  assert.equal(defaulted.domainProfileVersion, "1.0.0");

  const explicit = initializeProject(genericInput, {
    now: fixedNow,
    domainProfile: "BUSINESS",
    domainProfileVersion: "1.0.0"
  });
  assert.equal(explicit.domainProfile, "BUSINESS");
  assert.equal(explicit.domainProfileVersion, "1.0.0");

  assert.throws(
    () => initializeProject(genericInput, { domainProfile: "NEWS" }),
    (error) => error instanceof DomainProfileError
      && error.code === "DOMAIN_PROFILE_UNAVAILABLE"
      && /known but unavailable/i.test(error.message)
  );
  assert.throws(
    () => initializeProject(genericInput, { domainProfile: "BANANA" }),
    (error) => error instanceof DomainProfileError
      && error.code === "UNKNOWN_DOMAIN_PROFILE"
      && /unknown domain profile/i.test(error.message)
  );
  assert.throws(
    () => initializeProject(genericInput, { domainProfile: "BUSINESS", domainProfileVersion: "2.0.0" }),
    (error) => error instanceof DomainProfileError && error.code === "DOMAIN_PROFILE_VERSION_UNSUPPORTED"
  );
  assert.throws(
    () => normalizeProjectState({ ...defaulted, domainProfile: "NEWS" }),
    (error) => error instanceof DomainProfileError && error.code === "DOMAIN_PROFILE_UNAVAILABLE"
  );
});

test("legacy project normalization assigns BUSINESS without fabricating history or timestamps", () => {
  const legacy = initializeProject(genericInput, { now: fixedNow });
  delete legacy.domainProfile;
  delete legacy.domainProfileVersion;
  const before = structuredClone(legacy);
  const normalized = normalizeProjectState(legacy);

  assert.equal(normalized.domainProfile, "BUSINESS");
  assert.equal(normalized.domainProfileVersion, "1.0.0");
  for (const field of ["cycle", "notebook", "evidence", "stateEvents", "createdAt", "updatedAt"]) {
    assert.deepEqual(normalized[field], before[field]);
  }
});

test("profile identity persists through cycle, report, v1 backup migration, and import", () => {
  const state = initializeProject(genericInput, { now: fixedNow });
  const routing = createDemoRouting(state);
  const completed = applyCycleOutput(
    state,
    routing,
    createDemoCycle(state, routing),
    { mode: "demo", model: "deterministic-demo" },
    { now: new Date("2026-07-23T12:01:00.000Z") }
  ).state;
  assert.equal(completed.domainProfile, "BUSINESS");
  assert.equal(completed.domainProfileVersion, "1.0.0");

  const report = createProjectReport(completed, { now: new Date("2026-07-23T12:02:00.000Z") });
  assert.equal(report.domainProfile, "BUSINESS");
  assert.equal(report.domainProfileVersion, "1.0.0");

  const backup = createProjectBackup(completed, { now: new Date("2026-07-23T12:03:00.000Z") });
  assert.equal(backup.formatVersion, 1);
  assert.equal(backup.project.domainProfile, "BUSINESS");
  const legacyBackup = structuredClone(backup);
  delete legacyBackup.project.domainProfile;
  delete legacyBackup.project.domainProfileVersion;
  const imported = importProjectBackup(legacyBackup, { now: new Date("2026-07-23T12:04:00.000Z") });
  assert.equal(imported.domainProfile, "BUSINESS");
  assert.equal(imported.domainProfileVersion, "1.0.0");
  assert.equal(imported.cycle, completed.cycle);
  assert.equal(imported.notebook.length, completed.notebook.length);
});

test("prompt input contains only the active resolved profile and no unavailable-profile behavior", () => {
  const state = initializeProject(genericInput, { now: fixedNow });
  const routing = createDemoRouting(state);
  const prompt = `${buildRoutingInput(state)}\n${buildCycleInput(state, routing)}`;
  assert.match(prompt, /"id": "BUSINESS"/);
  assert.match(prompt, /"version": "1.0.0"/);
  assert.doesNotMatch(prompt, /GENERAL|APPS|NEWS/);
  assert.doesNotMatch(prompt, /workforce|disabled veteran|employer segment/i);
});

test("BUSINESS overlay preserves the contractor validation sequence and project isolation", () => {
  const input = "Determine whether dealer, manufacturer, leasing, rental, and fleet programs already provide contractors guaranteed access to functioning commercial equipment, or whether a bundled uptime subscription fills a fragmented gap.";
  const initial = initializeProject(input, { now: fixedNow });
  const defineRoute = createDemoRouting(initial);
  assert.equal(defineRoute.selectedMethod, "DEFINE");
  const defined = applyCycleOutput(
    initial,
    defineRoute,
    createDemoCycle(initial, defineRoute),
    { mode: "demo", model: "deterministic-demo" },
    { now: new Date("2026-07-23T12:01:00.000Z") }
  ).state;
  const validationRoute = createDemoRouting(defined);
  assert.equal(validationRoute.selectedMethod, "VALIDATE");
  assert.equal(validationRoute.evidenceGate, "PUBLIC_RESEARCH_REQUIRED");
  assert.equal(defined.domainProfile, "BUSINESS");
  assert.doesNotMatch(JSON.stringify({ defined, validationRoute }), /workforce|fair-work|disabled veteran|employer segment/i);
});
