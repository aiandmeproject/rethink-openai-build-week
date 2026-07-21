import { createLocalProjectRepository } from "./project-repository.js";
import { createHumanReportArtifact, createReportJsonArtifact, readableEnum } from "./report-export.js";
import { describeRoutingSnapshot, researchOutcomeLabel } from "./ui-state.js";

const SAMPLE_PROBLEM = "I think Florida-based disabled veterans could provide lower-cost remote work for companies.";
const projectRepository = createLocalProjectRepository();

const PEC_PHASES = [
  ["CAPTURE", "Capture"],
  ["DEFINE", "Define"],
  ["ASSUMPTIONS", "Assumptions"],
  ["ADVERSARIAL_REVIEW", "Adversarial Review"],
  ["ROOT_CAUSE", "Root Cause"],
  ["SUCCESS_METRICS", "Success Metrics"],
  ["OPPORTUNITY_COST", "Opportunity Cost"],
  ["OPTION_PRESERVATION", "Option Preservation"],
  ["MVP_PLANNING", "MVP Planning"],
  ["TESTING", "Testing"],
  ["KNOWLEDGE_CAPTURE", "Knowledge Capture"],
  ["DECISION", "Decision"]
];

const DEFAULT_METHODS = [
  "DEFINE", "VALIDATE", "STRESS_TEST", "ROOT_CAUSE", "MEASURE", "PRIORITIZE", "SIMPLIFY",
  "OPTIMIZE", "OIP", "CDIL", "OAMPES", "TEST", "CAPTURE", "DECIDE"
];

const ACTUAL_EVIDENCE_TYPES = new Set([
  "OBSERVED_EVIDENCE", "VERIFIED_FINDING", "TEST_RESULT", "USER_ASSERTION", "ANECDOTAL_EVIDENCE",
  "PUBLIC_SOURCE_FINDING", "EXPERT_OPINION", "PRIVATE_INTERNAL_DATA", "DERIVED_CALCULATION"
]);
const EVIDENCE_INTAKE_TYPES = [
  "OBSERVED_EVIDENCE", "VERIFIED_FINDING", "INFERRED_STATEMENT", "ASSUMPTION", "RESEARCH_QUESTION",
  "PLANNED_TEST", "TEST_RESULT", "USER_ASSERTION", "ANECDOTAL_EVIDENCE", "PUBLIC_SOURCE_FINDING",
  "EXPERT_OPINION", "PRIVATE_INTERNAL_DATA", "DERIVED_CALCULATION", "MODEL_GENERATED_HYPOTHESIS"
];
const PROVENANCE_ORIGINS = ["USER_INPUT", "EXTERNAL_SOURCE", "MODEL_INFERENCE", "SYSTEM_CALCULATION", "REAL_WORLD_TEST_OBSERVATION", "INTERNAL_PROJECT_DATA"];
const SOURCE_CLASSIFICATIONS = ["PRIMARY_SOURCE", "SECONDARY_SOURCE", "TERTIARY_AGGREGATED_SOURCE", "UNKNOWN_NOT_APPLICABLE"];
const SOURCE_CATEGORIES = ["GOVERNMENT", "REGULATORY_LEGAL", "ACADEMIC_PEER_REVIEWED", "NONPROFIT_RESEARCH", "INDUSTRY_ASSOCIATION", "MARKET_RESEARCH", "CORPORATE_DISCLOSURE", "COMPANY_WEBSITE", "JOURNALISM", "PUBLIC_DATASET", "INTERNAL_COMPANY_DATA", "SURVEY", "INTERVIEW", "DIRECT_OBSERVATION", "EXPERIMENT_PILOT", "OPERATIONAL_TRANSACTIONAL_DATA", "OTHER", "UNKNOWN"];
const COLLECTION_METHODS = ["SURVEY", "INTERVIEW", "FOCUS_GROUP", "DIRECT_OBSERVATION", "EXPERIMENT_PILOT", "FIELD_TEST", "ADMINISTRATIVE_OPERATIONAL_DATA", "TRANSACTIONAL_DATA", "DOCUMENT_RECORDS_REVIEW", "PUBLIC_DATASET_ANALYSIS", "SECONDARY_DATA_ANALYSIS", "LITERATURE_RESEARCH_REVIEW", "WEB_PUBLIC_SOURCE_RESEARCH", "STATISTICAL_MODELING_ESTIMATION", "CASE_STUDY", "MIXED_METHODS", "OTHER", "UNKNOWN_NOT_REPORTED"];
const CONFIDENCE_ORIGINS = ["FRAMEWORK_DEFINED", "PROJECT_DEFINED", "USER_DEFINED", "MODEL_GENERATED", "LEGACY_UNSPECIFIED"];
const EVIDENCE_AUTHENTICITY = ["INFER_AUTOMATICALLY", "REAL_WORLD", "SYNTHETIC_SIMULATED", "UNKNOWN_NOT_ASSESSED"];
const HUMAN_DISPOSITIONS = ["CONTINUE", "PIVOT", "HOLD", "STOP", "SHIP", "IMPLEMENT", "PROCEED_UNDER_UNCERTAINTY"];
const STAGE_OVERRIDE_ACTIONS = ["MARK_COMPLETE", "PROCEED_UNRESOLVED", "BYPASS", "REOPEN", "RERUN", "FORCE_METHOD", "REQUEST_FINAL_JUDGMENT"];
let backgroundReasoningMethods = new Set(["TEST", "VALIDATE", "STRESS_TEST", "ROOT_CAUSE", "MEASURE", "OIP", "CDIL", "OAMPES"]);

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const elements = {
  captureSection: $("#captureSection"),
  workspace: $("#workspace"),
  problemInput: $("#problemInput"),
  runtimeBadge: $("#runtimeBadge"),
  liveModeInput: $("#liveModeInput"),
  liveModeHint: $("#liveModeHint"),
  runRethinkButton: $("#runRethinkButton"),
  importProjectButton: $("#importProjectButton"),
  projectImportInput: $("#projectImportInput"),
  newProjectButton: $("#newProjectButton"),
  sampleButton: $("#sampleButton"),
  projectTitle: $("#projectTitle"),
  projectKicker: $("#projectKicker"),
  cycleNumber: $("#cycleNumber"),
  projectLifecycle: $("#projectLifecycle"),
  pecRail: $("#pecRail"),
  phaseBadge: $("#phaseBadge"),
  problemDefinition: $("#problemDefinition"),
  assumptionCount: $("#assumptionCount"),
  evidenceCount: $("#evidenceCount"),
  lockCount: $("#lockCount"),
  workspaceResume: $("#workspaceResume"),
  resumeRethinkButton: $("#resumeRethinkButton"),
  stateDock: $("#stateDock"),
  dockAssumptionCount: $("#dockAssumptionCount"),
  dockEvidenceCount: $("#dockEvidenceCount"),
  dockLockCount: $("#dockLockCount"),
  stateDrawerBackdrop: $("#stateDrawerBackdrop"),
  stateDrawer: $("#stateDrawer"),
  stateDrawerTitle: $("#stateDrawerTitle"),
  stateDrawerSubtitle: $("#stateDrawerSubtitle"),
  closeStateDrawerButton: $("#closeStateDrawerButton"),
  statePanelSummary: $("#statePanelSummary"),
  addStateItemButton: $("#addStateItemButton"),
  statePanelEditor: $("#statePanelEditor"),
  statePanelContent: $("#statePanelContent"),
  tabAssumptionCount: $("#tabAssumptionCount"),
  tabEvidenceCount: $("#tabEvidenceCount"),
  tabLockCount: $("#tabLockCount"),
  tabHumanGateCount: $("#tabHumanGateCount"),
  routingPanel: $("#routingPanel"),
  routingContextLabel: $("#routingContextLabel"),
  highestLeverageQuestion: $("#highestLeverageQuestion"),
  selectedMethod: $("#selectedMethod"),
  overrideBadge: $("#overrideBadge"),
  whyQuestionNow: $("#whyQuestionNow"),
  whyMethod: $("#whyMethod"),
  resolutionCriteria: $("#resolutionCriteria"),
  evidenceNeeded: $("#evidenceNeeded"),
  evidenceGateBadge: $("#evidenceGateBadge"),
  evidenceStateSummary: $("#evidenceStateSummary"),
  routingBlocker: $("#routingBlocker"),
  routeWhy: $("#routeWhy"),
  runMethodButton: $("#runMethodButton"),
  chooseMethodButton: $("#chooseMethodButton"),
  askWhyButton: $("#askWhyButton"),
  methodChooser: $("#methodChooser"),
  methodSelect: $("#methodSelect"),
  resultPanel: $("#resultPanel"),
  reasoningProgressPanel: $("#reasoningProgressPanel"),
  reasoningProgressTitle: $("#reasoningProgressTitle"),
  reasoningProgressBadge: $("#reasoningProgressBadge"),
  reasoningProgressMessage: $("#reasoningProgressMessage"),
  reasoningProgressMethod: $("#reasoningProgressMethod"),
  reasoningExecutionStatus: $("#reasoningExecutionStatus"),
  reasoningResponseId: $("#reasoningResponseId"),
  reasoningProgressError: $("#reasoningProgressError"),
  checkReasoningButton: $("#checkReasoningButton"),
  retryReasoningButton: $("#retryReasoningButton"),
  researchProgressPanel: $("#researchProgressPanel"),
  researchProgressTitle: $("#researchProgressTitle"),
  researchProgressBadge: $("#researchProgressBadge"),
  researchProgressMessage: $("#researchProgressMessage"),
  researchExecutionStatus: $("#researchExecutionStatus"),
  researchEvidenceOutcome: $("#researchEvidenceOutcome"),
  researchSupportingScope: $("#researchSupportingScope"),
  researchDisconfirmingScope: $("#researchDisconfirmingScope"),
  retryResearchButton: $("#retryResearchButton"),
  viewResearchErrorButton: $("#viewResearchErrorButton"),
  proceedWithoutResearchButton: $("#proceedWithoutResearchButton"),
  reassessResearchButton: $("#reassessResearchButton"),
  differentScopeButton: $("#differentScopeButton"),
  proceedInconclusiveButton: $("#proceedInconclusiveButton"),
  routeHumanResearchButton: $("#routeHumanResearchButton"),
  refreshResearchButton: $("#refreshResearchButton"),
  researchScopeForm: $("#researchScopeForm"),
  supportingScopeInput: $("#supportingScopeInput"),
  disconfirmingScopeInput: $("#disconfirmingScopeInput"),
  cancelScopeEditButton: $("#cancelScopeEditButton"),
  researchDecisionForm: $("#researchDecisionForm"),
  researchDecisionTitle: $("#researchDecisionTitle"),
  researchDecisionHelp: $("#researchDecisionHelp"),
  researchDecisionRationale: $("#researchDecisionRationale"),
  cancelResearchDecisionButton: $("#cancelResearchDecisionButton"),
  researchErrorLog: $("#researchErrorLog"),
  researchErrorTimestamp: $("#researchErrorTimestamp"),
  researchErrorJob: $("#researchErrorJob"),
  researchErrorSummary: $("#researchErrorSummary"),
  researchErrorCode: $("#researchErrorCode"),
  researchErrorStage: $("#researchErrorStage"),
  researchErrorTokenBudget: $("#researchErrorTokenBudget"),
  researchErrorCitationCount: $("#researchErrorCitationCount"),
  researchErrorEvidenceCount: $("#researchErrorEvidenceCount"),
  researchCitationFailures: $("#researchCitationFailures"),
  researchCitationFailureList: $("#researchCitationFailureList"),
  researchErrorRetries: $("#researchErrorRetries"),
  researchErrorState: $("#researchErrorState"),
  researchTechnicalError: $("#researchTechnicalError"),
  copyResearchErrorButton: $("#copyResearchErrorButton"),
  sourceBadge: $("#sourceBadge"),
  reasoningConclusion: $("#reasoningConclusion"),
  learnedList: $("#learnedList"),
  stateChangesList: $("#stateChangesList"),
  uncertaintyList: $("#uncertaintyList"),
  evidenceEvaluationSection: $("#evidenceEvaluationSection"),
  evidenceThresholdSummary: $("#evidenceThresholdSummary"),
  evidenceThresholdBadge: $("#evidenceThresholdBadge"),
  evidenceThresholdRationale: $("#evidenceThresholdRationale"),
  validationProcessStatus: $("#validationProcessStatus"),
  propositionStatus: $("#propositionStatus"),
  propositionStatusRationale: $("#propositionStatusRationale"),
  disconfirmationBlock: $("#disconfirmationBlock"),
  disconfirmationFlag: $("#disconfirmationFlag"),
  strongestSupport: $("#strongestSupport"),
  strongestContradiction: $("#strongestContradiction"),
  strongestLimitation: $("#strongestLimitation"),
  conclusionChanger: $("#conclusionChanger"),
  evidenceConsideredList: $("#evidenceConsideredList"),
  evidenceGapsBlock: $("#evidenceGapsBlock"),
  evidenceGapsList: $("#evidenceGapsList"),
  citationsSection: $("#citationsSection"),
  citationsList: $("#citationsList"),
  disposition: $("#disposition"),
  nextAction: $("#nextAction"),
  nextActionWhy: $("#nextActionWhy"),
  nextCycleButton: $("#nextCycleButton"),
  humanGatePanel: $("#humanGatePanel"),
  humanGateQuestion: $("#humanGateQuestion"),
  humanGateRequired: $("#humanGateRequired"),
  humanGateWhy: $("#humanGateWhy"),
  resolveHumanGateButton: $("#resolveHumanGateButton"),
  gateAddEvidenceButton: $("#gateAddEvidenceButton"),
  stageOverrideButton: $("#stageOverrideButton"),
  finalJudgmentButton: $("#finalJudgmentButton"),
  lockButton: $("#lockButton"),
  exportButton: $("#exportButton"),
  exportNotebookButton: $("#exportNotebookButton"),
  generateReportButton: $("#generateReportButton"),
  reportPanel: $("#reportPanel"),
  reportContent: $("#reportContent"),
  downloadReportButton: $("#downloadReportButton"),
  downloadReportJsonButton: $("#downloadReportJsonButton"),
  notebookEmpty: $("#notebookEmpty"),
  notebookList: $("#notebookList"),
  toast: $("#toast")
};

let projectState = null;
let pendingRouting = null;
let currentResult = null;
let activeResearch = null;
let activeReasoning = null;
let currentReport = null;
let liveAvailable = false;
let availableMethods = [...DEFAULT_METHODS];
let moduleNames = new Map();
let busy = false;
let toastTimer = null;
let activeStatePanel = "assumptions";
let stateDrawerReturnFocus = null;
let researchPollTimer = null;
let reasoningPollTimer = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
  } catch {
    return null;
  }
}

