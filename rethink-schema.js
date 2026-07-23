export const PEC_PHASES = Object.freeze([
  { index: 0, id: "CAPTURE", label: "Capture" },
  { index: 1, id: "DEFINE", label: "Define" },
  { index: 2, id: "ASSUMPTIONS", label: "Assumptions" },
  { index: 3, id: "ADVERSARIAL_REVIEW", label: "Adversarial Review" },
  { index: 4, id: "ROOT_CAUSE", label: "Root Cause" },
  { index: 5, id: "SUCCESS_METRICS", label: "Success Metrics" },
  { index: 6, id: "OPPORTUNITY_COST", label: "Opportunity Cost" },
  { index: 7, id: "OPTION_PRESERVATION", label: "Option Preservation" },
  { index: 8, id: "MVP_PLANNING", label: "MVP Planning" },
  { index: 9, id: "TESTING", label: "Testing" },
  { index: 10, id: "KNOWLEDGE_CAPTURE", label: "Knowledge Capture" },
  { index: 11, id: "DECISION", label: "Decision" }
]);

export const METHODS = MODULE_IDS;

export const DISPOSITIONS = Object.freeze([
  "CONTINUE",
  "RESEARCH",
  "VALIDATE",
  "STRESS_TEST",
  "BUILD_MVP",
  "TEST",
  "ITERATE",
  "PIVOT",
  "SPLIT",
  "ARCHIVE",
  "KILL",
  "SHIP",
  "IMPLEMENT",
  "PUBLISH",
  "SCALE",
  "PUBLIC_RESEARCH_REQUIRED",
  "HUMAN_REAL_WORLD_INPUT_REQUIRED",
  "HUMAN_INPUT_REQUIRED",
  "PROCEED_UNDER_UNCERTAINTY",
  "HOLD",
  "STOP"
]);

export const EVIDENCE_GATES = Object.freeze([
  "NONE",
  "USE_EXISTING_EVIDENCE",
  "PUBLIC_RESEARCH_REQUIRED",
  "HUMAN_REAL_WORLD_INPUT_REQUIRED"
]);

export const EVIDENCE_INTAKE_TYPES = Object.freeze([
  "OBSERVED_EVIDENCE",
  "VERIFIED_FINDING",
  "INFERRED_STATEMENT",
  "ASSUMPTION",
  "RESEARCH_QUESTION",
  "PLANNED_TEST",
  "TEST_RESULT",
  "USER_ASSERTION",
  "ANECDOTAL_EVIDENCE",
  "PUBLIC_SOURCE_FINDING",
  "EXPERT_OPINION",
  "PRIVATE_INTERNAL_DATA",
  "DERIVED_CALCULATION",
  "MODEL_GENERATED_HYPOTHESIS"
]);

export const EVIDENCE_PROVENANCE_ORIGINS = Object.freeze([
  "USER_INPUT",
  "EXTERNAL_SOURCE",
  "MODEL_INFERENCE",
  "SYSTEM_CALCULATION",
  "REAL_WORLD_TEST_OBSERVATION",
  "INTERNAL_PROJECT_DATA"
]);

export const SOURCE_CLASSIFICATIONS = Object.freeze([
  "PRIMARY_SOURCE",
  "SECONDARY_SOURCE",
  "TERTIARY_AGGREGATED_SOURCE",
  "UNKNOWN_NOT_APPLICABLE"
]);

export const SOURCE_CATEGORIES = Object.freeze([
  "GOVERNMENT",
  "REGULATORY_LEGAL",
  "ACADEMIC_PEER_REVIEWED",
  "NONPROFIT_RESEARCH",
  "INDUSTRY_ASSOCIATION",
  "MARKET_RESEARCH",
  "CORPORATE_DISCLOSURE",
  "COMPANY_WEBSITE",
  "JOURNALISM",
  "PUBLIC_DATASET",
  "INTERNAL_COMPANY_DATA",
  "SURVEY",
  "INTERVIEW",
  "DIRECT_OBSERVATION",
  "EXPERIMENT_PILOT",
  "OPERATIONAL_TRANSACTIONAL_DATA",
  "OTHER",
  "UNKNOWN"
]);

