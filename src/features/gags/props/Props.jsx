import React from "react";
import { usePlayerIdentity } from "../../identity/PlayerIdentityContext.js";
import { CAST } from "../cast/castGeometry.js";
import "./props.css";

/* The bits' props (Oct 10), drawn like the backglass: flat fills mixed
   from the painting's inks (cast.css --bit-*), one ink-black keyline
   (CAST.line) and one hard tone. Each prop is an <svg> hung off a node of
   no size: its anchor (named per prop below) sits on that node, so a
   scene places the node and animates it. `scale` resizes a prop and keeps
   its keyline the same width on the canvas.

   Drawing: parts in a group are laid in ink a keyline wider, then
   painted, so a group reads as one silhouette; a later group keeps its
   own line over an earlier one (the waist over an anvil's base). */

const circle = (cx, cy, r) => `M${cx - r},${cy}a${r},${r} 0 1 0 ${r * 2},0a${r},${r} 0 1 0 ${-r * 2},0Z`;
const ellipse = (cx, cy, rx, ry, deg = 0) => {
  const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const p = (x, y) => `${(cx + x * c - y * s).toFixed(1)},${(cy + x * s + y * c).toFixed(1)}`;
  return `M${p(-rx, 0)}A${rx},${ry} ${deg} 1 0 ${p(rx, 0)}A${rx},${ry} ${deg} 1 0 ${p(-rx, 0)}Z`;
};
/* a star of `points` points, outer radius r, inner radius ri */
export const starPath = (points, r, ri, turn = -90) => {
  const out = [];
  for (let i = 0; i < points * 2; i++) {
    const a = (turn + i * 180 / points) * Math.PI / 180, rr = i % 2 ? ri : r;
    out.push(`${(Math.cos(a) * rr).toFixed(1)},${(Math.sin(a) * rr).toFixed(1)}`);
  }
  return `M${out.join("L")}Z`;
};

/* one <svg> hung so its art's 0 0 sits on the node */
function Art({ box, scale = 1, className = "", style, children }) {
  const [x, y, w, h] = box;
  return (
    <svg className={`bit-prop${className ? ` ${className}` : ""}`} viewBox={`${x} ${y} ${w} ${h}`} width={w * scale} height={h * scale}
      style={{ left:x * scale, top:y * scale, ...style }} aria-hidden="true">{children}</svg>
  );
}
/* groups of parts, each laid in ink then painted: ["blob", d, fill] or
   ["cap", d, width, color] */
function Drawn({ groups, k = 1, line = CAST.line }) {
  const L = line * k;
  return groups.map((parts, g) => <g key={g}>
    {parts.map(([kind, d, a], i) => kind === "cap"
      ? <path key={`i${i}`} d={d} className="bit-ink" fill="none" strokeWidth={a + L * 2} />
      : <path key={`i${i}`} d={d} className="bit-ink" strokeWidth={L * 2} />)}
    {parts.map(([kind, d, a, b], i) => kind === "cap"
      ? <path key={`p${i}`} d={d} fill="none" strokeWidth={a} strokeLinecap="round" strokeLinejoin="round" style={{ stroke:b }} />
      : <path key={`p${i}`} d={d} style={{ fill:a }} />)}
  </g>);
}
const Tone = ({ d, fill }) => <path d={d} style={{ fill }} />;
const Line = ({ d, k = 1, w = CAST.detail }) => <path d={d} className="bit-line" strokeWidth={w * k} />;

/* ── a revolver, comically small: pointing right. Anchor: where the grip
   meets the frame (a fist closes under it). `pivot="guard"` hangs it on
   its trigger guard instead (to spin on a finger). ── */
export const REVOLVER = Object.freeze({ muzzle:{ x:49, y:-12 }, guard:{ x:5, y:6 }, scale:1.1 });
export function Revolver({ scale = REVOLVER.scale, pivot = "grip", className = "" }) {
  const k = 1 / scale;
  const shift = pivot === "guard" ? `translate(${-REVOLVER.guard.x} ${-REVOLVER.guard.y})` : undefined;
  return (
    <Art box={[-34, -36, 96, 74]} scale={scale} className={`bit-revolver${className ? ` ${className}` : ""}`}>
      <g transform={shift}>
        <Drawn k={k} groups={[
          [["blob", "M-12,-2 C-14,8 -17,18 -16,27 L-3,28 C-3,18 -1,8 1,-2 Z", "var(--bit-wood)"]],
          [["cap", "M-11,-15 L-18,-23", 6, "var(--bit-metal-dark)"], ["cap", "M10,-12 L45,-12", 8, "var(--bit-metal)"],
            ["blob", "M-12,-17 Q-12,-19 -10,-19 L13,-19 Q15,-19 15,-17 L15,-1 Q15,1 13,1 L-10,1 Q-12,1 -12,-1 Z", "var(--bit-metal)"]],
        ]} />
        <path d={circle(REVOLVER.guard.x, REVOLVER.guard.y, 6)} className="bit-ink" fill="none" strokeWidth={4 * k} />
        <Tone d="M-10,-17 L13,-17 L13,-13 L-10,-13 Z" fill="var(--bit-iron-lit)" />
        <Tone d="M16,-14.5 L44,-14.5 L44,-13 L16,-13 Z" fill="var(--bit-iron-lit)" />
        <Line d="M-5,-15 L-5,-2 M2,-15 L2,-2 M9,-15 L9,-2" k={k} w={2.6} />
        <path d="M43,-16 L43,-18" className="bit-line" strokeWidth={4 * k} />
      </g>
    </Art>
  );
}

