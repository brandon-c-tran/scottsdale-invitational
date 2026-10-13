/* D5 "Run of show": what the director pill will offer next, for the
   commissioner's hold on the pill. Pure and read-only: every action stays
   on the pill.

   Now is the director's current beat. What follows is projected without
   writing anything: scene steps by running resolveDirector against a copy
   whose scene has finished, and the rest of the slate by walking the same
   lifecycle the server does (each contest locks and starts, then its winner
   is recorded or its result entered; a posted result plays its winner scene
   when Show Control is on; the next open event is announced; the finale
   deals, runs the clock, posts counts, and crowns). */
import {
  rosterOf, allEventsOf, bracketMatchName, bracketOrder, computeStandings, disp, isAway, makeBracket,
  presentPlayers, stageFinalists, teamFit,
} from "../../../shared/core.js";
import { SHOW_SCENE_DEFINITIONS, autopilotHeld, contestName, draftsByDefault, resolveDirector, resolveShowScene } from "../../../shared/show.js";
import { triviaFinalEntry, triviaQuestionTotal, triviaRoundCount } from "../../../shared/trivia.js";
import { BOARD_FORMAT, FINAL_PHASES, isBoardGame, triviaFormatOf } from "../../../shared/triviaBoard.js";
import { hasKaraokeSong, karaokeResultSlots } from "../../../shared/karaoke.js";
import { namesOf } from "./directorPill.js";

export const RUN_SLOTS = Object.freeze(["Now", "Next", "Then"]);
const SCENE_BEATS = new Set(["advance-scene", "clear-scene", "replay-winner-scene", "start-champion-scene",
  "start-opening-scene"]);
const decided = value => value !== null && value !== undefined;
const beat = (type, label, subject = "") => ({ type, label, subject });
const sceneSubject = (kind, step) => {
  const definition = SHOW_SCENE_DEFINITIONS[kind];
  return definition ? `On TV: ${definition.label}, ${step + 1} of ${definition.steps.length}` : "";
};
/* the director's own verb for leaving a scene step */
const advanceLabel = (kind, step) => kind === "winner" && step === 0 ? "Show standings"
  : kind === "champion" && step === 0 ? "Class photo" : "Continue";
/* after the crown the champion scene still owes its class photo step */
const championBeats = () => (SHOW_SCENE_DEFINITIONS.champion?.steps.length || 1) > 1
  ? [beat("advance-scene", advanceLabel("champion", 0), sceneSubject("champion", 0))] : [];

/* The contests an event still has to play, in the order the server opens
   them, named the way the pill names them. A bracket or heats that are not
   drawn yet are planned from the shape the room would play. */
export function contestPlan(state, ev) {
  if (!ev || ev.finale) return [];
  const br = state.brackets?.[ev.id];
  const fit = !br && ev.teamCfg?.bracket ? teamFit(ev, presentPlayers(state).length) : null;
  const bracket = br || (fit?.bracket ? makeBracket(fit.teams) : null);
  if (bracket?.rounds) {
    const done = new Set();
    bracket.rounds.forEach((round, r) => round.forEach((match, m) => { if (decided(match.winner)) done.add(`${r}:${m}`); }));
    const seated = slot => !!slot && (slot.t !== undefined || done.has(`${slot.w[0]}:${slot.w[1]}`));
    const plan = [];
    for (let guard = 0; guard < 64; guard++) {
      const next = bracketOrder(guard === 0 ? bracket : { ...bracket, next:null })
        .find(([r, m]) => !done.has(`${r}:${m}`) && seated(bracket.rounds[r][m].a) && seated(bracket.rounds[r][m].b));
      if (!next) break;
      done.add(`${next[0]}:${next[1]}`);
      plan.push({ kind:"match", name:bracketMatchName(bracket, next[0], next[1]) });
    }
    return plan;
  }
  const st = state.stages?.[ev.id];
  if (st?.groups) {
    const plan = st.groups.filter(group => (group.through || []).length < st.advance
      || (st.contestVersion === 1 && !decided(group.winner)))
      .map(group => ({ kind:"heat", name:group.name || "Heat" }));
    if (!(stageFinalists(st) && decided(st.finalWinner))) plan.push({ kind:"stage-final", name:"Final" });
    return plan;
  }
  if (ev.stageCfg) {
    const count = Math.max(1, Number(ev.stageCfg.nGroups) || 1);
    return [...Array.from({ length:count }, (_, i) => ({ kind:"heat",
      name:ev.stageCfg.kind === "heats" ? `Heat ${i + 1}` : `Pool ${"ABCD"[i] || i + 1}` })),
    { kind:"stage-final", name:"Final" }];
  }
  return [{ kind:"ffa", name:ev.name }];
}

