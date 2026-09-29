/* Every state mutation lives here and runs inside the Durable Object.
   Handlers mutate `state` in place and return { ok } or { ok:false, error }.
   Optionally { extra } rides back on the ack (e.g. undo snapshots).
   ctx = { isGm, player } where player is the roster name this device claimed. */

import {
  ALL_PLAYERS, ROSTER, isActivePlayer, AWARDS, PT, MAX_RISK, maxRisk, CHIP_MIN, cleanLeg, cleanLogistics, SESSIONS, EMPTY_STATE, SIZES, CHIP_COLORS, CHIP_SKINS, SPORTS, RATINGS, TEAM_NAMES, allEventsOf, disp, resolveWager, computeStandings, atRisk,
  drawTeams, splitIntoGroups, strengthMap, makeBracket, stageFinalists, shuffle, snakeTeam, draftTurn, resolveSlot, OUTRIGHT_MULT,
  DUEL_STAKE, DUEL_GAMES, DUEL_DAILY_LIMIT, resolveDuel, duelAccepted, duelPhase, duelOpen, duelReserve, duelRoom,
  duelBetween, duelsSentToday, pokerLive, stacksPosted, pokerLevels, pokerClockAnchor,
  validateEventParticipants, normalizeOverflowRoles, presentPlayers, isAway, suggestParticipants, bracketMatchOpen, eventInPlay, GAMES,
  resolveEventLifecycle, resolveCurrentContest, contestBetEligibility, wagerMatchesContest, bracketChampion, resultReadiness, contestUndoAvailability,
  pokerDistribution, wagerMult, contestMult, contestSideOf, stageEntrantView, resolveWeekendOperation,
  RESET_PROGRESS_CONFIRMATION, RESET_PROGRESS_PRESERVED_KEYS,
  enforceExposure, refundTotals, voidWagerRecords, contestStackOf, contestEntryLabel, applyContestCorrection,
  contestCorrectionAvailability, announcementTakeBack, lockerRoomAvailability, pokerSetupPreview, wagerSide,
} from "../shared/core.js";
import {
  SHOW_HISTORY_LIMIT,
  SHOW_TERMINAL_OUTCOMES,
  createShowScene,
  finishShowScene,
  retireFinishedShowScene,
  sceneAtLastStep,
  showDefinition,
  validateShowSceneRequest,
  postedFinalUndo,
  resolveShowScene,
  championIdentity,
} from "../shared/show.js";
import { validateSpotifyTrack } from "../shared/audio.js";
import { QA_PROGRESS_KEYS } from "../shared/qa.js";
import { QaStop, cleanSeed, parseQaTarget, qaNeedsRewind, qaProgressCost, resetProgress, runQaAdvance } from "./qa.js";
import { PROMPT_ACTIONS, PROMPT_ACTION_TYPES } from "./prompts.js";

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
  control.active = createShowScene(checked.request, {
    id:`show-${now}-${crypto.randomUUID()}`,
    now,
    ...sceneStamp(state, checked),
  });
  return control.active;
};
/* what a scene is FOR, stamped at start: the result revision a winner scene
   plays, the champion a champion scene crowns */
const sceneStamp = (state, checked) => ({
  revision:checked.definition.requiresResult
    ? Number(state.results?.[checked.request.eventId]?.revision || 1) : null,
  ...(checked.request.kind === "champion" ? { champion:championIdentity(state) } : {}),
});
/* A manual start may replace a scene that has nothing left to say: one on
   its last step retires as completed, a stale one as cancelled. A scene
   still mid-sequence has to be finished or cancelled first. */
const clearFinishedScene = (state, control, now) => {
  if (!control.active) return true;
  if (resolveShowScene(state, allEventsOf(state))?.staleReason) {
    finishShowScene(control, "cancelled", now);
    return true;
  }
  if (sceneAtLastStep(control.active)) {
    finishShowScene(control, "completed", now);
    return true;
  }
  return false;
};
/* Official preparation and start writes retire a scene that is already on
   its last step. Presentation only: never an error, never a tournament fact. */
const SCENE_RETIRING_ACTIONS = new Set([
  "runDraw", "clearDraw", "runStages", "clearStages",
  "startDraft", "pickDraftPlayer", "undoDraftPick", "finalizeDraft", "cancelDraft",
  "announceAndDraw", "lockAndStart", "startEvent", "pokerSetup", "pokerStart",
]);
const retireSceneAfter = (state, ctx, type) => {
  if (!ctx?.showControl || !SCENE_RETIRING_ACTIONS.has(type)) return null;
  if (!state.showControl?.active) return null;
  return retireFinishedShowScene(showControlOf(state));
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
/* one guard for every commissioner action that moves chips already on the
   board: a crowned board stays crowned until someone unfreezes it */
const frozenGuard = state => state.frozen ? err("The board is frozen") : null;
const actorOf = ctx => ctx?.player || "commissioner";
const pendingWagers = (state, test = () => true, events = allEventsOf(state)) =>
  (state.wagers || []).filter(w => test(w) && resolveWager(state, w, events).status === "pending");
const openBetsError = (count, what) => count
  ? err(`Void the ${count} open bet${count === 1 ? "" : "s"} on this ${what} first`) : null;
/* a redraw would silently void every ticket written against the old teams or
   groups, so the commissioner voids them (or plays them out) first */
const drawBetsError = (state, evId, what = "draw") => {
  const draw = what === "draw" && state.draws?.[evId], st = state.stages?.[evId];
  return openBetsError(pendingWagers(state, w => w.eventId === evId
    && (!!draw && w.drawId === draw.id || !!st && w.stagesId === st.id)).length, what);
};
/* enforceExposure lives in core so a correction preview can run it on a
   clone and name exactly what the write will void. */
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
    /* a 2:1 ticket never absorbs an even-money chip, or vice versa */
    ? [...(wager?.pickTeam
      ? ["team", wager?.drawId, [...(wager?.pickPlayers || [])].sort()]
      : ["player", wager?.pick]), ...(wagerMult(wager) === OUTRIGHT_MULT ? [] : [wagerMult(wager)])]
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
  "pokerSetup", "pokerStart", "pokerLevel", "pokerPause", "pokerBust", "pokerUnbust",
  "pokerCount", "pokerResult", "pokerCancel",
  "setFrozen", "resetTournament", "qaAdvance", "qaRestore",
  /* D6: ballots never touch the board */
  ...PROMPT_ACTION_TYPES,
]);
/* QA writes are rehearsal tools on a server that may hold real guests.
   Anything outside local and staging counts as production. Production always
   takes the reset confirmation; anywhere, a write that throws away recorded
   results or bets takes it too, and live cards take their own confirm. */
const qaProduction = ctx => !["local", "staging"].includes(ctx?.environment);
const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;
function qaGate(state, payload, ctx, discards) {
  if (!ctx.qa) return err("QA is unavailable");
  if (discards && !ctx.progressReset) return err("Game progress reset is unavailable");
  if (pokerLive(state) && payload?.confirmPokerLive !== true)
    return err("Cards are live at the table", { needsPokerConfirm:true });
  if (payload?.confirm === RESET_PROGRESS_CONFIRMATION) return null;
  const cost = qaProgressCost(state);
  const lost = [cost.results && plural(cost.results, "result"), cost.bets && plural(cost.bets, "bet")].filter(Boolean);
  if (discards && lost.length)
    return err(`Replaces ${lost.join(" and ")}`, { needsConfirm:true, production:qaProduction(ctx), cost });
  if (qaProduction(ctx))
    return err(discards ? "Replaces production game progress" : "Changes production game progress",
      { needsConfirm:true, production:true, cost });
  return null;
}
/* a stored checkpoint value must have the shape a fresh state has */
const progressShapeOk = (key, value) => {
  const empty = EMPTY_STATE[key];
  if (empty === null) return value === null || typeof value === "string"
    || (!!value && typeof value === "object" && !Array.isArray(value));
  if (Array.isArray(empty)) return Array.isArray(value);
  if (typeof empty === "object") return !!value && typeof value === "object" && !Array.isArray(value);
  return typeof value === typeof empty;
};

const WEEKEND_START_ACTIONS = new Set([
  "announceEvent", "announceAndDraw", "startEvent", "lockAndStart", "pokerStart",
]);
/* opening betting (or starting play) before the weekend is live starts it */
const startsWeekend = (state, type, payload) => !state.live
  && (WEEKEND_START_ACTIONS.has(type) || type === "setOnDeck" && !!payload?.id);
/* legacy tables and full rooms seat the whole roster */
const seatsOf = pk => Array.isArray(pk?.seats) ? pk.seats : ROSTER;
const pokerTableLocksBoard = state =>
  !!(state.poker && !state.results?.[state.poker.id]);
/* seats still holding chips: not busted and not counted at 0 */
const stillIn = pk => ROSTER.filter(p => !pk.outs.some(o => o.player === p) && pk.counts?.[p] !== 0);
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
  delete op.contestStack;
  delete op.bettingOpenedAt;
  delete op.bettingLockedAt;
  delete op.announcedAt;
};
/* The announcement's server time: every screen times the intro and the
   draw reveal from it (src/features/weekend/drawReveal.js revealTimeline),
   so the room turns each card together. Stamped only by a fresh
   announcement, never by the next contest opening inside a started event. */
