/* Everyone on stage, every phase (float/GROOVE.md "The screen (TV)"): the
   flotilla in its rows on the water, x drifting by score; each rider's move
   when their judged hit lands and the popup over them for POPUP_MS, in a
   slot no other popup takes; in practice every critter acting out the
   host's demo together; the bob on the beat; below the cut line a rider
   rides low and nervous ("Who's ahead"); the cut's grade stamps and each
   out's slapstick exit to the bank; the chug-off's two at centre stage;
   Last Call's line-up at the bar, readouts held until the reveal; the
   crowd on the far bank cheering; the podium's three. One node per
   entrant, rendered when the room changes; the names on a layer of their
   own over every critter and every popup, each under its own tube and
   nudged clear of the others; the frame driver writes every transform
   (stage pixels, transform and opacity only). */
import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import { CHUGOFF, SONG_LEAD_MS, gradeWord } from "../../../shared/chart.js";
import { Critter, PopupLetters, SplashProp, anchorOf, useRiderArt } from "../art.jsx";
import { ANCHOR, BOX, CROWD, NAME_H, POPUP_BOX, crowdLayout, flotillaLayout, nameSlots, nameWidth, podiumLayout, podiumSteps,
  popupSlots, seatOrder } from "../model/flotilla.js";
import { propOf, sceneOf, spriteSize } from "../../art/groove/index.js";
import { useGrooveArt } from "../../art/groove/RiderSprite.jsx";
import { PADDLE, PADDLE_AWAY, actionAt, autoStrokeAt, bobAt, cheerAt, chugAt, follow, paddleAt, popupAt, strokeSide } from "../model/motion.js";
import { actionKind, demoAt, lineShownAt, lineSpot, rankStripOn, sceneFor } from "../model/song.js";
import { narrationOf } from "../soundBridge.js";
import { reducedMotion } from "./driver.js";
import { darkAt } from "./Bar.jsx";
import { cutField, cutShow } from "../model/cut.js";
import { EXIT_MS, exitAt, exitKind } from "../model/exits.js";
import { belowCut, rankNow } from "../model/rank.js";
import { chugLayout, chugoffAt, firstChugoff } from "../model/chugoff.js";
import { COUNTER, barLayout, barPlayersOf, barRanking, closestOf, countdownAt, readoutOf, verdictShown } from "../model/lastcall.js";
import { indexList } from "../model/cupShape.js";
import { inkOn } from "../hud/identity.js";
import { countNumberTone, numberTone } from "../model/tone.js";
import { BADGE_MS } from "../model/store.js";

const BEAT = 500;
/* Last Call's readouts: the popup lettered this much bigger */
const BAR_POP = 52 / 40;
const INTRO_MS = 2600;
const POP_IN_MS = 520;
/* the winner on the podium jumps every this many beats */
const PODIUM_JUMP_BEATS = 2;
/* below the cut line: this much lower (stage px at scale 1), the tube this much flatter */
export const SINK = Object.freeze({ DROP:34, FLAT:0.07, POP_MS:460 });
/* the rank strip and the narration box: popups keep out of them */
export const STRIP_RECT = Object.freeze({ x0:400, x1:1900, y0:0, y1:214 });
export const LINE_RECTS = Object.freeze({ top:{ x0:520, x1:1400, y0:36, y1:160 }, low:{ x0:520, x1:1400, y0:214, y1:320 } });
/* the cut's award cards, a row under the strip */
export const CARDS_RECT = Object.freeze({ x0:380, x1:1880, y0:214, y1:420 });
const ease = t => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
/* the bar's 13 names on the counter's front, in two rows left to right
   (shoulder to shoulder, a tag is wider than a rider): { [i]: { dx, dy } } */
export const BAR_NAMES = Object.freeze({ y:COUNTER.top + 62, step:48 });
export function barNames(spots) {
  const out = {};
  spots.slice().sort((a, b) => a.x - b.x).forEach((n, k) => {
    out[n.i] = { dx:0, dy:BAR_NAMES.y + (spots.length > 7 ? (k % 2) * BAR_NAMES.step : 0) - n.y };
  });
  return out;
}

/* Last Call's line-up once revealed: the room's ranking (`lastCall.order`,
   closest first, up to about 200 ms after revealAt), else, for a room that
   names who drinks without one, the screen's own; until either, the Cup's
   order (nothing moves before the room knows) */
export function barLineUp(players, lastCall, readout) {
  const order = Array.isArray(lastCall?.order) ? lastCall.order.filter(i => players.includes(i))
    : Array.isArray(lastCall?.worst) ? barRanking(players, readout).map(row => row.i) : null;
  return order ? [...order, ...players.filter(i => !order.includes(i))] : players;
}

/* the roll call: each name tag pops in, in seat order (front row first,
   left to right), once the flotilla has floated in (the intro) and in each
   song's lead under the round card */
export const ROLL = Object.freeze({ GAP_MS:170, POP_MS:360, INTRO_AT:2900, SONG_AT:450 });
/* a name's pop at `now`: null (no roll call running), else 0 (not yet
   called) to 1, overshooting a little */
export function rollCallAt({ phase, phaseStart, songAt, seat, now }) {
  if (seat < 0 || !Number.isFinite(now)) return null;
  const t0 = phase === "intro" && Number.isFinite(phaseStart) ? phaseStart + ROLL.INTRO_AT
    : phase === "song" && Number.isFinite(songAt) ? songAt - SONG_LEAD_MS + ROLL.SONG_AT : null;
  if (t0 === null) return null;
  const t = (now - t0 - seat * ROLL.GAP_MS) / ROLL.POP_MS;
  if (t >= 1) return null;
  if (t <= 0) return 0;
  return t < 0.6 ? 1.18 * ease(t / 0.6) : 1.18 - 0.18 * ((t - 0.6) / 0.4);
}

/* where each rider is drawn this frame (stage px: the waterline's middle
   and the drawn scale), for the layers that follow them (the fireworks) */
export const castSpots = new WeakMap();

/* the cast's plan for a room message: who is in the water (and how they are
   laid out), who stands on the bank, who leaves for it and how, the podium */
