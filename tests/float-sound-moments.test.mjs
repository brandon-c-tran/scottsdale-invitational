/* Float's moments (float/client/sound): on the screen, the race's events at
   their stamp plus the draw delay and panned across the river, the bumps'
   density rule, the bells, the clinks, the button and the outs spaced after
   it, the podium on its beats with the winner's pose, the lobby's joins;
   from the snapshots the paddles (each stroke while the field is small, a
   texture when it is big), The Drop and the band's tense; the river by the
   pack's zone. On the phone, only your own moments and never a loss. */
import test from "node:test";
import assert from "node:assert/strict";

globalThis.__FD_BUILD_ID__ = "build-test";
const screen = await import("../float/client/sound/screen.js");
const music = await import("../float/client/sound/music.js");
const river = await import("../float/client/sound/river.js");
const phone = await import("../float/client/sound/controller.js");
const { FLAG, INTERP_MS, courseInfo, panAcross, zoneAt, roarAt, gunTime, cupView } = await import("../float/client/sound/cup.js");
const T0 = 1_900_000_000_000;

const course = {
  id:"salt", line:Array.from({ length:270 }, (_, k) => [k * 4, 0, 24]),
  legs:[{ id:"putin", name:"Put-in", s0:0, s1:300, grid:10, finish:290 }, { id:"narrows", name:"The Narrows", s0:300, s1:520, grid:310, finish:510 },
    { id:"whirl", name:"Whirlpool Bend", s0:520, s1:760, grid:530, finish:750 }, { id:"drop", name:"The Drop", s0:760, s1:1030, grid:770, finish:1020 }],
  zones:[{ k:"pool", s0:0, s1:80 }, { k:"riffle", s0:80, s1:200 }, { k:"narrows", s0:300, s1:500 }, { k:"whirlpool", s0:560, s1:640 },
    { k:"drop", s0:880, s1:950 }, { k:"bar", s0:960, s1:1040 }],
  elev:[[0, 20], [900, 18], [940, 17.6], [944, 12], [1040, 12]],
};
const entrants = n => Array.from({ length:n }, (_, i) => ({ device:`d${i}`, look:{ pose:["flex", "chug", "airguitar", "backflip"][i % 4] }, drinks:true }));
const room = (phase, s, extra = {}) => ({ t:"room", s, phase, mode:"party", code:"BXRT", round:0, rounds:4, leg:0,
  field:[0, 1, 2, 3], out:[], entrants:entrants(4), ...extra });
/* a live screen at the race: the welcome, a lobby to catch up on, then the race */
function racing({ leg = 0, round = 0, rounds = 4, field = [0, 1, 2, 3], n = 4, gun = T0 } = {}) {
  let mem = screen.initialScreen();
  for (const msg of [{ t:"welcome", s:gun - 9000 }, { ...room("lobby", gun - 8000, { entrants:entrants(n) }), course },
    room("countdown", gun - 3000, { leg, round, rounds, field, entrants:entrants(n), endsAt:gun }),
    room("race", gun, { leg, round, rounds, field, entrants:entrants(n), startAt:gun })])
    mem = screen.screenStep(mem, msg, { now:msg.s + 30 }).mem;
  return mem;
}
const step = (mem, msg, ctx = {}) => screen.screenStep(mem, msg, { now:(msg.s ?? 0) + 40, ...ctx });
/* a snapshot: rows [i, x, y, a, f, p] */
const snap = (s, rows) => ({ t:"snap", s, k:rows });

