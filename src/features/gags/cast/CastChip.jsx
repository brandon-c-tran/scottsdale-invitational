import React, { createContext, useContext } from "react";
import { ChipFace } from "../../identity/PlayerIdentity.jsx";
import { usePlayerIdentity } from "../../identity/PlayerIdentityContext.js";
import { CAST, castGeometry, clusterLayout } from "./castGeometry.js";
import { GLOVE_BOX, GLOVE_POSES, SHOE_ART } from "./gloveArt.js";
import "./cast.css";

/* The cast rig (bits, Oct 10). A player is their own photo chip standing
   on its edge, with two floating gloves and, if asked, little shoes. No
   eyes over the photo: the photo is the face, and everything else is
   posture, timing and props.

   Every part is a node of no size hung off the feet (the bottom centre on
   the floor), nested so each layer can carry its own motion (cast.css):

     .cast                     placed at the feet (left/top in canvas px)
       .cast-move              locomotion: walks, runs, flights
         .cast-shadow          the flat shadow on the floor (goes where it walks)
         .cast-hop             hops and bobs on top of it (the shadow stays down)
           .cast-body          squash and stretch, falls: origin the feet
             .cast-body-in     a sway or a wobble on top of it
               .cast-shoe.is-l / .is-r     (.cast-shoe-in steps)
               .cast-chip      the chip; .cast-chip-in turns and tilts it
                               in 3D (rotateX back is looking up)
                 .cast-wear    things on the chip (sunglasses, a sweat drop)
               .cast-hand.is-l / .is-r, also .is-front / .is-back
                 .cast-hand-in > .cast-hand-fx    a gesture, a twitch, a recoil
                   .cast-pose.is-<pose>           one layer per pose it takes
                     .cast-held > .cast-held-in > .cast-held-fx   a prop in the hand
                     svg.cast-glove

   A bit animates these by class, delayed from var(--tl) (bits.css). The
   front hand is the one on the side the chip faces (the right hand facing
   right or the room, the left facing left). `hands` takes a pose name, or
   [[pose, ms], ...] to change pose on the bit's clock. */

/* a rehearsal's stand-in photos (no photo server): player -> URL */
const CastPhotos = createContext(null);
export const CastPhotosProvider = ({ photos = null, children }) =>
  <CastPhotos.Provider value={photos}>{children}</CastPhotos.Provider>;

/* "this many ms into the bit", on the bit's clock */
export const at = ms => `calc(var(--tl) + ${Math.round(Number(ms) || 0)}ms)`;

/* the pose layers' timing: each shows from its own ms to the next one's;
   at rest (reduced motion, a finished bit) only the last pose shows */
export function poseTimeline(spec) {
  const list = Array.isArray(spec) ? spec.filter(item => GLOVE_POSES[item?.[0]]).map(([pose, ms]) => [pose, Number(ms) || 0])
    : [[GLOVE_POSES[spec] ? spec : "rest", 0]];
  return (list.length ? list : [["rest", 0]]).sort((a, b) => a[1] - b[1]);
}
export function poseLayerStyle(list, i) {
  const last = i === list.length - 1;
  const [, from] = list[i];
  const parts = [];
  const shows = i > 0 || from > 0;
  if (shows) parts.push(`cast-on 1ms step-end ${at(from)} both`);
  if (!last) parts.push(`cast-off 1ms step-end ${at(list[i + 1][1])} ${shows ? "forwards" : "both"}`);
  return parts.length ? { opacity:last ? 1 : 0, "--ba":parts.join(", "), animation:"var(--ba)" } : { opacity:1 };
}

/* Any drawings that take turns on the bit's clock (a bird's poses, a
   prop's states): [[node, ms], ...], each shown from its ms to the next
   one's; at rest only the last. Each layer is a node of no size. */
export function Swaps({ layers = [], className = "" }) {
  const list = layers.map(([node, ms]) => [node, Number(ms) || 0]).sort((a, b) => a[1] - b[1]);
  return list.map(([node], i) => <div key={i} className={`cast-swap${className ? ` ${className}` : ""}`} style={poseLayerStyle(list, i)}>{node}</div>);
}

/* one pose of a glove, drawn the rubber-hose way: each group laid in ink
   a keyline wider, then painted; the hard shade goes on the palm, under
   the fingers and the cuff */
