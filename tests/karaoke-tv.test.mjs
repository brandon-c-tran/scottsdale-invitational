/* Karaoke on the TV (docs/KARAOKE.md): the stages drawn through the real
   TVMode over games built from the contract (dev/fit/karaokeFixtures.js,
   projected as a TV's frame carries them), the takeover while a song plays
   and nothing over the video's box, the reload gate, the room's cues per
   stage and none during a song, the player's controller against a
   stand-in IFrame API (cue, play on the server clock, a late TV loading
   where the room is, blocked, an error, the end), the TV report's client
   side and the commissioner's line, the kit's Legendary chime, and the
   stylesheet's tokens and 24px floor. */
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import { Module } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { allEventsOf, computeStandings, presentPlayers } from "../shared/core.js";
import {
  KARAOKE_LEGENDARY_MS, KARAOKE_ORDER_HOLD_MS, KARAOKE_REVEAL_LEAD_MS, karaokeRevealSchedule, karaokeSchedule,
  karaokeSinger, karaokeSongTitle, karaokeTurn, karaokeVideoKey, karaokeVideoOf,
} from "../shared/karaoke.js";
import { karaokeStage } from "../dev/fit/karaokeFixtures.js";
import {
  KARAOKE_DEAL, KARAOKE_STRIP, KARAOKE_UP_BEATS, KARAOKE_VIDEO_BOX, karaokeDealSlots, karaokeNextInstant, karaokeQueue, karaokeRain,
  karaokeRevealColumns, karaokeRevealRows, karaokeSongOn, karaokeTitleFit, karaokeTvBusy, karaokeTvStage, karaokeVideoPlan,
} from "../src/features/tv/karaokeTv.js";
import { karaokeClockCues, karaokeCues, karaokeRoomSnapshot } from "../src/features/tv/karaokeSound.js";
import { roomSnapshot, roomStep } from "../src/features/tv/roomSound.js";
import { createKaraokeController, karaokePlayerOn, KARAOKE_PLAYER_VARS } from "../src/features/tv/karaokePlayer.js";
import { tvHealthLine } from "../src/features/director/tvHealth.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const NOW = 1_900_000_000_000;
const stage = name => karaokeStage(name, { now:NOW });
/* the server renderer's note about layout effects (the reels measure in the browser) */
const say = console.error;
console.error = (...args) => /useLayoutEffect/.test(String(args[0])) ? undefined : say(...args);

const compiled = buildSync({
  stdin:{ contents:`export { TVMode } from "./src/features/tv/TVMode.jsx";
    export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";`, resolveDir:ROOT, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react", "react-dom", "qrcode-generator", "three", "jsqr"],
  loader:{ ".css":"empty" }, write:false, logLevel:"silent",
});
const ui = new Module(fileURLToPath(new URL("karaoke-tv-ui.cjs", import.meta.url)));
ui.filename = ui.id;
ui.paths = Module._nodeModulePaths(ROOT);
ui._compile(compiled.outputFiles[0].text, ui.filename);
const { TVMode, PlayerIdentityProvider } = ui.exports;
const tv = (state, now = NOW) => renderToStaticMarkup(React.createElement(PlayerIdentityProvider, { profiles:state.profiles },
  React.createElement(TVMode, { standings:computeStandings(state), state, events:allEventsOf(state), onDeckEv:null, allTied:false,
    champion:null, coChamps:[], showControlEnabled:false, connection:{ ready:true, connected:true, status:"open", version:1 },
    onExit:() => {}, now })));
const canvasOf = html => /<div class="tv-canvas[^"]*"[^>]*>/.exec(html)?.[0] || "";

/* ── the stages ── */

test("the fixtures stand each moment where the contract puts it, projected as a TV's frame carries it", () => {
  const want = { pick:"pick", order:"order", up:"up", singing:"singing", practice:"singing", failed:"singing", voting:"voting",
    legendary:"legendary", "reveal-mid":"reveal", "reveal-podium":"reveal" };
  for (const [name, tvStage] of Object.entries(want)) {
    const game = stage(name).karaoke;
    assert.equal(karaokeTvStage(game, NOW), tvStage, name);
    assert.equal("votes" in game, false, `${name}: a TV never gets a vote`);
    assert.equal(JSON.stringify(game).includes("\"tier\""), false, `${name}: nor a tier`);
    /* each song only once its singer is up */
    if (game.phase === "turns") assert.deepEqual(Object.keys(game.songs).sort(), game.order.slice(0, game.index + 1).sort(), name);
  }
  /* the song holds the room while it plays, a practice song and a failed video too; the vote does not */
  for (const name of ["singing", "practice", "failed"]) assert.equal(karaokeSongOn(stage(name).karaoke, NOW), true, name);
  for (const name of ["pick", "order", "up", "voting", "legendary", "reveal-mid"]) assert.equal(karaokeSongOn(stage(name).karaoke, NOW), false, name);
  /* the reload waits from the first singer up to the result */
  assert.equal(karaokeTvBusy(stage("pick").karaoke), false);
  for (const name of ["order", "up", "singing", "voting", "reveal-podium"]) assert.equal(karaokeTvBusy(stage(name).karaoke), true, name);
});

