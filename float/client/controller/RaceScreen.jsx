/* The race on the phone (float/PROTOCOL.md "The phone held sideways", "The
   beat"): two paddles filling the screen, and a strip you can read in a
   glance while you watch the TV: you (your rider, your colour), your place,
   how far along the leg, your groove (the streak of strokes on the beat,
   filling toward the next level), through or out against the cut line.

   The beat pulses between the paddles and on their rims, on the room's
   clock; each stroke's call is stamped over the thumb (Paddles). Before the
   gun (the grid and the countdown) the same screen is practice: the pulse
   runs, taps are judged and shown but never sent, and the 3-2-1 lands in
   the ring on the beat. The drink button sits between the paddles until the
   room says you drank; at the takeout without it, the whole screen asks for
   it. */
import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Portrait from "../locker/Portrait.jsx";
import TapButton from "./TapButton.jsx";
import Paddles from "./Paddles.jsx";
import { usePaddleInput } from "./usePaddleInput.js";
import { ordinal } from "./controllerModel.js";
import { meterOf, meterSteps } from "./rhythm.js";
import { BEAT_MS, beatPhase } from "../../shared/beat.js";

export function CupIcon({ done = false }) {
  return <svg className="flc-cup" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <path className="flc-cup-body" d="M8 6h16l-2.2 20.2a2 2 0 0 1-2 1.8h-7.6a2 2 0 0 1-2-1.8z" />
    <path className="flc-cup-fill" d="M9.4 13h13.2l-1.4 13H10.8z" />
    {done && <path className="flc-cup-check" d="M11.5 18.5l3 3 6-6.5" />}
  </svg>;
}

function FlipIcon() {
  return <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false" className="flc-flip-icon">
    <path d="M8 13a9 9 0 0 1 15.5-4.5L26 11" /><path d="M26 5v6h-6" />
    <path d="M24 19a9 9 0 0 1-15.5 4.5L6 21" /><path d="M6 27v-6h6" />
  </svg>;
}

export function FlipButton({ onFlip }) {
  return <TapButton className="flc-flip" onPress={onFlip} aria-label="Turn the screen around"><FlipIcon /></TapButton>;
}

export function CutChip({ cut, big = false }) {
  if (!cut) return null;
  return <span className={`flc-cutchip ${cut.through ? "is-through" : "is-out"}${big ? " is-big" : ""}`}>{cut.label}</span>;
}

/* a flag from the room rising (false to true): a key for `ms`, then null */
function useRise(flag, ms) {
  const [at, setAt] = useState(null);
  const was = useRef(false);
  useEffect(() => {
    if (flag && !was.current) setAt(Date.now());
    was.current = !!flag;
  }, [flag]);
  useEffect(() => {
    if (at === null) return undefined;
    const id = setTimeout(() => setAt(null), ms);
    return () => clearTimeout(id);
  }, [at, ms]);
  return at;
}

const reducedMotion = () => { try { return !!globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches; } catch { return false; } };

/* The beat, drawn: the ring between the paddles swells and sends a ripple,
   and both rims light, on every beat of the room's clock. One animation per
   part, a beat long and looping, put on the beat from beatPhase and put
   back every two seconds (and on coming back to the page), so the
   compositor runs it and a busy frame never moves it. Reduced motion keeps
   the beat as light alone. */
const PULSE = Object.freeze({
  core:[{ transform:"scale(1.14)", opacity:1, easing:"cubic-bezier(0.2, 0.7, 0.3, 1)" },
    { transform:"scale(1)", opacity:0.5, offset:0.42 }, { transform:"scale(1)", opacity:0.5 }],
  coreStill:[{ opacity:1, easing:"ease-out" }, { opacity:0.45, offset:0.42 }, { opacity:0.45 }],
  wave:[{ transform:"scale(1)", opacity:0.7, easing:"cubic-bezier(0.2, 0.7, 0.3, 1)" },
    { transform:"scale(1.8)", opacity:0, offset:0.72 }, { transform:"scale(1.8)", opacity:0 }],
  rim:[{ opacity:1, easing:"cubic-bezier(0.3, 0.6, 0.4, 1)" }, { opacity:0.12, offset:0.5 }, { opacity:0.12 }],
});
/* a frame is on the glass about this long after it is drawn */
const FRAME_LEAD_MS = 16;
const ALIGN_MS = 2000;

