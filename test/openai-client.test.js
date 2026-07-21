import assert from "node:assert/strict";
import test from "node:test";
import {
  createOpenAIClient,
  DEFAULT_MAX_OUTPUT_TOKENS,
  DEFAULT_RESEARCH_MAX_OUTPUT_TOKENS,
  OpenAIRequestError,
  buildResponsesRequest
} from "../openai-client.js";
import { ROUTING_OUTPUT_SCHEMA } from "../rethink-schema.js";
import { createDemoCycle, createDemoRouting, initializeProject } from "../rethink-engine.js";

const state = initializeProject("A proposed platform may solve a costly coordination problem.");

function mockResponse({ status = 200, body }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; }
  };
}

test("Responses request uses GPT-5.6 structured output contract", () => {
  const body = buildResponsesRequest({
    model: "gpt-5.6-sol",
    reasoningEffort: "medium",
    instructions: "Route one question.",
    input: "Project state",
    schema: ROUTING_OUTPUT_SCHEMA,
    schemaName: "rethink_routing_decision"
  });
  assert.equal(body.model, "gpt-5.6-sol");
  assert.deepEqual(body.reasoning, { effort: "medium" });
  assert.equal(body.text.format.type, "json_schema");
  assert.equal(body.text.format.strict, true);
  assert.equal(body.store, false);
  assert.equal(body.tools, undefined);
  assert.equal(body.max_output_tokens, DEFAULT_MAX_OUTPUT_TOKENS);
  assert.equal(body.text.verbosity, "medium");
});

test("web-dependent cycles enable the current Responses web_search tool", () => {
  const body = buildResponsesRequest({
    model: "gpt-5.6-sol",
    reasoningEffort: "medium",
    instructions: "Validate.",
    input: "State",
    schema: ROUTING_OUTPUT_SCHEMA,
    schemaName: "test",
    useWebSearch: true
  });
  assert.deepEqual(body.tools, [{ type: "web_search", search_context_size: "medium" }]);
  assert.equal(body.tool_choice, "required");
  assert.deepEqual(body.include, ["web_search_call.action.sources"]);
});

test("background research requests use retrievable Responses execution", () => {
  const body = buildResponsesRequest({
    model: "gpt-5.6-sol",
    reasoningEffort: "medium",
    instructions: "Research.",
    input: "State",
    schema: ROUTING_OUTPUT_SCHEMA,
    schemaName: "test",
    useWebSearch: true,
    background: true,
    maxOutputTokens: DEFAULT_RESEARCH_MAX_OUTPUT_TOKENS,
    textVerbosity: "low"
  });
  assert.equal(body.background, true);
  assert.equal(body.store, false);
  assert.equal(body.tool_choice, "required");
  assert.equal(body.max_output_tokens, 32000);
  assert.equal(body.text.verbosity, "low");
});

test("live public research uses a dedicated concise 32k output budget", async () => {
  const routing = createDemoRouting(state);
  const calls = [];
  const client = createOpenAIClient({
    apiKey: "test-key",
    fetchImpl: async (_url, options) => {
      calls.push(JSON.parse(options.body));
      return mockResponse({ body: { id: "resp_research_budget", status: "queued", model: "gpt-5.6-sol" } });
    }
  });

  await client.startBackgroundCycle(state, routing);
  assert.equal(calls[0].max_output_tokens, DEFAULT_RESEARCH_MAX_OUTPUT_TOKENS);
  assert.equal(calls[0].text.verbosity, "low");
  assert.match(calls[0].input[0].content, /evidence-acquisition record, not a business report/i);
  assert.match(calls[0].input[0].content, /supporting and disconfirming search/i);
  assert.match(calls[0].input[0].content, /citations/i);
});

test("background research can be polled through delayed completion", async () => {
  const routing = createDemoRouting(state);
  const output = createDemoCycle(state, routing);
  const calls = [];
  const responses = [
    { id: "resp_background_test", status: "queued", model: "gpt-5.6-sol" },
    { id: "resp_background_test", status: "in_progress", model: "gpt-5.6-sol" },
    {
      id: "resp_background_test",
      status: "completed",
      model: "gpt-5.6-sol",
      output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(output), annotations: [] }] }]
    }
  ];
  const client = createOpenAIClient({
    apiKey: "test-key",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return mockResponse({ body: responses.shift() });
    }
  });
  const started = await client.startBackgroundCycle(state, routing);
  assert.equal(started.status, "queued");
  assert.equal(JSON.parse(calls[0].options.body).background, true);
  const running = await client.retrieveBackgroundCycle(started.responseId);
  assert.equal(running.status, "in_progress");
  const completed = await client.retrieveBackgroundCycle(started.responseId);
  assert.equal(completed.status, "completed");
  assert.equal(completed.completion.data.projectId, state.id);
  assert.match(calls[2].url, /\/v1\/responses\/resp_background_test$/);
});

