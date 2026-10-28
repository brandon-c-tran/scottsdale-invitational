/* Last Call's bar (float/GROOVE.md "Last Call"): the bartender behind the
   counter, waist up, sliding the drink down the bar on each of a grab's
   slides, cheering once the totals are in; the glass gliding a step on each
   slide and reaching the end on the grab. The art's bartender and its
   `drink` prop, placed by their anchors; the frame driver moves both on
   the server clock (transform only). */
import React, { useEffect, useMemo, useRef } from "react";
import { bartenderSprites, propOf } from "../../art/groove/index.js";
import { useGrooveArt } from "../../art/groove/RiderSprite.jsx";
import { BARTENDER, COUNTER, bartenderPose, drinkersOf, glassAt } from "../model/lastcall.js";
import { bobAt } from "../model/motion.js";

const POSES = ["idle", "slide", "cheer"];

export default function Bar({ store, driver }) {
  const m = useGrooveArt();
  const art = useMemo(() => (m ? bartenderSprites(m) : null), [m]);
  const drink = useMemo(() => (m ? propOf("drink") : null), [m]);
  const root = useRef(null);
  const body = useRef(null);
  const glass = useRef(null);
  const box = art?.box || [512, 512];
  const ground = art?.anchor?.ground || [256, 504];
  const k = BARTENDER.h / box[1];
  const glassW = 92, glassH = drink ? glassW * (drink.h / drink.w) : 104;
  const glassAnchor = drink ? [(drink.anchor?.[0] ?? drink.w / 2) / drink.w * glassW, (drink.anchor?.[1] ?? drink.h) / drink.h * glassH] : [glassW / 2, glassH];
  useEffect(() => {
    const st = store.state;
    let pose = "";
    return driver.add(now => {
      const chart = st.chart;
      if (!chart || !Number.isFinite(st.songAt)) return;
      const beat = (now - st.songAt) / chart.beatMs;
      const next = bartenderPose(chart, beat, { revealed:!!drinkersOf(st.lastCall) });
      if (root.current && next !== pose) { root.current.dataset.pose = next; pose = next; }
      const bob = bobAt(beat, { amp:0.6 });
      if (body.current) body.current.style.transform = `translate3d(0, ${bob.dy.toFixed(1)}px, 0) scale(${bob.sx.toFixed(4)}, ${bob.sy.toFixed(4)})`;
      const g = glassAt(chart, beat);
      if (glass.current) {
        glass.current.style.opacity = g.visible ? "1" : "0";
        const tilt = -10 * g.sliding;
        glass.current.style.transform = `translate3d(${(g.x - glassAnchor[0]).toFixed(1)}px, ${(COUNTER.y - glassAnchor[1]).toFixed(1)}px, 0) rotate(${tilt.toFixed(2)}deg)`;
      }
    });
  }, [driver, store, glassAnchor[0], glassAnchor[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  return <>
    <div className="lc-bartender" ref={root} data-pose="idle"
      style={{ width:box[0] * k, height:box[1] * k, transform:`translate(${BARTENDER.x - ground[0] * k}px, ${BARTENDER.y - ground[1] * k}px)` }}>
      <div className="lc-bartender-body" ref={body} style={{ transformOrigin:`50% ${ground[1] * k}px` }}>
        {art?.poses ? POSES.map(pose => art.poses[pose] && <img key={pose} className={`lc-bt is-${pose}`} src={art.poses[pose]} alt="" draggable={false} />)
          : <span className="lc-bt-drawn" />}
      </div>
    </div>
    <div className="lc-glass" ref={glass} style={{ width:glassW, height:glassH, opacity:0, transformOrigin:`${glassAnchor[0]}px ${glassAnchor[1]}px` }}>
      {drink?.src ? <img src={drink.src} alt="" draggable={false} /> : <span className="lc-glass-drawn" />}
    </div>
  </>;
}