/* ── a whirl: the blur of something spun fast round a point (a revolver
   on a finger). Anchor: the point it spins round. ── */
export function Whirl({ r = 46, scale = 1, className = "" }) {
  const arc = (from, to, rr) => {
    const p = a => `${(Math.cos(a * Math.PI / 180) * rr).toFixed(1)},${(Math.sin(a * Math.PI / 180) * rr).toFixed(1)}`;
    return `M${p(from)}A${rr},${rr} 0 0 1 ${p(to)}`;
  };
  return (
    <Art box={[-r - 14, -r - 14, r * 2 + 28, r * 2 + 28]} scale={scale} className={`bit-whirl${className ? ` ${className}` : ""}`}>
      <path d={`M${-r},0a${r},${r} 0 1 0 ${r * 2},0a${r},${r} 0 1 0 ${-r * 2},0Z`} className="bit-whirl-disc" />
      {[[200, 330, r], [20, 150, r], [250, 320, r * 0.62], [70, 140, r * 0.62]].map(([a, b, rr], i) =>
        <path key={i} d={arc(a, b, rr)} className="bit-whirl-arc" strokeWidth={i < 2 ? 9 : 6} />)}
    </Art>
  );
}

/* ── the muzzle flash: a burst, hot in the middle. Anchor: its centre. ── */
export function MuzzleFlash({ scale = 1, className = "" }) {
  const k = 1 / scale;
  return (
    <Art box={[-80, -80, 160, 160]} scale={scale} className={`bit-flash${className ? ` ${className}` : ""}`}>
      <Drawn k={k} groups={[[["blob", starPath(9, 66, 28), "var(--bit-fire)"]]]} />
      <path d={starPath(9, 38, 17, -70)} style={{ fill:"var(--bit-fire-hot)" }} />
      <path d={circle(0, 0, 11)} style={{ fill:"var(--bone)" }} />
    </Art>
  );
}

/* ── a puff of smoke (or a cloud of dust): overlapping balls, one
   silhouette. Anchor: the middle of its foot. ── */
const PUFF = [[0, -18, 18], [17, -26, 15], [-15, -27, 14], [3, -40, 13]];
export function Puff({ scale = 1, fill = "var(--bit-smoke)", shade = null, className = "" }) {
  const k = 1 / scale;
  return (
    <Art box={[-42, -66, 84, 76]} scale={scale} className={`bit-puff${className ? ` ${className}` : ""}`}>
      <Drawn k={k} groups={[PUFF.map(([x, y, r]) => ["blob", circle(x, y, r), fill])]} />
      {shade && <Tone d={`M-22,-10 C-12,-2 12,-2 26,-12 C22,-2 10,4 0,4 C-12,4 -20,-2 -22,-10 Z`} fill={shade} />}
    </Art>
  );
}

/* ── dust: puffs flung from a point along the floor. The scene sets the
   instant on the node (--at, ms into the bit) and bits.css throws them;
   each puff's flight is its own --dx --dy and size. Anchor: the impact. ── */
export const DUST_FAN = Object.freeze([[-150, -40, 1.25], [-70, -86, 1], [0, -112, 0.85], [74, -88, 1.05], [156, -38, 1.3],
  [-110, -10, 0.8], [118, -12, 0.85]]);
/* something flat slapping the floor: dust squeezed out low to both sides */
export const DUST_LOW = Object.freeze([[-250, -18, 1.15], [-170, -40, 0.95], [-96, -14, 0.8], [96, -16, 0.8], [176, -42, 1],
  [256, -20, 1.15], [-30, -34, 0.65], [36, -30, 0.6]]);
export function Dust({ spread = 1, size = 1, puffs = DUST_FAN, at = 0, className = "", style }) {
  return (
    <div className={`bit-dust${className ? ` ${className}` : ""}`} style={{ "--at":`${Math.round(at)}ms`, ...style }}>
      {puffs.map(([dx, dy, s], i) => (
        <span key={i} className="bit-dust-puff" style={{ "--dx":`${Math.round(dx * spread)}px`, "--dy":`${Math.round(dy * spread)}px`,
          "--d":`${i * 18}ms` }}>
          <Puff scale={s * size} fill="var(--bit-dust)" shade="var(--bit-dust-shade)" />
        </span>
      ))}
    </div>
  );
}

/* ── a tumbleweed: a ball of dry brush. Anchor: its centre. ── */
const TWIGS = [[0, 0, 50, 32, 18], [0, 0, 46, 28, 78], [0, 0, 42, 36, 136], [8, -6, 30, 18, -32], [-10, 8, 26, 16, 58],
  [4, 10, 34, 14, 166], [-6, -10, 22, 14, 104]];
