function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function readableEnum(value) {
  if (!value) return "Not recorded";
  return String(value)
    .trim()
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace("Human Real World", "Human / Real-World")
    .replace("Public Research Required", "Public Research Required")
    .replace("Proceed Under Uncertainty", "Proceed Under Uncertainty");
}

function slug(value) {
  const safe = String(value || "project").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return safe || "project";
}

function textFromItem(item) {
  if (typeof item === "string") return item;
  return item?.claim || item?.assumption || item?.question || item?.action || item?.rationale || JSON.stringify(item);
}

function renderList(items, empty = "None recorded.") {
  const values = Array.isArray(items) && items.length ? items : [empty];
  return `<ul>${values.map((item) => `<li>${escapeHtml(textFromItem(item))}</li>`).join("")}</ul>`;
}

function renderEvidence(items, empty) {
  if (!Array.isArray(items) || items.length === 0) return `<p class="empty">${escapeHtml(empty)}</p>`;
  return items.map((item) => {
    const url = /^https?:\/\//i.test(item.sourceUrl || "") ? item.sourceUrl : "";
    const source = item.sourceTitle || url || "Source not recorded";
    return `<article class="evidence-item">
      <h4>${escapeHtml(item.claim)}</h4>
      <p>${escapeHtml(item.assessment || "No separate assessment recorded.")}</p>
      <dl>
        <dt>Relationship</dt><dd>${escapeHtml(readableEnum(item.relationship))}</dd>
        <dt>Reliability</dt><dd>${escapeHtml(readableEnum(item.reliability))}</dd>
        <dt>Source quality</dt><dd>${escapeHtml(readableEnum(item.sourceClassification))} · ${escapeHtml(readableEnum(item.sourceCategory))}</dd>
        <dt>Population / applicability</dt><dd>${escapeHtml(item.population || "Not reported")}</dd>
        <dt>Source</dt><dd>${url ? `<a href="${escapeHtml(url)}">${escapeHtml(source)}</a>` : escapeHtml(source)}</dd>
      </dl>
    </article>`;
  }).join("");
}

function renderSyntheticEvidence(items) {
  if (!Array.isArray(items) || items.length === 0) return '<p class="empty">No synthetic or simulated test data recorded.</p>';
  return items.map((item) => `<article class="evidence-item synthetic-evidence-item">
    <h4>${escapeHtml(item.claim)}</h4>
    <p>${escapeHtml(item.assessment || "No separate assessment recorded.")}</p>
    <dl>
      <dt>Classification</dt><dd>Synthetic / Simulated</dd>
      <dt>Permitted use</dt><dd>Test or method-validation only</dd>
      <dt>Real-world proposition</dt><dd>Cannot validate real-world propositions</dd>
      <dt>Human Gate</dt><dd>Cannot satisfy Human Gate</dd>
      <dt>Recorded method</dt><dd>${escapeHtml(readableEnum(item.collectionMethod))}</dd>
    </dl>
  </article>`).join("");
}

function renderClaimLedger(ledger) {
  const claims = Array.isArray(ledger?.claims) ? ledger.claims : [];
  const relationships = Array.isArray(ledger?.evidenceRelationships)
    ? ledger.evidenceRelationships.filter((item) => item.status === "ACTIVE")
    : [];
  if (claims.length === 0) {
    return '<p class="empty">No explicit claims are recorded. Evidence remains available in the Evidence Base but is not presented as support for an unrecorded claim.</p>';
  }
  return `${claims.map((claim) => {
    const linked = relationships.filter((item) => item.claimId === claim.id);
    return `<article class="claim-item">
      <h4>${escapeHtml(claim.text)}</h4>
      <p><strong>Type:</strong> ${escapeHtml(readableEnum(claim.type))}<br>
      <strong>Explicit status:</strong> ${escapeHtml(readableEnum(claim.status))}</p>
      ${claim.notes ? `<p>${escapeHtml(claim.notes)}</p>` : ""}
      ${linked.length ? `<ul>${linked.map((item) => {
        const eligible = item.evidence?.eligibleForRealWorldValidation !== false;
        const label = item.evidence?.claim || item.evidenceId;
        return `<li><strong>${escapeHtml(readableEnum(item.relationship))}:</strong> ${escapeHtml(label)}${eligible ? "" : " — synthetic, removed, or otherwise ineligible for real-world validation"}</li>`;
      }).join("")}</ul>` : '<p class="empty">No active evidence relationships are recorded for this claim.</p>'}
    </article>`;
  }).join("")}<p class="meta">Claim statuses are explicit project state and are not calculated from relationship counts.</p>`;
}