export const COLLECTION_METHODS = Object.freeze([
  "SURVEY",
  "INTERVIEW",
  "FOCUS_GROUP",
  "DIRECT_OBSERVATION",
  "EXPERIMENT_PILOT",
  "FIELD_TEST",
  "ADMINISTRATIVE_OPERATIONAL_DATA",
  "TRANSACTIONAL_DATA",
  "DOCUMENT_RECORDS_REVIEW",
  "PUBLIC_DATASET_ANALYSIS",
  "SECONDARY_DATA_ANALYSIS",
  "LITERATURE_RESEARCH_REVIEW",
  "WEB_PUBLIC_SOURCE_RESEARCH",
  "STATISTICAL_MODELING_ESTIMATION",
  "CASE_STUDY",
  "MIXED_METHODS",
  "OTHER",
  "UNKNOWN_NOT_REPORTED"
]);

export const EVIDENCE_RELIABILITY = Object.freeze(["INFER_AUTOMATICALLY", "UNKNOWN_NOT_ASSESSED", "LOW", "MODERATE", "HIGH"]);
export const EVIDENCE_RELATIONSHIPS = Object.freeze(["INFER_AUTOMATICALLY", "SUPPORTS", "CONTRADICTS", "MIXED", "NEUTRAL_CONTEXT_ONLY", "NONE_UNLINKED"]);
export const EVIDENCE_REVIEW_CLASSES = Object.freeze(["MATERIAL", "RELEVANT", "IRRELEVANT", "DISCOUNTED"]);

export const CONFIDENCE_ORIGINS = Object.freeze(["FRAMEWORK_DEFINED", "PROJECT_DEFINED", "USER_DEFINED", "MODEL_GENERATED", "LEGACY_UNSPECIFIED"]);
export const PROPOSITION_STATUSES = Object.freeze(["VALIDATED", "PROVISIONALLY_SUPPORTED", "PARTIALLY_SUPPORTED", "UNRESOLVED", "CONTRADICTED", "FALSIFIED", "INSUFFICIENT_EVIDENCE"]);
export const DISCONFIRMATION_SEARCH_STATUSES = Object.freeze(["NOT_SEARCHED", "SEARCHED_FOUND", "SEARCHED_NOT_FOUND", "UNAVAILABLE", "INCONCLUSIVE", "NOT_REQUIRED"]);
export const DISCONFIRMATION_FLAGS = Object.freeze(["COMPLETE", "DISCONFIRMATION_SEARCH_INCOMPLETE", "NOT_APPLICABLE"]);

export const RESEARCH_EXECUTION_STATUSES = Object.freeze([
  "PENDING",
  "COMPLETED",
  "FAILED_TECHNICALLY",
  "CANCELLED"
]);

export const RESEARCH_EVIDENCE_OUTCOMES = Object.freeze([
  "SUPPORTING_EVIDENCE_FOUND",
  "DISCONFIRMING_EVIDENCE_FOUND",
  "MIXED_EVIDENCE_FOUND",
  "NO_CONCLUSIVE_EVIDENCE_FOUND",
  "NO_RELEVANT_EVIDENCE_FOUND",
  "NOT_EVALUATED"
]);

export const HUMAN_DISPOSITIONS = Object.freeze([
  "CONTINUE",
  "PIVOT",
  "HOLD",
  "STOP",
  "SHIP",
  "IMPLEMENT",
  "PROCEED_UNDER_UNCERTAINTY"
]);

export const ASSUMPTION_STATUSES = Object.freeze([
  "UNTESTED",
  "CHALLENGED",
  "SUPPORTED",
  "REJECTED"
]);

export const EVIDENCE_QUALITY = Object.freeze([
  "NONE",
  "WEAK",
  "MIXED",
  "MODERATE",
  "STRONG"
]);

export const SOURCE_TYPES = Object.freeze([
  "MODEL_REASONING",
  "EXTERNAL_RESEARCH",
  "MIXED"
]);

const stringArray = {
  type: "array",
  items: { type: "string" }
};

