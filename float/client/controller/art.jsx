/* The phone's drawing of the Groove (float/GROOVE.md "The art manifest and
   the 2D art module"). The art module (float/client/art) loads as its own
   chunk on first use, from an effect, never at module scope, so Field Day's
   bundle and node tests never pull it in. What it offers is used where it
   exists: RiderSprite and Popup components, else riderSprites() (a URL per
   pose), else the flat stand-ins below (a white critter in a tube of the
   rider's colour, the host in a straw hat, the judgement lettered in CSS),
   drawn behind the same calls, so the screens never change when the art
   lands.

   Poses (the manifest's): idle, stroke, hey, nice, miss, chug, cheer, out. */
import React, { useEffect, useState } from "react";
import { popupOf } from "../../shared/chart.js";

export const POSES = Object.freeze(["idle", "stroke", "hey", "nice", "miss", "chug", "cheer", "out"]);

let art = null, pending = null, failed = false;
const listeners = new Set();
const notify = () => listeners.forEach(fn => { try { fn(); } catch {} });

export function loadArt() {
  if (art || failed) return Promise.resolve(art);
  pending ||= import("../art/index.js").then(mod => { art = mod || null; return art; }, () => { failed = true; return null; })
    .finally(() => { pending = null; notify(); });
  return pending;
}

/* the art module once it is in (null until then, and for good if it fails) */
export function useArt(want = true) {
  const [, bump] = useState(0);
  useEffect(() => {
    if (!want) return undefined;
    const fn = () => bump(n => n + 1);
    listeners.add(fn);
    loadArt();
    return () => { listeners.delete(fn); };
  }, [want]);
  return art;
}

