export const PROJECT_REPOSITORY_CONTRACT_VERSION = 1;

const DEFAULT_KEY = "rethink.workspace.v0.1";
const LEGACY_KEY = "rethink.project.v0.1";

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
      if (!parsed?.state?.id) return null;
      if (!current && legacy) {
        storage.setItem(key, JSON.stringify({ ...parsed, repositoryContractVersion: PROJECT_REPOSITORY_CONTRACT_VERSION }));
        storage.removeItem(LEGACY_KEY);
      }
      return parsed;
    },
    saveSession(session) {
      if (!session?.state?.id) throw new TypeError("A session with a project state and project ID is required.");
      storage.setItem(key, JSON.stringify({
        repositoryContractVersion: PROJECT_REPOSITORY_CONTRACT_VERSION,
        ...session
      }));
    },
    clearSession() {
      storage.removeItem(key);
      storage.removeItem(LEGACY_KEY);
    }
  });
}