const stampAnnouncement = (op, now) => { op.announcedAt = now; };
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
    payload.winner, Array.isArray(payload.qualifiers) ? [...payload.qualifiers].sort() : null,
    /* older commands keep their exact fingerprint */
    ...(payload.order !== undefined || payload.postResult !== undefined
      ? [payload.order ?? null, payload.postResult === true] : [])]),
});
/* The places a completed contest sequence already decides. A bracket: the
   champion, the final's loser, and the teams that lost the round before the
   final sharing 3rd. A stage final: its finish order, where two finalists
   need only the winner. Null until every paid place is known. */
const placesPaid = ev => (AWARDS[ev?.value] || [0, 0, 0]).filter(pts => pts > 0).length;
function contestPlacement(state, ev, contest, order) {
  const table = AWARDS[ev.value] || [0, 0, 0];
  const draw = state.draws[ev.id];
  const known = key => key !== null && key !== undefined;
  if (contest.kind === "match") {
    const br = state.brackets[ev.id];
    const champion = br ? bracketChampion(br) : null;
    if (!known(champion) || !draw?.teams?.[champion]) return null;
    const final = br.rounds[br.rounds.length - 1][0];
    const runner = [resolveSlot(br, final.a), resolveSlot(br, final.b)].find(key => known(key) && key !== champion);
    const before = br.rounds.length > 1 ? br.rounds[br.rounds.length - 2] : [];
    const third = before.map(match => [resolveSlot(br, match.a), resolveSlot(br, match.b)]
      .find(key => known(key) && key !== match.winner)).filter(key => known(key) && draw.teams[key]);
    return [[...draw.teams[champion].players],
      table[1] > 0 && known(runner) ? [...draw.teams[runner].players] : [],
      table[2] > 0 ? third.flatMap(key => draw.teams[key].players) : []];
  }
  if (contest.kind === "stage-final") {
    const st = state.stages[ev.id];
    const finalists = stageFinalists(st) || [];
    const placed = Array.isArray(order) ? [...order] : [st.finalWinner];
    if (placed.length === finalists.length - 1) placed.push(finalists.find(key => !placed.includes(key)));
    const needed = Math.min(placesPaid(ev), finalists.length);
    if (placed.length < needed) return null;
    return [0, 1, 2].map(place => place < needed && table[place] > 0 && known(placed[place])
      ? [...stageEntrantView(state, st, placed[place]).players] : []);
  }
  return null;
}
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
/* A draft plays the shape the room had when it started (fewer teams when
   people are away). Legacy drafts carry no fit and use the event format. */
const draftFit = (draft, ev) => draft?.fit || ev?.teamCfg;
const draftConfigurationError = (ev, fit = ev?.teamCfg) => {
  const cfg = fit;
  if (!ev?.teamCfg || !cfg || !Number.isInteger(cfg.teams) || cfg.teams < 2
      || !Number.isInteger(cfg.size) || cfg.size < 1 || cfg.teams * cfg.size > ROSTER.length)
    return err("Invalid team setup");
  if (ev.teamCfg.bracket && !makeBracket(cfg.teams))
    return err(`Unsupported ${cfg.teams}-team bracket`);
  return null;
};
const draftDataError = (draft, ev) => {
  const fit = draftFit(draft, ev);
  const config = draftConfigurationError(ev, fit); if (config) return config;
  if (!draftTurn(draft) || draft.teams.length !== fit.teams)
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
      || team.players.length > fit.size || !slotsEqual(team.players, expected[index])))
    return err("Draft teams do not match the picks");
  const players = [...draft.teams.flatMap(team => team.players), ...draft.pool];
  if (new Set(players).size !== players.length || players.some(player => !ROSTER.includes(player)))
    return err("Only confirmed players can participate");
  if (players.length !== fit.teams * fit.size)
    return err(`Select exactly ${fit.teams * fit.size} players`);
  return null;
};
/* One market and one game at a time: a new event cannot be announced while
   another is being played. force is the explicit override. */
const playingElsewhere = (state, evId, force) => {
  if (force === true) return null;
  const playing = allEventsOf(state).find(other => other.id !== evId && eventInPlay(state, other));
  return playing ? err(`Finish ${playing.name} first`) : null;
};

