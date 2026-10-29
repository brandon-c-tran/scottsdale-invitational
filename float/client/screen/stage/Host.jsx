/* The host on the left bank (float/GROOVE.md "Answer the host"): a critter
   in a straw hat with a megaphone, acting out every call on its beat (the
   megaphone up, the call's word in a bubble so a loud room still sees it),
   bobbing between them; in practice the demos called the same way (every
   critter acts the answer out); in the breakdown the rhythm to copy, a big
   gesture and a note a beat; in The Drop, the next pattern's sign held up a
   bar before each switch; a cheer when the song ends. The frame driver sets the
   pose and moves it; React renders it once a phase. */
import React, { useEffect, useRef } from "react";
import { HostArt, HostFigure, SignProp, useHostArt } from "../art.jsx";
import { bobAt } from "../model/motion.js";
import { hostAt, signAt } from "../model/song.js";
import { reducedMotion } from "./driver.js";

/* the host's spot: feet on the sand at the water's edge, upper left
   (stage pixels), and its drawn height */
export const HOST = Object.freeze({ x:196, y:436, h:330 });
/* the drawn host's box and anchors when the art has none */
const DRAWN_HOST = Object.freeze({ box:[400, 480], anchor:{ ground:[200, 462], horn:[336, 286] } });

/* the breakdown's call: a note */
function NoteGlyph() {
  return <svg className="fl-note" viewBox="0 0 48 56" aria-hidden="true">
    <path d="M18 8 44 3v34" fill="none" stroke="#1d1a24" strokeWidth="6" strokeLinejoin="round" />
    <path d="M18 8v36" stroke="#1d1a24" strokeWidth="6" />
    <ellipse cx="11" cy="45" rx="10" ry="8" fill="#ff4fa3" stroke="#1d1a24" strokeWidth="4" />
    <ellipse cx="37" cy="38" rx="10" ry="8" fill="#ff4fa3" stroke="#1d1a24" strokeWidth="4" />
  </svg>;
}

export default function Host({ store, driver, phase }) {
  const art = useHostArt();
  const root = useRef(null);
  const body = useRef(null);
  const bubble = useRef(null);
  const word = useRef(null);
  const sign = useRef(null);
  const signArt = useRef({});
  useEffect(() => {
    const st = store.state;
    const still = reducedMotion();
    let pose = "", text = null, signMode = null, popKey = null;
    const frame = now => {
      const chart = st.chart;
      const songAt = st.songAt;
      const inSong = phase === "song" && chart && Number.isFinite(songAt);
      const beat = inSong ? (now - songAt) / chart.beatMs : (now - (st.phaseStart || 0)) / 500;
      const h = hostAt(inSong ? chart : null, beat, { phase });
      if (root.current && h.pose !== pose) { root.current.dataset.pose = h.pose; pose = h.pose; }
      const bob = still ? { dy:0, sx:1, sy:1 } : bobAt(beat, { amp:h.pose === "call" ? 0.4 : 0.8 });
      /* a call lifts the host; the breakdown's notes are a big gesture (up, a lean, a stretch) */
      const echo = h.call?.kind === "echo";
      const into = Math.max(0, 1 - (beat - (h.call?.beat ?? beat)) / (echo ? 0.5 : 0.35));
      const lift = h.pose === "call" && !still ? (echo ? -30 : -10) * into : 0;
      const lean = echo && !still ? -7 * into * (h.call.cue % 2 ? 1 : -1) : 0;
      const stretch = echo && !still ? 0.08 * into : 0;
      if (body.current) body.current.style.transform = `translate3d(0, ${(bob.dy + lift).toFixed(1)}px, 0) rotate(${lean.toFixed(2)}deg) scale(${(bob.sx - stretch * 0.5).toFixed(4)}, ${(bob.sy + stretch).toFixed(4)})`;
      /* the bubble: the call's word (a note for the breakdown's rhythm), popping on its beat */
      const callText = h.call ? h.call.word || (echo ? "note" : null) : null;
      if (bubble.current) {
        const key = h.call ? `${h.call.cue}:${h.call.n}` : null;
        if (callText !== text || key !== popKey) {
          text = callText; popKey = key;
          if (word.current) word.current.textContent = echo ? "" : callText || "";
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
  const box = art?.box || DRAWN_HOST.box;
  const anchor = art?.anchor || DRAWN_HOST.anchor;
  const k = HOST.h / box[1];
  const horn = art?.poses ? (art.anchors?.call?.horn || anchor.horn || [box[0] * 0.9, box[1] * 0.55]) : DRAWN_HOST.anchor.horn;
  return <div className="fl-host" ref={root} data-pose="idle"
    style={{ width:box[0] * k, height:box[1] * k, transform:`translate(${HOST.x - anchor.ground[0] * k}px, ${HOST.y - anchor.ground[1] * k}px)`,
      "--horn-x":`${horn[0] * k}px`, "--horn-y":`${horn[1] * k}px`, "--ground-y":`${anchor.ground[1] * k}px` }}>
    <div className="fl-host-sign" ref={sign} style={{ opacity:0 }}>
      {["paddle", "rock", "spin"].map(mode => <div key={mode} ref={node => { signArt.current[mode] = node; }} style={{ display:"none" }}><SignProp mode={mode} /></div>)}
    </div>
    <div className="fl-host-body" ref={body}>{art ? <HostArt host={art} /> : <HostFigure />}</div>
    <div className="fl-bubble" ref={bubble} style={{ opacity:0 }}><span ref={word} /><NoteGlyph /></div>
  </div>;
}
