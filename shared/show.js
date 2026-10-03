/* Directed presentation is shared coordination state, not tournament truth.
   Scene records contain stable references and a step. Every player, result,
   and standings view is resolved from current authoritative state. */

import { computeStandings, resolveWeekendOperation, resolveCurrentContest, suggestParticipants,
  contestUndoAvailability, isAway, bracketMatchName } from "./core.js";
import { awardsRevealBlocker, revealBallot, revealedCount } from "./prompts.js";
import { mvpOpen, mvpVoters } from "./mvp.js";
import { geoBeat } from "./geo.js";

const SHOW_HISTORY_LIMIT = 20;
const SHOW_TERMINAL_OUTCOMES = Object.freeze(["completed", "skipped", "cancelled"]);

const SHOW_SCENE_DEFINITIONS = Object.freeze({
  opening: Object.freeze({
    label:"Opening",
    intensity:"major",
    steps:Object.freeze(["title", "room"]),
  }),
  /* one step: the intro says its piece and the next official write (lock
     and start, the next announcement) retires it, so an announcement never
     costs the host a Continue. Stored scenes from the two-step era clamp to
     this step. */
  "event-intro": Object.freeze({
    label:"Event intro",
    intensity:"normal",
    requiresEvent:true,
    steps:Object.freeze(["title"]),
  }),
  winner: Object.freeze({
    label:"Winner",
    intensity:"major",
    requiresEvent:true,
    requiresResult:true,
    steps:Object.freeze(["winner", "standings"]),
  }),
  standings: Object.freeze({
    label:"Standings",
    intensity:"routine",
    steps:Object.freeze(["board"]),
  }),
  /* the crown, then (D3) the class photo: all thirteen in final order.
     The second step is the commissioner's to take; the champion holds
     until then. A one-step record from before reads as the first step. */
  champion: Object.freeze({
    label:"Champion",
    intensity:"major",
    requiresFrozen:true,
    steps:Object.freeze(["champion", "class"]),
  }),
});

const emptyShowControl = () => ({ active:null, history:[] });
const showDefinition = kind =>
  Object.hasOwn(SHOW_SCENE_DEFINITIONS, kind) ? SHOW_SCENE_DEFINITIONS[kind] : null;

function validateShowSceneRequest(state, request, events = []) {
  if (!request || typeof request !== "object" || Array.isArray(request))
    return { ok:false, error:"Choose a show scene" };
  const kind = typeof request.kind === "string" ? request.kind : "";
  const definition = showDefinition(kind);
  if (!definition) return { ok:false, error:"Unknown show scene" };

  let eventId = null;
  let event = null;
  if (definition.requiresEvent) {
    eventId = typeof request.eventId === "string" ? request.eventId : "";
    event = events.find(item => item.id === eventId) || null;
    if (!event) return { ok:false, error:"Choose a current event" };
    if (state.shelved?.[eventId]) return { ok:false, error:"That event is shelved" };
  }
  if (definition.requiresResult) {
    const result = state.results?.[eventId];
    if (!result?.slots?.[0]?.length)
      return { ok:false, error:"Post the official result first" };
  }
  if (definition.requiresFrozen) {
    if (!state.frozen) return { ok:false, error:"Crown the champion first" };
    if (!computeStandings(state).some(row => row.rank === 1))
      return { ok:false, error:"No champion is available" };
  }

  return {
    ok:true,
    request:{ kind, eventId },
    definition,
    event,
  };
}

/* who the champion scene is for: rank 1 on the board, sorted, so a re-crown
   with a different champion owes the room a new scene */
function championIdentity(state) {
  return computeStandings(state).filter(row => row.rank === 1).map(row => row.player).sort();
}
const sameIdentity = (left, right) => Array.isArray(left) && Array.isArray(right)
  && left.length === right.length && [...left].sort().every((item, index) => item === [...right].sort()[index]);
/* a champion record played for this champion; legacy records carry no
   identity and count as played */
const championShownFor = (record, champion) => record?.kind === "champion"
  && (!Array.isArray(record.champion) || sameIdentity(record.champion, champion));

function createShowScene(request, {
  id,
  now,
  retryOf = null,
  revision = null,
  champion = null,
} = {}) {
  const timestamp = Number(now) || Date.now();
  return {
    id,
    kind:request.kind,
    eventId:request.eventId || null,
    step:0,
    startedAt:timestamp,
    updatedAt:timestamp,
    retryOf:retryOf || null,
    /* winner scenes remember which result revision they played for, so a
       correction marks the scene stale and the replay beat can tell a
       ceremony that already ran from one the corrected result still owes. */
    revision:revision ?? null,
    ...(Array.isArray(champion) ? { champion:[...champion] } : {}),
    commands:[],
  };
}