export const ROUTING_OUTPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  properties: {
    projectId: { type: "string" },
    highestLeverageQuestion: { type: "string" },
    selectedMethod: { type: "string", enum: METHODS },
    whyQuestionNow: { type: "string" },
    whyMethod: { type: "string" },
    resolutionCriteria: { type: "string" },
    evidenceNeeded: stringArray,
    requiresExternalResearch: { type: "boolean" },
    evidenceGate: { type: "string", enum: EVIDENCE_GATES },
    evidenceState: {
      type: "object",
      additionalProperties: false,
      properties: {
        relevantEvidenceIds: stringArray,
        consideredEvidenceCount: { type: "integer", minimum: 0 },
        unresolvedEvidenceGaps: stringArray,
        summary: { type: "string" }
      },
      required: ["relevantEvidenceIds", "consideredEvidenceCount", "unresolvedEvidenceGaps", "summary"]
    },
    loopDetected: { type: "boolean" },
    executionBlocked: { type: "boolean" },
    recommendedPecPhase: {
      type: "string",
      enum: PEC_PHASES.map((phase) => phase.id)
    }
  },
  required: [
    "projectId",
    "highestLeverageQuestion",
    "selectedMethod",
    "whyQuestionNow",
    "whyMethod",
    "resolutionCriteria",
    "evidenceNeeded",
    "requiresExternalResearch",
    "evidenceGate",
    "evidenceState",
    "loopDetected",
    "executionBlocked",
    "recommendedPecPhase"
  ]
});

export const CYCLE_OUTPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  properties: {
    projectId: { type: "string" },
    reasoning: {
      type: "object",
      additionalProperties: false,
      properties: {
        conclusion: { type: "string" },
        findings: stringArray,
        evidenceQuality: { type: "string", enum: EVIDENCE_QUALITY },
        limitations: stringArray,
        sourceType: { type: "string", enum: SOURCE_TYPES }
      },
      required: ["conclusion", "findings", "evidenceQuality", "limitations", "sourceType"]
    },
    learned: stringArray,
    stateChanges: stringArray,
    assumptionChanges: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          assumption: { type: "string" },
          status: { type: "string", enum: ASSUMPTION_STATUSES },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          confidenceOrigin: { type: "string", enum: CONFIDENCE_ORIGINS },
          rationale: { type: "string" }
        },
        required: ["assumption", "status", "confidence", "confidenceOrigin", "rationale"]
      }
    },
    newEvidence: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          claim: { type: "string" },
          provenanceOrigin: { type: "string", enum: EVIDENCE_PROVENANCE_ORIGINS },
          sourceClassification: { type: "string", enum: SOURCE_CLASSIFICATIONS },
          sourceCategory: { type: "string", enum: SOURCE_CATEGORIES },
          sourceTitle: { type: "string" },
          sourceUrl: { type: "string" },
          assessment: { type: "string" },
          intakeType: { type: "string", enum: EVIDENCE_INTAKE_TYPES },
          reliability: { type: "string", enum: EVIDENCE_RELIABILITY },
          relationship: { type: "string", enum: EVIDENCE_RELATIONSHIPS },
          sourceDate: { type: "string" },
          population: { type: "string" },
          collectionMethod: { type: "string", enum: COLLECTION_METHODS },
          methodDetails: { type: "string" },
          observation: { type: "string" },
          assumptionIds: stringArray,
          questionRefs: stringArray
        },
        required: ["claim", "provenanceOrigin", "sourceClassification", "sourceCategory", "sourceTitle", "sourceUrl", "assessment", "intakeType", "reliability", "relationship", "sourceDate", "population", "collectionMethod", "methodDetails", "observation", "assumptionIds", "questionRefs"]
      }
    },
    evidenceEvaluation: {
      type: "object",
      additionalProperties: false,
      properties: {
        considered: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              evidenceId: { type: "string" },
              classification: { type: "string", enum: EVIDENCE_REVIEW_CLASSES },
              relationship: { type: "string", enum: EVIDENCE_RELATIONSHIPS },
              rationale: { type: "string" }
            },
            required: ["evidenceId", "classification", "relationship", "rationale"]
          }
        },
        evaluationThresholdMet: { type: "boolean" },
        evaluationThresholdRationale: { type: "string" },
        propositionStatus: { type: "string", enum: PROPOSITION_STATUSES },
        propositionStatusRationale: { type: "string" },
        gaps: stringArray,
        disconfirmation: {
          type: "object",
          additionalProperties: false,
          properties: {
            searchStatus: { type: "string", enum: DISCONFIRMATION_SEARCH_STATUSES },
            strongestSupportingEvidence: { type: "string" },
            strongestContradictoryEvidence: { type: "string" },
            strongestLimitation: { type: "string" },
            evidenceThatWouldChangeConclusion: { type: "string" },
            flag: { type: "string", enum: DISCONFIRMATION_FLAGS }
          },
          required: ["searchStatus", "strongestSupportingEvidence", "strongestContradictoryEvidence", "strongestLimitation", "evidenceThatWouldChangeConclusion", "flag"]
        }
      },
      required: ["considered", "evaluationThresholdMet", "evaluationThresholdRationale", "propositionStatus", "propositionStatusRationale", "gaps", "disconfirmation"]
    },
    remainingUncertainty: stringArray,
    nextAction: {
      type: "object",
      additionalProperties: false,
      properties: {
        disposition: { type: "string", enum: DISPOSITIONS },
        action: { type: "string" },
        why: { type: "string" }
      },
      required: ["disposition", "action", "why"]
    },
    pecPhaseAfter: {
      type: "string",
      enum: PEC_PHASES.map((phase) => phase.id)
    },
    problemDefinition: { type: "string" },
    tangents: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          observation: { type: "string" },
          classification: {
            type: "string",
            enum: [
              "MINOR_OBSERVATION",
              "FUTURE_INVESTIGATION",
              "CURRENT_PROJECT_MODIFICATION",
              "POTENTIAL_STANDALONE_PROJECT"
            ]
          },
          link: { type: "string" }
        },
        required: ["observation", "classification", "link"]
      }
    }
  },
  required: [
    "projectId",
    "reasoning",
    "learned",
    "stateChanges",
    "assumptionChanges",
    "newEvidence",
    "evidenceEvaluation",
    "remainingUncertainty",
    "nextAction",
    "pecPhaseAfter",
    "problemDefinition",
    "tangents"
  ]
});

