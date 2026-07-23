export const DOMAIN_PROFILE_AVAILABILITIES = Object.freeze(["ACTIVE", "PLANNED"]);
export const DEFAULT_DOMAIN_PROFILE_ID = "BUSINESS";

function requiredText(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`Domain profile ${field} must be a non-empty string.`);
  }
}

function requiredStringArray(value, field) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new TypeError(`Domain profile ${field} must be an array of strings.`);
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function validateDomainProfile(profile) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    throw new TypeError("Domain profile must be an object.");
  }
  if (!/^[A-Z][A-Z0-9_]*$/.test(profile.id || "")) {
    throw new TypeError("Domain profile id must be an uppercase token.");
  }
  for (const field of ["name", "version", "purpose"]) requiredText(profile[field], field);
  if (!/^\d+\.\d+\.\d+$/.test(profile.version)) {
    throw new TypeError("Domain profile version must use semantic versioning.");
  }
  if (!DOMAIN_PROFILE_AVAILABILITIES.includes(profile.availability)) {
    throw new TypeError(`Domain profile availability must be one of: ${DOMAIN_PROFILE_AVAILABILITIES.join(", ")}.`);
  }
  if (!profile.terminology || typeof profile.terminology !== "object" || Array.isArray(profile.terminology)) {
    throw new TypeError("Domain profile terminology must be an object.");
  }
  for (const [term, value] of Object.entries(profile.terminology)) {
    if (!/^[a-z][A-Za-z0-9]*$/.test(term) || typeof value !== "string" || !value.trim()) {
      throw new TypeError("Domain profile terminology must map named terms to non-empty strings.");
    }
  }
  requiredStringArray(profile.additionalModuleIds, "additionalModuleIds");
  if (profile.additionalModuleIds.some((id) => !/^[A-Z][A-Z0-9_]*$/.test(id))) {
    throw new TypeError("Domain profile additionalModuleIds must contain uppercase tokens.");
  }
  requiredStringArray(profile.safeguards, "safeguards");
  return profile;
}

export class DomainProfileError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "DomainProfileError";
    this.code = code;
    this.details = details;
  }
}

function normalizedId(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

export function createDomainProfileRegistry(initialProfiles = []) {
  const registered = new Map();
  const api = {
    register(profile) {
      validateDomainProfile(profile);
      if (registered.has(profile.id)) {
        throw new TypeError(`Domain profile is already registered: ${profile.id}.`);
      }
      const stored = deepFreeze(structuredClone(profile));
      registered.set(stored.id, stored);
      return stored;
    },
    has(id) {
      return registered.has(normalizedId(id));
    },
    get(id) {
      const normalized = normalizedId(id);
      const profile = registered.get(normalized);
      if (!profile) {
        throw new DomainProfileError(
          "UNKNOWN_DOMAIN_PROFILE",
          `Unknown domain profile: ${normalized || String(id)}.`,
          { domainProfile: normalized || String(id || "") }
        );
      }
      return profile;
    },
    list() {
      return [...registered.values()];
    },
    ids() {
      return [...registered.keys()];
    },
    resolve(id, { version } = {}) {
      const profile = api.get(id);
      if (profile.availability !== "ACTIVE") {
        throw new DomainProfileError(
          "DOMAIN_PROFILE_UNAVAILABLE",
          `Domain profile ${profile.id} is known but unavailable in this release.`,
          { domainProfile: profile.id, availability: profile.availability }
        );
      }
      if (version != null && version !== "" && version !== profile.version) {
        throw new DomainProfileError(
          "DOMAIN_PROFILE_VERSION_UNSUPPORTED",
          `Domain profile ${profile.id} version ${version} is not supported; available version is ${profile.version}.`,
          { domainProfile: profile.id, requestedVersion: version, availableVersion: profile.version }
        );
      }
      return profile;
    }
  };
  for (const profile of initialProfiles) api.register(profile);
  return Object.freeze(api);
}

function profile(config) {
  return {
    terminology: {},
    additionalModuleIds: [],
    safeguards: [],
    version: "1.0.0",
    ...config
  };
}

export const DOMAIN_PROFILES = Object.freeze([
  profile({
    id: "BUSINESS",
    name: "Business",
    availability: "ACTIVE",
    purpose: "Apply Rethink Core to business problems, opportunities, and operating decisions without changing the accepted Build Week workflow.",
    terminology: {
      project: "project",
      decision: "decision",
      evidence: "evidence"
    },
    safeguards: [
      "Apply all Rethink Core evidence, uncertainty, and integrity rules.",
      "Preserve final human authority.",
      "Do not import terminology, assumptions, or conclusions from another project or domain profile."
    ]
  }),
  profile({
    id: "GENERAL",
    name: "General",
    availability: "PLANNED",
    purpose: "Future general-purpose reasoning profile."
  }),
  profile({
    id: "APPS",
    name: "Apps / Product",
    availability: "PLANNED",
    purpose: "Future app and product investigation profile."
  }),
  profile({
    id: "NEWS",
    name: "News / Investigation",
    availability: "PLANNED",
    purpose: "Future news and investigation profile."
  })
].map(deepFreeze));

export const DOMAIN_PROFILE_REGISTRY = createDomainProfileRegistry(DOMAIN_PROFILES);

export function createDomainProfileAssignment(
  id = DEFAULT_DOMAIN_PROFILE_ID,
  { version, registry = DOMAIN_PROFILE_REGISTRY } = {}
) {
  const resolved = registry.resolve(id, { version });
  return {
    domainProfile: resolved.id,
    domainProfileVersion: resolved.version
  };
}

export function resolveProjectDomainProfile(state, { registry = DOMAIN_PROFILE_REGISTRY } = {}) {
  const id = state?.domainProfile == null ? DEFAULT_DOMAIN_PROFILE_ID : state.domainProfile;
  const version = state?.domainProfileVersion == null ? undefined : state.domainProfileVersion;
  return registry.resolve(id, { version });
}

export function domainProfilePromptContext(state, options = {}) {
  const resolved = resolveProjectDomainProfile(state, options);
  return {
    id: resolved.id,
    name: resolved.name,
    version: resolved.version,
    purpose: resolved.purpose,
    terminology: resolved.terminology,
    additionalModuleIds: resolved.additionalModuleIds,
    safeguards: resolved.safeguards
  };
}

export function domainProfileStatusMetadata(registry = DOMAIN_PROFILE_REGISTRY) {
  return registry.list().map((item) => ({
    id: item.id,
    name: item.name,
    version: item.version,
    availability: item.availability,
    operational: item.availability === "ACTIVE"
  }));
}
