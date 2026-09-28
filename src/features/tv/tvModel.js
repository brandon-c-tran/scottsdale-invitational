/* The TV's presentation model. Pure functions over authoritative state and a
   server-anchored clock, so two TVs, a refreshed TV, and the tests all land
   on the same screen. Nothing here writes state. */

import {
  AWARDS, ROSTER, EDITION, ROUND_NAMES, SESSIONS, bracketOrder, bracketChampion, resultAwards,
  computeStandings, resolveWager, resolveDuel, resolveCurrentContest, resolveSlot, eventInPlay, contestMult,
  wagerMatchesContest,
  disp, teamLabel, stageEntrantView, snakeTeam, overflowRoleMeta, pokerLive, pokerClock,
} from "../../../shared/core.js";
import { constellationStars, constellationLines } from "./desertModel.js";

export const TV_WIDTH = 1920;
export const TV_HEIGHT = 1080;
/* the event intro plays as an overlay, then the live board takes over */
export const TV_INTRO_OVERLAY_MS = 3000;
/* the unscripted (no Show Control) intro and draw on the TV close on their own */
export const TV_INTRO_AUTO_MS = 7000;
export const TV_INTRO_AUTO_REDUCED_MS = 2200;
export const TV_REVEAL_HOLD_MS = 7000;
/* a scene on its last step hands the TV back to ambient without a write */
export const TV_SCENE_IDLE_MS = 45000;
/* a fresh result owns the TV this long when no directed scene covers it */
export const TV_RESULT_MOMENT_MS = 20000;
/* the decided matchup stamps in before the next one takes the board */
export const TV_ADVANCE_MS = 5000;
export const TV_AMBIENT_MS = 12000;
export const TV_LEAD_CHANGE_MS = 8000;
export const TV_CORRECTION_MS = 8000;
/* reduced motion pages the ticker instead of scrolling it */
export const TV_TICKER_PAGE_MS = 6000;
export const TV_TICKER_PER_PAGE = 2;
/* result moment beats, from the moment's anchor */
export const RESULT_PODIUM_STEP_MS = 1500;
export const RESULT_STANDINGS_AT_MS = 8000;
export const RESULT_SORT_DELAY_MS = 1500;

export const fmt = n => (Number(n) || 0).toLocaleString("en-US");
export const signed = n => `${n > 0 ? "+" : n < 0 ? "-" : ""}${fmt(Math.abs(n))}`;
export const mmss = ms => {
  const t = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};
export const editionLabel = () => EDITION.label || `${EDITION.name} · ${EDITION.year}`;
/* what an event pays, as numbers: "1,200 · 800 · 400 chips" */
export const payoutLine = ev => {
  const table = (AWARDS[ev?.value] || []).filter(Boolean);
  return table.length ? `${table.map(fmt).join(" · ")} chips` : "The finale";
};
/* the betting payout, Brandon's wording: two sides pay 1:1, a wide field 2:1 */
export const oddsLine = contest => contest ? `Winner pays ${contestMult(contest) === 2 ? "2:1" : "1:1"}` : null;
export const placeName = place => ["1st", "2nd", "3rd"][place - 1] || `${place}th`;
export const sessionLabel = ev => SESSIONS.find(s => s.id === ev?.session)?.label || null;

/* A flat band per session. Bands carry no text, so the session hue is kept
   exactly; any text on the TV sits on the night surfaces instead. */
export const TV_PHASE_BAND = { fri:"var(--pool)", sam:"var(--sun)", sap:"var(--accent)", san:"var(--clay)", fin:"var(--sun)" };
export const phaseBand = ev => TV_PHASE_BAND[ev?.session] || "var(--sun)";

/* letterboxed fit of the fixed canvas into any screen */
export function tvCanvasFit(width, height) {
  const w = Math.max(1, Number(width) || TV_WIDTH), h = Math.max(1, Number(height) || TV_HEIGHT);
  const scale = Math.min(w / TV_WIDTH, h / TV_HEIGHT);
  return { scale, left:Math.round((w - TV_WIDTH * scale) / 2), top:Math.round((h - TV_HEIGHT * scale) / 2) };
}

/* Readable ink on a player's identity color, chosen the way the player card
   chooses it: the stronger contrast of the two inks against the actual
   color. Relative luminance of --ink0 and --bone from the :root tokens. */