export const ACTIONS = {
  /* D6: awards ballots (worker/prompts.js), honors only */
  ...PROMPT_ACTIONS,
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
    /* A late guest with no color yet makes one first claim while live: a free
       color and a pattern together. Established chips stay locked. */
    const firstClaim = state.live && !ctx.isGm && !prof.color;
    if (firstClaim && (typeof color !== "string" || !color)) return err("Choose a chip color");
    if (color !== undefined) {
      if (state.live && !ctx.isGm && !firstClaim && color !== prof.color) return err("Chips locked for the weekend");
      if (color === null) delete prof.color;
      else {
        if (!CHIP_COLORS.find(c => c.hex === color)) return err("Bad color");
        const taken = Object.entries(state.profiles).find(([p, pr]) => p !== player && pr?.color === color);
        if (taken) return err(`${disp(state, taken[0])} already has that color`);
        prof.color = color;
      }
    }
    if (firstClaim && (skin === undefined || skin === null)) prof.skin = prof.skin || CHIP_SKINS[0];
    else if (skin !== undefined) {
      if (state.live && !ctx.isGm && !firstClaim && skin !== prof.skin) return err("Chips locked for the weekend");
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
    const checked = validateShowSceneRequest(state, request, allEventsOf(state));
    if (!checked.ok) return err(checked.error);
    const now = Date.now();
    if (!clearFinishedScene(state, control, now)) return err("Finish or cancel the current scene first");
    control.active = createShowScene(checked.request, {
      id:`show-${now}-${crypto.randomUUID()}`,
      now,
      ...sceneStamp(state, checked),
    });
    rememberShowCommand(control.active, commandId, "start", fingerprint);
    return ok({ sceneId:control.active.id });
  },
  /* The director's one replay beat: whatever is on the TV (the stale scene
     a correction left behind, or a finished one) retires and the winner
     scene for the current result revision starts, in one write. */
  replayWinnerScene(state, { eventId }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const enabled = showOnly(ctx); if (enabled) return enabled;
    const control = showControlOf(state);
    const commandId = showCommandId(ctx);
    if (!commandId) return err("This show command is missing a request id");
    const fingerprint = showCommandFingerprint("winner", eventId || null);
    const replay = showCommandReplay(control, commandId, "replay", fingerprint);
    if (replay) return replay;
    const checked = validateShowSceneRequest(state, { kind:"winner", eventId }, allEventsOf(state));
    if (!checked.ok) return err(checked.error);
    const now = Date.now();
    if (control.active) {
      const stale = resolveShowScene(state, allEventsOf(state))?.staleReason;
      finishShowScene(control, stale ? "cancelled" : sceneAtLastStep(control.active) ? "completed" : "skipped", now);
    }
    control.active = createShowScene(checked.request, {
      id:`show-${now}-${crypto.randomUUID()}`,
      now,
      ...sceneStamp(state, checked),
    });
    rememberShowCommand(control.active, commandId, "replay", fingerprint);
    return ok({ sceneId:control.active.id, revision:control.active.revision });
  },
  /* Skip the ceremony a result still owes: a stale scene for it clears and
     the history records this revision as skipped, so the beat stops asking. */
  skipWinnerReplay(state, { eventId }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const enabled = showOnly(ctx); if (enabled) return enabled;
    const control = showControlOf(state);
    const commandId = showCommandId(ctx);
    if (!commandId) return err("This show command is missing a request id");
    const fingerprint = showCommandFingerprint("skip-winner", eventId || null);
    const replay = showCommandReplay(control, commandId, "skip", fingerprint);
    if (replay) return replay;
    const result = state.results?.[eventId];
    if (!result?.slots?.[0]?.length) return err("Post the official result first");
    const revision = Number(result.revision || 1);
    const now = Date.now();
    if (control.active?.kind === "winner" && control.active.eventId === eventId) {
      const stale = resolveShowScene(state, allEventsOf(state))?.staleReason;
      finishShowScene(control, stale ? "cancelled" : "skipped", now);
    }
    const entry = { id:`show-${now}-${crypto.randomUUID()}`, kind:"winner", eventId, startedAt:now, endedAt:now,
      outcome:"skipped", retryOf:null, revision, commands:[] };
    rememberShowCommand(entry, commandId, "skip", fingerprint);
    control.history = [entry, ...control.history].slice(0, SHOW_HISTORY_LIMIT);
    return ok({ sceneId:entry.id, revision });
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
      ...sceneStamp(state, checked),
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
    const held = contestSideOf(state, contest, player, events);
    if (held !== null && held !== sideKey) return err("One side per contest. Your chips are on the other side");
    if (clean.kind === "outright") clean.mult = contestMult(contest);

    /* Exposure and balance remain server authoritative. */
    const pts = computeStandings(state).find(r => r.player === player)?.pts ?? 0;
    const exp = atRisk(state, player, events);
    const antes = duelReserve(state, player);
    if (stake > pts - exp - antes) return err("Not enough chips");
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
  /* voiding a settled ticket moves posted chips, so it takes a reason and
     records who and when; a pending one only returns its stake */
  voidWager(state, { id, reason }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const w = state.wagers.find(x => x.id === id);
    if (!w) return err("No such wager");
    if (w.status === "void") return ok({ unchanged:true });
    const frozen = frozenGuard(state); if (frozen) return frozen;
    const was = resolveWager(state, w, allEventsOf(state)).status;
    const why = cleanCorrectionReason(reason);
    if (["won", "lost"].includes(was) && !why) return err("Reason required to void a settled bet");
    const now = Date.now();
    Object.assign(w, { status:"void", voidedAt:now, voidedBy:actorOf(ctx), voidedFrom:was,
      ...(why ? { voidReason:why } : {}) });
    const voided = enforceExposure(state, now);
    if (voided.length) w.cascade = voided;
    return ok({ voided });
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
    /* someone who is not at the venue cannot play a phone duel */
    if (isAway(state, from)) return err(`${disp(state, from)} is away`);
    if (!anyone && isAway(state, to)) return err(`${disp(state, to)} is away`);
    const g = game || "quickdraw";
    if (!DUEL_GAMES[g]) return err("Unknown game");
    const now = Date.now();
    if (!anyone && duelBetween(state, from, to, now))
      return err(`You already have a duel going with ${disp(state, to)}`);
    if (anyone && state.duels.some(d => d.open && d.from === from && duelPhase(d, now) === "offered"))
      return err("You already have an open challenge");
    if (duelsSentToday(state, from, now) >= DUEL_DAILY_LIMIT)
      return err("Daily limit of 3 challenges reached");
    /* the challenger names the ante; both sides put up the same amount */
    const stake = want === undefined ? DUEL_STAKE : Math.floor(Number(want));
    if (!(Number.isInteger(stake) && stake % PT === 0 && stake >= PT))
      return err("Antes move in 100s");
    /* the wager cap covers duels too, or a duel would be a way around it */
    const events = allEventsOf(state);
    const rows = computeStandings(state);
    const mine = duelRoom(state, from, { events, rows, now });
    if (mine.capRoom < stake) return err(`Max ${mine.cap} at risk`);
    if (mine.balanceRoom < stake) return err("Not enough chips");
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
    if (isAway(state, p)) return err(`${disp(state, p)} is away`);
    if (isAway(state, d.from)) return err(`${disp(state, d.from)} is away`);
    if (d.open && duelBetween(state, d.from, p, now))
      return err(`You already have a duel going with ${disp(state, d.from)}`);
    const room = duelRoom(state, p, { now });
    if (room.capRoom < d.stake) return err(`Max ${room.cap} at risk`);
    if (room.balanceRoom < d.stake) return err("Not enough chips");
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
  voidDuel(state, { id, reason }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const d = (state.duels || []).find(x => x.id === id);
    if (!d) return err("No such duel");
    if (d.status === "void") return ok({ unchanged:true });
    const frozen = frozenGuard(state); if (frozen) return frozen;
    const settled = d.status === "open" && resolveDuel(d).settled && !resolveDuel(d).push;
    const why = cleanCorrectionReason(reason);
    if (settled && !why) return err("Reason required to void a settled duel");
    const now = Date.now();
    Object.assign(d, { voidedFrom:d.status, status:"void", voidedAt:now, voidedBy:actorOf(ctx),
      ...(why ? { voidReason:why } : {}) });
    const voided = enforceExposure(state, now);
    if (voided.length) d.cascade = voided;
    return ok({ voided });
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
    if (ev.finale) return err("Enter chip counts instead");
    if (!Array.isArray(slots) || !slots[0]?.length) return err("Winners required");
    if (slots.length > 3 || !slots.every(s => Array.isArray(s) && s.every(p => ROSTER.includes(p))))
      return err("Bad slots");
    const placed = slots.flat();
    if (new Set(placed).size !== placed.length) return err("A player is listed twice");
    const cleanSlots = slots.map(s => [...s]);
    const existing = state.results[evId];
    if (existing && slotsEqual(existing.slots, cleanSlots))
      return ok({ unchanged:true, revision:existing.revision || 1 });
    const frozen = frozenGuard(state); if (frozen) return frozen;
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
      const entry = {
        type:"overwrite",
        at:now,
        by:ctx.player || "commissioner",
        reason,
        fromRevision:Number(existing.revision || 1),
        previousSlots:existing.slots.map(slot => [...(slot || [])]),
      };
      state.results[evId] = {
        slots:cleanSlots,
        ts:now,
        confirmedAt:existing.confirmedAt || existing.ts || now,
        correctedAt:now,
        correctionReason:reason,
        revision,
      };
      op.revision = revision;
      const voided = enforceExposure(state, now);
      appendCorrection(state, evId, voided.length ? { ...entry, voided } : entry);
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
    const frozen = frozenGuard(state); if (frozen) return frozen;
    const now = Date.now();
    const entry = {
      type:"clear",
      at:now,
      by:ctx.player || "commissioner",
      reason,
      fromRevision:Number(existing.revision || 1),
      previousSlots:(existing.slots || []).map(slot => [...(slot || [])]),
      hadStacks:!!existing.stacks,
    };
    delete state.results[evId];
    const op = eventOp(state, evId);
    op.resultEntryAt = now;
    delete op.completedAt;
    const voided = enforceExposure(state, now);
    appendCorrection(state, evId, voided.length ? { ...entry, voided } : entry);
    return ok({ revision:Number(op.revision || existing.revision || 1), voided });
  },

  /* ── GM: slate ── */
  setOnDeck(state, { id, contestId, contestRevision, force }, ctx) {
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
    if (ev.finale)
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
    const busy = playingElsewhere(state, id, force); if (busy) return busy;
    if (ev.teamCfg && !state.draws[id]) return err("Set the teams before opening betting");
    if (ev.stageCfg && !state.stages[id]) return err(`Set up ${ev.stageCfg.kind} first`);
    if (eventHasBegun(state, ev) || state.eventOps?.[id]?.resultEntryAt) return err("The event has already started");
    const op = eventOp(state, id);
    if (op.contest) {
      const refError = contestReferenceError(state, ev, { contestId, contestRevision }); if (refError) return refError;
    }
    const now = Date.now();
    const opened = openContest(state, ev, now);
    if (opened.ok) stampAnnouncement(op, now);
    return opened;
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
  announceEvent(state, { evId, contestId, contestRevision, force }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    if (!evId) return err("No such event");
    const result = ACTIONS.setOnDeck(state, { id:evId, contestId, contestRevision, force }, ctx);
    if (!result.ok || result.extra?.unchanged) return result;
    const scene = tryStartScene(state, ctx, { kind:"event-intro", eventId:evId });
    return ok({ ...(scene ? { sceneId:scene.id } : {}) });
  },
  /* The one-tap team-event open: draw runs, bracket seeds, and betting
     opens in ONE broadcast, so every phone plays intro then reveal by
     itself through the existing announce chain. No directed scene: the
     legacy ceremony owns this moment on every screen. */
  announceAndDraw(state, { evId, players, roles, force, cfg }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    if (state.frozen) return err("The board is frozen");
    const ev = allEventsOf(state).find(e => e.id === evId);
    const heats = !ev?.teamCfg && ev?.stageCfg?.kind === "heats";
    if (!ev?.teamCfg && !heats) return err("Nothing to draw for this event");
    if (state.results[evId]) return err("Result already posted");
    if (state.shelved[evId]) return err("That event is shelved");
    if (stacksPosted(state)) return err("The finale is settled");
    if (state.drafts[evId] && !state.draws[evId])
      return err("Finish or cancel the captains draft");
    if (eventHasBegun(state, ev) || state.eventOps?.[evId]?.resultEntryAt) return err("The event has already started");
    if (state.onDeck && state.onDeck !== evId) return err("Close the current betting market first");
    if (state.onDeck !== evId) { const busy = playingElsewhere(state, evId, force); if (busy) return busy; }
    const op = eventOp(state, evId);
    /* No selection means the director's default: everyone present plays and
       the overflow is whoever has sat out least. */
    const chosen = Array.isArray(players) && players.length;
    const suggestion = chosen ? null : suggestParticipants(state, ev);
    const pick = chosen ? players : suggestion?.players || [];
    const crew = chosen ? roles : suggestion?.roles || [];
    const present = presentPlayers(state);
    const now = Date.now();
    let drew = false;
    if (ev.teamCfg && !state.draws[evId]) {
      const compatible = validateEventParticipants(ev, pick, present);
      if (!compatible.ok) return err(compatible.error);
      if (ev.teamCfg.bracket && !makeBracket(compatible.fit?.teams || ev.teamCfg.bracket))
        return err(`Unsupported ${compatible.fit?.teams || ev.teamCfg.bracket}-team bracket`);
      const draw = drawTeams(ev, state, compatible.players, present);
      if (!draw) return err("Draw failed");
      draw.roles = normalizeOverflowRoles(compatible.players, present, crew, ev);
      state.draws[evId] = draw;
      delete state.stages[evId];
      if (ev.teamCfg.bracket) state.brackets[evId] = makeBracket(draw.teams.length);
      else delete state.brackets[evId];
      op.drawRevealedAt = now;
      drew = true;
    }
    let announced = false;
    if (state.onDeck !== evId) {
      if (ev.stageCfg && !state.stages[evId]) {
        /* the commissioner may pick the group count and advancers */
        const shape = { ...ev.stageCfg,
          ...(Number.isInteger(cfg?.nGroups) ? { nGroups:cfg.nGroups } : {}),
          ...(cfg?.advance === 1 || cfg?.advance === 2 ? { advance:cfg.advance } : {}) };
        const prepared = ACTIONS.runStages(state, { evId,
          cfg:heats ? { ...shape, players:pick, roles:crew } : shape }, ctx);
        if (!prepared.ok) return prepared;
        if (heats) { op.drawRevealedAt = now; drew = true; }
      }
      const opened = openContest(state, ev, now);
      if (!opened.ok) return opened;
      stampAnnouncement(op, now);
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
    /* a stage final may carry its finish order, winner first */
    const order = payload.order === undefined ? null : payload.order;
    if (order !== null && (contest.kind !== "stage-final" || !Array.isArray(order) || !order.length
        || order[0] !== winner || new Set(order).size !== order.length
        || order.some(key => !contest.sides.some(side => side.key === key))))
      return err("Choose the finish order from the finalists");
    let through;
    if (contest.kind === "heat") {
      const st = state.stages[evId];
      through = qualifiers === undefined && st.advance === 1 ? [winner] : qualifiers;
      if (!Array.isArray(through) || through.length !== st.advance || new Set(through).size !== through.length
          || !through.includes(winner) || through.some(key => !contest.sides.some(side => side.key === key)))
        return err(`Choose the winner and ${st.advance} qualifier${st.advance === 1 ? "" : "s"}`);
    }
    const op = eventOp(state, evId);
    const by = ctx.player || "commissioner", decidedAt = Date.now();
    const entry = { id:contest.id, kind:contest.kind, revision:contest.revision,
      match:contest.match, group:contest.group, stagesId:contest.stagesId, drawId:contest.drawId,
      previousWinner:contest.kind === "match"
        ? state.brackets[evId].rounds[contest.match[0]][contest.match[1]].winner
        : contest.kind === "heat" ? state.stages[evId].groups[contest.group].winner : state.stages[evId].finalWinner,
      previousThrough:contest.kind === "heat" ? [...(state.stages[evId].groups[contest.group].through || [])] : undefined,
      winner, by, decidedAt };
    entry.short = contestEntryLabel(state, ev, entry);
    /* every recorded contest stays correctable: the stack keeps what each
       one replaced, and lastContest mirrors its top for older readers */
    op.contestStack = [...contestStackOf(state, evId), entry].slice(-40);
    op.lastContest = entry;
    /* who recorded each decision, so a wrong tap can be traced */
    op.contestLog = [...(Array.isArray(op.contestLog) ? op.contestLog : []),
      { id:contest.id, winner, by, at:decidedAt }].slice(-40);
    if (contest.kind === "match") {
      const br = state.brackets[evId];
      br.rounds[contest.match[0]][contest.match[1]].winner = winner;
      if (br.next?.[0] === contest.match[0] && br.next?.[1] === contest.match[1]) delete br.next;
    }
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
    /* The final's winner can post the official result in the same write,
       through saveResult itself: same validation, revision, and winner
       scene. A stage final posts only once its paid places are known. */
    let posted = null;
    if (!next && payload.postResult === true && !state.results[evId]) {
      const slots = contestPlacement(state, ev, contest, order);
      if (slots) {
        const saved = ACTIONS.saveResult(state, { evId, slots, noScene:payload.noScene }, ctx);
        if (!saved.ok) return saved;
        posted = saved.extra || {};
        /* the recorded entry remembers the result it posted, for its Undo */
        op.lastContest.postedRevision = posted.revision;
        const top = op.contestStack?.at(-1);
        if (top && top.id === op.lastContest.id) top.postedRevision = posted.revision;
      }
    }
    rememberContestCommand(state, evId, command);
    if (posted) return ok({ posted:true, revision:posted.revision, ...(posted.sceneId ? { sceneId:posted.sceneId } : {}) });
    return ok({ ...(next ? { contestId:op.contest.id, contestRevision:op.contest.revision } : { awaitingResult:true }) });
  },
  /* Correct any recorded contest of this event. The contest and every one
     recorded after it rewind in this write: chips on the rewound contests
     and on the next market go back, the undone winnings return to pending,
     and exposure is enforced. Betting stays locked; the corrected contest is
     current again at a fresh revision. contestId names the recorded contest,
     contestRevision is the event's current revision (the stale-phone guard). */
  correctContest(state, payload, ctx) {
    const { evId, contestId, contestRevision } = payload;
    const g = gmOnly(ctx); if (g) return g;
    const command = contestCommand(ctx, "correctContest", payload);
    const replay = replayContestCommand(state, evId, command); if (replay) return replay;
    const ev = allEventsOf(state).find(event => event.id === evId);
    if (!ev) return err("No such event");
    if (typeof contestId !== "string" || !contestStackOf(state, evId).some(entry => entry.id === contestId))
      return err("Contest changed, refresh and try again");
    /* a final whose winner posted the result is corrected with that result */
    const postedFinal = contestStackOf(state, evId).at(-1)?.id === contestId ? postedFinalUndo(state, ev) : null;
    const available = postedFinal || contestCorrectionAvailability(state, ev, contestId);
    if (!available.enabled) return err(available.blocker);
    if (contestRevision !== available.contestRevision)
      return err("Contest changed, refresh and try again");
    const now = Date.now();
    if (postedFinal) {
      const existing = state.results[evId];
      delete state.results[evId];
      delete eventOp(state, evId).completedAt;
      appendCorrection(state, evId, { type:"clear", at:now, by:actorOf(ctx), reason:"Final winner undone",
        fromRevision:Number(existing.revision || 1),
        previousSlots:(existing.slots || []).map(slot => [...(slot || [])]) });
      /* the ceremony for a result that no longer exists leaves the TV */
      const active = state.showControl?.active;
      if (active?.kind === "winner" && active.eventId === evId) finishShowScene(showControlOf(state), "cancelled", now);
    }
    const moved = applyContestCorrection(state, ev, contestId, now);
    if (moved.voidIds.length || moved.voided.length || moved.rewinds.length)
      appendCorrection(state, evId, { type:"correct-contest", at:now, by:actorOf(ctx),
        reason:"Previous contest reopened", contestId, rewinds:moved.rewinds,
        returned:moved.voidIds, ...(moved.voided.length ? { voided:moved.voided } : {}) });
    rememberContestCommand(state, evId, command);
    return ok(moved);
  },
  /* The most recent recorded contest only: the quick Undo. */
  undoLastContest(state, payload, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const replay = replayContestCommand(state, payload.evId, contestCommand(ctx, "correctContest", payload));
    if (replay) return replay;
    const top = contestStackOf(state, payload.evId).at(-1);
    if (!top) return err("No previous contest to correct");
    if (payload.contestId !== top.id) return err("Contest changed, refresh and try again");
    return ACTIONS.correctContest(state, payload, ctx);
  },
  /* Play a different seated matchup first. Only while the current market is
     open and empty, so exactly one market exists and no chip changes target. */
  playContestNext(state, payload, ctx) {
    const { evId, match } = payload;
    const g = gmOnly(ctx); if (g) return g;
    const command = contestCommand(ctx, "playContestNext", { ...payload, winner:JSON.stringify(match) });
    const replay = replayContestCommand(state, evId, command); if (replay) return replay;
    if (state.frozen) return err("The board is frozen");
    const ev = allEventsOf(state).find(event => event.id === evId);
    if (!ev) return err("No such event");
    const refError = contestReferenceError(state, ev, payload, true); if (refError) return refError;
    const contest = resolveCurrentContest(state, ev);
    if (contest.kind !== "match") return err("Only bracket matches can be reordered");
    if (contest.phase !== "betting-open") return err("Choose the next match before betting locks");
    if (!Array.isArray(match) || match.length !== 2) return err("No such matchup");
    const [r, m] = match;
    if (contest.match[0] === r && contest.match[1] === m) return ok({ unchanged:true });
    const br = state.brackets[evId];
    if (!bracketMatchOpen(br, r, m)) return err("That match is not ready");
    const events = allEventsOf(state);
    if ((state.wagers || []).some(wager => wagerMatchesContest(wager, contest)
        && resolveWager(state, wager, events).status === "pending"))
      return err("Reorder once the chips on this match come off");
    br.next = [r, m];
    const opened = openContest(state, ev);
    if (!opened.ok) return opened;
    rememberContestCommand(state, evId, command);
    return opened;
  },
  /* Replace one drawn player before their contest starts. The draw id and
     team indices stay, so match tickets on that team survive; only outright
     tickets that name the player who left are voided. */
  swapPlayer(state, { evId, out, into }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    if (state.frozen) return err("The board is frozen");
    if (stacksPosted(state)) return err("The finale is settled");
    const ev = allEventsOf(state).find(event => event.id === evId);
    if (!ev) return err("No such event");
    if (state.results[evId]) return err("Result already posted");
    if (out === into || !ROSTER.includes(out) || !ROSTER.includes(into)) return err("Choose two different players");
    if (isAway(state, into)) return err(`${disp(state, into)} is marked away`);
    const draw = state.draws[evId], st = state.stages[evId];
    const contest = resolveCurrentContest(state, ev);
    const started = key => contest && contest.sides.some(side => side.key === key)
      && ["betting-locked", "in-progress", "awaiting-result"].includes(contest.phase);
    const decided = value => value !== null && value !== undefined;
    const events = allEventsOf(state);
    const pending = state.wagers.filter(wager => wager.eventId === evId
      && resolveWager(state, wager, events).status === "pending");
    let voided = [];
    if (draw) {
      const teamIdx = draw.teams.findIndex(team => team.players.includes(out));
      if (teamIdx < 0) return err(`${disp(state, out)} is not on a team`);
      if (draw.teams.some(team => team.players.includes(into))) return err(`${disp(state, into)} is already playing`);
      const br = state.brackets[evId];
      if (br?.rounds.some(round => round.some(match => decided(match.winner)
          && [resolveSlot(br, match.a), resolveSlot(br, match.b)].includes(teamIdx))))
        return err("That team has already played");
      if (st?.groups?.some(group => group.entrants.includes(teamIdx)
          && ((group.through || []).length || decided(group.winner))))
        return err("That team has already played");
      if (started(teamIdx)) return err("Their contest has already started");
      const team = draw.teams[teamIdx];
      team.players = team.players.map(player => player === out ? into : player);
      if (team.captain === out) team.captain = into;
      draw.roles = (draw.roles || []).filter(item => item.player !== into);
      voided = pending.filter(wager => wager.kind === "outright"
        && (wager.pick === out || (wager.pickPlayers || []).includes(out)));
      /* surviving team tickets settle by team index; refresh the names shown */
      pending.filter(wager => wager.kind !== "outright" && wager.pickTeam
          && (wager.kind === "match" ? wager.teamIdx : wager.pickKey) === teamIdx)
        .forEach(wager => { wager.pickPlayers = [...team.players]; });
    } else if (st?.entrantType === "solo") {
      const group = st.groups.find(item => item.entrants.includes(out));
      if (!group) return err(`${disp(state, out)} is not in a heat`);
      if (st.groups.some(item => item.entrants.includes(into))) return err(`${disp(state, into)} is already playing`);
      if ((group.through || []).length || decided(group.winner)) return err("That heat has already played");
      if (started(out)) return err("Their contest has already started");
      group.entrants = group.entrants.map(key => key === out ? into : key);
      st.roles = (st.roles || []).filter(item => item.player !== into);
      voided = pending.filter(wager => wager.pick === out || wager.pickKey === out);
    } else return err("Nothing to swap in this event");
    const now = Date.now();
    const outReturned = voidWagerRecords(state, voided.map(wager => wager.id), `${disp(state, out)} swapped out`, now);
    /* the player coming in is now a competitor: chips they already had on
       another side of the contest they joined go back in the same write */
    const joined = resolveCurrentContest(state, ev);
    const conflicts = joined ? pending.filter(wager => wager.player === into && wager.status !== "void"
      && wagerMatchesContest(wager, joined) && !contestBetEligibility(joined, into, wagerSide(state, wager))) : [];
    const intoReturned = voidWagerRecords(state, conflicts.map(wager => wager.id), `${disp(state, into)} swapped in`, now);
    const op = eventOp(state, evId);
    op.swaps = [...(Array.isArray(op.swaps) ? op.swaps : []),
      { out, into, by:ctx.player || "commissioner", at:now }].slice(-20);
    const returned = [...outReturned, ...intoReturned];
    return ok({ voided:returned.length, voidIds:returned.map(item => item.id), refunds:refundTotals(returned) });
  },
  /* Reversible attendance mark. Chips and profile never change, but a
     player marked away stops being a side of an open free-for-all market:
     chips on their side go back in the same write, named in the ack, and
     the contest revision moves so every phone re-reads the sides. */
  setAway(state, { player, away }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    if (!ROSTER.includes(player)) return err("Unknown player");
    if (typeof away !== "boolean") return err("Choose away or here");
    state.away = state.away || {};
    if (!!state.away[player] === away) return ok({ unchanged:true });
    const events = allEventsOf(state);
    const markets = events.map(ev => ({ ev, contest:resolveCurrentContest(state, ev) }))
      .filter(({ contest }) => contest?.kind === "ffa" && !contest.drawId
        && ["betting-open", "betting-locked"].includes(contest.phase));
    if (away) state.away[player] = true; else delete state.away[player];
    const now = Date.now();
    const returned = [];
    for (const { ev, contest } of markets) {
      const backed = away ? (state.wagers || []).filter(wager => wagerMatchesContest(wager, contest)
        && wager.kind === "outright" && !wager.pickTeam && wager.pick === player
        && resolveWager(state, wager, events).status === "pending") : [];
      returned.push(...voidWagerRecords(state, backed.map(wager => wager.id), `${disp(state, player)} is away`, now));
      const op = eventOp(state, ev.id);
      op.contestRevision = Number(op.contestRevision || 0) + 1;
      if (op.contest?.id === contest.id) op.contest.revision = op.contestRevision;
    }
    return ok({ voidIds:returned.map(item => item.id), refunds:refundTotals(returned) });
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
  /* A shelved event voids its open tickets by derivation and restoring it
     brings them back, so shelving with chips on it takes an explicit confirm
     naming what returns. A posted result has to be cleared first. */
  shelve(state, { id, on, confirmReturn }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const ev = allEventsOf(state).find(event => event.id === id);
    if (!ev) return err("No such event");
    if (!!state.shelved[id] === !!on) return ok({ unchanged:true });
    const frozen = frozenGuard(state); if (frozen) return frozen;
    if (state.results[id]) return err("Clear the result before shelving");
    if (on) {
      const open = pendingWagers(state, w => w.eventId === id);
      const returns = { bets:open.length, chips:open.reduce((sum, w) => sum + w.stake, 0) };
      if (open.length && confirmReturn !== true)
        return err(`Returns ${returns.bets} bet${returns.bets === 1 ? "" : "s"}, ${returns.chips.toLocaleString("en-US")} chips`, returns);
      state.shelved[id] = true;
      if (state.onDeck === id) state.onDeck = null;
      return ok(returns);
    }
    delete state.shelved[id];
    /* An event that never started comes back unannounced: the chips it held
       when it was skipped go back for good, and its old market and betting
       stamps clear, so no phantom market survives the restore. */
    const now = Date.now();
    let returned = [];
    if (!eventHasBegun(state, ev) && !state.eventOps?.[id]?.startedAt && !state.eventOps?.[id]?.resultEntryAt
        && !contestStackOf(state, id).length) {
      returned = voidWagerRecords(state, pendingWagers(state, w => w.eventId === id).map(w => w.id),
        "Event restored", now);
      resetContestSetup(state, id);
      if (state.onDeck === id) state.onDeck = null;
    }
    const voided = enforceExposure(state, now);
    if (voided.length || returned.length) appendCorrection(state, id, { type:"restore", at:now, by:actorOf(ctx),
      reason:"Event restored", ...(returned.length ? { returned:returned.map(item => item.id) } : {}), voided });
    return ok({ voided, voidIds:returned.map(item => item.id), refunds:refundTotals(returned) });
  },
  /* Take a mis-announced event back while nothing has been played: chips on
     it return, its stored contest and betting stamps clear, nothing is on
     deck, and the event reads as unannounced. A draw or heats stay. */
  takeBackAnnouncement(state, { evId }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const ev = allEventsOf(state).find(event => event.id === evId);
    if (!ev) return err("No such event");
    const available = announcementTakeBack(state, ev);
    if (available.blocker === "Not announced") return ok({ unchanged:true });
    if (!available.enabled) return err(available.blocker);
    const now = Date.now();
    const returned = voidWagerRecords(state, available.voidIds, "Announcement taken back", now);
    resetContestSetup(state, evId);
    if (state.onDeck === evId) state.onDeck = null;
    const control = state.showControl;
    if (ctx.showControl && control?.active?.kind === "event-intro" && control.active.eventId === evId)
      finishShowScene(showControlOf(state), "cancelled", now);
    appendCorrection(state, evId, { type:"take-back", at:now, by:actorOf(ctx),
      reason:"Announcement taken back", returned:returned.map(item => item.id) });
    return ok({ event:ev.name, voidIds:returned.map(item => item.id), refunds:refundTotals(returned) });
  },
  addEvent(state, { ev }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    if (!ev?.name?.trim()) return err("Name required");
    if (typeof ev.id !== "string" || !ev.id) return err("Bad event");
    if (allEventsOf(state).find(e => e.id === ev.id)) return err("Event id taken");
    if (!AWARDS[ev.value]) return err("Bad value");
    if (!["solo", "pairs", "team"].includes(ev.kind)) return err("Choose a format");
    /* the saved format must be playable by the room: equal teams, extras on
       crew. A custom event never becomes the finale. */
    let teamCfg = null;
    if (ev.kind !== "solo") {
      const teams = Number(ev.teamCfg?.teams), size = Number(ev.teamCfg?.size);
      if (!Number.isInteger(teams) || !Number.isInteger(size) || teams < 2 || teams > 6 || size < 1
          || ev.kind === "pairs" && size !== 2)
        return err("Bad team setup");
      if (teams * size > ROSTER.length)
        return err(`${teams} teams of ${size} need ${teams * size} players; ${ROSTER.length} on the roster`);
      if (ev.teamCfg.bracket !== undefined && (ev.teamCfg.bracket !== teams || !makeBracket(teams)))
        return err(`Unsupported ${ev.teamCfg.bracket}-team bracket`);
      teamCfg = { teams, size, ...(ev.teamCfg.bracket !== undefined ? { bracket:teams } : {}) };
    }
    const session = SESSIONS.find(item => item.id === ev.session)?.id;
    const game = typeof ev.game === "string" && /^[a-z0-9-]{1,24}$/i.test(ev.game) ? ev.game : null;
    state.customEvents.push({
      id:ev.id, custom:true, name:String(ev.name).trim().slice(0, 28), value:ev.value,
      desc:String(ev.desc || "").trim().slice(0, 300), kind:ev.kind,
      ...(session ? { session } : {}), ...(game ? { game } : {}), ...(teamCfg ? { teamCfg } : {}),
    });
    return ok();
  },
  removeEvent(state, { id }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const ev = state.customEvents.find(e => e.id === id);
    if (!ev) return err("Only added events can be removed");
    const frozen = frozenGuard(state); if (frozen) return frozen;
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
    const current = allEventsOf(state).find(e => e.id === id);
    if (!current) return err("No such event");
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
      /* the value IS the posted awards: changing it re-pays a finished event */
      if (v !== current.value) {
        const frozen = frozenGuard(state); if (frozen) return frozen;
        if (state.results[id]) return err("Clear the result before changing what it pays");
      }
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
    const frozen = frozenGuard(state); if (frozen) return frozen;
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
    return ok({ voided:enforceExposure(state) });
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
    const bets = drawBetsError(state, evId); if (bets) return bets;
    const present = presentPlayers(state);
    const compatible = validateEventParticipants(ev, players, present);
    if (!compatible.ok) return err(compatible.error);
    players = compatible.players;
    if (ev.teamCfg.bracket && !makeBracket(compatible.fit?.teams || ev.teamCfg.bracket))
      return err(`Unsupported ${compatible.fit?.teams || ev.teamCfg.bracket}-team bracket`);
    const draw = drawTeams(ev, state, players, present);
    if (!draw) return err("Draw failed");
    draw.roles = normalizeOverflowRoles(players, present, roles, ev);
    state.draws[evId] = draw;
    delete state.stages[evId];
    resetContestSetup(state, evId);
    if (ev.teamCfg.bracket) state.brackets[evId] = makeBracket(draw.teams.length);
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
    const bets = drawBetsError(state, evId); if (bets) return bets;
    delete state.draws[evId]; delete state.brackets[evId]; delete state.stages[evId];
    /* only the draw's own lifecycle stamps go; revision and correction
       history outlive a redraw */
    const op = state.eventOps?.[evId];
    if (op) {
      delete op.drawRevealedAt;
      delete op.announcedAt;
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
    const frozen = frozenGuard(state); if (frozen) return frozen;
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
    const bets = drawBetsError(state, evId, "stage draw"); if (bets) return bets;
    if (!cfg || !["heats", "pools"].includes(cfg.kind) || !Number.isInteger(cfg.nGroups) || cfg.nGroups < 2 || cfg.nGroups > 4)
      return err("Bad stage setup");
    if (state.brackets[evId] || ev.teamCfg?.bracket) return err("This event uses a bracket");
    if (ev.stageCfg && ev.stageCfg.kind !== cfg.kind) return err(`This event uses ${ev.stageCfg.kind}`);
    let entrantType, keys, drawId = null, roles = null;
    if (cfg.kind === "heats") {
      /* whoever is present and chosen plays, at least two to a heat; the
         rest of the room is crew */
      const present = presentPlayers(state), picked = cfg.players;
      if (!Array.isArray(picked)) return err("Choose who is playing");
      if (new Set(picked).size !== picked.length) return err("A player is selected twice");
      if (picked.some(player => !present.includes(player))) return err("Only players who are here can play");
      if (picked.length < cfg.nGroups * 2) return err("Heats need at least 2 players each");
      entrantType = "solo"; keys = [...picked];
      roles = normalizeOverflowRoles(keys, present, cfg.roles, ev);
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
      advance: cfg.advance === 2 ? 2 : 1, groups, finalWinner: null, ts: Date.now(),
      ...(roles?.length ? { roles } : {}) };
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
    const bets = drawBetsError(state, evId, "stage draw"); if (bets) return bets;
    delete state.stages[evId];
    resetContestSetup(state, evId);
    return ok();
  },
  toggleThrough(state, { evId, g: gi, key }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const ev = allEventsOf(state).find(event => event.id === evId);
    if (!ev) return err("No such event");
    const frozen = frozenGuard(state); if (frozen) return frozen;
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
    const frozen = frozenGuard(state); if (frozen) return frozen;
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
    const present = presentPlayers(state);
    const compatible = validateEventParticipants(ev, players, present);
    const fit = compatible.fit || ev.teamCfg;
    const config = draftConfigurationError(ev, fit); if (config) return config;
    if (state.draws[evId]) return err("Teams already set, clear them first");
    if (!compatible.ok) return err(compatible.error);
    if (compatible.players.length !== fit.teams * fit.size)
      return err(`Select exactly ${fit.teams * fit.size} players`);
    if (!Array.isArray(captains) || captains.length !== fit.teams) return err("Pick one captain per team");
    if (new Set(captains).size !== captains.length) return err("A captain is listed twice");
    const pool = compatible.players;
    if (!captains.every(c => pool.includes(c))) return err("Captains must be in the playing pool");
    const normalizedRoles = normalizeOverflowRoles(pool, present, roles, ev);
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
      ...(fit.teams !== ev.teamCfg.teams || fit.size !== ev.teamCfg.size
        ? { fit:{ teams:fit.teams, size:fit.size } } : {}),
    };
    const extra = draftTurn(state.drafts[evId]);
    rememberDraftCommand(state, evId, command, extra);
    return ok(extra);
  },
  pickDraftPlayer(state, payload, ctx) {
    const { evId, player } = payload;
    if (!ctx.isGm && !isActivePlayer(ctx.player)) return err("Check in first");
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
    const fit = draftFit(d, ev);
    if (d.teams.some(team => team.players.length !== fit.size))
      return err(`Teams must have exactly ${fit.size} players`);
    const mascots = (fit.size || 0) >= 3 ? shuffle(TEAM_NAMES) : null;
    const now = Date.now(), turn = draftTurn(d), drawId = `d${now}-${crypto.randomUUID()}`;
    state.draws[evId] = { id:drawId, method:"draft", ts:now, sourceDraftId:d.id,
      draft:{ id:d.id, revision:turn.draftRevision, picks:d.picks.map(pick => ({ ...pick })) },
      roles:(d.roles || []).map(role => ({ ...role })),
      teams:d.teams.map((team, index) => ({ captain:team.captain, players:[...team.players],
        ...(mascots ? { name:mascots[index % mascots.length] } : {}) })) };
    delete state.stages[evId];
    if (ev.teamCfg.bracket) state.brackets[evId] = makeBracket(state.draws[evId].teams.length);
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
    const ev = allEventsOf(state).find(e => e.finale);
    if (!ev) return err("No poker finale scheduled");
    if (state.shelved[ev.id]) return err("The finale is shelved");
    if (state.poker?.id === ev.id)
      return ok({ unchanged:true, total:state.poker.total });
    /* the buy-in snapshot must match the board exactly: nothing may still be
       able to move points after stacks are dealt. pokerSetupPreview is the
       same deal the commissioner reviews first, so the write cannot differ.
       Away players are not dealt in; their board total carries as-is. A
       negative balance deals as 0 through the minimum-stack grant. */
    const preview = pokerSetupPreview(state);
    if (!preview.ok) return err(preview.blockers[0]);
    const rows = computeStandings(state);
    const seated = rows.filter(row => !isAway(state, row.player));
    const distribution = pokerDistribution(seated);
    /* an unplayed duel can no longer move the board, so it cannot block the
       finale either: offers, lapsed offers, and accepted duels still waiting
       on a draw are voided in this same write. Voiding moves no chips, and a
       cancel restores exactly these. */
    const setupAt = Date.now();
    const voidedDuelIds = [];
    const wanted = new Set(preview.voidDuels.map(duel => duel.id));
    (state.duels || []).forEach(d => {
      if (!wanted.has(d.id)) return;
      d.status = "void";
      d.voidedAt = setupAt;
      d.voidReason = "finale";
      voidedDuelIds.push(d.id);
    });
    const voidedDuels = voidedDuelIds.length;
    /* nobody rails the finale: anyone under 600 (a negative balance deals as
       0) is staked up to 600, logged as a ruling so the board shows where the
       chips came from. pokerCancel reverts these, so a cancel-and-reset never
       grants twice. */
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
      voidedDuelIds,
      startedAt:null,
      levels:pokerLevels(),
      levelOffset:0,
      outs:[],
      counts:{},
      ts:Date.now(),
      ...(seated.length !== rows.length ? {
        seats:seated.map(row => row.player),
        unseated:Object.fromEntries(rows.filter(row => isAway(state, row.player)).map(row => [row.player, row.pts])),
      } : {}),
    };
    return ok({ total:distribution.total, minimumCount:distribution.minimumCount, voidedDuels,
      voidedDuelIds, inventory:distribution.inventory });
  },
  pokerStart(state, {}, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    if (!state.poker) return err("Set up the table first");
    if (state.poker.startedAt) return ok({ unchanged:true });
    const now = Date.now();
    state.poker.startedAt = now;
    /* the level owns its clock: a nudge or pause rewrites these, never startedAt */
    state.poker.levelIdx = 0;
    state.poker.levelStartedAt = now;
    state.poker.pausedAt = null;
    state.poker.clockAt = now;
    state.onDeck = null;
    return ok();
  },
  pokerLevel(state, { delta }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const pk = state.poker;
    if (!pk?.startedAt) return err("Clock is not running");
    if (state.results[pk.id]) return err("Counts are posted");
    const now = Date.now();
    const d = delta > 0 ? 1 : -1;
    const { idx } = pokerClockAnchor(pk, now);
    /* a nudged level starts fresh; a paused clock stays paused at its full time */
    pk.levelIdx = Math.max(0, Math.min(pk.levels.length - 1, idx + d));
    pk.levelStartedAt = now;
    if (pk.pausedAt) pk.pausedAt = now;
    pk.levelOffset = 0;
    pk.clockAt = now;
    return ok({ level:pk.levelIdx });
  },
  pokerPause(state, { paused }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const pk = state.poker;
    if (!pk?.startedAt) return err("Clock is not running");
    if (state.results[pk.id]) return err("Counts are posted");
    const now = Date.now();
    const want = paused === true;
    if (want === !!pk.pausedAt) return ok({ unchanged:true });
    if (!Number.isInteger(pk.levelIdx) || !Number.isFinite(pk.levelStartedAt)) {
      const anchor = pokerClockAnchor(pk, now);
      pk.levelIdx = anchor.idx;
      pk.levelStartedAt = anchor.levelStartedAt;
      pk.levelOffset = 0;
    }
    if (want) pk.pausedAt = now;
    else {
      pk.levelStartedAt += now - pk.pausedAt;
      pk.pausedAt = null;
    }
    pk.clockAt = now;
    return ok();
  },
  /* busting is self-serve: you tap out on your own phone. GM can do anyone. */
  pokerBust(state, { player }, ctx) {
    const pk = state.poker;
    if (!pk?.startedAt) return err("Cards are not live");
    if (state.results[pk.id]) return err("Counts are posted");
    if (!ROSTER.includes(player)) return err("Unknown player");
    if (!seatsOf(pk).includes(player)) return err("Not seated at the table");
    if (player !== ctx.player && !ctx.isGm) return err("Only you can bust yourself");
    if (pk.outs.find(o => o.player === player)) return err("Already out");
    if (!stillIn(pk).some(p => p !== player)) return err("The last player in cannot bust");
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
    if (!seatsOf(pk).includes(player)) return err("Not seated at the table");
    if (player !== ctx.player && !ctx.isGm) return err("Count your own stack");
    const c = Math.floor(Number(count));
    if (pk.outs.find(o => o.player === player))
      return c === 0 ? ok({ unchanged:true }) : err("You are out, your count is 0");
    if (!Number.isFinite(c) || c < 0) return err("Counts are 0 or more");
    if (c % CHIP_MIN !== 0) return err("Counts move in 25s");
    /* nobody walks away with more than the table was dealt */
    if (Number.isInteger(pk.total) && c > pk.total)
      return err(`Only ${pk.total.toLocaleString("en-US")} chips were dealt`);
    pk.counts = pk.counts || {};
    if (pk.counts[player] === c) return ok({ unchanged:true });
    const op = eventOp(state, pk.id);
    if (!op.resultEntryAt) op.resultEntryAt = Date.now();
    /* counting 0 is busting: it ranks in bust order, never above a bust */
    if (c === 0) {
      if (!stillIn(pk).some(p => p !== player)) return err("The last player in cannot bust");
      pk.outs.push({ player, ts:Date.now() });
      delete pk.counts[player];
      return ok({ busted:true });
    }
    pk.counts[player] = c;
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
    const frozen = frozenGuard(state); if (frozen) return frozen;
    const outSet = new Set(pk.outs.map(o => o.player));
    const seats = seatsOf(pk);
    const missing = seats.filter(p => !outSet.has(p) && pk.counts?.[p] === undefined);
    if (missing.length) return err(`Waiting on ${missing.map(p => disp(state, p)).join(", ")}`);
    const clean = {};
    ROSTER.forEach(p => {
      clean[p] = seats.includes(p) ? (outSet.has(p) ? 0 : pk.counts[p]) : Number(pk.unseated?.[p] || 0);
    });
    const max = Math.max(...seats.map(p => clean[p]));
    if (max <= 0) return err("Every count is 0");
    const leaders = seats.filter(p => clean[p] === max);
    const now = Date.now();
    const op = eventOp(state, pk.id);
    const revision = Math.max(0, Number(op.revision || 0)) + 1;
    /* a 0 saved before counting 0 meant busting went out first, unordered */
    const zeroes = ROSTER.filter(p => !outSet.has(p) && clean[p] === 0);
    /* seats ride on the result: the champion is the chip leader among the
       players dealt in, never an away player's carried total */
    state.results[pk.id] = { slots: [[...leaders], [], []], stacks: clean,
      outs: [...zeroes, ...pk.outs.map(o => o.player)], ts:now, confirmedAt:now, revision,
      ...(Array.isArray(pk.seats) ? { seats:[...pk.seats] } : {}) };
    op.revision = revision;
    op.completedAt = now;
    const scene = noScene !== true
      ? tryStartScene(state, ctx, { kind:"winner", eventId:pk.id }, now)
      : null;
    return ok({ revision, ...(scene ? { sceneId:scene.id } : {}) });
  },
  /* only an undealt table can be taken back: once cards are live the counts
     are the record, corrected by clearing and reposting */
  pokerCancel(state, {}, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    if (!state.poker) return ok({ unchanged:true });
    const frozen = frozenGuard(state); if (frozen) return frozen;
    if (state.results[state.poker.id]) return err("Clear the result first");
    if (state.poker.startedAt) return err("Cards are live. Post or correct the counts instead");
    /* the table stakes grants belonged to this table */
    const grantIds = new Set(state.poker.minimumGrantIds || []);
    state.adjustments = state.adjustments.filter(a =>
      grantIds.size ? !grantIds.has(a.id) : a.reason !== "Minimum stack");
    /* the duels this setup voided come back exactly as they were */
    const duelIds = new Set(state.poker.voidedDuelIds || []);
    const restoredDuels = [];
    (state.duels || []).forEach(d => {
      if (!duelIds.has(d.id) || d.status !== "void" || d.voidReason !== "finale") return;
      d.status = "open";
      delete d.voidedAt;
      delete d.voidReason;
      restoredDuels.push(d.id);
    });
    const op = eventOp(state, state.poker.id);
    delete op.resultEntryAt;
    delete op.completedAt;
    state.poker = null;
    /* without the minimum grants a restored ante may no longer fit */
    const voided = enforceExposure(state);
    return ok({ restoredDuels, voided });
  },

  /* ── GM: board ── */
  /* Rulings share the ledger's retry contract: the same device and action id
     acknowledge without applying twice. A ruling made on posted finale
     counts carries that poker result revision. */
  adjust(state, { player, delta, reason }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const requestKey = wagerRequestKey(ctx);
    const fingerprint = JSON.stringify([player, delta, String(reason || "").slice(0, 80)]);
    const replay = requestKey && replayedWagerOp(state, requestKey, "commissioner", "adjust", fingerprint);
    if (replay) return replay;
    if (!ROSTER.includes(player) || !delta) return err("Bad ruling");
    if (!Number.isInteger(delta) || Math.abs(delta) > 100000) return err("Bad ruling");
    const frozen = frozenGuard(state); if (frozen) return frozen;
    /* the board moves in 100s all weekend; once the finale counts post the
       standings are exact chip counts, so corrections move in 25s instead */
    const stacks = Object.values(state.results || {}).find(res => res?.stacks);
    if (stacks) {
      if (delta % CHIP_MIN !== 0) return err("Counts move in 25s");
    } else if (delta % PT !== 0) return err("Rulings move in 100s");
    if (pokerLive(state)) return err("The finale is live, correct it after the count");
    const now = Date.now();
    const ruling = { id:`a${now}-${crypto.randomUUID()}`, player, delta,
      reason:String(reason || "").slice(0, 80), ts:now, by:actorOf(ctx),
      ...(stacks ? { pokerRevision:Number(stacks.revision || 1) } : {}) };
    state.adjustments.unshift(ruling);
    const voided = enforceExposure(state, now);
    if (voided.length) ruling.voided = voided;
    if (requestKey) rememberWagerOp(state, requestKey, { actor:"commissioner", type:"adjust", fingerprint,
      wagerId:ruling.id, stake:delta });
    return ok({ adjustmentId:ruling.id, voided });
  },
  /* taking a ruling back is itself on the record: reason required, and the
     ruling stays in the ledger marked removed (moved behind the live ones)
     so standings skip it. Minimum stack grants go with pokerCancel. */
  removeAdjustment(state, { id, reason }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const requestKey = wagerRequestKey(ctx);
    const fingerprint = JSON.stringify([id]);
    const replay = requestKey && replayedWagerOp(state, requestKey, "commissioner", "removeAdjustment", fingerprint);
    if (replay) return replay;
    const ruling = (state.adjustments || []).find(a => a.id === id);
    if (!ruling) return err("No such ruling");
    if (ruling.removedAt) return ok({ unchanged:true });
    if (ruling.reason === "Minimum stack" || (state.poker?.minimumGrantIds || []).includes(id))
      return err("Cancel the poker table to remove a minimum stack");
    const why = cleanCorrectionReason(reason);
    if (!why) return err("Reason required");
    const frozen = frozenGuard(state); if (frozen) return frozen;
    if (pokerLive(state)) return err("The finale is live, correct it after the count");
    const now = Date.now();
    const removed = { ...ruling, removedAt:now, removedBy:actorOf(ctx), removeReason:why };
    state.adjustments = [...state.adjustments.filter(a => a.id !== id), removed];
    const voided = enforceExposure(state, now);
    if (voided.length) removed.removeVoided = voided;
    if (requestKey) rememberWagerOp(state, requestKey, { actor:"commissioner", type:"removeAdjustment",
      fingerprint, wagerId:id, stake:ruling.delta });
    return ok({ adjustmentId:id, voided });
  },
  /* Crowning freezes the board and, with Show Control on, points the TV at
     the champion in the same write: a finished scene retires and the
     champion scene starts. The scene is best effort and never fails the
     crown. */
  setFrozen(state, { f }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    if (state.frozen === !!f) return ok({ unchanged:true });
    state.frozen = !!f;
    if (!state.frozen || !ctx?.showControl) return ok();
    const now = Date.now();
    if (state.showControl?.active) retireFinishedShowScene(showControlOf(state), now);
    const scene = tryStartScene(state, ctx, { kind:"champion" }, now);
    return ok(scene ? { sceneId:scene.id } : undefined);
  },
  /* One confirmed commissioner write names the champion and freezes the
     board. The confirm carries the names it showed, so a board that moved
     in between is refused instead of crowning someone else. Freezing goes
     through setFrozen, which owns everything a freeze sets off. */
  crownChampion(state, { champions }, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const leaders = computeStandings(state).filter(row => row.rank === 1).map(row => row.player);
    if (state.frozen) return samePlayers(champions, leaders)
      ? ok({ unchanged:true, champions:leaders }) : err("The board is already frozen");
    if (resolveWeekendOperation(state).nextAction?.type !== "crown-champion")
      return err("Finish the finale first");
    if (!samePlayers(champions, leaders)) return err("Standings changed, refresh and try again");
    const frozen = ACTIONS.setFrozen(state, { f:true }, ctx);
    if (!frozen.ok) return frozen;
    return ok({ ...(frozen.extra || {}), champions:leaders });
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
    if (state.live) return err("The weekend is live. Check-in stays closed");
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
    /* once a game has started, the weekend cannot be taken back to the
       locker room: that would reopen chip claims mid-weekend */
    if (!on && (Object.keys(state.results || {}).length || state.poker
        || Object.values(state.eventOps || {}).some(op => op?.startedAt)))
      return err("Events have started. The weekend stays live");
    state.live = !!on;
    return ok();
  },
  /* Undo starting the weekend, only while nothing has happened: no result,
     no bet, no duel, no game started, no poker table. Any announced event
     goes back to unannounced with it. */
  returnToLockerRoom(state, {}, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    if (!state.live) return ok({ unchanged:true });
    const available = lockerRoomAvailability(state);
    if (!available.enabled) return err(available.blocker);
    const reset = [];
    for (const ev of allEventsOf(state)) {
      const op = state.eventOps?.[ev.id];
      if (state.onDeck === ev.id || op?.contest || op?.bettingOpenedAt || op?.bettingLockedAt) {
        resetContestSetup(state, ev.id);
        reset.push(ev.name);
      }
    }
    state.onDeck = null;
    const control = state.showControl;
    if (ctx.showControl && control?.active?.kind === "event-intro")
      finishShowScene(showControlOf(state), "cancelled");
    state.live = false;
    return ok({ reset });
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
  /* ── QA (commissioner, QA capability) ──
     One write reaches a named point on the weekend by running the real
     reducers on this working copy (worker/qa.js). The Durable Object makes
     the rotating pre-reset backup before it persists. */
  qaAdvance(state, payload, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    if (!ctx.qa) return err("QA is unavailable");
    const target = parseQaTarget(state, payload?.target);
    if (!target) return err("Unknown QA target");
    const discards = qaNeedsRewind(state, target);
    const gate = qaGate(state, payload, ctx, discards); if (gate) return gate;
    const seed = cleanSeed(payload?.seed) ?? Math.floor(Math.random() * 0xFFFFFFFF) >>> 0;
    try {
      const done = runQaAdvance(state, target, { applyAction, ctx, seed, production:qaProduction(ctx) });
      if (!done.writes && !done.rewound) return ok({ unchanged:true, target:target.key, seed });
      return ok({ target:target.key, ...done });
    } catch (error) {
      if (error instanceof QaStop) return err(error.message);
      throw error;
    }
  },
  /* Put a saved checkpoint's game progress back. The same contract as the
     game-progress reset: only its keys change, so profiles, ratings,
     logistics, the onboarding epoch and the event setup stay as they are
     now, and claims, photos and tokens are not in state at all. The
     Durable Object loads the checkpoint into ctx.qaCheckpoint. */
  qaRestore(state, payload, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    if (!ctx.qa) return err("QA is unavailable");
    const checkpoint = ctx.qaCheckpoint;
    if (!checkpoint || typeof payload?.id !== "string" || checkpoint.id !== payload.id
        || !checkpoint.progress || typeof checkpoint.progress !== "object")
      return err("No such checkpoint");
    if (Number(checkpoint.v || 0) > Number(state.v || EMPTY_STATE.v))
      return err("That checkpoint is from a newer version");
    if (QA_PROGRESS_KEYS.some(key => checkpoint.progress[key] !== undefined
        && !progressShapeOk(key, checkpoint.progress[key])))
      return err("That checkpoint is damaged");
    const gate = qaGate(state, payload, ctx, true); if (gate) return gate;
    resetProgress(state);
    for (const key of QA_PROGRESS_KEYS)
      if (checkpoint.progress[key] !== undefined) state[key] = structuredClone(checkpoint.progress[key]);
    return ok({ restored:checkpoint.name, id:checkpoint.id });
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
    /* The first game-opening write starts the weekend, so it has to say so:
       without payload.startWeekend the server answers "Starts the weekend"
       and names the event, changing nothing. The handler runs on a copy
       first, so a write that would fail anyway reports its own error. */
    if (startsWeekend(state, type, payload) && payload?.startWeekend !== true) {
      const probe = handler(structuredClone(state), payload || {}, ctx);
      if (!probe.ok) return probe;
      const evId = type === "setOnDeck" ? payload?.id : type === "pokerStart" ? state.poker?.id : payload?.evId;
      const ev = allEventsOf(state).find(item => item.id === evId);
      return err("Starts the weekend", { needsStartConfirm:true, event:ev?.name || null });
    }
    const result = handler(state, payload || {}, ctx);
    if (result.ok && !result.extra?.unchanged) retireSceneAfter(state, ctx, type);
    // Opening the first game includes its betting window. Setup alone does
    // not begin the weekend, and rejected actions never change its status.
    if (result.ok && startsWeekend(state, type, payload)) {
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
