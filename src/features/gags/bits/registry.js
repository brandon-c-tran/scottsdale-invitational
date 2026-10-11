/* Bits (Oct 10): the TV's comic moments, the cast being the players' own
   photo chips with floating gloves. A bit is a few seconds of straight-faced
   physical comedy written for a SHAPE of moment, in one of three styles,
   picked at random per moment from its shape's pool.

     versus  an upset: cast.a won, cast.b was beaten
     win     a run of wins, a new leader: cast.a
     loss    a big losing bet, a new last place: cast.a
     idle    the TV's downtime (no cast needed)

   This file is the contract, pure data and nothing that draws (the scenes
   are bits/scenes.jsx, keyed by id), so the moment model, the TV, a phone
   and the tests read the same timings:

     id, name   the bit, and what the reel calls it
     shape, style
     ms         its length; a moment bit runs MOMENT_MS.min to .max
     beats      named instants (ms from its start): the scene's CSS reads
                each as var(--b-<name>) and its cues land on them, so
                retiming a beat moves the motion and the sound together
     still      the punchline instant: reduced motion shows this frame
     summary    reduced motion's one sound, at the start
     letter     { at, over, place }: when the name (and the moment's fact)
                stamps on the sky, whose name, and where the shot leaves room
                for it (top-left, top-right or top)
     camera     the shot (bits/camera.js): its zoom and centre, moves on the
                bit's clock, shakes and washes
     cast       the roles the scene needs: { a:{ role, max }, b:... }
     cues       [{ at, sound, pan, opts }]: kit recipes on the room bus
     fits       the triggers it suits (default: every trigger of its shape) */
import { CAMERA_EASE } from "./camera.js";

export const BIT_SHAPES = Object.freeze({
  versus:Object.freeze({ name:"Versus", triggers:Object.freeze(["An upset"]) }),
  win:Object.freeze({ name:"Win", triggers:Object.freeze(["3 straight wins", "A new leader"]) }),
  loss:Object.freeze({ name:"Loss", triggers:Object.freeze(["A big losing bet", "A new last place"]) }),
  idle:Object.freeze({ name:"Idle", triggers:Object.freeze(["Between games"]) }),
});
export const SHAPES = Object.freeze(Object.keys(BIT_SHAPES));
export const BIT_STYLES = Object.freeze({ action:"Action movie", slapstick:"Cartoon slapstick", desert:"Deadpan desert" });
export const STYLES = Object.freeze(Object.keys(BIT_STYLES));
/* a moment bit's length; idle vignettes may run longer */
export const MOMENT_MS = Object.freeze({ min:3000, max:5500 });
/* how long a bit takes to come up on the painting and to lift off it */
export const BIT_IN_MS = 260;
export const BIT_OUT_MS = 380;
/* how long the name and the fact take to stamp onto the sky (bits.css
   bit-stamp, the fact a beat behind): a still shows them landed */
export const LETTER_LAND_MS = 480;
export const LETTER_PLACES = Object.freeze(["top-left", "top-right", "top"]);

const freezeAll = value => Array.isArray(value) ? Object.freeze(value.map(freezeAll))
  : value && typeof value === "object" ? Object.freeze(Object.fromEntries(Object.entries(value).map(([k, v]) => [k, freezeAll(v)]))) : value;
const freeze = bit => freezeAll({ ...bit, fits:bit.fits || BIT_SHAPES[bit.shape].triggers });

/* ── quickdraw: an upset at high noon. Far apart on the floor, the wind,
   a tumbleweed between them, the long hold. B's hand twitches; A's whips
   out a revolver far too small: BANG, and the kick knocks A back a step,
   shoes skidding. The camera whips to B: nothing happens. Then B goes over
   backwards, stiff as a board. A blows the smoke off the barrel, spins
   it... and fumbles it. ── */
