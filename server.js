import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { createHash } from "node:crypto";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  applyCycleOutput,
  applyMethodOverride,
  createDemoCycle,
  createDemoRouting,
  enforceRoutingProgressGuard,
  importProjectBackup,
  initializeProject,
  lockProjectState,
  manageProjectState,
  normalizeProjectState,
  projectProgressSignature,
  validateRoutingForState,
  createProjectReport
} from "./rethink-engine.js";
import { createOpenAIClient, OpenAIRequestError } from "./openai-client.js";
import { METHODS, ValidationError } from "./rethink-schema.js";
import { REASONING_MODULE_REGISTRY } from "./rethink-modules.js";
import { reconcileEvidenceWithNativeCitations } from "./citation-registry.js";
import {
  DEFAULT_DOMAIN_PROFILE_ID,
  DOMAIN_PROFILE_REGISTRY,
  DomainProfileError,
  domainProfileStatusMetadata
} from "./rethink-domain-profiles.js";
import {
  REASONING_INTEGRITY_ANALYSIS_STATUSES,
  REASONING_INTEGRITY_LEDGER_VERSION
} from "./rethink-reasoning-integrity.js";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC_DIR = join(ROOT, "public");

export const BACKGROUND_REASONING_METHODS = Object.freeze([
  "TEST",
  "VALIDATE",
  "STRESS_TEST",
  "ROOT_CAUSE",
  "MEASURE",
  "OIP",
  "CDIL",
  "OAMPES"
]);

function isProduction() {
  return process.env.NODE_ENV === "production";
}

const SECURITY_HEADERS = Object.freeze({
  "Content-Security-Policy": "default-src 'self'; base-uri 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self'",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY"
});

const MIME_TYPES = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon"
});

export function parseEnvironmentFile(contents) {
  const values = {};
  const lines = String(contents || "").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

export function loadEnvironmentFile({ file = join(ROOT, ".env"), environment = process.env } = {}) {
  if (!existsSync(file)) return;
  for (const [key, value] of Object.entries(parseEnvironmentFile(readFileSync(file, "utf8")))) {
    if (environment[key] == null) environment[key] = value;
  }
}

loadEnvironmentFile();

function responseHeaders(overrides = {}) {
  return {
    ...SECURITY_HEADERS,
    ...(isProduction() ? { "Strict-Transport-Security": "max-age=31536000; includeSubDomains" } : {}),
    ...overrides
  };
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    ...responseHeaders(),
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1_000_000) {
      throw new ValidationError("Request body is too large.");
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ValidationError("Request body must be valid JSON.");
  }
}

function getMode(value) {
  if (value == null || value === "demo") return "demo";
  if (value === "live") return "live";
  throw new ValidationError("mode must be either demo or live.");
}

function getForcedMethod(value) {
  if (value == null || value === "") return null;
  if (!METHODS.includes(value)) {
    throw new ValidationError(`forcedMethod must be one of: ${METHODS.join(", ")}.`);
  }
  return value;
}

