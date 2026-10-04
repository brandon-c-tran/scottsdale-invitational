/* Team MVP: a winning team of three or more votes one teammate MVP, who
   earns 100 chips (derived, like an award, and taken back by a correction).
   The vote's privacy, its close (everyone voted, the commissioner, the
   alarm, the finale's deal), the MVP's song, Home, the TV card, the season
   card, the keepsake and the counted "Most MVPs" award. */
import test from "node:test";
import assert from "node:assert/strict";

import {
  EMPTY_STATE, MVP_PTS, MVP_WINDOW_MS, ROSTER, START, allEventsOf, computeStandings, mvpAwards, resolveCurrentContest,
  resolveEventLifecycle, makeBracket,
} from "../shared/core.js";
import { decideMvp, latestMvp, mvpDue, mvpsOf, nextMvpDeadline, projectMvp } from "../shared/mvp.js";
import { walkoutOf } from "../shared/audio.js";
import { tallyBallot, voteError, cleanBallotDraft } from "../shared/prompts.js";
import { compactSpotifyTrack } from "../worker/spotify.js";
import { winSongFor } from "../worker/winSong.js";
import { alertsFor } from "../worker/pushAlerts.js";
import { publicState } from "../worker/publicState.js";
import { Tournament } from "../worker/tournament.js";
import { applyAction, confirmStart } from "./support/confirmed-start.mjs";
import { withLegacyEvents } from "./support/legacy-events.mjs";
import { mvpHomeModel } from "../src/features/mvp/mvpHome.js";
import { nowPlayingModel, MVP_CARD_MS } from "../src/features/tv/nowPlaying.js";
import { chipHistory } from "../src/features/results/lastCard.js";
import { chipSnapshot, resultMoment } from "../src/features/results/resultMoment.js";
import { keptPlates } from "../src/features/results/keepsake.js";
import { seasonStats } from "../src/features/profile/seasonStats.js";
import { ballotModel } from "../src/features/awards/awardsModel.js";

const RED = ROSTER.slice(0, 6), BLUE = ROSTER.slice(6, 12);
let serial = 0;
const gm = () => ({ isGm:true, player:null, deviceId:"host", actionId:`host-${++serial}` });
const as = player => ({ isGm:false, player, deviceId:`device-${player}`, actionId:`p-${++serial}` });
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
const eventOf = (state, id) => allEventsOf(state).find(ev => ev.id === id);
const contestOf = (state, id) => resolveCurrentContest(state, eventOf(state, id));
const refs = c => ({ contestId:c.id, contestRevision:c.revision });
const ptsOf = (state, player) => computeStandings(state).find(row => row.player === player).pts;

/* Flip Cup, two teams of six: the red team wins. It left the slate, so it
   rides along as a custom event (the same definition, the same id). */
function flipCup() {
  const s = withLegacyEvents(structuredClone(EMPTY_STATE), ["flip"]);
  s.draws.flip = { id:"draw-flip", ts:1, teams:[{ name:"Red", players:[...RED] }, { name:"Blue", players:[...BLUE] }],
    roles:[{ player:ROSTER[12], role:"ref" }] };
  return s;
}
/* a two-team game is played to its result entry, like the commissioner does */
function redWins(s) {
  act(s, "announceEvent", { evId:"flip" });
  const contest = contestOf(s, "flip");
  act(s, "lockAndStart", { evId:"flip", ...refs(contest) });
  if (resolveEventLifecycle(s, eventOf(s, "flip")).phase !== "result-entry") act(s, "beginResultEntry", { evId:"flip" });
  const before = structuredClone(s);
  act(s, "saveResult", { evId:"flip", slots:[[...RED], [...BLUE], []] });
  return { before, contest };
}