test("the race's events: at their stamp plus the draw delay, from where the rider is across the river", () => {
  let mem = racing();
  const s = T0 + 5000;
  mem = step(mem, snap(s - 50, [[0, 40, 6, 0, 0, 30], [1, 40, -6, 0, 0, 30]])).mem;
  mem = step(mem, snap(s, [[0, 41, 6, 0, 0, 31], [1, 41, -6, 0, 0, 31]])).mem;
  const flip = step(mem, { t:"ev", s, e:"flip", i:0 });
  assert.equal(flip.cues.length, 1);
  assert.deepEqual([flip.cues[0].id, flip.cues[0].at], ["floatFlip", s + INTERP_MS]);
  assert.ok(flip.cues[0].pan < 0, "y +6 is the left bank looking downstream: the left speaker");
  assert.ok(step(mem, { t:"ev", s, e:"flip", i:1 }).cues[0].pan > 0);
  /* the event's own x, y win over the snapshot */
  assert.ok(step(mem, { t:"ev", s, e:"flip", i:0, x:41, y:-8 }).cues[0].pan > 0);
  /* the pan across: the centreline is 0, a bank the width */
  const info = courseInfo(course);
  assert.equal(panAcross(info, 100, 0, 100), 0);
  assert.equal(panAcross(info, 100, -12, 100), 0.6);
  assert.equal(panAcross(info, 100, 30, 100), -0.6, "never past the width");
  assert.equal(panAcross(null, 1, 2, 3), 0);
  /* a balloon's arc toward its target, the splash where it lands; scrape off a rock, a bump off a rider */
  const lob = step(mem, { t:"ev", s, e:"balloon", i:3, j:1 }).cues[0];
  assert.deepEqual([lob.id, lob.opts.ms, lob.pan > 0], ["floatLob", 1200, true]);
  assert.equal(step(mem, { t:"ev", s, e:"splash", i:3, j:1 }).cues[0].id, "floatSplat");
  assert.equal(step(mem, { t:"ev", s, e:"bump", i:0 }).cues[0].id, "floatScrape");
  assert.equal(step(mem, { t:"ev", s, e:"bump", i:0, j:1 }).cues[0].id, "floatBump");
  /* reduced motion: no arc, the splash without the spin, the flip its splash */
  assert.deepEqual(step(mem, { t:"ev", s, e:"balloon", i:3, j:1 }, { reduced:true }).cues, []);
  assert.equal(step(mem, { t:"ev", s, e:"splash", i:3, j:1 }, { reduced:true }).cues[0].opts.summary, true);
  assert.equal(step(mem, { t:"ev", s, e:"flip", i:0 }, { reduced:true }).cues[0].opts.summary, true);
  /* two flips inside 250 ms are one splash */
  const a = step(mem, { t:"ev", s, e:"flip", i:0 });
  assert.deepEqual(step(a.mem, { t:"ev", s:s + 100, e:"flip", i:1 }).cues, []);
  assert.equal(step(a.mem, { t:"ev", s:s + 300, e:"flip", i:1 }).cues.length, 1);
});

test("bumps through a density rule: one each 110 ms, a third inside 400 ms is a pile-up that swallows the rest of its window", () => {
  let memory = null;
  const kinds = [];
  for (const at of [0, 50, 200, 300, 350, 420, 900, 1300, 1330]) {
    const r = screen.bumpStep(memory, at);
    memory = r.memory; kinds.push(r.kind);
  }
  assert.deepEqual(kinds, ["bump", "skip", "pile", "skip", "skip", "skip", "bump", "bump", "skip"],
    "the third inside 400 ms is a pile-up; it swallows its window; then one each 110 ms");
  let mem = racing();
  const heard = [];
  for (const dt of [0, 30, 60, 90, 120]) { const r = step(mem, { t:"ev", s:T0 + 4000 + dt, e:"bump", i:0, j:1 }); mem = r.mem; heard.push(...r.cues); }
  assert.deepEqual(heard.map(cue => [cue.id, !!cue.opts?.big]), [["floatBump", false], ["floatBump", true]], "a pile-up of five is two sounds, the second big");
});

test("in at the bar: the first bell rung three times, the rest a step each; a clink per drink unless the room or the rider does not drink", () => {
  let mem = racing();
  const s = T0 + 60000;
  const bells = [];
  for (const i of [2, 0, 1]) { const r = step(mem, { t:"ev", s:s + i, e:"arrive", i }); mem = r.mem; bells.push(r.cues[0].opts); }
  assert.deepEqual(bells, [{ first:true }, { step:1 }, { step:2 }]);
  assert.equal(mem.firstIn.at, s + 2);
  const clink = step(mem, { t:"ev", s:s + 10, e:"drink", i:0 });
  assert.equal(clink.cues[0].id, "floatClink");
  assert.deepEqual(step(clink.mem, { t:"ev", s:s + 50, e:"drink", i:1 }).cues, [], "two clinks 40 ms apart are one");
  const dry = step(mem, { ...room("race", s, { startAt:T0, drinking:false }) }).mem;
  assert.deepEqual(step(dry, { t:"ev", s:s + 20, e:"drink", i:0 }).cues, [], "drinking off: the drink is automatic, no clink");
  const teetotal = step(mem, room("race", s, { startAt:T0, entrants:[{ device:"d0", drinks:false }, ...entrants(4).slice(1)] })).mem;
  assert.deepEqual(step(teetotal, { t:"ev", s:s + 20, e:"drink", i:0 }).cues, []);
  /* a new round's first bell rings three times again */
  const next = step(mem, room("race", s + 90000, { round:1, leg:1, startAt:s + 89000 })).mem;
  assert.deepEqual(step(next, { t:"ev", s:s + 90100, e:"arrive", i:3 }).cues[0].opts, { first:true });
  /* an arrival too old to sound still starts the cap's clock */
  const late = step(racing(), { t:"ev", s:T0 + 1000, e:"arrive", i:1 }, { now:T0 + 5000 });
  assert.deepEqual(late.cues, []);
  assert.equal(late.mem.firstIn.at, T0 + 1000);
});