export class ValidationError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = "ValidationError";
    this.details = details;
  }
}

export function getPecPhase(idOrIndex) {
  const phase = typeof idOrIndex === "number"
    ? PEC_PHASES.find((candidate) => candidate.index === idOrIndex)
    : PEC_PHASES.find((candidate) => candidate.id === idOrIndex);

  if (!phase) {
    throw new ValidationError(`Unknown PEC phase: ${idOrIndex}`);
  }

  return { ...phase };
}

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError(`${label} must be an object.`);
  }
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ValidationError(`${label} must be a non-empty string.`);
  }
}

function requireStringArray(value, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new ValidationError(`${label} must be an array of strings.`);
  }
}

function requireEnum(value, allowed, label) {
  if (!allowed.includes(value)) {
    throw new ValidationError(`${label} must be one of: ${allowed.join(", ")}.`);
  }
}

export function validateRoutingOutput(value) {
  requireObject(value, "Routing output");
  requireString(value.projectId, "projectId");
  requireString(value.highestLeverageQuestion, "highestLeverageQuestion");
  requireEnum(value.selectedMethod, METHODS, "selectedMethod");
  requireString(value.whyQuestionNow, "whyQuestionNow");
  requireString(value.whyMethod, "whyMethod");
  requireString(value.resolutionCriteria, "resolutionCriteria");
  requireStringArray(value.evidenceNeeded, "evidenceNeeded");
  if (typeof value.requiresExternalResearch !== "boolean") {
    throw new ValidationError("requiresExternalResearch must be a boolean.");
  }
  requireEnum(value.evidenceGate, EVIDENCE_GATES, "evidenceGate");
  requireObject(value.evidenceState, "evidenceState");
  requireStringArray(value.evidenceState.relevantEvidenceIds, "evidenceState.relevantEvidenceIds");
  if (!Number.isInteger(value.evidenceState.consideredEvidenceCount) || value.evidenceState.consideredEvidenceCount < 0) {
    throw new ValidationError("evidenceState.consideredEvidenceCount must be a non-negative integer.");
  }
  requireStringArray(value.evidenceState.unresolvedEvidenceGaps, "evidenceState.unresolvedEvidenceGaps");
  requireString(value.evidenceState.summary, "evidenceState.summary");
  if (typeof value.loopDetected !== "boolean" || typeof value.executionBlocked !== "boolean") {
    throw new ValidationError("loopDetected and executionBlocked must be booleans.");
  }
  getPecPhase(value.recommendedPecPhase);
  return value;
}

