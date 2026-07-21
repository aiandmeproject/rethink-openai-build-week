import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "../server.js";

const server = createServer({ apiKey: "" });
server.listen(0, "127.0.0.1");
await once(server, "listening");

try {
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  const post = (path, body) => fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  }).then(async (response) => {
    const payload = await response.json();
    assert.equal(response.ok, true, payload?.error?.message);
    return payload;
  });

  const home = await fetch(base);
  assert.equal(home.status, 200);
  const { state } = await post("/api/projects", {
    input: "I think Florida-based disabled veterans could provide lower-cost remote work for companies."
  });
  const { routing } = await post("/api/rethink/route", { state, mode: "demo" });
  assert.equal(routing.selectedMethod, "DEFINE");
  const cycle = await post("/api/rethink/cycle", { state, routing, mode: "demo" });
  assert.equal(cycle.state.cycle, 1);
  assert.equal(cycle.result.nextAction.disposition, "VALIDATE");
  console.log("Smoke test passed: home → project → route → cycle → notebook");
} finally {
  server.close();
  await once(server, "close");
}
