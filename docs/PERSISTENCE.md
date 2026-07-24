# Rethink v0.1 Persistence and Backups

## Current guarantee

The browser repository adapter stores one active project session under `rethink.workspace.v0.1` in same-origin `localStorage`. It preserves project state, route/result view state, assumptions, evidence, the Claim Ledger, the Provenance Ledger, the Temporal Ledger, the Reasoning Integrity Ledger, links, locks, gates, human decisions, stage overrides, state events, tangents, and Lab Notebook entries across reloads and application restarts on that browser profile.

This is device-local durability, not an account-backed guarantee. It does not promise survival after browser storage deletion, private-session cleanup, device loss, or a move to another deployment origin.

## Portable records

**Export Project Backup** exports a versioned `rethink.project.backup` JSON envelope containing the complete normalized project and safe resumable research/reasoning envelopes. **Import Project Backup** accepts v1 and v2, validates the envelope, preserves its project ID, appends an import-history record, and restores only that project under the destination browser origin. No API key or authorization value is exported.

**Download Final Report** creates a standalone UTF-8 HTML business report. **Download Report JSON** exports the structured report data, and **Notebook JSON** exports the focused reasoning history. None of these three report/history artifacts is a full project backup.

**Notebook JSON** exports a versioned `rethink.lab-notebook` record containing the notebook, state events, assumptions, evidence, Claim Ledger, Provenance Ledger, Temporal Ledger, Reasoning Integrity Ledger, locks, current PEC phase, and current disposition. It is for audit and analysis; it is not the full restore format.

Legacy raw project JSON can still be imported after state validation. Missing Claim, Provenance, Temporal, or Reasoning Integrity Ledger fields normalize to empty versioned ledgers without fabricated records, capability conclusions, or timestamps. Existing evidence dates and source metadata remain unchanged and never become fabricated Temporal or Capability Assessments. New exports always use the versioned envelope.

Temporal Assessments and `CORRECTS`/`SUPERSEDES` relationships persist as canonical project state through v1 exports, v1/v2 imports, cross-origin restoration, and resumable v2 runtime sessions. Lock snapshots and Notebook exports include the Temporal Ledger; structured and human reports include read-only analysis evaluated at their explicit generation timestamp. Backup format versions and the browser repository contract remain unchanged. Import validates typed temporal endpoints, assessment/relationship consistency, intervals, and active replacement cycles before accepting state.

Reasoning Integrity Capability Assessments persist through the same v1/v2, cross-origin, resumable, lock, Notebook, and report boundaries without changing either backup format version or the repository contract. Import validates stable Claim Ledger relationship targets, unique assessment identity, one active assessment per relationship, immutable canonical endpoint semantics, scope dimensions, fit/detection/absence consistency, and lifecycle metadata before accepting state. A missing legacy ledger becomes `{ "version": 1, "capabilityAssessments": [] }` only; migration does not fabricate scope, fit, detection, absence inference, disconfirmation conclusions, audit events, or Notebook entries.

Business Integrity is not persisted as project state. Its versioned policy belongs to the build-time BUSINESS Domain Profile, and its warnings and review status are derived on demand from canonical Core state at an explicit `asOf`. Reports may include that derived BUSINESS section, but project backups, local sessions, locks, Notebook state, and resumable envelopes do not receive a Business ledger, warning records, scores, conclusions, events, or timestamps. V1 and v2 formats remain unchanged, and legacy BUSINESS projects with empty Core ledgers continue to normalize without fabricated profile state.

## Isolation

The reasoning API is stateless: every route and cycle receives exactly one project state. Outputs must echo that state's project ID. Notebook compaction excludes unidentified or foreign project history. Import never merges two projects. `lineage.explicitImports` is reserved for a future user-authorized transfer feature; v0.1 performs no implicit cross-project lookup or transfer.

## Repository seam

`public/project-repository.js` defines the v0.1 browser persistence contract:

- `loadSession()`;
- `saveSession(session)`;
- `clearSession()`;
- adapter `kind` and `contractVersion` metadata.

A future multi-project repository can add list/create/open/archive semantics and use SQLite, D1, Postgres, or another durable store. The server-side reasoning runtime should still receive one explicitly authorized project object, so persistence replacement does not require rewriting STM, Router, Evidence, or Notebook reducers.

## Backup practice

- Export a project before a consequential human disposition, large evidence import, or deployment-origin change.
- Store backups in a location appropriate to the sensitivity of the project.
- Periodically test import in a separate browser profile.
- Treat project exports as potentially sensitive intellectual work; v0.1 JSON files are not encrypted.

## Future multi-user requirements

Public accounts require authentication, project ownership checks, encryption in transit and at rest, server-side authorization on every record, retention/deletion policies, migrations, backups and restore drills, quotas, audit logs, tenant isolation tests, and a clear data-processing policy. None are claimed by v0.1.
