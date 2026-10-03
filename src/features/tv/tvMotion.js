/* The TV's two motion scenes, the pure half and their hooks.
   M14: a bracket match decided freshly fills gold and stamps, the loser
   fades, the winners ride the connector into their next slot, and the UP NOW
   outline travels to the next open match.
   M18: the crown. The standings step down, the champion's row rises, their
   color floods the screen, their chip drops and spins, the name stamps in
   and the final stack counts up.

   Both are server-anchored: the bracket from the decision's own write time
   (lastContest.decidedAt), the crown from the champion scene's start (or the
   crowning write), so every TV turns the same beat together. Both are
   fresh-gated through the motion foundation: a reload, a TV joining late,
   a reconnect, or a correction shows the end state. */

import { useEffect, useRef, useState } from "react";
import { resolveSlot } from "../../../shared/core.js";
import { useFreshChange, useReducedMotion, easeFn, cubicBezier } from "../../lib/motion.js";
import { serverNow } from "../../lib/serverClock.js";

/* ms from the decision (p3-tv-advance) */
export const ADVANCE_TIMING = Object.freeze({
  fill:0, fillMs:240,          // the winning row fills sun from the left
  stamp:120, stampMs:320,      // WON stamps
  lose:250, loseMs:300,        // the losing row steps back
  lift:700, ride:760, rideMs:800, // the winners lift off and ride the connector
  land:1540, landMs:320,       // they land in the next slot
  upNow:1900, upNowMs:600,     // UP NOW travels to the next open match
  unfill:2700, unfillMs:500,   // the fill settles to the bracket's resting style
  total:3200,
});

/* ms from the crown: the produced crown (Backglass, Oct 2; retimed Oct 2
   from 66s to about 23s: "each place takes so long"). Night falls on the
   art and the towers stand in final order (3.5s), they go dark one by one
   from last place up to 3rd 0.6s apart (each name and final stack
   stamped), the last two hold on a roll (2s), 2nd goes dark, the
   champion's tower rises, their color floods out from it, the name lands,
   the stack counts, and the constellation joins. Every phone floods on the
   same `flood` beat and sounds its note of the room's chord. */
export const CROWN_TIMING = Object.freeze({
  night:0, nightMs:1800,             // lean-in: night falls on the art
  title:700,                         // "Final" lights
  towers:1600, towersMs:1500, towersStagger:100, // the towers stand, last place first
  hold:3300,                         // the final standings, as they stood
  stepDown:3600, stepStagger:600, stepMs:500, // a tower goes dark, 13th up to 3rd
  holdTwo:10200, holdTwoMs:2000,     // the last two hold
  second:12200,                      // 2nd goes dark
  rise:13000, riseMs:1500,           // the champion's tower rises and cascades
  flood:14500, floodMs:1000,         // their color floods from their tower
  chip:15400, chipMs:1400,           // their chip drops and turns twice
  tag:15900, tagMs:300,              // CHAMPION stamps
  name:16200, nameStagger:60, nameMs:380,
  stats:17200, statsMs:300,
  count:17600, countMs:1800,         // the final stack counts in 25s
  path:18200, pathStagger:110, pathMs:300,
  lines:19800, lineStagger:300, lineMs:300, // the constellation joins
  total:23500,
});

/* When the tower in final position `index` (0 = champion) of `count` goes
   dark, ms from the crown. The field from last place up to 3rd steps
   `stepStagger` apart from stepDown, ending a step before the last two's
   hold; 2nd goes at `second`; the champion's rises at `rise`. A shorter
   field takes up to two steps per tower to fill the same window. */
export function crownOutAt(index, count, C = CROWN_TIMING) {
  const n = Math.max(1, Math.floor(Number(count) || 1));
  const i = Math.max(0, Math.min(n - 1, Math.floor(Number(index) || 0)));
  if (i === 0) return C.rise;
  if (i === 1) return C.second;
  const outs = n - 2;
  const step = outs > 1 ? Math.min(2 * C.stepStagger, (C.holdTwo - C.stepStagger - C.stepDown) / (outs - 1)) : 0;
  return Math.round(C.stepDown + (n - 1 - i) * step);
}

