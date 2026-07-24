import {
  ASSUMPTION_STATUSES,
  COLLECTION_METHODS,
  CONFIDENCE_ORIGINS,
  DISPOSITIONS,
  EVIDENCE_GATES,
  EVIDENCE_INTAKE_TYPES,
  EVIDENCE_PROVENANCE_ORIGINS,
  EVIDENCE_RELIABILITY,
  EVIDENCE_RELATIONSHIPS,
  HUMAN_DISPOSITIONS,
  METHODS,
  RESEARCH_EVIDENCE_OUTCOMES,
  RESEARCH_EXECUTION_STATUSES,
  SOURCE_CATEGORIES,
  SOURCE_CLASSIFICATIONS,
  ValidationError,
  getPecPhase,
  validateCycleOutput,
  validateProjectState,
  validateRoutingOutput
} from "./rethink-schema.js";
import { getReasoningModule } from "./rethink-modules.js";
import { normalizeCitationUrl } from "./citation-registry.js";
import {
  DEFAULT_DOMAIN_PROFILE_ID,
  createDomainProfileAssignment,
  resolveProjectDomainProfile
} from "./rethink-domain-profiles.js";
import {
  createEmptyClaimLedger,
  normalizeClaimLedger,
  removeClaimEvidenceRelationship as removeClaimEvidenceRelationshipRecord,
  removeRelationshipsForEvidence,
  upsertClaim as upsertClaimRecord,
  upsertClaimEvidenceRelationship as upsertClaimEvidenceRelationshipRecord
} from "./rethink-claims.js";
import {
  MATERIAL_DEPENDENCY_RELATIONSHIPS,
  analyzeClaimIndependentEvidenceChains,
  analyzeIndependentEvidenceChains,
  createEmptyProvenanceLedger,
  normalizeProvenanceLedger,
  removeProvenanceRelationship as removeProvenanceRelationshipRecord,
  upsertProvenanceArtifact as upsertProvenanceArtifactRecord,
  upsertProvenanceRelationship as upsertProvenanceRelationshipRecord
} from "./rethink-provenance.js";
import {
  analyzeClaimTemporalIntegrity,
  analyzeSourceChainTemporalIntegrity,
  analyzeTemporalIntegrity,
  createEmptyTemporalLedger,
  normalizeTemporalLedger,
  removeTemporalAssessment as removeTemporalAssessmentRecord,
  removeTemporalRelationship as removeTemporalRelationshipRecord,
  upsertTemporalAssessment as upsertTemporalAssessmentRecord,
  upsertTemporalRelationship as upsertTemporalRelationshipRecord
} from "./rethink-temporal.js";

const SAMPLE_PATTERN = /florida[\s\S]*disabled veterans|disabled veterans[\s\S]*florida/i;

export const REOPEN_TRIGGERS = Object.freeze([
  "NEW_EVIDENCE",
  "FAILED_ASSUMPTION",
  "INTEGRATION_CONFLICT",
  "BETTER_VERSION",
  "OTHER"
]);

const ACTUAL_EVIDENCE_TYPES = Object.freeze([
  "OBSERVED_EVIDENCE",
  "VERIFIED_FINDING",
  "TEST_RESULT",
  "USER_ASSERTION",
  "ANECDOTAL_EVIDENCE",
  "PUBLIC_SOURCE_FINDING",
  "EXPERT_OPINION",
  "PRIVATE_INTERNAL_DATA",
  "DERIVED_CALCULATION"
]);

const NON_EVIDENCE_TYPES = Object.freeze(["INFERRED_STATEMENT", "ASSUMPTION", "RESEARCH_QUESTION", "PLANNED_TEST", "MODEL_GENERATED_HYPOTHESIS"]);
export const EVIDENCE_AUTHENTICITY = Object.freeze(["INFER_AUTOMATICALLY", "REAL_WORLD", "SYNTHETIC_SIMULATED", "UNKNOWN_NOT_ASSESSED"]);
const PUBLIC_RESEARCH_MAX_ATTEMPTS = 2;

export const HUMAN_GATE_RESOLUTIONS = Object.freeze([
  "PROVIDE_INFORMATION",
  "ADD_EVIDENCE",
  "ENTER_TEST_RESULT",
  "AUTHORIZE_ACTION",
  "MARK_UNAVAILABLE",
  "PROCEED_UNDER_UNCERTAINTY",
  "OVERRIDE_ACTION",
  "FORCE_DISPOSITION"
]);

export const STAGE_OVERRIDE_ACTIONS = Object.freeze([
  "MARK_COMPLETE",
  "PROCEED_UNRESOLVED",
  "BYPASS",
  "REOPEN",
  "RERUN",
  "FORCE_METHOD",
  "REQUEST_FINAL_JUDGMENT"
]);

function timestamp(now) {
  return (now instanceof Date ? now : new Date(now)).toISOString();
}

function makeId(prefix, now = new Date()) {
  const random = Math.random().toString(36).slice(2, 9);
  return `${prefix}_${new Date(now).getTime().toString(36)}_${random}`;
}

