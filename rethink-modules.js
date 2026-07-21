const MODULE_TYPES = Object.freeze(["CORE_OPERATOR", "CONDITIONAL_MODULE"]);
const EVIDENCE_GATE_POLICIES = Object.freeze(["EXISTING_OR_NONE", "PUBLIC_THEN_EXISTING", "HUMAN_REAL_WORLD", "EVIDENCE_REQUIRED"]);
const PEC_PHASE_IDS = new Set([
  "CAPTURE", "DEFINE", "ASSUMPTIONS", "ADVERSARIAL_REVIEW", "ROOT_CAUSE", "SUCCESS_METRICS",
  "OPPORTUNITY_COST", "OPTION_PRESERVATION", "MVP_PLANNING", "TESTING", "KNOWLEDGE_CAPTURE", "DECISION"
]);

const COMMON_OUTPUT = Object.freeze([
  "reasoning conclusion",
  "evidence evaluation",
  "assumption and state changes",
  "remaining uncertainty",
  "next action and disposition"
]);

const COMMON_STATE_EFFECTS = Object.freeze(["PEC", "ASSUMPTIONS", "EVIDENCE", "LAB_NOTEBOOK", "DISPOSITION"]);
const COMMON_SAFEGUARDS = Object.freeze([
  "Use only the active project context.",
  "Do not expose private chain-of-thought.",
  "Do not claim evidence or citations that do not exist.",
  "Preserve human disposition authority."
]);

function asModule(config) {
  return {
    type: "CORE_OPERATOR",
    requiredInputs: ["active project state", "highest-leverage question", "current evidence register"],
    availableTools: ["PROJECT_STATE", "PROJECT_EVIDENCE"],
    expectedStructuredOutput: [...COMMON_OUTPUT],
    stateEffects: [...COMMON_STATE_EFFECTS],
    possibleDispositions: ["CONTINUE", "RESEARCH", "HUMAN_REAL_WORLD_INPUT_REQUIRED"],
    dependencies: [],
    safeguards: [...COMMON_SAFEGUARDS],
    version: "1.0.0",
    publicResearchPossible: false,
    evidenceGatePolicy: "EXISTING_OR_NONE",
    ...config
  };
}

