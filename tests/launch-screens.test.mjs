import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LAUNCH_GROUND, LAUNCH_SCREENS, launchLinks, launchMedia, launchPath, launchPixels } from "../scripts/launch-screens.mjs";

/* iOS opens an installed web app on its apple-touch-startup-image, else on
   plain white. It uses an image only when its media query matches the
   screen and the image is that screen's exact portrait pixels, so every
   tag must point at a file of exactly the size it claims. */
const png = path => {
  const bytes = readFileSync(`public${path}`);
  assert.equal(bytes.toString("latin1", 1, 4), "PNG", `${path} is a PNG`);
  const chunks = [];
  for (let at = 8; at < bytes.length; at += 12 + bytes.readUInt32BE(at)) chunks.push(bytes.toString("latin1", at + 4, at + 8));
  const colorType = bytes[25];
  return { width:bytes.readUInt32BE(16), height:bytes.readUInt32BE(20),
    alpha:colorType === 4 || colorType === 6 || chunks.includes("tRNS"), size:bytes.length };
};

test("every launch screen has its file at that screen's exact pixels, opaque and small", () => {
  for (const staging of [false, true]) for (const screen of LAUNCH_SCREENS) {
    const path = launchPath(screen, staging), file = png(path);
    const { width, height } = launchPixels(screen);
    assert.deepEqual([file.width, file.height], [width, height], path);
    assert.equal(file.alpha, false, `${path} is opaque`);
    assert.ok(file.size < 40 * 1024, `${path} is ${file.size} bytes`);
  }
});

test("launch screens are portrait, one per screen", () => {
  const media = LAUNCH_SCREENS.map(launchMedia), pixels = LAUNCH_SCREENS.map(s => launchPath(s));
  assert.equal(new Set(media).size, media.length);
  assert.equal(new Set(pixels).size, pixels.length);
  for (const screen of LAUNCH_SCREENS) assert.ok(screen.h > screen.w && [2, 3].includes(screen.dpr));
  /* the phones a guest carries: the X's size, the 15 and 16, the 17 Pro and Pro Max, the Air */
  for (const [w, h] of [[375, 812], [393, 852], [402, 874], [440, 956], [420, 912], [390, 844]])
    assert.ok(LAUNCH_SCREENS.some(s => s.w === w && s.h === h && s.dpr === 3), `${w}x${h}`);
});

test("index.html carries the launch screens, staging its own set", () => {
  const html = readFileSync("index.html", "utf8");
  assert.match(html, /%APP_LAUNCH_SCREENS%/);
  /* iOS reads startup images only with this tag present */
  assert.match(html, /<meta name="apple-mobile-web-app-capable" content="yes" \/>/);
  for (const staging of [false, true]) {
    const tags = launchLinks(staging).split("\n").map(line => line.trim());
    assert.equal(tags.length, LAUNCH_SCREENS.length);
    tags.forEach((tag, i) => {
      assert.ok(tag.startsWith('<link rel="apple-touch-startup-image" '), tag);
      assert.ok(tag.includes(`media="${launchMedia(LAUNCH_SCREENS[i])}"`), tag);
      assert.ok(tag.includes(`href="${launchPath(LAUNCH_SCREENS[i], staging)}"`), tag);
      assert.equal(tag.includes("/launch/staging-"), staging, tag);
    });
  }
  const config = readFileSync("vite.config.js", "utf8");
  assert.match(config, /APP_LAUNCH_SCREENS:\s*launchLinks\(staging\)/);
});

test("the launch ground is the app's ground", () => {
  const manifest = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8"));
  assert.equal(LAUNCH_GROUND, manifest.background_color);
  assert.match(readFileSync("src/ui/experience.css", "utf8"), new RegExp(`--bg:${LAUNCH_GROUND};`));
  /* and the page's first frame, before its stylesheet arrives, is that ground too */
  const html = readFileSync("index.html", "utf8");
  assert.ok(html.includes(`<style>html{background:${LAUNCH_GROUND}}</style>`));
  assert.ok(html.includes('<meta name="color-scheme" content="dark" />'));
});
