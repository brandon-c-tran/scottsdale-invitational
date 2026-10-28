/* The chug-off on the phone (float/GROOVE.md "The chug-off"): after a song
   but the final, the last rider through against the first rider out race
   to finish a drink; the first Done keeps the spot. The two get
   "Chug-off!" with both names and "Finish your drink", the count to
   goAt, then one huge Done ("Chug!"), then "Waiting" until the room names
   the winner: "You keep your spot" or "Out". Everyone else gets
   "Chug-off: A vs B", the two critters, and the Cheer. The Cup's first
   chug-off says what it is. */
import React, { useEffect, useRef, useState } from "react";
import TapButton from "./TapButton.jsx";
import { Critter } from "./art.jsx";
import { CupIcon, ExitButton, Scenery, Top } from "./parts.jsx";
import { useMove, usePose } from "./SongScreen.jsx";
import { CHUGOFF_LINE, chugoffView } from "./controllerModel.js";

/* the room's clock, re-read on each of `marks` (server ms) as it passes */
function useMarksNow(serverNow, marks) {
  const read = () => (typeof serverNow === "function" ? serverNow() : Date.now());
  const [now, setNow] = useState(read);
  const key = marks.filter(Number.isFinite).join(",");
  useEffect(() => {
    if (typeof serverNow !== "function") return undefined;
    let id = null;
    const step = () => {
      const t = serverNow();
      setNow(t);
      const next = marks.filter(Number.isFinite).sort((a, b) => a - b).find(at => at > t);
      if (Number.isFinite(next)) id = setTimeout(step, next - serverNow() + 4);
    };
    step();
    return () => clearTimeout(id);
  }, [serverNow, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return now;
}

/* the count to Chug!: 3, 2, 1 over the intro's last three seconds, then "Chug!" for a beat */
export function chugCount(goAt, now) {
  if (!Number.isFinite(goAt) || !Number.isFinite(now)) return null;
  const left = goAt - now;
  if (left > 3000) return null;
  if (left > 0) return String(Math.ceil(left / 1000));
  return left > -900 ? "Chug!" : null;
}

function Names({ names }) {
  return <p className="flc-chug-names"><span>{names[0]}</span><i>vs</i><span>{names[1]}</span></p>;
}

/* props: serverNow, room, idx, entrant, sent (a Done this phone sent), onDone, cheer, onCheer, onExit */
export default function ChugOff({ serverNow, room, idx, entrant, sent = false, onDone, cheer = null, onCheer, onExit = null }) {
  const first = chugoffView({ room, idx, now:NaN, sent });
  const goAt = first.goAt;
  const now = useMarksNow(serverNow, [goAt - 3000, goAt - 2000, goAt - 1000, goAt, goAt + 900]);
  const view = chugoffView({ room, idx, now, sent });
  const count = view.moment === "told" ? null : chugCount(goAt, now);
  const entrants = Array.isArray(room?.entrants) ? room.entrants : [];
  const moveRef = useRef(null);
  useMove(moveRef, view.contender ? null : cheer);
  const cheerPose = usePose(view.contender ? null : cheer, "idle");
  const told = view.moment === "told";

  if (view.contender) {
    const pose = told ? (view.kept ? "cheer" : "out") : view.moment === "go" && !view.done ? "chug" : view.done ? "nice" : "idle";
    const live = view.moment === "go" && !view.done;
    return <section className={`flc-screen flc-chugoff is-mine is-${view.moment}${view.done ? " is-done" : ""}${told ? (view.kept ? " is-kept" : " is-out") : ""}`}>
      <Scenery scene="open" />
      <Top left={<span className="flc-kicker">Chug-off</span>} right={<ExitButton onExit={onExit} />} />
      <div className="flc-chug-main" role="status">
        {!told && !live && <h1 className="flc-chug-title">{view.done ? "Waiting" : "Chug-off!"}</h1>}
        {!told && !view.done && <Names names={view.names} />}
        {view.moment === "intro" && !count && <p className="flc-chug-sub">Finish your drink</p>}
        {view.moment === "intro" && view.first && !count && <p className="flc-line-text">{CHUGOFF_LINE}</p>}
        {count && !view.done && <b className="flc-chug-count" key={count}>{count}</b>}
        {told && <b className="flc-stamp" key={view.kept ? "kept" : "out"}>{view.kept ? "You keep your spot" : "Out"}</b>}
      </div>
      <div className="flc-stage"><div className="flc-idle-me"><Critter entrant={entrant} pose={pose} size={live ? 200 : 260} /></div></div>
      {live && <TapButton className="flc-done flc-chug-done" onPress={onDone}><CupIcon /><span>Done</span></TapButton>}
    </section>;
  }

  const [a, b] = [entrants[view.a] || {}, entrants[view.b] || {}];
  const poseOf = i => told ? (view.winner === i ? "cheer" : "out") : view.moment === "go" ? "chug" : "idle";
  const winnerName = told ? entrants[view.winner]?.name || "" : "";
  return <section className={`flc-screen flc-chugoff is-crowd is-${view.moment}`}>
    <Scenery scene="open" />
    <Top left={<span className="flc-kicker">Chug-off</span>} right={<ExitButton onExit={onExit} />} />
    <div className="flc-chug-main" role="status">
      <h1 className="flc-chug-title is-small">Chug-off: {view.names[0]} vs {view.names[1]}</h1>
      {view.moment === "intro" && view.first && !count && <p className="flc-line-text">{CHUGOFF_LINE}</p>}
      {count && <b className="flc-chug-count" key={count}>{count}</b>}
      {told && winnerName && <b className="flc-stamp is-small" key="kept">{winnerName} keeps the spot</b>}
    </div>
    <div className="flc-chug-pair" aria-hidden="true">
      <Critter entrant={a} pose={poseOf(view.a)} size={150} />
      <Critter entrant={b} pose={poseOf(view.b)} size={150} />
    </div>
    <div className="flc-stage is-low"><div className="flc-idle-me"><div className="flc-me-move" ref={moveRef}>
      <Critter entrant={entrant} pose={cheerPose} size={150} /></div></div></div>
    <TapButton className="flc-cheer" onPress={onCheer}>Cheer</TapButton>
  </section>;
}