const INK0_LUMINANCE = 0.0107, BONE_LUMINANCE = 0.848;
export const luminanceOf = hex => {
  const clean = String(hex || "").replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(clean)) return 0.2;
  const [r, g, b] = clean.match(/.{2}/g).map(value => parseInt(value, 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
};
export const contrastRatio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
export function readableInk(hex) {
  const l = luminanceOf(hex);
  return contrastRatio(l, INK0_LUMINANCE) >= contrastRatio(l, BONE_LUMINANCE) ? "var(--ink0)" : "var(--bone)";
}

/* ── directed scenes on the TV ──
   covers:     the scene owns the main area (legacy ceremonies wait)
   ticker:     the ticker stays under it (every scene but the champion)
   until:      server time the view next changes on its own */
export function tvSceneView(scene, now) {
  if (!scene?.active) return null;
  if (!scene.definition || scene.staleReason)
    return { mode:"stale", covers:false, ticker:true, until:null, reason:scene.staleReason || "Unsupported scene" };
  const kind = scene.active.kind;
  const startedAt = Number(scene.active.startedAt) || 0;
  const updatedAt = Number(scene.active.updatedAt) || startedAt;
  if (kind === "event-intro") {
    const until = startedAt + TV_INTRO_OVERLAY_MS;
    return now < until
      ? { mode:"intro-overlay", covers:true, ticker:true, until, eventId:scene.active.eventId }
      : { mode:"live", covers:false, ticker:true, until:null, eventId:scene.active.eventId };
  }
  if (kind === "champion") return { mode:"scene", covers:true, ticker:false, until:null };
  const last = scene.stepIndex >= scene.stepCount - 1;
  if (last) {
    const until = updatedAt + TV_SCENE_IDLE_MS;
    if (now >= until) return { mode:"ambient", covers:false, ticker:true, until:null };
    return { mode:"scene", covers:true, ticker:true, until };
  }
  return { mode:"scene", covers:true, ticker:true, until:null };
}

/* two TVs on the same server clock show the same ambient card */
export const ambientIndex = (count, now, period = TV_AMBIENT_MS) =>
  count > 1 ? Math.floor(Math.max(0, Number(now) || 0) / period) % count : 0;

/* ── what is live, and what is next ──
   A shelved or posted event is never live, and a draw prepared for a later
   event is not play: live is the open market, or an event actually in play. */
const openEvent = (state, ev) => !!ev && !state.results?.[ev.id] && !state.shelved?.[ev.id];
export function tvLiveEvent(state, events, operationEv = null) {
  const playable = ev => openEvent(state, ev) && !ev.finale;
  if (!state.frozen) {
    const onDeck = events.find(ev => ev.id === state.onDeck);
    if (playable(onDeck)) return onDeck;
  }
  if (playable(operationEv) && eventInPlay(state, operationEv)) return operationEv;
  return events.find(ev => playable(ev) && eventInPlay(state, ev)) || null;
}
/* The next event is the first one that has not started: the operation
   event itself when it is only being prepared. Only live or posted events
   are skipped. */
export function nextUpEvent(state, events, { liveEv = null, operationEv = null } = {}) {
  const waiting = ev => openEvent(state, ev) && ev.id !== liveEv?.id && ev.id !== state.onDeck
    && !eventInPlay(state, ev) && !(state.poker && state.poker.id === ev.id);
  if (waiting(operationEv)) return operationEv;
  return events.find(waiting) || null;
}

/* the next fully-seated, undecided matchup in bracket order: what plays now */
export function nextOpenMatch(br) {
  if (!br) return null;
  const names = ROUND_NAMES[br.size] || [];
  /* same order as the current contest, including a match chosen to go first */
  for (const [r, m] of bracketOrder(br)) {
    const match = br.rounds[r][m];
    if (match.winner !== null && match.winner !== undefined) continue;
    const a = resolveSlot(br, match.a), b = resolveSlot(br, match.b);
    if (a !== null && b !== null) return { r, m, a, b, roundName:names[r] || "Match" };
  }
  return null;
}

/* the latest result by when it was first posted; a correction does not make
   an old event the latest one again */
const postedAt = res => Number(res?.confirmedAt || res?.ts) || 0;
export function latestResultOf(state, events) {
  let latest = null;
  Object.entries(state.results || {}).forEach(([eventId, res]) => {
    const ev = events.find(item => item.id === eventId);
    if (ev && res?.slots?.[0]?.length && (!latest || postedAt(res) > postedAt(latest.res)))
      latest = { ev, res };
  });
  return latest;
}

const leadersOf = rows => {
  if (!rows.length || rows[0].pts === rows[rows.length - 1].pts) return null;
  const top = rows.filter(row => row.rank === 1);
  return { players:top.map(row => row.player), pts:top[0].pts };
};

/* A place split between drawn teams stays split: two losing semifinal pairs
   are two entries, never one invented team of four. */
export function podiumGroups(state, evId, players = []) {
  const left = [...players], groups = [];
  for (const team of state.draws?.[evId]?.teams || []) {
    if (team.players.length && team.players.every(p => left.includes(p))) {
      groups.push({ players:[...team.players], name:teamLabel(state, team) });
      team.players.forEach(p => left.splice(left.indexOf(p), 1));
    }
  }
  left.forEach(p => groups.push({ players:[p], name:disp(state, p) }));
  return groups;
}
const podiumEntry = (groups, extra) => ({
  ...extra,
  players:groups.flatMap(group => group.players),
  groups,
  names:groups.length <= 3 ? groups.map(group => group.name) : [`${groups.length} tied`],
  tied:groups.length > 1,
});

/* ── one result presentation, awards and poker stacks alike ──
   Event awards: before is the board without this event's result and without
   its settled bets, so every row's change splits exactly into award + bets.
   Poker: before is the dealt board (starting chips), after is the official
   final stack; the champion is the standings leader phones also crown. */
export function resultPresentation(state, events, eventId) {
  const ev = events.find(item => item.id === eventId);
  const res = state.results?.[eventId];
  if (!ev || !res?.slots?.[0]?.length) return null;
  const stacks = !!res.stacks;
  const eventWagers = (state.wagers || []).filter(w => w.eventId === eventId);
  const beforeState = { ...state, results:{ ...state.results } };
  delete beforeState.results[eventId];
  if (!stacks) beforeState.wagers = (state.wagers || []).filter(w => w.eventId !== eventId);
  const before = computeStandings(beforeState);
  const after = computeStandings(state);
  const beforeBy = Object.fromEntries(before.map(row => [row.player, row]));
  /* the same award split the board uses: a split 3rd and crew pay included */
  const awardOf = {};
  if (!stacks) resultAwards(state, ev, res).forEach(({ player, pts }) => { awardOf[player] = (awardOf[player] || 0) + pts; });
  const betsOf = {};
  if (!stacks) eventWagers.forEach(w => {
    const r = resolveWager(state, w, events);
    if (r.status === "won" || r.status === "lost") betsOf[w.player] = (betsOf[w.player] || 0) + r.delta;
  });
  const outs = new Set(res.outs || []);
  /* away players never sat at the table: their board chips carry, unplayed */
  const seats = stacks && state.poker?.id === eventId && Array.isArray(state.poker.seats) ? state.poker.seats : null;
  const rows = after.map(row => {
    const prior = beforeBy[row.player];
    const away = !!seats && !seats.includes(row.player);
    return {
      player:row.player,
      rankBefore:prior?.rank ?? row.rank,
      rankAfter:row.rank,
      move:(prior?.rank ?? row.rank) - row.rank,
      before:prior?.pts ?? row.pts,
      after:row.pts,
      change:row.pts - (prior?.pts ?? row.pts),
      award:stacks ? 0 : awardOf[row.player] || 0,
      bets:stacks ? 0 : betsOf[row.player] || 0,
      busted:stacks && !away && outs.has(row.player),
      away,
    };
  });
  let podium;
  if (stacks) {
    const seated = after.filter(row => !seats || seats.includes(row.player));
    const ranks = [...new Set(seated.map(row => row.rank))].slice(0, 3);
    podium = ranks.map((rank, index) => {
      const players = seated.filter(row => row.rank === rank).map(row => row.player);
      return podiumEntry(players.map(p => ({ players:[p], name:disp(state, p) })),
        { place:index + 1, amount:seated.find(row => row.rank === rank).pts, unit:"stack" });
    });
  } else {
    podium = (res.slots || []).slice(0, 3).map((players, index) => (players || []).length
      ? podiumEntry(podiumGroups(state, eventId, players), { place:index + 1, amount:awardOf[players[0]] || 0, unit:"award" })
      : null).filter(Boolean);
  }
  const leaderBefore = leadersOf(before), leaderAfter = leadersOf(after);
  const key = lead => (lead ? [...lead.players].sort().join("+") : "");
  return {
    eventId, eventName:ev.name, game:ev.game, session:ev.session, kind:stacks ? "stacks" : "awards",
    ts:Number(res.ts) || 0, revision:Number(res.revision || 1),
    podium,
    /* the reveal climbs: third, second, then the winner */
    revealOrder:[...podium].sort((a, b) => b.place - a.place),
    beforeOrder:[...before].map(row => row.player),
    rows,
    leader:leaderAfter,
    previousLeader:leaderBefore,
    leadChanged:!!leaderAfter && key(leaderAfter) !== key(leaderBefore),
  };
}

/* where a result sequence is, from its anchor. Reduced motion keeps every
   fact (all three places, the final order, arrows, splits) and drops travel. */
export function resultMomentPhase(anchor, now, { reducedMotion = false, step = null } = {}) {
  const age = Math.max(0, now - anchor);
  if (step === "standings")
    return { phase:"standings", revealed:3, sorted:reducedMotion || age >= RESULT_SORT_DELAY_MS };
  if (step === "winner" || age < RESULT_STANDINGS_AT_MS)
    return { phase:"podium", revealed:reducedMotion ? 3 : Math.min(3, 1 + Math.floor(age / RESULT_PODIUM_STEP_MS)), sorted:false };
  return { phase:"standings", revealed:3,
    sorted:reducedMotion || age >= RESULT_STANDINGS_AT_MS + RESULT_SORT_DELAY_MS };
}

/* the latest official write that moved the weekend on: a market, a start,
   result entry, a decided contest, a draw, a draft, the poker table */
export function lastLifecycleWrite(state) {
  let at = 0;
  const take = value => { const n = Number(value) || 0; if (n > at) at = n; };
  Object.values(state.eventOps || {}).forEach(op => {
    if (!op) return;
    [op.bettingOpenedAt, op.bettingLockedAt, op.startedAt, op.resultEntryAt, op.drawRevealedAt,
      op.lastContest?.decidedAt].forEach(take);
  });
  [...Object.values(state.draws || {}), ...Object.values(state.stages || {}), ...Object.values(state.drafts || {})]
    .forEach(item => take(item?.ts));
  take(state.poker?.ts); take(state.poker?.startedAt);
  return at;
}

/* The production result moment: fresh, not frozen, and not a result the
   room has already watched or moved past. A directed winner scene for this
   result (active or in history) already told it, and any newer lifecycle
   write means the next event owns the TV. */
export function resultMomentFor(state, events, now, sceneView, scene) {
  if (state.frozen) return null;
  const latest = latestResultOf(state, events);
  if (!latest) return null;
  const anchor = postedAt(latest.res);
  if (!(now - anchor < TV_RESULT_MOMENT_MS && now - anchor >= -5000)) return null;
  if (sceneView?.covers && scene?.active?.kind === "winner" && scene.active.eventId === latest.ev.id) return null;
  const control = state.showControl || {};
  const revision = Number(latest.res.revision || 1);
  const sameResult = entry => entry?.kind === "winner" && entry.eventId === latest.ev.id
    && (entry.revision === null || entry.revision === undefined || Number(entry.revision) === revision);
  if (sameResult(control.active)) return null;
  if ((control.history || []).some(sameResult)) return null;
  if (control.active && Number(control.active.startedAt) > anchor) return null;
  if (lastLifecycleWrite(state) > anchor) return null;
  return { eventId:latest.ev.id, anchor };
}

/* a result revision bump gets one line before anything else moves */
export function correctionMoment(state, events, now) {
  let best = null;
  Object.entries(state.results || {}).forEach(([eventId, res]) => {
    const at = Number(res?.correctedAt) || 0;
    if (at && res.slots?.[0]?.length && (!best || at > best.at)) best = { eventId, res, at };
  });
  if (!best || now - best.at >= TV_CORRECTION_MS || now - best.at < -5000) return null;
  const ev = events.find(item => item.id === best.eventId);
  if (!ev) return null;
  const groups = podiumGroups(state, ev.id, best.res.slots[0]);
  const who = groups.map(group => group.name).join(", ");
  return { eventId:ev.id, at:best.at, until:best.at + TV_CORRECTION_MS, revision:Number(best.res.revision || 1),
    players:groups.flatMap(group => group.players), text:`${ev.name}: ${who} 1st` };
}

/* The masthead dock shows one card at a time: a correction first, then a
   lead change, which also waits out an advance moment it arrived with. */
export function dockCard({ now, lead = null, correction = null, holdUntil = 0 }) {
  if (correction && now < correction.until) return { kind:"correction", correction, until:correction.until };
  if (!lead) return null;
  let start = Math.max(Number(lead.at) || 0, Number(holdUntil) || 0);
  if (correction && Math.abs(correction.at - lead.at) < 5000) start = Math.max(start, correction.until);
  const until = start + TV_LEAD_CHANGE_MS;
  return now >= start && now < until ? { kind:"lead", lead, until } : null;
}
/* the advance moment a lead change arrived with, if any, as its end time */
export function advanceHoldUntil(state, ev, at) {
  const last = ev && state.eventOps?.[ev.id]?.lastContest;
  if (!last?.decidedAt || Math.abs(Number(at) - last.decidedAt) > TV_ADVANCE_MS + 5000) return 0;
  return last.decidedAt + TV_ADVANCE_MS;
}

/* the decided contest stamps in for a few seconds between matches, with the
   side it beat and what comes next */
export function advanceMoment(state, ev, now) {
  const last = ev && state.eventOps?.[ev.id]?.lastContest;
  if (!last?.decidedAt || now - last.decidedAt >= TV_ADVANCE_MS || now - last.decidedAt < -5000) return null;
  let players = [], name = "", beat = null, next = null;
  const br = state.brackets?.[ev.id];
  const draw = state.draws?.[ev.id];
  if (last.kind === "match") {
    const team = draw?.teams?.[last.winner];
    if (!team) return null;
    players = team.players; name = teamLabel(state, team);
    const match = br?.rounds?.[last.match?.[0]]?.[last.match?.[1]];
    if (match) {
      const other = [resolveSlot(br, match.a), resolveSlot(br, match.b)].find(key => key !== null && key !== last.winner);
      if (other !== undefined && draw.teams[other]) beat = teamLabel(state, draw.teams[other]);
    }
    const names = ROUND_NAMES[br?.size] || [];
    if (br && last.match?.[0] < br.rounds.length - 1) next = names[last.match[0] + 1] || null;
  } else {
    const st = state.stages?.[ev.id];
    if (!st) return null;
    const view = stageEntrantView(state, st, last.winner);
    players = view.players; name = view.name;
    if (last.kind === "heat") {
      const pending = st.groups.find((group, index) => index !== last.group && (group.through || []).length < st.advance);
      next = pending ? pending.name : "Final";
    }
  }
  const finalMatch = last.kind === "match" && br && last.match?.[0] === br.rounds.length - 1;
  const round = last.kind === "match" ? (ROUND_NAMES[br?.size] || [])[last.match?.[0]] || "Match"
    : last.kind === "heat" ? state.stages?.[ev.id]?.groups?.[last.group]?.name || "Heat" : "Final";
  const plural = players.length > 1;
  const won = finalMatch || last.kind === "stage-final";
  const detail = [beat ? `beat ${beat}` : null, !won && next ? `${next} next` : null].filter(Boolean).join(" · ");
  return { players, name, round, verb:won ? (plural ? "Win" : "Wins") : (plural ? "Advance" : "Advances"),
    detail, beat, next, decidedAt:last.decidedAt, id:last.id };
}

/* a finished bracket or stage waiting on its official result: who won it */
export function decidedWinner(state, ev) {
  if (!ev || state.results?.[ev.id]) return null;
  const br = state.brackets?.[ev.id], draw = state.draws?.[ev.id];
  if (br && draw) {
    const key = bracketChampion(br);
    const team = key === null || key === undefined ? null : draw.teams[key];
    return team ? { players:[...team.players], name:teamLabel(state, team) } : null;
  }
  const st = state.stages?.[ev.id];
  if (st && st.finalWinner !== null && st.finalWinner !== undefined) {
    const view = stageEntrantView(state, st, st.finalWinner);
    return { players:[...view.players], name:view.name };
  }
  return null;
}

/* every round with the current match marked, names included */
export function bracketStrip(state, ev, hot) {
  const br = state.brackets?.[ev?.id], draw = state.draws?.[ev?.id];
  if (!br || !draw) return null;
  const names = ROUND_NAMES[br.size] || [];
  return br.rounds.map((round, r) => ({
    name:names[r] || `Round ${r + 1}`,
    matches:round.map((match, m) => {
      const decided = match.winner !== null && match.winner !== undefined;
      return {
        key:`${r}-${m}`,
        hot:!!hot && hot[0] === r && hot[1] === m,
        sides:[resolveSlot(br, match.a), resolveSlot(br, match.b)].map(idx => {
          const team = idx !== null ? draw.teams[idx] : null;
          return { idx, players:team?.players || [], name:team ? teamLabel(state, team) : "TBD",
            won:decided && match.winner === idx, lost:decided && idx !== null && match.winner !== idx };
        }),
      };
    }),
  }));
}

/* one contest side as the room reads it: the team's own name (or Team X)
   past two players, the pair's names up to two */
export function contestSideView(state, ev, contest, side) {
  const draw = state.draws?.[ev?.id];
  if ((contest.kind === "match" || contest.kind === "ffa") && draw?.teams?.[side.key])
    return { players:side.players, name:teamLabel(state, draw.teams[side.key]) };
  if (contest.kind === "heat" || contest.kind === "stage-final") {
    const st = state.stages?.[ev?.id];
    if (st) return { players:side.players, name:stageEntrantView(state, st, side.key).name };
  }
  return { players:side.players, name:teamLabel(state, { players:side.players }) };
}
/* who rides each side, merged per bettor, largest first */
export function contestRiders(state, events, contest) {
  const open = (state.wagers || []).filter(w => wagerMatchesContest(w, contest)
    && resolveWager(state, w, events).status === "pending");
  const keyOf = w => contest.kind === "match" ? w.teamIdx : contest.kind === "ffa"
    ? (w.pickTeam ? contest.sides.find(side => side.players.length === w.pickPlayers?.length
      && side.players.every(p => w.pickPlayers.includes(p)))?.key : w.pick) : w.pickKey;
  const bySide = new Map(contest.sides.map(side => [side.key, new Map()]));
  open.forEach(w => {
    const riders = bySide.get(keyOf(w));
    if (riders) riders.set(w.player, (riders.get(w.player) || 0) + Number(w.stake || 0));
  });
  return new Map([...bySide].map(([key, riders]) => {
    const list = [...riders].map(([player, stake]) => ({ player, stake }))
      .sort((a, b) => b.stake - a.stake || a.player.localeCompare(b.player));
    return [key, { riders:list, total:list.reduce((sum, item) => sum + item.stake, 0) }];
  }));
}
export const ridersText = (state, riders, max = 6) => {
  const shown = riders.slice(0, max).map(item => `${disp(state, item.player)} ${fmt(item.stake)}`);
  if (riders.length > max) shown.push(`${riders.length - max} more`);
  return shown.join(" · ");
};

/* ── the poker table on the TV ──
   Seated players are dealt starting chips and marked out as they bust;
   anyone away never sat down and is listed apart, never as dealt. */
export const pokerSeats = pk => Array.isArray(pk?.seats) ? pk.seats : ROSTER;
export function pokerTableRows(state, standings) {
  const pk = state.poker;
  if (!pk) return [];
  const seats = pokerSeats(pk);
  const outOrder = (pk.outs || []).map(o => o.player);
  const starting = pk.startingStacks || {};
  return standings.map(row => {
    const away = !seats.includes(row.player);
    return {
      player:row.player,
      away,
      starting:away ? null : starting[row.player] ?? row.pts,
      busted:!away && outOrder.includes(row.player),
      finish:outOrder.includes(row.player) ? seats.length - outOrder.indexOf(row.player) : null,
    };
  }).sort((a, b) => Number(a.away) - Number(b.away) || Number(a.busted) - Number(b.busted)
    || (b.starting || 0) - (a.starting || 0) || a.player.localeCompare(b.player));
}

export function tvConnection({ ready, connected, status } = {}) {
  if (!ready) return { mode:"loading", label:"Connecting" };
  if (status === "stale" || status === "reconnecting" || status === "offline" || !connected)
    return { mode:"reconnecting", label:"Reconnecting" };
  return { mode:"live", label:null };
}

/* the most recent settled Quick Draw, by when the second run landed */
const duelSettledAt = d => Math.max(...Object.values(d.runs || {}).map(run => Number(run?.ts) || 0), Number(d.ts) || 0);
export function latestSettledDuel(duels = []) {
  let best = null;
  for (const d of duels) {
    const r = resolveDuel(d);
    if (!r.settled) continue;
    const at = duelSettledAt(d);
    if (!best || at > best.at) best = { d, r, at };
  }
  return best;
}

/* rulings the room should hear about: not a removed one, and not the
   finale's automatic minimum-stack top-ups */
export function tickerRuling(state) {
  const grants = new Set(state.poker?.minimumGrantIds || []);
  return (state.adjustments || []).find(item => !item.removedAt && item.reason !== "Minimum stack"
    && !grants.has(item.id)) || null;
}

/* Ticker tags are filled with a light token and set in --ink0, so every tag
   clears 4.5:1 (clay is too dark for either ink; rulings use live2). */
export function tickerItems({ state, events, standings, allTied, draftLive, liveCrew, latest,
  upNext, upNextDraw, onDeckEv, openWon, nextEv, now }) {
  const items = [];
  if (draftLive && draftLive.d.pool.length) {
    const cur = draftLive.d.teams[snakeTeam(draftLive.d.picks.length, draftLive.d.teams.length)]?.captain;
    if (cur) items.push({ tag:"Draft", tone:"var(--accent)", players:[cur],
      text:`${disp(state, cur)} is on the clock` });
  }
  if (liveCrew?.length) items.push({ tag:"Event crew", tone:"var(--accent2)",
    players:liveCrew.map(item => item.player).slice(0, 4),
    text:liveCrew.map(item => `${disp(state, item.player)}, ${overflowRoleMeta(item.role).label}`).join(" · ") });
  if (latest) {
    const groups = podiumGroups(state, latest.ev.id, latest.res.slots[0]);
    items.push({ tag:"Final", tone:"var(--olive)", players:latest.res.slots[0].slice(0, 4),
      text:`${latest.ev.name}: ${groups.length > 3 ? `${groups.length} tied` : groups.map(group => group.name).join(", ")}` });
  }
  if (upNext && upNextDraw) items.push({ tag:"Up now", tone:"var(--sun)",
    players:[...upNextDraw.teams[upNext.a].players, ...upNextDraw.teams[upNext.b].players].slice(0, 4),
    text:`${teamLabel(state, upNextDraw.teams[upNext.a])} vs ${teamLabel(state, upNextDraw.teams[upNext.b])}, ${upNext.roundName}` });
  if (onDeckEv && !state.shelved?.[onDeckEv.id]) {
    const riding = (state.wagers || []).filter(w => w.eventId === onDeckEv.id
      && resolveWager(state, w, events).status === "pending");
    const chipsIn = riding.reduce((n, w) => n + w.stake, 0);
    if (chipsIn > 0) items.push({ tag:"Betting", tone:"var(--accent2)",
      players:[...new Set(riding.map(w => w.player))].slice(0, 4),
      text:`${fmt(chipsIn)} chips on ${onDeckEv.name}` });
  }
  (openWon || []).slice(0, 2).forEach(x => items.push({ tag:"Won", tone:"var(--green)", players:[x.w.player],
    text:`${disp(state, x.w.player)} ${signed(x.r.delta)}` }));
  if (pokerLive(state)) {
    const clk = pokerClock(state.poker, now);
    items.push({ tag:"Poker", tone:"var(--accent)",
      text:`Blinds ${fmt(clk.sb)} / ${fmt(clk.bb)}, ${pokerSeats(state.poker).length - state.poker.outs.length} still in` });
  }
  const duel = latestSettledDuel(state.duels);
  if (duel) {
    if (duel.r.push) items.push({ tag:"Duel", tone:"var(--accent)", players:[duel.d.from, duel.d.to],
      text:`${disp(state, duel.d.from)} and ${disp(state, duel.d.to)} tied in Quick Draw` });
    else {
      const wRun = duel.d.runs[duel.r.winner], lRun = duel.d.runs[duel.r.loser];
      items.push({ tag:"Duel", tone:"var(--accent)", players:[duel.r.winner, duel.r.loser],
        text:`${disp(state, duel.r.winner)} beat ${disp(state, duel.r.loser)} in Quick Draw${
          lRun?.foul ? ", on a foul" : `, ${wRun?.ms} to ${lRun?.ms}ms`}` });
    }
  }
  const ruling = tickerRuling(state);
  if (ruling) items.push({ tag:"Ruling", tone:"var(--live2)", players:[ruling.player],
    text:`${disp(state, ruling.player)} ${signed(ruling.delta)}${ruling.reason ? `, ${ruling.reason}` : ""}` });
  if (!allTied && standings[0]) items.push({ tag:"Leader", tone:"var(--sun)", players:[standings[0].player],
    text:`${disp(state, standings[0].player)}, ${fmt(standings[0].pts)} chips` });
  if (nextEv) items.push({ tag:"Next", tone:"var(--pool)", text:`${nextEv.name}, ${payoutLine(nextEv)}` });
  if (!items.length) items.push({ tag:"Field Day", tone:"var(--accent)", text:editionLabel() });
  return items;
}
/* the tags' fills, for the contrast check */
export const TICKER_TONES = ["--accent", "--accent2", "--olive", "--sun", "--green", "--live2", "--pool"];

/* reduced motion: the ticker cuts between pages on the server clock */
export function tickerPage(items, now, perPage = TV_TICKER_PER_PAGE, period = TV_TICKER_PAGE_MS) {
  const pages = Math.max(1, Math.ceil(items.length / perPage));
  const index = pages > 1 ? Math.floor(Math.max(0, Number(now) || 0) / period) % pages : 0;
  return { index, pages, items:items.slice(index * perPage, index * perPage + perPage) };
}

/* The update reload waits for a gap in what the TV is actually showing. */
export const tvBusy = ({ sceneView = null, resultMoment = null, advance = null, intro = null, reveal = null, dock = null } = {}) =>
  !!(sceneView?.covers || resultMoment || advance || intro || reveal || dock);

/* ── idle cards ── */

/* every event on the slate with where it stands, and its winner */
export function weekendProgress(state, events) {
  return events.map(ev => {
    const res = state.results?.[ev.id];
    const groups = res?.slots?.[0]?.length ? podiumGroups(state, ev.id, res.slots[0]) : [];
    const status = res ? "done" : state.shelved?.[ev.id] ? "skipped"
      : state.onDeck === ev.id || eventInPlay(state, ev) || (ev.finale && state.poker && !res) ? "live" : "ahead";
    return { id:ev.id, name:ev.name, game:ev.game, session:ev.session, status,
      winners:groups.flatMap(group => group.players),
      winnerName:groups.length > 2 ? `${groups.length} tied` : groups.map(group => group.name).join(", ") };
  });
}

/* stacks as flat bars against the leader */
export function stackRace(standings) {
  const max = Math.max(1, ...standings.map(row => row.pts));
  return standings.map(row => ({ player:row.player, rank:row.rank, pts:row.pts,
    share:Math.max(0, row.pts) / max }));
}

/* Quick Draw: every settled duel, newest first, and each player's record */
export function duelBoard(state) {
  const records = {};
  const recent = [];
  (state.duels || []).forEach(d => {
    const r = resolveDuel(d);
    if (!r.settled) return;
    const at = duelSettledAt(d);
    [d.from, d.to].forEach(p => { records[p] = records[p] || { player:p, won:0, lost:0, tied:0, net:0 }; });
    if (r.push) { records[d.from].tied += 1; records[d.to].tied += 1; }
    else {
      records[r.winner].won += 1; records[r.winner].net += d.stake;
      records[r.loser].lost += 1; records[r.loser].net -= d.stake;
    }
    recent.push({ id:d.id, at, stake:d.stake, push:!!r.push, from:d.from, to:d.to,
      winner:r.winner || null, loser:r.loser || null,
      foul:!r.push && !!d.runs?.[r.loser]?.foul,
      winMs:r.push ? null : d.runs?.[r.winner]?.ms, loseMs:r.push ? null : d.runs?.[r.loser]?.ms });
  });
  const open = (state.duels || []).filter(d => d.status === "open" && !resolveDuel(d).settled).length;
  return {
    recent:recent.sort((a, b) => b.at - a.at),
    records:Object.values(records).sort((a, b) => b.net - a.net || b.won - a.won || a.player.localeCompare(b.player)),
    open,
  };
}

/* the spotlight walks the checked-in roster on the server clock: each full
   ambient rotation (cycleMs) brings the next player */
export function spotlightPlayer(state, now, cycleMs = TV_AMBIENT_MS) {
  const players = ROSTER.filter(p => Object.keys(state.profiles?.[p] || {}).length);
  if (!players.length) return null;
  return players[Math.floor(Math.max(0, Number(now) || 0) / Math.max(1, cycleMs)) % players.length];
}
/* the public weekend line for one player: never ratings, sizes, or flights */
export function playerWeekendStats(state, events, standings, player) {
  const row = standings.find(item => item.player === player);
  const places = [];
  events.forEach(ev => {
    const res = state.results?.[ev.id];
    if (!res?.slots) return;
    const place = res.slots.findIndex(slot => (slot || []).includes(player));
    if (place >= 0) places.push({ eventId:ev.id, name:ev.name, place:place + 1 });
  });
  const duels = duelBoard(state).records.find(item => item.player === player) || { won:0, lost:0, tied:0, net:0 };
  return {
    rank:row?.rank ?? null, pts:row?.pts ?? 0, wins:row?.wins ?? 0,
    betNet:row?.betNet ?? 0, duelNet:row?.duelNet ?? 0, podiums:places.length, places, duels,
  };
}

/* The champion moment: the crowned leader(s), every event's winner for the
   trophy plates, and the champion's own path through the slate. */
export function championView(state, events, standings) {
  const top = standings.filter(row => row.rank === 1);
  if (!top.length) return null;
  const plates = events.filter(ev => state.results?.[ev.id]?.slots?.[0]?.length).map(ev => {
    const groups = podiumGroups(state, ev.id, state.results[ev.id].slots[0]);
    return { eventId:ev.id, name:ev.name,
      winner:groups.length > 2 ? `${groups.length} tied` : groups.map(group => group.name).join(", ") };
  });
  const lead = top[0].player;
  const stats = playerWeekendStats(state, events, standings, lead);
  /* the weekend's winners as stars; the champion's own joined in order */
  const stars = constellationStars(state, events);
  return {
    stars,
    lines:constellationLines(stars, top.map(row => row.player)),
    players:top.map(row => row.player),
    pts:top[0].pts,
    wins:top[0].wins,
    tied:top.length > 1,
    plates,
    path:stats.places.map(item => ({ ...item, label:`${placeName(item.place)} ${item.name}` })),
    betNet:stats.betNet,
    duels:stats.duels,
  };
}

/* walkout cues the commissioner may tap: the current contest's players right
   after lock-and-start, every seated player right after the cards go live,
   and the winners of a directed winner or champion scene. Offered only;
   playback is still an explicit tap. */
export const CUE_WINDOW_MS = 3 * 60 * 1000;
export function cueCandidates(state, events, { scene = null, operationEvent = null, now = Date.now() } = {}) {
  if (scene && !scene.staleReason && ["winner", "champion"].includes(scene.active?.kind))
    return { reason:"scene", players:[...(scene.players || [])] };
  const pk = state.poker;
  if (pk?.startedAt && !state.results?.[pk.id] && now - pk.startedAt < CUE_WINDOW_MS)
    return { reason:"poker", players:pokerSeats(pk).filter(p => !(pk.outs || []).some(o => o.player === p)) };
  const ev = operationEvent;
  if (ev && !state.results?.[ev.id]) {
    const contest = resolveCurrentContest(state, ev);
    const op = state.eventOps?.[ev.id] || {};
    const lockedAt = Number(op.bettingLockedAt || op.startedAt || 0);
    if (contest?.phase === "in-progress" && lockedAt && now - lockedAt < CUE_WINDOW_MS)
      return { reason:"contest", players:[...contest.players] };
  }
  return { reason:null, players:[] };
}

/* whether a walkout cue is still sounding, for the chip's Stop state */
export const cuePlayingUntil = (track, startedAt) =>
  startedAt + Math.max(5000, Math.min(90000, (Number(track?.durationMs) || 60000) - (Number(track?.startMs) || 0)));
