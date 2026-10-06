/* The commissioner pill, as data. resolveDirector (shared/show.js) decides
   the beat; this turns it into what the pill says and what each target does:
   a server write, or a sheet to open. The pill component and the tap-count
   test both read this, so the count measures the real controls. */
import {
  disp, resolveCurrentContest, overflowRoleMeta, computeStandings, resolveWager, wagerMatchesContest,
  pokerClock, contestUndoAvailability, duelOpen, rosterOf, isActivePlayer, isAway,
} from "../../../shared/core.js";
import { postedFinalUndo } from "../../../shared/show.js";
import { autoBeat, autopilotHeld } from "../../../shared/autopilot.js";
import { geoPlayers } from "../../../shared/geo.js";
import { triviaActive, triviaGame } from "../../../shared/trivia.js";
import { payLine } from "../comebacks/comebacks.js";

const fmt = n => (n ?? 0).toLocaleString("en-US");
/* the pill's verb carries at most two lines under it */
export const PILL_LINES = 2;
const SCENE_BEATS = ["advance-scene", "clear-scene", "start-champion-scene", "replay-winner-scene",
  /* D6: the awards can follow the crown */
  "reveal-award", "end-awards"];
/* writes that open the weekend when it is not live yet */
const WEEKEND_WRITES = ["announceEvent", "announceAndDraw", "setOnDeck", "startEvent", "lockAndStart", "pokerStart"];

export const sideName = (state, side) => side?.name || (side?.players || []).map(player => disp(state, player)).join(" & ");
export const namesOf = (state, players) => {
  const names = players.map(player => disp(state, player));
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0] || "";
};

/* the contest's decisive tap posts the event result when nothing follows it */
export function contestIsFinal(state, ev, contest) {
  if (!contest) return false;
  if (contest.kind === "stage-final") return true;
  if (contest.kind !== "match") return false;
  const rounds = state.brackets?.[ev.id]?.rounds || [];
  return contest.match?.[0] === rounds.length - 1;
}

/* One-tap winner: nothing to pick but the winner. A match or a two-way
   stage final faces its two sides; a heat sending one through stands its
   whole field (the pill draws three or more as tiles). A heat sending more
   through, or a stage final's finish order, opens the event. */
export function oneTapSides(state, ev, contest) {
  if (!contest || contest.phase !== "in-progress" || contest.sides.length < 2) return false;
  if (contest.kind === "match" || contest.kind === "stage-final") return contest.sides.length === 2;
  return contest.kind === "heat" && (state.stages?.[ev.id]?.advance || 1) === 1;
}

export function winnerPayload(state, ev, contest, key) {
  return { evId:ev.id, contestId:contest.id, contestRevision:contest.revision, winner:key, qualifiers:[key],
    ...(contestIsFinal(state, ev, contest) ? { postResult:true } : {}) };
}

/* Undo for the last recorded winner, including a final that posted the result */
export function lastWinnerUndo(state, ev) {
  if (!ev) return { enabled:false };
  return postedFinalUndo(state, ev) || contestUndoAvailability(state, ev);
}

/* A beat that draws people (teams, heats, a draft pool) opens the crew
   check first; its confirm runs `then` with the players and crew it shows. */
export const drawsPeople = beat => Array.isArray(beat?.players) && beat.players.length > 0;
export const crewCheck = (ev, beat, then) => ({ open:"crewCheck", evId:ev.id,
  players:[...(beat.players || [])], roles:(beat.roles || []).map(item => ({ ...item })), then });

/* Same write, same target: the pill's beat is the one the autopilot will
   take on its own, so the pill draws the wait and a tap takes it early. */
const sameWrite = (run, beat) => !!run?.write && !!beat && run.write === beat.type
  && JSON.stringify(run.payload || {}) === JSON.stringify(beat.payload || {});

