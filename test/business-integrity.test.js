import assert from "node:assert/strict";
import test from "node:test";
import {
  BUSINESS_INTEGRITY_ANALYSIS_STATUSES,
  BUSINESS_INTEGRITY_POLICY,
  BUSINESS_INTEGRITY_POLICY_VERSION,
  analyzeBusinessIntegrity,
  createBusinessIntegrityPromptContext,
  validateBusinessIntegrityPolicy
} from "../rethink-business-integrity.js";
import {
  DOMAIN_PROFILE_REGISTRY,
  validateDomainProfile
} from "../rethink-domain-profiles.js";
import {
  analyzeProjectBusinessIntegrity,
  applyCycleOutput,
  createDemoCycle,
  createDemoRouting,
  createProjectBackup,
  createProjectReport,
  importProjectBackup,
  initializeProject,
  manageProjectState,
  normalizeProjectState
} from "../rethink-engine.js";
import { validateScopeDimension } from "../rethink-reasoning-integrity.js";
import { buildCycleInput, buildRoutingInput } from "../rethink-prompt.js";
import { renderProjectReportHtml } from "../public/report-export.js";

const fixedNow = new Date("2026-07-24T16:00:00.000Z");
const AS_OF = fixedNow.toISOString();
const businessProfile = DOMAIN_PROFILE_REGISTRY.resolve("BUSINESS");

function emptyCoreAnalysis(claimAnalyses = []) {
  return {
    analysisStatus: claimAnalyses.length ? "PARTIAL" : "UNRESOLVED",
    purpose: "CURRENT_STATE",
    asOf: AS_OF,
    totalExplicitClaims: claimAnalyses.length,
    activeCapabilityAssessmentCount: 0,
    claimsWithNoActiveEvidenceRelationships: claimAnalyses
      .filter((item) => item.activeRelationshipIds.length === 0)
      .map((item) => item.claimId),
    claimsWithUnassessedEvidenceFit: [],
    claimsWithOnlyPartialOrNotFitSupport: [],
    claimsWithUnsupportedAbsenceInference: claimAnalyses
      .filter((item) => item.unsupportedAbsenceInferences.length > 0)
      .map((item) => item.claimId),
    claimsSupportedByOnlyOneKnownIndependentChain: claimAnalyses
      .filter((item) => item.independentChains.SUPPORTS.knownIndependentFoundationalRootCount === 1)
      .map((item) => item.claimId),
    claimsWithMultipleItemsFromOneSharedChain: claimAnalyses
      .filter((item) =>
        item.independentChains.SUPPORTS.evidenceItemCount > 1
        && item.independentChains.SUPPORTS.knownIndependentFoundationalRootCount === 1
      )
      .map((item) => item.claimId),
    claimsWithUnresolvedProvenance: claimAnalyses
      .filter((item) => item.unresolvedOriginEvidenceIds.length > 0)
      .map((item) => item.claimId),
    claimsWithUnresolvedTemporalState: claimAnalyses
      .filter((item) => item.unresolvedTemporalEvidenceIds.length > 0)
      .map((item) => item.claimId),
    claimsWithNoRecordedDisconfirmingEvidence: claimAnalyses
      .filter((item) => item.disconfirmationCoverage.status === "NONE_RECORDED")
      .map((item) => item.claimId),
    claimsWithClaimStatusConsistencyWarnings: claimAnalyses
      .filter((item) => item.claimStatusConsistencyWarnings.length > 0)
      .map((item) => item.claimId),
    technicalFailureCount: 0,
    warningCodes: [...new Set(claimAnalyses.flatMap((item) => item.integrityWarnings))].sort(),
    claimAnalyses,
    interpretationPolicy: ["Core remains canonical."]
  };
}

function emptyChains() {
  return {
    SUPPORTS: {
      evidenceItemCount: 0,
      knownIndependentFoundationalRootCount: 0,
      traceableFoundationalRootIds: [],
      unresolvedOriginEvidenceIds: []
    },
    CONTRADICTS: {
      evidenceItemCount: 0,
      knownIndependentFoundationalRootCount: 0,
      traceableFoundationalRootIds: [],
      unresolvedOriginEvidenceIds: []
    },
    LIMITS: {
      evidenceItemCount: 0,
      knownIndependentFoundationalRootCount: 0,
      traceableFoundationalRootIds: [],
      unresolvedOriginEvidenceIds: []
    }
  };
}

