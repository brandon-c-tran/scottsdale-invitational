/* A song on the phone (float/GROOVE.md "The screen (TV) and the phone"): the
   whole screen is the pad. Your critter bobs on the beat from the room's
   clock and plays its action on your tap; the host's call shows as a bubble
   on its beat, so a loud room still sees it; your judgement lands big over
   your critter the moment you tap. "Practice" in practice, the round card
   in the 3 s lead and the intro. The drink break: "Drink!" and a big Done
   (the pad takes no taps until it is tapped, through the break and after
   it); then "Done" (or "Break" for a rider who doesn't drink) while the pad
   waits for the beat.

   The touch is the controller's (onTap, from a native touchstart: React
   listens passively and could not stop the page from scrolling or
   zooming); this draws. */
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import TapButton from "./TapButton.jsx";
import { Critter, Host, Popup } from "./art.jsx";
import { drinkGate, pendingCalls, songView } from "./controllerModel.js";
import { CutLine, CupIcon, Scenery } from "./parts.jsx";

const perfNow = () => globalThis.performance?.now?.() ?? Date.now();
const reducedMotion = () => { try { return !!globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches; } catch { return false; } };

/* the pad: every new touch outside a button is a tap, at the touch's own time */
export function usePad(rootRef, onTap) {
  const tap = useRef(onTap);
  tap.current = onTap;
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const onStart = event => {
      if (event.target?.closest?.("[data-ui]")) return;
      if (event.cancelable) event.preventDefault();
      const at = Number(event.timeStamp);
      for (let k = 0; k < (event.changedTouches?.length || 1); k++) tap.current?.(at, event);
    };
    /* a mouse or a pen (the desk, the preview); a touch is the handler above */
    const onPointer = event => {
      if (event.pointerType === "touch" || event.button > 0 || event.target?.closest?.("[data-ui]")) return;
      tap.current?.(Number(event.timeStamp), event);
    };
    const onKey = event => {
      if (event.repeat || (event.code !== "Space" && event.code !== "Enter") || event.target?.closest?.("input, textarea, select, button")) return;
      event.preventDefault();
      tap.current?.(Number(event.timeStamp), event);
    };
    const active = { passive:false };
    root.addEventListener("touchstart", onStart, active);
    root.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      root.removeEventListener("touchstart", onStart, active);
      root.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
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
const ACTION_POSE = Object.freeze({ paddle:"stroke", hey:"hey", hop:"stroke", spin:"stroke", drop:"hey", miss:"miss", cheer:"cheer" });
export function usePose(act, base = "idle") {
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
  if (age < 260) return ACTION_POSE[act.kind] || "stroke";
  return pleased ? "nice" : base;
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

export function RoundCard({ shape, name }) {
  return <div className="flc-card" role="status">
    <span className="flc-card-kicker">{shape.final ? "Final" : `Round ${shape.round + 1}${shape.rounds ? ` of ${shape.rounds}` : ""}`}</span>
    <h1 className="flc-card-title">{name}</h1>
    <CutLine of={shape.of} through={shape.through} />
  </div>;
}

/* the drink break, owed: the only thing on the screen */
function DrinkPanel({ onDone, late }) {
  return <div className={`flc-drink${late ? " is-late" : ""}`} data-ui="">
    <h2 className="flc-drink-title">Drink!</h2>
    <TapButton className="flc-done" onPress={onDone}><CupIcon /><span>Done</span></TapButton>
  </div>;
}

/* props: serverNow (the room's clock), chart, songAt, entrant, shape (roundShape), name,
   popup ({ key, q, d, at }), act ({ key, kind, q, at }), owes, done, onTap, onDone */
export default function SongScreen({ serverNow, chart, songAt, entrant, shape, name, popup = null, act = null, owes = false, done = false,
  onTap, onDone, onExit = null }) {
  const rootRef = useRef(null), bobRef = useRef(null), moveRef = useRef(null);
  usePad(rootRef, onTap);
  const now = useSongNow(serverNow, songAt, chart?.beatMs);
  const view = songView(chart, songAt, now);
  const gate = drinkGate({ view, chart, owes, done });
  const card = view.moment === "card" || view.moment === "intro";
  const calls = card || gate.owed ? [] : pendingCalls(chart, view.beat);
  const base = gate.owed ? "chug" : "idle";
  const pose = usePose(act, base);
  useMove(moveRef, act);
  useBeatBob(bobRef, { songAt, serverNow, beatMs:chart?.beatMs, on:Number.isFinite(songAt) && view.moment !== "card" });
  const shown = useShown(popup);
  const progress = Number.isFinite(view.beat) && chart ? Math.max(0, Math.min(1, view.beat / chart.beats)) : 0;
  const late = gate.owed && !gate.inBreak;
  return <section ref={rootRef} className={`flc-screen flc-song is-${view.moment}${gate.owed ? " is-owed" : ""}`}
    data-moment={view.moment} data-scene={chart?.scene || "open"}>
    <Scenery scene={chart?.scene || "open"} />
    <header className="flc-songbar">
      <span className="flc-songname">{name}</span>
      {view.moment === "practice" && <span className="flc-tag">Practice</span>}
      {onExit && <span className="flc-songbar-end" />}
      <i className="flc-progress" aria-hidden="true"><b style={{ transform:`scaleX(${progress})` }} /></i>
    </header>
    {card && <RoundCard shape={shape} name={name} />}
    {!card && !gate.owed && <HostBubble calls={calls} />}
    {gate.resting && <div className="flc-rest" role="status"><b key={gate.drank ? "done" : "break"}>{gate.drank ? "Done" : "Break"}</b></div>}
    <div className="flc-stage">
      <div className="flc-popup-slot">{shown && !gate.owed && <Popup key={shown.key} q={shown.q} d={shown.d} />}</div>
      <div className="flc-me" ref={bobRef}><div className="flc-me-move" ref={moveRef}>
        <Critter entrant={entrant} pose={pose} size={300} />
      </div></div>
    </div>
    {gate.owed && <DrinkPanel onDone={onDone} late={late} />}
  </section>;
}
