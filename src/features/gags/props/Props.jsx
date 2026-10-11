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
   middle of its foot. IDLE_SAGUARO says where its parts are, from the foot. ── */
export const IDLE_SAGUARO = Object.freeze({ h:520, w:80, armW:46,
  l:{ at:-190, out:-128, top:-330 }, r:{ at:-284, out:96, top:-420 } });
function sideSpines(x0, y0, y1, dir, step = 34) {
  const out = [];
  for (let y = y0; y > y1; y -= step) out.push(`M${x0},${y} l${dir * 13},-6 M${x0},${y - 10} l${dir * 12},3`);
  return out.join(" ");
}
export function IdleSaguaro({ scale = 1, bloom = true, className = "" }) {
  const k = 1 / scale;
  const { h, w, armW, l, r } = IDLE_SAGUARO;
  const hw = w / 2, ha = armW / 2;
  const trunk = `M0,-46 L0,${-h + hw}`;
  const armL = `M${-hw + 4},${l.at} L${l.out + 16},${l.at} Q${l.out},${l.at} ${l.out},${l.at - 16} L${l.out},${l.top + ha}`;
  const armR = `M${hw - 4},${r.at} L${r.out - 16},${r.at} Q${r.out},${r.at} ${r.out},${r.at - 16} L${r.out},${r.top + ha}`;
  const spines = [sideSpines(-hw - 2, -24, -h + 26, -1), sideSpines(hw + 2, -24, -h + 26, 1),
    sideSpines(l.out - ha - 2, l.at - 20, l.top + 18, -1, 30), sideSpines(r.out + ha + 2, r.at - 20, r.top + 18, 1, 30),
    `M-8,${-h - 2} l-4,-12 M8,${-h - 2} l4,-12 M${l.out},${l.top - 2} l0,-12 M${r.out},${r.top - 2} l0,-12`].join(" ");
  return (
    <Art box={[l.out - 60, -h - 60, r.out - l.out + 120, h + 70]} scale={scale} className={`bit-idle-saguaro${className ? ` ${className}` : ""}`}>
      <path d={spines} className="bit-line" strokeWidth={3.2 * k} />
      <Drawn k={k} groups={[[["cap", armL, armW, "var(--bit-idle-cactus)"], ["cap", armR, armW, "var(--bit-idle-cactus)"],
        ["cap", trunk, w, "var(--bit-idle-cactus)"], ["blob", `M${-hw},0 L${-hw},-44 L${hw},-44 L${hw},0 Z`, "var(--bit-idle-cactus)"]]]} />
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
        [["blob", "M-30,0 L-38,-42 L38,-42 L30,0 Z", "var(--bit-cupcake-paper)"]],
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
export function MatchFlame({ scale = 1, className = "" }) {
  const k = 1 / scale;
  return (
    <Art box={[-28, -78, 56, 86]} scale={scale} className={`bit-match-flame${className ? ` ${className}` : ""}`}>
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
    <Art box={[-124, -158, 248, 170]} scale={scale} className={`bit-party-table${className ? ` ${className}` : ""}`}>
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
      <path d={`${circle(r, r + edge, r - 0.5)}${circle(r, r, r - 0.5)}`} style={{ fill:"var(--bit-slap-soot)" }} opacity=".68" />
      <path d={`${ellipse(r * 0.72, r * 0.64, r * 0.3, r * 0.1, -24)}${ellipse(r * 1.3, r * 1.36, r * 0.24, r * 0.08, 18)}`}
        style={{ fill:"var(--bit-slap-soot-lit)" }} opacity=".55" />
    </svg>
  );
}

/* ── dirt thrown up round something planted in the ground: a low lumpy
   mound and a few clods. Anchor: the middle of its foot. ── */
export function DirtMound({ scale = 1, className = "" }) {
  const k = 1 / scale;
  return (
    <Art box={[-176, -70, 352, 92]} scale={scale} className={`bit-dirt${className ? ` ${className}` : ""}`}>
      <Drawn k={k} groups={[[
        ["blob", "M-150,10 C-148,-6 -132,-16 -114,-13 C-106,-31 -80,-38 -63,-29 C-52,-48 -24,-52 -8,-40 C6,-56 38,-54 49,-38 "
          + "C64,-50 92,-44 101,-27 C120,-33 141,-20 147,-4 C150,4 150,8 148,12 Z", "var(--bit-dust)"],
        ["blob", circle(-162, 4, 9), "var(--bit-dust)"], ["blob", circle(164, 2, 11), "var(--bit-dust)"], ["blob", circle(126, -44, 7), "var(--bit-dust)"],
      ]]} />
      <Tone d="M-146,4 C-110,-2 -60,-4 0,-4 C60,-4 110,-4 146,0 L148,12 L-150,10 Z" fill="var(--bit-dust-shade)" />
      <Line d="M-92,-22 C-84,-26 -76,-26 -70,-22 M-20,-30 C-12,-36 -2,-36 6,-30 M58,-26 C66,-31 76,-30 82,-24" k={k} w={3} />
    </Art>
  );
}

/* ══ the deadpan desert's props (Oct 10: butte, sunset, statue, vulture) ══ */

const pts = list => `M${list.map(([x, y]) => `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`).join("L")}Z`;
/* rock in the session's painting inks (inside a "tv-desert" data-phase
   wrapper), else the afternoon's */
export const ROCK = Object.freeze({ lit:"var(--d-mesa, var(--bit-desert-rock))", shade:"var(--d-shade, var(--bit-desert-rock-shade))",
  under:"color-mix(in srgb, var(--d-shade, var(--bit-desert-rock-shade)) 58%, var(--ink0))" });

/* ── a slab of rock cut from the painting: its outline in the session's
   lit mesa ink, its shade face, detail lines (strata). The scene wraps its
   rock in class "tv-desert" with data-phase, so the inks are the painting's
   own (--d-mesa, --d-shade; cast.css --bit-desert-rock* off the painting).
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
export const VULTURE = Object.freeze({ neck:{ x:-64, y:-182 }, fork:{ x:-146, y:-92 }, knife:{ x:-188, y:-100 }, beak:{ x:-130, y:-194 } });
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
      : pose === "hold" ? [["cap", "M-4,-150 Q-60,-96 -176,-104", 30, "var(--bit-vulture)"], ["cap", "M-176,-110 L-194,-114", 11, "var(--bit-vulture)"],
        ["cap", "M-178,-98 L-196,-96", 11, "var(--bit-vulture)"]] : null;
  const nearWing = pose === "glide" ? wing("M10,-176 C-20,-236 -40,-290 -30,-336 C-6,-318 10,-276 20,-236 C26,-210 30,-190 30,-170 Z",
    ["M-30,-332 L-38,-372", "M-20,-326 L-16,-366", "M-10,-316 L4,-352"])
    : pose === "flap" ? wing("M14,-160 C-20,-150 -70,-120 -110,-70 C-90,-62 -60,-86 -30,-108 C-10,-124 6,-140 20,-150 Z",
      ["M-106,-74 L-140,-50", "M-94,-70 L-120,-38", "M-80,-74 L-96,-40"])
      : pose === "hold" ? [["cap", "M30,-150 Q-20,-80 -134,-96", 34, "var(--bit-vulture)"], ["cap", "M-134,-102 L-154,-106", 12, "var(--bit-vulture)"],
        ["cap", "M-136,-90 L-156,-88", 12, "var(--bit-vulture)"]] : null;
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
export function Gleam({ r = 34, scale = 1, className = "" }) {
  const k = 1 / scale;
  const star = `M0,${-r}C${r * 0.1},${-r * 0.24} ${r * 0.24},${-r * 0.1} ${r},0C${r * 0.24},${r * 0.1} ${r * 0.1},${r * 0.24} 0,${r}`
    + `C${-r * 0.1},${r * 0.24} ${-r * 0.24},${r * 0.1} ${-r},0C${-r * 0.24},${-r * 0.1} ${-r * 0.1},${-r * 0.24} 0,${-r}Z`;
  return (
    <Art box={[-r - 10, -r - 10, r * 2 + 20, r * 2 + 20]} scale={scale} className={`bit-gleam${className ? ` ${className}` : ""}`}>
      <Drawn k={k} line={4} groups={[[["blob", star, "var(--bone)"]]]} />
      <path d={circle(0, 0, r * 0.14)} style={{ fill:"var(--bit-fire-hot)" }} />
    </Art>
  );
}
