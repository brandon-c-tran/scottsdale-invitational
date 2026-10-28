/* The phone's screens, the join and the Locker (float/client/controller,
   join, locker; float/GROOVE.md "The screen (TV) and the phone"): each
   imports cleanly in node (Field Day bundles them, so no window or document
   at module scope), every screen renders from a fixture room (the song's
   moments on the pad: the round card, Practice, the host's call, the
   popup, Drink! and Done, Done and Break; the cut, the crowd, the podium,
   the card), the Locker offers the 13 critters and Winnie to the groom
   alone, the join's pure model, and the copy rules. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Module } from "node:module";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chartOf, cueTime, drinkSection } from "../float/shared/chart.js";
import { CODE_LETTERS, JOIN_COLORS, RIDER_KEY, STANDALONE_CODE, canJoin, cleanCode, cleanDraft, loadRider, riderOf, roomFromSearch,
  saveRider, withRoom } from "../float/client/join/joinModel.js";
import { LOCKER_NEUTRAL, LOCKER_TABS, critterName, critterTile, lockerEntrant, lockerOptions, pickLook }
  from "../float/client/locker/lockerModel.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const h = React.createElement;

async function bundle(contents, name) {
  const out = await build({ stdin:{ contents, resolveDir:ROOT, loader:"jsx", sourcefile:`${name}.jsx` }, bundle:true, platform:"node",
    format:"cjs", external:["react", "react-dom"], loader:{ ".css":"empty" }, write:false, logLevel:"silent", jsx:"automatic" });
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
  export { default as SongScreen } from "./float/client/controller/SongScreen.jsx";
  export { default as LastCall } from "./float/client/controller/LastCall.jsx";
  export { default as LockerPicker } from "./float/client/locker/LockerPicker.jsx";
  export { default as JoinFlow } from "./float/client/join/JoinFlow.jsx";
`, "screens");

const people = Array.from({ length:13 }, (_, i) => ({ device:`d${i}`, name:`Rider ${i}`, color:"#e4572e",
  look:{ critter:"otter", floatie:"donut", hat:"none", shades:"none", pose:"flex" }, ready:i % 2 === 0, drinks:true, connected:true }));
const me = { name:"Rider 0", color:"#e4572e", look:people[0].look, drinks:true };
const noop = () => {};
const screen = (name, room, { game = {}, ...extra } = {}) => renderToStaticMarkup(h(parts.Screens, { screen:name,
  game:{ room, idx:0, chart:null, memory:{}, me:null, ...game }, entrant:{ ...me, ...people[0] }, me, groom:false, serverNow:() => 1000,
  onReady:noop, onLook:noop, onFeedback:noop, onCheer:noop, onExit:noop, cheer:null, feedbackSent:false, ...extra }));

test("every screen renders from a room: joining, the lobby, the intro, the cut, the crowd, the podium, the card, watching", () => {
  assert.match(screen("connecting", null), /Joining/);
  const lobby = screen("lobby", { phase:"lobby", mode:"party", code:"brkt", entrants:people });
  assert.match(lobby, /BRKT/);
  assert.match(lobby, /Change look/);
  assert.match(lobby, />Ready</);
  assert.match(lobby, /7 of 13 ready/);
  assert.doesNotMatch(screen("lobby", { phase:"lobby", mode:"fieldday", entrants:people }), />Ready</, "a Field Day lobby starts itself");
  const intro = screen("intro", { phase:"intro", round:0, rounds:4, field:people.map((_, i) => i), cut:9, entrants:people });
  assert.match(intro, /Round 1 of 4/);
  assert.match(intro, /Paddle Party/);
  assert.match(intro, /9 of 13 go through/);
  /* the cut: through, out, and after the final the Cup's place */
  const scores = people.map((_, i) => ({ i, pct:95 - i * 4.5, cup:0 }));
  const cut = { phase:"cut", round:0, rounds:4, song:"paddle", field:[0, 1, 2, 3, 4, 5, 6, 7, 8], out:[12, 11, 10, 9], scores, entrants:people };
  const through = screen("cut", cut, { game:{ me:{ pct:81.5, place:4, of:13, through:true } } });
  assert.match(through, />Through</);
  assert.match(through, /81\.5%/);
  assert.match(through, /4th of 13/);
  assert.match(through, /Paddle Party/);
  const out = screen("cut", cut, { game:{ idx:12, me:{ pct:41, place:13, of:13, out:true } } });
  assert.match(out, />Out</);
  assert.match(out, /13th of 13/);
  const last = screen("cut", { ...cut, round:3, song:"drop", lastRound:true, field:[0, 3, 5], final:[3, 0, 5, 1], podium:[3, 0, 5],
    scores:[{ i:3, pct:97 }, { i:0, pct:93.5 }, { i:5, pct:90 }] });
  assert.match(last, />2nd</);
  assert.match(last, /of 13/);
  assert.doesNotMatch(last, /Through|>Out</, "after the final there is no verdict");
  /* out: the crowd, with one thing to do */
  const crowd = screen("crowd", { phase:"song", round:1, rounds:4, song:"rock", songAt:5000, field:[1, 2], out:[0], entrants:people });
  assert.match(crowd, /Rock Hop/);
  assert.match(crowd, />Out</);
  assert.match(crowd, />Cheer</);
  const podium = screen("podium", { phase:"podium", entrants:people, podium:[0, 3, 5], final:[0, 3, 5, 1] });
  assert.match(podium, />1st</);
  assert.match(podium, /of 13/);
  const card = screen("feedback", { phase:"feedback", entrants:people });
  for (const line of ["How fun was that?", "Would you play this with other friends?", "What would make it better?"]) assert.ok(card.includes(line), line);
  assert.match(screen("feedback", { phase:"feedback", entrants:people }, { feedbackSent:true }), /Thanks/);
  const watch = screen("watch", { phase:"song", round:2, rounds:4, song:"spin", entrants:people });
  assert.match(watch, /Watching/);
  assert.match(watch, /Spin Cycle/);
});

