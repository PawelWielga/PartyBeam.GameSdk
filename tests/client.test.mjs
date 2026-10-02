import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createGameContractV1Client, createRuntimeBridgeUri, GameContractRequestError, MAX_REQUEST_BYTES, isPartyBeamRuntimeLocation } from "@partybeam/game-sdk";
const fixture = JSON.parse(readFileSync(new URL("../fixtures/contract/v1.json", import.meta.url)));
class Host {
  listeners = new Map();
  addEventListener(name, handler) { const set = this.listeners.get(name) ?? new Set(); set.add(handler); this.listeners.set(name, set); }
  removeEventListener(name, handler) { this.listeners.get(name)?.delete(handler); }
  emit(name, event) { for (const handler of [...(this.listeners.get(name) ?? [])]) handler(event); }
}
function setup(browser = false, extra = {}) {
  const host = new Host();
  const sent = [];
  const timers = new Map();
  let nextTimer = 0;
  host.parent = browser ? { postMessage: (envelope, origin) => sent.push({ envelope, origin, message: JSON.parse(envelope.messageJson) }) } : host;
  const client = createGameContractV1Client({
    window: host,
    navigate: uri => sent.push({ uri, message: JSON.parse(new URL(uri).searchParams.get("message")) }),
    setTimer: callback => { timers.set(++nextTimer, callback); return nextTimer; },
    clearTimer: id => timers.delete(id),
    ...extra
  });
  const receive = message => browser
    ? host.emit("message", { source: host.parent, origin: "https://host.example", data: { type: "partybeam.runtime.contract", messageJson: JSON.stringify(message) } })
    : host.emit("partybeam:contract-message", { detail: message });
  const success = (index, payload = {}) => receive({ type: "contract.response", requestId: sent[index].message.requestId, ok: true, payload });
  return { client, host, sent, timers, receive, success };
}
for (const browser of [false, true]) {
  test(`${browser ? "browser" : "native"}: fixture correlation, serialized requests, events and lifecycle`, async () => {
    const h = setup(browser);
    h.client.sendReady();
    assert.deepEqual(h.sent[0].message, { type: "runtime.ready" });
    const first = h.client.request(fixture.request.method);
    const second = h.client.request("presence.get");
    assert.equal(h.sent.length, 2);
    assert.deepEqual({ ...h.sent[1].message, requestId: "fixture-1" }, fixture.request);
    h.success(1, fixture.session);
    assert.deepEqual(await first, fixture.session);
    assert.equal(h.sent.length, 3);
    h.success(2, []);
    assert.deepEqual(await second, []);
    for (const event of fixture.events) {
      const seen = [];
      const unsubscribe = h.client.subscribe(event.event, payload => seen.push(payload));
      h.receive(event);
      unsubscribe(); unsubscribe();
      h.receive(event);
      assert.deepEqual(seen, [event.payload]);
    }
    h.client.reportFatal("Could not initialize.");
    assert.deepEqual(h.sent.at(-1).message, { type: "runtime.fatal", message: "Could not initialize." });
    if (browser) {
      assert.equal(h.sent[0].origin, "*");
      assert.equal(h.sent[0].envelope.type, "partybeam.runtime.bridge");
    } else assert.equal(new URL(h.sent[0].uri).protocol, "partybeam-runtime:");
    h.client.dispose();
    assert.equal(h.timers.size, 0);
  });
}
test("timeout advances queue and ignores a late response", async () => {
  const h = setup();
  const first = h.client.request("session.get");
  const rejection = assert.rejects(first, { code: "contract.requestTimeout" });
  const second = h.client.request("presence.get");
  const [id, timer] = h.timers.entries().next().value;
  h.timers.delete(id); timer();
  await rejection;
  assert.equal(h.sent.length, 2);
  h.success(0, fixture.session);
  assert.equal(h.timers.size, 1);
  h.success(1, []); await second;
  h.client.dispose();
});
test("dispose rejects active and queued requests, removes both listeners and is idempotent", async () => {
  const h = setup(true);
  const a = assert.rejects(h.client.request("session.get"), { code: "contract.clientDisposed" });
  const b = assert.rejects(h.client.request("presence.get"), { code: "contract.clientDisposed" });
  h.client.dispose(); h.client.dispose();
  await Promise.all([a, b]);
  assert.equal(h.timers.size, 0);
  assert.equal([...h.host.listeners.values()].every(set => !set.size), true);
  await assert.rejects(h.client.request("session.get"), { code: "contract.clientDisposed" });
  assert.throws(() => h.client.sendReady(), /disposed/);
  assert.throws(() => h.client.subscribe("input", () => {}), /disposed/);
});
test("maps host error code and request identity", async () => {
  const h = setup();
  const result = h.client.request("session.get");
  h.receive({ type: "contract.response", requestId: h.sent[0].message.requestId, ok: false, error: fixture.error });
  await assert.rejects(result, error => error instanceof GameContractRequestError && error.code === fixture.error.code && error.requestId === h.sent[0].message.requestId);
  h.client.dispose();
});
test("malformed responses cannot settle or advance a request", async () => {
  const h = setup(); const result = h.client.request("session.get");
  const requestId = h.sent[0].message.requestId;
  for (const message of [null, [], {}, { type: "contract.response", requestId, ok: "true" }, { type: "contract.response", requestId, ok: false }, { type: "contract.response", requestId: "wrong", ok: true }, { type: "contract.response", requestId, ok: true, payload: "x".repeat(65536) }]) h.receive(message);
  assert.equal(h.timers.size, 1);
  h.success(0, fixture.session); assert.deepEqual(await result, fixture.session);
  h.client.dispose();
});
test("browser rejects foreign source, wrong origin, malformed JSON and unrelated envelopes", async () => {
  const h = setup(true, { parentOrigin: "https://host.example" });
  const result = h.client.request("session.get");
  const data = { type: "partybeam.runtime.contract", messageJson: JSON.stringify({ type: "contract.response", requestId: h.sent[0].message.requestId, ok: true, payload: fixture.session }) };
  h.host.emit("message", { source: {}, origin: "https://host.example", data });
  h.host.emit("message", { source: h.host.parent, origin: "https://attacker.example", data });
  for (const bad of [null, [], { ...data, messageJson: "{" }, { ...data, messageJson: "x".repeat(65537) }, { ...data, type: "other" }]) h.host.emit("message", { source: h.host.parent, origin: "https://host.example", data: bad });
  assert.equal(h.timers.size, 1);
  assert.equal(h.sent[0].origin, "https://host.example");
  h.receive(JSON.parse(data.messageJson)); await result; h.client.dispose();
});
test("validates identifiers, payload serialization and UTF-8 byte limits before queueing", async () => {
  const h = setup();
  for (const method of ["", " ", "a".repeat(129), "bad\nmethod", "bad\u0085method"]) assert.throws(() => h.client.request(method), TypeError);
  for (const payload of [null, [], true]) assert.throws(() => h.client.request("session.get", payload), TypeError);
  assert.throws(() => h.client.request("session.get", { toJSON: () => null }), TypeError);
  const circular = {}; circular.self = circular;
  assert.throws(() => h.client.request("session.get", circular), TypeError);
  assert.throws(() => h.client.request("storage.write", { key: "x", value: "ą".repeat(MAX_REQUEST_BYTES / 2) }), RangeError);
  assert.throws(() => h.client.reportFatal("x".repeat(1025)), TypeError);
  assert.throws(() => h.client.subscribe("input", null), TypeError);
  assert.equal(h.sent.length, 0);
  h.client.dispose();
});
test("snapshots queued payloads and assigns different ids to clients", async () => {
  const h = setup(); const other = setup();
  const a = h.client.request("session.get"); const b = other.client.request("session.get");
  assert.notEqual(h.sent[0].message.requestId, other.sent[0].message.requestId);
  const payload = { type: "game.state", payload: { phase: "ready" } };
  const queued = h.client.request("projection.shared.publish", payload);
  payload.payload.phase = "changed";
  h.success(0); other.success(0); await Promise.all([a, b]);
  assert.equal(h.sent[1].message.payload.payload.phase, "ready");
  h.success(1); await queued; h.client.dispose(); other.client.dispose();
});
test("navigation failure rejects and leaves the next request usable", async () => {
  let fail = true;
  const h = setup(false, { navigate: () => { if (fail) throw new Error("navigation failed"); } });
  await assert.rejects(h.client.request("session.get"), /navigation failed/);
  assert.equal(h.timers.size, 0); fail = false;
  const rejection = assert.rejects(h.client.request("session.get"), { code: "contract.clientDisposed" });
  h.client.dispose(); await rejection;
});
test("unsubscribe remains safe when an event subscription is replaced", () => {
  const h = setup(); const unsubscribe = h.client.subscribe("input", () => {});
  unsubscribe();
  let called = 0; h.client.subscribe("input", () => called++); unsubscribe();
  h.receive(fixture.events[0]); assert.equal(called, 1); h.client.dispose();
});
test("native bridge URI and runtime origin helper preserve v1 shape", () => {
  const uri = new URL(createRuntimeBridgeUri({ type: "runtime.ready" }));
  assert.equal(uri.hostname, "bridge"); assert.equal(uri.pathname, "/");
  assert.equal(uri.searchParams.get("message"), '{"type":"runtime.ready"}');
  assert.equal(isPartyBeamRuntimeLocation({ hostname: "game.runtime.partybeam.invalid" }), true);
  assert.equal(isPartyBeamRuntimeLocation({ hostname: "runtime.partybeam.invalid.attacker.test" }), false);
});
test("invalid host and timeout options fail before listener registration", () => {
  assert.throws(() => createGameContractV1Client({ eventTarget: {} }), TypeError);
  for (const requestTimeoutMs of [0, -1, NaN, Infinity, 2147483648]) {
    const host = new Host();
    assert.throws(() => createGameContractV1Client({ eventTarget: host, requestTimeoutMs }), RangeError);
    assert.equal(host.listeners.size, 0);
  }
});
test("a synchronous host response settles without leaking its timeout", async () => {
  const host = new Host();
  let timerCount = 0;
  const client = createGameContractV1Client({
    eventTarget: host,
    setTimer: () => { timerCount++; return timerCount; },
    clearTimer: () => { timerCount--; },
    navigate: uri => {
      const message = JSON.parse(new URL(uri).searchParams.get("message"));
      host.emit("partybeam:contract-message", { detail: { type: "contract.response", requestId: message.requestId, ok: true, payload: fixture.session } });
    }
  });
  assert.deepEqual(await client.request("session.get"), fixture.session);
  assert.equal(timerCount, 0);
  client.dispose();
});
