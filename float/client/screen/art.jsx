/* The art the screen draws with (float/GROOVE.md "The art manifest and the
   2D art module"). One adapter over float/client/art/groove: the painted
   pose sprites (the rider's colour on the tube, the groom's crown), the
   props, the popup's lettering, the host and the scenes. What the art has
   not drawn yet is drawn here in the same style (a white round deadpan
   critter, a thin dark line, dot eyes, colour only on the tube): a critter
   whose own pose is missing gets the move's prop over it (the cup to the
   mouth, a splash in the face); the host and the scenes stay these
   drawings until the art's own are no longer placeholders.

     useRiderArt(entrant)   { poses:{ pose:url }, anchor, own:Set } once painted, else null
     Critter                one rider: every pose stacked, the shown one picked
                            by the nearest [data-pose] (CSS), so a pose swaps
                            without a decode
     RiderFace              a rider's idle critter, for the boards
     HostFigure             the host on the bank (idle, call, cheer)
     SignProp, SplashProp   props
     PopupLetters           the judgement's two lines (the art's Popup)
     useSceneArt(id)        the scene's painted layers, or null (draw our own)
   Render functions only: nothing fetched at module scope, nothing on window. */
import React, { useMemo } from "react";
import { popupOf } from "../../shared/chart.js";
import { ANCHOR } from "./model/flotilla.js";
import RiderSprite, { useGrooveArt, useRiderSprites } from "../art/groove/RiderSprite.jsx";
import ArtPopup from "../art/groove/Popup.jsx";
import { critterArt, hostSprites, propOf, sceneOf } from "../art/groove/index.js";

export const POSES = Object.freeze(["idle", "stroke", "hey", "nice", "miss", "chug", "cheer", "out"]);

/* the top of a critter's head over its head anchor (box px): where a popup starts */
const HEAD_ROOM = 46;
/* the art's critters fill less of their box than the placeholder drawing
   (a tube about half its width, against four fifths): drawn this much
   larger, they take the same room in the rows */
export const ART_FILL = 1.45;

/* A rider's painted sprites and anchors once the art has them: { poses,
   anchor:{ water, head, top, face, hand }, own } (own: the poses with their
   own drawing; the rest are the idle one), or null (the placeholder draws). */
export function useRiderArt(entrant, { size = 512 } = {}) {
  const m = useGrooveArt();
  const critter = entrant?.look?.critter || "capybara";
  const urls = useRiderSprites({ critter, color:entrant?.color, groom:!!entrant?.groom, size });
  return useMemo(() => {
    const c = m ? critterArt(critter, m) : null;
    if (!c?.anchor?.water) return null;
    const idle = c.poses?.idle?.src;
    const own = new Set(Object.entries(c.poses || {}).filter(([pose, art]) => pose === "idle" || (art?.src && art.src !== idle)).map(([pose]) => pose));
    const head = c.anchor.head || c.poses?.idle?.anchor?.head || [256, 200];
    const anchor = { water:c.anchor.water, head, top:[head[0], head[1] - HEAD_ROOM], face:c.anchor.face || head, hand:c.anchor.hand || c.anchor.water,
      name:[c.anchor.water[0], c.anchor.water[1] + 52], fill:ART_FILL };
    return { poses:urls || null, anchor, own, critter, placeholder:!!c.placeholder };
  }, [m, urls, critter]);
}
export const anchorOf = art => art?.anchor || ANCHOR;

/* ── the placeholder critter: a 512 box, the waterline at y 404 ── */
const LINE = "#1d1a24";
const W = 7;
const shade = (hex, k) => {
  const v = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
  if (!v) return hex;
  const n = parseInt(v[1], 16);
  const ch = c => Math.max(0, Math.min(255, Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k)));
  return `#${[n >> 16 & 255, n >> 8 & 255, n & 255].map(ch).map(c => c.toString(16).padStart(2, "0")).join("")}`;
};