const QD = { tumble:40, twitch:1360, draw:1580, bang:1660, kick:1700, whip:2040, fall:2700, land:3040, blow:3380, spin:3700,
  fumble:4080, bonk:4210, drop:4470, look:4600 };
const quickdraw = {
  id:"quickdraw", name:"Quick draw", shape:"versus", style:"action", ms:5400, beats:QD, still:5020, summary:"bitCrack",
  letter:{ at:QD.land + 200, over:"a", place:"top-left" },
  camera:{ zoom:1.5, x:"mid", fit:true, moves:[
    /* lean in through the standoff */
    { at:300, ms:1250, zoom:1.6 },
    /* punch in on the shot, and stay for its kick */
    { at:QD.bang, ms:90, zoom:1.95, x:"a", ease:CAMERA_EASE.snap },
    /* whip to B, who just stands there */
    { at:QD.whip, ms:170, zoom:1.95, x:"b", ease:CAMERA_EASE.whip },
    /* back out for the rest of it */
    { at:QD.land + 60, ms:480, zoom:1.5, x:"mid" },
  ], shakes:[{ at:QD.bang, big:true }, { at:QD.land }], washes:[QD.bang] },
  cast:{ a:{ role:"winner", max:4 }, b:{ role:"beaten", max:4 } },
  cues:[
    { at:0, sound:"bitWind", pan:0, opts:{ ms:QD.twitch + 200 } },
    { at:QD.tumble + 367, sound:"bitHop", pan:0.3, opts:{ step:0 } },
    { at:QD.tumble + 733, sound:"bitHop", pan:-0.28, opts:{ step:1 } },
    { at:QD.draw, sound:"bitDraw", pan:-0.3 },
    { at:QD.bang, sound:"bitCrack", pan:-0.25 },
    { at:QD.kick, sound:"bitSkid", pan:-0.4 },
    { at:QD.whip, sound:"bitStreak", pan:0, opts:{ from:-0.4, to:0.4 } },
    { at:QD.land, sound:"bitThud", pan:0.3 },
    { at:QD.blow, sound:"bitPuff", pan:-0.42 },
    { at:QD.spin, sound:"bitTwirl", pan:-0.38 },
    { at:QD.bonk, sound:"bitBonk", pan:-0.38 },
    { at:QD.drop, sound:"bitClink", pan:-0.3 },
  ],
};

/* ── anvil: the chip admires its own stack. A shadow grows under it.
   It looks up. CLANG: a pancake, stars going round. It peels itself off
   the floor like a sticker, boings back into shape, turns to the room for
   a beat, and limps off on one shoe (the other is still flat on the
   floor). ── */
const AN = { admire:200, shadow:420, notice:1640, sweat:1750, drop:1900, hit:2020, rebound:2080, stars:2130, thud:2350,
  peel:2780, pop:3100, look:3560, limp:4580 };
const anvil = {
  id:"anvil", name:"Anvil", shape:"loss", style:"slapstick", ms:5450, beats:AN, still:2720, summary:"bitClang",
  letter:{ at:AN.stars + 60, over:"a", place:"top-right" },
  /* world x: the chip stands at 820, its stack at 1180 (anvil.jsx) */
  camera:{ zoom:1.8, x:900, moves:[
    /* ease in while the shadow grows */
    { at:AN.shadow, ms:1220, zoom:1.92, x:860 },
    /* the clang */
    { at:AN.hit, ms:70, zoom:2, x:830, ease:CAMERA_EASE.snap },
    /* back out for the pancake and its stars */
    { at:AN.stars + 120, ms:520, zoom:1.8, x:860 },
    /* in on it, looking at the room */
    { at:AN.look, ms:520, zoom:2.3, x:815 },
    /* out as it limps off */
    { at:AN.limp, ms:700, zoom:1.8, x:760 },
  ], shakes:[{ at:AN.hit, big:true }, { at:AN.thud }] },
  cast:{ a:{ role:"loser", max:1 } },
  cues:[
    { at:AN.shadow, sound:"bitWhistle", pan:0, opts:{ ms:AN.notice - AN.shadow - 160 } },
    { at:AN.hit, sound:"bitClang", pan:-0.1 },
    { at:AN.thud, sound:"bitThud", pan:-0.4 },
    { at:AN.stars, sound:"bitStars", pan:-0.1, opts:{ ms:AN.peel - AN.stars - 80 } },
    { at:AN.peel, sound:"bitPeel", pan:-0.1 },
    { at:AN.pop, sound:"bitBoing", pan:-0.1 },
    /* each limp lands at the end of its 240 ms hop (anvil.css an-limp-bob) */
    ...[0, 1, 2].map(i => ({ at:AN.limp + 240 * (i + 1), sound:"bitHop", pan:Math.round((-0.12 - i * 0.14) * 100) / 100, opts:{ step:i } })),
  ],
};