test("the fit audit's karaoke views build, each on its own instant", async () => {
  const { TV_SCENARIOS, buildScenario } = await import("../dev/fit/scenarios.js");
  const ids = TV_SCENARIOS.map(spec => spec.id).filter(id => id.startsWith("tv-karaoke-"));
  assert.deepEqual(ids, ["tv-karaoke-pick", "tv-karaoke-order", "tv-karaoke-up", "tv-karaoke-singing", "tv-karaoke-practice",
    "tv-karaoke-failed", "tv-karaoke-voting", "tv-karaoke-legendary", "tv-karaoke-reveal-mid", "tv-karaoke-reveal-podium"]);
  for (const id of ids) {
    const built = buildScenario(TV_SCENARIOS, id);
    assert.equal(built.at?.karaoke, 0, id);
    assert.ok(built.state.karaoke?.id && Number(built.state.updatedAt) > 0, id);
  }
  assert.match(read("dev/fit-tv.jsx"), /if \(at\.karaoke !== undefined\) return \(Number\(state\.updatedAt\) \|\| Date\.now\(\)\) \+ at\.karaoke;/);
});

test("every stage draws through the real TV, the song alone on the stage with the chrome out", () => {
  const cases = {
    pick:[/Pick your song/, /tv-karaoke-ring/, /8 of 13/],
    order:[/Running order/, /tv-karaoke-ticket is-first/],
    up:[/Up next/, /Total Eclipse<\/span><span>of the Heart/, /Bonnie Tyler/, /On deck/],
    singing:[/class="tv-karaoke-video"><\/div>/, /tv-karaoke-standin/, /tv-karaoke-strip/],
    practice:[/tv-karaoke-card/, /tv-karaoke-drain/],
    failed:[/tv-karaoke-card/, /Total Eclipse/],
    voting:[/>Vote</, /Super Poop/, /Legendary/, /8 of 12/],
    legendary:[/tv-karaoke-rain/, /tv-karaoke-legend-word[^>]*>Legendary</],
    "reveal-mid":[/Results/, /is-waiting/],
    "reveal-podium":[/Results/, /tv-karaoke-row is-first/],
  };
  for (const [name, patterns] of Object.entries(cases)) {
    const state = stage(name);
    const html = tv(state);
    assert.match(html, new RegExp(`data-karaoke="${karaokeTvStage(state.karaoke, NOW)}"`), name);
    for (const pattern of patterns) assert.match(html, pattern, `${name}: ${pattern}`);
    assert.match(html, /tv-mast-event[^>]*>Karaoke</, `${name}: the masthead names the event`);
    const canvas = canvasOf(html);
    const song = ["singing", "practice", "failed"].includes(name);
    /* the song takes the room: the chrome steps out, no chase, so the frame's lamps are out too */
    assert.equal(/data-takeover="karaoke"/.test(canvas), song, `${name}: the takeover`);
    assert.equal(/data-chase/.test(canvas), false, `${name}: no chase`);
    /* a still never builds a player, and never reaches YouTube */
    assert.doesNotMatch(html, /<iframe|i\.ytimg\.com|youtube\.com/, `${name}: no YouTube in a still`);
    assert.doesNotMatch(html, /—/, `${name}: no em dash`);
  }
  /* the up screen: the clean title in the hero cut, its two lines balanced; the song's
     cover is a drawn stand-in here; the next two on deck, never their songs */
  const up = tv(stage("up"));
  assert.match(up, /fd-show is-marquee tv-karaoke-up-title/);
  assert.doesNotMatch(up, /Remaster/);
  /* the vote shows who has voted, never how: the six tiers and no counts */
  const voting = tv(stage("voting"));
  assert.equal((voting.match(/tv-karaoke-seat is-lit/g) || []).length, 8);
  assert.equal((voting.match(/tv-karaoke-tier is-\d/g) || []).length, 6);
  /* the reveal: 6th down to 13th in, the rest dark until their instant */
  const mid = tv(stage("reveal-mid"));
  assert.equal((mid.match(/tv-karaoke-row is-(?:rest|podium|first) is-waiting/g) || []).length, 5);
  const podium = tv(stage("reveal-podium"));
  assert.doesNotMatch(podium, /is-waiting/);
  assert.equal((podium.match(/role="img" aria-label="\d+\.\d"/g) || []).length, 13, "every score a reel");
});

