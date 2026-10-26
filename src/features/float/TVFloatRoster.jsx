import React, { useEffect, useRef, useState } from "react";
import { disp } from "../../../shared/core.js";
import { ChipFace } from "../identity/PlayerIdentity.jsx";
import { GameMark } from "../../ui/GameMark.jsx";
import { recordNameFit, recordNameLines } from "../tv/recordsModel.js";
import { entranceElapsed } from "../tv/TVRecords.jsx";
import { useFloatArt } from "./floatParts.js";
import { portraitKey, portraitStore, rosterLayout } from "./floatRoster.js";
import "./float.css";

/* Float's riders (floatRoster.js): one glass panel standing on the floor
   for a turn of the TV's gap while Float is ahead, the game's mark and name
   as its label, every rider coming as the room's art draws them in the look
   they picked, each name under its rider. A rider whose still is not in
   (or a TV that cannot draw them) stands as their photo chip. The panel
   rises in on its turn's own server instant (--tl), like the records. */

/* the stills, kept for the session: TVMode asks for them as soon as the
   turn is in the rotation, so the turn itself never waits on a drawing */
const STILLS = portraitStore();
const STILL_PX = 320;
export function useRiderPortraits(riders, want = true) {
  const { art, failed } = useFloatArt(want && !!riders?.length);
  const [, bump] = useState(0);
  useEffect(() => STILLS.listen(() => bump(n => n + 1)), []);
  const key = (riders || []).map(portraitKey).join("|");
  useEffect(() => {
    if (!want || !art || failed) return;
    (riders || []).forEach(rider => STILLS.request(art.riderPortrait, rider, { size:STILL_PX }));
  }, [want, art, failed, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return rider => (art && !failed ? STILLS.get(rider) : null);
}

export function TVFloatRoster({ state, riders, turnAt = 0, now = 0 }) {
  const stillOf = useRiderPortraits(riders, true);
  const entered = useRef({ turnAt:undefined, elapsed:0 });
  if (entered.current.turnAt !== turnAt) entered.current = { turnAt, elapsed:entranceElapsed(turnAt, now) };
  const { rows, col, width } = rosterLayout(riders.length);
  /* one name size for the card, the size the hardest name fits its column */
  const names = riders.map(rider => disp(state, rider.pid));
  const size = Math.min(40, ...names.map(name => recordNameFit(name, col, { max:40, comfort:32 }).size));
  let at = 0;
  return (
    <div className="tv-pane tv-float-roster-pane">
      <section className="tv-float-roster tv-glass" aria-label="Float" data-float-roster={riders.length}
        style={{ width, "--tl":`${-entered.current.elapsed}ms`, "--col":`${col}px` }}>
        <h2 className="tv-float-roster-label"><GameMark id="float" size={56} /><span>Float</span></h2>
        <div className="tv-float-roster-rows">
          {rows.map((count, r) => {
            const row = riders.slice(at, at + count);
            const from = at;
            at += count;
            return <div key={r} className="tv-float-roster-row">
              {row.map((rider, i) => {
                const still = stillOf(rider);
                const lines = recordNameLines(names[from + i], col, size);
                return <figure key={rider.pid} className="tv-float-rider" style={{ "--i":from + i }} data-still={still ? "art" : "chip"}>
                  <span className="tv-float-rider-art">
                    {still ? <img src={still} alt="" width={col} height={col} draggable={false} />
                      : <ChipFace p={rider.pid} size={Math.round(col * 0.82)} />}
                  </span>
                  <figcaption className="fd-show tv-float-rider-name" style={{ fontSize:size }}>
                    {lines.length > 1 ? <>{lines[0]}<br />{lines[1]}</> : lines[0]}</figcaption>
                </figure>;
              })}
            </div>;
          })}
        </div>
      </section>
    </div>
  );
}