export function castPlan({ phase, room, state, entrants }) {
  const all = entrants.map((e, i) => (e ? i : null)).filter(i => i !== null);
  const outs = indexList(room?.out);
  const scene = sceneFor(phase, state?.chart);
  const plan = { water:[], kind:"song", drift:true, bank:[], exits:[], podium:[], reform:null, nextWater:null, names:true, show:null, chug:null,
    exitKind:exitKind(scene), scene };
  if (phase === "lobby") return { ...plan, water:all, kind:"lobby", drift:false };
  if (phase === "intro") return { ...plan, water:seatOrder(indexList(room?.field).length ? indexList(room.field) : all), drift:false };
  if (phase === "song") {
    const field = state?.songField?.length ? state.songField : indexList(room?.field);
    return { ...plan, water:seatOrder(field), bank:outs.filter(i => !field.includes(i)) };
  }
  if (phase === "cut") {
    const field = cutField(room, state?.songField);
    const show = cutShow(room, state?.songField);
    const going = show.outs.map(o => o.i);
    const earlier = outs.filter(i => !field.includes(i));
    const lastOut = show.outs.length ? show.outs[show.outs.length - 1].at : null;
    /* the rows re-form once, after the last out has left, keeping the seat order */
    const survivors = seatOrder(field.filter(i => !going.includes(i)));
    return { ...plan, water:seatOrder(field), bank:earlier, show,
      exits:show.outs.map(o => ({ i:o.i, at:o.at, ms:EXIT_MS })),
      reform:lastOut !== null ? lastOut + EXIT_MS + 300 : null, nextWater:survivors, kind:survivors.length <= 3 ? "final" : "song" };
  }
  if (phase === "chugoff") {
    const c = room?.chugoff || state?.chugoff;
    const pair = [c?.a, c?.b].filter(Number.isInteger);
    return { ...plan, water:pair, kind:"chug", drift:false, bank:all.filter(i => !pair.includes(i)), chug:{ a:c?.a, b:c?.b } };
  }
  if (phase === "lastcall") return { ...plan, water:barPlayersOf(room), kind:"bar", drift:false };
  if (phase === "podium" || phase === "feedback") {
    const podium = indexList(room?.podium);
    return { ...plan, podium, bank:[], names:false, podiumAt:Number.isFinite(room?.startAt) ? room.startAt : state?.phaseStart };
  }
  return plan;
}

/* the crowd stands on the far shore: the painted scene's own waterline
   (the night's is lower than the day's), else the drawn scenes' */
function crowdY(scene) {
  try {
    const sc = scene ? sceneOf(scene) : null;
    if (sc && !sc.placeholder && Number.isFinite(sc.water) && sc.water > 0.3 && sc.water < 0.7) return Math.round(sc.water * 1080) - 6;
  } catch {}
  return CROWD.y;
}

/* the size the art paints a rider at: the bucket that covers the biggest it
   is drawn on this stage (the chug-off's two) */
const dpr = () => { try { return window.devicePixelRatio || 1; } catch { return 1; } };
const RIDER_PAINT = () => spriteSize(BOX * 0.95 * 1.45, dpr());

/* one rider's nodes: the placed box (scaled), the body that moves about
   the waterline, a splash at the paddling hand */
const RiderNode = memo(function RiderNode({ entrant, i, refs }) {
  const art = useRiderArt(entrant, { size:RIDER_PAINT() });
  const ripple = art?.poses ? propOf("ripple") : null;
  const splash = art?.poses ? propOf("splash") : null;
  const anchor = anchorOf(art);
  const set = key => node => { const r = refs.current.get(i) || {}; r[key] = node; r.anchor = anchor; refs.current.set(i, r); };
  useEffect(() => { const r = refs.current.get(i); if (r) r.anchor = anchor; }, [anchor, i, refs]);
  const [wx, wy] = anchor.water;
  const hand = anchor.hand || anchor.water;
  return <div className="fl-rider" ref={set("rider")} data-pose="idle" style={{ "--c":entrant.color || "#7fb8ff" }}>
    {ripple?.src
      ? <img className="fl-ripple-art" src={ripple.src} alt="" draggable={false} style={rippleBox(ripple, wx, wy)} />
      : <div className="fl-ripple" style={{ left:wx - 228, top:wy - 8 }} />}
    <div className="fl-body" ref={set("body")} style={{ transformOrigin:`${wx}px ${wy}px` }}>
      <Critter entrant={entrant} art={art} />
      {/* the paddle is in the sprites (the kayak's poses); a splash at each side for its strokes */}
      {[-1, 1].map(side => <div key={side} className="fl-psplash" ref={set(side < 0 ? "splashL" : "splashR")} style={{ opacity:0 }}>
        {splash?.src ? <img src={splash.src} alt="" draggable={false} /> : <SplashProp />}
      </div>)}
    </div>
    {!art?.poses && <div className="fl-splash" ref={set("splash")} style={{ left:hand[0] + 20, top:wy - 110 }}><SplashProp /></div>}
  </div>;
});

/* the splash at a stroke's blade: its box (box px), and how far out from
   the waterline's middle the blade dips (the kayak's side) */
const PSPLASH = Object.freeze({ w:170, h:120, reach:150 });

/* the art's ripple centred at the waterline, about 1.35 x the hull */
/* (kayaks: the waterline is the hull's bottom edge and the idle hull 270 box
   px wide, so the ripple is a touch wider and sits a little up the hull) */
export const RIPPLE = Object.freeze({ HULL:270, K:1.35, LIFT:14 });
function rippleBox(prop, wx, wy) {
  const w = RIPPLE.HULL * RIPPLE.K, h = w * ((prop.h || 104) / (prop.w || 320));
  const ax = ((prop.anchor?.[0] ?? prop.w / 2) / (prop.w || 1)) * w, ay = ((prop.anchor?.[1] ?? prop.h / 2) / (prop.h || 1)) * h;
  return { left:wx - ax, top:wy - RIPPLE.LIFT - ay, width:w, height:h };
}

