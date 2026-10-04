/* 1v1 basketball is a single-elimination bracket of everyone present:
   entrants are teams of one, the top seeds take the byes, and the whole
   thing runs through the same current-contest actions as every bracket. */
import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  EMPTY_STATE, ROSTER, AWARDS, MAX_BRACKET, ROUND_NAMES, allEventsOf, awardPlan, bracketChampion,
  bracketMatchName, bracketOrder, computeStandings, contestCorrections, contestEntryLabel, disp,
  makeBracket, resolveCurrentContest, resolveSlot, resultAwards, shapeLabel, suggestParticipants,
  teamFit, teamLabel, validateEventParticipants,
} from "../shared/core.js";
import { contestName } from "../shared/show.js";
import { applyAction } from "./support/confirmed-start.mjs";
import { bracketPath } from "../src/features/home/homeModel.js";
import { buildEventReveal } from "../src/features/weekend/drawReveal.js";
import { nextOpenMatch } from "../src/features/tv/tvModel.js";
import { bracketGeometry, railPoints } from "../src/features/tv/tvMotion.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const compiled = buildSync({
  stdin:{ contents:`export { TVBracket } from "./src/features/tv/TVBracket.jsx";
    export { CompetitionBracket, BracketPeek, bracketLayout, mirroredLayout } from "./src/features/weekend/CompetitionBracket.jsx";
    export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";`, resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react"], loader:{ ".css":"empty" }, write:false, logLevel:"silent",
});
const ui = new Module(fileURLToPath(new URL("solo-bracket.cjs", import.meta.url)));
ui.filename = ui.id;
ui.paths = Module._nodeModulePaths(root);
ui._compile(compiled.outputFiles[0].text, ui.filename);
const { TVBracket, CompetitionBracket, BracketPeek, bracketLayout, mirroredLayout, PlayerIdentityProvider } = ui.exports;
const wrap = (state, node) => renderToStaticMarkup(React.createElement(PlayerIdentityProvider, { profiles:state.profiles }, node));

let serial = 0;
const fresh = () => structuredClone(EMPTY_STATE);
const eventOf = (s, id = "bball1") => allEventsOf(s).find(ev => ev.id === id);
const current = (s, id = "bball1") => resolveCurrentContest(s, eventOf(s, id));
const refs = c => ({ contestId:c.id, contestRevision:c.revision });
const gm = () => ({ isGm:true, player:ROSTER[0], deviceId:"host", actionId:`solo-${++serial}` });
const guest = player => ({ player, deviceId:`device-${player}`, actionId:`chip-${++serial}` });
const act = (s, type, payload, ctx = gm()) => {
  const result = applyAction(s, type, payload, ctx);
  assert.equal(result.ok, true, `${type}: ${result.error}`);
  return result;
};
const refuse = (s, type, payload, pattern, ctx = gm()) => {
  const before = structuredClone(s);
  const result = applyAction(s, type, payload, ctx);
  assert.equal(result.ok, false, `${type} should be refused`);
  if (pattern) assert.match(result.error, pattern);
  assert.deepEqual(s, before, `${type} must not mutate when refused`);
};
const decided = match => match.winner !== null && match.winner !== undefined;
const chip = (s, side, stake = 100) => {
  const c = current(s);
  return { eventId:"bball1", evName:"1v1 Basketball", stake, ...refs(c), kind:"match", match:c.match,
    teamIdx:side.key, drawId:c.drawId };
};
/* play the current contest: lock, then the given side (default the higher seed) wins */
const play = (s, pick = c => Math.min(...c.sides.map(side => side.key)), extra = {}) => {
  let c = current(s);
  if (c.phase === "betting-open") { act(s, "lockAndStart", { evId:"bball1", ...refs(c) }); c = current(s); }
  const winner = pick(c);
  return { contest:c, winner, result:act(s, "recordContestWinner", { evId:"bball1", ...refs(c), winner, ...extra }) };
};

