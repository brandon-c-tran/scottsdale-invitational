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

/* ══ idle's props (Oct 10): the downtime vignettes' things. Same drawing:
   a keyline wider in ink, then paint, one hard tone; small things (a
   moth, a sleep mark) on the small props' line (5), the rest on CAST.line. ══ */

/* ── a sleep mark: a sawtooth stroke, drawn (never the letter). Anchor:
   its middle. ── */
export function SleepMark({ scale = 1, className = "" }) {
  return (
    <Art box={[-44, -24, 88, 48]} scale={scale} className={`bit-sleep${className ? ` ${className}` : ""}`}>
      <Drawn k={1 / scale} line={5} groups={[[["cap", "M-30,6 L-18,-6 L-6,6 L6,-6 L18,6 L30,-6", 9, "var(--bone)"]]]} />
    </Art>
  );
}

/* ── a moth, seen from above, wings open. Each wing pair is its own node
   (.bit-moth-wing.is-l / .is-r, hung on the body) so a scene flaps them;
   antennae up. Anchor: the middle of its body. ── */
const MOTH_WING = ["M3,-3 C12,-22 31,-29 38,-19 C43,-11 35,-1 5,3 Z", "M4,3 C17,4 28,11 25,21 C21,28 9,24 3,9 Z"];
function MothWing({ side, k }) {
  const flip = side === "l" ? "scale(-1 1)" : undefined;
  return (
    <span className={`bit-moth-wing is-${side}`}>
      <Art box={[-50, -40, 100, 80]}>
        <g transform={flip}>
          <Drawn k={k} line={5} groups={[[["blob", MOTH_WING[0], "var(--bit-moth)"], ["blob", MOTH_WING[1], "var(--bit-moth)"]]]} />
          <Tone d="M26,-25 C33,-26 39,-22 38,-16 C37,-12 33,-9 28,-8 C31,-13 31,-20 26,-25 Z" fill="var(--bit-moth-dark)" />
          <path d={circle(19, -12, 3.6)} style={{ fill:"var(--bit-moth-dark)" }} />
        </g>
      </Art>
    </span>
  );
}
export function Moth({ scale = 1, className = "" }) {
  const k = 1 / scale;
  return (
    <span className={`bit-moth${className ? ` ${className}` : ""}`} style={scale !== 1 ? { transform:`scale(${scale})` } : undefined}>
      <MothWing side="l" k={k} />
      <MothWing side="r" k={k} />
      <Art box={[-24, -36, 48, 64]}>
        <Drawn k={k} line={4} groups={[[["cap", "M-2,-13 Q-6,-23 -12,-27", 3, "var(--bit-moth-dark)"], ["cap", "M2,-13 Q6,-23 12,-27", 3, "var(--bit-moth-dark)"]],
          [["blob", ellipse(0, 5, 5.5, 14), "var(--bit-moth-dark)"], ["blob", circle(0, -10, 5), "var(--bit-moth-dark)"]]]} />
      </Art>
    </span>
  );
}

/* ── a pillow, plump, its corners pinched. Anchor: the middle of its
   foot. ── */
export function Pillow({ scale = 1, className = "" }) {
  const k = 1 / scale;
  return (
    <Art box={[-104, -82, 208, 96]} scale={scale} className={`bit-pillow${className ? ` ${className}` : ""}`}>
      <Drawn k={k} groups={[[["blob", "M-96,-2 C-84,-18 -82,-40 -94,-60 C-60,-80 60,-80 94,-60 C82,-40 84,-18 96,-2 C50,-14 -50,-14 -96,-2 Z",
        "var(--bit-pillow)"]]]} />
      <Tone d="M-90,-6 C-86,-12 -85,-18 -85,-24 C-46,-16 46,-16 85,-24 C85,-18 86,-12 90,-6 C48,-16 -48,-16 -90,-6 Z" fill="var(--bit-pillow-shade)" />
      <Line d="M-60,-56 C-24,-64 24,-64 60,-56" k={k} w={3} />
    </Art>
  );
}

