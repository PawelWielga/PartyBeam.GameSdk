export const GAME_CONTRACT_VERSION: "1.0.0";
export const MAX_REQUEST_BYTES: number;
export const MAX_RESPONSE_BYTES: number;
export type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };
export interface PartyBeamPlayer { readonly playerId: string; readonly displayName: string; readonly isConnected: boolean }
export interface PartyBeamSession {
  readonly gameId: string; readonly gameVersion: string; readonly contractVersion: string;
  readonly roster: readonly PartyBeamPlayer[];
}
export interface PartyBeamTimingQuality {
  readonly roundTripMilliseconds: number; readonly jitterMilliseconds: number;
  readonly uncertaintyMilliseconds: number; readonly isTrusted: boolean;
}
export interface PartyBeamPlayerPresence {
  readonly playerId: string; readonly state: "connected" | "reconnecting" | "disconnected";
  readonly timingQuality?: PartyBeamTimingQuality | null;
}
export interface PartyBeamGameInput<T = JsonValue> {
  readonly sequence: number; readonly playerId: string; readonly type: string; readonly payload: T;
  readonly normalizedTimestampMilliseconds?: number | null;
  readonly authorityReceiveTimestampMilliseconds?: number | null;
  readonly timingQuality?: PartyBeamTimingQuality | null;
}
export interface PartyBeamControllerProjection<T = JsonValue> {
  readonly revision: number; readonly type: string; readonly payload: T;
}
export interface PartyBeamResourcePressure {
  readonly active: boolean; readonly code: string; readonly kind: "none" | "memory" | "cpu" | "memoryAndCpu";
}
export type PartyBeamRuntimeSignal =
  | { readonly kind: "resourcePressure"; readonly payload: PartyBeamResourcePressure }
  | { readonly kind: "standby" | "resume" | "connectivityChanged" | "replayRequested" | "returnToCatalogRequested"; readonly payload: JsonValue };
