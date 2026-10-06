/* v3.1 comebacks: underdog odds and byes to the bottom (the leader bounty
   was cut on Oct 4). Both are fixed at a named moment, so corrections move
   them with the record and later standings never do. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_STATE, ROSTER, PT, START, UNDERDOG_MULT, allEventsOf, computeStandings, resolveCurrentContest,
  resolveWager, makeBracket, seedBracket, bracketByeSlots, oddsFor, contestMult,
  wagerMult, atRisk, maxRisk, resolveSlot, stacksPosted,
} from "../shared/core.js";
import { applyAction } from "./support/confirmed-start.mjs";

let serial = 0;
const fresh = () => structuredClone(EMPTY_STATE);
const event = (s, id) => allEventsOf(s).find(e => e.id === id);
const current = (s, id) => resolveCurrentContest(s, event(s, id));
const refs = c => ({ contestId:c.id, contestRevision:c.revision });
const gm = () => ({ isGm:true, player:ROSTER[0], deviceId:"host", actionId:`host-${++serial}` });
const guest = player => ({ player, deviceId:`device-${player}`, actionId:`chip-${++serial}` });
const act = (s, type, payload, ctx = gm()) => {
  const result = applyAction(s, type, payload, ctx);
  assert.equal(result.ok, true, `${type}: ${result.error}`);
  return result;
};
const reject = (s, type, payload, ctx, pattern) => {
  const result = applyAction(s, type, payload, ctx);
  assert.equal(result.ok, false, `${type} should reject`);
  if (pattern) assert.match(result.error, pattern);
};
const rule = (s, player, delta) => act(s, "adjust", { player, delta, reason:"setup" });
const row = (s, player) => computeStandings(s).find(item => item.player === player);
const lock = (s, id) => act(s, "lockAndStart", { evId:id, ...refs(current(s, id)) });
const win = (s, id, winner) => act(s, "recordContestWinner", { evId:id, ...refs(current(s, id)), winner });
const matchChip = (s, id, key, stake = PT) => {
  const c = current(s, id);
  return { kind:"match", eventId:id, evName:event(s, id).name, stake, ...refs(c), match:c.match, teamIdx:key, drawId:c.drawId };
};
/* Beer Die as six pairs in the stored hand-drawn six shape: the first
   contest is team 3 (ROSTER 6, 7) against team 4 (ROSTER 8, 9). */
function dieBoard(setup = () => {}) {
  const s = fresh();
  s.live = true;
  setup(s);
  s.draws.die = { id:"draw-die", ts:1, teams:Array.from({ length:6 }, (_, key) => ({ players:ROSTER.slice(key * 2, key * 2 + 2) })) };
  s.brackets.die = makeBracket(6);
  act(s, "announceEvent", { evId:"die" });
  return s;
}

test("underdog odds: a 1,000 gap pays the lower side 2:1, fixed at the open", () => {
  const s = dieBoard(state => { rule(state, ROSTER[8], 500); rule(state, ROSTER[9], 500); });
  const c = current(s, "die");
  assert.deepEqual(c.odds && { underdog:c.odds.underdog, mult:c.odds.mult }, { underdog:3, mult:UNDERDOG_MULT });
  assert.equal(contestMult(c, 3), 2);
  assert.equal(contestMult(c, 4), 1);
  const spectator = ROSTER[12];
  act(s, "placeWager", { wager:matchChip(s, "die", 3) }, guest(spectator));
  act(s, "placeWager", { wager:matchChip(s, "die", 4) }, guest(ROSTER[11]));
  const [fav] = s.wagers.filter(w => w.player === ROSTER[11]);
  const [dog] = s.wagers.filter(w => w.player === spectator);
  assert.equal(dog.mult, 2, "the ticket keeps the payout it was placed at");
  assert.equal(fav.mult, 1);
  /* competitors still back only their own side, one side per contest */
  reject(s, "placeWager", { wager:matchChip(s, "die", 4) }, guest(ROSTER[6]), /yourself or your team/);
  reject(s, "placeWager", { wager:matchChip(s, "die", 4) }, guest(spectator), /One side per contest/);
  /* standings moving after the open never move the odds or the ticket */
  rule(s, ROSTER[6], 2000);
  assert.equal(current(s, "die").odds.underdog, 3);
  act(s, "placeWager", { wager:matchChip(s, "die", 3) }, guest(spectator));
  assert.equal(s.wagers.find(w => w.player === spectator).mult, 2);
  lock(s, "die");
  win(s, "die", 3);
  const events = allEventsOf(s);
  assert.deepEqual(resolveWager(s, dog, events), { status:"won", delta:2 * dog.stake });
  assert.deepEqual(resolveWager(s, fav, events), { status:"lost", delta:-fav.stake });
  /* a correction reopening the contest keeps its stored odds */
  const top = s.eventOps.die.contestStack.at(-1);
  act(s, "undoLastContest", { evId:"die", contestId:top.id, contestRevision:s.eventOps.die.contestRevision });
  assert.equal(current(s, "die").odds.underdog, 3);
});