function inked(parts, k, key) {
  const line = CAST.line * k;
  return parts.map(([kind, d, w], i) => kind === "cap"
    ? <path key={`${key}${i}`} d={d} className="cast-ink" fill="none" strokeWidth={w + line * 2} />
    : <path key={`${key}${i}`} d={d} className="cast-ink" strokeWidth={line * 2} />);
}
function painted(parts, key) {
  return parts.map(([kind, d, w], i) => kind === "cap"
    ? <path key={`${key}${i}`} d={d} className="cast-paint is-cap" fill="none" strokeWidth={w} />
    : <path key={`${key}${i}`} d={d} className="cast-paint" />);
}
export function GloveArt({ pose = "rest", scale = 1, className = "" }) {
  const art = GLOVE_POSES[pose] || GLOVE_POSES.rest;
  const k = 1 / scale;
  const { x, y, w, h } = GLOVE_BOX;
  const shadeAfter = art.shadeAt ?? 0;
  return (
    <svg className={`cast-glove${className ? ` ${className}` : ""}`} viewBox={`${x} ${y} ${w} ${h}`}
      width={w * scale} height={h * scale} style={{ left:x * scale, top:y * scale }} aria-hidden="true">
      {art.groups.map((parts, g) => <g key={g}>
        {inked(parts, k, `i${g}:`)}{painted(parts, `p${g}:`)}
        {g === shadeAfter && (art.shade || []).map((d, i) => <path key={`s${i}`} d={d} className="cast-shade" />)}
      </g>)}
    </svg>
  );
}

/* what a hand holds in a pose: one node for every pose that can hold,
   { [pose]: node } to hold it differently per pose, or (pose) => node */
const heldIn = (held, pose) => !held ? null : typeof held === "function" ? held(pose)
  : React.isValidElement(held) ? held : held[pose] ?? null;

function Hand({ side, front, timeline, scale, held: holding, at: wrist }) {
  const list = poseTimeline(timeline);
  return (
    <div className={`cast-hand is-${side} ${front ? "is-front" : "is-back"}`} style={{ left:wrist.x, top:wrist.y }}>
      <div className="cast-hand-in"><div className="cast-hand-fx">
        <div className="cast-mirror" style={side === "l" ? { transform:"scaleX(-1)" } : undefined}>
          {list.map(([pose], i) => {
            const spot = GLOVE_POSES[pose].held;
            const held = heldIn(holding, pose);
            return (
              <div key={`${pose}:${i}`} className={`cast-pose is-${pose}`} style={poseLayerStyle(list, i)}>
                {held && spot && <div className="cast-held" style={{ left:spot.x * scale, top:spot.y * scale }}>
                  <div className="cast-held-in"><div className="cast-held-fx">{held}</div></div>
                </div>}
                <GloveArt pose={pose} scale={scale} />
              </div>
            );
          })}
        </div>
      </div></div>
    </div>
  );
}

export function ShoeArt({ scale = 1 }) {
  const k = 1 / scale, line = CAST.line * k;
  const { x, y, w, h } = SHOE_ART.box;
  const [sole, soleW] = SHOE_ART.sole;
  return (
    <svg className="cast-shoe-art" viewBox={`${x} ${y} ${w} ${h}`} width={w * scale} height={h * scale}
      style={{ left:x * scale, top:y * scale }} aria-hidden="true">
      <path d={SHOE_ART.upper} className="cast-ink" strokeWidth={line * 2} />
      <path d={sole} className="cast-ink" fill="none" strokeWidth={soleW + line * 2} />
      <path d={SHOE_ART.upper} className="cast-shoe-upper" />
      <path d={sole} className="cast-shoe-sole" fill="none" strokeWidth={soleW} />
      <path d={SHOE_ART.shine} className="cast-shoe-shine" fill="none" strokeWidth={5 * k} />
    </svg>
  );
}
function Shoe({ side, point, scale, at: spot }) {
  return (
    <div className={`cast-shoe is-${side}`} style={{ left:spot.x, top:spot.y }}>
      <div className="cast-shoe-in">
        <div className="cast-mirror" style={point < 0 ? { transform:"scaleX(-1)" } : undefined}><ShoeArt scale={scale} /></div>
      </div>
    </div>
  );
}

/* the chip's edge: the coin's thickness, a darker band of its own color
   under the face, so it stands on the floor as an object */
