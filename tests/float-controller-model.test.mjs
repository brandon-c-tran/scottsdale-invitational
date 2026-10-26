/* What the phone shows, from what the room says (float/client/controller
   controllerModel.js, useRoom.js foldFrame), and a whole Cup through the
   pretend room (mockRoom.js) on a fake clock, read the way the controller
   reads it. */
import test from "node:test";
import assert from "node:assert/strict";
import { BALLOON_MS, FLAG, IMMUNE_MS, beachDrank, beachState, beachTargets, countFor, cupDone, cutStatus, drinkState,
  drinksOn, finalPlace, findMe, foldEvent, gridSlot, gunAt, legName, ordinal, outRoundOf, outThisRound, raceView,
  roundShape, screenOf, swapEndsAt, swapView, withDrink } from "../float/client/controller/controllerModel.js";
import { EMPTY, foldFrame } from "../float/client/controller/useRoom.js";
import { MOCK_LEG_M, MOCK_SCENES, MOCK_TIMING, createMockRoom, mockFields } from "../float/client/controller/mockRoom.js";

const entrants = n => Array.from({ length:n }, (_, i) => ({ device:`d${i}`, name:`R${i}`, color:"#ff5a4f", drinks:true }));

test("ordinal", () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 0, -1].map(ordinal),
    ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "101st", "", "1st"]);
});

test("findMe: by device in the room's entrants; the welcome's index only before the first room", () => {
  const room = { entrants:[{ device:"a" }, { device:"b", pid:"Sahil" }] };
  assert.equal(findMe({ room, device:"b" }), 1);
  assert.equal(findMe({ room, device:"z", welcome:{ entrant:0 } }), -1, "kicked in the lobby: not someone else");
  assert.equal(findMe({ room:null, device:"z", welcome:{ entrant:3 } }), 3);
  assert.equal(findMe({ room:null, device:"z" }), -1);
  /* a lobby that loses a bot shifts indexes: the device still finds us */
  assert.equal(findMe({ room:{ entrants:[{ device:"b" }] }, device:"b", welcome:{ entrant:1 } }), 0);
});

test("screenOf: every phase, for a racer, an out rider and a phone that only watches", () => {
  const base = { entrants:entrants(6), field:[0, 1, 2, 3], out:[5, 4] };
  const at = (phase, idx, extra = {}) => screenOf({ room:{ ...base, phase, ...extra }, idx });
  assert.deepEqual(screenOf({ room:null, idx:0 }), { screen:"connecting", sideways:false });
  assert.deepEqual(at("lobby", 0), { screen:"lobby", sideways:false });
  assert.deepEqual(at("intro", 0), { screen:"intro", sideways:true });
  for (const phase of ["grid", "countdown", "race"]) {
    assert.deepEqual(at(phase, 1), { screen:phase, sideways:true });
    assert.deepEqual(at(phase, 4), { screen:"beach", sideways:false });
    assert.equal(at(phase, -1).screen, "watch");
  }
  assert.deepEqual(at("cut", 2), { screen:"cut", sideways:true });
  assert.equal(at("cut", 4, { results:[{ i:4, place:5 }] }).screen, "outcut", "out this round");
  assert.equal(at("cut", 5, { results:[{ i:4, place:5 }] }).screen, "beach", "out before");
  assert.deepEqual(at("podium", 4), { screen:"podium", sideways:false });
  assert.deepEqual(at("feedback", 0), { screen:"feedback", sideways:false });
});

test("the cut line: through while inside it, out by how many places when not", () => {
  assert.deepEqual(cutStatus({ place:3, of:13, cut:9 }), { through:true, by:7, label:"Through" });
  assert.deepEqual(cutStatus({ place:9, of:13, cut:9 }), { through:true, by:1, label:"Through" });
  assert.deepEqual(cutStatus({ place:11, of:13, cut:9 }), { through:false, by:2, label:"Out by 2" });
  assert.equal(cutStatus({ place:2, of:3, cut:null }), null, "the final has no cut");
  assert.equal(cutStatus({ place:2, of:3, cut:3 }), null, "everyone goes through");
  assert.deepEqual(cutStatus({ place:7, of:9 }, 6), { through:false, by:1, label:"Out by 1" }, "the room's cut");
});

