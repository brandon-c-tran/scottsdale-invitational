/* Float Groove's 2D art (float/GROOVE.md "The art manifest and the 2D art
   module"): the manifest keeps the contract's schema; every critter has
   every pose and its files exist at the box's size; the host, the scenes,
   the props and the font are there; the module's pure parts (reading the
   manifest, anchors, colours, URLs) behave; painting needs a canvas, so in
   node the sprites are the bare files and a portrait is null; index.js
   imports no three.js; the popup letters what chart.js says. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import Module from "node:module";
import sharp from "sharp";
import { build } from "esbuild";
import { CRITTER_IDS, ALL_CRITTER_IDS } from "../float/shared/looks.js";
import { popupOf } from "../float/shared/chart.js";
import * as groove from "../float/client/art/groove/index.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const PUB = join(ROOT, "public");
const DIR = join(PUB, "float/groove");
const manifest = JSON.parse(readFileSync(join(DIR, "manifest.json"), "utf8"));
const POSES = ["idle", "stroke", "hey", "nice", "miss", "chug", "cheer", "out"];
const file = rel => join(DIR, rel);
const size = async rel => { const m = await sharp(file(rel)).metadata(); return [m.width, m.height]; };
const isPoint = (p, w = 1e9, h = 1e9) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) && p[0] >= 0 && p[1] >= 0 && p[0] <= w && p[1] <= h;

test("the manifest's shape: v 1, the eight poses, the 512 box", () => {
  assert.equal(manifest.v, 1);
  assert.deepEqual(manifest.poses, POSES);
  assert.deepEqual(groove.POSES, POSES);
  assert.deepEqual(manifest.box, [512, 512]);
  for (const key of ["critters", "host", "scenes", "props", "font"]) assert.ok(manifest[key], key);
});

test("every critter: anchors in the box, every pose's sprite and tube at 512, the portrait at 1024", async () => {
  for (const id of CRITTER_IDS) {
    const c = manifest.critters[id];
    assert.ok(c, `${id} is in the manifest`);
    for (const name of ["water", "head", "face", "hand"]) assert.ok(isPoint(c.anchor?.[name], 512, 512), `${id} anchor.${name}`);
    for (const pose of POSES) {
      const p = c.poses?.[pose];
      assert.ok(p?.src && p?.tube, `${id} ${pose}`);
      for (const rel of [p.src, p.tube]) {
        assert.ok(existsSync(file(rel)), `${id} ${pose}: ${rel}`);
        assert.deepEqual(await size(rel), [512, 512], `${id} ${pose}: ${rel} is the box`);
      }
      /* a pose's own anchors (optional) stay in the box, the waterline never moves */
      if (p.anchor) {
        for (const [name, at] of Object.entries(p.anchor)) assert.ok(isPoint(at, 512, 512), `${id} ${pose} anchor.${name}`);
        if (p.anchor.water) assert.deepEqual(p.anchor.water, c.anchor.water, `${id} ${pose}: the waterline stays put`);
      }
    }
    const P = c.portrait;
    assert.equal(P.w, 1024); assert.equal(P.h, 1024);
    for (const rel of [P.src, P.tube]) assert.deepEqual(await size(rel), [1024, 1024], `${id} portrait ${rel}`);
    for (const name of ["water", "head", "face"]) assert.ok(isPoint(P.anchor?.[name], 1024, 1024), `${id} portrait anchor.${name}`);
  }
  /* nothing in it but known critters (the 13 and the special ones) */
  for (const id of Object.keys(manifest.critters)) assert.ok(ALL_CRITTER_IDS.includes(id), `${id} is a known critter`);
});

test("a tube mask is white where it is the tube; a sprite is transparent around the critter", async () => {
  const c = manifest.critters.capybara;
  const { data, info } = await sharp(file(c.poses.idle.tube)).ensureAlpha().raw().toBuffer({ resolveWithObject:true });
  let lit = 0, off = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 200) { lit++; if (data[i] < 240 || data[i + 1] < 240 || data[i + 2] < 240) off++; }
  }
  assert.ok(lit > 512 * 512 * 0.02, "the mask covers a tube");
  assert.ok(off / lit < 0.02, "the mask is white");
  const src = await sharp(file(c.poses.idle.src)).ensureAlpha().raw().toBuffer({ resolveWithObject:true });
  const corner = k => src.data[k * 4 + 3];
  for (const k of [0, info.width - 1, info.width * (info.height - 1), info.width * info.height - 1]) assert.equal(corner(k), 0, "the corners are clear");
});

test("the host: its box, anchors and the three poses' files", async () => {
  const h = manifest.host;
  assert.ok(Array.isArray(h.box) && h.box.length === 2);
  for (const name of ["ground", "head", "face", "horn"]) assert.ok(isPoint(h.anchor?.[name], ...h.box), `host anchor.${name}`);
  for (const pose of ["idle", "call", "cheer"]) {
    assert.ok(h.poses?.[pose]?.src, `host ${pose}`);
    assert.deepEqual(await size(h.poses[pose].src), h.box, `host ${pose} is its box`);
  }
});

