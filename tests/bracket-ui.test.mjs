import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EMPTY_STATE, ROSTER, makeBracket, allEventsOf, computeStandings, resolveCurrentContest } from "../shared/core.js";
import { applyAction } from "./support/confirmed-start.mjs";

/* The bracket is drawn as a bracket: rounds are columns, every fed match sits
   between its feeders, and the live bracket game shows it on Home, Bets and
   Events. Components render with the real code; no transport runs. */
const root = fileURLToPath(new URL("../", import.meta.url));
const compiled = buildSync({
  stdin:{ contents:`
    export { CompetitionBracket, BracketPeek, bracketLayout } from "./src/features/weekend/CompetitionBracket.jsx";
    export { GuestHome } from "./src/features/home/GuestHome.jsx";
    export { Schedule } from "./src/features/weekend/Schedule.jsx";
    export { Wagers } from "./src/features/wagers/Wagers.jsx";
    export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";
  `, resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react", "qrcode-generator"],
  loader:{ ".css":"empty" }, write:false, logLevel:"silent",
});
const componentModule = new Module(fileURLToPath(new URL("bracket-ui.cjs", import.meta.url)));
componentModule.filename = componentModule.id;
componentModule.paths = Module._nodeModulePaths(root);
componentModule._compile(compiled.outputFiles[0].text, componentModule.filename);
const { CompetitionBracket, BracketPeek, bracketLayout, GuestHome, Schedule, Wagers, PlayerIdentityProvider } = componentModule.exports;

let serial = 0;
const gm = () => ({ isGm:true, player:ROSTER[0], deviceId:"host", actionId:`host-${++serial}` });
const act = (s, type, payload) => {
  const result = applyAction(s, type, payload, gm());
  assert.equal(result.ok, true, `${type}: ${result.error}`);
  return result;
};
const eightBall = s => allEventsOf(s).find(ev => ev.id === "8ball");
function liveBracket() {
  const s = structuredClone(EMPTY_STATE);
  act(s, "announceAndDraw", { evId:"8ball", players:ROSTER.slice(0, 12), roles:[{ player:ROSTER[12], role:"referee" }] });
  return s;
}
const render = element => renderToStaticMarkup(React.createElement(PlayerIdentityProvider, { profiles:{} }, element));
const count = (html, pattern) => (html.match(pattern) || []).length;
const noop = () => {};

test("every fed match sits between its feeders and no two cards in a round overlap", () => {
  for (const n of [2, 3, 4, 5, 6]) {
    const br = makeBracket(n);
    const { centers, units } = bracketLayout(br);
    br.rounds.forEach((round, r) => {
      const column = round.map((_, m) => centers[r][m]).sort((a, b) => a - b);
      column.forEach(center => assert.ok(center >= 0.5 && center <= units - 0.25, `${n} teams: card inside the stage`));
      column.slice(1).forEach((center, i) => assert.ok(center - column[i] >= 1, `${n} teams: round ${r} cards overlap`));
      round.forEach((match, m) => {
        const fed = [match.a, match.b].filter(slot => slot?.w).map(slot => centers[slot.w[0]][slot.w[1]]);
        if (fed.length === 2) assert.equal(centers[r][m], (fed[0] + fed[1]) / 2, `${n} teams: centred between feeders`);
        else if (fed.length === 1) assert.ok(Math.abs(centers[r][m] - fed[0]) <= 0.5, `${n} teams: beside its feeder`);
      });
    });
  }
});

test("the full bracket draws columns, one line per fed slot, and marks the live match", () => {
  const s = liveBracket();
  const html = render(React.createElement(CompetitionBracket, { state:s, ev:eightBall(s), me:ROSTER[1], onPlayer:noop }));
  assert.equal(count(html, /class="fd-bracket-match[ "]/g), 5, "two play-ins, two semifinals, a final");
  assert.equal(count(html, /class="fd-bracket-line/g), 4, "semifinal feeds and both final feeds");
  assert.equal(count(html, /fd-bracket-match is-current/g), 1);
  assert.match(html, /Betting open/);
  assert.match(html, /Semifinal 1/, "numbered rounds read singular");
  assert.match(html, />Play-in<.*>Semifinals<.*>Final</s, "round headings run left to right");
  assert.match(html, /aria-label="View [^"]+(?:'|&#x27;)s player card"/, "player cards keep their own targets");
});

test("the commissioner taps a winner only while the match is being played", () => {
  const s = liveBracket(), ev = eightBall(s);
  const props = { state:s, ev, me:ROSTER[0], gm:true, onPick:noop, onPlayer:noop };
  assert.doesNotMatch(render(React.createElement(CompetitionBracket, props)), /aria-label="Winner: /);
  const contest = resolveCurrentContest(s, ev);
  act(s, "lockAndStart", { evId:"8ball", contestId:contest.id, contestRevision:contest.revision });
  const html = render(React.createElement(CompetitionBracket, { ...props, state:s }));
  assert.equal(count(html, /aria-label="Winner: /g), 2);
  assert.match(html, />Playing</);
});

test("a decided match lights the line its winner took", () => {
  const s = liveBracket(), ev = eightBall(s);
  let contest = resolveCurrentContest(s, ev);
  act(s, "lockAndStart", { evId:"8ball", contestId:contest.id, contestRevision:contest.revision });
  contest = resolveCurrentContest(s, ev);
  act(s, "recordContestWinner", { evId:"8ball", contestId:contest.id, contestRevision:contest.revision, winner:contest.sides[0].key });
  const html = render(React.createElement(CompetitionBracket, { state:s, ev, me:ROSTER[1], onPlayer:noop }));
  assert.equal(count(html, /fd-bracket-line is-advanced/g), 1);
  assert.equal(count(html, /fd-bracket-team is-winner/g), 1);
});

test("the compact bracket is one target and a picture inside it", () => {
  const s = liveBracket();
  const html = render(React.createElement(BracketPeek, { state:s, ev:eightBall(s), me:ROSTER[1], onOpen:noop }));
  assert.match(html, /aria-label="Open the full 8-Ball Doubles bracket"/);
  assert.match(html, /aria-hidden="true"/);
  assert.equal(count(html, /<button/g), 1, "nothing inside the glance is separately tappable");
});

test("Home's live pane has one way into the event (its name); the bracket lives in the event sheet", () => {
  const s = liveBracket(), events = allEventsOf(s);
  const props = { state:s, me:ROSTER[1], events, standings:computeStandings(s), GameMark:() => null,
    onOpen:noop, onRules:noop, onBets:noop, onBracket:noop, onPlayer:noop, onStandings:noop, onEvents:noop,
    onGuide:noop, onHouse:noop, onProfile:noop, onDraft:noop };
  const html = render(React.createElement(GuestHome, props));
  assert.doesNotMatch(html, /Open the full 8-Ball Doubles bracket/);
  assert.match(html, /aria-label="Open 8-Ball Doubles"/);
});

test("Events gives a bracket game its own way in", () => {
  const s = liveBracket();
  const html = render(React.createElement(Schedule, { state:s, events:allEventsOf(s), gm:false, open:noop,
    onBracket:noop, onPlayer:noop, onReorder:noop }));
  assert.equal(count(html, /aria-label="[^"]+ bracket">Bracket</g), 1);
  assert.match(html, /aria-label="8-Ball Doubles bracket"/);
});

test("Bets shows the bracket under the board instead of a second link", () => {
  const s = liveBracket(), events = allEventsOf(s);
  const html = render(React.createElement(Wagers, { state:s, me:ROSTER[12], standings:computeStandings(s), gm:false, events,
    wagerEv:eightBall(s), onEvents:noop, onEvent:noop, onPick:noop, onVoid:noop, onRetract:noop, onPlayer:noop, GameMark:() => null }));
  assert.match(html, /Open the full 8-Ball Doubles bracket/);
  assert.doesNotMatch(html, /class="fd-wagers-context"/);
});
