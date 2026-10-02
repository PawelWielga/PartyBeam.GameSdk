// Rebuild existing real producer packages with SDK-owned algorithms, without
// changing a game checkout. Consumer adoption/removal remains G05-G07.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPackage, checkPackage } from "../src/package-tools.js";
import { readZip } from "../src/package-tools/zip.js";

const packages = process.argv.slice(2);
if (!packages.length) throw new Error("Usage: npm run prove:producer -- <real.package.partybeam> [...]");
const root = fileURLToPath(new URL("../", import.meta.url));
mkdirSync(join(root, ".proof"), { recursive: true });
const output = mkdtempSync(join(root, ".proof", "producer-"));
const report = [];
for (const file of packages) {
  const bytes = readFileSync(resolve(file));
  const original = checkPackage(bytes, { allowUnsigned: true });
  const entries = readZip(bytes), manifest = original.manifest;
  const components = Object.fromEntries(manifest.components.map(component =>
    [component.id, Object.fromEntries(readZip(entries.get(component.artifactPath)))]));
  const artwork = Object.fromEntries((manifest.catalog.artwork ?? []).map(asset => [asset.id, entries.get(asset.artifactPath)]));
  const rebuilt = buildPackage({ manifest, components, artwork });
  assert.deepEqual(rebuilt.bytes, buildPackage({ manifest, components, artwork }).bytes);
  const generated = readZip(rebuilt.bytes);
  for (const component of manifest.components) {
    assert.deepEqual(readZip(generated.get(component.artifactPath)), readZip(entries.get(component.artifactPath)));
  }
  const packagePath = join(output, `${manifest.gameId}-${manifest.version}.partybeam`);
  writeFileSync(packagePath, rebuilt.bytes, { flag: "wx" });
  report.push({ gameId: manifest.gameId, version: manifest.version, sourceOuterSha256: original.outerSha256,
    rebuiltOuterSha256: rebuilt.outerSha256, rebuiltManifestSha256: rebuilt.envelope.manifestSha256,
    rebuiltPackageSha256: rebuilt.envelope.packageSha256, bytes: rebuilt.bytes.length, packagePath });
  console.log(`PASS ${manifest.gameId}: SDK build/check, deterministic bytes, unchanged component content`);
}
writeFileSync(join(output, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(`Proof: ${output}`);