test("background connection timeout fails safely with a retrievable-error message", async () => {
  const routing = createDemoRouting(state);
  const client = createOpenAIClient({
    apiKey: "test-key",
    backgroundStartTimeoutMs: 2,
    fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    })
  });
  await assert.rejects(
    () => client.startBackgroundCycle(state, routing),
    (error) => error.code === "OPENAI_CONNECTION_TIMEOUT" && /background response ID/i.test(error.message)
  );
});

test("incomplete background research caused by max_output_tokens is classified without exposing partial evidence", async () => {
  const routing = createDemoRouting(state);
  const partialEvidence = "PARTIAL_EVIDENCE_MUST_NOT_BE_INGESTED";
  const responses = [
    { id: "resp_output_limit", status: "queued", model: "gpt-5.6-sol" },
    {
      id: "resp_output_limit",
      status: "incomplete",
      model: "gpt-5.6-sol",
      created_at: 1784376000,
      incomplete_details: { reason: "max_output_tokens" },
      max_output_tokens: DEFAULT_RESEARCH_MAX_OUTPUT_TOKENS,
      usage: {
        input_tokens: 9000,
        output_tokens: DEFAULT_RESEARCH_MAX_OUTPUT_TOKENS,
        output_tokens_details: { reasoning_tokens: 12000 },
        total_tokens: 41000
      },
      output: [
        { type: "web_search_call", status: "completed", action: { type: "search", query: "bounded research" } },
        { type: "message", status: "in_progress", content: [{ type: "output_text", text: partialEvidence }] }
      ]
    }
  ];
  const client = createOpenAIClient({
    apiKey: "test-key",
    fetchImpl: async () => mockResponse({ body: responses.shift() })
  });

  const started = await client.startBackgroundCycle(state, routing);
  await assert.rejects(
    () => client.retrieveBackgroundCycle(started.responseId),
    (error) => {
      assert.equal(error.code, "RESEARCH_OUTPUT_LIMIT_REACHED");
      assert.equal(error.details.responseId, "resp_output_limit");
      assert.equal(error.details.status, "incomplete");
      assert.equal(error.details.incompleteDetails.reason, "max_output_tokens");
      assert.equal(error.details.maxOutputTokens, DEFAULT_RESEARCH_MAX_OUTPUT_TOKENS);
      assert.equal(error.details.usage.outputTokens, DEFAULT_RESEARCH_MAX_OUTPUT_TOKENS);
      assert.deepEqual(error.details.outputItems, [
        { type: "web_search_call", status: "completed" },
        { type: "message", status: "in_progress" }
      ]);
      assert.doesNotMatch(JSON.stringify(error.details), new RegExp(partialEvidence));
      return true;
    }
  );
});

test("invalid model JSON is rejected instead of silently entering project state", async () => {
  const client = createOpenAIClient({
    apiKey: "test-key",
    fetchImpl: async () => mockResponse({
      body: {
        id: "resp_test",
        model: "gpt-5.6-sol",
        output: [{ type: "message", content: [{ type: "output_text", text: "{not-json" }] }]
      }
    })
  });
  await assert.rejects(
    () => client.route(state),
    (error) => error instanceof OpenAIRequestError && error.code === "INVALID_MODEL_OUTPUT"
  );
});

test("schema-invalid model output is rejected", async () => {
  const client = createOpenAIClient({
    apiKey: "test-key",
    fetchImpl: async () => mockResponse({
      body: {
        id: "resp_test",
        model: "gpt-5.6-sol",
        output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({
          projectId: state.id,
          highestLeverageQuestion: "What trunk uncertainty matters?",
          selectedMethod: "CHOICE"
        }) }] }]
      }
    })
  });
  await assert.rejects(
    () => client.route(state),
    (error) => error.code === "INVALID_MODEL_OUTPUT" && /selectedMethod/.test(error.message)
  );
});

test("missing API key produces a recoverable live-mode error", async () => {
  const client = createOpenAIClient({ apiKey: "", fetchImpl: async () => { throw new Error("should not run"); } });
  await assert.rejects(
    () => client.route(state),
    (error) => error.code === "LIVE_MODE_UNAVAILABLE" && error.status === 503 && /Demo Mode/.test(error.message)
  );
});

test("OpenAI HTTP errors preserve demo fallback and hide credentials", async () => {
  const client = createOpenAIClient({
    apiKey: "super-secret-key",
    fetchImpl: async () => mockResponse({ status: 429, body: { error: { message: "Rate limit exceeded" } } })
  });
  await assert.rejects(
    () => client.route(state),
    (error) => error.code === "OPENAI_API_ERROR"
      && /Rate limit exceeded/.test(error.message)
      && /Demo Mode/.test(error.message)
      && !error.message.includes("super-secret-key")
  );
});

test("network failure produces a recoverable live-mode error", async () => {
  const client = createOpenAIClient({
    apiKey: "test-key",
    fetchImpl: async () => { throw new TypeError("offline"); }
  });
  await assert.rejects(
    () => client.route(state),
    (error) => error.code === "OPENAI_NETWORK_ERROR" && /Demo Mode/.test(error.message)
  );
});