export function directorPill(state, events, director, { me = null, now = Date.now(), showControl = false } = {}) {
  const beat = director?.nextAction;
  if (!beat) return null;
  /* the frozen board keeps only its ceremony beats */
  if (state.frozen && !SCENE_BEATS.includes(beat.type)) return null;
  const ev = director.event || null;
  const contest = ev ? resolveCurrentContest(state, ev) : null;
  const reference = contest ? { contestId:contest.id, contestRevision:contest.revision } : {};
  /* the first weekend-starting write is confirmed by the App's act(), which
     the pill's writes go through; startsWeekend only marks it */
  const weekend = run => run?.then?.write ? { ...run, then:weekend(run.then) }
    : run?.write && !state.live && WEEKEND_WRITES.includes(run.write) ? { ...run, startsWeekend:true } : run;
  const matchup = contest && contest.kind !== "ffa" && contest.sides.length === 2
    ? contest.sides.map(side => sideName(state, side)).join(" vs ") : "";
  const lines = [];
  let run = null, sides = null;

  if (beat.enabled === false && beat.blockers?.length) {
    return { type:beat.type, label:beat.blockers[0], lines:ev ? [ev.name] : [], blocked:true, extras:[], sides:null,
      run:beat.type === "setup-poker" ? { tab:"bets" } : ev ? { open:"event", evId:ev.id } : null };
  }

  switch (beat.type) {
    case "advance-scene":
      run = { write:"advanceShowScene", payload:{ id:beat.sceneId } };
      break;
    case "clear-scene":
      run = { write:"endShowScene", payload:{ id:beat.sceneId, outcome:"cancelled" } };
      break;
    case "start-champion-scene":
      run = { write:"startShowScene", payload:{ kind:"champion" } };
      break;
    case "replay-winner-scene":
      run = { write:"replayWinnerScene", payload:{ eventId:beat.eventId } };
      break;
    case "reveal-award":
      run = { write:"promptReveal", payload:{ id:beat.ballotId, step:beat.step } };
      break;
    case "end-awards":
      run = { write:"promptRevealEnd", payload:{ id:beat.ballotId } };
      break;
    case "start-opening-scene":
      run = { write:"startShowScene", payload:{ kind:"opening" } };
      break;
    case "announce":
      run = { write:"announceEvent", payload:{ evId:ev.id, ...reference } };
      break;
    case "announce-draw": {
      /* a draw of people never runs from the pill without the crew check */
      const write = { write:"announceAndDraw", payload:{ evId:ev.id } };
      run = drawsPeople(beat) ? crewCheck(ev, beat, write) : write;
      break;
    }
    case "lock-start":
      run = { write:"lockAndStart", payload:{ evId:ev.id, ...reference } };
      break;
    case "record-contest-winner":
      if (oneTapSides(state, ev, contest)) {
        sides = contest.sides.map(side => ({ key:side.key, name:sideName(state, side), players:side.players,
          run:{ write:"recordContestWinner", payload:winnerPayload(state, ev, contest, side.key), recorded:sideName(state, side),
            recordedPlayers:[...(side.players || [])] } }));
      }
      run = { open:"event", evId:ev.id };
      break;
    case "continue-draft": run = { open:"draft", evId:ev.id }; break;
    case "captains-draft": run = crewCheck(ev, beat, { open:"draft", evId:ev.id }); break;
    case "setup-poker": case "start-poker": run = { open:"pokerSetup" }; break;
    case "run-poker": run = { open:"pokerClock" }; break;
    case "post-poker-result": run = { open:"pokerResult" }; break;
    case "crown-champion": run = { open:"crown" }; break;
    /* Where and When's rounds */
    case "geo-start": run = { write:"geoStart", payload:{ evId:ev.id } }; break;
    case "geo-reveal": run = { write:"geoReveal", payload:{ roundId:beat.roundId } }; break;
    case "geo-next": run = { write:"geoNext", payload:{ roundId:beat.roundId } }; break;
    case "geo-finish": run = { write:"geoFinish", payload:{ evId:ev.id } }; break;
    /* Trivia's questions */
    case "trivia-start": run = { write:"triviaStart", payload:{ evId:ev.id } }; break;
    case "trivia-reveal": run = { write:"triviaReveal", payload:{ questionId:beat.questionId } }; break;
    case "trivia-board": run = { write:"triviaBoard", payload:{ questionId:beat.questionId } }; break;
    case "trivia-next": run = { write:"triviaNext", payload:{ questionId:beat.questionId } }; break;
    case "trivia-finish": run = { write:"triviaFinish", payload:{ evId:ev.id } }; break;
    case "enter-result": run = { open:"resultEntry", evId:ev.id }; break;
    case "post-result": run = { open:"result", evId:ev.id }; break;
    case "advance-bracket": run = { open:"bracket", evId:ev.id }; break;
    case "open-betting": run = { write:"setOnDeck", payload:{ id:ev.id, ...reference } }; break;
    case "lock-betting": run = { write:"setOnDeck", payload:{ id:null, ...reference } }; break;
    case "start-event": run = { write:"startEvent", payload:{ evId:ev.id, ...reference } }; break;
    default: run = ev ? { open:"event", evId:ev.id } : null;
  }
  if (!run) return null;

  /* the second line names what the verb acts on; the note under it is at
     most one more line, the one that most needs the commissioner's eye
     (a count or a warning before the crew, the terms, or You're playing) */
  /* a lock names the match by who plays it (the faces' names fit one line
     where "Play-in 2: ..." wrapped the pill on a 375px phone) */
  if (beat.type === "lock-start" && matchup) lines.push(matchup);
  else if (beat.type === "record-contest-winner" && !sides && matchup) lines.push(`${beat.subject}: ${matchup}`);
  else if (beat.type === "crown-champion") {
    const leaders = computeStandings(state).filter(row => row.rank === 1);
    lines.push(`${namesOf(state, leaders.map(row => row.player))} with ${fmt(leaders[0]?.pts)}`);
  } else if (beat.subject) lines.push(beat.subject);
  const notes = [];
  const note = (rank, text) => { if (text) notes.push({ rank, text }); };

  if ((beat.type === "announce-draw" || beat.type === "captains-draft") && beat.roles?.length)
    note(3, `Crew: ${beat.roles.map(item => `${disp(state, item.player)} (${overflowRoleMeta(item.role).label})`).join(", ")}`);
  if (beat.away?.length)
    note(1, `${namesOf(state, beat.away)} ${beat.away.length === 1 ? "is" : "are"} marked away`);
  /* the bets riding on a lock are drawn on the pill (a chip and its count),
     not written; until one lands the lock waits quiet (DirectorPill) */
  let bets = null, openedAt = null;
  if (beat.type === "lock-start" && ev && state.onDeck === ev.id) {
    bets = (state.wagers || []).filter(wager => wagerMatchesContest(wager, contest)
      && resolveWager(state, wager, events).status === "pending").length;
    openedAt = Number(state.eventOps?.[ev.id]?.bettingOpenedAt) || null;
  }
  /* v3.1: the underdog's payout, said once on the beat that locks it in */
  if (beat.type === "lock-start" && contest) {
    const underdog = contest.odds ? contest.sides.find(side => side.key === contest.odds.underdog) : null;
    if (underdog) note(2, `${sideName(state, underdog)}: ${payLine(contest.odds.mult)}`);
  }
  if (beat.type === "record-contest-winner" && contest?.players.includes(me)) note(2, "You’re playing");
  if (beat.type === "geo-reveal" && state.geo) {
    const players = geoPlayers(state, rosterOf(state), { isActivePlayer:id => isActivePlayer(id, state), isAway }).length;
    const guesses = Object.values(state.geo.guesses?.[beat.roundId] || {});
    const locked = guesses.filter(guess => guess?.done).length;
    note(1, `${locked} of ${players} locked in`);
  }
  if (beat.type === "trivia-reveal" && triviaGame(state)) {
    const players = triviaActive(state);
    const picks = triviaGame(state).picks?.[beat.questionId] || {};
    note(1, `${players.filter(player => picks[player]?.locked).length} of ${players.length} locked in`);
  }
  if (beat.type === "setup-poker") {
    const open = (state.duels || []).filter(duel => duelOpen(duel, now)).length;
    if (open) note(1, `Voids ${open} open duel${open === 1 ? "" : "s"}`);
  }
  if (beat.type === "run-poker" && state.poker?.startedAt) {
    const clock = pokerClock(state.poker, now);
    note(1, `Blinds ${fmt(clock.sb)} / ${fmt(clock.bb)}`);
  }
  if (beat.type === "post-poker-result" && state.poker) {
    const out = new Set((state.poker.outs || []).map(item => item.player));
    const seats = state.poker.seats || computeStandings(state).map(row => row.player);
    const alive = seats.filter(player => !out.has(player));
    const counted = alive.filter(player => state.poker.counts?.[player] !== undefined).length;
    note(1, `${counted} of ${alive.length} counted`);
  }
  const room = PILL_LINES - lines.length;
  if (room > 0) notes.sort((a, b) => a.rank - b.rank).slice(0, room).forEach(item => lines.push(item.text));
  else if (!lines.length && notes.length) lines.push(notes[0].text);

  /* extras live in the pill's more tray: alternatives (kind "alt") first,
     then the edge cases (kind "skip") last; the pill shows only the beat */
  const extras = [];
  (director.extras || []).forEach(extra => {
    /* the crew check is the beat itself now: no separate Change crew */
    if (extra.type === "change-crew") return;
    if (extra.type === "captains-draft")
      extras.push({ label:extra.label, run:crewCheck(ev, beat, { open:"draft", evId:ev.id }) });
    else if (extra.type === "random-draw")
      extras.push({ label:extra.label, run:crewCheck(ev, beat, { write:"announceAndDraw", payload:{ evId:ev.id } }) });
    else if (extra.type === "swap-in")
      extras.push({ label:extra.label, run:{ open:"event", evId:ev.id } });
    else if (extra.type === "skip-opening" && director.then) {
      const next = directorPill(state, events, { ...director, nextAction:director.then, then:null, extras:[] }, { me, now });
      if (next?.run) extras.push({ label:extra.label, run:next.run, kind:"skip" });
    }
  });
  if (sides) extras.push({ label:"Open event", run:{ open:"event", evId:ev.id } });
  if (beat.type === "advance-scene")
    extras.push({ label:"Skip", kind:"skip", run:{ write:"endShowScene", payload:{ id:beat.sceneId, outcome:"skipped" } } });
  if (director.secondary?.type === "skip-event" && ev)
    extras.push({ label:"Skip", kind:"skip", run:{ open:"skipEvent", evId:ev.id } });
  if (director.secondary?.type === "skip-awards")
    extras.push({ label:"Skip", kind:"skip", run:{ write:"promptRevealEnd", payload:{ id:director.secondary.ballotId } } });
  if (director.secondary?.type === "skip-replay")
    extras.push({ label:"Skip", kind:"skip", run:{ write:"skipWinnerReplay", payload:{ eventId:director.secondary.eventId } } });

  /* the autopilot: its wait on the beat it owns, and its hold in the tray
     whenever it has something to run (or is holding) */
  const due = autoBeat(state, { showControl });
  const held = autopilotHeld(state);
  const auto = due && sameWrite(run, due) ? { at:due.at, from:due.from ?? null, key:due.key } : null;
  if (held) extras.unshift({ label:"Resume autopilot", run:{ write:"setAutopilot", payload:{ hold:false } } });
  else if (due) extras.push({ label:"Pause autopilot", kind:"skip", run:{ write:"setAutopilot", payload:{ hold:true } } });

  return { type:beat.type, label:beat.label, lines, bets, openedAt, run:weekend(run), sides, extras:extras.map(extra => ({ kind:"alt", ...extra, run:weekend(extra.run) })),
    blocked:false, evId:ev?.id || null, auto, held };
}
