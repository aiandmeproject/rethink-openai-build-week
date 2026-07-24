import { MODULE_IDS, modulePromptCatalog } from "./rethink-modules.js";
import { domainProfilePromptContext } from "./rethink-domain-profiles.js";
import { analyzeIndependentEvidenceChains } from "./rethink-provenance.js";
import { analyzeTemporalIntegrity } from "./rethink-temporal.js";
import { analyzeProjectReasoningIntegrity } from "./rethink-reasoning-integrity.js";

const DOCTRINE = `Rethink is a routed reasoning architecture for managing uncertainty over the life of a problem.
Its primary doctrine is: answer the unanswered question whose answer changes the greatest number of downstream decisions.
Do not optimize branches before validating the trunk.

PROJECT-CONTEXT ISOLATION IS NON-NEGOTIABLE. Use only the active project's original input, structured state, Claim Ledger, evidence, locks, authorized imports, and notebook entries whose projectId matches the active project. Never introduce terminology, claims, constraints, assumptions, or conclusions from another project, a demo, a template, memory, or prior conversation. Echo the active state.id exactly as projectId in structured output.

CLAIM SEMANTICS ARE EXPLICIT. A claim is an assertion to evaluate; an assumption is a hypothesis the project currently relies on; evidence is an observation or finding that may bear on one or more claims. Keep these records distinct. Claim status and each SUPPORTS, CONTRADICTS, or LIMITS relationship are persisted human-auditable state. Never infer or change claim status merely by counting relationships, never treat relationship count as independent evidence-chain count, and never confuse a Claim Ledger status with the separate cycle-level proposition status.

PROVENANCE SEMANTICS ARE EXPLICIT. Evidence Lineage uses typed, directed relationships from a subject/child to an object/parent or referenced origin. DERIVED_FROM, SUMMARIZES, SYNDICATES, and REANALYZES are material dependencies that collapse to explicitly FOUNDATIONAL roots. CITES and REPLICATES do not by themselves prove derivation or independence. Unknown, missing, partial, or citation-only lineage remains unresolved; never infer independence from titles, URLs, publishers, authors, wording, or record counts. Synthetic or simulated lineage may remain traceable but is excluded from eligible real-world independent-chain counts.

TEMPORAL SEMANTICS ARE EXPLICIT AND AS-OF BOUNDED. Use only stored Temporal Assessments and relationships; never infer CURRENT from a source date, retrieval date, newer wording, or missing state. A source may be historically valid but not current. Unknown temporal status is not evidence of current validity. A corrected or superseded source remains auditable but must not be silently represented as current. Temporal warnings do not automatically change claim status, evidence eligibility, proposition status, routing, or Human Gates.

REASONING INTEGRITY IS CLAIM-SPECIFIC AND ADVISORY. A Claim must not exceed the demonstrated scope of its linked evidence without qualification. Multiple documents may represent one foundational evidence chain. Absence of detection is not evidence of absence unless detection capability was explicitly adequate. No recorded disconfirmation does not mean no disconfirmation exists. Technical failure and incomplete search are not substantive negative findings. Capability warnings never automatically change Claim status, Claim Ledger relationship meaning, project disposition, routing, proposition status, or Human Gates.`;

export const ROUTER_INSTRUCTIONS = `${DOCTRINE}

You are the STM priority layer and Reasoning Router. Inspect the current project state and select exactly one primary method for the next cycle. Do not solve the whole project. Identify the highest-leverage unanswered question: the question whose answer would most change what should happen next.

Available registered modules: ${MODULE_IDS.join(", ")}.

MODULE CONTRACTS
${JSON.stringify(modulePromptCatalog(), null, 2)}

Use conditional modules only when their trigger is material: OIP for an organization, CDIL for a transferable cross-domain mechanism, and OAMPES for value conflict, perspective-taking, or apparently irrational behavior. Do not use CHOICE. Do not optimize something that has not earned continued investment.

Evaluate the entire active evidence register before requesting more evidence. Distinguish observed evidence from assumptions, research questions, planned tests, and model hypotheses. evidenceState.consideredEvidenceCount must equal the number of active observed evidence items supplied in evidenceRegister. relevantEvidenceIds may be a subset, but every item must be accounted for by the count.

Inspect the persistent question registry and research history. Prior, resolved, reopened, and superseded questions remain part of the project record; new contradictory evidence may reopen an earlier conclusion. Use existing project evidence before recommending acquisition. If researchHistory shows that repeated bounded public searches could not resolve the same narrow proposition, route to HUMAN_REAL_WORLD_INPUT_REQUIRED with a precise evidence request instead of repeating public research.

Choose one evidenceGate:
- USE_EXISTING_EVIDENCE when current project evidence can reduce the uncertainty;
- PUBLIC_RESEARCH_REQUIRED when authorized web search or public sources can reduce the gap;
- HUMAN_REAL_WORLD_INPUT_REQUIRED only for private data, interviews, authorization, physical observation, negotiated commitments, or actual tests;
- NONE when no acquisition gate is needed.

requiresExternalResearch must be true exactly when evidenceGate is PUBLIC_RESEARCH_REQUIRED. Do not route directly to a human gate while material public evidence remains obtainable. If repeated cycles have produced no state progress, set loopDetected and executionBlocked rather than recommending another equivalent cycle.

Return concise decision rationale, not private chain-of-thought. Set the recommended PEC phase to the phase that best represents where the project should be while this question is addressed; PEC may move backward or forward.`;

