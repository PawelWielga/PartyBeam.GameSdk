# Package producer workflow

SDK `0.1.0-alpha.3` provides Node-only package-v1 build/check APIs and the installed `partybeam` CLI. The browser Game Contract client remains a separate entry point and never imports Node tooling. Node tooling uses pinned MIT-licensed Ajv to validate the bundled schemas offline; it has no dependency on Platform, Catalog or Dihor implementation projects.

## Build and check

Build the game's surfaces first, then provide a producer config:

```json
{
  "manifest": "manifest.json",
  "components": {
    "tv": "dist/tv",
    "android-controller": "dist/controller"
  },
  "artwork": { "cover": "catalog/cover.png" }
}
```

The manifest may also be embedded as an object. It declares the full version-1 metadata (including component IDs/kinds/paths/entry points, exact release version and locales); component/artwork `sha256` fields may be omitted because build computes them. Config `components` maps manifest component IDs to already-built directories; `artwork` maps declared artwork IDs to files. Keys must exactly match the manifest. Omit `artwork` when none is declared. Config paths resolve relative to the config file; output and key-file paths resolve relative to the command's working directory. Games own their metadata, staging layout and surface build, while SDK owns archive/hash/verification algorithms.

```text
partybeam package build --config producer.json --output artifacts/game.partybeam
partybeam package check --package artifacts/game.partybeam --allow-unsigned
```

Build returns machine-readable JSON on stdout and refuses to overwrite an existing artifact. Both commands return nonzero on failure with JSON diagnostics on stderr. Workflows should write to a fresh staging location and preserve immutable released artifacts. Source symlinks/junctions, special files and excessive directory depth/count are rejected. Package check reads bytes in memory and never extracts files to disk or executes game content.

## Signing

```text
partybeam package build --config producer.json --output artifacts/signed.partybeam --private-key private.pem --key-id producer-key
partybeam package check --package artifacts/signed.partybeam --public-key producer-key=public.pem
```

Keys must be PEM-encoded P-256 keys. The signature is ECDSA SHA-256 over the exact logical descriptor, encoded as canonical 64-byte IEEE P1363 Base64. `--public-key` may be repeated for distinct IDs. A present signature always requires a matching supplied key and successful verification, even with `--allow-unsigned`. Unsigned check requires explicit opt-in. The result distinguishes `profile: signed/unsigned` and `signatureVerified`.

Supplying a public key proves cryptographic agreement only. It does not authorize publication/execution or associate the key with a trusted publisher. Official publisher identity, key retirement, publication provenance, sandbox policy and installed-host compatibility remain Platform/GameCatalog responsibilities. Unsigned producer output can be used by their explicit First MVP unsigned-official policy; this tool does not grant official status.

## Programmatic API

```js
import { buildPackage, checkPackage } from "@partybeam/game-sdk/package-tools";
const produced = buildPackage({
  manifest,
  components: {
    tv: { "index.html": tvHtmlBytes, "assets/game.js": gameBytes },
    "android-controller": { "index.html": controllerHtmlBytes }
  },
  artwork: { cover: coverBytes }
});
const checked = checkPackage(produced.bytes, { allowUnsigned: true });
```

The API accepts `Uint8Array`/Buffer payloads, copies source data, and returns bytes plus manifest/envelope, hashes, profile and warnings. `validateManifest` is available for structural and semantic validation of a full manifest with hashes. `PackageError.code` identifies validation failures; malformed encodings, zlib/crypto errors and I/O errors may also throw their native errors. Build always verifies its output before returning it. The API can override the positive integer size/count limits through `limits`; CLI check uses defaults. A build config can pass `limits`, but checking larger custom-limit artifacts requires the API with matching limits.

## Determinism and archive safety

Unsigned SDK output is deterministic: canonical object-key order, preserved array order, ordinal ZIP entry order, LF JSON, UTF-8 paths, fixed 1980-01-01 timestamps and STORED compression. Identical content/metadata produces identical component/container bytes independent of source traversal order, timezone and compressor versions. STORED output trades size for reproducibility; a future compression change requires a documented producer-version change and renewed conformance proof.

Signed output retains the same deterministic manifest/components/logical descriptor. ECDSA nonces make signature bytes nondeterministic; do not expect signed outer archive hashes to repeat. Manifest/schema version `1` and Game Contract wire versions are unchanged.

Canonical serialization and fixed archive construction can change the hashes relative to legacy producers even when game content is unchanged. Existing published artifacts must remain immutable. Adopt new tooling in a new game package release rather than republishing an existing game/version under different bytes. Do not delete legacy producer implementations until the tracked consumer migration passes its proof gate.

Check supports classic ZIP STORED/DEFLATE, UTF-8 names (ASCII without a UTF-8 flag is accepted) and ordinary data descriptors. ZIP64, multi-disk, encrypted/unsupported flags/methods, links/directories, unsafe paths, aliases/file-prefix collisions, overlapping or unindexed records, inconsistent local/central metadata and bad CRC/lengths are rejected. It also checks exact manifest bytes, descriptor, component/artwork hashes and every component entry point, with a shared decompression budget across the outer archive and all components.

Default producer bounds are 256 MiB per archive, 64 MiB per entry and 256 MiB total expanded data across all nesting; 10,000 entries per component and 16 outer entries. Metadata is limited to 1 MiB and 64 nesting levels; duplicate JSON keys (including escaped aliases) and malformed UTF-8/BOM metadata are rejected. These are conservative producer-tool limits, not a change to Platform's device/runtime budget policy.

Semantic checks cover schema shape, component IDs/kinds/versions, reserved/colliding artifact paths, valid contract/player ranges, English fallback and locale collisions, catalog/artwork identity, capability overlap and HTTPS WAN declarations. Missing translations and invalid support URLs remain warnings, matching current Platform behavior. Host-installed contract/capability support and runtime content security are still checked by Platform.

## Verification evidence and next migration

`npm run check` includes the packed CLI installed in an isolated host, offline builds/checks, deterministic fixtures, signature roundtrips and malformed/tampered/archive-limit regressions. `fixtures/package/v1/producer/unsigned.partybeam` is independently checked with Python `zipfile`/`hashlib`; its measured hashes are recorded in `source.json`.

`npm run prove:producer -- <existing.partybeam> [...]` checks actual legacy archives and rebuilds them using SDK APIs in ignored `.proof` directories. It compares repeated output and exact decompressed game content; it never modifies a game checkout or publishes a package. G04 was proven with the three G03 source-pinned consumer packages; Platform's current verifier accepted all three rebuilt unsigned packages and a test-key signed Reflex package. See `fixtures/package/v1/producer/integration-proof.json`. This is package-tool integration proof, not game/device E2E or permanent consumer adoption.

Next: G05 migrates Reflex to the packed/versioned SDK client and producer workflow, removes proven duplicate algorithms, and records the new package release identity. Grimcellar/RacingLab, Catalog source migration and cross-validator fixture convergence remain G06–G09.