test("a team of three or more that wins votes its MVP; a duo does not", () => {
  const s = flipCup();
  redWins(s);
  const record = s.mvp.flip;
  assert.deepEqual([...record.team].sort(), [...RED].sort());
  assert.equal(record.closesAt - record.openedAt, MVP_WINDOW_MS);
  assert.deepEqual(record.votes, {});
  assert.equal(mvpAwards(s).length, 0, "nothing pays until it closes");

  const duo = structuredClone(EMPTY_STATE);
  duo.draws["8ball"] = { id:"draw-8", ts:1, teams:Array.from({ length:2 }, (_, key) => ({ name:null,
    players:ROSTER.slice(key * 2, key * 2 + 2) })) };
  duo.brackets["8ball"] = makeBracket(2);
  act(duo, "announceEvent", { evId:"8ball" });
  const match = contestOf(duo, "8ball");
  act(duo, "lockAndStart", { evId:"8ball", ...refs(match) });
  act(duo, "recordContestWinner", { evId:"8ball", ...refs(match), winner:match.sides[0].key, postResult:true });
  assert.ok(duo.results["8ball"]);
  assert.equal(duo.mvp["8ball"], undefined);

  /* the slate's own case: Sand Volleyball's four teams of three, won through the bracket */
  const trio = structuredClone(EMPTY_STATE);
  trio.draws.volley = { id:"draw-v", ts:1, teams:Array.from({ length:4 }, (_, key) => ({ name:null,
    players:ROSTER.slice(key * 3, key * 3 + 3) })), roles:[{ player:ROSTER[12], role:"ref" }] };
  trio.brackets.volley = makeBracket(4);
  act(trio, "announceEvent", { evId:"volley" });
  let game;
  while ((game = contestOf(trio, "volley"))) {
    act(trio, "lockAndStart", { evId:"volley", ...refs(game) });
    act(trio, "recordContestWinner", { evId:"volley", ...refs(game), winner:game.sides[0].key, postResult:true });
  }
  assert.ok(trio.results.volley);
  assert.equal(trio.mvp.volley.team.length, 3);
  assert.deepEqual([...trio.mvp.volley.team].sort(), [...trio.results.volley.slots[0]].sort());
});

test("only the winning team votes, never for themself; the last vote closes it and the MVP earns 100", () => {
  const s = flipCup();
  redWins(s);
  assert.equal(refuse(s, "mvpVote", { evId:"flip", pick:RED[1] }, as(BLUE[0])), "Only the winning team votes");
  assert.equal(refuse(s, "mvpVote", { evId:"flip", pick:RED[0] }, as(RED[0])), "Pick a teammate");
  assert.equal(refuse(s, "mvpVote", { evId:"flip", pick:BLUE[0] }, as(RED[0])), "Pick a teammate");
  assert.equal(refuse(s, "mvpClose", { evId:"flip" }, as(RED[0])), "Commissioner only");
  act(s, "mvpVote", { evId:"flip", pick:RED[2] }, as(RED[0]));
  act(s, "mvpVote", { evId:"flip", pick:RED[1] }, as(RED[0]));
  assert.equal(act(s, "mvpVote", { evId:"flip", pick:RED[1] }, as(RED[0])).extra.unchanged, true, "a retry");
  const before = ptsOf(s, RED[1]);
  for (const voter of RED.slice(1)) act(s, "mvpVote", { evId:"flip", pick:voter === RED[1] ? RED[2] : RED[1] }, as(voter));
  const record = s.mvp.flip;
  assert.ok(record.closedAt, "everyone voted");
  assert.equal(record.winner, RED[1]);
  assert.equal(record.how, "votes");
  assert.equal(record.tally[RED[1]], 5);
  assert.equal(record.votes, undefined, "the answers go when the counts stay");
  assert.equal(ptsOf(s, RED[1]), before + MVP_PTS);
  assert.equal(refuse(s, "mvpVote", { evId:"flip", pick:RED[3] }, as(RED[0])), "The MVP vote is closed");
  const row = computeStandings(s).find(item => item.player === RED[1]);
  assert.equal(row.pts, START + row.awardPts + row.mvpPts + row.bountyPts + row.betNet + row.duelNet);
});

test("a tie is drawn among the tied, and no votes at all draws the whole team", () => {
  const record = { team:["A", "B", "C"], votes:{ A:"B", B:"C", C:"A" } };
  assert.deepEqual(decideMvp(record, () => 0.99), { winner:"C", tally:{ B:1, C:1, A:1 }, how:"tie" });
  const two = { team:["A", "B", "C", "D"], votes:{ A:"B", B:"C", C:"B", D:"C" } };
  assert.equal(decideMvp(two, () => 0).winner, "B");
  assert.equal(decideMvp(two, () => 0.6).winner, "C");
  assert.deepEqual(decideMvp({ team:["A", "B", "C"], votes:{} }, () => 0.5), { winner:"B", tally:{}, how:"none" });
});

