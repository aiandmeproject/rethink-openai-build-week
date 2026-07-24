export const BUSINESS_INTEGRITY_POLICY_VERSION = "1.0.0";

export const BUSINESS_INTEGRITY_ANALYSIS_STATUSES = Object.freeze([
  "READY_FOR_REVIEW",
  "PARTIAL",
  "BLOCKED_BY_EVIDENCE_GAP",
  "UNRESOLVED"
]);

const BUSINESS_PROFILE_ID = "BUSINESS";
const NON_MATCHING_SCOPE_STATUSES = new Set(["PARTIAL", "MISMATCHED", "UNKNOWN"]);
const PUBLIC_SOURCE_CATEGORIES = new Set([
  "GOVERNMENT",
  "REGULATORY_LEGAL",
  "ACADEMIC_PEER_REVIEWED",
  "NONPROFIT_RESEARCH",
  "INDUSTRY_ASSOCIATION",
  "MARKET_RESEARCH",
  "CORPORATE_DISCLOSURE",
  "COMPANY_WEBSITE",
  "JOURNALISM",
  "PUBLIC_DATASET"
]);

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export const BUSINESS_INTEGRITY_POLICY = deepFreeze({
  id: "BUSINESS_INTEGRITY",
  version: BUSINESS_INTEGRITY_POLICY_VERSION,
  enabled: true,
  priorityScopeDimensions: [
    "POPULATION",
    "GEOGRAPHY",
    "SETTING",
    "CONDITION",
    "TIME",
    "ENDPOINT",
    "GENERALIZABILITY",
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
  ],
  prioritizedWarningCodes: [
    "CLAIM_EXCEEDS_EVIDENCE_SCOPE",
    "EVIDENCE_SCOPE_PARTIAL",
    "EVIDENCE_SCOPE_MISMATCH",
    "DETECTION_CAPABILITY_UNKNOWN",
    "DETECTION_CAPABILITY_LIMITED",
    "DETECTION_CAPABILITY_INADEQUATE",
    "ABSENCE_INFERENCE_UNSUPPORTED",
    "MULTIPLE_ITEMS_SHARE_ONE_FOUNDATIONAL_CHAIN",
    "SUPPORT_HAS_UNRESOLVED_ORIGIN",
    "SUPPORT_HAS_UNRESOLVED_TEMPORAL_STATE",
    "SUPPORT_RELIES_ON_HISTORICAL_SOURCE",
    "SUPPORT_RELIES_ON_OUTDATED_SOURCE",
    "SUPPORT_RELIES_ON_CORRECTED_SOURCE",
    "SUPPORT_RELIES_ON_SUPERSEDED_SOURCE",
    "NO_RECORDED_DISCONFIRMING_EVIDENCE",
    "CLAIM_STATUS_REQUIRES_REVIEW"
  ],
  evidenceBoundaryRules: [
    {
      id: "INTEREST_NOT_PURCHASE",
      warningCode: "BUSINESS_INTEREST_NOT_PURCHASE_EVIDENCE",
      claimTerms: ["purchase", "purchases", "buyer", "buyers", "conversion", "conversions", "paying customer", "revenue"],
      evidenceTerms: ["awareness", "interest", "engagement", "click", "clicks", "download", "downloads", "search volume", "stated intent", "survey interest"],
      interpretation: "Awareness, interest, engagement, clicks, downloads, search activity, and stated intent do not establish purchase behavior without qualification."
    },
    {
      id: "REVENUE_NOT_PROFITABILITY",
      warningCode: "BUSINESS_REVENUE_NOT_PROFITABILITY_EVIDENCE",
      claimTerms: ["profit", "profitability", "profitable", "margin", "net income"],
      evidenceTerms: ["revenue", "sales", "turnover", "gross bookings"],
      interpretation: "Revenue or sales evidence does not establish profitability, margin, or net economic benefit."
    }
  ],
  privateOperationalOutcomeTerms: [
    "actual conversion",
    "customer conversion",
    "private cost",
    "internal cost",
    "internal downtime",
    "employee workload",
    "audited revenue",
    "revenue loss",
    "retention",
    "customer churn",
    "willingness to pay",
    "proprietary demand",
    "operating history",
    "operating histories",
    "financial impact",
    "operational benefit"
  ],
  promptGuidance: [
    "Confirm that evidence matches the target market, customer segment, geography, company size, time period, operating conditions, and outcome being claimed.",
    "Do not treat awareness, interest, clicks, downloads, search volume, or survey responses as purchases without qualification.",
    "Do not treat revenue as profitability.",
    "Do not treat public market evidence as private operational evidence.",
    "Count explicit independent foundational chains, not documents.",
    "Identify whether real-world customer, operational, or financial data is still required after reasonable public research.",
    "Seek disconfirming evidence and preserve insufficient evidence when the relevant business endpoint has not been measured."
  ]
});