function useBeatPulse(rootRef, { gun, serverNow, on }) {
  useEffect(() => {
    const root = rootRef.current;
    if (!on || !root || !Number.isFinite(gun) || typeof serverNow !== "function") return undefined;
    const still = reducedMotion();
    const parts = [[root.querySelector(".flc-beat-core"), still ? PULSE.coreStill : PULSE.core],
      [still ? null : root.querySelector(".flc-beat-wave"), PULSE.wave],
      ...[...root.querySelectorAll(".flc-rim")].map(el => [el, PULSE.rim])]
      .filter(([el]) => el && typeof el.animate === "function");
    const runs = parts.map(([el, frames]) => el.animate(frames, { duration:BEAT_MS, iterations:Infinity }));
    const align = () => {
      const at = beatPhase(serverNow() + FRAME_LEAD_MS, gun) * BEAT_MS;
      for (const run of runs) { try { run.currentTime = at; } catch {} }
    };
    align();
    const id = setInterval(align, ALIGN_MS);
    const back = () => { if (document.visibilityState === "visible") align(); };
    document.addEventListener("visibilitychange", back);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", back);
      for (const run of runs) { try { run.cancel(); } catch {} }
    };
  }, [rootRef, gun, serverNow, on]);
}

/* the groove the phone shows: its own call at once, the room's once it has caught up */
function useGroove(beat) {
  const rhythm = beat?.rhythm || null;
  const noop = useRef(() => () => {}).current;
  useSyncExternalStore(rhythm ? rhythm.subscribe : noop, rhythm ? rhythm.version : () => 0, () => 0);
  const [, retick] = useState(0);
  const now = beat?.serverNow?.() ?? Date.now();
  const due = rhythm ? rhythm.dueAt(now, beat.gun) : null;
  useEffect(() => {
    if (due === null) return undefined;
    const id = setTimeout(() => retick(n => n + 1), Math.max(0, due - now) + 4);
    return () => clearTimeout(id);
  }, [due]); // eslint-disable-line react-hooks/exhaustive-deps
  return rhythm ? rhythm.meter(now, beat.gun) : meterOf(0);
}

/* the round closing: a bar that drains to the room's endsAt (the cap after
   the first finisher, or the hard cap from the gun), shown in its last minute */
function Closing({ endsAt, now }) {
  const bar = useRef(null);
  const left = Number.isFinite(endsAt) && Number.isFinite(now) ? endsAt - now : null;
  const shown = left !== null && left > 0 && left <= 60000;
  useEffect(() => {
    const el = bar.current;
    if (!shown || !el || typeof el.animate !== "function") return undefined;
    const run = el.animate([{ transform:`scaleX(${Math.min(1, left / 60000)})` }, { transform:"scaleX(0)" }],
      { duration:left, easing:"linear", fill:"forwards" });
    return () => run.cancel();
  }, [endsAt, shown]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!shown) return null;
  return <div className="flc-closing" role="img" aria-label={`The round ends in ${Math.ceil(left / 1000)} seconds`}><i ref={bar} /></div>;
}

/* the streak toward the next level, in three steps, and the level's name
   (which pops in when a level is reached, not when one is lost) */
function Groove({ meter }) {
  const steps = meterSteps(meter.streak);
  const seen = useRef({ level:meter.level, up:false });
  if (seen.current.level !== meter.level) seen.current = { level:meter.level, up:meter.level > seen.current.level };
  return <div className={`flc-groove is-l${meter.level}`} role="img"
    aria-label={`Streak ${meter.streak}${meter.name ? `, ${meter.name}` : ""}`}>
    <div className="flc-groove-bar">
      {steps.map(step => <i key={step.level} className={`is-s${step.level}${step.fill >= 1 ? " is-full" : ""}`}>
        <b style={{ transform:`scaleX(${step.fill})` }} /></i>)}
    </div>
    <span className={`flc-groove-name${seen.current.up ? " is-up" : ""}`} key={meter.level}>{meter.name}</span>
  </div>;
}

function Hud({ entrant, view, slot, before, meter, onFlip }) {
  const place = view.place || (before ? slot : null);
  return <header className="flc-hud">
    <div className="flc-hud-me">
      <Portrait entrant={entrant} size={44} />
      {place ? <div className="flc-place" aria-label={view.place ? `${ordinal(place)} of ${view.of}` : `Start ${ordinal(place)}`}>
        <b>{ordinal(place)}</b>{view.place && view.of ? <span>of {view.of}</span> : <span>start</span>}
      </div> : <div className="flc-place is-blank" />}
    </div>
    <div className="flc-hud-mid">
      <div className="flc-track" aria-hidden="true"><i className="flc-track-fill" style={{ transform:`scaleX(${view.progress})` }} />
        <i className="flc-track-dot" style={{ left:`${view.progress * 100}%` }} /><i className="flc-track-flag" /></div>
      <Groove meter={meter} />
    </div>
    <div className="flc-hud-end">
      <CutChip cut={view.cut} />
      {onFlip && <FlipButton onFlip={onFlip} />}
    </div>
  </header>;
}

