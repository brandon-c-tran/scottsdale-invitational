/* The race on the phone (float/PROTOCOL.md "The phone held sideways"): two
   paddles filling the screen, and a strip you can read in a glance while
   you watch the TV: you (your rider, your colour), your place, how far
   along the leg, your stamina, through or out against the cut line. The
   drink button sits between the paddles until the room says you drank; at
   the takeout without it, the whole screen asks for it. The countdown is
   this screen with the paddles warming up and the number over them. */
import React, { useRef } from "react";
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

function Hud({ entrant, view, onFlip }) {
  const low = view.stamina < 0.3;
  return <header className="flc-hud">
    <div className="flc-hud-me">
      <Portrait entrant={entrant} size={46} />
      {view.place ? <div className="flc-place" aria-label={`${ordinal(view.place)} of ${view.of}`}>
        <b>{ordinal(view.place)}</b><span>of {view.of}</span>
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
      {view.cut && <span className={`flc-cut ${view.cut.through ? "is-through" : "is-out"}`}>{view.cut.label}</span>}
      {onFlip && <FlipButton onFlip={onFlip} />}
    </div>
  </header>;
}

/* drink: "idle" (owed), "sent" (waiting for the room), "done", or null (nothing owed) */
function DrinkButton({ state, onDrink }) {
  if (!state) return null;
  if (state === "done") return <div className="flc-drunk" aria-label="Drink done"><CupIcon done /></div>;
  return <TapButton className={`flc-drink${state === "sent" ? " is-sent" : ""}`} onPress={onDrink} disabled={state === "sent"}>
    <CupIcon done={state === "sent"} /><span>Finished my drink</span>
  </TapButton>;
}

export default function RaceScreen({ entrant, view, geomRef, live, count = null, drink, onDrink, onStroke, onHands, onTouchEnd, onFlip }) {
  const rootRef = useRef(null), visualsRef = useRef(null);
  usePaddleInput(rootRef, { geomRef, visualsRef, enabled:true, onStroke, onHands, onTouchEnd });
  const finishing = view.arrived && drink && drink !== "done";
  const finished = view.arrived && !finishing;
  return <section ref={rootRef} className={`flc-race${view.swim ? " is-swim" : ""}${live ? " is-live" : ""}${count !== null ? " is-count" : ""}`}>
    <Hud entrant={entrant} view={view} onFlip={onFlip} />
    <div className="flc-arena">
      <Paddles ref={visualsRef} />
      {!view.arrived && <DrinkButton state={drink} onDrink={onDrink} />}
      {view.swim && !view.arrived && <div className="flc-flipped" aria-live="polite"><b>You flipped</b></div>}
    </div>
    {count !== null && <div className="flc-count" aria-live="assertive"><b key={count}>{count || "Go"}</b></div>}
    {finishing && <div className="flc-finish" data-ui="">
      <h2>Finish your drink</h2>
      {view.cut && <span className={`flc-cut ${view.cut.through ? "is-through" : "is-out"}`}>{view.cut.label}</span>}
      <TapButton className={`flc-drink is-big${drink === "sent" ? " is-sent" : ""}`} onPress={onDrink} disabled={drink === "sent"}>
        <CupIcon done={drink === "sent"} /><span>Finished my drink</span>
      </TapButton>
    </div>}
    {finished && <div className="flc-in" data-ui="">
      <b>{view.place ? ordinal(view.place) : "In"}</b>
      {view.cut && <span className={`flc-cut ${view.cut.through ? "is-through" : "is-out"}`}>{view.cut.label}</span>}
    </div>}
  </section>;
}
