import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { createRuntime, createServer } from "../server.js";
import {
  applyMethodOverride,
  createDemoCycle,
  createDemoRouting,
  initializeProject
} from "../rethink-engine.js";

function publicResearchOutput(state, routing, sourceUrl = "https://example.com/authoritative-source") {
  const output = createDemoCycle(state, routing);
  output.reasoning.sourceType = "EXTERNAL_RESEARCH";
  output.reasoning.evidenceQuality = "MODERATE";
  output.reasoning.conclusion = "The public evidence narrows the proposition but does not establish the final demand claim.";
  output.newEvidence = [{
    claim: "A primary public source documents a narrower existing solution.",
    intakeType: "PUBLIC_SOURCE_FINDING",
    provenanceOrigin: "EXTERNAL_SOURCE",
    sourceClassification: "PRIMARY_SOURCE",
    sourceCategory: "CORPORATE_DISCLOSURE",
    sourceTitle: "Authoritative program terms",
    sourceUrl,
    assessment: "The finding shows partial existing coverage and narrows the remaining gap.",
    reliability: "HIGH",
    relationship: "MIXED",
    sourceDate: "2026-07-18",
    population: "Customers eligible under the published terms",
    collectionMethod: "WEB_PUBLIC_SOURCE_RESEARCH",
    methodDetails: "Bounded supporting and disconfirming public-source review",
    observation: "Existing coverage is conditional rather than comprehensive.",
    assumptionIds: [state.assumptions[0].id],
    questionRefs: [routing.highestLeverageQuestion]
  }];
  output.evidenceEvaluation.evaluationThresholdMet = true;
  output.evidenceEvaluation.evaluationThresholdRationale = "The acquired primary source is sufficient to complete this bounded evaluation, not to validate the proposition.";
  output.evidenceEvaluation.propositionStatus = "PARTIALLY_SUPPORTED";
  output.evidenceEvaluation.propositionStatusRationale = "A narrower existing solution is established; unmet demand remains unresolved.";
  output.evidenceEvaluation.disconfirmation = {
    searchStatus: "SEARCHED_FOUND",
    strongestSupportingEvidence: "The program does not cover every uptime scenario.",
    strongestContradictoryEvidence: "The program already covers a meaningful subset of failures.",
    strongestLimitation: "Published terms do not establish customer willingness to pay.",
    evidenceThatWouldChangeConclusion: "Representative purchase behavior from the target population.",
    flag: "COMPLETE"
  };
  return output;
}

function completedBackgroundBody(output, responseId, sourceUrl) {
  return {
    id: responseId,
    status: "completed",
    model: "gpt-5.6-sol",
    output: [
      { type: "web_search_call", status: "completed", action: { type: "search", query: "bounded validation", sources: [{ url: sourceUrl, title: "Authoritative program terms" }] } },
      { type: "message", content: [{ type: "output_text", text: JSON.stringify(output), annotations: [{ type: "url_citation", url: sourceUrl, title: "Authoritative program terms" }] }] }
    ]
  };
}