/* species read from the silhouette only (GROOVE.md "The look") */
const EARS = {
  capybara:"round", otter:"round", javelina:"pointy", coyote:"tall", armadillo:"pointy", jackrabbit:"long",
  bighorn:"horns", quail:"plume", roadrunner:"crest", hornedlizard:"spikes", tortoise:"shell", frog:"bumps", gila:"none",
};
function Features({ critter }) {
  const kind = EARS[critter] || "round";
  const p = { fill:"#fffdf8", stroke:LINE, strokeWidth:W, strokeLinejoin:"round", strokeLinecap:"round" };
  if (kind === "round") return <g><circle cx="178" cy="150" r="26" {...p} /><circle cx="334" cy="150" r="26" {...p} /></g>;
  if (kind === "pointy") return <g><path d="M160 178 L172 98 L222 140 Z" {...p} /><path d="M352 178 L340 98 L290 140 Z" {...p} /></g>;
  if (kind === "tall") return <g><path d="M164 182 L168 62 L232 132 Z" {...p} /><path d="M348 182 L344 62 L280 132 Z" {...p} />
    <path d="M178 150 L180 98 L210 134" fill="#f3c9c4" stroke="none" /><path d="M334 150 L332 98 L302 134" fill="#f3c9c4" stroke="none" /></g>;
  if (kind === "long") return <g><path d="M204 150 C188 70 196 8 222 6 C246 4 248 80 236 146 Z" {...p} />
    <path d="M308 150 C324 70 316 8 290 6 C266 4 264 80 276 146 Z" {...p} />
    <path d="M214 120 C206 70 212 30 222 28 C232 30 232 80 226 120 Z" fill="#f3c9c4" /><path d="M298 120 C306 70 300 30 290 28 C280 30 280 80 286 120 Z" fill="#f3c9c4" /></g>;
  if (kind === "horns") return <g fill="none" stroke={LINE} strokeWidth={W} strokeLinecap="round">
    <path d="M196 150 C150 120 118 160 140 196 C156 220 190 206 182 182" fill="#e9dcc6" />
    <path d="M316 150 C362 120 394 160 372 196 C356 220 322 206 330 182" fill="#e9dcc6" /></g>;
  if (kind === "plume") return <path d="M256 116 C252 80 266 50 292 44 C312 40 318 62 298 66" fill="none" stroke={LINE} strokeWidth={W + 2} strokeLinecap="round" />;
  if (kind === "crest") return <g {...p}><path d="M226 122 L206 58 L246 104 Z" /><path d="M250 116 L254 42 L276 108 Z" /><path d="M278 120 L304 62 L298 118 Z" /></g>;
  if (kind === "spikes") return <g {...p}>{[150, 196, 244, 292, 340].map((x, k) => <path key={k} d={`M${x} ${k === 0 || k === 4 ? 176 : 132} l14 -44 l14 44 Z`} />)}</g>;
  if (kind === "shell") return <path d="M118 330 C110 200 190 150 256 150 C322 150 402 200 394 330 Z" fill="#cfe3b8" stroke={LINE} strokeWidth={W} />;
  if (kind === "bumps") return <g {...p}><circle cx="196" cy="140" r="34" /><circle cx="316" cy="140" r="34" /></g>;
  return null;
}

/* one critter in its tube, every pose's parts in the one drawing; CSS on
   the nearest [data-pose] shows the pose's own (.p-<pose>) */
