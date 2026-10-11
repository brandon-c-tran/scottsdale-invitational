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

/* ══ the deadpan desert's props (Oct 10: butte, sunset, statue, vulture) ══ */

const pts = list => `M${list.map(([x, y]) => `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`).join("L")}Z`;
/* rock in the session's painting inks (inside a "tv-desert" data-phase
   wrapper), else the afternoon's */
export const ROCK = Object.freeze({ lit:"var(--d-mesa, var(--bit-rock))", shade:"var(--d-shade, var(--bit-rock-shade))",
  under:"color-mix(in srgb, var(--d-shade, var(--bit-rock-shade)) 58%, var(--ink0))" });

/* ── a slab of rock cut from the painting: its outline in the session's
   lit mesa ink, its shade face, detail lines (strata). The scene wraps its
   rock in class "tv-desert" with data-phase, so the inks are the painting's
   own (--d-mesa, --d-shade; cast.css --bit-rock* off the painting).
   `points` and `shade` are [[x, y], ...] from the anchor; `children` draw
   over it in the same coordinates (a crack). Anchor: its 0 0. ── */
export function Slab({ points, shade = null, tone = null, lines = null, className = "", children }) {
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  const pad = CAST.line + 6;
  const box = [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) - Math.min(...xs) + pad * 2,
    Math.max(...ys) - Math.min(...ys) + pad * 2];
  return (
    <Art box={box} className={`bit-slab${className ? ` ${className}` : ""}`}>
      <Drawn groups={[[["blob", pts(points), ROCK.lit]]]} />
      {shade && <Tone d={pts(shade)} fill={ROCK.shade} />}
      {tone && <Tone d={pts(tone)} fill={ROCK.under} />}
      {lines && <Line d={lines} />}
      {children}
    </Art>
  );
}

/* ── a stone plinth: a cornice, the die, a base, lit on the left like the
   painting's buttes. Anchor: the middle of its foot. ── */
export function Plinth({ width = 300, height = 200, className = "" }) {
  const w = width, h = height, half = w / 2;
  const baseH = h * 0.17, corH = h * 0.2, die = half * 0.78;
  const yb = -baseH, yc = -h + corH;
  const face = (x0, x1, y0, y1) => [[x0 + (x1 - x0) * 0.62, y0], [x1, y0], [x1, y1], [x0 + (x1 - x0) * 0.62, y1]];
  const parts = [
    /* base, die, cornice: each lit, its shade face on the right */
    { o:[[-half, 0], [-half, yb + 6], [-half + 8, yb], [half - 8, yb], [half, yb + 6], [half, 0]], s:face(-half, half, yb, 0) },
    { o:[[-die, yb], [-die, yc], [die, yc], [die, yb]], s:face(-die, die, yc, yb) },
    { o:[[-half - 10, yc], [-half - 10, -h + 8], [-half - 2, -h], [half + 2, -h], [half + 10, -h + 8], [half + 10, yc]],
      s:face(-half - 10, half + 10, -h, yc) },
  ];
  return (
    <Art box={[-half - 26, -h - 18, w + 52, h + 30]} className={`bit-plinth${className ? ` ${className}` : ""}`}>
      {parts.map((part, i) => <g key={i}>
        <Drawn groups={[[["blob", pts(part.o), ROCK.lit]]]} />
        <Tone d={pts(part.s)} fill={ROCK.shade} />
      </g>)}
      {/* the cornice's molding and the die's sunk panel */}
      <Line d={`M${-half - 6},${yc - corH * 0.42} L${half + 6},${yc - corH * 0.42} M${-die + 22},${yb - 22} L${-die + 22},${yc + 22} L${die - 22},${yc + 22}`} />
      <Tone d={pts([[-die + 22, yb - 22], [die - 22, yb - 22], [die - 22, yc + 22], [die - 30, yc + 30], [die - 30, yb - 30], [-die + 22, yb - 30]])}
        fill={ROCK.under} />
      {/* the light catching the cornice's top edge */}
      <path d={`M${-half + 2},${-h + 6} L${half * 0.2},${-h + 6}`} className="bit-plinth-lit" strokeWidth={5} />
    </Art>
  );
}