const SONG_AT = 3_000_000;
const paddle = chartOf("paddle");
const shape = { round:0, rounds:4, of:13, final:false, through:9 };
const song = (beat, extra = {}) => renderToStaticMarkup(h(parts.SongScreen, { serverNow:() => cueTime(SONG_AT, beat), chart:paddle, songAt:SONG_AT,
  entrant:{ ...me }, shape, name:"Paddle Party", owes:true, done:false, onTap:noop, onDone:noop, ...extra }));

test("the song on the pad: the round card, Practice, the host's call on its beat, the popup big", () => {
  const card = renderToStaticMarkup(h(parts.SongScreen, { serverNow:() => SONG_AT - 1500, chart:paddle, songAt:SONG_AT, entrant:{ ...me },
    shape, name:"Paddle Party", onTap:noop, onDone:noop }));
  assert.match(card, /data-moment="card"/);
  assert.match(card, /Round 1 of 4/);
  assert.match(card, /flc-card-title[^>]*>Paddle Party</);
  assert.match(song(4), /data-moment="intro"/);
  assert.match(song(4), /Round 1 of 4/, "the card stays through the intro");
  const practice = song(13.2);
  assert.match(practice, /data-moment="practice"/);
  assert.match(practice, />Practice</);
  assert.match(practice, /flc-call is-on/);
  assert.match(practice, />Ready</);
  assert.doesNotMatch(song(9), /flc-call is-on/, "a paddle bar: no call");
  const play = song(40);
  assert.doesNotMatch(play, />Practice</);
  assert.match(play, /data-moment="play"/);
  /* your popup: the signed offset over the word, at once */
  const popped = song(12.2, { popup:{ key:1, c:2, q:"nice", d:70, at:globalThis.performance.now() } });
  assert.match(popped, /\+0\.07/);
  assert.match(popped, /Nice!/);
  const miss = song(12.9, { popup:{ key:2, c:2, q:"miss", d:null, at:globalThis.performance.now() } });
  assert.match(miss, />Miss</);
  assert.doesNotMatch(miss, /\+0\.|-0\./, "a miss has no number");
});

