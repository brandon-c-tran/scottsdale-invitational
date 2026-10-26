/* The camera director. Pure: course coordinates in (x east, y north, z up),
   an eye, a look-at point and a field of view out, so the 3D world, the flat
   map and tests share it. Every framing is a target the camera eases toward
   frame-rate independently (1 - exp(-rate * dt)); a phase that jumps across
   the river cuts instead of whipping.

     lobby      a slow orbit over the put-in
     intro      a shot per leg down the whole river, then down onto the grid
     grid       behind the grid, low, pushing in
     countdown  closer and lower
     race       the pack from the leader back to the cut line's fight, looking
                downstream with look-ahead, rising as it spreads
     arrival    once someone is in: the takeout from downstream, facing the
                riders coming home
     cut        the takeout, then a flight down the next leg to its grid
     podium     the bar, front-on, a slow push and drift */

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const smooth = t => t * t * (3 - 2 * t);

export const FOV = 42;

/* the most telling stretch of a leg, for its intro shot */
function legFeature(geo, leg) {
  const order = ["drop", "whirlpool", "split", "narrows", "riffle", "pool", "bar"];
  for (const kind of order) {
    const z = geo.zones.find(item => item.k === kind && item.s1 > leg.grid && item.s0 < leg.finish);
    if (z) return { kind, s:clamp((Math.max(z.s0, leg.grid) + Math.min(z.s1, leg.finish)) / 2, leg.grid, leg.finish) };
  }
  return { kind:"river", s:(leg.grid + leg.finish) / 2 };
}

