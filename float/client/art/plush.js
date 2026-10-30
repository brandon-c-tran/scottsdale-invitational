/* The plush finish: what makes a critter read as a soft toy and not a vinyl
   figure. One physical material carries the whole critter (its body and its
   glossy bead eyes alike), reading the baked attributes per vertex:
     aColor  sRGB color, and fur length in alpha
     aMat    occlusion, fuzz (velvet sheen), roughness (0 marks a catch
             light: pure white, unlit), and how much is the rider's color
   High roughness and three's sheen give the velvety edge; a wrapped light
   with a warm tint stands in for light scattering through the fabric; the
   baked occlusion darkens the creases where the parts melt together.

   The fur is drawn as shells: the furry part of the critter's race mesh,
   drawn again N times (one instanced draw), each copy pushed out along the
   normal and thinned by strand noise toward the tips, so the silhouette
   goes fuzzy. Fur is matte: its shells take the lights' diffuse and the
   environment's, never a highlight, and read their strands from a small
   tiling noise texture, so a shell costs a fraction of the body's pixel.

   Materials are shared: one plush material per rider color (counted), one
   fur material per detail. */
import * as THREE from "three";
import { acquire, release, once, normalHex } from "./materials.js";

/* the longest fur a vertex can carry (aColor.a is a share of it) */
export const FUR_MAX = 0.03;

/* the showcase's attribute views (0 off, 1 occlusion, 2 normals, 3 color,
   4 fur length, 5 fuzz, 6 roughness): one value every plush reads */
export const plushDebug = { value: 0 };

/* the velvet rim and the fill every plush and fur shares (uniforms) */
export const PLUSH_LOOK = { rim: { value: 1.6 }, fill: { value: 0.07 } };

const PLUSH_VERT_PARS = /* glsl */ `
attribute vec4 aColor;
attribute vec4 aMat;
varying vec4 vPlush;
varying vec4 vPlushMat;
varying vec3 vRest;
vec3 plushLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
`;

const PLUSH_VERT_MAIN = /* glsl */ `
vPlush = vec4(plushLinear(aColor.rgb), aColor.a);
vPlushMat = aMat;
vRest = position;
`;

const PLUSH_FRAG_PARS = /* glsl */ `
varying vec4 vPlush;
varying vec4 vPlushMat;
varying vec3 vRest;
uniform vec3 uTint;
uniform float uWrap;
uniform vec3 uScatter;
uniform float uGrain;
uniform float uRim;
uniform float uFill;
uniform int uDebug;
float plushHash(vec3 p) { p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
`;

/* the glint marker: roughness quantized to 0 */
const IS_GLINT = "step(vPlushMat.z, 0.002)";

function plushShader(shader, material) {
  shader.uniforms.uTint = material.userData.uTint;
  shader.uniforms.uWrap = material.userData.uWrap;
  shader.uniforms.uScatter = material.userData.uScatter;
  shader.uniforms.uGrain = material.userData.uGrain;
  shader.uniforms.uRim = PLUSH_LOOK.rim;
  shader.uniforms.uFill = PLUSH_LOOK.fill;
  shader.uniforms.uDebug = plushDebug;
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", `#include <common>\n${PLUSH_VERT_PARS}`)
    .replace("#include <begin_vertex>", `#include <begin_vertex>\n${PLUSH_VERT_MAIN}`);
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", `#include <common>\n${PLUSH_FRAG_PARS}`)
    .replace("#include <color_fragment>", `#include <color_fragment>
      float plushGlint = ${IS_GLINT};
      diffuseColor.rgb *= mix(vPlush.rgb, uTint, vPlushMat.w);`)
    .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
      roughnessFactor = mix(0.07, 0.94, vPlushMat.z);`)
    .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
      /* a fine grain on the fabric (close-ups only) */
      if (uGrain > 0.0) {
        vec3 g = vec3(plushHash(floor(vRest * 900.0)), plushHash(floor(vRest * 900.0) + 17.0), plushHash(floor(vRest * 900.0) + 41.0)) - 0.5;
        normal = normalize(normal + g * uGrain * vPlushMat.y);
      }`)
    .replace("#include <lights_physical_fragment>", `#include <lights_physical_fragment>
      #ifdef USE_SHEEN
        material.sheenColor *= vPlushMat.y;
      #endif
      material.specularColor *= mix(1.0, 0.4, vPlushMat.y);
      material.specularF90 *= mix(1.0, 0.5, vPlushMat.y);`)
    .replace("#include <aomap_fragment>", `#include <aomap_fragment>
      {
        float plushAo = mix(0.38, 1.0, vPlushMat.x);
        reflectedLight.indirectDiffuse *= plushAo;
        reflectedLight.indirectSpecular *= plushAo * plushAo;
        reflectedLight.directDiffuse *= mix(1.0, plushAo, 0.55);
        reflectedLight.directSpecular *= plushAo;
        /* light through the fabric: a wrapped, warm diffuse from each key light */
        #if NUM_DIR_LIGHTS > 0
          for (int i = 0; i < NUM_DIR_LIGHTS; i++) {
            float ndl = dot(normal, directionalLights[i].direction);
            float wrapped = clamp((ndl + uWrap) / (1.0 + uWrap), 0.0, 1.0) - clamp(ndl, 0.0, 1.0);
            reflectedLight.directDiffuse += directionalLights[i].color * wrapped * uScatter * diffuseColor.rgb * RECIPROCAL_PI * vPlushMat.y * plushAo;
          }
        #endif
        /* velvet: the silhouette catches the sky, so a soft toy glows at its
           edges against the dark (scaled by the ambient light it gets) */
        float plushNv = clamp(dot(normal, geometryViewDir), 0.0, 1.0);
        reflectedLight.indirectDiffuse *= 1.0 + uRim * pow(1.0 - plushNv, 2.4) * vPlushMat.y;
        /* a little fill, so the darkest fabric never goes to mud */
        reflectedLight.indirectDiffuse += diffuseColor.rgb * uFill * plushAo * (1.0 - ${IS_GLINT});
      }`)
    .replace("#include <opaque_fragment>", `outgoingLight = mix(outgoingLight, vec3(2.4), plushGlint);
      if (uDebug == 1) outgoingLight = vec3(vPlushMat.x);
      else if (uDebug == 2) outgoingLight = normal * 0.5 + 0.5;
      else if (uDebug == 3) outgoingLight = vPlush.rgb;
      else if (uDebug == 4) outgoingLight = vec3(vPlush.a);
      else if (uDebug == 5) outgoingLight = vec3(vPlushMat.y);
      else if (uDebug == 6) outgoingLight = vec3(vPlushMat.z);
      #include <opaque_fragment>`);
}

