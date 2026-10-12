/* Attract mode (Oct 11, features/tv/attractModel.js, TVAttract.jsx): the
   TV's downtime plays one of the six idle vignettes on its own ambient
   turn, cast from the players in the room. The pick is the turn's own
   (every TV, any instant of the turn, the same vignette and chips), only
   present players play, never the same vignette twice in a row, a
   two-chip vignette only with two in the room, the foley only on a TV
   that saw it start, and the turn only in a real gap; the TV draws it over
   the board, then hands the rest of the turn back to the board. */
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

mock.timers.enable({ apis:["Date"], now:1_900_000_000_000 });

const { EMPTY_STATE, ROSTER, allEventsOf, computeStandings, presentPlayers } = await import("../shared/core.js");
const { applyAction } = await import("./support/confirmed-start.mjs");
const { bitById, bitsOf } = await import("../src/features/gags/bits/registry.js");
const { TV_AMBIENT_TURN_MS } = await import("../src/features/tv/tvModel.js");
const { withRecordTurns } = await import("../src/features/tv/recordsModel.js");
const { withPhotoTurns } = await import("../src/features/photos/photoModel.js");
const {
  ATTRACT_EARLY_MS, ATTRACT_JOIN_MS, attractAt, attractCast, attractHeard, attractNeeds, attractRoom, attractTurn,
  attractVignette, idleAt, withAttractTurns,
} = await import("../src/features/tv/attractModel.js");

const P = TV_AMBIENT_TURN_MS;
const IDLE = bitsOf("idle").map(bit => bit.id);
const fresh = () => { const s = structuredClone(EMPTY_STATE); s.live = true; return s; };
const ROTATION = withAttractTurns(["board", "next", "latest", "trophy", "records"], 13);
/* every attract turn in `turns` turns of a rotation, in order: { turn, pick } */
function attractTurns(ambient, room, turns = 600) {
  const out = [];
  for (let turn = 0; turn < turns; turn++) {
    const pick = attractAt({ ambient, now:turn * P + 2500, room });
    if (pick) out.push({ turn, pick });
  }
  return out;
}

test("the six idle vignettes: one takes two chips, the rest one", () => {
  assert.deepEqual([...IDLE].sort(), ["armwrestle", "map", "nap", "pushups", "saguaro", "sweep"]);
  for (const id of IDLE) assert.equal(attractNeeds(bitById(id)), id === "armwrestle" ? 2 : 1, id);
  for (const id of IDLE) assert.equal(bitById(id).letter, null, `${id} letters nothing`);
});

test("the attract turn: one a rotation, after the records, before the photos that close it, only with someone in the room", () => {
  const cards = ["board", "next", "latest", "trophy"];
  assert.deepEqual(withAttractTurns(withPhotoTurns(withRecordTurns(cards, 3), 2), 13),
    ["board", "next", "latest", "trophy", "records", "attract", "photos"]);
  assert.deepEqual(withAttractTurns(withPhotoTurns(withRecordTurns(cards, 3), 12), 13),
    ["board", "next", "latest", "photos", "trophy", "records", "attract", "photos"], "a busy desk's second photo turn stays mid-rotation");
  assert.deepEqual(withAttractTurns(withPhotoTurns(["board", "next"], 4), 1), ["board", "next", "attract", "photos"]);
  assert.deepEqual(withAttractTurns(["board", "next"], 2), ["board", "next", "attract"]);
  assert.deepEqual(withAttractTurns(cards, 0), cards, "an empty room: no attract turn");
  /* the k-th attract turn, counted on the server clock */
  const L = ROTATION.length;
  for (let turn = 0; turn < L * 5; turn++) {
    const k = attractTurn(ROTATION, turn * P + 100);
    assert.equal(k === null, ROTATION[turn % L] !== "attract", `turn ${turn}`);
    if (k !== null) assert.equal(k, Math.floor(turn / L));
  }
});

