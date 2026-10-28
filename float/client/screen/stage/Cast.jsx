/* Everyone on stage, every phase (float/GROOVE.md "The screen (TV)"): the
   flotilla in its rows on the water, x drifting by score; each rider's move
   when their judged hit lands and the popup over them for POPUP_MS; the bob
   on the beat; the drink break's chug; the crowd on the far bank cheering;
   the cut's hops to the bank; the podium's three. One node per entrant,
   rendered when the room changes; the frame driver writes every transform
   (stage pixels, transform and opacity only). */
import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import { Critter, PopupLetters, SplashProp, anchorOf, useRiderArt } from "../art.jsx";
import { BOX, crowdLayout, fieldOrder, flotillaLayout, podiumLayout, popupSpot } from "../model/flotilla.js";
import { actionAt, bobAt, cheerAt, chugAt, follow, popupAt } from "../model/motion.js";
import { chuggingAt } from "../model/song.js";
import { cutOuts, cutRanking, cutTimeline } from "../model/cut.js";
import { indexList } from "../model/cupShape.js";
import { inkOn } from "../hud/identity.js";

const BEAT = 500;
const INTRO_MS = 2600;
const POP_IN_MS = 520;
/* the name sits on the tube's front band, this far under the waterline (box units) */
const NAME_Y = 34;
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
    const field = state?.songField?.length ? state.songField : indexList(room?.field);
    const ranking = cutRanking(room?.scores, { field, out:outs });
    const going = cutOuts(ranking, outs, field);
    const earlier = outs.filter(i => !field.includes(i));
    const timeline = cutTimeline(going.length, (room?.endsAt ?? 0) - (room?.startAt ?? 0));
    const start = Number.isFinite(room?.startAt) ? room.startAt : state?.phaseStart;
    const survivors = fieldOrder(field.filter(i => !going.includes(i)), i => ranking.find(r => r.i === i)?.pct ?? 0);
    return { ...plan, water:fieldOrder(field, cupOf), bank:earlier, ranking,
      hops:going.map((i, k) => ({ i, at:start + timeline.hopAt(k), ms:timeline.hopMs, stamp:start + timeline.stampAt(k) })),
      reform:start + timeline.reform, nextWater:survivors, kind:survivors.length <= 3 ? "final" : "song" };
  }
  if (phase === "podium" || phase === "feedback") {
    const podium = indexList(room?.podium);
    return { ...plan, podium, bank:[], names:false };
  }
  return plan;
}

/* one rider's nodes: the placed box (scaled), the body that moves, a splash */
const RiderNode = memo(function RiderNode({ entrant, i, refs }) {
  const art = useRiderArt(entrant);
  const set = key => node => { const r = refs.current.get(i) || {}; r[key] = node; r.anchor = anchorOf(art); refs.current.set(i, r); };
  return <div className="fl-rider" ref={set("rider")} data-pose="idle" style={{ "--c":entrant.color || "#7fb8ff" }}>
    <div className="fl-ripple" />
    <div className="fl-body" ref={set("body")}><Critter entrant={entrant} art={art} /></div>
    <div className="fl-splash" ref={set("splash")}><SplashProp /></div>
  </div>;
});

/* the popup over a rider: re-rendered only when that rider's latest hit changes */
function RiderPop({ i, setters }) {
  const [hit, setHit] = useState(null);
  useEffect(() => { setters.current.set(i, setHit); return () => setters.current.delete(i); }, [i, setters]);
  return hit ? <PopupLetters key={`${hit.c}:${hit.at}`} q={hit.q} d={hit.d} /> : null;
}