/* ── roadrunner: the chip alone on the floor, the wind. A roadrunner
   comes in like a shot and skids a long way to a stop beside it, heels
   in, leaning back into its own dust. It leans in: beep beep. Gone, and
   the chip with it. When the dust clears only its shadow is left. The
   shadow notices, pulls back, winds itself up on the spot, and runs off
   after it. ── */
const RR = { arrive:1000, skid:1110, stop:1410, beep:1760, turn:1800, leave:2160, clear:2900, notice:3420, windup:3640, zip:4140 };
const roadrunner = {
  id:"roadrunner", name:"Roadrunner", shape:"loss", style:"desert", ms:5000, beats:RR, still:3390, summary:"bitBeep",
  letter:{ at:RR.clear, over:"a", place:"top-left" },
  /* world x: the chip stands at 880, the bird stops at 1330 (roadrunner.jsx) */
  camera:{ zoom:1.8, x:1080, moves:[
    /* the chip alone: the faintest drift in */
    { at:0, ms:RR.arrive - 80, zoom:1.86, x:1060 },
    /* lean in on what is left */
    { at:RR.clear - 120, ms:720, zoom:2.3, x:910 },
    /* a flinch after it as it goes, then the empty floor */
    { at:RR.zip, ms:240, zoom:2.1, x:740, ease:CAMERA_EASE.whip },
  ], shakes:[{ at:RR.stop }] },
  cast:{ a:{ role:"loser", max:1 } },
  cues:[
    { at:0, sound:"bitWind", pan:0, opts:{ ms:4800 } },
    { at:RR.arrive, sound:"bitStreak", pan:0, opts:{ from:0.95, to:0.5 } },
    { at:RR.skid, sound:"bitSkid", pan:0.45, opts:{ ms:RR.stop - RR.skid } },
    { at:RR.beep, sound:"bitBeep", pan:0.34 },
    { at:RR.leave, sound:"bitStreak", pan:0, opts:{ from:0.35, to:-0.95 } },
    { at:RR.notice, sound:"bitBoing", pan:0, opts:{ small:true } },
    { at:RR.windup, sound:"bitRev", pan:0.08, opts:{ ms:RR.zip - RR.windup } },
    { at:RR.zip, sound:"bitZip", pan:-0.2 },
  ],
};

/* ══ action movie, played straight like a trailer ══ */

/* ── explosionwalk: the winner walks toward us in dark glasses, gloves
   swinging. Behind it the horizon goes up in a fireball; it does not
   flinch, and the shot drops into slow motion. A burning chip comes down
   out of the sky and slams into the dirt beside it as the speed snaps
   back; it does not look. It stops close, pulls the glasses down with one
   finger and looks at us over them. A beat. Pushes them back up. ──
   The walk's steps are timed from these beats (explosionwalk.css): three
   from the start to the boom, one slow one from the boom to the land, one
   from the land to the stop. */
