# Changelog

## 0.1.0-alpha.3

- Add the Node-only typed `package-tools` API and installed `partybeam package build/check` CLI.
- Build deterministic STORED component/container archives with fixed timestamps and canonical manifest bytes.
- Validate manifest semantics, exact-byte integrity, nested archive safety/bounds and entry points.
- Support optional P-256/P1363 signing and explicit unsigned verification; publisher trust policy stays external.
- Validate packed CLI workflows, independent archive/hash fixtures and three real consumer rebuilds against Platform.
- Node tooling now depends on pinned Ajv for bundled offline schemas; the browser client remains dependency-free.
- Package-v1/wire schemas remain unchanged. New producer output needs a new game release identity; permanent migrations start at G05.

## 0.1.0-alpha.2

- Ship data-only valid/invalid schema, descriptor and integrity vectors.
- Prove real generated Reflex, Grimcellar and active-stack RacingLab packages against the packed SDK; record exact commits and generated manifest/descriptor bytes.
- Add the repaired Catalog LF snapshot without rewriting historical CRLF fixture provenance.
- Add isolated `prove:packages` tooling; no runtime dependency, schema or wire change.

## 0.1.0-alpha.1

- Ship unchanged package-v1 manifest and integrity/signature schemas with pinned provenance.
- Add the Node-only `package-v1` descriptor, SHA-256, safe-path and unsigned-envelope API.
- Test Platform's independent hash vector, historical Catalog bytes and malformed inputs.
- Keep the browser client and package/wire versions unchanged; whole-package build/check remains G04.

## 0.1.0-alpha.0

- Extract Game Contract v1 native URI and browser iframe client from Reflex/Grimcellar.
- Serialize requests, correlate responses, forward events, and expose runtime ready/fatal helpers.
- Bound bridge messages to existing Platform UTF-8 limits and validate response envelopes.
- Add disposal, timeout, immutable queued payloads and parent source/origin checks.
- Provide TypeScript models for the current runtime, controller, timing, storage, capability, network and diagnostic surfaces.
- Add fixtures, Node 20/22 CI, declaration checks and an isolated packed-package Reflex proof.

Game Contract wire version remains `1.0.0`. Package-v1 producer tooling is not included yet.