async function withServer(run) {
  const server = createServer({ apiKey: "" });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("HTTP demo flow initializes, routes, executes, and preserves continuity", async () => {
  await withServer(async (baseUrl) => {
    const status = await fetch(`${baseUrl}/api/status`).then((response) => response.json());
    assert.equal(status.demoAvailable, true);
    assert.equal(status.liveAvailable, false);

    const createdResponse = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: "I think Florida-based disabled veterans could provide lower-cost remote work for companies." })
    });
    assert.equal(createdResponse.status, 201);
    const { state } = await createdResponse.json();
    assert.equal(state.domainProfile, "BUSINESS");
    assert.equal(state.domainProfileVersion, "1.0.0");

    const route = await fetch(`${baseUrl}/api/rethink/route`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state, mode: "demo" })
    }).then((response) => response.json());
    assert.equal(route.routing.selectedMethod, "DEFINE");

    const cycle = await fetch(`${baseUrl}/api/rethink/cycle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state, routing: route.routing, mode: "demo" })
    }).then((response) => response.json());
    assert.equal(cycle.state.cycle, 1);
    assert.equal(cycle.state.notebook.length, 1);

    const nextRoute = await fetch(`${baseUrl}/api/rethink/route`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: cycle.state, mode: "demo" })
    }).then((response) => response.json());
    assert.equal(nextRoute.routing.selectedMethod, "VALIDATE");
  });
});

test("HTTP live errors are explicit and keep Demo Mode available", async () => {
  await withServer(async (baseUrl) => {
    const { state } = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: "This problem is long enough to initialize." })
    }).then((response) => response.json());
    const response = await fetch(`${baseUrl}/api/rethink/route`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state, mode: "live" })
    });
    const payload = await response.json();
    assert.equal(response.status, 503);
    assert.equal(payload.error.code, "LIVE_MODE_UNAVAILABLE");
    assert.equal(payload.error.demoAvailable, true);
  });
});

test("HTTP state management persists linked edits and rejects untraced changes", async () => {
  await withServer(async (baseUrl) => {
    const { state } = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: "A product idea has an uncertain customer need that should be examined first." })
    }).then((response) => response.json());

    const response = await fetch(`${baseUrl}/api/rethink/state`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        state,
        operation: {
          type: "UPSERT_EVIDENCE",
          reason: "Captured during customer discovery.",
          item: {
            claim: "Three prospective users described the same unresolved workflow delay.",
            sourceType: "USER_INPUT",
            sourceTitle: "Discovery notes",
            sourceUrl: "",
            assessment: "Directional evidence that the problem exists, not yet evidence of willingness to pay.",
            assumptionIds: [state.assumptions[0].id],
            questionRefs: ["Does this problem recur often enough to matter?"]
          }
        }
      })
    });
    assert.equal(response.status, 200);
    const updated = await response.json();
    assert.equal(updated.state.evidence.length, 1);
    assert.deepEqual(updated.state.evidence[0].assumptionIds, [state.assumptions[0].id]);
    assert.deepEqual(updated.state.assumptions[0].evidenceIds, [updated.state.evidence[0].id]);
    assert.equal(updated.state.stateEvents.length, 1);
    assert.equal(updated.state.notebook.at(-1).entryType, "STATE_EDIT");

    const invalid = await fetch(`${baseUrl}/api/rethink/state`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        state: updated.state,
        operation: { type: "REMOVE_EVIDENCE", id: updated.state.evidence[0].id, reason: "" }
      })
    });
    assert.equal(invalid.status, 400);
  });
});

test("HTTP state management creates claims and canonical evidence relationships without breaking input-only project creation", async () => {
  await withServer(async (baseUrl) => {
    const created = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: "A material workflow claim needs explicit evidence relationships." })
    }).then((response) => response.json());
    assert.deepEqual(created.state.claimLedger, { version: 1, claims: [], evidenceRelationships: [] });

    const evidence = await fetch(`${baseUrl}/api/rethink/state`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        state: created.state,
        operation: {
          type: "UPSERT_EVIDENCE",
          reason: "Observed evidence for the HTTP Claim Ledger contract.",
          item: {
            claim: "A bounded observation bears on the workflow claim.",
            intakeType: "TEST_RESULT",
            provenanceOrigin: "USER_INPUT",
            reliability: "MODERATE",
            relationship: "NONE_UNLINKED",
            assessment: "HTTP contract fixture.",
            assumptionIds: [],
            questionRefs: []
          }
        }
      })
    }).then((response) => response.json());
    const claimResponse = await fetch(`${baseUrl}/api/rethink/state`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        state: evidence.state,
        operation: {
          type: "UPSERT_CLAIM",
          reason: "Created through the existing Core state-management boundary.",
          item: { text: "The workflow delay is material.", status: "UNKNOWN" }
        }
      })
    });
    assert.equal(claimResponse.status, 200);
    const claim = await claimResponse.json();
    const linkResponse = await fetch(`${baseUrl}/api/rethink/state`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        state: claim.state,
        operation: {
          type: "UPSERT_CLAIM_EVIDENCE_RELATIONSHIP",
          reason: "Linked through the canonical state reducer.",
          item: {
            claimId: claim.claim.id,
            evidenceId: claim.state.evidence[0].id,
            relationship: "SUPPORTS"
          }
        }
      })
    });
    assert.equal(linkResponse.status, 200);
    const linked = await linkResponse.json();
    assert.equal(linked.state.claimLedger.claims.length, 1);
    assert.equal(linked.state.claimLedger.evidenceRelationships.length, 1);
    assert.equal(linked.state.claimLedger.claims[0].status, "UNKNOWN");
    assert.equal(linked.state.claimLedger.evidenceRelationships[0].relationship, "SUPPORTS");
    assert.equal(linked.state.stateEvents.at(-1).entityType, "CLAIM_EVIDENCE_RELATIONSHIP");
  });
});

test("static application is served", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /Run Rethink/);
    assert.match(html, /Highest-leverage unanswered question/);
    assert.match(html, /id="resumeRethinkButton"/);
    assert.match(html, /id="projectImportInput"/);
    assert.match(html, /id="researchErrorStage"/);
    assert.match(html, /id="researchCitationFailureList"/);
    assert.match(html, /Import Project Backup/);
    assert.match(html, /Export Project Backup/);
    assert.match(html, /Download Final Report/);
    assert.match(html, /Download Report JSON/);
    assert.match(html, /id="reasoningProgressPanel"/);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("x-frame-options"), "DENY");
  });
});

test("health and module registry endpoints expose deployable runtime metadata", async () => {
  await withServer(async (baseUrl) => {
    const healthResponse = await fetch(`${baseUrl}/api/health`);
    const health = await healthResponse.json();
    assert.equal(healthResponse.status, 200);
    assert.equal(health.status, "ok");
    assert.equal(health.service, "rethink-core");

    const status = await fetch(`${baseUrl}/api/status`).then((response) => response.json());
    assert.ok(status.backgroundReasoningMethods.includes("TEST"));
    assert.ok(!status.backgroundReasoningMethods.includes("DEFINE"));
    assert.equal(status.longReasoningMaxOutputTokens, 12000);
    assert.equal(status.defaultDomainProfile, "BUSINESS");
    assert.deepEqual(status.domainProfiles.map((profile) => profile.id), ["BUSINESS", "GENERAL", "APPS", "NEWS"]);
    assert.deepEqual(status.domainProfiles.filter((profile) => profile.operational).map((profile) => profile.id), ["BUSINESS"]);
    assert.equal(status.domainProfiles.find((profile) => profile.id === "NEWS").availability, "PLANNED");

    const moduleResponse = await fetch(`${baseUrl}/api/modules`);
    const registry = await moduleResponse.json();
    assert.ok(registry.modules.length >= 14);
    assert.ok(registry.modules.some((module) => module.id === "VALIDATE" && module.version));
  });
});

test("project creation distinguishes active, known unavailable, and unknown domain profiles", async () => {
  await withServer(async (baseUrl) => {
    const explicitResponse = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: "A business project needs an explicit supported profile assignment.",
        domainProfile: "BUSINESS",
        domainProfileVersion: "1.0.0"
      })
    });
    assert.equal(explicitResponse.status, 201);
    const explicit = await explicitResponse.json();
    assert.equal(explicit.state.domainProfile, "BUSINESS");

    const unavailableResponse = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: "A news investigation is deliberately unavailable during Branch 1.",
        domainProfile: "NEWS"
      })
    });
    const unavailable = await unavailableResponse.json();
    assert.equal(unavailableResponse.status, 400);
    assert.equal(unavailable.error.code, "DOMAIN_PROFILE_UNAVAILABLE");
    assert.match(unavailable.error.message, /known but unavailable/i);

    const unknownResponse = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: "An unknown profile must fail differently from a planned profile.",
        domainProfile: "BANANA"
      })
    });
    const unknown = await unknownResponse.json();
    assert.equal(unknownResponse.status, 400);
    assert.equal(unknown.error.code, "UNKNOWN_DOMAIN_PROFILE");
    assert.match(unknown.error.message, /unknown domain profile/i);
  });
});

test("versioned project backups import through the HTTP boundary", async () => {
  await withServer(async (baseUrl) => {
    const { state } = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: "A durable product concept needs a portable project backup." })
    }).then((response) => response.json());
    const backup = {
      format: "rethink.project.backup",
      formatVersion: 2,
      exportedAt: "2026-07-18T12:00:00.000Z",
      projectId: state.id,
      project: state,
      runtimeSession: { routing: null, result: null, research: null, reasoning: null, report: null, mode: "demo" }
    };
    const response = await fetch(`${baseUrl}/api/projects/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ backup })
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.state.id, state.id);
    assert.equal(payload.state.importHistory.length, 1);
    assert.equal(payload.runtimeSession.mode, "demo");
  });
});

