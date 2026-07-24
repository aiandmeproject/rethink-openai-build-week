import { ValidationError } from "./rethink-schema.js";
import {
  MATERIAL_DEPENDENCY_RELATIONSHIPS,
  analyzeIndependentEvidenceChains
} from "./rethink-provenance.js";

export const TEMPORAL_LEDGER_VERSION = 1;

export const TEMPORAL_TARGET_TYPES = Object.freeze([
  "EVIDENCE_ITEM",
  "PROVENANCE_ARTIFACT"
]);

export const TEMPORAL_STATUSES = Object.freeze([
  "UNKNOWN",
  "CURRENT",
  "HISTORICAL",
  "OUTDATED",
  "CORRECTED",
  "SUPERSEDED"
]);

export const TEMPORAL_RELATIONSHIP_TYPES = Object.freeze([
  "CORRECTS",
  "SUPERSEDES"
]);

export const TEMPORAL_ANALYSIS_PURPOSES = Object.freeze([
  "CURRENT_STATE",
  "HISTORICAL_AS_OF"
]);

export const TEMPORAL_ANALYSIS_STATUSES = Object.freeze([
  "RESOLVED",
  "PARTIAL",
  "UNRESOLVED"
]);

const LIFECYCLE_STATUSES = Object.freeze(["ACTIVE", "REMOVED"]);
const OPTIONAL_TEMPORAL_FIELDS = Object.freeze([
  "observedAt",
  "publishedAt",
  "effectiveFrom",
  "effectiveTo"
]);

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

function requireTimestamp(value, label) {
  requireText(value, label);
  if (Number.isNaN(Date.parse(value))) {
    throw new ValidationError(`${label} must be a valid ISO-compatible date or timestamp.`);
  }
}

function validateOptionalTimestamp(value, label) {
  if (typeof value !== "string") {
    throw new ValidationError(`${label} must be a string.`);
  }
  if (value) requireTimestamp(value, label);
}

function validateString(value, label) {
  if (typeof value !== "string") {
    throw new ValidationError(`${label} must be a string.`);
  }
}

function endpointKey(type, id) {
  return `${type}\u0000${id}`;
}

function endpointFromKey(key) {
  const [targetType, targetId] = key.split("\u0000");
  return { targetType, targetId };
}

function endpointRef(type, id) {
  return { targetType: type, targetId: id };
}

function relationshipIdentity(item) {
  return [
    item.subjectType,
    item.subjectId,
    item.objectType,
    item.objectId,
    item.relationship
  ].join("\u0000");
}

function validateTargetType(value, label) {
  if (!TEMPORAL_TARGET_TYPES.includes(value)) {
    throw new ValidationError(`${label} must be one of: ${TEMPORAL_TARGET_TYPES.join(", ")}.`);
  }
}

function activeAssessments(ledger) {
  return ledger.assessments.filter((item) => item.status === "ACTIVE");
}

function activeRelationships(ledger) {
  return ledger.relationships.filter((item) => item.status === "ACTIVE");
}

function knownEndpointSets({ evidenceIds = null, artifactIds = null } = {}) {
  return {
    evidence: evidenceIds == null ? null : new Set(evidenceIds),
    artifacts: artifactIds == null ? null : new Set(artifactIds)
  };
}

function assertKnownEndpoint(type, id, sets, label) {
  if (type === "EVIDENCE_ITEM" && sets.evidence && !sets.evidence.has(id)) {
    throw new ValidationError(`${label} references unknown evidence item ${id}.`);
  }
  if (type === "PROVENANCE_ARTIFACT" && sets.artifacts && !sets.artifacts.has(id)) {
    throw new ValidationError(`${label} references unknown provenance artifact ${id}.`);
  }
}

function findTemporalCycles(relationships) {
  const adjacency = new Map();
  for (const relationship of relationships.filter((item) =>
    item.status === "ACTIVE" && TEMPORAL_RELATIONSHIP_TYPES.includes(item.relationship)
  )) {
    const subject = endpointKey(relationship.subjectType, relationship.subjectId);
    const object = endpointKey(relationship.objectType, relationship.objectId);
    if (!adjacency.has(subject)) adjacency.set(subject, []);
    adjacency.get(subject).push({ object, relationshipId: relationship.id });
  }
  for (const edges of adjacency.values()) {
    edges.sort((left, right) =>
      left.object.localeCompare(right.object) || left.relationshipId.localeCompare(right.relationshipId)
    );
  }

  const visiting = new Set();
  const visited = new Set();
  const path = [];
  const cycles = [];
  const seen = new Set();
  function visit(node) {
    if (visiting.has(node)) {
      const start = path.indexOf(node);
      const keys = [...path.slice(start), node];
      const signature = keys.slice(0, -1).sort().join("|");
      if (!seen.has(signature)) {
        seen.add(signature);
        cycles.push(keys.map(endpointFromKey));
      }
      return;
    }
    if (visited.has(node)) return;
    visiting.add(node);
    path.push(node);
    for (const edge of adjacency.get(node) || []) visit(edge.object);
    path.pop();
    visiting.delete(node);
    visited.add(node);
  }
  for (const node of [...adjacency.keys()].sort()) visit(node);
  return cycles;
}