function ChipEdge({ size, color, drop }) {
  return (
    <svg className="cast-edge" viewBox="0 0 32 32" width={size} height={size} style={{ top:drop }} aria-hidden="true">
      <circle cx="16" cy="16" r="14.7" style={{ fill:`color-mix(in srgb, ${color} 58%, var(--ink0))` }} stroke="var(--ink0)"
        strokeWidth="1.45" />
    </svg>
  );
}

/* One cast member. `facing` 1 (right), -1 (left) or 0 (the room) turns
   the chip a little and sets which hand is the front one; `hold` puts a
   prop in a hand ({ front, back, l, r }), drawn behind the glove so the
   fingers close over it; `wear` sits on the chip. */
export function CastChip({ player, photo, size = CAST.size, x = 0, y = CAST.floor, facing = 0, shoes = true,
  hands = {}, hold = {}, wear = null, shadow = true, className = "", style, children }) {
  const identity = usePlayerIdentity(player);
  const photos = useContext(CastPhotos);
  const g = castGeometry(size, { shoes });
  const frontSide = facing < 0 ? "l" : "r";
  const pick = (map, side) => map?.[side] ?? map?.[side === frontSide ? "front" : "back"] ?? null;
  const src = photo !== undefined ? photo : photos?.[player];
  /* always a function, so a bit can write var(--cast-turn) rotateX(...) */
  const turn = facing > 0 ? "rotateY(-16deg)" : facing < 0 ? "rotateY(16deg)" : "rotateY(0deg)";
  return (
    <div className={`cast${className ? ` ${className}` : ""}`} data-player={player}
      style={{ left:x, top:y, "--cast-turn":turn, ...style }}>
      <div className="cast-move">
        {/* the shadow goes where it walks, and stays on the floor when it hops */}
        {shadow && <span className="cast-shadow" style={{ left:-g.shadow.w / 2, top:-g.shadow.h / 2, width:g.shadow.w, height:g.shadow.h }} />}
        <div className="cast-hop"><div className="cast-body"><div className="cast-body-in">
        {shoes && ["l", "r"].map(side => <Shoe key={side} side={side} scale={g.scale} at={g.shoes[side]}
          point={facing === 0 ? (side === "l" ? -1 : 1) : facing} />)}
        <div className="cast-chip" style={{ left:-size / 2, top:g.top, width:size, height:size }}>
          <div className="cast-chip-in">
            <ChipEdge size={size} color={identity.color} drop={g.edge} />
            <span className="cast-face"><ChipFace p={player} size={size} flat {...(src !== undefined ? { photo:src } : {})} /></span>
          </div>
          {wear && <div className="cast-wear">{wear}</div>}
        </div>
        {["l", "r"].map(side => <Hand key={side} side={side} front={side === frontSide} at={g.hands[side]} scale={g.glove}
          timeline={pick(hands, side) || "rest"} held={pick(hold, side)} />)}
        {children}
      </div></div></div></div>
    </div>
  );
}

/* A side: its lead nearest the action and up to three more shoulder to
   shoulder behind it, then "+N" lettered on the floor. `dir` is the way
   the side extends from the lead. Each member gets .is-lead or .is-mate
   and --i (0 for the lead) for a bit to stagger them. `lead` and `mates`
   are CastChip props for each. */
export function CastSide({ players = [], x, y = CAST.floor, dir = -1, facing = 0, max = 4, lead = {}, mates = {}, className = "" }) {
  const layout = clusterLayout(players.length, { max, dir });
  const shown = players.slice(0, layout.shown);
  const edge = x + (layout.xs[layout.xs.length - 1] || 0) + dir * layout.size * 0.62;
  return (
    <div className={`cast-side${className ? ` ${className}` : ""}`} data-count={players.length}>
      {/* drawn back to front: the lead last, in front of its mates */}
      {shown.map((player, i) => ({ player, i })).reverse().map(({ player, i }) => (
        <CastChip key={player} player={player} size={layout.size} x={x + layout.xs[i]} y={y} facing={facing}
          className={i === 0 ? "is-lead" : "is-mate"} style={{ "--i":i }} {...(i === 0 ? lead : mates)} />
      ))}
      {layout.more > 0 && <span className="cast-more fd-show" style={{ left:edge, top:y + 18,
        transform:dir < 0 ? "translateX(-100%)" : undefined }}>{`+${layout.more}`}</span>}
    </div>
  );
}
