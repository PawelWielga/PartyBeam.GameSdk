// Node-only producer primitives. The browser contract entry point stays independent.
import { createHash, timingSafeEqual } from "node:crypto";

export const PACKAGE_SCHEMA_VERSION = 1;
export const SIGNATURE_ALGORITHM = "ecdsa-p256-sha256-p1363";
const kinds = new Set(["tv", "androidController", "browserController"]);
const hashPattern = /^[0-9a-fA-F]{64}$/;

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function hashEquals(expected, actual) {
  return typeof expected === "string" && typeof actual === "string"
    && hashPattern.test(expected) && hashPattern.test(actual)
    && timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(actual, "hex"));
}

// Reject unsafe spelling rather than repair it: the descriptor hashes exact paths.
export function assertSafeArtifactPath(value) {
  if (typeof value !== "string" || value.trim().length === 0
    || /[\\:\u0000-\u001f\u007f-\u009f]/u.test(value)
    || value.split("/").some(segment => segment === "" || segment === "." || segment === "..")) {
    throw new TypeError("Artifact path must be a safe relative forward-slash path.");
  }
  return value;
}

function normalizeHash(value) {
  if (typeof value !== "string" || !hashPattern.test(value)) {
    throw new TypeError("Expected a 64-character SHA-256 hexadecimal value.");
  }
  return value.toLowerCase();
}

export function buildPackageDescriptor(manifestSha256, components) {
  const manifestHash = normalizeHash(manifestSha256);
  if (!Array.isArray(components)) throw new TypeError("Components must be an array.");
  const paths = new Set();
  const entries = components.map(component => {
    if (!component || !kinds.has(component.kind)) throw new TypeError("Unsupported component kind.");
    const artifactPath = assertSafeArtifactPath(component.artifactPath);
    // OrdinalIgnoreCase does not expand a single character (e.g. ß) into "SS".
    const pathKey = Array.from(artifactPath, character => {
      const upper = character.toUpperCase();
      return upper.length === character.length ? upper : character;
    }).join("");
    if (paths.has(pathKey)) throw new TypeError("Component artifact paths collide.");
    paths.add(pathKey);
    return { kind: component.kind, artifactPath, sha256: normalizeHash(component.sha256) };
  });
  // JS relational comparison and .NET StringComparer.Ordinal both compare UTF-16 units.
  entries.sort((a, b) => a.artifactPath < b.artifactPath ? -1 : a.artifactPath > b.artifactPath ? 1 : 0);
  return Buffer.from([
    "partybeam-package-content-v1",
    `manifest:${manifestHash}`,
    ...entries.map(c => `component:${c.kind}:${c.artifactPath}:${c.sha256}`),
    "",
  ].join("\n"), "utf8");
}

export function computePackageSha256(manifestSha256, components) {
  return sha256(buildPackageDescriptor(manifestSha256, components));
}

export function createUnsignedIntegrityEnvelope(manifestBytes, components) {
  const manifestSha256 = sha256(manifestBytes);
  return { schemaVersion: PACKAGE_SCHEMA_VERSION, manifestSha256,
    packageSha256: computePackageSha256(manifestSha256, components) };
}