/* ── a cactus wren, side on, facing left: brown, a bold white brow, a long
   curved bill, a spotted breast, its barred tail cocked. Poses: perch,
   fluff (a round ball of feathers), fly (wings up), flap (wings down).
   Anchor: between its feet (in flight, under its middle). ── */
export function Wren({ pose = "perch", scale = 1, className = "" }) {
  const k = 1 / scale;
  const flying = pose === "fly" || pose === "flap";
  const fluff = pose === "fluff";
  const body = fluff ? "M-30,-34 C-34,-60 -6,-74 16,-66 C38,-58 44,-34 34,-16 C24,-2 -4,-2 -18,-8 C-28,-14 -30,-24 -30,-34 Z"
    : "M-30,-40 C-32,-58 -10,-66 10,-60 C26,-54 34,-38 28,-24 C22,-12 0,-10 -14,-14 C-26,-18 -30,-28 -30,-40 Z";
  const head = fluff ? [-26, -48, 14] : [-28, -50, 15];
  const wings = pose === "fly" ? [["blob", "M-2,-56 C-10,-84 -2,-108 18,-118 C20,-100 22,-80 12,-58 Z", "var(--bit-wren)"],
    ["blob", "M8,-58 C10,-88 26,-104 46,-106 C40,-88 30,-70 18,-56 Z", "var(--bit-wren)"]]
    : pose === "flap" ? [["blob", "M-4,-40 C-14,-22 -14,0 -2,14 C6,-4 12,-22 10,-40 Z", "var(--bit-wren)"]] : [];
  return (
    <Art box={[-76, -128, 152, 148]} scale={scale} className={`bit-wren is-${pose}${className ? ` ${className}` : ""}`}>
      {!flying && <Drawn k={k} line={5} groups={[[["cap", "M-4,-14 L-8,0", 4, "var(--ink0)"], ["cap", "M6,-14 L8,0", 4, "var(--ink0)"]]]} />}
      <Drawn k={k} line={5} groups={[
        /* the tail, cocked up */
        [["blob", fluff ? "M24,-30 L52,-66 L62,-58 L34,-20 Z" : "M18,-30 L50,-62 L60,-54 L30,-20 Z", "var(--bit-wren)"]],
        [["blob", body, "var(--bit-wren)"], ["blob", circle(...head), "var(--bit-wren)"],
          ["cap", fluff ? "M-38,-48 Q-50,-47 -58,-41" : "M-42,-51 Q-54,-50 -62,-44", 4.5, "var(--bit-wren-dark)"]],
        ...(wings.length ? [wings] : []),
      ]} />
      {/* the breast, pale and spotted; the brow; the eye; streaks on the back */}
      <Tone d={fluff ? "M-28,-30 C-24,-12 0,-6 18,-12 C4,-20 -14,-22 -28,-30 Z" : "M-28,-34 C-24,-18 -6,-14 12,-18 C2,-24 -14,-26 -28,-34 Z"}
        fill="var(--bit-wren-lit)" />
      {(fluff ? [[-20, -22], [-10, -16], [0, -14], [-14, -26]] : [[-22, -28], [-14, -24], [-6, -21], [-16, -31]])
        .map(([x, y], i) => <path key={i} d={circle(x, y, 2.4)} style={{ fill:"var(--bit-wren-dark)" }} />)}
      <Tone d={fluff ? "M-38,-54 C-30,-58 -18,-58 -10,-52 C-18,-54 -28,-54 -38,-50 Z" : "M-41,-56 C-33,-60 -21,-60 -13,-54 C-21,-56 -31,-56 -41,-52 Z"}
        fill="var(--bone)" />
      <path d={circle(fluff ? -30 : -32, fluff ? -48 : -50, 3.4)} style={{ fill:"var(--ink0)" }} />
      {!flying && <Line d={fluff ? "M2,-50 L14,-46 M6,-40 L20,-36" : "M0,-50 L12,-46 M4,-42 L18,-38"} k={k} w={2.6} />}
      <Line d={fluff ? "M40,-50 L50,-44 M46,-58 L56,-52" : "M36,-46 L46,-40 M42,-54 L52,-48"} k={k} w={2.6} />
    </Art>
  );
}