test("live research without native citation metadata is rejected", async () => {
  const state = initializeProject("A current market claim needs external validation before investment.");
  const routing = applyMethodOverride(createDemoRouting(state), "VALIDATE", state);
  const output = createDemoCycle(state, routing);
  const runtime = createRuntime({
    apiKey: "test-key",
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          id: "resp_missing_citations",
          model: "gpt-5.6-sol",
          output: [
            { type: "web_search_call", status: "completed", action: { type: "search", query: "market evidence" } },
            { type: "message", content: [{ type: "output_text", text: JSON.stringify(output), annotations: [] }] }
          ]
        };
      }
    })
  });
  await assert.rejects(
    () => runtime.cycle({ state, routing, mode: "live" }),
    (error) => error.code === "CITATION_VALIDATION_FAILED"
  );
});

test("public-research routes fail closed when no web-search call occurred", async () => {
  const state = initializeProject("A current market claim needs external validation before investment.");
  const routing = applyMethodOverride(createDemoRouting(state), "VALIDATE", state);
  const output = createDemoCycle(state, routing);
  output.reasoning.sourceType = "EXTERNAL_RESEARCH";
  output.newEvidence = [{
    claim: "An unsupported external-looking claim.",
    intakeType: "PUBLIC_SOURCE_FINDING",
    provenanceOrigin: "EXTERNAL_SOURCE",
    sourceClassification: "SECONDARY_SOURCE",
    sourceCategory: "MARKET_RESEARCH",
    reliability: "MODERATE",
    relationship: "SUPPORTS",
    sourceTitle: "Invented source",
    sourceUrl: "https://example.com/invented",
    sourceDate: "2026-07-18",
    population: "Public market",
    collectionMethod: "WEB_PUBLIC_SOURCE_RESEARCH",
    methodDetails: "Web search",
    observation: "An unsupported external-looking claim.",
    assessment: "Appears relevant.",
    assumptionIds: [],
    questionRefs: [routing.highestLeverageQuestion]
  }];
  const runtime = createRuntime({
    apiKey: "test-key",
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          id: "resp_no_search",
          model: "gpt-5.6-sol",
          output: [
            { type: "message", content: [{ type: "output_text", text: JSON.stringify(output), annotations: [] }] }
          ]
        };
      }
    })
  });
  await assert.rejects(
    () => runtime.cycle({ state, routing, mode: "live" }),
    (error) => error.code === "PUBLIC_RESEARCH_NOT_COMPLETED"
  );
});

