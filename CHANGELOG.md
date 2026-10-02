# Changelog

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
