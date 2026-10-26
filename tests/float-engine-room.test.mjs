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
async function run(room, clock, ms, until = () => false, each = null) {
  const end = clock.t + ms;
  while (clock.t < end) {
    clock.t += 1000 / 30;
    if (each) each(clock.t);
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
  /* The Drop's instant replay reached the screen when the final ended: 10 s of rows round the moment */
  const replay = tv.last("replay");
  assert.ok(replay, "a replay");
  assert.equal(replay.leg, 3);
  assert.ok(replay.k.length >= 150 && replay.k.length <= 205, `${replay.k.length} frames`);
  assert.ok(replay.k[0][0] >= replay.at - 6100 && replay.k.at(-1)[0] <= replay.at + 4000);
  assert.equal(replay.k[0][1].length, 3, "the final's three riders");
  assert.equal(phone.all("replay").length, 0, "screens only");
});

/* phones that stay live: a ping every 2 s, as net.js sends */
const keepAlive = (room, sockets) => {
  let next = 0;
  return t => {
    if (t < next) return;
    next = t + 2000;
    for (const ws of sockets) if (ws.readyState === 1) say(room, ws, { t:"ping", c:t, rtt:140 });
  };
};
const settle = async () => { for (let k = 0; k < 20; k += 1) await Promise.resolve(); };

test("a restarted room resumes its race from the last save after a 3 s countdown", async () => {
  const mem = memory();
  const clock = fakeClock();
  const first = (await makeRoom({ mem, clock })).room;
  const tv = connect(first, { role:"screen", device:"tv" });
  say(first, tv, { t:"host", cmd:"start", bots:8, drinking:true });
  await run(first, clock, 120000, () => first.cup.phase === "race" && first.race.t > 20);
  const savedTick = mem.entries.get("race").tick;
  assert.ok(savedTick > 500, "the race was saved while running");
  assert.equal(mem.entries.get("cup").phase, "race");
  assert.ok(mem.storage.alarm > clock.t && mem.storage.alarm <= clock.t + 5000, "a watchdog alarm while racing");
  /* the object dies; a new one loads the same storage a few seconds later */
  clock.t += 4000;
  const { room } = await makeRoom({ mem, clock });
  assert.equal(room.cup.phase, "countdown");
  assert.equal(room.cup.resume, true);
  assert.equal(room.cup.startAt, clock.t + TIMING.RESUME_MS, "startAt is when it goes again");
  assert.equal(room.race.tick, savedTick);
  const screen = connect(room, { role:"screen", device:"tv2" });
  assert.equal(screen.sent[1].phase, "countdown");
  assert.equal(screen.sent[1].resume, true);
  await run(room, clock, 3100);
  assert.equal(room.cup.phase, "race");
  assert.ok(Math.abs((clock.t - room.cup.startAt) / 1000 - room.race.t) < 0.1, "the race clock carries on from the save");
  const done = await run(room, clock, 200000, () => room.cup.phase === "cut");
  assert.ok(done, "and the round finishes");
  assert.equal(room.cup.history.length, 1);
});

function tournament({ failFirst = 0 } = {}) {
  const calls = [];
  let failures = failFirst;
  const env = { TOURNAMENT:{
    idFromName:name => `id:${name}`,
    get:id => ({ fetch:async (url, init) => {
      calls.push({ id, url:String(url), body:JSON.parse(init.body) });
      if (failures > 0) { failures -= 1; return new Response("nope", { status:503 }); }
      return new Response(JSON.stringify({ ok:true }), { status:200 });
    } }),
  } };
  return { env, calls };
}
const postCup = (room, body) => room.fetch(new Request("https://fd.internal/internal/cup?room=fd-float", {
  method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify(body) }));
const fdRider = (pid, extra = {}) => ({ name:pid, color:"#aa3300", pid, number:7, photo:`/api/photo/${pid}?v=1`,
  look:{ critter:"coyote", floatie:"shark", hat:"none", shades:"none", pose:"chug" }, ...extra });

