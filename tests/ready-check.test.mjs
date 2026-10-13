/* Ready check (features/director/readyCheck.js and ReadyCheck.jsx): the
   commissioner's one sheet of what the weekend still needs. Every count is
   over the weekend's roster (Not coming never counts), every row is read
   from what the commissioner's frame carries, a row the frame cannot answer
   is left out, and the menu row sits in Now before the weekend and in Setup
   once it is live. */
import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EMPTY_STATE, ROSTER } from "../shared/core.js";
import { cleanKaraokeTrack } from "../shared/karaoke.js";
import { publicState } from "../worker/publicState.js";
import { applyAction } from "./support/confirmed-start.mjs";
import { commissionerMenu } from "../src/features/director/menuModel.js";
import { TV_STALE_MS } from "../src/features/director/tvHealth.js";
import {
  READY_STATES, flightsDone, geoRoundReady, readyCheck, readyRows, readyTodo, readyValue,
} from "../src/features/director/readyCheck.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const compiled = buildSync({
  stdin:{ contents:`export { ReadyCheck } from "./src/features/director/ReadyCheck.jsx";
export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";`, resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react"], loader:{ ".css":"empty" }, write:false, logLevel:"silent",
});
const mod = new Module(fileURLToPath(new URL("ready-check.cjs", import.meta.url)));
mod.filename = mod.id; mod.paths = Module._nodeModulePaths(root);
mod._compile(compiled.outputFiles[0].text, mod.filename);
const { ReadyCheck, PlayerIdentityProvider } = mod.exports;

/* Sheet's presence motion is a layout effect; the server renderer says so once per render */
const say = console.error;
console.error = (...args) => /useLayoutEffect/.test(String(args[0])) ? undefined : say(...args);

let seq = 0;
const gm = () => ({ isGm:true, player:"Brandon", deviceId:"rc-gm", actionId:`rc-${++seq}`, environment:"local" });
const guest = player => ({ isGm:false, player, deviceId:`rc-${player}`, actionId:`rc-${++seq}` });
const act = (state, type, payload, ctx = gm()) => {
  const result = applyAction(state, type, payload, ctx);
  assert.equal(result.ok, true, `${type}: ${result.error}`);
  return result;
};
const COLORS = ["#c33a2e", "#2e6bc3", "#3aa35b", "#d9a23a", "#7d4cc2", "#2bb3b3", "#c2477d", "#8a8a2e", "#5a6b7d",
  "#b0582e", "#2e8a5a", "#9c2e5a", "#4c7dc2"];
/* a guest who finished check-in: a name, a number and size, a chip color, ratings */
function checkIn(state, player, extra = {}) {
  const i = ROSTER.indexOf(player);
  state.profiles[player] = { display:player, num:i + 1, size:"L", color:COLORS[i], skin:"ticks", ...extra };
  state.seeds[player] = { golf:3, bball:2 };
  return state;
}
const fresh = () => structuredClone(EMPTY_STATE);
/* everyone checked in, nothing else answered */
const signedUp = () => ROSTER.reduce((state, player) => checkIn(state, player), fresh());
const LEG_IN = { air:"AA", num:"2214", time:"11:05" }, LEG_OUT = { air:"AA", num:"1630", time:"17:45" };
const now = 1_800_000_000_000;
const sections = (state, opts = {}) => readyCheck(state, { now, receivedAt:now, ...opts });
const rowOf = (state, id, opts) => readyRows(sections(state, opts)).find(item => item.id === id);
const ids = (state, opts) => readyRows(sections(state, opts)).map(item => item.id);

test("the shape: Guests, Games, Room; every row a known state and a short label", () => {
  const all = sections(signedUp(), { capabilities:{ audioCatalog:true, audioDirector:true, push:true }, tvs:[{ ageMs:0, sound:"on" }],
    speaker:{ ok:true, configured:true, connected:true, device:{ id:"d1", name:"Living Room" }, autoWinSongs:true } });
  assert.deepEqual(all.map(section => section.title), ["Guests", "Games", "Room"]);
  assert.deepEqual(all.map(section => section.icon), ["people", "games", "tv"]);
  assert.deepEqual(all[0].rows.map(item => item.id), ["checkedIn", "photos", "colors", "jerseys", "songs", "flights", "venmo", "drinks"]);
  assert.deepEqual(all[1].rows.map(item => item.id), ["trivia", "geo", "awards"]);
  assert.deepEqual(all[2].rows.map(item => item.id), ["tv", "tvSound", "speaker", "autoSongs", "alerts", "autopilot"]);
  for (const item of readyRows(all)) {
    assert.ok(READY_STATES.includes(item.state), item.id);
    const words = item.label.split(" ").length;
    assert.ok(words >= 1 && words <= 3, `${item.id}: ${item.label}`);
    assert.doesNotMatch(`${item.label} ${item.value || ""}`, /—|!|\./, item.id);
  }
});