function finishShowScene(control, outcome, now = Date.now()) {
  if (!control?.active || !SHOW_TERMINAL_OUTCOMES.includes(outcome)) return null;
  const active = control.active;
  const entry = {
    id:active.id,
    kind:active.kind,
    eventId:active.eventId || null,
    startedAt:active.startedAt,
    endedAt:Number(now) || Date.now(),
    outcome,
    retryOf:active.retryOf || null,
    revision:active.revision ?? null,
    ...(Array.isArray(active.champion) ? { champion:[...active.champion] } : {}),
    commands:Array.isArray(active.commands) ? active.commands.slice(-8) : [],
  };
  control.active = null;
  control.history = [entry, ...(Array.isArray(control.history) ? control.history : [])]
    .slice(0, SHOW_HISTORY_LIMIT);
  return entry;
}

/* A scene that has already reached its last step has said everything it
   has to say. The next official preparation or start write (a draw, stage,
   draft, or the start of play) retires it as completed, so a leftover
   standings card can never sit on top of the next team reveal. Earlier
   steps are left alone: those still owe the host a Continue. */
function sceneAtLastStep(active) {
  const definition = showDefinition(active?.kind);
  return !!definition && Number(active.step) >= definition.steps.length - 1;
}
function retireFinishedShowScene(control, now = Date.now()) {
  if (!control?.active || !sceneAtLastStep(control.active)) return null;
  return finishShowScene(control, "completed", now);
}

function resolveShowScene(state, events = []) {
  const active = state.showControl?.active;
  if (!active || typeof active !== "object") return null;
  const definition = showDefinition(active.kind);
  if (!definition) {
    return {
      active,
      definition:null,
      stepKey:null,
      stepIndex:0,
      stepCount:0,
      event:null,
      result:null,
      players:[],
      standings:computeStandings(state),
      staleReason:"This scene is not supported by this version",
    };
  }

  const event = active.eventId
    ? events.find(item => item.id === active.eventId) || null
    : null;
  const result = event ? state.results?.[event.id] || null : null;
  const standings = computeStandings(state);
  const stepIndex = Math.max(0, Math.min(
    definition.steps.length - 1,
    Math.floor(Number(active.step) || 0),
  ));
  let staleReason = null;
  if (definition.requiresEvent && !event) staleReason = "The event is no longer available";
  else if (definition.requiresEvent && state.shelved?.[event.id])
    staleReason = "The event was shelved";
  else if (definition.requiresResult && !result?.slots?.[0]?.length)
    staleReason = "The official result is no longer available";
  else if (definition.requiresResult && active.revision != null
      && Number(result.revision || 1) !== Number(active.revision))
    staleReason = "The result was corrected";
  else if (definition.requiresFrozen && !state.frozen)
    staleReason = "The championship is no longer final";

  let players = [];
  if (active.kind === "winner") players = [...(result?.slots?.[0] || [])];
  else if (active.kind === "standings")
    players = standings.slice(0, 3).map(row => row.player);
  else if (active.kind === "champion")
    players = standings.filter(row => row.rank === 1).map(row => row.player);

  return {
    active,
    definition,
    stepKey:definition.steps[stepIndex],
    stepIndex,
    stepCount:definition.steps.length,
    event,
    result,
    players,
    standings,
    staleReason,
  };
}

/* ── the director ──
   One resolver decides the single next beat: advance the scene on the TV,
   clear a stale one, replay a ceremony a corrected result still owes, or
   run the next official step. Lifecycle beats are upgraded to their
   composite forms (announce, announce-draw, lock-start) whether or not
   Show Control is on; scene beats exist only when it is. The TV keeps
   reading resolveWeekendOperation, so director copy never leaks to the
   room. A beat's label is the short verb the pill shows; its subject is
   the thing it acts on, drawn on the pill's second line. */
const REPLAY_WINDOW_MS = 15 * 60 * 1000;
const ADVANCE_LABELS = { winner:{ winner:"Show standings" }, champion:{ champion:"Class photo" } };
const directorBeat = (type, label, extra = {}) =>
  ({ type, label, enabled:true, blockers:[], ...extra });

