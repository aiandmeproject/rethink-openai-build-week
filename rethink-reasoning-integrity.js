import { ValidationError } from "./rethink-schema.js";
import { analyzeIndependentEvidenceChains } from "./rethink-provenance.js";
import { analyzeClaimTemporalIntegrity } from "./rethink-temporal.js";

export const REASONING_INTEGRITY_LEDGER_VERSION = 1;

export const CAPABILITY_OVERALL_FIT_STATUSES = Object.freeze([
  "UNKNOWN",
  "FIT",
  "PARTIAL",
  "NOT_FIT"
]);

export const SCOPE_DIMENSION_FIT_STATUSES = Object.freeze([
  "MATCHED",
  "PARTIAL",
  "MISMATCHED",
  "UNKNOWN",
  "NOT_APPLICABLE"
]);

export const CORE_SCOPE_DIMENSION_TYPES = Object.freeze([
  "POPULATION",
  "ENDPOINT",
  "GEOGRAPHY",
  "SETTING",
  "CONDITION",
  "TIME",
  "METHOD",
  "GENERALIZABILITY",
  "OTHER"
]);

export const DETECTION_CAPABILITY_STATUSES = Object.freeze([
  "UNKNOWN",
  "ADEQUATE",
  "LIMITED",
  "INADEQUATE",
  "NOT_APPLICABLE"
]);

export const ABSENCE_INFERENCE_STATUSES = Object.freeze([
  "NOT_APPLICABLE",
  "SUPPORTED",
  "LIMITED",
  "UNSUPPORTED"
]);

export const REASONING_INTEGRITY_ANALYSIS_STATUSES = Object.freeze([
  "RESOLVED",
  "PARTIAL",
  "UNRESOLVED"
]);

const LIFECYCLE_STATUSES = Object.freeze(["ACTIVE", "REMOVED"]);
const CLAIM_RELATIONSHIP_TYPES = Object.freeze(["SUPPORTS", "CONTRADICTS", "LIMITS"]);
const EXTENSIBLE_DIMENSION_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/;

function cloneValue(value) {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function timestamp(now) {
  const parsed = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError("A valid operation timestamp is required.");
  }
  return parsed.toISOString();
}

function makeId(prefix, now = new Date()) {
  const random = Math.random().toString(36).slice(2, 9);
  return `${prefix}_${new Date(now).getTime().toString(36)}_${random}`;
}

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError(`${label} must be an object.`);
  }
}

function requireText(value, label, minimum = 1) {
  if (typeof value !== "string" || value.trim().length < minimum) {
    throw new ValidationError(`${label} must contain at least ${minimum} character${minimum === 1 ? "" : "s"}.`);
  }
}

function requireString(value, label) {
  if (typeof value !== "string") {
    throw new ValidationError(`${label} must be a string.`);
  }
}

function requireTimestamp(value, label) {
  requireText(value, label);
  if (Number.isNaN(Date.parse(value))) {
    throw new ValidationError(`${label} must be a valid timestamp.`);
  }
}

function validateDimensionToken(value, label = "Scope dimension") {
  if (typeof value !== "string" || !EXTENSIBLE_DIMENSION_PATTERN.test(value)) {
    throw new ValidationError(`${label} must be an uppercase extensible dimension token.`);
  }
}

function forbidDuplicatedRelationshipEndpoints(assessment, label) {
  for (const field of ["claimId", "evidenceId", "claim", "evidence"]) {
    if (Object.hasOwn(assessment, field)) {
      throw new ValidationError(
        `${label} must not duplicate ${field}; claim and evidence endpoints are derived from the canonical Claim Ledger relationship.`
      );
    }
  }
}

function assessmentMaterialDetection(assessment) {
  return assessment.detectionMaterial || assessment.absenceInferenceStatus !== "NOT_APPLICABLE";
}

function activeCapabilityAssessments(ledger) {
  return ledger.capabilityAssessments.filter((item) => item.status === "ACTIVE");
}