test("public research creates cited structured evidence linked to the active question and assumption", async () => {
  const state = initializeProject("Determine whether commercial equipment uptime services already exist in fragmented dealer and manufacturer programs.");
  const routing = applyMethodOverride(createDemoRouting(state), "VALIDATE", state);
  const output = createDemoCycle(state, routing);
  const sourceUrl = "https://example.com/public-program-terms";
  output.reasoning.sourceType = "EXTERNAL_RESEARCH";
  output.reasoning.evidenceQuality = "MODERATE";
  output.reasoning.conclusion = "Public program terms show a partial uptime offering, but not a complete bundled guarantee.";
  output.newEvidence = [{
    claim: "A provider publicly offers replacement equipment for a defined subset of covered repairs.",
    intakeType: "PUBLIC_SOURCE_FINDING",
    provenanceOrigin: "EXTERNAL_SOURCE",
    sourceClassification: "PRIMARY_SOURCE",
    sourceCategory: "COMPANY_WEBSITE",
    reliability: "MODERATE",
    relationship: "MIXED",
    sourceTitle: "Public provider program terms",
    sourceUrl,
    sourceDate: "2026-07-18",
    population: "Commercial equipment customers covered by the published program",
    collectionMethod: "WEB_PUBLIC_SOURCE_RESEARCH",
    methodDetails: "Authoritative public-source review",
    observation: "Replacement access is conditional and narrower than a general uptime subscription.",
    assessment: "This supports market adjacency while leaving fragmentation and purchase demand unresolved.",
    assumptionIds: [state.assumptions[0].id],
    questionRefs: [routing.highestLeverageQuestion]
  }];
  const runtime = createRuntime({
    apiKey: "test-key",
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          id: "resp_public_research",
          model: "gpt-5.6-sol",
          output: [
            { type: "web_search_call", status: "completed", action: { type: "search", query: "commercial equipment uptime program", sources: [{ url: sourceUrl, title: "Public provider program terms" }] } },
            { type: "message", content: [{ type: "output_text", text: JSON.stringify(output), annotations: [{ type: "url_citation", url: sourceUrl, title: "Public provider program terms" }] }] }
          ]
        };
      }
    })
  });
  const completed = await runtime.cycle({ state, routing, mode: "live" });
  assert.equal(completed.state.evidence.length, 1);
  assert.equal(completed.state.evidence[0].intakeType, "PUBLIC_SOURCE_FINDING");
  assert.equal(completed.state.evidence[0].sourceUrl, sourceUrl);
  assert.deepEqual(completed.state.evidence[0].assumptionIds, [state.assumptions[0].id]);
  assert.ok(completed.state.evidence[0].questionRefs.includes(routing.highestLeverageQuestion));
  assert.deepEqual(completed.state.assumptions[0].evidenceIds, [completed.state.evidence[0].id]);
  assert.equal(completed.result.citations.length, 1);
  assert.equal(completed.result.citations[0].url, sourceUrl);
  assert.equal(completed.result.citations[0].title, "Public provider program terms");
  assert.match(completed.result.citations[0].id, /^citation_resp_public_research_/);
  assert.deepEqual(completed.state.evidence[0].citationIds, [completed.result.citations[0].id]);
});

