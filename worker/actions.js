/* Every state mutation lives here and runs inside the Durable Object.
   Handlers mutate `state` in place and return { ok } or { ok:false, error }.
   Optionally { extra } rides back on the ack (e.g. undo snapshots).
   ctx = { isGm, player } where player is the roster name this device claimed. */

import {
  ROSTER, EMPTY_STATE, allEventsOf, resolveWager, computeStandings, atRisk,
  drawTeams, splitIntoGroups, makeBracket, stageFinalists, OUTRIGHT_MULT,
} from "../shared/core.js";

const ok = extra => ({ ok: true, extra });
const err = error => ({ ok: false, error });
const gmOnly = ctx => (ctx.isGm ? null : err("Commissioner only"));

export const ACTIONS = {
  /* ── identity / profile ── */
  saveProfile(state, { player, display }, ctx) {
    if (!ROSTER.includes(player)) return err("Unknown player");
    if (player !== ctx.player && !ctx.isGm) return err("Not your profile");
    if (typeof display !== "string" || !display.trim()) return err("Name required");
    state.profiles[player] = { ...(state.profiles[player] || {}), display: display.trim().slice(0, 16) };
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
  resetTournament(state, {}, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    Object.assign(state, structuredClone(EMPTY_STATE));
    return ok();
  },
};

export function applyAction(state, type, payload, ctx) {
  const handler = ACTIONS[type];
  if (!handler) return { ok: false, error: `Unknown action: ${type}` };
  try { return handler(state, payload || {}, ctx); }
  catch (e) { return { ok: false, error: "Action failed: " + (e?.message || e) }; }
}