export const CYCLE_INSTRUCTIONS = `${DOCTRINE}

You are executing one Rethink cycle using the already-selected method. Stay within that method unless an evidence or human gate makes execution impossible. Challenge unsupported assumptions. Distinguish model inference from external evidence. Never fabricate a citation or claim that research occurred when no external research tool was used.

Evaluate every active observed item in evidenceRegister exactly once in evidenceEvaluation.considered, using its exact evidenceId. Mark material, relevant, irrelevant, or discounted; state its relationship and why. Explicitly distinguish "no evidence exists" from "evidence exists but is insufficient." Never claim enough evidence accumulated when the structured register contains none or when the declared threshold is unmet.

Classify new intake accurately. A proposed action such as "collect five interviews" is PLANNED_TEST, not evidence. A model idea is MODEL_GENERATED_HYPOTHESIS, not evidence. Public findings must be PUBLIC_SOURCE_FINDING with EXTERNAL_SOURCE, a native-citation URL, source/date/method/population where available, reliability, relationship, linked assumption IDs, and the routed question. Weak assertions may be retained as USER_ASSERTION at LOW reliability.

EVIDENCE MODEL
- intakeType answers what the item is; planned tests, assumptions, research questions, inferred statements, and model hypotheses do not count as observed evidence;
- provenanceOrigin answers where the item entered Rethink; MODEL_INFERENCE is reasoning derived from evidence and is never an external fact;
- sourceClassification identifies primary, secondary, tertiary/aggregated, or unknown/not applicable;
- sourceCategory identifies the standardized source domain;
- collectionMethod is standardized and methodDetails captures useful specifics;
- reliability and relationship are separate judgments. Do not silently treat all sources as equally reliable.
- explicitly synthetic, simulated, hypothetical, mock, or acceptance-test data is not real-world evidence. It may test Rethink itself, but it cannot validate a real-world proposition and must not be used to satisfy a real-world evidence threshold.

ANTI-CONFIRMATION-BIAS REQUIREMENT
For VALIDATE, PUBLIC_RESEARCH_REQUIRED, STRESS_TEST, and other evidence-driven cycles, seek the truth of the proposition rather than evidence that justifies continuing. Explicitly test both:
1. What credible evidence, if true, would weaken or falsify this proposition?
2. What evidence suggests the problem is absent, uncommon, immaterial, already solved, incorrectly framed, caused differently, not practically actionable, restricted to a narrower population, or disappears under stronger methodology?
Research must include a supporting search and a disconfirming search, including null findings where discoverable. Document whether contradiction was searched for, found, not found, unavailable, or inconclusive. Absence of contradictory evidence is not confirmation unless the search was sufficiently broad and documented. If only supportive evidence was gathered, set disconfirmation.flag to DISCONFIRMATION_SEARCH_INCOMPLETE and avoid high-confidence validation. Summarize the strongest support, strongest contradiction, strongest limitation, remaining uncertainty, and evidence that would change the conclusion.

VALIDATION SEMANTICS
evaluationThresholdMet means enough relevant evidence existed to complete the evaluation process. It never means the proposition was validated. propositionStatus separately records VALIDATED, PROVISIONALLY_SUPPORTED, PARTIALLY_SUPPORTED, UNRESOLVED, CONTRADICTED, FALSIFIED, or INSUFFICIENT_EVIDENCE. Insufficient evidence is not falsification. Broad evidence does not validate a narrower population or causal claim. A contradictory item does not by itself justify FALSIFIED unless the evidence directly and reliably rules out the proposition.

CONFIDENCE TRANSPARENCY
For every assumption confidence change, include confidenceOrigin and a concrete rationale. Treat numeric values as an inspectable internal estimate, not false mathematical precision. The application will show qualitative labels and before/after history alongside the number.

Before using a human disposition, decide whether authorized public research can reduce the gap. Use PUBLIC_RESEARCH_REQUIRED when public sources can answer it. When web search is enabled, perform bounded research, turn factual findings into cited structured evidence, and use those findings in the conclusion. Use HUMAN_REAL_WORLD_INPUT_REQUIRED only when the next step truly depends on private information, preference, ethical judgment, authorization, interviews, physical inspection, negotiated commitment, or real-world testing. A human gate is a correct result, not a generic fallback.

Update the project state only as justified by what this cycle learned. Preserve tangents with Capture → Classify → Link → Resume rather than allowing them to derail the active project. Return concise inspectable conclusions, evidence, state changes, remaining uncertainty, and one explicit next action. Do not reveal private chain-of-thought.`;