const CORE_WARNING_INTERPRETATIONS = Object.freeze({
  CLAIM_EXCEEDS_EVIDENCE_SCOPE: "The claim is broader than the demonstrated scope of its linked evidence.",
  EVIDENCE_SCOPE_PARTIAL: "The evidence applies to only part of the business scope being claimed.",
  EVIDENCE_SCOPE_MISMATCH: "A recorded evidence scope does not match the business scope of the claim.",
  DETECTION_CAPABILITY_UNKNOWN: "The evidence's ability to detect the relevant business condition is unknown.",
  DETECTION_CAPABILITY_LIMITED: "The evidence has limited ability to detect the relevant business condition.",
  DETECTION_CAPABILITY_INADEQUATE: "The evidence cannot adequately detect the relevant business condition.",
  ABSENCE_INFERENCE_UNSUPPORTED: "A negative business inference is unsupported because detection capability is insufficient.",
  MULTIPLE_ITEMS_SHARE_ONE_FOUNDATIONAL_CHAIN: "Multiple Evidence Items trace to one known foundational source chain and must not be counted as independent confirmation.",
  SUPPORT_HAS_UNRESOLVED_ORIGIN: "Supporting evidence has unresolved origin and cannot be treated as a known independent chain.",
  SUPPORT_HAS_UNRESOLVED_TEMPORAL_STATE: "The current applicability of supporting evidence is unresolved.",
  SUPPORT_RELIES_ON_HISTORICAL_SOURCE: "Supporting evidence is historically relevant but is not established as current support.",
  SUPPORT_RELIES_ON_OUTDATED_SOURCE: "Supporting evidence is explicitly outdated.",
  SUPPORT_RELIES_ON_CORRECTED_SOURCE: "Supporting evidence has been corrected and requires qualification.",
  SUPPORT_RELIES_ON_SUPERSEDED_SOURCE: "Supporting evidence has been superseded and requires qualification.",
  NO_RECORDED_DISCONFIRMING_EVIDENCE: "No recorded disconfirmation is not proof that no contradictory or limiting evidence exists.",
  CLAIM_STATUS_REQUIRES_REVIEW: "The stored claim status and current integrity state require human review; the status is not changed automatically."
});

