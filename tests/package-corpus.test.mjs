import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import { buildPackageDescriptor, createUnsignedIntegrityEnvelope, hashEquals, sha256 } from "@partybeam/game-sdk/package-v1";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url));
const json = path => JSON.parse(read(path));
const directory = "fixtures/package/v1/";
const ajv = new Ajv2020({ strict: true, allErrors: true });
const manifestSchema = ajv.compile(json("schemas/game-package-manifest.v1.schema.json"));
const envelopeSchema = ajv.compile(json("schemas/game-package-signature-envelope.v1.schema.json"));
const corpus = json(`${directory}conformance.json`);

test("generated proof metadata agrees with the shipped exact-byte fixtures", () => {
  const proof = json(`${directory}generated/proof.json`);
  assert.deepEqual(proof.consumers.map(c => c.name), corpus.generated);
  for (const consumer of proof.consumers) {
    assert.match(consumer.commit, /^[a-f0-9]{40}$/);
    const envelope = json(`${directory}generated/${consumer.name}/envelope.json`);
    assert.equal(consumer.manifestSha256, envelope.manifestSha256);
    assert.equal(consumer.packageSha256, envelope.packageSha256);
  }
});

// Data-only vectors are reusable by Platform/Catalog; assertions distinguish
// schema structure, descriptor constraints and exact-byte integrity.
function candidate(base, changes) {
  const value = structuredClone(base);
  for (const { path, operation, value: replacement } of changes ?? []) {
    let parent = value;
    for (const key of path.slice(0, -1)) parent = parent[key];
    const key = path.at(-1);
    if (operation === "delete") delete parent[key];
    else { assert.equal(operation, "set"); parent[key] = replacement; }
  }
  return value;
}

for (const name of corpus.generated) {
  test(`generated ${name}: unchanged schemas and independently produced hashes`, () => {
    const bytes = read(`${directory}generated/${name}/manifest.json`);
    const manifest = JSON.parse(bytes);
    const envelope = json(`${directory}generated/${name}/envelope.json`);
    assert.equal(manifestSchema(manifest), true, JSON.stringify(manifestSchema.errors));
    assert.equal(envelopeSchema(envelope), true, JSON.stringify(envelopeSchema.errors));
    assert.deepEqual(createUnsignedIntegrityEnvelope(bytes, manifest.components), envelope);
    assert.deepEqual(buildPackageDescriptor(envelope.manifestSha256, manifest.components),
      read(`${directory}generated/${name}/descriptor.txt`));
    assert.equal(sha256(bytes), envelope.manifestSha256);
    const mutated = Buffer.from(bytes.toString("utf8").replaceAll("\n", "\r\n"));
    assert.equal(hashEquals(sha256(mutated), envelope.manifestSha256), false);
    assert.equal(hashEquals(sha256(Buffer.concat([bytes, Buffer.from(" ")])), envelope.manifestSha256), false);
  });
}

test("repaired Catalog snapshot binds committed LF bytes without normalization", () => {
  const bytes = read(`${directory}catalog-lf-manifest.json`);
  const manifest = JSON.parse(bytes);
  const envelope = json(`${directory}catalog-lf-envelope.json`);
  assert.equal(manifestSchema(manifest), true);
  assert.equal(envelopeSchema(envelope), true);
  assert.equal(sha256(bytes), envelope.manifestSha256);
  assert.equal(sha256(buildPackageDescriptor(envelope.manifestSha256, manifest.components)), envelope.packageSha256);
});

for (const vector of corpus.manifests) {
  test(`manifest corpus: ${vector.id}`, () => {
    const base = json(`${directory}${corpus.bases.manifest}`);
    const manifest = candidate(base, vector.changes);
    assert.equal(manifestSchema(manifest), vector.schemaValid, JSON.stringify(manifestSchema.errors));
    if (vector.descriptorValid !== undefined) {
      const run = () => buildPackageDescriptor("a".repeat(64), manifest.components);
      if (vector.descriptorValid) assert.doesNotThrow(run);
      else assert.throws(run, TypeError);
    }
  });
}

for (const vector of corpus.envelopes) {
  test(`envelope corpus: ${vector.id}`, () => {
    const base = json(`${directory}${corpus.bases.envelope}`);
    const envelope = candidate(base, vector.changes);
    assert.equal(envelopeSchema(envelope), vector.schemaValid, JSON.stringify(envelopeSchema.errors));
    if (vector.integrityValid !== undefined) {
      const bytes = read(`${directory}generated/reflex/manifest.json`);
      const expected = createUnsignedIntegrityEnvelope(bytes, JSON.parse(bytes).components);
      assert.equal(hashEquals(envelope.manifestSha256, expected.manifestSha256)
        && hashEquals(envelope.packageSha256, expected.packageSha256), vector.integrityValid);
    }
  });
}

for (const vector of corpus.descriptors) {
  test(`descriptor corpus: ${vector.id}`, () => {
    if (!vector.valid) {
      assert.throws(() => buildPackageDescriptor(vector.manifestSha256, vector.components), TypeError);
      return;
    }
    const bytes = buildPackageDescriptor(vector.manifestSha256, vector.components);
    assert.equal(bytes.toString("utf8"), vector.expectedUtf8);
    assert.equal(sha256(bytes), vector.expectedSha256);
  });
}
