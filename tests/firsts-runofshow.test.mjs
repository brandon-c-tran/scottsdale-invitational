/* D4 firsts and streaks, D5 the commissioner's run of show. The fact
   model and the projection are pure; the projection is checked against the
   real reducers by playing a whole weekend through the director pill and
   comparing each projected Next and Then with what the pill then offers. */
import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  BUILTIN_EVENTS, CHIP_COLORS, CHIP_MIN, EMPTY_STATE, ROSTER, allEventsOf, computeStandings, resolveCurrentContest,
  draftTurn,
} from "../shared/core.js";
import { resolveDirector } from "../shared/show.js";
import { applyAction } from "./support/confirmed-start.mjs";
import { applyAction as rawApply } from "../worker/actions.js";
import { withLegacyEvents } from "./support/legacy-events.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const load = async (name, contents) => {
  const compiled = await build({
    stdin:{ contents, resolveDir:root, loader:"jsx" },
    bundle:true, platform:"node", format:"cjs", external:["react"],
    loader:{ ".css":"empty" }, write:false, logLevel:"silent",
  });
  const mod = new Module(fileURLToPath(new URL(name, import.meta.url)));
  mod.filename = mod.id;
  mod.paths = Module._nodeModulePaths(root);
  mod._compile(compiled.outputFiles[0].text, mod.filename);
  return mod.exports;
};
const ui = await load("firsts-runofshow.cjs", `
  export * from "./src/features/results/weekendFacts.js";
  export { chipSnapshot, resultMoment, mergeMoments } from "./src/features/results/resultMoment.js";
  export { ChipReceipt } from "./src/features/results/ChipReceipt.jsx";
  export { tickerItems, TICKER_ROLES, FACT_ROLES } from "./src/features/tv/tvModel.js";
  export * from "./src/features/director/runOfShow.js";
  export { directorPill, namesOf } from "./src/features/director/directorPill.js";
  export { DirectorPill } from "./src/features/director/DirectorPill.jsx";
  export { RunOfShowPanel, useHold, HOLD_MS } from "./src/features/director/RunOfShow.jsx";
  export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";
`);

const events = BUILTIN_EVENTS;
const [evan, khoa, sahil, adi, ben] = ROSTER;
const fresh = () => ({ ...structuredClone(EMPTY_STATE), live:true,
  profiles:Object.fromEntries(ROSTER.map((player, index) => [player, { display:player, num:index + 1,
    color:CHIP_COLORS[index % CHIP_COLORS.length].hex }])) });
/* the solo free-for-alls, in slate order: putt and where 400, ragecage 1,600 */
const isSolo = event => !event.teamCfg && !event.stageCfg && !event.finale;
const solo = events.filter(isSolo);
const inProvider = element => renderToStaticMarkup(React.createElement(ui.PlayerIdentityProvider,
  { profiles:fresh().profiles }, element));
const post = (state, ev, first, at, second = [], third = []) => {
  state.results[ev.id] = { slots:[first, second, third], ts:at, confirmedAt:at, revision:1 };
};
/* the last player on the roster already passed every thousand these
   weekends reach, so milestones stay out of the way of the facts under test */
const withLeader = state => {
  state.adjustments = [{ id:"lead", player:ROSTER[12], delta:6000, reason:"Test", ts:1 }];
  return state;
};

/* ── D4 ── */

test("a second win, then three straight: one fact per result, the rarest", () => {
  const state = withLeader(fresh());
  post(state, solo[0], [evan], 1_000_000);
  post(state, solo[1], [evan], 2_000_000);
  post(state, solo[2], [evan], 3_000_000);
  const facts = ui.weekendFacts(state, events);
  const texts = facts.map(fact => fact.text);
  assert.ok(texts.includes(`${evan}'s second win`));
  assert.ok(texts.includes(`${evan}'s third straight win`));
  /* the third win is also true, but the streak is rarer and one result carries one fact */
  assert.ok(!texts.includes(`${evan}'s third win`));
  const third = facts.find(fact => fact.at === 3_000_000);
  assert.equal(third.kind, "streak");
  assert.equal(third.tag, "Streak");
  assert.equal(third.own, "Your third straight win");
  assert.deepEqual(third.players, [evan]);
  /* at most one per write, oldest first */
  assert.equal(new Set(facts.map(fact => fact.at)).size, facts.length);
  assert.deepEqual(facts.map(fact => fact.at), [...facts.map(fact => fact.at)].sort((a, b) => a - b));
});

