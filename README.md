# PartyBeam.GameSdk

`PartyBeam.GameSdk` is the canonical, versioned development contract for games that run inside PartyBeam.

It is intentionally **PartyBeam-specific**. General communication, transport and timing remain in [Dihor.GameKit.Networking](https://github.com/PawelWielga/Dihor.GameKit.Networking), while reusable game mechanics may live in independent Dihor GameKit packages such as Board or Dice.

## Why this repository exists

Before GameSdk, individual games and PartyBeam.GameCatalog accumulated local copies of:

- Game Contract browser bridge/client code;
- PartyBeam runtime request/event models;
- `.partybeam` manifest assumptions;
- deterministic package descriptor logic;
- integrity/signature helpers;
- package validation scripts.

That creates drift. GameSdk becomes the one source that Platform, GameCatalog and every PartyBeam game can version and test against.

## Ownership

GameSdk owns the **game-facing contract and developer tooling**:

- versioned Game Contract TypeScript/browser client;
- runtime ready/fatal helpers;
- request/event envelope types;
- game-facing roster, presence, input, projection, timing and lifecycle models;
- capability identifiers/models exposed to games;
- `.partybeam` manifest and integrity/signature schemas;
- deterministic package builder primitives;
- producer-side package validation and verification helpers;
- conformance fixtures/vectors;
- CLI/developer tooling for building and checking game packages;
- migration and compatibility documentation.

GameSdk does **not** own:

- PartySession/GameSession implementation;
- PartyBeam shell UI;
- catalog publication state/channels;
- transport/discovery/reconnect implementation;
- Android/Windows/browser host behavior;
- game rules;
- Board/Dice/other generic game mechanics.

## Ecosystem position

```text
Dihor.GameKit.Networking    Dihor.GameKit.Board/Dice
        |                         |
        |                         |
        +-----------+-------------+
                    |
             PartyBeam games
                    ^
                    |
             PartyBeam.GameSdk
              /            \
             /              \
PartyBeam.Platform     PartyBeam.GameCatalog
```

Dependency direction is important:

- GameSdk may define PartyBeam game-facing contracts.
- It must not depend on Platform implementation projects.
- Dihor.GameKit libraries must not depend on GameSdk.
- Games should not copy GameSdk implementation into their repositories.

## Initial consumers

The initial API must be proven by multiple real consumers:

1. `PartyBeam.Game.Reflex`;
2. `PartyBeam.Game.Grimcellar`;
3. `PartyBeam.Game.RacingLab`;
4. `PartyBeam.GameCatalog`;
5. `PartyBeam.Platform`.

Reflex should be the first game migration because its integration layer is compact. Grimcellar then validates richer projections and Dihor GameKit use. RacingLab validates high-frequency input/timing and packaging diagnostics.

## Available contract client

`@partybeam/game-sdk` provides the Game Contract v1 client and TypeScript models. See [client usage, provenance and migration](docs/game-contract-client.md).

```text
npm ci
npm run check
npm pack
```

The browser client has no runtime dependencies. Browser games bundle its ES module into their sandboxed surfaces. CI verifies Node 20/22, declarations and package contents. SDK `0.1.0-alpha.3` also exports package-v1 schemas, descriptor/hash primitives, conformance fixtures and Node producer tools. The installed `partybeam package build/check` CLI and typed APIs provide deterministic unsigned packages, semantic/integrity checks and optional signing; see [producer workflow](docs/package-producer.md) and [contract boundaries](docs/package-contract-v1.md). Node tooling uses pinned Ajv against bundled schemas offline. Reflex, Grimcellar and RacingLab adoption is complete (G05–G07). Next is G08 GameCatalog contract-source migration, then G09 Platform/cross-validator conformance. See the ordered roadmap for evidence and remaining device/publication acceptance.

## Planned package shape

The initial contract package uses root `src/` for its ES module and declarations. The intended future conceptual split is:

```text
packages/
  contract/       # game-facing runtime client/types
  package/        # manifest/container/build/check tooling
schemas/
  game-package/
fixtures/
  contract/
  package/
tools/
  cli/
docs/
```

Do not create packages merely for naming symmetry. Split only when separate versioning/dependency surfaces are useful.

## Compatibility

The current PartyBeam Game Contract v1 and package v1 behavior are extraction inputs, not an excuse to preserve every historical implementation detail.

During alpha:

- breaking SDK API changes are allowed when intentional and documented;
- wire/package compatibility changes must still be explicitly versioned;
- Platform, GameCatalog and real games must be updated together when a contract changes;
- do not add compatibility shims that permanently preserve a wrong boundary.

## Security

GameSdk describes what sandboxed game content is allowed to request or receive. It must never expose trusted MAUI/native shell services directly.

A game remains sandboxed HTML/CSS/JavaScript and interacts with PartyBeam only through supported Game Contract/capability surfaces.

## Source-of-truth documents

- [Architecture](docs/architecture.md)
- [Ordered roadmap](docs/roadmap.md)
- [PartyBeam ecosystem architecture](https://github.com/PawelWielga/PartyBeam.Platform/blob/main/docs/ecosystem-target-architecture.md)
- [PartyBeam ecosystem refactor plan](https://github.com/PawelWielga/PartyBeam.Platform/blob/main/docs/ecosystem-architecture-refactor-plan.md)
