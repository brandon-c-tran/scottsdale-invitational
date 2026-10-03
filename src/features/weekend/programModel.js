import { SESSIONS, awardTable, eventInPlay, resolveEventLifecycle, resolveWeekendOperation, stacksPosted } from "../../../shared/core.js";
import { awardResults } from "../../../shared/prompts.js";

/* Weekend, "the program": what is on now and what is next, by the live
   order the director runs (resolveWeekendOperation), never by a clock.
   { mode:"before" | "live" | "crown" | "kept", lead:{ label, event, live } | null,
     then:{ label, event } | null }. The lead's label is read aloud only (its
   state is the lamp); the row under it always reads "Then". */
const NOW_PHASES = new Set(["betting-open", "betting-locked", "in-progress", "result-entry"]);

export function programCover(state = {}, events = []) {
  if (state.frozen) return { mode:"kept", lead:null, then:null };
  const open = events.filter(ev => !state.results?.[ev.id] && !state.shelved?.[ev.id]);
  const after = ev => open.filter(item => item.id !== ev?.id)[0] || null;
  if (!state.live) {
    const first = open[0] || null;
    return { mode:"before", lead:first ? { label:"First", event:first, live:false } : null,
      then:first && after(first) ? { label:"Then", event:after(first) } : null };
  }
  if (stacksPosted(state)) return { mode:"crown", lead:null, then:null };
  const event = resolveWeekendOperation(state, events).event;
  if (!event) return { mode:"crown", lead:null, then:null };
  const phase = resolveEventLifecycle(state, event).phase;
  const dealt = state.poker?.id === event.id;
  const announced = !!state.eventOps?.[event.id]?.announcedAt;
  const running = dealt || announced || NOW_PHASES.has(phase) || eventInPlay(state, event)
    || !!(state.drafts?.[event.id] && !state.draws?.[event.id]);
  const next = after(event);
  return running
    ? { mode:"live", lead:{ label:"Now", event, live:true }, then:next ? { label:"Then", event:next } : null }
    : { mode:"live", lead:{ label:"Next", event, live:false }, then:next ? { label:"Then", event:next } : null };
}

/* Payouts: one ladder per session (its events share it), and an event that
   pays its own way on a row of its own. The finale pays nothing: its counts
   are the standings. */
export function payoutRows(events = []) {
  const rows = [];
  for (const session of SESSIONS) {
    const list = events.filter(ev => ev.session === session.id && !ev.finale);
    if (!list.length) continue;
    const plain = list.filter(ev => !Array.isArray(ev.pays));
    const groups = new Map();
    for (const ev of plain) {
      const key = awardTable(ev).join(",");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(ev);
    }
    for (const [, group] of groups) rows.push({ id:`${session.id}:${group[0].id}`, session:session.label, events:group, pays:awardTable(group[0]) });
    for (const ev of list.filter(item => Array.isArray(item.pays)))
      rows.push({ id:`${session.id}:${ev.id}`, session:session.label, events:[ev], pays:awardTable(ev), own:true });
  }
  return rows.filter(row => row.pays.some(amount => amount > 0));
}

/* Awards (D6): every award on a published ballot, with its winners once the
   room has seen them. A phone holds the award the TV is turning until its
   stamp, so the one on screen now shows no winner yet. */
export function programAwards(state = {}) {
  const ballots = (state.prompts?.ballots || []).filter(ballot => ballot && ballot.status !== "draft");
  if (!ballots.length) return [];
  const seen = new Map(awardResults(state).filter(award => !award.onTvSince)
    .map(award => [`${award.ballotId}:${award.questionId}`, award]));
  return ballots.flatMap(ballot => (ballot.questions || []).map(question => {
    const award = seen.get(`${ballot.id}:${question.id}`);
    return { id:`${ballot.id}:${question.id}`, title:question.title, winners:award?.winners || [] };
  }));
}