test("a loss in an event they played breaks the streak; crew duty does not", () => {
  /* four solo free-for-alls: the slate's Long Putt, Where and When, Trivia and Rage Cage */
  const state = withLeader(fresh());
  const four = allEventsOf(state).filter(isSolo);
  assert.equal(four.length, 4);
  post(state, four[0], [evan], 1_000_000);
  post(state, four[1], [khoa], 2_000_000, [evan]);
  post(state, four[2], [evan], 3_000_000);
  post(state, four[3], [evan], 4_000_000);
  let texts = ui.weekendFacts(state, allEventsOf(state)).map(fact => fact.text);
  assert.ok(!texts.some(text => text.includes("straight")));
  assert.ok(texts.includes(`${evan}'s third win`));

  /* Evan on crew for Volleyball (four teams of three) between his wins: still three straight */
  const crew = withLeader(fresh());
  const volley = events.find(event => event.id === "volley");
  const others = ROSTER.filter(player => player !== evan);
  const trio = n => others.slice(n * 3, n * 3 + 3);
  crew.draws = { volley:{ id:"d1", teams:[0, 1, 2, 3].map(n => ({ players:trio(n) })),
    roles:[{ player:evan, role:"ref" }] } };
  post(crew, solo[0], [evan], 1_000_000);
  post(crew, volley, trio(0), 2_000_000, trio(1), [...trio(2), ...trio(3)]);
  post(crew, solo[1], [evan], 3_000_000);
  post(crew, solo[2], [evan], 4_000_000);
  texts = ui.weekendFacts(crew, events).map(fact => fact.text);
  assert.ok(texts.includes(`${evan}'s third straight win`));
});

test("first to each thousand, and the biggest bet paid, from chip history", () => {
  const state = fresh();
  const cage = events.find(event => event.id === "ragecage");
  state.wagers = [
    { id:"w1", player:khoa, kind:"outright", eventId:cage.id, pick:evan, pickPlayers:[evan], stake:500, mult:2, ts:1 },
  ];
  post(state, cage, [evan], 5_000_000, [], [adi]);
  const facts = ui.weekendFacts(state, events);
  /* Evan's 1,600 award takes him to 2,600; Khoa's +1,000 bet takes him to 2,000 in the same write */
  const first = facts.find(fact => fact.kind === "first");
  assert.equal(first.text, `First to 2,000: ${evan} and ${khoa}`);
  assert.equal(first.own, "First to 2,000");
  /* same write, so the bet record is not a second fact */
  assert.equal(facts.length, 1);

  /* a later, bigger bet is its own fact; a jump past two thousands names only the higher */
  const later = structuredClone(state);
  const putt = events.find(event => event.id === "putt");
  later.wagers.push({ id:"w2", player:ben, kind:"outright", eventId:putt.id, pick:sahil, pickPlayers:[sahil],
    stake:700, mult:2, ts:2 });
  post(later, putt, [sahil], 9_000_000);
  const bet = ui.weekendFacts(later, events).find(fact => fact.kind === "bet");
  assert.equal(bet.text, `Biggest bet paid: ${ben}, +1,400 on ${sahil}`);
  assert.equal(bet.own, "Biggest bet paid yet");
  assert.deepEqual(bet.players, [ben]);
  later.adjustments = [{ id:"r1", player:adi, delta:3000, reason:"Test", ts:12_000_000 }];
  const jump = ui.weekendFacts(later, events).filter(fact => fact.kind === "first");
  assert.deepEqual(jump.map(fact => fact.text), [`First to 2,000: ${evan} and ${khoa}`, `First to 4,000: ${adi}`]);
});