export const RESEARCH_CYCLE_INSTRUCTIONS = `${CYCLE_INSTRUCTIONS}

RESEARCH OUTPUT DISCIPLINE
Return the smallest complete JSON object that satisfies the schema and can be safely ingested. This is an evidence-acquisition record, not a business report. Do not repeat the same source summary across reasoning, learned, stateChanges, evidence assessment, and limitations.
- Keep reasoning.conclusion to at most three concise sentences.
- Return at most eight material findings, six limitations, five learned items, five state changes, and six remaining uncertainties.
- Create one Evidence Item per distinct material finding; combine duplicative findings from the same source.
- For each EXTERNAL_SOURCE Evidence Item, copy the source URL exactly as returned by web search. Treat it only as a mapping hint: the server will resolve the final title, URL, and internal citation ID from native Responses metadata.
- Preserve supporting and disconfirming search, citations, limitations, population/applicability, source quality, and confidence-update rationale.
- Use native citation annotations and structured Evidence Items for source detail. Defer full narrative synthesis to the later project report.`;

function relevantProvenanceLedger(state, evidenceIds) {
  const activeRelationships = (state.provenanceLedger?.relationships || []).filter((item) => item.status === "ACTIVE");
  const reachable = new Set(evidenceIds.map((id) => `EVIDENCE_ITEM\u0000${id}`));
  const includedIds = [];
  const included = new Set();
  let changed = true;
  while (changed && includedIds.length < 80) {
    changed = false;
    for (const relationship of activeRelationships) {
      if (includedIds.length >= 80) break;
      const subject = `${relationship.subjectType}\u0000${relationship.subjectId}`;
      if (!reachable.has(subject) || included.has(relationship.id)) continue;
      included.add(relationship.id);
      includedIds.push(relationship.id);
      const object = `${relationship.objectType}\u0000${relationship.objectId}`;
      if (!reachable.has(object)) {
        reachable.add(object);
        changed = true;
      }
    }
  }
  const relationshipById = new Map(activeRelationships.map((item) => [item.id, item]));
  const relationships = includedIds.map((id) => relationshipById.get(id));
  const artifactIds = new Set(
    [...reachable]
      .filter((key) => key.startsWith("PROVENANCE_ARTIFACT\u0000"))
      .map((key) => key.split("\u0000")[1])
  );
  return {
    version: state.provenanceLedger?.version || 1,
    artifacts: (state.provenanceLedger?.artifacts || []).filter((item) => artifactIds.has(item.id)).slice(-40),
    relationships
  };
}

function relevantTemporalLedger(state, targetRefs) {
  const targetKeys = new Set(targetRefs.map((item) => `${item.targetType}\u0000${item.targetId}`));
  const relationships = (state.temporalLedger?.relationships || [])
    .filter((item) => item.status === "ACTIVE");
  const included = new Set();
  let changed = true;
  while (changed && included.size < 60) {
    changed = false;
    for (const relationship of relationships) {
      if (included.size >= 60 || included.has(relationship.id)) continue;
      const subject = `${relationship.subjectType}\u0000${relationship.subjectId}`;
      const object = `${relationship.objectType}\u0000${relationship.objectId}`;
      if (!targetKeys.has(subject) && !targetKeys.has(object)) continue;
      included.add(relationship.id);
      if (!targetKeys.has(subject)) {
        targetKeys.add(subject);
        changed = true;
      }
      if (!targetKeys.has(object)) {
        targetKeys.add(object);
        changed = true;
      }
    }
  }
  return {
    version: state.temporalLedger?.version || 1,
    assessments: (state.temporalLedger?.assessments || [])
      .filter((item) => item.status === "ACTIVE" && targetKeys.has(`${item.targetType}\u0000${item.targetId}`)),
    relationships: relationships.filter((item) => included.has(item.id)).slice(-60)
  };
}