function coreClaim(extra = {}) {
  return {
    claimId: "claim_1",
    claimStatus: "UNKNOWN",
    analysisStatus: "PARTIAL",
    activeRelationships: { SUPPORTS: [], CONTRADICTS: [], LIMITS: [] },
    activeRelationshipIds: [],
    capabilityAssessedRelationshipIds: [],
    unassessedRelationshipIds: [],
    fitGroups: { UNKNOWN: [], FIT: [], PARTIAL: [], NOT_FIT: [] },
    scopeMismatches: [],
    detectionCapabilityWeaknesses: [],
    unsupportedAbsenceInferences: [],
    independentChains: emptyChains(),
    sharedFoundationalRootsAcrossRelationshipTypes: [],
    unresolvedOriginEvidenceIds: [],
    temporalAnalysis: {},
    temporalWarnings: [],
    unresolvedTemporalEvidenceIds: [],
    syntheticOrIneligibleEvidenceIds: [],
    disconfirmationCoverage: {
      status: "RECORDED",
      relationshipIds: [],
      warnings: [],
      interpretation: "No recorded disconfirmation is not proof that none exists."
    },
    claimStatusConsistencyWarnings: [],
    integrityWarnings: [],
    ...extra
  };
}

function analyze({
  claimAnalyses = [],
  claims = [],
  relationships = [],
  evidenceItems = [],
  humanGates = [],
  currentDisposition = "CONTINUE",
  propositionStatus = "UNRESOLVED",
  researchHistory = []
} = {}) {
  return analyzeBusinessIntegrity({
    profile: businessProfile,
    policy: BUSINESS_INTEGRITY_POLICY,
    reasoningIntegrityAnalysis: emptyCoreAnalysis(claimAnalyses),
    claimLedger: { version: 1, claims, evidenceRelationships: relationships },
    evidenceItems,
    humanGates,
    currentDisposition,
    propositionStatus,
    researchHistory,
    asOf: AS_OF
  });
}

function addEvidence(state, item, minute) {
  return manageProjectState(state, {
    type: "UPSERT_EVIDENCE",
    reason: "Record Business Integrity regression evidence.",
    item: {
      intakeType: "PUBLIC_SOURCE_FINDING",
      provenanceOrigin: "EXTERNAL_SOURCE",
      sourceClassification: "SECONDARY_SOURCE",
      sourceCategory: "MARKET_RESEARCH",
      sourceTitle: "Business market source",
      sourceUrl: "https://example.com/business-source",
      sourceDate: "2026-07-01",
      reliability: "MODERATE",
      relationship: "NONE_UNLINKED",
      population: "U.S. businesses",
      collectionMethod: "SECONDARY_DATA_ANALYSIS",
      methodDetails: "Public market analysis.",
      observation: "",
      assessment: "Useful public context with explicit scope limits.",
      assumptionIds: [],
      questionRefs: [],
      ...item
    }
  }, { now: new Date(fixedNow.getTime() + minute * 60_000) });
}

test("BUSINESS profile owns one stable versioned policy and planned profiles do not inherit it", () => {
  assert.equal(BUSINESS_INTEGRITY_POLICY_VERSION, "1.0.0");
  assert.equal(validateBusinessIntegrityPolicy(BUSINESS_INTEGRITY_POLICY), BUSINESS_INTEGRITY_POLICY);
  assert.equal(validateDomainProfile(businessProfile), businessProfile);
  assert.deepEqual(businessProfile.businessIntegrityPolicy, BUSINESS_INTEGRITY_POLICY);
  assert.equal(businessProfile.availability, "ACTIVE");
  assert.deepEqual(
    DOMAIN_PROFILE_REGISTRY.list().map((profile) => [profile.id, profile.availability, Boolean(profile.businessIntegrityPolicy)]),
    [
      ["BUSINESS", "ACTIVE", true],
      ["GENERAL", "PLANNED", false],
      ["APPS", "PLANNED", false],
      ["NEWS", "PLANNED", false]
    ]
  );
  assert.throws(
    () => validateDomainProfile({ ...DOMAIN_PROFILE_REGISTRY.get("GENERAL"), businessIntegrityPolicy: BUSINESS_INTEGRITY_POLICY }),
    /only with the BUSINESS/i
  );
});

test("Business Integrity analysis requires BUSINESS and rejects use by another profile", () => {
  assert.throws(() => analyzeBusinessIntegrity({
    profile: { id: "APPS", version: "1.0.0" },
    policy: BUSINESS_INTEGRITY_POLICY,
    reasoningIntegrityAnalysis: emptyCoreAnalysis(),
    claimLedger: { claims: [], evidenceRelationships: [] },
    evidenceItems: [],
    asOf: AS_OF
  }), /requires the active BUSINESS/i);
  assert.equal(createBusinessIntegrityPromptContext({
    profile: { id: "APPS", version: "1.0.0" },
    analysis: null
  }), null);
});