test("raceView reads the me frame: place, progress, stamina, flags", () => {
  const view = raceView({ place:4, of:13, prog:80, len:160, stam:0.4, f:FLAG.SWIM | FLAG.DRANK, cut:9 });
  assert.equal(view.progress, 0.5);
  assert.equal(view.left, 80);
  assert.equal(view.stamina, 0.4);
  assert.deepEqual([view.swim, view.drank, view.arrived], [true, true, false]);
  assert.equal(view.cut.label, "Through");
  const empty = raceView(null);
  assert.deepEqual([empty.place, empty.progress, empty.stamina, empty.cut], [null, 0, 1, null]);
  assert.equal(raceView({ prog:999, len:160 }).progress, 1);
});

test("the gun: a countdown's startAt (the engine sets endsAt to it too), else three seconds on", () => {
  assert.equal(gunAt({ phase:"countdown", s:1000, startAt:4000, endsAt:4000 }), 4000);
  assert.equal(gunAt({ phase:"countdown", s:1000, startAt:900, endsAt:4000 }), 4000);
  assert.equal(gunAt({ phase:"countdown", s:1000 }), 4000);
  assert.equal(gunAt({ phase:"race", s:9000, startAt:4000 }), 4000);
  assert.equal(gunAt({ phase:"cut" }), null);
  assert.deepEqual([3600, 2001, 1000, 1, 0, -50].map(left => countFor(10000, 10000 - left)), [3, 3, 1, 1, 0, 0]);
  assert.equal(countFor(null, 5), null);
});

test("the drink button: nothing owed, locked before the gun, owed, waiting on the room, done", () => {
  assert.equal(drinkState({ owes:false, drank:false, sent:false, live:true }), null);
  assert.equal(drinkState({ owes:true, drank:false, sent:false, live:false }), "locked");
  assert.equal(drinkState({ owes:true, drank:false, sent:false, live:true }), "idle");
  assert.equal(drinkState({ owes:true, drank:false, sent:true, live:true }), "sent");
  assert.equal(drinkState({ owes:true, drank:true, sent:false, live:false }), "done");
  assert.equal(drinksOn({ drinking:false, entrants:entrants(2) }, 0), false);
  assert.equal(drinksOn({ drinking:true, entrants:[{ drinks:false }] }, 0), false);
  assert.equal(drinksOn({ drinking:true, entrants:entrants(2) }, 1), true);
});

test("the floatie swap: the room's swapUntil, none after the final, else fifteen seconds from the cut", () => {
  assert.equal(swapEndsAt({ phase:"cut", swapUntil:5000, startAt:1000 }), 5000);
  assert.equal(swapEndsAt({ phase:"cut", swapUntil:null, startAt:1000 }), null, "the engine's last cut");
  assert.equal(swapEndsAt({ phase:"cut", s:1200, startAt:1000 }), 16000, "the contract's reading");
  assert.equal(swapEndsAt({ phase:"cut", startAt:1000, podium:[1, 2, 3] }), null);
  assert.equal(swapEndsAt({ phase:"race", swapUntil:5000 }), null);
  assert.deepEqual(swapView({ phase:"cut", swapUntil:5000 }, 4000), { open:true, left:1000, ends:5000 });
  assert.equal(swapView({ phase:"cut", swapUntil:5000 }, 5000).open, false);
});

test("the round's shape, the grid slot, the leg's name", () => {
  const room = { round:1, rounds:4, field:[4, 2, 0, 7, 1, 3, 5, 6, 8], cut:6, entrants:entrants(13) };
  assert.deepEqual(roundShape(room), { round:1, rounds:4, of:9, final:false, through:6 });
  assert.deepEqual(roundShape({ ...room, round:3, field:[0, 1, 2], cut:null }), { round:3, rounds:4, of:3, final:true, through:null });
  assert.equal(roundShape({ round:0, rounds:4, field:[0, 1, 2], cut:3 }).through, null, "three race uncut");
  assert.equal(gridSlot(room, 0), 3);
  assert.equal(gridSlot(room, 12), null);
  assert.equal(legName({ legs:[{ name:"Put-in" }, { name:"The Narrows" }] }, 1), "The Narrows");
  assert.equal(legName(null, 0), "");
});

