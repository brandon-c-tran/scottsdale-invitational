/* A song on the phone (float/GROOVE.md "The screen (TV) and the phone"): the
   whole screen is the pad. Your critter bobs on the beat from the room's
   clock and plays its action on your tap; the host's call shows as a bubble
   on its beat, so a loud room still sees it; your judgement lands big over
   your critter the moment you tap. "Practice" in practice, narrated in a
   text box at the top (the host shows a cue: "Watch"), the round card in
   the 3 s lead and the intro. The breakdown copies the host a bar later
   ("Copy me"). In play, your place and the field in the corner ("4th of
   13", Safe or Below the cut; the final's place alone).

   The touch is the controller's (onTap, from a native touchstart: React
   listens passively and could not stop the page from scrolling or
   zooming); this draws. */
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Critter, Host, Popup } from "./art.jsx";
import { beatCounter, darkAt, demoAt, narrationAt, pendingCalls, rankView, songView } from "./controllerModel.js";
import { cueTime } from "../../shared/chart.js";
import { CutLine, Scenery } from "./parts.jsx";
import SeatMap from "./SeatMap.jsx";

const perfNow = () => globalThis.performance?.now?.() ?? Date.now();
const reducedMotion = () => { try { return !!globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches; } catch { return false; } };

/* The pad's listeners, pure over the events they get: every new touch
   outside a button ([data-ui]) is a tap at the touch's own time (each
   finger of a multi-finger touch its own), and the touch is the page's no
   further (no scroll, no zoom, no click, no selection); a mouse or a pen,
   and Space or Enter, tap too (the desk, the preview). tap(at, event). */
export function padHandlers(tap) {
  const outside = event => !event.target?.closest?.("[data-ui]");
  return {
    touchstart(event) {
      if (!outside(event)) return;
      if (event.cancelable) event.preventDefault();
      const at = Number(event.timeStamp);
      const n = Math.max(1, event.changedTouches?.length || 0);
      for (let k = 0; k < n; k++) tap(at, event);
    },
    pointerdown(event) {
      if (event.pointerType === "touch" || event.button > 0 || !outside(event)) return;
      tap(Number(event.timeStamp), event);
    },
    keydown(event) {
      if (event.repeat || (event.code !== "Space" && event.code !== "Enter") || event.target?.closest?.("input, textarea, select, button")) return;
      event.preventDefault?.();
      tap(Number(event.timeStamp), event);
    },
  };
}

/* the pad on an element: native listeners (React listens to touches passively) */
export function usePad(rootRef, onTap) {
  const tap = useRef(onTap);
  tap.current = onTap;
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const on = padHandlers((at, event) => tap.current?.(at, event));
    const active = { passive:false };
    root.addEventListener("touchstart", on.touchstart, active);
    root.addEventListener("pointerdown", on.pointerdown);
    window.addEventListener("keydown", on.keydown);
    return () => {
      root.removeEventListener("touchstart", on.touchstart, active);
      root.removeEventListener("pointerdown", on.pointerdown);
      window.removeEventListener("keydown", on.keydown);
    };
  }, [rootRef]);
}

/* the room's clock, re-read on every half beat of the song (each call lands
   on its own), and every quarter second in the lead */
export function useSongNow(serverNow, songAt, beatMs = 500, on = true) {
  const [now, setNow] = useState(() => serverNow?.() ?? Date.now());
  useEffect(() => {
    if (!on || typeof serverNow !== "function" || !Number.isFinite(songAt)) return undefined;
    const step = beatMs / 2;
    let id = null;
    const tick = () => {
      const t = serverNow();
      setNow(t);
      const next = t < songAt ? t + 250 - ((t - songAt) % 250 + 250) % 250 : songAt + Math.floor((t - songAt) / step + 1) * step;
      id = setTimeout(tick, Math.max(8, next - serverNow()) + 2);
    };
    tick();
    return () => clearTimeout(id);
  }, [serverNow, songAt, beatMs, on]);
  return now;
}

/* The bob on the beat: one animation a beat long, looping, put on the room's
   beat and put back every two seconds (and on coming back to the page), so
   the compositor runs it and a busy frame never moves it. */