export default function Cast({ store, driver, entrants, phase, room, version }) {
  const refs = useRef(new Map());
  const popRefs = useRef(new Map());
  const nameRefs = useRef(new Map());
  const popSetters = useRef(new Map());
  const motion = useRef(new Map());
  const firstSeen = useRef(new Map());
  const mounted = useRef(false);
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
    let layoutAt = -Infinity, water = {}, next = {}, bank = {}, podium = {};
    const st = store.state;
    const frame = (now, dt) => {
      const p = planRef.current;
      const songAt = st.songAt;
      const chart = st.chart;
      const inSong = phase === "song" && Number.isFinite(songAt);
      const beat = inSong ? (now - songAt) / (chart?.beatMs || BEAT) : (now - (st.phaseStart || 0)) / BEAT;
      /* the layouts: every 120 ms (the scores move them; the motion is smoothed) */
      if (now - layoutAt > 120 || now < layoutAt || dt === 0) {
        layoutAt = now;
        const lives = new Map(p.water.map(i => [i, phase === "lobby" ? null : store.liveOf(i)]));
        water = flotillaLayout(p.water, lives, { kind:p.kind === "lobby" ? "lobby" : p.water.length <= 3 ? "final" : "song", drift:p.drift && phase !== "intro" });
        next = p.nextWater ? flotillaLayout(p.nextWater, new Map(), { kind:p.kind, drift:false }) : {};
        bank = crowdLayout([...p.bank, ...p.hops.map(h => h.i)]);
        podium = podiumLayout(p.podium);
      }
      entrants.forEach((e, i) => {
        const r = refs.current.get(i);
        if (!e || !r?.rider) return;
        let m = motion.current.get(i);
        if (!m) motion.current.set(i, m = { x:null, y:null, s:null, pose:"", z:null, shown:null, popKey:null, nameShown:null });
        let spot = null, where = "hidden", hopT = 0, from = null;
        const hop = p.hops.find(h => h.i === i);
        if (podium[i]) { spot = podium[i]; where = "podium"; }
        else if (hop && now >= hop.at) {
          hopT = Math.min(1, (now - hop.at) / hop.ms);
          spot = bank[i]; from = water[i]; where = hopT < 1 ? "hop" : "bank";
        } else if (water[i]) {
          spot = p.reform !== null && now >= p.reform && next[i] ? next[i] : water[i];
          where = "water";
        } else if (bank[i]) { spot = bank[i]; where = "bank"; }
        if (!spot) {
          if (m.shown !== false) { r.rider.style.opacity = "0"; m.shown = false; }
          hideExtras(i, m);
          return;
        }
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
          const t = (now - (st.phaseStart || now) - 300 - (p.water.length - k) * 90) / INTRO_MS;
          enter = -(1 - ease(t)) * 1500;
        }
        /* the lobby: a newcomer pops up out of the water */
        let pop = 1;
        const seen = firstSeen.current.get(i);
        if (phase === "lobby" && Number.isFinite(seen)) {
          const t = (now - seen) / POP_IN_MS;
          pop = t >= 1 ? 1 : Math.max(0.01, t < 0.6 ? ease(t / 0.6) * 1.12 : 1.12 - 0.12 * ((t - 0.6) / 0.4));
        }
        /* the move: a hit's action, the chug, a cheer, else the bob */
        const anchor = r.anchor;
        const last = where === "water" && inSong ? st.last.get(i) : null;
        let act = null;
        if (where === "water" && inSong) {
          act = actionAt(last, now);
          if (!act && chuggingAt(chart, songAt, now, st.done.get(i))) act = chugAt(beat);
          if (act?.pose === "miss" && chuggingAt(chart, songAt, now, st.done.get(i))) act = { ...chugAt(beat), splash:act.splash };
        } else if (where === "bank") act = cheerAt(st.cheers.get(i), now);
        let pose = act?.pose || "idle";
        if (!act) {
          if (where === "podium") pose = spot.place === 1 ? "cheer" : "nice";
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
        const sc = s * pop;
        r.rider.style.transform = `translate3d(${(x + enter - ax * sc).toFixed(1)}px, ${(y - ay * sc).toFixed(1)}px, 0) scale(${sc.toFixed(4)})`;
        const dx = act?.dx || 0, dy = (act?.dy || 0) + bob.dy;
        const rot = act?.rot || 0, sx = (act?.sx ?? 1) * bob.sx, sy = (act?.sy ?? 1) * bob.sy;
        if (r.body) r.body.style.transform = `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0) rotate(${rot.toFixed(2)}deg) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
        if (r.splash) r.splash.style.opacity = String(Math.max(0, Math.min(1, act?.splash || 0)).toFixed(2));
        if (m.pose !== pose) { r.rider.dataset.pose = pose; m.pose = pose; }
        const z = Math.round(where === "bank" || where === "hop" ? y - 600 : y);
        if (m.z !== z) { r.rider.style.zIndex = String(z + 1000); m.z = z; }
        if (m.shown !== true) { r.rider.style.opacity = "1"; m.shown = true; }
        r.rider.dataset.where = where;

        /* the popup over them, the latest judgement for POPUP_MS (a little
           smaller over the rows at the back), riding up with a hop */
        const popNode = popRefs.current.get(i);
        const showPop = last ? popupAt(last, now) : null;
        const lift = Math.min(0, dy) * s;
        if (popNode) {
          if (showPop) {
            const key = `${last.c}:${last.at}`;
            if (m.popKey !== key) { m.popKey = key; popSetters.current.get(i)?.(last); }
            const at = popupSpot({ x:x + enter, y:y + lift, scale:s }, anchor);
            const size = Math.max(0.78, Math.min(1.05, 0.62 + 0.62 * s));
            popNode.style.transform = `translate3d(${at.x.toFixed(1)}px, ${(at.y + showPop.dy).toFixed(1)}px, 0) scale(${(showPop.scale * size).toFixed(3)})`;
            popNode.style.opacity = showPop.opacity.toFixed(3);
            popNode.style.zIndex = String(z + 3000);
          } else if (popNode.style.opacity !== "0") popNode.style.opacity = "0";
        }
        /* the name on the tube's front, moving with it */
        const nameNode = nameRefs.current.get(i);
        if (nameNode) {
          const on = p.names && where === "water";
          if (on) {
            nameNode.style.transform = `translate3d(${(x + enter + dx * s).toFixed(1)}px, ${(y + (NAME_Y + dy) * s * pop).toFixed(1)}px, 0) translate(-50%, -50%)`;
            nameNode.style.zIndex = String(z + 1500);
          }
          const op = on ? String(Math.min(1, pop)) : "0";
          if (m.nameShown !== op) { nameNode.style.opacity = op; m.nameShown = op; }
        }
      });
    };
    const hideExtras = i => {
      const popNode = popRefs.current.get(i);
      if (popNode && popNode.style.opacity !== "0") popNode.style.opacity = "0";
      const nameNode = nameRefs.current.get(i);
      if (nameNode && nameNode.style.opacity !== "0") nameNode.style.opacity = "0";
    };
    const off = driver.add(frame);
    driver.tick();
    return off;
  }, [driver, store, entrants, phase]);

  return <>
    <div className="fl-cast">
      {entrants.map((e, i) => e && <RiderNode key={e.device || e.pid || `${i}:${e.name}`} entrant={e} i={i} refs={refs} />)}
    </div>
    <div className="fl-names">
      {entrants.map((e, i) => e && <span key={i} className={`fl-name${e.ready && phase === "lobby" ? " is-ready" : ""}${e.bot ? " is-bot" : ""}`}
        style={{ "--c":e.color || "#7fb8ff", "--ink":inkOn(e.color) }} ref={node => { if (node) nameRefs.current.set(i, node); else nameRefs.current.delete(i); }}>
        {e.name}
      </span>)}
    </div>
    <div className="fl-pops">
      {entrants.map((e, i) => e && <div key={i} className="fl-pop" ref={node => { if (node) popRefs.current.set(i, node); else popRefs.current.delete(i); }}>
        <RiderPop i={i} setters={popSetters} />
      </div>)}
    </div>
  </>;
}

export { BOX };
