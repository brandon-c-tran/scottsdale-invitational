/* Where and When: the commissioner's photos, guessed live (a pin and a
   date and hour), scored GeoGuessr style in miles, revealed round by round,
   the top three posted as the event's result. Answers and others' guesses
   never reach a phone before their reveal. */
import test from "node:test";
import assert from "node:assert/strict";

import { EMPTY_STATE, ROSTER, allEventsOf, computeStandings, resolveCurrentContest } from "../shared/core.js";
import {
  GEO_ROUND_MS, cleanWhen, geoBeat, geoResultSlots, geoStandings, hoursApart, milesApart, projectGeo, scoreGuess,
  whenScore, whereScore,
} from "../shared/geo.js";
import { geoPlayersOf } from "../worker/geo.js";
import { publicState } from "../worker/publicState.js";
import { resolveDirector } from "../shared/show.js";
import { applyAction } from "./support/confirmed-start.mjs";

const [author, evan, khoa, sahil] = ROSTER;
let serial = 0;
const gm = (player = author) => ({ isGm:true, player, deviceId:"gm", actionId:`g${++serial}` });
const as = player => ({ isGm:false, player, deviceId:`d-${player}`, actionId:`p${++serial}` });
const act = (state, type, payload, ctx = gm()) => {
  const result = applyAction(state, type, payload, ctx);
  assert.equal(result.ok, true, `${type}: ${result.error}`);
  return result;
};
const refuse = (state, type, payload, ctx = gm()) => {
  const result = applyAction(state, type, payload, ctx);
  assert.equal(result.ok, false, `${type} should be refused`);
  return result.error;
};
const where = state => allEventsOf(state).find(ev => ev.id === "where");
/* Golden Gate Bridge, Times Square, the Strip */
const ROUNDS = [
  { id:"gaaaaaa1", photo:{ id:"gphoto01", w:1600, h:1200 }, lat:37.8199, lng:-122.4783, place:"Golden Gate Bridge",
    when:"2019-07-04T21", caption:"Fourth of July" },
  { id:"gaaaaaa2", photo:{ id:"gphoto02", w:1200, h:1600 }, lat:40.758, lng:-73.9855, place:"Times Square", when:"2021-12-31T23" },
  { id:"gaaaaaa3", photo:{ id:"gphoto03", w:1600, h:900 }, lat:36.1147, lng:-115.1728, place:"Las Vegas", when:"2023-03-18T02" },
];
function ready() {
  const state = structuredClone(EMPTY_STATE);
  for (const round of ROUNDS) act(state, "geoSaveRound", round);
  act(state, "announceEvent", { evId:"where" });
  const contest = resolveCurrentContest(state, where(state));
  act(state, "lockAndStart", { evId:"where", contestId:contest.id, contestRevision:contest.revision });
  return state;
}

test("scoring: miles and hours, GeoGuessr shaped", () => {
  assert.equal(whereScore(0), 5000);
  assert.ok(Math.abs(whereScore(10) - 4688) <= 2, "10 miles off");
  assert.ok(Math.abs(whereScore(100) - 2622) <= 2, "100 miles off");
  assert.ok(whereScore(1000) < 20, "1,000 miles off is nearly nothing");
  assert.equal(whenScore(0), 5000);
  assert.ok(whenScore(24) > 4950 && whenScore(24) < 4970, "a day off");
  assert.ok(Math.abs(whenScore(30 * 24) - 3894) <= 2, "a month off");
  assert.ok(whenScore(365 * 24) < 300, "a year off");
  assert.ok(Math.abs(milesApart(ROUNDS[0], ROUNDS[1]) - 2570) < 15, "SF to NYC");
  assert.equal(hoursApart("2019-07-04T21", "2019-07-05T01"), 4, "wall clock, no time zones");
  assert.equal(cleanWhen("2019-02-30T10"), null);
  assert.equal(cleanWhen("2019-02-28T24"), null);
  assert.equal(cleanWhen("2019-02-28T23"), "2019-02-28T23");
  const exact = scoreGuess(ROUNDS[0], { lat:ROUNDS[0].lat, lng:ROUNDS[0].lng, when:ROUNDS[0].when });
  assert.deepEqual([exact.where, exact.when, exact.total], [5000, 5000, 10000]);
});