test("facts are deterministic and a correction re-derives them", () => {
  const state = withLeader(fresh());
  post(state, solo[0], [evan], 1_000_000);
  post(state, solo[1], [evan], 2_000_000);
  const once = JSON.stringify(ui.weekendFacts(state, events));
  assert.equal(JSON.stringify(ui.weekendFacts(structuredClone(state), events)), once);
  assert.ok(once.includes("second win"));
  /* the second result is corrected to Khoa: the fact is gone */
  state.results[solo[1].id] = { slots:[[khoa], [], []], ts:9_000_000, confirmedAt:2_000_000, correctedAt:9_000_000, revision:2 };
  assert.ok(!ui.weekendFacts(state, events).some(fact => fact.text.includes("second win")));
  /* a corrected result keeps its place in the weekend */
  state.results[solo[0].id] = { slots:[[evan], [], []], ts:10_000_000, confirmedAt:1_000_000, correctedAt:10_000_000, revision:2 };
  post(state, solo[2], [evan], 3_000_000);
  const second = ui.weekendFacts(state, events).find(fact => fact.text === `${evan}'s second win`);
  assert.equal(second.at, 3_000_000);
  /* a shelved event's result does not count */
  const shelved = withLeader(fresh());
  post(shelved, solo[0], [evan], 1_000_000);
  post(shelved, solo[1], [evan], 2_000_000);
  shelved.shelved = { [solo[1].id]:true };
  assert.ok(!ui.weekendFacts(shelved, events).some(fact => fact.text.includes("second win")));
  /* nothing posted, nothing said */
  assert.deepEqual(ui.weekendFacts(fresh(), events), []);
});

test("team wins name the team; the ticker shows the newest facts beside the latest result", () => {
  /* two two-team games with the same sides: 5v5 and Flip Cup (legacy) */
  const state = withLeader(withLegacyEvents(fresh(), ["flip"]));
  const events = allEventsOf(state);
  const bball5 = events.find(event => event.id === "bball5");
  const flip = events.find(event => event.id === "flip");
  const teamA = ROSTER.slice(0, 6), teamB = ROSTER.slice(6, 12);
  state.draws = {
    bball5:{ id:"d1", teams:[{ players:teamA, name:"Sun" }, { players:teamB, name:"Pool" }] },
    flip:{ id:"d2", teams:[{ players:teamA, name:"Sun" }, { players:teamB, name:"Pool" }] },
  };
  post(state, bball5, teamA, 1_000_000);
  post(state, flip, teamA, 2_000_000, teamB);
  const facts = ui.weekendFacts(state, events);
  const wins = facts.find(fact => fact.kind === "wins");
  assert.equal(wins.text, "Second win for Sun");
  assert.equal(wins.own, "Your second win");
  const items = ui.tickerItems({ state, events, standings:computeStandings(state), allTied:false, latest:null,
    facts, now:0 });
  const factItems = items.filter(item => Object.values(ui.FACT_TAGS).includes(item.tag));
  /* newest first: the win, then the leader's milestone */
  assert.deepEqual(factItems.map(item => item.text), ["Second win for Sun", `First to 7,000: ${ROSTER[12]}`]);
  assert.equal(factItems[0].players.length, 4);
  /* every fact's role is one the ticker draws */
  for (const role of Object.values(ui.FACT_ROLES)) assert.ok(ui.TICKER_ROLES.includes(role), role);
  /* at most two, newest first */
  const many = [1, 2, 3].map(n => ({ id:`f${n}`, kind:"wins", tag:"Milestone", at:n, players:[evan], text:`fact ${n}` }));
  const shown = ui.tickerItems({ state, events, standings:computeStandings(state), allTied:false, facts:many, now:0 })
    .filter(item => item.tag === "Milestone").map(item => item.text);
  assert.deepEqual(shown, ["fact 3", "fact 2"]);
  /* without facts the ticker is unchanged */
  const bare = ui.tickerItems({ state, events, standings:computeStandings(state), allTied:false, latest:null, now:0 });
  assert.ok(!bare.some(item => Object.values(ui.FACT_TAGS).includes(item.tag)));
});