/* drink: "locked" (before the gun), "idle" (owed), "sent" (waiting for the
   room), "done", or null (nothing owed) */
function DrinkButton({ state, onDrink }) {
  if (!state) return null;
  if (state === "done") return <div className="flc-drunk" role="img" aria-label="Drink done"><CupIcon done /></div>;
  return <TapButton className={`flc-drink is-${state}`} onPress={onDrink} disabled={state !== "idle"}>
    <CupIcon done={state === "sent"} /><span>Finished my drink</span>
  </TapButton>;
}

/* a balloon landed on you: water on the glass */
const DROPS = [[14, 22, 38, 0], [31, 58, 26, 40], [52, 18, 46, 20], [70, 46, 30, 70], [86, 26, 22, 30], [44, 72, 34, 90],
  [8, 64, 24, 60], [62, 80, 20, 110], [92, 70, 28, 50], [24, 40, 18, 120]];
function Splat() {
  return <div className="flc-splat" aria-hidden="true">
    {DROPS.map(([x, y, s, d], k) => <i key={k} style={{ "--x":`${x}%`, "--y":`${y}%`, "--s":`${s}px`, "--d":`${d}ms` }} />)}
  </div>;
}

/* beat: { rhythm, gun, serverNow } (null: no beat yet); practice: before
   the gun, nothing sent; judgeAt and onLand: the controller's call at a
   touch (usePaddleInput) */
export default function RaceScreen({ entrant, view, geomRef, live, count = null, slot = null, resume = false, drink, onDrink,
  onStroke, onHands, onTouchEnd, onFlip, endsAt = null, now = null, practice = false, beat = null, visualsRef = null,
  judgeAt = null, onLand = null }) {
  const rootRef = useRef(null), ownVisuals = useRef(null);
  const visuals = visualsRef || ownVisuals;
  usePaddleInput(rootRef, { geomRef, visualsRef:visuals, enabled:true, onStroke, onHands, onTouchEnd, judgeAt, onLand });
  const counting = count !== null;
  const finishing = view.arrived && (drink === "idle" || drink === "sent");
  const finished = view.arrived && !finishing;
  const splat = useRise(view.splashed, 1100);
  const bumped = useRise(view.bump, 320);
  const meter = useGroove(beat);
  const pulsing = !!beat && Number.isFinite(beat.gun) && !view.arrived;
  useBeatPulse(rootRef, { gun:beat?.gun, serverNow:beat?.serverNow, on:pulsing });
  const before = practice || counting;
  const cls = ["flc-race", view.swim && "is-swim", live && "is-live", counting && "is-count", practice && "is-practice",
    bumped && "is-bumped", meter.top && "is-top"].filter(Boolean).join(" ");
  return <section ref={rootRef} className={cls} data-level={meter.level}>
    <Hud entrant={entrant} view={view} slot={slot} before={before} meter={meter} onFlip={onFlip} />
    <div className="flc-arena">
      <Paddles ref={visuals} />
      <div className={`flc-beat${pulsing ? "" : " is-off"}`} aria-hidden="true"><i className="flc-beat-wave" /><i className="flc-beat-core" /></div>
      {counting && <div className={`flc-count${resume ? " is-resume" : ""}`} aria-live="assertive"><b key={count}>{count || "Go"}</b></div>}
      {practice && count !== 0 && <p className="flc-cue">Stroke on the beat</p>}
      {!view.arrived && (!before || count === 0) && <DrinkButton state={drink} onDrink={onDrink} />}
      {view.swim && !view.arrived && <div className="flc-flipped" aria-live="polite"><b>You flipped</b></div>}
    </div>
    {splat && <Splat key={splat} />}
    {finishing && <div className="flc-finish" data-ui="">
      <Closing endsAt={endsAt} now={now} />
      <h2>Finish your drink</h2>
      <CutChip cut={view.cut} big />
      <TapButton className={`flc-drink is-big is-${drink}`} onPress={onDrink} disabled={drink !== "idle"}>
        <CupIcon done={drink === "sent"} /><span>Finished my drink</span>
      </TapButton>
    </div>}
    {finished && <div className="flc-in" data-ui="">
      <b>{view.place ? ordinal(view.place) : "In"}</b>
      <CutChip cut={view.cut} big />
    </div>}
  </section>;
}