function cloneValue(value) {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function lifecycleForDisposition(disposition, current = "ACTIVE") {
  if (disposition === "HOLD") return "HOLD";
  if (["STOP", "KILL"].includes(disposition)) return "STOPPED";
  if (disposition === "ARCHIVE") return "ARCHIVED";
  if (["SHIP", "PUBLISH"].includes(disposition)) return "SHIPPED";
  return current === "ARCHIVED" || current === "STOPPED" ? current : "ACTIVE";
}

function titleFromInput(input) {
  const cleaned = input.replace(/\s+/g, " ").trim();
  return cleaned.length > 58 ? `${cleaned.slice(0, 55).trimEnd()}…` : cleaned;
}

function initialAssumptions(input, now) {
  if (SAMPLE_PATTERN.test(input)) {
    return [
      "Companies have meaningful unmet demand for lower-cost U.S.-based remote labor.",
      "Disabled veterans in Florida represent an available and interested workforce.",
      "A lower labor price can coexist with fair compensation, quality, and sustainable operations."
    ].map((text, index) => ({
      id: makeId(`assumption_${index + 1}`, now),
      text,
      status: "UNTESTED",
      confidence: 0.25,
      confidenceOrigin: "FRAMEWORK_DEFINED",
      rationale: "Implicit in the original proposal; no evidence has been supplied.",
      sourceCycle: 0,
      evidenceIds: [],
      createdAt: timestamp(now),
      updatedAt: timestamp(now)
    }));
  }

  return [
    {
      id: makeId("assumption_1", now),
      text: "The situation described represents a problem worth solving.",
      status: "UNTESTED",
      confidence: 0.3,
      confidenceOrigin: "FRAMEWORK_DEFINED",
      rationale: "Present in the initial framing but not yet supported by evidence.",
      sourceCycle: 0,
      evidenceIds: [],
      createdAt: timestamp(now),
      updatedAt: timestamp(now)
    },
    {
      id: makeId("assumption_2", now),
      text: "The proposed direction addresses the underlying cause rather than a symptom.",
      status: "UNTESTED",
      confidence: 0.2,
      confidenceOrigin: "FRAMEWORK_DEFINED",
      rationale: "The underlying mechanism has not yet been established.",
      sourceCycle: 0,
      evidenceIds: [],
      createdAt: timestamp(now),
      updatedAt: timestamp(now)
    }
  ];
}

export function initializeProject(input, {
  now = new Date(),
  domainProfile = DEFAULT_DOMAIN_PROFILE_ID,
  domainProfileVersion
} = {}) {
  if (typeof input !== "string" || input.trim().length < 8) {
    throw new ValidationError("Describe the messy problem or idea in at least 8 characters.");
  }

  const cleanInput = input.replace(/\s+/g, " ").trim();
  const createdAt = timestamp(now);
  const profileAssignment = createDomainProfileAssignment(domainProfile, { version: domainProfileVersion });
  return {
    id: makeId("project", now),
    contextBoundaryVersion: 2,
    ...profileAssignment,
    title: titleFromInput(cleanInput),
    originalInput: cleanInput,
    problemDefinition: cleanInput,
    lifecycleStatus: "ACTIVE",
    currentDisposition: "CONTINUE",
    pecPhase: getPecPhase("CAPTURE"),
    cycle: 0,
    assumptions: initialAssumptions(cleanInput, now),
    evidence: [],
    claimLedger: createEmptyClaimLedger(),
    provenanceLedger: createEmptyProvenanceLedger(),
    temporalLedger: createEmptyTemporalLedger(),
    lockedDecisions: [],
    tangents: [],
    notebook: [],
    stateEvents: [],
    humanGates: [],
    humanDecisions: [],
    stageOverrides: [],
    questions: [],
    researchHistory: [],
    lineage: { parentProjectId: "", sourceTangentId: "", explicitImports: [] },
    importHistory: [],
    createdAt,
    updatedAt: createdAt
  };
}

export function isActualEvidence(item) {
  return Boolean(item)
    && item.status !== "REMOVED"
    && item.status !== "ROUTED"
    && item.evidenceAuthenticity !== "SYNTHETIC_SIMULATED"
    && ACTUAL_EVIDENCE_TYPES.includes(item.intakeType || "OBSERVED_EVIDENCE");
}

function actualEvidence(state) {
  return (state.evidence || []).filter(isActualEvidence);
}

function publicEvidence(state) {
  return actualEvidence(state).filter((item) => item.provenanceOrigin === "EXTERNAL_SOURCE" || item.intakeType === "PUBLIC_SOURCE_FINDING");
}

function evidenceStateFor(state, method) {
  const evidence = actualEvidence(state);
  const claimLinkedEvidenceIds = new Set((state.claimLedger?.evidenceRelationships || [])
    .filter((item) => item.status === "ACTIVE")
    .map((item) => item.evidenceId));
  const relevant = evidence.filter((item) => {
    if ((item.assumptionIds || []).length > 0 || (item.questionRefs || []).length > 0 || claimLinkedEvidenceIds.has(item.id)) return true;
    return method === "CAPTURE" || method === "DECIDE";
  });
  const usable = relevant.length > 0 ? relevant : evidence;
  const gaps = [];
  if (usable.length === 0) gaps.push("No relevant observed evidence is present in the current project state.");
  if (usable.length > 0 && usable.every((item) => ["UNKNOWN_NOT_ASSESSED", "LOW", "INFER_AUTOMATICALLY"].includes(item.reliability))) {
    gaps.push("Existing evidence is low-reliability and does not satisfy a decision threshold.");
  }
  return {
    relevantEvidenceIds: usable.map((item) => item.id),
    consideredEvidenceCount: usable.length,
    unresolvedEvidenceGaps: gaps,
    summary: usable.length === 0
      ? "No relevant evidence is currently available; stored plans and hypotheses are not counted as observations."
      : `${usable.length} relevant evidence item${usable.length === 1 ? "" : "s"} must be evaluated before requesting more evidence or changing disposition.`
  };
}

function normalizedQuestion(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function completedResearchAttempts(state, question) {
  const normalized = normalizedQuestion(question);
  return (state.researchHistory || []).filter((item) => (item.executionStatus === "COMPLETED" || item.status === "COMPLETED")
    && normalizedQuestion(item.question) === normalized);
}

function researchWaiverFor(state, question) {
  const normalized = normalizedQuestion(question);
  return (state.researchHistory || []).some((item) => normalizedQuestion(item.question) === normalized
    && item.userDecision === "PROCEED_UNDER_UNCERTAINTY"
    && (["FAILED_TECHNICALLY", "CANCELLED"].includes(item.executionStatus)
      || (item.executionStatus === "COMPLETED" && ["NO_CONCLUSIVE_EVIDENCE_FOUND", "NO_RELEVANT_EVIDENCE_FOUND"].includes(item.evidenceOutcome))));
}

export function publicResearchExhausted(state, question) {
  const attempts = completedResearchAttempts(state, question);
  if (attempts.length < PUBLIC_RESEARCH_MAX_ATTEMPTS) return false;
  const latest = attempts.at(-1);
  return ["UNRESOLVED", "INSUFFICIENT_EVIDENCE", "PARTIALLY_SUPPORTED"].includes(latest.propositionStatus);
}

function evidenceGateFor(state, method, question = "") {
  const count = actualEvidence(state).length;
  const publicCount = publicEvidence(state).length;
  const policy = getReasoningModule(method).evidenceGatePolicy;
  if (policy === "PUBLIC_THEN_EXISTING") {
    if (researchWaiverFor(state, question)) return count > 0 ? "USE_EXISTING_EVIDENCE" : "NONE";
    if (publicResearchExhausted(state, question)) return "HUMAN_REAL_WORLD_INPUT_REQUIRED";
    const last = trustedCycleEntries(state).at(-1);
    if (last?.disposition === "PUBLIC_RESEARCH_REQUIRED") return "PUBLIC_RESEARCH_REQUIRED";
    return count === 0 || publicCount === 0 ? "PUBLIC_RESEARCH_REQUIRED" : "USE_EXISTING_EVIDENCE";
  }
  if (policy === "HUMAN_REAL_WORLD") return "HUMAN_REAL_WORLD_INPUT_REQUIRED";
  if (policy === "EVIDENCE_REQUIRED") return count === 0 ? "PUBLIC_RESEARCH_REQUIRED" : "USE_EXISTING_EVIDENCE";
  return count > 0 ? "USE_EXISTING_EVIDENCE" : "NONE";
}

export function projectProgressSignature(state) {
  const assumptions = (state.assumptions || [])
    .filter((item) => !item.removedAt)
    .map((item) => `${item.id}:${item.status}:${Number(item.confidence).toFixed(3)}:${(item.evidenceIds || []).slice().sort().join(",")}`)
    .sort();
  const evidence = (state.evidence || [])
    .filter((item) => item.status !== "REMOVED")
    .map((item) => `${item.id}:${item.status}:${item.intakeType}:${item.updatedAt || item.capturedAt || ""}:${item.reliability || "NONE"}:${item.relationship || "NONE"}`)
    .sort();
  const claims = (state.claimLedger?.claims || [])
    .map((item) => `${item.id}:${item.type}:${item.status}:${item.updatedAt}`)
    .sort();
  const claimEvidenceRelationships = (state.claimLedger?.evidenceRelationships || [])
    .filter((item) => item.status === "ACTIVE")
    .map((item) => `${item.id}:${item.claimId}:${item.evidenceId}:${item.relationship}:${item.updatedAt}`)
    .sort();
  const provenanceArtifacts = (state.provenanceLedger?.artifacts || [])
    .map((item) => `${item.id}:${item.kind}:${item.originRole}:${item.updatedAt}`)
    .sort();
  const provenanceRelationships = (state.provenanceLedger?.relationships || [])
    .filter((item) => item.status === "ACTIVE")
    .map((item) => `${item.id}:${item.subjectType}:${item.subjectId}:${item.objectType}:${item.objectId}:${item.relationship}:${item.updatedAt}`)
    .sort();
  const temporalAssessments = (state.temporalLedger?.assessments || [])
    .filter((item) => item.status === "ACTIVE")
    .map((item) => `${item.id}:${item.targetType}:${item.targetId}:${item.temporalStatus}:${item.statusAsOf}:${item.updatedAt}`)
    .sort();
  const temporalRelationships = (state.temporalLedger?.relationships || [])
    .filter((item) => item.status === "ACTIVE")
    .map((item) => `${item.id}:${item.subjectType}:${item.subjectId}:${item.objectType}:${item.objectId}:${item.relationship}:${item.effectiveAt}:${item.updatedAt}`)
    .sort();
  const locks = (state.lockedDecisions || []).map((item) => `${item.id}:${item.status || "ACTIVE"}`).sort();
  const gates = (state.humanGates || []).map((item) => `${item.id}:${item.status}`).sort();
  const decisions = (state.humanDecisions || []).map((item) => `${item.id}:${item.humanDisposition}`).sort();
  const stages = (state.stageOverrides || []).map((item) => `${item.id}:${item.action}:${item.targetPecPhase}:${item.forcedMethod || ""}`).sort();
  return JSON.stringify({ assumptions, evidence, claims, claimEvidenceRelationships, provenanceArtifacts, provenanceRelationships, temporalAssessments, temporalRelationships, locks, gates, decisions, stages, phase: state.pecPhase?.id, lifecycleStatus: state.lifecycleStatus, currentDisposition: state.currentDisposition });
}

function trustedCycleEntries(state) {
  return (state.notebook || []).filter((entry) =>
    entry.entryType === "CYCLE"
    && entry.projectId === state.id
    && entry.contextStatus !== "LEGACY_UNVERIFIED"
  );
}

function noProgressReasoningLoop(state) {
  const entries = trustedCycleEntries(state);
  const last = entries.at(-1);
  if (!last || !last.stateSignatureAfter) return false;
  if (last.stateSignatureAfter !== projectProgressSignature(state)) return false;
  const gateDisposition = ["PUBLIC_RESEARCH_REQUIRED", "HUMAN_REAL_WORLD_INPUT_REQUIRED", "HUMAN_INPUT_REQUIRED"].includes(last.disposition);
  if (gateDisposition) return true;
  const previous = entries.at(-2);
  if (!previous || previous.stateSignatureAfter !== last.stateSignatureAfter) return false;
  const sameMethod = previous.selectedMethod === last.selectedMethod;
  const sameConclusion = String(previous.reasoningConclusion || "").trim().toLowerCase()
    === String(last.reasoningConclusion || "").trim().toLowerCase();
  const sameDecisionBoundary = previous.disposition === last.disposition
    && JSON.stringify(previous.remainingUncertainty || []) === JSON.stringify(last.remainingUncertainty || []);
  return sameMethod && (sameConclusion || sameDecisionBoundary);
}

function nextRecommendedMethod(state) {
  if (state.cycle === 0) {
    return "DEFINE";
  }

  const last = trustedCycleEntries(state).at(-1);
  if (!last) return "DEFINE";

  if (["PUBLIC_RESEARCH_REQUIRED", "HUMAN_REAL_WORLD_INPUT_REQUIRED", "HUMAN_INPUT_REQUIRED"].includes(last.disposition)) {
    return last.selectedMethod;
  }

  const methodAfter = {
    DEFINE: "VALIDATE",
    VALIDATE: ["VALIDATED", "PROVISIONALLY_SUPPORTED"].includes(last.evidenceEvaluation?.propositionStatus)
      ? "STRESS_TEST"
      : (last.disposition === "PUBLIC_RESEARCH_REQUIRED" ? "VALIDATE" : (actualEvidence(state).length > 0 ? "TEST" : "VALIDATE")),
    STRESS_TEST: "PRIORITIZE",
    ROOT_CAUSE: "VALIDATE",
    MEASURE: "TEST",
    PRIORITIZE: "SIMPLIFY",
    SIMPLIFY: "TEST",
    OPTIMIZE: "TEST",
    OIP: "VALIDATE",
    CDIL: "VALIDATE",
    OAMPES: "VALIDATE",
    TEST: "DECIDE",
    CAPTURE: "DECIDE",
    DECIDE: "DECIDE"
  };
  return methodAfter[last.selectedMethod] || "DEFINE";
}

function questionForMethod(state, method) {
  const sample = SAMPLE_PATTERN.test(state.originalInput);
  if (sample && method === "DEFINE") return "What is the actual problem underneath this proposed workforce solution?";
  if (sample && method === "VALIDATE") return "Is there meaningful unmet demand among companies for this kind of U.S.-based remote work?";
  return getReasoningModule(method).defaultQuestion;
}

function reasonForQuestion(method) {
  return getReasoningModule(method).priorityRationale;
}

function reasonForMethod(method) {
  return getReasoningModule(method).routingRationale;
}

function resolutionForMethod(method) {
  return getReasoningModule(method).resolutionCriteria;
}

function evidenceForMethod(method) {
  const module = getReasoningModule(method);
  return { evidence: module.evidenceRequirements, external: module.publicResearchPossible };
}

function phaseForMethod(method) {
  return getReasoningModule(method).pecPhase;
}

export function createDemoRouting(state) {
  validateProjectState(state);
  const selectedMethod = nextRecommendedMethod(state);
  const requirement = evidenceForMethod(selectedMethod);
  const highestLeverageQuestion = questionForMethod(state, selectedMethod);
  const evidenceGate = evidenceGateFor(state, selectedMethod, highestLeverageQuestion);
  const loopDetected = noProgressReasoningLoop(state);
  return validateRoutingOutput({
    projectId: state.id,
    highestLeverageQuestion,
    selectedMethod,
    whyQuestionNow: reasonForQuestion(selectedMethod),
    whyMethod: reasonForMethod(selectedMethod),
    resolutionCriteria: resolutionForMethod(selectedMethod),
    evidenceNeeded: requirement.evidence,
    requiresExternalResearch: evidenceGate === "PUBLIC_RESEARCH_REQUIRED",
    evidenceGate,
    evidenceState: evidenceStateFor(state, selectedMethod),
    loopDetected,
    executionBlocked: loopDetected && evidenceGate !== "HUMAN_REAL_WORLD_INPUT_REQUIRED",
    recommendedPecPhase: state.cycle === 0 ? "DEFINE" : phaseForMethod(selectedMethod)
  });
}

export function applyMethodOverride(routing, forcedMethod, state = null) {
  validateRoutingOutput(routing);
  if (forcedMethod == null) {
    return { ...routing, recommendedMethod: routing.selectedMethod, override: false };
  }
  if (!METHODS.includes(forcedMethod)) {
    throw new ValidationError(`Unknown reasoning method: ${forcedMethod}`);
  }
  const recommendedMethod = routing.selectedMethod;
  const requirement = evidenceForMethod(forcedMethod);
  const evidenceGate = state ? evidenceGateFor(state, forcedMethod, routing.highestLeverageQuestion) : routing.evidenceGate;
  return {
    ...routing,
    selectedMethod: forcedMethod,
    recommendedMethod,
    override: forcedMethod !== recommendedMethod,
    whyMethod: forcedMethod === recommendedMethod
      ? routing.whyMethod
      : `User override: ${forcedMethod} will run instead of the recommended ${recommendedMethod}. ${reasonForMethod(forcedMethod)}`,
    resolutionCriteria: resolutionForMethod(forcedMethod),
    evidenceNeeded: requirement.evidence,
    requiresExternalResearch: evidenceGate === "PUBLIC_RESEARCH_REQUIRED" || (!state && requirement.external),
    evidenceGate,
    evidenceState: state ? evidenceStateFor(state, forcedMethod) : routing.evidenceState,
    recommendedPecPhase: phaseForMethod(forcedMethod)
  };
}

export function validateRoutingForState(state, routing) {
  validateRoutingOutput(routing);
  if (routing.projectId !== state.id) {
    throw new ValidationError("Routing output belongs to a different project context.");
  }
  const eligibleIds = new Set(actualEvidence(state).map((item) => item.id));
  for (const id of routing.evidenceState.relevantEvidenceIds) {
    if (!eligibleIds.has(id)) throw new ValidationError(`Routing referenced missing or non-evidence item: ${id}.`);
  }
  if (routing.evidenceState.consideredEvidenceCount !== eligibleIds.size) {
    throw new ValidationError(`Routing must account for all ${eligibleIds.size} active evidence items.`);
  }
  if (routing.requiresExternalResearch !== (routing.evidenceGate === "PUBLIC_RESEARCH_REQUIRED")) {
    throw new ValidationError("requiresExternalResearch must match the public-research evidence gate.");
  }
  return routing;
}

export function enforceRoutingProgressGuard(state, routing, { mode = "demo" } = {}) {
  if (routing.evidenceGate === "PUBLIC_RESEARCH_REQUIRED" && researchWaiverFor(state, routing.highestLeverageQuestion)) {
    const evidenceState = evidenceStateFor(state, routing.selectedMethod);
    routing = {
      ...routing,
      evidenceGate: evidenceState.consideredEvidenceCount > 0 ? "USE_EXISTING_EVIDENCE" : "NONE",
      requiresExternalResearch: false,
      evidenceState,
      whyQuestionNow: `${routing.whyQuestionNow} The user explicitly chose to proceed under uncertainty after a technical research failure; that unresolved gap remains recorded.`
    };
  }
  const loopDetected = noProgressReasoningLoop(state);
  const executionBlocked = loopDetected
    && routing.evidenceGate !== "HUMAN_REAL_WORLD_INPUT_REQUIRED"
    && !(mode === "live" && routing.evidenceGate === "PUBLIC_RESEARCH_REQUIRED");
  return validateRoutingForState(state, { ...routing, loopDetected, executionBlocked });
}

function validateCycleForState(state, output) {
  if (output.projectId !== state.id) {
    throw new ValidationError("Cycle output belongs to a different project context.");
  }
  const expected = new Set(actualEvidence(state).map((item) => item.id));
  const seen = new Set();
  for (const item of output.evidenceEvaluation.considered) {
    if (!expected.has(item.evidenceId)) {
      throw new ValidationError(`Cycle evaluated missing or non-evidence item: ${item.evidenceId}.`);
    }
    if (seen.has(item.evidenceId)) throw new ValidationError(`Cycle evaluated evidence more than once: ${item.evidenceId}.`);
    seen.add(item.evidenceId);
  }
  const missing = [...expected].filter((id) => !seen.has(id));
  if (missing.length > 0) {
    throw new ValidationError(`Cycle did not evaluate every active evidence item: ${missing.join(", ")}.`);
  }
  return output;
}

function demoDefinition(state) {
  if (SAMPLE_PATTERN.test(state.originalInput)) {
    return "It is not yet established whether companies have a material unmet need for affordable, reliable U.S.-based remote work, or whether Florida-based disabled veterans are a well-matched workforce for that need.";
  }
  return `The underlying problem and affected party in “${state.originalInput}” have not yet been separated from the proposed response or validated with evidence.`;
}

function demoEvidenceEvaluation(state) {
  const evidence = actualEvidence(state);
  const considered = evidence.map((item) => ({
    evidenceId: item.id,
    classification: ["UNKNOWN_NOT_ASSESSED", "LOW", "INFER_AUTOMATICALLY"].includes(item.reliability) ? "DISCOUNTED" : "MATERIAL",
    relationship: item.relationship || "NEUTRAL_CONTEXT_ONLY",
    rationale: ["UNKNOWN_NOT_ASSESSED", "LOW", "INFER_AUTOMATICALLY"].includes(item.reliability)
      ? `${item.intakeType.replaceAll("_", " ")} is ${item.reliability.toLowerCase()} reliability and cannot independently satisfy the threshold.`
      : `${item.intakeType.replaceAll("_", " ")} is relevant at ${item.reliability.toLowerCase()} reliability.`
  }));
  const usable = evidence.filter((item) => ["MODERATE", "HIGH"].includes(item.reliability));
  const supports = usable.filter((item) => item.relationship === "SUPPORTS");
  const contradicts = usable.filter((item) => item.relationship === "CONTRADICTS");
  const evaluationThresholdMet = usable.length > 0;
  let propositionStatus = "INSUFFICIENT_EVIDENCE";
  if (usable.length > 0 && supports.length === 0 && contradicts.length === 0) propositionStatus = "UNRESOLVED";
  if (supports.length > 0) propositionStatus = supports.length >= 2 ? "PROVISIONALLY_SUPPORTED" : "PARTIALLY_SUPPORTED";
  if (supports.length > 0 && contradicts.length > 0) propositionStatus = "PARTIALLY_SUPPORTED";
  if (contradicts.length > 0 && supports.length === 0) propositionStatus = "CONTRADICTED";
  const latestResearch = (state.researchHistory || []).filter((item) => item.executionStatus === "COMPLETED" || item.status === "COMPLETED").at(-1);
  const disconfirmationSearchStatus = latestResearch?.disconfirmationStatus
    || (contradicts.length > 0 ? "SEARCHED_FOUND" : "NOT_SEARCHED");
  const disconfirmationComplete = ["SEARCHED_FOUND", "SEARCHED_NOT_FOUND", "INCONCLUSIVE", "UNAVAILABLE"].includes(disconfirmationSearchStatus);
  return {
    considered,
    evaluationThresholdMet,
    evaluationThresholdRationale: evidence.length === 0
      ? "No observed evidence exists, so the validation process cannot complete an evidence-grounded evaluation."
      : `${evidence.length} relevant evidence item${evidence.length === 1 ? " was" : "s were"} evaluated; ${usable.length} reached moderate or high reliability. ${evaluationThresholdMet ? "That is enough to complete this bounded evaluation, not to declare the proposition validated." : "That is not enough to complete an evidence-grounded evaluation."}`,
    propositionStatus,
    propositionStatusRationale: propositionStatus === "PROVISIONALLY_SUPPORTED"
      ? "Multiple usable supporting items exist, but disconfirmation, specificity, and population applicability still limit the conclusion."
      : propositionStatus === "PARTIALLY_SUPPORTED"
        ? "Some usable support exists, but it is incomplete, mixed, broad, or limited by contradictory evidence."
        : propositionStatus === "CONTRADICTED"
          ? "Usable contradictory evidence exists without comparable supporting evidence; this does not by itself establish falsification."
          : propositionStatus === "UNRESOLVED"
            ? "Usable context exists but does not resolve the proposition in either direction."
            : "The available evidence is absent or too weak to support validation, contradiction, or falsification.",
    gaps: ["More proposition-specific evidence and a documented disconfirmation search may be required."].filter(() => propositionStatus !== "PROVISIONALLY_SUPPORTED" || !disconfirmationComplete),
    disconfirmation: {
      searchStatus: disconfirmationSearchStatus,
      strongestSupportingEvidence: supports[0]?.claim || "No usable supporting evidence identified.",
      strongestContradictoryEvidence: contradicts[0]?.claim || "No usable contradictory evidence identified.",
      strongestLimitation: evidence.length === 0 ? "No observed evidence is present." : "Specificity, population applicability, and source quality remain limiting considerations.",
      evidenceThatWouldChangeConclusion: "A credible, proposition-specific result from an applicable population that survives a documented attempt to find contradictory or null findings.",
      flag: disconfirmationComplete ? "COMPLETE" : "DISCONFIRMATION_SEARCH_INCOMPLETE"
    }
  };
}

function sampleDemoCycle(state, routing) {
  const method = routing.selectedMethod;
  const problemDefinition = method === "DEFINE" ? demoDefinition(state) : state.problemDefinition;
  const phaseAfter = phaseForMethod(method);
  const common = {
    projectId: state.id,
    reasoning: {
      conclusion: "",
      findings: [],
      evidenceQuality: "NONE",
      limitations: ["Demo Mode is deterministic and does not perform live research."],
      sourceType: "MODEL_REASONING"
    },
    learned: [],
    stateChanges: [],
    assumptionChanges: [],
    newEvidence: [],
    evidenceEvaluation: demoEvidenceEvaluation(state),
    remainingUncertainty: [],
    nextAction: { disposition: "CONTINUE", action: "Run the next Rethink cycle.", why: "The next uncertainty is now clearer." },
    pecPhaseAfter: phaseAfter,
    problemDefinition,
    tangents: []
  };

  if (method === "DEFINE") {
    common.reasoning.conclusion = "The input is a solution hypothesis, not yet a validated problem definition.";
    common.reasoning.findings = [
      "The statement combines a proposed labor model with an assumed employer need.",
      "It assumes a particular workforce is available, interested, and well matched before the work itself is defined.",
      "Price is treated as the primary value driver without evidence about quality, trust, compliance, or coordination costs."
    ];
    common.learned = [
      "The trunk uncertainty is demand and problem existence, not business-model optimization.",
      "The workforce concept is one candidate response, not part of the neutral problem definition."
    ];
    common.stateChanges = [
      "Reframed the original idea as an unvalidated problem-and-solution hypothesis.",
      "Moved PEC from Capture to Assumptions after defining the trunk uncertainty."
    ];
    common.assumptionChanges = state.assumptions.map((assumption) => ({
      assumption: assumption.text,
      status: "CHALLENGED",
      confidence: Math.min(assumption.confidence, 0.25),
      confidenceOrigin: "MODEL_GENERATED",
      rationale: "The assumption is now explicit, but Demo Mode supplied no confirming evidence."
    }));
    common.remainingUncertainty = [
      "Whether employers experience a sufficiently costly unmet remote-work need.",
      "Which work categories, if any, fit the proposed workforce and operating model.",
      "Whether lower price is compatible with fair compensation and sustainable delivery."
    ];
    common.nextAction = {
      disposition: "VALIDATE",
      action: "Validate whether a specific employer segment has a meaningful unmet need for this kind of U.S.-based remote labor.",
      why: "Demand determines whether workforce design, pricing, and operations deserve further work."
    };
  } else if (method === "VALIDATE") {
    common.reasoning.conclusion = "The central proposition remains unvalidated; no real external evidence was used in Demo Mode.";
    common.reasoning.findings = [
      "A plausible story is not evidence of demand.",
      "The proposition needs a named buyer, a current alternative, and an observable cost of the status quo.",
      "Model reasoning cannot substitute for current market evidence or buyer behavior."
    ];
    common.learned = ["The next confidence-changing evidence must come from the world, not another round of internal ideation."];
    common.stateChanges = ["Kept the demand assumption challenged and established a human evidence gate."];
    common.assumptionChanges = state.assumptions.slice(0, 1).map((assumption) => ({
      assumption: assumption.text,
      status: "CHALLENGED",
      confidence: Math.min(assumption.confidence, 0.2),
      confidenceOrigin: "MODEL_GENERATED",
      rationale: "No current source, interview, purchase signal, or behavioral evidence has yet supported the claim."
    }));
    common.remainingUncertainty = [
      "Which buyer segment experiences the problem most acutely.",
      "Whether observed demand is strong enough to change behavior or spending.",
      "Whether the value proposition survives wage, compliance, quality, and coordination constraints."
    ];
    common.nextAction = {
      disposition: "PUBLIC_RESEARCH_REQUIRED",
      action: "Use authorized public research to map existing services, market alternatives, and current demand signals before requesting interviews.",
      why: "Public sources can reduce this market uncertainty before private buyer research becomes necessary."
    };
  } else if (method === "STRESS_TEST") {
    common.reasoning.conclusion = "The direction breaks if cost savings depend on wage compression, if work quality is hard to verify, or if coordination and compliance erase the price advantage.";
    common.reasoning.findings = [
      "Adverse selection can concentrate unusually difficult work while buyers expect commodity pricing.",
      "Accessibility, benefits, classification, data security, and state-specific requirements can become binding constraints.",
      "A mission-driven workforce story can create reputational risk if worker agency and compensation are not explicit."
    ];
    common.learned = ["The model needs a fair-work constraint and a unit-economics threshold before it earns optimization."];
    common.stateChanges = ["Added explicit break conditions to the project state."];
    common.remainingUncertainty = ["Which failure condition is most likely for the first target work category."];
    common.nextAction = {
      disposition: "ITERATE",
      action: "Define non-negotiable worker, quality, and compliance constraints before designing the MVP.",
      why: "Those constraints determine whether the concept is viable rather than merely cheap."
    };
  } else if (method === "SIMPLIFY") {
    common.reasoning.conclusion = "The project can be reduced to one buyer segment, one work category, one demand signal, and one workforce-fit check.";
    common.reasoning.findings = [
      "A marketplace, staffing platform, and broad geographic rollout are premature structures.",
      "A concierge test can preserve the learning objective without product infrastructure."
    ];
    common.learned = ["The smallest useful project is an evidence test, not a platform build."];
    common.stateChanges = ["Deferred marketplace, automation, and scaling features until demand and fit are supported."];
    common.remainingUncertainty = ["Which single work category creates the cleanest discriminating test."];
    common.nextAction = {
      disposition: "TEST",
      action: "Run a manual concierge test for one work category with explicit success and stop thresholds.",
      why: "It produces decision evidence without adding unsupported structure."
    };
  } else if (method === "TEST") {
    common.reasoning.conclusion = "The smallest discriminating test requires real participants, authorization, and a predeclared threshold.";
    common.reasoning.findings = [
      "A test should measure behavior, not stated enthusiasm alone.",
      "The pass threshold should cover buyer commitment, worker fit, quality, and sustainable economics."
    ];
    common.learned = ["The next cycle must leave model-only reasoning and enter controlled real-world observation."];
    common.stateChanges = ["Defined a real-world test as the active project boundary."];
    common.remainingUncertainty = ["Test owner, participants, acceptable risk, and pass/fail threshold require human authorization."];
    common.nextAction = {
      disposition: "HUMAN_REAL_WORLD_INPUT_REQUIRED",
      action: "Authorize and run the bounded test, then return the observed results to Rethink.",
      why: "The AI cannot recruit participants, authorize commitments, or invent real-world outcomes."
    };
  } else {
    common.reasoning.conclusion = `${method} clarified the selected uncertainty without establishing evidence beyond model reasoning.`;
    common.reasoning.findings = [reasonForMethod(method), `Resolution requires: ${resolutionForMethod(method)}`];
    common.learned = [`The project now has a bounded ${method} question and a clearer evidence requirement.`];
    common.stateChanges = [`Recorded the ${method} result and updated the active PEC phase.`];
    common.remainingUncertainty = [routing.highestLeverageQuestion];
    common.nextAction = method === "DECIDE"
      ? {
          disposition: "HUMAN_REAL_WORLD_INPUT_REQUIRED",
          action: "Choose whether to continue, pivot, archive, kill, or ship against the stated decision threshold.",
          why: "The final commitment depends on human authorization and risk preference."
        }
      : {
          disposition: "CONTINUE",
          action: "Run the next recommended Rethink cycle.",
          why: "The selected method reduced the uncertainty but did not close the project decision."
        };
  }

  if (routing.evidenceGate === "HUMAN_REAL_WORLD_INPUT_REQUIRED") {
    common.nextAction = {
      disposition: "HUMAN_REAL_WORLD_INPUT_REQUIRED",
      action: "Provide the precise private, behavioral, or real-world evidence that repeated bounded public research could not establish.",
      why: "The public research budget for this narrow uncertainty is exhausted; another equivalent search is unlikely to change the decision."
    };
  }
  return validateCycleOutput(common);
}

function genericDemoCycle(state, routing) {
  const method = routing.selectedMethod;
  const evaluation = demoEvidenceEvaluation(state);
  const evidenceCount = evaluation.considered.length;
  const problemDefinition = method === "DEFINE" ? demoDefinition(state) : state.problemDefinition;
  const common = {
    projectId: state.id,
    reasoning: {
      conclusion: `${method} bounded the selected uncertainty using only this project's structured state.`,
      findings: [reasonForMethod(method), `Resolution requires: ${resolutionForMethod(method)}`],
      evidenceQuality: evidenceCount === 0 ? "NONE" : (evaluation.evaluationThresholdMet ? "MODERATE" : "WEAK"),
      limitations: ["Demo Mode is deterministic and does not acquire public evidence."],
      sourceType: "MODEL_REASONING"
    },
    learned: [`The project now has a bounded ${method} question and an explicit evidence requirement.`],
    stateChanges: [`Recorded the ${method} result without importing concepts from any other project.`],
    assumptionChanges: [],
    newEvidence: [],
    evidenceEvaluation: evaluation,
    remainingUncertainty: [routing.highestLeverageQuestion],
    nextAction: { disposition: "CONTINUE", action: "Run the next recommended Rethink cycle.", why: "The selected uncertainty is narrower." },
    pecPhaseAfter: phaseForMethod(method),
    problemDefinition,
    tangents: []
  };

  if (method === "DEFINE") {
    common.reasoning.conclusion = "The original framing remains a hypothesis until the underlying problem, affected party, and proposed response are separated.";
    common.reasoning.findings = [
      `The active project is defined only by: ${state.originalInput}`,
      "The current direction must not be treated as proof that the underlying problem exists.",
      "No terms, assumptions, evidence, or conclusions from another project were used."
    ];
    common.learned = ["The trunk problem and proposed response must be evaluated separately."];
    common.assumptionChanges = state.assumptions.filter((item) => !item.removedAt).map((assumption) => ({
      assumption: assumption.text,
      status: "CHALLENGED",
      confidence: Math.min(Number(assumption.confidence), 0.3),
      confidenceOrigin: "MODEL_GENERATED",
      rationale: evidenceCount === 0
        ? "This project contains no relevant observed evidence supporting the assumption."
        : `${evidenceCount} evidence item${evidenceCount === 1 ? " exists" : "s exist"}, but the assumption has not yet met a declared validation threshold.`
    }));
    common.stateChanges = ["Separated the project framing from claims that still require evidence."];
    common.nextAction = {
      disposition: "VALIDATE",
      action: "Validate the central assumption using existing evidence first, then authorized public research if gaps remain.",
      why: "The trunk assumption controls whether downstream design deserves investment."
    };
  } else if (method === "VALIDATE") {
    if (["VALIDATED", "PROVISIONALLY_SUPPORTED"].includes(evaluation.propositionStatus)) {
      common.reasoning.conclusion = `${evidenceCount} relevant evidence items were evaluated. The evaluation process completed, and the proposition is ${evaluation.propositionStatus.toLowerCase().replaceAll("_", " ")}; it is not promoted to fact.`;
      common.learned = ["Existing project evidence provides bounded support, subject to specificity, applicability, and disconfirmation limits."];
      common.nextAction = {
        disposition: "STRESS_TEST",
        action: "Stress-test the supported direction against concrete failure conditions.",
        why: "The trunk has provisional support, so break conditions now have higher leverage."
      };
    } else {
      common.reasoning.conclusion = evidenceCount === 0
        ? "The central proposition remains unvalidated because zero relevant evidence items exist in structured project state."
        : `${evidenceCount} relevant evidence item${evidenceCount === 1 ? " exists" : "s exist"}, but ${evidenceCount === 1 ? "it does" : "they do"} not satisfy the validation threshold.`;
      common.reasoning.findings = [evaluation.evaluationThresholdRationale, evaluation.propositionStatusRationale, ...evaluation.gaps];
      common.learned = ["Available project evidence was evaluated before requesting additional evidence."];
      common.nextAction = {
        disposition: "PUBLIC_RESEARCH_REQUIRED",
        action: "Acquire bounded public evidence from authoritative sources, preserve citations, and rerun STM.",
        why: "The remaining gap is publicly researchable and should be reduced before requiring interviews or private data."
      };
    }
  } else if (method === "TEST") {
    common.reasoning.conclusion = "The remaining uncertainty requires an observed test result, not another model-only conclusion.";
    common.nextAction = {
      disposition: "HUMAN_REAL_WORLD_INPUT_REQUIRED",
      action: "Run or authorize the bounded real-world test and return the observed result as classified evidence.",
      why: "The system cannot fabricate participation, behavior, commitments, private data, or physical observations."
    };
  } else if (method === "DECIDE") {
    if (!["VALIDATED", "PROVISIONALLY_SUPPORTED"].includes(evaluation.propositionStatus)) {
      common.reasoning.conclusion = evaluation.propositionStatusRationale;
      common.nextAction = {
        disposition: evidenceCount === 0 ? "PUBLIC_RESEARCH_REQUIRED" : "HUMAN_REAL_WORLD_INPUT_REQUIRED",
        action: evidenceCount === 0
          ? "Acquire relevant public evidence before making an evidence-grounded disposition."
          : "Request final human judgment or the missing real-world evidence; do not claim the threshold is met.",
        why: "A decision cannot be grounded in evidence that is absent or below threshold."
      };
    } else {
      common.reasoning.conclusion = "The evidence threshold is satisfied for the stated decision scope; final disposition remains a human judgment.";
      common.nextAction = {
        disposition: "CONTINUE",
        action: "Request final human judgment with remaining uncertainty and reopening conditions preserved.",
        why: "Rethink advises from evidence; the human retains commitment authority."
      };
    }
  }

  if (routing.evidenceGate === "HUMAN_REAL_WORLD_INPUT_REQUIRED") {
    common.nextAction = {
      disposition: "HUMAN_REAL_WORLD_INPUT_REQUIRED",
      action: "Provide the precise private, behavioral, or real-world evidence that repeated bounded public research could not establish.",
      why: "The public research budget for this narrow uncertainty is exhausted; another equivalent search is unlikely to change the decision."
    };
  }
  return validateCycleOutput(common);
}

export function createDemoCycle(state, routing) {
  validateProjectState(state);
  if (!routing || !METHODS.includes(routing.selectedMethod)) {
    throw new ValidationError("A valid routing decision is required before running a cycle.");
  }
  if (routing.projectId !== state.id) {
    throw new ValidationError("Routing projectId does not match the active project context.");
  }
  if (routing.executionBlocked) {
    throw new ValidationError("This reasoning route is blocked until new evidence, a human resolution, or an explicit override changes project state.");
  }
  return SAMPLE_PATTERN.test(state.originalInput)
    ? sampleDemoCycle(state, routing)
    : genericDemoCycle(state, routing);
}

export function normalizeProjectState(state) {
  validateProjectState(state);
  const normalized = cloneValue(state);
  const resolvedProfile = resolveProjectDomainProfile(normalized);
  normalized.domainProfile = resolvedProfile.id;
  normalized.domainProfileVersion = resolvedProfile.version;
  normalized.contextBoundaryVersion = 2;
  normalized.lifecycleStatus = normalized.lifecycleStatus || "ACTIVE";
  normalized.currentDisposition = normalized.currentDisposition || trustedCycleEntries(normalized).at(-1)?.disposition || "CONTINUE";
  normalized.stateEvents = Array.isArray(normalized.stateEvents) ? normalized.stateEvents : [];
  normalized.humanGates = (Array.isArray(normalized.humanGates) ? normalized.humanGates : []).map((gate) => ({
    ...gate,
    evidenceIds: Array.isArray(gate.evidenceIds) ? [...new Set(gate.evidenceIds)] : []
  }));
  normalized.humanDecisions = Array.isArray(normalized.humanDecisions) ? normalized.humanDecisions : [];
  normalized.stageOverrides = Array.isArray(normalized.stageOverrides) ? normalized.stageOverrides : [];
  normalized.researchHistory = (Array.isArray(normalized.researchHistory) ? normalized.researchHistory : []).map((item) => {
    const legacyStatus = String(item.status || "").toUpperCase();
    const executionStatus = RESEARCH_EXECUTION_STATUSES.includes(item.executionStatus)
      ? item.executionStatus
      : (legacyStatus === "COMPLETED"
          ? "COMPLETED"
          : (legacyStatus === "CANCELLED" ? "CANCELLED" : (["FAILED", "HUNG", "FAILED_TECHNICALLY"].includes(legacyStatus) ? "FAILED_TECHNICALLY" : "PENDING")));
    return {
      ...item,
      executionStatus,
      evidenceOutcome: RESEARCH_EVIDENCE_OUTCOMES.includes(item.evidenceOutcome)
        ? item.evidenceOutcome
        : (executionStatus === "COMPLETED" ? "NO_CONCLUSIVE_EVIDENCE_FOUND" : "NOT_EVALUATED"),
      jobState: item.jobState || legacyStatus || executionStatus,
      errorLog: Array.isArray(item.errorLog) ? item.errorLog : [],
      retryCount: Number.isFinite(Number(item.retryCount)) ? Number(item.retryCount) : 0
    };
  });
  normalized.lineage = normalized.lineage && typeof normalized.lineage === "object"
    ? {
        parentProjectId: normalized.lineage.parentProjectId || "",
        sourceTangentId: normalized.lineage.sourceTangentId || "",
        explicitImports: Array.isArray(normalized.lineage.explicitImports) ? normalized.lineage.explicitImports : []
      }
    : { parentProjectId: "", sourceTangentId: "", explicitImports: [] };
  normalized.importHistory = Array.isArray(normalized.importHistory) ? normalized.importHistory : [];
  normalized.notebook = normalized.notebook.map((entry) => entry.projectId
    ? entry
    : { ...entry, contextStatus: "LEGACY_UNVERIFIED" });
  normalized.assumptions = normalized.assumptions.map((assumption) => ({
    ...assumption,
    confidenceOrigin: CONFIDENCE_ORIGINS.includes(assumption.confidenceOrigin) ? assumption.confidenceOrigin : "LEGACY_UNSPECIFIED",
    evidenceIds: Array.isArray(assumption.evidenceIds) ? [...new Set(assumption.evidenceIds)] : [],
    createdAt: assumption.createdAt || state.createdAt || state.updatedAt,
    updatedAt: assumption.updatedAt || state.updatedAt,
    removedAt: assumption.removedAt || "",
    removedReason: assumption.removedReason || ""
  }));
  normalized.evidence = normalized.evidence.map((evidence) => {
    const provenanceOrigin = evidence.provenanceOrigin || evidence.sourceType || "USER_INPUT";
    const legacyIntake = evidence.intakeType === "EVIDENCE" ? "OBSERVED_EVIDENCE"
      : evidence.intakeType === "ANECDOTAL_OBSERVATION" ? "ANECDOTAL_EVIDENCE"
        : evidence.intakeType;
    const intakeType = legacyIntake || inferEvidenceIntakeType(evidence.claim, provenanceOrigin);
    const actual = ACTUAL_EVIDENCE_TYPES.includes(intakeType);
    const status = evidence.status === "REMOVED" ? "REMOVED" : (actual ? "ACTIVE" : "ROUTED");
    const evidenceAuthenticity = inferEvidenceAuthenticity(evidence, provenanceOrigin);
    const legacyReliability = evidence.reliability === "NONE" ? "UNKNOWN_NOT_ASSESSED" : evidence.reliability;
    const legacyRelationship = evidence.relationship === "NONE" ? "NONE_UNLINKED" : evidence.relationship;
    const sourceClassification = SOURCE_CLASSIFICATIONS.includes(evidence.sourceClassification) ? evidence.sourceClassification : "UNKNOWN_NOT_APPLICABLE";
    const sourceCategory = SOURCE_CATEGORIES.includes(evidence.sourceCategory) ? evidence.sourceCategory : "UNKNOWN";
    const collectionMethod = COLLECTION_METHODS.includes(evidence.collectionMethod) ? evidence.collectionMethod : "UNKNOWN_NOT_REPORTED";
    return {
      ...evidence,
      provenanceOrigin,
      intakeType,
      evidenceAuthenticity,
      authenticityBasis: evidence.authenticityBasis || (evidence.evidenceAuthenticity && evidence.evidenceAuthenticity !== "INFER_AUTOMATICALLY" ? "USER_OR_SOURCE_DEFINED" : "SYSTEM_INFERRED"),
      sourceClassification,
      sourceCategory,
      reliability: EVIDENCE_RELIABILITY.includes(legacyReliability) ? legacyReliability : defaultEvidenceReliability(provenanceOrigin, intakeType, sourceClassification),
      reliabilityBasis: evidence.reliabilityBasis || (evidence.reliability ? "LEGACY_OR_USER_DEFINED" : "SYSTEM_INFERRED"),
      relationship: EVIDENCE_RELATIONSHIPS.includes(legacyRelationship) ? legacyRelationship : "NEUTRAL_CONTEXT_ONLY",
      relationshipBasis: evidence.relationshipBasis || (evidence.relationship ? "LEGACY_OR_USER_DEFINED" : "SYSTEM_INFERRED"),
      sourceDate: evidence.sourceDate || "",
      population: evidence.population || "",
      collectionMethod,
      methodDetails: evidence.methodDetails || evidence.method || "",
      observation: evidence.observation || evidence.claim || "",
      status,
      assumptionIds: Array.isArray(evidence.assumptionIds) ? [...new Set(evidence.assumptionIds)] : [],
      questionRefs: Array.isArray(evidence.questionRefs) ? [...new Set(evidence.questionRefs)] : [],
      createdAt: evidence.createdAt || evidence.capturedAt || state.createdAt || state.updatedAt,
      updatedAt: evidence.updatedAt || evidence.capturedAt || state.updatedAt,
      removedAt: evidence.removedAt || "",
      removedReason: evidence.removedReason || ""
    };
  });
  normalized.claimLedger = normalizeClaimLedger(normalized.claimLedger, {
    evidenceIds: normalized.evidence.map((item) => item.id),
    linkableEvidenceIds: normalized.evidence
      .filter((item) => item.status === "ACTIVE" && ACTUAL_EVIDENCE_TYPES.includes(item.intakeType))
      .map((item) => item.id)
  });
  normalized.provenanceLedger = normalizeProvenanceLedger(normalized.provenanceLedger, {
    evidenceIds: normalized.evidence.map((item) => item.id)
  });
  normalized.temporalLedger = normalizeTemporalLedger(normalized.temporalLedger, {
    evidenceIds: normalized.evidence.map((item) => item.id),
    artifactIds: normalized.provenanceLedger.artifacts.map((item) => item.id)
  });
  const existingQuestions = Array.isArray(normalized.questions) ? normalized.questions : [];
  const questionTexts = [
    ...existingQuestions.map((item) => item.text),
    ...normalized.notebook.filter((entry) => entry.entryType === "CYCLE" && entry.projectId === normalized.id).map((entry) => entry.highestLeverageQuestion),
    ...normalized.evidence.flatMap((item) => item.questionRefs || [])
  ].filter(Boolean);
  const questionMap = new Map(existingQuestions.map((item) => [normalizedQuestion(item.text), item]));
  for (const text of questionTexts) {
    const key = normalizedQuestion(text);
    if (!questionMap.has(key)) {
      questionMap.set(key, {
        id: `question_${normalized.id}_${questionMap.size + 1}`,
        projectId: normalized.id,
        text,
        status: "RESOLVED",
        sourceCycle: normalized.notebook.find((entry) => entry.highestLeverageQuestion === text)?.cycle ?? 0,
        createdAt: normalized.createdAt || normalized.updatedAt,
        updatedAt: normalized.updatedAt,
        reopenedAt: "",
        supersededBy: ""
      });
    }
  }
  normalized.questions = [...questionMap.values()];
  const linkableEvidenceIds = new Set(normalized.evidence
    .filter((item) => item.status === "ACTIVE" && ACTUAL_EVIDENCE_TYPES.includes(item.intakeType))
    .map((item) => item.id));
  normalized.assumptions = normalized.assumptions.map((assumption) => ({
    ...assumption,
    evidenceIds: assumption.evidenceIds.filter((id) => linkableEvidenceIds.has(id))
  }));
  normalized.lockedDecisions = normalized.lockedDecisions.map((lock) => ({
    ...lock,
    status: lock.status || "ACTIVE",
    evidence: Array.isArray(lock.evidence) ? lock.evidence : [],
    reopeningTrigger: lock.reopeningTrigger || "",
    reopeningReason: lock.reopeningReason || "",
    reopenedAt: lock.reopenedAt || ""
  }));
  return normalized;
}

export function createProjectBackup(state, { now = new Date() } = {}) {
  const normalized = normalizeProjectState(state);
  return {
    format: "rethink.project.backup",
    formatVersion: 1,
    exportedAt: timestamp(now),
    projectId: normalized.id,
    project: cloneValue(normalized)
  };
}

export function createNotebookExport(state, { now = new Date() } = {}) {
  const normalized = normalizeProjectState(state);
  return {
    format: "rethink.lab-notebook",
    formatVersion: 1,
    exportedAt: timestamp(now),
    projectId: normalized.id,
    domainProfile: normalized.domainProfile,
    domainProfileVersion: normalized.domainProfileVersion,
    projectTitle: normalized.title,
    originalInput: normalized.originalInput,
    currentPecPhase: normalized.pecPhase,
    currentDisposition: normalized.currentDisposition,
    notebook: cloneValue(normalized.notebook),
    stateEvents: cloneValue(normalized.stateEvents),
    evidence: cloneValue(normalized.evidence),
    assumptions: cloneValue(normalized.assumptions),
    claimLedger: cloneValue(normalized.claimLedger),
    provenanceLedger: cloneValue(normalized.provenanceLedger),
    temporalLedger: cloneValue(normalized.temporalLedger),
    lockedVersions: cloneValue(normalized.lockedDecisions)
  };
}

export function importProjectBackup(backup, { now = new Date() } = {}) {
  if (!backup || typeof backup !== "object" || Array.isArray(backup)) {
    throw new ValidationError("Project import must be a Rethink JSON object.");
  }
  let candidate = backup;
  let sourceExportedAt = "";
  if (backup.format) {
    if (backup.format !== "rethink.project.backup" || ![1, 2].includes(backup.formatVersion) || !backup.project) {
      throw new ValidationError("Unsupported Rethink project backup format or version.");
    }
    candidate = backup.project;
    sourceExportedAt = typeof backup.exportedAt === "string" ? backup.exportedAt : "";
  }
  const normalized = normalizeProjectState(candidate);
  const importedAt = timestamp(now);
  return {
    ...normalized,
    importHistory: [
      ...normalized.importHistory,
      {
        id: makeId("import", now),
        projectId: normalized.id,
        importedAt,
        sourceExportedAt,
        format: backup.format || "legacy-project-json",
        formatVersion: backup.formatVersion || 0
      }
    ],
    updatedAt: importedAt
  };
}

function mergeAssumptions(existing, changes, cycle, now) {
  const merged = existing.map((assumption) => ({ ...assumption }));
  for (const change of changes) {
    const match = merged.find((assumption) => assumption.text.toLowerCase() === change.assumption.toLowerCase());
    if (match) {
      match.status = change.status;
      match.confidence = change.confidence;
      match.confidenceOrigin = change.confidenceOrigin;
      match.rationale = change.rationale;
      match.lastChangedCycle = cycle;
      match.updatedAt = timestamp(now);
      continue;
    }
    merged.push({
      id: makeId("assumption", now),
      text: change.assumption,
      status: change.status,
      confidence: change.confidence,
      confidenceOrigin: change.confidenceOrigin,
      rationale: change.rationale,
      sourceCycle: cycle,
      evidenceIds: [],
      createdAt: timestamp(now),
      updatedAt: timestamp(now),
      removedAt: "",
      removedReason: ""
    });
  }
  return merged;
}

export function evidenceFingerprint(item) {
  const parts = [
    item.provenanceOrigin || item.sourceType || "",
    normalizeCitationUrl(item.sourceUrl) || item.sourceUrl || "",
    item.claim || "",
    item.observation || "",
    item.sourceDate || ""
  ].map((value) => String(value).trim().toLowerCase().replace(/\s+/g, " "));
  return parts.join("|");
}

export function applyCycleOutput(state, routing, output, metadata = {}, { now = new Date() } = {}) {
  state = normalizeProjectState(state);
  validateCycleOutput(output);
  validateRoutingForState(state, routing);
  validateCycleForState(state, output);
  const cycle = state.cycle + 1;
  const capturedAt = timestamp(now);
  const phaseBefore = state.pecPhase.id;
  const phaseAfter = getPecPhase(output.pecPhaseAfter);
  const citations = Array.isArray(metadata.citations) ? metadata.citations : [];
  const override = Boolean(routing.override);

  const activeAssumptionIds = new Set(state.assumptions.filter((item) => !item.removedAt).map((item) => item.id));
  const citationUrls = new Set(citations.map((item) => item.url));
  const citationsById = new Map(citations.filter((item) => item.id).map((item) => [item.id, item]));
  const seenEvidenceFingerprints = new Set(state.evidence.filter((item) => item.status !== "REMOVED").map(evidenceFingerprint));
  const evidence = output.newEvidence.map((item) => {
    const intakeType = item.intakeType || inferEvidenceIntakeType(item.claim, item.provenanceOrigin);
    const status = ACTUAL_EVIDENCE_TYPES.includes(intakeType) ? "ACTIVE" : "ROUTED";
    const evidenceAuthenticity = inferEvidenceAuthenticity(item, item.provenanceOrigin);
    const assumptionIds = uniqueStrings(item.assumptionIds);
    for (const id of assumptionIds) {
      if (!activeAssumptionIds.has(id)) throw new ValidationError(`New evidence linked an unknown assumption: ${id}.`);
    }
    if (item.provenanceOrigin === "EXTERNAL_SOURCE") {
      const citationIds = uniqueStrings(item.citationIds || []);
      const citedRecords = citationIds.map((id) => citationsById.get(id)).filter(Boolean);
      if (!item.sourceUrl || !citationUrls.has(item.sourceUrl) || citationIds.length === 0 || citedRecords.length !== citationIds.length) {
        throw new ValidationError("Every external-source Evidence Item must be resolved to a valid internal citation ID and canonical URL from native Responses metadata.");
      }
      if (!citedRecords.some((citation) => citation.url === item.sourceUrl)) {
        throw new ValidationError("The external-source Evidence Item URL does not match its trusted internal citation reference.");
      }
    }
    const reliability = item.reliability === "INFER_AUTOMATICALLY"
      ? defaultEvidenceReliability(item.provenanceOrigin, intakeType, item.sourceClassification)
      : item.reliability;
    const relationship = item.relationship === "INFER_AUTOMATICALLY"
      ? (status === "ACTIVE" ? (assumptionIds.length > 0 ? "MIXED" : "NONE_UNLINKED") : "NEUTRAL_CONTEXT_ONLY")
      : item.relationship;
    const candidate = {
      ...item,
      intakeType,
      evidenceAuthenticity,
      authenticityBasis: "SYSTEM_INFERRED",
      reliability,
      reliabilityBasis: item.reliability === "INFER_AUTOMATICALLY" ? "SYSTEM_INFERRED" : "MODEL_GENERATED",
      relationship,
      relationshipBasis: item.relationship === "INFER_AUTOMATICALLY" ? "SYSTEM_INFERRED" : "MODEL_GENERATED",
      id: makeId("evidence", now),
      cycle,
      capturedAt,
      status,
      assumptionIds,
      questionRefs: uniqueStrings([...(item.questionRefs || []), routing.highestLeverageQuestion]),
      createdAt: capturedAt,
      updatedAt: capturedAt,
      removedAt: "",
      removedReason: ""
    };
    const fingerprint = evidenceFingerprint(candidate);
    if (seenEvidenceFingerprints.has(fingerprint)) return null;
    seenEvidenceFingerprints.add(fingerprint);
    return { ...candidate, fingerprint };
  }).filter(Boolean);
  const evidenceEvaluation = {
    ...output.evidenceEvaluation,
    considered: [
      ...output.evidenceEvaluation.considered,
      ...evidence.filter(isActualEvidence).map((item) => ({
        evidenceId: item.id,
        classification: ["MODERATE", "HIGH"].includes(item.reliability) ? "MATERIAL" : "DISCOUNTED",
        relationship: item.relationship,
        rationale: `${item.intakeType.replaceAll("_", " ")} was acquired in this cycle and evaluated at ${item.reliability.toLowerCase()} reliability.`
      }))
    ]
  };
  const tangents = output.tangents.map((item) => ({
    ...item,
    id: makeId("tangent", now),
    cycle,
    capturedAt,
    status: "CAPTURED"
  }));

  const mergedAssumptions = mergeAssumptions(state.assumptions, output.assumptionChanges, cycle, now).map((assumption) => {
    if (assumption.removedAt) return assumption;
    const evidenceIds = new Set(assumption.evidenceIds || []);
    for (const item of evidence) {
      if (item.status === "ACTIVE" && item.assumptionIds.includes(assumption.id)) evidenceIds.add(item.id);
    }
    return { ...assumption, evidenceIds: [...evidenceIds] };
  });
  const confidenceChanges = output.assumptionChanges.map((change) => {
    const before = state.assumptions.find((item) => item.text.toLowerCase() === change.assumption.toLowerCase());
    return {
      assumption: change.assumption,
      before: before ? { confidence: before.confidence, confidenceOrigin: before.confidenceOrigin || "LEGACY_UNSPECIFIED" } : null,
      after: { confidence: change.confidence, confidenceOrigin: change.confidenceOrigin },
      reason: change.rationale
    };
  });
  const questionKey = normalizedQuestion(routing.highestLeverageQuestion);
  const existingQuestion = (state.questions || []).find((item) => normalizedQuestion(item.text) === questionKey);
  const researchOutcome = metadata.research?.evidenceOutcome || "";
  const researchQuestionUnresolved = metadata.research
    && ["NO_CONCLUSIVE_EVIDENCE_FOUND", "NO_RELEVANT_EVIDENCE_FOUND", "NOT_EVALUATED"].includes(researchOutcome);
  const questionRecord = {
    ...(existingQuestion || {}),
    id: existingQuestion?.id || makeId("question", now),
    projectId: state.id,
    text: routing.highestLeverageQuestion,
    status: researchQuestionUnresolved ? (existingQuestion && ["RESOLVED", "SUPERSEDED"].includes(existingQuestion.status) ? "REOPENED" : "ACTIVE") : "RESOLVED",
    sourceCycle: existingQuestion?.sourceCycle ?? cycle,
    createdAt: existingQuestion?.createdAt || capturedAt,
    updatedAt: capturedAt,
    reopenedAt: existingQuestion?.reopenedAt || "",
    supersededBy: existingQuestion?.supersededBy || ""
  };
  const questions = existingQuestion
    ? state.questions.map((item) => item.id === existingQuestion.id ? questionRecord : item)
    : [...state.questions, questionRecord];
  const humanDisposition = ["HUMAN_REAL_WORLD_INPUT_REQUIRED", "HUMAN_INPUT_REQUIRED"].includes(output.nextAction.disposition);
  const humanGate = humanDisposition ? {
    id: makeId("gate", now),
    projectId: state.id,
    cycle,
    status: "OPEN",
    gateType: "HUMAN_REAL_WORLD_INPUT_REQUIRED",
    question: routing.highestLeverageQuestion,
    requiredInput: output.nextAction.action,
    why: output.nextAction.why,
    unresolvedUncertainty: output.remainingUncertainty,
    createdAt: capturedAt,
    resolvedAt: "",
    resolutionType: "",
    resolution: "",
    evidenceIds: []
  } : null;
  const baseUpdatedState = {
    ...state,
    problemDefinition: output.problemDefinition,
    pecPhase: phaseAfter,
    cycle,
    currentDisposition: output.nextAction.disposition,
    lifecycleStatus: lifecycleForDisposition(output.nextAction.disposition, state.lifecycleStatus),
    assumptions: mergedAssumptions,
    evidence: [...state.evidence, ...evidence],
    questions,
    tangents: [...state.tangents, ...tangents],
    humanGates: humanGate ? [...state.humanGates, humanGate] : state.humanGates,
    updatedAt: capturedAt
  };
  const stateSignatureBefore = projectProgressSignature(state);
  const stateSignatureAfter = projectProgressSignature(baseUpdatedState);

  const notebookEntry = {
    id: makeId("cycle", now),
    projectId: state.id,
    contextStatus: "ACTIVE",
    entryType: "CYCLE",
    cycle,
    timestamp: capturedAt,
    pecPhaseBefore: phaseBefore,
    highestLeverageQuestion: routing.highestLeverageQuestion,
    selectedMethod: routing.selectedMethod,
    recommendedMethod: routing.recommendedMethod || routing.selectedMethod,
    override,
    reasonForSelection: routing.whyMethod,
    sourceType: output.reasoning.sourceType,
    evidenceQuality: output.reasoning.evidenceQuality,
    reasoningConclusion: output.reasoning.conclusion,
    findings: output.reasoning.findings,
    learned: output.learned,
    evidenceResults: evidence,
    evidenceEvaluation,
    citations,
    assumptionsChanged: output.assumptionChanges,
    confidenceChanges,
    stateChanges: output.stateChanges,
    remainingUncertainty: output.remainingUncertainty,
    pecPhaseAfter: phaseAfter.id,
    nextRecommendedAction: output.nextAction.action,
    nextActionWhy: output.nextAction.why,
    disposition: output.nextAction.disposition,
    limitations: output.reasoning.limitations,
    stateSignatureBefore,
    stateSignatureAfter,
    runtime: {
      mode: metadata.mode || "demo",
      model: metadata.model || "deterministic-demo",
      responseId: metadata.responseId || "",
      executionKey: metadata.executionKey || ""
    }
  };

  const updatedState = {
    ...baseUpdatedState,
    notebook: [...state.notebook, notebookEntry],
    researchHistory: metadata.research ? [
      ...state.researchHistory,
      {
        ...cloneValue(metadata.research),
        status: "COMPLETED",
        executionStatus: "COMPLETED",
        evidenceOutcome: RESEARCH_EVIDENCE_OUTCOMES.includes(metadata.research.evidenceOutcome)
          ? metadata.research.evidenceOutcome
          : "NO_CONCLUSIVE_EVIDENCE_FOUND",
        jobState: "COMPLETED",
        completedAt: capturedAt,
        cycle,
        question: routing.highestLeverageQuestion,
        propositionStatus: evidenceEvaluation.propositionStatus,
        disconfirmationStatus: evidenceEvaluation.disconfirmation.searchStatus,
        findings: output.reasoning.findings,
        missingEvidence: evidenceEvaluation.gaps,
        remainingGap: output.remainingUncertainty,
        citations
      }
    ] : state.researchHistory,
  };

  return {
    state: updatedState,
    result: {
      cycle,
      routing,
      reasoning: output.reasoning,
      learned: output.learned,
      stateChanges: output.stateChanges,
      assumptionsChanged: output.assumptionChanges,
      confidenceChanges,
      remainingUncertainty: output.remainingUncertainty,
      nextAction: output.nextAction,
      pecPhaseBefore: phaseBefore,
      pecPhaseAfter: phaseAfter,
      citations,
      evidenceEvaluation,
      humanGate,
      notebookEntry
    }
  };
}

export function lockProjectState(state, { note = "", now = new Date() } = {}) {
  state = normalizeProjectState(state);
  const latestTrustedCycle = trustedCycleEntries(state).at(-1);
  const cycle = state.cycle + 1;
  const lockedAt = timestamp(now);
  const lock = {
    id: makeId("lock", now),
    cycle,
    lockedAt,
    status: "ACTIVE",
    note: typeof note === "string" ? note.trim() : "",
    problemDefinition: state.problemDefinition,
    pecPhase: state.pecPhase.id,
    assumptions: state.assumptions.map((assumption) => cloneValue(assumption)),
    evidence: state.evidence.map((evidence) => cloneValue(evidence)),
    claimLedger: cloneValue(state.claimLedger),
    provenanceLedger: cloneValue(state.provenanceLedger),
    temporalLedger: cloneValue(state.temporalLedger),
    highestLeverageQuestion: latestTrustedCycle?.highestLeverageQuestion || "",
    reopeningTrigger: "",
    reopeningReason: "",
    reopenedAt: ""
  };
  const notebookEntry = {
    id: makeId("cycle", now),
    projectId: state.id,
    contextStatus: "ACTIVE",
    entryType: "LOCK",
    cycle,
    timestamp: lockedAt,
    pecPhaseBefore: state.pecPhase.id,
    highestLeverageQuestion: "Which current working state should be canonical until new evidence justifies reopening it?",
    selectedMethod: "DECIDE",
    recommendedMethod: "DECIDE",
    override: true,
    reasonForSelection: "User invoked Lock It In to prevent conceptual drift.",
    sourceType: "USER_DECISION",
    evidenceQuality: "NONE",
    reasoningConclusion: "The current state is now the canonical working version; it may be reopened only when new evidence, a failed assumption, an integration conflict, or a demonstrably better version appears.",
    findings: [],
    learned: ["The current working state has been versioned as canonical."],
    evidenceResults: [],
    evidenceEvaluation: demoEvidenceEvaluation(state),
    citations: [],
    assumptionsChanged: [],
    stateChanges: ["Created a Lock It In checkpoint."],
    remainingUncertainty: latestTrustedCycle?.remainingUncertainty || [],
    pecPhaseAfter: state.pecPhase.id,
    nextRecommendedAction: "Continue from this canonical state and reopen it only when evidence meets a stated reopening condition.",
    nextActionWhy: "A checkpoint limits conceptual drift without pretending the state is permanently final.",
    disposition: "CONTINUE",
    limitations: [],
    runtime: { mode: "local", model: "none", responseId: "" },
    lockedDecisionId: lock.id
  };

  return {
    state: {
      ...state,
      cycle,
      lockedDecisions: [...state.lockedDecisions, lock],
      notebook: [...state.notebook, notebookEntry],
      stateEvents: [...state.stateEvents, {
        id: makeId("event", now),
        entityType: "LOCK",
        entityId: lock.id,
        action: "LOCKED",
        timestamp: lockedAt,
        cycle,
        summary: `Locked canonical version ${cycle}.`,
        reason: lock.note || "User invoked Lock It In.",
        before: null,
        after: cloneValue(lock)
      }],
      updatedAt: lockedAt
    },
    result: {
      cycle,
      locked: true,
      notebookEntry,
      nextAction: {
        disposition: "CONTINUE",
        action: notebookEntry.nextRecommendedAction,
        why: notebookEntry.nextActionWhy
      }
    }
  };
}

function requiredText(value, label) {
  if (typeof value !== "string" || value.trim().length < 2) {
    throw new ValidationError(`${label} must contain at least 2 characters.`);
  }
  return value.replace(/\s+/g, " ").trim();
}

function requiredReason(value) {
  if (typeof value !== "string" || value.trim().length < 3) {
    throw new ValidationError("A short change reason is required so this state edit can be traced.");
  }
  return value.replace(/\s+/g, " ").trim();
}

function uniqueStrings(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()))];
}