test("a whole weekend through the real reducers: one fact per write, terse, stable", () => {
  const state = structuredClone(EMPTY_STATE);
  const result = rawApply(state, "qaAdvance", { target:"crowned", seed:7 },
    { isGm:true, qa:true, progressReset:true, environment:"local" });
  assert.equal(result.ok, true, result.error);
  assert.ok(state.frozen);
  const facts = ui.weekendFacts(state, allEventsOf(state));
  /* the QA clock moves 1ms per write, so writes, not time, keep facts apart */
  assert.ok(facts.length >= 5, `${facts.length} facts`);
  assert.equal(new Set(facts.map(fact => fact.anchor)).size, facts.length);
  assert.equal(new Set(facts.map(fact => fact.id)).size, facts.length);
  for (const fact of facts) {
    assert.doesNotMatch(`${fact.text} ${fact.own}`, /[—!]/);
    assert.ok(fact.players.length >= 1 && fact.players.every(player => ROSTER.includes(player)));
    assert.ok(Object.values(ui.FACT_TAGS).includes(fact.tag));
  }
  assert.ok(facts.some(fact => fact.kind === "first"));
  /* the same history says the same thing, and is quick enough to run per broadcast */
  const again = structuredClone(state);
  const started = performance.now();
  assert.deepEqual(ui.weekendFacts(again, allEventsOf(again)), facts);
  assert.ok(performance.now() - started < 250);
});

test("the receipt carries one line when the fresh fact is yours, and never someone else's", () => {
  const before = withLeader(fresh());
  post(before, solo[0], [evan], 1_000_000);
  const after = structuredClone(before);
  post(after, solo[1], [evan], 2_000_000, [khoa]);
  const FRESH = { fresh:true, live:true, correction:false };
  const snap = (state, me) => ui.chipSnapshot(state, me, events, computeStandings(state));
  const mine = ui.resultMoment({ prev:snap(before, evan), next:snap(after, evan), prevState:before, state:after,
    events, frame:FRESH, now:7 });
  assert.equal(mine.kind, "receipt");
  assert.equal(mine.fact, "Your second win");
  const html = inProvider(React.createElement(ui.ChipReceipt, { moment:{ ...mine, animate:false } }));
  assert.match(html, /fd-receipt-fact[^>]*>Your second win</);
  assert.match(html, /aria-label="[^"]*Your second win"/);

  /* Khoa placed second: his receipt has no fact about Evan */
  const his = ui.resultMoment({ prev:snap(before, khoa), next:snap(after, khoa), prevState:before, state:after,
    events, frame:FRESH, now:7 });
  assert.equal(his.kind, "receipt");
  assert.equal(his.fact, null);
  assert.doesNotMatch(inProvider(React.createElement(ui.ChipReceipt, { moment:{ ...his, animate:false } })),
    /fd-receipt-fact/);
  /* a catch-up frame makes no receipt at all, so no fact either */
  assert.equal(ui.resultMoment({ prev:snap(before, evan), next:snap(after, evan), prevState:before, state:after,
    events, frame:{ fresh:false, live:false, correction:false }, now:7 }), null);
  /* a merged receipt keeps the newest fact */
  const merged = ui.mergeMoments(mine, { ...mine, id:"r8", lines:[], fact:null }, {});
  assert.equal(merged.fact, "Your second win");
});

/* ── D5 ── */

let actionSeq = 0;
const gm = show => ({ isGm:true, player:"Brandon", actionId:`ros-${++actionSeq}`, deviceId:"gm-device",
  showControl:show });
const apply = (state, type, payload, show) => {
  const result = applyAction(state, type, payload, gm(show));
  assert.equal(result.ok, true, `${type}: ${result.error}`);
  return result;
};

