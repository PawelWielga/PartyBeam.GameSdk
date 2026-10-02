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

Implemented in SDK `0.1.0-alpha.0`. Proof: all 94 tests from fresh Reflex `main` pass with its local client replaced by the packed SDK in an isolated snapshot. See `docs/game-contract-client.md` and `npm run prove:reflex`. Permanent Reflex adoption/removal is now complete through G05 below; this initial proof does not claim device E2E.

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

Completed in SDK `0.1.0-alpha.2`: unchanged schemas, Node descriptor/hash/path primitives, pinned Platform/Catalog fixtures, a reusable data-only valid/invalid corpus and real generated Reflex/Grimcellar/RacingLab package proof. RacingLab evidence comes from the explicitly pinned active PR #26 stack, not its bootstrap-only main. See `docs/package-contract-v1.md` and `fixtures/package/v1/generated/proof.json`. Full archive build/check and semantic validation are implemented by G04 below; consumer adoption follows G05–G09.

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

Completed in `0.1.0-alpha.3`: installed `partybeam package build/check`, typed Node APIs, semantic validation, deterministic unsigned archives, bounded archive checking and P-256/P1363 signing/verification. Packed CLI tests and real SDK rebuilds of all three G03 consumer packages pass; Platform accepts the generated unsigned packages and a test-key signed package. See `docs/package-producer.md`. Reflex and Grimcellar adoption is complete below; other consumer copies remain until each migration is proven.

## G05 — migrate Reflex

Completed with [Reflex PR #20](https://github.com/PawelWielga/PartyBeam.Game.Reflex/pull/20), merge `f61c93bfc27069ad789d067f968022c2668b4eef`. Reflex alpha.2 pins SDK alpha.4, imports the client directly and uses SDK archive build/check. Private client/ZIP/descriptor code is deleted. Proof: 97 tests on Node20/22/25, deterministic producer output, real browser bundles and Platform full verifier. SDK alpha.4 removes the newer `Object.hasOwn` browser requirement (SDK PR #14). Catalog publication/physical E2E remain Reflex #9.

## G06 — migrate Grimcellar

Completed with [Grimcellar PR #16](https://github.com/PawelWielga/PartyBeam.Game.Grimcellar/pull/16), merge `2e2d57e3965963f87b6a20808e62b0c61a22ba92`. Preview.2 pins SDK alpha.4, removes its private bridge/client/producer algorithms and keeps direct Board/Dice preview.2 dependencies. Controller input carries only type/payload; host-owned sequencing follows the canonical contract. Proof: 23 tests on Node22/25 including real Vite controller through native/iframe bridges, typecheck/both builds, identical unsigned archive on both Node versions, independent archive audit and Platform verification of real unsigned/test-key-signed archives.

Preview.1 stays immutable. Game-owned cover remains Grimcellar #13, preview.2 publication is GameCatalog #25 and physical PC/Android TV E2E remains Grimcellar #9. No device/publication evidence is inferred from deterministic tests. G07 RacingLab is now complete below; next architecture task is G08 GameCatalog.

## G07 — migrate RacingLab

Completed with [RacingLab PR #29](https://github.com/PawelWielga/PartyBeam.Game.RacingLab/pull/29), merge `dd653dd28bfba932d8ea2ada5ceda8da363140b2`. Preview.2 pins SDK alpha.4, integrates the existing runtime/telemetry draft stack into main and removes its private bridge/ZIP/descriptor/signature algorithms. RacingLab owns only game metadata/policy, controls, simulation, presentation and bounded telemetry. Nullable SDK timing evidence is unavailable, never zero latency.

Proof: 49 tests on Node22/25, including actual Vite controller bundles with native/iframe host doubles and 1,200 SDK input events; strict typecheck/both builds; identical consecutive unsigned archives across Node versions; actual unsigned/test-key-signed CLI checks and Platform verifier acceptance; zero npm audit vulnerabilities. [Detailed evidence](https://github.com/PawelWielga/PartyBeam.Game.RacingLab/blob/main/docs/gamesdk-migration.md). No physical-device, WebGL, real LAN latency, publisher trust or catalog publication proof is inferred. RacingLab #5 remains blocked for A -> C/D by Platform #206. Next architecture task is G08 GameCatalog.

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