export function createDirector(geo, { wallAt = () => 8 } = {}) {
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

  function introShots(legs, round) {
    const shots = [];
    legs.forEach((leg, k) => {
      const f = legFeature(geo, leg);
      shots.push({ leg:k, kind:f.kind, s:f.s });
    });
    return { shots, grid:legs[Math.min(legs.length - 1, round)] };
  }

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
        const total = Math.max(6000, dur || 15000);
        const { shots, grid } = introShots(legs, round);
        const swoop = Math.min(3200, total * 0.24);
        const each = (total - swoop) / Math.max(1, shots.length);
        if (t < total - swoop) {
          const k = Math.min(shots.length - 1, Math.floor(t / each));
          const u = (t - k * each) / each;
          const shot = shots[k];
          return { ...featureShot(shot, u), key:`intro:${k}`, cut:true, shot:k };
        }
        const u = smooth(clamp((t - (total - swoop)) / swoop, 0, 1));
        const g = grid || L;
        const from = { eye:behind(g.grid, 70, 42), look:at(g.grid + 30) };
        const to = gridShot(g, 0);
        return { eye:mix3(from.eye, to.eye, u), look:mix3(from.look, to.look, u), fov:lerp(48, FOV, u), key:"intro:grid", cut:true, shot:shots.length };
      }
      case "grid": return { ...gridShot(L, time), key:"grid" };
      case "countdown": {
        const g = gridShot(L, 3 + time);
        const close = { eye:behind(L.grid, 15, 5.5), look:at(L.grid + 12, 0, 0.5) };
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
      case "podium":
      case "feedback": return { ...podiumShot(input, time, phase === "feedback"), key:phase === "feedback" ? "podium" : "podium", cut:true };
      default: return null;
    }
  }

  function mix3(a, b, u) { return { x:lerp(a.x, b.x, u), y:lerp(a.y, b.y, u), z:lerp(a.z, b.z, u) }; }

  function featureShot(shot, u) {
    const s = shot.s;
    switch (shot.kind) {
      case "drop": {
        /* below the falls, looking back up at them, then rising to show the bar */
        const e = at(s + 34 - u * 10, 6, 6 + u * 10);
        return { eye:e, look:at(s - 4 + u * 30, 0, 4 - u * 2), fov:46 };
      }
      case "whirlpool": {
        const c = at(s);
        const a = -1.2 + u * 0.9;
        return { eye:{ x:c.x + Math.cos(a) * 46, y:c.y + Math.sin(a) * 46, z:c.z + 34 }, look:{ x:c.x, y:c.y, z:c.z }, fov:46 };
      }
      case "narrows": return { eye:behind(s - 20 + u * 40, 22, 9), look:at(s + u * 40 + 14, 0, 2), fov:48 };
      case "split": return { eye:behind(s - 30 + u * 30, 30, 30), look:at(s + u * 20), fov:46 };
      default: return { eye:behind(s - 30 + u * 46, 40, 26), look:at(s + 10 + u * 46), fov:46 };
    }
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

  function raceShot(input, L, time) {
    const { riders = [], through = 0 } = input;
    const water = riders.filter(r => r.state === "racing" && Number.isFinite(r.s));
    const home = riders.filter(r => r.state !== "racing");
    /* someone is in: the takeout, facing the riders coming home */
    if (home.length && water.length) {
      const closest = water.reduce((best, r) => (r.s > best.s ? r : best), water[0]);
      const chasing = water.filter(r => r.rank <= through + 1);
      const tail = Math.min(...(chasing.length ? chasing : [closest]).map(r => r.s));
      const reach = clamp(L.finish - tail, 10, 90);
      const e = at(L.finish + 14 + reach * 0.15, Math.sin(time * 0.2) * 3, 7 + reach * 0.32);
      const lookP = at(L.finish - reach * 0.55, 0, 0);
      return { eye:e, look:lookP, fov:44, key:"arrival" };
    }
    if (!water.length) return { ...takeoutShot(L, riders, time), key:"arrival" };
    /* the pack: leader back to the first rider outside the cut */
    const ranked = water.slice().sort((a, b) => a.rank - b.rank);
    const front = ranked[0];
    const cutRank = Math.max(1, Math.min(through + 1, ranked[ranked.length - 1].rank));
    const inFight = ranked.filter(r => r.rank <= cutRank);
    const sMax = Math.max(...inFight.map(r => r.s));
    let sMin = Math.min(...inFight.map(r => r.s));
    /* never stretch past what reads: the leader and the fight first */
    if (sMax - sMin > 120) sMin = sMax - 120;
    const span = sMax - sMin;
    const lat = inFight.reduce((sum, r) => sum + (r.lat || 0), 0) / inFight.length;
    const sFocus = sMin + span * 0.62 + 7;
    const dist = clamp(span * 0.6 + 20, 22, 90);
    const up = dist * 0.33 + 2.5;
    void front;
    /* look a little past the pack: the river ahead and the horizon stay in frame */
    return { eye:behind(sFocus, dist * 0.9, up, lat * 0.4), look:at(sFocus + 6 + dist * 0.06, lat * 0.5, 0), fov:lerp(FOV, 46, clamp(span / 110, 0, 1)), key:"race" };
  }

  function podiumShot(input, time, wide) {
    const p = input.podiumAt;
    if (!p) return { eye:at(geo.length - 30, 0, 10), look:at(geo.length - 6), fov:FOV };
    const drift = Math.sin(time * 0.22) * 0.12;
    const back = wide ? 17 : 13 - Math.min(2.5, time * 0.18);
    const fx = p.fx, fy = p.fy;
    const side = { x:-fy, y:fx };
    return {
      eye:{ x:p.x + fx * back + side.x * Math.sin(drift) * back, y:p.y + fy * back + side.y * Math.sin(drift) * back, z:p.z + (wide ? 5.4 : 3.6) },
      look:{ x:p.x, y:p.y, z:p.z + 2.2 },
      fov:wide ? 46 : 40,
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
    if (!primed || (changed && (w.cut && /^(intro|cut:next)/.test(key) ? !/^intro:grid/.test(key) : false)) || far) {
      /* intro shots and the next-leg flight are their own takes: cut, then hold their track */
      Object.assign(eye, w.eye); Object.assign(look, w.look); fov = w.fov; primed = true;
    } else {
      const fast = /^(intro|cut:next|podium)/.test(key);
      const rateEye = fast ? 9 : key === "arrival" ? 1.4 : /^moment/.test(key) ? 3.2 : 1.9;
      const rateLook = fast ? 9 : key === "arrival" ? 1.8 : /^moment/.test(key) ? 4.5 : 2.6;
      const ke = 1 - Math.exp(-dt * rateEye), kl = 1 - Math.exp(-dt * rateLook);
      eye.x += (w.eye.x - eye.x) * ke; eye.y += (w.eye.y - eye.y) * ke; eye.z += (w.eye.z - eye.z) * ke;
      look.x += (w.look.x - look.x) * kl; look.y += (w.look.y - look.y) * kl; look.z += (w.look.z - look.z) * kl;
      fov += (w.fov - fov) * kl;
    }
    mode = key;
    return { eye, look, fov, key, shot:w.shot };
  }

  return {
    update, punch,
    cut() { primed = false; },
    get mode() { return mode; },
  };
}

export { ease };