test("underdog odds: |average A - average B| x the smaller side's size, 1,000 or more", () => {
  const close = dieBoard(state => { rule(state, ROSTER[8], 400); rule(state, ROSTER[9], 500); });
  assert.equal(current(close, "die").odds, undefined, "a 900 gap is even money");
  assert.equal(close.eventOps.die.odds[current(close, "die").id].underdog, null);
  const pairs = { sides:[{ key:0, players:[ROSTER[0], ROSTER[1]] }, { key:1, players:[ROSTER[2], ROSTER[3]] }] };
  const s = fresh();
  rule(s, ROSTER[2], 500); rule(s, ROSTER[3], 500);
  assert.equal(oddsFor(s, pairs).underdog, 0, "2,000 against 3,000 combined");
  /* the 7 v 6 full court: sums differ by a player, averages do not */
  const court = { sides:[{ key:0, players:ROSTER.slice(0, 7) }, { key:1, players:ROSTER.slice(7) }] };
  assert.equal(oddsFor(fresh(), court).underdog, null);
  const lifted = fresh();
  ROSTER.slice(7).forEach(player => rule(lifted, player, 500));
  assert.equal(oddsFor(lifted, court).underdog, 0);
  /* the 7 v 6 compares at six players: 150 a head is 900, 200 a head 1,200 */
  const near = fresh(), far = fresh();
  ROSTER.slice(7).forEach((player, i) => { rule(near, player, i ? 100 : 400); rule(far, player, 200); });
  assert.deepEqual(oddsFor(near, court), { underdog:null, gap:900 });
  assert.equal(oddsFor(far, court).gap, 1200);
  assert.equal(oddsFor(far, court).underdog, 0);
  /* a 1v1 needs a real 1,000-chip gap */
  const solo = { sides:[{ key:0, players:[ROSTER[0]] }, { key:1, players:[ROSTER[1]] }] };
  const nine = fresh(); rule(nine, ROSTER[1], 900);
  assert.deepEqual(oddsFor(nine, solo), { underdog:null, gap:900 });
  const thousand = fresh(); rule(thousand, ROSTER[1], 1000);
  assert.deepEqual(oddsFor(thousand, solo), { underdog:0, mult:UNDERDOG_MULT, gap:1000 });
  /* a pair: 1,000 combined (500 a head), and 900 combined is even money */
  const pairNine = fresh(); rule(pairNine, ROSTER[2], 400); rule(pairNine, ROSTER[3], 500);
  assert.equal(oddsFor(pairNine, pairs).underdog, null);
  assert.equal(oddsFor(s, pairs).gap, 1000);
  /* the wide field keeps 2:1 everywhere and carries no odds */
  assert.equal(oddsFor(fresh(), { sides:ROSTER.map(key => ({ key, players:[key] })) }), null);
});

test("legacy tickets keep their original payouts", () => {
  const s = dieBoard();
  lock(s, "die");
  const c = current(s, "die");
  s.wagers.push({ id:"old-match", kind:"match", eventId:"die", drawId:"draw-die", match:[0, 0], teamIdx:3,
    stake:300, player:ROSTER[12], status:"open" });
  s.wagers.push({ id:"old-outright", kind:"outright", eventId:"putt", pick:ROSTER[1], stake:100, player:ROSTER[12], status:"open" });
  assert.equal(wagerMult(s.wagers.at(-2)), 1);
  assert.equal(wagerMult(s.wagers.at(-1)), 2);
  win(s, "die", 3);
  assert.equal(resolveWager(s, s.wagers.find(w => w.id === "old-match"), allEventsOf(s)).delta, 300);
  assert.equal(c.kind, "match");
});