function normalizeClientProjectState(state) {
  if (!state) return null;
  state.lifecycleStatus = state.lifecycleStatus || "ACTIVE";
  state.currentDisposition = state.currentDisposition || "CONTINUE";
  state.stateEvents = Array.isArray(state.stateEvents) ? state.stateEvents : [];
  state.assumptions = (state.assumptions || []).map((item) => ({
    ...item,
    confidenceOrigin: item.confidenceOrigin || "LEGACY_UNSPECIFIED",
    evidenceIds: Array.isArray(item.evidenceIds) ? item.evidenceIds : [],
    removedAt: item.removedAt || "",
    removedReason: item.removedReason || ""
  }));
  state.evidence = (state.evidence || []).map((item) => ({
    ...item,
    status: item.status || "ACTIVE",
    intakeType: item.intakeType === "EVIDENCE" ? "OBSERVED_EVIDENCE" : (item.intakeType === "ANECDOTAL_OBSERVATION" ? "ANECDOTAL_EVIDENCE" : (item.intakeType || "ANECDOTAL_EVIDENCE")),
    evidenceAuthenticity: item.evidenceAuthenticity || "UNKNOWN_NOT_ASSESSED",
    provenanceOrigin: item.provenanceOrigin || item.sourceType || "USER_INPUT",
    sourceClassification: item.sourceClassification || "UNKNOWN_NOT_APPLICABLE",
    sourceCategory: item.sourceCategory || "UNKNOWN",
    reliability: item.reliability === "NONE" ? "UNKNOWN_NOT_ASSESSED" : (item.reliability || "UNKNOWN_NOT_ASSESSED"),
    relationship: item.relationship === "NONE" ? "NONE_UNLINKED" : (item.relationship || "NONE_UNLINKED"),
    sourceDate: item.sourceDate || "",
    population: item.population || "",
    collectionMethod: item.collectionMethod || "UNKNOWN_NOT_REPORTED",
    methodDetails: item.methodDetails || item.method || "",
    observation: item.observation || item.claim || "",
    assumptionIds: Array.isArray(item.assumptionIds) ? item.assumptionIds : [],
    questionRefs: Array.isArray(item.questionRefs) ? item.questionRefs : [],
    removedAt: item.removedAt || "",
    removedReason: item.removedReason || ""
  }));
  state.lockedDecisions = (state.lockedDecisions || []).map((item) => ({
    ...item,
    status: item.status || "ACTIVE",
    evidence: Array.isArray(item.evidence) ? item.evidence : [],
    reopenedAt: item.reopenedAt || ""
  }));
  state.humanGates = Array.isArray(state.humanGates) ? state.humanGates : [];
  state.humanDecisions = Array.isArray(state.humanDecisions) ? state.humanDecisions : [];
  state.stageOverrides = Array.isArray(state.stageOverrides) ? state.stageOverrides : [];
  state.questions = Array.isArray(state.questions) ? state.questions : [];
  state.researchHistory = (Array.isArray(state.researchHistory) ? state.researchHistory : []).map((item) => ({
    ...item,
    executionStatus: item.executionStatus || (item.status === "COMPLETED" ? "COMPLETED" : (["FAILED", "HUNG"].includes(item.status) ? "FAILED_TECHNICALLY" : "PENDING")),
    evidenceOutcome: item.evidenceOutcome || (item.status === "COMPLETED" ? "NO_CONCLUSIVE_EVIDENCE_FOUND" : "NOT_EVALUATED"),
    errorLog: Array.isArray(item.errorLog) ? item.errorLog : []
  }));
  state.lineage = state.lineage && typeof state.lineage === "object" ? state.lineage : { parentProjectId: "", sourceTangentId: "", explicitImports: [] };
  state.importHistory = Array.isArray(state.importHistory) ? state.importHistory : [];
  return state;
}

function activeAssumptions() {
  return (projectState?.assumptions || []).filter((item) => !item.removedAt);
}

function activeEvidence() {
  return (projectState?.evidence || []).filter((item) => item.status === "ACTIVE" && ACTUAL_EVIDENCE_TYPES.has(item.intakeType));
}

function routedIntakeItems() {
  return (projectState?.evidence || []).filter((item) => item.status === "ROUTED");
}

function openHumanGates() {
  return (projectState?.humanGates || []).filter((item) => item.status === "OPEN");
}

function selectedMode() {
  return document.querySelector('input[name="mode"]:checked')?.value || "demo";
}

