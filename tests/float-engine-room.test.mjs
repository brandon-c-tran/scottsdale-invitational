/* Float's room (float/worker/room.js) over fake sockets and a fake clock:
   the protocol, a whole bot Cup in accelerated time, persistence and resume,
   and the Field Day bridge (float/PROTOCOL.md "The room", "Field Day"). */
import test from "node:test";
import assert from "node:assert/strict";
import { FloatRoom } from "../float/worker/room.js";
import { COURSE } from "../float/shared/course.js";
import { PHASES, FLAG, unpackRow } from "../float/shared/protocol.js";
import { TIMING } from "../float/shared/tuning.js";

class FakeSocket {
  constructor() { this.sent = []; this.listeners = {}; this.readyState = 1; }
  send(text) { if (this.readyState !== 1) throw new Error("closed"); this.sent.push(JSON.parse(text)); }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  accept() {}
  close() { this.readyState = 3; for (const fn of this.listeners.close || []) fn({}); }
  all(t) { return this.sent.filter(message => message.t === t); }
  last(t) { return this.all(t).at(-1); }
}

const memory = () => {
  const entries = new Map();
  const storage = {
    alarm:null,
    async get(key) { return structuredClone(entries.get(key)); },
    async put(key, value) { entries.set(key, structuredClone(value)); },
    async delete(key) { entries.delete(key); },
    async setAlarm(at) { storage.alarm = at; },
    async deleteAlarm() { storage.alarm = null; },
  };
  return { entries, storage, ctx:{ storage, blockConcurrencyWhile:fn => fn() } };
};

const fakeClock = (start = 1_700_000_000_000) => {
  const clock = { t:start, now:() => clock.t };
  return clock;
};

async function makeRoom({ mem = memory(), clock = fakeClock(), env = {} } = {}) {
  const room = new FloatRoom(mem.ctx, env, { clock, timers:false });
  await room.ready;
  return { room, mem, clock };
}

function connect(room, { role = "controller", device, rider, code = "abcd" } = {}) {
  const ws = new FakeSocket();
  room.attach(ws, new URL(`https://float.test/float/ws?room=${code}`));
  room.onMessage(ws, JSON.stringify({ t:"hello", role, device, ...(rider ? { rider } : {}) }));
  return ws;
}
const say = (room, ws, message) => room.onMessage(ws, JSON.stringify(message));

/* run the room's clock forward: the 30 Hz loop while it would run, the
   phase timer otherwise */
async function run(room, clock, ms, until = () => false) {
  const end = clock.t + ms;
  while (clock.t < end) {
    clock.t += 1000 / 30;
    const phase = room.cup?.phase;
    if (["grid", "countdown", "race"].includes(phase)) room.tick();
    else if ((phase === "lobby" && room.cup.startPlanned && clock.t >= room.cup.startPlanned)
      || (phase !== "lobby" && room.cup?.endsAt !== null && clock.t >= room.cup?.endsAt)) room.wake();
    if (until()) return true;
  }
  return until();
}

const rider = (name, extra = {}) => ({ name, color:"#336699", look:{ critter:"otter", floatie:"classic", hat:"none", shades:"none", pose:"flex" }, ...extra });

test("hello: welcome first, then the room with the whole course; broadcasts carry courseId", async () => {
  const { room } = await makeRoom();
  const screen = connect(room, { role:"screen", device:"tv-1" });
  assert.equal(screen.sent[0].t, "welcome");
  assert.deepEqual(screen.sent[0].you, { device:"tv-1", role:"screen" });
  const first = screen.sent[1];
  assert.equal(first.t, "room");
  assert.equal(first.course.id, COURSE.id);
  assert.equal(first.phase, "lobby");
  assert.equal(first.mode, "party");
  assert.equal(first.code, "abcd");
  assert.ok(Number.isFinite(first.s));
  const phone = connect(room, { device:"p-1", rider:rider("Ann") });
  assert.equal(phone.sent[0].you.entrant, 0);
  const update = screen.last("room");
  assert.equal(update.course, undefined);
  assert.equal(update.courseId, COURSE.id);
  assert.equal(update.entrants.length, 1);
  assert.equal(update.entrants[0].name, "Ann");
  assert.equal(update.entrants[0].connected, true);
  say(room, phone, { t:"ping", c:5, rtt:120 });
  assert.deepEqual({ t:phone.last("pong").t, c:phone.last("pong").c }, { t:"pong", c:5 });
});