test("guest rows count over the roster: ready, part done with who it waits on, not started", () => {
  const state = signedUp();
  ["Evan", "Khoa", "Ben"].forEach(player => { state.profiles[player].photoV = 1; });
  const photos = rowOf(state, "photos");
  assert.deepEqual({ have:photos.have, of:photos.of, state:photos.state }, { have:3, of:ROSTER.length, state:"partial" });
  assert.deepEqual(photos.missing, ROSTER.filter(player => !["Evan", "Khoa", "Ben"].includes(player)), "roster order");
  assert.equal(photos.opens, null, "no desk holds the guests' photos");
  const colors = rowOf(state, "colors");
  assert.deepEqual({ have:colors.have, state:colors.state, missing:colors.missing }, { have:ROSTER.length, state:"ready", missing:[] });
  const venmo = rowOf(state, "venmo");
  assert.deepEqual({ have:venmo.have, state:venmo.state, opens:venmo.opens }, { have:0, state:"missing", opens:"travelSheet" });
  assert.equal(venmo.missing.length, ROSTER.length);

  /* checked in is the server's own rule: a name, a chip color, ratings */
  delete state.seeds.Evan;
  delete state.profiles.Khoa.color;
  delete state.profiles.Ben;
  const checked = rowOf(state, "checkedIn");
  assert.deepEqual({ have:checked.have, state:checked.state, opens:checked.opens },
    { have:ROSTER.length - 3, state:"partial", opens:"attendance" });
  assert.deepEqual(checked.missing, ROSTER.filter(player => ["Evan", "Khoa", "Ben"].includes(player)));
  assert.equal(rowOf(fresh(), "checkedIn").state, "missing", "nobody yet");
});

test("Not coming leaves every count: the roster is rosterOf, the same everywhere", () => {
  const state = signedUp();
  act(state, "setOut", { player:"Jeremy", out:true });
  act(state, "setOut", { player:"Henry", out:true });
  const roster = ROSTER.filter(player => !["Jeremy", "Henry"].includes(player));
  for (const item of sections(state)[0].rows) {
    assert.equal(item.of, roster.length, item.id);
    assert.ok(!item.missing.includes("Jeremy") && !item.missing.includes("Henry"), item.id);
  }
  /* everyone still coming has a photo: ready, though Jeremy and Henry have none */
  roster.forEach(player => { state.profiles[player].photoV = 1; });
  assert.deepEqual({ ...rowOf(state, "photos"), missing:undefined },
    { id:"photos", label:"Photos", have:roster.length, of:roster.length, value:null, state:"ready", opens:null, missing:undefined });
  /* taking it back counts them again */
  act(state, "setOut", { player:"Jeremy", out:false });
  assert.deepEqual([rowOf(state, "photos").have, rowOf(state, "photos").of, rowOf(state, "photos").missing],
    [roster.length, roster.length + 1, ["Jeremy"]]);
});

test("flights: booked with both legs; not booked yet and a missing leg are still owed", () => {
  assert.equal(flightsDone({ flightsBooked:true, flightIn:LEG_IN, flightOut:LEG_OUT }), true);
  assert.equal(flightsDone({ flightsBooked:true, flightIn:LEG_IN }), false, "a leg missing");
  assert.equal(flightsDone({ flightsBooked:false }), false, "not booked yet");
  assert.equal(flightsDone({ flightsBooked:false, flightIn:LEG_IN, flightOut:LEG_OUT }), false, "said not booked");
  assert.equal(flightsDone({ flightIn:{ note:"UA 1 at 10" }, flightOut:{ note:"UA 2 at 6" } }), true, "legs saved before the yes/no");
  assert.equal(flightsDone(null), false);
  const state = signedUp();
  act(state, "saveProfile", { player:"Evan", display:"Evan", flightsBooked:true, flightIn:LEG_IN, flightOut:LEG_OUT }, guest("Evan"));
  act(state, "saveProfile", { player:"Khoa", display:"Khoa", flightsBooked:false }, guest("Khoa"));
  const flights = rowOf(state, "flights");
  assert.deepEqual({ have:flights.have, state:flights.state, opens:flights.opens }, { have:1, state:"partial", opens:"travelSheet" });
  assert.ok(flights.missing.includes("Khoa"));
});