/* ── a saguaro up close: a trunk with a rounded crown, an arm each side,
   ribs, spines along every edge, and a blossom on top. Anchor: the
   middle of its foot. SAGUARO says where its parts are, from the foot. ── */
export const SAGUARO = Object.freeze({ h:520, w:80, armW:46,
  l:{ at:-190, out:-128, top:-330 }, r:{ at:-284, out:96, top:-420 } });
function sideSpines(x0, y0, y1, dir, step = 34) {
  const out = [];
  for (let y = y0; y > y1; y -= step) out.push(`M${x0},${y} l${dir * 13},-6 M${x0},${y - 10} l${dir * 12},3`);
  return out.join(" ");
}
export function Saguaro({ scale = 1, bloom = true, className = "" }) {
  const k = 1 / scale;
  const { h, w, armW, l, r } = SAGUARO;
  const hw = w / 2, ha = armW / 2;
  const trunk = `M0,-46 L0,${-h + hw}`;
  const armL = `M${-hw + 4},${l.at} L${l.out + 16},${l.at} Q${l.out},${l.at} ${l.out},${l.at - 16} L${l.out},${l.top + ha}`;
  const armR = `M${hw - 4},${r.at} L${r.out - 16},${r.at} Q${r.out},${r.at} ${r.out},${r.at - 16} L${r.out},${r.top + ha}`;
  const spines = [sideSpines(-hw - 2, -24, -h + 26, -1), sideSpines(hw + 2, -24, -h + 26, 1),
    sideSpines(l.out - ha - 2, l.at - 20, l.top + 18, -1, 30), sideSpines(r.out + ha + 2, r.at - 20, r.top + 18, 1, 30),
    `M-8,${-h - 2} l-4,-12 M8,${-h - 2} l4,-12 M${l.out},${l.top - 2} l0,-12 M${r.out},${r.top - 2} l0,-12`].join(" ");
  return (
    <Art box={[l.out - 60, -h - 60, r.out - l.out + 120, h + 70]} scale={scale} className={`bit-saguaro${className ? ` ${className}` : ""}`}>
      <path d={spines} className="bit-line" strokeWidth={3.2 * k} />
      <Drawn k={k} groups={[[["cap", armL, armW, "var(--bit-cactus)"], ["cap", armR, armW, "var(--bit-cactus)"],
        ["cap", trunk, w, "var(--bit-cactus)"], ["blob", `M${-hw},0 L${-hw},-44 L${hw},-44 L${hw},0 Z`, "var(--bit-cactus)"]]]} />
      {/* the lit side (the sun's), then the ribs */}
      <path d={`M${-hw + 9},-6 L${-hw + 9},${-h + hw + 4}`} className="bit-cactus-lit" strokeWidth={10} />
      <path d={`M${l.out - ha + 9},${l.at - 14} L${l.out - ha + 9},${l.top + ha - 2}`} className="bit-cactus-lit" strokeWidth={8} />
      <path d={`M${r.out - ha + 9},${r.at - 14} L${r.out - ha + 9},${r.top + ha - 2}`} className="bit-cactus-lit" strokeWidth={8} />
      <path d={`M-13,-8 L-13,${-h + 26} M13,-8 L13,${-h + 26} M${l.out + 8},${l.at - 18} L${l.out + 8},${l.top + 14}`
        + ` M${r.out + 8},${r.at - 18} L${r.out + 8},${r.top + 14}`} className="bit-cactus-rib" strokeWidth={4.5} />
      {bloom && <g transform={`translate(0 ${-h - 6})`}><BlossomArt k={k} /></g>}
    </Art>
  );
}

