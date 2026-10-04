/* QA fast-forward targets. Pure, shared by the Worker (which runs the real
   reducers to reach a target in one write, worker/qa.js) and the commissioner
   QA sheet (which lists them). A target is a string key so a stale phone
   can only ever ask for a place on the weekend's arc, never for a shape:

     locker                      everyone checked in, not live
     event:<id>:open|mid|done    one event, played in slate order up to it
     session:<id>                every event through that session posted
     poker:set|live|counted      the finale table
     crowned                     champion crowned, board frozen
     step                        the current event's current contest, once
     finish                      the current event through its result

   Nothing here writes state. */
import {
  EMPTY_STATE, RESET_PROGRESS_PRESERVED_KEYS, SESSIONS,
  allEventsOf, contestStackOf, resolveEventLifecycle,
} from "./core.js";

const QA_CHECKPOINT_LIMIT = 10;
const QA_CHECKPOINT_NAME_MAX = 40;
const QA_EVENT_PHASES = Object.freeze(["open", "mid", "done"]);
const QA_POKER_PHASES = Object.freeze(["set", "live", "counted"]);
const QA_EVENT_PHASE_LABELS = Object.freeze({ open:"Open", mid:"Mid", done:"Done" });
const QA_POKER_PHASE_LABELS = Object.freeze({ set:"Table set", live:"Cards live", counted:"Counts posted" });

/* Exactly what a game-progress reset clears. A checkpoint stores these and a
   restore replaces only these: profiles, ratings, logistics, the onboarding
   epoch and the event configuration are never in a checkpoint. The wager
   retry ledger is cleared by a restore, as by a reset. */
const QA_PROGRESS_KEYS = Object.freeze(Object.keys(EMPTY_STATE).filter(key =>
  !RESET_PROGRESS_PRESERVED_KEYS.includes(key) && !["v", "updatedAt", "wagerOps"].includes(key)));

/* the events a fast-forward plays, in slate order */
const qaSlate = (state, events = allEventsOf(state)) =>
  events.filter(ev => !ev.finale && !state.shelved?.[ev.id]);

/* How far one event has gone: 0 untouched (a draw alone is preparation),
   1 announced with betting open on its first contest, 2 under way,
   3 result posted. */
function qaEventStage(state, ev) {
  if (!ev) return 0;
  if (state.results?.[ev.id]) return 3;
  const op = state.eventOps?.[ev.id] || {};
  const phase = resolveEventLifecycle(state, ev).phase;
  if (op.startedAt || op.resultEntryAt || op.bettingLockedAt || contestStackOf(state, ev.id).length
      || ["betting-locked", "in-progress", "result-entry"].includes(phase)) return 2;
  if (state.onDeck === ev.id || op.contest || op.bettingOpenedAt) return 1;
  return 0;
}

/* 0 no table, 1 dealt, 2 cards live, 3 counts posted, 4 crowned */
function qaPokerStage(state) {
  if (state.frozen) return 4;
  const pk = state.poker;
  if (!pk) return 0;
  if (state.results?.[pk.id]) return 3;
  return pk.startedAt ? 2 : 1;
}

/* A target key, normalized against this state's slate, or null. */
function parseQaTarget(state, key, events = allEventsOf(state)) {
  if (typeof key !== "string" || key.length > 80) return null;
  if (key === "locker" || key === "crowned" || key === "step" || key === "finish") return { kind:key, key };
  const [kind, id, phase, extra] = key.split(":");
  if (extra !== undefined) return null;
  const slate = qaSlate(state, events);
  if (kind === "event") {
    const index = slate.findIndex(ev => ev.id === id);
    if (index < 0 || !QA_EVENT_PHASES.includes(phase)) return null;
    return { kind:"event", key, evId:id, phase, index };
  }
  if (kind === "session" && phase === undefined) {
    const index = slate.map(ev => ev.session).lastIndexOf(id);
    if (index < 0) return null;
    return { kind:"event", key, evId:slate[index].id, phase:"done", index, session:id };
  }
  if (kind === "poker" && phase === undefined && QA_POKER_PHASES.includes(id)) {
    if (!events.some(ev => ev.finale && !state.shelved?.[ev.id])) return null;
    return { kind:"poker", key, phase:id };
  }
  return null;
}