test("Venmo and drinks: any saved answer counts, a no to drinking included", () => {
  const state = signedUp();
  act(state, "saveProfile", { player:"Evan", display:"Evan", venmo:"@evan", drinking:false }, guest("Evan"));
  act(state, "saveProfile", { player:"Khoa", display:"Khoa", drinking:true }, guest("Khoa"));
  assert.equal(rowOf(state, "venmo").have, 1);
  const drinks = rowOf(state, "drinks");
  assert.deepEqual({ label:drinks.label, have:drinks.have, state:drinks.state }, { label:"Drinks answered", have:2, state:"partial" });
});

test("jerseys: confirmed of the roster until ordered; ordered is ready with nothing to count", () => {
  const state = signedUp();
  act(state, "saveProfile", { player:"Evan", display:"Evan", confirmJersey:true }, guest("Evan"));
  act(state, "saveProfile", { player:"Khoa", display:"Khoa", confirmJersey:true }, guest("Khoa"));
  const jerseys = rowOf(state, "jerseys");
  assert.deepEqual({ label:jerseys.label, have:jerseys.have, state:jerseys.state, opens:jerseys.opens },
    { label:"Jerseys confirmed", have:2, state:"partial", opens:"travelSheet" });
  /* changing what prints reads as unconfirmed again */
  act(state, "saveProfile", { player:"Khoa", display:"Khoa", size:"XL" }, guest("Khoa"));
  assert.equal(rowOf(state, "jerseys").have, 1);
  act(state, "lockJerseys", { locked:true });
  assert.deepEqual(rowOf(state, "jerseys"), { id:"jerseys", label:"Jerseys ordered", have:null, of:null, value:null,
    state:"ready", opens:"travelSheet", missing:[] });
});

test("win songs: a row only while guests can pick one, opening the Speaker when it is on", () => {
  const state = signedUp();
  state.profiles.Evan.walkoutTrack = { trackId:"t1", uri:"spotify:track:t1", name:"Song", artists:["A"], durationMs:200000 };
  assert.ok(!ids(state).includes("songs"), "the picker off: no row");
  const songs = rowOf(state, "songs", { capabilities:{ audioCatalog:true, audioDirector:true } });
  assert.deepEqual({ have:songs.have, state:songs.state, opens:songs.opens }, { have:1, state:"partial", opens:"audioDirector" });
  assert.equal(rowOf(state, "songs", { capabilities:{ audioCatalog:true } }).opens, null, "no Speaker sheet, no target");
});

test("karaoke songs: a row only with the karaoke capability while Karaoke is still to play, opening its desk", () => {
  const state = signedUp();
  const karaoke = (n, name) => {
    const trackId = `readyKaraokeSong${n}`.padEnd(22, "x");
    return cleanKaraokeTrack({ provider:"spotify", trackId, uri:`spotify:track:${trackId}`, name, artists:["A"], durationMs:200000,
      video:{ id:`readyVideo${n}`, title:`${name} karaoke`, channel:"Stingray Karaoke", seconds:205 } });
  };
  state.profiles.Evan.karaokeTrack = karaoke(1, "Mr. Brightside");
  state.profiles.Khoa.karaokeTrack = karaoke(2, "Africa");
  assert.ok(!ids(state).includes("karaoke"), "the capability off: no row");
  assert.ok(!ids(state, { capabilities:{ audioCatalog:true, audioDirector:true } }).includes("karaoke"));
  const on = { capabilities:{ audioCatalog:true, karaoke:true } };
  const row = rowOf(state, "karaoke", on);
  assert.deepEqual({ label:row.label, have:row.have, of:row.of, state:row.state, opens:row.opens },
    { label:"Karaoke songs", have:2, of:ROSTER.length, state:"partial", opens:"karaoke" });
  assert.deepEqual(row.missing, ROSTER.filter(player => !["Evan", "Khoa"].includes(player)), "faces in roster order");
  assert.deepEqual(sections(state, on)[0].rows.map(item => item.id),
    ["checkedIn", "photos", "colors", "jerseys", "songs", "karaoke", "flights", "venmo", "drinks"], "after the win songs");
  /* Karaoke posted or skipped: nothing left to pick for */
  assert.ok(!ids({ ...state, results:{ karaoke:{ slots:[["Evan"], [], []] } } }, on).includes("karaoke"));
  assert.ok(!ids({ ...state, shelved:{ karaoke:true } }, on).includes("karaoke"));
});