test("unmatched evidence URL is classified as CITATION_VALIDATION_FAILED and a corrected retry ingests once", async () => {
  const state = initializeProject("Determine which construction-equipment uptime offerings already exist before testing contractor demand.");
  const routing = applyMethodOverride(createDemoRouting(state), "VALIDATE", state);
  const nativeUrl = "https://example.com/construction-uptime?program=commercial&utm_source=chatgpt.com";
  const unsupportedUrl = "https://unrelated.example.net/invented-program";
  const rejectedOutput = publicResearchOutput(state, routing, unsupportedUrl);
  const acceptedOutput = publicResearchOutput(state, routing, "https://example.com/construction-uptime?program=commercial");
  const responses = [
    completedBackgroundBody(rejectedOutput, "resp_citation_rejected", nativeUrl),
    completedBackgroundBody(acceptedOutput, "resp_citation_retry", nativeUrl)
  ];
  const runtime = createRuntime({
    apiKey: "test-key",
    fetchImpl: async () => ({ ok: true, status: 200, async json() { return responses.shift(); } })
  });

  const failed = await runtime.startResearch({ state, routing });
  assert.equal(failed.status, "FAILED");
  assert.equal(failed.errorCode, "CITATION_VALIDATION_FAILED");
  assert.equal(failed.state.evidence.length, 0);
  assert.equal(failed.state.cycle, 0);
  const failure = failed.state.researchHistory[0];
  assert.equal(failure.failureCode, "CITATION_VALIDATION_FAILED");
  assert.equal(failure.incompleteResponseMetadata.failureStage, "CITATION_POST_PROCESSING");
  assert.equal(failure.incompleteResponseMetadata.nativeCitationCount, 1);
  assert.equal(failure.incompleteResponseMetadata.submittedEvidenceItemCount, 1);
  assert.equal(failure.incompleteResponseMetadata.affectedEvidenceItems.length, 1);
  assert.equal(failure.incompleteResponseMetadata.affectedEvidenceItems[0].submittedSourceUrl, unsupportedUrl);
  assert.match(failure.errorLog[0].humanReadableSummary, /reached citation post-processing/i);
  assert.doesNotMatch(JSON.stringify(failed.state), /citationIds/);

  const retried = await runtime.startResearch({ state: failed.state, routing, previousResearch: failed.research });
  assert.equal(retried.status, "COMPLETED");
  assert.equal(retried.state.evidence.length, 1);
  assert.equal(retried.state.evidence[0].sourceUrl, nativeUrl);
  assert.equal(retried.state.evidence[0].submittedSourceUrl, "https://example.com/construction-uptime?program=commercial");
  assert.equal(retried.state.evidence[0].citationIds.length, 1);

  const duplicate = await runtime.pollResearch({ state: retried.state, routing, research: retried.research });
  assert.equal(duplicate.status, "ALREADY_INGESTED");
  assert.equal(duplicate.state.evidence.length, 1);
});

test("background public research survives polling delay and ingests exactly once", async () => {
  const state = initializeProject("A current public proposition must be researched before asking for private demand evidence.");
  const routing = applyMethodOverride(createDemoRouting(state), "VALIDATE", state);
  const sourceUrl = "https://example.com/authoritative-source";
  const output = publicResearchOutput(state, routing, sourceUrl);
  const responses = [
    { id: "resp_delayed_research", status: "queued", model: "gpt-5.6-sol" },
    { id: "resp_delayed_research", status: "in_progress", model: "gpt-5.6-sol" },
    completedBackgroundBody(output, "resp_delayed_research", sourceUrl)
  ];
  const runtime = createRuntime({
    apiKey: "test-key",
    fetchImpl: async () => ({ ok: true, status: 200, async json() { return responses.shift(); } })
  });
  const started = await runtime.startResearch({ state, routing });
  assert.equal(started.status, "QUEUED");
  assert.equal(started.research.status, "QUEUED");
  const running = await runtime.pollResearch({ state, routing, research: started.research });
  assert.equal(running.status, "IN_PROGRESS");
  const completed = await runtime.pollResearch({ state, routing, research: running.research });
  assert.equal(completed.status, "COMPLETED");
  assert.equal(completed.state.evidence.length, 1);
  assert.equal(completed.state.researchHistory.length, 1);
  assert.equal(completed.state.researchHistory[0].responseId, "resp_delayed_research");
  assert.ok(completed.result.evidenceEvaluation.considered.some((item) => item.evidenceId === completed.state.evidence[0].id));

  const duplicate = await runtime.pollResearch({ state: completed.state, routing, research: completed.research });
  assert.equal(duplicate.status, "ALREADY_INGESTED");
  assert.equal(duplicate.state.evidence.length, 1);
});

