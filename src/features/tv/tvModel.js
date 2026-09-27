/* The TV's presentation model. Pure functions over authoritative state and a
   server-anchored clock, so two TVs, a refreshed TV, and the tests all land
   on the same screen. Nothing here writes state. */

import {
  AWARDS, ROSTER, EDITION, ROUND_NAMES,
  computeStandings, resolveWager, resolveDuel, resolveCurrentContest, resolveSlot,
  disp, teamLabel, stageEntrantView, snakeTeam, overflowRoleMeta, pokerLive, pokerClock,
} from "../../../shared/core.js";

export const TV_WIDTH = 1920;
export const TV_HEIGHT = 1080;
/* the event intro plays as an overlay, then the live board takes over */
export const TV_INTRO_OVERLAY_MS = 3000;
/* a scene on its last step hands the TV back to ambient without a write */
export const TV_SCENE_IDLE_MS = 45000;
/* a fresh result owns the TV this long when no directed scene covers it */
export const TV_RESULT_MOMENT_MS = 20000;
/* the decided matchup stamps in before the next one takes the board */
export const TV_ADVANCE_MS = 5000;
export const TV_AMBIENT_MS = 12000;
export const TV_LEAD_CHANGE_MS = 8000;
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

/* letterboxed fit of the fixed canvas into any screen */
export function tvCanvasFit(width, height) {
  const w = Math.max(1, Number(width) || TV_WIDTH), h = Math.max(1, Number(height) || TV_HEIGHT);
  const scale = Math.min(w / TV_WIDTH, h / TV_HEIGHT);
  return { scale, left:Math.round((w - TV_WIDTH * scale) / 2), top:Math.round((h - TV_HEIGHT * scale) / 2) };
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

/* the next fully-seated, undecided matchup in bracket order: what plays now */
export function nextOpenMatch(br) {
  if (!br) return null;
  const names = ROUND_NAMES[br.size] || [];
  for (let r = 0; r < br.rounds.length; r++) for (let m = 0; m < br.rounds[r].length; m++) {
    const match = br.rounds[r][m];
    if (match.winner !== null && match.winner !== undefined) continue;
    const a = resolveSlot(br, match.a), b = resolveSlot(br, match.b);
    if (a !== null && b !== null) return { r, m, a, b, roundName:names[r] || "Match" };
  }
  return null;
}

export function latestResultOf(state, events) {
  let latest = null;
  Object.entries(state.results || {}).forEach(([eventId, res]) => {
    const ev = events.find(item => item.id === eventId);
    if (ev && res?.slots?.[0]?.length && (!latest || Number(res.ts) > Number(latest.res.ts)))
      latest = { ev, res };
  });
  return latest;
}

const leadersOf = rows => {
  if (!rows.length || rows[0].pts === rows[rows.length - 1].pts) return null;
  const top = rows.filter(row => row.rank === 1);
  return { players:top.map(row => row.player), pts:top[0].pts };
};

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
  const table = AWARDS[ev.value] || [0, 0, 0];
  const awardOf = {};
  (res.slots || []).forEach((players, index) => (players || []).forEach(p => {
    awardOf[p] = (awardOf[p] || 0) + (table[index] || 0);
  }));
  const betsOf = {};
  if (!stacks) eventWagers.forEach(w => {
    const r = resolveWager(state, w, events);
    if (r.status === "won" || r.status === "lost") betsOf[w.player] = (betsOf[w.player] || 0) + r.delta;
  });
  const outs = new Set(res.outs || []);
  const rows = after.map(row => {
    const prior = beforeBy[row.player];
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
      busted:stacks && outs.has(row.player),
    };
  });
  let podium;
  if (stacks) {
    const ranks = [...new Set(after.map(row => row.rank))].slice(0, 3);
    podium = ranks.map((rank, index) => {
      const players = after.filter(row => row.rank === rank).map(row => row.player);
      return { place:index + 1, players, amount:after.find(row => row.rank === rank).pts, unit:"stack" };
    });
  } else {
    podium = (res.slots || []).slice(0, 3).map((players, index) => ({
      place:index + 1, players:[...(players || [])], amount:table[index] || 0, unit:"award",
    })).filter(item => item.players.length);
  }
  const leaderBefore = leadersOf(before), leaderAfter = leadersOf(after);
  const key = lead => (lead ? [...lead.players].sort().join("+") : "");
  return {
    eventId, eventName:ev.name, game:ev.game, kind:stacks ? "stacks" : "awards",
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

/* the production result moment: fresh, not frozen, not already covered by
   a directed winner scene for the same event */
export function resultMomentFor(state, events, now, sceneView, scene) {
  if (state.frozen) return null;
  const latest = latestResultOf(state, events);
  if (!latest) return null;
  const anchor = Number(latest.res.confirmedAt || latest.res.ts) || 0;
  if (!(now - anchor < TV_RESULT_MOMENT_MS && now - anchor >= -5000)) return null;
  if (sceneView?.covers && scene?.active?.kind === "winner" && scene.active.eventId === latest.ev.id) return null;
  return { eventId:latest.ev.id, anchor };
}

/* the decided contest stamps in for a few seconds between matches */
export function advanceMoment(state, ev, now) {
  const last = ev && state.eventOps?.[ev.id]?.lastContest;
  if (!last?.decidedAt || now - last.decidedAt >= TV_ADVANCE_MS || now - last.decidedAt < -5000) return null;
  let players = [], name = "";
  if (last.kind === "match") {
    const team = state.draws?.[ev.id]?.teams?.[last.winner];
    if (!team) return null;
    players = team.players; name = teamLabel(state, team);
  } else {
    const st = state.stages?.[ev.id];
    if (!st) return null;
    const view = stageEntrantView(state, st, last.winner);
    players = view.players; name = view.name;
  }
  const br = state.brackets?.[ev.id];
  const finalMatch = last.kind === "match" && br && last.match?.[0] === br.rounds.length - 1;
  const round = last.kind === "match" ? (ROUND_NAMES[br?.size] || [])[last.match?.[0]] || "Match"
    : last.kind === "heat" ? state.stages?.[ev.id]?.groups?.[last.group]?.name || "Heat" : "Final";
  return { players, name, round, verb:finalMatch || last.kind === "stage-final" ? "Wins" : "Advances",
    decidedAt:last.decidedAt, id:last.id };
}

/* compact bracket strip: every round, the current match outlined */
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

/* the poker table on the TV: dealt stacks are starting chips, busts marked */
export function pokerTableRows(state, standings) {
  const pk = state.poker;
  if (!pk) return [];
  const outOrder = (pk.outs || []).map(o => o.player);
  const starting = pk.startingStacks || {};
  return standings.map(row => ({
    player:row.player,
    starting:starting[row.player] ?? row.pts,
    busted:outOrder.includes(row.player),
    finish:outOrder.includes(row.player) ? ROSTER.length - outOrder.indexOf(row.player) : null,
  })).sort((a, b) => Number(a.busted) - Number(b.busted) || b.starting - a.starting
    || a.player.localeCompare(b.player));
}

export function tvConnection({ ready, connected, status } = {}) {
  if (!ready) return { mode:"loading", label:"Connecting" };
  if (status === "stale" || status === "reconnecting" || status === "offline" || !connected)
    return { mode:"reconnecting", label:"Reconnecting" };
  return { mode:"live", label:null };
}

/* the most recent settled Quick Draw, by when the second run landed */
export function latestSettledDuel(duels = []) {
  let best = null;
  for (const d of duels) {
    const r = resolveDuel(d);
    if (!r.settled) continue;
    const at = Math.max(...Object.values(d.runs || {}).map(run => Number(run?.ts) || 0), Number(d.ts) || 0);
    if (!best || at > best.at) best = { d, r, at };
  }
  return best;
}

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
  if (latest) items.push({ tag:"Final", tone:"var(--olive)", players:latest.res.slots[0].slice(0, 4),
    text:`${latest.ev.name}: ${teamLabel(state, { players:latest.res.slots[0] })}` });
  if (upNext && upNextDraw) items.push({ tag:"Up now", tone:"var(--sun)",
    players:[...upNextDraw.teams[upNext.a].players, ...upNextDraw.teams[upNext.b].players].slice(0, 4),
    text:`${teamLabel(state, upNextDraw.teams[upNext.a])} vs ${teamLabel(state, upNextDraw.teams[upNext.b])}, ${upNext.roundName}` });
  if (onDeckEv) {
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
      text:`Blinds ${fmt(clk.sb)} / ${fmt(clk.bb)}, ${ROSTER.length - state.poker.outs.length} still in` });
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
  const ruling = (state.adjustments || [])[0];
  if (ruling) items.push({ tag:"Ruling", tone:"var(--clay)", players:[ruling.player],
    text:`${disp(state, ruling.player)} ${signed(ruling.delta)}${ruling.reason ? `, ${ruling.reason}` : ""}` });
  if (!allTied && standings[0]) items.push({ tag:"Leader", tone:"var(--sun)", players:[standings[0].player],
    text:`${disp(state, standings[0].player)}, ${fmt(standings[0].pts)} chips` });
  if (nextEv) items.push({ tag:"Next", tone:"var(--pool)", text:`${nextEv.name}, ${payoutLine(nextEv)}` });
  if (!items.length) items.push({ tag:"Field Day", tone:"var(--accent)", text:editionLabel() });
  return items;
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
    return { reason:"poker", players:ROSTER.filter(p => !(pk.outs || []).some(o => o.player === p)) };
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