/* ── a turkey vulture, side on, facing left: a dark cloak of folded wings,
   silver edges to its flight feathers, a feather ruff, a small bald red
   head and an ivory hooked beak, a small dark eye. Poses: stand (hunched),
   hold (its wings forward, as hands at a table), glide (wings raised, legs
   down to land), flap (wings beating down). VULTURE says where its beak
   tip, its neck and its wingtips' grips sit (from its feet). Anchor:
   between its feet. ── */
export const VULTURE = Object.freeze({ neck:{ x:-64, y:-182 }, fork:{ x:-74, y:-120 }, knife:{ x:-100, y:-128 }, beak:{ x:-130, y:-194 } });
const V_HEAD = [
  /* the bare neck, the head, the hooked beak (upper and lower) */
  [["cap", "M-38,-174 L-66,-196", 22, "var(--bit-vulture-head)"],
    ["blob", "M-60,-213 C-72,-221 -98,-220 -106,-208 C-110,-200 -106,-190 -96,-188 C-84,-186 -66,-188 -58,-195 C-53,-201 -54,-208 -60,-213 Z",
      "var(--bit-vulture-head)"]],
  [["blob", "M-102,-210 C-114,-213 -126,-208 -130,-198 C-131,-192 -128,-185 -124,-186 C-124,-191 -120,-196 -112,-197 L-102,-196 Z",
    "var(--bit-vulture-beak)"], ["blob", "M-104,-194 L-118,-195 C-114,-190 -108,-188 -102,-190 Z", "var(--bit-vulture-beak)"]],
];
const V_BODY = "M-46,-118 C-52,-160 -26,-206 26,-216 C76,-226 124,-192 134,-140 C140,-106 128,-74 96,-64 C60,-54 4,-58 -22,-74 C-38,-84 -44,-100 -46,-118 Z";
const V_RUFF = "M-60,-158 L-56,-178 L-44,-170 L-40,-192 L-26,-180 L-16,-198 L-6,-180 L6,-192 L6,-168 C-8,-148 -42,-142 -60,-158 Z";
export function Vulture({ pose = "stand", scale = 1, className = "" }) {
  const k = 1 / scale;
  const standing = pose === "stand" || pose === "hold";
  const legs = standing
    ? [["cap", "M-8,-66 L-12,-6", 10, "var(--bit-vulture-leg)"], ["cap", "M14,-64 L18,-6", 10, "var(--bit-vulture-leg)"],
      ["cap", "M-12,-5 L-34,-1", 7, "var(--bit-vulture-leg)"], ["cap", "M-12,-5 L2,-1", 7, "var(--bit-vulture-leg)"],
      ["cap", "M18,-5 L-4,-1", 7, "var(--bit-vulture-leg)"], ["cap", "M18,-5 L32,-1", 7, "var(--bit-vulture-leg)"]]
    : [["cap", "M-4,-98 L-30,-40", 10, "var(--bit-vulture-leg)"], ["cap", "M18,-96 L0,-36", 10, "var(--bit-vulture-leg)"],
      ["cap", "M-30,-40 L-52,-30", 7, "var(--bit-vulture-leg)"], ["cap", "M-30,-40 L-40,-20", 7, "var(--bit-vulture-leg)"],
      ["cap", "M0,-36 L-20,-24", 7, "var(--bit-vulture-leg)"], ["cap", "M0,-36 L-6,-16", 7, "var(--bit-vulture-leg)"]];
  /* a wing raised or beaten: the arm of it, then its fingered primaries */
  const wing = (arm, fingers, fill = "var(--bit-vulture)") => [["blob", arm, fill], ...fingers.map(d => ["cap", d, 13, fill])];
  const farWing = pose === "glide" ? wing("M40,-170 C70,-230 100,-280 140,-306 C150,-280 140,-240 116,-200 C100,-176 80,-160 56,-150 Z",
    ["M136,-300 L170,-322", "M132,-286 L172,-300", "M126,-268 L168,-276"])
    : pose === "flap" ? wing("M40,-160 C80,-150 120,-120 150,-80 C130,-74 110,-90 86,-110 C70,-124 54,-140 40,-150 Z",
      ["M146,-84 L178,-60", "M134,-82 L160,-50", "M120,-90 L138,-56"])
      : pose === "hold" ? [["cap", "M-4,-150 Q-40,-120 -94,-130", 30, "var(--bit-vulture)"], ["cap", "M-92,-130 L-108,-136", 11, "var(--bit-vulture)"],
        ["cap", "M-94,-124 L-110,-124", 11, "var(--bit-vulture)"]] : null;
  const nearWing = pose === "glide" ? wing("M10,-176 C-20,-236 -40,-290 -30,-336 C-6,-318 10,-276 20,-236 C26,-210 30,-190 30,-170 Z",
    ["M-30,-332 L-38,-372", "M-20,-326 L-16,-366", "M-10,-316 L4,-352"])
    : pose === "flap" ? wing("M14,-160 C-20,-150 -70,-120 -110,-70 C-90,-62 -60,-86 -30,-108 C-10,-124 6,-140 20,-150 Z",
      ["M-106,-74 L-140,-50", "M-94,-70 L-120,-38", "M-80,-74 L-96,-40"])
      : pose === "hold" ? [["cap", "M30,-150 Q0,-104 -66,-118", 34, "var(--bit-vulture)"], ["cap", "M-64,-124 L-82,-130", 12, "var(--bit-vulture)"],
        ["cap", "M-66,-114 L-84,-116", 12, "var(--bit-vulture)"]] : null;
  const body = standing ? V_BODY
    : "M-40,-150 C-36,-180 0,-196 50,-190 C96,-184 130,-160 128,-130 C126,-104 100,-96 60,-98 C20,-100 -20,-110 -34,-126 C-40,-134 -42,-142 -40,-150 Z";
  return (
    <Art box={[-190, -390, 400, 410]} scale={scale} className={`bit-vulture is-${pose}${className ? ` ${className}` : ""}`}>
      {farWing && <Drawn k={k} groups={[farWing.map(([kind, d, a, b]) => kind === "cap" ? [kind, d, a, "var(--bit-vulture-far)"] : [kind, d, "var(--bit-vulture-far)"])]} />}
      <Drawn k={k} line={5} groups={[legs]} />
      <Drawn k={k} groups={[
        /* the tail, then the primaries' tips past it */
        [["blob", standing ? "M70,-70 L120,-26 L106,-24 L100,-14 L60,-60 Z" : "M110,-140 L176,-118 L164,-108 L168,-96 L112,-112 Z", "var(--bit-vulture)"]],
        ...(standing ? [[["blob", "M96,-98 L150,-40 L138,-42 L142,-28 L126,-34 L126,-20 L110,-32 L90,-70 Z", "var(--bit-vulture-quill)"]]] : []),
        [["blob", body, "var(--bit-vulture)"]],
        [["blob", standing ? V_RUFF : "M-48,-166 L-44,-184 L-32,-176 L-28,-196 L-14,-184 L-4,-200 L4,-182 L14,-190 L12,-166 C-2,-150 -34,-148 -48,-166 Z",
          "var(--bit-vulture)"]],
        ...V_HEAD,
      ]} />
      {/* the light on the cloak, the silver edge of the folded wing, the coverts */}
      {standing && <>
        <Tone d="M-38,-150 C-30,-186 4,-206 40,-208 C10,-200 -16,-182 -28,-150 Z" fill="var(--bit-vulture-lit)" />
        <Tone d="M-34,-92 C-8,-72 44,-66 96,-70 C114,-72 128,-84 133,-100 C120,-86 96,-82 64,-82 C30,-82 -2,-86 -30,-102 Z" fill="var(--bit-vulture-quill)" />
        <Line d="M8,-162 C24,-152 42,-150 58,-154 M18,-132 C38,-120 60,-118 82,-124" k={k} w={3} />
      </>}
      {/* the head's wrinkles, a nostril, the eye with its one point of light */}
      <Line d="M-70,-214 C-68,-206 -68,-198 -72,-192 M-62,-210 C-60,-204 -61,-198 -64,-194 M-108,-205 L-114,-205" k={k} w={2.6} />
      <path d={circle(-86, -205, 5.5)} style={{ fill:"var(--ink0)" }} />
      <path d={circle(-87.6, -206.8, 1.8)} style={{ fill:"var(--bone)" }} />
      {nearWing && <Drawn k={k} groups={[nearWing]} />}
      {pose === "glide" && <Line d="M-20,-300 C-14,-270 -2,-240 12,-214 M120,-276 C104,-244 88,-214 68,-190" k={k} w={3} />}
    </Art>
  );
}

