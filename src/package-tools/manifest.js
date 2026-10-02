import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import { assertSafeArtifactPath } from "../package-v1.js";
import { pathKey } from "./zip.js";
import { requirePackage as need } from "./errors.js";

// Stop at the first schema failure; hostile large arrays must not accumulate
// an unbounded diagnostics collection before their cardinality is rejected.
const ajv = new Ajv2020({ strict: true, allErrors: false });
const schema = name => ajv.compile(JSON.parse(readFileSync(new URL(`../../schemas/${name}`, import.meta.url))));
const manifestSchema = schema("game-package-manifest.v1.schema.json");
const envelopeSchema = schema("game-package-signature-envelope.v1.schema.json");
export function validateEnvelope(envelope) {
  need(envelopeSchema(envelope), "envelope.schema", JSON.stringify(envelopeSchema.errors));
  if (envelope.signature) need(envelope.signature.keyId.trim(), "signature.keyId", "Signature keyId cannot be whitespace.");
}

export function parseMetadata(input) {
  const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(input);
  const value = JSON.parse(text);
  // JSON.parse alone silently accepts duplicate keys, including escaped spellings.
  const stack = [];
  for (const match of text.matchAll(/"(?:\\.|[^"\\])*"|[{}\[\]:,]|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g)) {
    const token = match[0], current = stack.at(-1);
    if (token === "{" || token === "[") {
      need(stack.length < 64, "json.depth", "Metadata nesting exceeds 64 levels.");
      stack.push({ object: token === "{", key: true, seen: new Set() });
    } else if (token === "}" || token === "]") stack.pop();
    else if (token === "," && current?.object) current.key = true;
    else if (token.startsWith('"') && current?.object && current.key) {
      const key = JSON.parse(token);
      need(!current.seen.has(key), "json.duplicate", `Duplicate JSON property: ${key}`);
      current.seen.add(key); current.key = false;
    }
  }
  return value;
}

function compareVersions(a, b) {
  const split = value => {
    const [core, prerelease] = value.split("+")[0].split("-");
    // Prerelease identifiers may themselves contain '-', so split only once.
    const raw = value.split("+")[0], dash = raw.indexOf("-");
    return { core: core.split(".").map(BigInt), pre: prerelease === undefined ? null : raw.slice(dash + 1).split(".") };
  };
  const left = split(a), right = split(b);
  for (let i = 0; i < 3; i++) if (left.core[i] !== right.core[i]) return left.core[i] < right.core[i] ? -1 : 1;
  if (left.pre === null || right.pre === null) return left.pre === right.pre ? 0 : left.pre === null ? 1 : -1;
  for (let i = 0; i < Math.min(left.pre.length, right.pre.length); i++) {
    const x = left.pre[i], y = right.pre[i];
    if (x === y) continue;
    const xn = /^\d+$/.test(x), yn = /^\d+$/.test(y);
    if (xn && yn) return BigInt(x) < BigInt(y) ? -1 : 1;
    if (xn !== yn) return xn ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return Math.sign(left.pre.length - right.pre.length);
}
function locales(list, field) {
  const folded = list.map(pathKey);
  need(new Set(folded).size === folded.length && folded.includes("EN"), "manifest.locales", `${field} needs unique locales and English fallback.`);
}

export function validateManifest(manifest) {
  need(manifestSchema(manifest), "manifest.schema", JSON.stringify(manifestSchema.errors));
  need(manifest.publisher.displayName.trim() && manifest.catalog.canonicalTitle.trim(), "manifest.metadata", "Publisher and title cannot be whitespace.");
  need(Number.isSafeInteger(manifest.players.minimum) && Number.isSafeInteger(manifest.players.maximum)
    && manifest.players.maximum >= manifest.players.minimum, "manifest.players", "Invalid player range.");
  need(compareVersions(manifest.gameContract.minimumVersion, manifest.gameContract.maximumVersionExclusive) < 0,
    "manifest.contractRange", "Game Contract minimum must precede exclusive maximum.");
  locales(manifest.catalogLocales, "catalogLocales");
  const ids = new Set(), paths = new Set([pathKey("manifest.json"), pathKey("signature.json")]);
  for (const component of manifest.components) {
    need(!ids.has(component.id), "manifest.componentId", `Duplicate component id: ${component.id}`); ids.add(component.id);
    need(component.releaseVersion === manifest.version, "manifest.releaseVersion", "All component versions must exactly equal the package version.");
    locales(component.runtimeLocales, `components.${component.id}.runtimeLocales`);
    assertSafeArtifactPath(component.entryPoint);
  }
  const artworkIds = new Set();
  const artwork = manifest.catalog.artwork ?? [];
  need(artwork.filter(a => a.kind === "cover").length <= 1, "manifest.cover", "At most one canonical cover is allowed.");
  for (const asset of artwork) {
    need(!artworkIds.has(asset.id), "manifest.artworkId", `Duplicate artwork id: ${asset.id}`); artworkIds.add(asset.id);
    need(asset.artifactPath.startsWith("catalog/"), "manifest.artworkPath", "Artwork must be under catalog/.");
  }
  for (const asset of [...manifest.components, ...artwork]) {
    assertSafeArtifactPath(asset.artifactPath);
    need(!paths.has(pathKey(asset.artifactPath)), "manifest.artifactPath", `Reserved or colliding artifact: ${asset.artifactPath}`);
    paths.add(pathKey(asset.artifactPath));
  }
  const localized = new Map();
  for (const [locale, metadata] of Object.entries(manifest.catalog.localized)) {
    const key = pathKey(locale);
    need(!localized.has(key) && manifest.catalogLocales.some(l => pathKey(l) === key), "manifest.catalogLocale", "Undeclared or colliding catalog locale.");
    localized.set(key, metadata);
  }
  need(localized.get("EN")?.shortDescription.trim(), "manifest.english", "English short description is required.");
  const warnings = manifest.catalogLocales.filter(l => !localized.get(pathKey(l))?.shortDescription.trim())
    .map(l => `Catalog translation ${l} falls back to English.`);
  if (manifest.catalog.supportUrl != null) {
    try { need(new URL(manifest.catalog.supportUrl).protocol === "https:", "support.url", "HTTPS required."); }
    catch { warnings.push("Invalid supportUrl is ignored at runtime."); }
  }
  const { required, optional } = manifest.capabilities;
  need(!required.some(c => optional.includes(c)), "manifest.capabilityOverlap", "A capability cannot be required and optional.");
  const internet = [...required, ...optional].includes("internetAccess");
  need(internet === (manifest.network.outboundAllowlist.length > 0), "manifest.network", "internetAccess and nonempty HTTPS allowlist must be declared together.");
  for (const destination of manifest.network.outboundAllowlist) {
    let url;
    try { url = new URL(destination); } catch { need(false, "manifest.destination", `Invalid HTTPS destination: ${destination}`); }
    need(/^https:\/\//i.test(destination) && url.protocol === "https:" && url.hostname && !url.username && !url.password && !destination.includes("#"),
      "manifest.destination", "WAN destinations require HTTPS without user-info/fragment.");
  }
  return warnings;
}

export function serializeManifest(value) {
  const canonical = item => {
    if (Array.isArray(item)) return item.map(canonical);
    if (item && typeof item === "object") return Object.fromEntries(Object.keys(item).sort().map(key => [key, canonical(item[key])]));
    return item;
  };
  return Buffer.from(`${JSON.stringify(canonical(value), null, 2)}\n`, "utf8");
}