test("the round ends on the button, then each rider out a step lower and spaced after it, whichever message lands first", () => {
  /* the cut first, then its outs */
  let mem = racing();
  const s = T0 + 70000;
  let r = step(mem, room("cut", s));
  assert.deepEqual(r.cues.map(cue => [cue.id, cue.at]), [["floatButton", s + 30]]);
  mem = r.mem;
  const outs = [];
  for (const i of [3, 1, 2]) { r = step(mem, { t:"ev", s:s + 20, e:"out", i }); mem = r.mem; outs.push(...r.cues); }
  assert.deepEqual(outs.map(cue => cue.id), ["floatOut", "floatOut", "floatOut"], "no second button");
  assert.deepEqual(outs.map(cue => [cue.at - s, cue.opts.step]), [[screen.OUT_AFTER_MS, 0], [screen.OUT_AFTER_MS + screen.OUT_GAP_MS, 1],
    [screen.OUT_AFTER_MS + 2 * screen.OUT_GAP_MS, 2]]);
  /* the outs first (the room's round already moved on), then the cut */
  mem = racing();
  r = step(mem, { t:"ev", s, e:"out", i:2 });
  assert.deepEqual(r.cues.map(cue => cue.id), ["floatButton", "floatOut"]);
  r = step(r.mem, room("cut", s + 80, { round:1 }));
  assert.deepEqual(r.cues, [], "the cut does not ring the button twice");
  /* a later cut is a new sequence, from the top */
  r = step(r.mem, { t:"ev", s:s + 90000, e:"out", i:1 });
  assert.deepEqual(r.cues.filter(cue => cue.id === "floatOut").map(cue => cue.opts.step), [0]);
  /* reduced motion: one out a cut */
  mem = racing();
  r = step(mem, { t:"ev", s, e:"out", i:2 }, { reduced:true });
  r = step(r.mem, { t:"ev", s:s + 10, e:"out", i:3 }, { reduced:true });
  assert.deepEqual(r.cues, []);
});

test("the podium: the fanfare (never ducked), each place on its beat, the winner's own pose; the final's race stops on the button first", () => {
  const mem = racing({ leg:3, round:3, rounds:4, field:[0, 1, 2], n:4 });
  const s = T0 + 80000;
  const r = step(mem, room("podium", s, { round:3, rounds:4, leg:3, podium:[2, 0, 1] }));
  assert.deepEqual(r.cues.map(cue => cue.id), ["floatButton", "floatPodium", "floatStamp", "floatStamp", "floatStamp", "floatWinner"]);
  const fanfare = r.cues.find(cue => cue.id === "floatPodium").at;
  assert.deepEqual(r.cues.filter(cue => cue.id === "floatStamp").map(cue => [cue.opts.place, cue.at - fanfare]),
    [[3, screen.PODIUM_BEATS.third], [2, screen.PODIUM_BEATS.second], [1, screen.PODIUM_BEATS.first]]);
  const winner = r.cues.find(cue => cue.id === "floatWinner");
  assert.deepEqual([winner.opts.pose, winner.at - fanfare], ["airguitar", screen.PODIUM_BEATS.pose], "entrant 2's pose");
  assert.ok(r.cues.filter(cue => cue.id !== "floatButton").every(cue => cue.open), "past a win song's duck");
  assert.ok(screen.PODIUM_BEATS.third < screen.PODIUM_BEATS.second && screen.PODIUM_BEATS.second < screen.PODIUM_BEATS.first);
  /* two on the podium: no 3rd */
  const two = step(mem, room("podium", s, { round:3, podium:[1, 0] }));
  assert.deepEqual(two.cues.filter(cue => cue.id === "floatStamp").map(cue => cue.opts.place), [2, 1]);
  /* reduced motion: the chord */
  assert.deepEqual(step(mem, room("podium", s, { round:3, podium:[2, 0, 1] }), { reduced:true }).cues.filter(cue => cue.id !== "floatButton")
    .map(cue => [cue.id, cue.opts.summary]), [["floatPodium", true]]);
});

test("the titles and the intro: each leg its own, the final its own, a catch-up none", () => {
  let mem = screen.initialScreen();
  mem = step(mem, { t:"welcome", s:T0 }).mem;
  mem = step(mem, room("lobby", T0)).mem;
  const intro = step(mem, room("intro", T0 + 1000));
  assert.deepEqual(intro.cues.map(cue => cue.id), ["floatIntro"]);
  const titles = [0, 1, 2, 3].map(leg => step(intro.mem, room("grid", T0 + 5000, { leg, round:leg, final:false, rounds:4 })).cues[0]);
  assert.deepEqual(titles.map(cue => [cue.id, cue.opts.leg, cue.opts.final]),
    [["floatTitle", 0, false], ["floatTitle", 1, false], ["floatTitle", 2, false], ["floatTitle", 3, true]], "the last round is the final");
  assert.equal(cupView(room("grid", 1, { round:1, rounds:2 })).final, true);
  assert.equal(cupView(room("grid", 1, { round:0, rounds:0 })).final, false);
  /* the vamp waits for the title's sting, and longer for the Cup's intro */
  assert.equal(music.musicTrack(step(intro.mem, room("grid", T0 + 5000)).mem).anchor, T0 + 5000 + music.TITLE_HOLD_MS);
  assert.equal(music.musicTrack(intro.mem).anchor, T0 + 1000 + music.INTRO_HOLD_MS);
  /* the stale protocol name for the cut is read as the cut */
  assert.equal(cupView({ phase:"results" }).phase, "cut");
  assert.equal(cupView({ phase:"made-up" }).phase, "other");
});

