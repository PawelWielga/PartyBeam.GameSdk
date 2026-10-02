# Ordered roadmap

Status: **Active**

## G01 — bootstrap repository and boundaries

- [x] README/AGENTS/architecture/roadmap.
- [x] choose package/workspace layout (one root contract package; split tooling only when needed).
- [x] add baseline test/typecheck/package tooling and Node 20/22 CI.
- [x] document versioning/changelog policy in `docs/game-contract-client.md` and `CHANGELOG.md`.

## G02 — extract Game Contract client

Extract the proven common bridge/client behavior from current games.

Required:

- request queue/correlation;
- response/error mapping;
- event subscription;
- runtime ready/fatal;
- native bridge + browser iframe/postMessage support;
- bounded identifiers/payload validation;
- timeout/dispose behavior;
- typed current v1 models.

Implemented in SDK `0.1.0-alpha.0`. Proof: all 94 tests from fresh Reflex `main` pass with its local client replaced by the packed SDK in an isolated snapshot. See `docs/game-contract-client.md` and `npm run prove:reflex`. Permanent adoption and removal in the actual Reflex repository remain G05; no device E2E is claimed here.

## G03 — extract package v1 schemas and deterministic primitives

Move the canonical PartyBeam package contract out of Platform-as-copy-source.

Required:

- manifest schema;
- integrity/signature envelope schema;
- deterministic package-content descriptor;
- hashes/path normalization;
- fixtures;
- producer validation.

Do not change v1 wire/container behavior accidentally during extraction.

## G04 — package builder/check CLI

Provide a normal game producer workflow that replaces copied scripts.

Target developer path should be approximately:

```text
build game surfaces
-> partybeam package build
-> partybeam package check
-> output .partybeam
```

Game repositories still own their game-specific metadata/assets.

## G05 — migrate Reflex

Replace local Game Contract/package infrastructure and preserve existing behavior/tests.

## G06 — migrate Grimcellar

Validate projections, lifecycle, Board/Dice consumption and package production.

## G07 — migrate RacingLab

Validate high-frequency input/timing models and producer verification.

## G08 — migrate GameCatalog contract source

GameCatalog must consume/pin GameSdk contract definitions instead of treating a Platform commit snapshot as the long-term canonical source.

## G09 — converge Platform runtime/verifier

Platform should implement/consume the same public contract definitions without making GameSdk depend on Platform internals.

## G10 — conformance matrix

Run the same fixtures/vectors across:

- SDK;
- Platform;
- GameCatalog;
- Reflex;
- Grimcellar;
- RacingLab.

## G11 — remove duplicated historical implementations

Delete local bridge/package algorithms that are fully superseded and verified.
