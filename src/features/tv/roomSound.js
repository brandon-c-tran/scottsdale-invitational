/* A3: the TV's voice. The room's sounds ride the beats that already move on
   the TV, on the same server anchors, so every TV in the house lands them on
   the same frame:

     S1  the Opening scene (and the crown's last notes)
     S2  the event intro, at eventOps.announcedAt
     S3  each draw card, at revealTimeline().revealAt + drawStepDelay(i, n),
         panned to the card's column
     faceOff  D2, a low drum and knock as the face-off's VS stamps (the
         face-off itself waits for the intro, the draw or the decided
         contest, so this beat never lands on theirs)
     S8  betting locks (lockAndStart), at bettingLockedAt
     S5  chips landing on the board, through the density rule
     S10 WON, S11 losing stacks to the bank, S12 the payout, and for a
         bracket the ride, the landing and a quiet UP NOW bell, on
         ADVANCE_TIMING from the decision's own write time
     S14 a result posted (or a winner scene starting)
     S15 a new leader (the ChipTowers lead ring and the flat board's
         leader). A lead that changes with a decided contest rings when
         its lead card docks, after the contest's moment (dockCard); one
         that changes with a posted result leaves the frame to S14.
     S18 a draft pick landing in its seat (MOTION.cardFlight)
     S20 a fresh deal, S21 blinds up, S22 a bust
     S23/S24/S10/S1 the crown on CROWN_TIMING
     D6  an award: its ballot chips (the chip density rule), then S10 and
         S14 as the winner stamps, on AWARD_TIMING from reveal.at

   Pure: roomSnapshot() reduces a state to what can sound, roomCues() diffs
   two snapshots into cues, advanceCues() and crownCues() lay out the two
   composed sequences. The hook plays them only on a fresh frame; a first
   render, a TV joining late, a reconnect or a correction sounds nothing.
   Reduced motion collapses each sequence to its one summary sound. */

import { useEffect, useRef } from "react";
import { pokerClock, resolveCurrentContest, resolveWager, wagerMatchesContest } from "../../../shared/core.js";
import { MOTION } from "../../lib/motion.js";
import { cueAt, freshFrameNow, roomChipsLanded } from "../../lib/sound.js";
import { serverNow } from "../../lib/serverClock.js";
import { buildEventReveal, drawStepDelay, revealReady, revealTimeline } from "../weekend/drawReveal.js";
import { sideKeyOf } from "../wagers/betStacks.js";
import { levelAnchor, levelRoll } from "../poker/pokerMotion.js";
import { ADVANCE_TIMING as A, CROWN_TIMING as C } from "./tvMotion.js";
import { FACEOFF_TIMING } from "./faceOff.js";
import { TV_ADVANCE_MS } from "./tvModel.js";
import { awardOnTv } from "../../../shared/prompts.js";
import { awardCues } from "../awards/awardsModel.js";

/* the settle board on the TV (TVMode SettleBoard): losers slide, then winners grow */
export const SETTLE_SOUND = Object.freeze({ lose:700, pay:1300 });

const posted = res => Number(res?.confirmedAt || res?.ts) || 0;
const panAt = (col, cols) => cols > 1 ? Math.round((-0.6 + 1.2 * col / (cols - 1)) * 100) / 100 : 0;

/* the draw's cards across the TV canvas (TVDrawReveal's layout) */
export function revealPans(reveal) {
  if (!reveal) return [];
  if (reveal.versus) return [-0.5, 0.5];
  const groups = reveal.groups || [];
  const cols = groups.length === 4 ? 2 : Math.min(3, Math.max(1, groups.length));
  return groups.map((_, index) => panAt(index % cols, cols));
}
/* the contest's sides across the board (ContestBoard's grid) */
export function sidePans(contest) {
  const n = contest?.sides?.length || 0;
  if (n <= 1) return new Array(n).fill(0);
  if (n === 2) return [-0.55, 0.55];
  const cols = n <= 6 ? 2 : 3;
  return contest.sides.map((_, index) => panAt(index % cols, cols));
}
/* taps riding each side of the current contest: one chip per tap */
export function contestChipCounts(state, events, contest) {
  const counts = new Map((contest?.sides || []).map(side => [side.key, 0]));
  if (!contest) return counts;
  (state.wagers || []).forEach(wager => {
    if (!wagerMatchesContest(wager, contest)) return;
    if (resolveWager(state, wager, events).status !== "pending") return;
    const key = sideKeyOf(state, contest, wager);
    if (!counts.has(key)) return;
    counts.set(key, counts.get(key) + Math.max(1, Array.isArray(wager.chips) ? wager.chips.length : 1));
  });
  return counts;
}