/* ── the bracket ── */

/* every match's winner in one string: "-" undecided */
export function bracketSignature(br) {
  if (!br?.rounds) return null;
  return br.rounds.map(round => round.map(match =>
    match.winner === null || match.winner === undefined ? "-" : String(match.winner)).join(",")).join("/");
}
const decidedOf = sig => {
  const out = new Map();
  if (typeof sig !== "string") return out;
  sig.split("/").forEach((round, r) => round.split(",").forEach((w, m) => {
    if (w !== "-" && w !== "") out.set(`${r}-${m}`, Number(w));
  }));
  return out;
};

/* the slot a match's winner moves into: { r, m, index } or null (the final) */
export function feedTarget(br, r, m) {
  for (let r2 = r + 1; r2 < (br?.rounds?.length || 0); r2++) {
    for (let m2 = 0; m2 < br.rounds[r2].length; m2++) {
      const match = br.rounds[r2][m2];
      const index = [match.a, match.b].findIndex(slot => slot?.w && slot.w[0] === r && slot.w[1] === m);
      if (index >= 0) return { r:r2, m:m2, index };
    }
  }
  return null;
}

/* What one fresh step of the bracket moves. Only forward steps move: a
   winner cleared or changed is a rewind and shows its end state. Two at
   once still play; more is a batch. */
export function bracketAdvanceMotion(br, fromSig, toSig, { hotTo = null } = {}) {
  if (!br?.rounds || !fromSig || !toSig || fromSig === toSig) return null;
  const before = decidedOf(fromSig), after = decidedOf(toSig);
  for (const [key, winner] of before) if (after.get(key) !== winner) return null;
  const added = [...after.keys()].filter(key => !before.has(key));
  if (!added.length || added.length > 2) return null;
  const matches = added.map(key => {
    const [r, m] = key.split("-").map(Number);
    const match = br.rounds[r]?.[m];
    if (!match) return null;
    const sides = [resolveSlot(br, match.a), resolveSlot(br, match.b)];
    const winner = after.get(key);
    const winIndex = sides.indexOf(winner);
    return { r, m, winner, winIndex, loser:winIndex >= 0 ? sides[1 - winIndex] : null, target:feedTarget(br, r, m) };
  }).filter(Boolean);
  if (!matches.length) return null;
  const hotFrom = [matches[0].r, matches[0].m];
  return { matches, hotFrom, hotTo:hotTo ? [hotTo[0], hotTo[1]] : null };
}

/* Bracket geometry in canvas pixels, the same numbers TVBracket lays out
   with percentages: columns share the width, each match centred on what
   feeds it (bracketLayout's centres, in card units). `rounds` is the column
   count; a mirrored bracket also passes each match's column and the way its
   winner travels (mirroredLayout's cols and dirs). */
export function bracketGeometry({ rounds, centers, units, cols = null, dirs = null }, dims, width = 0) {
  const R = rounds;
  const cardH = dims.row * 2 + 3;
  const unit = cardH + dims.gap;
  const colW = Math.max(0, (width - (R - 1) * dims.colGap) / R);
  const col = (r, m) => cols?.[r]?.[m] ?? r;
  const left = (r, m) => col(r, m) * (colW + dims.colGap);
  const top = (r, m) => centers[r][m] * unit - unit / 2;
  const rowY = (r, m, index) => top(r, m) + 1 + dims.row / 2 + index * (dims.row + 1);
  return { cardH, unit, colW, height:Math.ceil(units * unit - dims.gap), col, left, top, rowY,
    dir:(r, m) => dirs?.[r]?.[m] ?? 1, center:(r, m) => top(r, m) + cardH / 2 };
}

/* the connector a winner rides: out of its card, down the elbow, into the
   next card, and a little way along its slot. On a mirrored bracket's right
   half the winner leaves by the left edge and travels left. */
