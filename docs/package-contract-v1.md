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
