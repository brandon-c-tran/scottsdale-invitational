/* The TV's presentation model. Pure functions over authoritative state and a
   server-anchored clock, so two TVs, a refreshed TV, and the tests all land
   on the same screen. Nothing here writes state. */

import {
  awardTable, ROSTER, EDITION, ROUND_NAMES, SESSIONS, bracketOrder, bracketChampion, resultAwards,
  computeStandings, resolveWager, resolveDuel, resolveCurrentContest, resolveSlot, eventInPlay, contestMult,
  disp, teamLabel, stageEntrantView, overflowRoleMeta, pokerLive, pokerClock,
} from "../../../shared/core.js";
import { constellationStars, constellationLines } from "./desertModel.js";
import { liveEventOf, openEvent } from "../../ui/phase.js";
import { contestStacks, contestOfEntry, settledStacks, eventWinnerStacks } from "../wagers/betStacks.js";
import { INTRO_MS } from "../intro/introTiming.js";

export const TV_WIDTH = 1920;
export const TV_HEIGHT = 1080;
/* the event intro plays as an overlay, then the live board takes over:
   the game intro's own length, the same instant the phones hand over */
export const TV_INTRO_OVERLAY_MS = INTRO_MS;
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
/* the live gap's ambient turns: four or five high-value cards, each held */
export const TV_AMBIENT_TURN_MS = 20000;
export const TV_LEAD_CHANGE_MS = 8000;
export const TV_CORRECTION_MS = 8000;
/* the ticker holds one fact at a time on the server clock, cross-fading */
export const TV_TICKER_PAGE_MS = 6000;
export const TV_TICKER_PER_PAGE = 1;
/* result moment beats, from the moment's anchor. The podium builds: 3rd
   lands at once, 2nd close behind, then a held beat and 1st slams in (a
   steady 3 s a place read as broken and anticlimactic in the room). The
   screen, the stamps (roomSound podiumCues) and the walkout all read these. */
export const RESULT_PODIUM_BEATS_MS = Object.freeze([0, 900, 2400]);
export const podiumBeatAt = k => RESULT_PODIUM_BEATS_MS[Math.max(0, Math.min(RESULT_PODIUM_BEATS_MS.length - 1, k))];
/* kept for callers that still space by a step: the gap before 2nd */
export const RESULT_PODIUM_STEP_MS = RESULT_PODIUM_BEATS_MS[1];
export const RESULT_STANDINGS_AT_MS = 7000;
export const RESULT_SORT_DELAY_MS = 1500;

export const fmt = n => (Number(n) || 0).toLocaleString("en-US");
export const signed = n => `${n > 0 ? "+" : n < 0 ? "-" : ""}${fmt(Math.abs(n))}`;
export const mmss = ms => {
  const t = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};
export const editionLabel = () => EDITION.label || `${EDITION.name} · ${EDITION.year}`;
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
   event is not play: live is the open market, or an event actually in play.
   The phones' session theme reads the same function (ui/phase.js). */
export const tvLiveEvent = liveEventOf;
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
    /* who backed the winner outright, and what it paid them */
    winnerStacks:stacks ? null : eventWinnerStacks(state, events, eventId),
  };
}

/* where a result sequence is, from its anchor. Reduced motion keeps every
   fact (all three places, the final order, arrows, splits) and drops travel. */
export function resultMomentPhase(anchor, now, { reducedMotion = false, step = null } = {}) {
  const age = Math.max(0, now - anchor);
  if (step === "standings")
    return { phase:"standings", revealed:3, sorted:reducedMotion || age >= RESULT_SORT_DELAY_MS };
  if (step === "winner" || age < RESULT_STANDINGS_AT_MS)
    return { phase:"podium", revealed:reducedMotion ? 3 : RESULT_PODIUM_BEATS_MS.filter(at => age >= at).length, sorted:false };
  return { phase:"standings", revealed:3,
    sorted:reducedMotion || age >= RESULT_STANDINGS_AT_MS + RESULT_SORT_DELAY_MS };
}

/* ── the podium as a stage (TVPodium.jsx) ──
   Three stepped glass plinths stand on the painting's desert floor, 2nd,
   1st, 3rd, joined like a real podium. Each place's people stand on its
   step; its place and award are lettered on the step's face. Every size is
   chosen by count here, so a lone winner, a pair, a team of three, the
   5v5's seven, a split place and a counted tie all stand on their step by
   construction. Main-area pixels (masthead above, ticker below): the floor
   is the painting's own (canvas y 880). */