/* the plush in a rider's color (the swim trunks); counted, so riders of one
   color share it and the last one out disposes it */
export function plush(hex, { grain = 0 } = {}) {
  const color = normalHex(hex);
  return acquire(`plush:${color}:${grain ? "g" : ""}`, () => {
    const m = new THREE.MeshPhysicalMaterial({
      name: `float-plush-${color}`, color: 0xffffff, roughness: 1, metalness: 0,
      sheen: 1, sheenRoughness: 0.5, sheenColor: new THREE.Color(0.42, 0.4, 0.38),
      specularIntensity: 0.6,
    });
    m.userData.uTint = { value: new THREE.Color(color) };
    m.userData.uWrap = { value: 0.55 };
    m.userData.uScatter = { value: new THREE.Color(1.0, 0.42, 0.3).multiplyScalar(0.9) };
    m.userData.uGrain = { value: grain };
    m.userData.plush = true;
    m.onBeforeCompile = shader => plushShader(shader, m);
    m.customProgramCacheKey = () => "float-plush-1";
    return m;
  });
}
export const releasePlush = (hex, { grain = 0 } = {}) => release(`plush:${normalHex(hex)}:${grain ? "g" : ""}`);

/* ── fur shells ───────────────────────────────────────────────────────── */

const FUR_VERT_PARS = /* glsl */ `
attribute vec4 aColor;
attribute vec4 aMat;
uniform float uFurLength;
uniform float uShells;
uniform float uGravity;
varying vec4 vPlush;
varying vec4 vPlushMat;
varying vec3 vRest;
varying float vShell;
vec3 plushLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
`;

const FUR_VERT_MAIN = /* glsl */ `
vShell = (float(gl_InstanceID) + 1.0) / uShells;
vPlush = vec4(plushLinear(aColor.rgb), aColor.a);
vPlushMat = aMat;
vRest = position;
{
  /* aColor.a is the fur's length, a share of uFurLength (the bake's FUR_MAX) */
  float len = uFurLength * aColor.a;
  transformed += normalize(normal) * len * vShell;
  transformed.y -= uGravity * len * vShell * vShell;
}
`;

const FUR_FRAG_PARS = /* glsl */ `
varying vec4 vPlush;
varying vec4 vPlushMat;
varying vec3 vRest;
varying float vShell;
uniform float uDensity;
uniform float uSoft;
uniform float uRim;
uniform float uFill;
uniform sampler3D uNoise;
/* value noise from the tiling texture: the cell's smooth step here, the
   blend between lattice values by the texture unit */
float furNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return texture(uNoise, (i + f + 0.5) / 48.0).r;
}
`;