function createStateEditNotebookEntry(state, event, at) {
  const isReopen = event.action === "REOPENED";
  const isDisposition = event.entityType === "DISPOSITION";
  const isResearchDecision = event.entityType === "RESEARCH" && ["PROCEED_UNDER_UNCERTAINTY", "ROUTE_TO_HUMAN_REAL_WORLD_EVIDENCE"].includes(event.action);
  const isStage = event.entityType === "PEC_STAGE";
  const selectedMethod = isDisposition || isResearchDecision ? "DECIDE" : (isStage && event.after?.forcedMethod ? event.after.forcedMethod : (isReopen ? "DECIDE" : "CAPTURE"));
  return {
    id: makeId("state_edit", at),
    projectId: state.id,
    contextStatus: "ACTIVE",
    entryType: "STATE_EDIT",
    cycle: state.cycle,
    timestamp: timestamp(at),
    pecPhaseBefore: state.pecPhase.id,
    highestLeverageQuestion: event.summary,
    selectedMethod,
    recommendedMethod: isDisposition ? "DECIDE" : selectedMethod,
    override: true,
    reasonForSelection: event.reason,
    sourceType: "USER_DECISION",
    evidenceQuality: "NONE",
    reasoningConclusion: event.summary,
    findings: [],
    learned: [event.summary],
    evidenceResults: [],
    evidenceEvaluation: demoEvidenceEvaluation(state),
    citations: [],
    assumptionsChanged: [],
    stateChanges: [event.summary],
    remainingUncertainty: event.after?.unresolvedUncertainty || trustedCycleEntries(state).at(-1)?.remainingUncertainty || [],
    pecPhaseAfter: state.pecPhase.id,
    nextRecommendedAction: "Re-run the router if this manual state change could alter the highest-leverage question.",
    nextActionWhy: "Manual claim, evidence, and assumption edits can change reasoning priority.",
    disposition: isDisposition || isResearchDecision ? event.after.humanDisposition : "CONTINUE",
    limitations: [],
    runtime: { mode: "local", model: "none", responseId: "" },
    stateEventId: event.id,
    systemRecommendation: event.after?.systemRecommendation || "",
    humanDisposition: event.after?.humanDisposition || "",
    unresolvedUncertainty: event.after?.unresolvedUncertainty || [],
    knownRisks: event.after?.knownRisks || [],
    reopeningConditions: event.after?.reopeningConditions || [],
    researchExecutionStatus: event.after?.executionStatus || event.after?.research?.executionStatus || "",
    researchEvidenceOutcome: event.after?.evidenceOutcome || event.after?.research?.evidenceOutcome || "",
    researchErrorLog: event.after?.errorLog || event.after?.research?.errorLog || []
  };
}

