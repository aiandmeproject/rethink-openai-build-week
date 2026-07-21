import assert from "node:assert/strict";
import test from "node:test";
import { createOpenAIClient, DEFAULT_LONG_REASONING_MAX_OUTPUT_TOKENS } from "../openai-client.js";
import { applyMethodOverride, createDemoCycle, createDemoRouting, initializeProject } from "../rethink-engine.js";
import { BACKGROUND_REASONING_METHODS, createRuntime } from "../server.js";

function mockResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, async json() { return body; } };
}

function testRoute(state) {
  return applyMethodOverride(createDemoRouting(state), "TEST", state);
}

function completedBody(state, routing, responseId = "resp_reasoning_complete") {
  return {
    id: responseId,
    status: "completed",
    model: "gpt-5.6-sol",
    output: [{
      type: "message",
      status: "completed",
      content: [{ type: "output_text", text: JSON.stringify(createDemoCycle(state, routing)), annotations: [] }]
    }]
  };
}

test("selected long-running methods use background Responses without web search", async () => {
  const state = initializeProject("A test cycle may require a long reasoning pass.");
  const routing = testRoute(state);
  let request;
  const client = createOpenAIClient({
    apiKey: "test-key",
    fetchImpl: async (_url, options) => {
      request = JSON.parse(options.body);
      return mockResponse({ id: "resp_reasoning_queued", status: "queued", model: "gpt-5.6-sol" });
    }
  });
  const started = await client.startBackgroundReasoningCycle(state, routing);
  assert.equal(started.status, "queued");
  assert.equal(request.background, true);
  assert.equal(request.max_output_tokens, DEFAULT_LONG_REASONING_MAX_OUTPUT_TOKENS);
  assert.equal(request.tools, undefined);
  assert.equal(request.tool_choice, undefined);
  assert.ok(BACKGROUND_REASONING_METHODS.includes("TEST"));
  assert.ok(!BACKGROUND_REASONING_METHODS.includes("DEFINE"));
});

test("accepted TEST cycle survives polling failure, refresh serialization, and delayed completion", async () => {
  const state = initializeProject("A recoverable TEST cycle must not mutate state before completion.");
  const routing = testRoute(state);
  let call = 0;
  const runtime = createRuntime({
    apiKey: "test-key",
    fetchImpl: async () => {
      call += 1;
      if (call === 1) return mockResponse({ id: "resp_reasoning_recovery", status: "queued", model: "gpt-5.6-sol" });
      if (call === 2) throw new TypeError("temporary status connection failure");
      return mockResponse(completedBody(state, routing, "resp_reasoning_recovery"));
    }
  });

  const started = await runtime.startReasoning({ state, routing });
  assert.equal(started.executionStatus, "ACCEPTED_RUNNING");
  assert.equal(started.execution.responseId, "resp_reasoning_recovery");
  assert.equal(state.cycle, 0);
  assert.equal(state.notebook.length, 0);

  const refreshedState = JSON.parse(JSON.stringify(state));
  const refreshedExecution = JSON.parse(JSON.stringify(started.execution));
  const failedCheck = await runtime.pollReasoning({ state: refreshedState, routing, execution: refreshedExecution });
  assert.equal(failedCheck.status, "RETRIEVAL_FAILED");
  assert.equal(failedCheck.executionStatus, "ACCEPTED_RUNNING");
  assert.equal(failedCheck.resumeAvailable, true);
  assert.equal(failedCheck.execution.responseId, "resp_reasoning_recovery");
  assert.equal(refreshedState.cycle, 0);

  const completed = await runtime.pollReasoning({ state: refreshedState, routing, execution: failedCheck.execution });
  assert.equal(completed.status, "COMPLETED");
  assert.equal(completed.state.cycle, 1);
  assert.equal(completed.state.notebook.length, 1);
  assert.equal(completed.state.notebook[0].runtime.responseId, "resp_reasoning_recovery");
  assert.equal(completed.state.notebook[0].runtime.executionKey, started.execution.executionKey);

  const duplicate = await runtime.pollReasoning({ state: completed.state, routing, execution: completed.execution });
  assert.equal(duplicate.status, "ALREADY_INGESTED");
  assert.equal(duplicate.state.cycle, 1);
});

test("safe retry resumes an accepted response instead of starting a duplicate TEST cycle", async () => {
  const state = initializeProject("Retrying an accepted TEST response must be idempotent.");
  const routing = testRoute(state);
  let calls = 0;
  const runtime = createRuntime({
    apiKey: "test-key",
    fetchImpl: async () => {
      calls += 1;
      return mockResponse({ id: "resp_reasoning_idempotent", status: "in_progress", model: "gpt-5.6-sol" });
    }
  });
  const started = await runtime.startReasoning({ state, routing });
  const resumed = await runtime.startReasoning({ state, routing, previousExecution: started.execution });
  assert.equal(resumed.status, "RESUME_AVAILABLE");
  assert.equal(resumed.execution.responseId, "resp_reasoning_idempotent");
  assert.equal(calls, 1);
  assert.equal(state.cycle, 0);
});

test("request-not-accepted and incomplete reasoning never ingest partial cycle state", async () => {
  const state = initializeProject("Incomplete TEST output must remain outside canonical state.");
  const routing = testRoute(state);
  const rejectedRuntime = createRuntime({ apiKey: "test-key", fetchImpl: async () => { throw new TypeError("offline"); } });
  const rejected = await rejectedRuntime.startReasoning({ state, routing });
  assert.equal(rejected.status, "REQUEST_NOT_ACCEPTED");
  assert.equal(rejected.execution.responseId, "");
  assert.equal(rejected.retrySafe, true);
  assert.equal(state.cycle, 0);

  let call = 0;
  const partialMarker = "PARTIAL_REASONING_MUST_NOT_ENTER_STATE";
  const incompleteRuntime = createRuntime({
    apiKey: "test-key",
    fetchImpl: async () => {
      call += 1;
      if (call === 1) return mockResponse({ id: "resp_reasoning_incomplete", status: "queued", model: "gpt-5.6-sol" });
      return mockResponse({
        id: "resp_reasoning_incomplete",
        status: "incomplete",
        model: "gpt-5.6-sol",
        incomplete_details: { reason: "max_output_tokens" },
        max_output_tokens: DEFAULT_LONG_REASONING_MAX_OUTPUT_TOKENS,
        output: [{ type: "message", status: "in_progress", content: [{ type: "output_text", text: partialMarker }] }]
      });
    }
  });
  const started = await incompleteRuntime.startReasoning({ state, routing });
  const incomplete = await incompleteRuntime.pollReasoning({ state, routing, execution: started.execution });
  assert.equal(incomplete.status, "INCOMPLETE");
  assert.equal(incomplete.errorCode, "REASONING_OUTPUT_LIMIT_REACHED");
  assert.equal(incomplete.retrySafe, true);
  assert.equal(incomplete.state, undefined);
  assert.equal(state.cycle, 0);
  assert.doesNotMatch(JSON.stringify(state), new RegExp(partialMarker));
});