function relationshipAssessmentConflicts(ledger) {
  const assessmentByTarget = new Map(activeAssessments(ledger).map((item) => [
    endpointKey(item.targetType, item.targetId),
    item
  ]));
  const conflicts = [];
  for (const relationship of activeRelationships(ledger)) {
    const objectKey = endpointKey(relationship.objectType, relationship.objectId);
    const assessment = assessmentByTarget.get(objectKey);
    const expectedStatus = relationship.relationship === "CORRECTS" ? "CORRECTED" : "SUPERSEDED";
    if (!assessment) {
      conflicts.push({
        code: "AFFECTED_TARGET_MISSING_ACTIVE_ASSESSMENT",
        relationshipId: relationship.id,
        targetType: relationship.objectType,
        targetId: relationship.objectId
      });
      continue;
    }
    if (assessment.temporalStatus !== expectedStatus) {
      conflicts.push({
        code: "RELATIONSHIP_ASSESSMENT_STATUS_CONFLICT",
        relationshipId: relationship.id,
        targetType: relationship.objectType,
        targetId: relationship.objectId,
        expectedStatus,
        actualStatus: assessment.temporalStatus
      });
    }
    if (Date.parse(relationship.effectiveAt) > Date.parse(assessment.statusAsOf)) {
      conflicts.push({
        code: "RELATIONSHIP_EFFECTIVE_AFTER_AFFECTED_STATUS_AS_OF",
        relationshipId: relationship.id,
        assessmentId: assessment.id
      });
    }
  }
  return conflicts;
}

function assertTemporalConsistency(ledger) {
  const conflicts = relationshipAssessmentConflicts(ledger);
  if (conflicts.length) {
    const conflict = conflicts[0];
    if (conflict.code === "AFFECTED_TARGET_MISSING_ACTIVE_ASSESSMENT") {
      throw new ValidationError(
        `Active temporal relationship ${conflict.relationshipId} requires an active assessment for its affected target ${conflict.targetType}:${conflict.targetId}.`
      );
    }
    if (conflict.code === "RELATIONSHIP_ASSESSMENT_STATUS_CONFLICT") {
      throw new ValidationError(
        `Active temporal relationship ${conflict.relationshipId} requires its affected target to be assessed ${conflict.expectedStatus}, not ${conflict.actualStatus}.`
      );
    }
    throw new ValidationError(
      `Temporal relationship ${conflict.relationshipId} cannot become effective after the affected assessment's statusAsOf.`
    );
  }
  const cycles = findTemporalCycles(ledger.relationships);
  if (cycles.length) {
    const path = cycles[0].map((item) => `${item.targetType}:${item.targetId}`);
    throw new ValidationError(`Temporal correction or supersession cycle detected: ${path.join(" -> ")}.`);
  }
}

export function createEmptyTemporalLedger() {
  return {
    version: TEMPORAL_LEDGER_VERSION,
    assessments: [],
    relationships: []
  };
}

export function validateTemporalAssessment(assessment, label = "temporal assessment") {
  requireObject(assessment, label);
  requireText(assessment.id, `${label}.id`);
  validateTargetType(assessment.targetType, `${label}.targetType`);
  requireText(assessment.targetId, `${label}.targetId`);
  if (!TEMPORAL_STATUSES.includes(assessment.temporalStatus)) {
    throw new ValidationError(`${label}.temporalStatus must be one of: ${TEMPORAL_STATUSES.join(", ")}.`);
  }
  requireTimestamp(assessment.statusAsOf, `${label}.statusAsOf`);
  for (const field of OPTIONAL_TEMPORAL_FIELDS) {
    validateOptionalTimestamp(assessment[field], `${label}.${field}`);
  }
  requireText(assessment.rationale, `${label}.rationale`, 3);
  validateString(assessment.notes, `${label}.notes`);
  if (!LIFECYCLE_STATUSES.includes(assessment.status)) {
    throw new ValidationError(`${label}.status must be one of: ${LIFECYCLE_STATUSES.join(", ")}.`);
  }
  requireTimestamp(assessment.createdAt, `${label}.createdAt`);
  requireTimestamp(assessment.updatedAt, `${label}.updatedAt`);
  if (typeof assessment.removedAt !== "string" || typeof assessment.removedReason !== "string") {
    throw new ValidationError(`${label} removal metadata must use strings.`);
  }
  if (assessment.effectiveFrom && assessment.effectiveTo
      && Date.parse(assessment.effectiveFrom) > Date.parse(assessment.effectiveTo)) {
    throw new ValidationError(`${label}.effectiveFrom cannot be after effectiveTo.`);
  }
  if (assessment.temporalStatus === "CURRENT") {
    if (assessment.effectiveFrom && Date.parse(assessment.statusAsOf) < Date.parse(assessment.effectiveFrom)) {
      throw new ValidationError(`${label}.statusAsOf cannot be before effectiveFrom when temporalStatus is CURRENT.`);
    }
    if (assessment.effectiveTo && Date.parse(assessment.statusAsOf) > Date.parse(assessment.effectiveTo)) {
      throw new ValidationError(`${label}.statusAsOf cannot be after effectiveTo when temporalStatus is CURRENT.`);
    }
  }
  if (assessment.status === "ACTIVE" && (assessment.removedAt || assessment.removedReason)) {
    throw new ValidationError(`${label} cannot have removal metadata while active.`);
  }
  if (assessment.status === "REMOVED") {
    requireTimestamp(assessment.removedAt, `${label}.removedAt`);
    requireText(assessment.removedReason, `${label}.removedReason`, 3);
  }
  return assessment;
}