/* the exits' props: one set a rider, placed by the frame driver */
export const EXIT_PROPS = Object.freeze(["pelican", "pelican-carry", "rock", "bonk", "dizzy", "bubbles", "whirl"]);
/* their sizes without the art (the art's files, the same shapes) */
const DRAWN_SIZE = Object.freeze({ pelican:[360, 248], "pelican-carry":[325, 340], rock:[280, 173], bonk:[240, 217], dizzy:[220, 150], bubbles:[102, 180],
  whirl:[440, 193] });
function ExitFx({ i, fxRefs }) {
  const m = useGrooveArt();
  const props = useMemo(() => EXIT_PROPS.map(id => {
    const prop = m ? propOf(id, m) : null;
    const [w, h] = DRAWN_SIZE[id];
    return [id, prop?.src ? prop : { w, h, anchor:id === "pelican-carry" ? [116, 336] : [w / 2, h / 2], drawn:true }];
  }), [m]);
  const entry = () => {
    let r = fxRefs.current.get(i);
    if (!r) fxRefs.current.set(i, r = { root:null, nodes:{}, props:{} });
    r.props = Object.fromEntries(props);
    return r;
  };
  return <div className="fl-fx" ref={node => { if (node) entry().root = node; else fxRefs.current.delete(i); }}>
    {props.map(([id, prop]) => <span key={id} className={`fl-fx-prop is-${id}`} style={{ opacity:0, width:prop.w, height:prop.h }}
      ref={node => { if (node) entry().nodes[id] = node; }}>
      {prop.drawn ? <DrawnFx id={id} /> : <img src={prop.src} alt="" draggable={false} />}
    </span>)}
  </div>;
}
/* without the art: the gags drawn plainly (the critter's move still reads) */
function DrawnFx({ id }) {
  const [w, h] = DRAWN_SIZE[id] || [200, 200];
  const ink = "#1d1a24";
  if (id === "rock") return <svg width={w} height={h} viewBox="0 0 280 173"><path d="M20 160 60 50 130 18 210 40 262 160Z" fill="#9b8f86" stroke={ink} strokeWidth="9" strokeLinejoin="round" /></svg>;
  if (id === "bonk") return <svg width={w} height={h} viewBox="0 0 240 217"><path d="M120 10 140 80 220 60 160 110 225 170 140 140 120 210 100 140 15 170 80 110 20 60 100 80Z" fill="#ffe14d" stroke={ink} strokeWidth="8" strokeLinejoin="round" /></svg>;
  if (id === "dizzy") return <svg width={w} height={h} viewBox="0 0 220 150">{[[40, 70], [110, 40], [180, 70]].map(([x, y], k) => <path key={k} d={`M${x} ${y - 22}l7 15 16 2-12 11 3 16-14-8-14 8 3-16-12-11 16-2Z`} fill="#ffe14d" stroke={ink} strokeWidth="5" strokeLinejoin="round" />)}</svg>;
  if (id === "bubbles") return <svg width={w} height={h} viewBox="0 0 102 180">{[[50, 150, 18], [30, 95, 13], [66, 50, 10], [44, 18, 7]].map(([x, y, r], k) => <circle key={k} cx={x} cy={y} r={r} fill="rgba(255,255,255,0.7)" stroke={ink} strokeWidth="5" />)}</svg>;
  if (id === "whirl") return <svg width={w} height={h} viewBox="0 0 440 193"><ellipse cx="220" cy="97" rx="200" ry="80" fill="none" stroke="#fffdf8" strokeWidth="14" strokeDasharray="60 30" /><ellipse cx="220" cy="97" rx="110" ry="44" fill="none" stroke="#fffdf8" strokeWidth="12" strokeDasharray="40 24" /></svg>;
  /* the pelican: a white bird with a big orange beak */
  return <svg width={w} height={h} viewBox="0 0 360 248"><path d="M60 140c0-60 60-100 120-90 50 8 80 40 80 80 0 50-50 80-110 80S60 190 60 140Z" fill="#fffdf8" stroke={ink} strokeWidth="9" />
    <path d="M250 110 350 130 250 160Z" fill="#ffb347" stroke={ink} strokeWidth="9" strokeLinejoin="round" /><circle cx="230" cy="100" r="9" fill={ink} />
    <path d="M90 120c-40-40-80-40-80-10 30 0 50 20 80 30Z" fill="#e8e2d8" stroke={ink} strokeWidth="8" strokeLinejoin="round" /></svg>;
}

/* the popup over a rider: re-rendered only when what it says changes (the
   latest hit; the cut's grade; Last Call's readout, the closest marked) */
function RiderPop({ i, setters }) {
  const [say, setSay] = useState(null);
  useEffect(() => { setters.current.set(i, setSay); return () => setters.current.delete(i); }, [i, setters]);
  if (!say) return null;
  if (say.grade) return <span className={`fl-pop-in fl-grade is-${say.grade}`} key={`grade:${say.grade}`}><span>{gradeWord(say.grade)}</span></span>;
  const tone = say.big ? countNumberTone(say.q, say.d) : numberTone(say.q, say.d);
  return <span className={`fl-pop-in${say.closest ? " is-closest" : ""}${say.drinks ? " is-drinks" : ""}${say.streak ? " is-streak" : ""}`} data-tone={tone}
    key={`${say.c}:${say.at}:${say.closest ? 1 : 0}:${say.drinks ? 1 : 0}:${say.streak || 0}`}>
    <PopupLetters q={say.q} d={say.d} size={say.big ? 40 * BAR_POP : 40} />
    {say.streak && <span className="fl-pop-streak" key={`streak:${say.streak}`}>{say.streak} in a row</span>}
    {say.closest && <span className="fl-pop-tag is-closest">Closest</span>}
    {say.drinks && <span className="fl-pop-tag is-drinks">Drinks</span>}
  </span>;
}

/* the head's top over the waterline at a scale (stage px) */
const headOver = (anchor, scale) => (anchor.water[1] - (anchor.top || anchor.head)[1]) * scale * (anchor.fill || 1);
/* the name's middle under the waterline (stage px at a drawn scale) */
const nameUnder = (anchor, sc) => ((anchor.name ? anchor.name[1] - anchor.water[1] : 52) * sc) + NAME_H * 0.15;
/* a critter's drawn height (stage px), for the exits */
const critterHeight = (anchor, sc) => (anchor.water[1] - (anchor.top || anchor.head)[1]) * sc;

