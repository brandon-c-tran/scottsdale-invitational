/* The water: one ribbon down the centreline at the course's widths and
   heights (the Drop is a real fall in it), in chunks that cull, with a
   stylized night shader: ripples and foam that travel at the current's own
   speed (two-phase flow mapping, so nothing stretches), shallows at the
   banks, foam lines at the edges, white water in riffles and at the falls,
   churn at its foot, the moon's path and the string lights' glints.
   Rocks and islands get foam rings and wakes; the whirlpool turns. */
import * as THREE from "three";
import { NIGHT } from "./palette.js";

const COLS = 14;
const EXTEND = 2;
const CHUNK = 110;

/* where the water falls: the steep stretches of elev, as [lip, foot] in s */
export function fallsOf(geo) {
  const out = [];
  let open = null;
  for (let s = 0; s < geo.length; s += 0.5) {
    const steep = geo.elevAt(s) - geo.elevAt(s + 0.5) > 0.22;
    if (steep && open === null) open = s;
    if (!steep && open !== null) { out.push({ lip:open, foot:s + 0.5, height:geo.elevAt(open) - geo.elevAt(s + 0.5) }); open = null; }
  }
  return out.filter(f => f.height > 1.5);
}

const waterVertex = /* glsl */ `
uniform float uTime;
attribute float aFlow;
attribute float aRough;
attribute float aEdge;
attribute float aSlope;
attribute float aChurn;
attribute float aGlow;
varying vec2 vUv;
varying float vFlow;
varying float vRough;
varying float vEdge;
varying float vSlope;
varying float vChurn;
varying float vGlow;
varying vec3 vWorld;
#include <common>
#include <fog_pars_vertex>
void main() {
  vUv = uv; vFlow = aFlow; vRough = aRough; vEdge = aEdge; vSlope = aSlope; vChurn = aChurn; vGlow = aGlow;
  vec3 p = position;
  float inside = smoothstep(-0.5, 2.5, aEdge);
  float swell = sin(uv.y * 0.55 - uTime * (1.2 + aFlow * 0.8)) * 0.035 + sin(uv.x * 0.9 + uv.y * 0.23 + uTime * 0.8) * 0.025;
  p.y += swell * (0.6 + aRough * 3.0 + aChurn * 4.0) * inside;
  vec4 world = modelMatrix * vec4(p, 1.0);
  vWorld = world.xyz;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const waterFragment = /* glsl */ `
uniform sampler2D uNoise;
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uSkyLow;
uniform vec3 uSkyHigh;
uniform vec3 uMoonDir;
uniform vec3 uMoonColor;
uniform vec3 uFoam;
uniform vec3 uWarm;
varying vec2 vUv;
varying float vFlow;
varying float vRough;
varying float vEdge;
varying float vSlope;
varying float vChurn;
varying float vGlow;
varying vec3 vWorld;
#include <common>
#include <fog_pars_fragment>

/* a pattern carried downstream at the current's speed: two layers half a
   cycle apart, each reset while the other shows */
vec4 flowTex(vec2 uv, float flow, float scale, float rate, vec2 shift) {
  float t = uTime * rate;
  float p0 = fract(t);
  float p1 = fract(t + 0.5);
  float len = flow / rate;
  vec4 a = texture(uNoise, (uv - vec2(0.0, len * p0)) * scale + shift);
  vec4 b = texture(uNoise, (uv - vec2(0.0, len * p1)) * scale + shift + vec2(0.37, 0.61));
  return mix(a, b, abs(0.5 - p0) * 2.0);
}