/* the saguaro's blossom: five bone petals round a sun-gold middle */
function BlossomArt({ k = 1 }) {
  return <>
    <Drawn k={k} line={5} groups={[[0, 72, 144, 216, 288].map(a => ["blob", ellipse(Math.cos((a - 90) * Math.PI / 180) * 11,
      Math.sin((a - 90) * Math.PI / 180) * 11, 10, 7, a - 90), "var(--bit-bloom)"])]} />
    <path d={circle(0, 0, 6.5)} className="bit-ink" strokeWidth={3 * k} style={{ fill:"var(--sun)" }} />
  </>;
}
/* ── the blossom alone (off its saguaro). Anchor: its middle. ── */
export function Blossom({ scale = 1, className = "" }) {
  return <Art box={[-30, -30, 60, 60]} scale={scale} className={`bit-blossom${className ? ` ${className}` : ""}`}><BlossomArt k={1 / scale} /></Art>;
}

/* ── a stepladder, two steps, far too short for anything. Anchor: the
   middle of its foot; its top step is STEPLADDER.top over the floor. ── */
export const STEPLADDER = Object.freeze({ top:84, w:84 });
export function Stepladder({ scale = 1, className = "" }) {
  const k = 1 / scale;
  return (
    <Art box={[-60, -98, 120, 108]} scale={scale} className={`bit-ladder${className ? ` ${className}` : ""}`}>
      <Drawn k={k} groups={[
        [["cap", "M-38,-2 L-25,-72", 10, "var(--bit-metal)"], ["cap", "M38,-2 L25,-72", 10, "var(--bit-metal)"],
          ["cap", "M-31,-26 L31,-26", 8, "var(--bit-metal)"], ["cap", "M-28,-50 L28,-50", 8, "var(--bit-metal)"]],
        [["blob", "M-34,-84 L34,-84 Q37,-84 37,-81 L37,-74 Q37,-71 34,-71 L-34,-71 Q-37,-71 -37,-74 L-37,-81 Q-37,-84 -34,-84 Z", "var(--bit-metal)"]],
      ]} />
      <Tone d="M-33,-83 L33,-83 L33,-79 L-33,-79 Z" fill="var(--bit-iron-lit)" />
      <Tone d="M33,-4 L22,-66 L26,-66 L37,-4 Z" fill="var(--bit-metal-dark)" />
    </Art>
  );
}

/* ── a straw broom, its handle straight up. Anchor: where the upper hand
   grips the handle; the lower hand holds it BROOM.lower below that, and
   the straw's tip is BROOM.foot below it. ── */
export const BROOM = Object.freeze({ lower:150, foot:316 });
export function Broom({ scale = 1, className = "" }) {
  const k = 1 / scale;
  return (
    <Art box={[-70, -70, 140, 404]} scale={scale} className={`bit-broom${className ? ` ${className}` : ""}`}>
      <Drawn k={k} groups={[
        [["cap", "M0,-46 L0,232", 12, "var(--bit-wood)"]],
        [["blob", "M-16,232 L16,232 C30,262 44,292 52,318 L-52,318 C-44,292 -30,262 -16,232 Z", "var(--bit-straw)"]],
        [["blob", "M-18,226 L18,226 L20,246 L-20,246 Z", "var(--art-rose)"]],
      ]} />
      <Tone d="M8,250 C20,272 32,296 40,314 L52,318 C44,292 30,262 16,246 Z" fill="var(--bit-straw-shade)" />
      <Line d="M-8,252 L-24,312 M0,252 L0,314 M8,252 L22,312 M-16,254 L-40,312 M16,254 L38,312" k={k} w={2.6} />
      <Tone d="M-3,-40 L-3,224 L-1,224 L-1,-40 Z" fill="var(--bit-iron-lit)" />
    </Art>
  );
}

/* ── a little heap of swept dust. Anchor: the middle of its foot. ── */
export function SandPile({ scale = 1, className = "" }) {
  const k = 1 / scale;
  return (
    <Art box={[-76, -56, 152, 66]} scale={scale} className={`bit-pile${className ? ` ${className}` : ""}`}>
      <Drawn k={k} groups={[[["blob", "M-62,0 C-56,-16 -36,-38 -4,-40 C30,-41 54,-20 62,0 Z", "var(--bit-dust)"]]]} />
      <Tone d="M8,-38 C34,-34 54,-18 62,0 L22,0 C26,-14 22,-28 8,-38 Z" fill="var(--bit-dust-shade)" />
      <path d={`${circle(-22, -14, 2.6)} ${circle(-6, -26, 2.2)} ${circle(-34, -6, 2.2)} ${circle(4, -10, 2.4)}`} style={{ fill:"var(--bit-dust-shade)" }} />
    </Art>
  );
}