test("the TV's model: the deal, the queue, the reveal's columns, the title's fit, the clock", () => {
  /* thirteen deal in balanced rows of seven and six */
  const slots = karaokeDealSlots(13);
  assert.deepEqual([slots.filter(s => s.row === 0).length, slots.filter(s => s.row === 1).length], [7, 6]);
  assert.ok(slots.every(s => s.x > 0 && s.x < 1));
  /* the deal ends before the first singer is up */
  assert.ok(KARAOKE_DEAL.lead + 12 * KARAOKE_DEAL.step + 500 < KARAOKE_ORDER_HOLD_MS);
  /* on deck skips anyone absent */
  const up = stage("up");
  const queue = karaokeQueue(up, up.karaoke, 2);
  assert.deepEqual(queue.map(item => item.place), [4, 5]);
  const away = { ...up, away:{ [up.karaoke.order[3]]:{ at:1 } } };
  assert.deepEqual(karaokeQueue(away, away.karaoke, 2).map(item => item.player), [up.karaoke.order[4], up.karaoke.order[5]]);
  /* the reveal: the top three, then two columns climbing */
  assert.deepEqual(karaokeRevealColumns(13), { podium:[1, 2, 3], left:[4, 5, 6, 7, 8], right:[9, 10, 11, 12, 13] });
  assert.deepEqual(karaokeRevealColumns(6), { podium:[1, 2, 3], left:[4, 5], right:[6] });
  assert.deepEqual(karaokeRevealColumns(2), { podium:[1, 2], left:[], right:[] });
  const rows = karaokeRevealRows(stage("reveal-mid").karaoke, NOW);
  assert.deepEqual(rows.filter(row => row.shown).map(row => row.place), [6, 7, 8, 9, 10, 11, 12, 13]);
  assert.ok(rows.every(row => !row.score || row.tier?.name), "a scored row names its nearest tier");
  /* a title: the hero cut in one or two lines, else the solid face sized to fit */
  assert.deepEqual(karaokeTitleFit("Africa", 1180), { marquee:true, size:150, lines:["Africa"] });
  assert.deepEqual(karaokeTitleFit("Total Eclipse of the Heart", 1180).lines, ["Total Eclipse", "of the Heart"]);
  const long = karaokeTitleFit("Everybody Wants to Rule the World Tonight Forever", 1180);
  assert.equal(long.marquee, false);
  assert.ok(long.size >= 56 && long.size <= 112);
  assert.equal(karaokeSongTitle("Wonderwall - Remastered"), "Wonderwall");
  /* the TV wakes on the game's own instants */
  const singing = stage("singing").karaoke;
  assert.equal(karaokeNextInstant(singing, NOW), karaokeTurn(singing).endAt);
});

/* ── the takeover, the gates and the reload ── */

test("TV mode wires karaoke: its branch, the takeover, the reload gate, and the moments kept off it", () => {
  const source = read("src/features/tv/TVMode.jsx");
  assert.match(source, /const karaokeOnTv = karaokeLive\(state\)/);
  assert.match(source, /karaokeSong && \{ takeover:"karaoke" \}/, "a takeover with no chase");
  assert.match(source, /\|\| \(karaokeOnTv && karaokeTvBusy\(state\.karaoke\)\) \|\| !!showdown \|\| !!gag;/, "the reload waits");
  assert.match(source, /&& !triviaLive\(state\) && !karaokeLive\(state\) \}\);/, "no showdown over it");
  const blocked = source.slice(source.indexOf("useGagShown(")).split(";")[0];
  assert.ok(blocked.includes("karaokeSong"), "no gag over the song");
  assert.match(source, /!geoOnTv && !triviaOnTv && !karaokeOnTv;/, "no lobby");
  assert.match(source, /const attract = photoGap && [^\n]*!karaokeOnTv[^\n]*!chrome\.takeover/, "no vignette");
  assert.match(source, /\} else if \(karaokeOnTv\) \{[\s\S]*?<TVKaraoke state=\{state\} now=\{now\} fixed=\{nowOverride !== undefined\} onVideoStatus=\{onVideoStatus\} \/>/);
  assert.ok(source.indexOf("} else if (karaokeOnTv) {") > source.indexOf("} else if (triviaOnTv) {"), "after Trivia");
  assert.ok(source.indexOf("} else if (karaokeOnTv) {") < source.indexOf("} else if (lobbyOn) {"), "before the lobby");
  assert.match(source, /\|\| karaokeOnTv;/, "the ticker holds still");
  /* without a chase the frame's lamps step out with the chrome */
  assert.match(read("src/features/tv/tv.css"), /\.tv-canvas:is\(\[data-takeover\], \[data-moment\]\):not\(\[data-chase\]\) \.tv-frame-lamps \{ display:none; \}/);
});