test("games: Trivia's questions, Where and When's complete photos, the awards written", () => {
  const state = signedUp();
  const games = () => Object.fromEntries(sections(state)[1].rows.map(item => [item.id, [item.state, item.have, item.opens]]));
  assert.deepEqual(games(), { trivia:["missing", 0, "trivia"], geo:["missing", 0, "geo"], awards:["missing", 0, "awards"] });

  act(state, "triviaSaveRound", { round:{ id:"treadyone1", source:"custom", name:"The groom", questions:[
    { id:"qreadyone1", format:"choice", text:"First car?", options:["Civic", "Corolla", "Jetta", "Camry"], answer:0 },
    { id:"qreadyone2", format:"number", text:"Miles to Scottsdale", answer:1450, unit:"mi" },
  ] } });
  act(state, "geoSaveRound", { id:"greadyone1", photo:{ id:"greadyone1", w:1600, h:1200 }, lat:33.49, lng:-111.92,
    place:"Old Town", when:"2024-10-30T18" });
  act(state, "promptSave", { id:"ballot-ready", kind:"awards", questions:[
    { id:"q-fraud", title:"Fraud of the weekend", nominees:null }, { id:"q-clutch", title:"Most clutch", nominees:null },
    { id:"q-dressed", title:"Best dressed", nominees:null } ] });
  assert.deepEqual(games(), { trivia:["ready", 2, "trivia"], geo:["ready", 1, "geo"], awards:["ready", 3, "awards"] });

  /* a round the game cannot play (no pin) leaves Where and When part done */
  state.geoRounds.push({ id:"greadytwo2", photo:{ id:"greadytwo2", w:1600, h:1200 }, lat:null, lng:null, place:"", when:"2024-10-30T18" });
  assert.deepEqual(games().geo, ["partial", 1, "geo"]);
  assert.equal(geoRoundReady(state.geoRounds[0]), true);
  assert.equal(geoRoundReady({ ...state.geoRounds[0], when:"2024-13-30T18" }), false, "a date the game cannot read");
  assert.equal(geoRoundReady({ ...state.geoRounds[0], photo:null }), false, "no photo");

  /* a game already played or shelved needs nothing more */
  state.results = { ...state.results, trivia:{ slots:[["Evan"], [], []] } };
  state.shelved = { ...state.shelved, where:true };
  assert.deepEqual(sections(state)[1].rows.map(item => item.id), ["awards"]);
});

test("room: the TVs that spoke in the last minute and their sound; nothing known, no row", () => {
  const state = fresh();
  assert.ok(!ids(state).includes("tv"), "no TV list in the frame yet");
  assert.deepEqual([rowOf(state, "tv", { tvs:[] }).state, ids(state, { tvs:[] }).includes("tvSound")], ["missing", false]);
  const tvs = [{ ageMs:1000, sound:"on" }, { ageMs:2000, sound:"blocked" }, { ageMs:TV_STALE_MS + 5, sound:"on" }, { ageMs:500 }];
  const tv = rowOf(state, "tv", { tvs });
  assert.deepEqual({ have:tv.have, state:tv.state, opens:tv.opens }, { have:3, state:"ready", opens:"showControl" }, "the stale one is gone");
  const sound = rowOf(state, "tvSound", { tvs });
  assert.deepEqual({ have:sound.have, of:sound.of, state:sound.state }, { have:1, of:2, state:"partial" },
    "a TV on an older build never reported its sound");
  assert.equal(rowOf(state, "tvSound", { tvs:[{ ageMs:0, sound:"blocked" }] }).state, "missing");
  assert.equal(rowOf(state, "tvSound", { tvs:[{ ageMs:0, sound:"on" }] }).state, "ready");
  /* the frame landed a while ago: the same TVs have gone quiet since */
  assert.equal(rowOf(state, "tv", { tvs, receivedAt:now - TV_STALE_MS }).state, "missing");
});