export function PlaceholderCritter({ color = "#7fb8ff", critter = "capybara", groom = false }) {
  const tube = color, tubeDark = shade(color, -0.32), tubeLight = shade(color, 0.55);
  const body = { fill:"#fffdf8", stroke:LINE, strokeWidth:W, strokeLinejoin:"round", strokeLinecap:"round" };
  const ink = { fill:"none", stroke:LINE, strokeWidth:W, strokeLinecap:"round", strokeLinejoin:"round" };
  return <svg className="cr" viewBox="0 0 512 512" aria-hidden="true">
    {/* the tube's far side and its hole */}
    <ellipse cx="256" cy="388" rx="204" ry="76" fill={tube} stroke={LINE} strokeWidth={W} />
    <ellipse cx="256" cy="368" rx="122" ry="30" fill={tubeDark} />
    <g className="cr-body">
      {critter === "tortoise" && <Features critter={critter} />}
      <g className="cr-ears">{critter !== "tortoise" && <Features critter={critter} />}</g>
      <path d="M138 384 C124 236 172 118 256 118 C340 118 388 236 374 384 Z" {...body} />
      {critter === "gila" && <g fill="#f2b98d" stroke="none"><circle cx="196" cy="300" r="13" /><circle cx="318" cy="290" r="11" /><circle cx="300" cy="186" r="9" /></g>}
      {critter === "armadillo" && <path d="M170 300 Q256 330 342 300 M160 340 Q256 370 352 340" {...ink} strokeWidth="5" />}
      {/* the face: dot eyes, a small deadpan mouth; each pose's own */}
      <g className="p-idle p-stroke p-hey p-chug p-cheer">
        <circle cx="222" cy="226" r="11" fill={LINE} /><circle cx="290" cy="226" r="11" fill={LINE} />
      </g>
      <g className="p-chug-eyes" {...ink}><path d="M210 228 h24 M278 228 h24" /></g>
      <g className="p-nice" {...ink}><path d="M210 232 q12 -16 24 0 M278 232 q12 -16 24 0" /></g>
      <g className="p-miss" {...ink}><path d="M210 214 l22 12 l-22 12 M302 214 l-22 12 l22 12" /></g>
      <g className="p-out" {...ink}><path d="M210 230 q12 8 24 0 M278 230 q12 8 24 0" /></g>
      <path className="p-idle p-stroke" d="M246 262 q10 -5 20 0" {...ink} strokeWidth="6" />
      <path className="p-nice" d="M240 256 q16 14 32 0" {...ink} strokeWidth="6" />
      <ellipse className="p-hey p-cheer" cx="256" cy="264" rx="13" ry="16" fill={LINE} />
      <ellipse className="p-miss" cx="256" cy="268" rx="12" ry="14" fill="none" stroke={LINE} strokeWidth="6" />
      <path className="p-out" d="M244 268 q12 -9 24 0" {...ink} strokeWidth="6" />
      <g className="cr-blush" fill="#ffb4b4" opacity="0.55"><ellipse cx="196" cy="256" rx="16" ry="9" /><ellipse cx="316" cy="256" rx="16" ry="9" /></g>
      {/* the chug: a cup to the mouth */}
      <g className="p-chug">
        <path d="M252 214 l70 -6 l-6 70 l-58 4 Z" fill="#fff6d6" stroke={LINE} strokeWidth={W} strokeLinejoin="round" />
        <path d="M258 226 l58 -5" stroke="#f0b33a" strokeWidth="14" strokeLinecap="round" />
        <path d="M330 262 C350 266 356 296 330 300" {...body} />
      </g>
      {/* a splash in the face */}
      <g className="p-miss" fill="#7fd6f2" stroke={LINE} strokeWidth="4">
        <path d="M150 196 q-14 -26 4 -40 q12 20 -4 40 Z" /><path d="M362 190 q14 -28 -4 -42 q-12 22 4 42 Z" /><circle cx="330" cy="150" r="9" />
      </g>
    </g>
    {/* the tube's near side, over the body */}
    <path d="M52 388 A204 76 0 0 0 460 388 L378 372 A122 30 0 0 1 134 372 Z" fill={tube} stroke={LINE} strokeWidth={W} strokeLinejoin="round" />
    <path d="M98 410 Q256 470 414 410" fill="none" stroke={tubeLight} strokeWidth="12" strokeLinecap="round" opacity="0.8" />
    {/* paws: on the tube, one paddling, up, both up */}
    <g className="p-idle p-nice p-miss p-out p-chug"><ellipse cx="184" cy="372" rx="30" ry="20" {...body} /></g>
    <g className="p-idle p-nice p-miss p-out p-hey"><ellipse cx="328" cy="372" rx="30" ry="20" {...body} /></g>
    <g className="p-stroke">
      <ellipse cx="184" cy="372" rx="30" ry="20" {...body} />
      <path d="M330 350 C380 360 420 400 440 440" {...body} strokeWidth={W} fill="none" />
      <ellipse cx="444" cy="444" rx="24" ry="18" {...body} />
      <g fill="#bfeefd" stroke={LINE} strokeWidth="4"><path d="M440 420 q-6 -40 16 -56 q8 30 -16 56 Z" /><path d="M470 430 q14 -30 34 -30 q-6 28 -34 30 Z" /></g>
    </g>
    <g className="p-hey">
      <path d="M196 300 C150 250 140 190 150 150" fill="none" stroke={LINE} strokeWidth={W + 34} strokeLinecap="round" />
      <path d="M196 300 C150 250 140 190 150 150" fill="none" stroke="#fffdf8" strokeWidth="34" strokeLinecap="round" />
    </g>
    <g className="p-cheer">
      {[["M196 300 C150 250 140 190 150 150"], ["M316 300 C362 250 372 190 362 150"]].map(([d], k) => <g key={k}>
        <path d={d} fill="none" stroke={LINE} strokeWidth={W + 34} strokeLinecap="round" />
        <path d={d} fill="none" stroke="#fffdf8" strokeWidth="34" strokeLinecap="round" />
      </g>)}
    </g>
    {groom && <g className="cr-crown" transform="translate(256 120)">
      <path d="M-70 -6 L-78 -78 L-38 -44 L0 -96 L38 -44 L78 -78 L70 -6 Z" fill="#ffd34d" stroke={LINE} strokeWidth={W} strokeLinejoin="round" />
      <circle cx="0" cy="-34" r="11" fill="#ff5a7a" stroke={LINE} strokeWidth="4" />
    </g>}
  </svg>;
}

