# Game Contract v1 client

SDK package: `@partybeam/game-sdk` **0.1.0-alpha.0**. Wire/API version: **1.0.0**.

The package ships browser-ready ES modules and TypeScript declarations with no runtime dependencies or Platform implementation references. Bundle it into the game's sandboxed surfaces; do not load executable dependencies from the Internet at runtime. `npm pack` produces an installable artifact without requiring an npm account.

```ts
import { createGameContractV1Client } from "@partybeam/game-sdk";

const contract = createGameContractV1Client();
const unsubscribe = contract.subscribe("input", input => {
  // Rules, scoring and interpretation of timing evidence remain game-owned.
  console.log(input.type, input.playerId);
});
const session = await contract.request("session.get");
contract.sendReady();
// On teardown:
unsubscribe();
contract.dispose();
```

## Host bridges

Top-level native content navigates to `partybeam-runtime://bridge/?message=<encoded JSON>` and receives `partybeam:contract-message` custom events. Iframe content sends `{ type: "partybeam.runtime.bridge", messageJson }` to its parent and accepts `{ type: "partybeam.runtime.contract", messageJson }` only from that parent.

The default postMessage target origin is `*`, matching the existing opaque-origin browser sandbox. When the host origin is known, set `parentOrigin` to its exact origin; this also checks inbound message origin. This client never exposes a trusted shell bridge or implements networking, player binding, reconnect or synchronization.

Requests are serialized on both bridges. Only one request is in flight per client, preventing native URI navigation loss. Its timeout starts on dispatch (default 5 seconds); queued requests wait their turn. IDs are unique across clients within the module instance and bounded to the host's 64-character limit. Create one client per game surface and use that client for readiness/fatal signals.

Payloads must be JSON-compatible objects and are serialized before queueing. The current host limits are 16 KiB UTF-8 for game-to-host messages and 64 KiB for host-to-game messages. Oversized/cyclic outbound payloads fail before dispatch; malformed, oversized, unknown and late inbound responses are ignored. Envelope validation does not validate every event payload or give authority to game-provided data; Platform retains execution/security validation.

`GameContractRequestError` preserves host error code/request ID. SDK failures use `contract.requestTimeout` and `contract.clientDisposed`. Disposal removes both listeners, clears timers and rejects active/queued requests. Unsubscribe and dispose are idempotent. Event callbacks run synchronously; games own errors thrown by their callbacks.

## Current v1 models

Declarations cover the current shared-screen request set and controller input/projection events, presence, lifecycle/resource pressure, timing samples/invalidation, storage/migration, capability availability, mediated WAN requests and diagnostics.

Host-specific support remains authoritative: the Android controller bridge currently accepts `controller.input.send`, not the shared-screen request set. A controller submits only `type`, `payload` and optional `peerTimestampMilliseconds`; sequence and authenticated player identity are host-owned. Diagnostic requests use `eventType`, matching the bridge rather than internal C# model names. Timing models describe evidence from Platform and do not implement synchronization or game fairness.

## Extraction provenance and proof

Fresh GitHub `main` snapshots inspected for this extraction:

- Platform `c30c2531f44688cda82c87e1c6d5f5be7bed837b`: bridge parser, web bridge, models, controller protocol and resource-pressure adapter.
- Reflex `e4942db3bebec429d8ae9eee612de8218643ba7c`: `src/shared/game-contract-v1.js` and existing game/bridge tests.
- Grimcellar `ab8ed074e952d4691d86f7b37ae96a887b3d77a4`: `src/shared/partybeam-runtime.ts`.

Fixtures in `fixtures/contract/v1.json` capture representative current wire shapes. They are inputs for G09 cross-repository conformance, not evidence that Platform already consumes SDK fixtures.

Run `npm ci` then `npm run check`. To verify the packed SDK against an existing fresh Reflex checkout:

```text
npm run prove:reflex -- <Reflex checkout> [origin/main or exact commit]
```

This archives the selected committed source into `.proof/`, installs the actual SDK tarball, replaces the local client only in that isolated snapshot with a package re-export, and runs the entire original Reflex test suite. The original checkout is never changed. The initial proof passed all **94 tests**. This verifies client interchangeability in existing automated tests; it is not a device/browser E2E or completed permanent Reflex migration.

## Migration and versioning

Reflex may retain its factory calls, replacing the local module with a bundled SDK import. Grimcellar should use the same factory's `request`, `subscribe`, `sendReady` and `reportFatal` instead of maintaining its class/standalone signal functions. Its timeout can be retained by setting `requestTimeoutMs: 10000`. The SDK normalizes request IDs/error class and serializes requests; game-owned rules/presentation remain unchanged.

G03/G04 must provide package schemas/build/check before G05 completes the full Reflex infrastructure migration. G06 owns permanent Grimcellar adoption. G09 owns coordinated Platform runtime/fixture convergence. Keep consumer copies until their real migration proof passes, then delete them.

SDK alpha API breaks require a version/changelog/migration update. A wire/API break requires a new contract version plus coordinated Platform/game updates and fixture evidence. SDK package version and `.partybeam` package-schema version are independent of Game Contract version.