/* the hand-drawn shapes stored brackets depend on, verbatim */
const LEGACY = {
  2:{ size:2, rounds:[[{a:{t:0},b:{t:1},winner:null}]] },
  3:{ size:3, rounds:[[{a:{t:1},b:{t:2},winner:null}], [{a:{t:0},b:{w:[0,0]},winner:null}]] },
  4:{ size:4, rounds:[[{a:{t:0},b:{t:3},winner:null}, {a:{t:1},b:{t:2},winner:null}], [{a:{w:[0,0]},b:{w:[0,1]},winner:null}]] },
  5:{ size:5, rounds:[[{a:{t:3},b:{t:4},winner:null}],
    [{a:{t:0},b:{w:[0,0]},winner:null}, {a:{t:1},b:{t:2},winner:null}], [{a:{w:[1,0]},b:{w:[1,1]},winner:null}]] },
  6:{ size:6, rounds:[[{a:{t:3},b:{t:4},winner:null}, {a:{t:2},b:{t:5},winner:null}],
    [{a:{t:0},b:{w:[0,0]},winner:null}, {a:{t:1},b:{w:[0,1]},winner:null}], [{a:{w:[1,0]},b:{w:[1,1]},winner:null}]] },
};

test("brackets of 2 to 6 keep their exact stored shapes and names", () => {
  for (const [n, shape] of Object.entries(LEGACY)) {
    assert.equal(JSON.stringify(makeBracket(Number(n))), JSON.stringify(shape), `${n}-team shape`);
    assert.equal(ROUND_NAMES[n].length, shape.rounds.length);
  }
  assert.deepEqual(ROUND_NAMES[6], ["Play-in", "Semifinals", "Final"]);
  assert.equal(makeBracket(1), null);
  assert.equal(makeBracket(MAX_BRACKET + 1), null);
  assert.equal(makeBracket(7.5), null);
});

test("brackets of 7 to 16 seed into the next power of two and the top seeds take the byes", () => {
  for (let n = 7; n <= MAX_BRACKET; n++) {
    const br = makeBracket(n);
    const P = n <= 8 ? 8 : 16;
    assert.equal(br.size, n);
    assert.equal(br.rounds.length, Math.log2(P), `${n}: rounds`);
    assert.equal(ROUND_NAMES[n].length, br.rounds.length, `${n}: a name per round`);
    assert.equal(br.rounds.at(-1).length, 1, `${n}: one final`);
    /* every seed enters exactly once; byes are the top seeds, seated in round 2 */
    const seats = br.rounds.flatMap((round, r) => round.flatMap(match => [match.a, match.b]
      .filter(slot => slot.t !== undefined).map(slot => ({ r, t:slot.t }))));
    assert.deepEqual(seats.map(seat => seat.t).sort((a, b) => a - b), [...Array(n).keys()], `${n}: seats`);
    const byes = seats.filter(seat => seat.r > 0).map(seat => seat.t).sort((a, b) => a - b);
    assert.deepEqual(byes, [...Array(P - n).keys()], `${n}: top ${P - n} seeds get byes`);
    assert.ok(seats.every(seat => seat.r <= 1), `${n}: nobody skips two rounds`);
    assert.equal(br.rounds[0].length + br.rounds.slice(1).reduce((sum, round) => sum + round.length, 0), n - 1,
      `${n}: n - 1 matches`);
    /* every match but the final feeds exactly one later slot */
    br.rounds.forEach((round, r) => round.forEach((_, m) => {
      const feeds = br.rounds.flatMap(later => later.flatMap(match => [match.a, match.b]))
        .filter(slot => slot.w?.[0] === r && slot.w?.[1] === m);
      assert.equal(feeds.length, r === br.rounds.length - 1 ? 0 : 1, `${n}: ${r}-${m} feeds once`);
    }));
    /* the top two seeds can meet only in the final */
    const half = side => {
      const out = new Set();
      const walk = slot => slot.t !== undefined ? out.add(slot.t)
        : [br.rounds[slot.w[0]][slot.w[1]].a, br.rounds[slot.w[0]][slot.w[1]].b].forEach(walk);
      walk(side);
      return out;
    };
    const final = br.rounds.at(-1)[0];
    assert.ok(half(final.a).has(0) && half(final.b).has(1), `${n}: 1 and 2 in opposite halves`);
  }
  assert.deepEqual(ROUND_NAMES[8], ["Quarterfinals", "Semifinals", "Final"]);
  assert.deepEqual(ROUND_NAMES[13], ["Round 1", "Quarterfinals", "Semifinals", "Final"]);
  const thirteen = makeBracket(13);
  assert.deepEqual(thirteen.rounds.map(round => round.length), [5, 4, 2, 1]);
  /* seed 1 meets the 8-9 winner; seeds 2 and 3 wait for theirs */
  assert.deepEqual(thirteen.rounds[0][0], { a:{ t:7 }, b:{ t:8 }, winner:null });
  assert.deepEqual(thirteen.rounds[1][0], { a:{ t:0 }, b:{ w:[0, 0] }, winner:null });
  assert.equal(bracketMatchName(thirteen, 0, 2), "Round 1 Match 3");
  assert.equal(bracketMatchName(thirteen, 1, 3), "Quarterfinal 4");
  assert.equal(bracketMatchName(thirteen, 2, 0), "Semifinal 1");
  assert.equal(bracketMatchName(thirteen, 3, 0), "Final");
  assert.equal(bracketMatchName(makeBracket(9), 0, 0), "Round 1");
  assert.equal(bracketMatchName(makeBracket(6), 0, 1), "Play-in 2");
});