export function validateCycleOutput(value) {
  requireObject(value, "Cycle output");
  requireString(value.projectId, "projectId");
  requireObject(value.reasoning, "reasoning");
  requireString(value.reasoning.conclusion, "reasoning.conclusion");
  requireStringArray(value.reasoning.findings, "reasoning.findings");
  requireEnum(value.reasoning.evidenceQuality, EVIDENCE_QUALITY, "reasoning.evidenceQuality");
  requireStringArray(value.reasoning.limitations, "reasoning.limitations");
  requireEnum(value.reasoning.sourceType, SOURCE_TYPES, "reasoning.sourceType");
  requireStringArray(value.learned, "learned");
  requireStringArray(value.stateChanges, "stateChanges");
  requireStringArray(value.remainingUncertainty, "remainingUncertainty");
  if (!Array.isArray(value.assumptionChanges)) {
    throw new ValidationError("assumptionChanges must be an array.");
  }
  value.assumptionChanges.forEach((change, index) => {
    requireObject(change, `assumptionChanges[${index}]`);
    requireString(change.assumption, `assumptionChanges[${index}].assumption`);
    requireEnum(change.status, ASSUMPTION_STATUSES, `assumptionChanges[${index}].status`);
    if (typeof change.confidence !== "number" || change.confidence < 0 || change.confidence > 1) {
      throw new ValidationError(`assumptionChanges[${index}].confidence must be between 0 and 1.`);
    }
    requireEnum(change.confidenceOrigin, CONFIDENCE_ORIGINS, `assumptionChanges[${index}].confidenceOrigin`);
    requireString(change.rationale, `assumptionChanges[${index}].rationale`);
  });
  if (!Array.isArray(value.newEvidence)) {
    throw new ValidationError("newEvidence must be an array.");
  }
  value.newEvidence.forEach((evidence, index) => {
    requireObject(evidence, `newEvidence[${index}]`);
    requireString(evidence.claim, `newEvidence[${index}].claim`);
    requireEnum(evidence.provenanceOrigin, EVIDENCE_PROVENANCE_ORIGINS, `newEvidence[${index}].provenanceOrigin`);
    requireEnum(evidence.sourceClassification, SOURCE_CLASSIFICATIONS, `newEvidence[${index}].sourceClassification`);
    requireEnum(evidence.sourceCategory, SOURCE_CATEGORIES, `newEvidence[${index}].sourceCategory`);
    if (typeof evidence.sourceTitle !== "string" || typeof evidence.sourceUrl !== "string") {
      throw new ValidationError(`newEvidence[${index}] source fields must be strings.`);
    }
    requireString(evidence.assessment, `newEvidence[${index}].assessment`);
    requireEnum(evidence.intakeType, EVIDENCE_INTAKE_TYPES, `newEvidence[${index}].intakeType`);
    requireEnum(evidence.reliability, EVIDENCE_RELIABILITY, `newEvidence[${index}].reliability`);
    requireEnum(evidence.relationship, EVIDENCE_RELATIONSHIPS, `newEvidence[${index}].relationship`);
    requireEnum(evidence.collectionMethod, COLLECTION_METHODS, `newEvidence[${index}].collectionMethod`);
    for (const field of ["sourceDate", "population", "methodDetails", "observation"]) {
      if (typeof evidence[field] !== "string") throw new ValidationError(`newEvidence[${index}].${field} must be a string.`);
    }
    requireStringArray(evidence.assumptionIds, `newEvidence[${index}].assumptionIds`);
    requireStringArray(evidence.questionRefs, `newEvidence[${index}].questionRefs`);
  });
  requireObject(value.evidenceEvaluation, "evidenceEvaluation");
  if (!Array.isArray(value.evidenceEvaluation.considered)) {
    throw new ValidationError("evidenceEvaluation.considered must be an array.");
  }
  value.evidenceEvaluation.considered.forEach((item, index) => {
    requireObject(item, `evidenceEvaluation.considered[${index}]`);
    requireString(item.evidenceId, `evidenceEvaluation.considered[${index}].evidenceId`);
    requireEnum(item.classification, EVIDENCE_REVIEW_CLASSES, `evidenceEvaluation.considered[${index}].classification`);
    requireEnum(item.relationship, EVIDENCE_RELATIONSHIPS, `evidenceEvaluation.considered[${index}].relationship`);
    requireString(item.rationale, `evidenceEvaluation.considered[${index}].rationale`);
  });
  if (typeof value.evidenceEvaluation.evaluationThresholdMet !== "boolean") {
    throw new ValidationError("evidenceEvaluation.evaluationThresholdMet must be a boolean.");
  }
  requireString(value.evidenceEvaluation.evaluationThresholdRationale, "evidenceEvaluation.evaluationThresholdRationale");
  requireEnum(value.evidenceEvaluation.propositionStatus, PROPOSITION_STATUSES, "evidenceEvaluation.propositionStatus");
  requireString(value.evidenceEvaluation.propositionStatusRationale, "evidenceEvaluation.propositionStatusRationale");
  requireStringArray(value.evidenceEvaluation.gaps, "evidenceEvaluation.gaps");
  requireObject(value.evidenceEvaluation.disconfirmation, "evidenceEvaluation.disconfirmation");
  requireEnum(value.evidenceEvaluation.disconfirmation.searchStatus, DISCONFIRMATION_SEARCH_STATUSES, "evidenceEvaluation.disconfirmation.searchStatus");
  requireEnum(value.evidenceEvaluation.disconfirmation.flag, DISCONFIRMATION_FLAGS, "evidenceEvaluation.disconfirmation.flag");
  for (const field of ["strongestSupportingEvidence", "strongestContradictoryEvidence", "strongestLimitation", "evidenceThatWouldChangeConclusion"]) {
    if (typeof value.evidenceEvaluation.disconfirmation[field] !== "string") {
      throw new ValidationError(`evidenceEvaluation.disconfirmation.${field} must be a string.`);
    }
  }
  requireObject(value.nextAction, "nextAction");
  requireEnum(value.nextAction.disposition, DISPOSITIONS, "nextAction.disposition");
  requireString(value.nextAction.action, "nextAction.action");
  requireString(value.nextAction.why, "nextAction.why");
  getPecPhase(value.pecPhaseAfter);
  requireString(value.problemDefinition, "problemDefinition");
  if (!Array.isArray(value.tangents)) {
    throw new ValidationError("tangents must be an array.");
  }
  value.tangents.forEach((tangent, index) => {
    requireObject(tangent, `tangents[${index}]`);
    requireString(tangent.observation, `tangents[${index}].observation`);
    requireEnum(tangent.classification, [
      "MINOR_OBSERVATION",
      "FUTURE_INVESTIGATION",
      "CURRENT_PROJECT_MODIFICATION",
      "POTENTIAL_STANDALONE_PROJECT"
    ], `tangents[${index}].classification`);
    requireString(tangent.link, `tangents[${index}].link`);
  });
  return value;
}