export const CORE_REASONING_MODULES = Object.freeze([
  asModule({
    id: "DEFINE",
    name: "Define",
    purpose: "Separate the trunk problem from proposed solutions, symptoms, and implicit assumptions.",
    triggerConditions: ["The input mixes a situation, intervention, and unsupported claims."],
    whenToUse: ["The affected party, problem, or decision boundary is unclear."],
    whenNotToUse: ["A solution-neutral problem definition is already supported and current."],
    evidenceRequirements: ["Original wording separated into problem, solution, and assumptions", "A solution-neutral problem statement"],
    executionInstructions: "Produce a neutral problem definition and expose the decision-critical assumptions without validating or optimizing them.",
    pecPhase: "ASSUMPTIONS",
    defaultQuestion: "What is the trunk problem here, separated from the proposed solution and its assumptions?",
    priorityRationale: "The input blends a situation, a preferred intervention, and unsupported assumptions. Downstream design would optimize a branch before the trunk is clear.",
    routingRationale: "DEFINE separates the underlying problem from the proposed solution and names the decision-relevant uncertainty.",
    resolutionCriteria: "A neutral problem statement that does not assume the proposed solution, plus the assumptions it exposes.",
    possibleDispositions: ["VALIDATE", "CONTINUE", "ARCHIVE"]
  }),
  asModule({
    id: "VALIDATE",
    name: "Validate",
    purpose: "Determine whether a decision-critical claim is true, real, necessary, or viable.",
    triggerConditions: ["A central proposition controls downstream investment."],
    whenToUse: ["A claim can be confirmed, contradicted, or bounded by evidence."],
    whenNotToUse: ["The proposition is not yet defined or only a performance improvement is being considered."],
    availableTools: ["PROJECT_STATE", "PROJECT_EVIDENCE", "WEB_SEARCH", "HUMAN_GATE"],
    evidenceRequirements: ["Current primary or authoritative sources", "Contradictory evidence", "A predeclared confidence change"],
    executionInstructions: "Evaluate existing evidence first, acquire bounded public evidence when available, and identify the precise real-world gap that remains.",
    pecPhase: "ASSUMPTIONS",
    defaultQuestion: "Which central assumption must be true for this project to deserve further investment, and is it supported?",
    priorityRationale: "This assumption controls whether downstream design, pricing, and implementation work deserve investment.",
    routingRationale: "VALIDATE seeks evidence capable of confirming or invalidating the central proposition.",
    resolutionCriteria: "Credible current evidence that would raise, lower, or bound confidence in the proposition.",
    publicResearchPossible: true,
    evidenceGatePolicy: "PUBLIC_THEN_EXISTING",
    possibleDispositions: ["STRESS_TEST", "PUBLIC_RESEARCH_REQUIRED", "HUMAN_REAL_WORLD_INPUT_REQUIRED", "PIVOT", "KILL", "CONTINUE"]
  }),
  asModule({
    id: "STRESS_TEST",
    name: "Stress-Test",
    purpose: "Identify the realistic conditions under which the current direction breaks.",
    triggerConditions: ["A defined direction has earned adversarial examination."],
    whenToUse: ["Failure modes, hidden assumptions, incentives, safety, or scaling risks matter."],
    whenNotToUse: ["The trunk proposition is still undefined."],
    evidenceRequirements: ["Failure modes across incentives, operations, scale, safety, and constraints", "Explicit break thresholds"],
    executionInstructions: "Name meaningful break conditions, their consequences, and what must change; do not merely criticize.",
    pecPhase: "ADVERSARIAL_REVIEW",
    defaultQuestion: "Under what realistic conditions would the current direction fail badly enough to stop or pivot?",
    priorityRationale: "The direction is defined enough to expose meaningful failure conditions before more resources are committed.",
    routingRationale: "STRESS_TEST identifies concrete break conditions and the changes required to survive them.",
    resolutionCriteria: "Specific failure thresholds, their likelihood, and a mitigation or stop condition.",
    possibleDispositions: ["ITERATE", "PIVOT", "KILL", "TEST", "CONTINUE"]
  }),
  asModule({
    id: "ROOT_CAUSE",
    name: "Root Cause",
    purpose: "Distinguish causal mechanisms from symptoms and correlations.",
    triggerConditions: ["The project may be acting on a symptom rather than its cause."],
    whenToUse: ["Competing causal explanations would lead to different actions."],
    whenNotToUse: ["The immediate uncertainty is demand, prioritization, or measurement rather than mechanism."],
    evidenceRequirements: ["Competing causal hypotheses", "Evidence that would discriminate between them"],
    executionInstructions: "Compare plausible mechanisms and specify evidence that would discriminate among them.",
    pecPhase: "ROOT_CAUSE",
    defaultQuestion: "What causal mechanism most plausibly produces the problem, rather than merely correlating with it?",
    priorityRationale: "Acting on a symptom could create activity without changing the mechanism that produces the problem.",
    routingRationale: "ROOT_CAUSE distinguishes a causal mechanism from symptoms and correlations.",
    resolutionCriteria: "A causal explanation with discriminating evidence that separates it from plausible alternatives.",
    possibleDispositions: ["VALIDATE", "TEST", "PIVOT", "CONTINUE"]
  }),
  asModule({
    id: "MEASURE",
    name: "Measure",
    purpose: "Turn desired progress into an observable decision rule.",
    triggerConditions: ["Success cannot yet be distinguished from activity."],
    whenToUse: ["A metric, baseline, target, and decision threshold are needed."],
    whenNotToUse: ["The underlying proposition has not earned measurement investment."],
    availableTools: ["PROJECT_STATE", "PROJECT_EVIDENCE", "WEB_SEARCH"],
    evidenceRequirements: ["Baseline", "Target", "Measurement window", "Decision threshold"],
    executionInstructions: "Define a measurable outcome, baseline, target, time window, and the decision it changes.",
    pecPhase: "SUCCESS_METRICS",
    defaultQuestion: "What observable outcome would distinguish meaningful progress from activity?",
    priorityRationale: "Without an observable success condition, later evidence cannot reliably change the decision.",
    routingRationale: "MEASURE turns success into an observable decision rule.",
    resolutionCriteria: "A metric, baseline, target, time window, and decision threshold.",
    publicResearchPossible: true,
    evidenceGatePolicy: "PUBLIC_THEN_EXISTING",
    possibleDispositions: ["TEST", "PUBLIC_RESEARCH_REQUIRED", "CONTINUE"]
  }),
  asModule({
    id: "PRIORITIZE",
    name: "Prioritize",
    purpose: "Choose among paths by leverage, opportunity cost, reversibility, and information gain.",
    triggerConditions: ["Multiple plausible paths compete for limited attention or resources."],
    whenToUse: ["The choice between options now matters more than generating more options."],
    whenNotToUse: ["The trunk problem or evidence threshold is still unresolved."],
    evidenceRequirements: ["Opportunity cost", "Reversibility", "Information gain", "Resource requirement"],
    executionInstructions: "Rank options using explicit leverage, cost, reversibility, and learning criteria.",
    pecPhase: "OPPORTUNITY_COST",
    defaultQuestion: "Which option preserves the most learning and upside while limiting irreversible cost?",
    priorityRationale: "Several paths remain open; their opportunity cost and reversibility now matter more than adding options.",
    routingRationale: "PRIORITIZE compares paths by leverage, opportunity cost, and reversibility.",
    resolutionCriteria: "A ranked choice with explicit leverage, cost, reversibility, and information-gain tradeoffs.",
    possibleDispositions: ["SIMPLIFY", "TEST", "HOLD", "CONTINUE"]
  }),
  asModule({
    id: "SIMPLIFY",
    name: "Simplify / Clean It Up",
    purpose: "Remove unsupported structure while preserving the core learning objective.",
    triggerConditions: ["The project contains avoidable complexity or premature structure."],
    whenToUse: ["A smaller version can test the same trunk uncertainty."],
    whenNotToUse: ["The retained structure has not yet been defined or validated."],
    evidenceRequirements: ["Elements required for the core test", "Elements safe to remove or defer"],
    executionInstructions: "Optimize within the current structure before adding structure; remove, defer, or combine work that does not affect the core test.",
    pecPhase: "OPTION_PRESERVATION",
    defaultQuestion: "What can be removed or delayed without weakening the project's ability to test its trunk assumption?",
    priorityRationale: "The project contains structure that may not be necessary to learn whether the core direction works.",
    routingRationale: "SIMPLIFY removes unsupported structure before anything new is added.",
    resolutionCriteria: "A smaller project shape that preserves the core learning objective.",
    possibleDispositions: ["TEST", "BUILD_MVP", "CONTINUE"]
  }),
  asModule({
    id: "OPTIMIZE",
    name: "Optimize",
    purpose: "Improve the binding constraint of a direction that has earned continued investment.",
    triggerConditions: ["Evidence supports keeping the current direction."],
    whenToUse: ["A measurable performance constraint limits a retained structure."],
    whenNotToUse: ["The trunk proposition or continued-investment threshold is not met."],
    evidenceRequirements: ["Binding constraint", "Baseline performance", "Change with measurable effect"],
    executionInstructions: "Improve the binding constraint within the retained structure without adding unsupported complexity.",
    pecPhase: "MVP_PLANNING",
    defaultQuestion: "Given that this direction has earned continued investment, what constraint most limits its performance?",
    priorityRationale: "The retained direction has enough support to improve a limiting constraint without premature expansion.",
    routingRationale: "OPTIMIZE improves a retained direction within its current structure.",
    resolutionCriteria: "A measurable improvement to the binding constraint without adding unsupported structure.",
    dependencies: ["A declared continued-investment threshold"],
    possibleDispositions: ["TEST", "ITERATE", "SCALE", "CONTINUE"]
  }),
  asModule({
    id: "OIP",
    name: "Organization Intelligence Profile",
    type: "CONDITIONAL_MODULE",
    purpose: "Evaluate how an organization's incentives, governance, and actions affect the project.",
    triggerConditions: ["A partner, competitor, provider, or institution materially affects the uncertainty."],
    whenToUse: ["Organizational behavior can change partnership, competitive, governance, or risk decisions."],
    whenNotToUse: ["No organization is materially involved."],
    availableTools: ["PROJECT_STATE", "PROJECT_EVIDENCE", "WEB_SEARCH"],
    evidenceRequirements: ["Public actions and incentives", "Governance and stakeholder effects", "Contradictions between mission and behavior"],
    executionInstructions: "Assess observable incentives, governance, actions, mission/action alignment, stakeholder effects, and relevance without inferring private motives.",
    pecPhase: "ASSUMPTIONS",
    defaultQuestion: "How do the relevant organization's incentives and actual behavior affect this opportunity?",
    priorityRationale: "An organization's incentives and operating behavior materially affect the truth of the current proposition.",
    routingRationale: "OIP is appropriate because organizational incentives are material to the uncertainty.",
    resolutionCriteria: "Evidence of mission, incentives, actions, governance, and stakeholder effects that changes the project decision.",
    publicResearchPossible: true,
    evidenceGatePolicy: "PUBLIC_THEN_EXISTING",
    possibleDispositions: ["VALIDATE", "PUBLIC_RESEARCH_REQUIRED", "PIVOT", "CONTINUE"]
  }),
  asModule({
    id: "CDIL",
    name: "Cross-Domain Innovation Lab",
    type: "CONDITIONAL_MODULE",
    purpose: "Transfer a causal mechanism from a structurally similar domain with validity checks.",
    triggerConditions: ["Another domain may contain a useful mechanism for the same failure structure."],
    whenToUse: ["Shared incentives, constraints, feedback loops, or decision structures are material."],
    whenNotToUse: ["The analogy is only terminological or visible-form similarity."],
    evidenceRequirements: ["Shared causal mechanism", "Material domain differences", "Where the analogy breaks"],
    executionInstructions: "Transfer the underlying mechanism, not the visible form, and complete a mandatory transfer-validity check.",
    pecPhase: "OPTION_PRESERVATION",
    defaultQuestion: "Which mechanism from another domain could transfer here, and where would the analogy break?",
    priorityRationale: "A structural analogue may expose a useful mechanism, but only if the causal similarities survive a transfer check.",
    routingRationale: "CDIL tests whether a causal mechanism—not surface terminology—can transfer across domains.",
    resolutionCriteria: "A transferable causal mechanism that passes similarity, difference, and analogy-break checks.",
    safeguards: [...COMMON_SAFEGUARDS, "Reject superficial analogies that do not pass transfer validity."],
    possibleDispositions: ["VALIDATE", "TEST", "ARCHIVE", "CONTINUE"]
  }),
  asModule({
    id: "OAMPES",
    name: "OAMPES",
    type: "CONDITIONAL_MODULE",
    purpose: "Develop an evidence-bounded interpretation of stakeholder internal logic before acting.",
    triggerConditions: ["Value conflict, emotional reasoning, disagreement, or apparently irrational behavior is material."],
    whenToUse: ["Perspective-taking could change the next action or stakeholder decision."],
    whenNotToUse: ["Motives are not material or sufficient direct evidence already resolves the issue."],
    evidenceRequirements: ["Observed behavior", "Stated constraints", "Alternative interpretations", "Uncertainty about motives"],
    executionInstructions: "Use Observe → Anchor → Map → Project → Evaluate → Separate; state interpretations as possibilities, not facts about motives.",
    pecPhase: "ASSUMPTIONS",
    defaultQuestion: "What internally coherent stakeholder perspective must be understood before deciding what to do?",
    priorityRationale: "Stakeholder behavior cannot be evaluated responsibly without first modeling the possible internal logic behind it.",
    routingRationale: "OAMPES creates a bounded interpretation of stakeholder logic without claiming certainty about motives.",
    resolutionCriteria: "A plausible, evidence-bounded stakeholder model and the observation that would confirm or revise it.",
    safeguards: [...COMMON_SAFEGUARDS, "Never claim certainty about another person's motives without evidence."],
    possibleDispositions: ["VALIDATE", "HUMAN_REAL_WORLD_INPUT_REQUIRED", "CONTINUE"]
  }),
  asModule({
    id: "TEST",
    name: "Test",
    purpose: "Produce the smallest discriminating real-world observation with declared thresholds.",
    triggerConditions: ["Reasoning and public evidence cannot resolve the remaining uncertainty."],
    whenToUse: ["A bounded real-world test can change confidence or disposition."],
    whenNotToUse: ["Existing or public evidence has not yet been used."],
    availableTools: ["PROJECT_STATE", "PROJECT_EVIDENCE", "HUMAN_GATE"],
    evidenceRequirements: ["Smallest real-world observation", "Pass/fail/inconclusive criteria", "Owner and authorization"],
    executionInstructions: "Define or evaluate one bounded test with predeclared pass, fail, and inconclusive thresholds; never invent results.",
    pecPhase: "TESTING",
    defaultQuestion: "What smallest real-world test would most reduce the remaining decision-critical uncertainty?",
    priorityRationale: "Reasoning alone cannot resolve the remaining uncertainty; a bounded real-world observation can.",
    routingRationale: "TEST converts the uncertainty into the smallest discriminating real-world observation.",
    resolutionCriteria: "A test result with a predeclared pass, fail, or inconclusive threshold.",
    dependencies: ["Existing project evidence evaluated", "Publicly obtainable evidence acquired or ruled out"],
    evidenceGatePolicy: "HUMAN_REAL_WORLD",
    possibleDispositions: ["HUMAN_REAL_WORLD_INPUT_REQUIRED", "ITERATE", "PIVOT", "BUILD_MVP", "CONTINUE"]
  }),
  asModule({
    id: "CAPTURE",
    name: "Capture",
    purpose: "Stabilize learning, contradictions, failures, and decisions in canonical memory.",
    triggerConditions: ["Material learning should be preserved before another cycle changes context."],
    whenToUse: ["Knowledge capture itself is the highest-leverage next activity."],
    whenNotToUse: ["No material learning has changed since the previous record."],
    evidenceRequirements: ["Decisions", "Evidence", "Failed assumptions", "Remaining uncertainty"],
    executionInstructions: "Preserve what changed, why, evidence provenance, uncertainty, and reopening conditions without manufacturing a new conclusion.",
    pecPhase: "KNOWLEDGE_CAPTURE",
    defaultQuestion: "What learning is now stable enough to preserve as the canonical project record?",
    priorityRationale: "The project has generated learning that should be stabilized before another reasoning cycle changes context.",
    routingRationale: "CAPTURE preserves the evidence, contradiction, and decision trail as canonical memory.",
    resolutionCriteria: "A stable record of what changed, why, and what remains open.",
    possibleDispositions: ["DECIDE", "CONTINUE", "ARCHIVE"]
  }),
  asModule({
    id: "DECIDE",
    name: "Decide",
    purpose: "Convert evidence and uncertainty into an explicit disposition and commitment boundary.",
    triggerConditions: ["The project has reached a decision boundary."],
    whenToUse: ["Evidence thresholds, unresolved uncertainty, risk, and cost of delay can be made explicit."],
    whenNotToUse: ["No relevant evidence exists or a public evidence gap remains unexamined."],
    availableTools: ["PROJECT_STATE", "PROJECT_EVIDENCE", "HUMAN_GATE"],
    evidenceRequirements: ["Decision threshold", "Current evidence", "Cost of delay", "Reopening condition"],
    executionInstructions: "State the system recommendation against the evidence threshold while preserving final human authority and reopening conditions.",
    pecPhase: "DECISION",
    defaultQuestion: "Does the current evidence justify continuing, pivoting, stopping, or shipping?",
    priorityRationale: "The project has reached a decision boundary; the evidence threshold and unresolved uncertainty must be made explicit before any disposition.",
    routingRationale: "DECIDE turns accumulated evidence into an explicit disposition and commitment boundary.",
    resolutionCriteria: "An explicit continue, pivot, stop, or ship decision tied to the evidence threshold.",
    evidenceGatePolicy: "EVIDENCE_REQUIRED",
    possibleDispositions: ["CONTINUE", "PIVOT", "HOLD", "STOP", "ARCHIVE", "KILL", "SHIP", "IMPLEMENT", "PROCEED_UNDER_UNCERTAINTY"]
  })
]);