test("1v1 basketball is a bracket of everyone present, not heats", () => {
  const s = fresh(), ev = eventOf(s);
  assert.equal(ev.kind, "solo");
  assert.equal(ev.stageCfg, undefined);
  assert.deepEqual(ev.teamCfg, { teams:13, size:1, bracket:13 });
  assert.match(ev.desc, /^Single elimination, everyone in\./);
  assert.deepEqual(teamFit(ev, 13), { teams:13, size:1, bracket:13, reduced:false });
  assert.deepEqual(teamFit(ev, 11), { teams:11, size:1, bracket:11, reduced:true });
  assert.equal(teamFit(ev, 1), null);
  assert.equal(shapeLabel(teamFit(ev, 13)), "13 players");
  assert.equal(shapeLabel({ teams:6, size:2 }), "6 teams of 2");
  /* the director's default: everyone plays, nobody on crew */
  const suggestion = suggestParticipants(s, ev);
  assert.equal(suggestion.players.length, 13);
  assert.deepEqual(suggestion.roles, []);
  assert.equal(validateEventParticipants(ev, ROSTER.slice(1), ROSTER).ok, false, "everyone present plays");
  /* Saturday morning pays 800 / 400 / 200, and each semifinal loser takes the full 3rd */
  assert.deepEqual(awardPlan(ev).map(row => [row.place, row.pts]), [[0, 800], [1, 400], [2, 200]]);
  assert.ok(awardPlan(ev).every(row => !row.split), "3rd is never split");
  /* a bracket event never splits into heats */
  refuse(s, "runStages", { evId:"bball1", cfg:{ kind:"heats", nGroups:3, advance:1, players:[...ROSTER] } },
    /uses a bracket/);
  /* a stored text edit changes only the text: the format still comes from the build */
  s.eventEdits = { bball1:{ desc:"Old heats copy" } };
  assert.equal(eventOf(s).stageCfg, undefined);
  assert.deepEqual(eventOf(s).teamCfg, ev.teamCfg);
});