export function railPoints(geo, dims, from, target, into = 0) {
  const dir = geo.dir ? geo.dir(from.r, from.m) : 1;
  const x0 = geo.left(from.r, from.m) + (dir > 0 ? geo.colW : 0);
  const y1 = geo.center(from.r, from.m);
  const xm = x0 + dir * dims.colGap / 2;
  const x3 = geo.left(target.r, target.m) + (dir > 0 ? 0 : geo.colW);
  const y2 = geo.rowY(target.r, target.m, target.index);
  const pts = [[x0, y1], [xm, y1], [xm, y2], [x3, y2]];
  if (into > 0) pts.push([x3 + dir * into, y2]);
  return pts;
}
export const railPath = pts => pts.slice(0, 4).map(([x, y], i) => `${i ? "L" : "M"}${round2(x)} ${round2(y)}`).join("");
const round2 = n => Math.round(n * 100) / 100;

/* the point a fraction p of the way along a polyline */
export function pointAlong(pts, p) {
  const lengths = pts.slice(1).map((pt, i) => Math.hypot(pt[0] - pts[i][0], pt[1] - pts[i][1]));
  const total = lengths.reduce((a, b) => a + b, 0);
  if (!total) return pts[0];
  let d = Math.min(1, Math.max(0, p)) * total;
  for (let i = 0; i < lengths.length; i++) {
    if (d <= lengths[i] || i === lengths.length - 1) {
      const k = lengths[i] ? Math.min(1, d / lengths[i]) : 0;
      return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k];
    }
    d -= lengths[i];
  }
  return pts[pts.length - 1];
}

const inOut = cubicBezier(0.65, 0, 0.35, 1);
/* The token's keyframes (WAAPI, linear, easing baked in): it lifts off at the
   start, rides the rail eased in and out, and hands over to the slot as it
   lands. w, h are the token's own size so it rides on its centre. */
export function tokenKeyframes(pts, { w, h, lead = 60, ride = ADVANCE_TIMING.rideMs, tail = 40, frames = 20 } = {}) {
  const duration = lead + ride + tail;
  const at = ([x, y], scale = 1, opacity = 1, offset) => ({ offset:round4(offset),
    transform:`translate(${round2(x - w / 2)}px, ${round2(y - h / 2)}px) scale(${round4(scale)})`, opacity });
  const out = [at(pts[0], 1, 0, 0), at(pts[0], 1.12, 1, lead / duration)];
  for (let i = 1; i <= frames; i++) {
    const t = i / frames;
    out.push(at(pointAlong(pts, inOut(t)), 1 + 0.12 * (1 - t) + 0.06 * Math.sin(Math.PI * t), 1, (lead + ride * t) / duration));
  }
  out.push(at(pts[pts.length - 1], 1, 0, 1));
  return { keyframes:out, duration };
}
const round4 = n => Math.round(n * 10000) / 10000;

/* ── the crown ── */

/* What the crown moment is keyed on: a champion scene (by id), or a crowned
   board without one. */
export function crownKey(state, scene = null) {
  if (!state?.frozen) return null;
  const active = scene?.active;
  if (active?.kind === "champion" && !scene.staleReason) return `scene:${active.id}`;
  return "crown";
}
/* A fresh step plays only when it crowns: the board freezing, or a champion
   scene starting. A scene ending (Skip) leaves the champion standing still. */
export const crownPlays = (from, to) => !!to && (from === null || from === undefined
  || (String(to).startsWith("scene:") && from !== to));

/* ── timelines ── */

/* where a server-anchored timeline stands: elapsed ms, clamped, and
   whether it still has anything left to play */
export function timelineAt(anchor, now, total) {
  const a = Number(anchor);
  if (!Number.isFinite(a) || a <= 0) return { elapsed:total, playing:false };
  const elapsed = Math.max(0, Number(now) - a);
  return { elapsed:Math.min(total, elapsed), playing:elapsed < total };
}
/* the progress 0..1 of a beat at `start` lasting `ms`, given elapsed */
export const beatProgress = (elapsed, start, ms) => ms > 0 ? Math.min(1, Math.max(0, (elapsed - start) / ms)) : 1;

/* Latch one fresh change into a moment that outlives the render it came
   in: `build(from, to)` returns the moment, or null for nothing to play. */