/* the poses that share one picture, so each distinct sprite is one <img> */
function spriteLayers(urls) {
  const byUrl = new Map();
  for (const pose of POSES) {
    const url = urls?.[pose] || urls?.idle;
    if (!url) continue;
    if (!byUrl.has(url)) byUrl.set(url, []);
    byUrl.get(url).push(pose);
  }
  return [...byUrl.entries()];
}

/* a prop placed in the sprite's box, its own anchor on a box point */
function BoxProp({ id, at, width, className, fallback = null }) {
  const prop = propOf(id);
  if (!prop?.src || !at) return fallback;
  const w = width, h = width * ((prop.h || 1) / (prop.w || 1));
  const ax = (prop.anchor?.[0] ?? prop.w / 2) / (prop.w || 1), ay = (prop.anchor?.[1] ?? prop.h / 2) / (prop.h || 1);
  return <img className={`cr-prop ${className || ""}`} src={prop.src} alt="" draggable={false}
    style={{ left:at[0] - w * ax, top:at[1] - h * ay, width:w, height:h }} />;
}

/* one rider's critter: the art's painted poses when they are in (the
   moves a critter has no drawing for carry their prop), the art's own
   composition while it paints, else the placeholder drawing (the caller
   sets data-pose on an ancestor) */
export function Critter({ entrant, art = null }) {
  if (art?.poses) {
    const { face, hand } = art.anchor;
    return <span className="cr-sprites">
      {spriteLayers(art.poses).map(([url, poses]) => <img key={url} className={`cr-sprite ${poses.map(pose => `p-${pose}`).join(" ")}`} src={url} alt=""
        draggable={false} decoding="async" />)}
      {!art.own.has("chug") && <BoxProp id="cup" className="p-chug" at={[face[0] + 34, face[1] + 18]} width={118} />}
      {!art.own.has("miss") && <BoxProp id="splash" className="p-miss cr-face-splash" at={[face[0] + 6, face[1] - 30]} width={190} />}
      {!art.own.has("stroke") && <BoxProp id="splash" className="p-stroke" at={[hand[0] + 92, hand[1] + 46]} width={150} />}
    </span>;
  }
  if (art) return <span className="cr-sprites"><RiderSprite critter={art.critter} color={entrant?.color} groom={!!entrant?.groom} pose="idle" size={512} className="cr-wait" /></span>;
  return <PlaceholderCritter color={entrant?.color} critter={entrant?.look?.critter} groom={!!entrant?.groom} />;
}