test("room: the speaker as Spotify's status said, auto win songs, alerts, the autopilot", () => {
  const state = fresh();
  const audio = { audioDirector:true };
  const speaker = status => rowOf(state, "speaker", { capabilities:audio, speaker:status });
  assert.equal(speaker(null), undefined, "not read yet: no row");
  assert.equal(speaker({ ok:false, error:"Commissioner authentication required" }), undefined);
  assert.equal(rowOf(state, "speaker", { speaker:{ ok:true, configured:true, connected:true } }), undefined, "no Speaker sheet");
  const pick = item => item && [item.state, item.value, item.opens];
  assert.deepEqual(pick(speaker({ ok:true, configured:false, connected:false })), ["missing", "Set up", "audioDirector"]);
  assert.deepEqual(pick(speaker({ ok:true, configured:true, connected:false })), ["missing", "Not connected", "audioDirector"]);
  assert.deepEqual(pick(speaker({ ok:true, configured:true, connected:true, reconnect:true, autoWinSongs:true })),
    ["missing", "Reconnect", "audioDirector"]);
  assert.deepEqual(pick(speaker({ ok:true, configured:true, connected:true, device:null, autoWinSongs:true })),
    ["partial", "No speaker", "audioDirector"]);
  const living = { ok:true, configured:true, connected:true, premium:true, device:{ id:"d1", name:"Living Room" }, autoWinSongs:true };
  assert.deepEqual(pick(speaker(living)), ["ready", "Living Room", "audioDirector"]);
  assert.deepEqual(pick(speaker({ ...living, premium:false })), ["partial", "Needs Spotify Premium", "audioDirector"]);

  const auto = status => pick(rowOf(state, "autoSongs", { capabilities:audio, speaker:status }));
  assert.deepEqual(auto(living), ["ready", null, "audioDirector"]);
  assert.deepEqual(auto({ ...living, autoWinSongs:false }), ["off", "Off", "audioDirector"]);
  assert.deepEqual(auto({ ...living, playbackEnabled:false }), ["off", "Off", "audioDirector"], "the speaker cannot play");
  assert.equal(auto({ ok:true, configured:true, connected:false }), undefined, "signed out: nothing to read");

  assert.deepEqual(pick(rowOf(state, "alerts", { capabilities:{ push:true } })), ["ready", null, null]);
  assert.deepEqual(pick(rowOf(state, "alerts")), ["off", "Off", null]);
  assert.deepEqual(pick(rowOf(state, "autopilot")), ["ready", null, null]);
  act(state, "setAutopilot", { hold:true });
  assert.deepEqual(pick(rowOf(state, "autopilot")), ["off", "Paused", null]);
});

test("to do counts every row not ready, a switch left off included; the menu says it", () => {
  const state = signedUp();
  ROSTER.forEach(player => Object.assign(state.profiles[player], { photoV:1, venmo:`v${player}`, drinking:true,
    flightsBooked:true, flightIn:LEG_IN, flightOut:LEG_OUT }));
  act(state, "lockJerseys", { locked:true });
  act(state, "triviaSaveRound", { round:{ id:"treadyall1", source:"custom", name:"Groom", questions:[
    { id:"qreadyall1", format:"choice", text:"First car?", options:["Civic", "Corolla", "Jetta", "Camry"], answer:0 }] } });
  act(state, "geoSaveRound", { id:"greadyall1", photo:{ id:"greadyall1", w:1600, h:1200 }, lat:33.49, lng:-111.92,
    place:"Old Town", when:"2024-10-30T18" });
  act(state, "promptSave", { id:"ballot-all", kind:"awards", questions:[{ id:"q-best", title:"Best dressed", nominees:null }] });
  const opts = { capabilities:{ push:true }, tvs:[{ ageMs:0, sound:"on" }] };
  assert.equal(readyTodo(sections(state, opts)), 0);
  assert.equal(readyValue(0), "Ready");
  assert.equal(readyTodo(sections(state, { ...opts, capabilities:{} })), 1, "alerts off");
  act(state, "setAutopilot", { hold:true });
  delete state.profiles.Evan.venmo;
  assert.equal(readyTodo(sections(state, { ...opts, capabilities:{} })), 3);
  assert.equal(readyValue(3), "3 to do");
  assert.equal(readyValue(1), "1 to do");
});

