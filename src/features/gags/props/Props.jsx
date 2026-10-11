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

/* ══ the action bits' props (explosionwalk, dontlookback, quicksand) ══ */

/* round lobes [x, y, r], laid as one silhouette */
const lobes = (list, fill) => list.map(([x, y, r]) => ["blob", circle(x, y, r), fill]);

/* ── a fireball: a ball of fire boiling up, three heats, one keyline
   round the outside. Each heat is its own node (.bit-fire-layer.is-outer,
   .is-mid, .is-core) so a scene can cool it from the middle out. Anchor:
   its centre. ── */
const FIRE_OUTER = Object.freeze([[0, -6, 66], [58, 6, 44], [-58, 6, 44], [40, -48, 44], [-42, -46, 42], [0, -74, 42], [78, -26, 34],
  [-78, -24, 34], [30, 44, 36], [-32, 42, 36], [0, 50, 34], [68, 40, 26], [-68, 42, 26]]);
const FIRE_MID = Object.freeze([[0, -12, 50], [36, -32, 30], [-34, -30, 30], [0, -52, 30], [46, 6, 28], [-46, 6, 28], [0, 22, 30],
  [56, -16, 20], [-56, -14, 20]]);
/* the white heart: one boiling blob, a little off the middle */
const FIRE_CORE = "M-34,8 C-46,-12 -34,-40 -10,-44 C-2,-56 22,-56 30,-40 C46,-32 46,-6 34,6 C26,22 6,26 -8,22 C-20,26 -32,20 -34,8 Z";
export function Fireball({ scale = 1, className = "" }) {
  const k = 1 / scale;
  const box = [-124, -136, 248, 228];
  return (
    <span className={`bit-fireball${className ? ` ${className}` : ""}`}>
      <span className="bit-fire-layer is-outer"><Art box={box} scale={scale}>
        <Drawn k={k} groups={[lobes(FIRE_OUTER, "var(--bit-blast)")]} />
        <Tone d="M-96,20 C-80,62 -40,84 0,84 C40,84 80,62 96,20 C84,52 46,72 0,72 C-46,72 -84,52 -96,20 Z" fill="var(--bit-blast-shade)" />
      </Art></span>
      <span className="bit-fire-layer is-mid"><Art box={box} scale={scale}>
        {FIRE_MID.map(([x, y, r], i) => <path key={i} d={circle(x, y, r)} style={{ fill:"var(--bit-fire)" }} />)}
      </Art></span>
      <span className="bit-fire-layer is-core"><Art box={box} scale={scale}>
        <path d={FIRE_CORE} style={{ fill:"var(--bit-fire-hot)" }} />
      </Art></span>
    </span>
  );
}

/* ── smoke: a black cloud, lit on top, and (`fire`) lit orange from
   under by what is burning below it. Anchor: its centre. ── */
const SMOKE = Object.freeze([[0, 0, 60], [56, 12, 44], [-56, 12, 44], [30, -40, 44], [-32, -38, 42], [0, -58, 36], [84, 26, 30],
  [-84, 26, 30], [0, 36, 40]]);
export function SmokeCloud({ scale = 1, fire = false, className = "" }) {
  const k = 1 / scale;
  return (
    <Art box={[-126, -106, 252, 192]} scale={scale} className={`bit-smoke${className ? ` ${className}` : ""}`}>
      <Drawn k={k} groups={[lobes(SMOKE, "var(--bit-soot)")]} />
      <path d={`${circle(-30, -42, 26)}${circle(4, -60, 22)}${circle(-62, 2, 22)}`} style={{ fill:"var(--bit-soot-lit)" }} />
      {fire && <Tone d="M-104,34 C-88,62 -50,76 0,76 C50,76 88,62 104,34 C96,56 60,66 0,66 C-60,66 -96,56 -104,34 Z"
        fill="var(--bit-soot-fire)" />}
    </Art>
  );
}

/* ── a flame: one tongue of fire, hot in its heart. Anchor: its foot. ── */
export function Flame({ scale = 1, className = "" }) {
  const k = 1 / scale;
  return (
    <Art box={[-40, -112, 80, 122]} scale={scale} className={`bit-flame${className ? ` ${className}` : ""}`}>
      <Drawn k={k} groups={[[["blob", "M0,0 C-24,0 -30,-26 -18,-48 C-12,-60 -14,-74 -6,-92 C2,-74 14,-68 20,-50 C24,-38 22,-30 26,-20"
        + " C30,-6 18,0 0,0 Z", "var(--bit-blast)"]]]} />
      <path d="M0,-6 C-14,-6 -16,-22 -8,-36 C-4,-44 -4,-52 0,-62 C4,-50 12,-44 14,-32 C16,-18 12,-6 0,-6 Z" style={{ fill:"var(--bit-fire)" }} />
      <path d="M0,-10 C-6,-10 -7,-18 -3,-26 C0,-20 6,-18 6,-14 C6,-11 4,-10 0,-10 Z" style={{ fill:"var(--bit-fire-hot)" }} />
    </Art>
  );
}

/* ── a glint: the four-point star off something shiny. Anchor: its centre. ── */
export function Glint({ scale = 1, className = "" }) {
  const k = 1 / scale;
  return (
    <Art box={[-46, -46, 92, 92]} scale={scale} className={`bit-glint${className ? ` ${className}` : ""}`}>
      <Drawn k={k} line={5} groups={[[["blob", starPath(4, 36, 7), "var(--bone)"]]]} />
    </Art>
  );
}

