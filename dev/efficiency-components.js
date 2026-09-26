var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// shared/core.js
function cleanLeg(v) {
  if (v === null || v === void 0 || v === "") return null;
  if (typeof v === "string") return v.trim() ? { note: v.trim().slice(0, 90) } : null;
  if (typeof v !== "object") return void 0;
  const out = {};
  const air = String(v.air || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3);
  const num = String(v.num ?? "").replace(/\D/g, "").slice(0, 4);
  if (air) out.air = air;
  if (num) out.num = num;
  if (typeof v.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v.time)) out.time = v.time;
  if (typeof v.note === "string" && v.note.trim()) out.note = v.note.trim().slice(0, 90);
  return Object.keys(out).length ? out : null;
}
function legTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${(h + 11) % 12 + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
function allEventsOf(state) {
  const evs = [
    ...BUILTIN_EVENTS.map((e) => {
      const event = { ...e, ...state.eventEdits?.[e.id] || {} };
      return { ...event, participation: participationForEvent(event) };
    }),
    ...(state.customEvents || []).map((event) => ({
      ...event,
      participation: participationForEvent(event)
    }))
  ];
  const ord = state.eventOrder || [];
  if (ord.length) {
    const idx = (id) => {
      const i = ord.indexOf(id);
      return i < 0 ? 999 : i;
    };
    evs.sort((a, b) => idx(a.id) - idx(b.id) || (a.n || 99) - (b.n || 99));
  }
  return evs;
}
function eventCapacity(ev) {
  const policy = participationForEvent(ev);
  if (policy.type === "strict-teams")
    return Number.isInteger(policy.teams) && Number.isInteger(policy.size) ? policy.teams * policy.size : null;
  if (policy.type === "fixed") return Number.isInteger(policy.entrants) ? policy.entrants : null;
  return null;
}
function validateEventParticipants(ev, selected, active = ROSTER) {
  const policy = participationForEvent(ev);
  const activeUnique = [...new Set(active)];
  const activeSet = new Set(activeUnique);
  if (!Array.isArray(selected))
    return { ok: false, code: "selection-required", error: "Choose who is playing" };
  const players = [...new Set(selected)];
  if (players.length !== selected.length)
    return { ok: false, code: "duplicate-player", error: "A player is selected twice" };
  if (players.some((player) => !activeSet.has(player)))
    return { ok: false, code: "inactive-player", error: "Only confirmed players can participate" };
  const capacity = eventCapacity(ev);
  if (policy.type === "all") {
    if (players.length !== activeUnique.length || activeUnique.some((player) => !players.includes(player)))
      return {
        ok: false,
        code: "all-required",
        error: `All ${activeUnique.length} confirmed players are required`,
        selectedCount: players.length,
        activeCount: activeUnique.length,
        required: activeUnique.length
      };
  } else if (policy.type === "strict-teams" || policy.type === "fixed") {
    if (!capacity || capacity < 1)
      return { ok: false, code: "bad-policy", error: "Event participation is not configured" };
    if (activeUnique.length < capacity)
      return {
        ok: false,
        code: "roster-short",
        error: `This event needs ${capacity} players; ${activeUnique.length} confirmed`,
        selectedCount: players.length,
        activeCount: activeUnique.length,
        required: capacity
      };
    if (players.length !== capacity) {
      const overflow2 = Math.max(0, activeUnique.length - capacity);
      return {
        ok: false,
        code: "wrong-count",
        error: `Select exactly ${capacity} players${overflow2 ? ` and assign ${overflow2} overflow ${overflow2 === 1 ? "role" : "roles"}` : ""}`,
        selectedCount: players.length,
        activeCount: activeUnique.length,
        required: capacity,
        overflow: overflow2
      };
    }
  } else if (policy.type === "selection") {
    const min = Number.isInteger(policy.min) ? policy.min : 1;
    const max = Number.isInteger(policy.max) ? policy.max : activeUnique.length;
    if (players.length < min || players.length > max)
      return {
        ok: false,
        code: "outside-range",
        error: `Select ${min} to ${max} players`,
        selectedCount: players.length,
        activeCount: activeUnique.length
      };
  } else if (policy.type === "approximate-teams") {
    const min = Number.isInteger(policy.min) ? policy.min : 2;
    if (players.length < min)
      return {
        ok: false,
        code: "roster-short",
        error: `Select at least ${min} players`,
        selectedCount: players.length,
        activeCount: activeUnique.length
      };
  } else {
    return { ok: false, code: "bad-policy", error: "Unknown participation policy" };
  }
  const overflow = activeUnique.filter((player) => !players.includes(player));
  if (overflow.length && !policy.allowSitOut)
    return { ok: false, code: "overflow-not-allowed", error: "Every confirmed player must participate" };
  return {
    ok: true,
    players,
    overflow,
    capacity,
    selectedCount: players.length,
    activeCount: activeUnique.length,
    policy
  };
}
function draftTurn(draft) {
  if (!draft?.id || !Array.isArray(draft.teams) || !draft.teams.length || !Array.isArray(draft.picks) || !Array.isArray(draft.pool)) return null;
  const pickIndex = draft.picks.length, remaining = draft.pool.length;
  const complete = remaining === 0;
  const teamIndex = complete ? null : snakeTeam(pickIndex, draft.teams.length);
  return {
    draftId: draft.id,
    pickIndex,
    draftRevision: Number(draft.revision || 0),
    teamIndex,
    captain: teamIndex === null ? null : draft.teams[teamIndex].captain,
    round: Math.floor(pickIndex / draft.teams.length) + 1,
    totalPicks: pickIndex + remaining,
    remaining,
    complete
  };
}
function teamLabel(state, t) {
  if (t.name) return t.name;
  const names = t.players.map((p) => disp(state, p));
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `Team ${names[0]}`;
}
function stageFinalists(st) {
  if (!st) return null;
  return st.groups.every((g) => (g.through || []).length >= st.advance) ? st.groups.flatMap((g) => g.through) : null;
}
function stageEntrantView(state, st, key) {
  if (st.entrantType === "team") {
    const draw = state.draws[st.eventId];
    const t = draw?.teams?.[key];
    return t ? { players: t.players, name: teamLabel(state, t) } : { players: [], name: "?" };
  }
  return { players: [key], name: disp(state, key) };
}
function resolveWager(state, w, events) {
  if (w.status === "void") return { status: "void", delta: 0 };
  const ev = events.find((e) => e.id === w.eventId);
  if (!ev) return { status: "void", delta: 0 };
  if (w.kind === "outright") {
    if (w.pickTeam) {
      const draw = state.draws[w.eventId];
      if (!draw || draw.id !== w.drawId) return { status: "void", delta: 0 };
    }
    const res = state.results[w.eventId];
    if (!res || !res.slots?.[0]) return { status: "pending", delta: 0 };
    const winners = res.slots[0];
    const won = w.pickTeam ? w.pickPlayers.every((p) => winners.includes(p)) : winners.includes(w.pick);
    return { status: won ? "won" : "lost", delta: won ? OUTRIGHT_MULT * w.stake : -w.stake };
  }
  if (w.kind === "match") {
    const draw = state.draws[w.eventId];
    if (!draw || draw.id !== w.drawId) return { status: "void", delta: 0 };
    const br = state.brackets[w.eventId];
    const match = br?.rounds?.[w.match[0]]?.[w.match[1]];
    if (!match) return { status: "void", delta: 0 };
    if (match.winner === null || match.winner === void 0) return { status: "pending", delta: 0 };
    const won = match.winner === w.teamIdx;
    return { status: won ? "won" : "lost", delta: won ? w.stake : -w.stake };
  }
  if (w.kind === "stage" || w.kind === "heat") {
    const st = state.stages[w.eventId];
    if (!st || st.id !== w.stagesId) return { status: "void", delta: 0 };
    if (st.entrantType === "team") {
      const draw = state.draws[w.eventId];
      if (!draw || draw.id !== st.drawId) return { status: "void", delta: 0 };
    }
    if (w.final) {
      if (st.finalWinner === null || st.finalWinner === void 0) return { status: "pending", delta: 0 };
      const won2 = st.finalWinner === w.pickKey;
      return { status: won2 ? "won" : "lost", delta: won2 ? w.stake : -w.stake };
    }
    const g = st.groups[w.group];
    if (!g) return { status: "void", delta: 0 };
    if (w.kind === "heat") {
      if (g.winner === null || g.winner === void 0) return { status: "pending", delta: 0 };
      const won2 = g.winner === w.pickKey;
      return { status: won2 ? "won" : "lost", delta: won2 ? w.stake : -w.stake };
    }
    if ((g.through || []).length < st.advance) return { status: "pending", delta: 0 };
    const won = g.through.includes(w.pickKey);
    return { status: won ? "won" : "lost", delta: won ? w.stake : -w.stake };
  }
  return { status: "void", delta: 0 };
}
function resolveDuel(duel) {
  if (duel.status !== "open") return { settled: false, status: duel.status };
  const a = duel.runs?.[duel.from], b = duel.runs?.[duel.to];
  if (!a || !b) return { settled: false, status: "open" };
  const score = (r) => r.foul ? Infinity : r.ms;
  if (score(a) === score(b)) return { settled: true, push: true };
  const winner = score(a) < score(b) ? duel.from : duel.to;
  return { settled: true, push: false, winner, loser: winner === duel.from ? duel.to : duel.from };
}
function computeStandings(state) {
  const pts = {}, wins = {}, betNet = {}, duelNet = {}, awardPts = {};
  ROSTER.forEach((p) => {
    pts[p] = START;
    wins[p] = 0;
    betNet[p] = 0;
    duelNet[p] = 0;
    awardPts[p] = 0;
  });
  const evs = allEventsOf(state);
  Object.entries(state.results || {}).forEach(([eid, res]) => {
    const ev = evs.find((e) => e.id === eid);
    if (!ev || !res) return;
    const table = AWARDS[ev.value] || [0, 0, 0];
    (res.slots || []).forEach((players, i) => (players || []).forEach((p) => {
      if (pts[p] === void 0) return;
      pts[p] += table[i] || 0;
      awardPts[p] += table[i] || 0;
      if (i === 0) wins[p] += 1;
    }));
  });
  (state.wagers || []).forEach((w) => {
    const r = resolveWager(state, w, evs);
    if (r.status === "won" || r.status === "lost") {
      if (pts[w.player] !== void 0) {
        pts[w.player] += r.delta;
        betNet[w.player] += r.delta;
      }
    }
  });
  (state.duels || []).forEach((d) => {
    const r = resolveDuel(d);
    if (!r.settled || r.push) return;
    if (pts[r.winner] !== void 0) {
      pts[r.winner] += d.stake;
      duelNet[r.winner] += d.stake;
    }
    if (pts[r.loser] !== void 0) {
      pts[r.loser] -= d.stake;
      duelNet[r.loser] -= d.stake;
    }
  });
  (state.adjustments || []).forEach((a) => {
    if (pts[a.player] !== void 0) pts[a.player] += a.delta;
  });
  let stacksRes = null;
  Object.values(state.results || {}).forEach((res) => {
    if (res?.stacks) stacksRes = res;
  });
  if (stacksRes) {
    ROSTER.forEach((p) => {
      pts[p] = stacksRes.stacks[p] ?? 0;
    });
    (state.adjustments || []).forEach((a) => {
      if (a.ts > stacksRes.ts && pts[a.player] !== void 0) pts[a.player] += a.delta;
    });
  }
  const outRank = (p) => {
    const i = (stacksRes?.outs || []).indexOf(p);
    return i < 0 ? Infinity : i;
  };
  const rows = ROSTER.map((p) => ({ player: p, pts: pts[p], wins: wins[p], betNet: betNet[p], duelNet: duelNet[p], awardPts: awardPts[p] })).sort((x, y) => y.pts - x.pts || (stacksRes ? outRank(y.player) - outRank(x.player) : 0) || y.wins - x.wins || x.player.localeCompare(y.player));
  let rank = 0, prev = null;
  rows.forEach((r, i) => {
    if (r.pts !== prev || stacksRes && r.pts === 0) {
      rank = i + 1;
      prev = r.pts;
    }
    r.rank = rank;
  });
  return rows;
}
function atRisk(state, p, events) {
  return (state.wagers || []).filter((w) => w.player === p && resolveWager(state, w, events).status === "pending").reduce((s, w) => s + w.stake, 0);
}
function resolveSlot(br, slot) {
  if (!slot) return null;
  if (slot.t !== void 0) return slot.t;
  const src = br.rounds[slot.w[0]]?.[slot.w[1]];
  return src && src.winner !== null && src.winner !== void 0 ? src.winner : null;
}
function contestTarget(state, ev) {
  if (!ev || state.results?.[ev.id] || state.shelved?.[ev.id] || ev.game === "poker" || state.drafts?.[ev.id] && !state.draws?.[ev.id]) return null;
  const draw = state.draws?.[ev.id];
  if (ev.teamCfg && !draw) return null;
  const br = state.brackets?.[ev.id];
  if (ev.teamCfg?.bracket && !br) return null;
  if (br) {
    for (let r = 0; r < br.rounds.length; r++) {
      for (let m = 0; m < br.rounds[r].length; m++) {
        const match = br.rounds[r][m];
        if (match.winner !== null && match.winner !== void 0) continue;
        const keys = [resolveSlot(br, match.a), resolveSlot(br, match.b)];
        if (keys.some((key) => key === null || key === void 0 || !draw?.teams?.[key])) continue;
        return {
          id: `match:${ev.id}:${draw.id}:${r}:${m}`,
          kind: "match",
          match: [r, m],
          drawId: draw.id,
          label: `${ROUND_NAMES[draw.teams.length]?.[r] || `Round ${r + 1}`} \xB7 Match ${m + 1}`,
          sides: keys.map((key) => ({ key, players: [...draw.teams[key].players] }))
        };
      }
    }
    return null;
  }
  const st = state.stages?.[ev.id];
  if (needsStageSetup(state, ev)) return null;
  if (st) {
    if (st.entrantType === "team" && (!draw || st.drawId !== draw.id)) return null;
    const sides = (keys) => keys.map((key) => ({ key, players: stageEntrantView(state, st, key).players }));
    const group = st.groups.findIndex((g) => (g.through || []).length < st.advance || st.contestVersion === 1 && (g.winner === null || g.winner === void 0));
    if (group >= 0) return {
      id: `heat:${ev.id}:${st.id}:${group}`,
      kind: "heat",
      group,
      stagesId: st.id,
      drawId: st.drawId || null,
      label: st.groups[group].name,
      sides: sides(st.groups[group].entrants)
    };
    const finalists = stageFinalists(st);
    if (!finalists || st.finalWinner !== null && st.finalWinner !== void 0) return null;
    return {
      id: `final:${ev.id}:${st.id}`,
      kind: "stage-final",
      stagesId: st.id,
      drawId: st.drawId || null,
      label: "Final",
      sides: sides(finalists)
    };
  }
  return {
    id: `ffa:${ev.id}:${draw?.id || "solo"}`,
    kind: "ffa",
    drawId: draw?.id || null,
    label: ev.name,
    sides: draw ? draw.teams.map((team, key) => ({ key, players: [...team.players] })) : ROSTER.map((key) => ({ key, players: [key] }))
  };
}
function resolveCurrentContest(state, ev) {
  const target = contestTarget(state, ev);
  if (!target) return null;
  const op = eventOpOf(state, ev.id);
  const stored = op.contest;
  const same = stored?.id === target.id;
  const legacy = !stored;
  let phase;
  if (same) phase = stored.phase;
  else if (stored || op.resultEntryAt) phase = "awaiting-result";
  else if (op.startedAt || bracketStarted(state.brackets?.[ev.id]) || stagesStarted(state.stages?.[ev.id]))
    phase = "in-progress";
  else if (state.onDeck === ev.id) phase = "betting-open";
  else phase = op.bettingLockedAt ? "betting-locked" : "scheduled";
  const nextAction = phase === "betting-open" ? lifecycleAction("lock-betting", "Lock & start") : phase === "betting-locked" ? lifecycleAction("start-event", "Start") : phase === "awaiting-result" ? lifecycleAction("post-result", "Post result") : phase === "scheduled" ? lifecycleAction("open-betting", "Open betting") : target.kind === "ffa" ? lifecycleAction("enter-result", "Enter result") : lifecycleAction("record-contest-winner", "Record winner");
  return {
    ...target,
    eventId: ev.id,
    revision: same ? Number(stored.revision || 0) : Number(op.contestRevision || 0),
    phase,
    legacy,
    players: [...new Set(target.sides.flatMap((side) => side.players))],
    nextAction
  };
}
function contestBetEligibility(contest, player, sideKey) {
  const side = contest?.sides.find((item) => item.key === sideKey);
  if (!side || !isActivePlayer(player)) return false;
  if (contest.kind === "ffa") return true;
  return !contest.players.includes(player) || side.players.includes(player);
}
function wagerMatchesContest(wager, contest) {
  if (!contest || wager.eventId !== contest.eventId) return false;
  if (wager.contestId && wager.contestId !== contest.id) return false;
  if (contest.kind === "ffa") return wager.kind === "outright" && (!contest.drawId || wager.pickTeam && wager.drawId === contest.drawId);
  if (contest.kind === "match") return wager.kind === "match" && wager.drawId === contest.drawId && wager.match?.[0] === contest.match[0] && wager.match?.[1] === contest.match[1];
  return wager.stagesId === contest.stagesId && (contest.kind === "heat" ? wager.kind === "heat" && !wager.final && wager.group === contest.group : wager.kind === "stage" && wager.final === true);
}
function contestUndoAvailability(state, ev) {
  const op = eventOpOf(state, ev?.id);
  const last = op.lastContest;
  const response = (blocker) => ({
    enabled: !blocker,
    blocker: blocker || null,
    contestId: last?.id || null,
    contestRevision: Number(op.contestRevision || 0)
  });
  if (!ev || !last) return response("No previous contest to correct");
  if (state.frozen) return response("The board is frozen");
  if (state.results?.[ev.id]) return response("The event result is already posted");
  if (state.poker || stacksPosted(state)) return response("The finale is underway");
  if (state.onDeck && state.onDeck !== ev.id) return response("Close the current betting market first");
  const current = resolveCurrentContest(state, ev);
  if (current && current.phase !== "betting-open") return response("The next contest is already locked or playing");
  if (current && (state.wagers || []).some((wager) => wagerMatchesContest(wager, current) && resolveWager(state, wager, allEventsOf(state)).status === "pending"))
    return response("Remove the next contest's chips before correcting the result");
  return response(null);
}
function resultReadiness(state, ev) {
  const blockers = [];
  if (state.drafts?.[ev.id] && !state.draws?.[ev.id])
    blockers.push("Finish or cancel the captains draft");
  if (ev.teamCfg && !state.draws?.[ev.id])
    blockers.push("Set the teams first");
  const bracket = state.brackets?.[ev.id];
  if (bracket && bracketChampion(bracket) === null)
    blockers.push("Complete the bracket");
  const stages = state.stages?.[ev.id];
  if (needsStageSetup(state, ev)) blockers.push(`Set up ${ev.stageCfg.kind} first`);
  if (ev.teamCfg?.bracket && !bracket) blockers.push("Set up the bracket first");
  if (stages && (!stageFinalists(stages) || stages.finalWinner === null || stages.finalWinner === void 0))
    blockers.push(`Complete the ${stages.kind === "heats" ? "heats" : "pools"} and final`);
  return { ok: blockers.length === 0, blockers };
}
function resolveEventLifecycle(state, ev) {
  if (!ev) return {
    phase: "scheduled",
    label: EVENT_PHASE_LABELS.scheduled,
    blockers: ["Event not found"],
    nextAction: null
  };
  const result = state.results?.[ev.id];
  const op = eventOpOf(state, ev.id);
  const finish = resultReadiness(state, ev);
  const response = (phase, nextAction = null, blockers = []) => ({
    eventId: ev.id,
    phase,
    label: EVENT_PHASE_LABELS[phase],
    blockers,
    nextAction,
    revision: Number(op.revision || result?.revision || 0)
  });
  if (state.shelved?.[ev.id]) return response("shelved");
  if (result) return response("complete");
  if (ev.game === "poker" && ev.finale) {
    if (!state.poker) {
      const blockers = [];
      const events = allEventsOf(state);
      const pendingWagers = (state.wagers || []).filter((w) => resolveWager(state, w, events).status === "pending").length;
      if (pendingWagers)
        blockers.push(`Settle ${pendingWagers} open bet${pendingWagers === 1 ? "" : "s"} first`);
      const openDuels = (state.duels || []).filter((d) => d.status === "open" && !resolveDuel(d).settled).length;
      if (openDuels)
        blockers.push(`Settle ${openDuels} open duel${openDuels === 1 ? "" : "s"} first`);
      if (computeStandings(state).some((row) => row.pts < 0))
        blockers.push("Negative stacks, fix rulings first");
      return response(
        "setup",
        lifecycleAction("setup-poker", "Set up the poker table", blockers),
        blockers
      );
    }
    if (op.resultEntryAt)
      return response("result-entry", lifecycleAction("post-poker-result", "Post the final chip counts"));
    if (!state.poker.startedAt)
      return response("setup", lifecycleAction("start-poker", "Start the poker table"));
    return response("in-progress", lifecycleAction("run-poker", "Run the poker table"));
  }
  const draw = state.draws?.[ev.id];
  const draft = state.drafts?.[ev.id];
  if (draft && !draw)
    return response("draw-pending", lifecycleAction("continue-draft", `Continue the ${ev.name} draft`));
  if (ev.teamCfg && !draw)
    return response("draw-pending", lifecycleAction("prepare-draw", `Choose players and draw ${ev.name}`));
  if (needsStageSetup(state, ev))
    return response("setup", lifecycleAction("prepare-stages", `Set up ${ev.stageCfg.kind}`));
  if (op.contest) {
    if (op.resultEntryAt)
      return response("result-entry", lifecycleAction("post-result", `Post the ${ev.name} result`, finish.blockers), finish.blockers);
    const contest = resolveCurrentContest(state, ev);
    if (contest) return response(
      contest.phase === "awaiting-result" ? "result-entry" : contest.phase,
      contest.nextAction,
      contest.phase === "in-progress" ? finish.blockers : []
    );
    return response("in-progress", lifecycleAction("enter-result", `Enter the ${ev.name} result`, finish.blockers), finish.blockers);
  }
  const competitionStarted = !!op.startedAt || bracketStarted(state.brackets?.[ev.id]) || stagesStarted(state.stages?.[ev.id]);
  if (state.onDeck === ev.id && !competitionStarted)
    return response("betting-open", lifecycleAction("lock-betting", `Lock betting on ${ev.name}`));
  if (op.resultEntryAt)
    return response(
      "result-entry",
      lifecycleAction("post-result", `Post the ${ev.name} result`, finish.blockers),
      finish.blockers
    );
  if (competitionStarted) {
    let action;
    if (resolveCurrentContest(state, ev)?.kind !== "ffa" && !finish.ok)
      action = lifecycleAction("record-contest-winner", "Record winner");
    else action = lifecycleAction("enter-result", `Enter the ${ev.name} result`);
    return response("in-progress", action, finish.blockers);
  }
  if (op.bettingLockedAt)
    return response("betting-locked", lifecycleAction("start-event", `Start ${ev.name}`));
  if (draw)
    return response("draw-revealed", lifecycleAction("open-betting", `Open betting on ${ev.name}`));
  return response("setup", lifecycleAction("open-betting", `Open betting on ${ev.name}`));
}
var ROSTER_CONFIG, ROSTER_STATUSES, rosterPlayers, ALL_PLAYERS, ROSTER, isActivePlayer, PT, START, MAX_RISK, BUYIN_FLOOR, maxRisk, AWARDS, SPORTS, RATINGS, SESSIONS, RAW_BUILTIN_EVENTS, OVERFLOW_ROLES, OVERFLOW_ROLE_META, overflowRoleMeta, participationForEvent, BUILTIN_EVENTS, GAMES, SLOT_META, OUTRIGHT_MULT, SIZES, AIRLINES, CHIP_GRAY, CHIP_COLORS, CHIP_SKINS, EDITION, LOGISTICS, EMPTY_STATE, RESET_PROGRESS_PRESERVED_KEYS, disp, shuffle, snakeTeam, pokerLive, stacksPosted, CHIP_MIN, POKER_CONFIG, ROUND_NAMES, bracketChampion, EVENT_PHASE_LABELS, eventOpOf, bracketStarted, stagesStarted, needsStageSetup, lifecycleAction;
var init_core = __esm({
  "shared/core.js"() {
    ROSTER_CONFIG = [
      { id: "Brandon", name: "Brandon", status: "confirmed" },
      { id: "Evan", name: "Evan", status: "confirmed" },
      { id: "Eyob", name: "Eyob", status: "confirmed" },
      { id: "Sahil", name: "Sahil", status: "confirmed" },
      { id: "Khoa", name: "Khoa", status: "confirmed" },
      { id: "Chinh", name: "Chinh", status: "confirmed" },
      { id: "Adi", name: "Adi", status: "confirmed" },
      { id: "Chiang", name: "Chiang", status: "confirmed" },
      { id: "Richard", name: "Richard", status: "confirmed" },
      { id: "Allan", name: "Allan", status: "confirmed" },
      { id: "Henry", name: "Henry", status: "confirmed" },
      { id: "Ben", name: "Ben", status: "confirmed" },
      { id: "Jeremy", name: "Jeremy", status: "confirmed" }
    ];
    ROSTER_STATUSES = ["confirmed", "pending", "out"];
    rosterPlayers = (config = ROSTER_CONFIG, statuses = ["confirmed"]) => {
      const allowed = new Set(statuses);
      return config.filter((player) => allowed.has(player.status)).map((player) => player.id);
    };
    ALL_PLAYERS = rosterPlayers(ROSTER_CONFIG, ROSTER_STATUSES);
    ROSTER = rosterPlayers();
    isActivePlayer = (id) => ROSTER.includes(id);
    PT = 100;
    START = 10 * PT;
    MAX_RISK = 5 * PT;
    BUYIN_FLOOR = 6 * PT;
    maxRisk = (pts) => Math.max(MAX_RISK, Math.floor(pts / 2 / PT) * PT);
    AWARDS = { 400: [400, 0, 0], 800: [800, 400, 0], 1200: [1200, 800, 400], 1600: [1600, 800, 400] };
    SPORTS = [
      { id: "bball", label: "Basketball", group: "sport" },
      { id: "volley", label: "Volleyball", group: "sport" },
      { id: "spike", label: "Spikeball", group: "sport" },
      { id: "golf", label: "Putting", group: "sport" },
      { id: "pool", label: "Pool", group: "sport" },
      { id: "pingpong", label: "Ping Pong", group: "sport" },
      { id: "foosball", label: "Foosball", group: "sport" },
      { id: "pickleball", label: "Pickleball", group: "sport" },
      { id: "kart", label: "Mario Kart", group: "drink" },
      { id: "pong", label: "Beer Pong", group: "drink" },
      { id: "die", label: "Beer Die", group: "drink" },
      { id: "flip", label: "Flip Cup", group: "drink" },
      { id: "cage", label: "Rage Cage", group: "drink" }
    ];
    RATINGS = [
      { v: 1, label: "Never played" },
      { v: 1.5, label: "Rough" },
      { v: 2, label: "Average" },
      { v: 3, label: "Solid" },
      { v: 4, label: "Elite" }
    ];
    SESSIONS = [
      { id: "fri", label: "Friday Night", tag: "400 PTS" },
      { id: "sam", label: "Saturday Morning", tag: "800 PTS" },
      { id: "sap", label: "Saturday Afternoon", tag: "1200 PTS" },
      { id: "san", label: "Saturday Night", tag: "1600 PTS" },
      { id: "fin", label: "The Finale", tag: "POKER" }
    ];
    RAW_BUILTIN_EVENTS = [
      /* ── Friday night · 400 pts ── */
      {
        id: "putt",
        n: 1,
        session: "fri",
        value: 400,
        name: "Long Putt",
        kind: "solo",
        sport: "golf",
        game: "putting",
        desc: "Three attempts from one spot. Closest wins. A sunk putt beats everything. Ties: sudden death."
      },
      {
        id: "8ball",
        n: 2,
        session: "fri",
        value: 400,
        name: "8-Ball Doubles",
        kind: "pairs",
        sport: "pool",
        game: "8ball",
        teamCfg: { teams: 6, size: 2, bracket: 6 },
        desc: "Single elimination. One rack per matchup, alternating shots. Ball-in-hand on scratches."
      },
      {
        id: "pong",
        n: 3,
        session: "fri",
        value: 400,
        name: "Beer Pong Doubles",
        kind: "pairs",
        sport: "pong",
        game: "pong",
        teamCfg: { teams: 6, size: 2, bracket: 6 },
        desc: "Single elimination. Six cups, one re-rack. Bounce counts two, can be swatted. Redemption in semis and final."
      },
      {
        id: "die",
        n: 4,
        session: "fri",
        value: 400,
        name: "Beer Die",
        kind: "pairs",
        sport: "die",
        game: "die",
        teamCfg: { teams: 6, size: 2, bracket: 6 },
        desc: "Single elimination doubles. Toss the die over the line, they catch off the bounce. Sink it in a cup for the instant kill."
      },
      /* ── Saturday morning · 800 pts ── */
      {
        id: "bball",
        n: 5,
        session: "sam",
        value: 800,
        name: "3v3 Basketball",
        kind: "team",
        sport: "bball",
        game: "basketball",
        variant: "3v3",
        teamCfg: { teams: 4, size: 3, bracket: 4 },
        desc: "Half court to 7 by 1s and 2s, win by 1. Call your own fouls."
      },
      {
        id: "spike",
        n: 6,
        session: "sam",
        value: 800,
        name: "Spikeball Doubles",
        kind: "pairs",
        sport: "spike",
        game: "spikeball",
        teamCfg: { teams: 6, size: 2 },
        stageCfg: { kind: "pools", nGroups: 2, advance: 1 },
        desc: "Two pools, winners meet in the final. To 11, win by 2, cap 15."
      },
      {
        id: "pingpong",
        n: 7,
        session: "sam",
        value: 800,
        name: "Ping Pong",
        kind: "solo",
        sport: "pingpong",
        game: "pingpong",
        stageCfg: { kind: "heats", nGroups: 3, advance: 1 },
        desc: "Round-robin heats, then a final. Games to 11, win by 2, serve switches every two."
      },
      {
        id: "foosball",
        n: 8,
        session: "sam",
        value: 800,
        name: "Foosball",
        kind: "pairs",
        sport: "foosball",
        game: "foosball",
        teamCfg: { teams: 6, size: 2, bracket: 6 },
        desc: "Single elimination doubles. Split the rods, no spinning, first to 10 goals."
      },
      /* ── Saturday afternoon · 1200 pts ── */
      {
        id: "volley",
        n: 9,
        session: "sap",
        value: 1200,
        name: "Sand Volleyball",
        kind: "team",
        sport: "volley",
        game: "volleyball",
        teamCfg: { teams: 2, size: 6 },
        desc: "Best 2 of 3 sets to 15, win by 2, cap 17. Rotate servers."
      },
      {
        id: "nine",
        n: 10,
        session: "sap",
        value: 1200,
        name: "Nine-Hole Putting",
        kind: "solo",
        sport: "golf",
        game: "putting",
        desc: "Nine holes, lowest total strokes. Max 5 per hole."
      },
      {
        id: "bball1",
        n: 11,
        session: "sap",
        value: 1200,
        name: "1v1 Basketball",
        kind: "solo",
        sport: "bball",
        game: "basketball",
        variant: "1v1",
        stageCfg: { kind: "heats", nGroups: 3, advance: 1 },
        desc: "Round-robin heats, then a final. Ones to 5, make it take it, win by 1."
      },
      {
        id: "pickleball",
        n: 12,
        session: "sap",
        value: 1200,
        name: "Pickleball",
        kind: "pairs",
        sport: "pickleball",
        game: "pickleball",
        teamCfg: { teams: 6, size: 2, bracket: 6 },
        desc: "Single elimination doubles. Serve deep, stay out of the kitchen, rally it out. Games to 11, win by 2."
      },
      /* ── Saturday night · 1600 pts ── */
      {
        id: "flip",
        n: 13,
        session: "san",
        value: 1600,
        name: "Flip Cup",
        kind: "team",
        sport: "flip",
        game: "flipcup",
        teamCfg: { teams: 2, size: 6 },
        desc: "Best of 3. Flip clean, next teammate goes."
      },
      {
        id: "beerio",
        n: 14,
        session: "san",
        value: 1600,
        name: "Beerio Kart",
        kind: "solo",
        sport: "kart",
        game: "beerio",
        stageCfg: { kind: "heats", nGroups: 4, advance: 1 },
        desc: "Heats of four, then a final. Crack a beer at the line, pull over to drink, finish it before you cross. Highest total wins."
      },
      {
        id: "bball5",
        n: 15,
        session: "san",
        value: 1600,
        name: "5v5 Full Court",
        kind: "team",
        sport: "bball",
        game: "basketball",
        variant: "5v5",
        teamCfg: { teams: 2, size: 5 },
        desc: "Full court, five a side. Twos and threes on the clock. Ahead at the horn wins."
      },
      {
        id: "ragecage",
        n: 16,
        session: "san",
        value: 1600,
        name: "Rage Cage",
        kind: "solo",
        sport: "cage",
        game: "ragecage",
        desc: "Everyone circles the cups, two balls in play. Sink and stack, get stacked on and you are out. Last one standing wins."
      },
      {
        id: "gauntlet",
        n: 17,
        session: "san",
        value: 1600,
        name: "The Gauntlet",
        kind: "solo",
        game: "gauntlet",
        desc: "One timed circuit: pressure putt, flip your cup, pong shot, die toss, center cup. Fastest clean runs take it."
      },
      /* ── The Finale · poker. No value: the result carries chip stacks that
         BECOME the standings, it never pays awards. ── */
      {
        id: "poker",
        n: 18,
        session: "fin",
        name: "Championship Poker",
        kind: "solo",
        finale: true,
        game: "poker",
        desc: "Your points are your stack, dealt out in chips. No-limit hold'em, blinds on the clock. Final chip counts are the final standings."
      }
    ];
    OVERFLOW_ROLES = ["referee", "scorekeeper", "photographer", "on-deck", "sit-out"];
    OVERFLOW_ROLE_META = Object.freeze({
      referee: Object.freeze({
        label: "Event official",
        short: "Official",
        detail: "Calls rules and settles close plays."
      }),
      scorekeeper: Object.freeze({
        label: "Scorekeeper",
        short: "Score",
        detail: "Tracks the score and reports the finish."
      }),
      photographer: Object.freeze({
        label: "Photographer",
        short: "Camera",
        detail: "Captures the matchup and the winner."
      }),
      "on-deck": Object.freeze({
        label: "On-deck lead",
        short: "Next up",
        detail: "Keeps the next matchup ready to go."
      }),
      "sit-out": Object.freeze({
        label: "Event host",
        short: "Host",
        detail: "Resets the station and keeps play moving."
      })
    });
    overflowRoleMeta = (role) => OVERFLOW_ROLE_META[role] || OVERFLOW_ROLE_META["sit-out"];
    participationForEvent = (ev) => {
      if (ev?.participation) return ev.participation;
      if (ev?.teamCfg) return {
        type: "strict-teams",
        teams: ev.teamCfg.teams,
        size: ev.teamCfg.size,
        allowSitOut: true,
        overflowRoles: OVERFLOW_ROLES
      };
      return { type: "all", allowSitOut: false, overflowRoles: [] };
    };
    BUILTIN_EVENTS = RAW_BUILTIN_EVENTS.map((ev) => ({
      ...ev,
      participation: participationForEvent(ev)
    }));
    GAMES = {
      putting: { name: "Putting", howto: {
        players: "Solo",
        gear: ["Putter", "One ball"],
        objective: "Sink it, or finish closest to the pin.",
        steps: ["Set up at the marked spot.", "Putt for the hole, distance counts.", "Closest ball beats a miss, a make beats everything.", "Lowest strokes or closest putt wins, by event."],
        win: "Long Putt: closest of three attempts. Nine-Hole: fewest total strokes. Ties go to sudden death."
      } },
      "8ball": { name: "8-Ball", howto: {
        players: "Pairs",
        gear: ["Pool table", "Full rack", "Two cues"],
        objective: "Clear your group, then sink the 8.",
        steps: ["Break, then split stripes and solids.", "Partners alternate shots.", "Clear your group of seven. A scratch is ball in hand for them.", "Call and sink the 8 to win."],
        win: "First pair to legally pot the 8 takes the rack."
      } },
      pong: { name: "Beer Pong", howto: {
        players: "Pairs",
        gear: ["Table", "Ten cups", "Two balls"],
        objective: "Sink every cup on the far end first.",
        steps: ["Rack six, one re-rack on request.", "Both partners throw each turn.", "Bounces count two and can be swatted.", "Clear their last cup to win."],
        win: "First pair to sink all their cups wins.",
        house: "Redemption throw in the semis and final."
      } },
      die: { name: "Beer Die", howto: {
        players: "Pairs",
        gear: ["Table", "One die", "Four cups", "A pour"],
        objective: "Land the die in their cup, or make them flub the catch.",
        steps: ["Sit across the table, cups on your two corners.", "Toss the die up past head height and onto the far end.", "It has to bounce off the table, no darting it, no skying it.", "They catch it one-handed off the bounce, or you score.", "Sink it in a cup for the instant kill."],
        win: "First pair to the set score wins. Sinking the die ends it on the spot.",
        house: "Call your own height on the toss. A plunk means chug."
      } },
      basketball: { name: "Basketball", variants: [
        { id: "1v1", label: "1v1", howto: {
          players: "Solo, heats then a final",
          gear: ["Half court", "One ball"],
          objective: "Beat your man to five.",
          steps: ["Check the ball up top.", "Everything counts one.", "Make it, take it.", "Call your own fouls.", "First to five, win by one."],
          win: "First to five wins the game. Best record in your heat moves on."
        } },
        { id: "3v3", label: "3v3", howto: {
          players: "Teams of three",
          gear: ["Half court", "One ball"],
          objective: "Outscore them to seven.",
          steps: ["Check the ball up top.", "Score by ones and twos.", "Take it back past the arc on a turnover.", "Call your own fouls.", "First to seven, win by one."],
          win: "First team to seven wins."
        } },
        { id: "5v5", label: "5v5", howto: {
          players: "Two teams of five",
          gear: ["Full court", "One ball", "A clock"],
          objective: "Be ahead when the horn sounds.",
          steps: ["Tip off to start.", "Twos inside the arc, threes beyond it.", "Clear past half on a change of possession.", "Call your own fouls.", "Two halves, running clock."],
          win: "Ahead at the horn wins.",
          house: "No hard contact."
        } }
      ] },
      spikeball: { name: "Spikeball", howto: {
        players: "Pairs",
        gear: ["Spikeball net", "One ball"],
        objective: "Force them to miss the net.",
        steps: ["Serve to the returner.", "Three touches to hit the net back.", "Move any direction after the serve.", "A miss or bad hit ends the point."],
        win: "To eleven, win by two, cap fifteen."
      } },
      pingpong: { name: "Ping Pong", howto: {
        players: "Solo",
        gear: ["Table", "Paddles", "One ball"],
        objective: "Win points until eleven.",
        steps: ["Rally for serve, then serve two and hand it over.", "Serve must clear the net and bounce once each side.", "Let it bounce once on your side before returning.", "Games to eleven, win by two."],
        win: "Games to eleven, win by two. Best in the final takes it."
      } },
      foosball: { name: "Foosball", howto: {
        players: "Pairs",
        gear: ["Foosball table", "One ball"],
        objective: "Score on their goal, defend yours.",
        steps: ["Split the rods with your partner.", "Serve through the side hole.", "Pass and shoot. A full spin wipes the goal.", "Dead ball resets to the serve.", "Ball in their goal scores."],
        win: "First pair to ten goals wins."
      } },
      volleyball: { name: "Volleyball", howto: {
        players: "Two teams",
        gear: ["Sand court", "Net", "One ball"],
        objective: "Ground the ball on their side.",
        steps: ["Serve from behind the line.", "Three touches a side, clean contact only.", "Rotate on every side-out.", "Win the rally, win the point."],
        win: "Best two of three sets to fifteen, win by two, cap seventeen."
      } },
      pickleball: { name: "Pickleball", howto: {
        players: "Pairs",
        gear: ["Court", "Paddles", "One ball"],
        objective: "Win the rally without faulting in the kitchen.",
        steps: ["Serve underhand, cross court, past the kitchen.", "Let it bounce once each side before volleying.", "Stay out of the kitchen on volleys.", "Only the serving side scores."],
        win: "Games to eleven, win by two."
      } },
      flipcup: { name: "Flip Cup", howto: {
        players: "Two teams",
        gear: ["Cups", "A table", "A pour each"],
        objective: "Finish the line and flip clean before they do.",
        steps: ["Line up across the table.", "Drink it all, then set the cup on the edge.", "Flip it upright with one finger.", "Land it, the next teammate goes."],
        win: "First team down the line wins the round. Best of three."
      } },
      beerio: { name: "Beerio Kart", howto: {
        players: "Heats of four",
        gear: ["Switch", "Four controllers", "A beer each"],
        objective: "Win the race, but finish your beer to count.",
        steps: ["Draw into a heat of four.", "Crack a beer at the start line.", "Pull over to drink, no sipping while you steer.", "Finish the beer before the line, or sit there until it is gone."],
        win: "Best finishes advance to the final. Highest total wins."
      } },
      ragecage: { name: "Rage Cage", howto: {
        players: "Solo, last standing",
        gear: ["Ring of cups", "Center cup", "Two balls"],
        objective: "Never get caught holding a ball. Empty the ring before you.",
        steps: ["Everyone circles the cups, two balls in play.", "Bounce a ball into your cup, then pass it on.", "Make it in one, stack your cup on the player to your left.", "Get stacked on and you are out.", "Sink the center cup to end it. Last player standing wins."],
        win: "Last one standing takes 1st. Elimination order sets 2nd and 3rd."
      } },
      poker: { name: "Poker", howto: {
        players: "Everyone, one table",
        gear: ["Cards", "Chips", "The clock"],
        objective: "Finish with the biggest stack. Your points buy you in.",
        steps: ["Your points are your chips, dealt from the buy-in sheet.", "No-limit hold'em. Blinds rise on the clock, shown on the TV.", "Bust and you are out.", "When the last level ends, count your stack.", "Final chip counts are the final standings."],
        win: "Chip leader takes the championship. Elimination order settles the busts.",
        house: "No wagers, duels, or rulings while cards are live."
      } },
      gauntlet: { name: "The Gauntlet", howto: {
        players: "Solo, on the clock",
        gear: ["Putter", "Cups", "Pong ball", "One die"],
        objective: "Clear five stations faster than everyone else.",
        steps: ["Sink the pressure putt.", "Flip your cup clean.", "Hit a pong shot.", "Land a die on the table.", "Finish at the center cup. Miss a station, run it back."],
        win: "Fastest clean run takes 1st. The clock settles ties.",
        house: "One runner at a time. Someone times each run."
      } }
    };
    SLOT_META = [
      { label: "1st", team: "Winners", color: "var(--accent)" },
      { label: "2nd", team: "Runners-up", color: "var(--silver)" },
      { label: "3rd", team: "3rd place", color: "var(--bronze)" }
    ];
    OUTRIGHT_MULT = 2;
    SIZES = ["S", "M", "L", "XL", "XXL"];
    AIRLINES = ["WN", "AA", "UA", "DL", "AS", "B6", "NK", "F9"];
    CHIP_GRAY = "#6B6558";
    CHIP_COLORS = [
      { hex: "#C05B33" },
      { hex: "#D97742" },
      { hex: "#E39A3B", light: true },
      { hex: "#D89C2F", light: true },
      { hex: "#C9B25A", light: true },
      { hex: "#A8A03F", light: true },
      { hex: "#77804C" },
      { hex: "#4E6E39" },
      { hex: "#6E9450" },
      { hex: "#3F7D5C" },
      { hex: "#557B72" },
      { hex: "#2F7E83" },
      { hex: "#4F93A3" },
      { hex: "#3B6E9C" },
      { hex: "#5E7291" },
      { hex: "#6D6FA8" },
      { hex: "#7C5CA6" },
      { hex: "#8A4F62" },
      { hex: "#A6527C" },
      { hex: "#B23B5E" },
      { hex: "#B23B2E" },
      { hex: "#8E3B2F" },
      { hex: "#7A5C43" },
      { hex: "#A9663F" },
      { hex: "#B37A4A" },
      { hex: "#8C6A54" },
      { hex: "#6F6546" },
      { hex: "#4E4A3C" },
      { hex: "#9AA1A8", light: true },
      { hex: "#B9AF9B", light: true },
      { hex: "#D1C0A0", light: true },
      { hex: "#E3D7BD", light: true }
    ];
    CHIP_SKINS = [
      "ticks",
      "plain",
      "dash",
      "quad",
      "dots",
      "ring",
      "saw",
      "flame",
      "star",
      "bolt",
      "wave",
      "crown"
    ];
    EDITION = { long: "October 30 to November 1, 2026", short: "Oct 30 to Nov 1" };
    LOGISTICS = {
      v: 2,
      venue: "10848 North Aberdeen Road, Scottsdale, AZ",
      venueNote: "",
      airport: "PHX",
      airportName: "Phoenix Sky Harbor",
      checkIn: "Fri Oct 30, 4:00 PM",
      checkOut: "Sun Nov 1, 10:00 AM",
      hostIn: { air: "WN", num: "4663", time: "08:40" },
      hostOut: { air: "UA", num: "1885", time: "20:37" }
    };
    EMPTY_STATE = {
      v: 9,
      live: false,
      results: {},
      wagers: [],
      wagerOps: {},
      adjustments: [],
      seeds: {},
      draws: {},
      brackets: {},
      stages: {},
      drafts: {},
      duels: [],
      poker: null,
      profiles: {},
      customEvents: [],
      shelved: {},
      onDeck: null,
      frozen: false,
      onboardEpoch: 0,
      eventEdits: {},
      eventOrder: [],
      eventOps: {},
      showControl: { active: null, history: [] },
      logistics: { ...LOGISTICS },
      updatedAt: 0
    };
    RESET_PROGRESS_PRESERVED_KEYS = Object.freeze([
      "profiles",
      "seeds",
      "logistics",
      "onboardEpoch",
      "customEvents",
      "eventEdits",
      "eventOrder"
    ]);
    disp = (state, p) => state.profiles?.[p]?.display || p;
    shuffle = (arr) => {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };
    snakeTeam = (k, T) => {
      const r = Math.floor(k / T), p = k % T;
      return r % 2 === 0 ? p : T - 1 - p;
    };
    pokerLive = (state) => {
      const pk = state.poker;
      return !!(pk && pk.startedAt && !state.results[pk.id]);
    };
    stacksPosted = (state) => Object.values(state.results || {}).some((r) => r?.stacks);
    CHIP_MIN = 25;
    POKER_CONFIG = Object.freeze({
      minimumStack: BUYIN_FLOOR,
      stackQuantum: PT,
      countQuantum: CHIP_MIN,
      maxStack: null,
      rounding: "exact",
      denominations: Object.freeze([1e3, 500, 100, 25]),
      blindPack: Object.freeze({ denomination: 25, count: 8, minimumStack: 400 })
    });
    ROUND_NAMES = { 4: ["Semifinals", "Final"], 6: ["Play-in", "Semifinals", "Final"] };
    bracketChampion = (br) => {
      const last = br.rounds[br.rounds.length - 1][0];
      return last.winner ?? null;
    };
    EVENT_PHASE_LABELS = {
      scheduled: "Scheduled",
      setup: "Setup",
      "draw-pending": "Draw pending",
      "draw-revealed": "Draw revealed",
      "betting-open": "Betting open",
      "betting-locked": "Betting locked",
      "in-progress": "In progress",
      "result-entry": "Result entry",
      complete: "Complete",
      shelved: "Shelved"
    };
    eventOpOf = (state, evId) => state.eventOps?.[evId] || {};
    bracketStarted = (br) => !!br?.rounds?.some((round) => round.some((match) => match.winner !== null && match.winner !== void 0));
    stagesStarted = (st) => !!st && (st.finalWinner !== null && st.finalWinner !== void 0 || st.groups?.some((group) => (group.through || []).length > 0));
    needsStageSetup = (state, ev) => !!ev.stageCfg && !state.stages?.[ev.id] && !(!state.eventOps?.[ev.id]?.contest && (state.onDeck === ev.id || state.eventOps?.[ev.id]?.startedAt || state.eventOps?.[ev.id]?.bettingOpenedAt || state.eventOps?.[ev.id]?.bettingLockedAt || state.eventOps?.[ev.id]?.resultEntryAt));
    lifecycleAction = (type, label2, blockers = []) => ({
      type,
      label: label2,
      enabled: blockers.length === 0,
      blockers
    });
  }
});

// src/ui/theme.js
var DISPLAY, SANS, BONE, GOLD_GRAD, CARD_BG, label, pStyle;
var init_theme = __esm({
  "src/ui/theme.js"() {
    DISPLAY = "'Barlow Condensed','Arial Narrow',sans-serif";
    SANS = "'Inter',system-ui,sans-serif";
    BONE = "var(--bone)";
    GOLD_GRAD = "var(--sun)";
    CARD_BG = "var(--paper)";
    label = { fontFamily: SANS, fontWeight: 700, fontSize: 11, letterSpacing: "0.07em", color: "var(--muted)", textTransform: "uppercase" };
    pStyle = { fontFamily: SANS, fontSize: 14, lineHeight: 1.6, color: "var(--muted2)", marginBottom: 14 };
  }
});

// src/ui/controls.jsx
import React, { useState, useEffect, useRef } from "react";
function Tag({ children, tone = "dim", style }) {
  const tones = {
    dim: { color: "var(--muted)", background: "var(--ink-tint)" },
    gold: { color: "var(--accent2)", background: "var(--accent-tint)" },
    flame: { color: "var(--live2)", background: "rgba(192,71,58,0.14)" },
    green: { color: "var(--green)", background: "var(--green-tint)" }
  };
  return /* @__PURE__ */ React.createElement("span", { style: {
    fontFamily: SANS,
    fontWeight: 700,
    fontSize: 11,
    letterSpacing: "0.05em",
    padding: "3px 8px",
    borderRadius: 6,
    textTransform: "uppercase",
    ...tones[tone],
    ...style
  } }, children);
}
function ActionButton({ children, onClick, variant = "primary", pending, disabled, compact, style, ...props }) {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const waiting = !!pending || busy;
  const off = disabled || waiting;
  const handle = (event) => {
    if (off || busyRef.current || !onClick) return;
    busyRef.current = true;
    const finish = () => {
      busyRef.current = false;
      setBusy(false);
    };
    try {
      const result = onClick(event);
      if (result && typeof result.then === "function") {
        setBusy(true);
        return Promise.resolve(result).then((value) => {
          finish();
          return value;
        }, finish);
      }
      busyRef.current = false;
      return result;
    } catch (error) {
      busyRef.current = false;
      throw error;
    }
  };
  return /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: handle,
      disabled: off,
      "aria-busy": waiting || void 0,
      ...props,
      style: {
        fontFamily: SANS,
        fontWeight: 600,
        letterSpacing: "0",
        fontSize: compact ? 12 : 13,
        padding: compact ? "8px 11px" : "12px 16px",
        borderRadius: 6,
        minHeight: compact ? 44 : 48,
        cursor: off ? "default" : "pointer",
        opacity: disabled ? 0.35 : waiting ? 0.6 : 1,
        transition: "transform .1s, opacity .15s",
        ...ACTION_VARIANTS[variant],
        ...style
      }
    },
    children
  );
}
function IconButton({ label: label2, onClick, size = 38, selected, disabled, style, children, ...props }) {
  return /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick,
      disabled,
      "aria-label": label2,
      title: label2,
      ...props,
      style: {
        width: size,
        height: size,
        borderRadius: 5,
        flexShrink: 0,
        cursor: disabled ? "default" : "pointer",
        background: selected ? "var(--sun)" : "transparent",
        border: "1px solid " + (selected ? "var(--sun)" : "var(--line)"),
        color: selected ? "var(--ink0)" : "var(--ink)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.35 : 1,
        ...style
      }
    },
    children
  );
}
function Btn({ kind = "primary", ...props }) {
  return /* @__PURE__ */ React.createElement(ActionButton, { variant: BTN_KIND_VARIANT[kind], ...props });
}
function Sheet({ title, subtitle, headerActions, onClose, onBack, children, wide, busy = false, className = "", layer = 100 }) {
  const dialog = useRef(null);
  const current = useRef({ busy, onClose });
  current.current = { busy, onClose };
  useEffect(() => {
    const previousFocus = document.activeElement;
    if (!openSheets++) {
      pageOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    const node = dialog.current;
    node?.focus({ preventScroll: true });
    const keys = (event) => {
      const sheets = document.querySelectorAll('[aria-modal="true"]');
      if (sheets[sheets.length - 1] !== node) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (!current.current.busy) current.current.onClose?.();
      }
      if (event.key !== "Tab") return;
      const focusable = [...node.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]')].filter((element) => element.getClientRects().length && !element.closest("[inert]"));
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (!first) {
        event.preventDefault();
        node.focus();
      } else if (!focusable.includes(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", keys);
    return () => {
      document.removeEventListener("keydown", keys);
      if (!--openSheets) document.body.style.overflow = pageOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);
  return /* @__PURE__ */ React.createElement("div", { className: "fd-sheet-overlay", onClick: busy ? void 0 : onClose, style: { zIndex: layer } }, /* @__PURE__ */ React.createElement(
    "div",
    {
      ref: dialog,
      tabIndex: -1,
      onClick: (e) => e.stopPropagation(),
      className: `si-sheet${wide ? " is-wide" : ""} ${className}`,
      role: "dialog",
      "aria-modal": "true",
      "aria-label": title,
      "aria-busy": busy || void 0
    },
    /* @__PURE__ */ React.createElement("div", { className: "fd-sheet-header" }, onBack && /* @__PURE__ */ React.createElement(
      IconButton,
      {
        label: "Back",
        onClick: onBack,
        size: 44,
        disabled: busy,
        style: { fontSize: 18, marginLeft: -6 }
      },
      "\u2039"
    ), /* @__PURE__ */ React.createElement("div", { className: "fd-sheet-heading" }, /* @__PURE__ */ React.createElement("div", null, title), subtitle && /* @__PURE__ */ React.createElement("small", null, subtitle)), headerActions && /* @__PURE__ */ React.createElement("div", { className: "fd-sheet-header-actions" }, headerActions), /* @__PURE__ */ React.createElement(IconButton, { label: "Close", onClick: onClose, size: 44, disabled: busy, style: { fontSize: 14 } }, "\u2715")),
    /* @__PURE__ */ React.createElement("div", { className: "fd-sheet-body" }, children)
  ));
}
var ACTION_VARIANTS, BTN_KIND_VARIANT, openSheets, pageOverflow;
var init_controls = __esm({
  "src/ui/controls.jsx"() {
    init_theme();
    ACTION_VARIANTS = {
      primary: { background: "var(--action-fill)", color: "var(--action-ink)", border: "1px solid var(--action-fill)" },
      secondary: { background: "var(--paper)", color: "var(--ink)", border: "1px solid var(--line)" },
      tertiary: { background: "var(--paper)", color: "var(--muted2)", border: "1px solid var(--line)" },
      destructive: { background: "var(--paper)", color: "var(--clay)", border: "1px solid var(--line)" },
      commit: { background: "var(--clay)", color: BONE, border: "1.5px solid var(--ink0)" }
    };
    BTN_KIND_VARIANT = { primary: "primary", dark: "secondary", ghost: "tertiary", danger: "destructive", flame: "commit" };
    openSheets = 0;
    pageOverflow = "";
  }
});

// src/features/identity/playerIdentity.js
function resolvePlayerIdentity(profiles, player) {
  const profile = profiles?.[player];
  const claimedColor = CHIP_COLORS.find((color) => color.hex === profile?.color);
  const rosterIndex = ROSTER.indexOf(player);
  return {
    color: claimedColor?.hex ?? CHIP_GRAY,
    isLight: !!claimedColor?.light,
    skin: CHIP_SKINS.includes(profile?.skin) ? profile.skin : "ticks",
    num: profile?.num ?? (rosterIndex < 0 ? null : rosterIndex + 1)
  };
}
var init_playerIdentity = __esm({
  "src/features/identity/playerIdentity.js"() {
    init_core();
  }
});

// src/features/identity/PlayerIdentityContext.js
import { createContext, createElement, useContext } from "react";
function PlayerIdentityProvider({ profiles, children }) {
  return createElement(PlayerIdentityContext.Provider, { value: profiles ?? null }, children);
}
function usePlayerIdentity(player) {
  const profiles = useContext(PlayerIdentityContext);
  if (profiles === void 0) {
    throw new Error("Player identity must render inside PlayerIdentityProvider.");
  }
  return resolvePlayerIdentity(profiles, player);
}
var PlayerIdentityContext;
var init_PlayerIdentityContext = __esm({
  "src/features/identity/PlayerIdentityContext.js"() {
    init_playerIdentity();
    PlayerIdentityContext = createContext(void 0);
  }
});

// src/features/identity/PlayerIdentity.jsx
import React3, { useId } from "react";
function Avatar({ state, p, size = 34, ring, style }) {
  const prof = state.profiles?.[p];
  const src = prof?.photoV ? `/api/photo/${encodeURIComponent(p)}?v=${prof.photoV}` : null;
  const initials = (prof?.display || p).slice(0, 2).toUpperCase();
  const identity = usePlayerIdentity(p);
  const c = identity.color;
  return /* @__PURE__ */ React3.createElement("div", { style: {
    width: size,
    height: size,
    borderRadius: "50%",
    flexShrink: 0,
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: src ? "var(--paper2)" : c,
    position: "relative",
    border: ring ? "2px solid var(--bone)" : "1.5px solid rgba(23,16,9,0.6)",
    ...style
  } }, src ? /* @__PURE__ */ React3.createElement("img", { src, alt: "", style: { width: "100%", height: "100%", objectFit: "cover" } }) : /* @__PURE__ */ React3.createElement(React3.Fragment, null, /* @__PURE__ */ React3.createElement("div", { style: {
    position: "absolute",
    inset: 0,
    background: "linear-gradient(135deg, transparent 40%, rgba(251,243,228,0.26) 40%, rgba(251,243,228,0.26) 62%, transparent 62%)"
  } }), /* @__PURE__ */ React3.createElement("span", { style: {
    position: "relative",
    fontFamily: DISPLAY,
    fontWeight: 700,
    fontStyle: "italic",
    fontSize: size * 0.44,
    letterSpacing: "0.03em",
    color: identity.isLight ? "var(--ink0)" : BONE
  } }, initials)));
}
function AvatarStack({ state, players, size = 24, max = 4 }) {
  const show = players.slice(0, max);
  const extra = players.length - show.length;
  return /* @__PURE__ */ React3.createElement("div", { style: { display: "flex", alignItems: "center" } }, show.map((p, pi) => /* @__PURE__ */ React3.createElement(Avatar, { key: p, state, p, size, style: { marginLeft: pi > 0 ? -size * 0.32 : 0 } })), extra > 0 && /* @__PURE__ */ React3.createElement("div", { style: {
    width: size,
    height: size,
    borderRadius: "50%",
    marginLeft: -size * 0.32,
    background: "var(--paper2)",
    border: "1.5px solid var(--line)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: SANS,
    fontWeight: 700,
    fontSize: size * 0.4,
    color: "var(--muted)",
    flexShrink: 0
  } }, "+", extra));
}
function ChipFace({
  p,
  size = 18,
  empty,
  stamp: stampOverride,
  skin: skinOverride,
  color: colorOverride,
  isLight: lightOverride,
  valueRing = false
}) {
  const clipId = `chip-edge-${useId().replace(/:/g, "")}`;
  const identity = usePlayerIdentity(p);
  if (empty) return /* @__PURE__ */ React3.createElement("div", { style: {
    width: size,
    height: size,
    borderRadius: "50%",
    border: "1.5px dashed var(--muted)",
    opacity: 0.45,
    flexShrink: 0
  } });
  const color = colorOverride || identity.color;
  const light = lightOverride ?? identity.isLight;
  const skin = skinOverride || identity.skin;
  const skinInk = light ? "var(--ink0)" : "var(--chip-mark)";
  const inlay = light ? "rgba(42,33,25,0.08)" : "rgba(251,243,228,0.10)";
  const inlayLine = light ? "rgba(42,33,25,0.38)" : "rgba(251,243,228,0.36)";
  const num = identity.num;
  const stamp = stampOverride != null ? stampOverride : num;
  return /* @__PURE__ */ React3.createElement(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 32 32",
      "aria-hidden": "true",
      style: {
        flexShrink: 0,
        display: "block",
        filter: size >= 32 ? "drop-shadow(0 2px 2px rgba(0,0,0,.22))" : "none"
      }
    },
    /* @__PURE__ */ React3.createElement("defs", null, /* @__PURE__ */ React3.createElement("clipPath", { id: clipId }, /* @__PURE__ */ React3.createElement("circle", { cx: "16", cy: "16", r: "14.7" }))),
    /* @__PURE__ */ React3.createElement("circle", { cx: "16", cy: "16", r: "14.7", fill: color, stroke: "var(--ink0)", strokeWidth: "1.45" }),
    /* @__PURE__ */ React3.createElement("circle", { cx: "16", cy: "16", r: "13.25", fill: "none", stroke: inlayLine, strokeWidth: ".65", opacity: ".72" }),
    /* @__PURE__ */ React3.createElement("g", { clipPath: `url(#${clipId})` }, chipMarks(skin, 16, 12.4, skinInk)),
    /* @__PURE__ */ React3.createElement("circle", { cx: "16", cy: "16", r: "8.75", fill: inlay, stroke: inlayLine, strokeWidth: ".8" }),
    /* @__PURE__ */ React3.createElement(
      "path",
      {
        d: "M7.4 9.4A10.8 10.8 0 0 1 24.6 9.4",
        fill: "none",
        stroke: "rgba(255,255,255,.38)",
        strokeWidth: ".75",
        strokeLinecap: "round",
        opacity: ".65"
      }
    ),
    /* @__PURE__ */ React3.createElement(
      "path",
      {
        d: "M24.6 22.6A10.8 10.8 0 0 1 7.4 22.6",
        fill: "none",
        stroke: "rgba(23,16,9,.45)",
        strokeWidth: ".7",
        strokeLinecap: "round",
        opacity: ".55"
      }
    ),
    valueRing && /* @__PURE__ */ React3.createElement(
      "circle",
      {
        cx: "16",
        cy: "16",
        r: "7.25",
        fill: "none",
        strokeWidth: ".8",
        stroke: light ? "var(--ink0)" : "var(--bone)",
        opacity: ".48"
      }
    ),
    size >= 20 && stamp != null && /* @__PURE__ */ React3.createElement(
      "text",
      {
        x: "16",
        y: "16.8",
        textAnchor: "middle",
        dominantBaseline: "central",
        fontFamily: DISPLAY,
        fontWeight: "700",
        fontSize: valueRing && stamp >= 100 ? 8.7 : 11.7,
        fill: light ? "var(--ink0)" : "var(--bone)"
      },
      stamp
    )
  );
}
function BankChip({ p, size = 18, empty, val }) {
  return /* @__PURE__ */ React3.createElement(ChipFace, { p, size, empty, stamp: val, valueRing: val != null });
}
var chipMarks;
var init_PlayerIdentity = __esm({
  "src/features/identity/PlayerIdentity.jsx"() {
    init_theme();
    init_PlayerIdentityContext();
    chipMarks = (skin, cx = 16, edge = 12.4, ink = "var(--chip-mark)") => {
      const pt = (r, deg) => {
        const a = deg * Math.PI / 180;
        return [cx + Math.cos(a) * r, cx + Math.sin(a) * r];
      };
      const lines = (n, off, r1, r2, w) => Array.from({ length: n }, (_, i) => {
        const [x1, y1] = pt(r1, i * (360 / n) + off), [x2, y2] = pt(r2, i * (360 / n) + off);
        return /* @__PURE__ */ React3.createElement(
          "line",
          {
            key: i,
            x1,
            y1,
            x2,
            y2,
            stroke: ink,
            strokeWidth: w,
            strokeLinecap: "round"
          }
        );
      });
      if (skin === "plain") return null;
      if (skin === "dash") return /* @__PURE__ */ React3.createElement(
        "circle",
        {
          cx,
          cy: cx,
          r: edge - 1.1,
          fill: "none",
          stroke: ink,
          strokeWidth: "3",
          strokeDasharray: "8.4 11.4",
          strokeLinecap: "butt"
        }
      );
      if (skin === "ring") return /* @__PURE__ */ React3.createElement(React3.Fragment, null, /* @__PURE__ */ React3.createElement("circle", { cx, cy: cx, r: edge - 2.5, fill: "none", stroke: ink, strokeWidth: "1.15" }), /* @__PURE__ */ React3.createElement("circle", { cx, cy: cx, r: edge - 4.4, fill: "none", stroke: ink, strokeWidth: ".8", opacity: ".8" }));
      if (skin === "quad") return lines(4, 0, edge - 3.6, edge + 0.6, 3.4);
      if (skin === "dots") return Array.from({ length: 12 }, (_, i) => {
        const [x, y] = pt(edge - 1.45, i * 30 + 15);
        return /* @__PURE__ */ React3.createElement("circle", { key: i, cx: x, cy: y, r: "1.08", fill: ink });
      });
      const around = (n, d, r, spin = 0) => Array.from({ length: n }, (_, i) => {
        const a = i * (360 / n) + spin, [x, y] = pt(r, a);
        return /* @__PURE__ */ React3.createElement(
          "path",
          {
            key: i,
            d,
            fill: ink,
            transform: `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${a + 90})`
          }
        );
      });
      if (skin === "saw") {
        const n = 11, p2 = [];
        for (let i = 0; i < n * 2; i++) {
          const [x, y] = pt(i % 2 ? edge - 3.6 : edge + 0.5, i * (180 / n) - 90);
          p2.push(`${x.toFixed(2)},${y.toFixed(2)}`);
        }
        return /* @__PURE__ */ React3.createElement(
          "polygon",
          {
            points: p2.join(" "),
            fill: "none",
            stroke: ink,
            strokeWidth: "1.5",
            strokeLinejoin: "round"
          }
        );
      }
      if (skin === "flame") return around(
        6,
        "M0 -3.9C1.9 -1.5 2.3 -0.5 2.3 0.6 2.3 2.1 1.3 3 0 3S-2.3 2.1 -2.3 0.6C-2.3-0.5-1.9-1.5 0-3.9Z",
        edge - 0.6
      );
      if (skin === "star") return around(
        6,
        "M0 -3C0.35-0.9 0.55-0.7 2.7-0.35 0.55 0 0.35 0.2 0 2.3c-0.35-2.1-0.55-2.3-2.7-2.65C-0.55-0.7-0.35-0.9 0-3Z",
        edge - 0.9
      );
      if (skin === "bolt") return around(6, "M-2.7-2.4 0 .2 2.7-2.4 2.7.2 0 2.9-2.7.2 0-2.4Z", edge - 0.8);
      if (skin === "wave") {
        const n = 60, d = [];
        for (let i = 0; i <= n; i++) {
          const [x, y] = pt(edge - 1.9 + Math.sin(i / n * Math.PI * 14) * 1.5, i * (360 / n));
          d.push(`${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`);
        }
        return /* @__PURE__ */ React3.createElement("path", { d: d.join(" "), fill: "none", stroke: ink, strokeWidth: "1.5" });
      }
      if (skin === "crown") return /* @__PURE__ */ React3.createElement(
        "path",
        {
          d: "M-6.2 3.4 -5-3.6-2.1-0.9 0-5.2 2.1-0.9 5-3.6 6.2 3.4Z",
          fill: ink,
          transform: `translate(${cx} ${cx - 8.3})`
        }
      );
      return lines(8, 22.5, edge - 3, edge + 0.6, 2.4);
    };
  }
});

// src/features/travel/travel.css
var init_travel = __esm({
  "src/features/travel/travel.css"() {
  }
});

// src/features/travel/Travel.jsx
import React16, { useState as useState8 } from "react";
function TravelMap() {
  const arc = (c) => {
    const mx = (c.x + TRAVEL_DEST.x) / 2;
    const lift = 9 + Math.abs(c.x - TRAVEL_DEST.x) * 0.3;
    return `M${c.x} ${c.y} Q${mx} ${Math.min(c.y, TRAVEL_DEST.y) - lift} ${TRAVEL_DEST.x} ${TRAVEL_DEST.y}`;
  };
  return /* @__PURE__ */ React16.createElement(
    "svg",
    {
      viewBox: "-5 -3 110 104",
      width: "100%",
      height: "100%",
      preserveAspectRatio: "xMidYMid meet",
      "aria-hidden": "true",
      style: { display: "block", overflow: "hidden", maxWidth: "100%", maxHeight: "100%" }
    },
    /* @__PURE__ */ React16.createElement("g", { style: { animation: "si-fade .8s ease-out both" } }, US_DOTS.map(([x, y], i) => /* @__PURE__ */ React16.createElement("circle", { key: i, cx: x, cy: y, r: "0.62", fill: "var(--muted)", opacity: "0.45" }))),
    TRAVEL_CITIES.map((c, i) => /* @__PURE__ */ React16.createElement(
      "path",
      {
        key: "r" + c.n,
        d: arc(c),
        fill: "none",
        stroke: "var(--accent2)",
        strokeWidth: "0.8",
        strokeLinecap: "round",
        strokeDasharray: "140",
        pathLength: "140",
        style: { "--len": 140, animation: `si-route 1.1s ease-out ${0.3 + i * 0.18}s both` }
      }
    )),
    TRAVEL_CITIES.map((c, i) => /* @__PURE__ */ React16.createElement(
      "circle",
      {
        className: "fd-travel-motion",
        key: "m" + c.n,
        r: "1.7",
        fill: "var(--sun)",
        stroke: "var(--ink0)",
        strokeWidth: "0.5",
        opacity: "0"
      },
      /* @__PURE__ */ React16.createElement("set", { attributeName: "opacity", to: "1", begin: `${1.2 + i * 0.18}s` }),
      /* @__PURE__ */ React16.createElement("animateMotion", { dur: "3.6s", begin: `${1.2 + i * 0.18}s`, repeatCount: "indefinite", path: arc(c) })
    )),
    TRAVEL_CITIES.map((c, i) => /* @__PURE__ */ React16.createElement("g", { key: c.n, style: { animation: `si-in .4s ease-out ${i * 0.18}s both` } }, /* @__PURE__ */ React16.createElement("circle", { cx: c.x, cy: c.y, r: "1.9", fill: "var(--paper)", stroke: "var(--bone)", strokeWidth: "0.9" }), /* @__PURE__ */ React16.createElement(
      "text",
      {
        x: c.x + c.dx,
        y: c.y + c.dy,
        textAnchor: c.a,
        fontFamily: SANS,
        fontWeight: "700",
        fontSize: "3.4",
        fill: "var(--muted2)",
        letterSpacing: "0.15"
      },
      c.n.toUpperCase()
    ))),
    /* @__PURE__ */ React16.createElement(
      "circle",
      {
        cx: TRAVEL_DEST.x,
        cy: TRAVEL_DEST.y,
        r: "4.6",
        fill: "none",
        stroke: "var(--sun)",
        strokeWidth: "0.9",
        style: { animation: "si-land 2.2s ease-in-out infinite" }
      }
    ),
    /* @__PURE__ */ React16.createElement("circle", { cx: TRAVEL_DEST.x, cy: TRAVEL_DEST.y, r: "2.8", fill: "var(--sun)", stroke: "var(--ink0)", strokeWidth: "0.8" }),
    /* @__PURE__ */ React16.createElement(
      "text",
      {
        x: TRAVEL_DEST.x,
        y: TRAVEL_DEST.y - 8,
        textAnchor: "middle",
        fontFamily: DISPLAY,
        fontWeight: "700",
        fontSize: "6",
        fill: "var(--signal-text, var(--sun))",
        letterSpacing: "0.3"
      },
      "SCOTTSDALE"
    )
  );
}
function HouseArt() {
  return /* @__PURE__ */ React16.createElement("div", { style: { position: "relative", aspectRatio: "16 / 9", background: "var(--paper2)", overflow: "hidden" } }, /* @__PURE__ */ React16.createElement(
    "img",
    {
      src: "/airbnb-compound-field-day.webp",
      alt: "",
      width: "1440",
      height: "810",
      loading: "eager",
      decoding: "async",
      style: {
        width: "100%",
        height: "100%",
        display: "block",
        objectFit: "cover",
        filter: "saturate(.94) contrast(1.02)"
      }
    }
  ));
}
function InfoCell({ lb, v, first }) {
  return /* @__PURE__ */ React16.createElement("div", { style: {
    flex: 1,
    minWidth: 0,
    padding: "11px 14px",
    borderLeft: first ? "none" : "1px solid var(--line)"
  } }, /* @__PURE__ */ React16.createElement("div", { style: { ...label, fontSize: 10, marginBottom: 4 } }, lb), /* @__PURE__ */ React16.createElement("div", { style: {
    fontFamily: SANS,
    fontWeight: 700,
    fontSize: 14,
    color: "var(--ink)",
    lineHeight: 1.35
  } }, v));
}
function VenueCard({ lg, compact = false }) {
  const mapUrl = lg.venue ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lg.venue)}` : null;
  const inL = cleanLeg(lg.hostIn), outL = cleanLeg(lg.hostOut);
  const hostLegs = [
    inL && ["Lands", inL.note || legTime(inL.time) && `Fri ${legTime(inL.time)}`],
    outL && ["Leaves", outL.note || legTime(outL.time) && `Sun ${legTime(outL.time)}`]
  ].filter((x) => x && x[1]);
  return /* @__PURE__ */ React16.createElement("div", null, /* @__PURE__ */ React16.createElement("div", { style: CARD }, !compact && /* @__PURE__ */ React16.createElement(HouseArt, null), /* @__PURE__ */ React16.createElement("div", { style: { padding: "12px 14px", borderTop: compact ? void 0 : "1px solid var(--line)" } }, /* @__PURE__ */ React16.createElement("div", { style: { ...label, marginBottom: 5 } }, "The house"), lg.venue && /* @__PURE__ */ React16.createElement("div", { style: {
    fontFamily: SANS,
    fontWeight: 600,
    fontSize: 15.5,
    lineHeight: 1.45,
    userSelect: "text",
    color: "var(--ink)"
  } }, lg.venue), lg.venueNote && /* @__PURE__ */ React16.createElement("div", { style: {
    fontFamily: SANS,
    fontSize: 13,
    color: "var(--muted2)",
    marginTop: 5,
    lineHeight: 1.5
  } }, lg.venueNote), mapUrl && /* @__PURE__ */ React16.createElement(
    "a",
    {
      href: mapUrl,
      target: "_blank",
      rel: "noreferrer",
      style: {
        display: "inline-flex",
        alignItems: "center",
        minHeight: 44,
        marginTop: 2,
        fontFamily: SANS,
        fontWeight: 700,
        fontSize: 12.5,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        color: "var(--accent2)",
        textDecoration: "none"
      }
    },
    "Open in maps \u203A"
  )), (lg.checkIn || lg.checkOut) && /* @__PURE__ */ React16.createElement("div", { style: { display: "flex", borderTop: "1px solid var(--line)" } }, /* @__PURE__ */ React16.createElement(InfoCell, { lb: "Check in", v: lg.checkIn || "TBD", first: true }), /* @__PURE__ */ React16.createElement(InfoCell, { lb: "Checkout", v: lg.checkOut || "TBD" }))), (lg.airport || hostLegs.length > 0) && /* @__PURE__ */ React16.createElement("div", { style: CARD }, lg.airport && /* @__PURE__ */ React16.createElement("div", { style: { display: "flex", alignItems: "center", gap: 14, padding: "12px 14px" } }, /* @__PURE__ */ React16.createElement(
    "svg",
    {
      width: "20",
      height: "20",
      viewBox: "0 0 24 24",
      fill: "var(--accent2)",
      "aria-hidden": "true",
      style: { flexShrink: 0 }
    },
    /* @__PURE__ */ React16.createElement("path", { d: "M2 4 22 12 2 20l4.6-8z" })
  ), /* @__PURE__ */ React16.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React16.createElement("div", { style: { ...label, fontSize: 10, marginBottom: 3 } }, "Fly into"), /* @__PURE__ */ React16.createElement("div", { style: { fontFamily: SANS, fontSize: 13, color: "var(--muted2)" } }, lg.airportName)), /* @__PURE__ */ React16.createElement("div", { style: {
    fontFamily: DISPLAY,
    fontWeight: 700,
    fontSize: 30,
    letterSpacing: "0.06em",
    color: "var(--signal-text, var(--sun))",
    lineHeight: 1
  } }, lg.airport)), hostLegs.length > 0 && /* the flight codes matter to nobody but Brandon; the times are how
     people work out who they are sharing a ride with */
  /* @__PURE__ */ React16.createElement("div", { style: { borderTop: lg.airport ? "1px solid var(--line)" : "none" } }, /* @__PURE__ */ React16.createElement("div", { style: { ...label, fontSize: 10, padding: "10px 14px 0" } }, "My flights"), /* @__PURE__ */ React16.createElement("div", { style: { display: "flex" } }, hostLegs.map(([lb, v], i) => /* @__PURE__ */ React16.createElement(InfoCell, { key: lb, lb, v, first: i === 0 }))))));
}
function FlightEntry({ leg: raw, dir, setLeg }) {
  const leg = raw || {};
  const set = (patch) => setLeg({ ...leg, ...patch });
  const box = {
    background: "var(--paper)",
    border: "1.5px solid var(--line)",
    borderRadius: 10,
    height: 48,
    display: "flex",
    alignItems: "center",
    padding: "0 8px",
    boxSizing: "border-box"
  };
  const bare = {
    background: "none",
    border: "none",
    padding: 0,
    minWidth: 0,
    width: "100%",
    height: "100%",
    minHeight: 44,
    boxSizing: "border-box",
    color: "var(--ink)"
  };
  const cap = { ...label, fontSize: 9, marginTop: 5, color: "var(--muted)" };
  return /* @__PURE__ */ React16.createElement("div", { className: "fd-flight-entry-wrap" }, /* @__PURE__ */ React16.createElement("div", { className: "fd-flight-entry" }, /* @__PURE__ */ React16.createElement("div", { style: { minWidth: 0 } }, /* @__PURE__ */ React16.createElement("div", { style: box }, /* @__PURE__ */ React16.createElement(
    "input",
    {
      value: leg.air || "",
      list: "fd-airlines",
      placeholder: "UA",
      autoCapitalize: "characters",
      "aria-label": "Airline",
      onChange: (e) => set({ air: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3) }),
      style: { ...bare, fontFamily: SANS, fontWeight: 700, fontSize: 16, letterSpacing: "0.1em" }
    }
  )), /* @__PURE__ */ React16.createElement("div", { style: cap }, "Airline")), /* @__PURE__ */ React16.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React16.createElement("div", { style: box }, /* @__PURE__ */ React16.createElement(
    "input",
    {
      value: leg.num || "",
      inputMode: "numeric",
      placeholder: "1885",
      "aria-label": "Flight number",
      onChange: (e) => set({ num: e.target.value.replace(/\D/g, "").slice(0, 4) }),
      style: { ...bare, fontFamily: SANS, fontWeight: 700, fontSize: 16 }
    }
  )), /* @__PURE__ */ React16.createElement("div", { style: cap }, "Flight no.")), /* @__PURE__ */ React16.createElement("div", { className: "fd-flight-time", style: { minWidth: 0 } }, /* @__PURE__ */ React16.createElement("div", { style: box }, /* @__PURE__ */ React16.createElement(
    "input",
    {
      type: "time",
      value: leg.time || "",
      onChange: (e) => set({ time: e.target.value }),
      "aria-label": dir === "out" ? "Departure time" : "Landing time",
      style: {
        ...bare,
        fontFamily: SANS,
        fontWeight: 700,
        fontSize: 16,
        color: leg.time ? "var(--ink)" : "var(--muted)"
      }
    }
  )), /* @__PURE__ */ React16.createElement("div", { style: cap }, dir === "out" ? "Takes off" : "Lands"))));
}
function FlightPass({ leg: raw, dir, small, edit, setLeg }) {
  if (edit) return /* @__PURE__ */ React16.createElement(FlightEntry, { leg: raw, dir, setLeg });
  const leg = cleanLeg(raw);
  if (!leg) return null;
  if (leg.note) return /* @__PURE__ */ React16.createElement("div", { style: {
    fontFamily: SANS,
    fontWeight: 600,
    fontSize: small ? 12.5 : 13.5,
    color: "var(--ink)",
    lineHeight: 1.5
  } }, leg.note);
  const t = legTime(leg.time);
  const numSize = small ? 19 : 22;
  return /* @__PURE__ */ React16.createElement("div", { style: {
    display: "flex",
    alignItems: "center",
    gap: small ? 10 : 11,
    background: "var(--paper2)",
    border: "1px solid var(--line)",
    borderRadius: 10,
    padding: small ? "9px 11px" : "11px 13px"
  } }, /* @__PURE__ */ React16.createElement(
    "svg",
    {
      width: small ? 14 : 16,
      height: small ? 14 : 16,
      viewBox: "0 0 24 24",
      fill: "var(--muted)",
      "aria-hidden": "true",
      style: { flexShrink: 0 }
    },
    /* @__PURE__ */ React16.createElement("path", { d: "M2 4 22 12 2 20l4.6-8z" })
  ), /* @__PURE__ */ React16.createElement("div", { style: { display: "flex", alignItems: "baseline", gap: 7, flex: 1, minWidth: 0 } }, /* @__PURE__ */ React16.createElement("span", { style: {
    fontFamily: SANS,
    fontWeight: 700,
    fontSize: small ? 11 : 12,
    letterSpacing: "0.14em",
    color: "var(--accent2)"
  } }, leg.air || "\xB7\xB7"), /* @__PURE__ */ React16.createElement("span", { style: {
    fontFamily: DISPLAY,
    fontWeight: 700,
    fontSize: numSize,
    color: "var(--ink)",
    lineHeight: 1
  } }, leg.num || "\u2014")), /* @__PURE__ */ React16.createElement("div", { style: {
    flexShrink: 0,
    borderLeft: "1px dashed var(--line)",
    paddingLeft: small ? 10 : 12,
    textAlign: "right"
  } }, /* @__PURE__ */ React16.createElement("div", { style: {
    fontFamily: DISPLAY,
    fontWeight: 700,
    fontSize: small ? 16 : 19,
    lineHeight: 1.05,
    color: t ? "var(--signal-text, var(--sun))" : "var(--muted)"
  } }, t || "\u2014"), /* @__PURE__ */ React16.createElement("div", { style: {
    fontFamily: SANS,
    fontWeight: 700,
    fontSize: small ? 9.5 : 10,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "var(--muted)",
    marginTop: 2
  } }, dir === "out" ? "Leaves Sun" : "Lands Fri")));
}
function LegField({ lb, dir, leg, setLeg }) {
  const filled = leg && (leg.air || leg.num || leg.time);
  return /* @__PURE__ */ React16.createElement("div", { style: { marginBottom: 12 } }, /* @__PURE__ */ React16.createElement("div", { style: { display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 } }, /* @__PURE__ */ React16.createElement("span", { style: label }, lb), filled && /* @__PURE__ */ React16.createElement("button", { onClick: () => setLeg(null), style: {
    marginLeft: "auto",
    background: "none",
    border: "none",
    cursor: "pointer",
    minHeight: 44,
    minWidth: 44,
    padding: 0,
    fontFamily: SANS,
    fontWeight: 700,
    fontSize: 11,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "var(--muted)"
  } }, "Clear")), /* @__PURE__ */ React16.createElement(FlightPass, { leg, dir, edit: true, setLeg }));
}
function TravelLists() {
  return /* @__PURE__ */ React16.createElement("datalist", { id: "fd-airlines" }, AIRLINES.map((a) => /* @__PURE__ */ React16.createElement("option", { key: a, value: a })));
}
function SizeRow({ lb, value, onPick, allowClear }) {
  return /* @__PURE__ */ React16.createElement("div", { style: { marginBottom: 12 } }, /* @__PURE__ */ React16.createElement("div", { style: { ...label, marginBottom: 6 } }, lb), /* @__PURE__ */ React16.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 5 } }, SIZES.map((sz) => /* @__PURE__ */ React16.createElement(
    "button",
    {
      key: sz,
      onClick: () => onPick(allowClear && value === sz ? null : sz),
      "aria-label": `${lb}: ${sz}`,
      "aria-pressed": value === sz,
      style: {
        fontFamily: SANS,
        fontWeight: 700,
        fontSize: 13,
        height: 48,
        padding: 0,
        borderRadius: 10,
        cursor: "pointer",
        background: value === sz ? `var(--selection-fill, ${GOLD_GRAD})` : "var(--paper2)",
        color: value === sz ? "var(--ink0)" : "var(--ink)",
        border: value === sz ? "1.5px solid var(--ink0)" : "1.5px solid var(--line)"
      }
    },
    sz
  ))));
}
function TravelFields({ booked, setBooked, flightIn, setFlightIn, flightOut, setFlightOut }) {
  const opt = (on) => ({
    fontFamily: SANS,
    fontWeight: 700,
    fontSize: 14,
    height: 48,
    padding: 0,
    borderRadius: 10,
    cursor: "pointer",
    background: on ? `var(--selection-fill, ${GOLD_GRAD})` : "var(--paper2)",
    color: on ? "var(--ink0)" : "var(--ink)",
    border: on ? "1.5px solid var(--ink0)" : "1.5px solid var(--line)"
  });
  return /* @__PURE__ */ React16.createElement("div", null, /* @__PURE__ */ React16.createElement(TravelLists, null), /* @__PURE__ */ React16.createElement("div", { style: {
    fontFamily: SANS,
    fontWeight: 600,
    fontSize: 15,
    color: "var(--ink)",
    marginBottom: 8
  } }, "Booked your flights?"), /* @__PURE__ */ React16.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 14 } }, /* @__PURE__ */ React16.createElement("button", { onClick: () => setBooked(true), "aria-pressed": booked === true, style: opt(booked === true) }, "Yes"), /* @__PURE__ */ React16.createElement(
    "button",
    {
      onClick: () => {
        setBooked(false);
        setFlightIn(null);
        setFlightOut(null);
      },
      "aria-pressed": booked === false,
      style: opt(booked === false)
    },
    "Not yet"
  )), booked === true && /* @__PURE__ */ React16.createElement(React16.Fragment, null, /* @__PURE__ */ React16.createElement(LegField, { lb: "Landing Friday", dir: "in", leg: flightIn, setLeg: setFlightIn }), /* @__PURE__ */ React16.createElement(LegField, { lb: "Leaving Sunday", dir: "out", leg: flightOut, setLeg: setFlightOut })), booked === false && /* @__PURE__ */ React16.createElement("div", { style: {
    fontFamily: SANS,
    fontSize: 13.5,
    color: "var(--muted2)",
    lineHeight: 1.55,
    marginBottom: 12
  } }, "Once you book, tap your player icon in the header to add your flights."));
}
var geo, US_LL, inUS, US_DOTS, TRAVEL_CITIES, TRAVEL_DEST, CARD;
var init_Travel = __esm({
  "src/features/travel/Travel.jsx"() {
    init_core();
    init_theme();
    init_controls();
    init_travel();
    geo = (lon, lat) => [(lon + 125) / 55 * 100, (49 - lat) / 24 * 100];
    US_LL = [
      [-124.7, 48.4],
      [-124.2, 43.3],
      [-122.4, 37.8],
      [-120.6, 34.5],
      [-117.1, 32.5],
      [-114.7, 32.7],
      [-111, 31.3],
      [-108.2, 31.3],
      [-106.5, 31.8],
      [-104.5, 29.7],
      [-103, 29],
      [-99.1, 26.4],
      [-97.1, 25.9],
      [-95, 29],
      [-93.8, 29.7],
      [-91, 29.2],
      [-89, 29.2],
      [-88, 30.3],
      [-85, 29.7],
      [-84, 30],
      [-82.8, 27.9],
      [-82, 26.5],
      [-80.4, 25.2],
      [-80.1, 27],
      [-81.4, 30.7],
      [-79.2, 33],
      [-77, 35],
      [-75.5, 37],
      [-75.5, 39],
      [-74, 40.5],
      [-71.5, 41.3],
      [-70, 42],
      [-70.7, 43.5],
      [-67, 44.8],
      [-71.5, 45],
      [-76, 44],
      [-79, 43.3],
      [-83, 42],
      [-83.5, 45.8],
      [-88, 48.2],
      [-95, 49],
      [-104, 49],
      [-117, 49]
    ].map(([lo, la]) => geo(lo, la));
    inUS = (x, y) => {
      let hit = false;
      for (let i = 0, j = US_LL.length - 1; i < US_LL.length; j = i++) {
        const [xi, yi] = US_LL[i], [xj, yj] = US_LL[j];
        if (yi > y !== yj > y && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit;
      }
      return hit;
    };
    US_DOTS = (() => {
      const step = 2.6, out = [];
      for (let y = 1; y < 100; y += step)
        for (let x = 1; x < 100; x += step) if (inUS(x, y)) out.push([x, y]);
      return out;
    })();
    TRAVEL_CITIES = [
      { n: "San Francisco", ll: [-122.4, 37.8], dx: 3.6, dy: -4.2, a: "start" },
      { n: "San Diego", ll: [-117.2, 32.7], dx: -1, dy: 6.6, a: "middle" },
      { n: "Tulsa", ll: [-96, 36.2], dx: 0, dy: -4.6, a: "middle" },
      { n: "Dallas", ll: [-96.8, 32.8], dx: 4, dy: 1.2, a: "start" },
      { n: "Austin", ll: [-97.7, 30.3], dx: -4, dy: 1.2, a: "end" },
      { n: "Baton Rouge", ll: [-91.2, 30.5], dx: 4, dy: 1.2, a: "start" },
      { n: "New York", ll: [-74, 40.7], dx: -4.5, dy: -4.6, a: "end" }
    ].map((c) => {
      const [x, y] = geo(...c.ll);
      return { ...c, x, y };
    });
    TRAVEL_DEST = (() => {
      const [x, y] = geo(-111.9, 33.5);
      return { x, y };
    })();
    CARD = {
      background: "var(--paper)",
      border: "1px solid var(--line)",
      borderRadius: 14,
      marginBottom: 12,
      overflow: "hidden"
    };
  }
});

// src/features/check-in/install.js
var installEvt, onInstallReady, isIOS;
var init_install = __esm({
  "src/features/check-in/install.js"() {
    installEvt = null;
    onInstallReady = () => {
      throw new Error("onInstallReady is unavailable in the isolated preview");
    };
    isIOS = () => {
      throw new Error("isIOS is unavailable in the isolated preview");
    };
  }
});

// src/features/check-in/InstallHint.jsx
import React17, { useEffect as useEffect4, useState as useState9 } from "react";
function InstallHint() {
  const [, bump] = useState9(0);
  useEffect4(() => onInstallReady(() => bump((x) => x + 1)), []);
  if (installEvt) return /* @__PURE__ */ React17.createElement(Btn, { onClick: () => installEvt.prompt(), style: { alignSelf: "flex-start" } }, "Add to home screen");
  if (isIOS()) return /* @__PURE__ */ React17.createElement("div", null, [["1", "Tap the Share button in Safari"], ["2", "Tap Add to Home Screen"]].map(([n, t]) => /* @__PURE__ */ React17.createElement("div", { key: n, style: { display: "flex", gap: 12, alignItems: "center", padding: "7px 0" } }, /* @__PURE__ */ React17.createElement("span", { style: { fontFamily: DISPLAY, fontWeight: 700, fontSize: 19, color: "var(--accent2)" } }, n), /* @__PURE__ */ React17.createElement("span", { style: { fontFamily: SANS, fontSize: 16, color: "var(--ink)" } }, t))));
  return /* @__PURE__ */ React17.createElement("div", { style: { fontFamily: SANS, fontSize: 16, color: "var(--ink)" } }, "In your browser menu, choose Add to Home Screen.");
}
var init_InstallHint = __esm({
  "src/features/check-in/InstallHint.jsx"() {
    init_controls();
    init_theme();
    init_install();
  }
});

// src/PhotoCropper.jsx
import React20, { useCallback, useEffect as useEffect6, useRef as useRef8, useState as useState12 } from "react";
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
function fit(view, image, diameter) {
  if (!image || !diameter) return view;
  const coverScale = Math.max(diameter / image.width, diameter / image.height);
  const scale = coverScale * view.zoom;
  const maxX = Math.max(0, (image.width * scale - diameter) / 2);
  const maxY = Math.max(0, (image.height * scale - diameter) / 2);
  return {
    zoom: clamp(view.zoom, MIN_ZOOM, MAX_ZOOM),
    x: clamp(view.x, -maxX, maxX),
    y: clamp(view.y, -maxY, maxY)
  };
}
function PhotoCropper({
  src,
  onConfirm,
  onCancel,
  outputSize = 384,
  quality = 0.84
}) {
  const dialogRef = useRef8(null);
  const cancelRef = useRef8(null);
  const stageRef = useRef8(null);
  const imageRef = useRef8(null);
  const dragRef = useRef8(null);
  const [image, setImage] = useState12(null);
  const [stageSize, setStageSize] = useState12(0);
  const [view, setView] = useState12({ zoom: 1, x: 0, y: 0 });
  const [status, setStatus] = useState12("loading");
  const [error, setError] = useState12("");
  const diameter = Math.max(0, stageSize - 32);
  useEffect6(() => {
    const node = stageRef.current;
    if (!node) return void 0;
    const measure = () => setStageSize(node.getBoundingClientRect().width);
    measure();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(node);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  useEffect6(() => {
    let disposed = false;
    setStatus("loading");
    setError("");
    setImage(null);
    setView({ zoom: 1, x: 0, y: 0 });
    if (!src) {
      setStatus("error");
      setError("That photo could not be opened. Choose another image.");
      return void 0;
    }
    const nextImage = new Image();
    nextImage.decoding = "async";
    nextImage.onload = () => {
      if (disposed) return;
      if (!nextImage.naturalWidth || !nextImage.naturalHeight) {
        setStatus("error");
        setError("That photo could not be opened. Choose another image.");
        return;
      }
      imageRef.current = nextImage;
      setImage({ width: nextImage.naturalWidth, height: nextImage.naturalHeight });
      setStatus("ready");
    };
    nextImage.onerror = () => {
      if (disposed) return;
      setStatus("error");
      setError("That photo could not be opened. Choose another image.");
    };
    nextImage.src = src;
    return () => {
      disposed = true;
      nextImage.onload = null;
      nextImage.onerror = null;
    };
  }, [src]);
  useEffect6(() => {
    setView((current) => fit(current, image, diameter));
  }, [image, diameter]);
  useEffect6(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cancelRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, []);
  const updateZoom = useCallback((nextZoom) => {
    setView((current) => {
      const zoom = clamp(Number(nextZoom), MIN_ZOOM, MAX_ZOOM);
      const ratio = zoom / current.zoom;
      return fit(
        { zoom, x: current.x * ratio, y: current.y * ratio },
        image,
        diameter
      );
    });
  }, [image, diameter]);
  const moveBy = useCallback((dx, dy) => {
    setView((current) => fit(
      { ...current, x: current.x + dx, y: current.y + dy },
      image,
      diameter
    ));
  }, [image, diameter]);
  const onPointerDown = (event) => {
    if (status !== "ready" || dragRef.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY
    };
  };
  const onPointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    moveBy(event.clientX - drag.x, event.clientY - drag.y);
    drag.x = event.clientX;
    drag.y = event.clientY;
  };
  const endPointer = (event) => {
    if (dragRef.current?.id !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };
  const onCropKeyDown = (event) => {
    const amount = event.shiftKey ? 20 : 7;
    const direction = {
      ArrowLeft: [amount, 0],
      ArrowRight: [-amount, 0],
      ArrowUp: [0, amount],
      ArrowDown: [0, -amount]
    }[event.key];
    if (!direction) return;
    event.preventDefault();
    moveBy(...direction);
  };
  const onDialogKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel?.();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...dialogRef.current.querySelectorAll(
      'button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])'
    )];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  const confirm = () => {
    const source = imageRef.current;
    if (!source || !image || !diameter || status !== "ready") return;
    try {
      const canvas = document.createElement("canvas");
      const size = clamp(Math.round(outputSize) || 384, 128, 1024);
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d");
      const coverScale2 = Math.max(diameter / image.width, diameter / image.height);
      const scale = coverScale2 * view.zoom;
      const sourceSize = diameter / scale;
      const sourceX = image.width / 2 - view.x / scale - sourceSize / 2;
      const sourceY = image.height / 2 - view.y / scale - sourceSize / 2;
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.fillStyle = "#241B12";
      context.fillRect(0, 0, size, size);
      context.drawImage(
        source,
        sourceX,
        sourceY,
        sourceSize,
        sourceSize,
        0,
        0,
        size,
        size
      );
      onConfirm?.(canvas.toDataURL("image/jpeg", clamp(quality, 0.5, 0.95)));
    } catch {
      setError("We couldn't crop that photo. Please try a different image.");
    }
  };
  const coverScale = image && diameter ? Math.max(diameter / image.width, diameter / image.height) : 0;
  const renderedWidth = image ? image.width * coverScale * view.zoom : 0;
  const renderedHeight = image ? image.height * coverScale * view.zoom : 0;
  return /* @__PURE__ */ React20.createElement("div", { className: "fd-crop-overlay", role: "presentation" }, /* @__PURE__ */ React20.createElement("style", null, `
        .fd-crop-overlay {
          position: fixed;
          inset: 0;
          z-index: 10000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          background: rgba(10, 6, 3, 0.78);
          backdrop-filter: blur(7px);
          -webkit-backdrop-filter: blur(7px);
          animation: fd-crop-fade 160ms ease-out both;
        }
        .fd-crop-dialog {
          width: min(430px, 100%);
          max-height: min(720px, calc(100dvh - 24px));
          overflow-y: auto;
          overscroll-behavior: contain;
          border: 1px solid var(--line, rgba(251,243,228,0.13));
          border-radius: 18px;
          background: var(--paper, #241b12);
          color: var(--ink, #f4ead9);
          box-shadow: var(--shadow-3, 0 14px 40px rgba(10,6,3,0.7));
          font-family: 'Inter', system-ui, sans-serif;
          animation: fd-crop-rise 180ms ease-out both;
        }
        .fd-crop-header {
          display: flex;
          align-items: flex-start;
          gap: 16px;
          padding: 18px 18px 12px;
        }
        .fd-crop-title {
          margin: 0;
          font-family: 'Barlow Condensed', 'Arial Narrow', sans-serif;
          font-size: 27px;
          font-weight: 800;
          line-height: 1;
          letter-spacing: .025em;
          text-transform: uppercase;
        }
        .fd-crop-close,
        .fd-crop-zoom-button {
          display: inline-grid;
          flex: 0 0 auto;
          place-items: center;
          padding: 0;
          color: var(--ink, #f4ead9);
          border: 1px solid var(--line, rgba(251,243,228,0.13));
          background: var(--paper2, #332619);
          cursor: pointer;
        }
        .fd-crop-close {
          width: 36px;
          height: 36px;
          margin-left: auto;
          border-radius: 50%;
          font-size: 23px;
          line-height: 1;
        }
        .fd-crop-stage {
          position: relative;
          width: min(360px, calc(100% - 36px));
          aspect-ratio: 1;
          margin: 0 auto;
          overflow: hidden;
          border: 1px solid var(--line, rgba(251,243,228,0.13));
          border-radius: 14px;
          background:
            radial-gradient(circle at 50% 50%, #2d2115 0 45%, #171009 78%);
          touch-action: none;
          cursor: grab;
          user-select: none;
        }
        .fd-crop-stage:active { cursor: grabbing; }
        .fd-crop-stage:focus-visible,
        .fd-crop-dialog button:focus-visible,
        .fd-crop-dialog input:focus-visible {
          outline: 3px solid var(--sun, #f0b02f);
          outline-offset: 3px;
        }
        .fd-crop-window {
          position: absolute;
          left: 16px;
          top: 16px;
          width: calc(100% - 32px);
          height: calc(100% - 32px);
          overflow: hidden;
          border-radius: 50%;
          background: var(--paper2, #332619);
          box-shadow:
            0 0 0 2px var(--sun, #f0b02f),
            0 0 0 999px rgba(10, 6, 3, 0.58);
        }
        .fd-crop-image {
          position: absolute;
          max-width: none;
          pointer-events: none;
          -webkit-user-drag: none;
          image-orientation: from-image;
          will-change: width, height, transform;
        }
        .fd-crop-loading {
          position: absolute;
          inset: 16px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          color: var(--muted2, #c9b896);
          font-size: 13px;
          text-align: center;
        }
        .fd-crop-controls { padding: 18px; }
        .fd-crop-zoom-row {
          display: grid;
          grid-template-columns: 38px minmax(0, 1fr) 38px;
          align-items: center;
          gap: 10px;
        }
        .fd-crop-zoom-button {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          font-size: 22px;
          font-weight: 700;
        }
        .fd-crop-zoom-button:disabled { cursor: default; opacity: .4; }
        .fd-crop-range {
          width: 100%;
          height: 32px;
          margin: 0;
          accent-color: var(--sun, #f0b02f);
          cursor: pointer;
        }
        .fd-crop-error {
          margin: 10px 0 0;
          color: var(--accent2, #d97a50);
          font-size: 12px;
          line-height: 1.4;
          text-align: center;
        }
        .fd-crop-actions {
          display: grid;
          grid-template-columns: 1fr 1.35fr;
          gap: 10px;
          margin-top: 15px;
        }
        .fd-crop-action {
          min-height: 48px;
          padding: 11px 16px;
          border-radius: 11px;
          font: 700 15px/1 'Inter', system-ui, sans-serif;
          cursor: pointer;
        }
        .fd-crop-cancel {
          border: 1px solid var(--line, rgba(251,243,228,0.13));
          color: var(--ink, #f4ead9);
          background: var(--paper2, #332619);
        }
        .fd-crop-use {
          border: 1.5px solid var(--ink0, #2a2119);
          color: var(--ink0, #2a2119);
          background: var(--sun, #f0b02f);
        }
        .fd-crop-action:disabled { cursor: default; opacity: .45; }
        @keyframes fd-crop-fade { from { opacity: 0; } }
        @keyframes fd-crop-rise {
          from { opacity: 0; transform: translateY(10px) scale(.985); }
        }
        @media (max-width: 540px) {
          .fd-crop-overlay { align-items: flex-end; padding: 0; }
          .fd-crop-dialog {
            width: 100%;
            max-height: calc(100dvh - 10px);
            border-width: 1px 0 0;
            border-radius: 20px 20px 0 0;
          }
          .fd-crop-header { padding-top: 16px; }
          .fd-crop-stage { width: min(350px, calc(100% - 28px)); }
          .fd-crop-controls { padding: 15px 18px max(18px, env(safe-area-inset-bottom)); }
        }
        @media (prefers-reduced-motion: reduce) {
          .fd-crop-overlay, .fd-crop-dialog { animation: none; }
        }
      `), /* @__PURE__ */ React20.createElement(
    "section",
    {
      ref: dialogRef,
      className: "fd-crop-dialog",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "fd-crop-title",
      onKeyDown: onDialogKeyDown
    },
    /* @__PURE__ */ React20.createElement("header", { className: "fd-crop-header" }, /* @__PURE__ */ React20.createElement("div", null, /* @__PURE__ */ React20.createElement("h2", { id: "fd-crop-title", className: "fd-crop-title" }, "Frame your photo")), /* @__PURE__ */ React20.createElement(
      "button",
      {
        ref: cancelRef,
        type: "button",
        className: "fd-crop-close",
        "aria-label": "Cancel photo crop",
        onClick: onCancel
      },
      /* @__PURE__ */ React20.createElement("span", { "aria-hidden": "true" }, "\xD7")
    )),
    /* @__PURE__ */ React20.createElement(
      "div",
      {
        ref: stageRef,
        className: "fd-crop-stage",
        role: "group",
        tabIndex: status === "ready" ? 0 : -1,
        "aria-label": "Photo crop area. Drag the photo or use arrow keys to reposition it.",
        onKeyDown: onCropKeyDown,
        onPointerDown,
        onPointerMove,
        onPointerUp: endPointer,
        onPointerCancel: endPointer
      },
      /* @__PURE__ */ React20.createElement("div", { className: "fd-crop-window" }, status === "ready" && /* @__PURE__ */ React20.createElement(
        "img",
        {
          className: "fd-crop-image",
          src,
          alt: "",
          draggable: "false",
          style: {
            width: renderedWidth,
            height: renderedHeight,
            left: "50%",
            top: "50%",
            transform: `translate(calc(-50% + ${view.x}px), calc(-50% + ${view.y}px))`
          }
        }
      )),
      status !== "ready" && /* @__PURE__ */ React20.createElement("div", { className: "fd-crop-loading", role: "status" }, status === "loading" ? "Opening photo\u2026" : "Photo unavailable")
    ),
    /* @__PURE__ */ React20.createElement("div", { className: "fd-crop-controls" }, /* @__PURE__ */ React20.createElement("div", { className: "fd-crop-zoom-row" }, /* @__PURE__ */ React20.createElement(
      "button",
      {
        type: "button",
        className: "fd-crop-zoom-button",
        "aria-label": "Zoom out",
        disabled: status !== "ready" || view.zoom <= MIN_ZOOM,
        onClick: () => updateZoom(view.zoom - ZOOM_STEP)
      },
      /* @__PURE__ */ React20.createElement("span", { "aria-hidden": "true" }, "\u2212")
    ), /* @__PURE__ */ React20.createElement(
      "input",
      {
        className: "fd-crop-range",
        type: "range",
        min: MIN_ZOOM,
        max: MAX_ZOOM,
        step: "0.01",
        value: view.zoom,
        disabled: status !== "ready",
        "aria-label": `Photo zoom, ${Math.round(view.zoom * 100)} percent`,
        onChange: (event) => updateZoom(event.target.value)
      }
    ), /* @__PURE__ */ React20.createElement(
      "button",
      {
        type: "button",
        className: "fd-crop-zoom-button",
        "aria-label": "Zoom in",
        disabled: status !== "ready" || view.zoom >= MAX_ZOOM,
        onClick: () => updateZoom(view.zoom + ZOOM_STEP)
      },
      /* @__PURE__ */ React20.createElement("span", { "aria-hidden": "true" }, "+")
    )), error && /* @__PURE__ */ React20.createElement("p", { className: "fd-crop-error", role: "alert" }, error), /* @__PURE__ */ React20.createElement("div", { className: "fd-crop-actions" }, /* @__PURE__ */ React20.createElement(
      "button",
      {
        type: "button",
        className: "fd-crop-action fd-crop-cancel",
        onClick: onCancel
      },
      "Cancel"
    ), /* @__PURE__ */ React20.createElement(
      "button",
      {
        type: "button",
        className: "fd-crop-action fd-crop-use",
        disabled: status !== "ready",
        onClick: confirm
      },
      "Use photo"
    )))
  ));
}
var MAX_ZOOM, MIN_ZOOM, ZOOM_STEP;
var init_PhotoCropper = __esm({
  "src/PhotoCropper.jsx"() {
    MAX_ZOOM = 4;
    MIN_ZOOM = 1;
    ZOOM_STEP = 0.1;
  }
});

// src/features/profile/player-pass.css
var init_player_pass = __esm({
  "src/features/profile/player-pass.css"() {
  }
});

// src/features/profile/PlayerPass.jsx
import React21, { useState as useState13 } from "react";
function cardInk(color) {
  const luminanceOf = (hex) => {
    const channels = hex.slice(1).match(/.{2}/g).map((value) => parseInt(value, 16) / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const luminance = luminanceOf(color), darkLuminance = luminanceOf("#070b09");
  return (luminance + 0.05) / (darkLuminance + 0.05) >= 1.05 / (luminance + 0.05) ? "#070b09" : "#ffffff";
}
function PlayerPass({ state, p, display, num, photo, compact = false }) {
  const identity = usePlayerIdentity(p);
  const [flipped, setFlipped] = useState13(false);
  const profile = state.profiles?.[p] || {};
  const name = display?.trim() || profile.display || p;
  const number = num !== void 0 && num !== null && num !== "" ? Number(num) : identity.num;
  const portrait = photo || (profile.photoV ? `/api/photo/${encodeURIComponent(p)}?v=${profile.photoV}` : null);
  const standing = state.live ? computeStandings(state).find((row) => row.player === p) : null;
  if (!p) return null;
  return /* @__PURE__ */ React21.createElement(
    "div",
    {
      className: `fd-pass-wrap${compact ? " fd-pass-compact" : ""}`,
      style: { "--pass-color": identity.color, "--pass-ink": cardInk(identity.color) }
    },
    /* @__PURE__ */ React21.createElement(
      "button",
      {
        type: "button",
        className: "fd-pass",
        onClick: () => setFlipped((value) => !value),
        "aria-label": `${name}'s player card. ${flipped ? "Show front" : "Turn over"}`,
        "aria-pressed": flipped
      },
      /* @__PURE__ */ React21.createElement("span", { className: `fd-pass-inner${flipped ? " is-flipped" : ""}` }, /* @__PURE__ */ React21.createElement("span", { className: "fd-pass-face fd-pass-front", "aria-hidden": flipped }, /* @__PURE__ */ React21.createElement("span", { className: "fd-pass-top" }, /* @__PURE__ */ React21.createElement("span", null, "FIELD DAY"), /* @__PURE__ */ React21.createElement("span", null, "SCOTTSDALE / 2026")), /* @__PURE__ */ React21.createElement("span", { className: "fd-pass-art" }, /* @__PURE__ */ React21.createElement("span", { className: "fd-pass-orbit" }), /* @__PURE__ */ React21.createElement("span", { className: "fd-pass-number" }, number == null ? "FD" : String(number).padStart(2, "0")), portrait && /* @__PURE__ */ React21.createElement("img", { className: "fd-pass-photo", src: portrait, alt: "" }), /* @__PURE__ */ React21.createElement("span", { className: `fd-pass-chip${portrait ? " with-photo" : ""}` }, /* @__PURE__ */ React21.createElement(ChipFace, { p, size: portrait ? 78 : 112, stamp: number == null ? void 0 : String(number) })), /* @__PURE__ */ React21.createElement("span", { className: "fd-pass-edition" }, "SCOTTSDALE", /* @__PURE__ */ React21.createElement("br", null), "ARIZONA")), /* @__PURE__ */ React21.createElement("span", { className: "fd-pass-name" }, name), /* @__PURE__ */ React21.createElement("span", { className: "fd-pass-foot" }, /* @__PURE__ */ React21.createElement("span", null, EDITION.short), /* @__PURE__ */ React21.createElement("span", null, "PLAYER / ", number ?? "FD"))), /* @__PURE__ */ React21.createElement("span", { className: "fd-pass-face fd-pass-back", "aria-hidden": !flipped }, /* @__PURE__ */ React21.createElement("span", { className: "fd-pass-top" }, /* @__PURE__ */ React21.createElement("span", null, name), /* @__PURE__ */ React21.createElement("span", null, "FIELD DAY / 2026")), /* @__PURE__ */ React21.createElement("span", { className: "fd-pass-back-title" }, "PLAYER", /* @__PURE__ */ React21.createElement("br", null), number == null ? "CARD" : String(number).padStart(2, "0")), /* @__PURE__ */ React21.createElement("span", { className: "fd-pass-facts" }, /* @__PURE__ */ React21.createElement("span", null, /* @__PURE__ */ React21.createElement("span", null, "Scottsdale, Arizona"), /* @__PURE__ */ React21.createElement("span", null, EDITION.short)), standing && /* @__PURE__ */ React21.createElement("span", null, /* @__PURE__ */ React21.createElement("span", null, "Current chips"), /* @__PURE__ */ React21.createElement("strong", null, standing.pts.toLocaleString("en-US"))), profile.walkoutTrack?.name && /* @__PURE__ */ React21.createElement("span", null, /* @__PURE__ */ React21.createElement("span", null, "Walkout song"), /* @__PURE__ */ React21.createElement("strong", null, profile.walkoutTrack.name))), /* @__PURE__ */ React21.createElement("span", { className: "fd-pass-foot" }, /* @__PURE__ */ React21.createElement("span", null, name.toUpperCase()), /* @__PURE__ */ React21.createElement("span", null, "2026"))))
    ),
    /* @__PURE__ */ React21.createElement("span", { className: "fd-pass-hint" }, flipped ? "Tap to see the front" : "Tap to turn over")
  );
}
var init_PlayerPass = __esm({
  "src/features/profile/PlayerPass.jsx"() {
    init_core();
    init_PlayerIdentity();
    init_PlayerIdentityContext();
    init_player_pass();
  }
});

// src/features/profile/ProfileEditor.jsx
import React22, { useId as useId2, useRef as useRef9, useState as useState14 } from "react";
function ProfileEditor({ state, me, display, setDisplay, photo, setPhoto, num, setNum, size, setSize, onChip, showSize = true }) {
  const identity = usePlayerIdentity(me);
  const fileRef = useRef9(null);
  const numberErrorId = useId2();
  const [cropSource, setCropSource] = useState14(null);
  const prof = state.profiles?.[me];
  const current = photo || (prof?.photoV ? `/api/photo/${encodeURIComponent(me)}?v=${prof.photoV}` : null);
  const takenBy = num !== "" ? Object.entries(state.profiles || {}).find(([p, pr]) => p !== me && pr?.num === Number(num)) : null;
  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setCropSource(reader.result);
    reader.readAsDataURL(f);
    e.target.value = "";
  };
  return /* @__PURE__ */ React22.createElement("div", { className: "fd-profile-editor" }, me && (state.live ? /* @__PURE__ */ React22.createElement("details", { className: "fd-profile-preview" }, /* @__PURE__ */ React22.createElement("summary", null, "Player card preview"), /* @__PURE__ */ React22.createElement(PlayerPass, { state, p: me, display, num, photo, compact: true })) : /* @__PURE__ */ React22.createElement(PlayerPass, { state, p: me, display, num, photo, compact: true })), /* @__PURE__ */ React22.createElement("div", { className: "fd-profile-controls" }, /* @__PURE__ */ React22.createElement(
    "div",
    {
      "aria-hidden": "true",
      className: "fd-profile-color-rail",
      style: { background: me ? identity.color : "var(--accent)" }
    }
  ), /* @__PURE__ */ React22.createElement("div", { className: "fd-profile-fields" }, /* @__PURE__ */ React22.createElement("div", { className: "fd-profile-photo-row" }, /* @__PURE__ */ React22.createElement(
    "button",
    {
      type: "button",
      onClick: () => fileRef.current?.click(),
      className: "fd-profile-photo-button",
      "aria-label": current ? "Change your photo" : "Add your photo"
    },
    /* @__PURE__ */ React22.createElement(
      "svg",
      {
        width: "18",
        height: "18",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "1.5",
        strokeLinejoin: "round",
        "aria-hidden": "true"
      },
      /* @__PURE__ */ React22.createElement("path", { d: "M3 7h4l2-3h6l2 3h4v13H3z" }),
      /* @__PURE__ */ React22.createElement("circle", { cx: "12", cy: "13", r: "3.5" })
    ),
    /* @__PURE__ */ React22.createElement("span", null, current ? "Change photo" : "Add a photo"),
    /* @__PURE__ */ React22.createElement("span", { "aria-hidden": "true", className: "fd-profile-photo-action" }, current ? "\u2197" : "+")
  ), /* @__PURE__ */ React22.createElement("input", { ref: fileRef, type: "file", accept: "image/*", onChange: onFile, style: { display: "none" } }), cropSource && /* @__PURE__ */ React22.createElement(
    PhotoCropper,
    {
      src: cropSource,
      onCancel: () => setCropSource(null),
      onConfirm: (cropped) => {
        setPhoto(cropped);
        setCropSource(null);
      }
    }
  )), /* @__PURE__ */ React22.createElement("div", { className: "fd-profile-name-row" }, /* @__PURE__ */ React22.createElement("label", { className: "fd-profile-field" }, /* @__PURE__ */ React22.createElement("span", null, "Display name"), /* @__PURE__ */ React22.createElement(
    "input",
    {
      value: display,
      onChange: (e) => setDisplay(e.target.value),
      maxLength: 16,
      "aria-label": "Display name",
      autoComplete: "nickname"
    }
  )), /* @__PURE__ */ React22.createElement("label", { className: "fd-profile-field fd-profile-number-field" }, /* @__PURE__ */ React22.createElement("span", null, "No."), /* @__PURE__ */ React22.createElement(
    "input",
    {
      value: num,
      inputMode: "numeric",
      placeholder: "00",
      "aria-label": "Player number",
      "aria-invalid": !!takenBy,
      "aria-describedby": takenBy ? numberErrorId : void 0,
      onChange: (e) => setNum(e.target.value.replace(/\D/g, "").slice(0, 2))
    }
  ))), takenBy && /* @__PURE__ */ React22.createElement("div", { id: numberErrorId, className: "fd-profile-number-error", role: "status" }, disp(state, takenBy[0]), " already has ", Number(num), ".")), onChip && me && /* @__PURE__ */ React22.createElement(ChipPicker, { state, me, onChip, num, embedded: true })), showSize && /* @__PURE__ */ React22.createElement("div", { style: { marginTop: 18 } }, /* @__PURE__ */ React22.createElement(SizeRow, { lb: "T-shirt size", value: size, onPick: setSize, allowClear: true })));
}
function ChipPicker({ state, me, onChip, num, embedded = false }) {
  const mine = state.profiles?.[me] || {};
  const stamp = num !== void 0 && num !== "" && num !== null ? Number(num) : mine.num;
  const owner = (hex) => Object.entries(state.profiles || {}).find(([p, pr]) => pr?.color === hex)?.[0];
  const locked = state.live;
  const { skin } = usePlayerIdentity(me);
  if (locked) return /* @__PURE__ */ React22.createElement("div", { className: "fd-profile-chip-locked" }, /* @__PURE__ */ React22.createElement(ChipFace, { p: me, size: 48, stamp }), /* @__PURE__ */ React22.createElement("div", null, /* @__PURE__ */ React22.createElement("strong", null, CHIP_SKIN_META[skin] || "Classic", " pattern"), /* @__PURE__ */ React22.createElement("p", null, "Chips are locked for the weekend.")));
  return /* @__PURE__ */ React22.createElement("div", { className: "fd-chip-picker", style: {
    background: "var(--paper)",
    border: embedded ? "none" : "1px solid var(--line)",
    borderTop: embedded ? "1px solid var(--line)" : void 0,
    borderRadius: embedded ? 0 : 14,
    padding: embedded ? "14px 12px 13px" : 12
  } }, !embedded && /* @__PURE__ */ React22.createElement("div", { style: { display: "flex", alignItems: "center", gap: 14, marginBottom: 15 } }, /* @__PURE__ */ React22.createElement("div", { style: { position: "relative", width: 80, height: 80, flexShrink: 0, display: "grid", placeItems: "center" } }, /* @__PURE__ */ React22.createElement("span", { "aria-hidden": "true", style: {
    position: "absolute",
    inset: 4,
    borderRadius: "50%",
    background: "var(--sun-tint)",
    border: "1px solid var(--line)"
  } }), /* @__PURE__ */ React22.createElement("div", { style: { position: "relative" } }, /* @__PURE__ */ React22.createElement(ChipFace, { p: me, size: 70, stamp }))), /* @__PURE__ */ React22.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React22.createElement("div", { style: {
    fontFamily: SANS,
    fontWeight: 700,
    fontSize: 10,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    color: "var(--accent2)",
    marginBottom: 4
  } }, "Chip design"), /* @__PURE__ */ React22.createElement("div", { style: {
    fontFamily: DISPLAY,
    fontWeight: 700,
    fontSize: 26,
    lineHeight: 1,
    textTransform: "uppercase",
    color: "var(--ink)"
  } }, "Your chip"), /* @__PURE__ */ React22.createElement("div", { style: { fontFamily: SANS, fontSize: 12.5, color: "var(--muted2)", lineHeight: 1.45, marginTop: 5 } }, mine.color ? `${CHIP_SKIN_META[skin] || "Classic"} pattern` : "Choose a color and pattern."))), /* @__PURE__ */ React22.createElement("div", { style: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 8
  } }, /* @__PURE__ */ React22.createElement("div", { style: { ...label, fontSize: 10 } }, "Choose your color"), !mine.color && /* @__PURE__ */ React22.createElement("div", { style: { fontFamily: SANS, fontSize: 10.5, color: "var(--muted)" } }, "First come, first served")), /* @__PURE__ */ React22.createElement("div", { className: "fd-chip-colors" }, CHIP_COLORS.map((c) => {
    const by = owner(c.hex);
    const isMine = by === me;
    const taken = by && !isMine;
    return /* @__PURE__ */ React22.createElement(
      "button",
      {
        type: "button",
        key: c.hex,
        disabled: taken || locked,
        onClick: () => onChip(isMine ? null : c.hex, void 0),
        "aria-label": taken ? `Color taken by ${disp(state, by)}` : isMine ? "Release selected chip color" : `Claim chip color ${c.hex}`,
        "aria-pressed": isMine,
        title: taken ? `Taken by ${disp(state, by)}` : void 0,
        style: {
          position: "relative",
          width: "100%",
          aspectRatio: "1",
          borderRadius: "50%",
          padding: 3,
          display: "grid",
          placeItems: "center",
          cursor: taken || locked ? "default" : "pointer",
          background: isMine ? "var(--sun-tint)" : "transparent",
          border: isMine ? "2px solid var(--sun)" : "1px solid transparent",
          opacity: taken ? 0.42 : locked && !isMine ? 0.55 : 1
        }
      },
      /* @__PURE__ */ React22.createElement("span", { style: {
        position: "relative",
        display: "grid",
        placeItems: "center",
        width: "100%",
        aspectRatio: "1",
        maxWidth: 34,
        borderRadius: "50%",
        background: c.hex,
        border: "1.5px solid var(--bone-line)"
      } }, taken && /* @__PURE__ */ React22.createElement("span", { style: {
        fontFamily: SANS,
        fontWeight: 800,
        fontSize: 8.5,
        color: c.light ? "var(--ink0)" : "var(--bone)"
      } }, (disp(state, by) || "").slice(0, 2).toUpperCase()), isMine && /* @__PURE__ */ React22.createElement(
        "svg",
        {
          width: "14",
          height: "14",
          viewBox: "0 0 16 16",
          fill: "none",
          stroke: c.light ? "var(--ink0)" : "var(--bone)",
          strokeWidth: "2.4",
          strokeLinecap: "round",
          strokeLinejoin: "round",
          "aria-hidden": "true"
        },
        /* @__PURE__ */ React22.createElement("path", { d: "m3.2 8.3 3 3 6.6-6.6" })
      ))
    );
  })), /* @__PURE__ */ React22.createElement("div", { style: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 8
  } }, /* @__PURE__ */ React22.createElement("div", { style: { ...label, fontSize: 10 } }, "Choose your pattern")), /* @__PURE__ */ React22.createElement("div", { className: "fd-chip-patterns" }, CHIP_SKINS.map((sk) => /* @__PURE__ */ React22.createElement(
    "button",
    {
      type: "button",
      key: sk,
      disabled: locked,
      onClick: () => onChip(void 0, sk),
      "aria-label": `Chip pattern ${CHIP_SKIN_META[sk] || sk}`,
      "aria-pressed": skin === sk,
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 5,
        minHeight: 72,
        padding: "7px 4px 6px",
        borderRadius: 10,
        cursor: locked ? "default" : "pointer",
        background: skin === sk ? "var(--sun-tint)" : "var(--paper2)",
        border: skin === sk ? "1.5px solid var(--sun)" : "1px solid var(--line)",
        boxShadow: skin === sk ? "inset 0 -2px 0 var(--sun)" : "none",
        opacity: locked && skin !== sk ? 0.55 : 1
      }
    },
    /* @__PURE__ */ React22.createElement(ChipFace, { p: me, size: 42, skin: sk, stamp }),
    /* @__PURE__ */ React22.createElement("span", { style: {
      fontFamily: SANS,
      fontWeight: 700,
      fontSize: 10.5,
      color: skin === sk ? "var(--ink)" : "var(--muted2)",
      lineHeight: 1.1
    } }, CHIP_SKIN_META[sk] || sk)
  ))));
}
var CHIP_SKIN_META;
var init_ProfileEditor = __esm({
  "src/features/profile/ProfileEditor.jsx"() {
    init_core();
    init_theme();
    init_PhotoCropper();
    init_PlayerIdentity();
    init_PlayerIdentityContext();
    init_Travel();
    init_PlayerPass();
    CHIP_SKIN_META = {
      ticks: "Classic",
      plain: "Clean",
      dash: "Split",
      quad: "Four block",
      dots: "Pips",
      ring: "Double ring",
      saw: "Zigzag",
      flame: "Petal",
      star: "Starburst",
      bolt: "Chevron",
      wave: "Ripple",
      crown: "Crown"
    };
  }
});

// src/features/check-in/submission.js
function createCheckInSubmission() {
  let pending = null;
  return (save, advance) => {
    if (pending) return pending;
    pending = Promise.resolve().then(save).catch(() => ({ ok: false, error: "Couldn't save. Try again." })).then(async (result) => {
      if (result?.ok !== true) {
        return { ...result, ok: false, error: result?.error || "Couldn't save. Try again." };
      }
      await advance();
      return result;
    }).finally(() => {
      pending = null;
    });
    return pending;
  };
}
var init_submission = __esm({
  "src/features/check-in/submission.js"() {
  }
});

// src/features/check-in/arrival.css
var init_arrival = __esm({
  "src/features/check-in/arrival.css"() {
  }
});

// src/features/check-in/Onboarding.jsx
var Onboarding_exports = {};
__export(Onboarding_exports, {
  Onboarding: () => Onboarding
});
import React25, { useEffect as useEffect8, useRef as useRef11, useState as useState16 } from "react";
function InvitationArt() {
  return /* @__PURE__ */ React25.createElement("div", { className: "fd-invitation-art", "aria-label": "Field Day. Scottsdale, 2026." }, /* @__PURE__ */ React25.createElement("div", { className: "fd-invitation-eyebrow" }, /* @__PURE__ */ React25.createElement("span", null, "YOUR INVITATION"), /* @__PURE__ */ React25.createElement("span", null, "2026")), /* @__PURE__ */ React25.createElement("div", { className: "fd-invitation-wordmark", "aria-hidden": "true" }, /* @__PURE__ */ React25.createElement("span", null, "FIELD"), /* @__PURE__ */ React25.createElement("span", null, "DAY", /* @__PURE__ */ React25.createElement("span", { className: "fd-invitation-period" }, "."))), /* @__PURE__ */ React25.createElement("div", { className: "fd-invitation-seal", "aria-hidden": "true" }, /* @__PURE__ */ React25.createElement("svg", { viewBox: "0 0 100 100" }, /* @__PURE__ */ React25.createElement("path", { d: "M50 1 59 10 72 6 77 19 91 23 90 37 100 50 90 60 94 74 80 79 76 93 62 91 50 100 40 90 26 94 21 80 7 76 9 62 0 50 10 40 6 26 20 21 24 7 38 9Z", fill: "currentColor" })), /* @__PURE__ */ React25.createElement("span", null, /* @__PURE__ */ React25.createElement("strong", null, ROSTER.length), /* @__PURE__ */ React25.createElement("small", null, "PLAYERS"))), /* @__PURE__ */ React25.createElement("div", { className: "fd-invitation-edition" }, /* @__PURE__ */ React25.createElement("span", null, "SCOTTSDALE, AZ"), /* @__PURE__ */ React25.createElement("span", null, EDITION.short, /* @__PURE__ */ React25.createElement("br", null), "2026")));
}
function RatingForm({ ratings, setRatings }) {
  const rated = SPORTS.filter((s) => ratings[s.id] !== void 0).length;
  return /* @__PURE__ */ React25.createElement("div", null, /* @__PURE__ */ React25.createElement("div", { className: "fd-rating-status" }, /* @__PURE__ */ React25.createElement("span", { role: "status" }, rated, " of ", SPORTS.length, " rated"), rated < SPORTS.length && /* @__PURE__ */ React25.createElement(
    "button",
    {
      type: "button",
      className: "fd-text-button",
      onClick: () => setRatings((current) => Object.fromEntries(SPORTS.map((s) => [s.id, current[s.id] ?? 2])))
    },
    "Set remaining to Average"
  )), [["sport", "Sports"], ["drink", "Drinking games"]].map(([group, title]) => /* @__PURE__ */ React25.createElement("div", { className: "fd-rating-group", key: group }, /* @__PURE__ */ React25.createElement("h3", { className: "fd-eyebrow" }, title), /* @__PURE__ */ React25.createElement("div", { className: "fd-rating-labels", "aria-hidden": "true" }, /* @__PURE__ */ React25.createElement("span", null), /* @__PURE__ */ React25.createElement("div", null, ["Never", "Rough", "Avg", "Solid", "Elite"].map((text) => /* @__PURE__ */ React25.createElement("span", { key: text }, text)))), SPORTS.filter((s) => s.group === group).map((s) => /* @__PURE__ */ React25.createElement("div", { className: "fd-rating-row", key: s.id }, /* @__PURE__ */ React25.createElement("div", null, /* @__PURE__ */ React25.createElement("strong", null, s.label), /* @__PURE__ */ React25.createElement("small", null, RATINGS.find((r) => r.v === ratings[s.id])?.label || "Not rated")), /* @__PURE__ */ React25.createElement("div", { className: "fd-rating-options", role: "group", "aria-label": s.label }, RATINGS.map((r, i) => /* @__PURE__ */ React25.createElement(
    "button",
    {
      type: "button",
      key: r.v,
      "aria-label": `${s.label}: ${r.label}`,
      "aria-pressed": ratings[s.id] === r.v,
      className: ratings[s.id] >= r.v ? "is-filled" : "",
      onClick: () => setRatings((current) => ({ ...current, [s.id]: r.v }))
    },
    i + 1
  ))))))));
}
function Onboarding({ step, me, state, pick, saveProfile, submitSeeds, next, back, done, onTv, onChip }) {
  const [selected, setSelected] = useState16(me || null);
  const [ratings, setRatings] = useState16({});
  const [display, setDisplay] = useState16("");
  const [photo, setPhoto] = useState16(null);
  const [num, setNum] = useState16("");
  const [size, setSize] = useState16(null);
  const [flightsBooked, setFlightsBooked] = useState16(null);
  const [flightIn, setFlightIn] = useState16(null);
  const [flightOut, setFlightOut] = useState16(null);
  const [busy, setBusy] = useState16(false);
  const [error, setError] = useState16("");
  const submit = useRef11(createCheckInSubmission());
  const heading = useRef11(null);
  const hydratedPlayer = useRef11(null);
  useEffect8(() => {
    if (!me || hydratedPlayer.current === me) return;
    hydratedPlayer.current = me;
    const profile = state.profiles?.[me];
    setDisplay(profile?.display || me);
    setNum(profile?.num != null ? String(profile.num) : "");
    setSize(profile?.size ?? null);
    setFlightsBooked(profile?.flightsBooked ?? null);
    setFlightIn(profile?.flightIn || null);
    setFlightOut(profile?.flightOut || null);
    setPhoto(null);
    setRatings({ ...state.seeds?.[me] });
  }, [me, state.profiles, state.seeds]);
  useEffect8(() => {
    setError("");
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [step]);
  const saveAndGo = async (save, advance = next) => {
    setBusy(true);
    setError("");
    const result = await submit.current(save, advance);
    if (!result.ok) setError(result.error || "Couldn't save. Try again.");
    setBusy(false);
  };
  const saveChip = async (color, skin) => {
    setBusy(true);
    setError("");
    const result = await submit.current(() => onChip(color, skin), () => {
    });
    if (!result.ok) setError(result.error || "Couldn't save your chip. Try again.");
    setBusy(false);
  };
  const title = step === -1 ? "Take Field Day with you" : ["Claim your spot", "The bachelor party is a tournament", "Thank you for flying in for this", "Getting there", "Set up your profile", "Rate yourself"][step];
  const intro = step === -1 ? "Add it to your home screen for live scores, draws, and bets all weekend." : [
    "Pick your name to unlock the trip details and give me the additional information I\u2019ll need for logistics. It\u2019ll only take ~2 minutes.",
    `${ROSTER.length} players, ${allEventsOf(state).filter((e) => !e.finale).length} events, one board. Win events and land bets to collect points all weekend, then your points become your chips at the poker finale. Whoever wins the poker table is the Field Day champion.`,
    `${ROSTER.length} players coming in from ${TRAVEL_CITIES.length} cities.`,
    "",
    "",
    "These stay private. They\u2019re only used to make fair teams."
  ][step];
  const canContinue = step === 0 ? !!selected : step === 3 ? !!size && flightsBooked !== null : step === 4 ? !!display.trim() && !!state.profiles?.[me]?.color : step === 5 ? SPORTS.every((s) => ratings[s.id] !== void 0) : true;
  const continueLabel = step === -1 ? "Skip, stay in the browser" : step === 0 ? selected ? `Continue as ${selected}` : "Pick your name" : step === 5 ? "Finish check-in" : "Continue";
  const go = () => {
    if (step === 0) return saveAndGo(() => pick(selected));
    if (step === 3) return saveAndGo(() => saveProfile({ display: (display || me).trim() || me, size, flightsBooked, flightIn, flightOut }));
    if (step === 4) return saveAndGo(() => saveProfile({ display: display.trim(), num: num === "" ? null : Number(num), ...photo ? { photo } : {} }));
    if (step === 5) return saveAndGo(() => submitSeeds(ratings), done);
    next();
  };
  return /* @__PURE__ */ React25.createElement("main", { className: "fd-arrival", "aria-busy": busy }, /* @__PURE__ */ React25.createElement("header", { className: "fd-arrival-header" }, /* @__PURE__ */ React25.createElement("span", { className: "fd-eyebrow" }, "FIELD DAY / SCOTTSDALE"), /* @__PURE__ */ React25.createElement("span", { className: "fd-arrival-progress" }, step < 0 ? "WELCOME" : `${String(step + 1).padStart(2, "0")} / 06`), step >= 0 && /* @__PURE__ */ React25.createElement("div", { className: "fd-arrival-progress-track", "aria-label": `Check-in step ${step + 1} of 6: ${STAGES[step]}` }, STAGES.map((stage, i) => /* @__PURE__ */ React25.createElement("span", { key: stage, className: i <= step ? "is-complete" : "" })))), /* @__PURE__ */ React25.createElement("div", { className: `fd-arrival-layout${step <= 0 ? " is-invitation" : ""}` }, /* @__PURE__ */ React25.createElement("aside", { className: "fd-arrival-aside" }, step <= 0 ? /* @__PURE__ */ React25.createElement(InvitationArt, null) : /* @__PURE__ */ React25.createElement("div", { className: "fd-arrival-chapter", "aria-hidden": "true" }, /* @__PURE__ */ React25.createElement("span", { className: "fd-eyebrow" }, "FIELD DAY / 2026"), /* @__PURE__ */ React25.createElement("strong", null, String(step + 1).padStart(2, "0")), /* @__PURE__ */ React25.createElement("span", { className: "fd-chapter-name" }, STAGES[step]), /* @__PURE__ */ React25.createElement("span", { className: "fd-chapter-date" }, EDITION.long))), /* @__PURE__ */ React25.createElement("section", { className: "fd-arrival-main", key: step }, /* @__PURE__ */ React25.createElement("div", { className: "fd-arrival-heading" }, /* @__PURE__ */ React25.createElement("h1", { ref: heading, tabIndex: -1 }, title), intro && /* @__PURE__ */ React25.createElement("p", null, intro)), /* @__PURE__ */ React25.createElement("fieldset", { className: "fd-arrival-fields", disabled: busy }, step === -1 && /* @__PURE__ */ React25.createElement("div", { className: "fd-install" }, /* @__PURE__ */ React25.createElement(InstallHint, null), /* @__PURE__ */ React25.createElement("p", null, "Open it from your home screen to finish your two-minute check-in.")), step === 0 && /* @__PURE__ */ React25.createElement("div", { className: "fd-guest-list", role: "group", "aria-label": "Who are you?" }, ROSTER.map((p, i) => /* @__PURE__ */ React25.createElement("button", { type: "button", key: p, onClick: () => setSelected(p), "aria-pressed": selected === p }, /* @__PURE__ */ React25.createElement("span", { className: "fd-guest-index" }, String(i + 1).padStart(2, "0")), /* @__PURE__ */ React25.createElement("span", null, p), /* @__PURE__ */ React25.createElement("span", { className: "fd-guest-check", "aria-hidden": "true" }, selected === p ? "\u2197" : "+")))), step === 1 && /* @__PURE__ */ React25.createElement(React25.Fragment, null, /* @__PURE__ */ React25.createElement("div", { className: "fd-starting-stack" }, /* @__PURE__ */ React25.createElement("span", { className: "fd-eyebrow" }, "EVERYONE STARTS AT"), /* @__PURE__ */ React25.createElement("strong", null, "1,000", /* @__PURE__ */ React25.createElement("span", null, "CHIPS"))), /* @__PURE__ */ React25.createElement("div", { className: "fd-weekend-rules" }, [
    ["01", "Collect points", "Win events and land bets. Whatever you have Saturday night becomes your poker stack."],
    ["02", "Betting", "Every event can be bet on. Only half your points can be at risk at one time."],
    ["03", "Duels", "Challenge anyone to Quick Draw. You name the ante, and the fastest tap takes the pot."],
    ["04", "The trophy", "The winner of the poker finale is the Field Day champion and takes home the Scottsdale 2026 trophy."]
  ].map(([n, name, body]) => /* @__PURE__ */ React25.createElement("div", { key: n }, /* @__PURE__ */ React25.createElement("span", null, n), /* @__PURE__ */ React25.createElement("div", null, /* @__PURE__ */ React25.createElement("h2", null, name), /* @__PURE__ */ React25.createElement("p", null, body)))))), step === 2 && /* @__PURE__ */ React25.createElement("div", { className: "fd-arrival-map" }, /* @__PURE__ */ React25.createElement(TravelMap, null), /* @__PURE__ */ React25.createElement("div", { className: "fd-destination-note" }, /* @__PURE__ */ React25.createElement("strong", null, "Scottsdale, Arizona"), /* @__PURE__ */ React25.createElement("span", null, EDITION.long))), step === 3 && /* @__PURE__ */ React25.createElement(React25.Fragment, null, /* @__PURE__ */ React25.createElement(VenueCard, { lg: state.logistics || {} }), /* @__PURE__ */ React25.createElement("div", { className: "fd-details-panel" }, /* @__PURE__ */ React25.createElement("h2", null, "Information I need"), /* @__PURE__ */ React25.createElement(TravelFields, { booked: flightsBooked, setBooked: setFlightsBooked, flightIn, setFlightIn, flightOut, setFlightOut }), /* @__PURE__ */ React25.createElement(SizeRow, { lb: "T-shirt size", value: size, onPick: setSize }))), step === 4 && /* @__PURE__ */ React25.createElement(
    ProfileEditor,
    {
      state,
      me,
      display,
      setDisplay,
      photo,
      setPhoto,
      num,
      setNum,
      showSize: false,
      onChip: saveChip
    }
  ), step === 5 && /* @__PURE__ */ React25.createElement(RatingForm, { ratings, setRatings })), /* @__PURE__ */ React25.createElement("footer", { className: "fd-arrival-actions" }, error && /* @__PURE__ */ React25.createElement("p", { className: "fd-save-error", role: "alert" }, error), /* @__PURE__ */ React25.createElement("button", { type: "button", className: "fd-continue", disabled: busy || !canContinue, onClick: go }, /* @__PURE__ */ React25.createElement("span", null, busy ? "Saving\u2026" : continueLabel), /* @__PURE__ */ React25.createElement("span", { "aria-hidden": "true" }, "\u2197")), /* @__PURE__ */ React25.createElement("div", { className: "fd-arrival-links" }, step > 0 && /* @__PURE__ */ React25.createElement("button", { type: "button", className: "fd-text-button", disabled: busy, onClick: back }, "\u2190 Back"), step === 0 && onTv && /* @__PURE__ */ React25.createElement("button", { type: "button", className: "fd-text-button", onClick: onTv, disabled: busy }, "TV mode"), step === 4 && !state.profiles?.[me]?.color && /* @__PURE__ */ React25.createElement("span", null, "Choose a chip color to continue."))))));
}
var STAGES;
var init_Onboarding = __esm({
  "src/features/check-in/Onboarding.jsx"() {
    init_core();
    init_Travel();
    init_ProfileEditor();
    init_InstallHint();
    init_submission();
    init_arrival();
    STAGES = ["Your invitation", "The tournament", "The roster", "The details", "Your card", "Private ratings"];
  }
});

// src/features/weekend/HowToSheet.jsx
init_core();
init_controls();
import React2, { useState as useState2 } from "react";
function HowToSheet({ gameId, variant, onClose }) {
  const game = GAMES[gameId];
  if (!game) return null;
  return /* @__PURE__ */ React2.createElement(Sheet, { title: game.name, onClose }, /* @__PURE__ */ React2.createElement(GameInstructions, { key: `${gameId}:${variant || ""}`, gameId, game, variant }));
}
function GameInstructions({ gameId, game, variant }) {
  const variants = game.variants || [];
  const [selected, setSelected] = useState2(() => variants.some((item) => item.id === variant) ? variant : variants[0]?.id);
  const howto = variants.length ? variants.find((item) => item.id === selected)?.howto : game.howto;
  if (!howto) return null;
  return /* @__PURE__ */ React2.createElement("article", { className: "fd-weekend-howto" }, !!variants.length && /* @__PURE__ */ React2.createElement("div", { className: "fd-weekend-howto-variants", role: "group", "aria-label": `${game.name} format` }, variants.map((item) => /* @__PURE__ */ React2.createElement(
    "button",
    {
      type: "button",
      key: item.id,
      "aria-pressed": selected === item.id,
      onClick: () => setSelected(item.id)
    },
    item.label
  ))), howto.objective && /* @__PURE__ */ React2.createElement("p", { className: "fd-weekend-howto-objective" }, howto.objective), /* @__PURE__ */ React2.createElement("div", { className: "fd-weekend-howto-equipment" }, howto.players && /* @__PURE__ */ React2.createElement(Tag, { tone: "gold" }, howto.players), (howto.gear || []).map((item) => /* @__PURE__ */ React2.createElement(Tag, { key: item }, item))), /* @__PURE__ */ React2.createElement("section", { className: "fd-weekend-howto-steps", "aria-label": "How to play" }, /* @__PURE__ */ React2.createElement("ol", null, (howto.steps || []).map((step, index) => /* @__PURE__ */ React2.createElement("li", { key: index }, /* @__PURE__ */ React2.createElement("span", { "aria-hidden": "true" }, String(index + 1).padStart(2, "0")), /* @__PURE__ */ React2.createElement("p", null, step))))), howto.win && /* @__PURE__ */ React2.createElement("section", { className: "fd-weekend-howto-win", "aria-labelledby": `fd-howto-win-${gameId}` }, /* @__PURE__ */ React2.createElement("h3", { id: `fd-howto-win-${gameId}` }, "To win"), /* @__PURE__ */ React2.createElement("p", null, howto.win)), howto.house && /* @__PURE__ */ React2.createElement("aside", { className: "fd-weekend-howto-house" }, /* @__PURE__ */ React2.createElement("h3", null, "House rule"), /* @__PURE__ */ React2.createElement("p", null, howto.house)));
}

// src/features/weekend/ContestPanel.jsx
init_core();
init_PlayerIdentity();
import React5, { useRef as useRef2, useState as useState3 } from "react";

// src/features/weekend/CompetitionBracket.jsx
init_core();
init_PlayerIdentity();
import React4 from "react";
function CompetitionBracket({ state, ev, me, gm = false, onPick, onPlayer, size = "md", hot, pending = false }) {
  const bracket = state.brackets?.[ev.id], draw = state.draws?.[ev.id];
  if (!bracket || !draw) return null;
  const contest = resolveCurrentContest(state, ev);
  const active = contest?.kind === "match" ? contest.match : null;
  const canRecord = gm && !!onPick && contest?.phase === "in-progress" && !state.frozen && !state.results?.[ev.id] && !state.poker && !state.shelved?.[ev.id];
  return /* @__PURE__ */ React4.createElement("section", { className: `fd-competition-bracket ${size === "lg" ? "is-large" : ""}`, style: { "--fd-round-count": bracket.rounds.length }, "aria-label": `${ev.name} bracket`, "aria-busy": pending }, /* @__PURE__ */ React4.createElement("div", { className: "fd-bracket-rounds" }, bracket.rounds.map((round, r) => /* @__PURE__ */ React4.createElement(
    "section",
    {
      className: "fd-bracket-round",
      key: r,
      "aria-label": ROUND_NAMES[bracket.size]?.[r] || `Round ${r + 1}`
    },
    /* @__PURE__ */ React4.createElement("h4", null, ROUND_NAMES[bracket.size]?.[r] || `Round ${r + 1}`),
    /* @__PURE__ */ React4.createElement("div", { className: "fd-bracket-matches" }, round.map((match, m) => {
      const sides = [resolveSlot(bracket, match.a), resolveSlot(bracket, match.b)];
      const isCurrent = active?.[0] === r && active?.[1] === m;
      const highlighted = isCurrent || hot?.[0] === r && hot?.[1] === m;
      const decided = match.winner !== null && match.winner !== void 0;
      return /* @__PURE__ */ React4.createElement("div", { key: m, className: `fd-bracket-match ${highlighted ? "is-current" : ""}`, "aria-label": `Match ${m + 1}${isCurrent ? ", current matchup" : ""}` }, /* @__PURE__ */ React4.createElement("div", { className: "fd-bracket-match-label" }, /* @__PURE__ */ React4.createElement("span", null, "Match ", m + 1), isCurrent && /* @__PURE__ */ React4.createElement("strong", null, contest.phase === "in-progress" ? "Playing" : contest.phase === "betting-open" ? "Betting open" : "Up next"), decided && /* @__PURE__ */ React4.createElement("span", null, "Final")), sides.map((key, index) => {
        const team = key === null || key === void 0 ? null : draw.teams[key];
        const won = decided && match.winner === key, lost = decided && team && !won;
        const name = team ? teamLabel(state, team) : "TBD";
        const fullName = team?.players.map((player) => disp(state, player)).join(" & ");
        const selectable = canRecord && isCurrent && !decided && sides.every((side) => side !== null && side !== void 0);
        return /* @__PURE__ */ React4.createElement("div", { key: index, className: `fd-bracket-team ${won ? "is-winner" : ""} ${lost ? "is-loser" : ""} ${team?.players.includes(me) ? "is-you" : ""}` }, /* @__PURE__ */ React4.createElement(
          "button",
          {
            type: "button",
            className: "fd-bracket-pick",
            disabled: !selectable || pending,
            "aria-label": selectable ? `Winner: ${fullName}` : `${fullName || "To be determined"}${won ? ", winner" : ""}`,
            onClick: () => selectable && onPick(r, m, key)
          },
          /* @__PURE__ */ React4.createElement("span", null, name),
          won && /* @__PURE__ */ React4.createElement("span", { className: "fd-bracket-outcome", "aria-hidden": "true" }, "\u2713"),
          selectable && /* @__PURE__ */ React4.createElement("span", { className: "fd-bracket-pick-hint" }, pending ? "Saving\u2026" : "Win")
        ), team && /* @__PURE__ */ React4.createElement("div", { className: "fd-bracket-players" }, team.players.map((player) => /* @__PURE__ */ React4.createElement(
          "button",
          {
            key: player,
            type: "button",
            "aria-label": `View ${disp(state, player)}'s player card`,
            disabled: pending || !onPlayer,
            onClick: () => onPlayer?.(player)
          },
          /* @__PURE__ */ React4.createElement(Avatar, { state, p: player, size: 25 })
        ))));
      }));
    }))
  ))));
}

// src/features/weekend/ContestPanel.jsx
var nameOf = (state, side) => side.name || side.players.map((player) => disp(state, player)).join(" & ");
function CurrentContest({ state, ev, contest, me, gm, onPlayer, onBets, onLock, onWinner, onResult, operationBusy, onBusy, blocked }) {
  const [winner, setWinner] = useState3(null), [qualifiers, setQualifiers] = useState3([]);
  const [pending, setPending] = useState3(false), [error, setError] = useState3("");
  const busy = useRef2(false), retry = useRef2(null);
  const open = contest.phase === "betting-open", locked = contest.phase === "betting-locked";
  const running = contest.phase === "in-progress" || contest.phase === "awaiting-result";
  const isFfa = contest.kind === "ffa", isBracket = contest.kind === "match";
  const advance = contest.kind === "heat" ? state.stages?.[ev.id]?.advance || 1 : 1;
  const reference2 = { contestId: contest.id, contestRevision: contest.revision };
  const act = async (callback) => {
    if (busy.current || operationBusy.current) return;
    busy.current = true;
    operationBusy.current = true;
    onBusy(true);
    retry.current = callback;
    setPending(true);
    setError("");
    try {
      const result = await callback();
      if (result?.ok !== true) setError(result?.error || "Change not saved. Try again.");
      return result;
    } catch (failure) {
      setError(failure?.message || "Change not saved. Try again.");
    } finally {
      busy.current = false;
      operationBusy.current = false;
      onBusy(false);
      setPending(false);
    }
  };
  const record = (key) => act(() => onWinner({ ...reference2, winner: key, qualifiers: [key] }));
  const selectingQualifiers = advance > 1 && winner !== null;
  return /* @__PURE__ */ React5.createElement("section", { className: "fd-contest", "aria-label": "Current contest", "aria-busy": pending }, /* @__PURE__ */ React5.createElement("div", { className: "fd-contest-toolbar" }, /* @__PURE__ */ React5.createElement("div", null, /* @__PURE__ */ React5.createElement("strong", null, isBracket ? "Bracket" : contest.label || ev.name), /* @__PURE__ */ React5.createElement("span", null, open ? "Betting open" : locked ? "Betting locked" : running ? "In progress" : "Next contest")), gm && (open || locked) && /* @__PURE__ */ React5.createElement(
    "button",
    {
      type: "button",
      className: "fd-contest-primary",
      disabled: pending || blocked || !onLock,
      onClick: () => act(() => onLock(reference2))
    },
    pending ? "Starting\u2026" : "Lock bets and start"
  ), !gm && onBets && /* @__PURE__ */ React5.createElement("button", { type: "button", className: "fd-contest-primary", disabled: pending || blocked, onClick: onBets }, open ? "Place chips" : "View bets"), gm && running && isFfa && /* @__PURE__ */ React5.createElement(
    "button",
    {
      type: "button",
      className: "fd-contest-primary",
      disabled: pending || !onResult,
      onClick: () => act(async () => {
        const result = await onResult();
        return result === true ? { ok: true } : result;
      })
    },
    "Enter result"
  )), gm && running && !isFfa && /* @__PURE__ */ React5.createElement("p", { className: "fd-contest-instruction" }, selectingQualifiers ? `Choose ${advance - 1} more to advance.` : isBracket ? "Tap the winning team." : "Tap the winner."), isBracket ? /* @__PURE__ */ React5.createElement(
    CompetitionBracket,
    {
      state,
      ev,
      me,
      gm,
      pending: pending || blocked,
      onPlayer,
      onPick: onWinner ? (_r, _m, key) => record(key) : void 0
    }
  ) : !isFfa && /* @__PURE__ */ React5.createElement("div", { className: "fd-contest-entrants", "aria-label": contest.label }, contest.sides.map((side) => {
    const name = nameOf(state, side), selected = winner === side.key;
    const canChoose = gm && running && !!onWinner;
    const qualifier = selectingQualifiers && !selected;
    return /* @__PURE__ */ React5.createElement("div", { key: String(side.key), className: `fd-contest-entrant ${side.players.includes(me) ? "is-you" : ""} ${selected ? "is-winner" : ""}` }, /* @__PURE__ */ React5.createElement(
      "button",
      {
        type: "button",
        className: "fd-contest-entrant-pick",
        disabled: pending || blocked || !canChoose,
        role: canChoose && qualifier ? "checkbox" : void 0,
        "aria-checked": canChoose && qualifier ? qualifiers.includes(side.key) : void 0,
        "aria-pressed": canChoose && advance > 1 && !qualifier ? selected : void 0,
        "aria-label": canChoose ? `${qualifier ? "Also advances" : "Winner"}: ${name}` : name,
        onClick: () => {
          if (busy.current || operationBusy.current || !canChoose) return;
          if (advance === 1) return record(side.key);
          if (!selectingQualifiers || selected) {
            setWinner(side.key);
            setQualifiers([]);
            return;
          }
          setQualifiers((current) => current.includes(side.key) ? current.filter((key) => key !== side.key) : current.length < advance - 1 ? [...current, side.key] : current);
        }
      },
      /* @__PURE__ */ React5.createElement("span", null, name),
      canChoose && /* @__PURE__ */ React5.createElement("small", null, selected ? "Winner" : qualifier ? qualifiers.includes(side.key) ? "\u2713" : "+" : "Win")
    ), /* @__PURE__ */ React5.createElement("div", { className: "fd-contest-entrant-players" }, side.players.map((player) => /* @__PURE__ */ React5.createElement(
      "button",
      {
        key: player,
        type: "button",
        onClick: () => onPlayer?.(player),
        disabled: pending || blocked || !onPlayer,
        "aria-label": `View ${disp(state, player)}'s player card`
      },
      /* @__PURE__ */ React5.createElement(Avatar, { state, p: player, size: 28 })
    ))));
  }), gm && running && advance > 1 && selectingQualifiers && /* @__PURE__ */ React5.createElement("div", { className: "fd-contest-qualifier-actions" }, /* @__PURE__ */ React5.createElement("button", { type: "button", className: "fd-contest-secondary", disabled: pending, onClick: () => {
    setWinner(null);
    setQualifiers([]);
  } }, "Change winner"), /* @__PURE__ */ React5.createElement(
    "button",
    {
      type: "button",
      className: "fd-contest-primary",
      disabled: pending || qualifiers.length !== advance - 1 || !onWinner,
      onClick: () => act(() => onWinner({ ...reference2, winner, qualifiers: [winner, ...qualifiers] }))
    },
    pending ? "Saving\u2026" : "Record winner"
  ))), error && /* @__PURE__ */ React5.createElement("div", { className: "fd-contest-failure" }, /* @__PURE__ */ React5.createElement("p", { role: "alert", className: "fd-contest-error" }, error), /* @__PURE__ */ React5.createElement("button", { type: "button", className: "fd-contest-secondary", disabled: pending, onClick: () => act(retry.current) }, "Retry")), pending && running && !isFfa && /* @__PURE__ */ React5.createElement("p", { className: "fd-contest-saving", role: "status" }, "Saving result\u2026"));
}
function ContestPanel(props) {
  const { state, ev, gm, onResult } = props;
  const operationBusy = useRef2(false), [blocked, onBusy] = useState3(false);
  const operations = { operationBusy, blocked, onBusy };
  if (state.results?.[ev.id] || state.shelved?.[ev.id] || state.frozen || ev.finale) return null;
  const lifecycle = resolveEventLifecycle(state, ev), contest = resolveCurrentContest(state, ev);
  if (!contest || !["betting-open", "betting-locked", "in-progress", "awaiting-result"].includes(contest.phase)) {
    return gm && ["enter-result", "post-result"].includes(lifecycle.nextAction?.type) ? /* @__PURE__ */ React5.createElement(React5.Fragment, null, /* @__PURE__ */ React5.createElement(ContestFinish, { key: ev.id, onResult, ...operations }), /* @__PURE__ */ React5.createElement(ContestCorrection, { ...props, ...operations })) : null;
  }
  return /* @__PURE__ */ React5.createElement(React5.Fragment, null, /* @__PURE__ */ React5.createElement(CurrentContest, { key: `${ev.id}:${contest.id}:${contest.revision}:${contest.phase}`, ...props, ...operations, contest }), /* @__PURE__ */ React5.createElement(ContestCorrection, { ...props, ...operations }));
}
function ContestFinish({ onResult, operationBusy, blocked, onBusy }) {
  const [pending, setPending] = useState3(false), [error, setError] = useState3("");
  const post = async () => {
    if (operationBusy.current || !onResult) return;
    operationBusy.current = true;
    onBusy(true);
    setPending(true);
    setError("");
    try {
      const result = await onResult();
      if (result !== true && result?.ok !== true) setError(result?.error || "Change not saved. Try again.");
      return result;
    } catch (failure) {
      setError(failure?.message || "Change not saved. Try again.");
    } finally {
      operationBusy.current = false;
      onBusy(false);
      setPending(false);
    }
  };
  return /* @__PURE__ */ React5.createElement("section", { className: "fd-contest", "aria-busy": pending }, /* @__PURE__ */ React5.createElement("div", { className: "fd-contest-toolbar" }, /* @__PURE__ */ React5.createElement("strong", null, "Competition complete"), /* @__PURE__ */ React5.createElement("button", { type: "button", className: "fd-contest-primary", disabled: blocked || pending || !onResult, onClick: post }, pending ? "Opening result\u2026" : "Post event result")), error && /* @__PURE__ */ React5.createElement("div", { className: "fd-contest-failure" }, /* @__PURE__ */ React5.createElement("p", { role: "alert", className: "fd-contest-error" }, error), /* @__PURE__ */ React5.createElement("button", { type: "button", className: "fd-contest-secondary", disabled: blocked || pending, onClick: post }, "Retry")));
}
function ContestCorrection({ state, ev, gm, onUndo, operationBusy, blocked, onBusy }) {
  const [pending, setPending] = useState3(false), [error, setError] = useState3("");
  const busy = useRef2(false), undo = contestUndoAvailability(state, ev);
  if (!gm || !onUndo || !state.eventOps?.[ev.id]?.lastContest) return null;
  return /* @__PURE__ */ React5.createElement("div", { className: "fd-contest-correction" }, /* @__PURE__ */ React5.createElement("button", { type: "button", disabled: pending || blocked || !undo.enabled, onClick: async () => {
    if (busy.current || operationBusy.current) return;
    busy.current = true;
    operationBusy.current = true;
    onBusy(true);
    setPending(true);
    setError("");
    try {
      const result = await onUndo({ contestId: undo.contestId, contestRevision: undo.contestRevision });
      if (!result?.ok) setError(result?.error || "Change not saved. Try again.");
    } catch (failure) {
      setError(failure?.message || "Change not saved. Try again.");
    } finally {
      busy.current = false;
      operationBusy.current = false;
      onBusy(false);
      setPending(false);
    }
  } }, pending ? "Opening result\u2026" : "Correct previous result"), !undo.enabled && /* @__PURE__ */ React5.createElement("p", null, undo.blocker), error && /* @__PURE__ */ React5.createElement("p", { role: "alert", className: "fd-contest-error" }, error));
}

// src/features/weekend/EventAnnouncement.jsx
init_core();
init_controls();
import React7, { useEffect as useEffect2, useRef as useRef3, useState as useState4 } from "react";

// src/ui/GameMark.jsx
import React6 from "react";
function EventGlyph({ id }) {
  const bone = "var(--ink)", accent = "var(--accent2)", sun = "var(--sun)";
  const common = {
    fill: "none",
    stroke: bone,
    strokeWidth: 2.4,
    strokeLinecap: "round",
    strokeLinejoin: "round"
  };
  switch (id) {
    case "putting":
      return /* @__PURE__ */ React6.createElement("g", { ...common }, /* @__PURE__ */ React6.createElement("path", { d: "M15 37V11l16 5-16 5" }), /* @__PURE__ */ React6.createElement("path", { d: "M9 37c4-3 10-3 14 0-4 3-10 3-14 0Z" }), /* @__PURE__ */ React6.createElement("circle", { cx: "32", cy: "35", r: "2.6", fill: accent, stroke: "none" }));
    case "8ball":
      return /* @__PURE__ */ React6.createElement("g", { ...common }, /* @__PURE__ */ React6.createElement("circle", { cx: "24", cy: "24", r: "13" }), /* @__PURE__ */ React6.createElement("circle", { cx: "24", cy: "21", r: "3.2" }), /* @__PURE__ */ React6.createElement("circle", { cx: "24", cy: "28", r: "3.2" }), /* @__PURE__ */ React6.createElement("path", { d: "M14 12l-3-3M34 36l3 3", stroke: accent }));
    case "pong":
      return /* @__PURE__ */ React6.createElement("g", { ...common }, /* @__PURE__ */ React6.createElement("path", { d: "M15 20h18l-2.4 17H17.4L15 20Z" }), /* @__PURE__ */ React6.createElement("path", { d: "M16 20c4-2 12-2 16 0" }), /* @__PURE__ */ React6.createElement("circle", { cx: "25", cy: "11", r: "3.2", fill: sun, stroke: bone }), /* @__PURE__ */ React6.createElement("path", { d: "M17 13l4 2", stroke: accent }));
    case "die":
      return /* @__PURE__ */ React6.createElement("g", { ...common }, /* @__PURE__ */ React6.createElement("rect", { x: "11", y: "11", width: "26", height: "26", rx: "7" }), [[17, 17], [31, 17], [24, 24], [17, 31], [31, 31]].map(([x, y]) => /* @__PURE__ */ React6.createElement("circle", { key: `${x}-${y}`, cx: x, cy: y, r: "1.9", fill: x === 24 ? accent : bone, stroke: "none" })));
    case "basketball":
      return /* @__PURE__ */ React6.createElement("g", { ...common }, /* @__PURE__ */ React6.createElement("circle", { cx: "24", cy: "24", r: "13" }), /* @__PURE__ */ React6.createElement("path", { d: "M11 24h26M24 11v26M15 14c5 5 5 15 0 20M33 14c-5 5-5 15 0 20" }), /* @__PURE__ */ React6.createElement("path", { d: "M34 12l4-4", stroke: accent }));
    case "spikeball":
      return /* @__PURE__ */ React6.createElement("g", { ...common }, /* @__PURE__ */ React6.createElement("ellipse", { cx: "24", cy: "32", rx: "14", ry: "5.5" }), /* @__PURE__ */ React6.createElement("path", { d: "M14 32h20M24 26.5v11M15 35l-3 4M33 35l3 4" }), /* @__PURE__ */ React6.createElement("circle", { cx: "24", cy: "15", r: "4", fill: sun, stroke: bone }), /* @__PURE__ */ React6.createElement("path", { d: "M18 11l-3-3", stroke: accent }));
    case "pingpong":
      return /* @__PURE__ */ React6.createElement("g", { ...common }, /* @__PURE__ */ React6.createElement("circle", { cx: "20", cy: "20", r: "9" }), /* @__PURE__ */ React6.createElement("path", { d: "M14 27l-6 8" }), /* @__PURE__ */ React6.createElement("circle", { cx: "35", cy: "32", r: "3.2", fill: accent, stroke: bone }), /* @__PURE__ */ React6.createElement("path", { d: "M29 17l5-3" }));
    case "foosball":
      return /* @__PURE__ */ React6.createElement("g", { ...common }, /* @__PURE__ */ React6.createElement("path", { d: "M8 15h32M8 31h32" }), /* @__PURE__ */ React6.createElement("circle", { cx: "24", cy: "14", r: "3.5" }), /* @__PURE__ */ React6.createElement("path", { d: "M24 18v10M18 22h12M24 28l-5 7M24 28l5 7" }), /* @__PURE__ */ React6.createElement("circle", { cx: "35", cy: "37", r: "2.8", fill: accent, stroke: "none" }));
    case "volleyball":
      return /* @__PURE__ */ React6.createElement("g", { ...common }, /* @__PURE__ */ React6.createElement("path", { d: "M30 12v27M30 19h10v20M30 24h10M30 29h10M30 34h10" }), /* @__PURE__ */ React6.createElement("circle", { cx: "17", cy: "22", r: "9" }), /* @__PURE__ */ React6.createElement("path", { d: "M17 13c4 5 4 13 0 18M9 20c6 1 12-1 16-5" }), /* @__PURE__ */ React6.createElement("path", { d: "M9 35l4-3", stroke: accent }));
    case "pickleball":
      return /* @__PURE__ */ React6.createElement("g", { ...common }, /* @__PURE__ */ React6.createElement("circle", { cx: "19", cy: "19", r: "9.5" }), /* @__PURE__ */ React6.createElement("path", { d: "M13 26l-5 9" }), /* @__PURE__ */ React6.createElement("circle", { cx: "35", cy: "31", r: "5", fill: sun }), [[33, 29], [37, 29], [35, 33]].map(([x, y]) => /* @__PURE__ */ React6.createElement("circle", { key: `${x}-${y}`, cx: x, cy: y, r: ".8", fill: bone, stroke: "none" })), /* @__PURE__ */ React6.createElement("path", { d: "M29 15l4-3", stroke: accent }));
    case "flipcup":
      return /* @__PURE__ */ React6.createElement("g", { ...common }, /* @__PURE__ */ React6.createElement("path", { d: "M15 15h15l-2 17H17l-2-17Z", transform: "rotate(-28 22.5 23.5)" }), /* @__PURE__ */ React6.createElement("path", { d: "M10 34c6 5 19 5 27-1" }), /* @__PURE__ */ React6.createElement("path", { d: "M10 29c-3-7 0-13 6-17", stroke: accent }), /* @__PURE__ */ React6.createElement("path", { d: "M13 11l3 1-1 3", stroke: accent }));
    case "beerio":
      return /* @__PURE__ */ React6.createElement("g", { ...common }, /* @__PURE__ */ React6.createElement("circle", { cx: "19", cy: "24", r: "11" }), /* @__PURE__ */ React6.createElement("circle", { cx: "19", cy: "24", r: "3" }), /* @__PURE__ */ React6.createElement("path", { d: "M19 13v8M10 29l6-3M28 29l-6-3" }), /* @__PURE__ */ React6.createElement("path", { d: "M33 18h8l-1 17h-6l-1-17Z" }), /* @__PURE__ */ React6.createElement("path", { d: "M34 18c2-1 4-1 6 0" }), /* @__PURE__ */ React6.createElement("path", { d: "M32 12l4 2", stroke: accent }));
    case "ragecage":
      return /* @__PURE__ */ React6.createElement("g", { ...common }, [15, 24, 33].map((x) => /* @__PURE__ */ React6.createElement("path", { key: x, d: `M${x - 4} 26h8l-1 11h-6l-1-11Z` })), /* @__PURE__ */ React6.createElement("path", { d: "M20 14h8l-1 10h-6l-1-10Z" }), /* @__PURE__ */ React6.createElement("circle", { cx: "12", cy: "15", r: "3", fill: sun, stroke: bone }), /* @__PURE__ */ React6.createElement("path", { d: "M8 20l-2 4", stroke: accent }));
    case "poker":
      return /* @__PURE__ */ React6.createElement("g", { ...common }, /* @__PURE__ */ React6.createElement("rect", { x: "10", y: "11", width: "15", height: "21", rx: "3", transform: "rotate(-9 17.5 21.5)" }), /* @__PURE__ */ React6.createElement("rect", { x: "23", y: "10", width: "15", height: "21", rx: "3", transform: "rotate(8 30.5 20.5)" }), /* @__PURE__ */ React6.createElement("path", { d: "M30 16l3 3-3 3-3-3 3-3Z", fill: accent, stroke: "none" }), /* @__PURE__ */ React6.createElement("circle", { cx: "24", cy: "36", r: "6", fill: "var(--paper2)" }), /* @__PURE__ */ React6.createElement("path", { d: "M20 36h8M24 32v8", stroke: sun }));
    case "gauntlet":
      return /* @__PURE__ */ React6.createElement("g", { ...common }, /* @__PURE__ */ React6.createElement("path", { d: "M9 34c0-12 8-19 18-18 6 1 9 5 9 11" }), [[9, 34], [12, 23], [21, 17], [31, 19]].map(([x, y], i) => /* @__PURE__ */ React6.createElement("circle", { key: i, cx: x, cy: y, r: "2.8", fill: i === 0 ? accent : "var(--paper2)" })), /* @__PURE__ */ React6.createElement("path", { d: "M36 27V11M36 11l7 3-7 3" }));
    default:
      return /* @__PURE__ */ React6.createElement("g", { ...common }, /* @__PURE__ */ React6.createElement("circle", { cx: "24", cy: "24", r: "12" }), /* @__PURE__ */ React6.createElement("path", { d: "M24 15v18M15 24h18", stroke: accent }));
  }
}
function GameMark({ id, size = 54, hero = false }) {
  return /* @__PURE__ */ React6.createElement(
    "svg",
    {
      className: hero ? "fd-night" : void 0,
      width: size,
      height: size,
      viewBox: "0 0 48 48",
      "aria-hidden": "true",
      style: { flexShrink: 0, display: "block", filter: hero ? "drop-shadow(0 14px 26px rgba(10,6,3,.32))" : "none" }
    },
    /* @__PURE__ */ React6.createElement(
      "rect",
      {
        x: "1.5",
        y: "1.5",
        width: "45",
        height: "45",
        rx: "14",
        fill: hero ? "var(--night2)" : "var(--paper2)",
        stroke: "var(--bone-line)",
        strokeWidth: "1.5"
      }
    ),
    /* @__PURE__ */ React6.createElement(EventGlyph, { id }),
    /* @__PURE__ */ React6.createElement("circle", { cx: "39.5", cy: "8.5", r: "2.4", fill: "var(--accent2)" })
  );
}

// src/features/weekend/EventAnnouncement.jsx
init_PlayerIdentity();

// src/features/weekend/drawReveal.js
init_core();
function drawRevealGroups(state, reveal) {
  return reveal.versus ? reveal.versus.map((team, index) => ({
    title: team.name || `Team ${index + 1}`,
    lines: [{ avatars: team.players, text: team.players.map((player) => disp(state, player)).join(" & ") }]
  })) : reveal.groups || [];
}
function startDrawPlayback({ total, reducedMotion = false, onStep, schedule = setTimeout, cancel = clearTimeout }) {
  let active = true;
  const timers = [];
  const stop = () => {
    active = false;
    timers.forEach(cancel);
  };
  const skip = () => {
    stop();
    onStep(total);
  };
  if (reducedMotion || total === 0) onStep(total);
  else {
    onStep(0);
    for (let index = 0; index < total; index++) {
      const delay = 480 + index * Math.min(680, 2900 / Math.max(1, total - 1));
      timers.push(schedule(() => {
        if (active) onStep(index + 1);
      }, delay));
    }
  }
  return { stop, skip };
}

// src/features/weekend/EventAnnouncement.jsx
function EventAnnouncement({ state, ev, handoff, onClose, onBets, holdMs = 2800, visual }) {
  const contest = resolveCurrentContest(state, ev);
  const detail = [
    !handoff && (contest?.kind !== "ffa" ? contest?.label : "One winner"),
    AWARDS[ev.value]?.[0] ? `${AWARDS[ev.value][0].toLocaleString("en-US")} chips to win` : null
  ].filter(Boolean).join(" \xB7 ");
  return /* @__PURE__ */ React7.createElement(Sheet, { title: ev.name, subtitle: handoff ? "On deck" : "Betting open", onClose, layer: 290, className: "fd-announcement" }, visual && /* @__PURE__ */ React7.createElement("div", { className: "fd-announcement-game" }, visual), /* @__PURE__ */ React7.createElement("div", { className: `fd-announcement-summary${handoff ? " is-handoff" : ""}` }, !visual && /* @__PURE__ */ React7.createElement("div", { className: "fd-announcement-mark" }, /* @__PURE__ */ React7.createElement(GameMark, { id: ev.game, size: 64 })), /* @__PURE__ */ React7.createElement("div", null, ev.desc && /* @__PURE__ */ React7.createElement("p", null, ev.desc), /* @__PURE__ */ React7.createElement("small", null, detail))), handoff && /* @__PURE__ */ React7.createElement("div", { className: "fd-announcement-handoff", "aria-hidden": "true", style: { "--intro-hold": `${holdMs}ms` } }, /* @__PURE__ */ React7.createElement("span", null)), /* @__PURE__ */ React7.createElement("div", { className: "fd-announcement-actions" }, onBets && /* @__PURE__ */ React7.createElement(ActionButton, { onClick: onBets }, "Place chips"), /* @__PURE__ */ React7.createElement(ActionButton, { variant: onBets ? "secondary" : "primary", onClick: onClose }, handoff ? "View draw" : "Done")));
}
function useReducedMotion(override) {
  const [reduced, setReduced] = useState4(() => typeof window === "undefined" || !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  useEffect2(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!media) return;
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);
  return override ?? reduced;
}
function DrawAnnouncement({ state, reveal, onClose, onBets, onPlayer, onBack, initialComplete = false, reducedMotion: motionOverride }) {
  const groups = drawRevealGroups(state, reveal);
  const total = groups.length + (reveal.crew?.length ? 1 : 0);
  const reducedMotion = useReducedMotion(motionOverride);
  const [shown, setShown] = useState4(() => reducedMotion || initialComplete ? total : 0);
  const [run, setRun] = useState4(0);
  const animate = !reducedMotion && !(initialComplete && run === 0);
  const playback = useRef3(null);
  useEffect2(() => {
    const next = startDrawPlayback({ total, reducedMotion: !animate, onStep: setShown });
    playback.current = next;
    return () => next.stop();
  }, [reveal.id, total, animate, run]);
  const complete = shown >= total;
  const skip = () => playback.current?.skip();
  const replay = () => {
    playback.current?.stop();
    setShown(reducedMotion ? total : 0);
    setRun((value) => value + 1);
  };
  const playerButton = (player, visible, index = 0) => /* @__PURE__ */ React7.createElement(
    "button",
    {
      type: "button",
      key: player,
      disabled: !visible || !onPlayer,
      tabIndex: visible ? void 0 : -1,
      onClick: () => {
        if (visible) onPlayer?.(player);
      },
      style: { "--deal-index": index },
      "aria-label": `View ${disp(state, player)}'s player card`
    },
    /* @__PURE__ */ React7.createElement(Avatar, { state, p: player, size: 30 }),
    /* @__PURE__ */ React7.createElement("span", null, disp(state, player))
  );
  return /* @__PURE__ */ React7.createElement(Sheet, { title: reveal.subtitle || reveal.title, subtitle: reveal.subtitle ? reveal.title : "The draw", onClose, onBack, layer: 300, className: "fd-announcement" }, /* @__PURE__ */ React7.createElement("div", { className: "fd-draw-playback" }, /* @__PURE__ */ React7.createElement("div", { className: `fd-draw-deck${complete ? " is-complete" : ""}`, "aria-hidden": "true" }, /* @__PURE__ */ React7.createElement("i", null), /* @__PURE__ */ React7.createElement("i", null), /* @__PURE__ */ React7.createElement("i", null, "FD")), /* @__PURE__ */ React7.createElement("span", { role: "status", "aria-live": "polite" }, complete ? "Draw complete" : "Revealing the draw"), /* @__PURE__ */ React7.createElement("button", { type: "button", className: "fd-draw-playback-action", onClick: complete ? replay : skip }, complete ? "Replay draw" : "Skip animation")), /* @__PURE__ */ React7.createElement("div", { className: `fd-draw-announcement${!animate ? " is-reduced" : ""}`, key: run }, groups.map((group, index) => {
    const visible = index < shown;
    return /* @__PURE__ */ React7.createElement("section", { key: index, className: `fd-draw-card ${visible ? "is-revealed" : "is-covered"}` }, /* @__PURE__ */ React7.createElement("div", { className: "fd-draw-card-back", "aria-hidden": "true" }, /* @__PURE__ */ React7.createElement("span", null, String(index + 1).padStart(2, "0"))), /* @__PURE__ */ React7.createElement("div", { className: "fd-draw-card-front", "aria-hidden": !visible }, /* @__PURE__ */ React7.createElement("h3", null, group.title), group.lines.map((line, j) => {
      const people = line.avatars || [];
      const namedTeam = line.text && people.length > 1 && line.text !== people.map((player) => disp(state, player)).join(" & ") && line.text !== group.title;
      return /* @__PURE__ */ React7.createElement(React7.Fragment, { key: j }, group.vs && j > 0 && /* @__PURE__ */ React7.createElement("small", { className: "fd-draw-versus" }, "vs"), namedTeam && /* @__PURE__ */ React7.createElement("strong", { className: "fd-draw-team-name" }, line.text), /* @__PURE__ */ React7.createElement("div", { className: "fd-draw-people" }, people.length ? people.map((player, playerIndex) => playerButton(player, visible, playerIndex)) : /* @__PURE__ */ React7.createElement("span", null, line.text)));
    })));
  })), !!reveal.crew?.length && /* @__PURE__ */ React7.createElement("div", { className: `fd-draw-crew ${complete ? "is-revealed" : "is-covered"}`, "aria-hidden": !complete }, reveal.crew.map((role) => /* @__PURE__ */ React7.createElement("div", { key: role.player }, playerButton(role.player, complete), /* @__PURE__ */ React7.createElement("span", null, role.role.replaceAll("-", " "))))), /* @__PURE__ */ React7.createElement("div", { className: "fd-announcement-actions" }, onBets && /* @__PURE__ */ React7.createElement(ActionButton, { onClick: onBets }, "Place chips"), /* @__PURE__ */ React7.createElement(ActionButton, { variant: onBets ? "secondary" : "primary", onClick: onClose }, "Done")));
}

// src/features/draft/DraftSheet.jsx
init_core();
init_controls();
init_PlayerIdentity();
init_playerIdentity();
import React8, { useEffect as useEffect3, useRef as useRef4, useState as useState5 } from "react";
var identityStyle = (state, player) => ({ "--draft-color": resolvePlayerIdentity(state.profiles, player).color });
var reference = (turn) => ({ draftId: turn.draftId, pickIndex: turn.pickIndex, draftRevision: turn.draftRevision });
function PlayerLink({ state, player, onPlayer, children, disabled }) {
  return /* @__PURE__ */ React8.createElement(
    "button",
    {
      type: "button",
      className: "fd-draft-person",
      disabled: disabled || !onPlayer,
      onClick: () => onPlayer?.(player),
      "aria-label": `View ${disp(state, player)}'s player card`
    },
    /* @__PURE__ */ React8.createElement(Avatar, { state, p: player, size: 30 }),
    /* @__PURE__ */ React8.createElement("span", null, children || disp(state, player))
  );
}
function DraftEntry({ state, ev, me, onOpen }) {
  const draft = state.drafts?.[ev?.id];
  if (!draft || state.draws?.[ev.id]) return null;
  const turn = draftTurn(draft), mine = turn.captain === me;
  return /* @__PURE__ */ React8.createElement(
    "button",
    {
      type: "button",
      className: `fd-draft-entry${mine ? " is-mine" : ""}`,
      onClick: onOpen,
      "aria-label": `Open ${ev.name} draft`
    },
    /* @__PURE__ */ React8.createElement(BankChip, { p: turn.captain || draft.teams[0].captain, size: 44 }),
    /* @__PURE__ */ React8.createElement("span", null, /* @__PURE__ */ React8.createElement("small", null, turn.complete ? "Teams picked" : mine ? "Your pick" : "Draft in progress"), /* @__PURE__ */ React8.createElement("strong", null, ev.name), /* @__PURE__ */ React8.createElement("span", null, turn.complete ? "Waiting for teams to be confirmed" : `Pick ${turn.pickIndex + 1} \xB7 ${disp(state, turn.captain)}`)),
    /* @__PURE__ */ React8.createElement("b", { "aria-hidden": "true" }, "\u2197")
  );
}
function DraftSheet({
  ev,
  state,
  gm,
  me,
  standings = [],
  pool,
  roles = [],
  onClose,
  onPlayer,
  onStart,
  onPick,
  onUndo,
  onFinalize,
  onCancel
}) {
  const draft = state.drafts?.[ev.id];
  const [captains, setCaptains] = useState5([]), [method, setMethod] = useState5("pick");
  const [pending, setPending] = useState5(""), [error, setError] = useState5("");
  const [confirmCancel, setConfirmCancel] = useState5(false);
  const saving = useRef4(false), board = useRef4(null), focusAfterPick = useRef4(false);
  const turn = draft ? draftTurn(draft) : null;
  const blocked = !!state.frozen || !!state.poker && !state.results?.[state.poker.id] || !!state.results?.[ev.id] || !!state.shelved?.[ev.id] || state.onDeck === ev.id || !!state.eventOps?.[ev.id]?.bettingOpenedAt || !!state.eventOps?.[ev.id]?.startedAt;
  const myTurn = !!turn?.captain && turn.captain === me;
  const canPick = !!turn && !turn.complete && (gm || myTurn) && !blocked;
  const submit = async (name, action, after) => {
    if (saving.current) return { ok: false, error: "A draft action is still saving." };
    saving.current = true;
    setPending(name);
    setError("");
    try {
      const result = await action();
      if (result?.ok !== true) {
        setError(result?.error || "Couldn't save. Try again.");
        return result;
      }
      after?.();
      return result;
    } catch (failure) {
      const result = { ok: false, error: failure?.message || "Couldn't save. Try again." };
      setError(result.error);
      return result;
    } finally {
      saving.current = false;
      setPending("");
    }
  };
  useEffect3(() => {
    if (!pending && focusAfterPick.current) {
      board.current?.focus({ preventScroll: true });
      focusAfterPick.current = false;
    }
  }, [pending, turn?.draftRevision]);
  const n = ev.teamCfg?.teams || 2, size = ev.teamCfg?.size || 2;
  const chooseMethod = (next) => {
    if (saving.current) return;
    setMethod(next);
    if (next === "random") setCaptains(shuffle(pool || []).slice(0, n));
    else if (next === "seed") setCaptains([...pool || []].sort((a, b) => ev.sport ? (state.seeds?.[b]?.[ev.sport] || 0) - (state.seeds?.[a]?.[ev.sport] || 0) : standings.findIndex((row) => row.player === a) - standings.findIndex((row) => row.player === b)).slice(0, n));
    else setCaptains([]);
  };
  const toggleCaptain = (player) => {
    if (saving.current) return;
    setMethod("pick");
    setCaptains((previous) => previous.includes(player) ? previous.filter((p) => p !== player) : previous.length < n ? [...previous, player] : previous);
  };
  const crew = draft?.roles || roles;
  const shell = (children) => /* @__PURE__ */ React8.createElement(
    Sheet,
    {
      title: ev.name,
      subtitle: "Captains draft",
      onClose,
      busy: !!pending,
      wide: true,
      className: "fd-draft-sheet"
    },
    children
  );
  if (!draft && (!pool || !gm)) return shell(/* @__PURE__ */ React8.createElement("p", null, "Draft closed."));
  if (!draft) return shell(/* @__PURE__ */ React8.createElement("div", { className: "fd-draft" }, /* @__PURE__ */ React8.createElement("div", { className: "fd-draft-section-title" }, /* @__PURE__ */ React8.createElement("h2", null, "Choose ", n, " captains"), /* @__PURE__ */ React8.createElement("span", null, n, " teams of ", size)), /* @__PURE__ */ React8.createElement("p", { className: "fd-draft-note" }, "Captain order is pick order. It reverses each round."), /* @__PURE__ */ React8.createElement("div", { className: "fd-draft-methods", "aria-label": "Choose captains" }, [["pick", "Choose"], ["seed", ev.sport ? "Top seeds" : "Standings"], ["random", "Random"]].map(([id, text]) => /* @__PURE__ */ React8.createElement(
    "button",
    {
      type: "button",
      key: id,
      "aria-pressed": method === id,
      disabled: !!pending,
      onClick: () => chooseMethod(id)
    },
    text
  ))), /* @__PURE__ */ React8.createElement("ol", { className: "fd-draft-captain-order", "aria-label": "Captain pick order" }, Array.from({ length: n }, (_, index) => /* @__PURE__ */ React8.createElement("li", { key: `${index}:${captains[index] || "empty"}`, className: captains[index] ? "is-filled" : "" }, /* @__PURE__ */ React8.createElement("small", null, index + 1), captains[index] ? /* @__PURE__ */ React8.createElement(
    "button",
    {
      type: "button",
      disabled: !!pending,
      onClick: () => toggleCaptain(captains[index]),
      "aria-label": `Remove ${disp(state, captains[index])} as captain`
    },
    /* @__PURE__ */ React8.createElement(BankChip, { p: captains[index], size: 36 }),
    /* @__PURE__ */ React8.createElement("span", null, disp(state, captains[index])),
    /* @__PURE__ */ React8.createElement("b", { "aria-hidden": "true" }, "\xD7")
  ) : /* @__PURE__ */ React8.createElement("span", null, "Captain ", index + 1)))), /* @__PURE__ */ React8.createElement("div", { className: "fd-draft-pool", "aria-label": "Players" }, (pool || []).map((player) => /* @__PURE__ */ React8.createElement("div", { className: "fd-draft-candidate", key: player }, /* @__PURE__ */ React8.createElement(
    "button",
    {
      type: "button",
      className: "fd-draft-select",
      "aria-label": `Choose ${disp(state, player)} as captain`,
      "aria-pressed": captains.includes(player),
      disabled: !!pending || !captains.includes(player) && captains.length === n,
      onClick: () => toggleCaptain(player)
    },
    /* @__PURE__ */ React8.createElement(Avatar, { state, p: player, size: 36 }),
    /* @__PURE__ */ React8.createElement("span", null, disp(state, player)),
    /* @__PURE__ */ React8.createElement("b", { "aria-hidden": "true" }, captains.includes(player) ? captains.indexOf(player) + 1 : "+")
  )))), !!crew.length && /* @__PURE__ */ React8.createElement(DraftCrew, { state, roles: crew, onPlayer, disabled: !!pending }), error && /* @__PURE__ */ React8.createElement("p", { className: "fd-draft-error", role: "alert" }, error), /* @__PURE__ */ React8.createElement("div", { className: "fd-draft-footer" }, /* @__PURE__ */ React8.createElement(
    ActionButton,
    {
      disabled: captains.length !== n || blocked,
      pending: !!pending,
      onClick: () => submit("start", () => onStart(captains, pool))
    },
    pending ? "Starting\u2026" : "Start the draft"
  ))));
  const last = draft.picks.at(-1), ref = reference(turn);
  const remainingOrder = Array.from({ length: Math.min(turn.remaining, n + 1) }, (_, offset) => ({
    pick: turn.pickIndex + offset,
    team: snakeTeam(turn.pickIndex + offset, n)
  }));
  const pick = (player) => {
    if (!canPick || saving.current) return;
    focusAfterPick.current = true;
    return submit(`pick:${player}`, () => onPick(player, ref));
  };
  return shell(/* @__PURE__ */ React8.createElement("div", { className: "fd-draft", ref: board, tabIndex: -1 }, /* @__PURE__ */ React8.createElement(
    "section",
    {
      className: `fd-draft-turn${myTurn ? " is-mine" : ""}${turn.complete ? " is-complete" : ""}`,
      "aria-label": "Current pick",
      style: identityStyle(state, turn.captain || draft.teams[0].captain)
    },
    /* @__PURE__ */ React8.createElement("div", { className: "fd-draft-turn-copy", key: `${draft.id}:${turn.draftRevision}` }, /* @__PURE__ */ React8.createElement("small", null, turn.complete ? `${draft.teams.length} teams \xB7 ${size} players each` : `Round ${turn.round} \xB7 Pick ${turn.pickIndex + 1} of ${turn.totalPicks}`), /* @__PURE__ */ React8.createElement("h2", null, turn.complete ? "Teams picked" : myTurn ? "Your pick" : `${disp(state, turn.captain)}'s pick`), /* @__PURE__ */ React8.createElement("p", null, turn.complete ? gm ? "Confirm the teams to reveal the draw." : "Waiting for the commissioner to confirm." : canPick ? gm && !myTurn ? `Picking for ${disp(state, turn.captain)}` : "Choose a player below." : "Follow the picks here.")),
    /* @__PURE__ */ React8.createElement("span", { className: "fd-draft-turn-chip", key: `${draft.id}:${turn.captain || "done"}`, "aria-hidden": "true" }, /* @__PURE__ */ React8.createElement(BankChip, { p: turn.captain || draft.teams[0].captain, size: 64 })),
    /* @__PURE__ */ React8.createElement(
      "div",
      {
        className: "fd-draft-progress",
        role: "progressbar",
        "aria-label": "Draft picks",
        "aria-valuenow": turn.pickIndex,
        "aria-valuemin": 0,
        "aria-valuemax": turn.totalPicks
      },
      /* @__PURE__ */ React8.createElement("span", { style: { width: `${turn.totalPicks ? turn.pickIndex / turn.totalPicks * 100 : 100}%` } })
    )
  ), /* @__PURE__ */ React8.createElement("p", { className: "fd-draft-sr", role: "status", "aria-live": "polite", "aria-atomic": "true" }, last ? `${disp(state, last.player)} joined ${disp(state, draft.teams[last.team].captain)}. ` : "", turn.complete ? "All players picked." : `Pick ${turn.pickIndex + 1}. ${disp(state, turn.captain)} to choose.`), !turn.complete && /* @__PURE__ */ React8.createElement("ol", { className: "fd-draft-queue", "aria-label": "Upcoming pick order" }, remainingOrder.map(({ pick: pickIndex, team }, index) => /* @__PURE__ */ React8.createElement("li", { key: pickIndex, "aria-current": index === 0 ? "step" : void 0 }, /* @__PURE__ */ React8.createElement("small", null, index === 0 ? "Now" : `Pick ${pickIndex + 1}`), /* @__PURE__ */ React8.createElement("span", null, disp(state, draft.teams[team].captain))))), last && /* @__PURE__ */ React8.createElement("div", { className: "fd-draft-latest", key: `${draft.id}:${draft.picks.length}:${last.player}` }, /* @__PURE__ */ React8.createElement("span", { className: "fd-draft-pick-stamp" }, String(draft.picks.length).padStart(2, "0")), /* @__PURE__ */ React8.createElement(PlayerLink, { state, player: last.player, onPlayer, disabled: !!pending }), /* @__PURE__ */ React8.createElement("span", null, "\u2192 ", disp(state, draft.teams[last.team].captain))), blocked && /* @__PURE__ */ React8.createElement("p", { className: "fd-draft-error", role: "status" }, "Draft paused while the board is locked."), error && /* @__PURE__ */ React8.createElement("p", { className: "fd-draft-error", role: "alert" }, error), /* @__PURE__ */ React8.createElement("div", { className: `fd-draft-body${turn.complete ? " is-complete" : ""}` }, !turn.complete && /* @__PURE__ */ React8.createElement("section", { className: "fd-draft-available", "aria-label": "Available players" }, /* @__PURE__ */ React8.createElement("div", { className: "fd-draft-section-title" }, /* @__PURE__ */ React8.createElement("h3", null, canPick ? "Make your pick" : "Available"), /* @__PURE__ */ React8.createElement("span", null, turn.remaining, " left")), /* @__PURE__ */ React8.createElement("div", { className: "fd-draft-pool" }, draft.pool.map((player) => /* @__PURE__ */ React8.createElement("div", { className: "fd-draft-candidate", key: player, style: identityStyle(state, player) }, /* @__PURE__ */ React8.createElement(
    "button",
    {
      type: "button",
      className: "fd-draft-avatar-link",
      disabled: !!pending || !onPlayer,
      onClick: () => onPlayer?.(player),
      "aria-label": `View ${disp(state, player)}'s player card`
    },
    /* @__PURE__ */ React8.createElement(Avatar, { state, p: player, size: 36 })
  ), /* @__PURE__ */ React8.createElement(
    "button",
    {
      type: "button",
      className: "fd-draft-pick",
      disabled: !canPick || !!pending,
      "aria-label": `Draft ${disp(state, player)}`,
      onClick: () => pick(player)
    },
    /* @__PURE__ */ React8.createElement("span", null, disp(state, player)),
    /* @__PURE__ */ React8.createElement("small", null, pending === `pick:${player}` ? "Picking\u2026" : canPick ? "Pick +" : "Available")
  ))))), /* @__PURE__ */ React8.createElement("section", { "aria-label": "Draft teams" }, /* @__PURE__ */ React8.createElement("div", { className: "fd-draft-section-title" }, /* @__PURE__ */ React8.createElement("h3", null, "Teams"), /* @__PURE__ */ React8.createElement("span", null, turn.pickIndex, "/", turn.totalPicks, " picks")), /* @__PURE__ */ React8.createElement("div", { className: "fd-draft-teams", style: { "--draft-columns": Math.min(n, 3) } }, draft.teams.map((team, index) => /* @__PURE__ */ React8.createElement(
    "section",
    {
      key: team.captain,
      className: `fd-draft-team${turn.teamIndex === index && !turn.complete ? " is-picking" : ""}${team.players.includes(me) ? " is-yours" : ""}`,
      style: identityStyle(state, team.captain),
      "aria-label": `${disp(state, team.captain)}'s team`
    },
    /* @__PURE__ */ React8.createElement("header", null, /* @__PURE__ */ React8.createElement("small", null, team.players.includes(me) ? "Your team" : `Team ${index + 1}`), /* @__PURE__ */ React8.createElement("span", null, team.players.length, "/", size)),
    /* @__PURE__ */ React8.createElement(PlayerLink, { state, player: team.captain, onPlayer, disabled: !!pending }),
    /* @__PURE__ */ React8.createElement("small", { className: "fd-draft-captain-label" }, "Captain"),
    /* @__PURE__ */ React8.createElement("ol", null, Array.from({ length: size - 1 }, (_, slot) => {
      const player = team.players[slot + 1];
      return /* @__PURE__ */ React8.createElement("li", { key: player || `empty:${slot}`, className: player ? `is-seated${player === last?.player ? " is-latest" : ""}` : "is-empty" }, player ? /* @__PURE__ */ React8.createElement(PlayerLink, { state, player, onPlayer, disabled: !!pending }) : /* @__PURE__ */ React8.createElement(React8.Fragment, null, /* @__PURE__ */ React8.createElement("span", { className: "fd-draft-empty-chip", "aria-hidden": "true" }), /* @__PURE__ */ React8.createElement("span", null, "Pick ", Array.from({ length: turn.totalPicks }, (_2, k) => k).filter((k) => snakeTeam(k, n) === index)[slot] + 1)));
    }))
  ))))), !!crew.length && /* @__PURE__ */ React8.createElement(DraftCrew, { state, roles: crew, onPlayer, disabled: !!pending }), gm && /* @__PURE__ */ React8.createElement("div", { className: "fd-draft-footer" }, turn.complete && /* @__PURE__ */ React8.createElement(
    ActionButton,
    {
      disabled: blocked,
      pending: !!pending,
      onClick: () => submit("finish", () => onFinalize(ref), onClose)
    },
    "Confirm teams"
  ), /* @__PURE__ */ React8.createElement("div", { className: "fd-draft-secondary-actions" }, /* @__PURE__ */ React8.createElement(
    ActionButton,
    {
      compact: true,
      variant: "secondary",
      disabled: !draft.picks.length || blocked || !!pending,
      onClick: () => submit("undo", () => onUndo(ref))
    },
    "Undo last pick"
  ), /* @__PURE__ */ React8.createElement(ActionButton, { compact: true, variant: "tertiary", disabled: blocked || !!pending, onClick: () => setConfirmCancel((value) => !value) }, "Cancel draft")), confirmCancel && /* @__PURE__ */ React8.createElement("div", { className: "fd-draft-cancel" }, /* @__PURE__ */ React8.createElement("p", null, "Discard this draft and its picks?"), /* @__PURE__ */ React8.createElement(
    ActionButton,
    {
      compact: true,
      variant: "destructive",
      pending: !!pending,
      onClick: () => submit("cancel", () => onCancel(ref), onClose)
    },
    "Discard draft"
  ), /* @__PURE__ */ React8.createElement(ActionButton, { compact: true, variant: "secondary", disabled: !!pending, onClick: () => setConfirmCancel(false) }, "Keep drafting")))));
}
function DraftCrew({ state, roles, onPlayer, disabled }) {
  return /* @__PURE__ */ React8.createElement("div", { className: "fd-draft-crew" }, /* @__PURE__ */ React8.createElement("small", null, "Crew"), roles.map(({ player, role }) => /* @__PURE__ */ React8.createElement("div", { key: player }, /* @__PURE__ */ React8.createElement(PlayerLink, { state, player, onPlayer, disabled }), /* @__PURE__ */ React8.createElement("span", null, overflowRoleMeta(role).label))));
}

// src/features/home/HomeDuels.jsx
init_core();
init_PlayerIdentity();
import React9, { useRef as useRef5, useState as useState6 } from "react";

// src/ui/AppChrome.jsx
init_PlayerIdentity();
import React11 from "react";

// src/ui/Brand.jsx
import React10 from "react";

// src/ui/AppChrome.jsx
init_controls();

// src/features/home/GuestHome.jsx
init_core();
init_PlayerIdentity();
import React14 from "react";

// src/ui/layout.jsx
import React12 from "react";
function PageHeading({ kicker, title, children, aside }) {
  return /* @__PURE__ */ React12.createElement("header", { className: "fd-page-heading" }, kicker && /* @__PURE__ */ React12.createElement("div", { className: "fd-kicker" }, kicker), /* @__PURE__ */ React12.createElement("div", { className: "fd-page-heading-row" }, /* @__PURE__ */ React12.createElement("h1", null, title), aside), children);
}

// src/features/standings/Standings.jsx
init_core();
init_PlayerIdentity();
init_controls();
import React13, { useMemo } from "react";

// src/features/home/homeModel.js
init_core();

// src/features/weekend/Schedule.jsx
init_core();
init_PlayerIdentity();
import React15, { useRef as useRef6, useState as useState7 } from "react";

// src/features/weekend/Guide.jsx
init_core();
import React18, { useState as useState10 } from "react";
init_Travel();
init_InstallHint();
init_install();

// src/features/wagers/Wagers.jsx
init_core();
init_theme();
init_controls();
import React19, { useEffect as useEffect5, useMemo as useMemo2, useRef as useRef7, useState as useState11 } from "react";
init_PlayerIdentity();
var fmt = (n) => (n ?? 0).toLocaleString("en-US");
function wagerPickLabel(state, w, events) {
  const ev = events.find((e) => e.id === w.eventId);
  const evName = ev?.name || "removed event";
  const pickName = w.pickTeam || w.pickPlayers?.length > 1 ? teamLabel(state, { players: w.pickPlayers }) : disp(state, w.pickPlayers ? w.pickPlayers[0] : w.pick);
  if (w.kind === "outright") return { pick: pickName, ctx: `to win ${evName}` };
  if (w.kind === "match") return { pick: pickName, ctx: `to win the ${w.matchName || "matchup"} in ${evName}` };
  if (w.kind === "heat") return { pick: pickName, ctx: `to win ${w.groupName || "the heat"} in ${evName}` };
  if (w.final) return { pick: pickName, ctx: `to win the Final in ${evName}` };
  return { pick: pickName, ctx: `to advance from ${w.groupName} in ${evName}` };
}
var RACK_DENOMS = [PT, 2 * PT, 5 * PT, 10 * PT];
function mergeWagerLines(list) {
  const key = ({ w, r }) => [
    w.player,
    r.status,
    w.kind,
    w.eventId,
    w.kind === "outright" ? w.pickTeam ? "t:" + w.drawId + ":" + (w.pickPlayers || []).join("+") : "p:" + w.pick : w.kind === "match" ? "m:" + w.drawId + ":" + (w.match || []).join("-") + ":" + w.teamIdx : "s:" + w.stagesId + ":" + (w.final ? "F" : w.group) + ":" + w.pickKey
  ].join("|");
  const out = /* @__PURE__ */ new Map();
  for (const x of list) {
    const k = key(x), cur = out.get(k);
    if (!cur) out.set(k, { w: { ...x.w, ids: [x.w.id] }, r: { ...x.r } });
    else {
      cur.w.stake += x.w.stake;
      cur.w.ids.push(x.w.id);
      if (typeof x.r.delta === "number") cur.r.delta = (cur.r.delta || 0) + x.r.delta;
    }
  }
  return [...out.values()];
}
function MarketPick({
  state,
  me,
  players,
  name,
  bets,
  marketOpen,
  canPick,
  onPick,
  onRetract,
  onPlayer,
  roleLabel,
  unavailableReason,
  tapStake
}) {
  const [pendingAction, setPendingAction] = useState11(null);
  const [actionError, setActionError] = useState11(null);
  const pendingRef = useRef7(false);
  const mine = bets.filter((x) => x.w.player === me).sort((a, b) => {
    const latest = ({ w }) => w.chips?.[w.chips.length - 1]?.ts || w.updatedAt || w.ts || 0;
    return latest(a) - latest(b);
  });
  const mineTotal = mine.reduce((total, x) => total + x.w.stake, 0);
  const mineChips = mine.flatMap(({ w }) => w.chips?.length ? w.chips.map((chip) => chip.stake) : [w.stake]);
  const otherBets = /* @__PURE__ */ new Map();
  for (const { w } of bets.filter((x) => x.w.player !== me))
    otherBets.set(w.player, (otherBets.get(w.player) || 0) + w.stake);
  const otherChips = [...otherBets].map(([p, val]) => ({ p, val }));
  const act = (kind, callback) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPendingAction(kind);
    setActionError(null);
    const finish = () => {
      pendingRef.current = false;
      setPendingAction(null);
    };
    const check = (result) => {
      if (result?.ok === false) setActionError(result.error || "Bet not saved.");
      return result;
    };
    const fail = (error) => {
      const message = error?.message || "Bet not saved.";
      setActionError(message);
      return { ok: false, error: message };
    };
    try {
      const result = callback();
      if (result?.then) return Promise.resolve(result).then(check, fail).finally(finish);
      finish();
      return check(result);
    } catch (error) {
      finish();
      return fail(error);
    }
  };
  const stack = mineTotal > 0 && /* @__PURE__ */ React19.createElement(React19.Fragment, null, /* @__PURE__ */ React19.createElement("span", { className: "fd-wagers-chip-pile", "aria-hidden": "true" }, mineChips.slice(-3).map((value, index, visible) => /* @__PURE__ */ React19.createElement(
    "span",
    {
      key: `${mineTotal}:${index}`,
      "data-chip-stake": value,
      style: { "--chip-level": index, "--chip-count": visible.length }
    },
    /* @__PURE__ */ React19.createElement(BankChip, { p: me, size: 36, val: value })
  )), marketOpen && /* @__PURE__ */ React19.createElement("span", { className: "fd-wagers-chip-remove" }, "\u2212")), /* @__PURE__ */ React19.createElement("span", { className: "fd-wagers-chip-total" }, fmt(mineTotal)));
  return /* @__PURE__ */ React19.createElement("div", { className: `fd-wagers-pick${mineTotal ? " is-mine" : ""}${roleLabel ? " is-your-side" : ""}${unavailableReason ? " is-unavailable" : ""}${pendingAction ? ` is-pending-${pendingAction}` : ""}` }, /* @__PURE__ */ React19.createElement("div", { className: "fd-wagers-pick-identity" }, roleLabel && /* @__PURE__ */ React19.createElement("span", { className: "fd-wagers-pick-role" }, roleLabel), players.length === 1 ? /* @__PURE__ */ React19.createElement(
    "button",
    {
      type: "button",
      className: "fd-wagers-player",
      disabled: !onPlayer,
      onClick: () => onPlayer?.(players[0]),
      "aria-label": `View ${name}'s player card`
    },
    /* @__PURE__ */ React19.createElement(Avatar, { state, p: players[0], size: 26 }),
    /* @__PURE__ */ React19.createElement("span", null, name)
  ) : /* @__PURE__ */ React19.createElement(React19.Fragment, null, players.length > 2 && /* @__PURE__ */ React19.createElement("span", { className: "fd-wagers-team-name" }, name), /* @__PURE__ */ React19.createElement("span", { className: "fd-wagers-team-players" }, players.map((player) => /* @__PURE__ */ React19.createElement(
    "button",
    {
      type: "button",
      key: player,
      disabled: !onPlayer,
      onClick: () => onPlayer?.(player),
      title: disp(state, player),
      "aria-label": `View ${disp(state, player)}'s player card`
    },
    /* @__PURE__ */ React19.createElement(Avatar, { state, p: player, size: 24 }),
    /* @__PURE__ */ React19.createElement("span", null, disp(state, player))
  ))))), /* @__PURE__ */ React19.createElement("div", { className: "fd-wagers-pick-surface", "aria-busy": !!pendingAction }, /* @__PURE__ */ React19.createElement(
    "button",
    {
      type: "button",
      className: "fd-wagers-pick-main",
      disabled: !canPick || !!pendingAction,
      onClick: () => act("place", onPick),
      "aria-label": canPick ? `Place a chip on ${name}` : name,
      "aria-description": unavailableReason || (canPick ? `Add ${fmt(tapStake)} chips` : void 0)
    },
    unavailableReason ? /* @__PURE__ */ React19.createElement("span", { className: "fd-wagers-pick-closed" }, "Opponent") : marketOpen && players.length > 0 ? /* @__PURE__ */ React19.createElement(React19.Fragment, null, /* @__PURE__ */ React19.createElement("span", { className: "fd-wagers-chip-well", "aria-hidden": "true" }, "+"), /* @__PURE__ */ React19.createElement("span", { className: "fd-wagers-pick-add" }, fmt(tapStake))) : /* @__PURE__ */ React19.createElement("span", { className: "fd-wagers-pick-closed" }, players.length ? "Locked" : "Pending")
  ), mineTotal > 0 && (marketOpen ? /* @__PURE__ */ React19.createElement(
    "button",
    {
      type: "button",
      className: "fd-wagers-retract",
      disabled: !!pendingAction,
      onClick: () => act("remove", () => onRetract(mine[mine.length - 1].w.id)),
      "aria-label": `Retract your last chip on ${name}`,
      "aria-description": `Remove ${fmt(mineChips[mineChips.length - 1])} chips; ${fmt(mineTotal)} total on this pick`
    },
    stack
  ) : /* @__PURE__ */ React19.createElement("div", { className: "fd-wagers-owned-stack", "aria-label": `${fmt(mineTotal)} of your chips on ${name}` }, stack))), otherChips.length > 0 && /* @__PURE__ */ React19.createElement("div", { className: "fd-wagers-other-chips", role: "group", "aria-label": `Other bets on ${name}` }, otherChips.map((chip) => /* @__PURE__ */ React19.createElement(
    "button",
    {
      type: "button",
      key: chip.p,
      disabled: !onPlayer,
      onClick: () => onPlayer?.(chip.p),
      title: `${disp(state, chip.p)} \xB7 ${fmt(chip.val)}`,
      "aria-label": `View ${disp(state, chip.p)}'s player card (${fmt(chip.val)} chips)`
    },
    /* @__PURE__ */ React19.createElement(BankChip, { p: chip.p, size: 25, val: chip.val })
  ))), actionError && /* @__PURE__ */ React19.createElement("p", { className: "fd-wagers-pick-error", role: "alert" }, actionError));
}
function WagerLine({ x, state, events, gm, onVoid, onPlayer }) {
  const { w, r } = x;
  const label2 = wagerPickLabel(state, w, events);
  const win = w.kind === "outright" ? OUTRIGHT_MULT * w.stake : w.stake;
  return /* @__PURE__ */ React19.createElement("article", { className: `fd-wagers-line is-${r.status}` }, /* @__PURE__ */ React19.createElement(
    "button",
    {
      type: "button",
      className: "fd-wagers-ledger-player",
      disabled: !onPlayer,
      onClick: () => onPlayer?.(w.player),
      "aria-label": `View ${disp(state, w.player)}'s player card`
    },
    /* @__PURE__ */ React19.createElement(Avatar, { state, p: w.player, size: 32 })
  ), /* @__PURE__ */ React19.createElement("div", { className: "fd-wagers-line-copy" }, /* @__PURE__ */ React19.createElement("span", { className: "fd-wagers-line-bettor" }, /* @__PURE__ */ React19.createElement(
    "button",
    {
      type: "button",
      disabled: !onPlayer,
      onClick: () => onPlayer?.(w.player)
    },
    disp(state, w.player)
  ), " ", /* @__PURE__ */ React19.createElement("span", null, "\xB7 ", fmt(w.stake), " chips")), /* @__PURE__ */ React19.createElement("strong", null, label2.pick), /* @__PURE__ */ React19.createElement("span", { className: "fd-wagers-line-context" }, label2.ctx)), /* @__PURE__ */ React19.createElement("div", { className: "fd-wagers-line-result" }, r.status === "pending" && /* @__PURE__ */ React19.createElement(React19.Fragment, null, /* @__PURE__ */ React19.createElement("small", null, "TO WIN"), /* @__PURE__ */ React19.createElement("strong", null, "+", fmt(win))), r.status === "won" && /* @__PURE__ */ React19.createElement(React19.Fragment, null, /* @__PURE__ */ React19.createElement("small", null, "WON"), /* @__PURE__ */ React19.createElement("strong", null, "+", fmt(r.delta))), r.status === "lost" && /* @__PURE__ */ React19.createElement(React19.Fragment, null, /* @__PURE__ */ React19.createElement("small", null, "LOST"), /* @__PURE__ */ React19.createElement("strong", null, fmt(r.delta))), r.status === "void" && /* @__PURE__ */ React19.createElement("small", null, "VOID"), gm && r.status === "pending" && /* @__PURE__ */ React19.createElement(
    ActionButton,
    {
      compact: true,
      variant: "destructive",
      className: "fd-wagers-void",
      onClick: () => onVoid(w.ids || [w.id])
    },
    "Void"
  )));
}
function contestPick(contest, side, event) {
  const common = {
    eventId: event.id,
    evName: event.name,
    contestId: contest.id,
    contestRevision: contest.revision,
    pickPlayers: [...side.players]
  };
  if (contest.kind === "ffa") {
    const pickTeam2 = typeof side.key === "number";
    return {
      ...common,
      kind: "outright",
      pickTeam: pickTeam2,
      ...pickTeam2 ? { drawId: contest.drawId } : { pick: side.key }
    };
  }
  if (contest.kind === "match") return {
    ...common,
    kind: "match",
    pickTeam: true,
    drawId: contest.drawId,
    match: [...contest.match],
    teamIdx: side.key,
    matchName: contest.label
  };
  const pickTeam = typeof side.key === "number";
  const stage = {
    ...common,
    stagesId: contest.stagesId,
    pickKey: side.key,
    pickTeam,
    ...pickTeam && contest.drawId ? { drawId: contest.drawId } : {}
  };
  return contest.kind === "heat" ? { ...stage, kind: "heat", group: contest.group, groupName: contest.label } : { ...stage, kind: "stage", final: true };
}
function samePick(wager, pick) {
  if (wager.kind !== pick.kind || wager.eventId !== pick.eventId) return false;
  if (wager.contestId && pick.contestId && wager.contestId !== pick.contestId) return false;
  if (pick.kind === "outright") return !!wager.pickTeam === !!pick.pickTeam && (pick.pickTeam ? wager.drawId === pick.drawId && (wager.pickPlayers || []).join("|") === pick.pickPlayers.join("|") : wager.pick === pick.pick);
  if (pick.kind === "match") return wager.drawId === pick.drawId && wager.teamIdx === pick.teamIdx && wager.match?.[0] === pick.match[0] && wager.match?.[1] === pick.match[1];
  return wager.stagesId === pick.stagesId && wager.pickKey === pick.pickKey && !!wager.final === !!pick.final && (pick.final || wager.group === pick.group);
}
function Wagers({ state, me, standings, gm, events, wagerEv, onEvents, onEvent, onPick, onVoid, onRetract, onPlayer, GameMark: GameMark2 }) {
  const [settledOpen, setSettledOpen] = useState11(null);
  const [denom, setDenom] = useState11(PT);
  const resolved = useMemo2(
    () => (state.wagers || []).map((w) => ({ w, r: resolveWager(state, w, events) })),
    [state, events]
  );
  const pending = resolved.filter((x) => x.r.status === "pending");
  const pendingLines = mergeWagerLines(pending);
  const settledLines = mergeWagerLines(resolved.filter((x) => x.r.status !== "pending"));
  const settledByPlayer = useMemo2(() => {
    const groups = /* @__PURE__ */ new Map();
    for (const x of settledLines) {
      const group = groups.get(x.w.player) || { player: x.w.player, lines: [], net: 0 };
      group.lines.push(x);
      group.net += x.r.delta || 0;
      groups.set(x.w.player, group);
    }
    return [...groups.values()].sort((a, b) => b.net - a.net || a.player.localeCompare(b.player));
  }, [settledLines]);
  const wagerRisk = me ? atRisk(state, me, events) : 0;
  const myPts = standings.find((row) => row.player === me)?.pts ?? 0;
  const myCap = maxRisk(myPts);
  const duelAntes = me ? (state.duels || []).filter((duel) => duel.status === "open" && !resolveDuel(duel).settled && (duel.from === me || duel.to === me)).reduce((sum, duel) => sum + duel.stake, 0) : 0;
  const myExp = wagerRisk + duelAntes;
  const room = me ? Math.max(0, Math.min(myCap - myExp, myPts - myExp)) : 0;
  useEffect5(() => {
    if (denom > PT && room >= PT && denom > room)
      setDenom([...RACK_DENOMS].reverse().find((value) => value <= room) || PT);
  }, [room, denom]);
  const tapStake = denom <= room ? denom : [...RACK_DENOMS].reverse().find((value) => value <= room) || PT;
  const ev = wagerEv;
  const contest = ev ? resolveCurrentContest(state, ev) : null;
  const lifecycle = ev ? resolveEventLifecycle(state, ev) : null;
  const marketOpen = !!contest && contest.phase === "betting-open" && !!state.live && !state.frozen && !state.results?.[ev?.id] && !stacksPosted(state) && !(state.poker && !state.results?.[state.poker.id]);
  const ownSide = contest?.sides.find((side) => side.players.includes(me));
  const restricted = !!ownSide && contest.kind !== "ffa";
  const contestNoun = contest?.kind === "match" ? "match" : contest?.kind === "heat" ? "heat" : "final";
  const restriction = restricted ? `You can only bet on ${ownSide.players.length > 1 ? "your team" : "yourself"} in this ${contestNoun}.` : null;
  const picks = (contest?.sides || []).map((side) => {
    const own = side.players.includes(me);
    const drawnTeam = typeof side.key === "number" ? state.draws?.[ev.id]?.teams?.[side.key] : null;
    const name = side.players.length === 1 ? disp(state, side.players[0]) : teamLabel(state, drawnTeam || { players: side.players });
    const pick = contestPick(contest, side, ev);
    const eligible = !!me && contestBetEligibility(contest, me, side.key);
    return {
      key: side.key,
      state,
      me,
      players: side.players,
      name,
      marketOpen,
      onRetract: (id) => onRetract(id, { contestId: contest.id, contestRevision: contest.revision }),
      onPlayer,
      tapStake,
      bets: pending.filter((x) => samePick(x.w, pick)),
      roleLabel: own ? side.players.length > 1 ? "Your team" : "Back yourself" : null,
      unavailableReason: restricted && !eligible ? restriction : null,
      canPick: marketOpen && room >= PT && eligible,
      onPick: () => onPick({ ...pick, stake: tapStake })
    };
  });
  const status = marketOpen ? "Betting open" : contest?.phase === "awaiting-result" ? "Awaiting result" : !contest ? lifecycle?.label || "Betting locked" : "Betting locked";
  const contextLabel = contest?.kind === "match" || state.brackets?.[ev?.id] ? "Full bracket" : contest?.kind === "heat" || contest?.kind === "stage-final" || state.stages?.[ev?.id] ? "Heats and final" : "Event details";
  return /* @__PURE__ */ React19.createElement(
    "div",
    {
      className: `fd-wagers${me && marketOpen ? " has-rack" : ""}`,
      style: { "--fd-wagers-numerals": DISPLAY, "--fd-wagers-body": SANS }
    },
    ev ? /* @__PURE__ */ React19.createElement("header", { className: "fd-wagers-event-heading" }, /* @__PURE__ */ React19.createElement("div", null, /* @__PURE__ */ React19.createElement("h1", null, ev.name), GameMark2 && /* @__PURE__ */ React19.createElement(GameMark2, { id: ev.game, size: 34 })), /* @__PURE__ */ React19.createElement("div", { className: "fd-wagers-event-meta" }, /* @__PURE__ */ React19.createElement("span", { className: `fd-wagers-status${marketOpen ? " is-open" : ""}` }, /* @__PURE__ */ React19.createElement("i", { "aria-hidden": "true" }), status), marketOpen && /* @__PURE__ */ React19.createElement("p", null, "Tap + to add. Tap your chips to remove."))) : /* @__PURE__ */ React19.createElement(PageHeading, { title: "Bets" }),
    !ev && /* @__PURE__ */ React19.createElement("section", { className: `fd-wagers-waiting${state.frozen ? " is-finished" : ""}` }, /* @__PURE__ */ React19.createElement("div", { className: "fd-wagers-waiting-copy" }, /* @__PURE__ */ React19.createElement("h2", null, state.frozen ? "The board is frozen." : state.live ? "Between events" : "Betting opens with the first event"), !state.frozen && /* @__PURE__ */ React19.createElement("p", null, "Betting opens when an event goes on deck."), !state.frozen && /* @__PURE__ */ React19.createElement(ActionButton, { variant: "secondary", onClick: onEvents }, "Browse the events"))),
    ev && /* @__PURE__ */ React19.createElement("section", { className: "fd-wagers-event" }, /* @__PURE__ */ React19.createElement("div", { className: "fd-wagers-contest-heading" }, /* @__PURE__ */ React19.createElement("div", null, /* @__PURE__ */ React19.createElement("h2", null, contest?.kind === "ffa" ? "Winner" : contest?.label || "Bets"), contest && /* @__PURE__ */ React19.createElement("p", null, contest.kind === "ffa" ? "Pays 2 to 1" : "Winner pays even")), onEvent && /* @__PURE__ */ React19.createElement("button", { type: "button", className: "fd-wagers-context", onClick: () => onEvent(ev) }, contextLabel, /* @__PURE__ */ React19.createElement("span", { "aria-hidden": "true" }, "\u2197"))), contest && picks.length > 0 ? /* @__PURE__ */ React19.createElement(
      "section",
      {
        className: `fd-wagers-market fd-wagers-contest is-${contest.kind}`,
        "aria-label": contest.label
      },
      restriction && /* @__PURE__ */ React19.createElement("p", { className: "fd-wagers-participant-note" }, restriction),
      /* @__PURE__ */ React19.createElement("div", { className: "fd-wagers-picks" }, picks.map((pick) => /* @__PURE__ */ React19.createElement(MarketPick, { ...pick, key: `${contest.id}:${pick.key}` })))
    ) : /* @__PURE__ */ React19.createElement("p", { className: "fd-wagers-contest-waiting" }, state.results?.[ev.id] ? "Result posted." : "Waiting for the next contest."), me && marketOpen && myPts - myExp < PT && /* @__PURE__ */ React19.createElement("p", { className: "fd-wagers-limit", role: "status" }, "No chips available.")),
    pendingLines.length > 0 && /* @__PURE__ */ React19.createElement("details", { className: "fd-wagers-history", open: gm || !contest || void 0 }, /* @__PURE__ */ React19.createElement("summary", null, "Open bets ", /* @__PURE__ */ React19.createElement("span", null, pendingLines.length)), /* @__PURE__ */ React19.createElement("div", { className: "fd-wagers-ledger" }, pendingLines.map((x) => /* @__PURE__ */ React19.createElement(WagerLine, { key: x.w.id, x, state, events, gm, onVoid, onPlayer })))),
    settledLines.length > 0 && /* @__PURE__ */ React19.createElement("details", { className: "fd-wagers-history" }, /* @__PURE__ */ React19.createElement("summary", null, "Settled ", /* @__PURE__ */ React19.createElement("span", null, settledLines.length)), /* @__PURE__ */ React19.createElement("div", { className: "fd-wagers-settled-list" }, settledByPlayer.map((group) => {
      const key = `st:${group.player}`, open = settledOpen === key;
      return /* @__PURE__ */ React19.createElement("div", { className: `fd-wagers-settled${open ? " is-open" : ""}`, key: group.player }, /* @__PURE__ */ React19.createElement("div", { className: "fd-wagers-settled-row" }, /* @__PURE__ */ React19.createElement(
        "button",
        {
          type: "button",
          className: "fd-wagers-settled-person",
          disabled: !onPlayer,
          onClick: () => onPlayer?.(group.player),
          "aria-label": `View ${disp(state, group.player)}'s player card`
        },
        /* @__PURE__ */ React19.createElement(Avatar, { state, p: group.player, size: 32 }),
        /* @__PURE__ */ React19.createElement("strong", null, disp(state, group.player))
      ), /* @__PURE__ */ React19.createElement(
        "button",
        {
          type: "button",
          className: "fd-wagers-settled-toggle",
          "aria-expanded": open,
          "aria-label": `${open ? "Hide" : "View"} settled bets by ${disp(state, group.player)}`,
          onClick: () => setSettledOpen((current) => current === key ? null : key)
        },
        /* @__PURE__ */ React19.createElement("small", null, group.lines.length, " bet", group.lines.length === 1 ? "" : "s"),
        /* @__PURE__ */ React19.createElement("span", { className: `fd-wagers-net${group.net > 0 ? " is-up" : group.net < 0 ? " is-down" : ""}` }, group.net > 0 ? "+" : "", fmt(group.net)),
        /* @__PURE__ */ React19.createElement("span", { className: "fd-wagers-settled-arrow", "aria-hidden": "true" }, open ? "\u2212" : "+")
      )), open && /* @__PURE__ */ React19.createElement("div", { className: "fd-wagers-settled-detail" }, group.lines.map((x) => /* @__PURE__ */ React19.createElement(WagerLine, { key: x.w.id, x, state, events, gm, onVoid, onPlayer }))));
    }))),
    me && ev && marketOpen && /* @__PURE__ */ React19.createElement("section", { className: "fd-wagers-rack fd-night", "aria-label": "Choose your betting chip" }, /* @__PURE__ */ React19.createElement("div", { className: "fd-wagers-rack-top" }, /* @__PURE__ */ React19.createElement("span", null, /* @__PURE__ */ React19.createElement("strong", null, fmt(room)), " to bet"), /* @__PURE__ */ React19.createElement("span", null, fmt(myExp), " / ", fmt(myCap), " at risk")), /* @__PURE__ */ React19.createElement(
      "div",
      {
        className: "fd-wagers-meter",
        role: "meter",
        "aria-label": "Chips at risk",
        "aria-valuemin": 0,
        "aria-valuemax": Math.max(myCap, myExp),
        "aria-valuenow": myExp,
        "aria-valuetext": `${fmt(myExp)} at risk, ${fmt(myCap)} maximum, ${fmt(myPts)} in your stack${duelAntes ? `, ${fmt(duelAntes)} reserved for duels` : ""}`
      },
      /* @__PURE__ */ React19.createElement("span", { style: { width: `${myCap ? Math.min(100, myExp / myCap * 100) : 0}%` } })
    ), /* @__PURE__ */ React19.createElement("div", { className: "fd-wagers-denoms", role: "group", "aria-label": "Chip value per tap" }, RACK_DENOMS.map((value) => {
      const affordable = value <= room;
      return /* @__PURE__ */ React19.createElement(
        "button",
        {
          type: "button",
          key: value,
          disabled: !affordable,
          onClick: () => setDenom(value),
          "aria-pressed": tapStake === value && affordable,
          "aria-label": `Bet ${value} a tap`,
          className: tapStake === value && affordable ? "is-selected" : ""
        },
        /* @__PURE__ */ React19.createElement(BankChip, { p: me, size: 46, val: value })
      );
    })), duelAntes > 0 && /* @__PURE__ */ React19.createElement("p", { className: "fd-wagers-duel-reserve" }, "Includes ", fmt(duelAntes), " in duels"))
  );
}

// src/App.jsx
init_PlayerIdentityContext();
init_PlayerIdentity();
init_Travel();
init_ProfileEditor();
import React26, { useState as useState17, useEffect as useEffect9, useLayoutEffect, useRef as useRef12, useMemo as useMemo3, useCallback as useCallback2, useId as useId3, lazy, Suspense } from "react";

// src/features/profile/PlayerSheet.jsx
init_core();
init_PlayerIdentity();
init_controls();
init_PlayerPass();
import React23, { useEffect as useEffect7, useRef as useRef10, useState as useState15 } from "react";
var ANTES = [PT, 2 * PT, 5 * PT, 10 * PT];
var fmt2 = (n) => (n ?? 0).toLocaleString("en-US");
var signed = (n) => `${n > 0 ? "+" : ""}${fmt2(n)}`;
function PlayerSheet({ state, me, p, standings, events = [], onClose, onBack, onEdit, onDuel }) {
  const [ante, setAnte] = useState15(PT);
  const [pending, setPending] = useState15(false);
  const [error, setError] = useState15("");
  const sending = useRef10(false);
  const row = standings.find((item) => item.player === p);
  const duels = state.duels || [];
  const openDuels = duels.filter((d) => d.status === "open" && !resolveDuel(d).settled);
  const settled = duels.map((d) => resolveDuel(d)).filter((result) => result.settled && !result.push);
  const duelWins = settled.filter((result) => result.winner === p).length;
  const duelLosses = settled.filter((result) => result.loser === p).length;
  const wins = events.filter((event) => state.results[event.id]?.slots?.[0]?.includes(p));
  const existingDuel = openDuels.some((d) => d.from === me && d.to === p || d.from === p && d.to === me);
  const tableOpen = state.poker && !state.results[state.poker.id];
  const canDuel = !!(onDuel && me && me !== p && state.live && !state.frozen && !tableOpen && !pokerLive(state) && !stacksPosted(state));
  const spendable = (player) => {
    const pts = standings.find((item) => item.player === player)?.pts ?? 0;
    const committed = openDuels.filter((d) => d.from === player || d.to === player).reduce((total, d) => total + d.stake, 0);
    const exposure = atRisk(state, player, events) + committed;
    return Math.min(maxRisk(pts) - exposure, pts - exposure);
  };
  const anteMax = canDuel ? Math.min(spendable(me), spendable(p)) : 0;
  const dailyLimit = duels.filter((d) => d.from === me && d.status !== "declined" && d.ts > Date.now() - 24 * 60 * 60 * 1e3).length >= 3;
  const unavailable = existingDuel ? "A challenge between you two is already open." : dailyLimit ? "Three challenges a day, max." : anteMax < PT ? "Not enough chips for an ante." : "";
  useEffect7(() => {
    setAnte((current) => current <= anteMax ? current : ANTES.filter((value) => value <= anteMax).at(-1) || PT);
  }, [anteMax]);
  useEffect7(() => {
    setAnte(PT);
    setError("");
  }, [p]);
  const challenge = async () => {
    if (sending.current || !canDuel || unavailable || ante > anteMax) return;
    sending.current = true;
    setPending(true);
    setError("");
    try {
      const result = await onDuel(ante);
      if (result?.ok) onClose();
      else setError(result?.error || "Challenge wasn't sent. Try again.");
    } catch (cause) {
      setError(cause?.message || "Challenge wasn't sent. Try again.");
    } finally {
      sending.current = false;
      setPending(false);
    }
  };
  return /* @__PURE__ */ React23.createElement(Sheet, { title: disp(state, p), onClose, onBack, busy: pending }, /* @__PURE__ */ React23.createElement("div", { className: "fd-player-sheet" }, /* @__PURE__ */ React23.createElement(PlayerPass, { key: p, state, p, compact: true }), state.live && row && /* @__PURE__ */ React23.createElement("dl", { className: "fd-player-stats", "aria-label": "Tournament stats" }, /* @__PURE__ */ React23.createElement("div", null, /* @__PURE__ */ React23.createElement("dt", null, "Position"), /* @__PURE__ */ React23.createElement("dd", null, row.rank)), /* @__PURE__ */ React23.createElement("div", null, /* @__PURE__ */ React23.createElement("dt", null, "Chips"), /* @__PURE__ */ React23.createElement("dd", null, fmt2(row.pts))), /* @__PURE__ */ React23.createElement("div", null, /* @__PURE__ */ React23.createElement("dt", null, "Wins"), /* @__PURE__ */ React23.createElement("dd", null, row.wins))), state.live && row && (row.betNet !== 0 || duelWins > 0 || duelLosses > 0) && /* @__PURE__ */ React23.createElement("dl", { className: "fd-player-record" }, row.betNet !== 0 && /* @__PURE__ */ React23.createElement("div", null, /* @__PURE__ */ React23.createElement("dt", null, "Wagers"), /* @__PURE__ */ React23.createElement("dd", null, signed(row.betNet))), (duelWins > 0 || duelLosses > 0) && /* @__PURE__ */ React23.createElement("div", null, /* @__PURE__ */ React23.createElement("dt", null, "Duels"), /* @__PURE__ */ React23.createElement("dd", null, duelWins, " won \xB7 ", duelLosses, " lost", /* @__PURE__ */ React23.createElement("span", null, signed(row.duelNet), " chips")))), wins.length > 0 && /* @__PURE__ */ React23.createElement("section", { className: "fd-player-wins", "aria-label": "Event wins" }, /* @__PURE__ */ React23.createElement("h2", null, "Event wins"), /* @__PURE__ */ React23.createElement("ul", null, wins.map((event) => /* @__PURE__ */ React23.createElement("li", { key: event.id }, event.name)))), me === p && onEdit && /* @__PURE__ */ React23.createElement(
    ActionButton,
    {
      type: "button",
      variant: "secondary",
      onClick: onEdit,
      style: { width: "100%" }
    },
    "Edit your profile"
  ), canDuel && /* @__PURE__ */ React23.createElement("section", { className: "fd-player-duel", "aria-label": "Quick Draw challenge" }, /* @__PURE__ */ React23.createElement("details", { className: "fd-player-duel-rules" }, /* @__PURE__ */ React23.createElement("summary", null, /* @__PURE__ */ React23.createElement("h2", null, "Quick Draw"), /* @__PURE__ */ React23.createElement("span", null, "How to play +")), /* @__PURE__ */ React23.createElement("p", null, "You both play on your own phone whenever you want. The screen flashes after a random wait, tap it. Fastest tap wins the pot. Tapping early is a foul.")), unavailable ? /* @__PURE__ */ React23.createElement("p", { className: "fd-player-unavailable", role: "status" }, unavailable) : /* @__PURE__ */ React23.createElement(React23.Fragment, null, /* @__PURE__ */ React23.createElement("fieldset", { className: "fd-player-antes", disabled: pending }, /* @__PURE__ */ React23.createElement("legend", null, "Ante, each"), ANTES.map((value) => /* @__PURE__ */ React23.createElement(
    "button",
    {
      type: "button",
      key: value,
      disabled: value > anteMax || pending,
      "aria-pressed": ante === value,
      "aria-label": `Ante ${fmt2(value)} chips each`,
      onClick: () => setAnte(value)
    },
    /* @__PURE__ */ React23.createElement(BankChip, { p: me, size: 44, val: value })
  ))), error && /* @__PURE__ */ React23.createElement("p", { className: "fd-player-error", role: "alert" }, error), /* @__PURE__ */ React23.createElement(
    ActionButton,
    {
      type: "button",
      onClick: challenge,
      disabled: pending || ante > anteMax,
      pending,
      style: { width: "100%" }
    },
    pending ? "Sending\u2026" : `Challenge ${disp(state, p)} for ${fmt2(ante)}`
  )))));
}

// src/App.jsx
init_InstallHint();
init_install();

// node_modules/qrcode-generator/dist/qrcode.mjs
var qrcode = function(typeNumber, errorCorrectionLevel) {
  const PAD0 = 236;
  const PAD1 = 17;
  let _typeNumber = typeNumber;
  const _errorCorrectionLevel = QRErrorCorrectionLevel[errorCorrectionLevel];
  let _modules = null;
  let _moduleCount = 0;
  let _dataCache = null;
  const _dataList = [];
  const _this = {};
  const makeImpl = function(test, maskPattern) {
    _moduleCount = _typeNumber * 4 + 17;
    _modules = (function(moduleCount) {
      const modules = new Array(moduleCount);
      for (let row = 0; row < moduleCount; row += 1) {
        modules[row] = new Array(moduleCount);
        for (let col = 0; col < moduleCount; col += 1) {
          modules[row][col] = null;
        }
      }
      return modules;
    })(_moduleCount);
    setupPositionProbePattern(0, 0);
    setupPositionProbePattern(_moduleCount - 7, 0);
    setupPositionProbePattern(0, _moduleCount - 7);
    setupPositionAdjustPattern();
    setupTimingPattern();
    setupTypeInfo(test, maskPattern);
    if (_typeNumber >= 7) {
      setupTypeNumber(test);
    }
    if (_dataCache == null) {
      _dataCache = createData(_typeNumber, _errorCorrectionLevel, _dataList);
    }
    mapData(_dataCache, maskPattern);
  };
  const setupPositionProbePattern = function(row, col) {
    for (let r = -1; r <= 7; r += 1) {
      if (row + r <= -1 || _moduleCount <= row + r) continue;
      for (let c = -1; c <= 7; c += 1) {
        if (col + c <= -1 || _moduleCount <= col + c) continue;
        if (0 <= r && r <= 6 && (c == 0 || c == 6) || 0 <= c && c <= 6 && (r == 0 || r == 6) || 2 <= r && r <= 4 && 2 <= c && c <= 4) {
          _modules[row + r][col + c] = true;
        } else {
          _modules[row + r][col + c] = false;
        }
      }
    }
  };
  const getBestMaskPattern = function() {
    let minLostPoint = 0;
    let pattern = 0;
    for (let i = 0; i < 8; i += 1) {
      makeImpl(true, i);
      const lostPoint = QRUtil.getLostPoint(_this);
      if (i == 0 || minLostPoint > lostPoint) {
        minLostPoint = lostPoint;
        pattern = i;
      }
    }
    return pattern;
  };
  const setupTimingPattern = function() {
    for (let r = 8; r < _moduleCount - 8; r += 1) {
      if (_modules[r][6] != null) {
        continue;
      }
      _modules[r][6] = r % 2 == 0;
    }
    for (let c = 8; c < _moduleCount - 8; c += 1) {
      if (_modules[6][c] != null) {
        continue;
      }
      _modules[6][c] = c % 2 == 0;
    }
  };
  const setupPositionAdjustPattern = function() {
    const pos = QRUtil.getPatternPosition(_typeNumber);
    for (let i = 0; i < pos.length; i += 1) {
      for (let j = 0; j < pos.length; j += 1) {
        const row = pos[i];
        const col = pos[j];
        if (_modules[row][col] != null) {
          continue;
        }
        for (let r = -2; r <= 2; r += 1) {
          for (let c = -2; c <= 2; c += 1) {
            if (r == -2 || r == 2 || c == -2 || c == 2 || r == 0 && c == 0) {
              _modules[row + r][col + c] = true;
            } else {
              _modules[row + r][col + c] = false;
            }
          }
        }
      }
    }
  };
  const setupTypeNumber = function(test) {
    const bits = QRUtil.getBCHTypeNumber(_typeNumber);
    for (let i = 0; i < 18; i += 1) {
      const mod = !test && (bits >> i & 1) == 1;
      _modules[Math.floor(i / 3)][i % 3 + _moduleCount - 8 - 3] = mod;
    }
    for (let i = 0; i < 18; i += 1) {
      const mod = !test && (bits >> i & 1) == 1;
      _modules[i % 3 + _moduleCount - 8 - 3][Math.floor(i / 3)] = mod;
    }
  };
  const setupTypeInfo = function(test, maskPattern) {
    const data = _errorCorrectionLevel << 3 | maskPattern;
    const bits = QRUtil.getBCHTypeInfo(data);
    for (let i = 0; i < 15; i += 1) {
      const mod = !test && (bits >> i & 1) == 1;
      if (i < 6) {
        _modules[i][8] = mod;
      } else if (i < 8) {
        _modules[i + 1][8] = mod;
      } else {
        _modules[_moduleCount - 15 + i][8] = mod;
      }
    }
    for (let i = 0; i < 15; i += 1) {
      const mod = !test && (bits >> i & 1) == 1;
      if (i < 8) {
        _modules[8][_moduleCount - i - 1] = mod;
      } else if (i < 9) {
        _modules[8][15 - i - 1 + 1] = mod;
      } else {
        _modules[8][15 - i - 1] = mod;
      }
    }
    _modules[_moduleCount - 8][8] = !test;
  };
  const mapData = function(data, maskPattern) {
    let inc = -1;
    let row = _moduleCount - 1;
    let bitIndex = 7;
    let byteIndex = 0;
    const maskFunc = QRUtil.getMaskFunction(maskPattern);
    for (let col = _moduleCount - 1; col > 0; col -= 2) {
      if (col == 6) col -= 1;
      while (true) {
        for (let c = 0; c < 2; c += 1) {
          if (_modules[row][col - c] == null) {
            let dark = false;
            if (byteIndex < data.length) {
              dark = (data[byteIndex] >>> bitIndex & 1) == 1;
            }
            const mask = maskFunc(row, col - c);
            if (mask) {
              dark = !dark;
            }
            _modules[row][col - c] = dark;
            bitIndex -= 1;
            if (bitIndex == -1) {
              byteIndex += 1;
              bitIndex = 7;
            }
          }
        }
        row += inc;
        if (row < 0 || _moduleCount <= row) {
          row -= inc;
          inc = -inc;
          break;
        }
      }
    }
  };
  const createBytes = function(buffer, rsBlocks) {
    let offset = 0;
    let maxDcCount = 0;
    let maxEcCount = 0;
    const dcdata = new Array(rsBlocks.length);
    const ecdata = new Array(rsBlocks.length);
    for (let r = 0; r < rsBlocks.length; r += 1) {
      const dcCount = rsBlocks[r].dataCount;
      const ecCount = rsBlocks[r].totalCount - dcCount;
      maxDcCount = Math.max(maxDcCount, dcCount);
      maxEcCount = Math.max(maxEcCount, ecCount);
      dcdata[r] = new Array(dcCount);
      for (let i = 0; i < dcdata[r].length; i += 1) {
        dcdata[r][i] = 255 & buffer.getBuffer()[i + offset];
      }
      offset += dcCount;
      const rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
      const rawPoly = qrPolynomial(dcdata[r], rsPoly.getLength() - 1);
      const modPoly = rawPoly.mod(rsPoly);
      ecdata[r] = new Array(rsPoly.getLength() - 1);
      for (let i = 0; i < ecdata[r].length; i += 1) {
        const modIndex = i + modPoly.getLength() - ecdata[r].length;
        ecdata[r][i] = modIndex >= 0 ? modPoly.getAt(modIndex) : 0;
      }
    }
    let totalCodeCount = 0;
    for (let i = 0; i < rsBlocks.length; i += 1) {
      totalCodeCount += rsBlocks[i].totalCount;
    }
    const data = new Array(totalCodeCount);
    let index = 0;
    for (let i = 0; i < maxDcCount; i += 1) {
      for (let r = 0; r < rsBlocks.length; r += 1) {
        if (i < dcdata[r].length) {
          data[index] = dcdata[r][i];
          index += 1;
        }
      }
    }
    for (let i = 0; i < maxEcCount; i += 1) {
      for (let r = 0; r < rsBlocks.length; r += 1) {
        if (i < ecdata[r].length) {
          data[index] = ecdata[r][i];
          index += 1;
        }
      }
    }
    return data;
  };
  const createData = function(typeNumber2, errorCorrectionLevel2, dataList) {
    const rsBlocks = QRRSBlock.getRSBlocks(typeNumber2, errorCorrectionLevel2);
    const buffer = qrBitBuffer();
    for (let i = 0; i < dataList.length; i += 1) {
      const data = dataList[i];
      buffer.put(data.getMode(), 4);
      buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber2));
      data.write(buffer);
    }
    let totalDataCount = 0;
    for (let i = 0; i < rsBlocks.length; i += 1) {
      totalDataCount += rsBlocks[i].dataCount;
    }
    if (buffer.getLengthInBits() > totalDataCount * 8) {
      throw "code length overflow. (" + buffer.getLengthInBits() + ">" + totalDataCount * 8 + ")";
    }
    if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) {
      buffer.put(0, 4);
    }
    while (buffer.getLengthInBits() % 8 != 0) {
      buffer.putBit(false);
    }
    while (true) {
      if (buffer.getLengthInBits() >= totalDataCount * 8) {
        break;
      }
      buffer.put(PAD0, 8);
      if (buffer.getLengthInBits() >= totalDataCount * 8) {
        break;
      }
      buffer.put(PAD1, 8);
    }
    return createBytes(buffer, rsBlocks);
  };
  _this.addData = function(data, mode) {
    mode = mode || "Byte";
    let newData = null;
    switch (mode) {
      case "Numeric":
        newData = qrNumber(data);
        break;
      case "Alphanumeric":
        newData = qrAlphaNum(data);
        break;
      case "Byte":
        newData = qr8BitByte(data);
        break;
      case "Kanji":
        newData = qrKanji(data);
        break;
      default:
        throw "mode:" + mode;
    }
    _dataList.push(newData);
    _dataCache = null;
  };
  _this.isDark = function(row, col) {
    if (row < 0 || _moduleCount <= row || col < 0 || _moduleCount <= col) {
      throw row + "," + col;
    }
    return _modules[row][col];
  };
  _this.getModuleCount = function() {
    return _moduleCount;
  };
  _this.make = function() {
    if (_typeNumber < 1) {
      let typeNumber2 = 1;
      for (; typeNumber2 < 40; typeNumber2++) {
        const rsBlocks = QRRSBlock.getRSBlocks(typeNumber2, _errorCorrectionLevel);
        const buffer = qrBitBuffer();
        for (let i = 0; i < _dataList.length; i++) {
          const data = _dataList[i];
          buffer.put(data.getMode(), 4);
          buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber2));
          data.write(buffer);
        }
        let totalDataCount = 0;
        for (let i = 0; i < rsBlocks.length; i++) {
          totalDataCount += rsBlocks[i].dataCount;
        }
        if (buffer.getLengthInBits() <= totalDataCount * 8) {
          break;
        }
      }
      _typeNumber = typeNumber2;
    }
    makeImpl(false, getBestMaskPattern());
  };
  _this.createTableTag = function(cellSize, margin) {
    cellSize = cellSize || 2;
    margin = typeof margin == "undefined" ? cellSize * 4 : margin;
    let qrHtml = "";
    qrHtml += '<table style="';
    qrHtml += " border-width: 0px; border-style: none;";
    qrHtml += " border-collapse: collapse;";
    qrHtml += " padding: 0px; margin: " + margin + "px;";
    qrHtml += '">';
    qrHtml += "<tbody>";
    for (let r = 0; r < _this.getModuleCount(); r += 1) {
      qrHtml += "<tr>";
      for (let c = 0; c < _this.getModuleCount(); c += 1) {
        qrHtml += '<td style="';
        qrHtml += " border-width: 0px; border-style: none;";
        qrHtml += " border-collapse: collapse;";
        qrHtml += " padding: 0px; margin: 0px;";
        qrHtml += " width: " + cellSize + "px;";
        qrHtml += " height: " + cellSize + "px;";
        qrHtml += " background-color: ";
        qrHtml += _this.isDark(r, c) ? "#000000" : "#ffffff";
        qrHtml += ";";
        qrHtml += '"/>';
      }
      qrHtml += "</tr>";
    }
    qrHtml += "</tbody>";
    qrHtml += "</table>";
    return qrHtml;
  };
  _this.createSvgTag = function(cellSize, margin, alt, title) {
    let opts = {};
    if (typeof arguments[0] == "object") {
      opts = arguments[0];
      cellSize = opts.cellSize;
      margin = opts.margin;
      alt = opts.alt;
      title = opts.title;
    }
    cellSize = cellSize || 2;
    margin = typeof margin == "undefined" ? cellSize * 4 : margin;
    alt = typeof alt === "string" ? { text: alt } : alt || {};
    alt.text = alt.text || null;
    alt.id = alt.text ? alt.id || "qrcode-description" : null;
    title = typeof title === "string" ? { text: title } : title || {};
    title.text = title.text || null;
    title.id = title.text ? title.id || "qrcode-title" : null;
    const size = _this.getModuleCount() * cellSize + margin * 2;
    let c, mc, r, mr, qrSvg = "", rect;
    rect = "l" + cellSize + ",0 0," + cellSize + " -" + cellSize + ",0 0,-" + cellSize + "z ";
    qrSvg += '<svg version="1.1" xmlns="http://www.w3.org/2000/svg"';
    qrSvg += !opts.scalable ? ' width="' + size + 'px" height="' + size + 'px"' : "";
    qrSvg += ' viewBox="0 0 ' + size + " " + size + '" ';
    qrSvg += ' preserveAspectRatio="xMinYMin meet"';
    qrSvg += title.text || alt.text ? ' role="img" aria-labelledby="' + escapeXml([title.id, alt.id].join(" ").trim()) + '"' : "";
    qrSvg += ">";
    qrSvg += title.text ? '<title id="' + escapeXml(title.id) + '">' + escapeXml(title.text) + "</title>" : "";
    qrSvg += alt.text ? '<description id="' + escapeXml(alt.id) + '">' + escapeXml(alt.text) + "</description>" : "";
    qrSvg += '<rect width="100%" height="100%" fill="white" cx="0" cy="0"/>';
    qrSvg += '<path d="';
    for (r = 0; r < _this.getModuleCount(); r += 1) {
      mr = r * cellSize + margin;
      for (c = 0; c < _this.getModuleCount(); c += 1) {
        if (_this.isDark(r, c)) {
          mc = c * cellSize + margin;
          qrSvg += "M" + mc + "," + mr + rect;
        }
      }
    }
    qrSvg += '" stroke="transparent" fill="black"/>';
    qrSvg += "</svg>";
    return qrSvg;
  };
  _this.createDataURL = function(cellSize, margin) {
    cellSize = cellSize || 2;
    margin = typeof margin == "undefined" ? cellSize * 4 : margin;
    const size = _this.getModuleCount() * cellSize + margin * 2;
    const min = margin;
    const max = size - margin;
    return createDataURL(size, size, function(x, y) {
      if (min <= x && x < max && min <= y && y < max) {
        const c = Math.floor((x - min) / cellSize);
        const r = Math.floor((y - min) / cellSize);
        return _this.isDark(r, c) ? 0 : 1;
      } else {
        return 1;
      }
    });
  };
  _this.createImgTag = function(cellSize, margin, alt) {
    cellSize = cellSize || 2;
    margin = typeof margin == "undefined" ? cellSize * 4 : margin;
    const size = _this.getModuleCount() * cellSize + margin * 2;
    let img = "";
    img += "<img";
    img += ' src="';
    img += _this.createDataURL(cellSize, margin);
    img += '"';
    img += ' width="';
    img += size;
    img += '"';
    img += ' height="';
    img += size;
    img += '"';
    if (alt) {
      img += ' alt="';
      img += escapeXml(alt);
      img += '"';
    }
    img += "/>";
    return img;
  };
  const escapeXml = function(s) {
    let escaped = "";
    for (let i = 0; i < s.length; i += 1) {
      const c = s.charAt(i);
      switch (c) {
        case "<":
          escaped += "&lt;";
          break;
        case ">":
          escaped += "&gt;";
          break;
        case "&":
          escaped += "&amp;";
          break;
        case '"':
          escaped += "&quot;";
          break;
        default:
          escaped += c;
          break;
      }
    }
    return escaped;
  };
  const _createHalfASCII = function(margin) {
    const cellSize = 1;
    margin = typeof margin == "undefined" ? cellSize * 2 : margin;
    const size = _this.getModuleCount() * cellSize + margin * 2;
    const min = margin;
    const max = size - margin;
    let y, x, r1, r2, p;
    const blocks = {
      "\u2588\u2588": "\u2588",
      "\u2588 ": "\u2580",
      " \u2588": "\u2584",
      "  ": " "
    };
    const blocksLastLineNoMargin = {
      "\u2588\u2588": "\u2580",
      "\u2588 ": "\u2580",
      " \u2588": " ",
      "  ": " "
    };
    let ascii = "";
    for (y = 0; y < size; y += 2) {
      r1 = Math.floor((y - min) / cellSize);
      r2 = Math.floor((y + 1 - min) / cellSize);
      for (x = 0; x < size; x += 1) {
        p = "\u2588";
        if (min <= x && x < max && min <= y && y < max && _this.isDark(r1, Math.floor((x - min) / cellSize))) {
          p = " ";
        }
        if (min <= x && x < max && min <= y + 1 && y + 1 < max && _this.isDark(r2, Math.floor((x - min) / cellSize))) {
          p += " ";
        } else {
          p += "\u2588";
        }
        ascii += margin < 1 && y + 1 >= max ? blocksLastLineNoMargin[p] : blocks[p];
      }
      ascii += "\n";
    }
    if (size % 2 && margin > 0) {
      return ascii.substring(0, ascii.length - size - 1) + Array(size + 1).join("\u2580");
    }
    return ascii.substring(0, ascii.length - 1);
  };
  _this.createASCII = function(cellSize, margin) {
    cellSize = cellSize || 1;
    if (cellSize < 2) {
      return _createHalfASCII(margin);
    }
    cellSize -= 1;
    margin = typeof margin == "undefined" ? cellSize * 2 : margin;
    const size = _this.getModuleCount() * cellSize + margin * 2;
    const min = margin;
    const max = size - margin;
    let y, x, r, p;
    const white = Array(cellSize + 1).join("\u2588\u2588");
    const black = Array(cellSize + 1).join("  ");
    let ascii = "";
    let line = "";
    for (y = 0; y < size; y += 1) {
      r = Math.floor((y - min) / cellSize);
      line = "";
      for (x = 0; x < size; x += 1) {
        p = 1;
        if (min <= x && x < max && min <= y && y < max && _this.isDark(r, Math.floor((x - min) / cellSize))) {
          p = 0;
        }
        line += p ? white : black;
      }
      for (r = 0; r < cellSize; r += 1) {
        ascii += line + "\n";
      }
    }
    return ascii.substring(0, ascii.length - 1);
  };
  _this.renderTo2dContext = function(context, cellSize) {
    cellSize = cellSize || 2;
    const length = _this.getModuleCount();
    for (let row = 0; row < length; row++) {
      for (let col = 0; col < length; col++) {
        context.fillStyle = _this.isDark(row, col) ? "black" : "white";
        context.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
      }
    }
  };
  return _this;
};
qrcode.stringToBytes = function(s) {
  const bytes = [];
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    bytes.push(c & 255);
  }
  return bytes;
};
qrcode.createStringToBytes = function(unicodeData, numChars) {
  const unicodeMap = (function() {
    const bin = base64DecodeInputStream(unicodeData);
    const read = function() {
      const b = bin.read();
      if (b == -1) throw "eof";
      return b;
    };
    let count = 0;
    const unicodeMap2 = {};
    while (true) {
      const b0 = bin.read();
      if (b0 == -1) break;
      const b1 = read();
      const b2 = read();
      const b3 = read();
      const k = String.fromCharCode(b0 << 8 | b1);
      const v = b2 << 8 | b3;
      unicodeMap2[k] = v;
      count += 1;
    }
    if (count != numChars) {
      throw count + " != " + numChars;
    }
    return unicodeMap2;
  })();
  const unknownChar = "?".charCodeAt(0);
  return function(s) {
    const bytes = [];
    for (let i = 0; i < s.length; i += 1) {
      const c = s.charCodeAt(i);
      if (c < 128) {
        bytes.push(c);
      } else {
        const b = unicodeMap[s.charAt(i)];
        if (typeof b == "number") {
          if ((b & 255) == b) {
            bytes.push(b);
          } else {
            bytes.push(b >>> 8);
            bytes.push(b & 255);
          }
        } else {
          bytes.push(unknownChar);
        }
      }
    }
    return bytes;
  };
};
var QRMode = {
  MODE_NUMBER: 1 << 0,
  MODE_ALPHA_NUM: 1 << 1,
  MODE_8BIT_BYTE: 1 << 2,
  MODE_KANJI: 1 << 3
};
var QRErrorCorrectionLevel = {
  L: 1,
  M: 0,
  Q: 3,
  H: 2
};
var QRMaskPattern = {
  PATTERN000: 0,
  PATTERN001: 1,
  PATTERN010: 2,
  PATTERN011: 3,
  PATTERN100: 4,
  PATTERN101: 5,
  PATTERN110: 6,
  PATTERN111: 7
};
var QRUtil = (function() {
  const PATTERN_POSITION_TABLE = [
    [],
    [6, 18],
    [6, 22],
    [6, 26],
    [6, 30],
    [6, 34],
    [6, 22, 38],
    [6, 24, 42],
    [6, 26, 46],
    [6, 28, 50],
    [6, 30, 54],
    [6, 32, 58],
    [6, 34, 62],
    [6, 26, 46, 66],
    [6, 26, 48, 70],
    [6, 26, 50, 74],
    [6, 30, 54, 78],
    [6, 30, 56, 82],
    [6, 30, 58, 86],
    [6, 34, 62, 90],
    [6, 28, 50, 72, 94],
    [6, 26, 50, 74, 98],
    [6, 30, 54, 78, 102],
    [6, 28, 54, 80, 106],
    [6, 32, 58, 84, 110],
    [6, 30, 58, 86, 114],
    [6, 34, 62, 90, 118],
    [6, 26, 50, 74, 98, 122],
    [6, 30, 54, 78, 102, 126],
    [6, 26, 52, 78, 104, 130],
    [6, 30, 56, 82, 108, 134],
    [6, 34, 60, 86, 112, 138],
    [6, 30, 58, 86, 114, 142],
    [6, 34, 62, 90, 118, 146],
    [6, 30, 54, 78, 102, 126, 150],
    [6, 24, 50, 76, 102, 128, 154],
    [6, 28, 54, 80, 106, 132, 158],
    [6, 32, 58, 84, 110, 136, 162],
    [6, 26, 54, 82, 110, 138, 166],
    [6, 30, 58, 86, 114, 142, 170]
  ];
  const G15 = 1 << 10 | 1 << 8 | 1 << 5 | 1 << 4 | 1 << 2 | 1 << 1 | 1 << 0;
  const G18 = 1 << 12 | 1 << 11 | 1 << 10 | 1 << 9 | 1 << 8 | 1 << 5 | 1 << 2 | 1 << 0;
  const G15_MASK = 1 << 14 | 1 << 12 | 1 << 10 | 1 << 4 | 1 << 1;
  const _this = {};
  const getBCHDigit = function(data) {
    let digit = 0;
    while (data != 0) {
      digit += 1;
      data >>>= 1;
    }
    return digit;
  };
  _this.getBCHTypeInfo = function(data) {
    let d = data << 10;
    while (getBCHDigit(d) - getBCHDigit(G15) >= 0) {
      d ^= G15 << getBCHDigit(d) - getBCHDigit(G15);
    }
    return (data << 10 | d) ^ G15_MASK;
  };
  _this.getBCHTypeNumber = function(data) {
    let d = data << 12;
    while (getBCHDigit(d) - getBCHDigit(G18) >= 0) {
      d ^= G18 << getBCHDigit(d) - getBCHDigit(G18);
    }
    return data << 12 | d;
  };
  _this.getPatternPosition = function(typeNumber) {
    return PATTERN_POSITION_TABLE[typeNumber - 1];
  };
  _this.getMaskFunction = function(maskPattern) {
    switch (maskPattern) {
      case QRMaskPattern.PATTERN000:
        return function(i, j) {
          return (i + j) % 2 == 0;
        };
      case QRMaskPattern.PATTERN001:
        return function(i, j) {
          return i % 2 == 0;
        };
      case QRMaskPattern.PATTERN010:
        return function(i, j) {
          return j % 3 == 0;
        };
      case QRMaskPattern.PATTERN011:
        return function(i, j) {
          return (i + j) % 3 == 0;
        };
      case QRMaskPattern.PATTERN100:
        return function(i, j) {
          return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 == 0;
        };
      case QRMaskPattern.PATTERN101:
        return function(i, j) {
          return i * j % 2 + i * j % 3 == 0;
        };
      case QRMaskPattern.PATTERN110:
        return function(i, j) {
          return (i * j % 2 + i * j % 3) % 2 == 0;
        };
      case QRMaskPattern.PATTERN111:
        return function(i, j) {
          return (i * j % 3 + (i + j) % 2) % 2 == 0;
        };
      default:
        throw "bad maskPattern:" + maskPattern;
    }
  };
  _this.getErrorCorrectPolynomial = function(errorCorrectLength) {
    let a = qrPolynomial([1], 0);
    for (let i = 0; i < errorCorrectLength; i += 1) {
      a = a.multiply(qrPolynomial([1, QRMath.gexp(i)], 0));
    }
    return a;
  };
  _this.getLengthInBits = function(mode, type) {
    if (1 <= type && type < 10) {
      switch (mode) {
        case QRMode.MODE_NUMBER:
          return 10;
        case QRMode.MODE_ALPHA_NUM:
          return 9;
        case QRMode.MODE_8BIT_BYTE:
          return 8;
        case QRMode.MODE_KANJI:
          return 8;
        default:
          throw "mode:" + mode;
      }
    } else if (type < 27) {
      switch (mode) {
        case QRMode.MODE_NUMBER:
          return 12;
        case QRMode.MODE_ALPHA_NUM:
          return 11;
        case QRMode.MODE_8BIT_BYTE:
          return 16;
        case QRMode.MODE_KANJI:
          return 10;
        default:
          throw "mode:" + mode;
      }
    } else if (type < 41) {
      switch (mode) {
        case QRMode.MODE_NUMBER:
          return 14;
        case QRMode.MODE_ALPHA_NUM:
          return 13;
        case QRMode.MODE_8BIT_BYTE:
          return 16;
        case QRMode.MODE_KANJI:
          return 12;
        default:
          throw "mode:" + mode;
      }
    } else {
      throw "type:" + type;
    }
  };
  _this.getLostPoint = function(qrcode2) {
    const moduleCount = qrcode2.getModuleCount();
    let lostPoint = 0;
    for (let row = 0; row < moduleCount; row += 1) {
      for (let col = 0; col < moduleCount; col += 1) {
        let sameCount = 0;
        const dark = qrcode2.isDark(row, col);
        for (let r = -1; r <= 1; r += 1) {
          if (row + r < 0 || moduleCount <= row + r) {
            continue;
          }
          for (let c = -1; c <= 1; c += 1) {
            if (col + c < 0 || moduleCount <= col + c) {
              continue;
            }
            if (r == 0 && c == 0) {
              continue;
            }
            if (dark == qrcode2.isDark(row + r, col + c)) {
              sameCount += 1;
            }
          }
        }
        if (sameCount > 5) {
          lostPoint += 3 + sameCount - 5;
        }
      }
    }
    ;
    for (let row = 0; row < moduleCount - 1; row += 1) {
      for (let col = 0; col < moduleCount - 1; col += 1) {
        let count = 0;
        if (qrcode2.isDark(row, col)) count += 1;
        if (qrcode2.isDark(row + 1, col)) count += 1;
        if (qrcode2.isDark(row, col + 1)) count += 1;
        if (qrcode2.isDark(row + 1, col + 1)) count += 1;
        if (count == 0 || count == 4) {
          lostPoint += 3;
        }
      }
    }
    for (let row = 0; row < moduleCount; row += 1) {
      for (let col = 0; col < moduleCount - 6; col += 1) {
        if (qrcode2.isDark(row, col) && !qrcode2.isDark(row, col + 1) && qrcode2.isDark(row, col + 2) && qrcode2.isDark(row, col + 3) && qrcode2.isDark(row, col + 4) && !qrcode2.isDark(row, col + 5) && qrcode2.isDark(row, col + 6)) {
          lostPoint += 40;
        }
      }
    }
    for (let col = 0; col < moduleCount; col += 1) {
      for (let row = 0; row < moduleCount - 6; row += 1) {
        if (qrcode2.isDark(row, col) && !qrcode2.isDark(row + 1, col) && qrcode2.isDark(row + 2, col) && qrcode2.isDark(row + 3, col) && qrcode2.isDark(row + 4, col) && !qrcode2.isDark(row + 5, col) && qrcode2.isDark(row + 6, col)) {
          lostPoint += 40;
        }
      }
    }
    let darkCount = 0;
    for (let col = 0; col < moduleCount; col += 1) {
      for (let row = 0; row < moduleCount; row += 1) {
        if (qrcode2.isDark(row, col)) {
          darkCount += 1;
        }
      }
    }
    const ratio = Math.abs(100 * darkCount / moduleCount / moduleCount - 50) / 5;
    lostPoint += ratio * 10;
    return lostPoint;
  };
  return _this;
})();
var QRMath = (function() {
  const EXP_TABLE = new Array(256);
  const LOG_TABLE = new Array(256);
  for (let i = 0; i < 8; i += 1) {
    EXP_TABLE[i] = 1 << i;
  }
  for (let i = 8; i < 256; i += 1) {
    EXP_TABLE[i] = EXP_TABLE[i - 4] ^ EXP_TABLE[i - 5] ^ EXP_TABLE[i - 6] ^ EXP_TABLE[i - 8];
  }
  for (let i = 0; i < 255; i += 1) {
    LOG_TABLE[EXP_TABLE[i]] = i;
  }
  const _this = {};
  _this.glog = function(n) {
    if (n < 1) {
      throw "glog(" + n + ")";
    }
    return LOG_TABLE[n];
  };
  _this.gexp = function(n) {
    while (n < 0) {
      n += 255;
    }
    while (n >= 256) {
      n -= 255;
    }
    return EXP_TABLE[n];
  };
  return _this;
})();
var qrPolynomial = function(num, shift) {
  if (typeof num.length == "undefined") {
    throw num.length + "/" + shift;
  }
  const _num = (function() {
    let offset = 0;
    while (offset < num.length && num[offset] == 0) {
      offset += 1;
    }
    const _num2 = new Array(num.length - offset + shift);
    for (let i = 0; i < num.length - offset; i += 1) {
      _num2[i] = num[i + offset];
    }
    return _num2;
  })();
  const _this = {};
  _this.getAt = function(index) {
    return _num[index];
  };
  _this.getLength = function() {
    return _num.length;
  };
  _this.multiply = function(e) {
    const num2 = new Array(_this.getLength() + e.getLength() - 1);
    for (let i = 0; i < _this.getLength(); i += 1) {
      for (let j = 0; j < e.getLength(); j += 1) {
        num2[i + j] ^= QRMath.gexp(QRMath.glog(_this.getAt(i)) + QRMath.glog(e.getAt(j)));
      }
    }
    return qrPolynomial(num2, 0);
  };
  _this.mod = function(e) {
    if (_this.getLength() - e.getLength() < 0) {
      return _this;
    }
    const ratio = QRMath.glog(_this.getAt(0)) - QRMath.glog(e.getAt(0));
    const num2 = new Array(_this.getLength());
    for (let i = 0; i < _this.getLength(); i += 1) {
      num2[i] = _this.getAt(i);
    }
    for (let i = 0; i < e.getLength(); i += 1) {
      num2[i] ^= QRMath.gexp(QRMath.glog(e.getAt(i)) + ratio);
    }
    return qrPolynomial(num2, 0).mod(e);
  };
  return _this;
};
var QRRSBlock = (function() {
  const RS_BLOCK_TABLE = [
    // L
    // M
    // Q
    // H
    // 1
    [1, 26, 19],
    [1, 26, 16],
    [1, 26, 13],
    [1, 26, 9],
    // 2
    [1, 44, 34],
    [1, 44, 28],
    [1, 44, 22],
    [1, 44, 16],
    // 3
    [1, 70, 55],
    [1, 70, 44],
    [2, 35, 17],
    [2, 35, 13],
    // 4
    [1, 100, 80],
    [2, 50, 32],
    [2, 50, 24],
    [4, 25, 9],
    // 5
    [1, 134, 108],
    [2, 67, 43],
    [2, 33, 15, 2, 34, 16],
    [2, 33, 11, 2, 34, 12],
    // 6
    [2, 86, 68],
    [4, 43, 27],
    [4, 43, 19],
    [4, 43, 15],
    // 7
    [2, 98, 78],
    [4, 49, 31],
    [2, 32, 14, 4, 33, 15],
    [4, 39, 13, 1, 40, 14],
    // 8
    [2, 121, 97],
    [2, 60, 38, 2, 61, 39],
    [4, 40, 18, 2, 41, 19],
    [4, 40, 14, 2, 41, 15],
    // 9
    [2, 146, 116],
    [3, 58, 36, 2, 59, 37],
    [4, 36, 16, 4, 37, 17],
    [4, 36, 12, 4, 37, 13],
    // 10
    [2, 86, 68, 2, 87, 69],
    [4, 69, 43, 1, 70, 44],
    [6, 43, 19, 2, 44, 20],
    [6, 43, 15, 2, 44, 16],
    // 11
    [4, 101, 81],
    [1, 80, 50, 4, 81, 51],
    [4, 50, 22, 4, 51, 23],
    [3, 36, 12, 8, 37, 13],
    // 12
    [2, 116, 92, 2, 117, 93],
    [6, 58, 36, 2, 59, 37],
    [4, 46, 20, 6, 47, 21],
    [7, 42, 14, 4, 43, 15],
    // 13
    [4, 133, 107],
    [8, 59, 37, 1, 60, 38],
    [8, 44, 20, 4, 45, 21],
    [12, 33, 11, 4, 34, 12],
    // 14
    [3, 145, 115, 1, 146, 116],
    [4, 64, 40, 5, 65, 41],
    [11, 36, 16, 5, 37, 17],
    [11, 36, 12, 5, 37, 13],
    // 15
    [5, 109, 87, 1, 110, 88],
    [5, 65, 41, 5, 66, 42],
    [5, 54, 24, 7, 55, 25],
    [11, 36, 12, 7, 37, 13],
    // 16
    [5, 122, 98, 1, 123, 99],
    [7, 73, 45, 3, 74, 46],
    [15, 43, 19, 2, 44, 20],
    [3, 45, 15, 13, 46, 16],
    // 17
    [1, 135, 107, 5, 136, 108],
    [10, 74, 46, 1, 75, 47],
    [1, 50, 22, 15, 51, 23],
    [2, 42, 14, 17, 43, 15],
    // 18
    [5, 150, 120, 1, 151, 121],
    [9, 69, 43, 4, 70, 44],
    [17, 50, 22, 1, 51, 23],
    [2, 42, 14, 19, 43, 15],
    // 19
    [3, 141, 113, 4, 142, 114],
    [3, 70, 44, 11, 71, 45],
    [17, 47, 21, 4, 48, 22],
    [9, 39, 13, 16, 40, 14],
    // 20
    [3, 135, 107, 5, 136, 108],
    [3, 67, 41, 13, 68, 42],
    [15, 54, 24, 5, 55, 25],
    [15, 43, 15, 10, 44, 16],
    // 21
    [4, 144, 116, 4, 145, 117],
    [17, 68, 42],
    [17, 50, 22, 6, 51, 23],
    [19, 46, 16, 6, 47, 17],
    // 22
    [2, 139, 111, 7, 140, 112],
    [17, 74, 46],
    [7, 54, 24, 16, 55, 25],
    [34, 37, 13],
    // 23
    [4, 151, 121, 5, 152, 122],
    [4, 75, 47, 14, 76, 48],
    [11, 54, 24, 14, 55, 25],
    [16, 45, 15, 14, 46, 16],
    // 24
    [6, 147, 117, 4, 148, 118],
    [6, 73, 45, 14, 74, 46],
    [11, 54, 24, 16, 55, 25],
    [30, 46, 16, 2, 47, 17],
    // 25
    [8, 132, 106, 4, 133, 107],
    [8, 75, 47, 13, 76, 48],
    [7, 54, 24, 22, 55, 25],
    [22, 45, 15, 13, 46, 16],
    // 26
    [10, 142, 114, 2, 143, 115],
    [19, 74, 46, 4, 75, 47],
    [28, 50, 22, 6, 51, 23],
    [33, 46, 16, 4, 47, 17],
    // 27
    [8, 152, 122, 4, 153, 123],
    [22, 73, 45, 3, 74, 46],
    [8, 53, 23, 26, 54, 24],
    [12, 45, 15, 28, 46, 16],
    // 28
    [3, 147, 117, 10, 148, 118],
    [3, 73, 45, 23, 74, 46],
    [4, 54, 24, 31, 55, 25],
    [11, 45, 15, 31, 46, 16],
    // 29
    [7, 146, 116, 7, 147, 117],
    [21, 73, 45, 7, 74, 46],
    [1, 53, 23, 37, 54, 24],
    [19, 45, 15, 26, 46, 16],
    // 30
    [5, 145, 115, 10, 146, 116],
    [19, 75, 47, 10, 76, 48],
    [15, 54, 24, 25, 55, 25],
    [23, 45, 15, 25, 46, 16],
    // 31
    [13, 145, 115, 3, 146, 116],
    [2, 74, 46, 29, 75, 47],
    [42, 54, 24, 1, 55, 25],
    [23, 45, 15, 28, 46, 16],
    // 32
    [17, 145, 115],
    [10, 74, 46, 23, 75, 47],
    [10, 54, 24, 35, 55, 25],
    [19, 45, 15, 35, 46, 16],
    // 33
    [17, 145, 115, 1, 146, 116],
    [14, 74, 46, 21, 75, 47],
    [29, 54, 24, 19, 55, 25],
    [11, 45, 15, 46, 46, 16],
    // 34
    [13, 145, 115, 6, 146, 116],
    [14, 74, 46, 23, 75, 47],
    [44, 54, 24, 7, 55, 25],
    [59, 46, 16, 1, 47, 17],
    // 35
    [12, 151, 121, 7, 152, 122],
    [12, 75, 47, 26, 76, 48],
    [39, 54, 24, 14, 55, 25],
    [22, 45, 15, 41, 46, 16],
    // 36
    [6, 151, 121, 14, 152, 122],
    [6, 75, 47, 34, 76, 48],
    [46, 54, 24, 10, 55, 25],
    [2, 45, 15, 64, 46, 16],
    // 37
    [17, 152, 122, 4, 153, 123],
    [29, 74, 46, 14, 75, 47],
    [49, 54, 24, 10, 55, 25],
    [24, 45, 15, 46, 46, 16],
    // 38
    [4, 152, 122, 18, 153, 123],
    [13, 74, 46, 32, 75, 47],
    [48, 54, 24, 14, 55, 25],
    [42, 45, 15, 32, 46, 16],
    // 39
    [20, 147, 117, 4, 148, 118],
    [40, 75, 47, 7, 76, 48],
    [43, 54, 24, 22, 55, 25],
    [10, 45, 15, 67, 46, 16],
    // 40
    [19, 148, 118, 6, 149, 119],
    [18, 75, 47, 31, 76, 48],
    [34, 54, 24, 34, 55, 25],
    [20, 45, 15, 61, 46, 16]
  ];
  const qrRSBlock = function(totalCount, dataCount) {
    const _this2 = {};
    _this2.totalCount = totalCount;
    _this2.dataCount = dataCount;
    return _this2;
  };
  const _this = {};
  const getRsBlockTable = function(typeNumber, errorCorrectionLevel) {
    switch (errorCorrectionLevel) {
      case QRErrorCorrectionLevel.L:
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];
      case QRErrorCorrectionLevel.M:
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];
      case QRErrorCorrectionLevel.Q:
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];
      case QRErrorCorrectionLevel.H:
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];
      default:
        return void 0;
    }
  };
  _this.getRSBlocks = function(typeNumber, errorCorrectionLevel) {
    const rsBlock = getRsBlockTable(typeNumber, errorCorrectionLevel);
    if (typeof rsBlock == "undefined") {
      throw "bad rs block @ typeNumber:" + typeNumber + "/errorCorrectionLevel:" + errorCorrectionLevel;
    }
    const length = rsBlock.length / 3;
    const list = [];
    for (let i = 0; i < length; i += 1) {
      const count = rsBlock[i * 3 + 0];
      const totalCount = rsBlock[i * 3 + 1];
      const dataCount = rsBlock[i * 3 + 2];
      for (let j = 0; j < count; j += 1) {
        list.push(qrRSBlock(totalCount, dataCount));
      }
    }
    return list;
  };
  return _this;
})();
var qrBitBuffer = function() {
  const _buffer = [];
  let _length = 0;
  const _this = {};
  _this.getBuffer = function() {
    return _buffer;
  };
  _this.getAt = function(index) {
    const bufIndex = Math.floor(index / 8);
    return (_buffer[bufIndex] >>> 7 - index % 8 & 1) == 1;
  };
  _this.put = function(num, length) {
    for (let i = 0; i < length; i += 1) {
      _this.putBit((num >>> length - i - 1 & 1) == 1);
    }
  };
  _this.getLengthInBits = function() {
    return _length;
  };
  _this.putBit = function(bit) {
    const bufIndex = Math.floor(_length / 8);
    if (_buffer.length <= bufIndex) {
      _buffer.push(0);
    }
    if (bit) {
      _buffer[bufIndex] |= 128 >>> _length % 8;
    }
    _length += 1;
  };
  return _this;
};
var qrNumber = function(data) {
  const _mode = QRMode.MODE_NUMBER;
  const _data = data;
  const _this = {};
  _this.getMode = function() {
    return _mode;
  };
  _this.getLength = function(buffer) {
    return _data.length;
  };
  _this.write = function(buffer) {
    const data2 = _data;
    let i = 0;
    while (i + 2 < data2.length) {
      buffer.put(strToNum(data2.substring(i, i + 3)), 10);
      i += 3;
    }
    if (i < data2.length) {
      if (data2.length - i == 1) {
        buffer.put(strToNum(data2.substring(i, i + 1)), 4);
      } else if (data2.length - i == 2) {
        buffer.put(strToNum(data2.substring(i, i + 2)), 7);
      }
    }
  };
  const strToNum = function(s) {
    let num = 0;
    for (let i = 0; i < s.length; i += 1) {
      num = num * 10 + chatToNum(s.charAt(i));
    }
    return num;
  };
  const chatToNum = function(c) {
    if ("0" <= c && c <= "9") {
      return c.charCodeAt(0) - "0".charCodeAt(0);
    }
    throw "illegal char :" + c;
  };
  return _this;
};
var qrAlphaNum = function(data) {
  const _mode = QRMode.MODE_ALPHA_NUM;
  const _data = data;
  const _this = {};
  _this.getMode = function() {
    return _mode;
  };
  _this.getLength = function(buffer) {
    return _data.length;
  };
  _this.write = function(buffer) {
    const s = _data;
    let i = 0;
    while (i + 1 < s.length) {
      buffer.put(
        getCode(s.charAt(i)) * 45 + getCode(s.charAt(i + 1)),
        11
      );
      i += 2;
    }
    if (i < s.length) {
      buffer.put(getCode(s.charAt(i)), 6);
    }
  };
  const getCode = function(c) {
    if ("0" <= c && c <= "9") {
      return c.charCodeAt(0) - "0".charCodeAt(0);
    } else if ("A" <= c && c <= "Z") {
      return c.charCodeAt(0) - "A".charCodeAt(0) + 10;
    } else {
      switch (c) {
        case " ":
          return 36;
        case "$":
          return 37;
        case "%":
          return 38;
        case "*":
          return 39;
        case "+":
          return 40;
        case "-":
          return 41;
        case ".":
          return 42;
        case "/":
          return 43;
        case ":":
          return 44;
        default:
          throw "illegal char :" + c;
      }
    }
  };
  return _this;
};
var qr8BitByte = function(data) {
  const _mode = QRMode.MODE_8BIT_BYTE;
  const _data = data;
  const _bytes = qrcode.stringToBytes(data);
  const _this = {};
  _this.getMode = function() {
    return _mode;
  };
  _this.getLength = function(buffer) {
    return _bytes.length;
  };
  _this.write = function(buffer) {
    for (let i = 0; i < _bytes.length; i += 1) {
      buffer.put(_bytes[i], 8);
    }
  };
  return _this;
};
var qrKanji = function(data) {
  const _mode = QRMode.MODE_KANJI;
  const _data = data;
  const stringToBytes2 = qrcode.stringToBytes;
  !(function(c, code) {
    const test = stringToBytes2(c);
    if (test.length != 2 || (test[0] << 8 | test[1]) != code) {
      throw "sjis not supported.";
    }
  })("\u53CB", 38726);
  const _bytes = stringToBytes2(data);
  const _this = {};
  _this.getMode = function() {
    return _mode;
  };
  _this.getLength = function(buffer) {
    return ~~(_bytes.length / 2);
  };
  _this.write = function(buffer) {
    const data2 = _bytes;
    let i = 0;
    while (i + 1 < data2.length) {
      let c = (255 & data2[i]) << 8 | 255 & data2[i + 1];
      if (33088 <= c && c <= 40956) {
        c -= 33088;
      } else if (57408 <= c && c <= 60351) {
        c -= 49472;
      } else {
        throw "illegal char at " + (i + 1) + "/" + c;
      }
      c = (c >>> 8 & 255) * 192 + (c & 255);
      buffer.put(c, 13);
      i += 2;
    }
    if (i < data2.length) {
      throw "illegal char at " + (i + 1);
    }
  };
  return _this;
};
var byteArrayOutputStream = function() {
  const _bytes = [];
  const _this = {};
  _this.writeByte = function(b) {
    _bytes.push(b & 255);
  };
  _this.writeShort = function(i) {
    _this.writeByte(i);
    _this.writeByte(i >>> 8);
  };
  _this.writeBytes = function(b, off, len) {
    off = off || 0;
    len = len || b.length;
    for (let i = 0; i < len; i += 1) {
      _this.writeByte(b[i + off]);
    }
  };
  _this.writeString = function(s) {
    for (let i = 0; i < s.length; i += 1) {
      _this.writeByte(s.charCodeAt(i));
    }
  };
  _this.toByteArray = function() {
    return _bytes;
  };
  _this.toString = function() {
    let s = "";
    s += "[";
    for (let i = 0; i < _bytes.length; i += 1) {
      if (i > 0) {
        s += ",";
      }
      s += _bytes[i];
    }
    s += "]";
    return s;
  };
  return _this;
};
var base64EncodeOutputStream = function() {
  let _buffer = 0;
  let _buflen = 0;
  let _length = 0;
  let _base64 = "";
  const _this = {};
  const writeEncoded = function(b) {
    _base64 += String.fromCharCode(encode(b & 63));
  };
  const encode = function(n) {
    if (n < 0) {
      throw "n:" + n;
    } else if (n < 26) {
      return 65 + n;
    } else if (n < 52) {
      return 97 + (n - 26);
    } else if (n < 62) {
      return 48 + (n - 52);
    } else if (n == 62) {
      return 43;
    } else if (n == 63) {
      return 47;
    } else {
      throw "n:" + n;
    }
  };
  _this.writeByte = function(n) {
    _buffer = _buffer << 8 | n & 255;
    _buflen += 8;
    _length += 1;
    while (_buflen >= 6) {
      writeEncoded(_buffer >>> _buflen - 6);
      _buflen -= 6;
    }
  };
  _this.flush = function() {
    if (_buflen > 0) {
      writeEncoded(_buffer << 6 - _buflen);
      _buffer = 0;
      _buflen = 0;
    }
    if (_length % 3 != 0) {
      const padlen = 3 - _length % 3;
      for (let i = 0; i < padlen; i += 1) {
        _base64 += "=";
      }
    }
  };
  _this.toString = function() {
    return _base64;
  };
  return _this;
};
var base64DecodeInputStream = function(str) {
  const _str = str;
  let _pos = 0;
  let _buffer = 0;
  let _buflen = 0;
  const _this = {};
  _this.read = function() {
    while (_buflen < 8) {
      if (_pos >= _str.length) {
        if (_buflen == 0) {
          return -1;
        }
        throw "unexpected end of file./" + _buflen;
      }
      const c = _str.charAt(_pos);
      _pos += 1;
      if (c == "=") {
        _buflen = 0;
        return -1;
      } else if (c.match(/^\s$/)) {
        continue;
      }
      _buffer = _buffer << 6 | decode(c.charCodeAt(0));
      _buflen += 6;
    }
    const n = _buffer >>> _buflen - 8 & 255;
    _buflen -= 8;
    return n;
  };
  const decode = function(c) {
    if (65 <= c && c <= 90) {
      return c - 65;
    } else if (97 <= c && c <= 122) {
      return c - 97 + 26;
    } else if (48 <= c && c <= 57) {
      return c - 48 + 52;
    } else if (c == 43) {
      return 62;
    } else if (c == 47) {
      return 63;
    } else {
      throw "c:" + c;
    }
  };
  return _this;
};
var gifImage = function(width, height) {
  const _width = width;
  const _height = height;
  const _data = new Array(width * height);
  const _this = {};
  _this.setPixel = function(x, y, pixel) {
    _data[y * _width + x] = pixel;
  };
  _this.write = function(out) {
    out.writeString("GIF87a");
    out.writeShort(_width);
    out.writeShort(_height);
    out.writeByte(128);
    out.writeByte(0);
    out.writeByte(0);
    out.writeByte(0);
    out.writeByte(0);
    out.writeByte(0);
    out.writeByte(255);
    out.writeByte(255);
    out.writeByte(255);
    out.writeString(",");
    out.writeShort(0);
    out.writeShort(0);
    out.writeShort(_width);
    out.writeShort(_height);
    out.writeByte(0);
    const lzwMinCodeSize = 2;
    const raster = getLZWRaster(lzwMinCodeSize);
    out.writeByte(lzwMinCodeSize);
    let offset = 0;
    while (raster.length - offset > 255) {
      out.writeByte(255);
      out.writeBytes(raster, offset, 255);
      offset += 255;
    }
    out.writeByte(raster.length - offset);
    out.writeBytes(raster, offset, raster.length - offset);
    out.writeByte(0);
    out.writeString(";");
  };
  const bitOutputStream = function(out) {
    const _out = out;
    let _bitLength = 0;
    let _bitBuffer = 0;
    const _this2 = {};
    _this2.write = function(data, length) {
      if (data >>> length != 0) {
        throw "length over";
      }
      while (_bitLength + length >= 8) {
        _out.writeByte(255 & (data << _bitLength | _bitBuffer));
        length -= 8 - _bitLength;
        data >>>= 8 - _bitLength;
        _bitBuffer = 0;
        _bitLength = 0;
      }
      _bitBuffer = data << _bitLength | _bitBuffer;
      _bitLength = _bitLength + length;
    };
    _this2.flush = function() {
      if (_bitLength > 0) {
        _out.writeByte(_bitBuffer);
      }
    };
    return _this2;
  };
  const getLZWRaster = function(lzwMinCodeSize) {
    const clearCode = 1 << lzwMinCodeSize;
    const endCode = (1 << lzwMinCodeSize) + 1;
    let bitLength = lzwMinCodeSize + 1;
    const table = lzwTable();
    for (let i = 0; i < clearCode; i += 1) {
      table.add(String.fromCharCode(i));
    }
    table.add(String.fromCharCode(clearCode));
    table.add(String.fromCharCode(endCode));
    const byteOut = byteArrayOutputStream();
    const bitOut = bitOutputStream(byteOut);
    bitOut.write(clearCode, bitLength);
    let dataIndex = 0;
    let s = String.fromCharCode(_data[dataIndex]);
    dataIndex += 1;
    while (dataIndex < _data.length) {
      const c = String.fromCharCode(_data[dataIndex]);
      dataIndex += 1;
      if (table.contains(s + c)) {
        s = s + c;
      } else {
        bitOut.write(table.indexOf(s), bitLength);
        if (table.size() < 4095) {
          if (table.size() == 1 << bitLength) {
            bitLength += 1;
          }
          table.add(s + c);
        }
        s = c;
      }
    }
    bitOut.write(table.indexOf(s), bitLength);
    bitOut.write(endCode, bitLength);
    bitOut.flush();
    return byteOut.toByteArray();
  };
  const lzwTable = function() {
    const _map = {};
    let _size = 0;
    const _this2 = {};
    _this2.add = function(key) {
      if (_this2.contains(key)) {
        throw "dup key:" + key;
      }
      _map[key] = _size;
      _size += 1;
    };
    _this2.size = function() {
      return _size;
    };
    _this2.indexOf = function(key) {
      return _map[key];
    };
    _this2.contains = function(key) {
      return typeof _map[key] != "undefined";
    };
    return _this2;
  };
  return _this;
};
var createDataURL = function(width, height, getPixel) {
  const gif = gifImage(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      gif.setPixel(x, y, getPixel(x, y));
    }
  }
  const b = byteArrayOutputStream();
  gif.write(b);
  const base64 = base64EncodeOutputStream();
  const bytes = b.toByteArray();
  for (let i = 0; i < bytes.length; i += 1) {
    base64.writeByte(bytes[i]);
  }
  base64.flush();
  return "data:image/gif;base64," + base64;
};
var stringToBytes = qrcode.stringToBytes;

// src/App.jsx
init_core();

// shared/show.js
init_core();
var SHOW_TERMINAL_OUTCOMES = Object.freeze(["completed", "skipped", "cancelled"]);
var SHOW_SCENE_DEFINITIONS = Object.freeze({
  opening: Object.freeze({
    label: "Opening",
    intensity: "major",
    steps: Object.freeze(["title", "room"])
  }),
  "event-intro": Object.freeze({
    label: "Event intro",
    intensity: "normal",
    requiresEvent: true,
    steps: Object.freeze(["title", "ready"])
  }),
  winner: Object.freeze({
    label: "Winner",
    intensity: "major",
    requiresEvent: true,
    requiresResult: true,
    steps: Object.freeze(["winner", "standings"])
  }),
  standings: Object.freeze({
    label: "Standings",
    intensity: "routine",
    steps: Object.freeze(["board"])
  }),
  champion: Object.freeze({
    label: "Champion",
    intensity: "major",
    requiresFrozen: true,
    steps: Object.freeze(["champion"])
  })
});
var REPLAY_WINDOW_MS = 15 * 60 * 1e3;

// src/ui/Shell.jsx
import React24 from "react";
function Shell({ children, tv, arrival, environment = "production" }) {
  return /* @__PURE__ */ React24.createElement("div", { className: `fd-shell${tv ? " fd-night" : ""}` }, /* @__PURE__ */ React24.createElement("div", { className: `fd-shell-inner${tv ? " is-tv" : arrival ? " is-arrival" : ""}` }, environment !== "production" && /* @__PURE__ */ React24.createElement("div", { className: "fd-environment", "aria-label": `${environment} environment` }, environment, " \xB7 Field Day"), children));
}

// src/App.jsx
init_theme();
init_controls();
var Onboarding2 = lazy(() => Promise.resolve().then(() => (init_Onboarding(), Onboarding_exports)).then((module) => ({ default: module.Onboarding })));
var prefersReducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
var fmt3 = (n) => (n ?? 0).toLocaleString("en-US");
var centeredGridCell = (i, count, columns = 3, gap = 6) => {
  if (i !== count - 1 || count % columns !== 1) return {};
  if (columns % 2) return { gridColumn: String(Math.ceil(columns / 2)) };
  return { gridColumn: "1 / -1", width: `calc(${100 / columns}% - ${gap / 2}px)`, justifySelf: "center" };
};
function PlayerChip({ name, selected, disabled, onClick, small, style }) {
  return /* @__PURE__ */ React26.createElement("button", { onClick, disabled, "aria-pressed": selected, style: {
    fontFamily: SANS,
    fontWeight: 600,
    fontSize: small ? 13 : 14,
    padding: small ? "9px 8px" : "11px 10px",
    borderRadius: 10,
    width: "100%",
    cursor: disabled ? "default" : "pointer",
    background: selected ? GOLD_GRAD : "var(--paper)",
    color: selected ? "var(--ink0)" : disabled ? "var(--disabled)" : "var(--ink)",
    border: selected ? "1.5px solid var(--ink0)" : "1.5px solid var(--line)",
    opacity: disabled && !selected ? 0.4 : 1,
    transition: "all .12s",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    ...style
  } }, name);
}
var SIDE_COLORS = ["var(--pool)", "var(--accent)"];
function VersusDraw({ state, teams, size = "md", onPlayer }) {
  const av = size === "lg" ? 34 : 26;
  const f = size === "lg" ? 19 : 14;
  const tf = size === "lg" ? 26 : 17;
  return /* @__PURE__ */ React26.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: size === "lg" ? 18 : 10, alignItems: "stretch" } }, [teams[0], null, teams[1]].map((t, i) => i === 1 ? /* @__PURE__ */ React26.createElement("div", { key: "vs", style: {
    alignSelf: "center",
    width: size === "lg" ? 54 : 36,
    height: size === "lg" ? 54 : 36,
    borderRadius: "50%",
    background: "var(--sun)",
    color: "var(--ink0)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: DISPLAY,
    fontWeight: 700,
    fontStyle: "italic",
    fontSize: size === "lg" ? 24 : 16,
    border: "2px solid var(--ink)",
    zIndex: 2
  } }, "VS") : /* @__PURE__ */ React26.createElement("div", { key: i, style: {
    background: "var(--paper)",
    border: "1.5px solid var(--ink)",
    borderRadius: 10,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column"
  } }, /* @__PURE__ */ React26.createElement("div", { style: {
    background: SIDE_COLORS[i === 0 ? 0 : 1],
    color: BONE,
    fontFamily: DISPLAY,
    fontWeight: 700,
    fontSize: tf,
    letterSpacing: "0.02em",
    textTransform: "uppercase",
    padding: size === "lg" ? "8px 14px" : "5px 11px",
    textAlign: i === 0 ? "left" : "right",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  } }, teamLabel(state, t)), /* @__PURE__ */ React26.createElement("div", { style: { padding: size === "lg" ? "10px 14px" : "8px 11px" } }, t.players.map(
    (p) => React26.createElement(onPlayer ? "button" : "div", {
      key: p,
      type: onPlayer ? "button" : void 0,
      onClick: onPlayer ? () => onPlayer(p) : void 0,
      className: onPlayer ? "fd-player-link" : void 0,
      style: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "3px 0",
        width: "100%",
        flexDirection: i === 0 ? "row" : "row-reverse"
      }
    }, /* @__PURE__ */ React26.createElement(React26.Fragment, null, /* @__PURE__ */ React26.createElement(Avatar, { state, p, size: av }), /* @__PURE__ */ React26.createElement("span", { style: { fontFamily: SANS, fontWeight: 600, fontSize: f, color: "var(--ink)" } }, disp(state, p))))
  )))));
}
function EventIntro({ state, ev, big, auto, handoff, onClose, onBets }) {
  const ph = phaseOf(ev);
  const session = SESSIONS.find((s) => s.id === ev.session);
  const format = ev.finale ? "Finale" : ev.kind === "solo" ? "Individual" : ev.kind === "pairs" ? "Pairs" : "Team event";
  const closeRef = useRef12(onClose);
  closeRef.current = onClose;
  useEffect9(() => {
    if (!auto) return;
    const t = setTimeout(() => closeRef.current(), prefersReducedMotion() ? 2200 : 7e3);
    return () => clearTimeout(t);
  }, [auto]);
  if (!big) return /* @__PURE__ */ React26.createElement(
    EventAnnouncement,
    {
      state,
      ev,
      handoff,
      onClose,
      onBets,
      holdMs: prefersReducedMotion() ? 650 : 2800,
      visual: /* @__PURE__ */ React26.createElement(GameMoment, { gameId: ev.game })
    }
  );
  return /* @__PURE__ */ React26.createElement(
    "div",
    {
      className: "si-event-intro fd-night",
      onClick: auto ? void 0 : onClose,
      style: {
        position: "fixed",
        inset: 0,
        zIndex: 290,
        background: "rgba(23,16,9,0.985)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "calc(28px + env(safe-area-inset-top)) 22px calc(28px + env(safe-area-inset-bottom))",
        overflowY: "auto"
      }
    },
    /* @__PURE__ */ React26.createElement("div", { "aria-hidden": "true", style: { position: "absolute", inset: "0 0 auto", height: 5, background: ph.bg } }),
    /* @__PURE__ */ React26.createElement("div", { style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 9,
      color: "var(--night-text)",
      animation: "si-intro-copy .35s .08s both"
    } }, /* @__PURE__ */ React26.createElement("span", { style: { width: 7, height: 7, borderRadius: 99, background: ph.bg } }), /* @__PURE__ */ React26.createElement("span", { style: {
      fontFamily: SANS,
      fontWeight: 700,
      fontSize: big ? 15 : 11,
      letterSpacing: "0.16em",
      textTransform: "uppercase"
    } }, "On deck", session ? ` \xB7 ${session.label}` : "", ev.value ? ` \xB7 ${ev.value} pts` : "")),
    /* @__PURE__ */ React26.createElement("div", { style: { margin: big ? "18px 0 2px" : "10px 0 0" } }, /* @__PURE__ */ React26.createElement(EventSpotlight, { gameId: ev.game, big })),
    /* @__PURE__ */ React26.createElement("div", { style: {
      fontFamily: DISPLAY,
      fontWeight: 700,
      fontSize: big ? "clamp(56px,7vw,110px)" : 44,
      lineHeight: 0.92,
      textAlign: "center",
      textTransform: "uppercase",
      color: BONE,
      maxWidth: big ? 1050 : 430,
      animation: "si-intro-copy .45s .28s both"
    } }, ev.name),
    /* @__PURE__ */ React26.createElement("div", { style: {
      fontFamily: SANS,
      fontWeight: 700,
      fontSize: big ? 15 : 11.5,
      letterSpacing: "0.14em",
      textTransform: "uppercase",
      color: ph.bg,
      marginTop: big ? 15 : 10,
      animation: "si-intro-copy .4s .4s both"
    } }, format),
    ev.desc && /* @__PURE__ */ React26.createElement("div", { style: {
      fontFamily: SANS,
      fontSize: big ? "clamp(15px,1.45vw,20px)" : 14,
      lineHeight: 1.55,
      color: "var(--night-text)",
      textAlign: "center",
      maxWidth: big ? 720 : 355,
      marginTop: big ? 18 : 13,
      animation: "si-intro-copy .4s .52s both"
    } }, ev.desc),
    handoff && /* @__PURE__ */ React26.createElement("div", { style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      fontFamily: SANS,
      fontWeight: 700,
      fontSize: big ? 14 : 11.5,
      letterSpacing: "0.14em",
      textTransform: "uppercase",
      color: "var(--sun)",
      marginTop: big ? 26 : 20,
      animation: "si-intro-copy .3s .65s both"
    } }, /* @__PURE__ */ React26.createElement("span", { className: "si-event-dot" }), /* @__PURE__ */ React26.createElement("span", { className: "si-event-dot si-event-dot-2" }), /* @__PURE__ */ React26.createElement("span", { className: "si-event-dot si-event-dot-3" }), " Drawing teams"),
    !auto && !handoff && /* @__PURE__ */ React26.createElement(
      "div",
      {
        onClick: (e) => e.stopPropagation(),
        style: { display: "flex", gap: 10, marginTop: 24, animation: "si-intro-copy .3s .7s both" }
      },
      onBets && /* @__PURE__ */ React26.createElement(Btn, { onClick: onBets, style: { fontSize: 16, padding: "13px 28px" } }, "To the bets"),
      /* @__PURE__ */ React26.createElement(Btn, { kind: onBets ? "ghost" : "primary", onClick: onClose, style: { fontSize: 16, padding: "13px 28px" } }, "Close")
    )
  );
}
function ChipCounter({ start, onDone }) {
  const denominations = [1e3, 500, 100, 25];
  const countId = useId3(), saving = useRef12(false);
  const [counts, setCounts] = useState17(() => {
    let left = start || 0;
    return Object.fromEntries(denominations.map((value) => {
      const n = Math.floor(left / value);
      left -= n * value;
      return [value, n];
    }));
  });
  const [pending, setPending] = useState17(false), [error, setError] = useState17("");
  const total = denominations.reduce((sum, value) => sum + Number(counts[value] || 0) * value, 0);
  const set = (value, count) => {
    if (!saving.current) setCounts((current) => ({ ...current, [value]: count }));
  };
  return /* @__PURE__ */ React26.createElement("div", { className: "fd-chip-counter" }, /* @__PURE__ */ React26.createElement("p", null, "Count your stack by chip."), denominations.map((value) => /* @__PURE__ */ React26.createElement("div", { className: "fd-chip-count-row", key: value }, /* @__PURE__ */ React26.createElement("label", { htmlFor: countId + value }, fmt3(value), " chips"), /* @__PURE__ */ React26.createElement(
    "button",
    {
      type: "button",
      disabled: pending || !Number(counts[value]),
      "aria-label": "Remove one " + value + " chip",
      onClick: () => set(value, Math.max(0, Number(counts[value] || 0) - 1))
    },
    "\u2212"
  ), /* @__PURE__ */ React26.createElement(
    "input",
    {
      id: countId + value,
      "aria-label": "Number of " + value + " chips",
      inputMode: "numeric",
      pattern: "[0-9]*",
      value: counts[value],
      disabled: pending,
      onChange: (event) => {
        if (/^\d*$/.test(event.target.value)) set(value, event.target.value);
      }
    }
  ), /* @__PURE__ */ React26.createElement("button", { type: "button", disabled: pending, "aria-label": "Add one " + value + " chip", onClick: () => set(value, Number(counts[value] || 0) + 1) }, "+"))), /* @__PURE__ */ React26.createElement("div", { className: "fd-chip-count-total" }, /* @__PURE__ */ React26.createElement("span", null, "Total"), /* @__PURE__ */ React26.createElement("strong", null, fmt3(total))), error && /* @__PURE__ */ React26.createElement("p", { role: "alert" }, error), /* @__PURE__ */ React26.createElement(ActionButton, { disabled: pending, onClick: async () => {
    if (saving.current) return;
    saving.current = true;
    setPending(true);
    setError("");
    try {
      const result = await onDone(total);
      if (result?.ok !== true) setError(result?.error || "Count not saved. Try again.");
    } catch (failure) {
      setError(failure?.message || "Count not saved. Try again.");
    } finally {
      saving.current = false;
      setPending(false);
    }
  }, style: { width: "100%" } }, pending ? "Saving\u2026" : "That is my count"));
}
function PokerResultSheet({ state, onClose, onCount, onBust, onUnbust, onPost }) {
  const pk = state.poker;
  const [fixing, setFixing] = useState17(null);
  const [pending, setPending] = useState17(false), [error, setError] = useState17("");
  const saving = useRef12(false);
  const act = async (callback) => {
    if (saving.current) return { ok: false, error: "Saving\u2026" };
    saving.current = true;
    setPending(true);
    setError("");
    try {
      const result = await callback();
      if (result?.ok !== true) setError(result?.error || "Not saved. Try again.");
      return result;
    } catch (failure) {
      const message = failure?.message || "Not saved. Try again.";
      setError(message);
      return { ok: false, error: message };
    } finally {
      saving.current = false;
      setPending(false);
    }
  };
  if (!pk) return null;
  const outSet = new Set(pk.outs.map((o) => o.player));
  const alive = ROSTER.filter((p) => !outSet.has(p));
  const counted = alive.filter((p) => pk.counts?.[p] !== void 0);
  const sum = counted.reduce((s, p) => s + pk.counts[p], 0);
  const allIn = counted.length === alive.length;
  return /* @__PURE__ */ React26.createElement(Sheet, { title: "The table", onClose, busy: pending }, /* @__PURE__ */ React26.createElement("p", { style: pStyle }, "Everyone counts their own stack from their phone. Tap a row to fix one."), ROSTER.map((p) => {
    const out = outSet.has(p);
    const c = pk.counts?.[p];
    return /* @__PURE__ */ React26.createElement("div", { key: p }, /* @__PURE__ */ React26.createElement("div", { className: "fd-poker-count-row" + (out ? " is-out" : "") }, /* @__PURE__ */ React26.createElement(
      "button",
      {
        className: "fd-poker-count-player",
        disabled: out || pending,
        "aria-expanded": fixing === p,
        "aria-label": out ? `${disp(state, p)} is out` : `Edit ${disp(state, p)}'s chip count`,
        onClick: () => {
          if (!saving.current) setFixing((f) => f === p ? null : p);
        }
      },
      /* @__PURE__ */ React26.createElement(Avatar, { state, p, size: 28 }),
      /* @__PURE__ */ React26.createElement("span", null, disp(state, p)),
      out ? /* @__PURE__ */ React26.createElement(Tag, null, "Out") : c !== void 0 ? /* @__PURE__ */ React26.createElement("strong", null, fmt3(c)) : /* @__PURE__ */ React26.createElement("small", null, "counting")
    ), /* @__PURE__ */ React26.createElement(
      "button",
      {
        className: "fd-poker-count-action",
        disabled: pending,
        "aria-label": `${out ? "Bring back" : "Bust"} ${disp(state, p)}`,
        onClick: () => act(async () => {
          const result = await (out ? onUnbust(p) : onBust(p));
          if (result?.ok) setFixing(null);
          return result;
        })
      },
      out ? "Back in" : "Bust"
    )), fixing === p && !out && /* @__PURE__ */ React26.createElement("div", { className: "fd-night", style: {
      padding: "10px 0",
      borderBottom: "1px solid var(--line)",
      background: "var(--night)",
      margin: "0 -16px",
      paddingLeft: 16,
      paddingRight: 16
    } }, /* @__PURE__ */ React26.createElement(ChipCounter, { start: c, onDone: (total) => act(async () => {
      const result = await onCount(p, total);
      if (result?.ok) setFixing(null);
      return result;
    }) })));
  }), /* @__PURE__ */ React26.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, padding: "12px 0 4px" } }, /* @__PURE__ */ React26.createElement("span", { style: { ...label, flex: 1 } }, "Counted"), /* @__PURE__ */ React26.createElement("span", { style: {
    fontFamily: DISPLAY,
    fontWeight: 700,
    fontSize: 22,
    color: allIn && sum === pk.total ? "var(--green)" : "var(--ink)"
  } }, fmt3(sum)), /* @__PURE__ */ React26.createElement("span", { style: { fontFamily: SANS, fontSize: 12.5, color: "var(--muted)" } }, "of ", fmt3(pk.total))), allIn && sum !== pk.total && /* @__PURE__ */ React26.createElement("div", { style: { fontFamily: SANS, fontSize: 12.5, color: "var(--clay)", marginBottom: 10 } }, sum > pk.total ? `${fmt3(sum - pk.total)} over` : `${fmt3(pk.total - sum)} short`, ". Chips get miscounted, you can still post."), error && /* @__PURE__ */ React26.createElement("p", { role: "alert", style: { color: "var(--clay)", fontSize: 13 } }, error), /* @__PURE__ */ React26.createElement(Btn, { disabled: !allIn || pending, onClick: () => act(onPost), style: { width: "100%", marginTop: 8 } }, allIn ? "Post the counts" : `Waiting on ${alive.length - counted.length}`));
}
var PHASE = {
  fri: { bg: "var(--pool)", fg: BONE },
  sam: { bg: "var(--sun)", fg: "var(--ink0)" },
  sap: { bg: "var(--accent)", fg: BONE },
  san: { bg: "var(--clay)", fg: BONE },
  fin: { bg: "var(--night)", fg: "var(--sun)" }
};
var phaseOf = (ev) => PHASE[ev?.session] || { bg: "var(--paper2)", fg: "var(--ink)" };
function PlayerLinks({ state, players, onPlayer, size = 26 }) {
  return /* @__PURE__ */ React26.createElement("div", { className: "fd-player-links" }, players.map((p) => /* @__PURE__ */ React26.createElement(
    "button",
    {
      type: "button",
      key: p,
      className: "fd-player-link",
      onClick: () => onPlayer(p),
      "aria-label": `View ${disp(state, p)}'s player card`
    },
    /* @__PURE__ */ React26.createElement(Avatar, { state, p, size }),
    /* @__PURE__ */ React26.createElement("span", null, disp(state, p))
  )));
}
function EventCrewCard({ state, roles, compact = false, onPlayer }) {
  const assignments = (roles || []).filter((item) => item?.player);
  if (!assignments.length) return null;
  if (compact) {
    if (onPlayer) return /* @__PURE__ */ React26.createElement("div", { className: "fd-event-crew-compact" }, /* @__PURE__ */ React26.createElement("span", { style: label }, "Event crew"), assignments.map((item) => /* @__PURE__ */ React26.createElement("button", { type: "button", key: item.player, onClick: () => onPlayer(item.player), "aria-label": `View ${disp(state, item.player)}'s player card` }, /* @__PURE__ */ React26.createElement(Avatar, { state, p: item.player, size: 24 }), /* @__PURE__ */ React26.createElement("span", null, disp(state, item.player)), /* @__PURE__ */ React26.createElement("small", null, overflowRoleMeta(item.role).short))));
    return /* @__PURE__ */ React26.createElement("div", { style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      minWidth: 0,
      marginTop: 9,
      paddingTop: 8,
      borderTop: "1px solid var(--line)"
    } }, /* @__PURE__ */ React26.createElement("span", { style: { ...label, color: "var(--accent2)", flexShrink: 0 } }, "Event crew"), /* @__PURE__ */ React26.createElement(AvatarStack, { state, players: assignments.map((item) => item.player), size: 20, max: 3 }), /* @__PURE__ */ React26.createElement("span", { style: {
      fontFamily: SANS,
      fontWeight: 600,
      fontSize: 11.5,
      color: "var(--ink)",
      minWidth: 0,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      flex: 1
    } }, assignments.map((item) => disp(state, item.player)).join(", ")), /* @__PURE__ */ React26.createElement("span", { style: {
      fontFamily: SANS,
      fontWeight: 700,
      fontSize: 10.5,
      color: "var(--muted2)",
      flexShrink: 0
    } }, assignments.map((item) => overflowRoleMeta(item.role).short).join(" + ")));
  }
  return /* @__PURE__ */ React26.createElement("div", { style: {
    margin: "10px 0 4px",
    padding: "11px 12px",
    borderRadius: 14,
    background: "var(--paper2)",
    border: "1px solid rgba(194,88,50,0.38)"
  } }, /* @__PURE__ */ React26.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 } }, /* @__PURE__ */ React26.createElement("span", { style: { ...label, color: "var(--accent2)", flex: 1 } }, "Event crew"), /* @__PURE__ */ React26.createElement("span", { style: { fontFamily: SANS, fontWeight: 700, fontSize: 10.5, color: "var(--muted2)" } }, assignments.length, " ", assignments.length === 1 ? "assignment" : "assignments")), assignments.map((item, index) => {
    const meta = overflowRoleMeta(item.role);
    if (onPlayer) return /* @__PURE__ */ React26.createElement(
      "button",
      {
        type: "button",
        key: `${item.player}-${index}`,
        className: "fd-crew-link",
        onClick: () => onPlayer(item.player),
        "aria-label": `View ${disp(state, item.player)}'s player card`
      },
      /* @__PURE__ */ React26.createElement(Avatar, { state, p: item.player, size: 30 }),
      /* @__PURE__ */ React26.createElement("span", null, /* @__PURE__ */ React26.createElement("strong", null, disp(state, item.player)), /* @__PURE__ */ React26.createElement("small", null, meta.detail)),
      /* @__PURE__ */ React26.createElement("small", null, meta.label)
    );
    return /* @__PURE__ */ React26.createElement("div", { key: `${item.player}-${index}`, style: {
      display: "flex",
      alignItems: "center",
      gap: 9,
      padding: index ? "8px 0 0" : "0",
      marginTop: index ? 8 : 0,
      borderTop: index ? "1px solid var(--line)" : "none"
    } }, /* @__PURE__ */ React26.createElement(Avatar, { state, p: item.player, size: 30 }), /* @__PURE__ */ React26.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React26.createElement("div", { style: {
      fontFamily: SANS,
      fontWeight: 700,
      fontSize: 13,
      color: "var(--ink)",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    } }, disp(state, item.player)), /* @__PURE__ */ React26.createElement("div", { style: { fontFamily: SANS, fontSize: 11.5, lineHeight: 1.35, color: "var(--muted2)" } }, meta.detail)), /* @__PURE__ */ React26.createElement("span", { style: {
      fontFamily: SANS,
      fontWeight: 700,
      fontSize: 10.5,
      color: "var(--accent2)",
      background: "var(--accent-tint)",
      borderRadius: 7,
      padding: "4px 7px",
      flexShrink: 0
    } }, meta.label));
  }));
}
function StageGrid({ state, ev, gm, onThrough, onFinal, onPlayer, size = "md" }) {
  const st = state.stages[ev.id];
  if (!st) return null;
  const finalists = stageFinalists(st);
  const dims = {
    md: { av: 24, f: 13.5, tf: 13, pad: "7px 10px", gap: 8, col: "1fr 1fr" },
    lg: { av: 36, f: 19, tf: 17, pad: "11px 14px", gap: 14, col: `repeat(${Math.min(st.groups.length + (finalists ? 1 : 0), 4)}, 1fr)` }
  }[size];
  const GroupCard = ({ title, entrants, through, gIdx, isFinal, wide }) => /* @__PURE__ */ React26.createElement("div", { style: {
    background: "var(--paper2)",
    border: "1px solid " + (isFinal ? "rgba(156,69,38,0.5)" : "var(--line)"),
    borderRadius: 14,
    overflow: "hidden",
    boxShadow: "var(--shadow-1)",
    ...wide ? { gridColumn: "1 / -1" } : {}
  } }, /* @__PURE__ */ React26.createElement("div", { style: {
    ...label,
    fontSize: size === "lg" ? 13 : 10.5,
    padding: size === "lg" ? "9px 14px 5px" : "7px 10px 3px",
    color: isFinal ? "var(--accent2)" : "var(--muted)"
  } }, title), entrants.map((key) => {
    const v = stageEntrantView(state, st, key);
    const isThrough = isFinal ? st.finalWinner === key : (through || []).includes(key);
    const decided = isFinal ? st.finalWinner !== null && st.finalWinner !== void 0 : (through || []).length >= st.advance;
    const dimmed = decided && !isThrough;
    const clickable = gm && (isFinal ? onFinal : onThrough);
    if (!gm && onPlayer) return /* @__PURE__ */ React26.createElement("div", { key: String(key), style: {
      padding: dims.pad,
      borderTop: "1px solid var(--line)",
      background: isThrough ? "var(--accent-tint)" : "transparent"
    } }, /* @__PURE__ */ React26.createElement(PlayerLinks, { state, players: v.players, onPlayer, size: dims.av }), isThrough && /* @__PURE__ */ React26.createElement("small", { style: { color: "var(--accent2)" } }, isFinal ? "Winner" : "Advanced"));
    return /* @__PURE__ */ React26.createElement(
      "button",
      {
        key: String(key),
        disabled: !clickable,
        onClick: () => isFinal ? onFinal(key) : onThrough(gIdx, key),
        style: {
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          textAlign: "left",
          padding: dims.pad,
          border: "none",
          borderTop: "1px solid var(--line)",
          cursor: clickable ? "pointer" : "default",
          background: isThrough ? "var(--accent-tint)" : "transparent",
          opacity: dimmed ? 0.38 : 1
        }
      },
      /* @__PURE__ */ React26.createElement(AvatarStack, { state, players: v.players, size: dims.av, max: 3 }),
      /* @__PURE__ */ React26.createElement("span", { style: {
        fontFamily: SANS,
        fontWeight: 700,
        fontSize: dims.f,
        flex: 1,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        color: isThrough ? "var(--accent2)" : "var(--ink)"
      } }, v.name),
      isThrough && /* @__PURE__ */ React26.createElement("span", { style: { fontFamily: SANS, fontWeight: 700, fontSize: dims.tf, color: "var(--accent2)" } }, isFinal ? "\u{1F3C6}" : "\u2713")
    );
  }));
  return /* @__PURE__ */ React26.createElement("div", { style: { display: "grid", gridTemplateColumns: dims.col, gap: dims.gap, alignItems: "start" } }, st.groups.map((g, i) => /* @__PURE__ */ React26.createElement(
    GroupCard,
    {
      key: i,
      title: `${g.name}${st.advance > 1 ? `, top ${st.advance} through` : ""}`,
      entrants: g.entrants,
      through: g.through,
      gIdx: i
    }
  )), finalists && /* @__PURE__ */ React26.createElement(
    GroupCard,
    {
      title: "The Final",
      entrants: finalists,
      isFinal: true,
      wide: size === "md" && (st.groups.length + 1) % 2 === 1
    }
  ));
}
function EventSheet({
  ev,
  state,
  me,
  gm,
  onLock,
  onWinner,
  onUndo,
  onClose,
  onBack,
  onPlayer,
  onBets,
  enterResult,
  clearRes,
  onEdit,
  onDraw,
  onClearDraw,
  onStages,
  onClearStages,
  onThrough,
  onFinal,
  onDeckToggle,
  onStart,
  onShelve,
  onRemove,
  openBracket,
  openDraft,
  onReplay
}) {
  const res = state.results[ev.id];
  const draw = state.draws[ev.id];
  const draftLive = state.drafts?.[ev.id];
  const br = state.brackets[ev.id];
  const st = state.stages[ev.id];
  const table = AWARDS[ev.value];
  const shelvedNow = !!state.shelved[ev.id];
  const [confirmRedraw, setConfirmRedraw] = useState17(false);
  const [confirmRemove, setConfirmRemove] = useState17(false);
  const [confirmClear, setConfirmClear] = useState17(false);
  const [clearReason, setClearReason] = useState17("");
  const [confirmScrap, setConfirmScrap] = useState17(false);
  const [editOpen, setEditOpen] = useState17(false);
  const [howTo, setHowTo] = useState17(false);
  const [more, setMore] = useState17(false);
  const [eName, setEName] = useState17("");
  const [eDesc, setEDesc] = useState17("");
  const [eValue, setEValue] = useState17(400);
  const [eSession, setESession] = useState17(null);
  const openEdit = () => {
    setEName(ev.name);
    setEDesc(ev.desc || "");
    setEValue(ev.value ?? 400);
    setESession(SESSIONS.find((s) => s.id === ev.session) ? ev.session : null);
    setEditOpen(true);
  };
  const [outs, setOuts] = useState17([]);
  const [outRoles, setOutRoles] = useState17({});
  const [showOuts, setShowOuts] = useState17(false);
  const [stageCfgOpen, setStageCfgOpen] = useState17(!!ev.stageCfg);
  const [nGroups, setNGroups] = useState17(null);
  const [advance, setAdvance] = useState17(ev.stageCfg?.advance || 1);
  const [setupPending, setSetupPending] = useState17(false);
  const [contestPending, setContestPending] = useState17(false);
  const waitForContest = async (callback) => {
    setContestPending(true);
    try {
      return await callback();
    } finally {
      setContestPending(false);
    }
  };
  const [setupError, setSetupError] = useState17("");
  const setupBusy = useRef12(false);
  const saveSetup = async (callback) => {
    if (setupBusy.current) return;
    setupBusy.current = true;
    setSetupPending(true);
    setSetupError("");
    try {
      const result = await callback();
      if (!result?.ok) setSetupError(result?.error || "Change not saved. Try again.");
    } catch (error) {
      setSetupError(error?.message || "Change not saved. Try again.");
    } finally {
      setupBusy.current = false;
      setSetupPending(false);
    }
  };
  const lifecycle = resolveEventLifecycle(state, ev);
  const contest = resolveCurrentContest(state, ev);
  const contestActive = contest && ["betting-open", "betting-locked", "in-progress", "awaiting-result"].includes(contest.phase);
  const setupAllowed = ["setup", "draw-pending", "draw-revealed", "scheduled"].includes(lifecycle.phase);
  const inPlayers = ROSTER.filter((p) => !outs.includes(p));
  const participantFit = validateEventParticipants(ev, inPlayers, ROSTER);
  const overflowAssignments = outs.map((player) => ({
    player,
    role: OVERFLOW_ROLES.includes(outRoles[player]) ? outRoles[player] : "sit-out"
  }));
  const isPoker = ev.game === "poker" && !!ev.finale;
  const canHeats = ev.kind === "solo" && !res && !isPoker;
  const canPools = ev.teamCfg && draw && !br && draw.teams.length >= 4 && !res;
  const stageKind = canHeats ? "heats" : "pools";
  const stageEntrantCount = canHeats ? inPlayers.length : draw?.teams?.length || 0;
  const suggestedGroups = Math.min(4, Math.max(2, Math.round(stageEntrantCount / (canHeats ? 4 : 3))));
  const groupsChoice = nGroups ?? ev.stageCfg?.nGroups ?? suggestedGroups;
  return /* @__PURE__ */ React26.createElement(
    Sheet,
    {
      title: ev.name,
      onClose,
      onBack,
      wide: !!br,
      busy: setupPending || contestPending,
      subtitle: [SESSIONS.find((s) => s.id === ev.session)?.label, ev.kind === "solo" ? "Individual" : ev.kind === "pairs" ? "Pairs" : "Teams"].filter(Boolean).join(" \xB7 "),
      headerActions: /* @__PURE__ */ React26.createElement(React26.Fragment, null, (draw || st) && onReplay && /* @__PURE__ */ React26.createElement("button", { type: "button", disabled: setupPending || contestPending, onClick: onReplay }, "Replay draw"), GAMES[ev.game]?.howto && /* @__PURE__ */ React26.createElement("button", { type: "button", disabled: setupPending || contestPending, onClick: () => setHowTo(true) }, "Rules"))
    },
    /* @__PURE__ */ React26.createElement(
      ContestPanel,
      {
        state,
        ev,
        me,
        gm,
        onPlayer,
        onBets,
        onLock: (reference2) => waitForContest(() => onLock(reference2)),
        onWinner: (result) => waitForContest(() => onWinner(result)),
        onUndo: (reference2) => waitForContest(() => onUndo(reference2)),
        onResult: () => waitForContest(enterResult)
      }
    ),
    br && !contestActive && /* @__PURE__ */ React26.createElement(CompetitionBracket, { state, ev, me, onPlayer }),
    /* @__PURE__ */ React26.createElement("details", { className: "fd-event-info", open: !draw && !st && !contestActive || void 0 }, /* @__PURE__ */ React26.createElement("summary", null, /* @__PURE__ */ React26.createElement("span", null, "Event info"), table?.[0] > 0 && /* @__PURE__ */ React26.createElement("small", null, fmt3(table[0]), " chips to win")), ev.desc && /* @__PURE__ */ React26.createElement("p", null, ev.desc), table && /* @__PURE__ */ React26.createElement("div", { className: "fd-event-awards" }, table.map((value, index) => value > 0 && /* @__PURE__ */ React26.createElement("span", { key: index }, /* @__PURE__ */ React26.createElement("small", null, SLOT_META[index].label), /* @__PURE__ */ React26.createElement("strong", null, "+", fmt3(value))))), ev.game === "poker" && ev.finale && /* @__PURE__ */ React26.createElement("p", null, "Your final chip count is your final standing.")),
    !contestActive && onBets && /* @__PURE__ */ React26.createElement(ActionButton, { variant: "secondary", onClick: onBets, style: { width: "100%", marginBottom: 12 } }, "View bets"),
    howTo && /* @__PURE__ */ React26.createElement(HowToSheet, { gameId: ev.game, variant: ev.variant, onClose: () => setHowTo(false) }),
    draftLive && !draw && /* @__PURE__ */ React26.createElement(DraftEntry, { state, ev, me, onOpen: () => openDraft() }),
    draw && !br && !st && /* @__PURE__ */ React26.createElement("div", { style: { marginBottom: 14 } }, /* @__PURE__ */ React26.createElement("div", { style: { ...label, marginBottom: 8 } }, "The draw"), draw.teams.length === 2 ? /* @__PURE__ */ React26.createElement(VersusDraw, { state, teams: draw.teams, onPlayer }) : /* @__PURE__ */ React26.createElement("div", { style: { display: "grid", gridTemplateColumns: draw.teams.length > 3 ? "1fr 1fr" : "1fr", gap: 8 } }, draw.teams.map((t, i) => /* @__PURE__ */ React26.createElement("div", { key: i, style: {
      background: "var(--paper2)",
      border: "1px solid var(--line)",
      borderRadius: 14,
      padding: "10px 12px",
      ...draw.teams.length > 3 && draw.teams.length % 2 === 1 && i === draw.teams.length - 1 ? { gridColumn: "1 / -1" } : {}
    } }, /* @__PURE__ */ React26.createElement("div", { style: { fontFamily: SANS, fontWeight: 700, fontSize: 12.5, color: "var(--accent2)", marginBottom: 5 } }, teamLabel(state, t)), /* @__PURE__ */ React26.createElement("div", { style: { display: "flex", gap: 5, flexWrap: "wrap" } }, t.players.map((p) => /* @__PURE__ */ React26.createElement("button", { type: "button", key: p, className: "fd-player-link", "aria-label": `View ${disp(state, p)}'s player card`, onClick: () => onPlayer?.(p) }, /* @__PURE__ */ React26.createElement(Avatar, { state, p, size: 30 }))))))), /* @__PURE__ */ React26.createElement(EventCrewCard, { state, roles: draw.roles, onPlayer })),
    st && /* @__PURE__ */ React26.createElement("details", { className: "fd-event-info", open: !contestActive || void 0 }, /* @__PURE__ */ React26.createElement("summary", null, /* @__PURE__ */ React26.createElement("span", null, "All ", st.kind === "heats" ? "heats" : "pools"), /* @__PURE__ */ React26.createElement("small", null, st.advance, " through from each")), /* @__PURE__ */ React26.createElement(StageGrid, { state, ev, gm: false, onPlayer })),
    (br || st) && /* @__PURE__ */ React26.createElement(EventCrewCard, { state, roles: draw?.roles || st?.roles, compact: true, onPlayer }),
    res && res.slots && /* @__PURE__ */ React26.createElement("div", { style: { marginBottom: 14 } }, res.slots.map((players, i) => players?.length > 0 && /* @__PURE__ */ React26.createElement("div", { key: i, style: { fontFamily: SANS, fontSize: 14, color: "var(--ink)", marginBottom: 4 } }, /* @__PURE__ */ React26.createElement("span", { style: { color: SLOT_META[i].color, fontWeight: 700 } }, SLOT_META[i].label, ":"), " ", players.map((p) => /* @__PURE__ */ React26.createElement("button", { type: "button", key: p, className: "fd-player-link", onClick: () => onPlayer?.(p) }, disp(state, p))), " ", /* @__PURE__ */ React26.createElement("span", { style: { color: "var(--muted)" } }, res.stacks ? `${fmt3(res.stacks[players[0]] ?? 0)} chips` : `+${table?.[i] ?? 0} each`)))),
    gm && !state.frozen && /* @__PURE__ */ React26.createElement("div", { style: { borderTop: "1px solid var(--line)", paddingTop: 14 } }, ev.teamCfg && !draw && !draftLive && !res && (() => {
      const fit2 = eventCapacity(ev);
      const diff = inPlayers.length - fit2;
      return /* @__PURE__ */ React26.createElement(React26.Fragment, null, /* @__PURE__ */ React26.createElement("div", { style: { display: "flex", alignItems: "center", marginBottom: 4 } }, /* @__PURE__ */ React26.createElement("div", { style: { ...label, flex: 1 } }, "Draw teams"), /* @__PURE__ */ React26.createElement("button", { onClick: () => setShowOuts((v) => !v), style: {
        cursor: "pointer",
        fontFamily: SANS,
        fontWeight: 700,
        fontSize: 12.5,
        padding: "7px 12px",
        borderRadius: 10,
        background: diff !== 0 ? "var(--clay-tint)" : "var(--paper)",
        border: diff !== 0 ? "1.5px solid var(--clay)" : "1px solid var(--line)",
        color: diff !== 0 ? "var(--clay)" : "var(--ink)"
      } }, inPlayers.length, " competitors ", showOuts ? "\u25B4" : "\u25BE")), /* @__PURE__ */ React26.createElement("div", { style: {
        fontFamily: SANS,
        fontSize: 12.5,
        marginBottom: 8,
        color: diff !== 0 ? "var(--clay)" : "var(--muted)"
      } }, "Format: ", ev.teamCfg.teams, " teams of ", ev.teamCfg.size, ", fits ", fit2, ".", diff > 0 ? ` Assign ${diff} to event crew.` : diff < 0 ? ` ${-diff} short.` : " Exact fit."), showOuts && /* @__PURE__ */ React26.createElement(React26.Fragment, null, /* @__PURE__ */ React26.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 5, marginBottom: 10 } }, ROSTER.map((p, i) => /* @__PURE__ */ React26.createElement(
        PlayerChip,
        {
          key: p,
          name: p,
          small: true,
          selected: !outs.includes(p),
          onClick: () => setOuts((o) => o.includes(p) ? o.filter((x) => x !== p) : [...o, p]),
          style: centeredGridCell(i, ROSTER.length, 3, 5)
        }
      ))), outs.length > 0 && /* @__PURE__ */ React26.createElement("div", { style: {
        background: "var(--paper2)",
        border: "1px solid rgba(194,88,50,0.38)",
        borderRadius: 14,
        padding: "11px 12px",
        marginBottom: 10
      } }, /* @__PURE__ */ React26.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 3 } }, /* @__PURE__ */ React26.createElement("span", { style: { ...label, color: "var(--accent2)", flex: 1 } }, "Event crew"), /* @__PURE__ */ React26.createElement("span", { style: { fontFamily: SANS, fontWeight: 700, fontSize: 10.5, color: "var(--muted2)" } }, outs.length, " ", outs.length === 1 ? "assignment" : "assignments")), /* @__PURE__ */ React26.createElement("div", { style: {
        fontFamily: SANS,
        fontSize: 11.5,
        lineHeight: 1.4,
        color: "var(--muted2)",
        marginBottom: 9
      } }, "These jobs keep the event moving. Crew do not compete or score in this one."), outs.map((player, index) => {
        const role = outRoles[player] || "sit-out";
        const meta = overflowRoleMeta(role);
        return /* @__PURE__ */ React26.createElement("div", { key: player, style: {
          display: "flex",
          alignItems: "center",
          gap: 9,
          padding: index ? "9px 0 0" : "0",
          marginTop: index ? 9 : 0,
          borderTop: index ? "1px solid var(--line)" : "none"
        } }, /* @__PURE__ */ React26.createElement(Avatar, { state, p: player, size: 32 }), /* @__PURE__ */ React26.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React26.createElement("div", { style: {
          fontFamily: SANS,
          fontWeight: 700,
          fontSize: 12.5,
          color: "var(--ink)",
          marginBottom: 3,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap"
        } }, disp(state, player)), /* @__PURE__ */ React26.createElement("div", { style: { fontFamily: SANS, fontSize: 10.5, lineHeight: 1.3, color: "var(--muted2)" } }, meta.detail)), /* @__PURE__ */ React26.createElement(
          "select",
          {
            "aria-label": `${disp(state, player)} event crew role`,
            value: role,
            onChange: (event) => setOutRoles((current) => ({ ...current, [player]: event.target.value })),
            style: {
              width: 142,
              maxWidth: "42%",
              padding: "8px 8px",
              borderRadius: 9,
              background: "var(--paper)",
              color: "var(--ink)",
              border: "1px solid var(--line)",
              fontFamily: SANS,
              fontWeight: 700,
              fontSize: 11.5
            }
          },
          OVERFLOW_ROLES.map((value) => /* @__PURE__ */ React26.createElement("option", { key: value, value }, overflowRoleMeta(value).label))
        ));
      }))), /* @__PURE__ */ React26.createElement("div", { style: { fontFamily: SANS, fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5, marginBottom: 10 } }, participantFit.ok ? `Teams balance from ratings and results.${outs.length ? " Event crew assignments save with the draw." : ""}` : participantFit.error), /* @__PURE__ */ React26.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 10 } }, /* @__PURE__ */ React26.createElement(
        Btn,
        {
          disabled: !participantFit.ok || setupPending,
          onClick: () => saveSetup(() => onDraw(inPlayers, overflowAssignments)),
          style: { flex: 1, whiteSpace: "nowrap", padding: "12px 8px" }
        },
        setupPending ? "Drawing\u2026" : "Run the draw"
      ), ev.kind === "team" && /* @__PURE__ */ React26.createElement(
        Btn,
        {
          kind: "dark",
          disabled: !participantFit.ok,
          onClick: () => openDraft(inPlayers, overflowAssignments),
          style: { flex: 1, whiteSpace: "nowrap", padding: "12px 8px" }
        },
        "Captains draft"
      )));
    })(), ev.teamCfg && draw && !res && setupAllowed && (confirmRedraw ? /* @__PURE__ */ React26.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 10 } }, /* @__PURE__ */ React26.createElement(Btn, { kind: "danger", onClick: () => {
      onClearDraw();
      setConfirmRedraw(false);
    }, style: { flex: 1 } }, "Scrap the draw"), /* @__PURE__ */ React26.createElement(Btn, { kind: "ghost", onClick: () => setConfirmRedraw(false), style: { flex: 1 } }, "Keep it")) : /* @__PURE__ */ React26.createElement(Btn, { kind: "ghost", onClick: () => setConfirmRedraw(true), style: { width: "100%", marginBottom: 10 } }, "Redraw")), (canHeats || canPools) && !st && setupAllowed && (!stageCfgOpen ? /* @__PURE__ */ React26.createElement(Btn, { kind: "dark", onClick: () => setStageCfgOpen(true), style: { width: "100%", marginBottom: 10 } }, canHeats ? "Run heats" : "Set up pools") : /* @__PURE__ */ React26.createElement("div", { style: {
      background: "var(--paper2)",
      border: "1px solid var(--line)",
      borderRadius: 14,
      padding: "12px 13px",
      marginBottom: 10
    } }, canHeats && /* @__PURE__ */ React26.createElement(React26.Fragment, null, /* @__PURE__ */ React26.createElement("div", { style: { display: "flex", alignItems: "center", marginBottom: 8 } }, /* @__PURE__ */ React26.createElement("div", { style: { ...label, flex: 1 } }, "Heats"), /* @__PURE__ */ React26.createElement("button", { onClick: () => setShowOuts((v) => !v), style: {
      cursor: "pointer",
      fontFamily: SANS,
      fontWeight: 700,
      fontSize: 12.5,
      padding: "6px 11px",
      borderRadius: 10,
      background: "var(--paper)",
      border: "1px solid var(--line)",
      color: "var(--ink)"
    } }, inPlayers.length, " playing ", showOuts ? "\u25B4" : "\u25BE")), showOuts && /* @__PURE__ */ React26.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 5, marginBottom: 10 } }, ROSTER.map((p, i) => /* @__PURE__ */ React26.createElement(
      PlayerChip,
      {
        key: p,
        name: p,
        small: true,
        selected: !outs.includes(p),
        onClick: () => setOuts((o) => o.includes(p) ? o.filter((x) => x !== p) : [...o, p]),
        style: centeredGridCell(i, ROSTER.length, 3, 5)
      }
    )))), /* @__PURE__ */ React26.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 } }, /* @__PURE__ */ React26.createElement("span", { style: { ...label } }, canHeats ? "Heats" : "Pools"), [2, 3, 4].filter((n) => n <= stageEntrantCount).map((n) => /* @__PURE__ */ React26.createElement("button", { key: n, onClick: () => setNGroups(n), style: {
      width: 44,
      height: 44,
      borderRadius: 10,
      cursor: "pointer",
      fontFamily: DISPLAY,
      fontWeight: 700,
      fontSize: 19,
      background: groupsChoice === n ? GOLD_GRAD : "var(--paper)",
      color: groupsChoice === n ? "var(--ink0)" : "var(--ink)",
      border: groupsChoice === n ? "1.5px solid var(--ink0)" : "1.5px solid var(--line)"
    } }, n)), /* @__PURE__ */ React26.createElement("span", { style: { flex: 1 } }), /* @__PURE__ */ React26.createElement("span", { style: { ...label } }, "Through"), [1, 2].map((n) => /* @__PURE__ */ React26.createElement("button", { key: n, onClick: () => setAdvance(n), style: {
      width: 44,
      height: 44,
      borderRadius: 10,
      cursor: "pointer",
      fontFamily: DISPLAY,
      fontWeight: 700,
      fontSize: 19,
      background: advance === n ? GOLD_GRAD : "var(--paper)",
      color: advance === n ? "var(--ink0)" : "var(--ink)",
      border: advance === n ? "1.5px solid var(--ink0)" : "1.5px solid var(--line)"
    } }, n))), /* @__PURE__ */ React26.createElement("div", { style: { display: "flex", gap: 8 } }, /* @__PURE__ */ React26.createElement(
      ActionButton,
      {
        disabled: setupPending || canHeats && !participantFit.ok,
        onClick: () => saveSetup(() => onStages({
          kind: stageKind,
          nGroups: groupsChoice,
          advance,
          players: inPlayers
        })),
        style: { flex: 1 }
      },
      setupPending ? "Drawing\u2026" : canHeats ? "Draw heats" : "Draw pools"
    ), /* @__PURE__ */ React26.createElement(ActionButton, { variant: "tertiary", onClick: () => setStageCfgOpen(false) }, "Cancel")))), setupError && /* @__PURE__ */ React26.createElement("p", { className: "fd-contest-error", role: "alert" }, setupError), st && !res && setupAllowed && (confirmScrap ? /* @__PURE__ */ React26.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 10 } }, /* @__PURE__ */ React26.createElement(ActionButton, { variant: "commit", onClick: () => {
      onClearStages();
      setConfirmScrap(false);
    }, style: { flex: 1 } }, "Scrap ", st.kind === "heats" ? "heats" : "pools", ", sure"), /* @__PURE__ */ React26.createElement(ActionButton, { variant: "tertiary", onClick: () => setConfirmScrap(false), style: { flex: 1 } }, "Keep")) : /* @__PURE__ */ React26.createElement(ActionButton, { variant: "destructive", onClick: () => setConfirmScrap(true), style: { width: "100%", marginBottom: 10 } }, "Scrap ", st.kind === "heats" ? "heats" : "pools")), /* @__PURE__ */ React26.createElement("div", { style: { display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" } }, res && !isPoker && /* @__PURE__ */ React26.createElement(
      ActionButton,
      {
        onClick: enterResult,
        style: { flex: 1, whiteSpace: "nowrap", padding: "12px 8px" }
      },
      "Edit result"
    ), !res && lifecycle.nextAction?.type === "open-betting" && /* @__PURE__ */ React26.createElement(
      ActionButton,
      {
        variant: "secondary",
        onClick: onDeckToggle,
        style: { flex: 1, whiteSpace: "nowrap", padding: "12px 8px" }
      },
      "Open betting"
    ), !res && !contestActive && lifecycle.nextAction?.type === "lock-betting" && /* @__PURE__ */ React26.createElement(
      ActionButton,
      {
        variant: "secondary",
        onClick: onDeckToggle,
        style: { flex: 1, whiteSpace: "nowrap", padding: "12px 8px" }
      },
      "Lock betting"
    ), !res && !contestActive && lifecycle.nextAction?.type === "start-event" && /* @__PURE__ */ React26.createElement(
      ActionButton,
      {
        onClick: onStart,
        style: { flex: 1, whiteSpace: "nowrap", padding: "12px 8px" }
      },
      "Start event"
    ), res && !confirmClear && /* @__PURE__ */ React26.createElement(ActionButton, { variant: "destructive", onClick: () => setConfirmClear(true), style: { flex: 1 } }, "Clear")), !res && !contestActive && lifecycle.blockers?.length > 0 && /* @__PURE__ */ React26.createElement("div", { style: { ...pStyle, marginTop: 8, color: "var(--muted)", fontSize: 13 } }, "Next: ", lifecycle.blockers[0]), res && confirmClear && /* @__PURE__ */ React26.createElement("div", { style: {
      marginTop: 10,
      padding: "12px 13px",
      background: "var(--paper2)",
      border: "1px solid var(--line)",
      borderRadius: 14
    } }, /* @__PURE__ */ React26.createElement("div", { style: { ...label, marginBottom: 6 } }, "Why is this result being cleared?"), /* @__PURE__ */ React26.createElement(
      "input",
      {
        value: clearReason,
        onChange: (event) => setClearReason(event.target.value),
        maxLength: 100,
        placeholder: "Example: signed scorecard needs re-entry",
        style: {
          width: "100%",
          background: "var(--paper)",
          border: "1px solid var(--line)",
          borderRadius: 10,
          padding: "11px 12px",
          color: "var(--ink)",
          fontFamily: SANS,
          fontWeight: 600,
          fontSize: 14,
          marginBottom: 9,
          outline: "none"
        }
      }
    ), /* @__PURE__ */ React26.createElement("div", { style: { display: "flex", gap: 8 } }, /* @__PURE__ */ React26.createElement(
      ActionButton,
      {
        variant: "commit",
        disabled: !clearReason.trim(),
        onClick: () => clearRes(clearReason),
        style: { flex: 1 }
      },
      "Clear official result"
    ), /* @__PURE__ */ React26.createElement(
      ActionButton,
      {
        variant: "tertiary",
        onClick: () => {
          setConfirmClear(false);
          setClearReason("");
        },
        style: { flex: 1 }
      },
      "Keep it"
    ))), editOpen ? /* @__PURE__ */ React26.createElement("div", { style: {
      background: "var(--paper2)",
      border: "1px solid var(--line)",
      borderRadius: 14,
      padding: "12px 13px",
      marginTop: 8
    } }, /* @__PURE__ */ React26.createElement("div", { style: { ...label, marginBottom: 6 } }, "Name"), /* @__PURE__ */ React26.createElement(
      "input",
      {
        value: eName,
        onChange: (e) => setEName(e.target.value),
        maxLength: 28,
        "aria-label": "Event name",
        style: {
          width: "100%",
          background: "var(--paper)",
          border: "1px solid var(--line)",
          borderRadius: 10,
          padding: "11px 12px",
          color: "var(--ink)",
          fontFamily: SANS,
          fontWeight: 600,
          fontSize: 16,
          marginBottom: 12,
          outline: "none"
        }
      }
    ), /* @__PURE__ */ React26.createElement("div", { style: { ...label, marginBottom: 6 } }, "How it works"), /* @__PURE__ */ React26.createElement(
      "textarea",
      {
        value: eDesc,
        onChange: (e) => setEDesc(e.target.value),
        maxLength: 300,
        rows: 3,
        "aria-label": "Event description",
        style: {
          width: "100%",
          background: "var(--paper)",
          border: "1px solid var(--line)",
          borderRadius: 10,
          padding: "11px 12px",
          color: "var(--ink)",
          fontFamily: SANS,
          fontSize: 14,
          lineHeight: 1.5,
          marginBottom: 12,
          outline: "none",
          resize: "vertical"
        }
      }
    ), /* @__PURE__ */ React26.createElement("div", { style: { ...label, marginBottom: 6 } }, "Worth"), /* @__PURE__ */ React26.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 12 } }, [400, 800, 1200, 1600].map((v) => /* @__PURE__ */ React26.createElement("button", { key: v, onClick: () => setEValue(v), style: {
      flex: 1,
      height: 44,
      borderRadius: 10,
      cursor: "pointer",
      fontFamily: DISPLAY,
      fontWeight: 700,
      fontSize: 16,
      background: eValue === v ? GOLD_GRAD : "var(--paper)",
      color: eValue === v ? "var(--ink0)" : "var(--ink)",
      border: eValue === v ? "1.5px solid var(--ink0)" : "1.5px solid var(--line)"
    } }, v))), /* @__PURE__ */ React26.createElement("div", { style: { ...label, marginBottom: 6 } }, "When"), /* @__PURE__ */ React26.createElement("div", { style: { display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 } }, [...SESSIONS.map((s) => [s.id, s.label]), [null, "Anytime"]].map(([id, lb]) => /* @__PURE__ */ React26.createElement("button", { key: String(id), onClick: () => setESession(id), style: {
      fontFamily: SANS,
      fontWeight: 600,
      fontSize: 12.5,
      padding: "10px 12px",
      borderRadius: 10,
      cursor: "pointer",
      background: eSession === id ? GOLD_GRAD : "var(--paper)",
      color: eSession === id ? "var(--ink0)" : "var(--ink)",
      border: eSession === id ? "1.5px solid var(--ink0)" : "1.5px solid var(--line)"
    } }, lb))), /* @__PURE__ */ React26.createElement("div", { style: { display: "flex", gap: 8 } }, /* @__PURE__ */ React26.createElement(
      Btn,
      {
        disabled: !eName.trim(),
        onClick: () => {
          onEdit({ name: eName, desc: eDesc, value: eValue, session: eSession });
          setEditOpen(false);
        },
        style: { flex: 1 }
      },
      "Save"
    ), /* @__PURE__ */ React26.createElement(Btn, { kind: "ghost", onClick: () => setEditOpen(false) }, "Cancel"))) : !more ? /* @__PURE__ */ React26.createElement("button", { onClick: () => setMore(true), style: {
      background: "none",
      border: "none",
      cursor: "pointer",
      fontFamily: SANS,
      fontWeight: 600,
      fontSize: 12.5,
      color: "var(--accent2)",
      minHeight: 44,
      padding: "8px 0",
      display: "block",
      marginLeft: "auto"
    } }, "More options \u25BE") : /* @__PURE__ */ React26.createElement("div", { style: { display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" } }, /* @__PURE__ */ React26.createElement(Btn, { kind: "ghost", onClick: openEdit, style: { flex: 1 } }, "Edit details"), !res && /* @__PURE__ */ React26.createElement(Btn, { kind: "ghost", onClick: () => onShelve(!shelvedNow), style: { flex: 1 } }, shelvedNow ? "Restore" : "Shelve"), ev.custom && !confirmRemove && /* @__PURE__ */ React26.createElement(Btn, { kind: "danger", onClick: () => setConfirmRemove(true) }, "Remove"), ev.custom && confirmRemove && /* @__PURE__ */ React26.createElement(Btn, { kind: "danger", onClick: onRemove }, "Confirm remove")))
  );
}
function BracketSheet({ ev, state, me, gm, onClose, onBack, onPlayer, onLock, onWinner, onUndo, onBets, onPostResult }) {
  const [pending, setPending] = useState17(false);
  const waitFor = async (callback) => {
    setPending(true);
    try {
      return await callback();
    } finally {
      setPending(false);
    }
  };
  const br = state.brackets[ev.id], draw = state.draws[ev.id];
  if (!br || !draw) return null;
  const contest = resolveCurrentContest(state, ev);
  const active = contest && ["betting-open", "betting-locked", "in-progress", "awaiting-result"].includes(contest.phase);
  return /* @__PURE__ */ React26.createElement(Sheet, { title: ev.name, subtitle: "Tournament", onClose, onBack, busy: pending, wide: true }, /* @__PURE__ */ React26.createElement(
    ContestPanel,
    {
      state,
      ev,
      me,
      gm,
      onPlayer,
      onBets,
      onLock: (reference2) => waitFor(() => onLock(reference2)),
      onWinner: (result) => waitFor(() => onWinner(result)),
      onUndo: (reference2) => waitFor(() => onUndo(reference2)),
      onResult: () => waitFor(onPostResult)
    }
  ), !active && /* @__PURE__ */ React26.createElement(CompetitionBracket, { state, ev, me, onPlayer }), /* @__PURE__ */ React26.createElement(EventCrewCard, { state, roles: draw.roles, compact: true, onPlayer }));
}
function ResultSheet({ ev, state, onClose, save }) {
  const existing = state.results[ev.id];
  const table = AWARDS[ev.value] || [400, 0, 0];
  const slotIdxs = table.map((v, i) => v > 0 ? i : null).filter((i) => i !== null);
  const bracket = state.brackets[ev.id], stage = state.stages[ev.id];
  const sequenced = !!state.eventOps?.[ev.id]?.contest;
  const winnerKnown = sequenced && (bracket && bracketChampion(bracket) !== null || stage && stage.finalWinner !== null && stage.finalWinner !== void 0);
  const editableSlots = slotIdxs.filter((index) => !winnerKnown || index !== 0);
  const initial = useMemo3(() => {
    if (existing?.slots) return existing.slots.map((s) => [...s || []]);
    const br = state.brackets[ev.id], draw2 = state.draws[ev.id], st = state.stages[ev.id];
    if (br && draw2) {
      const champ = bracketChampion(br);
      if (champ !== null) {
        const final = br.rounds[br.rounds.length - 1][0];
        const a = resolveSlot(br, final.a), b = resolveSlot(br, final.b);
        const runner = champ === a ? b : a;
        return [
          [...draw2.teams[champ].players],
          table[1] > 0 && runner !== null ? [...draw2.teams[runner].players] : [],
          []
        ];
      }
    }
    if (st && st.finalWinner !== null && st.finalWinner !== void 0) {
      const v = stageEntrantView(state, st, st.finalWinner);
      return [[...v.players], [], []];
    }
    return [[], [], []];
  }, []);
  const [slots, setSlots] = useState17(initial);
  const [active, setActive] = useState17(editableSlots[0] ?? 0);
  const [byPlayer, setByPlayer] = useState17(false);
  const [confirmCorrection, setConfirmCorrection] = useState17(false);
  const [correctionReason, setCorrectionReason] = useState17("");
  const [pending, setPending] = useState17(false), [error, setError] = useState17("");
  const saving = useRef12(false);
  const post = async (options) => {
    if (saving.current) return;
    saving.current = true;
    setPending(true);
    setError("");
    try {
      const result = await save(slots, options);
      if (result?.ok !== true) setError(result?.error || "Result not saved. Try again.");
    } catch (failure) {
      setError(failure?.message || "Result not saved. Try again.");
    } finally {
      saving.current = false;
      setPending(false);
    }
  };
  const draw = state.draws[ev.id];
  const teamMode = !!draw?.teams?.length && ev.kind !== "solo" && (!byPlayer || sequenced && active === 0);
  const unchanged = !!existing && JSON.stringify(existing.slots || []) === JSON.stringify(slots);
  const taken = (p) => slots.findIndex((s) => s.includes(p));
  const toggle = (p) => setSlots((prev) => {
    if (saving.current || winnerKnown && prev[0].includes(p)) return prev;
    const nx = prev.map((s) => [...s]);
    const w = nx.findIndex((s) => s.includes(p));
    if (sequenced && active === 0) return nx.map((slot, index) => index === 0 ? w === 0 ? [] : [p] : slot.filter((player) => player !== p));
    if (w === active) nx[active] = nx[active].filter((x) => x !== p);
    else {
      if (w >= 0) nx[w] = nx[w].filter((x) => x !== p);
      nx[active].push(p);
    }
    return nx;
  });
  const teamSlot = (t) => slots.findIndex((s) => t.players.length && t.players.every((p) => s.includes(p)));
  const toggleTeam = (t) => setSlots((prev) => {
    if (saving.current || winnerKnown && t.players.some((p) => prev[0].includes(p))) return prev;
    const was = prev.findIndex((s) => t.players.length && t.players.every((p) => s.includes(p)));
    const nx = prev.map((s) => s.filter((p) => !t.players.includes(p)));
    if (sequenced && active === 0) {
      nx[0] = was === 0 ? [] : [...t.players];
      return nx;
    }
    if (was !== active) nx[active] = [...nx[active], ...t.players];
    return nx;
  });
  return /* @__PURE__ */ React26.createElement(Sheet, { title: ev.name, subtitle: "Official result", onClose, busy: pending }, winnerKnown && /* @__PURE__ */ React26.createElement("div", { className: "fd-result-winner" }, /* @__PURE__ */ React26.createElement("small", null, "Winner"), /* @__PURE__ */ React26.createElement("strong", null, slots[0].map((player) => disp(state, player)).join(" & ")), /* @__PURE__ */ React26.createElement("span", null, "+", fmt3(table[0]), slots[0].length > 1 ? " each" : " chips")), !!editableSlots.length && /* @__PURE__ */ React26.createElement("fieldset", { disabled: pending, style: { border: 0, padding: 0, margin: 0, minWidth: 0 } }, /* @__PURE__ */ React26.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 14 } }, editableSlots.map((i) => /* @__PURE__ */ React26.createElement("button", { key: i, onClick: () => setActive(i), style: {
    flex: 1,
    padding: "10px 6px",
    cursor: "pointer",
    borderRadius: 14,
    border: "1px solid " + (active === i ? "var(--accent)" : "var(--line)"),
    background: active === i ? "rgba(194,88,50,0.1)" : "var(--paper2)"
  } }, /* @__PURE__ */ React26.createElement("div", { style: { fontFamily: SANS, fontWeight: 700, fontSize: 14, color: SLOT_META[i].color } }, ev.kind === "solo" ? SLOT_META[i].label : SLOT_META[i].team), /* @__PURE__ */ React26.createElement("div", { style: { fontFamily: SANS, fontSize: 11, color: "var(--muted)" } }, "+", table[i], " each, ", slots[i].length, " in")))), teamMode ? /* @__PURE__ */ React26.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 } }, draw.teams.filter((t) => !winnerKnown || !t.players.some((p) => slots[0].includes(p))).map((t, i) => {
    const w = teamSlot(t);
    return /* @__PURE__ */ React26.createElement("button", { key: i, onClick: () => toggleTeam(t), style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "10px 11px",
      borderRadius: 14,
      cursor: "pointer",
      textAlign: "left",
      background: w === active ? GOLD_GRAD : "var(--paper)",
      border: w === active ? "1.5px solid var(--ink0)" : "1.5px solid var(--line)",
      ...draw.teams.length % 2 === 1 && i === draw.teams.length - 1 ? { gridColumn: "1 / -1" } : {}
    } }, /* @__PURE__ */ React26.createElement(AvatarStack, { state, players: t.players, size: 22, max: 3 }), /* @__PURE__ */ React26.createElement("span", { style: {
      flex: 1,
      fontFamily: SANS,
      fontWeight: 600,
      fontSize: 12.5,
      minWidth: 0,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      color: w === active ? "var(--ink0)" : "var(--ink)"
    } }, teamLabel(state, t)), w >= 0 && w !== active && /* @__PURE__ */ React26.createElement("span", { style: {
      fontFamily: SANS,
      fontWeight: 700,
      fontSize: 11,
      color: SLOT_META[w].color,
      flexShrink: 0
    } }, SLOT_META[w].label));
  })) : /* @__PURE__ */ React26.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8, marginBottom: 10 } }, ROSTER.filter((p) => !winnerKnown || !slots[0].includes(p)).map((p, i) => {
    const w = taken(p);
    return /* @__PURE__ */ React26.createElement(
      PlayerChip,
      {
        key: p,
        name: w >= 0 && w !== active ? `${p} (${SLOT_META[w].label})` : p,
        selected: w === active,
        onClick: () => toggle(p),
        small: true,
        style: centeredGridCell(i, ROSTER.length)
      }
    );
  })), !!draw?.teams?.length && ev.kind !== "solo" && !(sequenced && active === 0) && /* @__PURE__ */ React26.createElement("button", { onClick: () => setByPlayer((v) => !v), style: {
    background: "none",
    border: "none",
    cursor: "pointer",
    fontFamily: SANS,
    fontWeight: 600,
    fontSize: 12.5,
    color: "var(--accent2)",
    minHeight: 44,
    padding: "6px 0",
    display: "block"
  } }, byPlayer ? "Back to teams" : "Pick player by player instead")), error && /* @__PURE__ */ React26.createElement("p", { role: "alert", style: { color: "var(--clay)", fontSize: 13 } }, error), !existing ? /* @__PURE__ */ React26.createElement(
    ActionButton,
    {
      disabled: slots[0].length === 0 || pending,
      onClick: () => post(),
      style: { width: "100%", fontSize: 16, padding: "14px", marginTop: 4 }
    },
    "Post official result"
  ) : !confirmCorrection ? /* @__PURE__ */ React26.createElement(
    ActionButton,
    {
      disabled: slots[0].length === 0 || unchanged || pending,
      onClick: () => setConfirmCorrection(true),
      style: { width: "100%", fontSize: 16, padding: "14px", marginTop: 4 }
    },
    unchanged ? `Official result \xB7 revision ${existing.revision || 1}` : "Review result correction"
  ) : /* @__PURE__ */ React26.createElement("div", { style: {
    marginTop: 4,
    padding: "12px 13px",
    background: "var(--paper2)",
    border: "1px solid var(--line)",
    borderRadius: 14
  } }, /* @__PURE__ */ React26.createElement("div", { style: { ...label, marginBottom: 6 } }, "Why is the official result changing?"), /* @__PURE__ */ React26.createElement(
    "input",
    {
      value: correctionReason,
      disabled: pending,
      onChange: (event) => setCorrectionReason(event.target.value),
      maxLength: 100,
      placeholder: "Example: 2nd and 3rd were reversed",
      style: {
        width: "100%",
        background: "var(--paper)",
        border: "1px solid var(--line)",
        borderRadius: 10,
        padding: "11px 12px",
        color: "var(--ink)",
        fontFamily: SANS,
        fontWeight: 600,
        fontSize: 14,
        marginBottom: 9,
        outline: "none"
      }
    }
  ), /* @__PURE__ */ React26.createElement("div", { style: { display: "flex", gap: 8 } }, /* @__PURE__ */ React26.createElement(
    ActionButton,
    {
      variant: "commit",
      disabled: !correctionReason.trim() || pending,
      onClick: () => post({
        confirmOverwrite: true,
        correctionReason
      }),
      style: { flex: 1 }
    },
    "Replace official result"
  ), /* @__PURE__ */ React26.createElement(ActionButton, { variant: "tertiary", disabled: pending, onClick: () => {
    setConfirmCorrection(false);
    setCorrectionReason("");
  }, style: { flex: 1 } }, "Keep current"))));
}
function GameMoment({ gameId }) {
  const Hero = GAME_HEROES[gameId];
  return /* @__PURE__ */ React26.createElement("div", { className: "fd-game-moment", "aria-hidden": "true" }, Hero && !prefersReducedMotion() ? /* @__PURE__ */ React26.createElement(Hero, null) : /* @__PURE__ */ React26.createElement(GameMark, { id: gameId, size: 72 }));
}
function EventSpotlight({ gameId, big = false }) {
  const mark = big ? 150 : 112;
  const box = big ? 242 : 176;
  return /* @__PURE__ */ React26.createElement("div", { style: { position: "relative", width: box, height: box, display: "grid", placeItems: "center" } }, /* @__PURE__ */ React26.createElement("span", { className: "si-event-ring", "aria-hidden": "true" }), /* @__PURE__ */ React26.createElement("span", { className: "si-event-ring si-event-ring-2", "aria-hidden": "true" }), /* @__PURE__ */ React26.createElement("span", { className: "si-event-rule si-event-rule-left", "aria-hidden": "true" }), /* @__PURE__ */ React26.createElement("span", { className: "si-event-rule si-event-rule-right", "aria-hidden": "true" }), /* @__PURE__ */ React26.createElement("span", { className: "si-event-mark", style: GAME_HEROES[gameId] ? { transform: big ? "scale(1.4)" : void 0 } : void 0 }, GAME_HEROES[gameId] ? /* @__PURE__ */ React26.createElement(GameMoment, { gameId }) : /* @__PURE__ */ React26.createElement(GameMark, { id: gameId, size: mark, hero: true })));
}
function DieHero() {
  return /* @__PURE__ */ React26.createElement("svg", { width: "180", height: "82", viewBox: "0 0 180 82", "aria-hidden": "true", style: { display: "block", overflow: "visible" } }, /* @__PURE__ */ React26.createElement("line", { x1: "8", y1: "60", x2: "172", y2: "60", stroke: "var(--sun)", strokeWidth: "3", strokeLinecap: "round" }), /* @__PURE__ */ React26.createElement("line", { x1: "8", y1: "66", x2: "172", y2: "66", stroke: "var(--ink)", strokeWidth: "1.6", strokeLinecap: "round", opacity: "0.4" }), /* @__PURE__ */ React26.createElement("g", { style: { animation: "si-die-arc 2.6s linear 1 both" } }, /* @__PURE__ */ React26.createElement("rect", { x: "0", y: "0", width: "20", height: "20", rx: "4.5", fill: "var(--paper)", stroke: "var(--ink)", strokeWidth: "1.8" }), /* @__PURE__ */ React26.createElement("circle", { cx: "5.5", cy: "5.5", r: "1.7", fill: "var(--ink)" }), /* @__PURE__ */ React26.createElement("circle", { cx: "14.5", cy: "5.5", r: "1.7", fill: "var(--ink)" }), /* @__PURE__ */ React26.createElement("circle", { cx: "10", cy: "10", r: "1.7", fill: "var(--ink)" }), /* @__PURE__ */ React26.createElement("circle", { cx: "5.5", cy: "14.5", r: "1.7", fill: "var(--ink)" }), /* @__PURE__ */ React26.createElement("circle", { cx: "14.5", cy: "14.5", r: "1.7", fill: "var(--ink)" })));
}
function PongHero() {
  return /* @__PURE__ */ React26.createElement("svg", { width: "180", height: "82", viewBox: "0 0 180 82", "aria-hidden": "true", style: { display: "block", overflow: "visible" } }, /* @__PURE__ */ React26.createElement("line", { x1: "8", y1: "60", x2: "172", y2: "60", stroke: "var(--sun)", strokeWidth: "3", strokeLinecap: "round" }), /* @__PURE__ */ React26.createElement("path", { d: "M112 30h20l-2.5 28h-15z", fill: "var(--paper)", stroke: "var(--ink)", strokeWidth: "1.8", strokeLinejoin: "round" }), /* @__PURE__ */ React26.createElement("ellipse", { cx: "122", cy: "30", rx: "10", ry: "3", fill: "var(--paper2)", stroke: "var(--ink)", strokeWidth: "1.4" }), /* @__PURE__ */ React26.createElement("g", { style: { animation: "si-pong-arc 2s linear 1 both" } }, /* @__PURE__ */ React26.createElement("circle", { cx: "8", cy: "0", r: "5.5", fill: "var(--paper)", stroke: "var(--ink)", strokeWidth: "1.6" })));
}
function FlipHero() {
  return /* @__PURE__ */ React26.createElement("svg", { width: "180", height: "82", viewBox: "0 0 180 82", "aria-hidden": "true", style: { display: "block", overflow: "visible" } }, /* @__PURE__ */ React26.createElement("line", { x1: "8", y1: "60", x2: "172", y2: "60", stroke: "var(--sun)", strokeWidth: "3", strokeLinecap: "round" }), /* @__PURE__ */ React26.createElement("g", { style: { animation: "si-flip-cup 2.2s ease-in-out 1 both", transformOrigin: "90px 46px" } }, /* @__PURE__ */ React26.createElement("path", { d: "M78 32h24l-3 28H81z", fill: "var(--paper)", stroke: "var(--ink)", strokeWidth: "1.8", strokeLinejoin: "round" }), /* @__PURE__ */ React26.createElement("ellipse", { cx: "90", cy: "32", rx: "12", ry: "3.4", fill: "var(--paper2)", stroke: "var(--ink)", strokeWidth: "1.4" })));
}
function PuttHero() {
  return /* @__PURE__ */ React26.createElement("svg", { width: "180", height: "82", viewBox: "0 0 180 82", "aria-hidden": "true", style: { display: "block", overflow: "visible" } }, /* @__PURE__ */ React26.createElement("line", { x1: "8", y1: "60", x2: "132", y2: "60", stroke: "var(--sun)", strokeWidth: "3", strokeLinecap: "round" }), /* @__PURE__ */ React26.createElement("line", { x1: "146", y1: "60", x2: "172", y2: "60", stroke: "var(--sun)", strokeWidth: "3", strokeLinecap: "round" }), /* @__PURE__ */ React26.createElement("line", { x1: "139", y1: "60", x2: "139", y2: "26", stroke: "var(--ink)", strokeWidth: "1.8" }), /* @__PURE__ */ React26.createElement("path", { d: "M139 26h16l-5 5.5 5 5.5h-16z", fill: "var(--accent)", stroke: "var(--ink)", strokeWidth: "1.4", strokeLinejoin: "round" }), /* @__PURE__ */ React26.createElement("g", { style: { animation: "si-putt 2.4s ease-in-out 1 both" } }, /* @__PURE__ */ React26.createElement("circle", { cx: "12", cy: "54", r: "5", fill: "var(--paper)", stroke: "var(--ink)", strokeWidth: "1.6" })));
}
function EightHero() {
  return /* @__PURE__ */ React26.createElement("svg", { width: "180", height: "82", viewBox: "0 0 180 82", "aria-hidden": "true", style: { display: "block", overflow: "visible" } }, /* @__PURE__ */ React26.createElement("line", { x1: "8", y1: "60", x2: "172", y2: "60", stroke: "var(--sun)", strokeWidth: "3", strokeLinecap: "round" }), /* @__PURE__ */ React26.createElement("g", { style: { animation: "si-cue 2.4s ease-out 1 both" } }, /* @__PURE__ */ React26.createElement("circle", { cx: "26", cy: "52", r: "7", fill: "var(--paper)", stroke: "var(--ink)", strokeWidth: "1.6" })), /* @__PURE__ */ React26.createElement("g", { style: { animation: "si-eight 2.4s ease-out 1 both" } }, /* @__PURE__ */ React26.createElement("circle", { cx: "96", cy: "52", r: "7", fill: "var(--ink0)", stroke: "var(--bone)", strokeWidth: "1.6" }), /* @__PURE__ */ React26.createElement("circle", { cx: "96", cy: "52", r: "3.2", fill: "var(--paper)" }), /* @__PURE__ */ React26.createElement("text", { x: "96", y: "54.6", textAnchor: "middle", fontSize: "5", fontWeight: "700", fontFamily: SANS, fill: "var(--ink0)" }, "8")));
}
function BballHero() {
  return /* @__PURE__ */ React26.createElement("svg", { width: "180", height: "82", viewBox: "0 0 180 82", "aria-hidden": "true", style: { display: "block", overflow: "visible" } }, /* @__PURE__ */ React26.createElement("line", { x1: "8", y1: "60", x2: "172", y2: "60", stroke: "var(--sun)", strokeWidth: "3", strokeLinecap: "round" }), /* @__PURE__ */ React26.createElement("line", { x1: "158", y1: "12", x2: "158", y2: "34", stroke: "var(--ink)", strokeWidth: "2.2" }), /* @__PURE__ */ React26.createElement("line", { x1: "142", y1: "32", x2: "158", y2: "32", stroke: "var(--accent)", strokeWidth: "2.6", strokeLinecap: "round" }), /* @__PURE__ */ React26.createElement("line", { x1: "144", y1: "32", x2: "147", y2: "43", stroke: "var(--ink)", strokeWidth: "1.2", opacity: "0.6" }), /* @__PURE__ */ React26.createElement("line", { x1: "155", y1: "32", x2: "153", y2: "43", stroke: "var(--ink)", strokeWidth: "1.2", opacity: "0.6" }), /* @__PURE__ */ React26.createElement("g", { style: { animation: "si-bball 2.4s ease-in-out 1 both" } }, /* @__PURE__ */ React26.createElement("circle", { cx: "16", cy: "50", r: "7", fill: "var(--accent)", stroke: "var(--ink)", strokeWidth: "1.6" }), /* @__PURE__ */ React26.createElement("path", { d: "M9 50h14M16 43v14", stroke: "var(--ink)", strokeWidth: "1.1", opacity: "0.7" })));
}
function SpikeHero() {
  return /* @__PURE__ */ React26.createElement("svg", { width: "180", height: "82", viewBox: "0 0 180 82", "aria-hidden": "true", style: { display: "block", overflow: "visible" } }, /* @__PURE__ */ React26.createElement("line", { x1: "8", y1: "60", x2: "172", y2: "60", stroke: "var(--sun)", strokeWidth: "3", strokeLinecap: "round" }), /* @__PURE__ */ React26.createElement("ellipse", { cx: "90", cy: "52", rx: "22", ry: "6", fill: "var(--paper2)", stroke: "var(--ink)", strokeWidth: "1.8" }), /* @__PURE__ */ React26.createElement("path", { d: "M74 56l-5 4M106 56l5 4", stroke: "var(--ink)", strokeWidth: "1.8", strokeLinecap: "round" }), /* @__PURE__ */ React26.createElement("g", { style: { animation: "si-spike 2.2s ease-in 1 both" } }, /* @__PURE__ */ React26.createElement("circle", { cx: "14", cy: "8", r: "5.5", fill: "var(--sun)", stroke: "var(--ink0)", strokeWidth: "1.6" })));
}
function PingpongHero() {
  return /* @__PURE__ */ React26.createElement("svg", { width: "180", height: "82", viewBox: "0 0 180 82", "aria-hidden": "true", style: { display: "block", overflow: "visible" } }, /* @__PURE__ */ React26.createElement("line", { x1: "8", y1: "60", x2: "172", y2: "60", stroke: "var(--sun)", strokeWidth: "3", strokeLinecap: "round" }), /* @__PURE__ */ React26.createElement("line", { x1: "90", y1: "60", x2: "90", y2: "46", stroke: "var(--ink)", strokeWidth: "2" }), /* @__PURE__ */ React26.createElement("g", { transform: "rotate(-30 22 48)" }, /* @__PURE__ */ React26.createElement("ellipse", { cx: "22", cy: "44", rx: "8", ry: "10", fill: "var(--accent)", stroke: "var(--ink)", strokeWidth: "1.6" }), /* @__PURE__ */ React26.createElement("rect", { x: "20", y: "54", width: "4", height: "9", rx: "2", fill: "var(--paper)", stroke: "var(--ink)", strokeWidth: "1.2" })), /* @__PURE__ */ React26.createElement("g", { transform: "rotate(30 158 48)" }, /* @__PURE__ */ React26.createElement("ellipse", { cx: "158", cy: "44", rx: "8", ry: "10", fill: "var(--pool)", stroke: "var(--ink)", strokeWidth: "1.6" }), /* @__PURE__ */ React26.createElement("rect", { x: "156", y: "54", width: "4", height: "9", rx: "2", fill: "var(--paper)", stroke: "var(--ink)", strokeWidth: "1.2" })), /* @__PURE__ */ React26.createElement("g", { style: { animation: "si-pingpong 2.4s linear 1 both" } }, /* @__PURE__ */ React26.createElement("circle", { cx: "34", cy: "40", r: "4", fill: "var(--paper)", stroke: "var(--ink)", strokeWidth: "1.4" })));
}
function FoosHero() {
  return /* @__PURE__ */ React26.createElement("svg", { width: "180", height: "82", viewBox: "0 0 180 82", "aria-hidden": "true", style: { display: "block", overflow: "visible" } }, /* @__PURE__ */ React26.createElement("line", { x1: "8", y1: "60", x2: "172", y2: "60", stroke: "var(--sun)", strokeWidth: "3", strokeLinecap: "round" }), /* @__PURE__ */ React26.createElement("path", { d: "M160 38v22M172 38v22M160 38h12", fill: "none", stroke: "var(--ink)", strokeWidth: "2" }), /* @__PURE__ */ React26.createElement("g", { style: { animation: "si-foosman 2.4s ease-in-out 1 both" } }, /* @__PURE__ */ React26.createElement("line", { x1: "96", y1: "10", x2: "96", y2: "50", stroke: "var(--ink)", strokeWidth: "2.4" }), /* @__PURE__ */ React26.createElement("path", { d: "M91 32h10l-1.6 14h-6.8z", fill: "var(--clay)", stroke: "var(--ink)", strokeWidth: "1.4", strokeLinejoin: "round" })), /* @__PURE__ */ React26.createElement("g", { style: { animation: "si-foos 2.4s ease-out 1 both" } }, /* @__PURE__ */ React26.createElement("circle", { cx: "24", cy: "54", r: "5.5", fill: "var(--paper)", stroke: "var(--ink)", strokeWidth: "1.6" })));
}
function VolleyHero() {
  return /* @__PURE__ */ React26.createElement("svg", { width: "180", height: "82", viewBox: "0 0 180 82", "aria-hidden": "true", style: { display: "block", overflow: "visible" } }, /* @__PURE__ */ React26.createElement("line", { x1: "8", y1: "60", x2: "172", y2: "60", stroke: "var(--sun)", strokeWidth: "3", strokeLinecap: "round" }), /* @__PURE__ */ React26.createElement("line", { x1: "90", y1: "60", x2: "90", y2: "18", stroke: "var(--ink)", strokeWidth: "2.2" }), /* @__PURE__ */ React26.createElement("line", { x1: "82", y1: "18", x2: "98", y2: "18", stroke: "var(--ink)", strokeWidth: "2.6", strokeLinecap: "round" }), /* @__PURE__ */ React26.createElement("path", { d: "M84 24h12M84 30h12", stroke: "var(--ink)", strokeWidth: "1.1", opacity: "0.55" }), /* @__PURE__ */ React26.createElement("g", { style: { animation: "si-volley 2.4s ease-in-out 1 both" } }, /* @__PURE__ */ React26.createElement("circle", { cx: "18", cy: "46", r: "6.5", fill: "var(--paper)", stroke: "var(--ink)", strokeWidth: "1.6" }), /* @__PURE__ */ React26.createElement("path", { d: "M11.5 46c4-3.4 9-3.4 13 0M18 39.5v13", stroke: "var(--ink)", strokeWidth: "1.1", opacity: "0.7" })));
}
function PickleHero() {
  return /* @__PURE__ */ React26.createElement("svg", { width: "180", height: "82", viewBox: "0 0 180 82", "aria-hidden": "true", style: { display: "block", overflow: "visible" } }, /* @__PURE__ */ React26.createElement("line", { x1: "8", y1: "60", x2: "172", y2: "60", stroke: "var(--sun)", strokeWidth: "3", strokeLinecap: "round" }), /* @__PURE__ */ React26.createElement("line", { x1: "90", y1: "60", x2: "90", y2: "40", stroke: "var(--ink)", strokeWidth: "2" }), /* @__PURE__ */ React26.createElement("line", { x1: "83", y1: "40", x2: "97", y2: "40", stroke: "var(--ink)", strokeWidth: "2.4", strokeLinecap: "round" }), /* @__PURE__ */ React26.createElement("line", { x1: "64", y1: "60", x2: "64", y2: "56", stroke: "var(--ink)", strokeWidth: "1.6", opacity: "0.6" }), /* @__PURE__ */ React26.createElement("line", { x1: "116", y1: "60", x2: "116", y2: "56", stroke: "var(--ink)", strokeWidth: "1.6", opacity: "0.6" }), /* @__PURE__ */ React26.createElement("g", { style: { animation: "si-pickle 2.4s ease-in-out 1 both" } }, /* @__PURE__ */ React26.createElement("circle", { cx: "18", cy: "50", r: "5", fill: "var(--sun)", stroke: "var(--ink0)", strokeWidth: "1.5" })));
}
function KartHero() {
  return /* @__PURE__ */ React26.createElement("svg", { width: "180", height: "82", viewBox: "0 0 180 82", "aria-hidden": "true", style: { display: "block", overflow: "visible" } }, /* @__PURE__ */ React26.createElement("line", { x1: "8", y1: "60", x2: "172", y2: "60", stroke: "var(--sun)", strokeWidth: "3", strokeLinecap: "round" }), /* @__PURE__ */ React26.createElement("path", { d: "M150 60v-22M150 38h6v4h-6M150 46h6v4h-6", stroke: "var(--ink)", strokeWidth: "1.8", fill: "none" }), /* @__PURE__ */ React26.createElement("g", { style: { animation: "si-kart 2.6s ease-in-out 1 both" } }, /* @__PURE__ */ React26.createElement("path", { d: "M10 46h30l-4 8H16z", fill: "var(--clay)", stroke: "var(--ink)", strokeWidth: "1.6", strokeLinejoin: "round" }), /* @__PURE__ */ React26.createElement("path", { d: "M20 40h12l2 6H18z", fill: "var(--paper)", stroke: "var(--ink)", strokeWidth: "1.4", strokeLinejoin: "round" }), /* @__PURE__ */ React26.createElement("circle", { cx: "17", cy: "56", r: "4.4", fill: "var(--ink0)", stroke: "var(--bone)", strokeWidth: "1.4" }), /* @__PURE__ */ React26.createElement("circle", { cx: "35", cy: "56", r: "4.4", fill: "var(--ink0)", stroke: "var(--bone)", strokeWidth: "1.4" })));
}
function RageHero() {
  return /* @__PURE__ */ React26.createElement("svg", { width: "180", height: "82", viewBox: "0 0 180 82", "aria-hidden": "true", style: { display: "block", overflow: "visible" } }, /* @__PURE__ */ React26.createElement("line", { x1: "8", y1: "60", x2: "172", y2: "60", stroke: "var(--sun)", strokeWidth: "3", strokeLinecap: "round" }), [64, 90, 116].map((x) => /* @__PURE__ */ React26.createElement("g", { key: x }, /* @__PURE__ */ React26.createElement("path", { d: `M${x - 9} 36h18l-2.4 24h-13.2z`, fill: "var(--paper)", stroke: "var(--ink)", strokeWidth: "1.6", strokeLinejoin: "round" }), /* @__PURE__ */ React26.createElement("ellipse", { cx: x, cy: "36", rx: "9", ry: "2.8", fill: "var(--paper2)", stroke: "var(--ink)", strokeWidth: "1.2" }))), /* @__PURE__ */ React26.createElement("g", { style: { animation: "si-rage 2.2s ease-in 1 both" } }, /* @__PURE__ */ React26.createElement("circle", { cx: "16", cy: "10", r: "4.5", fill: "var(--sun)", stroke: "var(--ink0)", strokeWidth: "1.4" })));
}
function GauntletHero() {
  return /* @__PURE__ */ React26.createElement("svg", { width: "180", height: "82", viewBox: "0 0 180 82", "aria-hidden": "true", style: { display: "block", overflow: "visible" } }, /* @__PURE__ */ React26.createElement("line", { x1: "8", y1: "60", x2: "172", y2: "60", stroke: "var(--sun)", strokeWidth: "3", strokeLinecap: "round" }), [36, 68, 100, 132, 164].map((x, i) => /* @__PURE__ */ React26.createElement(
    "rect",
    {
      key: x,
      x: x - 7,
      y: "50",
      width: "14",
      height: "10",
      rx: "2",
      fill: i === 4 ? "var(--accent)" : "var(--paper2)",
      stroke: "var(--ink)",
      strokeWidth: "1.4"
    }
  )), /* @__PURE__ */ React26.createElement("g", { style: { animation: "si-gauntlet 2.8s ease-in-out 1 both" } }, /* @__PURE__ */ React26.createElement("circle", { cx: "12", cy: "44", r: "5.5", fill: "var(--sun)", stroke: "var(--ink0)", strokeWidth: "1.6" })));
}
function PokerHero() {
  return /* @__PURE__ */ React26.createElement("svg", { width: "180", height: "82", viewBox: "0 0 180 82", "aria-hidden": "true", style: { display: "block", overflow: "visible" } }, /* @__PURE__ */ React26.createElement("line", { x1: "8", y1: "60", x2: "172", y2: "60", stroke: "var(--sun)", strokeWidth: "3", strokeLinecap: "round" }), /* @__PURE__ */ React26.createElement("g", { style: { animation: "si-deal1 2.4s ease-out 1 both" } }, /* @__PURE__ */ React26.createElement("rect", { x: "70", y: "26", width: "18", height: "26", rx: "3", fill: "var(--paper)", stroke: "var(--ink)", strokeWidth: "1.6" })), /* @__PURE__ */ React26.createElement("g", { style: { animation: "si-deal2 2.4s ease-out 1 both" } }, /* @__PURE__ */ React26.createElement("rect", { x: "92", y: "26", width: "18", height: "26", rx: "3", fill: "var(--paper)", stroke: "var(--ink)", strokeWidth: "1.6" }), /* @__PURE__ */ React26.createElement("circle", { cx: "101", cy: "39", r: "3.4", fill: "var(--accent)" })), /* @__PURE__ */ React26.createElement("g", { style: { animation: "si-chip-in 2.4s ease-in-out 1 both" } }, /* @__PURE__ */ React26.createElement("circle", { cx: "16", cy: "52", r: "7.5", fill: "var(--sun)", stroke: "var(--ink0)", strokeWidth: "1.6" }), /* @__PURE__ */ React26.createElement("circle", { cx: "16", cy: "52", r: "4.2", fill: "none", stroke: "var(--chip-mark)", strokeWidth: "1.6" })));
}
var GAME_HEROES = {
  die: DieHero,
  pong: PongHero,
  flipcup: FlipHero,
  putting: PuttHero,
  "8ball": EightHero,
  basketball: BballHero,
  spikeball: SpikeHero,
  pingpong: PingpongHero,
  foosball: FoosHero,
  volleyball: VolleyHero,
  pickleball: PickleHero,
  beerio: KartHero,
  ragecage: RageHero,
  gauntlet: GauntletHero,
  poker: PokerHero
};
function Reveal({ state, reveal, big, auto, onClose, onBets, onPlayer }) {
  const teamItems = reveal.versus ? 1 : reveal.groups?.length || 0;
  const crew = reveal.crew || [];
  const items = teamItems + (crew.length ? 1 : 0);
  const reducedMotion = prefersReducedMotion();
  const [shown, setShown] = useState17(() => reducedMotion ? items : 0);
  useEffect9(() => {
    if (shown >= items) return;
    const t = setTimeout(() => setShown((s) => s + 1), shown === 0 ? 900 : 1300);
    return () => clearTimeout(t);
  }, [shown, items]);
  const doneAll = shown >= items;
  const closeRef = useRef12(onClose);
  closeRef.current = onClose;
  useEffect9(() => {
    if (!auto || !doneAll) return;
    const t = setTimeout(() => closeRef.current(), reducedMotion ? 2200 : 6e3);
    return () => clearTimeout(t);
  }, [auto, doneAll, reducedMotion]);
  if (!big) return /* @__PURE__ */ React26.createElement(DrawAnnouncement, { state, reveal, onClose, onBets, onPlayer });
  return /* @__PURE__ */ React26.createElement("div", { className: "fd-night", style: {
    position: "fixed",
    inset: 0,
    zIndex: 300,
    background: "rgba(32,24,17,0.97)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "calc(30px + env(safe-area-inset-top)) 20px calc(30px + env(safe-area-inset-bottom))",
    overflowY: "auto"
  } }, /* @__PURE__ */ React26.createElement("div", { style: { ...label, fontSize: big ? 15 : 11, color: "var(--sun)", animation: "si-in .4s both" } }, reveal.title), /* @__PURE__ */ React26.createElement("div", { style: {
    fontFamily: DISPLAY,
    fontWeight: 700,
    fontSize: big ? 64 : 36,
    color: BONE,
    textTransform: "uppercase",
    lineHeight: 0.95,
    marginBottom: big ? 28 : 20,
    animation: "si-in .4s .1s both",
    textAlign: "center"
  } }, reveal.subtitle), reveal.versus ? /* @__PURE__ */ React26.createElement("div", { style: {
    width: "100%",
    maxWidth: big ? 900 : 470,
    visibility: shown > 0 ? "visible" : "hidden",
    animation: shown > 0 ? "si-flag .55s both" : "none"
  } }, /* @__PURE__ */ React26.createElement(VersusDraw, { state, teams: reveal.versus, size: big ? "lg" : "md" })) : /* @__PURE__ */ React26.createElement("div", { style: {
    display: "grid",
    gap: big ? 16 : 10,
    width: "100%",
    maxWidth: big ? 1100 : 460,
    gridTemplateColumns: big ? `repeat(${teamItems === 4 ? 2 : Math.min(teamItems, 3)}, 1fr)` : teamItems > 3 ? "1fr 1fr" : "1fr"
  } }, reveal.groups.map((g, i) => /* @__PURE__ */ React26.createElement("div", { key: i, style: {
    visibility: i < shown ? "visible" : "hidden",
    animation: i < shown ? "si-flag .55s both" : "none",
    background: CARD_BG,
    border: "1px solid rgba(156,69,38,0.45)",
    borderRadius: 14,
    padding: big ? "18px 20px" : "14px 15px",
    boxShadow: "var(--shadow-2)"
  } }, /* @__PURE__ */ React26.createElement("div", { style: {
    fontFamily: DISPLAY,
    fontWeight: 700,
    fontSize: big ? 26 : 16,
    color: "var(--accent2)",
    marginBottom: 8
  } }, g.title), g.lines.map((ln, j) => /* @__PURE__ */ React26.createElement(React26.Fragment, { key: j }, g.vs && j > 0 && /* @__PURE__ */ React26.createElement("div", { style: {
    fontFamily: SANS,
    fontWeight: 700,
    fontSize: big ? 14 : 11,
    letterSpacing: "0.18em",
    color: "var(--muted)",
    textTransform: "uppercase",
    padding: "1px 0 1px 4px",
    animation: i < shown ? "si-in .3s .3s both" : "none"
  } }, "vs"), /* @__PURE__ */ React26.createElement("div", { style: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    padding: "3px 0",
    animation: i < shown ? `si-in .3s ${0.25 + j * 0.15}s both` : "none"
  } }, /* @__PURE__ */ React26.createElement(AvatarStack, { state, players: ln.avatars, size: big ? 34 : 26, max: 3 }), /* @__PURE__ */ React26.createElement("span", { style: { fontFamily: SANS, fontWeight: 600, fontSize: big ? 20 : 14.5, color: "var(--ink)" } }, ln.text))))))), crew.length > 0 && /* @__PURE__ */ React26.createElement("div", { style: {
    width: "100%",
    maxWidth: big ? 760 : 470,
    visibility: shown > teamItems ? "visible" : "hidden",
    animation: shown > teamItems ? "si-flag .55s both" : "none"
  } }, /* @__PURE__ */ React26.createElement(EventCrewCard, { state, roles: crew })), doneAll && !auto && /* @__PURE__ */ React26.createElement("div", { style: { display: "flex", gap: 10, marginTop: big ? 30 : 22, animation: "si-in .3s both" } }, onBets && /* @__PURE__ */ React26.createElement(Btn, { onClick: onBets, style: { fontSize: 16, padding: "13px 28px" } }, "To the bets"), /* @__PURE__ */ React26.createElement(Btn, { kind: onBets ? "ghost" : "primary", onClick: onClose, style: { fontSize: 16, padding: "13px 28px" } }, "Close")), !doneAll && !auto && /* @__PURE__ */ React26.createElement("button", { onClick: () => setShown(items), style: {
    marginTop: 20,
    background: "none",
    border: "none",
    color: "var(--night-text)",
    fontFamily: SANS,
    fontSize: 12.5,
    cursor: "pointer"
  } }, "skip"));
}

// <stdin>
init_PlayerIdentityContext();
init_controls();
export {
  ActionButton,
  BracketSheet,
  ChipCounter,
  DraftEntry,
  DraftSheet,
  EventIntro,
  EventSheet,
  GameMark,
  PlayerIdentityProvider,
  PlayerSheet,
  PokerResultSheet,
  ResultSheet,
  Reveal,
  Sheet,
  Shell,
  Wagers
};