test("Field Day: the Tournament reserves a Cup by player, phones take their entrants, the result goes back once", async () => {
  const { env, calls } = tournament({ failFirst:1 });
  const clock = fakeClock();
  const { room } = await makeRoom({ clock, env });
  const startAt = clock.t + 10000;
  const response = await postCup(room, { evId:"float", cupId:"cup-1", mode:"fieldday", drinking:true, startAt, bots:13,
    entrants:[fdRider("Brandon", { groom:true }), fdRider("Evan"), fdRider("Eyob", { drinks:false })] });
  const reply = await response.json();
  assert.equal(response.status, 200);
  assert.equal(reply.ok, true);
  assert.equal(reply.entrants, 13);
  assert.equal(room.cup.mode, "fieldday");
  assert.equal(room.cup.phase, "lobby");
  assert.equal(room.cup.startPlanned, startAt);
  assert.deepEqual(room.cup.entrants.slice(0, 3).map(entrant => entrant.pid), ["Brandon", "Evan", "Eyob"]);
  assert.equal(room.cup.entrants[0].groom, true);
  assert.equal(room.cup.entrants.filter(entrant => entrant.bot).length, 10);
  /* the same cupId again changes nothing */
  const again = await (await postCup(room, { evId:"float", cupId:"cup-1", startAt, bots:13, entrants:[fdRider("Brandon")] })).json();
  assert.equal(again.already, true);
  assert.equal(room.cup.entrants.length, 13);
  /* a phone saying pid takes its entrant; a stranger only watches; screens cannot start a Field Day cup */
  const tv = connect(room, { role:"screen", device:"tv", code:"fd-float" });
  const evan = connect(room, { device:"evan-phone", rider:fdRider("Evan", { look:{ critter:"otter", floatie:"pizza" } }), code:"fd-float" });
  assert.equal(evan.sent[0].you.entrant, 1);
  assert.equal(room.cup.entrants[1].device, "evan-phone");
  assert.equal(room.cup.entrants[1].look.floatie, "pizza", "the phone's floatie choice counts in the lobby");
  assert.equal(room.cup.entrants[1].name, "Evan", "identity stays Field Day's");
  const stranger = connect(room, { device:"x", rider:rider("Xavier"), code:"fd-float" });
  assert.equal(stranger.sent[0].you.entrant, undefined);
  say(room, tv, { t:"host", cmd:"start", bots:2 });
  assert.equal(room.cup.phase, "lobby", "the Tournament starts it, not a screen");
  const room0 = tv.last("room");
  assert.equal(room0.entrants[0].botDriven, true, "Brandon is not here: a bot will paddle");
  assert.equal(room0.entrants[1].botDriven, false);
  /* at startAt it starts by itself; the whole Cup runs */
  const done = await run(room, clock, 25 * 60 * 1000, () => room.cup.phase === "podium", keepAlive(room, [evan]));
  assert.ok(done, `reached the podium (in ${room.cup.phase})`);
  await settle();
  /* the first post failed; the alarm retries it a second later */
  assert.equal(room.outbox.find(item => item.id === "result:cup-1").done, false);
  clock.t += 1000;
  await room.alarm();
  await settle();
  const results = calls.filter(call => call.url.endsWith("/internal/float/result"));
  assert.ok(results.length >= 1);
  assert.equal(results[0].id, "id:main");
  const body = results.at(-1).body;
  assert.equal(body.cupId, "cup-1");
  assert.equal(body.evId, "float");
  assert.deepEqual(body.order.slice().sort(), ["Brandon", "Evan", "Eyob"], "real players only");
  const finalPids = room.cup.final.map(i => room.cup.entrants[i].pid).filter(Boolean);
  assert.deepEqual(body.order, finalPids, "in their relative order");
  assert.equal(body.rounds.length, 4);
  assert.equal(body.stats.rounds.length, 4);
  /* the first post failed (503): it was retried, and once it landed it never posts again */
  const outbox = room.outbox.find(item => item.id === "result:cup-1");
  assert.equal(outbox.done, true);
  assert.equal(results.length, 2);
  clock.t += 3600000;
  await room.alarm();
  await settle();
  assert.equal(calls.filter(call => call.url.endsWith("/internal/float/result")).length, 2);
  /* feedback goes to the Tournament too */
  await run(room, clock, TIMING.PODIUM_MS + 100, () => room.cup.phase === "feedback");
  await room.onMessage(evan, JSON.stringify({ t:"feedback", answers:{ fun:5, again:true, better:"More rapids", junk:{ x:1 } } }));
  await settle();
  await room.alarm();
  await settle();
  const feedback = calls.find(call => call.url.endsWith("/internal/float/feedback"));
  assert.deepEqual(feedback.body, { cupId:"cup-1", pid:"Evan", answers:{ fun:5, again:true, better:"More rapids" } });
});

