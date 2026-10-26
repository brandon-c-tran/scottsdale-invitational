/* The phone's screens, the join and the Locker (float/client/controller,
   join, locker): each imports cleanly in node (Field Day bundles them, so
   no window or document at module scope), every screen renders from a
   fixture room, the Locker keeps the crown for the groom, the join's pure
   model, and the copy rules. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Module } from "node:module";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CODE_LETTERS, JOIN_COLORS, RIDER_KEY, STANDALONE_CODE, canJoin, cleanCode, cleanDraft, loadRider, riderOf, roomFromSearch,
  saveRider, withRoom } from "../float/client/join/joinModel.js";
import { LOCKER_NEUTRAL, LOCKER_TABS, critterTile, lockerEntrant, lockerOptions, pickLook, statMoves }
  from "../float/client/locker/lockerModel.js";
import { FLAG } from "../float/shared/protocol.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const h = React.createElement;

async function bundle(contents, name) {
  const out = await build({ stdin:{ contents, resolveDir:ROOT, loader:"jsx", sourcefile:`${name}.jsx` }, bundle:true, platform:"node",
    format:"cjs", external:["react", "react-dom", "three"], loader:{ ".css":"empty" }, write:false, logLevel:"silent", jsx:"automatic" });
  const mod = new Module(fileURLToPath(new URL(`float-controller-${name}.cjs`, import.meta.url)));
  mod.filename = mod.id;
  mod.paths = Module._nodeModulePaths(ROOT);
  mod._compile(out.outputFiles[0].text, mod.filename);
  return mod.exports;
}

test("the controller, the Locker, the join and the page import cleanly in node and export components", async () => {
  for (const path of ["float/client/controller/FloatController.jsx", "float/client/locker/LockerPicker.jsx",
    "float/client/join/JoinFlow.jsx", "float/client/controller/ControllerApp.jsx"]) {
    const part = await bundle(`export { default } from "./${path}";`, path.split("/").pop().replace(".jsx", ""));
    assert.equal(typeof part.default, "function", path);
  }
});

const parts = await bundle(`
  export { default as Screens } from "./float/client/controller/Screens.jsx";
  export { default as RaceScreen } from "./float/client/controller/RaceScreen.jsx";
  export { default as LockerPicker } from "./float/client/locker/LockerPicker.jsx";
  export { default as JoinFlow } from "./float/client/join/JoinFlow.jsx";
  export { raceView } from "./float/client/controller/controllerModel.js";
`, "screens");

const course = { id:"salt", legs:[{ id:"putin", name:"Put-in" }, { id:"narrows", name:"The Narrows" }, { id:"bend", name:"Whirlpool Bend" },
  { id:"drop", name:"The Drop" }] };
const people = Array.from({ length:13 }, (_, i) => ({ device:`d${i}`, name:`Rider ${i}`, color:"#e4572e",
  look:{ critter:"otter", floatie:"donut", hat:"none", shades:"none", pose:"flex" }, ready:i % 2 === 0, drinks:true, connected:true }));
const me = { name:"Rider 0", color:"#e4572e", look:people[0].look, drinks:true };
const noop = () => {};
const screen = (name, room, { game = {}, ...extra } = {}) => renderToStaticMarkup(h(parts.Screens, { screen:name,
  game:{ room, idx:0, course, memory:{}, me:null, ...game }, entrant:{ ...me, ...people[0] }, me, now:1000, groom:false, drink:null,
  onDrink:noop, onReady:noop, onLook:noop, onThrow:noop, onFeedback:noop, onExit:noop, onFlip:null, feedbackSent:false, ...extra }));

test("every screen renders from a room: lobby, the next leg, the cut, the beach, the podium, the card", () => {
  const lobby = screen("lobby", { phase:"lobby", mode:"party", code:"brkt", entrants:people });
  assert.match(lobby, /BRKT/);
  assert.match(lobby, /Change look/);
  assert.match(lobby, />Ready</);
  assert.match(lobby, /7 of 13 ready/);
  assert.doesNotMatch(screen("lobby", { phase:"lobby", mode:"fieldday", entrants:people }), />Ready</, "a Field Day lobby starts itself");
  const grid = screen("grid", { phase:"grid", round:1, rounds:4, leg:1, field:[4, 2, 0, 7, 1, 3, 5, 6, 8], cut:6, entrants:people, drinking:true });
  assert.match(grid, /The Narrows/);
  assert.match(grid, /Round 2 of 4/);
  assert.match(grid, /Start.*3rd/);
  assert.match(grid, /6 of 9 go through/);
  assert.match(grid, /Fresh drink/);
  const cut = screen("cut", { phase:"cut", round:0, rounds:4, leg:0, field:[3, 2, 5, 0], out:[12], cut:9, swapUntil:6000, entrants:people,
    results:[{ i:3, place:1 }, { i:2, place:2 }, { i:5, place:3 }, { i:0, place:4 }] });
  assert.match(cut, /Through/);
  assert.match(cut, /Next: The Narrows/);
  assert.match(cut, /Classic Tube/);
  assert.match(cut, /aria-pressed="true"[^>]*>.*?Donut|Donut/);
  const last = screen("cut", { phase:"cut", round:3, rounds:4, leg:3, field:[3, 0, 5], out:[12, 11], swapUntil:null, entrants:people,
    podium:[3, 0, 5], final:[3, 0, 5, 11, 12], results:[{ i:3, place:1 }, { i:0, place:2 }, { i:5, place:3 }] });
  assert.match(last, /2nd/);
  assert.doesNotMatch(last, /Through|Next:/, "after the final there is no next");
  const outcut = screen("outcut", { phase:"cut", round:0, leg:0, field:[1, 2], out:[0], entrants:people, results:[{ i:0, place:11, drinkAt:null }] });
  assert.match(outcut, /Finish your drink/);
  assert.match(outcut, /11th/);
  const beach = screen("beach", { phase:"race", round:1, leg:1, field:[1, 2, 3], out:[0], entrants:people,
    results:[{ i:2, place:1, time:40 }, { i:1, place:2, time:null }, { i:3, place:3, time:null }] }, { game:{ memory:{ drinkRounds:[1] } } });
  assert.match(beach, /Balloon ready/);
  assert.match(beach, /Throw at Rider 2.*Throw at Rider 1.*Throw at Rider 3/s, "race order");
  assert.match(beach, />In</, "a racer at the takeout");
  const podium = screen("podium", { phase:"podium", entrants:people, podium:[0, 3, 5], final:[0, 3, 5, 1] });
  assert.match(podium, /1st/);
  assert.match(podium, /of 13/);
  const card = screen("feedback", { phase:"feedback", entrants:people });
  for (const line of ["How fun was that?", "Would you play this with other friends?", "What would make it better?"]) assert.match(card, new RegExp(line.replace("?", "\\?")));
  assert.match(screen("feedback", { phase:"feedback", entrants:people }, { feedbackSent:true }), /Thanks/);
  assert.match(screen("watch", { phase:"race", leg:2, entrants:people }), /Whirlpool Bend/);
  assert.match(screen("connecting", null), /Joining/);
});

const race = (meFrame, extra = {}) => renderToStaticMarkup(h(parts.RaceScreen, { entrant:{ ...me }, view:parts.raceView(meFrame, 9),
  geomRef:{ current:{} }, live:true, count:null, drink:"idle", onDrink:noop, onStroke:noop, onHands:noop, onTouchEnd:noop, onFlip:null, ...extra }));

test("the race strip: place of the field, through or out by how many, the drink, a flip, the takeout", () => {
  const live = race({ place:3, of:13, prog:80, len:160, stam:0.6, f:0, cut:9 });
  assert.match(live, /3rd/);
  assert.match(live, /of 13/);
  assert.match(live, /Through/);
  assert.match(live, /Finished my drink/);
  assert.match(race({ place:11, of:13, prog:40, len:160, stam:0.2, f:0, cut:9 }), /Out by 2/);
  assert.match(race({ place:5, of:13, f:FLAG.SWIM, cut:9 }), /You flipped/);
  const takeout = race({ place:9, of:13, f:FLAG.ARRIVED, cut:9 });
  assert.match(takeout, /Finish your drink/);
  const placed = race({ place:4, of:13, f:FLAG.ARRIVED | FLAG.DRANK, cut:9 }, { drink:"done" });
  assert.doesNotMatch(placed, /Finish your drink/);
  assert.match(placed, /4th/);
  const counting = race(null, { live:false, count:2, drink:"locked", slot:4 });
  assert.match(counting, />2</);
  assert.match(counting, /start/);
  assert.doesNotMatch(counting, /Finished my drink/, "the count has the screen to itself");
  const go = race(null, { live:false, count:0, drink:"locked", slot:4 });
  assert.match(go, />Go</);
  assert.match(go, /disabled=""[^>]*>.*Finished my drink/s, "at Go the drink shows, waiting for the race");
  assert.doesNotMatch(race({ place:2, of:3, f:0, cut:null }), /Through|Out by/, "the final has no cut");
});

test("the beat on the race screen: practice says one line, the groove fills toward its level, Locked in lights", async () => {
  const { createRhythm } = await import("../float/client/controller/rhythm.js");
  const gun = 100000;
  /* the grid: practice, the start, the one line, no drink yet */
  const grid = race(null, { live:false, practice:true, drink:"locked", slot:4, beat:{ rhythm:createRhythm(), gun, serverNow:() => gun - 5000 } });
  assert.match(grid, /Stroke on the beat/);
  assert.match(grid, /start/);
  assert.match(grid, /class="flc-beat"/, "the pulse");
  assert.doesNotMatch(grid, /Finished my drink/);
  assert.equal((grid.match(/flc-rim/g) || []).length, 2, "a rim on each paddle");
  const counting = race(null, { live:false, practice:true, count:1, drink:"locked", slot:4, beat:{ rhythm:createRhythm(), gun, serverNow:() => gun - 900 } });
  assert.match(counting, />1</);
  assert.match(counting, /Stroke on the beat/);
  assert.doesNotMatch(race(null, { live:false, practice:true, count:0, drink:"locked", slot:4 }), /Stroke on the beat/, "the line goes at the gun");
  /* the race: no line; the groove from the phone's own count, then Locked in */
  const rhythm = createRhythm();
  for (let k = 1; k <= 6; k++) rhythm.judge(gun + k * 500, gun);
  const six = race({ place:3, of:13, prog:80, len:160, f:0, cut:9 }, { beat:{ rhythm, gun, serverNow:() => gun + 3100 } });
  assert.doesNotMatch(six, /Stroke on the beat/);
  assert.match(six, /Streak 6, Rhythm/);
  assert.match(six, /data-level="1"/);
  assert.match(six, /scaleX\(1\).*scaleX\(0\.5\).*scaleX\(0\)/s, "Rhythm full, Groove half way");
  for (let k = 7; k <= 16; k++) rhythm.judge(gun + k * 500, gun);
  const locked = race({ place:1, of:13, prog:120, len:160, f:0, cut:9 }, { beat:{ rhythm, gun, serverNow:() => gun + 8100 } });
  assert.match(locked, />Locked in</);
  assert.match(locked, /data-level="3"/);
  assert.match(locked, /flc-race[^"]*is-top/);
  assert.doesNotMatch(race({ place:3, of:13, f:0, cut:9 }), /Stroke on the beat|Locked in/, "no beat yet: no line, no level");
});