/* What the commissioner calls a contest out loud: "Semifinal 2", "Final",
   "Play-in 1", a heat's own name, or the event for a free-for-all. */
function contestName(state, ev, contest) {
  if (!contest) return ev?.name || "";
  if (contest.kind === "match" && Array.isArray(contest.match)) {
    const [r, m] = contest.match;
    return bracketMatchName(state.brackets?.[ev?.id] || {}, r, m);
  }
  if (contest.kind === "ffa") return ev?.name || contest.label || "";
  if (contest.kind === "stage-final" || contest.kind === "final") return "Final";
  if (contest.kind === "heat" && Number.isInteger(contest.group))
    return state.stages?.[ev?.id]?.groups?.[contest.group]?.name || contest.label || "";
  return contest.label || ev?.name || "";
}

/* A final whose recorded winner also posted the event result can be taken
   back while that result is still the one it posted: the same checks as any
   previous-contest correction, read as if the result were not there. */
function postedFinalUndo(state, ev) {
  const op = state.eventOps?.[ev?.id];
  const last = op?.lastContest, result = state.results?.[ev?.id];
  if (!last || !result || last.postedRevision === undefined || last.postedRevision === null) return null;
  if (Number(result.revision || 1) !== Number(last.postedRevision))
    return { enabled:false, blocker:"The result was corrected", contestId:last.id,
      contestRevision:Number(op.contestRevision || 0), refunds:[], voidIds:[] };
  const probe = { ...state, results:{ ...state.results } };
  delete probe.results[ev.id];
  return contestUndoAvailability(probe, ev);
}

/* players drawn into an event that has not been announced yet */
function drawnPlayers(state, ev) {
  const draw = state.draws?.[ev?.id];
  if (draw?.teams) return draw.teams.flatMap(team => team.players || []);
  const stages = state.stages?.[ev?.id];
  if (stages?.entrantType === "solo") return stages.groups.flatMap(group => group.entrants || []);
  return [];
}

const LIFECYCLE_LABELS = {
  "open-betting":"Announce",
  "lock-betting":"Lock and start",
  "start-event":"Start",
  "record-contest-winner":"Record winner",
  "continue-draft":"Continue the draft",
  "enter-result":"Enter result",
  "post-result":"Post result",
  "setup-poker":"Deal and start",
  "start-poker":"Deal and start",
  "run-poker":"Blind clock",
  "post-poker-result":"Post counts",
};

/* team games of three or more a side (3v3s, the everyone-plays 5v5) open
   with a captains' draft; pairs keep the random draw */
export const draftsByDefault = ev => ev?.kind === "team" && !ev.finale
  && ((Number(ev.teamCfg?.size) || 0) >= 3 || ev.participation?.type === "all");