export function createRuntime({
  apiKey = process.env.OPENAI_API_KEY,
  model = process.env.OPENAI_MODEL || "gpt-5.6-sol",
  reasoningEffort = process.env.OPENAI_REASONING_EFFORT || "medium",
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
  researchMaxAgeMs = Number.parseInt(process.env.RESEARCH_MAX_AGE_MS || "540000", 10),
  researchPollAfterMs = Number.parseInt(process.env.RESEARCH_POLL_AFTER_MS || "2000", 10),
  researchMaxOutputTokens = Number.parseInt(process.env.OPENAI_RESEARCH_MAX_OUTPUT_TOKENS || "32000", 10),
  researchRetryMaxOutputTokens = Number.parseInt(process.env.OPENAI_RESEARCH_RETRY_MAX_OUTPUT_TOKENS || "64000", 10),
  reasoningMaxAgeMs = Number.parseInt(process.env.REASONING_MAX_AGE_MS || "540000", 10),
  reasoningPollAfterMs = Number.parseInt(process.env.REASONING_POLL_AFTER_MS || "2000", 10),
  longReasoningMaxOutputTokens = Number.parseInt(process.env.OPENAI_LONG_REASONING_MAX_OUTPUT_TOKENS || "12000", 10)
} = {}) {
  const safeResearchMaxAgeMs = Number.isFinite(researchMaxAgeMs) && researchMaxAgeMs >= 60_000 ? researchMaxAgeMs : 540_000;
  const safeResearchPollAfterMs = Number.isFinite(researchPollAfterMs) && researchPollAfterMs >= 500 ? researchPollAfterMs : 2_000;
  const safeResearchMaxOutputTokens = Number.isFinite(researchMaxOutputTokens) && researchMaxOutputTokens >= 12_000
    ? Math.min(researchMaxOutputTokens, 64_000)
    : 32_000;
  const safeResearchRetryMaxOutputTokens = Number.isFinite(researchRetryMaxOutputTokens) && researchRetryMaxOutputTokens >= safeResearchMaxOutputTokens
    ? Math.min(researchRetryMaxOutputTokens, 64_000)
    : 64_000;
  const safeReasoningMaxAgeMs = Number.isFinite(reasoningMaxAgeMs) && reasoningMaxAgeMs >= 60_000 ? reasoningMaxAgeMs : 540_000;
  const safeReasoningPollAfterMs = Number.isFinite(reasoningPollAfterMs) && reasoningPollAfterMs >= 500 ? reasoningPollAfterMs : 2_000;
  const safeLongReasoningMaxOutputTokens = Number.isFinite(longReasoningMaxOutputTokens) && longReasoningMaxOutputTokens >= 8_000
    ? Math.min(longReasoningMaxOutputTokens, 32_000)
    : 12_000;
  const openAI = createOpenAIClient({
    apiKey,
    model,
    reasoningEffort,
    fetchImpl,
    researchMaxOutputTokens: safeResearchMaxOutputTokens,
    longReasoningMaxOutputTokens: safeLongReasoningMaxOutputTokens
  });

  function hashValue(value) {
    return createHash("sha256").update(String(value)).digest("hex").slice(0, 24);
  }

  function researchScopeFor(routing, scopeOverride = null) {
    const supplied = scopeOverride && typeof scopeOverride === "object" ? scopeOverride : {};
    return {
      supportingSearch: supplied.supportingSearch || `What credible public evidence supports: ${routing.highestLeverageQuestion}`,
      disconfirmingSearch: supplied.disconfirmingSearch || `What credible evidence suggests this is absent, uncommon, immaterial, already solved, incorrectly framed, or not actionable: ${routing.highestLeverageQuestion}`,
      sourceClassesPlanned: Array.isArray(supplied.sourceClassesPlanned) && supplied.sourceClassesPlanned.length
        ? supplied.sourceClassesPlanned
        : ["PRIMARY_SOURCE", "SECONDARY_SOURCE", "TERTIARY_AGGREGATED_SOURCE"]
    };
  }

  function researchKeyFor(state, routing, researchScope) {
    return hashValue(JSON.stringify({
      projectId: state.id,
      cycle: state.cycle,
      question: routing.highestLeverageQuestion,
      method: routing.selectedMethod,
      stateSignature: projectProgressSignature(state),
      researchScope
    }));
  }

  function reasoningKeyFor(state, routing) {
    return hashValue(JSON.stringify({
      projectId: state.id,
      cycle: state.cycle,
      question: routing.highestLeverageQuestion,
      method: routing.selectedMethod,
      stateSignature: projectProgressSignature(state)
    }));
  }

  function usesBackgroundReasoning(routing) {
    return Boolean(routing)
      && BACKGROUND_REASONING_METHODS.includes(routing.selectedMethod)
      && routing.evidenceGate !== "PUBLIC_RESEARCH_REQUIRED"
      && !routing.requiresExternalResearch;
  }

  function safeTechnicalError(error) {
    return String(error?.message || error || "Unknown public-research execution error.")
      .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
      .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[REDACTED_API_KEY]")
      .replace(/(authorization|api[-_ ]?key)\s*[:=]\s*[^\s,;]+/gi, "$1: [REDACTED]")
      .slice(0, 4000);
  }

  function researchEvidenceOutcome(output) {
    const findings = (output?.newEvidence || []).filter((item) => item.provenanceOrigin === "EXTERNAL_SOURCE"
      && item.intakeType === "PUBLIC_SOURCE_FINDING");
    if (findings.length === 0) return "NO_RELEVANT_EVIDENCE_FOUND";
    const relationships = new Set(findings.map((item) => item.relationship));
    const supports = relationships.has("SUPPORTS");
    const contradicts = relationships.has("CONTRADICTS");
    if (relationships.has("MIXED") || (supports && contradicts)) return "MIXED_EVIDENCE_FOUND";
    if (contradicts) return "DISCONFIRMING_EVIDENCE_FOUND";
    if (supports) return "SUPPORTING_EVIDENCE_FOUND";
    return "NO_CONCLUSIVE_EVIDENCE_FOUND";
  }

  function classifyResearchFailure(error) {
    const underlyingCode = String(error?.code || (error instanceof ValidationError ? "VALIDATION_ERROR" : "RESEARCH_EXECUTION_FAILED"));
    if (["RESEARCH_OUTPUT_LIMIT_REACHED", "OUTPUT_TOKEN_LIMIT_REACHED"].includes(underlyingCode)) {
      return { code: "RESEARCH_OUTPUT_LIMIT_REACHED", stage: "MODEL_OUTPUT_GENERATION", underlyingCode };
    }
    if (["INVALID_MODEL_OUTPUT", "MODEL_OUTPUT_MISSING", "MODEL_REFUSAL"].includes(underlyingCode)) {
      return { code: "RESEARCH_OUTPUT_SCHEMA_FAILED", stage: "STRUCTURED_OUTPUT_VALIDATION", underlyingCode };
    }
    if (["CITATION_VALIDATION_FAILED", "RESEARCH_CITATIONS_MISSING"].includes(underlyingCode)) {
      return { code: "CITATION_VALIDATION_FAILED", stage: "CITATION_POST_PROCESSING", underlyingCode };
    }
    if (underlyingCode === "EVIDENCE_INGESTION_FAILED" || error instanceof ValidationError) {
      return { code: "EVIDENCE_INGESTION_FAILED", stage: "CANONICAL_STATE_INGESTION", underlyingCode };
    }
    return { code: "RESEARCH_API_FAILED", stage: "RESEARCH_API_EXECUTION", underlyingCode };
  }

  function researchFailureSummary(classification) {
    if (classification.code === "RESEARCH_OUTPUT_LIMIT_REACHED") {
      return "Live public research reached its output-token limit before a complete validated result was returned. No partial evidence was ingested.";
    }
    if (classification.code === "RESEARCH_OUTPUT_SCHEMA_FAILED") {
      return "Research execution returned an unusable structured result. No Evidence Items were ingested.";
    }
    if (classification.code === "CITATION_VALIDATION_FAILED") {
      return "Research execution reached citation post-processing, but one or more external Evidence Items could not be mapped to native Responses citation metadata. No Evidence Items were ingested.";
    }
    if (classification.code === "EVIDENCE_INGESTION_FAILED") {
      return "Research and citation processing completed, but canonical project-state ingestion failed. No Evidence Items were ingested.";
    }
    return "The public-research API operation failed technically; no evidentiary conclusion was produced.";
  }

  function recordTechnicalFailure(state, research, error, jobState = "FAILED") {
    const safeError = safeTechnicalError(error);
    const classification = classifyResearchFailure(error);
    const outputLimitReached = classification.code === "RESEARCH_OUTPUT_LIMIT_REACHED";
    const suppliedMetadata = error?.details && typeof error.details === "object" ? error.details : {};
    const responseMetadata = {
      ...suppliedMetadata,
      failureStage: suppliedMetadata.failureStage || classification.stage,
      underlyingCode: classification.underlyingCode
    };
    const failedResearch = {
      ...research,
      responseId: research.responseId || responseMetadata?.responseId || "",
      status: jobState,
      failureCode: classification.code,
      failureMetadata: responseMetadata,
      incompleteResponseMetadata: responseMetadata
    };
    const managed = manageProjectState(state, {
      type: "RECORD_RESEARCH_FAILURE",
      research: failedResearch,
      errorSummary: researchFailureSummary(classification),
      technicalError: safeError,
      errorCode: failedResearch.failureCode,
      responseMetadata,
      jobState: outputLimitReached ? "INCOMPLETE" : jobState
    }, { now: now() });
    const recorded = managed.state.researchHistory.find((item) => item.jobId === failedResearch.jobId)
      || managed.state.researchHistory.at(-1);
    return {
      status: jobState === "HUNG" ? "HUNG" : "FAILED",
      executionStatus: "FAILED_TECHNICALLY",
      evidenceOutcome: "NOT_EVALUATED",
      errorCode: failedResearch.failureCode,
      retrySafe: true,
      research: recorded,
      state: managed.state
    };
  }

  function recordCancellation(state, research) {
    const managed = manageProjectState(state, {
      type: "RECORD_RESEARCH_CANCELLATION",
      research: { ...research, status: "CANCELLED" },
      jobState: "CANCELLED",
      reason: "The background public-research job was cancelled before evidence evaluation."
    }, { now: now() });
    const recorded = managed.state.researchHistory.find((item) => item.jobId === research.jobId)
      || managed.state.researchHistory.at(-1);
    return {
      status: "CANCELLED",
      executionStatus: "CANCELLED",
      evidenceOutcome: "NOT_EVALUATED",
      retrySafe: true,
      research: recorded,
      state: managed.state
    };
  }

  function validateLiveCompletion(response, routing) {
    if (routing.evidenceGate === "PUBLIC_RESEARCH_REQUIRED" && !response.externalUsed) {
      throw new OpenAIRequestError("Public research was required but no web-search call completed, so project state was not changed. Demo Mode remains available.", {
        status: 502,
        code: "PUBLIC_RESEARCH_NOT_COMPLETED"
      });
    }
    if (response.externalUsed && response.citations.length === 0) {
      throw new OpenAIRequestError("Live research completed without native source metadata, so Rethink refused to present it as cited evidence. Demo Mode remains available.", {
        status: 502,
        code: "CITATION_VALIDATION_FAILED",
        details: {
          responseId: response.responseId,
          status: "completed",
          model: response.model,
          failureStage: "CITATION_POST_PROCESSING",
          ingestionMode: "ATOMIC_FAIL_CLOSED",
          nativeCitationCount: 0,
          submittedEvidenceItemCount: response.data.newEvidence.length,
          externalEvidenceItemCount: response.data.newEvidence.filter((item) => item.provenanceOrigin === "EXTERNAL_SOURCE").length,
          mappedExternalItemCount: 0,
          affectedEvidenceItems: response.data.newEvidence
            .map((item, index) => ({ item, index }))
            .filter(({ item }) => item.provenanceOrigin === "EXTERNAL_SOURCE")
            .map(({ item, index }) => ({ index, claim: item.claim.slice(0, 500), submittedSourceUrl: item.sourceUrl.slice(0, 2000), reason: "No native citation metadata was returned." }))
        }
      });
    }
    if (response.externalUsed) {
      const reconciled = reconcileEvidenceWithNativeCitations(response.data, response.citations);
      if (reconciled.report.affectedEvidenceItems.length > 0) {
        throw new OpenAIRequestError(
          `Citation mapping failed for ${reconciled.report.affectedEvidenceItems.length} of ${reconciled.report.externalEvidenceItemCount} external Evidence Items.`,
          {
            status: 502,
            code: "CITATION_VALIDATION_FAILED",
            details: {
              responseId: response.responseId,
              status: "completed",
              model: response.model,
              ...reconciled.report
            }
          }
        );
      }
      response.data = reconciled.output;
      response.citationValidation = reconciled.report;
      if (response.data.reasoning.sourceType === "MODEL_REASONING") response.data.reasoning.sourceType = "MIXED";
    } else {
      response.data.reasoning.sourceType = "MODEL_REASONING";
      response.data.reasoning.limitations = [
        ...response.data.reasoning.limitations,
        "No OpenAI web-search call was used in this cycle; conclusions are model reasoning, not external research."
      ];
      response.data.newEvidence = response.data.newEvidence.map((item) => item.provenanceOrigin === "EXTERNAL_SOURCE"
        ? {
            ...item,
            provenanceOrigin: "MODEL_INFERENCE",
            intakeType: "MODEL_GENERATED_HYPOTHESIS",
            sourceClassification: "UNKNOWN_NOT_APPLICABLE",
            sourceCategory: "UNKNOWN",
            sourceTitle: "",
            sourceUrl: "",
            reliability: "UNKNOWN_NOT_ASSESSED",
            collectionMethod: "UNKNOWN_NOT_REPORTED",
            assessment: `${item.assessment} This was not verified by an external search call.`
          }
        : item);
    }
    return response;
  }

  function completedReasoningFor(state, execution) {
    return (state.notebook || []).find((entry) => entry.entryType === "CYCLE"
      && entry.projectId === state.id
      && ((execution.responseId && entry.runtime?.responseId === execution.responseId)
        || (execution.executionKey && entry.runtime?.executionKey === execution.executionKey)));
  }

  function reasoningFailure(execution, error, {
    requestAccepted = Boolean(execution?.responseId),
    terminal = false
  } = {}) {
    const errorCode = String(error?.code || "REASONING_EXECUTION_FAILED");
    const outputIncomplete = errorCode === "REASONING_OUTPUT_LIMIT_REACHED";
    const status = outputIncomplete ? "INCOMPLETE"
      : (requestAccepted && !terminal ? "RETRIEVAL_FAILED" : (requestAccepted ? "FAILED" : "REQUEST_NOT_ACCEPTED"));
    return {
      status,
      executionStatus: outputIncomplete ? "INCOMPLETE" : (requestAccepted && !terminal ? "ACCEPTED_RUNNING" : status),
      errorCode,
      retrySafe: !requestAccepted || terminal || outputIncomplete,
      resumeAvailable: requestAccepted && !terminal && !outputIncomplete,
      execution: {
        ...execution,
        status,
        executionStatus: outputIncomplete ? "INCOMPLETE" : (requestAccepted && !terminal ? "ACCEPTED_RUNNING" : status),
        lastError: safeTechnicalError(error),
        errorCode,
        failureMetadata: error?.details && typeof error.details === "object" ? error.details : null,
        updatedAt: now().toISOString()
      }
    };
  }

  function completeReasoning(state, routing, execution, completion) {
    const response = validateLiveCompletion(completion, routing);
    const completed = applyCycleOutput(state, routing, response.data, {
      mode: "live",
      model: response.model,
      responseId: response.responseId,
      executionKey: execution.executionKey,
      citations: response.citations
    }, { now: now() });
    return {
      status: "COMPLETED",
      executionStatus: "COMPLETED",
      execution: {
        ...execution,
        responseId: response.responseId || execution.responseId,
        model: response.model,
        status: "COMPLETED",
        executionStatus: "COMPLETED",
        completedAt: now().toISOString(),
        updatedAt: now().toISOString()
      },
      ...completed
    };
  }

  return {
    status() {
      return {
        product: "Rethink Engine",
        version: "0.1.0",
        demoAvailable: true,
        liveAvailable: Boolean(apiKey),
        backgroundResearchAvailable: Boolean(apiKey),
        backgroundReasoningAvailable: Boolean(apiKey),
        backgroundReasoningMethods: [...BACKGROUND_REASONING_METHODS],
        liveModel: model,
        longReasoningMaxOutputTokens: safeLongReasoningMaxOutputTokens,
        researchMaxOutputTokens: safeResearchMaxOutputTokens,
        researchRetryMaxOutputTokens: safeResearchRetryMaxOutputTokens,
        architecture: "Rethink Engine → Rethink Core → Domain Profile → PEC → STM → Evidence → Router → Module → State Update → Notebook → Disposition",
        persistence: "device-local-with-portable-backup",
        reasoningIntegrity: {
          ledgerVersion: REASONING_INTEGRITY_LEDGER_VERSION,
          analysisStatuses: [...REASONING_INTEGRITY_ANALYSIS_STATUSES],
          policy: "claim-specific-explicit-capability-with-advisory-analysis"
        },
        defaultDomainProfile: DEFAULT_DOMAIN_PROFILE_ID,
        domainProfiles: domainProfileStatusMetadata(DOMAIN_PROFILE_REGISTRY),
        modules: REASONING_MODULE_REGISTRY.list().map((module) => ({
          id: module.id,
          name: module.name,
          type: module.type,
          version: module.version
        }))
      };
    },

    initialize(input, { domainProfile, domainProfileVersion } = {}) {
      return initializeProject(input, { now: now(), domainProfile, domainProfileVersion });
    },

    importProject(backup) {
      return importProjectBackup(backup, { now: now() });
    },

    importRuntimeSession(backup, state) {
      const source = backup?.formatVersion === 2 && backup.runtimeSession && typeof backup.runtimeSession === "object"
        ? backup.runtimeSession
        : null;
      if (!source) return null;
      const sameProject = (value) => !value || typeof value !== "object" || !value.projectId || value.projectId === state.id;
      const routing = sameProject(source.routing) ? source.routing || null : null;
      const research = sameProject(source.research) ? source.research || null : null;
      const reasoning = sameProject(source.reasoning) ? source.reasoning || null : null;
      const serialized = JSON.stringify({
        routing,
        result: source.result || null,
        research,
        reasoning,
        report: source.report || null,
        mode: source.mode === "live" ? "live" : "demo"
      });
      const redacted = serialized
        .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
        .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[REDACTED_API_KEY]");
      return JSON.parse(redacted);
    },

    async route({ state, mode: requestedMode, forcedMethod }) {
      state = normalizeProjectState(state);
      const mode = getMode(requestedMode);
      const forced = getForcedMethod(forcedMethod);
      if (mode === "demo") {
        const recommendation = createDemoRouting(state);
        const routing = enforceRoutingProgressGuard(state, applyMethodOverride(recommendation, forced, state), { mode });
        return {
          routing: {
            ...routing,
            runtime: { mode: "demo", model: "deterministic-demo", externalResearchUsed: false }
          }
        };
      }

      const response = await openAI.route(state);
      const routing = enforceRoutingProgressGuard(state, applyMethodOverride(response.data, forced, state), { mode });
      return {
        routing: {
          ...routing,
          runtime: {
            mode: "live",
            model: response.model,
            responseId: response.responseId,
            externalResearchUsed: false
          }
        }
      };
    },

    async cycle({ state, routing, mode: requestedMode }) {
      state = normalizeProjectState(state);
      const mode = getMode(requestedMode);
      if (!routing || !METHODS.includes(routing.selectedMethod)) {
        throw new ValidationError("A routing decision with a valid selectedMethod is required.");
      }
      if (routing.projectId !== state.id) {
        throw new ValidationError("The routing decision belongs to a different project context.");
      }
      if (routing.executionBlocked) {
        throw new ValidationError("This route is paused because no new evidence or state change has occurred. Resolve the evidence gate or use a reasoned human override.");
      }

      if (mode === "demo") {
        const output = createDemoCycle(state, routing);
        return applyCycleOutput(state, routing, output, {
          mode: "demo",
          model: "deterministic-demo",
          citations: []
        }, { now: now() });
      }

      const response = validateLiveCompletion(await openAI.cycle(state, routing), routing);
      return applyCycleOutput(state, routing, response.data, {
        mode: "live",
        model: response.model,
        responseId: response.responseId,
        citations: response.citations
      }, { now: now() });
    },

    async startReasoning({ state, routing, previousExecution = null }) {
      state = normalizeProjectState(state);
      validateRoutingForState(state, routing);
      if (!usesBackgroundReasoning(routing)) {
        throw new ValidationError("This method uses the ordinary reasoning path; background execution is reserved for selected long-running live methods.");
      }
      if (routing.executionBlocked) {
        throw new ValidationError("This route is paused because no new evidence or state change has occurred.");
      }
      const executionKey = reasoningKeyFor(state, routing);
      const existing = previousExecution && typeof previousExecution === "object" ? previousExecution : null;
      if (existing?.executionKey && existing.executionKey !== executionKey) {
        throw new ValidationError("A reasoning retry must use the same unchanged project state and routed question.");
      }
      const alreadyCompleted = completedReasoningFor(state, { ...(existing || {}), executionKey });
      if (alreadyCompleted) {
        return { status: "ALREADY_INGESTED", executionStatus: "COMPLETED", state };
      }
      if (existing?.responseId && ["PENDING", "QUEUED", "IN_PROGRESS", "RETRIEVING", "RETRIEVAL_FAILED", "HUNG"].includes(existing.status)) {
        return {
          status: "RESUME_AVAILABLE",
          executionStatus: "ACCEPTED_RUNNING",
          resumeAvailable: true,
          execution: { ...existing, executionKey }
        };
      }
      const startedAt = now();
      let execution = {
        jobId: existing?.jobId || `reasoning_${hashValue(`${state.id}:${executionKey}:${startedAt.toISOString()}`)}`,
        executionKey,
        projectId: state.id,
        responseId: "",
        status: "PENDING",
        executionStatus: "REQUEST_NOT_ACCEPTED",
        model,
        question: routing.highestLeverageQuestion,
        selectedMethod: routing.selectedMethod,
        stateSignature: projectProgressSignature(state),
        startedAt: startedAt.toISOString(),
        deadlineAt: new Date(startedAt.getTime() + safeReasoningMaxAgeMs).toISOString(),
        pollAfterMs: safeReasoningPollAfterMs,
        retryCount: Number(existing?.retryCount || 0) + (existing ? 1 : 0),
        maxOutputTokens: safeLongReasoningMaxOutputTokens
      };
      let started;
      try {
        started = await openAI.startBackgroundReasoningCycle(state, routing, { maxOutputTokens: safeLongReasoningMaxOutputTokens });
      } catch (error) {
        return reasoningFailure(execution, error, { requestAccepted: false });
      }
      execution = {
        ...execution,
        responseId: started.responseId,
        jobId: `reasoning_${hashValue(`${state.id}:${started.responseId}`)}`,
        status: started.status === "completed" ? "EVALUATING" : started.status.toUpperCase(),
        executionStatus: started.status === "completed" ? "COMPLETED" : "ACCEPTED_RUNNING",
        model: started.model,
        updatedAt: now().toISOString()
      };
      if (started.cancelled) {
        return { status: "CANCELLED", executionStatus: "CANCELLED", retrySafe: true, execution: { ...execution, status: "CANCELLED", executionStatus: "CANCELLED" } };
      }
      if (!started.completion) {
        return { status: execution.status, executionStatus: "ACCEPTED_RUNNING", resumeAvailable: true, execution };
      }
      try {
        return completeReasoning(state, routing, execution, started.completion);
      } catch (error) {
        return reasoningFailure(execution, error, { requestAccepted: true, terminal: true });
      }
    },

    async pollReasoning({ state, routing, execution }) {
      state = normalizeProjectState(state);
      validateRoutingForState(state, routing);
      if (!execution || execution.projectId !== state.id || execution.question !== routing.highestLeverageQuestion) {
        throw new ValidationError("The reasoning execution does not belong to this project and routed question.");
      }
      const ingested = completedReasoningFor(state, execution);
      if (ingested) return { status: "ALREADY_INGESTED", executionStatus: "COMPLETED", state, execution: { ...execution, status: "COMPLETED", executionStatus: "COMPLETED" } };
      if (execution.stateSignature !== projectProgressSignature(state)) {
        throw new ValidationError("Project state changed while reasoning was running. The result was not ingested; start a fresh cycle from current state.");
      }
      if (now().getTime() > new Date(execution.deadlineAt).getTime() && execution.status !== "HUNG") {
        return {
          status: "HUNG",
          executionStatus: "ACCEPTED_RUNNING",
          resumeAvailable: true,
          execution: {
            ...execution,
            status: "HUNG",
            executionStatus: "ACCEPTED_RUNNING",
            lastError: "The configured reasoning deadline elapsed. The accepted response ID remains available for a manual status check while OpenAI retains it.",
            updatedAt: now().toISOString()
          }
        };
      }
      let retrieved;
      try {
        retrieved = await openAI.retrieveBackgroundReasoningCycle(execution.responseId);
      } catch (error) {
        const terminal = error?.code === "REASONING_OUTPUT_LIMIT_REACHED"
          || String(error?.code || "").startsWith("BACKGROUND_RESPONSE_");
        return reasoningFailure(execution, error, { requestAccepted: true, terminal });
      }
      if (retrieved.cancelled) {
        return { status: "CANCELLED", executionStatus: "CANCELLED", retrySafe: true, execution: { ...execution, status: "CANCELLED", executionStatus: "CANCELLED", updatedAt: now().toISOString() } };
      }
      if (!retrieved.completion) {
        const status = retrieved.status.toUpperCase();
        return {
          status,
          executionStatus: "ACCEPTED_RUNNING",
          resumeAvailable: true,
          execution: { ...execution, status, executionStatus: "ACCEPTED_RUNNING", model: retrieved.model, updatedAt: now().toISOString() }
        };
      }
      try {
        return completeReasoning(state, routing, execution, retrieved.completion);
      } catch (error) {
        return reasoningFailure(execution, error, { requestAccepted: true, terminal: true });
      }
    },

    async startResearch({ state, routing, previousResearch = null, scopeOverride = null }) {
      state = normalizeProjectState(state);
      validateRoutingForState(state, routing);
      if (routing.evidenceGate !== "PUBLIC_RESEARCH_REQUIRED" || !routing.requiresExternalResearch) {
        throw new ValidationError("Background public research requires a PUBLIC_RESEARCH_REQUIRED route.");
      }
      const researchScope = researchScopeFor(routing, scopeOverride || previousResearch?.researchScope);
      const researchKey = researchKeyFor(state, routing, researchScope);
      if ((state.researchHistory || []).some((item) => item.researchKey === researchKey && item.executionStatus === "COMPLETED")) {
        return { status: "ALREADY_INGESTED", state };
      }
      if (previousResearch?.researchKey && previousResearch.researchKey !== researchKey) {
        throw new ValidationError("A research retry must use the same unchanged project state and routed question.");
      }
      const startedAt = now();
      const previousHitOutputLimit = ["RESEARCH_OUTPUT_LIMIT_REACHED", "OUTPUT_TOKEN_LIMIT_REACHED"].includes(previousResearch?.failureCode)
        || (previousResearch?.errorLog || []).some((entry) => ["RESEARCH_OUTPUT_LIMIT_REACHED", "OUTPUT_TOKEN_LIMIT_REACHED"].includes(entry.errorCode));
      const previousBudget = Number(previousResearch?.maxOutputTokens || safeResearchMaxOutputTokens);
      const maxOutputTokens = previousHitOutputLimit
        ? Math.min(Math.max(safeResearchMaxOutputTokens, previousBudget * 2), safeResearchRetryMaxOutputTokens)
        : safeResearchMaxOutputTokens;
      const research = {
        jobId: previousResearch?.jobId || `research_${hashValue(`${state.id}:${researchKey}:${startedAt.toISOString()}`)}`,
        researchKey,
        projectId: state.id,
        responseId: "",
        status: "PENDING",
        executionStatus: "PENDING",
        evidenceOutcome: "NOT_EVALUATED",
        model,
        question: routing.highestLeverageQuestion,
        proposition: routing.highestLeverageQuestion,
        selectedMethod: routing.selectedMethod,
        stateSignature: projectProgressSignature(state),
        startedAt: startedAt.toISOString(),
        deadlineAt: new Date(startedAt.getTime() + safeResearchMaxAgeMs).toISOString(),
        pollAfterMs: safeResearchPollAfterMs,
        retryCount: Number(previousResearch?.retryCount || 0) + (previousResearch ? 1 : 0),
        maxOutputTokens,
        previousMaxOutputTokens: previousResearch?.maxOutputTokens || null,
        researchScope,
        errorLog: Array.isArray(previousResearch?.errorLog) ? previousResearch.errorLog : []
      };
      let started;
      try {
        started = await openAI.startBackgroundCycle(state, { ...routing, researchScope }, { maxOutputTokens });
      } catch (error) {
        return recordTechnicalFailure(state, research, error, "FAILED");
      }
      research.responseId = started.responseId;
      research.jobId = `research_${hashValue(`${state.id}:${started.responseId}`)}`;
      research.status = started.status === "completed" ? "EVALUATING" : started.status.toUpperCase();
      research.jobState = research.status;
      research.model = started.model;
      if (started.cancelled) return recordCancellation(state, research);
      if (!started.completion) return { status: research.status, research };
      let response;
      try {
        response = validateLiveCompletion(started.completion, routing);
      } catch (error) {
        return recordTechnicalFailure(state, research, error, "FAILED");
      }
      research.evidenceOutcome = researchEvidenceOutcome(response.data);
      research.sourceClassesSearched = [...new Set(response.data.newEvidence.map((item) => item.sourceClassification))];
      research.sourceCategoriesSearched = [...new Set(response.data.newEvidence.map((item) => item.sourceCategory))];
      let completed;
      try {
        completed = applyCycleOutput(state, routing, response.data, {
          mode: "live",
          model: response.model,
          responseId: response.responseId,
          citations: response.citations,
          research
        }, { now: now() });
      } catch (error) {
        return recordTechnicalFailure(state, research, new OpenAIRequestError(`Evidence ingestion failed: ${error.message}`, {
          code: "EVIDENCE_INGESTION_FAILED",
          cause: error,
          details: {
            responseId: response.responseId,
            status: "completed",
            model: response.model,
            failureStage: "CANONICAL_STATE_INGESTION",
            nativeCitationCount: response.citations.length,
            submittedEvidenceItemCount: response.data.newEvidence.length,
            affectedEvidenceItems: []
          }
        }), "FAILED");
      }
      return { status: "COMPLETED", executionStatus: "COMPLETED", evidenceOutcome: research.evidenceOutcome, research: { ...research, status: "COMPLETED", executionStatus: "COMPLETED", jobState: "COMPLETED" }, ...completed };
    },

    async pollResearch({ state, routing, research }) {
      state = normalizeProjectState(state);
      if (!routing || routing.projectId !== state.id || !METHODS.includes(routing.selectedMethod)) {
        throw new ValidationError("The routing decision does not belong to this project context.");
      }
      if (!research || research.projectId !== state.id || research.question !== routing.highestLeverageQuestion) {
        throw new ValidationError("The research job does not belong to this project and routed question.");
      }
      const ingested = state.researchHistory.find((item) => item.executionStatus === "COMPLETED"
        && (item.responseId === research.responseId || item.researchKey === research.researchKey));
      if (ingested) return { status: "ALREADY_INGESTED", research: ingested, state };
      validateRoutingForState(state, routing);
      if (research.stateSignature !== projectProgressSignature(state)) {
        throw new ValidationError("Project state changed while research was running. The result was not ingested; start a fresh bounded search from current state.");
      }
      if (now().getTime() > new Date(research.deadlineAt).getTime()) {
        return recordTechnicalFailure(state, research, new Error("The configured public-research deadline elapsed before completion."), "HUNG");
      }
      let retrieved;
      try {
        retrieved = await openAI.retrieveBackgroundCycle(research.responseId);
      } catch (error) {
        return recordTechnicalFailure(state, research, error, "FAILED");
      }
      if (retrieved.cancelled) return recordCancellation(state, research);
      if (!retrieved.completion) {
        return { status: retrieved.status.toUpperCase(), executionStatus: "PENDING", evidenceOutcome: "NOT_EVALUATED", research: { ...research, status: retrieved.status.toUpperCase(), executionStatus: "PENDING", evidenceOutcome: "NOT_EVALUATED", jobState: retrieved.status.toUpperCase() } };
      }
      let response;
      try {
        response = validateLiveCompletion(retrieved.completion, routing);
      } catch (error) {
        return recordTechnicalFailure(state, research, error, "FAILED");
      }
      const completedResearch = {
        ...research,
        status: "EVALUATING",
        executionStatus: "COMPLETED",
        evidenceOutcome: researchEvidenceOutcome(response.data),
        jobState: "EVALUATING",
        sourceClassesSearched: [...new Set(response.data.newEvidence.map((item) => item.sourceClassification))],
        sourceCategoriesSearched: [...new Set(response.data.newEvidence.map((item) => item.sourceCategory))]
      };
      let completed;
      try {
        completed = applyCycleOutput(state, routing, response.data, {
          mode: "live",
          model: response.model,
          responseId: response.responseId,
          citations: response.citations,
          research: completedResearch
        }, { now: now() });
      } catch (error) {
        return recordTechnicalFailure(state, completedResearch, new OpenAIRequestError(`Evidence ingestion failed: ${error.message}`, {
          code: "EVIDENCE_INGESTION_FAILED",
          cause: error,
          details: {
            responseId: response.responseId,
            status: "completed",
            model: response.model,
            failureStage: "CANONICAL_STATE_INGESTION",
            nativeCitationCount: response.citations.length,
            submittedEvidenceItemCount: response.data.newEvidence.length,
            affectedEvidenceItems: []
          }
        }), "FAILED");
      }
      return { status: "COMPLETED", executionStatus: "COMPLETED", evidenceOutcome: completedResearch.evidenceOutcome, research: { ...completedResearch, status: "COMPLETED", jobState: "COMPLETED" }, ...completed };
    },

    report({ state }) {
      return { report: createProjectReport(normalizeProjectState(state), { now: now() }) };
    },

    lock({ state, note }) {
      return lockProjectState(state, { note, now: now() });
    },

    manageState({ state, operation }) {
      return manageProjectState(state, operation, { now: now() });
    }
  };
}

