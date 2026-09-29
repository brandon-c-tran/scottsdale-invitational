import React from "react";
import { disp } from "../../../shared/core.js";
import { ChipFace } from "../identity/PlayerIdentity.jsx";
import { drawPathText } from "./drawPath.js";
import "./draw-path.css";

/* D10: the line the draw sends you along. Your chip first, then one stop
   per match (or your group, then the final), opponents as photo chips. It
   draws left to right once when the reveal it belongs to finishes live;
   opened late, replayed from the event sheet or under reduced motion it
   is simply there. Presentation only: the cards above keep the player
   card targets. */
const Faces = ({ players, size, cls = "" }) => <span className={`fd-draw-path-faces${cls}`}>
  {players.map(player => <ChipFace key={player} p={player} size={size} flat />)}
</span>;

export function DrawPathLine({ state, path, me, animate = false }) {
  if (!path?.steps?.length || !me) return null;
  const stops = [{ id:"you", you:true }, ...path.steps];
  const text = drawPathText(path, player => disp(state, player));
  return <div className={`fd-draw-path${animate ? " is-drawing" : ""}`} role="img" aria-label={`Your path: ${text}`}
    style={{ "--path-stops":stops.length, "--path-steps":path.steps.length }}>
    <i className="fd-draw-path-line" aria-hidden="true" />
    <ol aria-hidden="true">
      {stops.map((stop, index) => <li key={stop.id} style={{ "--i":index }}
        className={`${stop.you ? "is-you" : ""}${stop.final ? " is-final" : ""}${stop.won ? " is-won" : ""}${stop.lost ? " is-lost" : ""}`}>
        <span className="fd-draw-path-node">
          {stop.you ? <ChipFace p={me} size={30} flat /> : <i className="fd-draw-path-dot" />}
        </span>
        <b>{stop.you ? "You" : stop.label}</b>
        {!stop.you && (stop.opponents?.length
          ? <Faces players={stop.opponents} size={26} />
          : stop.candidates?.length
            ? <span className="fd-draw-path-either">
                {stop.candidates.map((team, i) => <React.Fragment key={i}>
                  {i > 0 && <small>or</small>}<Faces players={team} size={24} cls=" is-candidate" />
                </React.Fragment>)}
              </span>
            : stop.from ? <small>{path.kind === "bracket" ? `${stop.from} winner` : stop.from}</small> : null)}
        {stop.note && <small className="fd-draw-path-note">{stop.note}</small>}
      </li>)}
    </ol>
  </div>;
}
