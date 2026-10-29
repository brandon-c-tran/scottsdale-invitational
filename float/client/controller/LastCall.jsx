/* Last Call on the phone, the countdown (float/GROOVE.md "Last Call: the
   countdown"). The bar closes at zero: the bartender counts down on the TV
   and partway the count goes dark. The phone never shows the count (the TV
   is where you watch): "Tap on zero" and one big pad; your one tap is
   `hit {c:0, r}`, then "Locked" and nothing else, not even its sound's
   quality. At revealAt your offset, big ("+0.73 Late"); at verdictAt "You
   drink" or "Safe". The first Last Call's intro says what it is, with the
   title and the line, while the TV explains. The bar is the art's own room,
   the bartender behind the counter. */
import React, { useEffect, useRef, useState } from "react";
import { bartenderSprites, sceneOf, useGrooveArt } from "../art/index.js";
import { Critter, Popup } from "./art.jsx";
import { LAST_CALL_LINE, countdownView } from "./controllerModel.js";
import { usePad } from "./SongScreen.jsx";

/* the room's clock, re-read at each of the countdown's moments (the intro's end, revealAt, verdictAt) */
function useMomentsNow(serverNow, songAt, countdown) {
  const read = () => (typeof serverNow === "function" ? serverNow() : Date.now());
  const [now, setNow] = useState(read);
  useEffect(() => {
    if (typeof serverNow !== "function" || !Number.isFinite(songAt) || !countdown) return undefined;
    let id = null;
    const step = () => {
      const t = serverNow();
      setNow(t);
      const next = [countdown.introMs, countdown.revealAt, countdown.verdictAt].map(ms => songAt + ms).find(at => at > t);
      if (Number.isFinite(next)) id = setTimeout(step, next - serverNow() + 4);
    };
    step();
    return () => clearTimeout(id);
  }, [serverNow, songAt, countdown]); // eslint-disable-line react-hooks/exhaustive-deps
  return now;
}

/* the bartender behind the counter at the far end: still while the TV counts, a cheer once it is told */
function Bartender({ pose }) {
  const manifest = useGrooveArt();
  const cast = manifest ? bartenderSprites() : null;
  const src = cast?.poses?.[pose] || cast?.poses?.idle || null;
  if (!src) return null;
  return <span className="flc-bartender" aria-hidden="true"><img src={src} alt="" draggable="false" /></span>;
}

/* props: serverNow, room, idx, chart, songAt, entrant, judged (the room's word on your tap), tap (this phone's own), onTap */
export default function LastCall({ serverNow, room, idx, chart, songAt, entrant, judged = {}, tap = null, onTap }) {
  const rootRef = useRef(null);
  usePad(rootRef, onTap);
  const countdown = chart?.countdown || null;
  const now = useMomentsNow(serverNow, songAt, countdown);
  const view = countdownView({ room, idx, chart, songAt, now, judged, tap });
  const manifest = useGrooveArt();
  const scene = manifest ? sceneOf("bar") : null;
  const counter = Number(scene?.counter) || 0.45;
  const told = view.drinks !== null;
  const pose = told ? (view.drinks ? "chug" : "cheer") : view.locked ? "nice" : "idle";
  return <section ref={rootRef} className={`flc-screen flc-lastcall is-${view.moment}${view.locked ? " is-locked" : ""}${told ? (view.drinks ? " is-drinks" : " is-safe") : ""}`}
    data-moment={view.moment} style={{ "--counter":counter }}>
    <div className="flc-bar" aria-hidden="true">
      {scene?.layers?.[0]?.src ? <img className="flc-bar-room" src={scene.layers[0].src} alt="" draggable="false" /> : <i className="flc-bar-room is-standin" />}
    </div>
    <header className="flc-songbar"><span className="flc-songname">Last Call</span></header>
    {view.moment === "intro" && <div className="flc-card flc-lastcall-card" role="status">
      <h1 className="flc-card-title">Last Call</h1>
      {view.first && <p className="flc-line-text">{LAST_CALL_LINE}</p>}
    </div>}
    {view.moment === "count" && <div className="flc-zero" role="status">
      <b className="flc-zero-title">{view.locked ? "Locked" : "Tap on zero"}</b>
    </div>}
    {(view.moment === "reveal" || view.moment === "verdict") && <div className="flc-verdict" role="status">
      {told && <b className="flc-stamp" key={view.drinks ? "drink" : "safe"}>{view.drinks ? "You drink" : "Safe"}</b>}
      {view.offset && <span className={`flc-lc-offset${told ? " is-small" : ""}`}><Popup q={view.offset.q} d={view.offset.d} size={told ? 60 : 96} life={false} /></span>}
    </div>}
    <Bartender pose={told ? "cheer" : "idle"} />
    <div className="flc-stage is-bar"><div className="flc-idle-me"><Critter entrant={entrant} pose={pose} size={280} /></div></div>
    {view.moment === "count" && <div className={`flc-zero-pad${view.locked ? " is-locked" : ""}`} aria-hidden="true">
      <i>{view.locked ? <svg viewBox="0 0 24 24"><path d="M7 11V8a5 5 0 0 1 10 0v3" /><rect x="5" y="11" width="14" height="10" rx="2.5" /></svg> : null}</i>
    </div>}
  </section>;
}