/* Everything the sheet can jump to, grouped by session. Each entry carries
   where the board already is, so a row can mark reached and rewinding
   targets. */
function qaTargets(state, events = allEventsOf(state)) {
  const slate = qaSlate(state, events);
  const poker = qaPokerStage(state);
  const stages = slate.map(ev => qaEventStage(state, ev));
  const live = !!state.live;
  const touched = poker > 0 || stages.some(stage => stage > 0);
  const laterTouched = index => poker > 0 || stages.slice(index + 1).some(stage => stage > 0);
  const sessions = SESSIONS.filter(session => slate.some(ev => ev.session === session.id))
    .map(session => ({ id:session.id, label:session.label, key:`session:${session.id}`, events:[] }));
  const loose = { id:null, label:"Added events", key:null, events:[] };
  slate.forEach((ev, index) => {
    const stage = stages[index];
    const phases = QA_EVENT_PHASES.map((phase, phaseIndex) => {
      const want = phaseIndex + 1;
      const rewinds = laterTouched(index) || (phase === "open" ? stage >= 2 : phase === "mid" ? stage >= 3 : false);
      /* reached: the board is at or past this point; current: exactly here */
      return { key:`event:${ev.id}:${phase}`, phase, label:QA_EVENT_PHASE_LABELS[phase],
        reached:stage >= want || laterTouched(index), current:stage === want && !laterTouched(index), rewinds };
    });
    const row = { id:ev.id, name:ev.name, stage, phases };
    (sessions.find(session => session.id === ev.session) || loose).events.push(row);
  });
  const sessionRows = sessions.map(session => {
    const last = slate.map(ev => ev.session).lastIndexOf(session.id);
    return { ...session, reached:stages[last] >= 3 || laterTouched(last), rewinds:laterTouched(last) };
  });
  const finale = events.some(ev => ev.finale && !state.shelved?.[ev.id]);
  return {
    locker:{ key:"locker", label:"Locker room", reached:true, current:!live && !touched, rewinds:live || touched },
    sessions:[...sessionRows, ...(loose.events.length ? [loose] : [])],
    poker:finale ? QA_POKER_PHASES.map((phase, index) => ({ key:`poker:${phase}`, phase,
      label:QA_POKER_PHASE_LABELS[phase], reached:poker >= index + 1, current:poker === index + 1,
      rewinds:poker > index + 1 })) : [],
    crowned:{ key:"crowned", label:"Crowned", reached:poker === 4, current:poker === 4, rewinds:false },
  };
}

/* Where a board is, in a few words, for a checkpoint row. */
function qaCheckpointSummary(state, events = allEventsOf(state)) {
  const results = Object.keys(state.results || {}).length;
  const bets = (state.wagers || []).filter(wager => wager.status !== "void").length;
  const poker = qaPokerStage(state);
  let label;
  if (poker === 4) label = "Crowned";
  else if (poker > 0) label = `Poker · ${[null, "Table set", "Cards live", "Counts posted"][poker]}`;
  else {
    const slate = qaSlate(state, events);
    const touched = slate.filter(ev => qaEventStage(state, ev) > 0);
    const current = touched.find(ev => qaEventStage(state, ev) < 3) || touched.at(-1);
    label = !current ? (state.live ? "Weekend live" : "Locker room")
      : `${current.name} · ${["", "Open", "Mid", "Done"][qaEventStage(state, current)]}`;
  }
  return { label, results, bets, live:!!state.live };
}

const cleanCheckpointName =value => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, QA_CHECKPOINT_NAME_MAX);

/* The game-progress part of a state, as a checkpoint stores it. */
function qaProgressOf(state) {
  return Object.fromEntries(QA_PROGRESS_KEYS.map(key => [key, structuredClone(state?.[key] ?? EMPTY_STATE[key])]));
}

export {
  QA_CHECKPOINT_LIMIT, QA_CHECKPOINT_NAME_MAX, QA_EVENT_PHASES, QA_POKER_PHASES, QA_PROGRESS_KEYS,
  QA_EVENT_PHASE_LABELS, QA_POKER_PHASE_LABELS,
  qaSlate, qaEventStage, qaPokerStage, parseQaTarget, qaTargets, qaProgressOf, cleanCheckpointName,
  qaCheckpointSummary,
};