/* ── one loose chip, face on: its color, six bone inserts round the rim,
   the inlay. `size` is its width in canvas px; `player` colors it, or
   `color`. Anchor: its centre. ── */
export function LooseChip({ player, color, size = 100, className = "" }) {
  const identity = usePlayerIdentity(player || null);
  const fill = color || identity.color;
  const scale = size / 100, k = 1 / scale;
  const inserts = Array.from({ length:6 }, (_, i) => i * 60 + 30);
  return (
    <Art box={[-58, -58, 116, 116]} scale={scale} className={`bit-loose-chip${className ? ` ${className}` : ""}`}>
      <Drawn k={k} groups={[[["blob", circle(0, 0, 50), fill]]]} />
      {inserts.map(a => <path key={a} d="M-7,-49 L7,-49 L6,-36 L-6,-36 Z" transform={`rotate(${a})`} style={{ fill:"var(--bone)" }} />)}
      <path d={circle(0, 0, 31)} style={{ fill:`color-mix(in srgb, ${fill} 74%, var(--bone))` }} />
      <path d={circle(0, 0, 31)} className="bit-line" strokeWidth={3 * k} />
      <path d="M-34,-24 A42,42 0 0 1 24,-34" className="bit-line" strokeWidth={3 * k}
        style={{ stroke:"color-mix(in srgb, var(--bone) 60%, transparent)" }} />
    </Art>
  );
}

/* ── a saguaro close to: a trunk and one arm reaching out (`reach` -1 to
   the left, 1 to the right), its ribs, the light down one side. Anchor:
   the foot of its trunk. ── */
export const SAGUARO = Object.freeze({ trunk:380, armY:-212, armX:-118, armTop:-312, w:64, armW:46 });
export function Saguaro({ scale = 1, reach = -1, className = "" }) {
  const k = 1 / scale;
  const { trunk, armY, armX, armTop } = SAGUARO;
  return (
    <Art box={[-160, -440, 320, 450]} scale={scale} className={`bit-saguaro${className ? ` ${className}` : ""}`}
      style={reach > 0 ? { transform:"scaleX(-1)", transformOrigin:`${160 * scale}px 0` } : undefined}>
      <Drawn k={k} groups={[
        [["cap", `M-12,${armY} L${armX + 22},${armY} Q${armX},${armY} ${armX},${armY - 22} L${armX},${armTop}`, SAGUARO.armW, "var(--bit-cactus)"]],
        [["blob", `M-32,0 L-32,${-trunk} A32,32 0 0 1 32,${-trunk} L32,0 Z`, "var(--bit-cactus)"]],
      ]} />
      <Tone d={`M-24,-6 L-24,${-trunk} A24,24 0 0 1 -10,${-trunk - 22} L-12,${-trunk} L-12,-6 Z`} fill="var(--bit-cactus-lit)" />
      <Tone d={`M${armX - 15},${armY - 26} L${armX - 15},${armTop} A15,15 0 0 1 ${armX - 4},${armTop - 14} L${armX - 6},${armY - 26} Z`}
        fill="var(--bit-cactus-lit)" />
      <Line d={`M0,-14 L0,${-trunk - 8} M16,-14 L16,${-trunk + 4} M${armX + 8},${armY - 30} L${armX + 8},${armTop - 6}`} k={k} />
      {[[-34, -120], [34, -170], [-34, -260], [34, -300], [-34, -340], [armX - 24, armTop + 20], [armX + 24, armTop + 50]].map(([x, y], i) =>
        <path key={i} d={`M${x},${y} l${x < 0 ? -9 : 9},-5`} className="bit-line" strokeWidth={3 * k} style={{ stroke:"var(--bone)" }} />)}
    </Art>
  );
}

/* ── a glove giving a thumbs up from below: the cuff at the foot, the
   fist over it, the thumb straight up. The rig's own glove, drawn the
   same way and worn the same size (pass the rig's glove scale); a scene
   swaps it in for a raised glove. Anchor: the wrist. ── */
export function ThumbUp({ scale = 1, className = "" }) {
  const k = 1 / scale;
  const paint = "var(--bit-glove)";
  return (
    <Art box={[-60, -122, 120, 140]} scale={scale} className={`bit-thumbup${className ? ` ${className}` : ""}`}>
      <Drawn k={k} groups={[
        [["blob", "M-24,-12 C-30,-24 -30,-58 -22,-66 C-12,-74 14,-74 22,-66 C30,-58 30,-24 24,-12 Z", paint]],
        [["cap", "M16,-26 L28,-26", 15, paint], ["cap", "M17,-41 L30,-41", 15, paint], ["cap", "M16,-56 L27,-56", 14, paint]],
        [["cap", "M-10,-64 Q-12,-86 -8,-102", 17, paint]],
        [["blob", "M-26,3 C-26,10 26,10 26,3 L21,-17 C14,-21 -14,-21 -21,-17 Z", paint]],
      ]} />
      <Tone d="M-22,-20 C-27,-32 -27,-50 -22,-60 L-14,-60 C-19,-50 -19,-32 -14,-20 Z" fill="var(--bit-glove-shade)" />
    </Art>
  );
}
