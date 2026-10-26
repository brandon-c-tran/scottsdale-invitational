/* The night sky: a dome from deep indigo at the top to a violet glow at the
   horizon (warmest under the moon), stars that twinkle, and a big cream
   moon with a halo. None of it takes fog; it is the backdrop. */
import * as THREE from "three";
import { NIGHT } from "./palette.js";
import { rng } from "./cpuNoise.js";

export const MOON_ELEVATION = 0.2;

export function moonDirection(geo) {
  /* the moon hangs ahead of the river's general run, so the camera looking
     downstream finds it, and its path lies on the water in front */
  const a = geo.sample(geo.length * 0.25), b = geo.sample(geo.length * 0.85);
  const heading = Math.atan2(b.y - a.y, b.x - a.x) + 0.32;
  const el = MOON_ELEVATION;
  return new THREE.Vector3(Math.cos(heading) * Math.cos(el), Math.sin(el), -Math.sin(heading) * Math.cos(el)).normalize();
}

export function buildSky({ moonDir, radius = 3800 }) {
  const group = new THREE.Group();
  group.name = "sky";
  const dome = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), new THREE.ShaderMaterial({
    uniforms:{
      uZenith:{ value:new THREE.Color(NIGHT.zenith) },
      uSky:{ value:new THREE.Color(NIGHT.sky) },
      uHorizon:{ value:new THREE.Color(NIGHT.horizon) },
      uGlow:{ value:new THREE.Color(NIGHT.glow) },
      uMoonDir:{ value:moonDir.clone() },
    },
    vertexShader:/* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader:/* glsl */ `
      uniform vec3 uZenith;
      uniform vec3 uSky;
      uniform vec3 uHorizon;
      uniform vec3 uGlow;
      uniform vec3 uMoonDir;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, -0.2, 1.0);
        vec3 col = mix(uHorizon, uSky, smoothstep(0.0, 0.28, h));
        col = mix(col, uZenith, smoothstep(0.25, 0.85, h));
        float toward = max(dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(uMoonDir.x, 0.0, uMoonDir.z))), 0.0);
        col += uGlow * pow(toward, 3.0) * smoothstep(0.32, 0.0, h) * 0.45;
        float md = max(dot(d, uMoonDir), 0.0);
        col += vec3(0.55, 0.52, 0.62) * pow(md, 24.0) * 0.35 + vec3(0.3, 0.28, 0.4) * pow(md, 6.0) * 0.12;
        col *= smoothstep(-0.2, 0.0, d.y) * 0.6 + 0.4;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side:THREE.BackSide, depthWrite:false, fog:false,
  }));
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  group.add(dome);

  /* stars on the upper dome, brighter few */
  const rand = rng(23);
  const count = 2600;
  const pos = new Float32Array(count * 3), size = new Float32Array(count), seed = new Float32Array(count);
  for (let k = 0; k < count; k++) {
    const u = rand(), v = rand();
    const theta = u * Math.PI * 2;
    const y = 0.04 + Math.pow(v, 0.8) * 0.96;
    const r = Math.sqrt(1 - y * y);
    pos[k * 3] = Math.cos(theta) * r * radius * 0.96;
    pos[k * 3 + 1] = y * radius * 0.96;
    pos[k * 3 + 2] = Math.sin(theta) * r * radius * 0.96;
    size[k] = rand() < 0.06 ? 3.2 + rand() * 2.4 : 1.1 + rand() * 1.4;
    seed[k] = rand() * 100;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  starGeo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  starGeo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  const starMat = new THREE.ShaderMaterial({
    uniforms:{ uTime:{ value:0 }, uScale:{ value:1 } },
    vertexShader:/* glsl */ `
      uniform float uTime;
      uniform float uScale;
      attribute float aSize;
      attribute float aSeed;
      varying float vTw;
      varying float vLow;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        vTw = 0.65 + 0.35 * sin(uTime * (1.3 + fract(aSeed) * 2.2) + aSeed);
        vLow = smoothstep(0.02, 0.22, normalize(position).y);
        gl_PointSize = aSize * uScale;
      }`,
    fragmentShader:/* glsl */ `
      varying float vTw;
      varying float vLow;
      void main() {
        vec2 c = gl_PointCoord * 2.0 - 1.0;
        float a = smoothstep(1.0, 0.0, length(c));
        gl_FragColor = vec4(vec3(1.0, 0.96, 0.9) * vTw * 1.4, a * vLow);
      }`,
    transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, fog:false,
  });
  const stars = new THREE.Points(starGeo, starMat);
  stars.frustumCulled = false;
  stars.renderOrder = -9;
  group.add(stars);

  /* the moon: a disc with soft maria, and its halo */
  const moonDist = radius * 0.9;
  const moonMat = new THREE.ShaderMaterial({
    uniforms:{ uColor:{ value:new THREE.Color(NIGHT.moon) } },
    vertexShader:/* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader:/* glsl */ `
      uniform vec3 uColor;
      varying vec2 vUv;
      float blob(vec2 p, vec2 c, float r) { return smoothstep(r, r * 0.4, length(p - c)); }
      void main() {
        float r = length(vUv);
        float disc = smoothstep(0.5, 0.485, r);
        float halo = pow(max(0.0, 1.0 - r), 3.0) * 0.55;
        vec2 p = vUv / 0.5;
        float maria = blob(p, vec2(-0.25, 0.2), 0.32) * 0.5 + blob(p, vec2(0.2, -0.15), 0.26) * 0.4 + blob(p, vec2(0.35, 0.35), 0.16) * 0.35
          + blob(p, vec2(-0.1, -0.45), 0.18) * 0.3;
        float limb = 1.0 - pow(min(1.0, r / 0.5), 6.0) * 0.25;
        vec3 face = uColor * (1.25 - maria * 0.28) * limb;
        vec3 col = face * disc * 1.6 + uColor * halo * (1.0 - disc);
        float a = max(disc, halo);
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent:true, depthWrite:false, fog:false,
  });
  const moon = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), moonMat);
  const moonSize = radius * 0.24;
  moon.scale.set(moonSize, moonSize, 1);
  moon.position.copy(moonDir).multiplyScalar(moonDist);
  moon.renderOrder = -8;
  moon.frustumCulled = false;
  group.add(moon);

  return {
    group,
    update(camera, time, viewportHeight = 1080) {
      group.position.copy(camera.position);
      moon.quaternion.copy(camera.quaternion);
      starMat.uniforms.uTime.value = time;
      starMat.uniforms.uScale.value = Math.max(0.7, viewportHeight / 1080);
    },
    dispose() {
      dome.geometry.dispose(); dome.material.dispose();
      starGeo.dispose(); starMat.dispose();
      moon.geometry.dispose(); moonMat.dispose();
    },
  };
}