/* ── a tiny café table: a round top on one leg. Anchor: the middle of its
   foot; its top is ARM_TABLE.top over the floor. ── */
export const ARM_TABLE = Object.freeze({ top:96, w:200 });
export function ArmTable({ scale = 1, className = "" }) {
  const k = 1 / scale;
  return (
    <Art box={[-114, -112, 228, 124]} scale={scale} className={`bit-table${className ? ` ${className}` : ""}`}>
      <Drawn k={k} groups={[
        [["blob", ellipse(0, -4, 52, 9), "var(--bit-wood)"], ["cap", "M0,-8 L0,-84", 16, "var(--bit-wood)"]],
        [["blob", "M-100,-96 L100,-96 Q104,-96 104,-92 L104,-84 Q104,-80 100,-80 L-100,-80 Q-104,-80 -104,-84 L-104,-92 Q-104,-96 -100,-96 Z",
          "var(--bit-wood)"]],
      ]} />
      <Tone d="M-100,-95 L100,-95 L100,-90 L-100,-90 Z" fill="var(--bit-wood-lit)" />
      <Tone d="M3,-78 L8,-78 L8,-10 L3,-12 Z" fill="var(--bit-wood-dark)" />
    </Art>
  );
}

/* ── a road map, unfolded: paper in panels (the folds alternate light and
   shade), a river, a road, mountains, a cactus, a cross and a compass
   with its north lit, all drawn upright (the scene turns it). Anchor:
   its centre. MAP_SHEET is its size. ── */