const BOB = [
  { transform:"translateY(3px) scale(1.05, 0.93)", easing:"cubic-bezier(0.2, 0.8, 0.3, 1)" },
  { transform:"translateY(-7px) scale(0.98, 1.03)", offset:0.4, easing:"cubic-bezier(0.5, 0, 0.6, 1)" },
  { transform:"translateY(3px) scale(1.05, 0.93)" },
];
const FRAME_LEAD_MS = 16;
export function useBeatBob(ref, { songAt, serverNow, beatMs = 500, on = true }) {
  useEffect(() => {
    const el = ref.current;
    if (!on || !el || typeof el.animate !== "function" || !Number.isFinite(songAt) || typeof serverNow !== "function" || reducedMotion()) return undefined;
    const run = el.animate(BOB, { duration:beatMs, iterations:Infinity });
    const align = () => {
      const phase = (((serverNow() + FRAME_LEAD_MS - songAt) % beatMs) + beatMs) % beatMs;
      try { run.currentTime = phase; } catch {}
    };
    align();
    const id = setInterval(align, 2000);
    const back = () => { if (document.visibilityState === "visible") align(); };
    document.addEventListener("visibilitychange", back);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", back); try { run.cancel(); } catch {} };
  }, [ref, songAt, serverNow, beatMs, on]);
}

/* the critter's moves on a tap: a paddle dips, a hey jumps, a hop leaps, a spin turns, the drop drops */
const MOVES = Object.freeze({
  paddle:[{ transform:"none" }, { transform:"translateY(8px) rotate(-7deg)", offset:0.35 }, { transform:"none" }],
  hey:[{ transform:"none" }, { transform:"translateY(-26px) scale(0.96, 1.06)", offset:0.4 }, { transform:"none" }],
  hop:[{ transform:"none" }, { transform:"translateY(-46px) scale(0.95, 1.07)", offset:0.45 }, { transform:"translateY(4px) scale(1.06, 0.94)", offset:0.8 }, { transform:"none" }],
  spin:[{ transform:"none" }, { transform:"scaleX(-1)", offset:0.5 }, { transform:"none" }],
  drop:[{ transform:"none" }, { transform:"translateY(26px) scale(1.08, 0.9)", offset:0.4 }, { transform:"none" }],
  rocket:[{ transform:"none" }, { transform:"translateY(6px) scale(1.08, 0.9)", offset:0.2 }, { transform:"translateY(-22px) scale(0.96, 1.05)", offset:0.5 }, { transform:"none" }],
  miss:[{ transform:"none" }, { transform:"translateX(-8px) rotate(-5deg)", offset:0.25 }, { transform:"translateX(7px) rotate(4deg)", offset:0.55 }, { transform:"none" }],
  cheer:[{ transform:"none" }, { transform:"translateY(-40px) scale(0.96, 1.06)", offset:0.45 }, { transform:"none" }],
});
export function useMove(ref, act) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!act || !el || typeof el.animate !== "function" || reducedMotion()) return;
    const frames = MOVES[act.kind] || MOVES.paddle;
    el.animate(frames, { duration:act.kind === "hop" ? 360 : act.kind === "miss" ? 420 : 280, easing:"cubic-bezier(0.3, 0.7, 0.4, 1)" });
  }, [act?.key]); // eslint-disable-line react-hooks/exhaustive-deps
}