test("empty ledgers produce deterministic unresolved derived analysis without mutable Business state or a score", () => {
  const state = initializeProject("A business proposition needs bounded integrity review.", { now: fixedNow });
  const before = structuredClone(state);
  const first = analyzeProjectBusinessIntegrity(state, { asOf: AS_OF });
  const second = analyzeProjectBusinessIntegrity(state, { asOf: AS_OF });
  assert.deepEqual(first, second);
  assert.deepEqual(state, before);
  assert.equal(first.analysisStatus, "UNRESOLVED");
  assert.deepEqual(first.applicableClaimIds, []);
  assert.equal(first.policyVersion, "1.0.0");
  assert.ok(BUSINESS_INTEGRITY_ANALYSIS_STATUSES.includes(first.analysisStatus));
  for (const forbiddenField of [
    "score",
    "viabilityPercentage",
    "confidencePercentage",
    "successProbability",
    "goNoGo"
  ]) assert.equal(Object.hasOwn(first, forbiddenField), false);
  assert.equal(Object.hasOwn(state, "businessIntegrity"), false);
});

test("Business analysis prioritizes Core warnings without copying Capability Assessments or changing claims", () => {
  const claim = coreClaim({
    claimId: "claim_scope",
    activeRelationshipIds: ["rel_1"],
    activeRelationships: {
      SUPPORTS: [{ id: "rel_1", claimId: "claim_scope", evidenceId: "evidence_1", relationship: "SUPPORTS" }],
      CONTRADICTS: [],
      LIMITS: []
    },
    integrityWarnings: ["CLAIM_EXCEEDS_EVIDENCE_SCOPE", "DETECTION_CAPABILITY_LIMITED"]
  });
  const result = analyze({
    claimAnalyses: [claim],
    claims: [{ id: "claim_scope", text: "The business outcome applies to the target market.", status: "UNKNOWN" }],
    relationships: claim.activeRelationships.SUPPORTS,
    evidenceItems: [{ id: "evidence_1", status: "ACTIVE", claim: "Broad evidence." }]
  });
  assert.ok(result.warningCodes.includes("CLAIM_EXCEEDS_EVIDENCE_SCOPE"));
  assert.ok(result.warningCodes.includes("DETECTION_CAPABILITY_LIMITED"));
  assert.equal(result.highPriorityIntegrityWarnings[0].source, "CORE_REASONING_INTEGRITY");
  assert.doesNotMatch(JSON.stringify(result), /capabilityAssessments/);
  assert.equal(result.propositionStatus, "UNRESOLVED");
});

test("explicit market, customer, geography, time, and endpoint scope gaps receive advisory Business warnings", () => {
  const dimensions = [
    ["POPULATION", "PARTIAL"],
    ["CUSTOMER_SEGMENT", "MISMATCHED"],
    ["GEOGRAPHY", "MISMATCHED"],
    ["TIME", "UNKNOWN"],
    ["ENDPOINT", "PARTIAL"]
  ].map(([dimension, fitStatus], index) => ({
    relationshipId: "rel_scope",
    evidenceId: "evidence_scope",
    assessmentId: "assessment_scope",
    dimension,
    fitStatus,
    claimScope: "Target U.S. small-business customer purchases and profit this year.",
    evidenceScope: "Broad international survey interest and revenue in an earlier period.",
    rationale: `Explicit ${dimension.toLowerCase()} scope comparison ${index + 1}.`
  }));
  const claim = coreClaim({
    claimId: "claim_scope",
    activeRelationshipIds: ["rel_scope"],
    activeRelationships: {
      SUPPORTS: [{ id: "rel_scope", claimId: "claim_scope", evidenceId: "evidence_scope", relationship: "SUPPORTS" }],
      CONTRADICTS: [],
      LIMITS: []
    },
    scopeMismatches: dimensions,
    integrityWarnings: ["EVIDENCE_SCOPE_PARTIAL", "EVIDENCE_SCOPE_MISMATCH"]
  });
  const result = analyze({
    claimAnalyses: [claim],
    claims: [{ id: "claim_scope", text: "Target U.S. small-business customer purchases and profit this year.", status: "UNKNOWN" }],
    relationships: claim.activeRelationships.SUPPORTS,
    evidenceItems: [{ id: "evidence_scope", status: "ACTIVE", claim: "Broad survey interest and revenue." }]
  });
  for (const code of [
    "BUSINESS_TARGET_MARKET_SCOPE_UNRESOLVED",
    "BUSINESS_CUSTOMER_SEGMENT_MISMATCH",
    "BUSINESS_GEOGRAPHY_MISMATCH",
    "BUSINESS_TIME_HORIZON_UNRESOLVED",
    "BUSINESS_PROXY_ENDPOINT_REQUIRES_QUALIFICATION"
  ]) assert.ok(result.warningCodes.includes(code), code);
  assert.equal(result.unresolvedMarketScopeIssues.length, 1);
  assert.equal(result.unresolvedCustomerSegmentIssues.length, 1);
  assert.equal(result.unresolvedGeographyIssues.length, 1);
});

