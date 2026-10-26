import test from "node:test";
import assert from "node:assert/strict";
import { BACKOFF_MAX_MS, BACKOFF_MIN_MS, DEVICE_KEY, OPEN_MS, PING_MS, PROBE_MS, QUIET_MS, connectFloat, floatDeviceId,
  floatSocketUrl, median } from "../float/client/net.js";

/* Float's room connection (float/PROTOCOL.md "Net"), driven by a fake
   WebSocket and a fake clock: nothing here opens a socket or waits. */

function fakeClock(start = 1_000_000) {
  let now = start, seq = 0;
  const timers = new Map();
  const clock = {
    now:() => now,
    setTimeout(fn, ms) { const id = ++seq; timers.set(id, { at:now + Math.max(0, Number(ms) || 0), fn }); return id; },
    clearTimeout(id) { timers.delete(id); },
    setInterval(fn, ms) { const id = ++seq; timers.set(id, { at:now + ms, fn, every:ms }); return id; },
    clearInterval(id) { timers.delete(id); },
    /* run every timer due within ms, in order, then land on the end */
    tick(ms) {
      const end = now + ms;
      for (;;) {
        let next = null;
        for (const [id, t] of timers) if (t.at <= end && (!next || t.at < next[1].at)) next = [id, t];
        if (!next) break;
        const [id, t] = next;
        now = t.at;
        if (t.every) t.at += t.every; else timers.delete(id);
        t.fn();
      }
      now = end;
    },
    pending:() => timers.size,
  };
  return clock;
}

function fakeSockets() {
  const all = [];
  class FakeSocket {
    constructor(url) { this.url = url; this.readyState = 0; this.sent = []; all.push(this); }
    send(data) { if (this.readyState !== 1) throw new Error("not open"); this.sent.push(JSON.parse(data)); }
    close() { if (this.readyState === 3) return; this.readyState = 3; this.onclose?.({}); }
    /* the test's side of the wire */
    open() { this.readyState = 1; this.onopen?.({}); }
    receive(msg) { this.onmessage?.({ data:typeof msg === "string" ? msg : JSON.stringify(msg) }); }
    fail() { this.readyState = 3; this.onclose?.({}); }
    of(t) { return this.sent.filter(m => m.t === t); }
  }
  return { FakeSocket, all, last:() => all[all.length - 1] };
}

const memoryStorage = (seed = {}) => {
  const data = new Map(Object.entries(seed));
  return { getItem:k => data.has(k) ? data.get(k) : null, setItem:(k, v) => data.set(k, String(v)), data };
};

function fakeTarget() {
  const handlers = new Map();
  return {
    visibilityState:"visible",
    addEventListener(type, fn) { handlers.set(type, fn); },
    removeEventListener(type, fn) { if (handlers.get(type) === fn) handlers.delete(type); },
    fire(type) { handlers.get(type)?.(); },
    has:type => handlers.has(type),
  };
}

function setup(options = {}) {
  const clock = fakeClock();
  const sockets = fakeSockets();
  const storage = options.storage || memoryStorage();
  const win = fakeTarget(), doc = fakeTarget();
  const net = connectFloat({ room:"brkt", role:"controller", hello:{ rider:{ name:"Brandon" } },
    WebSocket:sockets.FakeSocket, storage, now:clock.now, timers:clock, random:() => 0.5,
    location:{ protocol:"https:", host:"fielddayseries.com" }, win, doc, ...options });
  return { clock, sockets, storage, net, win, doc };
}

test("the socket url follows the page: wss on https, the room in the query", () => {
  assert.equal(floatSocketUrl("brkt", { protocol:"https:", host:"fielddayseries.com" }), "wss://fielddayseries.com/float/ws?room=brkt");
  assert.equal(floatSocketUrl("fd-float", { protocol:"http:", host:"localhost:5183" }), "ws://localhost:5183/float/ws?room=fd-float");
  const { sockets } = setup();
  assert.equal(sockets.last().url, "wss://fielddayseries.com/float/ws?room=brkt");
});

test("the device id is stable in localStorage float-device, and a new browser gets its own", () => {
  const storage = memoryStorage();
  const first = floatDeviceId(storage);
  assert.match(first, /^[\w-]{8,64}$/);
  assert.equal(storage.getItem(DEVICE_KEY), first);
  assert.equal(floatDeviceId(storage), first);
  const kept = memoryStorage({ [DEVICE_KEY]:"phone-1234abcd" });
  assert.equal(floatDeviceId(kept), "phone-1234abcd");
  const { net, sockets } = setup({ storage:kept });
  assert.equal(net.device, "phone-1234abcd");
  sockets.last().open();
  assert.equal(sockets.last().of("hello")[0].device, "phone-1234abcd");
});