/* Everything on the TV that can sound, reduced to comparable facts. */
export function roomSnapshot(state, events = [], { standings = null, allTied = false, liveEv = null, showScene = null } = {}) {
  if (!state) return null;
  const announced = {}, reveals = {}, locks = {}, results = {}, drafts = {};
  for (const ev of events) {
    const op = state.eventOps?.[ev.id] || {};
    if (Number(op.announcedAt) > 0) announced[ev.id] = Number(op.announcedAt);
    if (Number(op.bettingLockedAt) > 0) locks[ev.id] = Number(op.bettingLockedAt);
    const res = state.results?.[ev.id];
    if (res?.slots?.[0]?.length) results[ev.id] = { revision:Number(res.revision || 1), at:posted(res) };
    if (announced[ev.id] && revealReady(state, ev.id) && !state.results?.[ev.id] && !op.startedAt) {
      const reveal = buildEventReveal(state, ev);
      if (reveal) {
        const cards = reveal.versus ? 2 : (reveal.groups || []).length;
        reveals[ev.id] = { id:reveal.id, total:cards + (reveal.crew?.length ? 1 : 0), pans:revealPans(reveal),
          revealAt:revealTimeline(state, ev.id, { reveal })?.revealAt ?? null,
          reducedAt:revealTimeline(state, ev.id, { reveal, reducedMotion:true })?.revealAt ?? null };
      }
    }
  }
  for (const d of Object.values(state.drafts || {})) if (d?.id) drafts[d.id] = (d.picks || []).length;
  let chips = null;
  const contest = liveEv ? resolveCurrentContest(state, liveEv) : null;
  if (contest && contest.phase === "betting-open") {
    const counts = contestChipCounts(state, events, contest);
    const pans = sidePans(contest);
    chips = { key:`${liveEv.id}:${contest.id}`, sides:contest.sides.map((side, index) =>
      ({ key:String(side.key), count:counts.get(side.key) || 0, pan:pans[index] || 0 })) };
  }
  const leaderRows = !allTied && standings?.length ? standings.filter(row => row.rank === 1) : [];
  const pk = state.poker || null;
  const active = showScene?.active || null;
  return {
    announced, reveals, locks, results, drafts, chips,
    leader:leaderRows.map(row => row.player).sort().join("+"),
    decidedAt:liveEv ? Number(state.eventOps?.[liveEv.id]?.lastContest?.decidedAt) || 0 : 0,
    frozen:!!state.frozen,
    poker:pk ? { id:pk.id, ts:Number(pk.ts) || 0, started:!!pk.startedAt, outs:(pk.outs || []).length,
      posted:!!state.results?.[pk.id] } : null,
    scene:active && !showScene.staleReason ? { id:active.id, kind:active.kind, startedAt:Number(active.startedAt) || 0 } : null,
    award:awardOnTv(state, events),
  };
}

/* The cues one fresh step from `prev` to `next` owes the room. `now` is the
   server clock. Every cue: { id, at, pan?, opts?, key }. */