test("the Locker: tabs, tiles, cards and chips; the crown only for the groom", () => {
  const look = { critter:"otter", floatie:"shark", hat:"crown", shades:"hearts", pose:"chug" };
  const critters = renderToStaticMarkup(h(parts.LockerPicker, { look, onChange:noop }));
  for (const tab of LOCKER_TABS) assert.match(critters, new RegExp(`>${tab.name}<`));
  assert.match(critters, /Horned Lizard/);
  assert.match(critters, /Otter/);
  const hats = renderToStaticMarkup(h(parts.LockerPicker, { look, onChange:noop, initialTab:"hat" }));
  assert.doesNotMatch(hats, /Crown/, "not the groom: no crown, and a crown in the look falls back");
  const groom = renderToStaticMarkup(h(parts.LockerPicker, { look, onChange:noop, groom:true, initialTab:"hat" }));
  assert.match(groom, /Crown.*None.*Cowboy/s, "the groom's crown comes first");
  const floaties = renderToStaticMarkup(h(parts.LockerPicker, { look, onChange:noop, initialTab:"floatie" }));
  assert.match(floaties, /Bumps send riders flying/);
  assert.equal((floaties.match(/role="listitem"/g) || []).length, 8 * 4, "four stat bars on every card");
});

test("the join renders the code, a new rider and a returning one", () => {
  const code = renderToStaticMarkup(h(parts.JoinFlow, { initialRoom:null }));
  assert.match(code, /Room code/);
  const fresh = renderToStaticMarkup(h(parts.JoinFlow, { initialRoom:"brkt" }));
  assert.match(fresh, /BRKT/);
  assert.match(fresh, /Drinking\?/);
  assert.match(fresh, /disabled=""[^>]*>Join</, "Join waits for a name and an answer");
});