/* every pose of a rider as image URLs, from the art module's riderSprites */
const spriteCache = new Map();
function useSpriteUrls(mod, { critter, color, groom }) {
  const key = `${critter}|${color}|${groom ? 1 : 0}`;
  const [urls, setUrls] = useState(() => spriteCache.get(key) || null);
  useEffect(() => {
    if (typeof mod?.riderSprites !== "function") return undefined;
    let live = true;
    const hit = spriteCache.get(key);
    if (hit) { setUrls(hit); return undefined; }
    Promise.resolve().then(() => mod.riderSprites({ critter, color, groom })).then(found => {
      if (!found || typeof found !== "object") return;
      spriteCache.set(key, found);
      if (live) setUrls(found);
    }).catch(() => {});
    return () => { live = false; };
  }, [mod, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return urls;
}

const INK = "#2b2233";
const BODY = "#fffdf8";

/* the stand-in critter: a white round body in a tube of the rider's colour */
export function StandInCritter({ color = "#e4572e", pose = "idle", size = 200 }) {
  const happy = pose === "nice" || pose === "cheer";
  const shout = pose === "hey" || pose === "miss";
  const armsUp = pose === "cheer" ? 2 : pose === "hey" ? 1 : 0;
  return <svg className={`flc-standin is-${pose}`} viewBox="0 0 200 200" width={size} height={size} aria-hidden="true" focusable="false">
    <ellipse cx="100" cy="150" rx="84" ry="30" fill={color} stroke={INK} strokeWidth="4" />
    <ellipse cx="100" cy="146" rx="50" ry="13" fill="rgba(0,0,0,0.18)" />
    {armsUp >= 1 && <path d="M138 112 q22 -18 20 -44" fill="none" stroke={INK} strokeWidth="13" strokeLinecap="round" />}
    {armsUp >= 1 && <path d="M138 112 q22 -18 20 -44" fill="none" stroke={BODY} strokeWidth="7" strokeLinecap="round" />}
    {armsUp >= 2 && <path d="M62 112 q-22 -18 -20 -44" fill="none" stroke={INK} strokeWidth="13" strokeLinecap="round" />}
    {armsUp >= 2 && <path d="M62 112 q-22 -18 -20 -44" fill="none" stroke={BODY} strokeWidth="7" strokeLinecap="round" />}
    <circle cx="72" cy="72" r="11" fill={BODY} stroke={INK} strokeWidth="4" />
    <circle cx="128" cy="72" r="11" fill={BODY} stroke={INK} strokeWidth="4" />
    <path d="M54 150 C50 102 66 64 100 64 C134 64 150 102 146 150 Z" fill={BODY} stroke={INK} strokeWidth="4" strokeLinejoin="round" />
    {happy ? <>
      <path d="M78 106 q6 -7 12 0" fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" />
      <path d="M110 106 q6 -7 12 0" fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" />
    </> : pose === "out" ? <>
      <path d="M78 104 h11" stroke={INK} strokeWidth="4" strokeLinecap="round" />
      <path d="M111 104 h11" stroke={INK} strokeWidth="4" strokeLinecap="round" />
    </> : pose === "chug" ? <>
      <path d="M78 104 q6 4 12 0" fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" />
      <path d="M110 104 q6 4 12 0" fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" />
    </> : <>
      <circle cx="84" cy="104" r="5" fill={INK} />
      <circle cx="116" cy="104" r="5" fill={INK} />
    </>}
    {pose === "chug"
      ? <g><rect x="88" y="112" width="26" height="30" rx="4" fill="#ffd65a" stroke={INK} strokeWidth="4" /><rect x="88" y="112" width="26" height="7" fill="#fff6d8" stroke={INK} strokeWidth="3" /></g>
      : shout ? <ellipse cx="100" cy="124" rx="6" ry="7.5" fill={INK} />
      : happy ? <path d="M92 120 q8 8 16 0" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
      : <path d="M93 124 q7 -5 14 0" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />}
    <path d="M16 150 A84 30 0 0 0 184 150 L150 147 A50 13 0 0 1 50 147 Z" fill={color} stroke={INK} strokeWidth="4" strokeLinejoin="round" />
    <path d="M30 158 A72 22 0 0 0 82 175" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="5" strokeLinecap="round" />
    {pose !== "cheer" && pose !== "chug" && <>
      <ellipse cx={pose === "stroke" ? 58 : 70} cy={pose === "stroke" ? 150 : 141} rx="11" ry="8" fill={BODY} stroke={INK} strokeWidth="4" />
      {armsUp < 1 && <ellipse cx="130" cy="141" rx="11" ry="8" fill={BODY} stroke={INK} strokeWidth="4" />}
    </>}
    {pose === "miss" && <g fill="#8fd8ff" stroke={INK} strokeWidth="3">
      <path d="M60 70 q-6 10 0 14 q6 -4 0 -14z" /><path d="M146 78 q-6 10 0 14 q6 -4 0 -14z" /><path d="M128 52 q-5 8 0 11 q5 -3 0 -11z" />
    </g>}
    {pose === "stroke" && <g fill="#bdf0ff" stroke={INK} strokeWidth="3">
      <path d="M34 150 q-10 -14 -2 -22 q2 12 10 16z" /><path d="M44 142 q-4 -16 6 -20 q-2 12 4 18z" />
    </g>}
  </svg>;
}

/* the host on the bank: a straw hat and a megaphone */
export function StandInHost({ pose = "idle", size = 72 }) {
  const calling = pose === "call";
  return <svg className={`flc-standin-host is-${pose}`} viewBox="0 0 120 120" width={size} height={size} aria-hidden="true" focusable="false">
    <path d="M30 112 C26 74 40 46 62 46 C84 46 98 74 94 112 Z" fill={BODY} stroke={INK} strokeWidth="4" strokeLinejoin="round" />
    <ellipse cx="62" cy="44" rx="40" ry="10" fill="#f4cf6a" stroke={INK} strokeWidth="4" />
    <path d="M42 42 C42 24 82 24 82 42 Z" fill="#f4cf6a" stroke={INK} strokeWidth="4" strokeLinejoin="round" />
    <path d="M42 38 h40" stroke="#ff6f61" strokeWidth="5" />
    <circle cx="54" cy="70" r="4" fill={INK} /><circle cx="72" cy="70" r="4" fill={INK} />
    {calling ? <ellipse cx="63" cy="84" rx="5" ry="6" fill={INK} /> : <path d="M57 86 q6 -4 12 0" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />}
    <g transform={calling ? "rotate(-18 86 84)" : "rotate(8 86 84)"}>
      <path d="M84 80 L110 66 L110 100 L84 88 Z" fill="#ff6f61" stroke={INK} strokeWidth="4" strokeLinejoin="round" />
      <rect x="76" y="78" width="10" height="12" rx="2" fill="#fff" stroke={INK} strokeWidth="3.5" />
    </g>
  </svg>;
}

/* a rider's critter in a pose: the art's own sprite when it is in */
export function Critter({ entrant, pose = "idle", size = 200, className = "" }) {
  const mod = useArt();
  const critter = entrant?.look?.critter || "capybara";
  const color = entrant?.color || "#e4572e";
  const groom = !!entrant?.groom;
  const urls = useSpriteUrls(mod && typeof mod.RiderSprite !== "function" ? mod : null, { critter, color, groom });
  const want = POSES.includes(pose) ? pose : "idle";
  let body;
  if (typeof mod?.RiderSprite === "function") {
    const Sprite = mod.RiderSprite;
    body = <Sprite entrant={entrant} critter={critter} color={color} groom={groom} pose={want} size={size} />;
  } else if (urls?.[want] || urls?.idle) {
    body = <img src={urls[want] || urls.idle} alt="" width={size} height={size} draggable="false" decoding="async" />;
  } else {
    body = <StandInCritter color={color} pose={want} size={size} />;
  }
  return <span className={`flc-critter${className ? ` ${className}` : ""}`} style={{ "--size":`${size}px` }} data-pose={want}>{body}</span>;
}

/* the host in a pose: the art's host sprites when they are in */
export function Host({ pose = "idle", size = 72 }) {
  const mod = useArt();
  const [urls, setUrls] = useState(null);
  useEffect(() => {
    if (typeof mod?.hostSprites !== "function") return undefined;
    let live = true;
    Promise.resolve().then(() => mod.hostSprites()).then(found => { if (live && found && typeof found === "object") setUrls(found); }).catch(() => {});
    return () => { live = false; };
  }, [mod]);
  const src = urls?.[pose]?.src || urls?.[pose] || urls?.idle?.src || urls?.idle || null;
  return <span className="flc-host" style={{ "--size":`${size}px` }}>
    {typeof src === "string" ? <img src={src} alt="" width={size} height={size} draggable="false" /> : <StandInHost pose={pose} size={size} />}
  </span>;
}

/* the judgement, big: the signed offset over the word (GROOVE.md "The popup") */
export function Popup({ q, d, className = "" }) {
  const mod = useArt();
  if (typeof mod?.Popup === "function") {
    const Art = mod.Popup;
    return <span className={`flc-popup is-art${className ? ` ${className}` : ""}`}><Art q={q} d={d} size="phone" /></span>;
  }
  const { num, word, tone } = popupOf(q, d);
  return <span className={`flc-popup is-${tone} is-${q}${className ? ` ${className}` : ""}`} role="status">
    {num && <b className="flc-popup-num">{num}</b>}
    <b className="flc-popup-word">{word}</b>
  </span>;
}