test("the pick is the turn's own: every TV, any instant of it, the same vignette and chips; the board takes the rest of the turn", () => {
  const room = presentPlayers(fresh());
  const turns = attractTurns(ROTATION, room, 120);
  assert.ok(turns.length >= 15);
  for (const { turn, pick } of turns) {
    const start = turn * P;
    const bit = bitById(pick.id);
    assert.equal(pick.start, start, "it starts on its turn's first instant");
    assert.equal(pick.end, start + bit.ms);
    assert.equal(pick.key, `attract:${start}`);
    for (const at of [start, start + 1, start + Math.floor(bit.ms / 2), pick.end - 1])
      assert.deepEqual(attractAt({ ambient:ROTATION, now:at, room }), pick, `turn ${turn} at +${at - start}`);
    assert.deepEqual(attractAt({ ambient:ROTATION, now:start + 4000, room:[...room] }), pick, "a second TV agrees");
    assert.deepEqual(pick.cast.a, attractCast(bit, room, start), "the cast is seeded by the turn's start");
    /* played once: from its end the turn is the board's */
    assert.equal(attractAt({ ambient:ROTATION, now:pick.end, room }), null);
    assert.equal(attractAt({ ambient:ROTATION, now:start + P - 1, room }), null);
    /* a TV mounts it a moment ahead (its tick is a second wide), never sooner */
    assert.deepEqual(attractAt({ ambient:ROTATION, now:start - ATTRACT_EARLY_MS, room, early:ATTRACT_EARLY_MS }), pick);
    assert.deepEqual(attractAt({ ambient:ROTATION, now:start - 300, room, early:ATTRACT_EARLY_MS }), pick);
    assert.equal(attractAt({ ambient:ROTATION, now:start - ATTRACT_EARLY_MS - 1, room, early:ATTRACT_EARLY_MS }), null);
    assert.equal(attractAt({ ambient:ROTATION, now:start - 300, room }), null, "without the lead, not before its start");
  }
  /* the turn's start seeds who plays: the room takes turns */
  assert.ok(new Set(turns.map(({ pick }) => pick.cast.a[0])).size >= 8, "many of the room get a vignette");
});

test("only the room plays: never Away, on the way or Not coming", () => {
  const s = fresh();
  s.out = { Allan:true };
  s.away = { Ben:true };
  s.arrivals = { open:true, at:Object.fromEntries(ROSTER.filter(p => p !== "Chiang").map((p, i) => [p, 1_000 + i])) };
  const room = attractRoom(s);
  assert.deepEqual(room, presentPlayers(s));
  for (const gone of ["Allan", "Ben", "Chiang"]) assert.ok(!room.includes(gone), gone);
  assert.equal(room.length, ROSTER.length - 3);
  for (const { pick } of attractTurns(ROTATION, room, 400)) {
    assert.equal(pick.cast.a.length, attractNeeds(pick.bit));
    assert.equal(new Set(pick.cast.a).size, pick.cast.a.length, "two different chips");
    assert.ok(pick.cast.a.every(p => room.includes(p)), pick.cast.a.join(","));
  }
  /* the door open and nobody in yet: no room, no attract turn */
  const empty = fresh();
  empty.arrivals = { open:true, at:{} };
  assert.deepEqual(attractRoom(empty), []);
  assert.deepEqual(withAttractTurns(["board", "next"], attractRoom(empty).length), ["board", "next"]);
  assert.equal(attractAt({ ambient:["board", "attract"], now:P + 100, room:[] }), null);
});