test("a failing Tournament is retried with backoff from the alarm, never blocking the room", async () => {
  const { env, calls } = tournament({ failFirst:3 });
  const clock = fakeClock();
  const { room, mem } = await makeRoom({ clock, env });
  room.code = "fd-x";
  room.newCup({ mode:"fieldday", id:"cup-9", evId:"float" });
  room.queue("result:cup-9", "/internal/float/result", { cupId:"cup-9", order:[] });
  await settle();
  assert.equal(calls.length, 1);
  const item = room.outbox[0];
  assert.equal(item.tries, 1);
  assert.equal(item.nextAt, clock.t + 1000);
  assert.ok(mem.storage.alarm <= item.nextAt + 1, "the alarm comes back for it");
  clock.t += 1000;
  await room.alarm();
  assert.equal(calls.length, 2);
  assert.equal(room.outbox[0].nextAt, clock.t + 5000);
  clock.t += 5000;
  await room.alarm();
  clock.t += 30000;
  await room.alarm();
  assert.equal(calls.length, 4);
  assert.equal(room.outbox[0].done, true);
  /* it survives a restart: a new object sees it as sent */
  const { room:again } = await makeRoom({ mem, clock, env });
  assert.equal(again.outbox[0].done, true);
});

test("host commands: start with drinking off, back to the lobby, kick", async () => {
  const { room, clock } = await makeRoom();
  const tv = connect(room, { role:"screen", device:"tv" });
  const a = connect(room, { device:"a", rider:rider("Ann") });
  connect(room, { device:"b", rider:rider("Bo") });
  say(room, tv, { t:"host", cmd:"kick", device:"b" });
  assert.deepEqual(room.cup.entrants.map(entrant => entrant.name), ["Ann"]);
  say(room, a, { t:"ready", on:true });
  assert.equal(tv.last("room").entrants[0].ready, true);
  say(room, a, { t:"look", look:{ critter:"frog", floatie:"unicorn", hat:"crown", shades:"stars", pose:"backflip" } });
  assert.equal(room.cup.entrants[0].look.floatie, "unicorn");
  assert.equal(room.cup.entrants[0].look.hat, "none", "the crown is the groom's");
  /* a phone cannot host */
  say(room, a, { t:"host", cmd:"start", bots:3 });
  assert.equal(room.cup.phase, "lobby");
  say(room, tv, { t:"host", cmd:"start", bots:3, drinking:false });
  assert.equal(room.cup.phase, "intro");
  assert.equal(room.cup.drinking, false);
  assert.equal(room.cup.entrants.length, 4);
  await run(room, clock, 200000, () => room.cup.phase === "race" && room.race.riders.some(r => r.arrived), keepAlive(room, [a]));
  const arrived = room.race.riders.find(r => r.arrived);
  assert.equal(arrived.drinkAt, arrived.arriveAt, "drinking off: the drink counts on arrival");
  /* a kick mid-Cup hands the rider to a bot */
  say(room, tv, { t:"host", cmd:"kick", device:"a" });
  assert.equal(room.cup.entrants[0].kicked, true);
  assert.equal(room.botDriven(0), true);
  say(room, tv, { t:"host", cmd:"lobby" });
  assert.equal(room.cup.phase, "lobby");
  assert.deepEqual(room.cup.entrants.map(entrant => entrant.name), ["Ann"], "bots leave with the Cup");
  assert.equal(room.loop, null);
});