function serveStatic(request, response) {
  const url = new URL(request.url, "http://localhost");
  let requestPath = decodeURIComponent(url.pathname);
  if (requestPath === "/") requestPath = "/index.html";
  const relativePath = normalize(requestPath).replace(/^([/\\])+/, "");
  const filePath = resolve(PUBLIC_DIR, relativePath);

  if (!filePath.startsWith(PUBLIC_DIR) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    sendJson(response, 404, { error: { code: "NOT_FOUND", message: "Not found." } });
    return;
  }

  response.writeHead(200, {
    ...responseHeaders(),
    "Content-Type": MIME_TYPES[extname(filePath)] || "application/octet-stream",
    "Cache-Control": "no-cache"
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(filePath).pipe(response);
}

function errorResponse(response, error) {
  if (error instanceof DomainProfileError) {
    sendJson(response, 400, {
      error: { code: error.code, message: error.message, details: error.details }
    });
    return;
  }
  if (error instanceof ValidationError) {
    sendJson(response, 400, {
      error: { code: "VALIDATION_ERROR", message: error.message, details: error.details }
    });
    return;
  }
  if (error instanceof OpenAIRequestError) {
    sendJson(response, error.status || 502, {
      error: { code: error.code, message: error.message, demoAvailable: true }
    });
    return;
  }
  console.error(error);
  sendJson(response, 500, {
    error: { code: "INTERNAL_ERROR", message: "Rethink encountered an unexpected error." }
  });
}

export function createServer(options = {}) {
  const runtime = options.runtime || createRuntime(options);
  return createHttpServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    try {
      if (request.method === "GET" && url.pathname === "/api/status") {
        sendJson(response, 200, runtime.status());
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/health") {
        sendJson(response, 200, { status: "ok", service: "rethink-core", version: "0.1.0", timestamp: new Date().toISOString() });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/modules") {
        sendJson(response, 200, { modules: runtime.status().modules });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/projects") {
        const body = await readJson(request);
        sendJson(response, 201, {
          state: runtime.initialize(body.input, {
            domainProfile: body.domainProfile,
            domainProfileVersion: body.domainProfileVersion
          })
        });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/projects/import") {
        const body = await readJson(request);
        const state = runtime.importProject(body.backup);
        sendJson(response, 200, { state, runtimeSession: runtime.importRuntimeSession?.(body.backup, state) || null });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/rethink/route") {
        const body = await readJson(request);
        sendJson(response, 200, await runtime.route(body));
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/rethink/cycle") {
        const body = await readJson(request);
        sendJson(response, 200, await runtime.cycle(body));
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/rethink/reasoning/start") {
        const body = await readJson(request);
        sendJson(response, 202, await runtime.startReasoning(body));
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/rethink/reasoning/status") {
        const body = await readJson(request);
        sendJson(response, 200, await runtime.pollReasoning(body));
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/rethink/research/start") {
        const body = await readJson(request);
        sendJson(response, 202, await runtime.startResearch(body));
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/rethink/research/status") {
        const body = await readJson(request);
        sendJson(response, 200, await runtime.pollResearch(body));
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/projects/report") {
        const body = await readJson(request);
        sendJson(response, 200, runtime.report(body));
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/rethink/lock") {
        const body = await readJson(request);
        sendJson(response, 200, runtime.lock(body));
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/rethink/state") {
        const body = await readJson(request);
        sendJson(response, 200, runtime.manageState(body));
        return;
      }
      if (request.method === "GET" || request.method === "HEAD") {
        serveStatic(request, response);
        return;
      }
      sendJson(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." } });
    } catch (error) {
      errorResponse(response, error);
    }
  });
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const port = Number.parseInt(process.env.PORT || "3000", 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }
  const host = process.env.HOST || (isProduction() ? "0.0.0.0" : "127.0.0.1");
  const server = createServer();
  server.listen(port, host, () => {
    console.log(`Rethink v0.1 is ready at http://${host}:${port}`);
    console.log(process.env.OPENAI_API_KEY
      ? `Live GPT-5.6 Mode: configured (${process.env.OPENAI_MODEL || "gpt-5.6-sol"})`
      : "Live GPT-5.6 Mode: not configured; deterministic Demo Mode is ready");
  });

  function shutdown(signal) {
    console.log(`${signal} received; stopping Rethink cleanly.`);
    server.close((error) => {
      if (error) {
        console.error(error);
        process.exitCode = 1;
      }
    });
  }

  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
}
