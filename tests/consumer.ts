import { createGameContractV1Client, type PartyBeamSession, type PartyBeamRuntimeSignal } from "@partybeam/game-sdk";
import { buildPackageDescriptor, createUnsignedIntegrityEnvelope, type DescriptorComponent } from "@partybeam/game-sdk/package-v1";
const components: readonly DescriptorComponent[] = [{ kind: "tv", artifactPath: "tv.zip", sha256: "a".repeat(64) }];
const descriptor: Uint8Array = buildPackageDescriptor("a".repeat(64), components);
const schemaVersion: 1 = createUnsignedIntegrityEnvelope(descriptor, components).schemaVersion;
void schemaVersion;
const client = createGameContractV1Client();
const session: Promise<PartyBeamSession> = client.request("session.get");
void session;
void client.request("projection.private.publish", { playerId: "p1", type: "game.state", payload: { phase: "playing" } });
void client.request("controller.input.send", { type: "game.press", payload: {}, peerTimestampMilliseconds: 1 });
void client.request("timing.mapping.sample", { runtimeRequestTimestampMilliseconds: 1 });
void client.request("diagnostics.emit", { level: "information", eventType: "timing", metric: "inputLatency", milliseconds: 2 });
// @ts-expect-error the current bridge uses eventType, not the internal model's type property
void client.request("diagnostics.emit", { level: "information", type: "timing", metric: "inputLatency", milliseconds: 2 });
client.subscribe("runtime.signal", (signal: PartyBeamRuntimeSignal) => {
  if (signal.kind === "resourcePressure") { const active: boolean = signal.payload.active; void active; }
});
client.subscribe("input", input => { const playerId: string = input.playerId; void playerId; });
// @ts-expect-error host sequences controller input; the game does not set sequence
void client.request("controller.input.send", { type: "game.press", payload: {}, sequence: 0 });
// @ts-expect-error required private target
void client.request("projection.private.publish", { type: "game.state", payload: {} });
// @ts-expect-error typed v1 surface rejects shell/native services
void client.request("shell.launch", {});
// @ts-expect-error timing sample requires its payload
void client.request("timing.mapping.sample");
// @ts-expect-error method-specific payload rejects unrelated fields
void client.request("session.get", { playerId: "p1" });