function finishStateEdit(state, event, at) {
  const notebookEntry = createStateEditNotebookEntry(state, event, at);
  return {
    state: {
      ...state,
      stateEvents: [...state.stateEvents, event],
      notebook: [...state.notebook, notebookEntry],
      updatedAt: timestamp(at)
    },
    event,
    notebookEntry
  };
}

function activeAssumption(state, id) {
  return state.assumptions.find((item) => item.id === id && !item.removedAt);
}

function activeEvidence(state, id) {
  return state.evidence.find((item) => item.id === id && item.status !== "REMOVED");
}

function validateLinkedIds(state, ids, entityType) {
  for (const id of ids) {
    const exists = entityType === "EVIDENCE"
      ? state.evidence.find((item) => item.id === id && isActualEvidence(item))
      : activeAssumption(state, id);
    if (!exists) throw new ValidationError(`Cannot link missing or removed ${entityType.toLowerCase()} item: ${id}.`);
  }
}

function upsertAssumption(state, operation, at) {
  const item = operation.item || {};
  const reason = requiredReason(operation.reason);
  const text = requiredText(item.text, "Assumption");
  const status = item.status || "UNTESTED";
  if (!ASSUMPTION_STATUSES.includes(status)) {
    throw new ValidationError(`Assumption status must be one of: ${ASSUMPTION_STATUSES.join(", ")}.`);
  }
  const confidence = Number(item.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new ValidationError("Assumption confidence must be between 0 and 1.");
  }
  const confidenceOrigin = item.confidenceOrigin || "USER_DEFINED";
  if (!CONFIDENCE_ORIGINS.includes(confidenceOrigin)) {
    throw new ValidationError(`Confidence origin must be one of: ${CONFIDENCE_ORIGINS.join(", ")}.`);
  }
  const evidenceIds = uniqueStrings(item.evidenceIds);
  validateLinkedIds(state, evidenceIds, "EVIDENCE");
  const existing = item.id ? activeAssumption(state, item.id) : null;
  if (item.id && !existing) throw new ValidationError("The assumption no longer exists or has been removed.");
  const duplicate = state.assumptions.find((candidate) => !candidate.removedAt
    && candidate.id !== item.id
    && candidate.text.toLowerCase() === text.toLowerCase());
  if (duplicate) throw new ValidationError("An active assumption with the same text already exists.");

  const id = existing?.id || makeId("assumption", at);
  const updated = {
    ...(existing || {}),
    id,
    text,
    status,
    confidence,
    confidenceOrigin,
    rationale: requiredText(item.rationale || reason, "Rationale"),
    sourceCycle: existing?.sourceCycle ?? state.cycle,
    evidenceIds,
    createdAt: existing?.createdAt || timestamp(at),
    updatedAt: timestamp(at),
    removedAt: "",
    removedReason: ""
  };
  const assumptions = existing
    ? state.assumptions.map((candidate) => candidate.id === id ? updated : candidate)
    : [...state.assumptions, updated];
  const evidence = state.evidence.map((candidate) => {
    if (candidate.status === "REMOVED") return candidate;
    const links = new Set(candidate.assumptionIds || []);
    if (evidenceIds.includes(candidate.id)) links.add(id); else links.delete(id);
    return { ...candidate, assumptionIds: [...links], updatedAt: timestamp(at) };
  });
  const action = existing ? "UPDATED" : "CREATED";
  const event = {
    id: makeId("event", at),
    entityType: "ASSUMPTION",
    entityId: id,
    action,
    timestamp: timestamp(at),
    cycle: state.cycle,
    summary: `${action === "CREATED" ? "Added" : "Updated"} assumption: ${text}`,
    reason,
    before: existing ? cloneValue(existing) : null,
    after: cloneValue(updated)
  };
  return finishStateEdit({ ...state, assumptions, evidence }, event, at);
}

