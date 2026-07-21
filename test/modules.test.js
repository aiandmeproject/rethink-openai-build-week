import assert from "node:assert/strict";
import test from "node:test";
import {
  CORE_REASONING_MODULES,
  MODULE_IDS,
  REASONING_MODULE_REGISTRY,
  createReasoningModuleRegistry,
  getReasoningModule,
  validateReasoningModule
} from "../rethink-modules.js";
import { createDemoRouting, initializeProject } from "../rethink-engine.js";
import { METHODS } from "../rethink-schema.js";

test("core reasoning modules satisfy the common versioned contract", () => {
  assert.equal(CORE_REASONING_MODULES.length, 14);
  assert.deepEqual(MODULE_IDS, METHODS);
  for (const module of CORE_REASONING_MODULES) {
    assert.equal(validateReasoningModule(module), module);
    assert.ok(module.triggerConditions.length > 0);
    assert.ok(module.evidenceRequirements.length > 0);
    assert.ok(module.expectedStructuredOutput.includes("evidence evaluation"));
    assert.match(module.version, /^\d+\.\d+\.\d+$/);
  }
});

test("a compatible module can be registered and invoked without changing PEC or notebook code", () => {
  const registry = createReasoningModuleRegistry();
  const module = {
    ...structuredClone(CORE_REASONING_MODULES[0]),
    id: "CONSTRAINT_MAP",
    name: "Constraint Map",
    purpose: "Identify the constraint that controls the current decision boundary.",
    defaultQuestion: "Which constraint most changes the available paths?",
    version: "0.1.0"
  };
  const registered = registry.register(module);
  const invocation = registry.invoke("CONSTRAINT_MAP", {
    projectId: "project_test",
    question: "Which legal or operational constraint controls this decision?"
  });
  assert.equal(registered.id, "CONSTRAINT_MAP");
  assert.equal(invocation.moduleVersion, "0.1.0");
  assert.equal(invocation.projectId, "project_test");
  assert.match(invocation.instructions, /problem definition|neutral|assumptions/i);
  assert.ok(invocation.expectedStructuredOutput.includes("next action and disposition"));
  assert.throws(() => registry.register(module), /already registered/i);
});

test("runtime routing consumes module metadata rather than duplicate method maps", () => {
  const state = initializeProject("A proposed service may solve an uncertain operational problem.");
  const routing = createDemoRouting(state);
  const module = getReasoningModule(routing.selectedMethod);
  assert.equal(REASONING_MODULE_REGISTRY.has(routing.selectedMethod), true);
  assert.equal(routing.whyMethod, module.routingRationale);
  assert.equal(routing.resolutionCriteria, module.resolutionCriteria);
  assert.deepEqual(routing.evidenceNeeded, module.evidenceRequirements);
});
