/* Every state mutation lives here and runs inside the Durable Object.
   Handlers mutate `state` in place and return { ok } or { ok:false, error }.
   Optionally { extra } rides back on the ack (e.g. undo snapshots).
   ctx = { isGm, player } where player is the roster name this device claimed. */

import {
  ALL_PLAYERS, ROSTER, isActivePlayer, AWARDS, PT, MAX_RISK, maxRisk, CHIP_MIN, cleanLeg, cleanLogistics, SESSIONS, EMPTY_STATE, SIZES, CHIP_COLORS, CHIP_SKINS, SPORTS, RATINGS, TEAM_NAMES, allEventsOf, disp, resolveWager, computeStandings, atRisk,
  drawTeams, splitIntoGroups, strengthMap, makeBracket, stageFinalists, shuffle, snakeTeam, draftTurn, resolveSlot, OUTRIGHT_MULT,
  DUEL_STAKE, DUEL_GAMES, DUEL_DAILY_LIMIT, resolveDuel, duelAccepted, duelPhase, duelOpen, duelReserve, duelRoom,
  duelBetween, duelsSentToday, pokerLive, stacksPosted, pokerLevels,
  validateEventParticipants, normalizeOverflowRoles,
  resolveEventLifecycle, resolveCurrentContest, contestBetEligibility, wagerMatchesContest, bracketChampion, resultReadiness, contestUndoAvailability,
  pokerDistribution,
  RESET_PROGRESS_CONFIRMATION, RESET_PROGRESS_PRESERVED_KEYS,
} from "../shared/core.js";
import {
  SHOW_TERMINAL_OUTCOMES,
  createShowScene,
  finishShowScene,
  showDefinition,
  validateShowSceneRequest,
} from "../shared/show.js";
import { validateSpotifyTrack } from "../shared/audio.js";

const ok = extra => ({ ok: true, extra });
const err = (error, extra) => ({ ok: false, error, extra });
const gmOnly = ctx => (ctx.isGm ? null : err("Commissioner only"));
const duelBoardClosed = state => state.frozen ? "The board is frozen"
  : pokerLive(state) ? "The finale is live"
    : stacksPosted(state) ? "The finale is settled" : null;
const showOnly = ctx => (ctx.showControl ? null : err("Show Control is unavailable"));
const showControlOf = state => {
  if (!state.showControl || typeof state.showControl !== "object")
    state.showControl = { active:null, history:[] };
  if (!Array.isArray(state.showControl.history)) state.showControl.history = [];
  return state.showControl;
};
const showCommandId = ctx =>
  typeof ctx?.actionId === "string" && ctx.actionId && ctx.actionId.length <= 120
    ? ctx.actionId : null;
const showCommandFingerprint = (...parts) => JSON.stringify(parts);
const showCommandReplay = (control, commandId, type, fingerprint) => {
  if (!commandId) return null;
  const records = [control.active, ...(control.history || [])].filter(Boolean);
  for (const record of records) {
    const command = (record.commands || []).find(item => item?.id === commandId);
    if (!command) continue;
    return command.type === type && command.fingerprint === fingerprint
      ? ok({ unchanged:true, sceneId:record.id, outcome:record.outcome })
      : err("Request id already used");
  }
  return null;
};
const rememberShowCommand = (record, commandId, type, fingerprint) => {
  record.commands = [...(Array.isArray(record.commands) ? record.commands : []),
    { id:commandId, type, fingerprint }].slice(-8);
};
/* Best-effort scene start inside a host mutation. Runs AFTER the official
   write and can only succeed or silently skip: an error returned from here
   would make the Durable Object discard the whole clone, so no code path
   may construct one. A scene already on its last step retires as completed,
   anything earlier as skipped; completed stays an advance-only outcome
   everywhere else. */
const tryStartScene = (state, ctx, request, now = Date.now()) => {
  if (!ctx?.showControl) return null;
  const checked = validateShowSceneRequest(state, request, allEventsOf(state));
  if (!checked.ok) return null;
  const control = showControlOf(state);
  if (control.active) {
    const definition = showDefinition(control.active.kind);
    const atLast = definition && control.active.step >= definition.steps.length - 1;
    finishShowScene(control, atLast ? "completed" : "skipped", now);
  }
  const revision = checked.definition.requiresResult
    ? Number(state.results?.[checked.request.eventId]?.revision || 1)
    : null;
  control.active = createShowScene(checked.request, {
    id:`show-${now}-${crypto.randomUUID()}`,
    now,
    revision,
  });
  return control.active;
};
const eventOp = (state, evId) => {
  state.eventOps = state.eventOps || {};
  state.eventOps[evId] = state.eventOps[evId] || {};
  return state.eventOps[evId];
};
const cleanCorrectionReason = value => String(value || "").trim().slice(0, 100);
const slotsEqual = (left, right) => JSON.stringify(left || []) === JSON.stringify(right || []);
const appendCorrection = (state, evId, entry) => {
  const op = eventOp(state, evId);
  op.corrections = [...(Array.isArray(op.corrections) ? op.corrections : []), entry].slice(-20);
};
const WAGER_OP_LIMIT = 2048;
const wagerRequestKey = ctx => {
  if (typeof ctx?.deviceId !== "string" || !ctx.deviceId || ctx.deviceId.length > 200
      || typeof ctx?.actionId !== "string" || !ctx.actionId || ctx.actionId.length > 120)
    return null;
  /* Prefixing keeps special object-property names inert in the persisted map. */
  return `request:${ctx.deviceId}:${ctx.actionId}`;
};
const wagerFingerprint = wager => JSON.stringify([
  wager?.kind,
  wager?.eventId,
  Math.floor(Number(wager?.stake)),
  wager?.pick,
  !!wager?.pickTeam,
  Array.isArray(wager?.pickPlayers) ? [...wager.pickPlayers].sort() : [],
  wager?.drawId,
  Array.isArray(wager?.match) ? wager.match : [],
  wager?.teamIdx,
  wager?.stagesId,
  wager?.group,
  !!wager?.final,
  wager?.pickKey,
  ...(wager?.contestId === undefined && wager?.contestRevision === undefined
    ? [] : [wager?.contestId, wager?.contestRevision]),
]);
const wagerTargetKey = wager => wager?.targetKey || JSON.stringify([
  wager?.kind,
  wager?.eventId,
  wager?.kind === "outright"
    ? (wager?.pickTeam
      ? ["team", wager?.drawId, [...(wager?.pickPlayers || [])].sort()]
      : ["player", wager?.pick])
    : wager?.kind === "match"
      ? ["match", wager?.drawId, wager?.match, wager?.teamIdx]
      : [wager?.kind, wager?.stagesId, !!wager?.final, wager?.group, wager?.pickKey],
]);
const samePlayers = (left, right) => Array.isArray(left) && Array.isArray(right)
  && left.length === right.length
  && [...left].sort().every((player, index) => player === [...right].sort()[index]);
const replayedWagerOp = (state, requestKey, actor, type, fingerprint) => {
  const prior = state.wagerOps?.[requestKey];
  if (!prior) return null;
  if (prior.actor !== actor || prior.type !== type || prior.fingerprint !== fingerprint)
    return err("Request id already used");
  return ok({
    unchanged:true,
    wagerId:prior.wagerId,
    stake:prior.stake,
    operation:prior.type,
  });
};
const rememberWagerOp = (state, requestKey, record) => {
  state.wagerOps = state.wagerOps || {};
  state.wagerOps[requestKey] = { ...record, at:Date.now() };
  const keys = Object.keys(state.wagerOps);
  if (keys.length <= WAGER_OP_LIMIT) return;
  keys.sort((left, right) => (state.wagerOps[left]?.at || 0) - (state.wagerOps[right]?.at || 0));
  keys.slice(0, keys.length - WAGER_OP_LIMIT).forEach(key => delete state.wagerOps[key]);
};
const POKER_TABLE_ALLOWED_ACTIONS = new Set([
  "saveProfile", "pickChip", "saveSeeds", "saveLogistics",
  "startShowScene", "advanceShowScene", "endShowScene", "retryShowScene",
  "pokerSetup", "pokerStart", "pokerLevel", "pokerBust", "pokerUnbust",
  "pokerCount", "pokerResult", "pokerCancel",
  "setFrozen", "resetTournament",
]);
const WEEKEND_START_ACTIONS = new Set([
  "announceEvent", "announceAndDraw", "startEvent", "lockAndStart", "pokerStart",
]);
const pokerTableLocksBoard = state =>
  !!(state.poker && !state.results?.[state.poker.id]);
const competitionLive = (state, ev) => {
  const lifecycle = resolveEventLifecycle(state, ev);
  return ["in-progress", "result-entry"].includes(lifecycle.phase)
    ? null
    : err("Lock betting and start the event first");
};
const reopenCompetition = (state, evId) => {
  const op = eventOp(state, evId);
  delete op.resultEntryAt;
  delete op.completedAt;
};
const resetContestSetup = (state, evId) => {
  const op = eventOp(state, evId);
  delete op.contest;
  delete op.lastContest;
  delete op.bettingOpenedAt;
  delete op.bettingLockedAt;
};
const eventHasBegun = (state, ev) => !!state.eventOps?.[ev?.id]?.startedAt
  || ["in-progress", "result-entry"].includes(resolveEventLifecycle(state, ev).phase);