function removeAssumption(state, operation, at) {
  const reason = requiredReason(operation.reason);
  const existing = activeAssumption(state, operation.id);
  if (!existing) throw new ValidationError("The assumption no longer exists or has already been removed.");
  const removed = {
    ...existing,
    evidenceIds: [],
    removedAt: timestamp(at),
    removedReason: reason,
    updatedAt: timestamp(at)
  };
  const assumptions = state.assumptions.map((candidate) => candidate.id === existing.id ? removed : candidate);
  const evidence = state.evidence.map((candidate) => ({
    ...candidate,
    assumptionIds: (candidate.assumptionIds || []).filter((id) => id !== existing.id),
    updatedAt: (candidate.assumptionIds || []).includes(existing.id) ? timestamp(at) : candidate.updatedAt
  }));
  const event = {
    id: makeId("event", at),
    entityType: "ASSUMPTION",
    entityId: existing.id,
    action: "REMOVED",
    timestamp: timestamp(at),
    cycle: state.cycle,
    summary: `Removed assumption: ${existing.text}`,
    reason,
    before: cloneValue(existing),
    after: cloneValue(removed)
  };
  return finishStateEdit({ ...state, assumptions, evidence }, event, at);
}

function validateSourceUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("protocol");
    return url.href;
  } catch {
    throw new ValidationError("Evidence source URL must be a valid HTTP or HTTPS URL.");
  }
}

function inferEvidenceIntakeType(claim, provenanceOrigin = "USER_INPUT") {
  const text = String(claim || "").trim();
  if (/^(collect|conduct|run|perform|schedule|interview|survey|test|measure|research|investigate|obtain)\b/i.test(text)
    || /\b(should|must|need to|plan to)\s+(collect|conduct|run|interview|survey|test|measure|research|investigate)\b/i.test(text)) {
    return "PLANNED_TEST";
  }
  if (/\?$/.test(text)) return "RESEARCH_QUESTION";
  if (provenanceOrigin === "EXTERNAL_SOURCE") return "PUBLIC_SOURCE_FINDING";
  if (provenanceOrigin === "MODEL_INFERENCE") return "MODEL_GENERATED_HYPOTHESIS";
  if (provenanceOrigin === "SYSTEM_CALCULATION") return "DERIVED_CALCULATION";
  if (provenanceOrigin === "REAL_WORLD_TEST_OBSERVATION") return "TEST_RESULT";
  if (provenanceOrigin === "INTERNAL_PROJECT_DATA") return "PRIVATE_INTERNAL_DATA";
  if (/^(customers?|users?|buyers?|people|companies)\s+(want|need|prefer|hate|love)\b/i.test(text)) return "USER_ASSERTION";
  return "ANECDOTAL_EVIDENCE";
}

function evidenceContainsSyntheticMarker(item) {
  const text = [item?.claim, item?.observation, item?.assessment, item?.methodDetails, item?.sourceTitle]
    .filter(Boolean)
    .join(" ");
  return /\b(synthetic|simulated|hypothetical|mock|fabricated|acceptance[- ]test|test fixture)\b/i.test(text);
}

function inferEvidenceAuthenticity(item, provenanceOrigin) {
  if (EVIDENCE_AUTHENTICITY.includes(item?.evidenceAuthenticity) && item.evidenceAuthenticity !== "INFER_AUTOMATICALLY") {
    return item.evidenceAuthenticity;
  }
  if (evidenceContainsSyntheticMarker(item)) {
    return "SYNTHETIC_SIMULATED";
  }
  if (["EXTERNAL_SOURCE", "REAL_WORLD_TEST_OBSERVATION", "INTERNAL_PROJECT_DATA"].includes(provenanceOrigin)) {
    return "REAL_WORLD";
  }
  return "UNKNOWN_NOT_ASSESSED";
}

function defaultEvidenceReliability(provenanceOrigin, intakeType, sourceClassification = "UNKNOWN_NOT_APPLICABLE") {
  if (NON_EVIDENCE_TYPES.includes(intakeType)) return "UNKNOWN_NOT_ASSESSED";
  if (sourceClassification === "PRIMARY_SOURCE" && provenanceOrigin === "EXTERNAL_SOURCE") return "HIGH";
  if (provenanceOrigin === "EXTERNAL_SOURCE") return "MODERATE";
  if (["REAL_WORLD_TEST_OBSERVATION", "INTERNAL_PROJECT_DATA", "SYSTEM_CALCULATION"].includes(provenanceOrigin)) return "MODERATE";
  if (intakeType === "TEST_RESULT") return "MODERATE";
  return "LOW";
}

function defaultCollectionMethod(provenanceOrigin, intakeType) {
  if (intakeType === "TEST_RESULT") return "EXPERIMENT_PILOT";
  if (provenanceOrigin === "EXTERNAL_SOURCE") return "WEB_PUBLIC_SOURCE_RESEARCH";
  if (provenanceOrigin === "INTERNAL_PROJECT_DATA") return "ADMINISTRATIVE_OPERATIONAL_DATA";
  if (provenanceOrigin === "REAL_WORLD_TEST_OBSERVATION") return "DIRECT_OBSERVATION";
  if (provenanceOrigin === "SYSTEM_CALCULATION") return "STATISTICAL_MODELING_ESTIMATION";
  return "UNKNOWN_NOT_REPORTED";
}

function upsertEvidence(state, operation, at) {
  const item = operation.item || {};
  const reason = requiredReason(operation.reason);
  const claim = requiredText(item.claim, "Evidence claim");
  const provenanceOrigin = item.provenanceOrigin || item.sourceType || "USER_INPUT";
  if (!EVIDENCE_PROVENANCE_ORIGINS.includes(provenanceOrigin)) {
    throw new ValidationError(`Evidence provenance origin must be one of: ${EVIDENCE_PROVENANCE_ORIGINS.join(", ")}.`);
  }
  const intakeType = item.intakeType || inferEvidenceIntakeType(claim, provenanceOrigin);
  if (!EVIDENCE_INTAKE_TYPES.includes(intakeType)) {
    throw new ValidationError(`Evidence intake type must be one of: ${EVIDENCE_INTAKE_TYPES.join(", ")}.`);
  }
  const requestedAuthenticity = item.evidenceAuthenticity || "INFER_AUTOMATICALLY";
  if (!EVIDENCE_AUTHENTICITY.includes(requestedAuthenticity)) {
    throw new ValidationError(`Evidence authenticity must be one of: ${EVIDENCE_AUTHENTICITY.join(", ")}.`);
  }
  const evidenceAuthenticity = inferEvidenceAuthenticity({ ...item, claim, evidenceAuthenticity: requestedAuthenticity }, provenanceOrigin);
  const sourceClassification = item.sourceClassification || "UNKNOWN_NOT_APPLICABLE";
  if (!SOURCE_CLASSIFICATIONS.includes(sourceClassification)) {
    throw new ValidationError(`Source classification must be one of: ${SOURCE_CLASSIFICATIONS.join(", ")}.`);
  }
  const sourceCategory = item.sourceCategory || "UNKNOWN";
  if (!SOURCE_CATEGORIES.includes(sourceCategory)) {
    throw new ValidationError(`Source category must be one of: ${SOURCE_CATEGORIES.join(", ")}.`);
  }
  const requestedReliability = item.reliability || "INFER_AUTOMATICALLY";
  if (!EVIDENCE_RELIABILITY.includes(requestedReliability)) {
    throw new ValidationError(`Evidence reliability must be one of: ${EVIDENCE_RELIABILITY.join(", ")}.`);
  }
  const reliability = requestedReliability === "INFER_AUTOMATICALLY"
    ? defaultEvidenceReliability(provenanceOrigin, intakeType, sourceClassification)
    : requestedReliability;
  const requestedRelationship = item.relationship || "INFER_AUTOMATICALLY";
  if (!EVIDENCE_RELATIONSHIPS.includes(requestedRelationship)) {
    throw new ValidationError(`Evidence relationship must be one of: ${EVIDENCE_RELATIONSHIPS.join(", ")}.`);
  }
  const isEvidence = ACTUAL_EVIDENCE_TYPES.includes(intakeType);
  const relationship = requestedRelationship === "INFER_AUTOMATICALLY"
    ? (isEvidence
        ? ((item.assumptionIds || []).length > 0 || (item.questionRefs || []).length > 0 ? "MIXED" : "NONE_UNLINKED")
        : "NEUTRAL_CONTEXT_ONLY")
    : requestedRelationship;
  const collectionMethod = item.collectionMethod || defaultCollectionMethod(provenanceOrigin, intakeType);
  if (!COLLECTION_METHODS.includes(collectionMethod)) {
    throw new ValidationError(`Collection method must be one of: ${COLLECTION_METHODS.join(", ")}.`);
  }
  const assumptionIds = uniqueStrings(item.assumptionIds);
  validateLinkedIds(state, assumptionIds, "ASSUMPTION");
  const linkedAssumptionIds = isEvidence ? assumptionIds : [];
  const questionRefs = uniqueStrings(item.questionRefs);
  const existing = item.id ? activeEvidence(state, item.id) : null;
  if (item.id && !existing) throw new ValidationError("The evidence item no longer exists or has been removed.");
  const id = existing?.id || makeId("evidence", at);
  let assessment = requiredText(item.assessment || reason, "Evidence assessment");
  if (evidenceAuthenticity === "SYNTHETIC_SIMULATED" && !/synthetic|simulated|not real-world/i.test(assessment)) {
    assessment = `${assessment} This is synthetic or simulated test data and does not validate a real-world proposition.`;
  }
  const updated = {
    ...(existing || {}),
    id,
    claim,
    provenanceOrigin,
    sourceClassification,
    sourceCategory,
    sourceTitle: typeof item.sourceTitle === "string" ? item.sourceTitle.trim() : "",
    sourceUrl: validateSourceUrl(typeof item.sourceUrl === "string" ? item.sourceUrl.trim() : ""),
    assessment,
    intakeType,
    evidenceAuthenticity,
    authenticityBasis: requestedAuthenticity === "INFER_AUTOMATICALLY" ? "SYSTEM_INFERRED" : "USER_DEFINED",
    reliability,
    reliabilityBasis: requestedReliability === "INFER_AUTOMATICALLY" ? "SYSTEM_INFERRED" : "USER_DEFINED",
    relationship,
    relationshipBasis: requestedRelationship === "INFER_AUTOMATICALLY" ? "SYSTEM_INFERRED" : "USER_DEFINED",
    sourceDate: typeof item.sourceDate === "string" ? item.sourceDate.trim() : "",
    population: typeof item.population === "string" ? item.population.trim() : "",
    collectionMethod,
    methodDetails: typeof item.methodDetails === "string" ? item.methodDetails.trim() : (typeof item.method === "string" ? item.method.trim() : ""),
    observation: typeof item.observation === "string" && item.observation.trim() ? item.observation.trim() : claim,
    status: isEvidence ? "ACTIVE" : "ROUTED",
    assumptionIds: linkedAssumptionIds,
    questionRefs,
    cycle: existing?.cycle ?? state.cycle,
    capturedAt: existing?.capturedAt || timestamp(at),
    createdAt: existing?.createdAt || timestamp(at),
    updatedAt: timestamp(at),
    removedAt: "",
    removedReason: ""
  };
  const evidence = existing
    ? state.evidence.map((candidate) => candidate.id === id ? updated : candidate)
    : [...state.evidence, updated];
  const relationshipRetirement = isEvidence
    ? { ledger: state.claimLedger, removed: [] }
    : removeRelationshipsForEvidence(state.claimLedger, id, {
        reason: `Evidence reclassified as non-linkable ${intakeType}: ${reason}`,
        now: at
      });
  const assumptions = state.assumptions.map((candidate) => {
    if (candidate.removedAt) return candidate;
    const links = new Set(candidate.evidenceIds || []);
    if (linkedAssumptionIds.includes(candidate.id)) links.add(id); else links.delete(id);
    return { ...candidate, evidenceIds: [...links], updatedAt: timestamp(at) };
  });
  const questions = (state.questions || []).map((question) => {
    const linked = questionRefs.some((text) => normalizedQuestion(text) === normalizedQuestion(question.text));
    if (isEvidence && relationship === "CONTRADICTS" && linked && ["RESOLVED", "SUPERSEDED"].includes(question.status)) {
      return { ...question, status: "REOPENED", reopenedAt: timestamp(at), updatedAt: timestamp(at) };
    }
    return question;
  });
  const action = existing ? "UPDATED" : "CREATED";
  const event = {
    id: makeId("event", at),
    entityType: "EVIDENCE",
    entityId: id,
    action,
    timestamp: timestamp(at),
    cycle: state.cycle,
    summary: isEvidence
      ? `${action === "CREATED" ? "Added" : "Updated"} ${evidenceAuthenticity === "SYNTHETIC_SIMULATED" ? "synthetic test evidence" : "evidence"}: ${claim}`
      : `Classified and routed ${intakeType.toLowerCase().replaceAll("_", " ")}: ${claim}`,
    reason,
    before: existing ? cloneValue(existing) : null,
    after: cloneValue(updated)
  };
  return finishStateEdit({
    ...state,
    assumptions,
    evidence,
    questions,
    claimLedger: relationshipRetirement.ledger
  }, event, at);
}