const EW = { boom:1200, ember:1420, land:2600, stop:3000, lower:3260, look:3440, up:4040, glint:4170 };
const explosionwalk = {
  id:"explosionwalk", name:"Explosion walk", shape:"win", style:"action", ms:4800, beats:EW, still:3800, summary:"bitBoom",
  letter:{ at:EW.stop + 20, over:"a", place:"top-left" },
  /* world x: the walkers centre on 960 and come toward us (explosionwalk.jsx) */
  camera:{ zoom:1.45, x:"walk", moves:[
    /* the slow motion leans in */
    { at:EW.boom + 80, ms:EW.land - EW.boom - 80, zoom:1.62 },
    /* it arrives */
    { at:EW.land, ms:EW.stop - EW.land + 120, zoom:1.86, x:"lead" },
    /* in on the look over the glasses */
    { at:EW.lower - 40, ms:460, zoom:2.45, x:"lead" },
  ], shakes:[{ at:EW.boom, big:true }, { at:EW.land }], washes:[EW.boom] },
  cast:{ a:{ role:"winner", max:4 } },
  cues:[
    { at:400, sound:"bitStep", pan:-0.06, opts:{ step:0 } },
    { at:800, sound:"bitStep", pan:0.06, opts:{ step:1 } },
    { at:EW.boom, sound:"bitBoom", pan:0.04, opts:{ slow:true } },
    { at:EW.land, sound:"bitSlam", pan:0.3 },
    { at:EW.land + 10, sound:"bitStep", pan:0.06, opts:{ step:1 } },
    { at:EW.stop, sound:"bitStep", pan:-0.06, opts:{ step:2 } },
    { at:EW.lower + 30, sound:"bitShades", pan:0.04 },
    { at:EW.up, sound:"bitShades", pan:0.04, opts:{ up:true } },
    { at:EW.glint, sound:"bitGlint", pan:0.1 },
  ],
};

/* ── dontlookback: the loser stands facing us, its own tall stack of chips
   behind its shoulder. A fuse fizzes up the stack. It does not notice.
   The fizz stops. A beat. The stack goes up. It does not turn round: it
   stands there, scorched from the middle down. Its chips come down all
   round it, one off the top of its head (it dips and comes back), and the
   last spins down and lands on its head, flat, like a hat. ── */
const DL = { fuse:340, top:1340, boom:1780, rain:2280, bonk:2760, hat:3420 };
const dontlookback = {
  id:"dontlookback", name:"Don't look back", shape:"loss", style:"action", ms:4600, beats:DL, still:4040, summary:"bitBoom",
  letter:{ at:DL.hat + 60, over:"a", place:"top-left" },
  /* world x: the chip stands at 860, its stack behind it at 1050 (dontlookback.jsx) */
  camera:{ zoom:1.8, x:940, moves:[
    /* lean in on the fuse */
    { at:DL.fuse, ms:DL.top - DL.fuse, zoom:1.9, x:960 },
    /* in on the face that does not move, while its chips come down */
    { at:DL.boom + 420, ms:1500, zoom:2.12, x:880 },
  ], shakes:[{ at:DL.boom, big:true }, { at:DL.bonk }], washes:[DL.boom] },
  cast:{ a:{ role:"loser", max:1 } },
  cues:[
    { at:DL.fuse, sound:"bitFuse", pan:0.22, opts:{ ms:DL.top - DL.fuse } },
    { at:DL.boom, sound:"bitBoom", pan:0.2 },
    /* the chips landing (dontlookback.jsx RAIN), the bonk, the hat */
    ...[[0, -0.42], [150, 0.34], [250, -0.2], [380, 0.46], [560, -0.5], [700, 0.28]].map(([dt, pan], i) =>
      ({ at:DL.rain + dt, sound:"bitChipDrop", pan, opts:{ step:i } })),
    { at:DL.bonk, sound:"bitBonk", pan:-0.08 },
    { at:DL.hat, sound:"bitSpinDown", pan:-0.06 },
  ],
};