export const MAP_SHEET = Object.freeze({ w:400, h:236 });
export function PaperMap({ scale = 1, className = "" }) {
  const k = 1 / scale;
  const { w, h } = MAP_SHEET;
  const x0 = -w / 2, y0 = -h / 2, pw = w / 3;
  const mountain = (x, y, s) => `M${x - 22 * s},${y} L${x},${y - 30 * s} L${x + 22 * s},${y} Z`;
  return (
    <Art box={[x0 - 14, y0 - 14, w + 28, h + 28]} scale={scale} className={`bit-map${className ? ` ${className}` : ""}`}>
      <Drawn k={k} groups={[[["blob", `M${x0},${y0} L${-x0},${y0} L${-x0},${-y0} L${x0},${-y0} Z`, "var(--bit-paper)"]]]} />
      {/* the folds: alternate panels in shade, the creases in ink */}
      <path d={`M${x0 + pw},${y0} l${pw},0 l0,${h / 2} l${-pw},0 Z M${x0},0 l${pw},0 l0,${h / 2} l${-pw},0 Z M${x0 + pw * 2},0 l${pw},0 l0,${h / 2} l${-pw},0 Z`}
        style={{ fill:"var(--bit-paper-shade)" }} />
      {/* the print */}
      <path d={`M${x0 + 10},${y0 + 60} C-120,-40 -60,-70 -20,-20 C20,30 80,10 120,50 C150,80 170,96 ${-x0 - 8},${-y0 - 24}`}
        className="bit-map-river" strokeWidth={12} />
      <path d={`M${x0 + 30},${-y0 - 14} C-110,40 -70,70 -20,40 C30,10 40,-60 90,-70 C130,-78 160,-90 ${-x0 - 20},${y0 + 16}`}
        className="bit-map-road" strokeWidth={6} />
      <path d={`${mountain(90, -36, 1)} ${mountain(126, -30, 0.78)} ${mountain(58, -24, 0.66)}`} className="bit-map-peak" strokeWidth={3 * k} />
      <path d="M-128,8 L-128,-28 M-128,-12 L-140,-12 L-140,-22 M-128,-18 L-118,-18 L-118,-30" className="bit-map-cactus" strokeWidth={6} />
      <path d="M40,58 L58,76 M58,58 L40,76" className="bit-map-x" strokeWidth={6} />
      <g transform="translate(-150 74)">
        <path d={starPath(4, 26, 7)} className="bit-ink" strokeWidth={2.6 * k} style={{ fill:"var(--bit-paper)" }} />
        <path d="M0,-26 L6,-6 L-6,-6 Z" style={{ fill:"var(--art-rose)" }} />
      </g>
      <path d={`M${x0 + pw},${y0} L${x0 + pw},${-y0} M${x0 + pw * 2},${y0} L${x0 + pw * 2},${-y0} M${x0},0 L${-x0},0`} className="bit-line"
        strokeWidth={2.4 * k} style={{ opacity:0.55 }} />
    </Art>
  );
}
/* ── the map folded up: one panel, a band across it. Anchor: its centre. ── */
export function FoldedMap({ scale = 1, className = "" }) {
  const k = 1 / scale;
  const { w, h } = MAP_SHEET;
  const pw = w / 3, ph = h / 2;
  return (
    <Art box={[-pw / 2 - 14, -ph / 2 - 14, pw + 28, ph + 28]} scale={scale} className={`bit-map is-folded${className ? ` ${className}` : ""}`}>
      <Drawn k={k} groups={[[["blob", `M${-pw / 2},${-ph / 2} L${pw / 2},${-ph / 2} L${pw / 2},${ph / 2} L${-pw / 2},${ph / 2} Z`, "var(--bit-paper)"]]]} />
      <path d={`M${-pw / 2},-14 L${pw / 2},-14 L${pw / 2},16 L${-pw / 2},16 Z`} style={{ fill:"var(--art-cobalt)" }} />
      <path d={`M${pw / 2 - 10},${-ph / 2} L${pw / 2 - 10},${ph / 2}`} className="bit-line" strokeWidth={2.4 * k} style={{ opacity:0.55 }} />
    </Art>
  );
}

/* ── a paper ball, crumpled. Anchor: its centre. ── */
export function PaperBall({ scale = 1, className = "" }) {
  const k = 1 / scale;
  return (
    <Art box={[-46, -46, 92, 92]} scale={scale} className={`bit-paperball${className ? ` ${className}` : ""}`}>
      <Drawn k={k} groups={[[["blob", "M-30,-12 L-18,-30 L4,-33 L22,-26 L33,-8 L30,14 L16,30 L-6,33 L-26,22 L-34,4 Z", "var(--bit-paper)"]]]} />
      <Tone d="M33,-8 L30,14 L16,30 L-6,33 L-2,16 L14,4 Z" fill="var(--bit-paper-shade)" />
      <Line d="M-18,-30 L-8,-10 L14,4 M4,-33 L-8,-10 L-26,4 M-8,-10 L-2,16 M22,-26 L14,4" k={k} w={2.6} />
    </Art>
  );
}

/* ── a desert boulder, lit on its sunny side. Anchor: the middle of its
   foot. ── */
export function Boulder({ scale = 1, className = "" }) {
  const k = 1 / scale;
  return (
    <Art box={[-96, -96, 192, 106]} scale={scale} className={`bit-boulder${className ? ` ${className}` : ""}`}>
      <Drawn k={k} groups={[[["blob", "M-80,0 C-88,-28 -70,-70 -26,-78 C14,-86 62,-68 78,-34 C86,-16 84,-6 80,0 Z", "var(--bit-rock)"]]]} />
      <Tone d="M-74,-14 C-78,-40 -60,-68 -24,-74 C-40,-60 -50,-40 -52,-14 Z" fill="var(--bit-rock-lit)" />
      <Line d="M18,-80 L10,-56 L22,-40 M50,-20 L64,-12" k={k} w={3} />
    </Art>
  );
}
