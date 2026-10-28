/* Everyone on stage, every phase (float/GROOVE.md "The screen (TV)"): the
   flotilla in its rows on the water, x drifting by score; each rider's move
   when their judged hit lands and the popup over them for POPUP_MS, in a
   slot no other popup takes; the bob on the beat; the drink break's chug;
   the crowd on the far bank cheering; the cut's hops to the bank; the
   podium's three. One node per entrant (its name inside it, so a critter in
   front covers it like the rest of the rider), rendered when the room
   changes; the frame driver writes every transform (stage pixels,
   transform and opacity only). */
import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import { Critter, PopupLetters, SplashProp, anchorOf, useRiderArt } from "../art.jsx";
import { ANCHOR, BOX, crowdLayout, fieldOrder, flotillaLayout, podiumLayout, podiumSteps, popupSlots } from "../model/flotilla.js";
import { propOf, spriteSize } from "../../art/groove/index.js";
import { actionAt, bobAt, cheerAt, chugAt, follow, popupAt } from "../model/motion.js";
import { chuggingAt } from "../model/song.js";
import { cutField, cutOuts, cutRankingOf, cutTimeline } from "../model/cut.js";
import * as floatSound from "../../sound/index.js";

/* the cut's beats as the sound plays them (its drumroll's hit, a sting per rider out) */
const soundCut = floatSound.CUT_BEATS || null;
import { barLayout, barPlayersOf, drinkersOf, readoutUntil, totalText } from "../model/lastcall.js";
import { indexList } from "../model/cupShape.js";
import { nameFill } from "../hud/identity.js";

const BEAT = 500;
const INTRO_MS = 2600;
const POP_IN_MS = 520;
/* the winner on the podium jumps every this many beats */
const PODIUM_JUMP_BEATS = 2;
const ease = t => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);

/* the cast's plan for a room message: who is in the water (and how they are
   laid out), who stands on the bank, who hops there, the podium */
export function castPlan({ phase, room, state, entrants }) {
  const all = entrants.map((e, i) => (e ? i : null)).filter(i => i !== null);
  const outs = indexList(room?.out);
  const cupOf = i => Number(state?.scores?.get?.(i)?.cup) || 0;
  const plan = { water:[], kind:"song", drift:true, bank:[], hops:[], podium:[], reform:null, nextWater:null, names:true };
  if (phase === "lobby") return { ...plan, water:all, kind:"lobby", drift:false };
  if (phase === "intro") return { ...plan, water:indexList(room?.field).length ? indexList(room.field) : all, drift:false };
  if (phase === "song") {
    const field = state?.songField?.length ? state.songField : indexList(room?.field);
    return { ...plan, water:fieldOrder(field, cupOf), bank:outs.filter(i => !field.includes(i)) };
  }
  if (phase === "cut") {
    const field = cutField(room, state?.songField);
    const ranking = cutRankingOf(room, state?.songField);
    const going = cutOuts(ranking);
    const earlier = outs.filter(i => !field.includes(i));
    const timeline = cutTimeline(going.length, (room?.endsAt ?? 0) - (room?.startAt ?? 0), soundCut);
    const start = Number.isFinite(room?.startAt) ? room.startAt : state?.phaseStart;
    const survivors = fieldOrder(field.filter(i => !going.includes(i)), i => ranking.find(r => r.i === i)?.pct ?? 0);
    return { ...plan, water:fieldOrder(field, cupOf), bank:earlier, ranking,
      hops:going.map((i, k) => ({ i, at:start + timeline.hopAt(k), ms:timeline.hopMs, stamp:start + timeline.stampAt(k) })),
      reform:start + timeline.reform, nextWater:survivors, kind:survivors.length <= 3 ? "final" : "song" };
  }
  if (phase === "lastcall") return { ...plan, water:barPlayersOf(room), kind:"bar", drift:false };
  if (phase === "podium" || phase === "feedback") {
    const podium = indexList(room?.podium);
    return { ...plan, podium, bank:[], names:false, podiumAt:Number.isFinite(room?.startAt) ? room.startAt : state?.phaseStart };
  }
  return plan;
}

/* one rider's nodes: the placed box (scaled), the body that moves about
   the waterline, a splash at the paddling hand, the name under the tube */
/* the size the art paints a rider at: the bucket that covers the biggest it
   is drawn on this stage (the final's front row) */
const dpr = () => { try { return window.devicePixelRatio || 1; } catch { return 1; } };
const RIDER_PAINT = () => spriteSize(BOX * 0.9 * 1.45, dpr());

