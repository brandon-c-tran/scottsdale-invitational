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
function teamFit(ev, count = ROSTER.length) {
  const cfg = ev?.teamCfg;
  if (!cfg || !Number.isInteger(cfg.teams) || !Number.isInteger(cfg.size) || cfg.teams < 2 || cfg.size < 1) return null;
  if (participationForEvent(ev).type === "all") {
    if (count < cfg.teams) return null;
    const split = Array.from({ length: cfg.teams }, (_, i) => Math.floor(count / cfg.teams) + (i < count % cfg.teams ? 1 : 0));
    return { teams: cfg.teams, size: split[0], bracket: null, reduced: count < cfg.teams * cfg.size, split };
  }
  if (count >= cfg.teams * cfg.size)
    return { teams: cfg.teams, size: cfg.size, bracket: cfg.bracket || null, reduced: false };
  if (cfg.bracket || ev.kind === "pairs" || ev.stageCfg) {
    const teams = Math.floor(count / cfg.size);
    return teams >= 2 ? { teams, size: cfg.size, bracket: cfg.bracket ? teams : null, reduced: true } : null;
  }
  const size = Math.floor(count / cfg.teams);
  return size >= 1 ? { teams: cfg.teams, size, bracket: null, reduced: true } : null;
}
function eventCapacity(ev, count) {
  const policy = participationForEvent(ev);
  if (policy.type === "strict-teams") {
    if (count !== void 0 && ev?.teamCfg) {
      const fit2 = teamFit(ev, count);
      return fit2 ? fit2.teams * fit2.size : null;
    }
    return Number.isInteger(policy.teams) && Number.isInteger(policy.size) ? policy.teams * policy.size : null;
  }
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
  const fit2 = policy.type === "strict-teams" && ev?.teamCfg ? teamFit(ev, activeUnique.length) : null;
  const capacity = policy.type === "strict-teams" && ev?.teamCfg ? fit2 ? fit2.teams * fit2.size : ev.teamCfg.teams * ev.teamCfg.size : eventCapacity(ev);
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
    if (ev?.teamCfg && !fit2)
      return {
        ok: false,
        code: "roster-short",
        error: `This event needs ${2 * ev.teamCfg.size} players; ${activeUnique.length} present`,
        selectedCount: players.length,
        activeCount: activeUnique.length,
        required: 2 * ev.teamCfg.size
      };
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
    fit: fit2,
    selectedCount: players.length,
    activeCount: activeUnique.length,
    policy
  };
}
function suggestParticipants(state, ev) {
  if (!ev) return null;
  const present = presentPlayers(state);
  if (!ev.teamCfg) return ev.stageCfg?.kind === "heats" ? { players: present, roles: [], fit: null } : null;
  const fit2 = teamFit(ev, present.length);
  if (!fit2) return null;
  if (participationForEvent(ev).type === "all") return { players: present, roles: [], fit: fit2 };
  const counts = {}, last = {};
  const tally = (roles, at) => (Array.isArray(roles) ? roles : []).forEach((item) => {
    if (!item?.player) return;
    counts[item.player] = (counts[item.player] || 0) + 1;
    last[item.player] = Math.max(last[item.player] || 0, Number(at) || 0);
  });
  Object.entries(state.draws || {}).forEach(([id, draw]) => {
    if (id !== ev.id) tally(draw?.roles, draw?.ts);
  });
  Object.entries(state.stages || {}).forEach(([id, stage]) => {
    if (id !== ev.id) tally(stage?.roles, stage?.ts);
  });
  const order = [...present].sort((a, b) => (counts[a] || 0) - (counts[b] || 0) || (last[a] || 0) - (last[b] || 0) || ROSTER.indexOf(b) - ROSTER.indexOf(a));
  const crew = order.slice(0, present.length - fit2.teams * fit2.size);
  return {
    players: present.filter((player) => !crew.includes(player)),
    roles: crew.map((player, index) => ({ player, role: OVERFLOW_ROLES[index % OVERFLOW_ROLES.length] })),
    fit: fit2
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
  if (state.shelved?.[w.eventId]) return { status: "void", delta: 0 };
  if (w.kind === "outright") {
    if (w.pickTeam) {
      const draw = state.draws[w.eventId];
      if (!draw || draw.id !== w.drawId) return { status: "void", delta: 0 };
    }
    const res = state.results[w.eventId];
    if (!res || !res.slots?.[0]) return { status: "pending", delta: 0 };
    const winners = res.slots[0];
    const won = w.pickTeam ? w.pickPlayers.every((p) => winners.includes(p)) : winners.includes(w.pick);
    return { status: won ? "won" : "lost", delta: won ? wagerMult(w) * w.stake : -w.stake };
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
  if (!duelAccepted(duel)) return { settled: false, status: "open" };
  const a = duel.runs?.[duel.from], b = duel.runs?.[duel.to];
  if (!a || !b) return { settled: false, status: "open" };
  const score = (r) => r.foul ? Infinity : r.ms;
  if (score(a) === score(b)) return { settled: true, push: true };
  const winner = score(a) < score(b) ? duel.from : duel.to;
  return { settled: true, push: false, winner, loser: winner === duel.from ? duel.to : duel.from };
}
function duelPhase(duel, now = Date.now()) {
  if (!duel) return null;
  if (duel.status !== "open")
    return duel.status === "declined" || duel.status === "withdrawn" ? duel.status : "void";
  if (resolveDuel(duel).settled) return "settled";
  if (!duelAccepted(duel)) return duelLapsed(duel, now) ? "lapsed" : "offered";
  return "live";
}
function duelReserve(state, player, now = Date.now()) {
  if (!player) return 0;
  return (state?.duels || []).reduce((sum, duel) => {
    const phase = duelPhase(duel, now);
    const stake = Number(duel.stake) || 0;
    if (phase === "live" && (duel.from === player || duel.to === player)) return sum + stake;
    if (phase === "offered" && duel.from === player) return sum + stake;
    return sum;
  }, 0);
}
function duelRoom(state, player, { events, rows, now = Date.now() } = {}) {
  const standings = rows || computeStandings(state);
  const pts = standings.find((row) => row.player === player)?.pts ?? 0;
  const exposure = atRisk(state, player, events || allEventsOf(state)) + duelReserve(state, player, now);
  const cap = maxRisk(pts);
  return {
    pts,
    cap,
    exposure,
    capRoom: cap - exposure,
    balanceRoom: pts - exposure,
    room: Math.min(cap - exposure, pts - exposure)
  };
}
function resultAwards(state, ev, res) {
  const table = awardTable(ev);
  const draw = state.draws?.[ev?.id];
  const out = [];
  const thirdEach = table[2] || 0;
  (res?.slots || []).forEach((players, place) => {
    const each = table[place] || 0;
    (players || []).forEach((player) => out.push({ player, place, pts: each }));
  });
  if (!res?.stacks && thirdEach > 0) {
    const placed = new Set(out.map((award) => award.player));
    (draw?.roles || []).forEach(({ player }) => {
      if (player && !placed.has(player)) out.push({ player, place: "crew", pts: thirdEach });
    });
  }
  return out;
}
function awardPlan(ev, draw = null) {
  const table = awardTable(ev);
  const crew = draw ? (draw.roles || []).length > 0 : Number.isInteger(eventCapacity(ev)) && eventCapacity(ev) < ROSTER.length;
  const rows = table.map((pts, place) => ({ place, pts }));
  return [
    ...rows,
    ...crew ? [{ place: "crew", pts: rows[2].pts }] : []
  ].filter((row) => row.pts > 0);
}
function mvpStands(state, evId) {
  const record = state?.mvp?.[evId], result = state?.results?.[evId];
  return !!record && !!result && !result.stacks && sameSet(result.slots?.[0] || [], record.team || []);
}
function mvpAwards(state) {
  return Object.entries(state?.mvp || {}).filter(([evId, record]) => record?.closedAt && record.winner && mvpStands(state, evId)).map(([eventId, record]) => ({ eventId, player: record.winner, pts: MVP_PTS, at: Number(record.closedAt) }));
}
function computeStandings(state) {
  const pts = {}, wins = {}, betNet = {}, duelNet = {}, awardPts = {}, mvpPts = {};
  ROSTER.forEach((p) => {
    pts[p] = START;
    wins[p] = 0;
    betNet[p] = 0;
    duelNet[p] = 0;
    awardPts[p] = 0;
    mvpPts[p] = 0;
  });
  const evs = allEventsOf(state);
  Object.entries(state.results || {}).forEach(([eid, res]) => {
    const ev = evs.find((e) => e.id === eid);
    if (!ev || !res) return;
    resultAwards(state, ev, res).forEach(({ player, place, pts: award }) => {
      if (pts[player] === void 0) return;
      pts[player] += award;
      awardPts[player] += award;
      if (place === 0) wins[player] += 1;
    });
  });
  mvpAwards(state).forEach(({ player, pts: award }) => {
    if (pts[player] === void 0) return;
    pts[player] += award;
    mvpPts[player] += award;
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
  const rulings = (state.adjustments || []).filter((a) => !a.removedAt);
  rulings.forEach((a) => {
    if (pts[a.player] !== void 0 && !postCountRuling(a)) pts[a.player] += a.delta;
  });
  let stacksRes = null;
  Object.values(state.results || {}).forEach((res) => {
    if (res?.stacks) stacksRes = res;
  });
  let leaders = null;
  if (stacksRes) {
    ROSTER.forEach((p) => {
      pts[p] = stacksRes.stacks[p] ?? 0;
    });
    rulings.forEach((a) => {
      if (postCountRulingApplies(a, stacksRes) && pts[a.player] !== void 0) pts[a.player] += a.delta;
    });
    const seats = (Array.isArray(stacksRes.seats) ? stacksRes.seats : Array.isArray(state.poker?.seats) ? state.poker.seats : ROSTER).filter((p) => pts[p] !== void 0);
    const top = seats.length ? Math.max(...seats.map((p) => pts[p])) : 0;
    leaders = new Set(top > 0 ? seats.filter((p) => pts[p] === top) : []);
  }
  const lead = (p) => leaders?.has(p) ? 1 : 0;
  const outRank = (p) => {
    const i = (stacksRes?.outs || []).indexOf(p);
    return i >= 0 ? i : stacksRes?.stacks?.[p] === 0 ? -1 : Infinity;
  };
  const rows = ROSTER.map((p) => ({
    player: p,
    pts: pts[p],
    wins: wins[p],
    betNet: betNet[p],
    duelNet: duelNet[p],
    awardPts: awardPts[p],
    mvpPts: mvpPts[p]
  })).sort((x, y) => lead(y.player) - lead(x.player) || y.pts - x.pts || (stacksRes ? outRank(y.player) - outRank(x.player) : 0) || y.wins - x.wins || x.player.localeCompare(y.player));
  let rank = 0, prev = null;
  rows.forEach((r, i) => {
    const key = `${lead(r.player)}:${r.pts}`;
    if (key !== prev || stacksRes && r.pts === 0) {
      rank = i + 1;
      prev = key;
    }
    r.rank = rank;
  });
  return rows;
}
function atRisk(state, p, events) {
  return (state.wagers || []).filter((w) => w.player === p && resolveWager(state, w, events).status === "pending").reduce((s, w) => s + w.stake, 0);
}
function playerStrength(state, p, sport, rows) {
  rows = rows || computeStandings(state);
  const norm = (x, lo, hi) => hi > lo ? (x - lo) / (hi - lo) : 0.5;
  const sv = state.seeds?.[p] || {};
  const vals = Object.values(sv);
  const overall = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 2;
  const r = rows.find((x) => x.player === p);
  const aps = rows.map((x) => x.awardPts), ws = rows.map((x) => x.wins);
  return 0.35 * norm(sv[sport] ?? 2, 1, 4) + 0.15 * norm(overall, 1, 4) + 0.35 * norm(r?.awardPts ?? 0, Math.min(...aps), Math.max(...aps)) + 0.15 * norm(r?.wins ?? 0, Math.min(...ws), Math.max(...ws));
}
function bracketMatchName(bracket, r, m) {
  const name = bracketRoundName(bracket?.size, r);
  if ((bracket?.rounds?.[r]?.length || 1) <= 1) return name;
  return /\d$/.test(name) ? `${name} Match ${m + 1}` : `${name.replace(/s$/, "")} ${m + 1}`;
}
function resolveSlot(br, slot) {
  if (!slot) return null;
  if (slot.t !== void 0) return slot.t;
  const src = br.rounds[slot.w[0]]?.[slot.w[1]];
  return src && src.winner !== null && src.winner !== void 0 ? src.winner : null;
}
function bracketMatchOpen(br, r, m) {
  const match = br?.rounds?.[r]?.[m];
  if (!match || match.winner !== null && match.winner !== void 0) return false;
  return resolveSlot(br, match.a) !== null && resolveSlot(br, match.b) !== null;
}
function bracketOrder(br) {
  const order = [];
  (br?.rounds || []).forEach((round, r) => round.forEach((_, m) => order.push([r, m])));
  const next = Array.isArray(br?.next) ? br.next : null;
  if (next && bracketMatchOpen(br, next[0], next[1]))
    return [[next[0], next[1]], ...order.filter(([r, m]) => r !== next[0] || m !== next[1])];
  return order;
}
function contestTarget(state, ev) {
  if (!ev || state.results?.[ev.id] || state.shelved?.[ev.id] || ev.finale || state.drafts?.[ev.id] && !state.draws?.[ev.id]) return null;
  const draw = state.draws?.[ev.id];
  if (ev.teamCfg && !draw) return null;
  const br = state.brackets?.[ev.id];
  if (ev.teamCfg?.bracket && !br) return null;
  if (br) {
    for (const [r, m] of bracketOrder(br)) {
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
    sides: draw ? draw.teams.map((team, key) => ({ key, players: [...team.players] })) : presentPlayers(state).map((key) => ({ key, players: [key] }))
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
  const nextAction = phase === "betting-open" ? lifecycleAction("lock-betting", "Lock bets and start") : phase === "betting-locked" ? lifecycleAction("start-event", "Start") : phase === "awaiting-result" ? lifecycleAction("post-result", "Post result") : phase === "scheduled" ? lifecycleAction("open-betting", "Open betting") : target.kind === "ffa" ? lifecycleAction("enter-result", "Enter result") : lifecycleAction("record-contest-winner", "Record winner");
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
  if (wideField(contest)) return true;
  return !contest.players.includes(player) || side.players.includes(player);
}
function wagerSide(state, w) {
  if (w.kind === "match") return w.teamIdx;
  if (w.kind !== "outright") return w.pickKey;
  if (!w.pickTeam) return w.pick;
  if (Number.isInteger(w.teamIdx)) return w.teamIdx;
  const teams = state.draws?.[w.eventId]?.teams || [];
  const want = [...w.pickPlayers || []].sort().join("|");
  const index = teams.findIndex((team) => [...team.players].sort().join("|") === want);
  return index < 0 ? null : index;
}
function contestSideOf(state, contest, player, events = allEventsOf(state)) {
  if (!contest || wideField(contest)) return null;
  const held = (state.wagers || []).find((w) => w.player === player && wagerMatchesContest(w, contest) && resolveWager(state, w, events).status === "pending");
  return held ? wagerSide(state, held) : null;
}
function wagerMatchesContest(wager, contest) {
  if (!contest || wager.eventId !== contest.eventId) return false;
  if (wager.contestId && wager.contestId !== contest.id) return false;
  if (contest.kind === "ffa") return wager.kind === "outright" && (!contest.drawId || wager.pickTeam && wager.drawId === contest.drawId);
  if (contest.kind === "match") return wager.kind === "match" && wager.drawId === contest.drawId && wager.match?.[0] === contest.match[0] && wager.match?.[1] === contest.match[1];
  return wager.stagesId === contest.stagesId && (contest.kind === "heat" ? wager.kind === "heat" && !wager.final && wager.group === contest.group : wager.kind === "stage" && wager.final === true);
}
function enforceExposure(state, now = Date.now()) {
  if (pokerLive(state) || stacksPosted(state)) return [];
  const events = allEventsOf(state);
  const rows = computeStandings(state);
  const voided = [];
  for (const { player, pts } of rows) {
    const limit = Math.max(0, Math.min(maxRisk(pts), pts));
    const items = [];
    for (const w of (state.wagers || []).filter((w2) => w2.player === player && resolveWager(state, w2, events).status === "pending")) {
      const chips = Array.isArray(w.chips) && w.chips.length ? w.chips : null;
      if (!chips) items.push({ w, stake: w.stake, ts: w.updatedAt || w.ts || 0, order: 0 });
      else chips.forEach((chip, index) => items.push({
        w,
        chip,
        stake: Number(chip.stake) || 0,
        ts: chip.ts || w.ts || 0,
        order: index
      }));
    }
    for (const d of state.duels || []) {
      const phase = duelPhase(d, now);
      if (phase === "live" && (d.from === player || d.to === player) || phase === "offered" && d.from === player)
        items.push({ d, stake: d.stake, ts: d.acceptedAt || d.ts || 0, order: 0 });
    }
    let exposure = items.reduce((sum, item) => sum + item.stake, 0);
    items.sort((a, b) => b.ts - a.ts || b.order - a.order);
    for (const item of items) {
      if (exposure <= limit) break;
      if (item.d) {
        if (!(item.d.status === "open" && !resolveDuel(item.d).settled)) continue;
        item.d.status = "void";
        Object.assign(item.d, { voidedAt: now, voidedBy: "exposure" });
        voided.push({ type: "duel", id: item.d.id, players: [item.d.from, item.d.to], stake: item.d.stake });
      } else if (item.chip && item.w.chips.length > 1 && item.w.chips.at(-1) === item.chip) {
        item.w.chips.pop();
        item.w.stake = Math.max(0, item.w.stake - item.stake);
        item.w.updatedAt = now;
        item.w.voidedChips = [...item.w.voidedChips || [], { ...item.chip, voidedAt: now }];
        voided.push({ type: "chip", id: item.w.id, player, eventId: item.w.eventId, stake: item.stake });
      } else {
        if (item.w.status === "void") continue;
        item.w.status = "void";
        Object.assign(item.w, { voidedAt: now, voidedBy: "exposure" });
        voided.push({ type: "wager", id: item.w.id, player, eventId: item.w.eventId, stake: item.w.stake });
        exposure -= item.w.stake - item.stake;
      }
      exposure -= item.stake;
    }
  }
  return voided;
}
function refundTotals(items = []) {
  const totals = /* @__PURE__ */ new Map();
  items.forEach((item) => {
    if (item?.player) totals.set(item.player, (totals.get(item.player) || 0) + Number(item.stake || 0));
  });
  return [...totals].map(([player, stake]) => ({ player, stake }));
}
function voidWagerRecords(state, ids, reason, now = Date.now()) {
  const wanted = new Set(ids);
  const events = allEventsOf(state);
  const voided = [];
  (state.wagers || []).forEach((wager) => {
    if (!wanted.has(wager.id) || wager.status === "void") return;
    const was = resolveWager(state, wager, events).status;
    wager.status = "void";
    wager.voidReason = reason;
    wager.voidedAt = now;
    if (was === "won" || was === "lost") wager.voidedFrom = was;
    voided.push({ id: wager.id, player: wager.player, stake: Number(wager.stake || 0) });
  });
  return voided;
}
function contestStackOf(state, evId) {
  const op = eventOpOf(state, evId);
  if (Array.isArray(op.contestStack)) return op.contestStack;
  return op.lastContest ? [op.lastContest] : [];
}
function contestEntryLabel(state, ev, entry) {
  if (!entry) return "";
  if (typeof entry.short === "string" && entry.short) return entry.short;
  if (entry.kind === "match" && Array.isArray(entry.match)) {
    const [r, m] = entry.match;
    const br = state.brackets?.[ev?.id];
    const size = state.draws?.[ev?.id]?.teams?.length || br?.size;
    return bracketMatchName({ size, rounds: br?.rounds }, r, m);
  }
  if (entry.kind === "heat") return state.stages?.[ev?.id]?.groups?.[entry.group]?.name || `Heat ${Number(entry.group) + 1}`;
  return "Final";
}
function restoreContestEntry(state, evId, entry) {
  if (entry.kind === "match") {
    const match = state.brackets?.[evId]?.rounds?.[entry.match[0]]?.[entry.match[1]];
    if (match) match.winner = entry.previousWinner ?? null;
  } else if (entry.kind === "heat") {
    const group = state.stages?.[evId]?.groups?.[entry.group];
    if (group) {
      group.winner = entry.previousWinner ?? null;
      group.through = [...entry.previousThrough || []];
    }
  } else if (state.stages?.[evId]) state.stages[evId].finalWinner = entry.previousWinner ?? null;
}
function applyContestCorrection(state, ev, contestId, now = Date.now()) {
  const stack = [...contestStackOf(state, ev.id)];
  const index = stack.findIndex((entry) => entry.id === contestId);
  if (index < 0) return null;
  const target = stack[index], later = stack.slice(index + 1);
  const events = allEventsOf(state);
  const ids = /* @__PURE__ */ new Set();
  const current = resolveCurrentContest(state, ev);
  if (current) (state.wagers || []).forEach((wager) => {
    if (wagerMatchesContest(wager, current) && resolveWager(state, wager, events).status === "pending") ids.add(wager.id);
  });
  later.forEach((entry) => {
    const contest = contestOfEntry(ev.id, entry);
    (state.wagers || []).forEach((wager) => {
      if (wager.status !== "void" && wagerMatchesContest(wager, contest)) ids.add(wager.id);
    });
  });
  [...stack.slice(index)].reverse().forEach((entry) => restoreContestEntry(state, ev.id, entry));
  const returned = voidWagerRecords(state, [...ids], "Previous result corrected", now);
  const op = state.eventOps[ev.id];
  if (target.kind === "match" && state.brackets?.[ev.id])
    state.brackets[ev.id].next = [target.match[0], target.match[1]];
  op.contestRevision = Number(op.contestRevision || 0) + 1;
  op.contest = { id: target.id, revision: op.contestRevision, phase: "in-progress" };
  op.bettingLockedAt = now;
  delete op.resultEntryAt;
  op.contestStack = stack.slice(0, index);
  if (op.contestStack.length) op.lastContest = op.contestStack.at(-1);
  else delete op.lastContest;
  if (state.onDeck === ev.id) state.onDeck = null;
  const exposure = enforceExposure(state, now);
  return {
    contestId: target.id,
    contestRevision: op.contestRevision,
    label: contestEntryLabel(state, ev, target),
    rewinds: later.map((entry) => contestEntryLabel(state, ev, entry)),
    voidIds: returned.map((item) => item.id),
    refunds: refundTotals([...returned, ...exposure.filter((item) => item.type !== "duel")]),
    voidDuels: exposure.filter((item) => item.type === "duel").map((item) => ({ id: item.id, players: item.players, stake: item.stake })),
    voided: exposure
  };
}
function contestCorrectionAvailability(state, ev, contestId = null, now = Date.now()) {
  const op = eventOpOf(state, ev?.id);
  const stack = ev ? contestStackOf(state, ev.id) : [];
  const entry = contestId ? stack.find((item) => item.id === contestId) : stack.at(-1);
  const short = entry ? contestEntryLabel(state, ev, entry) : "";
  const response = (blocker, preview2 = {}) => ({
    enabled: !blocker,
    blocker: blocker || null,
    contestId: entry?.id || null,
    contestRevision: Number(op.contestRevision || 0),
    label: entry ? `Correct ${short}` : null,
    contest: short || null,
    rewinds: [],
    voidIds: [],
    refunds: [],
    voidDuels: [],
    voided: [],
    ...preview2
  });
  if (!ev || !entry) return response("No previous contest to correct");
  if (state.frozen) return response("The board is frozen");
  if (state.results?.[ev.id]) return response("The event result is already posted");
  if (state.poker || stacksPosted(state)) return response("The finale is underway");
  if (state.onDeck && state.onDeck !== ev.id) return response("Close the current betting market first");
  const rewound = stack.slice(stack.indexOf(entry));
  if (rewound.some((item) => item.drawId && state.draws?.[ev.id]?.id !== item.drawId || item.stagesId && state.stages?.[ev.id]?.id !== item.stagesId))
    return response("Draw changed, refresh and try again");
  const preview = structuredClone(state);
  const moved = applyContestCorrection(preview, allEventsOf(preview).find((item) => item.id === ev.id), entry.id, now);
  if (!moved) return response("No previous contest to correct");
  const { contestId: _id, contestRevision: _revision, label: _label, ...rest } = moved;
  return response(null, rest);
}
function correctionText(state, moved = {}) {
  const duels = (moved.voidDuels || []).map((duel) => duelPairText(state, duel.players));
  return [
    moved.rewinds?.length ? `Rewinds ${moved.rewinds.join(", ")}` : "",
    refundText(state, moved.refunds || []),
    duels.length ? `Voids ${duels.join(", ")} duel${duels.length === 1 ? "" : "s"}` : ""
  ].filter(Boolean).map((line) => `${line}.`).join(" ");
}
function announcementTakeBack(state, ev) {
  const op = eventOpOf(state, ev?.id);
  const response = (blocker, extra = {}) => ({
    enabled: !blocker,
    blocker: blocker || null,
    eventId: ev?.id || null,
    refunds: [],
    voidIds: [],
    ...extra
  });
  if (!ev) return response("No such event");
  const announced = state.onDeck === ev.id || !!op.contest || !!op.bettingOpenedAt || !!op.bettingLockedAt;
  if (!announced) return response("Not announced");
  if (state.frozen) return response("The board is frozen");
  if (state.results?.[ev.id]) return response("Result already posted");
  if (op.startedAt || op.resultEntryAt || contestStackOf(state, ev.id).length || bracketStarted(state.brackets?.[ev.id]) || stagesStarted(state.stages?.[ev.id]))
    return response("The event has already started");
  const events = allEventsOf(state);
  const pending = (state.wagers || []).filter((wager) => wager.eventId === ev.id && resolveWager(state, wager, events).status === "pending");
  return response(null, { voidIds: pending.map((wager) => wager.id), refunds: refundTotals(pending) });
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
  if (ev.finale) {
    if (!state.poker) {
      const blockers = [];
      const events = allEventsOf(state);
      const pendingWagers = (state.wagers || []).filter((w) => resolveWager(state, w, events).status === "pending").length;
      if (pendingWagers)
        blockers.push(`Settle ${pendingWagers} open bet${pendingWagers === 1 ? "" : "s"} first`);
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
function eventInPlay(state, ev) {
  if (!ev || state.results?.[ev.id] || state.shelved?.[ev.id]) return false;
  if (ev.finale) return state.poker?.id === ev.id && !!state.poker.startedAt;
  const phase = resolveEventLifecycle(state, ev).phase;
  if (phase === "in-progress" || phase === "result-entry") return true;
  return phase === "betting-locked" && !!state.eventOps?.[ev.id]?.bettingLockedAt;
}
var ROSTER_CONFIG, ROSTER_STATUSES, rosterPlayers, ALL_PLAYERS, ROSTER, isActivePlayer, isAway, presentPlayers, PT, START, MAX_RISK, BUYIN_FLOOR, maxRisk, AWARDS, awardTable, SPORTS, RATINGS, SESSIONS, RAW_BUILTIN_EVENTS, OVERFLOW_ROLES, OVERFLOW_ROLE_META, overflowRoleMeta, participationForEvent, BUILTIN_EVENTS, GAMES, SLOT_META, OUTRIGHT_MULT, wagerMult, SIZES, AIRLINES, CHIP_GRAY, CHIP_COLORS, CHIP_SKINS, EDITION, LOGISTICS, EMPTY_STATE, RESET_PROGRESS_PRESERVED_KEYS, shapeLabel, disp, shuffle, snakeTeam, pokerLive, stacksPosted, CHIP_MIN, POKER_CONFIG, DUEL_LAPSE_MS, duelAccepted, duelLapsed, duelLapsesAt, duelOpen, duelBetween, DUEL_DAILY_LIMIT, duelsSentToday, postCountRuling, postCountRulingApplies, MVP_PTS, MVP_WINDOW_MS, sameSet, MAX_BRACKET, ROUND_NAMES, bracketRoundName, bracketChampion, EVENT_PHASE_LABELS, eventOpOf, bracketStarted, stagesStarted, needsStageSetup, wideField, contestMult, contestOfEntry, contestUndoAvailability, contestCorrections, refundText, duelPairText, lifecycleAction;
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
    isAway = (state, id) => !!state?.away?.[id];
    presentPlayers = (state) => ROSTER.filter((player) => !isAway(state, player));
    PT = 100;
    START = 10 * PT;
    MAX_RISK = 5 * PT;
    BUYIN_FLOOR = 6 * PT;
    maxRisk = (pts) => Math.max(MAX_RISK, Math.floor(pts / 2 / PT) * PT);
    AWARDS = { 400: [400, 200, 100], 800: [800, 400, 200], 1200: [1200, 600, 300], 1600: [1600, 800, 400] };
    awardTable = (ev) => Array.isArray(ev?.pays) && ev.pays.length === 3 ? ev.pays : AWARDS[ev?.value] || [0, 0, 0];
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
      { id: "fri", label: "Friday Night", tag: "400 CHIPS" },
      { id: "sam", label: "Saturday Morning", tag: "800 CHIPS" },
      { id: "sap", label: "Saturday Afternoon", tag: "1200 CHIPS" },
      { id: "san", label: "Saturday Night", tag: "1600 CHIPS" },
      { id: "fin", label: "The Finale", tag: "POKER" }
    ];
    RAW_BUILTIN_EVENTS = [
      /* ── Friday night · 400 ── */
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
        id: "die",
        n: 2,
        session: "fri",
        value: 400,
        name: "Beer Die Doubles",
        kind: "pairs",
        sport: "die",
        game: "die",
        teamCfg: { teams: 6, size: 2, bracket: 6 },
        desc: "Single elimination doubles. Toss the die over the line, they catch off the bounce. Sinking it in a cup wins the game."
      },
      {
        id: "where",
        n: 3,
        session: "fri",
        value: 400,
        name: "Where and When",
        kind: "solo",
        game: "where",
        desc: "Ten rounds from the group's past: five places and five photos. Guess where it is, or the month and year it was taken. Highest total wins."
      },
      /* ── Saturday morning · 800 ── */
      /* everyone plays: captains draft two sides of seven and six. Winners only. */
      {
        id: "bball5",
        n: 4,
        session: "sam",
        value: 800,
        name: "5v5 Full Court",
        kind: "team",
        sport: "bball",
        game: "basketball",
        variant: "5v5",
        teamCfg: { teams: 2, size: 6 },
        pays: [800, 0, 0],
        participation: { type: "all", allowSitOut: true, overflowRoles: [] },
        desc: "Captains draft two sides, seven and six. Full court, twos and threes on the clock. Ahead at the horn wins."
      },
      {
        id: "pickleball",
        n: 5,
        session: "sam",
        value: 800,
        name: "Pickleball Doubles",
        kind: "pairs",
        sport: "pickleball",
        game: "pickleball",
        teamCfg: { teams: 6, size: 2, bracket: 6 },
        desc: "Single elimination doubles. No volleys in the kitchen. Games to 11, win by 2."
      },
      /* a bracket of everyone present: entrants are teams of one, seeded by the
         draw, and the top seeds take the byes */
      {
        id: "bball1",
        n: 6,
        session: "sam",
        value: 800,
        name: "1v1 Basketball",
        kind: "solo",
        sport: "bball",
        game: "basketball",
        variant: "1v1",
        teamCfg: { teams: 13, size: 1, bracket: 13 },
        desc: "Single elimination, everyone in. Ones to 5, make it take it, win by 1."
      },
      /* ── Saturday afternoon · 1200 ── */
      {
        id: "volley",
        n: 7,
        session: "sap",
        value: 1200,
        name: "Sand Volleyball",
        kind: "team",
        sport: "volley",
        game: "volleyball",
        teamCfg: { teams: 4, size: 3, bracket: 4 },
        desc: "Four teams of three, single elimination. Games to 15, win by 2. Rotate servers."
      },
      {
        id: "8ball",
        n: 8,
        session: "sap",
        value: 1200,
        name: "8-Ball Doubles",
        kind: "pairs",
        sport: "pool",
        game: "8ball",
        teamCfg: { teams: 6, size: 2, bracket: 6 },
        desc: "Single elimination. One rack per matchup, alternating shots. Ball-in-hand on scratches."
      },
      {
        id: "pong",
        n: 9,
        session: "sap",
        value: 1200,
        name: "Beer Pong Doubles",
        kind: "pairs",
        sport: "pong",
        game: "pong",
        teamCfg: { teams: 6, size: 2, bracket: 6 },
        desc: "Single elimination. Six cups, one re-rack. Bounce counts two, can be swatted. Redemption in semis and final."
      },
      /* ── Saturday night · 1600 ── */
      {
        id: "trivia",
        n: 10,
        session: "san",
        value: 1600,
        name: "Trivia",
        kind: "team",
        game: "trivia",
        teamCfg: { teams: 4, size: 3, bracket: 4 },
        desc: "Four teams of three, single elimination. First correct answer scores. First team to 7 wins the match."
      },
      {
        id: "ragecage",
        n: 11,
        session: "san",
        value: 1600,
        name: "Rage Cage",
        kind: "solo",
        sport: "cage",
        game: "ragecage",
        pays: [1600, 1600, 400],
        desc: "Everyone circles the cups, two balls in play. Get stacked on and you are out. The last two go head to head."
      },
      {
        id: "beerio",
        n: 12,
        session: "san",
        value: 1600,
        name: "Beerio Kart",
        kind: "solo",
        sport: "kart",
        game: "beerio",
        stageCfg: { kind: "heats", nGroups: 4, advance: 1 },
        desc: "Heats of four, then a final. Crack a beer at the line, pull over to drink, finish it before you cross. Highest total wins."
      },
      /* ── The Finale · poker. No value: the result carries chip stacks that
         BECOME the standings, it never pays awards. ── */
      {
        id: "poker",
        n: 13,
        session: "fin",
        name: "Championship Poker",
        kind: "solo",
        finale: true,
        game: "poker",
        desc: "Whatever you have Saturday night is the stack you start the finale with. No-limit hold'em, blinds on the clock. Final chip counts are the final standings."
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
        detail: "Gets the next matchup ready."
      }),
      "sit-out": Object.freeze({
        label: "Event host",
        short: "Host",
        detail: "Resets the station between games."
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
        steps: ["Putt from the marked spot.", "A make beats any miss. Otherwise the closest ball wins."],
        win: "Closest of three attempts wins. Ties go to sudden death."
      } },
      "8ball": { name: "8-Ball", howto: {
        players: "Pairs",
        gear: ["Pool table", "Full rack", "Two cues"],
        objective: "Clear your group, then sink the 8.",
        steps: ["Break, then split stripes and solids.", "Partners alternate shots.", "A scratch gives the other pair ball in hand.", "Call the 8 before you shoot it."],
        win: "First pair to legally sink the 8 wins."
      } },
      pong: { name: "Beer Pong", howto: {
        players: "Pairs",
        gear: ["Table", "Ten cups", "Two balls"],
        objective: "Sink every cup on the far end first.",
        steps: ["Rack six, one re-rack on request.", "Both partners throw each turn.", "Bounces count two and can be swatted."],
        win: "First pair to sink all their cups wins.",
        house: "Redemption throw in the semis and final."
      } },
      die: { name: "Beer Die", howto: {
        players: "Pairs",
        gear: ["Table", "One die", "Four cups", "A pour"],
        objective: "Land the die in their cup, or make them miss the catch.",
        steps: ["Sit across the table, cups on your two corners.", "Toss the die up past head height and onto the far end.", "It has to bounce off the table. No darting it, no skying it.", "They catch it one-handed off the bounce, or you score."],
        win: "First pair to the set score wins. Sinking the die in a cup ends it on the spot.",
        house: "Call your own height on the toss. A plunk means chug."
      } },
      basketball: { name: "Basketball", variants: [
        { id: "1v1", label: "1v1", howto: {
          players: "Solo, single elimination",
          gear: ["Half court", "One ball"],
          objective: "Score five before your opponent.",
          steps: ["Check the ball up top.", "Everything counts one.", "Make it, take it.", "Call your own fouls."],
          win: "First to five wins the game. Win the final to take the event."
        } },
        { id: "3v3", label: "3v3", howto: {
          players: "Teams of three",
          gear: ["Half court", "One ball"],
          objective: "Score seven before the other team.",
          steps: ["Check the ball up top.", "Score by ones and twos.", "Take it back past the arc on a turnover.", "Call your own fouls."],
          win: "First team to seven wins."
        } },
        { id: "5v5", label: "5v5", howto: {
          players: "Two teams of five",
          gear: ["Full court", "One ball", "A clock"],
          objective: "Be ahead when time runs out.",
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
        steps: ["Rally for serve, then serve two and hand it over.", "Serve must clear the net and bounce once each side.", "Let it bounce once on your side before returning."],
        win: "Games to eleven, win by two. The winner of the final takes the event."
      } },
      foosball: { name: "Foosball", howto: {
        players: "Pairs",
        gear: ["Foosball table", "One ball"],
        objective: "Score on their goal, defend yours.",
        steps: ["Split the rods with your partner.", "Serve through the side hole.", "No spinning. A goal off a full spin does not count.", "A dead ball goes back to the serve."],
        win: "First pair to ten goals wins."
      } },
      volleyball: { name: "Volleyball", howto: {
        players: "Two teams",
        gear: ["Sand court", "Net", "One ball"],
        objective: "Ground the ball on their side.",
        steps: ["Serve from behind the line.", "Three touches a side, clean contact only.", "Rotate on every side-out.", "Every rally scores a point."],
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
        steps: ["Open a beer at the start line.", "Pull over to drink, no sipping while you steer.", "Finish the beer before the finish line, or wait there until it is gone."],
        win: "Best finishes advance to the final. Highest total wins."
      } },
      ragecage: { name: "Rage Cage", howto: {
        players: "Everyone, last standing",
        gear: ["A cup per player", "Center cup", "Two balls"],
        objective: "Sink your ball and pass it on before you get stacked.",
        steps: [
          "One cup each in a circle, the center cup filled by everyone. Two balls start on opposite sides.",
          "Bounce into your cup. Make it on the first try and pass to anyone; otherwise pass left.",
          "Make yours while the player to your left is still shooting and stack on them. Stacked players drink and are out.",
          "The last two go head to head. The loser drinks the center cup."
        ],
        win: "Last one standing takes 1st, the final loser 2nd, the third-to-last out 3rd. 1st and 2nd pay the same."
      } },
      where: { name: "Where and When", howto: {
        players: "Solo",
        gear: ["The TV"],
        objective: "Place the moment: where it was, or when.",
        steps: [
          "Ten rounds, alternating a place and a photo from the group's life.",
          "Place rounds: guess where it is. Photo rounds: guess the month and year.",
          "45 seconds a round.",
          "Each round scores up to 1,000. The closer the guess, the more it scores."
        ],
        win: "Highest total wins. Ties go to the best single round."
      } },
      trivia: { name: "Trivia", howto: {
        players: "Teams of three",
        gear: ["The TV"],
        objective: "Answer first and right.",
        steps: [
          "Four teams, single elimination, two teams a match.",
          "A question goes up on the TV.",
          "The first correct answer scores for that team.",
          "Categories: the groom, the family, the group, a photo round, sports and pop culture."
        ],
        win: "First team to 7 correct wins the match."
      } },
      poker: { name: "Poker", howto: {
        players: "Everyone, one table",
        gear: ["Cards", "Chips", "The clock"],
        objective: "Finish with the biggest stack.",
        steps: ["Whatever you have Saturday night is the stack you start the finale with.", "No-limit hold'em. Blinds rise on the clock.", "Bust and you are out.", "When the last level ends, count your stack."],
        win: "Chip leader takes the championship. Final chip counts are the final standings, and elimination order ranks the busts."
      } },
      gauntlet: { name: "The Gauntlet", howto: {
        players: "Solo, on the clock",
        gear: ["Putter", "Cups", "Pong ball", "One die"],
        objective: "Clear five stations faster than everyone else.",
        steps: ["Sink the pressure putt.", "Flip your cup clean.", "Hit a pong shot.", "Land a die on the table.", "Finish at the center cup. Miss a station, run it back."],
        win: "Fastest clean run takes 1st.",
        house: "One runner at a time. Someone times each run."
      } }
    };
    SLOT_META = [
      { label: "1st", team: "Winners", color: "var(--accent)" },
      { label: "2nd", team: "Runners-up", color: "var(--silver)" },
      { label: "3rd", team: "3rd place", color: "var(--bronze)" }
    ];
    OUTRIGHT_MULT = 2;
    wagerMult = (w) => w?.kind === "outright" ? Number.isInteger(w.mult) ? w.mult : OUTRIGHT_MULT : 1;
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
    EDITION = {
      name: "Scottsdale",
      year: 2026,
      label: "Scottsdale \xB7 2026",
      long: "October 30 to November 1, 2026",
      short: "Oct 30 to Nov 1"
    };
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
      away: {},
      onDeck: null,
      frozen: false,
      onboardEpoch: 0,
      eventEdits: {},
      eventOrder: [],
      eventOps: {},
      showControl: { active: null, history: [] },
      logistics: { ...LOGISTICS },
      prompts: { ballots: [], responses: {} },
      mvp: {},
      updatedAt: 0
    };
    RESET_PROGRESS_PRESERVED_KEYS = Object.freeze([
      "profiles",
      "seeds",
      "logistics",
      "onboardEpoch",
      "customEvents",
      "eventEdits",
      "eventOrder",
      /* D6: ballots are guest answers, not game progress */
      "prompts"
    ]);
    shapeLabel = (fit2) => !fit2 ? "" : fit2.split && new Set(fit2.split).size > 1 ? fit2.split.join(" v ") : fit2.size === 1 ? `${fit2.teams} players` : `${fit2.teams} teams of ${fit2.size}`;
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
      blindPack: Object.freeze({ denomination: 25, count: 8, minimumStack: 400 }),
      /* small chips to play with before any 1000 is dealt */
      workingLayer: Object.freeze([Object.freeze({ v: 100, n: 10 }), Object.freeze({ v: 500, n: 2 })])
    });
    DUEL_LAPSE_MS = 10 * 60 * 1e3;
    duelAccepted = (duel) => !!duel && (!duel.consent || !!duel.acceptedAt);
    duelLapsed = (duel, now = Date.now()) => !!duel && duel.status === "open" && !duelAccepted(duel) && now - Number(duel.ts || 0) >= DUEL_LAPSE_MS;
    duelLapsesAt = (duel) => duel?.consent ? Number(duel.ts || 0) + DUEL_LAPSE_MS : null;
    duelOpen = (duel, now = Date.now()) => {
      const phase = duelPhase(duel, now);
      return phase === "offered" || phase === "live";
    };
    duelBetween = (state, a, b, now = Date.now()) => (state?.duels || []).find((duel) => duelOpen(duel, now) && duel.to && (duel.from === a && duel.to === b || duel.from === b && duel.to === a)) || null;
    DUEL_DAILY_LIMIT = 3;
    duelsSentToday = (state, player, now = Date.now()) => (state?.duels || []).filter((duel) => duel.from === player && Number(duel.ts || 0) > now - 24 * 60 * 60 * 1e3 && !["declined", "withdrawn", "lapsed"].includes(duelPhase(duel, now))).length;
    postCountRuling = (a, stacksRes = null) => a.pokerRevision !== void 0 || !!stacksRes && a.ts > stacksRes.ts;
    postCountRulingApplies = (a, stacksRes) => !!stacksRes && (a.pokerRevision !== void 0 ? Number(a.pokerRevision) === Number(stacksRes.revision || 1) : a.ts > stacksRes.ts);
    MVP_PTS = PT;
    MVP_WINDOW_MS = 60 * 1e3;
    sameSet = (left, right) => Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((player) => right.includes(player));
    MAX_BRACKET = 16;
    ROUND_NAMES = {
      2: ["Final"],
      3: ["Semifinal", "Final"],
      4: ["Semifinals", "Final"],
      5: ["Play-in", "Semifinals", "Final"],
      6: ["Play-in", "Semifinals", "Final"],
      7: ["Quarterfinals", "Semifinals", "Final"],
      8: ["Quarterfinals", "Semifinals", "Final"]
    };
    for (let n = 9; n <= MAX_BRACKET; n++) ROUND_NAMES[n] = ["Round 1", "Quarterfinals", "Semifinals", "Final"];
    bracketRoundName = (size, r) => ROUND_NAMES[size]?.[r] || `Round ${r + 1}`;
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
    wideField = (contest) => contest?.kind === "ffa" && contest.sides.length > 2;
    contestMult = (contest) => wideField(contest) ? OUTRIGHT_MULT : 1;
    contestOfEntry = (evId, entry) => ({
      id: entry.id,
      eventId: evId,
      kind: entry.kind,
      match: entry.match,
      group: entry.group,
      stagesId: entry.stagesId,
      drawId: entry.drawId
    });
    contestUndoAvailability = (state, ev, now = Date.now()) => contestCorrectionAvailability(state, ev, null, now);
    contestCorrections = (state, ev, now = Date.now()) => ev ? [...contestStackOf(state, ev.id)].reverse().map((entry) => contestCorrectionAvailability(state, ev, entry.id, now)) : [];
    refundText = (state, refunds = []) => refunds.length ? `Returns ${refunds.map((item) => `${disp(state, item.player)} ${item.stake}`).join(", ")}` : "";
    duelPairText = (state, players = []) => players.filter(Boolean).map((player) => disp(state, player)).join(" vs ");
    lifecycleAction = (type, label2, blockers = []) => ({
      type,
      label: label2,
      enabled: blockers.length === 0,
      blockers
    });
  }
});

// src/ui/theme.js
var DISPLAY, SANS, BONE, GOLD_GRAD, label, pStyle;
var init_theme = __esm({
  "src/ui/theme.js"() {
    DISPLAY = "'Barlow Condensed','Arial Narrow',sans-serif";
    SANS = "'Inter',system-ui,sans-serif";
    BONE = "var(--bone)";
    GOLD_GRAD = "var(--sun)";
    label = { fontFamily: SANS, fontWeight: 700, fontSize: 11, letterSpacing: "0.07em", color: "var(--muted)", textTransform: "uppercase" };
    pStyle = { fontFamily: SANS, fontSize: 14, lineHeight: 1.6, color: "var(--muted2)", marginBottom: 14 };
  }
});

// src/lib/frameGate.js
function subscribeFrame(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
var REWIND_ACTIONS, JUMP_ACTIONS, INITIAL, frame, listeners, currentFrame;
var init_frameGate = __esm({
  "src/lib/frameGate.js"() {
    REWIND_ACTIONS = Object.freeze(/* @__PURE__ */ new Set([
      "clearResult",
      "correctContest",
      "undoLastContest",
      "voidWager",
      "voidDuel",
      "voidOpenDuels",
      "removeAdjustment",
      "undoDraftPick",
      "cancelDraft",
      "takeBackAnnouncement",
      "returnToLockerRoom",
      "resetTournament",
      "restoreEvent",
      "pokerCancel",
      "pokerUnbust",
      "clearDraw",
      "clearStages"
    ]));
    JUMP_ACTIONS = Object.freeze(/* @__PURE__ */ new Set(["qaAdvance", "qaRestore"]));
    INITIAL = Object.freeze({
      version: 0,
      seq: 0,
      fresh: false,
      live: false,
      correction: false,
      reason: "first",
      lastAction: null,
      at: 0
    });
    frame = INITIAL;
    listeners = /* @__PURE__ */ new Set();
    currentFrame = () => frame;
  }
});

// src/lib/serverClock.js
import { useEffect, useState } from "react";
var MAX_PLAUSIBLE_OFFSET_MS, offset, serverNow;
var init_serverClock = __esm({
  "src/lib/serverClock.js"() {
    MAX_PLAUSIBLE_OFFSET_MS = 12 * 60 * 60 * 1e3;
    offset = 0;
    serverNow = () => Date.now() + offset;
  }
});

// src/lib/motion.js
import React, { useCallback, useEffect as useEffect2, useLayoutEffect, useRef, useState as useState2, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
function useReducedMotion() {
  const [reduced, setReduced] = useState2(prefersReducedMotion);
  useEffect2(() => {
    const media = typeof window !== "undefined" ? window.matchMedia?.(QUERY) : null;
    if (!media) return void 0;
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);
  return reduced;
}
function cubicBezier(x1, y1, x2, y2) {
  const a = (p1, p2) => 1 - 3 * p2 + 3 * p1, b = (p1, p2) => 3 * p2 - 6 * p1, c = (p1) => 3 * p1;
  const at = (t, p1, p2) => ((a(p1, p2) * t + b(p1, p2)) * t + c(p1)) * t;
  const slope = (t, p1, p2) => 3 * a(p1, p2) * t * t + 2 * b(p1, p2) * t + c(p1);
  const solve = (x) => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const d = slope(t, x1, x2);
      if (Math.abs(d) < 1e-6) break;
      const next = t - (at(t, x1, x2) - x) / d;
      if (next < 0 || next > 1) break;
      t = next;
    }
    let lo = 0, hi = 1;
    for (let i = 0; i < 30 && Math.abs(at(t, x1, x2) - x) > 1e-5; i++) {
      if (at(t, x1, x2) < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return t;
  };
  return (x) => x <= 0 ? 0 : x >= 1 ? 1 : at(solve(x), y1, y2);
}
function useMotionFrame() {
  return useSyncExternalStore(subscribeFrame, currentFrame, currentFrame);
}
function freshChangeStep(committed, { value, key = null, frame: frame2, now = Date.now(), equals = Object.is }) {
  if (!committed) return { fresh: false, changeId: 0, from: value, to: value };
  if (key !== committed.key) return { fresh: false, changeId: committed.changeId, from: value, to: value };
  if (equals(value, committed.value)) return { fresh: false, changeId: committed.changeId, from: committed.from, to: committed.to };
  const byFrame = !!frame2?.fresh && frame2.seq !== committed.frameSeq && now - (frame2.at || 0) <= FRESH_WINDOW_MS;
  return byFrame ? { fresh: true, changeId: committed.changeId + 1, from: committed.value, to: value } : { fresh: false, changeId: committed.changeId, from: value, to: value };
}
function useFreshChange(value, key = null, { equals = Object.is } = {}) {
  const frame2 = useMotionFrame();
  const reduced = useReducedMotion();
  const committed = useRef(null);
  const step = freshChangeStep(committed.current, { value, key, frame: frame2, equals });
  useLayoutEffect(() => {
    committed.current = { value, key, frameSeq: frame2.seq, changeId: step.changeId, from: step.from, to: step.to };
  });
  return { ...step, animate: step.fresh && !reduced };
}
function registerFlightTarget(name, el) {
  if (!name || !el) return () => {
  };
  const set = targets.get(name) || /* @__PURE__ */ new Set();
  set.add(el);
  targets.set(name, set);
  return () => {
    set.delete(el);
    if (!set.size && targets.get(name) === set) targets.delete(name);
  };
}
function flightTarget(name) {
  const set = targets.get(name);
  if (!set) return null;
  const list = [...set].reverse();
  return list.find((el) => el.isConnected && rectVisible(rectOf(el))) || null;
}
function useFlightTarget(name) {
  const release = useRef(null);
  return useCallback((el) => {
    release.current?.();
    release.current = el ? registerFlightTarget(name, el) : null;
  }, [name]);
}
function rectVisible(rect, view = viewport()) {
  if (!rect || !(rect.width > 0) || !(rect.height > 0)) return false;
  return rect.left < view.width && rect.top < view.height && rect.left + rect.width > 0 && rect.top + rect.height > 0;
}
function flightKeyframes(from, to, { arc = 0, scale = "fit", fade = false, easing = EASE.out, frames = 16 } = {}) {
  const ease = parseBezier(easing) || easeFn.out;
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const end = scale === "fit" ? Math.min(to.width / from.width, to.height / from.height) : Number.isFinite(scale) ? scale : 1;
  const lift = Number(arc) || 0;
  return Array.from({ length: frames + 1 }, (_, i) => {
    const t = i / frames, e = ease(t);
    const x = dx * e;
    const y = dy * e - 4 * lift * e * (1 - e);
    const s = 1 + (end - 1) * e;
    const frame2 = { offset: t, transform: `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${s.toFixed(4)})` };
    if (fade) frame2.opacity = t < 0.7 ? 1 : Math.max(0, 1 - (t - 0.7) / 0.3);
    return frame2;
  });
}
function legKeyframes(base, a, b, { arc = 0, fade = false, easing = EASE.out, frames = 12 } = {}) {
  const ease = parseBezier(easing) || easeFn.out;
  const cx = (r) => r.left + r.width / 2, cy = (r) => r.top + r.height / 2;
  const fit2 = (r) => Math.min(r.width / base.width, r.height / base.height);
  const sa = fit2(a), sb = fit2(b), lift = Number(arc) || 0;
  return Array.from({ length: frames + 1 }, (_, i) => {
    const t = i / frames, e = ease(t);
    const x = cx(a) + (cx(b) - cx(a)) * e - cx(base);
    const y = cy(a) + (cy(b) - cy(a)) * e - 4 * lift * e * (1 - e) - cy(base);
    const s = sa + (sb - sa) * e;
    const frame2 = { offset: t, transform: `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${s.toFixed(4)})` };
    if (fade) frame2.opacity = t < 0.6 ? 1 : Math.max(0, 1 - (t - 0.6) / 0.4);
    return frame2;
  });
}
function flightLayer() {
  if (typeof document === "undefined") return null;
  if (layerEl?.isConnected) return layerEl;
  layerEl = document.getElementById("fd-flight-layer");
  if (!layerEl) {
    layerEl = document.createElement("div");
    layerEl.id = "fd-flight-layer";
    layerEl.className = "fd-flight-layer";
    layerEl.setAttribute("aria-hidden", "true");
    document.body.appendChild(layerEl);
  }
  return layerEl;
}
function fly(from, to, options = {}) {
  const {
    node = null,
    duration = MOTION.flight,
    delay = 0,
    arc = 0,
    scale = "fit",
    fade = false,
    easing = EASE.out,
    land = false,
    hold = null
  } = options;
  const skip = Promise.resolve(false);
  if (typeof document === "undefined" || typeof window === "undefined") return skip;
  if (prefersReducedMotion() || document.hidden) return skip;
  if (flightsInAir >= MAX_FLIGHTS) return skip;
  const fromRect = rectOf(from), toRect = rectOf(to);
  if (!rectVisible(fromRect) || !rectVisible(toRect)) return skip;
  const layer = flightLayer();
  if (!layer) return skip;
  const shell = document.createElement("div");
  shell.className = "fd-flight";
  Object.assign(shell.style, {
    left: `${fromRect.left}px`,
    top: `${fromRect.top}px`,
    width: `${fromRect.width}px`,
    height: `${fromRect.height}px`
  });
  let unmountReact = null, mounted = Promise.resolve();
  if (node && React.isValidElement(node)) {
    if (!portalHost) return skip;
    const host = portalHost.add(shell, node);
    unmountReact = host.remove;
    mounted = Promise.race([
      host.ready.then(() => true),
      new Promise((resolve) => setTimeout(() => resolve(false), 500))
    ]);
  } else {
    const source = node || (typeof from?.cloneNode === "function" ? from : null);
    if (!source) return skip;
    const copy = node ? source : source.cloneNode(true);
    copy.removeAttribute?.("id");
    shell.appendChild(copy);
  }
  layer.appendChild(shell);
  flightsInAir++;
  const frames = flightKeyframes(fromRect, toRect, { arc, scale, fade, easing });
  const done = () => {
    flightsInAir = Math.max(0, flightsInAir - 1);
    unmountReact?.();
    shell.remove();
  };
  shell.style.transform = frames[0].transform;
  return mounted.then((ok) => new Promise((resolve) => {
    if (ok === false) {
      done();
      resolve(false);
      return;
    }
    let animation;
    try {
      animation = shell.animate(frames, { duration, delay, easing: "linear", fill: "forwards" });
    } catch {
      done();
      resolve(false);
      return;
    }
    const pulse = (dest, on) => {
      const target = typeof dest === "string" ? flightTarget(dest) : dest;
      if (on && typeof target?.animate === "function" && !prefersReducedMotion()) {
        try {
          target.animate(
            [{ transform: "scale(1)" }, { transform: "scale(1.14)" }, { transform: "scale(1)" }],
            { duration: MOTION.pop, easing: EASE.land }
          );
        } catch {
        }
      }
    };
    animation.finished.then(() => {
      if (!hold) {
        done();
        pulse(to, land);
        resolve(true);
        return;
      }
      shell.classList.add("is-hover");
      let timer = 0;
      const capped = new Promise((settle) => {
        timer = setTimeout(() => settle(null), MAX_HOLD_MS);
      });
      Promise.race([Promise.resolve(hold).catch(() => null), capped]).then((next) => {
        clearTimeout(timer);
        shell.classList.remove("is-hover");
        const toRect2 = next?.to ? rectOf(next.to) : null;
        if (!toRect2 || !rectVisible(toRect2) || document.hidden || !shell.isConnected) {
          done();
          resolve(true);
          return;
        }
        let second;
        try {
          second = shell.animate(
            legKeyframes(fromRect, toRect, toRect2, next),
            { duration: next.duration ?? MOTION.flight, easing: "linear", fill: "forwards" }
          );
        } catch {
          done();
          resolve(true);
          return;
        }
        second.finished.then(
          () => {
            done();
            pulse(next.to, next.land);
            resolve(true);
          },
          () => {
            done();
            resolve(true);
          }
        );
      });
    }, () => {
      done();
      resolve(false);
    });
  }));
}
function holdStage(id, { now = Date.now(), maxMs = MAX_STAGE_HOLD_MS } = {}) {
  if (!id) return () => {
  };
  const token = {};
  stageHolds.set(id, { token, until: now + maxMs });
  stageNotify();
  const timer = typeof setTimeout === "function" ? setTimeout(() => release(), maxMs) : 0;
  timer?.unref?.();
  function release() {
    clearTimeout(timer);
    if (stageHolds.get(id)?.token !== token) return;
    stageHolds.delete(id);
    stageNotify();
  }
  return release;
}
function useStageHold(id, active) {
  useEffect2(() => active && id ? holdStage(id) : void 0, [id, active]);
}
var MOTION, EASE, FRESH_WINDOW_MS, QUERY, prefersReducedMotion, parseBezier, easeFn, signedChips, targets, MAX_FLIGHTS, flightsInAir, rectOf, viewport, MAX_HOLD_MS, layerEl, portalHost, MAX_STAGE_HOLD_MS, stageHolds, stageSubs, stageNotify, BEAT_ANIMATIONS;
var init_motion = __esm({
  "src/lib/motion.js"() {
    init_core();
    init_frameGate();
    init_serverClock();
    MOTION = Object.freeze({
      fast: 140,
      // presses, small state flips
      base: 260,
      // standard enter, sheet rise, lock wipe
      story: 720,
      // a composed beat
      count: 750,
      // a number counts in PT steps
      delta: 1100,
      // the change rises off a number and fades
      rowSlide: 560,
      // standings rows move to their new rank
      rowStagger: 10,
      rankRoll: 200,
      // rank digits roll once rows land
      stamp: 320,
      // WON / CHAMPION stamps
      flight: 340,
      // a chip leaves the rack on an arc
      cardFlight: 520,
      // a drafted card flies to its seat
      pop: 320,
      // the catch-up pop when the link returns
      sheetIn: 260,
      sheetOut: 200,
      settleHold: 2400,
      // how long a settled result holds before the next beat
      beat: 2e3
      // the shared heartbeat period
    });
    EASE = Object.freeze({
      out: "cubic-bezier(.2,.8,.2,1)",
      land: "cubic-bezier(.3,.7,.35,1.25)",
      exit: "cubic-bezier(.5,0,.75,.4)"
    });
    FRESH_WINDOW_MS = 1500;
    QUERY = "(prefers-reduced-motion: reduce)";
    prefersReducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.(QUERY)?.matches;
    parseBezier = (css) => {
      const m = /cubic-bezier\(([^)]+)\)/.exec(css || "");
      const v = m ? m[1].split(",").map(Number) : null;
      return v && v.length === 4 && v.every(Number.isFinite) ? cubicBezier(...v) : null;
    };
    easeFn = {
      out: parseBezier(EASE.out),
      land: parseBezier(EASE.land),
      exit: parseBezier(EASE.exit),
      cubicOut: (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3)
    };
    signedChips = (n) => {
      const v = Math.round(Number(n) || 0);
      return `${v > 0 ? "+" : v < 0 ? "\u2212" : ""}${Math.abs(v).toLocaleString("en-US")}`;
    };
    targets = /* @__PURE__ */ new Map();
    MAX_FLIGHTS = 24;
    flightsInAir = 0;
    rectOf = (source) => {
      if (!source) return null;
      if (typeof source === "string") {
        const el = flightTarget(source);
        return el ? rectOf(el) : null;
      }
      if (typeof source.getBoundingClientRect === "function") return source.isConnected === false ? null : source.getBoundingClientRect();
      if (["left", "top", "width", "height"].every((k) => Number.isFinite(source[k]))) return source;
      return null;
    };
    viewport = () => typeof window === "undefined" ? { width: 0, height: 0 } : { width: window.innerWidth || 0, height: window.innerHeight || 0 };
    MAX_HOLD_MS = 2e4;
    layerEl = null;
    portalHost = null;
    MAX_STAGE_HOLD_MS = 6e3;
    stageHolds = /* @__PURE__ */ new Map();
    stageSubs = /* @__PURE__ */ new Set();
    stageNotify = () => stageSubs.forEach((fn) => fn());
    BEAT_ANIMATIONS = Object.freeze(/* @__PURE__ */ new Set(["fd-beat", "fd-beat-dot", "fd-beat-fill"]));
  }
});

// src/ui/sheetMotion.js
import { useLayoutEffect as useLayoutEffect2 } from "react";
function noteUnmount() {
  if (unmountedThisCommit) return;
  unmountedThisCommit = true;
  queueMicrotask(() => {
    unmountedThisCommit = false;
  });
}
function sheetGhost(overlay, scrollTop = 0) {
  const ghost = overlay.cloneNode(true);
  ghost.classList.remove("is-swap");
  ghost.classList.add("is-leaving");
  ghost.setAttribute("aria-hidden", "true");
  ghost.setAttribute("inert", "");
  for (const el of ghost.querySelectorAll("[aria-modal],[role=dialog],[tabindex]")) {
    el.removeAttribute("aria-modal");
    el.removeAttribute("role");
    el.removeAttribute("tabindex");
  }
  const panel = ghost.querySelector(".si-sheet");
  return { ghost, panel, scrollTop };
}
function useSheetPresence(overlayRef, panelRef) {
  useLayoutEffect2(() => {
    const overlay = overlayRef.current, panel = panelRef.current;
    mountSeq++;
    if (unmountedThisCommit) overlay?.classList.add("is-swap");
    let scrollTop = 0;
    const onScroll = () => {
      scrollTop = panel.scrollTop;
    };
    panel?.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      panel?.removeEventListener("scroll", onScroll);
      noteUnmount();
      if (!overlay || typeof document === "undefined" || prefersReducedMotion()) return;
      if (panel?.isConnected) scrollTop = panel.scrollTop;
      const { ghost, panel: ghostPanel } = sheetGhost(overlay, scrollTop);
      document.body.appendChild(ghost);
      if (ghostPanel) ghostPanel.scrollTop = scrollTop;
      const seq = mountSeq;
      queueMicrotask(() => {
        if (mountSeq !== seq) {
          ghost.remove();
          return;
        }
        const falling = ghostPanel || ghost;
        falling.addEventListener("animationend", (event) => {
          if (event.target === falling) ghost.remove();
        });
        setTimeout(() => ghost.remove(), MOTION.sheetOut * 5);
      });
    };
  }, []);
}
var mountSeq, unmountedThisCommit;
var init_sheetMotion = __esm({
  "src/ui/sheetMotion.js"() {
    init_motion();
    mountSeq = 0;
    unmountedThisCommit = false;
  }
});

// src/ui/controls.jsx
import React2, { createContext, useContext, useState as useState3, useEffect as useEffect3, useRef as useRef2 } from "react";
function Tag({ children, tone = "dim", style }) {
  const tones = {
    dim: { color: "var(--muted)", background: "var(--ink-tint)" },
    gold: { color: "var(--accent2)", background: "var(--accent-tint)" },
    flame: { color: "var(--live2)", background: "rgba(192,71,58,0.14)" },
    green: { color: "var(--green)", background: "var(--green-tint)" }
  };
  return /* @__PURE__ */ React2.createElement("span", { style: {
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
  const [busy, setBusy] = useState3(false);
  const busyRef = useRef2(false);
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
  return /* @__PURE__ */ React2.createElement(
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
  return /* @__PURE__ */ React2.createElement(
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
  return /* @__PURE__ */ React2.createElement(ActionButton, { variant: BTN_KIND_VARIANT[kind], ...props });
}
function Sheet({ title, subtitle, headerActions, onClose, onBack, children, wide, busy = false, className = "", layer = 100 }) {
  const dialog = useRef2(null);
  const overlay = useRef2(null);
  useSheetPresence(overlay, dialog);
  const dock = useContext(SheetDock);
  const current = useRef2({ busy, onClose });
  current.current = { busy, onClose };
  useEffect3(() => {
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
  return /* @__PURE__ */ React2.createElement("div", { ref: overlay, className: "fd-sheet-overlay", onClick: busy ? void 0 : onClose, style: { zIndex: layer } }, /* @__PURE__ */ React2.createElement(
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
    /* @__PURE__ */ React2.createElement("div", { className: "fd-sheet-header" }, onBack && /* @__PURE__ */ React2.createElement(
      IconButton,
      {
        label: "Back",
        onClick: onBack,
        size: 44,
        disabled: busy,
        style: { fontSize: 18, marginLeft: -6 }
      },
      "\u2039"
    ), /* @__PURE__ */ React2.createElement("div", { className: "fd-sheet-heading" }, /* @__PURE__ */ React2.createElement("div", null, title), subtitle && /* @__PURE__ */ React2.createElement("small", null, subtitle)), headerActions && /* @__PURE__ */ React2.createElement("div", { className: "fd-sheet-header-actions" }, headerActions), dock && /* @__PURE__ */ React2.createElement("div", { className: "fd-sheet-dock" }, dock), /* @__PURE__ */ React2.createElement(IconButton, { label: "Close", onClick: onClose, size: 44, disabled: busy, style: { fontSize: 14 } }, "\u2715")),
    /* @__PURE__ */ React2.createElement("div", { className: "fd-sheet-body" }, children)
  ));
}
var ACTION_VARIANTS, BTN_KIND_VARIANT, SheetDock, openSheets, pageOverflow;
var init_controls = __esm({
  "src/ui/controls.jsx"() {
    init_theme();
    init_sheetMotion();
    ACTION_VARIANTS = {
      primary: { background: "var(--action-fill)", color: "var(--action-ink)", border: "1px solid var(--action-fill)" },
      secondary: { background: "var(--paper)", color: "var(--ink)", border: "1px solid var(--line)" },
      tertiary: { background: "var(--paper)", color: "var(--muted2)", border: "1px solid var(--line)" },
      destructive: { background: "var(--paper)", color: "var(--clay-text)", border: "1px solid var(--line)" },
      commit: { background: "var(--clay)", color: BONE, border: "1.5px solid var(--ink0)" }
    };
    BTN_KIND_VARIANT = { primary: "primary", dark: "secondary", ghost: "tertiary", danger: "destructive", flame: "commit" };
    SheetDock = createContext(null);
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
    num: profile?.num ?? (rosterIndex < 0 ? null : rosterIndex + 1),
    photo: photoUrl(profile, player)
  };
}
var photoUrl;
var init_playerIdentity = __esm({
  "src/features/identity/playerIdentity.js"() {
    init_core();
    photoUrl = (profile, player) => profile?.photoV ? `/api/photo/${encodeURIComponent(player)}?v=${profile.photoV}` : null;
  }
});

// src/features/identity/PlayerIdentityContext.js
import { createContext as createContext2, createElement, useContext as useContext2 } from "react";
function PlayerIdentityProvider({ profiles, children }) {
  return createElement(PlayerIdentityContext.Provider, { value: profiles ?? null }, children);
}
function usePlayerIdentity(player) {
  const profiles = useContext2(PlayerIdentityContext);
  if (profiles === void 0) {
    throw new Error("Player identity must render inside PlayerIdentityProvider.");
  }
  return resolvePlayerIdentity(profiles, player);
}
var PlayerIdentityContext;
var init_PlayerIdentityContext = __esm({
  "src/features/identity/PlayerIdentityContext.js"() {
    init_playerIdentity();
    PlayerIdentityContext = createContext2(void 0);
  }
});

// src/features/identity/PlayerIdentity.jsx
import React4, { useId, useState as useState5 } from "react";
function Avatar({ state, p, size = 34, ring, style }) {
  const prof = state.profiles?.[p];
  const photo = photoUrl(prof, p);
  const [failed, setFailed] = useState5(null);
  const src = photo && failed !== photo ? photo : null;
  const initials = (prof?.display || p || "").slice(0, 2).toUpperCase();
  const identity = usePlayerIdentity(p);
  const c = identity.color;
  return /* @__PURE__ */ React4.createElement("div", { style: {
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
    border: ring ? "2px solid var(--bone)" : "1.5px solid var(--ink0)",
    ...style
  } }, src ? /* @__PURE__ */ React4.createElement("img", { src, alt: "", onError: () => setFailed(photo), style: { width: "100%", height: "100%", objectFit: "cover" } }) : /* @__PURE__ */ React4.createElement("span", { style: {
    position: "relative",
    fontFamily: DISPLAY,
    fontWeight: 700,
    fontStyle: "italic",
    fontSize: size * 0.44,
    letterSpacing: "0.03em",
    color: identity.isLight ? "var(--ink0)" : BONE
  } }, initials));
}
function AvatarStack({ state, players, size = 24, max = 4 }) {
  const show = players.slice(0, max);
  const extra = players.length - show.length;
  return /* @__PURE__ */ React4.createElement("div", { style: { display: "flex", alignItems: "center" } }, show.map((p, pi) => /* @__PURE__ */ React4.createElement(Avatar, { key: p, state, p, size, style: { marginLeft: pi > 0 ? -size * 0.32 : 0 } })), extra > 0 && /* @__PURE__ */ React4.createElement("div", { style: {
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
  fallback,
  skin: skinOverride,
  color: colorOverride,
  isLight: lightOverride,
  valueRing = false,
  flat = false
}) {
  const uid = useId().replace(/:/g, "");
  const clipId = `chip-edge-${uid}`, faceId = `chip-face-${uid}`;
  const identity = usePlayerIdentity(p);
  const [failed, setFailed] = useState5(null);
  if (empty) return /* @__PURE__ */ React4.createElement("div", { style: {
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
  const photo = stampOverride == null && size >= PHOTO_MIN && identity.photo && failed !== identity.photo ? identity.photo : null;
  const stamp = stampOverride != null ? stampOverride : fallback != null ? fallback : identity.num;
  return /* @__PURE__ */ React4.createElement(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 32 32",
      "aria-hidden": "true",
      style: {
        flexShrink: 0,
        display: "block",
        filter: size >= 32 && !flat ? "drop-shadow(0 2px 2px rgba(0,0,0,.22))" : "none"
      }
    },
    /* @__PURE__ */ React4.createElement("defs", null, /* @__PURE__ */ React4.createElement("clipPath", { id: clipId }, /* @__PURE__ */ React4.createElement("circle", { cx: "16", cy: "16", r: "14.7" })), photo && /* @__PURE__ */ React4.createElement("clipPath", { id: faceId }, /* @__PURE__ */ React4.createElement("circle", { cx: "16", cy: "16", r: "9.3" }))),
    /* @__PURE__ */ React4.createElement("circle", { cx: "16", cy: "16", r: "14.7", fill: color, stroke: "var(--ink0)", strokeWidth: "1.45" }),
    /* @__PURE__ */ React4.createElement("circle", { cx: "16", cy: "16", r: "13.25", fill: "none", stroke: inlayLine, strokeWidth: ".65", opacity: ".72" }),
    /* @__PURE__ */ React4.createElement("g", { clipPath: `url(#${clipId})` }, chipMarks(skin, 16, 12.4, skinInk)),
    photo ? /* @__PURE__ */ React4.createElement(React4.Fragment, null, /* @__PURE__ */ React4.createElement("circle", { cx: "16", cy: "16", r: "9.3", fill: "var(--paper2)" }), /* @__PURE__ */ React4.createElement(
      "image",
      {
        href: photo,
        x: "6.7",
        y: "6.7",
        width: "18.6",
        height: "18.6",
        preserveAspectRatio: "xMidYMid slice",
        clipPath: `url(#${faceId})`,
        onError: () => setFailed(photo)
      }
    ), /* @__PURE__ */ React4.createElement("circle", { cx: "16", cy: "16", r: "9.3", fill: "none", stroke: skinInk, strokeWidth: ".9" })) : /* @__PURE__ */ React4.createElement("circle", { cx: "16", cy: "16", r: "8.75", fill: inlay, stroke: inlayLine, strokeWidth: ".8" }),
    /* @__PURE__ */ React4.createElement(
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
    /* @__PURE__ */ React4.createElement(
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
    valueRing && /* @__PURE__ */ React4.createElement(
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
    !photo && size >= 20 && stamp != null && stamp !== "" && /* @__PURE__ */ React4.createElement(
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
  return /* @__PURE__ */ React4.createElement(ChipFace, { p, size, empty, stamp: val, valueRing: val != null });
}
var CHIP_SKIN_PATHS, chipMarks, PHOTO_MIN;
var init_PlayerIdentity = __esm({
  "src/features/identity/PlayerIdentity.jsx"() {
    init_theme();
    init_PlayerIdentityContext();
    init_playerIdentity();
    CHIP_SKIN_PATHS = Object.freeze({
      flame: "M0 -3.9C1.9 -1.5 2.3 -0.5 2.3 0.6 2.3 2.1 1.3 3 0 3S-2.3 2.1 -2.3 0.6C-2.3-0.5-1.9-1.5 0-3.9Z",
      star: "M0 -3C0.35-0.9 0.55-0.7 2.7-0.35 0.55 0 0.35 0.2 0 2.3c-0.35-2.1-0.55-2.3-2.7-2.65C-0.55-0.7-0.35-0.9 0-3Z",
      bolt: "M-2.7-2.4 0 .2 2.7-2.4 2.7.2 0 2.9-2.7.2 0-2.4Z",
      crown: "M-6.2 3.4 -5-3.6-2.1-0.9 0-5.2 2.1-0.9 5-3.6 6.2 3.4Z"
    });
    chipMarks = (skin, cx = 16, edge = 12.4, ink = "var(--chip-mark)") => {
      const pt = (r, deg) => {
        const a = deg * Math.PI / 180;
        return [cx + Math.cos(a) * r, cx + Math.sin(a) * r];
      };
      const lines = (n, off, r12, r22, w) => Array.from({ length: n }, (_, i) => {
        const [x1, y1] = pt(r12, i * (360 / n) + off), [x2, y2] = pt(r22, i * (360 / n) + off);
        return /* @__PURE__ */ React4.createElement(
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
      if (skin === "dash") return /* @__PURE__ */ React4.createElement(
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
      if (skin === "ring") return /* @__PURE__ */ React4.createElement(React4.Fragment, null, /* @__PURE__ */ React4.createElement("circle", { cx, cy: cx, r: edge - 2.5, fill: "none", stroke: ink, strokeWidth: "1.15" }), /* @__PURE__ */ React4.createElement("circle", { cx, cy: cx, r: edge - 4.4, fill: "none", stroke: ink, strokeWidth: ".8", opacity: ".8" }));
      if (skin === "quad") return lines(4, 0, edge - 3.6, edge + 0.6, 3.4);
      if (skin === "dots") return Array.from({ length: 12 }, (_, i) => {
        const [x, y] = pt(edge - 1.45, i * 30 + 15);
        return /* @__PURE__ */ React4.createElement("circle", { key: i, cx: x, cy: y, r: "1.08", fill: ink });
      });
      const around = (n, d, r, spin = 0) => Array.from({ length: n }, (_, i) => {
        const a = i * (360 / n) + spin, [x, y] = pt(r, a);
        return /* @__PURE__ */ React4.createElement(
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
        return /* @__PURE__ */ React4.createElement(
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
      if (skin === "flame") return around(6, CHIP_SKIN_PATHS.flame, edge - 0.6);
      if (skin === "star") return around(6, CHIP_SKIN_PATHS.star, edge - 0.9);
      if (skin === "bolt") return around(6, CHIP_SKIN_PATHS.bolt, edge - 0.8);
      if (skin === "wave") {
        const n = 60, d = [];
        for (let i = 0; i <= n; i++) {
          const [x, y] = pt(edge - 1.9 + Math.sin(i / n * Math.PI * 14) * 1.5, i * (360 / n));
          d.push(`${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`);
        }
        return /* @__PURE__ */ React4.createElement("path", { d: d.join(" "), fill: "none", stroke: ink, strokeWidth: "1.5" });
      }
      if (skin === "crown") return /* @__PURE__ */ React4.createElement(
        "path",
        {
          d: CHIP_SKIN_PATHS.crown,
          fill: ink,
          transform: `translate(${cx} ${cx - 8.3})`
        }
      );
      return lines(8, 22.5, edge - 3, edge + 0.6, 2.4);
    };
    PHOTO_MIN = 24;
  }
});

// src/features/identity/chipCoin.js
function edgeInserts(skin, n = COIN_FACETS) {
  const every = (step, width = 1, offset2 = 0) => Array.from(
    { length: n },
    (_, i) => (i - offset2 + n) % n % step < width
  );
  switch (skin) {
    case "plain":
    case "ring":
      return Array(n).fill(false);
    case "dash":
      return every(4, 2);
    case "quad":
      return every(6, 2, 5);
    case "dots":
    case "saw":
      return every(2);
    case "flame":
    case "star":
    case "bolt":
      return every(4, 1, 2);
    case "wave":
      return every(3, 2);
    case "crown":
      return Array.from({ length: n }, (_, i) => i === 0 || i === 1 || i === n - 1);
    default:
      return every(3);
  }
}
function coinGeometry(size, n = COIN_FACETS) {
  const radius = size * (15.4 / 32);
  const thickness = Math.max(4, Math.round(size * 0.1));
  const chord = 2 * radius * Math.sin(Math.PI / n) + 0.6;
  const apothem = radius * Math.cos(Math.PI / n);
  return { radius, thickness, chord, apothem, step: 360 / n };
}
function coinSettle(angle, velocity = 0) {
  const a = Number.isFinite(angle) ? angle : 0;
  const v = Number.isFinite(velocity) ? Math.max(-3, Math.min(3, velocity)) : 0;
  const projected = a + v * 240;
  const target = Math.round(projected / 360) * 360;
  const duration = Math.round(Math.max(380, Math.min(1200, Math.abs(target - a) * 1.6)));
  return { target: target === 0 ? 0 : target, duration };
}
var COIN_FACETS, COIN_DEG_PER_PX, COIN_TAP_SLOP;
var init_chipCoin = __esm({
  "src/features/identity/chipCoin.js"() {
    COIN_FACETS = 24;
    COIN_DEG_PER_PX = 0.9;
    COIN_TAP_SLOP = 4;
  }
});

// src/ui/motion.js
var init_motion2 = __esm({
  "src/ui/motion.js"() {
    init_motion();
  }
});

// src/features/identity/chip-coin.css
var init_chip_coin = __esm({
  "src/features/identity/chip-coin.css"() {
  }
});

// src/features/identity/ChipCoin.jsx
import React20, { useEffect as useEffect13, useRef as useRef14, useState as useState17 } from "react";
function ChipCoin({ p, size = 48, stamp, fallback, mint = false, mintOnMount = false, className = "" }) {
  const identity = usePlayerIdentity(p);
  const reduced = useReducedMotion();
  const spinRef = useRef14(null);
  const drag = useRef14(null);
  const angle = useRef14(0);
  const frame2 = useRef14(0);
  const settle = useRef14(0);
  const dragged = useRef14(false);
  const claimed = identity.color !== CHIP_GRAY;
  const key = `${identity.color}|${identity.skin}`;
  const seen = useRef14(key);
  const [mints, setMints] = useState17(() => mintOnMount && claimed ? 1 : 0);
  useEffect13(() => {
    if (seen.current === key) return;
    seen.current = key;
    if (mint && claimed && !reduced) {
      angle.current = 0;
      setMints((count) => count + 1);
    }
  }, [key, mint, claimed, reduced]);
  useEffect13(() => () => {
    cancelAnimationFrame(frame2.current);
    clearTimeout(settle.current);
  }, []);
  if (reduced) return /* @__PURE__ */ React20.createElement("span", { className: `fd-coin is-static ${className}`, style: { width: size, height: size }, "aria-hidden": "true" }, /* @__PURE__ */ React20.createElement(ChipFace, { p, size, stamp, fallback }));
  const paint = () => {
    frame2.current = 0;
    if (spinRef.current) spinRef.current.style.transform = `rotateY(${angle.current.toFixed(2)}deg)`;
  };
  const onPointerDown = (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.stopPropagation();
    dragged.current = false;
    const el = spinRef.current;
    if (!el) return;
    if (settle.current) {
      clearTimeout(settle.current);
      settle.current = 0;
      angle.current = angleOf(getComputedStyle(el).transform);
    }
    el.style.transition = "none";
    paint();
    drag.current = { id: event.pointerId, x0: event.clientX, a0: angle.current, at: performance.now(), last: angle.current, v: 0 };
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
    }
  };
  const onPointerMove = (event) => {
    const d = drag.current;
    if (!d || event.pointerId !== d.id) return;
    event.stopPropagation();
    const dx = event.clientX - d.x0;
    if (Math.abs(dx) >= COIN_TAP_SLOP) dragged.current = true;
    if (!dragged.current) return;
    const now = performance.now();
    angle.current = d.a0 + dx * COIN_DEG_PER_PX;
    const dt = Math.max(1, now - d.at);
    d.v = d.v * 0.6 + (angle.current - d.last) / dt * 0.4;
    d.last = angle.current;
    d.at = now;
    if (!frame2.current) frame2.current = requestAnimationFrame(paint);
  };
  const onPointerEnd = (event) => {
    const d = drag.current;
    if (!d || event.pointerId !== d.id) return;
    drag.current = null;
    if (!dragged.current) return;
    event.stopPropagation();
    cancelAnimationFrame(frame2.current);
    frame2.current = 0;
    const el = spinRef.current;
    if (!el) return;
    const idle = performance.now() - d.at > 90;
    const { target, duration } = coinSettle(angle.current, idle ? 0 : d.v);
    el.style.transition = `transform ${duration}ms cubic-bezier(.2,.8,.2,1)`;
    el.style.transform = `rotateY(${target}deg)`;
    settle.current = setTimeout(() => {
      settle.current = 0;
      angle.current = 0;
      el.style.transition = "none";
      el.style.transform = "rotateY(0deg)";
    }, duration + 30);
  };
  const g = coinGeometry(size);
  const inserts = edgeInserts(identity.skin);
  return /* @__PURE__ */ React20.createElement(
    "span",
    {
      className: `fd-coin${identity.isLight ? " is-light" : ""} ${className}`,
      "aria-hidden": "true",
      style: {
        width: size,
        height: size,
        perspective: `${size * 6}px`,
        "--coin-color": identity.color,
        "--coin-h": `${g.thickness}px`,
        "--coin-chord": `${g.chord.toFixed(2)}px`,
        "--coin-apothem": `${g.apothem.toFixed(2)}px`,
        "--coin-step": `${g.step}deg`
      },
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
      onClickCapture: (event) => {
        if (!dragged.current) return;
        dragged.current = false;
        event.stopPropagation();
        event.preventDefault();
      }
    },
    /* @__PURE__ */ React20.createElement("span", { key: mints, className: `fd-coin-drop${mints ? " is-minting" : ""}` }, /* @__PURE__ */ React20.createElement("span", { className: "fd-coin-spin", ref: spinRef }, inserts.map((ink, index) => /* @__PURE__ */ React20.createElement(
      "span",
      {
        key: index,
        className: `fd-coin-facet${ink ? " is-ink" : ""}`,
        style: { "--i": index }
      }
    )), /* @__PURE__ */ React20.createElement("span", { className: "fd-coin-face is-front" }, /* @__PURE__ */ React20.createElement(ChipFace, { p, size, stamp, fallback })), /* @__PURE__ */ React20.createElement("span", { className: "fd-coin-face is-back" }, /* @__PURE__ */ React20.createElement(ChipFace, { p, size, stamp, fallback }))))
  );
}
var angleOf;
var init_ChipCoin = __esm({
  "src/features/identity/ChipCoin.jsx"() {
    init_core();
    init_motion2();
    init_PlayerIdentity();
    init_PlayerIdentityContext();
    init_chipCoin();
    init_chip_coin();
    angleOf = (transform) => {
      const values = /matrix3d\(([^)]+)\)/.exec(transform || "")?.[1]?.split(",").map(Number);
      return values ? Math.atan2(-values[2], values[0]) * 180 / Math.PI : 0;
    };
  }
});

// src/features/profile/tilt.js
function dragTilt(dx, dy, width, height) {
  const dragging = Math.hypot(dx, dy) >= TILT.dragThreshold;
  if (!dragging) return { x: 0, y: 0, dragging: false };
  return {
    x: clampUnit(dx / Math.max(1, width * TILT.dragReach)),
    y: clampUnit(dy / Math.max(1, height * TILT.dragReach)),
    dragging: true
  };
}
function hoverTilt(clientX, clientY, rect) {
  if (!rect?.width || !rect?.height) return { x: 0, y: 0 };
  return {
    x: clampUnit((clientX - rect.left - rect.width / 2) / (rect.width / 2)),
    y: clampUnit((clientY - rect.top - rect.height / 2) / (rect.height / 2))
  };
}
function orientationTilt({ gamma, beta }, base) {
  if (!Number.isFinite(gamma) || !Number.isFinite(beta) || !base) return { x: 0, y: 0 };
  return {
    x: clampUnit((gamma - base.gamma) / TILT.orientationRange),
    y: clampUnit((beta - base.beta) / TILT.orientationRange)
  };
}
function stepToward(current, target, rate) {
  const x = current.x + (target.x - current.x) * rate;
  const y = current.y + (target.y - current.y) * rate;
  const settled = Math.abs(target.x - x) < 2e-3 && Math.abs(target.y - y) < 2e-3;
  return settled ? { x: target.x, y: target.y, settled } : { x, y, settled };
}
function canFollowOrientation({ userAgent = "", platform = "", OrientationEvent } = {}) {
  if (typeof OrientationEvent !== "function") return false;
  if (typeof OrientationEvent.requestPermission === "function") return false;
  if (/iPhone|iPad|iPod/i.test(userAgent)) return false;
  return /Android/i.test(platform) || /Android/i.test(userAgent);
}
var TILT, clampUnit, recenter, plateStrength;
var init_tilt = __esm({
  "src/features/profile/tilt.js"() {
    TILT = Object.freeze({
      dragThreshold: 8,
      // px before a press becomes a tilt instead of a flip
      dragReach: 0.35,
      // fraction of the card that reaches full tilt
      follow: 0.18,
      // per-frame lerp while a pointer leads
      orientationFollow: 0.12,
      orientationRange: 20,
      // degrees of phone tilt for full card tilt
      recenter: 0.01,
      // the orientation baseline drifts toward how the phone is held
      releaseMs: 520,
      openMs: 700,
      flipHoldMs: 650,
      open: Object.freeze({ x: 0.35, y: -0.2 }),
      rotateX: 7,
      rotateY: 9
    });
    clampUnit = (value) => Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
    recenter = (base, reading, rate = TILT.recenter) => ({
      gamma: base.gamma + (reading.gamma - base.gamma) * rate,
      beta: base.beta + (reading.beta - base.beta) * rate
    });
    plateStrength = (x, y) => Math.min(1, Math.hypot(x, y) * 2.5);
  }
});

// src/features/profile/useRisoTilt.js
import { useEffect as useEffect14, useLayoutEffect as useLayoutEffect7, useRef as useRef15 } from "react";
function useRisoTilt(ref, enabled) {
  const st = useRef15(null);
  if (!st.current) st.current = {
    cur: { x: 0, y: 0 },
    target: { x: 0, y: 0 },
    raf: 0,
    pointer: null,
    hover: null,
    orient: null,
    suppress: false,
    hold: 0,
    timer: 0,
    opened: false,
    visible: true
  };
  const s = st.current;
  const write = (x, y) => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--tx", x.toFixed(4));
    el.style.setProperty("--ty", y.toFixed(4));
    el.style.setProperty("--tm", plateStrength(x, y).toFixed(3));
  };
  const frame2 = () => {
    s.raf = 0;
    const rate = s.pointer || s.hover ? TILT.follow : TILT.orientationFollow;
    s.cur = stepToward(s.cur, s.target, rate);
    write(s.cur.x, s.cur.y);
    if (!s.cur.settled) s.raf = requestAnimationFrame(frame2);
  };
  const follow = (target) => {
    const el = ref.current;
    if (!el) return;
    s.target = target;
    clearTimeout(s.timer);
    if (el.classList.contains("is-releasing")) {
      el.classList.remove("is-releasing");
      s.cur = { x: 0, y: 0 };
    }
    el.classList.add("is-tilting");
    if (!s.raf) s.raf = requestAnimationFrame(frame2);
  };
  const release = (ms = TILT.releaseMs) => {
    const el = ref.current;
    if (s.raf) cancelAnimationFrame(s.raf);
    s.raf = 0;
    if (!el) return;
    if (s.orient?.target && Date.now() >= s.hold) {
      follow(s.orient.target);
      return;
    }
    s.target = { x: 0, y: 0 };
    s.cur = { x: 0, y: 0 };
    el.style.setProperty("--tilt-release", `${ms}ms`);
    el.classList.add("is-releasing");
    write(0, 0);
    clearTimeout(s.timer);
    s.timer = setTimeout(() => el.classList.remove("is-releasing", "is-tilting"), ms + 60);
  };
  const reset = () => {
    const el = ref.current;
    if (s.raf) cancelAnimationFrame(s.raf);
    clearTimeout(s.timer);
    s.raf = 0;
    s.pointer = null;
    s.hover = null;
    s.cur = { x: 0, y: 0 };
    s.target = { x: 0, y: 0 };
    if (!el) return;
    el.classList.remove("is-releasing", "is-tilting");
    ["--tx", "--ty", "--tm", "--tilt-release"].forEach((name) => el.style.removeProperty(name));
  };
  const openSettle = () => {
    if (s.opened || !ref.current) return;
    s.opened = true;
    s.cur = { ...TILT.open };
    write(TILT.open.x, TILT.open.y);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!s.pointer && !s.hover) release(TILT.openMs);
    }));
  };
  useIsoLayoutEffect(() => {
    if (!enabled) {
      reset();
      return void 0;
    }
    const el = ref.current;
    if (!el || typeof window === "undefined") return void 0;
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.bottom > 0 && rect.top < window.innerHeight) openSettle();
    return void 0;
  }, [enabled]);
  useEffect14(() => {
    if (!enabled) return void 0;
    const el = ref.current;
    if (!el || typeof IntersectionObserver !== "function") return void 0;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.some((entry) => entry.isIntersecting);
      s.visible = visible;
      if (visible) openSettle();
      else if (s.orient) {
        s.orient = null;
        release();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [enabled]);
  useEffect14(() => {
    if (!enabled || typeof window === "undefined") return void 0;
    const allowed = canFollowOrientation({
      userAgent: navigator.userAgent,
      platform: navigator.userAgentData?.platform,
      OrientationEvent: window.DeviceOrientationEvent
    });
    if (!allowed) return void 0;
    const onOrient = (event) => {
      if (!s.visible || !Number.isFinite(event.gamma) || !Number.isFinite(event.beta)) return;
      const reading = { gamma: event.gamma, beta: event.beta };
      if (!s.orient) s.orient = { base: reading, target: { x: 0, y: 0 } };
      s.orient.base = recenter(s.orient.base, reading);
      s.orient.target = orientationTilt(reading, s.orient.base);
      if (!s.pointer && !s.hover && Date.now() >= s.hold) follow(s.orient.target);
    };
    window.addEventListener("deviceorientation", onOrient);
    return () => {
      window.removeEventListener("deviceorientation", onOrient);
      s.orient = null;
    };
  }, [enabled]);
  useEffect14(() => () => {
    if (s.raf) cancelAnimationFrame(s.raf);
    clearTimeout(s.timer);
  }, []);
  const handlers = enabled ? {
    onPointerDown: (event) => {
      s.suppress = false;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const rect = event.currentTarget.getBoundingClientRect();
      s.pointer = { id: event.pointerId, x0: event.clientX, y0: event.clientY, w: rect.width, h: rect.height, dragging: false };
    },
    onPointerMove: (event) => {
      if (s.pointer && event.pointerId === s.pointer.id) {
        const tilt = dragTilt(event.clientX - s.pointer.x0, event.clientY - s.pointer.y0, s.pointer.w, s.pointer.h);
        if (tilt.dragging) {
          s.pointer.dragging = true;
          follow(tilt);
        }
        return;
      }
      if (event.pointerType !== "mouse" || Date.now() < s.hold) return;
      if (!s.hover) s.hover = { rect: event.currentTarget.getBoundingClientRect() };
      follow(hoverTilt(event.clientX, event.clientY, s.hover.rect));
    },
    onPointerUp: (event) => {
      if (!s.pointer || event.pointerId !== s.pointer.id) return;
      if (s.pointer.dragging) {
        s.suppress = Date.now();
        s.pointer = null;
        release();
      } else s.pointer = null;
    },
    onPointerCancel: () => {
      s.pointer = null;
      release();
    },
    onPointerLeave: (event) => {
      if (event.pointerType !== "mouse") return;
      s.hover = null;
      if (s.pointer) s.pointer = null;
      release();
    }
  } : {};
  return {
    handlers,
    /* true once for the click that ends a tilt drag */
    consumeClick() {
      const recent = s.suppress && Date.now() - s.suppress < 500;
      s.suppress = false;
      return !!recent;
    },
    /* the flip turns a level card */
    flip() {
      if (!enabled) return;
      s.hold = Date.now() + TILT.flipHoldMs;
      s.hover = null;
      release();
    }
  };
}
var useIsoLayoutEffect;
var init_useRisoTilt = __esm({
  "src/features/profile/useRisoTilt.js"() {
    init_tilt();
    useIsoLayoutEffect = typeof window === "undefined" ? useEffect14 : useLayoutEffect7;
  }
});

// src/features/profile/seasonStats.js
function roundShort(teamCount, round) {
  const name = ROUND_NAMES[teamCount]?.[round];
  return name ? ROUND_SHORT[name] || name : `Round ${round + 1}`;
}
function stagePlayers(state, st, key, evId = st.eventId) {
  if (st.entrantType === "team") {
    const draw = state.draws?.[evId];
    if (!draw || st.drawId && draw.id !== st.drawId) return [];
  }
  return stageEntrantView(state, { ...st, eventId: evId }, key).players || [];
}
function groupWinner(st, group) {
  if (decided2(group?.winner)) return group.winner;
  const through = group?.through || [];
  return st.advance === 1 && through.length === 1 ? through[0] : null;
}
function bracketStanding(state, ev, teamIdx) {
  const br = state.brackets?.[ev.id], draw = state.draws?.[ev.id];
  if (!br?.rounds || !draw?.teams) return null;
  let next = null;
  for (let r = 0; r < br.rounds.length; r++) {
    for (const match of br.rounds[r]) {
      const sides = [resolveSlot(br, match.a), resolveSlot(br, match.b)];
      if (!sides.includes(teamIdx)) continue;
      if (decided2(match.winner) && match.winner !== teamIdx)
        return { out: true, label: roundShort(draw.teams.length, r) };
      if (!decided2(match.winner) && next === null) next = r;
    }
  }
  return { out: false, label: next === null ? "" : roundShort(draw.teams.length, next) };
}
function stageStanding(state, st, player, evId) {
  const keyOf = (key) => stagePlayers(state, st, key, evId).includes(player);
  const group = (st.groups || []).find((g) => (g.entrants || []).some(keyOf));
  if (!group) return null;
  const through = group.through || [];
  const winner = groupWinner(st, group);
  const qualified = through.some(keyOf) || decided2(winner) && keyOf(winner);
  const groupDone = through.length >= st.advance || decided2(winner);
  if (groupDone && !qualified) return { out: true, label: "Heat" };
  if (!groupDone) return { out: false, label: group.name || "Heat" };
  if (decided2(st.finalWinner) && !keyOf(st.finalWinner)) return { out: true, label: "Final" };
  return { out: false, label: "Final" };
}
function eventRow(state, ev, player) {
  if (!ev || ev.finale || state.shelved?.[ev.id]) return null;
  const res = state.results?.[ev.id];
  if (!res && !eventInPlay(state, ev)) return null;
  const draw = state.draws?.[ev.id], st = state.stages?.[ev.id];
  const teamIdx = teamIndexOf(draw, player);
  const crew = [...draw?.roles || [], ...st?.roles || []].some((role) => role?.player === player);
  const played = teamIdx >= 0 ? true : st?.entrantType === "solo" ? (st.groups || []).some((g) => (g.entrants || []).includes(player)) : draw?.teams ? false : !crew && !isAway(state, player);
  const base = { id: ev.id, name: ev.name, session: ev.session, value: ev.value || 0 };
  if (res) {
    const award = resultAwards(state, ev, res).find((item) => item.player === player);
    if (award && award.place === "crew") return { ...base, status: "crew", place: "Crew", award: award.pts };
    if (award) return { ...base, status: "placed", rank: award.place, place: placeLabel(award.place), award: award.pts };
    if (crew) return { ...base, status: "crew", place: "Crew", award: 0 };
    if (!played) return null;
    const exit = teamIdx >= 0 && state.brackets?.[ev.id] ? bracketStanding(state, ev, teamIdx) : st ? stageStanding(state, st, player, ev.id) : null;
    return { ...base, status: "out", place: exit?.label || "\u2013", award: 0 };
  }
  if (crew) return { ...base, status: "crew", place: "Crew", award: null };
  if (!played) return null;
  const standing = teamIdx >= 0 && state.brackets?.[ev.id] ? bracketStanding(state, ev, teamIdx) : st ? stageStanding(state, st, player, ev.id) : null;
  if (standing?.out) return { ...base, status: "out", place: standing.label, award: null };
  return { ...base, status: "playing", place: standing?.label || "\u2013", award: null };
}
function wagerPickPlayers(state, wager) {
  if (Array.isArray(wager?.pickPlayers) && wager.pickPlayers.length) return wager.pickPlayers;
  if (wager?.kind === "outright") return wager.pick ? [wager.pick] : [];
  if (wager?.kind === "match") return state.draws?.[wager.eventId]?.teams?.[wager.teamIdx]?.players || [];
  if (wager?.kind === "stage" || wager?.kind === "heat") {
    const st = state.stages?.[wager.eventId];
    return st ? stagePlayers(state, st, wager.pickKey, wager.eventId) : [];
  }
  return [];
}
function betRecord(state, player, events = allEventsOf(state)) {
  const out = { won: 0, lost: 0, net: 0, pending: 0, atRisk: 0, best: null };
  (state.wagers || []).forEach((wager) => {
    if (wager.player !== player) return;
    const result = resolveWager(state, wager, events);
    if (result.status === "pending") {
      out.pending += 1;
      out.atRisk += Number(wager.stake) || 0;
      return;
    }
    if (result.status !== "won" && result.status !== "lost") return;
    out[result.status] += 1;
    out.net += result.delta;
    if (result.status === "won" && (!out.best || result.delta > out.best.delta)) {
      const ev = events.find((item) => item.id === wager.eventId);
      out.best = {
        eventId: wager.eventId,
        name: ev?.name || wager.evName || "",
        delta: result.delta,
        stake: Number(wager.stake) || 0,
        pick: wagerPickPlayers(state, wager)
      };
    }
  });
  return out;
}
function duelTally(state, player, other = null) {
  const out = { won: 0, lost: 0, push: 0, net: 0 };
  (state.duels || []).forEach((duel) => {
    if (duel.from !== player && duel.to !== player) return;
    if (other && duel.from !== other && duel.to !== other) return;
    const result = resolveDuel(duel);
    if (!result.settled) return;
    if (result.push) {
      out.push += 1;
      return;
    }
    const stake = Number(duel.stake) || 0;
    if (result.winner === player) {
      out.won += 1;
      out.net += stake;
    } else {
      out.lost += 1;
      out.net -= stake;
    }
  });
  return out;
}
function eventMeetings(state, a, b, events = allEventsOf(state)) {
  if (!a || !b || a === b) return [];
  const out = [];
  const meet = (ev, label2, sides, winnerSide) => {
    const sideA = sides.findIndex((players) => players.includes(a));
    const sideB = sides.findIndex((players) => players.includes(b));
    if (sideA < 0 || sideB < 0 || sideA === sideB) return;
    if (sides.length > 2 && winnerSide !== sideA && winnerSide !== sideB) return;
    out.push({ eventId: ev.id, event: ev.name, label: label2, won: winnerSide === sideA });
  };
  events.forEach((ev) => {
    if (!ev || ev.finale || state.shelved?.[ev.id]) return;
    const draw = state.draws?.[ev.id], br = state.brackets?.[ev.id], st = state.stages?.[ev.id];
    if (br?.rounds && draw?.teams) {
      br.rounds.forEach((round, r) => round.forEach((match, m) => {
        if (!decided2(match.winner)) return;
        const keys = [resolveSlot(br, match.a), resolveSlot(br, match.b)];
        if (keys.some((key) => !draw.teams[key])) return;
        meet(
          ev,
          contestEntryLabel(state, ev, { kind: "match", match: [r, m] }),
          keys.map((key) => draw.teams[key].players || []),
          keys.indexOf(match.winner)
        );
      }));
      return;
    }
    if (st?.groups) {
      st.groups.forEach((group) => {
        const winner = groupWinner(st, group);
        if (!decided2(winner)) return;
        const keys = group.entrants || [];
        meet(ev, group.name || "Heat", keys.map((key) => stagePlayers(state, st, key, ev.id)), keys.indexOf(winner));
      });
      const finalists = stageFinalists(st);
      if (finalists && decided2(st.finalWinner))
        meet(ev, "Final", finalists.map((key) => stagePlayers(state, st, key, ev.id)), finalists.indexOf(st.finalWinner));
      return;
    }
    const res = state.results?.[ev.id];
    if (draw?.teams?.length === 2 && res?.slots?.[0]?.length) {
      const sides = draw.teams.map((team) => team.players || []);
      const winnerSide = sides.findIndex((players) => res.slots[0].some((player) => players.includes(player)));
      if (winnerSide >= 0) meet(ev, ev.name, sides, winnerSide);
    }
  });
  return out;
}
function betsOn(state, viewer, player, events = allEventsOf(state)) {
  const out = { won: 0, lost: 0, net: 0 };
  (state.wagers || []).forEach((wager) => {
    if (wager.player !== viewer || !wagerPickPlayers(state, wager).includes(player)) return;
    const result = resolveWager(state, wager, events);
    if (result.status !== "won" && result.status !== "lost") return;
    out[result.status] += 1;
    out.net += result.delta;
  });
  return out;
}
function headToHead(state, a, b, events = allEventsOf(state)) {
  const meetings = eventMeetings(state, a, b, events);
  const duels = duelTally(state, a, b);
  const won = meetings.filter((meeting) => meeting.won).length + duels.won;
  const lost = meetings.filter((meeting) => !meeting.won).length + duels.lost;
  return { player: a, other: b, meetings, duels, won, lost, count: won + lost + duels.push };
}
function rivalries(state, player, { events = allEventsOf(state), limit = 3 } = {}) {
  return ROSTER.filter((other) => other !== player).map((other) => headToHead(state, player, other, events)).filter((record) => record.won + record.lost > 0).sort((x, y) => y.won + y.lost - (x.won + x.lost) || Math.abs(x.won - x.lost) - Math.abs(y.won - y.lost) || ROSTER.indexOf(x.other) - ROSTER.indexOf(y.other)).slice(0, limit);
}
function seasonStats(state, player, { events = allEventsOf(state), standings, viewer = null } = {}) {
  const rows = events.map((ev) => eventRow(state, ev, player)).filter(Boolean);
  const bets = betRecord(state, player, events);
  const duels = duelTally(state, player);
  const table = state.live ? standings || computeStandings(state) : null;
  const row = table?.find((item) => item.player === player) || null;
  const moved = !!table?.some((item) => item.pts !== START);
  const own = !!viewer && viewer === player;
  const versus = viewer && !own ? headToHead(state, viewer, player, events) : null;
  const mvps = mvpAwards(state).filter((item) => item.player === player).length;
  return {
    player,
    events: rows,
    wins: rows.filter((item) => item.status === "placed" && item.rank === 0).length,
    mvps,
    bets,
    duels,
    rank: moved ? row?.rank ?? null : null,
    pts: row ? row.pts : null,
    versus: versus && versus.count > 0 ? { ...versus, bets: betsOn(state, viewer, player, events) } : null,
    rivals: own ? rivalries(state, player, { events }) : [],
    active: rows.length > 0 || bets.won + bets.lost + bets.pending > 0 || duels.won + duels.lost + duels.push > 0 || mvps > 0 || moved
  };
}
var decided2, placeLabel, ROUND_SHORT, teamIndexOf, recordText;
var init_seasonStats = __esm({
  "src/features/profile/seasonStats.js"() {
    init_core();
    decided2 = (value) => value !== null && value !== void 0;
    placeLabel = (place) => ["1st", "2nd", "3rd"][place] || `${place + 1}th`;
    ROUND_SHORT = { Semifinals: "SF", Semifinal: "SF", Quarterfinals: "QF", Quarterfinal: "QF" };
    teamIndexOf = (draw, player) => Array.isArray(draw?.teams) ? draw.teams.findIndex((team) => team?.players?.includes(player)) : -1;
    recordText = ({ won = 0, lost = 0, push = 0 }) => `${won}-${lost}${push ? `-${push}` : ""}`;
  }
});

// src/features/profile/player-pass.css
var init_player_pass = __esm({
  "src/features/profile/player-pass.css"() {
  }
});

// src/features/profile/PlayerPass.jsx
import React21, { useEffect as useEffect15, useMemo as useMemo2, useRef as useRef16, useState as useState18 } from "react";
function cardInk(color) {
  const luminanceOf = (hex) => {
    const channels = hex.slice(1).match(/.{2}/g).map((value) => parseInt(value, 16) / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const luminance = luminanceOf(color), darkLuminance = luminanceOf("#070b09");
  return (luminance + 0.05) / (darkLuminance + 0.05) >= 1.05 / (luminance + 0.05) ? "#070b09" : "#ffffff";
}
function PlayerPass({
  state,
  p,
  display,
  num,
  photo,
  compact = false,
  mint = false,
  viewer = null,
  events,
  standings,
  onFlip
}) {
  const identity = usePlayerIdentity(p);
  const [flipped, setFlipped] = useState18(false);
  const reducedMotion = useReducedMotion();
  const cardRef = useRef16(null);
  const tilt = useRisoTilt(cardRef, !reducedMotion && !!p);
  const profile = state.profiles?.[p] || {};
  const name = display?.trim() || profile.display || p;
  const number = num !== void 0 && num !== null && num !== "" ? Number(num) : identity.num;
  const saved2 = photo || (profile.photoV ? `/api/photo/${encodeURIComponent(p)}?v=${profile.photoV}` : null);
  const [failed, setFailed] = useState18(null);
  const portrait = saved2 && failed !== saved2 ? saved2 : null;
  const rows = useMemo2(() => standings || (state.live ? computeStandings(state) : null), [standings, state]);
  const standing = state.live ? rows?.find((row) => row.player === p) : null;
  const season = useMemo2(
    () => p ? seasonStats(
      state,
      p,
      { events: events || allEventsOf(state), standings: rows || void 0, viewer }
    ) : null,
    [state, p, events, rows, viewer]
  );
  const sheet = !!season && (season.active || !!season.versus);
  const seasonRef = useRef16(null);
  const [backHeight, setBackHeight] = useState18(0);
  useEffect15(() => {
    const body = seasonRef.current, face = body?.parentElement;
    if (!body || !face || typeof window === "undefined") {
      setBackHeight(0);
      return void 0;
    }
    const measure = () => {
      const cs = window.getComputedStyle(face);
      const frame2 = ["paddingTop", "paddingBottom", "borderTopWidth", "borderBottomWidth"].reduce((sum, key) => sum + (parseFloat(cs[key]) || 0), 0);
      setBackHeight(Math.ceil(body.offsetHeight + frame2));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return void 0;
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    return () => observer.disconnect();
  }, [sheet]);
  if (!p) return null;
  const longest = Math.max(4, ...name.split(/\s+/).map((word) => word.length));
  const ghost = number == null ? "FD" : String(number).padStart(2, "0");
  const turn = () => {
    const next = !flipped;
    setFlipped(next);
    onFlip?.(next);
  };
  return /* @__PURE__ */ React21.createElement(
    "div",
    {
      className: `fd-pass-wrap${compact ? " fd-pass-compact" : ""}`,
      style: { "--pass-color": identity.color, "--pass-ink": cardInk(identity.color), "--pass-name-chars": longest }
    },
    /* @__PURE__ */ React21.createElement(
      "button",
      {
        type: "button",
        ref: cardRef,
        className: "fd-pass",
        ...tilt.handlers,
        style: backHeight ? { minHeight: flipped ? backHeight : 0 } : void 0,
        onClick: () => {
          if (tilt.consumeClick()) return;
          tilt.flip();
          turn();
        },
        "aria-label": `${name}'s player card. ${flipped ? "Show front" : "Turn over"}`,
        "aria-pressed": flipped
      },
      /* @__PURE__ */ React21.createElement("span", { className: "fd-pass-shadow", "aria-hidden": "true" }),
      /* @__PURE__ */ React21.createElement("span", { className: "fd-pass-tilt" }, /* @__PURE__ */ React21.createElement("span", { className: `fd-pass-inner${flipped ? " is-flipped" : ""}` }, /* @__PURE__ */ React21.createElement("span", { className: "fd-pass-face fd-pass-front", "aria-hidden": flipped }, /* @__PURE__ */ React21.createElement("span", { className: "fd-pass-top" }, /* @__PURE__ */ React21.createElement("span", null, "FIELD DAY"), /* @__PURE__ */ React21.createElement("span", null, EDITION.name.toUpperCase(), " / ", EDITION.year)), /* @__PURE__ */ React21.createElement("span", { className: "fd-pass-art" }, /* @__PURE__ */ React21.createElement("span", { className: "fd-pass-orbit" }), /* @__PURE__ */ React21.createElement("span", { className: "fd-pass-number" }, ghost), /* @__PURE__ */ React21.createElement("span", { className: "fd-pass-number fd-pass-plate", "aria-hidden": "true" }, ghost), portrait && /* @__PURE__ */ React21.createElement("img", { className: "fd-pass-photo", src: portrait, alt: "", onError: () => setFailed(portrait) }), /* @__PURE__ */ React21.createElement("span", { className: `fd-pass-chip${portrait ? " with-photo" : ""}` }, /* @__PURE__ */ React21.createElement(ChipCoin, { p, size: portrait ? 78 : 112, stamp: number == null ? void 0 : String(number), mint })), /* @__PURE__ */ React21.createElement("span", { className: "fd-pass-edition" }, "SCOTTSDALE", /* @__PURE__ */ React21.createElement("br", null), "ARIZONA")), /* @__PURE__ */ React21.createElement("span", { className: "fd-pass-name" }, name), /* @__PURE__ */ React21.createElement("span", { className: "fd-pass-foot" }, /* @__PURE__ */ React21.createElement("span", null, EDITION.short), /* @__PURE__ */ React21.createElement("span", null, "PLAYER / ", number ?? "FD"))), /* @__PURE__ */ React21.createElement("span", { className: `fd-pass-face fd-pass-back${sheet ? " is-season" : ""}`, "aria-hidden": !flipped }, sheet ? /* @__PURE__ */ React21.createElement(
        SeasonBack,
        {
          state,
          name,
          number,
          season,
          walkout: profile.walkoutTrack?.name,
          bodyRef: seasonRef
        }
      ) : /* @__PURE__ */ React21.createElement(React21.Fragment, null, /* @__PURE__ */ React21.createElement("span", { className: "fd-pass-top" }, /* @__PURE__ */ React21.createElement("span", null, name), /* @__PURE__ */ React21.createElement("span", null, "FIELD DAY / ", EDITION.year)), /* @__PURE__ */ React21.createElement("span", { className: "fd-pass-back-title" }, "PLAYER", /* @__PURE__ */ React21.createElement("br", null), number == null ? "CARD" : String(number).padStart(2, "0")), /* @__PURE__ */ React21.createElement("span", { className: "fd-pass-facts" }, /* @__PURE__ */ React21.createElement("span", null, /* @__PURE__ */ React21.createElement("span", null, "Scottsdale, Arizona"), /* @__PURE__ */ React21.createElement("span", null, EDITION.short)), standing && /* @__PURE__ */ React21.createElement("span", null, /* @__PURE__ */ React21.createElement("span", null, "Current chips"), /* @__PURE__ */ React21.createElement("strong", null, standing.pts.toLocaleString("en-US"))), profile.walkoutTrack?.name && /* @__PURE__ */ React21.createElement("span", null, /* @__PURE__ */ React21.createElement("span", null, "Win song"), /* @__PURE__ */ React21.createElement("strong", null, profile.walkoutTrack.name))), /* @__PURE__ */ React21.createElement("span", { className: "fd-pass-foot" }, /* @__PURE__ */ React21.createElement("span", null, name.toUpperCase()), /* @__PURE__ */ React21.createElement("span", null, EDITION.year))))))
    ),
    /* @__PURE__ */ React21.createElement("span", { className: "fd-pass-hint" }, flipped ? "Tap to see the front" : "Tap to turn over")
  );
}
function SeasonBack({ state, name, number, season, walkout, bodyRef }) {
  const { versus, events, bets, duels, rivals } = season;
  const settledBets = bets.won + bets.lost;
  const settledDuels = duels.won + duels.lost + duels.push;
  let index = 0;
  const order = () => ({ "--i": index++ });
  const totals = [
    season.rank !== null && { key: "rank", value: String(season.rank), label: "Rank" },
    season.pts !== null && { key: "chips", value: fmt3(season.pts), label: "Chips" },
    settledBets > 0 && { key: "bets", value: signedChips(bets.net), label: `Bets ${recordText(bets)}` },
    settledDuels > 0 && { key: "duels", value: recordText(duels), label: "Quick Draw" },
    season.mvps > 0 && { key: "mvps", value: String(season.mvps), label: season.mvps === 1 ? "Team MVP" : "Team MVPs" }
  ].filter(Boolean);
  const meetings = versus ? versus.meetings.slice(-3) : [];
  return /* @__PURE__ */ React21.createElement("span", { className: "fd-pass-season", ref: bodyRef }, /* @__PURE__ */ React21.createElement("span", { className: "fd-pass-top" }, /* @__PURE__ */ React21.createElement("span", null, name), /* @__PURE__ */ React21.createElement("span", null, "FIELD DAY / ", EDITION.year)), /* @__PURE__ */ React21.createElement("span", { className: "fd-pass-season-head" }, /* @__PURE__ */ React21.createElement("span", { className: "fd-pass-season-title" }, number == null ? "Player card" : `Player ${number}`), number != null && /* @__PURE__ */ React21.createElement("span", { className: "fd-pass-season-ghost" }, String(number).padStart(2, "0"))), versus && /* @__PURE__ */ React21.createElement("span", { className: "fd-pass-box fd-pass-row", style: order() }, /* @__PURE__ */ React21.createElement("span", { className: "fd-pass-box-head" }, /* @__PURE__ */ React21.createElement("span", null, "You vs ", name), /* @__PURE__ */ React21.createElement("strong", null, recordText(versus))), meetings.map((meeting, at) => /* @__PURE__ */ React21.createElement("span", { className: "fd-pass-line", key: `${meeting.eventId}-${at}` }, /* @__PURE__ */ React21.createElement("span", null, meeting.label === meeting.event ? meeting.event : `${meeting.event} \xB7 ${meeting.label}`), /* @__PURE__ */ React21.createElement("strong", null, meeting.won ? "You" : name))), versus.duels.won + versus.duels.lost + versus.duels.push > 0 && /* @__PURE__ */ React21.createElement("span", { className: "fd-pass-line" }, /* @__PURE__ */ React21.createElement("span", null, "Quick Draw"), /* @__PURE__ */ React21.createElement("strong", null, recordText(versus.duels))), versus.bets.won + versus.bets.lost > 0 && /* @__PURE__ */ React21.createElement("span", { className: "fd-pass-line" }, /* @__PURE__ */ React21.createElement("span", null, "Your bets on ", name), /* @__PURE__ */ React21.createElement("strong", null, signedChips(versus.bets.net)))), events.length > 0 && /* @__PURE__ */ React21.createElement("span", { className: "fd-pass-table" }, /* @__PURE__ */ React21.createElement("span", { className: "fd-pass-table-head fd-pass-row", style: order() }, /* @__PURE__ */ React21.createElement("span", null, "Event"), /* @__PURE__ */ React21.createElement("span", null, "Place"), /* @__PURE__ */ React21.createElement("span", null, "Chips")), events.map((row) => /* @__PURE__ */ React21.createElement("span", { key: row.id, className: `fd-pass-table-row fd-pass-row is-${row.status}`, style: order() }, /* @__PURE__ */ React21.createElement("span", null, row.name), /* @__PURE__ */ React21.createElement("strong", null, row.place), /* @__PURE__ */ React21.createElement("span", null, awardText(row))))), totals.length > 0 && /* @__PURE__ */ React21.createElement("span", { className: "fd-pass-totals fd-pass-row", style: order() }, totals.map((item) => /* @__PURE__ */ React21.createElement("span", { key: item.key }, /* @__PURE__ */ React21.createElement("strong", null, item.value), /* @__PURE__ */ React21.createElement("small", null, item.label)))), rivals.length > 0 && /* @__PURE__ */ React21.createElement("span", { className: "fd-pass-box fd-pass-row", style: order() }, /* @__PURE__ */ React21.createElement("span", { className: "fd-pass-box-head" }, /* @__PURE__ */ React21.createElement("span", null, "Rivalries")), rivals.map((record) => /* @__PURE__ */ React21.createElement("span", { className: "fd-pass-line", key: record.other }, /* @__PURE__ */ React21.createElement("span", null, "vs ", disp(state, record.other)), /* @__PURE__ */ React21.createElement("strong", null, recordText(record))))), walkout && /* @__PURE__ */ React21.createElement("span", { className: "fd-pass-line fd-pass-walkout fd-pass-row", style: order() }, /* @__PURE__ */ React21.createElement("span", null, "Win song"), /* @__PURE__ */ React21.createElement("strong", null, walkout)));
}
var fmt3, awardText;
var init_PlayerPass = __esm({
  "src/features/profile/PlayerPass.jsx"() {
    init_core();
    init_ChipCoin();
    init_PlayerIdentityContext();
    init_motion2();
    init_motion();
    init_useRisoTilt();
    init_seasonStats();
    init_player_pass();
    fmt3 = (n) => (n ?? 0).toLocaleString("en-US");
    awardText = (row) => row.award === null || row.award === void 0 ? row.status === "playing" ? "Playing" : "\u2013" : row.award > 0 ? signedChips(row.award) : "0";
  }
});

// src/features/check-in/install.js
var installEvt, onInstallReady, isIOS2;
var init_install = __esm({
  "src/features/check-in/install.js"() {
    installEvt = null;
    onInstallReady = () => {
      throw new Error("onInstallReady is unavailable in the isolated preview");
    };
    isIOS2 = () => {
      throw new Error("isIOS is unavailable in the isolated preview");
    };
  }
});

// src/features/travel/travel.css
var init_travel = __esm({
  "src/features/travel/travel.css"() {
  }
});

// src/features/travel/Travel.jsx
import React30, { useState as useState25 } from "react";
function TravelMap() {
  const arc = (c) => {
    const mx = (c.x + TRAVEL_DEST.x) / 2;
    const lift = 9 + Math.abs(c.x - TRAVEL_DEST.x) * 0.3;
    return `M${c.x} ${c.y} Q${mx} ${Math.min(c.y, TRAVEL_DEST.y) - lift} ${TRAVEL_DEST.x} ${TRAVEL_DEST.y}`;
  };
  return /* @__PURE__ */ React30.createElement(
    "svg",
    {
      viewBox: "-5 -3 110 104",
      width: "100%",
      height: "100%",
      preserveAspectRatio: "xMidYMid meet",
      "aria-hidden": "true",
      style: { display: "block", overflow: "hidden", maxWidth: "100%", maxHeight: "100%" }
    },
    /* @__PURE__ */ React30.createElement("g", { style: { animation: "si-fade .8s ease-out both" } }, US_DOTS.map(([x, y], i) => /* @__PURE__ */ React30.createElement("circle", { key: i, cx: x, cy: y, r: "0.62", fill: "var(--muted)", opacity: "0.45" }))),
    TRAVEL_CITIES.map((c, i) => /* @__PURE__ */ React30.createElement(
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
    TRAVEL_CITIES.map((c, i) => /* @__PURE__ */ React30.createElement(
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
      /* @__PURE__ */ React30.createElement("set", { attributeName: "opacity", to: "1", begin: `${1.2 + i * 0.18}s` }),
      /* @__PURE__ */ React30.createElement("animateMotion", { dur: "3.6s", begin: `${1.2 + i * 0.18}s`, repeatCount: "indefinite", path: arc(c) })
    )),
    TRAVEL_CITIES.map((c, i) => /* @__PURE__ */ React30.createElement("g", { key: c.n, style: { animation: `si-in .4s ease-out ${i * 0.18}s both` } }, /* @__PURE__ */ React30.createElement("circle", { cx: c.x, cy: c.y, r: "1.9", fill: "var(--paper)", stroke: "var(--bone)", strokeWidth: "0.9" }), /* @__PURE__ */ React30.createElement(
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
    /* @__PURE__ */ React30.createElement(
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
    /* @__PURE__ */ React30.createElement("circle", { cx: TRAVEL_DEST.x, cy: TRAVEL_DEST.y, r: "2.8", fill: "var(--sun)", stroke: "var(--ink0)", strokeWidth: "0.8" }),
    /* @__PURE__ */ React30.createElement(
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
  return /* @__PURE__ */ React30.createElement("div", { style: { position: "relative", aspectRatio: "16 / 9", background: "var(--paper2)", overflow: "hidden" } }, /* @__PURE__ */ React30.createElement(
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
  return /* @__PURE__ */ React30.createElement("div", { style: {
    flex: 1,
    minWidth: 0,
    padding: "11px 14px",
    borderLeft: first ? "none" : "1px solid var(--line)"
  } }, /* @__PURE__ */ React30.createElement("div", { style: { ...label, fontSize: 10, marginBottom: 4 } }, lb), /* @__PURE__ */ React30.createElement("div", { style: {
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
  return /* @__PURE__ */ React30.createElement("div", null, /* @__PURE__ */ React30.createElement("div", { style: CARD }, !compact && /* @__PURE__ */ React30.createElement(HouseArt, null), /* @__PURE__ */ React30.createElement("div", { style: { padding: "12px 14px", borderTop: compact ? void 0 : "1px solid var(--line)" } }, /* @__PURE__ */ React30.createElement("div", { style: { ...label, marginBottom: 5 } }, "The house"), lg.venue && /* @__PURE__ */ React30.createElement("div", { style: {
    fontFamily: SANS,
    fontWeight: 600,
    fontSize: 15.5,
    lineHeight: 1.45,
    userSelect: "text",
    color: "var(--ink)"
  } }, lg.venue), lg.venueNote && /* @__PURE__ */ React30.createElement("div", { style: {
    fontFamily: SANS,
    fontSize: 13,
    color: "var(--muted2)",
    marginTop: 5,
    lineHeight: 1.5
  } }, lg.venueNote), mapUrl && /* @__PURE__ */ React30.createElement(
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
  )), (lg.checkIn || lg.checkOut) && /* @__PURE__ */ React30.createElement("div", { style: { display: "flex", borderTop: "1px solid var(--line)" } }, /* @__PURE__ */ React30.createElement(InfoCell, { lb: "Check in", v: lg.checkIn || "TBD", first: true }), /* @__PURE__ */ React30.createElement(InfoCell, { lb: "Checkout", v: lg.checkOut || "TBD" }))), (lg.airport || hostLegs.length > 0) && /* @__PURE__ */ React30.createElement("div", { style: CARD }, lg.airport && /* @__PURE__ */ React30.createElement("div", { style: { display: "flex", alignItems: "center", gap: 14, padding: "12px 14px" } }, /* @__PURE__ */ React30.createElement(
    "svg",
    {
      width: "20",
      height: "20",
      viewBox: "0 0 24 24",
      fill: "var(--accent2)",
      "aria-hidden": "true",
      style: { flexShrink: 0 }
    },
    /* @__PURE__ */ React30.createElement("path", { d: "M2 4 22 12 2 20l4.6-8z" })
  ), /* @__PURE__ */ React30.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React30.createElement("div", { style: { ...label, fontSize: 10, marginBottom: 3 } }, "Fly into"), /* @__PURE__ */ React30.createElement("div", { style: { fontFamily: SANS, fontSize: 13, color: "var(--muted2)" } }, lg.airportName)), /* @__PURE__ */ React30.createElement("div", { style: {
    fontFamily: DISPLAY,
    fontWeight: 700,
    fontSize: 30,
    letterSpacing: "0.06em",
    color: "var(--signal-text, var(--sun))",
    lineHeight: 1
  } }, lg.airport)), hostLegs.length > 0 && /* the flight codes matter to nobody but Brandon; the times are how
     people work out who they are sharing a ride with */
  /* @__PURE__ */ React30.createElement("div", { style: { borderTop: lg.airport ? "1px solid var(--line)" : "none" } }, /* @__PURE__ */ React30.createElement("div", { style: { ...label, fontSize: 10, padding: "10px 14px 0" } }, "My flights"), /* @__PURE__ */ React30.createElement("div", { style: { display: "flex" } }, hostLegs.map(([lb, v], i) => /* @__PURE__ */ React30.createElement(InfoCell, { key: lb, lb, v, first: i === 0 }))))));
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
  return /* @__PURE__ */ React30.createElement("div", { className: "fd-flight-entry-wrap" }, /* @__PURE__ */ React30.createElement("div", { className: "fd-flight-entry" }, /* @__PURE__ */ React30.createElement("div", { style: { minWidth: 0 } }, /* @__PURE__ */ React30.createElement("div", { style: box }, /* @__PURE__ */ React30.createElement(
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
  )), /* @__PURE__ */ React30.createElement("div", { style: cap }, "Airline")), /* @__PURE__ */ React30.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React30.createElement("div", { style: box }, /* @__PURE__ */ React30.createElement(
    "input",
    {
      value: leg.num || "",
      inputMode: "numeric",
      placeholder: "1885",
      "aria-label": "Flight number",
      onChange: (e) => set({ num: e.target.value.replace(/\D/g, "").slice(0, 4) }),
      style: { ...bare, fontFamily: SANS, fontWeight: 700, fontSize: 16 }
    }
  )), /* @__PURE__ */ React30.createElement("div", { style: cap }, "Flight no.")), /* @__PURE__ */ React30.createElement("div", { className: "fd-flight-time", style: { minWidth: 0 } }, /* @__PURE__ */ React30.createElement("div", { style: box }, /* @__PURE__ */ React30.createElement(
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
  )), /* @__PURE__ */ React30.createElement("div", { style: cap }, dir === "out" ? "Takes off" : "Lands"))));
}
function FlightPass({ leg: raw, dir, small, edit, setLeg }) {
  if (edit) return /* @__PURE__ */ React30.createElement(FlightEntry, { leg: raw, dir, setLeg });
  const leg = cleanLeg(raw);
  if (!leg) return null;
  if (leg.note) return /* @__PURE__ */ React30.createElement("div", { style: {
    fontFamily: SANS,
    fontWeight: 600,
    fontSize: small ? 12.5 : 13.5,
    color: "var(--ink)",
    lineHeight: 1.5
  } }, leg.note);
  const t = legTime(leg.time);
  const numSize = small ? 19 : 22;
  return /* @__PURE__ */ React30.createElement("div", { style: {
    display: "flex",
    alignItems: "center",
    gap: small ? 10 : 11,
    background: "var(--paper2)",
    border: "1px solid var(--line)",
    borderRadius: 10,
    padding: small ? "9px 11px" : "11px 13px"
  } }, /* @__PURE__ */ React30.createElement(
    "svg",
    {
      width: small ? 14 : 16,
      height: small ? 14 : 16,
      viewBox: "0 0 24 24",
      fill: "var(--muted)",
      "aria-hidden": "true",
      style: { flexShrink: 0 }
    },
    /* @__PURE__ */ React30.createElement("path", { d: "M2 4 22 12 2 20l4.6-8z" })
  ), /* @__PURE__ */ React30.createElement("div", { style: { display: "flex", alignItems: "baseline", gap: 7, flex: 1, minWidth: 0 } }, /* @__PURE__ */ React30.createElement("span", { style: {
    fontFamily: SANS,
    fontWeight: 700,
    fontSize: small ? 11 : 12,
    letterSpacing: "0.14em",
    color: "var(--accent2)"
  } }, leg.air || "\xB7\xB7"), /* @__PURE__ */ React30.createElement("span", { style: {
    fontFamily: DISPLAY,
    fontWeight: 700,
    fontSize: numSize,
    color: "var(--ink)",
    lineHeight: 1
  } }, leg.num || "\u2014")), /* @__PURE__ */ React30.createElement("div", { style: {
    flexShrink: 0,
    borderLeft: "1px dashed var(--line)",
    paddingLeft: small ? 10 : 12,
    textAlign: "right"
  } }, /* @__PURE__ */ React30.createElement("div", { style: {
    fontFamily: DISPLAY,
    fontWeight: 700,
    fontSize: small ? 16 : 19,
    lineHeight: 1.05,
    color: t ? "var(--signal-text, var(--sun))" : "var(--muted)"
  } }, t || "\u2014"), /* @__PURE__ */ React30.createElement("div", { style: {
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
  return /* @__PURE__ */ React30.createElement("div", { style: { marginBottom: 12 } }, /* @__PURE__ */ React30.createElement("div", { style: { display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 } }, /* @__PURE__ */ React30.createElement("span", { style: label }, lb), filled && /* @__PURE__ */ React30.createElement("button", { onClick: () => setLeg(null), style: {
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
  } }, "Clear")), /* @__PURE__ */ React30.createElement(FlightPass, { leg, dir, edit: true, setLeg }));
}
function TravelLists() {
  return /* @__PURE__ */ React30.createElement("datalist", { id: "fd-airlines" }, AIRLINES.map((a) => /* @__PURE__ */ React30.createElement("option", { key: a, value: a })));
}
function SizeRow({ lb, value, onPick, allowClear }) {
  return /* @__PURE__ */ React30.createElement("div", { style: { marginBottom: 12 } }, /* @__PURE__ */ React30.createElement("div", { style: { ...label, marginBottom: 6 } }, lb), /* @__PURE__ */ React30.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 5 } }, SIZES.map((sz) => /* @__PURE__ */ React30.createElement(
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
  return /* @__PURE__ */ React30.createElement("div", null, /* @__PURE__ */ React30.createElement(TravelLists, null), /* @__PURE__ */ React30.createElement("div", { style: {
    fontFamily: SANS,
    fontWeight: 600,
    fontSize: 15,
    color: "var(--ink)",
    marginBottom: 8
  } }, "Booked your flights?"), /* @__PURE__ */ React30.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 14 } }, /* @__PURE__ */ React30.createElement("button", { onClick: () => setBooked(true), "aria-pressed": booked === true, style: opt(booked === true) }, "Yes"), /* @__PURE__ */ React30.createElement(
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
  )), booked === true && /* @__PURE__ */ React30.createElement(React30.Fragment, null, /* @__PURE__ */ React30.createElement(LegField, { lb: "Landing Friday", dir: "in", leg: flightIn, setLeg: setFlightIn }), /* @__PURE__ */ React30.createElement(LegField, { lb: "Leaving Sunday", dir: "out", leg: flightOut, setLeg: setFlightOut })), booked === false && /* @__PURE__ */ React30.createElement("div", { style: {
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

// src/features/check-in/InstallHint.jsx
import React31, { useEffect as useEffect18, useState as useState26 } from "react";
function InstallHint() {
  const [, bump] = useState26(0);
  useEffect18(() => onInstallReady(() => bump((x) => x + 1)), []);
  if (installEvt) return /* @__PURE__ */ React31.createElement(Btn, { onClick: () => installEvt.prompt(), style: { alignSelf: "flex-start" } }, "Add to home screen");
  if (isIOS2()) return /* @__PURE__ */ React31.createElement("div", null, [["1", "Tap the Share button in Safari"], ["2", "Tap Add to Home Screen"]].map(([n, t]) => /* @__PURE__ */ React31.createElement("div", { key: n, style: { display: "flex", gap: 12, alignItems: "center", padding: "7px 0" } }, /* @__PURE__ */ React31.createElement("span", { style: { fontFamily: DISPLAY, fontWeight: 700, fontSize: 19, color: "var(--accent2)" } }, n), /* @__PURE__ */ React31.createElement("span", { style: { fontFamily: SANS, fontSize: 16, color: "var(--ink)" } }, t))));
  return /* @__PURE__ */ React31.createElement("div", { style: { fontFamily: SANS, fontSize: 16, color: "var(--ink)" } }, "In your browser menu, choose Add to Home Screen.");
}
var init_InstallHint = __esm({
  "src/features/check-in/InstallHint.jsx"() {
    init_controls();
    init_theme();
    init_install();
  }
});

// src/PhotoCropper.jsx
import React40, { useCallback as useCallback3, useEffect as useEffect25, useRef as useRef29, useState as useState35 } from "react";
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
  const dialogRef = useRef29(null);
  const cancelRef = useRef29(null);
  const stageRef = useRef29(null);
  const imageRef = useRef29(null);
  const dragRef = useRef29(null);
  const [image, setImage] = useState35(null);
  const [stageSize, setStageSize] = useState35(0);
  const [view, setView] = useState35({ zoom: 1, x: 0, y: 0 });
  const [status, setStatus] = useState35("loading");
  const [error, setError] = useState35("");
  const diameter = Math.max(0, stageSize - 32);
  useEffect25(() => {
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
  useEffect25(() => {
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
  useEffect25(() => {
    setView((current) => fit(current, image, diameter));
  }, [image, diameter]);
  useEffect25(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cancelRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, []);
  const updateZoom = useCallback3((nextZoom) => {
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
  const moveBy = useCallback3((dx, dy) => {
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
      const context2 = canvas.getContext("2d");
      const coverScale2 = Math.max(diameter / image.width, diameter / image.height);
      const scale = coverScale2 * view.zoom;
      const sourceSize = diameter / scale;
      const sourceX = image.width / 2 - view.x / scale - sourceSize / 2;
      const sourceY = image.height / 2 - view.y / scale - sourceSize / 2;
      context2.imageSmoothingEnabled = true;
      context2.imageSmoothingQuality = "high";
      context2.fillStyle = "#241B12";
      context2.fillRect(0, 0, size, size);
      context2.drawImage(
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
      setError("That photo could not be cropped. Choose another image.");
    }
  };
  const coverScale = image && diameter ? Math.max(diameter / image.width, diameter / image.height) : 0;
  const renderedWidth = image ? image.width * coverScale * view.zoom : 0;
  const renderedHeight = image ? image.height * coverScale * view.zoom : 0;
  return /* @__PURE__ */ React40.createElement("div", { className: "fd-crop-overlay", role: "presentation" }, /* @__PURE__ */ React40.createElement("style", null, `
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
      `), /* @__PURE__ */ React40.createElement(
    "section",
    {
      ref: dialogRef,
      className: "fd-crop-dialog",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "fd-crop-title",
      onKeyDown: onDialogKeyDown
    },
    /* @__PURE__ */ React40.createElement("header", { className: "fd-crop-header" }, /* @__PURE__ */ React40.createElement("div", null, /* @__PURE__ */ React40.createElement("h2", { id: "fd-crop-title", className: "fd-crop-title" }, "Frame your photo")), /* @__PURE__ */ React40.createElement(
      "button",
      {
        ref: cancelRef,
        type: "button",
        className: "fd-crop-close",
        "aria-label": "Cancel photo crop",
        onClick: onCancel
      },
      /* @__PURE__ */ React40.createElement("span", { "aria-hidden": "true" }, "\xD7")
    )),
    /* @__PURE__ */ React40.createElement(
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
      /* @__PURE__ */ React40.createElement("div", { className: "fd-crop-window" }, status === "ready" && /* @__PURE__ */ React40.createElement(
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
      status !== "ready" && /* @__PURE__ */ React40.createElement("div", { className: "fd-crop-loading", role: "status" }, status === "loading" ? "Opening photo\u2026" : "Photo unavailable")
    ),
    /* @__PURE__ */ React40.createElement("div", { className: "fd-crop-controls" }, /* @__PURE__ */ React40.createElement("div", { className: "fd-crop-zoom-row" }, /* @__PURE__ */ React40.createElement(
      "button",
      {
        type: "button",
        className: "fd-crop-zoom-button",
        "aria-label": "Zoom out",
        disabled: status !== "ready" || view.zoom <= MIN_ZOOM,
        onClick: () => updateZoom(view.zoom - ZOOM_STEP)
      },
      /* @__PURE__ */ React40.createElement("span", { "aria-hidden": "true" }, "\u2212")
    ), /* @__PURE__ */ React40.createElement(
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
    ), /* @__PURE__ */ React40.createElement(
      "button",
      {
        type: "button",
        className: "fd-crop-zoom-button",
        "aria-label": "Zoom in",
        disabled: status !== "ready" || view.zoom >= MAX_ZOOM,
        onClick: () => updateZoom(view.zoom + ZOOM_STEP)
      },
      /* @__PURE__ */ React40.createElement("span", { "aria-hidden": "true" }, "+")
    )), error && /* @__PURE__ */ React40.createElement("p", { className: "fd-crop-error", role: "alert" }, error), /* @__PURE__ */ React40.createElement("div", { className: "fd-crop-actions" }, /* @__PURE__ */ React40.createElement(
      "button",
      {
        type: "button",
        className: "fd-crop-action fd-crop-cancel",
        onClick: onCancel
      },
      "Cancel"
    ), /* @__PURE__ */ React40.createElement(
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

// src/features/profile/ProfileEditor.jsx
import React41, { useEffect as useEffect26, useId as useId2, useRef as useRef30, useState as useState36 } from "react";
function ProfileEditor({ state, me, display, setDisplay, photo, setPhoto, num, setNum, size, setSize, onChip, showSize = true }) {
  const identity = usePlayerIdentity(me);
  const fileRef = useRef30(null);
  const numberErrorId = useId2();
  const [cropSource, setCropSource] = useState36(null);
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
  return /* @__PURE__ */ React41.createElement("div", { className: "fd-profile-editor" }, me && (state.live ? /* @__PURE__ */ React41.createElement("details", { className: "fd-profile-preview" }, /* @__PURE__ */ React41.createElement("summary", null, "Player card preview"), /* @__PURE__ */ React41.createElement(PlayerPass, { state, p: me, display, num, photo, compact: true, mint: true })) : /* @__PURE__ */ React41.createElement(PlayerPass, { state, p: me, display, num, photo, compact: true, mint: true })), /* @__PURE__ */ React41.createElement("div", { className: "fd-profile-controls" }, /* @__PURE__ */ React41.createElement(
    "div",
    {
      "aria-hidden": "true",
      className: "fd-profile-color-rail",
      style: { background: me ? identity.color : "var(--accent)" }
    }
  ), /* @__PURE__ */ React41.createElement("div", { className: "fd-profile-fields" }, /* @__PURE__ */ React41.createElement("div", { className: "fd-profile-photo-row" }, /* @__PURE__ */ React41.createElement(
    "button",
    {
      type: "button",
      onClick: () => fileRef.current?.click(),
      className: "fd-profile-photo-button",
      "aria-label": current ? "Change your photo" : "Add your photo"
    },
    /* @__PURE__ */ React41.createElement(
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
      /* @__PURE__ */ React41.createElement("path", { d: "M3 7h4l2-3h6l2 3h4v13H3z" }),
      /* @__PURE__ */ React41.createElement("circle", { cx: "12", cy: "13", r: "3.5" })
    ),
    /* @__PURE__ */ React41.createElement("span", null, current ? "Change photo" : "Add a photo"),
    /* @__PURE__ */ React41.createElement("span", { "aria-hidden": "true", className: "fd-profile-photo-action" }, current ? "\u2197" : "+")
  ), /* @__PURE__ */ React41.createElement("input", { ref: fileRef, type: "file", accept: "image/*", onChange: onFile, style: { display: "none" } }), cropSource && /* @__PURE__ */ React41.createElement(
    PhotoCropper,
    {
      src: cropSource,
      onCancel: () => setCropSource(null),
      onConfirm: (cropped) => {
        setPhoto(cropped);
        setCropSource(null);
      }
    }
  )), /* @__PURE__ */ React41.createElement("div", { className: "fd-profile-name-row" }, /* @__PURE__ */ React41.createElement("label", { className: "fd-profile-field" }, /* @__PURE__ */ React41.createElement("span", null, "Display name"), /* @__PURE__ */ React41.createElement(
    "input",
    {
      value: display,
      onChange: (e) => setDisplay(e.target.value),
      maxLength: 16,
      "aria-label": "Display name",
      autoComplete: "nickname"
    }
  )), /* @__PURE__ */ React41.createElement("label", { className: "fd-profile-field fd-profile-number-field" }, /* @__PURE__ */ React41.createElement("span", null, "No."), /* @__PURE__ */ React41.createElement(
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
  ))), takenBy && /* @__PURE__ */ React41.createElement("div", { id: numberErrorId, className: "fd-profile-number-error", role: "status" }, disp(state, takenBy[0]), " already has ", Number(num), ".")), onChip && me && /* @__PURE__ */ React41.createElement(ChipPicker, { state, me, onChip, num, embedded: true })), showSize && /* @__PURE__ */ React41.createElement("div", { style: { marginTop: 18 } }, /* @__PURE__ */ React41.createElement(SizeRow, { lb: "T-shirt size", value: size, onPick: setSize, allowClear: true })));
}
function ChipPicker({ state, me, onChip, num, embedded = false }) {
  const mine = state.profiles?.[me] || {};
  const stamp = num !== void 0 && num !== "" && num !== null ? Number(num) : mine.num;
  const owner = (hex) => Object.entries(state.profiles || {}).find(([p, pr]) => pr?.color === hex)?.[0];
  const lateClaim = !!state.live && !mine.color;
  const locked = !!state.live && !lateClaim;
  const { skin: savedSkin } = usePlayerIdentity(me);
  const [draftSkin, setDraftSkin] = useState36(null);
  const skin = lateClaim ? draftSkin || mine.skin || CHIP_SKINS[0] : savedSkin;
  const patterns = /* @__PURE__ */ React41.createElement(
    PatternPicker,
    {
      me,
      skin,
      locked,
      stamp,
      onPick: (sk) => lateClaim ? setDraftSkin(sk) : onChip(void 0, sk)
    }
  );
  const wasLate = useRef30(lateClaim);
  const [justClaimed, setJustClaimed] = useState36(false);
  useEffect26(() => {
    if (wasLate.current && locked) setJustClaimed(true);
    wasLate.current = lateClaim;
  }, [lateClaim, locked]);
  if (locked) return /* @__PURE__ */ React41.createElement("div", { className: "fd-profile-chip-locked" }, /* @__PURE__ */ React41.createElement(ChipCoin, { key: justClaimed ? "minted" : "locked", p: me, size: 48, fallback: stamp, mintOnMount: justClaimed }), /* @__PURE__ */ React41.createElement("div", null, /* @__PURE__ */ React41.createElement("strong", null, CHIP_SKIN_META[skin] || "Classic", " pattern"), /* @__PURE__ */ React41.createElement("p", null, "Chips are locked for the weekend.")));
  return /* @__PURE__ */ React41.createElement("div", { className: "fd-chip-picker", style: {
    background: "var(--paper)",
    border: embedded ? "none" : "1px solid var(--line)",
    borderTop: embedded ? "1px solid var(--line)" : void 0,
    borderRadius: embedded ? 0 : 14,
    padding: embedded ? "14px 12px 13px" : 12
  } }, !embedded && /* @__PURE__ */ React41.createElement("div", { style: { display: "flex", alignItems: "center", gap: 14, marginBottom: 15 } }, /* @__PURE__ */ React41.createElement("div", { style: { position: "relative", width: 80, height: 80, flexShrink: 0, display: "grid", placeItems: "center" } }, /* @__PURE__ */ React41.createElement("span", { "aria-hidden": "true", style: {
    position: "absolute",
    inset: 4,
    borderRadius: "50%",
    background: "var(--sun-tint)",
    border: "1px solid var(--line)"
  } }), /* @__PURE__ */ React41.createElement("div", { style: { position: "relative" } }, /* @__PURE__ */ React41.createElement(ChipFace, { p: me, size: 70, fallback: stamp }))), /* @__PURE__ */ React41.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React41.createElement("div", { style: {
    fontFamily: SANS,
    fontWeight: 700,
    fontSize: 10,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    color: "var(--accent2)",
    marginBottom: 4
  } }, "Chip design"), /* @__PURE__ */ React41.createElement("div", { style: {
    fontFamily: DISPLAY,
    fontWeight: 700,
    fontSize: 26,
    lineHeight: 1,
    textTransform: "uppercase",
    color: "var(--ink)"
  } }, "Your chip"), mine.color && /* @__PURE__ */ React41.createElement("div", { style: { fontFamily: SANS, fontSize: 12.5, color: "var(--muted2)", lineHeight: 1.45, marginTop: 5 } }, CHIP_SKIN_META[skin] || "Classic", " pattern"))), lateClaim && patterns, lateClaim && /* @__PURE__ */ React41.createElement("p", { className: "fd-chip-late-note" }, "Claiming a color locks your chip for the weekend."), /* @__PURE__ */ React41.createElement("div", { style: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 8
  } }, /* @__PURE__ */ React41.createElement("div", { style: { ...label, fontSize: 10 } }, "Color"), !mine.color && /* @__PURE__ */ React41.createElement("div", { style: { fontFamily: SANS, fontSize: 10.5, color: "var(--muted)" } }, "First come, first served")), /* @__PURE__ */ React41.createElement("div", { className: "fd-chip-colors" }, CHIP_COLORS.map((c) => {
    const by = owner(c.hex);
    const isMine = by === me;
    const taken = by && !isMine;
    return /* @__PURE__ */ React41.createElement(
      "button",
      {
        type: "button",
        key: c.hex,
        disabled: taken || locked,
        onClick: () => lateClaim ? onChip(c.hex, skin) : onChip(isMine ? null : c.hex, void 0),
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
      /* @__PURE__ */ React41.createElement("span", { style: {
        position: "relative",
        display: "grid",
        placeItems: "center",
        width: "100%",
        aspectRatio: "1",
        maxWidth: 34,
        borderRadius: "50%",
        background: c.hex,
        border: "1.5px solid var(--bone-line)"
      } }, taken && /* @__PURE__ */ React41.createElement("span", { style: {
        fontFamily: SANS,
        fontWeight: 800,
        fontSize: 8.5,
        color: c.light ? "var(--ink0)" : "var(--bone)"
      } }, (disp(state, by) || "").slice(0, 2).toUpperCase()), isMine && /* @__PURE__ */ React41.createElement(
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
        /* @__PURE__ */ React41.createElement("path", { d: "m3.2 8.3 3 3 6.6-6.6" })
      ))
    );
  })), !lateClaim && patterns);
}
function PatternPicker({ me, skin, locked, stamp, onPick }) {
  return /* @__PURE__ */ React41.createElement(React41.Fragment, null, /* @__PURE__ */ React41.createElement("div", { style: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 8
  } }, /* @__PURE__ */ React41.createElement("div", { style: { ...label, fontSize: 10 } }, "Pattern")), /* @__PURE__ */ React41.createElement("div", { className: "fd-chip-patterns" }, CHIP_SKINS.map((sk) => /* @__PURE__ */ React41.createElement(
    "button",
    {
      type: "button",
      key: sk,
      disabled: locked,
      onClick: () => onPick(sk),
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
    /* @__PURE__ */ React41.createElement(ChipFace, { p: me, size: 42, skin: sk, fallback: stamp }),
    /* @__PURE__ */ React41.createElement("span", { style: {
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
    init_ChipCoin();
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

// src/features/tv/towersModel.js
var TOWER_GEOMETRY, TOWER_TIMING;
var init_towersModel = __esm({
  "src/features/tv/towersModel.js"() {
    init_core();
    TOWER_GEOMETRY = Object.freeze({ radius: 1, chip: 0.2, spacing: 2.9, elevationDeg: 20, maxPxPerUnit: 64 });
    TOWER_TIMING = Object.freeze({
      hold: 300,
      drop: 420,
      stagger: 110,
      lift: 380,
      liftStagger: 60,
      sortDelay: 250,
      sort: 900,
      ring: 600,
      fall: 9
    });
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
import React74, { useEffect as useEffect50, useRef as useRef57, useState as useState61 } from "react";
function InvitationArt() {
  return /* @__PURE__ */ React74.createElement("div", { className: "fd-invitation-art", "aria-label": `Field Day. ${EDITION.name}, ${EDITION.year}.` }, /* @__PURE__ */ React74.createElement("div", { className: "fd-invitation-eyebrow" }, /* @__PURE__ */ React74.createElement("span", null, "YOUR INVITATION"), /* @__PURE__ */ React74.createElement("span", null, EDITION.year)), /* @__PURE__ */ React74.createElement("div", { className: "fd-invitation-wordmark", "aria-hidden": "true" }, /* @__PURE__ */ React74.createElement("span", null, "FIELD"), /* @__PURE__ */ React74.createElement("span", null, "DAY", /* @__PURE__ */ React74.createElement("span", { className: "fd-invitation-period" }, "."))), /* @__PURE__ */ React74.createElement("div", { className: "fd-invitation-seal", "aria-hidden": "true" }, /* @__PURE__ */ React74.createElement("svg", { viewBox: "0 0 100 100" }, /* @__PURE__ */ React74.createElement("path", { d: "M50 1 59 10 72 6 77 19 91 23 90 37 100 50 90 60 94 74 80 79 76 93 62 91 50 100 40 90 26 94 21 80 7 76 9 62 0 50 10 40 6 26 20 21 24 7 38 9Z", fill: "currentColor" })), /* @__PURE__ */ React74.createElement("span", null, /* @__PURE__ */ React74.createElement("strong", null, ROSTER.length), /* @__PURE__ */ React74.createElement("small", null, "PLAYERS"))), /* @__PURE__ */ React74.createElement("div", { className: "fd-invitation-edition" }, /* @__PURE__ */ React74.createElement("span", null, "SCOTTSDALE, AZ"), /* @__PURE__ */ React74.createElement("span", null, EDITION.short, /* @__PURE__ */ React74.createElement("br", null), "2026")));
}
function RatingForm({ ratings, setRatings }) {
  const rated = SPORTS.filter((s) => ratings[s.id] !== void 0).length;
  return /* @__PURE__ */ React74.createElement("div", null, /* @__PURE__ */ React74.createElement("div", { className: "fd-rating-status" }, /* @__PURE__ */ React74.createElement("span", { role: "status" }, rated, " of ", SPORTS.length, " rated"), rated < SPORTS.length && /* @__PURE__ */ React74.createElement(
    "button",
    {
      type: "button",
      className: "fd-text-button",
      onClick: () => setRatings((current) => Object.fromEntries(SPORTS.map((s) => [s.id, current[s.id] ?? 2])))
    },
    "Set remaining to Average"
  )), [["sport", "Sports"], ["drink", "Drinking games"]].map(([group, title]) => /* @__PURE__ */ React74.createElement("div", { className: "fd-rating-group", key: group }, /* @__PURE__ */ React74.createElement("h3", { className: "fd-eyebrow" }, title), /* @__PURE__ */ React74.createElement("div", { className: "fd-rating-labels", "aria-hidden": "true" }, /* @__PURE__ */ React74.createElement("span", null), /* @__PURE__ */ React74.createElement("div", null, ["Never", "Rough", "Avg", "Solid", "Elite"].map((text) => /* @__PURE__ */ React74.createElement("span", { key: text }, text)))), SPORTS.filter((s) => s.group === group).map((s) => /* @__PURE__ */ React74.createElement("div", { className: "fd-rating-row", key: s.id }, /* @__PURE__ */ React74.createElement("div", null, /* @__PURE__ */ React74.createElement("strong", null, s.label), /* @__PURE__ */ React74.createElement("small", null, RATINGS.find((r) => r.v === ratings[s.id])?.label || "Not rated")), /* @__PURE__ */ React74.createElement("div", { className: "fd-rating-options", role: "group", "aria-label": s.label }, RATINGS.map((r, i) => /* @__PURE__ */ React74.createElement(
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
  const [selected, setSelected] = useState61(me || null);
  const [ratings, setRatings] = useState61({});
  const [display, setDisplay] = useState61("");
  const [photo, setPhoto] = useState61(null);
  const [num, setNum] = useState61("");
  const [size, setSize] = useState61(null);
  const [flightsBooked, setFlightsBooked] = useState61(null);
  const [flightIn, setFlightIn] = useState61(null);
  const [flightOut, setFlightOut] = useState61(null);
  const [busy, setBusy] = useState61(false);
  const [error, setError] = useState61("");
  const submit = useRef57(createCheckInSubmission());
  const heading = useRef57(null);
  const hydratedPlayer = useRef57(null);
  useEffect50(() => {
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
  useEffect50(() => {
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
  const title = step === -1 ? "Add Field Day to your home screen" : ["Claim your spot", "The bachelor party is a tournament", "Thank you for flying in for this", "Getting there", "Set up your profile", "Rate yourself"][step];
  const intro = step === -1 ? "" : [
    "",
    `${ROSTER.length} players, ${allEventsOf(state).filter((e) => !e.finale).length} events, one board.`,
    `${ROSTER.length} players coming in from ${TRAVEL_CITIES.length} cities.`,
    "",
    "",
    "Private. Only used to balance teams."
  ][step];
  const canContinue = step === 0 ? !!selected : step === 3 ? !!size && (flightsBooked !== null || !!state.live) : step === 4 ? !!display.trim() && !!state.profiles?.[me]?.color : step === 5 ? SPORTS.every((s) => ratings[s.id] !== void 0) : true;
  const continueLabel = step === -1 ? "Skip, stay in the browser" : step === 0 ? selected ? `Continue as ${selected}` : "Pick your name" : step === 5 ? "Finish check-in" : "Continue";
  const go = () => {
    if (step === 0) return saveAndGo(() => pick(selected));
    if (step === 3) return saveAndGo(() => saveProfile({
      display: (display || me).trim() || me,
      size,
      ...flightsBooked === null ? {} : { flightsBooked, flightIn, flightOut }
    }));
    if (step === 4) return saveAndGo(() => saveProfile({ display: display.trim(), num: num === "" ? null : Number(num), ...photo ? { photo } : {} }));
    if (step === 5) return saveAndGo(() => submitSeeds(ratings), done);
    next();
  };
  return /* @__PURE__ */ React74.createElement("main", { className: "fd-arrival", "aria-busy": busy }, /* @__PURE__ */ React74.createElement("header", { className: "fd-arrival-header" }, /* @__PURE__ */ React74.createElement("span", { className: "fd-eyebrow" }, "FIELD DAY / SCOTTSDALE"), /* @__PURE__ */ React74.createElement("span", { className: "fd-arrival-progress" }, step < 0 ? "WELCOME" : `${String(step + 1).padStart(2, "0")} / 06`), step >= 0 && /* @__PURE__ */ React74.createElement("div", { className: "fd-arrival-progress-track", "aria-label": `Check-in step ${step + 1} of 6: ${STAGES[step]}` }, STAGES.map((stage, i) => /* @__PURE__ */ React74.createElement("span", { key: stage, className: i <= step ? "is-complete" : "" })))), /* @__PURE__ */ React74.createElement("div", { className: `fd-arrival-layout${step <= 0 ? " is-invitation" : ""}` }, /* @__PURE__ */ React74.createElement("aside", { className: "fd-arrival-aside" }, step <= 0 ? /* @__PURE__ */ React74.createElement(InvitationArt, null) : /* @__PURE__ */ React74.createElement("div", { className: "fd-arrival-chapter", "aria-hidden": "true" }, /* @__PURE__ */ React74.createElement("span", { className: "fd-eyebrow" }, "FIELD DAY / ", EDITION.year), /* @__PURE__ */ React74.createElement("strong", null, String(step + 1).padStart(2, "0")), /* @__PURE__ */ React74.createElement("span", { className: "fd-chapter-name" }, STAGES[step]), /* @__PURE__ */ React74.createElement("span", { className: "fd-chapter-date" }, EDITION.long))), /* @__PURE__ */ React74.createElement("section", { className: "fd-arrival-main", key: step }, /* @__PURE__ */ React74.createElement("div", { className: "fd-arrival-heading" }, /* @__PURE__ */ React74.createElement("h1", { ref: heading, tabIndex: -1 }, title), intro && /* @__PURE__ */ React74.createElement("p", null, intro)), /* @__PURE__ */ React74.createElement("fieldset", { className: "fd-arrival-fields", disabled: busy }, step === -1 && /* @__PURE__ */ React74.createElement("div", { className: "fd-install" }, /* @__PURE__ */ React74.createElement(InstallHint, null), /* @__PURE__ */ React74.createElement("p", null, "Open it from your home screen to check in.")), step === 0 && /* @__PURE__ */ React74.createElement("div", { className: "fd-guest-list", role: "group", "aria-label": "Who are you?" }, ROSTER.map((p, i) => /* @__PURE__ */ React74.createElement("button", { type: "button", key: p, onClick: () => setSelected(p), "aria-pressed": selected === p }, /* @__PURE__ */ React74.createElement("span", { className: "fd-guest-index" }, String(i + 1).padStart(2, "0")), /* @__PURE__ */ React74.createElement("span", null, p), /* @__PURE__ */ React74.createElement("span", { className: "fd-guest-check", "aria-hidden": "true" }, selected === p ? "\u2197" : "+")))), step === 1 && /* @__PURE__ */ React74.createElement(React74.Fragment, null, /* @__PURE__ */ React74.createElement("div", { className: "fd-starting-stack" }, /* @__PURE__ */ React74.createElement("span", { className: "fd-eyebrow" }, "EVERYONE STARTS AT"), /* @__PURE__ */ React74.createElement("strong", null, "1,000", /* @__PURE__ */ React74.createElement("span", null, "CHIPS"))), /* @__PURE__ */ React74.createElement("div", { className: "fd-weekend-rules" }, [
    ["01", "Collect chips", "Win events and bets. Whatever you have Saturday night is your poker stack."],
    ["02", "Betting", "Bet on each contest before it starts. Only half your chips can be at risk at one time."],
    ["03", "Duels", "Challenge anyone to Quick Draw for an ante you name. Fastest tap wins both antes."],
    ["04", "The trophy", `The winner of the poker finale is the Field Day champion and takes home the ${EDITION.name} ${EDITION.year} trophy.`]
  ].map(([n, name, body]) => /* @__PURE__ */ React74.createElement("div", { key: n }, /* @__PURE__ */ React74.createElement("span", null, n), /* @__PURE__ */ React74.createElement("div", null, /* @__PURE__ */ React74.createElement("h2", null, name), /* @__PURE__ */ React74.createElement("p", null, body)))))), step === 2 && /* @__PURE__ */ React74.createElement("div", { className: "fd-arrival-map" }, /* @__PURE__ */ React74.createElement(TravelMap, null), /* @__PURE__ */ React74.createElement("div", { className: "fd-destination-note" }, /* @__PURE__ */ React74.createElement("strong", null, "Scottsdale, Arizona"), /* @__PURE__ */ React74.createElement("span", null, EDITION.long))), step === 3 && /* @__PURE__ */ React74.createElement(React74.Fragment, null, /* @__PURE__ */ React74.createElement(VenueCard, { lg: state.logistics || {} }), /* @__PURE__ */ React74.createElement("div", { className: "fd-details-panel" }, /* @__PURE__ */ React74.createElement("h2", null, "Information I need"), /* @__PURE__ */ React74.createElement(TravelFields, { booked: flightsBooked, setBooked: setFlightsBooked, flightIn, setFlightIn, flightOut, setFlightOut }), /* @__PURE__ */ React74.createElement(SizeRow, { lb: "T-shirt size", value: size, onPick: setSize }))), step === 4 && /* @__PURE__ */ React74.createElement(
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
  ), step === 5 && /* @__PURE__ */ React74.createElement(RatingForm, { ratings, setRatings })), /* @__PURE__ */ React74.createElement("footer", { className: "fd-arrival-actions" }, error && /* @__PURE__ */ React74.createElement("p", { className: "fd-save-error", role: "alert" }, error), /* @__PURE__ */ React74.createElement("button", { type: "button", className: "fd-continue", disabled: busy || !canContinue, onClick: go }, /* @__PURE__ */ React74.createElement("span", null, busy ? "Saving\u2026" : continueLabel), /* @__PURE__ */ React74.createElement("span", { "aria-hidden": "true" }, "\u2197")), /* @__PURE__ */ React74.createElement("div", { className: "fd-arrival-links" }, step > 0 && /* @__PURE__ */ React74.createElement("button", { type: "button", className: "fd-text-button", disabled: busy, onClick: back }, "\u2190 Back"), step === 0 && onTv && /* @__PURE__ */ React74.createElement("button", { type: "button", className: "fd-text-button", onClick: onTv, disabled: busy }, "TV mode"), step === 4 && !state.profiles?.[me]?.color && /* @__PURE__ */ React74.createElement("span", null, "Choose a chip color to continue."))))));
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
import React3, { useState as useState4 } from "react";
function HowToSheet({ gameId, variant, ev, onClose }) {
  const game = GAMES[gameId];
  if (!game) return ev?.desc ? /* @__PURE__ */ React3.createElement(Sheet, { title: ev.name, onClose }, /* @__PURE__ */ React3.createElement("article", { className: "fd-weekend-howto" }, /* @__PURE__ */ React3.createElement("p", { className: "fd-weekend-howto-objective" }, ev.desc))) : null;
  return /* @__PURE__ */ React3.createElement(Sheet, { title: game.name, onClose }, /* @__PURE__ */ React3.createElement(GameInstructions, { key: `${gameId}:${variant || ""}`, gameId, game, variant }));
}
function GameInstructions({ gameId, game, variant }) {
  const variants = game.variants || [];
  const [selected, setSelected] = useState4(() => variants.some((item) => item.id === variant) ? variant : variants[0]?.id);
  const howto = variants.length ? variants.find((item) => item.id === selected)?.howto : game.howto;
  if (!howto) return null;
  return /* @__PURE__ */ React3.createElement("article", { className: "fd-weekend-howto" }, !!variants.length && /* @__PURE__ */ React3.createElement("div", { className: "fd-weekend-howto-variants", role: "group", "aria-label": `${game.name} format` }, variants.map((item) => /* @__PURE__ */ React3.createElement(
    "button",
    {
      type: "button",
      key: item.id,
      "aria-pressed": selected === item.id,
      onClick: () => setSelected(item.id)
    },
    item.label
  ))), howto.objective && /* @__PURE__ */ React3.createElement("p", { className: "fd-weekend-howto-objective" }, howto.objective), /* @__PURE__ */ React3.createElement("div", { className: "fd-weekend-howto-equipment" }, howto.players && /* @__PURE__ */ React3.createElement(Tag, { tone: "gold" }, howto.players), (howto.gear || []).map((item) => /* @__PURE__ */ React3.createElement(Tag, { key: item }, item))), /* @__PURE__ */ React3.createElement("section", { className: "fd-weekend-howto-steps", "aria-label": "How to play" }, /* @__PURE__ */ React3.createElement("ol", null, (howto.steps || []).map((step, index) => /* @__PURE__ */ React3.createElement("li", { key: index }, /* @__PURE__ */ React3.createElement("span", { "aria-hidden": "true" }, String(index + 1).padStart(2, "0")), /* @__PURE__ */ React3.createElement("p", null, step))))), howto.win && /* @__PURE__ */ React3.createElement("section", { className: "fd-weekend-howto-win", "aria-labelledby": `fd-howto-win-${gameId}` }, /* @__PURE__ */ React3.createElement("h3", { id: `fd-howto-win-${gameId}` }, "To win"), /* @__PURE__ */ React3.createElement("p", null, howto.win)), howto.house && /* @__PURE__ */ React3.createElement("aside", { className: "fd-weekend-howto-house" }, /* @__PURE__ */ React3.createElement("h3", null, "House rule"), /* @__PURE__ */ React3.createElement("p", null, howto.house)));
}

// src/features/weekend/ContestPanel.jsx
init_core();
import React6, { useEffect as useEffect5, useRef as useRef4, useState as useState6 } from "react";

// shared/show.js
init_core();

// shared/prompts.js
init_core();
var PROMPT_KINDS = Object.freeze(["awards"]);
var PROMPT_SOURCES = Object.freeze(["mvps"]);
var PROMPT_RESULTS_WINDOW_MS = 12 * 60 * 60 * 1e3;

// shared/mvp.js
init_core();
var MVP_HOW = Object.freeze(["votes", "tie", "none"]);

// shared/show.js
var SHOW_TERMINAL_OUTCOMES = Object.freeze(["completed", "skipped", "cancelled"]);
var SHOW_SCENE_DEFINITIONS = Object.freeze({
  opening: Object.freeze({
    label: "Opening",
    intensity: "major",
    steps: Object.freeze(["title", "room"])
  }),
  /* one step: the intro says its piece and the next official write (lock
     and start, the next announcement) retires it, so an announcement never
     costs the host a Continue. Stored scenes from the two-step era clamp to
     this step. */
  "event-intro": Object.freeze({
    label: "Event intro",
    intensity: "normal",
    requiresEvent: true,
    steps: Object.freeze(["title"])
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
  /* the crown, then (D3) the class photo: all thirteen in final order.
     The second step is the commissioner's to take; the champion holds
     until then. A one-step record from before reads as the first step. */
  champion: Object.freeze({
    label: "Champion",
    intensity: "major",
    requiresFrozen: true,
    steps: Object.freeze(["champion", "class"])
  })
});
var REPLAY_WINDOW_MS = 15 * 60 * 1e3;
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
function postedFinalUndo(state, ev) {
  const op = state.eventOps?.[ev?.id];
  const last = op?.lastContest, result = state.results?.[ev?.id];
  if (!last || !result || last.postedRevision === void 0 || last.postedRevision === null) return null;
  if (Number(result.revision || 1) !== Number(last.postedRevision))
    return {
      enabled: false,
      blocker: "The result was corrected",
      contestId: last.id,
      contestRevision: Number(op.contestRevision || 0),
      refunds: [],
      voidIds: []
    };
  const probe = { ...state, results: { ...state.results } };
  delete probe.results[ev.id];
  return contestUndoAvailability(probe, ev);
}
var SKIPPABLE_PHASES = Object.freeze(["scheduled", "setup", "draw-pending", "draw-revealed", "betting-open"]);

// src/features/weekend/ContestPanel.jsx
init_PlayerIdentity();

// src/features/weekend/CompetitionBracket.jsx
init_core();
init_PlayerIdentity();
import React5, { useEffect as useEffect4, useRef as useRef3 } from "react";
function bracketLayout(bracket) {
  const rounds = bracket?.rounds || [];
  const centers = rounds.map((round) => round.map(() => null));
  const at = { cursor: 0 };
  const last = rounds.length - 1;
  if (last >= 0) rounds[last].forEach((_, m) => placeTree(rounds, centers, last, m, at));
  rounds.forEach((round, r) => round.forEach((_, m) => {
    if (centers[r][m] === null) {
      centers[r][m] = at.cursor + 0.5;
      at.cursor += 1;
    }
  }));
  return { centers, units: Math.max(at.cursor, 1) };
}
function placeTree(rounds, centers, r, m, at) {
  const match = rounds[r]?.[m];
  if (!match) return at.cursor;
  const side = (slot) => {
    if (slot?.w) return placeTree(rounds, centers, slot.w[0], slot.w[1], at);
    const center2 = at.cursor + 0.25;
    at.cursor += 0.5;
    return center2;
  };
  const leaf = !match.a?.w && !match.b?.w;
  let center;
  if (leaf) {
    center = at.cursor + 0.5;
    at.cursor += 1;
  } else center = (side(match.a) + side(match.b)) / 2;
  centers[r][m] = center;
  return center;
}
var SIZES2 = {
  full: { head: 22, row: 48, gap: 14, minCol: 210, colGap: 34 },
  compact: { head: 0, row: 28, gap: 10, minCol: 0, colGap: 18 },
  /* a field past eight: the same picture at a glance, tighter rows */
  compactTall: { head: 0, row: 22, gap: 6, minCol: 0, colGap: 14 }
};
var COMPACT_ROUNDS = { Quarterfinals: "Quarters", Semifinals: "Semis" };
var statusOf = (contest, isCurrent) => !isCurrent ? null : contest.phase === "in-progress" ? "Playing" : contest.phase === "betting-open" ? "Betting open" : contest.phase === "awaiting-result" ? "Awaiting result" : "Up next";
function CompetitionBracket({ state, ev, me, gm = false, onPick, onPlayer, size = "md", hot, pending = false, pickable = true }) {
  const bracket = state.brackets?.[ev.id], draw = state.draws?.[ev.id];
  const scroller = useRef3(null);
  const compact = size === "compact";
  const contest = bracket && draw ? resolveCurrentContest(state, ev) : null;
  const active = contest?.kind === "match" ? contest.match : null;
  useEffect4(() => {
    const el = scroller.current;
    if (!el || compact || !active || el.scrollWidth <= el.clientWidth) return;
    const card = el.querySelector(".fd-bracket-match.is-current");
    if (card) el.scrollLeft = Math.max(0, card.offsetLeft - (el.clientWidth - card.offsetWidth) / 2);
  }, [compact, active?.[0], active?.[1]]);
  if (!bracket || !draw) return null;
  const rounds = bracket.rounds;
  const R = rounds.length;
  const { centers, units } = bracketLayout(bracket);
  const dims = SIZES2[!compact ? "full" : R >= 4 ? "compactTall" : "compact"];
  const cardH = dims.head + dims.row * 2 + 1 + 2;
  const unit = cardH + dims.gap;
  const height = Math.ceil(units * unit);
  const colW = `((100% - ${(R - 1) * dims.colGap}px) / ${R})`;
  const colLeft = (r) => `calc(${colW} * ${r} + ${r * dims.colGap}px)`;
  const topOf = (r, m) => centers[r][m] * unit - cardH / 2;
  const rowY = (r, m, index) => topOf(r, m) + 1 + dims.head + dims.row / 2 + index * (dims.row + 1);
  const canRecord = pickable && gm && !!onPick && contest?.phase === "in-progress" && !state.frozen && !state.results?.[ev.id] && !state.poker && !state.shelved?.[ev.id];
  const names = ROUND_NAMES[bracket.size] || [];
  const connectors = [];
  rounds.forEach((round, r) => round.forEach((match, m) => [match.a, match.b].forEach((slot, index) => {
    if (!slot?.w) return;
    const [fr, fm] = slot.w;
    const y1 = centers[fr][fm] * unit, y2 = rowY(r, m, index);
    const top = Math.min(y1, y2) - 1, h = Math.abs(y2 - y1) + 2;
    const decided3 = rounds[fr][fm].winner !== null && rounds[fr][fm].winner !== void 0;
    const a = (y1 - top) / h * 100, b = (y2 - top) / h * 100;
    connectors.push(/* @__PURE__ */ React5.createElement(
      "svg",
      {
        key: `${r}-${m}-${index}`,
        className: `fd-bracket-line${decided3 ? " is-advanced" : ""}`,
        "aria-hidden": "true",
        viewBox: "0 0 100 100",
        preserveAspectRatio: "none",
        style: { left: `calc(${colLeft(fr)} + ${colW})`, width: dims.colGap, top, height: h }
      },
      /* @__PURE__ */ React5.createElement("path", { d: `M0 ${a} H50 V${b} H100`, vectorEffect: "non-scaling-stroke" })
    ));
  })));
  const stage = /* @__PURE__ */ React5.createElement("div", { className: "fd-bracket-stage", style: {
    height,
    minWidth: compact ? 0 : R * dims.minCol + (R - 1) * dims.colGap
  } }, connectors, rounds.map((round, r) => round.map((match, m) => {
    const sides = [resolveSlot(bracket, match.a), resolveSlot(bracket, match.b)];
    const isCurrent = active?.[0] === r && active?.[1] === m;
    const highlighted = isCurrent || hot?.[0] === r && hot?.[1] === m;
    const decided3 = match.winner !== null && match.winner !== void 0;
    const status = statusOf(contest, isCurrent);
    return /* @__PURE__ */ React5.createElement(
      "div",
      {
        key: `${r}-${m}`,
        className: `fd-bracket-match${highlighted ? " is-current" : ""}${decided3 ? " is-decided" : ""}`,
        style: { left: colLeft(r), width: `calc(${colW})`, top: topOf(r, m), height: cardH },
        "aria-label": `${names[r] || `Round ${r + 1}`}, match ${m + 1}${status ? `, ${status.toLowerCase()}` : ""}`
      },
      !compact && /* @__PURE__ */ React5.createElement("div", { className: "fd-bracket-match-label" }, /* @__PURE__ */ React5.createElement("span", null, bracketMatchName(bracket, r, m)), status && /* @__PURE__ */ React5.createElement("strong", null, status)),
      sides.map((key, index) => {
        const team = key === null || key === void 0 ? null : draw.teams[key];
        const won = decided3 && match.winner === key, lost = decided3 && !!team && !won;
        const name = team ? teamLabel(state, team) : "TBD";
        const fullName = team?.players.map((player) => disp(state, player)).join(" & ");
        const mine = !!team?.players.includes(me);
        const className = `fd-bracket-team${won ? " is-winner" : ""}${lost ? " is-loser" : ""}${mine ? " is-you" : ""}${team ? "" : " is-empty"}`;
        if (compact) return /* @__PURE__ */ React5.createElement("div", { key: index, className }, team && /* @__PURE__ */ React5.createElement("span", { className: "fd-bracket-faces", "aria-hidden": "true" }, team.players.slice(0, 3).map((player) => /* @__PURE__ */ React5.createElement(Avatar, { key: player, state, p: player, size: 20 }))), /* @__PURE__ */ React5.createElement("span", { className: "fd-bracket-name" }, name), won && /* @__PURE__ */ React5.createElement("span", { className: "fd-bracket-outcome", "aria-hidden": "true" }, "\u2713"));
        const selectable = canRecord && isCurrent && !decided3 && sides.every((side) => side !== null && side !== void 0);
        return /* @__PURE__ */ React5.createElement("div", { key: index, className }, team && /* @__PURE__ */ React5.createElement("div", { className: "fd-bracket-players" }, team.players.map((player) => /* @__PURE__ */ React5.createElement(
          "button",
          {
            key: player,
            type: "button",
            "aria-label": `View ${disp(state, player)}'s player card`,
            disabled: pending || !onPlayer,
            onClick: () => onPlayer?.(player)
          },
          /* @__PURE__ */ React5.createElement(Avatar, { state, p: player, size: 26 })
        ))), /* @__PURE__ */ React5.createElement(
          "button",
          {
            type: "button",
            className: "fd-bracket-pick",
            disabled: !selectable || pending,
            "aria-label": selectable ? `Winner: ${fullName}` : `${fullName || "To be determined"}${won ? ", winner" : ""}`,
            onClick: () => selectable && onPick(r, m, key)
          },
          /* @__PURE__ */ React5.createElement("span", { className: "fd-bracket-name" }, name),
          won && /* @__PURE__ */ React5.createElement("span", { className: "fd-bracket-outcome", "aria-hidden": "true" }, "\u2713"),
          selectable && /* @__PURE__ */ React5.createElement("span", { className: "fd-bracket-pick-hint" }, pending ? "Saving\u2026" : "Win")
        ));
      })
    );
  })));
  const heads = /* @__PURE__ */ React5.createElement("div", { className: "fd-bracket-heads", style: { minWidth: compact ? 0 : R * dims.minCol + (R - 1) * dims.colGap } }, rounds.map((_, r) => /* @__PURE__ */ React5.createElement("span", { key: r, style: { left: colLeft(r), width: `calc(${colW})` } }, compact && R >= 4 && COMPACT_ROUNDS[names[r]] || names[r] || `Round ${r + 1}`)));
  if (compact) return /* @__PURE__ */ React5.createElement("div", { className: "fd-competition-bracket is-compact", "aria-hidden": "true" }, /* @__PURE__ */ React5.createElement("div", { className: "fd-bracket-scroll" }, heads, stage));
  return /* @__PURE__ */ React5.createElement("section", { className: "fd-competition-bracket", "aria-label": `${ev.name} bracket`, "aria-busy": pending }, /* @__PURE__ */ React5.createElement("div", { className: "fd-bracket-scroll", ref: scroller }, heads, stage));
}
function BracketPeek({ state, ev, me, onOpen, label: label2 = "Bracket", card = false }) {
  if (!state.brackets?.[ev?.id] || !state.draws?.[ev.id]) return null;
  return /* @__PURE__ */ React5.createElement(
    "button",
    {
      type: "button",
      className: `fd-bracket-peek${card ? " is-card" : ""}`,
      onClick: () => onOpen(ev),
      "aria-label": `Open the full ${ev.name} bracket`
    },
    /* @__PURE__ */ React5.createElement("span", { className: "fd-bracket-peek-head" }, /* @__PURE__ */ React5.createElement("span", null, label2), /* @__PURE__ */ React5.createElement("span", null, "Full bracket ", /* @__PURE__ */ React5.createElement("span", { "aria-hidden": "true" }, "\u2197"))),
    /* @__PURE__ */ React5.createElement(CompetitionBracket, { state, ev, me, size: "compact" })
  );
}

// src/features/director/directorPill.js
init_core();
function contestIsFinal(state, ev, contest) {
  if (!contest) return false;
  if (contest.kind === "stage-final") return true;
  if (contest.kind !== "match") return false;
  const rounds = state.brackets?.[ev.id]?.rounds || [];
  return contest.match?.[0] === rounds.length - 1;
}
function lastWinnerUndo(state, ev) {
  if (!ev) return { enabled: false };
  return postedFinalUndo(state, ev) || contestUndoAvailability(state, ev);
}

// src/lib/haptics.js
var VIBRATION_KEY = "si-vibration";
var HAPTIC_PATTERNS = Object.freeze({
  place: 8,
  retract: 5,
  pick: [20, 40, 20],
  settle: 15,
  lead: [15, 50, 15]
});
var storage = () => {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
};
var vibrationOptedOut = () => {
  try {
    return storage()?.getItem(VIBRATION_KEY) === "off";
  } catch {
    return false;
  }
};
function isIOS({ userAgent = "", platform = "", maxTouchPoints = 0 } = {}) {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return true;
  return /Macintosh/i.test(userAgent) && Number(maxTouchPoints) > 1 && !/Android/i.test(platform);
}
function isAndroid({ userAgent = "", platform = "" } = {}) {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return false;
  return /Android/i.test(platform) || /Android/i.test(userAgent);
}
var isTvLocation = ({ pathname = "", search = "" } = {}) => pathname === "/tv" || new URLSearchParams(search).has("tv");
function hapticsAllowed({ userAgent, platform, canVibrate, reducedMotion, optedOut, tv }) {
  return !!canVibrate && isAndroid({ userAgent, platform }) && !reducedMotion && !optedOut && !tv;
}
function tickAllowed({ userAgent, platform, maxTouchPoints, optedOut, tv }) {
  return isIOS({ userAgent, platform, maxTouchPoints }) && !optedOut && !tv;
}
var tvSurface = false;
function hapticEnvironment() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return null;
  return {
    userAgent: navigator.userAgent || "",
    platform: navigator.userAgentData?.platform || "",
    canVibrate: typeof navigator.vibrate === "function",
    maxTouchPoints: Number(navigator.maxTouchPoints) || 0,
    reducedMotion: !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches,
    tv: tvSurface || isTvLocation(window.location || {})
  };
}
function haptic(kind) {
  const pattern = HAPTIC_PATTERNS[kind];
  const env = hapticEnvironment();
  if (!pattern || !env || !hapticsAllowed({ ...env, optedOut: vibrationOptedOut() })) return false;
  try {
    return navigator.vibrate(pattern) !== false;
  } catch {
    return false;
  }
}
function tickSwitch(doc) {
  const label2 = doc.createElement("label");
  label2.setAttribute("aria-hidden", "true");
  label2.style.display = "none";
  const input = doc.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", "");
  input.tabIndex = -1;
  label2.appendChild(input);
  label2.addEventListener("click", (event) => event.stopPropagation());
  return label2;
}
function tapTick() {
  const env = hapticEnvironment();
  if (!env || !tickAllowed({ ...env, optedOut: vibrationOptedOut() })) return false;
  try {
    const doc = globalThis.document;
    const host = doc?.head || doc?.body;
    if (!host) return false;
    const label2 = tickSwitch(doc);
    host.appendChild(label2);
    label2.click();
    label2.remove();
    return true;
  } catch {
    return false;
  }
}

// src/features/weekend/ContestPanel.jsx
var nameOf = (state, side) => side.name || side.players.map((player) => disp(state, player)).join(" & ");
var UNDO_WINDOW_MS = 5e3;
var ORD = ["1st", "2nd", "3rd", "4th", "5th", "6th"];
var placesPaid = (ev) => awardTable(ev).filter((pts) => pts > 0).length;
function CurrentContest({ state, ev, contest, me, gm, onPlayer, onBets, onLock, onWinner, onResult, onPlayNext, onRecorded, operationBusy, onBusy, blocked }) {
  const [winner, setWinner] = useState6(null), [qualifiers, setQualifiers] = useState6([]);
  const [order, setOrder] = useState6([]);
  const [pending, setPending] = useState6(false), [error, setError] = useState6("");
  const busy = useRef4(false), retry = useRef4(null);
  const open = contest.phase === "betting-open", locked = contest.phase === "betting-locked";
  const running2 = contest.phase === "in-progress" || contest.phase === "awaiting-result";
  const isFfa = contest.kind === "ffa", isBracket = contest.kind === "match";
  const advance = contest.kind === "heat" ? state.stages?.[ev.id]?.advance || 1 : 1;
  const reference2 = { contestId: contest.id, contestRevision: contest.revision };
  const final = contestIsFinal(state, ev, contest);
  const needed = Math.min(placesPaid(ev), contest.sides.length);
  const ordering = gm && contest.kind === "stage-final" && contest.sides.length >= 3 && needed >= 2;
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
  const sideName = (key) => {
    const side = contest.sides.find((item) => item.key === key);
    return side ? nameOf(state, side) : "";
  };
  const submit = (payload) => async () => {
    tapTick();
    const result = await onWinner({ ...reference2, ...payload, ...final ? { postResult: true } : {} });
    if (result?.ok === true) onRecorded?.(sideName(payload.winner), !!result.extra?.posted);
    return result;
  };
  const record = (key) => act(submit({ winner: key, qualifiers: [key] }));
  const selectingQualifiers = advance > 1 && winner !== null;
  const unplaced = contest.sides.filter((side) => !order.includes(side.key));
  const fullOrder = order.length >= needed ? order.slice(0, needed) : order.length === needed - 1 && unplaced.length === 1 ? [...order, unplaced[0].key] : null;
  const bracket = isBracket ? state.brackets?.[ev.id] : null;
  const chipsIn = open && (state.wagers || []).some((wager) => wagerMatchesContest(wager, contest) && resolveWager(state, wager, allEventsOf(state)).status === "pending");
  const alternatives = gm && open && bracket && onPlayNext ? bracketOrder(bracket).filter(([r, m]) => bracketMatchOpen(bracket, r, m) && (r !== contest.match[0] || m !== contest.match[1])) : [];
  const canChoose = gm && running2 && !!onWinner;
  const showEntrants = !isFfa && (!isBracket || canChoose);
  const instruction = ordering ? `Tap ${ORD.slice(0, needed).join(needed > 2 ? ", " : " and ").replace(/, (?=[^,]*$)/, " and ")}.` : selectingQualifiers ? `Choose ${advance - 1} more to advance.` : "";
  return /* @__PURE__ */ React6.createElement("section", { className: "fd-contest", "aria-label": "Current contest", "aria-busy": pending }, /* @__PURE__ */ React6.createElement("div", { className: "fd-contest-toolbar" }, /* @__PURE__ */ React6.createElement("div", null, /* @__PURE__ */ React6.createElement("strong", null, isBracket ? contestName(state, ev, contest) : contest.label || ev.name), /* @__PURE__ */ React6.createElement("span", null, (open || running2) && /* @__PURE__ */ React6.createElement("i", { className: "fd-beat-dot", "aria-hidden": "true" }), open ? "Betting open" : locked ? "Betting locked" : running2 ? "In progress" : "Next contest")), gm && (open || locked) && /* @__PURE__ */ React6.createElement(
    "button",
    {
      type: "button",
      className: "fd-contest-primary",
      disabled: pending || blocked || !onLock,
      onClick: () => act(() => onLock(reference2))
    },
    pending ? "Starting\u2026" : "Lock bets and start"
  ), !gm && onBets && /* @__PURE__ */ React6.createElement("button", { type: "button", className: "fd-contest-primary", disabled: pending || blocked, onClick: onBets }, open ? "Place chips" : "View bets"), gm && running2 && isFfa && /* @__PURE__ */ React6.createElement(
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
  )), gm && running2 && !isFfa && instruction && /* @__PURE__ */ React6.createElement("p", { className: "fd-contest-instruction" }, instruction), showEntrants && /* @__PURE__ */ React6.createElement("div", { className: "fd-contest-entrants", "aria-label": contest.label }, contest.sides.map((side) => {
    const name = nameOf(state, side), selected = winner === side.key;
    const qualifier = selectingQualifiers && !selected;
    const place = order.indexOf(side.key);
    const label2 = !canChoose ? name : ordering ? place >= 0 ? `Remove ${name} from ${ORD[place]}` : `${ORD[order.length]}: ${name}` : `${qualifier ? "Also advances" : "Winner"}: ${name}`;
    return /* @__PURE__ */ React6.createElement("div", { key: String(side.key), className: `fd-contest-entrant ${side.players.includes(me) ? "is-you" : ""} ${selected || place === 0 ? "is-winner" : ""}` }, /* @__PURE__ */ React6.createElement(
      "button",
      {
        type: "button",
        className: "fd-contest-entrant-pick",
        disabled: pending || blocked || !canChoose || ordering && place < 0 && order.length >= needed,
        role: canChoose && qualifier ? "checkbox" : void 0,
        "aria-checked": canChoose && qualifier ? qualifiers.includes(side.key) : void 0,
        "aria-pressed": canChoose && (ordering ? place >= 0 : advance > 1 && !qualifier ? selected : void 0),
        "aria-label": label2,
        onClick: () => {
          if (busy.current || operationBusy.current || !canChoose) return;
          if (ordering) {
            setOrder((current) => place >= 0 ? current.slice(0, place) : current.length < needed ? [...current, side.key] : current);
            return;
          }
          if (advance === 1) return record(side.key);
          if (!selectingQualifiers || selected) {
            setWinner(side.key);
            setQualifiers([]);
            return;
          }
          setQualifiers((current) => current.includes(side.key) ? current.filter((key) => key !== side.key) : current.length < advance - 1 ? [...current, side.key] : current);
        }
      },
      /* @__PURE__ */ React6.createElement("span", null, name),
      canChoose && /* @__PURE__ */ React6.createElement("small", null, ordering ? place >= 0 ? ORD[place] : order.length < needed ? "+" : "" : selected ? "Winner" : qualifier ? qualifiers.includes(side.key) ? "\u2713" : "+" : "Win")
    ), /* @__PURE__ */ React6.createElement("div", { className: "fd-contest-entrant-players" }, side.players.map((player) => /* @__PURE__ */ React6.createElement(
      "button",
      {
        key: player,
        type: "button",
        onClick: () => onPlayer?.(player),
        disabled: pending || blocked || !onPlayer,
        "aria-label": `View ${disp(state, player)}'s player card`
      },
      /* @__PURE__ */ React6.createElement(Avatar, { state, p: player, size: 28 })
    ))));
  }), canChoose && advance > 1 && selectingQualifiers && /* @__PURE__ */ React6.createElement("div", { className: "fd-contest-qualifier-actions" }, /* @__PURE__ */ React6.createElement("button", { type: "button", className: "fd-contest-secondary", disabled: pending, onClick: () => {
    setWinner(null);
    setQualifiers([]);
  } }, "Change winner"), /* @__PURE__ */ React6.createElement(
    "button",
    {
      type: "button",
      className: "fd-contest-primary",
      disabled: pending || qualifiers.length !== advance - 1 || !onWinner,
      onClick: () => act(submit({ winner, qualifiers: [winner, ...qualifiers] }))
    },
    pending ? "Saving\u2026" : "Record winner"
  )), canChoose && ordering && /* @__PURE__ */ React6.createElement("div", { className: "fd-contest-qualifier-actions" }, /* @__PURE__ */ React6.createElement("button", { type: "button", className: "fd-contest-secondary", disabled: pending || !order.length, onClick: () => setOrder([]) }, "Start over"), /* @__PURE__ */ React6.createElement(
    "button",
    {
      type: "button",
      className: "fd-contest-primary",
      disabled: pending || !fullOrder,
      onClick: () => act(submit({ winner: fullOrder[0], qualifiers: [fullOrder[0]], order: fullOrder }))
    },
    pending ? "Saving\u2026" : "Record order"
  ))), isBracket && /* @__PURE__ */ React6.createElement(
    CompetitionBracket,
    {
      state,
      ev,
      me,
      gm,
      pending: pending || blocked,
      onPlayer,
      pickable: false
    }
  ), !!alternatives.length && /* @__PURE__ */ React6.createElement("div", { className: "fd-contest-reorder" }, alternatives.map(([r, m]) => {
    const label2 = contestName(state, ev, { kind: "match", match: [r, m] });
    return /* @__PURE__ */ React6.createElement(
      "button",
      {
        key: `${r}:${m}`,
        type: "button",
        className: "fd-contest-secondary",
        disabled: pending || blocked || chipsIn,
        onClick: () => act(() => onPlayNext({ ...reference2, match: [r, m] }))
      },
      "Play ",
      label2,
      " next"
    );
  }), chipsIn && /* @__PURE__ */ React6.createElement("p", null, "Reorder once the chips on this match come off.")), error && /* @__PURE__ */ React6.createElement("div", { className: "fd-contest-failure" }, /* @__PURE__ */ React6.createElement("p", { role: "alert", className: "fd-contest-error" }, error), /* @__PURE__ */ React6.createElement("button", { type: "button", className: "fd-contest-secondary", disabled: pending, onClick: () => act(retry.current) }, "Retry")), pending && running2 && !isFfa && /* @__PURE__ */ React6.createElement("p", { className: "fd-contest-saving", role: "status" }, "Saving result\u2026"));
}
function ContestPanel(props) {
  const { state, ev, gm, onResult, onUndo } = props;
  const operationBusy = useRef4(false), [blocked, onBusy] = useState6(false);
  const [recent, setRecent] = useState6(null);
  useEffect5(() => {
    if (!recent) return;
    const timer = setTimeout(() => setRecent(null), Math.max(0, recent.at + UNDO_WINDOW_MS - Date.now()));
    return () => clearTimeout(timer);
  }, [recent]);
  const operations = { operationBusy, blocked, onBusy };
  const onRecorded = gm && onUndo ? (name, posted) => setRecent({ name, posted, at: Date.now() }) : null;
  const undoRecent = recent && gm && onUndo ? /* @__PURE__ */ React6.createElement(RecentWinner, { ...props, ...operations, name: recent.name, posted: recent.posted, onDone: () => setRecent(null) }) : null;
  if (state.results?.[ev.id] || state.shelved?.[ev.id] || state.frozen || ev.finale) return undoRecent;
  const correction = undoRecent ? null : /* @__PURE__ */ React6.createElement(ContestCorrection, { ...props, ...operations });
  const lifecycle = resolveEventLifecycle(state, ev), contest = resolveCurrentContest(state, ev);
  if (!contest || !["betting-open", "betting-locked", "in-progress", "awaiting-result"].includes(contest.phase)) {
    return gm && ["enter-result", "post-result"].includes(lifecycle.nextAction?.type) ? /* @__PURE__ */ React6.createElement(React6.Fragment, null, undoRecent, /* @__PURE__ */ React6.createElement(ContestFinish, { key: ev.id, onResult, ...operations }), correction) : undoRecent;
  }
  return /* @__PURE__ */ React6.createElement(React6.Fragment, null, undoRecent, /* @__PURE__ */ React6.createElement(
    CurrentContest,
    {
      key: `${ev.id}:${contest.id}:${contest.revision}:${contest.phase}`,
      ...props,
      ...operations,
      contest,
      onRecorded
    }
  ), correction);
}
function useCorrection({ state, ev, onUndo, operationBusy, onBusy }, after) {
  const [pending, setPending] = useState6(false), [error, setError] = useState6("");
  const busy = useRef4(false);
  const run = async (contestId = null) => {
    if (busy.current || operationBusy.current) return;
    const undo = contestId ? contestCorrectionAvailability(state, ev, contestId) : lastWinnerUndo(state, ev);
    busy.current = true;
    operationBusy.current = true;
    onBusy(true);
    setPending(true);
    setError("");
    try {
      const result = await onUndo({ contestId: undo.contestId, contestRevision: undo.contestRevision });
      if (!result?.ok) setError(result?.error || "Change not saved. Try again.");
      else after?.();
    } catch (failure) {
      setError(failure?.message || "Change not saved. Try again.");
    } finally {
      busy.current = false;
      operationBusy.current = false;
      onBusy(false);
      setPending(false);
    }
  };
  return { pending, error, run };
}
function RecentWinner(props) {
  const { state, ev, name, posted, blocked, onDone } = props;
  const undo = lastWinnerUndo(state, ev);
  const correction = useCorrection(props, onDone);
  if (!undo.enabled) return null;
  const moved = correctionText(state, undo);
  return /* @__PURE__ */ React6.createElement("div", { className: "fd-contest-recent", role: "status" }, /* @__PURE__ */ React6.createElement("span", null, "Winner recorded: ", name, posted ? ". Result posted" : "", moved ? `. ${moved}` : ""), /* @__PURE__ */ React6.createElement("button", { type: "button", disabled: correction.pending || blocked, onClick: () => correction.run() }, correction.pending ? "Undoing\u2026" : "Undo"), correction.error && /* @__PURE__ */ React6.createElement("p", { role: "alert", className: "fd-contest-error" }, correction.error));
}
function ContestFinish({ onResult, operationBusy, blocked, onBusy }) {
  const [pending, setPending] = useState6(false), [error, setError] = useState6("");
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
  return /* @__PURE__ */ React6.createElement("section", { className: "fd-contest", "aria-busy": pending }, /* @__PURE__ */ React6.createElement("div", { className: "fd-contest-toolbar" }, /* @__PURE__ */ React6.createElement("strong", null, "Competition complete"), /* @__PURE__ */ React6.createElement("button", { type: "button", className: "fd-contest-primary", disabled: blocked || pending || !onResult, onClick: post }, pending ? "Opening result\u2026" : "Post event result")), error && /* @__PURE__ */ React6.createElement("div", { className: "fd-contest-failure" }, /* @__PURE__ */ React6.createElement("p", { role: "alert", className: "fd-contest-error" }, error), /* @__PURE__ */ React6.createElement("button", { type: "button", className: "fd-contest-secondary", disabled: blocked || pending, onClick: post }, "Retry")));
}
function lastContestView(state, ev, last) {
  if (!last) return null;
  const draw = state.draws?.[ev.id], stages = state.stages?.[ev.id];
  const team = (key) => draw?.teams?.[key]?.players || [];
  const players = (key) => last.kind === "match" ? team(key) : stages ? stageEntrantView(state, stages, key).players : [];
  const named = (key) => players(key).map((player) => disp(state, player)).join(" & ");
  let keys = [];
  if (last.kind === "match") {
    const match = state.brackets?.[ev.id]?.rounds?.[last.match?.[0]]?.[last.match?.[1]];
    if (match) keys = [resolveSlot(state.brackets[ev.id], match.a), resolveSlot(state.brackets[ev.id], match.b)];
  } else if (last.kind === "heat") keys = stages?.groups?.[last.group]?.entrants || [];
  else keys = stages && stageFinalists(stages) || [];
  const sides = keys.filter((key) => key !== null && key !== void 0).map(named);
  return {
    name: contestName(state, ev, { kind: last.kind, match: last.match, group: last.group }),
    matchup: sides.length === 2 ? sides.join(" vs ") : sides.join(", "),
    winner: named(last.winner)
  };
}
function ContestCorrection(props) {
  const { state, ev, gm, onUndo, blocked } = props;
  const [confirming, setConfirming] = useState6(null);
  const correction = useCorrection(props, () => setConfirming(null));
  const options = contestCorrections(state, ev);
  if (!gm || !onUndo || !options.length) return null;
  const stack = contestStackOf(state, ev.id);
  return /* @__PURE__ */ React6.createElement("div", { className: "fd-contest-correction" }, options.map((option) => {
    const view = lastContestView(state, ev, stack.find((entry) => entry.id === option.contestId));
    const name = view?.name || option.contest;
    const moved = correctionText(state, option);
    return /* @__PURE__ */ React6.createElement(React6.Fragment, { key: option.contestId }, confirming === option.contestId ? /* @__PURE__ */ React6.createElement("div", { className: "fd-contest-confirm" }, /* @__PURE__ */ React6.createElement("p", null, "Reopens ", name, view?.matchup ? `: ${view.matchup}` : "", ".", view?.winner ? ` ${view.winner} loses the win.` : "", moved ? ` ${moved}` : ""), /* @__PURE__ */ React6.createElement(
      "button",
      {
        type: "button",
        disabled: correction.pending || blocked || !option.enabled,
        onClick: () => correction.run(option.contestId)
      },
      correction.pending ? "Undoing\u2026" : `Reopen ${name}`
    ), /* @__PURE__ */ React6.createElement("button", { type: "button", disabled: correction.pending, onClick: () => setConfirming(null) }, "Keep it")) : /* @__PURE__ */ React6.createElement(
      "button",
      {
        type: "button",
        disabled: correction.pending || blocked || !option.enabled,
        onClick: () => setConfirming(option.contestId)
      },
      "Fix ",
      name
    ));
  }), !options[0].enabled && /* @__PURE__ */ React6.createElement("p", null, options[0].blocker), correction.error && /* @__PURE__ */ React6.createElement("p", { role: "alert", className: "fd-contest-error" }, correction.error));
}

// src/features/weekend/EventAnnouncement.jsx
init_core();
init_controls();
import React9, { useEffect as useEffect7, useRef as useRef5, useState as useState8 } from "react";

// src/ui/GameMark.jsx
import React7 from "react";
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
      return /* @__PURE__ */ React7.createElement("g", { ...common }, /* @__PURE__ */ React7.createElement("path", { d: "M15 37V11l16 5-16 5" }), /* @__PURE__ */ React7.createElement("path", { d: "M9 37c4-3 10-3 14 0-4 3-10 3-14 0Z" }), /* @__PURE__ */ React7.createElement("circle", { cx: "32", cy: "35", r: "2.6", fill: accent, stroke: "none" }));
    case "8ball":
      return /* @__PURE__ */ React7.createElement("g", { ...common }, /* @__PURE__ */ React7.createElement("circle", { cx: "24", cy: "24", r: "13" }), /* @__PURE__ */ React7.createElement("circle", { cx: "24", cy: "21", r: "3.2" }), /* @__PURE__ */ React7.createElement("circle", { cx: "24", cy: "28", r: "3.2" }), /* @__PURE__ */ React7.createElement("path", { d: "M14 12l-3-3M34 36l3 3", stroke: accent }));
    case "pong":
      return /* @__PURE__ */ React7.createElement("g", { ...common }, /* @__PURE__ */ React7.createElement("path", { d: "M15 20h18l-2.4 17H17.4L15 20Z" }), /* @__PURE__ */ React7.createElement("path", { d: "M16 20c4-2 12-2 16 0" }), /* @__PURE__ */ React7.createElement("circle", { cx: "25", cy: "11", r: "3.2", fill: sun, stroke: bone }), /* @__PURE__ */ React7.createElement("path", { d: "M17 13l4 2", stroke: accent }));
    case "die":
      return /* @__PURE__ */ React7.createElement("g", { ...common }, /* @__PURE__ */ React7.createElement("rect", { x: "11", y: "11", width: "26", height: "26", rx: "7" }), [[17, 17], [31, 17], [24, 24], [17, 31], [31, 31]].map(([x, y]) => /* @__PURE__ */ React7.createElement("circle", { key: `${x}-${y}`, cx: x, cy: y, r: "1.9", fill: x === 24 ? accent : bone, stroke: "none" })));
    case "basketball":
      return /* @__PURE__ */ React7.createElement("g", { ...common }, /* @__PURE__ */ React7.createElement("circle", { cx: "24", cy: "24", r: "13" }), /* @__PURE__ */ React7.createElement("path", { d: "M11 24h26M24 11v26M15 14c5 5 5 15 0 20M33 14c-5 5-5 15 0 20" }), /* @__PURE__ */ React7.createElement("path", { d: "M34 12l4-4", stroke: accent }));
    case "spikeball":
      return /* @__PURE__ */ React7.createElement("g", { ...common }, /* @__PURE__ */ React7.createElement("ellipse", { cx: "24", cy: "32", rx: "14", ry: "5.5" }), /* @__PURE__ */ React7.createElement("path", { d: "M14 32h20M24 26.5v11M15 35l-3 4M33 35l3 4" }), /* @__PURE__ */ React7.createElement("circle", { cx: "24", cy: "15", r: "4", fill: sun, stroke: bone }), /* @__PURE__ */ React7.createElement("path", { d: "M18 11l-3-3", stroke: accent }));
    case "pingpong":
      return /* @__PURE__ */ React7.createElement("g", { ...common }, /* @__PURE__ */ React7.createElement("circle", { cx: "20", cy: "20", r: "9" }), /* @__PURE__ */ React7.createElement("path", { d: "M14 27l-6 8" }), /* @__PURE__ */ React7.createElement("circle", { cx: "35", cy: "32", r: "3.2", fill: accent, stroke: bone }), /* @__PURE__ */ React7.createElement("path", { d: "M29 17l5-3" }));
    case "foosball":
      return /* @__PURE__ */ React7.createElement("g", { ...common }, /* @__PURE__ */ React7.createElement("path", { d: "M8 15h32M8 31h32" }), /* @__PURE__ */ React7.createElement("circle", { cx: "24", cy: "14", r: "3.5" }), /* @__PURE__ */ React7.createElement("path", { d: "M24 18v10M18 22h12M24 28l-5 7M24 28l5 7" }), /* @__PURE__ */ React7.createElement("circle", { cx: "35", cy: "37", r: "2.8", fill: accent, stroke: "none" }));
    case "volleyball":
      return /* @__PURE__ */ React7.createElement("g", { ...common }, /* @__PURE__ */ React7.createElement("path", { d: "M30 12v27M30 19h10v20M30 24h10M30 29h10M30 34h10" }), /* @__PURE__ */ React7.createElement("circle", { cx: "17", cy: "22", r: "9" }), /* @__PURE__ */ React7.createElement("path", { d: "M17 13c4 5 4 13 0 18M9 20c6 1 12-1 16-5" }), /* @__PURE__ */ React7.createElement("path", { d: "M9 35l4-3", stroke: accent }));
    case "pickleball":
      return /* @__PURE__ */ React7.createElement("g", { ...common }, /* @__PURE__ */ React7.createElement("circle", { cx: "19", cy: "19", r: "9.5" }), /* @__PURE__ */ React7.createElement("path", { d: "M13 26l-5 9" }), /* @__PURE__ */ React7.createElement("circle", { cx: "35", cy: "31", r: "5", fill: sun }), [[33, 29], [37, 29], [35, 33]].map(([x, y]) => /* @__PURE__ */ React7.createElement("circle", { key: `${x}-${y}`, cx: x, cy: y, r: ".8", fill: bone, stroke: "none" })), /* @__PURE__ */ React7.createElement("path", { d: "M29 15l4-3", stroke: accent }));
    case "flipcup":
      return /* @__PURE__ */ React7.createElement("g", { ...common }, /* @__PURE__ */ React7.createElement("path", { d: "M15 15h15l-2 17H17l-2-17Z", transform: "rotate(-28 22.5 23.5)" }), /* @__PURE__ */ React7.createElement("path", { d: "M10 34c6 5 19 5 27-1" }), /* @__PURE__ */ React7.createElement("path", { d: "M10 29c-3-7 0-13 6-17", stroke: accent }), /* @__PURE__ */ React7.createElement("path", { d: "M13 11l3 1-1 3", stroke: accent }));
    case "beerio":
      return /* @__PURE__ */ React7.createElement("g", { ...common }, /* @__PURE__ */ React7.createElement("circle", { cx: "19", cy: "24", r: "11" }), /* @__PURE__ */ React7.createElement("circle", { cx: "19", cy: "24", r: "3" }), /* @__PURE__ */ React7.createElement("path", { d: "M19 13v8M10 29l6-3M28 29l-6-3" }), /* @__PURE__ */ React7.createElement("path", { d: "M33 18h8l-1 17h-6l-1-17Z" }), /* @__PURE__ */ React7.createElement("path", { d: "M34 18c2-1 4-1 6 0" }), /* @__PURE__ */ React7.createElement("path", { d: "M32 12l4 2", stroke: accent }));
    case "ragecage":
      return /* @__PURE__ */ React7.createElement("g", { ...common }, [15, 24, 33].map((x) => /* @__PURE__ */ React7.createElement("path", { key: x, d: `M${x - 4} 26h8l-1 11h-6l-1-11Z` })), /* @__PURE__ */ React7.createElement("path", { d: "M20 14h8l-1 10h-6l-1-10Z" }), /* @__PURE__ */ React7.createElement("circle", { cx: "12", cy: "15", r: "3", fill: sun, stroke: bone }), /* @__PURE__ */ React7.createElement("path", { d: "M8 20l-2 4", stroke: accent }));
    case "poker":
      return /* @__PURE__ */ React7.createElement("g", { ...common }, /* @__PURE__ */ React7.createElement("rect", { x: "10", y: "11", width: "15", height: "21", rx: "3", transform: "rotate(-9 17.5 21.5)" }), /* @__PURE__ */ React7.createElement("rect", { x: "23", y: "10", width: "15", height: "21", rx: "3", transform: "rotate(8 30.5 20.5)" }), /* @__PURE__ */ React7.createElement("path", { d: "M30 16l3 3-3 3-3-3 3-3Z", fill: accent, stroke: "none" }), /* @__PURE__ */ React7.createElement("circle", { cx: "24", cy: "36", r: "6", fill: "var(--paper2)" }), /* @__PURE__ */ React7.createElement("path", { d: "M20 36h8M24 32v8", stroke: sun }));
    case "gauntlet":
      return /* @__PURE__ */ React7.createElement("g", { ...common }, /* @__PURE__ */ React7.createElement("path", { d: "M9 34c0-12 8-19 18-18 6 1 9 5 9 11" }), [[9, 34], [12, 23], [21, 17], [31, 19]].map(([x, y], i) => /* @__PURE__ */ React7.createElement("circle", { key: i, cx: x, cy: y, r: "2.8", fill: i === 0 ? accent : "var(--paper2)" })), /* @__PURE__ */ React7.createElement("path", { d: "M36 27V11M36 11l7 3-7 3" }));
    default:
      return /* @__PURE__ */ React7.createElement("g", { ...common }, /* @__PURE__ */ React7.createElement("circle", { cx: "24", cy: "24", r: "12" }), /* @__PURE__ */ React7.createElement("path", { d: "M24 15v18M15 24h18", stroke: accent }));
  }
}
function GameMark({ id, size = 54, hero = false }) {
  return /* @__PURE__ */ React7.createElement(
    "svg",
    {
      className: hero ? "fd-night" : void 0,
      width: size,
      height: size,
      viewBox: "0 0 48 48",
      "aria-hidden": "true",
      style: { flexShrink: 0, display: "block", filter: hero ? "drop-shadow(0 14px 26px rgba(10,6,3,.32))" : "none" }
    },
    /* @__PURE__ */ React7.createElement(
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
    /* @__PURE__ */ React7.createElement(EventGlyph, { id }),
    /* @__PURE__ */ React7.createElement("circle", { cx: "39.5", cy: "8.5", r: "2.4", fill: "var(--accent2)" })
  );
}

// src/features/weekend/EventAnnouncement.jsx
init_PlayerIdentity();
init_PlayerIdentityContext();
init_serverClock();

// src/features/weekend/drawReveal.js
init_core();
var REVEAL_FRESH_MS = 2 * 60 * 1e3;
var revealTime = (state, evId, item) => Number(item.ts) || Number(state.eventOps?.[evId]?.drawRevealedAt) || parseInt(String(item.id).replace(/^\D+/, ""), 10) || 0;
function drawRevealGroups(state, reveal) {
  return reveal.versus ? reveal.versus.map((team, index) => ({
    title: team.name || `Team ${index + 1}`,
    lines: [{ avatars: team.players, text: team.players.map((player) => disp(state, player)).join(" & ") }]
  })) : reveal.groups || [];
}
var DRAW_INTRO_MS = 3e3;
var DRAW_INTRO_REDUCED_MS = 650;
var DRAW_FIRST_STEP_MS = 480;
var drawStepGap = (total) => Math.min(680, 2900 / Math.max(1, total - 1));
var drawStepDelay = (index, total) => DRAW_FIRST_STEP_MS + index * drawStepGap(total);
function drawStepAt(elapsed, total) {
  const count = Math.max(0, Math.floor(Number(total) || 0));
  const t = Number(elapsed);
  if (!count || !Number.isFinite(t)) return 0;
  let shown = 0;
  while (shown < count && drawStepDelay(shown, count) <= t) shown++;
  return shown;
}
var saved = (state, reveal) => {
  const draw = state?.draws?.[reveal?.evId], stage = state?.stages?.[reveal?.evId];
  return draw?.id === reveal?.id ? draw : stage?.id === reveal?.id ? stage : null;
};
function revealTimeline(state, evId, { reveal = null, reducedMotion = false } = {}) {
  const announcedAt = Number(state?.eventOps?.[evId]?.announcedAt) || 0;
  if (!announcedAt) return null;
  const handoffAt = announcedAt + (reducedMotion ? DRAW_INTRO_REDUCED_MS : DRAW_INTRO_MS);
  const item = reveal ? saved(state, reveal) : null;
  const drewAt = item ? revealTime(state, evId, item) : 0;
  return { introAt: announcedAt, handoffAt, revealAt: Math.max(handoffAt, drewAt || 0) };
}
function startDrawPlayback({
  total,
  reducedMotion = false,
  onStep,
  schedule = setTimeout,
  cancel = clearTimeout,
  startAt = null,
  now = null
}) {
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
  const anchored = Number.isFinite(startAt) && typeof now === "function";
  const elapsed = anchored ? now() - startAt : 0;
  const joined = reducedMotion || total === 0 ? total : drawStepAt(elapsed, total);
  if (joined >= total) onStep(total);
  else {
    onStep(joined);
    for (let index = joined; index < total; index++) {
      const delay = Math.max(0, drawStepDelay(index, total) - elapsed);
      timers.push(schedule(() => {
        if (active) onStep(index + 1);
      }, delay));
    }
  }
  return { stop, skip, joined };
}

// src/lib/sound.js
import { useEffect as useEffect6, useState as useState7 } from "react";

// src/lib/soundKit.js
var NOTE = Object.freeze({
  D2: 73.42,
  A2: 110,
  D3: 146.83,
  A3: 220,
  D4: 293.66,
  E4: 329.63,
  Fs4: 369.99,
  A4: 440,
  B4: 493.88,
  D5: 587.33,
  E5: 659.25,
  Fs5: 739.99,
  A5: 880
});
var ROOMS = Object.freeze({
  fri: Object.freeze({ len: 1, decay: 3.2, tone: 5200, wet: 0.16 }),
  sam: Object.freeze({ len: 0.8, decay: 3.6, tone: 6e3, wet: 0.12 }),
  sap: Object.freeze({ len: 1.2, decay: 3, tone: 4200, wet: 0.18 }),
  san: Object.freeze({ len: 1.8, decay: 2.6, tone: 2900, wet: 0.25 }),
  fin: Object.freeze({ len: 2.2, decay: 2.4, tone: 2500, wet: 0.28 })
});
var roomKeyFor = (phase) => Object.prototype.hasOwnProperty.call(ROOMS, phase) ? phase : "fri";
var roomForPhase = (phase) => ROOMS[roomKeyFor(phase)];
var PHONE_WET = 0.45;
var wetLevel = (room, listen) => roomForPhase(room).wet * (listen === "phone" ? PHONE_WET : 1);
var highpassFor = (listen) => listen === "phone" ? 380 : 25;
var rnd = (a, b) => a + Math.random() * (b - a);
var clampPan = (pan) => Math.max(-1, Math.min(1, Number(pan) || 0));
function makeIR(ctx, len, decay) {
  const n = Math.max(1, Math.floor(ctx.sampleRate * len));
  const pre = Math.floor(ctx.sampleRate * 0.012);
  const b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = pre; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
  }
  return b;
}
function makeEngine(ctx, { room = "fri", listen = "tv", volume = 0.8, out = null } = {}) {
  const E = { ctx, listen, pan: 0 };
  E.master = ctx.createGain();
  E.master.gain.value = volume;
  E.hp = ctx.createBiquadFilter();
  E.hp.type = "highpass";
  E.hp.frequency.value = 25;
  E.comp = ctx.createDynamicsCompressor();
  E.comp.threshold.value = -12;
  E.comp.knee.value = 10;
  E.comp.ratio.value = 4;
  E.comp.attack.value = 2e-3;
  E.comp.release.value = 0.18;
  E.master.connect(E.hp);
  E.hp.connect(E.comp);
  E.comp.connect(out || ctx.destination);
  E.hush = ctx.createGain();
  E.hush.gain.value = 1;
  E.hush.connect(E.master);
  E.dry = ctx.createGain();
  E.dry.connect(E.hush);
  E.wet = ctx.createGain();
  E.conv = ctx.createConvolver();
  E.wetTone = ctx.createBiquadFilter();
  E.wetTone.type = "lowpass";
  E.wetOut = ctx.createGain();
  E.wet.connect(E.conv);
  E.conv.connect(E.wetTone);
  E.wetTone.connect(E.wetOut);
  E.wetOut.connect(E.hush);
  const n = ctx.sampleRate * 2;
  E.noise = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = E.noise.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  setRoom(E, room);
  setListen(E, listen);
  return E;
}
function setRoom(E, key) {
  const k = roomKeyFor(key);
  if (E.roomKey === k && E.conv.buffer) return;
  const r = ROOMS[k];
  E.roomKey = k;
  E.conv.buffer = makeIR(E.ctx, r.len, r.decay);
  E.wetTone.frequency.value = r.tone;
  E.wetOut.gain.value = wetLevel(k, E.listen);
}
function setListen(E, listen) {
  E.listen = listen;
  E.hp.frequency.value = highpassFor(listen);
  E.wetOut.gain.value = wetLevel(E.roomKey, listen);
}
function voice(E, { pan = 0, send = 0.2, bright = 1, gain = 1 } = {}) {
  const c = E.ctx;
  const g = c.createGain();
  g.gain.value = gain;
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.Q.value = 0.5;
  lp.frequency.value = Math.min(18e3, 13e3 * bright);
  const p = c.createStereoPanner();
  p.pan.value = E.listen === "phone" ? 0 : clampPan(pan + (E.pan || 0));
  const s = c.createGain();
  s.gain.value = send;
  g.connect(lp);
  lp.connect(p);
  p.connect(E.dry);
  p.connect(s);
  s.connect(E.wet);
  return g;
}
function mode(E, dest, t, f, d, peak, { a = 1e-3, drop = 0, type = "sine" } = {}) {
  const c = E.ctx;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f * (1 + drop), t);
  if (drop) o.frequency.exponentialRampToValueAtTime(f, t + Math.min(0.08, d * 0.6));
  const g = c.createGain();
  g.gain.setValueAtTime(1e-4, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(1e-4, t + a + d);
  o.connect(g);
  g.connect(dest);
  o.start(t);
  o.stop(t + a + d + 0.03);
}
function burst(E, dest, t, { type = "bandpass", f = 2e3, q = 1, d = 0.02, peak = 0.5, a = 8e-4 } = {}) {
  const c = E.ctx;
  const s = c.createBufferSource();
  s.buffer = E.noise;
  const fl = c.createBiquadFilter();
  fl.type = type;
  fl.frequency.value = f;
  fl.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(1e-4, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(1e-4, t + a + d);
  s.connect(fl);
  fl.connect(g);
  g.connect(dest);
  s.start(t, Math.random() * 1.5, a + d + 0.05);
}
function swell(E, dest, t, { d = 0.6, f0 = 500, f1 = 900, q = 0.7, peak = 0.2 } = {}) {
  const c = E.ctx;
  const s = c.createBufferSource();
  s.buffer = E.noise;
  const fl = c.createBiquadFilter();
  fl.type = "bandpass";
  fl.Q.value = q;
  fl.frequency.setValueAtTime(f0, t);
  fl.frequency.linearRampToValueAtTime(f1, t + d);
  const g = c.createGain();
  g.gain.setValueAtTime(1e-4, t);
  g.gain.linearRampToValueAtTime(peak, t + d * 0.6);
  g.gain.exponentialRampToValueAtTime(1e-4, t + d);
  s.connect(fl);
  fl.connect(g);
  g.connect(dest);
  s.start(t, Math.random() * 0.5, d + 0.05);
}
var M = {
  /* clay chip on chip: a bright contact, two short body modes, and usually a second softer contact */
  clack(E, t, o = {}) {
    const p = (o.pitch || 1) * rnd(0.96, 1.04);
    const v = voice(E, { pan: o.pan || 0, send: o.send ?? 0.12, bright: o.bright ?? 1, gain: o.gain ?? 1 });
    burst(E, v, t, { f: 3300 * p, q: 2.2, d: 0.016, peak: 0.5 });
    mode(E, v, t, 2380 * p, 0.04, 0.24);
    mode(E, v, t, 3960 * p, 0.026, 0.13);
    mode(E, v, t, 5650 * p, 0.014, 0.05);
    mode(E, v, t, 250 * p, 0.022, 0.2);
    if (o.double !== false) {
      const t2 = t + rnd(9e-3, 0.016);
      burst(E, v, t2, { f: 3e3 * p, q: 2, d: 0.012, peak: 0.2 });
      mode(E, v, t2, 2450 * p, 0.025, 0.09);
    }
  },
  /* a chip or hand landing on felt */
  felt(E, t, o = {}) {
    const v = voice(E, { pan: o.pan || 0, send: 0.1, bright: 0.6, gain: o.gain ?? 1 });
    burst(E, v, t, { type: "lowpass", f: 520, q: 0.7, d: 0.09, peak: 0.7 });
    mode(E, v, t, 92, 0.13, 0.55, { drop: 0.5 });
  },
  /* knuckle on a wooden table */
  knock(E, t, o = {}) {
    const p = (o.pitch || 1) * rnd(0.98, 1.02);
    const v = voice(E, { pan: o.pan || 0, send: 0.18, bright: 0.8, gain: o.gain ?? 1 });
    mode(E, v, t, 185 * p, 0.11, 0.55, { drop: 0.25 });
    mode(E, v, t, 530 * p, 0.05, 0.2);
    burst(E, v, t, { f: 1500 * p, q: 1.3, d: 0.014, peak: 0.3 });
  },
  /* a card turning over */
  tick(E, t, o = {}) {
    const v = voice(E, { pan: o.pan || 0, send: 0.15, bright: 1, gain: o.gain ?? 1 });
    burst(E, v, t, { type: "highpass", f: 2600, q: 0.7, d: 0.011, peak: 0.32 });
    burst(E, v, t + 4e-3, { f: 850, q: 0.9, d: 0.026, peak: 0.14 });
    mode(E, v, t, 1650 * (o.pitch || 1), 0.012, 0.06);
  },
  /* a card set down hard in its seat */
  slap(E, t, o = {}) {
    const v = voice(E, { pan: o.pan || 0, send: 0.16, bright: 0.8, gain: o.gain ?? 1 });
    burst(E, v, t, { f: 1150, q: 0.6, d: 0.055, peak: 0.75 });
    burst(E, v, t, { type: "lowpass", f: 400, q: 0.7, d: 0.08, peak: 0.5 });
    mode(E, v, t, 110, 0.09, 0.35, { drop: 0.4 });
  },
  /* the sun-bell: celesta-like, harmonic, warm, short strike */
  bell(E, t, f, o = {}) {
    const dec = o.dec || 2.4;
    const v = voice(E, { pan: o.pan || 0, send: o.send ?? 0.38, bright: 1, gain: o.gain ?? 1 });
    [[1, 0.24, dec], [2, 0.07, dec * 0.45], [3, 0.022, dec * 0.3], [4.07, 0.035, dec * 0.14], [6.1, 0.012, dec * 0.07]].forEach(([r, amp, d]) => mode(E, v, t, f * r * (1 + rnd(-8e-4, 8e-4)), d, amp, { a: 3e-3 }));
    mode(E, v, t, f * 1.0025, dec * 0.8, 0.08, { a: 3e-3 });
    burst(E, v, t, { type: "highpass", f: 4e3, d: 5e-3, peak: 0.04 });
  },
  /* a low singing bowl: inharmonic, slow beating */
  bowl(E, t, f, o = {}) {
    const dec = o.dec || 4.5;
    const v = voice(E, { pan: o.pan || 0, send: 0.45, bright: 0.9, gain: o.gain ?? 1 });
    [[1, 0.22, dec], [1.004, 0.12, dec], [2.71, 0.08, dec * 0.55], [5.15, 0.03, dec * 0.3]].forEach(([r, amp, d]) => mode(E, v, t, f * r, d, amp, { a: 6e-3 }));
    burst(E, v, t, { type: "lowpass", f: 600, d: 0.03, peak: 0.12 });
  },
  /* a low frame drum, felt beater */
  drum(E, t, o = {}) {
    const f = o.f || 68;
    const v = voice(E, { pan: o.pan || 0, send: o.send ?? 0.2, bright: 0.5, gain: o.gain ?? 1 });
    mode(E, v, t, f, o.dec || 0.55, 0.85, { drop: 1.4, a: 2e-3 });
    mode(E, v, t, f * 1.59, 0.16, 0.18, { drop: 0.3 });
    burst(E, v, t, { type: "lowpass", f: 900, d: 0.03, peak: 0.25 });
  }
};
function riffle(E, t, n, o = {}) {
  const gap = o.gap || 0.045;
  let x = 0;
  for (let i = 0; i < n; i++) {
    M.clack(E, t + x, {
      pitch: (o.pitch || 1) * (1 - i * 8e-3),
      gain: (o.gain ?? 0.8) * (0.9 - i * 0.03),
      bright: o.bright ?? 1,
      pan: o.pan || 0,
      double: i === n - 1
    });
    x += gap * rnd(0.85, 1.2);
  }
  return x;
}
function spinDown(E, t, o = {}) {
  const dur = o.dur || 1.1, g = o.gain ?? 0.8;
  let dt = 0.11, x = 0, i = 0;
  while (x < dur && i < 90) {
    const k = x / dur;
    M.clack(E, t + x, { pitch: 1.05 - 0.1 * k, gain: g * (0.3 + 0.4 * k), bright: 0.55, double: false, pan: o.pan || 0 });
    x += dt;
    dt = Math.max(9e-3, dt * 0.9);
    i++;
  }
  M.felt(E, t + x + 0.01, { gain: 0.45 * g });
}
function roll(E, t, o = {}) {
  const dur = o.dur || 0.6, from = o.from ?? 0.08, to = o.to ?? 0.55;
  const hits = Math.floor(dur * 24);
  for (let i = 0; i < hits; i++) {
    const k = i / Math.max(1, hits - 1);
    M.drum(E, t + i / 24 + rnd(-6e-3, 6e-3), { f: (o.f || 66) * rnd(0.99, 1.01), dec: 0.16, gain: from + (to - from) * k * k, send: 0.3 });
  }
}
var KIT = Object.freeze([
  {
    id: "S1",
    name: "Field Day call",
    where: ["tv"],
    ms: 900,
    play: (E, t) => {
      M.drum(E, t, { f: NOTE.D2, dec: 0.9, gain: 0.7 });
      M.bell(E, t, NOTE.A4, { gain: 0.8 });
      M.bell(E, t + 0.17, NOTE.D5, { gain: 0.75 });
      M.bell(E, t + 0.34, NOTE.Fs5, { gain: 0.7, dec: 3.2 });
    }
  },
  {
    id: "S2",
    name: "Event intro",
    where: ["tv"],
    ms: 1200,
    play: (E, t) => {
      M.drum(E, t, { f: NOTE.D2, dec: 0.8 });
      M.bell(E, t + 0.02, NOTE.D4, { gain: 0.8, dec: 3 });
      M.bell(E, t + 0.02, NOTE.A4, { gain: 0.6, dec: 3 });
      M.bell(E, t + 0.42, NOTE.D5, { gain: 0.4 });
    }
  },
  {
    id: "S3",
    name: "Card turns",
    where: ["tv"],
    ms: 30,
    play: (E, t) => M.tick(E, t)
  },
  {
    id: "S4",
    name: "Your card",
    where: ["phone"],
    ms: 500,
    play: (E, t) => {
      M.bell(E, t, NOTE.D5, { gain: 0.9, dec: 1.8, send: 0.25 });
      M.bell(E, t + 0.09, NOTE.Fs5, { gain: 0.5, dec: 1.4, send: 0.25 });
    }
  },
  {
    id: "S5",
    name: "Chip placed",
    where: ["phone", "tv"],
    ms: 30,
    play: (E, t) => M.clack(E, t)
  },
  {
    id: "S6",
    name: "Chip taken back",
    where: ["phone"],
    ms: 30,
    play: (E, t) => M.clack(E, t, { pitch: 0.84, gain: 0.7, bright: 0.5, double: false })
  },
  {
    id: "S7",
    name: "At your limit",
    where: ["phone"],
    ms: 120,
    play: (E, t) => {
      M.clack(E, t);
      M.felt(E, t + 0.03, { gain: 0.5 });
      M.clack(E, t + 0.07, { pitch: 0.9, gain: 0.45, double: false });
    }
  },
  {
    id: "S8",
    name: "Betting locks",
    where: ["tv"],
    ms: 150,
    play: (E, t) => {
      M.felt(E, t, { gain: 0.9 });
      M.knock(E, t + 0.018, { pitch: 0.9, gain: 0.8 });
    }
  },
  {
    id: "S9",
    name: "You're playing",
    where: ["phone"],
    ms: 500,
    play: (E, t) => {
      M.drum(E, t, { f: 82, dec: 0.3, gain: 0.7 });
      M.drum(E, t + 0.16, { f: 110, dec: 0.3, gain: 0.6 });
      M.bell(E, t + 0.3, NOTE.A4, { gain: 0.5, dec: 1.6 });
    }
  },
  {
    id: "S10",
    name: "Won",
    where: ["tv"],
    ms: 120,
    play: (E, t) => {
      M.drum(E, t, { f: 120, dec: 0.18, gain: 0.8 });
      M.clack(E, t + 5e-3, { gain: 0.9 });
    }
  },
  {
    id: "S11",
    name: "To the bank",
    where: ["tv"],
    ms: 600,
    play: (E, t) => {
      swell(E, voice(E, { send: 0.1, bright: 0.4, gain: 1 }), t, { d: 0.5, f0: 900, f1: 420, peak: 0.18 });
      riffle(E, t + 0.25, 4, { pitch: 0.8, bright: 0.45, gain: 0.45, gap: 0.05 });
    }
  },
  {
    id: "S12",
    name: "Payout",
    where: ["phone", "tv"],
    ms: 300,
    play: (E, t) => riffle(E, t, 6, { pitch: 1.02, gap: 0.042, gain: 0.85 })
  },
  {
    id: "S13",
    name: "Advance",
    where: ["tv"],
    ms: 900,
    play: (E, t) => {
      swell(E, voice(E, { send: 0.15, bright: 0.6 }), t, { d: 0.75, f0: 600, f1: 1100, peak: 0.12 });
      M.knock(E, t + 0.8, { gain: 0.6 });
      M.clack(E, t + 0.81, { gain: 0.7 });
    }
  },
  {
    id: "S14",
    name: "Result posted",
    where: ["tv"],
    ms: 1500,
    play: (E, t) => {
      M.bell(E, t, NOTE.A4, { gain: 0.7, dec: 2.8 });
      M.bell(E, t + 0.07, NOTE.D5, { gain: 0.55, dec: 2.8 });
    }
  },
  {
    id: "S15",
    name: "New leader",
    where: ["tv", "phone"],
    ms: 1500,
    play: (E, t) => {
      M.bell(E, t, NOTE.A4, { gain: 0.6 });
      M.bell(E, t + 0.14, NOTE.D5, { gain: 0.75, dec: 2.6 });
    }
  },
  {
    id: "S16",
    name: "Challenged",
    where: ["phone"],
    ms: 250,
    play: (E, t) => {
      M.knock(E, t);
      M.knock(E, t + 0.13, { pitch: 1.04, gain: 0.85 });
    }
  },
  {
    id: "S17",
    name: "Duel won",
    where: ["phone"],
    ms: 300,
    play: (E, t) => riffle(E, t, 5, { pitch: 1.04, gap: 0.04, gain: 0.8 })
  },
  {
    id: "S18",
    name: "Pick",
    where: ["tv", "phone"],
    ms: 100,
    play: (E, t) => M.slap(E, t)
  },
  {
    id: "S19",
    name: "Your pick",
    where: ["phone"],
    ms: 900,
    play: (E, t) => {
      M.knock(E, t, { gain: 0.5 });
      M.bell(E, t + 0.02, NOTE.Fs5, { gain: 0.6, dec: 1.6, send: 0.25 });
    }
  },
  {
    id: "S20",
    name: "Deal",
    where: ["tv"],
    ms: 900,
    play: (E, t) => riffle(E, t, 12, { pitch: 0.95, gap: 0.07, gain: 0.55 })
  },
  {
    id: "S21",
    name: "Blinds up",
    where: ["tv"],
    ms: 3e3,
    play: (E, t) => {
      M.bowl(E, t, NOTE.A2, { gain: 0.9 });
      M.bowl(E, t, NOTE.D3, { gain: 0.35, dec: 3.5 });
    }
  },
  {
    id: "S22",
    name: "Bust",
    where: ["tv"],
    ms: 1200,
    play: (E, t) => spinDown(E, t, { dur: 1, gain: 0.8 })
  },
  {
    id: "S23",
    name: "Roll to the flood",
    where: ["tv"],
    ms: 1400,
    play: (E, t) => {
      roll(E, t, { dur: 0.6 });
      M.drum(E, t + 0.6, { f: NOTE.D2, dec: 1 });
      M.bell(E, t + 0.6, NOTE.D4, { gain: 0.6, dec: 3 });
      M.bell(E, t + 0.6, NOTE.A4, { gain: 0.5, dec: 3 });
    }
  },
  {
    id: "S24",
    name: "Champion's chip",
    where: ["tv", "phone"],
    ms: 1300,
    play: (E, t) => {
      M.clack(E, t, { gain: 1 });
      spinDown(E, t + 0.05, { dur: 1.15, gain: 0.7 });
    }
  },
  {
    id: "S25",
    name: "Saved",
    where: ["gm"],
    ms: 400,
    play: (E, t) => {
      M.clack(E, t, { gain: 0.35, double: false });
      M.bell(E, t + 0.01, NOTE.A5, { gain: 0.18, dec: 0.6, send: 0.1 });
    }
  },
  {
    id: "S26",
    name: "Didn't save",
    where: ["gm", "phone"],
    ms: 300,
    play: (E, t) => {
      M.felt(E, t, { gain: 0.7 });
      M.felt(E, t + 0.15, { gain: 0.55 });
    }
  }
].map(Object.freeze));
var PARTS = Object.freeze([
  {
    id: "ride",
    name: "Winners ride the connector",
    ms: 800,
    play: (E, t, o = {}) => swell(E, voice(E, { send: 0.15, bright: 0.6 }), t, { d: (o.ms || 800) / 1e3, f0: 600, f1: 1100, peak: 0.12 })
  },
  {
    id: "land",
    name: "They land in the next slot",
    ms: 120,
    play: (E, t) => {
      M.knock(E, t, { gain: 0.6 });
      M.clack(E, t + 0.01, { gain: 0.7 });
    }
  },
  {
    id: "upNow",
    name: "UP NOW moves on",
    ms: 1800,
    play: (E, t) => M.bell(E, t, NOTE.A4, { gain: 0.35, dec: 1.8 })
  },
  {
    id: "stepDown",
    name: "The other rows step down",
    ms: 300,
    play: (E, t) => riffle(E, t, 4, { pitch: 0.8, gain: 0.35, bright: 0.5, gap: 0.06 })
  },
  {
    id: "crownCount",
    name: "The final stack counts",
    ms: 1200,
    play: (E, t, o = {}) => riffle(E, t, 12, { gap: (o.ms || 1200) / 1e3 / 12, gain: 0.5, pitch: 0.98 })
  },
  {
    id: "crownCall",
    name: "The Field Day call, complete",
    ms: 4e3,
    play: (E, t) => {
      M.bell(E, t, NOTE.A4, { gain: 0.7 });
      M.bell(E, t + 0.17, NOTE.D5, { gain: 0.7 });
      M.bell(E, t + 0.34, NOTE.Fs5, { gain: 0.65 });
      M.bell(E, t + 0.62, NOTE.A5, { gain: 0.55, dec: 4 });
      M.drum(E, t + 0.62, { f: NOTE.D2, dec: 1.2, gain: 0.6 });
    }
  },
  {
    id: "faceOff",
    name: "The sides meet",
    ms: 600,
    play: (E, t) => {
      M.drum(E, t, { f: NOTE.D2, dec: 0.5, gain: 0.55 });
      M.knock(E, t + 0.02, { pitch: 0.85, gain: 0.45 });
    }
  },
  {
    id: "crowd",
    name: "Several chips at once",
    ms: 300,
    play: (E, t, o = {}) => riffle(E, t, Math.max(3, Math.min(6, o.n || 4)), { gain: 0.7, gap: 0.04 })
  }
].map(Object.freeze));
var SOUNDS = Object.freeze(Object.fromEntries([...KIT, ...PARTS].map((s) => [s.id, s])));
var SOUND_IDS = Object.freeze(KIT.map((s) => s.id));
var isSound = (id) => Object.prototype.hasOwnProperty.call(SOUNDS, id);
function playRecipe(E, id, t, { pan = 0, ...opts } = {}) {
  const s = SOUNDS[id];
  if (!s || !E) return false;
  const was = E.pan;
  E.pan = clampPan(pan);
  try {
    s.play(E, t, opts);
  } finally {
    E.pan = was;
  }
  return true;
}
var CHIP_DENSITY = Object.freeze({ minGap: 120, crowd: 3, window: 400 });

// src/lib/sound.js
init_serverClock();
init_frameGate();
var SOUND_KEY = "si-sound";
var MASTER_VOLUME = Object.freeze({ tv: 0.7, phone: 0.6 });
var BUSES = Object.freeze({ room: "tv", you: "phone", gm: "phone" });
var LATE_MS = 300;
var LOOKAHEAD_MS = 250;
var HUSH_RAMP_S = 0.15;
var storage2 = () => {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
};
var soundOptedOut = () => {
  try {
    return storage2()?.getItem(SOUND_KEY) === "off";
  } catch {
    return false;
  }
};
var busAllowed = (bus, surface) => !!BUSES[bus] && BUSES[bus] === (surface === "tv" ? "tv" : "phone");
function walkoutActive(walkout, now = serverNow()) {
  if (!walkout || typeof walkout !== "object") return false;
  const until = Number(walkout.until);
  return Number.isFinite(until) && now < until;
}
function hushReason({ walkout = null, quickDraw = false, now = serverNow() } = {}) {
  if (walkoutActive(walkout, now)) return "walkout";
  if (quickDraw) return "quickDraw";
  return null;
}
function scheduleTime({ at, now, currentTime = 0, outputLatency = 0, lateMs = LATE_MS }) {
  const target = Number(at);
  if (!Number.isFinite(target)) return null;
  const ahead = target - Number(now);
  if (ahead < -lateMs) return null;
  const latency = Math.max(0, Number(outputLatency) || 0);
  return Math.max(currentTime + 5e-3, currentTime + ahead / 1e3 - latency);
}
var GM_YIELD_MS = 400;
var ackYields = (id, lastYouAt, target) => id === "S25" && Number.isFinite(Number(lastYouAt)) && Number(lastYouAt) > 0 && Math.abs(Number(target) - Number(lastYouAt)) <= GM_YIELD_MS;
var engine = {
  ctx: null,
  E: null,
  surface: "phone",
  room: "fri",
  walkout: null,
  quickDraw: false,
  hushed: false,
  resuming: false,
  unlockedOnce: false,
  keys: [],
  chips: null,
  timers: /* @__PURE__ */ new Set(),
  walkoutTimer: null,
  lastYouAt: 0,
  factory: null,
  installed: false
};
var listeners2 = /* @__PURE__ */ new Set();
function notify() {
  for (const fn of [...listeners2]) {
    try {
      fn();
    } catch {
    }
  }
}
var contextClass = () => engine.factory || typeof globalThis !== "undefined" && (globalThis.AudioContext || globalThis.webkitAudioContext) || null;
function context(create) {
  if (engine.ctx || !create) return engine.ctx;
  const AC = contextClass();
  if (!AC) return null;
  try {
    if (engine.surface !== "tv" && globalThis.navigator?.audioSession) globalThis.navigator.audioSession.type = "ambient";
  } catch {
  }
  try {
    const ctx = new AC({ latencyHint: "interactive" });
    engine.ctx = ctx;
    engine.E = makeEngine(ctx, {
      room: engine.room,
      listen: engine.surface === "tv" ? "tv" : "phone",
      volume: MASTER_VOLUME[engine.surface === "tv" ? "tv" : "phone"]
    });
    ctx.onstatechange = () => {
      if (ctx.state === "running") engine.resuming = false;
      notify();
    };
    applyHush(true);
    notify();
  } catch {
    engine.ctx = null;
    engine.E = null;
  }
  return engine.ctx;
}
var running = (ctx) => !!ctx && (ctx.state === "running" || engine.resuming);
function resume(ctx) {
  if (!ctx || ctx.state === "running" || ctx.state === "closed") return;
  engine.resuming = true;
  try {
    const p = ctx.resume();
    if (p?.then) p.then(() => {
      engine.resuming = false;
      notify();
    }, () => {
      engine.resuming = false;
      notify();
    });
  } catch {
    engine.resuming = false;
  }
}
function unlockSound() {
  if (soundOptedOut()) return false;
  const ctx = context(true);
  if (!ctx) return false;
  resume(ctx);
  if (!engine.unlockedOnce) {
    engine.unlockedOnce = true;
    try {
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate || 44100);
      src.connect(ctx.destination);
      src.start(0);
    } catch {
    }
  }
  return true;
}
function isHushed(now = serverNow()) {
  return !!hushReason({ walkout: engine.walkout, quickDraw: engine.quickDraw, now });
}
function applyHush(immediate = false) {
  const hushed = isHushed();
  engine.hushed = hushed;
  const E = engine.E;
  if (!E) return;
  try {
    const g = E.hush.gain, t = E.ctx.currentTime;
    g.cancelScheduledValues(t);
    if (immediate) g.setValueAtTime(hushed ? 0 : 1, t);
    else {
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(hushed ? 0 : 1, t + HUSH_RAMP_S);
    }
  } catch {
  }
}
var KEY_MEMORY = 200;
function seenKey(key) {
  if (key === null || key === void 0) return false;
  const k = String(key);
  if (engine.keys.includes(k)) return true;
  engine.keys.push(k);
  if (engine.keys.length > KEY_MEMORY) engine.keys.shift();
  return false;
}
function playSound(id, { bus = "you", at = null, delayMs = 0, pan = 0, key = null, lateMs = LATE_MS, opts = {} } = {}) {
  try {
    if (!isSound(id) || soundOptedOut() || !busAllowed(bus, engine.surface)) return null;
    const ctx = context(false);
    if (!running(ctx) || !engine.E) return null;
    const now = serverNow();
    const target = at === null || at === void 0 ? now + Math.max(0, Number(delayMs) || 0) : Number(at);
    if (!Number.isFinite(target) || target - now < -lateMs) return null;
    if (isHushed(Math.max(now, target))) return null;
    if (bus === "gm" && ackYields(id, engine.lastYouAt, target)) return null;
    if (seenKey(key)) return null;
    if (bus === "you") engine.lastYouAt = target;
    const fire = () => {
      if (soundOptedOut() || !busAllowed(bus, engine.surface) || isHushed(target) || !engine.E) return;
      const c = engine.ctx;
      const when = scheduleTime({
        at: target,
        now: serverNow(),
        currentTime: c.currentTime,
        outputLatency: c.outputLatency || c.baseLatency || 0,
        lateMs
      });
      if (when === null) return;
      playRecipe(engine.E, id, when, { pan, ...opts });
      try {
        globalThis.__FD_SOUND_LOG__?.push?.({ id, bus, at: target, when, currentTime: c.currentTime, pan });
      } catch {
      }
    };
    const wait = target - now - LOOKAHEAD_MS;
    if (wait <= 0) {
      fire();
      return { cancel() {
      } };
    }
    let timer = null;
    timer = setTimeout(() => {
      engine.timers.delete(timer);
      fire();
    }, wait);
    engine.timers.add(timer);
    return { cancel() {
      clearTimeout(timer);
      engine.timers.delete(timer);
    } };
  } catch {
    return null;
  }
}

// src/features/weekend/drawPath.js
init_core();
var decided = (value) => value !== null && value !== void 0;
var teamPlayers = (draw, index) => [...draw?.teams?.[index]?.players || []];
function feedsInto(bracket, r, m) {
  const rounds = bracket.rounds || [];
  for (let next = r + 1; next < rounds.length; next++)
    for (let index = 0; index < rounds[next].length; index++) {
      const match = rounds[next][index];
      for (const side of ["a", "b"]) {
        const slot = match[side];
        if (slot?.w && slot.w[0] === r && slot.w[1] === m) return { r: next, m: index, side };
      }
    }
  return null;
}
function opponentStop(bracket, draw, slot) {
  const seated = resolveSlot(bracket, slot);
  if (decided(seated)) return { opponents: teamPlayers(draw, seated), from: null, candidates: [] };
  if (!slot?.w) return { opponents: null, from: null, candidates: [] };
  const [r, m] = slot.w;
  const feeder = bracket.rounds?.[r]?.[m];
  const a = feeder ? resolveSlot(bracket, feeder.a) : null, b = feeder ? resolveSlot(bracket, feeder.b) : null;
  return {
    opponents: null,
    from: bracketMatchName(bracket, r, m),
    candidates: decided(a) && decided(b) ? [teamPlayers(draw, a), teamPlayers(draw, b)] : []
  };
}
function bracketDrawPath(state, evId, me) {
  const bracket = state?.brackets?.[evId], draw = state?.draws?.[evId];
  if (!bracket?.rounds?.length || !draw?.teams || !me) return null;
  const team = draw.teams.findIndex((item) => (item?.players || []).includes(me));
  if (team < 0) return null;
  let at = null;
  bracket.rounds.forEach((matches, r) => matches.forEach((match, m) => {
    if (at) return;
    if (resolveSlot(bracket, match.a) === team) at = { r, m, side: "a" };
    else if (resolveSlot(bracket, match.b) === team) at = { r, m, side: "b" };
  }));
  if (!at) return null;
  const steps = [];
  for (let guard = 0; at && guard < 8; guard++) {
    const match = bracket.rounds[at.r][at.m];
    const mine = at.side;
    const final = at.r === bracket.rounds.length - 1;
    const stop = opponentStop(bracket, draw, match[mine === "a" ? "b" : "a"]);
    const won = decided(match.winner) && match.winner === team;
    const lost = decided(match.winner) && match.winner !== team;
    steps.push({
      id: `${at.r}:${at.m}`,
      label: bracketMatchName(bracket, at.r, at.m),
      final,
      ...stop,
      won,
      lost
    });
    if (lost) break;
    at = feedsInto(bracket, at.r, at.m);
  }
  return { kind: "bracket", evId, team, steps };
}
function stageDrawPath(state, evId, me) {
  const stage = state?.stages?.[evId];
  if (!stage?.groups?.length || !me) return null;
  const team = stage.entrantType === "team";
  const draw = state?.draws?.[evId];
  const playersOf = (key) => team ? teamPlayers(draw, key) : [key];
  const group = stage.groups.find((item) => (item.entrants || []).some((key) => playersOf(key).includes(me)));
  if (!group) return null;
  const own = (group.entrants || []).find((key) => playersOf(key).includes(me));
  const rivals = (group.entrants || []).filter((key) => key !== own).map(playersOf);
  const advance = Math.max(1, Number(stage.advance) || 1);
  const noun = stage.kind === "pools" ? "pool" : "heat";
  const through = group.through || [];
  const out = through.length >= advance && !through.includes(own);
  const steps = [
    {
      id: `group:${group.name}`,
      label: group.name,
      final: false,
      opponents: rivals.flat(),
      from: null,
      candidates: [],
      note: advance === 1 ? "Winner goes through" : `Top ${advance} go through`,
      won: through.includes(own),
      lost: out
    }
  ];
  if (!out) steps.push({
    id: "final",
    label: "Final",
    final: true,
    opponents: null,
    from: `${stage.groups.length} ${noun} winner${stage.groups.length === 1 ? "" : "s"}`,
    candidates: [],
    won: false,
    lost: false
  });
  return { kind: "stage", evId, steps };
}
function drawPath(state, reveal, me) {
  if (!reveal?.evId || !me) return null;
  const { evId } = reveal;
  const stage = state?.stages?.[evId], draw = state?.draws?.[evId];
  if (stage && reveal.id === stage.id) return stageDrawPath(state, evId, me);
  if (!draw || reveal.id !== draw.id) return null;
  if (state.brackets?.[evId]) return bracketDrawPath(state, evId, me);
  if (stage && (!stage.drawId || stage.drawId === draw.id)) return stageDrawPath(state, evId, me);
  return null;
}
function drawPathText(path, nameOf2 = (player) => player) {
  if (!path?.steps?.length) return "";
  return path.steps.map((step) => {
    const who = step.opponents?.length ? ` vs ${step.opponents.map(nameOf2).join(" & ")}` : step.from ? ` vs ${step.from}${path.kind === "bracket" ? " winner" : ""}` : "";
    return `${step.label}${who}${step.note ? ` (${step.note})` : ""}`;
  }).join(", then ");
}

// src/features/weekend/DrawPath.jsx
init_core();
init_PlayerIdentity();
import React8 from "react";
var Faces = ({ players, size, cls = "" }) => /* @__PURE__ */ React8.createElement("span", { className: `fd-draw-path-faces${cls}` }, players.map((player) => /* @__PURE__ */ React8.createElement(ChipFace, { key: player, p: player, size, flat: true })));
function DrawPathLine({ state, path, me, animate = false }) {
  if (!path?.steps?.length || !me) return null;
  const stops = [{ id: "you", you: true }, ...path.steps];
  const text = drawPathText(path, (player) => disp(state, player));
  return /* @__PURE__ */ React8.createElement(
    "div",
    {
      className: `fd-draw-path${animate ? " is-drawing" : ""}`,
      role: "img",
      "aria-label": `Your path: ${text}`,
      style: { "--path-stops": stops.length, "--path-steps": path.steps.length }
    },
    /* @__PURE__ */ React8.createElement("i", { className: "fd-draw-path-line", "aria-hidden": "true" }),
    /* @__PURE__ */ React8.createElement("ol", { "aria-hidden": "true" }, stops.map((stop, index) => /* @__PURE__ */ React8.createElement(
      "li",
      {
        key: stop.id,
        style: { "--i": index },
        className: `${stop.you ? "is-you" : ""}${stop.final ? " is-final" : ""}${stop.won ? " is-won" : ""}${stop.lost ? " is-lost" : ""}`
      },
      /* @__PURE__ */ React8.createElement("span", { className: "fd-draw-path-node" }, stop.you ? /* @__PURE__ */ React8.createElement(ChipFace, { p: me, size: 30, flat: true }) : /* @__PURE__ */ React8.createElement("i", { className: "fd-draw-path-dot" })),
      /* @__PURE__ */ React8.createElement("b", null, stop.you ? "You" : stop.label),
      !stop.you && (stop.opponents?.length ? /* @__PURE__ */ React8.createElement(Faces, { players: stop.opponents, size: 26 }) : stop.candidates?.length ? /* @__PURE__ */ React8.createElement("span", { className: "fd-draw-path-either" }, stop.candidates.map((team, i) => /* @__PURE__ */ React8.createElement(React8.Fragment, { key: i }, i > 0 && /* @__PURE__ */ React8.createElement("small", null, "or"), /* @__PURE__ */ React8.createElement(Faces, { players: team, size: 24, cls: " is-candidate" })))) : stop.from ? /* @__PURE__ */ React8.createElement("small", null, path.kind === "bracket" ? `${stop.from} winner` : stop.from) : null),
      stop.note && /* @__PURE__ */ React8.createElement("small", { className: "fd-draw-path-note" }, stop.note)
    )))
  );
}

// src/features/weekend/EventAnnouncement.jsx
init_frameGate();
function EventAnnouncement({ state, ev, handoff, onClose, onBets, holdMs = 3e3, visual, now: clockNow = serverNow }) {
  const contest = resolveCurrentContest(state, ev);
  const detail = [
    !handoff && (contest?.kind !== "ffa" ? contest?.label : "One winner"),
    awardTable(ev)[0] ? `${awardTable(ev)[0].toLocaleString("en-US")} chips to win` : null
  ].filter(Boolean).join(" \xB7 ");
  const [elapsed] = useState8(() => {
    const introAt = handoff ? revealTimeline(state, ev.id)?.introAt : null;
    return introAt ? Math.min(holdMs, Math.max(0, clockNow() - introAt)) : 0;
  });
  return /* @__PURE__ */ React9.createElement(Sheet, { title: ev.name, subtitle: handoff ? "On deck" : "Betting open", onClose, layer: 290, className: "fd-announcement" }, visual && /* @__PURE__ */ React9.createElement("div", { className: "fd-announcement-game" }, visual), /* @__PURE__ */ React9.createElement("div", { className: `fd-announcement-summary${handoff ? " is-handoff" : ""}` }, !visual && /* @__PURE__ */ React9.createElement("div", { className: "fd-announcement-mark" }, /* @__PURE__ */ React9.createElement(GameMark, { id: ev.game, size: 64 })), /* @__PURE__ */ React9.createElement("div", null, ev.desc && /* @__PURE__ */ React9.createElement("p", null, ev.desc), /* @__PURE__ */ React9.createElement("small", null, detail))), handoff && /* @__PURE__ */ React9.createElement(
    "div",
    {
      className: "fd-announcement-handoff",
      "aria-hidden": "true",
      style: { "--intro-hold": `${holdMs}ms`, "--intro-elapsed": `${-Math.round(elapsed)}ms` }
    },
    /* @__PURE__ */ React9.createElement("span", null)
  ), /* @__PURE__ */ React9.createElement("div", { className: "fd-announcement-actions" }, onBets && /* @__PURE__ */ React9.createElement(ActionButton, { onClick: onBets }, "Place chips"), /* @__PURE__ */ React9.createElement(ActionButton, { variant: onBets ? "secondary" : "primary", onClick: onClose }, handoff ? "View draw" : "Done")));
}
function useReducedMotion2(override) {
  const [reduced, setReduced] = useState8(() => typeof window === "undefined" || !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  useEffect7(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!media) return;
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);
  return override ?? reduced;
}
function DrawAnnouncement({
  state,
  reveal,
  me = null,
  synced = false,
  onClose,
  onBets,
  onPlayer,
  onBack,
  initialComplete = false,
  reducedMotion: motionOverride,
  now: clockNow = serverNow
}) {
  const groups = drawRevealGroups(state, reveal);
  const total = groups.length + (reveal.crew?.length ? 1 : 0);
  const reducedMotion = useReducedMotion2(motionOverride);
  const startAt = synced && !initialComplete ? revealTimeline(state, reveal.evId, { reveal, reducedMotion })?.revealAt ?? null : null;
  const [joined] = useState8(() => reducedMotion || initialComplete ? total : startAt !== null ? drawStepAt(clockNow() - startAt, total) : 0);
  const [shown, setShown] = useState8(joined);
  const [run, setRun] = useState8(0);
  const animate = !reducedMotion && !(run === 0 && (initialComplete || joined >= total));
  const playback = useRef5(null);
  useEffect7(() => {
    const next = startDrawPlayback({
      total,
      reducedMotion: !animate,
      onStep: setShown,
      ...run === 0 && startAt !== null ? { startAt, now: clockNow } : {}
    });
    playback.current = next;
    return () => next.stop();
  }, [reveal.id, total, animate, run, startAt]);
  const mineIndex = me ? groups.findIndex((group) => group.lines.some((line) => (line.avatars || []).includes(me))) : -1;
  useEffect7(() => {
    if (startAt === null || mineIndex < 0 || !reducedMotion && mineIndex < joined) return;
    if (!currentFrame().fresh) return;
    playSound("S4", { at: reducedMotion ? startAt : startAt + drawStepDelay(mineIndex, total), key: `card:${reveal.id}` });
  }, [reveal.id]);
  const you = usePlayerIdentity(me);
  const youStyle = { "--fd-you": you.color, "--fd-you-ink": you.isLight ? "var(--ink0)" : "var(--bone)" };
  const complete = shown >= total;
  const path = synced && mineIndex >= 0 ? drawPath(state, reveal, me) : null;
  const actions = /* @__PURE__ */ React9.createElement("div", { className: "fd-announcement-actions" }, onBets && /* @__PURE__ */ React9.createElement(ActionButton, { onClick: onBets }, "Place chips"), /* @__PURE__ */ React9.createElement(ActionButton, { variant: onBets ? "secondary" : "primary", onClick: onClose }, "Done"));
  const skip = () => playback.current?.skip();
  const replay = () => {
    playback.current?.stop();
    setShown(reducedMotion ? total : 0);
    setRun((value) => value + 1);
  };
  const playerButton = (player, visible, index = 0) => /* @__PURE__ */ React9.createElement(
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
    /* @__PURE__ */ React9.createElement(Avatar, { state, p: player, size: 30 }),
    /* @__PURE__ */ React9.createElement("span", null, disp(state, player))
  );
  return /* @__PURE__ */ React9.createElement(Sheet, { title: reveal.subtitle || reveal.title, subtitle: reveal.subtitle ? reveal.title : "The draw", onClose, onBack, layer: 300, className: "fd-announcement" }, /* @__PURE__ */ React9.createElement("div", { className: "fd-draw-playback" }, /* @__PURE__ */ React9.createElement("div", { className: `fd-draw-deck${complete ? " is-complete" : ""}`, "aria-hidden": "true" }, /* @__PURE__ */ React9.createElement("i", null), /* @__PURE__ */ React9.createElement("i", null), /* @__PURE__ */ React9.createElement("i", null, "FD")), /* @__PURE__ */ React9.createElement("span", { role: "status", "aria-live": "polite" }, complete ? "Draw complete" : "Revealing the draw"), /* @__PURE__ */ React9.createElement("button", { type: "button", className: "fd-draw-playback-action", onClick: complete ? replay : skip }, complete ? "Replay draw" : "Skip animation")), /* @__PURE__ */ React9.createElement("div", { className: `fd-draw-announcement${!animate ? " is-reduced" : ""}`, key: run }, groups.map((group, index) => {
    const visible = index < shown;
    const settled = run === 0 && index < joined;
    const mine = !!me && group.lines.some((line) => (line.avatars || []).includes(me));
    const ring = mine && visible && animate && !settled;
    const lines = group.lines.map((line, j) => {
      const people = line.avatars || [];
      const namedTeam = line.text && people.length > 1 && line.text !== people.map((player) => disp(state, player)).join(" & ") && line.text !== group.title;
      const body = /* @__PURE__ */ React9.createElement(React9.Fragment, null, namedTeam && /* @__PURE__ */ React9.createElement("strong", { className: "fd-draw-team-name" }, line.text), /* @__PURE__ */ React9.createElement("div", { className: "fd-draw-people" }, people.length ? people.map((player, playerIndex) => playerButton(player, visible, playerIndex)) : /* @__PURE__ */ React9.createElement("span", null, line.text)));
      if (group.bye) return /* @__PURE__ */ React9.createElement(
        "div",
        {
          key: j,
          style: { "--deal-index": j },
          className: `fd-draw-bye${me && people.includes(me) ? " is-mine" : ""}`
        },
        body
      );
      return /* @__PURE__ */ React9.createElement(React9.Fragment, { key: j }, group.vs && j > 0 && /* @__PURE__ */ React9.createElement("small", { className: "fd-draw-versus" }, "vs"), body);
    });
    return /* @__PURE__ */ React9.createElement(
      "section",
      {
        key: index,
        style: mine ? youStyle : void 0,
        className: `fd-draw-card ${visible ? "is-revealed" : "is-covered"}${group.bye ? " is-byes" : ""}${settled ? " is-settled" : ""}${mine && visible ? " is-mine" : ""}${ring ? " is-ringing" : ""}`
      },
      /* @__PURE__ */ React9.createElement("div", { className: "fd-draw-card-back", "aria-hidden": "true" }, /* @__PURE__ */ React9.createElement("span", null, String(index + 1).padStart(2, "0"))),
      ring && /* @__PURE__ */ React9.createElement("i", { className: "fd-draw-ring", "aria-hidden": "true" }),
      /* @__PURE__ */ React9.createElement("div", { className: "fd-draw-card-front", "aria-hidden": !visible }, /* @__PURE__ */ React9.createElement("h3", null, group.title, mine && visible && /* @__PURE__ */ React9.createElement("span", { className: "fd-draw-you" }, "You")), group.bye ? /* @__PURE__ */ React9.createElement("div", { className: "fd-draw-byes" }, lines) : lines)
    );
  })), !!reveal.crew?.length && /* @__PURE__ */ React9.createElement("div", { className: `fd-draw-crew ${complete ? "is-revealed" : "is-covered"}`, "aria-hidden": !complete }, reveal.crew.map((role) => /* @__PURE__ */ React9.createElement("div", { key: role.player }, playerButton(role.player, complete), /* @__PURE__ */ React9.createElement("span", null, overflowRoleMeta(role.role).label)))), path && complete ? /* @__PURE__ */ React9.createElement("div", { className: `fd-draw-footer${animate ? " is-drawing" : ""}`, style: youStyle, key: `path-${run}` }, /* @__PURE__ */ React9.createElement(DrawPathLine, { state, path, me, animate }), actions) : actions);
}

// src/features/draft/DraftSheet.jsx
init_core();
init_controls();
init_PlayerIdentity();
init_playerIdentity();
import React10, { useEffect as useEffect8, useRef as useRef7, useState as useState10 } from "react";
init_motion();

// src/lib/motionKit.js
init_motion();
import { useLayoutEffect as useLayoutEffect3, useRef as useRef6, useState as useState9 } from "react";
function useFreshHold(value, key = null, ms = MOTION.story, options) {
  const change = useFreshChange(value, key, options);
  const [held, setHeld] = useState9(0);
  useLayoutEffect3(() => {
    if (!change.animate) return void 0;
    setHeld(change.changeId);
    const t = setTimeout(() => setHeld((current) => current === change.changeId ? 0 : current), ms);
    return () => clearTimeout(t);
  }, [change.changeId]);
  return change.animate ? change.changeId : held;
}
function childOffsets(container, attr = "data-flip") {
  const map = /* @__PURE__ */ new Map();
  if (!container || typeof container.getBoundingClientRect !== "function") return map;
  const box = container.getBoundingClientRect();
  const scale = container.offsetWidth ? box.width / container.offsetWidth || 1 : 1;
  for (const el of container.querySelectorAll(`[${attr}]`)) {
    const r = el.getBoundingClientRect();
    map.set(el.getAttribute(attr), {
      left: (r.left - box.left) / scale,
      top: (r.top - box.top) / scale,
      width: r.width / scale,
      height: r.height / scale
    });
  }
  return map;
}
function flipMoves(before, after, { threshold = 0.5 } = {}) {
  const moves = [], entering = [];
  for (const [key, to] of after) {
    const from = before?.get(key);
    if (!from) {
      entering.push(key);
      continue;
    }
    const dx = from.left - to.left, dy = from.top - to.top;
    if (Math.abs(dx) >= threshold || Math.abs(dy) >= threshold) moves.push({ key, dx, dy });
  }
  return { moves, entering };
}
function useFlip(ref, {
  play = false,
  attr = "data-flip",
  duration = MOTION.rowSlide,
  delay = 0,
  stagger = 0,
  easing = EASE.out,
  enter = true,
  onPlay = null
} = {}) {
  const last = useRef6(null);
  useLayoutEffect3(() => {
    const container = ref.current;
    const before = last.current;
    const after = childOffsets(container, attr);
    last.current = after;
    if (!play || !before || !container || prefersReducedMotion()) return;
    try {
      onPlay?.(before, after, container);
    } catch {
    }
    const { moves, entering } = flipMoves(before, after);
    const find = (key) => container.querySelector(`[${attr}="${typeof CSS !== "undefined" && CSS.escape ? CSS.escape(key) : key}"]`);
    moves.forEach(({ key, dx, dy }, index) => {
      const el = find(key);
      if (typeof el?.animate !== "function") return;
      try {
        el.animate(
          [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }],
          { duration, delay: delay + index * stagger, easing, fill: "backwards" }
        );
      } catch {
      }
    });
    if (enter) entering.forEach((key, index) => {
      const el = find(key);
      if (typeof el?.animate !== "function") return;
      try {
        el.animate(
          [{ opacity: 0, transform: "translateX(12px)" }, { opacity: 1, transform: "none" }],
          { duration: MOTION.base, delay: delay + (moves.length + index) * stagger, easing, fill: "backwards" }
        );
      } catch {
      }
    });
  });
}

// src/features/draft/draftModel.js
init_core();
function landedPick(draft, change) {
  if (!draft || !change?.fresh) return null;
  const { from, to } = change;
  if (!Number.isInteger(from) || to !== from + 1 || draft.picks.length !== to) return null;
  const pick = draft.picks[to - 1];
  return pick ? { player: pick.player, team: pick.team, pick: to } : null;
}

// src/features/draft/DraftSheet.jsx
var identityStyle = (state, player) => ({ "--draft-color": resolvePlayerIdentity(state.profiles, player).color });
var reference = (turn) => ({ draftId: turn.draftId, pickIndex: turn.pickIndex, draftRevision: turn.draftRevision });
function PlayerLink({ state, player, onPlayer, children, disabled }) {
  return /* @__PURE__ */ React10.createElement(
    "button",
    {
      type: "button",
      className: "fd-draft-person",
      disabled: disabled || !onPlayer,
      onClick: () => onPlayer?.(player),
      "aria-label": `View ${disp(state, player)}'s player card`
    },
    /* @__PURE__ */ React10.createElement(Avatar, { state, p: player, size: 30 }),
    /* @__PURE__ */ React10.createElement("span", null, children || disp(state, player))
  );
}
function DraftEntry({ state, ev, me, onOpen }) {
  const draft = state.drafts?.[ev?.id];
  if (!draft || state.draws?.[ev.id]) return null;
  const turn = draftTurn(draft), mine = turn.captain === me;
  return /* @__PURE__ */ React10.createElement(
    "button",
    {
      type: "button",
      className: `fd-draft-entry${mine ? " is-mine" : ""}`,
      onClick: onOpen,
      "aria-label": `Open ${ev.name} draft`
    },
    /* @__PURE__ */ React10.createElement(BankChip, { p: turn.captain || draft.teams[0].captain, size: 44 }),
    /* @__PURE__ */ React10.createElement("span", null, /* @__PURE__ */ React10.createElement("small", null, turn.complete ? "Teams picked" : mine ? "Your pick" : "Draft in progress"), /* @__PURE__ */ React10.createElement("strong", null, ev.name), /* @__PURE__ */ React10.createElement("span", null, turn.complete ? "Waiting for teams to be confirmed" : `Pick ${turn.pickIndex + 1} \xB7 ${disp(state, turn.captain)}`)),
    /* @__PURE__ */ React10.createElement("b", { "aria-hidden": "true" }, "\u2197")
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
  const [captains, setCaptains] = useState10([]), [method, setMethod] = useState10("pick");
  const [pending, setPending] = useState10(""), [error, setError] = useState10("");
  const [confirmCancel, setConfirmCancel] = useState10(false);
  const saving = useRef7(false), board = useRef7(null), focusAfterPick = useRef7(false);
  const turn = draft ? draftTurn(draft) : null;
  const poolBox = useRef7(null), queueBox = useRef7(null);
  const [arriving, setArriving] = useState10(null), [landed, setLanded] = useState10(null);
  const pickChange = useFreshChange(draft?.picks?.length ?? null, draft?.id || null);
  const landing = pickChange.animate ? landedPick(draft, pickChange) : null;
  const passing = useFreshHold(draft?.picks?.length ?? null, draft?.id || null, MOTION.story * 2);
  const handing = useFreshHold(turn?.captain ?? null, draft?.id || null, MOTION.story * 2);
  useFlip(queueBox, { play: !!landing, delay: MOTION.base, duration: MOTION.base });
  useFlip(poolBox, { play: !!landing, delay: 300, duration: 280, stagger: 25, enter: false, onPlay: (before) => {
    const from = before.get(landing.player), box = poolBox.current?.getBoundingClientRect();
    const seat = board.current?.querySelector(`[data-seat="${landing.player}"]`);
    if (!from || !box || !seat) return;
    const target = seat.getBoundingClientRect(), view = window.innerHeight || 0;
    const offscreen = !rectVisible(target);
    const to = offscreen ? {
      left: target.left,
      width: target.width,
      height: target.height,
      top: target.top > view ? view - target.height * 0.6 : -target.height * 0.4
    } : seat;
    setArriving(landing.player);
    fly({ left: box.left + from.left, top: box.top + from.top, width: from.width, height: from.height }, to, {
      node: /* @__PURE__ */ React10.createElement(PickFlyer, { state, player: landing.player }),
      duration: MOTION.cardFlight,
      arc: offscreen ? 0 : 36,
      fade: offscreen
    }).then(() => {
      setArriving((current) => current === landing.player ? null : current);
      setLanded(landing.player);
    });
  } });
  useEffect8(() => {
    if (!landed) return void 0;
    const t = setTimeout(() => setLanded(null), MOTION.story);
    return () => clearTimeout(t);
  }, [landed]);
  const blocked = !!state.frozen || !!state.poker && !state.results?.[state.poker.id] || !!state.results?.[ev.id] || !!state.shelved?.[ev.id] || state.onDeck === ev.id || !!state.eventOps?.[ev.id]?.bettingOpenedAt || !!state.eventOps?.[ev.id]?.startedAt;
  const myTurn = !!turn?.captain && turn.captain === me;
  const canPick = !!turn && !turn.complete && (gm || myTurn) && !blocked;
  const submit = async (name, action, after) => {
    if (saving.current) return { ok: false, error: "Still saving." };
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
  useEffect8(() => {
    if (!pending && focusAfterPick.current) {
      board.current?.focus({ preventScroll: true });
      focusAfterPick.current = false;
    }
  }, [pending, turn?.draftRevision]);
  const fit2 = draft?.fit || (pool ? teamFit(ev, pool.length + roles.length) : null) || ev.teamCfg;
  const n = fit2?.teams || 2, size = fit2?.size || 2;
  const chooseMethod = (next) => {
    if (saving.current) return;
    setMethod(next);
    if (next === "random") setCaptains(shuffle(pool || []).slice(0, n));
    else if (next === "seed") setCaptains([...pool || []].sort((a, b) => playerStrength(state, b, ev.sport, standings.length ? standings : void 0) - playerStrength(state, a, ev.sport, standings.length ? standings : void 0)).slice(0, n));
    else setCaptains([]);
  };
  const toggleCaptain = (player) => {
    if (saving.current) return;
    setMethod("pick");
    setCaptains((previous) => previous.includes(player) ? previous.filter((p) => p !== player) : previous.length < n ? [...previous, player] : previous);
  };
  const crew = draft?.roles || roles;
  const shell = (children) => /* @__PURE__ */ React10.createElement(
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
  const confirmed = state.draws?.[ev.id];
  if (!draft && confirmed?.sourceDraftId && (!pool || !gm)) return shell(/* @__PURE__ */ React10.createElement(
    ConfirmedTeams,
    {
      state,
      draw: confirmed,
      me,
      size,
      onPlayer
    }
  ));
  if (!draft && (!pool || !gm)) return shell(/* @__PURE__ */ React10.createElement("p", null, "Draft closed."));
  if (!draft) return shell(/* @__PURE__ */ React10.createElement("div", { className: "fd-draft" }, /* @__PURE__ */ React10.createElement("div", { className: "fd-draft-section-title" }, /* @__PURE__ */ React10.createElement("h2", null, "Choose ", n, " captains"), /* @__PURE__ */ React10.createElement("span", null, n, " teams of ", size)), /* @__PURE__ */ React10.createElement("p", { className: "fd-draft-note" }, "Pick order reverses each round."), /* @__PURE__ */ React10.createElement("div", { className: "fd-draft-methods", "aria-label": "Choose captains" }, [["pick", "Choose"], ["seed", "Balanced"], ["random", "Random"]].map(([id, text]) => /* @__PURE__ */ React10.createElement(
    "button",
    {
      type: "button",
      key: id,
      "aria-pressed": method === id,
      disabled: !!pending,
      onClick: () => chooseMethod(id)
    },
    text
  ))), /* @__PURE__ */ React10.createElement("ol", { className: "fd-draft-captain-order", "aria-label": "Captain pick order" }, Array.from({ length: n }, (_, index) => /* @__PURE__ */ React10.createElement("li", { key: `${index}:${captains[index] || "empty"}`, className: captains[index] ? "is-filled" : "" }, /* @__PURE__ */ React10.createElement("small", null, index + 1), captains[index] ? /* @__PURE__ */ React10.createElement(
    "button",
    {
      type: "button",
      disabled: !!pending,
      onClick: () => toggleCaptain(captains[index]),
      "aria-label": `Remove ${disp(state, captains[index])} as captain`
    },
    /* @__PURE__ */ React10.createElement(BankChip, { p: captains[index], size: 36 }),
    /* @__PURE__ */ React10.createElement("span", null, disp(state, captains[index])),
    /* @__PURE__ */ React10.createElement("b", { "aria-hidden": "true" }, "\xD7")
  ) : /* @__PURE__ */ React10.createElement("span", null, "Captain ", index + 1)))), /* @__PURE__ */ React10.createElement("div", { className: "fd-draft-pool", "aria-label": "Players" }, (pool || []).map((player) => /* @__PURE__ */ React10.createElement("div", { className: "fd-draft-candidate", key: player }, /* @__PURE__ */ React10.createElement(
    "button",
    {
      type: "button",
      className: "fd-draft-select",
      "aria-label": `Choose ${disp(state, player)} as captain`,
      "aria-pressed": captains.includes(player),
      disabled: !!pending || !captains.includes(player) && captains.length === n,
      onClick: () => toggleCaptain(player)
    },
    /* @__PURE__ */ React10.createElement(Avatar, { state, p: player, size: 36 }),
    /* @__PURE__ */ React10.createElement("span", null, disp(state, player)),
    /* @__PURE__ */ React10.createElement("b", { "aria-hidden": "true" }, captains.includes(player) ? captains.indexOf(player) + 1 : "+")
  )))), !!crew.length && /* @__PURE__ */ React10.createElement(DraftCrew, { state, roles: crew, onPlayer, disabled: !!pending }), error && /* @__PURE__ */ React10.createElement("p", { className: "fd-draft-error", role: "alert" }, error), /* @__PURE__ */ React10.createElement("div", { className: "fd-draft-footer" }, /* @__PURE__ */ React10.createElement(
    ActionButton,
    {
      disabled: captains.length !== n || blocked,
      pending: !!pending,
      onClick: () => submit("start", () => onStart(captains, pool))
    },
    pending ? "Starting\u2026" : "Start the draft"
  ))));
  const last = draft.picks.at(-1), ref = reference(turn);
  const remainingOrder = Array.from({ length: Math.min(turn.remaining, n + 1) }, (_, offset2) => ({
    pick: turn.pickIndex + offset2,
    team: snakeTeam(turn.pickIndex + offset2, n)
  }));
  const pick = (player) => {
    if (!canPick || saving.current) return;
    tapTick();
    unlockSound();
    focusAfterPick.current = true;
    return submit(
      `pick:${player}`,
      () => onPick(player, ref),
      () => playSound("S18", { bus: "you", delayMs: prefersReducedMotion() ? 0 : MOTION.cardFlight })
    );
  };
  return shell(/* @__PURE__ */ React10.createElement("div", { className: `fd-draft${passing ? " is-fresh" : ""}${handing ? " is-passing" : ""}`, ref: board, tabIndex: -1 }, /* @__PURE__ */ React10.createElement(
    "section",
    {
      className: `fd-draft-turn${myTurn ? " is-mine" : ""}${turn.complete ? " is-complete" : ""}`,
      "aria-label": "Current pick",
      style: identityStyle(state, turn.captain || draft.teams[0].captain)
    },
    /* @__PURE__ */ React10.createElement("div", { className: "fd-draft-turn-copy", key: `${draft.id}:${turn.draftRevision}` }, /* @__PURE__ */ React10.createElement("small", null, turn.complete ? `${draft.teams.length} teams \xB7 ${size} players each` : `Round ${turn.round} \xB7 Pick ${turn.pickIndex + 1} of ${turn.totalPicks}`), /* @__PURE__ */ React10.createElement("h2", null, turn.complete ? "Teams picked" : myTurn ? "Your pick" : `${disp(state, turn.captain)}'s pick`), (turn.complete || canPick && gm && !myTurn) && /* @__PURE__ */ React10.createElement("p", null, turn.complete ? gm ? "Confirm the teams to reveal the draw." : "Waiting for the commissioner to confirm." : `Picking for ${disp(state, turn.captain)}`)),
    /* @__PURE__ */ React10.createElement("span", { className: "fd-draft-turn-chip", key: `${draft.id}:${turn.captain || "done"}`, "aria-hidden": "true" }, /* @__PURE__ */ React10.createElement(BankChip, { p: turn.captain || draft.teams[0].captain, size: 64 })),
    /* @__PURE__ */ React10.createElement(
      "div",
      {
        className: "fd-draft-progress",
        role: "progressbar",
        "aria-label": "Draft picks",
        "aria-valuenow": turn.pickIndex,
        "aria-valuemin": 0,
        "aria-valuemax": turn.totalPicks
      },
      /* @__PURE__ */ React10.createElement("span", { style: { width: `${turn.totalPicks ? turn.pickIndex / turn.totalPicks * 100 : 100}%` } })
    )
  ), /* @__PURE__ */ React10.createElement("p", { className: "fd-draft-sr", role: "status", "aria-live": "polite", "aria-atomic": "true" }, last ? `${disp(state, last.player)} joined ${disp(state, draft.teams[last.team].captain)}. ` : "", turn.complete ? "All players picked." : `Pick ${turn.pickIndex + 1}. ${disp(state, turn.captain)} to choose.`), !turn.complete && /* @__PURE__ */ React10.createElement("ol", { className: "fd-draft-queue", "aria-label": "Upcoming pick order", ref: queueBox }, remainingOrder.map(({ pick: pickIndex, team }, index) => /* @__PURE__ */ React10.createElement("li", { key: pickIndex, "data-flip": pickIndex, "aria-current": index === 0 ? "step" : void 0 }, /* @__PURE__ */ React10.createElement("small", null, index === 0 ? "Now" : `Pick ${pickIndex + 1}`), /* @__PURE__ */ React10.createElement("span", null, disp(state, draft.teams[team].captain))))), last && /* @__PURE__ */ React10.createElement("div", { className: "fd-draft-latest", key: `${draft.id}:${draft.picks.length}:${last.player}` }, /* @__PURE__ */ React10.createElement("span", { className: "fd-draft-pick-stamp" }, String(draft.picks.length).padStart(2, "0")), /* @__PURE__ */ React10.createElement(PlayerLink, { state, player: last.player, onPlayer, disabled: !!pending }), /* @__PURE__ */ React10.createElement("span", null, "\u2192 ", disp(state, draft.teams[last.team].captain))), blocked && /* @__PURE__ */ React10.createElement("p", { className: "fd-draft-error", role: "status" }, "Draft paused."), error && /* @__PURE__ */ React10.createElement("p", { className: "fd-draft-error", role: "alert" }, error), /* @__PURE__ */ React10.createElement("div", { className: `fd-draft-body${turn.complete ? " is-complete" : ""}` }, !turn.complete && /* @__PURE__ */ React10.createElement("section", { className: "fd-draft-available", "aria-label": "Available players" }, /* @__PURE__ */ React10.createElement("div", { className: "fd-draft-section-title" }, /* @__PURE__ */ React10.createElement("h3", null, "Available"), /* @__PURE__ */ React10.createElement("span", null, turn.remaining, " left")), /* @__PURE__ */ React10.createElement("div", { className: "fd-draft-pool", ref: poolBox }, draft.pool.map((player) => /* @__PURE__ */ React10.createElement(
    "div",
    {
      className: `fd-draft-candidate${pending === `pick:${player}` ? " is-lifting" : ""}`,
      key: player,
      "data-flip": player,
      style: identityStyle(state, player)
    },
    /* @__PURE__ */ React10.createElement(
      "button",
      {
        type: "button",
        className: "fd-draft-avatar-link",
        disabled: !!pending || !onPlayer,
        onClick: () => onPlayer?.(player),
        "aria-label": `View ${disp(state, player)}'s player card`
      },
      /* @__PURE__ */ React10.createElement(Avatar, { state, p: player, size: 36 })
    ),
    /* @__PURE__ */ React10.createElement(
      "button",
      {
        type: "button",
        className: "fd-draft-pick",
        disabled: !canPick || !!pending,
        "aria-label": `Draft ${disp(state, player)}`,
        onClick: () => pick(player)
      },
      /* @__PURE__ */ React10.createElement("span", null, disp(state, player)),
      /* @__PURE__ */ React10.createElement("small", null, pending === `pick:${player}` ? "Picking\u2026" : canPick ? "Pick +" : "Available")
    )
  )))), /* @__PURE__ */ React10.createElement("section", { "aria-label": "Draft teams" }, /* @__PURE__ */ React10.createElement("div", { className: "fd-draft-section-title" }, /* @__PURE__ */ React10.createElement("h3", null, "Teams"), /* @__PURE__ */ React10.createElement("span", null, turn.pickIndex, "/", turn.totalPicks, " picks")), /* @__PURE__ */ React10.createElement("div", { className: "fd-draft-teams", style: { "--draft-columns": Math.min(n, 3) } }, draft.teams.map((team, index) => /* @__PURE__ */ React10.createElement(
    "section",
    {
      key: team.captain,
      className: `fd-draft-team${turn.teamIndex === index && !turn.complete ? " is-picking" : ""}${team.players.includes(me) ? " is-yours" : ""}`,
      style: identityStyle(state, team.captain),
      "aria-label": `${disp(state, team.captain)}'s team`
    },
    /* @__PURE__ */ React10.createElement("header", null, /* @__PURE__ */ React10.createElement("small", null, team.players.includes(me) ? "Your team" : `Team ${index + 1}`), /* @__PURE__ */ React10.createElement("span", null, team.players.length, "/", size)),
    /* @__PURE__ */ React10.createElement(PlayerLink, { state, player: team.captain, onPlayer, disabled: !!pending }),
    /* @__PURE__ */ React10.createElement("small", { className: "fd-draft-captain-label" }, "Captain"),
    /* @__PURE__ */ React10.createElement("ol", null, Array.from({ length: size - 1 }, (_, slot) => {
      const player = team.players[slot + 1];
      const seatClass = !player ? "is-empty" : `is-seated${player === last?.player ? " is-latest" : ""}${player === arriving ? " is-arriving" : ""}${player === landed ? " is-landed" : ""}`;
      return /* @__PURE__ */ React10.createElement("li", { key: player || `empty:${slot}`, "data-seat": player || void 0, className: seatClass }, player ? /* @__PURE__ */ React10.createElement(PlayerLink, { state, player, onPlayer, disabled: !!pending }) : /* @__PURE__ */ React10.createElement(React10.Fragment, null, /* @__PURE__ */ React10.createElement("span", { className: "fd-draft-empty-chip", "aria-hidden": "true" }), /* @__PURE__ */ React10.createElement("span", null, "Pick ", Array.from({ length: turn.totalPicks }, (_2, k) => k).filter((k) => snakeTeam(k, n) === index)[slot] + 1)));
    }))
  ))))), !!crew.length && /* @__PURE__ */ React10.createElement(DraftCrew, { state, roles: crew, onPlayer, disabled: !!pending }), gm && /* @__PURE__ */ React10.createElement("div", { className: "fd-draft-footer" }, turn.complete && /* @__PURE__ */ React10.createElement(
    ActionButton,
    {
      disabled: blocked,
      pending: !!pending,
      onClick: () => submit("finish", () => onFinalize(ref), onClose)
    },
    "Confirm teams"
  ), /* @__PURE__ */ React10.createElement("div", { className: "fd-draft-secondary-actions" }, /* @__PURE__ */ React10.createElement(
    ActionButton,
    {
      compact: true,
      variant: "secondary",
      disabled: !draft.picks.length || blocked || !!pending,
      onClick: () => submit("undo", () => onUndo(ref))
    },
    "Undo last pick"
  ), /* @__PURE__ */ React10.createElement(ActionButton, { compact: true, variant: "tertiary", disabled: blocked || !!pending, onClick: () => setConfirmCancel((value) => !value) }, "Cancel draft")), confirmCancel && /* @__PURE__ */ React10.createElement("div", { className: "fd-draft-cancel" }, /* @__PURE__ */ React10.createElement("p", null, "Discard this draft and its picks?"), /* @__PURE__ */ React10.createElement(
    ActionButton,
    {
      compact: true,
      variant: "destructive",
      pending: !!pending,
      onClick: () => submit("cancel", () => onCancel(ref), onClose)
    },
    "Discard draft"
  ), /* @__PURE__ */ React10.createElement(ActionButton, { compact: true, variant: "secondary", disabled: !!pending, onClick: () => setConfirmCancel(false) }, "Keep drafting")))));
}
function ConfirmedTeams({ state, draw, me, size, onPlayer }) {
  const order = draw.teams.map((team, index) => ({ team, index })).sort((a, b) => Number(b.team.players.includes(me)) - Number(a.team.players.includes(me)));
  const role = (draw.roles || []).find((item) => item.player === me);
  return /* @__PURE__ */ React10.createElement("div", { className: "fd-draft" }, /* @__PURE__ */ React10.createElement("div", { className: "fd-draft-section-title" }, /* @__PURE__ */ React10.createElement("h2", null, "Teams confirmed"), /* @__PURE__ */ React10.createElement("span", null, draw.teams.length, " teams of ", size)), role && /* @__PURE__ */ React10.createElement("p", { className: "fd-draft-note" }, "Your role \xB7 ", overflowRoleMeta(role.role).label), /* @__PURE__ */ React10.createElement("div", { className: "fd-draft-teams", style: { "--draft-columns": Math.min(draw.teams.length, 3) } }, order.map(({ team, index }) => {
    const captain = team.captain || team.players[0];
    const yours = team.players.includes(me);
    return /* @__PURE__ */ React10.createElement(
      "section",
      {
        key: captain,
        className: `fd-draft-team${yours ? " is-yours" : ""}`,
        style: identityStyle(state, captain),
        "aria-label": yours ? "Your team" : `${disp(state, captain)}'s team`
      },
      /* @__PURE__ */ React10.createElement("header", null, /* @__PURE__ */ React10.createElement("small", null, yours ? "Your team" : team.name || `Team ${index + 1}`), /* @__PURE__ */ React10.createElement("span", null, team.players.length, "/", size)),
      yours && team.name && /* @__PURE__ */ React10.createElement("strong", { className: "fd-draft-team-name" }, team.name),
      /* @__PURE__ */ React10.createElement(PlayerLink, { state, player: captain, onPlayer }),
      /* @__PURE__ */ React10.createElement("small", { className: "fd-draft-captain-label" }, "Captain"),
      /* @__PURE__ */ React10.createElement("ol", null, team.players.filter((player) => player !== captain).map((player) => /* @__PURE__ */ React10.createElement("li", { key: player, className: "is-seated" }, /* @__PURE__ */ React10.createElement(PlayerLink, { state, player, onPlayer }))))
    );
  })), !!draw.roles?.length && /* @__PURE__ */ React10.createElement(DraftCrew, { state, roles: draw.roles, onPlayer }));
}
function PickFlyer({ state, player }) {
  return /* @__PURE__ */ React10.createElement("div", { className: "fd-draft-flyer", style: identityStyle(state, player) }, /* @__PURE__ */ React10.createElement(Avatar, { state, p: player, size: 36 }), /* @__PURE__ */ React10.createElement("span", null, disp(state, player)));
}
function DraftCrew({ state, roles, onPlayer, disabled }) {
  return /* @__PURE__ */ React10.createElement("div", { className: "fd-draft-crew" }, /* @__PURE__ */ React10.createElement("small", null, "Crew"), roles.map(({ player, role }) => /* @__PURE__ */ React10.createElement("div", { key: player }, /* @__PURE__ */ React10.createElement(PlayerLink, { state, player, onPlayer, disabled }), /* @__PURE__ */ React10.createElement("span", null, overflowRoleMeta(role).label))));
}

// src/features/poker/PokerMotion.jsx
init_core();
init_PlayerIdentity();
import React12, { useEffect as useEffect10, useLayoutEffect as useLayoutEffect5, useRef as useRef9, useState as useState12 } from "react";

// src/features/wagers/BetStacks.jsx
init_theme();
init_PlayerIdentity();
init_PlayerIdentityContext();
init_chipCoin();
import React11, { useEffect as useEffect9, useLayoutEffect as useLayoutEffect4, useMemo, useRef as useRef8, useState as useState11 } from "react";

// src/features/wagers/betStacks.js
init_core();
var STACK_CAP = 10;
var STACK_TILT = 0.6;
function stackGeometry(size, shown, ring = false) {
  const D = Math.max(8, Number(size) || 0);
  const pad = Math.max(1.5, D * 0.04);
  const rx = D * 15.4 / 32, ry = rx * STACK_TILT, t = Math.max(2.4, D * 0.115);
  const yFace = pad + D * STACK_TILT / 2;
  return {
    D,
    pad,
    rx,
    ry,
    t,
    cx: pad + D / 2,
    yFace,
    width: D + pad * 2,
    height: yFace + Math.max(1, shown) * t + ry + pad + (ring ? 3 : 0)
  };
}
var STACK_TOWER = 2;
var towerTiers = (chips, cap = STACK_CAP) => chips <= cap ? 0 : chips <= 2 * cap ? 1 : STACK_TOWER;
var towerGap = (size) => Math.max(4, Math.round(Math.max(8, Number(size) || 0) * 0.14));
var stackMaxHeight = (size, cap = STACK_CAP) => stackGeometry(size, cap + STACK_TOWER).height + towerGap(size);
var stackChipCount = (stake) => {
  const value = Math.max(0, Number(stake) || 0);
  return value > 0 ? Math.max(1, Math.floor(value / PT)) : 0;
};
function stackView(stake, cap = STACK_CAP) {
  const chips = stackChipCount(stake);
  return { chips, shown: Math.min(chips, cap), capped: chips > cap };
}
function orderStacks(entries = []) {
  const byPlayer = /* @__PURE__ */ new Map();
  for (const entry of entries) {
    if (!entry?.player) continue;
    byPlayer.set(entry.player, (byPlayer.get(entry.player) || 0) + (Number(entry.stake) || 0));
  }
  return [...byPlayer].filter(([, stake]) => stake > 0).map(([player, stake]) => ({ player, stake, ...stackView(stake) })).sort((a, b) => b.stake - a.stake || a.player.localeCompare(b.player));
}
var stacksTotal = (stacks) => stacks.reduce((sum, item) => sum + item.stake, 0);
function sideKeyOf(state, contest, wager) {
  if (contest.kind === "ffa" && wager.pickTeam) {
    const side = contest.sides?.find((item) => item.players.length === wager.pickPlayers?.length && item.players.every((p) => wager.pickPlayers.includes(p)));
    if (side) return side.key;
  }
  return wagerSide(state, wager);
}
function settledStacks(state, events, contest, matches = (wager) => wagerMatchesContest(wager, contest)) {
  const won = /* @__PURE__ */ new Map(), lost = /* @__PURE__ */ new Map();
  (state.wagers || []).forEach((wager) => {
    if (!contest || !matches(wager)) return;
    const result = resolveWager(state, wager, events);
    if (result.status !== "won" && result.status !== "lost") return;
    const into = result.status === "won" ? won : lost;
    const cur = into.get(wager.player) || { player: wager.player, stake: 0, paid: 0 };
    cur.stake += Number(wager.stake) || 0;
    if (result.status === "won") cur.paid += Math.max(0, result.delta);
    into.set(wager.player, cur);
  });
  const shape = (map, status) => [...map.values()].map((item) => ({
    ...item,
    ...stackView(item.stake),
    status,
    after: status === "won" ? item.stake + item.paid : 0
  })).sort((a, b) => b.stake - a.stake || a.player.localeCompare(b.player));
  const winners = shape(won, "won"), losers = shape(lost, "lost");
  return {
    winners,
    losers,
    paid: winners.reduce((sum, item) => sum + item.paid, 0),
    lost: losers.reduce((sum, item) => sum + item.stake, 0),
    any: winners.length + losers.length > 0
  };
}
function groupStacks(stacks = [], slots = Infinity, keep = null) {
  const list = stacks || [];
  const room = Math.max(1, Math.floor(Number(slots) || 0) || 1);
  if (!Number.isFinite(Number(slots)) || list.length <= room) return { shown: list, rest: null };
  const size = Math.max(1, room - 1);
  let shown = list.slice(0, size);
  const kept = keep ? list.find((item) => item.player === keep) : null;
  if (kept && !shown.includes(kept)) shown = [...list.slice(0, size - 1), kept];
  const tail = list.filter((item) => !shown.includes(item));
  return { shown, rest: {
    players: tail.map((item) => item.player),
    count: tail.length,
    total: stacksTotal(tail),
    stacks: tail
  } };
}
function contestWinnerKey(state, evId, contest) {
  if (!contest) return null;
  if (contest.kind === "ffa") {
    const first = state.results?.[evId]?.slots?.[0];
    const top = Array.isArray(first) ? first : first != null ? [first] : [];
    if (!top.length) return null;
    const side = (contest.sides || []).find((item) => item.players.some((p) => top.includes(p)));
    return side ? side.key : null;
  }
  const stack = state.eventOps?.[evId]?.contestStack;
  const list = Array.isArray(stack) ? stack : state.eventOps?.[evId]?.lastContest ? [state.eventOps[evId].lastContest] : [];
  for (let i = list.length - 1; i >= 0; i--) if (list[i]?.id === contest.id) return list[i].winner ?? null;
  return null;
}
function decidedContest(state, events, evId, contest) {
  const winner = contestWinnerKey(state, evId, contest);
  if (!contest || winner === null || winner === void 0) return null;
  const bySide = new Map((contest.sides || []).map((side) => [side.key, /* @__PURE__ */ new Map()]));
  (state.wagers || []).forEach((wager) => {
    if (!wagerMatchesContest(wager, contest)) return;
    const result = resolveWager(state, wager, events);
    if (result.status !== "won" && result.status !== "lost") return;
    const side = bySide.get(sideKeyOf(state, contest, wager));
    if (!side) return;
    const cur = side.get(wager.player) || { player: wager.player, stake: 0, paid: 0, status: result.status };
    cur.stake += Number(wager.stake) || 0;
    if (result.status === "won") cur.paid += Math.max(0, result.delta);
    side.set(wager.player, cur);
  });
  const sides = (contest.sides || []).map((side) => {
    const stacks = [...bySide.get(side.key).values()].sort((a, b) => b.stake - a.stake || a.player.localeCompare(b.player));
    const won = side.key === winner;
    return {
      key: side.key,
      players: side.players,
      won,
      stacks,
      total: stacksTotal(stacks),
      paid: stacks.reduce((sum, item) => sum + item.paid, 0)
    };
  });
  return {
    winner,
    sides,
    paid: sides.reduce((sum, side) => sum + side.paid, 0),
    lost: sides.filter((side) => !side.won).reduce((sum, side) => sum + side.total, 0),
    any: sides.some((side) => side.stacks.length > 0)
  };
}
var hoverRect = (anchor, size, lift = 8) => anchor ? {
  left: anchor.left + anchor.width / 2 - size / 2,
  top: anchor.top - size - lift,
  width: size,
  height: size
} : null;
var faceRect = (svgRect) => svgRect ? {
  left: svgRect.left,
  top: svgRect.top - svgRect.width * 0.2,
  width: svgRect.width,
  height: svgRect.width
} : null;
var rackTargetFor = (value, denoms, fallback) => `bets:rack:${denoms.includes(value) ? value : fallback}`;

// src/features/wagers/BetStacks.jsx
var fmt = (n) => (Number(n) || 0).toLocaleString("en-US");
var r2 = (n) => Math.round(n * 100) / 100;
var FACET = 360 / COIN_FACETS;
var TURNS = [0, 0, 1, 0, 2, 0, 1];
function Rim({ cx, rx, ry, yt, t, inserts, turn, stroke }) {
  const yb = yt + t;
  const band = `M${r2(cx - rx)} ${r2(yt)}L${r2(cx - rx)} ${r2(yb)}A${r2(rx)} ${r2(ry)} 0 0 0 ${r2(cx + rx)} ${r2(yb)}L${r2(cx + rx)} ${r2(yt)}A${r2(rx)} ${r2(ry)} 0 0 1 ${r2(cx - rx)} ${r2(yt)}Z`;
  const marks = [];
  inserts.forEach((ink, index) => {
    if (!ink) return;
    const mid = (index + turn) % COIN_FACETS * FACET + FACET / 2;
    const a = Math.max(0, mid - FACET / 2), b = Math.min(180, mid + FACET / 2);
    if (b <= a) return;
    const pt = (deg, y) => `${r2(cx + rx * Math.cos(deg * Math.PI / 180))},${r2(y + ry * Math.sin(deg * Math.PI / 180))}`;
    marks.push(/* @__PURE__ */ React11.createElement(
      "polygon",
      {
        key: index,
        className: "fd-stack-insert",
        points: `${pt(a, yt)} ${pt(b, yt)} ${pt(b, yb)} ${pt(a, yb)}`
      }
    ));
  });
  return /* @__PURE__ */ React11.createElement(React11.Fragment, null, /* @__PURE__ */ React11.createElement("path", { className: "fd-stack-rim", d: band }), marks, /* @__PURE__ */ React11.createElement(
    "path",
    {
      className: "fd-stack-seam",
      d: `M${r2(cx - rx)} ${r2(yb)}A${r2(rx)} ${r2(ry)} 0 0 0 ${r2(cx + rx)} ${r2(yb)}`,
      strokeWidth: stroke
    }
  ));
}
function ChipStack({
  p,
  stake,
  paid = 0,
  size = 40,
  cap = STACK_CAP,
  mine = false,
  settle = null,
  delay = 0,
  tag = true,
  tagSize = null,
  groups = null,
  chip = null,
  count = null,
  tower = false
}) {
  const player = usePlayerIdentity(p);
  const identity = chip ? { color: chip.color, isLight: !!chip.isLight, skin: chip.skin || "quad", num: chip.stamp } : player;
  const chips = count ?? stackChipCount(stake);
  const paidChips = count == null ? stackChipCount(paid) : 0;
  const tiers = tower ? towerTiers(chips + paidChips, cap) : 0;
  const gap = tiers ? towerGap(size) : 0;
  const shown = Math.max(1, Math.min(chips + paidChips, cap)) + tiers;
  const base = settle === "won" && chips + paidChips > cap ? Math.max(1, Math.min(cap - 1, Math.round(cap * chips / (chips + paidChips)))) : Math.min(chips, shown);
  const paying = settle === "won" && shown > base;
  const seen = useRef8(null);
  if (!seen.current) seen.current = { shown, from: shown };
  else if (seen.current.shown !== shown)
    seen.current = { shown, from: shown > seen.current.shown ? seen.current.shown : shown };
  const dropped = settle ? 0 : Math.max(0, shown - seen.current.from);
  const { D, pad, rx, ry, t, cx, width, yFace, height: body } = stackGeometry(size, shown);
  const height = body + gap;
  const inserts = edgeInserts(identity.skin);
  const stroke = Math.max(0.8, D / 44);
  const light = identity.isLight;
  const value = stake + (settle === "won" ? paid : 0);
  const capped = chips + paidChips > cap;
  const breakAt = shown - tiers;
  const chipAt = (i) => {
    const yt = yFace + (shown - 1 - i) * t + (i < breakAt ? gap : 0);
    const isPaid = paying && i >= base;
    const isNew = !isPaid && i >= shown - dropped;
    return /* @__PURE__ */ React11.createElement(
      "g",
      {
        key: i,
        className: `fd-stack-chip${isPaid ? " is-paid" : ""}${isNew ? " is-drop" : ""}`,
        style: isPaid ? { animationDelay: `${delay + (i - base) * 70}ms` } : void 0
      },
      /* @__PURE__ */ React11.createElement(Rim, { cx, rx, ry, yt, t, inserts, turn: TURNS[i % TURNS.length] + 1, stroke })
    );
  };
  const rims = [];
  if (groups?.length) {
    let start = 0;
    groups.forEach((value2, index) => {
      const end = index === groups.length - 1 ? shown : Math.min(shown, start + stackChipCount(value2));
      if (end <= start) return;
      rims.push(/* @__PURE__ */ React11.createElement("g", { key: `tap-${index}`, className: "fd-stack-tap", "data-chip-stake": value2 }, Array.from({ length: end - start }, (_, k) => chipAt(start + k))));
      start = end;
    });
  } else for (let i = 0; i < shown; i++) rims.push(chipAt(i));
  if (tiers) {
    const yb = yFace + (shown - breakAt) * t + gap / 2;
    rims.push(/* @__PURE__ */ React11.createElement(
      "path",
      {
        key: "break",
        className: "fd-stack-break",
        strokeWidth: Math.max(1.2, D / 22),
        d: `M${r2(cx - rx)} ${r2(yb)}A${r2(rx)} ${r2(ry)} 0 0 0 ${r2(cx + rx)} ${r2(yb)}`
      }
    ));
  }
  const rise = paying ? (shown - base) * t : 0;
  const stamp = identity.num;
  return /* @__PURE__ */ React11.createElement(
    "span",
    {
      className: `fd-stack${light ? " is-light" : ""}${mine ? " is-mine" : ""}${settle ? ` is-${settle}` : ""}`,
      style: { "--stack-color": identity.color, width, animationDelay: settle === "lost" ? `${delay}ms` : void 0 },
      "data-stack-player": chip ? void 0 : p,
      "data-chip-value": chip ? chip.stamp : void 0,
      "data-stack-chips": shown,
      "data-stack-tower": tiers || void 0
    },
    capped && tag && /* @__PURE__ */ React11.createElement("span", { className: "fd-stack-tag", style: tagSize ? { fontSize: tagSize } : void 0 }, fmt(value)),
    /* @__PURE__ */ React11.createElement("svg", { width: r2(width), height: r2(height), viewBox: `0 0 ${r2(width)} ${r2(height)}`, "aria-hidden": "true" }, mine && /* @__PURE__ */ React11.createElement(
      "ellipse",
      {
        className: "fd-stack-ring",
        cx: r2(cx),
        cy: r2(yFace + shown * t + gap + 1.5),
        rx: r2(rx + 2.5),
        ry: r2(ry + 2),
        strokeWidth: Math.max(1.6, D / 18)
      }
    ), rims, /* @__PURE__ */ React11.createElement(
      "g",
      {
        key: `face-${shown}`,
        className: `fd-stack-face${dropped ? " is-drop" : ""}${paying ? " is-rising" : ""}`,
        style: paying ? {
          "--stack-rise": `${r2(rise)}px`,
          animationDelay: `${delay}ms`,
          animationDuration: `${(shown - base) * 70 + 120}ms`
        } : void 0
      },
      /* @__PURE__ */ React11.createElement("g", { transform: `translate(${r2(pad)} ${r2(yFace - D * STACK_TILT / 2)}) scale(1 ${STACK_TILT})` }, /* @__PURE__ */ React11.createElement(
        ChipFace,
        {
          p,
          size: D,
          stamp: "",
          flat: true,
          ...chip ? { color: identity.color, isLight: identity.isLight, skin: identity.skin } : {}
        }
      )),
      D >= 20 && stamp != null && /* @__PURE__ */ React11.createElement(
        "text",
        {
          x: r2(cx),
          y: r2(yFace + D * 0.02),
          textAnchor: "middle",
          dominantBaseline: "central",
          fontFamily: DISPLAY,
          fontWeight: "700",
          className: "fd-stack-num",
          fontSize: r2(D * (String(stamp).length > 3 ? 0.25 : String(stamp).length > 2 ? 0.3 : 0.36)),
          transform: `translate(0 ${r2(yFace)}) scale(1 .86) translate(0 ${r2(-yFace)})`
        },
        stamp
      )
    ))
  );
}
var groupChip = (count) => ({ color: "var(--silver)", isLight: true, skin: "plain", stamp: `+${count}` });
function StackGroup({ rest, size = 40, cap = STACK_CAP, names = false, label: label2 = true, valueAt = "below" }) {
  const players = rest.players;
  const value = /* @__PURE__ */ React11.createElement("span", { className: "fd-stacks-value" }, fmt(rest.total));
  return /* @__PURE__ */ React11.createElement(
    "div",
    {
      className: "fd-stacks-slot fd-stacks-group",
      role: "img",
      "aria-label": `${players.length} more: ${fmt(rest.total)} chips`
    },
    /* @__PURE__ */ React11.createElement("span", { className: "fd-stacks-body" }, /* @__PURE__ */ React11.createElement(
      ChipStack,
      {
        chip: groupChip(players.length),
        count: stackChipCount(rest.total),
        size,
        cap,
        tag: false,
        tower: true
      }
    ), valueAt === "side" && value),
    valueAt !== "side" && value,
    names && label2 && /* @__PURE__ */ React11.createElement("span", { className: "fd-stacks-name" }, "+", players.length)
  );
}
function BetStacks({
  stacks,
  size = 40,
  names = null,
  cap = STACK_CAP,
  settle = null,
  delay = 0,
  className = "",
  mine = null,
  slots = Infinity,
  valueAt = "below"
}) {
  if (!stacks?.length) return null;
  const { shown, rest } = groupStacks(stacks, slots, mine);
  return /* @__PURE__ */ React11.createElement("div", { className: `fd-stacks${valueAt === "side" ? " is-value-side" : ""}${className ? ` ${className}` : ""}` }, shown.map((item, index) => {
    const result = settle || item.status || null;
    const at = delay + index * 90;
    const value = /* @__PURE__ */ React11.createElement("span", { className: "fd-stacks-value" }, fmt(item.stake + (result === "won" ? item.paid || 0 : 0)));
    return /* @__PURE__ */ React11.createElement(
      "div",
      {
        key: item.player,
        className: `fd-stacks-slot${result === "lost" ? " is-lost" : ""}`,
        style: result === "lost" ? { animationDelay: `${at}ms` } : void 0
      },
      /* @__PURE__ */ React11.createElement("span", { className: "fd-stacks-body" }, /* @__PURE__ */ React11.createElement(
        ChipStack,
        {
          p: item.player,
          stake: item.stake,
          paid: item.paid || 0,
          size,
          cap,
          tag: false,
          tower: true,
          settle: result === "won" ? "won" : null,
          delay: at,
          mine: !!mine && item.player === mine
        }
      ), valueAt === "side" && value),
      valueAt !== "side" && value,
      names && /* @__PURE__ */ React11.createElement("span", { className: "fd-stacks-name" }, names(item.player))
    );
  }), rest && /* @__PURE__ */ React11.createElement(StackGroup, { key: "group", rest, size, cap, names: !!names, valueAt }));
}

// src/features/poker/PokerMotion.jsx
init_motion();

// src/features/poker/pokerMotion.js
init_core();

// src/features/poker/TableView.jsx
init_serverClock();
import React14, { useEffect as useEffect11, useRef as useRef11, useState as useState13 } from "react";
import { createPortal as createPortal2 } from "react-dom";

// src/features/poker/PokerChips.jsx
import React13, { useLayoutEffect as useLayoutEffect6, useRef as useRef10 } from "react";
init_motion();

// src/features/poker/pokerChips.js
init_core();
var POKER_CHIPS = Object.freeze({
  25: Object.freeze({ color: "var(--poker-25)", isLight: false, skin: "quad" }),
  100: Object.freeze({ color: "var(--poker-100)", isLight: false, skin: "quad" }),
  500: Object.freeze({ color: "var(--poker-500)", isLight: false, skin: "quad" }),
  1e3: Object.freeze({ color: "var(--poker-1000)", isLight: true, skin: "quad" })
});
var POKER_DENOMINATIONS = POKER_CONFIG.denominations;

// src/features/poker/tableView.js
init_core();

// src/features/home/HomeDuels.jsx
import React16, { useRef as useRef13, useState as useState16 } from "react";

// src/features/duels/DuelCard.jsx
init_PlayerIdentity();
import React15, { useRef as useRef12, useState as useState14 } from "react";

// src/features/duels/duelView.js
init_core();

// src/features/tv/serverClock.js
init_serverClock();

// src/features/duels/duelView.js
var fmt2 = (n) => (n ?? 0).toLocaleString("en-US");
var duelsOpen = (state) => !!(state?.live && !state.frozen && !(state.poker && !state.results?.[state.poker.id]) && !pokerLive(state) && !stacksPosted(state));
var minutesLeft = (duel, now = serverNow()) => {
  const at = duelLapsesAt(duel);
  return at === null ? null : Math.max(1, Math.ceil((at - now) / 6e4));
};
function duelView(state, duel, me, now = serverNow()) {
  const phase = duelPhase(duel, now);
  const sender = !!me && duel.from === me;
  const recipient = !!me && !!duel.to && duel.to === me;
  const other = sender ? duel.to || null : duel.from;
  const name = other ? disp(state, other) : "Anyone";
  const myRun = me ? duel.runs?.[me] || null : null;
  const otherDrew = !!(other && duel.runs?.[other]);
  const offer = phase === "offered";
  const live = phase === "live";
  const takeable = offer && !!duel.open && !!me && !sender && !duelBetween(state, duel.from, me, now);
  const canAccept = offer && (recipient || takeable);
  const canDecline = offer && recipient || live && recipient && !myRun;
  const canWithdraw = offer && sender;
  const canPlay = live && (sender || recipient) && !myRun;
  const left = offer ? minutesLeft(duel, now) : null;
  let status = "";
  if (offer) status = sender ? duel.open ? `Open to anyone \xB7 ${left} min` : `Waiting for ${name} to accept \xB7 ${left} min` : duel.open ? `Open challenge \xB7 ${left} min` : "Challenged you";
  else if (live) status = myRun ? `Waiting for ${name} to draw` : !duel.consent && recipient && !Object.keys(duel.runs || {}).length ? "Challenged you" : otherDrew ? `${name} has drawn` : "Your turn";
  return {
    phase,
    sender,
    recipient,
    other,
    name,
    myRun,
    otherDrew,
    takeable,
    canAccept,
    canDecline,
    canWithdraw,
    canPlay,
    minutesLeft: left,
    status,
    accepted: duelAccepted(duel),
    involved: sender || recipient
  };
}
function duelResult(state, duel, viewer) {
  const phase = duelPhase(duel);
  if (!duel.to || !duelAccepted(duel)) return null;
  if (phase !== "settled" && phase !== "void") return null;
  const other = duel.from === viewer ? duel.to : duel.from;
  const r = resolveDuel(duel);
  const time = (run) => !run ? "no draw" : run.foul ? "foul" : Number.isFinite(run.ms) ? `${run.ms} ms` : "drew";
  const times = phase === "settled" ? `${time(duel.runs?.[viewer])} vs ${time(duel.runs?.[other])}` : "";
  const outcome = phase === "void" ? "void" : r.push ? "push" : r.winner === viewer ? "won" : "lost";
  const delta = outcome === "won" ? duel.stake : outcome === "lost" ? -duel.stake : 0;
  return { id: duel.id, other, name: disp(state, other), stake: duel.stake, times, outcome, delta, ts: duel.ts };
}
function duelRecord(state, viewer, other) {
  const lines = (state?.duels || []).filter((duel) => duel.from === viewer && duel.to === other || duel.from === other && duel.to === viewer).map((duel) => duelResult(state, duel, viewer)).filter(Boolean).sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const won = lines.filter((line) => line.outcome === "won").length;
  const lost = lines.filter((line) => line.outcome === "lost").length;
  const net = lines.reduce((sum, line) => sum + line.delta, 0);
  return { lines, won, lost, net };
}
var signedChips2 = (n) => `${n > 0 ? "+" : n < 0 ? "-" : ""}${fmt2(Math.abs(n))}`;
var ANTES = [PT, 2 * PT, 5 * PT, 10 * PT];

// src/features/duels/DuelCard.jsx
var actionStyle = {
  minWidth: 0,
  minHeight: 44,
  padding: "10px 8px",
  borderRadius: 10,
  border: "1px solid var(--line)",
  background: "var(--paper2)",
  color: "var(--ink)",
  fontFamily: "var(--fd-body)",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer"
};
var DONE = { decline: "Declined", withdraw: "Withdrawn", void: "Voided" };
var PENDING = { accept: "Accepting\u2026", decline: "Declining\u2026", withdraw: "Withdrawing\u2026", void: "Voiding\u2026" };
function DuelCard({ state, duel, me, gm, now, onPlay, onAccept, onDecline, onWithdraw, onVoid, onPlayer, bare = false }) {
  const [pendingAction, setPendingAction] = useState14(null);
  const [error, setError] = useState14("");
  const [acknowledged, setAcknowledged] = useState14(null);
  const pending = useRef12(null);
  const finished = useRef12(false);
  const view = duelView(state, duel, me, now);
  const { other, name } = view;
  const busy = !!pendingAction;
  const submit = (action, handler) => {
    if (pending.current) return pending.current;
    if (finished.current || !handler) return;
    if (action === "accept") tapTick();
    setPendingAction(action);
    setError("");
    const failure = `Couldn't ${action} the duel. Try again.`;
    pending.current = Promise.resolve().then(() => handler(duel.id)).then((result) => {
      if (result?.ok !== true) {
        const rejected = { ok: false, error: result?.error || failure };
        setError(rejected.error);
        return rejected;
      }
      if (DONE[action]) {
        finished.current = true;
        setAcknowledged(DONE[action]);
      }
      return result;
    }).catch(() => {
      setError(failure);
      return { ok: false, error: failure };
    }).finally(() => {
      pending.current = null;
      setPendingAction(null);
    });
    return pending.current;
  };
  const interact = (callback) => {
    if (!pending.current && !finished.current) callback?.();
  };
  const label2 = (key) => pendingAction === key ? PENDING[key] : null;
  const actions = [
    view.canAccept && {
      key: "accept",
      label: label2("accept") || "Accept",
      aria: `Accept duel with ${name}`,
      callback: () => submit("accept", onAccept),
      enabled: !!onAccept,
      primary: true
    },
    view.canPlay && {
      key: "play",
      label: "Play",
      aria: `Play Quick Draw with ${name}`,
      callback: () => interact(() => onPlay?.(duel.id)),
      enabled: !!onPlay,
      primary: true
    },
    view.canDecline && {
      key: "decline",
      label: label2("decline") || "Decline",
      aria: `Decline duel with ${name}`,
      callback: () => submit("decline", onDecline),
      enabled: !!onDecline
    },
    view.canWithdraw && {
      key: "withdraw",
      label: label2("withdraw") || "Withdraw",
      aria: duel.open ? "Withdraw open challenge" : `Withdraw challenge to ${name}`,
      callback: () => submit("withdraw", onWithdraw),
      enabled: !!onWithdraw
    },
    gm && {
      key: "void",
      label: label2("void") || "Void",
      aria: `Void duel with ${name}`,
      callback: () => submit("void", onVoid),
      enabled: !!onVoid,
      danger: true
    }
  ].filter(Boolean);
  const highlight = view.canPlay || view.canAccept;
  return /* @__PURE__ */ React15.createElement(
    "article",
    {
      "aria-label": `Quick Draw with ${name}`,
      "aria-busy": busy,
      style: bare ? { minWidth: 0 } : {
        padding: 12,
        border: "1px solid var(--line)",
        borderRadius: 14,
        marginBottom: 8,
        background: highlight ? "var(--sun-tint)" : "var(--paper)",
        minWidth: 0
      }
    },
    /* @__PURE__ */ React15.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, minWidth: 0 } }, other && onPlayer ? /* @__PURE__ */ React15.createElement(
      "button",
      {
        type: "button",
        "aria-label": `View ${name}'s player card`,
        disabled: busy || !onPlayer || !!acknowledged,
        onClick: () => interact(() => onPlayer?.(other)),
        style: {
          display: "flex",
          alignItems: "center",
          gap: 10,
          flex: 1,
          minWidth: 0,
          minHeight: 44,
          border: 0,
          padding: 0,
          background: "none",
          color: "var(--ink)",
          textAlign: "left",
          cursor: busy ? "default" : "pointer",
          fontFamily: "var(--fd-body)"
        }
      },
      /* @__PURE__ */ React15.createElement(Avatar, { state, p: other, size: 36 }),
      /* @__PURE__ */ React15.createElement("span", { style: { flex: 1, minWidth: 0, overflowWrap: "anywhere" } }, /* @__PURE__ */ React15.createElement("strong", { style: { display: "block", fontSize: 14, fontWeight: 600, lineHeight: 1.3 } }, name), /* @__PURE__ */ React15.createElement("span", { style: { display: "block", marginTop: 3, fontSize: 11, lineHeight: 1.4, color: "var(--muted2)" } }, view.status))
    ) : /* @__PURE__ */ React15.createElement("div", { style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      flex: 1,
      minWidth: 0,
      minHeight: 44,
      fontFamily: "var(--fd-body)",
      color: "var(--ink)"
    } }, other && /* @__PURE__ */ React15.createElement(Avatar, { state, p: other, size: 36 }), /* @__PURE__ */ React15.createElement("span", { style: { flex: 1, minWidth: 0, overflowWrap: "anywhere" } }, /* @__PURE__ */ React15.createElement("strong", { style: { display: "block", fontSize: 14, fontWeight: 600, lineHeight: 1.3 } }, name), /* @__PURE__ */ React15.createElement("span", { style: { display: "block", marginTop: 3, fontSize: 11, lineHeight: 1.4, color: "var(--muted2)" } }, view.status))), /* @__PURE__ */ React15.createElement("span", { style: { flexShrink: 0, textAlign: "right", color: "var(--ink)", fontFamily: "var(--fd-body)" } }, /* @__PURE__ */ React15.createElement("strong", { style: { fontFamily: "var(--fd-display)", fontSize: 22, fontWeight: 600 } }, (duel.stake || 0).toLocaleString("en-US")), /* @__PURE__ */ React15.createElement("small", { style: { display: "block", color: "var(--muted)", fontSize: 9, marginTop: 2 } }, "each"))),
    acknowledged ? /* @__PURE__ */ React15.createElement("p", { role: "status", style: { margin: "10px 0 0", color: "var(--muted2)", fontSize: 12 } }, acknowledged) : !!actions.length && /* @__PURE__ */ React15.createElement("div", { style: { display: "grid", gridTemplateColumns: `repeat(${actions.length}, minmax(0, 1fr))`, gap: 8, marginTop: 10 } }, actions.map((action) => /* @__PURE__ */ React15.createElement(
      "button",
      {
        type: "button",
        key: action.key,
        "aria-label": action.aria,
        disabled: busy || !action.enabled,
        onClick: action.callback,
        style: {
          ...actionStyle,
          ...action.primary ? { background: "var(--action-fill)", color: "var(--action-ink)", borderColor: "var(--action-fill)" } : {},
          ...action.danger ? { color: "var(--live2)", borderColor: "var(--danger-line)" } : {},
          cursor: busy || !action.enabled ? "default" : "pointer",
          opacity: busy && pendingAction !== action.key ? 0.55 : 1
        }
      },
      action.label
    ))),
    error && /* @__PURE__ */ React15.createElement("p", { role: "alert", style: {
      margin: "10px 0 0",
      fontFamily: "var(--fd-body)",
      fontSize: 12,
      color: "var(--live2)",
      lineHeight: 1.5,
      overflowWrap: "anywhere"
    } }, error)
  );
}

// src/features/duels/useDuelClock.js
init_core();
import { useEffect as useEffect12, useState as useState15 } from "react";

// src/ui/AppChrome.jsx
init_PlayerIdentity();
init_core();
import React19 from "react";

// src/ui/Brand.jsx
import React17 from "react";

// src/ui/AppChrome.jsx
init_controls();

// src/ui/UpdateReady.jsx
import React18 from "react";

// src/ui/AppChrome.jsx
init_motion();
var TAB_TARGETS = Object.freeze({ board: "tab:home", sched: "tab:events", bets: "tab:bets", guide: "tab:weekend" });

// src/features/home/GuestHome.jsx
init_core();
init_PlayerIdentity();
init_PlayerIdentityContext();
init_PlayerPass();
import React26, { useLayoutEffect as useLayoutEffect9, useMemo as useMemo4, useRef as useRef19, useState as useState21 } from "react";

// src/ui/layout.jsx
import React22 from "react";
function PageHeading({ kicker, title, children, aside }) {
  return /* @__PURE__ */ React22.createElement("header", { className: "fd-page-heading" }, kicker && /* @__PURE__ */ React22.createElement("div", { className: "fd-kicker" }, kicker), /* @__PURE__ */ React22.createElement("div", { className: "fd-page-heading-row" }, /* @__PURE__ */ React22.createElement("h1", null, title), aside), children);
}

// src/features/standings/Standings.jsx
init_core();
init_PlayerIdentity();
init_PlayerIdentityContext();
init_motion();
import React23, { useCallback as useCallback2, useLayoutEffect as useLayoutEffect8, useMemo as useMemo3, useRef as useRef17, useState as useState19 } from "react";

// src/features/standings/boardModel.js
var BOARD_BEATS = Object.freeze({
  count: 150,
  // numbers start counting in 100s, the change rises off them
  slide: 950,
  // rows move to their new rank
  roll: 1300,
  // rank digits roll once the rows have landed
  rollStagger: 16,
  arrows: 1500,
  // rank-change arrows pop
  leader: 1500,
  // the new leader's row warms, one sweep under it
  settle: 3e3
  // everything is at rest
});

// src/features/standings/Standings.jsx
init_controls();

// src/features/home/homeModel.js
init_core();

// src/features/standings/winImpact.js
init_core();
var known = (key) => key !== null && key !== void 0;
var ordinal = (n) => {
  const tail = n % 100;
  if (tail >= 11 && tail <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] || "th"}`;
};
var fmt4 = (n) => (n ?? 0).toLocaleString("en-US");
function joinNames(names) {
  if (names.length <= 1) return names[0] || "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}
function winSlots(state, ev, contest, sideKey) {
  if (!ev || !contest || ev.finale || !(awardTable(ev)[0] > 0)) return null;
  const side = contest.sides?.find((item) => item.key === sideKey);
  if (!side?.players?.length) return null;
  const table = awardTable(ev);
  if (contest.kind === "match") {
    const br = state.brackets?.[ev.id], draw = state.draws?.[ev.id];
    if (!br || !draw?.teams || !Array.isArray(contest.match)) return null;
    const [r] = contest.match;
    if (r !== br.rounds.length - 1) return null;
    const runner = contest.sides.find((item) => item.key !== sideKey);
    const before = br.rounds.length > 1 ? br.rounds[br.rounds.length - 2] : [];
    const third = before.map((match) => [resolveSlot(br, match.a), resolveSlot(br, match.b)].find((key) => known(key) && known(match.winner) && key !== match.winner)).filter((key) => known(key) && draw.teams[key]);
    return [
      [...side.players],
      table[1] > 0 && runner ? [...runner.players] : [],
      table[2] > 0 ? third.flatMap((key) => draw.teams[key].players) : []
    ];
  }
  if (contest.kind === "stage-final") return [[...side.players], [], []];
  if (contest.kind === "ffa") {
    const other = contest.sides.length === 2 ? contest.sides.find((item) => item.key !== sideKey) : null;
    return [[...side.players], table[1] > 0 && other ? [...other.players] : [], []];
  }
  return null;
}
function contestWinLines(state, ev, contest, { events = allEventsOf(state), standings, keys = null } = {}) {
  if (!state || !ev || !contest?.sides?.length) return [];
  const settled = (state.wagers || []).filter((w) => resolveWager(state, w, events).status !== "pending");
  const base = { ...state, wagers: settled };
  const beforeRows = standings || computeStandings(state);
  const before = new Map(beforeRows.map((row) => [row.player, row]));
  return contest.sides.map((side) => {
    if (keys && !keys.includes(side.key)) return null;
    const slots = winSlots(state, ev, contest, side.key);
    if (!slots) return null;
    const after = computeStandings({ ...base, results: {
      ...state.results || {},
      [ev.id]: { slots, ts: 0, revision: 1 }
    } });
    const afterBy = new Map(after.map((row) => [row.player, row]));
    const players = side.players.filter((p) => before.has(p) && afterBy.has(p));
    if (!players.length) return null;
    const movers = players.filter((p) => afterBy.get(p).rank < before.get(p).rank);
    if (movers.length) {
      const best = Math.min(...movers.map((p) => afterBy.get(p).rank));
      const group = movers.filter((p) => afterBy.get(p).rank === best);
      const shared = after.filter((row) => row.rank === best).length > group.length;
      const whole = group.length === side.players.length && group.length > 2;
      const names2 = whole ? teamLabel(state, { players: side.players, name: state.draws?.[ev.id]?.teams?.[side.key]?.name }) : joinNames(group.map((p) => disp(state, p)));
      const plural = group.length > 1 && !whole;
      const text = shared ? `Win: ${names2} ${plural ? "tie" : "ties"} for ${ordinal(best)}` : `Win: ${names2} to ${ordinal(best)}`;
      return { key: side.key, kind: "rank", rank: best, tied: shared, players: group, text };
    }
    const award = afterBy.get(players[0]).pts - before.get(players[0]).pts;
    if (!(award > 0)) return null;
    const names = players.length > 2 ? teamLabel(state, { players, name: state.draws?.[ev.id]?.teams?.[side.key]?.name }) : joinNames(players.map((p) => disp(state, p)));
    return { key: side.key, kind: "chips", award, players, text: `Win: ${names} +${fmt4(award)}` };
  });
}
var winLineFor = (lines, key) => (lines || []).find((line) => line && line.key === key) || null;

// src/features/standings/WinLine.jsx
import React24 from "react";
function WinLine({ line, className = "" }) {
  if (!line?.text) return null;
  return /* @__PURE__ */ React24.createElement("small", { className: `fd-win-line${line.kind === "rank" ? " is-rank" : ""}${className ? ` ${className}` : ""}` }, line.text);
}

// src/features/home/GuestHome.jsx
init_motion();

// src/features/alerts/Alerts.jsx
import React25, { useEffect as useEffect16, useRef as useRef18, useState as useState20, useSyncExternalStore as useSyncExternalStore2 } from "react";
init_install();

// src/features/alerts/pocketAlerts.js
var ALERT_REASONS = Object.freeze(["playing", "pick", "duel", "mvp"]);
var store = { checked: false, permission: "default", subscribed: false, busy: false, error: "", asked: false };
var cached = { ...store };

// src/features/alerts/Alerts.jsx
init_player_pass();

// src/features/home/GuestHome.jsx
var hasGameRules = (event) => {
  const game = GAMES[event?.game];
  return !!(game?.howto || game?.variants?.some((variant) => variant.howto));
};

// src/features/home/guestUpdates.js
init_core();
var SINCE_ABSENCE = 2 * 60 * 1e3;

// src/features/profile/VibrationToggle.jsx
import React27, { useState as useState22 } from "react";
init_player_pass();

// src/features/profile/SoundToggle.jsx
import React28, { useState as useState23 } from "react";
init_player_pass();

// src/features/home/phoneSound.js
init_core();
import { useEffect as useEffect17, useRef as useRef20 } from "react";

// src/features/weekend/Schedule.jsx
init_core();
init_PlayerIdentity();
import React29, { useRef as useRef21, useState as useState24 } from "react";

// src/features/weekend/scheduleModel.js
init_core();

// src/features/weekend/Guide.jsx
init_core();
import React38, { useState as useState33 } from "react";
init_Travel();
init_InstallHint();
init_install();

// src/features/weekend/Trophy.jsx
init_core();
init_PlayerIdentityContext();
import React32 from "react";

// src/features/tv/tvModel.js
init_core();

// src/ui/phase.js
init_core();
var PHASES = Object.freeze(["fri", "sam", "sap", "san", "fin"]);

// src/features/tv/desertModel.js
var DESERT_DAY = Object.freeze(["sam", "sap"]);
var DESERT_NIGHT = Object.freeze(["san", "fin"]);
var isNightSky = (phase) => DESERT_NIGHT.includes(phase);
function starPoints(r) {
  const k = r * 0.3;
  return [[0, -r], [k, -k], [r, 0], [k, k], [0, r], [-k, k], [-r, 0], [-k, -k]];
}
var starPath = (r) => `M${starPoints(r).map(([x, y]) => `${Math.round(x * 10) / 10} ${Math.round(y * 10) / 10}`).join("L")}Z`;
var FAR = [
  [0, 0.5],
  [0.075, 0.625],
  [0.131, 0.5625],
  [0.206, 0.78],
  [0.2625, 0.69],
  [0.325, 0.84],
  [0.4, 0.72],
  [0.475, 0.81],
  [0.55, 0.67],
  [0.625, 0.78],
  [0.706, 0.69],
  [0.7875, 0.83],
  [0.8625, 0.7],
  [0.9375, 0.78],
  [1, 0.72]
];
var MID = [
  [0, 0.25],
  [0.1125, 0.34],
  [0.1875, 0.5],
  [0.2375, 0.69],
  [0.28125, 0.78],
  [0.325, 0.69],
  [0.356, 0.59],
  [0.4, 0.69],
  [0.4375, 0.91],
  [0.475, 1],
  [0.5125, 0.94],
  [0.55, 0.78],
  [0.6, 0.56],
  [0.6875, 0.41],
  [0.8125, 0.375],
  [1, 0.31]
];
var SAGUAROS = [
  { d: "M-14 0V-160a14 14 0 0 1 28 0V0ZM-14-80h-30v-40a12 12 0 0 1 24 0v22h6ZM14-110h30v-40a12 12 0 0 0-24 0v22h-6Z" },
  { d: "M-17 0V-195a17 17 0 0 1 34 0V0ZM-17-105h-38v-56a14 14 0 0 1 28 0v34h10ZM17-75h36v-40a14 14 0 0 0-28 0v18h-8Z" },
  { d: "M-10 0V-92a10 10 0 0 1 20 0V0ZM10-52h20v-26a9 9 0 0 0-18 0v8h-2Z" }
];
var DISC = {
  fri: { x: 0.7375, y: 0.42 },
  sam: { x: 0.225, y: 0.35 },
  sap: { x: 0.5125, y: 0.25 },
  san: { x: 0.825, y: 1 },
  fin: { x: 0.1, y: 0.3 }
};
var FIXED_STARS = [[0.11, 0.13], [0.26, 0.08], [0.475, 0.17], [0.63, 0.07], [0.81, 0.14], [0.925, 0.23], [0.375, 0.27], [0.725, 0.28]];
function skyBoxClearOfDisc(box, disc, r, gap = 14) {
  if (!disc || !(r > 0)) return box;
  if (disc.y + r < box.top || disc.y - r > box.bottom || disc.x + r < box.left || disc.x - r > box.right) return box;
  const leftRoom = disc.x - r - gap - box.left, rightRoom = box.right - (disc.x + r + gap);
  return rightRoom >= leftRoom ? { ...box, left: Math.round(disc.x + r + gap) } : { ...box, right: Math.round(disc.x - r - gap) };
}
function skyStarLayout(box) {
  const small = box.bottom - box.top < 80;
  const spread = small ? 7 : 11;
  return {
    small,
    /* a four-point star's reach, not a dot's radius */
    starR: small ? 5 : 8,
    fixedR: small ? 1.6 : 2,
    at: (star) => [
      Math.round(box.left + star.x * (box.right - box.left) + star.dx * spread),
      Math.round(box.top + star.y * (box.bottom - box.top) + star.dy * spread)
    ],
    fixed: ([x, y]) => [Math.round(box.left + x * (box.right - box.left)), Math.round(box.top + y * 3 * (box.bottom - box.top))]
  };
}
var r1 = (n) => Math.round(n * 10) / 10;
function skyline(points, { width, horizon, amp, x0 = 0, x1 = 1, envelope = () => 1, bottom }) {
  const at = ([x, h]) => [r1((x0 + x * (x1 - x0)) * width), r1(horizon - h * amp * envelope(x0 + x * (x1 - x0)))];
  const pts = points.map(at);
  const first = pts[0], last = pts[pts.length - 1];
  const lead = x0 > 0 ? [[0, first[1]]] : [];
  const tail = x1 < 1 ? [[width, last[1]]] : [];
  const all = [...lead, ...pts, ...tail];
  return `M${all.map(([x, y]) => `${x} ${y}`).join("L")}V${bottom}H0Z`;
}
var smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
function desertScene({ width = 1920, height = 118, variant = "strip" } = {}) {
  const strip = variant === "strip";
  const horizon = strip ? height - 4 : Math.round(height * 0.84);
  const amp = strip ? Math.min(74, height * 0.62) : Math.round(Math.min(height * 0.42, width * 0.2));
  const envelope = strip ? (x) => 0.22 + 0.78 * smooth(0.36, 0.62, x) : () => 1;
  const far = skyline(FAR, { width, horizon, amp: amp * 0.92, envelope, bottom: height });
  const mid = skyline(MID, { width, horizon, amp, x0: strip ? 0.46 : 0, x1: strip ? 1.08 : 1, envelope, bottom: height });
  const swell2 = strip ? 0 : Math.max(3, height * 0.012);
  const ground = `M0 ${horizon}Q${width * 0.25} ${horizon - swell2} ${width * 0.5} ${horizon}T${width} ${horizon}V${height}H0Z`;
  const nearTop = strip ? height : Math.round(horizon + (height - horizon) * 0.5);
  const scale = strip ? amp / 250 : amp / 330;
  const cacti = (strip ? [[0.62, 0.9, 1], [0.795, 0.62, 2], [0.93, 1, 0]] : [[0.14, 1, 0], [0.675, 0.62, 2], [0.825, 1.05, 1]]).map(([x, size, shape]) => ({ x: r1(x * width), y: horizon + (strip ? 0 : 2), scale: r1(scale * size * 100) / 100, d: SAGUAROS[shape].d }));
  const skyTop = strip ? 4 : Math.round(height * 0.04);
  const skyBottom = Math.round(horizon - amp * (strip ? 0.9 : 1.02));
  const discR = strip ? Math.round(Math.min(26, height * 0.22)) : Math.round(Math.min(74, amp * 0.34));
  const disc = Object.fromEntries(Object.entries(DISC).map(([phase, at]) => {
    const x = strip ? width * (0.52 + at.x * 0.42) : width * at.x;
    const y = strip ? skyTop + discR + (height * 0.45 - discR) * Math.min(1, at.y) : skyTop + (horizon - skyTop) * at.y * 0.9;
    return [phase, { x: r1(x), y: r1(y) }];
  }));
  return { width, height, horizon, amp, far, mid, ground, nearTop, cacti, disc, discR, sky: { top: skyTop, bottom: skyBottom } };
}

// src/features/tv/tvModel.js
var FACT_TONES = Object.freeze({ streak: "var(--sun)", first: "var(--pool)", wins: "var(--accent)", bet: "var(--green)" });
var CUE_WINDOW_MS = 3 * 60 * 1e3;

// src/features/weekend/trophy.js
init_core();

// src/features/results/Keepsake.jsx
init_core();
init_controls();
init_PlayerIdentity();
init_PlayerIdentityContext();
init_playerIdentity();
init_PlayerPass();
import React35, { useEffect as useEffect22, useMemo as useMemo6, useRef as useRef25, useState as useState30 } from "react";

// src/features/results/LastCard.jsx
init_core();
init_PlayerIdentity();
init_PlayerIdentityContext();
init_PlayerPass();
init_motion();
init_serverClock();
import React34, { useEffect as useEffect21, useMemo as useMemo5, useRef as useRef24, useState as useState29 } from "react";

// src/features/results/lastCard.js
init_core();

// src/features/results/resultMoment.js
init_core();

// src/features/results/weekendFacts.js
init_core();
init_seasonStats();
var FACT_TAGS = Object.freeze({ streak: "Streak", first: "First", wins: "Milestone", bet: "Record" });

// src/features/results/lastCard.js
var SESSION_ORDER = SESSIONS.map((session) => session.id);
var SESSION_TICKS = Object.freeze({ fri: "FRI", sam: "SAT AM", sap: "SAT PM", san: "SAT NIGHT", fin: "POKER" });

// src/features/results/cardImage.js
var IMAGE_W = 1080;
var IMAGE_H = 1350;
var U = 3;
var W = IMAGE_W / U;
var H = IMAGE_H / U;

// src/features/tv/tvMotion.js
init_core();
init_motion();
init_serverClock();
import { useEffect as useEffect19, useRef as useRef22, useState as useState27 } from "react";
var ADVANCE_TIMING = Object.freeze({
  fill: 0,
  fillMs: 240,
  // the winning row fills sun from the left
  stamp: 120,
  stampMs: 320,
  // WON stamps
  lose: 250,
  loseMs: 300,
  // the losing row steps back
  lift: 700,
  ride: 760,
  rideMs: 800,
  // the winners lift off and ride the connector
  land: 1540,
  landMs: 320,
  // they land in the next slot
  upNow: 1900,
  upNowMs: 600,
  // UP NOW travels to the next open match
  unfill: 2700,
  unfillMs: 500,
  // the fill settles to the bracket's resting style
  total: 3200
});
var CROWN_TIMING = Object.freeze({
  hold: 400,
  // the final standings, as they stood
  stepDown: 400,
  stepStagger: 35,
  stepMs: 320,
  rise: 850,
  riseMs: 600,
  // the champion's row rises to the middle
  flood: 1450,
  floodMs: 700,
  // their color floods from their own face
  chip: 2e3,
  chipMs: 1200,
  // their chip drops and turns twice
  tag: 2300,
  tagMs: 300,
  // CHAMPION stamps
  name: 2400,
  nameStagger: 60,
  nameMs: 340,
  stats: 2700,
  statsMs: 200,
  count: 2800,
  countMs: 1200,
  // the final stack counts in 25s
  path: 3400,
  pathStagger: 90,
  pathMs: 300,
  lines: 3700,
  lineStagger: 300,
  lineMs: 300,
  total: 4800
});
var inOut = cubicBezier(0.65, 0, 0.35, 1);

// src/features/results/crownTiming.js
var CROWN_CARD_HOLD_MS = 1400;
var PHONE_CROWN = Object.freeze({
  rise: CROWN_TIMING.rise,
  riseMs: CROWN_TIMING.riseMs,
  // the champion's face appears where the flood will start
  flood: CROWN_TIMING.flood,
  floodMs: CROWN_TIMING.floodMs,
  // the room goes one color
  chip: CROWN_TIMING.chip,
  chipMs: CROWN_TIMING.chipMs,
  // their chip drops and turns twice
  tag: CROWN_TIMING.tag,
  name: CROWN_TIMING.name,
  nameStagger: CROWN_TIMING.nameStagger,
  stats: CROWN_TIMING.stats,
  count: CROWN_TIMING.count,
  countMs: CROWN_TIMING.countMs,
  turn: CROWN_TIMING.total + CROWN_CARD_HOLD_MS
  // this phone's own last card
});

// src/features/results/SavePoster.jsx
import React33, { useEffect as useEffect20, useRef as useRef23, useState as useState28 } from "react";

// src/features/results/classPhoto.js
init_core();
var CLASS_TIMING = Object.freeze({
  fade: 0,
  fadeMs: 400,
  chip: 300,
  chipStagger: 70,
  chipMs: 420,
  title: 1500,
  titleMs: 400,
  total: 2600
});

// src/features/results/posterImage.js
init_PlayerIdentity();
init_playerIdentity();

// src/features/results/keepsake.js
init_core();
var SESSION_NAMES = Object.freeze({
  fri: "Friday",
  sam: "Saturday morning",
  sap: "Saturday afternoon",
  san: "Saturday night",
  fin: "Finale"
});

// src/features/photos/PhotoDesk.jsx
import React37, { useRef as useRef27, useState as useState32 } from "react";

// src/features/photos/photoModel.js
var PHOTO_PREP = Object.freeze({
  side: 1600,
  quality: 0.8,
  thumbSide: 480,
  thumbQuality: 0.72,
  /* re-encoded bytes the server accepts; the phone steps quality down to fit */
  maxBytes: 145e4,
  maxThumbBytes: 15e4,
  perBatch: 10
});

// src/features/photos/PhotoGrid.jsx
init_core();
init_PlayerIdentity();
init_controls();
import React36, { useEffect as useEffect23, useRef as useRef26, useState as useState31 } from "react";

// src/features/wagers/Wagers.jsx
init_core();
init_theme();
init_controls();
import React39, { useEffect as useEffect24, useLayoutEffect as useLayoutEffect10, useMemo as useMemo7, useRef as useRef28, useState as useState34 } from "react";
init_PlayerIdentity();
init_motion();
var PHONE_CHIP = 28;
var PHONE_SLOTS = 6;
var feltSlots = (lines) => lines === 1 ? 3 : PHONE_SLOTS;
var PHONE_STACK_H = Math.ceil(stackMaxHeight(PHONE_CHIP));
var fmt5 = (n) => (n ?? 0).toLocaleString("en-US");
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
    w.kind === "outright" ? (w.pickTeam ? "t:" + w.drawId + ":" + (w.pickPlayers || []).join("+") : "p:" + w.pick) + ":x" + wagerMult(w) : w.kind === "match" ? "m:" + w.drawId + ":" + (w.match || []).join("-") + ":" + w.teamIdx : "s:" + w.stagesId + ":" + (w.final ? "F" : w.group) + ":" + w.pickKey
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
var isUncertainResult = (result) => result?.ok !== true && (result?.uncertain === true || result?.status === "uncertain" || /no response/i.test(String(result?.error || "")));
var PLACE_QUEUE = 4;
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
  unavailableLabel = "Opponent",
  tapStake,
  capLabel,
  capReason,
  winLine,
  winSlot = false,
  lines = 2
}) {
  const [pendingAction, setPendingAction] = useState34(null);
  const [actionError, setActionError] = useState34(null);
  const [checking, setChecking] = useState34(null);
  const pendingRef = useRef28(false);
  const pendingKindRef = useRef28(null), queueRef = useRef28([]);
  const [queued, setQueued] = useState34(0);
  const wellRef = useRef28(null), mineRef = useRef28(null), flightRef = useRef28(null);
  const mine = bets.filter((x) => x.w.player === me).sort((a, b) => {
    const latest = ({ w }) => w.chips?.[w.chips.length - 1]?.ts || w.updatedAt || w.ts || 0;
    return latest(a) - latest(b);
  });
  const mineTotal = mine.reduce((total, x) => total + x.w.stake, 0);
  const live = useRef28({ state, mineTotal });
  live.current = { state, mineTotal };
  const mineChips = mine.flatMap(({ w }) => w.chips?.length ? w.chips.map((chip) => chip.stake) : [w.stake]);
  const otherStacks = orderStacks(bets.filter((x) => x.w.player !== me).map(({ w }) => ({ player: w.player, stake: w.stake })));
  const sideTotal = mineTotal + stacksTotal(otherStacks);
  const landed = (kind, before, total) => kind === "place" ? total > before : total < before;
  const shownTotal = useRef28(mineTotal);
  useEffect24(() => {
    if (shownTotal.current === mineTotal) return;
    shownTotal.current = mineTotal;
    setActionError(null);
  }, [mineTotal]);
  const alive = useRef28(true);
  useEffect24(() => () => {
    alive.current = false;
    flightRef.current?.cancel();
  }, []);
  useEffect24(() => {
    if (!checking || checking.settled || state === checking.state) return;
    if (!landed(checking.kind, checking.before, mineTotal)) {
      setActionError(checking.kind === "place" ? "Not placed" : "Not removed");
      checking.flight?.back();
    } else checking.flight?.land();
    pendingRef.current = false;
    setChecking(null);
  }, [state, mineTotal, checking]);
  const mineFace = () => mineRef.current?.querySelector(".fd-stack > svg")?.getBoundingClientRect() || null;
  const placeFlight = () => {
    if (!me || typeof document === "undefined" || prefersReducedMotion()) return null;
    const source = flightTarget(`bets:rack:${tapStake}`);
    const face = mineFace();
    const anchor = face || wellRef.current?.querySelector(".fd-wagers-chip-well")?.getBoundingClientRect();
    if (!source || !anchor) return null;
    let release = () => {
    };
    const hold = new Promise((resolve) => {
      release = resolve;
    });
    try {
      source.animate(
        [{ transform: "scale(1)" }, { transform: "scale(.9)" }, { transform: "scale(1)" }],
        { duration: MOTION.fast * 2, easing: EASE.out }
      );
    } catch {
    }
    fly(source, hoverRect(anchor, PHONE_CHIP, face ? 10 : 6), {
      node: /* @__PURE__ */ React39.createElement(BankChip, { p: me, size: 46, val: tapStake }),
      arc: 64,
      hold
    });
    let settled = false;
    const finish = (next) => {
      if (!settled) {
        settled = true;
        release(next);
      }
    };
    return {
      /* the state is already painted when the ack lands; wait one frame so
         the new stack is measured, then drop onto it */
      land: () => requestAnimationFrame(() => {
        const now = mineFace();
        if (!now) {
          finish(null);
          return;
        }
        finish(face ? { to: faceRect(now), duration: MOTION.fast, fade: true } : { to: mineRef.current, duration: MOTION.fast * 1.5, land: true });
      }),
      back: () => finish({ to: flightTarget(`bets:rack:${tapStake}`) || source, arc: 40, duration: MOTION.flight }),
      cancel: () => finish(null)
    };
  };
  const retractFlight = () => {
    if (!me || typeof document === "undefined" || prefersReducedMotion()) return null;
    const face = mineFace();
    if (!face) return null;
    const value = mineChips[mineChips.length - 1];
    const from = faceRect(face);
    return {
      land: () => {
        const to = flightTarget(rackTargetFor(value, RACK_DENOMS, tapStake));
        if (to) fly(from, to, { node: /* @__PURE__ */ React39.createElement(BankChip, { p: me, size: Math.round(from.width), val: value }), arc: 48, land: true });
      },
      back: () => {
      },
      cancel: () => {
      }
    };
  };
  const chipSound = (kind) => {
    unlockSound();
    playSound(kind === "place" ? capLabel ? "S7" : "S5" : "S6");
  };
  const act = (kind, callback, queuedTap = false) => {
    if (pendingRef.current) {
      if (kind === "place" && pendingKindRef.current === "place" && !queuedTap && queueRef.current.length < PLACE_QUEUE) {
        tapTick();
        chipSound(kind);
        queueRef.current.push(callback);
        setQueued(queueRef.current.length);
      }
      return;
    }
    if (!queuedTap) tapTick();
    if (!queuedTap) chipSound(kind);
    pendingRef.current = true;
    pendingKindRef.current = kind;
    const before = live.current.mineTotal;
    setPendingAction(kind);
    setActionError(null);
    const flight = kind === "place" ? placeFlight() : retractFlight();
    flightRef.current = flight;
    let holding = false, saved2 = false;
    const finish = () => {
      if (!holding) {
        pendingRef.current = false;
        pendingKindRef.current = null;
      }
      setPendingAction(null);
      const next = saved2 && !holding && alive.current ? queueRef.current.shift() : null;
      if (!next) queueRef.current = [];
      setQueued(queueRef.current.length);
      if (next) act("place", next, true);
    };
    const check = (result) => {
      if (isUncertainResult(result)) {
        if (!landed(kind, before, live.current.mineTotal)) {
          holding = true;
          const settled = typeof result?.settled?.then === "function";
          setChecking({ kind, before, state: live.current.state, settled, flight });
          if (settled) result.settled.then((outcome) => outcome, () => ({ ok: false })).then((outcome) => {
            if (!alive.current) return;
            if (outcome?.ok === true) {
              haptic(kind === "place" ? "place" : "retract");
              flight?.land();
            } else if (!landed(kind, before, live.current.mineTotal)) {
              setActionError(kind === "place" ? "Not placed" : "Not removed");
              playSound("S26");
              flight?.back();
            } else flight?.land();
            pendingRef.current = false;
            setChecking(null);
          });
        } else flight?.land();
        return result;
      }
      if (result?.ok === false) {
        setActionError(result.error || "Bet not saved.");
        playSound("S26");
        flight?.back();
      } else if (result?.ok === true) {
        saved2 = true;
        haptic(kind === "place" ? "place" : "retract");
        flight?.land();
      } else flight?.cancel();
      return result;
    };
    const fail = (error) => {
      const message = error?.message || "Bet not saved.";
      setActionError(message);
      playSound("S26");
      flight?.back();
      return { ok: false, error: message };
    };
    try {
      const result = callback();
      if (result?.then) return Promise.resolve(result).then(check, fail).finally(finish);
      const checked = check(result);
      finish();
      return checked;
    } catch (error) {
      finish();
      return fail(error);
    }
  };
  const busyKind = pendingAction || checking?.kind || null;
  const everyone = orderStacks([...otherStacks, ...mineTotal > 0 ? [{ player: me, stake: mineTotal }] : []]);
  const { shown, rest } = groupStacks(everyone, feltSlots(lines) - 1, mineTotal > 0 ? me : null);
  const winInline = lines === 1 && players.length === 1;
  const valueLine = (amount) => /* @__PURE__ */ React39.createElement("span", { className: "fd-stacks-value" }, fmt5(amount));
  const wellCaption = unavailableReason ? unavailableLabel : marketOpen && players.length > 0 ? capLabel || fmt5(tapStake) : players.length ? "Locked" : "Pending";
  const placeable = !unavailableReason && marketOpen && players.length > 0;
  return /* @__PURE__ */ React39.createElement("div", { className: `fd-wagers-pick${lines === 1 ? " is-one-line" : ""}${mineTotal ? " is-mine" : ""}${roleLabel ? " is-your-side" : ""}${unavailableReason ? " is-unavailable" : ""}${busyKind ? ` is-pending-${busyKind}` : ""}` }, /* @__PURE__ */ React39.createElement("div", { className: `fd-wagers-pick-identity${players.length > 2 ? " is-team" : ""}` }, players.length === 1 ? /* @__PURE__ */ React39.createElement(
    "button",
    {
      type: "button",
      className: "fd-wagers-player",
      disabled: !onPlayer,
      onClick: () => onPlayer?.(players[0]),
      "aria-label": `View ${name}'s player card`
    },
    /* @__PURE__ */ React39.createElement(Avatar, { state, p: players[0], size: 26 }),
    winInline ? /* @__PURE__ */ React39.createElement("span", { className: "fd-wagers-player-text" }, /* @__PURE__ */ React39.createElement("span", null, name), /* @__PURE__ */ React39.createElement(WinLine, { line: winLine, className: "fd-wagers-win-inline" })) : /* @__PURE__ */ React39.createElement("span", null, name)
  ) : /* @__PURE__ */ React39.createElement(React39.Fragment, null, players.length > 2 && /* @__PURE__ */ React39.createElement("span", { className: "fd-wagers-team-name" }, name), /* @__PURE__ */ React39.createElement("span", { className: "fd-wagers-team-players" }, players.map((player) => /* @__PURE__ */ React39.createElement(
    "button",
    {
      type: "button",
      key: player,
      disabled: !onPlayer,
      onClick: () => onPlayer?.(player),
      title: disp(state, player),
      "aria-label": `View ${disp(state, player)}'s player card`
    },
    /* @__PURE__ */ React39.createElement(Avatar, { state, p: player, size: 24 }),
    /* @__PURE__ */ React39.createElement("span", null, disp(state, player))
  ))))), winSlot && !winInline && /* @__PURE__ */ React39.createElement("div", { className: "fd-wagers-win-slot" }, /* @__PURE__ */ React39.createElement(WinLine, { line: winLine, className: "fd-wagers-win" })), /* @__PURE__ */ React39.createElement(
    "div",
    {
      className: "fd-wagers-felt",
      role: "group",
      "aria-label": `Bets on ${name}`,
      "aria-busy": !!busyKind,
      style: { "--fd-stack-h": `${PHONE_STACK_H}px`, "--fd-felt-lines": lines }
    },
    /* @__PURE__ */ React39.createElement("div", { className: "fd-wagers-felt-head" }, /* @__PURE__ */ React39.createElement("span", { className: "fd-wagers-pick-role" }, roleLabel), sideTotal > 0 && /* @__PURE__ */ React39.createElement("span", { className: "fd-wagers-felt-total" }, fmt5(sideTotal))),
    /* @__PURE__ */ React39.createElement("div", { className: "fd-wagers-felt-stacks" }, /* @__PURE__ */ React39.createElement(
      "button",
      {
        type: "button",
        ref: wellRef,
        className: `fd-wagers-pick-main${capLabel ? " is-capped" : ""}${placeable ? "" : " is-closed"}`,
        disabled: !canPick || !!busyKind && !(pendingAction === "place" && !checking && queued < PLACE_QUEUE),
        onClick: () => act("place", onPick),
        "aria-label": canPick ? `Place a chip on ${name}` : name,
        "aria-description": unavailableReason || capReason || (canPick ? `Add ${fmt5(tapStake)} chips` : void 0)
      },
      /* @__PURE__ */ React39.createElement("span", { className: "fd-wagers-chip-well", "aria-hidden": "true" }, placeable ? "+" : ""),
      /* @__PURE__ */ React39.createElement("span", { className: placeable ? "fd-wagers-pick-add" : "fd-wagers-pick-closed" }, wellCaption)
    ), shown.map((item) => item.player === me ? marketOpen ? /* @__PURE__ */ React39.createElement(
      "button",
      {
        type: "button",
        key: item.player,
        ref: mineRef,
        className: "fd-wagers-retract",
        disabled: !!busyKind,
        onClick: () => act("remove", () => onRetract(mine[mine.length - 1].w.id)),
        "aria-label": `Retract your last chip on ${name}`,
        "aria-description": `Remove ${fmt5(mineChips[mineChips.length - 1])} chips; ${fmt5(mineTotal)} total on this pick`
      },
      /* @__PURE__ */ React39.createElement(ChipStack, { p: me, stake: mineTotal, size: PHONE_CHIP, mine: true, groups: mineChips, tag: false, tower: true }),
      valueLine(mineTotal)
    ) : /* @__PURE__ */ React39.createElement(
      "div",
      {
        key: item.player,
        ref: mineRef,
        className: "fd-wagers-owned-stack",
        role: "img",
        "aria-label": `${fmt5(mineTotal)} of your chips on ${name}`
      },
      /* @__PURE__ */ React39.createElement(ChipStack, { p: me, stake: mineTotal, size: PHONE_CHIP, mine: true, groups: mineChips, tag: false, tower: true }),
      valueLine(mineTotal)
    ) : /* @__PURE__ */ React39.createElement(
      "button",
      {
        type: "button",
        key: item.player,
        className: "fd-wagers-other",
        disabled: !onPlayer,
        onClick: () => onPlayer?.(item.player),
        title: disp(state, item.player),
        "aria-label": `View ${disp(state, item.player)}'s player card (${fmt5(item.stake)} chips)`
      },
      /* @__PURE__ */ React39.createElement(ChipStack, { p: item.player, stake: item.stake, size: PHONE_CHIP, tag: false, tower: true }),
      valueLine(item.stake)
    )), rest && /* @__PURE__ */ React39.createElement(StackGroup, { rest, size: PHONE_CHIP }))
  ), checking && /* @__PURE__ */ React39.createElement("p", { className: "fd-wagers-pick-checking", role: "status" }, "Checking\u2026"), actionError && !checking && /* @__PURE__ */ React39.createElement("p", { className: "fd-wagers-pick-error", role: "alert" }, actionError));
}
var SETTLE_SHOW_MS = 4600;
function SettleStrip({ me, settling }) {
  const { view, label: label2 } = settling;
  return /* @__PURE__ */ React39.createElement(
    "section",
    {
      className: "fd-wagers-settle",
      role: "status",
      "aria-label": `${label2} settled: ${fmt5(view.paid)} paid, ${fmt5(view.lost)} lost`
    },
    /* @__PURE__ */ React39.createElement("h2", null, label2),
    /* @__PURE__ */ React39.createElement("div", { className: "fd-wagers-settle-row", "aria-hidden": "true" }, view.winners.length > 0 && /* @__PURE__ */ React39.createElement("div", { className: "fd-wagers-settle-zone is-won" }, /* @__PURE__ */ React39.createElement("strong", null, "+", fmt5(view.paid)), /* @__PURE__ */ React39.createElement(BetStacks, { stacks: view.winners, size: 24, delay: 900, mine: me })), view.losers.length > 0 && /* @__PURE__ */ React39.createElement("div", { className: "fd-wagers-settle-zone is-lost" }, /* @__PURE__ */ React39.createElement("strong", null, "\u2212", fmt5(view.lost)), /* @__PURE__ */ React39.createElement(BetStacks, { stacks: view.losers, size: 24, delay: 450, mine: me })))
  );
}
function RackChip({ value, me, disabled, selected, onClick }) {
  const target = useFlightTarget(`bets:rack:${value}`);
  return /* @__PURE__ */ React39.createElement(
    "button",
    {
      type: "button",
      ref: target,
      disabled,
      onClick,
      "aria-pressed": selected,
      "aria-label": `Bet ${value} a tap`,
      className: selected ? "is-selected" : ""
    },
    /* @__PURE__ */ React39.createElement(BankChip, { p: me, size: 46, val: value })
  );
}
var HOME_FLIGHT_AT = 1300;
function HeldBoard({ state, me, held, view, onSkip }) {
  const mineRef = useRef28(null);
  useStageHold(`bets:held:${held.id}`, true);
  const paid = (view.sides.find((side) => side.won)?.stacks || []).filter((item) => item.player === me).reduce((sum, item) => sum + item.paid, 0);
  useEffect24(() => {
    if (!me || paid <= 0) return void 0;
    const timer = setTimeout(() => {
      const svg = mineRef.current?.querySelector(".fd-stack > svg");
      if (!svg) return;
      const from = faceRect(svg.getBoundingClientRect());
      const count = Math.max(1, Math.min(5, Math.round(paid / PT)));
      for (let i = 0; i < count; i++) fly(from, "tab:home", {
        node: /* @__PURE__ */ React39.createElement(BankChip, { p: me, size: Math.round(from.width), val: PT }),
        delay: i * 70,
        arc: 60,
        duration: 560,
        scale: 0.7,
        fade: true,
        land: i === count - 1
      });
    }, HOME_FLIGHT_AT);
    return () => clearTimeout(timer);
  }, []);
  const { contest, ev, label: label2, winSlot = false } = held;
  const lines = (contest.sides || []).length > 2 ? 1 : 2;
  const sides = contest.kind === "ffa" ? view.sides.filter((side) => side.won || side.stacks.length) : view.sides;
  const nameOf2 = (side) => {
    const drawn = typeof side.key === "number" ? state.draws?.[ev.id]?.teams?.[side.key] : null;
    return side.players.length === 1 ? disp(state, side.players[0]) : teamLabel(state, drawn || { players: side.players });
  };
  return /* @__PURE__ */ React39.createElement("section", { className: "fd-wagers-event fd-wagers-held", onClick: onSkip, "aria-label": `${label2} settled` }, /* @__PURE__ */ React39.createElement("div", { className: "fd-wagers-contest-heading" }, /* @__PURE__ */ React39.createElement("div", null, /* @__PURE__ */ React39.createElement("h2", null, contest.kind === "ffa" ? "Winner" : label2), /* @__PURE__ */ React39.createElement("p", null, contestMult(contest) === 1 ? "Winner pays 1:1" : "Winner pays 2:1"))), /* @__PURE__ */ React39.createElement("div", { className: "fd-wagers-picks" }, sides.map((side) => {
    const { shown, rest } = groupStacks(side.stacks, feltSlots(lines) - 1, side.stacks.some((item) => item.player === me) ? me : null);
    const head = side.won ? side.paid > 0 && /* @__PURE__ */ React39.createElement("span", { className: "fd-wagers-held-head is-up" }, "+", fmt5(side.paid)) : side.total > 0 && /* @__PURE__ */ React39.createElement("span", { className: "fd-wagers-held-head is-down" }, "\u2212", fmt5(side.total));
    return /* @__PURE__ */ React39.createElement("div", { key: String(side.key), className: `fd-wagers-pick fd-wagers-held-side${lines === 1 ? " is-one-line" : ""} ${side.won ? "is-won" : "is-lost"}` }, /* @__PURE__ */ React39.createElement("div", { className: `fd-wagers-pick-identity${side.players.length > 2 ? " is-team" : ""}` }, side.players.length === 1 ? /* @__PURE__ */ React39.createElement("span", { className: "fd-wagers-player" }, /* @__PURE__ */ React39.createElement(Avatar, { state, p: side.players[0], size: 26 }), /* @__PURE__ */ React39.createElement("span", null, nameOf2(side))) : /* @__PURE__ */ React39.createElement(React39.Fragment, null, side.players.length > 2 && /* @__PURE__ */ React39.createElement("span", { className: "fd-wagers-team-name" }, nameOf2(side)), /* @__PURE__ */ React39.createElement("span", { className: "fd-wagers-team-players" }, side.players.map((player) => /* @__PURE__ */ React39.createElement("span", { key: player, className: "fd-wagers-held-face" }, /* @__PURE__ */ React39.createElement(Avatar, { state, p: player, size: 24 }), /* @__PURE__ */ React39.createElement("span", null, disp(state, player))))))), winSlot && !(lines === 1 && side.players.length === 1) && /* @__PURE__ */ React39.createElement("div", { className: "fd-wagers-win-slot" }), /* @__PURE__ */ React39.createElement("div", { className: "fd-wagers-felt", style: { "--fd-stack-h": `${PHONE_STACK_H}px`, "--fd-felt-lines": lines } }, /* @__PURE__ */ React39.createElement("div", { className: "fd-wagers-felt-head" }, head || /* @__PURE__ */ React39.createElement("span", null), side.won && /* @__PURE__ */ React39.createElement("span", { className: "fd-wagers-won", "aria-label": "Won" }, "WON")), /* @__PURE__ */ React39.createElement("div", { className: "fd-wagers-felt-stacks" }, /* @__PURE__ */ React39.createElement("span", { className: "fd-wagers-held-well", "aria-hidden": "true" }), shown.map((item, index) => side.won ? /* @__PURE__ */ React39.createElement("span", { key: item.player, className: "fd-wagers-held-stack", ref: item.player === me ? mineRef : void 0 }, /* @__PURE__ */ React39.createElement(
      ChipStack,
      {
        p: item.player,
        stake: item.stake,
        paid: item.paid,
        size: PHONE_CHIP,
        settle: "won",
        delay: 500 + index * 90,
        mine: item.player === me,
        tag: false,
        tower: true
      }
    ), /* @__PURE__ */ React39.createElement("span", { className: "fd-stacks-value" }, fmt5(item.stake + item.paid))) : /* @__PURE__ */ React39.createElement(
      "span",
      {
        key: item.player,
        className: "fd-wagers-held-stack fd-stacks-slot is-lost",
        style: { animationDelay: `${200 + index * 90}ms` }
      },
      /* @__PURE__ */ React39.createElement(ChipStack, { p: item.player, stake: item.stake, size: PHONE_CHIP, mine: item.player === me, tag: false, tower: true }),
      /* @__PURE__ */ React39.createElement("span", { className: "fd-stacks-value" }, fmt5(item.stake))
    )), rest && /* @__PURE__ */ React39.createElement(StackGroup, { rest, size: PHONE_CHIP }))));
  })));
}
function StackMeter({ pts, cap, bets, duels, room }) {
  const exposure = bets + duels;
  const scale = Math.max(pts, exposure, cap, 1);
  const at = (value) => Math.max(0, Math.min(100, value / scale * 100));
  const pct = (value) => `${at(value)}%`;
  const betsIn = Math.min(bets, cap), duelsIn = Math.min(duels, Math.max(0, cap - betsIn));
  const over = Math.max(0, exposure - cap);
  const capped = room < PT && pts - exposure >= PT;
  return /* @__PURE__ */ React39.createElement(
    "div",
    {
      className: `fd-wagers-meter${capped ? " is-capped" : ""}${over ? " is-over" : ""}`,
      role: "meter",
      "aria-label": "Chips at risk",
      "aria-valuemin": 0,
      "aria-valuemax": Math.max(cap, exposure),
      "aria-valuenow": exposure,
      "aria-valuetext": `${fmt5(exposure)} at risk, ${fmt5(cap)} maximum, ${fmt5(pts)} in your stack${duels ? `, ${fmt5(duels)} reserved for duels` : ""}`
    },
    /* @__PURE__ */ React39.createElement("div", { className: "fd-wagers-meter-top", "aria-hidden": "true" }, /* @__PURE__ */ React39.createElement("span", { className: "fd-wagers-meter-room" }, /* @__PURE__ */ React39.createElement("strong", null, fmt5(room)), /* @__PURE__ */ React39.createElement("small", null, "to bet")), exposure > 0 && /* @__PURE__ */ React39.createElement("span", { className: "fd-wagers-meter-down" }, fmt5(exposure), /* @__PURE__ */ React39.createElement("small", null, "in bets"))),
    /* @__PURE__ */ React39.createElement("div", { className: "fd-wagers-meter-bar", "aria-hidden": "true" }, betsIn > 0 && /* @__PURE__ */ React39.createElement("span", { className: "is-bets", style: { left: 0, width: pct(betsIn) } }), duelsIn > 0 && /* @__PURE__ */ React39.createElement("span", { className: "is-duels", style: { left: pct(betsIn), width: pct(duelsIn) } }), over > 0 && /* @__PURE__ */ React39.createElement("span", { className: "is-over", style: { left: pct(cap), width: pct(over) } }), /* @__PURE__ */ React39.createElement("i", { className: "fd-wagers-meter-notch", style: { left: pct(cap) } })),
    /* @__PURE__ */ React39.createElement("div", { className: "fd-wagers-meter-scale", "aria-hidden": "true" }, /* @__PURE__ */ React39.createElement("span", { className: "is-cap", style: { left: `${Math.min(92, Math.max(8, at(cap)))}%` } }, fmt5(cap)), at(cap) <= 72 && /* @__PURE__ */ React39.createElement("span", { className: "is-stack" }, fmt5(pts)))
  );
}
function WagerLine({ x, state, events, gm, manage = false, onVoid, onPlayer }) {
  const { w, r } = x;
  const label2 = wagerPickLabel(state, w, events);
  const win = wagerMult(w) * w.stake;
  const [confirming, setConfirming] = useState34(false), [voiding, setVoiding] = useState34(false);
  const voidBusy = useRef28(false);
  const ids = w.ids || [w.id];
  const voidable = gm && manage && r.status === "pending" && !!onVoid;
  return /* @__PURE__ */ React39.createElement("article", { className: `fd-wagers-line is-${r.status}` }, /* @__PURE__ */ React39.createElement(
    "button",
    {
      type: "button",
      className: "fd-wagers-ledger-player",
      disabled: !onPlayer,
      onClick: () => onPlayer?.(w.player),
      "aria-label": `View ${disp(state, w.player)}'s player card`
    },
    /* @__PURE__ */ React39.createElement(Avatar, { state, p: w.player, size: 32 })
  ), /* @__PURE__ */ React39.createElement("div", { className: "fd-wagers-line-copy" }, /* @__PURE__ */ React39.createElement("span", { className: "fd-wagers-line-bettor" }, /* @__PURE__ */ React39.createElement(
    "button",
    {
      type: "button",
      disabled: !onPlayer,
      onClick: () => onPlayer?.(w.player)
    },
    disp(state, w.player)
  ), " ", /* @__PURE__ */ React39.createElement("span", null, "\xB7 ", fmt5(w.stake), " chips")), /* @__PURE__ */ React39.createElement("strong", null, label2.pick), /* @__PURE__ */ React39.createElement("span", { className: "fd-wagers-line-context" }, label2.ctx)), /* @__PURE__ */ React39.createElement("div", { className: "fd-wagers-line-result" }, r.status === "pending" && /* @__PURE__ */ React39.createElement(React39.Fragment, null, /* @__PURE__ */ React39.createElement("small", null, "TO WIN"), /* @__PURE__ */ React39.createElement("strong", null, "+", fmt5(win))), r.status === "won" && /* @__PURE__ */ React39.createElement(React39.Fragment, null, /* @__PURE__ */ React39.createElement("small", null, "WON"), /* @__PURE__ */ React39.createElement("strong", null, "+", fmt5(r.delta))), r.status === "lost" && /* @__PURE__ */ React39.createElement(React39.Fragment, null, /* @__PURE__ */ React39.createElement("small", null, "LOST"), /* @__PURE__ */ React39.createElement("strong", null, fmt5(r.delta))), r.status === "void" && /* @__PURE__ */ React39.createElement("small", null, "VOID"), voidable && !confirming && /* @__PURE__ */ React39.createElement(
    "button",
    {
      type: "button",
      className: "fd-wagers-void",
      onClick: () => setConfirming(true)
    },
    "Void"
  )), voidable && confirming && /* @__PURE__ */ React39.createElement("div", { className: "fd-wagers-void-confirm", role: "group", "aria-label": "Confirm void" }, /* @__PURE__ */ React39.createElement("span", null, disp(state, w.player), ", ", ids.length, " bet", ids.length === 1 ? "" : "s", ", ", fmt5(w.stake), " chips back"), /* @__PURE__ */ React39.createElement("button", { type: "button", className: "is-commit", disabled: voiding, onClick: async () => {
    if (voidBusy.current) return void 0;
    voidBusy.current = true;
    setVoiding(true);
    try {
      const result = await onVoid(ids);
      if (result?.ok !== false) setConfirming(false);
      return result;
    } finally {
      voidBusy.current = false;
      setVoiding(false);
    }
  } }, voiding ? "Voiding\u2026" : `Void ${ids.length === 1 ? "bet" : `${ids.length} bets`}`), /* @__PURE__ */ React39.createElement("button", { type: "button", disabled: voiding, onClick: () => setConfirming(false) }, "Keep")));
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
function Wagers({
  state,
  me,
  standings,
  gm,
  events,
  wagerEv,
  onEvents,
  onEvent,
  onPick,
  onVoid,
  onRetract,
  onPlayer,
  GameMark: GameMark2,
  openSettled = false,
  onSettledSeen
}) {
  const [settledOpen, setSettledOpen] = useState34(() => openSettled && me ? `st:${me}` : null);
  const [settledShown, setSettledShown] = useState34(!!openSettled);
  const settledRef = useRef28(null);
  useEffect24(() => {
    if (!openSettled) return;
    setSettledShown(true);
    if (me) setSettledOpen(`st:${me}`);
    settledRef.current?.scrollIntoView?.({ block: "start" });
    onSettledSeen?.();
  }, [openSettled]);
  const [denom, setDenom] = useState34(PT);
  const [manage, setManage] = useState34(false);
  const resolved = useMemo7(
    () => (state.wagers || []).map((w) => ({ w, r: resolveWager(state, w, events) })),
    [state, events]
  );
  const pending = resolved.filter((x) => x.r.status === "pending");
  const pendingLines = mergeWagerLines(pending);
  const settledLines = mergeWagerLines(resolved.filter((x) => x.r.status !== "pending"));
  const settledByPlayer = useMemo7(() => {
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
  const duelAntes = me ? duelReserve(state, me) : 0;
  const myExp = wagerRisk + duelAntes;
  const room = me ? Math.max(0, Math.min(myCap - myExp, myPts - myExp)) : 0;
  const capBinds = !!me && room < PT && myPts - myExp >= PT;
  useEffect24(() => {
    if (denom > PT && room >= PT && denom > room)
      setDenom([...RACK_DENOMS].reverse().find((value) => value <= room) || PT);
  }, [room, denom]);
  const tapStake = denom <= room ? denom : [...RACK_DENOMS].reverse().find((value) => value <= room) || PT;
  const ev = wagerEv;
  const finaleClosed = stacksPosted(state) || !!(state.poker && !state.results?.[state.poker.id]);
  const contest = ev ? resolveCurrentContest(state, ev) : null;
  const lifecycle = ev ? resolveEventLifecycle(state, ev) : null;
  const marketOpen = !!contest && contest.phase === "betting-open" && !!state.live && !state.frozen && !state.results?.[ev?.id] && !stacksPosted(state) && !(state.poker && !state.results?.[state.poker.id]);
  const ownSide = contest?.sides.find((side) => side.players.includes(me));
  const evenMoney = contestMult(contest) === 1;
  const restricted = !!ownSide && evenMoney;
  const contestNoun = contest?.kind === "match" || contest?.kind === "ffa" ? "match" : contest?.kind === "heat" ? "heat" : "final";
  const restriction = restricted ? `You can only bet on ${ownSide.players.length > 1 ? "your team" : "yourself"} in this ${contestNoun}.` : null;
  const heldSide = me && contest ? contestSideOf(state, contest, me, events) : null;
  const winLines = useMemo7(
    () => contest && ev ? contestWinLines(state, ev, contest, { events }) : [],
    [state, ev?.id, contest?.id]
  );
  const picks = (contest?.sides || []).map((side) => {
    const own = side.players.includes(me);
    const drawnTeam = typeof side.key === "number" ? state.draws?.[ev.id]?.teams?.[side.key] : null;
    const name = side.players.length === 1 ? disp(state, side.players[0]) : teamLabel(state, drawnTeam || { players: side.players });
    const pick = contestPick(contest, side, ev);
    const eligible = !!me && contestBetEligibility(contest, me, side.key);
    const otherSide = eligible && heldSide !== null && heldSide !== side.key;
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
      winLine: winLineFor(winLines, side.key),
      roleLabel: own ? side.players.length > 1 ? "Your team" : "Back yourself" : null,
      unavailableReason: restricted && !eligible ? restriction : otherSide && marketOpen ? "One side per contest. Your chips are on the other side." : null,
      unavailableLabel: restricted && !eligible ? "Opponent" : "Other side",
      canPick: marketOpen && room >= PT && eligible && !otherSide,
      capLabel: marketOpen && eligible && !otherSide && capBinds ? `Max ${fmt5(myCap)}` : null,
      capReason: marketOpen && eligible && !otherSide && capBinds ? `At your ${fmt5(myCap)} limit` : null,
      onPick: () => onPick({ ...pick, stake: tapStake })
    };
  });
  if (contest?.kind === "ffa") picks.sort((a, b) => Number(!!b.roleLabel) - Number(!!a.roleLabel));
  const winSlot = picks.some((pick) => !!pick.winLine?.text);
  const lines = picks.length > 2 ? 1 : 2;
  picks.forEach((pick) => {
    pick.winSlot = winSlot;
    pick.lines = lines;
  });
  const status = marketOpen ? "Betting open" : contest?.phase === "awaiting-result" ? "Awaiting result" : !contest ? lifecycle?.label || "Betting locked" : "Betting locked";
  const boardKey = ev ? `${ev.id}:${contest?.id || ""}` : "";
  const boardChange = useFreshChange(boardKey);
  const frame2 = useMotionFrame();
  const watched = useRef28(null);
  const [settling, setSettling] = useState34(null);
  const [held, setHeld] = useState34(null);
  const [dealing, setDealing] = useState34(0);
  useLayoutEffect10(() => {
    const prev = watched.current;
    watched.current = ev && contest ? { ev, contest, winSlot, label: contest.kind === "ffa" ? ev.name || "Winner" : contest.label } : null;
    if (!boardChange.fresh || !prev || prev.contest.id === contest?.id) return;
    const decided3 = decidedContest(state, events, prev.ev.id, prev.contest);
    if (!decided3) return;
    if (boardChange.animate) {
      setSettling(null);
      setHeld({ id: `${prev.contest.id}:${boardChange.changeId}`, ...prev });
      return;
    }
    const view = settledStacks(state, events, prev.contest);
    if (view.any) setSettling({ id: prev.contest.id, label: prev.label, view });
  }, [boardKey]);
  const heldView = held ? decidedContest(state, events, held.ev.id, held.contest) : null;
  const endHold = () => {
    setHeld(null);
    setDealing((value) => value + 1);
  };
  useEffect24(() => {
    if (!held) return void 0;
    const timer = setTimeout(endHold, MOTION.settleHold);
    return () => clearTimeout(timer);
  }, [held?.id]);
  useEffect24(() => {
    if (held && (!heldView || frame2.correction)) setHeld(null);
  }, [held?.id, !!heldView, frame2.seq]);
  useEffect24(() => {
    if (!dealing) return void 0;
    const timer = setTimeout(() => setDealing(0), MOTION.story + 200);
    return () => clearTimeout(timer);
  }, [dealing]);
  useEffect24(() => {
    if (!settling) return void 0;
    const timer = setTimeout(() => setSettling(null), SETTLE_SHOW_MS);
    return () => clearTimeout(timer);
  }, [settling?.id]);
  const peek = !!onEvent && !!ev && !state.results?.[ev.id] && !!state.brackets?.[ev.id] && !!state.draws?.[ev.id];
  const contextLabel = contest?.kind === "match" || state.brackets?.[ev?.id] ? "Full bracket" : contest?.kind === "heat" || contest?.kind === "stage-final" || state.stages?.[ev?.id] ? "Heats and final" : "Event details";
  const holding = !!(held && heldView);
  const headEv = holding ? held.ev : ev;
  const liveDot = marketOpen && !holding;
  return /* @__PURE__ */ React39.createElement(
    "div",
    {
      className: `fd-wagers${me && marketOpen ? " has-rack" : ""}`,
      style: { "--fd-wagers-numerals": DISPLAY, "--fd-wagers-body": SANS }
    },
    headEv ? /* @__PURE__ */ React39.createElement("header", { className: "fd-wagers-event-heading" }, /* @__PURE__ */ React39.createElement("div", null, /* @__PURE__ */ React39.createElement("h1", null, headEv.name), GameMark2 && /* @__PURE__ */ React39.createElement(GameMark2, { id: headEv.game, size: 34 })), /* @__PURE__ */ React39.createElement("div", { className: "fd-wagers-event-meta" }, /* @__PURE__ */ React39.createElement("span", { className: `fd-wagers-status${liveDot ? " is-open" : ""}` }, /* @__PURE__ */ React39.createElement("i", { className: liveDot ? "fd-beat-dot" : void 0, "aria-hidden": "true" }), holding ? "Settled" : status))) : /* @__PURE__ */ React39.createElement(PageHeading, { title: "Bets" }),
    settling && /* @__PURE__ */ React39.createElement(SettleStrip, { key: settling.id, me, settling }),
    holding && /* @__PURE__ */ React39.createElement(HeldBoard, { key: held.id, state, me, held, view: heldView, onSkip: endHold }),
    !ev && !holding && /* @__PURE__ */ React39.createElement("section", { className: `fd-wagers-waiting${state.frozen || finaleClosed ? " is-finished" : ""}` }, /* @__PURE__ */ React39.createElement("div", { className: "fd-wagers-waiting-copy" }, /* @__PURE__ */ React39.createElement("h2", null, state.frozen ? "The board is frozen." : finaleClosed ? "Betting is closed for the finale" : state.live ? "Between events" : "Betting opens with the first event"), !state.frozen && !finaleClosed && /* @__PURE__ */ React39.createElement(ActionButton, { variant: "secondary", onClick: onEvents }, "Browse the events"))),
    ev && !holding && /* @__PURE__ */ React39.createElement("section", { className: "fd-wagers-event" }, /* @__PURE__ */ React39.createElement("div", { className: "fd-wagers-contest-heading" }, /* @__PURE__ */ React39.createElement("div", null, /* @__PURE__ */ React39.createElement("h2", null, contest?.kind === "ffa" ? "Winner" : contest?.label || "Bets"), contest && /* @__PURE__ */ React39.createElement("p", null, evenMoney ? "Winner pays 1:1" : "Winner pays 2:1")), onEvent && !peek && /* @__PURE__ */ React39.createElement("button", { type: "button", className: "fd-wagers-context", onClick: () => onEvent(ev) }, contextLabel, /* @__PURE__ */ React39.createElement("span", { "aria-hidden": "true" }, "\u2197"))), contest && picks.length > 0 ? /* @__PURE__ */ React39.createElement(
      "section",
      {
        className: `fd-wagers-market fd-wagers-contest is-${contest.kind}${dealing ? " is-dealing" : ""}`,
        "aria-label": contest.label
      },
      /* @__PURE__ */ React39.createElement("div", { className: "fd-wagers-picks" }, picks.map((pick) => /* @__PURE__ */ React39.createElement(MarketPick, { ...pick, key: `${contest.id}:${pick.key}` })))
    ) : /* @__PURE__ */ React39.createElement("p", { className: "fd-wagers-contest-waiting" }, state.results?.[ev.id] ? "Result posted." : "Waiting for the next contest."), me && marketOpen && myPts - myExp < PT && /* @__PURE__ */ React39.createElement("p", { className: "fd-wagers-limit", role: "status" }, "No chips available."), peek && /* @__PURE__ */ React39.createElement(BracketPeek, { state, ev, me, onOpen: onEvent, card: true })),
    pendingLines.length > 0 && /* @__PURE__ */ React39.createElement("details", { className: "fd-wagers-history", open: !contest || void 0 }, /* @__PURE__ */ React39.createElement("summary", null, "Open bets ", /* @__PURE__ */ React39.createElement("span", null, pendingLines.length)), gm && onVoid && /* @__PURE__ */ React39.createElement(
      "button",
      {
        type: "button",
        className: "fd-wagers-manage",
        "aria-pressed": manage,
        onClick: () => setManage((value) => !value)
      },
      manage ? "Done" : "Manage"
    ), /* @__PURE__ */ React39.createElement("div", { className: "fd-wagers-ledger" }, pendingLines.map((x) => /* @__PURE__ */ React39.createElement(WagerLine, { key: x.w.id, x, state, events, gm, manage, onVoid, onPlayer })))),
    settledLines.length > 0 && /* @__PURE__ */ React39.createElement(
      "details",
      {
        className: "fd-wagers-history",
        ref: settledRef,
        open: settledShown,
        onToggle: (event) => setSettledShown(event.currentTarget.open)
      },
      /* @__PURE__ */ React39.createElement("summary", null, "Settled ", /* @__PURE__ */ React39.createElement("span", null, settledLines.length)),
      /* @__PURE__ */ React39.createElement("div", { className: "fd-wagers-settled-list" }, settledByPlayer.map((group) => {
        const key = `st:${group.player}`, open = settledOpen === key;
        return /* @__PURE__ */ React39.createElement("div", { className: `fd-wagers-settled${open ? " is-open" : ""}`, key: group.player }, /* @__PURE__ */ React39.createElement("div", { className: "fd-wagers-settled-row" }, /* @__PURE__ */ React39.createElement(
          "button",
          {
            type: "button",
            className: "fd-wagers-settled-person",
            disabled: !onPlayer,
            onClick: () => onPlayer?.(group.player),
            "aria-label": `View ${disp(state, group.player)}'s player card`
          },
          /* @__PURE__ */ React39.createElement(Avatar, { state, p: group.player, size: 32 }),
          /* @__PURE__ */ React39.createElement("strong", null, disp(state, group.player))
        ), /* @__PURE__ */ React39.createElement(
          "button",
          {
            type: "button",
            className: "fd-wagers-settled-toggle",
            "aria-expanded": open,
            "aria-label": `${open ? "Hide" : "View"} settled bets by ${disp(state, group.player)}`,
            onClick: () => setSettledOpen((current) => current === key ? null : key)
          },
          /* @__PURE__ */ React39.createElement("small", null, group.lines.length, " bet", group.lines.length === 1 ? "" : "s"),
          /* @__PURE__ */ React39.createElement("span", { className: `fd-wagers-net${group.net > 0 ? " is-up" : group.net < 0 ? " is-down" : ""}` }, group.net > 0 ? "+" : "", fmt5(group.net)),
          /* @__PURE__ */ React39.createElement("span", { className: "fd-wagers-settled-arrow", "aria-hidden": "true" }, open ? "\u2212" : "+")
        )), open && /* @__PURE__ */ React39.createElement("div", { className: "fd-wagers-settled-detail" }, group.lines.map((x) => /* @__PURE__ */ React39.createElement(WagerLine, { key: x.w.id, x, state, events, gm, onVoid, onPlayer }))));
      }))
    ),
    me && ev && marketOpen && !holding && /* @__PURE__ */ React39.createElement("section", { className: `fd-wagers-rack fd-night${dealing ? " is-dealing" : ""}`, "aria-label": "Choose your betting chip" }, /* @__PURE__ */ React39.createElement(StackMeter, { pts: myPts, cap: myCap, bets: wagerRisk, duels: duelAntes, room }), /* @__PURE__ */ React39.createElement("div", { className: "fd-wagers-denoms", role: "group", "aria-label": "Chip value per tap" }, RACK_DENOMS.map((value) => {
      const affordable = value <= room;
      return /* @__PURE__ */ React39.createElement(
        RackChip,
        {
          key: value,
          value,
          me,
          disabled: !affordable,
          selected: tapStake === value && affordable,
          onClick: () => {
            tapTick();
            setDenom(value);
          }
        }
      );
    })))
  );
}

// src/App.jsx
init_PlayerIdentityContext();
init_PlayerIdentity();
init_Travel();
init_ProfileEditor();
import React75, { useState as useState62, useEffect as useEffect51, useLayoutEffect as useLayoutEffect16, useRef as useRef58, useMemo as useMemo16, useCallback as useCallback7, useId as useId4, lazy, Suspense } from "react";

// src/features/profile/PlayerSheet.jsx
init_core();
init_PlayerIdentity();
init_controls();
import React42, { useEffect as useEffect27, useMemo as useMemo8, useRef as useRef31, useState as useState37 } from "react";
init_PlayerPass();
init_seasonStats();
init_motion2();
init_serverClock();
var fmt6 = (n) => (n ?? 0).toLocaleString("en-US");
var signed = (n) => `${n > 0 ? "+" : ""}${fmt6(n)}`;
var OUTCOME = { won: "Won", lost: "Lost", push: "Push", void: "Void" };
function rematchAvailable(state, me, p, { events = [], now = serverNow() } = {}) {
  if (!me || !p || me === p || !duelsOpen(state)) return false;
  if (state.away?.[me] || state.away?.[p] || duelBetween(state, me, p, now)) return false;
  return headToHead(state, me, p, events.length ? events : void 0).count > 0;
}
function PlayerSheet({
  state,
  me,
  p,
  standings,
  events = [],
  onClose,
  onBack,
  onEdit,
  onDuel,
  onSent,
  onPlay,
  onAccept,
  onDecline,
  onWithdraw
}) {
  const [ante, setAnte] = useState37(PT);
  const [pending, setPending] = useState37(false);
  const [error, setError] = useState37("");
  const sending = useRef31(false);
  const now = serverNow();
  const row = standings.find((item) => item.player === p);
  const duels = state.duels || [];
  const settled = duels.map((d) => resolveDuel(d)).filter((result) => result.settled && !result.push);
  const duelWins = settled.filter((result) => result.winner === p).length;
  const duelLosses = settled.filter((result) => result.loser === p).length;
  const wins = events.filter((event) => state.results[event.id]?.slots?.[0]?.includes(p));
  const own = !!me && me === p;
  const away = !!(state.away?.[p] || me && state.away?.[me]);
  const canDuel = !!(onDuel && me && duelsOpen(state));
  const current = !me ? null : own ? duels.find((d) => d.open && d.from === me && duelPhase(d, now) === "offered") || null : duelBetween(state, me, p, now) || duels.find((d) => d.from === p && d.open && duelView(state, d, me, now).takeable) || null;
  const record = me && !own ? duelRecord(state, me, p) : null;
  const history = own ? duels.map((d) => duelResult(state, d, me)).filter(Boolean).sort((a, b) => (b.ts || 0) - (a.ts || 0)) : record?.lines || [];
  const last = !own ? history[0] : null;
  const room = (player) => duelRoom(state, player, { events, rows: standings, now }).room;
  const anteMax = canDuel && !away && !current ? Math.min(room(me), own ? Infinity : room(p)) : 0;
  const dailyLimit = !!me && duelsSentToday(state, me, now) >= DUEL_DAILY_LIMIT;
  const unavailable = dailyLimit ? "Daily limit of 3 challenges reached." : anteMax < PT ? "Not enough chips for an ante." : "";
  const rematch = !!last && last.outcome !== "void" && ante === last.stake;
  const [turned, setTurned] = useState37(false);
  const duelRef = useRef31(null);
  const reducedMotion = useReducedMotion();
  const canRematch = useMemo8(
    () => !!onDuel && rematchAvailable(state, me, p, { events, now }),
    [state, me, p, events, onDuel]
  );
  const openRematch = () => {
    if (last && last.outcome !== "void" && last.stake <= anteMax) setAnte(last.stake);
    const section = duelRef.current;
    section?.scrollIntoView?.({ block: "center", behavior: reducedMotion ? "auto" : "smooth" });
    section?.querySelector?.("[data-duel-send]")?.focus?.({ preventScroll: true });
  };
  useEffect27(() => {
    setAnte((currentAnte) => currentAnte <= anteMax ? currentAnte : ANTES.filter((value) => value <= anteMax).at(-1) || PT);
  }, [anteMax]);
  useEffect27(() => {
    setAnte(last && last.stake <= anteMax ? last.stake : PT);
    setError("");
  }, [p]);
  const challenge = async () => {
    if (sending.current || !canDuel || away || current || unavailable || ante > anteMax) return;
    tapTick();
    sending.current = true;
    setPending(true);
    setError("");
    try {
      const result = own ? await onDuel(ante, true) : await onDuel(ante);
      if (result?.ok) onSent ? onSent(result) : onClose();
      else setError(result?.error || "Challenge wasn't sent. Try again.");
    } catch (cause) {
      setError(cause?.message || "Challenge wasn't sent. Try again.");
    } finally {
      sending.current = false;
      setPending(false);
    }
  };
  return /* @__PURE__ */ React42.createElement(Sheet, { title: disp(state, p), onClose, onBack, busy: pending }, /* @__PURE__ */ React42.createElement("div", { className: "fd-player-sheet" }, /* @__PURE__ */ React42.createElement(
    PlayerPass,
    {
      key: p,
      state,
      p,
      compact: true,
      viewer: me || null,
      events: events.length ? events : void 0,
      standings,
      onFlip: setTurned
    }
  ), turned && canRematch && /* @__PURE__ */ React42.createElement(
    ActionButton,
    {
      type: "button",
      className: "fd-player-rematch",
      onClick: openRematch
    },
    "Rematch"
  ), state.live && row && /* @__PURE__ */ React42.createElement("dl", { className: "fd-player-stats", "aria-label": "Tournament stats" }, /* @__PURE__ */ React42.createElement("div", null, /* @__PURE__ */ React42.createElement("dt", null, "Position"), /* @__PURE__ */ React42.createElement("dd", null, row.rank)), /* @__PURE__ */ React42.createElement("div", null, /* @__PURE__ */ React42.createElement("dt", null, "Chips"), /* @__PURE__ */ React42.createElement("dd", null, fmt6(row.pts))), /* @__PURE__ */ React42.createElement("div", null, /* @__PURE__ */ React42.createElement("dt", null, "Wins"), /* @__PURE__ */ React42.createElement("dd", null, row.wins))), state.live && row && (row.betNet !== 0 || duelWins > 0 || duelLosses > 0) && /* @__PURE__ */ React42.createElement("dl", { className: "fd-player-record" }, row.betNet !== 0 && /* @__PURE__ */ React42.createElement("div", null, /* @__PURE__ */ React42.createElement("dt", null, "Wagers"), /* @__PURE__ */ React42.createElement("dd", null, signed(row.betNet))), (duelWins > 0 || duelLosses > 0) && /* @__PURE__ */ React42.createElement("div", null, /* @__PURE__ */ React42.createElement("dt", null, "Duels"), /* @__PURE__ */ React42.createElement("dd", null, duelWins, " won \xB7 ", duelLosses, " lost", /* @__PURE__ */ React42.createElement("span", null, signed(row.duelNet), " chips")))), wins.length > 0 && /* @__PURE__ */ React42.createElement("section", { className: "fd-player-wins", "aria-label": "Event wins" }, /* @__PURE__ */ React42.createElement("h2", null, "Event wins"), /* @__PURE__ */ React42.createElement("ul", null, wins.map((event) => /* @__PURE__ */ React42.createElement("li", { key: event.id }, event.name)))), own && onEdit && /* @__PURE__ */ React42.createElement(
    ActionButton,
    {
      type: "button",
      variant: "secondary",
      onClick: onEdit,
      style: { width: "100%" }
    },
    "Edit your profile"
  ), canDuel && (current || !away) && /* @__PURE__ */ React42.createElement("section", { ref: duelRef, className: "fd-player-duel", "aria-label": "Quick Draw challenge" }, /* @__PURE__ */ React42.createElement("details", { className: "fd-player-duel-rules" }, /* @__PURE__ */ React42.createElement("summary", null, /* @__PURE__ */ React42.createElement("h2", null, "Quick Draw"), /* @__PURE__ */ React42.createElement("span", null, "How to play +")), /* @__PURE__ */ React42.createElement("p", null, "Once accepted, each of you plays on your own phone. Tap when the screen flashes. Fastest tap wins both antes. Tapping early is a foul. An unanswered challenge lapses after ", DUEL_LAPSE_MS / 6e4, " minutes.")), current ? /* @__PURE__ */ React42.createElement(
    DuelCard,
    {
      bare: true,
      state,
      duel: current,
      me,
      now,
      onPlay,
      onAccept,
      onDecline,
      onWithdraw
    }
  ) : unavailable ? /* @__PURE__ */ React42.createElement("p", { className: "fd-player-unavailable", role: "status" }, unavailable) : /* @__PURE__ */ React42.createElement(React42.Fragment, null, /* @__PURE__ */ React42.createElement("fieldset", { className: "fd-player-antes", disabled: pending }, /* @__PURE__ */ React42.createElement("legend", null, "Ante, each"), ANTES.map((value) => /* @__PURE__ */ React42.createElement(
    "button",
    {
      type: "button",
      key: value,
      disabled: value > anteMax || pending,
      "aria-pressed": ante === value,
      "aria-label": `Ante ${fmt6(value)} chips each`,
      onClick: () => setAnte(value)
    },
    /* @__PURE__ */ React42.createElement(BankChip, { p: me, size: 44, val: value })
  ))), error && /* @__PURE__ */ React42.createElement("p", { className: "fd-player-error", role: "alert" }, error), /* @__PURE__ */ React42.createElement(
    ActionButton,
    {
      type: "button",
      "data-duel-send": "",
      onClick: challenge,
      disabled: pending || ante > anteMax,
      pending,
      style: { width: "100%" }
    },
    pending ? "Sending\u2026" : own ? `Challenge anyone for ${fmt6(ante)}` : rematch ? `Rematch for ${fmt6(ante)}` : `Challenge ${disp(state, p)} for ${fmt6(ante)}`
  ))), !!me && history.length > 0 && /* @__PURE__ */ React42.createElement("section", { className: "fd-player-duel-results", "aria-label": "Quick Draw results" }, /* @__PURE__ */ React42.createElement("h2", null, own ? "Your duels" : `You vs ${disp(state, p)}`), record && /* @__PURE__ */ React42.createElement("p", { className: "fd-player-duel-score" }, /* @__PURE__ */ React42.createElement("strong", null, record.won, "-", record.lost), /* @__PURE__ */ React42.createElement("span", null, signedChips2(record.net))), /* @__PURE__ */ React42.createElement("ul", null, history.map((line) => /* @__PURE__ */ React42.createElement("li", { key: line.id, className: `is-${line.outcome}` }, /* @__PURE__ */ React42.createElement("span", null, own ? `vs ${line.name}` : `${fmt6(line.stake)} each`, line.times && /* @__PURE__ */ React42.createElement("small", null, line.times)), /* @__PURE__ */ React42.createElement("strong", null, OUTCOME[line.outcome], line.delta !== 0 && ` ${signedChips2(line.delta)}`)))))));
}

// src/App.jsx
init_InstallHint();

// src/features/tv/TVMode.jsx
import React57, { useEffect as useEffect35, useMemo as useMemo11, useRef as useRef42, useState as useState46 } from "react";

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
    let offset2 = 0;
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
        dcdata[r][i] = 255 & buffer.getBuffer()[i + offset2];
      }
      offset2 += dcCount;
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
  _this.addData = function(data, mode2) {
    mode2 = mode2 || "Byte";
    let newData = null;
    switch (mode2) {
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
        throw "mode:" + mode2;
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
    let y, x, r12, r22, p;
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
      r12 = Math.floor((y - min) / cellSize);
      r22 = Math.floor((y + 1 - min) / cellSize);
      for (x = 0; x < size; x += 1) {
        p = "\u2588";
        if (min <= x && x < max && min <= y && y < max && _this.isDark(r12, Math.floor((x - min) / cellSize))) {
          p = " ";
        }
        if (min <= x && x < max && min <= y + 1 && y + 1 < max && _this.isDark(r22, Math.floor((x - min) / cellSize))) {
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
  _this.renderTo2dContext = function(context2, cellSize) {
    cellSize = cellSize || 2;
    const length = _this.getModuleCount();
    for (let row = 0; row < length; row++) {
      for (let col = 0; col < length; col++) {
        context2.fillStyle = _this.isDark(row, col) ? "black" : "white";
        context2.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
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
  _this.getLengthInBits = function(mode2, type) {
    if (1 <= type && type < 10) {
      switch (mode2) {
        case QRMode.MODE_NUMBER:
          return 10;
        case QRMode.MODE_ALPHA_NUM:
          return 9;
        case QRMode.MODE_8BIT_BYTE:
          return 8;
        case QRMode.MODE_KANJI:
          return 8;
        default:
          throw "mode:" + mode2;
      }
    } else if (type < 27) {
      switch (mode2) {
        case QRMode.MODE_NUMBER:
          return 12;
        case QRMode.MODE_ALPHA_NUM:
          return 11;
        case QRMode.MODE_8BIT_BYTE:
          return 16;
        case QRMode.MODE_KANJI:
          return 10;
        default:
          throw "mode:" + mode2;
      }
    } else if (type < 41) {
      switch (mode2) {
        case QRMode.MODE_NUMBER:
          return 14;
        case QRMode.MODE_ALPHA_NUM:
          return 13;
        case QRMode.MODE_8BIT_BYTE:
          return 16;
        case QRMode.MODE_KANJI:
          return 12;
        default:
          throw "mode:" + mode2;
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
    let offset2 = 0;
    while (offset2 < num.length && num[offset2] == 0) {
      offset2 += 1;
    }
    const _num2 = new Array(num.length - offset2 + shift);
    for (let i = 0; i < num.length - offset2; i += 1) {
      _num2[i] = num[i + offset2];
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
    let offset2 = 0;
    while (raster.length - offset2 > 255) {
      out.writeByte(255);
      out.writeBytes(raster, offset2, 255);
      offset2 += 255;
    }
    out.writeByte(raster.length - offset2);
    out.writeBytes(raster, offset2, raster.length - offset2);
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

// src/features/tv/TVMode.jsx
init_core();
init_PlayerIdentity();

// src/features/tv/TVCeremony.jsx
init_core();
init_PlayerIdentity();
import React43, { useEffect as useEffect28, useRef as useRef32, useState as useState38 } from "react";
init_serverClock();

// src/features/tv/TVDraft.jsx
init_core();
init_PlayerIdentity();
init_motion();
import React44, { useLayoutEffect as useLayoutEffect11, useRef as useRef33, useState as useState39 } from "react";

// src/features/tv/TVPoker.jsx
init_core();
init_PlayerIdentity();
import React45, { useRef as useRef34 } from "react";
init_motion();

// src/features/tv/TVCards.jsx
init_core();
init_PlayerIdentity();
init_PlayerIdentityContext();
import React49 from "react";

// src/features/tv/TVChampion.jsx
init_core();
init_PlayerIdentity();
init_PlayerIdentityContext();
import React47, { useEffect as useEffect29, useState as useState40 } from "react";

// src/features/tv/DesertBand.jsx
init_PlayerIdentityContext();
import React46, { memo, useId as useId3, useMemo as useMemo9, useRef as useRef35 } from "react";
function WinnerStar({ star, x, y, r, fresh }) {
  const identity = usePlayerIdentity(star.player);
  return /* @__PURE__ */ React46.createElement("g", { transform: `translate(${x} ${y})` }, /* @__PURE__ */ React46.createElement(
    "path",
    {
      className: `tv-desert-star is-winner${fresh ? " is-new" : ""}`,
      d: starPath(r),
      style: { fill: identity.color }
    }
  ));
}
function DesertBandView({
  phase = "fri",
  width = 1920,
  height = 118,
  variant = "strip",
  stars = [],
  lines = [],
  showStars = null,
  starBox = null,
  className = ""
}) {
  const grainId = `tv-grain-${useId3().replace(/:/g, "")}`;
  const scene = useMemo9(() => desertScene({ width, height, variant }), [width, height, variant]);
  const night = showStars ?? isNightSky(phase);
  const disc = scene.disc[phase] || scene.disc.fri;
  const box = skyBoxClearOfDisc(
    starBox || { left: 0, right: width, top: scene.sky.top, bottom: scene.sky.bottom },
    disc,
    scene.discR
  );
  const { at, starR, fixed, fixedR } = skyStarLayout(box);
  const seen = useRef35(null);
  if (seen.current === null) seen.current = new Set(stars.map((star) => star.id));
  const fresh = stars.filter((star) => !seen.current.has(star.id)).map((star) => star.id);
  fresh.forEach((id) => seen.current.add(id));
  const freshSet = new Set(fresh);
  return /* @__PURE__ */ React46.createElement(
    "svg",
    {
      className: `tv-desert is-${variant}${className ? ` ${className}` : ""}`,
      "data-phase": phase,
      width,
      height,
      viewBox: `0 0 ${width} ${height}`,
      "aria-hidden": "true"
    },
    /* @__PURE__ */ React46.createElement("defs", null, /* @__PURE__ */ React46.createElement("filter", { id: grainId }, /* @__PURE__ */ React46.createElement("feTurbulence", { type: "fractalNoise", baseFrequency: ".8", numOctaves: "2", seed: "4" }), /* @__PURE__ */ React46.createElement("feColorMatrix", { values: "0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .5 0" }))),
    /* @__PURE__ */ React46.createElement("rect", { className: "tv-desert-sky", width, height }),
    /* @__PURE__ */ React46.createElement("g", { className: `tv-desert-stars${night ? " is-on" : ""}` }, FIXED_STARS.map((point, i) => {
      const [cx, cy] = fixed(point);
      return /* @__PURE__ */ React46.createElement("circle", { key: i, className: "tv-desert-star", cx, cy, r: fixedR, style: { opacity: 0.35 + i % 3 * 0.2 } });
    })),
    /* @__PURE__ */ React46.createElement("g", { className: "tv-desert-disc", style: { transform: `translate(${disc.x}px, ${disc.y}px)` } }, /* @__PURE__ */ React46.createElement("circle", { r: scene.discR })),
    night && stars.length > 0 && /* @__PURE__ */ React46.createElement("g", { className: "tv-desert-constellation" }, lines.map((line) => line.points.slice(1).map((point, i) => {
      const [x1, y1] = at(line.points[i]), [x2, y2] = at(point);
      return /* @__PURE__ */ React46.createElement(
        "line",
        {
          key: `${line.player}-${i}`,
          className: "tv-desert-line",
          x1,
          y1,
          x2,
          y2,
          pathLength: "1",
          style: { animationDelay: `${i * 180}ms` }
        }
      );
    })), stars.map((star) => {
      const [x, y] = at(star);
      return /* @__PURE__ */ React46.createElement(WinnerStar, { key: star.id, star, x, y, r: starR, fresh: freshSet.has(star.id) });
    })),
    /* @__PURE__ */ React46.createElement("path", { className: "tv-desert-far", d: scene.far }),
    /* @__PURE__ */ React46.createElement("path", { className: "tv-desert-mid", d: scene.mid }),
    /* @__PURE__ */ React46.createElement("path", { className: "tv-desert-ground", d: scene.ground }),
    /* @__PURE__ */ React46.createElement("g", { className: "tv-desert-cactus" }, scene.cacti.map((c, i) => /* @__PURE__ */ React46.createElement("path", { key: i, d: c.d, transform: `translate(${c.x} ${c.y}) scale(${c.scale})` }))),
    scene.nearTop < height && /* @__PURE__ */ React46.createElement("rect", { className: "tv-desert-near", y: scene.nearTop, width, height: height - scene.nearTop }),
    /* @__PURE__ */ React46.createElement("rect", { width, height, filter: `url(#${grainId})`, opacity: ".05", style: { mixBlendMode: "screen" } })
  );
}
var DesertBand = memo(DesertBandView);

// src/features/tv/TVChampion.jsx
var AVATAR_X = 22 + 40 + 18 + 20;

// src/features/tv/TVBracket.jsx
init_core();
init_PlayerIdentity();
import React48, { useLayoutEffect as useLayoutEffect12, useRef as useRef36, useState as useState41 } from "react";
init_motion();

// src/features/tv/TVClassPhoto.jsx
init_PlayerIdentity();
init_motion();
import React50, { useMemo as useMemo10, useRef as useRef37 } from "react";

// src/features/tv/TVFaceOff.jsx
init_PlayerIdentity();
import React51 from "react";

// src/features/tv/faceOff.js
init_core();
init_seasonStats();
init_motion();
init_serverClock();
import { useEffect as useEffect30, useRef as useRef38, useState as useState42 } from "react";
var FACEOFF_TIMING = Object.freeze({
  slide: 0,
  slideMs: 560,
  // each side slides in from its own edge
  vs: 420,
  vsMs: 320,
  // VS stamps between them (the room's one beat)
  h2h: 760,
  h2hMs: 300,
  // their record, when they have met
  lines: 900,
  linesMs: 300,
  // X8: what a win does
  settle: MOTION.beat,
  settleMs: 400,
  // it lifts off the betting board
  total: MOTION.beat + 400
});

// src/features/tv/TowersBoard.jsx
init_towersModel();
import React52, { Component, useEffect as useEffect31, useState as useState43 } from "react";

// src/features/tv/TVMode.jsx
init_towersModel();

// src/features/tv/roomSound.js
init_core();
init_motion();
import { useEffect as useEffect32, useRef as useRef39 } from "react";
init_serverClock();

// src/features/awards/awardsModel.js
init_core();
var AWARD_TIMING = Object.freeze({
  title: 0,
  nominees: 500,
  nomineeStagger: 45,
  chips: 1500,
  chipMin: 200,
  chipMax: 420,
  chipSpread: 3e3,
  stampAfter: 900,
  settleAfter: 600
});

// src/features/tv/roomSound.js
var SETTLE_SOUND = Object.freeze({ lose: 700, pay: 1300 });

// src/features/tv/SoundUnlockChip.jsx
import React53 from "react";

// src/features/tv/NowPlaying.jsx
init_core();
init_PlayerIdentity();
init_serverClock();
import React54, { useEffect as useEffect33, useState as useState44 } from "react";

// shared/audio.js
var MAX_TRACK_DURATION_MS = 12 * 60 * 60 * 1e3;
var WALKOUT_MAX_MS = 4 * 60 * 1e3;
var WIN_SONG_CLIP_MS = 30 * 1e3;

// src/features/tv/nowPlaying.js
var MVP_CARD_MS = 12 * 1e3;

// src/features/awards/TVAwards.jsx
init_core();
init_PlayerIdentity();
init_PlayerIdentityContext();
import React55, { useRef as useRef40 } from "react";
init_serverClock();
var BALLOT_CHIP = Object.freeze({ color: "var(--sun)", isLight: true, skin: "ticks", stamp: "" });

// src/features/photos/TVPhotoCard.jsx
init_core();
init_PlayerIdentity();
import React56, { useEffect as useEffect34, useRef as useRef41, useState as useState45 } from "react";

// src/App.jsx
init_serverClock();
init_motion();
init_frameGate();

// src/features/results/ChipReceipt.jsx
init_PlayerIdentity();
import React58, { useEffect as useEffect36, useLayoutEffect as useLayoutEffect13, useRef as useRef43 } from "react";
init_motion();

// src/features/results/ChipShower.jsx
init_PlayerIdentity();
init_motion();
import React59, { useEffect as useEffect37, useMemo as useMemo12, useState as useState47 } from "react";

// src/features/results/useCrownMoment.js
init_motion();
import { useCallback as useCallback4, useEffect as useEffect38, useState as useState48 } from "react";

// src/App.jsx
init_install();
init_core();

// src/features/duels/QuickDraw.jsx
init_core();
init_PlayerIdentity();
init_controls();
init_theme();
import React60, { useCallback as useCallback5, useEffect as useEffect39, useLayoutEffect as useLayoutEffect14, useRef as useRef44, useState as useState49 } from "react";
var FOUL = Object.freeze({ ms: null, foul: true });

// src/features/duels/DuelDesk.jsx
init_core();
init_controls();
import React61, { useRef as useRef45, useState as useState50 } from "react";

// src/features/director/DirectorPill.jsx
init_core();
init_PlayerIdentity();
import React63, { useEffect as useEffect41, useRef as useRef47, useState as useState51 } from "react";

// src/features/director/RunOfShow.jsx
init_serverClock();
import React62, { useEffect as useEffect40, useRef as useRef46 } from "react";

// src/features/director/runOfShow.js
init_core();
var RUN_SLOTS = Object.freeze(["Now", "Next", "Then"]);

// src/features/director/CueRack.jsx
init_core();
init_theme();
import React64, { useEffect as useEffect42, useState as useState52, useSyncExternalStore as useSyncExternalStore3 } from "react";
init_serverClock();

// src/features/qa/QABar.jsx
init_controls();
import React65 from "react";

// src/features/qa/useQaFast.js
init_core();
import { useCallback as useCallback6, useEffect as useEffect43, useRef as useRef48, useState as useState53 } from "react";

// src/features/qa/QASheet.jsx
init_core();
import React66, { useEffect as useEffect44, useMemo as useMemo13, useRef as useRef49, useState as useState54 } from "react";

// shared/qa.js
init_core();
var QA_EVENT_PHASES = Object.freeze(["open", "mid", "done"]);
var QA_POKER_PHASES = Object.freeze(["set", "live", "counted"]);
var QA_EVENT_PHASE_LABELS = Object.freeze({ open: "Open", mid: "Mid", done: "Done" });
var QA_POKER_PHASE_LABELS = Object.freeze({ set: "Table set", live: "Cards live", counted: "Counts posted" });
var QA_PROGRESS_KEYS = Object.freeze(Object.keys(EMPTY_STATE).filter((key) => !RESET_PROGRESS_PRESERVED_KEYS.includes(key) && !["v", "updatedAt", "wagerOps"].includes(key)));

// src/features/qa/QASheet.jsx
init_controls();

// src/features/awards/AwardsHome.jsx
init_core();
init_PlayerIdentity();
import React67, { useEffect as useEffect45, useRef as useRef50, useState as useState55 } from "react";
init_serverClock();

// src/features/mvp/MvpHome.jsx
init_core();
init_PlayerIdentity();
import React68, { useEffect as useEffect46, useRef as useRef51, useState as useState56 } from "react";
init_serverClock();

// src/features/mvp/mvpHome.js
var MVP_RESULT_MS = 10 * 60 * 1e3;

// src/features/music/WinSongPicker.jsx
import React70, { useEffect as useEffect48, useRef as useRef53, useState as useState58 } from "react";

// src/features/music/previewPlayer.js
import { useSyncExternalStore as useSyncExternalStore4 } from "react";
var KNOWN_MS = 8 * 60 * 1e3;

// src/features/music/SnippetPreview.jsx
import React69, { useEffect as useEffect47, useRef as useRef52, useState as useState57 } from "react";

// src/features/awards/AwardsDesk.jsx
init_core();
import React71, { useEffect as useEffect49, useMemo as useMemo14, useRef as useRef54, useState as useState59 } from "react";
init_serverClock();
init_PlayerIdentity();
init_controls();

// src/features/director/FinaleSheets.jsx
init_core();
init_controls();
init_PlayerIdentity();
import React72, { useRef as useRef55, useState as useState60 } from "react";

// src/ui/Shell.jsx
import React73 from "react";
function Shell({ children, tv, arrival, environment = "production" }) {
  return /* @__PURE__ */ React73.createElement("div", { className: `fd-shell${tv ? " fd-night" : ""}` }, /* @__PURE__ */ React73.createElement("div", { className: `fd-shell-inner${tv ? " is-tv" : arrival ? " is-arrival" : ""}` }, environment !== "production" && /* @__PURE__ */ React73.createElement("div", { className: "fd-environment", "aria-label": `${environment} environment` }, environment, " \xB7 Field Day"), children));
}

// src/ui/usePhaseTheme.js
import { useLayoutEffect as useLayoutEffect15, useMemo as useMemo15, useRef as useRef56 } from "react";
init_motion2();
var STAGING = (() => {
  try {
    return import.meta.env?.MODE === "staging";
  } catch {
    return false;
  }
})();

// src/App.jsx
init_theme();
init_controls();
var Onboarding2 = lazy(() => Promise.resolve().then(() => (init_Onboarding(), Onboarding_exports)).then((module) => ({ default: module.Onboarding })));
var prefersReducedMotion2 = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
var fmt8 = (n) => (n ?? 0).toLocaleString("en-US");
var SINCE_HOLD_MS = 5 * 60 * 1e3;
var DUEL_LAPSE_NOTICE_MS = 15 * 60 * 1e3;
var centeredGridCell = (i, count, columns = 3, gap = 6) => {
  if (i !== count - 1 || count % columns !== 1) return {};
  if (columns % 2) return { gridColumn: String(Math.ceil(columns / 2)) };
  return { gridColumn: "1 / -1", width: `calc(${100 / columns}% - ${gap / 2}px)`, justifySelf: "center" };
};
function PlayerChip({ name, selected, disabled, onClick, small, style }) {
  return /* @__PURE__ */ React75.createElement("button", { onClick, disabled, "aria-pressed": selected, style: {
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
  return /* @__PURE__ */ React75.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: size === "lg" ? 18 : 10, alignItems: "stretch" } }, [teams[0], null, teams[1]].map((t, i) => i === 1 ? /* @__PURE__ */ React75.createElement("div", { key: "vs", style: {
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
  } }, "VS") : /* @__PURE__ */ React75.createElement("div", { key: i, style: {
    background: "var(--paper)",
    border: "1.5px solid var(--ink)",
    borderRadius: 10,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column"
  } }, /* @__PURE__ */ React75.createElement("div", { style: {
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
  } }, teamLabel(state, t)), /* @__PURE__ */ React75.createElement("div", { style: { padding: size === "lg" ? "10px 14px" : "8px 11px" } }, t.players.map(
    (p) => React75.createElement(onPlayer ? "button" : "div", {
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
    }, /* @__PURE__ */ React75.createElement(React75.Fragment, null, /* @__PURE__ */ React75.createElement(Avatar, { state, p, size: av }), /* @__PURE__ */ React75.createElement("span", { style: { fontFamily: SANS, fontWeight: 600, fontSize: f, color: "var(--ink)" } }, disp(state, p))))
  )))));
}
function EventIntro({ state, ev, handoff, onClose, onBets }) {
  return /* @__PURE__ */ React75.createElement(
    EventAnnouncement,
    {
      state,
      ev,
      handoff,
      onClose,
      onBets,
      holdMs: prefersReducedMotion2() ? DRAW_INTRO_REDUCED_MS : DRAW_INTRO_MS,
      visual: /* @__PURE__ */ React75.createElement(GameMoment, { gameId: ev.game })
    }
  );
}
function ChipCounter({ start, onDone }) {
  const denominations = [1e3, 500, 100, 25];
  const countId = useId4(), saving = useRef58(false);
  const [counts, setCounts] = useState62(() => {
    let left = start || 0;
    return Object.fromEntries(denominations.map((value) => {
      const n = Math.floor(left / value);
      left -= n * value;
      return [value, n];
    }));
  });
  const [pending, setPending] = useState62(false), [error, setError] = useState62("");
  const total = denominations.reduce((sum, value) => sum + Number(counts[value] || 0) * value, 0);
  const set = (value, count) => {
    if (!saving.current) setCounts((current) => ({ ...current, [value]: count }));
  };
  return /* @__PURE__ */ React75.createElement("div", { className: "fd-chip-counter" }, denominations.map((value) => /* @__PURE__ */ React75.createElement("div", { className: "fd-chip-count-row", key: value }, /* @__PURE__ */ React75.createElement("label", { htmlFor: countId + value }, fmt8(value), " chips"), /* @__PURE__ */ React75.createElement(
    "button",
    {
      type: "button",
      disabled: pending || !Number(counts[value]),
      "aria-label": "Remove one " + value + " chip",
      onClick: () => set(value, Math.max(0, Number(counts[value] || 0) - 1))
    },
    "\u2212"
  ), /* @__PURE__ */ React75.createElement(
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
  ), /* @__PURE__ */ React75.createElement("button", { type: "button", disabled: pending, "aria-label": "Add one " + value + " chip", onClick: () => set(value, Number(counts[value] || 0) + 1) }, "+"))), /* @__PURE__ */ React75.createElement("div", { className: "fd-chip-count-total" }, /* @__PURE__ */ React75.createElement("span", null, "Total"), /* @__PURE__ */ React75.createElement("strong", null, fmt8(total))), error && /* @__PURE__ */ React75.createElement("p", { role: "alert" }, error), /* @__PURE__ */ React75.createElement(ActionButton, { disabled: pending, onClick: async () => {
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
  }, style: { width: "100%" } }, pending ? "Saving\u2026" : "Save count"));
}
function PokerResultSheet({ state, onClose, onCount, onBust, onUnbust, onPost }) {
  const pk = state.poker;
  const [fixing, setFixing] = useState62(null);
  const [pending, setPending] = useState62(false), [error, setError] = useState62("");
  const saving = useRef58(false);
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
  const seats = pk.seats || ROSTER;
  const alive = seats.filter((p) => !outSet.has(p));
  const counted = alive.filter((p) => pk.counts?.[p] !== void 0);
  const sum = counted.reduce((s, p) => s + pk.counts[p], 0);
  const allIn = counted.length === alive.length;
  return /* @__PURE__ */ React75.createElement(Sheet, { title: "The table", onClose, busy: pending }, seats.map((p) => {
    const out = outSet.has(p);
    const c = pk.counts?.[p];
    return /* @__PURE__ */ React75.createElement("div", { key: p }, /* @__PURE__ */ React75.createElement("div", { className: "fd-poker-count-row" + (out ? " is-out" : "") }, /* @__PURE__ */ React75.createElement(
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
      /* @__PURE__ */ React75.createElement(Avatar, { state, p, size: 28 }),
      /* @__PURE__ */ React75.createElement("span", null, disp(state, p)),
      out ? /* @__PURE__ */ React75.createElement(Tag, null, "Out") : c !== void 0 ? /* @__PURE__ */ React75.createElement("strong", null, fmt8(c)) : /* @__PURE__ */ React75.createElement("small", null, "counting")
    ), /* @__PURE__ */ React75.createElement(
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
    )), fixing === p && !out && /* @__PURE__ */ React75.createElement("div", { className: "fd-night", style: {
      padding: "10px 0",
      borderBottom: "1px solid var(--line)",
      background: "var(--night)",
      margin: "0 -16px",
      paddingLeft: 16,
      paddingRight: 16
    } }, /* @__PURE__ */ React75.createElement(ChipCounter, { start: c, onDone: (total) => act(async () => {
      const result = await onCount(p, total);
      if (result?.ok) setFixing(null);
      return result;
    }) })));
  }), /* @__PURE__ */ React75.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, padding: "12px 0 4px" } }, /* @__PURE__ */ React75.createElement("span", { style: { ...label, flex: 1 } }, "Counted"), /* @__PURE__ */ React75.createElement("span", { style: {
    fontFamily: DISPLAY,
    fontWeight: 700,
    fontSize: 22,
    color: allIn && sum === pk.total ? "var(--green)" : "var(--ink)"
  } }, fmt8(sum)), /* @__PURE__ */ React75.createElement("span", { style: { fontFamily: SANS, fontSize: 12.5, color: "var(--muted)" } }, "of ", fmt8(pk.total))), allIn && sum !== pk.total && /* @__PURE__ */ React75.createElement("div", { style: { fontFamily: SANS, fontSize: 12.5, color: "var(--clay-text)", marginBottom: 10 } }, sum > pk.total ? `${fmt8(sum - pk.total)} over` : `${fmt8(pk.total - sum)} short`, "."), error && /* @__PURE__ */ React75.createElement("p", { role: "alert", style: { color: "var(--clay-text)", fontSize: 13 } }, error), /* @__PURE__ */ React75.createElement(Btn, { disabled: !allIn || pending, onClick: () => act(onPost), style: { width: "100%", marginTop: 8 } }, allIn ? "Post the counts" : `Waiting on ${alive.length - counted.length}`));
}
function PlayerLinks({ state, players, onPlayer, size = 26 }) {
  return /* @__PURE__ */ React75.createElement("div", { className: "fd-player-links" }, players.map((p) => /* @__PURE__ */ React75.createElement(
    "button",
    {
      type: "button",
      key: p,
      className: "fd-player-link",
      onClick: () => onPlayer(p),
      "aria-label": `View ${disp(state, p)}'s player card`
    },
    /* @__PURE__ */ React75.createElement(Avatar, { state, p, size }),
    /* @__PURE__ */ React75.createElement("span", null, disp(state, p))
  )));
}
function EventCrewCard({ state, roles, compact = false, onPlayer }) {
  const assignments = (roles || []).filter((item) => item?.player);
  if (!assignments.length) return null;
  if (compact) {
    if (onPlayer) return /* @__PURE__ */ React75.createElement("div", { className: "fd-event-crew-compact" }, /* @__PURE__ */ React75.createElement("span", { style: label }, "Event crew"), assignments.map((item) => /* @__PURE__ */ React75.createElement("button", { type: "button", key: item.player, onClick: () => onPlayer(item.player), "aria-label": `View ${disp(state, item.player)}'s player card` }, /* @__PURE__ */ React75.createElement(Avatar, { state, p: item.player, size: 24 }), /* @__PURE__ */ React75.createElement("span", null, disp(state, item.player)), /* @__PURE__ */ React75.createElement("small", null, overflowRoleMeta(item.role).short))));
    return /* @__PURE__ */ React75.createElement("div", { style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      minWidth: 0,
      marginTop: 9,
      paddingTop: 8,
      borderTop: "1px solid var(--line)"
    } }, /* @__PURE__ */ React75.createElement("span", { style: { ...label, color: "var(--accent2)", flexShrink: 0 } }, "Event crew"), /* @__PURE__ */ React75.createElement(AvatarStack, { state, players: assignments.map((item) => item.player), size: 20, max: 3 }), /* @__PURE__ */ React75.createElement("span", { style: {
      fontFamily: SANS,
      fontWeight: 600,
      fontSize: 11.5,
      color: "var(--ink)",
      minWidth: 0,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      flex: 1
    } }, assignments.map((item) => disp(state, item.player)).join(", ")), /* @__PURE__ */ React75.createElement("span", { style: {
      fontFamily: SANS,
      fontWeight: 700,
      fontSize: 10.5,
      color: "var(--muted2)",
      flexShrink: 0
    } }, assignments.map((item) => overflowRoleMeta(item.role).short).join(" + ")));
  }
  return /* @__PURE__ */ React75.createElement("div", { style: {
    margin: "10px 0 4px",
    padding: "11px 12px",
    borderRadius: 14,
    background: "var(--paper2)",
    border: "1px solid rgba(194,88,50,0.38)"
  } }, /* @__PURE__ */ React75.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 } }, /* @__PURE__ */ React75.createElement("span", { style: { ...label, color: "var(--accent2)", flex: 1 } }, "Event crew")), assignments.map((item, index) => {
    const meta = overflowRoleMeta(item.role);
    if (onPlayer) return /* @__PURE__ */ React75.createElement(
      "button",
      {
        type: "button",
        key: `${item.player}-${index}`,
        className: "fd-crew-link",
        onClick: () => onPlayer(item.player),
        "aria-label": `View ${disp(state, item.player)}'s player card`
      },
      /* @__PURE__ */ React75.createElement(Avatar, { state, p: item.player, size: 30 }),
      /* @__PURE__ */ React75.createElement("span", null, /* @__PURE__ */ React75.createElement("strong", null, disp(state, item.player))),
      /* @__PURE__ */ React75.createElement("small", null, meta.label)
    );
    return /* @__PURE__ */ React75.createElement("div", { key: `${item.player}-${index}`, style: {
      display: "flex",
      alignItems: "center",
      gap: 9,
      padding: index ? "8px 0 0" : "0",
      marginTop: index ? 8 : 0,
      borderTop: index ? "1px solid var(--line)" : "none"
    } }, /* @__PURE__ */ React75.createElement(Avatar, { state, p: item.player, size: 30 }), /* @__PURE__ */ React75.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React75.createElement("div", { style: {
      fontFamily: SANS,
      fontWeight: 700,
      fontSize: 13,
      color: "var(--ink)",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    } }, disp(state, item.player))), /* @__PURE__ */ React75.createElement("span", { style: {
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
  const GroupCard = ({ title, entrants, through, gIdx, isFinal, wide }) => /* @__PURE__ */ React75.createElement("div", { style: {
    background: "var(--paper2)",
    border: "1px solid " + (isFinal ? "rgba(156,69,38,0.5)" : "var(--line)"),
    borderRadius: 14,
    overflow: "hidden",
    boxShadow: "var(--shadow-1)",
    ...wide ? { gridColumn: "1 / -1" } : {}
  } }, /* @__PURE__ */ React75.createElement("div", { style: {
    ...label,
    fontSize: size === "lg" ? 13 : 10.5,
    padding: size === "lg" ? "9px 14px 5px" : "7px 10px 3px",
    color: isFinal ? "var(--accent2)" : "var(--muted)"
  } }, title), entrants.map((key) => {
    const v = stageEntrantView(state, st, key);
    const isThrough = isFinal ? st.finalWinner === key : (through || []).includes(key);
    const decided3 = isFinal ? st.finalWinner !== null && st.finalWinner !== void 0 : (through || []).length >= st.advance;
    const dimmed = decided3 && !isThrough;
    const clickable = gm && (isFinal ? onFinal : onThrough);
    if (!gm && onPlayer) return /* @__PURE__ */ React75.createElement("div", { key: String(key), style: {
      padding: dims.pad,
      borderTop: "1px solid var(--line)",
      background: isThrough ? "var(--accent-tint)" : "transparent"
    } }, /* @__PURE__ */ React75.createElement(PlayerLinks, { state, players: v.players, onPlayer, size: dims.av }), isThrough && /* @__PURE__ */ React75.createElement("small", { style: { color: "var(--accent2)" } }, isFinal ? "Winner" : "Advanced"));
    return /* @__PURE__ */ React75.createElement(
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
      /* @__PURE__ */ React75.createElement(AvatarStack, { state, players: v.players, size: dims.av, max: 3 }),
      /* @__PURE__ */ React75.createElement("span", { style: {
        fontFamily: SANS,
        fontWeight: 700,
        fontSize: dims.f,
        flex: 1,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        color: isThrough ? "var(--accent2)" : "var(--ink)"
      } }, v.name),
      isThrough && /* @__PURE__ */ React75.createElement("span", { style: { fontFamily: SANS, fontWeight: 700, fontSize: dims.tf, color: "var(--accent2)" } }, isFinal ? "\u{1F3C6}" : "\u2713")
    );
  }));
  return /* @__PURE__ */ React75.createElement("div", { style: { display: "grid", gridTemplateColumns: dims.col, gap: dims.gap, alignItems: "start" } }, st.groups.map((g, i) => /* @__PURE__ */ React75.createElement(
    GroupCard,
    {
      key: i,
      title: `${g.name}${st.advance > 1 ? `, top ${st.advance} through` : ""}`,
      entrants: g.entrants,
      through: g.through,
      gIdx: i
    }
  )), finalists && /* @__PURE__ */ React75.createElement(
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
  onReplay,
  onPlayNext,
  announceNext,
  onAnnounceDraw,
  onSwap,
  onTakeBack
}) {
  const res = state.results[ev.id];
  const [confirmTakeBack, setConfirmTakeBack] = useState62(false);
  const draw = state.draws[ev.id];
  const draftLive = state.drafts?.[ev.id];
  const br = state.brackets[ev.id];
  const st = state.stages[ev.id];
  const table = AWARDS[ev.value] ? awardTable(ev) : void 0;
  const shelvedNow = !!state.shelved[ev.id];
  const [confirmRedraw, setConfirmRedraw] = useState62(false);
  const [confirmRemove, setConfirmRemove] = useState62(false);
  const [confirmClear, setConfirmClear] = useState62(false);
  const [clearReason, setClearReason] = useState62("");
  const [confirmScrap, setConfirmScrap] = useState62(false);
  const [confirmShelve, setConfirmShelve] = useState62(false);
  const openBets = (state.wagers || []).filter((w) => w.eventId === ev.id && resolveWager(state, w, allEventsOf(state)).status === "pending");
  const [editOpen, setEditOpen] = useState62(false);
  const [howTo, setHowTo] = useState62(false);
  const [more, setMore] = useState62(false);
  const [eName, setEName] = useState62("");
  const [eDesc, setEDesc] = useState62("");
  const [eValue, setEValue] = useState62(400);
  const [eSession, setESession] = useState62(null);
  const openEdit = () => {
    setEName(ev.name);
    setEDesc(ev.desc || "");
    setEValue(ev.value ?? 400);
    setESession(SESSIONS.find((s) => s.id === ev.session) ? ev.session : null);
    setEditOpen(true);
  };
  const [suggested] = useState62(() => ev.teamCfg && !state.draws?.[ev.id] ? suggestParticipants(state, ev) : null);
  const [outs, setOuts] = useState62(() => (suggested?.roles || []).map((item) => item.player));
  const [outRoles, setOutRoles] = useState62(() => Object.fromEntries((suggested?.roles || []).map((item) => [item.player, item.role])));
  const [swapOut, setSwapOut] = useState62(""), [swapIn, setSwapIn] = useState62("");
  const [showOuts, setShowOuts] = useState62(false);
  const [stageCfgOpen, setStageCfgOpen] = useState62(!!ev.stageCfg);
  const [nGroups, setNGroups] = useState62(null);
  const [advance, setAdvance] = useState62(ev.stageCfg?.advance || 1);
  const [setupPending, setSetupPending] = useState62(false);
  const [contestPending, setContestPending] = useState62(false);
  const waitForContest = async (callback) => {
    setContestPending(true);
    try {
      return await callback();
    } finally {
      setContestPending(false);
    }
  };
  const [setupError, setSetupError] = useState62("");
  const setupBusy = useRef58(false);
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
  const present = presentPlayers(state);
  const inPlayers = present.filter((p) => !outs.includes(p));
  const participantFit = validateEventParticipants(ev, inPlayers, present);
  const overflowAssignments = outs.filter((player) => present.includes(player)).map((player) => ({
    player,
    role: OVERFLOW_ROLES.includes(outRoles[player]) ? outRoles[player] : "sit-out"
  }));
  const isPoker = !!ev.finale;
  const canHeats = ev.kind === "solo" && !ev.teamCfg && !res && !isPoker;
  const canPools = ev.teamCfg && draw && !br && draw.teams.length >= 4 && !res;
  const stageKind = canHeats ? "heats" : "pools";
  const stageEntrantCount = canHeats ? inPlayers.length : draw?.teams?.length || 0;
  const suggestedGroups = Math.min(4, Math.max(2, Math.round(stageEntrantCount / (canHeats ? 4 : 3))));
  const groupsChoice = nGroups ?? ev.stageCfg?.nGroups ?? suggestedGroups;
  const heatsFit = inPlayers.length >= groupsChoice * 2;
  return /* @__PURE__ */ React75.createElement(
    Sheet,
    {
      title: ev.name,
      onClose,
      onBack,
      wide: !!br,
      busy: setupPending || contestPending,
      subtitle: [SESSIONS.find((s) => s.id === ev.session)?.label, ev.kind === "solo" ? "Individual" : ev.kind === "pairs" ? "Pairs" : "Teams"].filter(Boolean).join(" \xB7 "),
      headerActions: /* @__PURE__ */ React75.createElement(React75.Fragment, null, (draw || st) && onReplay && /* @__PURE__ */ React75.createElement("button", { type: "button", disabled: setupPending || contestPending, onClick: onReplay }, "Replay draw"), hasGameRules(ev) && /* @__PURE__ */ React75.createElement("button", { type: "button", disabled: setupPending || contestPending, onClick: () => setHowTo(true) }, "Rules"))
    },
    /* @__PURE__ */ React75.createElement(
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
        onResult: () => waitForContest(enterResult),
        onPlayNext: onPlayNext ? (payload) => waitForContest(() => onPlayNext(payload)) : void 0
      }
    ),
    br && !contestActive && /* @__PURE__ */ React75.createElement(CompetitionBracket, { state, ev, me, onPlayer }),
    /* @__PURE__ */ React75.createElement("details", { className: "fd-event-info", open: !draw && !st && !contestActive || void 0 }, /* @__PURE__ */ React75.createElement("summary", null, /* @__PURE__ */ React75.createElement("span", null, "Event info"), table?.[0] > 0 && /* @__PURE__ */ React75.createElement("small", null, fmt8(table[0]), " chips to win")), ev.desc && /* @__PURE__ */ React75.createElement("p", null, ev.desc), table && /* @__PURE__ */ React75.createElement("div", { className: "fd-event-awards" }, awardPlan(ev, draw).map((row) => /* @__PURE__ */ React75.createElement("span", { key: row.place }, /* @__PURE__ */ React75.createElement("small", null, row.place === "crew" ? "Crew" : SLOT_META[row.place].label), /* @__PURE__ */ React75.createElement("strong", null, "+", fmt8(row.pts)))))),
    !contestActive && onBets && /* @__PURE__ */ React75.createElement(ActionButton, { variant: "secondary", onClick: onBets, style: { width: "100%", marginBottom: 12 } }, "View bets"),
    howTo && /* @__PURE__ */ React75.createElement(HowToSheet, { gameId: ev.game, variant: ev.variant, onClose: () => setHowTo(false) }),
    draftLive && !draw && /* @__PURE__ */ React75.createElement(DraftEntry, { state, ev, me, onOpen: () => openDraft() }),
    draw && !br && !st && /* @__PURE__ */ React75.createElement("div", { style: { marginBottom: 14 } }, /* @__PURE__ */ React75.createElement("div", { style: { ...label, marginBottom: 8 } }, "The draw"), draw.teams.length === 2 ? /* @__PURE__ */ React75.createElement(VersusDraw, { state, teams: draw.teams, onPlayer }) : /* @__PURE__ */ React75.createElement("div", { style: { display: "grid", gridTemplateColumns: draw.teams.length > 3 ? "1fr 1fr" : "1fr", gap: 8 } }, draw.teams.map((t, i) => /* @__PURE__ */ React75.createElement("div", { key: i, style: {
      background: "var(--paper2)",
      border: "1px solid var(--line)",
      borderRadius: 14,
      padding: "10px 12px",
      ...draw.teams.length > 3 && draw.teams.length % 2 === 1 && i === draw.teams.length - 1 ? { gridColumn: "1 / -1" } : {}
    } }, /* @__PURE__ */ React75.createElement("div", { style: { fontFamily: SANS, fontWeight: 700, fontSize: 12.5, color: "var(--accent2)", marginBottom: 5 } }, teamLabel(state, t)), /* @__PURE__ */ React75.createElement("div", { style: { display: "flex", gap: 5, flexWrap: "wrap" } }, t.players.map((p) => /* @__PURE__ */ React75.createElement("button", { type: "button", key: p, className: "fd-player-link", "aria-label": `View ${disp(state, p)}'s player card`, onClick: () => onPlayer?.(p) }, /* @__PURE__ */ React75.createElement(Avatar, { state, p, size: 30 }))))))), /* @__PURE__ */ React75.createElement(EventCrewCard, { state, roles: draw.roles, onPlayer })),
    st && /* @__PURE__ */ React75.createElement("details", { className: "fd-event-info", open: !contestActive || void 0 }, /* @__PURE__ */ React75.createElement("summary", null, /* @__PURE__ */ React75.createElement("span", null, "All ", st.kind === "heats" ? "heats" : "pools"), /* @__PURE__ */ React75.createElement("small", null, st.advance, " through from each")), /* @__PURE__ */ React75.createElement(StageGrid, { state, ev, gm: false, onPlayer })),
    (br || st) && /* @__PURE__ */ React75.createElement(EventCrewCard, { state, roles: draw?.roles || st?.roles, compact: true, onPlayer }),
    res && res.slots && (() => {
      const awards = resultAwards(state, ev, res);
      const crew = awards.filter((award) => award.place === "crew");
      return /* @__PURE__ */ React75.createElement("div", { style: { marginBottom: 14 } }, res.slots.map((players, i) => players?.length > 0 && /* @__PURE__ */ React75.createElement("div", { key: i, style: { fontFamily: SANS, fontSize: 14, color: "var(--ink)", marginBottom: 4 } }, /* @__PURE__ */ React75.createElement("span", { style: { color: SLOT_META[i].color, fontWeight: 700 } }, SLOT_META[i].label, ":"), " ", players.map((p) => /* @__PURE__ */ React75.createElement("button", { type: "button", key: p, className: "fd-player-link", onClick: () => onPlayer?.(p) }, disp(state, p))), " ", /* @__PURE__ */ React75.createElement("span", { style: { color: "var(--muted)" } }, res.stacks ? `${fmt8(res.stacks[players[0]] ?? 0)} chips` : `+${fmt8(awards.find((award) => award.place === i)?.pts ?? 0)} each`))), crew.length > 0 && /* @__PURE__ */ React75.createElement("div", { style: { fontFamily: SANS, fontSize: 14, color: "var(--ink)", marginBottom: 4 } }, /* @__PURE__ */ React75.createElement("span", { style: { fontWeight: 700 } }, "Crew:"), " ", crew.map(({ player }) => /* @__PURE__ */ React75.createElement("button", { type: "button", key: player, className: "fd-player-link", onClick: () => onPlayer?.(player) }, disp(state, player))), " ", /* @__PURE__ */ React75.createElement("span", { style: { color: "var(--muted)" } }, "+", fmt8(crew[0].pts), " each")), (() => {
        const correction = (state.eventOps?.[ev.id]?.corrections || []).at(-1);
        const reason = res.correctionReason || correction?.reason;
        const voided = Array.isArray(correction?.voided) ? correction.voided.length : 0;
        return reason && (res.correctedAt || correction) ? /* @__PURE__ */ React75.createElement("p", { className: "fd-event-correction" }, "Corrected \xB7 ", reason, voided ? ` \xB7 ${voided} ${voided === 1 ? "bet" : "bets"} voided` : "") : null;
      })());
    })(),
    gm && !state.frozen && /* @__PURE__ */ React75.createElement("div", { style: { borderTop: "1px solid var(--line)", paddingTop: 14 } }, ev.teamCfg && !draw && !draftLive && !res && (() => {
      const shape = teamFit(ev, present.length) || ev.teamCfg;
      const fit2 = shape.teams * shape.size;
      const diff = inPlayers.length - fit2;
      return /* @__PURE__ */ React75.createElement(React75.Fragment, null, /* @__PURE__ */ React75.createElement("div", { style: { display: "flex", alignItems: "center", marginBottom: 4 } }, /* @__PURE__ */ React75.createElement("div", { style: { ...label, flex: 1 } }, shape.size === 1 ? "Draw the bracket" : "Draw teams"), /* @__PURE__ */ React75.createElement("button", { onClick: () => setShowOuts((v) => !v), style: {
        cursor: "pointer",
        fontFamily: SANS,
        fontWeight: 700,
        fontSize: 12.5,
        padding: "7px 12px",
        borderRadius: 10,
        background: diff !== 0 ? "var(--clay-tint)" : "var(--paper)",
        border: diff !== 0 ? "1.5px solid var(--clay)" : "1px solid var(--line)",
        color: diff !== 0 ? "var(--clay-text)" : "var(--ink)"
      } }, inPlayers.length, " competitors ", showOuts ? "\u25B4" : "\u25BE")), /* @__PURE__ */ React75.createElement("div", { style: {
        fontFamily: SANS,
        fontSize: 12.5,
        marginBottom: 8,
        color: diff !== 0 ? "var(--clay-text)" : "var(--muted)"
      } }, "Format: ", shapeLabel(shape), shape.size === 1 ? "" : `, fits ${fit2}`, ".", diff > 0 ? ` Assign ${diff} to event crew.` : diff < 0 ? ` ${-diff} short.` : " Exact fit."), showOuts && /* @__PURE__ */ React75.createElement(React75.Fragment, null, /* @__PURE__ */ React75.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 5, marginBottom: 10 } }, present.map((p, i) => /* @__PURE__ */ React75.createElement(
        PlayerChip,
        {
          key: p,
          name: p,
          small: true,
          selected: !outs.includes(p),
          onClick: () => setOuts((o) => o.includes(p) ? o.filter((x) => x !== p) : [...o, p]),
          style: centeredGridCell(i, present.length, 3, 5)
        }
      ))), overflowAssignments.length > 0 && /* @__PURE__ */ React75.createElement("div", { style: {
        background: "var(--paper2)",
        border: "1px solid rgba(194,88,50,0.38)",
        borderRadius: 14,
        padding: "11px 12px",
        marginBottom: 10
      } }, /* @__PURE__ */ React75.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 3 } }, /* @__PURE__ */ React75.createElement("span", { style: { ...label, color: "var(--accent2)", flex: 1 } }, "Event crew")), /* @__PURE__ */ React75.createElement("div", { style: {
        fontFamily: SANS,
        fontSize: 11.5,
        lineHeight: 1.4,
        color: "var(--muted2)",
        marginBottom: 9
      } }, table?.[2] > 0 ? `Crew do not compete and earn the 3rd-place award, +${fmt8(table[2])}.` : "Crew do not compete or score."), overflowAssignments.map(({ player }, index) => {
        const role = outRoles[player] || "sit-out";
        return /* @__PURE__ */ React75.createElement("div", { key: player, style: {
          display: "flex",
          alignItems: "center",
          gap: 9,
          padding: index ? "9px 0 0" : "0",
          marginTop: index ? 9 : 0,
          borderTop: index ? "1px solid var(--line)" : "none"
        } }, /* @__PURE__ */ React75.createElement(Avatar, { state, p: player, size: 32 }), /* @__PURE__ */ React75.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React75.createElement("div", { style: {
          fontFamily: SANS,
          fontWeight: 700,
          fontSize: 12.5,
          color: "var(--ink)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap"
        } }, disp(state, player))), /* @__PURE__ */ React75.createElement(
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
          OVERFLOW_ROLES.map((value) => /* @__PURE__ */ React75.createElement("option", { key: value, value }, overflowRoleMeta(value).label))
        ));
      }))), (!participantFit.ok || !announceNext) && /* @__PURE__ */ React75.createElement("div", { style: { fontFamily: SANS, fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5, marginBottom: 10 } }, participantFit.ok ? "Teams stay hidden until this event is announced." : participantFit.error), /* @__PURE__ */ React75.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 10 } }, /* @__PURE__ */ React75.createElement(
        Btn,
        {
          disabled: !participantFit.ok || setupPending,
          onClick: () => saveSetup(() => announceNext && onAnnounceDraw ? onAnnounceDraw(inPlayers, overflowAssignments) : onDraw(inPlayers, overflowAssignments)),
          style: { flex: 1, whiteSpace: "nowrap", padding: "12px 8px" }
        },
        setupPending ? "Drawing\u2026" : announceNext ? "Announce and draw" : "Run the draw"
      ), ev.kind === "team" && /* @__PURE__ */ React75.createElement(
        Btn,
        {
          kind: "dark",
          disabled: !participantFit.ok,
          onClick: () => openDraft(inPlayers, overflowAssignments),
          style: { flex: 1, whiteSpace: "nowrap", padding: "12px 8px" }
        },
        "Captains draft"
      )));
    })(), ev.teamCfg && draw && !res && setupAllowed && (confirmRedraw ? /* @__PURE__ */ React75.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 10 } }, /* @__PURE__ */ React75.createElement(Btn, { kind: "danger", onClick: () => {
      onClearDraw();
      setConfirmRedraw(false);
    }, style: { flex: 1 } }, "Scrap the draw"), /* @__PURE__ */ React75.createElement(Btn, { kind: "ghost", onClick: () => setConfirmRedraw(false), style: { flex: 1 } }, "Keep it")) : /* @__PURE__ */ React75.createElement(Btn, { kind: "ghost", onClick: () => setConfirmRedraw(true), style: { width: "100%", marginBottom: 10 } }, "Redraw")), (draw || st?.entrantType === "solo") && !res && onSwap && (() => {
      const drawn = draw ? draw.teams.flatMap((team) => team.players) : st.groups.flatMap((group) => group.entrants);
      const bench = present.filter((player) => !drawn.includes(player));
      if (!bench.length) return null;
      const selectStyle = {
        flex: 1,
        minWidth: 120,
        minHeight: 44,
        padding: "8px",
        borderRadius: 9,
        background: "var(--paper)",
        color: "var(--ink)",
        border: "1px solid var(--line)",
        fontFamily: SANS,
        fontWeight: 700,
        fontSize: 12.5
      };
      return /* @__PURE__ */ React75.createElement("details", { className: "fd-event-info" }, /* @__PURE__ */ React75.createElement("summary", null, /* @__PURE__ */ React75.createElement("span", null, "Swap in a player")), /* @__PURE__ */ React75.createElement("div", { style: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 } }, /* @__PURE__ */ React75.createElement(
        "select",
        {
          "aria-label": "Player leaving",
          value: swapOut,
          disabled: setupPending,
          onChange: (event) => setSwapOut(event.target.value),
          style: selectStyle
        },
        /* @__PURE__ */ React75.createElement("option", { value: "" }, "Leaving"),
        drawn.map((player) => /* @__PURE__ */ React75.createElement("option", { key: player, value: player }, disp(state, player)))
      ), /* @__PURE__ */ React75.createElement(
        "select",
        {
          "aria-label": "Player coming in",
          value: swapIn,
          disabled: setupPending,
          onChange: (event) => setSwapIn(event.target.value),
          style: selectStyle
        },
        /* @__PURE__ */ React75.createElement("option", { value: "" }, "Coming in"),
        bench.map((player) => /* @__PURE__ */ React75.createElement("option", { key: player, value: player }, disp(state, player)))
      ), /* @__PURE__ */ React75.createElement(
        ActionButton,
        {
          compact: true,
          disabled: !swapOut || !swapIn || setupPending,
          onClick: () => saveSetup(async () => {
            const result = await onSwap(swapOut, swapIn);
            if (result?.ok) {
              setSwapOut("");
              setSwapIn("");
            }
            return result;
          })
        },
        "Swap in"
      )), /* @__PURE__ */ React75.createElement("p", null, "Bets on the team stay. Outright bets on the player leaving are voided."));
    })(), (canHeats || canPools) && !st && setupAllowed && (!stageCfgOpen ? /* @__PURE__ */ React75.createElement(Btn, { kind: "dark", onClick: () => setStageCfgOpen(true), style: { width: "100%", marginBottom: 10 } }, canHeats ? "Run heats" : "Set up pools") : /* @__PURE__ */ React75.createElement("div", { style: {
      background: "var(--paper2)",
      border: "1px solid var(--line)",
      borderRadius: 14,
      padding: "12px 13px",
      marginBottom: 10
    } }, canHeats && /* @__PURE__ */ React75.createElement(React75.Fragment, null, /* @__PURE__ */ React75.createElement("div", { style: { display: "flex", alignItems: "center", marginBottom: 8 } }, /* @__PURE__ */ React75.createElement("div", { style: { ...label, flex: 1 } }, "Heats"), /* @__PURE__ */ React75.createElement("button", { onClick: () => setShowOuts((v) => !v), style: {
      cursor: "pointer",
      fontFamily: SANS,
      fontWeight: 700,
      fontSize: 12.5,
      padding: "6px 11px",
      borderRadius: 10,
      background: "var(--paper)",
      border: "1px solid var(--line)",
      color: "var(--ink)"
    } }, inPlayers.length, " playing ", showOuts ? "\u25B4" : "\u25BE")), showOuts && /* @__PURE__ */ React75.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 5, marginBottom: 10 } }, present.map((p, i) => /* @__PURE__ */ React75.createElement(
      PlayerChip,
      {
        key: p,
        name: p,
        small: true,
        selected: !outs.includes(p),
        onClick: () => setOuts((o) => o.includes(p) ? o.filter((x) => x !== p) : [...o, p]),
        style: centeredGridCell(i, present.length, 3, 5)
      }
    ))), !heatsFit && /* @__PURE__ */ React75.createElement("p", { role: "alert", style: { ...pStyle, color: "var(--clay-text)", fontSize: 13 } }, "Heats need at least 2 players each")), /* @__PURE__ */ React75.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 } }, /* @__PURE__ */ React75.createElement("span", { style: { ...label } }, canHeats ? "Heats" : "Pools"), [2, 3, 4].filter((n) => n <= stageEntrantCount).map((n) => /* @__PURE__ */ React75.createElement("button", { key: n, onClick: () => setNGroups(n), style: {
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
    } }, n)), /* @__PURE__ */ React75.createElement("span", { style: { flex: 1 } }), /* @__PURE__ */ React75.createElement("span", { style: { ...label } }, "Through"), [1, 2].map((n) => /* @__PURE__ */ React75.createElement("button", { key: n, onClick: () => setAdvance(n), style: {
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
    } }, n))), /* @__PURE__ */ React75.createElement("div", { style: { display: "flex", gap: 8 } }, /* @__PURE__ */ React75.createElement(
      ActionButton,
      {
        disabled: setupPending || canHeats && !heatsFit,
        onClick: () => saveSetup(() => announceNext && onAnnounceDraw ? onAnnounceDraw(
          canHeats ? inPlayers : null,
          canHeats ? overflowAssignments : null,
          { nGroups: groupsChoice, advance }
        ) : onStages({
          kind: stageKind,
          nGroups: groupsChoice,
          advance,
          players: inPlayers,
          roles: overflowAssignments
        })),
        style: { flex: 1 }
      },
      setupPending ? "Drawing\u2026" : announceNext ? "Announce and draw" : canHeats ? "Draw heats" : "Draw pools"
    ), /* @__PURE__ */ React75.createElement(ActionButton, { variant: "tertiary", onClick: () => setStageCfgOpen(false) }, "Cancel")))), setupError && /* @__PURE__ */ React75.createElement("p", { className: "fd-contest-error", role: "alert" }, setupError), st && !res && setupAllowed && (confirmScrap ? /* @__PURE__ */ React75.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 10 } }, /* @__PURE__ */ React75.createElement(ActionButton, { variant: "commit", onClick: () => {
      onClearStages();
      setConfirmScrap(false);
    }, style: { flex: 1 } }, "Scrap ", st.kind === "heats" ? "heats" : "pools"), /* @__PURE__ */ React75.createElement(ActionButton, { variant: "tertiary", onClick: () => setConfirmScrap(false), style: { flex: 1 } }, "Keep")) : /* @__PURE__ */ React75.createElement(ActionButton, { variant: "destructive", onClick: () => setConfirmScrap(true), style: { width: "100%", marginBottom: 10 } }, "Scrap ", st.kind === "heats" ? "heats" : "pools")), /* @__PURE__ */ React75.createElement("div", { style: { display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" } }, res && !isPoker && /* @__PURE__ */ React75.createElement(
      ActionButton,
      {
        onClick: enterResult,
        style: { flex: 1, whiteSpace: "nowrap", padding: "12px 8px" }
      },
      "Edit result"
    ), !res && lifecycle.nextAction?.type === "open-betting" && /* @__PURE__ */ React75.createElement(
      ActionButton,
      {
        variant: "secondary",
        onClick: onDeckToggle,
        style: { flex: 1, whiteSpace: "nowrap", padding: "12px 8px" }
      },
      "Open betting"
    ), !res && !contestActive && lifecycle.nextAction?.type === "lock-betting" && /* @__PURE__ */ React75.createElement(
      ActionButton,
      {
        variant: "secondary",
        onClick: onDeckToggle,
        style: { flex: 1, whiteSpace: "nowrap", padding: "12px 8px" }
      },
      "Lock betting"
    ), !res && !contestActive && lifecycle.nextAction?.type === "start-event" && /* @__PURE__ */ React75.createElement(
      ActionButton,
      {
        onClick: onStart,
        style: { flex: 1, whiteSpace: "nowrap", padding: "12px 8px" }
      },
      "Start event"
    ), res && !confirmClear && /* @__PURE__ */ React75.createElement(ActionButton, { variant: "destructive", onClick: () => setConfirmClear(true), style: { flex: 1 } }, "Clear")), !res && onTakeBack && announcementTakeBack(state, ev).enabled && (confirmTakeBack ? /* @__PURE__ */ React75.createElement("div", { style: { marginTop: 10 } }, /* @__PURE__ */ React75.createElement("p", { style: { ...pStyle, fontSize: 13, marginBottom: 8 } }, refundText(state, announcementTakeBack(state, ev).refunds) || "No open bets."), /* @__PURE__ */ React75.createElement("div", { style: { display: "flex", gap: 8 } }, /* @__PURE__ */ React75.createElement(
      ActionButton,
      {
        variant: "commit",
        disabled: setupPending,
        style: { flex: 1 },
        onClick: () => saveSetup(async () => {
          const result = await onTakeBack();
          if (result?.ok) setConfirmTakeBack(false);
          return result;
        })
      },
      setupPending ? "Taking back\u2026" : "Take it back"
    ), /* @__PURE__ */ React75.createElement(ActionButton, { variant: "tertiary", disabled: setupPending, onClick: () => setConfirmTakeBack(false) }, "Keep it"))) : /* @__PURE__ */ React75.createElement(
      ActionButton,
      {
        variant: "destructive",
        onClick: () => setConfirmTakeBack(true),
        style: { width: "100%", marginTop: 10 }
      },
      "Take back the announcement"
    )), !res && !contestActive && lifecycle.blockers?.length > 0 && /* @__PURE__ */ React75.createElement("div", { style: { ...pStyle, marginTop: 8, color: "var(--muted)", fontSize: 13 } }, "Next: ", lifecycle.blockers[0]), res && confirmClear && /* @__PURE__ */ React75.createElement("div", { style: {
      marginTop: 10,
      padding: "12px 13px",
      background: "var(--paper2)",
      border: "1px solid var(--line)",
      borderRadius: 14
    } }, /* @__PURE__ */ React75.createElement("div", { style: { ...label, marginBottom: 6 } }, "Reason for clearing"), /* @__PURE__ */ React75.createElement(
      "input",
      {
        value: clearReason,
        onChange: (event) => setClearReason(event.target.value),
        maxLength: 100,
        "aria-label": "Reason for clearing",
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
    ), /* @__PURE__ */ React75.createElement("div", { style: { display: "flex", gap: 8 } }, /* @__PURE__ */ React75.createElement(
      ActionButton,
      {
        variant: "commit",
        disabled: !clearReason.trim(),
        onClick: () => clearRes(clearReason),
        style: { flex: 1 }
      },
      "Clear official result"
    ), /* @__PURE__ */ React75.createElement(
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
    ))), editOpen ? /* @__PURE__ */ React75.createElement("div", { style: {
      background: "var(--paper2)",
      border: "1px solid var(--line)",
      borderRadius: 14,
      padding: "12px 13px",
      marginTop: 8
    } }, /* @__PURE__ */ React75.createElement("div", { style: { ...label, marginBottom: 6 } }, "Name"), /* @__PURE__ */ React75.createElement(
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
    ), /* @__PURE__ */ React75.createElement("div", { style: { ...label, marginBottom: 6 } }, "How it works"), /* @__PURE__ */ React75.createElement(
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
    ), /* @__PURE__ */ React75.createElement("div", { style: { ...label, marginBottom: 6 } }, "Worth", res ? ". Clear the result to change it" : ""), /* @__PURE__ */ React75.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 12 } }, [400, 800, 1200, 1600].map((v) => /* @__PURE__ */ React75.createElement("button", { key: v, disabled: !!res, onClick: () => setEValue(v), style: {
      flex: 1,
      height: 44,
      borderRadius: 10,
      cursor: res ? "default" : "pointer",
      fontFamily: DISPLAY,
      fontWeight: 700,
      fontSize: 16,
      background: eValue === v ? GOLD_GRAD : "var(--paper)",
      color: eValue === v ? "var(--ink0)" : "var(--ink)",
      border: eValue === v ? "1.5px solid var(--ink0)" : "1.5px solid var(--line)"
    } }, v))), /* @__PURE__ */ React75.createElement("div", { style: { ...label, marginBottom: 6 } }, "When"), /* @__PURE__ */ React75.createElement("div", { style: { display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 } }, [...SESSIONS.map((s) => [s.id, s.label]), [null, "Anytime"]].map(([id, lb]) => /* @__PURE__ */ React75.createElement("button", { key: String(id), onClick: () => setESession(id), style: {
      fontFamily: SANS,
      fontWeight: 600,
      fontSize: 12.5,
      padding: "10px 12px",
      borderRadius: 10,
      cursor: "pointer",
      background: eSession === id ? GOLD_GRAD : "var(--paper)",
      color: eSession === id ? "var(--ink0)" : "var(--ink)",
      border: eSession === id ? "1.5px solid var(--ink0)" : "1.5px solid var(--line)"
    } }, lb))), /* @__PURE__ */ React75.createElement("div", { style: { display: "flex", gap: 8 } }, /* @__PURE__ */ React75.createElement(
      Btn,
      {
        disabled: !eName.trim(),
        onClick: () => {
          onEdit({ name: eName, desc: eDesc, ...res ? {} : { value: eValue }, session: eSession });
          setEditOpen(false);
        },
        style: { flex: 1 }
      },
      "Save"
    ), /* @__PURE__ */ React75.createElement(Btn, { kind: "ghost", onClick: () => setEditOpen(false) }, "Cancel"))) : !more ? /* @__PURE__ */ React75.createElement("button", { onClick: () => setMore(true), style: {
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
    } }, "More options \u25BE") : /* @__PURE__ */ React75.createElement("div", { style: { display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" } }, /* @__PURE__ */ React75.createElement(Btn, { kind: "ghost", onClick: openEdit, style: { flex: 1 } }, "Edit details"), !res && !confirmShelve && /* @__PURE__ */ React75.createElement(Btn, { kind: "ghost", onClick: () => shelvedNow || !openBets.length ? onShelve(!shelvedNow) : setConfirmShelve(true), style: { flex: 1 } }, shelvedNow ? "Restore" : "Shelve"), !res && confirmShelve && /* @__PURE__ */ React75.createElement(React75.Fragment, null, /* @__PURE__ */ React75.createElement(Btn, { kind: "danger", onClick: () => {
      setConfirmShelve(false);
      onShelve(true, true);
    }, style: { flex: 1 } }, "Shelve. Returns ", openBets.length, " bet", openBets.length === 1 ? "" : "s", ", ", fmt8(openBets.reduce((sum, w) => sum + w.stake, 0)), " chips"), /* @__PURE__ */ React75.createElement(Btn, { kind: "ghost", onClick: () => setConfirmShelve(false) }, "Keep")), ev.custom && !confirmRemove && /* @__PURE__ */ React75.createElement(Btn, { kind: "danger", onClick: () => setConfirmRemove(true) }, "Remove"), ev.custom && confirmRemove && /* @__PURE__ */ React75.createElement(Btn, { kind: "danger", onClick: onRemove }, "Confirm remove")))
  );
}
function BracketSheet({ ev, state, me, gm, onClose, onBack, onPlayer, onLock, onWinner, onUndo, onPlayNext, onBets, onPostResult }) {
  const [pending, setPending] = useState62(false);
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
  return /* @__PURE__ */ React75.createElement(Sheet, { title: ev.name, subtitle: "Bracket", onClose, onBack, busy: pending, wide: true }, /* @__PURE__ */ React75.createElement(
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
      onResult: () => waitFor(onPostResult),
      onPlayNext: onPlayNext ? (payload) => waitFor(() => onPlayNext(payload)) : void 0
    }
  ), !active && /* @__PURE__ */ React75.createElement(CompetitionBracket, { state, ev, me, onPlayer }), /* @__PURE__ */ React75.createElement(EventCrewCard, { state, roles: draw.roles, compact: true, onPlayer }));
}
function ResultSheet({ ev, state, onClose, save }) {
  const existing = state.results[ev.id];
  const table = AWARDS[ev.value] || ev.pays ? awardTable(ev) : [400, 0, 0];
  const slotIdxs = table.map((v, i) => v > 0 ? i : null).filter((i) => i !== null);
  const bracket = state.brackets[ev.id], stage = state.stages[ev.id];
  const sequenced = !!state.eventOps?.[ev.id]?.contest;
  const winnerKnown = sequenced && (bracket && bracketChampion(bracket) !== null || stage && stage.finalWinner !== null && stage.finalWinner !== void 0);
  const editableSlots = slotIdxs.filter((index) => !winnerKnown || index !== 0);
  const paysEach = (index) => resultAwards(state, ev, { slots }).find((award) => award.place === index)?.pts ?? table[index];
  const initial = useMemo16(() => {
    if (existing?.slots) return existing.slots.map((s) => [...s || []]);
    const br = state.brackets[ev.id], draw2 = state.draws[ev.id], st = state.stages[ev.id];
    if (br && draw2) {
      const champ = bracketChampion(br);
      if (champ !== null) {
        const final = br.rounds[br.rounds.length - 1][0];
        const a = resolveSlot(br, final.a), b = resolveSlot(br, final.b);
        const runner = champ === a ? b : a;
        const semis = br.rounds[br.rounds.length - 2] || [];
        const losers = semis.map((match) => [resolveSlot(br, match.a), resolveSlot(br, match.b)].find((side) => side !== null && side !== match.winner)).filter((side) => side !== void 0 && draw2.teams[side]);
        return [
          [...draw2.teams[champ].players],
          table[1] > 0 && runner !== null ? [...draw2.teams[runner].players] : [],
          table[2] > 0 ? losers.flatMap((side) => draw2.teams[side].players) : []
        ];
      }
    }
    if (st && st.finalWinner !== null && st.finalWinner !== void 0) {
      const v = stageEntrantView(state, st, st.finalWinner);
      const finalists = stageFinalists(st) || [];
      const runner = finalists.length === 2 ? finalists.find((key) => key !== st.finalWinner) : void 0;
      return [
        [...v.players],
        table[1] > 0 && runner !== void 0 ? [...stageEntrantView(state, st, runner).players] : [],
        []
      ];
    }
    return [[], [], []];
  }, []);
  const [slots, setSlots] = useState62(initial);
  const [active, setActive] = useState62(editableSlots[0] ?? 0);
  const [byPlayer, setByPlayer] = useState62(false);
  const [confirmCorrection, setConfirmCorrection] = useState62(false);
  const [correctionReason, setCorrectionReason] = useState62("");
  const [pending, setPending] = useState62(false), [error, setError] = useState62("");
  const [emptyCheck, setEmptyCheck] = useState62(null);
  const saving = useRef58(false);
  const post = async (options, allowEmpty = false) => {
    if (saving.current) return;
    if (!allowEmpty && emptyPaid.length) {
      setEmptyCheck(options || {});
      return;
    }
    setEmptyCheck(null);
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
  const twoTeams = !winnerKnown && !bracket && !stage && ev.kind !== "solo" && draw?.teams?.length === 2;
  const pickWinner = (team) => setSlots((prev) => {
    if (saving.current) return prev;
    if (team.players.every((p) => prev[0].includes(p))) return [[], [], []];
    const other = draw.teams.find((item) => item !== team);
    return [[...team.players], table[1] > 0 && other ? [...other.players] : [], []];
  });
  const sidesInPlay = draw?.teams?.length && ev.kind !== "solo" ? draw.teams.length : ROSTER.length;
  const emptyPaid = slotIdxs.filter((index) => index > 0 && index < sidesInPlay && !slots[index].length);
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
  return /* @__PURE__ */ React75.createElement(Sheet, { title: ev.name, subtitle: "Official result", onClose, busy: pending }, winnerKnown && /* @__PURE__ */ React75.createElement("div", { className: "fd-result-winner" }, /* @__PURE__ */ React75.createElement("small", null, "Winner"), /* @__PURE__ */ React75.createElement("strong", null, slots[0].map((player) => disp(state, player)).join(" & ")), /* @__PURE__ */ React75.createElement("span", null, "+", fmt8(table[0]), slots[0].length > 1 ? " each" : " chips")), winnerKnown && /* @__PURE__ */ React75.createElement("p", { style: { ...pStyle, fontSize: 12.5, color: "var(--muted2)" } }, existing ? "To change the winner, clear the result and correct the final." : "To change the winner, correct the final from the event sheet."), twoTeams && /* @__PURE__ */ React75.createElement("fieldset", { disabled: pending, style: { border: 0, padding: 0, margin: 0, minWidth: 0 } }, /* @__PURE__ */ React75.createElement("div", { style: { ...label, marginBottom: 8 } }, "Winner"), /* @__PURE__ */ React75.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 } }, draw.teams.map((team, i) => {
    const won = team.players.length > 0 && team.players.every((p) => slots[0].includes(p));
    return /* @__PURE__ */ React75.createElement(
      "button",
      {
        key: i,
        type: "button",
        onClick: () => pickWinner(team),
        "aria-pressed": won,
        style: {
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 8,
          minHeight: 88,
          padding: "12px",
          borderRadius: 14,
          cursor: "pointer",
          textAlign: "left",
          background: won ? GOLD_GRAD : "var(--paper)",
          border: won ? "1.5px solid var(--ink0)" : "1.5px solid var(--line)"
        }
      },
      /* @__PURE__ */ React75.createElement(AvatarStack, { state, players: team.players, size: 26, max: 5 }),
      /* @__PURE__ */ React75.createElement("span", { style: {
        fontFamily: SANS,
        fontWeight: 700,
        fontSize: 14,
        color: won ? "var(--ink0)" : "var(--ink)",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        maxWidth: "100%"
      } }, teamLabel(state, team))
    );
  })), slots[0].length > 0 && /* @__PURE__ */ React75.createElement("p", { style: { ...pStyle, fontSize: 12.5, color: "var(--muted2)", margin: "0 0 12px" } }, "+", fmt8(paysEach(0)), " each to the winners", table[1] > 0 ? `, +${fmt8(paysEach(1))} each to the other team` : "", table[2] > 0 && draw.roles?.length ? `, +${fmt8(table[2])} each to the crew` : "", ".")), !twoTeams && !!editableSlots.length && /* @__PURE__ */ React75.createElement("fieldset", { disabled: pending, style: { border: 0, padding: 0, margin: 0, minWidth: 0 } }, /* @__PURE__ */ React75.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 14 } }, editableSlots.map((i) => /* @__PURE__ */ React75.createElement("button", { key: i, onClick: () => setActive(i), style: {
    flex: 1,
    padding: "10px 6px",
    cursor: "pointer",
    borderRadius: 14,
    border: "1px solid " + (active === i ? "var(--accent)" : "var(--line)"),
    background: active === i ? "rgba(194,88,50,0.1)" : "var(--paper2)"
  } }, /* @__PURE__ */ React75.createElement("div", { style: { fontFamily: SANS, fontWeight: 700, fontSize: 14, color: SLOT_META[i].color } }, ev.kind === "solo" ? SLOT_META[i].label : SLOT_META[i].team), /* @__PURE__ */ React75.createElement("div", { style: { fontFamily: SANS, fontSize: 11, color: "var(--muted)" } }, "+", fmt8(paysEach(i)), " each, ", slots[i].length, " in")))), table[2] > 0 && !!draw?.roles?.length && /* @__PURE__ */ React75.createElement("p", { style: { ...pStyle, fontSize: 12.5, color: "var(--muted)", margin: "-6px 0 12px" } }, "Event crew +", fmt8(table[2]), " each: ", draw.roles.map((role) => disp(state, role.player)).join(", ")), teamMode ? /* @__PURE__ */ React75.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 } }, draw.teams.filter((t) => !winnerKnown || !t.players.some((p) => slots[0].includes(p))).map((t, i) => {
    const w = teamSlot(t);
    return /* @__PURE__ */ React75.createElement("button", { key: i, onClick: () => toggleTeam(t), style: {
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
    } }, /* @__PURE__ */ React75.createElement(AvatarStack, { state, players: t.players, size: 22, max: 3 }), /* @__PURE__ */ React75.createElement("span", { style: {
      flex: 1,
      fontFamily: SANS,
      fontWeight: 600,
      fontSize: 12.5,
      minWidth: 0,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      color: w === active ? "var(--ink0)" : "var(--ink)"
    } }, teamLabel(state, t)), w >= 0 && w !== active && /* @__PURE__ */ React75.createElement("span", { style: {
      fontFamily: SANS,
      fontWeight: 700,
      fontSize: 11,
      color: SLOT_META[w].color,
      flexShrink: 0
    } }, SLOT_META[w].label));
  })) : /* @__PURE__ */ React75.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8, marginBottom: 10 } }, ROSTER.filter((p) => !winnerKnown || !slots[0].includes(p)).map((p, i) => {
    const w = taken(p);
    return /* @__PURE__ */ React75.createElement(
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
  })), !!draw?.teams?.length && ev.kind !== "solo" && !(sequenced && active === 0) && /* @__PURE__ */ React75.createElement("button", { onClick: () => setByPlayer((v) => !v), style: {
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
  } }, byPlayer ? "Back to teams" : "Pick by player")), error && /* @__PURE__ */ React75.createElement("p", { role: "alert", style: { color: "var(--clay-text)", fontSize: 13 } }, error), emptyCheck && emptyPaid.length > 0 && /* @__PURE__ */ React75.createElement("div", { role: "alert", style: {
    marginBottom: 10,
    padding: "12px 13px",
    background: "var(--paper2)",
    border: "1px solid var(--line)",
    borderRadius: 14
  } }, emptyPaid.map((i) => /* @__PURE__ */ React75.createElement("p", { key: i, style: { ...pStyle, margin: "0 0 6px" } }, SLOT_META[i].label, " place pays ", fmt8(paysEach(i)), ". Nobody selected.")), /* @__PURE__ */ React75.createElement("div", { style: { display: "flex", gap: 8, marginTop: 8 } }, /* @__PURE__ */ React75.createElement(
    ActionButton,
    {
      variant: "commit",
      disabled: pending,
      onClick: () => post(emptyCheck, true),
      style: { flex: 1 }
    },
    "Leave empty"
  ), /* @__PURE__ */ React75.createElement(
    ActionButton,
    {
      variant: "tertiary",
      disabled: pending,
      onClick: () => {
        setActive(emptyPaid[0]);
        setEmptyCheck(null);
      },
      style: { flex: 1 }
    },
    "Choose"
  ))), !existing ? /* @__PURE__ */ React75.createElement(
    ActionButton,
    {
      disabled: slots[0].length === 0 || pending,
      onClick: () => post(),
      style: { width: "100%", fontSize: 16, padding: "14px", marginTop: 4 }
    },
    "Post official result"
  ) : !confirmCorrection ? /* @__PURE__ */ React75.createElement(
    ActionButton,
    {
      disabled: slots[0].length === 0 || unchanged || pending,
      onClick: () => setConfirmCorrection(true),
      style: { width: "100%", fontSize: 16, padding: "14px", marginTop: 4 }
    },
    unchanged ? `Official result \xB7 revision ${existing.revision || 1}` : "Review result correction"
  ) : /* @__PURE__ */ React75.createElement("div", { style: {
    marginTop: 4,
    padding: "12px 13px",
    background: "var(--paper2)",
    border: "1px solid var(--line)",
    borderRadius: 14
  } }, /* @__PURE__ */ React75.createElement("div", { style: { ...label, marginBottom: 6 } }, "Reason for the correction"), /* @__PURE__ */ React75.createElement(
    "input",
    {
      value: correctionReason,
      disabled: pending,
      onChange: (event) => setCorrectionReason(event.target.value),
      maxLength: 100,
      "aria-label": "Reason for the correction",
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
  ), /* @__PURE__ */ React75.createElement("div", { style: { display: "flex", gap: 8 } }, /* @__PURE__ */ React75.createElement(
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
  ), /* @__PURE__ */ React75.createElement(ActionButton, { variant: "tertiary", disabled: pending, onClick: () => {
    setConfirmCorrection(false);
    setCorrectionReason("");
  }, style: { flex: 1 } }, "Keep current"))));
}
function GameMoment({ gameId }) {
  const Hero = GAME_HEROES[gameId];
  return /* @__PURE__ */ React75.createElement("div", { className: "fd-game-moment", "aria-hidden": "true" }, Hero && !prefersReducedMotion2() ? /* @__PURE__ */ React75.createElement(Hero, null) : /* @__PURE__ */ React75.createElement(GameMark, { id: gameId, size: 72 }));
}
function DieHero() {
  return /* @__PURE__ */ React75.createElement("svg", { width: "180", height: "82", viewBox: "0 0 180 82", "aria-hidden": "true", style: { display: "block", overflow: "visible" } }, /* @__PURE__ */ React75.createElement("line", { x1: "8", y1: "60", x2: "172", y2: "60", stroke: "var(--sun)", strokeWidth: "3", strokeLinecap: "round" }), /* @__PURE__ */ React75.createElement("line", { x1: "8", y1: "66", x2: "172", y2: "66", stroke: "var(--ink)", strokeWidth: "1.6", strokeLinecap: "round", opacity: "0.4" }), /* @__PURE__ */ React75.createElement("g", { style: { animation: "si-die-arc 2.6s linear 1 both" } }, /* @__PURE__ */ React75.createElement("rect", { x: "0", y: "0", width: "20", height: "20", rx: "4.5", fill: "var(--paper)", stroke: "var(--ink)", strokeWidth: "1.8" }), /* @__PURE__ */ React75.createElement("circle", { cx: "5.5", cy: "5.5", r: "1.7", fill: "var(--ink)" }), /* @__PURE__ */ React75.createElement("circle", { cx: "14.5", cy: "5.5", r: "1.7", fill: "var(--ink)" }), /* @__PURE__ */ React75.createElement("circle", { cx: "10", cy: "10", r: "1.7", fill: "var(--ink)" }), /* @__PURE__ */ React75.createElement("circle", { cx: "5.5", cy: "14.5", r: "1.7", fill: "var(--ink)" }), /* @__PURE__ */ React75.createElement("circle", { cx: "14.5", cy: "14.5", r: "1.7", fill: "var(--ink)" })));
}
function PongHero() {
  return /* @__PURE__ */ React75.createElement("svg", { width: "180", height: "82", viewBox: "0 0 180 82", "aria-hidden": "true", style: { display: "block", overflow: "visible" } }, /* @__PURE__ */ React75.createElement("line", { x1: "8", y1: "60", x2: "172", y2: "60", stroke: "var(--sun)", strokeWidth: "3", strokeLinecap: "round" }), /* @__PURE__ */ React75.createElement("path", { d: "M112 30h20l-2.5 28h-15z", fill: "var(--paper)", stroke: "var(--ink)", strokeWidth: "1.8", strokeLinejoin: "round" }), /* @__PURE__ */ React75.createElement("ellipse", { cx: "122", cy: "30", rx: "10", ry: "3", fill: "var(--paper2)", stroke: "var(--ink)", strokeWidth: "1.4" }), /* @__PURE__ */ React75.createElement("g", { style: { animation: "si-pong-arc 2s linear 1 both" } }, /* @__PURE__ */ React75.createElement("circle", { cx: "8", cy: "0", r: "5.5", fill: "var(--paper)", stroke: "var(--ink)", strokeWidth: "1.6" })));
}
function FlipHero() {
  return /* @__PURE__ */ React75.createElement("svg", { width: "180", height: "82", viewBox: "0 0 180 82", "aria-hidden": "true", style: { display: "block", overflow: "visible" } }, /* @__PURE__ */ React75.createElement("line", { x1: "8", y1: "60", x2: "172", y2: "60", stroke: "var(--sun)", strokeWidth: "3", strokeLinecap: "round" }), /* @__PURE__ */ React75.createElement("g", { style: { animation: "si-flip-cup 2.2s ease-in-out 1 both", transformOrigin: "90px 46px" } }, /* @__PURE__ */ React75.createElement("path", { d: "M78 32h24l-3 28H81z", fill: "var(--paper)", stroke: "var(--ink)", strokeWidth: "1.8", strokeLinejoin: "round" }), /* @__PURE__ */ React75.createElement("ellipse", { cx: "90", cy: "32", rx: "12", ry: "3.4", fill: "var(--paper2)", stroke: "var(--ink)", strokeWidth: "1.4" })));
}
function PuttHero() {
  return /* @__PURE__ */ React75.createElement("svg", { width: "180", height: "82", viewBox: "0 0 180 82", "aria-hidden": "true", style: { display: "block", overflow: "visible" } }, /* @__PURE__ */ React75.createElement("line", { x1: "8", y1: "60", x2: "132", y2: "60", stroke: "var(--sun)", strokeWidth: "3", strokeLinecap: "round" }), /* @__PURE__ */ React75.createElement("line", { x1: "146", y1: "60", x2: "172", y2: "60", stroke: "var(--sun)", strokeWidth: "3", strokeLinecap: "round" }), /* @__PURE__ */ React75.createElement("line", { x1: "139", y1: "60", x2: "139", y2: "26", stroke: "var(--ink)", strokeWidth: "1.8" }), /* @__PURE__ */ React75.createElement("path", { d: "M139 26h16l-5 5.5 5 5.5h-16z", fill: "var(--accent)", stroke: "var(--ink)", strokeWidth: "1.4", strokeLinejoin: "round" }), /* @__PURE__ */ React75.createElement("g", { style: { animation: "si-putt 2.4s ease-in-out 1 both" } }, /* @__PURE__ */ React75.createElement("circle", { cx: "12", cy: "54", r: "5", fill: "var(--paper)", stroke: "var(--ink)", strokeWidth: "1.6" })));
}
function EightHero() {
  return /* @__PURE__ */ React75.createElement("svg", { width: "180", height: "82", viewBox: "0 0 180 82", "aria-hidden": "true", style: { display: "block", overflow: "visible" } }, /* @__PURE__ */ React75.createElement("line", { x1: "8", y1: "60", x2: "172", y2: "60", stroke: "var(--sun)", strokeWidth: "3", strokeLinecap: "round" }), /* @__PURE__ */ React75.createElement("g", { style: { animation: "si-cue 2.4s ease-out 1 both" } }, /* @__PURE__ */ React75.createElement("circle", { cx: "26", cy: "52", r: "7", fill: "var(--paper)", stroke: "var(--ink)", strokeWidth: "1.6" })), /* @__PURE__ */ React75.createElement("g", { style: { animation: "si-eight 2.4s ease-out 1 both" } }, /* @__PURE__ */ React75.createElement("circle", { cx: "96", cy: "52", r: "7", fill: "var(--ink0)", stroke: "var(--bone)", strokeWidth: "1.6" }), /* @__PURE__ */ React75.createElement("circle", { cx: "96", cy: "52", r: "3.2", fill: "var(--paper)" }), /* @__PURE__ */ React75.createElement("text", { x: "96", y: "54.6", textAnchor: "middle", fontSize: "5", fontWeight: "700", fontFamily: SANS, fill: "var(--ink0)" }, "8")));
}
function BballHero() {
  return /* @__PURE__ */ React75.createElement("svg", { width: "180", height: "82", viewBox: "0 0 180 82", "aria-hidden": "true", style: { display: "block", overflow: "visible" } }, /* @__PURE__ */ React75.createElement("line", { x1: "8", y1: "60", x2: "172", y2: "60", stroke: "var(--sun)", strokeWidth: "3", strokeLinecap: "round" }), /* @__PURE__ */ React75.createElement("line", { x1: "158", y1: "12", x2: "158", y2: "34", stroke: "var(--ink)", strokeWidth: "2.2" }), /* @__PURE__ */ React75.createElement("line", { x1: "142", y1: "32", x2: "158", y2: "32", stroke: "var(--accent)", strokeWidth: "2.6", strokeLinecap: "round" }), /* @__PURE__ */ React75.createElement("line", { x1: "144", y1: "32", x2: "147", y2: "43", stroke: "var(--ink)", strokeWidth: "1.2", opacity: "0.6" }), /* @__PURE__ */ React75.createElement("line", { x1: "155", y1: "32", x2: "153", y2: "43", stroke: "var(--ink)", strokeWidth: "1.2", opacity: "0.6" }), /* @__PURE__ */ React75.createElement("g", { style: { animation: "si-bball 2.4s ease-in-out 1 both" } }, /* @__PURE__ */ React75.createElement("circle", { cx: "16", cy: "50", r: "7", fill: "var(--accent)", stroke: "var(--ink)", strokeWidth: "1.6" }), /* @__PURE__ */ React75.createElement("path", { d: "M9 50h14M16 43v14", stroke: "var(--ink)", strokeWidth: "1.1", opacity: "0.7" })));
}
function SpikeHero() {
  return /* @__PURE__ */ React75.createElement("svg", { width: "180", height: "82", viewBox: "0 0 180 82", "aria-hidden": "true", style: { display: "block", overflow: "visible" } }, /* @__PURE__ */ React75.createElement("line", { x1: "8", y1: "60", x2: "172", y2: "60", stroke: "var(--sun)", strokeWidth: "3", strokeLinecap: "round" }), /* @__PURE__ */ React75.createElement("ellipse", { cx: "90", cy: "52", rx: "22", ry: "6", fill: "var(--paper2)", stroke: "var(--ink)", strokeWidth: "1.8" }), /* @__PURE__ */ React75.createElement("path", { d: "M74 56l-5 4M106 56l5 4", stroke: "var(--ink)", strokeWidth: "1.8", strokeLinecap: "round" }), /* @__PURE__ */ React75.createElement("g", { style: { animation: "si-spike 2.2s ease-in 1 both" } }, /* @__PURE__ */ React75.createElement("circle", { cx: "14", cy: "8", r: "5.5", fill: "var(--sun)", stroke: "var(--ink0)", strokeWidth: "1.6" })));
}
function PingpongHero() {
  return /* @__PURE__ */ React75.createElement("svg", { width: "180", height: "82", viewBox: "0 0 180 82", "aria-hidden": "true", style: { display: "block", overflow: "visible" } }, /* @__PURE__ */ React75.createElement("line", { x1: "8", y1: "60", x2: "172", y2: "60", stroke: "var(--sun)", strokeWidth: "3", strokeLinecap: "round" }), /* @__PURE__ */ React75.createElement("line", { x1: "90", y1: "60", x2: "90", y2: "46", stroke: "var(--ink)", strokeWidth: "2" }), /* @__PURE__ */ React75.createElement("g", { transform: "rotate(-30 22 48)" }, /* @__PURE__ */ React75.createElement("ellipse", { cx: "22", cy: "44", rx: "8", ry: "10", fill: "var(--accent)", stroke: "var(--ink)", strokeWidth: "1.6" }), /* @__PURE__ */ React75.createElement("rect", { x: "20", y: "54", width: "4", height: "9", rx: "2", fill: "var(--paper)", stroke: "var(--ink)", strokeWidth: "1.2" })), /* @__PURE__ */ React75.createElement("g", { transform: "rotate(30 158 48)" }, /* @__PURE__ */ React75.createElement("ellipse", { cx: "158", cy: "44", rx: "8", ry: "10", fill: "var(--pool)", stroke: "var(--ink)", strokeWidth: "1.6" }), /* @__PURE__ */ React75.createElement("rect", { x: "156", y: "54", width: "4", height: "9", rx: "2", fill: "var(--paper)", stroke: "var(--ink)", strokeWidth: "1.2" })), /* @__PURE__ */ React75.createElement("g", { style: { animation: "si-pingpong 2.4s linear 1 both" } }, /* @__PURE__ */ React75.createElement("circle", { cx: "34", cy: "40", r: "4", fill: "var(--paper)", stroke: "var(--ink)", strokeWidth: "1.4" })));
}
function FoosHero() {
  return /* @__PURE__ */ React75.createElement("svg", { width: "180", height: "82", viewBox: "0 0 180 82", "aria-hidden": "true", style: { display: "block", overflow: "visible" } }, /* @__PURE__ */ React75.createElement("line", { x1: "8", y1: "60", x2: "172", y2: "60", stroke: "var(--sun)", strokeWidth: "3", strokeLinecap: "round" }), /* @__PURE__ */ React75.createElement("path", { d: "M160 38v22M172 38v22M160 38h12", fill: "none", stroke: "var(--ink)", strokeWidth: "2" }), /* @__PURE__ */ React75.createElement("g", { style: { animation: "si-foosman 2.4s ease-in-out 1 both" } }, /* @__PURE__ */ React75.createElement("line", { x1: "96", y1: "10", x2: "96", y2: "50", stroke: "var(--ink)", strokeWidth: "2.4" }), /* @__PURE__ */ React75.createElement("path", { d: "M91 32h10l-1.6 14h-6.8z", fill: "var(--clay)", stroke: "var(--ink)", strokeWidth: "1.4", strokeLinejoin: "round" })), /* @__PURE__ */ React75.createElement("g", { style: { animation: "si-foos 2.4s ease-out 1 both" } }, /* @__PURE__ */ React75.createElement("circle", { cx: "24", cy: "54", r: "5.5", fill: "var(--paper)", stroke: "var(--ink)", strokeWidth: "1.6" })));
}
function VolleyHero() {
  return /* @__PURE__ */ React75.createElement("svg", { width: "180", height: "82", viewBox: "0 0 180 82", "aria-hidden": "true", style: { display: "block", overflow: "visible" } }, /* @__PURE__ */ React75.createElement("line", { x1: "8", y1: "60", x2: "172", y2: "60", stroke: "var(--sun)", strokeWidth: "3", strokeLinecap: "round" }), /* @__PURE__ */ React75.createElement("line", { x1: "90", y1: "60", x2: "90", y2: "18", stroke: "var(--ink)", strokeWidth: "2.2" }), /* @__PURE__ */ React75.createElement("line", { x1: "82", y1: "18", x2: "98", y2: "18", stroke: "var(--ink)", strokeWidth: "2.6", strokeLinecap: "round" }), /* @__PURE__ */ React75.createElement("path", { d: "M84 24h12M84 30h12", stroke: "var(--ink)", strokeWidth: "1.1", opacity: "0.55" }), /* @__PURE__ */ React75.createElement("g", { style: { animation: "si-volley 2.4s ease-in-out 1 both" } }, /* @__PURE__ */ React75.createElement("circle", { cx: "18", cy: "46", r: "6.5", fill: "var(--paper)", stroke: "var(--ink)", strokeWidth: "1.6" }), /* @__PURE__ */ React75.createElement("path", { d: "M11.5 46c4-3.4 9-3.4 13 0M18 39.5v13", stroke: "var(--ink)", strokeWidth: "1.1", opacity: "0.7" })));
}
function PickleHero() {
  return /* @__PURE__ */ React75.createElement("svg", { width: "180", height: "82", viewBox: "0 0 180 82", "aria-hidden": "true", style: { display: "block", overflow: "visible" } }, /* @__PURE__ */ React75.createElement("line", { x1: "8", y1: "60", x2: "172", y2: "60", stroke: "var(--sun)", strokeWidth: "3", strokeLinecap: "round" }), /* @__PURE__ */ React75.createElement("line", { x1: "90", y1: "60", x2: "90", y2: "40", stroke: "var(--ink)", strokeWidth: "2" }), /* @__PURE__ */ React75.createElement("line", { x1: "83", y1: "40", x2: "97", y2: "40", stroke: "var(--ink)", strokeWidth: "2.4", strokeLinecap: "round" }), /* @__PURE__ */ React75.createElement("line", { x1: "64", y1: "60", x2: "64", y2: "56", stroke: "var(--ink)", strokeWidth: "1.6", opacity: "0.6" }), /* @__PURE__ */ React75.createElement("line", { x1: "116", y1: "60", x2: "116", y2: "56", stroke: "var(--ink)", strokeWidth: "1.6", opacity: "0.6" }), /* @__PURE__ */ React75.createElement("g", { style: { animation: "si-pickle 2.4s ease-in-out 1 both" } }, /* @__PURE__ */ React75.createElement("circle", { cx: "18", cy: "50", r: "5", fill: "var(--sun)", stroke: "var(--ink0)", strokeWidth: "1.5" })));
}
function KartHero() {
  return /* @__PURE__ */ React75.createElement("svg", { width: "180", height: "82", viewBox: "0 0 180 82", "aria-hidden": "true", style: { display: "block", overflow: "visible" } }, /* @__PURE__ */ React75.createElement("line", { x1: "8", y1: "60", x2: "172", y2: "60", stroke: "var(--sun)", strokeWidth: "3", strokeLinecap: "round" }), /* @__PURE__ */ React75.createElement("path", { d: "M150 60v-22M150 38h6v4h-6M150 46h6v4h-6", stroke: "var(--ink)", strokeWidth: "1.8", fill: "none" }), /* @__PURE__ */ React75.createElement("g", { style: { animation: "si-kart 2.6s ease-in-out 1 both" } }, /* @__PURE__ */ React75.createElement("path", { d: "M10 46h30l-4 8H16z", fill: "var(--clay)", stroke: "var(--ink)", strokeWidth: "1.6", strokeLinejoin: "round" }), /* @__PURE__ */ React75.createElement("path", { d: "M20 40h12l2 6H18z", fill: "var(--paper)", stroke: "var(--ink)", strokeWidth: "1.4", strokeLinejoin: "round" }), /* @__PURE__ */ React75.createElement("circle", { cx: "17", cy: "56", r: "4.4", fill: "var(--ink0)", stroke: "var(--bone)", strokeWidth: "1.4" }), /* @__PURE__ */ React75.createElement("circle", { cx: "35", cy: "56", r: "4.4", fill: "var(--ink0)", stroke: "var(--bone)", strokeWidth: "1.4" })));
}
function RageHero() {
  return /* @__PURE__ */ React75.createElement("svg", { width: "180", height: "82", viewBox: "0 0 180 82", "aria-hidden": "true", style: { display: "block", overflow: "visible" } }, /* @__PURE__ */ React75.createElement("line", { x1: "8", y1: "60", x2: "172", y2: "60", stroke: "var(--sun)", strokeWidth: "3", strokeLinecap: "round" }), [64, 90, 116].map((x) => /* @__PURE__ */ React75.createElement("g", { key: x }, /* @__PURE__ */ React75.createElement("path", { d: `M${x - 9} 36h18l-2.4 24h-13.2z`, fill: "var(--paper)", stroke: "var(--ink)", strokeWidth: "1.6", strokeLinejoin: "round" }), /* @__PURE__ */ React75.createElement("ellipse", { cx: x, cy: "36", rx: "9", ry: "2.8", fill: "var(--paper2)", stroke: "var(--ink)", strokeWidth: "1.2" }))), /* @__PURE__ */ React75.createElement("g", { style: { animation: "si-rage 2.2s ease-in 1 both" } }, /* @__PURE__ */ React75.createElement("circle", { cx: "16", cy: "10", r: "4.5", fill: "var(--sun)", stroke: "var(--ink0)", strokeWidth: "1.4" })));
}
function GauntletHero() {
  return /* @__PURE__ */ React75.createElement("svg", { width: "180", height: "82", viewBox: "0 0 180 82", "aria-hidden": "true", style: { display: "block", overflow: "visible" } }, /* @__PURE__ */ React75.createElement("line", { x1: "8", y1: "60", x2: "172", y2: "60", stroke: "var(--sun)", strokeWidth: "3", strokeLinecap: "round" }), [36, 68, 100, 132, 164].map((x, i) => /* @__PURE__ */ React75.createElement(
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
  )), /* @__PURE__ */ React75.createElement("g", { style: { animation: "si-gauntlet 2.8s ease-in-out 1 both" } }, /* @__PURE__ */ React75.createElement("circle", { cx: "12", cy: "44", r: "5.5", fill: "var(--sun)", stroke: "var(--ink0)", strokeWidth: "1.6" })));
}
function PokerHero() {
  return /* @__PURE__ */ React75.createElement("svg", { width: "180", height: "82", viewBox: "0 0 180 82", "aria-hidden": "true", style: { display: "block", overflow: "visible" } }, /* @__PURE__ */ React75.createElement("line", { x1: "8", y1: "60", x2: "172", y2: "60", stroke: "var(--sun)", strokeWidth: "3", strokeLinecap: "round" }), /* @__PURE__ */ React75.createElement("g", { style: { animation: "si-deal1 2.4s ease-out 1 both" } }, /* @__PURE__ */ React75.createElement("rect", { x: "70", y: "26", width: "18", height: "26", rx: "3", fill: "var(--paper)", stroke: "var(--ink)", strokeWidth: "1.6" })), /* @__PURE__ */ React75.createElement("g", { style: { animation: "si-deal2 2.4s ease-out 1 both" } }, /* @__PURE__ */ React75.createElement("rect", { x: "92", y: "26", width: "18", height: "26", rx: "3", fill: "var(--paper)", stroke: "var(--ink)", strokeWidth: "1.6" }), /* @__PURE__ */ React75.createElement("circle", { cx: "101", cy: "39", r: "3.4", fill: "var(--accent)" })), /* @__PURE__ */ React75.createElement("g", { style: { animation: "si-chip-in 2.4s ease-in-out 1 both" } }, /* @__PURE__ */ React75.createElement("circle", { cx: "16", cy: "52", r: "7.5", fill: "var(--sun)", stroke: "var(--ink0)", strokeWidth: "1.6" }), /* @__PURE__ */ React75.createElement("circle", { cx: "16", cy: "52", r: "4.2", fill: "none", stroke: "var(--chip-mark)", strokeWidth: "1.6" })));
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
function Reveal({ state, reveal, me, onClose, onBets, onPlayer }) {
  return /* @__PURE__ */ React75.createElement(DrawAnnouncement, { state, reveal, me, synced: true, onClose, onBets, onPlayer });
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
