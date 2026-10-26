/* Bakes Float's critters (float/client/art/bake/critters.js) into the files
   the screen loads: for every species and detail ("race" for the pack,
   "hero" for close-ups) a compact binary under public/float/critters/, and
   one generated module of what the runtime needs synchronously (bones,
   anchors for hats, shades, the chain and the chip) at
   float/client/art/critterMeta.js.

     node scripts/float-bake-critters.mjs                every species
     node scripts/float-bake-critters.mjs --only frog,capybara
     node scripts/float-bake-critters.mjs --quick        a coarse grid, race only (look iteration)
     node scripts/float-bake-critters.mjs --grid 0.0035  the fine grid's cell (metres)

   The sculpt is sampled as a signed distance field, meshed with surface
   nets, walked onto the true surface, painted (color, fur, occlusion, skin
   weights) and simplified to each detail with meshoptimizer, so a vertex
   keeps the exact attributes it was baked with. Deterministic: the same
   sculpt bakes the same bytes. */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { MeshoptSimplifier } from "three/examples/jsm/libs/meshopt_simplifier.module.js";
import { SPECIES } from "../float/client/art/bake/critters.js";
import { meshSculpt, settle, clean, openEdges } from "../float/client/art/bake/mesher.js";
import { plushAttributes, topFour } from "../float/client/art/bake/attributes.js";
import { Features } from "../float/client/art/bake/features.js";
import { encodeCritter, reorderByFirstUse } from "../float/client/art/bake/pack.js";
import { toSrgb8, smooth } from "../float/client/art/bake/sdf.js";
import { FUR_MAX } from "../float/client/art/plush.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const OUT = path.join(ROOT, "public/float/critters");
const META = path.join(ROOT, "float/client/art/critterMeta.js");
const args = process.argv.slice(2);
const value = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const QUICK = args.includes("--quick");
const ONLY = value("--only") ? value("--only").split(",") : null;
const GRID = Number(value("--grid")) || (QUICK ? 0.007 : 0.0035);
const DETAILS = QUICK ? ["race"] : ["race", "hero"];
const TARGET = { race: 5000, hero: 30000 };
const log = (...a) => console.log(...a);
const r5 = v => +(+v).toFixed(5);
const r5a = a => a.map(r5);

await MeshoptSimplifier.ready;
fs.mkdirSync(OUT, { recursive: true });

/* the meta module so far (an --only bake keeps the others) */
let META_SO_FAR = {};
if (fs.existsSync(META)) {
  try { META_SO_FAR = { ...(await import(pathToFileURL(META).href + `?t=${Date.now()}`)).CRITTER_META }; } catch (error) { log(`(meta unreadable, starting over: ${error.message})`); }
}