test("nothing is ever drawn over the video's box; the box is inside title-safe and at least 480 by 270", () => {
  const css = read("src/features/tv/tv-karaoke.css");
  const rule = selector => {
    const at = css.indexOf(`${selector} {`);
    assert.ok(at >= 0, selector);
    return css.slice(at, css.indexOf("}", at));
  };
  const px = (block, prop) => Number(new RegExp(`(?:^|[;{ ])${prop}:(\\d+)px`).exec(block)?.[1]);
  for (const selector of [".tv-karaoke-video", ".tv-karaoke-standin", ".tv-karaoke-card"]) {
    const block = rule(selector);
    assert.deepEqual({ x:px(block, "left"), y:px(block, "top"), w:px(block, "width"), h:px(block, "height") }, { ...KARAOKE_VIDEO_BOX },
      `${selector} is the box`);
  }
  const box = KARAOKE_VIDEO_BOX;
  assert.ok(box.w >= 480 && box.h >= 270 && Math.abs(box.w / box.h - 16 / 9) < 0.01);
  assert.ok(box.x >= 64 && box.y >= 54 && box.x + box.w <= 1920 - 64 && box.y + box.h <= 1080 - 54, "title safe");
  const strip = rule(".tv-karaoke-strip");
  assert.deepEqual({ x:px(strip, "left"), y:px(strip, "top"), w:px(strip, "width"), h:px(strip, "height") }, { ...KARAOKE_STRIP });
  assert.ok(KARAOKE_STRIP.y >= box.y + box.h && KARAOKE_STRIP.y + KARAOKE_STRIP.h <= 1080 - 54, "the strip stands under it");
  /* shown only while its video plays; the TV's own sound sign waits out the song; a reconnect never dims it */
  assert.match(rule(".tv-karaoke-video"), /visibility:hidden/);
  assert.match(css, /\.tv-karaoke-video\[data-on\] \{ visibility:visible; \}/);
  assert.match(css, /\.tv-canvas\[data-takeover="karaoke"\] \.tv-sound-chip \{ display:none; \}/);
  assert.match(css, /\.tv-main:has\(\.tv-karaoke-video\[data-on\]\) \{ opacity:1 !important; \}/);
  /* the song's layer holds the box (or its card), the strip and the strip's sign; nothing else */
  const html = tv(stage("singing"));
  const layer = html.slice(html.indexOf('<div class="tv-karaoke-song">'));
  const classes = [...layer.matchAll(/<(?:div|button) class="(tv-karaoke-[a-z-]+)/g)].map(m => m[1]);
  assert.deepEqual([...new Set(classes)].filter(c => !c.startsWith("tv-karaoke-strip")), ["tv-karaoke-song", "tv-karaoke-video", "tv-karaoke-standin"]);
});

/* ── the room's sound ── */

const snap = state => ({ karaoke:karaokeRoomSnapshot(state) });
const without = (state, fn) => { const copy = structuredClone(state); fn(copy.karaoke); return copy; };

test("the room's cues: the pick, the deal, the walk-up, votes only once the song is over, the rain, the reveal; never S14", () => {
  const pick = stage("pick");
  /* the window opens */
  const opened = karaokeCues({ karaoke:null }, snap(pick), { now:NOW });
  assert.deepEqual(opened.map(cue => cue.id), ["sting"]);
  assert.ok(opened[0].at > pick.karaoke.startedAt);
  /* a player locks in: a slap from their chip */
  const late = presentPlayers(pick).find(player => !pick.karaoke.ready[player]);
  const locked = karaokeCues(snap(pick), snap(without(pick, game => { game.ready[late] = NOW; })), { now:NOW });
  assert.deepEqual(locked.map(cue => cue.id), ["S18"]);
  assert.ok(locked[0].pan !== 0 && Math.abs(locked[0].pan) <= 0.7);
  /* the order deals a card a step, panned across the queue; one card under reduced motion */
  const order = stage("order");
  const before = without(order, game => { game.phase = "pick"; game.order = []; game.index = -1; game.turns = {}; });
  const drawn = karaokeCues(snap(before), snap(order), { now:NOW });
  const dealt = drawn.filter(cue => cue.id === "S3");
  assert.equal(dealt.length, 13);
  const dealAt = karaokeTurn(order.karaoke).upAt - KARAOKE_ORDER_HOLD_MS;
  assert.deepEqual(dealt.map(cue => cue.at), Array.from({ length:13 }, (_, i) => dealAt + KARAOKE_DEAL.lead + i * KARAOKE_DEAL.step));
  assert.equal(new Set(dealt.map(cue => cue.pan)).size > 3, true);
  /* then the first singer is up once the deal is done */
  assert.deepEqual(drawn.filter(cue => cue.id !== "S3").map(cue => cue.id), ["upNow", "stamp"]);
  assert.ok(drawn.filter(cue => cue.id !== "S3").every(cue => cue.at >= karaokeTurn(order.karaoke).upAt));
  assert.deepEqual(karaokeCues(snap(before), snap(order), { now:NOW, reduced:true }).map(cue => cue.id), ["S3", "stamp"]);
  /* a singer up next: the lamp, then the song stamps in */
  const up = stage("up");
  const prior = without(up, game => {
    const prev = game.order[1];
    delete game.turns[game.order[2]];
    delete game.turns[prev].closedAt;
    game.index = 1;
  });
  const walkUp = karaokeCues(snap(prior), snap(up), { now:NOW });
  const upAt = karaokeTurn(up.karaoke).upAt;
  assert.deepEqual(walkUp.filter(cue => cue.id !== "S8").map(cue => [cue.id, cue.at]),
    [["upNow", upAt + KARAOKE_UP_BEATS.chip], ["stamp", upAt + KARAOKE_UP_BEATS.song]]);
  assert.deepEqual(walkUp.filter(cue => cue.id === "S8").length, 1, "the vote before it closed early, all in");
  /* a vote during the song is silent; once the song is over each one slaps */
  const singing = stage("singing");
  const singer = karaokeSinger(singing.karaoke);
  const voterOf = state => Object.keys(state.karaoke.voted[karaokeSinger(state.karaoke)])[0];
  const quiet = karaokeCues(snap(without(singing, game => { delete game.voted[singer][voterOf(singing)]; })), snap(singing), { now:NOW });
  assert.deepEqual(quiet, [], "nothing sounds during a song");
  const voting = stage("voting");
  const after = karaokeCues(snap(without(voting, game => { delete game.voted[karaokeSinger(game)][voterOf(voting)]; })), snap(voting),
    { now:NOW });
  assert.deepEqual(after.map(cue => cue.id), ["S18"]);
  /* Legendary rains with its chime as the vote closes */
  const legendary = stage("legendary");
  const raining = karaokeCues(snap(without(legendary, game => {
    const prev = game.order[1];
    delete game.turns[game.order[2]];
    delete game.turns[prev].closedAt;
    game.turns[prev].legendary = false;
    game.index = 1;
  })), snap(legendary), { now:NOW });
  const rain = karaokeRain(legendary.karaoke, NOW);
  assert.deepEqual(raining.find(cue => cue.id === "legendary")?.at, rain.closedAt);
  assert.equal(raining.some(cue => cue.id === "S8"), false, "the chime, not the knock");
  /* the reveal: a stamp a row from last place up, the podium for the top three, never S14 */
  const reveal = stage("reveal-podium");
  const pending = without(reveal, game => { game.phase = "turns"; game.ranking = null; game.revealAt = null; });
  const stamps = karaokeCues(snap(pending), snap(reveal), { now:NOW });
  assert.equal(stamps.length, 13);
  assert.deepEqual(stamps.filter(cue => cue.id === "podium").map(cue => cue.opts.place), [3, 2, 1]);
  assert.equal(stamps.filter(cue => cue.id === "orderStamp").length, 10);
  assert.ok(stamps.every(cue => cue.id !== "S14"));
  assert.equal(new Set(stamps.map(cue => cue.key)).size, 13);
  const steps = karaokeRevealSchedule(reveal.karaoke.ranking).steps;
  assert.equal(stamps[0].at, reveal.karaoke.revealAt + steps[0].at + 140, "13th first");
  assert.deepEqual(karaokeCues(snap(pending), snap(reveal), { now:NOW, reduced:true }).map(cue => [cue.id, cue.opts.place]), [["podium", 1]]);
  /* a reveal that starts under the last singer's rain stays quiet until it lifts */
  const rained = without(reveal, game => {
    const last = game.order[game.order.length - 1];
    game.turns[last].closedAt = game.revealAt;
    game.turns[last].legendary = true;
  });
  const lifted = karaokeCues(snap(pending), snap(rained), { now:NOW });
  assert.ok(lifted.every(cue => cue.at >= reveal.karaoke.revealAt + KARAOKE_LEGENDARY_MS));
  assert.ok(lifted.length < 13 && KARAOKE_REVEAL_LEAD_MS < KARAOKE_LEGENDARY_MS);
});

test("the vote's clock ticks its last five seconds and knocks at the close, only once the song is over", () => {
  const voting = stage("voting").karaoke;
  const turn = karaokeTurn(voting);
  assert.deepEqual(karaokeClockCues(voting, NOW).map(cue => [cue.id, cue.at - turn.closeAt]),
    [["typeTick", -5000], ["typeTick", -4000], ["typeTick", -3000], ["typeTick", -2000], ["typeTick", -1000], ["S8", 0]]);
  assert.deepEqual(karaokeClockCues(voting, turn.closeAt - 2500).map(cue => cue.at - turn.closeAt), [-2000, -1000, 0], "a late TV hears what is ahead");
  assert.deepEqual(karaokeClockCues(stage("singing").karaoke, NOW), [], "nothing during the song");
  assert.deepEqual(karaokeClockCues(stage("up").karaoke, NOW), []);
});

test("the room's one sound hook carries karaoke, fresh frames only", () => {
  const voting = stage("voting");
  const events = allEventsOf(voting);
  assert.deepEqual(roomSnapshot(voting, events).karaoke, karaokeRoomSnapshot(voting));
  const singer = karaokeSinger(voting.karaoke);
  const prev = roomSnapshot(without(voting, game => { delete game.voted[singer][Object.keys(game.voted[singer])[0]]; }), events);
  const next = roomSnapshot(voting, events);
  assert.deepEqual(roomStep(prev, next, { fresh:false, now:NOW }), [], "a catch-up sounds nothing");
  assert.deepEqual(roomStep(prev, next, { fresh:true, now:NOW }).map(cue => cue.id), ["S18"]);
  /* a posted result ends the game's voice: the result's own S14 rings it */
  const posted = structuredClone(voting);
  posted.results.karaoke = { slots:[[singer]], ts:NOW, revision:1 };
  assert.equal(karaokeRoomSnapshot(posted), null);
  const source = read("src/features/tv/roomSound.js");
  assert.match(source, /karaoke:karaokeRoomSnapshot\(state\),/);
  assert.match(source, /karaokeCues\(prev, next, \{ now, reduced \}\)\.forEach\(cue => cues\.push\(cue\)\);/);
});

test("the kit's Legendary chime: a part, not one of the 26, playable, every node released", async () => {
  const kit = await import("../src/lib/soundKit.js");
  class Param { constructor(v = 0) { this.value = v; } setValueAtTime() {} linearRampToValueAtTime() {} exponentialRampToValueAtTime() {}
    cancelScheduledValues() {} setTargetAtTime() {} }
  class Node {
    constructor(ctx, kind) { this.ctx = ctx; this.kind = kind;
      for (const name of ["gain", "frequency", "Q", "pan", "threshold", "knee", "ratio", "attack", "release"]) this[name] = new Param(1); }
    connect(node) { return node; } disconnect() { this.disconnected = (this.disconnected || 0) + 1; } start() {} stop() {}
  }
  const ctx = { currentTime:10, sampleRate:8000, destination:{}, nodes:[],
    node(kind) { const n = new Node(this, kind); this.nodes.push(n); return n; },
    createGain() { return this.node("gain"); }, createBiquadFilter() { return this.node("filter"); },
    createDynamicsCompressor() { return this.node("comp"); }, createConvolver() { return this.node("conv"); },
    createStereoPanner() { return this.node("pan"); }, createOscillator() { return this.node("osc"); },
    createBufferSource() { return this.node("src"); },
    createBuffer(channels, length) { return { length, numberOfChannels:channels, getChannelData:() => new Float32Array(length) }; } };
  const E = kit.makeEngine(ctx, { listen:"tv" });
  const base = ctx.nodes.length;
  assert.deepEqual(kit.KARAOKE_PARTS.map(part => part.id), ["legendary"]);
  for (const part of kit.KARAOKE_PARTS) {
    assert.doesNotMatch(part.id, /^gag[A-Z]/);
    assert.equal(kit.SOUND_IDS.includes(part.id), false);
    assert.equal(kit.isSound(part.id), true);
    ctx.nodes.length = base;
    assert.ok(kit.playRecipe(E, part.id, 10, {}));
    const made = ctx.nodes.slice(base);
    const sources = made.filter(n => n.kind === "osc" || n.kind === "src");
    assert.ok(sources.length > 0);
    sources.forEach(n => n.onended());
    assert.ok(made.every(n => n.disconnected === 1), `${part.id}: every node released once`);
  }
  assert.deepEqual(kit.SOUND_IDS, Array.from({ length:26 }, (_, i) => `S${i + 1}`), "the 26 stay 26");
});

/* ── the player ── */

/* a stand-in IFrame API: records every call, reports state changes as YouTube does */
function standIn() {
  const players = [];
  class Player {
    constructor(slot, opts) {
      this.slot = slot; this.opts = opts; this.calls = []; this.state = -1; this.time = 0;
      players.push(this);
      queueMicrotask(() => opts.events.onReady({ target:this }));
    }
    cueVideoById(id) { this.calls.push(["cueVideoById", id]); this.state = 5; this.opts.events.onStateChange({ data:5 }); }
    loadVideoById(arg) { this.calls.push(["loadVideoById", arg]); }
    playVideo() { this.calls.push(["playVideo"]); }
    stopVideo() { this.calls.push(["stopVideo"]); this.state = 5; }
    seekTo(s) { this.calls.push(["seekTo", s]); }
    mute() { this.calls.push(["mute"]); } unMute() { this.calls.push(["unMute"]); }
    getPlayerState() { return this.state; } getCurrentTime() { return this.time; }
    destroy() { this.calls.push(["destroy"]); }
    emit(data) { this.state = data; this.opts.events.onStateChange({ data }); }
  }
  let loads = 0;
  return { players, loadApi:() => { loads += 1; return Promise.resolve({ Player }); }, loads:() => loads };
}
function standInHost() {
  return { on:false, children:[], appendChild(child) { this.children.push(child); child.parentNode = this; },
    removeChild(child) { this.children = this.children.filter(c => c !== child); },
    setAttribute(name) { if (name === "data-on") this.on = true; }, removeAttribute(name) { if (name === "data-on") this.on = false; },
    set textContent(value) { this.children = []; } };
}
const flush = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); };
function rig(state) {
  const api = standIn(), host = standInHost(), reports = [], blocked = [];
  const ctl = createKaraokeController({ host, read:() => ({ game:state.karaoke, onStatus:status => reports.push(status) }),
    onBlocked:key => blocked.push(key), loadApi:api.loadApi, makeSlot:() => ({}) });
  return { api, host, reports, blocked, ctl };
}

