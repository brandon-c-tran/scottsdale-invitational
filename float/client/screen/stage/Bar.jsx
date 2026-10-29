/* Last Call's bar, the countdown (float/GROOVE.md "Last Call: the
   countdown"): the bartender behind the counter, waist up, and the count
   big on the bar's board (the chalkboard; the wind-up clock for the slow
   trick), each number said in his bubble; then the trick's gag hides it:
   lights, he pulls the cord and the bar goes dark, only eyes; slow, the
   clock winds down and he taps it; ticks, foam spills over the board.
   Nothing tells the count once hidden. At the reveal the board reads 0.
   The art's bartender and props, placed by their anchors; the frame driver
   moves them on the server clock (transform and opacity only). */
import React, { useEffect, useMemo, useRef } from "react";
import { bartenderSprites, propOf } from "../../art/groove/index.js";
import { useGrooveArt } from "../../art/groove/RiderSprite.jsx";
import { BARTENDER, BOARD, bartenderPose, countWord, countdownAt, verdictShown } from "../model/lastcall.js";
import { bobAt } from "../model/motion.js";
import { reducedMotion } from "./driver.js";

const POSES = ["idle", "slide", "cheer"];
/* the pull cord hangs from the top, right of the bartender */
export const CORD = Object.freeze({ x:660, y:0, h:300, pull:70 });
/* the dark comes this long after the cord's pull, and takes this long */
export const DARK = Object.freeze({ AFTER_MS:260, FADE_MS:180, MAX:0.95 });

/* the board for a trick: the clock for "slow", else the chalkboard; its
   frame on the stage and its face (where the number goes) */
export function boardOf(trick, m = null) {
  const id = trick === "slow" ? "clock" : "chalkboard";
  const prop = m ? propOf(id, m) : null;
  const w = prop?.w || (id === "clock" ? 340 : 560), h = prop?.h || (id === "clock" ? 337 : 352);
  const k = id === "clock" ? 270 / h : BOARD.w / w;
  const dw = w * k, dh = h * k;
  const left = BOARD.x + (BOARD.w - dw) / 2, top = BOARD.y + (BOARD.h - dh) / 2;
  const [fx, fy, fw, fh] = prop?.face || (id === "clock" ? [58, 56, 224, 221] : [73, 84, 415, 192]);
  return { id, prop, k, left, top, w:dw, h:dh, face:{ x:left + (fx + fw / 2) * k, y:top + (fy + fh / 2) * k, w:fw * k, h:fh * k } };
}

/* the dark at ms t from songAt (lights only): 0 to MAX, gone at the reveal */
export function darkAt(countdown, t) {
  if (!countdown || countdown.trick !== "lights" || !Number.isFinite(t) || t >= countdown.revealAt) return 0;
  const k = (t - countdown.hideAt - DARK.AFTER_MS) / DARK.FADE_MS;
  return k <= 0 ? 0 : DARK.MAX * Math.min(1, k);
}