export function Tumbleweed({ scale = 1, className = "" }) {
  const k = 1 / scale;
  return (
    <Art box={[-70, -70, 140, 140]} scale={scale} className={`bit-tumbleweed${className ? ` ${className}` : ""}`}>
      <path d={circle(0, 0, 54)} className="bit-tumble-ball" />
      {TWIGS.map(([x, y, rx, ry, a], i) => <path key={`i${i}`} d={ellipse(x, y, rx, ry, a)} className="bit-ink" fill="none" strokeWidth={6 + 6 * k} />)}
      {TWIGS.map(([x, y, rx, ry, a], i) => <path key={`p${i}`} d={ellipse(x, y, rx, ry, a)} className="bit-twig" strokeWidth={6} />)}
      {[[58, -10], [-50, 30], [20, 56], [-30, -52], [46, 40]].map(([x, y], i) => <g key={`s${i}`}>
        <path d={`M${x * 0.8},${y * 0.8} L${x},${y}`} className="bit-ink" fill="none" strokeWidth={5 + 6 * k} />
        <path d={`M${x * 0.8},${y * 0.8} L${x},${y}`} className="bit-twig" strokeWidth={5} />
      </g>)}
    </Art>
  );
}

/* ── an anvil, horn to the left. Anchor: the middle of its base. ── */
export const ANVIL = Object.freeze({ w:276, h:124, top:-122 });
export function Anvil({ scale = 1, className = "" }) {
  const k = 1 / scale;
  return (
    <Art box={[-178, -136, 300, 146]} scale={scale} className={`bit-anvil${className ? ` ${className}` : ""}`}>
      <Drawn k={k} groups={[
        [["blob", "M-94,0 L-82,-22 L-48,-31 L48,-31 L82,-22 L94,0 L42,0 Q0,-16 -42,0 Z", "var(--bit-iron)"]],
        [["blob", "M-46,-30 C-35,-48 -35,-64 -48,-82 L48,-82 C35,-64 35,-48 46,-30 Z", "var(--bit-iron)"]],
        [["blob", "M-168,-114 C-150,-119 -128,-123 -106,-123 L110,-123 L110,-82 L-104,-82 C-128,-86 -150,-99 -168,-114 Z", "var(--bit-iron)"]],
      ]} />
      <Tone d="M-150,-114 C-132,-118 -120,-119 -104,-119 L106,-119 L106,-111 L-104,-111 C-122,-111 -138,-111 -150,-114 Z" fill="var(--bit-iron-lit)" />
      <Tone d="M-78,-20 L-48,-27 L48,-27 L52,-26 L-40,-26 Z" fill="var(--bit-iron-lit)" />
      <Line d="M64,-118 L64,-104 L78,-104" k={k} />
    </Art>
  );
}

/* ── a shadow on the floor, flat ink: a cast member's, or what is
   falling on it. Anchor: its centre. ── */
export const FloorShadow = ({ w, h, className = "", style }) =>
  <span className={`bit-floor-shadow${className ? ` ${className}` : ""}`} style={{ left:-w / 2, top:-h / 2, width:w, height:h, ...style }} />;

/* ── stars round a dizzy head: `count` small stars on an ellipse (rx, ry),
   circling on the bit's clock from --at. Anchor: the ellipse's centre. ── */
export function DizzyStars({ count = 3, rx = 110, ry = 26, at = 0, scale = 1, className = "" }) {
  return (
    <div className={`bit-dizzy${className ? ` ${className}` : ""}`} style={{ "--rx":`${rx}px`, "--ry":`${ry}px`, "--at":`${Math.round(at)}ms`,
      "--n":count }}>
      {Array.from({ length:count }, (_, i) => (
        <span key={i} className="bit-dizzy-star" style={{ "--i":i }}>
          <Art box={[-26, -26, 52, 52]} scale={scale}><Drawn k={1 / scale} line={5} groups={[[["blob", starPath(5, 19, 8.5), "var(--bit-star)"]]]} /></Art>
        </span>
      ))}
    </div>
  );
}

/* ── a sweat drop. Anchor: its tip. ── */
export function SweatDrop({ scale = 1, className = "" }) {
  const k = 1 / scale;
  return (
    <Art box={[-24, -6, 48, 60]} scale={scale} className={`bit-sweat${className ? ` ${className}` : ""}`}>
      <Drawn k={k} line={5} groups={[[["blob", "M0,0 C6,12 16,22 16,34 C16,44 9,50 0,50 C-9,50 -16,44 -16,34 C-16,22 -6,12 0,0 Z", "var(--bit-sweat)"]]]} />
      <Tone d="M-8,32 C-8,26 -5,22 -2,20 C-3,25 -4,30 -4,34 Z" fill="var(--bone)" />
    </Art>
  );
}

/* ── dark glasses, for the cool ones. Anchor: the bridge. Sized for a
   240 px chip's photo. ── */
export function Sunglasses({ scale = 1, className = "" }) {
  const k = 1 / scale;
  const lens = x => `M${x - 26},-10 L${x + 26},-10 C${x + 28},6 ${x + 18},16 ${x},16 C${x - 18},16 ${x - 28},6 ${x - 26},-10 Z`;
  return (
    <Art box={[-80, -24, 160, 48]} scale={scale} className={`bit-shades${className ? ` ${className}` : ""}`}>
      <Drawn k={k} groups={[[["blob", lens(-32), "var(--ink0)"], ["blob", lens(32), "var(--ink0)"], ["cap", "M-8,-8 L8,-8", 6, "var(--ink0)"]]]} />
      <Tone d="M-50,-6 L-38,-6 L-46,8 Z" fill="var(--bit-iron-lit)" />
      <Tone d="M14,-6 L26,-6 L18,8 Z" fill="var(--bit-iron-lit)" />
    </Art>
  );
}