test("a still never builds a player; a practice song never loads YouTube", async () => {
  const singing = stage("singing").karaoke;
  assert.equal(karaokePlayerOn(singing, true), false, "fixed: the fit audit, a rehearsal");
  assert.equal(karaokePlayerOn(singing, false), true);
  assert.equal(karaokePlayerOn(stage("pick").karaoke, false), false);
  assert.equal(karaokePlayerOn(stage("reveal-mid").karaoke, false), false);
  assert.deepEqual(KARAOKE_PLAYER_VARS, { controls:0, disablekb:1, fs:0, rel:0, iv_load_policy:3, playsinline:1 });
  mock.timers.enable({ apis:["Date", "setTimeout", "setInterval"], now:NOW });
  try {
    const practice = rig(stage("practice"));
    practice.ctl.sync();
    await flush();
    assert.equal(practice.api.loads(), 0);
    assert.deepEqual(practice.reports, []);
    practice.ctl.destroy();
  } finally { mock.timers.reset(); }
});

test("the player: cued at the walk-up, played at the song's instant, reported playing, stopped at its end", async () => {
  mock.timers.enable({ apis:["Date", "setTimeout", "setInterval"], now:NOW });
  try {
    const state = stage("up");
    const { api, host, reports, ctl } = rig(state);
    const game = state.karaoke, singer = karaokeSinger(game), turn = karaokeTurn(game);
    const video = karaokeVideoOf(game.songs[singer], turn);
    const key = karaokeVideoKey(game);
    ctl.mute(false);
    ctl.sync();
    await flush();
    const [player] = api.players;
    assert.deepEqual(player.opts.playerVars, { ...KARAOKE_PLAYER_VARS });
    assert.deepEqual(reports, [{ key, state:"ready" }]);
    assert.deepEqual(player.calls.at(-1), ["cueVideoById", video.id], "the song is public from upAt: cue it");
    assert.equal(host.on, false, "out of view while cued");
    /* the song starts by its own write, 1.5 s out */
    Object.assign(turn, karaokeSchedule(game.songs[singer], NOW + 1500, turn));
    ctl.sync();
    assert.equal(player.calls.some(call => call[0] === "playVideo"), false, "never before its instant");
    mock.timers.tick(1500);
    assert.deepEqual(player.calls.at(-1), ["playVideo"]);
    assert.equal(host.on, true, "in view as it plays");
    /* YouTube plays: 0.8 s of the video means its time 0 played 800 ms ago */
    player.time = 0.8;
    player.emit(1);
    assert.deepEqual(reports.at(-1), { key, state:"playing", at:NOW + 1500 - 800 });
    /* the end: stopped and out of view, never YouTube's end screen */
    mock.timers.tick(turn.endAt - (NOW + 1500));
    assert.deepEqual(player.calls.at(-1), ["stopVideo"]);
    assert.equal(host.on, false);
    /* the vote closes: the turn has no video to show */
    turn.closedAt = turn.endAt + 5000;
    ctl.sync();
    ctl.destroy();
    assert.equal(player.calls.at(-1)[0], "destroy");
    assert.deepEqual(host.children, []);
  } finally { mock.timers.reset(); }
});