export function nextLatch(latch, { change, key, build }) {
  let next = latch && latch.key !== key ? null : latch;
  if (change?.animate && next?.changeId !== change.changeId) {
    const moment = build(change.from, change.to);
    next = { key, changeId:change.changeId, moment:moment ? { ...moment, id:`${key}:${change.changeId}` } : null };
  }
  return next;
}
function useFreshMoment(value, key, build, { valid = () => true } = {}) {
  const change = useFreshChange(value, key);
  const latch = useRef(null);
  latch.current = nextLatch(latch.current, { change, key, build });
  const moment = latch.current?.moment || null;
  return moment && valid(moment) ? moment : null;
}

/* M14: the bracket step to animate for the live event, or null */
export function useBracketMotion(state, ev, hot = null) {
  const br = ev ? state.brackets?.[ev.id] : null;
  const draw = ev ? state.draws?.[ev.id] : null;
  const sig = br && draw ? bracketSignature(br) : null;
  const key = sig ? `${ev.id}:${draw.id || ""}` : null;
  const last = ev ? state.eventOps?.[ev.id]?.lastContest : null;
  return useFreshMoment(sig, key, (from, to) => {
    const motion = bracketAdvanceMotion(br, from, to, { hotTo:hot });
    if (!motion) return null;
    const [r, m] = motion.hotFrom;
    const stamped = last?.kind === "match" && last.match?.[0] === r && last.match?.[1] === m && Number(last.decidedAt) > 0;
    return { ...motion, toSig:to, anchor:stamped ? Number(last.decidedAt) : serverNow() };
  }, { valid:moment => moment.toSig === sig });
}

/* M18: the crown moment for the champion scene, or null */
export function useCrownMoment(state, scene = null) {
  const key = crownKey(state, scene);
  const active = scene?.active;
  return useFreshMoment(key, null, (from, to) => {
    if (!crownPlays(from, to)) return null;
    const anchor = String(to).startsWith("scene:") && Number(active?.startedAt) > 0
      ? Number(active.startedAt) : Number(state.updatedAt) || serverNow();
    return { anchor, crown:to };
  }, { valid:moment => moment.crown === key });
}

/* A component's view of one anchored timeline: fixed at the moment it
   first sees `id` (so CSS delays set from it never restart), and ended by
   a timer. Reduced motion never plays. */
export function useTimeline(id, anchor, total) {
  const reduced = useReducedMotion();
  const ref = useRef({ id:undefined });
  const [, rerender] = useState(0);
  if (ref.current.id !== id) {
    const at = id ? timelineAt(anchor, serverNow(), total) : { elapsed:total, playing:false };
    ref.current = { id, elapsed:at.elapsed, done:!at.playing, startedAt:Date.now() - at.elapsed };
  }
  const current = ref.current;
  useEffect(() => {
    if (current.done) return undefined;
    const t = setTimeout(() => { current.done = true; rerender(n => n + 1); }, Math.max(0, total - current.elapsed));
    return () => clearTimeout(t);
  }, [current, total]);
  return { playing:!current.done && !reduced, elapsed:current.elapsed, startedAt:current.startedAt };
}

/* A number counted by requestAnimationFrame along an anchored timeline:
   `from` until `start`, `to` after `start + ms`, stepped in `step`. */
export function useTimelineCount(playing, startedAt, { to, start, ms, step = 1, from = 0 }) {
  const [, rerender] = useState(0);
  const elapsed = playing ? Date.now() - startedAt : Infinity;
  const p = beatProgress(elapsed, start, ms);
  useEffect(() => {
    if (!playing || p >= 1 || typeof requestAnimationFrame !== "function") return undefined;
    let raf = requestAnimationFrame(function loop() {
      rerender(n => n + 1);
      if (Date.now() - startedAt < start + ms) raf = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(raf);
  }, [playing, startedAt, start, ms, p >= 1]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!playing || p >= 1) return to;
  if (p <= 0) return from;
  const eased = easeFn.cubicOut(p);
  return from + Math.round(((to - from) * eased) / step) * step;
}