/* What the commissioner does for the pill's current beat. */
function perform(state, show) {
  const director = resolveDirector(state, events, { showControl:show });
  const model = ui.directorPill(state, events, director, {});
  const action = director.nextAction;
  const ev = director.event;
  if (!action || !model) return false;
  if (model.sides) { apply(state, model.sides[0].run.write, model.sides[0].run.payload, show); return true; }
  /* the crew check confirms the suggested room as shown */
  if (model.run?.open === "crewCheck" && model.run.then?.write) {
    apply(state, model.run.then.write, { ...model.run.then.payload, players:model.run.players, roles:model.run.roles }, show);
    return true;
  }
  if (model.run?.write) { apply(state, model.run.write, model.run.payload, show); return true; }
  const contest = ev ? resolveCurrentContest(state, ev) : null;
  switch (action.type) {
    case "captains-draft": {
      /* the captains draft the whole pool, then the commissioner confirms */
      const pool = model.run.players?.length ? model.run.players : model.run.pool?.length ? model.run.pool : ROSTER;
      const teams = ev.teamCfg?.teams || 2;
      apply(state, "startDraft", { evId:ev.id, players:pool, roles:model.run.roles || [], captains:pool.slice(0, teams) }, show);
      while (state.drafts[ev.id].pool.length)
        apply(state, "pickDraftPlayer", { evId:ev.id, player:state.drafts[ev.id].pool[0], ...draftTurn(state.drafts[ev.id]) }, show);
      apply(state, "finalizeDraft", { evId:ev.id, ...draftTurn(state.drafts[ev.id]) }, show);
      return true;
    }
    case "record-contest-winner": {
      const keys = contest.sides.map(side => side.key);
      apply(state, "recordContestWinner", { evId:ev.id, contestId:contest.id, contestRevision:contest.revision,
        winner:keys[0], qualifiers:keys.slice(0, state.stages?.[ev.id]?.advance || 1), postResult:true,
        ...(contest.kind === "stage-final" ? { order:keys } : {}) }, show);
      return true;
    }
    case "enter-result": case "post-result": {
      if (action.type === "enter-result") apply(state, "beginResultEntry", { evId:ev.id }, show);
      const sides = contest ? contest.sides : [];
      apply(state, "saveResult", { evId:ev.id, slots:[sides[0].players, sides[1]?.players || [], sides[2]?.players || []] }, show);
      return true;
    }
    case "setup-poker": case "start-poker":
      apply(state, "pokerSetup", {}, show);
      apply(state, "pokerStart", {}, show);
      return true;
    case "run-poker": {
      const seat = state.poker.seats?.[0] || ROSTER[0];
      apply(state, "pokerCount", { player:seat, count:CHIP_MIN * 4 }, show);
      return true;
    }
    case "post-poker-result": {
      const seats = state.poker.seats || ROSTER;
      const open = seats.filter(player => state.poker.counts?.[player] === undefined);
      const counted = Object.values(state.poker.counts || {}).reduce((sum, n) => sum + n, 0);
      let left = Math.floor((state.poker.total - counted) / CHIP_MIN);
      open.forEach((player, index) => {
        const share = index === open.length - 1 ? left : Math.max(1, Math.floor(left / (open.length - index)) - index);
        left -= share;
        apply(state, "pokerCount", { player, count:share * CHIP_MIN }, show);
      });
      apply(state, "pokerResult", {}, show);
      return true;
    }
    case "crown-champion":
      apply(state, "crownChampion", { champions:computeStandings(state).filter(row => row.rank === 1).map(row => row.player) }, show);
      return true;
    default: return false;
  }
}

const key = item => item && `${item.label} · ${item.subject}`;
function playWeekend(show, held = false) {
  const state = structuredClone(EMPTY_STATE);
  /* held: the autopilot waits, so every scene step is the commissioner's */
  if (held) state.autopilot = { hold:true, at:0 };
  const misses = [];
  const seen = new Set();
  let crown = null;
  let steps = 0, previous = null;
  for (; steps < 400; steps++) {
    const now = ui.projectBeats(state, events, null, { showControl:show });
    if (!now.length) break;
    seen.add(now[0].label);
    if (now[0].type === "crown-champion") crown = ui.runOfShow(state, events, null, { showControl:show }).beats[0].subject;
    if (previous) {
      if (key(previous[1]) !== key(now[0])) misses.push(`next: projected ${key(previous[1])}, got ${key(now[0])}`);
      if (previous[2] && key(previous[2]) !== key(now[1]))
        misses.push(`then: projected ${key(previous[2])}, got ${key(now[1])}`);
    }
    previous = now;
    if (!perform(state, show)) break;
  }
  return { state, misses, steps, seen, crown };
}

