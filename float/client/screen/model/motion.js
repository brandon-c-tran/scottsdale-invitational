/* How a rider moves (float/GROOVE.md "The look": everything bounces on the
   beat, squash and stretch, deadpan reactions). Pure functions of the
   server clock, so every screen draws the same frame and a frozen clock
   holds one: the bob from the song's beat, an action from the judged hit's
   stamp, the popup from the same stamp for POPUP_MS. */
import { POPUP_MS } from "../../../shared/chart.js";

/* the bob: a dip on every beat, squashed, easing back up */
export const BOB = Object.freeze({ DIP:7, SQUASH:0.055, STRETCH:0.018 });

export function bobAt(beat, { amp = 1 } = {}) {
  if (!Number.isFinite(beat)) return { dy:0, sx:1, sy:1 };
  const phase = beat - Math.floor(beat);
  const fall = Math.pow(1 - phase, 3);
  const rise = Math.sin(Math.PI * phase);
  const squash = Math.max(0, 1 - phase / 0.22);
  return {
    dy:(BOB.DIP * fall - BOB.DIP * 0.35 * rise) * amp,
    sx:1 + (BOB.SQUASH * squash - BOB.STRETCH * rise * 0.5) * amp,
    sy:1 - (BOB.SQUASH * squash - BOB.STRETCH * rise) * amp,
  };
}

/* what a tap looks like, by the cue's kind: the pose it strikes and how
   long the move runs (ms) */
export const ACTIONS = Object.freeze({
  paddle:{ pose:"stroke", ms:330 },
  hey:{ pose:"hey", ms:420 },
  hop:{ pose:"cheer", ms:460 },
  spin:{ pose:"hey", ms:480 },
  drop:{ pose:"cheer", ms:1100 },
  /* Last Call: a reach up for the glass */
  grab:{ pose:"hey", ms:560 },
  miss:{ pose:"miss", ms:680 },
});
/* a good hit holds the pleased face a moment after its move */
export const PLEASED_MS = 520;
const ease = t => 1 - Math.pow(1 - t, 3);

/* A rider's move at server time `now` from their latest judged hit
   ({ at, q, kind }): { pose, dx, dy, rot, sx, sy, splash, done }, or null
   once it is over. A miss is the flub (splashed in the face, a wobble),
   whatever the cue. */
export function actionAt(hit, now) {
  if (!hit || !Number.isFinite(hit.at) || !Number.isFinite(now)) return null;
  const age = now - hit.at;
  if (age < 0) return null;
  const miss = hit.q === "miss";
  const kind = miss ? "miss" : ACTIONS[hit.kind] ? hit.kind : "paddle";
  const spec = ACTIONS[kind];
  const pleased = !miss && (hit.q === "perfect" || hit.q === "nice");
  const end = pleased ? Math.max(spec.ms, PLEASED_MS) : spec.ms;
  if (age >= end) return null;
  const t = Math.min(1, age / spec.ms);
  const out = { kind, pose:spec.pose, dx:0, dy:0, rot:0, sx:1, sy:1, splash:0, t };
  if (age >= spec.ms) { out.pose = "nice"; out.t = 1; return out; }
  if (kind === "paddle") {
    const dip = Math.sin(Math.PI * t);
    out.dy = 9 * dip;
    out.dx = 10 * dip;
    out.rot = -5 * dip;
    out.sx = 1 + 0.05 * dip;
    out.sy = 1 - 0.05 * dip;
    out.splash = 1 - t;
  } else if (kind === "hey") {
    const up = Math.sin(Math.PI * Math.min(1, t / 0.7));
    out.dy = -24 * up;
    out.sy = 1 + 0.06 * up;
    out.sx = 1 - 0.04 * up;
  } else if (kind === "hop") {
    const arc = Math.sin(Math.PI * Math.min(1, t / 0.82));
    out.dy = -78 * arc;
    const land = t > 0.82 ? Math.sin(Math.PI * (t - 0.82) / 0.18) : 0;
    out.sy = 1 + 0.08 * arc - 0.12 * land;
    out.sx = 1 - 0.05 * arc + 0.1 * land;
    out.splash = land;
  } else if (kind === "spin") {
    /* a paper doll turning round: its width through the flip, a small lift */
    out.sx = Math.cos(2 * Math.PI * ease(t));
    if (Math.abs(out.sx) < 0.06) out.sx = out.sx < 0 ? -0.06 : 0.06;
    out.dy = -16 * Math.sin(Math.PI * t);
    out.rot = 0;
  } else if (kind === "drop") {
    /* over the falls: up off the lip, down hard, a splash, back up */
    const up = t < 0.18 ? Math.sin((Math.PI / 2) * (t / 0.18)) : 0;
    const fall = t >= 0.18 && t < 0.5 ? ease((t - 0.18) / 0.32) : t >= 0.5 ? 1 - ease((t - 0.5) / 0.5) : 0;
    out.dy = -40 * up + 150 * fall;
    out.rot = 14 * fall;
    out.splash = t >= 0.45 && t < 0.85 ? 1 - (t - 0.45) / 0.4 : 0;
  } else if (kind === "grab") {
    const reach = Math.sin(Math.PI * Math.min(1, t / 0.75));
    out.dy = -30 * reach;
    out.sy = 1 + 0.07 * reach;
    out.sx = 1 - 0.04 * reach;
    out.rot = 6 * reach;
  } else if (kind === "miss") {
    const decay = 1 - t;
    out.rot = 10 * Math.sin(t * Math.PI * 5) * decay;
    out.dy = 5 * Math.sin(t * Math.PI * 3) * decay;
    out.sx = 1 + 0.04 * decay;
    out.sy = 1 - 0.04 * decay;
    out.splash = t < 0.5 ? 1 - t * 2 : 0;
  }
  /* off the beat: a stumble on top of the move */
  if (hit.q === "early" || hit.q === "late") out.rot += (hit.q === "early" ? -11 : 11) * Math.sin(Math.PI * t);
  return out;
}

