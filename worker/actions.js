/* Every state mutation lives here and runs inside the Durable Object.
   Handlers mutate `state` in place and return { ok } or { ok:false, error }.
   Optionally { extra } rides back on the ack (e.g. undo snapshots).
   ctx = { isGm, player } where player is the roster name this device claimed. */

import {
  ROSTER, AWARDS, PT, MAX_RISK, BUYIN_FLOOR, maxRisk, CHIP_MIN, cleanLeg, cleanLogistics, SESSIONS, EMPTY_STATE, SIZES, CHIP_COLORS, CHIP_SKINS, SPORTS, RATINGS, TEAM_NAMES, allEventsOf, disp, resolveWager, computeStandings, atRisk,
  drawTeams, splitIntoGroups, strengthMap, makeBracket, stageFinalists, shuffle, snakeTeam, resolveSlot, OUTRIGHT_MULT,
  DUEL_STAKE, DUEL_GAMES, resolveDuel, pokerLive, stacksPosted, pokerLevels,
} from "../shared/core.js";

const ok = extra => ({ ok: true, extra });
const err = (error, extra) => ({ ok: false, error, extra });
const gmOnly = ctx => (ctx.isGm ? null : err("Commissioner only"));

export const ACTIONS = {
  /* ── identity / profile ── */
  saveProfile(state, { player, display, num, size, flightIn, flightOut }, ctx) {
    if (!ROSTER.includes(player)) return err("Unknown player");
    if (player !== ctx.player && !ctx.isGm) return err("Not your profile");
    if (typeof display !== "string" || !display.trim()) return err("Name required");
    const prof = { ...(state.profiles[player] || {}), display: display.trim().slice(0, 16) };
    /* travel legs are structured and validated by the same helper the client
       renders from, so a leg can never be half-parsed on one side only */
    for (const [k, v] of [["flightIn", flightIn], ["flightOut", flightOut]]) {
      if (v === undefined) continue;
      const leg = cleanLeg(v);
      if (leg === undefined) return err("Bad flight");
      if (leg === null) delete prof[k]; else prof[k] = leg;
    }
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
  /* chip identity: color is a first-come-first-serve claim, skin repeats
     freely. Both lock when the weekend goes live so the board stays learnable. */
  pickChip(state, { player, color, skin }, ctx) {
    if (!ROSTER.includes(player)) return err("Unknown player");
    if (player !== ctx.player && !ctx.isGm) return err("Not your chip");
    const prof = { ...(state.profiles[player] || {}) };
    if (color !== undefined) {
      if (state.live && !ctx.isGm && color !== prof.color) return err("Chips locked for the weekend");
      if (color === null) delete prof.color;
      else {
        if (!CHIP_COLORS.find(c => c.hex === color)) return err("Bad color");
        const taken = Object.entries(state.profiles).find(([p, pr]) => p !== player && pr?.color === color);
        if (taken) return err(`${disp(state, taken[0])} already has that color`);
        prof.color = color;
      }
    }
    if (skin !== undefined) {
      if (state.live && !ctx.isGm && skin !== prof.skin) return err("Chips locked for the weekend");
      if (skin === null) delete prof.skin;
      else if (!CHIP_SKINS.includes(skin)) return err("Bad skin");
      else prof.skin = skin;
    }
    state.profiles[player] = prof;
    return ok();
  },
  saveSeeds(state, { player, ratings }, ctx) {
    if (!ROSTER.includes(player)) return err("Unknown player");
    if (player !== ctx.player && !ctx.isGm) return err("Not your ratings");
    /* only known sports, only known rating values: junk here would silently
       poison every balanced draw via NaN strengths */
    if (typeof ratings !== "object" || ratings === null) return err("Bad ratings");
    const clean = {};
    for (const sp of SPORTS) {
      if (ratings[sp.id] === undefined) continue;
      const v = Number(ratings[sp.id]);
      if (!RATINGS.some(r => r.v === v)) return err("Bad rating");
      clean[sp.id] = v;
    }
    state.seeds[player] = clean;
    return ok();
  },

  /* ── wagers (players) ── */
  placeWager(state, { wager }, ctx) {
    const player = ctx.player;
    if (!player) return err("Check in first");
    if (state.frozen) return err("The board is frozen");
    if (pokerLive(state)) return err("The finale is live");
    if (stacksPosted(state)) return err("The finale is settled");
    const events = allEventsOf(state);
    const ev = events.find(e => e.id === wager.eventId);
    if (!ev) return err("No such event");
    if (state.onDeck !== ev.id) return err("Betting is closed for this event");
    if (state.results[ev.id]) return err("Result already posted");
    const stake = Math.floor(Number(wager.stake));
    if (!(Number.isInteger(stake) && stake % PT === 0 && stake >= PT))
      return err("Stakes move in 100s");
    /* exposure + balance, computed server side; the cap scales with the
       stack (half your points, never capped under 500) so bets keep pace
       as the weekend inflates */
    const pts = computeStandings(state).find(r => r.player === player)?.pts ?? 0;
    const exp = atRisk(state, player, events);
    /* balance first: an empty stack should hear "not enough points", not a
       cap message. Live duel antes count against the balance too, same as
       sendDuel counts wager exposure. */
    const antes = (state.duels || [])
      .filter(d => d.status === "open" && !resolveDuel(d).settled && (d.from === player || d.to === player))
      .reduce((s, d) => s + d.stake, 0);
    if (stake > pts - exp - antes) return err("Not enough points");
    const cap = maxRisk(pts);
    if (exp + stake > cap) return err(`Max ${cap} at risk`);
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
  /* pull your own chip back while the market is still open */
  retractWager(state, { id }, ctx) {
    const w = state.wagers.find(x => x.id === id);
    if (!w) return err("No such wager");
    if (w.player !== ctx.player && !ctx.isGm) return err("Not your wager");
    if (state.frozen) return err("The board is frozen");
    if (pokerLive(state)) return err("The finale is live");
    if (state.onDeck !== w.eventId) return err("Betting is closed");
    const r = resolveWager(state, w, allEventsOf(state));
    if (r.status !== "pending") return err("Already settled");
    state.wagers = state.wagers.filter(x => x.id !== id);
    return ok();
  },
  voidWager(state, { id }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const w = state.wagers.find(x => x.id === id);
    if (!w) return err("No such wager");
    w.status = "void";
    return ok();
  },

  /* ── duels (players) ──
     A duel is a phone minigame between two players. Both ante DUEL_STAKE at
     send time; each plays a run whenever they want; settlement is derived from
     the two runs in computeStandings, never stored. */
  sendDuel(state, { to, game, stake: want }, ctx) {
    const from = ctx.player;
    if (!from) return err("Check in first");
    if (state.frozen) return err("The board is frozen");
    /* no duels before the weekend: everyone is on 1,000 until Friday, which is
       what the invite promises, and the locker room shows no points for a
       result to land on */
    if (!state.live) return err("Duels open when the weekend starts");
    if (pokerLive(state)) return err("The finale is live");
    if (stacksPosted(state)) return err("The finale is settled");
    if (!ROSTER.includes(to)) return err("Unknown player");
    if (to === from) return err("Pick someone else");
    const g = game || "quickdraw";
    if (!DUEL_GAMES[g]) return err("Unknown game");
    state.duels = state.duels || [];
    const live = state.duels.filter(d => d.status === "open" && !resolveDuel(d).settled);
    if (live.find(d => (d.from === from && d.to === to) || (d.from === to && d.to === from)))
      return err(`You already have a duel going with ${disp(state, to)}`);
    const day = 24 * 60 * 60 * 1000;
    if (state.duels.filter(d => d.from === from && d.status !== "declined" && d.ts > Date.now() - day).length >= 3)
      return err("Three challenges a day, max");
    /* the challenger names the ante; both sides put up the same amount, so it
       is bounded by whichever of the two can cover less */
    const stake = want === undefined ? DUEL_STAKE : Math.floor(Number(want));
    if (!(Number.isInteger(stake) && stake % PT === 0 && stake >= PT))
      return err("Antes move in 100s");
    /* both antes must be covered: points minus wager exposure minus live duel antes */
    const events = allEventsOf(state);
    const rows = computeStandings(state);
    const ptsOf = p => rows.find(r => r.player === p)?.pts ?? 0;
    const spendable = p => ptsOf(p) - atRisk(state, p, events)
      - live.filter(d => d.from === p || d.to === p).reduce((s, d) => s + d.stake, 0);
    /* the wager cap covers duels too, or a duel would be a way around it */
    if (stake > maxRisk(ptsOf(from))) return err(`Max ${maxRisk(ptsOf(from))} at risk`);
    if (stake > maxRisk(ptsOf(to))) return err(`${disp(state, to)} can't cover that ante`);
    if (spendable(from) < stake) return err("Not enough points");
    if (spendable(to) < stake) return err(`${disp(state, to)} can't cover that ante`);
    state.duels.unshift({ id: "du" + Date.now() + Math.floor(Math.random() * 9999), game: g,
      from, to, stake, status: "open", runs: {}, ts: Date.now() });
    return ok();
  },
  playDuel(state, { id, ms, foul }, ctx) {
    const p = ctx.player;
    if (!p) return err("Check in first");
    if (state.frozen) return err("The board is frozen");
    if (pokerLive(state)) return err("The finale is live");
    if (stacksPosted(state)) return err("The finale is settled");
    const d = (state.duels || []).find(x => x.id === id);
    if (!d) return err("No such duel");
    if (d.status !== "open") return err("Duel is closed");
    if (p !== d.from && p !== d.to) return err("Not your duel");
    if (d.runs[p]) return err("You already drew");
    const f = !!foul;
    const m = Math.round(Number(ms));
    if (!f && !(m >= 80 && m <= 5000)) return err("Bad time");
    d.runs[p] = { ms: f ? null : m, foul: f, ts: Date.now() };
    return ok();
  },
  declineDuel(state, { id }, ctx) {
    const d = (state.duels || []).find(x => x.id === id);
    if (!d) return err("No such duel");
    if (d.status !== "open") return err("Already closed");
    if (ctx.player !== d.to && !ctx.isGm) return err("Not your duel");
    if (Object.keys(d.runs).length) return err("Already in play");
    d.status = "declined";
    return ok();
  },
  voidDuel(state, { id }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const d = (state.duels || []).find(x => x.id === id);
    if (!d) return err("No such duel");
    d.status = "void";
    return ok();
  },

  /* ── GM: results ── */
  saveResult(state, { evId, slots }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const ev = allEventsOf(state).find(e => e.id === evId);
    if (!ev) return err("No such event");
    if (ev.game === "poker" && ev.finale) return err("Enter chip counts instead");
    if (!Array.isArray(slots) || !slots[0]?.length) return err("Winners required");
    if (slots.length > 3 || !slots.every(s => Array.isArray(s) && s.every(p => ROSTER.includes(p))))
      return err("Bad slots");
    state.results[evId] = { slots: slots.map(s => [...s]), ts: Date.now() };
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
    if (id && allEventsOf(state).find(e => e.id === id)?.game === "poker")
      return err("No betting on the finale");
    if (id && stacksPosted(state)) return err("The finale is settled");
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
    if (typeof ev.id !== "string" || !ev.id) return err("Bad event");
    if (allEventsOf(state).find(e => e.id === ev.id)) return err("Event id taken");
    if (!AWARDS[ev.value]) return err("Bad value");
    state.customEvents.push({ ...ev, name: String(ev.name).trim().slice(0, 28), custom: true });
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
    /* the snapshot round-trips through the client: never let it smuggle a
       stacks result (which would override the whole board) or junk wagers */
    if (u.result?.stacks) return err("Bad snapshot");
    state.customEvents.push(u.ev);
    if (u.result) state.results[u.ev.id] = u.result;
    if (u.draw) state.draws[u.ev.id] = u.draw;
    if (u.bracket) state.brackets[u.ev.id] = u.bracket;
    if (u.stages) state.stages[u.ev.id] = u.stages;
    if (u.shelved) state.shelved[u.ev.id] = true;
    state.wagers = [...(Array.isArray(u.wagers) ? u.wagers : []), ...state.wagers];
    return ok();
  },

  /* ── GM: draws, brackets, stages ── */
  /* one draw: balanced on live strength (sealed survey + board + results),
     recursively refined server-side in drawTeams */
  runDraw(state, { evId, players }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const ev = allEventsOf(state).find(e => e.id === evId);
    if (!ev?.teamCfg) return err("Not a team event");
    if (!Array.isArray(players)) return err("Not enough players");
    players = [...new Set(players.filter(p => ROSTER.includes(p)))];
    if (players.length < 2) return err("Not enough players");
    const draw = drawTeams(ev, state, players);
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
    const match = br.rounds[r][m];
    const a = resolveSlot(br, match.a), b = resolveSlot(br, match.b);
    if (teamIdx !== a && teamIdx !== b) return err("Not in this matchup");
    br.rounds[r][m].winner = teamIdx;
    for (let rr = r + 1; rr < br.rounds.length; rr++) br.rounds[rr].forEach(match => { match.winner = null; });
    return ok();
  },
  runStages(state, { evId, cfg }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const ev = allEventsOf(state).find(e => e.id === evId);
    if (!ev) return err("No such event");
    if (!cfg || !Number.isInteger(cfg.nGroups) || cfg.nGroups < 2 || cfg.nGroups > 4)
      return err("Bad stage setup");
    let entrantType, keys, drawId = null;
    if (cfg.kind === "heats") {
      entrantType = "solo"; keys = [...new Set((cfg.players || []).filter(p => ROSTER.includes(p)))];
      if (keys.length < 2) return err("Not enough players");
    } else {
      const draw = state.draws[evId]; if (!draw) return err("Draw teams first");
      entrantType = "team"; keys = draw.teams.map((_, i) => i); drawId = draw.id;
    }
    /* same live strength model as the team draw; teams average their players */
    const solo = strengthMap(state, entrantType === "solo" ? keys : ROSTER, ev.sport);
    const strength = entrantType === "solo" ? k => solo[k]
      : i => { const t = state.draws[evId].teams[i]; return t.players.reduce((s, p) => s + (solo[p] ?? 0.5), 0) / t.players.length; };
    const groups = splitIntoGroups(keys, cfg.nGroups, strength)
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
    if (!grp.entrants.includes(key)) return err("Not in this group");
    grp.through = grp.through || [];
    if (grp.through.includes(key)) grp.through = grp.through.filter(k => k !== key);
    else if (grp.through.length < st.advance) grp.through.push(key);
    st.finalWinner = null;
    return ok();
  },
  setFinalWinner(state, { evId, key }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const st = state.stages[evId]; if (!st) return err("No stages");
    if (!(stageFinalists(st) || []).includes(key)) return err("Not a finalist");
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

  /* ── the poker finale: the app runs the table, the cards stay physical ── */
  pokerSetup(state, {}, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const ev = allEventsOf(state).find(e => e.finale && e.game === "poker");
    if (!ev) return err("No poker finale on the slate");
    if (state.shelved[ev.id]) return err("The finale is shelved");
    if (state.results[ev.id]) return err("Result already posted");
    if (state.poker) return err("Table already set");
    /* the buy-in snapshot must match the board exactly: nothing may still be
       able to move points after stacks are dealt */
    const events = allEventsOf(state);
    if ((state.wagers || []).some(w => resolveWager(state, w, events).status === "pending"))
      return err("Settle or void the open wagers first");
    if ((state.duels || []).some(d => d.status === "open" && !resolveDuel(d).settled))
      return err("Settle or void the open duels first");
    let rows = computeStandings(state);
    if (rows.some(r => r.pts < 0)) return err("Negative stacks, fix rulings first");
    /* nobody rails the finale: anyone under 60 is staked up to 60, logged
       as a ruling so the board shows where the chips came from. pokerCancel
       reverts these, so a cancel-and-reset never grants twice. */
    rows.filter(r => r.pts < BUYIN_FLOOR).forEach(r => {
      state.adjustments.unshift({ id: "a" + Date.now() + "-" + r.player, player: r.player,
        delta: BUYIN_FLOOR - r.pts, reason: "Minimum stack", ts: Date.now() });
    });
    rows = computeStandings(state);
    state.poker = { id: ev.id, total: rows.reduce((s, r) => s + r.pts, 0),
      startedAt: null, levels: pokerLevels(), levelOffset: 0, outs: [], counts: {}, ts: Date.now() };
    return ok();
  },
  pokerStart(state, {}, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    if (!state.poker) return err("Set up the table first");
    if (state.poker.startedAt) return err("Cards are already live");
    state.poker.startedAt = Date.now();
    state.onDeck = null;
    return ok();
  },
  pokerLevel(state, { delta }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const pk = state.poker;
    if (!pk?.startedAt) return err("Clock is not running");
    const d = delta > 0 ? 1 : -1;
    pk.levelOffset = Math.max(-(pk.levels.length - 1), Math.min(pk.levels.length - 1, (pk.levelOffset || 0) + d));
    return ok();
  },
  /* busting is self-serve: you tap out on your own phone. GM can do anyone. */
  pokerBust(state, { player }, ctx) {
    const pk = state.poker;
    if (!pk?.startedAt) return err("Cards are not live");
    if (state.results[pk.id]) return err("Counts are posted");
    if (!ROSTER.includes(player)) return err("Unknown player");
    if (player !== ctx.player && !ctx.isGm) return err("Only you can bust yourself");
    if (pk.outs.find(o => o.player === player)) return err("Already out");
    pk.outs.push({ player, ts: Date.now() });
    delete pk.counts?.[player];
    return ok();
  },
  pokerUnbust(state, { player }, ctx) {
    const pk = state.poker;
    if (!pk?.startedAt) return err("Cards are not live");
    if (state.results[pk.id]) return err("Counts are posted");
    if (!ROSTER.includes(player)) return err("Unknown player");
    if (player !== ctx.player && !ctx.isGm) return err("Not your seat");
    pk.outs = pk.outs.filter(o => o.player !== player);
    return ok();
  },
  /* counting is self-serve and parallel: everyone submits their own stack,
     editable until the GM posts. GM can enter or fix anyone's. */
  pokerCount(state, { player, count }, ctx) {
    const pk = state.poker;
    if (!pk?.startedAt) return err("Cards are not live");
    if (state.results[pk.id]) return err("Counts are posted");
    if (!ROSTER.includes(player)) return err("Unknown player");
    if (player !== ctx.player && !ctx.isGm) return err("Count your own stack");
    if (pk.outs.find(o => o.player === player)) return err("You are out, your count is 0");
    const c = Math.floor(Number(count));
    if (!Number.isFinite(c) || c < 0) return err("Counts are 0 or more");
    if (c % CHIP_MIN !== 0) return err("Counts move in 25s");
    pk.counts = pk.counts || {};
    pk.counts[player] = c;
    return ok();
  },
  /* posting reads the collected counts; outs are 0. Sum mismatches are
     allowed (chips get miscounted); the client shows the discrepancy. */
  pokerResult(state, {}, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const pk = state.poker;
    if (!pk?.startedAt) return err("Cards are not live");
    const outSet = new Set(pk.outs.map(o => o.player));
    const missing = ROSTER.filter(p => !outSet.has(p) && pk.counts?.[p] === undefined);
    if (missing.length) return err(`Waiting on ${missing.map(p => disp(state, p)).join(", ")}`);
    const clean = {};
    ROSTER.forEach(p => { clean[p] = outSet.has(p) ? 0 : pk.counts[p]; });
    const max = Math.max(...Object.values(clean));
    if (max <= 0) return err("Every count is 0");
    const leaders = ROSTER.filter(p => clean[p] === max);
    state.results[pk.id] = { slots: [[...leaders], [], []], stacks: clean,
      outs: pk.outs.map(o => o.player), ts: Date.now() };
    return ok();
  },
  pokerCancel(state, {}, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    if (!state.poker) return err("No table set");
    if (state.results[state.poker.id]) return err("Clear the result first");
    /* the table stakes grants belonged to this table */
    state.adjustments = state.adjustments.filter(a => a.reason !== "Minimum stack");
    state.poker = null;
    return ok();
  },

  /* ── GM: board ── */
  adjust(state, { player, delta, reason }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    if (!ROSTER.includes(player) || !delta) return err("Bad ruling");
    if (!Number.isInteger(delta) || Math.abs(delta) > 100000) return err("Bad ruling");
    /* the board moves in 100s all weekend; once the finale counts post the
       standings are exact chip counts, so corrections move in 25s instead */
    if (stacksPosted(state)) {
      if (delta % CHIP_MIN !== 0) return err("Counts move in 25s");
    } else if (delta % PT !== 0) return err("Rulings move in 100s");
    if (pokerLive(state)) return err("The finale is live, correct it after the count");
    state.adjustments.unshift({ id: "a" + Date.now() + "-" + player, player, delta,
      reason: String(reason || "").slice(0, 80), ts: Date.now() });
    return ok();
  },
  setFrozen(state, { f }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    state.frozen = !!f;
    return ok();
  },
  /* replaying the intro re-opens the chip race: colors go back on the board so
     the claim is first come first serve again. Never mid-weekend, when the
     board has already taught everyone whose color is whose. */
  /* Reruns re-open the chip race, which is the ONLY thing in the app that
     throws away something a guest chose. Once the invite is out and real
     people have checked in, that has to be deliberate: the server refuses
     without an explicit force, so a stray call or a fat finger cannot do it.
     `signedUp` is also handed back so the GM sees who it costs. */
  rerunOnboarding(state, { force }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const signedUp = ROSTER.filter(p => {
      const pr = state.profiles?.[p];
      return !!(pr && (pr.size || pr.flightIn || pr.flightOut || pr.color || pr.skin
        || pr.photoV || state.seeds?.[p]));
    });
    if (signedUp.length && !force)
      return err(`${signedUp.length} checked in already`, { signedUp });
    state.onboardEpoch = (state.onboardEpoch || 0) + 1;
    if (!state.live) {
      for (const p of Object.keys(state.profiles || {})) {
        delete state.profiles[p].color;
        delete state.profiles[p].skin;
      }
    }
    return ok({ signedUp });
  },
  setLive(state, { on }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    state.live = !!on;
    return ok();
  },
  /* resets wipe the game, never the people: profiles (names, photos, numbers,
     sizes, flights), sealed seeds, and weekend logistics survive so nobody
     re-registers between test runs */
  resetTournament(state, {}, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const profiles = state.profiles, seeds = state.seeds, logistics = state.logistics;
    /* the epoch only ever climbs: devices store the epoch they finished at,
       so a reset that zeroed it would make every future rerun invisible */
    const onboardEpoch = state.onboardEpoch || 0;
    Object.assign(state, structuredClone(EMPTY_STATE));
    state.profiles = profiles;
    state.seeds = seeds;
    state.onboardEpoch = onboardEpoch;
    if (logistics) state.logistics = logistics;
    return ok();
  },
  /* the weekend sheet: where we sleep and how the host flies. GM writes it
     once, onboarding and the guide read it on every phone */
  saveLogistics(state, patch, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const clean = cleanLogistics(state.logistics);
    const FIELDS = [["venue", 140], ["venueNote", 240], ["airport", 8], ["airportName", 60],
      ["checkIn", 40], ["checkOut", 40]];
    for (const [k, max] of FIELDS) {
      const v = patch?.[k];
      if (v === undefined) continue;
      if (typeof v !== "string") return err("Bad text");
      clean[k] = v.trim().slice(0, max);
    }
    for (const k of ["hostIn", "hostOut"]) {
      if (patch?.[k] === undefined) continue;
      const leg = cleanLeg(patch[k]);
      if (leg === undefined) return err("Bad flight");
      if (leg === null) delete clean[k]; else clean[k] = leg;
    }
    /* a save is edited through the same rules it was loaded through, so a
       cleared address comes back rather than leaving the invite with none */
    state.logistics = cleanLogistics(clean);
    return ok();
  },
};

export function applyAction(state, type, payload, ctx) {
  const handler = Object.hasOwn(ACTIONS, type) ? ACTIONS[type] : null;
  if (!handler) return { ok: false, error: `Unknown action: ${type}` };
  try { return handler(state, payload || {}, ctx); }
  catch (e) { return { ok: false, error: "Action failed: " + (e?.message || e) }; }
}
