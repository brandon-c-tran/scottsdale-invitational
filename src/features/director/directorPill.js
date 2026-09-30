/* The commissioner pill, as data. resolveDirector (shared/show.js) decides
   the beat; this turns it into what the pill says and what each target does:
   a server write, or a sheet to open. The pill component and the tap-count
   test both read this, so the count measures the real controls. */
import {
  disp, resolveCurrentContest, overflowRoleMeta, computeStandings, resolveWager, wagerMatchesContest,
  pokerClock, contestUndoAvailability, duelOpen,
} from "../../../shared/core.js";
import { postedFinalUndo } from "../../../shared/show.js";

const fmt = n => (n ?? 0).toLocaleString("en-US");
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

/* One-tap winner: a contest with exactly two sides and nothing else to pick */
export function oneTapSides(state, ev, contest) {
  if (!contest || contest.phase !== "in-progress" || contest.sides.length !== 2) return false;
  if (contest.kind === "match" || contest.kind === "stage-final") return true;
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

export function directorPill(state, events, director, { me = null, now = Date.now() } = {}) {
  const beat = director?.nextAction;
  if (!beat) return null;
  /* the frozen board keeps only its ceremony beats */
  if (state.frozen && !SCENE_BEATS.includes(beat.type)) return null;
  const ev = director.event || null;
  const contest = ev ? resolveCurrentContest(state, ev) : null;
  const reference = contest ? { contestId:contest.id, contestRevision:contest.revision } : {};
  /* the first weekend-starting write is confirmed by the App's act(), which
     the pill's writes go through; startsWeekend only marks it */
  const weekend = run => run?.write && !state.live && WEEKEND_WRITES.includes(run.write)
    ? { ...run, startsWeekend:true } : run;
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
      run = { write:"announceAndDraw", payload:{ evId:ev.id,
        ...(Array.isArray(beat.players) && beat.players.length ? { players:beat.players, roles:beat.roles || [] } : {}) } };
      break;
    }
    case "lock-start":
      run = { write:"lockAndStart", payload:{ evId:ev.id, ...reference } };
      break;
    case "record-contest-winner":
      if (oneTapSides(state, ev, contest)) {
        sides = contest.sides.map(side => ({ key:side.key, name:sideName(state, side), players:side.players,
          run:{ write:"recordContestWinner", payload:winnerPayload(state, ev, contest, side.key), recorded:sideName(state, side) } }));
      }
      run = { open:"event", evId:ev.id };
      break;
    case "continue-draft": run = { open:"draft", evId:ev.id }; break;
    case "setup-poker": case "start-poker": run = { open:"pokerSetup" }; break;
    case "run-poker": run = { open:"pokerClock" }; break;
    case "post-poker-result": run = { open:"pokerResult" }; break;
    case "crown-champion": run = { open:"crown" }; break;
    case "close-mvp": run = { write:"mvpClose", payload:{ evId:beat.eventId } }; break;
    case "enter-result": run = { open:"resultEntry", evId:ev.id }; break;
    case "post-result": run = { open:"result", evId:ev.id }; break;
    case "advance-bracket": run = { open:"bracket", evId:ev.id }; break;
    case "open-betting": run = { write:"setOnDeck", payload:{ id:ev.id, ...reference } }; break;
    case "lock-betting": run = { write:"setOnDeck", payload:{ id:null, ...reference } }; break;
    case "start-event": run = { write:"startEvent", payload:{ evId:ev.id, ...reference } }; break;
    default: run = ev ? { open:"event", evId:ev.id } : null;
  }
  if (!run) return null;

  /* the second line names what the verb acts on */
  if (beat.type === "lock-start" && matchup) lines.push(`${beat.subject}: ${matchup}`);
  else if (beat.type === "record-contest-winner" && !sides && matchup) lines.push(`${beat.subject}: ${matchup}`);
  else if (beat.type === "crown-champion") {
    const leaders = computeStandings(state).filter(row => row.rank === 1);
    lines.push(`${namesOf(state, leaders.map(row => row.player))} · ${fmt(leaders[0]?.pts)} chips`);
  } else if (beat.subject) lines.push(beat.subject);

  if (beat.type === "announce-draw" && beat.roles?.length)
    lines.push(`Crew: ${beat.roles.map(item => `${disp(state, item.player)} · ${overflowRoleMeta(item.role).label}`).join(", ")}`);
  if (beat.away?.length)
    lines.push(`${namesOf(state, beat.away)} ${beat.away.length === 1 ? "is" : "are"} marked away`);
  if (beat.type === "lock-start" && ev && state.onDeck === ev.id) {
    const bets = (state.wagers || []).filter(wager => wagerMatchesContest(wager, contest)
      && resolveWager(state, wager, events).status === "pending").length;
    const openedAt = Number(state.eventOps?.[ev.id]?.contest?.openedAt || state.eventOps?.[ev.id]?.bettingOpenedAt || 0);
    const mins = openedAt ? Math.max(0, Math.round((now - openedAt) / 60000)) : null;
    lines.push(`${bets} bet${bets === 1 ? "" : "s"} in${mins === null ? "" : ` · open ${mins} min`}`);
  }
  if (beat.type === "record-contest-winner" && contest?.players.includes(me)) lines.push("You’re playing");
  if (beat.type === "setup-poker") {
    const open = (state.duels || []).filter(duel => duelOpen(duel, now)).length;
    if (open) lines.push(`Voids ${open} open duel${open === 1 ? "" : "s"}`);
  }
  if (beat.type === "run-poker" && state.poker?.startedAt) {
    const clock = pokerClock(state.poker, now);
    lines.push(`Blinds ${fmt(clock.sb)} / ${fmt(clock.bb)}`);
  }
  if (beat.type === "post-poker-result" && state.poker) {
    const out = new Set((state.poker.outs || []).map(item => item.player));
    const seats = state.poker.seats || computeStandings(state).map(row => row.player);
    const alive = seats.filter(player => !out.has(player));
    const counted = alive.filter(player => state.poker.counts?.[player] !== undefined).length;
    lines.push(`${counted} of ${alive.length} counted`);
  }

  const extras = [];
  (director.extras || []).forEach(extra => {
    if (extra.type === "change-crew")
      extras.push({ label:extra.label, run:{ open:"announceDraw", evId:ev.id, players:beat.players, roles:beat.roles, changing:true } });
    else if (extra.type === "captains-draft")
      extras.push({ label:extra.label, run:{ open:"draft", evId:ev.id, pool:beat.players, roles:beat.roles || [] } });
    else if (extra.type === "swap-in")
      extras.push({ label:extra.label, run:{ open:"event", evId:ev.id } });
    else if (extra.type === "close-mvp")
      extras.push({ label:extra.label, run:{ write:"mvpClose", payload:{ evId:extra.eventId } } });
    else if (extra.type === "skip-opening" && director.then) {
      const next = directorPill(state, events, { ...director, nextAction:director.then, then:null, extras:[] }, { me, now });
      if (next?.run) extras.push({ label:extra.label, run:next.run });
    }
  });
  if (sides) extras.push({ label:"Open event", run:{ open:"event", evId:ev.id } });
  if (beat.type === "advance-scene")
    extras.push({ label:"Skip", run:{ write:"endShowScene", payload:{ id:beat.sceneId, outcome:"skipped" } } });
  if (director.secondary?.type === "skip-event" && ev)
    extras.push({ label:"Skip", run:{ open:"skipEvent", evId:ev.id } });
  if (director.secondary?.type === "skip-awards")
    extras.push({ label:"Skip", run:{ write:"promptRevealEnd", payload:{ id:director.secondary.ballotId } } });
  if (director.secondary?.type === "skip-replay")
    extras.push({ label:"Skip", run:{ write:"skipWinnerReplay", payload:{ eventId:director.secondary.eventId } } });

  return { type:beat.type, label:beat.label, lines, run:weekend(run), sides, extras:extras.map(extra => ({ ...extra, run:weekend(extra.run) })),
    blocked:false, evId:ev?.id || null };
}