test("hung background research preserves state and supports a bounded safe retry", async () => {
  const state = initializeProject("A public proposition needs a bounded research retry policy.");
  const routing = applyMethodOverride(createDemoRouting(state), "VALIDATE", state);
  let currentTime = new Date("2026-07-18T12:00:00.000Z");
  let responseNumber = 0;
  const runtime = createRuntime({
    apiKey: "test-key",
    now: () => currentTime,
    researchMaxAgeMs: 60_000,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        responseNumber += 1;
        return { id: `resp_retry_${responseNumber}`, status: "queued", model: "gpt-5.6-sol" };
      }
    })
  });
  const started = await runtime.startResearch({ state, routing });
  currentTime = new Date("2026-07-18T12:01:01.000Z");
  const hung = await runtime.pollResearch({ state, routing, research: started.research });
  assert.equal(hung.status, "HUNG");
  assert.equal(hung.retrySafe, true);
  assert.equal(state.evidence.length, 0);

  const retried = await runtime.startResearch({ state, routing, previousResearch: hung.research });
  assert.equal(retried.status, "QUEUED");
  assert.equal(retried.research.retryCount, 1);
  assert.notEqual(retried.research.responseId, started.research.responseId);
  assert.equal(retried.research.researchKey, started.research.researchKey);
});

test("output-token exhaustion is classified, ingests no partial evidence, and retries with a larger bounded budget", async () => {
  const state = initializeProject("A restaurant demand proposition needs balanced public research before a real-world customer test.");
  const routing = applyMethodOverride(createDemoRouting(state), "VALIDATE", state);
  const partialMarker = "PARTIAL_RESTAURANT_EVIDENCE_MUST_NOT_ENTER_STATE";
  const responseBodies = [
    { id: "resp_restaurant_limit", status: "queued", model: "gpt-5.6-sol" },
    {
      id: "resp_restaurant_limit",
      status: "incomplete",
      model: "gpt-5.6-sol",
      incomplete_details: { reason: "max_output_tokens" },
      max_output_tokens: 32000,
      usage: { input_tokens: 8500, output_tokens: 32000, output_tokens_details: { reasoning_tokens: 11000 }, total_tokens: 40500 },
      output: [
        { type: "web_search_call", status: "completed", action: { type: "search", query: "restaurant demand" } },
        { type: "message", status: "in_progress", content: [{ type: "output_text", text: partialMarker }] }
      ]
    },
    { id: "resp_restaurant_retry", status: "queued", model: "gpt-5.6-sol" }
  ];
  const postedBodies = [];
  const runtime = createRuntime({
    apiKey: "test-key",
    researchMaxOutputTokens: 32000,
    researchRetryMaxOutputTokens: 64000,
    fetchImpl: async (_url, options = {}) => {
      if (options.method === "POST") postedBodies.push(JSON.parse(options.body));
      return { ok: true, status: 200, async json() { return responseBodies.shift(); } };
    }
  });

  const started = await runtime.startResearch({ state, routing });
  assert.equal(started.research.maxOutputTokens, 32000);
  const failed = await runtime.pollResearch({ state, routing, research: started.research });
  assert.equal(failed.status, "FAILED");
  assert.equal(failed.errorCode, "RESEARCH_OUTPUT_LIMIT_REACHED");
  assert.equal(failed.executionStatus, "FAILED_TECHNICALLY");
  assert.equal(failed.evidenceOutcome, "NOT_EVALUATED");
  assert.equal(failed.state.evidence.length, 0);
  assert.equal(failed.state.researchHistory.length, 1);
  assert.equal(failed.state.researchHistory[0].failureCode, "RESEARCH_OUTPUT_LIMIT_REACHED");
  assert.equal(failed.state.researchHistory[0].incompleteResponseMetadata.incompleteDetails.reason, "max_output_tokens");
  assert.equal(failed.state.researchHistory[0].incompleteResponseMetadata.maxOutputTokens, 32000);
  assert.equal(failed.state.researchHistory[0].errorLog[0].errorCode, "RESEARCH_OUTPUT_LIMIT_REACHED");
  assert.doesNotMatch(JSON.stringify(failed.state), new RegExp(partialMarker));
  assert.equal(failed.state.questions.find((item) => item.text === routing.highestLeverageQuestion).status, "ACTIVE");

  const retried = await runtime.startResearch({
    state: failed.state,
    routing,
    previousResearch: failed.research
  });
  assert.equal(retried.status, "QUEUED");
  assert.equal(retried.research.retryCount, 1);
  assert.equal(retried.research.previousMaxOutputTokens, 32000);
  assert.equal(retried.research.maxOutputTokens, 64000);
  assert.equal(retried.state, undefined);
  assert.equal(failed.state.evidence.length, 0);
  assert.equal(failed.state.researchHistory.length, 1);
  assert.deepEqual(postedBodies.map((body) => body.max_output_tokens), [32000, 64000]);
  assert.ok(postedBodies.every((body) => body.text.verbosity === "low"));
});