const teamsOf = players => players.map(list => ({ players:list }));
function seededBoard(n) {
  const s = fresh();
  /* distinct strengths: roster players climb by 100s; fillers sit at 1,000 */
  const players = Array.from({ length:n }, (_, index) => ROSTER[index] || `Filler${index}`);
  players.forEach((player, index) => {
    if (ROSTER.includes(player)) s.adjustments.push({ id:`r${index}`, player, delta:(index + 1) * PT * 3, ts:1 });
  });
  const pts = Object.fromEntries(computeStandings(s).map(item => [item.player, item.pts]));
  const strength = player => pts[player] ?? START;
  const draw = { id:`draw-${n}`, ts:7, teams:teamsOf(players.map(player => [player])) };
  return { s, draw, strength, players };
}

test("byes go to the lowest-ranked entrants for 3 to 16, and the seeds ride on the bracket", () => {
  for (let n = 3; n <= 16; n++) {
    const { s, draw, strength, players } = seededBoard(n);
    const br = seedBracket(s, draw);
    const byeCount = bracketByeSlots(makeBracket(n)).length;
    const ranked = [...players.keys()].sort((a, b) => strength(players[a]) - strength(players[b]));
    const lowest = new Set(ranked.slice(0, byeCount));
    const firstRound = new Set(br.rounds[0].flatMap(match => [match.a.t, match.b.t]));
    assert.equal(br.seeds.length, n, `${n}: seeds stored`);
    assert.deepEqual([...br.seeds].sort((a, b) => a - b), [...players.keys()], `${n}: every team seeded once`);
    assert.equal((br.byes || []).length, byeCount, `${n}: bye count`);
    for (const team of br.byes || []) {
      assert.ok(lowest.has(team), `${n}: ${players[team]} has a bye and is among the lowest`);
      assert.ok(!firstRound.has(team), `${n}: a bye skips the first round`);
    }
    assert.deepEqual(seedBracket(s, draw), br, `${n}: the seeding replays`);
    /* every team still appears exactly once across the bracket's entry slots */
    const entries = br.rounds.flatMap(round => round.flatMap(match => [match.a, match.b])).filter(slot => slot.t !== undefined);
    assert.equal(entries.length, n);
  }
});

