/* The phone's screens, the join and the Locker (float/client/controller,
   join, locker; float/GROOVE.md "The screen (TV) and the phone"): each
   imports cleanly in node (Field Day bundles them, so no window or document
   at module scope), every screen renders from a fixture room (the song's
   moments on the pad: the round card, Practice, the host's call, the
   popup, the narration, Watch, the breakdown, your place; the cut's grade,
   the chug-off, Last Call's countdown, the crowd, the podium, the card),
   the Locker offers the 13 critters and Winnie to the groom alone, then
   hats, glasses and the photo tee, the join's pure model, and the copy
   rules. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Module } from "node:module";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chartOf, cueTime, lastCallId } from "../float/shared/chart.js";
import { CODE_LETTERS, JOIN_COLORS, RIDER_KEY, STANDALONE_CODE, canJoin, cleanCode, cleanDraft, loadRider, riderOf, roomFromSearch,
  saveRider, withRoom } from "../float/client/join/joinModel.js";
import { LOCKER_NEUTRAL, LOCKER_TABS, critterName, critterTile, lockerEntrant, lockerOptions, lockerTabs, lookTile, pickLook }
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
  export { default as ChugOff } from "./float/client/controller/ChugOff.jsx";
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
  assert.doesNotMatch(podium, />Cheer</, "on the podium: nothing to cheer from");
  const cheering = screen("podium", { phase:"podium", entrants:people, podium:[3, 5, 1], final:[3, 5, 1, 2, 0], out:[4, 0, 2] });
  assert.match(cheering, />Cheer</, "out: the crowd cheers the three");
  assert.match(cheering, /flc-podium has-cheer/);
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
  entrant:{ ...me }, shape, name:"Paddle Party", onTap:noop, ...extra }));

test("the song on the pad: the round card, Practice, the host's call on its beat, the popup big", () => {
  const card = renderToStaticMarkup(h(parts.SongScreen, { serverNow:() => SONG_AT - 1500, chart:paddle, songAt:SONG_AT, entrant:{ ...me },
    shape, name:"Paddle Party", onTap:noop }));
  assert.match(card, /data-moment="card"/);
  assert.match(card, /Round 1 of 4/);
  assert.match(card, /flc-card-title[^>]*>Paddle Party</);
  assert.match(song(4), /data-moment="intro"/);
  assert.match(song(4), /Round 1 of 4/, "the card stays through the intro");
  /* your first Hey: called on 21, answered on 23 */
  const practice = song(21.2);
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