/* a rider's idle critter at a size, for the boards and lists */
export function RiderFace({ entrant, pose = "idle", className = "", size = 128 }) {
  const art = useRiderArt(entrant, { size });
  return <span className={`cr-face ${className}`} data-pose={pose}><Critter entrant={entrant} art={art} /></span>;
}

/* ── the host: a critter on the bank in a straw hat with a megaphone ── */
/* the art's host once it is drawn (not the placeholder crop), else ours */
export function useHostArt() {
  const m = useGrooveArt();
  return useMemo(() => {
    const h = m ? hostSprites(m) : null;
    return h && !m.host?.placeholder ? h : null;
  }, [m]);
}
export function HostArt({ host }) {
  return <span className="hs-sprites">
    {spriteLayers(host.poses).map(([url, poses]) => <img key={url} className={`hs-sprite ${poses.map(pose => `h-${pose}`).join(" ")}`} src={url} alt="" draggable={false} />)}
  </span>;
}
export function HostFigure() {
  const body = { fill:"#fffdf8", stroke:LINE, strokeWidth:W, strokeLinejoin:"round", strokeLinecap:"round" };
  return <svg className="hs" viewBox="0 0 400 480" aria-hidden="true">
    <ellipse cx="200" cy="462" rx="110" ry="14" fill="rgba(70,40,30,0.18)" />
    {/* feet and body */}
    <ellipse cx="160" cy="450" rx="30" ry="16" {...body} /><ellipse cx="240" cy="450" rx="30" ry="16" {...body} />
    <path d="M106 448 C88 300 128 170 200 170 C272 170 312 300 294 448 Z" {...body} />
    <g className="h-idle h-cheer"><circle cx="172" cy="262" r="10" fill={LINE} /><circle cx="232" cy="262" r="10" fill={LINE} /></g>
    <g className="h-call"><path d="M160 262 h22 M222 262 h22" stroke={LINE} strokeWidth="7" strokeLinecap="round" /></g>
    <path className="h-idle" d="M192 296 q10 -5 20 0" fill="none" stroke={LINE} strokeWidth="6" strokeLinecap="round" />
    <ellipse className="h-cheer" cx="202" cy="300" rx="12" ry="14" fill={LINE} />
    {/* the straw hat */}
    <ellipse cx="200" cy="190" rx="132" ry="34" fill="#f6d27a" stroke={LINE} strokeWidth={W} />
    <path d="M136 186 C136 120 168 96 200 96 C232 96 264 120 264 186 Z" fill="#f6d27a" stroke={LINE} strokeWidth={W} strokeLinejoin="round" />
    <path d="M138 168 Q200 184 262 168" fill="none" stroke="#3aa6a0" strokeWidth="16" />
    {/* the megaphone: down, up to the mouth, or both arms up */}
    <g className="h-idle">
      <path d="M270 360 C300 372 318 392 322 410" fill="none" stroke={LINE} strokeWidth="40" strokeLinecap="round" />
      <path d="M270 360 C300 372 318 392 322 410" fill="none" stroke="#fffdf8" strokeWidth="26" strokeLinecap="round" />
      <g transform="translate(330 420) rotate(70)"><path d="M0 -12 L64 -34 L64 34 L0 12 Z" fill="#ff6b5a" stroke={LINE} strokeWidth="6" strokeLinejoin="round" />
        <rect x="-16" y="-14" width="20" height="28" rx="6" fill="#fffdf8" stroke={LINE} strokeWidth="6" /></g>
    </g>
    <g className="h-call">
      <path d="M262 330 C296 318 300 292 290 280" fill="none" stroke={LINE} strokeWidth="40" strokeLinecap="round" />
      <path d="M262 330 C296 318 300 292 290 280" fill="none" stroke="#fffdf8" strokeWidth="26" strokeLinecap="round" />
      <g transform="translate(250 286) rotate(-12)"><path d="M0 -14 L86 -44 L86 44 L0 14 Z" fill="#ff6b5a" stroke={LINE} strokeWidth="6" strokeLinejoin="round" />
        <path d="M40 -28 L40 28" stroke="#fffdf8" strokeWidth="10" /><rect x="-18" y="-16" width="22" height="32" rx="6" fill="#fffdf8" stroke={LINE} strokeWidth="6" /></g>
      <g fill="none" stroke={LINE} strokeWidth="7" strokeLinecap="round"><path d="M362 226 q22 30 0 60" /><path d="M384 206 q34 50 0 100" /></g>
    </g>
    <g className="h-cheer">
      {["M118 330 C84 290 80 240 92 206", "M282 330 C316 290 320 240 308 206"].map((d, k) => <g key={k}>
        <path d={d} fill="none" stroke={LINE} strokeWidth="40" strokeLinecap="round" />
        <path d={d} fill="none" stroke="#fffdf8" strokeWidth="26" strokeLinecap="round" />
      </g>)}
    </g>
    <g className="h-idle h-call"><ellipse cx="124" cy="370" rx="22" ry="30" {...body} /></g>
  </svg>;
}