test("open sends hello first (role, device, the caller's fields), then a ping, then reports open", () => {
  const order = [];
  const { net, sockets } = setup();
  net.onStatus(status => order.push(`status:${status}`));
  assert.equal(net.status(), "connecting");
  const ws = sockets.last();
  ws.open();
  assert.deepEqual(ws.sent.map(m => m.t), ["hello", "ping"]);
  assert.deepEqual(ws.sent[0], { rider:{ name:"Brandon" }, t:"hello", role:"controller", device:net.device });
  assert.equal(net.status(), "open");
  assert.deepEqual(order, ["status:open"]);
});

test("hello's own fields cannot be overridden, and a hello function is read at every open", () => {
  let look = "capybara";
  const { sockets, clock } = setup({ hello:() => ({ t:"nope", role:"screen", device:"x", rider:{ look } }) });
  sockets.last().open();
  assert.deepEqual(sockets.last().sent[0], { t:"hello", role:"controller", device:sockets.last().sent[0].device, rider:{ look:"capybara" } });
  assert.notEqual(sockets.last().sent[0].device, "x");
  look = "otter";
  sockets.last().fail();
  clock.tick(BACKOFF_MIN_MS * 2);
  sockets.last().open();
  assert.equal(sockets.last().of("hello")[0].rider.look, "otter", "a reconnect carries the latest look");
});

test("a ping every 2 s carries the last round trip; pongs set rtt and the median offset of the last five", () => {
  const { net, sockets, clock } = setup();
  const ws = sockets.last();
  ws.open();
  assert.equal(net.rtt(), null);
  assert.equal(ws.of("ping")[0].rtt, undefined, "no round trip yet");
  const c0 = ws.of("ping")[0].c;
  assert.equal(c0, clock.now());
  /* server clock 5 s ahead, 80 ms round trip */
  clock.tick(80);
  ws.receive({ t:"pong", s:c0 + 40 + 5000, c:c0 });
  assert.equal(net.rtt(), 80);
  assert.equal(net.serverNow() - clock.now(), 5000);
  clock.tick(PING_MS - 80);
  const second = ws.of("ping")[1];
  assert.equal(second.rtt, 80);
  /* four more samples, one an outlier: the median ignores it */
  const offsets = [5010, 4990, 9000, 5004];
  for (const off of offsets) {
    const c = ws.of("ping").at(-1).c;
    clock.tick(60);
    ws.receive({ t:"pong", s:c + 30 + off, c });
    clock.tick(PING_MS - 60);
  }
  assert.equal(net.serverNow() - clock.now(), median([5000, 5010, 4990, 9000, 5004]));
  assert.equal(net.serverNow() - clock.now(), 5004);
  /* only five samples count: a sixth pushes the first one out */
  const c = ws.of("ping").at(-1).c;
  ws.receive({ t:"pong", s:c + 9000, c });
  assert.equal(net.serverNow() - clock.now(), median([5010, 4990, 9000, 5004, 9000]));
});

test("until the first pong, any frame's s stands in for the offset", () => {
  const { net, sockets, clock } = setup();
  const ws = sockets.last();
  ws.open();
  ws.receive({ t:"welcome", s:clock.now() + 1234, you:{ device:net.device, role:"controller" } });
  assert.equal(net.serverNow() - clock.now(), 1234);
  const c = ws.of("ping")[0].c;
  ws.receive({ t:"pong", s:c + 300, c });
  ws.receive({ t:"room", s:clock.now() + 99999 });
  assert.equal(net.serverNow() - clock.now(), 300, "pongs win once there are any");
});

test("on(type) delivers parsed frames until its off; junk is ignored", () => {
  const { net, sockets } = setup();
  const ws = sockets.last();
  ws.open();
  const rooms = [], all = [];
  const off = net.on("room", msg => rooms.push(msg.phase));
  net.on("*", msg => all.push(msg.t));
  ws.receive({ t:"room", s:1, phase:"lobby" });
  ws.receive("not json");
  ws.receive({ phase:"no type" });
  ws.receive({ t:"me", s:2 });
  off();
  ws.receive({ t:"room", s:3, phase:"race" });
  assert.deepEqual(rooms, ["lobby"]);
  assert.deepEqual(all, ["room", "me", "room"]);
});

test("send is false while not open and nothing is queued for later", () => {
  const { net, sockets, clock } = setup();
  assert.equal(net.send({ t:"stroke", side:"L", p:0.5 }), false);
  sockets.last().open();
  assert.equal(net.send({ t:"stroke", side:"R", p:0.9 }), true);
  assert.deepEqual(sockets.last().of("stroke"), [{ t:"stroke", side:"R", p:0.9 }]);
  sockets.last().fail();
  assert.equal(net.send({ t:"stroke", side:"L", p:0.4 }), false);
  clock.tick(BACKOFF_MIN_MS * 2);
  sockets.last().open();
  assert.deepEqual(sockets.last().of("stroke"), [], "a stroke made offline never replays");
});