void main() {
  float rough = clamp(vRough + vChurn * 0.8, 0.0, 1.4);
  vec4 n1 = flowTex(vUv, vFlow, 1.0 / 7.0, 0.3, vec2(0.0));
  vec4 n2 = flowTex(vUv + vec2(3.1, 1.7), vFlow * 1.2, 1.0 / 2.4, 0.42, vec2(0.13, 0.29));
  vec2 slope = (n1.rg - 0.5) * 1.1 + (n2.rg - 0.5) * 0.8;
  float amp = 0.3 + rough * 0.9;
  vec3 N = normalize(vec3(slope.x * amp, 1.0, slope.y * amp));
  vec3 V = normalize(cameraPosition - vWorld);
  float ndv = max(dot(N, V), 0.0);
  float fres = 0.03 + 0.97 * pow(1.0 - ndv, 5.0);
  vec3 R = reflect(-V, N);
  /* the sky in the water: violet at the horizon, deep above */
  vec3 sky = mix(uSkyLow, uSkyHigh, clamp(R.y * 1.6, 0.0, 1.0));
  float md = max(dot(R, uMoonDir), 0.0);
  float moon = pow(md, 900.0) * 14.0 + pow(md, 90.0) * 0.6 + pow(md, 10.0) * 0.05;
  float shallow = smoothstep(6.0, 0.3, vEdge);
  vec3 base = mix(uDeep, uShallow, shallow * 0.75) * (0.85 + n1.a * 0.3);
  vec3 col = mix(base, sky, fres * 0.85);
  col += uMoonColor * moon * (1.0 - min(1.0, vChurn + vSlope));
  /* the bulbs on the water: a warm wash near them and sparse sharp glints */
  float spark = smoothstep(0.83, 0.86, n2.a) * smoothstep(0.6, 0.72, n1.a);
  col += uWarm * vGlow * (0.03 + spark * 1.6 * (0.3 + fres) + fres * 0.22);

  /* foam: soft-edged patches stretched along the current, lace inside them */
  float f1 = flowTex(vUv * vec2(1.0, 0.3), vFlow, 1.0 / 4.2, 0.33, vec2(0.5, 0.2)).a;
  float f2 = flowTex(vUv * vec2(1.0, 0.45) + vec2(7.3, 2.1), vFlow * 1.15, 1.0 / 2.6, 0.45, vec2(0.11, 0.53)).a;
  float field = f1 * 0.7 + f2 * 0.3;
  float lace = flowTex(vUv, vFlow, 1.0 / 2.2, 0.4, vec2(0.3, 0.9)).b;
  float bank = smoothstep(0.85, 0.15, vEdge + (field - 0.5) * 1.4) * smoothstep(-0.95, -0.35, vEdge);
  /* white water: a few streaks in a riffle, a quarter of the surface at most */
  float wt = 0.8 - rough * 0.1;
  float white = smoothstep(wt, wt + 0.03, field) * min(1.0, rough * 1.6);
  /* the falls: sheets of white streaming down over darker water */
  float fall = smoothstep(0.2, 0.65, vSlope);
  float sA = texture(uNoise, vec2(vUv.x * 0.45, vWorld.y * 0.09 + uTime * 0.9)).a;
  float sB = texture(uNoise, vec2(vUv.x * 1.05 + 0.37, vWorld.y * 0.21 + uTime * 1.7)).a;
  float sheet = smoothstep(0.38, 0.7, sA * 0.6 + sB * 0.4);
  float falls = fall * (0.35 + 0.65 * sheet);
  /* churn at the foot: white there, thinning to streaks downstream */
  float ct = 0.86 - vChurn * 0.46;
  float churn = smoothstep(ct, ct + 0.05, field) * step(0.02, vChurn);
  float foam = clamp(bank * 0.85 + white + falls + churn, 0.0, 1.0);
  float lines = smoothstep(0.8, 0.93, flowTex(vUv * vec2(1.0, 0.12), vFlow, 1.0 / 5.0, 0.25, vec2(0.7, 0.1)).a)
    * clamp(vFlow * 0.25, 0.0, 0.5) * (1.0 - foam);
  col += uFoam * lines * 0.22;
  vec3 foamCol = uFoam * (0.62 + 0.28 * ndv) * (0.82 + 0.18 * lace) + uWarm * vGlow * 0.25;
  col = mix(col, foamCol, foam);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export function waterMaterial(noise, moonDir) {
  return new THREE.ShaderMaterial({
    uniforms:THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime:{ value:0 },
      uNoise:{ value:null },
      uDeep:{ value:new THREE.Color(NIGHT.waterDeep) },
      uShallow:{ value:new THREE.Color(NIGHT.waterShallow) },
      uSkyLow:{ value:new THREE.Color(NIGHT.waterSkyLow) },
      uSkyHigh:{ value:new THREE.Color(NIGHT.waterSkyHigh) },
      uMoonDir:{ value:moonDir.clone() },
      uMoonColor:{ value:new THREE.Color(NIGHT.moon) },
      uFoam:{ value:new THREE.Color(NIGHT.foam) },
      uWarm:{ value:new THREE.Color(NIGHT.warm) },
    }]),
    vertexShader:waterVertex,
    fragmentShader:waterFragment,
    fog:true,
  });
}

