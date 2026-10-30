/* Karaoke on the slate (docs/KARAOKE.md): a slate the commissioner saved
   before Karaoke existed loads with it on Friday night, its mark is never
   borrowed by an added event, and the commissioner's Karaoke desk shows
   who has a song and whether its video plays, titles hidden until asked. */
import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EMPTY_STATE, ROSTER, allEventsOf } from "../shared/core.js";
import { cleanKaraokeTrack } from "../shared/karaoke.js";
import { parseQaTarget } from "../shared/qa.js";
import { hydrateStoredState } from "../worker/state.js";
import { publicState } from "../worker/publicState.js";
import { readyCheck, readyRows } from "../src/features/director/readyCheck.js";
import {
  KARAOKE_PROBLEMS, karaokeChecked, karaokeDeskRows, karaokeProblem, karaokeSongCount,
} from "../src/features/karaoke/deskModel.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const compiled = buildSync({
  stdin:{ contents:`export { KaraokeDesk } from "./src/features/karaoke/KaraokeDesk.jsx";
export { GameMark, GAME_MARK_IDS } from "./src/ui/GameMark.jsx";
export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";`, resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react", "react-dom"], loader:{ ".css":"empty" }, write:false, logLevel:"silent",
});
const mod = new Module(fileURLToPath(new URL("karaoke-registry.cjs", import.meta.url)));
mod.filename = mod.id; mod.paths = Module._nodeModulePaths(root);
mod._compile(compiled.outputFiles[0].text, mod.filename);
const { KaraokeDesk, GameMark, GAME_MARK_IDS, PlayerIdentityProvider } = mod.exports;

const ids = state => allEventsOf(state).map(ev => ev.id);
/* the order a Reorder saved before the karaoke build: every event's id but Karaoke's */
const savedBefore = () => ids(structuredClone(EMPTY_STATE)).filter(id => id !== "karaoke");
const stored = (order, extra = {}) => ({ ...structuredClone(EMPTY_STATE), eventOrder:order, ...extra });

test("a slate saved before Karaoke loads with it on Friday night, after Where and When, never after the finale", () => {
  const before = savedBefore();
  const old = stored(before);
  /* unplaced, a missing id sorts after the stored ids of its own day (the
     slate reads by day first), so even before placement it is Friday's last,
     never after the finale */
  assert.equal(ids(old).indexOf("karaoke"), ids(old).indexOf("where") + 1, "unplaced: after the stored Friday events");
  assert.notEqual(ids(old).at(-1), "karaoke");

  const loaded = hydrateStoredState(old);
  assert.deepEqual(loaded.eventOrder, [...before.slice(0, before.indexOf("where") + 1), "karaoke",
    ...before.slice(before.indexOf("where") + 1)]);
  const order = ids(loaded);
  assert.equal(order.indexOf("karaoke"), order.indexOf("where") + 1);
  assert.deepEqual(allEventsOf(loaded).slice(0, order.indexOf("karaoke") + 1).map(ev => ev.session),
    Array(order.indexOf("karaoke") + 1).fill("fri"), "Friday night, before Saturday's first event");
  assert.equal(parseQaTarget(loaded, "session:fri").evId, "karaoke", "Friday ends on it");
  assert.deepEqual(hydrateStoredState(loaded).eventOrder, loaded.eventOrder, "placed once");
});

test("placing Karaoke: after the order's last Friday event without Where and When, first with none; never twice or skipped", () => {
  /* Where and When skipped when the slate was reordered (a Reorder leaves a skipped event out) */
  const noWhere = savedBefore().filter(id => id !== "where");
  const placed = hydrateStoredState(stored(["die", "putt", ...noWhere.filter(id => !["die", "putt"].includes(id))],
    { shelved:{ where:true } }));
  assert.deepEqual(placed.eventOrder.slice(0, 3), ["die", "putt", "karaoke"]);
  /* no Friday event in the order at all: Friday comes first */
  const saturday = savedBefore().filter(id => !["putt", "die", "where"].includes(id));
  assert.equal(hydrateStoredState(stored(saturday)).eventOrder[0], "karaoke");
  /* Karaoke skipped: a Reorder left it out on purpose, so it stays out */
  assert.deepEqual(hydrateStoredState(stored(savedBefore(), { shelved:{ karaoke:true } })).eventOrder, savedBefore());
  /* an order that already has it (the commissioner's own) and no order at all stay as they are */
  const own = ["karaoke", ...savedBefore()];
  assert.deepEqual(hydrateStoredState(stored(own)).eventOrder, own);
  assert.deepEqual(hydrateStoredState(stored([])).eventOrder, []);
  assert.deepEqual(hydrateStoredState(undefined).eventOrder, []);
});