test("join model: the code, the room in the link, a rider kept on the phone", () => {
  assert.equal(CODE_LETTERS.length, 20);
  assert.equal(cleanCode("bAr kT9x"), "brkt");
  assert.equal(cleanCode("aeiouy"), "");
  assert.ok(STANDALONE_CODE.test("brkt"));
  assert.equal(roomFromSearch("?room=BRKT"), "brkt");
  assert.equal(roomFromSearch("?room=fd-float"), "fd-float");
  assert.equal(roomFromSearch("?room=bad room!"), null);
  assert.equal(roomFromSearch(""), null);
  assert.equal(withRoom("https://x.test/float/play?mock=1#a", "brkt"), "/float/play?mock=1&room=brkt#a");
  assert.equal(withRoom("https://x.test/float/play?room=brkt", null), "/float/play");
  const draft = cleanDraft({ name:"  Sam   T ", color:"#ZZZZZZ", look:{ critter:"frog", hat:"crown" } }, { seed:"s" });
  assert.equal(draft.name, "Sam T");
  assert.equal(draft.color, JOIN_COLORS[0]);
  assert.equal(draft.look.critter, "frog");
  assert.equal(draft.look.hat, "none", "no crown off the join");
  assert.equal(draft.drinks, null);
  assert.equal(canJoin(draft), false);
  assert.equal(canJoin({ ...draft, drinks:false }), true);
  assert.equal(canJoin({ ...draft, name:"   ", drinks:true }), false);
  const memory = new Map();
  const storage = { getItem:k => memory.get(k) ?? null, setItem:(k, v) => memory.set(k, String(v)) };
  assert.equal(loadRider(storage), null);
  saveRider({ ...draft, drinks:false }, storage);
  assert.deepEqual(JSON.parse(memory.get(RIDER_KEY)), riderOf({ ...draft, drinks:false }));
  assert.deepEqual(loadRider(storage, { seed:"s" }), { ...draft, drinks:false });
  memory.set(RIDER_KEY, "{not json");
  assert.equal(loadRider(storage), null);
  assert.equal(loadRider({ getItem() { throw new Error("blocked"); } }), null);
});