function removeEvidence(state, operation, at) {
  const reason = requiredReason(operation.reason);
  const existing = activeEvidence(state, operation.id);
  if (!existing) throw new ValidationError("The evidence item no longer exists or has already been removed.");
  const relationshipRemoval = removeRelationshipsForEvidence(state.claimLedger, existing.id, {
    reason: `Evidence removed: ${reason}`,
    now: at
  });
  const removed = {
    ...existing,
    status: "REMOVED",
    assumptionIds: [],
    removedAt: timestamp(at),
    removedReason: reason,
    updatedAt: timestamp(at)
  };
  const evidence = state.evidence.map((candidate) => candidate.id === existing.id ? removed : candidate);
  const assumptions = state.assumptions.map((candidate) => ({
    ...candidate,
    evidenceIds: (candidate.evidenceIds || []).filter((id) => id !== existing.id),
    updatedAt: (candidate.evidenceIds || []).includes(existing.id) ? timestamp(at) : candidate.updatedAt
  }));
  const event = {
    id: makeId("event", at),
    entityType: "EVIDENCE",
    entityId: existing.id,
    action: "REMOVED",
    timestamp: timestamp(at),
    cycle: state.cycle,
    summary: `Removed evidence: ${existing.claim}${relationshipRemoval.removed.length ? ` and retired ${relationshipRemoval.removed.length} claim link${relationshipRemoval.removed.length === 1 ? "" : "s"}` : ""}`,
    reason,
    before: cloneValue(existing),
    after: cloneValue(removed)
  };
  return finishStateEdit({
    ...state,
    assumptions,
    evidence,
    claimLedger: relationshipRemoval.ledger
  }, event, at);
}

function reopenLock(state, operation, at) {
  const reason = requiredReason(operation.reason);
  if (!REOPEN_TRIGGERS.includes(operation.trigger)) {
    throw new ValidationError(`Reopening trigger must be one of: ${REOPEN_TRIGGERS.join(", ")}.`);
  }
  const existing = state.lockedDecisions.find((lock) => lock.id === operation.lockId);
  if (!existing || existing.status === "REOPENED") {
    throw new ValidationError("The locked version does not exist or has already been reopened.");
  }
  const reopened = {
    ...existing,
    status: "REOPENED",
    reopeningTrigger: operation.trigger,
    reopeningReason: reason,
    reopenedAt: timestamp(at),
    reopenedCycle: state.cycle
  };
  const lockedDecisions = state.lockedDecisions.map((lock) => lock.id === existing.id ? reopened : lock);
  const event = {
    id: makeId("event", at),
    entityType: "LOCK",
    entityId: existing.id,
    action: "REOPENED",
    timestamp: timestamp(at),
    cycle: state.cycle,
    summary: `Reopened locked version from Cycle ${existing.cycle}.`,
    reason: `${operation.trigger}: ${reason}`,
    before: cloneValue(existing),
    after: cloneValue(reopened)
  };
  return finishStateEdit({ ...state, lockedDecisions }, event, at);
}

function resolveHumanGate(state, operation, at) {
  const reason = requiredReason(operation.reason);
  if (!HUMAN_GATE_RESOLUTIONS.includes(operation.resolutionType)) {
    throw new ValidationError(`Human-gate resolution must be one of: ${HUMAN_GATE_RESOLUTIONS.join(", ")}.`);
  }
  const resolution = requiredText(operation.resolution, "Human-gate resolution");
  const existing = state.humanGates.find((gate) => gate.id === operation.gateId && gate.status === "OPEN");
  if (!existing) throw new ValidationError("The human gate does not exist or is already resolved.");
  const evidenceIds = uniqueStrings(operation.evidenceIds);
  for (const evidenceId of evidenceIds) {
    if (!state.evidence.some((item) => item.id === evidenceId && item.status === "ACTIVE")) {
      throw new ValidationError(`Human-gate resolution referenced unavailable evidence: ${evidenceId}.`);
    }
  }
  if (["ADD_EVIDENCE", "ENTER_TEST_RESULT"].includes(operation.resolutionType)
    && !evidenceIds.some((id) => state.evidence.some((item) => item.id === id && isActualEvidence(item)))) {
    throw new ValidationError("Evidence-based gate resolution must reference at least one active non-synthetic Evidence Item from the Evidence Register.");
  }
  const resolved = {
    ...existing,
    status: "RESOLVED",
    resolutionType: operation.resolutionType,
    resolution,
    evidenceIds,
    resolutionReason: reason,
    resolvedAt: timestamp(at)
  };
  const humanGates = state.humanGates.map((gate) => gate.id === existing.id ? resolved : gate);
  const event = {
    id: makeId("event", at),
    entityType: "HUMAN_GATE",
    entityId: existing.id,
    action: "RESOLVED",
    timestamp: timestamp(at),
    cycle: state.cycle,
    summary: `Resolved human gate via ${operation.resolutionType.toLowerCase().replaceAll("_", " ")}.`,
    reason,
    before: cloneValue(existing),
    after: cloneValue(resolved)
  };
  return finishStateEdit({ ...state, humanGates }, event, at);
}

function overrideDisposition(state, operation, at) {
  const rationale = requiredReason(operation.rationale || operation.reason);
  if (!HUMAN_DISPOSITIONS.includes(operation.humanDisposition)) {
    throw new ValidationError(`Human disposition must be one of: ${HUMAN_DISPOSITIONS.join(", ")}.`);
  }
  const lastCycle = trustedCycleEntries(state).at(-1);
  const decision = {
    id: makeId("decision", at),
    projectId: state.id,
    cycle: state.cycle,
    timestamp: timestamp(at),
    systemRecommendation: operation.systemRecommendation || lastCycle?.disposition || "CONTINUE",
    humanDisposition: operation.humanDisposition,
    rationale,
    unresolvedUncertainty: uniqueStrings(operation.unresolvedUncertainty?.length ? operation.unresolvedUncertainty : lastCycle?.remainingUncertainty),
    unmetEvidenceThresholds: uniqueStrings(operation.unmetEvidenceThresholds),
    knownRisks: uniqueStrings(operation.knownRisks),
    reopeningConditions: uniqueStrings(operation.reopeningConditions),
    status: "ACTIVE"
  };
  if (!DISPOSITIONS.includes(decision.systemRecommendation)) {
    throw new ValidationError("System recommendation is not a recognized disposition.");
  }
  const event = {
    id: makeId("event", at),
    entityType: "DISPOSITION",
    entityId: decision.id,
    action: "HUMAN_OVERRIDE",
    timestamp: timestamp(at),
    cycle: state.cycle,
    summary: `Human disposition ${decision.humanDisposition} overrides system recommendation ${decision.systemRecommendation}.`,
    reason: rationale,
    before: { systemRecommendation: decision.systemRecommendation },
    after: cloneValue(decision)
  };
  return finishStateEdit({
    ...state,
    currentDisposition: decision.humanDisposition,
    lifecycleStatus: lifecycleForDisposition(decision.humanDisposition, state.lifecycleStatus),
    humanDecisions: [...state.humanDecisions, decision]
  }, event, at);
}

function overrideStage(state, operation, at) {
  const reason = requiredReason(operation.reason);
  if (!STAGE_OVERRIDE_ACTIONS.includes(operation.action)) {
    throw new ValidationError(`Stage override action must be one of: ${STAGE_OVERRIDE_ACTIONS.join(", ")}.`);
  }
  const target = getPecPhase(operation.pecPhase || state.pecPhase.id);
  const forcedMethod = operation.forcedMethod || "";
  if (forcedMethod && !METHODS.includes(forcedMethod)) throw new ValidationError("Stage override forcedMethod is invalid.");
  let pecPhase = state.pecPhase;
  if (["REOPEN", "RERUN"].includes(operation.action)) pecPhase = target;
  if (["MARK_COMPLETE", "PROCEED_UNRESOLVED", "BYPASS"].includes(operation.action)) {
    pecPhase = getPecPhase(Math.min(target.index + 1, 11));
  }
  if (operation.action === "REQUEST_FINAL_JUDGMENT") pecPhase = getPecPhase("DECISION");
  const record = {
    id: makeId("stage", at),
    projectId: state.id,
    cycle: state.cycle,
    timestamp: timestamp(at),
    action: operation.action,
    pecPhaseBefore: state.pecPhase.id,
    targetPecPhase: target.id,
    pecPhaseAfter: pecPhase.id,
    forcedMethod,
    unresolvedEvidence: uniqueStrings(operation.unresolvedEvidence),
    reason
  };
  const event = {
    id: makeId("event", at),
    entityType: "PEC_STAGE",
    entityId: record.id,
    action: operation.action,
    timestamp: timestamp(at),
    cycle: state.cycle,
    summary: `${operation.action.replaceAll("_", " ")} recorded for PEC ${target.label}.`,
    reason,
    before: { pecPhase: state.pecPhase.id },
    after: cloneValue(record)
  };
  return finishStateEdit({ ...state, pecPhase, stageOverrides: [...state.stageOverrides, record] }, event, at);
}

function redactTechnicalError(value) {
  return String(value || "Unknown research execution error.")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[REDACTED_API_KEY]")
    .replace(/(authorization|api[-_ ]?key)\s*[:=]\s*[^\s,;]+/gi, "$1: [REDACTED]")
    .slice(0, 4000);
}

function safeResearchResponseMetadata(value) {
  if (!value || typeof value !== "object") return null;
  return {
    responseId: typeof value.responseId === "string" ? value.responseId : "",
    status: typeof value.status === "string" ? value.status : "",
    createdAt: value.createdAt || null,
    completedAt: value.completedAt || null,
    model: typeof value.model === "string" ? value.model : "",
    incompleteDetails: value.incompleteDetails && typeof value.incompleteDetails === "object"
      ? { reason: typeof value.incompleteDetails.reason === "string" ? value.incompleteDetails.reason : "" }
      : null,
    maxOutputTokens: Number.isFinite(Number(value.maxOutputTokens)) ? Number(value.maxOutputTokens) : null,
    usage: value.usage && typeof value.usage === "object" ? {
      inputTokens: Number.isFinite(Number(value.usage.inputTokens)) ? Number(value.usage.inputTokens) : null,
      outputTokens: Number.isFinite(Number(value.usage.outputTokens)) ? Number(value.usage.outputTokens) : null,
      reasoningTokens: Number.isFinite(Number(value.usage.reasoningTokens)) ? Number(value.usage.reasoningTokens) : null,
      totalTokens: Number.isFinite(Number(value.usage.totalTokens)) ? Number(value.usage.totalTokens) : null
    } : null,
    outputItems: Array.isArray(value.outputItems)
      ? value.outputItems.slice(0, 30).map((item) => ({ type: String(item?.type || "unknown"), status: String(item?.status || "") }))
      : [],
    failureStage: typeof value.failureStage === "string" ? value.failureStage : "",
    underlyingCode: typeof value.underlyingCode === "string" ? value.underlyingCode : "",
    ingestionMode: typeof value.ingestionMode === "string" ? value.ingestionMode : "",
    nativeCitationCount: Number.isFinite(Number(value.nativeCitationCount)) ? Number(value.nativeCitationCount) : null,
    submittedEvidenceItemCount: Number.isFinite(Number(value.submittedEvidenceItemCount)) ? Number(value.submittedEvidenceItemCount) : null,
    externalEvidenceItemCount: Number.isFinite(Number(value.externalEvidenceItemCount)) ? Number(value.externalEvidenceItemCount) : null,
    mappedExternalItemCount: Number.isFinite(Number(value.mappedExternalItemCount)) ? Number(value.mappedExternalItemCount) : null,
    affectedEvidenceItems: Array.isArray(value.affectedEvidenceItems)
      ? value.affectedEvidenceItems.slice(0, 20).map((item) => ({
          index: Number.isFinite(Number(item?.index)) ? Number(item.index) : null,
          claim: String(item?.claim || "Unnamed evidence item").slice(0, 500),
          submittedSourceUrl: String(item?.submittedSourceUrl || "").slice(0, 2000),
          reason: String(item?.reason || "Citation mapping failed.").slice(0, 1000)
        }))
      : []
  };
}

function activeQuestionRecord(state, question, at) {
  const text = requiredText(question, "Research question");
  const key = normalizedQuestion(text);
  const existing = (state.questions || []).find((item) => normalizedQuestion(item.text) === key);
  const updated = {
    ...(existing || {}),
    id: existing?.id || makeId("question", at),
    projectId: state.id,
    text,
    status: existing && ["RESOLVED", "SUPERSEDED"].includes(existing.status) ? "REOPENED" : "ACTIVE",
    sourceCycle: existing?.sourceCycle ?? state.cycle,
    createdAt: existing?.createdAt || timestamp(at),
    updatedAt: timestamp(at),
    reopenedAt: existing && ["RESOLVED", "SUPERSEDED"].includes(existing.status) ? timestamp(at) : (existing?.reopenedAt || ""),
    supersededBy: ""
  };
  return {
    record: updated,
    questions: existing
      ? state.questions.map((item) => item.id === existing.id ? updated : item)
      : [...state.questions, updated]
  };
}

function upsertResearchHistory(state, record) {
  const index = state.researchHistory.findIndex((item) => (record.researchKey && item.researchKey === record.researchKey)
    || (record.jobId && item.jobId === record.jobId)
    || (record.responseId && item.responseId === record.responseId));
  if (index < 0) return [...state.researchHistory, record];
  return state.researchHistory.map((item, candidateIndex) => candidateIndex === index ? { ...item, ...record } : item);
}

function recordResearchExecution(state, operation, at, executionStatus) {
  const research = operation.research && typeof operation.research === "object" ? operation.research : {};
  const question = research.question || operation.question;
  const { questions } = activeQuestionRecord(state, question, at);
  const errorSummary = executionStatus === "FAILED_TECHNICALLY"
    ? requiredText(operation.errorSummary || research.errorSummary || "Public research failed technically.", "Research error summary")
    : "Public research was cancelled before evidence evaluation.";
  const responseMetadata = safeResearchResponseMetadata(operation.responseMetadata || research.failureMetadata || research.incompleteResponseMetadata);
  const errorCode = executionStatus === "FAILED_TECHNICALLY"
    ? String(operation.errorCode || research.failureCode || "RESEARCH_EXECUTION_FAILED")
    : "RESEARCH_CANCELLED";
  const entry = {
    timestamp: timestamp(at),
    jobId: research.jobId || "unassigned",
    responseId: research.responseId || "",
    status: executionStatus,
    humanReadableSummary: errorSummary,
    technicalError: redactTechnicalError(operation.technicalError || research.lastError || research.technicalError || errorSummary),
    errorCode,
    responseMetadata,
    retryAttempt: Number(research.retryCount || 0),
    currentJobState: operation.jobState || research.status || executionStatus
  };
  const record = {
    ...cloneValue(research),
    jobId: research.jobId || makeId("research", at),
    projectId: state.id,
    question: requiredText(question, "Research question"),
    status: executionStatus === "FAILED_TECHNICALLY" ? "FAILED" : "CANCELLED",
    executionStatus,
    evidenceOutcome: "NOT_EVALUATED",
    failureCode: errorCode,
    failureMetadata: responseMetadata,
    incompleteResponseMetadata: responseMetadata,
    jobState: entry.currentJobState,
    failedAt: executionStatus === "FAILED_TECHNICALLY" ? timestamp(at) : (research.failedAt || ""),
    cancelledAt: executionStatus === "CANCELLED" ? timestamp(at) : (research.cancelledAt || ""),
    errorLog: [...(Array.isArray(research.errorLog) ? research.errorLog : []), entry],
    missingEvidence: uniqueStrings(research.missingEvidence?.length ? research.missingEvidence : [question]),
    remainingGap: uniqueStrings(research.remainingGap?.length ? research.remainingGap : [question]),
    retryCount: Number(research.retryCount || 0)
  };
  const researchHistory = upsertResearchHistory(state, record);
  const event = {
    id: makeId("event", at),
    entityType: "RESEARCH",
    entityId: record.jobId,
    action: executionStatus,
    timestamp: timestamp(at),
    cycle: state.cycle,
    summary: executionStatus === "FAILED_TECHNICALLY"
      ? `Public research failed technically for: ${record.question}`
      : `Public research was cancelled for: ${record.question}`,
    reason: errorSummary,
    before: null,
    after: cloneValue(record)
  };
  return finishStateEdit({ ...state, questions, researchHistory }, event, at);
}

