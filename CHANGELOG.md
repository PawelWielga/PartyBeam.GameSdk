# Changelog

## 0.1.0-alpha.0

- Extract Game Contract v1 native URI and browser iframe client from Reflex/Grimcellar.
- Serialize requests, correlate responses, forward events, and expose runtime ready/fatal helpers.
- Bound bridge messages to existing Platform UTF-8 limits and validate response envelopes.
- Add disposal, timeout, immutable queued payloads and parent source/origin checks.
- Provide TypeScript models for the current runtime, controller, timing, storage, capability, network and diagnostic surfaces.
- Add fixtures, Node 20/22 CI, declaration checks and an isolated packed-package Reflex proof.

Game Contract wire version remains `1.0.0`. Package-v1 producer tooling is not included yet.