function relationshipMap(claimEvidenceRelationships) {
  return claimEvidenceRelationships == null
    ? null
    : new Map(claimEvidenceRelationships.map((item) => [item.id, item]));
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function relationshipGroups(relationships) {
  return Object.fromEntries(CLAIM_RELATIONSHIP_TYPES.map((type) => [
    type,
    relationships.filter((item) => item.relationship === type).map((item) => cloneValue(item))
  ]));
}

function statusForClaimAnalysis({
  relationships,
  unassessedRelationshipIds,
  fitGroups,
  capabilityUnresolved,
  provenanceUnresolved,
  temporalUnresolved,
  materialWarnings
}) {
  if (relationships.length === 0) return "UNRESOLVED";
  if (
    unassessedRelationshipIds.length === relationships.length
    || (fitGroups.UNKNOWN.length === relationships.length && unassessedRelationshipIds.length === 0)
  ) return "UNRESOLVED";
  if (
    unassessedRelationshipIds.length
    || capabilityUnresolved
    || provenanceUnresolved
    || temporalUnresolved
    || fitGroups.PARTIAL.length
    || fitGroups.NOT_FIT.length
    || materialWarnings.length
  ) return "PARTIAL";
  return "RESOLVED";
}

function temporalStatusSet(sourceAnalysis) {
  return new Set([
    sourceAnalysis?.directEvidenceState?.temporalStatus,
    ...(sourceAnalysis?.foundationalRootStates || []).map((item) => item.temporalStatus)
  ].filter(Boolean));
}

function sourceTemporalWarningCodes(sourceAnalysis) {
  return sortedUnique([
    ...(sourceAnalysis?.warnings || []),
    ...(sourceAnalysis?.temporalAnalysis?.assessedTargets || [])
      .flatMap((item) => item.asOfWarnings || []),
    ...(sourceAnalysis?.temporalAnalysis?.intervalConflicts || []).map((item) => item.code),
    ...(sourceAnalysis?.temporalAnalysis?.relationshipAssessmentConflicts || []).map((item) => item.code)
  ]);
}

function isTemporalSourceUnresolved(sourceAnalysis) {
  const directStatus = sourceAnalysis?.directEvidenceState?.temporalStatus;
  return !directStatus
    || directStatus === "UNKNOWN"
    || (sourceAnalysis?.warnings || []).includes("TEMPORAL_STATE_UNRESOLVED")
    || (sourceAnalysis?.temporalAnalysis?.status === "UNRESOLVED");
}

function independentChainSummary({
  provenanceLedger,
  evidenceItems,
  relationships,
  eligibleEvidenceIds
}) {
  const evidenceIds = sortedUnique(relationships.map((item) => item.evidenceId));
  const analysis = analyzeIndependentEvidenceChains(provenanceLedger, {
    evidenceItems,
    evidenceIds,
    eligibleEvidenceIds: evidenceIds.filter((id) => eligibleEvidenceIds.includes(id))
  });
  return {
    evidenceItemCount: evidenceIds.length,
    evidenceIds,
    knownIndependentFoundationalRootCount: analysis.knownIndependentChainCount,
    foundationalRootIds: analysis.foundationalRootIds,
    traceableFoundationalRootIds: analysis.traceableFoundationalRootIds,
    unresolvedOriginEvidenceIds: analysis.unresolvedEvidenceIds,
    syntheticOrIneligibleEvidenceIds: analysis.ineligibleForRealWorldValidationEvidenceIds,
    evidenceMappings: analysis.evidenceMappings
  };
}

export function createEmptyReasoningIntegrityLedger() {
  return {
    version: REASONING_INTEGRITY_LEDGER_VERSION,
    capabilityAssessments: []
  };
}

export function validateScopeDimension(dimension, label = "scope dimension") {
  requireObject(dimension, label);
  validateDimensionToken(dimension.dimension, `${label}.dimension`);
  requireText(dimension.claimScope, `${label}.claimScope`);
  requireText(dimension.evidenceScope, `${label}.evidenceScope`);
  if (!SCOPE_DIMENSION_FIT_STATUSES.includes(dimension.fitStatus)) {
    throw new ValidationError(
      `${label}.fitStatus must be one of: ${SCOPE_DIMENSION_FIT_STATUSES.join(", ")}.`
    );
  }
  requireText(dimension.rationale, `${label}.rationale`, 3);
  return dimension;
}

export function validateCapabilityAssessment(assessment, label = "capability assessment") {
  requireObject(assessment, label);
  forbidDuplicatedRelationshipEndpoints(assessment, label);
  requireText(assessment.id, `${label}.id`);
  requireText(assessment.claimEvidenceRelationshipId, `${label}.claimEvidenceRelationshipId`);
  if (!CAPABILITY_OVERALL_FIT_STATUSES.includes(assessment.overallFit)) {
    throw new ValidationError(
      `${label}.overallFit must be one of: ${CAPABILITY_OVERALL_FIT_STATUSES.join(", ")}.`
    );
  }
  if (!Array.isArray(assessment.scopeDimensions)) {
    throw new ValidationError(`${label}.scopeDimensions must be an array.`);
  }
  const dimensionTokens = new Set();
  assessment.scopeDimensions.forEach((dimension, index) => {
    validateScopeDimension(dimension, `${label}.scopeDimensions[${index}]`);
    if (dimensionTokens.has(dimension.dimension)) {
      throw new ValidationError(
        `${label} contains duplicate scope dimension ${dimension.dimension}.`
      );
    }
    dimensionTokens.add(dimension.dimension);
  });
  if (typeof assessment.detectionMaterial !== "boolean") {
    throw new ValidationError(`${label}.detectionMaterial must be a boolean.`);
  }
  if (!DETECTION_CAPABILITY_STATUSES.includes(assessment.detectionCapability)) {
    throw new ValidationError(
      `${label}.detectionCapability must be one of: ${DETECTION_CAPABILITY_STATUSES.join(", ")}.`
    );
  }
  if (!ABSENCE_INFERENCE_STATUSES.includes(assessment.absenceInferenceStatus)) {
    throw new ValidationError(
      `${label}.absenceInferenceStatus must be one of: ${ABSENCE_INFERENCE_STATUSES.join(", ")}.`
    );
  }
  if (assessment.detectionMaterial && assessment.detectionCapability === "NOT_APPLICABLE") {
    throw new ValidationError(
      `${label}.detectionCapability cannot be NOT_APPLICABLE when detection is material.`
    );
  }
  if (!assessment.detectionMaterial && assessment.absenceInferenceStatus !== "NOT_APPLICABLE") {
    throw new ValidationError(
      `${label}.detectionMaterial must be true when an absence inference is assessed.`
    );
  }
  if (
    assessment.overallFit === "FIT"
    && assessment.scopeDimensions.some((item) => item.fitStatus === "MISMATCHED")
  ) {
    throw new ValidationError(`${label} cannot be FIT while a scope dimension is MISMATCHED.`);
  }
  if (
    assessment.overallFit === "FIT"
    && assessmentMaterialDetection(assessment)
    && assessment.detectionCapability === "INADEQUATE"
  ) {
    throw new ValidationError(`${label} cannot be FIT when material detection capability is INADEQUATE.`);
  }
  if (
    assessment.absenceInferenceStatus === "SUPPORTED"
    && assessment.detectionCapability !== "ADEQUATE"
  ) {
    throw new ValidationError(`${label} requires ADEQUATE detection capability for a SUPPORTED absence inference.`);
  }
  if (
    assessment.absenceInferenceStatus === "LIMITED"
    && !["ADEQUATE", "LIMITED"].includes(assessment.detectionCapability)
  ) {
    throw new ValidationError(
      `${label} requires ADEQUATE or LIMITED detection capability for a LIMITED absence inference.`
    );
  }
  requireText(assessment.rationale, `${label}.rationale`, 3);
  requireString(assessment.notes, `${label}.notes`);
  if (!LIFECYCLE_STATUSES.includes(assessment.status)) {
    throw new ValidationError(`${label}.status must be one of: ${LIFECYCLE_STATUSES.join(", ")}.`);
  }
  requireTimestamp(assessment.createdAt, `${label}.createdAt`);
  requireTimestamp(assessment.updatedAt, `${label}.updatedAt`);
  requireString(assessment.removedAt, `${label}.removedAt`);
  requireString(assessment.removedReason, `${label}.removedReason`);
  if (assessment.status === "ACTIVE" && (assessment.removedAt || assessment.removedReason)) {
    throw new ValidationError(`${label} cannot have removal metadata while active.`);
  }
  if (assessment.status === "REMOVED") {
    requireTimestamp(assessment.removedAt, `${label}.removedAt`);
    requireText(assessment.removedReason, `${label}.removedReason`, 3);
  }
  return assessment;
}

export function validateReasoningIntegrityLedger(ledger, {
  claimEvidenceRelationships = null
} = {}) {
  requireObject(ledger, "Reasoning Integrity Ledger");
  if (ledger.version !== REASONING_INTEGRITY_LEDGER_VERSION) {
    throw new ValidationError(
      `Unsupported Reasoning Integrity Ledger version: ${ledger.version ?? "missing"}.`
    );
  }
  if (!Array.isArray(ledger.capabilityAssessments)) {
    throw new ValidationError("Reasoning Integrity Ledger capabilityAssessments must be an array.");
  }
  const relationships = relationshipMap(claimEvidenceRelationships);
  const assessmentIds = new Set();
  const activeTargets = new Set();
  ledger.capabilityAssessments.forEach((assessment, index) => {
    validateCapabilityAssessment(
      assessment,
      `reasoningIntegrityLedger.capabilityAssessments[${index}]`
    );
    if (assessmentIds.has(assessment.id)) {
      throw new ValidationError(`Duplicate Capability Assessment ID: ${assessment.id}.`);
    }
    assessmentIds.add(assessment.id);
    if (relationships && !relationships.has(assessment.claimEvidenceRelationshipId)) {
      throw new ValidationError(
        `Capability Assessment ${assessment.id} references unknown Claim Ledger relationship ${assessment.claimEvidenceRelationshipId}.`
      );
    }
    if (assessment.status === "ACTIVE") {
      if (activeTargets.has(assessment.claimEvidenceRelationshipId)) {
        throw new ValidationError(
          `Duplicate active Capability Assessment for Claim Ledger relationship ${assessment.claimEvidenceRelationshipId}.`
        );
      }
      activeTargets.add(assessment.claimEvidenceRelationshipId);
    }
  });
  return ledger;
}

export function normalizeReasoningIntegrityLedger(ledger, options = {}) {
  if (ledger == null) return createEmptyReasoningIntegrityLedger();
  const normalized = cloneValue(ledger);
  validateReasoningIntegrityLedger(normalized, options);
  return normalized;
}

export function listCapabilityAssessments(ledger, {
  claimEvidenceRelationshipId = "",
  includeRemoved = false
} = {}) {
  validateReasoningIntegrityLedger(ledger);
  return cloneValue(ledger.capabilityAssessments.filter((item) =>
    (includeRemoved || item.status === "ACTIVE")
    && (!claimEvidenceRelationshipId
      || item.claimEvidenceRelationshipId === claimEvidenceRelationshipId)
  ));
}

export function upsertCapabilityAssessment(ledger, item, {
  now = new Date(),
  claimEvidenceRelationships = []
} = {}) {
  validateReasoningIntegrityLedger(ledger, { claimEvidenceRelationships });
  requireObject(item, "Capability Assessment input");
  forbidDuplicatedRelationshipEndpoints(item, "Capability Assessment input");
  const byId = item.id
    ? ledger.capabilityAssessments.find((candidate) =>
        candidate.id === item.id && candidate.status === "ACTIVE"
      )
    : null;
  if (item.id && !byId) {
    throw new ValidationError("The Capability Assessment does not exist or has been removed.");
  }
  const targetId = item.claimEvidenceRelationshipId ?? byId?.claimEvidenceRelationshipId;
  requireText(targetId, "Capability Assessment Claim Ledger relationship ID");
  if (byId && byId.claimEvidenceRelationshipId !== targetId) {
    throw new ValidationError(
      "A Capability Assessment cannot be reassigned to a different Claim Ledger relationship."
    );
  }
  const existing = byId || ledger.capabilityAssessments.find((candidate) =>
    candidate.status === "ACTIVE"
    && candidate.claimEvidenceRelationshipId === targetId
  );
  const relationship = claimEvidenceRelationships.find((candidate) => candidate.id === targetId);
  if (!relationship) {
    throw new ValidationError(`The Claim Ledger relationship ${targetId} does not exist.`);
  }
  if (!existing && relationship.status !== "ACTIVE") {
    throw new ValidationError(
      "A new Capability Assessment may target only an active Claim Ledger relationship."
    );
  }
  if (item.status != null && item.status !== "ACTIVE") {
    throw new ValidationError("Use the Capability Assessment removal operation to preserve history.");
  }
  const overallFit = item.overallFit ?? existing?.overallFit ?? "UNKNOWN";
  const scopeDimensions = cloneValue(item.scopeDimensions ?? existing?.scopeDimensions ?? []);
  const detectionMaterial = item.detectionMaterial ?? existing?.detectionMaterial ?? false;
  const detectionCapability = item.detectionCapability
    ?? existing?.detectionCapability
    ?? "UNKNOWN";
  const absenceInferenceStatus = item.absenceInferenceStatus
    ?? existing?.absenceInferenceStatus
    ?? "NOT_APPLICABLE";
  const rationale = String(item.rationale ?? existing?.rationale ?? "").trim();
  const notes = item.notes ?? existing?.notes ?? "";
  requireString(notes, "Capability Assessment notes");
  const at = timestamp(now);
  const assessment = {
    id: existing?.id || makeId("capability_assessment", now),
    claimEvidenceRelationshipId: targetId,
    overallFit,
    scopeDimensions,
    detectionMaterial,
    detectionCapability,
    absenceInferenceStatus,
    rationale,
    notes: notes.trim(),
    status: "ACTIVE",
    createdAt: existing?.createdAt || at,
    updatedAt: at,
    removedAt: "",
    removedReason: ""
  };
  validateCapabilityAssessment(assessment);
  const comparableExisting = existing && {
    ...existing,
    updatedAt: assessment.updatedAt
  };
  if (existing && JSON.stringify(comparableExisting) === JSON.stringify(assessment)) {
    return {
      ledger,
      assessment: cloneValue(existing),
      before: cloneValue(existing),
      action: "UNCHANGED",
      unchanged: true
    };
  }
  const candidateLedger = {
    ...ledger,
    capabilityAssessments: existing
      ? ledger.capabilityAssessments.map((candidate) =>
          candidate.id === assessment.id ? assessment : candidate
        )
      : [...ledger.capabilityAssessments, assessment]
  };
  validateReasoningIntegrityLedger(candidateLedger, { claimEvidenceRelationships });
  return {
    ledger: candidateLedger,
    assessment: cloneValue(assessment),
    before: existing ? cloneValue(existing) : null,
    action: existing ? "UPDATED" : "CREATED",
    unchanged: false
  };
}

export function removeCapabilityAssessment(ledger, id, {
  reason,
  now = new Date(),
  claimEvidenceRelationships = null
} = {}) {
  validateReasoningIntegrityLedger(ledger, { claimEvidenceRelationships });
  requireText(reason, "Capability Assessment removal reason", 3);
  const existing = ledger.capabilityAssessments.find((candidate) =>
    candidate.id === id && candidate.status === "ACTIVE"
  );
  if (!existing) {
    throw new ValidationError("The Capability Assessment does not exist or has already been removed.");
  }
  const at = timestamp(now);
  const assessment = {
    ...existing,
    status: "REMOVED",
    updatedAt: at,
    removedAt: at,
    removedReason: reason.trim()
  };
  const candidateLedger = {
    ...ledger,
    capabilityAssessments: ledger.capabilityAssessments.map((candidate) =>
      candidate.id === id ? assessment : candidate
    )
  };
  validateReasoningIntegrityLedger(candidateLedger, { claimEvidenceRelationships });
  return {
    ledger: candidateLedger,
    assessment: cloneValue(assessment),
    before: cloneValue(existing)
  };
}

export function analyzeClaimReasoningIntegrity({
  reasoningIntegrityLedger,
  claimLedger,
  provenanceLedger,
  temporalLedger,
  evidenceItems,
  claimId,
  linkableEvidenceIds,
  eligibleEvidenceIds,
  asOf,
  purpose = "CURRENT_STATE"
}) {
  requireTimestamp(asOf, "Reasoning Integrity analysis asOf");
  const claim = claimLedger?.claims?.find((item) => item.id === claimId);
  if (!claim) throw new ValidationError(`Cannot analyze unknown claim: ${claimId}.`);
  validateReasoningIntegrityLedger(reasoningIntegrityLedger, {
    claimEvidenceRelationships: claimLedger.evidenceRelationships
  });
  const linkable = new Set(linkableEvidenceIds);
  const eligible = new Set(eligibleEvidenceIds);
  const relationships = claimLedger.evidenceRelationships.filter((item) =>
    item.claimId === claimId
    && item.status === "ACTIVE"
    && linkable.has(item.evidenceId)
  );
  const groupedRelationships = relationshipGroups(relationships);
  const assessmentByRelationshipId = new Map(
    activeCapabilityAssessments(reasoningIntegrityLedger)
      .map((item) => [item.claimEvidenceRelationshipId, item])
  );
  const assessedRelationships = relationships.filter((item) =>
    assessmentByRelationshipId.has(item.id)
  );
  const unassessedRelationshipIds = relationships
    .filter((item) => !assessmentByRelationshipId.has(item.id))
    .map((item) => item.id)
    .sort();
  const fitGroups = Object.fromEntries(CAPABILITY_OVERALL_FIT_STATUSES.map((status) => [
    status,
    assessedRelationships
      .filter((item) => assessmentByRelationshipId.get(item.id).overallFit === status)
      .map((item) => item.id)
      .sort()
  ]));
  const scopeMismatches = assessedRelationships.flatMap((relationship) => {
    const assessment = assessmentByRelationshipId.get(relationship.id);
    return assessment.scopeDimensions
      .filter((item) => ["PARTIAL", "MISMATCHED", "UNKNOWN"].includes(item.fitStatus))
      .map((dimension) => ({
        relationshipId: relationship.id,
        evidenceId: relationship.evidenceId,
        assessmentId: assessment.id,
        ...cloneValue(dimension)
      }));
  });
  const detectionCapabilityWeaknesses = assessedRelationships
    .map((relationship) => ({
      relationship,
      assessment: assessmentByRelationshipId.get(relationship.id)
    }))
    .filter(({ assessment }) =>
      ["UNKNOWN", "LIMITED", "INADEQUATE"].includes(assessment.detectionCapability)
    )
    .map(({ relationship, assessment }) => ({
      relationshipId: relationship.id,
      evidenceId: relationship.evidenceId,
      assessmentId: assessment.id,
      detectionMaterial: assessment.detectionMaterial,
      detectionCapability: assessment.detectionCapability
    }));
  const unsupportedAbsenceInferences = assessedRelationships
    .map((relationship) => ({
      relationship,
      assessment: assessmentByRelationshipId.get(relationship.id)
    }))
    .filter(({ assessment }) =>
      ["LIMITED", "UNSUPPORTED"].includes(assessment.absenceInferenceStatus)
    )
    .map(({ relationship, assessment }) => ({
      relationshipId: relationship.id,
      evidenceId: relationship.evidenceId,
      assessmentId: assessment.id,
      absenceInferenceStatus: assessment.absenceInferenceStatus,
      detectionCapability: assessment.detectionCapability
    }));

  const independentChains = Object.fromEntries(CLAIM_RELATIONSHIP_TYPES.map((type) => [
    type,
    independentChainSummary({
      provenanceLedger,
      evidenceItems,
      relationships: groupedRelationships[type],
      eligibleEvidenceIds
    })
  ]));
  const sharedFoundationalRootsAcrossRelationshipTypes = [];
  for (let leftIndex = 0; leftIndex < CLAIM_RELATIONSHIP_TYPES.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < CLAIM_RELATIONSHIP_TYPES.length; rightIndex += 1) {
      const leftType = CLAIM_RELATIONSHIP_TYPES[leftIndex];
      const rightType = CLAIM_RELATIONSHIP_TYPES[rightIndex];
      const rightRoots = new Set(independentChains[rightType].traceableFoundationalRootIds);
      const rootIds = independentChains[leftType].traceableFoundationalRootIds
        .filter((id) => rightRoots.has(id));
      if (rootIds.length) {
        sharedFoundationalRootsAcrossRelationshipTypes.push({
          relationshipTypes: [leftType, rightType],
          foundationalRootIds: rootIds
        });
      }
    }
  }

  const temporalAnalysis = analyzeClaimTemporalIntegrity({
    temporalLedger,
    provenanceLedger,
    claimLedger,
    evidenceItems,
    claimId,
    linkableEvidenceIds,
    eligibleEvidenceIds,
    asOf,
    purpose
  });
  const sourceByEvidenceId = new Map(
    temporalAnalysis.sourceAnalyses.map((item) => [item.evidenceId, item])
  );
  const temporalWarnings = sortedUnique([
    ...temporalAnalysis.warnings,
    ...temporalAnalysis.sourceAnalyses.flatMap(sourceTemporalWarningCodes)
  ]);
  const unresolvedTemporalEvidenceIds = temporalAnalysis.sourceAnalyses
    .filter(isTemporalSourceUnresolved)
    .map((item) => item.evidenceId)
    .sort();
  const syntheticOrIneligibleEvidenceIds = sortedUnique(
    relationships
      .filter((item) => !eligible.has(item.evidenceId))
      .map((item) => item.evidenceId)
  );

  const integrityWarnings = new Set();
  if (unassessedRelationshipIds.length) integrityWarnings.add("CLAIM_EVIDENCE_FIT_UNASSESSED");
  if (fitGroups.UNKNOWN.length) integrityWarnings.add("CLAIM_EVIDENCE_FIT_UNKNOWN");
  if (fitGroups.NOT_FIT.length) integrityWarnings.add("EVIDENCE_NOT_FIT_FOR_CLAIM");
  if (scopeMismatches.some((item) => item.fitStatus === "PARTIAL") || fitGroups.PARTIAL.length) {
    integrityWarnings.add("EVIDENCE_SCOPE_PARTIAL");
  }
  if (scopeMismatches.some((item) => item.fitStatus === "MISMATCHED")) {
    integrityWarnings.add("EVIDENCE_SCOPE_MISMATCH");
    integrityWarnings.add("CLAIM_EXCEEDS_EVIDENCE_SCOPE");
  }
  for (const weakness of detectionCapabilityWeaknesses) {
    integrityWarnings.add(`DETECTION_CAPABILITY_${weakness.detectionCapability}`);
  }
  for (const inference of unsupportedAbsenceInferences) {
    integrityWarnings.add(`ABSENCE_INFERENCE_${inference.absenceInferenceStatus}`);
  }
  for (const type of CLAIM_RELATIONSHIP_TYPES) {
    const chain = independentChains[type];
    if (chain.evidenceItemCount > 1 && chain.knownIndependentFoundationalRootCount === 1) {
      integrityWarnings.add("MULTIPLE_ITEMS_SHARE_ONE_FOUNDATIONAL_CHAIN");
    }
  }
  if (independentChains.SUPPORTS.unresolvedOriginEvidenceIds.length) {
    integrityWarnings.add("SUPPORT_HAS_UNRESOLVED_ORIGIN");
  }
  if (
    groupedRelationships.SUPPORTS.some((item) =>
      unresolvedTemporalEvidenceIds.includes(item.evidenceId)
    )
  ) {
    integrityWarnings.add("SUPPORT_HAS_UNRESOLVED_TEMPORAL_STATE");
  }
  for (const [status, code] of [
    ["HISTORICAL", "SUPPORT_RELIES_ON_HISTORICAL_SOURCE"],
    ["OUTDATED", "SUPPORT_RELIES_ON_OUTDATED_SOURCE"],
    ["CORRECTED", "SUPPORT_RELIES_ON_CORRECTED_SOURCE"],
    ["SUPERSEDED", "SUPPORT_RELIES_ON_SUPERSEDED_SOURCE"]
  ]) {
    if (groupedRelationships.SUPPORTS.some((item) =>
      temporalStatusSet(sourceByEvidenceId.get(item.evidenceId)).has(status)
    )) integrityWarnings.add(code);
  }

  const disconfirmingRelationships = [
    ...groupedRelationships.CONTRADICTS,
    ...groupedRelationships.LIMITS
  ];
  const disconfirmingIds = new Set(disconfirmingRelationships.map((item) => item.id));
  const disconfirmationWarnings = [];
  let disconfirmationStatus = "NONE_RECORDED";
  if (disconfirmingRelationships.length === 0) {
    disconfirmationWarnings.push("NO_RECORDED_DISCONFIRMING_EVIDENCE");
  } else {
    const capabilityUnresolved = disconfirmingRelationships.some((relationship) => {
      const assessment = assessmentByRelationshipId.get(relationship.id);
      return !assessment
        || assessment.overallFit === "UNKNOWN"
        || assessment.scopeDimensions.some((item) => item.fitStatus === "UNKNOWN")
        || assessment.detectionCapability === "UNKNOWN";
    });
    const originUnresolved = [
      ...independentChains.CONTRADICTS.unresolvedOriginEvidenceIds,
      ...independentChains.LIMITS.unresolvedOriginEvidenceIds
    ].length > 0;
    const temporalUnresolved = disconfirmingRelationships.some((item) =>
      unresolvedTemporalEvidenceIds.includes(item.evidenceId)
    );
    if (capabilityUnresolved) {
      disconfirmationWarnings.push("DISCONFIRMATION_CAPABILITY_UNRESOLVED");
    }
    if (originUnresolved) disconfirmationWarnings.push("DISCONFIRMATION_ORIGIN_UNRESOLVED");
    if (temporalUnresolved) {
      disconfirmationWarnings.push("DISCONFIRMATION_TEMPORALLY_UNRESOLVED");
    }
    if (capabilityUnresolved || originUnresolved || temporalUnresolved) {
      disconfirmationStatus = "UNRESOLVED";
      disconfirmationWarnings.push("DISCONFIRMATION_COVERAGE_UNRESOLVED");
    } else {
      disconfirmationStatus = "RECORDED";
    }
  }
  for (const code of disconfirmationWarnings) integrityWarnings.add(code);

  const claimStatusConsistencyWarnings = [];
  const supportRelationships = groupedRelationships.SUPPORTS;
  const contradictionRelationships = groupedRelationships.CONTRADICTS;
  const allAreFitStatus = (items, fitStatus) =>
    items.length > 0
    && items.every((item) =>
      assessmentByRelationshipId.get(item.id)?.overallFit === fitStatus
    );
  if (claim.status === "SUPPORTED") {
    if (!supportRelationships.length) {
      claimStatusConsistencyWarnings.push("CLAIM_MARKED_SUPPORTED_WITH_NO_ACTIVE_SUPPORT");
    }
    if (allAreFitStatus(supportRelationships, "NOT_FIT")) {
      claimStatusConsistencyWarnings.push("CLAIM_MARKED_SUPPORTED_WITH_ONLY_NOT_FIT_SUPPORT");
    }
    if (
      supportRelationships.length
      && supportRelationships.every((item) => !eligible.has(item.evidenceId))
    ) {
      claimStatusConsistencyWarnings.push("CLAIM_MARKED_SUPPORTED_WITH_ONLY_SYNTHETIC_SUPPORT");
    }
    if (
      supportRelationships.length
      && !supportRelationships.some((item) =>
        temporalAnalysis.knownCurrentEvidenceIds.includes(item.evidenceId)
      )
    ) {
      claimStatusConsistencyWarnings.push("CLAIM_MARKED_SUPPORTED_WITH_NO_KNOWN_CURRENT_SUPPORT");
    }
  }
  if (claim.status === "CONTRADICTED") {
    if (!contradictionRelationships.length) {
      claimStatusConsistencyWarnings.push("CLAIM_MARKED_CONTRADICTED_WITH_NO_ACTIVE_CONTRADICTION");
    }
    if (allAreFitStatus(contradictionRelationships, "NOT_FIT")) {
      claimStatusConsistencyWarnings.push(
        "CLAIM_MARKED_CONTRADICTED_WITH_ONLY_NOT_FIT_CONTRADICTION"
      );
    }
  }
  if (
    claim.status === "INSUFFICIENT_EVIDENCE"
    && relationships.some((item) =>
      ["FIT", "PARTIAL"].includes(assessmentByRelationshipId.get(item.id)?.overallFit)
    )
  ) {
    claimStatusConsistencyWarnings.push(
      "CLAIM_MARKED_INSUFFICIENT_BUT_EVIDENCE_STATE_REQUIRES_REVIEW"
    );
  }
  if (claimStatusConsistencyWarnings.length) {
    integrityWarnings.add("CLAIM_STATUS_REQUIRES_REVIEW");
  }

  const provenanceUnresolved = CLAIM_RELATIONSHIP_TYPES.some((type) =>
    independentChains[type].unresolvedOriginEvidenceIds.length > 0
  );
  const capabilityUnresolved = unassessedRelationshipIds.length > 0
    || fitGroups.UNKNOWN.length > 0
    || detectionCapabilityWeaknesses.some((item) => item.detectionCapability === "UNKNOWN");
  const temporalUnresolved = unresolvedTemporalEvidenceIds.length > 0;
  const materialWarnings = [
    ...scopeMismatches,
    ...unsupportedAbsenceInferences,
    ...disconfirmationWarnings
  ];
  const analysisStatus = statusForClaimAnalysis({
    relationships,
    unassessedRelationshipIds,
    fitGroups,
    capabilityUnresolved,
    provenanceUnresolved,
    temporalUnresolved,
    materialWarnings
  });
  return {
    claimId,
    claimStatus: claim.status,
    purpose,
    asOf,
    analysisStatus,
    activeRelationships: groupedRelationships,
    activeRelationshipIds: relationships.map((item) => item.id).sort(),
    capabilityAssessedRelationshipIds: assessedRelationships.map((item) => item.id).sort(),
    unassessedRelationshipIds,
    fitGroups,
    scopeMismatches,
    detectionCapabilityWeaknesses,
    unsupportedAbsenceInferences,
    independentChains,
    sharedFoundationalRootsAcrossRelationshipTypes,
    unresolvedOriginEvidenceIds: sortedUnique(
      CLAIM_RELATIONSHIP_TYPES.flatMap((type) =>
        independentChains[type].unresolvedOriginEvidenceIds
      )
    ),
    temporalAnalysis,
    temporalWarnings,
    unresolvedTemporalEvidenceIds,
    syntheticOrIneligibleEvidenceIds,
    disconfirmationCoverage: {
      status: disconfirmationStatus,
      relationshipIds: [...disconfirmingIds].sort(),
      warnings: disconfirmationWarnings.sort(),
      interpretation: "No recorded disconfirmation is not proof that no disconfirmation exists."
    },
    claimStatusConsistencyWarnings: claimStatusConsistencyWarnings.sort(),
    integrityWarnings: [...integrityWarnings].sort()
  };
}

