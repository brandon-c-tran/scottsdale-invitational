/* Last Call on the phone (float/GROOVE.md "Last Call"): the whole screen is
   the pad again. The bartender slides a drink down the bar three times; it
   steps toward your critter on each slide and reaches you on the grab
   beat: one tap a grab, judged and shown big at once ("+0.73 Late"). Your
   three grabs light up top as they are judged, with your total under them;
   once the last grab's deadline has passed, whether you drink. The bar is
   the art's own room (its counter where the scene says), a warm stand-in
   until the manifest is in. */
import React, { useRef } from "react";
import { bartenderSprites, propOf, sceneOf, useGrooveArt } from "../art/index.js";
import { Critter, Popup } from "./art.jsx";
import { lastCallView, secondsText } from "./controllerModel.js";
import { useBeatBob, useMove, usePad, usePose, useShown, useSongNow } from "./SongScreen.jsx";

const TONE = Object.freeze({ perfect:"gold", nice:"yellow", ok:"white", early:"salmon", late:"salmon", miss:"grey" });

/* the bartender behind the counter at the far end: a slide on each slide, a cheer once it is told */
function Bartender({ pose }) {
  const manifest = useGrooveArt();
  const cast = manifest ? bartenderSprites() : null;
  const src = cast?.poses?.[pose] || cast?.poses?.idle || null;
  if (!src) return null;
  return <span className="flc-bartender" aria-hidden="true"><img src={src} alt="" draggable="false" /></span>;
}

/* the bartender's pose at `beat`: sliding for half a beat from each slide */
export function bartenderPose(chart, beat, told) {
  if (told) return "cheer";
  if (!Number.isFinite(beat)) return "idle";
  const slid = (chart?.cues || []).some(cue => (cue.slides || []).some(at => beat >= at && beat < at + 0.5));
  return slid ? "slide" : "idle";
}

function Glass({ x, arrived }) {
  const manifest = useGrooveArt();
  const cup = manifest ? propOf("drink") || propOf("cup") : null;
  return <span className={`flc-glass${arrived ? " is-there" : ""}`} style={{ "--x":x }} aria-hidden="true">
    {cup?.src ? <img src={cup.src} alt="" draggable="false" />
      : <svg viewBox="0 0 40 48"><path d="M8 6h24l-3 36a4 4 0 0 1-4 4H15a4 4 0 0 1-4-4z" fill="#ffd75e" stroke="#2b2233" strokeWidth="3" />
        <path d="M8 6h24v7H8z" fill="#fffaf0" stroke="#2b2233" strokeWidth="3" /></svg>}
  </span>;
}

/* props: serverNow, room, me, idx, chart, songAt, entrant, judged (the room's word on your grabs), popup, act, onTap */
export default function LastCall({ serverNow, room, me, idx, chart, songAt, entrant, judged, popup = null, act = null, onTap }) {
  const rootRef = useRef(null), bobRef = useRef(null), moveRef = useRef(null);
  usePad(rootRef, onTap);
  const now = useSongNow(serverNow, songAt, chart?.beatMs);
  const view = lastCallView({ room, me, idx, chart, songAt, now, judged });
  const manifest = useGrooveArt();
  const scene = manifest ? sceneOf("bar") : null;
  const counter = Number(scene?.counter) || 0.45;
  const pose = usePose(act, view.drinks ? "chug" : view.drinks === false ? "cheer" : "idle");
  useMove(moveRef, act);
  useBeatBob(bobRef, { songAt, serverNow, beatMs:chart?.beatMs, on:Number.isFinite(songAt) && view.moment !== "card" });
  const shown = useShown(popup);
  const card = view.moment === "card" || view.moment === "intro";
  const told = view.drinks !== null;
  return <section ref={rootRef} className={`flc-screen flc-lastcall is-${view.moment}${told ? (view.drinks ? " is-drinks" : " is-safe") : ""}`}
    data-moment={view.moment} style={{ "--counter":counter }}>
    <div className="flc-bar" aria-hidden="true">
      {scene?.layers?.[0]?.src ? <img className="flc-bar-room" src={scene.layers[0].src} alt="" draggable="false" /> : <i className="flc-bar-room is-standin" />}
    </div>
    <header className="flc-songbar">
      <span className="flc-songname">Last Call</span>
      <span className="flc-grabs" role="img" aria-label={`${view.grabs.filter(Boolean).length} of ${view.grabs.length} grabs`}>
        {view.grabs.map((grab, k) => <i key={k} className={grab ? `is-${TONE[grab.q] || "white"}` : ""} />)}
        {!told && view.total !== null && <b className="flc-grabs-total">{secondsText(view.total)}</b>}
      </span>
    </header>
    {card && !told && <div className="flc-card" role="status"><h1 className="flc-card-title">Last Call</h1></div>}
    {told && <div className="flc-verdict" role="status">
      <b className="flc-stamp" key={view.drinks ? "drink" : "safe"}>{view.drinks ? "You drink" : "Safe"}</b>
      {view.total !== null && <b className="flc-pct">{secondsText(view.total)}</b>}
    </div>}
    <div className="flc-popup-slot is-bar">{shown && <Popup key={shown.key} q={shown.q} d={shown.d} />}</div>
    <Bartender pose={bartenderPose(chart, view.beat, told)} />
    {view.glass && <Glass x={view.glass.x} arrived={view.glass.arrived} />}
    <div className="flc-stage is-bar"><div className="flc-me" ref={bobRef}><div className="flc-me-move" ref={moveRef}>
      <Critter entrant={entrant} pose={pose} size={280} />
    </div></div></div>
  </section>;
}