/* ── speed lines: a fast thing's wake. Anchor: the front of the wake,
   the lines trailing to the right (mirror the node to trail left). ── */
export function SpeedLines({ length = 420, rows = [[-70, 1], [-34, 0.7], [0, 1], [36, 0.6], [72, 0.85]], className = "" }) {
  return (
    <Art box={[-10, -100, length + 20, 200]} className={`bit-speed${className ? ` ${className}` : ""}`}>
      {rows.map(([y, f], i) => <path key={i} d={`M${Math.round(length * (1 - f))},${y} L${length},${y}`} className="bit-speed-line" strokeWidth={8} />)}
    </Art>
  );
}

/* ── emanata: short strokes flung out from a point, the comic strip's
   mark for a noise or a start (a beep, a ding, a jolt). `rays` are
   [angle (degrees: 0 right, 90 down), from r, to r]; the default fans
   out to the left, each stroke clear of the point so they never read as
   an arrowhead. Anchor: the point. ── */
export const RAYS_LEFT = Object.freeze([[-140, 26, 58], [180, 30, 68], [140, 26, 58]]);
export function Emanata({ rays = RAYS_LEFT, width = 9, scale = 1, color = "var(--bone)", className = "" }) {
  const k = 1 / scale;
  const R = Math.max(...rays.map(ray => ray[2])) + width + CAST.line;
  const at = (deg, r) => { const a = deg * Math.PI / 180; return `${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`; };
  return (
    <Art box={[-R, -R, R * 2, R * 2]} scale={scale} className={`bit-emanata${className ? ` ${className}` : ""}`}>
      <Drawn k={k} line={5} groups={[rays.map(([deg, r0, r1]) => ["cap", `M${at(deg, r0)} L${at(deg, r1)}`, width, color])]} />
    </Art>
  );
}

/* ── a stack of chips in a player's color, seen a little from above,
   bone spots on every chip's edge. Anchor: the middle of its foot. ── */
export function ChipStack({ player, count = 10, width = 150, thick = 17, className = "" }) {
  const identity = usePlayerIdentity(player);
  const R = width / 2, ry = width * 0.14, t = thick;
  const jitter = i => [0, 2, -2, 3, -1, 1, -3, 2, 0, -2, 3, -1][i % 12];
  const chips = Array.from({ length:count }, (_, i) => ({ x:jitter(i), y:-i * t }));
  const band = ({ x, y }) => `M${x - R},${y - ry * 0.0} L${x - R},${y - t} A${R},${ry} 0 0 1 ${x + R},${y - t} L${x + R},${y} A${R},${ry} 0 0 1 ${x - R},${y} Z`;
  const top = chips[chips.length - 1];
  const tone = `color-mix(in srgb, ${identity.color} 72%, var(--bone))`;
  const dark = `color-mix(in srgb, ${identity.color} 62%, var(--ink0))`;
  const H = count * t + ry * 2 + 20;
  return (
    <Art box={[-R - 16, -H, width + 32, H + ry + 14]} className={`bit-stack${className ? ` ${className}` : ""}`}>
      {chips.map((c, i) => <path key={`i${i}`} d={band(c)} className="bit-ink" strokeWidth={CAST.line * 2} />)}
      <path d={ellipse(top.x, top.y - t, R, ry)} className="bit-ink" strokeWidth={CAST.line * 2} />
      {chips.map((c, i) => <g key={`c${i}`}>
        <path d={band(c)} style={{ fill:identity.color }} />
        <path d={`M${c.x + R * 0.62},${c.y - t + 2} L${c.x + R},${c.y - t + 2} L${c.x + R},${c.y} A${R},${ry} 0 0 1 ${c.x + R * 0.62},${c.y + ry * 0.78} Z`}
          style={{ fill:dark }} />
        {[-0.62, -0.06, 0.5].map((f, j) => <path key={j} d={`M${c.x + R * f},${c.y - t + 3 + ry * (1 - f * f) * 0.9} l${R * 0.16},0 l0,${t - 6} l${-R * 0.16},0 Z`}
          style={{ fill:"var(--bone)" }} />)}
        <path d={`M${c.x - R},${c.y} A${R},${ry} 0 0 0 ${c.x + R},${c.y}`} className="bit-line" fill="none" strokeWidth={3} />
      </g>)}
      <path d={ellipse(top.x, top.y - t, R, ry)} style={{ fill:tone }} />
      <path d={ellipse(top.x, top.y - t, R * 0.68, ry * 0.68)} className="bit-line" fill="none" strokeWidth={3} />
    </Art>
  );
}

/* ── a roadrunner, side on, facing left. Poses: run (legs a wheel of
   blur), stand, skid (heels dug in). Anchor: between its feet. ── */
