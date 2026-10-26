/* The river under the music (pure). One continuous bed of overlapping
   stretches (soundKit floatRiver, a cut recipe), each RIVER_SEG_MS long and
   laid every RIVER_STEP_MS on the server's grid, so the equal-power ends
   of each pair overlap and the river never breathes. Each stretch moves
   its layers from the last stretch's mix to the one the river has now:

     lobby, feedback, intro   a calm pool at night, the crickets out
     grid, countdown          the water at the start line
     race                     the water where the pack is: the zone under
                              the leaders (riffle and narrows louder, the
                              whirlpool circling), and the roar of the next
                              waterfall growing from 140 m out
     cut, podium              the calm water at the takeout bar

   The levels sit under the band: a pool about 40 dB under full scale, the
   roar at the lip about 26. Reduced motion: no river. */
import { legOf, riverS, roarAt, zoneAt } from "./cup.js";

export const RIVER_STEP_MS = 2250;
export const RIVER_SEG_MS = 3000;
export const RIVER_FADE_MS = RIVER_SEG_MS - RIVER_STEP_MS;
export const RIVER_LEAD_MS = 400;

/* each zone's mix (soundKit FLOAT_RIVER_LAYERS) */
export const RIVER_MIX = Object.freeze({
  pool:Object.freeze({ flow:0.42, tone:420, babble:0.1, hiss:0, roar:0, swirl:0, laps:1, plips:0.5 }),
  eddy:Object.freeze({ flow:0.5, tone:520, babble:0.22, hiss:0, roar:0, swirl:0.15, laps:0.6, plips:0.8 }),
  riffle:Object.freeze({ flow:0.66, tone:820, babble:0.7, hiss:0.25, roar:0, swirl:0, laps:0, plips:1.4 }),
  narrows:Object.freeze({ flow:0.95, tone:1250, babble:0.5, hiss:0.55, roar:0, swirl:0, laps:0, plips:0.8 }),
  whirlpool:Object.freeze({ flow:0.7, tone:700, babble:0.3, hiss:0.15, roar:0, swirl:1, laps:0, plips:0.9 }),
  split:Object.freeze({ flow:0.78, tone:950, babble:0.65, hiss:0.35, roar:0, swirl:0, laps:0, plips:1.2 }),
  drop:Object.freeze({ flow:1, tone:1450, babble:0.45, hiss:0.7, roar:0, swirl:0, laps:0, plips:1 }),
  bar:Object.freeze({ flow:0.36, tone:380, babble:0.08, hiss:0, roar:0, swirl:0, laps:1, plips:0.4 }),
});
/* the leg's own water when the course has not arrived */
const LEG_ZONE = Object.freeze(["pool", "narrows", "whirlpool", "drop"]);
/* how loud the river is, by where the Cup is */
const PHASE_LEVEL = Object.freeze({ lobby:0.8, feedback:0.8, intro:0.9, grid:1, countdown:1, race:1, cut:0.85, podium:0.6 });
const CRICKETS = Object.freeze({ lobby:1, feedback:1, intro:0.6, grid:0.35, countdown:0.2, race:0, cut:0.5, podium:0.3 });

/* the river's bed while the screen is up (null: none) */
export const riverTrack = (mem, { reduced = false } = {}) => reduced || !mem?.view ? null : { key:"river", anchor:0 };
/* the field's paddles run together into churn once they come faster than a few a second */
export const churnOf = rate => Math.max(0, Math.min(1, ((Number(rate) || 0) - 3) / 25));

/* The mix the river has now: the zone, the roar, the crickets, the level. */
export function riverMix(mem) {
  const v = mem?.view;
  const phase = v?.phase || "lobby", info = mem?.course;
  let kind = "pool", roar = 0;
  if (phase === "cut" || phase === "podium") kind = "bar";
  else if (phase === "grid" || phase === "countdown" || phase === "race") {
    const leg = legOf(info, v.leg);
    const s = phase === "race" && Number.isFinite(mem.pack?.focusS) ? mem.pack.focusS : leg ? leg.base + 1 : null;
    if (info && Number.isFinite(s)) { kind = zoneAt(info, s); roar = phase === "race" ? roarAt(info, s) : 0; }
    else if (phase === "race") kind = LEG_ZONE[Math.min(3, v.leg)] || "pool";
  }
  const base = RIVER_MIX[kind] || RIVER_MIX.pool;
  /* the falls: the roar in, the spray up, the rest of the river under it */
  return { ...base, roar:Math.max(base.roar, roar), hiss:Math.max(base.hiss, roar * 0.8), flow:base.flow * (1 + roar * 0.3),
    churn:phase === "race" ? churnOf(mem?.paddle?.rate) : 0, crickets:CRICKETS[phase] ?? 0, level:PHASE_LEVEL[phase] ?? 0.8, zone:kind };
}
/* a layer mix as the recipe takes it (no zone name) */
const layers = mix => { const { zone, ...rest } = mix || {}; void zone; return rest; };

/* the stretch laid at grid index `index`, from the last stretch's mix to the river's now */
export function riverCue(index, mem, last) {
  const to = layers(riverMix(mem));
  return { id:"floatRiver", at:index * RIVER_STEP_MS, opts:{ ms:RIVER_SEG_MS, fade:RIVER_FADE_MS, from:last || to, to } };
}
export const riverS0 = (mem, p) => riverS(mem?.course, mem?.view?.leg ?? 0, p);