test("a full 13-player 1v1 bracket plays through current contests to a posted result with correct awards", () => {
  const s = fresh();
  s.live = true;
  act(s, "announceAndDraw", { evId:"bball1" });
  const draw = s.draws.bball1, br = s.brackets.bball1;
  assert.equal(draw.teams.length, 13);
  assert.ok(draw.teams.every(team => team.players.length === 1 && !team.name), "teams of one, no mascots");
  assert.deepEqual(draw.teams.flatMap(team => team.players).sort(), [...ROSTER].sort());
  assert.deepEqual(draw.roles, []);
  assert.equal(br.size, 13);
  assert.equal(s.stages.bball1, undefined);
  /* a team of one is labelled with its player */
  assert.equal(teamLabel(s, draw.teams[0]), disp(s, draw.teams[0].players[0]));

  /* the reveal: five first-round matchups, then the three byes by name */
  const reveal = buildEventReveal(s, eventOf(s), "draw");
  assert.deepEqual(reveal.groups.map(group => group.title), ["Round 1 Match 1", "Round 1 Match 2", "Round 1 Match 3",
    "Round 1 Match 4", "Round 1 Match 5", "Straight to the quarterfinals"]);
  assert.deepEqual(reveal.groups.at(-1).lines.map(line => line.text), [0, 1, 2].map(t => teamLabel(s, draw.teams[t])));
  assert.deepEqual(reveal.crew, []);

  /* the first contest is Round 1 Match 1, seeds 8 and 9, betting open */
  let c = current(s);
  assert.equal(c.kind, "match");
  assert.deepEqual(c.match, [0, 0]);
  assert.equal(c.label, "Round 1 Match 1", "named as the bracket names it");
  assert.equal(c.phase, "betting-open");
  assert.equal(contestName(s, eventOf(s), c), "Round 1 Match 1");
  assert.deepEqual(nextOpenMatch(br), { r:0, m:0, a:7, b:8, roundName:"Round 1" });

  /* a competitor may back only themself; anyone else may back either side */
  const [p8, p9] = c.sides.map(side => side.players[0]);
  const seed1 = draw.teams[0].players[0];
  refuse(s, "placeWager", { wager:chip(s, c.sides[1]) }, /yourself|your team/, guest(p8));
  act(s, "placeWager", { wager:chip(s, c.sides[0]) }, guest(p8));
  act(s, "placeWager", { wager:chip(s, c.sides[1], 200) }, guest(seed1));

  /* seed 1's path names the match that feeds it */
  assert.equal(bracketPath(s, eventOf(s), seed1).text, "Quarterfinal vs winner of Round 1 Match 1");
  assert.equal(bracketPath(s, eventOf(s), p8).text, "Round 1 now");

  /* seed 9 wins Round 1 Match 1: seed 1's bet pays 1:1, p8's chip is lost */
  const before = computeStandings(s);
  play(s, () => 8);
  const after = computeStandings(s);
  const delta = p => after.find(row => row.player === p).pts - before.find(row => row.player === p).pts;
  assert.equal(delta(seed1), 200);
  assert.equal(delta(p8), -100);
  assert.equal(bracketPath(s, eventOf(s), p9).text, "Round 1 ✓ → Quarterfinal vs " + teamLabel(s, draw.teams[0]));
  assert.equal(contestEntryLabel(s, eventOf(s), s.eventOps.bball1.contestStack.at(-1)), "Round 1 Match 1");

  /* every other match: the higher seed wins, through to the final */
  let played = 1, last;
  while ((c = current(s)) && !decided(s.brackets.bball1.rounds[3][0])) {
    const isFinal = c.match[0] === 3;
    /* seed 4 has won twice by Semifinal 1: the path keeps only the latest */
    if (c.match[0] === 2 && c.match[1] === 0)
      assert.equal(bracketPath(s, eventOf(s), draw.teams[3].players[0]).text, "Quarterfinal ✓ → Semifinal now");
    last = play(s, undefined, isFinal ? { postResult:true } : {});
    played += 1;
    assert.ok(played <= 12);
  }
  assert.equal(played, 12, "n - 1 matches");
  assert.equal(last.result.extra.posted, true, "the final's winner tap posts the result");
  const res = s.results.bball1;
  const champion = bracketChampion(s.brackets.bball1);
  assert.equal(champion, 0, "the top seed won out");
  const final = s.brackets.bball1.rounds[3][0];
  const runner = [resolveSlot(s.brackets.bball1, final.a), resolveSlot(s.brackets.bball1, final.b)].find(k => k !== champion);
  const semiLosers = s.brackets.bball1.rounds[2].map(match => [resolveSlot(s.brackets.bball1, match.a),
    resolveSlot(s.brackets.bball1, match.b)].find(key => key !== match.winner));
  assert.deepEqual(res.slots, [draw.teams[champion].players, draw.teams[runner].players,
    semiLosers.flatMap(key => draw.teams[key].players)]);
  const awards = resultAwards(s, eventOf(s), res);
  assert.deepEqual(awards.map(award => [award.place, award.pts]), [[0, 800], [1, 400], [2, 200], [2, 200]],
    "both semifinal losers take the full 200");
  assert.equal(awards.filter(award => award.place === "crew").length, 0);
  const board = computeStandings(s);
  assert.equal(board.find(row => row.player === draw.teams[champion].players[0]).wins, 1);
  assert.equal(AWARDS[eventOf(s).value][0], 800);
  assert.equal(current(s), null);
});