/* place one prop: its anchor at (x, y) stage px, drawn k times its file size */
function placeProp(node, prop, { x, y, k, rot = 0, opacity = 1, sx = 1, anchor = null }) {
  if (!node || !prop) return;
  const [ax, ay] = anchor || prop.anchor || [prop.w / 2, prop.h / 2];
  node.style.transformOrigin = `${ax}px ${ay}px`;
  node.style.transform = `translate3d(${(x - ax).toFixed(1)}px, ${(y - ay).toFixed(1)}px, 0) rotate(${rot.toFixed(1)}deg) scale(${(k * sx).toFixed(4)}, ${k.toFixed(4)})`;
  node.style.opacity = Math.max(0, Math.min(1, opacity)).toFixed(3);
}
const hideProp = node => { if (node && node.style.opacity !== "0") node.style.opacity = "0"; };

export default function Cast({ store, driver, entrants, phase, room, version }) {
  const refs = useRef(new Map());
  const popRefs = useRef(new Map());
  const nameRefs = useRef(new Map());
  const nameWidths = useRef(new Map());
  const popSetters = useRef(new Map());
  const fxRefs = useRef(new Map());
  const eyeRefs = useRef(new Map());
  const motion = useRef(new Map());
  const firstSeen = useRef(new Map());
  const mounted = useRef(false);
  const plan = useMemo(() => castPlan({ phase, room, state:store.state, entrants }), [phase, room, entrants, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const planRef = useRef(plan);
  planRef.current = plan;
  const roomRef = useRef(room);
  roomRef.current = room;

  /* the lobby: a rider who joins after the screen opened pops in */
  useEffect(() => {
    if (!entrants.some(Boolean)) return;
    const now = store.serverNow();
    entrants.forEach((e, i) => { if (e && !firstSeen.current.has(i)) firstSeen.current.set(i, mounted.current ? now : -Infinity); });
    mounted.current = true;
  }, [entrants, store]);

  useEffect(() => {
    let layoutAt = -Infinity, water = {}, next = {}, bank = {}, podium = {}, slots = {}, names = {};
    const st = store.state;
    const still = reducedMotion();
    const anchorFor = i => refs.current.get(i)?.anchor || ANCHOR;
    const widthOf = i => {
      if (!nameWidths.current.has(i)) {
        const node = nameRefs.current.get(i);
        const w = node?.offsetWidth;
        if (w) nameWidths.current.set(i, w + 6);
        else return nameWidth(entrants[i]?.name);
      }
      return nameWidths.current.get(i);
    };
    let spots = castSpots.get(store);
    if (!spots) castSpots.set(store, spots = new Map());
    const frame = (now, dt) => {
      const p = planRef.current;
      const songAt = st.songAt;
      const chart = st.chart;
      const bar = phase === "lastcall";
      const cut = phase === "cut";
      const inSong = phase === "song" && Number.isFinite(songAt) && !!chart;
      const beat = (inSong || bar) && Number.isFinite(songAt) ? (now - songAt) / (chart?.beatMs || BEAT) : (now - (st.phaseStart || 0)) / BEAT;
      /* who's ahead: the strip's order (sinking below the line) */
      const rank = inSong && rankStripOn(chart, beat) ? rankNow(store, now) : null;
      const demo = inSong ? demoAt(chart, beat) : null;
      const line = inSong ? lineShownAt(narrationOf(chart), beat) : null;
      /* Last Call: the countdown, the reveal, who drinks */
      const cd = bar && chart?.countdown && Number.isFinite(songAt) ? countdownAt(chart.countdown, now - songAt) : null;
      const revealed = !!cd && (cd.stage === "reveal" || cd.stage === "verdict");
      const dark = !!cd && !revealed && darkAt(chart.countdown, now - songAt) > 0.5;
      const drinkers = bar ? verdictShown({ songAt, countdown:chart?.countdown, lastCall:st.lastCall, lastCallAt:st.lastCallAt }, now) : null;
      const closest = drinkers ? closestOf(st.lastCall?.totals || []) : [];
      /* a rider's Last Call readout once revealed: their judged tap, else the room's total, else a miss */
      const barReadout = i => {
        const judged = st.judged.get(i)?.get(0) || null;
        if (judged) return { q:judged.q, d:judged.d, at:judged.at };
        const lcRow = st.lastCall?.totals?.find(row => row.i === i);
        return lcRow ? { ...readoutOf(lcRow), at:songAt + chart.countdown.revealAt } : null;
      };
      /* the chug-off */
      const chug = phase === "chugoff" && p.chug ? chugoffAt(st.chugoff || roomRef.current?.chugoff || p.chug, now, { seen:st.done, startAt:st.phaseStart, decidedAt:st.chugoffDecidedAt, first:firstChugoff(roomRef.current) }) : null;
      const exits = chug && chug.loser !== null && Number.isFinite(chug.exitAt) ? [{ i:chug.loser, at:chug.exitAt, ms:CHUGOFF.EXIT_MS }] : p.exits;
      const reformed = p.reform !== null && now >= p.reform;
      /* the cut's grades stand from their stamp until the line */
      /* (v4: the grades stand alone, then make way for the award cards) */
      const cardsFrom = p.show?.awards?.length ? p.show.awards[0].at - 200 : Infinity;
      const gradesOn = cut && !!p.show && now >= p.show.gradesAt && now < Math.min(cardsFrom, p.show.awardsEnd);
      const cardsOn = cut && !!p.show?.awards?.length && now >= p.show.awards[0].at - 200 && now < p.show.awardsEnd;
      /* the layouts and the popups' slots: every 120 ms (the scores move
         them; the motion is smoothed) */
      if (now - layoutAt > 120 || now < layoutAt || dt === 0) {
        layoutAt = now;
        const lives = new Map(p.water.map(i => [i, phase === "lobby" ? null : store.liveOf(i)]));
        /* the bar: the line-up in the Cup's order until the reveal (never
           a hint of the count), then ranked closest (left) to farthest */
        water = p.kind === "bar" ? barLayout(revealed ? barLineUp(p.water, st.lastCall, barReadout) : p.water)
          : p.kind === "chug" ? chugLayout(p.chug?.a, p.chug?.b)
            : flotillaLayout(p.water, lives, { kind:p.kind === "lobby" ? "lobby" : p.water.length <= 3 ? "final" : "song",
              drift:p.drift && phase !== "intro" });
        next = p.nextWater ? flotillaLayout(p.nextWater, new Map(), { kind:p.kind, drift:false }) : {};
        bank = crowdLayout([...p.bank, ...exits.map(h => h.i).filter(i => !p.bank.includes(i))], { y:crowdY(p.scene) });
        podium = podiumLayout(p.podium, podiumSteps(propOf("podium")));
        const shown = reformed ? next : water;
        const faceOf = ([key, spot]) => {
          const i = Number(key);
          const a = anchorFor(i);
          /* the face: the head's own x (a kayak's critter sits off its hull's middle) */
          const hx = ((a.head || a.water)[0] - a.water[0]) * spot.scale * (a.fill || 1);
          return { i, x:spot.x + hx, y:spot.y, scale:spot.scale, top:spot.y - headOver(a, spot.scale) };
        };
        const faces = Object.entries(shown).map(faceOf);
        /* the names right under their tubes: the popups keep off them */
        const nameSpots = p.names ? Object.entries(shown).map(([key, spot]) => {
          const i = Number(key);
          const anchor = anchorFor(i);
          return { i, x:spot.x, y:spot.y + nameUnder(anchor, spot.scale * (anchor.fill || 1)), w:widthOf(i), h:NAME_H, scale:spot.scale };
        }) : [];
        const nameRects = nameSpots.map(n => ({ i:n.i, x0:n.x - n.w / 2, x1:n.x + n.w / 2, y0:n.y - n.h / 2, y1:n.y + n.h / 2 }));
        /* Last Call's readouts letter bigger; popups keep out of the strip, the narration and the cards */
        const box = bar ? { w:POPUP_BOX.w * BAR_POP, h:POPUP_BOX.h * BAR_POP } : POPUP_BOX;
        const avoid = [];
        if (rank || cut) avoid.push(STRIP_RECT);
        if (line) avoid.push(LINE_RECTS[lineSpot(chart, line)] || LINE_RECTS.top);
        if (cardsOn) avoid.push(CARDS_RECT);
        /* the host and the call's bubble on the left shore */
        if (inSong) { const shore = crowdY(p.scene); avoid.push({ x0:60, x1:500, y0:shore - 330, y1:shore + 10 }); }
        slots = inSong || bar || cut ? popupSlots(faces, { box, others:Object.entries(bank).map(faceOf), names:nameRects, stagger:bar, tierExtra:bar ? 64 : 0, avoid }) : {};
        /* then each name nudged clear of the others, the faces and the popups */
        const popups = Object.values(slots).map(slot => {
          const w = box.w * slot.size, h = box.h * slot.size;
          return { x0:slot.x - w / 2, x1:slot.x + w / 2, y0:slot.y - h, y1:slot.y };
        });
        names = !p.names ? {} : p.kind === "bar" ? barNames(nameSpots) : nameSlots(nameSpots, { faces, popups });
      }
      entrants.forEach((e, i) => {
        const r = refs.current.get(i);
        if (!e || !r?.rider) return;
        let m = motion.current.get(i);
        if (!m) motion.current.set(i, m = { x:null, y:null, s:null, pose:"", z:null, shown:null, popKey:null, nameOn:null, nx:null, ny:null, px:null, py:null,
          sink:0, sunk:false, popAt:-Infinity, fxOn:false, eyesOn:null });
        let spot = null, where = "hidden", exitT = 0, from = null;
        const exit = exits.find(h => h.i === i);
        if (podium[i]) { spot = podium[i]; where = "podium"; }
        else if (exit && now >= exit.at && bank[i]) {
          exitT = still ? 1 : Math.min(1, (now - exit.at) / exit.ms);
          spot = bank[i]; from = water[i] || spot; where = exitT < 1 ? "exit" : "bank";
        } else if (water[i]) {
          spot = reformed && next[i] ? next[i] : water[i];
          where = "water";
        } else if (bank[i]) { spot = bank[i]; where = "bank"; }
        const fx = fxRefs.current.get(i);
        if (!spot) {
          spots.delete(i);
          if (m.shown !== "0") { r.rider.style.opacity = "0"; m.shown = "0"; }
          const popNode = popRefs.current.get(i);
          if (popNode && popNode.style.opacity !== "0") popNode.style.opacity = "0";
          const nameNode = nameRefs.current.get(i);
          if (nameNode && m.nameOn !== false) { nameNode.style.opacity = "0"; m.nameOn = false; }
          if (fx && m.fxOn) { Object.values(fx.nodes).forEach(hideProp); m.fxOn = false; }
          const eyes = eyeRefs.current.get(i);
          if (eyes && m.eyesOn !== false) { eyes.style.opacity = "0"; m.eyesOn = false; }
          return;
        }
        const anchor = r.anchor || ANCHOR;
        const fill = anchor.fill || 1;
        /* place: follow the target (an exit is its own move) */
        let x = spot.x, y = spot.y, s = spot.scale, exitMove = null, opacity = 1;
        if (where === "exit" && from) {
          exitMove = exitAt(exit.kind || p.exitKind, from, spot, exitT, { height:critterHeight(anchor, from.scale * fill) });
          x = exitMove.x; y = exitMove.y; s = exitMove.scale; opacity = exitMove.opacity;
          m.x = x; m.y = y; m.s = s;
        } else {
          const tau = where === "water" ? 480 : 300;
          m.x = follow(m.x, x, dt, tau); m.y = follow(m.y, y, dt, tau); m.s = follow(m.s, s, dt, tau);
          x = m.x; y = m.y; s = m.s;
        }
        /* below the cut line: lower, the tube flatter, nervous; back above, a pop */
        const sunk = !!rank && where === "water" && belowCut(rank.order, rank.through, i);
        if (m.sunk && !sunk && rank) m.popAt = now;
        m.sunk = sunk;
        m.sink = !inSong ? 0 : still ? (sunk ? 1 : 0) : follow(m.sink, sunk ? 1 : 0, dt, 240);
        y += m.sink * SINK.DROP * s;
        /* the intro: the flotilla floats in from upstream, front row first */
        let enter = 0;
        if (phase === "intro" && !still) {
          const k = p.water.indexOf(i);
          const t = (now - (st.phaseStart || now) - 300 - k * 110) / INTRO_MS;
          enter = -(1 - ease(t)) * 1600;
        }
        /* the lobby: a newcomer pops up out of the water */
        let pop = 1;
        const seen = firstSeen.current.get(i);
        if (phase === "lobby" && Number.isFinite(seen) && !still) {
          const t = (now - seen) / POP_IN_MS;
          pop = t >= 1 ? 1 : Math.max(0.01, t < 0.6 ? ease(t / 0.6) * 1.12 : 1.12 - 0.12 * ((t - 0.6) / 0.4));
        }
        /* the move: a hit's action, the host's demo, the chug, a cheer, else the bob */
        const last = where === "water" && inSong ? st.last.get(i) : null;
        let act = null, pose = null, stroke = null;
        if (where === "water" && inSong) {
          act = actionAt(last, now);
          stroke = last;
          /* the demo: every critter acts out the host's answer together */
          const demoHit = demo ? songAt + demo.beat * chart.beatMs : null;
          if (demo && (!last || last.at < demoHit)) {
            const shown = { c:demo.id, q:"nice", at:demoHit, kind:actionKind(chart, demo) };
            const move = actionAt(shown, now);
            if (move) { act = move; stroke = shown; }
          }
          /* auto-rowing: nothing of their own playing, not sinking, the clock's stroke */
          if (!act && m.sink <= 0.5 && !still) {
            const auto = autoStrokeAt(chart, beat);
            if (auto) {
              stroke = { c:null, kind:"paddle", q:"ok", at:songAt + auto.beat * (chart.beatMs || BEAT), side:auto.side, auto:true };
              act = actionAt(stroke, now);
            }
          }
        } else if (where === "water" && chug) {
          const mine = chug.done[i];
          const doneAt = Number.isFinite(mine) && Number.isFinite(chug.goAt) ? chug.goAt + mine : null;
          if (chug.stage === "call") pose = "nice";
          else if (chug.stage === "count") pose = "chug";
          else if (doneAt !== null && now >= doneAt && (chug.winner === null || chug.winner === i)) {
            act = cheerAt(doneAt + Math.floor((now - doneAt) / (BEAT * 2)) * BEAT * 2, now);
            pose = "cheer";
          } else if (i === chug.loser && (chug.stage === "won" || chug.stage === "exit")) pose = "out";
          else if (i === chug.winner && chug.stage !== "chug") pose = "cheer";
          else act = chugAt(beat);
        } else if (where === "water" && bar && drinkers) {
          if (drinkers.includes(i)) act = chugAt(beat);
          else if (closest.includes(i)) {
            const since = Math.max(0, now - (songAt + chart.countdown.verdictAt));
            act = cheerAt(now - (since % (BEAT * 2)), now);
          }
        } else if (where === "bank") act = cheerAt(st.cheers.get(i), now);
        else if (where === "podium" && spot.place === 1 && Number.isFinite(p.podiumAt)) {
          /* the winner jumps on every other beat */
          const since = now - p.podiumAt;
          if (since > 2700 || phase === "feedback") {
            const start = phase === "feedback" ? p.podiumAt : p.podiumAt + 2700;
            act = cheerAt(start + Math.floor((now - start) / (BEAT * PODIUM_JUMP_BEATS)) * BEAT * PODIUM_JUMP_BEATS, now);
          }
        }
        /* Last Call's readout: held until the reveal (or a tap's time gives
           the count away), then every rider's at once; a miss as it lands */
        let readout = null;
        if (bar && revealed && where === "water") readout = barReadout(i);
        pose = act?.pose || pose || "idle";
        if (!act && pose === "idle") {
          if (readout) pose = readout.q === "perfect" || readout.q === "nice" || readout.q === "ok" ? "nice" : "miss";
          else if (where === "podium") pose = spot.place === 1 ? "cheer" : "nice";
          else if (phase === "lobby" && e.ready) pose = "nice";
          else if (where === "water" && m.sink > 0.5) pose = "out";
          else if (where === "water" && cut && p.show) {
            const out = p.show.outs.find(o => o.i === i);
            pose = out && now >= out.at - 600 ? "out" : "idle";
          }
        }
        /* the paddle (item 10, kayaks): a stroke dips the blade on the
           rider's left (`stroke`) or right (`stroke-r`), alternating along
           the chart's strokes, with a splash at that side; a miss slaps flat */
        const paddleOn = where === "water" && !bar && !PADDLE_AWAY.has(pose);
        const pad = paddleOn && inSong && !still ? paddleAt(stroke, now, { side:stroke?.side ?? strokeSide(chart, stroke?.c) })
          : { rot:PADDLE.REST, dx:0, dy:0, side:0, splash:0, flat:0 };
        /* `stroke` dips on the rider's left (the screen's right: they face us), `stroke-r` on their right */
        if (act?.kind === "paddle" && pose === "stroke") pose = pad.side > 0 ? "stroke-r" : "stroke";
        /* a critter without its own stroke-r (a tube, until its kayak) strokes on the one side its sprite shows */
        const ownRight = !!anchor.blades?.["stroke-r"];
        const splashSide = pad.side ? (ownRight ? -pad.side : 1) : 0;
        const blade = pad.side ? anchor.blades?.[pad.side > 0 ? "stroke-r" : "stroke"] : null;
        if (exitMove) {
          pose = exitMove.pose;
          act = { pose, dx:0, dy:exitMove.lift / Math.max(0.01, s * fill), rot:exitMove.rot, sx:exitMove.sx, sy:exitMove.sy };
        }
        /* the bob: nervous below the line (quicker, smaller, a shiver) */
        let bob = where === "exit" || still ? { dy:0, sx:1, sy:1 } : bobAt(beat, { amp:where === "bank" ? 0.6 : 1 });
        let shiver = 0;
        if (m.sink > 0.01) {
          const nervous = still ? { dy:0 } : bobAt(beat * 2, { amp:0.55 });
          bob = { dy:bob.dy * (1 - m.sink) + nervous.dy * m.sink, sx:bob.sx, sy:bob.sy * (1 - SINK.FLAT * m.sink) };
          shiver = still ? 0 : Math.sin(now / 47) * 2.4 * m.sink;
        }
        /* back above the line: a pop up out of the water */
        const popAge = now - m.popAt;
        const popLift = !still && popAge >= 0 && popAge < SINK.POP_MS ? -36 * Math.sin(Math.PI * (popAge / SINK.POP_MS)) : 0;
        if (still && act) act = { ...act, dx:0, dy:0, rot:0, sx:1, sy:1 };
        const ax = anchor.water[0], ay = anchor.water[1];
        const sc = s * pop * fill;
        r.rider.style.transform = `translate3d(${(x + enter - ax * sc).toFixed(1)}px, ${(y - ay * sc).toFixed(1)}px, 0) scale(${sc.toFixed(4)})`;
        spots.set(i, { x:x + enter, y, sc, where });
        const dx = (act?.dx || 0) + shiver, dy = (act?.dy || 0) + bob.dy + popLift;
        /* a stroke leans the body into its side */
        const rot = (act?.rot || 0) + (pad.side ? pad.side * 3 * (pad.dy / PADDLE.DIP) : 0), sx = (act?.sx ?? 1) * bob.sx, sy = (act?.sy ?? 1) * bob.sy;
        /* the splash at the stroke's side (both on a slap), at the water */
        for (const [key, side] of [["splashL", -1], ["splashR", 1]]) {
          const node = r[key];
          if (!node) continue;
          const k = Math.max(side === splashSide ? pad.splash : 0, pad.flat);
          if (k <= 0.01) { if (node.style.opacity !== "0") node.style.opacity = "0"; continue; }
          const tx = side === splashSide && blade ? blade[0] : anchor.water[0] + side * PSPLASH.reach;
          const ty = side === splashSide && blade ? Math.max(blade[1], anchor.water[1] - 20) : anchor.water[1] - 6;
          node.style.opacity = Math.min(1, k * 1.4).toFixed(3);
          node.style.transform = `translate3d(${(tx - PSPLASH.w / 2).toFixed(1)}px, ${(ty - PSPLASH.h * 0.85).toFixed(1)}px, 0) scale(${(side * (0.55 + 0.55 * k)).toFixed(3)}, ${(0.55 + 0.55 * k).toFixed(3)})`;
        }
        if (r.body) r.body.style.transform = `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0) rotate(${rot.toFixed(2)}deg) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
        if (r.splash) r.splash.style.opacity = String(Math.max(0, Math.min(1, act?.kind === "paddle" ? 0 : act?.splash || 0)).toFixed(2));
        if (m.pose !== pose) { r.rider.dataset.pose = pose; m.pose = pose; }
        const z = Math.round(where === "bank" ? y - 600 : where === "exit" ? 1900 : y);
        if (m.z !== z) { r.rider.style.zIndex = String(z + 1000); m.z = z; }
        const op = opacity >= 0.999 ? "1" : Math.max(0, opacity).toFixed(3);
        if (m.shown !== op) { r.rider.style.opacity = op; m.shown = op; }
        if (r.rider.dataset.where !== where) r.rider.dataset.where = where;
        if (r.rider.dataset.sink !== (m.sink > 0.5 ? "1" : "")) r.rider.dataset.sink = m.sink > 0.5 ? "1" : "";

        /* the exit's gag: the pelican, the rock and its bonk, the stars, the bubbles, the whirl */
        if (fx) {
          if (exitMove) {
            const k = (from?.scale || s) * fill;
            const pel = exitMove.pelican;
            const carrying = !!pel && exitT >= 0.32 && exitT < 0.9;
            if (pel && !carrying) placeProp(fx.nodes.pelican, fx.props.pelican, { x:pel.x, y:pel.y, k:pel.scale * 0.8, rot:pel.open ? -6 : 4 });
            else hideProp(fx.nodes.pelican);
            if (carrying) {
              const carry = fx.props["pelican-carry"];
              placeProp(fx.nodes["pelican-carry"], carry, { x, y:y - critterHeight(anchor, s * fill) * 0.92 + exitMove.lift, k:pel.scale * 0.8, anchor:carry?.grip || null });
            } else hideProp(fx.nodes["pelican-carry"]);
            const rock = exitMove.rock;
            if (rock) placeProp(fx.nodes.rock, fx.props.rock, { x:rock.x, y:rock.y + (1 - rock.up) * 120 * k, k:k * 0.7, opacity:1 - rock.gone });
            else hideProp(fx.nodes.rock);
            const bonk = exitMove.bonk;
            if (bonk) placeProp(fx.nodes.bonk, fx.props.bonk, { x:bonk.x, y:bonk.y, k:k * (0.5 + 0.5 * bonk.k), opacity:Math.sin(Math.PI * Math.min(1, bonk.k * 1.4)) });
            else hideProp(fx.nodes.bonk);
            const stars = exitMove.stars;
            if (stars) placeProp(fx.nodes.dizzy, fx.props.dizzy, { x:stars.x, y:stars.y, k:k * 0.8, rot:Math.sin(stars.spin) * 10, sx:Math.cos(stars.spin) });
            else hideProp(fx.nodes.dizzy);
            const bubbles = exitMove.bubbles;
            if (bubbles) placeProp(fx.nodes.bubbles, fx.props.bubbles, { x:bubbles.x, y:bubbles.y - bubbles.k * 90 * k, k:k * 0.8, opacity:1 - bubbles.k });
            else hideProp(fx.nodes.bubbles);
            const swirl = exitMove.swirl;
            if (swirl) placeProp(fx.nodes.whirl, fx.props.whirl, { x:swirl.x, y:swirl.y, k:k * (0.7 + 0.3 * swirl.k), sx:1 + 0.1 * Math.sin(swirl.spin * 6),
              opacity:Math.sin(Math.PI * Math.min(1, swirl.k * 1.15)) });
            else hideProp(fx.nodes.whirl);
            if (fx.root) fx.root.style.zIndex = String(z + 1001);
            m.fxOn = true;
          } else if (m.fxOn) { Object.values(fx.nodes).forEach(hideProp); m.fxOn = false; }
        }

        /* the eyes in the dark */
        const eyes = eyeRefs.current.get(i);
        if (eyes) {
          const on = dark && where === "water";
          if (m.eyesOn !== on) { eyes.style.opacity = on ? "1" : "0"; m.eyesOn = on; }
          if (on) {
            const face = anchor.face || anchor.head;
            const ex = x + (face[0] - ax) * sc + dx * sc, ey = y + (face[1] - ay) * sc - 14 * sc + dy * sc;
            eyes.style.transform = `translate3d(${ex.toFixed(1)}px, ${ey.toFixed(1)}px, 0) scale(${(sc * 1.6).toFixed(3)})`;
          }
        }

        /* the name under the tube, on the top layer, nudged into its slot */
        const nameNode = nameRefs.current.get(i);
        if (nameNode) {
          const roll = still ? null : rollCallAt({ phase, phaseStart:st.phaseStart, songAt, seat:p.water.indexOf(i), now });
          const on = !!p.names && where === "water" && !dark && roll !== 0;
          if (m.nameOn !== on) { nameNode.style.opacity = on ? "1" : "0"; m.nameOn = on; }
          if (on) {
            const nudge = names[i] || { dx:0, dy:0 };
            m.nx = follow(m.nx, nudge.dx, dt, 160); m.ny = follow(m.ny, nudge.dy, dt, 160);
            const nx = x + enter + (act?.dx || 0) * sc + m.nx, ny = y + nameUnder(anchor, sc) + m.ny;
            nameNode.style.transform = `translate3d(${nx.toFixed(1)}px, ${ny.toFixed(1)}px, 0) translate(-50%, -50%)${roll !== null ? ` scale(${roll.toFixed(3)})` : ""}`;
          }
        }

        /* the popup in its slot: the latest judgement for POPUP_MS, riding up
           with a hop; the cut's grade stamp; Last Call's readout from the
           reveal, the closest marked and who drinks */
        const popNode = popRefs.current.get(i);
        let showPop = null, say = null, key = null;
        if (gradesOn && where === "water" && p.show.grades[i]) {
          showPop = { opacity:1, dy:0 };
          say = { grade:p.show.grades[i] };
          key = `grade:${say.grade}`;
        } else if (readout) {
          const isClosest = !!drinkers && closest.includes(i), isDrinks = !!drinkers?.includes(i);
          showPop = { opacity:1, dy:0 };
          say = { c:0, q:readout.q, d:readout.d, at:readout.at, big:true, closest:isClosest, drinks:isDrinks };
          key = `lc:${readout.q}:${readout.d}:${isClosest}:${isDrinks}`;
        } else if (inSong && last) {
          /* a run of 10, 20 or 30 holds its popup a moment longer with the badge */
          const badge = st.badges.get(i);
          const streak = badge && badge.at === last.at && now - badge.at < BADGE_MS ? badge.n : 0;
          showPop = streak ? { opacity:1, dy:0 } : popupAt(last, now);
          say = streak ? { ...last, streak } : last;
          key = `${last.c}:${last.at}:${streak}`;
        }
        if (popNode) {
          const slot = slots[i];
          if (showPop && slot) {
            if (m.popKey !== key) { m.popKey = key; popSetters.current.get(i)?.(say); }
            const lift = Math.min(0, dy) * sc;
            m.px = follow(m.px, slot.x + enter, dt, 140);
            m.py = follow(m.py, slot.y, dt, 140);
            popNode.style.transform = `translate3d(${m.px.toFixed(1)}px, ${(m.py + lift + (still ? 0 : showPop.dy)).toFixed(1)}px, 0) scale(${slot.size.toFixed(3)})`;
            popNode.style.opacity = showPop.opacity.toFixed(3);
            popNode.style.zIndex = String(z + 3000);
          } else if (popNode.style.opacity !== "0") popNode.style.opacity = "0";
        }
      });
    };
    const off = driver.add(frame);
    driver.tick();
    return off;
  }, [driver, store, entrants, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  /* a name's width is read once it is drawn (the nudge needs it) */
  useEffect(() => { nameWidths.current = new Map(); }, [entrants, phase]);

  const exiting = phase === "cut" || phase === "chugoff";
  return <>
    <div className="fl-cast">
      {entrants.map((e, i) => e && <RiderNode key={`${i}:${e.device || e.pid || e.name}`} entrant={e} i={i} refs={refs} />)}
      {exiting && entrants.map((e, i) => e && <ExitFx key={`fx:${i}`} i={i} fxRefs={fxRefs} />)}
    </div>
    {phase === "lastcall" && <div className="fl-eyes">
      {entrants.map((e, i) => e && <span key={i} className="fl-eye" style={{ opacity:0 }}
        ref={node => { if (node) eyeRefs.current.set(i, node); else eyeRefs.current.delete(i); }}><i /><i /></span>)}
    </div>}
    <div className="fl-pops">
      {entrants.map((e, i) => e && <div key={i} className="fl-pop" ref={node => { if (node) popRefs.current.set(i, node); else popRefs.current.delete(i); }}>
        <RiderPop i={i} setters={popSetters} />
      </div>)}
    </div>
    <div className="fl-names" data-big={(phase === "chugoff" || (phase === "song" && (room?.field?.length || 0) <= 3)) ? "1" : undefined}>
      {entrants.map((e, i) => e && <span key={i} className={`fl-name${e.ready ? " is-ready" : ""}`}
        style={{ "--c":e.color || "#7fb8ff", "--tag":inkOn(e.color || "#7fb8ff") }}
        ref={node => { if (node) nameRefs.current.set(i, node); else nameRefs.current.delete(i); }}>{e.name}</span>)}
    </div>
  </>;
}