export function buildRiver(geo, { glowAt, noise, moonDir }) {
  const material = waterMaterial(noise, moonDir);
  material.uniforms.uNoise.value = noise;
  const falls = fallsOf(geo);
  const churnAt = s => {
    let c = 0;
    for (const f of falls) {
      if (s >= f.foot) c = Math.max(c, Math.exp(-(s - f.foot) / 7));
      else if (s > f.lip - 3) c = Math.max(c, 0.25 * (1 - (f.lip - s) / 3));
    }
    return c;
  };
  /* sample spacing: 2 m, half a metre over a fall */
  const stations = [];
  for (let s = -8; s <= geo.length + 10;) {
    stations.push(s);
    const steep = falls.some(f => s > f.lip - 2 && s < f.foot + 2);
    s += steep ? 0.5 : 2;
  }
  const meshes = [];
  const tmp = {};
  let start = 0;
  while (start < stations.length - 1) {
    let end = start;
    while (end < stations.length - 1 && stations[end] - stations[start] < CHUNK) end++;
    const rows = end - start + 1;
    const cols = COLS + 1;
    const pos = new Float32Array(rows * cols * 3), uv = new Float32Array(rows * cols * 2);
    const flow = new Float32Array(rows * cols), rough = new Float32Array(rows * cols), edge = new Float32Array(rows * cols);
    const slope = new Float32Array(rows * cols), churn = new Float32Array(rows * cols), glow = new Float32Array(rows * cols);
    for (let r = 0; r < rows; r++) {
      const s = stations[start + r];
      const p = geo.sampleInto(s, tmp);
      const z = geo.elevAt(s);
      const dz = (geo.elevAt(s - 0.5) - geo.elevAt(s + 0.5));
      const half = p.w / 2 + EXTEND;
      const f = geo.flowAt(s), ro = geo.roughAt(s), ch = churnAt(s);
      for (let c = 0; c < cols; c++) {
        const lat = -half + (2 * half * c) / COLS;
        const x = p.x + p.nx * lat, y = p.y + p.ny * lat;
        const v = r * cols + c;
        pos[v * 3] = x; pos[v * 3 + 1] = z; pos[v * 3 + 2] = -y;
        uv[v * 2] = lat; uv[v * 2 + 1] = s;
        flow[v] = f;
        rough[v] = ro;
        edge[v] = p.w / 2 - Math.abs(lat);
        slope[v] = Math.max(0, dz);
        churn[v] = ch;
        glow[v] = glowAt ? glowAt(x, y, z) : 0;
      }
    }
    const index = [];
    for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
      /* left-handed across the ribbon: winding up, facing the sky */
      index.push(a, d, b, b, d, e);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geometry.setAttribute("aFlow", new THREE.BufferAttribute(flow, 1));
    geometry.setAttribute("aRough", new THREE.BufferAttribute(rough, 1));
    geometry.setAttribute("aEdge", new THREE.BufferAttribute(edge, 1));
    geometry.setAttribute("aSlope", new THREE.BufferAttribute(slope, 1));
    geometry.setAttribute("aChurn", new THREE.BufferAttribute(churn, 1));
    geometry.setAttribute("aGlow", new THREE.BufferAttribute(glow, 1));
    geometry.setIndex(index);
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "water";
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    meshes.push(mesh);
    start = end;
  }
  return { meshes, material, falls };
}

/* ── foam rings and wakes round rocks and islands, and the whirlpool ── */
const decalVertex = /* glsl */ `
attribute vec4 aDecal;
varying vec2 vUv;
varying vec4 vDecal;
#include <common>
#include <fog_pars_vertex>
void main() {
  vUv = uv * 2.0 - 1.0;
  vDecal = aDecal;
  vec4 mvPosition = viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const decalFragment = /* glsl */ `