test("the scenes: the four songs, the lobby, the bar and the podium, layered back to front at 1920 x 1080", async () => {
  for (const id of ["open", "rocks", "whirlpool", "falls", "lobby", "bar", "podium"]) {
    const s = manifest.scenes[id];
    assert.ok(s, id);
    assert.equal(s.w, 1920); assert.equal(s.h, 1080);
    assert.ok(s.water > 0 && s.water < 1, `${id} water`);
    assert.ok(s.layers.length >= 1, `${id} layers`);
    let depth = -1;
    for (const layer of s.layers) {
      assert.ok(layer.depth >= 0 && layer.depth <= 1 && layer.depth >= depth, `${id}: depths go back to front`);
      depth = layer.depth;
      assert.equal(typeof layer.loop, "boolean");
      assert.deepEqual(await size(layer.src), [1920, 1080], `${id} ${layer.src}`);
    }
  }
  /* the songs' scenes are the ones chart.js names */
  const { SONGS } = await import("../float/shared/chart.js");
  for (const song of SONGS) assert.ok(manifest.scenes[song.scene], `${song.id} -> ${song.scene}`);
});

test("the props: at least the contract's, each at its declared size with an anchor inside it", async () => {
  for (const id of ["splash", "ripple", "rock", "whirl", "cup", "crown", "sign-paddle", "sign-rock", "sign-spin", "falls-lip"]) assert.ok(manifest.props[id], id);
  for (const [id, p] of Object.entries(manifest.props)) {
    assert.deepEqual(await size(p.src), [p.w, p.h], `${id} size`);
    assert.ok(isPoint(p.anchor, p.w, p.h), `${id} anchor`);
    assert.equal(typeof p.tint, "boolean", `${id} tint`);
  }
});

test("the font: Float Pixel, the woff2 and its OFL licence beside it, declared once in groove.css", () => {
  assert.equal(manifest.font.family, "Float Pixel");
  assert.match(manifest.font.src, /^\/fonts\/.+\.woff2$/);
  const woff = join(PUB, manifest.font.src);
  assert.ok(existsSync(woff));
  assert.equal(readFileSync(woff).subarray(0, 4).toString("latin1"), "wOF2");
  assert.match(readFileSync(join(PUB, "fonts/pixelify-sans-OFL.txt"), "utf8"), /SIL Open Font License/);
  const css = readFileSync(join(ROOT, "float/client/art/groove/groove.css"), "utf8");
  assert.equal(css.match(/@font-face/g)?.length, 1);
  assert.match(css, /font-family:\s*"Float Pixel"/);
  assert.ok(css.includes(`url("${manifest.font.src}")`));
});