test("final places: the room's final, else standings, else podium and reverse elimination", () => {
  assert.equal(finalPlace({ final:[3, 0, 5, 9, 1] }, 0), 2);
  assert.equal(finalPlace({ standings:[{ i:3, place:1 }, { i:0, place:2 }] }, 0), 2);
  assert.equal(finalPlace({ standings:[3, 0] }, 0), 2);
  assert.equal(finalPlace({ podium:[3, 5, 0], out:[9, 8] }, 0), 3);
  assert.equal(finalPlace({ podium:[3, 5, 2], out:[9, 8, 0] }, 0), 4, "the last out is 4th");
  assert.equal(finalPlace({ podium:[3, 5, 2], out:[9, 8, 0] }, 9), 6);
  assert.equal(finalPlace(null, 0), null);
  assert.equal(cupDone({ final:[1, 2] }), true);
  assert.equal(cupDone({ podium:null, final:null }), false);
});

test("an out rider's drink: from their result, the history, their drinks since, or this phone's memory", () => {
  const room = { phase:"race", round:1, entrants:entrants(13), out:[12, 0], field:[1, 2, 3],
    history:[{ round:0, out:[0, 12], results:[{ i:0, drinkAt:null }, { i:12, drinkAt:31 }] }], results:[] };
  assert.equal(outRoundOf(room, 0), 0);
  assert.equal(beachDrank({ room, idx:0 }), false);
  assert.equal(beachDrank({ room, idx:12 }), true, "drank in the race that put them out");
  assert.equal(beachDrank({ room, idx:0, memory:withDrink({}, 1) }), true, "their drink event since");
  assert.equal(beachDrank({ room, idx:0, memory:withDrink({}, -1) }), false, "a drink before is not this one");
  assert.equal(beachDrank({ room, idx:0, memory:{ beachDrank:true } }), true);
  assert.equal(beachDrank({ room:{ ...room, drinking:false }, idx:0 }), true);
  const cut = { phase:"cut", round:0, entrants:entrants(13), out:[0], results:[{ i:0, place:11, drinkAt:12.5 }] };
  assert.equal(outThisRound(cut, 0), true);
  assert.equal(beachDrank({ room:cut, idx:0 }), true);
});

test("the beach's racers: race order, never the thrower or the out, in-at-the-takeout and splashed marked", () => {
  const room = { phase:"race", round:1, field:[1, 2, 3, 4], out:[9, 0],
    results:[{ i:3, place:1, time:40 }, { i:1, place:2, time:null }, { i:4, place:3, time:null }, { i:2, place:4, time:null }] };
  const now = 100000;
  const targets = beachTargets({ room, idx:0, now, memory:{ splashes:{ 4:now - 1000, 2:now - IMMUNE_MS - 1 }, arrived:{ 1:1 } } });
  assert.deepEqual(targets.map(t => t.i), [3, 1, 4, 2]);
  assert.deepEqual(targets.map(t => t.arrived), [true, true, false, false]);
  assert.deepEqual(targets.map(t => t.immune), [false, false, true, false]);
  assert.equal(targets[2].immuneLeft, IMMUNE_MS - 1000);
  /* between races, the field in grid order */
  assert.deepEqual(beachTargets({ room:{ ...room, phase:"cut", results:[] }, idx:0, now }).map(t => t.i), [1, 2, 3, 4]);
  assert.deepEqual(beachTargets({ room, me:{ order:[4, 3, 0, 9, 2] }, idx:0, now }).map(t => t.i), [4, 3, 2]);
});

test("the beach: a drink first, then a balloon every twelve seconds, only while a race runs", () => {
  const room = { phase:"race", round:1, entrants:entrants(13), field:[1, 2], out:[0], history:[{ round:0, out:[0], results:[{ i:0, drinkAt:null }] }] };
  const now = 50000;
  assert.equal(beachState({ room, idx:0, now }).needsDrink, true);
  const drank = withDrink({}, 1);
  const ready = beachState({ room, idx:0, now, memory:drank });
  assert.deepEqual([ready.needsDrink, ready.ready, ready.cooldown], [false, true, 0]);
  const cooling = beachState({ room, idx:0, now, memory:{ ...drank, lastThrowAt:now - 3000 } });
  assert.equal(cooling.ready, false);
  assert.equal(cooling.readyAt, now - 3000 + BALLOON_MS);
  assert.equal(cooling.cooldown, 0.75);
  assert.equal(beachState({ room:{ ...room, phase:"cut" }, idx:0, now, memory:drank }).ready, false, "no race, no balloons");
});