function titleCaseToken(value) {
  return String(value || "")
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function methodLabel(value) {
  const labels = { STRESS_TEST: "Stress-Test", ROOT_CAUSE: "Root Cause" };
  return moduleNames.get(value) || labels[value] || titleCaseToken(value);
}

function confidenceLabel(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "Not assessed";
  if (number < 0.25) return "Very low";
  if (number < 0.5) return "Low";
  if (number < 0.75) return "Moderate";
  if (number < 0.9) return "High";
  return "Very high";
}

function populateMethodOptions() {
  elements.methodSelect.innerHTML = availableMethods.map((method) => `<option value="${method}">${escapeHtml(methodLabel(method))}</option>`).join("");
}

function showToast(message, kind = "info") {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.toggle("error", kind === "error");
  elements.toast.hidden = false;
  toastTimer = setTimeout(() => {
    elements.toast.hidden = true;
  }, kind === "error" ? 8500 : 4200);
}

function setBusy(value, label = "Working…") {
  busy = value;
  const interactive = [
    elements.runRethinkButton,
    elements.resumeRethinkButton,
    elements.runMethodButton,
    elements.nextCycleButton,
    elements.lockButton,
    ...$$('[data-method]')
  ];
  interactive.forEach((button) => { button.disabled = value; });
  if (!value) {
    const liveResearchCanResolveBlock = pendingRouting?.evidenceGate === "PUBLIC_RESEARCH_REQUIRED" && selectedMode() === "live";
    elements.runMethodButton.disabled = Boolean(currentResult?.reasoning && pendingRouting)
      || (Boolean(pendingRouting?.executionBlocked) && !liveResearchCanResolveBlock)
      || researchPending()
      || reasoningPending();
  }
  if (value) {
    elements.runRethinkButton.dataset.label = elements.runRethinkButton.textContent;
    elements.runRethinkButton.querySelector("span:first-child").textContent = label;
  } else {
    elements.runRethinkButton.querySelector("span:first-child").textContent = "Run Rethink";
  }
}

async function api(path, body) {
  const response = await fetch(path, {
    method: body == null ? "GET" : "POST",
    headers: body == null ? {} : { "Content-Type": "application/json" },
    body: body == null ? undefined : JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message || `Request failed (${response.status}).`);
    error.code = payload?.error?.code;
    error.demoAvailable = payload?.error?.demoAvailable;
    throw error;
  }
  return payload;
}

function persist() {
  if (!projectState) {
    projectRepository.clearSession();
    return;
  }
  projectRepository.saveSession({
    state: projectState,
    routing: pendingRouting,
    result: currentResult,
    research: activeResearch,
    reasoning: activeReasoning,
    report: currentReport,
    mode: selectedMode()
  });
}

function restore() {
  try {
    const saved = projectRepository.loadSession();
    if (!saved?.state?.id) return;
    projectState = normalizeClientProjectState(saved.state);
    pendingRouting = saved.routing || null;
    currentResult = saved.result || null;
    activeResearch = saved.research || null;
    activeReasoning = saved.reasoning || null;
    currentReport = saved.report || null;
    if (saved.mode === "live") {
      elements.liveModeInput.checked = true;
    }
    renderAll();
    if (activeResearch && researchPending()) scheduleResearchPoll(250);
    if (activeReasoning && reasoningShouldAutoPoll()) scheduleReasoningPoll(250);
  } catch {
    projectRepository.clearSession();
  }
}

function renderRuntime() {
  const live = selectedMode() === "live";
  elements.runtimeBadge.textContent = live ? "Live GPT-5.6" : "Demo Mode";
  elements.runtimeBadge.className = `runtime-badge ${live ? "live" : "demo"}`;
}

function renderPecRail() {
  const currentIndex = projectState?.pecPhase?.index ?? 0;
  elements.pecRail.innerHTML = PEC_PHASES.map(([id, label], index) => {
    const stateClass = index === currentIndex ? "active" : (index < currentIndex ? "past" : "");
    const current = index === currentIndex ? ' aria-current="step"' : "";
    return `<li class="${stateClass}"${current}><span>${String(index).padStart(2, "0")}</span><strong>${escapeHtml(label)}</strong></li>`;
  }).join("");
}

function renderProject() {
  if (!projectState) {
    elements.captureSection.hidden = false;
    elements.workspace.hidden = true;
    elements.stateDock.hidden = true;
    return;
  }

  projectState = normalizeClientProjectState(projectState);
  elements.captureSection.hidden = true;
  elements.workspace.hidden = false;
  elements.stateDock.hidden = false;
  elements.projectTitle.textContent = projectState.title;
  elements.projectKicker.textContent = `Current project state · ${projectState.id}`;
  elements.cycleNumber.textContent = projectState.cycle;
  elements.projectLifecycle.textContent = `${titleCaseToken(projectState.lifecycleStatus)} · ${titleCaseToken(projectState.currentDisposition)}`;
  elements.phaseBadge.textContent = projectState.pecPhase.label;
  elements.problemDefinition.textContent = projectState.problemDefinition;
  const openAssumptionCount = activeAssumptions().filter((item) => ["UNTESTED", "CHALLENGED"].includes(item.status)).length;
  const evidenceItemCount = activeEvidence().length;
  const versionCount = projectState.lockedDecisions.length;
  elements.assumptionCount.textContent = openAssumptionCount;
  elements.evidenceCount.textContent = evidenceItemCount;
  elements.lockCount.textContent = versionCount;
  elements.dockAssumptionCount.textContent = openAssumptionCount;
  elements.dockEvidenceCount.textContent = evidenceItemCount;
  elements.dockLockCount.textContent = versionCount;
  elements.tabAssumptionCount.textContent = openAssumptionCount;
  elements.tabEvidenceCount.textContent = evidenceItemCount;
  elements.tabLockCount.textContent = versionCount;
  elements.tabHumanGateCount.textContent = openHumanGates().length;
  const needsRoute = !pendingRouting && !currentResult;
  elements.workspaceResume.hidden = !needsRoute;
  elements.resumeRethinkButton.textContent = projectState.cycle === 0 ? "Run Rethink" : "Reassess next question";
  renderPecRail();
  if (!elements.stateDrawer.hidden) renderStatePanel();
}

function formatDate(value) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function availableQuestions() {
  const records = (projectState?.questions || []).map((item) => ({
    text: item.text,
    status: item.status || "PRIOR"
  }));
  if (pendingRouting?.highestLeverageQuestion && !currentResult?.reasoning) {
    records.unshift({ text: pendingRouting.highestLeverageQuestion, status: "CURRENT_ACTIVE" });
  }
  for (const entry of projectState?.notebook || []) {
    if (entry.entryType === "STATE_EDIT" || entry.projectId !== projectState.id || entry.contextStatus === "LEGACY_UNVERIFIED" || !entry.highestLeverageQuestion) continue;
    records.push({ text: entry.highestLeverageQuestion, status: "RESOLVED" });
  }
  const unique = new Map();
  for (const record of records) {
    const key = String(record.text || "").trim().toLowerCase();
    if (key && !unique.has(key)) unique.set(key, record);
  }
  return [...unique.values()];
}

function entityTrace(entityType, entityId) {
  return (projectState?.stateEvents || [])
    .filter((event) => event.entityType === entityType && event.entityId === entityId)
    .reverse();
}

function traceMarkup(entityType, entityId) {
  const events = entityTrace(entityType, entityId);
  if (events.length === 0) return "<p>No explicit edit events have been recorded for this item yet.</p>";
  return `<ol class="trace-list">${events.map((event) => `<li>
    <time datetime="${escapeHtml(event.timestamp)}">${escapeHtml(formatDate(event.timestamp))}</time>
    <div><strong>${escapeHtml(titleCaseToken(event.action))} · Cycle ${escapeHtml(event.cycle)}</strong>
    <p>${escapeHtml(event.summary)} — ${escapeHtml(event.reason)}</p></div>
  </li>`).join("")}</ol>`;
}

function linkedEvidenceMarkup(ids = []) {
  if (ids.length === 0) return "<span>No evidence linked</span>";
  return ids.map((id) => {
    const item = (projectState?.evidence || []).find((candidate) => candidate.id === id);
    if (!item) return "";
    return `<button class="trace-link" type="button" data-state-action="open-evidence" data-id="${escapeHtml(id)}">Evidence: ${escapeHtml(item.claim)}</button>`;
  }).join("");
}

function linkedAssumptionMarkup(ids = []) {
  if (ids.length === 0) return "<span>No assumptions linked</span>";
  return ids.map((id) => {
    const item = (projectState?.assumptions || []).find((candidate) => candidate.id === id);
    if (!item) return "";
    return `<button class="trace-link" type="button" data-state-action="open-assumption" data-id="${escapeHtml(id)}">Assumption: ${escapeHtml(item.text)}</button>`;
  }).join("");
}

function renderAssumptionsPanel() {
  const assumptions = projectState?.assumptions || [];
  if (assumptions.length === 0) {
    return `<div class="empty-state-panel"><strong>No assumptions captured yet</strong><p>Add the claim that currently shapes a downstream decision, then link supporting or conflicting evidence.</p></div>`;
  }
  return [...assumptions].reverse().map((item) => {
    const removed = Boolean(item.removedAt);
    const status = removed ? "REMOVED" : item.status;
    return `<article class="state-record${removed ? " removed" : ""}" data-record-id="${escapeHtml(item.id)}">
      <div class="state-record-header"><h3>${escapeHtml(item.text)}</h3><span class="record-status ${escapeHtml(status.toLowerCase())}">${escapeHtml(status)}</span></div>
      <p>${escapeHtml(item.rationale || "No rationale recorded.")}</p>
      <div class="record-meta"><span>${escapeHtml(confidenceLabel(item.confidence))} confidence (${Math.round(Number(item.confidence || 0) * 100)}%)</span><span>Origin: ${escapeHtml(titleCaseToken(item.confidenceOrigin || "LEGACY_UNSPECIFIED"))}</span><span>Introduced Cycle ${escapeHtml(item.sourceCycle ?? 0)}</span>${linkedEvidenceMarkup(item.evidenceIds)}</div>
      ${removed ? `<p><strong>Removal reason:</strong> ${escapeHtml(item.removedReason)}</p>` : `<div class="record-actions"><button type="button" data-state-action="edit-assumption" data-id="${escapeHtml(item.id)}">Edit & link evidence</button><button class="record-remove" type="button" data-state-action="remove-assumption" data-id="${escapeHtml(item.id)}">Remove</button></div>`}
      <details><summary>Trace history (${entityTrace("ASSUMPTION", item.id).length})</summary>${traceMarkup("ASSUMPTION", item.id)}</details>
    </article>`;
  }).join("");
}

function renderEvidencePanel() {
  const evidence = projectState?.evidence || [];
  if (evidence.length === 0) {
    return `<div class="empty-state-panel"><strong>No evidence captured yet</strong><p>Add an observation, external source, or model inference and identify every assumption or question it affects.</p></div>`;
  }
  return [...evidence].reverse().map((item) => {
    const removed = item.status === "REMOVED";
    const routed = item.status === "ROUTED";
    const synthetic = item.evidenceAuthenticity === "SYNTHETIC_SIMULATED";
    const sourceUrl = safeUrl(item.sourceUrl);
    const source = item.sourceTitle
      ? (sourceUrl ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(item.sourceTitle)}</a>` : escapeHtml(item.sourceTitle))
      : "No source title";
    const questions = (item.questionRefs || []).length
      ? item.questionRefs.map((question) => `<span>Question: ${escapeHtml(question)}</span>`).join("")
      : "<span>No questions linked</span>";
    return `<article class="state-record${removed ? " removed" : ""}${routed ? " routed" : ""}" data-record-id="${escapeHtml(item.id)}">
      <div class="state-record-header"><h3>${escapeHtml(item.claim)}</h3><span class="record-status ${removed ? "removed" : (routed ? "routed" : "")}">${escapeHtml(item.status || "ACTIVE")}</span></div>
      <p>${escapeHtml(item.assessment || "No assessment recorded.")}</p>
      <div class="evidence-quality-strip"><span>${escapeHtml(titleCaseToken(item.intakeType))}</span><span>${escapeHtml(titleCaseToken(item.evidenceAuthenticity))}</span><span>${escapeHtml(titleCaseToken(item.reliability))} reliability</span><span>${escapeHtml(titleCaseToken(item.relationship))}</span></div>
      ${routed ? `<p class="routed-note">Preserved for traceability, but not counted as observed evidence. Route it to the appropriate assumption, question, or test workflow.</p>` : ""}
      ${synthetic ? `<p class="routed-note"><strong>Synthetic test data:</strong> traceable for software acceptance testing, but excluded from real-world validation thresholds.</p>` : ""}
      <div class="record-meta"><span>Origin: ${escapeHtml(titleCaseToken(item.provenanceOrigin))}</span><span>${escapeHtml(titleCaseToken(item.sourceClassification))}</span><span>${escapeHtml(titleCaseToken(item.sourceCategory))}</span><span>${source}</span>${item.sourceDate ? `<span>${escapeHtml(item.sourceDate)}</span>` : ""}${item.population ? `<span>Population: ${escapeHtml(item.population)}</span>` : ""}<span>Method: ${escapeHtml(titleCaseToken(item.collectionMethod))}</span>${item.methodDetails ? `<span>${escapeHtml(item.methodDetails)}</span>` : ""}${(item.citationIds || []).length ? `<span>Native citation: ${escapeHtml(item.citationIds.join(", "))}</span>` : ""}${linkedAssumptionMarkup(item.assumptionIds)}${questions}</div>
      ${removed ? `<p><strong>Removal reason:</strong> ${escapeHtml(item.removedReason)}</p>` : `<div class="record-actions"><button type="button" data-state-action="edit-evidence" data-id="${escapeHtml(item.id)}">Edit links</button><button class="record-remove" type="button" data-state-action="remove-evidence" data-id="${escapeHtml(item.id)}">Remove</button></div>`}
      <details><summary>Trace history (${entityTrace("EVIDENCE", item.id).length})</summary>${traceMarkup("EVIDENCE", item.id)}</details>
    </article>`;
  }).join("");
}

function renderLocksPanel() {
  const locks = projectState?.lockedDecisions || [];
  if (locks.length === 0) {
    return `<div class="empty-state-panel"><strong>No canonical versions yet</strong><p>Use Lock It In when the current project state should remain canonical until named evidence justifies reopening it.</p></div>`;
  }
  return [...locks].reverse().map((lock) => {
    const activeAssumptionSnapshot = (lock.assumptions || []).filter((item) => !item.removedAt);
    const activeEvidenceSnapshot = (lock.evidence || []).filter((item) => item.status !== "REMOVED");
    const assumptionSnapshotMarkup = activeAssumptionSnapshot.length
      ? `<ul class="comparison-list">${activeAssumptionSnapshot.map((item) => `<li>${escapeHtml(item.text)} <strong>· ${escapeHtml(item.status)} · ${Math.round(Number(item.confidence || 0) * 100)}%</strong></li>`).join("")}</ul>`
      : "<p>No active assumptions in this snapshot.</p>";
    const evidenceSnapshotMarkup = activeEvidenceSnapshot.length
      ? `<ul class="comparison-list">${activeEvidenceSnapshot.map((item) => `<li>${escapeHtml(item.claim)} <strong>· ${escapeHtml(titleCaseToken(item.provenanceOrigin || item.sourceType))}</strong></li>`).join("")}</ul>`
      : "<p>No active evidence in this snapshot.</p>";
    return `<article class="state-record${lock.status === "REOPENED" ? " removed" : ""}" data-record-id="${escapeHtml(lock.id)}">
      <div class="state-record-header"><h3>Version ${escapeHtml(lock.cycle)}</h3><span class="record-status ${escapeHtml(lock.status.toLowerCase())}">${escapeHtml(lock.status)}</span></div>
      <p>${escapeHtml(lock.note || "Canonical working state created with Lock It In.")}</p>
      <div class="record-meta"><span>${escapeHtml(formatDate(lock.lockedAt))}</span><span>${escapeHtml(titleCaseToken(lock.pecPhase))}</span><span>${activeAssumptionSnapshot.length} assumptions</span><span>${activeEvidenceSnapshot.length} evidence items</span></div>
      <details><summary>Inspect complete snapshot</summary><p><strong>Problem:</strong> ${escapeHtml(lock.problemDefinition)}</p><p><strong>Highest-leverage question:</strong> ${escapeHtml(lock.highestLeverageQuestion || "Not recorded")}</p><p><strong>Assumptions</strong></p>${assumptionSnapshotMarkup}<p><strong>Evidence</strong></p>${evidenceSnapshotMarkup}</details>
      ${lock.status === "REOPENED" ? `<p><strong>Reopened:</strong> ${escapeHtml(titleCaseToken(lock.reopeningTrigger))} — ${escapeHtml(lock.reopeningReason)} (${escapeHtml(formatDate(lock.reopenedAt))})</p>` : ""}
      <div class="record-actions"><button type="button" data-state-action="compare-lock" data-id="${escapeHtml(lock.id)}">Compare to current</button>${lock.status === "ACTIVE" ? `<button type="button" data-state-action="reopen-lock" data-id="${escapeHtml(lock.id)}">Controlled reopening</button>` : ""}</div>
      <details><summary>Trace history (${entityTrace("LOCK", lock.id).length})</summary>${traceMarkup("LOCK", lock.id)}</details>
    </article>`;
  }).join("");
}

function renderHumanGatesPanel() {
  const gates = projectState?.humanGates || [];
  if (gates.length === 0) {
    return `<div class="empty-state-panel"><strong>No human gates recorded</strong><p>Rethink will open a gate only when required evidence is private, physical, behavioral, preference-based, or authorization-dependent.</p></div>`;
  }
  return [...gates].reverse().map((gate) => `<article class="state-record${gate.status === "RESOLVED" ? " removed" : ""}" data-record-id="${escapeHtml(gate.id)}">
    <div class="state-record-header"><h3>${escapeHtml(gate.question || "Human input required")}</h3><span class="record-status ${gate.status === "RESOLVED" ? "supported" : "challenged"}">${escapeHtml(gate.status)}</span></div>
    <p>${escapeHtml(gate.requiredInput || "The requested real-world evidence is recorded in the cycle.")}</p>
    <div class="record-meta"><span>Opened Cycle ${escapeHtml(gate.cycle ?? projectState.cycle)}</span><span>${escapeHtml(formatDate(gate.createdAt))}</span></div>
    ${gate.why ? `<p><strong>Why human:</strong> ${escapeHtml(gate.why)}</p>` : ""}
    ${gate.status === "RESOLVED" ? `<p><strong>Resolution:</strong> ${escapeHtml(titleCaseToken(gate.resolutionType))} — ${escapeHtml(gate.resolution)}</p><p><strong>Rationale:</strong> ${escapeHtml(gate.resolutionReason)}</p>` : `<div class="record-actions"><button type="button" data-state-action="resolve-gate" data-id="${escapeHtml(gate.id)}">Resolve Human Gate</button><button type="button" data-state-action="gate-add-evidence" data-id="${escapeHtml(gate.id)}">Add evidence</button></div>`}
    <details><summary>Trace history (${entityTrace("HUMAN_GATE", gate.id).length})</summary>${traceMarkup("HUMAN_GATE", gate.id)}</details>
  </article>`).join("");
}

function renderAuthorityPanel() {
  const decisions = [...(projectState?.humanDecisions || [])].reverse();
  const overrides = [...(projectState?.stageOverrides || [])].reverse();
  return `<div class="authority-intro"><strong>Rethink advises. You decide.</strong><p>Overrides require a rationale and preserve the system recommendation, uncertainty, risks, and reopening conditions.</p><div class="authority-actions"><button type="button" data-state-action="show-stage-form">Stage control</button><button type="button" data-state-action="show-disposition-form">Record final judgment</button></div></div>
    <h3 class="drawer-section-title">Disposition record</h3>
    ${decisions.length ? decisions.map((item) => `<article class="state-record"><div class="state-record-header"><h3>${escapeHtml(titleCaseToken(item.humanDisposition))}</h3><span class="record-status supported">HUMAN</span></div><p>${escapeHtml(item.rationale)}</p><div class="record-meta"><span>System: ${escapeHtml(titleCaseToken(item.systemRecommendation || "Not recorded"))}</span><span>${escapeHtml(formatDate(item.timestamp))}</span></div><details><summary>Preserved uncertainty and risk</summary><p><strong>Unresolved:</strong> ${escapeHtml((item.unresolvedUncertainty || []).join("; ") || "None recorded")}</p><p><strong>Unmet thresholds:</strong> ${escapeHtml((item.unmetEvidenceThresholds || []).join("; ") || "None recorded")}</p><p><strong>Risks:</strong> ${escapeHtml((item.knownRisks || []).join("; ") || "None recorded")}</p><p><strong>Reopening:</strong> ${escapeHtml((item.reopeningConditions || []).join("; ") || "None recorded")}</p></details></article>`).join("") : `<div class="empty-state-panel"><p>No human disposition override has been recorded.</p></div>`}
    <h3 class="drawer-section-title">Stage controls</h3>
    ${overrides.length ? overrides.map((item) => `<article class="state-record"><div class="state-record-header"><h3>${escapeHtml(titleCaseToken(item.action))}</h3><span class="record-status">${escapeHtml(titleCaseToken(item.targetPecPhase))}</span></div><p>${escapeHtml(item.reason)}</p><div class="record-meta"><span>${escapeHtml(formatDate(item.timestamp))}</span>${item.forcedMethod ? `<span>Forced ${escapeHtml(methodLabel(item.forcedMethod))}</span>` : ""}</div></article>`).join("") : `<div class="empty-state-panel"><p>No PEC stage override has been recorded.</p></div>`}`;
}

function renderStatePanel() {
  if (!projectState) return;
  const panels = {
    assumptions: {
      title: "Open Assumptions",
      subtitle: "Inspect, edit, remove, and connect the claims shaping downstream decisions.",
      add: "Add assumption",
      summary: `${activeAssumptions().filter((item) => ["UNTESTED", "CHALLENGED"].includes(item.status)).length} open · ${activeAssumptions().filter((item) => ["SUPPORTED", "REJECTED"].includes(item.status)).length} resolved · ${(projectState.assumptions || []).filter((item) => item.removedAt).length} removed`,
      markup: renderAssumptionsPanel()
    },
    evidence: {
      title: "Evidence Items",
      subtitle: "Trace what supports or challenges assumptions and highest-leverage questions.",
      add: "Add evidence",
      summary: `${activeEvidence().length} evidence · ${routedIntakeItems().length} routed · ${(projectState.evidence || []).filter((item) => item.status === "REMOVED").length} removed · ${activeEvidence().reduce((total, item) => total + (item.assumptionIds || []).length + (item.questionRefs || []).length, 0)} traced links`,
      markup: renderEvidencePanel()
    },
    locks: {
      title: "Locked Versions",
      subtitle: "Inspect canonical snapshots, compare them with today, and reopen only for a stated trigger.",
      add: "",
      summary: `${(projectState.lockedDecisions || []).filter((item) => item.status === "ACTIVE").length} canonical · ${(projectState.lockedDecisions || []).filter((item) => item.status === "REOPENED").length} reopened`,
      markup: renderLocksPanel()
    },
    human: {
      title: "Human Gates",
      subtitle: "Resolve genuinely human or real-world evidence needs without losing the audit trail.",
      add: "",
      summary: `${openHumanGates().length} open · ${(projectState.humanGates || []).filter((item) => item.status === "RESOLVED").length} resolved`,
      markup: renderHumanGatesPanel()
    },
    authority: {
      title: "Human Decision Authority",
      subtitle: "Control stages and record final judgment while preserving the model's recommendation.",
      add: "",
      summary: `${(projectState.humanDecisions || []).length} dispositions · ${(projectState.stageOverrides || []).length} stage controls`,
      markup: renderAuthorityPanel()
    }
  };
  const panel = panels[activeStatePanel] || panels.assumptions;
  elements.stateDrawerTitle.textContent = panel.title;
  elements.stateDrawerSubtitle.textContent = panel.subtitle;
  elements.statePanelSummary.textContent = panel.summary;
  elements.addStateItemButton.hidden = !panel.add;
  elements.addStateItemButton.textContent = panel.add;
  elements.statePanelContent.innerHTML = panel.markup;
  $$(".state-drawer-tabs [data-state-panel]").forEach((tab) => {
    const active = tab.dataset.statePanel === activeStatePanel;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
}

function openStateDrawer(panel, trigger) {
  if (!projectState) return;
  activeStatePanel = panel;
  stateDrawerReturnFocus = trigger || document.activeElement;
  elements.stateDrawerBackdrop.hidden = false;
  elements.stateDrawer.hidden = false;
  document.body.classList.add("drawer-open");
  hideStateEditor();
  renderStatePanel();
  elements.closeStateDrawerButton.focus();
}

function closeStateDrawer() {
  elements.stateDrawerBackdrop.hidden = true;
  elements.stateDrawer.hidden = true;
  document.body.classList.remove("drawer-open");
  hideStateEditor();
  stateDrawerReturnFocus?.focus?.();
  stateDrawerReturnFocus = null;
}

function hideStateEditor() {
  elements.statePanelEditor.hidden = true;
  elements.statePanelEditor.innerHTML = "";
}

function checkboxOptions(items, name, selected, labelFor) {
  if (items.length === 0) return `<p>No available items to link yet.</p>`;
  return `<div class="state-link-options">${items.map((item) => `<label><input type="checkbox" name="${escapeHtml(name)}" value="${escapeHtml(item.id)}"${selected.includes(item.id) ? " checked" : ""}><span>${escapeHtml(labelFor(item))}</span></label>`).join("")}</div>`;
}

function showAssumptionForm(item = null) {
  const evidence = activeEvidence();
  const statuses = ["UNTESTED", "CHALLENGED", "SUPPORTED", "REJECTED"];
  elements.statePanelEditor.innerHTML = `<h3>${item ? "Edit assumption" : "Add an assumption"}</h3>
    <form class="state-form" data-form-kind="assumption" data-id="${escapeHtml(item?.id || "")}" data-testid="assumption-form">
      <label for="assumptionText">Assumption<input id="assumptionText" name="text" required minlength="2" value="${escapeHtml(item?.text || "")}"></label>
      <div class="state-form-row">
        <label for="assumptionStatus">Status<select id="assumptionStatus" name="status">${statuses.map((status) => `<option value="${status}"${item?.status === status ? " selected" : ""}>${titleCaseToken(status)}</option>`).join("")}</select></label>
        <label for="assumptionConfidence">Confidence (0–1)<input id="assumptionConfidence" name="confidence" type="number" min="0" max="1" step="0.05" required value="${escapeHtml(item?.confidence ?? 0.5)}"></label>
      </div>
      <label for="assumptionConfidenceOrigin">Confidence origin<select id="assumptionConfidenceOrigin" name="confidenceOrigin">${CONFIDENCE_ORIGINS.map((origin) => `<option value="${origin}"${(item?.confidenceOrigin || "USER_DEFINED") === origin ? " selected" : ""}>${titleCaseToken(origin)}</option>`).join("")}</select></label>
      <label for="assumptionRationale">Rationale for confidence and status<textarea id="assumptionRationale" name="rationale" required minlength="2">${escapeHtml(item?.rationale || "")}</textarea></label>
      <fieldset><legend>Linked evidence</legend>${checkboxOptions(evidence, "evidenceIds", item?.evidenceIds || [], (candidate) => candidate.claim)}</fieldset>
      <label for="assumptionReason">Reason for this change<input id="assumptionReason" name="reason" required minlength="3" placeholder="Recorded in trace history"></label>
      <div class="state-form-actions"><button class="text-button" type="button" data-state-action="cancel-editor">Cancel</button><button class="primary-button" type="submit">${item ? "Save changes" : "Add assumption"}</button></div>
    </form>`;
  elements.statePanelEditor.hidden = false;
  $("#assumptionText").focus();
}

function showEvidenceForm(item = null) {
  const reliabilityValues = ["INFER_AUTOMATICALLY", "UNKNOWN_NOT_ASSESSED", "LOW", "MODERATE", "HIGH"];
  const relationshipValues = ["INFER_AUTOMATICALLY", "SUPPORTS", "CONTRADICTS", "MIXED", "NEUTRAL_CONTEXT_ONLY", "NONE_UNLINKED"];
  const questions = availableQuestions();
  const questionTexts = questions.map((question) => question.text);
  const knownQuestionRefs = (item?.questionRefs || []).filter((question) => questionTexts.includes(question));
  const customQuestionRefs = (item?.questionRefs || []).filter((question) => !questionTexts.includes(question));
  const questionOptions = questions.map((question) => ({ id: question.text, label: `${titleCaseToken(question.status)}: ${question.text}` }));
  elements.statePanelEditor.innerHTML = `<h3>${item ? "Edit evidence" : "Add evidence"}</h3>
    <p class="form-guidance">Classification says what this is. Provenance says where it entered Rethink. Planned tests, questions, assumptions, and model hypotheses stay traceable but do not count as observed evidence.</p>
    <form class="state-form" data-form-kind="evidence" data-id="${escapeHtml(item?.id || "")}" data-testid="evidence-form">
      <label for="evidenceClaim">Evidence claim<input id="evidenceClaim" name="claim" required minlength="2" value="${escapeHtml(item?.claim || "")}"></label>
      <div class="state-form-row">
        <label for="evidenceIntakeType">Intake classification<select id="evidenceIntakeType" name="intakeType"><option value=""${item ? "" : " selected"}>Infer from statement</option>${EVIDENCE_INTAKE_TYPES.map((type) => `<option value="${type}"${item?.intakeType === type ? " selected" : ""}>${titleCaseToken(type)}</option>`).join("")}</select></label>
        <label for="evidenceProvenance">Provenance / origin<select id="evidenceProvenance" name="provenanceOrigin">${PROVENANCE_ORIGINS.map((origin) => `<option value="${origin}"${(item?.provenanceOrigin || "USER_INPUT") === origin ? " selected" : ""}>${titleCaseToken(origin)}</option>`).join("")}</select></label>
      </div>
      <label for="evidenceAuthenticity">Real-world status<select id="evidenceAuthenticity" name="evidenceAuthenticity">${EVIDENCE_AUTHENTICITY.map((value) => `<option value="${value}"${(item?.evidenceAuthenticity || "INFER_AUTOMATICALLY") === value ? " selected" : ""}>${titleCaseToken(value)}</option>`).join("")}</select></label>
      <div class="state-form-row">
        <label for="sourceClassification">Source classification<select id="sourceClassification" name="sourceClassification">${SOURCE_CLASSIFICATIONS.map((value) => `<option value="${value}"${(item?.sourceClassification || "UNKNOWN_NOT_APPLICABLE") === value ? " selected" : ""}>${titleCaseToken(value)}</option>`).join("")}</select></label>
        <label for="sourceCategory">Source category<select id="sourceCategory" name="sourceCategory">${SOURCE_CATEGORIES.map((value) => `<option value="${value}"${(item?.sourceCategory || "UNKNOWN") === value ? " selected" : ""}>${titleCaseToken(value)}</option>`).join("")}</select></label>
      </div>
      <div class="state-form-row">
        <label for="evidenceReliability">Reliability<select id="evidenceReliability" name="reliability">${reliabilityValues.map((value) => `<option value="${value}"${(item?.reliability || "INFER_AUTOMATICALLY") === value ? " selected" : ""}>${titleCaseToken(value)}</option>`).join("")}</select></label>
        <label for="evidenceRelationship">Relationship<select id="evidenceRelationship" name="relationship">${relationshipValues.map((value) => `<option value="${value}"${(item?.relationship || "INFER_AUTOMATICALLY") === value ? " selected" : ""}>${titleCaseToken(value)}</option>`).join("")}</select></label>
      </div>
      <label for="evidenceObservation">Observation / finding<textarea id="evidenceObservation" name="observation" required minlength="2">${escapeHtml(item?.observation || item?.claim || "")}</textarea></label>
      <div class="state-form-row">
        <label for="evidenceSourceTitle">Source title<input id="evidenceSourceTitle" name="sourceTitle" value="${escapeHtml(item?.sourceTitle || "")}"></label>
        <label for="evidenceSourceDate">Source date<input id="evidenceSourceDate" name="sourceDate" type="date" value="${escapeHtml(item?.sourceDate || "")}"></label>
      </div>
      <label for="evidenceSourceUrl">Source URL (optional)<input id="evidenceSourceUrl" name="sourceUrl" type="url" value="${escapeHtml(item?.sourceUrl || "")}" placeholder="https://…"></label>
      <div class="state-form-row">
        <label for="evidencePopulation">Population / sample<input id="evidencePopulation" name="population" value="${escapeHtml(item?.population || "")}"></label>
        <label for="evidenceMethod">Collection method<select id="evidenceMethod" name="collectionMethod">${COLLECTION_METHODS.map((value) => `<option value="${value}"${(item?.collectionMethod || "UNKNOWN_NOT_REPORTED") === value ? " selected" : ""}>${titleCaseToken(value)}</option>`).join("")}</select></label>
      </div>
      <label for="evidenceMethodDetails">Method details (optional)<input id="evidenceMethodDetails" name="methodDetails" value="${escapeHtml(item?.methodDetails || "")}"></label>
      <label for="evidenceAssessment">Assessment<textarea id="evidenceAssessment" name="assessment" required minlength="2">${escapeHtml(item?.assessment || "")}</textarea></label>
      <fieldset><legend>Affected assumptions</legend>${checkboxOptions(activeAssumptions(), "assumptionIds", item?.assumptionIds || [], (candidate) => candidate.text)}</fieldset>
      <fieldset><legend>Affected questions — current, prior, reopened, or superseded</legend>${checkboxOptions(questionOptions, "questionRefs", knownQuestionRefs, (candidate) => candidate.label)}</fieldset>
      <label for="customQuestionRefs">Other affected questions (one per line)<textarea id="customQuestionRefs" name="customQuestionRefs">${escapeHtml(customQuestionRefs.join("\n"))}</textarea></label>
      <label for="evidenceReason">Reason for this change<input id="evidenceReason" name="reason" required minlength="3" placeholder="Recorded in trace history"></label>
      <div class="state-form-actions"><button class="text-button" type="button" data-state-action="cancel-editor">Cancel</button><button class="primary-button" type="submit">${item ? "Save changes" : "Add evidence"}</button></div>
    </form>`;
  elements.statePanelEditor.hidden = false;
  $("#evidenceClaim").focus();
}

function showHumanGateForm(gate = openHumanGates().at(-1)) {
  if (!gate) {
    showToast("There is no open human gate to resolve.", "error");
    return;
  }
  const resolutions = ["PROVIDE_INFORMATION", "ADD_EVIDENCE", "ENTER_TEST_RESULT", "AUTHORIZE_ACTION", "MARK_UNAVAILABLE", "PROCEED_UNDER_UNCERTAINTY", "OVERRIDE_ACTION", "FORCE_DISPOSITION"];
  elements.statePanelEditor.innerHTML = `<h3>Resolve Human Gate</h3>
    <p><strong>${escapeHtml(gate.question)}</strong></p><p>${escapeHtml(gate.requiredInput)}</p>
    <form class="state-form" data-form-kind="resolve-human-gate" data-id="${escapeHtml(gate.id)}">
      <label for="gateResolutionType">Resolution type<select id="gateResolutionType" name="resolutionType">${resolutions.map((value) => `<option value="${value}">${titleCaseToken(value)}</option>`).join("")}</select></label>
      <label for="gateResolution">Information, result, or decision<textarea id="gateResolution" name="resolution" required minlength="2"></textarea></label>
      <fieldset><legend>Evidence Items supplied for this gate</legend>${checkboxOptions(activeEvidence(), "evidenceIds", gate.evidenceIds || [], (item) => `${item.claim}${item.evidenceAuthenticity === "SYNTHETIC_SIMULATED" ? " (synthetic — cannot satisfy a real-world gate)" : ""}`)}</fieldset>
      <p class="form-guidance">Store the full dataset or finding once in the Evidence Register. This gate record only references those Evidence Items and summarizes why the requested input is now supplied.</p>
      <label for="gateResolutionReason">Why this resolves or closes the gate<textarea id="gateResolutionReason" name="reason" required minlength="3"></textarea></label>
      <div class="state-form-actions"><button class="text-button" type="button" data-state-action="cancel-editor">Cancel</button><button class="primary-button" type="submit">Resolve and reassess</button></div>
    </form>`;
  elements.statePanelEditor.hidden = false;
  $("#gateResolutionType").focus();
}

function lines(value) {
  return String(value || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

function showDispositionForm() {
  const systemRecommendation = currentResult?.nextAction?.disposition
    || [...(projectState?.notebook || [])].reverse().find((entry) => entry.entryType === "CYCLE" && entry.projectId === projectState.id && entry.contextStatus !== "LEGACY_UNVERIFIED")?.disposition
    || "CONTINUE";
  const latestUncertainty = currentResult?.remainingUncertainty || [];
  elements.statePanelEditor.innerHTML = `<h3>Record final human judgment</h3><p>The original system recommendation and all unresolved uncertainty remain in the audit history.</p>
    <form class="state-form" data-form-kind="override-disposition">
      <label for="systemRecommendation">System recommendation<input id="systemRecommendation" name="systemRecommendation" readonly value="${escapeHtml(systemRecommendation)}"></label>
      <label for="humanDisposition">Human disposition<select id="humanDisposition" name="humanDisposition">${HUMAN_DISPOSITIONS.map((value) => `<option value="${value}">${titleCaseToken(value)}</option>`).join("")}</select></label>
      <label for="dispositionRationale">Required rationale<textarea id="dispositionRationale" name="rationale" required minlength="3"></textarea></label>
      <label for="overrideUncertainty">Unresolved uncertainty (one per line)<textarea id="overrideUncertainty" name="unresolvedUncertainty">${escapeHtml(latestUncertainty.join("\n"))}</textarea></label>
      <label for="unmetThresholds">Unmet evidence thresholds (one per line)<textarea id="unmetThresholds" name="unmetEvidenceThresholds"></textarea></label>
      <label for="knownRisks">Known risks (one per line)<textarea id="knownRisks" name="knownRisks"></textarea></label>
      <label for="reopeningConditions">Reopening conditions (one per line)<textarea id="reopeningConditions" name="reopeningConditions"></textarea></label>
      <div class="state-form-actions"><button class="text-button" type="button" data-state-action="cancel-editor">Cancel</button><button class="primary-button" type="submit">Record judgment</button></div>
    </form>`;
  elements.statePanelEditor.hidden = false;
  $("#humanDisposition").focus();
}

function showStageOverrideForm() {
  elements.statePanelEditor.innerHTML = `<h3>Control PEC stage</h3><p>Stage changes are reason-gated, logged, and force STM to reassess current state.</p>
    <form class="state-form" data-form-kind="override-stage">
      <div class="state-form-row"><label for="stageAction">Action<select id="stageAction" name="action">${STAGE_OVERRIDE_ACTIONS.map((value) => `<option value="${value}">${titleCaseToken(value)}</option>`).join("")}</select></label><label for="targetPhase">PEC stage<select id="targetPhase" name="pecPhase">${PEC_PHASES.map(([id, label]) => `<option value="${id}"${projectState.pecPhase.id === id ? " selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select></label></div>
      <label for="forcedMethod">Forced method (for Force Method)<select id="forcedMethod" name="forcedMethod"><option value="">No forced method</option>${availableMethods.map((value) => `<option value="${value}">${methodLabel(value)}</option>`).join("")}</select></label>
      <label for="stageUnresolved">Unresolved evidence carried forward (one per line)<textarea id="stageUnresolved" name="unresolvedEvidence"></textarea></label>
      <label for="stageReason">Required rationale<textarea id="stageReason" name="reason" required minlength="3"></textarea></label>
      <div class="state-form-actions"><button class="text-button" type="button" data-state-action="cancel-editor">Cancel</button><button class="primary-button" type="submit">Record stage control</button></div>
    </form>`;
  elements.statePanelEditor.hidden = false;
  $("#stageAction").focus();
}

function showRemovalForm(entityType, item) {
  const label = entityType === "ASSUMPTION" ? item.text : item.claim;
  elements.statePanelEditor.innerHTML = `<h3>Remove ${entityType.toLowerCase()}</h3><p>This preserves the item and its trace history, but removes it from active project state and clears its links.</p>
    <form class="state-form" data-form-kind="remove-${entityType.toLowerCase()}" data-id="${escapeHtml(item.id)}">
      <p><strong>${escapeHtml(label)}</strong></p>
      <label for="removalReason">Reason for removal<input id="removalReason" name="reason" required minlength="3"></label>
      <div class="state-form-actions"><button class="text-button" type="button" data-state-action="cancel-editor">Cancel</button><button class="danger-button" type="submit">Remove from active state</button></div>
    </form>`;
  elements.statePanelEditor.hidden = false;
  $("#removalReason").focus();
}

function showReopenForm(lock) {
  const triggers = ["NEW_EVIDENCE", "FAILED_ASSUMPTION", "INTEGRATION_CONFLICT", "BETTER_VERSION", "OTHER"];
  elements.statePanelEditor.innerHTML = `<h3>Controlled reopening of Version ${escapeHtml(lock.cycle)}</h3><p>Reopening records why this checkpoint is no longer canonical. It does not roll the current project backward.</p>
    <form class="state-form" data-form-kind="reopen-lock" data-id="${escapeHtml(lock.id)}" data-testid="reopen-lock-form">
      <label for="reopenTrigger">Reopening trigger<select id="reopenTrigger" name="trigger">${triggers.map((trigger) => `<option value="${trigger}">${titleCaseToken(trigger)}</option>`).join("")}</select></label>
      <label for="reopenReason">Evidence or rationale<textarea id="reopenReason" name="reason" required minlength="3"></textarea></label>
      <div class="state-form-actions"><button class="text-button" type="button" data-state-action="cancel-editor">Cancel</button><button class="primary-button" type="submit">Reopen version</button></div>
    </form>`;
  elements.statePanelEditor.hidden = false;
  $("#reopenTrigger").focus();
}

function showLockComparison(lock) {
  const snapshotAssumptions = (lock.assumptions || []).filter((item) => !item.removedAt);
  const currentAssumptions = activeAssumptions();
  const snapshotEvidence = (lock.evidence || []).filter((item) => item.status !== "REMOVED");
  const currentEvidence = activeEvidence();
  const changedProblem = lock.problemDefinition !== projectState.problemDefinition;
  const assumptionIds = [...new Set([...snapshotAssumptions, ...currentAssumptions].map((item) => item.id))];
  const assumptionList = assumptionIds.map((id) => {
    const snapshot = snapshotAssumptions.find((item) => item.id === id);
    const current = currentAssumptions.find((item) => item.id === id);
    const changed = !snapshot || !current || current.text !== snapshot.text || current.status !== snapshot.status || Number(current.confidence) !== Number(snapshot.confidence);
    return `<li class="${changed ? "changed" : ""}">${escapeHtml(current?.text || snapshot?.text)}<br><strong>${escapeHtml(snapshot?.status || "NOT PRESENT")} → ${escapeHtml(current?.status || "REMOVED")}</strong></li>`;
  }).join("") || "<li>No active assumptions in this version.</li>";
  const evidenceIds = [...new Set([...snapshotEvidence, ...currentEvidence].map((item) => item.id))];
  const evidenceList = evidenceIds.map((id) => {
    const snapshot = snapshotEvidence.find((item) => item.id === id);
    const current = currentEvidence.find((item) => item.id === id);
    const changed = !snapshot || !current || current.claim !== snapshot.claim || current.assessment !== snapshot.assessment;
    return `<li class="${changed ? "changed" : ""}">${escapeHtml(current?.claim || snapshot?.claim)}<br><strong>${snapshot ? "LOCKED" : "NOT PRESENT"} → ${current ? "ACTIVE" : "REMOVED"}</strong></li>`;
  }).join("") || "<li>No active evidence in this version.</li>";
  elements.statePanelEditor.innerHTML = `<div class="comparison">
    <div class="comparison-heading"><h3>Version ${escapeHtml(lock.cycle)} vs current state</h3><button class="text-button" type="button" data-state-action="cancel-editor">Close comparison</button></div>
    <div class="comparison-grid">
      <section class="comparison-column"><span>Locked ${escapeHtml(formatDate(lock.lockedAt))}</span><h4>PEC phase</h4><p>${escapeHtml(titleCaseToken(lock.pecPhase))}</p><h4>Problem</h4><p>${escapeHtml(lock.problemDefinition)}</p><h4>State size</h4><p>${snapshotAssumptions.length} assumptions · ${snapshotEvidence.length} evidence items</p></section>
      <section class="comparison-column"><span>Current Cycle ${escapeHtml(projectState.cycle)}</span><h4>PEC phase</h4><p>${escapeHtml(projectState.pecPhase.label)}</p><h4>Problem</h4><p class="${changedProblem ? "changed" : ""}">${escapeHtml(projectState.problemDefinition)}</p><h4>State size</h4><p>${currentAssumptions.length} assumptions · ${currentEvidence.length} evidence items</p></section>
    </div>
    <div class="comparison-column"><span>Assumption changes</span><ul class="comparison-list">${assumptionList}</ul></div>
    <div class="comparison-column"><span>Evidence changes</span><ul class="comparison-list">${evidenceList}</ul></div>
  </div>`;
  elements.statePanelEditor.hidden = false;
  elements.statePanelEditor.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function applyStateOperation(operation, successMessage) {
  if (busy) return;
  busy = true;
  elements.stateDrawer.setAttribute("aria-busy", "true");
  const hadRouting = Boolean(pendingRouting || currentResult);
  try {
    const payload = await api("/api/rethink/state", { state: projectState, operation });
    projectState = normalizeClientProjectState(payload.state);
    pendingRouting = null;
    currentResult = null;
    activeResearch = null;
    activeReasoning = null;
    currentReport = null;
    persist();
    renderAll();
    hideStateEditor();
    renderStatePanel();
    showToast(`${successMessage}${hadRouting ? " Routing was cleared so the next question can respond to this state change." : ""}`);
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    busy = false;
    elements.stateDrawer.removeAttribute("aria-busy");
  }
}

function renderRouting() {
  if (!pendingRouting) {
    elements.routingPanel.hidden = true;
    return;
  }
  elements.routingPanel.hidden = false;
  const routeView = describeRoutingSnapshot({
    routing: pendingRouting,
    result: currentResult,
    projectCycle: projectState.cycle,
    activeEvidenceCount: activeEvidence().length
  });
  const routeCompleted = routeView.historical;
  elements.routingContextLabel.textContent = routeView.contextLabel;
  elements.highestLeverageQuestion.textContent = pendingRouting.highestLeverageQuestion;
  elements.selectedMethod.textContent = pendingRouting.selectedMethod;
  elements.overrideBadge.hidden = !pendingRouting.override;
  elements.whyQuestionNow.textContent = pendingRouting.whyQuestionNow;
  elements.whyMethod.textContent = pendingRouting.whyMethod;
  elements.resolutionCriteria.textContent = pendingRouting.resolutionCriteria;
  elements.evidenceNeeded.innerHTML = pendingRouting.evidenceNeeded.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  elements.evidenceGateBadge.textContent = titleCaseToken(pendingRouting.evidenceGate || "NONE");
  elements.evidenceGateBadge.dataset.gate = pendingRouting.evidenceGate || "NONE";
  elements.evidenceStateSummary.textContent = routeView.evidenceSummary;
  elements.routingBlocker.hidden = !pendingRouting.executionBlocked;
  elements.routingBlocker.innerHTML = pendingRouting.executionBlocked
    ? `<strong>Reasoning paused to prevent a no-new-evidence loop.</strong><p>${pendingRouting.evidenceGate === "PUBLIC_RESEARCH_REQUIRED" ? "This gap is publicly researchable. Use Live GPT-5.6 mode to acquire cited evidence, or add relevant evidence manually before rerunning STM." : "Add new evidence, resolve the human gate, record a deliberate override, or close the project before another equivalent cycle."}</p>`
    : "";
  elements.runMethodButton.textContent = routeCompleted
    ? `Cycle ${projectState.cycle} completed`
    : (pendingRouting.evidenceGate === "PUBLIC_RESEARCH_REQUIRED" && selectedMode() === "live"
      ? `Acquire Public Evidence with ${methodLabel(pendingRouting.selectedMethod)}`
      : `Run ${methodLabel(pendingRouting.selectedMethod)}`);
  const liveResearchCanResolveBlock = pendingRouting.evidenceGate === "PUBLIC_RESEARCH_REQUIRED" && selectedMode() === "live";
  elements.runMethodButton.disabled = routeCompleted || (Boolean(pendingRouting.executionBlocked) && !liveResearchCanResolveBlock) || researchPending() || reasoningPending();
  elements.methodSelect.value = pendingRouting.selectedMethod;
  elements.routingPanel.querySelector(".method-lockup > span").textContent = pendingRouting.override ? "Selected method" : "Recommended method";
}

function reasoningPending() {
  if (!activeReasoning) return false;
  return ["PENDING", "QUEUED", "IN_PROGRESS", "RETRIEVING", "RETRIEVAL_FAILED", "RESUME_AVAILABLE", "HUNG"].includes(activeReasoning.status)
    && activeReasoning.executionStatus === "ACCEPTED_RUNNING";
}

function reasoningShouldAutoPoll() {
  return reasoningPending() && ["PENDING", "QUEUED", "IN_PROGRESS", "RETRIEVING"].includes(activeReasoning.status);
}

function renderReasoning() {
  elements.reasoningProgressPanel.hidden = !activeReasoning;
  if (!activeReasoning) return;
  const status = activeReasoning.status || "PENDING";
  const executionStatus = activeReasoning.executionStatus || "REQUEST_NOT_ACCEPTED";
  const accepted = Boolean(activeReasoning.responseId);
  const messages = {
    PENDING: "Submitting a recoverable live reasoning request.",
    QUEUED: "OpenAI accepted the reasoning cycle. Project state remains unchanged while it waits to run.",
    IN_PROGRESS: "Live reasoning is running. A refresh will not lose the response ID.",
    RETRIEVING: "Checking the accepted background response.",
    RETRIEVAL_FAILED: "The latest status check failed, but the accepted response may still be running and can be checked again.",
    RESUME_AVAILABLE: "This accepted response is already registered. Resume it instead of starting a duplicate cycle.",
    HUNG: "Automatic polling stopped at the configured deadline. The accepted response can still be checked manually while OpenAI retains it.",
    REQUEST_NOT_ACCEPTED: "OpenAI did not return a retrievable response ID. Project state was not changed.",
    INCOMPLETE: "The response reached a terminal incomplete state. No partial result was ingested.",
    FAILED: "The accepted response ended without a complete valid cycle. Project state was not changed.",
    CANCELLED: "The reasoning response was cancelled. Project state was not changed.",
    COMPLETED: "The complete validated cycle result was ingested exactly once.",
    ALREADY_INGESTED: "This response was already applied; no duplicate cycle was created."
  };
  elements.reasoningProgressTitle.textContent = executionStatus === "COMPLETED"
    ? "Live reasoning completed"
    : (accepted ? "Recoverable live reasoning" : "Live reasoning request");
  elements.reasoningProgressBadge.textContent = titleCaseToken(status);
  elements.reasoningProgressMessage.textContent = messages[status] || "Reasoning status is available for inspection.";
  elements.reasoningProgressMethod.textContent = methodLabel(activeReasoning.selectedMethod || pendingRouting?.selectedMethod || "");
  elements.reasoningExecutionStatus.textContent = titleCaseToken(executionStatus);
  elements.reasoningResponseId.textContent = activeReasoning.responseId || "Not assigned — request was not accepted";
  elements.checkReasoningButton.hidden = !accepted || executionStatus !== "ACCEPTED_RUNNING";
  elements.retryReasoningButton.hidden = !activeReasoning.retrySafe;
  elements.reasoningProgressError.hidden = !activeReasoning.lastError;
  elements.reasoningProgressError.textContent = activeReasoning.lastError || "";
}

function researchPending() {
  if (!activeResearch) return false;
  if (["COMPLETED", "FAILED_TECHNICALLY", "CANCELLED"].includes(activeResearch.executionStatus)) return false;
  return !["FAILED", "HUNG", "COMPLETED", "CANCELLED", "ALREADY_INGESTED"].includes(activeResearch.status);
}

function latestResearchError() {
  const logs = activeResearch?.errorLog || [];
  return logs.at(-1) || {
    timestamp: activeResearch?.failedAt || new Date().toISOString(),
    jobId: activeResearch?.jobId || "unassigned",
    humanReadableSummary: "Public research failed technically; no evidentiary conclusion was produced.",
    technicalError: activeResearch?.lastError || "No additional technical detail was returned.",
    errorCode: activeResearch?.failureCode || "RESEARCH_EXECUTION_FAILED",
    responseMetadata: activeResearch?.failureMetadata || activeResearch?.incompleteResponseMetadata || null,
    retryAttempt: activeResearch?.retryCount || 0,
    currentJobState: activeResearch?.jobState || activeResearch?.status || "FAILED"
  };
}

function renderResearch() {
  elements.researchProgressPanel.hidden = !activeResearch;
  if (!activeResearch) return;
  const status = activeResearch.status || "PENDING";
  const executionStatus = activeResearch.executionStatus
    || (["FAILED", "HUNG"].includes(status) ? "FAILED_TECHNICALLY" : (status === "COMPLETED" ? "COMPLETED" : "PENDING"));
  const evidenceOutcome = activeResearch.evidenceOutcome || "NOT_EVALUATED";
  const failedTechnically = executionStatus === "FAILED_TECHNICALLY";
  const inconclusive = executionStatus === "COMPLETED"
    && ["NO_CONCLUSIVE_EVIDENCE_FOUND", "NO_RELEVANT_EVIDENCE_FOUND"].includes(evidenceOutcome);
  const messages = {
    PENDING: "Submitting a bounded supporting and disconfirming research plan.",
    QUEUED: "OpenAI accepted the job. Project state is preserved while it waits to run.",
    IN_PROGRESS: "Searching public sources for both supporting and disconfirming findings.",
    RETRIEVING: "Retrieving the latest background response state.",
    EVALUATING: "Research is complete; Rethink is evaluating evidence quality and project impact.",
    HUNG: "The configured hung-request limit was reached. Nothing was learned; the unresolved gap remains open.",
    FAILED: "The research operation failed technically. Nothing was learned and no evidentiary conclusion was produced.",
    COMPLETED: inconclusive
      ? "The bounded search completed, but it did not produce sufficient information to resolve the proposition."
      : "Research completed and its findings were evaluated independently from proposition status.",
    ALREADY_INGESTED: "This research result was already ingested; no duplicate evidence was created."
  };
  elements.researchProgressTitle.textContent = failedTechnically
    ? "Research failed technically"
    : (executionStatus === "COMPLETED" ? "Public research completed" : "Public evidence acquisition");
  elements.researchProgressBadge.textContent = failedTechnically ? "RESEARCH FAILED TECHNICALLY" : (executionStatus === "COMPLETED" ? researchOutcomeLabel(evidenceOutcome) : titleCaseToken(status));
  elements.researchProgressMessage.textContent = messages[status] || "Research status is being checked.";
  elements.researchExecutionStatus.textContent = titleCaseToken(executionStatus);
  elements.researchEvidenceOutcome.textContent = researchOutcomeLabel(evidenceOutcome);
  elements.researchSupportingScope.textContent = activeResearch.researchScope?.supportingSearch || "Support search scope is recorded with the job.";
  elements.researchDisconfirmingScope.textContent = activeResearch.researchScope?.disconfirmingSearch || "Disconfirmation search scope is recorded with the job.";
  elements.retryResearchButton.hidden = !failedTechnically;
  elements.viewResearchErrorButton.hidden = !failedTechnically;
  elements.proceedWithoutResearchButton.hidden = !failedTechnically;
  elements.reassessResearchButton.hidden = !inconclusive;
  elements.differentScopeButton.hidden = !inconclusive;
  elements.proceedInconclusiveButton.hidden = !inconclusive;
  elements.routeHumanResearchButton.hidden = !inconclusive;
  elements.refreshResearchButton.hidden = !researchPending();
  if (!failedTechnically) elements.researchErrorLog.hidden = true;
  if (failedTechnically && !elements.researchErrorLog.hidden) {
    const log = latestResearchError();
    elements.researchErrorTimestamp.textContent = log.timestamp || "Not recorded";
    elements.researchErrorJob.textContent = `${log.jobId || activeResearch.jobId || "unassigned"} / ${log.currentJobState || status}`;
    elements.researchErrorSummary.textContent = log.humanReadableSummary || "Public research failed technically.";
    elements.researchErrorCode.textContent = log.errorCode || activeResearch.failureCode || "RESEARCH_EXECUTION_FAILED";
    elements.researchErrorStage.textContent = titleCaseToken(log.responseMetadata?.failureStage || "RESEARCH_API_EXECUTION");
    const responseBudget = log.responseMetadata?.maxOutputTokens;
    const requestedBudget = activeResearch.maxOutputTokens;
    elements.researchErrorTokenBudget.textContent = responseBudget || requestedBudget
      ? `${Number(responseBudget || requestedBudget).toLocaleString()} tokens${["RESEARCH_OUTPUT_LIMIT_REACHED", "OUTPUT_TOKEN_LIMIT_REACHED"].includes(activeResearch.failureCode) ? " (safe retry will increase the budget)" : ""}`
      : "Not reported";
    elements.researchErrorCitationCount.textContent = log.responseMetadata?.nativeCitationCount == null
      ? "Not applicable"
      : String(log.responseMetadata.nativeCitationCount);
    elements.researchErrorEvidenceCount.textContent = log.responseMetadata?.submittedEvidenceItemCount == null
      ? "Not applicable"
      : String(log.responseMetadata.submittedEvidenceItemCount);
    const affectedItems = log.responseMetadata?.affectedEvidenceItems || [];
    elements.researchCitationFailures.hidden = affectedItems.length === 0;
    elements.researchCitationFailureList.innerHTML = affectedItems.map((item) => {
      const label = `Item ${Number(item.index) + 1}: ${item.claim || "Unnamed evidence item"}`;
      const source = item.submittedSourceUrl ? ` Submitted URL: ${item.submittedSourceUrl}.` : "";
      return `<li><strong>${escapeHtml(label)}</strong> — ${escapeHtml(item.reason || "Citation mapping failed.")}${escapeHtml(source)}</li>`;
    }).join("");
    elements.researchErrorRetries.textContent = String(log.retryAttempt ?? activeResearch.retryCount ?? 0);
    elements.researchErrorState.textContent = log.currentJobState || status;
    elements.researchTechnicalError.value = log.technicalError || activeResearch.lastError || "No additional technical detail was returned.";
  }
}

function renderStringList(element, values, emptyText) {
  const items = Array.isArray(values) && values.length > 0 ? values : [emptyText];
  element.innerHTML = items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function renderResult() {
  if (!currentResult?.reasoning) {
    elements.resultPanel.hidden = true;
    return;
  }
  elements.resultPanel.hidden = false;
  const source = currentResult.reasoning.sourceType;
  elements.sourceBadge.textContent = source === "EXTERNAL_RESEARCH"
    ? "External research"
    : (source === "MIXED" ? "Research + reasoning" : "Model reasoning");
  elements.sourceBadge.style.background = source === "MODEL_REASONING" ? "#d9e8ff" : "#b7f45c";
  elements.reasoningConclusion.textContent = currentResult.reasoning.conclusion;
  renderStringList(elements.learnedList, currentResult.learned, "No new learning recorded.");
  const confidenceChanges = (currentResult.confidenceChanges || []).map((change) => {
    const before = typeof change.before === "object" ? change.before?.confidence : change.before;
    const after = typeof change.after === "object" ? change.after?.confidence : change.after;
    const origin = change.after?.confidenceOrigin || change.origin || "LEGACY_UNSPECIFIED";
    return `${change.assumption}: ${confidenceLabel(before)} (${Math.round(Number(before) * 100)}%) → ${confidenceLabel(after)} (${Math.round(Number(after) * 100)}%), ${titleCaseToken(origin)}. ${change.reason}`;
  });
  renderStringList(elements.stateChangesList, [...(currentResult.stateChanges || []), ...confidenceChanges], "No state change recorded.");
  renderStringList(elements.uncertaintyList, currentResult.remainingUncertainty, "No material uncertainty recorded.");

  const evaluation = currentResult.evidenceEvaluation;
  elements.evidenceEvaluationSection.hidden = !evaluation;
  if (evaluation) {
    const considered = evaluation.considered || [];
    elements.evidenceThresholdSummary.textContent = `${considered.length} evidence item${considered.length === 1 ? "" : "s"} evaluated`;
    elements.evidenceThresholdBadge.textContent = titleCaseToken(evaluation.propositionStatus || "UNRESOLVED");
    elements.evidenceThresholdBadge.className = `record-status ${["VALIDATED", "PROVISIONALLY_SUPPORTED"].includes(evaluation.propositionStatus) ? "supported" : "challenged"}`;
    elements.evidenceThresholdRationale.textContent = evaluation.evaluationThresholdRationale || "No process-threshold rationale was recorded.";
    elements.validationProcessStatus.textContent = evaluation.evaluationThresholdMet ? "Evaluation threshold met" : "Evaluation threshold not met";
    elements.propositionStatus.textContent = titleCaseToken(evaluation.propositionStatus || "UNRESOLVED");
    elements.propositionStatusRationale.textContent = evaluation.propositionStatusRationale || "The proposition remains unresolved.";
    elements.evidenceConsideredList.innerHTML = considered.map((review) => {
      const item = (projectState.evidence || []).find((candidate) => candidate.id === review.evidenceId);
      return `<li><strong>${escapeHtml(item?.claim || review.evidenceId)}</strong><span>${escapeHtml(titleCaseToken(review.classification))} · ${escapeHtml(titleCaseToken(review.relationship))}</span><p>${escapeHtml(review.rationale)}</p></li>`;
    }).join("") || "<li>No active evidence existed for this cycle. The result does not claim that an evidence threshold was met.</li>";
    elements.evidenceGapsBlock.hidden = !(evaluation.gaps || []).length;
    renderStringList(elements.evidenceGapsList, evaluation.gaps, "No unresolved evidence gaps recorded.");
    const disconfirmation = evaluation.disconfirmation;
    elements.disconfirmationBlock.hidden = !disconfirmation;
    if (disconfirmation) {
      elements.disconfirmationFlag.textContent = `${titleCaseToken(disconfirmation.flag)} · ${titleCaseToken(disconfirmation.searchStatus)}`;
      elements.strongestSupport.textContent = disconfirmation.strongestSupportingEvidence || "None identified.";
      elements.strongestContradiction.textContent = disconfirmation.strongestContradictoryEvidence || "None identified.";
      elements.strongestLimitation.textContent = disconfirmation.strongestLimitation || "None recorded.";
      elements.conclusionChanger.textContent = disconfirmation.evidenceThatWouldChangeConclusion || "Not specified.";
    }
  }

  const citations = currentResult.citations || [];
  elements.citationsSection.hidden = citations.length === 0;
  elements.citationsList.innerHTML = citations.map((citation) => {
    const url = safeUrl(citation.url);
    return url
      ? `<li><a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(citation.title || url)}</a></li>`
      : "";
  }).join("");
  elements.disposition.textContent = currentResult.nextAction.disposition;
  elements.nextAction.textContent = currentResult.nextAction.action;
  elements.nextActionWhy.textContent = currentResult.nextAction.why;
}

function renderHumanGate() {
  const gate = openHumanGates().at(-1);
  elements.humanGatePanel.hidden = !gate;
  if (!gate) return;
  elements.humanGateQuestion.textContent = gate.question || "Human input is required";
  elements.humanGateRequired.textContent = gate.requiredInput || "Provide the requested private or real-world evidence.";
  elements.humanGateWhy.textContent = gate.why || "This information cannot be responsibly inferred or obtained from public sources.";
}

function renderNotebook() {
  const entries = projectState?.notebook || [];
  elements.notebookEmpty.hidden = entries.length > 0;
  elements.notebookList.innerHTML = [...entries].reverse().map((entry) => {
    const learned = (entry.learned || []).join(" ");
    const changes = (entry.stateChanges || []).join(" ");
    const uncertainty = (entry.remainingUncertainty || []).join(" ");
    const lockClass = entry.lockedDecisionId ? " locked" : "";
    const override = entry.override && entry.selectedMethod !== entry.recommendedMethod
      ? ` · override from ${entry.recommendedMethod}`
      : "";
    const recordType = entry.entryType === "STATE_EDIT"
      ? `State edit / Cycle ${entry.cycle} context`
      : (entry.entryType === "LOCK" ? `Version checkpoint / Cycle ${entry.cycle}` : `Cycle ${entry.cycle}`);
    const legacy = entry.contextStatus === "LEGACY_UNVERIFIED" || entry.projectId !== projectState.id;
    const researchLog = (entry.researchErrorLog || []).at(-1);
    return `<li class="notebook-entry${lockClass}${legacy ? " legacy" : ""}">
      <span>Cycle ${entry.cycle} · ${escapeHtml(entry.pecPhaseAfter || entry.pecPhaseBefore)}</span>
      <strong>${escapeHtml(recordType)} · ${escapeHtml(entry.selectedMethod)}${escapeHtml(override)}</strong>
      ${legacy ? `<p class="legacy-warning">Legacy history — preserved for inspection, excluded from active reasoning.</p>` : ""}
      <p>${escapeHtml(learned || entry.reasoningConclusion || "Checkpoint recorded.")}</p>
      <details>
        <summary>Open cycle record</summary>
        <dl>
          <dt>Question</dt><dd>${escapeHtml(entry.highestLeverageQuestion)}</dd>
          <dt>State change</dt><dd>${escapeHtml(changes || "None")}</dd>
          <dt>Remaining uncertainty</dt><dd>${escapeHtml(uncertainty || "None")}</dd>
          <dt>Disposition</dt><dd>${escapeHtml(entry.disposition)}</dd>
          ${entry.researchExecutionStatus ? `<dt>Research execution</dt><dd>${escapeHtml(titleCaseToken(entry.researchExecutionStatus))}</dd>` : ""}
          ${entry.researchEvidenceOutcome ? `<dt>Research evidence outcome</dt><dd>${escapeHtml(researchOutcomeLabel(entry.researchEvidenceOutcome))}</dd>` : ""}
          ${researchLog ? `<dt>Error timestamp</dt><dd>${escapeHtml(researchLog.timestamp)}</dd>
          <dt>Research job</dt><dd>${escapeHtml(researchLog.jobId || "unassigned")} / ${escapeHtml(researchLog.currentJobState || "FAILED")}</dd>
          <dt>Technical error</dt><dd><code>${escapeHtml(researchLog.technicalError || "No detail recorded.")}</code></dd>` : ""}
        </dl>
      </details>
    </li>`;
  }).join("");
}

function reportList(items, empty = "None recorded.") {
  const values = Array.isArray(items) && items.length ? items : [empty];
  return `<ul>${values.map((item) => `<li>${escapeHtml(typeof item === "string" ? item : (item.claim || item.assumption || item.question || JSON.stringify(item)))}</li>`).join("")}</ul>`;
}

function syntheticReportList(items) {
  return reportList((items || []).map((item) => `${item.claim} — Synthetic / Simulated. Test or method-validation only. Cannot validate real-world propositions. Cannot satisfy Human Gate.`), "No synthetic or simulated test data recorded.");
}

function renderReport() {
  const report = currentReport?.report || currentReport;
  elements.reportPanel.hidden = !report;
  if (!report) return;
  const status = report.propositionStatus || {};
  const base = report.evidenceBase || {};
  elements.reportContent.innerHTML = `
    <section><h4>Executive Summary</h4><p>${escapeHtml(report.executiveSummary)}</p></section>
    <section><h4>Problem Definition</h4><p>${escapeHtml(report.problemDefinition)}</p></section>
    <div class="report-summary-grid">
      <section><span>Current disposition</span><strong>${escapeHtml(readableEnum(report.currentDisposition?.effectiveDisposition))}</strong></section>
      <section><span>Proposition status</span><strong>${escapeHtml(readableEnum(status.status))}</strong></section>
      <section><span>Validation process</span><strong>${escapeHtml(readableEnum(status.validationProcessStatus))}</strong></section>
      <section><span>Disconfirmation</span><strong>${escapeHtml(readableEnum(status.disconfirmationFlag))}</strong></section>
    </div>
    <section><h4>Key Findings</h4>${reportList(report.keyFindings)}</section>
    <div class="report-two-column">
      <section><h4>Supporting Evidence</h4>${reportList(base.supporting, "No material supporting evidence established.")}</section>
      <section><h4>Contradictory / Limiting Evidence</h4>${reportList(report.contradictoryOrLimitingEvidence, "No material contradictory finding recorded.")}</section>
    </div>
    <section><h4>Synthetic / Simulated Test Data</h4>${syntheticReportList(base.syntheticOrSimulated)}</section>
    <div class="report-two-column">
      <section><h4>Remaining Assumptions</h4>${reportList(report.remainingAssumptions)}</section>
      <section><h4>Evidence Gaps</h4>${reportList(report.evidenceGaps)}</section>
    </div>
    <section><h4>Risks and Limitations</h4>${reportList(report.risksAndLimitations)}</section>
    <section><h4>Recommended Next Action</h4><p><strong>${escapeHtml(readableEnum(report.recommendedNextAction?.disposition))}</strong> — ${escapeHtml(report.recommendedNextAction?.action)}</p><p>${escapeHtml(report.recommendedNextAction?.why)}</p></section>`;
}

function renderAll() {
  renderRuntime();
  renderProject();
  renderRouting();
  renderReasoning();
  renderResearch();
  renderResult();
  renderHumanGate();
  renderNotebook();
  renderReport();
}

async function initializeIfNeeded() {
  if (projectState) return;
  const input = elements.problemInput.value.trim();
  const payload = await api("/api/projects", { input });
  projectState = normalizeClientProjectState(payload.state);
  currentResult = null;
  activeResearch = null;
  activeReasoning = null;
  currentReport = null;
}

async function requestRoute(forcedMethod = null, { scroll = true } = {}) {
  if (busy) return;
  if (researchPending()) {
    showToast("Public research is still running. Check its status or wait before replacing the routed question.", "error");
    return;
  }
  if (reasoningPending()) {
    showToast("A live reasoning cycle has already been accepted. Resume or check that response before replacing the routed question.", "error");
    return;
  }
  setBusy(true, "Finding the trunk question…");
  try {
    await initializeIfNeeded();
    const payload = await api("/api/rethink/route", {
      state: projectState,
      mode: selectedMode(),
      forcedMethod
    });
    pendingRouting = payload.routing;
    currentResult = null;
    activeResearch = null;
    activeReasoning = null;
    currentReport = null;
    persist();
    renderAll();
    if (scroll) elements.routingPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    setBusy(false);
  }
}

function scheduleResearchPoll(delay = activeResearch?.pollAfterMs || 2000) {
  clearTimeout(researchPollTimer);
  if (!researchPending()) return;
  researchPollTimer = setTimeout(() => pollPublicResearch(), Math.max(250, Number(delay) || 2000));
}

function ingestResearchPayload(payload) {
  if (payload.state?.id) projectState = normalizeClientProjectState(payload.state);
  if (payload.result) {
    currentResult = payload.result;
    currentReport = null;
  }
  activeResearch = {
    ...(payload.research || activeResearch || {}),
    status: payload.status || payload.research?.status || "COMPLETED",
    executionStatus: payload.executionStatus || payload.research?.executionStatus || activeResearch?.executionStatus,
    evidenceOutcome: payload.evidenceOutcome || payload.research?.evidenceOutcome || activeResearch?.evidenceOutcome || "NOT_EVALUATED"
  };
  persist();
  renderAll();
  if (payload.result) elements.resultPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function redactClientError(value) {
  return String(value || "Unknown public-research execution error.")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[REDACTED_API_KEY]")
    .replace(/(authorization|api[-_ ]?key)\s*[:=]\s*[^\s,;]+/gi, "$1: [REDACTED]")
    .slice(0, 4000);
}

async function startPublicResearch({ retry = false, scopeOverride = null } = {}) {
  if (busy || !pendingRouting) return;
  const previousResearch = retry ? activeResearch : null;
  const startedAt = new Date().toISOString();
  activeResearch = {
    ...(previousResearch || {}),
    status: "PENDING",
    executionStatus: "PENDING",
    evidenceOutcome: "NOT_EVALUATED",
    jobId: previousResearch?.jobId || `local_research_${Date.now()}`,
    projectId: projectState.id,
    startedAt: previousResearch?.startedAt || startedAt,
    retryCount: Number(previousResearch?.retryCount || 0) + (previousResearch ? 1 : 0),
    question: pendingRouting.highestLeverageQuestion,
    researchScope: scopeOverride || previousResearch?.researchScope || {
      supportingSearch: `What credible public evidence supports: ${pendingRouting.highestLeverageQuestion}`,
      disconfirmingSearch: `What credible evidence weakens, narrows, contradicts, or shows this is already solved: ${pendingRouting.highestLeverageQuestion}`
    },
    errorLog: Array.isArray(previousResearch?.errorLog) ? previousResearch.errorLog : []
  };
  persist();
  renderResearch();
  setBusy(true, "Starting public research...");
  try {
    const payload = await api("/api/rethink/research/start", {
      state: projectState,
      routing: pendingRouting,
      previousResearch,
      scopeOverride
    });
    ingestResearchPayload(payload);
    if (!payload.result && researchPending()) scheduleResearchPoll();
  } catch (error) {
    const technicalError = redactClientError(error.message);
    const log = {
      timestamp: new Date().toISOString(),
      jobId: activeResearch.jobId,
      humanReadableSummary: "Public research failed technically; no evidentiary conclusion was produced.",
      technicalError,
      retryAttempt: activeResearch.retryCount || 0,
      currentJobState: "FAILED"
    };
    activeResearch = { ...activeResearch, status: "FAILED", executionStatus: "FAILED_TECHNICALLY", evidenceOutcome: "NOT_EVALUATED", retrySafe: true, lastError: technicalError, errorLog: [...(activeResearch.errorLog || []), log] };
    persist();
    renderResearch();
    showToast(error.message, "error");
  } finally {
    setBusy(false);
  }
}

async function pollPublicResearch() {
  if (!researchPending() || !pendingRouting) return;
  clearTimeout(researchPollTimer);
  activeResearch = { ...activeResearch, status: "RETRIEVING" };
  persist();
  renderResearch();
  try {
    const payload = await api("/api/rethink/research/status", {
      state: projectState,
      routing: pendingRouting,
      research: activeResearch
    });
    ingestResearchPayload(payload);
    if (researchPending()) scheduleResearchPoll();
  } catch (error) {
    const technicalError = redactClientError(error.message);
    const log = {
      timestamp: new Date().toISOString(), jobId: activeResearch.jobId,
      humanReadableSummary: "Public research failed technically; no evidentiary conclusion was produced.",
      technicalError, retryAttempt: activeResearch.retryCount || 0, currentJobState: "FAILED"
    };
    activeResearch = { ...activeResearch, status: "FAILED", executionStatus: "FAILED_TECHNICALLY", evidenceOutcome: "NOT_EVALUATED", retrySafe: true, lastError: technicalError, errorLog: [...(activeResearch.errorLog || []), log] };
    persist();
    renderResearch();
    showToast(`${error.message} The project was not changed.`, "error");
  }
}

function researchAttemptIsPersisted(research) {
  return (projectState?.researchHistory || []).some((item) => (research.researchKey && item.researchKey === research.researchKey)
    || (research.jobId && item.jobId === research.jobId)
    || (research.responseId && item.responseId === research.responseId));
}

async function persistLocalResearchFailure() {
  if (!activeResearch || researchAttemptIsPersisted(activeResearch)) return;
  const error = latestResearchError();
  const payload = await api("/api/rethink/state", {
    state: projectState,
    operation: {
      type: "RECORD_RESEARCH_FAILURE",
      research: activeResearch,
      errorSummary: error.humanReadableSummary,
      technicalError: error.technicalError,
      jobState: error.currentJobState
    }
  });
  projectState = normalizeClientProjectState(payload.state);
  activeResearch = projectState.researchHistory.find((item) => item.jobId === activeResearch.jobId) || activeResearch;
}

async function decideAfterResearch(action, rationale) {
  if (busy || !activeResearch) return;
  if (!rationale?.trim()) return;
  setBusy(true, "Recording the research recovery decision...");
  try {
    if (activeResearch.executionStatus === "FAILED_TECHNICALLY") await persistLocalResearchFailure();
    const payload = await api("/api/rethink/state", {
      state: projectState,
      operation: {
        type: "DECIDE_AFTER_RESEARCH",
        action,
        research: activeResearch,
        rationale,
        unresolvedUncertainty: [activeResearch.question]
      }
    });
    projectState = normalizeClientProjectState(payload.state);
    activeResearch = null;
    activeReasoning = null;
    pendingRouting = null;
    currentResult = null;
    currentReport = null;
    persist();
    renderAll();
  } catch (error) {
    showToast(error.message, "error");
    return;
  } finally {
    setBusy(false);
  }
  if (action === "PROCEED_UNDER_UNCERTAINTY") await requestRoute();
}

function showResearchDecisionForm(action) {
  elements.researchDecisionForm.dataset.action = action;
  const proceed = action === "PROCEED_UNDER_UNCERTAINTY";
  elements.researchDecisionTitle.textContent = proceed ? "Proceed with an unresolved evidence gap" : "Route the gap to human / real-world evidence";
  elements.researchDecisionHelp.textContent = proceed
    ? "Explain why proceeding is appropriate. The failed or inconclusive research attempt and unresolved question will remain in project history."
    : "Explain why public research is no longer sufficient and what real-world or private evidence is needed.";
  elements.researchDecisionRationale.value = "";
  elements.researchDecisionForm.hidden = false;
  elements.researchDecisionRationale.focus();
}

async function submitResearchDecision(event) {
  event.preventDefault();
  const action = elements.researchDecisionForm.dataset.action;
  const rationale = elements.researchDecisionRationale.value.trim();
  if (!rationale) {
    showToast("A rationale is required so the human decision remains auditable.", "error");
    return;
  }
  await decideAfterResearch(action, rationale);
  if (!activeResearch) elements.researchDecisionForm.hidden = true;
}

async function reassessAfterInconclusiveResearch() {
  activeResearch = null;
  activeReasoning = null;
  pendingRouting = null;
  currentResult = null;
  persist();
  renderAll();
  await requestRoute();
}

async function runDifferentResearchScope(event) {
  event.preventDefault();
  if (busy || !projectState) return;
  const scopeOverride = {
    supportingSearch: elements.supportingScopeInput.value.trim(),
    disconfirmingSearch: elements.disconfirmingScopeInput.value.trim(),
    sourceClassesPlanned: ["PRIMARY_SOURCE", "SECONDARY_SOURCE", "TERTIARY_AGGREGATED_SOURCE"]
  };
  if (!scopeOverride.supportingSearch || !scopeOverride.disconfirmingSearch) {
    showToast("Both the supporting and disconfirming search scopes are required.", "error");
    return;
  }
  setBusy(true, "Recording the revised research scope...");
  try {
    const stage = await api("/api/rethink/state", {
      state: projectState,
      operation: {
        type: "OVERRIDE_STAGE",
        action: "RERUN",
        pecPhase: projectState.pecPhase.id,
        forcedMethod: pendingRouting?.selectedMethod || "VALIDATE",
        reason: "The user requested another bounded public search with a materially different supporting and disconfirming scope."
      }
    });
    projectState = normalizeClientProjectState(stage.state);
    const routed = await api("/api/rethink/route", { state: projectState, mode: selectedMode(), forcedMethod: pendingRouting?.selectedMethod || "VALIDATE" });
    pendingRouting = {
      ...routed.routing,
      evidenceGate: "PUBLIC_RESEARCH_REQUIRED",
      requiresExternalResearch: true,
      override: true,
      whyQuestionNow: `${routed.routing.whyQuestionNow} The user explicitly requested a revised bounded public-research scope.`
    };
    currentResult = null;
    activeResearch = null;
    activeReasoning = null;
    elements.researchScopeForm.hidden = true;
    persist();
    renderAll();
  } catch (error) {
    showToast(error.message, "error");
    return;
  } finally {
    setBusy(false);
  }
  await startPublicResearch({ scopeOverride });
}

function scheduleReasoningPoll(delay = activeReasoning?.pollAfterMs || 2000) {
  clearTimeout(reasoningPollTimer);
  if (!reasoningShouldAutoPoll()) return;
  reasoningPollTimer = setTimeout(() => pollBackgroundReasoning(), Math.max(250, Number(delay) || 2000));
}

function ingestReasoningPayload(payload) {
  if (payload.state?.id) projectState = normalizeClientProjectState(payload.state);
  if (payload.result) {
    currentResult = payload.result;
    currentReport = null;
  }
  activeReasoning = {
    ...(payload.execution || activeReasoning || {}),
    status: payload.status || payload.execution?.status || "COMPLETED",
    executionStatus: payload.executionStatus || payload.execution?.executionStatus || activeReasoning?.executionStatus,
    retrySafe: Boolean(payload.retrySafe ?? payload.execution?.retrySafe),
    resumeAvailable: Boolean(payload.resumeAvailable ?? payload.execution?.resumeAvailable)
  };
  persist();
  renderAll();
  if (payload.result) elements.resultPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function startBackgroundReasoning({ retry = false } = {}) {
  if (busy || !pendingRouting) return;
  const previousExecution = retry ? activeReasoning : null;
  activeReasoning = {
    ...(previousExecution || {}),
    jobId: previousExecution?.jobId || `local_reasoning_${Date.now()}`,
    projectId: projectState.id,
    selectedMethod: pendingRouting.selectedMethod,
    question: pendingRouting.highestLeverageQuestion,
    status: "PENDING",
    executionStatus: "REQUEST_NOT_ACCEPTED",
    responseId: previousExecution?.responseId || "",
    retryCount: Number(previousExecution?.retryCount || 0) + (previousExecution ? 1 : 0),
    retrySafe: false,
    lastError: ""
  };
  persist();
  renderReasoning();
  setBusy(true, `Starting ${methodLabel(pendingRouting.selectedMethod)}…`);
  try {
    const payload = await api("/api/rethink/reasoning/start", {
      state: projectState,
      routing: pendingRouting,
      previousExecution
    });
    ingestReasoningPayload(payload);
    if (!payload.result && reasoningShouldAutoPoll()) scheduleReasoningPoll();
  } catch (error) {
    activeReasoning = {
      ...activeReasoning,
      status: "REQUEST_NOT_ACCEPTED",
      executionStatus: "REQUEST_NOT_ACCEPTED",
      retrySafe: true,
      lastError: redactClientError(error.message)
    };
    persist();
    renderReasoning();
    showToast(error.message, "error");
  } finally {
    setBusy(false);
  }
}

async function pollBackgroundReasoning() {
  if (!activeReasoning?.responseId || !pendingRouting || busy) return;
  clearTimeout(reasoningPollTimer);
  activeReasoning = { ...activeReasoning, status: "RETRIEVING" };
  persist();
  renderReasoning();
  try {
    const payload = await api("/api/rethink/reasoning/status", {
      state: projectState,
      routing: pendingRouting,
      execution: activeReasoning
    });
    ingestReasoningPayload(payload);
    if (reasoningShouldAutoPoll()) scheduleReasoningPoll();
  } catch (error) {
    activeReasoning = {
      ...activeReasoning,
      status: "RETRIEVAL_FAILED",
      executionStatus: "ACCEPTED_RUNNING",
      resumeAvailable: true,
      retrySafe: false,
      lastError: redactClientError(error.message)
    };
    persist();
    renderReasoning();
    showToast("The status check failed. The accepted response ID is preserved; use Resume / Check Status.", "error");
  }
}

async function runCycle() {
  if (busy || !pendingRouting || currentResult?.reasoning) return;
  if (selectedMode() === "live" && pendingRouting.evidenceGate === "PUBLIC_RESEARCH_REQUIRED") {
    await startPublicResearch();
    return;
  }
  if (selectedMode() === "live" && backgroundReasoningMethods.has(pendingRouting.selectedMethod)) {
    await startBackgroundReasoning();
    return;
  }
  setBusy(true, `Running ${methodLabel(pendingRouting.selectedMethod)}…`);
  try {
    const payload = await api("/api/rethink/cycle", {
      state: projectState,
      routing: pendingRouting,
      mode: selectedMode()
    });
    projectState = normalizeClientProjectState(payload.state);
    currentResult = payload.result;
    currentReport = null;
    persist();
    renderAll();
    elements.resultPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    const fallback = error.demoAvailable ? " Demo Mode remains available for a separate deterministic run." : "";
    showToast(`${error.message}${fallback}`, "error");
  } finally {
    setBusy(false);
  }
}

async function runForcedOperator(method) {
  if (busy) return;
  await requestRoute(method, { scroll: false });
  if (pendingRouting?.selectedMethod === method) await runCycle();
}

async function lockCurrentState() {
  if (busy) return;
  if (!projectState) {
    showToast("Run Rethink once before creating a canonical checkpoint.", "error");
    return;
  }
  setBusy(true, "Creating checkpoint…");
  try {
    const payload = await api("/api/rethink/lock", { state: projectState });
    projectState = normalizeClientProjectState(payload.state);
    currentResult = null;
    pendingRouting = null;
    activeResearch = null;
    activeReasoning = null;
    currentReport = null;
    persist();
    renderAll();
    showToast("Locked. This is now the canonical working state until evidence justifies reopening it.");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    setBusy(false);
  }
}

function downloadArtifact({ content, filename, mimeType }) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadJson(value, filename) {
  downloadArtifact({
    content: JSON.stringify(value, null, 2),
    filename: filename.endsWith(".json") ? filename : `${filename}.json`,
    mimeType: "application/json;charset=utf-8"
  });
}

function exportProject() {
  if (!projectState) {
    showToast("There is no project to export yet.", "error");
    return;
  }
  downloadJson({
    format: "rethink.project.backup",
    formatVersion: 2,
    exportedAt: new Date().toISOString(),
    projectId: projectState.id,
    project: projectState,
    runtimeSession: {
      routing: pendingRouting,
      result: currentResult,
      research: activeResearch,
      reasoning: activeReasoning,
      report: currentReport,
      mode: selectedMode()
    }
  }, `rethink-project-backup-${projectState.id}.json`);
  showToast("Complete project backup exported as portable JSON.");
}

function exportNotebook() {
  if (!projectState) {
    showToast("There is no Lab Notebook to export yet.", "error");
    return;
  }
  downloadJson({
    format: "rethink.lab-notebook",
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    projectId: projectState.id,
    projectTitle: projectState.title,
    originalInput: projectState.originalInput,
    currentPecPhase: projectState.pecPhase,
    currentDisposition: projectState.currentDisposition,
    notebook: projectState.notebook,
    stateEvents: projectState.stateEvents,
    evidence: projectState.evidence,
    assumptions: projectState.assumptions,
    lockedVersions: projectState.lockedDecisions
  }, `rethink-notebook-${projectState.id}.json`);
  showToast("Lab Notebook and its evidence trail exported as JSON.");
}

async function generateProjectReport() {
  if (!projectState || busy) {
    if (!projectState) showToast("Create or import a project before generating a report.", "error");
    return;
  }
  setBusy(true, "Generating report...");
  try {
    currentReport = await api("/api/projects/report", { state: projectState });
    persist();
    renderReport();
    elements.reportPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    setBusy(false);
  }
}

function downloadProjectReport() {
  const report = currentReport?.report || currentReport;
  if (!report) return;
  downloadArtifact(createHumanReportArtifact(report));
}

function downloadProjectReportJson() {
  const report = currentReport?.report || currentReport;
  if (!report) return;
  downloadArtifact(createReportJsonArtifact(report));
}

async function importProjectFile(file) {
  if (!file) return;
  if (file.size > 1_000_000) {
    showToast("Project backup exceeds the 1 MB import limit.", "error");
    return;
  }
  setBusy(true, "Importing project…");
  try {
    const backup = JSON.parse(await file.text());
    const payload = await api("/api/projects/import", { backup });
    projectState = normalizeClientProjectState(payload.state);
    const restored = payload.runtimeSession && typeof payload.runtimeSession === "object" ? payload.runtimeSession : {};
    pendingRouting = restored.routing || null;
    currentResult = restored.result || null;
    activeResearch = restored.research || null;
    activeReasoning = restored.reasoning || null;
    currentReport = restored.report || null;
    if (restored.mode === "live" && liveAvailable) elements.liveModeInput.checked = true;
    persist();
    renderAll();
    if (activeResearch && researchPending()) scheduleResearchPoll(250);
    if (activeReasoning && reasoningShouldAutoPoll()) scheduleReasoningPoll(250);
    showToast(`Imported ${projectState.id}. Routing will resume only from this project's state.`);
  } catch (error) {
    showToast(error instanceof SyntaxError ? "That file is not valid JSON." : error.message, "error");
  } finally {
    elements.projectImportInput.value = "";
    setBusy(false);
  }
}

function resetProject() {
  if (!elements.stateDrawer.hidden) closeStateDrawer();
  projectState = null;
  pendingRouting = null;
  currentResult = null;
  activeResearch = null;
  activeReasoning = null;
  currentReport = null;
  clearTimeout(researchPollTimer);
  clearTimeout(reasoningPollTimer);
  elements.problemInput.value = "";
  elements.routingPanel.hidden = true;
  elements.resultPanel.hidden = true;
  projectRepository.clearSession();
  renderAll();
  elements.problemInput.focus();
}

async function checkStatus() {
  try {
    const status = await api("/api/status");
    if (Array.isArray(status.modules) && status.modules.length > 0) {
      availableMethods = status.modules.map((module) => module.id);
      moduleNames = new Map(status.modules.map((module) => [module.id, module.name]));
      populateMethodOptions();
    }
    if (Array.isArray(status.backgroundReasoningMethods) && status.backgroundReasoningMethods.length > 0) {
      backgroundReasoningMethods = new Set(status.backgroundReasoningMethods);
    }
    liveAvailable = status.liveAvailable;
    elements.liveModeInput.disabled = !liveAvailable;
    elements.liveModeHint.textContent = liveAvailable ? `${status.liveModel} ready` : "Requires OPENAI_API_KEY";
    if (!liveAvailable && selectedMode() === "live") {
      document.querySelector('input[name="mode"][value="demo"]').checked = true;
      renderRuntime();
    }
  } catch {
    liveAvailable = false;
    elements.liveModeInput.disabled = true;
    elements.liveModeHint.textContent = "Server unavailable";
  }
}

populateMethodOptions();
elements.sampleButton.addEventListener("click", () => {
  elements.problemInput.value = SAMPLE_PROBLEM;
  elements.problemInput.focus();
});
elements.runRethinkButton.addEventListener("click", () => requestRoute());
elements.resumeRethinkButton.addEventListener("click", () => requestRoute());
elements.runMethodButton.addEventListener("click", runCycle);
elements.nextCycleButton.addEventListener("click", () => requestRoute());
elements.newProjectButton.addEventListener("click", resetProject);
elements.lockButton.addEventListener("click", lockCurrentState);
elements.exportButton.addEventListener("click", exportProject);
elements.exportNotebookButton.addEventListener("click", exportNotebook);
elements.generateReportButton.addEventListener("click", generateProjectReport);
elements.downloadReportButton.addEventListener("click", downloadProjectReport);
elements.downloadReportJsonButton.addEventListener("click", downloadProjectReportJson);
elements.checkReasoningButton.addEventListener("click", pollBackgroundReasoning);
elements.retryReasoningButton.addEventListener("click", () => startBackgroundReasoning({ retry: true }));
elements.retryResearchButton.addEventListener("click", () => startPublicResearch({ retry: true }));
elements.refreshResearchButton.addEventListener("click", pollPublicResearch);
elements.viewResearchErrorButton.addEventListener("click", () => {
  elements.researchErrorLog.hidden = !elements.researchErrorLog.hidden;
  renderResearch();
  if (!elements.researchErrorLog.hidden) elements.researchErrorLog.scrollIntoView({ behavior: "smooth", block: "nearest" });
});
elements.copyResearchErrorButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(elements.researchTechnicalError.value);
    showToast("Technical error copied.");
  } catch {
    elements.researchTechnicalError.select();
    showToast("Technical error selected for copying.");
  }
});
elements.proceedWithoutResearchButton.addEventListener("click", () => showResearchDecisionForm("PROCEED_UNDER_UNCERTAINTY"));
elements.proceedInconclusiveButton.addEventListener("click", () => showResearchDecisionForm("PROCEED_UNDER_UNCERTAINTY"));
elements.routeHumanResearchButton.addEventListener("click", () => showResearchDecisionForm("ROUTE_TO_HUMAN_REAL_WORLD_EVIDENCE"));
elements.researchDecisionForm.addEventListener("submit", submitResearchDecision);
elements.cancelResearchDecisionButton.addEventListener("click", () => { elements.researchDecisionForm.hidden = true; });
elements.reassessResearchButton.addEventListener("click", reassessAfterInconclusiveResearch);
elements.differentScopeButton.addEventListener("click", () => {
  elements.researchScopeForm.hidden = false;
  elements.supportingScopeInput.value = activeResearch?.researchScope?.supportingSearch || "";
  elements.disconfirmingScopeInput.value = activeResearch?.researchScope?.disconfirmingSearch || "";
  elements.supportingScopeInput.focus();
});
elements.cancelScopeEditButton.addEventListener("click", () => { elements.researchScopeForm.hidden = true; });
elements.researchScopeForm.addEventListener("submit", runDifferentResearchScope);
elements.importProjectButton.addEventListener("click", () => elements.projectImportInput.click());
elements.projectImportInput.addEventListener("change", () => importProjectFile(elements.projectImportInput.files?.[0]));
elements.resolveHumanGateButton.addEventListener("click", () => {
  openStateDrawer("human", elements.resolveHumanGateButton);
  showHumanGateForm();
});
elements.gateAddEvidenceButton.addEventListener("click", () => {
  openStateDrawer("evidence", elements.gateAddEvidenceButton);
  showEvidenceForm();
});
elements.stageOverrideButton.addEventListener("click", () => {
  openStateDrawer("authority", elements.stageOverrideButton);
  showStageOverrideForm();
});
elements.finalJudgmentButton.addEventListener("click", () => {
  openStateDrawer("authority", elements.finalJudgmentButton);
  showDispositionForm();
});
elements.chooseMethodButton.addEventListener("click", () => {
  elements.methodChooser.hidden = !elements.methodChooser.hidden;
  if (!elements.methodChooser.hidden) elements.methodSelect.focus();
});
elements.askWhyButton.addEventListener("click", () => {
  elements.routeWhy.hidden = !elements.routeWhy.hidden;
  elements.askWhyButton.textContent = elements.routeWhy.hidden ? "Ask why" : "Hide explanation";
});
elements.methodChooser.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.methodChooser.hidden = true;
  await requestRoute(elements.methodSelect.value);
});
$$('[data-method]').forEach((button) => {
  button.addEventListener("click", () => runForcedOperator(button.dataset.method));
});
$$('input[name="mode"]').forEach((input) => {
  input.addEventListener("change", async () => {
    renderRuntime();
    persist();
    if (projectState && pendingRouting?.executionBlocked && pendingRouting.evidenceGate === "PUBLIC_RESEARCH_REQUIRED" && selectedMode() === "live") {
      await requestRoute(pendingRouting.selectedMethod);
    }
  });
});
elements.problemInput.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") requestRoute();
});

$$('[data-state-panel]').forEach((button) => {
  button.addEventListener("click", () => {
    if (elements.stateDrawer.hidden) {
      openStateDrawer(button.dataset.statePanel, button);
      return;
    }
    activeStatePanel = button.dataset.statePanel;
    hideStateEditor();
    renderStatePanel();
  });
});

elements.closeStateDrawerButton.addEventListener("click", closeStateDrawer);
elements.stateDrawerBackdrop.addEventListener("click", closeStateDrawer);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !elements.stateDrawer.hidden) closeStateDrawer();
});

