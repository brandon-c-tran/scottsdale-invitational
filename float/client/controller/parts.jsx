/* Small pieces every controller screen shares: the scenery behind the
   critter (a pastel sky, a sun, flat mesas and a saguaro, the checkered
   water fading into the distance; GROOVE.md "The look"), the cup, the cut
   line, the top row and the way out. */
import React from "react";
import TapButton from "./TapButton.jsx";

export function Scenery({ scene = "open", ground = "water" }) {
  return <div className={`flc-scenery is-${scene} is-${ground}`} aria-hidden="true">
    <i className="flc-sun" />
    <svg className="flc-mesas" viewBox="0 0 400 100" preserveAspectRatio="xMidYMax slice" focusable="false">
      <path className="flc-mesa-far" d="M0 100V62h46l9-16h58l11 16h30v38z" />
      <path className="flc-mesa-far" d="M228 100V54l12-9h76l14 9v46z" />
      <path className="flc-mesa-near" d="M140 100V76h40l8-12h44l9 12h22v24z" />
      <path className="flc-mesa-near" d="M330 100V80h38l8-10h24v30z" />
    </svg>
    <svg className="flc-saguaro" viewBox="0 0 40 90" focusable="false">
      <path d="M17 90V18a5 5 0 0 1 10 0v72zM17 52h-6a5 5 0 0 1-5-5V36a3.5 3.5 0 0 1 7 0v9h4zM27 44h5V30a3.5 3.5 0 0 1 7 0v15a6 6 0 0 1-6 6h-6z" />
    </svg>
    <div className={ground === "bank" ? "flc-bank" : "flc-water"}><i className="flc-checker" /></div>
  </div>;
}

export function CupIcon({ done = false }) {
  return <svg className="flc-cup" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <path className="flc-cup-body" d="M8 6h16l-2.2 20.2a2 2 0 0 1-2 1.8h-7.6a2 2 0 0 1-2-1.8z" />
    <path className="flc-cup-fill" d="M9.4 13h13.2l-1.4 13H10.8z" />
    {done && <path className="flc-cup-check" d="M11.5 18.5l3 3 6-6.5" />}
  </svg>;
}

/* the field as dots, the ones that go through lit, the cut line after them */
export function CutLine({ of, through }) {
  if (!(of > 0)) return null;
  const dots = Array.from({ length:of }, (_, k) => k);
  return <div className="flc-cutline" role="img" aria-label={through ? `${through} of ${of} go through` : `${of} playing`}>
    {dots.map(k => <React.Fragment key={k}>
      {through && k === through && <span className="flc-cutline-bar" />}
      <i className={through && k >= through ? "is-out" : "is-in"} />
    </React.Fragment>)}
  </div>;
}

export function Top({ left = null, right = null }) {
  return <div className="flc-top">{left}<span className="flc-top-gap" />{right}</div>;
}

export function ExitButton({ onExit }) {
  if (!onExit) return null;
  return <TapButton className="flc-exit" onPress={onExit} aria-label="Leave">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
  </TapButton>;
}