test("the lobby: a pump as a rider joins, a bell as one is ready, from fresh changes only", () => {
  let mem = screen.initialScreen();
  mem = step(mem, { t:"welcome", s:T0 }).mem;
  let r = step(mem, room("lobby", T0, { entrants:entrants(2) }));
  assert.deepEqual(r.cues, [], "the riders already there when the screen loads are not news");
  r = step(r.mem, room("lobby", T0 + 3000, { entrants:entrants(4) }));
  assert.deepEqual(r.cues.map(cue => cue.id), ["floatJoin", "floatJoin"]);
  assert.ok(r.cues[1].at - r.cues[0].at >= 100, "two at once, one after the other");
  const ready = entrants(4).map((e, i) => ({ ...e, ready:i === 1 }));
  r = step(r.mem, room("lobby", T0 + 4000, { entrants:ready }));
  assert.deepEqual(r.cues.map(cue => cue.id), ["floatReady"]);
  r = step(r.mem, room("lobby", T0 + 5000, { entrants:ready }));
  assert.deepEqual(r.cues, [], "still ready is not news");
});

test("the paddles: each stroke heard while the field is small; a big field is a dip a beat over the river's churn; never a swimmer's", () => {
  const L = FLAG.STROKE_L, R = FLAG.STROKE_R;
  let mem = racing({ field:[0, 1, 2] });
  let s = T0 + 2000;
  mem = step(mem, snap(s, [[0, 40, 3, 0, 0, 20], [1, 40, -3, 0, 0, 20], [2, 40, 0, 0, 0, 20]])).mem;
  s += 50;
  let r = step(mem, snap(s, [[0, 40, 3, 0, L, 20.2], [1, 40, -3, 0, R, 20.2], [2, 40, 0, 0, FLAG.SWIM | L, 20.1]]));
  const dips = r.cues.filter(cue => cue.id === "floatPaddles");
  assert.equal(dips.length, 1);
  assert.deepEqual([dips[0].at, dips[0].opts.n, dips[0].opts.grains], [s + INTERP_MS, 2, 2], "two strokes, two dips; the swimmer none");
  assert.ok(dips[0].opts.pans[0] < 0 && dips[0].opts.pans[1] > 0);
  mem = r.mem;
  /* held bits are not new strokes */
  r = step(mem, snap(s + 50, [[0, 40, 3, 0, L, 20.4], [1, 40, -3, 0, R, 20.4], [2, 40, 0, 0, 0, 20.2]]));
  assert.deepEqual(r.cues.filter(cue => cue.id === "floatPaddles"), []);
  /* thirteen riders flailing: the rate climbs past solo, then a dip each 110 ms at most */
  let big = racing({ field:[...Array(13).keys()], n:13 });
  const heard = [];
  for (let k = 0; k < 60; k++) {
    const rows = Array.from({ length:13 }, (_, i) => [i, 40, i - 6, 0, (k + i) % 2 ? L : R, 20 + k * 0.1]);
    const out = step(big, snap(T0 + 3000 + k * 50, rows));
    big = out.mem; heard.push(...out.cues.filter(cue => cue.id === "floatPaddles"));
  }
  assert.ok(big.paddle.rate > screen.PADDLE_SOLO_RATE * 10, `the field's rate ${big.paddle.rate}`);
  const late = heard.filter(cue => cue.at > T0 + 4000);
  assert.ok(late.every(cue => cue.opts.grains === 1), "one dip standing for many strokes");
  assert.ok(late.every((cue, i) => i === 0 || cue.at - late[i - 1].at >= screen.PADDLE_GAP_MS), "a dip each 110 ms at most");
  assert.ok(late.length < 60 * 13 / 10, "far fewer dips than strokes");
  assert.ok(river.riverMix(big).churn > 0.9, "the river carries the rest as churn");
  assert.equal(river.riverMix({ ...big, view:{ ...big.view, phase:"cut" } }).churn, 0);
  /* a gap in the snapshots only records */
  const gap = step(big, snap(T0 + 3000 + 60 * 50 + 900, Array.from({ length:13 }, (_, i) => [i, 40, 0, 0, L | R, 30])));
  assert.deepEqual(gap.cues, []);
  /* reduced motion: no paddles */
  assert.deepEqual(step(mem, snap(s + 100, [[0, 40, 3, 0, R, 20.6], [1, 40, -3, 0, L, 20.6], [2, 40, 0, 0, 0, 20.3]]), { reduced:true }).cues, []);
});

