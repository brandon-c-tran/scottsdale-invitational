import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

/* Backglass moments and sound (Oct 2): the kit's new parts (phone bodies
   implied by harmonics, the chord, the ladder, chips with weight), the
   walkout and "You're up" models, the room sorting itself at the draw, the
   chip rain's plan, the produced crown's tower order, the finale's bust
   card, and the takeover grammar's canvas mark. Pure models plus the real
   components' markup. */
globalThis.__FD_BUILD_ID__ = "build-test";
const root = fileURLToPath(new URL("../", import.meta.url));
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const { CHIP_COLORS, CHIP_SKINS, EMPTY_STATE, ROSTER, allEventsOf, computeStandings, resolveCurrentContest } =
  await import("../shared/core.js");
const { applyAction } = await import("./support/confirmed-start.mjs");
const kit = await import("../src/lib/soundKit.js");
const { CROWN_TIMING, crownOutAt } = await import("../src/features/tv/tvMotion.js");
const phone = await import("../src/features/home/phoneSound.js");

const compiled = await build({
  stdin:{ contents:`
    export * from "./src/features/moments/walkout.js";
    export * from "./src/features/moments/youreUp.js";
    export { TeamSort, teamOf, TEAM_SORT_MS } from "./src/features/moments/TeamSort.jsx";
    export { YoureUpTakeover, UpBanner, PhoneWalkout } from "./src/features/moments/PhoneMoments.jsx";
    export { SkyStrip, skyModel } from "./src/features/moments/SkyStrip.jsx";
    export { rainPlan, RAIN, ChipShower } from "./src/features/results/ChipShower.jsx";
    export { takeoverList } from "./src/features/tv/TVTakeover.jsx";
    export { bustView } from "./src/features/tv/TVPokerMoments.jsx";
    export { podiumHoldUntil } from "./src/features/tv/TVWalkout.jsx";
    export { drawRevealGroups, buildEventReveal } from "./src/features/weekend/drawReveal.js";
    export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";`,
  resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react", "react-dom", "qrcode-generator", "three"], loader:{ ".css":"empty" },
  write:false, logLevel:"silent",
});
const mod = new Module(fileURLToPath(new URL("backglass-moments.cjs", import.meta.url)));
mod.filename = mod.id;
mod.paths = Module._nodeModulePaths(root);
mod._compile(compiled.outputFiles[0].text, mod.filename);
const ui = mod.exports;

let seq = 0;
const gm = () => ({ isGm:true, player:"Brandon", deviceId:"bg-gm", actionId:`bg-${++seq}` });
const act = (state, type, payload = {}) => {
  const result = applyAction(state, type, payload, gm());
  assert.equal(result.ok, true, `${type}: ${result.error}`);
  return result;
};
const profiles = () => Object.fromEntries(ROSTER.map((player, index) => [player, { display:player, num:index + 1,
  color:CHIP_COLORS[index % CHIP_COLORS.length].hex, skin:CHIP_SKINS[index % CHIP_SKINS.length] }]));
const render = (state, node) => renderToStaticMarkup(React.createElement(ui.PlayerIdentityProvider, { profiles:state.profiles }, node));

/* ── the kit ── */
test("the kit: the new parts are playable, all in D, every node released", () => {
  for (const id of ["sting", "whoosh", "vsHit", "typeTick", "podium", "stinger", "stamp", "youUp", "teamUp", "rain", "sweep",
    "loss", "payout", "chipLand", "rankUp", "nightFall", "towersUp", "towerOut", "holdRoll", "cascade", "chord", "bustCard"])
    assert.equal(kit.isSound(id), true, id);
  assert.deepEqual(kit.SOUND_IDS.length, 26, "S1 to S26 keep their ids");
});

test("a phone implies the low bodies its speaker cannot play; the TV never does", () => {
  const drum = kit.phantomPartials(68, "phone");
  assert.ok(drum.length >= 3, "a drum is carried by its harmonics");
  assert.ok(drum.every(part => part.f >= kit.PHANTOM.floor && part.f <= kit.PHANTOM.ceil));
  assert.ok(drum.every(part => Math.abs(part.f / 68 - Math.round(part.f / 68)) < 1e-9), "true harmonics of the body");
  assert.deepEqual(kit.phantomPartials(68, "tv"), [], "the TV hears the real body");
  assert.deepEqual(kit.phantomPartials(587, "phone"), [], "a note above the cut needs nothing");
  assert.equal(kit.highpassFor("phone"), 380);
});

test("the thirteen-phone chord: one note per final position, rooted on D, the champion on top", () => {
  const notes = Array.from({ length:13 }, (_, i) => kit.chordNote(i + 1, 13));
  assert.equal(notes[0], kit.NOTE.A6, "the champion takes the top");
  assert.equal(notes[12], kit.NOTE.D3, "last place holds the root");
  assert.ok(notes.every((f, i) => i === 0 || f < notes[i - 1]), "every phone a different note, high to low");
  const D = [kit.NOTE.D3, kit.NOTE.D4, kit.NOTE.D5, kit.NOTE.D6];
  assert.ok(notes.every(f => kit.CROWN_CHORD.includes(f)));
  assert.ok(D.every(f => notes.includes(f)));
  const short = Array.from({ length:9 }, (_, i) => kit.chordNote(i + 1, 9));
  assert.equal(short[0], kit.NOTE.A6);
  assert.equal(short[8], kit.NOTE.D3, "a short field keeps its root and top");
});

test("the chip rain climbs the D major ladder; a chip's weight and height set its voice", () => {
  assert.deepEqual(kit.LADDER.slice(0, 5), [kit.NOTE.D4, kit.NOTE.E4, kit.NOTE.Fs4, kit.NOTE.A4, kit.NOTE.B4]);
  assert.ok(kit.LADDER.every((f, i) => i === 0 || f > kit.LADDER[i - 1]));
  assert.equal(kit.ladderNote(99), kit.LADDER.at(-1), "past the top it holds the top");
  assert.ok(kit.chipPitch(5) > kit.chipPitch(0) && kit.chipPitch(50) === kit.chipPitch(10), "climbs, capped");
  /* each denomination is its own recipe: count the sources it starts */
  const count = opts => {
    let started = 0;
    const param = { value:0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} };
    const node = () => ({ gain:{ ...param }, frequency:{ ...param }, Q:{ ...param }, pan:{ ...param }, threshold:{ ...param },
      knee:{ ...param }, ratio:{ ...param }, attack:{ ...param }, release:{ ...param },
      connect() {}, disconnect() {}, start() { started++; }, stop() {} });
    const ctx = { sampleRate:8000, currentTime:0, destination:{}, createGain:node, createBiquadFilter:node,
      createDynamicsCompressor:node, createConvolver:node, createStereoPanner:node, createOscillator:node, createBufferSource:node,
      createBuffer:(c, n) => ({ getChannelData:() => new Float32Array(n) }) };
    const E = kit.makeEngine(ctx, { listen:"phone" });
    kit.playRecipe(E, "S5", 0, opts);
    return started;
  };
  const one = count({ denom:100 }), five = count({ denom:500 }), thousand = count({ denom:1000 });
  assert.ok(five > one && thousand > five, "a 500 lands heavier than a 100, a 1,000 heavier still");
});

