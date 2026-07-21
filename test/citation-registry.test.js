import assert from "node:assert/strict";
import test from "node:test";
import {
  buildNativeCitationRegistry,
  normalizeCitationUrl,
  reconcileEvidenceWithNativeCitations
} from "../citation-registry.js";

function responseWithCitation(url, title = "Native title") {
  return {
    id: "resp_citation_registry",
    output: [{
      type: "message",
      content: [{ type: "output_text", text: "result", annotations: [{ type: "url_citation", url, title }] }]
    }]
  };
}

function externalOutput(sourceUrl) {
  return {
    newEvidence: [{
      claim: "A bounded external finding.",
      provenanceOrigin: "EXTERNAL_SOURCE",
      sourceTitle: "Model supplied title",
      sourceUrl
    }]
  };
}

test("exact evidence URL maps to a stable native citation ID and trusted source metadata", () => {
  const nativeUrl = "https://example.com/program?id=17";
  const registry = buildNativeCitationRegistry(responseWithCitation(nativeUrl, "Trusted native title"));
  const reconciled = reconcileEvidenceWithNativeCitations(externalOutput(nativeUrl), registry);
  assert.equal(reconciled.report.affectedEvidenceItems.length, 0);
  assert.equal(reconciled.output.newEvidence[0].sourceUrl, nativeUrl);
  assert.equal(reconciled.output.newEvidence[0].sourceTitle, "Trusted native title");
  assert.deepEqual(reconciled.output.newEvidence[0].citationIds, ["citation_resp_citation_registry_001"]);
  assert.equal(reconciled.output.newEvidence[0].citationMappingMethod, "EXACT_NATIVE_URL");
});

test("trailing slashes and fragments normalize without changing the trusted canonical URL", () => {
  const nativeUrl = "https://example.com/program/";
  const registry = buildNativeCitationRegistry(responseWithCitation(nativeUrl));
  const reconciled = reconcileEvidenceWithNativeCitations(externalOutput("https://example.com/program#eligibility"), registry);
  assert.equal(reconciled.report.affectedEvidenceItems.length, 0);
  assert.equal(reconciled.output.newEvidence[0].sourceUrl, nativeUrl);
  assert.equal(reconciled.output.newEvidence[0].citationMappingMethod, "NORMALIZED_NATIVE_URL");
});

test("known tracking parameters are ignored while substantive query parameters remain", () => {
  const nativeUrl = "https://example.com/terms?program=commercial&utm_source=chatgpt.com&fbclid=tracking";
  const submittedUrl = "https://example.com/terms?utm_campaign=research&program=commercial#coverage";
  assert.equal(normalizeCitationUrl(nativeUrl), "https://example.com/terms?program=commercial");
  assert.equal(normalizeCitationUrl(submittedUrl), "https://example.com/terms?program=commercial");
  const reconciled = reconcileEvidenceWithNativeCitations(externalOutput(submittedUrl), buildNativeCitationRegistry(responseWithCitation(nativeUrl)));
  assert.equal(reconciled.report.affectedEvidenceItems.length, 0);
  assert.equal(reconciled.output.newEvidence[0].sourceUrl, nativeUrl);
});

test("genuinely different external URLs are rejected and never silently remapped", () => {
  const registry = buildNativeCitationRegistry(responseWithCitation("https://example.com/terms?program=commercial"));
  const reconciled = reconcileEvidenceWithNativeCitations(externalOutput("https://example.com/terms?program=consumer"), registry);
  assert.equal(reconciled.report.mappedExternalItemCount, 0);
  assert.equal(reconciled.report.affectedEvidenceItems.length, 1);
  assert.match(reconciled.report.affectedEvidenceItems[0].reason, /no conservatively equivalent URL/i);
  assert.equal(reconciled.output.newEvidence[0].citationIds, undefined);
});

test("native citation IDs are deterministic within a response and duplicate native URLs collapse safely", () => {
  const response = responseWithCitation("https://example.com/program?utm_source=chatgpt.com");
  response.output.unshift({
    type: "web_search_call",
    action: { sources: [{ url: "https://example.com/program", title: "Consulted source" }] }
  });
  const first = buildNativeCitationRegistry(response);
  const second = buildNativeCitationRegistry(response);
  assert.equal(first.length, 1);
  assert.deepEqual(first, second);
  assert.deepEqual(first[0].nativeOrigins.sort(), ["URL_CITATION", "WEB_SEARCH_SOURCE"]);
});
