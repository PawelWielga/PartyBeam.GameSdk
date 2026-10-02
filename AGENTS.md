# AGENTS.md

## Repository role

`PartyBeam.GameSdk` is the canonical PartyBeam-specific game-development contract and tooling repository.

Before substantial changes read:

1. `README.md`;
2. `docs/architecture.md`;
3. `docs/roadmap.md`;
4. the current ecosystem architecture/refactor plan in `PawelWielga/PartyBeam.Platform`;
5. current consumers before changing a public contract.

## Boundary rules

GameSdk may own:

- PartyBeam Game Contract client/types;
- PartyBeam game-facing runtime envelopes/events;
- PartyBeam capability identifiers exposed to games;
- `.partybeam` manifest/integrity/signature schemas;
- deterministic package producer tooling;
- package/contract fixtures and conformance tools.

GameSdk must not own:

- generic networking transports, reconnect, discovery or clock synchronization implementation;
- PartySession/GameSession runtime implementation;
- Platform UI or host services;
- GameCatalog channel/publication state;
- game-specific rules;
- generic Board/Dice mechanics.

Generic networking belongs in `Dihor.GameKit.Networking`. Keep that library independent from PartyBeam.

## Consumer-first design

Do not design the SDK in isolation.

For a new or changed API:

- inspect at least two real consumers when practical;
- prefer extracting a common proven behavior over inventing a broad abstraction;
- keep the public surface small;
- add conformance tests/fixtures before deleting old consumer implementations;
- version wire/schema changes explicitly.

The first migration order is Reflex -> Grimcellar -> RacingLab -> GameCatalog/Platform convergence.

## Security

- Never expose trusted shell/native services directly to game content.
- Treat every game as sandboxed/untrusted content.
- Keep capability surfaces explicit and bounded.
- Package validation must fail closed on malformed or inconsistent inputs.
- Do not weaken integrity checks merely to simplify producer tooling.

## Dependencies

- No paid commercial dependency.
- Prefer permissive open-source dependencies.
- Avoid runtime dependencies when a small deterministic implementation is safer.
- Do not depend on PartyBeam.Platform implementation projects.

## Validation

Every contract/package change should have deterministic tests.

High-value gates include:

- request/response/event bridge behavior;
- malformed message rejection;
- request timeout/dispose behavior;
- schema fixtures;
- deterministic package output;
- package descriptor hashes;
- signed and unsigned official-profile verification;
- cross-consumer conformance.

## GitHub workflow

- Work from focused issues.
- Prefer one focused issue per PR.
- Breaking public changes must update docs/changelog/migration guidance.
- Do not merge with known consumer breakage unless the coordinated migration is part of the same tracked change.
- Keep issues and the ordered roadmap synchronized.

## Completion discipline

When replacing duplicated code in a game or catalog, the old implementation is not removed until the SDK path has equivalent tests and at least one real integration proof. After proof, delete the duplicate instead of keeping two permanent implementations.
