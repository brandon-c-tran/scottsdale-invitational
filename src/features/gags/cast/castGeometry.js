/* The cast rig's geometry (bits, Oct 10). A player is their photo chip
   standing on its edge on the desert floor, with floating cartoon gloves
   (no arms) and, optionally, little shoes. Every part hangs off one point:
   the feet, the bottom centre where the chip meets the floor. A scene
   places a cast member by its feet in canvas pixels and animates its parts
   by class (cast.css); this module says where each part sits, so a scene
   can aim a prop at a glove or drop dust where a head lands. Pure. */

/* the TV's defaults: a 240 px chip, feet on the painting's floor (the
   desert floor runs from the horizon at 856 to 944), and the one line
   weight every drawing in a bit shares, in canvas px */
export const CAST = Object.freeze({ size:240, floor:930, line:7, detail:4 });

/* the rig in fractions of the chip's size */
export const RIG = Object.freeze({
  /* shoes stand on the floor; the chip stands on them, its rim tucked a
     little behind their tops */
  shoeH:0.11, lift:0.085, shoeX:0.16,
  /* a glove's wrist (where an arm would be) hangs off the chip's sides,
     a little below its middle */
  handX:0.6, handY:0.43,
  /* glove art is drawn for a 240 px chip (gloveArt.js), and worn a size
     up: big hands read across a room */
  art:240, glove:1.2,
  /* the coin's thickness, seen a little from above */
  edge:0.05,
});

const r1 = n => Math.round(n * 10) / 10 || 0;

/* Where everything sits for one chip, relative to its feet (y up is
   negative). `shoes:false` stands the chip's rim on the floor. */
export function castGeometry(size = CAST.size, { shoes = true } = {}) {
  const s = Number(size) || CAST.size;
  const lift = shoes ? s * RIG.lift : 0;
  const center = { x:0, y:r1(-(lift + s / 2)) };
  const wristY = r1(-(lift + s * RIG.handY));
  return {
    size:s, lift:r1(lift), center, top:r1(-(lift + s)), bottom:r1(-lift),
    radius:s / 2,
    /* the art's scale (art px per canvas px is 1 / scale): the shoes at
       `scale`, the gloves a size up at `glove` */
    scale:s / RIG.art, glove:s / RIG.art * RIG.glove,
    hands:{ l:{ x:r1(-s * RIG.handX), y:wristY }, r:{ x:r1(s * RIG.handX), y:wristY } },
    shoes:{ l:{ x:r1(-s * RIG.shoeX), y:0 }, r:{ x:r1(s * RIG.shoeX), y:0 } },
    shoeH:r1(s * RIG.shoeH),
    edge:r1(s * RIG.edge),
    /* the floor shadow: a flat ellipse a little wider than the chip */
    shadow:{ w:r1(s * 0.92), h:r1(s * 0.12) },
  };
}

/* A side on screen: up to `max` chips shoulder to shoulder, the rest
   counted as "+N". Bigger sides stand smaller chips so a side of four
   still leaves the stage its middle. `xs` are each chip's feet, from the
   lead outward (the lead stands nearest the action); `dir` is the way the
   side extends from the lead (-1 to the left, 1 to the right). */
export const CLUSTER_SIZES = Object.freeze([240, 210, 180, 160]);
/* A pair (Oct 13: the doubles, Beer Die, Pickleball, 8-Ball, Beer Pong):
   both partners act in a solo bit, so a side of exactly two stands
   apart, PAIR_STEP chips feet to feet, each glove plainly its own chip's
   and nobody in a clump (`pair` says so; a bit gives both the lead's
   part). `pairStep` asks for a different spacing. */
export const PAIR_STEP = 1.8;
/* a versus whose two sides both stand in one shot stands a pair a little
   smaller and closer (a 2 v 2 standoff still fits the TV) */
export const PAIR_TIGHT = Object.freeze({ sizes:Object.freeze([240, 200, 180, 160]), pairStep:1.75 });
export const isPair = side => (Array.isArray(side) ? side.length : Math.floor(Number(side) || 0)) === 2;
export function clusterLayout(count, { max = 4, dir = -1, sizes = CLUSTER_SIZES, gap = 0.78, pairStep = PAIR_STEP } = {}) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  const shown = Math.min(n, max);
  const size = sizes[Math.max(0, Math.min(sizes.length - 1, shown - 1))] || CAST.size;
  const pair = n === 2 && shown === 2;
  const step = Math.round(size * (pair ? pairStep : gap));
  return {
    shown, more:Math.max(0, n - shown), size, step, pair,
    xs:Array.from({ length:shown }, (_, i) => i * step * (dir < 0 ? -1 : 1) || 0),
    /* how far the side reaches from the lead's feet, chips and gloves */
    reach:shown ? (shown - 1) * step + size * (0.5 + RIG.handX) : 0,
  };
}

/* A team abreast (the team bits, Oct 12): up to `max` chips in one line,
   centred on 0, feet `step` chips apart, so each chip's two gloves
   hanging at rest stay plainly its own and nobody clumps; a bigger side
   stands smaller chips (seven still fit the TV's safe sides at the
   camera's widest). `half` is how far the line reaches either side of
   its middle, gloves included. A bit that folds the gloves away (in
   front of the chip, on a rope) can pass a tighter `step`. */
export const LINE_SIZES = Object.freeze([240, 230, 210, 190, 170, 150, 136]);
/* a resting glove's fingers reach this far from the chip's middle, in chips */
export const REST_REACH = 0.8;
export function lineLayout(count, { max = 7, step = 1.75, sizes = LINE_SIZES } = {}) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  const shown = Math.min(n, max);
  const size = sizes[Math.max(0, Math.min(sizes.length - 1, shown - 1))] || CAST.size;
  const gap = Math.round(size * step);
  return {
    shown, more:Math.max(0, n - shown), size, step:gap,
    xs:Array.from({ length:shown }, (_, i) => Math.round((i - (shown - 1) / 2) * gap) || 0),
    half:shown ? Math.round((shown - 1) / 2 * gap + size * REST_REACH) : 0,
  };
}

/* stereo place for a canvas x: the room hears it where it happens */
export const panAt = x => {
  const at = Number.isFinite(Number(x)) ? Number(x) : 960;
  return Math.round(Math.max(-1, Math.min(1, (at - 960) / 960 * 0.9)) * 100) / 100 || 0;
};