test("The Drop: the rush over the lip, the landing at the foot (the first in full, the rest smaller); the band holds on the lip and hits the landing", () => {
  const info = courseInfo(course);
  assert.deepEqual(info.falls, [{ top:940, bottom:944 }], "the falls read from the water's steep drop");
  assert.deepEqual(courseInfo({ ...course, elev:[] }).falls, [{ top:936, bottom:950 }], "else the end of the drop zone");
  const gun = T0;
  let mem = racing({ leg:3, round:3, rounds:4, field:[0, 1, 2], gun });
  /* the leader 6 m short of the lip at 3 m/s: the bar that starts now reaches it */
  let s = gun + 60000;
  const base = 770;
  const at = p => [[0, 0, 0, 0, 0, p], [1, 0, 0, 0, 0, p - 10], [2, 0, 0, 0, 0, p - 20]];
  mem = step(mem, snap(s - 50, at(940 - 6.15 - base))).mem;
  mem = step(mem, snap(s, at(940 - 6 - base))).mem;
  mem = { ...mem, pack:{ ...mem.pack, speed:3 } };
  assert.equal(music.dropState(mem, s + 650), "suspend");
  assert.equal(music.dropState(mem, s + 6000), null, "a bar that starts past the lip does not suspend");
  /* over and down */
  let r = step(mem, snap(s + 50, at(940.5 - base)));
  assert.deepEqual(r.cues.map(cue => cue.id), ["floatFall"]);
  assert.ok(r.cues[0].opts.ms >= 300);
  r = step(r.mem, snap(s + 100, at(945 - base)));
  assert.deepEqual(r.cues.map(cue => [cue.id, !!cue.opts.small]), [["floatImpact", false]]);
  assert.equal(r.mem.landed.at, s + 100);
  assert.equal(music.dropState(r.mem, s + 1000), "land", "the next bar hits");
  assert.equal(music.dropState(r.mem, s + 3000), null);
  /* the riders behind: one 10 m back lands inside the spacing (one splash for both), one 25 m back on its own, smaller */
  mem = r.mem;
  const later = [];
  const behind = p => [[0, 0, 0, 0, 0, p], [1, 0, 0, 0, 0, p - 10], [2, 0, 0, 0, 0, p - 25]];
  for (let k = 1; k <= 24; k++) { r = step(mem, snap(s + 100 + k * 50, behind(945 - base + k * 1.5))); mem = r.mem; later.push(...r.cues); }
  assert.deepEqual(later.filter(cue => cue.id === "floatImpact").map(cue => [cue.opts.small, cue.at - (s + INTERP_MS)]), [[true, 900]],
    "the second (300 ms after the first) folds into it; the third, 800 ms on, lands small");
  assert.equal(later.filter(cue => cue.id === "floatFall").length, 1, "the rushes spaced too");
  /* reduced motion: no rush over the lip */
  const fresh = racing({ leg:3, round:3, rounds:4, field:[0, 1, 2], gun });
  const lip = step(step(fresh, snap(s - 50, at(938 - base))).mem, snap(s, at(941 - base)), { reduced:true });
  assert.deepEqual(lip.cues.map(cue => cue.id), []);
});

test("the band's tense: the leader's last 18% raises it and it never falls back; the first in eases it to 3; the cap builds it to 5", () => {
  let mem = racing({ leg:0, gun:T0 });
  const len = 280;
  const lead = (s, p) => { mem = step(mem, snap(s, [[0, 0, 0, 0, 0, p], [1, 0, 0, 0, 0, p - 20]])).mem; };
  lead(T0 + 40000, 0.5 * len); lead(T0 + 40050, 0.5 * len + 0.2);
  assert.equal(music.raceTense(mem, T0 + 41000), 0);
  const levels = [];
  for (const f of [0.83, 0.87, 0.91, 0.94, 0.975]) { lead(T0 + 50000 + f * 1000, f * len); levels.push(music.raceTense(mem, T0 + 52000)); }
  assert.deepEqual(levels, [1, 2, 3, 4, 5]);
  lead(T0 + 52000, 0.6 * len);
  assert.equal(music.raceTense(mem, T0 + 53000), 5, "a leader who flips back up the river does not take the tension away");
  /* the first is in: the cap's thirty seconds */
  mem = step(mem, { t:"ev", s:T0 + 60000, e:"arrive", i:0 }).mem;
  assert.deepEqual([60500, 75000, 80000, 85000, 89500].map(dt => music.raceTense(mem, T0 + dt)), [3, 3, 4, 5, 5]);
  /* and the next bar after the first in hits the crash */
  const track = music.musicTrack(mem);
  const after = music.barsBetween(track, T0 + 58000, T0 + 66000, mem);
  assert.deepEqual(after.map(bar => [bar.at - T0, bar.opts.crash]), [[58000, false], [60000, false], [62000, true], [64000, true]],
    "the bar after the first in hits the crash (64000 is a phrase's first bar)");
  /* the room's own cap end wins */
  const capped = { ...mem, view:{ ...mem.view, endsAt:T0 + 70000 } };
  assert.equal(music.raceTense(capped, T0 + 65000), 5);
});

