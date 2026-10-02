import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import { assertSafeArtifactPath, buildPackageDescriptor, computePackageSha256,
  createUnsignedIntegrityEnvelope, hashEquals, sha256 } from "@partybeam/game-sdk/package-v1";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url));
const fixture = name => JSON.parse(read(`fixtures/package/v1/${name}.json`));
const ajv = new Ajv2020({ strict: true, allErrors: true });
// JSON Schema contentEncoding is annotation-only, not signature verification.
const manifestSchema = ajv.compile(JSON.parse(read("schemas/game-package-manifest.v1.schema.json")));
const envelopeSchema = ajv.compile(JSON.parse(read("schemas/game-package-signature-envelope.v1.schema.json")));
const manifestHash = "0123456789abcdef".repeat(4);

test("Platform's independent v1 hash vector matches exactly", () => {
  const components = fixture("platform-manifest").components;
  assert.equal(computePackageSha256(manifestHash, components),
    "cf1febc099efa8774189e8e86c8149370fd88ceeb0d870d32dce7f668bac74c0");
  assert.equal(computePackageSha256(manifestHash.toUpperCase(), [...components].reverse().map(c =>
    ({ ...c, sha256: c.sha256.toUpperCase() }))), computePackageSha256(manifestHash, components));
  assert.equal(buildPackageDescriptor(manifestHash, components).at(-1), 10);
});

test("copied Platform and Catalog manifest fixtures validate unchanged", () => {
  for (const name of ["platform-manifest", "platform-artwork-manifest", "catalog-manifest"]) {
    assert.equal(manifestSchema(fixture(name)), true, JSON.stringify(manifestSchema.errors));
  }
});

test("Catalog's historical CRLF hash vector agrees; LF is a different byte stream", () => {
  const bytes = read("fixtures/package/v1/catalog-manifest.json").toString("utf8").replaceAll("\n", "\r\n");
  const envelope = fixture("catalog-envelope");
  assert.equal(envelopeSchema(envelope), true, JSON.stringify(envelopeSchema.errors));
  assert.equal(sha256(bytes), envelope.manifestSha256);
  assert.equal(computePackageSha256(sha256(bytes), JSON.parse(bytes).components), envelope.packageSha256);
  assert.notEqual(sha256(read("fixtures/package/v1/catalog-manifest.json")), envelope.manifestSha256);
});

for (const path of ["", " ", "/tv.zip", "\\tv.zip", "a\\b", "a:b", "../tv.zip",
  "a/../b", "./a", "a//b", "a/", "a\nb", "a\u0000b", "a\u007fb", "a\u0085b"]) {
  test(`descriptor rejects unsafe path ${JSON.stringify(path)}`, () => {
    assert.throws(() => assertSafeArtifactPath(path), TypeError);
  });
}

test("descriptor rejects malformed hashes, unknown kinds and case collisions", () => {
  const components = fixture("platform-manifest").components;
  for (const value of [null, "g".repeat(64), "a".repeat(63), "a".repeat(64) + "\n"]) {
    assert.throws(() => buildPackageDescriptor(value, components), TypeError);
    assert.throws(() => buildPackageDescriptor(manifestHash, [{ ...components[0], sha256: value }]), TypeError);
    assert.equal(hashEquals(value, value), false);
  }
  assert.throws(() => buildPackageDescriptor(manifestHash, [null]), TypeError);
  assert.throws(() => buildPackageDescriptor(manifestHash, [{ ...components[0], kind: "unknown" }]), TypeError);
  assert.throws(() => buildPackageDescriptor(manifestHash, [components[0],
    { ...components[1], artifactPath: components[0].artifactPath.toUpperCase() }]), TypeError);
});

test("ordinal ordering, immutable inputs and exact paths", () => {
  const components = ["z.zip", "Z.zip2", "é.zip"].map(artifactPath =>
    Object.freeze({ kind: "tv", artifactPath, sha256: "a".repeat(64) }));
  Object.freeze(components);
  const descriptor = buildPackageDescriptor(manifestHash, components).toString("utf8");
  assert.ok(descriptor.indexOf("Z.zip2") < descriptor.indexOf("z.zip"));
  assert.ok(descriptor.indexOf("z.zip") < descriptor.indexOf("é.zip"));
  assert.equal(assertSafeArtifactPath("components/ TV.zip"), "components/ TV.zip");
});

test("unsigned envelope preserves exact manifest bytes, not JSON canonicalization", () => {
  const manifest = fixture("platform-manifest");
  const a = createUnsignedIntegrityEnvelope(JSON.stringify(manifest), manifest.components);
  const b = createUnsignedIntegrityEnvelope(JSON.stringify(manifest, null, 2), manifest.components);
  assert.equal(envelopeSchema(a), true);
  assert.equal(Object.hasOwn(a, "signature"), false);
  assert.notEqual(a.manifestSha256, b.manifestSha256);
  assert.notEqual(a.packageSha256, b.packageSha256);
  assert.equal(hashEquals(a.packageSha256, a.packageSha256.toUpperCase()), true);
});

test("schemas fail closed on malformed shapes and traversal", () => {
  const base = fixture("platform-manifest");
  for (const mutate of [
    m => { m.schemaVersion = 2; },
    m => { m.unknown = true; },
    m => { m.components[0].artifactPath = "../tv.zip"; },
    m => { m.components[0].entryPoint = "a//index.html"; },
    m => { m.components[0].sha256 = "bad"; },
    m => { m.components[1].kind = "tv"; },
    m => { m.components = [m.components[0]]; },
  ]) {
    const candidate = structuredClone(base);
    mutate(candidate);
    assert.equal(manifestSchema(candidate), false);
  }
  const envelope = createUnsignedIntegrityEnvelope("{}", base.components);
  for (const candidate of [{ ...envelope, signature: null }, { ...envelope, manifestSha256: "bad" },
    { ...envelope, signature: { algorithm: "rsa", keyId: "key", valueBase64: "a".repeat(86) + "==" } }]) {
    assert.equal(envelopeSchema(candidate), false);
  }
});