test("the drink break on the pad: Drink! and a big Done, then Done; Break for a rider who doesn't drink; Done stays into play B", () => {
  const drink = drinkSection(paddle);
  const owed = song(drink.from + 2);
  assert.match(owed, /data-moment="drink"/);
  assert.match(owed, />Drink!</);
  assert.match(owed, /flc-done[^"]*"[^>]*>.*Done/s);
  assert.match(owed, /data-ui=""/, "Done keeps its own touch");
  assert.doesNotMatch(owed, /flc-call is-on/);
  const done = song(drink.from + 6, { done:true });
  assert.doesNotMatch(done, /flc-done/);
  assert.match(done, /flc-rest[^>]*><b[^>]*>Done</);
  const dry = song(drink.from + 6, { owes:false });
  assert.match(dry, />Break</);
  assert.doesNotMatch(dry, /Drink!/);
  const late = song(drink.to + 1.5);
  assert.match(late, /data-moment="play"/);
  assert.match(late, /flc-drink is-late/);
  assert.match(late, />Drink!</);
  assert.doesNotMatch(song(drink.to + 1.5, { done:true }), /flc-done/);
});

test("Last Call on the pad: the card, the glass on its way, your grabs and total, then You drink or Safe", () => {
  const bar = chartOf("lastcall");
  const songAt = 4_000_000;
  const room = { phase:"lastcall", song:"lastcall", songAt, field:[0, 1], out:[2], entrants:people.slice(0, 3), lastCall:{ totals:[], worst:null } };
  const at = (beat, extra = {}) => renderToStaticMarkup(h(parts.LastCall, { serverNow:() => cueTime(songAt, beat), room, me:null, idx:0, chart:bar,
    songAt, entrant:{ ...me }, judged:{}, onTap:noop, ...extra }));
  assert.match(at(-1), /flc-card-title[^>]*>Last Call</);
  const sliding = at(5.5);
  assert.match(sliding, /flc-glass/);
  assert.match(sliding, /--x:0\.5/);
  assert.doesNotMatch(sliding, /You drink|Safe/);
  const graded = at(9, { me:{ lastCall:{ ms:730, grabs:{ 0:730 } } } });
  assert.match(graded, /class="is-salmon"/);
  assert.match(graded, />0\.73</);
  const drinks = at(29, { room:{ ...room, lastCall:{ totals:[], worst:[0] } }, me:{ lastCall:{ ms:2100, grabs:{ 0:730, 1:null, 2:370 } } } });
  assert.match(drinks, />You drink</);
  assert.match(drinks, />2\.10</);
  assert.match(at(29, { room:{ ...room, lastCall:{ totals:[], worst:[1] } } }), />Safe</);
});

test("the Locker: the critters as portraits in the rider's colour; Winnie for the groom alone; no hats, shades or floaties", () => {
  const look = { critter:"otter", floatie:"shark", hat:"crown", shades:"hearts", pose:"chug" };
  const locker = renderToStaticMarkup(h(parts.LockerPicker, { look, onChange:noop, color:"#2e86ab", name:"Sam" }));
  assert.equal((locker.match(/<button[^>]*class="fll-tile[ "]/g) || []).length, 13);
  assert.match(locker, /Horned Lizard/);
  assert.match(locker, /fll-hero-name[^>]*>Otter</);
  assert.doesNotMatch(locker, /Winnie/);
  assert.doesNotMatch(locker, /role="tab"/, "one thing to pick: no tabs");
  assert.doesNotMatch(locker, /Shark|Hearts|Crown/);
  const groom = renderToStaticMarkup(h(parts.LockerPicker, { look:{ ...look, critter:"winnie" }, onChange:noop, groom:true }));
  assert.equal((groom.match(/<button[^>]*class="fll-tile[ "]/g) || []).length, 14);
  assert.match(groom, /fll-tile is-on is-groom[^>]*>.*Winnie/s);
  assert.match(groom, /fll-hero-name[^>]*>Winnie</);
  /* a look with Winnie, not the groom's: the critter falls back */
  assert.doesNotMatch(renderToStaticMarkup(h(parts.LockerPicker, { look:{ ...look, critter:"winnie" }, onChange:noop })), /fll-hero-name[^>]*>Winnie</);
});

