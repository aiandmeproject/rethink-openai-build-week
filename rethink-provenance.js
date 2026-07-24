import { ValidationError } from "./rethink-schema.js";

export const PROVENANCE_LEDGER_VERSION = 1;

export const PROVENANCE_ORIGIN_ROLES = Object.freeze([
  "FOUNDATIONAL",
  "DERIVATIVE",
  "UNKNOWN"
]);

export const CORE_PROVENANCE_ARTIFACT_KINDS = Object.freeze([
  "DOCUMENT",
  "DATASET",
  "STUDY",
  "OBSERVATION",
  "TEST",
  "OFFICIAL_RECORD",
  "INTERVIEW",
  "OTHER"
]);

export const PROVENANCE_ENDPOINT_TYPES = Object.freeze([
  "EVIDENCE_ITEM",
  "PROVENANCE_ARTIFACT"
]);

export const PROVENANCE_RELATIONSHIP_TYPES = Object.freeze([
  "DERIVED_FROM",
  "CITES",
  "SUMMARIZES",
  "REPLICATES",
  "REANALYZES",
  "SYNDICATES"
]);

export const MATERIAL_DEPENDENCY_RELATIONSHIPS = Object.freeze([
  "DERIVED_FROM",
  "SUMMARIZES",
  "SYNDICATES",
  "REANALYZES"
]);

export const PROVENANCE_ANALYSIS_STATUSES = Object.freeze([
  "RESOLVED",
  "PARTIAL",
  "UNRESOLVED"
]);

const RELATIONSHIP_STATUSES = Object.freeze(["ACTIVE", "REMOVED"]);
const EXTENSIBLE_KIND_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/;

function cloneValue(value) {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function timestamp(now) {
  return (now instanceof Date ? now : new Date(now)).toISOString();
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
    throw new ValidationError(`${label} must be a valid timestamp.`);
  }
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
  const [type, id] = key.split("\u0000");
  return { type, id };
}

function relationshipIdentity(relationship) {
  return [
    relationship.subjectType,
    relationship.subjectId,
    relationship.objectType,
    relationship.objectId,
    relationship.relationship
  ].join("\u0000");
}

function forbidEmbeddedRelationships(artifact) {
  for (const field of ["relationships", "relationshipIds", "derivedFromIds", "citationIds"]) {
    if (Object.hasOwn(artifact, field)) {
      throw new ValidationError(`Provenance artifacts must not embed ${field}; provenance relationships have one canonical source of truth.`);
    }
  }
}

function validateArtifactKind(value, label = "Artifact kind") {
  if (typeof value !== "string" || !EXTENSIBLE_KIND_PATTERN.test(value)) {
    throw new ValidationError(`${label} must be an uppercase extensible type token.`);
  }
}

function validateEndpointType(value, label) {
  if (!PROVENANCE_ENDPOINT_TYPES.includes(value)) {
    throw new ValidationError(`${label} must be one of: ${PROVENANCE_ENDPOINT_TYPES.join(", ")}.`);
  }
}

function activeMaterialRelationships(ledger) {
  return ledger.relationships.filter((item) =>
    item.status === "ACTIVE" && MATERIAL_DEPENDENCY_RELATIONSHIPS.includes(item.relationship)
  );
}