for (const [show, held] of [[false, false], [true, false], [true, true]]) {
  test(`run of show: every projected Next and Then is what the pill offers next (Show Control ${show ? "on" : "off"}${held ? ", autopilot held" : ""})`, () => {
    const { state, misses, steps, seen, crown } = playWeekend(show, held);
    assert.ok(state.frozen, "the weekend reached the crown");
    assert.ok(steps > 40);
    assert.deepEqual(misses, []);
    /* every phase of the weekend was projected along the way */
    for (const label of ["Announce", "Announce and draw", "Captains draft", "Lock and start", "Record winner", "Enter result",
      "Deal and start", "Blind clock", "Post counts", "Crown", ...(show ? ["Opening", "Continue"] : []),
      ...(show && held ? ["Show standings"] : [])])
      assert.ok(seen.has(label), label);
    /* with the autopilot running, the winner scene plays itself: never a tap */
    if (show && !held) assert.ok(!seen.has("Show standings"));
    /* the crown names who it is for */
    const champions = computeStandings(state).filter(row => row.rank === 1).map(row => row.player);
    assert.equal(crown, ui.namesOf(state, champions));
  });
}

test("run of show: how long the event has run, and who is away", () => {
  const state = structuredClone(EMPTY_STATE);
  apply(state, "announceEvent", { evId:"putt" }, false);
  const contest = resolveCurrentContest(state, events.find(event => event.id === "putt"));
  apply(state, "lockAndStart", { evId:"putt", contestId:contest.id, contestRevision:contest.revision }, false);
  state.away = { [ben]:true };
  const started = state.eventOps.putt.startedAt;
  const model = ui.runOfShow(state, events, null, { now:started + 14 * 60000 + 5000 });
  assert.deepEqual(model.beats.map(item => item.slot), ["Now", "Next", "Then"]);
  assert.deepEqual(model.beats.map(item => item.label), ["Enter result", "Announce and draw", "Lock and start"]);
  assert.deepEqual(model.started, { event:"Long Putt", at:started, text:"14 min ago" });
  assert.deepEqual(model.away.map(item => item.player), [ben]);
  assert.equal(model.replay, null);
  assert.equal(ui.runOfShow(state, events, null, { now:started + 75 * 60000 }).started.text, "1 hr 15 min ago");
  assert.equal(ui.runOfShow(state, events, null, { now:started + 20000 }).started.text, "<1 min ago");
  /* nothing started before the lock */
  assert.equal(ui.runOfShow(structuredClone(EMPTY_STATE), events, null, {}).started, null);
});

test("run of show: a replay the TV owes shows while another winner is still on screen", () => {
  const state = structuredClone(EMPTY_STATE);
  /* the commissioner is taking the scenes by hand */
  state.autopilot = { hold:true, at:0 };
  const play = evId => {
    const ev = events.find(event => event.id === evId);
    apply(state, "announceEvent", { evId }, true);
    const contest = resolveCurrentContest(state, ev);
    apply(state, "lockAndStart", { evId, contestId:contest.id, contestRevision:contest.revision }, true);
    apply(state, "beginResultEntry", { evId }, true);
    apply(state, "saveResult", { evId, slots:[[evan], [khoa], [sahil]] }, true);
  };
  /* Long Putt plays its winner and standings, then Where and When posts */
  state.eventOrder = ["putt", "where", ...events.map(event => event.id).filter(id => id !== "putt" && id !== "where")];
  play("putt");
  apply(state, "advanceShowScene", { id:state.showControl.active.id }, true);
  play("where");
  assert.equal(state.showControl.active.kind, "winner");
  /* the putt result is corrected while Where and When's winner is on the TV */
  apply(state, "saveResult", { evId:"putt", slots:[[khoa], [evan], [sahil]], confirmOverwrite:true,
    correctionReason:"1st and 2nd were reversed" }, true);
  const eventsNow = allEventsOf(state);
  const model = ui.runOfShow(state, eventsNow, null, { showControl:true });
  assert.equal(model.beats[0].label, "Show standings");
  assert.equal(model.replay, "Long Putt");
  /* the projection offers the replay right after the scene */
  assert.equal(model.beats[1].label, "Replay winner");
  /* with Show Control off there is no ceremony to owe */
  assert.equal(ui.runOfShow(state, eventsNow, null, { showControl:false }).replay, null);
});