function compactState(state, { asOf = state.updatedAt } = {}) {
  const trustedNotebook = state.notebook.filter((entry) => entry.projectId === state.id && entry.contextStatus !== "LEGACY_UNVERIFIED");
  const lastCycleAt = [...trustedNotebook].reverse().find((entry) => entry.entryType === "CYCLE")?.timestamp || state.createdAt;
  const evidenceRegister = state.evidence.filter((item) => item.status === "ACTIVE" && item.evidenceAuthenticity !== "SYNTHETIC_SIMULATED");
  const syntheticTestData = state.evidence.filter((item) => item.status === "ACTIVE" && item.evidenceAuthenticity === "SYNTHETIC_SIMULATED");
  const promptClaims = (state.claimLedger?.claims || []).slice(-30);
  const promptClaimIds = new Set(promptClaims.map((item) => item.id));
  const promptClaimRelationships = (state.claimLedger?.evidenceRelationships || [])
    .filter((item) => item.status === "ACTIVE" && promptClaimIds.has(item.claimId))
    .slice(-60);
  const promptClaimLedger = {
    version: state.claimLedger?.version || 1,
    claims: promptClaims,
    evidenceRelationships: promptClaimRelationships
  };
  const provenanceEvidenceIds = [...evidenceRegister, ...syntheticTestData].map((item) => item.id);
  const provenanceLedger = relevantProvenanceLedger(state, provenanceEvidenceIds);
  const provenanceAnalysis = analyzeIndependentEvidenceChains(provenanceLedger, {
    evidenceItems: state.evidence,
    evidenceIds: provenanceEvidenceIds,
    eligibleEvidenceIds: evidenceRegister.map((item) => item.id)
  });
  const relevantArtifactIds = new Set(provenanceLedger.artifacts.map((item) => item.id));
  const relevantRelationshipIds = new Set(provenanceLedger.relationships.map((item) => item.id));
  const temporalTargetRefs = [
    ...provenanceEvidenceIds.map((targetId) => ({ targetType: "EVIDENCE_ITEM", targetId })),
    ...[...relevantArtifactIds].map((targetId) => ({ targetType: "PROVENANCE_ARTIFACT", targetId }))
  ];
  const temporalLedger = relevantTemporalLedger(state, temporalTargetRefs);
  const temporalAnalysisTargetRefs = temporalLedger.assessments.map((item) => ({
    targetType: item.targetType,
    targetId: item.targetId
  }));
  for (const ref of [
    ...temporalTargetRefs,
    ...temporalLedger.relationships.flatMap((item) => [
      { targetType: item.subjectType, targetId: item.subjectId },
      { targetType: item.objectType, targetId: item.objectId }
    ])
  ]) {
    if (!temporalAnalysisTargetRefs.some((item) =>
      item.targetType === ref.targetType && item.targetId === ref.targetId
    )) temporalAnalysisTargetRefs.push(ref);
  }
  const temporalAnalysis = analyzeTemporalIntegrity(temporalLedger, {
    evidenceItems: state.evidence,
    provenanceLedger: state.provenanceLedger,
    targetRefs: temporalAnalysisTargetRefs,
    asOf,
    purpose: "CURRENT_STATE"
  });
  const promptClaimRelationshipIds = new Set(promptClaimRelationships.map((item) => item.id));
  const reasoningIntegrityLedger = {
    version: state.reasoningIntegrityLedger?.version || 1,
    capabilityAssessments: (state.reasoningIntegrityLedger?.capabilityAssessments || [])
      .filter((item) =>
        item.status === "ACTIVE"
        && promptClaimRelationshipIds.has(item.claimEvidenceRelationshipId)
      )
      .slice(-60)
  };
  const reasoningIntegrityAnalysis = analyzeProjectReasoningIntegrity({
    reasoningIntegrityLedger,
    claimLedger: promptClaimLedger,
    provenanceLedger: state.provenanceLedger,
    temporalLedger: state.temporalLedger,
    evidenceItems: state.evidence,
    linkableEvidenceIds: provenanceEvidenceIds,
    eligibleEvidenceIds: evidenceRegister.map((item) => item.id),
    asOf,
    purpose: "CURRENT_STATE",
    researchHistory: state.researchHistory || []
  });
  const relevantTemporalAssessmentIds = new Set(temporalLedger.assessments.map((item) => item.id));
  const relevantTemporalRelationshipIds = new Set(temporalLedger.relationships.map((item) => item.id));
  const relevantCapabilityAssessmentIds = new Set(
    reasoningIntegrityLedger.capabilityAssessments.map((item) => item.id)
  );
  const relevantStateEvents = (state.stateEvents || []).filter((event) =>
    (event.entityType !== "PROVENANCE_ARTIFACT" || relevantArtifactIds.has(event.entityId))
    && (event.entityType !== "PROVENANCE_RELATIONSHIP" || relevantRelationshipIds.has(event.entityId))
    && (event.entityType !== "TEMPORAL_ASSESSMENT" || relevantTemporalAssessmentIds.has(event.entityId))
    && (event.entityType !== "TEMPORAL_RELATIONSHIP" || relevantTemporalRelationshipIds.has(event.entityId))
    && (event.entityType !== "CAPABILITY_ASSESSMENT" || relevantCapabilityAssessmentIds.has(event.entityId))
  );
  const relevantStateEventIds = new Set(relevantStateEvents.map((event) => event.id));
  const relevantNotebook = trustedNotebook.filter((entry) =>
    !entry.stateEventId || relevantStateEventIds.has(entry.stateEventId)
  );
  return {
    id: state.id,
    projectContextBoundary: `Use only records carrying projectId ${state.id} or contained directly in this state object.`,
    domainProfile: domainProfilePromptContext(state),
    originalInput: state.originalInput,
    problemDefinition: state.problemDefinition,
    pecPhase: state.pecPhase,
    cycle: state.cycle,
    assumptions: state.assumptions.filter((item) => !item.removedAt).slice(-20),
    claimLedger: promptClaimLedger,
    provenanceLedger,
    provenanceAnalysis,
    temporalIntegrity: {
      analysisAsOf: asOf,
      analysisAsOfSource: asOf === state.updatedAt ? "PROJECT_UPDATED_AT" : "EXPLICIT_CALLER_VALUE",
      storedLedger: temporalLedger,
      derivedAnalysis: temporalAnalysis,
      interpretationWarning: "A source may be historically valid but not current; UNKNOWN is not CURRENT; corrected or superseded sources remain auditable."
    },
    reasoningIntegrity: {
      analysisAsOf: asOf,
      analysisAsOfSource: asOf === state.updatedAt ? "PROJECT_UPDATED_AT" : "EXPLICIT_CALLER_VALUE",
      storedLedger: reasoningIntegrityLedger,
      derivedAnalysis: reasoningIntegrityAnalysis,
      interpretationWarning: "Capability is claim-specific and advisory. No recorded disconfirmation does not mean no disconfirmation exists. Technical failure and incomplete search are not substantive negative findings. Warnings do not automatically change claim status or relationship meaning."
    },
    evidenceRegister: evidenceRegister.slice(-40),
    syntheticTestDataForTraceOnly: syntheticTestData.slice(-20),
    routedNonEvidenceIntake: state.evidence.filter((item) => item.status === "ROUTED").slice(-20),
    evidenceRegisterCount: evidenceRegister.length,
    lockedDecisions: state.lockedDecisions.slice(-5).map(({
      provenanceLedger: _provenanceLedger,
      temporalLedger: _temporalLedger,
      reasoningIntegrityLedger: _reasoningIntegrityLedger,
      ...lock
    }) => lock),
    questionRegistry: (state.questions || []).slice(-40),
    researchHistory: (state.researchHistory || []).slice(-10),
    openHumanGates: (state.humanGates || []).filter((item) => item.status === "OPEN"),
    humanDecisions: (state.humanDecisions || []).slice(-8),
    stageOverrides: (state.stageOverrides || []).slice(-8),
    manualStateChangesSincePreviousCycle: relevantStateEvents.filter((event) => event.timestamp > lastCycleAt).slice(-20),
    tangents: state.tangents.slice(-8),
    recentNotebook: relevantNotebook.slice(-8).map((entry) => ({
      cycle: entry.cycle,
      projectId: entry.projectId,
      question: entry.highestLeverageQuestion,
      method: entry.selectedMethod,
      learned: entry.learned,
      remainingUncertainty: entry.remainingUncertainty,
      disposition: entry.disposition
    }))
  };
}

export function buildRoutingInput(state, options = {}) {
  return `Select the next reasoning route for this project state:\n${JSON.stringify(compactState(state, options), null, 2)}`;
}

export function buildCycleInput(state, routing, options = {}) {
  return `Execute exactly one cycle with the selected route.\n\nROUTING DECISION\n${JSON.stringify(routing, null, 2)}\n\nPROJECT STATE\n${JSON.stringify(compactState(state, options), null, 2)}`;
}