/* ── quicksand: the chip stands on a patch of sand, and starts to go down
   into it. It looks down. It flails, grabs at the air, reaches for the
   arm of a saguaro that is just too far. Down it goes until one glove is
   left above the sand; the glove gives a slow thumbs up as it sinks out of
   sight. One bubble. ── */
const QS = { sink:520, notice:1300, flail:1700, reach:2380, slip:2860, under:3160, thumb:3330, gone:3480, bubble:4230 };
const quicksand = {
  id:"quicksand", name:"Quicksand", shape:"loss", style:"action", ms:4800, beats:QS, still:3780, summary:"bitSink",
  letter:{ at:QS.under + 40, over:"a", place:"top-left" },
  /* world x: the chip sinks at 860, the saguaro stands at 1340 (quicksand.jsx) */
  camera:{ zoom:1.8, x:1060, moves:[
    /* it looks down: so do we */
    { at:QS.notice, ms:520, zoom:1.9, x:1010 },
    /* the reach, and the gap */
    { at:QS.reach - 60, ms:360, zoom:2.15, x:1090 },
    /* the last glove */
    { at:QS.under - 80, ms:700, zoom:2.4, x:"glove" },
  ], shakes:[] },
  cast:{ a:{ role:"loser", max:1 } },
  cues:[
    { at:0, sound:"bitWind", pan:0, opts:{ ms:1700 } },
    { at:QS.sink, sound:"bitSink", pan:-0.1, opts:{ ms:QS.notice - QS.sink } },
    { at:QS.flail, sound:"bitFlail", pan:-0.1, opts:{ ms:QS.reach - QS.flail } },
    { at:QS.flail + 80, sound:"bitSink", pan:-0.1, opts:{ ms:QS.under - QS.flail } },
    { at:QS.reach, sound:"bitStrain", pan:0.18, opts:{ ms:QS.slip - QS.reach } },
    { at:QS.under, sound:"bitSink", pan:-0.08, opts:{ ms:320, deep:true } },
    { at:QS.thumb, sound:"bitSqueak", pan:0.04 },
    { at:QS.gone, sound:"bitSink", pan:0.04, opts:{ ms:QS.bubble - QS.gone - 80 } },
    { at:QS.bubble, sound:"bitBubble", pan:0.04 },
  ],
};

const ACTION_BITS = [explosionwalk, dontlookback, quicksand];

export const BITS = Object.freeze([quickdraw, anvil, roadrunner, ...ACTION_BITS].map(freeze));
const BY_ID = new Map(BITS.map(bit => [bit.id, bit]));
export const bitById = id => BY_ID.get(id) || null;
export const bitsOf = shape => BITS.filter(bit => bit.shape === shape);

/* FNV-1a over a string: the same seed hashes the same on every screen */
export function seedHash(text) {
  let h = 0x811c9dc5;
  for (const ch of String(text)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/* The bit a moment plays: one of its shape's pool, picked by its seed
   (the moment's own key, so every TV and phone picks the same), never one
   in `recent` (bit ids already played, newest last) while any other
   remains; when all have played, never the newest again if the pool has
   another. Null for a shape with no bits. */
export function pickBit(shape, seed, recent = []) {
  const pool = bitsOf(shape);
  if (!pool.length) return null;
  const played = Array.isArray(recent) ? recent : [];
  let candidates = pool.filter(bit => !played.includes(bit.id));
  if (!candidates.length) {
    const newest = played[played.length - 1];
    candidates = pool.length > 1 ? pool.filter(bit => bit.id !== newest) : pool;
  }
  return candidates[seedHash(`${shape}:${seed}`) % candidates.length];
}

/* a bit's beats as custom properties for its scene's CSS */
export const beatVars = bit => Object.fromEntries(Object.entries(bit?.beats || {}).map(([name, ms]) => [`--b-${name}`, `${Math.round(ms)}ms`]));