function decideAfterResearch(state, operation, at) {
  const rationale = requiredReason(operation.rationale || operation.reason);
  const requestedAction = operation.action || "PROCEED_UNDER_UNCERTAINTY";
  if (!["PROCEED_UNDER_UNCERTAINTY", "ROUTE_TO_HUMAN_REAL_WORLD_EVIDENCE"].includes(requestedAction)) {
    throw new ValidationError("Research recovery action is not recognized.");
  }
  const research = operation.research && typeof operation.research === "object" ? operation.research : {};
  const match = state.researchHistory.find((item) => (research.researchKey && item.researchKey === research.researchKey)
    || (research.jobId && item.jobId === research.jobId)
    || (research.responseId && item.responseId === research.responseId));
  if (!match) throw new ValidationError("The research attempt must be recorded before a recovery decision can be made.");
  const allowedOutcome = ["FAILED_TECHNICALLY", "CANCELLED"].includes(match.executionStatus)
    || (match.executionStatus === "COMPLETED" && ["NO_CONCLUSIVE_EVIDENCE_FOUND", "NO_RELEVANT_EVIDENCE_FOUND"].includes(match.evidenceOutcome));
  if (!allowedOutcome) throw new ValidationError("This research outcome does not require a recovery decision.");
  const { questions } = activeQuestionRecord(state, match.question, at);
  const unresolved = uniqueStrings(operation.unresolvedUncertainty?.length
    ? operation.unresolvedUncertainty
    : (match.remainingGap?.length ? match.remainingGap : [match.question]));
  const humanDisposition = requestedAction === "PROCEED_UNDER_UNCERTAINTY" ? "PROCEED_UNDER_UNCERTAINTY" : "CONTINUE";
  const decision = {
    id: makeId("decision", at),
    projectId: state.id,
    cycle: state.cycle,
    timestamp: timestamp(at),
    systemRecommendation: match.executionStatus === "COMPLETED" ? "RESEARCH" : "PUBLIC_RESEARCH_REQUIRED",
    humanDisposition,
    researchRecoveryAction: requestedAction,
    rationale,
    unresolvedUncertainty: unresolved,
    unmetEvidenceThresholds: unresolved,
    knownRisks: uniqueStrings(operation.knownRisks?.length ? operation.knownRisks : ["The decision proceeds without resolving the public evidence gap."]),
    reopeningConditions: uniqueStrings(operation.reopeningConditions?.length ? operation.reopeningConditions : ["Retry public research or add relevant evidence."]),
    status: "ACTIVE"
  };
  const updatedResearch = { ...match, userDecision: requestedAction, userDecisionRationale: rationale, decisionAt: timestamp(at) };
  const researchHistory = upsertResearchHistory(state, updatedResearch);
  const humanGate = requestedAction === "ROUTE_TO_HUMAN_REAL_WORLD_EVIDENCE" ? {
    id: makeId("gate", at), projectId: state.id, cycle: state.cycle, status: "OPEN",
    gateType: "HUMAN_REAL_WORLD_INPUT_REQUIRED", question: match.question,
    requiredInput: `Obtain real-world or private evidence for: ${match.question}`,
    why: rationale, unresolvedUncertainty: unresolved, createdAt: timestamp(at), resolvedAt: "", resolutionType: "", resolution: "", evidenceIds: []
  } : null;
  const event = {
    id: makeId("event", at),
    entityType: "RESEARCH",
    entityId: match.jobId,
    action: requestedAction,
    timestamp: timestamp(at),
    cycle: state.cycle,
    summary: requestedAction === "PROCEED_UNDER_UNCERTAINTY"
      ? "The user chose to proceed without resolving the failed or inconclusive public-research gap."
      : "The user routed the unresolved research gap to human or real-world evidence.",
    reason: rationale,
    before: cloneValue(match),
    after: { research: cloneValue(updatedResearch), ...cloneValue(decision) }
  };
  return finishStateEdit({
    ...state,
    questions,
    researchHistory,
    humanDecisions: [...state.humanDecisions, decision],
    humanGates: humanGate ? [...state.humanGates, humanGate] : state.humanGates,
    currentDisposition: requestedAction === "ROUTE_TO_HUMAN_REAL_WORLD_EVIDENCE" ? "HUMAN_REAL_WORLD_INPUT_REQUIRED" : "PROCEED_UNDER_UNCERTAINTY"
  }, event, at);
}

function linkableClaimEvidenceIds(state) {
  return state.evidence
    .filter((item) => item.status === "ACTIVE" && ACTUAL_EVIDENCE_TYPES.includes(item.intakeType))
    .map((item) => item.id);
}

function upsertProjectClaim(state, operation, at) {
  const reason = requiredReason(operation.reason);
  const result = upsertClaimRecord(state.claimLedger, operation.item || {}, { now: at });
  const event = {
    id: makeId("event", at),
    entityType: "CLAIM",
    entityId: result.claim.id,
    action: result.action,
    timestamp: timestamp(at),
    cycle: state.cycle,
    summary: `${result.action === "CREATED" ? "Added" : "Updated"} claim: ${result.claim.text}`,
    reason,
    before: result.before,
    after: cloneValue(result.claim)
  };
  return {
    ...finishStateEdit({ ...state, claimLedger: result.ledger }, event, at),
    claim: result.claim
  };
}

function upsertProjectClaimEvidenceRelationship(state, operation, at) {
  const reason = requiredReason(operation.reason);
  const result = upsertClaimEvidenceRelationshipRecord(state.claimLedger, operation.item || {}, {
    now: at,
    evidenceIds: linkableClaimEvidenceIds(state),
    knownEvidenceIds: state.evidence.map((item) => item.id)
  });
  if (result.unchanged) {
    return {
      state,
      event: null,
      notebookEntry: null,
      relationship: result.relationship,
      unchanged: true
    };
  }
  const event = {
    id: makeId("event", at),
    entityType: "CLAIM_EVIDENCE_RELATIONSHIP",
    entityId: result.relationship.id,
    action: result.action === "CREATED" ? "LINKED" : "UPDATED",
    timestamp: timestamp(at),
    cycle: state.cycle,
    summary: `${result.action === "CREATED" ? "Linked" : "Updated the link between"} evidence ${result.relationship.evidenceId} ${result.relationship.relationship.toLowerCase()} claim ${result.relationship.claimId}.`,
    reason,
    before: result.before,
    after: cloneValue(result.relationship)
  };
  return {
    ...finishStateEdit({ ...state, claimLedger: result.ledger }, event, at),
    relationship: result.relationship,
    unchanged: false
  };
}

function removeProjectClaimEvidenceRelationship(state, operation, at) {
  const reason = requiredReason(operation.reason);
  const result = removeClaimEvidenceRelationshipRecord(state.claimLedger, operation.id, {
    reason,
    now: at
  });
  const event = {
    id: makeId("event", at),
    entityType: "CLAIM_EVIDENCE_RELATIONSHIP",
    entityId: result.relationship.id,
    action: "UNLINKED",
    timestamp: timestamp(at),
    cycle: state.cycle,
    summary: `Removed the ${result.relationship.relationship.toLowerCase()} link between evidence ${result.relationship.evidenceId} and claim ${result.relationship.claimId}.`,
    reason,
    before: result.before,
    after: cloneValue(result.relationship)
  };
  return {
    ...finishStateEdit({ ...state, claimLedger: result.ledger }, event, at),
    relationship: result.relationship
  };
}

function upsertProjectProvenanceArtifact(state, operation, at) {
  const reason = requiredReason(operation.reason);
  const result = upsertProvenanceArtifactRecord(state.provenanceLedger, operation.item || {}, { now: at });
  const event = {
    id: makeId("event", at),
    entityType: "PROVENANCE_ARTIFACT",
    entityId: result.artifact.id,
    action: result.action,
    timestamp: timestamp(at),
    cycle: state.cycle,
    summary: `${result.action === "CREATED" ? "Added" : "Updated"} provenance artifact: ${result.artifact.title}`,
    reason,
    before: result.before,
    after: cloneValue(result.artifact)
  };
  return {
    ...finishStateEdit({ ...state, provenanceLedger: result.ledger }, event, at),
    artifact: result.artifact
  };
}

function upsertProjectProvenanceRelationship(state, operation, at) {
  const reason = requiredReason(operation.reason);
  const result = upsertProvenanceRelationshipRecord(state.provenanceLedger, operation.item || {}, {
    now: at,
    evidenceIds: state.evidence.map((item) => item.id)
  });
  if (result.unchanged) {
    return {
      state,
      event: null,
      notebookEntry: null,
      relationship: result.relationship,
      unchanged: true
    };
  }
  const event = {
    id: makeId("event", at),
    entityType: "PROVENANCE_RELATIONSHIP",
    entityId: result.relationship.id,
    action: result.action === "CREATED" ? "LINKED" : "UPDATED",
    timestamp: timestamp(at),
    cycle: state.cycle,
    summary: `${result.action === "CREATED" ? "Linked" : "Updated"} ${result.relationship.subjectType.toLowerCase()} ${result.relationship.subjectId} ${result.relationship.relationship.toLowerCase().replaceAll("_", " ")} ${result.relationship.objectType.toLowerCase()} ${result.relationship.objectId}.`,
    reason,
    before: result.before,
    after: cloneValue(result.relationship)
  };
  return {
    ...finishStateEdit({ ...state, provenanceLedger: result.ledger }, event, at),
    relationship: result.relationship,
    unchanged: false
  };
}

function removeProjectProvenanceRelationship(state, operation, at) {
  const reason = requiredReason(operation.reason);
  const result = removeProvenanceRelationshipRecord(state.provenanceLedger, operation.id, {
    reason,
    now: at,
    evidenceIds: state.evidence.map((item) => item.id)
  });
  const event = {
    id: makeId("event", at),
    entityType: "PROVENANCE_RELATIONSHIP",
    entityId: result.relationship.id,
    action: "UNLINKED",
    timestamp: timestamp(at),
    cycle: state.cycle,
    summary: `Retired the ${result.relationship.relationship.toLowerCase().replaceAll("_", " ")} provenance relationship ${result.relationship.id}.`,
    reason,
    before: result.before,
    after: cloneValue(result.relationship)
  };
  return {
    ...finishStateEdit({ ...state, provenanceLedger: result.ledger }, event, at),
    relationship: result.relationship
  };
}

function temporalEndpointOptions(state) {
  return {
    evidenceIds: state.evidence.map((item) => item.id),
    artifactIds: state.provenanceLedger.artifacts.map((item) => item.id)
  };
}

function upsertProjectTemporalAssessment(state, operation, at) {
  const reason = requiredReason(operation.reason);
  const result = upsertTemporalAssessmentRecord(state.temporalLedger, operation.item || {}, {
    now: at,
    ...temporalEndpointOptions(state)
  });
  if (result.unchanged) {
    return {
      state,
      event: null,
      notebookEntry: null,
      assessment: result.assessment,
      unchanged: true
    };
  }
  const event = {
    id: makeId("event", at),
    entityType: "TEMPORAL_ASSESSMENT",
    entityId: result.assessment.id,
    action: result.action,
    timestamp: timestamp(at),
    cycle: state.cycle,
    summary: `${result.action === "CREATED" ? "Added" : "Updated"} ${result.assessment.temporalStatus.toLowerCase()} temporal assessment for ${result.assessment.targetType.toLowerCase()} ${result.assessment.targetId}.`,
    reason,
    before: result.before,
    after: cloneValue(result.assessment)
  };
  return {
    ...finishStateEdit({ ...state, temporalLedger: result.ledger }, event, at),
    assessment: result.assessment,
    unchanged: false
  };
}

function removeProjectTemporalAssessment(state, operation, at) {
  const reason = requiredReason(operation.reason);
  const result = removeTemporalAssessmentRecord(state.temporalLedger, operation.id, {
    reason,
    now: at,
    ...temporalEndpointOptions(state)
  });
  const event = {
    id: makeId("event", at),
    entityType: "TEMPORAL_ASSESSMENT",
    entityId: result.assessment.id,
    action: "REMOVED",
    timestamp: timestamp(at),
    cycle: state.cycle,
    summary: `Retired the temporal assessment for ${result.assessment.targetType.toLowerCase()} ${result.assessment.targetId}.`,
    reason,
    before: result.before,
    after: cloneValue(result.assessment)
  };
  return {
    ...finishStateEdit({ ...state, temporalLedger: result.ledger }, event, at),
    assessment: result.assessment
  };
}

function upsertProjectTemporalRelationship(state, operation, at) {
  const reason = requiredReason(operation.reason);
  const result = upsertTemporalRelationshipRecord(state.temporalLedger, operation.item || {}, {
    now: at,
    ...temporalEndpointOptions(state)
  });
  if (result.unchanged) {
    return {
      state,
      event: null,
      notebookEntry: null,
      relationship: result.relationship,
      unchanged: true
    };
  }
  const event = {
    id: makeId("event", at),
    entityType: "TEMPORAL_RELATIONSHIP",
    entityId: result.relationship.id,
    action: result.action === "CREATED" ? "LINKED" : "UPDATED",
    timestamp: timestamp(at),
    cycle: state.cycle,
    summary: `${result.action === "CREATED" ? "Linked" : "Updated"} ${result.relationship.subjectType.toLowerCase()} ${result.relationship.subjectId} ${result.relationship.relationship.toLowerCase()} ${result.relationship.objectType.toLowerCase()} ${result.relationship.objectId}${result.affectedAssessment ? " with an explicit matching affected-target assessment update" : ""}.`,
    reason,
    before: result.affectedAssessment
      ? {
          relationship: result.before,
          affectedAssessment: result.affectedAssessmentBefore
        }
      : result.before,
    after: result.affectedAssessment
      ? {
          relationship: cloneValue(result.relationship),
          affectedAssessment: cloneValue(result.affectedAssessment)
        }
      : cloneValue(result.relationship)
  };
  return {
    ...finishStateEdit({ ...state, temporalLedger: result.ledger }, event, at),
    relationship: result.relationship,
    affectedAssessment: result.affectedAssessment,
    unchanged: false
  };
}

function removeProjectTemporalRelationship(state, operation, at) {
  const reason = requiredReason(operation.reason);
  const result = removeTemporalRelationshipRecord(state.temporalLedger, operation.id, {
    reason,
    now: at,
    ...temporalEndpointOptions(state)
  });
  const event = {
    id: makeId("event", at),
    entityType: "TEMPORAL_RELATIONSHIP",
    entityId: result.relationship.id,
    action: "UNLINKED",
    timestamp: timestamp(at),
    cycle: state.cycle,
    summary: `Retired the ${result.relationship.relationship.toLowerCase()} temporal relationship ${result.relationship.id}.`,
    reason,
    before: result.before,
    after: cloneValue(result.relationship)
  };
  return {
    ...finishStateEdit({ ...state, temporalLedger: result.ledger }, event, at),
    relationship: result.relationship
  };
}

export function manageProjectState(state, operation, { now = new Date() } = {}) {
  state = normalizeProjectState(state);
  if (!operation || typeof operation !== "object") {
    throw new ValidationError("A state-management operation is required.");
  }
  switch (operation.type) {
    case "UPSERT_ASSUMPTION": return upsertAssumption(state, operation, now);
    case "REMOVE_ASSUMPTION": return removeAssumption(state, operation, now);
    case "UPSERT_EVIDENCE": return upsertEvidence(state, operation, now);
    case "REMOVE_EVIDENCE": return removeEvidence(state, operation, now);
    case "UPSERT_CLAIM": return upsertProjectClaim(state, operation, now);
    case "UPSERT_CLAIM_EVIDENCE_RELATIONSHIP": return upsertProjectClaimEvidenceRelationship(state, operation, now);
    case "REMOVE_CLAIM_EVIDENCE_RELATIONSHIP": return removeProjectClaimEvidenceRelationship(state, operation, now);
    case "UPSERT_PROVENANCE_ARTIFACT": return upsertProjectProvenanceArtifact(state, operation, now);
    case "UPSERT_PROVENANCE_RELATIONSHIP": return upsertProjectProvenanceRelationship(state, operation, now);
    case "REMOVE_PROVENANCE_RELATIONSHIP": return removeProjectProvenanceRelationship(state, operation, now);
    case "UPSERT_TEMPORAL_ASSESSMENT": return upsertProjectTemporalAssessment(state, operation, now);
    case "REMOVE_TEMPORAL_ASSESSMENT": return removeProjectTemporalAssessment(state, operation, now);
    case "UPSERT_TEMPORAL_RELATIONSHIP": return upsertProjectTemporalRelationship(state, operation, now);
    case "REMOVE_TEMPORAL_RELATIONSHIP": return removeProjectTemporalRelationship(state, operation, now);
    case "REOPEN_LOCK": return reopenLock(state, operation, now);
    case "RESOLVE_HUMAN_GATE": return resolveHumanGate(state, operation, now);
    case "OVERRIDE_DISPOSITION": return overrideDisposition(state, operation, now);
    case "OVERRIDE_STAGE": return overrideStage(state, operation, now);
    case "RECORD_RESEARCH_FAILURE": return recordResearchExecution(state, operation, now, "FAILED_TECHNICALLY");
    case "RECORD_RESEARCH_CANCELLATION": return recordResearchExecution(state, operation, now, "CANCELLED");
    case "DECIDE_AFTER_RESEARCH": return decideAfterResearch(state, operation, now);
    default: throw new ValidationError("Unknown state-management operation.");
  }
}

function confidenceLabel(value) {
  const confidence = Number(value);
  if (!Number.isFinite(confidence)) return "Not assessed";
  if (confidence < 0.25) return "Very low";
  if (confidence < 0.5) return "Low";
  if (confidence < 0.75) return "Moderate";
  if (confidence < 0.9) return "High";
  return "Very high";
}

function latestEvaluation(state) {
  return trustedCycleEntries(state).slice().reverse().find((entry) => entry.evidenceEvaluation)?.evidenceEvaluation || null;
}

function isSyntheticOrSimulatedForReport(item) {
  return item?.status === "ACTIVE"
    && (item.evidenceAuthenticity === "SYNTHETIC_SIMULATED" || evidenceContainsSyntheticMarker(item));
}

function reportEvidenceItem(item, { synthetic = false } = {}) {
  return {
    id: item.id,
    claim: item.claim,
    intakeType: item.intakeType,
    evidenceAuthenticity: synthetic ? "SYNTHETIC_SIMULATED" : (item.evidenceAuthenticity || "UNKNOWN_NOT_ASSESSED"),
    permittedUse: synthetic ? "TEST_OR_METHOD_VALIDATION_ONLY" : "EVIDENCE_EVALUATION",
    canValidateRealWorldProposition: !synthetic,
    canSatisfyHumanGate: !synthetic,
    provenanceOrigin: item.provenanceOrigin,
    sourceClassification: item.sourceClassification,
    sourceCategory: item.sourceCategory,
    sourceTitle: item.sourceTitle || "",
    sourceUrl: item.sourceUrl || "",
    reliability: item.reliability,
    relationship: item.relationship,
    population: item.population || "",
    collectionMethod: item.collectionMethod,
    assessment: item.assessment,
    questionRefs: item.questionRefs || [],
    assumptionIds: item.assumptionIds || []
  };
}

function temporalAnalysisContext(state) {
  return {
    temporalLedger: state.temporalLedger,
    provenanceLedger: state.provenanceLedger,
    claimLedger: state.claimLedger,
    evidenceItems: state.evidence,
    linkableEvidenceIds: linkableClaimEvidenceIds(state),
    eligibleEvidenceIds: actualEvidence(state).map((item) => item.id)
  };
}

