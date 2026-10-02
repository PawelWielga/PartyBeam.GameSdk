const CONTRACT_EVENT_NAME = "partybeam:contract-message";
export const GAME_CONTRACT_VERSION = "1.0.0";
export const MAX_REQUEST_BYTES = 16 * 1024;
export const MAX_RESPONSE_BYTES = 64 * 1024;
let nextClientNumber = 1;
const encoder = new TextEncoder();
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function assertIdentifier(value, name, maxLength) {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength
      || /[\u0000-\u001f\u007f-\u009f]/u.test(value)) {
    throw new TypeError(`${name} must be a bounded non-empty string without control characters.`);
  }
}

function serialize(message, maxBytes = MAX_REQUEST_BYTES) {
  if (!isObject(message)) throw new TypeError("Runtime bridge message must be an object.");
  const json = JSON.stringify(message);
  if (encoder.encode(json).length > maxBytes) throw new RangeError("Game Contract message exceeds the host byte limit.");
  return json;
}

export class GameContractRequestError extends Error {
  constructor(code, requestId) {
    super(`Game Contract request '${requestId}' failed with '${code}'.`);
    this.name = "GameContractRequestError";
    this.code = code;
    this.requestId = requestId;
  }
}

export function isPartyBeamRuntimeLocation(locationLike = globalThis.location) {
  return typeof locationLike?.hostname === "string"
    && locationLike.hostname.endsWith(".runtime.partybeam.invalid");
}

export function createRuntimeBridgeUri(message) {
  return `partybeam-runtime://bridge/?message=${encodeURIComponent(serialize(message))}`;
}