test("interest is not purchase evidence, revenue is not profitability, and public data is not private operating data", () => {
  const relationship = {
    id: "rel_boundary",
    claimId: "claim_boundary",
    evidenceId: "evidence_public",
    relationship: "SUPPORTS"
  };
  const claim = coreClaim({
    claimId: "claim_boundary",
    activeRelationshipIds: [relationship.id],
    activeRelationships: { SUPPORTS: [relationship], CONTRADICTS: [], LIMITS: [] },
    scopeMismatches: [{
      relationshipId: relationship.id,
      evidenceId: relationship.evidenceId,
      assessmentId: "assessment_boundary",
      dimension: "ENDPOINT",
      fitStatus: "PARTIAL",
      claimScope: "Actual customer conversion, purchases, retention, and profitability.",
      evidenceScope: "Survey interest, search volume, clicks, and public revenue estimates.",
      rationale: "The public proxy endpoints do not measure the private operating outcomes."
    }]
  });
  const result = analyze({
    claimAnalyses: [claim],
    claims: [{
      id: "claim_boundary",
      text: "Actual customer conversion, retention, and profitability will be achieved.",
      status: "INSUFFICIENT_EVIDENCE"
    }],
    relationships: [relationship],
    evidenceItems: [{
      id: "evidence_public",
      status: "ACTIVE",
      intakeType: "PUBLIC_SOURCE_FINDING",
      provenanceOrigin: "EXTERNAL_SOURCE",
      sourceCategory: "MARKET_RESEARCH",
      claim: "A public survey reports interest, clicks, and revenue estimates.",
      assessment: "No private operating data was measured.",
      population: "Broad market"
    }]
  });
  for (const code of [
    "BUSINESS_PROXY_ENDPOINT_REQUIRES_QUALIFICATION",
    "BUSINESS_INTEREST_NOT_PURCHASE_EVIDENCE",
    "BUSINESS_REVENUE_NOT_PROFITABILITY_EVIDENCE",
    "BUSINESS_PUBLIC_DATA_NOT_PRIVATE_OPERATING_DATA"
  ]) assert.ok(result.warningCodes.includes(code), code);
  assert.deepEqual(result.publicEvidenceBoundary.publicEvidenceLimitations[0].publicEvidenceIds, ["evidence_public"]);
});

test("supporting Evidence Item count remains distinct from Core independent-chain count", () => {
  const relationshipA = { id: "rel_a", claimId: "claim_chain", evidenceId: "evidence_a", relationship: "SUPPORTS" };
  const relationshipB = { id: "rel_b", claimId: "claim_chain", evidenceId: "evidence_b", relationship: "SUPPORTS" };
  const shared = coreClaim({
    claimId: "claim_chain",
    activeRelationshipIds: ["rel_a", "rel_b"],
    activeRelationships: { SUPPORTS: [relationshipA, relationshipB], CONTRADICTS: [], LIMITS: [] },
    independentChains: {
      ...emptyChains(),
      SUPPORTS: {
        evidenceItemCount: 2,
        knownIndependentFoundationalRootCount: 1,
        traceableFoundationalRootIds: ["root_shared"],
        unresolvedOriginEvidenceIds: []
      }
    },
    integrityWarnings: ["MULTIPLE_ITEMS_SHARE_ONE_FOUNDATIONAL_CHAIN"]
  });
  const oneChain = analyze({
    claimAnalyses: [shared],
    claims: [{ id: "claim_chain", text: "The proposition has independent support.", status: "UNKNOWN" }],
    relationships: [relationshipA, relationshipB],
    evidenceItems: [
      { id: "evidence_a", status: "ACTIVE" },
      { id: "evidence_b", status: "ACTIVE" }
    ]
  });
  assert.equal(oneChain.supportingEvidenceItemCount, 2);
  assert.equal(oneChain.knownIndependentSupportingChainCount, 1);
  assert.ok(oneChain.warningCodes.includes("BUSINESS_SINGLE_CHAIN_SUPPORT"));

  const independent = structuredClone(shared);
  independent.independentChains.SUPPORTS.knownIndependentFoundationalRootCount = 2;
  independent.independentChains.SUPPORTS.traceableFoundationalRootIds = ["root_a", "root_b"];
  independent.integrityWarnings = [];
  const twoChains = analyze({
    claimAnalyses: [independent],
    claims: [{ id: "claim_chain", text: "The proposition has independent support.", status: "UNKNOWN" }],
    relationships: [relationshipA, relationshipB],
    evidenceItems: [
      { id: "evidence_a", status: "ACTIVE" },
      { id: "evidence_b", status: "ACTIVE" }
    ]
  });
  assert.equal(twoChains.knownIndependentSupportingChainCount, 2);
  assert.equal(twoChains.warningCodes.includes("BUSINESS_SINGLE_CHAIN_SUPPORT"), false);
});