test("the commissioner authors rounds; a bad pin, time or photo is refused", () => {
  const state = structuredClone(EMPTY_STATE);
  assert.equal(refuse(state, "geoSaveRound", ROUNDS[0], as(evan)), "Commissioner only");
  assert.equal(refuse(state, "geoSaveRound", { ...ROUNDS[0], lat:91 }), "Drop the answer pin");
  assert.equal(refuse(state, "geoSaveRound", { ...ROUNDS[0], when:"2019-07-04" }), "Set the date and hour");
  assert.equal(refuse(state, "geoSaveRound", { ...ROUNDS[0], photo:null }), "Add the photo");
  assert.equal(refuse(state, "geoSaveRound", { ...ROUNDS[0], place:"  " }), "Name the place");
  act(state, "geoSaveRound", ROUNDS[0]);
  act(state, "geoSaveRound", ROUNDS[1]);
  assert.equal(act(state, "geoSaveRound", ROUNDS[0]).extra.unchanged, true);
  act(state, "geoMoveRound", { id:ROUNDS[1].id, by:-1 });
  assert.deepEqual(state.geoRounds.map(round => round.id), [ROUNDS[1].id, ROUNDS[0].id]);
  act(state, "geoDeleteRound", { id:ROUNDS[1].id });
  assert.deepEqual(state.geoRounds.map(round => round.id), [ROUNDS[0].id]);
});

test("the game: start once under way, guess until the reveal, next, and the top three post", () => {
  const state = structuredClone(EMPTY_STATE);
  for (const round of ROUNDS) act(state, "geoSaveRound", round);
  assert.match(refuse(state, "geoStart", { evId:"where" }), /Lock and start/);
  act(state, "announceEvent", { evId:"where" });
  const contest = resolveCurrentContest(state, where(state));
  act(state, "lockAndStart", { evId:"where", contestId:contest.id, contestRevision:contest.revision });
  act(state, "geoStart", { evId:"where" });
  assert.equal(state.geo.author, author, "the author knows the answers");
  assert.equal(state.geo.closesAt - state.geo.startedAt, GEO_ROUND_MS);
  assert.ok(!geoPlayersOf(state).includes(author));
  assert.equal(refuse(state, "geoGuess", { roundId:ROUNDS[0].id, lat:1, lng:1, when:"2019-07-04T21" }, as(author)),
    "You are not playing this one");

  const r1 = ROUNDS[0].id;
  act(state, "geoGuess", { roundId:r1, lat:37.8, lng:-122.45, when:"2019-07-04T20" }, as(evan));
  act(state, "geoGuess", { roundId:r1, lat:34.05, lng:-118.24, when:"2018-07-04T20" }, as(khoa));
  act(state, "geoGuess", { roundId:r1, lat:37.8, lng:-122.4, when:"2019-07-05T20" }, as(evan)); // changed
  assert.equal(act(state, "geoGuess", { roundId:r1, lat:37.8, lng:-122.4, when:"2019-07-05T20" }, as(evan)).extra.unchanged, true);
  assert.equal(refuse(state, "geoNext", { roundId:r1 }), "Reveal this photo first");
  act(state, "geoReveal", { roundId:r1 });
  assert.equal(refuse(state, "geoGuess", { roundId:r1, lat:1, lng:1, when:"2019-07-04T21" }, as(sahil)), "That photo is closed");
  act(state, "geoNext", { roundId:r1 });
  assert.equal(act(state, "geoNext", { roundId:r1 }).extra.unchanged, true, "a retried Next after the room moved on");
  assert.equal(state.geo.index, 1);

  const r2 = ROUNDS[1].id;
  act(state, "geoGuess", { roundId:r2, lat:40.75, lng:-73.99, when:"2021-12-31T23" }, as(khoa));
  act(state, "geoReveal", { roundId:r2 });
  act(state, "geoNext", { roundId:r2 });
  const r3 = ROUNDS[2].id;
  act(state, "geoGuess", { roundId:r3, lat:36.1, lng:-115.17, when:"2023-03-18T01" }, as(sahil));
  act(state, "geoReveal", { roundId:r3 });

  const rows = geoStandings(state.geo, state.geoRounds, geoPlayersOf(state));
  /* Khoa: LA a year off, then Times Square to the hour; Sahil: one near-
     perfect Vegas; Evan: a few miles and a day off on the bridge */
  assert.deepEqual(rows.slice(0, 3).map(row => row.player), [khoa, sahil, evan]);
  assert.ok(rows[0].total > 10000 && rows[1].total > rows[2].total);
  const before = computeStandings(state).find(row => row.player === khoa).pts;
  const finished = act(state, "geoFinish", { evId:"where" });
  assert.deepEqual(finished.extra.slots, [[khoa], [sahil], [evan]]);
  assert.deepEqual(state.results.where.slots, [[khoa], [sahil], [evan]]);
  assert.equal(computeStandings(state).find(row => row.player === khoa).pts, before + 400);
  assert.equal(state.geo.phase, "done");
  assert.equal(geoBeat(state, where(state)), null, "nothing left to direct");
});