test("background research technical failure persists a secret-safe log without creating evidence", async () => {
  const state = initializeProject("A public claim requires research, but execution failure must not trap the project.");
  const routing = applyMethodOverride(createDemoRouting(state), "VALIDATE", state);
  const runtime = createRuntime({
    apiKey: "test-key",
    fetchImpl: async () => { throw new Error("Authorization: Bearer sk-super-secret-token connection reset"); }
  });

  const failed = await runtime.startResearch({ state, routing });
  assert.equal(failed.status, "FAILED");
  assert.equal(failed.executionStatus, "FAILED_TECHNICALLY");
  assert.equal(failed.evidenceOutcome, "NOT_EVALUATED");
  assert.equal(failed.errorCode, "RESEARCH_API_FAILED");
  assert.equal(failed.state.evidence.length, 0);
  assert.equal(failed.state.researchHistory.length, 1);
  assert.equal(failed.state.researchHistory[0].executionStatus, "FAILED_TECHNICALLY");
  assert.equal(failed.state.researchHistory[0].evidenceOutcome, "NOT_EVALUATED");
  assert.doesNotMatch(JSON.stringify(failed), /sk-super-secret-token/);
  assert.match(failed.state.researchHistory[0].errorLog[0].technicalError, /could not reach OpenAI/i);
  assert.equal(failed.state.questions.find((item) => item.text === routing.highestLeverageQuestion).status, "ACTIVE");
});

test("invalid completed research output is classified separately from API and citation failures", async () => {
  const state = initializeProject("A construction market proposition needs a schema-valid research result.");
  const routing = applyMethodOverride(createDemoRouting(state), "VALIDATE", state);
  const runtime = createRuntime({
    apiKey: "test-key",
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          id: "resp_invalid_research_schema",
          status: "completed",
          model: "gpt-5.6-sol",
          output: [
            { type: "web_search_call", status: "completed", action: { sources: [] } },
            { type: "message", content: [{ type: "output_text", text: "{not-valid-json", annotations: [] }] }
          ]
        };
      }
    })
  });

  const failed = await runtime.startResearch({ state, routing });
  assert.equal(failed.errorCode, "RESEARCH_OUTPUT_SCHEMA_FAILED");
  assert.equal(failed.state.evidence.length, 0);
  assert.equal(failed.research.failureMetadata.failureStage, "STRUCTURED_OUTPUT_VALIDATION");
});

test("post-citation canonical state failure is classified as EVIDENCE_INGESTION_FAILED", async () => {
  const state = initializeProject("A construction-equipment finding must link only to assumptions in this project.");
  const routing = applyMethodOverride(createDemoRouting(state), "VALIDATE", state);
  const sourceUrl = "https://example.com/validated-construction-program";
  const output = publicResearchOutput(state, routing, sourceUrl);
  output.newEvidence[0].assumptionIds = ["assumption_from_another_project"];
  const runtime = createRuntime({
    apiKey: "test-key",
    fetchImpl: async () => ({ ok: true, status: 200, async json() { return completedBackgroundBody(output, "resp_ingestion_failure", sourceUrl); } })
  });

  const failed = await runtime.startResearch({ state, routing });
  assert.equal(failed.errorCode, "EVIDENCE_INGESTION_FAILED");
  assert.equal(failed.state.evidence.length, 0);
  assert.equal(failed.research.failureMetadata.failureStage, "CANONICAL_STATE_INGESTION");
  assert.match(failed.research.errorLog[0].humanReadableSummary, /canonical project-state ingestion failed/i);
});

