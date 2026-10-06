import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

/* Team names (Oct 3, owner: "a better, more fun / personalized approach").
   The generator (shared/teamNames.js), the nameTeam write
   (worker/teamNames.js), the room's stamp, and the phone's card. */
globalThis.__FD_BUILD_ID__ = "build-test";
const root = fileURLToPath(new URL("../", import.meta.url));

const core = await import("../shared/core.js");
const { CHIP_COLORS, EMPTY_STATE, ROSTER, allEventsOf, computeStandings, resolveWager, resolveCurrentContest, teamLabel } = core;
const names = await import("../shared/teamNames.js");
const { applyAction } = await import("../worker/actions.js");
const { publicState } = await import("../worker/publicState.js");
const { fresh, act, withoutBets } = await import("../dev/fit/scenarios.js");
const { roomSnapshot, roomCues } = await import("../src/features/tv/roomSound.js");
const model = await import("../src/features/teams/teamNameModel.js");

const compiled = await build({
  stdin:{ contents:`
    export { TeamNameCard, TeamNamesHome, TeamNameDesk, TeamNameRow, teamNameAutoOpen, TEAMNAME_FRESH_MS } from "./src/features/teams/TeamNameCard.jsx";
    export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";`,
  resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react", "react-dom", "qrcode-generator", "three"], loader:{ ".css":"empty" },
  write:false, logLevel:"silent",
});
const mod = new Module(fileURLToPath(new URL("team-names.cjs", import.meta.url)));
mod.filename = mod.id;
mod.paths = Module._nodeModulePaths(root);
mod._compile(compiled.outputFiles[0].text, mod.filename);
const ui = mod.exports;
const render = (state, node) => renderToStaticMarkup(React.createElement(ui.PlayerIdentityProvider, { profiles:state.profiles }, node));

let seq = 0;
const guest = player => ({ isGm:false, player, deviceId:`dev-${player}`, actionId:`a${++seq}` });
const gm = () => ({ isGm:true, player:"Brandon", deviceId:"dev-gm", actionId:`g${++seq}` });
const eventOf = (state, id) => allEventsOf(state).find(ev => ev.id === id);
const nameTeam = (state, payload, ctx) => applyAction(state, "nameTeam", payload, ctx);
const ref = (state, evId, team) => ({ evId, drawId:state.draws[evId].id, team });
const outsider = (state, evId, team) => ROSTER.find(p => !state.draws[evId].teams[team].players.includes(p));

/* every roster combination we can make, with every color and number */
const member = (i, k) => ({ name:ROSTER[i % ROSTER.length], num:(i * 7 + k) % 100, color:CHIP_COLORS[(i + k) % CHIP_COLORS.length].hex });
const GAMES = ["basketball", "volleyball", "trivia", "pong", "die", "pickleball", "8ball", "putting", "ragecage", "beerio", "where", null];

test("suggestions are deterministic per seed, short, distinct and clean", () => {
  for (let k = 0; k < 120; k++) {
    const size = [2, 3, 6, 7][k % 4];
    const members = Array.from({ length:size }, (_, i) => member(i + k, k));
    const input = { seed:`s${k}:${k % 4}`, members, game:GAMES[k % GAMES.length] };
    const first = names.suggestTeamNames(input, 0);
    assert.deepEqual(names.suggestTeamNames(input, 0), first, "the same team, the same three");
    assert.equal(first.length, 3);
    assert.equal(new Set(first.map(names.teamNameKey)).size, 3, "three different names");
    const sequence = names.suggestionSequence(input);
    for (const name of sequence) {
      assert.ok(name.length <= names.SUGGESTION_MAX, `${name} is short`);
      assert.ok(names.safeName(name), `${name} is clean`);
      assert.ok(!/69|420|666/.test(name));
    }
    assert.notDeepEqual(names.suggestTeamNames(input, 1), first, "a shuffle draws the next three");
  }
  /* other teams' names never come back as a suggestion */
  const input = { seed:"x", members:[member(0, 0), member(1, 0), member(2, 0)], game:"trivia" };
  const [taken] = names.suggestTeamNames(input, 0);
  assert.ok(!names.suggestionSequence({ ...input, taken:[taken.toUpperCase()] }).includes(taken));
});

test("suggestions come from the team: names, numbers, colors and the game", () => {
  const members = [{ name:"Brandon", num:7, color:"#D89C2F" }, { name:"Khoa", num:23, color:"#2F7E83" }];
  const pools = names.teamNameCandidates({ members, game:"pong", size:2 });
  assert.ok(pools.name.includes("Brankhoa"), "a blend of two first names");
  assert.ok(pools.number.includes("Seven Twenty-Three"), "their numbers, spelled out");
  assert.ok(pools.color.includes("Gold Rush") && pools.color.includes("Gold & Teal"), "their chip colors");
  assert.ok(pools.game.includes("Re-Rack City"), "what they are playing");
  assert.equal(names.numberWord(47), "Forty-Seven");
  assert.equal(names.firstName("j vo"), null, "a one-letter first name makes no name");
  /* a bracket's draw id seeds without its clock, so a seeded rehearsal repeats */
  assert.equal(names.drawSeed("d1791022710355-0sl400jv"), "0sl400jv");
});

test("a draw names its teams of three or more, no two alike; pairs keep their names", () => {
  const volley = fresh("event:volley:open").draws.volley;
  assert.equal(volley.teams.length, 4);
  assert.ok(volley.teams.every(team => team.name && team.name.length <= names.SUGGESTION_MAX && !team.named));
  assert.equal(new Set(volley.teams.map(team => names.teamNameKey(team.name))).size, 4);
  const die = fresh("event:die:open").draws.die;
  assert.ok(die.teams.every(team => !team.name), "a pair reads as its two names");
  const state = fresh("event:die:open");
  assert.match(teamLabel(state, state.draws.die.teams[0]), / & /);
});

test("old draws without names still label", () => {
  const state = structuredClone(EMPTY_STATE);
  assert.equal(teamLabel(state, { players:["Evan", "Ben", "Adi"] }), "Team Evan");
  assert.equal(teamLabel(state, { players:["Evan", "Ben"] }), "Evan & Ben");
  state.draws.volley = { id:"d1-old", teams:[{ players:["Evan", "Ben", "Adi"] }, { name:"The Quail", players:["Khoa", "Sahil", "Henry"] }] };
  const naming = model.teamNaming(state, eventOf(state, "volley"), 0);
  assert.equal(naming.label, "Team Evan");
  assert.equal(naming.suggestions.length, 3);
});

test("a member names the team; a stranger cannot; the commissioner can", () => {
  const state = fresh("event:volley:open");
  const team = state.draws.volley.teams[0];
  const [a, b] = team.players;
  const result = nameTeam(state, { ...ref(state, "volley", 0), name:"  Sets  Appeal " }, guest(a));
  assert.equal(result.ok, true, result.error);
  assert.equal(team.name, "Sets Appeal", "trimmed, one space");
  assert.equal(team.named.by, a);
  assert.ok(team.named.at > 0);
  assert.equal(nameTeam(state, { ...ref(state, "volley", 0), name:"Block Party" }, guest(b)).ok, true, "any teammate");
  const stranger = nameTeam(state, { ...ref(state, "volley", 0), name:"Not Yours" }, guest(outsider(state, "volley", 0)));
  assert.equal(stranger.ok, false);
  assert.equal(team.name, "Block Party");
  const commissioner = nameTeam(state, { ...ref(state, "volley", 1), name:"Net Gain" }, gm());
  assert.equal(commissioner.ok, true, commissioner.error);
  assert.equal(state.draws.volley.teams[1].named.gm, true);
});

test("stale draws, duplicates, blanks and long names are refused", () => {
  const state = fresh("event:volley:open");
  const [a] = state.draws.volley.teams[0].players;
  const other = state.draws.volley.teams[1].name;
  assert.match(nameTeam(state, { evId:"volley", drawId:"d0-old", team:0, name:"X Factor" }, guest(a)).error, /teams changed/i);
  assert.match(nameTeam(state, { ...ref(state, "volley", 0), name:other.toLowerCase() }, guest(a)).error, /Another team/);
  assert.match(nameTeam(state, { ...ref(state, "volley", 0), name:"   " }, guest(a)).error, /required/);
  assert.match(nameTeam(state, { ...ref(state, "volley", 0), name:"Les Quizerables Reunited!" }, guest(a)).error, /24/);
  assert.equal(nameTeam(state, { ...ref(state, "volley", 0), name:"Les Quizerables Reunited" }, guest(a)).ok, true);
  assert.match(nameTeam(state, { ...ref(state, "volley", 0), name:"Unstoppableforcefield" }, guest(a)).error, /Words up to 15/,
    "a word too long for a TV card");
  assert.match(nameTeam(state, { ...ref(state, "volley", 9), name:"Nine" }, guest(a)).error, /No such team/);
  assert.equal(names.cleanTeamName("Line\nbreak"), "Line break", "one line");
});

test("names lock when the contest locks; the commissioner can still rename", () => {
  const state = fresh("event:volley:open");
  const ev = eventOf(state, "volley");
  const contest = resolveCurrentContest(state, ev);
  act(state, "lockAndStart", { evId:"volley", contestId:contest.id, contestRevision:contest.revision });
  assert.equal(names.teamNamesLocked(state, "volley"), true);
  const [a] = state.draws.volley.teams[0].players;
  assert.match(nameTeam(state, { ...ref(state, "volley", 0), name:"Too Late" }, guest(a)).error, /locked/);
  assert.equal(model.myTeamNaming(state, ev, a), null, "the card leaves Home");
  assert.equal(nameTeam(state, { ...ref(state, "volley", 0), name:"Fixed By GM" }, gm()).ok, true);
});

test("a pair may take a name and give it back", () => {
  const state = fresh("event:die:open");
  const [a, b] = state.draws.die.teams[0].players;
  assert.equal(nameTeam(state, { ...ref(state, "die", 0), name:"Roll Models" }, guest(a)).ok, true);
  assert.equal(teamLabel(state, state.draws.die.teams[0]), "Roll Models");
  assert.equal(nameTeam(state, { ...ref(state, "die", 0), name:null }, guest(b)).ok, true);
  assert.equal(state.draws.die.teams[0].name, undefined);
  assert.match(teamLabel(state, state.draws.die.teams[0]), / & /);
  const big = fresh("event:volley:open");
  assert.match(nameTeam(big, { ...ref(big, "volley", 0), name:null }, guest(big.draws.volley.teams[0].players[0])).error, /required/);
});

test("a retried name is acknowledged once, even after a teammate renamed it", () => {
  const state = fresh("event:volley:open");
  const [a, b] = state.draws.volley.teams[0].players;
  const ctx = guest(a);
  assert.equal(nameTeam(state, { ...ref(state, "volley", 0), name:"First Try" }, ctx).ok, true);
  const again = nameTeam(state, { ...ref(state, "volley", 0), name:"First Try" }, ctx);
  assert.equal(again.ok, true);
  assert.equal(again.extra.unchanged, true);
  assert.equal(nameTeam(state, { ...ref(state, "volley", 0), name:"Second Try" }, guest(b)).ok, true);
  const late = nameTeam(state, { ...ref(state, "volley", 0), name:"First Try" }, ctx);
  assert.equal(late.extra.unchanged, true);
  assert.equal(state.draws.volley.teams[0].name, "Second Try", "a late retry never undoes a teammate");
  assert.match(nameTeam(state, { ...ref(state, "volley", 0), name:"Different" }, ctx).error, /already used/);
  /* the ledger is the server's: device ids never leave */
  const frame = publicState(state, { isGm:false, player:a });
  assert.equal(frame.eventOps.volley.nameCommands, undefined);
  assert.ok(!JSON.stringify(frame).includes("dev-"));
});

test("renaming never moves a chip: standings and every bet settle the same", () => {
  for (const target of ["event:volley:open", "event:volley:mid", "event:bball5:done"]) {
    const state = fresh(target);
    const evId = target.split(":")[1];
    const events = allEventsOf(state);
    const settle = s => s.wagers.map(w => resolveWager(s, w, events));
    const before = { standings:computeStandings(state), bets:settle(state), wagers:structuredClone(state.wagers),
      brackets:structuredClone(state.brackets), results:structuredClone(state.results) };
    state.draws[evId].teams.forEach((team, index) => {
      const result = nameTeam(state, { ...ref(state, evId, index), name:`Renamed ${index}` }, gm());
      assert.equal(result.ok, true, result.error);
    });
    assert.deepEqual(computeStandings(state), before.standings, `${target}: the board`);
    assert.deepEqual(settle(state), before.bets, `${target}: every bet`);
    assert.deepEqual(state.wagers, before.wagers);
    assert.deepEqual(state.brackets, before.brackets);
    assert.deepEqual(state.results, before.results);
  }
  /* and a bet placed after a rename still lands on its side */
  const state = withoutBets(fresh("event:volley:open"));
  nameTeam(state, { ...ref(state, "volley", 0), name:"Renamed" }, gm());
  const contest = resolveCurrentContest(state, eventOf(state, "volley"));
  const side = contest.sides[0];
  const bettor = ROSTER.find(p => !contest.sides.some(s => s.players.includes(p)));
  const placed = applyAction(state, "placeWager", { wager:{ eventId:"volley", evName:"Sand Volleyball", contestId:contest.id,
    contestRevision:contest.revision, pickPlayers:[...side.players], kind:"match", pickTeam:true, drawId:contest.drawId,
    match:[...contest.match], teamIdx:side.key, matchName:contest.label, stake:100 } }, guest(bettor));
  assert.equal(placed.ok, true, placed.error);
});

test("the TV stamps a new name once, on a fresh rename only", () => {
  const state = fresh("event:volley:open");
  const events = allEventsOf(state);
  const prev = roomSnapshot(state, events);
  nameTeam(state, { ...ref(state, "volley", 2), name:"Dig Deep" }, gm());
  const cues = roomCues(prev, roomSnapshot(state, events), { now:Date.now() });
  assert.deepEqual(cues.map(cue => cue.id), ["stamp"]);
  assert.equal(cues[0].at, state.draws.volley.teams[2].named.at);
  /* a whole new draw is not a rename */
  const redrawn = structuredClone(state);
  redrawn.draws.volley = { ...redrawn.draws.volley, id:"d2-new" };
  redrawn.draws.volley.teams = redrawn.draws.volley.teams.map(team => ({ ...team, named:{ at:Date.now() + 5 } }));
  assert.ok(!roomCues(roomSnapshot(state, events), roomSnapshot(redrawn, events)).some(cue => cue.id === "stamp"));
});

test("the card: Name your team, three suggestions with the current one lit, then gone once locked", () => {
  const state = fresh("event:volley:open");
  const ev = eventOf(state, "volley");
  const me = state.draws.volley.teams[0].players[0];
  const naming = model.myTeamNaming(state, ev, me);
  const html = render(state, React.createElement(ui.TeamNameCard, { state, ev, me }));
  assert.match(html, /<h2 class="fd-teamname-ask">Name your team<\/h2>/, "the heading asks, no label over it");
  assert.equal((html.match(/class="fd-teamname-chip(?: is-on)?"/g) || []).length, 3, "three suggestions");
  /* as markup: a seeded name can carry "&" ("Sahchard & Co.") */
  const asMarkup = String(naming.name).replace(/&/g, "&amp;");
  assert.ok(html.includes(asMarkup), "the current name");
  const pattern = asMarkup.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.ok(new RegExp(`aria-pressed="true"[^>]*><span>${pattern}</span>`).test(html), "the draw's name is one of the three, lit");
  assert.match(html, /Write your own/);
  assert.ok(!html.includes("—"), "no em dashes");
  /* Home: the live event's card carries the pencil itself, so no separate row */
  assert.equal(model.homeTeamNameEvent(state, me, allEventsOf(state)), "volley");
  assert.equal(render(state, React.createElement(ui.TeamNamesHome, { state, me, events:allEventsOf(state) })), "");
  /* any other event's row: the team's name and the pencil; the chips stay closed */
  const home = render(state, React.createElement(ui.TeamNameRow, { state, ev, me }));
  assert.ok(home.includes(asMarkup), "the row carries the team's name");
  assert.match(home, /aria-expanded="false"/);
  assert.match(home, /Rename/);
  assert.equal((home.match(/class="fd-teamname-chip/g) || []).length, 0, "no suggestions until opened");
  /* opened by itself once, right after the draw, for a member who has not seen it */
  const at = state.draws.volley.ts;
  assert.equal(ui.teamNameAutoOpen(state, naming, me, { now:at + 1000, wasSeen:() => false }), true);
  assert.equal(ui.teamNameAutoOpen(state, naming, me, { now:at + 1000, wasSeen:() => true }), false, "seen once");
  assert.equal(ui.teamNameAutoOpen(state, naming, me, { now:at + ui.TEAMNAME_FRESH_MS + 1, wasSeen:() => false }), false,
    "not long after the draw");
  const spectator = render(state, React.createElement(ui.TeamNamesHome, { state, me:outsider(state, "volley", 0),
    events:[ev] }));
  assert.ok(!spectator.includes(asMarkup), "only your own team");
  /* a teammate names it: the card shows the new name, with their photo chip */
  const mate = state.draws.volley.teams[0].players[1];
  nameTeam(state, { ...ref(state, "volley", 0), name:"Sets Appeal" }, guest(mate));
  const named = render(state, React.createElement(ui.TeamNameCard, { state, ev, me }));
  assert.ok(named.includes("Sets Appeal") && named.includes(`Named by ${state.profiles?.[mate]?.display || mate}`));
  const desk = render(state, React.createElement(ui.TeamNameDesk, { state, ev }));
  assert.equal((desk.match(/fd-teamname /g) || []).length, 4, "the commissioner sees every team");
  const contest = resolveCurrentContest(state, ev);
  act(state, "lockAndStart", { evId:"volley", contestId:contest.id, contestRevision:contest.revision });
  assert.equal(render(state, React.createElement(ui.TeamNameCard, { state, ev, me })), "");
});