export function validateTemporalRelationship(relationship, label = "temporal relationship") {
  requireObject(relationship, label);
  requireText(relationship.id, `${label}.id`);
  validateTargetType(relationship.subjectType, `${label}.subjectType`);
  requireText(relationship.subjectId, `${label}.subjectId`);
  validateTargetType(relationship.objectType, `${label}.objectType`);
  requireText(relationship.objectId, `${label}.objectId`);
  if (relationship.subjectType === relationship.objectType && relationship.subjectId === relationship.objectId) {
    throw new ValidationError(`${label} cannot relate a target to itself.`);
  }
  if (!TEMPORAL_RELATIONSHIP_TYPES.includes(relationship.relationship)) {
    throw new ValidationError(`${label}.relationship must be one of: ${TEMPORAL_RELATIONSHIP_TYPES.join(", ")}.`);
  }
  requireTimestamp(relationship.effectiveAt, `${label}.effectiveAt`);
  validateString(relationship.notes, `${label}.notes`);
  if (!LIFECYCLE_STATUSES.includes(relationship.status)) {
    throw new ValidationError(`${label}.status must be one of: ${LIFECYCLE_STATUSES.join(", ")}.`);
  }
  requireTimestamp(relationship.createdAt, `${label}.createdAt`);
  requireTimestamp(relationship.updatedAt, `${label}.updatedAt`);
  if (typeof relationship.removedAt !== "string" || typeof relationship.removedReason !== "string") {
    throw new ValidationError(`${label} removal metadata must use strings.`);
  }
  if (relationship.status === "ACTIVE" && (relationship.removedAt || relationship.removedReason)) {
    throw new ValidationError(`${label} cannot have removal metadata while active.`);
  }
  if (relationship.status === "REMOVED") {
    requireTimestamp(relationship.removedAt, `${label}.removedAt`);
    requireText(relationship.removedReason, `${label}.removedReason`, 3);
  }
  return relationship;
}

export function validateTemporalLedger(ledger, {
  evidenceIds = null,
  artifactIds = null
} = {}) {
  requireObject(ledger, "Temporal ledger");
  if (ledger.version !== TEMPORAL_LEDGER_VERSION) {
    throw new ValidationError(`Unsupported temporal ledger version: ${ledger.version ?? "missing"}.`);
  }
  if (!Array.isArray(ledger.assessments) || !Array.isArray(ledger.relationships)) {
    throw new ValidationError("Temporal ledger assessments and relationships must be arrays.");
  }
  const sets = knownEndpointSets({ evidenceIds, artifactIds });
  const assessmentIds = new Set();
  const activeTargetIds = new Set();
  ledger.assessments.forEach((assessment, index) => {
    validateTemporalAssessment(assessment, `temporalLedger.assessments[${index}]`);
    if (assessmentIds.has(assessment.id)) {
      throw new ValidationError(`Duplicate temporal assessment ID: ${assessment.id}.`);
    }
    assessmentIds.add(assessment.id);
    assertKnownEndpoint(
      assessment.targetType,
      assessment.targetId,
      sets,
      `Temporal assessment ${assessment.id}`
    );
    if (assessment.status === "ACTIVE") {
      const key = endpointKey(assessment.targetType, assessment.targetId);
      if (activeTargetIds.has(key)) {
        throw new ValidationError(`Duplicate active temporal assessment for ${assessment.targetType}:${assessment.targetId}.`);
      }
      activeTargetIds.add(key);
    }
  });

  const relationshipIds = new Set();
  const activeIdentities = new Set();
  ledger.relationships.forEach((relationship, index) => {
    validateTemporalRelationship(relationship, `temporalLedger.relationships[${index}]`);
    if (relationshipIds.has(relationship.id)) {
      throw new ValidationError(`Duplicate temporal relationship ID: ${relationship.id}.`);
    }
    relationshipIds.add(relationship.id);
    assertKnownEndpoint(
      relationship.subjectType,
      relationship.subjectId,
      sets,
      `Temporal relationship ${relationship.id}`
    );
    assertKnownEndpoint(
      relationship.objectType,
      relationship.objectId,
      sets,
      `Temporal relationship ${relationship.id}`
    );
    if (relationship.status === "ACTIVE") {
      const identity = relationshipIdentity(relationship);
      if (activeIdentities.has(identity)) {
        throw new ValidationError(`Duplicate active temporal relationship: ${relationship.id}.`);
      }
      activeIdentities.add(identity);
    }
  });
  assertTemporalConsistency(ledger);
  return ledger;
}

export function normalizeTemporalLedger(ledger, options = {}) {
  if (ledger == null) return createEmptyTemporalLedger();
  const normalized = cloneValue(ledger);
  validateTemporalLedger(normalized, options);
  return normalized;
}

export function listTemporalAssessments(ledger, {
  targetType = "",
  targetId = "",
  includeRemoved = false
} = {}) {
  validateTemporalLedger(ledger);
  return cloneValue(ledger.assessments.filter((item) =>
    (includeRemoved || item.status === "ACTIVE")
    && (!targetType || item.targetType === targetType)
    && (!targetId || item.targetId === targetId)
  ));
}

export function listTemporalRelationships(ledger, {
  endpointType = "",
  endpointId = "",
  includeRemoved = false
} = {}) {
  validateTemporalLedger(ledger);
  return cloneValue(ledger.relationships.filter((item) =>
    (includeRemoved || item.status === "ACTIVE")
    && (!endpointId || (
      (item.subjectType === endpointType && item.subjectId === endpointId)
      || (item.objectType === endpointType && item.objectId === endpointId)
    ))
  ));
}