test("a draft is a guess: a pin alone or a date alone counts for its part; Lock in stays", () => {
  const state = ready();
  act(state, "geoStart", { evId:"where" });
  const r1 = ROUNDS[0].id;
  assert.equal(refuse(state, "geoGuess", { roundId:r1, lat:null, lng:null, when:null }, as(evan)), "Drop your pin or set the date");
  act(state, "geoGuess", { roundId:r1, lat:37.82, lng:-122.48, when:null }, as(evan));
  act(state, "geoGuess", { roundId:r1, lat:null, lng:null, when:"2019-07-04T21" }, as(khoa));
  act(state, "geoGuess", { roundId:r1, lat:37.82, lng:-122.48, when:"2019-07-04T21", done:true }, as(sahil));
  act(state, "geoGuess", { roundId:r1, lat:37.8, lng:-122.48, when:"2019-07-04T21", done:false }, as(sahil));
  assert.equal(state.geo.guesses[r1][sahil].done, true, "Lock in stays once given");
  act(state, "geoReveal", { roundId:r1 });
  const pinOnly = scoreGuess(ROUNDS[0], state.geo.guesses[r1][evan]);
  assert.ok(pinOnly.where > 4900 && pinOnly.when === 0 && pinOnly.hours === null);
  const dateOnly = scoreGuess(ROUNDS[0], state.geo.guesses[r1][khoa]);
  assert.ok(dateOnly.where === 0 && dateOnly.miles === null && dateOnly.when === 5000);
});

test("result slots: one winner, then the next two ranks", () => {
  const rows = [
    { player:"A", rank:1, guessed:3 }, { player:"B", rank:2, guessed:3 }, { player:"C", rank:2, guessed:3 },
    { player:"D", rank:4, guessed:3 }, { player:"E", rank:5, guessed:3 }, { player:"F", rank:6, guessed:0 },
  ];
  assert.deepEqual(geoResultSlots(rows), [["A"], ["B", "C"], ["D"]]);
  assert.equal(geoResultSlots([{ player:"A", rank:1, guessed:0 }]), null, "nobody guessed");
});

test("privacy: no answer, upcoming photo or other guess reaches a phone before its reveal", () => {
  const state = ready();
  const before = publicState(state, { player:evan });
  assert.deepEqual(before.geoRounds, [], "not started: nothing");
  assert.equal(before.geo, null);
  act(state, "geoStart", { evId:"where" });
  const r1 = ROUNDS[0].id;
  act(state, "geoGuess", { roundId:r1, lat:37.8, lng:-122.45, when:"2019-07-04T20" }, as(evan));
  act(state, "geoGuess", { roundId:r1, lat:34.05, lng:-118.24, when:"2018-07-04T20" }, as(khoa));
  const live = publicState(state, { player:evan });
  assert.deepEqual(live.geoRounds, [{ id:r1, n:1, photo:ROUNDS[0].photo }], "the photo only");
  assert.deepEqual(Object.keys(live.geo.guesses[r1]), [evan], "only your own guess");
  assert.deepEqual([live.geo.lockedIn, [...live.geo.drafting].sort()], [[], [evan, khoa].sort()],
    "who is still guessing, never where");
  act(state, "geoGuess", { roundId:r1, lat:37.8, lng:-122.45, when:"2019-07-04T20", done:true }, as(evan));
  assert.deepEqual(publicState(state, { player:sahil }).geo.lockedIn, [evan]);
  assert.equal(publicState(state, { player:sahil }).geo.guessed, 1);
  assert.equal(live.geo.total, 3);
  assert.deepEqual(live.geo.order, [r1], "upcoming rounds stay hidden");
  assert.ok(!JSON.stringify(live).includes("Times Square") && !JSON.stringify(live).includes("Golden Gate"));
  const tv = publicState(state, {});
  assert.deepEqual(tv.geo.guesses, {}, "the TV sees no guesses before the reveal");
  act(state, "geoReveal", { roundId:r1 });
  const shown = publicState(state, { player:sahil });
  assert.equal(shown.geoRounds[0].place, "Golden Gate Bridge");
  assert.equal(shown.geoRounds[0].caption, "Fourth of July");
  assert.deepEqual(Object.keys(shown.geo.guesses[r1]).sort(), [evan, khoa].sort());
  const host = publicState(state, { isGm:true });
  assert.equal(host.geoRounds.length, 3, "the commissioner keeps every round");
  /* projection never invents a game */
  assert.deepEqual(projectGeo(null, ROUNDS, { player:evan }), { geo:null, geoRounds:[] });
});