test("a correction takes the MVP back; a different winning team votes its own", () => {
  const s = flipCup();
  redWins(s);
  act(s, "mvpClose", { evId:"flip" });
  const mvp = s.mvp.flip.winner;
  const paid = ptsOf(s, mvp);
  act(s, "saveResult", { evId:"flip", slots:[[...BLUE], [...RED], []], confirmOverwrite:true, correctionReason:"Wrong team" });
  assert.equal(ptsOf(s, mvp) <= paid - MVP_PTS, true, "the MVP chips went with the win");
  assert.deepEqual([...s.mvp.flip.team].sort(), [...BLUE].sort(), "blue votes now");
  assert.equal(s.mvp.flip.closedAt, undefined);

  const cleared = flipCup();
  redWins(cleared);
  act(cleared, "mvpClose", { evId:"flip" });
  const winner = cleared.mvp.flip.winner;
  act(cleared, "clearResult", { evId:"flip", confirmClear:true, correctionReason:"Replay" });
  assert.equal(mvpAwards(cleared).length, 0);
  assert.equal(computeStandings(cleared).find(row => row.player === winner).mvpPts, 0);
});

test("frames never carry another player's vote; the counts appear once it closes", () => {
  const s = flipCup();
  redWins(s);
  act(s, "mvpVote", { evId:"flip", pick:RED[1] }, as(RED[0]));
  const mine = publicState(s, { player:RED[0] }).mvp.flip;
  assert.equal(mine.mine, RED[1]);
  assert.equal(mine.voted, 1);
  assert.equal(mine.votes, undefined);
  const other = publicState(s, { player:RED[2] }).mvp.flip;
  assert.equal(other.mine, undefined);
  assert.equal(publicState(s, { isGm:true }).mvp.flip.votes, undefined, "not even the commissioner");
  assert.doesNotMatch(JSON.stringify(publicState(s, { player:BLUE[0] })), /"votes"/);
  act(s, "mvpClose", { evId:"flip" });
  const closed = projectMvp(s.mvp, {}).flip;
  assert.equal(closed.winner, RED[1]);
  assert.equal(closed.tally[RED[1]], 1);
  /* the client standings read the projection the same way the server does */
  const frame = publicState(s, { player:BLUE[0] });
  assert.deepEqual(computeStandings(frame).map(row => row.pts), computeStandings(s).map(row => row.pts));
});

test("the team's win waits for its MVP's song; the close plays it, marked MVP", () => {
  const s = flipCup();
  const track = id => compactSpotifyTrack({ id, uri:`spotify:track:${id}`, name:"Anthem", artists:[{ name:"Band" }],
    duration_ms:200000, external_urls:{ spotify:"https://open.spotify.com/track/x" }, album:{ images:[] } }, 0);
  for (const [index, player] of RED.entries())
    s.profiles[player] = { walkoutTrack:track(`trackmvp${String(index).padStart(14, "0")}`) };
  const { before } = redWins(s);
  assert.equal(winSongFor(before, s), null, "a vote opened: no song yet");
  assert.deepEqual(alertsFor(before, s).filter(alert => alert.reason === "mvp").map(alert => alert.player).sort(),
    [...RED].sort());
  const open = structuredClone(s);
  act(s, "mvpVote", { evId:"flip", pick:RED[3] }, as(RED[0]));
  act(s, "mvpClose", { evId:"flip" });
  const song = winSongFor(open, s);
  assert.equal(song.player, RED[3]);
  assert.equal(song.mvp, true);
  assert.equal(song.key, `mvp:${s.mvp.flip.id}`);
});

