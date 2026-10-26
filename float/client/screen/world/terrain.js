/* The canyon: one heightfield around the whole river, from the course alone.
   Every vertex finds its distance to the centreline, and its height comes
   from a bank profile (riverbed, wet edge, beach, talus, cliff, rim) whose
   walls are tallest in The Narrows and open out at every put-in and
   takeout. Distance-based, so the inside of a tight bend never folds.
   Islands rise as their own banks. The sandstone is layered in the
   fragment shader by height; the string lights' glow is baked per vertex. */
import * as THREE from "three";
import { fbm, noise2, smoothstep } from "./cpuNoise.js";
import { NIGHT } from "./palette.js";

const STEP = 3;
const MARGIN = 150;

/* wall height by the zones at s, before smoothing */
function wallTarget(geo, s) {
  const kinds = geo.zonesAt(s);
  let h = 9 + fbm(s * 0.006, 3.1, 2, 4) * 8;
  if (kinds.includes("narrows")) h = 27;
  else if (kinds.includes("drop")) h = 17;
  else if (kinds.includes("whirlpool")) h = 15;
  else if (kinds.includes("split")) h = 8;
  else if (kinds.includes("riffle")) h = Math.max(h, 11);
  if (kinds.includes("bar")) h = 1.6;
  else if (kinds.includes("pool")) h = Math.min(h, 6);
  /* every put-in and takeout is an open beach */
  for (const leg of geo.legs) {
    for (const at of [leg.grid, leg.finish]) h = Math.min(h, 3.2 + Math.max(0, Math.abs(s - at) - 18) * 0.35);
  }
  if (s < 30) h = Math.min(h, 3);
  return Math.max(1.2, h);
}

