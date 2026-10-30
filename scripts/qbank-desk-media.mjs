/* The Question bank desk's fixture media (dev/fit/qbankDeskFixtures.js): made-up
   pictures (a face, a team's colors, a silhouette and its original, a
   screenshot crop and the whole page), tones and a test card, written to
   public/tq/ under the bank's neutral names (/tq/<12 hex>.<ext>) so the
   fixture records meet the bank's rules, and listed in
   dev/fit/qbankMedia.json. Not content: nothing here is a real question.
   Rebuild: node scripts/qbank-desk-media.mjs (needs ffmpeg and Chrome). */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchChrome } from "./headless-chrome.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const OUT = path.join(ROOT, "public", "tq");
mkdirSync(OUT, { recursive:true });
const name = (key, ext) => `/tq/${createHash("sha1").update(`field-day-desk-fixture:${key}`).digest("hex").slice(0, 12)}.${ext}`;
const file = src => path.join(ROOT, "public", src);
const ff = args => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);

const HUES = ["#3d5a80", "#7a4b8c", "#2f6f62", "#8c5a2b", "#5b6b2f", "#803d4a", "#2b5f8c"];
const svg = body => `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 320 240">${body}</svg>`;
const headshot = n => svg(`<rect width="320" height="240" fill="${HUES[n % 7]}"/><circle cx="160" cy="98" r="52" fill="#e8c9a8"/>`
  + `<path d="M60 240c10-60 50-84 100-84s90 24 100 84z" fill="#d9d2c3"/>`);
const teamReveal = n => svg(`<rect width="320" height="240" fill="${HUES[(n + 3) % 7]}"/><rect y="170" width="320" height="70" fill="#f0b429"/>`
  + `<circle cx="160" cy="98" r="52" fill="#e8c9a8"/><rect x="110" y="190" width="100" height="30" fill="#1b1b1b"/>`);
const SHAPES = [
  "M160 30l30 60 66 10-48 46 12 66-60-32-60 32 12-66-48-46 66-10z",
  "M90 200c0-80 30-150 70-150s70 70 70 150zM120 60l-30-40 50 20zM200 60l30-40-50 20z",
  "M60 190h200l-20-60h-40l-20-70h-40l-20 70h-40z",
  "M160 20c60 0 90 50 90 100s-40 100-90 100-90-50-90-100 30-100 90-100zM130 100a10 10 0 1 0 1 0z",
];
const silhouette = n => svg(`<rect width="320" height="240" fill="#f4f1ea"/><path d="${SHAPES[n % 4]}" fill="#111" transform="rotate(${n * 7 - 20} 160 120)"/>`);
const original = n => svg(`<rect width="320" height="240" fill="#f4f1ea"/><path d="${SHAPES[n % 4]}" fill="${HUES[n % 7]}" stroke="#111" stroke-width="4" transform="rotate(${n * 7 - 20} 160 120)"/>`);
const screenshot = n => svg(`<rect width="320" height="240" fill="#c9d3dd"/><rect width="320" height="26" fill="${HUES[n % 7]}"/>`
  + `<circle cx="14" cy="13" r="5" fill="#fff9"/><rect x="16" y="40" width="180" height="120" fill="#fff"/><rect x="206" y="40" width="98" height="56" fill="#ffd166"/>`
  + `<rect x="206" y="104" width="98" height="56" fill="#06d6a0"/><rect x="16" y="172" width="288" height="52" fill="${HUES[(n + 2) % 7]}"/>`);
const fullShot = n => svg(`<rect width="320" height="240" fill="#e6ebf0"/><rect width="320" height="34" fill="${HUES[n % 7]}"/>`
  + `<rect x="12" y="10" width="120" height="14" fill="#fff"/><rect x="16" y="48" width="288" height="176" fill="#fff"/><rect x="30" y="64" width="160" height="90" fill="${HUES[(n + 4) % 7]}"/>`);

const IMAGES = {
  ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].flatMap(n => [[`nba-${n}`, headshot(n)], [`nba-${n}-team`, teamReveal(n)]])),
  ...Object.fromEntries([1, 2, 3, 4, 5, 6].flatMap(n => [[`sil-${n}`, silhouette(n)], [`sil-${n}-original`, original(n)]])),
  ...Object.fromEntries([1, 4, 5].flatMap(n => [[`web-${n}`, screenshot(n)], [`web-${n}-full`, fullShot(n)]])),
};
const TONES = Object.fromEntries(Array.from({ length:12 }, (_, i) => [`tone-${i + 1}`, 180 + 60 * (i + 1)]));
const CLIPS = { "clip-1":330, "clip-2":660 };

const manifest = {};
const tmp = path.join(os.tmpdir(), `fd-qbank-media-${process.pid}`);
mkdirSync(tmp, { recursive:true });
const browser = await launchChrome({ width:640, height:480 });
try {
  for (const [key, body] of Object.entries(IMAGES)) {
    const src = name(key, "webp");
    manifest[key] = { kind:"image", src, w:640, h:480, mime:"image/webp" };
    if (existsSync(file(src))) continue;
    await browser.load(`data:text/html,${encodeURIComponent(`<html><body style="margin:0">${body}</body></html>`)}`);
    const png = await browser.screenshot(path.join(tmp, `${key}.png`));
    ff(["-i", png, "-quality", "70", file(src)]);
  }
} finally { await browser.close(); rmSync(tmp, { recursive:true, force:true }); }
for (const [key, hz] of Object.entries(TONES)) {
  const src = name(key, "mp3");
  manifest[key] = { kind:"audio", src, mime:"audio/mpeg" };
  if (!existsSync(file(src))) ff(["-f", "lavfi", "-i", `sine=frequency=${hz}:duration=20`, "-af", "volume=0.3", "-ac", "1", "-ar", "8000", "-b:a", "8k", file(src)]);
}
for (const [key, hz] of Object.entries(CLIPS)) {
  const src = name(key, "mp4");
  manifest[key] = { kind:"video", src, w:160, h:90, mime:"video/mp4" };
  if (!existsSync(file(src))) ff(["-f", "lavfi", "-i", "testsrc2=size=160x90:rate=8:duration=12", "-f", "lavfi", "-i", `sine=frequency=${hz}:duration=12`,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "45", "-preset", "veryslow", "-c:a", "aac", "-b:a", "16k", "-ac", "1", "-ar", "16000",
    "-shortest", "-movflags", "+faststart", file(src)]);
}
writeFileSync(path.join(ROOT, "dev/fit/qbankMedia.json"), `${JSON.stringify(manifest, null, 1)}\n`);
console.log(`${Object.keys(manifest).length} files in public/tq, listed in dev/fit/qbankMedia.json`);
