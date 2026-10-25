/* The Trivia board in the room's voice (TV only, the room bus). Two kinds
   of cue, both on the server clock:

     state  a fresh frame's step (roomSound.js roomCues calls boardCues):
            a cell picked (boardZoom), the Daily Double (ddSting), each buzz
            landing (buzzIn, panned to the player's chip, a step higher
            each, counted afresh on a rebound), the order stamping
            (orderStamp, a place a beat, each race's), an answer
            (boardRight / boardWrong, panned), a wager or a Final pick
            locking (S18, panned), the Final's category (sting) and its
            standings (S14). A load, a reconnect or a correction sounds
            nothing (roomStep's fresh gate).
     clock  what the game's own clock owes while a phase stands
            (useBoardRoomClock): the buzzers arming at armAt (boardArm,
            again for a rebound), the last three seconds of an answer turn
            (typeTick), the Final's thinking loop a bar at a time from
            clueAt (think), and each Final turn (finalTurn, then right or
            wrong, then the total's tally). Laid on their own instants,
            keyed, cancelled when the phase moves on; a TV that joins late
            hears only what is still ahead.
   Reduced motion: the zoom is silent, the sting is its chord, the order
   one stamp, a Final turn its verdict alone. Pure apart from the hook. */
import { useEffect } from "react";
import { FINAL_ANSWER_MS } from "../../../shared/triviaBoard.js";
import { cueAt } from "../../lib/sound.js";
import { serverNow } from "../../lib/serverClock.js";
import { ORDER_STAMP_MS, boardView, finalSteps, railPan } from "../trivia/boardModel.js";

/* one bar of the thinking loop (soundKit THINK_BAR_S) */
export const THINK_BAR_MS = 2000;

/* the board, reduced to what can sound */
export function boardSnapshot(state) {
  const view = boardView(state, null, 0);
  if (!view || view.finished) return null;
  const pans = Object.fromEntries(view.players.map((player, i) => [player, railPan(i, view.players.length)]));
  return {
    id:view.game.id, phase:view.phase, clueId:view.clueId, pickedAt:view.pickedAt, dd:view.dd, closedAt:view.closedAt, race:view.race,
    buzzed:[...view.buzzedIn], order:view.order.map(row => row.player),
    attempts:view.attempts.map(attempt => ({ player:attempt.player, right:!!attempt.right, at:Number(attempt.at) || 0 })),
    revealedAt:view.revealedAt, winner:view.winner, wagerAt:view.wagerAt,
    introAt:view.finalAt.introAt, boardAt:view.finalAt.boardAt,
    wagers:Object.keys(view.finalWagers).sort(), picks:view.picksLocked.slice().sort(), pans,
  };
}

/* the cues one fresh step of the board owes the room */
export function boardCues(prev, next, { now = serverNow(), reduced = false } = {}) {
  const b = next?.board, was = prev?.board;
  if (!b) return [];
  const cues = [];
  const key = `board:${b.id}`;
  const pan = player => b.pans?.[player] || 0;
  const newClue = b.clueId && was?.clueId !== b.clueId;
  if (newClue && b.phase === "clue" && !reduced) cues.push({ id:"boardZoom", at:b.pickedAt || now, key:`${key}:${b.clueId}:zoom` });
  if (newClue && b.phase === "dd-wager")
    cues.push({ id:"ddSting", at:b.pickedAt || now, key:`${key}:${b.clueId}:dd`, opts:reduced ? { summary:true } : {} });
  if (!b.clueId || was?.clueId !== b.clueId || was?.id !== b.id) {
    /* a new clue's first frame can carry nothing else worth a sound */
  } else {
    /* the buzzes that landed since the last frame, each a step higher (a
       rebound is a new race: its buzzes count from the bottom again) */
    const race = Number(b.race) || 0;
    const sameRace = (Number(was.race) || 0) === race;
    const before = new Set(sameRace ? was.buzzed || [] : []);
    const fresh = (b.buzzed || []).filter(player => !before.has(player));
    fresh.forEach((player, i) => cues.push({ id:"buzzIn", at:now + i * 70, pan:pan(player), opts:{ step:before.size + i },
      key:`${key}:${b.clueId}:${race}:buzz:${player}` }));
    /* a race's buzzers closed: its order stamps, fastest first */
    if (b.closedAt && (!sameRace || !was.closedAt) && b.order.length) {
      const places = reduced ? 1 : Math.min(6, b.order.length);
      for (let i = 0; i < places; i++) cues.push({ id:"orderStamp", at:b.closedAt + i * ORDER_STAMP_MS, pan:pan(b.order[i]),
        opts:{ place:i + 1 }, key:`${key}:${b.clueId}:${race}:order:${i}` });
    }
    /* an answer lands */
    b.attempts.slice((was.attempts || []).length).forEach((attempt, i) =>
      cues.push({ id:attempt.right ? "boardRight" : "boardWrong", at:Math.max(attempt.at, now - 200) + i * 60, pan:pan(attempt.player),
        key:`${key}:${b.clueId}:try:${(was.attempts || []).length + i}` }));
    /* nobody took it: the answer stamps on its own */
    if (b.revealedAt && !was.revealedAt && !b.winner) cues.push({ id:"stamp", at:b.revealedAt + 250, key:`${key}:${b.clueId}:reveal` });
    /* the Daily Double's wager locks */
    if (b.wagerAt && !was.wagerAt) cues.push({ id:"stamp", at:b.wagerAt, key:`${key}:${b.clueId}:wager` });
  }
  /* the Final: its category stands, the wagers and picks lock unseen, the standings */
  if (b.phase === "final-wager" && was?.phase !== "final-wager" && b.introAt) cues.push({ id:"sting", at:b.introAt, key:`${key}:final` });
  if (was?.id === b.id) {
    const locked = (list, before, kind) => list.filter(player => !(before || []).includes(player)).forEach((player, i) =>
      cues.push({ id:"S18", at:now + i * 90, pan:pan(player), key:`${key}:${kind}:${player}` }));
    if (b.phase === "final-wager") locked(b.wagers, was.wagers, "wager");
    if (b.phase === "final-clue") locked(b.picks, was.phase === "final-clue" ? was.picks : [], "pick");
  }
  if (b.phase === "final-board" && was?.phase !== "final-board" && b.boardAt) cues.push({ id:"S14", at:b.boardAt, key:`${key}:board` });
  return cues;
}

