# Rethink Engine Risk Register

This file is the canonical project Risk Register for material architectural, data-integrity, evidence-integrity, migration, backward-compatibility, testing, operational, and known technical risks.

## Governance

Codex does not have independent authority to add, edit, change the status of, accept, mitigate, close, or delete a canonical risk.

The required approval flow is:

```text
Codex identifies or recommends a candidate risk
  → Architecture Review Chat evaluates the proposed action
  → Human Project Owner gives final authorization
  → Codex updates this register only as explicitly authorized
```

Candidate risks may be documented in branch handoffs, but must not enter this file without specific approval. The permitted status values are `OPEN`, `UNDER REVIEW`, `MITIGATED`, `ACCEPTED`, and `CLOSED`. Closed risks remain permanently in the register with their resolution history.

## Risk 1 — Potential Dangling Claim–Evidence References After Evidence Removal

**Risk ID:** RISK-001  
**Category:** Data Integrity / Claim Ledger  
**Status:** CLOSED  
**Initial Status:** UNDER REVIEW  
**Identified During:** Branch 2 — `core/claim-ledger` architectural review  
**Severity:** Potentially High  
**Likelihood at Identification:** Unknown pending code verification  
**Verified Likelihood:** Not realized in the verified Branch 2 implementation

### Description

Branch 2 states that evidence removal retires Claim Ledger relationships softly to preserve referential and historical integrity.

The Claim Ledger architecture separately requires that retained evidence-to-claim relationships must not reference nonexistent Claims or Evidence Items.

A potential conflict exists if an Evidence Item is physically deleted from canonical project state while a retained or retired Claim Ledger relationship continues to reference its `evidenceId`.

```text
Retired Relationship
    ↓
evidenceId: E123
    ↓
Evidence Item E123 no longer exists
```

This would create a dangling reference and violate the Claim Ledger referential-integrity requirement.

### Possible Non-Issue

This may not be an actual defect.

If evidence removal is non-destructive and the Evidence Item remains in canonical project state or an explicit canonical historical representation under its stable ID, the relationship remains referentially valid.

### Required Verification

1. Determine whether removed Evidence Items remain accessible under their stable evidence IDs.
2. Determine whether removed or inactive Claims remain accessible under their stable claim IDs.
3. Determine whether any active or retired Claim Ledger relationship can reference:
   - an evidence ID that no longer exists anywhere in canonical project state; or
   - a claim ID that no longer exists anywhere in canonical Claim Ledger state.
4. Explain precisely how soft-unlinked or retired relationships preserve both historical and referential integrity.
5. Identify or add automated tests proving the behavior.

### Resolution Criteria

Risk #1 may be marked `CLOSED` when automated tests demonstrate that:

- no retained Claim Ledger relationship references a nonexistent Claim;
- no retained Claim Ledger relationship references a nonexistent Evidence Item;
- removal or retirement preserves historical integrity;
- the full regression suite passes;
- the smoke test passes.

### Verification Result

The focused Branch 2 audit found no implementation defect.

1. `REMOVE_EVIDENCE` is non-destructive. The Evidence Item remains in the canonical project `evidence` array under the same stable ID with `status: "REMOVED"`, `removedAt`, and `removedReason`.
2. Core currently exposes no claim-deletion or claim-inactivation operation. Claim status is evaluative rather than a lifecycle deletion flag, and all claims remain in `claimLedger.claims` under their stable IDs.
3. Both active and retired relationships are validated against every canonical claim ID and every Evidence Item ID during project normalization. If either endpoint is physically absent, normalization fails closed.
4. Backup import uses the same normalization boundary. A backup containing a retained relationship whose claim or evidence endpoint is absent is rejected.
5. Soft unlinking changes the relationship to `status: "REMOVED"` and retains its stable ID, endpoint IDs, relationship meaning, notes, creation time, removal time, and removal reason. Evidence removal also retires every active relationship for that evidence before returning canonical state. Because the Evidence Item and Claim remain present, the historical relationship remains referentially valid.

No production-code correction was required.

### Automated Verification

The focused tests in `test/claims.test.js` demonstrate:

- `referential integrity rejects unknown records and duplicate canonical relationships`
- `active and retired relationships fail closed when a canonical claim or evidence endpoint is physically missing`
- `relationship removal is historical and evidence removal retires remaining active links`
- `claims and links persist through cycle, lock, notebook, report, v1 backup, and import`

Final verification on 2026-07-23:

- Focused Claim Ledger suite: 14 passed, 0 failed
- Full automated suite: 118 passed, 0 failed
- Smoke test: `home → project → route → cycle → notebook` passed
- `git diff --check`: passed

### Resolution History

| Date | Status | Resolution history |
| --- | --- | --- |
| 2026-07-23 | UNDER REVIEW | Risk identified during Branch 2 architectural review. Verification requested for possible dangling references after evidence removal. |
| 2026-07-23 | UNDER REVIEW | Code audit confirmed evidence removal is soft, no claim deletion/inactivation operation exists, and normalization validates relationship endpoints for both active and retired records. |
| 2026-07-23 | UNDER REVIEW | Added focused fail-closed coverage for active and retired relationships with physically missing Claim or Evidence endpoints, including backup import. |
| 2026-07-23 | CLOSED | All resolution criteria satisfied: endpoints remain canonical after soft removal, missing endpoints are rejected, historical records are preserved, 118 automated tests passed, and the smoke test passed. No production-code change was required. |