test("unresolved provenance and historical, outdated, corrected, or superseded support remain visible", () => {
  const warningCodes = [
    "SUPPORT_HAS_UNRESOLVED_ORIGIN",
    "SUPPORT_HAS_UNRESOLVED_TEMPORAL_STATE",
    "SUPPORT_RELIES_ON_HISTORICAL_SOURCE",
    "SUPPORT_RELIES_ON_OUTDATED_SOURCE",
    "SUPPORT_RELIES_ON_CORRECTED_SOURCE",
    "SUPPORT_RELIES_ON_SUPERSEDED_SOURCE"
  ];
  const claim = coreClaim({
    claimId: "claim_time",
    unresolvedOriginEvidenceIds: ["evidence_time"],
    unresolvedTemporalEvidenceIds: ["evidence_time"],
    temporalWarnings: warningCodes.slice(1),
    independentChains: {
      ...emptyChains(),
      SUPPORTS: {
        evidenceItemCount: 1,
        knownIndependentFoundationalRootCount: 0,
        traceableFoundationalRootIds: [],
        unresolvedOriginEvidenceIds: ["evidence_time"]
      }
    },
    integrityWarnings: warningCodes
  });
  const result = analyze({
    claimAnalyses: [claim],
    claims: [{ id: "claim_time", text: "The market result is current.", status: "UNKNOWN" }]
  });
  for (const code of warningCodes) assert.ok(result.warningCodes.includes(code), code);
  assert.deepEqual(result.unresolvedProvenance, [{ claimId: "claim_time", evidenceIds: ["evidence_time"] }]);
  assert.equal(result.currentVersusHistoricalSupport.length, 1);
  assert.ok(result.warningCodes.includes("BUSINESS_TIME_HORIZON_UNRESOLVED"));
});

test("detection, absence, disconfirmation, and synthetic limitations are surfaced without a negative conclusion", () => {
  const claim = coreClaim({
    claimId: "claim_safeguards",
    detectionCapabilityWeaknesses: [{
      relationshipId: "rel_synthetic",
      evidenceId: "evidence_synthetic",
      assessmentId: "assessment_synthetic",
      detectionMaterial: true,
      detectionCapability: "INADEQUATE"
    }],
    unsupportedAbsenceInferences: [{
      relationshipId: "rel_synthetic",
      evidenceId: "evidence_synthetic",
      assessmentId: "assessment_synthetic",
      absenceInferenceStatus: "UNSUPPORTED",
      detectionCapability: "INADEQUATE"
    }],
    syntheticOrIneligibleEvidenceIds: ["evidence_synthetic"],
    disconfirmationCoverage: {
      status: "NONE_RECORDED",
      relationshipIds: [],
      warnings: ["NO_RECORDED_DISCONFIRMING_EVIDENCE"],
      interpretation: "No recorded disconfirmation is not proof that none exists."
    },
    integrityWarnings: [
      "DETECTION_CAPABILITY_INADEQUATE",
      "ABSENCE_INFERENCE_UNSUPPORTED",
      "NO_RECORDED_DISCONFIRMING_EVIDENCE"
    ]
  });
  const result = analyze({
    claimAnalyses: [claim],
    claims: [{ id: "claim_safeguards", text: "No demand exists.", status: "INSUFFICIENT_EVIDENCE" }],
    evidenceItems: [{ id: "evidence_synthetic", status: "ACTIVE", evidenceAuthenticity: "SYNTHETIC_SIMULATED" }],
    propositionStatus: "INSUFFICIENT_EVIDENCE"
  });
  assert.equal(result.analysisStatus, "BLOCKED_BY_EVIDENCE_GAP");
  assert.ok(result.warningCodes.includes("BUSINESS_DISCONFIRMATION_NOT_RECORDED"));
  assert.deepEqual(result.syntheticOrIneligibleSupport, [{
    claimId: "claim_safeguards",
    evidenceIds: ["evidence_synthetic"]
  }]);
  assert.equal(result.propositionStatus, "INSUFFICIENT_EVIDENCE");
});

test("existing Human / Real-World requirements are surfaced but never satisfied or fabricated", () => {
  const gate = {
    id: "gate_1",
    status: "OPEN",
    gateType: "HUMAN_REAL_WORLD_INPUT_REQUIRED",
    question: "What do actual contractor operating histories show?",
    requiredInput: "Audited 12-month operating histories.",
    why: "Public sources cannot establish the private endpoint."
  };
  const result = analyze({
    humanGates: [gate],
    currentDisposition: "HUMAN_REAL_WORLD_INPUT_REQUIRED",
    researchHistory: [{ status: "COMPLETED", propositionStatus: "INSUFFICIENT_EVIDENCE" }]
  });
  assert.equal(result.humanRealWorldInputRequirements.length, 1);
  assert.equal(result.humanRealWorldInputRequirements[0].gateId, "gate_1");
  assert.ok(result.warningCodes.includes("BUSINESS_REAL_WORLD_INPUT_REQUIRED"));
  assert.equal(result.publicEvidenceBoundary.completedPublicResearchCount, 1);
  assert.equal(gate.status, "OPEN");
});