/* Where and When with photos plays its rounds where a free-for-all would
   enter a result: from the beat the pill is on (shared/geo.js geoBeat) to
   the result. Null when the game has no photos. */
function geoPlan(state, ev) {
  const rounds = state.geoRounds || [];
  if (ev?.game !== "where" || !rounds.length || state.results?.[ev.id]) return null;
  const geo = state.geo?.eventId === ev.id && state.geo.order ? state.geo : null;
  const n = geo ? geo.order.length : rounds.length;
  const photo = i => `Photo ${i + 1} of ${n}`;
  /* Lock and start puts the first photo up; a Start beat is owed only by an
     event already under way without its game */
  const out = geo || !state.eventOps?.[ev.id]?.startedAt ? [] : [beat("geo-start", "Start game", ev.name)];
  for (let i = geo ? geo.index : 0; i < n; i++) {
    if (!(geo && i === geo.index && geo.phase !== "guess")) out.push(beat("geo-reveal", "Reveal", photo(i)));
    if (i < n - 1) out.push(beat("geo-next", "Next photo", photo(i)));
  }
  out.push(beat("geo-finish", "Post result", ev.name));
  return out;
}

/* The Trivia board, plainly: Start trivia (owed only by an event already
   under way without its game), the board, the Final, the result
   (shared/triviaBoard.js boardBeat runs each step). Null without a set list. */
function boardPlan(state, ev) {
  const game = isBoardGame(state.trivia) && state.trivia.eventId === ev.id ? state.trivia : null;
  if (!game && !triviaQuestionTotal(state.triviaRounds)) return null;
  const out = game || !state.eventOps?.[ev.id]?.startedAt ? [] : [beat("trivia-start", "Start trivia", ev.name)];
  if (!game || !FINAL_PHASES.includes(game.phase)) out.push(beat("board-step", "The board", ev.name));
  if (!game || (game.final && game.phase !== "final-board"))
    out.push(beat("board-step", "The Final", game?.final?.category || triviaFinalEntry(state.triviaRounds)?.category || "Final"));
  out.push(beat("trivia-finish", "Post result", ev.name));
  return out;
}

/* Trivia with a set list, the same way: each question revealed, the scores
   at each round's end, then the result (shared/trivia.js triviaBeat). */
function triviaPlan(state, ev) {
  if (ev?.game !== "trivia" || state.results?.[ev.id]) return null;
  const game = state.trivia?.eventId === ev.id && state.trivia.questions?.length ? state.trivia : null;
  if ((isBoardGame(state.trivia) && state.trivia.eventId === ev.id) || (!game && triviaFormatOf(state) === BOARD_FORMAT))
    return boardPlan(state, ev);
  const rounds = game ? game.rounds : (state.triviaRounds || []).map(round => ({ name:round.name || round.category || "",
    count:triviaRoundCount(round) })).filter(round => round.count)
    .map((round, i, list) => ({ ...round, first:list.slice(0, i).reduce((sum, item) => sum + item.count, 0) }));
  const total = rounds.reduce((sum, round) => sum + round.count, 0);
  if (!total) return null;
  const question = i => `Question ${i + 1} of ${total}`;
  const ends = new Set(rounds.map(round => round.first + round.count - 1));
  const out = game || !state.eventOps?.[ev.id]?.startedAt ? [] : [beat("trivia-start", "Start trivia", ev.name)];
  for (let i = game ? game.index : 0; i < total; i++) {
    const here = game && i === game.index;
    if (!(here && game.phase !== "question")) out.push(beat("trivia-reveal", "Reveal", question(i)));
    if (ends.has(i) && !(here && game.phase === "board"))
      out.push(beat("trivia-board", i === total - 1 ? "Final scores" : "Scores", ev.name));
    if (i < total - 1) out.push(beat("trivia-next", ends.has(i) ? "Next round" : "Next question", question(i + 1)));
  }
  out.push(beat("trivia-finish", "Post result", ev.name));
  return out;
}