test("the alarm closes a vote whose minute is up, in its own write, and re-arms for the next", async () => {
  const entries = new Map(), alarms = [], sockets = [];
  const storage = {
    async get(key) { return structuredClone(entries.get(key)); },
    async put(key, value) {
      if (typeof key === "object") for (const [k, v] of Object.entries(key)) entries.set(k, structuredClone(v));
      else entries.set(key, structuredClone(value));
    },
    async delete(key) { for (const item of Array.isArray(key) ? key : [key]) entries.delete(item); },
    async list({ prefix = "" } = {}) {
      return new Map([...entries].filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k, structuredClone(v)]));
    },
    async transaction(fn) { return fn(storage); },
    async setAlarm(at) { alarms.push(at); },
  };
  const tournament = new Tournament({ blockConcurrencyWhile() {}, getWebSockets:() => sockets, storage, waitUntil() {} },
    { APP_ENV:"local" });
  await tournament.hydrateFromStorage();
  const seeded = flipCup();
  Object.assign(tournament.state, { draws:seeded.draws, customEvents:seeded.customEvents });
  tournament.gmToken = "gm";
  const ws = { frames:[], send(frame) { ws.frames.push(JSON.parse(frame)); },
    serializeAttachment(value) { ws.attachment = value; }, deserializeAttachment() { return ws.attachment; }, close() {} };
  sockets.push(ws);
  const say = (type, payload) => tournament.webSocketMessage(ws, JSON.stringify({ actionId:`a${++serial}`, type,
    deviceId:"gm-device-0000-4000-8000-000000000009", gmToken:"gm", payload:confirmStart(type, payload) }));
  await say("announceEvent", { evId:"flip" });
  const contest = resolveCurrentContest(tournament.state, eventOf(tournament.state, "flip"));
  await say("lockAndStart", { evId:"flip", ...refs(contest) });
  if (resolveEventLifecycle(tournament.state, eventOf(tournament.state, "flip")).phase !== "result-entry")
    await say("beginResultEntry", { evId:"flip" });
  await say("saveResult", { evId:"flip", slots:[[...RED], [...BLUE], []] });
  const record = tournament.state.mvp.flip;
  assert.equal(nextMvpDeadline(tournament.state), record.closesAt);
  assert.equal(alarms.at(-1), record.closesAt, "armed for the close");
  assert.deepEqual(mvpDue(tournament.state, record.closesAt - 1), []);

  /* the minute passes */
  tournament.state.mvp.flip.closesAt = Date.now() - 1;
  const version = tournament.version;
  await tournament.alarm();
  assert.ok(tournament.state.mvp.flip.closedAt);
  assert.ok(RED.includes(tournament.state.mvp.flip.winner));
  assert.equal(tournament.version, version + 1, "its own write");
  assert.equal(nextMvpDeadline(tournament.state), null);
  assert.equal(walkoutOf(tournament.state), null, "no speaker here: nothing else moved");
});

test("the finale's deal closes an open vote with the votes it has, so its MVP is in the stack", () => {
  const s = flipCup();
  s.live = true;
  redWins(s);
  act(s, "mvpVote", { evId:"flip", pick:RED[4] }, as(RED[0]));
  s.shelved = Object.fromEntries(allEventsOf(s).filter(ev => !ev.finale && ev.id !== "flip").map(ev => [ev.id, true]));
  act(s, "pokerSetup", {});
  assert.equal(s.mvp.flip.winner, RED[4]);
  assert.equal(s.poker.startingStacks[RED[4]], computeStandings(s).find(row => row.player === RED[4]).pts);
});