test("a lost socket reconnects with growing backoff, resends hello, and backoff resets after an open", () => {
  const { net, sockets, clock } = setup();
  const statuses = [];
  net.onStatus(s => statuses.push(s));
  sockets.last().open();
  /* three failures in a row: 300, 600, 1200 (jitter fixed at 1.0 by random 0.5) */
  const delays = [];
  for (let k = 0; k < 3; k++) {
    const before = sockets.all.length;
    sockets.last().fail();
    let waited = 0;
    while (sockets.all.length === before) { clock.tick(50); waited += 50; }
    delays.push(waited);
  }
  assert.deepEqual(delays, [300, 600, 1200]);
  sockets.last().open();
  assert.equal(sockets.last().of("hello").length, 1, "hello again on the new socket");
  const before = sockets.all.length;
  sockets.last().fail();
  clock.tick(BACKOFF_MIN_MS - 1);
  assert.equal(sockets.all.length, before);
  clock.tick(1);
  assert.equal(sockets.all.length, before + 1, "an open resets the backoff");
  /* retries while down never report twice */
  assert.deepEqual(statuses, ["open", "connecting", "open", "connecting"]);
  assert.equal(net.status(), "connecting");
});

test("backoff stops growing at its cap", () => {
  const { sockets, clock } = setup();
  let waited = 0;
  for (let k = 0; k < 10; k++) {
    const before = sockets.all.length;
    sockets.last().fail();
    waited = 0;
    while (sockets.all.length === before) { clock.tick(50); waited += 50; }
  }
  assert.equal(waited, BACKOFF_MAX_MS);
});

test("an open socket that goes silent is replaced", () => {
  const { net, sockets, clock } = setup();
  const ws = sockets.last();
  ws.open();
  /* answered pings keep it */
  for (let k = 0; k < 5; k++) {
    clock.tick(PING_MS);
    const c = ws.of("ping").at(-1).c;
    ws.receive({ t:"pong", s:c, c });
  }
  assert.equal(sockets.all.length, 1);
  /* then nothing at all for longer than QUIET_MS */
  clock.tick(QUIET_MS + PING_MS + BACKOFF_MIN_MS * 2);
  assert.ok(sockets.all.length >= 2, "a dead socket was replaced");
  assert.equal(ws.readyState, 3, "the old one is closed");
  assert.equal(net.status(), "connecting");
});

test("a socket stuck connecting is replaced", () => {
  const { sockets, clock } = setup();
  clock.tick(OPEN_MS + BACKOFF_MIN_MS * 2);
  assert.ok(sockets.all.length >= 2);
});

test("coming back to the page probes: a socket that answers stays, a quiet one is replaced", () => {
  const { sockets, clock, doc, win } = setup();
  const ws = sockets.last();
  ws.open();
  const pings = ws.of("ping").length;
  doc.fire("visibilitychange");
  assert.equal(ws.of("ping").length, pings + 1, "the probe is a ping");
  clock.tick(100);
  ws.receive({ t:"pong", s:clock.now(), c:ws.of("ping").at(-1).c });
  clock.tick(PROBE_MS);
  assert.equal(sockets.all.length, 1, "an answered probe keeps the socket");
  win.fire("pageshow");
  clock.tick(PROBE_MS + 1);
  assert.equal(ws.readyState, 3, "an unanswered probe replaces it");
  clock.tick(BACKOFF_MIN_MS * 2);
  assert.equal(sockets.all.length, 2);
  /* back online with no socket at all: connect at once */
  sockets.last().fail();
  const before = sockets.all.length;
  win.fire("online");
  assert.equal(sockets.all.length, before + 1);
});

test("a hidden page does not probe", () => {
  const { sockets, doc } = setup();
  const ws = sockets.last();
  ws.open();
  const pings = ws.of("ping").length;
  doc.visibilityState = "hidden";
  doc.fire("visibilitychange");
  assert.equal(ws.of("ping").length, pings);
});

test("close() closes for good: status closed, no reconnects, no listeners left behind", () => {
  const { net, sockets, clock, win, doc } = setup();
  const statuses = [];
  net.onStatus(s => statuses.push(s));
  sockets.last().open();
  net.close();
  assert.equal(net.status(), "closed");
  assert.equal(statuses.at(-1), "closed");
  assert.equal(sockets.last().readyState, 3);
  clock.tick(60000);
  assert.equal(sockets.all.length, 1);
  assert.equal(clock.pending(), 0, "no timers left");
  assert.equal(net.send({ t:"ready", on:true }), false);
  assert.ok(!win.has("pageshow") && !win.has("online") && !doc.has("visibilitychange"));
  net.close();
  assert.equal(statuses.filter(s => s === "closed").length, 1);
});

test("an onStatus listener that sends on open lands after the hello", () => {
  const { net, sockets } = setup();
  net.onStatus(status => { if (status === "open") net.send({ t:"hands", n:2 }); });
  sockets.last().open();
  assert.deepEqual(sockets.last().sent.map(m => m.t), ["hello", "ping", "hands"]);
});