export function Roadrunner({ pose = "stand", scale = 1, beak = "shut", className = "" }) {
  const k = 1 / scale;
  const legs = pose === "run" ? null : pose === "skid"
    ? [["cap", "M-6,-62 L-34,-8", 7, "var(--bit-beak)"], ["cap", "M8,-62 L-14,-6", 7, "var(--bit-beak)"],
      ["cap", "M-34,-8 L-58,-4", 7, "var(--bit-beak)"], ["cap", "M-14,-6 L-38,-2", 7, "var(--bit-beak)"]]
    : [["cap", "M-4,-62 L-12,-6", 7, "var(--bit-beak)"], ["cap", "M10,-62 L14,-6", 7, "var(--bit-beak)"],
      ["cap", "M-12,-6 L-34,-4", 7, "var(--bit-beak)"], ["cap", "M14,-6 L-8,-4", 7, "var(--bit-beak)"]];
  const open = beak === "open";
  return (
    <Art box={[-190, -230, 400, 250]} scale={scale} className={`bit-roadrunner is-${pose}${className ? ` ${className}` : ""}`}>
      {pose === "run" && <g className="bit-rr-wheel">
        {[0, 1, 2].map(i => <path key={i} d={ellipse(6, -40 + i * 2, 44 - i * 10, 34 - i * 8)} className="bit-rr-blur" strokeWidth={6} />)}
      </g>}
      {legs && <Drawn k={k} line={5} groups={[legs]} />}
      <Drawn k={k} groups={[
        /* the tail: long and up, three feathers */
        [["cap", "M58,-104 L172,-196", 26, "var(--bit-bird)"], ["cap", "M58,-100 L184,-170", 20, "var(--bit-bird)"]],
        /* body, neck and head */
        [["blob", "M-62,-112 C-40,-142 32,-146 74,-108 C86,-96 72,-70 40,-64 C0,-56 -50,-64 -66,-86 C-72,-96 -70,-104 -62,-112 Z", "var(--bit-bird)"],
          ["cap", "M-46,-112 L-88,-170", 30, "var(--bit-bird)"], ["blob", circle(-96, -176, 30), "var(--bit-bird)"]],
        /* the crest */
        [["blob", "M-104,-200 L-84,-232 L-80,-206 L-60,-228 L-66,-198 L-44,-210 L-62,-184 Z", "var(--bit-bird-crest)"]],
        /* the beak: long, to the left */
        [["blob", open ? "M-118,-186 L-182,-196 L-122,-174 Z" : "M-118,-184 L-186,-180 L-120,-170 Z", "var(--bit-beak)"],
          ...(open ? [["blob", "M-118,-170 L-176,-160 L-120,-160 Z", "var(--bit-beak)"]] : [])],
      ]} />
      {/* the pale belly, the streaks, the wing folded on the body */}
      <Tone d="M-58,-92 C-40,-70 0,-66 36,-70 C10,-60 -36,-62 -60,-82 Z" fill="var(--bit-bird-lit)" />
      <Tone d="M-84,-160 C-80,-140 -66,-122 -52,-112 L-62,-108 C-76,-120 -88,-140 -92,-158 Z" fill="var(--bit-bird-lit)" />
      <path d="M-30,-120 C0,-134 38,-126 56,-104 C30,-110 4,-112 -24,-104 Z" className="bit-ink" strokeWidth={4 * k} style={{ fill:"var(--bit-bird-crest)" }} />
      <Line d="M-20,-96 L-4,-100 M2,-88 L18,-92 M24,-84 L40,-88" k={k} w={3} />
      {/* the eye: a bright ring behind it (a roadrunner's bare patch), a dark pupil */}
      <path d={circle(-100, -182, 11)} className="bit-ink" strokeWidth={3 * k} style={{ fill:"var(--bone)" }} />
      <path d={circle(-104, -182, 5)} style={{ fill:"var(--ink0)" }} />
      <Tone d="M-90,-186 C-84,-188 -78,-184 -76,-178 C-82,-180 -86,-182 -90,-182 Z" fill="var(--bit-bird-crest)" />
    </Art>
  );
}

/* ═══ the slapstick bits' props (springglove, toohype, dynamite) ═══ */

/* ── a boxing glove from the side, punching right: a white laced cuff
   and a big red mitt, the thumb laid along its top. Anchor: the back of
   the cuff, at its middle (where a spring meets it). ── */
export const BOXING_GLOVE = Object.freeze({ front:160, cuff:44, h:132 });
export function BoxingGlove({ scale = 1, className = "" }) {
  const k = 1 / scale;
  return (
    <Art box={[-12, -86, 186, 158]} scale={scale} className={`bit-boxglove${className ? ` ${className}` : ""}`}>
      <Drawn k={k} groups={[
        [["blob", "M0,-28 Q0,-36 8,-36 L44,-39 L44,39 L8,36 Q0,36 0,28 Z", "var(--bit-glove)"]],
        [["blob", "M34,-40 C44,-66 96,-74 128,-60 C156,-48 166,-12 160,16 C154,46 124,62 90,60 C62,58 42,52 34,40 Z", "var(--bit-red)"]],
        [["cap", "M58,-41 C74,-56 100,-58 116,-50", 24, "var(--bit-red)"]],
      ]} />
      <Tone d="M38,36 C58,52 104,58 134,48 C150,40 158,28 160,16 C154,46 124,62 90,60 C62,58 44,52 38,36 Z" fill="var(--bit-red-dark)" />
      <Tone d="M122,-56 C146,-46 158,-26 159,-4 C150,-22 138,-38 120,-46 Z" fill="var(--bit-red-lit)" />
      <Tone d="M66,-50 C78,-58 96,-60 108,-56 C96,-54 82,-52 70,-46 Z" fill="var(--bit-red-lit)" />
      <Tone d="M2,22 L44,26 L44,39 L8,36 Q0,36 0,28 Z" fill="var(--bit-glove-shade)" />
      <Line d="M12,-18 L28,-8 M28,-18 L12,-8 M12,6 L28,16 M28,6 L12,16" k={k} w={3.2} />
    </Art>
  );
}