const RiderNode = memo(function RiderNode({ entrant, i, refs }) {
  const art = useRiderArt(entrant, { size:RIDER_PAINT() });
  const ripple = art?.poses ? propOf("ripple") : null;
  const anchor = anchorOf(art);
  const set = key => node => { const r = refs.current.get(i) || {}; r[key] = node; r.anchor = anchor; refs.current.set(i, r); };
  useEffect(() => { const r = refs.current.get(i); if (r) r.anchor = anchor; }, [anchor, i, refs]);
  const [wx, wy] = anchor.water;
  const hand = anchor.hand || anchor.water;
  const name = anchor.name || [wx, wy + 52];
  return <div className="fl-rider" ref={set("rider")} data-pose="idle" style={{ "--c":entrant.color || "#7fb8ff" }}>
    {ripple?.src
      ? <img className="fl-ripple-art" src={ripple.src} alt="" draggable={false} style={rippleBox(ripple, wx, wy)} />
      : <div className="fl-ripple" style={{ left:wx - 228, top:wy - 8 }} />}
    <div className="fl-body" ref={set("body")} style={{ transformOrigin:`${wx}px ${wy}px` }}><Critter entrant={entrant} art={art} /></div>
    {!art?.poses && <div className="fl-splash" ref={set("splash")} style={{ left:hand[0] + 20, top:wy - 110 }}><SplashProp /></div>}
    <span className={`fl-tag${entrant.ready ? " is-ready" : ""}`} ref={set("tag")} style={{ left:name[0], top:name[1], "--name":nameFill(entrant.color) }}>{entrant.name}</span>
  </div>;
});

/* the art's ripple centred at the waterline, about 1.35 x the ring (250 box px) */
function rippleBox(prop, wx, wy) {
  const w = 250 * 1.35, h = w * ((prop.h || 104) / (prop.w || 320));
  const ax = ((prop.anchor?.[0] ?? prop.w / 2) / (prop.w || 1)) * w, ay = ((prop.anchor?.[1] ?? prop.h / 2) / (prop.h || 1)) * h;
  return { left:wx - ax, top:wy - ay, width:w, height:h };
}

/* the popup over a rider: re-rendered only when what it says changes (the
   latest hit; in Last Call, once the grabs are in, the total and who drinks) */
function RiderPop({ i, setters }) {
  const [say, setSay] = useState(null);
  useEffect(() => { setters.current.set(i, setSay); return () => setters.current.delete(i); }, [i, setters]);
  if (!say) return null;
  if (say.total !== undefined) return <span className={`fl-pop-in lc-total${say.drinks ? " is-drinks" : ""}`} key={`total:${say.drinks}`}>
    <span className="lc-total-ms">{say.total}</span>{say.drinks && <span className="lc-total-word">Drinks</span>}
  </span>;
  return <span className="fl-pop-in" key={`${say.c}:${say.at}`}><PopupLetters q={say.q} d={say.d} size={say.big ? 52 : 40} /></span>;
}

/* the head's top over the waterline at a scale (stage px) */
const headOver = (anchor, scale) => (anchor.water[1] - (anchor.top || anchor.head)[1]) * scale * (anchor.fill || 1);