test("never the same vignette twice in a row, in any rotation and any room", () => {
  for (let k = 1; k < 3000; k++) assert.notEqual(idleAt(k).id, idleAt(k - 1).id, `pool ${k}`);
  for (const cards of [["board", "next"], ["board", "next", "latest", "trophy", "records"], ["board", "next", "latest", "trophy", "records", "photos"]]) {
    for (const size of [1, 2, 3, 13]) {
      const room = ROSTER.slice(0, size);
      const ambient = withAttractTurns(cards, size);
      const turns = attractTurns(ambient, room, 900);
      assert.ok(turns.length > 50);
      turns.forEach(({ pick }, i) => {
        if (i) assert.notEqual(pick.id, turns[i - 1].pick.id, `${cards.length} cards, ${size} in the room, attract turn ${i}`);
      });
      /* every vignette the room can cast comes round */
      assert.equal(new Set(turns.map(({ pick }) => pick.id)).size, size >= 2 ? 6 : 5);
    }
  }
});

test("a two-chip vignette needs two in the room, else a one-chip one, never the one before or after it", () => {
  let swapped = 0;
  for (let k = 0; k < 2000; k++) {
    const alone = attractVignette(k, 1);
    assert.equal(attractNeeds(alone), 1, `k ${k}`);
    if (idleAt(k).id === "armwrestle") {
      swapped++;
      assert.notEqual(alone.id, "armwrestle");
      assert.notEqual(alone.id, attractVignette(k - 1, 1)?.id);
      assert.notEqual(alone.id, attractVignette(k + 1, 1).id);
      assert.equal(attractVignette(k, 2).id, "armwrestle", "two in the room: the arm wrestle plays");
    } else assert.equal(alone.id, idleAt(k).id, "a one-chip vignette plays for one");
  }
  assert.ok(swapped > 100);
  assert.equal(attractVignette(4, 0), null, "nobody in the room: nothing");
  /* the arm wrestle casts two different chips from the room */
  const two = attractTurns(withAttractTurns(["board", "next"], 2), ["Khoa", "Evan"], 400).find(({ pick }) => pick.id === "armwrestle");
  assert.ok(two);
  assert.deepEqual([...two.pick.cast.a].sort(), ["Evan", "Khoa"]);
});

test("the foley: a TV that saw the vignette start sounds it; a late or reloaded TV joins it silent", () => {
  assert.equal(attractHeard(0), true);
  assert.equal(attractHeard(ATTRACT_JOIN_MS), true);
  assert.equal(attractHeard(ATTRACT_JOIN_MS + 1), false);
  assert.equal(attractHeard(4000), false);
  assert.equal(attractHeard(NaN), false);
  assert.equal(attractHeard(null), false);
  const source = readFileSync(new URL("../src/features/tv/TVAttract.jsx", import.meta.url), "utf8");
  assert.match(source, /open:false/, "ducked under a win song like any room sound");
  assert.match(source, /const heard = !fixed && stage === "on" && attractHeard\(joined\.current\)/);
});

/* ── the TV ── */