/* Karaoke, the same way: the pick window, a Start song and a Close vote
   for each singer still to come, then the result (shared/karaoke.js
   karaokeBeat). A game not started yet plays only with the karaoke
   capability (`karaoke`); until the order is drawn its singers are counted
   from who is here with a song. Null when the ordinary result entry
   applies. */
function karaokePlan(state, ev, karaoke = false) {
  if (ev?.game !== "karaoke" || state.results?.[ev.id]) return null;
  const game = state.karaoke?.eventId === ev.id ? state.karaoke : null;
  if (!game && !karaoke) return null;
  if (game && (game.empty || game.phase === "done" || game.finishedAt
    || (game.phase === "reveal" && !karaokeResultSlots(game.ranking).length))) return null;
  const out = game || !state.eventOps?.[ev.id]?.startedAt ? [] : [beat("karaoke-start", "Start karaoke", ev.name)];
  if (!game || game.phase === "pick") out.push(beat("karaoke-step", "Start singing", ev.name));
  if (!game || game.phase !== "reveal") {
    const here = presentPlayers(state);
    const n = game?.phase === "turns" ? game.order.length
      : here.filter(player => hasKaraokeSong(state, player) || game?.songs?.[player]).length || here.length;
    const turn = game?.phase === "turns" ? game.turns?.[game.order[game.index]] : null;
    const singer = i => `Singer ${i + 1} of ${n}`;
    for (let i = game?.phase === "turns" ? game.index : 0; i < n; i++) {
      if (!(turn && i === game.index && Number.isFinite(turn.songAt))) out.push(beat("karaoke-step", "Start song", singer(i)));
      out.push(beat("karaoke-step", "Close vote", singer(i)));
    }
  }
  out.push(beat("karaoke-step", "Post result", ev.name));
  return out;
}

const decideBeats = (state, ev, contest, karaoke = false) => contest.kind === "ffa"
  ? geoPlan(state, ev) || triviaPlan(state, ev) || karaokePlan(state, ev, karaoke) || [beat("enter-result", "Enter result", ev.name)]
  : [beat("record-contest-winner", "Record winner", contest.name)];

/* After a result posts: the winner scene's standings step, when the TV
   plays it and the autopilot is held (otherwise it plays itself). */
const afterResult = (showControl, state) => showControl && autopilotHeld(state)
  ? [beat("advance-scene", "Show standings", sceneSubject("winner", 0))] : [];

/* An event from its announcement: announce, then every contest. */
function eventBeats(state, ev, showControl, karaoke = false) {
  if (ev.finale) return pokerBeats(state, ev, null, showControl);
  const drawNeeded = (ev.teamCfg && !state.draws?.[ev.id]) || (ev.stageCfg && !state.stages?.[ev.id]);
  const out = drawNeeded && draftsByDefault(ev) && !state.draws?.[ev.id]
    ? [beat("captains-draft", "Captains draft", ev.name), beat("announce", "Announce", ev.name)]
    : [beat(drawNeeded ? "announce-draw" : "announce", drawNeeded ? "Announce and draw" : "Announce", ev.name)];
  contestPlan(state, ev).forEach(contest => out.push(beat("lock-start", "Lock and start",
    contest.kind === "ffa" ? ev.name : contest.name), ...decideBeats(state, ev, contest, karaoke)));
  return [...out, ...afterResult(showControl, state)];
}

/* The finale from wherever it is: deal, clock, counts, crown. */
function pokerBeats(state, ev, from, showControl) {
  const steps = [
    beat("setup-poker", "Deal and start", ev?.name || ""),
    beat("run-poker", "Blind clock", ev?.name || ""),
    beat("post-poker-result", "Post counts", ev?.name || ""),
    ...afterResult(showControl, state),
    beat("crown-champion", "Crown", ""),
  ];
  if (!from) return steps;
  const start = { "setup-poker":0, "start-poker":0, "run-poker":1, "post-poker-result":2, "crown-champion":steps.length - 1 }[from];
  return steps.slice((start ?? 0) + 1);
}

