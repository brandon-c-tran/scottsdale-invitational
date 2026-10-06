import React, { useMemo, useRef } from "react";
import { ChipFace } from "../identity/PlayerIdentity.jsx";
import { usePlayerIdentity } from "../identity/PlayerIdentityContext.js";
import { floodColor } from "../identity/chipInk.js";
import { useFreshChange } from "../../lib/motion.js";
import { DesertBand } from "./DesertBand.jsx";
import { constellationStars } from "./desertModel.js";
import { CLASS_H, CLASS_TIMING, CLASS_W, classEntrance, classPhotoLayout, classPhotoModel } from "../results/classPhoto.js";
import { nextLatch, useTimeline } from "./tvMotion.js";

/* D3 on the TV: the class photo, full frame over the masthead, the same
   composition the commissioner saves as the poster. When the champion scene
   steps to it freshly, the rows fill from the front of the photo to the
   back and the champion lands last; a reload, a late TV, reduced motion or
   the frozen TV's ambient turn shows the photo still. The win lights the
   glass for its champion: the sky's disc and its glow in their own color
   (a shared top keeps the finale's sun). */
export function ClassPhoto({ state, events, standings, moment = null }) {
  const sole = standings.length > 0 && standings.filter(row => row.rank === 1).length === 1;
  const champ = usePlayerIdentity(sole ? standings[0].player : null);
  const layout = useMemo(() => classPhotoLayout(classPhotoModel(state, standings)), [state, standings]);
  const stars = useMemo(() => constellationStars(state, events), [state.results, events]); // eslint-disable-line react-hooks/exhaustive-deps
  const timeline = useTimeline(moment?.id || null, moment?.anchor, CLASS_TIMING.total);
  const playing = timeline.playing && !!moment;
  const delays = useMemo(() => classEntrance(layout), [layout]);
  const { title } = layout;
  return (
    <div className={`tv-class${playing ? " is-playing" : ""}${sole ? " is-lit" : ""}`}
      style={{ ...(playing ? { "--tl":`${-Math.round(timeline.elapsed)}ms` } : {}), ...(sole ? { "--champ-color":floodColor(champ.color) } : {}) }}
      role="img" aria-label={`${title.brand} · ${title.edition}. ${layout.slots.map(slot => `${slot.rank} ${slot.name.text}`).join(", ")}`}>
      <DesertBand phase="fin" variant="full" width={CLASS_W} height={CLASS_H} stars={stars} starBox={layout.starBox} showStars
        className="tv-class-sky" />
      <div className="tv-class-title" style={{ top:title.top, fontSize:title.size }}>
        <b>{title.brand}</b> · {title.edition}</div>
      {[...layout.slots].sort((a, b) => b.tier - a.tier).map(slot => (
        <div key={slot.player} className={`tv-class-slot${slot.rank === 1 ? " is-first" : ""}`}
          style={{ "--at":`${delays.get(slot.player) || 0}ms` }}>
          <span className="tv-class-chip" style={{ left:slot.cx - slot.r, top:slot.cy - slot.r }}>
            <ChipFace p={slot.player} size={slot.size} flat /></span>
          <span className="tv-class-tag" style={{ left:slot.tag.cx - slot.tag.r, top:slot.tag.cy - slot.tag.r,
            width:slot.tag.r * 2, height:slot.tag.r * 2, fontSize:slot.tag.size }}>{slot.tag.text}</span>
          <span className="tv-class-name" style={{ left:slot.cx - slot.name.width / 2, top:slot.name.top, width:slot.name.width,
            fontSize:slot.name.size }}>{slot.name.text}</span>
          <span className="tv-class-stack" style={{ left:slot.cx - slot.name.width / 2, top:slot.stack.top, width:slot.name.width,
            fontSize:slot.stack.size }}>{slot.stack.text}</span>
        </div>
      ))}
    </div>
  );
}

/* The class step's entrance, fresh only: the champion scene moving onto
   its "class" step on a fresh frame, from that write's own time. */
export function useClassMoment(scene) {
  const active = scene?.active || null;
  const key = active?.kind === "champion" ? active.id : null;
  const change = useFreshChange(key ? scene.stepKey : null, key);
  const latch = useRef(null);
  latch.current = nextLatch(latch.current, { change, key, build:(from, to) => from !== to && to === "class"
    ? { anchor:Number(active.updatedAt) || 0, step:to } : null });
  const moment = latch.current?.moment || null;
  return moment && scene?.stepKey === moment.step ? moment : null;
}