test("away players shrink the bracket and nobody sits on crew", () => {
  const s = fresh();
  s.live = true;
  act(s, "setAway", { player:ROSTER[3], away:true });
  act(s, "setAway", { player:ROSTER[7], away:true });
  act(s, "announceAndDraw", { evId:"bball1" });
  const draw = s.draws.bball1;
  assert.equal(draw.teams.length, 11);
  assert.ok(!draw.teams.some(team => team.players.includes(ROSTER[3]) || team.players.includes(ROSTER[7])));
  assert.deepEqual(draw.roles, []);
  assert.equal(s.brackets.bball1.size, 11);
  assert.deepEqual(s.brackets.bball1.rounds.map(round => round.length), [3, 4, 2, 1]);
  /* five byes in an 11 bracket */
  assert.equal(buildEventReveal(s, eventOf(s), "draw").groups.at(-1).lines.length, 5);
  let c;
  while ((c = current(s))) play(s, undefined, c.match[0] === 3 ? { postResult:true } : {});
  assert.equal(s.results.bball1.slots[0].length, 1);
  assert.equal(s.results.bball1.slots[2].length, 2);
  assert.ok(!resultAwards(s, eventOf(s), s.results.bball1).some(award => award.player === ROSTER[3]));
});

test("a round 1 result is correctable after later rounds, and the corrected winner advances", () => {
  const s = fresh();
  s.live = true;
  act(s, "announceAndDraw", { evId:"bball1" });
  const draw = s.draws.bball1;
  /* all of round 1, then Quarterfinal 1 (seed 1 against the Round 1 Match 1 winner) */
  for (let i = 0; i < 5; i++) play(s);
  assert.deepEqual(current(s).match, [1, 0]);
  const qfBefore = current(s).sides.map(side => side.key);
  assert.deepEqual(qfBefore, [0, 7]);
  play(s);
  const spectator = draw.teams[12].players[0];
  act(s, "placeWager", { wager:chip(s, current(s).sides[0]) }, guest(spectator));
  const ev = eventOf(s);
  const target = s.eventOps.bball1.contestStack[0];
  assert.equal(target.short, "Round 1 Match 1");
  const option = contestCorrections(s, ev).find(item => item.contestId === target.id);
  assert.ok(option?.enabled, "Round 1 Match 1 can be corrected");
  assert.equal(option.label, "Correct Round 1 Match 1");
  assert.deepEqual(option.rewinds, ["Round 1 Match 2", "Round 1 Match 3", "Round 1 Match 4", "Round 1 Match 5",
    "Quarterfinal 1"]);
  act(s, "correctContest", { evId:"bball1", contestId:target.id, contestRevision:option.contestRevision });
  const br = s.brackets.bball1;
  assert.ok(br.rounds.every(round => round.every(match => !decided(match))), "every later match rewound");
  const again = current(s);
  assert.deepEqual(again.match, [0, 0]);
  assert.equal(again.phase, "in-progress", "betting stays locked on the corrected contest");
  assert.equal(s.wagers.find(w => w.player === spectator).status, "void", "the next market's chips go back");
  /* the other side wins this time and is the one seed 1 meets */
  play(s, () => 8);
  for (let i = 0; i < 4; i++) play(s);
  assert.deepEqual(current(s).sides.map(side => side.key), [0, 8]);
  assert.deepEqual(bracketOrder(br)[0], [0, 0]);
});