test("the river follows the pack: the zone under the leaders, the roar from 140 m out, the takeout's calm at the cut, the crickets in the lobby", () => {
  const info = courseInfo(course);
  assert.deepEqual([10, 100, 350, 600, 900, 1000, 250].map(s => zoneAt(info, s)), ["pool", "riffle", "narrows", "whirlpool", "drop", "bar", "pool"]);
  assert.equal(roarAt(info, 940 - 140), 0); assert.equal(roarAt(info, 940 - 70), 0.5); assert.equal(roarAt(info, 942), 1);
  assert.equal(roarAt(info, 944 + 30), 0.5); assert.equal(roarAt(info, 944 + 90), 0);
  let mem = racing({ leg:0 });
  const pack = (s, p) => { mem = step(mem, snap(s, [[0, 0, 0, 0, 0, p], [1, 0, 0, 0, 0, p], [2, 0, 0, 0, 0, p]])).mem; };
  pack(T0 + 1000, 20); assert.equal(river.riverMix(mem).zone, "pool");
  pack(T0 + 1050, 120); assert.equal(river.riverMix(mem).zone, "riffle");
  assert.ok(river.riverMix(mem).flow > river.RIVER_MIX.pool.flow && river.riverMix(mem).babble > river.RIVER_MIX.pool.babble);
  let drop = racing({ leg:3, round:3, field:[0, 1, 2] });
  drop = step(drop, snap(T0 + 1000, [[0, 0, 0, 0, 0, 870 - 770], [1, 0, 0, 0, 0, 865 - 770], [2, 0, 0, 0, 0, 860 - 770]])).mem;
  const near = river.riverMix(drop);
  assert.ok(near.roar > 0.3 && near.hiss >= near.roar * 0.8 - 1e-9, `the roar ${near.roar}`);
  assert.equal(river.riverMix(step(drop, room("cut", T0 + 2000)).mem).zone, "bar");
  const lobby = river.riverMix(screen.screenStep(screen.initialScreen(), room("lobby", T0), { now:T0 }).mem);
  assert.deepEqual([lobby.zone, lobby.crickets], ["pool", 1]);
  assert.equal(river.riverMix(drop).crickets, 0, "no crickets over a race");
  /* without the course, the leg's own water */
  const blind = step(racing({ leg:1, round:1 }), room("race", T0 + 10, { leg:1, round:1, startAt:T0 })).mem;
  assert.equal(river.riverMix({ ...blind, course:null }).zone, "narrows");
  /* each stretch moves from the last one's mix to the river's now */
  const cue = river.riverCue(7, mem, { flow:0.1 });
  assert.deepEqual([cue.id, cue.at, cue.opts.from.flow, cue.opts.ms], ["floatRiver", 7 * river.RIVER_STEP_MS, 0.1, river.RIVER_SEG_MS]);
  assert.equal(cue.opts.to.zone, undefined, "the recipe gets layers, not the zone's name");
});

/* ── the phone ── */
const me = 1;
function phoneAt(phase = "race", extra = {}) {
  let mem = phone.initialController({ me });
  for (const msg of [{ t:"welcome", s:T0 - 9000, you:{ entrant:me } }, room("lobby", T0 - 8000), room(phase, T0 - 1000, { startAt:T0 - 1000, ...extra })])
    mem = phone.controllerStep(mem, msg, { now:msg.s + 30, wall:0, taps:{ stroke:-Infinity, drink:-Infinity, throw:-Infinity } }).mem;
  return mem;
}
const pstep = (mem, msg, ctx = {}) => phone.controllerStep(mem, msg, { now:(msg.s ?? 0) + 40, wall:1e9, taps:{ stroke:-Infinity, drink:-Infinity, throw:-Infinity }, ...ctx });