uniform sampler2D uNoise;
uniform float uTime;
uniform vec3 uFoam;
varying vec2 vUv;
varying vec4 vDecal;
#include <common>
#include <fog_pars_fragment>
void main() {
  /* vUv: x downstream, y across, in units of the decal's half length; vDecal.x the ring's radius there */
  /* the decal's centre sits downstream of the rock when it has a wake */
  float lead = vDecal.z > 0.01 ? 0.55 * vDecal.y : 0.0;
  vec2 p = vec2(vUv.x * vDecal.y + lead, vUv.y);
  float r = length(p);
  float ringR = vDecal.x;
  float n = texture(uNoise, vec2(p.x * 0.35 - uTime * 0.35 * vDecal.z, p.y * 0.35) + vDecal.w).a;
  float ring = smoothstep(ringR + 0.24, ringR + 0.04, r) * smoothstep(ringR - 0.12, ringR + 0.02, r);
  float wake = 0.0;
  if (vDecal.z > 0.01 && p.x > 0.0) {
    float spread = ringR * (0.8 + p.x * 0.28);
    float edge = abs(abs(p.y) - spread);
    wake = smoothstep(0.14, 0.0, edge) * pow(smoothstep(vDecal.y * 1.5, 0.0, p.x), 2.0) * 0.55;
    /* the stirred water straight behind the rock */
    wake += smoothstep(ringR, 0.0, abs(p.y)) * smoothstep(ringR * 3.0, ringR * 0.8, p.x) * smoothstep(0.0, ringR * 0.8, p.x) * 0.45;
  }
  float a = clamp((ring + wake) * smoothstep(0.05, 0.45, n), 0.0, 1.0);
  if (a < 0.02) discard;
  gl_FragColor = vec4(uFoam, a * 0.9);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export function buildFoamDecals(geo, { noise }) {
  const items = [];
  const tmp = {};
  for (const [x, y, r] of geo.rocks) {
    const near = geo.nearest(x, y);
    const p = geo.sampleInto(near.s, tmp);
    items.push({ x, y, z:geo.elevAt(near.s) + 0.03, r, tx:p.tx, ty:p.ty, wake:Math.min(1.6, geo.flowAt(near.s) * 0.6 + 0.4) });
  }
  for (const [x, y, r] of geo.islands) {
    const near = geo.nearest(x, y);
    const p = geo.sampleInto(near.s, tmp);
    items.push({ x, y, z:geo.elevAt(near.s) + 0.03, r:r + 0.6, tx:p.tx, ty:p.ty, wake:0 });
  }
  if (!items.length) return null;
  const material = new THREE.ShaderMaterial({
    uniforms:THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uNoise:{ value:null }, uTime:{ value:0 }, uFoam:{ value:new THREE.Color(NIGHT.foam) } }]),
    vertexShader:decalVertex, fragmentShader:decalFragment, transparent:true, depthWrite:false, fog:true,
    polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-2,
  });
  material.uniforms.uNoise.value = noise;
  const plane = new THREE.PlaneGeometry(1, 1);
  plane.rotateX(-Math.PI / 2);
  const mesh = new THREE.InstancedMesh(plane, material, items.length);
  const decal = new Float32Array(items.length * 4);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), at = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  items.forEach((it, k) => {
    /* the decal's +x runs downstream: in three, (tx, 0, -ty) */
    const ang = Math.atan2(it.ty, it.tx);
    q.setFromAxisAngle(up, ang);
    const half = it.wake ? it.r * 2.8 : it.r * 1.7;
    const across = it.r * 1.7;
    sc.set(half * 2, 1, across * 2);
    at.set(it.x + (it.wake ? it.tx * half * 0.55 : 0), it.z, -(it.y + (it.wake ? it.ty * half * 0.55 : 0)));
    m.compose(at, q, sc);
    mesh.setMatrixAt(k, m);
    /* ring radius in the decal's across-units, length ratio, wake, noise offset */
    decal[k * 4] = it.r / across;
    decal[k * 4 + 1] = half / across;
    decal[k * 4 + 2] = it.wake;
    decal[k * 4 + 3] = (k * 0.137) % 1;
  });
  plane.setAttribute("aDecal", new THREE.InstancedBufferAttribute(decal, 4));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.renderOrder = 2;
  mesh.name = "foam";
  return { mesh, material };
}

/* the whirlpool: a spiral of foam turning over a dark eye */
export function buildWhirlpools(geo, { noise }) {
  const spans = geo.zoneSpans("whirlpool");
  if (!spans.length) return null;
  const group = new THREE.Group();
  const material = new THREE.ShaderMaterial({
    uniforms:THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uNoise:{ value:noise }, uTime:{ value:0 }, uFoam:{ value:new THREE.Color(NIGHT.foam) } }]),
    vertexShader:/* glsl */ `
      varying vec2 vUv;
      #include <common>
      #include <fog_pars_vertex>
      void main() {
        vUv = uv * 2.0 - 1.0;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader:/* glsl */ `
      uniform sampler2D uNoise;
      uniform float uTime;
      uniform vec3 uFoam;
      varying vec2 vUv;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        float r = length(vUv);
        if (r > 1.0) discard;
        float a = atan(vUv.y, vUv.x);
        float spiral = a + log(max(r, 0.02)) * 3.2 + uTime * 1.6;
        float arms = smoothstep(0.55, 0.95, sin(spiral * 3.0) * 0.5 + 0.5);
        float n = texture(uNoise, vec2(spiral * 0.2, r * 1.3)).b;
        float foam = arms * smoothstep(1.0, 0.55, r) * smoothstep(0.08, 0.3, r) * (0.55 + 0.45 * n);
        float eye = smoothstep(0.35, 0.0, r);
        vec3 col = mix(uFoam, vec3(0.0, 0.02, 0.04), eye);
        float alpha = clamp(foam * 0.85 + eye * 0.75, 0.0, 1.0) * smoothstep(1.0, 0.8, r);
        if (alpha < 0.02) discard;
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    transparent:true, depthWrite:false, fog:true, polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-2,
  });
  const centres = [];
  for (const z of spans) {
    const s = (z.s0 + z.s1) / 2;
    const p = geo.sample(s);
    const inside = geo.turnAt(s) >= 0 ? 1 : -1;
    const lat = inside * p.w * 0.24;
    const radius = Math.min(8, p.w * 0.24);
    const x = p.x + p.nx * lat, y = p.y + p.ny * lat;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 48), material);
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(x, geo.elevAt(s) + 0.04, -y);
    disc.renderOrder = 2;
    group.add(disc);
    centres.push({ x, y, s, radius });
  }
  return { group, material, centres };
}