test("foldEvent: drinks, throws, landings, arrivals and the round a rider went out", () => {
  let m = {};
  m = foldEvent(m, { t:"ev", e:"drink", i:0, s:10 }, 0, 2);
  assert.deepEqual(m.drinkRounds, [2]);
  m = foldEvent(m, { t:"ev", e:"drink", i:4, s:11 }, 0, 2);
  assert.deepEqual(m.drinkRounds, [2], "someone else's drink");
  m = foldEvent(m, { t:"ev", e:"balloon", i:0, j:3, s:20 }, 0, 2);
  assert.equal(m.lastThrowAt, 20);
  m = foldEvent(m, { t:"ev", e:"splash", i:0, j:3, s:21 }, 0, 2);
  assert.deepEqual([m.splashes[3], m.landed.j], [21, 3]);
  m = foldEvent(m, { t:"ev", e:"splash", i:0, s:40 }, 0, 2);
  assert.deepEqual(m.landed, { j:null, s:40 }, "a miss");
  m = foldEvent(m, { t:"ev", e:"splash", i:7, j:5, s:41 }, 0, 2);
  assert.equal(m.splashes[5], 41);
  assert.equal(m.landed.s, 40, "someone else's balloon is not ours");
  m = foldEvent(m, { t:"ev", e:"arrive", i:6, s:50 }, 0, 2);
  assert.equal(m.arrived[6], 2);
  m = foldEvent(m, { t:"ev", e:"out", i:0, s:60 }, 0, 2);
  assert.equal(m.outRound, 2);
  assert.equal(foldEvent(m, { t:"welcome" }, 0, 2), m);
});

test("foldFrame: the course is kept, the last race's me is dropped at a new round, memory starts over with a new Cup", () => {
  const opts = { device:"me" };
  let s = foldFrame(EMPTY, { t:"welcome", you:{ device:"me", entrant:1 } }, opts);
  assert.equal(s.idx, 1);
  const people = [{ device:"x" }, { device:"me" }];
  s = foldFrame(s, { t:"room", cupId:"c1", phase:"race", round:0, entrants:people, course:{ id:"salt", legs:[] } }, opts);
  assert.equal(s.course.id, "salt");
  s = foldFrame(s, { t:"me", i:1, place:2, f:FLAG.DRANK }, opts);
  assert.deepEqual(s.memory.drinkRounds, [0]);
  s = foldFrame(s, { t:"room", cupId:"c1", phase:"cut", round:0, entrants:people, courseId:"salt" }, opts);
  assert.equal(s.course.id, "salt");
  assert.equal(s.me.place, 2, "the cut still shows the race just run");
  s = foldFrame(s, { t:"room", cupId:"c1", phase:"grid", round:1, entrants:people, courseId:"salt" }, opts);
  assert.equal(s.me, null);
  s = foldFrame(s, { t:"ev", e:"balloon", i:1, j:0, s:5 }, opts);
  assert.equal(s.memory.lastThrowAt, 5);
  s = foldFrame(s, { t:"room", cupId:"c2", phase:"intro", round:0, entrants:people, courseId:"salt" }, opts);
  assert.deepEqual(s.memory, {});
  s = foldFrame(s, { t:"room", cupId:"c2", phase:"race", round:0, entrants:people, courseId:"other" }, opts);
  assert.equal(s.course, null, "a different course is not this one");
  s = foldFrame(s, { t:"room", cupId:"c2", phase:"cut", round:0, out:[1], entrants:people }, opts);
  assert.equal(s.memory.outRound, 0);
});

test("the mock speaks the engine's cut schedule and has every scene the checks shoot", () => {
  assert.deepEqual(mockFields(13), [13, 9, 6, 3]);
  assert.deepEqual(mockFields(8), [8, 6, 4, 3]);
  assert.deepEqual(mockFields(3), [3, 3, 3, 3]);
  for (const scene of ["lobby", "intro", "grid", "countdown", "race", "race-arrived", "cut", "cut-last", "outcut", "beach-drink",
    "beach", "podium", "feedback"]) assert.ok(MOCK_SCENES.includes(scene), scene);
});

