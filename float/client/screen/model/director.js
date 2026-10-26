/* The camera director. Pure: course coordinates in (x east, y north, z up),
   an eye, a look-at point and a field of view out, so the 3D world, the flat
   map and tests share it. Every framing is a target the camera eases toward
   frame-rate independently (1 - exp(-rate * dt)); a phase that jumps across
   the river cuts instead of whipping.

     lobby      a slow orbit over the put-in
     intro      the whole river from above with the legs named, then a dive onto the grid
     grid       the lineup, front-on: every rider's face, a slow push
     countdown  a cut behind the grid, closer and lower, for the start
     race       the pack from the leader back to the cut line's fight, looking
                downstream with look-ahead, rising as it spreads; spread out,
                the leader's group and the fight for the last place take turns
     arrival    once someone is in: the takeout from downstream, facing the
                riders coming home
     cut        the takeout, then a flight down the next leg to its grid
     podium     the bar, front-on, a slow push and drift */

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const smooth = t => t * t * (3 - 2 * t);

export const FOV = 42;

export function createDirector(geo, { wallAt = () => 8, groundAt = null, falls = [] } = {}) {
  const eye = { x:0, y:0, z:30 }, look = { x:0, y:0, z:0 };
  let fov = FOV;
  let primed = false;
  let mode = null;
  let moment = null;
  let lastMoment = -Infinity;
  const tmp = {};

  const at = (s, lat = 0, up = 0) => {
    const p = geo.sampleInto(s, tmp);
    return { x:p.x + p.nx * lat, y:p.y + p.ny * lat, z:geo.elevAt(s) + up, tx:p.tx, ty:p.ty, nx:p.nx, ny:p.ny, w:p.w };
  };
  /* a camera `back` metres up the river from s, `up` above the water, `side` across */
  const behind = (s, back, up, side = 0) => {
    const c = at(s - back, side);
    const floor = Math.max(up, wallAt(s - back) * 0.85 + 6);
    return { x:c.x, y:c.y, z:geo.elevAt(s - back) + Math.min(floor, up + 18) };
  };

  /* where the camera wants to be this frame */
  function want(input) {
    const { phase, t = 0, dur = null, leg, riders = [], through = 0, round = 0, nextLeg = null } = input;
    const legs = geo.legs;
    const L = leg || legs[0] || { grid:0, finish:geo.length, s0:0, s1:geo.length };
    const time = t / 1000;
    switch (phase) {
      case "lobby": {
        const c = at(L.grid + 14);
        const a = time * 0.05 + 0.6;
        const radius = 36;
        return { eye:{ x:c.x + Math.cos(a) * radius, y:c.y + Math.sin(a) * radius, z:c.z + 13 }, look:{ x:c.x, y:c.y, z:c.z + 1 }, fov:44, key:"lobby" };
      }
      case "intro": {
        /* the whole river from above, the legs named on it, then a dive onto the grid */
        const total = Math.max(5000, dur || 8000);
        const g = legs[Math.min(legs.length - 1, round)] || L;
        const map = overviewShot(time, input.aspect || 16 / 9);
        const swoop = Math.min(3200, total * 0.4);
        if (t < total - swoop) return { ...map, key:"intro:map", cut:true, shot:"map" };
        const u = smooth(clamp((t - (total - swoop)) / swoop, 0, 1));
        const to = lineupShot(g, riders, 0, input.aspect || 16 / 9);
        /* the dive arcs: it stays high, then drops onto the grid */
        const eyeP = mix3(map.eye, to.eye, u);
        eyeP.z += Math.sin(u * Math.PI) * 30 * (1 - u);
        return { eye:eyeP, look:mix3(map.look, to.look, Math.min(1, u * 1.3)), fov:lerp(map.fov, FOV, u), key:"intro:dive", shot:"dive" };
      }
      case "grid": return { ...lineupShot(L, riders, time, input.aspect || 16 / 9), key:"grid" };
      case "countdown": {
        /* behind the last row, so the whole grid is in and nobody is cut by the frame's foot */
        const sBack = riders.reduce((m, r) => (Number.isFinite(r.s) ? Math.min(m, r.s) : m), L.grid);
        const depth = clamp(L.grid - sBack, 0, 20);
        const g = gridShot(L, 3 + time);
        const close = { eye:behind(L.grid, depth + 14, 6.5), look:at(L.grid + 12, 0, 0.5) };
        const u = smooth(clamp(time / 2.6, 0, 1));
        return { eye:mix3(g.eye, close.eye, u), look:mix3(g.look, close.look, u), fov:lerp(FOV, 40, u), key:"countdown" };
      }
      case "race": return raceShot(input, L, time);
      case "cut": {
        if (time < 9 || !nextLeg) return { ...takeoutShot(L, riders, time, true), key:"cut:takeout" };
        const u = smooth(clamp((time - 9) / 9, 0, 1));
        const sCam = lerp(L.finish - 10, nextLeg.grid - 26, u);
        const lift = Math.sin(u * Math.PI) * 26;
        const eyeP = behind(sCam, 0, 12 + lift);
        const lookP = at(Math.min(nextLeg.finish, sCam + 34 + Math.sin(u * Math.PI) * 30));
        return { eye:eyeP, look:lookP, fov:44, key:"cut:next", cut:true };
      }
      case "replay": {
        /* the falls on the replay's leg, from below the lip */
        const r = input.replay;
        const legR = legs[r?.leg ?? 0] || L;
        const f = falls.find(item => item.lip >= (legR.grid ?? 0) - 5 && item.foot <= (legR.finish ?? geo.length) + 5) || falls[0];
        if (f) return { ...fallsShot(f, time), fov:40, key:"replay" };
        return { ...takeoutShot(L, riders, time), key:"replay" };
      }
      case "podium":
      case "feedback": return { ...podiumShot(input, time, phase === "feedback"), key:phase === "feedback" ? "podium" : "podium", cut:true };
      default: return null;
    }
  }

  function mix3(a, b, u) { return { x:lerp(a.x, b.x, u), y:lerp(a.y, b.y, u), z:lerp(a.z, b.z, u) }; }

  /* the whole course in one frame, from the south and high, drifting in */
  let overview = null;
  function overviewShot(time, aspect) {
    if (!overview || overview.aspect !== aspect) {
      const b = geo.bounds;
      const zMid = geo.elevAt(geo.length / 2);
      const corners = [[b.minX, b.minY], [b.maxX, b.minY], [b.minX, b.maxY], [b.maxX, b.maxY]].map(([x, y]) => ({ x, y, z:zMid }));
      const C = { x:(b.minX + b.maxX) / 2, y:(b.minY + b.maxY) / 2, z:zMid };
      const yaw = Math.PI / 2, pitch = 0.95, fovDeg = 40;
      const { D, fwd } = frameDistance(corners, C, yaw, pitch, fovDeg, aspect, { left:0.86, right:0.86, top:0.78, bottom:0.78 }, 60, 2600);
      overview = { aspect, C, fwd, D, fov:fovDeg };
    }
    const o = overview;
    const k = 1 - Math.min(0.08, time * 0.012);
    const drift = Math.sin(time * 0.3) * o.D * 0.01;
    return { eye:{ x:o.C.x - o.fwd.x * o.D * k + drift, y:o.C.y - o.fwd.y * o.D * k, z:o.C.z - o.fwd.z * o.D * k }, look:{ ...o.C }, fov:o.fov };
  }
  /* where a leg's name sits on the overview: its middle, a little above the water */
  function legMarks() {
    return geo.legs.map((leg, k) => {
      const s = (leg.grid + leg.finish) / 2;
      const p = geo.sample(s);
      return { k, x:p.x, y:p.y, z:geo.elevAt(s) + 6 };
    });
  }

  /* the lineup: from downstream, low, looking up the river into the riders'
     faces, every rider in (the title card owns the top left) */
  const LINEUP = { left:0.5, right:0.8, top:0.42, bottom:0.62 };
  function lineupShot(L, riders, time, aspect) {
    const pts = riders.filter(r => Number.isFinite(r.x) && Number.isFinite(r.y))
      .map(r => ({ x:r.x, y:r.y, z:geo.elevAt(Number.isFinite(r.s) ? r.s : L.grid) + 0.9 }));
    if (!pts.length) return gridShot(L, time);
    const n = pts.length;
    const C = pts.reduce((acc, p) => ({ x:acc.x + p.x / n, y:acc.y + p.y / n, z:acc.z + p.z / n }), { x:0, y:0, z:0 });
    const g = at(L.grid);
    const yaw = Math.atan2(-g.ty, -g.tx);
    let pitch = 0.3;
    const fovDeg = 38;
    const { D } = frameDistance(pts, C, yaw, pitch, fovDeg, aspect, LINEUP, 9, 70);
    const push = 1 - Math.min(0.1, time * 0.025);
    const eyeAt = pt => ({ x:C.x - Math.cos(pt) * Math.cos(yaw) * D * push, y:C.y - Math.cos(pt) * Math.sin(yaw) * D * push, z:C.z + Math.sin(pt) * D * push });
    let eyeP = eyeAt(pitch);
    if (groundAt) {
      for (let k = 0; k < 6 && blocked(eyeP, C); k++) { pitch = Math.min(1.1, pitch + 0.1); eyeP = eyeAt(pitch); }
      eyeP.z = Math.max(eyeP.z, groundAt(eyeP.x, eyeP.y) + 2.5);
    }
    /* aim a little over them: the riders sit low in the frame, the lights and the desert above */
    return { eye:eyeP, look:{ x:C.x, y:C.y, z:C.z + 0.2 + D * 0.07 }, fov:fovDeg };
  }

  function gridShot(L, time) {
    const push = clamp(time / 7, 0, 1);
    const sway = Math.sin(time * 0.35) * 3;
    return { eye:behind(L.grid, 26 - push * 6, 9.5 - push * 1.5, sway), look:at(L.grid + 4, 0, 0.6), fov:FOV };
  }

  function takeoutShot(L, riders, time, wide = false) {
    const home = riders.filter(r => r.state !== "racing");
    const anchor = L.finish + 7;
    const drift = Math.sin(time * 0.25) * 2.5;
    const e = at(anchor + (wide ? 24 : 20), drift, wide ? 9 : 7.5);
    const lookAt = at(anchor - (wide ? 6 : 12), 0, 0.8);
    void home;
    return { eye:e, look:lookAt, fov:wide ? 44 : 42 };
  }

  /* multi-target framing: given a heading and pitch, how far back the eye
     must sit (from centre C) so every target lands inside the safe box, in
     NDC fractions of the half-frame (the HUD owns the edges) */
  function frameDistance(points, C, yaw, pitch, fovDeg, aspect, safe, minD = 16, maxD = 150) {
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const fwd = { x:cp * Math.cos(yaw), y:cp * Math.sin(yaw), z:-sp };
    const right = { x:Math.sin(yaw), y:-Math.cos(yaw), z:0 };
    const up = { x:sp * Math.cos(yaw), y:sp * Math.sin(yaw), z:cp };
    const tanV = Math.tan((fovDeg * Math.PI) / 360), tanH = tanV * aspect;
    let D = minD;
    for (const p of points) {
      const vx = p.x - C.x, vy = p.y - C.y, vz = (p.z ?? C.z) - C.z;
      const r = vx * right.x + vy * right.y;
      const u = vx * up.x + vy * up.y + vz * up.z;
      const f = vx * fwd.x + vy * fwd.y + vz * fwd.z;
      const box = p.safe || safe;
      D = Math.max(D, (r >= 0 ? r / (box.right * tanH) : -r / (box.left * tanH)) - f);
      D = Math.max(D, (u >= 0 ? u / (box.top * tanV) : -u / (box.bottom * tanV)) - f);
    }
    return { D:Math.min(maxD, D), fwd, right };
  }

  /* frame a group, and anyone else the shot would catch on the way: a rider
     between the camera and the group is framed whole, not cut by the frame's
     foot or the ribbon. Each pass decides from the shot before it, so the
     same field always gives the same shot (no hunting) */
  function frameGroup(group, opts) {
    let shot = frameOnce(group, opts);
    if (!opts.others) return shot;
    const extra = [];
    for (let pass = 0; pass < 2; pass++) {
      const add = opts.others.filter(r => !group.includes(r) && !extra.includes(r) && inShot(shot, r, opts.aspect));
      if (!add.length) break;
      extra.push(...add);
      shot = frameOnce(group, { ...opts, extra });
    }
    return shot;
  }
  function inShot(shot, r, aspect) {
    const lx = shot.look.x - shot.eye.x, ly = shot.look.y - shot.eye.y, lz = shot.look.z - shot.eye.z;
    const len = Math.hypot(lx, ly, lz) || 1;
    const fx = lx / len, fy = ly / len, fz = lz / len;
    const vx = r.x - shot.eye.x, vy = r.y - shot.eye.y, vz = geo.elevAt(r.s) + 1.6 - shot.eye.z;
    const f = vx * fx + vy * fy + vz * fz;
    if (f < 2) return false;
    /* right = fwd x up(z), up = right x fwd */
    const hx = Math.hypot(fx, fy) || 1;
    const rx = fy / hx, ry = -fx / hx;
    const side = vx * rx + vy * ry;
    const ux = -fz * fx / hx, uy = -fz * fy / hx, uz = hx;
    const upv = vx * ux + vy * uy + vz * uz;
    const tanV = Math.tan((shot.fov * Math.PI) / 360), tanH = tanV * aspect;
    return Math.abs(side) / (f * tanH) < 1.05 && upv / (f * tanV) > -1.2 && upv / (f * tanV) < 1;
  }
  /* one group: heading from the river upstream of it, so the eye sits
     over the water; distance from the multi-target framer; when the canyon
     is in the way the camera tilts up, it never comes closer */
  function frameOnce(group, { lookAhead = 0, aspect, leader = null, extra = [] }) {
    /* the group inside the HUD-safe box; riders caught on the way only clear
       of the frame's edge and the ribbon */
    const points = [...group.map(r => ({ x:r.x, y:r.y, z:geo.elevAt(r.s) + 1.6 })),
      ...extra.map(r => ({ x:r.x, y:r.y, z:geo.elevAt(r.s) - 0.6, safe:LOOSE }))];
    const sMax = Math.max(...group.map(r => r.s)), sMin = Math.min(...group.map(r => r.s));
    const sBack = Math.min(sMin, ...extra.map(r => r.s));
    if (lookAhead > 0) {
      const ahead = at(sMax + lookAhead, (leader?.lat ?? 0) * 0.6, 0);
      points.push({ x:ahead.x, y:ahead.y, z:ahead.z });
    }
    /* centred on the group; the caught riders only push the camera back */
    const core = points.filter(p => !p.safe);
    const n = core.length;
    const C = core.reduce((acc, p) => ({ x:acc.x + p.x / n, y:acc.y + p.y / n, z:acc.z + p.z / n }), { x:0, y:0, z:0 });
    const span = sMax - sMin;
    const fovNow = lerp(FOV, 46, clamp(span / 90, 0, 1));
    let pitch = 0.3 + clamp(span / 300, 0, 0.1);
    let D = 30, yaw = 0;
    for (let it = 0; it < 3; it++) {
      const back = at(Math.max(0, sBack - D * Math.cos(pitch) * 0.7));
      yaw = Math.atan2(C.y - back.y, C.x - back.x);
      D = frameDistance(points, C, yaw, pitch, fovNow, aspect, SAFE, 20, 120).D;
    }
    const eyeAt = pt => ({ x:C.x - Math.cos(pt) * Math.cos(yaw) * D, y:C.y - Math.cos(pt) * Math.sin(yaw) * D, z:C.z + Math.sin(pt) * D });
    let eyeP = eyeAt(pitch);
    if (groundAt) {
      for (let k = 0; k < 7 && blocked(eyeP, C); k++) { pitch = Math.min(1.25, pitch + 0.1); eyeP = eyeAt(pitch); }
      eyeP.z = Math.max(eyeP.z, groundAt(eyeP.x, eyeP.y) + 4, C.z + 6);
    }
    return { eye:eyeP, look:C, fov:fovNow };
  }
  function blocked(eyeP, C) {
    for (let j = 1; j <= 8; j++) {
      const t = j / 9;
      const x = eyeP.x + (C.x - eyeP.x) * t, y = eyeP.y + (C.y - eyeP.y) * t, z = eyeP.z + (C.z - eyeP.z) * t;
      if (groundAt(x, y) > z - 1.5) return true;
    }
    return groundAt(eyeP.x, eyeP.y) > eyeP.z - 3;
  }

  const SAFE = { left:0.72, right:0.42, top:0.48, bottom:0.5 };
  /* a caught rider's tube (its lowest point) clear of the ribbon */
  const LOOSE = { left:0.86, right:0.6, top:0.6, bottom:0.72 };

  /* the falls: a fixed camera below the lip, riders coming over toward it */
  function fallsShot(f, time) {
    const foot = at(f.foot + 24, Math.sin(time * 0.3) * 1.5 + 4, 0);
    const lip = at(f.lip, 0, 0);
    const eyeP = { x:foot.x, y:foot.y, z:geo.elevAt(f.foot) + 5.5 };
    return { eye:eyeP, look:{ x:lip.x, y:lip.y, z:geo.elevAt(f.lip) + 0.5 }, fov:44, key:"falls" };
  }

  function raceShot(input, L, time) {
    const { riders = [], through = 0, aspect = 16 / 9 } = input;
    const water = riders.filter(r => r.state === "racing" && Number.isFinite(r.s) && Number.isFinite(r.x));
    const home = riders.filter(r => r.state !== "racing");
    const ranked = water.slice().sort((a, b) => a.rank - b.rank);
    /* someone is in: the takeout, facing the riders coming home */
    if (home.length && water.length) {
      const chasing = ranked.filter(r => r.rank <= through + 1);
      const fight = chasing.length ? chasing : ranked.slice(0, 1);
      const finish = at(L.finish);
      const points = [{ x:finish.x, y:finish.y, z:finish.z }, ...fight.map(r => ({ x:r.x, y:r.y, z:geo.elevAt(r.s) + 1.5 }))];
      const C = points.reduce((acc, p) => ({ x:acc.x + p.x / points.length, y:acc.y + p.y / points.length, z:acc.z + p.z / points.length }), { x:0, y:0, z:0 });
      const yaw = Math.atan2(-finish.ty, -finish.tx);
      const pitch = 0.32;
      /* the riders already in, on the takeout under the camera: whole, clear of the ribbon */
      const party = home.filter(r => Number.isFinite(r.x) && Number.isFinite(r.y))
        .map(r => ({ x:r.x, y:r.y, z:(Number.isFinite(r.s) ? geo.elevAt(r.s) : finish.z) - 0.6, safe:LOOSE }));
      const { D, fwd } = frameDistance([...points, ...party], C, yaw, pitch, 44, aspect, SAFE, 20, 120);
      const eyeP = { x:C.x - fwd.x * D, y:C.y - fwd.y * D, z:C.z - fwd.z * D };
      if (groundAt) eyeP.z = Math.max(eyeP.z, groundAt(eyeP.x, eyeP.y) + 4);
      return { eye:eyeP, look:C, fov:44, key:"arrival" };
    }
    if (!water.length) return { ...takeoutShot(L, riders, time), key:"arrival" };
    /* the falls, while the fight goes over them */
    const leader = ranked[0];
    for (const f of falls) {
      if (f.lip < L.grid || f.foot > L.finish + 5) continue;
      const near = ranked.some(r => r.rank <= through + 1 && r.s > f.lip - 26 && r.s < f.foot + 6);
      if (near && leader.s < f.foot + 22) return fallsShot(f, time);
    }
    /* the leader back to the first rider outside the cut */
    const cutRank = Math.max(1, Math.min(through + 1, ranked[ranked.length - 1].rank));
    const fight = ranked.filter(r => r.rank <= cutRank);
    const sMax = Math.max(...fight.map(r => r.s)), sMin = Math.min(...fight.map(r => r.s));
    const lookAhead = 10;
    /* one shot while it reads; spread out, the leader's group and the fight
       for the last place through take turns (7 s and 5 s) */
    const final = through >= ranked.length;
    if (sMax - sMin <= 38 || final) return { ...frameGroup(fight, { lookAhead, aspect, leader, others:water }), key:"race" };
    const onCut = time % 12 >= 7;
    if (!onCut) {
      const front = fight.filter(r => r.s >= sMax - 22);
      return { ...frameGroup(front, { lookAhead, aspect, leader, others:water }), key:"race:front" };
    }
    const bubble = ranked.find(r => r.rank === Math.min(through, ranked[ranked.length - 1].rank)) || ranked[ranked.length - 1];
    const group = ranked.filter(r => Math.abs(r.s - bubble.s) <= 18 && r.rank >= through - 1 && r.rank <= through + 2);
    return { ...frameGroup(group.length ? group : [bubble], { lookAhead:6, aspect, leader:bubble, others:water }), key:"race:cut", cutGroup:group.map(r => r.i) };
  }

  function podiumShot(input, time, wide) {
    const p = input.podiumAt;
    if (!p) return { eye:at(geo.length - 30, 0, 10), look:at(geo.length - 6), fov:FOV };
    const drift = Math.sin(time * 0.22) * 0.12;
    const back = wide ? 16.5 : 13.5 - Math.min(2, time * 0.15);
    const fx = p.fx, fy = p.fy;
    const side = { x:-fy, y:fx };
    return {
      eye:{ x:p.x + fx * back + side.x * Math.sin(drift) * back, y:p.y + fy * back + side.y * Math.sin(drift) * back, z:p.z + (wide ? 5.6 : 4.4) },
      look:{ x:p.x, y:p.y, z:p.z + 2.3 },
      fov:wide ? 44 : 40,
    };
  }

  /* moments: a short punch-in on one rider, never more than every 9 s */
  function punch({ i, kind, now }) {
    if (now - lastMoment < 9000) return false;
    lastMoment = now;
    moment = { i, kind, from:now, until:now + 2400 };
    return true;
  }

  function update(dt, input) {
    let w = want(input);
    if (!w) return { eye, look, fov };
    /* a moment overrides the race for a beat, from the side, close */
    if (moment && input.phase === "race" && input.now < moment.until) {
      const r = input.riders.find(item => item.i === moment.i);
      if (r && Number.isFinite(r.s)) {
        const u = clamp((input.now - moment.from) / 2400, 0, 1);
        const p = at(r.s, r.lat || 0);
        const sideSign = (r.lat || 0) > 0 ? -1 : 1;
        w = { eye:{ x:p.x - p.tx * 9 + p.nx * sideSign * 7, y:p.y - p.ty * 9 + p.ny * sideSign * 7, z:p.z + 4.5 + u * 1.5 },
          look:{ x:p.x + p.tx * 2, y:p.y + p.ty * 2, z:p.z + 1 }, fov:38, key:`moment:${moment.i}` };
      }
    } else if (moment && input.now >= moment.until) moment = null;
    const key = w.key;
    const changed = key !== mode;
    const far = Math.hypot(w.eye.x - eye.x, w.eye.y - eye.y) > 160;
    /* intro shots, the next-leg flight and the falls cam are their own takes: cut to them, and back */
    const take = k => /^(intro:map|cut:next|falls|replay)/.test(k || "");
    const swap = (key === "race:cut" && mode === "race:front") || (key === "race:front" && mode === "race:cut")
      /* the lineup faces the riders, the start sits behind them: cut, never swing through the pack */
      || (key === "grid" && mode !== "intro:dive") || (key === "countdown" && mode === "grid");
    if (!primed || (changed && (take(key) || swap || /^(falls|replay)/.test(mode || ""))) || far) {
      /* intro shots and the next-leg flight are their own takes: cut, then hold their track */
      Object.assign(eye, w.eye); Object.assign(look, w.look); fov = w.fov; primed = true;
    } else {
      const fast = /^(intro|cut:next|podium)/.test(key) && key !== "intro:dive";
      const rateEye = fast ? 9 : key === "arrival" ? 1.4 : /^moment/.test(key) ? 3.2 : 1.9;
      const rateLook = fast ? 9 : key === "arrival" ? 1.8 : /^moment/.test(key) ? 4.5 : 2.6;
      const ke = 1 - Math.exp(-dt * rateEye), kl = 1 - Math.exp(-dt * rateLook);
      eye.x += (w.eye.x - eye.x) * ke; eye.y += (w.eye.y - eye.y) * ke; eye.z += (w.eye.z - eye.z) * ke;
      look.x += (w.look.x - look.x) * kl; look.y += (w.look.y - look.y) * kl; look.z += (w.look.z - look.z) * kl;
      fov += (w.fov - fov) * kl;
    }
    mode = key;
    return { eye, look, fov, key, shot:w.shot, cutGroup:w.cutGroup || null };
  }

  return {
    update, punch, legMarks,
    cut() { primed = false; },
    get mode() { return mode; },
  };
}

export { ease };
