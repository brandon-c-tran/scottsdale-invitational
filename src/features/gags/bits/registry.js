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

/* ═══ the slapstick bits (springglove, toohype, dynamite) ═══ */

/* ── springglove: an upset. B is mid victory bounce, fists up; A stands
   off to the side with a boxing glove on a spring in a box, aimed at B.
   B turns and sees it. Nothing. A slams the button: the glove punches B
   off in a straight line into the distance. The spring quivers over the
   empty spot. A star pings where B went. The spring snaps back, clean
   through the box and out its back into A's face; A wobbles, turns to the
   room, thumbs up. ── */
const SG = { hop:0, turn:800, raise:1320, press:1540, fire:1570, hit:1650, fly:1710, twinkle:2450, retract:3000, home:3130, boop:3240,
  look:3760, thumb:4080 };
const springglove = {
  id:"springglove", name:"Spring glove", shape:"versus", style:"slapstick", ms:4850, beats:SG, still:4420, summary:"bitPow",
  letter:{ at:SG.look + 120, over:"a", place:"top-left" },
  camera:{ zoom:1.5, x:"mid", fit:true, moves:[
    /* lean in on the bounce and the standoff */
    { at:200, ms:1200, zoom:1.56 },
    /* after the punch, drift to the empty spot and the sky over it */
    { at:SG.fly + 160, ms:620, zoom:1.45, x:"sky" },
    /* whip back with the spring to A */
    { at:SG.retract - 30, ms:200, zoom:1.95, x:"a", ease:CAMERA_EASE.whip },
    /* in on A for the thumbs up */
    { at:SG.look, ms:1000, zoom:2.06 },
  ], shakes:[{ at:SG.hit, big:true }, { at:SG.home }] },
  cast:{ a:{ role:"winner", max:4 }, b:{ role:"beaten", max:4 } },
  cues:[
    ...[0, 1, 2].map(i => ({ at:SG.hop + 260 * i + 218, sound:"bitHop", pan:0.42, opts:{ step:i } })),
    { at:SG.press, sound:"bitClick", pan:-0.22 },
    { at:SG.fire, sound:"bitSproing", pan:0.05 },
    { at:SG.hit, sound:"bitPow", pan:0.38 },
    { at:SG.fly, sound:"bitStreak", pan:0.45, opts:{ from:0.4, to:0.95 } },
    { at:SG.twinkle, sound:"bitTwinkle", pan:0.62 },
    { at:SG.retract, sound:"bitZip", pan:0.25 },
    { at:SG.boop, sound:"bitBonk", pan:-0.36 },
    { at:SG.boop + 60, sound:"bitBoing", pan:-0.36, opts:{ small:true } },
  ],
};

/* ── toohype: a run of wins. It bounces on the spot, fists pumping, each
   bounce higher. The fourth goes straight up out of the frame, right out
   of its shoes. The shoes alone, a beat. It comes back down, misses them
   and drives into the ground up to its middle. A glove comes up out of
   the dirt, thumb up. The shoes walk over to it on their own. ── */
const TH = { hop1:0, hop2:270, hop3:630, wind:1110, launch:1330, fall:2200, crash:2400, pop:2940, turn:3280, walk:3400, arrive:4000 };
const toohype = {
  id:"toohype", name:"Too hype", shape:"win", style:"slapstick", ms:4500, beats:TH, still:4100, summary:"bitPlant",
  letter:{ at:TH.pop, over:"a", place:"top-left" },
  camera:{ zoom:1.8, x:"mid", fit:true, moves:[
    /* lean in with the bounces */
    { at:200, ms:1000, zoom:1.86 },
    /* the shoes, alone: creep in on them */
    { at:TH.launch + 260, ms:640, zoom:1.98, x:"beat" },
    /* back out for the shoes' walk */
    { at:TH.crash + 260, ms:700, zoom:1.84, x:"mid" },
  ], shakes:[{ at:TH.crash, big:true }] },
  cast:{ a:{ role:"winner", max:2 } },
  cues:[
    { at:TH.hop1 + 70, sound:"bitBounce", pan:-0.12, opts:{ step:0 } },
    { at:TH.hop2 + 60, sound:"bitBounce", pan:-0.12, opts:{ step:1 } },
    { at:TH.hop3 + 60, sound:"bitBounce", pan:-0.12, opts:{ step:2 } },
    { at:TH.launch, sound:"bitLaunch", pan:-0.12 },
    { at:TH.fall - 60, sound:"bitFall", pan:0.24, opts:{ ms:260 } },
    { at:TH.crash, sound:"bitPlant", pan:0.24 },
    { at:TH.crash + 60, sound:"bitBoing", pan:0.24 },
    { at:TH.pop, sound:"bitPop", pan:0.4 },
    { at:TH.turn, sound:"bitSqueak", pan:-0.12, opts:{ step:1 } },
    ...[0, 1, 2, 3, 4, 5].map(j => ({ at:TH.walk + 100 * (j + 1), sound:"bitSqueak", pan:Math.round((-0.1 + j * 0.04) * 100) / 100, opts:{ step:j } })),
  ],
};

/* ── dynamite: a loss. A cupcake at a little party table; the chip strikes
   a match and lights the candle, a stick of dynamite, and leans in,
   delighted. It stops. A sweat drop. It looks at the room. BOOM. The smoke
   clears: black with soot, the same pose, the cupcake gone. One cough of
   smoke. A glove drops off into the dirt. ── */
const DY = { strike:300, light:650, lit:680, out:900, admire:1100, realize:1800, look:2050, boom:2850, clear:3500, cough:3780,
  drop:4080, land:4260 };
const dynamite = {
  id:"dynamite", name:"Dynamite", shape:"loss", style:"slapstick", ms:4800, beats:DY, still:4400, summary:"bitBoom",
  letter:{ at:DY.clear, over:"a", place:"top-right" },
  /* world x: the chip stands at 820, the table at 1080 (dynamite.jsx) */
  camera:{ zoom:1.8, x:"mid", moves:[
    /* in a little as it leans in to admire it */
    { at:DY.admire, ms:800, zoom:1.92, x:930 },
    /* in on its face as it turns to the room */
    { at:DY.look, ms:520, zoom:2.25, x:"chip" },
    /* the blast throws the shot back */
    { at:DY.boom, ms:90, zoom:1.72, x:"mid", ease:CAMERA_EASE.snap },
    /* and it creeps back in on what is left */
    { at:DY.clear - 200, ms:1100, zoom:1.95, x:880 },
  ], shakes:[{ at:DY.boom, big:true }], washes:[DY.boom] },
  cast:{ a:{ role:"loser", max:1 } },
  cues:[
    { at:DY.strike, sound:"bitMatch", pan:0 },
    { at:DY.lit, sound:"bitFuse", pan:0.2, opts:{ ms:DY.boom - DY.lit } },
    { at:DY.boom, sound:"bitBoom", pan:0.1 },
    { at:DY.cough, sound:"bitCough", pan:-0.12 },
    { at:DY.land, sound:"bitFlop", pan:-0.3 },
  ],
};

export const BITS = Object.freeze([quickdraw, anvil, roadrunner, springglove, toohype, dynamite].map(freeze));
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
