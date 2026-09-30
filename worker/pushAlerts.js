/* Which pocket alerts a write owes, from the board before and after it.
   Pure: no storage, no network, no clock beyond what it is given.

   Four moments, each only to the players it is about, never to the player
   whose tap caused it:
   - playing: your contest became the current one (the same rule as Home's
     "You're playing" stamp: a contest you are in, not a wide free-for-all).
   - pick: it became your turn in a captains draft.
   - duel: someone sent a challenge to you by name.
   - mvp: your team won and votes its MVP (shared/mvp.js).
   Each carries a dedupe key (player + reason + contest) so a correction
   that reopens the same contest, a retry, or a replay never alerts twice. */

import {
  allEventsOf, disp, draftTurn, isActivePlayer, isAway, resolveCurrentContest,
  resolveWeekendOperation, teamLabel, DUEL_GAMES,
} from "../shared/core.js";

export const ALERT_REASONS = Object.freeze(["playing", "pick", "duel", "mvp"]);
const LIVE_PHASES = new Set(["betting-open", "betting-locked", "in-progress"]);

/* the current contest, while it is open or being played */
export function liveContest(state) {
  if (!state?.live || state.frozen) return null;
  let event;
  try { event = resolveWeekendOperation(state).event; } catch { return null; }
  if (!event) return null;
  const contest = resolveCurrentContest(state, event);
  if (!contest || !LIVE_PHASES.has(contest.phase)) return null;
  if (contest.kind === "ffa" && contest.sides.length !== 2) return null;
  return { event, contest };
}

function sideName(state, contest, side) {
  const draw = state.draws?.[contest.eventId];
  const team = contest.drawId && draw?.id === contest.drawId ? draw.teams?.[side.key] : null;
  return teamLabel(state, { name:team?.name || null, players:side.players });
}

function playingAlert(state, { event, contest }, player) {
  const own = contest.sides.find(side => side.players.includes(player));
  const others = contest.sides.filter(side => side !== own);
  const where = contest.label && contest.label !== event.name ? `${event.name} · ${contest.label}` : event.name;
  const versus = others.length === 1 ? ` vs ${sideName(state, contest, others[0])}` : "";
  return {
    player, reason:"playing", key:`playing:${player}:${contest.id}`,
    message:{ title:"You’re playing", body:`${where}${versus}`, tag:`playing:${contest.id}`,
      topic:"playing", url:`/?alert=playing&ev=${encodeURIComponent(event.id)}` },
  };
}

function playingAlerts(prev, next) {
  const now = liveContest(next);
  if (!now) return [];
  const before = liveContest(prev);
  const was = new Set(before ? before.contest.players : []);
  const sameContest = before?.contest.id === now.contest.id;
  return now.contest.players
    .filter(player => isActivePlayer(player) && !isAway(next, player) && !(sameContest && was.has(player)))
    .map(player => playingAlert(next, now, player));
}

const runningDrafts = state => Object.entries(state?.drafts || {})
  .filter(([evId]) => !state.draws?.[evId] && !state.results?.[evId] && !state.shelved?.[evId])
  .map(([evId, draft]) => ({ evId, turn:draftTurn(draft) }))
  .filter(item => item.turn && !item.turn.complete && isActivePlayer(item.turn.captain));

function pickAlerts(prev, next) {
  const events = allEventsOf(next);
  const before = new Map(runningDrafts(prev).map(item => [item.evId, item.turn]));
  return runningDrafts(next).filter(({ evId, turn }) => {
    const was = before.get(evId);
    return !was || was.draftId !== turn.draftId || was.captain !== turn.captain || was.pickIndex !== turn.pickIndex;
  }).map(({ evId, turn }) => {
    const name = events.find(ev => ev.id === evId)?.name || "Draft";
    return {
      player:turn.captain, reason:"pick", key:`pick:${turn.captain}:${turn.draftId}:${turn.pickIndex}`,
      message:{ title:"Your pick", body:`${name} draft · Round ${turn.round}`, tag:`pick:${turn.draftId}`,
        topic:"pick", url:`/?alert=pick&ev=${encodeURIComponent(evId)}` },
    };
  });
}

function duelAlerts(prev, next) {
  const known = new Set((prev?.duels || []).map(duel => duel.id));
  return (next?.duels || []).filter(duel => duel && !known.has(duel.id) && !duel.open
    && duel.status === "open" && isActivePlayer(duel.to) && duel.to !== duel.from)
    .map(duel => ({
      player:duel.to, reason:"duel", key:`duel:${duel.to}:${duel.id}`,
      message:{ title:`${disp(next, duel.from)} challenged you`,
        body:`${DUEL_GAMES[duel.game]?.name || "Duel"} · ${Number(duel.stake || 0).toLocaleString("en-US")} chips`,
        tag:`duel:${duel.id}`, topic:"duel", url:"/?alert=duel" },
    }));
}

/* a team MVP vote that just opened reaches the teammates who vote */
function mvpAlerts(prev, next) {
  const events = allEventsOf(next);
  return Object.entries(next?.mvp || {}).flatMap(([evId, record]) => {
    if (!record?.id || record.closedAt || prev?.mvp?.[evId]?.id === record.id) return [];
    const name = events.find(ev => ev.id === evId)?.name || "Team MVP";
    return (record.team || []).filter(player => isActivePlayer(player) && !isAway(next, player)).map(player => ({
      player, reason:"mvp", key:`mvp:${player}:${record.id}`,
      message:{ title:"Vote team MVP", body:name, tag:`mvp:${record.id}`, topic:"mvp",
        url:`/?alert=mvp&ev=${encodeURIComponent(evId)}` },
    }));
  });
}

/* `actor` is the player claimed by the device that made the write (null for
   an unclaimed commissioner device); they already know. */
export function alertsFor(prev, next, { actor = null } = {}) {
  if (!next || prev === next) return [];
  const alerts = [...playingAlerts(prev || {}, next), ...pickAlerts(prev || {}, next), ...duelAlerts(prev || {}, next),
    ...mvpAlerts(prev || {}, next)];
  const seen = new Set();
  return alerts.filter(alert => {
    if (!alert.player || alert.player === actor || seen.has(alert.key)) return false;
    seen.add(alert.key);
    return true;
  });
}
