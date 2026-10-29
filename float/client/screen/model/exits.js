/* The slapstick exits (float/GROOVE.md "After a song"): a rider out of the
   Cup leaves the water with the song's own gag and lands on the bank as the
   crowd. Paddle Party: a pelican swoops in and scoops them off; Rock Hop:
   they bonk a rock, see stars and sink in bubbles; Spin Cycle: the
   whirlpool flushes them round and down. Anything else hops. Pure: where
   the critter and the gag's props are at t (0 to 1) of EXIT_MS. */

export const EXIT_MS = 2200;
export const exitKind = scene => (scene === "open" ? "pelican" : scene === "rocks" ? "bonk" : scene === "whirlpool" ? "flush" : "hop");

const ease = t => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
const inOut = t => { const u = Math.max(0, Math.min(1, t)); return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; };
const span = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));
const mix = (a, b, k) => a + (b - a) * k;

/* The critter and the props at t: { x, y, scale, lift, rot, sx, sy,
   opacity, pose, pelican?, stars?, bubbles?, bonk?, swirl? } (stage px;
   x, y the waterline). from/to: { x, y, scale }; height the critter's
   drawn height at `from`. */
export function exitAt(kind, from, to, t, { height = 160 } = {}) {
  const u = Math.max(0, Math.min(1, Number(t) || 0));
  const base = { x:from.x, y:from.y, scale:from.scale, lift:0, rot:0, sx:1, sy:1, opacity:1, pose:"miss" };
  if (kind === "pelican") {
    /* the pelican swoops in from the upper right (0 to 0.32), scoops (to
       0.42), carries them off over the water to the bank (to 0.9), drops them */
    const fly = span(u, 0, 0.32), carry = span(u, 0.42, 0.9), drop = span(u, 0.9, 1);
    const beakX = from.x + 40, beakY = from.y - height * 0.9;
    const startX = 2100, startY = 60;
    let px = mix(startX, beakX, inOut(fly)), py = mix(startY, beakY, inOut(fly));
    let cx = from.x, cy = from.y, scale = from.scale, lift = 0;
    if (u >= 0.32 && u < 0.42) { lift = -height * 0.6 * span(u, 0.32, 0.42); }
    if (u >= 0.42) {
      const k = inOut(carry);
      const arc = Math.sin(Math.PI * carry) * 220;
      px = mix(beakX, to.x + 40, k); py = mix(beakY, to.y - height * 0.9 * (to.scale / from.scale), k) - arc;
      cx = mix(from.x, to.x, k); cy = mix(from.y, to.y, k) - arc;
      scale = mix(from.scale, to.scale, k);
      lift = -height * 0.6 * (1 - drop) * (scale / from.scale);
    }
    if (u >= 0.9) { px = mix(to.x + 40, -300, ease(drop)); py = mix(to.y - 200, -200, ease(drop)); }
    return { ...base, x:cx, y:cy, scale, lift, pose:u < 0.32 ? "idle" : u >= 0.9 ? "out" : "miss", rot:u >= 0.42 && u < 0.9 ? -8 : 0,
      pelican:{ x:px, y:py, scale:Math.max(0.55, scale * 1.3), open:u >= 0.25 && u < 0.45, flap:u } };
  }
  if (kind === "bonk") {
    /* a rock pops up beside them (0 to 0.12), bonk (0.12 to 0.2), stars
       (to 0.5), sinking in bubbles (to 0.75), up on the bank (0.8 on) */
    const rise = span(u, 0, 0.12), hit = span(u, 0.12, 0.2), sink = span(u, 0.5, 0.75), pop = span(u, 0.8, 1);
    if (u < 0.8) {
      const squash = hit > 0 && hit < 1 ? Math.sin(Math.PI * hit) : 0;
      return { ...base, rot:-10 * squash + (u > 0.2 && u < 0.5 ? 6 * Math.sin(u * 40) : 0), sx:1 + 0.12 * squash, sy:1 - 0.14 * squash,
        lift:height * 0.9 * ease(sink), opacity:1 - ease(span(u, 0.62, 0.78)), pose:u < 0.12 ? "idle" : "miss",
        rock:{ x:from.x + height * 0.75, y:from.y, scale:from.scale, up:ease(rise), gone:span(u, 0.7, 0.8) },
        bonk:hit > 0 && u < 0.32 ? { x:from.x + height * 0.4, y:from.y - height * 0.8, scale:from.scale, k:span(u, 0.12, 0.32) } : null,
        stars:u >= 0.18 && u < 0.62 ? { x:from.x, y:from.y - height * 1.02, scale:from.scale, spin:u * 6 } : null,
        bubbles:u >= 0.5 && u < 0.85 ? { x:from.x, y:from.y, scale:from.scale, k:span(u, 0.5, 0.85) } : null };
    }
    const k = ease(pop);
    return { ...base, x:to.x, y:to.y, scale:to.scale * (0.4 + 0.6 * k), opacity:k, pose:"out" };
  }
  if (kind === "flush") {
    /* round and round, smaller and lower (0 to 0.72), gone, up on the bank (0.8 on) */
    const whirl = span(u, 0, 0.72), pop = span(u, 0.8, 1);
    if (u < 0.8) {
      const turns = 5 * inOut(whirl);
      return { ...base, sx:Math.cos(2 * Math.PI * turns) || 0.05, rot:360 * turns * 0.15, scale:from.scale * (1 - 0.7 * inOut(whirl)),
        lift:height * 0.5 * inOut(whirl), opacity:1 - span(u, 0.62, 0.74), pose:"miss",
        swirl:{ x:from.x, y:from.y, scale:from.scale, k:whirl, spin:turns } };
    }
    const k = ease(pop);
    return { ...base, x:to.x, y:to.y, scale:to.scale * (0.4 + 0.6 * k), opacity:k, pose:"out" };
  }
  /* a small hop in place, then a waddle to the sand */
  const hop = 0.26;
  if (u < hop) {
    const arc = Math.sin(Math.PI * (u / hop));
    return { ...base, lift:-0.9 * height * arc, sx:1 - 0.05 * arc, sy:1 + 0.08 * arc, pose:"out" };
  }
  const k = inOut((u - hop) / (1 - hop));
  const waddle = Math.abs(Math.sin(Math.PI * 4 * ((u - hop) / (1 - hop))));
  const scale = mix(from.scale, to.scale, k);
  return { ...base, x:mix(from.x, to.x, k), y:mix(from.y, to.y, k), scale, lift:-0.12 * height * (scale / from.scale) * waddle, pose:"out" };
}
