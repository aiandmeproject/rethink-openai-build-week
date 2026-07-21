import assert from "node:assert/strict";
import test from "node:test";
import { describeRoutingSnapshot, researchOutcomeLabel } from "../public/ui-state.js";

test("completed-cycle STM routing is labeled as pre-execution and reports current evidence count", () => {
  const view = describeRoutingSnapshot({
    routing: { evidenceState: { summary: "The evidence register contains no observed evidence.", consideredEvidenceCount: 0 } },
    result: { cycle: 1, reasoning: { conclusion: "Five findings were ingested." } },
    projectCycle: 1,
    activeEvidenceCount: 5
  });
  assert.equal(view.historical, true);
  assert.match(view.contextLabel, /Pre-execution STM recommendation/);
  assert.match(view.evidenceSummary, /^Pre-execution evidence state:/);
  assert.match(view.evidenceSummary, /current project state now contains 5 active evidence items/i);
});

test("research evidence outcome remains distinct and never labels contradiction as proposition failure", () => {
  assert.equal(researchOutcomeLabel("SUPPORTING_EVIDENCE_FOUND"), "Supporting Evidence Found");
  assert.equal(researchOutcomeLabel("DISCONFIRMING_EVIDENCE_FOUND"), "Contradictory Evidence Found");
  assert.equal(researchOutcomeLabel("MIXED_EVIDENCE_FOUND"), "Mixed / Limiting Evidence Found");
  assert.equal(researchOutcomeLabel("NO_CONCLUSIVE_EVIDENCE_FOUND"), "No Conclusive Evidence Found");
  assert.doesNotMatch(researchOutcomeLabel("DISCONFIRMING_EVIDENCE_FOUND"), /fail/i);
});