/* ── a whole Cup through the pretend room ── */
function fakeClock(start = 1_000_000) {
  let now = start, seq = 0;
  const tasks = new Map();
  const add = (fn, ms, every) => { const id = ++seq; tasks.set(id, { fn, at:now + Math.max(0, Number(ms) || 0), every }); return id; };
  return {
    timers:{ setTimeout:(fn, ms) => add(fn, ms, null), clearTimeout:id => tasks.delete(id),
      setInterval:(fn, ms) => add(fn, ms, Math.max(1, ms)), clearInterval:id => tasks.delete(id) },
    now:() => now,
    advance(ms) {
      const end = now + ms;
      for (;;) {
        let pick = null;
        for (const [id, task] of tasks) if (task.at <= end && (!pick || task.at < pick[1].at || (task.at === pick[1].at && id < pick[0]))) pick = [id, task];
        if (!pick) break;
        const [id, task] = pick;
        now = task.at;
        if (task.every) task.at += task.every; else tasks.delete(id);
        task.fn();
      }
      now = end;
    },
  };
}

function phone({ bots = 12 } = {}) {
  const clock = fakeClock();
  const rider = { name:"Brandon", color:"#ff5a4f", look:{ critter:"otter", floatie:"donut", hat:"none", shades:"none", pose:"flex" }, drinks:true };
  const net = createMockRoom({ hello:() => ({ rider }), timers:clock.timers, now:clock.now, bots });
  let state = { ...EMPTY };
  const seen = [];
  for (const type of ["welcome", "room", "me", "ev"]) net.on(type, msg => { state = foldFrame(state, msg, { device:net.device }); seen.push(msg); });
  const view = () => ({ ...screenOf({ room:state.room, idx:state.idx }), state });
  const until = (fn, { step = 100, max = 400000 } = {}) => {
    for (let t = 0; t <= max; t += step) { if (fn()) return true; clock.advance(step); }
    return false;
  };
  return { clock, net, seen, view, until, get state() { return state; } };
}