elements.addStateItemButton.addEventListener("click", () => {
  if (activeStatePanel === "assumptions") showAssumptionForm();
  if (activeStatePanel === "evidence") showEvidenceForm();
});

function jumpToLinkedRecord(panel, id) {
  activeStatePanel = panel;
  hideStateEditor();
  renderStatePanel();
  const target = elements.statePanelContent.querySelector(`[data-record-id="${CSS.escape(id)}"]`);
  if (!target) return;
  target.tabIndex = -1;
  target.focus({ preventScroll: true });
  target.scrollIntoView({ behavior: "smooth", block: "center" });
}

elements.statePanelContent.addEventListener("click", (event) => {
  const button = event.target.closest("[data-state-action]");
  if (!button) return;
  const { stateAction: action, id } = button.dataset;
  if (action === "open-evidence") return jumpToLinkedRecord("evidence", id);
  if (action === "open-assumption") return jumpToLinkedRecord("assumptions", id);
  if (action === "edit-assumption") {
    const item = activeAssumptions().find((candidate) => candidate.id === id);
    if (item) showAssumptionForm(item);
  }
  if (action === "remove-assumption") {
    const item = activeAssumptions().find((candidate) => candidate.id === id);
    if (item) showRemovalForm("ASSUMPTION", item);
  }
  if (action === "edit-evidence") {
    const item = (projectState.evidence || []).find((candidate) => candidate.id === id && candidate.status !== "REMOVED");
    if (item) showEvidenceForm(item);
  }
  if (action === "remove-evidence") {
    const item = (projectState.evidence || []).find((candidate) => candidate.id === id && candidate.status !== "REMOVED");
    if (item) showRemovalForm("EVIDENCE", item);
  }
  if (action === "compare-lock") {
    const lock = projectState.lockedDecisions.find((candidate) => candidate.id === id);
    if (lock) showLockComparison(lock);
  }
  if (action === "reopen-lock") {
    const lock = projectState.lockedDecisions.find((candidate) => candidate.id === id && candidate.status === "ACTIVE");
    if (lock) showReopenForm(lock);
  }
  if (action === "resolve-gate") {
    const gate = openHumanGates().find((candidate) => candidate.id === id);
    if (gate) showHumanGateForm(gate);
  }
  if (action === "gate-add-evidence") {
    activeStatePanel = "evidence";
    renderStatePanel();
    showEvidenceForm();
  }
  if (action === "show-stage-form") showStageOverrideForm();
  if (action === "show-disposition-form") showDispositionForm();
});