test("extensible Business scope dimensions remain valid optional Core dimensions", () => {
  for (const dimension of [
    "CUSTOMER_SEGMENT",
    "INDUSTRY",
    "COMPANY_SIZE",
    "BUSINESS_MODEL",
    "SALES_CHANNEL",
    "PRICE_POINT",
    "PURCHASE_INTENT",
    "REVENUE",
    "COST",
    "OPERATIONAL_CONTEXT"
  ]) {
    assert.doesNotThrow(() => validateScopeDimension({
      dimension,
      claimScope: "The claim-specific business scope.",
      evidenceScope: "The recorded evidence scope.",
      fitStatus: "UNKNOWN",
      rationale: "Optional dimension recorded only because it is material here."
    }));
  }
  assert.doesNotThrow(() => normalizeProjectState(initializeProject(
    "A legacy business project has no Business-specific scope dimensions.",
    { now: fixedNow }
  )));
});

test("BUSINESS prompts contain bounded guidance and only the derived review, not duplicated Core state", () => {
  const state = initializeProject("A service may convert market interest into paying customers.", { now: fixedNow });
  const route = createDemoRouting(state);
  const routingInput = buildRoutingInput(state, { asOf: AS_OF });
  const cycleInput = buildCycleInput(state, route, { asOf: AS_OF });
  for (const input of [routingInput, cycleInput]) {
    assert.match(input, /"businessIntegrity"/);
    assert.match(input, /Do not treat awareness, interest, clicks, downloads, search volume, or survey responses as purchases/);
    assert.match(input, /Do not treat revenue as profitability/);
    assert.match(input, /Count explicit independent foundational chains, not documents/);
    assert.doesNotMatch(input, /"capabilityAssessments":\s*\[[^\]]+\][\s\S]*"businessIntegrity"/);
    assert.doesNotMatch(input, /viability percentage|automatic GO \/ NO-GO/i);
  }
  assert.throws(() => buildRoutingInput({ ...state, domainProfile: "APPS" }), /unavailable/i);
});

test("BUSINESS reports contain a concise advisory section and distinguish items from chains", () => {
  const state = initializeProject("A business investigation needs an integrity report.", { now: fixedNow });
  const report = createProjectReport(state, { now: fixedNow });
  const html = renderProjectReportHtml(report);
  assert.equal(report.businessIntegrity.profileId, "BUSINESS");
  assert.equal(report.businessIntegrity.policyVersion, "1.0.0");
  assert.match(html, /<h2>Business Integrity<\/h2>/);
  assert.match(html, /Supporting Evidence Items/);
  assert.match(html, /Known independent supporting chains/);
  assert.match(html, /does not calculate a viability score/i);
  assert.doesNotMatch(html, /viability percentage|success probability|investment recommendation/i);

  const nonBusinessReport = { ...report, domainProfile: "APPS" };
  delete nonBusinessReport.businessIntegrity;
  assert.doesNotMatch(renderProjectReportHtml(nonBusinessReport), /<h2>Business Integrity<\/h2>/);
});

test("derived Business analysis does not enter canonical project state or change backup versions", () => {
  const state = initializeProject("A business project must round-trip without derived profile state.", { now: fixedNow });
  analyzeProjectBusinessIntegrity(state, { asOf: AS_OF });
  const backup = createProjectBackup(state, { now: fixedNow });
  assert.equal(backup.formatVersion, 1);
  assert.equal(Object.hasOwn(backup.project, "businessIntegrity"), false);
  const imported = importProjectBackup(backup, { now: new Date("2026-07-24T16:05:00.000Z") });
  assert.equal(Object.hasOwn(imported, "businessIntegrity"), false);
  assert.equal(imported.domainProfile, "BUSINESS");
  assert.equal(imported.reasoningIntegrityLedger.version, 1);
});

