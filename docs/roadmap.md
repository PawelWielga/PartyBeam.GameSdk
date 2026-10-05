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

Preview.1 stays immutable. Game-owned cover remains Grimcellar #13, preview.2 publication is GameCatalog #25 and physical PC/Android TV E2E remains Grimcellar #9. No device/publication evidence is inferred from deterministic tests. G07 RacingLab is now complete below; G08 GameCatalog is also complete below; next is G09 Platform/cross-validator convergence.

## G07 — migrate RacingLab

Completed with [RacingLab PR #29](https://github.com/PawelWielga/PartyBeam.Game.RacingLab/pull/29), merge `dd653dd28bfba932d8ea2ada5ceda8da363140b2`. Preview.2 pins SDK alpha.4, integrates the existing runtime/telemetry draft stack into main and removes its private bridge/ZIP/descriptor/signature algorithms. RacingLab owns only game metadata/policy, controls, simulation, presentation and bounded telemetry. Nullable SDK timing evidence is unavailable, never zero latency.

Proof: 49 tests on Node22/25, including actual Vite controller bundles with native/iframe host doubles and 1,200 SDK input events; strict typecheck/both builds; identical consecutive unsigned archives across Node versions; actual unsigned/test-key-signed CLI checks and Platform verifier acceptance; zero npm audit vulnerabilities. [Detailed evidence](https://github.com/PawelWielga/PartyBeam.Game.RacingLab/blob/main/docs/gamesdk-migration.md). No physical-device, WebGL, real LAN latency, publisher trust or catalog publication proof is inferred. RacingLab #5 retains unimplemented A -> C/D instrumentation and physical-device acceptance. Platform #206 is resolved by merged PR #317 (`151f03e843f325f13c0f670a524e011ecef7aa12`); mapped instrumentation requires a host containing that fix. G08 GameCatalog is also complete below; next is G09 Platform/cross-validator convergence.

## G08 — migrate GameCatalog contract source

Completed with [GameCatalog PR #26](https://github.com/PawelWielga/PartyBeam.GameCatalog/pull/26), merge `709268183dbb245027dc6860f3c38a9206316fb3`. Catalog pins a vendored npm artifact of SDK alpha.4 from commit `ad06755e8d9c56394466eed14080a83f1535e535`, records artifact/schema hashes and resolves schemas plus descriptor primitives from the installed SDK offline. The Platform schema snapshot and local descriptor copies are deleted. New provenance identifies SDK pins; historical Platform provenance remains valid under its prior schema shape.

Proof: existing 13 Catalog suites plus the SDK corpus (58 manifest, 15 envelope, 6 descriptor vectors and three generated-game fixtures), offline install/tests, canonical catalog/channel validation, anonymous integrity audit of all three actual published releases and exact-byte manifest/envelope projection validation of those releases. Both SDK schemas were byte-identical to the previous snapshot. Catalog retains publication/trust policy and required Platform full-verifier evidence. No new device/runtime E2E or live .NET verifier run is claimed. Next: G09 / Platform #350 cross-validator convergence.

## G09 — converge Platform runtime/verifier

Platform should implement/consume the same public contract definitions without making GameSdk depend on Platform internals.

Completed bounded Platform stages: #358 pins the same alpha.4 artifact as
GameCatalog; #360 executes all 58 manifest/15 envelope mutations and resolves
explicit-null signature handling; #317 fixes mapping invalidation ordering;
#362 executes six shared authoritative runtime checks through the real .NET
parser/bridge (session request/response, unsupported-method error, timed input,
presence, resource pressure and mapping invalidation). Package/runtime tests
share a hash-verified artifact reader rather than copied fixture definitions.
The #362 validation ran 252 tests (GameContract 83, GamePackages 169), zero
failures/skips. SDK optional null/omitted presence timing and bridge-lifetime
mapping IDs are documented normalization points. No production runtime mismatch
was found in those six checks.

Platform [PR #364](https://github.com/PawelWielga/PartyBeam.Platform/pull/364),
merge `d1988376af166f3d278c13275d559c0189384322`, completes the controller-projection
checkpoint. The existing Android sandbox bridge is shared in Core behind a
trusted routing port and Android uses that same implementation. The pinned SDK
fixture passes exactly through legacy/attempt-scoped private-projection parsing
and the real bridge with a recording transport. Stale attempts, malformed JSON,
disposal and restricted input routing are covered. Local Windows validation:
513 tests passed (Core 261, GameContract 83, GamePackages 169), zero failures/skips;
Android controller Release build including trimming/AOT passed with zero
warnings/errors. Platform #363 is closed; Actions remains paused there.

Platform [PR #366](https://github.com/PawelWielga/PartyBeam.Platform/pull/366),
merge `6738586e9ed681d1461ea35db9f0859e41d23319`, proves representative real
SDK-client/Platform exchange. Native URI and iframe client paths execute the
hash-verified alpha.4 JavaScript client against the actual .NET parser/bridge
over process I/O: queued session/timing requests, invalid/unsupported errors,
ready/fatal parsing, exact timed input/resource-pressure events and SDK disposal.
Local Windows .NET 10.0.301 / Node 25.6.1: 85 GameContract tests passed, zero
failures/skips, build zero warnings/errors. Browser API and trusted host-service
doubles are used; this is not browser/WebView/device E2E. Node >=20 on PATH is
now an explicit Platform GameContract test prerequisite; no product dependency
is added. Platform #365 is closed; Actions remains paused there.

Platform [PR #368](https://github.com/PawelWielga/PartyBeam.Platform/pull/368),
merge `ccae001a10095ebce641eb11c164b02f5507e2d4`, completes the linked controller
exchange and expanded authoritative boundary checkpoint. The shared test-only
process transport delivers parsed requests through the real bridge subscriptions.
Each native/iframe mode executes seven controller requests (input and identity/
sequence/timestamp/missing-field/TV-method rejection), canonical private
projection with stale-attempt filtering, and 19 authoritative requests covering
storage, projections, completion/end and malformed request/policy boundaries.

The real-client storage.read assertion reproduced Platform omitting the required
`value` property when no value existed. Platform now emits `value: null`; SDK
alpha.4 types and all other nullable/optional fields stay unchanged. Three .NET
regressions cover missing/stored-null/object values. Windows .NET 10.0.301 /
Node 25.6.1: 514 passed (Core 263, GameContract 88, GameRuntime 119, PartyGameKit
25, Tv.Web 19), zero failures/skips, builds zero warnings/errors. Node >=20 is
required on PATH for both Core and GameContract tests. Platform #367 is closed;
Actions stays paused; browser API/trusted services remain doubles.

G09 remains open. Next: production schema-source cutover/removal and structural boundary
proof beyond the finite corpus remain. No live browser/Android/device E2E,
full v1 method conformance or physical performance conclusion is inferred.
See [Platform evidence](https://github.com/PawelWielga/PartyBeam.Platform/blob/main/docs/gamesdk-conformance.md).

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