test("the TV draws a field past eight from both ends, so it fits under the contest", () => {
  const br = makeBracket(13);
  const mirror = mirroredLayout(br);
  assert.equal(mirror.colCount, 7);
  /* the final sits in the middle column, each half flows toward it */
  assert.equal(mirror.cols[3][0], 3);
  assert.deepEqual(br.rounds.slice(0, 3).map((round, r) => round.map((_, m) => mirror.cols[r][m])),
    [[0, 0, 0, 6, 6], [1, 1, 5, 5], [2, 4]]);
  assert.deepEqual(mirror.dirs[0], [1, 1, 1, -1, -1]);
  assert.equal(mirror.units, 3.5, "half the rows of the flat layout");
  assert.equal(bracketLayout(br).units, 6.5);
  /* the final is centred between the semifinals it waits on */
  assert.equal(mirror.centers[3][0], (mirror.centers[2][0] + mirror.centers[2][1]) / 2);
  assert.equal(mirroredLayout(makeBracket(6)).colCount, 5, "small brackets can mirror, the TV only does past eight");

  /* a right-half winner rides left: out of its card's left edge into the next card's right edge */
  const dims = { row:36, gap:10, colGap:26 };
  const geo = bracketGeometry({ rounds:7, centers:mirror.centers, units:mirror.units, cols:mirror.cols, dirs:mirror.dirs }, dims, 1300);
  const pts = railPoints(geo, dims, { r:0, m:4 }, { r:1, m:3, index:1 }, 20);
  assert.equal(pts[0][0], geo.left(0, 4));
  assert.equal(pts[1][0], geo.left(0, 4) - 13);
  assert.equal(pts[3][0], geo.left(1, 3) + geo.colW);
  assert.equal(pts[4][0], geo.left(1, 3) + geo.colW - 20);
  /* the flat left half is unchanged */
  const left = railPoints(geo, dims, { r:0, m:0 }, { r:1, m:0, index:1 });
  assert.equal(left[0][0], geo.left(0, 0) + geo.colW);
  /* strip under the contest: no taller than a six-team strip plus half a row */
  assert.ok(geo.height <= Math.ceil(3.5 * 85 - 10), `strip ${geo.height}px`);
  const full = bracketGeometry({ rounds:7, centers:mirror.centers, units:mirror.units }, { row:52, gap:16, colGap:34 }, 1300);
  assert.ok(full.height + 46 <= 560, `full ${full.height}px fits under a winner banner`);

  const s = fresh();
  s.live = true;
  act(s, "announceAndDraw", { evId:"bball1" });
  play(s);
  const ev = eventOf(s), hot = nextOpenMatch(s.brackets.bball1);
  const strip = wrap(s, React.createElement(TVBracket, { state:s, ev, hot:[hot.r, hot.m] }));
  assert.match(strip, /tv-bracket is-strip is-mirrored/);
  assert.deepEqual([...strip.matchAll(/class="tv-label"[^>]*>([^<]+)</g)].map(m => m[1]),
    ["Round 1", "Quarters", "Semis", "Final", "Semis", "Quarters", "Round 1"]);
  assert.equal((strip.match(/class="tv-bracket-match/g) || []).length, 12);
  assert.ok(!/>Team /.test(strip), "a one-person entrant is named by the player");
  const fullView = wrap(s, React.createElement(TVBracket, { state:s, ev, size:"full", hot:[hot.r, hot.m] }));
  assert.match(fullView, /tv-bracket is-full is-mirrored/);
  /* six-team brackets keep the flat layout */
  const six = fresh();
  act(six, "announceAndDraw", { evId:"pong", players:ROSTER.slice(0, 12) });
  const sixStrip = wrap(six, React.createElement(TVBracket, { state:six, ev:eventOf(six, "pong") }));
  assert.ok(!sixStrip.includes("is-mirrored"));
});

test("the phone bracket keeps its columns; the peek tightens for a field past eight", () => {
  const s = fresh();
  s.live = true;
  act(s, "announceAndDraw", { evId:"bball1" });
  const ev = eventOf(s), me = s.draws.bball1.teams[0].players[0];
  const full = wrap(s, React.createElement(CompetitionBracket, { state:s, ev, me, onPlayer:() => {} }));
  assert.match(full, /Round 1 Match 5/);
  assert.match(full, /Quarterfinal 1/);
  assert.equal((full.match(/class="fd-bracket-match[ "]/g) || []).length, 12);
  assert.ok(!/>Team /.test(full));
  const peek = wrap(s, React.createElement(BracketPeek, { state:s, ev, me, onOpen:() => {} }));
  assert.match(peek, />\s*Quarters<\/span>/);
  assert.match(peek, />\s*Semis<\/span>/);
  /* 6.5 rows of 47px cards and 6px gaps */
  assert.match(peek, /height:345px/);
  const six = fresh();
  act(six, "announceAndDraw", { evId:"pong", players:ROSTER.slice(0, 12) });
  const sixPeek = wrap(six, React.createElement(BracketPeek, { state:six, ev:eventOf(six, "pong"), me:ROSTER[0], onOpen:() => {} }));
  assert.match(sixPeek, />\s*Semifinals<\/span>/, "short brackets keep full round names");
});