test("the director runs it: start, reveal, next, post result", () => {
  const state = ready();
  const pill = () => resolveDirector(state, allEventsOf(state)).nextAction;
  assert.deepEqual([pill().type, pill().label, pill().subject], ["geo-start", "Start game", "Where and When"]);
  act(state, "geoStart", { evId:"where" });
  assert.deepEqual([pill().type, pill().subject, pill().roundId], ["geo-reveal", "Photo 1 of 3", ROUNDS[0].id]);
  act(state, "geoReveal", { roundId:ROUNDS[0].id });
  assert.deepEqual([pill().type, pill().label], ["geo-next", "Next photo"]);
  act(state, "geoNext", { roundId:ROUNDS[0].id });
  act(state, "geoReveal", { roundId:ROUNDS[1].id });
  act(state, "geoNext", { roundId:ROUNDS[1].id });
  act(state, "geoGuess", { roundId:ROUNDS[2].id, lat:36, lng:-115, when:"2023-03-18T02" }, as(evan));
  act(state, "geoReveal", { roundId:ROUNDS[2].id });
  assert.deepEqual([pill().type, pill().label], ["geo-finish", "Post result"]);
  act(state, "geoFinish", { evId:"where" });
  assert.notEqual(pill()?.type, "geo-finish");
});

test("photos: only the commissioner uploads; a photo is served once its round is shown; EXIF never survives", async () => {
  const { Tournament } = await import("../worker/tournament.js");
  const entries = new Map();
  const storage = {
    async get(key) { return entries.get(key); }, async put(key, value) {
      if (typeof key === "object") for (const [k, v] of Object.entries(key)) entries.set(k, v); else entries.set(key, value);
    },
    async delete(keys) { for (const key of [].concat(keys)) entries.delete(key); },
    async list({ prefix = "" } = {}) { return new Map([...entries].filter(([k]) => k.startsWith(prefix))); },
    async transaction(fn) { return fn(storage); }, async setAlarm() {},
  };
  const tournament = new Tournament({ blockConcurrencyWhile() {}, getWebSockets:() => [], storage, waitUntil() {} },
    { APP_ENV:"local", QA_ENABLED:"true", PROGRESS_RESET_ENABLED:"true" });
  await tournament.hydrateFromStorage();
  tournament.gmTokenId = async token => token === "gm" ? "gm" : null;
  /* a JPEG carrying an EXIF segment with a place in it */
  const exif = [0xFF, 0xE1, 0x00, 0x11, ...Buffer.from("GPS 37.8 -122.4")];
  const sof = [0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x02, 0x58, 0x03, 0x20, 0x01, 0x01, 0x11, 0x00];
  const jpeg = new Uint8Array([0xFF, 0xD8, ...exif, ...sof, 0xFF, 0xDA, 0x00, 0x08, 1, 2, 3, 4, 5, 6, 0xFF, 0xD9]);
  const upload = token => {
    const form = new FormData();
    form.append("photo", new Blob([jpeg], { type:"image/jpeg" }), "photo.jpg");
    return tournament.fetch(new Request("http://localhost/api/geo/photo", { method:"POST",
      headers:token ? { Authorization:`Bearer ${token}` } : {}, body:form }));
  };
  assert.equal((await upload(null)).status, 403);
  const body = await (await upload("gm")).json();
  assert.equal(body.ok, true, JSON.stringify(body));
  assert.deepEqual([body.photo.w, body.photo.h], [800, 600]);
  const stored = [...entries].find(([key]) => key.startsWith("moment:geo:"))[1];
  assert.ok(!Buffer.from(stored).includes("GPS"), "the EXIF segment is gone");
  const read = token => tournament.fetch(new Request(`http://localhost/api/geo/photo/${body.photo.id}`,
    { headers:token ? { Authorization:`Bearer ${token}` } : {} }));
  assert.equal((await read(null)).status, 404, "not shown yet: nobody but the commissioner");
  assert.equal((await read("gm")).status, 200);
  tournament.state.geoRounds = [{ ...ROUNDS[0], photo:body.photo }];
  tournament.state.geo = { eventId:"where", order:[ROUNDS[0].id], index:0, phase:"guess", guesses:{} };
  assert.equal((await read(null)).status, 200, "on the TV now: anyone");
});

