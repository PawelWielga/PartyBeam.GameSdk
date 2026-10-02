# Architecture

Status: **Accepted initial architecture**  
Decision date: **2026-10-02**

## Purpose

PartyBeam.GameSdk is the contract boundary seen by a PartyBeam game and by tooling that builds/verifies that game's package.

It is separate from PartyBeam.Platform so games, GameCatalog and tooling do not need to copy contract implementations or depend on Platform internals.

## Layers

```text
Game-facing contract
- typed client
- request/event models
- lifecycle helpers
- capabilities
        |
        v
Package contract/tooling
- schemas
- deterministic builder
- integrity descriptor
- validation
- producer verifier
        |
        v
Conformance
- fixtures
- vectors
- compatibility tests
- CLI
```

## Contract layer

The contract layer should expose a small game-facing TypeScript/browser API.

It should cover current proven needs such as:

- `session.get`;
- presence;
- controller input;
- private/shared projections where supported;
- GameSession end request;
- runtime ready/fatal;
- timing evidence supplied by Platform;
- lifecycle/resource-pressure events;
- capability-mediated requests.

It must not reveal Platform implementation classes.

## Runtime bridge

Different hosts may implement the trusted side differently, but the game-facing behavior is one contract.

The SDK may support both:

- the native PartyBeam runtime navigation/custom-event bridge;
- the browser host postMessage bridge.

These are transport details of the Game Contract client, not game business logic.

## Package layer

The package layer owns the canonical versioned definitions used by producers and validators:

- manifest schema;
- integrity/signature envelope schema;
- logical descriptor construction;
- path normalization;
- component metadata rules;
- deterministic archive/build rules where standardized;
- producer validation.

GameCatalog remains the owner of public release/catalog policy. Platform remains the authoritative runtime verifier for installed execution policy; shared verification primitives may be consumed from GameSdk when the trust boundary remains clear.

## Relationship with Dihor.GameKit

Dihor libraries are orthogonal.

A PartyBeam game may use GameSdk plus zero or more Dihor GameKits. GameSdk must not become a wrapper around Dihor.GameKit.Networking, Board or Dice.

## Versioning

Keep three versions conceptually distinct:

1. GameSdk package version;
2. Game Contract protocol/API version;
3. `.partybeam` package schema version.

A GameSdk release may support more than one contract/schema version during migrations.

## Extraction rule

When extracting from current consumers:

- capture behavior with tests first;
- choose one canonical implementation;
- migrate consumers;
- delete local copies;
- retain compatibility only when a real supported contract requires it.
