/* Fireworks, the final (float/GROOVE.md v3 item 9): every judged rocket
   hit fires a firework in that rider's colour from their kayak (a Perfect
   the biggest burst, early and late small ones), a miss fizzles; after the
   three-rocket finale the sky fills in the winner's colour with a volley of
   their bursts. Also the blackout bars' cover (item 8): in a dark bar the
   scene and the riders drop to silhouettes, and only the popups, the names
   and the fireworks stay lit. A pool of nodes the frame driver moves
   (transform and opacity only); nothing re-renders in a song. */
import React, { useEffect, useRef } from "react";
import { darkAt, fireworkPhase, fireworksAt, skyAt } from "../model/fireworks.js";
import { rankNow } from "../model/rank.js";
import { castSpots } from "./Cast.jsx";
import { reducedMotion } from "./driver.js";

export const POOL = 32;
export const SPARKS = 14;
/* the sky: a burst's height from the top (stage px) at peak 1 and 0, and its radius at size 1 */
export const SKY = Object.freeze({ HIGH:130, LOW:400, RADIUS:230 });
const easeOut = t => 1 - Math.pow(1 - t, 3);

export default function Fireworks({ store, driver, entrants }) {
  const pool = useRef([]);
  const fill = useRef(null);
  const cover = useRef(null);
  useEffect(() => {
    const st = store.state;
    const still = reducedMotion();
    let darkOn = null, fillOn = "", fillColor = "";
    const used = new Map();
    return driver.add(now => {
      const chart = st.chart;
      const songAt = st.songAt;
      const inSong = st.phase === "song" && !!chart && Number.isFinite(songAt);
      const beat = inSong ? (now - songAt) / (chart.beatMs || 500) : null;
      /* the blackout */
      const dark = inSong && darkAt(chart, beat);
      if (cover.current && darkOn !== dark) { cover.current.dataset.on = dark ? "1" : ""; darkOn = dark; }
      const spots = castSpots.get(store);
      const list = inSong ? fireworksAt({ chart, songAt, judged:st.judged, field:st.songField, now }) : [];
      /* the sky after the finale, in the leader's colour */
      const sky = inSong ? skyAt(chart, songAt, now) : null;
      let winnerColor = "";
      if (sky) {
        const lead = rankNow(store, now)?.order?.[0];
        winnerColor = entrants[lead]?.color || "#ffc23d";
        for (const b of sky.bursts) list.push({ ...b, i:lead, kind:"burst", sky:true });
      }
      if (fill.current) {
        const v = sky ? (still ? 1 : sky.fill).toFixed(3) : "0";
        if (v !== fillOn) { fill.current.style.opacity = v; fillOn = v; }
        if (winnerColor && winnerColor !== fillColor) { fill.current.style.setProperty("--fw", winnerColor); fillColor = winnerColor; }
      }
      /* the pool: the newest fireworks win when there are more than nodes */
      const shown = list.slice(-pool.current.length);
      const keys = new Set(shown.map(f => f.key));
      for (const key of [...used.keys()]) if (!keys.has(key)) used.delete(key);
      const taken = new Set(used.values());
      const free = pool.current.map((_, k) => k).filter(k => !taken.has(k));
      for (const fw of shown) if (!used.has(fw.key) && free.length) used.set(fw.key, free.shift());
      const busy = new Set();
      for (const fw of shown) {
        const k = used.get(fw.key);
        const node = pool.current[k];
        if (!node) continue;
        const from = fw.sky ? { x:140 + fw.x * 1640, y:560, sc:0.8 } : spots?.get(fw.i);
        if (!from) continue;
        busy.add(k);
        const color = fw.sky ? winnerColor : entrants[fw.i]?.color || "#ffc23d";
        if (node.color !== color) { node.root.style.setProperty("--fw", color); node.color = color; }
        if (node.kind !== fw.kind) { node.root.dataset.kind = fw.kind; node.kind = fw.kind; }
        const sc = from.sc || 0.6;
        const y0 = from.y - 40 * sc;
        const peakY = fw.kind === "fizzle" ? y0 - 120 * sc : SKY.HIGH + (1 - fw.peak) * (SKY.LOW - SKY.HIGH);
        const x0 = from.x;
        const ph = fireworkPhase(fw, now);
        if (node.root.style.opacity !== "1") node.root.style.opacity = "1";
        if (ph.phase === "launch" && !still) {
          /* the rocket going up, its trail behind it */
          const y = y0 + (peakY - y0) * easeOut(ph.t);
          node.head.style.opacity = "1";
          node.head.style.transform = `translate3d(${x0.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
          node.trail.style.opacity = "0.9";
          node.trail.style.transform = `translate3d(${x0.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(1, ${Math.min(1, 0.3 + ph.t * 2).toFixed(3)})`;
          node.burst.style.opacity = "0";
          continue;
        }
        node.head.style.opacity = "0";
        node.trail.style.opacity = "0";
        const t = still ? 0.35 : ph.t;
        if (fw.kind === "fizzle") {
          /* a sputter: a few grey sparks that barely leave the kayak, and a drop */
          const r = 50 * easeOut(Math.min(1, t * 1.6));
          node.burst.style.opacity = (1 - t).toFixed(3);
          node.burst.style.transform = `translate3d(${x0.toFixed(1)}px, ${(peakY + 70 * t * t).toFixed(1)}px, 0)`;
          node.sparks.forEach((spark, n) => {
            const a = (n / node.sparks.length) * Math.PI * 2;
            spark.style.transform = `translate3d(${(Math.cos(a) * r * (0.5 + (n % 3) * 0.25)).toFixed(1)}px, ${(Math.sin(a) * r * 0.6 + 34 * t).toFixed(1)}px, 0) scale(0.5)`;
          });
          node.core.style.opacity = "0";
          continue;
        }
        const r = SKY.RADIUS * fw.size * easeOut(t);
        const fall = 80 * t * t * fw.size;
        node.burst.style.opacity = Math.max(0, 1 - Math.pow(t, 1.6)).toFixed(3);
        node.burst.style.transform = `translate3d(${x0.toFixed(1)}px, ${peakY.toFixed(1)}px, 0)`;
        node.core.style.opacity = Math.max(0, 1 - t * 4).toFixed(3);
        node.core.style.transform = `scale(${(0.5 + 1.8 * fw.size * Math.min(1, t * 6)).toFixed(3)})`;
        node.sparks.forEach((spark, n) => {
          const a = (n / node.sparks.length) * Math.PI * 2 + (n % 2 ? 0.12 : 0);
          const rr = r * (n % 2 ? 0.7 : 1);
          spark.style.transform = `translate3d(${(Math.cos(a) * rr).toFixed(1)}px, ${(Math.sin(a) * rr + fall).toFixed(1)}px, 0) rotate(${(a * 57.2958 + 90).toFixed(1)}deg) scale(${(0.5 + 0.7 * fw.size - 0.45 * t).toFixed(3)})`;
        });
      }
      pool.current.forEach((node, k) => { if (!busy.has(k) && node.root.style.opacity !== "0") node.root.style.opacity = "0"; });
    });
  }, [driver, store, entrants]);
  const setNode = k => el => {
    if (!el) return;
    pool.current[k] = { root:el, head:el.querySelector(".fw-head"), trail:el.querySelector(".fw-trail"), burst:el.querySelector(".fw-burst"),
      core:el.querySelector(".fw-core"), sparks:[...el.querySelectorAll(".fw-spark")], color:null, kind:null };
  };
  return <>
    <div className="fw-skyfill" ref={fill} style={{ opacity:0 }} aria-hidden="true" />
    <div className="fs-blackout" ref={cover} data-on="" aria-hidden="true" />
    <div className="fw-layer" aria-hidden="true">
      {Array.from({ length:POOL }, (_, k) => <div key={k} className="fw" ref={setNode(k)} style={{ opacity:0 }}>
        <i className="fw-trail" /><i className="fw-head" />
        <div className="fw-burst"><b className="fw-core" />{Array.from({ length:SPARKS }, (_, n) => <i key={n} className="fw-spark" />)}</div>
      </div>)}
    </div>
  </>;
}
