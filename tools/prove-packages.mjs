// Generate real consumer packages in disposable, exact Git snapshots.
// This proves schema/descriptor extraction, not adoption or execution policy.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import { unzipSync } from "fflate";

const root = fileURLToPath(new URL("../", import.meta.url));
const configPath = process.argv[2];
if (!configPath) throw new Error("Usage: npm run prove:packages -- <consumer-config.json>");
const config = JSON.parse(readFileSync(resolve(configPath), "utf8"));
assert.ok(Array.isArray(config.consumers) && config.consumers.length > 0);
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("Run through npm run prove:packages.");
function run(command, args, cwd, capture = false) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", stdio: capture ? "pipe" : "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status}): ${result.stderr ?? ""}`);
  return result.stdout?.trim();
}
const npm = (args, cwd, capture = false) => run(process.execPath, [npmCli, ...args], cwd, capture);
mkdirSync(join(root, ".proof"), { recursive: true });
const proof = mkdtempSync(join(root, ".proof", "packages-"));
const packed = JSON.parse(npm(["pack", "--json", "--pack-destination", proof], root, true))[0];
const sdkHost = join(proof, "sdk");
mkdirSync(sdkHost);
writeFileSync(join(sdkHost, "package.json"), '{"private":true,"type":"module"}\n');
npm(["install", "--ignore-scripts", "--no-audit", "--no-fund", join(proof, packed.filename)], sdkHost);
const sdkRoot = join(sdkHost, "node_modules/@partybeam/game-sdk");
const { sha256, buildPackageDescriptor, createUnsignedIntegrityEnvelope } =
  await import(pathToFileURL(join(sdkRoot, "src/package-v1.js")));
const json = file => JSON.parse(readFileSync(file, "utf8"));
const ajv = new Ajv2020({ strict: true, allErrors: true });
const validateManifest = ajv.compile(json(join(sdkRoot, "schemas/game-package-manifest.v1.schema.json")));
const validateEnvelope = ajv.compile(json(join(sdkRoot, "schemas/game-package-signature-envelope.v1.schema.json")));
const report = { sdkVersion: json(join(sdkRoot, "package.json")).version,
  // Records the actual pre-fixture tarball tested, not the final release tarball.
  testedTarballSha256: sha256(readFileSync(join(proof, packed.filename))), node: process.version, consumers: [] };
for (const consumer of config.consumers) {
  assert.match(consumer.name, /^[a-z]+$/);
  const checkout = resolve(consumer.checkout);
  const commit = run("git", ["rev-parse", `${consumer.ref}^{commit}`], checkout, true);
  const snapshot = join(proof, consumer.name);
  mkdirSync(snapshot);
  const archivePath = join(proof, `${consumer.name}.tar`);
  run("git", ["archive", "--format=tar", `--output=${archivePath}`, commit], checkout);
  run("tar", ["-xf", archivePath, "-C", snapshot], root);
  // Existing producers own these build steps. Never run them in the user's checkout.
  npm([existsSync(join(snapshot, "package-lock.json")) ? "ci" : "install", "--ignore-scripts", "--no-audit", "--no-fund"], snapshot);
  npm(["run", "package"], snapshot);
  const scripts = json(join(snapshot, "package.json")).scripts;
  if (scripts["check:package"]) npm(["run", "check:package"], snapshot);
  const bytes = readFileSync(join(snapshot, consumer.packagePath));
  const entries = unzipSync(bytes);
  assert.ok(entries["manifest.json"] && entries["signature.json"]);
  const manifestBytes = Buffer.from(entries["manifest.json"]);
  const manifest = JSON.parse(manifestBytes);
  const envelope = JSON.parse(Buffer.from(entries["signature.json"]));
  assert.equal(validateManifest(manifest), true, JSON.stringify(validateManifest.errors));
  assert.equal(validateEnvelope(envelope), true, JSON.stringify(validateEnvelope.errors));
  const unsigned = createUnsignedIntegrityEnvelope(manifestBytes, manifest.components);
  assert.equal(envelope.manifestSha256, unsigned.manifestSha256);
  assert.equal(envelope.packageSha256, unsigned.packageSha256);
  assert.equal(Object.hasOwn(envelope, "signature"), false, "This proof builds the unsigned profile.");
  for (const artifact of [...manifest.components, ...(manifest.catalog.artwork ?? [])]) {
    assert.ok(entries[artifact.artifactPath], `Missing ${artifact.artifactPath}`);
    assert.equal(sha256(entries[artifact.artifactPath]), artifact.sha256);
  }
  const descriptor = buildPackageDescriptor(envelope.manifestSha256, manifest.components);
  if (consumer.descriptorPath) assert.deepEqual(descriptor, readFileSync(join(snapshot, consumer.descriptorPath)));
  const dependencies = json(join(snapshot, "package-lock.json")).packages;
  const resolvedDependencies = Object.fromEntries(Object.entries(dependencies)
    .filter(([key]) => key.startsWith("node_modules/")).map(([key, value]) => [key, value.version]));
  const evidence = { name: consumer.name, repository: consumer.repository, commit,
    ref: consumer.ref, packagePath: consumer.packagePath, outerSha256: sha256(bytes),
    manifestSha256: envelope.manifestSha256, packageSha256: envelope.packageSha256,
    resolvedDependencies };
  report.consumers.push(evidence);
  const output = join(proof, `${consumer.name}-fixture`);
  mkdirSync(output);
  writeFileSync(join(output, "manifest.json"), manifestBytes);
  writeFileSync(join(output, "envelope.json"), `${JSON.stringify(envelope, null, 2)}\n`);
  writeFileSync(join(output, "descriptor.txt"), descriptor);
  console.log(`PASS ${consumer.repository}@${commit}: schemas, artifact hashes, exact manifest/descriptor hashes`);
}
writeFileSync(join(proof, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(`Proof and fixtures: ${proof}`);
