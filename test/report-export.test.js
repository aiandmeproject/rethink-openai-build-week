import assert from "node:assert/strict";
import test from "node:test";
import {
  createHumanReportArtifact,
  createReportJsonArtifact,
  readableEnum,
  renderProjectReportHtml
} from "../public/report-export.js";

function sampleReport() {
  return {
    reportVersion: "1.0",
    generatedAt: "2026-07-20T12:00:00.000Z",
    projectId: "project_utf8",
    title: "Equipment uptime — readiness report",
    executiveSummary: "Evidence reveals… a narrower 1–19 employee segment with “mixed” support.",
    problemDefinition: "Determine whether uptime access is meaningfully unmet.",
    claimLedger: {
      version: 1,
      statusPolicy: "EXPLICIT_NOT_INFERRED_FROM_RELATIONSHIPS",
      claims: [{
        id: "claim_material",
        text: "The target segment experiences material uptime constraints.",
        type: "MATERIAL",
        status: "DISPUTED",
        notes: "Support and limitations both remain material.",
        createdAt: "2026-07-20T11:00:00.000Z",
        updatedAt: "2026-07-20T11:30:00.000Z"
      }],
      evidenceRelationships: [{
        id: "claim_evidence_1",
        claimId: "claim_material",
        evidenceId: "evidence_1",
        relationship: "LIMITS",
        status: "ACTIVE",
        notes: "",
        createdAt: "2026-07-20T11:10:00.000Z",
        updatedAt: "2026-07-20T11:10:00.000Z",
        removedAt: "",
        removedReason: "",
        evidence: {
          id: "evidence_1",
          claim: "The public source covers only a broad fleet population.",
          status: "ACTIVE",
          evidenceAuthenticity: "REAL_WORLD",
          eligibleForRealWorldValidation: true
        }
      }]
    },
    currentDisposition: {
      systemRecommendation: "HUMAN_REAL_WORLD_INPUT_REQUIRED",
      humanDisposition: "PROCEED_UNDER_UNCERTAINTY",
      effectiveDisposition: "PROCEED_UNDER_UNCERTAINTY",
      rationale: "Public evidence is useful—but not decisive."
    },
    keyFindings: ["Preventive maintenance reduces—not eliminates—downtime."],
    propositionStatus: {
      status: "INSUFFICIENT_EVIDENCE",
      rationale: "The target population remains unmeasured.",
      validationProcessStatus: "EVALUATION_THRESHOLD_MET",
      validationProcessRationale: "Enough evidence existed to complete the evaluation, not validate the proposition.",
      disconfirmationFlag: "COMPLETE"
    },
    evidenceBase: {
      supporting: [{ claim: "Downtime is documented.", assessment: "Broad evidence only.", relationship: "SUPPORTS", reliability: "HIGH", sourceClassification: "PRIMARY_SOURCE", sourceCategory: "GOVERNMENT", population: "Broad fleet", sourceTitle: "Public source", sourceUrl: "https://example.com/source" }],
      contradictory: [], mixed: [], contextOnly: [], syntheticOrSimulated: []
    },
    sourceQualityAssessment: [],
    supportedConclusions: [],
    contradictoryOrLimitingEvidence: ["Applicability is narrow."],
    remainingAssumptions: [],
    evidenceGaps: ["Actual willingness to pay."],
    researchConducted: [{ question: "What exists?", executionStatus: "COMPLETED", evidenceOutcome: "MIXED_EVIDENCE_FOUND", propositionStatus: "INSUFFICIENT_EVIDENCE", findings: [], citations: [{ title: "Public source", url: "https://example.com/source" }] }],
    realWorldValidationRequired: ["Representative contractor operating records."],
    risksAndLimitations: ["Population applicability is incomplete."],
    humanDecisionsAndOverrides: [],
    recommendedNextAction: { disposition: "HUMAN_REAL_WORLD_INPUT_REQUIRED", action: "Collect operating records.", why: "Public sources cannot answer the narrow question." },
    confidenceReadinessSummary: []
  };
}