/* the pose a tap leaves: its action, then pleased for a Perfect or a Nice; a miss flubs */
const ACTION_POSE = Object.freeze({ paddle:"stroke", hey:"hey", hop:"stroke", spin:"stroke", drop:"hey", rocket:"hey", miss:"miss", cheer:"cheer" });
export function usePose(act, base = "idle", side = null) {
  const [, bump] = useState(0);
  const at = act?.at ?? -Infinity;
  const age = perfNow() - at;
  const pleased = act && (act.q === "perfect" || act.q === "nice");
  const until = act?.kind === "miss" ? 560 : act?.kind === "cheer" ? 520 : pleased ? 620 : 300;
  useEffect(() => {
    if (!act || age >= until) return undefined;
    const marks = [260, until].filter(ms => ms > age);
    const ids = marks.map(ms => setTimeout(() => bump(n => n + 1), ms - age + 4));
    return () => ids.forEach(clearTimeout);
  }, [act?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!act || age >= until) return base;
  if (act.kind === "miss" || act.kind === "cheer") return ACTION_POSE[act.kind];
  if (age < 260) return act.kind === "paddle" && side === "right" ? "stroke-r" : ACTION_POSE[act.kind] || "stroke";
  return pleased ? "nice" : base;
}

/* the kayak's stroke (v3 "Row in every song"): each of your paddle taps
   dips the other side from the last (`stroke` left, `stroke-r` right), a
   miss flubs. { key, side, flub } or null */
export function strokeStep(memo, act) {
  if (act && act.key !== memo.key) {
    memo.key = act.key;
    if (act.kind === "paddle") { memo.n += 1; memo.stroke = { key:act.key, side:memo.n % 2 ? "left" : "right", flub:false }; }
    else if (act.kind === "miss") memo.stroke = { key:act.key, side:null, flub:true };
    else memo.stroke = null;
  }
  return memo.stroke;
}
export function useStroke(act) {
  const last = useRef({ key:null, n:0, stroke:null });
  return strokeStep(last.current, act);
}

/* the popup: up the moment it is set, gone after `ms` */
export const PHONE_POPUP_MS = 820;
export function useShown(item, ms = PHONE_POPUP_MS) {
  const [, bump] = useState(0);
  const age = item ? perfNow() - item.at : Infinity;
  useEffect(() => {
    if (!item || age >= ms) return undefined;
    const id = setTimeout(() => bump(n => n + 1), ms - age + 4);
    return () => clearTimeout(id);
  }, [item?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  return item && age < ms ? item : null;
}

function HostBubble({ calls }) {
  const live = calls.length > 0;
  return <div className={`flc-call${live ? " is-on" : ""}`} aria-hidden={!live}>
    <Host pose={live && calls.some(call => !call.answered) ? "call" : "idle"} size={88} />
    {live && <div className="flc-bubble" role="status">
      {calls.map(call => <b key={call.key} className={`flc-word is-${call.kind}${call.answered ? " is-answered" : ""}`}>{call.word}</b>)}
    </div>}
  </div>;
}

/* the round card: the round, the song, how many go through, and your seat in the flotilla (seats: seatView) */
export function RoundCard({ shape, name, seats = null, entrant = null }) {
  return <div className={`flc-card${seats ? " has-seats" : ""}`} role="status">
    <span className="flc-card-kicker">{shape.final ? "Final" : `Round ${shape.round + 1}${shape.rounds ? ` of ${shape.rounds}` : ""}`}</span>
    <h1 className="flc-card-title">{name}</h1>
    <CutLine of={shape.of} through={shape.through} />
    {seats && <SeatMap view={seats} entrant={entrant} />}
  </div>;
}

/* the practice's narration: Rhythm Heaven's text box at the top */
function Narration({ text }) {
  return <div className="flc-line" role="status"><b key={text}>{text}</b></div>;
}

/* a stroke's mark on the counter: the paddle, small */
const PaddleMark = () => <svg className="flc-count-paddle" viewBox="0 0 40 14" aria-hidden="true" focusable="false">
  <rect x="7" y="5.5" width="26" height="3" rx="1.5" /><ellipse cx="5" cy="7" rx="5" ry="4.5" /><ellipse cx="35" cy="7" rx="5" ry="4.5" />
</svg>;

/* practice's count (v3): 1 2 3 4 at the foot, the beats you tap lit (the host's demo beat ringed), the beat now pulsing */
export function BeatCounter({ counter }) {
  if (!counter) return null;
  return <div className="flc-counter" aria-hidden="true">
    {counter.beats.map(beat => <span key={beat.n} className={`flc-count${beat.on ? " is-on" : ""}${beat.move ? " is-move" : beat.row ? " is-row" : ""}${beat.demo ? " is-demo" : ""}${counter.now === beat.n - 1 ? " is-now" : ""}`}>
      <i key={counter.now === beat.n - 1 ? `now-${counter.bar}` : "rest"}>{beat.n}{beat.and ? "+" : ""}</i>
      <b>{beat.on && beat.row && !beat.move ? <PaddleMark /> : null}{beat.on ? beat.word : ""}</b>
    </span>)}
  </div>;
}

/* who's ahead: your place, small, in the song bar's corner */
function Rank({ rank }) {
  return <span className={`flc-rank${rank.safe === true ? " is-safe" : rank.safe === false ? " is-below" : ""}`} role="status">
    <b key={rank.place}>{rank.text}</b>{rank.status && <em>{rank.status}</em>}
  </span>;
}

/* props: serverNow (the room's clock), chart, songAt, entrant, shape (roundShape), name,
   popup ({ key, q, d, at }), act ({ key, kind, q, at }), me (the room's word on you), onTap */
export default function SongScreen({ serverNow, chart, songAt, entrant, shape, name, popup = null, act = null, me = null, seats = null,
  onTap, onExit = null }) {
  const rootRef = useRef(null), bobRef = useRef(null), moveRef = useRef(null);
  usePad(rootRef, onTap);
  const now = useSongNow(serverNow, songAt, chart?.beatMs);
  const view = songView(chart, songAt, now);
  /* practice is narrated from a beat before it (the intro's last beat) */
  const line = narrationAt(chart, view.beat);
  const card = (view.moment === "card" || view.moment === "intro") && !line;
  const calls = card ? [] : pendingCalls(chart, view.beat);
  const rank = rankView({ me, view, shape });
  /* the host showing a cue: "Watch", and your critter acts it out with the band's answer */
  const demo = view.moment === "practice" ? demoAt(chart, view.beat) : null;
  const demoAct = demo && view.beat >= demo.beat && Number.isFinite(songAt)
    ? { key:`demo-${demo.id}`, kind:demo.kind, q:"nice", at:perfNow() - (now - cueTime(songAt, demo.beat, chart.beatMs)) } : null;
  const moved = demoAct && (!act || demoAct.at > act.at) ? demoAct : act;
  const stroke = useStroke(moved);
  const pose = usePose(moved, "idle", stroke?.side);
  useMove(moveRef, moved);
  useBeatBob(bobRef, { songAt, serverNow, beatMs:chart?.beatMs, on:Number.isFinite(songAt) && view.moment !== "card" });
  const shown = useShown(popup);
  const watch = !!demo && line !== "Watch" && !shown;
  const counter = beatCounter(chart, view);
  /* a blackout bar: the scene dims, no calls (the pad still judges) */
  const dark = darkAt(chart, view.beat);
  /* a launch that lands: a burst in your colour over you (a Perfect the biggest) */
  const burst = act && act.kind === "rocket" && act.q && act.q !== "miss" && perfNow() - act.at < 900 ? act : null;
  const progress = Number.isFinite(view.beat) && chart ? Math.max(0, Math.min(1, view.beat / chart.beats)) : 0;
  return <section ref={rootRef} className={`flc-screen flc-song is-${view.moment}${line ? " has-line" : ""}${dark ? " is-dark" : ""}`}
    data-moment={view.moment} data-scene={chart?.scene || "open"}>
    <Scenery scene={chart?.scene || "open"} />
    <i className="flc-tint" aria-hidden="true" />
    <header className="flc-songbar">
      <span className="flc-songname">{name}</span>
      {view.moment === "practice" && <span className="flc-tag">Practice</span>}
      {rank && <Rank rank={rank} />}
      {onExit && <span className="flc-songbar-end" />}
      <i className="flc-progress" aria-hidden="true"><b style={{ transform:`scaleX(${progress})` }} /></i>
    </header>
    {card && <RoundCard shape={shape} name={name} seats={seats} entrant={entrant} />}
    {!card && <div className="flc-head">
      {line && <Narration text={line} />}
      <HostBubble calls={calls} />
    </div>}
    <div className="flc-stage">
      <div className="flc-popup-slot">{shown ? <Popup key={shown.key} q={shown.q} d={shown.d} />
        : watch ? <b className="flc-watch-tag" key={`watch-${demo.id}`}>Watch</b> : null}</div>
      {burst && <i className={`flc-burst is-${burst.q}`} key={`burst-${burst.key}`} aria-hidden="true" />}
      <div className="flc-me" ref={bobRef}><div className="flc-me-move" ref={moveRef}>
        <Critter entrant={entrant} pose={pose} size={300} />
      </div></div>
    </div>
    <BeatCounter counter={counter} />
  </section>;
}