test("Home shows the team its vote, then its MVP; the TV names the MVP", () => {
  const s = flipCup();
  redWins(s);
  const events = allEventsOf(s);
  const at = s.mvp.flip.openedAt + 1000;
  const view = publicState(s, { player:RED[0] });
  const vote = mvpHomeModel(view, RED[0], events, at);
  assert.equal(vote.kind, "vote");
  assert.equal(vote.picks.includes(RED[0]), false);
  assert.equal(vote.voters, RED.length);
  assert.equal(mvpHomeModel(publicState(s, { player:BLUE[0] }), BLUE[0], events, at), null, "the other team sees nothing");

  act(s, "mvpVote", { evId:"flip", pick:RED[2] }, as(RED[0]));
  act(s, "mvpClose", { evId:"flip" });
  const closedAt = s.mvp.flip.closedAt;
  const done = mvpHomeModel(publicState(s, { player:RED[2] }), RED[2], events, closedAt + 1000);
  assert.deepEqual([done.kind, done.winner, done.you], ["result", RED[2], true]);

  /* with no song saved the TV still names the MVP, for a moment */
  const card = nowPlayingModel(publicState(s, {}), events, closedAt + 1000);
  assert.equal(card.player, RED[2]);
  assert.equal(card.mvp, "Flip Cup");
  assert.equal(card.track, null);
  assert.equal(nowPlayingModel(publicState(s, {}), events, closedAt + MVP_CARD_MS + 1), null);
  /* with a song, the card follows the song and keeps the MVP tag */
  s.profiles[RED[2]] = { walkoutTrack:{ trackId:"x".repeat(22), name:"Anthem", artists:["Band"] } };
  s.showControl = { ...s.showControl, audio:{ walkout:{ player:RED[2], trackId:"x".repeat(22), startedAt:closedAt + 900,
    until:closedAt + 30900, auto:true, mvp:true } } };
  const playing = nowPlayingModel(s, events, closedAt + 20000);
  assert.deepEqual([playing.player, playing.mvp, playing.track.name], [RED[2], "Flip Cup", "Anthem"]);
});

test("the weekend keeps MVPs: the receipt, the chip history, the season card and the keepsake", () => {
  const s = flipCup();
  redWins(s);
  const events = allEventsOf(s);
  const prevState = structuredClone(s);
  const prev = chipSnapshot(prevState, RED[1], events);
  act(s, "mvpVote", { evId:"flip", pick:RED[1] }, as(RED[0]));
  act(s, "mvpClose", { evId:"flip" });
  const next = chipSnapshot(s, RED[1], events);
  const moment = resultMoment({ prev, next, prevState, state:s, events, frame:{ fresh:true } });
  const line = moment.lines.find(item => item.kind === "mvp");
  assert.deepEqual([line.label, line.delta, line.eventId], ["Team MVP", MVP_PTS, "flip"]);
  assert.equal(chipHistory(s, RED[1], events).at(-1).pts, ptsOf(s, RED[1]), "the history ends on the board");
  assert.equal(seasonStats(s, RED[1], { events }).mvps, 1);
  assert.equal(keptPlates(s, events).find(plate => plate.eventId === "flip").mvp, RED[1]);
  assert.deepEqual(mvpsOf(s, RED[1]).map(item => item.eventId), ["flip"]);
  assert.equal(latestMvp(s).winner, RED[1]);
});

test("Most MVPs is counted from the weekend, never voted, and stays off the phone ballot", () => {
  const draft = cleanBallotDraft({ kind:"awards", questions:[
    { id:"q-best", title:"Best dressed", nominees:null },
    { id:"q-mvps", title:"Most MVPs", nominees:[ROSTER[0], ROSTER[1]], allowSelf:true, source:"mvps" },
  ] });
  assert.equal(draft.ok, true);
  const counted = draft.questions[1];
  assert.deepEqual(counted, { id:"q-mvps", title:"Most MVPs", nominees:null, allowSelf:false, source:"mvps" });
  assert.equal(voteError(counted, ROSTER[0], ROSTER[1]), "This award is counted, not voted");

  const s = flipCup();
  redWins(s);
  act(s, "mvpVote", { evId:"flip", pick:RED[5] }, as(RED[0]));
  act(s, "mvpClose", { evId:"flip" });
  const tally = tallyBallot({ id:"b1", questions:draft.questions }, {}, s);
  assert.deepEqual(tally.questions["q-mvps"], { counts:{ [RED[5]]:1 }, votes:1 });

  const open = { prompts:{ ballots:[{ id:"b1", status:"open", questions:draft.questions }] } };
  assert.deepEqual(ballotModel(open, ROSTER[0]).questions.map(question => question.id), ["q-best"]);
  const onlyCounted = { prompts:{ ballots:[{ id:"b2", status:"open", questions:[counted] }] } };
  assert.equal(ballotModel(onlyCounted, ROSTER[0]), null);
});