/* ── an accordion spring along +x, drawn at its full stretch (`length`);
   a scene scales it in X to pull it in, so it lives coiled inside its box
   when short. Anchor: its back end, at its middle. ── */
export function Spring({ length = 400, amp = 20, pitch = 46, className = "" }) {
  const n = Math.max(2, Math.round(length / pitch));
  const half = length / (n * 2);
  const pts = [[0, 0], ...Array.from({ length:n * 2 }, (_, j) => [half / 2 + j * half, j % 2 ? amp : -amp]), [length, 0]];
  const d = `M${pts.map(([x, y]) => `${x.toFixed(1)},${y}`).join("L")}`;
  return (
    <Art box={[-10, -amp - 14, length + 20, amp * 2 + 28]} className={`bit-spring${className ? ` ${className}` : ""}`}>
      <path d={d} className="bit-ink" fill="none" strokeWidth={17} />
      <path d={d} fill="none" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" style={{ stroke:"var(--bit-metal)" }} />
      <path d={d} fill="none" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" style={{ stroke:"var(--bit-iron-lit)" }}
        transform="translate(0 -1.6)" />
    </Art>
  );
}

/* ── the launcher: a steel box on a wooden pistol grip, a flared horn at
   the front where the spring comes out, a port at the back, and a big
   red button on top (its own node, .bit-punch-button, to press). Anchor:
   where the grip meets the box (a fist closes under it). ── */
export const PUNCH_BOX = Object.freeze({ nozzle:{ x:80, y:-41 }, rear:{ x:-64, y:-41 }, button:{ x:6, y:-78 }, top:-110 });
export function PunchBox({ scale = 1, className = "" }) {
  const k = 1 / scale;
  const { x:bx, y:by } = PUNCH_BOX.button;
  return (
    <span className={`bit-punchbox${className ? ` ${className}` : ""}`}>
      <span className="bit-punch-button" style={{ left:bx * scale, top:by * scale }}>
        <Art box={[-34, -40, 68, 50]} scale={scale}>
          <Drawn k={k} groups={[
            [["blob", "M-10,2 L10,2 L10,-10 L-10,-10 Z", "var(--bit-metal-dark)"]],
            [["blob", "M-24,-8 C-24,-34 24,-34 24,-8 Z", "var(--bit-red)"]],
          ]} />
          <Tone d="M-15,-14 C-12,-24 -2,-27 6,-26 C-2,-23 -8,-19 -10,-12 Z" fill="var(--bit-red-lit)" />
        </Art>
      </span>
      <Art box={[-72, -88, 160, 124]} scale={scale}>
        <Drawn k={k} groups={[
          [["blob", "M-12,-4 C-14,8 -17,18 -16,28 L-2,29 C-2,18 0,8 2,-4 Z", "var(--bit-wood)"]],
          [["blob", "M-50,-54 L-64,-58 L-64,-24 L-50,-28 Z", "var(--bit-metal-dark)"],
            ["blob", "M54,-56 L80,-66 L80,-16 L54,-26 Z", "var(--bit-metal-dark)"]],
          [["blob", "M-46,-2 Q-52,-2 -52,-8 L-52,-72 Q-52,-78 -46,-78 L50,-78 Q56,-78 56,-72 L56,-8 Q56,-2 50,-2 Z", "var(--bit-metal)"]],
        ]} />
        <Tone d="M-48,-74 L52,-74 L52,-66 L-48,-66 Z" fill="var(--bit-iron-lit)" />
        <Tone d="M-48,-14 L52,-14 L52,-8 Q52,-6 50,-6 L-46,-6 Q-48,-6 -48,-8 Z" fill="var(--bit-metal-dark)" />
        <path d={circle(80, -41, 10)} style={{ fill:"var(--ink0)" }} />
        <path d={`${circle(-40, -26, 4)}${circle(44, -26, 4)}`} style={{ fill:"var(--bit-metal-dark)" }} />
      </Art>
    </span>
  );
}

/* ── a twinkle: the ping of something very far away. A long four-point
   star over a short one. Anchor: its centre. ── */
export function Twinkle({ r = 34, line = 5, scale = 1, className = "" }) {
  const k = 1 / scale;
  return (
    <Art box={[-r - 12, -r - 12, r * 2 + 24, r * 2 + 24]} scale={scale} className={`bit-twinkle${className ? ` ${className}` : ""}`}>
      <Drawn k={k} line={line} groups={[[["blob", starPath(4, r * 0.6, r * 0.16, -45), "var(--bit-star)"]],
        [["blob", starPath(4, r, r * 0.18), "var(--bit-star)"]]]} />
      <path d={starPath(4, r * 0.5, r * 0.13)} style={{ fill:"var(--bit-fire-hot)" }} />
      <path d={circle(0, 0, r * 0.12)} style={{ fill:"var(--bone)" }} />
    </Art>
  );
}