export default function Cast({ store, driver, entrants, phase, room, version }) {
  const refs = useRef(new Map());
  const popRefs = useRef(new Map());
  const popSetters = useRef(new Map());
  const motion = useRef(new Map());
  const firstSeen = useRef(new Map());
  const mounted = useRef(false);
  /* each row's order, kept across renders (riders pass only when clearly ahead) */
  const orders = useRef(new Map());
  const plan = useMemo(() => castPlan({ phase, room, state:store.state, entrants }), [phase, room, entrants, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const planRef = useRef(plan);
  planRef.current = plan;

  /* the lobby: a rider who joins after the screen opened pops in */
  useEffect(() => {
    if (!entrants.some(Boolean)) return;
    const now = store.serverNow();
    entrants.forEach((e, i) => { if (e && !firstSeen.current.has(i)) firstSeen.current.set(i, mounted.current ? now : -Infinity); });
    mounted.current = true;
  }, [entrants, store]);

  useEffect(() => {
    let layoutAt = -Infinity, water = {}, next = {}, bank = {}, podium = {}, slots = {};
    const st = store.state;
    const anchorFor = i => refs.current.get(i)?.anchor || ANCHOR;
    const frame = (now, dt) => {
      const p = planRef.current;
      const songAt = st.songAt;
      const chart = st.chart;
      const bar = phase === "lastcall";
      const inSong = (phase === "song" || bar) && Number.isFinite(songAt);
      const drinkers = bar ? drinkersOf(st.lastCall) : null;
      const beat = inSong ? (now - songAt) / (chart?.beatMs || BEAT) : (now - (st.phaseStart || 0)) / BEAT;
      const reformed = p.reform !== null && now >= p.reform;
      /* the layouts and the popups' slots: every 120 ms (the scores move
         them; the motion is smoothed) */
      if (now - layoutAt > 120 || now < layoutAt || dt === 0) {
        layoutAt = now;
        const lives = new Map(p.water.map(i => [i, phase === "lobby" ? null : store.liveOf(i)]));
        water = p.kind === "bar" ? barLayout(p.water)
          : flotillaLayout(p.water, lives, { kind:p.kind === "lobby" ? "lobby" : p.water.length <= 3 ? "final" : "song",
            drift:p.drift && phase !== "intro", orders:orders.current });
        next = p.nextWater ? flotillaLayout(p.nextWater, new Map(), { kind:p.kind, drift:false }) : {};
        bank = crowdLayout([...p.bank, ...p.hops.map(h => h.i)]);
        podium = podiumLayout(p.podium, podiumSteps(propOf("podium")));
        const shown = reformed ? next : water;
        slots = inSong ? popupSlots(Object.entries(shown).map(([key, spot]) => {
          const i = Number(key);
          return { i, x:spot.x, y:spot.y, scale:spot.scale, top:spot.y - headOver(anchorFor(i), spot.scale) };
        })) : {};
      }
      entrants.forEach((e, i) => {
        const r = refs.current.get(i);
        if (!e || !r?.rider) return;
        let m = motion.current.get(i);
        if (!m) motion.current.set(i, m = { x:null, y:null, s:null, pose:"", z:null, shown:null, popKey:null, tagOn:null, tagScale:null, px:null, py:null });
        let spot = null, where = "hidden", hopT = 0, from = null;
        const hop = p.hops.find(h => h.i === i);
        if (podium[i]) { spot = podium[i]; where = "podium"; }
        else if (hop && now >= hop.at) {
          hopT = Math.min(1, (now - hop.at) / hop.ms);
          spot = bank[i]; from = water[i]; where = hopT < 1 ? "hop" : "bank";
        } else if (water[i]) {
          spot = reformed && next[i] ? next[i] : water[i];
          where = "water";
        } else if (bank[i]) { spot = bank[i]; where = "bank"; }
        if (!spot) {
          if (m.shown !== false) { r.rider.style.opacity = "0"; m.shown = false; }
          const popNode = popRefs.current.get(i);
          if (popNode && popNode.style.opacity !== "0") popNode.style.opacity = "0";
          return;
        }
        const anchor = r.anchor || ANCHOR;
        /* place: follow the target (a hop flies its own arc) */
        let x = spot.x, y = spot.y, s = spot.scale;
        if (where === "hop" && from) {
          const t = ease(hopT);
          x = from.x + (spot.x - from.x) * t;
          y = from.y + (spot.y - from.y) * t - Math.sin(Math.PI * hopT) * 190;
          s = from.scale + (spot.scale - from.scale) * t;
          m.x = x; m.y = y; m.s = s;
        } else {
          const tau = where === "water" ? 480 : 300;
          m.x = follow(m.x, x, dt, tau); m.y = follow(m.y, y, dt, tau); m.s = follow(m.s, s, dt, tau);
          x = m.x; y = m.y; s = m.s;
        }
        /* the intro: the flotilla floats in from upstream, front row first */
        let enter = 0;
        if (phase === "intro") {
          const k = p.water.indexOf(i);
          const t = (now - (st.phaseStart || now) - 300 - k * 110) / INTRO_MS;
          enter = -(1 - ease(t)) * 1600;
        }
        /* the lobby: a newcomer pops up out of the water */
        let pop = 1;
        const seen = firstSeen.current.get(i);
        if (phase === "lobby" && Number.isFinite(seen)) {
          const t = (now - seen) / POP_IN_MS;
          pop = t >= 1 ? 1 : Math.max(0.01, t < 0.6 ? ease(t / 0.6) * 1.12 : 1.12 - 0.12 * ((t - 0.6) / 0.4));
        }
        /* the move: a hit's action, the chug, a cheer, else the bob */
        const last = where === "water" && inSong ? st.last.get(i) : null;
        let act = null;
        if (where === "water" && inSong) {
          const chugging = bar ? !!drinkers?.includes(i) : chuggingAt(chart, songAt, now, st.done.get(i));
          act = actionAt(last, now);
          if (chugging && (!act || act.pose === "miss" || bar)) act = { ...chugAt(beat), splash:act?.splash || 0 };
        } else if (where === "bank") act = cheerAt(st.cheers.get(i), now);
        else if (where === "podium" && spot.place === 1 && Number.isFinite(p.podiumAt)) {
          /* the winner jumps on every other beat */
          const since = now - p.podiumAt;
          if (since > 2700) act = cheerAt(p.podiumAt + Math.floor((since - 2700) / (BEAT * PODIUM_JUMP_BEATS)) * BEAT * PODIUM_JUMP_BEATS + 2700, now);
        }
        let pose = act?.pose || "idle";
        if (!act) {
          if (bar && drinkers) pose = "nice";
          else if (where === "podium") pose = spot.place === 1 ? "cheer" : "nice";
          else if (phase === "lobby" && e.ready) pose = "nice";
          else if (where === "hop") pose = "out";
          else if (where === "bank" && phase === "cut" && hop) pose = "out";
          else if (where === "water" && phase === "cut") {
            const going = p.hops.find(h => h.i === i);
            pose = going && now >= going.stamp ? "out" : "idle";
          }
        }
        const bob = where === "hop" ? { dy:0, sx:1, sy:1 } : bobAt(beat, { amp:where === "bank" ? 0.6 : 1 });
        const ax = anchor.water[0], ay = anchor.water[1];
        const sc = s * pop * (anchor.fill || 1);
        r.rider.style.transform = `translate3d(${(x + enter - ax * sc).toFixed(1)}px, ${(y - ay * sc).toFixed(1)}px, 0) scale(${sc.toFixed(4)})`;
        const dx = act?.dx || 0, dy = (act?.dy || 0) + bob.dy;
        const rot = act?.rot || 0, sx = (act?.sx ?? 1) * bob.sx, sy = (act?.sy ?? 1) * bob.sy;
        if (r.body) r.body.style.transform = `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0) rotate(${rot.toFixed(2)}deg) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
        if (r.splash) r.splash.style.opacity = String(Math.max(0, Math.min(1, act?.splash || 0)).toFixed(2));
        if (m.pose !== pose) { r.rider.dataset.pose = pose; m.pose = pose; }
        const z = Math.round(where === "bank" || where === "hop" ? y - 600 : y);
        if (m.z !== z) { r.rider.style.zIndex = String(z + 1000); m.z = z; }
        if (m.shown !== true) { r.rider.style.opacity = "1"; m.shown = true; }
        if (r.rider.dataset.where !== where) r.rider.dataset.where = where;

        /* the name under the tube, the same size at any scale */
        if (r.tag) {
          const on = p.names && where === "water";
          if (m.tagOn !== on) { r.tag.style.opacity = on ? "1" : "0"; m.tagOn = on; }
          const k = sc > 0 ? 1 / sc : 1;
          if (on && (m.tagScale === null || Math.abs(m.tagScale - k) > 0.002)) {
            r.tag.style.transform = `translate(-50%, -50%) scale(${k.toFixed(4)})`;
            m.tagScale = k;
          }
        }

        /* the popup in its slot, the latest judgement for POPUP_MS, riding up
           with a hop; in Last Call each grab's stays up, big, until the next
           slides, and once the grabs are in, the total (who drinks lit) */
        const popNode = popRefs.current.get(i);
        let showPop = null, say = null, key = null;
        if (bar && drinkers && where === "water") {
          const row = st.lastCall?.totals?.find(item => item.i === i);
          if (row) {
            showPop = { opacity:1, dy:0 };
            say = { total:totalText(row.ms), drinks:drinkers.includes(i) };
            key = `total:${say.total}:${say.drinks}`;
          }
        } else if (bar && last) {
          if (now >= last.at && beat < readoutUntil(chart, last.c)) showPop = { opacity:1, dy:0 };
          say = { ...last, big:true };
          key = `${last.c}:${last.at}`;
        } else if (last) {
          showPop = popupAt(last, now);
          say = last;
          key = `${last.c}:${last.at}`;
        }
        if (popNode) {
          const slot = slots[i];
          if (showPop && slot) {
            if (m.popKey !== key) { m.popKey = key; popSetters.current.get(i)?.(say); }
            const lift = Math.min(0, dy) * sc;
            m.px = follow(m.px, slot.x + enter, dt, 140);
            m.py = follow(m.py, slot.y, dt, 140);
            popNode.style.transform = `translate3d(${m.px.toFixed(1)}px, ${(m.py + lift + showPop.dy).toFixed(1)}px, 0) scale(${slot.size.toFixed(3)})`;
            popNode.style.opacity = showPop.opacity.toFixed(3);
            popNode.style.zIndex = String(z + 3000);
          } else if (popNode.style.opacity !== "0") popNode.style.opacity = "0";
        }
      });
    };
    const off = driver.add(frame);
    driver.tick();
    return off;
  }, [driver, store, entrants, phase]);

  return <>
    <div className="fl-cast">
      {entrants.map((e, i) => e && <RiderNode key={`${i}:${e.device || e.pid || e.name}`} entrant={e} i={i} refs={refs} />)}
    </div>
    <div className="fl-pops">
      {entrants.map((e, i) => e && <div key={i} className="fl-pop" ref={node => { if (node) popRefs.current.set(i, node); else popRefs.current.delete(i); }}>
        <RiderPop i={i} setters={popSetters} />
      </div>)}
    </div>
  </>;
}