const BUSINESS_WARNING_INTERPRETATIONS = Object.freeze({
  BUSINESS_TARGET_MARKET_SCOPE_UNRESOLVED: "The recorded evidence does not fully establish applicability to the target business market.",
  BUSINESS_CUSTOMER_SEGMENT_MISMATCH: "The recorded evidence does not match the claimed customer segment.",
  BUSINESS_GEOGRAPHY_MISMATCH: "The recorded evidence does not match the claimed geography.",
  BUSINESS_TIME_HORIZON_UNRESOLVED: "The claimed time horizon or current applicability remains unresolved.",
  BUSINESS_PROXY_ENDPOINT_REQUIRES_QUALIFICATION: "The measured endpoint is a proxy or partial match for the business outcome being claimed.",
  BUSINESS_INTEREST_NOT_PURCHASE_EVIDENCE: BUSINESS_INTEGRITY_POLICY.evidenceBoundaryRules[0].interpretation,
  BUSINESS_REVENUE_NOT_PROFITABILITY_EVIDENCE: BUSINESS_INTEGRITY_POLICY.evidenceBoundaryRules[1].interpretation,
  BUSINESS_PUBLIC_DATA_NOT_PRIVATE_OPERATING_DATA: "Public evidence cannot establish a private customer, operational, or financial outcome that was not directly measured.",
  BUSINESS_SINGLE_CHAIN_SUPPORT: "The claim has support from only one known foundational evidence chain.",
  BUSINESS_REAL_WORLD_INPUT_REQUIRED: "The existing project state records a need for Human / Real-World customer, operational, or financial input.",
  BUSINESS_DISCONFIRMATION_NOT_RECORDED: "No disconfirming evidence is recorded; this remains an advisory coverage gap, not a conclusion."
});

function requiredStringArray(value, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new TypeError(`${label} must be an array of non-empty strings.`);
  }
}

export function validateBusinessIntegrityPolicy(policy) {
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
    throw new TypeError("Business Integrity policy must be an object.");
  }
  if (policy.id !== "BUSINESS_INTEGRITY") {
    throw new TypeError("Business Integrity policy id must be BUSINESS_INTEGRITY.");
  }
  if (!/^\d+\.\d+\.\d+$/.test(policy.version || "")) {
    throw new TypeError("Business Integrity policy version must use semantic versioning.");
  }
  if (policy.enabled !== true) {
    throw new TypeError("Business Integrity policy must be enabled for the active BUSINESS profile.");
  }
  requiredStringArray(policy.priorityScopeDimensions, "Business Integrity priorityScopeDimensions");
  requiredStringArray(policy.prioritizedWarningCodes, "Business Integrity prioritizedWarningCodes");
  requiredStringArray(policy.privateOperationalOutcomeTerms, "Business Integrity privateOperationalOutcomeTerms");
  requiredStringArray(policy.promptGuidance, "Business Integrity promptGuidance");
  if (!Array.isArray(policy.evidenceBoundaryRules) || policy.evidenceBoundaryRules.length === 0) {
    throw new TypeError("Business Integrity evidenceBoundaryRules must be a non-empty array.");
  }
  for (const [index, rule] of policy.evidenceBoundaryRules.entries()) {
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) {
      throw new TypeError(`Business Integrity evidenceBoundaryRules[${index}] must be an object.`);
    }
    for (const field of ["id", "warningCode", "interpretation"]) {
      if (typeof rule[field] !== "string" || !rule[field].trim()) {
        throw new TypeError(`Business Integrity evidenceBoundaryRules[${index}].${field} must be a non-empty string.`);
      }
    }
    requiredStringArray(rule.claimTerms, `Business Integrity evidenceBoundaryRules[${index}].claimTerms`);
    requiredStringArray(rule.evidenceTerms, `Business Integrity evidenceBoundaryRules[${index}].evidenceTerms`);
  }
  return policy;
}

function requireBusinessProfile(profile, policy) {
  if (!profile || profile.id !== BUSINESS_PROFILE_ID) {
    throw new TypeError("Business Integrity analysis requires the active BUSINESS Domain Profile.");
  }
  if (profile.version && !/^\d+\.\d+\.\d+$/.test(profile.version)) {
    throw new TypeError("BUSINESS Domain Profile version must use semantic versioning.");
  }
  validateBusinessIntegrityPolicy(policy);
}

function requireTimestamp(value) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new TypeError("Business Integrity analysis asOf must be a valid timestamp.");
  }
}