test("real Core Capability state drives Business warnings while Claim and proposition state stay unchanged", () => {
  let state = initializeProject("A public survey proves actual customer purchases and profitability.", { now: fixedNow });
  const evidenceResult = addEvidence(state, {
    claim: "A public survey reports interest and revenue.",
    population: "Broad U.S. businesses",
    assessment: "Survey interest is a proxy and does not establish purchases or profitability."
  }, 1);
  state = evidenceResult.state;
  const evidenceId = state.evidence.at(-1).id;
  const claimResult = manageProjectState(state, {
    type: "UPSERT_CLAIM",
    reason: "Record the material business claim.",
    item: {
      text: "Target small-business customers will make actual purchases profitably.",
      type: "MATERIAL",
      status: "INSUFFICIENT_EVIDENCE",
      notes: ""
    }
  }, { now: new Date("2026-07-24T16:02:00.000Z") });
  state = claimResult.state;
  const relationshipResult = manageProjectState(state, {
    type: "UPSERT_CLAIM_EVIDENCE_RELATIONSHIP",
    reason: "Link the public proxy to the explicit claim.",
    item: {
      claimId: claimResult.claim.id,
      evidenceId,
      relationship: "SUPPORTS",
      notes: ""
    }
  }, { now: new Date("2026-07-24T16:03:00.000Z") });
  state = relationshipResult.state;
  state = manageProjectState(state, {
    type: "UPSERT_CAPABILITY_ASSESSMENT",
    reason: "Record explicit claim-specific endpoint capability.",
    item: {
      claimEvidenceRelationshipId: relationshipResult.relationship.id,
      overallFit: "PARTIAL",
      scopeDimensions: [{
        dimension: "ENDPOINT",
        claimScope: "Actual customer purchases and profitability.",
        evidenceScope: "Survey interest and public revenue.",
        fitStatus: "PARTIAL",
        rationale: "Interest and revenue are proxy endpoints."
      }],
      detectionMaterial: false,
      detectionCapability: "NOT_APPLICABLE",
      absenceInferenceStatus: "NOT_APPLICABLE",
      rationale: "The evidence can provide context but cannot establish the claimed endpoints.",
      notes: ""
    }
  }, { now: new Date("2026-07-24T16:04:00.000Z") }).state;
  const claimBefore = structuredClone(state.claimLedger);
  const dispositionBefore = state.currentDisposition;
  const result = analyzeProjectBusinessIntegrity(state, { asOf: AS_OF });
  assert.ok(result.warningCodes.includes("BUSINESS_INTEREST_NOT_PURCHASE_EVIDENCE"));
  assert.ok(result.warningCodes.includes("BUSINESS_REVENUE_NOT_PROFITABILITY_EVIDENCE"));
  assert.deepEqual(state.claimLedger, claimBefore);
  assert.equal(state.currentDisposition, dispositionBefore);
  assert.equal(state.claimLedger.claims[0].status, "INSUFFICIENT_EVIDENCE");
});

test("contractor DEFINE to VALIDATE to PUBLIC_RESEARCH_REQUIRED progression remains unchanged", () => {
  const input = "For NAICS 238910 U.S. contractors with 1–19 employees and no redundant critical earthmoving machine, determine whether at least one unplanned critical-machine event per 1,000 operating hours and at least 1% annual revenue or one fully burdened crew-day per event remains after mitigation.";
  const initial = initializeProject(input, { now: fixedNow });
  const defineRoute = createDemoRouting(initial);
  assert.equal(defineRoute.selectedMethod, "DEFINE");
  const defined = applyCycleOutput(
    initial,
    defineRoute,
    createDemoCycle(initial, defineRoute),
    { mode: "demo", model: "deterministic-demo" },
    { now: new Date("2026-07-24T16:01:00.000Z") }
  ).state;
  const validationRoute = createDemoRouting(defined);
  assert.equal(validationRoute.selectedMethod, "VALIDATE");
  assert.equal(validationRoute.evidenceGate, "PUBLIC_RESEARCH_REQUIRED");
  assert.equal(defined.domainProfile, "BUSINESS");
  assert.equal(defined.currentDisposition, "VALIDATE");
  const analysis = analyzeProjectBusinessIntegrity(defined, { asOf: defined.updatedAt });
  assert.equal(analysis.analysisStatus, "UNRESOLVED");
  assert.equal(analysis.propositionStatus, "INSUFFICIENT_EVIDENCE");
  assert.doesNotMatch(JSON.stringify({ defined, validationRoute, analysis }), /workforce|fair-work|disabled veteran|employer segment/i);
});

