import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, generateKeyPairSync } from "node:crypto";

const root = fileURLToPath(new URL("../", import.meta.url));
test("packed CLI builds/checks offline, preserves outputs, verifies signing and rejects bad arguments", () => {
  mkdirSync(join(root, ".proof"), { recursive: true });
  const cwd = mkdtempSync(join(root, ".proof", "cli-"));
  const run = args => spawnSync(process.execPath, args, { cwd, encoding: "utf8" });
  const npm = args => {
    assert.ok(process.env.npm_execpath, "Run npm test so the npm entrypoint is known.");
    const result = run([process.env.npm_execpath, ...args]);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  const packed = JSON.parse(npm(["pack", root, "--json", "--pack-destination", cwd]))[0];
  const sdk = JSON.parse(readFileSync(join(root, "package.json")));
  const sdkLock = JSON.parse(readFileSync(join(root, "package-lock.json")));
  const specifier = `file:${packed.filename}`, dependencies = { [sdk.name]: specifier };
  writeFileSync(join(cwd, "package.json"), JSON.stringify({ name: "sdk-cli-test", private: true, type: "module", dependencies }));
  // npm ci caches tarballs, not necessarily registry packuments. Pin the entire
  // production graph from the SDK lock so a fresh CI cache needs no metadata fetch.
  const production = Object.fromEntries(Object.entries(sdkLock.packages).filter(([path, record]) => path && !record.dev));
  writeFileSync(join(cwd, "package-lock.json"), JSON.stringify({ name: "sdk-cli-test", lockfileVersion: 3, requires: true,
    packages: { "": { name: "sdk-cli-test", dependencies }, ...production,
      [`node_modules/${sdk.name}`]: { version: sdk.version, resolved: specifier,
        integrity: `sha512-${createHash("sha512").update(readFileSync(join(cwd, packed.filename))).digest("base64")}`,
        dependencies: sdk.dependencies, bin: sdk.bin, engines: sdk.engines } } }));
  npm(["ci", "--offline", "--ignore-scripts", "--no-audit", "--no-fund"]);
  assert.ok(existsSync(join(cwd, "node_modules/.bin", process.platform === "win32" ? "partybeam.cmd" : "partybeam")));
  const cliPath = join(cwd, "node_modules/@partybeam/game-sdk/bin/partybeam.mjs");
  const cli = (...args) => run([cliPath, "package", ...args]);
  const manifest = JSON.parse(readFileSync(join(root, "fixtures/package/v1/generated/grimcellar/manifest.json")));
  const components = {};
  for (const component of manifest.components) {
    const path = `surface ${component.id}`; components[component.id] = path;
    mkdirSync(join(cwd, path)); writeFileSync(join(cwd, path, component.entryPoint), "<!doctype html><title>Fixture</title>");
    delete component.sha256;
  }
  writeFileSync(join(cwd, "producer.json"), JSON.stringify({ manifest, components }));
  const build = file => cli("build", "--config", "producer.json", "--output", file);
  const first = build("first.partybeam"); assert.equal(first.status, 0, first.stderr);
  assert.equal(build("second.partybeam").status, 0);
  const bytes = readFileSync(join(cwd, "first.partybeam"));
  assert.deepEqual(bytes, readFileSync(join(cwd, "second.partybeam")));
  assert.equal(build("first.partybeam").status, 1);
  assert.deepEqual(bytes, readFileSync(join(cwd, "first.partybeam")));
  assert.equal(cli("check", "--package", "first.partybeam").status, 1);
  const checked = cli("check", "--package", "first.partybeam", "--allow-unsigned");
  assert.equal(checked.status, 0, checked.stderr); assert.equal(JSON.parse(checked.stdout).profile, "unsigned");
  const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1", privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" } });
  writeFileSync(join(cwd, "private.pem"), pair.privateKey); writeFileSync(join(cwd, "public.pem"), pair.publicKey);
  const signed = cli("build", "--config", "producer.json", "--output", "signed.partybeam", "--key-id", "fixture", "--private-key", "private.pem");
  assert.equal(signed.status, 0, signed.stderr);
  const signatureCheck = cli("check", "--package", "signed.partybeam", "--public-key", "fixture=public.pem");
  assert.equal(signatureCheck.status, 0, signatureCheck.stderr);
  assert.equal(JSON.parse(signatureCheck.stdout).signatureVerified, true);
  for (const args of [["check"], ["build", "--unknown", "x"], ["build", "--config"],
    ["check", "--package", "first.partybeam", "--package", "second.partybeam"],
    ["check", "--package", "first.partybeam", "--public-key", "bad"]]) {
    const failure = cli(...args); assert.equal(failure.status, 1); assert.equal(JSON.parse(failure.stderr).ok, false);
  }
  writeFileSync(join(cwd, "duplicate.json"), '{"manifest":{},"manifest":{}}');
  assert.equal(cli("build", "--config", "duplicate.json", "--output", "bad.partybeam").status, 1);
});