/* The Drop's signs: the next pattern, held up a bar before the switch */
const SIGN_ART = {
  paddle:<g fill="none" stroke={LINE} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M60 130 L150 40" /><path d="M150 40 C170 20 196 30 186 54 C176 78 150 74 150 40" fill="#7fd6f2" />
    <path d="M40 150 q20 -16 40 0 q20 16 40 0 q20 -16 40 0" stroke="#3aa6c8" /></g>,
  rock:<g stroke={LINE} strokeWidth="8" strokeLinejoin="round" strokeLinecap="round">
    <path d="M40 150 L70 96 L120 84 L160 112 L176 150 Z" fill="#c9a98a" />
    <path d="M100 70 q10 -40 40 -46" fill="none" /><path d="M136 18 l8 10 l-12 4" fill="none" /></g>,
  spin:<g fill="none" stroke={LINE} strokeWidth="8" strokeLinecap="round">
    <path d="M100 96 m-58 0 a58 34 0 1 0 116 0 a58 34 0 1 0 -116 0" stroke="#b57cf0" />
    <path d="M100 96 m-30 0 a30 18 0 1 1 60 0" /><path d="M150 70 l14 -4 l-4 14" /></g>,
};
export function SignProp({ mode }) {
  const prop = propOf(`sign-${mode}`);
  if (prop?.src) return <img className="sg sg-art" src={prop.src} alt="" draggable={false} />;
  return <svg className="sg" viewBox="0 0 200 260" aria-hidden="true">
    <rect x="92" y="150" width="16" height="110" rx="6" fill="#c08a5c" stroke={LINE} strokeWidth="6" />
    <rect x="14" y="10" width="172" height="172" rx="22" fill="#fffdf8" stroke={LINE} strokeWidth="8" />
    <g transform="translate(0 6)">{SIGN_ART[mode] || null}</g>
  </svg>;
}

/* the judgement's lettering: the signed offset over the word (a miss has
   no number), the art's Popup (Float Pixel, the contract's tones) */
export function PopupLetters({ q, d, size = 40 }) {
  return <ArtPopup q={q} d={d} size={size} className="pp" />;
}
export { popupOf };

/* the scene's painted layers, once the art's own are in (not placeholders) */
export function useSceneArt(id) {
  const m = useGrooveArt();
  return useMemo(() => {
    const scene = m ? sceneOf(id, m) : null;
    return scene && !scene.placeholder && scene.layers?.length ? scene : null;
  }, [m, id]);
}

/* a splash at the tube's side (a paddle, a landing, a flub) */
export function SplashProp() {
  return <svg className="sp" viewBox="0 0 200 120" aria-hidden="true">
    <g fill="#d8f6ff" stroke={LINE} strokeWidth="5" strokeLinejoin="round">
      <path d="M100 112 C70 112 52 70 64 40 C76 70 84 88 100 92 C116 88 124 70 136 40 C148 70 130 112 100 112 Z" />
      <circle cx="40" cy="58" r="10" /><circle cx="160" cy="52" r="12" /><circle cx="100" cy="24" r="9" />
    </g>
  </svg>;
}