export function analyzeProjectReasoningIntegrity({
  reasoningIntegrityLedger,
  claimLedger,
  provenanceLedger,
  temporalLedger,
  evidenceItems,
  linkableEvidenceIds,
  eligibleEvidenceIds,
  asOf,
  purpose = "CURRENT_STATE",
  researchHistory = []
}) {
  requireTimestamp(asOf, "Reasoning Integrity analysis asOf");
  validateReasoningIntegrityLedger(reasoningIntegrityLedger, {
    claimEvidenceRelationships: claimLedger.evidenceRelationships
  });
  const claimAnalyses = claimLedger.claims.map((claim) =>
    analyzeClaimReasoningIntegrity({
      reasoningIntegrityLedger,
      claimLedger,
      provenanceLedger,
      temporalLedger,
      evidenceItems,
      claimId: claim.id,
      linkableEvidenceIds,
      eligibleEvidenceIds,
      asOf,
      purpose
    })
  );
  const idsWhere = (predicate) => claimAnalyses.filter(predicate).map((item) => item.claimId);
  const claimsWithNoActiveEvidenceRelationships = idsWhere((item) =>
    item.activeRelationshipIds.length === 0
  );
  const claimsWithUnassessedEvidenceFit = idsWhere((item) =>
    item.unassessedRelationshipIds.length > 0 || item.fitGroups.UNKNOWN.length > 0
  );
  const claimsWithOnlyPartialOrNotFitSupport = idsWhere((item) => {
    const supportIds = item.activeRelationships.SUPPORTS.map((relationship) => relationship.id);
    const partialOrNotFit = new Set([...item.fitGroups.PARTIAL, ...item.fitGroups.NOT_FIT]);
    return supportIds.length > 0 && supportIds.every((id) => partialOrNotFit.has(id));
  });
  const claimsWithUnsupportedAbsenceInference = idsWhere((item) =>
    item.unsupportedAbsenceInferences.length > 0
  );
  const claimsSupportedByOnlyOneKnownIndependentChain = idsWhere((item) =>
    item.independentChains.SUPPORTS.evidenceItemCount > 0
    && item.independentChains.SUPPORTS.knownIndependentFoundationalRootCount === 1
  );
  const claimsWithMultipleItemsFromOneSharedChain = idsWhere((item) =>
    item.independentChains.SUPPORTS.evidenceItemCount > 1
    && item.independentChains.SUPPORTS.knownIndependentFoundationalRootCount === 1
  );
  const claimsWithUnresolvedProvenance = idsWhere((item) =>
    item.unresolvedOriginEvidenceIds.length > 0
  );
  const claimsWithUnresolvedTemporalState = idsWhere((item) =>
    item.unresolvedTemporalEvidenceIds.length > 0
  );
  const claimsWithNoRecordedDisconfirmingEvidence = idsWhere((item) =>
    item.disconfirmationCoverage.status === "NONE_RECORDED"
  );
  const claimsWithClaimStatusConsistencyWarnings = idsWhere((item) =>
    item.claimStatusConsistencyWarnings.length > 0
  );
  const technicalFailureCount = researchHistory.filter((item) =>
    item.executionStatus === "FAILED_TECHNICALLY"
    || item.status === "FAILED"
    || item.status === "FAILED_TECHNICALLY"
  ).length;
  const warningCodes = new Set(claimAnalyses.flatMap((item) => item.integrityWarnings));
  if (technicalFailureCount) warningCodes.add("TECHNICAL_FAILURE_IS_NOT_NEGATIVE_EVIDENCE");
  const analysisStatus = claimAnalyses.length === 0
    ? "UNRESOLVED"
    : (claimAnalyses.every((item) => item.analysisStatus === "UNRESOLVED")
        ? "UNRESOLVED"
        : (claimAnalyses.every((item) => item.analysisStatus === "RESOLVED")
            && warningCodes.size === 0
          ? "RESOLVED"
          : "PARTIAL"));
  return {
    analysisStatus,
    purpose,
    asOf,
    totalExplicitClaims: claimLedger.claims.length,
    activeCapabilityAssessmentCount: activeCapabilityAssessments(reasoningIntegrityLedger).length,
    claimsWithNoActiveEvidenceRelationships,
    claimsWithUnassessedEvidenceFit,
    claimsWithOnlyPartialOrNotFitSupport,
    claimsWithUnsupportedAbsenceInference,
    claimsSupportedByOnlyOneKnownIndependentChain,
    claimsWithMultipleItemsFromOneSharedChain,
    claimsWithUnresolvedProvenance,
    claimsWithUnresolvedTemporalState,
    claimsWithNoRecordedDisconfirmingEvidence,
    claimsWithClaimStatusConsistencyWarnings,
    technicalFailureCount,
    warningCodes: [...warningCodes].sort(),
    claimAnalyses,
    interpretationPolicy: [
      "Warnings are advisory and never rewrite Claim Ledger relationships or claim status.",
      "Evidence Item count is distinct from known independent foundational-root count.",
      "Absence of detection requires explicit adequate detection capability.",
      "No recorded disconfirmation does not prove that no disconfirmation exists.",
      "Technical failure is not a substantive negative finding."
    ]
  };
}