### Related Components

- `rethink-claims.js`
- Evidence Registry
- Claim Ledger
- Project normalization
- Backup/import
- Historical state preservation

## Risk 2 — Active Claim–Evidence Relationship Could Reference Removed or Non-Linkable Evidence

**Risk ID:** RISK-002

**Category:** Data Integrity / Claim Ledger / Persistence

**Status:** CLOSED

**Identified During:** Branch 2 — `core/claim-ledger` final pre-PR architectural audit

**Severity:** High

**Likelihood Before Correction:** Material / reachable through evidence reclassification and externally supplied or imported state

### Description

The Claim Ledger architecture requires an `ACTIVE` evidence-to-claim relationship to reference evidence that is both canonical and currently eligible to participate as linkable evidence.

The Branch 2 pre-PR audit found that validation previously checked only whether the referenced Evidence Item ID existed.

As a result, the following semantically inconsistent state could pass project normalization and backup import:

```text
Evidence Item:
status: REMOVED

Claim Ledger relationship:
status: ACTIVE
```

A broader version of the same issue could also occur when evidence was reclassified to a non-linkable intake state such as `ROUTED` / `PLANNED_TEST` while an `ACTIVE` Claim Ledger relationship remained.

This did not create a dangling reference because the Evidence Item still existed, but it violated the Claim Ledger invariant that an `ACTIVE` relationship must reference active, linkable evidence.

### Failure Scenario

```text
ACTIVE Claim Relationship
    ↓
Evidence ID exists
    ↓
Evidence status is REMOVED, ROUTED, PLANNED_TEST,
or otherwise non-linkable
    ↓
Canonical state incorrectly preserves the relationship as ACTIVE
```

### Potential Impact

An invalid active relationship could be treated as current claim-related evidence by downstream state, prompt, reporting, or reasoning logic even though the Evidence Item was no longer eligible to participate as active evidence.

### Verification Result

The audit confirmed that, before correction:

- project normalization accepted `ACTIVE` relationships to `REMOVED` evidence;
- v1 backup import accepted the state;
- v2 backup import accepted the state;
- normal `REMOVE_EVIDENCE` did not create the state because it already retired relationships atomically;
- evidence reclassification could create the broader invalid condition by making evidence non-linkable without retiring its active Claim Ledger relationships.

### Resolution

The Claim Ledger validation model now distinguishes:

1. all known canonical Evidence Item IDs; and
2. currently active, linkable Evidence Item IDs.

Every retained relationship must reference a known canonical Evidence Item.

Additionally, every `ACTIVE` Claim Ledger relationship must reference evidence that:

- has status `ACTIVE`; and
- uses an actual evidence intake type eligible for Claim Ledger linking.

`REMOVED` historical relationships may continue to reference retained `REMOVED` Evidence Items so historical integrity is preserved.

Evidence reclassification to a non-linkable intake now atomically retires any active Claim Ledger relationships associated with that Evidence Item.

Normalization and backup import now fail closed when an `ACTIVE` relationship references removed or otherwise non-linkable evidence.

### Automated Verification

Regression coverage verifies:

- normalization rejects `ACTIVE` relationships to `REMOVED` evidence;
- v1 backup import rejects the invalid state;
- v2 backup import rejects the invalid state;
- active relationships to routed/non-linkable evidence are rejected;
- `REMOVED` historical relationships may reference retained `REMOVED` evidence;
- evidence reclassification to `PLANNED_TEST` / `ROUTED` retires active relationships;
- normal evidence removal continues to retire active relationships atomically.

Final verification:

- Focused Claim Ledger tests: 14 passed, 0 failed
- Full automated suite: 118 passed, 0 failed
- Smoke test: `home → project → route → cycle → notebook` passed
- `git diff --check`: passed
- Direct normalization reproduction: rejected
- v1 import reproduction: rejected
- v2 import reproduction: rejected

### Resolution History

| Step | Resolution history |
| --- | --- |
| 1 | The issue was discovered during the final Branch 2 pre-PR architectural audit. |
| 2 | Audit confirmed a real semantic-integrity defect affecting normalization, v1/v2 import, and evidence reclassification. |
| 3 | Production validation was corrected to distinguish known Evidence Items from active/linkable Evidence Items. |
| 4 | Evidence reclassification was corrected to retire active Claim Ledger relationships when evidence becomes non-linkable. |
| 5 | Focused regression coverage was added. |
| 6 | All 118 automated tests, smoke testing, and `git diff --check` passed. |
| 7 | Risk #2 was `CLOSED` before Branch 2 merge. |

### Related Components

- `rethink-claims.js`
- `rethink-engine.js`
- Claim Ledger
- Evidence Registry
- Project normalization
- Evidence reclassification
- v1 backup import
- v2 backup import
- Historical relationship preservation