test("a level board keeps the draw order, and the live draw seeds its bracket", () => {
  const level = seedBracket(fresh(), { id:"d", ts:1, teams:teamsOf(ROSTER.slice(0, 6).map(player => [player])) });
  assert.deepEqual(level.seeds, [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(level.rounds, makeBracket(6).rounds);
  const s = fresh();
  s.live = true;
  rule(s, ROSTER[0], 2000); rule(s, ROSTER[1], 1500); rule(s, ROSTER[2], 1200);
  act(s, "announceAndDraw", { evId:"die" });
  const br = s.brackets.die;
  assert.ok(Array.isArray(br.seeds) && br.seeds.length === 6);
  const pts = Object.fromEntries(computeStandings(s).map(item => [item.player, item.pts]));
  const avg = key => s.draws.die.teams[key].players.reduce((sum, player) => sum + pts[player], 0) / 2;
  const byes = br.byes;
  const others = [0, 1, 2, 3, 4, 5].filter(key => !byes.includes(key));
  assert.ok(Math.max(...byes.map(avg)) <= Math.min(...others.map(avg)), "the byes hold the bottom of the board");
  /* the first contest is a play-in between two teams that did not get a bye */
  const c = current(s, "die");
  c.sides.forEach(side => assert.ok(!byes.includes(side.key)));
  assert.equal(resolveSlot(br, br.rounds[1][0].a), byes[0]);
});

test("the full weekend still closes through the QA fast-forward with comebacks in play", () => {
  const LOCAL = { isGm:true, qa:true, progressReset:true, environment:"local" };
  let dogs = 0, byes = 0;
  for (const seed of [7, 1234, 99]) {
    const s = fresh();
    const result = applyAction(s, "qaAdvance", { target:"crowned", seed }, LOCAL);
    assert.equal(result.ok, true, result.error);
    assert.equal(s.frozen, true);
    const stacks = Object.values(s.results).find(item => item?.stacks);
    computeStandings(s).forEach(item => {
      const after = (s.adjustments || []).filter(a => !a.removedAt && a.player === item.player && a.pokerRevision !== undefined)
        .reduce((sum, a) => sum + a.delta, 0);
      assert.equal(item.pts, (stacks.stacks[item.player] ?? 0) + after, `${seed}: ${item.player} is their counted stack`);
    });
    for (const op of Object.values(s.eventOps)) {
      dogs += Object.values(op.odds || {}).filter(odds => odds.underdog !== null).length;
    }
    byes += Object.values(s.brackets).filter(br => br.byes?.length).length;
    s.wagers.filter(w => w.status !== "void").forEach(w => {
      const resolved = resolveWager(s, w, allEventsOf(s));
      if (resolved.status === "won") assert.equal(resolved.delta, wagerMult(w) * w.stake);
    });
  }
  assert.ok(dogs > 0, "some contests opened with underdog odds");
  assert.ok(byes > 0, "brackets seated byes");
});

/* ── the forced crew check ── */
import Module from "node:module";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { resolveDirector } from "../shared/show.js";
import { directorPill } from "../src/features/director/directorPill.js";
import { crewCheckModel, crewCheckRun, cycleRole, seatChoices, setCrewRole, suggestedCrew, toggleCrew } from "../src/features/director/crewCheck.js";

const ui = (() => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const compiled = buildSync({
    stdin:{ contents:`export { CrewCheck } from "./src/features/director/CrewCheck.jsx";
      export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";
      export { SideTerms } from "./src/features/comebacks/Comebacks.jsx";
      export { contestTerms } from "./src/features/comebacks/comebacks.js";
      export { Leaderboard } from "./src/features/standings/Standings.jsx";`, resolveDir:root, loader:"jsx" },
    bundle:true, platform:"node", format:"cjs", external:["react"], loader:{ ".css":"empty" }, write:false, logLevel:"silent",
  });
  const mod = new Module(fileURLToPath(new URL("comebacks.cjs", import.meta.url)));
  mod.filename = mod.id; mod.paths = Module._nodeModulePaths(root);
  mod._compile(compiled.outputFiles[0].text, mod.filename);
  return mod.exports;
})();
const pillOf = (state, events = allEventsOf(state)) => directorPill(state, events, resolveDirector(state, events, { showControl:false }));
const ordered = ids => ({ ...fresh(), eventOrder:ids });
const runs = model => [model.run, ...model.extras.map(extra => extra.run)];
const drawsWithoutCheck = run => run?.write === "announceAndDraw" && Array.isArray(run.payload?.players)
  || run?.open === "draft";

test("the pill never runs a draw of people without the crew check", () => {
  for (const ids of [["pickleball"], ["volley"], ["bball5"], ["beerio"], ["bball1"], ["die"]]) {
    const state = ordered(ids);
    const model = pillOf(state);
    assert.equal(model.run.open, "crewCheck", `${ids[0]}: the beat opens the check`);
    assert.ok(model.run.then?.write === "announceAndDraw" || model.run.then?.open === "draft", ids[0]);
    for (const run of runs(model)) assert.ok(!drawsWithoutCheck(run), `${ids[0]}: ${JSON.stringify(run)}`);
    assert.ok(!model.extras.some(extra => extra.label === "Change crew"));
  }
  /* the draft's alternatives are checked too */
  const volley = pillOf(ordered(["volley"]));
  const random = volley.extras.find(extra => extra.label === "Random draw");
  assert.equal(random.run.open, "crewCheck");
  assert.equal(random.run.then.write, "announceAndDraw");
  const pairs = pillOf(ordered(["pickleball"]));
  assert.deepEqual(pairs.run.roles, suggestedCrew(ordered(["pickleball"]), event(fresh(), "pickleball")),
    "the suggestion is preselected and shown");
});

test("the confirmed crew reaches announceAndDraw, and Away changes the room", () => {
  const state = ordered(["pickleball"]);
  const ev = event(state, "pickleball");
  const run = pillOf(state).run;
  /* the commissioner swaps the suggested crew for someone else */
  let crew = run.roles;
  const suggested = crew[0].player;
  const chosen = ROSTER.find(player => player !== suggested);
  crew = toggleCrew(ev, toggleCrew(ev, crew, suggested), chosen);
  crew = cycleRole(ev, crew, chosen);
  const model = crewCheckModel(state, ev, crew);
  assert.equal(model.fit.ok, true);
  assert.equal(model.roster.find(item => item.player === chosen).state, "crew");
  assert.equal(model.roster.find(item => item.player === suggested).state, "playing");
  const write = crewCheckRun(run.then, model.playing, model.crew);
  act(state, write.write, write.payload);
  assert.deepEqual(state.draws.pickleball.roles, [{ player:chosen, role:crew[0].role }]);
  assert.ok(!state.draws.pickleball.teams.some(team => team.players.includes(chosen)));
  assert.ok(state.draws.pickleball.teams.some(team => team.players.includes(suggested)));

  /* someone away: the check follows the room, and the fit says so */
  const short = ordered(["pickleball"]);
  act(short, "setAway", { player:ROSTER[12], away:true });
  const after = crewCheckModel(short, ev, suggestedCrew(short, ev));
  assert.equal(after.roster.find(item => item.player === ROSTER[12]).state, "away");
  assert.equal(after.fit.ok, true, "twelve here play six pairs with no crew");
  assert.equal(after.crew.length, 0);
  /* one crew by hand: eleven left, so the odd one out joins the crew (auto) */
  const extra = crewCheckModel(short, ev, [{ player:ROSTER[0], role:"referee" }]);
  assert.equal(extra.fit.ok, true, extra.fit.error);
  assert.equal(extra.playing.length, 10);
  assert.equal(extra.crew.filter(item => item.auto).length, 1);

  /* a draft takes the confirmed room as its pool */
  const draft = crewCheckRun({ open:"draft", evId:"volley" }, ROSTER.slice(0, 12), [{ player:ROSTER[12], role:"referee" }]);
  assert.deepEqual(draft, { open:"draft", evId:"volley", pool:ROSTER.slice(0, 12), roles:[{ player:ROSTER[12], role:"referee" }] });
});

test("the crew check renders every player as a photo chip with the suggestion lit", () => {
  const state = ordered(["pickleball"]);
  const ev = event(state, "pickleball");
  state.away = { [ROSTER[11]]:true };
  const html = renderToStaticMarkup(React.createElement(ui.PlayerIdentityProvider, { profiles:{} },
    React.createElement(ui.CrewCheck, { state, ev, roles:[{ player:ROSTER[3], role:"referee" }], onConfirm:() => ({ ok:true }) })));
  assert.equal((html.match(/fd-crew-seat /g) || []).length, ROSTER.length);
  /* the picked crew, plus the odd one out of eleven as auto crew */
  assert.equal((html.match(/fd-crew-seat is-crew/g) || []).length, 2);
  assert.equal((html.match(/fd-crew-seat is-away/g) || []).length, 1);
  /* the auto seat carries the rotation mark, so it is clear why they are crew */
  assert.equal((html.match(/fd-crew-tag is-crew is-auto/g) || []).length, 1);
  assert.equal((html.match(/fd-crew-tag is-crew"/g) || []).length, 1, "the commissioner's own pick is a plain crew tag");
  assert.match(html, /Before the draw/);
  assert.match(html, /Announce and draw/);
  assert.doesNotMatch(html, /Tap |Choose /, "no helper text");
  /* any crew the commissioner picks fits: the odd one out goes to crew by itself */
  assert.doesNotMatch(html, /role="alert"/, "a room that fits raises nothing");
  /* no mode to pick first: a face opens its own choices in place, and the
     suggestion's crew member arrives open, so the way to change it shows */
  assert.doesNotMatch(html, /fd-crew-brush|role="radiogroup"/, "no brush");
  assert.equal((html.match(/class="fd-crew-choice"/g) || []).length, 1);
  assert.match(html, /fd-crew-seat is-crew is-open/);
  const choice = html.slice(html.indexOf('class="fd-crew-choice"'));
  for (const label of ["Playing", "Crew", "Sit out", "Away"]) assert.match(choice, new RegExp(`<span>${label}</span>`), label);
  /* Away writes at once, so it stands apart from the seat that rides on the confirm */
  const states = choice.slice(choice.indexOf("fd-crew-choice-states"), choice.indexOf("fd-crew-choice-away"));
  assert.doesNotMatch(states, /<span>Away<\/span>/);
  assert.match(choice.slice(choice.indexOf("fd-crew-choice-away")), /^[^]*?<span>Away<\/span>/);
  assert.match(choice, /class="fd-crew-option is-crew is-on" aria-pressed="true"/, "the face's state is the lit choice");
  /* a crew member's role is one control that steps to the next, a lamp per role */
  assert.match(choice, /class="fd-crew-role-cycle"[^>]*aria-label="[^"]*s role: [^"]*\. Next role"/);
  assert.match(choice, /fd-crew-role-name">Official</);
  assert.equal((choice.match(/<i class="is-on"><\/i>/g) || []).length, 1, "one role lamp lit");
  /* the open face's choices follow its row: inserted after the fourth seat (ROSTER[3] is in the first row) */
  const seatsBefore = (html.slice(0, html.indexOf('class="fd-crew-choice"')).match(/fd-crew-seat /g) || []).length;
  assert.equal(seatsBefore, 4);
});

test("a face's choices: Crew takes a role or the next in turn, Sit out only while the room can spare someone", () => {
  const state = ordered(["volley"]);
  const ev = event(state, "volley");
  let crew = setCrewRole(ev, [], ROSTER[0]);
  assert.deepEqual(crew, [{ player:ROSTER[0], role:"referee" }], "the next role in turn");
  crew = setCrewRole(ev, crew, ROSTER[0], "photographer");
  assert.deepEqual(crew, [{ player:ROSTER[0], role:"photographer" }], "a crew member keeps the seat, takes the role");
  assert.deepEqual(setCrewRole(ev, crew, ROSTER[0]), crew, "Crew again changes nothing");
  assert.deepEqual(setCrewRole(ev, crew, ROSTER[1], "nope"), [...crew, { player:ROSTER[1], role:"scorekeeper" }]);
  const model = crewCheckModel(state, ev, crew);
  const entry = model.roster.find(item => item.player === ROSTER[2]);
  assert.deepEqual(seatChoices(model, entry), ["playing", "crew", "out", "away"]);
  const ten = ordered(["volley"]);
  ROSTER.slice(-3).forEach(player => act(ten, "setOut", { player, out:true }));
  const tight = crewCheckModel(ten, ev, []);
  assert.deepEqual(seatChoices(tight, tight.roster[0]), ["playing", "crew", "away"], "ten here: nobody can sit out");
});

/* ── a side's terms: only its payout (the leader bounty was cut on Oct 4) ── */
const html = (state, element) => renderToStaticMarkup(React.createElement(ui.PlayerIdentityProvider, { profiles:{} }, element));

test("a side's terms carry only its payout, and a clear leader lights nothing", () => {
  const s = dieBoard(st => rule(st, ROSTER[6], 600));
  const contest = current(s, "die");
  const terms = ui.contestTerms(s, contest);
  assert.equal(terms.any, false, "no odds, nothing to letter");
  for (const side of Object.values(terms.sides)) assert.deepEqual(Object.keys(side).sort(), ["each", "mult", "payLine", "size", "underdog"]);
  assert.equal(contest.bounty, undefined, "the contest carries no bounty");
  lock(s, "die");
  assert.equal(s.eventOps.die.bounties, undefined, "a lock stamps nothing");
  const odds = { ...contest, odds:{ underdog:contest.sides[1].key, mult:UNDERDOG_MULT } };
  const lit = ui.contestTerms(s, odds);
  const markup = html(s, React.createElement(ui.SideTerms, { terms:lit.sides[contest.sides[1].key] }));
  assert.match(markup, /Winner pays 2:1/);
  assert.doesNotMatch(markup, /Bounty|\+200|fd-bounty/);
});

/* ── H10: the first underdog and the first byes, taught where they appear ── */
const teachUi = (() => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const compiled = buildSync({
    stdin:{ contents:`export * from "./src/features/tv/teach.js";
      export { FACEOFF_TIMING, faceOffView } from "./src/features/tv/faceOff.js";
      export { FaceOff } from "./src/features/tv/TVFaceOff.jsx";
      export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";`, resolveDir:root, loader:"jsx" },
    bundle:true, platform:"node", format:"cjs", external:["react", "qrcode-generator", "three"], loader:{ ".css":"empty" },
    write:false, logLevel:"silent",
  });
  const mod = new Module(fileURLToPath(new URL("comebacks-teach.cjs", import.meta.url)));
  mod.filename = mod.id; mod.paths = Module._nodeModulePaths(root);
  mod._compile(compiled.outputFiles[0].text, mod.filename);
  return mod.exports;
})();

test("the phone's underdog payout shows it opens something: a cyan info lamp beside the words", () => {
  const s = dieBoard(state => { rule(state, ROSTER[8], 500); rule(state, ROSTER[9], 500); });
  const contest = current(s, "die");
  const terms = ui.contestTerms(s, contest);
  const dog = html(s, React.createElement(ui.SideTerms, { terms:terms.sides[contest.odds.underdog] }));
  assert.match(dog, /<button type="button" class="fd-side-pays is-underdog fd-side-pays-tap" aria-expanded="false">Winner pays 2:1<svg class="fd-info-lamp"/);
  const fav = html(s, React.createElement(ui.SideTerms, { terms:terms.sides[contest.sides.find(side => side.key !== contest.odds.underdog).key] }));
  assert.doesNotMatch(fav, /fd-info-lamp|<button/, "1:1 is a plain label");
});

test("the TV teaches the first underdog once: in its face-off, then its lamp on the board, on the server clock", () => {
  const { underdogTeachWindow, teachState, FACEOFF_TIMING:F, UNDERDOG_TEACH_MS } = teachUi;
  const s = dieBoard(state => { rule(state, ROSTER[8], 500); rule(state, ROSTER[9], 500); });
  const ev = event(s, "die"), contest = current(s, "die");
  const win = underdogTeachWindow(s, ev, contest);
  assert.ok(win, "a market that opens with an underdog teaches");
  assert.equal(win.start - win.faceAt, F.settle, "the board's part starts as the face-off lifts");
  assert.equal(win.end - win.faceAt, F.total + UNDERDOG_TEACH_MS);
  const key = `${win.id}@${win.end}`;
  assert.equal(teachState(win, win.faceAt, null).active, false, "during the face-off: due, the board not yet");
  assert.equal(teachState(win, win.start + 1, null).active, true);
  assert.equal(teachState(win, win.start + 1, key).active, true, "a reload inside the window keeps it");
  assert.equal(teachState(win, win.start + 1, "die:other@1"), null, "a TV that was taught stays quiet");
  assert.equal(teachState(win, win.end, null), null, "and it ends");
  const even = dieBoard();
  assert.equal(underdogTeachWindow(even, event(even, "die"), current(even, "die")), null, "even money teaches nothing");
  /* the face-off stamps the drawing under the underdog's payout only */
  const view = teachUi.faceOffView(s, ev, contest);
  const face = teach => renderToStaticMarkup(React.createElement(teachUi.PlayerIdentityProvider, { profiles:{} },
    React.createElement(teachUi.FaceOff, { state:s, events:allEventsOf(s), ev, contest, view, moment:{ elapsed:5000 }, teach })));
  const taught = face(true);
  assert.equal((taught.match(/class="tv-teach tv-faceoff-teach"/g) || []).length, 1, "one stamp, on the underdog's side");
  assert.match(taught, /aria-label="Underdog: winner pays 2:1"/);
  assert.match(taught, /fd-underdog-explain is-tv/, "the rule drawn: two stacks, the gap, 1:1 and 2:1");
  assert.doesNotMatch(face(false), /tv-faceoff-teach/);
});

test("the TV teaches the first byes once, after the first face-off lifts", () => {
  const { byeTeachWindow, bracketHasByes, FACEOFF_TIMING:F, BYE_TEACH_MS } = teachUi;
  const s = dieBoard();
  assert.equal(bracketHasByes(s.brackets.die), true, "six pairs: two enter in the semifinals");
  const win = byeTeachWindow(s, event(s, "die"));
  assert.ok(win);
  assert.equal(win.end - win.start, BYE_TEACH_MS);
  const four = fresh();
  four.brackets.x = makeBracket(4);
  four.draws.x = { id:"d4", teams:[] };
  assert.equal(bracketHasByes(four.brackets.x), false, "a four bracket has none");
  assert.equal(byeTeachWindow(four, { id:"x" }), null);
  assert.ok(F.total > 0);
});