export default function Bar({ store, driver }) {
  const m = useGrooveArt();
  const art = useMemo(() => (m ? bartenderSprites(m) : null), [m]);
  const st = store.state;
  const trick = st.chart?.countdown?.trick || "lights";
  const board = useMemo(() => boardOf(trick, m), [trick, m]);
  const cord = useMemo(() => (m ? propOf("pull-cord", m) : null), [m]);
  const foam = useMemo(() => (m ? propOf("foam", m) : null), [m]);
  const root = useRef(null);
  const body = useRef(null);
  const boardNode = useRef(null);
  const num = useRef(null);
  const hand = useRef(null);
  const say = useRef(null);
  const sayWord = useRef(null);
  const tick = useRef(null);
  const cordNode = useRef(null);
  const foamNode = useRef(null);
  const dark = useRef(null);
  const eyes = useRef(null);
  const box = art?.box || [512, 512];
  const ground = art?.anchor?.ground || [256, 504];
  const face = art?.anchor?.face || art?.anchor?.head || [256, 170];
  const k = BARTENDER.h / box[1];
  const left = BARTENDER.x - ground[0] * k, top = BARTENDER.y - ground[1] * k;
  useEffect(() => {
    const still = reducedMotion();
    let pose = "", shown = null, said = null, ticked = null, darkOn = null;
    return driver.add(now => {
      const chart = st.chart;
      const countdown = chart?.countdown;
      if (!countdown || !Number.isFinite(st.songAt)) return;
      const t = now - st.songAt;
      const cd = countdownAt(countdown, t);
      const verdict = verdictShown({ songAt:st.songAt, countdown, lastCall:st.lastCall, lastCallAt:st.lastCallAt }, now);
      const next = bartenderPose(countdown, t, { revealed:!!verdict });
      if (root.current && next !== pose) { root.current.dataset.pose = next; pose = next; }
      const beat = t / (chart.beatMs || 500);
      const bob = still ? { dy:0, sx:1, sy:1 } : bobAt(beat, { amp:0.6 });
      if (body.current) body.current.style.transform = `translate3d(0, ${bob.dy.toFixed(1)}px, 0) scale(${bob.sx.toFixed(4)}, ${bob.sy.toFixed(4)})`;
      /* the number: shown until hidden; 0 once revealed */
      const revealed = cd.stage === "reveal" || cd.stage === "verdict";
      const text = revealed ? "0" : cd.show !== null ? String(cd.show) : "";
      if (num.current && text !== shown) { num.current.textContent = text; num.current.dataset.n = text; shown = text; }
      /* said: the bubble with the word, for a moment after its count */
      const word = cd.say !== null ? countWord(cd.say) : null;
      if (say.current && word !== said) {
        said = word;
        if (sayWord.current) sayWord.current.textContent = word || "";
        say.current.style.opacity = word ? "1" : "0";
        say.current.dataset.n = word || "";
      }
      if (tick.current && cd.tick !== ticked) { ticked = cd.tick; tick.current.style.opacity = cd.tick !== null ? "1" : "0"; tick.current.dataset.n = cd.tick ?? ""; }
      /* the clock's hand: a step a count, then winding down once hidden */
      if (hand.current) {
        let angle = 36 * (10 - (cd.step?.n ?? 10));
        if (cd.hidden) {
          const since = Math.max(0, t - countdown.hideAt);
          angle = 252 + (still ? 0 : 50 * (1 - Math.exp(-since / 900)));
        }
        if (revealed) angle = 360;
        hand.current.style.transform = `rotate(${angle.toFixed(1)}deg)`;
      }
      /* the board: tapped (slow), shaken once the foam comes (ticks) */
      if (boardNode.current) {
        const since = t - countdown.hideAt;
        const tap = !still && cd.trick === "slow" && since > 500 && since < 1300 ? Math.sin((since - 500) / 800 * Math.PI * 6) * 4 * (1 - (since - 500) / 800) : 0;
        boardNode.current.style.transform = `rotate(${tap.toFixed(2)}deg)`;
      }
      /* lights: the cord's pull, then the dark (only eyes) */
      if (cordNode.current) {
        const since = t - countdown.hideAt;
        const pull = since >= 0 && since < 420 ? Math.sin(Math.PI * since / 420) : 0;
        cordNode.current.style.transform = `translate3d(0, ${(pull * CORD.pull).toFixed(1)}px, 0)`;
      }
      const d = darkAt(countdown, t);
      if (dark.current) {
        const v = d.toFixed(3);
        if (dark.current.style.opacity !== v) dark.current.style.opacity = v;
      }
      if (eyes.current && darkOn !== d > 0.5) { darkOn = d > 0.5; eyes.current.style.opacity = darkOn ? "1" : "0"; }
      /* ticks: the foam spills over the board */
      if (foamNode.current) {
        const g = cd.trick === "ticks" && cd.hidden && !revealed ? (still ? 1 : cd.gagK) : 0;
        foamNode.current.style.opacity = g > 0 ? "1" : "0";
        foamNode.current.style.transform = `translate3d(0, ${(g * 40).toFixed(1)}px, 0) scale(1, ${(0.15 + 0.95 * g).toFixed(3)})`;
      }
    });
  }, [driver, store]); // eslint-disable-line react-hooks/exhaustive-deps
  const foamW = board.w * 1.12;
  const foamH = foam ? foamW * (foam.h / foam.w) : foamW * 0.6;
  return <>
    {trick === "lights" && <div className="lc-cord" ref={cordNode} style={{ left:CORD.x - (cord?.anchor?.[0] ?? 42) * (CORD.h / (cord?.h || 300)), top:CORD.y,
      width:(cord?.w || 83) * (CORD.h / (cord?.h || 300)), height:CORD.h }}>
      {cord?.src ? <img src={cord.src} alt="" draggable={false} /> : <span className="lc-cord-drawn" />}
    </div>}
    <div className="lc-bartender" ref={root} data-pose="idle" style={{ width:box[0] * k, height:box[1] * k, transform:`translate(${left}px, ${top}px)` }}>
      <div className="lc-bartender-body" ref={body} style={{ transformOrigin:`50% ${ground[1] * k}px` }}>
        {art?.poses ? POSES.map(pose => art.poses[pose] && <img key={pose} className={`lc-bt is-${pose}`} src={art.poses[pose]} alt="" draggable={false} />)
          : <span className="lc-bt-drawn" />}
      </div>
      <div className="lc-say" ref={say} style={{ opacity:0, left:face[0] * k + 70, top:face[1] * k - 150 }}><span ref={sayWord} /></div>
    </div>
    <div className={`lc-board is-${board.id}`} ref={boardNode} style={{ left:board.left, top:board.top, width:board.w, height:board.h,
      transformOrigin:board.id === "clock" ? "50% 50%" : "50% 0" }}>
      {board.prop?.src ? <img src={board.prop.src} alt="" draggable={false} /> : <span className={`lc-board-drawn is-${board.id}`} />}
      {board.id === "clock" && <i className="lc-hand" ref={hand} style={{ left:board.face.x - board.left - 5, top:board.face.y - board.top - board.face.h * 0.4,
        height:board.face.h * 0.4, transformOrigin:"50% 100%" }} />}
      <span className={`lc-num is-${board.id}`} ref={num} style={{ left:board.face.x - board.left, top:board.face.y - board.top,
        fontSize:board.id === "clock" ? 120 : 150 }} />
      <span className="lc-tick" ref={tick} style={{ opacity:0 }}>Tick</span>
    </div>
    {trick === "ticks" && <div className="lc-foam" ref={foamNode} style={{ left:board.left + (board.w - foamW) / 2, top:board.top - foamH * 0.35, width:foamW, height:foamH,
      opacity:0, transformOrigin:"50% 0" }}>
      {foam?.src ? <img src={foam.src} alt="" draggable={false} /> : <span className="lc-foam-drawn" />}
    </div>}
    {trick === "lights" && <>
      <div className="lc-dark" ref={dark} style={{ opacity:0 }} />
      <span className="lc-bt-eyes fl-eye" ref={eyes} style={{ opacity:0, transform:`translate3d(${left + face[0] * k}px, ${top + face[1] * k - 10}px, 0) scale(${(k * 1.9).toFixed(3)})` }}>
        <i /><i />
      </span>
    </>}
  </>;
}