test("the phone hears only its own: your flip, you in, your drink, your balloon and where it landed, and a balloon on you", () => {
  const mem = phoneAt();
  const s = T0 + 5000;
  const own = e => pstep(mem, { t:"ev", s, i:me, ...e }).cues.map(cue => cue.id);
  assert.deepEqual(own({ e:"flip" }), ["floatYouFlip"]);
  assert.deepEqual(own({ e:"arrive" }), ["floatYouArrive"]);
  assert.deepEqual(own({ e:"drink" }), ["floatYouDrink"]);
  assert.deepEqual(own({ e:"balloon", j:3 }), ["floatYouThrow"]);
  assert.deepEqual(own({ e:"splash", j:3 }), ["floatYouSplat"], "your balloon landed on someone");
  assert.deepEqual(pstep(mem, { t:"ev", s, e:"splash", i:3, j:me }).cues.map(cue => cue.id), ["floatYouHit"]);
  for (const e of ["flip", "arrive", "drink", "balloon", "bump", "out"]) assert.deepEqual(pstep(mem, { t:"ev", s, e, i:2, j:0 }).cues, [], `someone else's ${e}`);
  assert.deepEqual(own({ e:"out" }), [], "out: never a loss sound");
  assert.deepEqual(own({ e:"bump" }), [], "a bump is the TV's");
  /* once a round */
  const inAt = pstep(mem, { t:"ev", s, e:"arrive", i:me });
  assert.deepEqual(pstep(inAt.mem, { t:"ev", s:s + 50, e:"arrive", i:me }).cues, []);
  /* a tap just made stands for the server's echo */
  const tapped = { stroke:-Infinity, drink:1e9 - 500, throw:1e9 - 500 };
  assert.deepEqual(pstep(mem, { t:"ev", s, e:"drink", i:me }, { taps:tapped }).cues, []);
  assert.deepEqual(pstep(mem, { t:"ev", s, e:"balloon", i:me, j:2 }, { taps:tapped }).cues, []);
  /* stale, hidden, or a catch-up: nothing */
  assert.deepEqual(pstep(mem, { t:"ev", s, e:"flip", i:me }, { now:s + phone.PHONE_EV_FRESH_MS + 1 }).cues, []);
  assert.deepEqual(pstep(mem, { t:"ev", s, e:"flip", i:me }, { visible:false }).cues, []);
  const fresh = phone.controllerStep(phone.initialController({ me }), { t:"ev", s, e:"flip", i:me }, { now:s + 10 });
  assert.deepEqual(fresh.cues, [], "nothing before the first room on the connection");
});

test("the phone at the cut: through when the cut leaves you in, silence when it does not; your place on the podium; no countdown", () => {
  let mem = phoneAt("race", { field:[0, 1, 2, 3] });
  const through = pstep(mem, room("cut", T0 + 70000, { out:[3, 2] }));
  assert.deepEqual(through.cues.map(cue => cue.id), ["floatYouThrough"]);
  assert.deepEqual(pstep(mem, room("cut", T0 + 70000, { out:[me, 3] })).cues, [], "out: silent");
  /* a rider who never raced the round (the beach) is not "through" */
  const beach = phoneAt("race", { field:[0, 2, 3] });
  assert.deepEqual(pstep(beach, room("cut", T0 + 70000, { out:[3] })).cues, []);
  /* the podium */
  mem = phoneAt("race", { field:[0, 1, 2], round:3 });
  assert.deepEqual(pstep(mem, room("podium", T0 + 80000, { round:3, podium:[2, 1, 0] })).cues, [{ id:"floatYouPodium", opts:{ place:2 } }]);
  assert.deepEqual(pstep(mem, room("podium", T0 + 80000, { round:3, podium:[0, 2, 3] })).cues, [], "off the podium: silent");
  /* no countdown or gun on a phone */
  const lobby = phoneAt("lobby");
  assert.deepEqual(pstep(lobby, room("countdown", T0 + 1000, { endsAt:T0 + 4000 })).cues, []);
  assert.deepEqual(pstep(lobby, room("grid", T0 + 1000)).cues, []);
});

