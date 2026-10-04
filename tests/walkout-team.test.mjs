import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

/* A team's win walks out as the team (Oct 2, owner note: "the victory only
   shows one person of the person music is playing"). The Worker plays one
   member's song; the TV, every teammate's phone and the Now playing strip
   read the win itself back from official state. Pure models, then the real
   components' markup. Also the sky strip's one slot per event. */
globalThis.__FD_BUILD_ID__ = "build-test";
const root = fileURLToPath(new URL("../", import.meta.url));

const { CHIP_COLORS, CHIP_SKINS, EMPTY_STATE, ROSTER, allEventsOf } = await import("../shared/core.js");
const { walkoutTeam, walkoutReaches, teamRows, teamColorPlayer, postedWinner, WALKOUT_WIN_MS } =
  await import("../src/features/moments/walkoutTeam.js");
const { nowPlayingModel } = await import("../src/features/tv/nowPlaying.js");
const { TV_SCENARIOS, buildScenario } = await import("../dev/fit/scenarios.js");

const compiled = await build({
  stdin:{ contents:`
    export { TVWalkout, walkoutTeamLayout, walkoutTeamName, walkoutLabelSize } from "./src/features/tv/TVWalkout.jsx";
    export { NowPlaying, nowTeamNameSize } from "./src/features/tv/NowPlaying.jsx";
    export { PhoneWalkout } from "./src/features/moments/PhoneMoments.jsx";
    export { walkoutView } from "./src/features/moments/walkout.js";
    export { SkyStrip, skyModel, skyArc } from "./src/features/moments/SkyStrip.jsx";
    export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";`,
  resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react", "react-dom", "qrcode-generator", "three"], loader:{ ".css":"empty" },
  write:false, logLevel:"silent",
});
const mod = new Module(fileURLToPath(new URL("walkout-team.cjs", import.meta.url)));
mod.filename = mod.id;
mod.paths = Module._nodeModulePaths(root);
mod._compile(compiled.outputFiles[0].text, mod.filename);
const ui = mod.exports;

const profiles = () => Object.fromEntries(ROSTER.map((player, index) => [player, { display:player, num:index + 1,
  color:CHIP_COLORS[index % CHIP_COLORS.length].hex, skin:CHIP_SKINS[index % CHIP_SKINS.length],
  walkoutTrack:{ trackId:"3n3Ppam7vgaVa1iaRUc9Lp", name:"Mr. Brightside", artists:["The Killers"], imageUrl:null } }]));
const base = () => ({ ...structuredClone(EMPTY_STATE), profiles:profiles() });
const song = (player, startedAt, extra = {}) => ({ player, trackId:"3n3Ppam7vgaVa1iaRUc9Lp", startedAt, until:startedAt + 30000,
  auto:true, ...extra });
const render = (state, node) => renderToStaticMarkup(React.createElement(ui.PlayerIdentityProvider, { profiles:state.profiles }, node));

test("a team's win from its posted result: the draw's name and every member in the draw's order", () => {
  const state = base();
  const events = allEventsOf(state);
  state.draws.volley = { id:"d1", teams:[{ name:"The Scorpions", players:["Adi", "Allan", "Evan"] },
    { name:"The Coyotes", players:["Chinh", "Khoa", "Ben"] }] };
  state.results.volley = { slots:[["Evan", "Adi", "Allan"], ["Chinh", "Khoa", "Ben"]], ts:100_000, revision:1 };
  const team = walkoutTeam(state, events, song("Allan", 101_000));
  assert.equal(team.name, "The Scorpions");
  assert.deepEqual(team.players, ["Adi", "Allan", "Evan"], "the draw's order, whoever sings");
  assert.equal(team.named, true);
  assert.equal(team.event, "Sand Volleyball");
  assert.equal(teamColorPlayer(team), "Adi", "the team's color is its first member's, as at the draw");
});

test("a pair with no draw on record is its two names; a free-for-all tie and a solo win stay individual", () => {
  const state = base();
  const events = allEventsOf(state);
  state.results.die = { slots:[["Evan", "Ben"], ["Adi", "Khoa"]], ts:50_000, revision:1 };
  assert.equal(walkoutTeam(state, events, song("Ben", 50_500)).name, "Evan & Ben");
  state.results.putt = { slots:[["Evan", "Adi"], ["Khoa"]], ts:60_000, revision:1 };
  assert.equal(walkoutTeam(state, events, song("Evan", 60_500)), null, "two tied for 1st in a free-for-all are not a team");
  state.results.putt = { slots:[["Evan"], ["Khoa"]], ts:60_000, revision:1 };
  assert.equal(walkoutTeam(state, events, song("Evan", 60_500)), null, "a solo win walks out alone");
});

test("only the win the song follows: a team MVP, a stale win, and a newer win by others play no team", () => {
  const state = base();
  const events = allEventsOf(state);
  state.results.die = { slots:[["Evan", "Ben"], ["Adi", "Khoa"]], ts:50_000, revision:1 };
  assert.equal(walkoutTeam(state, events, song("Ben", 50_500, { mvp:true })), null, "an MVP's song stays about the MVP");
  assert.equal(walkoutTeam(state, events, song("Ben", 50_000 + WALKOUT_WIN_MS + 1)), null, "an old win is not this song's");
  state.results.putt = { slots:[["Khoa"], ["Adi"]], ts:55_000, revision:1 };
  assert.equal(walkoutTeam(state, events, song("Ben", 55_500)), null, "the newest decision is someone else's");
  assert.equal(walkoutTeam(state, events, song("Ben", 47_000)), null, "a win after the song started is not its win");
});

test("a recorded bracket match names its side from the draw (the real reducers)", () => {
  const { state } = buildScenario(TV_SCENARIOS, "tv-walkout-pair");
  const events = allEventsOf(state);
  const walkout = state.showControl.audio.walkout;
  const team = walkoutTeam(state, events, walkout);
  assert.deepEqual(team.players, ["Henry", "Richard"]);
  assert.equal(team.name, "Henry Nguyen & Squilliam");
  /* the contest stack alone carries it too: drop the posted results */
  state.results = {};
  assert.deepEqual(walkoutTeam(state, events, walkout).players, ["Henry", "Richard"]);
  const seven = buildScenario(TV_SCENARIOS, "tv-walkout-team7").state;
  const big = walkoutTeam(seven, allEventsOf(seven), seven.showControl.audio.walkout);
  assert.equal(big.players.length, 7);
  /* the draw's own name for the winning team (shared/teamNames.js) */
  assert.equal(big.name, seven.draws.bball5.teams.find(t => t.players.includes(big.players[0])).name);
});

test("every teammate's phone takes the walkout; a spectator's does not", () => {
  const view = { player:"Brandon", team:{ players:["Allan", "Richard", "Brandon"] } };
  assert.equal(walkoutReaches(view, "Brandon"), true);
  assert.equal(walkoutReaches(view, "Richard"), true);
  assert.equal(walkoutReaches(view, "Evan"), false);
  assert.equal(walkoutReaches({ player:"Evan", team:null }, "Evan"), true);
  assert.equal(walkoutReaches({ player:"Evan", team:null }, "Adi"), false);
  assert.equal(walkoutReaches(view, null), false);
});

test("balanced rows: one up to the row's width, then even rows", () => {
  assert.deepEqual(teamRows(2), [2]);
  assert.deepEqual(teamRows(5), [5]);
  assert.deepEqual(teamRows(6), [3, 3]);
  assert.deepEqual(teamRows(7), [4, 3]);
  assert.deepEqual(teamRows(11), [4, 4, 3]);
  assert.deepEqual(teamRows(7, 4), [4, 3], "the phone's rows of four");
  assert.deepEqual(teamRows(0), []);
});

test("the TV's team walkout fits the canvas by construction, 2 to 7 and long names", () => {
  const names = ["Henry Nguyen & Squilliam", "The Sidewinders", "The Gila Monsters", "Squilliam & Henry Nguyen-Featherstonehaugh"];
  for (let count = 2; count <= 7; count++) for (const name of names) {
    const team = { name, named:!name.includes("&"), players:ROSTER.slice(0, count) };
    const layout = ui.walkoutTeamLayout(team);
    const across = Math.max(...layout.rows);
    assert.ok(across * layout.chip + (across - 1) * 56 <= 1560, `${count} across fits the width`);
    const nameH = Math.ceil(layout.name.size * 1.2) * layout.name.lines.length;
    const rowH = layout.chip + (layout.labelled ? Math.ceil(44 * 1.2) + 10 : 0);
    const total = nameH + 32 + layout.rows.length * rowH + (layout.rows.length - 1) * 24 + 32 + 112;
    assert.ok(total <= 1080 - 2 * 72, `${name}, ${count}: ${total}px fits the height`);
    assert.ok(layout.name.lines.every(line => line.length * 0.52 * layout.name.size <= 1560), `${name} fits its line`);
    assert.ok(layout.name.size >= 72);
  }
  assert.deepEqual(ui.walkoutTeamName("Squilliam & Henry Nguyen-Featherstonehaugh").lines,
    ["Squilliam &", "Henry Nguyen-Featherstonehaugh"], "two lines broken at the ampersand");
  assert.ok(ui.walkoutLabelSize("Squilliam", 200) >= 24, "the TV's 24px floor");
});

const drawnName = (state, players) => state.draws.bball5.teams.find(team => team.players.includes(players[0])).name;
/* a drawn name may carry an apostrophe ("Richard's Rattlers"); markup escapes it */
const inHtml = text => String(text).replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");
test("the TV walks out the team: its name, every chip, the singer marked, the song credited", () => {
  const { state } = buildScenario(TV_SCENARIOS, "tv-walkout-team7");
  const view = ui.walkoutView(state, allEventsOf(state));
  const html = render(state, React.createElement(ui.TVWalkout, { state, moment:{ ...view, id:"m", anchor:0, elapsed:3000 } }));
  assert.match(html, /tv-walkout is-team/);
  assert.ok(html.includes(inHtml(view.team.name)) && view.team.name === drawnName(state, view.team.players));
  assert.equal((html.match(/class="tv-walkout-member[ "]/g) || []).length, 7);
  assert.equal((html.match(/tv-walkout-mark/g) || []).length, 1, "one chip carries the song");
  assert.match(html, /tv-walkout-member is-singer/);
  assert.match(html, /Mr\. Brightside/);
  const solo = render(state, React.createElement(ui.TVWalkout, { state,
    moment:{ ...view, team:null, id:"s", anchor:0, elapsed:3000 } }));
  assert.doesNotMatch(solo, /is-team/, "an individual win stays as it was");
  const mvp = render(state, React.createElement(ui.TVWalkout, { state,
    moment:{ ...view, mvp:true, mvpEvent:"5v5 Full Court", id:"v", anchor:0, elapsed:3000 } }));
  assert.match(mvp, /tv-walkout is-mvp/, "an MVP's walkout is about the MVP");
});

