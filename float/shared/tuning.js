/* Every physics and timing constant Float uses (float/PROTOCOL.md "Floaties",
   "The Cup", "Clock"). Pure: shared by the room, the screen, the controller,
   the tests and scripts/float-sim.mjs, which is how these numbers were tuned.

   Units: metres, seconds, kilograms, radians, unless a name says _MS. */
import { floatieOf } from "./floaties.js";

/* the clock: screens draw at serverNow() - INTERP_MS */
export const INTERP_MS = 100;
/* the music's bar: in `countdown`, room.startAt is the gun, and the gun
   lands on a bar line of the screen's music */
export const BAR_MS = 2000;

/* the simulation: a fixed 30 Hz step */
export const SIM_HZ = 30;
export const DT = 1 / SIM_HZ;
/* what the room sends while a race runs */
export const SNAP_HZ = 20;
export const ME_HZ = 10;
export const PERSIST_MS = 1000;
export const DEBUG_MS = 2000;
/* the most ticks one timer callback may catch up before the race clock slips */
export const MAX_CATCHUP_TICKS = 10;

/* the field */
export const MAX_RIDERS = 16;
export const RADIUS = 0.8;

/* ---- the Cup's clock ---- */
export const TIMING = Object.freeze({
  INTRO_MS:8000,
  GRID_MS:4000,
  COUNTDOWN_MS:3000,
  /* a room that restarts mid-race counts down again from its last save */
  RESUME_MS:3000,
  CUT_MS:20000,
  /* survivors may change floaties for the first SWAP_MS of a cut */
  SWAP_MS:15000,
  /* after the final race there is nothing to swap: a short results beat */
  CUT_LAST_MS:7000,
  PODIUM_MS:15000,
  FEEDBACK_MS:45000,
  /* a round ends CAP_MS after its first finisher, the rest placed by distance */
  CAP_MS:30000,
  /* and never runs longer than this from the gun, finished or not (a phone
     that never taps "Finished my drink" cannot hold a round open) */
  HARD_CAP_MS:180000,
  /* a Field Day cup whose startAt has passed starts this soon */
  START_SOON_MS:1500,
});

/* ---- balloons (PROTOCOL.md "Out") ---- */
export const BALLOON = Object.freeze({
  EVERY_MS:12000,
  FLIGHT_MS:1200,
  /* a racer is hit at most once in this long */
  IMMUNE_MS:6000,
  /* the spin a hit gives (rad/s) and a small shove (m/s), never a flip */
  SPIN:4.2,
  SHOVE:0.9,
});

/* flags stay lit this long after what set them */
export const FLAG_MS = Object.freeze({ STROKE:250, BUMP:250, SPLASH:600 });

/* ---- the water ---- */
export const WATER = Object.freeze({
  /* drag toward the local current, as a force per unit relative speed (kg/s):
     k = DRAG / mass, so a heavy floatie is pushed less by the current and keeps
     its own speed longer */
  DRAG:78,
  /* rotation: water damps spin (1/s) and drags it toward the water's own
     rotation (half the flow's curl) */
  SPIN_DAMP:2.6,
  SPIN_COUPLE:1.4,
  /* the current's speed across the river: 1 in the middle, 1 - BANK at a bank */
  BANK:0.6,
  /* riffles: random shoves while in one (per second, and their size) */
  RIFFLE_RATE:2.2,
  RIFFLE_PUSH:0.55,
  RIFFLE_SPIN:1.1,
  /* the whirlpool lets go of anyone it has held this long, for RELEASE_S */
  WHIRL_HOLD_S:4.5,
  WHIRL_RELEASE_S:4,
});

/* ---- paddling ---- */
export const PADDLE = Object.freeze({
  /* one full-power stroke's forward impulse (N s) at Speed 3 */
  IMPULSE:80,
  /* one full-power stroke's yaw (rad/s added) at Turn 3; a left stroke yaws
     right (clockwise, negative), a right stroke yaws left */
  YAW:0.95,
  /* a stroke's push is released over time (1/s): smooth on the screen, and a
     fifth of a second of network delay never shows */
  RELEASE:7,
  /* cadence as a leaky bucket: strokes drain out at SUSTAIN per second; above
     FREE in the bucket a stroke weakens and costs extra stamina; above CAP it
     is ignored (a stuck or flooding phone) */
  SUSTAIN:3,
  FREE:1.6,
  CAP:4.5,
  /* stamina 0..1: a steady stroke costs COST (a whole leg at 3 a second
     leaves you fresh), a rushed one RUSH_COST more per unit of bucket over
     FREE; it comes back at RECOVER per second once you have not stroked for
     REST_S (a drink in calm water refills it) */
  COST:0.0012,
  RUSH_COST:0.05,
  RECOVER:0.16,
  REST_S:0.6,
  /* power is full down to FRESH stamina, then falls to TIRED at 0 */
  FRESH:0.5,
  TIRED:0.45,
  /* the weakest a rushed stroke gets */
  RUSH_FLOOR:0.2,
});

