/* The scene's loud accent and its pieces (model/pieces.js says where):
   every piece is the art's prop, placed by its own anchor; the frame driver
   moves them on the server clock (transform only). A piece standing in the
   water takes the riders' depth order by its waterline; the swirl lies
   under everyone. A piece the art lacks is left out. */
import React, { useEffect, useMemo, useRef } from "react";
import { propOf } from "../../art/groove/index.js";
import { useGrooveArt } from "../../art/groove/RiderSprite.jsx";
import { fallsAt, pieceAt, scenePieces } from "../model/pieces.js";
import { reducedMotion } from "./driver.js";

export default function Pieces({ scene, store, driver, phase }) {
  const m = useGrooveArt();
  const list = useMemo(() => (m ? scenePieces(scene, m, propOf) : []), [scene, m]);
  const nodes = useRef([]);
  useEffect(() => {
    const st = store.state;
    const still = reducedMotion();
    return driver.add(now => {
      const chart = st.chart;
      const inSong = phase === "song" && chart && Number.isFinite(st.songAt);
      const beat = inSong ? (now - st.songAt) / chart.beatMs : (now - (st.phaseStart || 0)) / 500;
      let fallsIn = inSong ? fallsAt(chart, beat) : 0;
      /* reduced motion: the pieces hold where they were when the phase
         began, nothing bobs, the falls are simply there */
      const t = still ? (st.phaseStart || now) : now;
      if (still) fallsIn = fallsIn > 0 ? 1 : 0;
      list.forEach((piece, k) => {
        const node = nodes.current[k];
        if (!node) return;
        const at = pieceAt(piece, t, { beat:still ? 0 : beat, fallsIn });
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
      style={{ width:piece.w, height:piece.h, zIndex:piece.under ? 1 : Math.round(piece.y + 1000), transformOrigin:`${piece.ax}px ${piece.ay}px` }} />)}
  </div>;
}