test("a teammate's phone: the team's name, everyone's chip, theirs lit", () => {
  const { state } = buildScenario(TV_SCENARIOS, "tv-walkout-team7");
  const view = ui.walkoutView(state, allEventsOf(state));
  const html = render(state, React.createElement(ui.PhoneWalkout, { state, me:"Richard",
    moment:{ ...view, id:"m", anchor:0, elapsed:1500 } }));
  assert.match(html, /fd-moment-walkout is-team/);
  assert.ok(html.includes(inHtml(drawnName(state, view.team.players))));
  assert.equal((html.match(/fd-walkout-member/g) || []).length, 7);
  assert.match(html, /fd-walkout-member is-you"/, "you, lit among them (not the singer)");
  assert.match(html, /fd-walkout-member is-singer/);
});

test("the Now playing strip leads with the team, then the song", () => {
  const { state } = buildScenario(TV_SCENARIOS, "tv-nowplaying-team7");
  const events = allEventsOf(state);
  const at = state.showControl.audio.walkout.startedAt + 12000;
  const model = nowPlayingModel(state, events, at);
  const name = drawnName(state, model.team.players);
  assert.equal(model.team.name, name);
  const html = render(state, React.createElement(ui.NowPlaying, { state, events, now:() => at }));
  assert.match(html, /tv-now is-team/);
  assert.equal((html.match(/<span style="--i:/g) || []).length, 7, "the chip stack");
  assert.ok(html.indexOf(inHtml(name)) >= 0 && html.indexOf(inHtml(name)) < html.indexOf("Mr. Brightside"));
  assert.ok(ui.nowTeamNameSize("Henry Nguyen & Squilliam", 2) >= 24 && ui.nowTeamNameSize("The Sidewinders", 7) <= 28);
  const solo = buildScenario(TV_SCENARIOS, "tv-nowplaying").state;
  assert.equal(nowPlayingModel(solo, allEventsOf(solo), solo.showControl.audio.walkout.startedAt + 12000).team, null);
});

/* ── the sky strip ── */
test("the sky: a slot per event in slate order, lit in its winner's color, the live one marked", () => {
  const state = base();
  const events = allEventsOf(state);
  const empty = ui.skyModel(state, events, null, "putt");
  assert.equal(empty.slots.length, events.length - 1, "every event but the finale");
  assert.ok(empty.slots.every((slot, i) => i === 0 || slot.x > empty.slots[i - 1].x), "evenly along the strip");
  assert.equal(empty.slots[0].live, true);
  assert.equal(empty.stars.length, 0);
  state.shelved = { where:true };
  assert.equal(ui.skyModel(state, events, null, null).slots.length, events.length - 2, "a shelved event has no slot");
  state.draws.die = { id:"d", teams:[{ players:["Ben", "Evan"] }, { players:["Adi", "Khoa"] }] };
  state.results.putt = { slots:[["Evan"], ["Adi"], ["Khoa"]], ts:1, revision:1 };
  state.results.die = { slots:[["Evan", "Ben"], ["Adi", "Khoa"]], ts:2, revision:1 };
  const live = ui.skyModel(state, events, null, null);
  assert.equal(live.stars.length, 2);
  assert.equal(live.stars[1].colorOf, "Ben", "a pair lights in its first member's color");
  assert.equal(live.stars[1].team, "Ben & Evan");
  assert.equal(postedWinner(state, events.find(ev => ev.id === "putt")).team, null);
  state.frozen = true;
  const crowned = ui.skyModel(state, events, [{ player:"Evan", rank:1, pts:5000 }, { player:"Adi", rank:2, pts:4000 }]);
  assert.equal(crowned.champion, "Evan");
  assert.equal(crowned.lines.length, 1);
  assert.deepEqual(crowned.lines[0].points.map(slot => slot.id), ["putt", "die"]);
  assert.match(ui.skyArc(crowned.lines[0].points[0], crowned.lines[0].points[1]), /^M[\d.]+ 62Q/);
  const html = render(state, React.createElement(ui.SkyStrip, { state, events,
    standings:[{ player:"Evan", rank:1, pts:5000 }, { player:"Adi", rank:2, pts:4000 }] }));
  assert.match(html, /fd-sky-star is-lit is-champ/);
  assert.match(html, /fd-sky-line/);
  assert.doesNotMatch(html, /fd-sky-reading/, "nothing read until a tap");
});