test("the phone's own paddle: the taps sound with the thumb (four dips, never one twice running); without them the stroke bits stand in", () => {
  const mem = phoneAt();
  const L = FLAG.STROKE_L, R = FLAG.STROKE_R;
  let m = pstep(mem, { t:"me", s:T0 + 1000, i:me, f:0 }).mem;
  const r = pstep(m, { t:"me", s:T0 + 1100, i:me, f:L });
  assert.deepEqual(r.cues.map(cue => [cue.id, cue.opts.side]), [["floatDip", "L"]]);
  m = r.mem;
  assert.deepEqual(pstep(m, { t:"me", s:T0 + 1200, i:me, f:L }).cues, [], "a held bit is the same stroke");
  const both = pstep(m, { t:"me", s:T0 + 1200, i:me, f:R });
  assert.deepEqual(both.cues.map(cue => cue.opts.side), ["R"]);
  assert.notEqual(both.cues[0].opts.v, r.cues[0].opts.v, "never the same dip twice running");
  /* the controller reporting its taps: the echo stays quiet */
  assert.deepEqual(pstep(m, { t:"me", s:T0 + 1200, i:me, f:R }, { taps:{ stroke:1e9 - 100, drink:-Infinity, throw:-Infinity } }).cues, []);
  /* the first me after a connect only records */
  const first = phone.controllerStep(phoneAt(), { t:"me", s:T0 + 1000, i:me, f:L }, { now:T0 + 1040, wall:1e9 });
  assert.deepEqual(first.cues, []);
  /* SWIM rising is your flip (once, with the event's), ARRIVED rising you in */
  const swim = pstep(m, { t:"me", s:T0 + 1200, i:me, f:FLAG.SWIM });
  assert.deepEqual(swim.cues.map(cue => cue.id), ["floatYouFlip"]);
  assert.deepEqual(pstep(swim.mem, { t:"ev", s:T0 + 1250, e:"flip", i:me }).cues, [], "the event of the same flip stays quiet");
  assert.deepEqual(pstep(m, { t:"me", s:T0 + 1200, i:me, f:FLAG.ARRIVED }).cues.map(cue => cue.id), ["floatYouArrive"]);
  /* the me message names you when the controller does not */
  const anon = phone.controllerStep(phone.initialController(), { t:"me", s:T0, i:4, f:0 }, { now:T0 + 10 });
  assert.equal(anon.mem.me, 4);
  assert.equal(phone.controllerStep(anon.mem, { t:"me", s:T0, i:4, f:0 }, { now:T0 + 10, me:2 }).mem.me, 2, "the controller's own word wins");
});

test("the phone's taps through the real engine: on the you bus, one dip each 45 ms at most, never the TV's", async () => {
  const sound = await import("../src/lib/sound.js");
  const made = [];
  class Ctx {
    constructor() { this.state = "suspended"; this.currentTime = 10; this.sampleRate = 8000; this.outputLatency = 0; this.destination = {}; this.n = 0; made.push(this); }
    node() { const p = () => ({ value:1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime() {} });
      const ctx = this; ctx.n++;
      return { gain:p(), frequency:p(), Q:p(), pan:p(), threshold:p(), knee:p(), ratio:p(), attack:p(), release:p(), connect(x) { return x; }, disconnect() {}, start() {}, stop() {} }; }
    createGain() { return this.node(); } createBiquadFilter() { return this.node(); } createDynamicsCompressor() { return this.node(); } createConvolver() { return this.node(); }
    createStereoPanner() { return this.node(); } createOscillator() { return this.node(); } createBufferSource() { return this.node(); }
    createBuffer(c, l) { return { length:l, numberOfChannels:c, getChannelData:() => new Float32Array(l) }; }
    resume() { this.state = "running"; this.onstatechange?.(); return Promise.resolve(); } close() { this.state = "closed"; }
  }
  sound.__resetSoundEngine({ factory:Ctx });
  sound.setSoundSurface("phone");
  const log = globalThis.__FD_SOUND_LOG__ = [];
  /* the clock held still: the first stroke also wakes the engine, and on a busy
     machine that alone could carry the second past the 45 ms */
  const realNow = Date.now;
  Date.now = () => 1_000_000;
  try {
    assert.ok(phone.floatStrokeSound("L", 0.9), "the first stroke unlocks and dips");
    assert.equal(made.length, 1);
    assert.equal(phone.floatStrokeSound("R", 0.9), null, "a second inside 45 ms is the same splash");
    assert.ok(phone.floatDrinkSound()); assert.ok(phone.floatThrowSound());
    assert.deepEqual(log.map(entry => [entry.id, entry.bus]), [["floatDip", "you"], ["floatYouDrink", "you"], ["floatYouThrow", "you"]]);
    assert.ok(phone.lastTaps().stroke > 0 && phone.lastTaps().drink > 0);
    sound.setSoundSurface("tv");
    assert.equal(phone.floatDrinkSound(), null, "never on the TV");
  } finally { Date.now = realNow; delete globalThis.__FD_SOUND_LOG__; sound.__resetSoundEngine(); }
});

test("the gun read from a countdown: the first instant well ahead of its message; a round keeps it", () => {
  assert.equal(gunTime({ phase:"countdown", round:0, s:1000, startAt:1000, endsAt:4000 }), 4000);
  assert.equal(gunTime({ phase:"countdown", round:0, s:1000, startAt:4000, endsAt:60000 }), 4000);
  assert.equal(gunTime({ phase:"countdown", round:0, s:1000, startAt:900, endsAt:null }), 3900);
  assert.equal(gunTime({ phase:"countdown", round:0, s:1000 }), 4000);
  assert.equal(gunTime({ phase:"countdown", round:1, s:1000, endsAt:3000 }, { round:0, at:999 }), 3000, "another round's gun is not this one's");
  assert.equal(gunTime({ phase:"grid", round:0, s:1000 }), null);
});