/* the chug: the cup tipped, a gulp on every beat */
export function chugAt(beat) {
  const phase = Number.isFinite(beat) ? beat - Math.floor(beat) : 0;
  const gulp = Math.max(0, 1 - phase / 0.35);
  return { pose:"chug", dx:0, dy:-3 * gulp, rot:-4 - 3 * gulp, sx:1 - 0.02 * gulp, sy:1 + 0.03 * gulp };
}

/* the cheer from the bank: a jump with both arms up */
export const CHEER_MS = 640;
export function cheerAt(at, now) {
  if (!Number.isFinite(at) || !Number.isFinite(now)) return null;
  const age = now - at;
  if (age < 0 || age >= CHEER_MS) return null;
  const t = age / CHEER_MS;
  const arc = Math.sin(Math.PI * Math.min(1, t / 0.8));
  return { pose:"cheer", dx:0, dy:-46 * arc, rot:0, sx:1 - 0.04 * arc, sy:1 + 0.07 * arc };
}

/* Out of the Cup, to the bank: a small hop in place (about the critter's
   own height), then a waddle back across the water to the sand, shrinking
   with the distance. from/to: { x, y, scale }; t 0 to 1 over the move;
   `height` the critter's drawn height (stage px). Returns { x, y, scale,
   lift (up, negative), sx, sy }. */
export const HOP_SHARE = 0.26;
export function hopToBank(from, to, t, { height = 160 } = {}) {
  const u = Math.max(0, Math.min(1, Number(t) || 0));
  if (u < HOP_SHARE) {
    const k = u / HOP_SHARE;
    const arc = Math.sin(Math.PI * k);
    return { x:from.x, y:from.y, scale:from.scale, lift:-0.9 * height * arc, sx:1 - 0.05 * arc, sy:1 + 0.08 * arc };
  }
  const k = (u - HOP_SHARE) / (1 - HOP_SHARE);
  const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  /* four little waddle bounces on the way */
  const waddle = Math.abs(Math.sin(Math.PI * 4 * k)) * (1 - k * 0.5);
  const scale = from.scale + (to.scale - from.scale) * e;
  return { x:from.x + (to.x - from.x) * e, y:from.y + (to.y - from.y) * e, scale,
    lift:-0.12 * height * (scale / from.scale) * waddle, sx:1 + 0.04 * waddle, sy:1 - 0.04 * waddle };
}

/* The popup over a rider: the latest judgement for POPUP_MS from its
   stamp, one at a time (a newer hit replaces it). { scale, opacity, dy }
   or null when nothing shows. */
export function popupAt(hit, now, { ms = POPUP_MS } = {}) {
  if (!hit || !Number.isFinite(hit.at) || !Number.isFinite(now)) return null;
  const age = now - hit.at;
  if (age < 0 || age >= ms) return null;
  const pop = age < 90 ? 0.55 + 0.65 * (age / 90) : age < 170 ? 1.2 - 0.2 * ((age - 90) / 80) : 1;
  const fade = Math.max(0, (age - (ms - 150)) / 150);
  return { scale:pop, opacity:1 - fade, dy:-10 * (age / ms) - 8 * fade };
}

/* an exponential follow, frame-rate independent: where `from` gets to
   chasing `to` over dt ms with time constant tau ms */
export const follow = (from, to, dt, tau = 260) => {
  if (!Number.isFinite(from)) return to;
  if (!Number.isFinite(dt) || dt <= 0) return from;
  return to + (from - to) * Math.exp(-dt / tau);
};