function lifecycleBeat(state, operation) {
  const action = operation.nextAction;
  const ev = operation.event;
  const none = { ...operation, scene:null, secondary:null, extras:[] };
  if (!action) return none;
  if (action.type === "crown-champion") {
    const champions = computeStandings(state).filter(row => row.rank === 1).map(row => row.player);
    return { ...none, nextAction:{ ...action, label:"Crown", champions } };
  }
  if (!ev) return none;
  const contest = resolveCurrentContest(state, ev);
  /* Skipping is the secondary beat beside an event that has not begun, so
     the night can jump to the finale without hunting for Shelve. */
  const secondary = !ev.finale && !state.eventOps?.[ev.id]?.startedAt
    && SKIPPABLE_PHASES.includes(operation.lifecycle?.phase)
    ? { type:"skip-event", label:`Skip ${ev.name}`, eventId:ev.id } : null;
  const extras = [];
  const beat = nextAction => ({ ...operation, scene:null, nextAction, secondary, extras });
  const subject = ev.name;
  /* a prepared draw that now names someone away is worth a look first */
  const away = drawnPlayers(state, ev).filter(player => isAway(state, player));
  const swapIn = () => { if (away.length) extras.push({ type:"swap-in", label:"Swap in", eventId:ev.id }); };
  if (action.type === "open-betting") {
    swapIn();
    return beat({ ...action, type:"announce", label:"Announce", subject, away });
  }
  /* A draw for the next event is announced in the same write, so every
     screen plays the intro before the teams. The beat carries the default
     crew (whoever has sat out least); the commissioner can change it. */
  if (action.type === "prepare-draw"
      || action.type === "prepare-stages" && (ev.stageCfg?.kind === "heats" || state.draws?.[ev.id])) {
    const suggestion = state.draws?.[ev.id] ? { players:null, roles:null } : suggestParticipants(state, ev);
    if (suggestion) {
      if (suggestion.roles?.length) extras.push({ type:"change-crew", label:"Change crew", eventId:ev.id });
      swapIn();
      /* teams of three or more pick their sides: the draft leads, a random
         draw is the alternative */
      if (draftsByDefault(ev) && !state.draws?.[ev.id]) {
        extras.push({ type:"random-draw", label:"Random draw", eventId:ev.id });
        return beat({ ...action, type:"captains-draft", label:"Captains draft", subject,
          players:suggestion.players, roles:suggestion.roles, away });
      }
      if (ev.kind === "team" && !state.draws?.[ev.id])
        extras.push({ type:"captains-draft", label:"Captains draft", eventId:ev.id });
      return beat({ ...action, type:"announce-draw", label:"Announce and draw", subject,
        players:suggestion.players, roles:suggestion.roles, away });
    }
  }
  if (action.type === "lock-betting")
    return beat({ ...action, type:"lock-start", label:"Lock and start",
      subject:contestName(state, ev, contest), contestId:contest?.id });
  if (action.type === "start-event")
    return beat({ ...action, type:"lock-start", label:"Start",
      subject:contestName(state, ev, contest), contestId:contest?.id });
  /* Where and When plays its rounds before its result */
  if (["enter-result", "post-result"].includes(action.type)
      || (action.type === "record-contest-winner" && contest?.kind === "ffa")) {
    const geo = geoBeat(state, ev);
    if (geo) return beat({ ...action, ...geo });
  }
  if (action.type === "record-contest-winner" && contest && contest.kind !== "ffa")
    return beat({ ...action, label:"Record winner", subject:contestName(state, ev, contest), contestId:contest.id });
  if (action.type === "prepare-draw")
    return beat({ ...action, label:"Set up teams", subject });
  if (action.type === "prepare-stages")
    return beat({ ...action, label:`Set up ${ev.stageCfg?.kind || "groups"}`, subject });
  return beat({ ...action, label:LIFECYCLE_LABELS[action.type] || action.label, subject });
}

function resolveDirector(state, events = [], { showControl = false, now = Date.now() } = {}) {
  const operation = resolveWeekendOperation(state, events);
  const control = state.showControl;
  const history = Array.isArray(control?.history) ? control.history : [];
  const base = lifecycleBeat(state, operation);
  const only = (scene, nextAction) => ({ ...operation, scene, secondary:null, extras:[], nextAction });

  if (showControl) {
    const scene = resolveShowScene(state, events);
    /* One beat owes the room a winner ceremony: it retires whatever is on
       the TV (a stale scene included) and starts the new one in one write.
       Skip settles the debt without playing it. */
    const replayBeat = (eventId, sceneId = null) => {
      const event = events.find(item => item.id === eventId);
      const revision = Number(state.results?.[eventId]?.revision || 1);
      return { ...operation, scene, extras:[], nextAction:directorBeat("replay-winner-scene",
        revision > 1 ? "Replay winner" : "Play winner scene",
        { eventId, revision, subject:event.name, ...(sceneId ? { sceneId } : {}) }),
      secondary:{ type:"skip-replay", label:"Skip", eventId, revision } };
    };
    if (scene) {
      if (scene.staleReason) {
        if (scene.active.kind === "winner" && scene.staleReason === "The result was corrected"
            && scene.event && !state.shelved?.[scene.event.id])
          return replayBeat(scene.event.id, scene.active.id);
        return only(scene, directorBeat("clear-scene", "End scene",
          { sceneId:scene.active.id, subject:scene.staleReason }));
      }
      if (scene.stepIndex < scene.stepCount - 1)
        return only(scene, directorBeat("advance-scene",
          ADVANCE_LABELS[scene.active.kind]?.[scene.stepKey] || "Continue",
          { sceneId:scene.active.id,
            subject:`On TV: ${scene.definition.label}, ${scene.stepIndex + 1} of ${scene.stepCount}` }));
      /* A scene on its last step never holds Continue: the next official
         composite retires it, so the chain cannot dead-end on ceremony. It
         also never hides a ceremony the room is still owed. */
    }

    const active = scene?.active || null;
    /* the room gets its title card before the first announcement */
    if (!active && !state.live && !Object.keys(state.results || {}).length
        && !history.some(entry => entry.kind === "opening")
        && ["announce", "announce-draw"].includes(base.nextAction?.type))
      return { ...base, secondary:null, then:base.nextAction,
        extras:[{ type:"skip-opening", label:"Skip opening" }],
        nextAction:directorBeat("start-opening-scene", "Opening", { subject:"Field Day title on the TV" }) };

    const latest = Object.entries(state.results || {})
      .map(([eventId, result]) => ({ eventId, result }))
      .filter(item => item.result?.slots?.[0]?.length)
      .sort((a, b) => Number(b.result.ts) - Number(a.result.ts))[0] || null;
    if (latest && now - Number(latest.result.ts) < REPLAY_WINDOW_MS) {
      const event = events.find(item => item.id === latest.eventId);
      const playedFor = entry => entry?.kind === "winner" && entry.eventId === latest.eventId
        && Number(entry.revision ?? 0) === Number(latest.result.revision || 1);
      const played = history.some(playedFor) || playedFor(active);
      if (event && !played && !state.shelved?.[latest.eventId])
        return { ...replayBeat(latest.eventId), scene:null };
    }

    if (state.frozen) {
      const champion = championIdentity(state);
      if (champion.length && !history.some(entry => championShownFor(entry, champion))
          && !championShownFor(active, champion))
        return only(null, directorBeat("start-champion-scene", "Show the champion",
          { subject:"Final standings on the TV" }));
    }
  }

  /* D6: a closed ballot owes the room its awards, one tap per award, when
     nothing is being played or bet on; the reveal waits for a free room */
  const awards = awardsBeat(state, events);
  if (awards) return { ...operation, scene:null, extras:[], nextAction:awards.nextAction, secondary:awards.secondary };
  /* An open team MVP vote closes by itself in a minute; its close rides
     beside any beat (the finale's deal closes it too) */
  const mvp = openMvpBeat(state, events);
  if (mvp) return { ...base, extras:[...(base.extras || []), { type:"close-mvp", label:mvp.label, eventId:mvp.eventId }] };
  return base;
}