function assertAcyclicMaterialDependencies(ledger) {
  const adjacency = new Map();
  for (const relationship of activeMaterialRelationships(ledger)) {
    const subject = endpointKey(relationship.subjectType, relationship.subjectId);
    const object = endpointKey(relationship.objectType, relationship.objectId);
    if (!adjacency.has(subject)) adjacency.set(subject, []);
    adjacency.get(subject).push({ object, relationshipId: relationship.id });
  }
  for (const values of adjacency.values()) {
    values.sort((left, right) =>
      left.object.localeCompare(right.object) || left.relationshipId.localeCompare(right.relationshipId)
    );
  }

  const visiting = new Set();
  const visited = new Set();
  const path = [];
  function visit(node) {
    if (visiting.has(node)) {
      const start = path.indexOf(node);
      const cycle = [...path.slice(start), node].map((item) => {
        const endpoint = endpointFromKey(item);
        return `${endpoint.type}:${endpoint.id}`;
      });
      throw new ValidationError(`Material provenance dependency cycle detected: ${cycle.join(" -> ")}.`);
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
}

function assertFoundationalOriginRoleConsistency(ledger) {
  const artifactById = new Map(ledger.artifacts.map((artifact) => [artifact.id, artifact]));
  for (const relationship of activeMaterialRelationships(ledger)) {
    if (relationship.subjectType !== "PROVENANCE_ARTIFACT") continue;
    const subject = artifactById.get(relationship.subjectId);
    if (subject?.originRole === "FOUNDATIONAL") {
      throw new ValidationError(
        `Foundational provenance artifact ${subject.id} cannot be the subject of active material dependency ${relationship.id} (${relationship.relationship}).`
      );
    }
  }
}

export function createEmptyProvenanceLedger() {
  return {
    version: PROVENANCE_LEDGER_VERSION,
    artifacts: [],
    relationships: []
  };
}

export function validateProvenanceArtifact(artifact, label = "provenance artifact") {
  requireObject(artifact, label);
  forbidEmbeddedRelationships(artifact);
  requireText(artifact.id, `${label}.id`);
  requireText(artifact.title, `${label}.title`, 2);
  validateArtifactKind(artifact.kind, `${label}.kind`);
  if (!PROVENANCE_ORIGIN_ROLES.includes(artifact.originRole)) {
    throw new ValidationError(`${label}.originRole must be one of: ${PROVENANCE_ORIGIN_ROLES.join(", ")}.`);
  }
  for (const field of ["creator", "publisher", "sourceLocator", "notes"]) {
    validateString(artifact[field], `${label}.${field}`);
  }
  requireTimestamp(artifact.createdAt, `${label}.createdAt`);
  requireTimestamp(artifact.updatedAt, `${label}.updatedAt`);
  return artifact;
}

export function validateProvenanceRelationship(relationship, label = "provenance relationship") {
  requireObject(relationship, label);
  requireText(relationship.id, `${label}.id`);
  validateEndpointType(relationship.subjectType, `${label}.subjectType`);
  requireText(relationship.subjectId, `${label}.subjectId`);
  validateEndpointType(relationship.objectType, `${label}.objectType`);
  requireText(relationship.objectId, `${label}.objectId`);
  if (!PROVENANCE_RELATIONSHIP_TYPES.includes(relationship.relationship)) {
    throw new ValidationError(`${label}.relationship must be one of: ${PROVENANCE_RELATIONSHIP_TYPES.join(", ")}.`);
  }
  if (!RELATIONSHIP_STATUSES.includes(relationship.status)) {
    throw new ValidationError(`${label}.status must be one of: ${RELATIONSHIP_STATUSES.join(", ")}.`);
  }
  validateString(relationship.notes, `${label}.notes`);
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

export function validateProvenanceLedger(ledger, { evidenceIds = null } = {}) {
  requireObject(ledger, "Provenance ledger");
  if (ledger.version !== PROVENANCE_LEDGER_VERSION) {
    throw new ValidationError(`Unsupported provenance ledger version: ${ledger.version ?? "missing"}.`);
  }
  if (!Array.isArray(ledger.artifacts) || !Array.isArray(ledger.relationships)) {
    throw new ValidationError("Provenance ledger artifacts and relationships must be arrays.");
  }

  const artifactIds = new Set();
  ledger.artifacts.forEach((artifact, index) => {
    validateProvenanceArtifact(artifact, `provenanceLedger.artifacts[${index}]`);
    if (artifactIds.has(artifact.id)) {
      throw new ValidationError(`Duplicate provenance artifact ID: ${artifact.id}.`);
    }
    artifactIds.add(artifact.id);
  });

  const knownEvidenceIds = evidenceIds == null ? null : new Set(evidenceIds);
  const relationshipIds = new Set();
  const activeIdentities = new Set();
  ledger.relationships.forEach((relationship, index) => {
    validateProvenanceRelationship(relationship, `provenanceLedger.relationships[${index}]`);
    if (relationshipIds.has(relationship.id)) {
      throw new ValidationError(`Duplicate provenance relationship ID: ${relationship.id}.`);
    }
    relationshipIds.add(relationship.id);
    for (const side of ["subject", "object"]) {
      const type = relationship[`${side}Type`];
      const id = relationship[`${side}Id`];
      if (type === "PROVENANCE_ARTIFACT" && !artifactIds.has(id)) {
        throw new ValidationError(`Provenance relationship ${relationship.id} references unknown artifact ${id}.`);
      }
      if (type === "EVIDENCE_ITEM" && knownEvidenceIds && !knownEvidenceIds.has(id)) {
        throw new ValidationError(`Provenance relationship ${relationship.id} references unknown evidence ${id}.`);
      }
    }
    if (relationship.status === "ACTIVE") {
      const identity = relationshipIdentity(relationship);
      if (activeIdentities.has(identity)) {
        throw new ValidationError(`Duplicate active provenance relationship: ${relationship.id}.`);
      }
      activeIdentities.add(identity);
    }
  });
  assertFoundationalOriginRoleConsistency(ledger);
  assertAcyclicMaterialDependencies(ledger);
  return ledger;
}

export function normalizeProvenanceLedger(ledger, { evidenceIds = null } = {}) {
  if (ledger == null) return createEmptyProvenanceLedger();
  const normalized = cloneValue(ledger);
  validateProvenanceLedger(normalized, { evidenceIds });
  return normalized;
}

export function listProvenanceArtifacts(ledger) {
  validateProvenanceLedger(ledger);
  return cloneValue(ledger.artifacts);
}

export function listProvenanceRelationships(ledger, {
  endpointType = "",
  endpointId = "",
  includeRemoved = false
} = {}) {
  validateProvenanceLedger(ledger);
  return cloneValue(ledger.relationships.filter((item) =>
    (includeRemoved || item.status === "ACTIVE")
    && (!endpointId || (
      (item.subjectType === endpointType && item.subjectId === endpointId)
      || (item.objectType === endpointType && item.objectId === endpointId)
    ))
  ));
}

export function upsertProvenanceArtifact(ledger, item, { now = new Date() } = {}) {
  validateProvenanceLedger(ledger);
  requireObject(item, "Provenance artifact input");
  forbidEmbeddedRelationships(item);
  const existing = item.id ? ledger.artifacts.find((artifact) => artifact.id === item.id) : null;
  if (item.id && !existing) throw new ValidationError("The provenance artifact does not exist.");
  const title = String(item.title ?? existing?.title ?? "").replace(/\s+/g, " ").trim();
  requireText(title, "Provenance artifact title", 2);
  const kind = item.kind ?? existing?.kind ?? "OTHER";
  validateArtifactKind(kind);
  const originRole = item.originRole ?? existing?.originRole ?? "UNKNOWN";
  if (!PROVENANCE_ORIGIN_ROLES.includes(originRole)) {
    throw new ValidationError(`Provenance artifact origin role must be one of: ${PROVENANCE_ORIGIN_ROLES.join(", ")}.`);
  }
  const creator = item.creator ?? existing?.creator ?? "";
  const publisher = item.publisher ?? existing?.publisher ?? "";
  const sourceLocator = item.sourceLocator ?? existing?.sourceLocator ?? "";
  const notes = item.notes ?? existing?.notes ?? "";
  for (const [label, value] of Object.entries({ creator, publisher, sourceLocator, notes })) {
    validateString(value, `Provenance artifact ${label}`);
  }
  const at = timestamp(now);
  const artifact = {
    id: existing?.id || makeId("provenance_artifact", now),
    title,
    kind,
    originRole,
    creator: creator.trim(),
    publisher: publisher.trim(),
    sourceLocator: sourceLocator.trim(),
    notes: notes.trim(),
    createdAt: existing?.createdAt || at,
    updatedAt: at
  };
  validateProvenanceArtifact(artifact);
  const candidateLedger = {
    ...ledger,
    artifacts: existing
      ? ledger.artifacts.map((candidate) => candidate.id === artifact.id ? artifact : candidate)
      : [...ledger.artifacts, artifact]
  };
  validateProvenanceLedger(candidateLedger);
  return {
    ledger: candidateLedger,
    artifact: cloneValue(artifact),
    before: existing ? cloneValue(existing) : null,
    action: existing ? "UPDATED" : "CREATED"
  };
}

export function upsertProvenanceRelationship(ledger, item, {
  now = new Date(),
  evidenceIds = []
} = {}) {
  validateProvenanceLedger(ledger, { evidenceIds });
  requireObject(item, "Provenance relationship input");
  const byId = item.id
    ? ledger.relationships.find((candidate) => candidate.id === item.id && candidate.status === "ACTIVE")
    : null;
  if (item.id && !byId) {
    throw new ValidationError("The provenance relationship does not exist or has been removed.");
  }

  const subjectType = item.subjectType ?? byId?.subjectType;
  const subjectId = item.subjectId ?? byId?.subjectId;
  const objectType = item.objectType ?? byId?.objectType;
  const objectId = item.objectId ?? byId?.objectId;
  validateEndpointType(subjectType, "Provenance relationship subject type");
  validateEndpointType(objectType, "Provenance relationship object type");
  requireText(subjectId, "Provenance relationship subject ID");
  requireText(objectId, "Provenance relationship object ID");
  if (byId && (
    byId.subjectType !== subjectType
    || byId.subjectId !== subjectId
    || byId.objectType !== objectType
    || byId.objectId !== objectId
  )) {
    throw new ValidationError("A provenance relationship cannot be reassigned to different endpoints.");
  }
  const relationshipType = item.relationship ?? byId?.relationship;
  if (!PROVENANCE_RELATIONSHIP_TYPES.includes(relationshipType)) {
    throw new ValidationError(`Provenance relationship must be one of: ${PROVENANCE_RELATIONSHIP_TYPES.join(", ")}.`);
  }
  if (item.status != null && item.status !== "ACTIVE") {
    throw new ValidationError("Use the provenance relationship removal operation to preserve history.");
  }

  const existing = byId || ledger.relationships.find((candidate) =>
    candidate.status === "ACTIVE"
    && candidate.subjectType === subjectType
    && candidate.subjectId === subjectId
    && candidate.objectType === objectType
    && candidate.objectId === objectId
    && candidate.relationship === relationshipType
  );
  const notes = item.notes ?? existing?.notes ?? "";
  validateString(notes, "Provenance relationship notes");
  const normalizedNotes = notes.trim();
  if (existing && existing.relationship === relationshipType && existing.notes === normalizedNotes) {
    return {
      ledger,
      relationship: cloneValue(existing),
      before: cloneValue(existing),
      action: "UNCHANGED",
      unchanged: true
    };
  }

  const at = timestamp(now);
  const relationship = {
    id: existing?.id || makeId("provenance_relationship", now),
    subjectType,
    subjectId,
    objectType,
    objectId,
    relationship: relationshipType,
    status: "ACTIVE",
    notes: normalizedNotes,
    createdAt: existing?.createdAt || at,
    updatedAt: at,
    removedAt: "",
    removedReason: ""
  };
  validateProvenanceRelationship(relationship);
  const candidateLedger = {
    ...ledger,
    relationships: existing
      ? ledger.relationships.map((candidate) => candidate.id === relationship.id ? relationship : candidate)
      : [...ledger.relationships, relationship]
  };
  validateProvenanceLedger(candidateLedger, { evidenceIds });
  return {
    ledger: candidateLedger,
    relationship: cloneValue(relationship),
    before: existing ? cloneValue(existing) : null,
    action: existing ? "UPDATED" : "CREATED",
    unchanged: false
  };
}

export function removeProvenanceRelationship(ledger, id, {
  reason,
  now = new Date(),
  evidenceIds = null
} = {}) {
  validateProvenanceLedger(ledger, { evidenceIds });
  requireText(reason, "Provenance relationship removal reason", 3);
  const existing = ledger.relationships.find((candidate) => candidate.id === id && candidate.status === "ACTIVE");
  if (!existing) {
    throw new ValidationError("The provenance relationship does not exist or has already been removed.");
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
  validateProvenanceLedger(candidateLedger, { evidenceIds });
  return {
    ledger: candidateLedger,
    relationship: cloneValue(relationship),
    before: cloneValue(existing)
  };
}

function findCitationCycles(ledger) {
  const citations = ledger.relationships
    .filter((item) => item.status === "ACTIVE" && item.relationship === "CITES")
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id));
  const adjacency = new Map();
  const nodes = new Set();
  for (const relationship of citations) {
    const subject = endpointKey(relationship.subjectType, relationship.subjectId);
    const object = endpointKey(relationship.objectType, relationship.objectId);
    nodes.add(subject);
    nodes.add(object);
    if (!adjacency.has(subject)) adjacency.set(subject, []);
    adjacency.get(subject).push(object);
  }
  for (const edges of adjacency.values()) edges.sort();

  let index = 0;
  const indices = new Map();
  const lowLinks = new Map();
  const stack = [];
  const onStack = new Set();
  const components = [];
  function strongConnect(node) {
    indices.set(node, index);
    lowLinks.set(node, index);
    index += 1;
    stack.push(node);
    onStack.add(node);
    for (const next of adjacency.get(node) || []) {
      if (!indices.has(next)) {
        strongConnect(next);
        lowLinks.set(node, Math.min(lowLinks.get(node), lowLinks.get(next)));
      } else if (onStack.has(next)) {
        lowLinks.set(node, Math.min(lowLinks.get(node), indices.get(next)));
      }
    }
    if (lowLinks.get(node) !== indices.get(node)) return;
    const component = [];
    let current;
    do {
      current = stack.pop();
      onStack.delete(current);
      component.push(current);
    } while (current !== node);
    components.push(component.sort());
  }
  for (const node of [...nodes].sort()) {
    if (!indices.has(node)) strongConnect(node);
  }

  return components
    .filter((component) => component.length > 1 || citations.some((item) =>
      endpointKey(item.subjectType, item.subjectId) === component[0]
      && endpointKey(item.objectType, item.objectId) === component[0]
    ))
    .map((component) => {
      const componentSet = new Set(component);
      const relationshipIds = citations
        .filter((item) =>
          componentSet.has(endpointKey(item.subjectType, item.subjectId))
          && componentSet.has(endpointKey(item.objectType, item.objectId))
        )
        .map((item) => item.id)
        .sort();
      return {
        endpoints: component.map(endpointFromKey),
        relationshipIds,
        warning: "Citation cycle preserved. Citation does not establish material derivation or source independence."
      };
    })
    .sort((left, right) =>
      `${left.endpoints[0]?.type}:${left.endpoints[0]?.id}`.localeCompare(`${right.endpoints[0]?.type}:${right.endpoints[0]?.id}`)
    );
}

function statusForMappings(mappings) {
  if (mappings.length === 0 || mappings.every((item) => item.status === "UNRESOLVED")) return "UNRESOLVED";
  if (mappings.every((item) => item.status === "RESOLVED")) return "RESOLVED";
  return "PARTIAL";
}

export function analyzeIndependentEvidenceChains(ledger, {
  evidenceItems = [],
  evidenceIds = null,
  eligibleEvidenceIds = null
} = {}) {
  const allEvidenceIds = evidenceItems.map((item) => item.id);
  validateProvenanceLedger(ledger, { evidenceIds: allEvidenceIds });
  const selectedIds = evidenceIds == null
    ? evidenceItems.filter((item) => item.status === "ACTIVE").map((item) => item.id)
    : [...new Set(evidenceIds)];
  const knownEvidenceIds = new Set(allEvidenceIds);
  for (const id of selectedIds) {
    if (!knownEvidenceIds.has(id)) {
      throw new ValidationError(`Cannot analyze unknown evidence item: ${id}.`);
    }
  }
  const eligible = new Set(eligibleEvidenceIds == null ? selectedIds : eligibleEvidenceIds);
  const artifactById = new Map(ledger.artifacts.map((item) => [item.id, item]));
  const materialParents = new Map();
  for (const relationship of activeMaterialRelationships(ledger)) {
    const subject = endpointKey(relationship.subjectType, relationship.subjectId);
    if (!materialParents.has(subject)) materialParents.set(subject, []);
    materialParents.get(subject).push({
      key: endpointKey(relationship.objectType, relationship.objectId),
      relationshipId: relationship.id
    });
  }
  for (const parents of materialParents.values()) {
    parents.sort((left, right) => left.key.localeCompare(right.key) || left.relationshipId.localeCompare(right.relationshipId));
  }

  const memo = new Map();
  function resolveRoots(key) {
    if (memo.has(key)) return memo.get(key);
    const endpoint = endpointFromKey(key);
    if (endpoint.type === "PROVENANCE_ARTIFACT" && artifactById.get(endpoint.id)?.originRole === "FOUNDATIONAL") {
      const result = { roots: new Set([endpoint.id]), unresolved: false };
      memo.set(key, result);
      return result;
    }
    const parents = materialParents.get(key) || [];
    if (parents.length === 0) {
      const result = { roots: new Set(), unresolved: true };
      memo.set(key, result);
      return result;
    }
    const roots = new Set();
    let unresolved = false;
    for (const parent of parents) {
      const resolved = resolveRoots(parent.key);
      for (const root of resolved.roots) roots.add(root);
      unresolved ||= resolved.unresolved;
    }
    const result = { roots, unresolved };
    memo.set(key, result);
    return result;
  }

  const warnings = new Set();
  const mappings = selectedIds.slice().sort().map((evidenceId) => {
    const resolved = resolveRoots(endpointKey("EVIDENCE_ITEM", evidenceId));
    const foundationalRootIds = [...resolved.roots].sort();
    const status = foundationalRootIds.length === 0
      ? "UNRESOLVED"
      : (resolved.unresolved ? "PARTIAL" : "RESOLVED");
    if (status !== "RESOLVED") {
      warnings.add(`Evidence ${evidenceId} has ${status === "PARTIAL" ? "a partially unresolved" : "no resolved"} material path to an explicitly FOUNDATIONAL provenance artifact.`);
    }
    return {
      evidenceId,
      status,
      foundationalRootIds,
      eligibleForRealWorldValidation: eligible.has(evidenceId),
      chainClassification: "UNRESOLVED"
    };
  });
  const rootUsage = new Map();
  for (const mapping of mappings) {
    for (const rootId of mapping.foundationalRootIds) {
      if (!rootUsage.has(rootId)) rootUsage.set(rootId, new Set());
      rootUsage.get(rootId).add(mapping.evidenceId);
    }
  }
  for (const mapping of mappings) {
    if (mapping.foundationalRootIds.length === 0 || mapping.status !== "RESOLVED") continue;
    mapping.chainClassification = mapping.foundationalRootIds.some((rootId) => rootUsage.get(rootId).size > 1)
      ? "KNOWN_SHARED_ORIGIN"
      : "KNOWN_DISTINCT_ORIGIN";
  }

  const traceableFoundationalRootIds = [...new Set(mappings.flatMap((item) => item.foundationalRootIds))].sort();
  const eligibleMappings = mappings.filter((item) => item.eligibleForRealWorldValidation);
  const foundationalRootIds = [...new Set(eligibleMappings.flatMap((item) => item.foundationalRootIds))].sort();
  return {
    status: statusForMappings(mappings),
    eligibleRealWorldStatus: statusForMappings(eligibleMappings),
    foundationalRootIds,
    knownIndependentChainCount: foundationalRootIds.length,
    traceableFoundationalRootIds,
    traceableChainCount: traceableFoundationalRootIds.length,
    evidenceMappings: mappings,
    unresolvedEvidenceIds: mappings.filter((item) => item.status !== "RESOLVED").map((item) => item.evidenceId),
    ineligibleForRealWorldValidationEvidenceIds: mappings
      .filter((item) => !item.eligibleForRealWorldValidation)
      .map((item) => item.evidenceId),
    lineageWarnings: [...warnings].sort(),
    citationCycleWarnings: findCitationCycles(ledger)
  };
}

export function analyzeClaimIndependentEvidenceChains({
  provenanceLedger,
  claimLedger,
  evidenceItems,
  claimId,
  linkableEvidenceIds,
  eligibleEvidenceIds
}) {
  const claim = claimLedger?.claims?.find((item) => item.id === claimId);
  if (!claim) throw new ValidationError(`Cannot analyze unknown claim: ${claimId}.`);
  const linkable = new Set(linkableEvidenceIds);
  const relationships = claimLedger.evidenceRelationships.filter((item) =>
    item.claimId === claimId && item.status === "ACTIVE" && linkable.has(item.evidenceId)
  );
  const activeEvidenceIds = [...new Set(relationships.map((item) => item.evidenceId))].sort();
  const analysis = analyzeIndependentEvidenceChains(provenanceLedger, {
    evidenceItems,
    evidenceIds: activeEvidenceIds,
    eligibleEvidenceIds: activeEvidenceIds.filter((id) => eligibleEvidenceIds.includes(id))
  });
  return {
    claimId,
    claimStatus: claim.status,
    activeEvidenceIds,
    evidenceRelationships: Object.fromEntries(["SUPPORTS", "CONTRADICTS", "LIMITS"].map((relationship) => [
      relationship,
      relationships
        .filter((item) => item.relationship === relationship)
        .map((item) => item.evidenceId)
        .sort()
    ])),
    ...analysis
  };
}