test("a reconnecting phone takes back its entrant; a new phone mid-Cup only watches", async () => {
  const { room, clock } = await makeRoom();
  const tv = connect(room, { role:"screen", device:"tv" });
  const a = connect(room, { device:"a", rider:rider("Ann") });
  connect(room, { device:"b", rider:rider("Bo") });
  a.close();
  assert.equal(tv.last("room").entrants[0].connected, false);
  const again = connect(room, { device:"a", rider:rider("Ann") });
  assert.equal(again.sent[0].you.entrant, 0);
  assert.equal(room.cup.entrants.length, 2);
  say(room, tv, { t:"host", cmd:"start", bots:2, drinking:true });
  assert.equal(room.cup.phase, "intro");
  assert.equal(room.cup.entrants.length, 4);
  const late = connect(room, { device:"c", rider:rider("Cy") });
  assert.equal(late.sent[0].you.entrant, undefined);
  assert.equal(room.cup.entrants.length, 4);
  await run(room, clock, 1000);
});

test("a whole bot Cup runs from start to the podium, with the contract's messages", async () => {
  const { room, clock, mem } = await makeRoom();
  const tv = connect(room, { role:"screen", device:"tv" });
  const phone = connect(room, { device:"me", rider:rider("Me", { drinks:false }) });
  say(room, tv, { t:"host", cmd:"start", bots:12, drinking:true });
  assert.equal(room.cup.entrants.length, 13);
  assert.deepEqual(room.cup.schedule, [13, 9, 6, 3]);
  const phases = new Set();
  const done = await run(room, clock, 20 * 60 * 1000, () => {
    phases.add(room.cup.phase);
    return room.cup.phase === "podium";
  });
  assert.ok(done, `reached the podium (stuck in ${room.cup.phase}, round ${room.cup.round})`);
  for (const phase of ["intro", "grid", "countdown", "race", "cut", "podium"]) assert.ok(phases.has(phase), phase);
  for (const phase of phases) assert.ok(PHASES.includes(phase));
  assert.equal(room.cup.history.length, 4);
  assert.deepEqual(room.cup.history.map(item => item.field.length), [13, 9, 6, 3]);
  assert.equal(room.cup.final.length, 13);
  assert.equal(new Set(room.cup.final).size, 13);
  assert.equal(room.cup.podium.length, 3);
  assert.deepEqual(room.cup.podium, room.cup.final.slice(0, 3));
  /* the screen got snaps with valid rows; the phone (paddled by its bot? no: live) got `me` */
  const snaps = tv.all("snap");
  assert.ok(snaps.length > 100);
  const row = unpackRow(snaps.at(-1).k[0]);
  assert.ok(Number.isFinite(row.x) && Number.isFinite(row.y) && Number.isFinite(row.a));
  assert.ok(tv.all("ev").some(message => message.e === "arrive"));
  assert.ok(tv.all("ev").some(message => message.e === "out"));
  const me = phone.all("me");
  assert.ok(me.length > 10, "the phone heard about itself");
  assert.equal(me[0].i, room.cup.entrants.findIndex(entrant => entrant.device === "me"));
  for (const key of ["place", "of", "prog", "len", "stam", "f"]) assert.ok(key in me[0], key);
  /* the cup was saved */
  assert.equal(mem.entries.get("cup").phase, "podium");
});

void FLAG; void TIMING;