export interface PartyBeamTimingMappingSample {
  readonly mappingId: string; readonly generation: number;
  readonly runtimeRequestTimestampMilliseconds: number;
  readonly authorityRequestTimestampMilliseconds: number; readonly authorityResponseTimestampMilliseconds: number;
}
export interface PartyBeamTimingMappingInvalidated {
  readonly mappingId: string; readonly generation: number; readonly reason: "standby" | "resume";
}
export interface PartyBeamCapabilityResult {
  readonly capability: string; readonly availability: "unknown" | "available" | "denied" | "unavailable";
  readonly reasonCode: string | null;
}
export type PartyBeamCapability = "internetAccess" | "camera" | "microphone" | "location" | "gyroscope" | "accelerometer" | "haptics";
export interface PartyBeamNetworkRequest {
  readonly method: string; readonly url: string; readonly headers?: Readonly<Record<string, string>>;
  readonly bodyBase64?: string | null; readonly contentType?: string | null;
}
export interface PartyBeamNetworkResponse {
  readonly statusCode: number; readonly contentType: string | null;
  readonly headers: Readonly<Record<string, string>>; readonly bodyBase64: string;
}
export type PartyBeamDiagnosticLevel = "trace" | "information" | "warning" | "error";
export type PartyBeamDiagnosticEvent = { readonly level: PartyBeamDiagnosticLevel } & (
  | { readonly eventType: "lifecycle"; readonly stage: "load" | "ready" | "start" | "finish" | "exit" }
  | { readonly eventType: "phaseTransition"; readonly phaseIndex: number }
  | { readonly eventType: "failure"; readonly category: "gameLogic" | "capability" | "storage" | "connectivity" | "timing" | "runtime"; readonly code: string }
  | { readonly eventType: "timing"; readonly metric: "loadTime" | "frameTime" | "inputLatency" | "roundTripTime" | "jitter" | "uncertainty" | "authorityCueTime" | "normalizedInputTime" | "authorityReceiveTime"; readonly milliseconds: number }
  | { readonly eventType: "decision"; readonly code: string }
);
type Empty = Readonly<Record<string, never>>;
export interface GameContractV1Requests {
  "session.get": { payload: Empty; result: PartyBeamSession };
  "presence.get": { payload: Empty; result: readonly PartyBeamPlayerPresence[] };
  "timing.now": { payload: Empty; result: { readonly timestampMilliseconds: number } };
  "timing.mapping.sample": { payload: { readonly runtimeRequestTimestampMilliseconds: number }; result: PartyBeamTimingMappingSample };
  "session.complete": { payload: { readonly result: JsonValue }; result: Empty };
  "session.end.request": { payload: { readonly reasonCode: string; readonly payload?: JsonValue }; result: Empty };
  "projection.shared.publish": { payload: { readonly type: string; readonly payload: JsonValue }; result: Empty };
  "projection.private.publish": { payload: { readonly playerId: string; readonly type: string; readonly payload: JsonValue }; result: Empty };
  "controller.input.send": { payload: { readonly type: string; readonly payload: JsonValue; readonly peerTimestampMilliseconds?: number | null }; result: Empty };
  "storage.read": { payload: { readonly key: string }; result: { readonly found: boolean; readonly value: JsonValue } };
  "storage.write": { payload: { readonly key: string; readonly value: JsonValue }; result: Empty };
  "storage.delete": { payload: { readonly key: string }; result: Empty };
  "storage.migration.get": { payload: Empty; result: { readonly disposition: "none" | "pending"; readonly fromGameVersion: string | null; readonly targetGameVersion: string } };
  "storage.migration.resolve": { payload: { readonly resolution: "commitCurrentState" | "restoreSnapshot" }; result: Empty };
  "capability.query": { payload: { readonly capability: string }; result: PartyBeamCapabilityResult };
  "network.fetch": { payload: PartyBeamNetworkRequest; result: PartyBeamNetworkResponse };
  "diagnostics.emit": { payload: PartyBeamDiagnosticEvent; result: Empty };
}
export interface GameContractV1Events {
  "input": PartyBeamGameInput;
  "player.presence": PartyBeamPlayerPresence;
  "controller.projection": PartyBeamControllerProjection;
  "runtime.signal": PartyBeamRuntimeSignal;
  "timing.mapping.invalidated": PartyBeamTimingMappingInvalidated;
}
export type GameContractRequestEnvelope = {
  readonly type: "contract.request"; readonly requestId: string; readonly method: string;
  readonly payload: Readonly<Record<string, JsonValue>>;
};
export type GameContractResponseEnvelope<T = JsonValue> =
  | { readonly type: "contract.response"; readonly requestId: string; readonly ok: true; readonly payload: T }
  | { readonly type: "contract.response"; readonly requestId: string; readonly ok: false; readonly error: { readonly code: string } };
export interface GameContractEventEnvelope<T = JsonValue> {
  readonly type: "contract.event"; readonly event: string; readonly payload: T;
}
export type RuntimeBridgeMessage = GameContractRequestEnvelope | { readonly type: "runtime.ready" } | { readonly type: "runtime.fatal"; readonly message: string };
export class GameContractRequestError extends Error { constructor(code: string, requestId: string); readonly code: string; readonly requestId: string }
export function createRuntimeBridgeUri(message: RuntimeBridgeMessage): string;
export function isPartyBeamRuntimeLocation(locationLike?: { readonly hostname?: string }): boolean;
export interface GameContractV1ClientOptions {
  readonly window?: Window;
  readonly eventTarget?: Pick<EventTarget, "addEventListener" | "removeEventListener">;
  readonly navigate?: (uri: string) => void;
  /** Defaults to '*' for the host's opaque-origin sandbox. Incoming messages always require the parent source. */
  readonly parentOrigin?: string;
  readonly requestTimeoutMs?: number;
  readonly setTimer?: (callback: () => void, milliseconds: number) => unknown;
  readonly clearTimer?: (timer: unknown) => void;
}
export interface GameContractV1Client {
  request<M extends keyof GameContractV1Requests>(method: M, ...args:
    GameContractV1Requests[M]["payload"] extends Empty
      ? [payload?: GameContractV1Requests[M]["payload"]]
      : [payload: GameContractV1Requests[M]["payload"]]): Promise<GameContractV1Requests[M]["result"]>;
  subscribe<E extends keyof GameContractV1Events>(event: E, handler: (payload: GameContractV1Events[E]) => void): () => void;
  sendReady(): void;
  reportFatal(message: string): void;
  dispose(): void;
}
export function createGameContractV1Client(options?: GameContractV1ClientOptions): GameContractV1Client;
