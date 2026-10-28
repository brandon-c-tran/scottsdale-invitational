/* The host on the left bank (float/GROOVE.md "Answer the host"): a critter
   in a straw hat with a megaphone, acting out every call on its beat (the
   megaphone up, the call's word in a bubble so a loud room still sees it),
   bobbing between them; in The Drop, the next pattern's sign held up a bar
   before each switch; a cheer when the song ends. The frame driver sets the
   pose and moves it; React renders it once a phase. */
import React, { useEffect, useRef } from "react";
import { HostFigure, SignProp } from "../art.jsx";
import { bobAt } from "../model/motion.js";
import { hostAt, signAt } from "../model/song.js";

/* the host's spot: feet on the bank, upper left (stage pixels) */
export const HOST = Object.freeze({ x:196, y:478, w:300 });

export default function Host({ store, driver, phase }) {
  const root = useRef(null);
  const body = useRef(null);
  const bubble = useRef(null);
  const word = useRef(null);
  const sign = useRef(null);
  const signArt = useRef({});
  useEffect(() => {
    const st = store.state;
    let pose = "", text = null, signMode = null, popKey = null;
    const frame = now => {
      const chart = st.chart;
      const songAt = st.songAt;
      const inSong = phase === "song" && chart && Number.isFinite(songAt);
      const beat = inSong ? (now - songAt) / chart.beatMs : (now - (st.phaseStart || 0)) / 500;
      const h = hostAt(inSong ? chart : null, beat, { phase });
      if (root.current && h.pose !== pose) { root.current.dataset.pose = h.pose; pose = h.pose; }
      const bob = bobAt(beat, { amp:h.pose === "call" ? 0.4 : 0.8 });
      const lift = h.pose === "call" ? -10 * Math.max(0, 1 - (beat - (h.call?.beat ?? beat)) / 0.35) : 0;
      if (body.current) body.current.style.transform = `translate3d(0, ${(bob.dy + lift).toFixed(1)}px, 0) scale(${bob.sx.toFixed(4)}, ${bob.sy.toFixed(4)})`;
      /* the bubble: the call's word, popping on its beat */
      const callText = h.call?.word || null;
      if (bubble.current) {
        const key = h.call ? `${h.call.cue}:${h.call.n}` : null;
        if (callText !== text || key !== popKey) {
          text = callText; popKey = key;
          if (word.current) word.current.textContent = callText || "";
          bubble.current.dataset.kind = h.call?.kind || "";
        }
        if (callText) {
          const age = (beat - h.call.beat) * (chart?.beatMs || 500);
          const scale = age < 80 ? 0.6 + 0.6 * (age / 80) : age < 160 ? 1.2 - 0.2 * ((age - 80) / 80) : 1;
          bubble.current.style.opacity = "1";
          bubble.current.style.transform = `scale(${scale.toFixed(3)})`;
        } else if (bubble.current.style.opacity !== "0") bubble.current.style.opacity = "0";
      }
      /* The Drop's sign */
      const s = inSong ? signAt(chart, beat) : null;
      const mode = s?.mode || null;
      if (sign.current) {
        if (mode !== signMode) {
          signMode = mode;
          for (const [key, node] of Object.entries(signArt.current)) if (node) node.style.display = key === mode ? "block" : "none";
        }
        if (mode) {
          const into = (beat - s.bar * 4);
          const up = into < 0.4 ? into / 0.4 : into > 3.6 ? Math.max(0, (4 - into) / 0.4) : 1;
          const wave = Math.sin(beat * Math.PI) * 3;
          sign.current.style.opacity = "1";
          sign.current.style.transform = `translate3d(0, ${((1 - up) * 120).toFixed(1)}px, 0) rotate(${wave.toFixed(2)}deg)`;
        } else if (sign.current.style.opacity !== "0") sign.current.style.opacity = "0";
      }
    };
    const off = driver.add(frame);
    driver.tick();
    return off;
  }, [driver, store, phase]);
  return <div className="fl-host" ref={root} data-pose="idle" style={{ transform:`translate(${HOST.x - HOST.w / 2}px, ${HOST.y - HOST.w * 1.2}px)` }}>
    <div className="fl-host-sign" ref={sign} style={{ opacity:0 }}>
      {["paddle", "rock", "spin"].map(mode => <div key={mode} ref={node => { signArt.current[mode] = node; }} style={{ display:"none" }}><SignProp mode={mode} /></div>)}
    </div>
    <div className="fl-host-body" ref={body}><HostFigure /></div>
    <div className="fl-bubble" ref={bubble} style={{ opacity:0 }}><span ref={word} /></div>
  </div>;
}