test("the player: a late TV loads where the room is; blocked, then Click to play; an error reported and stopped", async () => {
  mock.timers.enable({ apis:["Date", "setTimeout", "setInterval"], now:NOW });
  try {
    /* a TV that joins 50 s into the song loads the video 50 s in */
    const late = stage("singing");
    const lateRig = rig(late);
    lateRig.ctl.sync();
    await flush();
    const [player] = lateRig.api.players;
    const video = karaokeVideoOf(late.karaoke.songs[karaokeSinger(late.karaoke)], karaokeTurn(late.karaoke));
    assert.deepEqual(player.calls.find(call => call[0] === "loadVideoById"), ["loadVideoById", { videoId:video.id, startSeconds:50 }]);
    assert.equal(lateRig.host.on, true);
    /* still not playing 3 s after it was told to: blocked, and the sign goes up */
    mock.timers.tick(3000);
    const key = karaokeVideoKey(late.karaoke);
    assert.deepEqual(lateRig.reports.at(-1), { key, state:"blocked" });
    assert.equal(lateRig.blocked.at(-1), key);
    /* Click to play: it plays, the sign comes down */
    lateRig.ctl.play();
    assert.deepEqual(player.calls.at(-1), ["playVideo"]);
    player.time = 51;
    player.emit(1);
    assert.equal(lateRig.blocked.at(-1), null);
    assert.equal(lateRig.reports.at(-1).state, "playing");
    /* YouTube refuses the upload: reported with its code, stopped, out of view */
    player.opts.events.onError({ data:150 });
    assert.deepEqual(lateRig.reports.at(-1), { key, state:"error", code:150 });
    assert.deepEqual(player.calls.at(-1), ["stopVideo"]);
    assert.equal(lateRig.host.on, false);
    lateRig.ctl.destroy();
    /* the browser says autoplay is blocked: reported at once */
    const blockedRig = rig(stage("singing"));
    blockedRig.ctl.sync();
    await flush();
    blockedRig.api.players[0].opts.events.onAutoplayBlocked();
    assert.equal(blockedRig.reports.at(-1).state, "blocked");
    /* the TV's Sound switch mutes the video */
    blockedRig.ctl.mute(true);
    assert.deepEqual(blockedRig.api.players[0].calls.at(-1), ["mute"]);
    blockedRig.ctl.destroy();
  } finally { mock.timers.reset(); }
});

