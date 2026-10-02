import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

test("browser client handles responses/events without Object.hasOwn", async () => {
  const context = vm.createContext({ TextEncoder, setTimeout, clearTimeout, URL });
  vm.runInContext("Object.hasOwn = undefined", context);
  const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  vm.runInContext(source.replace(/\bexport /g, "") + "\nglobalThis.createClient = createGameContractV1Client;", context);
  const listeners = new Map(), sent = [];
  const client = context.createClient({
    eventTarget: { addEventListener: (name, handler) => listeners.set(name, handler),
      removeEventListener: name => listeners.delete(name) },
    navigate: uri => sent.push(JSON.parse(new URL(uri).searchParams.get("message")))
  });
  const emit = message => listeners.get("partybeam:contract-message")({ detail: message });
  const pending = client.request("session.get");
  const received = [];
  client.subscribe("input", payload => received.push(payload));
  // Inherited payloads must remain rejected as in modern engines.
  emit(Object.assign(Object.create({ payload: {} }), {
    type: "contract.response", requestId: sent[0].requestId, ok: true }));
  emit({ type: "contract.response", requestId: sent[0].requestId, ok: true, payload: { id: "session" } });
  assert.equal((await pending).id, "session");
  emit({ type: "contract.event", event: "input", payload: { value: 1 } });
  assert.equal(received[0].value, 1);
  client.dispose();
});