function collectReferences(report) {
  const references = [];
  const seen = new Set();
  const add = (item) => {
    const url = item?.url || item?.sourceUrl || "";
    if (!/^https?:\/\//i.test(url) || seen.has(url)) return;
    seen.add(url);
    references.push({ title: item?.title || item?.sourceTitle || url, url });
  };
  const base = report?.evidenceBase || {};
  for (const item of [
    ...(base.supporting || []),
    ...(base.contradictory || []),
    ...(base.mixed || []),
    ...(base.contextOnly || [])
  ]) add(item);
  for (const research of report?.researchConducted || []) {
    for (const citation of research.citations || []) add(citation);
  }
  return references;
}

function renderResearch(items) {
  if (!Array.isArray(items) || items.length === 0) return '<p class="empty">No public research run is recorded.</p>';
  return items.map((item) => `<article class="research-item">
    <h4>${escapeHtml(item.question)}</h4>
    <p><strong>Execution:</strong> ${escapeHtml(readableEnum(item.executionStatus || item.status))}<br>
    <strong>Evidence outcome:</strong> ${escapeHtml(readableEnum(item.evidenceOutcome))}<br>
    <strong>Proposition status:</strong> ${escapeHtml(readableEnum(item.propositionStatus))}</p>
    ${item.supportingSearch ? `<p><strong>Supporting search:</strong> ${escapeHtml(item.supportingSearch)}</p>` : ""}
    ${item.disconfirmingSearch ? `<p><strong>Disconfirming search:</strong> ${escapeHtml(item.disconfirmingSearch)}</p>` : ""}
    ${renderList(item.findings, "No conclusive finding recorded for this run.")}
  </article>`).join("");
}

function renderDecisions(items) {
  if (!Array.isArray(items) || items.length === 0) return '<p class="empty">No human override is recorded.</p>';
  return items.map((item) => `<article class="decision-item">
    <p><strong>System recommendation:</strong> ${escapeHtml(readableEnum(item.systemRecommendation))}<br>
    <strong>Human decision:</strong> ${escapeHtml(readableEnum(item.humanDisposition))}</p>
    <p>${escapeHtml(item.rationale || "No rationale recorded.")}</p>
    <p><strong>Unresolved uncertainty:</strong></p>${renderList(item.unresolvedUncertainty)}
    <p><strong>Reopening conditions:</strong></p>${renderList(item.reopeningConditions)}
  </article>`).join("");
}

export function renderProjectReportHtml(report) {
  const status = report?.propositionStatus || {};
  const disposition = report?.currentDisposition || {};
  const base = report?.evidenceBase || {};
  const references = collectReferences(report);
  const title = report?.title || "Rethink Project Report";
  const generated = report?.generatedAt ? new Date(report.generatedAt).toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" }) : "Not recorded";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — Rethink Final Report</title>
<style>
  :root{font-family:Inter,Segoe UI,Arial,sans-serif;color:#1f2925;background:#f4f1e9}body{margin:0}.report{max-width:900px;margin:0 auto;background:#fff;min-height:100vh;padding:64px 72px;box-sizing:border-box}header{border-bottom:3px solid #1f5a45;padding-bottom:24px;margin-bottom:36px}h1{font-family:Georgia,serif;font-size:38px;margin:6px 0 12px}h2{font-family:Georgia,serif;color:#1f5a45;border-bottom:1px solid #d9ddd8;padding-bottom:8px;margin-top:38px}h3{font-size:15px;text-transform:uppercase;letter-spacing:.06em;color:#51645b}.kicker{color:#1f5a45;text-transform:uppercase;letter-spacing:.12em;font-size:12px;font-weight:700}.meta,.empty{color:#66736d}.summary{font-size:18px;line-height:1.55}.status-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.status-grid div,.claim-item,.evidence-item,.research-item,.decision-item{border:1px solid #d9ddd8;border-radius:8px;padding:16px}.status-grid span{display:block;color:#66736d;font-size:12px;text-transform:uppercase}.status-grid strong{display:block;margin-top:5px}p,li,dd{line-height:1.5}dl{display:grid;grid-template-columns:150px 1fr;gap:5px 14px}dt{font-weight:700}dd{margin:0}.claim-item,.evidence-item,.research-item,.decision-item{margin:12px 0;break-inside:avoid}.claim-item h4,.evidence-item h4,.research-item h4{margin-top:0}a{color:#1f5a45;word-break:break-all}.references li{margin-bottom:8px}.footer-note{margin-top:48px;border-top:1px solid #d9ddd8;padding-top:18px;color:#66736d;font-size:12px}@media(max-width:700px){.report{padding:32px 22px}.status-grid{grid-template-columns:1fr}dl{grid-template-columns:1fr}}@media print{body{background:#fff}.report{padding:24px 32px}.no-print{display:none}}
</style></head><body><main class="report">
<header><p class="kicker">Rethink Core · Final Report</p><h1>${escapeHtml(title)}</h1><p class="meta">Project ${escapeHtml(report?.projectId || "Not recorded")} · Generated ${escapeHtml(generated)}</p></header>
<section><h2>Executive Summary</h2><p class="summary">${escapeHtml(report?.executiveSummary || "No executive summary is available.")}</p></section>
<section><h2>Problem Definition</h2><p>${escapeHtml(report?.problemDefinition || "Not recorded.")}</p></section>
<section><h2>Current Disposition</h2><div class="status-grid">
  <div><span>System recommendation</span><strong>${escapeHtml(readableEnum(disposition.systemRecommendation))}</strong></div>
  <div><span>Human disposition</span><strong>${escapeHtml(readableEnum(disposition.humanDisposition || "No Override"))}</strong></div>
  <div><span>Effective disposition</span><strong>${escapeHtml(readableEnum(disposition.effectiveDisposition))}</strong></div>
  <div><span>Rationale</span><strong>${escapeHtml(disposition.rationale || "Not recorded")}</strong></div>
</div></section>
<section><h2>Key Findings</h2>${renderList(report?.keyFindings, "No material finding has been established.")}</section>
<section><h2>Core Claim Ledger</h2>${renderClaimLedger(report?.claimLedger)}</section>
<section><h2>Proposition Status</h2><div class="status-grid">
  <div><span>Proposition</span><strong>${escapeHtml(readableEnum(status.status))}</strong></div>
  <div><span>Validation process</span><strong>${escapeHtml(readableEnum(status.validationProcessStatus))}</strong></div>
  <div><span>Disconfirmation</span><strong>${escapeHtml(readableEnum(status.disconfirmationFlag))}</strong></div>
</div><p>${escapeHtml(status.rationale || "No proposition rationale is recorded.")}</p><p>${escapeHtml(status.validationProcessRationale || "")}</p></section>
<section><h2>Evidence Base</h2><h3>Supporting Evidence</h3>${renderEvidence(base.supporting, "No material supporting evidence established.")}
<h3>Contradictory Evidence</h3>${renderEvidence(base.contradictory, "No material contradictory evidence recorded.")}
<h3>Mixed / Limiting Evidence</h3>${renderEvidence(base.mixed, "No mixed evidence recorded.")}
<h3>Context-Only Evidence</h3>${renderEvidence(base.contextOnly, "No context-only evidence recorded.")}
<h3>Synthetic / Simulated Test Data</h3>${renderSyntheticEvidence(base.syntheticOrSimulated)}</section>
<section><h2>Source Quality Assessment</h2>${renderList((report?.sourceQualityAssessment || []).map((item) => `${item.evidenceId}: ${readableEnum(item.reliability)} reliability; ${readableEnum(item.sourceClassification)}; ${readableEnum(item.sourceCategory)}. ${item.limitation || ""}`))}</section>
<section><h2>Supported Conclusions</h2>${renderList(report?.supportedConclusions, "No conclusion currently meets the support threshold.")}</section>
<section><h2>Contradictory / Limiting Evidence</h2>${renderList(report?.contradictoryOrLimitingEvidence, "No material contradictory or limiting finding recorded.")}</section>
<section><h2>Remaining Assumptions</h2>${renderList((report?.remainingAssumptions || []).map((item) => `${item.assumption} — ${readableEnum(item.status)}, ${item.confidenceLabel || "confidence not assessed"}. ${item.rationale || ""}`))}</section>
<section><h2>Evidence Gaps</h2>${renderList(report?.evidenceGaps)}</section>
<section><h2>Research Conducted</h2>${renderResearch(report?.researchConducted)}</section>
<section><h2>Real-World Validation Required</h2>${renderList(report?.realWorldValidationRequired, "No separate real-world validation request is currently recorded.")}</section>
<section><h2>Risks and Limitations</h2>${renderList(report?.risksAndLimitations)}</section>
<section><h2>Human Decisions / Overrides</h2>${renderDecisions(report?.humanDecisionsAndOverrides)}</section>
<section><h2>Recommended Next Action</h2><p><strong>${escapeHtml(readableEnum(report?.recommendedNextAction?.disposition))}</strong> — ${escapeHtml(report?.recommendedNextAction?.action || "Run Rethink to reassess the project.")}</p><p>${escapeHtml(report?.recommendedNextAction?.why || "")}</p></section>
<section><h2>Confidence / Readiness Summary</h2>${renderList((report?.confidenceReadinessSummary || []).map((item) => `${item.assumption}: ${item.confidenceLabel || "Not assessed"} (${readableEnum(item.origin)}). ${item.rationale || ""}`))}</section>
<section><h2>References / Sources</h2>${references.length ? `<ol class="references">${references.map((item) => `<li><a href="${escapeHtml(item.url)}">${escapeHtml(item.title)}</a><br>${escapeHtml(item.url)}</li>`).join("")}</ol>` : '<p class="empty">No cited public source is recorded.</p>'}</section>
<p class="footer-note">This report reflects the project state at export time. Supporting evidence does not automatically validate a proposition; contradictory evidence does not automatically falsify it; unresolved uncertainty is preserved.</p>
</main></body></html>`;
}

export function createHumanReportArtifact(report) {
  return {
    filename: `rethink-final-report-${slug(report?.title || report?.projectId)}.html`,
    mimeType: "text/html;charset=utf-8",
    content: renderProjectReportHtml(report)
  };
}

export function createReportJsonArtifact(report) {
  return {
    filename: `rethink-report-data-${slug(report?.projectId || report?.title)}.json`,
    mimeType: "application/json;charset=utf-8",
    content: JSON.stringify({ format: "rethink.project.report", formatVersion: 1, report }, null, 2)
  };
}