test("the mark: a mic of its own, never offered under Looks like", () => {
  const draw = id => renderToStaticMarkup(React.createElement(GameMark, { id, size:54 }));
  assert.notEqual(draw("karaoke"), draw("no-such-game"), "not the chip fallback");
  assert.ok(!GAME_MARK_IDS.includes("karaoke"), "an added event cannot borrow the in-app game");
  assert.ok(GAME_MARK_IDS.includes("where") && GAME_MARK_IDS.includes("trivia"), "the rest stay borrowable");
});

/* a guest's karaoke song as the profile keeps it */
let songSeq = 0;
const song = (name, artists = ["The Band"]) => {
  const n = String(++songSeq).padStart(2, "0");
  const trackId = `deskKaraokeTrack${n}`.padEnd(22, "x");
  return cleanKaraokeTrack({ provider:"spotify", trackId, uri:`spotify:track:${trackId}`, name, artists, durationMs:215000,
    video:{ id:`deskVideo${n}`, title:`${name} karaoke`, channel:"Stingray Karaoke", seconds:220 },
    alts:[{ id:`deskAltVd${n}`, title:`${name} karaoke`, channel:"KaraFun", seconds:224 }] }, { now:1 });
};
function withSongs() {
  const state = structuredClone(EMPTY_STATE);
  ROSTER.forEach(player => { state.profiles[player] = { display:player }; });
  state.profiles.Evan.karaokeTrack = song("Mr. Brightside", ["The Killers"]);
  state.profiles.Khoa.karaokeTrack = song("Bohemian Rhapsody - Remastered 2011", ["Queen"]);
  state.profiles.Sahil.karaokeTrack = song("Africa", ["TOTO"]);
  state.profiles.Adi.karaokeTrack = song("Under Pressure", ["Queen", "David Bowie"]);
  return state;
}

test("the desk's rows: every roster player, lamps from the profile and the last check", () => {
  const state = withSongs();
  assert.ok(Object.values(state.profiles).filter(profile => profile.karaokeTrack).every(profile => profile.karaokeTrack.video));
  const rows = karaokeDeskRows(state);
  assert.deepEqual(rows.map(row => row.player), ROSTER);
  assert.deepEqual(rows.filter(row => row.lamp === "partial").map(row => row.player), ["Sahil", "Khoa", "Adi", "Evan"]
    .sort((a, b) => ROSTER.indexOf(a) - ROSTER.indexOf(b)), "picked, not checked: amber");
  assert.ok(rows.filter(row => !row.song).every(row => row.lamp === "missing" && !row.problem), "no song: unlit");
  assert.equal(karaokeSongCount(state), 4);

  /* the check's answer, kept against the video it checked */
  const checks = karaokeChecked(state, { Evan:{ ok:true, code:null, video:0 }, Khoa:{ ok:true, code:"removed", video:1 },
    Sahil:{ ok:false, code:"embedding", video:null }, Ben:{ ok:false, code:"none", video:null } });
  assert.deepEqual(Object.keys(checks).sort(), ["Evan", "Khoa", "Sahil"], "nothing kept for a player with no song");
  const lamp = (list, player) => list.find(row => row.player === player);
  const after = karaokeDeskRows(state, checks);
  assert.equal(lamp(after, "Evan").lamp, "ready");
  assert.equal(lamp(after, "Khoa").lamp, "ready", "an alternate plays: the game takes it");
  assert.deepEqual([lamp(after, "Sahil").lamp, lamp(after, "Sahil").problem], ["partial", KARAOKE_PROBLEMS.embedding]);
  assert.deepEqual([lamp(after, "Adi").lamp, lamp(after, "Adi").checked], ["partial", false], "not in the check: unchecked");
  /* a song saved after the check reads unchecked again */
  state.profiles.Evan.karaokeTrack = song("Wonderwall", ["Oasis"]);
  assert.deepEqual([lamp(karaokeDeskRows(state, checks), "Evan").lamp, lamp(karaokeDeskRows(state, checks), "Evan").checked],
    ["partial", false]);
  assert.equal(karaokeProblem("nonsense"), "Will not play");
  for (const words of Object.values(KARAOKE_PROBLEMS)) assert.ok(words.split(" ").length <= 4 && !/[.!—]/.test(words), words);

  /* Not coming leaves the desk and the count */
  state.out = { Evan:true };
  assert.ok(!karaokeDeskRows(state).some(row => row.player === "Evan"));
  assert.equal(karaokeSongCount(state), 3);
});

test("the Ready check's Karaoke songs row counts what the desk counts, from the commissioner's own frame", () => {
  const state = withSongs();
  const row = sections => readyRows(sections).find(item => item.id === "karaoke");
  const caps = { karaoke:true };
  const frame = publicState(state, { isGm:true, player:"Brandon" });
  assert.equal(row(readyCheck(frame, { capabilities:caps })).have, karaokeSongCount(state));
  assert.equal(row(readyCheck(frame, { capabilities:caps })).opens, "karaoke", "opens the desk");
});

