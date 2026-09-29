/* A4, the moments a phone hears from the room, only when they are its
   owner's own: you just took the lead (S15, as the leader's row warms), a
   duel challenge addressed to you (S16), and the draft coming round to you
   (S19). Everything else about other people is silent on your phone.

   Pure: phoneSnapshot() reduces a state to those facts, phoneCues() diffs
   two snapshots. The hook plays them only on a fresh frame, so a load, a
   reconnect, a foreground catch-up or a correction says nothing. Taps (your
   chips, your card, your receipt) sound where they happen. */

import { useEffect, useRef } from "react";
import { draftTurn } from "../../../shared/core.js";
import { freshFrameNow, playSound } from "../../lib/sound.js";
import { BOARD_BEATS } from "../standings/boardModel.js";
import { duelView } from "../duels/duelView.js";

export function phoneSnapshot(state, standings, me) {
  if (!state || !me) return null;
  const leaders = !state.frozen && standings?.length && !standings.every(row => row.pts === standings[0].pts)
    ? standings.filter(row => row.rank === 1).map(row => row.player) : [];
  const challenges = (state.duels || []).filter(duel => {
    if (!duel?.id || duel.to !== me || duel.from === me) return false;
    const view = duelView(state, duel, me);
    return view.phase === "offered" || (view.phase === "live" && !duel.consent && !view.myRun);
  }).map(duel => duel.id);
  let turn = null;
  for (const draft of Object.values(state.drafts || {})) {
    const at = draftTurn(draft);
    if (at && !at.complete && at.captain === me) { turn = `${at.draftId}:${at.draftRevision}:${at.pickIndex}`; break; }
  }
  return { me, frozen:!!state.frozen, leaders, challenges, turn };
}

/* [{ id, delayMs, key }] */
export function phoneCues(prev, next) {
  if (!prev || !next || prev.me !== next.me) return [];
  const cues = [];
  const me = next.me;
  if (!next.frozen && next.leaders.includes(me) && (!prev.leaders.includes(me) || next.leaders.length < prev.leaders.length))
    cues.push({ id:"S15", delayMs:BOARD_BEATS.leader, key:null });
  const known = new Set(prev.challenges);
  const challenge = next.challenges.find(id => !known.has(id));
  if (challenge) cues.push({ id:"S16", delayMs:0, key:`duel:${challenge}` });
  /* the turn coming round to you, not your second pick at the snake's turn */
  const draftOf = turn => turn ? turn.split(":")[0] : null;
  if (next.turn && draftOf(prev.turn) !== draftOf(next.turn)) cues.push({ id:"S19", delayMs:0, key:`turn:${next.turn}` });
  return cues;
}

/* the fresh gate: a first snapshot or a frame that is not fresh says nothing */
export const phoneStep = (prev, next, { fresh = false } = {}) => prev && next && fresh ? phoneCues(prev, next) : [];

export function usePhoneSounds({ state, standings, me, active = true }) {
  const snap = active ? phoneSnapshot(state, standings, me) : null;
  const last = useRef(null);
  useEffect(() => {
    const prev = last.current;
    last.current = snap;
    for (const cue of phoneStep(prev, snap, { fresh:freshFrameNow() }))
      playSound(cue.id, { bus:"you", delayMs:cue.delayMs, key:cue.key });
  }, [state, me, active]); // eslint-disable-line react-hooks/exhaustive-deps
}