/* ---- contact ---- */
export const CONTACT = Object.freeze({
  /* floatie on floatie, floatie on rock: vinyl is bouncy, water soaks it up */
  RESTITUTION:0.45,
  ROCK_RESTITUTION:0.35,
  BANK_RESTITUTION:0.15,
  /* a glancing hit turns tangential speed into spin (rad/s per m/s) */
  SPIN:0.9,
  /* scraping a bank or a rock keeps this much of the speed along it */
  SCRAPE:0.86,
  /* an impact this fast (m/s along the normal) is a bump */
  BUMP_MIN:0.7,
});

/* ---- flips ---- */
export const FLIP = Object.freeze({
  SWIM_MS:2500,
  /* after climbing back in, no flip for this long */
  IMMUNE_S:2,
  /* The Drop: crossing the lip more than this far off the current flips you
     (degrees, by Grip 1..5), or spinning faster than SPIN_MAX */
  DROP_ANGLE:[0, 24, 32, 40, 48, 56],
  DROP_SPIN:[0, 1.6, 1.9, 2.2, 2.5, 2.8],
  /* a riffle: water across your side faster than this (m/s, by Grip) builds
     tip; at 1 you flip. Only when you are at least SIDE_MIN off the current */
  RIFFLE_SLIP:[0, 1.0, 1.25, 1.5, 1.75, 2.0],
  TIP_GAIN:5,
  TIP_DECAY:1.5,
  SIDE_MIN:0.5,
});

/* ---- the four stats, mapped to physics (PROTOCOL.md "Floaties") ---- */
const statOf = (stat, value) => Math.max(1, Math.min(5, Number(value) || 3)) - 3;

/* every number a floatie's physics needs, from its stats and twist */
export function physicsOf(floatieId) {
  const floatie = floatieOf(floatieId);
  const speed = statOf("speed", floatie.speed);
  const turn = statOf("turn", floatie.turn);
  const weight = statOf("weight", floatie.weight);
  const grip = Math.max(1, Math.min(5, floatie.grip | 0 || 3));
  const id = floatie.id;
  const p = {
    id,
    /* Weight: who wins a bump, and how hard the current pushes you */
    mass:80 * (1 + 0.15 * weight),
    /* Speed: paddle thrust (and so top speed over the water) */
    thrust:PADDLE.IMPULSE * (1 + 0.055 * speed),
    /* Turn: how far a one-sided stroke turns you */
    yaw:PADDLE.YAW * (1 + 0.17 * turn),
    spinDamp:WATER.SPIN_DAMP * (1 - 0.06 * turn),
    /* Grip: flip resistance in rapids and the Drop */
    grip,
    dropAngle:FLIP.DROP_ANGLE[grip] * Math.PI / 180,
    dropSpin:FLIP.DROP_SPIN[grip],
    riffleSlip:FLIP.RIFFLE_SLIP[grip],
    /* twists (floaties.js) */
    launch:0,          // donut: extra thrust when slow
    tippy:1,           // unicorn: flip thresholds scaled down
    bumpOut:1,         // shark: impulse given to whoever it hits
    neverFlips:false,  // lounger
    steadyHandsOff:false, // cooler
  };
  if (id === "donut") p.launch = 0.6;
  if (id === "unicorn") p.tippy = 0.85;
  if (id === "flamingo") { p.yaw *= 1.08; p.spinDamp *= 0.92; }
  if (id === "shark") p.bumpOut = 1.7;
  if (id === "pizza") p.tippy = 1.3;
  if (id === "lounge") p.neverFlips = true;
  if (id === "cooler") p.steadyHandsOff = true;
  p.dropAngle *= p.tippy;
  p.dropSpin *= p.tippy;
  p.riffleSlip *= p.tippy;
  return p;
}

/* the donut's launch: full below LAUNCH_V over the water, gone by twice that */
export const LAUNCH_V = 1.6;
/* the cooler, hands off: its own strokes yaw this much, the water's spin this */
export const COOLER = Object.freeze({ STROKE_YAW:0.35, WATER_SPIN:0.15, DAMP:4 });

/* the grid: rows across the river, pole first */
export const GRID = Object.freeze({ ACROSS:2.7, ROW:3.6, MAX_PER_ROW:5, MARGIN:2.2 });
/* where arrived riders park: past the finish, along the bar's bank */
export const BEACH = Object.freeze({ PAST:6, ALONG:2.4, IN:1.3, COLUMNS:2, PULL:2.2 });
