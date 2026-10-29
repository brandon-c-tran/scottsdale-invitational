/* The phone's drawing of the Groove (float/GROOVE.md "The art manifest and
   the 2D art module"): the art module's RiderSprite (the white critter in
   its tube, the tube in the rider's colour, in one of the eight poses), its
   Popup (the judgement in Float Pixel) and the host from the manifest.
   Until the manifest is in (its first fetch), a flat stand-in of the same
   picture holds the place: a white critter in a tube of the rider's
   colour, the host in a straw hat.

   Poses (the manifest's): idle, stroke, hey, nice, miss, chug, cheer, out. */
import React, { useEffect } from "react";
import { Popup as ArtPopup, RiderSprite, hostSprites, loadGrooveArt, lookOf, propOf, riderSprites, useGrooveArt } from "../art/index.js";
import { numberTone } from "./controllerModel.js";

export const POSES = Object.freeze(["idle", "stroke", "hey", "nice", "miss", "chug", "cheer", "out"]);

/* the manifest and this rider's painted sprites, fetched ahead (the lobby), so the song never waits on them */
export function usePreloadArt(entrant) {
  const look = lookOf(entrant || {});
  const key = JSON.stringify(look);
  useEffect(() => {
    let live = true;
    loadGrooveArt().then(() => { if (live && look.critter) return riderSprites(look); }).catch(() => {});
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
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

/* The kayak paddle (GROOVE.md v3 "Row in every song, with a paddle you
   can see"): a double-bladed paddle across the tube at the hands, blades in
   the rider's colour, drawn in the sprite's own 512 box. The art's `paddle`
   prop once the manifest has one, else this drawing. `stroke`: { key, side
   ("left"/"right"), flub } plays one stroke (the blade on that side dips
   with a splash; a flub slaps flat with a splash up); none rests across.
   Away in the poses with no hands free. */
export const PADDLE_POSES = Object.freeze(["idle", "stroke", "hey", "nice", "miss"]);
const PADDLE_Y = 384;
export function Paddle({ color = "#e4572e", stroke = null }) {
  const manifest = useGrooveArt();
  const prop = manifest ? propOf("paddle") : null;
  const motion = stroke ? (stroke.flub ? "is-flub" : stroke.side === "left" ? "is-left" : "is-right") : "";
  const splashX = stroke?.side === "left" ? 52 : 460;
  return <span className={`flc-paddle ${motion}`} key={stroke?.key ?? "rest"} aria-hidden="true">
    {prop?.src
      ? <img className="flc-paddle-art" src={prop.src} alt="" draggable="false" style={{ "--tint":color }} />
      : <svg viewBox="0 0 512 512" focusable="false">
        <g className="flc-paddle-body">
          <rect x="70" y={PADDLE_Y - 7} width="372" height="14" rx="7" fill="#c9a26b" stroke={INK} strokeWidth="6" />
          <path d={`M14 ${PADDLE_Y} C14 ${PADDLE_Y - 30} 40 ${PADDLE_Y - 34} 84 ${PADDLE_Y - 12} L84 ${PADDLE_Y + 12} C40 ${PADDLE_Y + 34} 14 ${PADDLE_Y + 30} 14 ${PADDLE_Y} Z`}
            fill={color} stroke={INK} strokeWidth="6" strokeLinejoin="round" />
          <path d={`M498 ${PADDLE_Y} C498 ${PADDLE_Y - 30} 472 ${PADDLE_Y - 34} 428 ${PADDLE_Y - 12} L428 ${PADDLE_Y + 12} C472 ${PADDLE_Y + 34} 498 ${PADDLE_Y + 30} 498 ${PADDLE_Y} Z`}
            fill={color} stroke={INK} strokeWidth="6" strokeLinejoin="round" />
          <path d={`M30 ${PADDLE_Y - 8} q14 -10 34 -4`} fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="6" strokeLinecap="round" />
          <path d={`M482 ${PADDLE_Y - 8} q-14 -10 -34 -4`} fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="6" strokeLinecap="round" />
        </g>
        {stroke && <g className="flc-paddle-splash" fill="#bdf0ff" stroke={INK} strokeWidth="5" strokeLinejoin="round"
          transform={stroke.flub ? "translate(256 0)" : `translate(${splashX} 0)`}>
          <path d="M-36 468 q-22 -34 -6 -58 q8 30 24 40z" /><path d="M-4 456 q-8 -44 14 -60 q-2 34 8 52z" /><path d="M26 466 q18 -30 4 -54 q-8 26 -20 38z" />
        </g>}
      </svg>}
  </span>;
}

/* a rider's critter in a pose, in what they wear (lookOf: the hat, the
   glasses, the photo tee with their photo): the art's own sprite once the
   manifest is in. `paddle` puts the kayak paddle in its hands (true, or a
   stroke { key, side, flub }), only in the poses with hands free. */
export function Critter({ entrant, pose = "idle", size = 200, className = "", paddle = null }) {
  const manifest = useGrooveArt();
  const look = lookOf({ ...(entrant || {}), color:entrant?.color || "#e4572e" });
  const color = entrant?.color || "#e4572e";
  const want = POSES.includes(pose) ? pose : "idle";
  const rowing = !!paddle && PADDLE_POSES.includes(want);
  return <span className={`flc-critter${manifest ? " is-art" : ""}${rowing ? " has-paddle" : ""}${className ? ` ${className}` : ""}`} style={{ "--size":`${size}px` }} data-pose={want}>
    {manifest ? <RiderSprite {...look} pose={want} size={size} />
      : <StandInCritter color={color} pose={want} size={size} />}
    {rowing && <Paddle color={color} stroke={typeof paddle === "object" ? paddle : null} />}
  </span>;
}

/* the host in a pose: the manifest's host once it is in */
export function Host({ pose = "idle", size = 72 }) {
  const manifest = useGrooveArt();
  const host = manifest ? hostSprites() : null;
  const src = host?.poses?.[pose] || host?.poses?.idle || null;
  return <span className="flc-host" style={{ "--size":`${size}px` }}>
    {src ? <img src={src} alt="" width={size} height={size} draggable="false" /> : <StandInHost pose={pose} size={size} />}
  </span>;
}

/* the judgement, big: the signed offset over the word (GROOVE.md "The popup"), the art's own lettering;
   the number in its tone by how close (v3: offsetTone in a song, countTone at Last Call with `count`) */
export const POPUP_SIZE = 76;
export function Popup({ q, d, size = POPUP_SIZE, className = "", life = true, count = false }) {
  const tone = numberTone(q, d, { count });
  return <span className={`flc-popup is-num-${tone}${className ? ` ${className}` : ""}`} data-tone={tone} role="status">
    <ArtPopup q={q} d={d} size={size} life={life} />
  </span>;
}