export function upsertTemporalAssessment(ledger, item, {
  now = new Date(),
  evidenceIds = null,
  artifactIds = null
} = {}) {
  const validationOptions = { evidenceIds, artifactIds };
  validateTemporalLedger(ledger, validationOptions);
  requireObject(item, "Temporal assessment input");
  const byId = item.id
    ? ledger.assessments.find((candidate) => candidate.id === item.id && candidate.status === "ACTIVE")
    : null;
  if (item.id && !byId) {
    throw new ValidationError("The temporal assessment does not exist or has been removed.");
  }
  const targetType = item.targetType ?? byId?.targetType;
  const targetId = item.targetId ?? byId?.targetId;
  validateTargetType(targetType, "Temporal assessment target type");
  requireText(targetId, "Temporal assessment target ID");
  if (byId && (byId.targetType !== targetType || byId.targetId !== targetId)) {
    throw new ValidationError("A temporal assessment cannot be reassigned to a different target.");
  }
  const existing = byId || ledger.assessments.find((candidate) =>
    candidate.status === "ACTIVE"
    && candidate.targetType === targetType
    && candidate.targetId === targetId
  );
  if (item.status != null && item.status !== "ACTIVE") {
    throw new ValidationError("Use the temporal assessment removal operation to preserve history.");
  }
  const temporalStatus = item.temporalStatus ?? existing?.temporalStatus ?? "UNKNOWN";
  const statusAsOf = item.statusAsOf ?? existing?.statusAsOf;
  const rationale = item.rationale ?? existing?.rationale ?? "";
  const notes = item.notes ?? existing?.notes ?? "";
  const optional = Object.fromEntries(OPTIONAL_TEMPORAL_FIELDS.map((field) => [
    field,
    item[field] ?? existing?.[field] ?? ""
  ]));
  const at = timestamp(now);
  const assessment = {
    id: existing?.id || makeId("temporal_assessment", now),
    targetType,
    targetId,
    temporalStatus,
    statusAsOf,
    ...optional,
    rationale: typeof rationale === "string" ? rationale.trim() : rationale,
    notes: typeof notes === "string" ? notes.trim() : notes,
    status: "ACTIVE",
    createdAt: existing?.createdAt || at,
    updatedAt: at,
    removedAt: "",
    removedReason: ""
  };
  validateTemporalAssessment(assessment);
  const comparable = [
    "targetType", "targetId", "temporalStatus", "statusAsOf",
    ...OPTIONAL_TEMPORAL_FIELDS, "rationale", "notes"
  ];
  if (existing && comparable.every((field) => existing[field] === assessment[field])) {
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
    assessments: existing
      ? ledger.assessments.map((candidate) => candidate.id === assessment.id ? assessment : candidate)
      : [...ledger.assessments, assessment]
  };
  validateTemporalLedger(candidateLedger, validationOptions);
  return {
    ledger: candidateLedger,
    assessment: cloneValue(assessment),
    before: existing ? cloneValue(existing) : null,
    action: existing ? "UPDATED" : "CREATED",
    unchanged: false
  };
}

export function removeTemporalAssessment(ledger, id, {
  reason,
  now = new Date(),
  evidenceIds = null,
  artifactIds = null
} = {}) {
  const validationOptions = { evidenceIds, artifactIds };
  validateTemporalLedger(ledger, validationOptions);
  requireText(reason, "Temporal assessment removal reason", 3);
  const existing = ledger.assessments.find((candidate) => candidate.id === id && candidate.status === "ACTIVE");
  if (!existing) {
    throw new ValidationError("The temporal assessment does not exist or has already been removed.");
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
    assessments: ledger.assessments.map((candidate) => candidate.id === id ? assessment : candidate)
  };
  validateTemporalLedger(candidateLedger, validationOptions);
  return {
    ledger: candidateLedger,
    assessment: cloneValue(assessment),
    before: cloneValue(existing)
  };
}