export function terrainField(geo) {
  const { bounds } = geo;
  const x0 = bounds.minX - MARGIN, y0 = bounds.minY - MARGIN;
  const nx = Math.ceil((bounds.maxX - bounds.minX + 2 * MARGIN) / STEP) + 1;
  const ny = Math.ceil((bounds.maxY - bounds.minY + 2 * MARGIN) / STEP) + 1;
  const count = nx * ny;
  const bestD2 = new Float32Array(count).fill(Infinity);
  const bestS = new Float32Array(count);
  const bestSide = new Int8Array(count);
  const { xs, ys, ss, n } = geo;
  for (let i = 0; i < n - 1; i++) {
    const ax = xs[i], ay = ys[i], bx = xs[i + 1], by = ys[i + 1];
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy || 1, seg = Math.sqrt(len2);
    const ix0 = Math.max(0, Math.floor((Math.min(ax, bx) - MARGIN - x0) / STEP));
    const ix1 = Math.min(nx - 1, Math.ceil((Math.max(ax, bx) + MARGIN - x0) / STEP));
    const iy0 = Math.max(0, Math.floor((Math.min(ay, by) - MARGIN - y0) / STEP));
    const iy1 = Math.min(ny - 1, Math.ceil((Math.max(ay, by) + MARGIN - y0) / STEP));
    for (let iy = iy0; iy <= iy1; iy++) {
      const py = y0 + iy * STEP;
      for (let ix = ix0; ix <= ix1; ix++) {
        const px = x0 + ix * STEP;
        let t = ((px - ax) * dx + (py - ay) * dy) / len2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = ax + dx * t - px, qy = ay + dy * t - py;
        const d2 = qx * qx + qy * qy;
        const k = iy * nx + ix;
        if (d2 < bestD2[k]) {
          bestD2[k] = d2;
          bestS[k] = ss[i] + seg * t;
          bestSide[k] = (dx * (py - ay) - dy * (px - ax)) >= 0 ? 1 : -1;
        }
      }
    }
  }
  /* wall heights along the river, smoothed */
  const WS = 4;
  const wn = Math.ceil(geo.length / WS) + 1;
  const raw = new Float32Array(wn);
  for (let k = 0; k < wn; k++) raw[k] = wallTarget(geo, k * WS);
  const wall = new Float32Array(wn);
  const R = 9;
  for (let k = 0; k < wn; k++) {
    let sum = 0, cnt = 0;
    for (let j = Math.max(0, k - R); j <= Math.min(wn - 1, k + R); j++) { sum += raw[j]; cnt++; }
    wall[k] = sum / cnt;
  }
  const wallAt = s => wall[Math.max(0, Math.min(wn - 1, Math.round(s / WS)))];

  const bars = geo.zones.filter(z => z.k === "bar").map(z => ({ s0:z.s0, s1:z.s1, side:z.side === -1 ? -1 : 1 }));
  /* the desert away from the river: one gentle plain, so the canyon's rims
     fall away to it instead of stepping where the field runs out */
  let elevSum = 0;
  for (let k = 0; k <= 20; k++) elevSum += geo.elevAt(geo.length * k / 20);
  const plain = elevSum / 21 + 10;
  const farLevel = (x, y) => plain + fbm(x * 0.004, y * 0.004, 3, 31) * 9;
  const heights = new Float32Array(count);
  const kind = new Uint8Array(count); /* 0 bed, 1 wet, 2 beach, 3 green, 4 wall, 5 rim */
  /* continuous, so colours blend instead of stepping along the grid:
     tone 0 wet, 1 sand, 2 scrub, 3 rim; rock 0..1 how much bare cliff shows */
  const tone = new Float32Array(count);
  const rock = new Float32Array(count);
  const tmp = {};
  const islands = geo.islands;
  for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
    const k = iy * nx + ix;
    const px = x0 + ix * STEP, py = y0 + iy * STEP;
    const far = bestD2[k] === Infinity;
    const s = far ? 0 : bestS[k];
    const p = geo.sampleInto(s, tmp);
    const dist = far ? MARGIN * 1.4 : Math.sqrt(bestD2[k]);
    const d = dist - p.w / 2;
    const zw = geo.elevAt(s);
    const side = bestSide[k] || 1;
    const sideVar = 1 + 0.28 * noise2(s * 0.011, side * 3.7, 8);
    const wallH = wallAt(s) * sideVar;
    let beachW = 2 + 5 * smoothstep(14, 3, wallH) + 2.5 * (noise2(s * 0.03, side * 5.1, 9) + 0.5);
    /* a takeout's gravel bar: a wide beach on its side */
    for (const bar of bars) if (side === bar.side && s > bar.s0 - 8 && s < bar.s1 + 8) beachW += 10 * smoothstep(bar.s0 - 8, bar.s0 + 4, s) * smoothstep(bar.s1 + 8, bar.s1 - 4, s);
    const run = wallH < 7 ? wallH * 3.2 + 4 : wallH * 0.85 + 2;
    let h, kd, tn = 0, rk = 0;
    if (d < -2) { h = -1.1 - Math.min(2.6, (-d - 2) * 0.16); kd = 0; }
    else if (d < 1.2) { h = -1.1 + ((d + 2) / 3.2) * 1.45; kd = d < 0.2 ? 1 : 2; tn = smoothstep(-0.4, 1.1, d); }
    else if (d < 1.2 + beachW) {
      h = 0.35 + (d - 1.2) * 0.07 + noise2(px * 0.2, py * 0.2, 2) * 0.06; kd = d < 1.2 + beachW * 0.55 ? 2 : 3;
      tn = 1 + smoothstep(beachW * 0.35, beachW * 0.95, d - 1.2 + noise2(px * 0.08, py * 0.08, 12) * 2.5);
    }
    else {
      const x = d - 1.2 - beachW;
      const top = 0.35 + beachW * 0.07;
      const t = Math.min(1, x / run);
      const talus = smoothstep(0, 0.38, t) * 0.2;
      const cliff = smoothstep(0.32, 0.8, t) * 0.8;
      const rough = fbm(px * 0.05, py * 0.05, 3, 3) * (0.4 + wallH * 0.03);
      h = top + wallH * (talus + cliff) + rough * smoothstep(0.1, 0.5, t);
      if (x > run) h += (x - run) * 0.03 + fbm(px * 0.012, py * 0.012, 3, 6) * 4 * smoothstep(run, run + 40, x);
      kd = t < 0.3 ? 3 : t < 0.97 ? 4 : 5;
      tn = 2 + smoothstep(0.9, 1.2, x / run);
      rk = smoothstep(0.16, 0.5, t) * (1 - 0.5 * smoothstep(run, run + 35, x));
    }
    let z = zw + h;
    /* far out, the plain */
    if (far) { z = farLevel(px, py); kd = 5; tn = 3; rk = 0; }
    else if (d > 70) { const u = smoothstep(70, MARGIN - 10, dist); z += (farLevel(px, py) - z) * u; rk *= 1 - u; }
    for (const [ix2, iy2, r] of islands) {
      const di = Math.hypot(px - ix2, py - iy2) - r;
      if (di > 3) continue;
      const ih = di < 0 ? 0.55 + Math.min(1.8, -di * 0.22) + noise2(px * 0.3, py * 0.3, 7) * 0.25 : 0.55 - di * 0.55;
      if (zw + ih > z) { z = zw + ih; kd = di < -1.5 ? 3 : 2; tn = 1 + smoothstep(-0.5, -3.5, di); rk = 0; }
    }
    heights[k] = z;
    kind[k] = kd;
    tone[k] = tn;
    rock[k] = rk;
  }

  /* one soft pass over the land (not the bed or the shore), so cliff edges
     follow the canyon, not the grid's staircase */
  const smoothed = heights.slice();
  for (let iy = 1; iy < ny - 1; iy++) for (let ix = 1; ix < nx - 1; ix++) {
    const k = iy * nx + ix;
    if (kind[k] < 3) continue;
    let sum = 0, w = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const j = k + dy * nx + dx;
      if (kind[j] < 2) continue;
      const wt = dx === 0 && dy === 0 ? 2 : 1;
      sum += heights[j] * wt; w += wt;
    }
    smoothed[k] = sum / w;
  }
  heights.set(smoothed);

  /* the field's outer band eases to the plain's own level, so the desert
     floor (dressing.js) meets every edge at one height: no seam, no gap */
  for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
    const e = edgeU(ix, iy, nx, ny, STEP);
    if (e <= 0) continue;
    const k = iy * nx + ix;
    heights[k] += (plain - heights[k]) * e;
    rock[k] *= 1 - e;
  }

  const heightAt = (x, y) => {
    const fx = (x - x0) / STEP, fy = (y - y0) / STEP;
    const ix = Math.max(0, Math.min(nx - 2, Math.floor(fx))), iy = Math.max(0, Math.min(ny - 2, Math.floor(fy)));
    const tx = Math.min(1, Math.max(0, fx - ix)), ty = Math.min(1, Math.max(0, fy - iy));
    const k = iy * nx + ix;
    const a = heights[k] + (heights[k + 1] - heights[k]) * tx;
    const b = heights[k + nx] + (heights[k + nx + 1] - heights[k + nx]) * tx;
    return a + (b - a) * ty;
  };
  const kindAt = (x, y) => {
    const ix = Math.max(0, Math.min(nx - 1, Math.round((x - x0) / STEP))), iy = Math.max(0, Math.min(ny - 1, Math.round((y - y0) / STEP)));
    return kind[iy * nx + ix];
  };
  /* metres past the water's edge, and the wall there (for scatter) */
  const bankInfo = (x, y) => {
    const ix = Math.max(0, Math.min(nx - 1, Math.round((x - x0) / STEP))), iy = Math.max(0, Math.min(ny - 1, Math.round((y - y0) / STEP)));
    const k = iy * nx + ix;
    if (bestD2[k] === Infinity) return { d:MARGIN, s:0, wall:8 };
    const s = bestS[k];
    return { d:Math.sqrt(bestD2[k]) - geo.sample(s).w / 2, s, wall:wallAt(s) };
  };
  return { x0, y0, nx, ny, step:STEP, heights, kind, tone, rock, heightAt, kindAt, bankInfo, wallAt, edge:plain };
}