/* matte: the lights' diffuse and the environment's, no highlight */
const FUR_LIGHTS = /* glsl */ `
void RE_Direct_Fur( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
  reflectedLight.directDiffuse += saturate( dot( geometryNormal, directLight.direction ) ) * directLight.color * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectSpecular_Fur( const in vec3 radiance, const in vec3 irradiance, const in vec3 clearcoatRadiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
  reflectedLight.indirectDiffuse += material.diffuseColor * irradiance * RECIPROCAL_PI;
}
#undef RE_Direct
#define RE_Direct RE_Direct_Fur
#undef RE_IndirectSpecular
#define RE_IndirectSpecular RE_IndirectSpecular_Fur
`;
const FUR_MAPS = /* glsl */ `
#if defined( RE_IndirectDiffuse ) && defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
  iblIrradiance += getIBLIrradiance( geometryNormal );
#endif
`;

/* the strands' noise: a small cube of random values that tiles (its size
   is the 48.0 in furNoise) */
const NOISE_N = 48;
function furNoiseTexture() {
  return once("fur-noise", () => {
    const data = new Uint8Array(NOISE_N ** 3);
    let x = 0x2545f491;
    for (let i = 0; i < data.length; i++) { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; data[i] = (x >>> 0) & 255; }
    const t = new THREE.Data3DTexture(data, NOISE_N, NOISE_N, NOISE_N);
    t.format = THREE.RedFormat;
    t.type = THREE.UnsignedByteType;
    t.minFilter = t.magFilter = THREE.LinearFilter;
    t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping;
    t.generateMipmaps = false;
    t.unpackAlignment = 1;
    t.needsUpdate = true;
    return t;
  });
}

function furShader(shader, material) {
  const u = material.userData;
  Object.assign(shader.uniforms, { uFurLength: u.uFurLength, uShells: u.uShells, uGravity: u.uGravity, uDensity: u.uDensity, uSoft: u.uSoft, uRim: PLUSH_LOOK.rim, uFill: PLUSH_LOOK.fill, uNoise: { value: furNoiseTexture() } });
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", `#include <common>\n${FUR_VERT_PARS}`)
    .replace("#include <begin_vertex>", `#include <begin_vertex>\n${FUR_VERT_MAIN}`);
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", `#include <common>\n${FUR_FRAG_PARS}`)
    .replace("#include <lights_physical_pars_fragment>", `#include <lights_physical_pars_fragment>\n${FUR_LIGHTS}`)
    .replace("#include <lights_fragment_maps>", FUR_MAPS)
    .replace("#include <color_fragment>", `#include <color_fragment>
      {
        /* strands: noise fixed to the surface (so a strand is a column
           through the shells), thinning toward the tips; where a strand is
           smaller than a pixel the noise fades to its average, so the pack
           far away gets a soft halo, not a shimmer */
        vec3 q = vRest * uDensity;
        float n = furNoise(q) * 0.62 + furNoise(q * 2.3 + 13.0) * 0.38;
        vec3 fq = fwidth(q);
        float fade = smoothstep(0.55, 1.3, max(fq.x, max(fq.y, fq.z)));
        float edge = vShell * 0.86;
        /* seen close, strands; seen far, the share of strands that reach this high */
        float a = mix(smoothstep(edge - uSoft, edge + uSoft, n), clamp(1.08 - vShell, 0.0, 1.0), fade) * (1.0 - vShell * vShell * 0.45);
        a *= smoothstep(0.03, 0.2, vPlush.a);
        if (a < 0.02) discard;
        diffuseColor.a *= a;
        /* the roots sit a little in the pelt's shadow */
        diffuseColor.rgb *= vPlush.rgb * mix(0.93, 1.03, vShell);
      }`)
    .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
      roughnessFactor = 0.95;`)
    .replace("#include <aomap_fragment>", `#include <aomap_fragment>
      reflectedLight.indirectDiffuse *= mix(vPlushMat.x, 1.0, vShell * 0.5);
      reflectedLight.directDiffuse *= mix(vPlushMat.x, 1.0, 0.5 + vShell * 0.5);
      {
        float furNv = clamp(dot(normal, geometryViewDir), 0.0, 1.0);
        reflectedLight.indirectDiffuse *= 1.0 + uRim * pow(1.0 - furNv, 2.4);
        reflectedLight.indirectDiffuse += diffuseColor.rgb * uFill;
      }`);
}

/* the fur's material for a detail level; one per detail, shared by everyone */
export function furMaterial(detail = "race") {
  return once(`fur:${detail}`, () => {
    const hero = detail === "hero";
    const m = new THREE.MeshStandardMaterial({ name: `float-fur-${detail}`, color: 0xffffff, roughness: 0.95, metalness: 0, transparent: true, depthWrite: false });
    m.userData = {
      uFurLength: { value: FUR_MAX },
      uShells: { value: hero ? 8 : 4 },
      uGravity: { value: 0.3 },
      uDensity: { value: 380 },
      uSoft: { value: hero ? 0.12 : 0.22 },
      shells: hero ? 8 : 4,
      fur: true,
    };
    m.onBeforeCompile = shader => furShader(shader, m);
    m.customProgramCacheKey = () => "float-fur-2";
    return m;
  });
}