test("read from the commissioner's own frame: the projection gives the same rows; nothing private reaches a guest", () => {
  const state = signedUp();
  act(state, "saveProfile", { player:"Evan", display:"Evan", venmo:"evan", drinking:true, flightsBooked:true, flightIn:LEG_IN,
    flightOut:LEG_OUT, confirmJersey:true }, guest("Evan"));
  act(state, "triviaSaveRound", { round:{ id:"treadyprj1", source:"custom", name:"Groom", questions:[
    { id:"qreadyprj1", format:"choice", text:"First car?", options:["Civic", "Corolla", "Jetta", "Camry"], answer:0 }] } });
  act(state, "geoSaveRound", { id:"greadyprj1", photo:{ id:"greadyprj1", w:1600, h:1200 }, lat:33.49, lng:-111.92,
    place:"Old Town", when:"2024-10-30T18" });
  act(state, "promptSave", { id:"ballot-prj", kind:"awards", questions:[{ id:"q-best", title:"Best dressed", nominees:null }] });
  act(state, "setOut", { player:"Jeremy", out:true });
  const frame = publicState(state, { isGm:true, player:"Brandon" });
  assert.deepEqual(sections(frame), sections(state));
  /* a guest's frame cannot answer the private rows: the sheet is the commissioner's */
  const seen = publicState(state, { isGm:false, player:"Khoa" });
  assert.equal(rowOf(seen, "venmo").have, 0, "Venmo never leaves for another guest");
  assert.equal(rowOf(seen, "trivia").have, 0, "the set list is the commissioner's");
});

test("the menu: Ready check in Now before the weekend, first in Setup once live, its value the count", () => {
  const where = f => commissionerMenu(f).find(section => section.items.some(item => item.id === "readyCheck"));
  assert.equal(where({}), undefined, "no fact, no row");
  const before = commissionerMenu({ readyCheck:"4 to do" });
  const now_ = before.find(section => section.id === "now");
  assert.deepEqual(now_.items.map(item => item.id), ["readyCheck"]);
  assert.deepEqual(now_.items[0], { id:"readyCheck", name:"Ready check", icon:"check", value:"4 to do" });
  assert.ok(!before.find(section => section.id === "setup").items.some(item => item.id === "readyCheck"));
  /* after the actionable rows of the moment */
  const busy = commissionerMenu({ readyCheck:"Ready", takeBacks:[{ id:"putt", name:"Long Putt" }] });
  assert.deepEqual(busy.find(section => section.id === "now").items.map(item => item.id), ["takeBack:putt", "readyCheck"]);
  const live = commissionerMenu({ readyCheck:"Ready", live:true, crownReady:true });
  assert.deepEqual(live.find(section => section.id === "now").items.map(item => item.id), ["crown"]);
  assert.equal(where({ readyCheck:"Ready", live:true }).id, "setup");
  assert.deepEqual(live.find(section => section.id === "setup").items.map(item => item.id).slice(0, 2), ["readyCheck", "gmDevices"]);
  assert.equal(live.find(section => section.id === "setup").items[0].value, "Ready");
});

test("the App: one menu id opens the sheet, loaded on first use, reading the same facts as the menu", () => {
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(app, /lazyPart\(\(\) => import\("\.\/features\/director\/ReadyCheck\.jsx"\), "ReadyCheck"\)/);
  assert.match(app, /COMMISSIONER_PARTS = \[[^\]]*ReadyCheck\]/, "warmed with the other commissioner sheets");
  assert.match(app, /case "readyCheck": return sheet\(id\)/);
  assert.match(app, /readyCheck:readyValue\(readyTodo\(readyCheck\(state, readyFacts\)\)\)/);
  assert.match(app, /<ReadyCheck state=\{state\} capabilities=\{capabilities\}[^>]*onOpen=\{menuItem\}/);
  assert.match(app, /\["gmMenu", "readyCheck", "settings"\]\.includes\(modalStack\.at\(-1\)\?\.type\)/, "the speaker is read when it opens");
});

/* ── the sheet ── */
const render = (state, props = {}) => renderToStaticMarkup(React.createElement(PlayerIdentityProvider, { profiles:state.profiles },
  React.createElement(ReadyCheck, { state, onClose:() => {}, onOpen:() => {}, ...props })));