function requiredText(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`Reasoning module ${field} must be a non-empty string.`);
}

function requiredStringArray(value, field, { allowEmpty = false } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new TypeError(`Reasoning module ${field} must be ${allowEmpty ? "an" : "a non-empty"} array of strings.`);
  }
}

export function validateReasoningModule(module) {
  if (!module || typeof module !== "object" || Array.isArray(module)) throw new TypeError("Reasoning module must be an object.");
  if (!/^[A-Z][A-Z0-9_]*$/.test(module.id || "")) throw new TypeError("Reasoning module id must be an uppercase token.");
  requiredText(module.name, "name");
  if (!MODULE_TYPES.includes(module.type)) throw new TypeError(`Reasoning module type must be one of: ${MODULE_TYPES.join(", ")}.`);
  for (const field of ["purpose", "executionInstructions", "pecPhase", "defaultQuestion", "priorityRationale", "routingRationale", "resolutionCriteria", "version"]) {
    requiredText(module[field], field);
  }
  if (!PEC_PHASE_IDS.has(module.pecPhase)) throw new TypeError(`Reasoning module pecPhase is invalid: ${module.pecPhase}.`);
  for (const field of ["triggerConditions", "whenToUse", "whenNotToUse", "requiredInputs", "availableTools", "evidenceRequirements", "expectedStructuredOutput", "stateEffects", "possibleDispositions", "safeguards"]) {
    requiredStringArray(module[field], field);
  }
  requiredStringArray(module.dependencies, "dependencies", { allowEmpty: true });
  if (typeof module.publicResearchPossible !== "boolean") throw new TypeError("Reasoning module publicResearchPossible must be boolean.");
  if (!EVIDENCE_GATE_POLICIES.includes(module.evidenceGatePolicy)) throw new TypeError(`Reasoning module evidenceGatePolicy must be one of: ${EVIDENCE_GATE_POLICIES.join(", ")}.`);
  return module;
}