function openMvpBeat(state, events) {
  const evId = Object.keys(state.mvp || {}).find(id => mvpOpen(state, id));
  if (!evId) return null;
  const record = state.mvp[evId];
  const voters = mvpVoters(state, record).length;
  const voted = record.votes ? Object.keys(record.votes).length : Number(record.voted || 0);
  const name = events.find(item => item.id === evId)?.name || "Team MVP";
  return directorBeat("close-mvp", "Close MVP vote", { eventId:evId, subject:`${voted} of ${voters} voted` });
}

function awardsBeat(state, events) {
  const ballot = revealBallotOrClosed(state);
  if (!ballot || ballot.reveal?.done || awardsRevealBlocker(state, events)) return null;
  const n = ballot.questions.length, shown = revealedCount(ballot);
  if (shown >= n) return { nextAction:directorBeat("end-awards", "End awards", { ballotId:ballot.id,
    subject:`${n} of ${n} awards shown` }), secondary:null };
  const next = ballot.questions[shown];
  return { nextAction:directorBeat("reveal-award", shown ? "Next award" : "Reveal awards", { ballotId:ballot.id,
    step:shown + 1, subject:`${next.title} (${shown + 1} of ${n})` }),
  secondary:{ type:"skip-awards", label:"Skip", ballotId:ballot.id } };
}
/* the ballot being revealed, else the newest closed one not yet shown */
function revealBallotOrClosed(state) {
  const revealing = revealBallot(state);
  if (revealing && !revealing.reveal.done) return revealing;
  return (Array.isArray(state.prompts?.ballots) ? state.prompts.ballots : [])
    .filter(ballot => ballot?.status === "closed" && !ballot.reveal)
    .sort((a, b) => (Number(b.closedAt) || 0) - (Number(a.closedAt) || 0))[0] || null;
}
const SKIPPABLE_PHASES = Object.freeze(["scheduled", "setup", "draw-pending", "draw-revealed", "betting-open"]);

export {
  SHOW_HISTORY_LIMIT,
  SHOW_TERMINAL_OUTCOMES,
  SHOW_SCENE_DEFINITIONS,
  emptyShowControl,
  showDefinition,
  validateShowSceneRequest,
  createShowScene,
  finishShowScene,
  sceneAtLastStep,
  retireFinishedShowScene,
  championIdentity,
  championShownFor,
  resolveShowScene,
  resolveDirector,
  contestName,
  postedFinalUndo,
};