test("successful bounded search with no relevant finding is completed and inconclusive, not failed", async () => {
  const state = initializeProject("A bounded public search may complete without finding applicable evidence.");
  const routing = applyMethodOverride(createDemoRouting(state), "VALIDATE", state);
  const output = createDemoCycle(state, routing);
  output.newEvidence = [];
  const sourceUrl = "https://example.com/bounded-search-record";
  const runtime = createRuntime({
    apiKey: "test-key",
    fetchImpl: async () => ({ ok: true, status: 200, async json() { return completedBackgroundBody(output, "resp_no_relevant", sourceUrl); } })
  });

  const completed = await runtime.startResearch({ state, routing });
  assert.equal(completed.status, "COMPLETED");
  assert.equal(completed.executionStatus, "COMPLETED");
  assert.equal(completed.evidenceOutcome, "NO_RELEVANT_EVIDENCE_FOUND");
  assert.equal(completed.state.evidence.length, 0);
  assert.equal(completed.state.researchHistory[0].executionStatus, "COMPLETED");
  assert.equal(completed.state.researchHistory[0].evidenceOutcome, "NO_RELEVANT_EVIDENCE_FOUND");
  assert.equal(completed.state.questions.find((item) => item.text === routing.highestLeverageQuestion).status, "ACTIVE");
});

test("supporting research outcome does not automatically validate the proposition", async () => {
  const state = initializeProject("A public proposition needs supporting and disconfirming evidence before judgment.");
  const routing = applyMethodOverride(createDemoRouting(state), "VALIDATE", state);
  const sourceUrl = "https://example.com/supporting-source";
  const output = publicResearchOutput(state, routing, sourceUrl);
  output.newEvidence[0].relationship = "SUPPORTS";
  output.evidenceEvaluation.propositionStatus = "PARTIALLY_SUPPORTED";
  const runtime = createRuntime({
    apiKey: "test-key",
    fetchImpl: async () => ({ ok: true, status: 200, async json() { return completedBackgroundBody(output, "resp_support_only", sourceUrl); } })
  });

  const completed = await runtime.startResearch({ state, routing });
  assert.equal(completed.evidenceOutcome, "SUPPORTING_EVIDENCE_FOUND");
  assert.equal(completed.result.evidenceEvaluation.propositionStatus, "PARTIALLY_SUPPORTED");
  assert.notEqual(completed.result.evidenceEvaluation.propositionStatus, "VALIDATED");
});

test("cancelled background research is non-evidentiary and leaves the question unresolved", async () => {
  const state = initializeProject("A public research job may be cancelled without changing proposition status.");
  const routing = applyMethodOverride(createDemoRouting(state), "VALIDATE", state);
  const responses = [
    { id: "resp_cancelled_research", status: "queued", model: "gpt-5.6-sol" },
    { id: "resp_cancelled_research", status: "cancelled", model: "gpt-5.6-sol" }
  ];
  const runtime = createRuntime({
    apiKey: "test-key",
    fetchImpl: async () => ({ ok: true, status: 200, async json() { return responses.shift(); } })
  });

  const started = await runtime.startResearch({ state, routing });
  const cancelled = await runtime.pollResearch({ state, routing, research: started.research });
  assert.equal(cancelled.status, "CANCELLED");
  assert.equal(cancelled.executionStatus, "CANCELLED");
  assert.equal(cancelled.evidenceOutcome, "NOT_EVALUATED");
  assert.equal(cancelled.state.evidence.length, 0);
  assert.equal(cancelled.state.questions.find((item) => item.text === routing.highestLeverageQuestion).status, "ACTIVE");
});

test("project report endpoint returns a conservative evidence report", async () => {
  await withServer(async (baseUrl) => {
    const { state } = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: "An incomplete business proposition still needs a professional report." })
    }).then((response) => response.json());
    const response = await fetch(`${baseUrl}/api/projects/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state })
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.report.projectId, state.id);
    assert.equal(payload.report.evidenceBase.totalObservedItems, 0);
    assert.equal(payload.report.propositionStatus.status, "INSUFFICIENT_EVIDENCE");
    assert.match(payload.report.executiveSummary, /no observed evidence/i);
  });
});