/* ── a birthday cupcake whose candle is a stick of dynamite: a pleated
   paper cup, a swirl of frosting with sprinkles, the red stick standing
   in it. The fuse is its own (Fuse). Anchor: the middle of its foot. ── */
export const CUPCAKE = Object.freeze({ fuseBase:{ x:0, y:-146 } });
export function Cupcake({ scale = 1, className = "" }) {
  const k = 1 / scale;
  return (
    <Art box={[-56, -162, 112, 172]} scale={scale} className={`bit-cupcake${className ? ` ${className}` : ""}`}>
      <Drawn k={k} groups={[
        [["blob", "M-15,-58 L-15,-138 Q-15,-148 0,-148 Q15,-148 15,-138 L15,-58 Z", "var(--bit-red)"]],
        [["blob", "M-30,0 L-38,-42 L38,-42 L30,0 Z", "var(--bit-paper)"]],
        [["blob", "M-44,-38 C-52,-54 -36,-66 -22,-62 C-20,-78 2,-84 12,-72 C26,-80 46,-66 40,-52 C50,-50 50,-38 44,-36 C20,-30 -20,-30 -44,-38 Z",
          "var(--bit-frosting)"]],
      ]} />
      <Line d="M-24,-36 L-20,-4 M-12,-36 L-10,-4 M0,-36 L0,-4 M12,-36 L10,-4 M24,-36 L20,-4" k={k} w={3} />
      <Tone d="M-11,-62 L-11,-138 Q-11,-144 -4,-145 L-4,-62 Z" fill="var(--bit-red-lit)" />
      <Tone d="M-15,-120 L15,-120 L15,-112 L-15,-112 Z" fill="var(--bit-red-dark)" />
      <Tone d="M-15,-86 L15,-86 L15,-78 L-15,-78 Z" fill="var(--bit-red-dark)" />
      {[[-30, -46, -12, "var(--art-turquoise)"], [-16, -60, 30, "var(--sun)"], [22, -62, -30, "var(--art-turquoise)"], [32, -46, 20, "var(--art-rose)"],
        [-36, -50, 60, "var(--art-rose)"], [6, -40, 0, "var(--sun)"]].map(([x, y, a, fill], i) =>
        <path key={i} d={`M${x - 5},${y - 2} L${x + 5},${y - 2} L${x + 5},${y + 2} L${x - 5},${y + 2} Z`} transform={`rotate(${a} ${x} ${y})`}
          style={{ fill }} />)}
    </Art>
  );
}

/* ── a fuse: a curl of cord up from a stick, in segments a scene burns
   one by one (each segment its own node, .bit-fuse-seg, --seg 0 at the
   tip). FUSE.points run from the tip down to the base. Anchor: the base. ── */
export const FUSE = Object.freeze({ points:Object.freeze([[14, -46], [4, -36], [10, -24], [2, -12], [0, 0]]) });
export function Fuse({ scale = 1, className = "" }) {
  const k = 1 / scale;
  const pts = FUSE.points;
  return (
    <span className={`bit-fuse${className ? ` ${className}` : ""}`}>
      {pts.slice(0, -1).map(([x, y], i) => {
        const [x2, y2] = pts[i + 1];
        const d = `M${x},${y} Q${(x + x2) / 2 + (i % 2 ? 4 : -4)},${(y + y2) / 2} ${x2},${y2}`;
        return (
          <span key={i} className="bit-fuse-seg" style={{ "--seg":i }}>
            <Art box={[-14, -56, 40, 64]} scale={scale}>
              <Drawn k={k} line={4} groups={[[["cap", d, 6, "var(--bit-fuse)"]]]} />
            </Art>
          </span>
        );
      })}
    </span>
  );
}

/* ── the spark at a lit fuse's tip: a hot little burst. Anchor: its
   centre. ── */
export function Spark({ scale = 1, className = "" }) {
  const k = 1 / scale;
  return (
    <Art box={[-30, -30, 60, 60]} scale={scale} className={`bit-spark${className ? ` ${className}` : ""}`}>
      <Drawn k={k} line={4} groups={[[["blob", starPath(8, 22, 8, -80), "var(--bit-fire)"]]]} />
      <path d={starPath(8, 12, 5, -60)} style={{ fill:"var(--bit-fire-hot)" }} />
      <path d={circle(0, 0, 4)} style={{ fill:"var(--bone)" }} />
    </Art>
  );
}

/* ── a kitchen match, held upright in a fist: the stick and its red
   head. Anchor: the foot of the stick. ── */
export const MATCH = Object.freeze({ head:{ x:0, y:-54 } });
export function Match({ scale = 1, className = "" }) {
  const k = 1 / scale;
  return (
    <Art box={[-18, -72, 36, 86]} scale={scale} className={`bit-match${className ? ` ${className}` : ""}`}>
      <Drawn k={k} line={5} groups={[[["blob", "M-4,8 L-4,-46 L4,-46 L4,8 Z", "var(--bit-match)"]],
        [["blob", ellipse(0, -52, 8, 11), "var(--bit-red)"]]]} />
    </Art>
  );
}