/* 0 inside, 1 at the field's last few metres */
const EDGE_BAND = 45;
function edgeU(ix, iy, nx, ny, step) {
  const e = Math.min(ix, nx - 1 - ix, iy, ny - 1 - iy) * step;
  return e >= EDGE_BAND ? 0 : smoothstep(EDGE_BAND, 5, e);
}

const KIND_TINT = [
  new THREE.Color("#2e221c"), /* bed, under the water */
  new THREE.Color("#4a3020"), /* wet edge */
  new THREE.Color("#a27a52"), /* beach sand */
  new THREE.Color("#55613a"), /* scrub and willow */
  new THREE.Color("#ffffff"), /* wall: the strata colour it */
  new THREE.Color("#9c7650"), /* rim */
];

const TONES = [KIND_TINT[1], KIND_TINT[2], KIND_TINT[3], KIND_TINT[5]];
/* the rim with its scrub, on average: the field's edge and the floor past it */
export const FAR_TINT = KIND_TINT[5].clone().lerp(KIND_TINT[3], 0.375);

/* tiles of the field as meshes (each its own draw, so the off-screen ones cull) */
export function terrainMeshes(field, { glowAt, noise }) {
  const { x0, y0, nx, ny, step, heights, kind, tone, rock } = field;
  const material = new THREE.MeshLambertMaterial({ vertexColors:true, flatShading:true });
  /* the beat's pulse (World sets it): the lamplight on the banks breathes */
  const pulse = { value:0 };
  material.userData.pulse = pulse;
  material.onBeforeCompile = shader => {
    shader.uniforms.uNoise = { value:noise };
    shader.uniforms.uPulse = pulse;
    shader.uniforms.uWarm = { value:new THREE.Color(NIGHT.warm) };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aGlow;\nattribute float aWall;\nvarying float vGlow;\nvarying float vWall;\nvarying vec3 vWorldP;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvGlow = aGlow; vWall = aWall;\nvWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
uniform sampler2D uNoise;
uniform vec3 uWarm;
uniform float uPulse;
varying float vGlow;
varying float vWall;
varying vec3 vWorldP;
vec3 strata(float y, float n) {
  float b = fract(y * 0.16 + n * 0.22);
  vec3 c1 = vec3(0.42, 0.11, 0.04);
  vec3 c2 = vec3(0.6, 0.24, 0.08);
  vec3 c3 = vec3(0.24, 0.07, 0.03);
  vec3 c4 = vec3(0.68, 0.38, 0.17);
  vec3 c = mix(c1, c2, smoothstep(0.12, 0.2, b));
  c = mix(c, c3, smoothstep(0.38, 0.44, b));
  c = mix(c, c4, smoothstep(0.56, 0.62, b));
  c = mix(c, c2, smoothstep(0.74, 0.8, b));
  c = mix(c, c1, smoothstep(0.92, 0.98, b));
  return c;
}`)
      .replace("#include <color_fragment>", `#include <color_fragment>
{
  float n1 = texture(uNoise, vWorldP.xz * 0.02).a;
  float n2 = texture(uNoise, vWorldP.xz * 0.11 + vec2(0.3, 0.7)).a;
  /* desert varnish: dark streaks running down the walls */
  float varnish = texture(uNoise, vec2((vWorldP.x + vWorldP.z) * 0.05, vWorldP.y * 0.008)).a;
  vec3 rock = strata(vWorldP.y, n1 - 0.5) * (0.85 + 0.25 * n2) * mix(1.0, 0.62, smoothstep(0.55, 0.8, varnish));
  diffuseColor.rgb = mix(diffuseColor.rgb * (0.88 + 0.24 * n2), rock, vWall);
}`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
totalEmissiveRadiance += uWarm * vGlow * 0.55 * (1.0 + uPulse * 0.45);`);
  };
  const TILE = 72;
  const meshes = [];
  const color = new THREE.Color();
  for (let ty = 0; ty < ny - 1; ty += TILE) for (let tx = 0; tx < nx - 1; tx += TILE) {
    const w = Math.min(TILE, nx - 1 - tx) + 1, h = Math.min(TILE, ny - 1 - ty) + 1;
    const pos = new Float32Array(w * h * 3), col = new Float32Array(w * h * 3), glow = new Float32Array(w * h), wall = new Float32Array(w * h);
    let lowest = Infinity;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const gx = tx + i, gy = ty + j, k = gy * nx + gx, v = j * w + i;
      const x = x0 + gx * step, y = y0 + gy * step, z = heights[k];
      pos[v * 3] = x; pos[v * 3 + 1] = z; pos[v * 3 + 2] = -y;
      lowest = Math.min(lowest, z);
      /* wet, sand, scrub, rim, blended by the continuous tone */
      const tn = Math.max(0, Math.min(3, tone[k]));
      const lo = Math.min(2, Math.floor(tn));
      color.copy(TONES[lo]).lerp(TONES[lo + 1], tn - lo);
      if (tn > 2.2) color.lerp(TONES[2], (0.25 + 0.25 * noise2(x * 0.05, y * 0.05, 4)) * (tn - 2.2) / 0.8);
      if (kind[k] === 0) color.copy(KIND_TINT[0]);
      const eu = edgeU(gx, gy, nx, ny, step);
      if (eu > 0) color.lerp(FAR_TINT, eu);
      col[v * 3] = color.r; col[v * 3 + 1] = color.g; col[v * 3 + 2] = color.b;
      wall[v] = rock[k];
      glow[v] = glowAt ? glowAt(x, y, z) : 0;
    }
    const index = [];
    for (let j = 0; j < h - 1; j++) for (let i = 0; i < w - 1; i++) {
      const a = j * w + i, b = a + 1, c = a + w, d = c + 1;
      /* skip the riverbed tiles nobody sees, deep under the water */
      if (kind[(ty + j) * nx + tx + i] === 0 && kind[(ty + j) * nx + tx + i + 1] === 0 && kind[(ty + j + 1) * nx + tx + i] === 0 && kind[(ty + j + 1) * nx + tx + i + 1] === 0) continue;
      /* split each cell along the diagonal that follows the slope, so
         strata and cliff edges run smooth instead of zigzagging */
      const ha = heights[(ty + j) * nx + tx + i], hb = heights[(ty + j) * nx + tx + i + 1];
      const hc = heights[(ty + j + 1) * nx + tx + i], hd = heights[(ty + j + 1) * nx + tx + i + 1];
      if (Math.abs(ha - hd) < Math.abs(hb - hc)) index.push(a, b, d, a, d, c);
      else index.push(a, b, c, b, d, c);
    }
    if (!index.length) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geometry.setAttribute("aGlow", new THREE.BufferAttribute(glow, 1));
    geometry.setAttribute("aWall", new THREE.BufferAttribute(wall, 1));
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "terrain";
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    meshes.push(mesh);
  }
  return { meshes, material };
}