/* ── the desk ── */
const say = console.error;
console.error = (...args) => /useLayoutEffect/.test(String(args[0])) ? undefined : say(...args);
const render = (state, props = {}) => renderToStaticMarkup(React.createElement(PlayerIdentityProvider, { profiles:state.profiles },
  React.createElement(KaraokeDesk, { state, check:async () => ({ ok:false }), ...props })));

test("the desk: the count, Show songs and Check videos, a lamp per player, titles hidden until shown", () => {
  const state = withSongs();
  const hidden = render(state);
  assert.match(hidden, /<div class="fd-karaoke-desk-count" aria-label="4 of 13 songs picked"><strong>4<\/strong><span>of 13<\/span>/);
  assert.match(hidden, /aria-pressed="false"[^>]*>Show songs<\/button>/);
  assert.match(hidden, />Check videos<\/button>/);
  assert.equal((hidden.match(/<li class="fd-karaoke-desk-row/g) || []).length, ROSTER.length);
  assert.equal((hidden.match(/fd-karaoke-desk-row is-partial/g) || []).length, 4);
  assert.equal((hidden.match(/fd-karaoke-desk-row is-missing/g) || []).length, ROSTER.length - 4);
  for (const title of ["Mr. Brightside", "Bohemian Rhapsody", "Africa", "The Killers"])
    assert.ok(!hidden.includes(title), `${title}: hidden until Show songs (Brandon sings too)`);

  const shown = render(state, { initiallyShown:true });
  assert.match(shown, /aria-pressed="true"[^>]*>Hide songs<\/button>/);
  assert.match(shown, /<span class="fd-karaoke-desk-song">Bohemian Rhapsody - Remastered 2011<\/span><span class="fd-karaoke-desk-artist">Queen<\/span>/);
  assert.match(shown, /<span class="fd-karaoke-desk-artist">Queen, David Bowie<\/span>/);

  const checked = render(state, { initialChecks:karaokeChecked(state, { Evan:{ ok:true, video:0 }, Sahil:{ ok:false, code:"embedding" } }) });
  assert.equal((checked.match(/fd-karaoke-desk-row is-ready/g) || []).length, 1);
  assert.match(checked, /<span class="fd-karaoke-desk-problem">YouTube only<\/span>/);
  /* nobody has a song: nothing to check */
  const empty = render(structuredClone(EMPTY_STATE));
  assert.match(empty, /<button disabled=""[^>]*>Check videos<\/button>/);
  /* no helper copy: names, the count, the two controls, state words */
  const text = checked.replace(/<span class="fd-sr">[^<]*<\/span>/g, "").replace(/<[^>]+>/g, " ");
  assert.doesNotMatch(text, /—|!/);
});

test("the desk's styles: tokens only, the Ready check's lamps, no row cut short", () => {
  const css = readFileSync(new URL("../src/features/karaoke/karaokeDesk.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(/i, "tokens only");
  /* the row's own lamp (its child), never the lamp of how a song plays inside it */
  assert.match(css, /\.fd-karaoke-desk-row > \.fd-insert \{ --lamp:var\(--lamp-info\); \}/, "cyan: the video plays");
  assert.match(css, /\.fd-karaoke-desk-row\.is-partial > \.fd-insert \{ --lamp:var\(--sun\); \}/, "amber: unchecked or will not play");
  assert.match(css, /\.fd-karaoke-desk-row\.is-missing > \.fd-insert \{ background:var\(--lens-off\)/, "unlit: no song");
  assert.match(css, /\.fd-karaoke-desk-row\.is-singing > \.fd-insert \{ --lamp:var\(--lamp-live\); \}/, "magenta: singing now");
  assert.match(css, /\.fd-karaoke-desk-problem \{[^}]*color:var\(--clay-text\)/);
  assert.doesNotMatch(css, /text-overflow\s*:/, "a long title wraps");
  assert.match(css, /\.fd-karaoke-desk-song \{ overflow-wrap:anywhere;/);
});

test("the App: the desk loads on first use, warmed with the commissioner's sheets, opened by its menu id", () => {
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(app, /lazyPart\(\(\) => import\("\.\/features\/karaoke\/KaraokeDesk\.jsx"\), "KaraokeDesk"\)/);
  assert.match(app, /COMMISSIONER_PARTS = \[[^\]]*KaraokeDesk, ReadyCheck\]/, "ReadyCheck stays last");
  assert.match(app, /\n\s*case "karaoke": return sheet\("karaokeDesk"\);\r?\n/);
  assert.match(app, /karaoke:capabilities\.karaoke === true, karaokeSongs:karaokeSongCount\(state\)/);
  assert.match(app, /modal\?\.type === "karaokeDesk" && <Sheet title="Karaoke"/);
  const client = readFileSync(new URL("../src/lib/client.js", import.meta.url), "utf8");
  assert.match(client, /export const karaokeCheck = \(\) => momentRequest\("\/api\/admin\/karaoke\/check"/);
});