test("the join renders the code, a new rider and a returning one", () => {
  const code = renderToStaticMarkup(h(parts.JoinFlow, { initialRoom:null }));
  assert.match(code, /Room code/);
  const fresh = renderToStaticMarkup(h(parts.JoinFlow, { initialRoom:"brkt" }));
  assert.match(fresh, /BRKT/);
  assert.match(fresh, /Drinking\?/);
  assert.match(fresh, /disabled=""[^>]*>Join</, "Join waits for a name and an answer");
});

test("join model: the code, the room in the link, a rider kept on the phone, the groom's say", () => {
  assert.equal(CODE_LETTERS.length, 20);
  assert.equal(cleanCode("bAr kT9x"), "brkt");
  assert.equal(cleanCode("aeiouy"), "");
  assert.ok(STANDALONE_CODE.test("brkt"));
  assert.equal(roomFromSearch("?room=BRKT"), "brkt");
  assert.equal(roomFromSearch("?room=fd-float"), "fd-float");
  assert.equal(roomFromSearch("?room=bad room!"), null);
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
  assert.equal(cleanDraft({ name:"B", look:{ critter:"winnie" } }, { seed:"s" }).look.critter === "winnie", false);
  assert.equal(cleanDraft({ name:"B", look:{ critter:"winnie" } }, { seed:"s", groom:true }).look.critter, "winnie");
  assert.equal(riderOf({ ...draft, drinks:true }, { groom:true }).groom, true);
  assert.equal("groom" in riderOf({ ...draft, drinks:true }), false);
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

test("locker model: the critters (Winnie the groom's), a pick, the preview", () => {
  assert.deepEqual(LOCKER_TABS.map(tab => tab.id), ["critter"]);
  assert.equal(lockerOptions("critter").length, 13);
  assert.equal(lockerOptions("critter", { groom:true }).length, 14);
  assert.equal(lockerOptions("critter", { groom:true }).at(-1).id, "winnie");
  assert.equal(critterName("winnie"), "Winnie");
  assert.equal(critterName("hornedlizard"), "Horned Lizard");
  const look = { critter:"otter", floatie:"classic", hat:"none", shades:"none", pose:"flex" };
  assert.deepEqual(pickLook(look, "critter", "frog"), { ...look, critter:"frog" });
  assert.equal(pickLook(look, "critter", "otter"), null, "the same pick changes nothing");
  assert.equal(pickLook(look, "critter", "winnie"), null, "Winnie is the groom's");
  assert.equal(pickLook(look, "critter", "winnie", { groom:true }).critter, "winnie");
  assert.equal(pickLook(look, "hat", "crown"), null, "no crown off the groom");
  assert.equal(pickLook(look, "wings", "x"), null);
  const preview = lockerEntrant({ look:{ ...look, hat:"crown" } });
  assert.equal(preview.color, LOCKER_NEUTRAL);
  assert.equal(preview.look.hat, "none");
  const tile = critterTile(lockerEntrant({ look:{ ...look, hat:"party" }, color:"#ff0000", photo:"/p.png" }), "frog");
  assert.deepEqual([tile.look.critter, tile.look.hat, tile.photo, tile.color], ["frog", "none", undefined, "#ff0000"], "a tile: the critter in the rider's colour");
});

test("copy: no em dashes in anything the controller, the join or the Locker says", () => {
  for (const dir of ["float/client/controller", "float/client/join", "float/client/locker"]) {
    for (const file of readdirSync(join(ROOT, dir))) {
      const text = readFileSync(join(ROOT, dir, file), "utf8");
      assert.ok(!text.includes("—"), `${dir}/${file} has an em dash`);
    }
  }
});
