// Node-only producer workflow. Browser games keep using the independent root client.
import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { buildPackageDescriptor, createUnsignedIntegrityEnvelope, hashEquals, sha256, SIGNATURE_ALGORITHM } from "./package-v1.js";
import { createZip, readZip, zipLimits } from "./package-tools/zip.js";
import { parseMetadata, serializeManifest, validateManifest, validateEnvelope } from "./package-tools/manifest.js";
import { requirePackage as need } from "./package-tools/errors.js";
export { PackageError } from "./package-tools/errors.js";
export { validateManifest } from "./package-tools/manifest.js";

function key(value, privateKey) {
  const result = privateKey ? createPrivateKey(value) : createPublicKey(value);
  need(result.asymmetricKeyType === "ec" && result.asymmetricKeyDetails?.namedCurve === "prime256v1",
    "signature.key", "A P-256 PEM key is required.");
  return result;
}
function exactKeys(input, expected, label) {
  need(input && typeof input === "object" && !Array.isArray(input), "build.sources", `Expected ${label} mapping.`);
  need(JSON.stringify(Object.keys(input).sort()) === JSON.stringify([...expected].sort()), "build.sources", `${label} must exactly match manifest IDs.`);
}

export function buildPackage({ manifest: input, components, artwork = {}, signing, limits } = {}) {
  need(input && Array.isArray(input.components), "build.manifest", "Manifest must declare components.");
  const manifest = structuredClone(input), options = zipLimits(limits), entries = new Map();
  exactKeys(components, manifest.components.map(c => c.id), "components");
  exactKeys(artwork, (manifest.catalog?.artwork ?? []).map(a => a.id), "artwork");
  for (const component of manifest.components) {
    const files = components[component.id];
    need(files && typeof files === "object" && !Array.isArray(files), "build.component", "Expected a component file mapping.");
    const zip = createZip(Object.entries(files), options);
    component.sha256 = sha256(zip);
    entries.set(component.artifactPath, zip);
  }
  for (const asset of manifest.catalog?.artwork ?? []) {
    need(artwork[asset.id] instanceof Uint8Array, "build.artwork", "Expected artwork bytes.");
    const bytes = Buffer.from(artwork[asset.id]);
    asset.sha256 = sha256(bytes); entries.set(asset.artifactPath, bytes);
  }
  validateManifest(manifest);
  const manifestBytes = serializeManifest(manifest);
  need(manifestBytes.length <= 1024 * 1024, "metadata.limit", "Manifest exceeds 1 MiB.");
  const envelope = createUnsignedIntegrityEnvelope(manifestBytes, manifest.components);
  let publicKeys;
  if (signing !== undefined) {
    need(signing && typeof signing.keyId === "string" && signing.keyId.trim(), "signature.keyId", "Signing needs a nonempty keyId.");
    const privateKey = key(signing.privateKeyPem, true);
    const descriptor = buildPackageDescriptor(envelope.manifestSha256, manifest.components);
    envelope.signature = { algorithm: SIGNATURE_ALGORITHM, keyId: signing.keyId,
      valueBase64: sign("sha256", descriptor, { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64") };
    publicKeys = { [signing.keyId]: createPublicKey(privateKey).export({ type: "spki", format: "pem" }) };
  }
  entries.set("manifest.json", manifestBytes); entries.set("signature.json", serializeManifest(envelope));
  const bytes = createZip(entries, options);
  // A producer never emits an unchecked package, including entry-point/source mistakes.
  const checked = checkPackage(bytes, { allowUnsigned: true, publicKeys, limits: options });
  return { bytes, ...checked };
}

export function checkPackage(bytes, { allowUnsigned = false, publicKeys = {}, limits } = {}) {
  const options = zipLimits(limits), entries = readZip(bytes, { ...options, maxEntries: Math.min(16, options.maxEntries) });
  const metadata = name => {
    need(entries.has(name), "package.missing", `Missing ${name}.`);
    need(entries.get(name).length <= 1024 * 1024, "metadata.limit", `${name} exceeds 1 MiB.`);
    return parseMetadata(entries.get(name));
  };
  const manifest = metadata("manifest.json"), envelope = metadata("signature.json");
  const warnings = validateManifest(manifest); validateEnvelope(envelope);
  const expected = new Set(["manifest.json", "signature.json"]);
  for (const artifact of [...manifest.components, ...(manifest.catalog.artwork ?? [])]) {
    expected.add(artifact.artifactPath);
    need(entries.has(artifact.artifactPath), "package.missing", `Missing artifact: ${artifact.artifactPath}`);
    const payload = entries.get(artifact.artifactPath);
    need(hashEquals(artifact.sha256, sha256(payload)), "package.artifactHash", `Artifact hash mismatch: ${artifact.artifactPath}`);
  }
  need(entries.size === expected.size && [...entries.keys()].every(name => expected.has(name)),
    "package.unexpected", "Package contains undeclared entries.");
  const manifestHash = sha256(entries.get("manifest.json"));
  need(hashEquals(manifestHash, envelope.manifestSha256), "package.manifestHash", "Manifest integrity mismatch.");
  const descriptor = buildPackageDescriptor(manifestHash, manifest.components);
  need(hashEquals(sha256(descriptor), envelope.packageSha256), "package.descriptorHash", "Logical package integrity mismatch.");
  // Share one decompression budget across outer and all nested component archives.
  let expanded = [...entries.values()].reduce((sum, data) => sum + data.length, 0);
  for (const component of manifest.components) {
    need(expanded < options.maxTotalBytes, "zip.limit", "Total nested decompression limit exceeded.");
    const files = readZip(entries.get(component.artifactPath), { ...options, maxTotalBytes: options.maxTotalBytes - expanded });
    expanded += [...files.values()].reduce((sum, data) => sum + data.length, 0);
    need(files.has(component.entryPoint), "component.entryPoint", `Missing entry point for ${component.id}: ${component.entryPoint}`);
  }
  const signed = envelope.signature !== undefined;
  if (signed) {
    const { keyId, valueBase64 } = envelope.signature;
    need(Object.hasOwn(publicKeys, keyId), "signature.publicKey", `No supplied public key for ${keyId}.`);
    const signature = Buffer.from(valueBase64, "base64");
    need(signature.length === 64 && signature.toString("base64") === valueBase64, "signature.encoding", "Noncanonical P1363 signature.");
    need(verify("sha256", descriptor, { key: key(publicKeys[keyId], false), dsaEncoding: "ieee-p1363" }, signature),
      "signature.invalid", "P-256 signature verification failed.");
  } else need(allowUnsigned === true, "signature.required", "Unsigned packages require explicit allowUnsigned.");
  return { manifest, envelope, warnings, profile: signed ? "signed" : "unsigned",
    signatureVerified: signed, outerSha256: sha256(bytes) };
}