test("phones paddle their own rider; floods are dropped; thumbs show; a silent phone is paddled by a bot", async () => {
  const { room, clock } = await makeRoom();
  const tv = connect(room, { role:"screen", device:"tv" });
  const a = connect(room, { device:"a", rider:rider("Ann") });
  say(room, tv, { t:"host", cmd:"start", bots:4, drinking:true });
  const live = keepAlive(room, [a]);
  await run(room, clock, 60000, () => room.cup.phase === "race" && room.race.t > 2, live);
  const me = room.race.riders.find(r => r.i === 0);
  const before = me.st.strokes;
  for (let k = 0; k < 15; k += 1) say(room, a, { t:"stroke", side:k % 2 ? "R" : "L", p:1 });
  assert.ok(me.st.strokes - before <= 10, "more than 10 strokes a second are dropped");
  assert.ok(me.st.strokes - before >= 4);
  say(room, a, { t:"hands", n:1 });
  await run(room, clock, 200, () => false, live);
  const row = tv.last("snap").k.map(unpackRow).find(item => item.i === 0);
  assert.ok(row.f & FLAG.HANDS_OFF);
  assert.ok(tv.last("snap").s <= clock.t, "a snap is stamped with its tick's time");
  const mine = a.last("me");
  assert.equal(mine.i, 0);
  assert.equal(mine.of, 5);
  assert.equal(mine.cut, room.cup.schedule[1], "the places that go through");
  assert.equal(mine.cut, 4);
  assert.ok(mine.len > 300);
  assert.ok(tv.all("debug").length >= 1 && tv.last("debug").rtt.a === 140);
  assert.equal(room.botDriven(0), false);
  /* the phone goes quiet: within 5 s a bot paddles for it, and the room says so */
  const quietFrom = me.st.strokes;
  await run(room, clock, 8000);
  assert.equal(room.botDriven(0), true);
  assert.ok(me.st.strokes > quietFrom + 5, "the bot paddles");
  assert.equal(tv.last("room").entrants[0].botDriven, true);
  /* it speaks again: control comes back */
  say(room, a, { t:"ping", c:1 });
  assert.equal(room.botDriven(0), false);
});

test("between rounds: survivors swap floaties for 15 s; the out drink on the beach, then throw balloons", async () => {
  const { room, clock } = await makeRoom();
  const tv = connect(room, { role:"screen", device:"tv" });
  const phones = ["a", "b", "c", "d", "e"].map(device => connect(room, { device, rider:rider(device.toUpperCase()) }));
  say(room, tv, { t:"host", cmd:"start", bots:0, drinking:true });
  /* the phones stay quiet through the first race, so bots carry them */
  await run(room, clock, 400000, () => room.cup.phase === "cut");
  assert.equal(room.cup.phase, "cut");
  const live = keepAlive(room, phones);
  live(clock.t);
  const survivor = room.cup.field[0];
  const outI = room.cup.out[0];
  const phoneOf = i => phones.find(ws => ws.sent[0].you.entrant === i);
  say(room, phoneOf(survivor), { t:"look", look:{ floatie:"lounge", critter:"frog" } });
  assert.equal(room.cup.entrants[survivor].look.floatie, "lounge");
  assert.notEqual(room.cup.entrants[survivor].look.critter, "frog", "only the floatie changes mid-Cup");
  say(room, phoneOf(outI), { t:"look", look:{ floatie:"lounge" } });
  assert.notEqual(room.cup.entrants[outI].look.floatie, "lounge", "the out cannot swap");
  clock.t = room.cup.swapUntil + 1;
  say(room, phoneOf(survivor), { t:"look", look:{ floatie:"donut" } });
  assert.equal(room.cup.entrants[survivor].look.floatie, "lounge", "the window closed");
  /* the out rider: drink on the beach, then a balloon in the next race */
  await run(room, clock, 60000, () => room.cup.phase === "race" && room.race.t > 1, live);
  const outPhone = phoneOf(outI);
  if (!room.cup.beach[outI].drank) say(room, outPhone, { t:"drink" });
  assert.equal(room.cup.beach[outI].drank, true);
  const target = room.race.riders[0].i;
  say(room, outPhone, { t:"balloon", at:target });
  assert.ok(tv.all("ev").some(ev => ev.e === "balloon" && ev.i === outI && ev.j === target));
  const thrown = tv.all("ev").filter(ev => ev.e === "balloon").length;
  say(room, outPhone, { t:"balloon", at:target });
  assert.equal(tv.all("ev").filter(ev => ev.e === "balloon").length, thrown, "one every 12 s");
  await run(room, clock, 1500, () => false, live);
  assert.ok(tv.all("ev").some(ev => ev.e === "splash" && ev.i === outI), "it lands");
});