/* ── the TV report and the commissioner ── */

test("the TV report rides the TV's presence; the commissioner's line says when the video will not play", () => {
  const client = read("src/lib/client.js");
  assert.match(client, /export function reportTvVideo\(status\)/);
  assert.match(client, /const tvSoundPayload = \(\) => isTvView\(\) \? \{ \.\.\.\(tvSound \? \{ tvSound \} : \{\}\), \.\.\.\(tvVideo \? \{ tvVideo \} : \{\}\) \} : \{\};/);
  assert.match(client, /if \(!isTvView\(\)\) \{ tvSound = null; tvVideo = null; \}/, "leaving TV clears it");
  /* the hello and ping still carry the payload as before */
  assert.match(client, /type:"hello", payload:\{ view:viewName\(\), nonce, visible:pageVisible\(\), \.\.\.tvSoundPayload\(\) \}/);
  assert.match(client, /type: "ping", payload:\{ visible:pageVisible\(\), view:viewName\(\), \.\.\.tvSoundPayload\(\) \}/);
  const app = read("src/App.jsx");
  assert.match(app, /onSoundStatus=\{reportTvSound\}/);
  assert.match(app, /onVideoStatus=\{reportTvVideo\}/);
  assert.match(read("dev/fit/client.js"), /export const reportTvVideo = /);
  const now = 1_000_000;
  const tvs = video => [{ sound:"on", ageMs:0, video }];
  assert.equal(tvHealthLine({ tvs:tvs({ key:"k:0:0", state:"playing", at:1 }), receivedAt:now, live:true, now }), null);
  assert.equal(tvHealthLine({ tvs:tvs({ key:"k:0:0", state:"blocked" }), receivedAt:now, live:true, now }), "Video blocked on the TV");
  assert.equal(tvHealthLine({ tvs:tvs({ key:"k:0:0", state:"error", code:150 }), receivedAt:now, live:true, now }), "Video blocked on the TV");
  assert.equal(tvHealthLine({ tvs:tvs({ key:"k:0:0", state:"blocked" }), receivedAt:now, live:true, now, videoKey:"k:1:0" }), null,
    "a turn that has moved on");
  assert.equal(tvHealthLine({ tvs:[...tvs({ key:"k:0:0", state:"blocked" }), { sound:"blocked", ageMs:0 }], receivedAt:now, live:true, now }),
    "Video blocked on 1 of 2 TVs", "the video outranks the sound");
  assert.equal(tvHealthLine({ tvs:[{ sound:"blocked", ageMs:0 }], receivedAt:now, live:true, now }), "TV sound off");
});