const say = console.error;
console.error = (...args) => /useLayoutEffect/.test(String(args[0])) ? undefined : say(...args);
const root = fileURLToPath(new URL("../", import.meta.url));
const compiled = buildSync({
  stdin:{ contents:`export { TVMode } from "./src/features/tv/TVMode.jsx";
    export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";`, resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react", "qrcode-generator", "three"], loader:{ ".css":"empty" },
  write:false, logLevel:"silent",
});
const ui = new Module(fileURLToPath(new URL("attract-ui.cjs", import.meta.url)));
ui.filename = ui.id;
ui.paths = Module._nodeModulePaths(root);
ui._compile(compiled.outputFiles[0].text, ui.filename);
const { TVMode, PlayerIdentityProvider } = ui.exports;
const tv = (state, now) => {
  const events = allEventsOf(state);
  const standings = computeStandings(state);
  return renderToStaticMarkup(React.createElement(PlayerIdentityProvider, { profiles:state.profiles },
    React.createElement(TVMode, { standings, state, events, onDeckEv:null, allTied:false, champion:standings[0] && state.frozen
      ? standings[0] : null, coChamps:[], showControlEnabled:false, connection:{ ready:true, connected:true, status:"open", version:1 },
      onExit:() => {}, now })));
};
const vignetteOn = html => /class="tv-takeover tv-attract"/.test(html) ? /data-bit="([a-z]+)"/.exec(html)?.[1] || "?" : null;
const castOn = html => [...html.matchAll(/class="cast[^"]*" data-player="([^"]+)"/g)].map(match => match[1]);
const base = Math.ceil(Date.now() / (P * 840)) * P * 840;

test("the TV plays it only in a gap, on its turn, over the board, then gives the turn back to the board", () => {
  const s = fresh();
  const room = attractRoom(s);
  const seen = [];
  for (let turn = 0; turn < 24; turn++) {
    const at = base + turn * P;
    const html = tv(s, at + 3000);
    const id = vignetteOn(html);
    if (!id) continue;
    seen.push({ turn, id });
    assert.ok(IDLE.includes(id), id);
    assert.match(html, /class="bit-layer bit-art is-[a-z]+ is-idle is-frozen"/, "held at the TV's instant");
    assert.match(html, /tv-towers|tv-board|tv-standings/, "the board stands under it");
    const cast = castOn(html);
    assert.equal(cast.length, attractNeeds(bitById(id)));
    assert.ok(cast.every(p => room.includes(p)));
    assert.equal(vignetteOn(tv(s, at + bitById(id).ms + 500)), null, "played once: the board has the rest of the turn");
  }
  assert.ok(seen.length >= 3, "attract turns come round");
  seen.forEach((item, i) => {
    if (!i) return;
    assert.ok(item.turn - seen[i - 1].turn > 1, "one a rotation");
    assert.notEqual(item.id, seen[i - 1].id, "never the same vignette twice in a row");
  });
  /* an event live: no attract turn at all */
  const live = fresh();
  assert.equal(applyAction(live, "announceEvent", { evId:"putt" }, { isGm:true, player:"Brandon", deviceId:"attract-gm", actionId:"a1" }).ok, true);
  for (let turn = 0; turn < 12; turn++) assert.equal(vignetteOn(tv(live, base + turn * P + 3000)), null, `live, turn ${turn}`);
  /* a crowned board keeps its own turns */
  const frozen = fresh();
  frozen.frozen = true;
  for (let turn = 0; turn < 12; turn++) assert.equal(vignetteOn(tv(frozen, base + turn * P + 3000)), null, `frozen, turn ${turn}`);
  /* the arrivals lobby holds the room */
  const lobby = structuredClone(EMPTY_STATE);
  lobby.arrivals = { open:true, at:{ Khoa:1_000, Evan:2_000 } };
  for (let turn = 0; turn < 12; turn++) assert.equal(vignetteOn(tv(lobby, base + turn * P + 3000)), null, `lobby, turn ${turn}`);
});

test("the TV wires it in the gap's rotation, gated like the records and photos, and its copy carries no em dash", () => {
  const source = readFileSync(new URL("../src/features/tv/TVMode.jsx", import.meta.url), "utf8");
  assert.match(source, /photoGap \? attractRoom\(state\) : EMPTY/, "the room only in a gap");
  assert.match(source, /const ambient = photoGap \? withAttractTurns\(withPhotoTurns\(withHighlightTurns\(withRecordTurns\(ambientCards, records\.length\), reel\.length\),\s*photos\.length\), room\.length\)/);
  assert.match(source, /const attract = photoGap && [^\n]*!chrome\.takeover/, "never under a takeover");
  assert.match(source, /<TVAttract key=\{attract\.key\}/);
  for (const file of ["src/features/tv/attractModel.js", "src/features/tv/TVAttract.jsx", "src/features/tv/tv-attract.css"])
    assert.doesNotMatch(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), /—/, `${file}: no em dashes`);
  const css = readFileSync(new URL("../src/features/tv/tv-attract.css", import.meta.url), "utf8");
  assert.ok(!/#[0-9a-f]{3,6}\b/i.test(css) && !/rgba?\(/.test(css), "tokens only");
});
