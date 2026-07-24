/* Every state mutation lives here and runs inside the Durable Object.
   Handlers mutate `state` in place and return { ok } or { ok:false, error }.
   Optionally { extra } rides back on the ack (e.g. undo snapshots).
   ctx = { isGm, player } where player is the roster name this device claimed. */

import {
  ROSTER, AWARDS, SESSIONS, EMPTY_STATE, SIZES, TEAM_NAMES, allEventsOf, disp, resolveWager, computeStandings, atRisk,
  drawTeams, splitIntoGroups, makeBracket, stageFinalists, shuffle, snakeTeam, resolveSlot, OUTRIGHT_MULT,
} from "../shared/core.js";

const ok = extra => ({ ok: true, extra });
const err = error => ({ ok: false, error });
const gmOnly = ctx => (ctx.isGm ? null : err("Commissioner only"));

export const ACTIONS = {
  /* ── identity / profile ── */
  saveProfile(state, { player, display, num, size }, ctx) {
    if (!ROSTER.includes(player)) return err("Unknown player");
    if (player !== ctx.player && !ctx.isGm) return err("Not your profile");
    if (typeof display !== "string" || !display.trim()) return err("Name required");
    const prof = { ...(state.profiles[player] || {}), display: display.trim().slice(0, 16) };
    if (num !== undefined) {
      if (num === null) delete prof.num;
      else {
        const n = Math.floor(Number(num));
        if (!Number.isFinite(n) || n < 0 || n > 99) return err("Numbers run 0 to 99");
        const taken = Object.entries(state.profiles).find(([p, pr]) => p !== player && pr?.num === n);
        if (taken) return err(`${disp(state, taken[0])} already has ${n}`);
        prof.num = n;
      }
    }
    if (size !== undefined) {
      if (size === null) delete prof.size;
      else if (!SIZES.includes(size)) return err("Bad size");
      else prof.size = size;
    }
    state.profiles[player] = prof;
    return ok();
  },
  saveSeeds(state, { player, ratings }, ctx) {
    if (!ROSTER.includes(player)) return err("Unknown player");
    if (player !== ctx.player && !ctx.isGm) return err("Not your report");
    state.seeds[player] = ratings;
    return ok();
  },

  /* ── wagers (players) ── */
  placeWager(state, { wager }, ctx) {
    const player = ctx.player;
    if (!player) return err("Check in first");
    if (state.frozen) return err("The board is frozen");
    const events = allEventsOf(state);
    const ev = events.find(e => e.id === wager.eventId);
    if (!ev) return err("No such event");
    if (state.onDeck !== ev.id) return err("Betting is closed for this event");
    if (state.results[ev.id]) return err("Result already posted");
    const stake = Math.floor(Number(wager.stake));
    if (!(stake >= 1 && stake <= 3)) return err("Stake must be 1 to 3");
    /* exposure + balance, computed server side */
    const pts = computeStandings(state).find(r => r.player === player)?.pts ?? 0;
    const exp = atRisk(state, player, events);
    if (exp + stake > 3) return err("Max 3 at risk");
    if (stake > pts - exp) return err("Not enough points");
    /* referenced structures must be current */
    if (wager.kind === "outright" && wager.pickTeam) {
      const d = state.draws[ev.id];
      if (!d || d.id !== wager.drawId) return err("Draw changed, re-pick");
    }
    if (wager.kind === "match") {
      const d = state.draws[ev.id];
      if (!d || d.id !== wager.drawId) return err("Draw changed, re-pick");
      const m = state.brackets[ev.id]?.rounds?.[wager.match?.[0]]?.[wager.match?.[1]];
      if (!m) return err("No such matchup");
      if (m.winner !== null && m.winner !== undefined) return err("Matchup already decided");
    }
    /* back anyone, but never the side facing your own team */
    const drawG = state.draws[ev.id];
    const myTeamIdx = drawG ? drawG.teams.findIndex(t => t.players.includes(player)) : -1;
    if (myTeamIdx >= 0) {
      const AGAINST = "You can't bet against your own team";
      if (wager.kind === "outright" && wager.pickTeam && drawG.teams.length === 2
          && !(wager.pickPlayers || []).includes(player))
        return err(AGAINST);
      if (wager.kind === "match" && wager.teamIdx !== myTeamIdx) {
        const br = state.brackets[ev.id];
        const mu = br?.rounds?.[wager.match?.[0]]?.[wager.match?.[1]];
        if (mu && (resolveSlot(br, mu.a) === myTeamIdx || resolveSlot(br, mu.b) === myTeamIdx))
          return err(AGAINST);
      }
      if (wager.kind === "stage" && state.stages[ev.id]?.entrantType === "team" && wager.pickKey !== myTeamIdx) {
        const st = state.stages[ev.id];
        const inPlay = wager.final
          ? (stageFinalists(st) || []).includes(myTeamIdx)
          : (st.groups?.[wager.group]?.entrants || []).includes(myTeamIdx);
        if (inPlay) return err(AGAINST);
      }
    }
    if (wager.kind === "stage") {
      const st = state.stages[ev.id];
      if (!st || st.id !== wager.stagesId) return err("Stage changed, re-pick");
      if (wager.final) {
        if (!stageFinalists(st)) return err("Finalists not set");
        if (st.finalWinner !== null && st.finalWinner !== undefined) return err("Final already decided");
      } else {
        const g = st.groups[wager.group];
        if (!g) return err("No such group");
        if ((g.through || []).length >= st.advance) return err("Group already decided");
        if ((g.through || []).includes(wager.pickKey)) return err("Already through");
      }
    }
    const w = {
      kind: wager.kind, eventId: wager.eventId, evName: wager.evName,
      pick: wager.pick, pickPlayers: wager.pickPlayers, pickTeam: !!wager.pickTeam,
      drawId: wager.drawId, match: wager.match, matchName: wager.matchName, teamIdx: wager.teamIdx,
      stagesId: wager.stagesId, group: wager.group, groupName: wager.groupName,
      final: !!wager.final, pickKey: wager.pickKey,
      stake, status: "open", player,
      id: "w" + Date.now() + Math.floor(Math.random() * 9999), ts: Date.now(),
    };
    state.wagers.unshift(w);
    return ok();
  },
  voidWager(state, { id }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const w = state.wagers.find(x => x.id === id);
    if (!w) return err("No such wager");
    w.status = "void";
    return ok();
  },

  /* ── GM: results ── */
  saveResult(state, { evId, slots }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const ev = allEventsOf(state).find(e => e.id === evId);
    if (!ev) return err("No such event");
    if (!Array.isArray(slots) || !slots[0]?.length) return err("Winners required");
    state.results[evId] = { slots, ts: Date.now() };
    if (state.onDeck === evId) state.onDeck = null;
    return ok();
  },
  clearResult(state, { evId }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    delete state.results[evId];
    return ok();
  },

  /* ── GM: slate ── */
  setOnDeck(state, { id }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    state.onDeck = id || null;
    return ok();
  },
  shelve(state, { id, on }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    if (on) state.shelved[id] = true; else delete state.shelved[id];
    if (on && state.onDeck === id) state.onDeck = null;
    return ok();
  },
  addEvent(state, { ev }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    if (!ev?.name?.trim()) return err("Name required");
    state.customEvents.push({ ...ev, custom: true });
    return ok();
  },
  removeEvent(state, { id }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const ev = state.customEvents.find(e => e.id === id);
    if (!ev) return err("Only added events can be removed");
    const snapshot = {
      ev, result: state.results[id], draw: state.draws[id], bracket: state.brackets[id],
      stages: state.stages[id], shelved: !!state.shelved[id],
      wagers: state.wagers.filter(w => w.eventId === id),
    };
    state.customEvents = state.customEvents.filter(e => e.id !== id);
    delete state.results[id]; delete state.draws[id]; delete state.brackets[id];
    delete state.stages[id]; delete state.shelved[id];
    state.wagers = state.wagers.filter(w => w.eventId !== id);
    if (state.onDeck === id) state.onDeck = null;
    return ok({ snapshot });
  },
  editEvent(state, { id, patch }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    if (!allEventsOf(state).find(e => e.id === id)) return err("No such event");
    const clean = {};
    if (patch?.name !== undefined) {
      const n = String(patch.name).trim();
      if (!n) return err("Name required");
      clean.name = n.slice(0, 28);
    }
    if (patch?.desc !== undefined) clean.desc = String(patch.desc).trim().slice(0, 300);
    if (patch?.value !== undefined) {
      const v = Number(patch.value);
      if (!AWARDS[v]) return err("Bad value");
      clean.value = v;
    }
    if (patch?.session !== undefined) {
      if (patch.session !== null && !SESSIONS.find(s => s.id === patch.session)) return err("Bad session");
      clean.session = patch.session;
    }
    if (!Object.keys(clean).length) return err("Nothing to change");
    const custom = state.customEvents.find(e => e.id === id);
    if (custom) Object.assign(custom, clean);
    else state.eventEdits = { ...(state.eventEdits || {}), [id]: { ...(state.eventEdits?.[id] || {}), ...clean } };
    return ok();
  },
  reorderEvents(state, { ids }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    if (!Array.isArray(ids) || ids.length > 40 || !ids.every(x => typeof x === "string")) return err("Bad order");
    state.eventOrder = ids;
    return ok();
  },
  restoreEvent(state, { snapshot }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const u = snapshot; if (!u?.ev?.id) return err("Nothing to restore");
    if (state.customEvents.find(e => e.id === u.ev.id)) return err("Already restored");
    state.customEvents.push(u.ev);
    if (u.result) state.results[u.ev.id] = u.result;
    if (u.draw) state.draws[u.ev.id] = u.draw;
    if (u.bracket) state.brackets[u.ev.id] = u.bracket;
    if (u.stages) state.stages[u.ev.id] = u.stages;
    if (u.shelved) state.shelved[u.ev.id] = true;
    state.wagers = [...(u.wagers || []), ...state.wagers];
    return ok();
  },

  /* ── GM: draws, brackets, stages ── */
  runDraw(state, { evId, method, players }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const ev = allEventsOf(state).find(e => e.id === evId);
    if (!ev?.teamCfg) return err("Not a team event");
    const draw = drawTeams(ev, method, state.seeds || {}, players);
    if (!draw) return err("Draw failed");
    state.draws[evId] = draw;
    delete state.stages[evId];
    if (ev.teamCfg.bracket && draw.teams.length === ev.teamCfg.bracket)
      state.brackets[evId] = makeBracket(ev.teamCfg.bracket);
    else delete state.brackets[evId];
    return ok();
  },
  clearDraw(state, { evId }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    delete state.draws[evId]; delete state.brackets[evId]; delete state.stages[evId];
    return ok();
  },
  pickBracketWinner(state, { evId, r, m, teamIdx }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const br = state.brackets[evId]; if (!br?.rounds?.[r]?.[m]) return err("No such matchup");
    br.rounds[r][m].winner = teamIdx;
    for (let rr = r + 1; rr < br.rounds.length; rr++) br.rounds[rr].forEach(match => { match.winner = null; });
    return ok();
  },
  runStages(state, { evId, cfg }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const ev = allEventsOf(state).find(e => e.id === evId);
    if (!ev) return err("No such event");
    const skillOf = p => (state.seeds?.[p]?.[ev.sport] ?? 2) + (Math.random() * 0.6 - 0.3);
    let entrantType, keys, drawId = null;
    if (cfg.kind === "heats") {
      entrantType = "solo"; keys = cfg.players;
      if (!Array.isArray(keys) || keys.length < 2) return err("Not enough players");
    } else {
      const draw = state.draws[evId]; if (!draw) return err("Draw teams first");
      entrantType = "team"; keys = draw.teams.map((_, i) => i); drawId = draw.id;
    }
    const skill = entrantType === "solo" ? skillOf
      : i => { const t = state.draws[evId].teams[i]; return t.players.reduce((s, p) => s + skillOf(p), 0) / t.players.length; };
    const groups = splitIntoGroups(keys, cfg.nGroups, cfg.method, skill)
      .map((entrants, i) => ({ name: cfg.kind === "heats" ? `Heat ${i + 1}` : `Pool ${"ABCD"[i] || i + 1}`, entrants, through: [] }));
    state.stages[evId] = { id: "s" + Date.now(), eventId: evId, kind: cfg.kind, entrantType, drawId,
      advance: cfg.advance === 2 ? 2 : 1, groups, finalWinner: null, ts: Date.now() };
    return ok();
  },
  clearStages(state, { evId }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    delete state.stages[evId];
    return ok();
  },
  toggleThrough(state, { evId, g: gi, key }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const st = state.stages[evId]; const grp = st?.groups?.[gi];
    if (!grp) return err("No such group");
    grp.through = grp.through || [];
    if (grp.through.includes(key)) grp.through = grp.through.filter(k => k !== key);
    else if (grp.through.length < st.advance) grp.through.push(key);
    st.finalWinner = null;
    return ok();
  },
  setFinalWinner(state, { evId, key }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const st = state.stages[evId]; if (!st) return err("No stages");
    st.finalWinner = st.finalWinner === key ? null : key;
    return ok();
  },

  /* ── captains draft (GM sets up + can override; on-clock captain picks) ── */
  startDraft(state, { evId, captains, players }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const ev = allEventsOf(state).find(e => e.id === evId);
    if (!ev?.teamCfg || ev.kind !== "team") return err("Not a team event");
    if (state.draws[evId]) return err("Teams already set, clear them first");
    if (!Array.isArray(captains) || captains.length !== ev.teamCfg.teams) return err("Pick one captain per team");
    if (new Set(captains).size !== captains.length) return err("A captain is listed twice");
    const pool = (players || []).filter(p => ROSTER.includes(p));
    if (!captains.every(c => pool.includes(c))) return err("Captains must be in the playing pool");
    state.drafts = state.drafts || {};
    state.drafts[evId] = {
      id: "df" + Date.now(), method: "draft", ts: Date.now(),
      teams: captains.map(c => ({ captain: c, players: [c] })),
      pool: pool.filter(p => !captains.includes(p)),
      picks: [],
    };
    return ok();
  },
  pickDraftPlayer(state, { evId, player }, ctx) {
    const d = state.drafts?.[evId]; if (!d) return err("No draft running");
    if (!d.pool.includes(player)) return err("Player not available");
    const team = snakeTeam(d.picks.length, d.teams.length);
    const cur = d.teams[team].captain;
    if (!ctx.isGm && ctx.player !== cur) return err("Not your pick");
    d.teams[team].players.push(player);
    d.pool = d.pool.filter(p => p !== player);
    d.picks.push({ team, player });
    return ok();
  },
  undoDraftPick(state, { evId }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const d = state.drafts?.[evId]; if (!d) return err("No draft running");
    const last = d.picks.pop(); if (!last) return err("Nothing to undo");
    d.teams[last.team].players = d.teams[last.team].players.filter(p => p !== last.player);
    d.pool.push(last.player);
    return ok();
  },
  finalizeDraft(state, { evId }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const ev = allEventsOf(state).find(e => e.id === evId);
    const d = state.drafts?.[evId]; if (!ev || !d) return err("No draft running");
    if (d.pool.length) return err("Pool not empty yet");
    const mascots = (ev.teamCfg.size || 0) >= 3 ? shuffle(TEAM_NAMES) : null;
    state.draws[evId] = { id: "d" + Date.now(), method: "draft", ts: Date.now(),
      teams: d.teams.map((t, i) => mascots ? { players: t.players, name: mascots[i % mascots.length] } : { players: t.players }) };
    delete state.stages[evId];
    if (ev.teamCfg.bracket && state.draws[evId].teams.length === ev.teamCfg.bracket)
      state.brackets[evId] = makeBracket(ev.teamCfg.bracket);
    else delete state.brackets[evId];
    delete state.drafts[evId];
    return ok();
  },
  cancelDraft(state, { evId }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    if (state.drafts) delete state.drafts[evId];
    return ok();
  },

  /* ── GM: board ── */
  adjust(state, { player, delta, reason }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    if (!ROSTER.includes(player) || !delta) return err("Bad ruling");
    state.adjustments.unshift({ id: "a" + Date.now(), player, delta, reason: reason || "", ts: Date.now() });
    return ok();
  },
  setFrozen(state, { f }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    state.frozen = !!f;
    return ok();
  },
  rerunOnboarding(state, {}, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    state.onboardEpoch = (state.onboardEpoch || 0) + 1;
    return ok();
  },
  setLive(state, { on }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    state.live = !!on;
    return ok();
  },
  /* resets wipe the game, never the people: profiles (names, photos, numbers,
     sizes) and sealed seeds survive so nobody re-registers between test runs */
  resetTournament(state, {}, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const profiles = state.profiles, seeds = state.seeds;
    Object.assign(state, structuredClone(EMPTY_STATE));
    state.profiles = profiles;
    state.seeds = seeds;
    return ok();
  },
};

export function applyAction(state, type, payload, ctx) {
  const handler = ACTIONS[type];
  if (!handler) return { ok: false, error: `Unknown action: ${type}` };
  try { return handler(state, payload || {}, ctx); }
  catch (e) { return { ok: false, error: "Action failed: " + (e?.message || e) }; }
}
