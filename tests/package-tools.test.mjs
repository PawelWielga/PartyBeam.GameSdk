import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { zipSync } from "fflate";
import { buildPackage, checkPackage, validateManifest } from "@partybeam/game-sdk/package-tools";
import { createUnsignedIntegrityEnvelope, sha256 } from "@partybeam/game-sdk/package-v1";
import { createZip, readZip } from "../src/package-tools/zip.js";
import { parseMetadata, serializeManifest } from "../src/package-tools/manifest.js";

const json = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url)));
const base = () => json("fixtures/package/v1/generated/reflex/manifest.json");
const input = () => {
  const manifest = base();
  return { manifest, components: Object.fromEntries(manifest.components.map(c => [c.id,
    { [c.entryPoint]: Buffer.from("<!doctype html><title>fixture</title>"), "shared/game.js": Buffer.from("export const ready = true;\n") }])),
    artwork: { cover: Buffer.from("fixture artwork bytes") } };
};
const unsigned = () => buildPackage(input());
const signingKey = curve => generateKeyPairSync("ec", { namedCurve: curve,
  privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });

function repack(result, mutate) {
  const entries = readZip(result.bytes);
  mutate(entries);
  return createZip(entries);
}
function mutateManifest(mutate) {
  return repack(unsigned(), entries => {
    const manifest = JSON.parse(entries.get("manifest.json")); mutate(manifest);
    const bytes = serializeManifest(manifest);
    entries.set("manifest.json", bytes);
    entries.set("signature.json", serializeManifest(createUnsignedIntegrityEnvelope(bytes, manifest.components)));
  });
}

test("producer output is byte-identical across source ordering and input object property order", () => {
  const first = input(), second = input();
  second.manifest = Object.fromEntries(Object.entries(second.manifest).reverse());
  for (const id of Object.keys(second.components)) second.components[id] = Object.fromEntries(Object.entries(second.components[id]).reverse());
  const before = JSON.stringify(first);
  const a = buildPackage(first), b = buildPackage(second);
  assert.deepEqual(a.bytes, b.bytes);
  assert.equal(JSON.stringify(first), before);
  assert.equal(checkPackage(a.bytes, { allowUnsigned: true }).profile, "unsigned");
  assert.equal(a.signatureVerified, false);
  assert.equal(sha256(a.bytes), a.outerSha256);
  assert.deepEqual(a.bytes, readFileSync(new URL("../fixtures/package/v1/producer/unsigned.partybeam", import.meta.url)));
});

test("unsigned check is opt-in; signed P-256/P1363 roundtrip requires a supplied key", () => {
  assert.throws(() => checkPackage(unsigned().bytes), /signature.required/);
  const pair = signingKey("prime256v1");
  const a = buildPackage({ ...input(), signing: { keyId: "fixture", privateKeyPem: pair.privateKey } });
  assert.equal(a.profile, "signed"); assert.equal(a.signatureVerified, true);
  assert.equal(Buffer.from(a.envelope.signature.valueBase64, "base64").length, 64);
  assert.throws(() => checkPackage(a.bytes, { allowUnsigned: true }), /signature.publicKey/);
  assert.equal(checkPackage(a.bytes, { publicKeys: { fixture: pair.publicKey } }).signatureVerified, true);
  assert.throws(() => checkPackage(a.bytes, { publicKeys: { fixture: signingKey("prime256v1").publicKey } }), /signature.invalid/);
  assert.throws(() => buildPackage({ ...input(), signing: { keyId: "fixture", privateKeyPem: signingKey("secp384r1").privateKey } }), /signature.key/);
  assert.throws(() => buildPackage({ ...input(), signing: { keyId: " ", privateKeyPem: pair.privateKey } }), /signature.keyId/);
  const tampered = repack(a, entries => {
    const envelope = JSON.parse(entries.get("signature.json"));
    envelope.signature.valueBase64 = Buffer.alloc(64).toString("base64");
    entries.set("signature.json", serializeManifest(envelope));
  });
  assert.throws(() => checkPackage(tampered, { publicKeys: { fixture: pair.publicKey }, allowUnsigned: true }), /signature.invalid/);
  const blankKeyId = repack(a, entries => {
    const envelope = JSON.parse(entries.get("signature.json")); envelope.signature.keyId = " ";
    entries.set("signature.json", serializeManifest(envelope));
  });
  assert.throws(() => checkPackage(blankKeyId, { publicKeys: { " ": pair.publicKey } }), /signature.keyId/);
});

