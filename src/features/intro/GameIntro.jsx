import React, { useEffect, useRef, useState } from "react";
import { GlassArt } from "../../ui/GlassArt.jsx";
import { LampChase } from "../../ui/ScoreReel.jsx";
import { EventName } from "../../ui/OneSafe.jsx";
import { serverNow } from "../../lib/serverClock.js";
import { freshFrameNow, playSound } from "../../lib/sound.js";
import { IntroDiorama } from "./IntroScenes.jsx";
import { INTRO_MS, introElapsed, introScene } from "./introTiming.js";
import "./intro.css";

/* The game intro, one composition at two scales (Oct 3 redo). The glass is
   dark; the backlight catches with a flicker; the session's painting and
   the game's set push in on their plates; the game makes its one move and
   lands it on INTRO_TIMING.hit, where its name stamps in the Inline
   lettering; light crosses the glass; the session's lamp runs the chase.
   On the TV the podium rises onto the floor, and with a draw behind it
   the set dims and the name docks where the draw letters it.

   `anchor` is the announcement's server time (eventOps.announcedAt), so
   every screen plays the same frame; a screen that opens late joins
   mid-sequence and one that opens after it shows the finished frame.
   Without an anchor (a state from before the stamp) it plays from mount.
   Presentation only. */
const STILL_TL = -(INTRO_MS + 60000);
/* the set's window: the TV sees the whole stage, past it to both edges of
   the canvas and down to its foot (1920 x 875 at 1.1x); a phone sees the
   middle of it, a little closer (intro.css places each so the horizon, y
   450, meets the painting's) */
export const TV_BOX = "-273 0 1745 795";
export const PHONE_BOX = "270 150 660 495";

/* how far in this screen joined, fixed at mount */
export function useIntroElapsed(anchor, { reduced = false, now = serverNow } = {}) {
  const [elapsed] = useState(() => reduced ? INTRO_MS
    : Number(anchor) > 0 ? introElapsed(anchor, now()) : 0);
  return elapsed;
}

export function GameIntro({ ev, surface = "phone", anchor = null, reduced = false, handoff = false, ladder = null,
  now = serverNow, sound = false }) {
  const scene = introScene(ev);
  const elapsed = useIntroElapsed(anchor, { reduced, now });
  /* the phone's own voice for the intro: the same S2 the TV sounds, on
     this phone's bus, only while it follows live (a load, a reconnect or a
     late open says nothing; a cue past 300 ms is dropped) */
  const rung = useRef(false);
  useEffect(() => {
    if (!sound || rung.current || !(Number(anchor) > 0)) return;
    rung.current = true;
    if (!freshFrameNow()) return;
    playSound("S2", { bus:"you", at:Number(anchor), key:`intro:${ev?.id}:${anchor}`, opts:{ game:scene, summary:reduced } });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const tv = surface === "tv";
  return (
    <div className={`fd-intro is-${surface}${handoff && !reduced ? " is-handoff" : ""}${reduced ? " is-still" : ""}`} data-scene={scene}
      style={{ "--tl":`${reduced ? STILL_TL : -Math.round(elapsed)}ms` }}>
      <div className="fd-intro-paint" aria-hidden="true"><GlassArt depth clear={{ from:.22, to:.78 }} /></div>
      <svg className="fd-intro-set" viewBox={tv ? TV_BOX : PHONE_BOX} preserveAspectRatio="xMidYMax meet"
        aria-hidden="true" focusable="false">
        <IntroDiorama scene={scene} gameId={ev?.game} variant={ev?.variant} />
      </svg>
      <div className="fd-intro-light" aria-hidden="true" />
      <div className="fd-intro-base" aria-hidden="true" />
      <div className="fd-intro-dark" aria-hidden="true" />
      {ladder && <div className="fd-intro-ladder">{ladder}</div>}
      <i className="fd-intro-sweep" aria-hidden="true" />
      <i className="fd-intro-veil" aria-hidden="true" />
      <div className="fd-intro-title">
        <h2 className="fd-show is-marquee fd-glass-letter fd-intro-name"><EventName name={ev?.name || ""} /></h2>
      </div>
      {!tv && <LampChase className="fd-intro-chase" color="var(--phase)" />}
    </div>
  );
}