test("reading the manifest: an unknown critter is the capybara, a missing pose is idle, anchors scale, URLs are absolute", () => {
  groove.setGrooveBase("/float/groove/");
  groove.provideGrooveArt(manifest);
  assert.equal(groove.grooveArtNow(), manifest);
  assert.equal(groove.critterArt("dragon"), manifest.critters.capybara);
  assert.equal(groove.critterArt("frog"), manifest.critters.frog);
  const p = groove.poseArt("frog", "cheer");
  assert.equal(p.src, `/float/groove/${manifest.critters.frog.poses.cheer.src}`);
  assert.equal(groove.poseArt("frog", "nope").src, `/float/groove/${manifest.critters.frog.poses.idle.src}`);
  const water = manifest.critters.frog.anchor.water;
  assert.deepEqual(groove.spriteAnchor("frog", "idle", "water", 256), [water[0] / 2, water[1] / 2]);
  assert.equal(groove.spriteAnchor("frog", "idle", "nope"), null);
  const scene = groove.sceneOf("open");
  assert.ok(scene.layers.every(layer => layer.src.startsWith("/float/groove/scenes/")));
  assert.equal(groove.sceneOf("nowhere"), null);
  assert.equal(groove.propOf("cup").src, `/float/groove/${manifest.props.cup.src}`);
  const host = groove.hostSprites();
  for (const pose of ["idle", "call", "cheer"]) assert.match(host.poses[pose], /^\/float\/groove\/host\//);
  assert.equal(groove.grooveUrl("/fonts/x.woff2"), "/fonts/x.woff2");
  assert.equal(groove.grooveUrl("https://cdn.example/x.webp"), "https://cdn.example/x.webp");
});

test("colours: #rgb and #rrggbb pass (lowercased), anything else is the fallback grey", () => {
  assert.equal(groove.normalColor("#E53935"), "#e53935");
  assert.equal(groove.normalColor("#f80"), "#ff8800");
  for (const bad of [null, "", "red", "#12345", "url(x)"]) assert.equal(groove.normalColor(bad), groove.FALLBACK_COLOR);
});

test("no canvas in node: riderSprites hands back every pose's bare file, riderPortrait is null", async () => {
  groove.provideGrooveArt(manifest);
  const urls = await groove.riderSprites({ critter:"otter", color:"#123456" });
  assert.deepEqual(Object.keys(urls), POSES);
  for (const pose of POSES) assert.equal(urls[pose], `/float/groove/${manifest.critters.otter.poses[pose].src}`);
  assert.equal(await groove.riderPortrait({ color:"#123456", look:{ critter:"otter" } }), null);
});

/* bundled the way Field Day's gate and the screen bundle it */
async function bundle(entry, { name, global = {} } = {}) {
  const out = await build({ entryPoints:[join(ROOT, entry)], bundle:true, platform:"node", format:"cjs",
    external:["react", "react-dom", "three"], loader:{ ".css":"empty" }, write:false, logLevel:"silent", metafile:true });
  const mod = new Module(fileURLToPath(new URL(`${name}.cjs`, import.meta.url)));
  mod.filename = mod.id;
  mod.paths = Module._nodeModulePaths(ROOT);
  Object.assign(globalThis, global);
  mod._compile(out.outputFiles[0].text, mod.filename);
  return { exports:mod.exports, inputs:Object.keys(out.metafile.inputs), text:out.outputFiles[0].text };
}

test("index.js: the Groove module, no three.js, and riderPortrait for Field Day's gate", async () => {
  const { exports, inputs, text } = await bundle("float/client/art/index.js", { name:"float-art-groove-index" });
  for (const name of ["loadGrooveArt", "riderSprites", "riderPortrait", "sceneOf", "propOf", "hostSprites", "RiderSprite", "Popup"]) assert.equal(typeof exports[name], "function", name);
  assert.ok(!/require\(["']three["']\)/.test(text), "no three.js");
  assert.ok(!inputs.some(path => /float\/client\/art\/(?!groove\/|index\.js)/.test(path)), `only the Groove files: ${inputs.filter(p => p.includes("art/")).join(", ")}`);
});

test("the popup letters chart.js's judgement: the number over the word, Perfect on its plate, a miss without a number", async () => {
  const { exports } = await bundle("float/client/art/groove/Popup.jsx", { name:"float-art-groove-popup" });
  const React = (await import("react")).default;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const html = (q, d) => renderToStaticMarkup(React.createElement(exports.default, { q, d, size:40 }));
  const late = html("late", 30);
  assert.match(late, /class="fg-popup-num">\+0\.03</);
  assert.match(late, /class="fg-popup-word">Late</);
  assert.match(late, /fg-tone-salmon/);
  assert.match(late, /--fg-size:40px/);
  const nice = html("nice", -10);
  assert.match(nice, />-0\.01</); assert.match(nice, />Nice!</); assert.match(nice, /fg-tone-yellow/);
  const perfect = html("perfect", 0);
  assert.match(perfect, /fg-popup--plate/); assert.match(perfect, />Perfect</); assert.match(perfect, />0\.00</);
  const miss = html("miss");
  assert.ok(!miss.includes("fg-popup-num"), "a miss has no number");
  assert.match(miss, />Miss</); assert.match(miss, /fg-tone-grey/);
  for (const [q, d] of [["late", 30], ["early", -170], ["ok", 120]]) assert.ok(html(q, d).includes(`>${popupOf(q, d).word}<`));
});

test("RiderSprite renders without the manifest (a placeholder box) and with it (the CSS composite at the asked size)", async () => {
  const React = (await import("react")).default;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { exports:art } = await bundle("float/client/art/index.js", { name:"float-art-groove-sprite" });
  const draw = props => renderToStaticMarkup(React.createElement(art.RiderSprite, { critter:"frog", color:"#E53935", size:128, ...props }));
  art.provideGrooveArt(null);
  const empty = draw();
  assert.match(empty, /fg-rider--wait/);
  assert.match(empty, /width:128px/);
  art.provideGrooveArt(manifest);
  const css = draw({ pose:"cheer" });
  assert.match(css, /fg-rider--css/);
  assert.ok(css.includes(`src="/float/groove/${manifest.critters.frog.poses.cheer.src}"`), "the pose's sprite");
  assert.match(css, /background-color:#e53935/);
  assert.ok(css.includes(`url(&quot;/float/groove/${manifest.critters.frog.poses.cheer.tube}&quot;)`), "the tube mask");
  assert.ok(!css.includes("fg-rider-crown"), "no crown");
  assert.match(draw({ groom:true }), /fg-rider-crown/);
  /* an unknown critter draws the capybara */
  assert.ok(draw({ critter:"dragon" }).includes(manifest.critters.capybara.poses.idle.src));
});