export function validateProjectState(state) {
  requireObject(state, "Project state");
  requireString(state.id, "state.id");
  if (state.domainProfile != null) requireString(state.domainProfile, "state.domainProfile");
  if (state.domainProfileVersion != null) requireString(state.domainProfileVersion, "state.domainProfileVersion");
  requireString(state.originalInput, "state.originalInput");
  requireString(state.problemDefinition, "state.problemDefinition");
  requireObject(state.pecPhase, "state.pecPhase");
  getPecPhase(state.pecPhase.id);
  if (!Number.isInteger(state.cycle) || state.cycle < 0) {
    throw new ValidationError("state.cycle must be a non-negative integer.");
  }
  for (const field of ["assumptions", "evidence", "lockedDecisions", "tangents", "notebook"]) {
    if (!Array.isArray(state[field])) {
      throw new ValidationError(`state.${field} must be an array.`);
    }
  }
  if (state.stateEvents != null && !Array.isArray(state.stateEvents)) {
    throw new ValidationError("state.stateEvents must be an array when present.");
  }
  if (state.claimLedger != null) {
    requireObject(state.claimLedger, "state.claimLedger");
    if (!Number.isInteger(state.claimLedger.version) || !Array.isArray(state.claimLedger.claims) || !Array.isArray(state.claimLedger.evidenceRelationships)) {
      throw new ValidationError("state.claimLedger must contain an integer version plus claims and evidenceRelationships arrays.");
    }
  }
  for (const field of ["humanGates", "humanDecisions", "stageOverrides", "questions", "researchHistory"]) {
    if (state[field] != null && !Array.isArray(state[field])) {
      throw new ValidationError(`state.${field} must be an array when present.`);
    }
  }
  return state;
}
import { MODULE_IDS } from "./rethink-modules.js";