test("a whole Cup on the mock, read as the phone reads it: lobby to lobby", () => {
  const p = phone();
  p.clock.advance(300);
  assert.equal(p.net.status(), "open");
  assert.equal(p.view().screen, "lobby");
  assert.equal(p.state.idx, 0);
  assert.equal(p.state.course?.legs?.length, 4);
  p.net.send({ t:"ready", on:true });
  assert.ok(p.until(() => p.view().screen === "intro"), "the Cup starts once everyone is ready");
  assert.equal(p.view().sideways, true);
  assert.ok(p.until(() => p.view().screen === "grid"));
  assert.equal(gridSlot(p.state.room, 0) >= 1, true);
  assert.ok(p.until(() => p.view().screen === "countdown"));
  const gun = gunAt(p.state.room);
  assert.equal(gun, p.state.room.startAt);
  assert.equal(countFor(gun, p.clock.now()), 3);
  assert.ok(p.until(() => p.view().screen === "race"));
  /* paddle hard, alternating, three strokes a second, and drink halfway */
  let side = "L", drank = false;
  const raced = p.until(() => {
    p.net.send({ t:"stroke", side, p:0.9 });
    side = side === "L" ? "R" : "L";
    const me = p.state.me;
    if (!drank && me && me.prog > MOCK_LEG_M / 2) { p.net.send({ t:"drink" }); drank = true; }
    return p.view().screen !== "race";
  }, { step:330, max:120000 });
  assert.ok(raced, "the round ends");
  assert.ok(drank);
  assert.deepEqual(p.state.memory.drinkRounds, [0]);
  const v = p.view();
  assert.equal(v.screen, "cut", "a fast paddler who drank goes through");
  const room = p.state.room;
  assert.equal(room.field.length, 9);
  assert.equal(room.out.length, 4);
  assert.equal(room.cut, 9, "the cut still names the round just raced: nine went through");
  assert.ok(swapView(room, p.clock.now()).open);
  /* a floatie swap inside the window */
  p.net.send({ t:"look", look:{ ...room.entrants[0].look, floatie:"shark" } });
  p.clock.advance(300);
  assert.equal(p.state.room.entrants[0].look.floatie, "shark");
  /* then sit still: out at the next cut, onto the beach */
  assert.ok(p.until(() => p.view().screen === "outcut" || p.view().screen === "beach"), "out");
  const out = p.view();
  assert.equal(beachState({ room:out.state.room, idx:0, memory:out.state.memory, now:p.clock.now() }).needsDrink, true,
    "no drink in the race that put us out");
  p.net.send({ t:"drink" });
  p.clock.advance(300);
  assert.equal(beachState({ room:p.state.room, idx:0, memory:p.state.memory, now:p.clock.now() }).needsDrink, false);
  /* the next race: a balloon at the leader */
  assert.ok(p.until(() => p.view().screen === "beach" && p.state.room.phase === "race"));
  p.clock.advance(1500);
  const beach = beachState({ room:p.state.room, idx:0, memory:p.state.memory, now:p.clock.now() });
  assert.equal(beach.ready, true);
  const target = beach.targets.find(t => !t.arrived && !t.immune);
  p.net.send({ t:"balloon", at:target.i });
  p.clock.advance(MOCK_TIMING.FLIGHT_MS + 300);
  assert.ok(p.seen.some(m => m.t === "ev" && m.e === "balloon" && m.i === 0 && m.j === target.i));
  assert.ok(p.seen.some(m => m.t === "ev" && m.e === "splash" && m.i === 0));
  const after = beachState({ room:p.state.room, idx:0, memory:p.state.memory, now:p.clock.now() });
  assert.equal(after.ready, false, "one every twelve seconds");
  assert.ok(after.readyAt > p.clock.now());
  /* the rest of the Cup runs itself */
  assert.ok(p.until(() => p.view().screen === "podium", { step:500, max:900000 }), "the podium");
  assert.ok(finalPlace(p.state.room, 0) > 3);
  assert.equal(p.state.room.podium.length, 3);
  assert.ok(p.until(() => p.view().screen === "feedback", { step:500 }));
  p.net.send({ t:"feedback", answers:{ fun:5, again:true, better:"" } });
  assert.ok(p.until(() => p.view().screen === "lobby", { step:500 }), "back to the lobby");
  assert.deepEqual(p.state.memory, {}, "a new Cup, a clean memory");
  assert.equal(p.state.room.entrants[0].ready, false);
  p.net.close();
});

test("the mock holds every scene, and the phone lands on the screen each one is for", () => {
  const p = phone();
  p.clock.advance(300);
  const expect = { lobby:"lobby", "lobby-ready":"lobby", "lobby-fieldday":"lobby", intro:"intro", grid:"grid", countdown:"countdown",
    race:"race", "race-tired":"race", "race-drank":"race", "race-flipped":"race", "race-arrived":"race", "race-done":"race",
    "race-final":"race", cut:"cut", "cut-final":"cut", "cut-last":"cut", outcut:"outcut", "beach-drink":"beach", beach:"beach",
    "beach-between":"beach", podium:"podium", "podium-win":"podium", "podium-out":"podium", feedback:"feedback", watch:"watch" };
  assert.deepEqual(Object.keys(expect).sort(), [...MOCK_SCENES].sort());
  for (const [scene, screen] of Object.entries(expect)) {
    p.net.mock.go(scene);
    p.clock.advance(400);
    assert.equal(p.view().screen, screen, scene);
  }
  p.net.mock.go("race-arrived");
  p.clock.advance(400);
  const view = raceView(p.state.me, p.state.room.cut);
  assert.equal(view.arrived, true);
  assert.equal(view.drank, false);
  assert.equal(view.cut?.through, true, "in ninth with nine through");
  p.net.mock.go("cut-last");
  p.clock.advance(400);
  assert.equal(cupDone(p.state.room), true);
  assert.equal(swapEndsAt(p.state.room), null);
  assert.equal(finalPlace(p.state.room, 0), 2);
  p.net.mock.go("beach-drink");
  p.clock.advance(400);
  assert.equal(beachState({ room:p.state.room, idx:0, memory:p.state.memory, now:p.clock.now() }).needsDrink, true);
  p.net.close();
});