/* ── the stylesheet ── */

test("the TV's karaoke stylesheet: tokens only, 24px and up, clay text in its own ink, no em dash", () => {
  const css = read("src/features/tv/tv-karaoke.css");
  assert.ok(!/#[0-9a-f]{3,6}\b/i.test(css) && !/rgba?\(/i.test(css), "tokens only");
  const sizes = [...css.matchAll(/font(?:-size)?:[^;]*?(\d+)px/g)].map(m => Number(m[1]));
  assert.ok(sizes.length > 10 && sizes.every(size => size >= 24), `TV text sizes ${sizes}`);
  assert.doesNotMatch(css, /color:\s*var\(--clay\)/);
  assert.match(css, /--tier-6-ink/, "Legendary's ochre takes the dark ink");
  for (const file of ["src/features/tv/TVKaraoke.jsx", "src/features/tv/tv-karaoke.css", "src/features/tv/karaokeTv.js",
    "src/features/tv/karaokeSound.js", "src/features/tv/karaokePlayer.js", "dev/fit/karaokeFixtures.js"])
    assert.doesNotMatch(read(file), /—/, `${file}: no em dashes`);
  /* the plan never starts a song before it is written */
  const up = stage("up").karaoke;
  assert.equal(karaokeVideoPlan(up, NOW).mode, "cue");
  assert.equal(karaokeVideoPlan(up, NOW).songAt, null);
});
