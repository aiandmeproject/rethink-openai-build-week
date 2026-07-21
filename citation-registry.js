const TRACKING_PARAMETERS = new Set([
  "dclid",
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "msclkid",
  "ref_src",
  "s_cid",
  "vero_conv",
  "vero_id",
  "wickedid",
  "yclid",
  "_ga",
  "_gl"
]);

function isTrackingParameter(name) {
  const normalized = String(name || "").toLowerCase();
  return normalized.startsWith("utm_") || TRACKING_PARAMETERS.has(normalized);
}

export function normalizeCitationUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = new URL(value.trim());
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    parsed.hash = "";
    for (const key of [...parsed.searchParams.keys()]) {
      if (isTrackingParameter(key)) parsed.searchParams.delete(key);
    }
    const remainingParameters = [...parsed.searchParams.entries()]
      .sort(([leftKey, leftValue], [rightKey, rightValue]) => leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue));
    parsed.search = "";
    for (const [key, parameterValue] of remainingParameters) parsed.searchParams.append(key, parameterValue);
    if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    return parsed.href;
  } catch {
    return null;
  }
}

function safeCitationIdPart(value) {
  return String(value || "response").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80) || "response";
}

export function buildNativeCitationRegistry(response) {
  const candidates = [];
  for (const item of response?.output || []) {
    for (const content of item.content || []) {
      for (const annotation of content.annotations || []) {
        if (annotation.type === "url_citation" && annotation.url) {
          candidates.push({
            url: annotation.url,
            title: annotation.title || annotation.url,
            nativeOrigin: "URL_CITATION"
          });
        }
      }
    }
    for (const source of item.action?.sources || []) {
      if (source.url) {
        candidates.push({
          url: source.url,
          title: source.title || source.url,
          nativeOrigin: "WEB_SEARCH_SOURCE"
        });
      }
    }
  }

  const responsePart = safeCitationIdPart(response?.id);
  const byNormalizedUrl = new Map();
  for (const candidate of candidates) {
    const normalizedUrl = normalizeCitationUrl(candidate.url);
    if (!normalizedUrl) continue;
    const existing = byNormalizedUrl.get(normalizedUrl);
    if (existing) {
      if (candidate.nativeOrigin === "URL_CITATION") {
        existing.url = candidate.url;
        existing.title = candidate.title || candidate.url;
      } else if (existing.title === existing.url && candidate.title) {
        existing.title = candidate.title;
      }
      if (!existing.nativeOrigins.includes(candidate.nativeOrigin)) existing.nativeOrigins.push(candidate.nativeOrigin);
      continue;
    }
    const index = byNormalizedUrl.size + 1;
    byNormalizedUrl.set(normalizedUrl, {
      id: `citation_${responsePart}_${String(index).padStart(3, "0")}`,
      url: candidate.url,
      title: candidate.title || candidate.url,
      normalizedUrl,
      nativeOrigins: [candidate.nativeOrigin]
    });
  }
  return [...byNormalizedUrl.values()];
}

function safeAffectedItem(item, index, reason) {
  return {
    index,
    claim: String(item?.claim || "Unnamed evidence item").slice(0, 500),
    submittedSourceUrl: String(item?.sourceUrl || "").slice(0, 2000),
    reason
  };
}

export function reconcileEvidenceWithNativeCitations(output, citations) {
  const safeOutput = output && typeof output === "object" ? output : {};
  const submittedItems = Array.isArray(safeOutput.newEvidence) ? safeOutput.newEvidence : [];
  const nativeCitations = Array.isArray(citations) ? citations : [];
  const citationsByNormalizedUrl = new Map(nativeCitations
    .filter((citation) => citation?.normalizedUrl || normalizeCitationUrl(citation?.url))
    .map((citation) => [citation.normalizedUrl || normalizeCitationUrl(citation.url), citation]));
  const affectedEvidenceItems = [];
  let mappedExternalItemCount = 0;

  const reconciledItems = submittedItems.map((item, index) => {
    if (item?.provenanceOrigin !== "EXTERNAL_SOURCE") return item;
    const normalizedSubmittedUrl = normalizeCitationUrl(item.sourceUrl);
    if (!normalizedSubmittedUrl) {
      affectedEvidenceItems.push(safeAffectedItem(item, index, "The submitted source URL is missing or is not a valid HTTP(S) URL."));
      return item;
    }
    const nativeCitation = citationsByNormalizedUrl.get(normalizedSubmittedUrl);
    if (!nativeCitation) {
      affectedEvidenceItems.push(safeAffectedItem(item, index, "No conservatively equivalent URL exists in native Responses citation/source metadata."));
      return item;
    }
    mappedExternalItemCount += 1;
    return {
      ...item,
      submittedSourceUrl: item.sourceUrl,
      sourceUrl: nativeCitation.url,
      sourceTitle: nativeCitation.title,
      citationIds: [nativeCitation.id],
      citationMappingMethod: item.sourceUrl === nativeCitation.url ? "EXACT_NATIVE_URL" : "NORMALIZED_NATIVE_URL"
    };
  });

  const externalEvidenceItemCount = submittedItems.filter((item) => item?.provenanceOrigin === "EXTERNAL_SOURCE").length;
  return {
    output: { ...safeOutput, newEvidence: reconciledItems },
    report: {
      failureStage: "CITATION_POST_PROCESSING",
      ingestionMode: "ATOMIC_FAIL_CLOSED",
      nativeCitationCount: nativeCitations.length,
      submittedEvidenceItemCount: submittedItems.length,
      externalEvidenceItemCount,
      mappedExternalItemCount,
      affectedEvidenceItems
    }
  };
}