/* What the board's clock owes the room from `now` while this phase
   stands: every cue still ahead, keyed. */
export function boardClockCues(view, now, { reduced = false } = {}) {
  if (!view || view.finished) return [];
  const key = `board:${view.game.id}`;
  const cues = [];
  const add = (id, at, extra = {}) => { if (at > now - 200) cues.push({ id, at, ...extra }); };
  if (view.phase === "clue" && view.armAt) add("boardArm", view.armAt, { key:`${key}:${view.clueId}:${view.race}:arm` });
  if ((view.phase === "answer" || view.phase === "dd-clue") && view.turnEnd)
    for (let s = 3; s >= 1; s--) add("typeTick", view.turnEnd - s * 1000, { key:`${key}:${view.clueId}:${view.turn}:tick:${s}` });
  if (view.phase === "final-clue" && view.finalAt.clueAt) {
    const bars = Math.floor(FINAL_ANSWER_MS / THINK_BAR_MS);
    for (let i = 0; i < bars; i++) add("think", view.finalAt.clueAt + i * THINK_BAR_MS,
      { key:`${key}:think:${i}`, opts:{ bar:i, last:i === bars - 1 } });
  }
  if (view.phase === "final-reveal") {
    for (const step of finalSteps(view, now)) {
      const final = step.row?.final || {};
      const pan = railPan(view.players.indexOf(step.player), view.players.length);
      const answered = Number.isInteger(final.choice);
      const at = ms => step.start + ms;
      if (!reduced) add("finalTurn", at(0), { key:`${key}:turn:${step.player}`, pan });
      if (answered) add(final.right ? "boardRight" : "boardWrong", at(step.beats.pick), { key:`${key}:turn:${step.player}:pick`, pan });
      if (!reduced && final.wager > 0) add("tally", at(step.beats.total), { key:`${key}:turn:${step.player}:total`, opts:{ up:!!final.right } });
    }
  }
  return cues;
}

const reducedNow = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

/* what stands on the TV: a new value cancels the clock cues laid for the
   last (the Final's loop is a cut recipe, so a change mid-Final fades it;
   a pick or a lock in the Final never changes it) */
export const boardStand = view => view && !view.finished
  ? `${view.game.id}:${view.phase}:${view.clueId || ""}:${view.turn}:${view.race}:${view.finalAt.clueAt}:${view.finalAt.revealAt}` : null;

/* TVBoard's clock cues: laid when a phase (or a turn) starts standing on
   this TV, cancelled when it moves on. The handle, not a key, keeps each
   one single (a key outlives a cancel). */
export function useBoardRoomClock(view, now) {
  const stand = boardStand(view);
  useEffect(() => {
    if (!stand) return undefined;
    const handles = boardClockCues(view, serverNow(), { reduced:reducedNow() })
      .map(cue => cueAt(cue.id, cue.at, { pan:cue.pan || 0, opts:cue.opts || {} }));
    return () => handles.forEach(handle => handle?.cancel?.());
  }, [stand]); // eslint-disable-line react-hooks/exhaustive-deps
}
