/* Where riders sit when the room sends no rows: bobbing in the put-in pool
   in the lobby, on the grid in field order (pole first), parked on the
   takeout's bar, on the podium. When rows come the riders ease from here
   into them. Pure. */
import { gridSlots, beachSlot } from "../../../shared/course.js";

/* the grid: the engine's own slots (course.js gridSlots), pole first, so
   the riders are already where the first rows will put them */
export function gridPoses(geo, legIndex, field = [], out = new Map()) {
  if (!geo || !field.length) return out;
  let slots = [];
  try { slots = gridSlots(geo.course, legIndex | 0, field.length); } catch { slots = []; }
  field.forEach((i, k) => {
    const slot = slots[k];
    if (slot) out.set(i, { x:slot.x, y:slot.y, a:slot.a, f:0, ease:3 });
  });
  return out;
}

/* the lobby: a loose raft of everyone who has joined, drifting in the pool */
export function lobbyPoses(geo, leg, count, time, out = new Map()) {
  if (!geo || !leg) return out;
  const c = geo.sample(Math.max(8, leg.grid - 6));
  for (let i = 0; i < count; i++) {
    const r = 2.6 * Math.sqrt(i + 0.6);
    const a = i * 2.39996 + time * 0.03;
    const lx = Math.cos(a) * r, ly = Math.sin(a) * r * 0.8;
    const x = c.x + c.tx * lx + c.nx * ly, y = c.y + c.ty * lx + c.ny * ly;
    out.set(i, { x, y, a:time * 0.12 + i * 1.3, f:0, ease:1.5 });
  }
  return out;
}

/* home at the takeout: parked on the leg's gravel bar in place order (the
   engine's beachSlot), as the race left them */
export function takeoutPoses(geo, legIndex, order = [], out = new Map()) {
  if (!geo) return out;
  order.forEach((i, k) => {
    try {
      const slot = beachSlot(geo.course, legIndex | 0, k);
      out.set(i, { x:slot.x, y:slot.y, a:slot.a + Math.PI, f:0, ease:1.2 });
    } catch {}
  });
  return out;
}

/* the podium's three on their steps; everyone else floating below, watching */
export function podiumPoses(geo, bar, podium = [], others = [], out = new Map()) {
  if (!bar) return out;
  const face = Math.atan2(bar.anchor.fy, bar.anchor.fx);
  podium.slice(0, 3).forEach((i, k) => {
    const top = bar.tops.find(t => t.place === k + 1);
    if (top) out.set(i, { x:top.x, y:top.y, z:top.z, a:face, f:0, snap:true });
  });
  const ax = bar.anchor.x + bar.anchor.fx * 11, ay = bar.anchor.y + bar.anchor.fy * 11;
  others.forEach((i, k) => {
    const side = { x:-bar.anchor.fy, y:bar.anchor.fx };
    const row = Math.floor(k / 5), col = (k % 5) - 2;
    out.set(i, { x:ax + side.x * col * 3.4 + bar.anchor.fx * row * 3, y:ay + side.y * col * 3.4 + bar.anchor.fy * row * 3, a:face + Math.PI, f:0, ease:2 });
  });
  void geo;
  return out;
}
