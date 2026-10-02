#!/usr/bin/env node
import { lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { buildPackage, checkPackage, PackageError } from "../src/package-tools.js";
import { parseMetadata } from "../src/package-tools/manifest.js";
import { zipLimits } from "../src/package-tools/zip.js";

const usage = "partybeam package build --config <json> --output <file.partybeam> [--private-key <pem> --key-id <id>] | partybeam package check --package <file.partybeam> [--allow-unsigned] [--public-key <id=pem-file> ...]";
const fail = (condition, message) => { if (!condition) throw new PackageError("cli.arguments", message); };
function readBounded(path, maxBytes) {
  const stat = lstatSync(path);
  fail(stat.isFile() && stat.size <= maxBytes, `Expected a regular file within size limit: ${path}`);
  const bytes = readFileSync(path);
  fail(bytes.length <= maxBytes, `File exceeded size limit: ${path}`);
  return bytes;
}
function readDirectory(path, limits) {
  const files = Object.create(null);
  let total = 0, count = 0, directories = 0;
  const visit = (directory, prefix = "", depth = 0) => {
    fail(depth < 64 && ++directories <= limits.maxEntries, "Component directory traversal limit exceeded.");
    fail(lstatSync(directory).isDirectory(), `Component root must be a regular directory: ${directory}`);
    for (const name of readdirSync(directory).sort()) {
      const absolute = join(directory, name), relative = prefix ? `${prefix}/${name}` : name;
      const stat = lstatSync(absolute);
      if (stat.isDirectory()) visit(absolute, relative, depth + 1);
      else {
        fail(stat.isFile() && stat.size <= limits.maxEntryBytes, `Unsupported or oversized component file: ${relative}`);
        total += stat.size; count++;
        fail(total <= limits.maxTotalBytes && count <= limits.maxEntries, "Component source limit exceeded.");
        files[relative] = readBounded(absolute, limits.maxEntryBytes);
      }
    }
  };
  visit(path); return files;
}

try {
  const [noun, command, ...args] = process.argv.slice(2);
  if (noun === "--help") { console.log(usage); process.exit(0); }
  fail(noun === "package" && ["build", "check"].includes(command), usage);
  const allowed = command === "build" ? ["--config", "--output", "--private-key", "--key-id"] : ["--package", "--allow-unsigned", "--public-key"];
  const options = new Map(), keys = Object.create(null);
  for (let i = 0; i < args.length; i++) {
    const option = args[i];
    fail(allowed.includes(option), `Unknown option: ${option}`);
    fail(option === "--public-key" || !options.has(option), `Duplicate option: ${option}`);
    if (option === "--allow-unsigned") { options.set(option, true); continue; }
    const value = args[++i]; fail(value && !value.startsWith("--"), `Missing value for ${option}`);
    if (option === "--public-key") {
      const equal = value.indexOf("="); fail(equal > 0 && equal < value.length - 1, "Public key must be id=pem-file.");
      const id = value.slice(0, equal); fail(!Object.hasOwn(keys, id), `Duplicate public key: ${id}`);
      keys[id] = readBounded(resolve(value.slice(equal + 1)), 1024 * 1024).toString("utf8");
    } else options.set(option, value);
  }
  let result;
  if (command === "check") {
    fail(options.has("--package"), "--package is required.");
    result = checkPackage(readBounded(resolve(options.get("--package")), zipLimits().maxArchiveBytes),
      { allowUnsigned: options.has("--allow-unsigned"), publicKeys: keys });
  } else {
    fail(options.has("--config") && options.has("--output"), "--config and --output are required.");
    const configPath = resolve(options.get("--config")), root = dirname(configPath);
    const config = parseMetadata(readBounded(configPath, 1024 * 1024));
    fail(config && typeof config === "object" && !Array.isArray(config)
      && Object.keys(config).every(key => ["manifest", "components", "artwork", "limits"].includes(key)), "Invalid producer config.");
    const limits = zipLimits(config.limits);
    const manifest = typeof config.manifest === "string" ? parseMetadata(readBounded(resolve(root, config.manifest), 1024 * 1024)) : config.manifest;
    fail(config.components && typeof config.components === "object" && !Array.isArray(config.components), "Config must map component IDs to directories.");
    fail(config.artwork === undefined || (config.artwork && typeof config.artwork === "object" && !Array.isArray(config.artwork)), "Artwork must map IDs to files.");
    let sourceBytes = 0;
    const components = Object.fromEntries(Object.entries(config.components).map(([id, path]) => {
      fail(sourceBytes < limits.maxTotalBytes, "Aggregate source size limit exceeded.");
      const files = readDirectory(resolve(root, path), { ...limits, maxTotalBytes: limits.maxTotalBytes - sourceBytes });
      sourceBytes += Object.values(files).reduce((sum, bytes) => sum + bytes.length, 0);
      return [id, files];
    }));
    const artwork = Object.fromEntries(Object.entries(config.artwork ?? {}).map(([id, path]) => {
      fail(sourceBytes < limits.maxTotalBytes, "Aggregate source size limit exceeded.");
      const bytes = readBounded(resolve(root, path), Math.min(limits.maxEntryBytes, limits.maxTotalBytes - sourceBytes));
      sourceBytes += bytes.length;
      return [id, bytes];
    }));
    let signing;
    fail(options.has("--private-key") === options.has("--key-id"), "Signing requires both --private-key and --key-id.");
    if (options.has("--private-key")) signing = { keyId: options.get("--key-id"),
      privateKeyPem: readBounded(resolve(options.get("--private-key")), 1024 * 1024).toString("utf8") };
    result = buildPackage({ manifest, components, artwork, signing, limits });
    const output = resolve(options.get("--output"));
    mkdirSync(dirname(output), { recursive: true });
    // Exclusive write: never silently replace a released artifact or source file.
    writeFileSync(output, result.bytes, { flag: "wx" });
  }
  console.log(JSON.stringify({ ok: true, gameId: result.manifest.gameId, version: result.manifest.version,
    profile: result.profile, signatureVerified: result.signatureVerified, outerSha256: result.outerSha256,
    manifestSha256: result.envelope.manifestSha256, packageSha256: result.envelope.packageSha256, warnings: result.warnings }));
} catch (error) {
  console.error(JSON.stringify({ ok: false, code: error.code ?? "package.invalid", message: error.message }));
  process.exitCode = 1;
}