export function upsertTemporalRelationship(ledger, item, {
  now = new Date(),
  evidenceIds = null,
  artifactIds = null
} = {}) {
  const validationOptions = { evidenceIds, artifactIds };
  validateTemporalLedger(ledger, validationOptions);
  requireObject(item, "Temporal relationship input");
  const byId = item.id
    ? ledger.relationships.find((candidate) => candidate.id === item.id && candidate.status === "ACTIVE")
    : null;
  if (item.id && !byId) {
    throw new ValidationError("The temporal relationship does not exist or has been removed.");
  }
  const subjectType = item.subjectType ?? byId?.subjectType;
  const subjectId = item.subjectId ?? byId?.subjectId;
  const objectType = item.objectType ?? byId?.objectType;
  const objectId = item.objectId ?? byId?.objectId;
  validateTargetType(subjectType, "Temporal relationship subject type");
  validateTargetType(objectType, "Temporal relationship object type");
  requireText(subjectId, "Temporal relationship subject ID");
  requireText(objectId, "Temporal relationship object ID");
  if (byId && (
    byId.subjectType !== subjectType
    || byId.subjectId !== subjectId
    || byId.objectType !== objectType
    || byId.objectId !== objectId
  )) {
    throw new ValidationError("A temporal relationship cannot be reassigned to different endpoints.");
  }
  if (item.status != null && item.status !== "ACTIVE") {
    throw new ValidationError("Use the temporal relationship removal operation to preserve history.");
  }
  const relationshipType = item.relationship ?? byId?.relationship;
  if (!TEMPORAL_RELATIONSHIP_TYPES.includes(relationshipType)) {
    throw new ValidationError(`Temporal relationship must be one of: ${TEMPORAL_RELATIONSHIP_TYPES.join(", ")}.`);
  }
  const existing = byId || ledger.relationships.find((candidate) =>
    candidate.status === "ACTIVE"
    && candidate.subjectType === subjectType
    && candidate.subjectId === subjectId
    && candidate.objectType === objectType
    && candidate.objectId === objectId
    && candidate.relationship === relationshipType
  );
  const effectiveAt = item.effectiveAt ?? existing?.effectiveAt;
  const notes = item.notes ?? existing?.notes ?? "";
  const at = timestamp(now);
  const relationship = {
    id: existing?.id || makeId("temporal_relationship", now),
    subjectType,
    subjectId,
    objectType,
    objectId,
    relationship: relationshipType,
    effectiveAt,
    notes: typeof notes === "string" ? notes.trim() : notes,
    status: "ACTIVE",
    createdAt: existing?.createdAt || at,
    updatedAt: at,
    removedAt: "",
    removedReason: ""
  };
  validateTemporalRelationship(relationship);
  let affectedAssessment = null;
  let affectedAssessmentBefore = null;
  if (byId && byId.relationship !== relationshipType) {
    requireObject(item.affectedAssessment, "Explicit affected assessment update");
    const currentAssessment = ledger.assessments.find((candidate) =>
      candidate.status === "ACTIVE"
      && candidate.targetType === objectType
      && candidate.targetId === objectId
    );
    if (!currentAssessment) {
      throw new ValidationError("Changing temporal relationship meaning requires an existing active affected-target assessment.");
    }
    if (item.affectedAssessment.id != null && item.affectedAssessment.id !== currentAssessment.id) {
      throw new ValidationError("The explicit affected assessment update must preserve the existing assessment ID.");
    }
    if ((item.affectedAssessment.targetType != null && item.affectedAssessment.targetType !== objectType)
        || (item.affectedAssessment.targetId != null && item.affectedAssessment.targetId !== objectId)) {
      throw new ValidationError("The explicit affected assessment update cannot be reassigned to another target.");
    }
    const expectedStatus = relationshipType === "CORRECTS" ? "CORRECTED" : "SUPERSEDED";
    if (item.affectedAssessment.temporalStatus !== expectedStatus) {
      throw new ValidationError(
        `Changing relationship meaning to ${relationshipType} requires an explicit affected assessment status of ${expectedStatus}.`
      );
    }
    requireTimestamp(item.affectedAssessment.statusAsOf, "Explicit affected assessment update statusAsOf");
    requireText(item.affectedAssessment.rationale, "Explicit affected assessment update rationale", 3);
    affectedAssessmentBefore = cloneValue(currentAssessment);
    affectedAssessment = {
      ...currentAssessment,
      temporalStatus: item.affectedAssessment.temporalStatus,
      statusAsOf: item.affectedAssessment.statusAsOf,
      ...Object.fromEntries(OPTIONAL_TEMPORAL_FIELDS.map((field) => [
        field,
        item.affectedAssessment[field] ?? currentAssessment[field]
      ])),
      rationale: item.affectedAssessment.rationale.trim(),
      notes: typeof item.affectedAssessment.notes === "string"
        ? item.affectedAssessment.notes.trim()
        : currentAssessment.notes,
      updatedAt: at
    };
    validateTemporalAssessment(affectedAssessment);
  }
  if (existing
      && existing.relationship === relationship.relationship
      && existing.effectiveAt === relationship.effectiveAt
      && existing.notes === relationship.notes) {
    return {
      ledger,
      relationship: cloneValue(existing),
      before: cloneValue(existing),
      action: "UNCHANGED",
      unchanged: true
    };
  }
  const candidateLedger = {
    ...ledger,
    assessments: affectedAssessment
      ? ledger.assessments.map((candidate) =>
        candidate.id === affectedAssessment.id ? affectedAssessment : candidate
      )
      : ledger.assessments,
    relationships: existing
      ? ledger.relationships.map((candidate) => candidate.id === relationship.id ? relationship : candidate)
      : [...ledger.relationships, relationship]
  };
  validateTemporalLedger(candidateLedger, validationOptions);
  return {
    ledger: candidateLedger,
    relationship: cloneValue(relationship),
    before: existing ? cloneValue(existing) : null,
    affectedAssessment: affectedAssessment ? cloneValue(affectedAssessment) : null,
    affectedAssessmentBefore,
    action: existing ? "UPDATED" : "CREATED",
    unchanged: false
  };
}

export function removeTemporalRelationship(ledger, id, {
  reason,
  now = new Date(),
  evidenceIds = null,
  artifactIds = null
} = {}) {
  const validationOptions = { evidenceIds, artifactIds };
  validateTemporalLedger(ledger, validationOptions);
  requireText(reason, "Temporal relationship removal reason", 3);
  const existing = ledger.relationships.find((candidate) => candidate.id === id && candidate.status === "ACTIVE");
  if (!existing) {
    throw new ValidationError("The temporal relationship does not exist or has already been removed.");
  }
  const at = timestamp(now);
  const relationship = {
    ...existing,
    status: "REMOVED",
    updatedAt: at,
    removedAt: at,
    removedReason: reason.trim()
  };
  const candidateLedger = {
    ...ledger,
    relationships: ledger.relationships.map((candidate) => candidate.id === id ? relationship : candidate)
  };
  validateTemporalLedger(candidateLedger, validationOptions);
  return {
    ledger: candidateLedger,
    relationship: cloneValue(relationship),
    before: cloneValue(existing)
  };
}

function uniqueTargetRefs(refs) {
  const seen = new Set();
  const result = [];
  for (const ref of refs) {
    validateTargetType(ref.targetType, "Temporal analysis target type");
    requireText(ref.targetId, "Temporal analysis target ID");
    const key = endpointKey(ref.targetType, ref.targetId);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ targetType: ref.targetType, targetId: ref.targetId });
  }
  return result.sort((left, right) =>
    endpointKey(left.targetType, left.targetId).localeCompare(endpointKey(right.targetType, right.targetId))
  );
}

function asOfWarnings(assessment, asOf, purpose) {
  const analysisTime = Date.parse(asOf);
  const warnings = [];
  if (assessment.temporalStatus === "CURRENT" && Date.parse(assessment.statusAsOf) < analysisTime) {
    warnings.push("CURRENT_STATUS_AS_OF_PREVIOUS_DATE");
    warnings.push("TEMPORAL_ASSESSMENT_STALE_FOR_REQUESTED_AS_OF");
  }
  if (assessment.effectiveTo && Date.parse(assessment.effectiveTo) < analysisTime) {
    warnings.push("EFFECTIVE_INTERVAL_ENDED_BEFORE_ANALYSIS_DATE");
  }
  if (assessment.effectiveFrom && Date.parse(assessment.effectiveFrom) > analysisTime) {
    warnings.push("EFFECTIVE_INTERVAL_BEGINS_AFTER_ANALYSIS_DATE");
  }
  if (purpose === "HISTORICAL_AS_OF" && assessment.publishedAt
      && Date.parse(assessment.publishedAt) > analysisTime) {
    warnings.push("PUBLISHED_AFTER_ANALYSIS_DATE");
  }
  return [...new Set(warnings)];
}

