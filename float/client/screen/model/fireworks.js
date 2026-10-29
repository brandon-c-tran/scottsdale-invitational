/* Fireworks, the final (float/GROOVE.md v3 item 9) and the blackout bars
   (item 8), as the screen draws them. Pure: everything from the chart, the
   song's beat 0, the judgements and the clock, so every TV draws the same
   frame and the picture lands with the sound (float/client/sound:
   ROCKET_BURST_MS, BURST_SIZE, skyBeat, darkBars; the same numbers here so
   the picture never waits on the sound module). */
import { BEATS_PER_BAR } from "../../../shared/chart.js";

/* a rocket bursts a beat after its launch (the tap) */
export const ROCKET_BURST_MS = 500;
/* the burst's size by the judgement (early and late still pop, small) */
export const BURST_SIZE = Object.freeze({ perfect:1, nice:0.75, ok:0.55, early:0.3, late:0.3 });
/* how long a burst hangs and falls, a fizzle sputters (ms) */
export const FIRE = Object.freeze({ BURST_MS:1500, FIZZLE_MS:900, SKY_RAMP_MS:900, SKY_BURSTS:9, SKY_GAP_MS:190 });

/* the blackout bars: chart.dark's bar indices */
export const darkBars = chart => new Set((Array.isArray(chart?.dark) ? chart.dark : []).map(Number).filter(Number.isInteger));
/* is the bar at this beat a blackout? */
export function darkAt(chart, beat) {
  if (!chart || !Number.isFinite(beat) || !Array.isArray(chart.dark) || !chart.dark.length) return false;
  return chart.dark.includes(Math.floor(beat / BEATS_PER_BAR));
}

/* the beat the sky fills after the finale: two beats after the last cue
   when the song ends on rockets, else null */
export function skyBeat(chart) {
  const cues = chart?.cues || [];
  const last = cues[cues.length - 1];
  if (!last || last.kind !== "rocket" || !Number.isFinite(chart?.beats)) return null;
  return Math.min(last.beat + 2, chart.beats - 2);
}

/* a stable 0..1 from numbers (each rider's rocket goes up to its own height) */
const hash = (...parts) => {
  let h = 2166136261;
  for (const p of parts) { h ^= (p | 0) + 0x9e3779b9; h = Math.imul(h, 16777619); h ^= h >>> 13; }
  return ((h >>> 0) % 10007) / 10007;
};

/* Every firework in the air at `now`: [{ key, i, kind:"burst"|"fizzle",
   launchAt, at, size, peak (0..1, how high), color? }]. A judged rocket hit
   bursts at max(its beat + ROCKET_BURST_MS, the hit's arrival), launched a
   beat before; a missed rocket fizzles as the room calls it; the host's demo
   rockets are everyone's (a small one each). `judged` maps a rider to
   Map(cue id -> { q, at }); `field` the riders on the water. */
export function fireworksAt({ chart, songAt, judged, field = [], now }) {
  if (!chart?.cues || !Number.isFinite(songAt) || !Number.isFinite(now)) return [];
  const beatMs = chart.beatMs || 500;
  const out = [];
  const rockets = new Map(chart.cues.filter(cue => cue.kind === "rocket").map(cue => [cue.id, cue]));
  if (!rockets.size) return out;
  for (const i of field) {
    const mine = judged?.get?.(i);
    if (mine) for (const [c, j] of mine) {
      const cue = rockets.get(c);
      if (!cue || !j) continue;
      if (j.q === "miss") {
        const at = Number.isFinite(j.at) ? j.at : songAt + cue.beat * beatMs;
        if (now >= at && now < at + FIRE.FIZZLE_MS) out.push({ key:`${i}:${c}`, i, kind:"fizzle", launchAt:at, at, size:0.3, peak:0.15 });
        continue;
      }
      const at = Math.max(songAt + cue.beat * beatMs + ROCKET_BURST_MS, Number.isFinite(j.at) ? j.at : -Infinity);
      const launchAt = at - ROCKET_BURST_MS;
      if (now >= launchAt && now < at + FIRE.BURST_MS) out.push({ key:`${i}:${c}`, i, kind:"burst", launchAt, at, size:BURST_SIZE[j.q] ?? 0.55, peak:0.35 + 0.65 * hash(i, c) });
    }
    for (const cue of rockets.values()) {
      if (!cue.demo) continue;
      const at = songAt + cue.beat * beatMs + ROCKET_BURST_MS;
      if (now >= at - ROCKET_BURST_MS && now < at + FIRE.BURST_MS) out.push({ key:`${i}:d${cue.id}`, i, kind:"burst", launchAt:at - ROCKET_BURST_MS, at, size:0.45, peak:0.3 + 0.6 * hash(i, cue.id) });
    }
  }
  return out;
}

/* the sky after the finale: { fill (0..1), bursts:[{ key, x (0..1 across), at, size, peak }] }
   in the winner's colour, or null before skyBeat */
export function skyAt(chart, songAt, now) {
  const beat = skyBeat(chart);
  if (beat === null || !Number.isFinite(songAt) || !Number.isFinite(now)) return null;
  const from = songAt + beat * (chart.beatMs || 500);
  if (now < from) return null;
  const fill = Math.min(1, (now - from) / FIRE.SKY_RAMP_MS);
  const bursts = [];
  for (let k = 0; k < FIRE.SKY_BURSTS; k += 1) {
    const at = from + 300 + k * FIRE.SKY_GAP_MS;
    if (now >= at - ROCKET_BURST_MS && now < at + FIRE.BURST_MS) bursts.push({ key:`sky:${k}`, x:(k * 0.618 + 0.11) % 1, at, launchAt:at - ROCKET_BURST_MS, size:1, peak:0.4 + 0.6 * hash(k, 77) });
  }
  return { fill, from, bursts };
}

/* a firework drawn at `now`: { phase:"launch"|"burst", y (0 to 1 of the
   rise), t (0..1 through its phase) } */
export function fireworkPhase(fw, now) {
  if (now < fw.at) return { phase:"launch", t:Math.max(0, Math.min(1, (now - fw.launchAt) / Math.max(1, fw.at - fw.launchAt))) };
  const life = fw.kind === "fizzle" ? FIRE.FIZZLE_MS : FIRE.BURST_MS;
  return { phase:"burst", t:Math.max(0, Math.min(1, (now - fw.at) / life)) };
}
