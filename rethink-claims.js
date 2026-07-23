import { ValidationError } from "./rethink-schema.js";

export const CLAIM_LEDGER_VERSION = 1;

export const CLAIM_STATUSES = Object.freeze([
  "UNKNOWN",
  "SUPPORTED",
  "CONTRADICTED",
  "DISPUTED",
  "INSUFFICIENT_EVIDENCE"
]);

export const CLAIM_EVIDENCE_RELATIONSHIPS = Object.freeze([
  "SUPPORTS",
  "CONTRADICTS",
  "LIMITS"
]);

export const CORE_CLAIM_TYPES = Object.freeze([
  "PRIMARY",
  "MATERIAL",
  "OTHER"
]);

const RELATIONSHIP_STATUSES = Object.freeze(["ACTIVE", "REMOVED"]);
const CLAIM_TYPE_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/;

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

function validateClaimType(value, label = "Claim type") {
  if (typeof value !== "string" || !CLAIM_TYPE_PATTERN.test(value)) {
    throw new ValidationError(`${label} must be an uppercase extensible type token.`);
  }
}

function validateNotes(value, label) {
  if (typeof value !== "string") {
    throw new ValidationError(`${label} must be a string.`);
  }
}

function forbidEmbeddedRelationships(claim) {
  for (const field of ["evidenceIds", "relationshipIds", "evidenceRelationships"]) {
    if (Object.hasOwn(claim, field)) {
      throw new ValidationError(`Claim records must not embed ${field}; claim-evidence relationships have one canonical source of truth.`);
    }
  }
}

export function createEmptyClaimLedger() {
  return {
    version: CLAIM_LEDGER_VERSION,
    claims: [],
    evidenceRelationships: []
  };
}

export function validateClaim(claim, label = "claim") {
  requireObject(claim, label);
  forbidEmbeddedRelationships(claim);
  requireText(claim.id, `${label}.id`);
  requireText(claim.text, `${label}.text`, 2);
  validateClaimType(claim.type, `${label}.type`);
  if (!CLAIM_STATUSES.includes(claim.status)) {
    throw new ValidationError(`${label}.status must be one of: ${CLAIM_STATUSES.join(", ")}.`);
  }
  validateNotes(claim.notes, `${label}.notes`);
  requireTimestamp(claim.createdAt, `${label}.createdAt`);
  requireTimestamp(claim.updatedAt, `${label}.updatedAt`);
  return claim;
}