test("the sheet: three sections of lamps, counts in one column, faces for a guest row part done", () => {
  const state = signedUp();
  ["Evan", "Khoa"].forEach(player => { state.profiles[player].venmo = player.toLowerCase(); });
  state.profiles.Evan.photoV = 1;
  act(state, "setAutopilot", { hold:true });
  const html = render(state, { capabilities:{ push:true }, tvs:[], tvsAt:Date.now() });
  assert.match(html, />Ready check</);
  for (const title of ["Guests", "Games", "Room"]) assert.match(html, new RegExp(`<span>${title}</span>`), title);
  /* rows that open a desk are buttons with a chevron; the rest are not targets */
  assert.match(html, /<button type="button" class="fd-ready-row is-ready"><span class="fd-insert" aria-hidden="true"><\/span><span class="fd-ready-label">Checked in/);
  assert.match(html, /<div class="fd-ready-row is-partial"><span class="fd-insert" aria-hidden="true"><\/span><span class="fd-ready-label">Photos/);
  assert.match(html, /<div class="fd-ready-row is-off[^"]*"><span class="fd-insert is-void" aria-hidden="true"><\/span><span class="fd-ready-label">Autopilot<\/span><span class="fd-ready-value">Paused<\/span>/);
  assert.match(html, /class="fd-ready-row is-missing"><span class="fd-insert" aria-hidden="true"><\/span><span class="fd-ready-label">Trivia/);
  assert.match(html, /<span class="fd-ready-count"><b>2<\/b><span>\/13<\/span><\/span>/, "Venmo 2/13");
  /* who a part-done row waits on: their faces, named for a screen reader */
  const faces = html.match(/<span class="fd-ready-faces" role="img" aria-label="([^"]+)">/g) || [];
  assert.equal(faces.length, 2, "Photos and Venmo; a row nobody has done shows no faces");
  assert.match(html, new RegExp(`aria-label="${ROSTER.filter(player => player !== "Evan").join(", ")}"`));
  assert.equal((html.match(/data-person="/g) || []).length, (ROSTER.length - 1) + (ROSTER.length - 2));
  /* no helper copy: labels, counts, state words */
  const text = html.replace(/<span class="fd-sr">[^<]*<\/span>/g, "").replace(/<[^>]+>/g, " ");
  assert.doesNotMatch(text, /—|!/);
  assert.equal(html.match(/<button type="button" class="fd-ready-row/g).length, 9,
    "Checked in, Jerseys, Flights, Venmo, Drinks, Trivia, Where and When, Awards, TV");
});

test("the sheet: a tap opens that row's desk by its menu id", () => {
  const state = signedUp();
  state.profiles.Evan.venmo = "evan";
  const opened = [], taps = [];
  /* the real handlers, caught as the render creates each row's button */
  const createElement = React.createElement;
  React.createElement = (type, props, ...children) => {
    if (type === "button" && String(props?.className || "").startsWith("fd-ready-row")) taps.push(props.onClick);
    return createElement(type, props, ...children);
  };
  try {
    render(state, { onOpen:id => opened.push(id), capabilities:{ audioCatalog:true, audioDirector:true }, tvs:[{ ageMs:0, sound:"on" }],
      tvsAt:Date.now(), speaker:{ ok:true, configured:true, connected:true, device:{ id:"d1", name:"Den" }, autoWinSongs:true } });
  } finally { React.createElement = createElement; }
  taps.forEach(tap => tap());
  assert.deepEqual(opened, ["attendance", "travelSheet", "audioDirector", "travelSheet", "travelSheet", "travelSheet",
    "trivia", "geo", "awards", "showControl", "showControl", "audioDirector", "audioDirector"]);
  const css = readFileSync(new URL("../src/features/director/ready-check.css", import.meta.url), "utf8");
  assert.match(css, /\.fd-ready-row \{[^}]*min-height:52px;/, "a 52px target, like the menu");
  assert.doesNotMatch(css, /#[0-9a-f]{3,6}\b/i, "tokens only");
  assert.match(css, /\.fd-ready-row\.is-partial \.fd-insert \{ --lamp:var\(--sun\); \}/);
  assert.match(css, /\.fd-ready-row\.is-missing \.fd-insert \{ background:var\(--lens-off\)/);
  /* a row with no count (Auto win songs) keeps its chevron in the chevrons' column */
  assert.match(css, /\.fd-ready-chevron \{ grid-column:4;/);
  assert.match(css, /\.fd-ready-count \{ grid-column:3;/);
});