elements.statePanelEditor.addEventListener("click", (event) => {
  if (event.target.closest('[data-state-action="cancel-editor"]')) hideStateEditor();
});

elements.statePanelEditor.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target.closest("form[data-form-kind]");
  if (!form || busy) return;
  const data = new FormData(form);
  const id = form.dataset.id || undefined;
  const kind = form.dataset.formKind;
  if (kind === "assumption") {
    return applyStateOperation({
      type: "UPSERT_ASSUMPTION",
      reason: data.get("reason"),
      item: {
        id,
        text: data.get("text"),
        status: data.get("status"),
        confidence: Number(data.get("confidence")),
        confidenceOrigin: data.get("confidenceOrigin"),
        rationale: data.get("rationale"),
        evidenceIds: data.getAll("evidenceIds")
      }
    }, id ? "Assumption updated and traced." : "Assumption added and traced.");
  }
  if (kind === "evidence") {
    const customQuestions = String(data.get("customQuestionRefs") || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    return applyStateOperation({
      type: "UPSERT_EVIDENCE",
      reason: data.get("reason"),
      item: {
        id,
        claim: data.get("claim"),
        intakeType: data.get("intakeType"),
        evidenceAuthenticity: data.get("evidenceAuthenticity"),
        reliability: data.get("reliability"),
        relationship: data.get("relationship"),
        provenanceOrigin: data.get("provenanceOrigin"),
        sourceClassification: data.get("sourceClassification"),
        sourceCategory: data.get("sourceCategory"),
        sourceTitle: data.get("sourceTitle"),
        sourceUrl: data.get("sourceUrl"),
        sourceDate: data.get("sourceDate"),
        population: data.get("population"),
        collectionMethod: data.get("collectionMethod"),
        methodDetails: data.get("methodDetails"),
        observation: data.get("observation"),
        assessment: data.get("assessment"),
        assumptionIds: data.getAll("assumptionIds"),
        questionRefs: [...new Set([...data.getAll("questionRefs"), ...customQuestions])]
      }
    }, id ? "Evidence updated and links synchronized." : "Evidence added and linked.");
  }
  if (kind === "remove-assumption") {
    return applyStateOperation({ type: "REMOVE_ASSUMPTION", id, reason: data.get("reason") }, "Assumption removed from active state; its history remains inspectable.");
  }
  if (kind === "remove-evidence") {
    return applyStateOperation({ type: "REMOVE_EVIDENCE", id, reason: data.get("reason") }, "Evidence removed from active state; linked assumptions were synchronized.");
  }
  if (kind === "reopen-lock") {
    return applyStateOperation({ type: "REOPEN_LOCK", lockId: id, trigger: data.get("trigger"), reason: data.get("reason") }, "Locked version reopened with its trigger recorded.");
  }
  if (kind === "resolve-human-gate") {
    return applyStateOperation({ type: "RESOLVE_HUMAN_GATE", gateId: id, resolutionType: data.get("resolutionType"), resolution: data.get("resolution"), evidenceIds: data.getAll("evidenceIds"), reason: data.get("reason") }, "Human gate resolved. STM will reassess the updated state.");
  }
  if (kind === "override-disposition") {
    return applyStateOperation({
      type: "OVERRIDE_DISPOSITION",
      systemRecommendation: data.get("systemRecommendation"),
      humanDisposition: data.get("humanDisposition"),
      rationale: data.get("rationale"),
      unresolvedUncertainty: lines(data.get("unresolvedUncertainty")),
      unmetEvidenceThresholds: lines(data.get("unmetEvidenceThresholds")),
      knownRisks: lines(data.get("knownRisks")),
      reopeningConditions: lines(data.get("reopeningConditions"))
    }, "Human disposition recorded without erasing the model recommendation or uncertainty.");
  }
  if (kind === "override-stage") {
    return applyStateOperation({
      type: "OVERRIDE_STAGE",
      action: data.get("action"),
      pecPhase: data.get("pecPhase"),
      forcedMethod: data.get("forcedMethod"),
      unresolvedEvidence: lines(data.get("unresolvedEvidence")),
      reason: data.get("reason")
    }, "PEC stage control recorded and stale routing invalidated.");
  }
});

await checkStatus();
restore();
renderAll();
