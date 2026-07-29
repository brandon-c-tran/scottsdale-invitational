const SNAPSHOT_FORMAT = "field-day-snapshot";
const SNAPSHOT_VERSION = 1;
/* v5/v6 snapshots remain importable; hydration adds current metadata maps. */
const SUPPORTED_STATE_VERSIONS = new Set([5, 6, 7]);
const ENVIRONMENTS = new Set(["local", "staging", "production"]);
const REQUIRED_KEYS = ["state", "version", "claims"];
const INTERNAL_BACKUP_PREFIX = "m1:pre-restore:";
const MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;
const MAX_ENTRIES = 256;
const MAX_PHOTO_LENGTH = 120000;

const utf8Size = value => new TextEncoder().encode(value).byteLength;

function isPortableStorageKey(key) {
  return typeof key === "string"
    && key.length > 0
    && key.length <= 256
    && key !== "gmToken"
    && !key.startsWith(INTERNAL_BACKUP_PREFIX);
}

function storageEntryList(entries) {
  if (entries instanceof Map) return [...entries.entries()];
  if (Array.isArray(entries)) {
    return entries.map(entry => Array.isArray(entry) ? entry : [entry?.key, entry?.value]);
  }
  if (entries && typeof entries === "object") return Object.entries(entries);
  return [];
}

function portableEntries(entries) {
  return storageEntryList(entries)
    .filter(([key]) => isPortableStorageKey(key))
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

function buildSnapshot(entries, {
  environment,
  applicationVersion,
  exportedAt = new Date().toISOString(),
  object = "tournament/main",
} = {}) {
  const portable = portableEntries(entries);
  const state = portable.find(entry => entry.key === "state")?.value;
  return {
    format: SNAPSHOT_FORMAT,
    snapshotVersion: SNAPSHOT_VERSION,
    metadata: {
      exportedAt,
      applicationVersion: String(applicationVersion || "unknown"),
      stateSchemaVersion: state?.v,
      environment: String(environment || "production"),
      object,
    },
    entries: portable,
  };
}

function validateSnapshot(snapshot) {
  const errors = [];
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot))
    return { ok: false, errors: ["Snapshot must be an object"] };

  if (snapshot.format !== SNAPSHOT_FORMAT) errors.push("Unsupported snapshot format");
  if (snapshot.snapshotVersion !== SNAPSHOT_VERSION) errors.push("Unsupported snapshot version");

  const metadata = snapshot.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    errors.push("Snapshot metadata is required");
  } else {
    if (typeof metadata.exportedAt !== "string" || !Number.isFinite(Date.parse(metadata.exportedAt)))
      errors.push("Invalid export timestamp");
    if (typeof metadata.applicationVersion !== "string" || !metadata.applicationVersion.trim())
      errors.push("Application version is required");
    if (!SUPPORTED_STATE_VERSIONS.has(metadata.stateSchemaVersion))
      errors.push("Unsupported state schema version");
    if (!ENVIRONMENTS.has(metadata.environment))
      errors.push("Invalid source environment");
    if (typeof metadata.object !== "string" || !metadata.object.trim())
      errors.push("Object identifier is required");
  }

  if (!Array.isArray(snapshot.entries)) {
    errors.push("Snapshot entries must be an array");
    return { ok: false, errors };
  }
  if (snapshot.entries.length > MAX_ENTRIES) errors.push("Snapshot has too many entries");

  const seen = new Set();
  const entryMap = new Map();
  for (const entry of snapshot.entries) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      errors.push("Invalid storage entry");
      continue;
    }
    const { key, value } = entry;
    if (!isPortableStorageKey(key)) {
      errors.push(`Unsafe storage key: ${String(key)}`);
      continue;
    }
    if (seen.has(key)) {
      errors.push(`Duplicate storage key: ${key}`);
      continue;
    }
    seen.add(key);
    try {
      if (JSON.stringify(value) === undefined) errors.push(`Storage value is not JSON-compatible: ${key}`);
    } catch {
      errors.push(`Storage value is not JSON-compatible: ${key}`);
    }
    entryMap.set(key, value);
  }

  for (const key of REQUIRED_KEYS)
    if (!entryMap.has(key)) errors.push(`Missing required storage key: ${key}`);

  const state = entryMap.get("state");
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    errors.push("State entry must be an object");
  } else {
    if (!SUPPORTED_STATE_VERSIONS.has(state.v)) errors.push("Unsupported stored state version");
    if (metadata?.stateSchemaVersion !== state.v) errors.push("State schema metadata does not match state");
    if (!state.profiles || typeof state.profiles !== "object" || Array.isArray(state.profiles))
      errors.push("State profiles must be an object");
    else {
      for (const [player, profile] of Object.entries(state.profiles)) {
        if (profile?.photoV && !entryMap.has(`photo:${player}`))
          errors.push(`Missing referenced photo: ${player}`);
      }
    }
  }

  const version = entryMap.get("version");
  if (!Number.isInteger(version) || version < 0) errors.push("Version entry must be a non-negative integer");
  const claims = entryMap.get("claims");
  if (!claims || typeof claims !== "object" || Array.isArray(claims))
    errors.push("Claims entry must be an object");

  for (const [key, value] of entryMap) {
    if (!key.startsWith("photo:")) continue;
    if (typeof value !== "string"
        || !/^data:image\/[a-z0-9.+-]+;base64,/i.test(value)
        || value.length > MAX_PHOTO_LENGTH)
      errors.push(`Invalid photo entry: ${key}`);
  }

  try {
    if (utf8Size(JSON.stringify(snapshot)) > MAX_SNAPSHOT_BYTES)
      errors.push("Snapshot exceeds the maximum size");
  } catch {
    errors.push("Snapshot is not JSON-compatible");
  }

  return {
    ok: errors.length === 0,
    errors,
    entries: entryMap,
    stats: {
      entries: entryMap.size,
      photos: [...entryMap.keys()].filter(key => key.startsWith("photo:")).length,
    },
  };
}

async function snapshotSha256(snapshot) {
  const data = new TextEncoder().encode(JSON.stringify(snapshot));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function nextRestoreVersion(currentVersion, importedVersion) {
  const current = Number.isInteger(currentVersion) && currentVersion >= 0 ? currentVersion : 0;
  const imported = Number.isInteger(importedVersion) && importedVersion >= 0 ? importedVersion : 0;
  return Math.max(current, imported) + 1;
}

export {
  SNAPSHOT_FORMAT,
  SNAPSHOT_VERSION,
  INTERNAL_BACKUP_PREFIX,
  MAX_SNAPSHOT_BYTES,
  isPortableStorageKey,
  portableEntries,
  buildSnapshot,
  validateSnapshot,
  snapshotSha256,
  nextRestoreVersion,
};