export function analyzeProjectTemporalTarget(state, {
  targetType,
  targetId,
  asOf,
  purpose = "CURRENT_STATE"
}) {
  state = normalizeProjectState(state);
  return analyzeTemporalIntegrity(state.temporalLedger, {
    evidenceItems: state.evidence,
    provenanceLedger: state.provenanceLedger,
    targetRefs: [{ targetType, targetId }],
    asOf,
    purpose
  });
}

export function analyzeProjectSourceChainTemporalIntegrity(state, {
  evidenceId,
  asOf,
  purpose = "CURRENT_STATE"
}) {
  state = normalizeProjectState(state);
  return analyzeSourceChainTemporalIntegrity({
    ...temporalAnalysisContext(state),
    evidenceId,
    asOf,
    purpose
  });
}

export function analyzeProjectClaimTemporalIntegrity(state, {
  claimId,
  asOf,
  purpose = "CURRENT_STATE"
}) {
  state = normalizeProjectState(state);
  return analyzeClaimTemporalIntegrity({
    ...temporalAnalysisContext(state),
    claimId,
    asOf,
    purpose
  });
}

function createProvenanceReport(state) {
  const linkableEvidenceIds = linkableClaimEvidenceIds(state);
  const eligibleEvidenceIds = actualEvidence(state).map((item) => item.id);
  const analysis = analyzeIndependentEvidenceChains(state.provenanceLedger, {
    evidenceItems: state.evidence,
    evidenceIds: linkableEvidenceIds,
    eligibleEvidenceIds
  });
  const claimAnalyses = state.claimLedger.claims.map((claim) =>
    analyzeClaimIndependentEvidenceChains({
      provenanceLedger: state.provenanceLedger,
      claimLedger: state.claimLedger,
      evidenceItems: state.evidence,
      claimId: claim.id,
      linkableEvidenceIds,
      eligibleEvidenceIds
    })
  );
  return {
    version: state.provenanceLedger.version,
    interpretationPolicy: "EXPLICIT_LINEAGE_ONLY_NO_SOURCE_INDEPENDENCE_INFERENCE",
    relationshipDirection: "SUBJECT_CHILD_TO_OBJECT_PARENT_OR_REFERENCED_ORIGIN",
    artifacts: state.provenanceLedger.artifacts.map((item) => cloneValue(item)),
    relationships: state.provenanceLedger.relationships.map((item) => cloneValue(item)),
    analysis,
    claimAnalyses,
    summary: {
      artifactCount: state.provenanceLedger.artifacts.length,
      evidenceAnalyzedCount: analysis.evidenceMappings.length,
      knownIndependentChainCount: analysis.knownIndependentChainCount,
      unresolvedEvidenceCount: analysis.unresolvedEvidenceIds.length,
      derivativeArtifactCount: state.provenanceLedger.artifacts.filter((item) => item.originRole === "DERIVATIVE").length,
      derivativeRelationshipCount: state.provenanceLedger.relationships.filter((item) =>
        item.status === "ACTIVE" && MATERIAL_DEPENDENCY_RELATIONSHIPS.includes(item.relationship)
      ).length,
      citationCycleCount: analysis.citationCycleWarnings.length,
      syntheticOrOtherwiseIneligibleEvidenceCount: analysis.ineligibleForRealWorldValidationEvidenceIds.length
    }
  };
}

function createTemporalReport(state, asOf) {
  const context = temporalAnalysisContext(state);
  const activeEvidenceIds = state.evidence
    .filter((item) => item.status === "ACTIVE")
    .map((item) => item.id);
  const targetRefs = [
    ...activeEvidenceIds.map((targetId) => ({ targetType: "EVIDENCE_ITEM", targetId })),
    ...state.provenanceLedger.artifacts.map((item) => ({
      targetType: "PROVENANCE_ARTIFACT",
      targetId: item.id
    }))
  ];
  const analysis = analyzeTemporalIntegrity(state.temporalLedger, {
    evidenceItems: state.evidence,
    provenanceLedger: state.provenanceLedger,
    targetRefs,
    asOf,
    purpose: "CURRENT_STATE"
  });
  const sourceChainAnalyses = activeEvidenceIds.map((evidenceId) =>
    analyzeSourceChainTemporalIntegrity({
      ...context,
      evidenceId,
      asOf,
      purpose: "CURRENT_STATE"
    })
  );
  const claimAnalyses = state.claimLedger.claims.map((claim) =>
    analyzeClaimTemporalIntegrity({
      ...context,
      claimId: claim.id,
      asOf,
      purpose: "CURRENT_STATE"
    })
  );
  const activeAssessmentByEvidenceId = new Map(state.temporalLedger.assessments
    .filter((item) => item.status === "ACTIVE" && item.targetType === "EVIDENCE_ITEM")
    .map((item) => [item.targetId, item]));
  const syntheticEvidenceIds = state.evidence
    .filter(isSyntheticOrSimulatedForReport)
    .map((item) => item.id);
  const warningCodes = new Set([
    ...analysis.intervalConflicts.map((item) => item.code),
    ...analysis.relationshipAssessmentConflicts.map((item) => item.code),
    ...analysis.unresolvedCorrectingSourceWarnings.map((item) => item.code),
    ...analysis.unresolvedSupersedingSourceWarnings.map((item) => item.code),
    ...analysis.temporalCycleWarnings.map((item) => item.code),
    ...sourceChainAnalyses.flatMap((item) => item.warnings),
    ...claimAnalyses.flatMap((item) => item.warnings)
  ]);
  return {
    version: state.temporalLedger.version,
    interpretationPolicy: "EXPLICIT_ASSESSMENTS_ONLY_WARNING_WITHOUT_AUTOMATIC_EVIDENCE_OR_CLAIM_MUTATION",
    relationshipDirection: "SUBJECT_NEWER_OR_CORRECTING_TO_OBJECT_OLDER_OR_AFFECTED",
    analysisAsOf: asOf,
    assessments: state.temporalLedger.assessments.map((item) => cloneValue(item)),
    relationships: state.temporalLedger.relationships.map((item) => cloneValue(item)),
    analysis,
    sourceChainAnalyses,
    claimAnalyses,
    summary: {
      assessmentCount: state.temporalLedger.assessments.length,
      activeAssessmentCount: state.temporalLedger.assessments.filter((item) => item.status === "ACTIVE").length,
      assessedActiveEvidenceCount: activeEvidenceIds.filter((id) => activeAssessmentByEvidenceId.has(id)).length,
      unassessedActiveEvidenceCount: activeEvidenceIds.filter((id) => !activeAssessmentByEvidenceId.has(id)).length,
      currentCount: analysis.statusGroups.CURRENT.length,
      historicalCount: analysis.statusGroups.HISTORICAL.length,
      outdatedCount: analysis.statusGroups.OUTDATED.length,
      correctedCount: analysis.statusGroups.CORRECTED.length,
      supersededCount: analysis.statusGroups.SUPERSEDED.length,
      unknownCount: analysis.statusGroups.UNKNOWN.length,
      correctionRelationshipCount: state.temporalLedger.relationships.filter((item) =>
        item.status === "ACTIVE" && item.relationship === "CORRECTS"
      ).length,
      supersessionRelationshipCount: state.temporalLedger.relationships.filter((item) =>
        item.status === "ACTIVE" && item.relationship === "SUPERSEDES"
      ).length,
      warningCount: warningCodes.size,
      syntheticOrOtherwiseIneligibleEvidenceCount: syntheticEvidenceIds.length
    }
  };
}

/**
 * Produces a conservative, structured business report from the persisted project
 * record. The report never upgrades an assumption into a finding merely because
 * a cycle completed.
 */
export function createProjectReport(state, { now = new Date() } = {}) {
  state = normalizeProjectState(state);
  const reportGeneratedAt = timestamp(now);
  const cycles = trustedCycleEntries(state);
  const lastCycle = cycles.at(-1);
  const evaluation = latestEvaluation(state);
  // Report generation is deliberately defensive. A legacy or inconsistent item
  // can carry REAL_WORLD metadata while its own text explicitly says it is
  // synthetic. Quarantine that contradiction in the report without rewriting
  // canonical project state or changing the reasoning reducer.
  const reportSyntheticEvidence = state.evidence.filter(isSyntheticOrSimulatedForReport);
  const evidence = actualEvidence(state).filter((item) => !isSyntheticOrSimulatedForReport(item));
  const syntheticOrSimulated = state.evidence
    .filter(isSyntheticOrSimulatedForReport)
    .map((item) => reportEvidenceItem(item, { synthetic: true }));
  const supporting = evidence.filter((item) => item.relationship === "SUPPORTS").map(reportEvidenceItem);
  const contradictory = evidence.filter((item) => item.relationship === "CONTRADICTS").map(reportEvidenceItem);
  const mixed = evidence.filter((item) => item.relationship === "MIXED").map(reportEvidenceItem);
  const contextual = evidence.filter((item) => ["NEUTRAL_CONTEXT_ONLY", "NONE_UNLINKED"].includes(item.relationship)).map(reportEvidenceItem);
  const assumptions = state.assumptions.filter((item) => !item.removedAt);
  const remainingAssumptions = assumptions.filter((item) => !["SUPPORTED", "REJECTED"].includes(item.status)).map((item) => ({
    id: item.id,
    assumption: item.text,
    status: item.status,
    confidence: item.confidence,
    confidenceLabel: confidenceLabel(item.confidence),
    confidenceOrigin: item.confidenceOrigin,
    rationale: item.rationale,
    evidenceIds: item.evidenceIds || []
  }));
  const evidenceGaps = uniqueStrings([
    ...(evaluation?.gaps || []),
    ...(lastCycle?.remainingUncertainty || []),
    ...((state.researchHistory || []).at(-1)?.remainingGap || [])
  ]);
  const poorApplicability = evidence
    .filter((item) => !item.population || /broad|general|different|unknown/i.test(`${item.population} ${item.assessment}`))
    .map(reportEvidenceItem);
  const insufficientlySpecific = evidence
    .filter((item) => /broad|indirect|not specific|insufficient|does not establish|cannot establish/i.test(item.assessment || ""))
    .map(reportEvidenceItem);
  const latestHumanDecision = state.humanDecisions.at(-1) || null;
  const evidenceById = new Map(state.evidence.map((item) => [item.id, item]));
  const claimLedgerReport = {
    version: state.claimLedger.version,
    statusPolicy: "EXPLICIT_NOT_INFERRED_FROM_RELATIONSHIPS",
    claims: state.claimLedger.claims.map((claim) => cloneValue(claim)),
    evidenceRelationships: state.claimLedger.evidenceRelationships.map((relationship) => {
      const item = evidenceById.get(relationship.evidenceId);
      const synthetic = isSyntheticOrSimulatedForReport(item);
      return {
        ...cloneValue(relationship),
        evidence: item ? {
          id: item.id,
          claim: item.claim,
          status: item.status,
          evidenceAuthenticity: synthetic ? "SYNTHETIC_SIMULATED" : item.evidenceAuthenticity,
          eligibleForRealWorldValidation: item.status === "ACTIVE" && !synthetic
        } : null
      };
    })
  };
  const provenanceReport = createProvenanceReport(state);
  const temporalReport = createTemporalReport(state, reportGeneratedAt);
  const propositionStatus = evidence.length === 0
    ? "INSUFFICIENT_EVIDENCE"
    : (evaluation?.propositionStatus || "UNRESOLVED");
  const evaluationThresholdMet = evidence.length > 0 && Boolean(evaluation?.evaluationThresholdMet);
  const disposition = latestHumanDecision?.humanDisposition || state.currentDisposition;
  const strongestSupport = evaluation?.disconfirmation?.strongestSupportingEvidence || supporting[0]?.claim || "No material supporting evidence has been established.";
  const strongestContradiction = evaluation?.disconfirmation?.strongestContradictoryEvidence || contradictory[0]?.claim || "No material contradictory finding is currently recorded.";

  return {
    reportVersion: "1.0",
    generatedAt: reportGeneratedAt,
    projectId: state.id,
    domainProfile: state.domainProfile,
    domainProfileVersion: state.domainProfileVersion,
    title: state.title,
    executiveSummary: evidence.length === 0
      ? `The project remains at ${state.pecPhase.label}. No observed evidence is recorded for real-world validation${reportSyntheticEvidence.length ? `; ${reportSyntheticEvidence.length} synthetic or simulated item${reportSyntheticEvidence.length === 1 ? " is" : "s are"} retained for test or method validation only` : ""}, so the current proposition is not validated and the report preserves it as an open question.`
      : `Rethink evaluated ${evidence.length} observed evidence item${evidence.length === 1 ? "" : "s"}. The current proposition status is ${propositionStatus.replaceAll("_", " ").toLowerCase()}, and the current disposition is ${disposition.replaceAll("_", " ").toLowerCase()}.`,
    problemDefinition: state.problemDefinition,
    claimLedger: claimLedgerReport,
    provenance: provenanceReport,
    temporalIntegrity: temporalReport,
    currentDisposition: {
      systemRecommendation: lastCycle?.disposition || state.currentDisposition,
      humanDisposition: latestHumanDecision?.humanDisposition || "",
      effectiveDisposition: disposition,
      rationale: latestHumanDecision?.rationale || lastCycle?.nextActionWhy || "No separate human override is active."
    },
    keyFindings: uniqueStrings(cycles.flatMap((entry) => entry.findings || [])),
    propositionStatus: {
      status: propositionStatus,
      rationale: evidence.length === 0 && syntheticOrSimulated.length
        ? "Only synthetic or simulated test data is recorded. It cannot validate a real-world proposition or satisfy a Human Gate."
        : (evaluation?.propositionStatusRationale || "No completed validation evaluation has established the proposition."),
      validationProcessStatus: evaluationThresholdMet ? "EVALUATION_THRESHOLD_MET" : "EVALUATION_THRESHOLD_NOT_MET",
      validationProcessRationale: evidence.length === 0 && syntheticOrSimulated.length
        ? "Synthetic or simulated items are excluded from real-world evidence thresholds."
        : (evaluation?.evaluationThresholdRationale || "A complete validation evaluation has not yet been recorded."),
      disconfirmationFlag: evaluation?.disconfirmation?.flag || "DISCONFIRMATION_SEARCH_INCOMPLETE"
    },
    evidenceBase: {
      totalObservedItems: evidence.length,
      supporting,
      contradictory,
      mixed,
      contextOnly: contextual,
      syntheticOrSimulated,
      absenceOfEvidence: evidence.length === 0 ? ["No observed evidence is currently recorded."] : [],
      evidenceOfAbsence: contradictory.filter((item) => /absent|no |none|not found|low prevalence|uncommon/i.test(item.claim)),
      insufficientlySpecific,
      poorPopulationApplicability: poorApplicability
    },
    sourceQualityAssessment: evidence.map((item) => ({
      evidenceId: item.id,
      reliability: item.reliability,
      sourceClassification: item.sourceClassification,
      sourceCategory: item.sourceCategory,
      limitation: item.assessment
    })),
    supportedConclusions: evaluation && ["VALIDATED", "PROVISIONALLY_SUPPORTED", "PARTIALLY_SUPPORTED"].includes(propositionStatus)
      ? [strongestSupport]
      : [],
    contradictoryOrLimitingEvidence: uniqueStrings([strongestContradiction, evaluation?.disconfirmation?.strongestLimitation]),
    remainingAssumptions,
    evidenceGaps,
    researchConducted: (state.researchHistory || []).map((item) => ({
      question: item.question,
      status: item.status,
      executionStatus: item.executionStatus,
      evidenceOutcome: item.evidenceOutcome,
      jobId: item.jobId || "",
      retryCount: item.retryCount || 0,
      propositionStatus: item.propositionStatus || "UNRESOLVED",
      supportingSearch: item.researchScope?.supportingSearch || "",
      disconfirmingSearch: item.researchScope?.disconfirmingSearch || "",
      sourceClassesSearched: item.sourceClassesSearched || [],
      sourceCategoriesSearched: item.sourceCategoriesSearched || [],
      findings: item.findings || [],
      missingEvidence: item.missingEvidence || [],
      citations: item.citations || [],
      errorLog: (item.errorLog || []).map((entry) => ({
        timestamp: entry.timestamp,
        jobId: entry.jobId,
        humanReadableSummary: entry.humanReadableSummary,
        technicalError: entry.technicalError,
        errorCode: entry.errorCode || "",
        responseMetadata: entry.responseMetadata || null,
        retryAttempt: entry.retryAttempt,
        currentJobState: entry.currentJobState
      })),
      userDecision: item.userDecision || "",
      userDecisionRationale: item.userDecisionRationale || ""
    })),
    realWorldValidationRequired: ["HUMAN_REAL_WORLD_INPUT_REQUIRED", "HUMAN_INPUT_REQUIRED"].includes(state.currentDisposition)
      ? uniqueStrings([lastCycle?.nextRecommendedAction, ...(lastCycle?.remainingUncertainty || [])])
      : [],
    risksAndLimitations: uniqueStrings([
      ...cycles.flatMap((entry) => entry.limitations || []),
      ...(evaluation?.disconfirmation?.flag === "DISCONFIRMATION_SEARCH_INCOMPLETE" ? ["A documented attempt to find disconfirming evidence is incomplete."] : []),
      ...(poorApplicability.length ? ["Some evidence has unknown, broad, or poorly matched population applicability."] : []),
      ...(syntheticOrSimulated.length ? ["Synthetic or simulated test results remain traceable but are excluded from real-world proposition validation."] : []),
      ...(provenanceReport.summary.unresolvedEvidenceCount
        ? [`${provenanceReport.summary.unresolvedEvidenceCount} active evidence item${provenanceReport.summary.unresolvedEvidenceCount === 1 ? " has" : "s have"} unresolved or partial provenance and is not treated as a known independent source chain.`]
        : []),
      ...(provenanceReport.summary.citationCycleCount
        ? ["One or more citation cycles are preserved as warnings and do not establish material derivation or source independence."]
        : [])
    ]),
    humanDecisionsAndOverrides: state.humanDecisions.map((item) => cloneValue(item)),
    recommendedNextAction: {
      disposition: lastCycle?.disposition || state.currentDisposition,
      action: lastCycle?.nextRecommendedAction || "Run Rethink to identify the next highest-leverage uncertainty.",
      why: lastCycle?.nextActionWhy || "No completed cycle currently defines a more specific next action."
    },
    confidenceReadinessSummary: assumptions.map((item) => ({
      assumptionId: item.id,
      assumption: item.text,
      confidence: item.confidence,
      confidenceLabel: confidenceLabel(item.confidence),
      origin: item.confidenceOrigin,
      rationale: item.rationale
    }))
  };
}