test("a reset keeps the photos and clears the game; restart drops the guesses", () => {
  const state = ready();
  act(state, "geoStart", { evId:"where" });
  act(state, "geoRestart", { evId:"where" });
  assert.equal(state.geo, null);
  assert.equal(state.geoRounds.length, 3);
  act(state, "geoStart", { evId:"where" });
  const reset = applyAction(state, "resetTournament", { confirm:"RESET_GAME_PROGRESS" }, { ...gm(), progressReset:true });
  assert.equal(reset.ok, true, reset.error);
  assert.equal(state.geo, null);
  assert.equal(state.geoRounds.length, 3);
});

/* "stuck at the bottom" (Oct 2): once the result posts the game is over on
   every phone. Before, the game stayed "done" in state, so the full-screen
   sheet reopened itself on the done frame (a new key after the last reveal)
   and Home's "+N this photo" row stayed forever. */
test("the game ends on the phone when its result posts: no sheet, no Home row", async () => {
  const { buildSync } = await import("esbuild");
  const { fileURLToPath } = await import("node:url");
  const { Module } = await import("node:module");
  const React = (await import("react")).default;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { geoView } = await import("../src/features/geo/geoModel.js");
  const root = fileURLToPath(new URL("../", import.meta.url));
  const out = buildSync({ stdin:{ contents:'export { GeoHome, GeoPlaySheet } from "./src/features/geo/GeoPlay.jsx"; export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";', resolveDir:root, loader:"jsx" },
    bundle:true, platform:"node", format:"cjs", external:["react", "react-dom", "maplibre-gl", "leaflet"], loader:{ ".css":"empty" },
    write:false, logLevel:"silent" });
  const mod = new Module(fileURLToPath(new URL("where-when-ui.cjs", import.meta.url)));
  mod.filename = mod.id; mod.paths = Module._nodeModulePaths(root);
  mod._compile(out.outputFiles[0].text, mod.filename);
  const { GeoHome, GeoPlaySheet, PlayerIdentityProvider } = mod.exports;
  const wrap = (s, node) => renderToStaticMarkup(React.createElement(PlayerIdentityProvider, { profiles:s.profiles || {} }, node));

  const state = ready();
  act(state, "geoStart", { evId:"where" });
  for (const [i, round] of ROUNDS.entries()) {
    act(state, "geoGuess", { roundId:round.id, lat:round.lat + .1, lng:round.lng, when:round.when }, as(khoa));
    act(state, "geoReveal", { roundId:round.id });
    if (i < ROUNDS.length - 1) act(state, "geoNext", { roundId:round.id });
  }
  const phone = () => publicState(state, { player:khoa });
  const now = Number(state.geo.closesAt) + 60000;
  const home = s => wrap(s, React.createElement(GeoHome, { state:s, me:khoa, onOpen() {}, now }));
  const sheet = s => wrap(s, React.createElement(GeoPlaySheet, { state:s, me:khoa, now, onGuess:async () => ({ ok:true }) }));
  /* the last reveal: the row and the reveal are there */
  assert.equal(geoView(phone(), khoa, now).finished, false);
  assert.match(home(phone()), /fd-geo-home/);
  assert.match(sheet(phone()), /fd-geo-game is-reveal/);
  act(state, "geoFinish", { evId:"where" });
  assert.equal(geoView(phone(), khoa, now).finished, true);
  assert.equal(home(phone()), "", "Home's row goes with the game");
  assert.equal(sheet(phone()), "", "the game's sheet does not reopen on the done frame");
});