export function createGameContractV1Client(options = {}) {
  const hostWindow = options.window ?? globalThis.window;
  const eventTarget = options.eventTarget ?? hostWindow;
  const parent = hostWindow?.parent;
  const useBrowserBridge = !!parent && parent !== hostWindow;
  const navigate = options.navigate ?? ((uri) => hostWindow.location.assign(uri));
  const parentOrigin = options.parentOrigin ?? "*";
  const setTimer = options.setTimer ?? globalThis.setTimeout;
  const clearTimer = options.clearTimer ?? globalThis.clearTimeout;
  const requestTimeoutMs = options.requestTimeoutMs ?? 5_000;
  if (!eventTarget || typeof eventTarget.addEventListener !== "function"
      || typeof eventTarget.removeEventListener !== "function") {
    throw new TypeError("Game Contract client requires an EventTarget-compatible host.");
  }
  if (typeof navigate !== "function" || typeof setTimer !== "function" || typeof clearTimer !== "function") {
    throw new TypeError("Game Contract client requires navigation and timer functions.");
  }
  if (!Number.isFinite(requestTimeoutMs) || requestTimeoutMs <= 0 || requestTimeoutMs > 2_147_483_647) {
    throw new RangeError("requestTimeoutMs must be a positive timer interval.");
  }
  if (typeof parentOrigin !== "string" || !parentOrigin) throw new TypeError("parentOrigin must be non-empty.");

  const clientId = nextClientNumber++;
  let nextRequestNumber = 1;
  let disposed = false;
  let active = null;
  const queue = [];
  const subscribers = new Map();

  function sendJson(messageJson) {
    if (disposed) throw new Error("Game Contract client has been disposed.");
    if (useBrowserBridge) {
      parent.postMessage({ type: "partybeam.runtime.bridge", messageJson }, parentOrigin);
    } else {
      navigate(`partybeam-runtime://bridge/?message=${encodeURIComponent(messageJson)}`);
    }
  }

  function dispatchNext() {
    if (disposed || active || !queue.length) return;
    const request = queue.shift();
    active = request;
    request.timer = setTimer(() => {
      if (active !== request) return;
      active = null;
      request.reject(new GameContractRequestError("contract.requestTimeout", request.id));
      dispatchNext();
    }, requestTimeoutMs);
    try {
      sendJson(request.json);
    } catch (error) {
      // A synchronous host may already have responded and dispatched the next request.
      if (active !== request) return;
      clearTimer(request.timer);
      active = null;
      request.reject(error);
      dispatchNext();
    }
  }

  function receive(message) {
    if (disposed || !isObject(message)) return;
    try { serialize(message, MAX_RESPONSE_BYTES); } catch { return; }
    if (message.type === "contract.response") {
      if (!active || message.requestId !== active.id || typeof message.ok !== "boolean") return;
      if (message.ok && !Object.hasOwn(message, "payload")) return;
      if (!message.ok && (!isObject(message.error) || typeof message.error.code !== "string")) return;
      const request = active;
      active = null;
      clearTimer(request.timer);
      if (message.ok) request.resolve(message.payload);
      else request.reject(new GameContractRequestError(message.error.code, request.id));
      dispatchNext();
    } else if (message.type === "contract.event" && typeof message.event === "string"
        && Object.hasOwn(message, "payload")) {
      for (const handler of [...(subscribers.get(message.event) ?? [])]) handler(message.payload);
    }
  }

  const onNativeMessage = (event) => receive(event?.detail);
  const onBrowserMessage = (event) => {
    if (!useBrowserBridge || event.source !== parent
        || (parentOrigin !== "*" && event.origin !== parentOrigin)
        || !isObject(event.data) || event.data.type !== "partybeam.runtime.contract"
        || typeof event.data.messageJson !== "string"
        || encoder.encode(event.data.messageJson).length > MAX_RESPONSE_BYTES) return;
    let message;
    try { message = JSON.parse(event.data.messageJson); } catch { return; }
    receive(message);
  };
  eventTarget.addEventListener(CONTRACT_EVENT_NAME, onNativeMessage);
  eventTarget.addEventListener("message", onBrowserMessage);

  function request(method, payload = {}) {
    assertIdentifier(method, "method", 128);
    if (!isObject(payload)) throw new TypeError("Game Contract request payload must be an object.");
    if (disposed) return Promise.reject(new GameContractRequestError("contract.clientDisposed", ""));
    const id = `sdk-${clientId}-${nextRequestNumber++}`;
    assertIdentifier(id, "requestId", 64);
    // Snapshot before queueing: caller mutation cannot change a later request.
    const json = serialize({ type: "contract.request", requestId: id, method, payload });
    if (!isObject(JSON.parse(json).payload)) throw new TypeError("Serialized request payload must be an object.");
    const result = new Promise((resolve, reject) => queue.push({ id, json, resolve, reject }));
    dispatchNext();
    return result;
  }

  function subscribe(eventName, handler) {
    assertIdentifier(eventName, "eventName", 128);
    if (typeof handler !== "function") throw new TypeError("Game Contract event handler must be a function.");
    if (disposed) throw new Error("Game Contract client has been disposed.");
    const handlers = subscribers.get(eventName) ?? new Set();
    handlers.add(handler);
    subscribers.set(eventName, handlers);
    return () => {
      handlers.delete(handler);
      if (!handlers.size && subscribers.get(eventName) === handlers) subscribers.delete(eventName);
    };
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    eventTarget.removeEventListener(CONTRACT_EVENT_NAME, onNativeMessage);
    eventTarget.removeEventListener("message", onBrowserMessage);
    subscribers.clear();
    if (active) {
      clearTimer(active.timer);
      active.reject(new GameContractRequestError("contract.clientDisposed", active.id));
      active = null;
    }
    for (const queued of queue.splice(0)) queued.reject(new GameContractRequestError("contract.clientDisposed", queued.id));
  }

  return Object.freeze({
    request, subscribe, dispose,
    sendReady: () => sendJson(serialize({ type: "runtime.ready" })),
    reportFatal: (message) => {
      assertIdentifier(message, "message", 1024);
      sendJson(serialize({ type: "runtime.fatal", message }));
    }
  });
}