export const PODIUM_STAGE = Object.freeze({
  floor:756, lid:26, roomTop:136, pad:22, gap:14, minFace:44,
  order:Object.freeze([2, 1, 3]),
  width:Object.freeze({ 1:600, 2:460, 3:460 }),
  height:Object.freeze({ 1:318, 2:226, 3:164 }),
  /* the largest faces a place stands: alone, a pair, a team */
  face:Object.freeze({ 1:Object.freeze([168, 128, 104]), 2:Object.freeze([128, 104, 88]), 3:Object.freeze([128, 104, 88]) }),
  name:Object.freeze({ 1:92, 2:60, 3:60 }),
  title:Object.freeze({ max:92, min:56, mark:84, gap:26, width:1792 }),
});
const NAME_LINE = 1.12;

/* faces in rows inside a box with a name under them: the largest size that
   keeps every face and the name's lines inside it, one row while that is
   about as big, else balanced rows (seven stand four and three) */
export function standFit(count, width, height, { cap = 120, min = PODIUM_STAGE.minFace, gap = PODIUM_STAGE.gap, nameH = 0 } = {}) {
  const n = Math.max(1, Number(count) || 1);
  let best = null;
  for (let rows = 1; rows <= Math.min(3, n); rows++) {
    const cols = Math.ceil(n / rows);
    const byWidth = Math.floor((width - (cols - 1) * gap) / cols);
    const byHeight = Math.floor((height - nameH - gap - (rows - 1) * gap) / rows);
    const size = Math.min(cap, byWidth, byHeight);
    if (!best || size > best.size + 6) best = { size, cols, rows };
  }
  return { ...best, size:Math.max(min, best.size) };
}

/* the event's name over the podium: one line as large as fits beside its mark */
export function podiumTitleFit(name) {
  const t = PODIUM_STAGE.title;
  return sideNameFit(name, t.width - t.mark - t.gap, { max:t.max, min:t.min });
}

/* what a step's face says under its place: an award ("+400", "+400 each"
   for a team), or a poker stack as it stands */
export const stepAmount = entry => !entry?.amount ? null : entry.unit === "stack"
  ? { text:fmt(entry.amount), each:false }
  : { text:`+${fmt(entry.amount)}`, each:entry.players.length > 1 };

export function podiumStage(podium = []) {
  const S = PODIUM_STAGE;
  const total = S.order.reduce((sum, place) => sum + S.width[place], 0);
  let x = Math.round((TV_WIDTH - total) / 2);
  const steps = S.order.map(place => {
    const width = S.width[place], height = S.height[place];
    const left = x;
    x += width;
    const top = S.floor - height;
    /* the people stand on the lid, under the event's name */
    const room = Math.floor(top - S.lid * 0.5 - S.roomTop);
    const inner = width - 2 * S.pad;
    const entry = (podium || []).find(item => item.place === place) || null;
    let blocks = [];
    if (entry) {
      const wide = entry.groups.length > 3;
      const parts = wide || entry.groups.length === 1
        ? [{ players:entry.players, name:entry.names[0] }]
        : entry.groups.map(group => ({ players:group.players, name:group.name }));
      const split = parts.length > 1;
      const each = Math.floor((room - (parts.length - 1) * S.gap) / parts.length);
      blocks = parts.map(part => {
        const max = split ? (place === 1 ? 56 : 44) : S.name[place];
        const name = sideNameFit(part.name, inner, { max, min:Math.max(28, Math.round(max * 0.55)) });
        const nameH = Math.ceil(name.lines.length * name.size * NAME_LINE);
        const caps = S.face[place];
        const cap = (part.players.length === 1 ? caps[0] : part.players.length === 2 ? caps[1] : caps[2]) * (split ? 0.7 : 1);
        const faces = standFit(part.players.length, inner, each, { cap:Math.round(cap), nameH, min:wide ? 40 : S.minFace });
        return { players:part.players, name:part.name, nameSize:name.size, nameLines:name.lines, nameH,
          face:faces.size, cols:faces.cols, rows:faces.rows };
      });
    }
    return { place, left, width, height, top, room, inner, entry, blocks, amount:stepAmount(entry) };
  });
  return { steps, floor:S.floor, lid:S.lid };
}