const ids = ONLY || Object.keys(SPECIES);
for (const id of ids) {
  if (!SPECIES[id]) { console.error(`no species ${id}`); process.exitCode = 1; continue; }
  const t0 = Date.now();
  log(`${id}`);
  const sp = SPECIES[id]();
  const { sculpt, rig } = sp;
  const boneNames = rig.bones.map(b => b.name);
  /* the face first: the plush keeps bare round the eyes and the mouth, so
     no fur grows over them */
  const pre = new Features(sculpt, "race");
  sp.face(pre);
  const clearings = pre.clearings;
  sculpt.paint((p, n, own, m) => {
    for (const c of clearings) {
      const d = Math.hypot(p[0] - c.p[0], p[1] - c.p[1], p[2] - c.p[2]);
      if (d < c.r) m.fur *= 0.3 + 0.7 * smooth(c.r * 0.5, c.r, d);
    }
  });
  /* the fine mesh */
  let mesh = meshSculpt(sculpt, { h: GRID, log });
  mesh = clean(settle(sculpt, mesh), { log });
  const holes = openEdges(mesh.indices);
  if (holes.open || holes.many) log(`  warning: ${holes.open} open and ${holes.many} non-manifold edges`);
  const V = mesh.positions.length / 3;
  const attrs = plushAttributes(sculpt, mesh, boneNames, { smoothing: Math.round(0.022 ** 2 / GRID ** 2 * 1.2), log });
  /* what the simplifier weighs besides position: color, normal, fur, tint */
  const simAttr = new Float32Array(V * 8);
  for (let v = 0; v < V; v++) {
    const c = attrs.color;
    simAttr.set([toSrgb8(c[v * 3]) / 255, toSrgb8(c[v * 3 + 1]) / 255, toSrgb8(c[v * 3 + 2]) / 255,
      mesh.normals[v * 3], mesh.normals[v * 3 + 1], mesh.normals[v * 3 + 2], attrs.mat[v * 5], attrs.mat[v * 5 + 3]], v * 8);
  }
  const pos32 = new Float32Array(mesh.positions);
  const furLength = sp.fur?.length ?? 0.01;
  const files = {};
  const stats = {};
  let anchorFeatures = null;
  for (const detail of DETAILS) {
    const target = Math.min(mesh.indices.length, TARGET[detail] * 3);
    const [plushIdx, error] = MeshoptSimplifier.simplifyWithAttributes(new Uint32Array(mesh.indices), pos32, 3, simAttr, 8,
      [0.8, 0.8, 0.8, 0.35, 0.35, 0.35, 0.3, 0.8], null, target, 0.08, ["Regularize"]);
    /* the features, built for this detail */
    const feats = new Features(sculpt, detail);
    sp.face(feats);
    if (detail === "hero" || !anchorFeatures) anchorFeatures = feats;
    /* merge: the plush body's used vertices, then every feature piece */
    const plushUsed = reorderByFirstUse(plushIdx, V);
    const featVerts = feats.pieces.reduce((s, p) => s + p.geo.attributes.position.count, 0);
    const featIdx = feats.pieces.reduce((s, p) => s + p.geo.index.count, 0);
    const NV = plushUsed.order.length + featVerts, NI = plushIdx.length + featIdx;
    const positions = new Float32Array(NV * 3), normals = new Float32Array(NV * 3);
    const color = new Uint8Array(NV * 4), mat = new Uint8Array(NV * 4), skinIndex = new Uint8Array(NV * 4), skinWeight = new Uint8Array(NV * 4);
    const index = new Uint32Array(NI);
    const ti = [0, 0, 0, 0], tw = [0, 0, 0, 0];
    plushUsed.order.forEach((src, v) => {
      positions.set([mesh.positions[src * 3], mesh.positions[src * 3 + 1], mesh.positions[src * 3 + 2]], v * 3);
      normals.set([mesh.normals[src * 3], mesh.normals[src * 3 + 1], mesh.normals[src * 3 + 2]], v * 3);
      const m = attrs.mat;
      /* fur: the sculpt's share times the species' length, as a share of FUR_MAX */
      color.set([toSrgb8(attrs.color[src * 3]), toSrgb8(attrs.color[src * 3 + 1]), toSrgb8(attrs.color[src * 3 + 2]), Math.round(Math.min(1, (m[src * 5] * furLength) / FUR_MAX) * 255)], v * 4);
      /* occlusion, fuzz, roughness (never 0: that is a catch light), tint */
      mat.set([Math.round(m[src * 5 + 4] * 255), Math.round(m[src * 5 + 1] * 255), Math.max(1, Math.round(m[src * 5 + 2] * 255)), Math.round(m[src * 5 + 3] * 255)], v * 4);
      topFour(attrs.weights, src, attrs.boneCount, ti, tw);
      skinIndex.set(ti, v * 4); skinWeight.set(tw, v * 4);
    });
    index.set(plushUsed.index, 0);
    let vb = plushUsed.order.length, ib = plushIdx.length;
    for (const piece of feats.pieces) {
      const g = piece.geo, n = g.attributes.position.count;
      const bone = boneNames.indexOf(piece.bone);
      if (bone < 0) throw new Error(`${id}: feature on unknown bone ${piece.bone}`);
      const c = piece.color;
      for (let i = 0; i < n; i++) {
        positions.set([g.attributes.position.getX(i), g.attributes.position.getY(i), g.attributes.position.getZ(i)], (vb + i) * 3);
        normals.set([g.attributes.normal.getX(i), g.attributes.normal.getY(i), g.attributes.normal.getZ(i)], (vb + i) * 3);
        color.set([toSrgb8(c.r), toSrgb8(c.g), toSrgb8(c.b), 0], (vb + i) * 4);
        mat.set([255, Math.round(piece.fuzz * 255), piece.rough <= 0 ? 0 : Math.max(1, Math.round(piece.rough * 255)), 0], (vb + i) * 4);
        skinIndex.set([bone, bone, bone, bone], (vb + i) * 4);
        skinWeight.set([255, 0, 0, 0], (vb + i) * 4);
      }
      for (let k = 0; k < g.index.count; k++) index[ib + k] = vb + g.index.getX(k);
      vb += n; ib += g.index.count;
    }
    /* number the merged vertices by first use (the plush ones already are) */
    const merged = reorderByFirstUse(index, NV);
    const take = (arr, k) => { const out = new arr.constructor(merged.order.length * k); merged.order.forEach((src, v) => { for (let j = 0; j < k; j++) out[v * k + j] = arr[src * k + j]; }); return out; };
    const data = { positions: take(positions, 3), normals: take(normals, 3), color: take(color, 4), mat: take(mat, 4), skinIndex: take(skinIndex, 4), skinWeight: take(skinWeight, 4),
      index: merged.index, plushIndices: plushIdx.length, bones: boneNames.length };
    const { bytes, raw } = encodeCritter(data);
    const hash = crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 10);
    const name = `${id}.${detail}.bin`;
    fs.writeFileSync(path.join(OUT, name), bytes);
    files[detail] = { file: `${name}?v=${hash}`, bytes: bytes.length, triangles: NI / 3, plush: plushIdx.length / 3, vertices: merged.order.length };
    stats[detail] = `${plushIdx.length / 3} plush + ${featIdx / 3} feature tris, ${merged.order.length} verts, err ${error.toFixed(4)}, ${(raw / 1024).toFixed(0)} KB raw, ${(bytes.length / 1024).toFixed(0)} KB`;
    log(`  ${detail}: ${stats[detail]}`);
  }
  const meta = anchorsOf(sp, anchorFeatures, boneNames);
  /* only what this bake made: a quick bake drops the hero (it falls back to race) */
  meta.files = files;
  META_SO_FAR[id] = meta;
  log(`  ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

writeMeta(META_SO_FAR);

/* ── what the runtime needs of a sculpt, measured from it ── */
function anchorsOf(sp, feats, boneNames) {
  const { sculpt, rig, head: H } = sp;
  const skipNames = names => part => (names || []).includes(part.name);
  const movable = part => part.movable;
  const cast = (from, dir, skip) => sculpt.raycast(from, dir, { skip });
  /* the head as an ellipsoid (portraits, the drink's sip point) */
  const ext = d => { const p = cast(H, d, part => part.movable || part.group === "ear" || part.group === "mane" || part.group === "turret"); return p; };
  const px = ext([1, 0, 0]), py = ext([0, 1, 0]), pz = ext([0, 0, -1]);
  const headInfo = { at: r5a(H), r: r5a([Math.abs(px[0] - H[0]), Math.abs(py[1] - H[1]), Math.abs(pz[2] - H[2])]) };
  /* the hat: on the crown, sized to the head there */
  const hat = sp.hat || {};
  const top = cast(hat.from || H, [0, 1, hat.back || 0], skipNames(hat.skip));
  /* a hat sits down over the crown, not on its very top */
  top[1] -= hat.sink || 0;
  const band = top[1] - 0.06;
  const wide = cast([H[0], band, top[2]], [1, 0, 0], skipNames(hat.skip));
  const halfW = Math.abs(wide[0]);
  /* the chain: round the neck where the head melts into the body, front low */
  const ch = sp.chain || {};
  const ring = [];
  const N = 26;
  for (let i = 0; i <= N; i++) {
    const phi = -2.1 + (i / N) * 4.2;
    const k = ((1 + Math.cos(phi)) / 2) ** 1.4;
    const y = (ch.back ?? 0.44) + ((ch.front ?? 0.35) - (ch.back ?? 0.44)) * k;
    const p = cast([0, y, ch.z ?? 0.0], [Math.sin(phi), 0, -Math.cos(phi)], movable);
    const n = sculpt.normal(p[0], p[1], p[2]);
    ring.push([...r5a(p.map((v, j) => v + n[j] * 0.011)), ...r5a(n)]);
  }
  const front = ring[Math.round(N / 2)];
  const chipY = front[1] - 0.074 - 0.022;
  const onChest = cast([0, chipY, ch.z ?? 0.0], [0, 0, -1], movable);
  const cn = sculpt.normal(onChest[0], onChest[1], onChest[2]);
  const chip = { p: r5a([0, chipY, onChest[2] - 0.0125]), n: r5a(cn) };
  /* shades: lenses before the eyes, arms back along the head */
  const temple = [-1, 1].map(s => { const p = cast(H, [s * 0.97, 0.05, 0.25], movable); const n = sculpt.normal(...p); return r5a(p.map((v, j) => v + n[j] * 0.01)); });
  const strap = [[-0.6, 0.05, 0.8], [0.6, 0.05, 0.8], [0, 0.05, 1]].map(d => { const p = cast(H, d, movable); const n = sculpt.normal(...p); return r5a(p.map((v, j) => v + n[j] * 0.012)); });
  const bones = rig.bones.map(b => ({ name: b.name, parent: b.parent ? boneNames.indexOf(b.parent) : -1, at: r5a(b.at) }));
  const info = {
    hipY: rig.info.hipY,
    armL: packArm(rig.info.armL), armR: packArm(rig.info.armR),
    head: headInfo, mouth: { p: feats.anchors.mouth?.p || r5a([0, H[1] - 0.1, H[2] - 0.2]) },
    eyes: feats.anchors.eyes, eyeSize: feats.anchors.eyeSize,
    ...(sp.info || {}),
  };
  return {
    id: sp.sculpt.id, bones, info,
    sockets: { hat: { at: r5a(top), s: r5(hat.s ?? 1), tilt: r5(hat.tilt ?? -0.04), halfW: r5(halfW) }, shades: { onEyes: !!sp.shadesOnEyes, w: sp.shadesW ?? 1 } },
    anchors: { chain: ring, chip, temple, strap },
    fur: sp.fur || { length: 0.01, density: 1 },
    bounds: sculpt.bounds(0),
  };
}

function packArm(a) { return { dir: r5a(a.dir), pole: r5a(a.pole), a: a.a, b: a.b, shoulder: r5a(a.shoulder) }; }

function writeMeta(all) {
  const ids = Object.keys(all).sort((a, b) => Object.keys(SPECIES).indexOf(a) - Object.keys(SPECIES).indexOf(b));
  const body = ids.map(id => `  ${id}: ${JSON.stringify(all[id])},`).join("\n");
  const text = `/* Generated by scripts/float-bake-critters.mjs from float/client/art/bake/:
   do not edit. Per species: its skeleton, what the animation reads of its
   shape (arms, head, mouth, eyes), where its hat, shades, chain and chip
   sit, its fur, and its baked files (public/float/critters/). */
export const CRITTER_META = {
${body}
};
`;
  fs.writeFileSync(META, text);
  log(`wrote ${path.relative(ROOT, META)} (${(text.length / 1024).toFixed(1)} KB)`);
}