export function validateClaimEvidenceRelationship(relationship, label = "claim evidence relationship") {
  requireObject(relationship, label);
  requireText(relationship.id, `${label}.id`);
  requireText(relationship.claimId, `${label}.claimId`);
  requireText(relationship.evidenceId, `${label}.evidenceId`);
  if (!CLAIM_EVIDENCE_RELATIONSHIPS.includes(relationship.relationship)) {
    throw new ValidationError(`${label}.relationship must be one of: ${CLAIM_EVIDENCE_RELATIONSHIPS.join(", ")}.`);
  }
  if (!RELATIONSHIP_STATUSES.includes(relationship.status)) {
    throw new ValidationError(`${label}.status must be one of: ${RELATIONSHIP_STATUSES.join(", ")}.`);
  }
  validateNotes(relationship.notes, `${label}.notes`);
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

export function validateClaimLedger(ledger, { evidenceIds = null } = {}) {
  requireObject(ledger, "Claim ledger");
  if (ledger.version !== CLAIM_LEDGER_VERSION) {
    throw new ValidationError(`Unsupported claim ledger version: ${ledger.version ?? "missing"}.`);
  }
  if (!Array.isArray(ledger.claims) || !Array.isArray(ledger.evidenceRelationships)) {
    throw new ValidationError("Claim ledger claims and evidenceRelationships must be arrays.");
  }

  const claimIds = new Set();
  ledger.claims.forEach((claim, index) => {
    validateClaim(claim, `claimLedger.claims[${index}]`);
    if (claimIds.has(claim.id)) {
      throw new ValidationError(`Duplicate claim ID: ${claim.id}.`);
    }
    claimIds.add(claim.id);
  });

  const knownEvidenceIds = evidenceIds == null ? null : new Set(evidenceIds);
  const relationshipIds = new Set();
  const activePairs = new Set();
  ledger.evidenceRelationships.forEach((relationship, index) => {
    validateClaimEvidenceRelationship(relationship, `claimLedger.evidenceRelationships[${index}]`);
    if (relationshipIds.has(relationship.id)) {
      throw new ValidationError(`Duplicate claim-evidence relationship ID: ${relationship.id}.`);
    }
    relationshipIds.add(relationship.id);
    if (!claimIds.has(relationship.claimId)) {
      throw new ValidationError(`Claim-evidence relationship ${relationship.id} references unknown claim ${relationship.claimId}.`);
    }
    if (knownEvidenceIds && !knownEvidenceIds.has(relationship.evidenceId)) {
      throw new ValidationError(`Claim-evidence relationship ${relationship.id} references unknown evidence ${relationship.evidenceId}.`);
    }
    if (relationship.status === "ACTIVE") {
      const pair = `${relationship.claimId}\u0000${relationship.evidenceId}`;
      if (activePairs.has(pair)) {
        throw new ValidationError(`Duplicate active claim-evidence relationship for claim ${relationship.claimId} and evidence ${relationship.evidenceId}.`);
      }
      activePairs.add(pair);
    }
  });
  return ledger;
}

export function normalizeClaimLedger(ledger, { evidenceIds = null } = {}) {
  if (ledger == null) return createEmptyClaimLedger();
  const normalized = cloneValue(ledger);
  validateClaimLedger(normalized, { evidenceIds });
  return normalized;
}

export function listClaims(ledger) {
  validateClaimLedger(ledger);
  return cloneValue(ledger.claims);
}

export function listClaimEvidenceRelationships(ledger, {
  claimId = "",
  evidenceId = "",
  includeRemoved = false
} = {}) {
  validateClaimLedger(ledger);
  return cloneValue(ledger.evidenceRelationships.filter((item) =>
    (includeRemoved || item.status === "ACTIVE")
    && (!claimId || item.claimId === claimId)
    && (!evidenceId || item.evidenceId === evidenceId)
  ));
}

export function upsertClaim(ledger, item, { now = new Date() } = {}) {
  validateClaimLedger(ledger);
  requireObject(item, "Claim input");
  forbidEmbeddedRelationships(item);
  const existing = item.id ? ledger.claims.find((claim) => claim.id === item.id) : null;
  if (item.id && !existing) {
    throw new ValidationError("The claim does not exist.");
  }
  const text = String(item.text ?? existing?.text ?? "").replace(/\s+/g, " ").trim();
  requireText(text, "Claim text", 2);
  const type = item.type ?? existing?.type ?? "MATERIAL";
  validateClaimType(type);
  const status = item.status ?? existing?.status ?? "UNKNOWN";
  if (!CLAIM_STATUSES.includes(status)) {
    throw new ValidationError(`Claim status must be one of: ${CLAIM_STATUSES.join(", ")}.`);
  }
  const notes = item.notes ?? existing?.notes ?? "";
  validateNotes(notes, "Claim notes");
  const at = timestamp(now);
  const claim = {
    id: existing?.id || makeId("claim", now),
    text,
    type,
    status,
    notes: notes.trim(),
    createdAt: existing?.createdAt || at,
    updatedAt: at
  };
  validateClaim(claim);
  return {
    ledger: {
      ...ledger,
      claims: existing
        ? ledger.claims.map((candidate) => candidate.id === claim.id ? claim : candidate)
        : [...ledger.claims, claim]
    },
    claim: cloneValue(claim),
    before: existing ? cloneValue(existing) : null,
    action: existing ? "UPDATED" : "CREATED"
  };
}

export function upsertClaimEvidenceRelationship(ledger, item, {
  now = new Date(),
  evidenceIds = [],
  knownEvidenceIds = evidenceIds
} = {}) {
  validateClaimLedger(ledger, { evidenceIds: knownEvidenceIds });
  requireObject(item, "Claim-evidence relationship input");
  const claim = ledger.claims.find((candidate) => candidate.id === item.claimId);
  if (!claim) throw new ValidationError("The linked claim does not exist.");
  if (!evidenceIds.includes(item.evidenceId)) {
    throw new ValidationError("The linked evidence item does not exist, is not active, or is not evidence.");
  }
  if (!CLAIM_EVIDENCE_RELATIONSHIPS.includes(item.relationship)) {
    throw new ValidationError(`Claim-evidence relationship must be one of: ${CLAIM_EVIDENCE_RELATIONSHIPS.join(", ")}.`);
  }

  const byId = item.id
    ? ledger.evidenceRelationships.find((candidate) => candidate.id === item.id && candidate.status === "ACTIVE")
    : null;
  if (item.id && !byId) {
    throw new ValidationError("The claim-evidence relationship does not exist or has been removed.");
  }
  if (byId && (byId.claimId !== item.claimId || byId.evidenceId !== item.evidenceId)) {
    throw new ValidationError("A claim-evidence relationship cannot be reassigned to a different claim or evidence item.");
  }
  const existing = byId || ledger.evidenceRelationships.find((candidate) =>
    candidate.status === "ACTIVE"
    && candidate.claimId === item.claimId
    && candidate.evidenceId === item.evidenceId
  );
  const notes = item.notes ?? existing?.notes ?? "";
  validateNotes(notes, "Claim-evidence relationship notes");
  const normalizedNotes = notes.trim();
  if (existing && existing.relationship === item.relationship && existing.notes === normalizedNotes) {
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
    id: existing?.id || makeId("claim_evidence", now),
    claimId: item.claimId,
    evidenceId: item.evidenceId,
    relationship: item.relationship,
    status: "ACTIVE",
    notes: normalizedNotes,
    createdAt: existing?.createdAt || at,
    updatedAt: at,
    removedAt: "",
    removedReason: ""
  };
  validateClaimEvidenceRelationship(relationship);
  return {
    ledger: {
      ...ledger,
      evidenceRelationships: existing
        ? ledger.evidenceRelationships.map((candidate) => candidate.id === relationship.id ? relationship : candidate)
        : [...ledger.evidenceRelationships, relationship]
    },
    relationship: cloneValue(relationship),
    before: existing ? cloneValue(existing) : null,
    action: existing ? "UPDATED" : "CREATED",
    unchanged: false
  };
}

export function removeClaimEvidenceRelationship(ledger, id, {
  reason,
  now = new Date()
} = {}) {
  validateClaimLedger(ledger);
  requireText(reason, "Claim-evidence relationship removal reason", 3);
  const existing = ledger.evidenceRelationships.find((candidate) => candidate.id === id && candidate.status === "ACTIVE");
  if (!existing) {
    throw new ValidationError("The claim-evidence relationship does not exist or has already been removed.");
  }
  const at = timestamp(now);
  const relationship = {
    ...existing,
    status: "REMOVED",
    updatedAt: at,
    removedAt: at,
    removedReason: reason.trim()
  };
  return {
    ledger: {
      ...ledger,
      evidenceRelationships: ledger.evidenceRelationships.map((candidate) =>
        candidate.id === id ? relationship : candidate
      )
    },
    relationship: cloneValue(relationship),
    before: cloneValue(existing)
  };
}

export function removeRelationshipsForEvidence(ledger, evidenceId, {
  reason,
  now = new Date()
} = {}) {
  validateClaimLedger(ledger);
  requireText(reason, "Claim-evidence relationship removal reason", 3);
  const at = timestamp(now);
  const removed = [];
  const evidenceRelationships = ledger.evidenceRelationships.map((candidate) => {
    if (candidate.status !== "ACTIVE" || candidate.evidenceId !== evidenceId) return candidate;
    const relationship = {
      ...candidate,
      status: "REMOVED",
      updatedAt: at,
      removedAt: at,
      removedReason: reason.trim()
    };
    removed.push(cloneValue(relationship));
    return relationship;
  });
  return {
    ledger: { ...ledger, evidenceRelationships },
    removed
  };
}