const semantics = [
  ["duplicate IDs", m => { m.components[1].id = m.components[0].id; }],
  ["mixed release", m => { m.components[0].releaseVersion = "99.0.0"; }],
  ["reversed players", m => { m.players.minimum = 100; }],
  ["reversed Game Contract", m => { m.gameContract.minimumVersion = "3.0.0"; }],
  ["case-colliding paths", m => { m.components[1].artifactPath = m.components[0].artifactPath.toUpperCase(); }],
  ["reserved path", m => { m.components[0].artifactPath = "Manifest.json"; }],
  ["case-colliding locales", m => { m.catalogLocales = ["en", "EN"]; }],
  ["missing runtime English", m => { m.components[0].runtimeLocales = ["pl"]; }],
  ["missing English metadata", m => { m.catalog.localized.en.shortDescription = " "; }],
  ["undeclared translation", m => { m.catalog.localized.fr = { shortDescription: "French" }; }],
  ["case-colliding translation", m => { m.catalog.localized.EN = m.catalog.localized.en; }],
  ["capability overlap", m => { m.capabilities = { required: ["camera"], optional: ["camera"] }; }],
  ["allowlist without capability", m => { m.network.outboundAllowlist = ["https://example.test"]; }],
  ["internet without allowlist", m => { m.capabilities.required = ["internetAccess"]; }],
  ["WAN HTTP", m => { m.capabilities.required = ["internetAccess"]; m.network.outboundAllowlist = ["http://example.test"]; }],
  ["WAN credentials", m => { m.capabilities.required = ["internetAccess"]; m.network.outboundAllowlist = ["https://user@example.test"]; }],
  ["WAN fragment", m => { m.capabilities.required = ["internetAccess"]; m.network.outboundAllowlist = ["https://example.test/#x"]; }],
  ["artwork outside catalog", m => { m.catalog.artwork[0].artifactPath = "cover.png"; }],
  ["duplicate artwork ID", m => { m.catalog.artwork.push({ ...m.catalog.artwork[0], kind: "banner", artifactPath: "catalog/banner.png" }); }],
  ["two covers", m => { m.catalog.artwork.push({ ...m.catalog.artwork[0], id: "other", artifactPath: "catalog/other.png" }); }],
];
for (const [name, mutate] of semantics) test(`semantic rejection: ${name}`, () => {
  const manifest = base(); mutate(manifest); assert.throws(() => validateManifest(manifest));
});

test("semantic-only G03 counterexamples now fail full validation", () => {
  const corpus = json("fixtures/package/v1/conformance.json");
  for (const vector of corpus.manifests.filter(v => v.id.includes("needs-semantic-validator"))) {
    const manifest = json("fixtures/package/v1/platform-manifest.json");
    for (const change of vector.changes) {
      let target = manifest;
      for (const part of change.path.slice(0, -1)) target = target[part];
      target[change.path.at(-1)] = change.value;
    }
    assert.throws(() => validateManifest(manifest), vector.id);
  }
  for (const name of ["reflex", "grimcellar", "racinglab"]) assert.doesNotThrow(() => validateManifest(json(`fixtures/package/v1/generated/${name}/manifest.json`)));
});

