export const PROJECT_REPOSITORY_CONTRACT_VERSION = 1;

const DEFAULT_KEY = "rethink.workspace.v0.1";
const LEGACY_KEY = "rethink.project.v0.1";
const LEGACY_DOMAIN_PROFILE = Object.freeze({ id: "BUSINESS", version: "1.0.0" });
const EMPTY_CLAIM_LEDGER = Object.freeze({ version: 1, claims: [], evidenceRelationships: [] });
const EMPTY_PROVENANCE_LEDGER = Object.freeze({ version: 1, artifacts: [], relationships: [] });

export function hydrateLocalProjectSession(session) {
  if (!session?.state?.id) return null;
  return {
    ...session,
    state: {
      ...session.state,
      domainProfile: session.state.domainProfile ?? LEGACY_DOMAIN_PROFILE.id,
      domainProfileVersion: session.state.domainProfileVersion ?? LEGACY_DOMAIN_PROFILE.version,
      claimLedger: session.state.claimLedger ?? {
        ...EMPTY_CLAIM_LEDGER,
        claims: [],
        evidenceRelationships: []
      },
      provenanceLedger: session.state.provenanceLedger ?? {
        ...EMPTY_PROVENANCE_LEDGER,
        artifacts: [],
        relationships: []
      }
    }
  };
}

export function createLocalProjectRepository(storage = globalThis.localStorage, { key = DEFAULT_KEY } = {}) {
  if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") {
    throw new TypeError("A Web Storage-compatible persistence adapter is required.");
  }

  return Object.freeze({
    kind: "DEVICE_LOCAL",
    contractVersion: PROJECT_REPOSITORY_CONTRACT_VERSION,
    loadSession() {
      const current = storage.getItem(key);
      const legacy = storage.getItem(LEGACY_KEY);
      const raw = current || legacy;
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const hydrated = hydrateLocalProjectSession(parsed);
      if (!hydrated) return null;
      if (!current && legacy) {
        storage.setItem(key, JSON.stringify({ ...hydrated, repositoryContractVersion: PROJECT_REPOSITORY_CONTRACT_VERSION }));
        storage.removeItem(LEGACY_KEY);
      }
      return hydrated;
    },
    saveSession(session) {
      const hydrated = hydrateLocalProjectSession(session);
      if (!hydrated) throw new TypeError("A session with a project state and project ID is required.");
      storage.setItem(key, JSON.stringify({
        repositoryContractVersion: PROJECT_REPOSITORY_CONTRACT_VERSION,
        ...hydrated
      }));
    },
    clearSession() {
      storage.removeItem(key);
      storage.removeItem(LEGACY_KEY);
    }
  });
}