function sortedUnique(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function normalizedText(...values) {
  return values.filter((value) => typeof value === "string").join(" ").toLowerCase();
}

function includesTerm(text, terms) {
  return terms.some((term) => text.includes(term.toLowerCase()));
}

function isPublicEvidence(item) {
  return Boolean(item)
    && item.status === "ACTIVE"
    && (
      item.provenanceOrigin === "EXTERNAL_SOURCE"
      || item.intakeType === "PUBLIC_SOURCE_FINDING"
      || PUBLIC_SOURCE_CATEGORIES.has(item.sourceCategory)
    );
}

function activeHumanRequirements(humanGates, currentDisposition) {
  const requirements = (humanGates || [])
    .filter((item) => item.status === "OPEN")
    .map((item) => ({
      gateId: item.id,
      gateType: item.gateType,
      question: item.question || "",
      requiredInput: item.requiredInput || "",
      why: item.why || ""
    }))
    .sort((left, right) => String(left.gateId).localeCompare(String(right.gateId)));
  if (
    requirements.length === 0
    && ["HUMAN_REAL_WORLD_INPUT_REQUIRED", "HUMAN_INPUT_REQUIRED"].includes(currentDisposition)
  ) {
    requirements.push({
      gateId: "",
      gateType: currentDisposition,
      question: "",
      requiredInput: "The current project disposition requires Human / Real-World input.",
      why: ""
    });
  }
  return requirements;
}

function claimScopeText(claimAnalysis, claim) {
  return normalizedText(
    claim?.text,
    ...claimAnalysis.scopeMismatches.flatMap((item) => [item.claimScope, item.rationale])
  );
}

function evidenceScopeText(claimAnalysis, evidenceById) {
  return normalizedText(
    ...claimAnalysis.scopeMismatches.flatMap((item) => [item.evidenceScope, item.rationale]),
    ...claimAnalysis.activeRelationshipIds.map((relationshipId) => {
      const relationship = Object.values(claimAnalysis.activeRelationships)
        .flat()
        .find((item) => item.id === relationshipId);
      const evidence = relationship ? evidenceById.get(relationship.evidenceId) : null;
      return normalizedText(evidence?.claim, evidence?.assessment, evidence?.population);
    })
  );
}

function scopeRecordsFor(coreAnalysis) {
  return coreAnalysis.claimAnalyses.flatMap((claimAnalysis) =>
    claimAnalysis.scopeMismatches.map((item) => ({
      claimId: claimAnalysis.claimId,
      relationshipId: item.relationshipId,
      evidenceId: item.evidenceId,
      assessmentId: item.assessmentId,
      dimension: item.dimension,
      fitStatus: item.fitStatus,
      claimScope: item.claimScope || "",
      evidenceScope: item.evidenceScope || "",
      rationale: item.rationale || ""
    }))
  );
}

function temporalIssuesFor(coreAnalysis) {
  return coreAnalysis.claimAnalyses
    .filter((item) =>
      item.unresolvedTemporalEvidenceIds.length > 0
      || item.temporalWarnings.some((code) =>
        [
          "SUPPORT_HAS_UNRESOLVED_TEMPORAL_STATE",
          "SUPPORT_RELIES_ON_HISTORICAL_SOURCE",
          "SUPPORT_RELIES_ON_OUTDATED_SOURCE",
          "SUPPORT_RELIES_ON_CORRECTED_SOURCE",
          "SUPPORT_RELIES_ON_SUPERSEDED_SOURCE"
        ].includes(code)
      )
    )
    .map((item) => ({
      claimId: item.claimId,
      evidenceIds: item.unresolvedTemporalEvidenceIds.slice().sort(),
      warningCodes: item.temporalWarnings.slice().sort()
    }));
}

function warningRecord(code, claimIds, source) {
  return {
    code,
    source,
    claimIds: sortedUnique(claimIds),
    interpretation: CORE_WARNING_INTERPRETATIONS[code]
      || BUSINESS_WARNING_INTERPRETATIONS[code]
      || "Review this advisory integrity condition before relying on the business conclusion."
  };
}

export function analyzeBusinessIntegrity({
  profile,
  policy = BUSINESS_INTEGRITY_POLICY,
  reasoningIntegrityAnalysis,
  claimLedger,
  evidenceItems,
  humanGates = [],
  currentDisposition = "",
  propositionStatus = "",
  researchHistory = [],
  asOf
}) {
  requireBusinessProfile(profile, policy);
  requireTimestamp(asOf);
  if (!reasoningIntegrityAnalysis || !Array.isArray(reasoningIntegrityAnalysis.claimAnalyses)) {
    throw new TypeError("Business Integrity analysis requires Core project-level Reasoning Integrity analysis.");
  }
  if (!claimLedger || !Array.isArray(claimLedger.claims) || !Array.isArray(claimLedger.evidenceRelationships)) {
    throw new TypeError("Business Integrity analysis requires the canonical Claim Ledger.");
  }
  if (!Array.isArray(evidenceItems)) {
    throw new TypeError("Business Integrity analysis requires canonical Evidence Items.");
  }

  const claimById = new Map(claimLedger.claims.map((item) => [item.id, item]));
  const evidenceById = new Map(evidenceItems.map((item) => [item.id, item]));
  const scopeRecords = scopeRecordsFor(reasoningIntegrityAnalysis);
  const unresolvedMarketScopeIssues = scopeRecords.filter((item) =>
    [
      "POPULATION",
      "SETTING",
      "CONDITION",
      "GENERALIZABILITY",
      "INDUSTRY",
      "COMPANY_SIZE",
      "BUSINESS_MODEL",
      "SALES_CHANNEL",
      "PRICE_POINT",
      "OPERATIONAL_CONTEXT"
    ].includes(item.dimension)
    && NON_MATCHING_SCOPE_STATUSES.has(item.fitStatus)
  );
  const unresolvedCustomerSegmentIssues = scopeRecords.filter((item) =>
    ["CUSTOMER_SEGMENT", "INDUSTRY", "COMPANY_SIZE"].includes(item.dimension)
    && NON_MATCHING_SCOPE_STATUSES.has(item.fitStatus)
  );
  const unresolvedGeographyIssues = scopeRecords.filter((item) =>
    item.dimension === "GEOGRAPHY" && NON_MATCHING_SCOPE_STATUSES.has(item.fitStatus)
  );
  const unresolvedTimeApplicability = [
    ...scopeRecords.filter((item) =>
      item.dimension === "TIME" && NON_MATCHING_SCOPE_STATUSES.has(item.fitStatus)
    ),
    ...temporalIssuesFor(reasoningIntegrityAnalysis)
  ];
  const unresolvedEndpointProxyIssues = scopeRecords.filter((item) =>
    ["ENDPOINT", "PURCHASE_INTENT", "REVENUE", "COST"].includes(item.dimension)
    && NON_MATCHING_SCOPE_STATUSES.has(item.fitStatus)
  );

  const unresolvedDetectionCapability = reasoningIntegrityAnalysis.claimAnalyses
    .flatMap((item) => item.detectionCapabilityWeaknesses.map((weakness) => ({
      claimId: item.claimId,
      ...weakness
    })));
  const unsupportedAbsenceInferences = reasoningIntegrityAnalysis.claimAnalyses
    .flatMap((item) => item.unsupportedAbsenceInferences.map((inference) => ({
      claimId: item.claimId,
      ...inference
    })));
  const independentSupportingChainSummary = reasoningIntegrityAnalysis.claimAnalyses.map((item) => ({
    claimId: item.claimId,
    evidenceItemCount: item.independentChains.SUPPORTS.evidenceItemCount,
    knownIndependentFoundationalRootCount:
      item.independentChains.SUPPORTS.knownIndependentFoundationalRootCount,
    traceableFoundationalRootIds:
      item.independentChains.SUPPORTS.traceableFoundationalRootIds.slice().sort(),
    unresolvedOriginEvidenceIds:
      item.independentChains.SUPPORTS.unresolvedOriginEvidenceIds.slice().sort()
  }));
  const supportingEvidenceIds = sortedUnique(
    reasoningIntegrityAnalysis.claimAnalyses.flatMap((item) =>
      item.activeRelationships.SUPPORTS.map((relationship) => relationship.evidenceId)
    )
  );
  const knownIndependentSupportingRootIds = sortedUnique(
    independentSupportingChainSummary.flatMap((item) => item.traceableFoundationalRootIds)
  );
  const unresolvedProvenance = reasoningIntegrityAnalysis.claimAnalyses
    .filter((item) => item.unresolvedOriginEvidenceIds.length > 0)
    .map((item) => ({
      claimId: item.claimId,
      evidenceIds: item.unresolvedOriginEvidenceIds.slice().sort()
    }));
  const currentVersusHistoricalSupport = temporalIssuesFor(reasoningIntegrityAnalysis);
  const disconfirmationCoverage = reasoningIntegrityAnalysis.claimAnalyses.map((item) => ({
    claimId: item.claimId,
    status: item.disconfirmationCoverage.status,
    relationshipIds: item.disconfirmationCoverage.relationshipIds.slice().sort(),
    warningCodes: item.disconfirmationCoverage.warnings.slice().sort(),
    interpretation: item.disconfirmationCoverage.interpretation
  }));
  const syntheticOrIneligibleSupport = reasoningIntegrityAnalysis.claimAnalyses
    .filter((item) => item.syntheticOrIneligibleEvidenceIds.length > 0)
    .map((item) => ({
      claimId: item.claimId,
      evidenceIds: item.syntheticOrIneligibleEvidenceIds.slice().sort()
    }));

  const boundaryWarnings = [];
  for (const claimAnalysis of reasoningIntegrityAnalysis.claimAnalyses) {
    const claim = claimById.get(claimAnalysis.claimId);
    const claimText = claimScopeText(claimAnalysis, claim);
    const evidenceText = evidenceScopeText(claimAnalysis, evidenceById);
    for (const rule of policy.evidenceBoundaryRules) {
      if (includesTerm(claimText, rule.claimTerms) && includesTerm(evidenceText, rule.evidenceTerms)) {
        boundaryWarnings.push({
          code: rule.warningCode,
          claimId: claimAnalysis.claimId,
          ruleId: rule.id,
          interpretation: rule.interpretation
        });
      }
    }
  }

  const publicEvidenceLimitations = reasoningIntegrityAnalysis.claimAnalyses.flatMap((claimAnalysis) => {
    const claim = claimById.get(claimAnalysis.claimId);
    const materialBusinessText = normalizedText(
      claimScopeText(claimAnalysis, claim),
      ...claimAnalysis.scopeMismatches.map((item) => item.claimScope)
    );
    if (!includesTerm(materialBusinessText, policy.privateOperationalOutcomeTerms)) return [];
    const publicEvidenceIds = sortedUnique(
      claimAnalysis.activeRelationships.SUPPORTS
        .map((relationship) => evidenceById.get(relationship.evidenceId))
        .filter(isPublicEvidence)
        .map((item) => item.id)
    );
    return publicEvidenceIds.length ? [{
      claimId: claimAnalysis.claimId,
      publicEvidenceIds,
      requiredBoundary: "PRIVATE_CUSTOMER_OPERATIONAL_OR_FINANCIAL_EVIDENCE",
      interpretation: BUSINESS_WARNING_INTERPRETATIONS.BUSINESS_PUBLIC_DATA_NOT_PRIVATE_OPERATING_DATA
    }] : [];
  });

  const humanRealWorldInputRequirements = activeHumanRequirements(humanGates, currentDisposition);
  const warningByCode = new Map();
  const addWarning = (code, claimIds, source) => {
    const existing = warningByCode.get(code);
    if (existing) {
      existing.claimIds = sortedUnique([...existing.claimIds, ...claimIds]);
      return;
    }
    warningByCode.set(code, warningRecord(code, claimIds, source));
  };
  for (const code of reasoningIntegrityAnalysis.warningCodes) {
    if (!policy.prioritizedWarningCodes.includes(code)) continue;
    addWarning(
      code,
      reasoningIntegrityAnalysis.claimAnalyses
        .filter((item) => item.integrityWarnings.includes(code))
        .map((item) => item.claimId),
      "CORE_REASONING_INTEGRITY"
    );
  }
  if (unresolvedMarketScopeIssues.length) {
    addWarning("BUSINESS_TARGET_MARKET_SCOPE_UNRESOLVED", unresolvedMarketScopeIssues.map((item) => item.claimId), "BUSINESS_POLICY");
  }
  if (unresolvedCustomerSegmentIssues.some((item) => item.fitStatus === "MISMATCHED")) {
    addWarning("BUSINESS_CUSTOMER_SEGMENT_MISMATCH", unresolvedCustomerSegmentIssues.map((item) => item.claimId), "BUSINESS_POLICY");
  }
  if (unresolvedGeographyIssues.some((item) => item.fitStatus === "MISMATCHED")) {
    addWarning("BUSINESS_GEOGRAPHY_MISMATCH", unresolvedGeographyIssues.map((item) => item.claimId), "BUSINESS_POLICY");
  }
  if (unresolvedTimeApplicability.length) {
    addWarning("BUSINESS_TIME_HORIZON_UNRESOLVED", unresolvedTimeApplicability.map((item) => item.claimId), "BUSINESS_POLICY");
  }
  if (unresolvedEndpointProxyIssues.length) {
    addWarning("BUSINESS_PROXY_ENDPOINT_REQUIRES_QUALIFICATION", unresolvedEndpointProxyIssues.map((item) => item.claimId), "BUSINESS_POLICY");
  }
  for (const boundary of boundaryWarnings) {
    addWarning(boundary.code, [boundary.claimId], "BUSINESS_POLICY");
  }
  if (publicEvidenceLimitations.length) {
    addWarning("BUSINESS_PUBLIC_DATA_NOT_PRIVATE_OPERATING_DATA", publicEvidenceLimitations.map((item) => item.claimId), "BUSINESS_POLICY");
  }
  const singleChainClaimIds = independentSupportingChainSummary
    .filter((item) =>
      item.evidenceItemCount > 0 && item.knownIndependentFoundationalRootCount === 1
    )
    .map((item) => item.claimId);
  if (singleChainClaimIds.length) {
    addWarning("BUSINESS_SINGLE_CHAIN_SUPPORT", singleChainClaimIds, "BUSINESS_POLICY");
  }
  const noDisconfirmationClaimIds = disconfirmationCoverage
    .filter((item) => item.status === "NONE_RECORDED")
    .map((item) => item.claimId);
  if (noDisconfirmationClaimIds.length) {
    addWarning("BUSINESS_DISCONFIRMATION_NOT_RECORDED", noDisconfirmationClaimIds, "BUSINESS_POLICY");
  }
  if (humanRealWorldInputRequirements.length) {
    addWarning("BUSINESS_REAL_WORLD_INPUT_REQUIRED", [], "EXISTING_PROJECT_STATE");
  }

  const warningOrder = [
    ...policy.prioritizedWarningCodes,
    ...Object.keys(BUSINESS_WARNING_INTERPRETATIONS)
  ];
  const highPriorityIntegrityWarnings = [...warningByCode.values()].sort((left, right) => {
    const leftIndex = warningOrder.indexOf(left.code);
    const rightIndex = warningOrder.indexOf(right.code);
    if (leftIndex !== rightIndex) return leftIndex - rightIndex;
    return left.code.localeCompare(right.code);
  });
  const blockingGap = reasoningIntegrityAnalysis.claimsWithNoActiveEvidenceRelationships.length > 0
    || unsupportedAbsenceInferences.length > 0
    || humanRealWorldInputRequirements.length > 0;
  const analysisStatus = reasoningIntegrityAnalysis.totalExplicitClaims === 0
    ? "UNRESOLVED"
    : (blockingGap
        ? "BLOCKED_BY_EVIDENCE_GAP"
        : (highPriorityIntegrityWarnings.length > 0 ? "PARTIAL" : "READY_FOR_REVIEW"));

  return {
    profileId: profile.id,
    profileVersion: profile.version || "",
    policyVersion: policy.version,
    analysisAsOf: asOf,
    analysisStatus,
    propositionStatus,
    applicableClaimIds: reasoningIntegrityAnalysis.claimAnalyses
      .map((item) => item.claimId)
      .sort(),
    highPriorityIntegrityWarnings,
    warningCodes: highPriorityIntegrityWarnings.map((item) => item.code),
    unresolvedMarketScopeIssues,
    unresolvedCustomerSegmentIssues,
    unresolvedGeographyIssues,
    unresolvedTimeApplicability,
    unresolvedEndpointProxyIssues,
    unresolvedDetectionCapability,
    unsupportedAbsenceInferences,
    independentSupportingChainSummary,
    supportingEvidenceItemCount: supportingEvidenceIds.length,
    supportingEvidenceIds,
    knownIndependentSupportingChainCount: knownIndependentSupportingRootIds.length,
    knownIndependentSupportingRootIds,
    unresolvedProvenance,
    currentVersusHistoricalSupport,
    disconfirmationCoverage,
    syntheticOrIneligibleSupport,
    publicEvidenceBoundary: {
      publicEvidenceLimitations,
      completedPublicResearchCount: researchHistory.filter((item) =>
        item.executionStatus === "COMPLETED" || item.status === "COMPLETED"
      ).length,
      interpretation: "Use reasonable public evidence first, but do not represent public market evidence as private customer, operational, or financial evidence."
    },
    humanRealWorldInputRequirements,
    interpretationPolicy: [
      "Business warnings are advisory and never rewrite Claim status, relationship meaning, proposition status, routing, or Human Gates.",
      "Capability Assessments and all Core ledgers remain canonical; this analysis is derived and read-only.",
      "Evidence Item count is distinct from known independent foundational-chain count.",
      "No viability score, confidence percentage, success probability, investment recommendation, or automatic GO / NO-GO is produced."
    ]
  };
}

export function createBusinessIntegrityPromptContext({
  profile,
  policy = BUSINESS_INTEGRITY_POLICY,
  analysis
}) {
  if (profile?.id !== BUSINESS_PROFILE_ID) return null;
  requireBusinessProfile(profile, policy);
  if (!analysis || analysis.profileId !== BUSINESS_PROFILE_ID) {
    throw new TypeError("Business Integrity prompt context requires derived BUSINESS analysis.");
  }
  return {
    policyVersion: policy.version,
    guidance: policy.promptGuidance,
    derivedReview: {
      analysisAsOf: analysis.analysisAsOf,
      analysisStatus: analysis.analysisStatus,
      warningCodes: analysis.warningCodes,
      applicableClaimIds: analysis.applicableClaimIds,
      supportingEvidenceItemCount: analysis.supportingEvidenceItemCount,
      knownIndependentSupportingChainCount: analysis.knownIndependentSupportingChainCount,
      unresolvedProvenance: analysis.unresolvedProvenance,
      currentVersusHistoricalSupport: analysis.currentVersusHistoricalSupport,
      publicEvidenceBoundary: analysis.publicEvidenceBoundary,
      humanRealWorldInputRequirements: analysis.humanRealWorldInputRequirements
    },
    advisoryBoundary: "This derived profile review does not change Core state, routing, Claim status, proposition status, evidence eligibility, or Human Gates."
  };
}