export function roomCues(prev, next, { now = serverNow(), reduced = false } = {}) {
  if (!prev || !next) return [];
  const cues = [];
  const add = (id, at, extra = {}) => cues.push({ id, at:Number.isFinite(at) && at > 0 ? at : now, ...extra });

  /* The crown owns its frame: the board freezing sounds only the crown
     (crownCues, or its call under reduced motion), whatever else the same
     write moved. */
  if (next.frozen && !prev.frozen) {
    if (reduced) add("S1", now, { key:`crown:${now}` });
    return cues;
  }
  /* One write moves one beat. A step that announces or locks several events
     at once (a rehearsal jump) sounds only the newest, and never one that
     finished inside the same step. */
  const newest = (map, isNew) => Object.entries(map)
    .filter(([evId, at]) => isNew(evId, at) && !next.results[evId])
    .sort((a, b) => b[1] - a[1])[0] || null;

  /* the intro, then the draw's cards */
  const intro = newest(next.announced, (evId, at) => prev.announced[evId] !== at);
  if (intro) add("S2", intro[1], { key:`intro:${intro[0]}:${intro[1]}` });
  for (const [evId, reveal] of Object.entries(next.reveals)) {
    const before = prev.reveals[evId];
    const freshAnnounce = prev.announced[evId] !== next.announced[evId];
    if (before?.id === reveal.id && !freshAnnounce) continue;
    if (freshAnnounce && intro?.[0] !== evId) continue;
    if (reduced) {
      add("S3", reveal.reducedAt ?? now, { key:`draw:${reveal.id}:all` });
      continue;
    }
    if (reveal.revealAt === null) continue;
    for (let i = 0; i < reveal.total; i++)
      add("S3", reveal.revealAt + drawStepDelay(i, reveal.total), { pan:reveal.pans[i] ?? 0, key:`draw:${reveal.id}:${i}` });
  }

  /* the table closes */
  const lock = newest(next.locks, (evId, at) => at > (prev.locks[evId] || 0));
  if (lock) add("S8", lock[1], { key:`lock:${lock[0]}:${lock[1]}` });

  /* chips landing on the open board, one per tap */
  if (next.chips && prev.chips?.key === next.chips.key) {
    const before = new Map(prev.chips.sides.map(side => [side.key, side.count]));
    next.chips.sides.forEach(side => {
      const added = side.count - (before.get(side.key) || 0);
      for (let k = 0; k < Math.min(6, added); k++) cues.push({ id:"chip", at:now + k * 40, pan:side.pan });
    });
  }

  /* a result posts; a winner scene (a replay at a new revision) is the same bell */
  let rang = false;
  for (const [evId, res] of Object.entries(next.results)) {
    if (prev.results[evId]) continue;
    if (!rang) { add("S14", res.at, { key:`result:${evId}:${res.revision}` }); rang = true; }
  }
  if (next.scene && next.scene.id !== prev.scene?.id) {
    if (next.scene.kind === "winner" && !rang) add("S14", next.scene.startedAt, { key:`scene:${next.scene.id}` });
    if (next.scene.kind === "opening") add("S1", next.scene.startedAt, { key:`scene:${next.scene.id}` });
  }

  /* a new leader, never on the crown itself. A posted result owns its frame
     (S14); a lead that came with a decided contest rings when its lead card
     docks, after that contest's moment (tvModel dockCard/advanceHoldUntil),
     not on top of its WON. */
  if (!next.frozen && next.leader && prev.leader && next.leader !== prev.leader && !rang) {
    const decided = Number(next.decidedAt) || 0;
    const held = decided && Math.abs(now - decided) <= TV_ADVANCE_MS + 5000 ? decided + TV_ADVANCE_MS : 0;
    add("S15", Math.max(now, held), { key:`lead:${next.leader}:${now}` });
  }

  /* D6: the next award turns on the TV */
  const award = next.award, before = prev.award;
  if (award && !(before && before.ballotId === award.ballotId && before.index === award.index))
    awardCues(award, { reduced }).forEach(cue => cues.push(cue));

  /* a pick lands in its seat */
  for (const [id, picks] of Object.entries(next.drafts))
    if (prev.drafts[id] !== undefined && picks > prev.drafts[id])
      add("S18", now + (reduced ? 0 : MOTION.cardFlight), { key:`pick:${id}:${picks}` });

  /* the finale: a deal, a bust */
  const pk = next.poker, was = prev.poker;
  if (pk && !pk.started && !pk.posted && (!was || was.id !== pk.id || was.ts !== pk.ts))
    add("S20", now, { key:`deal:${pk.id}:${pk.ts}` });
  if (pk && was && was.id === pk.id && pk.outs > was.outs)
    add("S22", now, { key:`bust:${pk.id}:${pk.outs}` });
  return cues;
}

/* A decided contest (tvModel advanceMoment), with the bracket's own motion
   when there is one. Offsets from the decision's write time. */
export function advanceCues(advance, motion = null, { reduced = false } = {}) {
  if (!advance) return [];
  const anchor = Number(motion?.anchor) || Number(advance.decidedAt);
  const at = ms => anchor + ms;
  const key = `advance:${advance.id || advance.decidedAt}`;
  if (reduced) return [{ id:"S10", at:at(0), key:`${key}:won` }];
  const cues = [{ id:"S10", at:at(A.stamp), key:`${key}:won` }];
  if (advance.settle?.losers?.length) cues.push({ id:"S11", at:at(SETTLE_SOUND.lose), key:`${key}:bank` });
  if (advance.settle?.winners?.length) cues.push({ id:"S12", at:at(SETTLE_SOUND.pay), key:`${key}:paid` });
  if (motion) {
    if (motion.matches?.some(match => match.target)) {
      cues.push({ id:"ride", at:at(A.ride - 60), opts:{ ms:A.rideMs }, key:`${key}:ride` });
      cues.push({ id:"land", at:at(A.land), key:`${key}:land` });
    }
    if (motion.hotTo) cues.push({ id:"upNow", at:at(A.upNow), key:`${key}:up` });
  }
  return cues;
}

/* M18 on the room's clock: the rows step down, the roll swells into the
   flood, the chip drops and spins, CHAMPION stamps, the stack counts, and
   the Field Day call completes. */