test("practice narrated: the text box at the top, Watch while the host shows a cue; the breakdown's Copy me; your place in play", () => {
  const told = song(8.2);
  assert.match(told, /flc-line/);
  assert.match(told, /has-line/);
  assert.doesNotMatch(told, /Round 1 of 4/, "the narration takes the top from the card");
  const demo = paddle.cues.find(cue => cue.demo);
  const watching = song(demo.call + 0.2);
  assert.match(watching, /flc-line[^"]*"[^>]*><b[^>]*>Watch</);
  const breakdown = song(56.2);
  assert.match(breakdown, /data-moment="breakdown"/);
  assert.match(breakdown, />Copy me</);
  assert.match(breakdown, /flc-call is-on/, "the host's bar in the bubble");
  /* who's ahead: small in the song bar, Safe or Below the cut, from the room's me; nothing in practice */
  const safe = song(40, { me:{ place:4, of:13, cut:9 } });
  assert.match(safe, /flc-rank is-safe/);
  assert.match(safe, />4th of 13</);
  assert.match(safe, />Safe</);
  const below = song(40, { me:{ place:11, of:13, cut:9 } });
  assert.match(below, /flc-rank is-below/);
  assert.match(below, />Below the cut</);
  assert.doesNotMatch(song(13.2, { me:{ place:4, of:13, cut:9 } }), /flc-rank/, "practice: nobody scores");
  const final = song(40, { me:{ place:2, of:4, cut:null }, shape:{ ...shape, final:true, through:null } });
  assert.match(final, />2nd</);
  assert.doesNotMatch(final, /Safe|Below the cut| of 4/, "the final: the place alone");
  /* no drink break: nothing to tap but the pad */
  assert.doesNotMatch(song(60), /Drink!|flc-done/);
});

test("the cut: the grade big with the judge's line, then Through, Out or Chug-off!", () => {
  const scores = people.map((_, i) => ({ i, pct:95 - i * 4.5, cup:0 }));
  const cut = { phase:"cut", round:0, rounds:4, song:"paddle", startAt:900, field:[0, 1, 2, 3, 4, 5, 6, 7], out:[12, 11, 10, 9], scores, entrants:people,
    show:{ grades:1300, line:6000, outs:[{ i:9, at:6800 }, { i:10, at:8200 }] } };
  const feedback = { grade:"superb", line:"Every Hey on the beat." };
  const early = screen("cut", cut, { serverNow:() => 2000, game:{ me:{ pct:91, place:2, of:13, through:true, feedback } } });
  assert.match(early, /flc-grade is-superb[^>]*>Superb</);
  assert.match(early, />Every Hey on the beat\.</);
  assert.doesNotMatch(early, />Through</, "not yet heard");
  const heard = screen("cut", cut, { serverNow:() => 9000, game:{ me:{ pct:91, place:2, of:13, through:true, feedback } } });
  assert.match(heard, />Through</);
  const bubble = screen("cut", cut, { serverNow:() => 9000, game:{ idx:8, me:{ pct:59, place:9, of:13, through:null, out:false, bubble:true,
    feedback:{ grade:"ok", line:"" } } } });
  assert.match(bubble, />Chug-off!</);
  assert.match(bubble, /flc-cut is-bubble/);
});

test("the chug-off: the two get Chug-off!, the count, one huge Done, Waiting, then kept or Out; the room gets A vs B and the Cheer", () => {
  const goAt = 6_000_000;
  const room = { phase:"chugoff", round:0, startAt:goAt - 4000, entrants:people, chugoff:{ a:0, b:1, goAt, doneAt:{}, winner:null, by:null } };
  const at = (now, extra = {}) => renderToStaticMarkup(h(parts.ChugOff, { serverNow:() => now, room, idx:0, entrant:{ ...me }, onDone:noop,
    onCheer:noop, ...extra }));
  const call = at(goAt - 3500);
  assert.match(call, /flc-chug-title[^>]*>Chug-off!</);
  assert.match(call, />Rider 0<.*vs.*>Rider 1</s);
  assert.match(call, /Last one in against first one out\. First to finish keeps the spot\./);
  assert.match(at(goAt - 1500), /Last one in/, "the line stays up through the count");
  const later = at(goAt - 3500, { room:{ ...room, round:1 } });
  assert.doesNotMatch(later, /Last one in/, "only the Cup's first");
  assert.match(later, />Finish your drink</);
  assert.match(at(goAt - 1500), /flc-chug-count[^>]*>2</);
  const go = at(goAt + 200);
  assert.match(go, /flc-done flc-chug-done/);
  assert.match(go, />Done</);
  const waiting = at(goAt + 3000, { sent:true });
  assert.match(waiting, />Waiting</);
  assert.doesNotMatch(waiting, /flc-chug-done/);
  const won = { ...room, chugoff:{ ...room.chugoff, doneAt:{ 0:3000 }, winner:0, by:"chug" } };
  assert.match(at(goAt + 3500, { room:won }), />You keep your spot</);
  assert.match(at(goAt + 3500, { room:won, idx:1 }), />Out</);
  /* everyone else: the names, the two critters, the Cheer */
  const crowd = at(goAt + 1500, { idx:5 });
  assert.match(crowd, />Chug-off: Rider 0 vs Rider 1</);
  assert.match(crowd, />Cheer</);
  assert.doesNotMatch(crowd, /flc-chug-done/);
  const scored = at(goAt + 31000, { idx:5, room:{ ...room, chugoff:{ ...room.chugoff, winner:1, by:"score" } } });
  assert.match(scored, />Rider 1 keeps the spot</);
  assert.match(scored, /Nobody finished\. The better score keeps the spot\./);
});

test("Last Call on the pad: the title (the first says what it is), Tap on zero, Locked, the offset at the reveal, then You drink or Safe", () => {
  const bar = chartOf(lastCallId(0));
  const cd = bar.countdown;
  const songAt = 4_000_000;
  const room = { phase:"lastcall", round:0, songAt, field:[0, 1], out:[2], entrants:people.slice(0, 3), lastCall:{ worst:null } };
  const at = (ms, extra = {}) => renderToStaticMarkup(h(parts.LastCall, { serverNow:() => songAt + ms, room, idx:0, chart:bar,
    songAt, entrant:{ ...me }, judged:{}, onTap:noop, ...extra }));
  const intro = at(1000);
  assert.match(intro, /flc-card-title[^>]*>Last Call</);
  assert.match(intro, /The bar closes at zero\. Tap on zero\. Farthest off drinks\./);
  assert.doesNotMatch(at(1000, { chart:chartOf(lastCallId(1)) }), /The bar closes/, "the later ones: the title alone");
  const tap = at(cd.zeroAt - 3000);
  assert.match(tap, />Tap on zero</);
  assert.match(tap, /flc-zero-pad/);
  assert.doesNotMatch(tap, /\b(10|9|8|7|6|5|4|3|2|1)\b<\/b>/, "never the count");
  const judged = { 0:{ q:"late", d:730 } };
  const locked = at(cd.zeroAt + 1000, { judged });
  assert.match(locked, />Locked</);
  assert.doesNotMatch(locked, /\+0\.73|Late/, "nothing of the tap before the reveal");
  const reveal = at(cd.revealAt + 100, { judged });
  assert.match(reveal, /\+0\.73/);
  assert.doesNotMatch(reveal, /You drink|Safe/);
  const drinks = at(cd.verdictAt + 100, { judged, room:{ ...room, lastCall:{ worst:[0] } } });
  assert.match(drinks, />You drink</);
  assert.match(at(cd.verdictAt + 100, { judged, room:{ ...room, lastCall:{ worst:[1] } } }), />Safe</);
});

test("the Locker: the critters as portraits in the rider's colour (Winnie the groom's), then Hat, Glasses and, with a photo, Tee", () => {
  const look = { critter:"otter", floatie:"shark", hat:"cowboy", shades:"hearts", shirt:"none", pose:"chug" };
  const locker = renderToStaticMarkup(h(parts.LockerPicker, { look, onChange:noop, color:"#2e86ab", name:"Sam" }));
  assert.equal((locker.match(/<button[^>]*class="fll-tile[ "]/g) || []).length, 13, "the critter tab first");
  assert.match(locker, /Horned Lizard/);
  assert.match(locker, /fll-hero-name[^>]*>Otter</);
  assert.match(locker, /fll-hero-worn[^>]*>Cowboy · Hearts</);
  assert.doesNotMatch(locker, /Winnie/);
  assert.deepEqual([...locker.matchAll(/role="tab"[^>]*>([^<]+)</g)].map(m => m[1]), ["Critter", "Hat", "Glasses"], "no photo: no tee");
  assert.doesNotMatch(locker, /Shark/);
  const withPhoto = renderToStaticMarkup(h(parts.LockerPicker, { look, onChange:noop, color:"#2e86ab", name:"Sam", photo:"/p.png" }));
  assert.deepEqual([...withPhoto.matchAll(/role="tab"[^>]*>([^<]+)</g)].map(m => m[1]), ["Critter", "Hat", "Glasses", "Tee"]);
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

test("locker model: the critters (Winnie the groom's), hats (the crown the groom's), glasses, the tee with a photo, a pick, the preview", () => {
  assert.deepEqual(LOCKER_TABS.map(tab => tab.id), ["critter", "hat", "shades", "shirt"]);
  assert.deepEqual(lockerTabs().map(tab => tab.name), ["Critter", "Hat", "Glasses"]);
  assert.deepEqual(lockerTabs({ photo:"/p.png" }).map(tab => tab.name), ["Critter", "Hat", "Glasses", "Tee"]);
  assert.equal(lockerOptions("hat").some(hat => hat.id === "crown"), false);
  assert.equal(lockerOptions("hat", { groom:true })[0].id, "crown", "the groom's crown first");
  assert.deepEqual(lockerOptions("shirt").map(s => s.id), ["none", "photo"]);
  assert.equal(lockerOptions("critter").length, 13);
  assert.equal(lockerOptions("critter", { groom:true }).length, 14);
  assert.equal(lockerOptions("critter", { groom:true }).at(-1).id, "winnie");
  assert.equal(critterName("winnie"), "Winnie");
  assert.equal(critterName("hornedlizard"), "Horned Lizard");
  const look = { critter:"otter", floatie:"classic", hat:"none", shades:"none", shirt:"none", pose:"flex" };
  assert.deepEqual(pickLook(look, "critter", "frog"), { ...look, critter:"frog" });
  assert.equal(pickLook(look, "critter", "otter"), null, "the same pick changes nothing");
  assert.equal(pickLook(look, "critter", "winnie"), null, "Winnie is the groom's");
  assert.equal(pickLook(look, "critter", "winnie", { groom:true }).critter, "winnie");
  assert.equal(pickLook(look, "hat", "crown"), null, "no crown off the groom");
  assert.equal(pickLook(look, "wings", "x"), null);
  assert.deepEqual(pickLook(look, "shades", "aviators"), { ...look, shades:"aviators" });
  assert.deepEqual(pickLook(look, "shirt", "photo"), { ...look, shirt:"photo" });
  const rider = lockerEntrant({ look:{ ...look, hat:"party", shirt:"photo" }, color:"#ff0000", photo:"/p.png" });
  const hatTile = lookTile(rider, "hat", "visor");
  assert.deepEqual([hatTile.look.critter, hatTile.look.hat, hatTile.look.shirt, hatTile.photo], ["otter", "visor", "none", undefined],
    "a hat tile: the rider's critter in just that hat");
  const teeTile = lookTile(rider, "shirt", "photo");
  assert.deepEqual([teeTile.look.shirt, teeTile.photo], ["photo", "/p.png"], "the tee's tile prints the photo");
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
