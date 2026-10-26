/* The flat map: the screen without WebGL (none, a lost context, or a device
   too slow even for the lowest tier). The current leg from above, turned to
   run left to right, every rider a chip in their colour, the same frames
   for the HUD as the 3D world gives (names over heads, the order), so the
   room never loses the race. Canvas 2D only. */
import { FLAG } from "../../../shared/protocol.js";
import { raceOrder, legOf, cutOf } from "../model/hudModel.js";
import { indexList, throughFor } from "../model/cupShape.js";
import { gridPoses, lobbyPoses, takeoutPoses } from "../model/staging.js";

const has = (f, bit) => (f & bit) !== 0;

export function createFlatMap({ canvas, store, onFrame, onStats }) {
  const ctx = canvas.getContext("2d");
  let width = 1920, height = 1080, dpr = 1;
  let running = true;
  let raf = 0;
  let view = null;
  let bg = null;
  const poses = new Map();
  const staged = new Map();
  const tags = [];

  const resize = (w, h) => {
    width = Math.max(2, Math.round(w)); height = Math.max(2, Math.round(h));
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    view = null;
  };

  /* fit a leg into the canvas, clear of the rail (right) and the ribbon (bottom) */
  function fit(geo, leg) {
    const a = geo.sample(leg.s0 ?? leg.grid), b = geo.sample(leg.s1 ?? leg.finish);
    const theta = Math.atan2(b.y - a.y, b.x - a.x);
    const c = Math.cos(-theta), s = Math.sin(-theta);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let d = leg.s0 ?? 0; d <= (leg.s1 ?? geo.length); d += 4) {
      const p = geo.sample(d);
      for (const side of [-1, 1]) {
        const x = p.x + p.nx * side * p.w / 2, y = p.y + p.ny * side * p.w / 2;
        const rx = x * c - y * s, ry = x * s + y * c;
        minX = Math.min(minX, rx); maxX = Math.max(maxX, rx); minY = Math.min(minY, ry); maxY = Math.max(maxY, ry);
      }
    }
    const u = Math.min(width / 1920, height / 1080);
    const box = { l:110 * u, r:width - 480 * u, t:200 * u, b:height - 240 * u };
    const scale = Math.min((box.r - box.l) / (maxX - minX || 1), (box.b - box.t) / (maxY - minY || 1));
    const ox = (box.l + box.r) / 2 - ((minX + maxX) / 2) * scale;
    const oy = (box.t + box.b) / 2 + ((minY + maxY) / 2) * scale;
    return { leg, c, s, scale, ox, oy, u,
      to:(x, y) => ({ x:ox + (x * c - y * s) * scale, y:oy - (x * s + y * c) * scale }) };
  }

  function paintBackground(geo, v) {
    bg = document.createElement("canvas");
    bg.width = canvas.width; bg.height = canvas.height;
    const g = bg.getContext("2d");
    g.scale(dpr, dpr);
    const sky = g.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, "#0b1030"); sky.addColorStop(1, "#2a1426");
    g.fillStyle = sky; g.fillRect(0, 0, width, height);
    const leg = v.leg;
    const from = Math.max(0, (leg.s0 ?? 0) - 30), to = Math.min(geo.length, (leg.s1 ?? geo.length) + 30);
    const left = [], right = [];
    for (let d = from; d <= to; d += 2) {
      const p = geo.sample(d);
      left.push(v.to(p.x + p.nx * (p.w / 2 + 8), p.y + p.ny * (p.w / 2 + 8)));
      right.push(v.to(p.x - p.nx * (p.w / 2 + 8), p.y - p.ny * (p.w / 2 + 8)));
    }
    const band = (pts1, pts2, fill) => {
      g.beginPath();
      pts1.forEach((p, k) => (k ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      pts2.slice().reverse().forEach(p => g.lineTo(p.x, p.y));
      g.closePath(); g.fillStyle = fill; g.fill();
    };
    band(left, right, "#7a4a2c");
    const wl = [], wr = [];
    for (let d = from; d <= to; d += 2) {
      const p = geo.sample(d);
      wl.push(v.to(p.x + p.nx * p.w / 2, p.y + p.ny * p.w / 2));
      wr.push(v.to(p.x - p.nx * p.w / 2, p.y - p.ny * p.w / 2));
    }
    const water = g.createLinearGradient(0, v.oy - 200, 0, v.oy + 200);
    water.addColorStop(0, "#0e4a55"); water.addColorStop(1, "#0a2c3a");
    band(wl, wr, water);
    g.lineWidth = 3 * v.u; g.strokeStyle = "rgba(223, 233, 242, 0.55)";
    for (const pts of [wl, wr]) { g.beginPath(); pts.forEach((p, k) => (k ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.stroke(); }
    /* rough water hatched, the falls bright */
    for (const z of geo.zones) {
      if (!["riffle", "drop", "whirlpool"].includes(z.k) || z.s1 < from || z.s0 > to) continue;
      for (let d = Math.max(from, z.s0); d <= Math.min(to, z.s1); d += z.k === "drop" ? 1 : 3) {
        const p = geo.sample(d);
        const a = v.to(p.x + p.nx * p.w * 0.45, p.y + p.ny * p.w * 0.45), b = v.to(p.x - p.nx * p.w * 0.45, p.y - p.ny * p.w * 0.45);
        g.strokeStyle = z.k === "drop" ? "rgba(244, 236, 216, 0.85)" : "rgba(244, 236, 216, 0.22)";
        g.lineWidth = (z.k === "drop" ? 3 : 1.5) * v.u;
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      }
    }
    for (const [x, y, r] of geo.islands) {
      const p = v.to(x, y);
      g.fillStyle = "#c9a070"; g.beginPath(); g.arc(p.x, p.y, (r + 0.5) * v.scale, 0, Math.PI * 2); g.fill();
    }
    for (const [x, y, r] of geo.rocks) {
      const p = v.to(x, y);
      g.fillStyle = "#8c5a3c"; g.beginPath(); g.arc(p.x, p.y, Math.max(3, r * v.scale), 0, Math.PI * 2); g.fill();
    }
    /* start and finish lines */
    for (const [d, color] of [[leg.grid, "#5fdcf0"], [leg.finish, "#ff3fa4"]]) {
      const p = geo.sample(d);
      const a = v.to(p.x + p.nx * p.w / 2, p.y + p.ny * p.w / 2), b = v.to(p.x - p.nx * p.w / 2, p.y - p.ny * p.w / 2);
      g.strokeStyle = color; g.lineWidth = 5 * v.u; g.setLineDash([10 * v.u, 8 * v.u]);
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); g.setLineDash([]);
    }
  }

  function frame() {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const st = store.state;
    const geo = st.geo, room = st.room;
    if (!geo) return;
    const leg = st.phase === "lobby" ? geo.legs[0] : legOf(geo, room);
    if (!leg) return;
    if (!view || view.leg !== leg || view.geo !== geo) { view = fit(geo, leg); view.geo = geo; paintBackground(geo, view); }
    const now = store.serverNow();
    const rows = store.sample(store.drawTime(), poses);
    const field = indexList(room?.field);
    const entrants = room?.entrants || [];
    staged.clear();
    const time = performance.now() / 1000;
    const legIndex = st.phase === "lobby" ? 0 : room?.leg | 0;
    if (st.phase === "lobby") lobbyPoses(geo, leg, entrants.length, time, staged);
    else if (st.phase === "race" || rows.size) { gridPoses(geo, legIndex, field, staged); for (const [i, r] of rows) staged.set(i, r); }
    else if (st.phase === "cut") takeoutPoses(geo, legIndex, cutOf(room, st.raceField).order, staged);
    else if (st.phase === "podium" || st.phase === "feedback") takeoutPoses(geo, legIndex, indexList(room?.podium), staged);
    else gridPoses(geo, legIndex, field, staged);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.drawImage(bg, 0, 0, width, height);
    const order = raceOrder({ field, rows, results:room?.results || [], arrivals:st.arrivals });
    tags.length = 0;
    const r = 15 * view.u;
    for (const [i, pose] of staged) {
      const e = entrants[i];
      if (!e) continue;
      const p = view.to(pose.x, pose.y);
      const f = pose.f | 0;
      ctx.beginPath(); ctx.arc(p.x, p.y, r + 3 * view.u, 0, Math.PI * 2);
      ctx.fillStyle = has(f, FLAG.SWIM) ? "#5fdcf0" : "#f4ecd8"; ctx.fill();
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fillStyle = e.color || "#999"; ctx.fill();
      /* the heading */
      const h = Number(pose.a) || 0;
      const tip = view.to(pose.x + Math.cos(h) * 2.6, pose.y + Math.sin(h) * 2.6);
      ctx.strokeStyle = "#f4ecd8"; ctx.lineWidth = 3 * view.u;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
      if (has(f, FLAG.HANDS_OFF)) { ctx.beginPath(); ctx.arc(p.x + r, p.y - r, 6 * view.u, 0, Math.PI * 2); ctx.fillStyle = "#ffa630"; ctx.fill(); }
      const o = order.find(item => item.i === i);
      tags.push({ i, x:p.x, y:p.y - r - 6 * view.u, z:0, on:true, rank:o?.rank ?? 0, state:o?.state ?? "idle", f, p:o?.p ?? 0, place:o?.place });
    }
    let podium = null;
    if (st.phase === "podium" || st.phase === "feedback") {
      podium = indexList(room?.podium).slice(0, 3).map((i, k) => {
        const t = tags.find(item => item.i === i);
        return { place:k + 1, x:t?.x ?? width / 2, y:(t?.y ?? height / 2) - 40 * view.u, on:!!t };
      });
    }
    onFrame?.({ tags, order, through:throughFor(room), leg, now, drawAt:store.drawTime(), width, height, podium, camKey:"flat" });
  }
  raf = requestAnimationFrame(frame);
  onStats?.({ tier:"flat" });

  return {
    resize,
    dispose() { running = false; cancelAnimationFrame(raf); },
    podiumBurst() {},
    pose() {},
  };
}
