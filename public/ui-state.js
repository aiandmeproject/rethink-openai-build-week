export function describeRoutingSnapshot({ routing, result, projectCycle = 0, activeEvidenceCount = 0 }) {
  if (!routing) return null;
  const historical = Boolean(result?.reasoning);
  const routedSummary = routing.evidenceState?.summary
    || `${routing.evidenceState?.consideredEvidenceCount || 0} evidence items considered.`;
  return {
    historical,
    contextLabel: historical
      ? `Cycle ${result.cycle || projectCycle} / Pre-execution STM recommendation`
      : "02 / Current STM priority",
    evidenceSummary: historical
      ? `Pre-execution evidence state: ${routedSummary} Current project state now contains ${activeEvidenceCount} active evidence item${activeEvidenceCount === 1 ? "" : "s"}.`
      : routedSummary
  };
}

export function researchOutcomeLabel(outcome) {
  if (outcome === "SUPPORTING_EVIDENCE_FOUND") return "Supporting Evidence Found";
  if (outcome === "DISCONFIRMING_EVIDENCE_FOUND") return "Contradictory Evidence Found";
  if (outcome === "MIXED_EVIDENCE_FOUND") return "Mixed / Limiting Evidence Found";
  if (outcome === "NO_CONCLUSIVE_EVIDENCE_FOUND") return "No Conclusive Evidence Found";
  if (outcome === "NO_RELEVANT_EVIDENCE_FOUND") return "No Relevant Evidence Found";
  return "Not Evaluated";
}