/* The lifecycle after the current beat, through the rest of the slate.
   `karaoke`: the karaoke capability (a game not started yet plays). */
function lifecycleAfter(state, events, director, showControl, karaoke = false) {
  const now = director?.nextAction;
  const ev = director?.event || null;
  if (!now) return [];
  if (now.type === "crown-champion") return showControl ? championBeats() : [];
  if (ev?.finale || ["setup-poker", "start-poker", "run-poker", "post-poker-result"].includes(now.type))
    return pokerBeats(state, ev, now.type, showControl);
  const out = [];
  if (ev) {
    const plan = contestPlan(state, ev);
    const current = plan[0];
    const rest = plan.slice(1);
    const contestBeats = list => list.flatMap(contest => [beat("lock-start", "Lock and start",
      contest.kind === "ffa" ? ev.name : contest.name), ...decideBeats(state, ev, contest, karaoke)]);
    if (["announce", "announce-draw", "captains-draft", "open-betting", "continue-draft", "prepare-draw", "prepare-stages"].includes(now.type)) {
      if (["captains-draft", "continue-draft", "prepare-draw", "prepare-stages"].includes(now.type))
        out.push(beat("announce", "Announce", ev.name));
      out.push(...contestBeats(plan), ...afterResult(showControl, state));
    } else if (now.type === "lock-start" || now.type === "lock-betting" || now.type === "start-event") {
      if (current) out.push(...decideBeats(state, ev, current, karaoke));
      out.push(...contestBeats(rest), ...afterResult(showControl, state));
    } else if (now.type?.startsWith("geo-")) {
      out.push(...(geoPlan(state, ev) || []).slice(1), ...afterResult(showControl, state));
    } else if (now.type?.startsWith("trivia-") || now.type === "board-step") {
      out.push(...(triviaPlan(state, ev) || []).slice(1), ...afterResult(showControl, state));
    } else if (now.type?.startsWith("karaoke-")) {
      out.push(...(karaokePlan(state, ev, karaoke) || []).slice(1), ...afterResult(showControl, state));
    } else if (now.type === "record-contest-winner") {
      out.push(...contestBeats(rest), ...afterResult(showControl, state));
    } else if (now.type === "enter-result" || now.type === "post-result") {
      out.push(...afterResult(showControl, state));
    }
  }
  const later = events.filter(item => item.id !== ev?.id && !state.results?.[item.id] && !state.shelved?.[item.id]);
  for (const item of later) {
    out.push(...eventBeats(state, item, showControl, karaoke));
    if (out.length > 8) break;
  }
  return out;
}

/* A copy of the state whose active scene has finished, the way the next
   official write or the Continue tap would leave it. */
function retireScene(state, active, extra = {}) {
  const control = state.showControl || { active:null, history:[] };
  const entry = { ...active, ...extra, endedAt:active.startedAt, outcome:"completed" };
  return { ...state, showControl:{ ...control, active:null,
    history:[entry, ...(Array.isArray(control.history) ? control.history : [])] } };
}

/* Beats a scene still owes, and the state once it has finished. */
function sceneAfter(state, events, now) {
  const control = state.showControl || {};
  const active = control.active || null;
  if (now.type === "advance-scene" && active) {
    const count = SHOW_SCENE_DEFINITIONS[active.kind]?.steps.length || 1;
    const out = [];
    for (let step = Number(active.step || 0) + 1; step < count - 1; step++)
      out.push(beat("advance-scene", advanceLabel(active.kind, step), sceneSubject(active.kind, step)));
    return { beats:out, state:retireScene(state, active) };
  }
  if (now.type === "clear-scene" && active) return { beats:[], state:retireScene(state, active) };
  if (now.type === "start-opening-scene") {
    const opening = { id:"run-of-show-opening", kind:"opening", eventId:null, step:0, startedAt:0 };
    return { beats:[beat("advance-scene", "Continue", sceneSubject("opening", 0))], state:retireScene(state, opening) };
  }
  if (now.type === "replay-winner-scene") {
    const revision = Number(state.results?.[now.eventId]?.revision || 1);
    const winner = { id:"run-of-show-winner", kind:"winner", eventId:now.eventId, step:0, startedAt:0, revision };
    const base = active && active.kind !== "winner" ? retireScene(state, active) : state;
    const cleared = active?.kind === "winner" ? { ...state, showControl:{ ...state.showControl, active:null } } : base;
    return { beats:[beat("advance-scene", "Show standings", sceneSubject("winner", 0))], state:retireScene(cleared, winner) };
  }
  if (now.type === "start-champion-scene") return { beats:championBeats(), state:null };
  return { beats:[], state };
}