function buildRelationshipChains(relationships, relationshipType) {
  const edges = relationships
    .filter((item) => item.status === "ACTIVE" && item.relationship === relationshipType)
    .sort((left, right) => left.id.localeCompare(right.id));
  const outgoing = new Map();
  const incoming = new Set();
  for (const edge of edges) {
    const subject = endpointKey(edge.subjectType, edge.subjectId);
    const object = endpointKey(edge.objectType, edge.objectId);
    if (!outgoing.has(subject)) outgoing.set(subject, []);
    outgoing.get(subject).push({ object, relationshipId: edge.id });
    incoming.add(object);
  }
  const starts = [...outgoing.keys()].filter((key) => !incoming.has(key)).sort();
  const chains = [];
  function walk(key, path, relationshipIds, visited) {
    const next = outgoing.get(key) || [];
    if (!next.length) {
      if (relationshipIds.length) {
        chains.push({
          targets: path.map(endpointFromKey),
          relationshipIds: [...relationshipIds]
        });
      }
      return;
    }
    for (const edge of next) {
      if (visited.has(edge.object)) continue;
      const nextVisited = new Set(visited);
      nextVisited.add(edge.object);
      walk(edge.object, [...path, edge.object], [...relationshipIds, edge.relationshipId], nextVisited);
    }
  }
  for (const start of starts) walk(start, [start], [], new Set([start]));
  return chains;
}

function unresolvedReplacementWarnings(ledger) {
  const active = activeRelationships(ledger);
  const correctedObjects = new Set(active
    .filter((item) => item.relationship === "CORRECTS")
    .map((item) => endpointKey(item.objectType, item.objectId)));
  const supersededObjects = new Set(active
    .filter((item) => item.relationship === "SUPERSEDES")
    .map((item) => endpointKey(item.objectType, item.objectId)));
  return {
    unresolvedCorrectingSourceWarnings: activeAssessments(ledger)
      .filter((item) =>
        item.temporalStatus === "CORRECTED"
        && !correctedObjects.has(endpointKey(item.targetType, item.targetId))
      )
      .map((item) => ({
        code: "CORRECTING_SOURCE_UNRESOLVED",
        assessmentId: item.id,
        targetType: item.targetType,
        targetId: item.targetId
      })),
    unresolvedSupersedingSourceWarnings: activeAssessments(ledger)
      .filter((item) =>
        item.temporalStatus === "SUPERSEDED"
        && !supersededObjects.has(endpointKey(item.targetType, item.targetId))
      )
      .map((item) => ({
        code: "SUPERSEDING_SOURCE_UNRESOLVED",
        assessmentId: item.id,
        targetType: item.targetType,
        targetId: item.targetId
      }))
  };
}

export function analyzeTemporalIntegrity(ledger, {
  evidenceItems = [],
  provenanceLedger = { artifacts: [] },
  targetRefs = null,
  asOf,
  purpose = "CURRENT_STATE",
  inspectMalformed = false
} = {}) {
  requireTimestamp(asOf, "Temporal analysis asOf");
  if (!TEMPORAL_ANALYSIS_PURPOSES.includes(purpose)) {
    throw new ValidationError(`Temporal analysis purpose must be one of: ${TEMPORAL_ANALYSIS_PURPOSES.join(", ")}.`);
  }
  const evidenceIds = evidenceItems.map((item) => item.id);
  const artifactIds = (provenanceLedger?.artifacts || []).map((item) => item.id);
  if (!inspectMalformed) validateTemporalLedger(ledger, { evidenceIds, artifactIds });
  else {
    requireObject(ledger, "Temporal ledger");
    if (!Array.isArray(ledger.assessments) || !Array.isArray(ledger.relationships)) {
      throw new ValidationError("Temporal ledger assessments and relationships must be arrays.");
    }
  }
  const selected = uniqueTargetRefs(targetRefs ?? [
    ...evidenceItems.filter((item) => item.status === "ACTIVE").map((item) => endpointRef("EVIDENCE_ITEM", item.id)),
    ...artifactIds.map((id) => endpointRef("PROVENANCE_ARTIFACT", id))
  ]);
  const active = (ledger.assessments || []).filter((item) => item.status === "ACTIVE");
  const assessmentByTarget = new Map(active.map((item) => [
    endpointKey(item.targetType, item.targetId),
    item
  ]));
  const assessedTargets = [];
  const unassessedTargets = [];
  for (const ref of selected) {
    const assessment = assessmentByTarget.get(endpointKey(ref.targetType, ref.targetId));
    if (!assessment) {
      unassessedTargets.push(ref);
      continue;
    }
    const warnings = asOfWarnings(assessment, asOf, purpose);
    assessedTargets.push({
      ...ref,
      assessmentId: assessment.id,
      temporalStatus: assessment.temporalStatus,
      statusAsOf: assessment.statusAsOf,
      observedAt: assessment.observedAt,
      publishedAt: assessment.publishedAt,
      effectiveFrom: assessment.effectiveFrom,
      effectiveTo: assessment.effectiveTo,
      historicallyApplicable: purpose === "HISTORICAL_AS_OF"
        && (!assessment.effectiveFrom || Date.parse(assessment.effectiveFrom) <= Date.parse(asOf))
        && (!assessment.effectiveTo || Date.parse(assessment.effectiveTo) >= Date.parse(asOf)),
      asOfWarnings: warnings
    });
  }
  const statusGroups = Object.fromEntries(TEMPORAL_STATUSES.map((status) => [
    status,
    assessedTargets
      .filter((item) => item.temporalStatus === status)
      .map((item) => endpointRef(item.targetType, item.targetId))
  ]));
  const intervalConflicts = assessedTargets.flatMap((item) =>
    item.asOfWarnings
      .filter((code) => code.includes("INTERVAL"))
      .map((code) => ({ code, targetType: item.targetType, targetId: item.targetId }))
  );
  const relationshipConflicts = relationshipAssessmentConflicts(ledger);
  const temporalCycleWarnings = findTemporalCycles(ledger.relationships || []).map((cycle) => ({
    code: "TEMPORAL_REPLACEMENT_CYCLE",
    targets: cycle
  }));
  const unresolved = unresolvedReplacementWarnings(ledger);
  const unknownCount = statusGroups.UNKNOWN.length + unassessedTargets.length;
  const conflictCount = intervalConflicts.length
    + relationshipConflicts.length
    + temporalCycleWarnings.length
    + unresolved.unresolvedCorrectingSourceWarnings.length
    + unresolved.unresolvedSupersedingSourceWarnings.length;
  const status = selected.length === 0 || unknownCount === selected.length
    ? "UNRESOLVED"
    : (unknownCount > 0 || conflictCount > 0 ? "PARTIAL" : "RESOLVED");
  return {
    status,
    purpose,
    asOf,
    assessedTargets,
    unassessedTargets,
    statusGroups,
    currentTargetIds: statusGroups.CURRENT.map((item) => item.targetId),
    historicalTargetIds: statusGroups.HISTORICAL.map((item) => item.targetId),
    outdatedTargetIds: statusGroups.OUTDATED.map((item) => item.targetId),
    correctedTargetIds: statusGroups.CORRECTED.map((item) => item.targetId),
    supersededTargetIds: statusGroups.SUPERSEDED.map((item) => item.targetId),
    unknownTargetIds: [
      ...statusGroups.UNKNOWN.map((item) => item.targetId),
      ...unassessedTargets.map((item) => item.targetId)
    ],
    intervalConflicts,
    relationshipAssessmentConflicts: relationshipConflicts,
    ...unresolved,
    temporalCycleWarnings,
    correctionChains: buildRelationshipChains(ledger.relationships || [], "CORRECTS"),
    supersessionChains: buildRelationshipChains(ledger.relationships || [], "SUPERSEDES")
  };
}