test("Final Report and Report JSON are distinct artifacts with correct formats", () => {
  const report = sampleReport();
  const human = createHumanReportArtifact(report);
  const data = createReportJsonArtifact(report);
  assert.match(human.filename, /\.html$/);
  assert.equal(human.mimeType, "text/html;charset=utf-8");
  assert.match(human.content, /<!doctype html>/i);
  assert.match(data.filename, /\.json$/);
  assert.equal(data.mimeType, "application/json;charset=utf-8");
  assert.deepEqual(JSON.parse(data.content).report, report);
});

test("human-readable report renders professional sections, citations, and readable enum labels", () => {
  const html = renderProjectReportHtml(sampleReport());
  for (const heading of [
    "Executive Summary", "Problem Definition", "Current Disposition", "Key Findings", "Core Claim Ledger", "Proposition Status",
    "Evidence Base", "Source Quality Assessment", "Supported Conclusions", "Contradictory / Limiting Evidence",
    "Remaining Assumptions", "Evidence Gaps", "Research Conducted", "Real-World Validation Required",
    "Risks and Limitations", "Human Decisions / Overrides", "Recommended Next Action",
    "Confidence / Readiness Summary", "References / Sources"
  ]) assert.match(html, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(html, /Human \/ Real-World Input Required/);
  assert.match(html, /https:\/\/example\.com\/source/);
  assert.match(html, /Explicit status:<\/strong> Disputed/);
  assert.match(html, /Limits:<\/strong> The public source covers only a broad fleet population/);
  assert.match(html, /not calculated from relationship counts/i);
  assert.equal(readableEnum("HUMAN_REAL_WORLD_INPUT_REQUIRED"), "Human / Real-World Input Required");
});

test("UTF-8 punctuation survives report HTML and JSON serialization without mojibake", () => {
  const report = sampleReport();
  const html = createHumanReportArtifact(report).content;
  const json = createReportJsonArtifact(report).content;
  for (const character of ["–", "—", "…", "“", "”"]) {
    assert.ok(html.includes(character), `HTML should preserve ${character}`);
    assert.ok(json.includes(character), `JSON should preserve ${character}`);
  }
  assert.doesNotMatch(html, /â€¦|â€“|â€”|â€œ|â€/);
  assert.doesNotMatch(json, /â€¦|â€“|â€”|â€œ|â€/);
});

test("human report separates synthetic test data from real-world Supporting Evidence", () => {
  const report = sampleReport();
  const syntheticClaim = "Synthetic acceptance-test dataset reports strong support.";
  report.evidenceBase.supporting = [];
  report.evidenceBase.syntheticOrSimulated = [{
    claim: syntheticClaim,
    assessment: "Synthetic method-validation fixture only.",
    collectionMethod: "SURVEY",
    reliability: "HIGH",
    sourceClassification: "PRIMARY_SOURCE",
    sourceCategory: "SURVEY"
  }];
  report.claimLedger.evidenceRelationships[0].evidence = {
    id: "evidence_1",
    claim: syntheticClaim,
    status: "ACTIVE",
    evidenceAuthenticity: "SYNTHETIC_SIMULATED",
    eligibleForRealWorldValidation: false
  };
  const html = renderProjectReportHtml(report);
  const supportingSection = html.slice(html.indexOf("<h3>Supporting Evidence</h3>"), html.indexOf("<h3>Contradictory Evidence</h3>"));
  const syntheticSection = html.slice(html.indexOf("<h3>Synthetic / Simulated Test Data</h3>"), html.indexOf("</section>", html.indexOf("<h3>Synthetic / Simulated Test Data</h3>")));

  assert.doesNotMatch(supportingSection, /Synthetic acceptance-test dataset/);
  assert.match(syntheticSection, /Synthetic acceptance-test dataset/);
  assert.match(syntheticSection, /Synthetic \/ Simulated/);
  assert.match(syntheticSection, /Test or method-validation only/);
  assert.match(syntheticSection, /Cannot validate real-world propositions/);
  assert.match(syntheticSection, /Cannot satisfy Human Gate/);
  assert.doesNotMatch(syntheticSection, /High<\/dd>|Primary Source/);
  const claimSection = html.slice(html.indexOf("<h2>Core Claim Ledger</h2>"), html.indexOf("</section>", html.indexOf("<h2>Core Claim Ledger</h2>")));
  assert.match(claimSection, /synthetic, removed, or otherwise ineligible for real-world validation/i);
  assert.match(claimSection, /Explicit status:<\/strong> Disputed/);
});
