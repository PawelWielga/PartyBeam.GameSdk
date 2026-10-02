# Package v1 contract extraction

SDK `0.1.0-alpha.1` ships the unchanged JSON Schema 2020-12 manifest and integrity/signature-envelope definitions and Node producer primitives. Schema identifiers, package schema version `1`, container layout and signature algorithm remain unchanged.

```js
import { createUnsignedIntegrityEnvelope, buildPackageDescriptor } from "@partybeam/game-sdk/package-v1";
const envelope = createUnsignedIntegrityEnvelope(manifestBytes, manifest.components);
const descriptor = buildPackageDescriptor(envelope.manifestSha256, manifest.components);
```

This subpath is Node-only. The root browser Game Contract client does not import Node modules or gain runtime dependencies. Schemas and fixture data are shipped in `npm pack` and exported under `@partybeam/game-sdk/schemas/*` and `@partybeam/game-sdk/fixtures/*`. Validators can pin an SDK tarball or exact Git commit and resolve these artifacts offline.

## Exact descriptor rules

Hash the exact manifest bytes with SHA-256, without parsing/reserializing or normalizing line endings. The UTF-8 descriptor consists of:

```text
partybeam-package-content-v1
manifest:<lowercase manifest SHA-256>
component:<kind>:<exact artifact path>:<lowercase artifact SHA-256>
```

Every line, including the last, ends with LF. Component lines are sorted by artifact path using ordinal UTF-16 comparison, independent of locale. Kinds are `tv`, `androidController`, `browserController`. Safe relative paths retain their original spelling; rooted paths, backslashes, colons, control characters, empty segments and `.`/`..` segments are rejected. Case-colliding component paths are rejected. Hashes accept either hexadecimal case and output lowercase. Artwork is bound by its hash in the manifest; it does not add a component line.

The Platform independent expected hash `cf1febc099efa8774189e8e86c8149370fd88ceeb0d870d32dce7f668bac74c0` is tested against the original manifest components. Fixture provenance, including exact source commits, is in `fixtures/package/v1/source.json`.

The historical Catalog envelope fixture hashes the CRLF rendition of its manifest. The committed source blob uses LF. Tests explicitly reconstruct the historical bytes and verify that LF hashes differently; production code never repairs bytes to match an envelope. The example signature is structurally valid fixture data, not evidence of a trusted cryptographic signature.

## Validation boundaries and remaining migration

JSON Schema checks structure, required fields, kind cardinality, path spelling and hash formats. Descriptor primitives reject malformed hashes, unsupported kinds, unsafe paths and artifact collisions. They do not validate a whole manifest or archive. Schema validation alone does not detect duplicate component IDs, cross-field range/locale/capability inconsistencies, missing ZIP entries, payload tampering or publisher trust.

G04 owns whole-package producer build/check, semantic validation, archive safety and optional signing. A valid unsigned envelope is not authorization to execute or publish a package. Signed profiles still require P-256/P1363 verification and trusted publisher identity; Platform and Catalog retain runtime/publication policy. G05–G09 own actual consumer adoption and the cross-repository proof gate. No consumer implementation is removed by this extraction.

Pin SDK, Game Contract and package-schema versions separately. Future changes to wire/container behavior need an explicitly versioned contract and coordinated Platform/Catalog/game conformance. Upgrades that only add SDK tooling must preserve existing package identities.

## G03 completion proof (`0.1.0-alpha.2`)

`fixtures/package/v1/conformance.json` is a data-only vector corpus. Each vector records its expected result at the applicable layer: `schemaValid`, `descriptorValid` or `integrityValid`. Manifest/envelope vectors contain ordered `set`/`delete` changes with array paths relative to the named base fixtures used in `tests/package-corpus.test.mjs`. Descriptor vectors carry complete inputs plus exact expected UTF-8 text and independently computed SHA-256. This format can be consumed offline by Platform/Catalog in G09.

Vectors cover required fields, unknown fields/versions/kinds, unsafe paths, malformed hashes, component-kind cardinality, locale/capability shape, case-colliding artifacts, signed/unsigned envelope shape, ordinal ordering and integrity mismatch. Semantic-only counterexamples (duplicate IDs, mixed release versions and reversed player ranges) intentionally show that schema/descriptor acceptance is insufficient. G04 must reject them with semantic validation. A signed-shaped zero signature is also intentionally only structural data, never a verified signature.

`generated/{reflex,grimcellar,racinglab}/` contains the exact manifest bytes, unsigned envelope and descriptor from actual producer output. `generated/proof.json` records consumer commits, dependency versions and measured hashes. Reflex and Grimcellar were built from fresh main snapshots. RacingLab main still contains only bootstrap documentation, so its proof uses PR #26's active stack at `229f2ea0c7f9583545b4722fb678099e36ed1081`, including the missing Three.js declaration dependency fixed during this proof. That stack remains unmerged to main; this proof does not complete its gameplay/device acceptance or the G07 migration.

The packed SDK accepted all three generated schemas and exactly reproduced their manifest/descriptor hashes; the proof checked the bytes of every declared component/artwork against the manifest. Grimcellar/RacingLab also passed typecheck and both Vite builds; Reflex/RacingLab passed their existing package checks. The corpus tests reject CRLF/trailing-byte mutations of generated manifests. The repaired Catalog LF snapshot is separately source-pinned at `f143d83303dac651fafb253b6165786616c4c694`, while the historical fixtures remain unchanged.

To repeat the integration proof, supply a JSON file with a `consumers` array to `npm run prove:packages -- <config.json>`. Each entry requires `name`, `repository`, `checkout`, `ref` (prefer an exact commit), and `packagePath`; `descriptorPath` optionally compares the producer's descriptor file too. For example:

```json
{"consumers":[{"name":"reflex","repository":"PawelWielga/PartyBeam.Game.Reflex","checkout":"../PartyBeam.Game.Reflex","ref":"e4942db3bebec429d8ae9eee612de8218643ba7c","packagePath":"dist/partybeam.reflex-0.1.0-alpha.1.partybeam"}]}
```

Checkout paths resolve from the current working directory. The tool archives exact Git commits into ignored `.proof` directories, installs producer dependencies, runs their normal package commands, and checks archives against an installed SDK tarball. It does not modify consumer checkouts or publish anything. `testedTarballSha256` identifies the actual tarball used for the recorded run, which predates adding the generated fixtures; it is not a release-tarball identity. The legacy producers have no committed lockfiles and some ZIPs include timestamps, so regenerated outer hashes may differ. This is exact-byte compatibility proof, not a claim of deterministic whole-package builds; G04 owns that gate.

Local validation: 120 SDK tests plus TypeScript declarations, 94 Reflex tests against the packed SDK, 21 Grimcellar tests, 41 RacingLab tests, and 80 existing Platform package tests via its direct xUnit executable. The Platform `dotnet test` MTP invocation discovered zero tests; that invocation is not counted as passing. No TV/browser/device E2E or publisher trust proof is claimed.