export function createReasoningModuleRegistry(initialModules = []) {
  const registered = new Map();
  const api = {
    register(module) {
      validateReasoningModule(module);
      if (registered.has(module.id)) throw new TypeError(`Reasoning module is already registered: ${module.id}.`);
      const stored = Object.freeze(structuredClone(module));
      registered.set(stored.id, stored);
      return stored;
    },
    has(id) {
      return registered.has(id);
    },
    get(id) {
      const module = registered.get(id);
      if (!module) throw new TypeError(`Unknown reasoning module: ${id}.`);
      return module;
    },
    list() {
      return [...registered.values()];
    },
    ids() {
      return [...registered.keys()];
    },
    invoke(id, context = {}) {
      const module = api.get(id);
      return {
        moduleId: module.id,
        moduleVersion: module.version,
        projectId: typeof context.projectId === "string" ? context.projectId : "",
        question: typeof context.question === "string" && context.question.trim() ? context.question.trim() : module.defaultQuestion,
        instructions: module.executionInstructions,
        requiredInputs: module.requiredInputs,
        availableTools: module.availableTools,
        evidenceRequirements: module.evidenceRequirements,
        expectedStructuredOutput: module.expectedStructuredOutput,
        stateEffects: module.stateEffects,
        possibleDispositions: module.possibleDispositions,
        safeguards: module.safeguards
      };
    }
  };
  for (const module of initialModules) api.register(module);
  return Object.freeze(api);
}

export const REASONING_MODULE_REGISTRY = createReasoningModuleRegistry(CORE_REASONING_MODULES);
export const MODULE_IDS = Object.freeze(REASONING_MODULE_REGISTRY.ids());

export function getReasoningModule(id) {
  return REASONING_MODULE_REGISTRY.get(id);
}

export function modulePromptCatalog() {
  return REASONING_MODULE_REGISTRY.list().map((module) => ({
    id: module.id,
    name: module.name,
    type: module.type,
    purpose: module.purpose,
    triggerConditions: module.triggerConditions,
    whenNotToUse: module.whenNotToUse,
    availableTools: module.availableTools,
    evidenceRequirements: module.evidenceRequirements,
    safeguards: module.safeguards,
    version: module.version
  }));
}
