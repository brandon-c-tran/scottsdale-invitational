/* The race on the phone (float/PROTOCOL.md "The phone held sideways"): two
   paddles filling the screen, and a strip you can read in a glance while
   you watch the TV: you (your rider, your colour), your place, how far
   along the leg, your stamina, through or out against the cut line. The
   drink button sits between the paddles until the room says you drank; at
   the takeout without it, the whole screen asks for it. The countdown is
   this screen with the paddles warming up and the number over them. */
import React, { useEffect, useRef, useState } from "react";
import Portrait from "../locker/Portrait.jsx";
import TapButton from "./TapButton.jsx";
import Paddles from "./Paddles.jsx";
import { usePaddleInput } from "./usePaddleInput.js";
import { ordinal } from "./controllerModel.js";

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

/* a balloon landed on you: water on the glass */
const DROPS = [[14, 22, 38, 0], [31, 58, 26, 40], [52, 18, 46, 20], [70, 46, 30, 70], [86, 26, 22, 30], [44, 72, 34, 90],
  [8, 64, 24, 60], [62, 80, 20, 110], [92, 70, 28, 50], [24, 40, 18, 120]];
function Splat() {
  return <div className="flc-splat" aria-hidden="true">
    {DROPS.map(([x, y, s, d], k) => <i key={k} style={{ "--x":`${x}%`, "--y":`${y}%`, "--s":`${s}px`, "--d":`${d}ms` }} />)}
  </div>;
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

function Hud({ entrant, view, slot, counting, onFlip }) {
  const low = view.stamina < 0.3;
  const place = view.place || (counting ? slot : null);
  return <header className="flc-hud">
    <div className="flc-hud-me">
      <Portrait entrant={entrant} size={44} />
      {place ? <div className="flc-place" aria-label={view.place ? `${ordinal(place)} of ${view.of}` : `Start ${ordinal(place)}`}>
        <b>{ordinal(place)}</b>{view.place && view.of ? <span>of {view.of}</span> : <span>start</span>}
      </div> : <div className="flc-place is-blank" />}
    </div>
    <div className="flc-hud-mid" aria-hidden="true">
      <div className="flc-track"><i className="flc-track-fill" style={{ transform:`scaleX(${view.progress})` }} />
        <i className="flc-track-dot" style={{ left:`${view.progress * 100}%` }} /><i className="flc-track-flag" /></div>
      <div className={`flc-stamina${low ? " is-low" : ""}`}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9.5 1 3 9h4.5L6.5 15 13 7H8.5z" /></svg>
        <div className="flc-stamina-bar"><i style={{ transform:`scaleX(${view.stamina})` }} /></div>
      </div>
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

export default function RaceScreen({ entrant, view, geomRef, live, count = null, slot = null, resume = false, drink, onDrink,
  onStroke, onHands, onTouchEnd, onFlip, endsAt = null, now = null }) {
  const rootRef = useRef(null), visualsRef = useRef(null);
  usePaddleInput(rootRef, { geomRef, visualsRef, enabled:true, onStroke, onHands, onTouchEnd });
  const counting = count !== null;
  const finishing = view.arrived && (drink === "idle" || drink === "sent");
  const finished = view.arrived && !finishing;
  const splat = useRise(view.splashed, 1100);
  const bumped = useRise(view.bump, 320);
  return <section ref={rootRef} className={`flc-race${view.swim ? " is-swim" : ""}${live ? " is-live" : ""}${counting ? " is-count" : ""}${bumped ? " is-bumped" : ""}`}>
    <Hud entrant={entrant} view={view} slot={slot} counting={counting} onFlip={onFlip} />
    <div className="flc-arena">
      <Paddles ref={visualsRef} />
      {!view.arrived && !(counting && count > 0) && <DrinkButton state={drink} onDrink={onDrink} />}
      {view.swim && !view.arrived && <div className="flc-flipped" aria-live="polite"><b>You flipped</b></div>}
    </div>
    {splat && <Splat key={splat} />}
    {counting && <div className={`flc-count${resume ? " is-resume" : ""}`} aria-live="assertive">
      <b key={count}>{count || "Go"}</b></div>}
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