function reachableArtifactIds(provenanceLedger, evidenceId) {
  const relationships = (provenanceLedger.relationships || []).filter((item) =>
    item.status === "ACTIVE" && MATERIAL_DEPENDENCY_RELATIONSHIPS.includes(item.relationship)
  );
  const reachable = new Set([endpointKey("EVIDENCE_ITEM", evidenceId)]);
  const artifacts = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    for (const relationship of relationships) {
      const subject = endpointKey(relationship.subjectType, relationship.subjectId);
      if (!reachable.has(subject)) continue;
      const object = endpointKey(relationship.objectType, relationship.objectId);
      if (!reachable.has(object)) {
        reachable.add(object);
        changed = true;
      }
      if (relationship.objectType === "PROVENANCE_ARTIFACT") artifacts.add(relationship.objectId);
    }
  }
  return [...artifacts].sort();
}

function stateForTarget(analysis, targetType, targetId) {
  return analysis.assessedTargets.find((item) =>
    item.targetType === targetType && item.targetId === targetId
  ) || null;
}

export function analyzeSourceChainTemporalIntegrity({
  temporalLedger,
  provenanceLedger,
  evidenceItems,
  evidenceId,
  eligibleEvidenceIds = [],
  asOf,
  purpose = "CURRENT_STATE"
}) {
  const evidence = evidenceItems.find((item) => item.id === evidenceId);
  if (!evidence) throw new ValidationError(`Cannot analyze unknown evidence item: ${evidenceId}.`);
  const provenanceAnalysis = analyzeIndependentEvidenceChains(provenanceLedger, {
    evidenceItems,
    evidenceIds: [evidenceId],
    eligibleEvidenceIds: eligibleEvidenceIds.includes(evidenceId) ? [evidenceId] : []
  });
  const mapping = provenanceAnalysis.evidenceMappings[0];
  const artifactIds = reachableArtifactIds(provenanceLedger, evidenceId);
  const targetRefs = [
    endpointRef("EVIDENCE_ITEM", evidenceId),
    ...artifactIds.map((id) => endpointRef("PROVENANCE_ARTIFACT", id))
  ];
  const temporalAnalysis = analyzeTemporalIntegrity(temporalLedger, {
    evidenceItems,
    provenanceLedger,
    targetRefs,
    asOf,
    purpose
  });
  const directEvidenceState = stateForTarget(temporalAnalysis, "EVIDENCE_ITEM", evidenceId);
  const provenanceArtifactStates = artifactIds
    .map((id) => stateForTarget(temporalAnalysis, "PROVENANCE_ARTIFACT", id))
    .filter(Boolean);
  const foundationalRootStates = mapping.foundationalRootIds
    .map((id) => stateForTarget(temporalAnalysis, "PROVENANCE_ARTIFACT", id))
    .filter(Boolean);
  const artifactById = new Map(provenanceLedger.artifacts.map((item) => [item.id, item]));
  const currentDerivative = directEvidenceState?.temporalStatus === "CURRENT"
    || provenanceArtifactStates.some((item) =>
      item.temporalStatus === "CURRENT" && artifactById.get(item.targetId)?.originRole === "DERIVATIVE"
    );
  const warnings = [];
  if (currentDerivative) {
    for (const temporalStatus of ["SUPERSEDED", "CORRECTED", "OUTDATED"]) {
      if (foundationalRootStates.some((item) => item.temporalStatus === temporalStatus)) {
        warnings.push(`CURRENT_DERIVATIVE_HAS_${temporalStatus}_FOUNDATIONAL_ROOT`);
      }
    }
  }
  if (mapping.status !== "RESOLVED") warnings.push("PROVENANCE_ORIGIN_UNRESOLVED");
  if (temporalAnalysis.unassessedTargets.length || temporalAnalysis.statusGroups.UNKNOWN.length) {
    warnings.push("TEMPORAL_STATE_UNRESOLVED");
  }
  return {
    evidenceId,
    eligibleForRealWorldValidation: mapping.eligibleForRealWorldValidation,
    provenanceStatus: mapping.status,
    foundationalRootIds: mapping.foundationalRootIds,
    directEvidenceState,
    provenanceArtifactStates,
    foundationalRootStates,
    evidenceLackingTemporalAssessment: temporalAnalysis.unassessedTargets
      .filter((item) => item.targetType === "EVIDENCE_ITEM")
      .map((item) => item.targetId),
    temporalAnalysis,
    warnings: [...new Set(warnings)].sort()
  };
}