test("the pill keeps one primary action; a 44px more button holds the run of show and the edge cases", () => {
  const state = structuredClone(EMPTY_STATE);
  const director = resolveDirector(state, events, { showControl:false });
  const model = ui.directorPill(state, events, director, {});
  const pill = inProvider(React.createElement(ui.DirectorPill, { model, state, events, director,
    onWrite:async () => ({ ok:true }), onOpen:() => {} }));
  assert.match(pill, /class="fd-pill-more has-actions"[^>]*aria-expanded="false"[^>]*aria-label="More, \d+ actions?"/);
  assert.match(pill, /fd-pill-more-peek/, "a tray with actions shows its count on the button");
  assert.doesNotMatch(pill, /class="fd-runshow/, "the tray opens on demand");
  assert.ok(model.extras.some(extra => extra.label === "Skip" && extra.kind === "skip"), "Skip is an edge case");
  assert.doesNotMatch(pill.replace(/<[^>]+>/g, " "), /\bSkip\b/, "Skip is never promoted beside the pill");
  /* in the tray the run of show is embedded: the tray owns its close */
  const embedded = inProvider(React.createElement(ui.RunOfShowPanel, { state, events, director, now:0, embedded:true }));
  assert.equal((embedded.match(/<button/g) || []).length, 0);
  assert.doesNotMatch(embedded, /fd-runshow-slot">Now</, "the pill is Now: the tray never repeats it");
  assert.match(embedded, /fd-runshow-slot">Next</);
  const panel = inProvider(React.createElement(ui.RunOfShowPanel, { state, events, director, now:0 }));
  for (const slot of ["Now", "Next", "Then"]) assert.match(panel, new RegExp(`fd-runshow-slot">${slot}<`));
  assert.match(panel, /Announce<\/b><small>Long Putt/);
  /* a subject is said once: the next beat on the same event carries only its verb */
  assert.equal((panel.match(/<small>Long Putt</g) || []).length, 1, "Long Putt is not listed twice");
  assert.doesNotMatch(embedded, /<small>Long Putt</, "the pill already names it");
  /* read-only: its only control is Close */
  assert.equal((panel.match(/<button/g) || []).length, 1);
  assert.match(panel, /aria-label="Close run of show"/);
  const css = readFileSync(new URL("../src/features/director/run-of-show.css", import.meta.url), "utf8");
  const dock = readFileSync(new URL("../src/features/director/director.css", import.meta.url), "utf8");
  assert.match(dock, /\.fd-pill-more \{[^}]*width:48px; min-height:44px;/);
  assert.match(css, /\.fd-runshow-x \{[^}]*width:44px; height:44px;/);
  assert.match(css, /-webkit-touch-callout:none/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,6}\b/i);
});

test("a hold opens after HOLD_MS; a short tap or a scroll does not, and the hold's click is swallowed", t => {
  t.mock.timers.enable({ apis:["setTimeout"] });
  let hold = null, opened = 0;
  const Probe = () => { hold = ui.useHold(() => { opened += 1; }); return null; };
  renderToStaticMarkup(React.createElement(Probe));
  const at = (x, y) => ({ clientX:x, clientY:y, preventDefault() {} });
  hold.bind.onPointerDown(at(10, 10));
  t.mock.timers.tick(ui.HOLD_MS - 50);
  hold.bind.onPointerUp();
  t.mock.timers.tick(200);
  assert.equal(opened, 0);
  assert.equal(hold.consume(), false);
  hold.bind.onPointerDown(at(10, 10));
  hold.bind.onPointerMove(at(10, 40));
  t.mock.timers.tick(ui.HOLD_MS + 50);
  assert.equal(opened, 0);
  hold.bind.onPointerDown(at(10, 10));
  t.mock.timers.tick(ui.HOLD_MS + 1);
  assert.equal(opened, 1);
  /* the click that ends the hold does not also run the pill */
  assert.equal(hold.consume(), true);
  assert.equal(hold.consume(), false);
});