/* The winning backers, on their own rail where the ticker runs, never in
   1st's step: one cell a backer (photo chip, first name, what it paid),
   named while the rail has the width, faces and amounts past that, and
   "+N" past what fits. Biggest payout first. */
export const BACKERS_RAIL = Object.freeze({ width:1792, pad:30, tag:236, total:200, named:236, bare:120, more:92, gap:18,
  afterMs:300 });
/* the rail lands just after the last place has turned */
export const podiumBackersAt = places => podiumBeatAt(Math.max(0, (Number(places) || 1) - 1)) + BACKERS_RAIL.afterMs;
export function backersRail(stacks) {
  const winners = (stacks?.winners || []).filter(item => item.paid > 0);
  if (!winners.length) return null;
  const R = BACKERS_RAIL;
  const room = R.width - 2 * R.pad - R.tag - R.total;
  const row = (cell, n) => n * cell + Math.max(0, n - 1) * R.gap;
  const cells = [...winners]
    .sort((a, b) => b.paid - a.paid || b.stake - a.stake || a.player.localeCompare(b.player))
    .map(item => ({ player:item.player, paid:item.paid, stake:item.stake }));
  const paid = cells.reduce((sum, item) => sum + item.paid, 0);
  if (row(R.named, cells.length) <= room) return { paid, cells, more:0, named:true };
  if (row(R.bare, cells.length) <= room) return { paid, cells, more:0, named:false };
  const fit = Math.max(1, Math.floor((room - R.more) / (R.bare + R.gap)));
  return { paid, cells:cells.slice(0, fit), more:cells.length - fit, named:false };
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
  /* the decided contest's chips: winners grow by their payout, the rest go
     back to the bank. Derived from resolveWager, so a correction redraws it. */
  const settle = settledStacks(state, [ev], contestOfEntry(ev.id, last));
  return { kind:last.kind, players, name, round, verb:won ? (plural ? "Win" : "Wins") : (plural ? "Advance" : "Advances"),
    detail, beat, next, decidedAt:last.decidedAt, id:last.id, settle };
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
/* who rides each side, merged per bettor, largest first: the same stacks
   the board draws */
export function contestRiders(state, events, contest) {
  return new Map([...contestStacks(state, events, contest)].map(([key, side]) =>
    [key, { riders:side.stacks.map(({ player, stake }) => ({ player, stake })), total:side.total }]));
}

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

/* The ticker is one plate of glass: a quiet label, the people as photo
   chips, then the fact. Color is by role and lives only on a fact's
   amount: chips amber, a won bet green, a loss in clay. Nothing in the
   ticker is lit; the live lamp belongs to the board. */
export const TICKER_ROLES = Object.freeze(["info", "chip", "won", "loss"]);
/* D4: the weekend's newest facts ride beside the latest result */
export const FACT_ROLES = Object.freeze({ streak:"info", first:"chip", wins:"info", bet:"won" });
export const TICKER_FACTS = 2;
/* a fact's label never repeats its first word: "First to 3,000" is a milestone */
export const TICKER_FACT_TAGS = Object.freeze({ first:"Milestone" });
/* an amount inside a fact, colored by its role */
const amount = (value, role = "chip") => ({ amount:value, role });
const fact = (tag, role, players, parts) => ({ tag, role, players:players || [],
  parts, text:parts.map(part => typeof part === "string" ? part : part.amount).join("") });
const signedRole = n => n < 0 ? "loss" : "chip";

/* the matchup after the one being played, in bracket order: who is on deck */
export function onDeckMatch(br) {
  if (!br) return null;
  const names = ROUND_NAMES[br.size] || [];
  let seen = 0;
  for (const [r, m] of bracketOrder(br)) {
    const match = br.rounds[r][m];
    if (match.winner !== null && match.winner !== undefined) continue;
    const a = resolveSlot(br, match.a), b = resolveSlot(br, match.b);
    if (a === null || b === null) continue;
    if (seen++ === 1) return { r, m, a, b, roundName:names[r] || "Match" };
  }
  return null;
}

/* the one biggest move a result made on the board: the award and the bets */
export function biggestSwing(state, events, eventId) {
  const model = resultPresentation(state, events, eventId);
  if (!model || model.kind === "stacks") return null;
  let best = null;
  model.rows.forEach(row => {
    const change = (row.award || 0) + (row.bets || 0);
    if (change && (!best || Math.abs(change) > Math.abs(best.change))) best = { player:row.player, change };
  });
  return best ? { ...best, eventName:model.eventName } : null;
}

/* the largest single backing on the contest being played */
export function biggestBacking(state, events, ev, contest) {
  if (!ev || !contest) return null;
  let best = null;
  contestStacks(state, events, contest).forEach((side, key) => {
    const top = side.stacks[0];
    if (top && (!best || top.stake > best.stake)) best = { player:top.player, stake:top.stake, key };
  });
  if (!best) return null;
  const side = contest.sides.find(item => String(item.key) === String(best.key));
  return side ? { ...best, side:contestSideView(state, ev, contest, side) } : null;
}
/* the one player alone at the top of the board, or null when the top is
   shared (every player level on the opening 1,000 included) */
export function soleLeader(standings = []) {
  const top = standings[0];
  if (!top) return null;
  return standings.filter(row => Number(row.pts) === Number(top.pts)).length === 1 ? top : null;
}
/* the whole board level: nobody leads and no rank means anything */
export const boardLevel = (standings = []) => standings.length > 1
  && standings.every(row => Number(row.pts) === Number(standings[0].pts));

/* What the room wants at a glance and is not already looking at, one fact
   a page: who is on deck after the match being played, the biggest backing
   on the contest, the last result and its biggest swing, the weekend's
   newest facts, the leader, what is in play elsewhere, won bets, duels,
   rulings, and the next event. The live contest itself is on the board,
   so the ticker never repeats it. Each fact: { tag, role, players, parts,
   text }; parts are strings and { amount, role } (text joins them). */
export function tickerItems({ state, events, standings, allTied, liveCrew, latest, liveEv = null, liveContest = null,
  onDeckEv, openWon, nextEv, now, facts = [], draft = false, showing = null }) {
  const items = [];
  const name = p => disp(state, p);
  /* the finale owns the room: only the table's own news, nothing from a
     board it has replaced and nothing about a player already out */
  if (pokerLive(state)) return pokerTickerItems(state, now);
  const br = liveEv ? state.brackets?.[liveEv.id] : null;
  const draw = liveEv ? state.draws?.[liveEv.id] : null;
  const deck = br && draw ? onDeckMatch(br) : null;
  if (deck && draw.teams[deck.a] && draw.teams[deck.b]) items.push(fact("On deck", "info",
    [...draw.teams[deck.a].players, ...draw.teams[deck.b].players].slice(0, 4),
    [`${teamLabel(state, draw.teams[deck.a])} vs ${teamLabel(state, draw.teams[deck.b])}, ${deck.roundName}`]));
  const backing = liveContest && ["betting-open", "betting-locked", "in-progress"].includes(liveContest.phase)
    ? biggestBacking(state, events, liveEv, liveContest) : null;
  if (backing) items.push(fact("Biggest bet", "chip", [...new Set([backing.player, ...backing.side.players])].slice(0, 3),
    [`${name(backing.player)} backs ${backing.side.name} `, amount(fmt(backing.stake))]));
  if (liveCrew?.length) items.push(fact("Crew", "info", liveCrew.map(item => item.player).slice(0, 4),
    [liveCrew.map(item => `${name(item.player)} (${overflowRoleMeta(item.role).label})`).join(", ")]));
  if (latest) {
    const groups = podiumGroups(state, latest.ev.id, latest.res.slots[0]);
    /* the result on screen already names its winner */
    if (latest.ev.id !== showing) items.push(fact("Result", "info", latest.res.slots[0].slice(0, 4),
      [`${latest.ev.name}: ${groups.length > 3 ? `${groups.length} tied` : groups.map(group => group.name).join(", ")}`]));
    const swing = biggestSwing(state, events, latest.ev.id);
    if (swing) items.push(fact("Biggest swing", signedRole(swing.change), [swing.player],
      [`${name(swing.player)} `, amount(signed(swing.change), signedRole(swing.change)), ` in ${swing.eventName}`]));
  }
  [...(facts || [])].reverse().slice(0, TICKER_FACTS).forEach(item => items.push(fact(TICKER_FACT_TAGS[item.kind] || item.tag,
    FACT_ROLES[item.kind] || "info", (item.players || []).slice(0, 4), [item.text])));
  /* a sole leader only: a shared top (or the level opening board) has none */
  if (!allTied && soleLeader(standings)) items.push(fact("Leader", "chip", [standings[0].player],
    [`${name(standings[0].player)} `, amount(fmt(standings[0].pts))]));
  if (onDeckEv && !state.shelved?.[onDeckEv.id]) {
    const riding = (state.wagers || []).filter(w => w.eventId === onDeckEv.id
      && resolveWager(state, w, events).status === "pending");
    const chipsIn = riding.reduce((n, w) => n + w.stake, 0);
    if (chipsIn > 0) items.push(fact("In play", "chip", [...new Set(riding.map(w => w.player))].slice(0, 4),
      [amount(fmt(chipsIn)), ` on ${onDeckEv.name}`]));
  }
  /* won bets belong to the last result, and only until the next thing
     takes the room (a contest in play, a draft) */
  if (latest && !liveEv && !draft) (openWon || [])
    .filter(x => x.w.eventId === latest.ev.id && x.r.delta > 0)
    .sort((a, b) => b.r.delta - a.r.delta).slice(0, 2)
    .forEach(x => items.push(fact("Bet won", "won", [x.w.player], [`${name(x.w.player)} `, amount(signed(x.r.delta), "won")])));
  const duel = latestSettledDuel(state.duels);
  if (duel) {
    if (duel.r.push) items.push(fact("Duel", "info", [duel.d.from, duel.d.to],
      [`${name(duel.d.from)} and ${name(duel.d.to)} tied in Quick Draw`]));
    else {
      const wRun = duel.d.runs[duel.r.winner], lRun = duel.d.runs[duel.r.loser];
      items.push(fact("Duel", "info", [duel.r.winner, duel.r.loser],
        [`${name(duel.r.winner)} beat ${name(duel.r.loser)} in Quick Draw${
          lRun?.foul ? ", on a foul" : `, ${wRun?.ms} to ${lRun?.ms}ms`}`]));
    }
  }
  const ruling = tickerRuling(state);
  if (ruling) items.push(fact("Ruling", signedRole(ruling.delta), [ruling.player],
    [`${name(ruling.player)} `, amount(signed(ruling.delta), signedRole(ruling.delta)), ruling.reason ? `, ${ruling.reason}` : ""]));
  /* what is next and what it pays, drawn: the event, then its ladder */
  if (nextEv) items.push(fact("Next", "info", [], [nextEv.name, { ladder:awardTable(nextEv) }]));
  if (!items.length) items.push(fact("Field Day", "info", [], [editionLabel()]));
  return items;
}

/* The live table's own news: the last seat out, what the blinds go to
   next, the deepest stack still in as dealt, and the average stack. */
export function pokerTickerItems(state, now) {
  const pk = state.poker;
  const items = [];
  const seats = pokerSeats(pk);
  const outs = (pk.outs || []).map(o => o.player);
  const last = outs[outs.length - 1];
  if (last) items.push(fact("Out", "info", [last], [`${disp(state, last)}, ${placeName(seats.length - outs.length + 1)}`]));
  const clk = pokerClock(pk, now);
  const levels = pk.levels || [];
  const next = levels[clk.idx + 1];
  if (next) items.push(fact("Next level", "info", [], [`Blinds ${fmt(next.sb)} / ${fmt(next.bb)}`]));
  const starting = pk.startingStacks || {};
  const inPlay = seats.filter(p => !outs.includes(p) && Number.isFinite(Number(starting[p])));
  if (inPlay.length) {
    const deep = [...inPlay].sort((a, b) => Number(starting[b]) - Number(starting[a]))[0];
    items.push(fact("Deepest stack", "chip", [deep], [`${disp(state, deep)} `, amount(fmt(Number(starting[deep])))]));
    const total = inPlay.reduce((n, p) => n + Number(starting[p]), 0);
    items.push(fact("Average stack", "chip", [], [amount(fmt(Math.round(total / inPlay.length / 25) * 25)), ` across ${inPlay.length} seats`]));
  }
  if (!items.length) items.push(fact("Field Day", "info", [], [editionLabel()]));
  return items;
}

/* The ticker's pages: two short facts share the plate, side by side, and a
   long one has it alone, centered. The width is an estimate in canvas
   pixels at the ticker's sizes (34px body, 40px numerals, 26px label). */
export const TICKER_HALF_PX = 830;
export function tickerFactWidth(item) {
  const tag = String(item?.tag || "").length * 17 + 46;
  const n = (item?.players || []).length;
  const faces = n ? 44 + (n - 1) * (n > 2 ? 31 : 52) + 20 : 0;
  const text = (item?.parts || [item?.text || ""]).reduce((w, part) => w + (typeof part === "string"
    ? String(part).length * 16.5 : String(part.amount).length * 20), 0);
  return Math.ceil(tag + faces + text);
}
export function tickerPages(items = []) {
  const pages = [];
  for (let i = 0; i < items.length; i++) {
    const a = items[i], b = items[i + 1];
    if (b && tickerFactWidth(a) <= TICKER_HALF_PX && tickerFactWidth(b) <= TICKER_HALF_PX) { pages.push([a, b]); i++; }
    else pages.push([a]);
  }
  return pages;
}
/* the packed page on the server clock: every TV shows the same pair */
export function tickerSpread(items, now, period = TV_TICKER_PAGE_MS) {
  const pages = tickerPages(items);
  const count = Math.max(1, pages.length);
  const index = count > 1 ? Math.floor(Math.max(0, Number(now) || 0) / period) % count : 0;
  return { index, pages:count, items:pages[index] || [] };
}

/* the ticker's page on the server clock: every TV shows the same fact */
export function tickerPage(items, now, perPage = TV_TICKER_PER_PAGE, period = TV_TICKER_PAGE_MS) {
  const pages = Math.max(1, Math.ceil(items.length / perPage));
  const index = pages > 1 ? Math.floor(Math.max(0, Number(now) || 0) / period) % pages : 0;
  return { index, pages, items:items.slice(index * perPage, index * perPage + perPage) };
}

/* The live contest's lamp, from the contest itself, so the masthead and the
   board can never disagree: betting open flashes (pending), play is steady. */
export function contestLamp(contest) {
  if (!contest) return null;
  if (contest.phase === "betting-open") return { label:"Betting open", state:"pending" };
  if (contest.phase === "betting-locked" || contest.phase === "in-progress") return { label:"Playing", state:"live" };
  if (contest.phase === "awaiting-result") return { label:"Awaiting result", state:"live" };
  return null;
}

/* A side's name at TV scale: one line as large as fits, else two lines
   broken after the team's "&" (or at its last space), never a stray wrap.
   The factor is Big Shoulders' bold uppercase advance per character. */
const ADVANCE = 0.47;
/* caps: a name set in capitals runs wider (about .56em a letter) */
export function sideNameFit(name, width, { max = 56, min = 40, caps = false } = {}) {
  const text = String(name || "");
  const advance = caps ? 0.56 : ADVANCE;
  const one = Math.floor(width / Math.max(1, text.length * advance));
  if (one >= min) return { size:Math.min(max, one), lines:[text] };
  const cut = text.includes(" & ") ? text.indexOf(" & ") + 2 : text.lastIndexOf(" ");
  if (cut <= 0) return { size:Math.max(24, Math.min(max, one)), lines:[text] };
  const lines = [text.slice(0, cut).trim(), text.slice(cut).trim()];
  const two = Math.floor(width / Math.max(1, Math.max(...lines.map(line => line.length)) * advance));
  return { size:Math.max(24, Math.min(max, two)), lines };
}

/* the wall clock in the masthead, from the server's time, with its AM/PM:
   without it "4:00" reads as a countdown */
export const tvClock = now => {
  const text = new Date(Number(now) || 0).toLocaleTimeString("en-US", { hour:"numeric", minute:"2-digit" });
  const match = /^(.*?)\s?([AP]M)$/i.exec(text);
  return match ? { time:match[1].trim(), period:match[2].toUpperCase() } : { time:text, period:"" };
};

/* The stage's chrome (masthead, standings horizon, ticker) leaves while a
   takeover owns the room: the intro, the draw, the champion, the awards,
   and any moment scene listed in `extra` with a `takeover` name. A `chase`
   color (a winner's own) lights the lamp frame around the glass. Pure, so
   every TV agrees. */
export function stageChrome({ intro = false, reveal = false, champion = false, award = false, extra = [] } = {}) {
  const scenes = [intro && "intro", reveal && "reveal", champion && "champion", award && "award",
    ...extra.filter(item => item?.takeover).map(item => item.takeover)].filter(Boolean);
  const chase = [...extra].reverse().find(item => item?.chase)?.chase || null;
  return { takeover:scenes[0] || null, chase };
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
    path:stats.places.map(item => ({ ...item, game:events.find(ev => ev.id === item.eventId)?.game || null,
      label:`${placeName(item.place)} ${item.name}` })),
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