/* ── a flame: a match's, a candle's. Anchor: its foot. ── */
export function Flame({ scale = 1, className = "" }) {
  const k = 1 / scale;
  return (
    <Art box={[-28, -78, 56, 86]} scale={scale} className={`bit-flame${className ? ` ${className}` : ""}`}>
      <Drawn k={k} line={5} groups={[[["blob", "M0,2 C-16,0 -20,-18 -10,-34 C-4,-44 0,-54 2,-66 C10,-50 20,-38 18,-18 C16,-4 8,2 0,2 Z",
        "var(--bit-fire)"]]]} />
      <path d="M1,-4 C-8,-6 -10,-16 -4,-26 C-1,-31 1,-36 2,-42 C6,-34 10,-26 9,-14 C8,-7 5,-4 1,-4 Z" style={{ fill:"var(--bit-fire-hot)" }} />
    </Art>
  );
}

/* ── a little round party table: a white cloth with a scalloped hem
   over a dark pedestal. Anchor: the middle of its foot. ── */
export const PARTY_TABLE = Object.freeze({ top:-132, half:108 });
const CLOTH = (() => {
  const w = 222 / 7;
  let d = "M-108,-132 A108,18 0 0 1 108,-132 L111,-100";
  for (let i = 0; i < 7; i++) { const x0 = 111 - i * w, x1 = x0 - w; d += ` Q${((x0 + x1) / 2).toFixed(1)},-84 ${x1.toFixed(1)},-100`; }
  return `${d} Z`;
})();
export function PartyTable({ scale = 1, className = "" }) {
  const k = 1 / scale;
  return (
    <Art box={[-124, -158, 248, 170]} scale={scale} className={`bit-table${className ? ` ${className}` : ""}`}>
      <Drawn k={k} groups={[
        [["blob", "M-9,-100 L9,-100 L12,-14 L-12,-14 Z", "var(--bit-table-leg)"],
          ["blob", "M-50,0 C-50,-8 -36,-14 -20,-16 L20,-16 C36,-14 50,-8 50,0 Z", "var(--bit-table-leg)"]],
        [["blob", CLOTH, "var(--bit-cloth)"]],
      ]} />
      <path d={ellipse(0, -132, 102, 14)} style={{ fill:"var(--bit-cloth-lit)" }} />
      <Line d="M-62,-117 L-66,-98 M0,-115 L0,-96 M62,-117 L66,-98" k={k} w={3} />
    </Art>
  );
}

/* ── a blast: the fireball of something going off, ragged and hot in
   the middle. Anchor: its centre. ── */
const BLAST_RS = [1, 0.74, 0.92, 0.66, 1.06, 0.7, 0.88, 0.62, 1, 0.76, 0.94, 0.64, 1.04, 0.72];
const blastPath = (r, ri, turn = -90) => {
  const n = BLAST_RS.length, out = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (turn + i * 180 / n) * Math.PI / 180, rr = i % 2 ? ri * (0.9 + (i % 3) * 0.08) : r * BLAST_RS[(i / 2) % n];
    out.push(`${(Math.cos(a) * rr).toFixed(1)},${(Math.sin(a) * rr).toFixed(1)}`);
  }
  return `M${out.join("L")}Z`;
};
export function Blast({ r = 200, scale = 1, className = "" }) {
  const k = 1 / scale;
  return (
    <Art box={[-r * 1.1 - 12, -r * 1.1 - 12, r * 2.2 + 24, r * 2.2 + 24]} scale={scale} className={`bit-blast${className ? ` ${className}` : ""}`}>
      <Drawn k={k} groups={[[["blob", blastPath(r, r * 0.58), "var(--bit-fire)"]]]} />
      <path d={blastPath(r * 0.68, r * 0.4, -76)} style={{ fill:"var(--bit-fire-hot)" }} />
      <path d={circle(0, 0, r * 0.26)} style={{ fill:"var(--bone)" }} />
    </Art>
  );
}

/* ── soot over a chip: its face and its edge gone black, the photo still
   showing faintly through, a few smudges. Sized for a chip of `size` with
   its edge `edge` below the face; hung on the chip's own box. ── */
export function Soot({ size = CAST.size, edge = 12, className = "" }) {
  const r = size / 2;
  return (
    <svg className={`bit-soot${className ? ` ${className}` : ""}`} width={size} height={size + edge} viewBox={`0 0 ${size} ${size + edge}`}
      style={{ position:"absolute", left:0, top:0, overflow:"visible" }} aria-hidden="true">
      <path d={`${circle(r, r + edge, r - 0.5)}${circle(r, r, r - 0.5)}`} style={{ fill:"var(--bit-soot)" }} opacity=".8" />
      <path d={`${ellipse(r * 0.72, r * 0.64, r * 0.3, r * 0.1, -24)}${ellipse(r * 1.3, r * 1.36, r * 0.24, r * 0.08, 18)}`}
        style={{ fill:"var(--bit-soot-lit)" }} opacity=".55" />
    </svg>
  );
}
