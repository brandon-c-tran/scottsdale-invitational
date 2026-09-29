import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CHIP_COLORS, CHIP_SKINS, EDITION, EMPTY_STATE, ROSTER, allEventsOf, computeStandings,
  resolveCurrentContest } from "../shared/core.js";
import { SHOW_SCENE_DEFINITIONS, resolveDirector, resolveShowScene } from "../shared/show.js";
import { applyAction } from "./support/confirmed-start.mjs";
import { CROWN_TIMING, nextLatch } from "../src/features/tv/tvMotion.js";
import { freshChangeStep, MOTION } from "../src/lib/motion.js";

/* D1 (the room floods on the crown), D2 (the face-off at lock) and D3 (the
   class photo and the poster): pure timing, selection and layout models, the
   real reducers for the scene step, and the real components' markup. */
const root = fileURLToPath(new URL("../", import.meta.url));
const compiled = await build({
  stdin:{ contents:`
    export * from "./src/features/results/crownTiming.js";
    export * from "./src/features/results/classPhoto.js";
    export { drawPoster, drawChip, renderPosterImage } from "./src/features/results/posterImage.js";
    export { LastCardLayer } from "./src/features/results/LastCard.jsx";
    export * from "./src/features/tv/faceOff.js";
    export { FaceOff } from "./src/features/tv/TVFaceOff.jsx";
    export { ClassPhoto } from "./src/features/tv/TVClassPhoto.jsx";
    export { TVMode } from "./src/features/tv/TVMode.jsx";
    export { directorPill } from "./src/features/director/directorPill.js";
    export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";`,
  resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react", "qrcode-generator", "three"], loader:{ ".css":"empty" },
  write:false, logLevel:"silent",
});
const mod = new Module(fileURLToPath(new URL("crown-scenes.cjs", import.meta.url)));
mod.filename = mod.id;
mod.paths = Module._nodeModulePaths(root);
mod._compile(compiled.outputFiles[0].text, mod.filename);
const ui = mod.exports;

let seq = 0;
const gm = (showControl = true) => ({ isGm:true, player:"Brandon", deviceId:"gm-device", actionId:`crown-${++seq}`, showControl });
const act = (state, type, payload = {}, ctx = gm()) => {
  const result = applyAction(state, type, payload, ctx);
  assert.equal(result.ok, true, `${type}: ${result.error}`);
  return result;
};
const ref = (state, evId) => {
  const contest = resolveCurrentContest(state, allEventsOf(state).find(ev => ev.id === evId));
  return { contestId:contest.id, contestRevision:contest.revision };
};
const profiles = () => Object.fromEntries(ROSTER.map((player, index) => [player, { display:player, num:index + 1,
  color:CHIP_COLORS[index % CHIP_COLORS.length].hex, skin:CHIP_SKINS[index % CHIP_SKINS.length], photoV:index + 1 }]));
const puttPosted = (showControl = true) => {
  const state = { ...structuredClone(EMPTY_STATE), profiles:profiles() };
  act(state, "announceEvent", { evId:"putt" }, gm(showControl));
  act(state, "lockAndStart", { evId:"putt", ...ref(state, "putt") }, gm(showControl));
  act(state, "beginResultEntry", { evId:"putt" }, gm(showControl));
  act(state, "saveResult", { evId:"putt", slots:[["Evan"], ["Adi"], ["Khoa"]] }, gm(showControl));
  return state;
};
const crowned = (showControl = true) => {
  const state = puttPosted(showControl);
  if (showControl) {
    act(state, "advanceShowScene", { id:state.showControl.active.id });
    act(state, "advanceShowScene", { id:state.showControl.active.id });
  }
  act(state, "setFrozen", { f:true }, gm(showControl));
  state.updatedAt = showControl ? state.showControl.active.startedAt + 3 : 1_800_000_000_000;
  return state;
};
const LIVE = { ready:true, connected:true, version:3 };
const render = (element, state) =>
  renderToStaticMarkup(React.createElement(ui.PlayerIdentityProvider, { profiles:state.profiles }, element));

/* ── D1: the room floods on the crown ── */
test("D1: every phone times the crown from the TV's own anchor", () => {
  assert.equal(ui.PHONE_CROWN.flood, CROWN_TIMING.flood, "the flood lands on the TV's beat");
  assert.equal(ui.PHONE_CROWN.chip, CROWN_TIMING.chip);
  assert.ok(ui.PHONE_CROWN.turn > CROWN_TIMING.total, "the card turns only after the TV's crown has landed");

  const scene = crowned(true);
  assert.equal(scene.showControl.active.kind, "champion");
  assert.equal(ui.crownAnchor(scene), scene.showControl.active.startedAt, "Show Control: the champion scene's start");
  const plain = crowned(false);
  assert.equal(ui.crownAnchor(plain), plain.updatedAt, "without Show Control: the crowning write's time");
  /* a champion scene from some other write (a later manual start) is not the crown's anchor */
  const later = { ...scene, updatedAt:scene.showControl.active.startedAt + 60_000 };
  assert.equal(ui.crownAnchor(later), later.updatedAt);
  assert.equal(ui.crownAnchor({ ...scene, frozen:false, updatedAt:0 }), null);
});

test("D1: live, late, missed, tied and reduced crowns each open the right thing", () => {
  const at = 1_000_000;
  const plan = extra => ui.crownPhonePlan({ anchor:at, fresh:true, ...extra });
  const live = plan({ now:at + 120 });
  assert.equal(live.mode, "moment");
  assert.equal(live.flood, true, "every phone floods, not only the champion's");
  assert.equal(live.elapsed, 120);
  assert.equal(live.turnIn, ui.PHONE_CROWN.turn - 120, "the card turns on the room's clock");
  assert.equal(plan({ now:at + 1600 }).mode, "moment", "a phone mid-flood joins the room");
  assert.equal(plan({ now:at + CROWN_TIMING.flood + CROWN_TIMING.floodMs }).mode, "card", "after the flood: straight to the card");
  assert.equal(plan({ now:at + 120, tied:true }).flood, false, "a tie floods nobody");
  assert.equal(plan({ now:at + 120, tied:true }).mode, "moment");
  assert.equal(plan({ now:at + 120, reduced:true }).mode, "card", "reduced motion: straight to the card");
  assert.equal(ui.crownPhonePlan({ anchor:at, now:at + 120, fresh:false }).mode, "card", "a missed crown opens the card");
  assert.equal(plan({ now:at - 50 }).elapsed, 0, "a frame ahead of the clock starts at the top");
  assert.equal(ui.crownPhonePlan({ anchor:null, now:5, fresh:true }).mode, "moment", "no anchor plays from arrival");
});

test("D1: the phone moment floods on every phone and sits on the TV's timeline", () => {
  const state = crowned(false);
  const standings = computeStandings(state);
  state.updatedAt = Date.now() - 500;
  const props = me => ({ state, me, events:allEventsOf(state), standings, mode:"moment", onClose:() => {}, onStandings:() => {} });
  const champion = render(React.createElement(ui.LastCardLayer, props(standings[0].player)), state);
  const other = render(React.createElement(ui.LastCardLayer, props(standings[7].player)), state);
  for (const html of [champion, other]) {
    assert.match(html, /fd-crown-flood/);
    assert.match(html, /--tl:-\d+ms/, "delays count from the crown");
    assert.match(html, /--crown-color:#/);
    assert.match(html, /Skip/);
    assert.doesNotMatch(html, /Save poster/, "a guest never gets the poster");
  }
  const late = { ...state, updatedAt:Date.now() - 5000 };
  const lateHtml = render(React.createElement(ui.LastCardLayer, { ...props(standings[7].player), state:late }), late);
  assert.doesNotMatch(lateHtml, /fd-crown-flood/, "a phone that opens late goes straight to its card");
  assert.match(lateHtml, /Save card/);

  const tied = structuredClone(state);
  tied.adjustments = [...(tied.adjustments || []), { id:"tie", player:standings[1].player,
    delta:standings[0].pts - standings[1].pts, reason:"tie", ts:1 }];
  const tiedStandings = computeStandings(tied);
  assert.equal(tiedStandings.filter(row => row.rank === 1).length, 2);
  const tie = render(React.createElement(ui.LastCardLayer, { ...props(standings[7].player), state:tied, standings:tiedStandings }), tied);
  assert.doesNotMatch(tie, /fd-crown-flood/, "a tie stays on night");
  assert.match(tie, /Tied for the championship/);

  const css = readFileSync(new URL("../src/features/results/results.css", import.meta.url), "utf8");
  assert.ok(css.includes(`calc(var(--tl, 0ms) + ${CROWN_TIMING.flood}ms)`), "the phone's flood uses the TV's flood beat");
  assert.ok(css.includes(`calc(var(--tl, 0ms) + ${CROWN_TIMING.chip}ms)`), "and its chip beat");
  assert.ok(!/#[0-9a-f]{3,6}\b|gradient/i.test(css), "tokens only, flat");
});

/* ── D2: the face-off at lock ── */
const bracketOpen = () => {
  const state = { ...structuredClone(EMPTY_STATE), profiles:profiles() };
  act(state, "announceAndDraw", { evId:"bball1", players:ROSTER });
  return state;
};
test("D2: only a fresh lock of a two-sided contest plays, and it keys on the lock's own time", () => {
  assert.equal(ui.faceOffPlays("betting-open", "in-progress"), true);
  assert.equal(ui.faceOffPlays("betting-locked", "in-progress"), true);
  assert.equal(ui.faceOffPlays(null, "in-progress"), false, "a first render (reload, late TV) never plays");
  assert.equal(ui.faceOffPlays("in-progress", "awaiting-result"), false);
  assert.equal(ui.faceOffPlays("betting-open", "betting-open"), false);
  assert.ok(ui.FACEOFF_TIMING.settle === MOTION.beat, "it settles after one beat");

  /* the latch the hook runs: a fresh phase step builds the moment, a
     stale-frame step does not */
  const committed = { value:"betting-open", key:"bball1:c", frameSeq:1, changeId:0, from:"betting-open", to:"betting-open" };
  const freshStep = freshChangeStep(committed, { value:"in-progress", key:"bball1:c", frame:{ fresh:true, seq:2, at:Date.now() } });
  const latch = nextLatch(null, { change:{ ...freshStep, animate:true }, key:"bball1:c",
    build:(from, to) => ui.faceOffPlays(from, to) ? { anchor:1 } : null });
  assert.ok(latch.moment, "a fresh lock latches a face-off");
  const quiet = freshChangeStep(committed, { value:"in-progress", key:"bball1:c", frame:{ fresh:false, seq:2, at:Date.now() } });
  assert.equal(quiet.fresh, false, "a catch-up frame shows the normal layout");

  const state = bracketOpen();
  const ev = allEventsOf(state).find(item => item.id === "bball1");
  const before = Date.now();
  act(state, "lockAndStart", { evId:"bball1", ...ref(state, "bball1") });
  const contest = resolveCurrentContest(state, ev);
  assert.equal(contest.phase, "in-progress");
  const lockedAt = state.eventOps.bball1.bettingLockedAt;
  assert.ok(lockedAt >= before);
  assert.equal(ui.faceOffAnchor(state, ev, lockedAt + 300), lockedAt, "anchored on the lock write");
  assert.equal(ui.faceOffAnchor(state, ev, lockedAt + 60_000), lockedAt + 60_000, "an old lock plays from now");
});

test("D2: two sides, their photo chips, and a record only when they have met", () => {
  const state = bracketOpen();
  const ev = allEventsOf(state).find(item => item.id === "bball1");
  const contest = resolveCurrentContest(state, ev);
  assert.equal(contest.sides.length, 2);
  const [a, b] = contest.sides.map(side => side.players[0]);
  const view = ui.faceOffView(state, ev, contest);
  assert.equal(view.sides.length, 2);
  assert.equal(view.record, null, "never met: no record line");

  const duel = (id, winner, loser) => ({ id, from:winner, to:loser, stake:100, status:"open", ts:1,
    runs:{ [winner]:{ ms:300 }, [loser]:{ ms:420 } } });
  state.duels = [duel("d1", b, a), duel("d2", b, a), duel("d3", a, b)];
  assert.equal(ui.faceOffView(state, ev, contest).record, `${b} leads 2-1`);
  state.duels.push(duel("d4", a, b));
  assert.equal(ui.faceOffView(state, ev, contest).record, "Tied 2-2");

  /* a wide field is not a face-off; teams have no record */
  const wide = { ...contest, sides:[...contest.sides, { key:99, players:["Ben"] }] };
  assert.equal(ui.faceOffView(state, ev, wide), null);
  const teams = { ...contest, sides:[{ key:0, players:[a, "Ben"] }, { key:1, players:[b, "Jeremy"] }] };
  assert.equal(ui.faceOffRecord(state, teams.sides), null);

  assert.equal(ui.faceOffChipSize(1), 300, "one player: the largest chip");
  assert.ok(ui.faceOffChipSize(2) < 300 && ui.faceOffChipSize(2) >= 160);
  assert.ok(ui.faceOffChipSize(6) >= 96 && ui.faceOffChipSize(6) * 3 + 28 <= 640, "a team fits its half as a group");

  const html = render(React.createElement(ui.FaceOff, { state, events:allEventsOf(state), ev, contest,
    view:ui.faceOffView(state, ev, contest), moment:{ elapsed:180 } }), state);
  assert.match(html, /tv-faceoff/);
  assert.match(html, /is-left/);
  assert.match(html, /is-right/);
  assert.match(html, />VS</);
  assert.match(html, /Tied 2-2/);
  assert.match(html, /--tl:-180ms/);
  assert.match(html, /<image /, "the chips carry the faces when photos exist");
});

/* ── D3: the class photo and the poster ── */
test("D3: the champion scene has an optional class photo step and the pill offers it", () => {
  assert.deepEqual([...SHOW_SCENE_DEFINITIONS.champion.steps], ["champion", "class"]);
  const state = crowned(true);
  const events = allEventsOf(state);
  const director = resolveDirector(state, events, { showControl:true });
  assert.equal(director.nextAction.type, "advance-scene");
  assert.equal(director.nextAction.label, "Class photo");
  const pill = ui.directorPill(state, events, director, { me:"Brandon" });
  assert.ok(pill.extras.some(extra => extra.label === "Skip"), "optional: Skip ends the scene");
  act(state, "advanceShowScene", { id:state.showControl.active.id });
  const scene = resolveShowScene(state, events);
  assert.equal(scene.stepKey, "class");
  const after = resolveDirector(state, events, { showControl:true });
  assert.notEqual(after.nextAction?.type, "advance-scene", "the last step never holds Continue");
  assert.notEqual(after.nextAction?.type, "start-champion-scene", "the champion counts as shown");

  /* a one-step champion record from before still resolves, to its first step */
  const legacy = structuredClone(state);
  legacy.showControl.active.step = 0;
  assert.equal(resolveShowScene(legacy, events).stepKey, "champion");
});

test("D3: all thirteen in final order, the champion on top, inside the frame", () => {
  const state = crowned(false);
  const standings = computeStandings(state);
  const model = ui.classPhotoModel(state, standings);
  assert.deepEqual(model.people.map(person => person.player), standings.map(row => row.player), "final standings order");
  assert.deepEqual(model.tiers.map(tier => tier.length), [1, 6, 6]);
  assert.equal(model.title.brand, "Field Day");
  assert.equal(model.title.edition, EDITION.label);
  const layout = ui.classPhotoLayout(model);
  assert.equal(layout.slots.length, ROSTER.length);
  layout.slots.forEach(slot => {
    assert.ok(slot.cx - slot.r >= 0 && slot.cx + slot.r <= ui.CLASS_W, `${slot.player} inside horizontally`);
    assert.ok(slot.stack.top + slot.stack.size <= ui.CLASS_H - 16, `${slot.player} inside vertically`);
    assert.ok(slot.name.size >= 24 && slot.stack.size >= 24 && slot.tag.size >= 24, "TV text 24px and up");
  });
  const champ = layout.slots.find(slot => slot.rank === 1);
  assert.ok(layout.slots.every(slot => slot === champ || slot.r < champ.r), "the champion's chip is the largest");
  for (const tier of [1, 2]) {
    const row = layout.slots.filter(slot => slot.tier === tier).sort((x, y) => x.cx - y.cx);
    row.slice(1).forEach((slot, i) => assert.ok(slot.cx - row[i].cx >= slot.r * 2 + 20, "chips never overlap"));
  }
  const entrance = ui.classEntrance(layout);
  assert.equal(Math.max(...entrance.values()), entrance.get(champ.player), "the champion lands last");

  /* a shared title stands together on the top step */
  const tied = structuredClone(state);
  tied.adjustments = [...(tied.adjustments || []), { id:"tie", player:standings[1].player,
    delta:standings[0].pts - standings[1].pts, reason:"tie", ts:1 }];
  assert.equal(ui.classPhotoModel(tied, computeStandings(tied)).tiers[0].length, 2);
  assert.equal(ui.posterFileName(), "field-day-scottsdale-2026.png");
});

test("D3: the frozen TV holds the champion through the crown, then takes turns with the class photo", () => {
  const period = 12000;
  const crownAt = 10 * period;
  assert.equal(ui.frozenAmbient({ now:crownAt + 1000, crownAt, crownMs:CROWN_TIMING.total, period }), "champion");
  assert.equal(ui.frozenAmbient({ now:crownAt + CROWN_TIMING.total + period - 1, crownAt, crownMs:CROWN_TIMING.total, period }), "champion");
  const later = [0, 1, 2, 3].map(k => ui.frozenAmbient({ now:crownAt + 10 * period + k * period, crownAt, crownMs:CROWN_TIMING.total, period }));
  assert.deepEqual(new Set(later), new Set(["champion", "class"]), "both take turns");
  assert.equal(ui.frozenAmbient({ now:3 * period, period }), "class", "the same frame on every TV");
});

test("D3: the TV draws the class photo on its step and as the frozen ambient", () => {
  const state = crowned(true);
  act(state, "advanceShowScene", { id:state.showControl.active.id });
  const events = allEventsOf(state);
  const standings = computeStandings(state);
  const tv = now => render(React.createElement(ui.TVMode, { state, events, standings, allTied:false, champion:standings[0],
    coChamps:standings.filter(row => row.rank === 1), showControlEnabled:true, onDeckEv:null, now, connection:LIVE, onExit:() => {} }), state);
  const directed = tv(state.showControl.active.updatedAt + 5000);
  assert.match(directed, /tv-class/);
  assert.ok(directed.includes(EDITION.label));
  ROSTER.forEach(player => assert.ok(directed.includes(player.toUpperCase()), `${player} in the photo`));
  assert.doesNotMatch(directed, /tv-ticker/);

  const off = crowned(false);
  const offStandings = computeStandings(off);
  const ambient = now => render(React.createElement(ui.TVMode, { state:off, events, standings:offStandings, allTied:false,
    champion:offStandings[0], coChamps:offStandings.filter(row => row.rank === 1), showControlEnabled:false, onDeckEv:null,
    now, connection:LIVE, onExit:() => {} }), off);
  const period = 12000;
  const start = Math.ceil((off.updatedAt + CROWN_TIMING.total + period) / (2 * period)) * 2 * period;
  assert.match(ambient(off.updatedAt + 1000), /tv-champ/, "the crown holds first");
  assert.match(ambient(start + period + 10), /tv-class/, "then the class photo takes its turn");
  assert.match(ambient(start + 10), /tv-champ/, "and the champion returns");

  const css = readFileSync(new URL("../src/features/tv/tvScenes.css", import.meta.url), "utf8");
  const sizes = [...css.matchAll(/font(?:-size)?:[^;]*?(\d+)px/g)].map(m => Number(m[1]));
  assert.ok(sizes.every(size => size >= 24), `TV text sizes ${sizes.filter(s => s < 24)}`);
  assert.ok(!/#[0-9a-f]{3,6}\b|rgba?\(|gradient/i.test(css), "tokens only, flat");
});

/* a canvas stand-in that records what was drawn */
function recorder() {
  const calls = [];
  const texts = [];
  const ctx = new Proxy({}, {
    get(target, name) {
      if (name === "calls") return calls;
      if (name === "texts") return texts;
      if (name === "measureText") return text => ({ width:String(text).length * (Number(/(\d+)px/.exec(target.font || "")?.[1]) || 10) * 0.5 });
      if (name in target) return target[name];
      return (...args) => { calls.push(name); if (name === "fillText") texts.push(args[0]); };
    },
    set(target, name, value) { target[name] = value; return true; },
  });
  return ctx;
}
test("D3: the poster draws the same composition: sky, title, thirteen chips, names and stacks", async () => {
  const state = crowned(false);
  const standings = computeStandings(state);
  const layout = ui.classPhotoLayout(ui.classPhotoModel(state, standings));
  const colors = Object.fromEntries(["sky", "far", "mid", "ground", "near", "cactus", "disc", "star", "bone", "sun", "muted",
    "ink0", "paper2", "chipMark"].map(name => [name, `rgb(1, 2, 3)`]));
  const identities = new Map(standings.map((row, i) => [row.player, { color:CHIP_COLORS[i].hex, isLight:!!CHIP_COLORS[i].light,
    skin:CHIP_SKINS[i % CHIP_SKINS.length], num:i + 1, photo:null }]));
  const ctx = recorder();
  ui.drawPoster(ctx, { layout, colors, identities, stars:[] });
  assert.ok(ctx.texts.includes("FIELD DAY"));
  assert.ok(ctx.texts.includes(` · ${EDITION.label.toUpperCase()}`));
  standings.forEach(row => assert.ok(ctx.texts.includes(row.player.toUpperCase()), `${row.player} named`));
  standings.forEach(row => assert.ok(ctx.texts.includes(row.pts.toLocaleString("en-US")), `${row.player}'s stack`));
  assert.ok(ctx.calls.filter(name => name === "arc").length >= ROSTER.length * 3, "every chip drawn");
  /* every skin draws without throwing */
  CHIP_SKINS.forEach(skin => ui.drawChip(recorder(), 50, 50, 100, { color:"rgb(1,2,3)", light:false, skin, num:7 }, colors));
  assert.equal(await ui.renderPosterImage(state, { standings }), null, "no document: nothing drawn, nothing thrown");
});

test("D3: the commissioner's card layer carries Save poster", () => {
  const state = crowned(false);
  const standings = computeStandings(state);
  const html = render(React.createElement(ui.LastCardLayer, { state, me:"Brandon", events:allEventsOf(state), standings,
    mode:"card", gm:true, onClose:() => {}, onStandings:() => {} }), state);
  assert.match(html, /Save poster/);
  assert.match(html, /Save card/);
});