export function crownCues(crown, { reduced = false } = {}) {
  if (!crown) return [];
  const at = ms => Number(crown.anchor) + ms;
  const key = `crown:${crown.id || crown.anchor}`;
  if (reduced) return [{ id:"S1", at:at(0), key:`${key}:call` }];
  return [
    { id:"stepDown", at:at(C.stepDown), key:`${key}:step` },
    { id:"S23", at:at(C.rise), key:`${key}:flood` },
    { id:"S24", at:at(C.chip), key:`${key}:chip` },
    { id:"S10", at:at(C.tag), key:`${key}:tag` },
    { id:"crownCount", at:at(C.count), opts:{ ms:C.countMs }, key:`${key}:count` },
    { id:"crownCall", at:at(C.lines), key:`${key}:call` },
  ];
}

/* D2: one restrained beat as the face-off's VS stamps. The face-off is
   fresh-gated and never plays under reduced motion, so neither does this. */
export function faceOffCues(faceOff) {
  if (!faceOff?.id || !Number.isFinite(Number(faceOff.anchor))) return [];
  return [{ id:"faceOff", at:Number(faceOff.anchor) + FACEOFF_TIMING.vs, key:`faceoff:${faceOff.id}` }];
}

/* The fresh gate: the first snapshot (a load, a TV joining late) and any
   frame that is not fresh (a reconnect, a catch-up, a correction) owe the
   room nothing. */
export const roomStep = (prev, next, { fresh = false, now = serverNow(), reduced = false } = {}) =>
  prev && next && fresh ? roomCues(prev, next, { now, reduced }) : [];

export function playCues(cues) {
  const chips = [];
  for (const cue of cues) {
    if (cue.id === "chip") { chips.push({ at:cue.at, pan:cue.pan || 0 }); continue; }
    cueAt(cue.id, cue.at, { pan:cue.pan || 0, key:cue.key ?? null, opts:cue.opts || {} });
  }
  if (chips.length) roomChipsLanded(chips);
}

const reducedNow = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

/* The TV's one sound hook (TVMode): state beats on fresh frames, the
   decided contest and the crown from the moments TVMode already derives,
   and the blind clock rolling on its own. */
export function useRoomSound({ state, events, standings, allTied, liveEv, showScene, advance, bracketMotion, crown, now,
  faceOff = null }) {
  const snap = roomSnapshot(state, events, { standings, allTied, liveEv, showScene });
  const last = useRef(null);
  useEffect(() => {
    const prev = last.current;
    last.current = snap;
    playCues(roomStep(prev, snap, { fresh:freshFrameNow(), now:serverNow(), reduced:reducedNow() }));
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  /* a decided contest sounds once, when it first appears on a fresh frame */
  const advanced = useRef(null);
  const advanceId = advance ? String(advance.id || advance.decidedAt) : null;
  useEffect(() => {
    if (!advanceId || advanced.current === advanceId) return;
    advanced.current = advanceId;
    if (!freshFrameNow()) return;
    playCues(advanceCues(advance, bracketMotion, { reduced:reducedNow() }));
  }, [advanceId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* the face-off is fresh-gated already (useFaceOff), and plays once */
  const faced = useRef(null);
  useEffect(() => {
    if (!faceOff?.id || faced.current === faceOff.id) return;
    faced.current = faceOff.id;
    playCues(faceOffCues(faceOff));
  }, [faceOff?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* the crown moment is fresh-gated already (useCrownMoment) */
  const crowned = useRef(null);
  useEffect(() => {
    if (!crown?.id || crowned.current === crown.id) return;
    crowned.current = crown.id;
    playCues(crownCues(crown, { reduced:reducedNow() }));
  }, [crown?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* S21: the level rolls up by the clock, or by a fresh level write */
  const pk = state?.poker && state.poker.startedAt && !state.results?.[state.poker.id] ? state.poker : null;
  const idx = pk ? pokerClock(pk, now).idx : null;
  const level = useRef(null);
  useEffect(() => {
    const before = level.current;
    level.current = pk ? { id:pk.id, idx, at:now, anchor:levelAnchor(pk) } : null;
    if (!pk || !before || before.id !== pk.id) return;
    const dir = levelRoll({ prevIdx:before.idx, idx, prevAt:before.at, at:now,
      sameAnchor:before.anchor === levelAnchor(pk), fresh:freshFrameNow() });
    if (dir > 0) cueAt("S21", serverNow(), { key:`blinds:${pk.id}:${idx}` });
  }, [pk?.id, idx]); // eslint-disable-line react-hooks/exhaustive-deps
}