test("contractor acceptance fixture preserves insufficient evidence and the real-world input boundary", () => {
  const publicRelationship = {
    id: "rel_contractor_public",
    claimId: "claim_contractor_threshold",
    evidenceId: "evidence_industry",
    relationship: "SUPPORTS"
  };
  const syntheticRelationship = {
    id: "rel_contractor_synthetic",
    claimId: "claim_contractor_threshold",
    evidenceId: "evidence_synthetic",
    relationship: "SUPPORTS"
  };
  const claimAnalysis = coreClaim({
    claimId: "claim_contractor_threshold",
    claimStatus: "INSUFFICIENT_EVIDENCE",
    activeRelationshipIds: [publicRelationship.id, syntheticRelationship.id],
    activeRelationships: {
      SUPPORTS: [publicRelationship, syntheticRelationship],
      CONTRADICTS: [],
      LIMITS: []
    },
    scopeMismatches: [
      {
        relationshipId: publicRelationship.id,
        evidenceId: publicRelationship.evidenceId,
        assessmentId: "assessment_contractor_population",
        dimension: "POPULATION",
        fitStatus: "PARTIAL",
        claimScope: "NAICS 238910 U.S. contractors with 1–19 employees and no redundant critical earthmoving machine.",
        evidenceScope: "Broad construction-equipment rental and reliability market.",
        rationale: "Industry-wide evidence does not establish the narrow target contractor segment."
      },
      {
        relationshipId: publicRelationship.id,
        evidenceId: publicRelationship.evidenceId,
        assessmentId: "assessment_contractor_endpoint",
        dimension: "ENDPOINT",
        fitStatus: "PARTIAL",
        claimScope: "Audited 12-month operating histories showing event frequency and at least 1% annual revenue or one fully burdened crew-day per event after mitigation.",
        evidenceScope: "Public rental and reliability reports provide contextual proxy measures.",
        rationale: "The public proxy does not measure the contractor-specific operational and financial endpoint."
      }
    ],
    independentChains: {
      ...emptyChains(),
      SUPPORTS: {
        evidenceItemCount: 2,
        knownIndependentFoundationalRootCount: 1,
        traceableFoundationalRootIds: ["root_industry_report"],
        unresolvedOriginEvidenceIds: ["evidence_industry"]
      }
    },
    unresolvedOriginEvidenceIds: ["evidence_industry"],
    syntheticOrIneligibleEvidenceIds: ["evidence_synthetic"],
    disconfirmationCoverage: {
      status: "NONE_RECORDED",
      relationshipIds: [],
      warnings: ["NO_RECORDED_DISCONFIRMING_EVIDENCE"],
      interpretation: "No recorded disconfirmation is not proof that none exists."
    },
    integrityWarnings: [
      "EVIDENCE_SCOPE_PARTIAL",
      "MULTIPLE_ITEMS_SHARE_ONE_FOUNDATIONAL_CHAIN",
      "SUPPORT_HAS_UNRESOLVED_ORIGIN",
      "NO_RECORDED_DISCONFIRMING_EVIDENCE",
      "CLAIM_STATUS_REQUIRES_REVIEW"
    ],
    claimStatusConsistencyWarnings: ["CLAIM_MARKED_INSUFFICIENT_BUT_EVIDENCE_STATE_REQUIRES_REVIEW"]
  });
  const result = analyze({
    claimAnalyses: [claimAnalysis],
    claims: [{
      id: "claim_contractor_threshold",
      text: "The target contractor segment experiences the stated event-frequency and private financial-impact threshold.",
      status: "INSUFFICIENT_EVIDENCE"
    }],
    relationships: [publicRelationship, syntheticRelationship],
    evidenceItems: [
      {
        id: "evidence_industry",
        status: "ACTIVE",
        intakeType: "PUBLIC_SOURCE_FINDING",
        provenanceOrigin: "EXTERNAL_SOURCE",
        sourceCategory: "INDUSTRY_ASSOCIATION",
        claim: "Broad rental and reliability reports describe industry conditions.",
        assessment: "Contextual proxy only.",
        population: "Broad construction-equipment market"
      },
      {
        id: "evidence_synthetic",
        status: "ACTIVE",
        evidenceAuthenticity: "SYNTHETIC_SIMULATED",
        claim: "A simulated contractor dataset reaches the threshold."
      }
    ],
    humanGates: [{
      id: "gate_contractor",
      status: "OPEN",
      gateType: "HUMAN_REAL_WORLD_INPUT_REQUIRED",
      question: "What do audited 12-month target-contractor histories show?",
      requiredInput: "Representative real-world operating and financial records.",
      why: "Public and synthetic evidence cannot establish the narrow endpoint."
    }],
    currentDisposition: "HUMAN_REAL_WORLD_INPUT_REQUIRED",
    propositionStatus: "INSUFFICIENT_EVIDENCE",
    researchHistory: [{ executionStatus: "COMPLETED", propositionStatus: "INSUFFICIENT_EVIDENCE" }]
  });
  assert.equal(result.propositionStatus, "INSUFFICIENT_EVIDENCE");
  assert.equal(result.analysisStatus, "BLOCKED_BY_EVIDENCE_GAP");
  assert.equal(result.supportingEvidenceItemCount, 2);
  assert.equal(result.knownIndependentSupportingChainCount, 1);
  assert.deepEqual(result.syntheticOrIneligibleSupport[0].evidenceIds, ["evidence_synthetic"]);
  for (const code of [
    "BUSINESS_TARGET_MARKET_SCOPE_UNRESOLVED",
    "BUSINESS_PROXY_ENDPOINT_REQUIRES_QUALIFICATION",
    "BUSINESS_PUBLIC_DATA_NOT_PRIVATE_OPERATING_DATA",
    "BUSINESS_SINGLE_CHAIN_SUPPORT",
    "BUSINESS_REAL_WORLD_INPUT_REQUIRED",
    "BUSINESS_DISCONFIRMATION_NOT_RECORDED"
  ]) assert.ok(result.warningCodes.includes(code), code);
});