test("SemVer range comparison handles numeric prereleases, hyphens and build metadata", () => {
  const manifest = base();
  for (const [minimumVersion, maximumVersionExclusive] of [["1.0.0-alpha.2", "1.0.0-alpha.10"], ["1.0.0-a-b", "1.0.0"], ["1.0.0+build", "2.0.0"]]) {
    manifest.gameContract = { minimumVersion, maximumVersionExclusive };
    assert.doesNotThrow(() => validateManifest(manifest));
  }
  manifest.gameContract = { minimumVersion: "1.0.0+first", maximumVersionExclusive: "1.0.0+second" };
  assert.throws(() => validateManifest(manifest), /contractRange/);
});

test("full check rejects missing, undeclared and tampered payloads and exact-byte metadata changes", () => {
  const result = unsigned();
  for (const mutate of [
    entries => { entries.delete("manifest.json"); },
    entries => { entries.delete(result.manifest.components[0].artifactPath); },
    entries => { entries.set("extra.txt", Buffer.from("undeclared")); },
    entries => { entries.set(result.manifest.components[0].artifactPath, Buffer.from("tampered")); },
    entries => { entries.set("catalog/cover.png", Buffer.from("tampered")); },
    entries => { entries.set("manifest.json", Buffer.concat([entries.get("manifest.json"), Buffer.from(" ")])); },
    entries => { const e = JSON.parse(entries.get("signature.json")); e.packageSha256 = "0".repeat(64); entries.set("signature.json", serializeManifest(e)); },
  ]) assert.throws(() => checkPackage(repack(result, mutate), { allowUnsigned: true }));
  assert.throws(() => checkPackage(mutateManifest(m => { m.components[0].entryPoint = "missing.html"; }), { allowUnsigned: true }), /component.entryPoint/);
  assert.throws(() => checkPackage(mutateManifest(m => { m.players.minimum = 100; }), { allowUnsigned: true }), /manifest.players/);
});

test("duplicate and deeply nested JSON cannot bypass metadata checks", () => {
  for (const text of ['{"x":1,"x":2}', '{"nested":{"x":1,"\\u0078":2}}', '[{"x":1,"x":2}]'])
    assert.throws(() => parseMetadata(Buffer.from(text)), /json.duplicate/);
  assert.throws(() => parseMetadata(Buffer.from("[".repeat(65) + "0" + "]".repeat(65))), /json.depth/);
  assert.throws(() => parseMetadata(Buffer.from([0xff])));
  assert.throws(() => parseMetadata(Buffer.from('\ufeff{"schemaVersion":1}')));
  const result = unsigned();
  const duplicate = repack(result, entries => entries.set("manifest.json", Buffer.from(entries.get("manifest.json").toString().replace('"schemaVersion": 1', '"schemaVersion": 1, "schemaVersion": 1'))));
  assert.throws(() => checkPackage(duplicate, { allowUnsigned: true }), /json.duplicate/);
});

test("ZIP supports legacy DEFLATE and fixed STORED bytes; rejects path aliases and malformed metadata", () => {
  const files = { "index.html": Buffer.from("hello"), "dir/script.js": Buffer.from("script") };
  assert.deepEqual(readZip(zipSync(files, { level: 9 })), readZip(createZip(Object.entries(files))));
  for (const path of ["../x", "/x", "a//b", "a\\b", "a/", "C:x", "a\u0085b"]) assert.throws(() => createZip([[path, Buffer.from("x")]]));
  assert.throws(() => createZip([["x", Buffer.from("x")], ["X", Buffer.from("y")]]), /collision/);
  assert.throws(() => createZip([["a", Buffer.from("x")], ["a/b", Buffer.from("y")]]), /collision/);
  const stored = createZip([["index.html", Buffer.from("hello")]]);
  for (const mutate of [
    b => { b[30] ^= 1; }, // local name differs from central
    b => { b[40] ^= 1; }, // payload CRC mismatch
    b => { b.writeUInt16LE(1, 6); }, // local encrypted flag disagrees
    b => { b.writeUInt16LE(65535, b.length - 12); }, // ZIP64 sentinel
    b => { b.writeUInt32LE(0xffffffff, b.length - 6); }, // ZIP64 central offset
    b => { b.writeUInt16LE(1, b.length - 18); }, // multi-disk
  ]) { const changed = Buffer.from(stored); mutate(changed); assert.throws(() => readZip(changed)); }
  assert.throws(() => readZip(stored.subarray(0, stored.length - 1)));
  assert.throws(() => readZip(stored, { maxEntryBytes: 4 }), /zip.limit/);
  assert.throws(() => readZip(stored, { maxEntries: 0 }), /zip.limits/);
  assert.throws(() => readZip(stored, null), /zip.limits/);
  const bomName = createZip([["\ufeffindex.html", Buffer.from("hello")]]);
  assert.ok(readZip(bomName).has("\ufeffindex.html"));
  assert.equal(readZip(bomName).has("index.html"), false);
});

