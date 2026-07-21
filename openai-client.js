import {
  CYCLE_OUTPUT_SCHEMA,
  ROUTING_OUTPUT_SCHEMA,
  ValidationError,
  validateCycleOutput,
  validateRoutingOutput
} from "./rethink-schema.js";
import {
  CYCLE_INSTRUCTIONS,
  RESEARCH_CYCLE_INSTRUCTIONS,
  ROUTER_INSTRUCTIONS,
  buildCycleInput,
  buildRoutingInput
} from "./rethink-prompt.js";
import { buildNativeCitationRegistry } from "./citation-registry.js";

export class OpenAIRequestError extends Error {
  constructor(message, { status = 502, code = "OPENAI_REQUEST_FAILED", cause, details = null } = {}) {
    super(message, { cause });
    this.name = "OpenAIRequestError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const DEFAULT_MAX_OUTPUT_TOKENS = 8000;
export const DEFAULT_RESEARCH_MAX_OUTPUT_TOKENS = 32000;
export const DEFAULT_LONG_REASONING_MAX_OUTPUT_TOKENS = 12000;

function extractOutputText(response) {
  for (const item of response.output || []) {
    if (item.type !== "message") continue;
    for (const content of item.content || []) {
      if (content.type === "refusal") {
        throw new OpenAIRequestError(`The model declined this request: ${content.refusal || "No reason provided."}`, {
          code: "MODEL_REFUSAL"
        });
      }
      if (content.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }
  throw new OpenAIRequestError("The OpenAI response did not contain structured output.", {
    code: "MODEL_OUTPUT_MISSING"
  });
}

export function buildResponsesRequest({
  model,
  reasoningEffort,
  instructions,
  input,
  schema,
  schemaName,
  useWebSearch = false,
  background = false,
  maxOutputTokens = DEFAULT_MAX_OUTPUT_TOKENS,
  textVerbosity = "medium"
}) {
  const body = {
    model,
    store: false,
    reasoning: { effort: reasoningEffort },
    input: [
      { role: "developer", content: instructions },
      { role: "user", content: input }
    ],
    text: {
      verbosity: textVerbosity,
      format: {
        type: "json_schema",
        name: schemaName,
        strict: true,
        schema
      }
    },
    max_output_tokens: maxOutputTokens
  };
  if (background) body.background = true;
  if (useWebSearch) {
    body.tools = [{ type: "web_search", search_context_size: "medium" }];
    body.tool_choice = "required";
    body.include = ["web_search_call.action.sources"];
  }
  return body;
}

export function createOpenAIClient({
  apiKey,
  model = "gpt-5.6-sol",
  reasoningEffort = "medium",
  fetchImpl = globalThis.fetch,
  timeoutMs = 60_000,
  backgroundStartTimeoutMs = 15_000,
  backgroundPollTimeoutMs = 15_000,
  researchMaxOutputTokens = DEFAULT_RESEARCH_MAX_OUTPUT_TOKENS,
  longReasoningMaxOutputTokens = DEFAULT_LONG_REASONING_MAX_OUTPUT_TOKENS
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required.");
  }

  function requireApiKey() {
    if (!apiKey) {
      throw new OpenAIRequestError("Live GPT-5.6 Mode is unavailable because OPENAI_API_KEY is not configured. Demo Mode remains available.", {
        status: 503,
        code: "LIVE_MODE_UNAVAILABLE"
      });
    }
  }

  async function fetchOpenAI(url, { method = "GET", body, operationTimeoutMs = timeoutMs } = {}) {
    requireApiKey();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), operationTimeoutMs);
    let response;
    try {
      response = await fetchImpl(url, {
        method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: body == null ? undefined : JSON.stringify(body),
        signal: controller.signal
      });
    } catch (error) {
      const message = error?.name === "AbortError"
        ? "The OpenAI request exceeded its connection timeout. If a background response ID was accepted, the response can still be checked safely."
        : "The live GPT-5.6 request could not reach OpenAI. Demo Mode remains available.";
      throw new OpenAIRequestError(message, { cause: error, code: error?.name === "AbortError" ? "OPENAI_CONNECTION_TIMEOUT" : "OPENAI_NETWORK_ERROR" });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      let detail = "";
      try {
        const errorBody = await response.json();
        detail = errorBody?.error?.message || "";
      } catch {
        detail = "";
      }
      const suffix = detail ? ` ${detail.slice(0, 300)}` : "";
      throw new OpenAIRequestError(`OpenAI returned ${response.status}.${suffix} Demo Mode remains available.`, {
        status: response.status === 401 || response.status === 403 ? 503 : 502,
        code: "OPENAI_API_ERROR"
      });
    }

    return response.json();
  }

  function responseDebugMetadata(responseBody) {
    return {
      responseId: responseBody.id || "",
      status: responseBody.status || "",
      createdAt: responseBody.created_at || null,
      completedAt: responseBody.completed_at || null,
      model: responseBody.model || model,
      incompleteDetails: responseBody.incomplete_details && typeof responseBody.incomplete_details === "object"
        ? { reason: responseBody.incomplete_details.reason || "" }
        : null,
      maxOutputTokens: responseBody.max_output_tokens ?? null,
      usage: responseBody.usage ? {
        inputTokens: responseBody.usage.input_tokens ?? null,
        outputTokens: responseBody.usage.output_tokens ?? null,
        reasoningTokens: responseBody.usage.output_tokens_details?.reasoning_tokens ?? null,
        totalTokens: responseBody.usage.total_tokens ?? null
      } : null,
      outputItems: (responseBody.output || []).map((item) => ({ type: item.type || "unknown", status: item.status || "" })).slice(0, 30)
    };
  }

  function parseCompletedResponse(responseBody, validator, { outputLimitCode = "MODEL_OUTPUT_LIMIT_REACHED" } = {}) {
    const status = responseBody.status || "completed";
    if (status !== "completed") {
      const detail = responseBody.error?.message || responseBody.incomplete_details?.reason || "No completion detail was supplied.";
      const outputLimitReached = status === "incomplete" && responseBody.incomplete_details?.reason === "max_output_tokens";
      throw new OpenAIRequestError(`The background response ended with status ${status}. ${detail}`, {
        code: outputLimitReached ? outputLimitCode : `BACKGROUND_RESPONSE_${status.toUpperCase()}`,
        details: responseDebugMetadata(responseBody)
      });
    }
    let parsed;
    try {
      parsed = JSON.parse(extractOutputText(responseBody));
      validator(parsed);
    } catch (error) {
      if (error instanceof OpenAIRequestError) throw error;
      const causeMessage = error instanceof ValidationError ? error.message : "The response was not valid JSON.";
      throw new OpenAIRequestError(`GPT-5.6 returned invalid structured output. ${causeMessage}`, {
        code: "INVALID_MODEL_OUTPUT",
        cause: error
      });
    }

    return {
      data: parsed,
      citations: buildNativeCitationRegistry(responseBody),
      externalUsed: (responseBody.output || []).some((item) => item.type === "web_search_call"),
      responseId: responseBody.id || "",
      model: responseBody.model || model
    };
  }

  async function request({ instructions, input, schema, schemaName, validator, useWebSearch, maxOutputTokens = DEFAULT_MAX_OUTPUT_TOKENS, textVerbosity = "medium" }) {
    const responseBody = await fetchOpenAI("https://api.openai.com/v1/responses", {
      method: "POST",
      body: buildResponsesRequest({
        model,
        reasoningEffort,
        instructions,
        input,
        schema,
        schemaName,
        useWebSearch,
        maxOutputTokens,
        textVerbosity
      })
    });
    return parseCompletedResponse(responseBody, validator);
  }

  async function startBackgroundResponse(state, routing, {
    instructions,
    useWebSearch,
    maxOutputTokens,
    textVerbosity,
    outputLimitCode
  }) {
    const responseBody = await fetchOpenAI("https://api.openai.com/v1/responses", {
      method: "POST",
      operationTimeoutMs: backgroundStartTimeoutMs,
      body: buildResponsesRequest({
        model,
        reasoningEffort,
        instructions,
        input: buildCycleInput(state, routing),
        schema: CYCLE_OUTPUT_SCHEMA,
        schemaName: "rethink_cycle_result",
        useWebSearch,
        background: true,
        maxOutputTokens,
        textVerbosity
      })
    });
    const status = responseBody.status || "completed";
    const result = {
      responseId: responseBody.id || "",
      status,
      model: responseBody.model || model,
      createdAt: responseBody.created_at || null,
      maxOutputTokens
    };
    if (!result.responseId) {
      throw new OpenAIRequestError("OpenAI accepted no retrievable response ID for the background response.", { code: "BACKGROUND_RESPONSE_ID_MISSING" });
    }
    if (["cancelled", "canceled"].includes(status)) {
      result.cancelled = true;
      return result;
    }
    if (status === "completed") result.completion = parseCompletedResponse(responseBody, validateCycleOutput, { outputLimitCode });
    if (!["queued", "in_progress", "completed"].includes(status)) {
      parseCompletedResponse(responseBody, validateCycleOutput, { outputLimitCode });
    }
    return result;
  }

  async function retrieveBackgroundResponse(responseId, { outputLimitCode }) {
    if (typeof responseId !== "string" || !/^resp_[A-Za-z0-9_-]+$/.test(responseId)) {
      throw new OpenAIRequestError("A valid background response ID is required.", { status: 400, code: "BACKGROUND_RESPONSE_ID_INVALID" });
    }
    const responseBody = await fetchOpenAI(`https://api.openai.com/v1/responses/${encodeURIComponent(responseId)}`, {
      operationTimeoutMs: backgroundPollTimeoutMs
    });
    const status = responseBody.status || "completed";
    if (["queued", "in_progress"].includes(status)) {
      return { responseId, status, model: responseBody.model || model };
    }
    if (["cancelled", "canceled"].includes(status)) {
      return { responseId, status: "cancelled", model: responseBody.model || model, cancelled: true };
    }
    return {
      responseId,
      status,
      model: responseBody.model || model,
      completion: parseCompletedResponse(responseBody, validateCycleOutput, { outputLimitCode })
    };
  }

  async function startBackgroundCycle(state, routing, { maxOutputTokens = researchMaxOutputTokens } = {}) {
    return startBackgroundResponse(state, routing, {
      instructions: RESEARCH_CYCLE_INSTRUCTIONS,
      useWebSearch: true,
      maxOutputTokens,
      textVerbosity: "low",
      outputLimitCode: "RESEARCH_OUTPUT_LIMIT_REACHED"
    });
  }

  async function retrieveBackgroundCycle(responseId) {
    return retrieveBackgroundResponse(responseId, { outputLimitCode: "RESEARCH_OUTPUT_LIMIT_REACHED" });
  }

  async function startBackgroundReasoningCycle(state, routing, { maxOutputTokens = longReasoningMaxOutputTokens } = {}) {
    return startBackgroundResponse(state, routing, {
      instructions: CYCLE_INSTRUCTIONS,
      useWebSearch: false,
      maxOutputTokens,
      textVerbosity: "medium",
      outputLimitCode: "REASONING_OUTPUT_LIMIT_REACHED"
    });
  }

  async function retrieveBackgroundReasoningCycle(responseId) {
    return retrieveBackgroundResponse(responseId, { outputLimitCode: "REASONING_OUTPUT_LIMIT_REACHED" });
  }

  return {
    model,
    async route(state) {
      return request({
        instructions: ROUTER_INSTRUCTIONS,
        input: buildRoutingInput(state),
        schema: ROUTING_OUTPUT_SCHEMA,
        schemaName: "rethink_routing_decision",
        validator: validateRoutingOutput,
        useWebSearch: false
      });
    },
    async cycle(state, routing) {
      const researchCycle = Boolean(routing.requiresExternalResearch);
      return request({
        instructions: researchCycle ? RESEARCH_CYCLE_INSTRUCTIONS : CYCLE_INSTRUCTIONS,
        input: buildCycleInput(state, routing),
        schema: CYCLE_OUTPUT_SCHEMA,
        schemaName: "rethink_cycle_result",
        validator: validateCycleOutput,
        useWebSearch: researchCycle,
        maxOutputTokens: researchCycle ? researchMaxOutputTokens : DEFAULT_MAX_OUTPUT_TOKENS,
        textVerbosity: researchCycle ? "low" : "medium"
      });
    },
    startBackgroundCycle,
    retrieveBackgroundCycle,
    startBackgroundReasoningCycle,
    retrieveBackgroundReasoningCycle
  };
}