const contestReferenceError = (state, ev, payload, required = false) => {
  const contest = resolveCurrentContest(state, ev);
  if (!contest) return err("No current contest");
  const hasRef = payload.contestId !== undefined || payload.contestRevision !== undefined;
  if ((required || state.eventOps?.[ev.id]?.contest || hasRef)
      && (payload.contestId !== contest.id || payload.contestRevision !== contest.revision))
    return err("Contest changed, refresh and try again");
  return null;
};
const openContest = (state, ev, now = Date.now()) => {
  const target = resolveCurrentContest(state, ev);
  if (!target) return err("Set up the next contest first");
  const op = eventOp(state, ev.id);
  const revision = Number(op.contestRevision || 0) + 1;
  op.contestRevision = revision;
  op.contest = { id:target.id, revision, phase:"betting-open" };
  op.bettingOpenedAt = now;
  delete op.bettingLockedAt;
  delete op.resultEntryAt;
  state.onDeck = ev.id;
  return ok({ contestId:target.id, contestRevision:revision });
};
const contestCommand = (ctx, type, payload) => ({
  id:showCommandId(ctx) ? `command:${ctx.deviceId || "gm"}:${ctx.actionId}` : null,
  fingerprint:JSON.stringify([type, payload.evId, payload.contestId, payload.contestRevision,
    payload.winner, Array.isArray(payload.qualifiers) ? [...payload.qualifiers].sort() : null]),
});
const replayContestCommand = (state, evId, command) => {
  if (!command.id) return null;
  const previous = state.eventOps?.[evId]?.contestCommands?.[command.id];
  if (!previous) return null;
  return previous === command.fingerprint ? ok({ unchanged:true }) : err("Request id already used");
};
const rememberContestCommand = (state, evId, command) => {
  if (!command.id) return;
  const op = eventOp(state, evId);
  op.contestCommands = { ...(op.contestCommands || {}), [command.id]:command.fingerprint };
  const keys = Object.keys(op.contestCommands);
  keys.slice(0, Math.max(0, keys.length - 128)).forEach(key => delete op.contestCommands[key]);
};

const draftCommand = (ctx, type, payload) => ({
  id:wagerRequestKey(ctx),
  actor:ctx.isGm ? "commissioner" : ctx.player,
  fingerprint:JSON.stringify([type, payload.evId, payload.draftId, payload.pickIndex,
    payload.draftRevision, payload.player, payload.captains, payload.players, payload.roles]),
});
const replayDraftCommand = (state, evId, command) => {
  if (!command.id) return null;
  const previous = state.eventOps?.[evId]?.draftCommands?.[command.id];
  if (!previous) return null;
  return previous.actor === command.actor && previous.fingerprint === command.fingerprint
    ? ok({ ...previous.extra, unchanged:true }) : err("Request id already used");
};
const rememberDraftCommand = (state, evId, command, extra) => {
  if (!command.id) return;
  const op = eventOp(state, evId);
  op.draftCommands = { ...(op.draftCommands || {}), [command.id]:{
    actor:command.actor, fingerprint:command.fingerprint, extra,
  } };
  const keys = Object.keys(op.draftCommands);
  keys.slice(0, Math.max(0, keys.length - 128)).forEach(key => delete op.draftCommands[key]);
};
const draftReferenceError = (draft, payload) => {
  const turn = draftTurn(draft);
  if (!turn) return err("Draft is incomplete, cancel it and start again");
  const hasRef = payload.draftId !== undefined || payload.pickIndex !== undefined || payload.draftRevision !== undefined;
  if ((draft.version || hasRef) && (payload.draftId !== turn.draftId
      || payload.pickIndex !== turn.pickIndex || payload.draftRevision !== turn.draftRevision))
    return err("Draft changed, refresh and try again");
  return null;
};
const draftPreparationError = (state, ev) => {
  if (!ev?.teamCfg || ev.kind !== "team") return err("Not a team event");
  if (state.frozen) return err("The board is frozen");
  if (stacksPosted(state)) return err("The finale is settled");
  if (state.results[ev.id]) return err("Result already posted");
  if (state.shelved[ev.id]) return err("That event is shelved");
  if (eventHasBegun(state, ev)) return err("The event has already started");
  const op = state.eventOps?.[ev.id];
  if (state.onDeck === ev.id || op?.bettingOpenedAt || op?.bettingLockedAt || op?.contest)
    return err("Betting has opened. Teams are locked");
  return null;
};
const draftConfigurationError = ev => {
  const cfg = ev?.teamCfg;
  if (!cfg || !Number.isInteger(cfg.teams) || cfg.teams < 2
      || !Number.isInteger(cfg.size) || cfg.size < 1 || cfg.teams * cfg.size > ROSTER.length)
    return err("Invalid team setup");
  if (cfg.bracket && (cfg.bracket !== cfg.teams || !makeBracket(cfg.bracket)))
    return err(`Unsupported ${cfg.bracket}-team bracket`);
  return null;
};
const draftDataError = (draft, ev) => {
  const config = draftConfigurationError(ev); if (config) return config;
  if (!draftTurn(draft) || draft.teams.length !== ev.teamCfg.teams)
    return err("Draft does not match this event");
  const captains = draft.teams.map(team => team.captain);
  if (new Set(captains).size !== captains.length || captains.some(player => !ROSTER.includes(player)))
    return err("Draft captains are invalid");
  const expected = captains.map(player => [player]);
  for (const [index, pick] of draft.picks.entries()) {
    if (pick.team !== snakeTeam(index, captains.length)) return err("Draft order is invalid");
    expected[pick.team].push(pick.player);
  }
  if (draft.teams.some((team, index) => !Array.isArray(team.players)
      || team.players.length > ev.teamCfg.size || !slotsEqual(team.players, expected[index])))
    return err("Draft teams do not match the picks");
  const players = [...draft.teams.flatMap(team => team.players), ...draft.pool];
  const valid = validateEventParticipants(ev, players, ROSTER);
  if (!valid.ok) return err(valid.error);
  if (players.length !== ev.teamCfg.teams * ev.teamCfg.size)
    return err(`Select exactly ${ev.teamCfg.teams * ev.teamCfg.size} players`);
  return null;
};