test("ZIP data descriptors are validated against central metadata", () => {
  const stored = createZip([["index.html", Buffer.from("hello")]]);
  const start = stored.readUInt32LE(stored.length - 6);
  const local = Buffer.from(stored.subarray(0, start));
  const central = Buffer.from(stored.subarray(start, stored.length - 22));
  const end = Buffer.from(stored.subarray(stored.length - 22));
  const descriptor = Buffer.alloc(16);
  descriptor.writeUInt32LE(0x08074b50); local.copy(descriptor, 4, 14, 26);
  local.writeUInt16LE(0x808, 6); local.fill(0, 14, 26); central.writeUInt16LE(0x808, 8);
  end.writeUInt32LE(start + 16, 16);
  const streamed = Buffer.concat([local, descriptor, central, end]);
  assert.equal(readZip(streamed).get("index.html").toString(), "hello");
  const corrupted = Buffer.from(streamed); corrupted[start + 4] ^= 1;
  assert.throws(() => readZip(corrupted), /zip.descriptor/);
});

test("ZIP preflight prevents decompression bombs, links, overlapping records and duplicate names", () => {
  const deflated = Buffer.from(zipSync({ "index.html": Buffer.alloc(100000, 65) }, { level: 9 }));
  const central = deflated.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  deflated.writeUInt32LE(1, 22); deflated.writeUInt32LE(1, central + 24);
  assert.throws(() => readZip(deflated)); // actual inflate exceeds claimed size
  const pair = createZip([["a.txt", Buffer.from("a")], ["b.txt", Buffer.from("b")]]);
  const c1 = pair.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])), c2 = c1 + 46 + 5;
  for (const mutate of [
    b => { b.writeUInt32LE((0xa000 << 16) >>> 0, c1 + 38); },
    b => { b.writeUInt32LE((0x1000 << 16) >>> 0, c1 + 38); },
    b => { b.writeUInt32LE((0x4000 << 16) >>> 0, c1 + 38); },
    b => { b.writeUInt32LE(0, c2 + 42); },
    b => { b[c2 + 46] = 97; b[36 + 30] = 97; },
  ]) { const bytes = Buffer.from(pair); mutate(bytes); assert.throws(() => readZip(bytes)); }
  const result = unsigned(), outer = readZip(result.bytes);
  const expanded = [...outer.values()].reduce((n, b) => n + b.length, 0);
  assert.throws(() => checkPackage(result.bytes, { allowUnsigned: true, limits: { maxTotalBytes: expanded + 1 } }), /zip.limit/);
});

test("producer rejects missing/extra sources and missing entry points", () => {
  const candidate = input(); candidate.components.extra = { "index.html": Buffer.from("x") };
  assert.throws(() => buildPackage(candidate), /build.sources/);
  const missing = input(); delete missing.components[missing.manifest.components[0].id];
  assert.throws(() => buildPackage(missing), /build.sources/);
  const entry = input(); entry.components[entry.manifest.components[0].id] = { "other.html": Buffer.from("x") };
  assert.throws(() => buildPackage(entry), /component.entryPoint/);
});
