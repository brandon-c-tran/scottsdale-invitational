/* The scene's loud accent and its pieces in the water (float/GROOVE.md "The
   look": one or two loud accents per scene): Paddle Party's rainbow hoop
   and Rock Hop's buoy floating by among its rocks, Spin Cycle's rainbow
   swirl turning in the water, The Drop's falls coming up at its end with a
   rainbow over them. Every piece is the art's prop (scenes.<id>.accent
   names the accent), placed by its own anchor; the frame driver moves them
   on the server clock (transform only), each standing in the riders' depth
   order by its waterline. A piece the art lacks is left out. */
import React, { useEffect, useMemo, useRef } from "react";
import { propOf } from "../../art/groove/index.js";
import { useGrooveArt } from "../../art/groove/RiderSprite.jsx";
import { sceneMode } from "../model/song.js";
import { reducedMotion } from "./driver.js";

/* the pieces of each scene: a prop, where its anchor sits, its size; a
   drifting piece crosses the stage right to left at `drift` px a second
   (offset by `phase` seconds), a pulsing one breathes on the beat */
export const PIECES = Object.freeze({
  open:[{ prop:"accent", x:1640, y:520, w:250, drift:46, phase:6 }],
  rocks:[
    { prop:"accent", x:1500, y:540, w:200, drift:46, phase:22 },
    { prop:"rock", x:900, y:478, w:150, drift:46, phase:0 },
    { prop:"rock", x:300, y:500, w:190, drift:46, phase:33 },
    { prop:"rock", x:1200, y:470, w:120, drift:46, phase:47 },
  ],
  whirlpool:[
    { prop:"accent", x:1660, y:520, w:330, pulse:true },
    { prop:"whirl", x:560, y:500, w:240, pulse:true },
  ],
  falls:[
    { prop:"falls-lip", x:1760, y:438, w:520, falls:true },
    { prop:"accent", x:1700, y:660, w:400, falls:true },
  ],
});
/* the stage a drifting piece crosses (it wraps off the left back to the right) */
const SPAN = 2600, ENTER = 2140;

/* where a piece is at server time t: { x, y, scale, opacity } */
export function pieceAt(piece, t, { beat = 0, fallsIn = 0 } = {}) {
  let x = piece.x, scale = 1, opacity = 1;
  if (piece.drift) {
    const travel = ((t / 1000 + (piece.phase || 0)) * piece.drift) % SPAN;
    x = ENTER - ((travel + (ENTER - piece.x)) % SPAN);
  }
  if (piece.pulse) {
    const phase = beat - Math.floor(beat);
    scale = 1 + 0.035 * Math.max(0, 1 - phase / 0.3);
  }
  if (piece.falls) {
    x = piece.x + (1 - fallsIn) * 900;
    opacity = fallsIn > 0 ? 1 : 0;
  }
  return { x, y:piece.y, scale, opacity };
}

export default function Pieces({ scene, store, driver, phase }) {
  const m = useGrooveArt();
  const accent = m?.scenes?.[scene]?.accent || null;
  const list = useMemo(() => (PIECES[scene] || []).map(piece => {
    const prop = propOf(piece.prop === "accent" ? accent : piece.prop);
    if (!prop?.src) return null;
    const k = piece.w / (prop.w || piece.w);
    return { ...piece, src:prop.src, w:piece.w, h:(prop.h || piece.w) * k, ax:(prop.anchor?.[0] ?? prop.w / 2) * k, ay:(prop.anchor?.[1] ?? prop.h) * k };
  }).filter(Boolean), [scene, accent, m]); // eslint-disable-line react-hooks/exhaustive-deps
  const nodes = useRef([]);
  useEffect(() => {
    const st = store.state;
    const still = reducedMotion();
    return driver.add(now => {
      const chart = st.chart;
      const inSong = phase === "song" && chart && Number.isFinite(st.songAt);
      const beat = inSong ? (now - st.songAt) / chart.beatMs : (now - (st.phaseStart || 0)) / 500;
      /* The Drop's falls come up through its drop bars */
      let fallsIn = 0;
      if (inSong && chart.id === "drop") {
        const { mode } = sceneMode(chart, beat);
        const firstDrop = chart.modes.indexOf("drop");
        if (mode === "drop" || (firstDrop >= 0 && beat >= firstDrop * 4)) fallsIn = Math.min(1, Math.max(0, (beat - firstDrop * 4) / 4));
      }
      /* reduced motion: the pieces hold where they were when the phase
         began, nothing pulses, the falls are simply there */
      const t = still ? (st.phaseStart || now) : now;
      if (still) fallsIn = fallsIn > 0 ? 1 : 0;
      list.forEach((piece, k) => {
        const node = nodes.current[k];
        if (!node) return;
        const at = pieceAt(piece, t, { beat:still ? 0.5 : beat, fallsIn });
        node.style.transform = `translate3d(${(at.x - piece.ax).toFixed(1)}px, ${(at.y - piece.ay).toFixed(1)}px, 0) scale(${at.scale.toFixed(3)})`;
        const op = String(at.opacity);
        if (node.style.opacity !== op) node.style.opacity = op;
      });
    });
  }, [driver, store, list, phase]);
  if (!list.length) return null;
  return <div className="sc-pieces" aria-hidden="true">
    {list.map((piece, k) => <img key={`${scene}:${k}`} className="sc-piece" src={piece.src} alt="" draggable={false}
      ref={node => { nodes.current[k] = node; }}
      style={{ width:piece.w, height:piece.h, zIndex:Math.round(piece.y + 1000), transformOrigin:`${piece.ax}px ${piece.ay}px` }} />)}
  </div>;
}