export const ACTIONS = {
  /* ── identity / profile ── */
  saveProfile(state, {
    player, display, num, size, flightsBooked, flightIn, flightOut, walkoutTrack,
  }, ctx) {
    if (!ALL_PLAYERS.includes(player)) return err("Unknown player");
    if (!isActivePlayer(player) && !ctx.isGm) return err("Player is not confirmed");
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
    if (flightsBooked !== undefined) {
      if (typeof flightsBooked !== "boolean") return err("Bad flight status");
      prof.flightsBooked = flightsBooked;
      if (!flightsBooked) { delete prof.flightIn; delete prof.flightOut; }
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
    /* One apparel size now covers both the T-shirt and jersey. Drop the retired
       second field whenever a profile is touched so old records migrate cleanly. */
    if (size !== undefined) {
      if (size === null) delete prof.size;
      else if (!SIZES.includes(size)) return err("Bad size");
      else prof.size = size;
      delete prof.jersey;
    }
    if (walkoutTrack !== undefined) {
      const checked = validateSpotifyTrack(walkoutTrack);
      if (!checked.ok) return err(checked.error);
      if (checked.track === null) delete prof.walkoutTrack;
      else prof.walkoutTrack = checked.track;
    }
    state.profiles[player] = prof;
    return ok();
  },
  /* chip identity: color is a first-come-first-serve claim, skin repeats
     freely. Both lock when the weekend goes live so the board stays learnable. */
  pickChip(state, { player, color, skin }, ctx) {
    if (!ALL_PLAYERS.includes(player)) return err("Unknown player");
    if (!isActivePlayer(player) && !ctx.isGm) return err("Player is not confirmed");
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
    if (!ALL_PLAYERS.includes(player)) return err("Unknown player");
    if (!isActivePlayer(player) && !ctx.isGm) return err("Player is not confirmed");
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

  /* ── show control (commissioner) ── */
  /* Directed presentation references current tournament
     facts but never changes them. The persisted scene and step reconstruct on
     every TV after refresh or reconnect. */
  startShowScene(state, request, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const enabled = showOnly(ctx); if (enabled) return enabled;
    const control = showControlOf(state);
    const commandId = showCommandId(ctx);
    if (!commandId) return err("This show command is missing a request id");
    const fingerprint = showCommandFingerprint(request?.kind, request?.eventId || null);
    const replay = showCommandReplay(control, commandId, "start", fingerprint);
    if (replay) return replay;
    if (control.active) return err("Finish or cancel the current scene first");
    const checked = validateShowSceneRequest(state, request, allEventsOf(state));
    if (!checked.ok) return err(checked.error);
    const now = Date.now();
    control.active = createShowScene(checked.request, {
      id:`show-${now}-${crypto.randomUUID()}`,
      now,
      revision:checked.definition.requiresResult
        ? Number(state.results?.[checked.request.eventId]?.revision || 1) : null,
    });
    rememberShowCommand(control.active, commandId, "start", fingerprint);
    return ok({ sceneId:control.active.id });
  },
  advanceShowScene(state, { id }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const enabled = showOnly(ctx); if (enabled) return enabled;
    const control = showControlOf(state);
    const commandId = showCommandId(ctx);
    if (!commandId) return err("This show command is missing a request id");
    const fingerprint = showCommandFingerprint(id);
    const replay = showCommandReplay(control, commandId, "advance", fingerprint);
    if (replay) return replay;
    const active = control.active;
    if (!active || active.id !== id) return err("That scene is no longer active");
    const definition = showDefinition(active.kind);
    if (!definition) return err("Cancel this unsupported scene");
    rememberShowCommand(active, commandId, "advance", fingerprint);
    const now = Date.now();
    if (active.step >= definition.steps.length - 1) {
      const completed = finishShowScene(control, "completed", now);
      return ok({ sceneId:completed.id, outcome:"completed" });
    }
    active.step += 1;
    active.updatedAt = now;
    return ok({ sceneId:active.id, step:active.step });
  },
  endShowScene(state, { id, outcome }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const enabled = showOnly(ctx); if (enabled) return enabled;
    const control = showControlOf(state);
    const commandId = showCommandId(ctx);
    if (!commandId) return err("This show command is missing a request id");
    const fingerprint = showCommandFingerprint(id, outcome);
    const replay = showCommandReplay(control, commandId, "end", fingerprint);
    if (replay) return replay;
    const active = control.active;
    if (!active || active.id !== id) return err("That scene is no longer active");
    if (!SHOW_TERMINAL_OUTCOMES.includes(outcome) || outcome === "completed")
      return err("Choose skip or cancel");
    rememberShowCommand(active, commandId, "end", fingerprint);
    const ended = finishShowScene(control, outcome);
    return ok({ sceneId:ended.id, outcome });
  },
  retryShowScene(state, { id }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const enabled = showOnly(ctx); if (enabled) return enabled;
    const control = showControlOf(state);
    const commandId = showCommandId(ctx);
    if (!commandId) return err("This show command is missing a request id");
    const fingerprint = showCommandFingerprint(id);
    const replay = showCommandReplay(control, commandId, "retry", fingerprint);
    if (replay) return replay;
    if (control.active) return err("Finish or cancel the current scene first");
    const prior = control.history.find(item => item.id === id);
    if (!prior) return err("That scene is no longer available");
    const checked = validateShowSceneRequest(state, {
      kind:prior.kind,
      eventId:prior.eventId,
    }, allEventsOf(state));
    if (!checked.ok) return err(checked.error);
    const now = Date.now();
    control.active = createShowScene(checked.request, {
      id:`show-${now}-${crypto.randomUUID()}`,
      now,
      retryOf:prior.id,
      revision:checked.definition.requiresResult
        ? Number(state.results?.[checked.request.eventId]?.revision || 1) : null,
    });
    rememberShowCommand(control.active, commandId, "retry", fingerprint);
    return ok({ sceneId:control.active.id, retryOf:prior.id });
  },

  /* ── wagers (players) ── */
  placeWager(state, { wager }, ctx) {
    const player = ctx.player;
    if (!player) return err("Check in first");
    const requestKey = wagerRequestKey(ctx);
    if (!requestKey) return err("This wager is missing a request id");
    const fingerprint = wagerFingerprint(wager);
    const replay = replayedWagerOp(state, requestKey, player, "place", fingerprint);
    if (replay) return replay;
    if (!wager || typeof wager !== "object") return err("Invalid wager");
    if (state.frozen) return err("The board is frozen");
    if (pokerLive(state)) return err("The finale is live");
    if (stacksPosted(state)) return err("The finale is settled");
    const events = allEventsOf(state);
    const ev = events.find(e => e.id === wager.eventId);
    if (!ev) return err("No such event");
    const contest = resolveCurrentContest(state, ev);
    const refError = contestReferenceError(state, ev, wager); if (refError) return refError;
    if (contest.phase !== "betting-open") return err("Betting is closed for this contest");
    if (state.onDeck !== ev.id) return err("Betting is closed for this event");
    if (state.results[ev.id]) return err("Result already posted");
    const stake = Math.floor(Number(wager.stake));
    if (!(Number.isInteger(stake) && stake % PT === 0 && stake >= PT))
      return err("Stakes move in 100s");
    if (!["outright", "match", "stage", "heat"].includes(wager.kind))
      return err("Invalid wager");
    if (!wagerMatchesContest(wager, contest)) return err("Bet on the current contest");

    /* Canonicalize every pick from current server state before affordability
       checks. A stale phone gets a useful "re-pick" response even when the
       attempted chip would also exceed its cap. */
    const clean = {
      kind:wager.kind, eventId:ev.id, evName:ev.name,
      pick:null, pickPlayers:null, pickTeam:false,
      drawId:null, match:null, matchName:null, teamIdx:null,
      stagesId:null, group:null, groupName:null,
      final:false, pickKey:null,
      stake, status:"open", player,
      id:crypto.randomUUID(), ts:Date.now(),
      chips:[{ requestKey, stake, ts:Date.now() }],
      contestId:contest.id, contestRevision:contest.revision,
    };
    if (wager.kind === "outright") {
      if (wager.pickTeam) {
        const d = state.draws[ev.id];
        if (!d || d.id !== wager.drawId) return err("Draw changed, re-pick");
        const teamIdx = d.teams.findIndex(team => samePlayers(team.players, wager.pickPlayers));
        if (teamIdx < 0) return err("Team changed, re-pick");
        const team = d.teams[teamIdx];
        clean.pick = wager.pick;
        clean.pickPlayers = [...team.players];
        clean.pickTeam = true;
        clean.drawId = d.id;
        clean.teamIdx = teamIdx;
      } else {
        if (!ROSTER.includes(wager.pick)) return err("No such player");
        clean.pick = wager.pick;
        clean.pickPlayers = [wager.pick];
      }
    }
    if (wager.kind === "match") {
      const d = state.draws[ev.id];
      if (!d || d.id !== wager.drawId) return err("Draw changed, re-pick");
      const m = state.brackets[ev.id]?.rounds?.[wager.match?.[0]]?.[wager.match?.[1]];
      if (!m) return err("No such matchup");
      if (m.winner !== null && m.winner !== undefined) return err("Matchup already decided");
      const sides = [resolveSlot(state.brackets[ev.id], m.a), resolveSlot(state.brackets[ev.id], m.b)];
      if (!sides.includes(wager.teamIdx) || !d.teams[wager.teamIdx])
        return err("Team changed, re-pick");
      clean.pick = wager.pick;
      clean.pickPlayers = [...d.teams[wager.teamIdx].players];
      clean.pickTeam = true;
      clean.drawId = d.id;
      clean.match = [wager.match[0], wager.match[1]];
      clean.matchName = wager.matchName;
      clean.teamIdx = wager.teamIdx;
    }
    if (wager.kind === "stage" || wager.kind === "heat") {
      const st = state.stages[ev.id];
      if (!st || st.id !== wager.stagesId) return err("Stage changed, re-pick");
      if (wager.final) {
        const finalists = stageFinalists(st);
        if (!finalists) return err("Finalists not set");
        if (st.finalWinner !== null && st.finalWinner !== undefined) return err("Final already decided");
        if (!finalists.includes(wager.pickKey)) return err("Final changed, re-pick");
      } else {
        const g = st.groups[wager.group];
        if (!g) return err("No such group");
        if ((g.through || []).length >= st.advance) return err("Group already decided");
        if ((g.through || []).includes(wager.pickKey)) return err("Already through");
        if (!g.entrants.includes(wager.pickKey)) return err("Group changed, re-pick");
      }
      const stageDraw = st.entrantType === "team" ? state.draws[ev.id] : null;
      if (st.entrantType === "team" && (!stageDraw || stageDraw.id !== st.drawId))
        return err("Stage changed, re-pick");
      const entrant = st.entrantType === "team"
        ? stageDraw.teams?.[wager.pickKey]?.players
        : ROSTER.includes(wager.pickKey) ? [wager.pickKey] : null;
      if (!entrant) return err("Stage changed, re-pick");
      clean.pick = wager.pick;
      clean.pickPlayers = [...entrant];
      clean.pickTeam = st.entrantType === "team";
      clean.drawId = st.drawId || null;
      clean.stagesId = st.id;
      clean.group = wager.final ? null : wager.group;
      clean.groupName = wager.groupName;
      clean.final = !!wager.final;
      clean.pickKey = wager.pickKey;
    }

    const sideKey = clean.kind === "outright" ? (clean.pickTeam ? clean.teamIdx : clean.pick)
      : clean.kind === "match" ? clean.teamIdx : clean.pickKey;
    if (!contestBetEligibility(contest, player, sideKey))
      return err("You can only back yourself or your team in this contest");

    /* Exposure and balance remain server authoritative. */
    const pts = computeStandings(state).find(r => r.player === player)?.pts ?? 0;
    const exp = atRisk(state, player, events);
    const antes = duelReserve(state, player);
    if (stake > pts - exp - antes) return err("Not enough points");
    const cap = maxRisk(pts);
    if (exp + antes + stake > cap) return err(`Max ${cap} at risk`);

    const existing = state.wagers.find(w =>
      w.player === player
      && resolveWager(state, w, events).status === "pending"
      && wagerTargetKey(w) === wagerTargetKey(clean));
    if (existing) {
      if (!Array.isArray(existing.chips)) {
        existing.chips = [{
          requestKey:`legacy:${existing.id}`,
          stake:existing.stake,
          ts:existing.ts || Date.now(),
        }];
      }
      existing.chips.push({ requestKey, stake, ts:Date.now() });
      existing.stake += stake;
      existing.updatedAt = Date.now();
      rememberWagerOp(state, requestKey, {
        actor:player, type:"place", fingerprint,
        wagerId:existing.id, stake:existing.stake,
      });
      return ok({ wagerId:existing.id, stake:existing.stake, aggregated:true });
    }

    state.wagers.unshift(clean);
    rememberWagerOp(state, requestKey, {
      actor:player, type:"place", fingerprint,
      wagerId:clean.id, stake:clean.stake,
    });
    return ok({ wagerId:clean.id, stake:clean.stake, aggregated:false });
  },
  /* pull your own chip back while the market is still open */
  retractWager(state, { id, contestId, contestRevision }, ctx) {
    const actor = ctx.player || (ctx.isGm ? "commissioner" : null);
    const requestKey = wagerRequestKey(ctx);
    if (!requestKey) return err("This retraction is missing a request id");
    const fingerprint = JSON.stringify([id]);
    const replay = replayedWagerOp(state, requestKey, actor, "retract", fingerprint);
    if (replay) return replay;
    const w = state.wagers.find(x => x.id === id);
    if (!w) return err("No such wager");
    if (w.player !== ctx.player && !ctx.isGm) return err("Not your wager");
    if (state.frozen) return err("The board is frozen");
    if (pokerLive(state)) return err("The finale is live");
    if (stacksPosted(state)) return err("The finale is settled");
    const ev = allEventsOf(state).find(event => event.id === w.eventId);
    if (!ev) return err("No such event");
    const contest = resolveCurrentContest(state, ev);
    const refError = contestReferenceError(state, ev, { contestId, contestRevision }); if (refError) return refError;
    if (contest.phase !== "betting-open" || !wagerMatchesContest(w, contest)) return err("Betting is closed for this contest");
    if (state.onDeck !== w.eventId) return err("Betting is closed");
    const r = resolveWager(state, w, allEventsOf(state));
    if (r.status !== "pending") return err("Already settled");

    let removed = true;
    let remaining = 0;
    if (Array.isArray(w.chips) && w.chips.length) {
      const chip = w.chips.pop();
      remaining = Math.max(0, w.stake - (Number(chip.stake) || 0));
      if (remaining > 0 && w.chips.length) {
        w.stake = remaining;
        w.updatedAt = Date.now();
        removed = false;
      }
    }
    if (removed) state.wagers = state.wagers.filter(x => x.id !== id);
    rememberWagerOp(state, requestKey, {
      actor, type:"retract", fingerprint, wagerId:id,
      stake:remaining, removed,
    });
    return ok({ wagerId:id, stake:remaining, removed });
  },
  voidWager(state, { id }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const w = state.wagers.find(x => x.id === id);
    if (!w) return err("No such wager");
    if (w.status === "void") return ok({ unchanged:true });
    w.status = "void";
    return ok();
  },

  /* ── duels (players) ──
     A duel is a phone minigame between two players. A challenge is an offer:
     sendDuel reserves only the challenger's ante, either for one player or
     for anyone (open). The recipient, or the first eligible taker of an open
     challenge, accepts and reserves their own ante at that moment. Runs are
     allowed only after acceptance. An unanswered offer lapses by derivation
     (duelPhase), so nothing has to expire it. Settlement is derived from the
     two runs in computeStandings, never stored. Records without `consent`
     predate offers and read as accepted. */
  sendDuel(state, { to, game, stake: want, open }, ctx) {
    const from = ctx.player;
    if (!from) return err("Check in first");
    const closed = duelBoardClosed(state); if (closed) return err(closed);
    /* no duels before the weekend: everyone is on 1,000 until Friday, which is
       what the invite promises, and the locker room shows no points for a
       result to land on */
    if (!state.live) return err("Duels open when the weekend starts");
    state.duels = state.duels || [];
    /* a transport retry of the same tap acknowledges the challenge it made */
    const sendKey = showCommandId(ctx);
    if (sendKey) {
      const sent = state.duels.find(d => d.from === from && d.sendKey === sendKey);
      if (sent) return ok({ id:sent.id, unchanged:true });
    }
    const anyone = open === true;
    if (anyone) {
      if (to !== undefined && to !== null) return err("An open challenge has no opponent");
    } else {
      if (!ROSTER.includes(to)) return err("Unknown player");
      if (to === from) return err("Pick someone else");
    }
    const g = game || "quickdraw";
    if (!DUEL_GAMES[g]) return err("Unknown game");
    const now = Date.now();
    if (!anyone && duelBetween(state, from, to, now))
      return err(`You already have a duel going with ${disp(state, to)}`);
    if (anyone && state.duels.some(d => d.open && d.from === from && duelPhase(d, now) === "offered"))
      return err("You already have an open challenge");
    if (duelsSentToday(state, from, now) >= DUEL_DAILY_LIMIT)
      return err("Three challenges a day, max");
    /* the challenger names the ante; both sides put up the same amount */
    const stake = want === undefined ? DUEL_STAKE : Math.floor(Number(want));
    if (!(Number.isInteger(stake) && stake % PT === 0 && stake >= PT))
      return err("Antes move in 100s");
    /* the wager cap covers duels too, or a duel would be a way around it */
    const events = allEventsOf(state);
    const rows = computeStandings(state);
    const mine = duelRoom(state, from, { events, rows, now });
    if (mine.capRoom < stake) return err(`Max ${mine.cap} at risk`);
    if (mine.balanceRoom < stake) return err("Not enough points");
    /* nothing of theirs is reserved yet; this only keeps a challenge they
       could not accept from being sent. Accept checks again. */
    if (!anyone && duelRoom(state, to, { events, rows, now }).room < stake)
      return err(`${disp(state, to)} can't cover that ante`);
    const id = "du" + now + Math.floor(Math.random() * 9999);
    state.duels.unshift({ id, game:g, from, to:anyone ? null : to, open:anyone, stake,
      status:"open", runs:{}, ts:now, consent:true, acceptedAt:null,
      ...(sendKey ? { sendKey } : {}) });
    return ok({ id });
  },
  acceptDuel(state, { id }, ctx) {
    const p = ctx.player;
    if (!p) return err("Check in first");
    const closed = duelBoardClosed(state); if (closed) return err(closed);
    const d = (state.duels || []).find(x => x.id === id);
    if (!d) return err("No such duel");
    if (d.from === p) return err("That is your challenge");
    /* an acknowledged retry, or a legacy duel that was accepted at send */
    if (duelAccepted(d) && d.status === "open")
      return d.to === p ? ok({ id:d.id, unchanged:true })
        : err(d.open ? "Someone already took it" : "Not your duel");
    const now = Date.now();
    const phase = duelPhase(d, now);
    if (phase === "lapsed") return err("This challenge lapsed");
    if (phase !== "offered") return err("This challenge is closed");
    if (!d.open && d.to !== p) return err("Not your duel");
    if (d.open && duelBetween(state, d.from, p, now))
      return err(`You already have a duel going with ${disp(state, d.from)}`);
    const room = duelRoom(state, p, { now });
    if (room.capRoom < d.stake) return err(`Max ${room.cap} at risk`);
    if (room.balanceRoom < d.stake) return err("Not enough points");
    d.to = p;
    d.acceptedAt = now;
    return ok({ id:d.id });
  },
  playDuel(state, { id, ms, foul }, ctx) {
    const p = ctx.player;
    if (!p) return err("Check in first");
    const closed = duelBoardClosed(state); if (closed) return err(closed);
    const d = (state.duels || []).find(x => x.id === id);
    if (!d) return err("No such duel");
    if (d.status !== "open") return err("Duel is closed");
    if (p !== d.from && p !== d.to) return err("Not your duel");
    if (!duelAccepted(d)) return err(p === d.from
      ? d.open ? "Waiting for someone to accept" : `Waiting for ${disp(state, d.to)} to accept`
      : "Accept the challenge first");
    const f = !!foul;
    const m = Math.round(Number(ms));
    d.runs = d.runs || {};
    /* one reaction per player: resending the same run is acknowledged, a
       different one is refused, so a lost ack never buys a better retry */
    const prior = d.runs[p];
    if (prior) return prior.foul === f && (f || prior.ms === m)
      ? ok({ unchanged:true }) : err("You already drew");
    if (!f && !(m >= 80 && m <= 5000)) return err("Bad time");
    d.runs[p] = { ms: f ? null : m, foul: f, ts: Date.now() };
    return ok();
  },
  /* the recipient may say no until they have drawn */
  declineDuel(state, { id }, ctx) {
    const d = (state.duels || []).find(x => x.id === id);
    if (!d) return err("No such duel");
    const mine = !!d.to && ctx.player === d.to;
    if (d.status === "declined" && (mine || ctx.isGm)) return ok({ unchanged:true });
    if (d.status !== "open") return err("Already closed");
    if (!mine && !ctx.isGm) return err("Not your duel");
    if (resolveDuel(d).settled) return err("Already settled");
    if (d.to && d.runs?.[d.to]) return err("Already in play");
    d.status = "declined";
    d.declinedAt = Date.now();
    return ok();
  },
  /* the challenger may take an offer back until someone accepts it */
  withdrawDuel(state, { id }, ctx) {
    const d = (state.duels || []).find(x => x.id === id);
    if (!d) return err("No such duel");
    if (!ctx.player || d.from !== ctx.player) return err("Not your challenge");
    if (d.status === "withdrawn") return ok({ unchanged:true });
    if (d.status !== "open") return err("Already closed");
    if (duelAccepted(d)) return err(`${disp(state, d.to)} already accepted`);
    d.status = "withdrawn";
    d.withdrawnAt = Date.now();
    return ok();
  },
  voidDuel(state, { id }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const d = (state.duels || []).find(x => x.id === id);
    if (!d) return err("No such duel");
    if (d.status === "void") return ok({ unchanged:true });
    d.status = "void";
    d.voidedAt = Date.now();
    return ok();
  },
  /* one commissioner write for every duel still waiting on someone */
  voidOpenDuels(state, {}, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const now = Date.now();
    const open = (state.duels || []).filter(d => duelOpen(d, now));
    if (!open.length) return ok({ count:0, unchanged:true });
    open.forEach(d => { d.status = "void"; d.voidedAt = now; });
    return ok({ count:open.length });
  },

  /* ── GM: results ── */
  saveResult(state, { evId, slots, confirmOverwrite, correctionReason, noScene }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const ev = allEventsOf(state).find(e => e.id === evId);
    if (!ev) return err("No such event");
    if (ev.game === "poker" && ev.finale) return err("Enter chip counts instead");
    if (!Array.isArray(slots) || !slots[0]?.length) return err("Winners required");
    if (slots.length > 3 || !slots.every(s => Array.isArray(s) && s.every(p => ROSTER.includes(p))))
      return err("Bad slots");
    const placed = slots.flat();
    if (new Set(placed).size !== placed.length) return err("A player is listed twice");
    const cleanSlots = slots.map(s => [...s]);
    const existing = state.results[evId];
    if (existing && slotsEqual(existing.slots, cleanSlots))
      return ok({ unchanged:true, revision:existing.revision || 1 });
    const now = Date.now();
    const op = eventOp(state, evId);
    if (op.contest) {
      const readiness = resultReadiness(state, ev);
      if (!readiness.ok) return err(readiness.blockers[0]);
      const draw = state.draws[evId];
      const br = state.brackets[evId];
      const st = state.stages[evId];
      const champion = br ? draw?.teams?.[bracketChampion(br)]?.players
        : st ? (st.entrantType === "team" ? draw?.teams?.[st.finalWinner]?.players : [st.finalWinner]) : null;
      if (champion && !samePlayers(champion, cleanSlots[0])) return err("First place must match the contest winner");
      if (!champion && draw && !draw.teams.some(team => samePlayers(team.players, cleanSlots[0])))
        return err("Choose one full team as the winner");
      if (!champion && !draw && cleanSlots[0].length !== 1) return err("Choose one winner");
    }
    if (existing) {
      const reason = cleanCorrectionReason(correctionReason);
      if (confirmOverwrite !== true) return err("Confirm replacing the official result");
      if (!reason) return err("Correction reason required");
      const revision = Math.max(1, Number(existing.revision || op.revision || 1)) + 1;
      appendCorrection(state, evId, {
        type:"overwrite",
        at:now,
        by:ctx.player || "commissioner",
        reason,
        fromRevision:Number(existing.revision || 1),
        previousSlots:existing.slots.map(slot => [...(slot || [])]),
      });
      state.results[evId] = {
        slots:cleanSlots,
        ts:now,
        confirmedAt:existing.confirmedAt || existing.ts || now,
        correctedAt:now,
        correctionReason:reason,
        revision,
      };
      op.revision = revision;
    } else {
      const lifecycle = resolveEventLifecycle(state, ev);
      if (lifecycle.phase !== "result-entry")
        return err(lifecycle.nextAction?.label || "Move the event to result entry first");
      const revision = Math.max(0, Number(op.revision || 0)) + 1;
      state.results[evId] = {
        slots:cleanSlots,
        ts:now,
        confirmedAt:now,
        revision,
      };
      op.revision = revision;
    }
    op.completedAt = now;
    if (state.onDeck === evId) state.onDeck = null;
    /* Fresh posts carry their own ceremony; corrections mark the old scene
       stale and the replay beat offers the ceremony again instead. QA sim
       passes noScene so a rehearsal never machine-guns the TV. */
    const scene = !existing && noScene !== true
      ? tryStartScene(state, ctx, { kind:"winner", eventId:evId }, now)
      : null;
    return ok({ revision:op.revision, ...(scene ? { sceneId:scene.id } : {}) });
  },
  clearResult(state, { evId, confirmClear, correctionReason }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const ev = allEventsOf(state).find(e => e.id === evId);
    if (!ev) return err("No such event");
    const existing = state.results[evId];
    if (!existing) return err("No result to clear");
    if (confirmClear !== true) return err("Confirm clearing the official result");
    const reason = cleanCorrectionReason(correctionReason);
    if (!reason) return err("Correction reason required");
    const now = Date.now();
    appendCorrection(state, evId, {
      type:"clear",
      at:now,
      by:ctx.player || "commissioner",
      reason,
      fromRevision:Number(existing.revision || 1),
      previousSlots:(existing.slots || []).map(slot => [...(slot || [])]),
      hadStacks:!!existing.stacks,
    });
    delete state.results[evId];
    const op = eventOp(state, evId);
    op.resultEntryAt = now;
    delete op.completedAt;
    return ok({ revision:Number(op.revision || existing.revision || 1) });
  },

  /* ── GM: slate ── */
  setOnDeck(state, { id, contestId, contestRevision }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    if (state.frozen) return err("The board is frozen");
    const events = allEventsOf(state);
    if (!id) {
      if (!state.onDeck) return ok({ unchanged:true });
      const closing = state.onDeck;
      const ev = events.find(event => event.id === closing);
      const refError = contestReferenceError(state, ev, { contestId, contestRevision }); if (refError) return refError;
      const op = eventOp(state, closing);
      op.bettingLockedAt = Date.now();
      if (op.contest) op.contest.phase = "betting-locked";
      state.onDeck = null;
      return ok({ eventId:closing });
    }
    const ev = events.find(event => event.id === id);
    if (!ev) return err("No such event");
    if (ev.game === "poker")
      return err("No betting on the finale");
    if (stacksPosted(state)) return err("The finale is settled");
    if (state.shelved[id]) return err("That event is shelved");
    if (state.results[id]) return err("Result already posted");
    if (state.onDeck && state.onDeck !== id) return err("Close the current betting market first");
    if (state.onDeck === id) {
      if (contestId !== undefined || contestRevision !== undefined) {
        const refError = contestReferenceError(state, ev, { contestId, contestRevision }); if (refError) return refError;
      }
      return ok({ unchanged:true });
    }
    if (ev.teamCfg && !state.draws[id]) return err("Set the teams before opening betting");
    if (ev.stageCfg && !state.stages[id]) return err(`Set up ${ev.stageCfg.kind} first`);
    if (eventHasBegun(state, ev) || state.eventOps?.[id]?.resultEntryAt) return err("The event has already started");
    const op = eventOp(state, id);
    if (op.contest) {
      const refError = contestReferenceError(state, ev, { contestId, contestRevision }); if (refError) return refError;
    }
    return openContest(state, ev);
  },
  startEvent(state, payload, ctx) {
    const { evId } = payload;
    const g = gmOnly(ctx); if (g) return g;
    if (state.frozen) return err("The board is frozen");
    const ev = allEventsOf(state).find(event => event.id === evId);
    if (!ev) return err("No such event");
    const refError = contestReferenceError(state, ev, payload); if (refError) return refError;
    const lifecycle = resolveEventLifecycle(state, ev);
    if (lifecycle.phase !== "betting-locked")
      return err(lifecycle.nextAction?.label || "Lock betting before starting");
    const op = eventOp(state, evId);
    op.startedAt = op.startedAt || Date.now();
    if (op.contest) op.contest.phase = "in-progress";
    return ok();
  },

  /* ── GM: director composites ──
     One tap moves the tournament and points the TV in the same write. The
     discrete actions above survive for the manual path; these merge the
     routine pairs. Scenes start only on FRESH transitions so a retried
     composite never restarts a ceremony. */
  announceEvent(state, { evId, contestId, contestRevision }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    if (!evId) return err("No such event");
    const result = ACTIONS.setOnDeck(state, { id:evId, contestId, contestRevision }, ctx);
    if (!result.ok || result.extra?.unchanged) return result;
    const scene = tryStartScene(state, ctx, { kind:"event-intro", eventId:evId });
    return ok({ ...(scene ? { sceneId:scene.id } : {}) });
  },
  /* The one-tap team-event open: draw runs, bracket seeds, and betting
     opens in ONE broadcast, so every phone plays intro then reveal by
     itself through the existing announce chain. No directed scene: the
     legacy ceremony owns this moment on every screen. */
  announceAndDraw(state, { evId, players, roles }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    if (state.frozen) return err("The board is frozen");
    const ev = allEventsOf(state).find(e => e.id === evId);
    if (!ev?.teamCfg) return err("Not a team event");
    if (state.results[evId]) return err("Result already posted");
    if (state.shelved[evId]) return err("That event is shelved");
    if (stacksPosted(state)) return err("The finale is settled");
    if (state.drafts[evId] && !state.draws[evId])
      return err("Finish or cancel the captains draft");
    if (eventHasBegun(state, ev) || state.eventOps?.[evId]?.resultEntryAt) return err("The event has already started");
    const op = eventOp(state, evId);
    if (state.onDeck && state.onDeck !== evId) return err("Close the current betting market first");
    let drew = false;
    if (!state.draws[evId]) {
      const roster = Array.isArray(players) && players.length ? players : ROSTER;
      const compatible = validateEventParticipants(ev, roster, ROSTER);
      if (!compatible.ok) return err(compatible.error);
      if (ev.teamCfg.bracket && !makeBracket(ev.teamCfg.bracket))
        return err(`Unsupported ${ev.teamCfg.bracket}-team bracket`);
      const draw = drawTeams(ev, state, compatible.players);
      if (!draw) return err("Draw failed");
      draw.roles = normalizeOverflowRoles(compatible.players, ROSTER, roles, ev);
      state.draws[evId] = draw;
      delete state.stages[evId];
      if (ev.teamCfg.bracket && draw.teams.length === ev.teamCfg.bracket)
        state.brackets[evId] = makeBracket(ev.teamCfg.bracket);
      else delete state.brackets[evId];
      op.drawRevealedAt = Date.now();
      drew = true;
    }
    let announced = false;
    if (state.onDeck !== evId) {
      if (ev.stageCfg && !state.stages[evId]) {
        const prepared = ACTIONS.runStages(state, { evId, cfg:ev.stageCfg }, ctx);
        if (!prepared.ok) return prepared;
      }
      const opened = openContest(state, ev);
      if (!opened.ok) return opened;
      announced = true;
    }
    if (!drew && !announced) return ok({ unchanged:true });
    return ok({ drew, announced });
  },
  lockAndStart(state, payload, ctx) {
    const { evId } = payload;
    const g = gmOnly(ctx); if (g) return g;
    const command = contestCommand(ctx, "lockAndStart", payload);
    const replay = replayContestCommand(state, evId, command); if (replay) return replay;
    if (state.frozen) return err("The board is frozen");
    const ev = allEventsOf(state).find(e => e.id === evId);
    if (!ev) return err("No such event");
    const refError = contestReferenceError(state, ev, payload); if (refError) return refError;
    const op = eventOp(state, evId);
    if (op.contest?.phase === "in-progress" || !op.contest && op.startedAt) return ok({ unchanged:true });
    const lifecycle = resolveEventLifecycle(state, ev);
    if (lifecycle.phase === "betting-open") {
      op.bettingLockedAt = Date.now();
      state.onDeck = null;
    } else if (lifecycle.phase !== "betting-locked") {
      return err(lifecycle.nextAction?.label || "Open betting first");
    }
    op.startedAt = op.startedAt || Date.now();
    if (op.contest) op.contest.phase = "in-progress";
    rememberContestCommand(state, evId, command);
    /* the intro has said its piece; the game starting is the handoff */
    if (ctx.showControl) {
      const control = showControlOf(state);
      const active = control.active;
      if (active?.kind === "event-intro" && active.eventId === evId) {
        const definition = showDefinition(active.kind);
        const atLast = definition && active.step >= definition.steps.length - 1;
        finishShowScene(control, atLast ? "completed" : "skipped");
      }
    }
    return ok();
  },
  recordContestWinner(state, payload, ctx) {
    const { evId, winner, qualifiers } = payload;
    const g = gmOnly(ctx); if (g) return g;
    const command = contestCommand(ctx, "recordContestWinner", payload);
    const replay = replayContestCommand(state, evId, command); if (replay) return replay;
    if (state.frozen) return err("The board is frozen");
    if (stacksPosted(state)) return err("The finale is settled");
    const ev = allEventsOf(state).find(event => event.id === evId);
    if (!ev) return err("No such event");
    const refError = contestReferenceError(state, ev, payload, true); if (refError) return refError;
    const contest = resolveCurrentContest(state, ev);
    if (contest.phase !== "in-progress") return err("Lock betting and start this contest first");
    if (contest.kind === "ffa") return err("Enter the event result instead");
    if (!contest.sides.some(side => side.key === winner)) return err("Winner is not in this contest");
    if (state.onDeck && state.onDeck !== evId) return err("Close the current betting market first");
    let through;
    if (contest.kind === "heat") {
      const st = state.stages[evId];
      through = qualifiers === undefined && st.advance === 1 ? [winner] : qualifiers;
      if (!Array.isArray(through) || through.length !== st.advance || new Set(through).size !== through.length
          || !through.includes(winner) || through.some(key => !contest.sides.some(side => side.key === key)))
        return err(`Choose the winner and ${st.advance} qualifier${st.advance === 1 ? "" : "s"}`);
    }
    const op = eventOp(state, evId);
    op.lastContest = { id:contest.id, kind:contest.kind, revision:contest.revision,
      match:contest.match, group:contest.group, stagesId:contest.stagesId, drawId:contest.drawId,
      previousWinner:contest.kind === "match"
        ? state.brackets[evId].rounds[contest.match[0]][contest.match[1]].winner
        : contest.kind === "heat" ? state.stages[evId].groups[contest.group].winner : state.stages[evId].finalWinner,
      previousThrough:contest.kind === "heat" ? [...(state.stages[evId].groups[contest.group].through || [])] : undefined,
      winner, decidedAt:Date.now() };
    if (contest.kind === "match") state.brackets[evId].rounds[contest.match[0]][contest.match[1]].winner = winner;
    else if (contest.kind === "heat") {
      const group = state.stages[evId].groups[contest.group];
      group.winner = winner;
      group.through = [...through];
    } else state.stages[evId].finalWinner = winner;
    const next = resolveCurrentContest(state, ev);
    if (next) openContest(state, ev);
    else {
      op.contest = { id:contest.id, revision:contest.revision, phase:"awaiting-result" };
      op.contestRevision = contest.revision;
      op.resultEntryAt = Date.now();
      if (state.onDeck === evId) state.onDeck = null;
    }
    rememberContestCommand(state, evId, command);
    return ok({ ...(next ? { contestId:op.contest.id, contestRevision:op.contest.revision } : { awaitingResult:true }) });
  },
  undoLastContest(state, payload, ctx) {
    const { evId, contestId, contestRevision } = payload;
    const g = gmOnly(ctx); if (g) return g;
    const command = contestCommand(ctx, "undoLastContest", payload);
    const replay = replayContestCommand(state, evId, command); if (replay) return replay;
    const ev = allEventsOf(state).find(event => event.id === evId);
    if (!ev) return err("No such event");
    const available = contestUndoAvailability(state, ev);
    if (!available.enabled) return err(available.blocker);
    if (contestId !== available.contestId || contestRevision !== available.contestRevision)
      return err("Contest changed, refresh and try again");
    const op = eventOp(state, evId), last = op.lastContest;
    if (last.drawId && state.draws[evId]?.id !== last.drawId
        || last.stagesId && state.stages[evId]?.id !== last.stagesId) return err("Draw changed, refresh and try again");
    if (last.kind === "match") state.brackets[evId].rounds[last.match[0]][last.match[1]].winner = last.previousWinner ?? null;
    else if (last.kind === "heat") {
      const group = state.stages[evId].groups[last.group];
      group.winner = last.previousWinner ?? null;
      group.through = [...(last.previousThrough || [])];
    } else state.stages[evId].finalWinner = last.previousWinner ?? null;
    op.contestRevision = Number(op.contestRevision || 0) + 1;
    op.contest = { id:last.id, revision:op.contestRevision, phase:"in-progress" };
    op.bettingLockedAt = Date.now();
    delete op.resultEntryAt;
    delete op.lastContest;
    if (state.onDeck === evId) state.onDeck = null;
    rememberContestCommand(state, evId, command);
    return ok({ contestId:op.contest.id, contestRevision:op.contest.revision });
  },
  beginResultEntry(state, { evId }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const ev = allEventsOf(state).find(event => event.id === evId);
    if (!ev) return err("No such event");
    const lifecycle = resolveEventLifecycle(state, ev);
    if (lifecycle.phase === "result-entry") return ok({ unchanged:true });
    if (lifecycle.phase !== "in-progress" || lifecycle.nextAction?.type !== "enter-result")
      return err(lifecycle.blockers?.[0] || lifecycle.nextAction?.label || "Event is not ready for results");
    const op = eventOp(state, evId);
    op.resultEntryAt = Date.now();
    if (op.contest) op.contest.phase = "awaiting-result";
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
      stages: state.stages[id], eventOp:state.eventOps?.[id], shelved: !!state.shelved[id],
      wagers: state.wagers.filter(w => w.eventId === id),
    };
    state.customEvents = state.customEvents.filter(e => e.id !== id);
    delete state.results[id]; delete state.draws[id]; delete state.brackets[id];
    delete state.stages[id]; delete state.shelved[id];
    if (state.eventOps) delete state.eventOps[id];
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
    if (u.eventOp) Object.assign(eventOp(state, u.ev.id), u.eventOp);
    if (u.shelved) state.shelved[u.ev.id] = true;
    state.wagers = [...(Array.isArray(u.wagers) ? u.wagers : []), ...state.wagers];
    return ok();
  },

  /* ── GM: draws, brackets, stages ── */
  /* one draw: balanced on live strength (sealed survey + board + results),
     recursively refined server-side in drawTeams */
  runDraw(state, { evId, players, roles }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const ev = allEventsOf(state).find(e => e.id === evId);
    if (!ev?.teamCfg) return err("Not a team event");
    if (state.results[evId]) return err("Result already posted");
    if (state.shelved[evId]) return err("That event is shelved");
    if (state.onDeck === evId) return err("Close betting before changing the draw");
    if (state.drafts?.[evId]) return err("Finish or cancel the captains draft");
    if (eventHasBegun(state, ev)) return err("The event has already started");
    const compatible = validateEventParticipants(ev, players, ROSTER);
    if (!compatible.ok) return err(compatible.error);
    players = compatible.players;
    if (ev.teamCfg.bracket && !makeBracket(ev.teamCfg.bracket))
      return err(`Unsupported ${ev.teamCfg.bracket}-team bracket`);
    const draw = drawTeams(ev, state, players);
    if (!draw) return err("Draw failed");
    draw.roles = normalizeOverflowRoles(players, ROSTER, roles, ev);
    state.draws[evId] = draw;
    delete state.stages[evId];
    resetContestSetup(state, evId);
    if (ev.teamCfg.bracket && draw.teams.length === ev.teamCfg.bracket)
      state.brackets[evId] = makeBracket(ev.teamCfg.bracket);
    else delete state.brackets[evId];
    eventOp(state, evId).drawRevealedAt = Date.now();
    return ok();
  },
  clearDraw(state, { evId }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    if (state.results[evId]) return err("Clear the result before the draw");
    if (state.onDeck === evId) return err("Lock betting before clearing the draw");
    const ev = allEventsOf(state).find(event => event.id === evId);
    if (!ev) return err("No such event");
    if (eventHasBegun(state, ev)) return err("The event has already started");
    delete state.draws[evId]; delete state.brackets[evId]; delete state.stages[evId];
    /* only the draw's own lifecycle stamps go; revision and correction
       history outlive a redraw */
    const op = state.eventOps?.[evId];
    if (op) {
      delete op.drawRevealedAt;
      delete op.bettingOpenedAt;
      delete op.bettingLockedAt;
      delete op.contest;
    }
    return ok();
  },
  pickBracketWinner(state, { evId, r, m, teamIdx }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const ev = allEventsOf(state).find(event => event.id === evId);
    if (!ev) return err("No such event");
    const live = competitionLive(state, ev); if (live) return live;
    if (state.eventOps?.[evId]?.contest) return err("Use the current contest controls");
    const current = resolveCurrentContest(state, ev);
    if (current?.kind !== "match" || current.match[0] !== r || current.match[1] !== m)
      return err("Record the current matchup first");
    const br = state.brackets[evId]; if (!br?.rounds?.[r]?.[m]) return err("No such matchup");
    const match = br.rounds[r][m];
    const a = resolveSlot(br, match.a), b = resolveSlot(br, match.b);
    if (teamIdx !== a && teamIdx !== b) return err("Not in this matchup");
    reopenCompetition(state, evId);
    br.rounds[r][m].winner = teamIdx;
    for (let rr = r + 1; rr < br.rounds.length; rr++) br.rounds[rr].forEach(match => { match.winner = null; });
    return ok();
  },
  runStages(state, { evId, cfg }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const ev = allEventsOf(state).find(e => e.id === evId);
    if (!ev) return err("No such event");
    if (state.results[evId]) return err("Result already posted");
    if (state.onDeck === evId) return err("Close betting before changing stages");
    if (eventHasBegun(state, ev)) return err("The event has already started");
    if (!cfg || !["heats", "pools"].includes(cfg.kind) || !Number.isInteger(cfg.nGroups) || cfg.nGroups < 2 || cfg.nGroups > 4)
      return err("Bad stage setup");
    if (state.brackets[evId]) return err("This event uses a bracket");
    if (ev.stageCfg && ev.stageCfg.kind !== cfg.kind) return err(`This event uses ${ev.stageCfg.kind}`);
    let entrantType, keys, drawId = null;
    if (cfg.kind === "heats") {
      const compatible = validateEventParticipants(ev, cfg.players, ROSTER);
      if (!compatible.ok) return err(compatible.error);
      entrantType = "solo"; keys = compatible.players;
    } else {
      const draw = state.draws[evId]; if (!draw) return err("Draw teams first");
      entrantType = "team"; keys = draw.teams.map((_, i) => i); drawId = draw.id;
    }
    if (keys.length < cfg.nGroups * (cfg.advance === 2 ? 2 : 1)) return err("Not enough entrants for these groups");
    /* same live strength model as the team draw; teams average their players */
    const solo = strengthMap(state, entrantType === "solo" ? keys : ROSTER, ev.sport);
    const strength = entrantType === "solo" ? k => solo[k]
      : i => { const t = state.draws[evId].teams[i]; return t.players.reduce((s, p) => s + (solo[p] ?? 0.5), 0) / t.players.length; };
    const groups = splitIntoGroups(keys, cfg.nGroups, strength)
      .map((entrants, i) => ({ name: cfg.kind === "heats" ? `Heat ${i + 1}` : `Pool ${"ABCD"[i] || i + 1}`, entrants, through: [], winner:null }));
    state.stages[evId] = { id:`s${Date.now()}-${crypto.randomUUID()}`, eventId: evId, kind: cfg.kind, entrantType, drawId, contestVersion:1,
      advance: cfg.advance === 2 ? 2 : 1, groups, finalWinner: null, ts: Date.now() };
    resetContestSetup(state, evId);
    return ok();
  },
  clearStages(state, { evId }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    if (state.results[evId]) return err("Clear the result before the stages");
    if (state.onDeck === evId) return err("Close betting before clearing stages");
    const ev = allEventsOf(state).find(event => event.id === evId);
    if (!ev) return err("No such event");
    if (eventHasBegun(state, ev)) return err("The event has already started");
    delete state.stages[evId];
    resetContestSetup(state, evId);
    return ok();
  },
  toggleThrough(state, { evId, g: gi, key }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const ev = allEventsOf(state).find(event => event.id === evId);
    if (!ev) return err("No such event");
    const live = competitionLive(state, ev); if (live) return live;
    if (state.eventOps?.[evId]?.contest) return err("Use the current contest controls");
    const current = resolveCurrentContest(state, ev);
    if (current?.kind !== "heat" || current.group !== gi) return err("Record the current group first");
    const st = state.stages[evId]; const grp = st?.groups?.[gi];
    if (!grp) return err("No such group");
    if (!grp.entrants.includes(key)) return err("Not in this group");
    reopenCompetition(state, evId);
    grp.through = grp.through || [];
    if (grp.through.includes(key)) grp.through = grp.through.filter(k => k !== key);
    else if (grp.through.length < st.advance) grp.through.push(key);
    st.finalWinner = null;
    return ok();
  },
  setFinalWinner(state, { evId, key }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const ev = allEventsOf(state).find(event => event.id === evId);
    if (!ev) return err("No such event");
    const live = competitionLive(state, ev); if (live) return live;
    if (state.eventOps?.[evId]?.contest) return err("Use the current contest controls");
    if (resolveCurrentContest(state, ev)?.kind !== "stage-final") return err("Finish the current group first");
    const st = state.stages[evId]; if (!st) return err("No stages");
    if (!(stageFinalists(st) || []).includes(key)) return err("Not a finalist");
    reopenCompetition(state, evId);
    st.finalWinner = st.finalWinner === key ? null : key;
    return ok();
  },

  /* ── captains draft (GM sets up + can override; on-clock captain picks) ── */
  startDraft(state, payload, ctx) {
    const { evId, captains, players, roles } = payload;
    const g = gmOnly(ctx); if (g) return g;
    const command = draftCommand(ctx, "startDraft", payload);
    const replay = replayDraftCommand(state, evId, command); if (replay) return replay;
    const ev = allEventsOf(state).find(e => e.id === evId);
    const unavailable = draftPreparationError(state, ev); if (unavailable) return unavailable;
    const config = draftConfigurationError(ev); if (config) return config;
    if (state.draws[evId]) return err("Teams already set, clear them first");
    const compatible = validateEventParticipants(ev, players, ROSTER);
    if (!compatible.ok) return err(compatible.error);
    if (compatible.players.length !== ev.teamCfg.teams * ev.teamCfg.size)
      return err(`Select exactly ${ev.teamCfg.teams * ev.teamCfg.size} players`);
    if (!Array.isArray(captains) || captains.length !== ev.teamCfg.teams) return err("Pick one captain per team");
    if (new Set(captains).size !== captains.length) return err("A captain is listed twice");
    const pool = compatible.players;
    if (!captains.every(c => pool.includes(c))) return err("Captains must be in the playing pool");
    const normalizedRoles = normalizeOverflowRoles(pool, ROSTER, roles, ev);
    const existing = state.drafts?.[evId];
    if (existing) {
      if (!slotsEqual(existing.teams?.map(team => team.captain), captains)
          || !samePlayers([...(existing.pool || []), ...(existing.teams || []).flatMap(team => team.players)], pool)
          || !slotsEqual(existing.roles || [], normalizedRoles))
        return err("A draft is running. Cancel it before changing captains");
      const extra = draftTurn(existing);
      if (command.id) {
        rememberDraftCommand(state, evId, command, extra);
        return ok(extra);
      }
      return ok({ ...extra, unchanged:true });
    }
    state.drafts = state.drafts || {};
    state.drafts[evId] = {
      id:`df${Date.now()}-${crypto.randomUUID()}`, method:"draft", version:1, revision:0, ts:Date.now(),
      players:[...pool],
      teams: captains.map(c => ({ captain: c, players: [c] })),
      pool: pool.filter(p => !captains.includes(p)),
      picks: [],
      roles:normalizedRoles,
    };
    const extra = draftTurn(state.drafts[evId]);
    rememberDraftCommand(state, evId, command, extra);
    return ok(extra);
  },
  pickDraftPlayer(state, payload, ctx) {
    const { evId, player } = payload;
    if (!ctx.isGm && !isActivePlayer(ctx.player)) return err("Choose your player first");
    const command = draftCommand(ctx, "pickDraftPlayer", payload);
    const replay = replayDraftCommand(state, evId, command); if (replay) return replay;
    const ev = allEventsOf(state).find(e => e.id === evId);
    const unavailable = draftPreparationError(state, ev); if (unavailable) return unavailable;
    const d = state.drafts?.[evId]; if (!d) return err("No draft running");
    if (state.draws[evId]) return err("Teams already set");
    const refError = draftReferenceError(d, payload); if (refError) return refError;
    const dataError = draftDataError(d, ev); if (dataError) return dataError;
    const turn = draftTurn(d);
    if (turn.complete) return err("All players have been picked");
    if (!ctx.isGm && ctx.player !== turn.captain) return err("Not your pick");
    if (!d.pool.includes(player)) return err("Player not available");
    const team = turn.teamIndex;
    d.teams[team].players.push(player);
    d.pool = d.pool.filter(p => p !== player);
    d.picks.push({ team, player });
    d.revision = turn.draftRevision + 1;
    const extra = { ...draftTurn(d), pickedBy:turn.captain, player, team };
    rememberDraftCommand(state, evId, command, extra);
    return ok(extra);
  },
  undoDraftPick(state, payload, ctx) {
    const { evId } = payload;
    const g = gmOnly(ctx); if (g) return g;
    const command = draftCommand(ctx, "undoDraftPick", payload);
    const replay = replayDraftCommand(state, evId, command); if (replay) return replay;
    const ev = allEventsOf(state).find(e => e.id === evId);
    const unavailable = draftPreparationError(state, ev); if (unavailable) return unavailable;
    const d = state.drafts?.[evId]; if (!d) return err("No draft running");
    if (state.draws[evId]) return err("Teams already set");
    const refError = draftReferenceError(d, payload); if (refError) return refError;
    const dataError = draftDataError(d, ev); if (dataError) return dataError;
    const last = d.picks.at(-1); if (!last) return err("Nothing to undo");
    const revision = draftTurn(d).draftRevision;
    d.picks.pop();
    d.teams[last.team].players = d.teams[last.team].players.filter(p => p !== last.player);
    d.pool.push(last.player);
    // Return a pick to its original place in the available-player list.
    const order = d.players || ROSTER;
    d.pool.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    d.revision = revision + 1;
    const extra = { ...draftTurn(d), player:last.player, team:last.team };
    rememberDraftCommand(state, evId, command, extra);
    return ok(extra);
  },
  finalizeDraft(state, payload, ctx) {
    const { evId } = payload;
    const g = gmOnly(ctx); if (g) return g;
    const command = draftCommand(ctx, "finalizeDraft", payload);
    const replay = replayDraftCommand(state, evId, command); if (replay) return replay;
    const ev = allEventsOf(state).find(e => e.id === evId);
    const existing = state.draws?.[evId];
    if (payload.draftId && existing?.sourceDraftId === payload.draftId
        && existing.draft?.revision === payload.draftRevision && existing.draft?.picks.length === payload.pickIndex)
      return ok({ unchanged:true, draftId:payload.draftId, drawId:existing.id });
    const unavailable = draftPreparationError(state, ev); if (unavailable) return unavailable;
    const d = state.drafts?.[evId]; if (!ev || !d) return err("No draft running");
    if (existing) return err("Teams already set");
    const refError = draftReferenceError(d, payload); if (refError) return refError;
    const dataError = draftDataError(d, ev); if (dataError) return dataError;
    if (d.pool.length) return err("Pool not empty yet");
    if (d.teams.some(team => team.players.length !== ev.teamCfg.size))
      return err(`Teams must have exactly ${ev.teamCfg.size} players`);
    const mascots = (ev.teamCfg.size || 0) >= 3 ? shuffle(TEAM_NAMES) : null;
    const now = Date.now(), turn = draftTurn(d), drawId = `d${now}-${crypto.randomUUID()}`;
    state.draws[evId] = { id:drawId, method:"draft", ts:now, sourceDraftId:d.id,
      draft:{ id:d.id, revision:turn.draftRevision, picks:d.picks.map(pick => ({ ...pick })) },
      roles:(d.roles || []).map(role => ({ ...role })),
      teams:d.teams.map((team, index) => ({ captain:team.captain, players:[...team.players],
        ...(mascots ? { name:mascots[index % mascots.length] } : {}) })) };
    delete state.stages[evId];
    if (ev.teamCfg.bracket && state.draws[evId].teams.length === ev.teamCfg.bracket)
      state.brackets[evId] = makeBracket(ev.teamCfg.bracket);
    else delete state.brackets[evId];
    resetContestSetup(state, evId);
    eventOp(state, evId).drawRevealedAt = now;
    eventOp(state, evId).lastDraft = { ...turn, status:"finalized", drawId, endedAt:now };
    delete state.drafts[evId];
    const extra = { ...turn, drawId };
    rememberDraftCommand(state, evId, command, extra);
    return ok(extra);
  },
  cancelDraft(state, payload, ctx) {
    const { evId } = payload;
    const g = gmOnly(ctx); if (g) return g;
    const command = draftCommand(ctx, "cancelDraft", payload);
    const replay = replayDraftCommand(state, evId, command); if (replay) return replay;
    const ev = allEventsOf(state).find(e => e.id === evId);
    const unavailable = draftPreparationError(state, ev); if (unavailable) return unavailable;
    const d = state.drafts?.[evId];
    if (!d) {
      const previous = state.eventOps?.[evId]?.lastDraft;
      if (!payload.draftId || previous?.status === "cancelled" && previous.draftId === payload.draftId
          && previous.pickIndex === payload.pickIndex && previous.draftRevision === payload.draftRevision)
        return ok({ unchanged:true });
      return err("Draft changed, refresh and try again");
    }
    if (state.draws[evId]) return err("Teams already set");
    const refError = draftReferenceError(d, payload); if (refError) return refError;
    const extra = draftTurn(d);
    eventOp(state, evId).lastDraft = { ...extra, status:"cancelled", endedAt:Date.now() };
    delete state.drafts[evId];
    rememberDraftCommand(state, evId, command, extra);
    return ok(extra);
  },

  /* ── the poker finale: the app runs the table, the cards stay physical ── */
  pokerSetup(state, {}, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const ev = allEventsOf(state).find(e => e.finale && e.game === "poker");
    if (!ev) return err("No poker finale on the slate");
    if (state.shelved[ev.id]) return err("The finale is shelved");
    if (state.poker?.id === ev.id)
      return ok({ unchanged:true, total:state.poker.total });
    if (state.results[ev.id]) return err("Result already posted");
    /* the buy-in snapshot must match the board exactly: nothing may still be
       able to move points after stacks are dealt */
    const events = allEventsOf(state);
    if ((state.wagers || []).some(w => resolveWager(state, w, events).status === "pending"))
      return err("Settle or void the open wagers first");
    const rows = computeStandings(state);
    if (rows.some(r => r.pts < 0)) return err("Negative stacks, fix rulings first");
    const distribution = pokerDistribution(rows);
    if (!distribution.ok) return err(distribution.errors[0] || "Invalid poker stacks");
    /* an unplayed duel can no longer move the board, so it cannot block the
       finale either: offers, lapsed offers, and accepted duels still waiting
       on a draw are voided in this same write. Voiding moves no chips. */
    const setupAt = Date.now();
    let voidedDuels = 0;
    (state.duels || []).forEach(d => {
      if (d.status !== "open" || resolveDuel(d).settled) return;
      d.status = "void";
      d.voidedAt = setupAt;
      d.voidReason = "finale";
      voidedDuels++;
    });
    /* nobody rails the finale: anyone under 600 is staked up to 600, logged
       as a ruling so the board shows where the chips came from. pokerCancel
       reverts these, so a cancel-and-reset never grants twice. */
    const minimumGrantIds = [];
    distribution.rows.filter(row => row.grant > 0).forEach(row => {
      const id = crypto.randomUUID();
      minimumGrantIds.push(id);
      state.adjustments.unshift({ id, player:row.player,
        delta:row.grant, reason:"Minimum stack", ts:Date.now() });
    });
    const op = eventOp(state, ev.id);
    delete op.resultEntryAt;
    delete op.completedAt;
    state.poker = {
      id:ev.id,
      total:distribution.total,
      startingStacks:Object.fromEntries(distribution.rows.map(row => [row.player, row.stack])),
      minimumGrantIds,
      startedAt:null,
      levels:pokerLevels(),
      levelOffset:0,
      outs:[],
      counts:{},
      ts:Date.now(),
    };
    return ok({ total:distribution.total, minimumCount:distribution.minimumCount, voidedDuels });
  },
  pokerStart(state, {}, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    if (!state.poker) return err("Set up the table first");
    if (state.poker.startedAt) return ok({ unchanged:true });
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
    if (pk.counts[player] === c) return ok({ unchanged:true });
    pk.counts[player] = c;
    const op = eventOp(state, pk.id);
    if (!op.resultEntryAt) op.resultEntryAt = Date.now();
    return ok();
  },
  /* posting reads the collected counts; outs are 0. Sum mismatches are
     allowed (chips get miscounted); the client shows the discrepancy. */
  pokerResult(state, { noScene }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const pk = state.poker;
    if (!pk?.startedAt) return err("Cards are not live");
    const existing = state.results[pk.id];
    if (existing?.stacks)
      return ok({ unchanged:true, revision:existing.revision || 1 });
    if (existing) return err("A non-poker result is already posted");
    const outSet = new Set(pk.outs.map(o => o.player));
    const missing = ROSTER.filter(p => !outSet.has(p) && pk.counts?.[p] === undefined);
    if (missing.length) return err(`Waiting on ${missing.map(p => disp(state, p)).join(", ")}`);
    const clean = {};
    ROSTER.forEach(p => { clean[p] = outSet.has(p) ? 0 : pk.counts[p]; });
    const max = Math.max(...Object.values(clean));
    if (max <= 0) return err("Every count is 0");
    const leaders = ROSTER.filter(p => clean[p] === max);
    const now = Date.now();
    const op = eventOp(state, pk.id);
    const revision = Math.max(0, Number(op.revision || 0)) + 1;
    state.results[pk.id] = { slots: [[...leaders], [], []], stacks: clean,
      outs: pk.outs.map(o => o.player), ts:now, confirmedAt:now, revision };
    op.revision = revision;
    op.completedAt = now;
    const scene = noScene !== true
      ? tryStartScene(state, ctx, { kind:"winner", eventId:pk.id }, now)
      : null;
    return ok({ revision, ...(scene ? { sceneId:scene.id } : {}) });
  },
  pokerCancel(state, {}, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    if (!state.poker) return ok({ unchanged:true });
    if (state.results[state.poker.id]) return err("Clear the result first");
    /* the table stakes grants belonged to this table */
    const grantIds = new Set(state.poker.minimumGrantIds || []);
    state.adjustments = state.adjustments.filter(a =>
      grantIds.size ? !grantIds.has(a.id) : a.reason !== "Minimum stack");
    const op = eventOp(state, state.poker.id);
    delete op.resultEntryAt;
    delete op.completedAt;
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
      return !!(pr && (pr.size || pr.flightsBooked !== undefined || pr.flightIn || pr.flightOut || pr.color || pr.skin
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
  /* Reset only the rehearsal/gameplay layer. Guest input, trip information,
     and the configured event slate survive, while every derived or live
     tournament fact returns to a clean board. The explicit capability and
     confirmation value protect this production-enabled operation from stale
     or accidental clients. Claims and photos live in separate storage keys
     and are never touched by an action-state reset. */
  resetTournament(state, { confirm }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    if (!ctx.progressReset) return err("Game progress reset is unavailable");
    if (confirm !== RESET_PROGRESS_CONFIRMATION)
      return err("Confirm game progress reset");
    const preserved = Object.fromEntries(RESET_PROGRESS_PRESERVED_KEYS.map(key => [
      key,
      key === "onboardEpoch"
        ? Number(state[key] || 0)
        : structuredClone(state[key] ?? EMPTY_STATE[key]),
    ]));
    Object.assign(state, structuredClone(EMPTY_STATE));
    Object.assign(state, preserved);
    return ok({ preserved:[...RESET_PROGRESS_PRESERVED_KEYS] });
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
  if (pokerTableLocksBoard(state) && !POKER_TABLE_ALLOWED_ACTIONS.has(type))
    return err("Cancel the poker table before changing the board");
  try {
    const result = handler(state, payload || {}, ctx);
    // Opening the first game includes its betting window. Setup alone does
    // not begin the weekend, and rejected actions never change its status.
    if (result.ok && !state.live && (WEEKEND_START_ACTIONS.has(type)
        || type === "setOnDeck" && !!payload?.id)) {
      state.live = true;
      // A legacy client may have opened a game without starting the weekend.
      // This repair is a real write even if the game itself was unchanged.
      if (result.extra?.unchanged) {
        const { unchanged, ...extra } = result.extra;
        return { ...result, extra };
      }
    }
    return result;
  }
  catch (e) { return { ok: false, error: "Action failed: " + (e?.message || e) }; }
}
