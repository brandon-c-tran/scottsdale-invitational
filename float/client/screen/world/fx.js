/* The water's little moments, pooled so nothing allocates in a race: spray
   and droplets (one Points draw), balloons in flight (one instanced draw),
   the falls' mist, the podium's confetti (one instanced draw), and the
   groove's sparks (one additive Points draw). */
import * as THREE from "three";
import { rng } from "./cpuNoise.js";

const SPRAY = 900;
const BALLOONS = 24;
const CONFETTI = 260;
const SPARKS = 480;

export function createFx({ scene, dotTex, geo, falls = [] }) {
  const rand = rng(41);
  /* ── spray ── */
  const pos = new Float32Array(SPRAY * 3), col = new Float32Array(SPRAY * 3), size = new Float32Array(SPRAY), alpha = new Float32Array(SPRAY);
  const vel = new Float32Array(SPRAY * 3), life = new Float32Array(SPRAY), maxLife = new Float32Array(SPRAY), grow = new Float32Array(SPRAY);
  let next = 0;
  const sprayGeo = new THREE.BufferGeometry();
  sprayGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  sprayGeo.setAttribute("color", new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  sprayGeo.setAttribute("aSize", new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  sprayGeo.setAttribute("aAlpha", new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  const sprayMat = new THREE.ShaderMaterial({
    uniforms:{ uMap:{ value:dotTex }, uScale:{ value:540 } },
    vertexShader:/* glsl */ `
      uniform float uScale;
      attribute float aSize;
      attribute float aAlpha;
      attribute vec3 color;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vColor = color; vAlpha = aAlpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * uScale / max(1.0, -mv.z);
      }`,
    fragmentShader:/* glsl */ `
      uniform sampler2D uMap;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float a = texture(uMap, gl_PointCoord).a * vAlpha;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vColor, a);
      }`,
    transparent:true, depthWrite:false,
  });
  const spray = new THREE.Points(sprayGeo, sprayMat);
  spray.frustumCulled = false;
  spray.renderOrder = 4;
  scene.add(spray);
  const white = new THREE.Color("#e8f2ff");
  const emit = (x, y, z, vx, vy, vz, s, l, c = white, g = 0) => {
    const k = next; next = (next + 1) % SPRAY;
    pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
    vel[k * 3] = vx; vel[k * 3 + 1] = vy; vel[k * 3 + 2] = vz;
    col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
    size[k] = s; life[k] = l; maxLife[k] = l; grow[k] = g; alpha[k] = 1;
  };
  /* ── sparks: additive glints that twinkle as they rise (a rider Locked in) ── */
  const sPos = new Float32Array(SPARKS * 3), sCol = new Float32Array(SPARKS * 3), sSize = new Float32Array(SPARKS), sAlpha = new Float32Array(SPARKS);
  const sVel = new Float32Array(SPARKS * 3), sLife = new Float32Array(SPARKS), sMax = new Float32Array(SPARKS), sSeed = new Float32Array(SPARKS);
  let sNext = 0;
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute("position", new THREE.BufferAttribute(sPos, 3).setUsage(THREE.DynamicDrawUsage));
  sparkGeo.setAttribute("color", new THREE.BufferAttribute(sCol, 3).setUsage(THREE.DynamicDrawUsage));
  sparkGeo.setAttribute("aSize", new THREE.BufferAttribute(sSize, 1).setUsage(THREE.DynamicDrawUsage));
  sparkGeo.setAttribute("aAlpha", new THREE.BufferAttribute(sAlpha, 1).setUsage(THREE.DynamicDrawUsage));
  const sparkMat = new THREE.ShaderMaterial({
    uniforms:{ uMap:{ value:dotTex }, uScale:{ value:540 } },
    vertexShader:sprayMat.vertexShader,
    fragmentShader:/* glsl */ `
      uniform sampler2D uMap;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float d = texture(uMap, gl_PointCoord).a;
        float a = d * vAlpha;
        if (a < 0.01) discard;
        /* a white-hot core in the spark's colour */
        gl_FragColor = vec4(mix(vColor, vec3(1.0), smoothstep(0.75, 1.0, d) * 0.7) * a, 1.0);
      }`,
    transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
  });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.frustumCulled = false;
  sparks.renderOrder = 5;
  scene.add(sparks);
  const spark = (x, y, z, vx, vy, vz, s, l, c) => {
    const k = sNext; sNext = (sNext + 1) % SPARKS;
    sPos[k * 3] = x; sPos[k * 3 + 1] = y; sPos[k * 3 + 2] = z;
    sVel[k * 3] = vx; sVel[k * 3 + 1] = vy; sVel[k * 3 + 2] = vz;
    sCol[k * 3] = c.r * 1.6; sCol[k * 3 + 1] = c.g * 1.6; sCol[k * 3 + 2] = c.b * 1.6;
    sSize[k] = s; sLife[k] = l; sMax[k] = l; sSeed[k] = rand() * 6.28; sAlpha[k] = 0;
  };
  /* a few sparks around a rider (called a dozen times a second while it is Locked in) */
  const sparkle = (r, c, scale = 1) => {
    for (let n = 0; n < 2; n++) {
      const a = rand() * Math.PI * 2, d = (0.7 + rand() * 0.6) * scale;
      spark(r.x + Math.cos(a) * d, r.z + 0.3 + rand() * 1.2 * scale, -(r.y + Math.sin(a) * d),
        Math.cos(a) * 0.25, 0.5 + rand() * 0.7, -Math.sin(a) * 0.25, 0.12 + rand() * 0.12, 0.55 + rand() * 0.45, c);
    }
  };
  /* the moment a rider locks in: a ring of sparks thrown up and out */
  const sparkBurst = (r, c, count = 46, scale = 1) => {
    for (let n = 0; n < count; n++) {
      const a = (n / count) * Math.PI * 2 + rand() * 0.3, sp = (1.6 + rand() * 2.2) * scale * 0.7;
      spark(r.x + Math.cos(a) * 0.6 * scale, r.z + 0.6 * scale, -(r.y + Math.sin(a) * 0.6 * scale),
        Math.cos(a) * sp, 1.6 + rand() * 2.6, -Math.sin(a) * sp, 0.14 + rand() * 0.16, 0.7 + rand() * 0.6, c);
    }
  };

  /* a rider's splash: a ring of droplets and a puff */
  const splash = (r, strength = 1, c = white) => {
    const x = r.x, y = r.z + 0.25, z = -r.y;
    const n = Math.round(14 + strength * 22);
    for (let k = 0; k < n; k++) {
      const a = rand() * Math.PI * 2, sp = (1.2 + rand() * 2.4) * strength;
      emit(x + Math.cos(a) * 0.6, y, z + Math.sin(a) * 0.6, Math.cos(a) * sp, 2.2 + rand() * 3.4 * strength, Math.sin(a) * sp,
        0.18 + rand() * 0.22, 0.7 + rand() * 0.5, c);
    }
    for (let k = 0; k < 4; k++) emit(x + (rand() - 0.5), y, z + (rand() - 0.5), 0, 0.6, 0, 1.4 + strength, 0.8, white, 1.8);
  };
  const paddle = (r, side) => {
    const cos = Math.cos(r.a), sin = Math.sin(r.a);
    /* the paddle's side: left of the heading is (-sin, cos) */
    const lx = -sin * side * -1.1, ly = cos * side * -1.1;
    for (let k = 0; k < 4; k++) {
      emit(r.x + lx, r.z + 0.2, -(r.y + ly), -cos * 1.2 + (rand() - 0.5), 1.4 + rand() * 1.3, sin * 1.2 + (rand() - 0.5),
        0.12 + rand() * 0.1, 0.45 + rand() * 0.25);
    }
  };

  /* ── balloons ── */
  const balloonGeo = new THREE.SphereGeometry(0.42, 14, 10);
  balloonGeo.scale(1, 1.18, 1);
  const balloonMat = new THREE.MeshStandardMaterial({ roughness:0.25, metalness:0, emissive:"#000000" });
  const balloons = new THREE.InstancedMesh(balloonGeo, balloonMat, BALLOONS);
  balloons.count = 0;
  balloons.frustumCulled = false;
  scene.add(balloons);
  const flights = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), at = new THREE.Vector3(), euler = new THREE.Euler();
  const throwBalloon = ({ from, target, color:c, at:start, ms = 1200 }) => {
    if (flights.length >= BALLOONS) flights.shift();
    flights.push({ from, target, color:new THREE.Color(c || "#ff6fb8"), start, ms, spin:rand() * 6 });
  };
  const balloonSplash = r => {
    splash(r, 1.1, new THREE.Color("#bfe9ff"));
    for (let k = 0; k < 10; k++) {
      const a = rand() * Math.PI * 2;
      emit(r.x, r.z + 1.2, -r.y, Math.cos(a) * 3, 1 + rand() * 2, Math.sin(a) * 3, 0.16, 0.6, new THREE.Color("#ff9ed2"));
    }
  };

  /* ── confetti ── */
  const confGeo = new THREE.PlaneGeometry(0.22, 0.12);
  const confMat = new THREE.MeshBasicMaterial({ side:THREE.DoubleSide, toneMapped:false });
  const confetti = new THREE.InstancedMesh(confGeo, confMat, CONFETTI);
  confetti.count = 0;
  confetti.frustumCulled = false;
  scene.add(confetti);
  const pieces = [];
  const CONF_COLORS = ["#ff3fa4", "#ffa630", "#5fdcf0", "#ffe04a", "#f4ecd8", "#7be38f"].map(c => new THREE.Color(c).multiplyScalar(1.4));
  const burst = (centre, n = 140, spread = 7) => {
    for (let k = 0; k < n; k++) {
      if (pieces.length >= CONFETTI) pieces.shift();
      pieces.push({
        x:centre.x + (rand() - 0.5) * spread, y:centre.y + 6 + rand() * 5, z:centre.z + (rand() - 0.5) * spread,
        vx:(rand() - 0.5) * 3, vy:1 + rand() * 3, vz:(rand() - 0.5) * 3,
        rx:rand() * 6, ry:rand() * 6, wx:(rand() - 0.5) * 9, wy:(rand() - 0.5) * 9,
        color:CONF_COLORS[k % CONF_COLORS.length], life:6 + rand() * 4,
      });
    }
  };

  /* ── the falls: mist at the foot, always ── */
  const fallSpots = falls.map(f => {
    const p = geo.sample(f.foot + 1.5);
    return { x:p.x, y:p.y, z:geo.elevAt(f.foot + 1.5), w:p.w, nx:p.nx, ny:p.ny, tx:p.tx, ty:p.ty, acc:0 };
  });

  let mistOn = true;
  const update = (dt, time, { camera, riderOf, height = 1080 } = {}) => {
    if (camera) sprayMat.uniforms.uScale.value = sparkMat.uniforms.uScale.value = height / (2 * Math.tan((camera.fov * Math.PI) / 360));
    /* the falls breathe mist and throw droplets */
    if (mistOn) for (const f of fallSpots) {
      if (camera && camera.position.distanceToSquared(at.set(f.x, f.z, -f.y)) > 260 * 260) continue;
      f.acc += dt * 70;
      while (f.acc > 1) {
        f.acc -= 1;
        const lat = (rand() - 0.5) * f.w * 0.9;
        const x = f.x + f.nx * lat, y = f.y + f.ny * lat;
        if (rand() < 0.22) emit(x, f.z + 0.3, -y, f.tx * 1.5 + (rand() - 0.5) * 1.2, 1 + rand() * 1.6, -f.ty * 1.5 + (rand() - 0.5) * 1.2,
          1.2 + rand() * 1.4, 1.1 + rand() * 0.8, white, 1.2);
        else emit(x, f.z + 0.2, -y, f.tx * 2 + (rand() - 0.5) * 2, 2.5 + rand() * 4, -f.ty * 2 + (rand() - 0.5) * 2, 0.16 + rand() * 0.2, 0.9 + rand() * 0.5);
      }
    }
    for (let k = 0; k < SPRAY; k++) {
      if (life[k] <= 0) { if (alpha[k] !== 0) alpha[k] = 0; continue; }
      life[k] -= dt;
      vel[k * 3 + 1] -= (grow[k] > 0 ? 1.2 : 9.8) * dt;
      pos[k * 3] += vel[k * 3] * dt; pos[k * 3 + 1] += vel[k * 3 + 1] * dt; pos[k * 3 + 2] += vel[k * 3 + 2] * dt;
      size[k] += grow[k] * dt;
      const t = life[k] / maxLife[k];
      alpha[k] = grow[k] > 0 ? Math.min(1, t * 1.6) * 0.16 : Math.min(1, t * 2.5) * 0.9;
    }
    sprayGeo.attributes.position.needsUpdate = true;
    sprayGeo.attributes.color.needsUpdate = true;
    sprayGeo.attributes.aSize.needsUpdate = true;
    sprayGeo.attributes.aAlpha.needsUpdate = true;
    /* sparks rise, slow and twinkle out */
    let anySpark = false;
    for (let k = 0; k < SPARKS; k++) {
      if (sLife[k] <= 0) { if (sAlpha[k] !== 0) sAlpha[k] = 0; continue; }
      anySpark = true;
      sLife[k] -= dt;
      const drag = Math.exp(-dt * 2.2);
      sVel[k * 3] *= drag; sVel[k * 3 + 2] *= drag;
      sVel[k * 3 + 1] = sVel[k * 3 + 1] * drag - 1.4 * dt;
      sPos[k * 3] += sVel[k * 3] * dt; sPos[k * 3 + 1] += sVel[k * 3 + 1] * dt; sPos[k * 3 + 2] += sVel[k * 3 + 2] * dt;
      const t = Math.max(0, sLife[k] / sMax[k]);
      sAlpha[k] = Math.min(1, (1 - t) * 8) * Math.min(1, t * 2.2) * (0.55 + 0.45 * Math.sin(time * 26 + sSeed[k]));
    }
    sparks.visible = anySpark;
    if (anySpark) {
      sparkGeo.attributes.position.needsUpdate = true;
      sparkGeo.attributes.color.needsUpdate = true;
      sparkGeo.attributes.aSize.needsUpdate = true;
      sparkGeo.attributes.aAlpha.needsUpdate = true;
    }
    /* balloons arc from the bank to their target, then burst */
    let n = 0;
    for (let k = flights.length - 1; k >= 0; k--) {
      const fl = flights[k];
      const t = (time * 1000 - fl.start) / fl.ms;
      const target = riderOf?.(fl.target);
      if (t >= 1 || t < -0.5 || !target) { flights.splice(k, 1); continue; }
      if (t < 0) continue;
      const tx = target.x, ty = target.y, tz = target.z + 1.1;
      const x = fl.from.x + (tx - fl.from.x) * t, y = fl.from.y + (ty - fl.from.y) * t;
      const z = fl.from.z + (tz - fl.from.z) * t + Math.sin(t * Math.PI) * 6.5;
      q.setFromAxisAngle(at.set(0.3, 1, 0.2).normalize(), fl.spin + t * 9);
      m4.compose(at.set(x, z, -y), q, sc.setScalar(1));
      balloons.setMatrixAt(n, m4);
      balloons.setColorAt(n, fl.color);
      n++;
    }
    balloons.count = n;
    balloons.instanceMatrix.needsUpdate = true;
    if (balloons.instanceColor) balloons.instanceColor.needsUpdate = true;
    /* confetti flutters down */
    let c = 0;
    for (let k = pieces.length - 1; k >= 0; k--) {
      const p = pieces[k];
      p.life -= dt;
      if (p.life <= 0) { pieces.splice(k, 1); continue; }
      p.vy = Math.max(-1.6, p.vy - 4 * dt);
      p.vx += Math.sin(time * 2 + k) * dt * 0.8;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.vx *= 0.985; p.vz *= 0.985;
      p.rx += p.wx * dt; p.ry += p.wy * dt;
      q.setFromEuler(euler.set(p.rx, p.ry, 0));
      m4.compose(at.set(p.x, p.y, p.z), q, sc.setScalar(Math.min(1, p.life)));
      confetti.setMatrixAt(c, m4);
      confetti.setColorAt(c, p.color);
      c++;
    }
    confetti.count = c;
    confetti.instanceMatrix.needsUpdate = true;
    if (confetti.instanceColor) confetti.instanceColor.needsUpdate = true;
  };

  return {
    splash, paddle, balloonSplash, throwBalloon, burst, sparkle, sparkBurst, update,
    setMist(on) { mistOn = on; },
    clear() { life.fill(0); sLife.fill(0); flights.length = 0; pieces.length = 0; },
    dispose() {
      [spray, sparks, balloons, confetti].forEach(o => scene.remove(o));
      sprayGeo.dispose(); sprayMat.dispose(); sparkGeo.dispose(); sparkMat.dispose(); balloonGeo.dispose(); balloonMat.dispose(); balloons.dispose();
      confGeo.dispose(); confMat.dispose(); confetti.dispose();
    },
  };
}
