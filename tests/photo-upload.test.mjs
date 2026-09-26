import test from "node:test";
import assert from "node:assert/strict";
import { uploadPhoto } from "../src/lib/client.js";

function trackDeadlines(t) {
  const active = new Map();
  const cleared = [];
  t.mock.method(globalThis, "setTimeout", (callback, delay) => {
    const timer = { callback, delay };
    active.set(timer, timer);
    return timer;
  });
  t.mock.method(globalThis, "clearTimeout", timer => {
    cleared.push(timer);
    active.delete(timer);
  });
  return { active, cleared };
}

test("photo upload aborts at its deadline and a new attempt can succeed", async t => {
  const deadlines = trackDeadlines(t);
  const signals = [];
  t.mock.method(globalThis, "fetch", (_url, { signal }) => {
    signals.push(signal);
    if (signals.length > 1) return Promise.resolve({ json:async () => ({ ok:true }) });
    return new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once:true });
    });
  });

  const pending = uploadPhoto("Brandon", "data:image/jpeg;base64,first");
  const [deadline] = deadlines.active.values();
  assert.equal(deadline.delay, 20000);
  assert.equal(signals[0].aborted, false);
  deadline.callback();
  assert.deepEqual(await pending, { ok:false, error:"Photo upload timed out. Try again." });
  assert.equal(signals[0].aborted, true);
  assert.equal(deadlines.active.size, 0);

  assert.deepEqual(await uploadPhoto("Brandon", "data:image/jpeg;base64,retry"), { ok:true });
  assert.notEqual(signals[1], signals[0]);
  assert.equal(signals[1].aborted, false);
  assert.equal(deadlines.active.size, 0);
  assert.equal(deadlines.cleared.length, 2);
});

test("photo upload clears its deadline only after the response body settles", async t => {
  const deadlines = trackDeadlines(t);
  let resolveBody;
  let sent;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    sent = { url, ...options };
    return { json:() => new Promise(resolve => { resolveBody = resolve; }) };
  });

  const pending = uploadPhoto("Guest Name", "data:image/jpeg;base64,photo");
  await Promise.resolve();
  assert.equal(sent.url, "/api/photo/Guest%20Name");
  assert.equal(sent.method, "POST");
  assert.equal(JSON.parse(sent.body).dataUrl, "data:image/jpeg;base64,photo");
  assert.equal(deadlines.active.size, 1);
  assert.equal(deadlines.cleared.length, 0);
  const acknowledgement = { ok:true, version:7 };
  resolveBody(acknowledgement);
  assert.deepEqual(await pending, acknowledgement);
  assert.equal(sent.signal.aborted, false);
  assert.equal(deadlines.active.size, 0);
  assert.equal(deadlines.cleared.length, 1);
});

test("photo upload preserves ordinary errors and clears failed attempt deadlines", async t => {
  const deadlines = trackDeadlines(t);
  t.mock.method(globalThis, "fetch", async () => { throw new TypeError("Network failed"); });
  assert.deepEqual(await uploadPhoto("Brandon", "photo"), { ok:false, error:"Upload failed" });
  assert.equal(deadlines.active.size, 0);
  assert.equal(deadlines.cleared.length, 1);
});