test("locker model: options, picks, stat moves, the preview", () => {
  assert.equal(lockerOptions("hat").some(hat => hat.id === "crown"), false);
  assert.equal(lockerOptions("hat", { groom:true })[0].id, "crown");
  assert.equal(lockerOptions("critter").length, 13);
  assert.equal(lockerOptions("floatie").length, 8);
  const look = { critter:"otter", floatie:"classic", hat:"none", shades:"none", pose:"flex" };
  assert.deepEqual(pickLook(look, "hat", "party"), { ...look, hat:"party" });
  assert.equal(pickLook(look, "hat", "none"), null, "the same pick changes nothing");
  assert.equal(pickLook(look, "hat", "crown"), null, "no crown off the groom");
  assert.equal(pickLook(look, "hat", "crown", { groom:true }).hat, "crown");
  assert.equal(pickLook(look, "wings", "x"), null);
  const moves = statMoves("classic", "unicorn");
  assert.deepEqual(moves.map(m => [m.id, m.value, m.gain, m.loss]), [["speed", 5, 2, 0], ["turn", 3, 0, 0], ["weight", 2, 0, 1], ["grip", 2, 0, 1]]);
  const preview = lockerEntrant({ look:{ ...look, hat:"crown" } });
  assert.equal(preview.color, LOCKER_NEUTRAL);
  assert.equal(preview.look.hat, "none");
  const tile = critterTile(lockerEntrant({ look:{ ...look, hat:"party" }, color:"#ff0000", photo:"/p.png" }), "frog");
  assert.deepEqual([tile.look.critter, tile.look.hat, tile.photo], ["frog", "none", undefined], "a tile draws just the critter");
});

test("copy: no em dashes in anything the controller, the join or the Locker says", () => {
  const dirs = ["float/client/controller", "float/client/join", "float/client/locker"];
  for (const dir of dirs) {
    for (const file of readdirSync(join(ROOT, dir))) {
      const text = readFileSync(join(ROOT, dir, file), "utf8");
      assert.ok(!text.includes("—"), `${dir}/${file} has an em dash`);
    }
  }
});