/* ── the chip rain ── */
test("chip rain: one chip per 100 won, landing in order, then the sweep home", () => {
  const plan = ui.rainPlan(800);
  assert.equal(plan.n, 8);
  assert.ok(plan.lands.every((at, i) => i === 0 || at > plan.lands[i - 1]), "each landing after the last (the ladder climbs)");
  assert.ok(plan.sweepAt > plan.lands.at(-1) && plan.total > plan.sweepAt);
  assert.equal(ui.rainPlan(100).n, ui.RAIN.min, "a small win still rains a few");
  assert.equal(ui.rainPlan(10_000).n, ui.RAIN.max, "a big one is capped");
  const receipt = read("src/features/results/ChipReceipt.jsx");
  assert.match(receipt, /rain \? rain\.lands\[0\]/, "the receipt's total ticks with the landings");
  assert.match(receipt, /playSound\("loss"/, "a loss has its own sound");
});

/* ── the walkout ── */
test("the walkout: an automatic win song on a live board, joined only near its start", () => {
  const walkout = { player:"Evan", trackId:null, startedAt:1_000_000, until:1_030_000, auto:true };
  const state = { profiles:profiles(), showControl:{ audio:{ walkout } } };
  assert.equal(ui.walkoutKey(state), "Evan:1000000");
  assert.equal(ui.walkoutKey({ ...state, frozen:true }), null, "the crown plays its own sequence");
  assert.equal(ui.walkoutKey({ ...state, showControl:{ audio:{ walkout:{ ...walkout, auto:undefined } } } }), null,
    "a song the commissioner played by hand is not a walkout");
  assert.equal(ui.walkoutPlays({ from:null, to:"k", startedAt:1000, now:1000 + ui.WALKOUT_JOIN_MS }), true);
  assert.equal(ui.walkoutPlays({ from:null, to:"k", startedAt:1000, now:1001 + ui.WALKOUT_JOIN_MS }), false, "too far in: the strip");
  assert.equal(ui.walkoutPlays({ from:"k", to:"k", startedAt:1000, now:1000 }), false);
  const T = ui.WALKOUT_TIMING;
  assert.ok(T.flood < T.stamp && T.stamp < T.dock && T.dock < T.total && T.total >= 8000 && T.total <= 10_000, "8 to 10 seconds");
  assert.match(read("src/features/tv/TVMode.jsx"), /<TVWalkout state=\{state\} moment=\{walkoutMoment\} events=\{events\} \/>/);
});

test("the walkout waits for a free-for-all's podium to turn 1st", () => {
  const state = { ...structuredClone(EMPTY_STATE), profiles:profiles() };
  const events = allEventsOf(state);
  state.results.putt = { slots:[["Evan"], ["Adi"], ["Khoa"]], ts:50_000, revision:1 };
  /* 1st lands on the podium's third beat (2.4 s), the song after it */
  assert.equal(ui.podiumHoldUntil(state, events, "Evan", 50_200), 50_000 + 2400 + 600);
  assert.equal(ui.podiumHoldUntil(state, events, "Adi", 50_200), null, "not the winner's song");
  assert.equal(ui.podiumHoldUntil(state, events, "Evan", 90_000), null, "a later song is not this result's");
});

/* ── you're up ── */
test("you're up: competitors take over, everyone else gets the banner, on the face-off's beat", () => {
  const state = { ...structuredClone(EMPTY_STATE), profiles:profiles() };
  act(state, "announceAndDraw", { evId:"bball1", players:ROSTER });
  const events = allEventsOf(state);
  const found = ui.currentFaceOff(state, events);
  assert.equal(found.ev.id, "bball1");
  const [a, b] = found.contest.sides.map(side => side.players[0]);
  const mine = ui.youreUpView(state, events, found, a);
  assert.equal(mine.role, "player");
  assert.deepEqual(mine.other.players, [b]);
  const bystander = ROSTER.find(p => !found.contest.players.includes(p));
  assert.equal(ui.youreUpView(state, events, found, bystander).role, "spectator");
  assert.equal(ui.youreUpTakes(found.contest, a), true);
  assert.equal(ui.youreUpTakes(found.contest, bystander), false);
  assert.ok(ui.UP_TIMING.sting > 0, "the sting lands on the TV's VS, after the slam");
  const html = render(state, React.createElement(ui.YoureUpTakeover, { state, me:a, onBets:() => {},
    moment:{ ...mine, id:"m1", elapsed:200 } }));
  assert.match(html, /You’re up/);
  assert.match(html, /Back yourself/);
  assert.match(html, /Winner pays 1:1/);
  assert.match(html, /--moment-color:#/, "in your own identity color");
  const banner = render(state, React.createElement(ui.UpBanner, { state, onBets:() => {},
    moment:{ ...ui.youreUpView(state, events, found, bystander), id:"m2", elapsed:0 } }));
  assert.match(banner, / vs /);
  assert.match(read("src/features/home/GuestHome.jsx"), /!youreUpTakes\(contest, me\)/, "Home leaves the sting to the takeover");
});

/* ── the room sorts itself ── */
test("the room sorts itself: a team of two or more floods its color at the draw", () => {
  const state = { ...structuredClone(EMPTY_STATE), profiles:profiles() };
  act(state, "announceAndDraw", { evId:"8ball", players:ROSTER.slice(0, 12) });
  const ev = allEventsOf(state).find(item => item.id === "8ball");
  const reveal = ui.buildEventReveal(state, ev);
  const groups = ui.drawRevealGroups(state, reveal);
  const me = groups[0].lines[0].avatars[0];
  const team = ui.teamOf(reveal, groups, me);
  if (groups[0].lines[0].avatars.length > 1) {
    assert.ok(team && team.players.includes(me) && team.players.length >= 2);
    const html = render(state, React.createElement(ui.TeamSort, { state, team, at:Date.now() - 100 }));
    assert.match(html, /Hold it up/);
    assert.match(html, /--moment-color:#/);
  }
  const solo = { title:"The draw", versus:null };
  assert.equal(ui.teamOf(solo, [{ title:"Semifinal 1", vs:true, lines:[{ avatars:["Evan"], text:"Evan" }, { avatars:["Adi"], text:"Adi" }] }], "Evan"),
    null, "a one-on-one has no team to find");
});

/* ── the produced crown ── */
test("the produced crown: towers go dark from last place up, then 2nd, then the champion rises", () => {
  const C = CROWN_TIMING;
  const outs = Array.from({ length:13 }, (_, i) => crownOutAt(i, 13));
  assert.equal(outs[0], C.rise);
  assert.equal(outs[1], C.second);
  assert.equal(outs[12], C.stepDown);
  for (let i = 2; i < 12; i++) assert.ok(outs[i] > outs[i + 1], "13th first, up the board");
  assert.ok(outs[2] < C.holdTwo && C.holdTwo < C.second && C.second < C.rise && C.rise < C.flood);
  const eight = Array.from({ length:8 }, (_, i) => crownOutAt(i, 8));
  assert.equal(eight[7], C.stepDown);
  assert.ok(eight[2] < C.holdTwo);
});

/* ── the finale and the takeover mark ── */
test("the bust card names the place out, and takeovers share the canvas mark", () => {
  const pk = { id:"pk", startedAt:1, seats:ROSTER.slice(0, 12), outs:[{ player:"Evan", ts:5 }, { player:"Adi", ts:9 }] };
  const view = ui.bustView(pk);
  assert.equal(view.player, "Adi");
  assert.equal(view.placeText, "Out in 11th");
  assert.equal(ui.bustView({ ...pk, startedAt:0 }), null);
  assert.equal(ui.takeoverList("", "walkout", true), "walkout");
  assert.equal(ui.takeoverList("walkout", "faceoff", true), "walkout faceoff");
  assert.equal(ui.takeoverList("walkout faceoff", "walkout", false), "faceoff");
  const css = read("src/features/tv/tv-moments.css");
  /* tokens only; a gradient only as the glass's own light (DESIGN.md) */
  assert.ok(!/#[0-9a-f]{3,6}\b|rgba?\(/i.test(css), "tokens only");
  const sizes = [...css.matchAll(/font(?:-size)?:[^;]*?(\d+)px/g)].map(m => Number(m[1]));
  assert.ok(sizes.every(size => size >= 24), `TV text 24px and up: ${sizes.filter(s => s < 24)}`);
});

/* ── the phone's rank move ── */
test("passing someone rings a quiet rising pair; the lead keeps its own bell", () => {
  const at = (rank, leaders = []) => ({ me:"Evan", frozen:false, leaders, challenges:[], turn:null, rank });
  assert.deepEqual(phone.phoneCues(at(6), at(4)).map(c => c.id), ["rankUp"]);
  assert.deepEqual(phone.phoneCues(at(4), at(6)), [], "falling is silent");
  assert.deepEqual(phone.phoneCues(at(2), at(1, ["Evan"])).map(c => c.id), ["S15"], "the lead rings its own");
});

/* ── a sky that keeps score ── */
test("the sky strip: a star per winner, the champion's joined once crowned", () => {
  const state = { ...structuredClone(EMPTY_STATE), profiles:profiles() };
  const events = allEventsOf(state);
  assert.equal(ui.skyModel(state, events).stars.length, 0);
  state.results.putt = { slots:[["Evan"], ["Adi"], ["Khoa"]], ts:1, revision:1 };
  state.results.die = { slots:[["Evan", "Ben"], ["Adi", "Khoa"]], ts:2, revision:1 };
  const live = ui.skyModel(state, events);
  assert.ok(live.stars.length >= 2);
  assert.equal(live.lines.length, 0, "no constellation before the crown");
  state.frozen = true;
  const crowned = ui.skyModel(state, events, [{ player:"Evan", rank:1, pts:5000 }, { player:"Adi", rank:2, pts:4000 }]);
  assert.equal(crowned.champion, "Evan");
  assert.ok(crowned.lines.every(line => line.player === "Evan"));
});