/* The pill's beats from Now on, as many as `limit`. */
export function projectBeats(state, events = allEventsOf(state), director = null, { showControl = false, karaoke = false,
  now = Date.now(), limit = RUN_SLOTS.length } = {}) {
  const current = director || resolveDirector(state, events, { showControl, karaoke, now });
  const first = current?.nextAction;
  if (!first) return [];
  const out = [{ type:first.type, label:first.label, subject:first.subject || current.event?.name || "",
    blocked:first.enabled === false ? first.blockers?.[0] || null : null }];
  let director_ = current, probe = state;
  /* scene beats settle against a copy of the state; bounded, since each
     pass retires one scene */
  for (let guard = 0; guard < 4 && out.length < limit && SCENE_BEATS.has(director_?.nextAction?.type); guard++) {
    const after = sceneAfter(probe, events, director_.nextAction);
    out.push(...after.beats);
    if (!after.state) return out.slice(0, limit);
    probe = after.state;
    director_ = resolveDirector(probe, events, { showControl, karaoke, now });
    const next = director_?.nextAction;
    if (!next) return out.slice(0, limit);
    out.push({ type:next.type, label:next.label, subject:next.subject || director_.event?.name || "", blocked:null });
  }
  if (out.length < limit && !SCENE_BEATS.has(director_?.nextAction?.type))
    out.push(...lifecycleAfter(probe, events, director_, showControl, karaoke));
  /* the pill offers setup and start of the table as one step */
  const merged = out.filter((item, index) => index === 0
    || !(item.label === out[index - 1].label && item.subject === out[index - 1].subject));
  return merged.slice(0, limit);
}

const minutes = ms => {
  const total = Math.max(0, Math.floor(ms / 60000));
  if (total < 1) return "<1 min";
  if (total < 60) return `${total} min`;
  return `${Math.floor(total / 60)} hr ${total % 60} min`;
};

/* A replay the director owes but is not offering right now (a scene is
   still on the TV): what it would offer once the scene is done. */
function owedReplay(state, events, current, now) {
  const active = state.showControl?.active;
  if (!active || current?.nextAction?.type === "replay-winner-scene") return null;
  const probe = active.kind === "winner" && resolveShowScene(state, events)?.staleReason
    ? { ...state, showControl:{ ...state.showControl, active:null } } : retireScene(state, active);
  const later = resolveDirector(probe, events, { showControl:true, now })?.nextAction;
  if (later?.type !== "replay-winner-scene") return null;
  if (active.kind === "winner" && active.eventId === later.eventId
      && Number(active.revision ?? 0) === Number(later.revision)) return null;
  return later.subject || null;
}

/* Everything the run-of-show panel shows. */
export function runOfShow(state, events = allEventsOf(state), director = null, { showControl = false, karaoke = false,
  now = Date.now() } = {}) {
  const current = director || resolveDirector(state, events, { showControl, karaoke, now });
  const beats = projectBeats(state, events, current, { showControl, karaoke, now })
    .map((item, index) => ({ ...item, slot:RUN_SLOTS[index] }));
  const ev = current?.event || null;
  const startedAt = ev?.finale ? Number(state.poker?.startedAt) || 0
    : ev ? Number(state.eventOps?.[ev.id]?.startedAt) || 0 : 0;
  const away = rosterOf(state).filter(player => isAway(state, player));
  const replay = showControl ? owedReplay(state, events, current, now) : null;
  const champions = current?.nextAction?.type === "crown-champion"
    ? computeStandings(state).filter(row => row.rank === 1).map(row => row.player) : [];
  if (champions.length && beats[0] && !beats[0].subject) beats[0].subject = namesOf(state, champions);
  return {
    beats,
    started:startedAt && !state.results?.[ev.id] ? { event:ev.name, at:startedAt, text:`${minutes(now - startedAt)} ago` } : null,
    away:away.map(player => ({ player, name:disp(state, player) })),
    replay,
  };
}