/* ── a napkin, tucked in by one corner and hanging: Anchor: the tucked
   corner. ── */
export function Napkin({ scale = 1, className = "" }) {
  const k = 1 / scale;
  return (
    <Art box={[-56, -16, 112, 104]} scale={scale} className={`bit-napkin${className ? ` ${className}` : ""}`}>
      <Drawn k={k} line={5} groups={[[["blob", "M-6,-4 C-24,10 -40,40 -44,74 C-14,82 18,82 44,72 C36,40 20,10 6,-4 C2,-8 -2,-8 -6,-4 Z",
        "var(--bit-napkin)"]]]} />
      <Tone d="M8,6 C20,26 32,50 38,70 C30,72 24,72 20,72 C18,50 14,26 8,6 Z" fill="var(--bit-napkin-fold)" />
      <Line d="M-2,6 C-8,30 -12,52 -12,76 M0,4 C6,24 8,50 10,76" k={k} w={2.6} />
    </Art>
  );
}

/* ── a fork and a knife, held upright. Anchor: where the hand grips. ── */
export function Fork({ scale = 1, className = "" }) {
  const k = 1 / scale;
  return (
    <Art box={[-26, -120, 52, 160]} scale={scale} className={`bit-fork${className ? ` ${className}` : ""}`}>
      <Drawn k={k} line={5} groups={[[["cap", "M0,30 L0,-40", 9, "var(--bit-metal)"],
        ["blob", "M-15,-40 C-15,-56 15,-56 15,-40 C15,-30 8,-26 0,-26 C-8,-26 -15,-30 -15,-40 Z", "var(--bit-metal)"],
        ["cap", "M-12,-46 L-12,-98", 5, "var(--bit-metal)"], ["cap", "M-4,-48 L-4,-102", 5, "var(--bit-metal)"],
        ["cap", "M4,-48 L4,-102", 5, "var(--bit-metal)"], ["cap", "M12,-46 L12,-98", 5, "var(--bit-metal)"]]]} />
      <path d="M-2,26 L-2,-36" className="bit-shine" strokeWidth={2.6 * k} />
    </Art>
  );
}
export function Knife({ scale = 1, className = "" }) {
  const k = 1 / scale;
  return (
    <Art box={[-24, -124, 48, 164]} scale={scale} className={`bit-knife${className ? ` ${className}` : ""}`}>
      <Drawn k={k} line={5} groups={[[["cap", "M0,30 L0,-14", 11, "var(--bit-metal-dark)"],
        ["blob", "M-7,-16 L-7,-96 C-7,-104 4,-108 9,-100 C12,-80 10,-40 7,-16 Z", "var(--bit-metal)"]]]} />
      <path d="M-1,-22 L-1,-92" className="bit-shine" strokeWidth={2.6 * k} />
    </Art>
  );
}

/* ── a glint: a four-point sparkle off something polished. Anchor: its
   centre. ── */
export function Glint({ r = 34, scale = 1, className = "" }) {
  const k = 1 / scale;
  const star = `M0,${-r}C${r * 0.1},${-r * 0.24} ${r * 0.24},${-r * 0.1} ${r},0C${r * 0.24},${r * 0.1} ${r * 0.1},${r * 0.24} 0,${r}`
    + `C${-r * 0.1},${r * 0.24} ${-r * 0.24},${r * 0.1} ${-r},0C${-r * 0.24},${-r * 0.1} ${-r * 0.1},${-r * 0.24} 0,${-r}Z`;
  return (
    <Art box={[-r - 10, -r - 10, r * 2 + 20, r * 2 + 20]} scale={scale} className={`bit-glint${className ? ` ${className}` : ""}`}>
      <Drawn k={k} line={4} groups={[[["blob", star, "var(--bone)"]]]} />
      <path d={circle(0, 0, r * 0.14)} style={{ fill:"var(--bit-fire-hot)" }} />
    </Art>
  );
}
