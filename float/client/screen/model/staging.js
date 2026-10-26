/* Where riders sit when the room sends no rows (rows come only in a race):
   bobbing in the put-in pool in the lobby, on the grid in field order
   (pole first, rows of five), home at the takeout, on the podium. When rows
   resume the riders ease from here into them. Pure. */

export const GRID = Object.freeze({ cols:5, rowGap:4.5, colGap:4.2, back:1 });

export function gridPoses(geo, leg, field = [], out = new Map()) {
  if (!geo || !leg) return out;
  const cols = Math.min(GRID.cols, Math.max(1, field.length));
  field.forEach((i, k) => {
    const row = Math.floor(k / cols), col = k % cols;
    const inRow = Math.min(cols, field.length - row * cols);
    const s = leg.grid - GRID.back - row * GRID.rowGap;
    const p = geo.sample(s);
    const span = Math.min(p.w - 8, GRID.colGap * (inRow - 1) + 0.01);
    const lat = inRow > 1 ? span / 2 - (span * col) / (inRow - 1) : 0;
    out.set(i, { x:p.x + p.nx * lat, y:p.y + p.ny * lat, a:Math.atan2(p.ty, p.tx), f:0, ease:3 });
  });
  return out;
}

/* the lobby: a loose raft of everyone who has joined, drifting in the pool */
export function lobbyPoses(geo, leg, count, time, out = new Map()) {
  if (!geo || !leg) return out;
  const c = geo.sample(leg.grid + 14);
  for (let i = 0; i < count; i++) {
    const r = 2.6 * Math.sqrt(i + 0.6);
    const a = i * 2.39996 + time * 0.03;
    const lx = Math.cos(a) * r, ly = Math.sin(a) * r * 0.8;
    const x = c.x + c.tx * lx + c.nx * ly, y = c.y + c.ty * lx + c.ny * ly;
    out.set(i, { x, y, a:time * 0.12 + i * 1.3, f:0, ease:1.5 });
  }
  return out;
}

/* home at the takeout: those through in a front line, the rest behind */
export function takeoutPoses(geo, leg, through = [], cut = [], out = new Map()) {
  if (!geo || !leg) return out;
  const place = (list, s0, gap) => list.forEach((i, k) => {
    const s = s0 + Math.floor(k / 6) * gap;
    const p = geo.sample(s);
    const n = Math.min(6, list.length - Math.floor(k / 6) * 6);
    const span = Math.min(p.w - 6, 4.4 * (n - 1) + 0.01);
    const lat = n > 1 ? span / 2 - (span * (k % 6)) / (n - 1) : 0;
    out.set(i, { x:p.x + p.nx * lat, y:p.y + p.ny * lat, a:Math.atan2(p.ty, p.tx) + Math.PI, f:0, ease:1.2 });
  });
  place(through, leg.finish + 9, 3.6);
  place(cut, leg.finish - 4, -3.6);
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