export function analyzeClaimTemporalIntegrity({
  temporalLedger,
  provenanceLedger,
  claimLedger,
  evidenceItems,
  claimId,
  linkableEvidenceIds,
  eligibleEvidenceIds,
  asOf,
  purpose = "CURRENT_STATE"
}) {
  const claim = claimLedger?.claims?.find((item) => item.id === claimId);
  if (!claim) throw new ValidationError(`Cannot analyze unknown claim: ${claimId}.`);
  const linkable = new Set(linkableEvidenceIds);
  const relationships = claimLedger.evidenceRelationships.filter((item) =>
    item.claimId === claimId && item.status === "ACTIVE" && linkable.has(item.evidenceId)
  );
  const activeEvidenceIds = [...new Set(relationships.map((item) => item.evidenceId))].sort();
  const evidenceRelationships = Object.fromEntries(["SUPPORTS", "CONTRADICTS", "LIMITS"].map((relationship) => [
    relationship,
    relationships
      .filter((item) => item.relationship === relationship)
      .map((item) => item.evidenceId)
      .sort()
  ]));
  const sourceAnalyses = activeEvidenceIds.map((evidenceId) =>
    analyzeSourceChainTemporalIntegrity({
      temporalLedger,
      provenanceLedger,
      evidenceItems,
      evidenceId,
      eligibleEvidenceIds,
      asOf,
      purpose
    })
  );
  const directEvidenceStates = sourceAnalyses
    .map((item) => item.directEvidenceState)
    .filter(Boolean);
  const foundationalRootStates = sourceAnalyses.flatMap((item) =>
    item.foundationalRootStates.map((state) => ({ evidenceId: item.evidenceId, ...state }))
  );
  const statusesForEvidence = (evidenceId) => {
    const source = sourceAnalyses.find((item) => item.evidenceId === evidenceId);
    return new Set([
      source?.directEvidenceState?.temporalStatus,
      ...(source?.foundationalRootStates || []).map((item) => item.temporalStatus)
    ].filter(Boolean));
  };
  const evidenceIdsWithStatus = (status) => activeEvidenceIds
    .filter((id) => statusesForEvidence(id).has(status));
  const supportingIds = evidenceRelationships.SUPPORTS;
  const knownCurrentEvidenceIds = directEvidenceStates
    .filter((item) => item.temporalStatus === "CURRENT")
    .map((item) => item.targetId)
    .sort();
  const evidenceLackingTemporalAssessment = sourceAnalyses
    .filter((item) => !item.directEvidenceState)
    .map((item) => item.evidenceId);
  const warnings = [];
  if (claim.status === "SUPPORTED"
      && !supportingIds.some((id) => knownCurrentEvidenceIds.includes(id))) {
    warnings.push("SUPPORTED_CLAIM_HAS_NO_KNOWN_CURRENT_SUPPORT");
  }
  for (const [status, code] of [
    ["SUPERSEDED", "SUPPORT_RELIES_ON_SUPERSEDED_SOURCE"],
    ["CORRECTED", "SUPPORT_RELIES_ON_CORRECTED_SOURCE"],
    ["OUTDATED", "SUPPORT_RELIES_ON_OUTDATED_SOURCE"]
  ]) {
    if (supportingIds.some((id) => statusesForEvidence(id).has(status))) warnings.push(code);
  }
  if (purpose === "CURRENT_STATE"
      && activeEvidenceIds.some((id) => statusesForEvidence(id).has("HISTORICAL"))) {
    warnings.push("CLAIM_USES_HISTORICAL_EVIDENCE_FOR_CURRENT_CONTEXT");
  }
  if (evidenceLackingTemporalAssessment.length
      || directEvidenceStates.some((item) => item.temporalStatus === "UNKNOWN")
      || sourceAnalyses.some((item) => item.warnings.includes("TEMPORAL_STATE_UNRESOLVED"))) {
    warnings.push("TEMPORAL_STATE_UNRESOLVED");
  }
  return {
    claimId,
    claimStatus: claim.status,
    purpose,
    asOf,
    activeEvidenceIds,
    evidenceRelationships,
    directEvidenceStates,
    foundationalRootStates,
    evidenceLackingTemporalAssessment,
    evidenceLinkedToCorrectedSources: evidenceIdsWithStatus("CORRECTED"),
    evidenceLinkedToSupersededSources: evidenceIdsWithStatus("SUPERSEDED"),
    evidenceLinkedToOutdatedSources: evidenceIdsWithStatus("OUTDATED"),
    historicalEvidenceIds: evidenceIdsWithStatus("HISTORICAL"),
    knownCurrentEvidenceIds,
    temporalConflicts: sourceAnalyses.flatMap((item) => [
      ...item.temporalAnalysis.intervalConflicts,
      ...item.temporalAnalysis.relationshipAssessmentConflicts
    ]),
    sourceAnalyses,
    warnings: [...new Set(warnings)].sort()
  };
}
