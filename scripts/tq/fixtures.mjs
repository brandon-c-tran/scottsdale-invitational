/* The question bank's TEST fixtures (not content): a full 7 x 5 board of
   stand-in records, one clue of every kind (text, image with a reveal,
   audio, video, a silhouette with its original, a screenshot crop with the
   full screenshot), the rest plain text, and tiny generated media (solid
   colors, a one-second tone). worker/triviaQBank/_fixtures.json is read by
   the tests and the dev previews only (worker/triviaQBank/index.js never
   loads it). Rebuild: node scripts/tq/fixtures.mjs (needs ffmpeg). */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const OUT = path.join(ROOT, "public", "tq");
mkdirSync(OUT, { recursive:true });
const name = (key, ext) => `/tq/${createHash("sha1").update(`field-day-fixture:${key}`).digest("hex").slice(0, 12)}.${ext}`;
const ff = (args, src) => {
  const file = path.join(ROOT, "public", src);
  if (!existsSync(file)) execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args, file]);
  return src;
};
const still = (key, color, w, h) => ff(["-f", "lavfi", "-i", `color=c=${color}:s=${w}x${h}`, "-frames:v", "1"], name(key, "webp"));
const tone = (key, hz) => ff(["-f", "lavfi", "-i", `sine=frequency=${hz}:duration=1`, "-ar", "44100", "-b:a", "128k"], name(key, "mp3"));
const clip = (key, color, hz) => ff(["-f", "lavfi", "-i", `color=c=${color}:s=640x360:d=2`, "-f", "lavfi", "-i",
  `sine=frequency=${hz}:duration=2`, "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart"],
  name(key, "mp4"));

const CHECKED = "2026-10-29";
const base = (id, category, tier, extra) => ({
  id, category, tier, format:"choice", prompt:`Fixture ${category} ${tier * 100}: which letter?`,
  options:[{ id:"a", text:`Alpha ${id}` }, { id:"b", text:`Bravo ${id}` }, { id:"c", text:`Charlie ${id}` }, { id:"d", text:`Delta ${id}` }],
  answer:["a", "b", "c", "d"][(tier + category.length) % 4],
  reveal:`Fixture reveal for ${id}.`,
  sources:[{ url:"https://example.com/fixture", note:"test fixture", checkedAt:CHECKED }],
  verified:{ by:"web", at:CHECKED },
  status:"ready",
  tags:{ topics:["fixture"], likely:[], possible:[], reach:"broad" },
  notes:"TEST FIXTURE, not content",
  ...extra,
});

const special = {
  "nba:1":{ format:"image", prompt:"Who does he play for?", subject:"Fixture Player",
    media:{ kind:"image", src:still("headshot", "0x6a5a4a", 400, 500), w:400, h:500, mime:"image/webp" },
    revealMedia:{ kind:"image", src:still("headshot-reveal", "0x1d428a", 400, 500), w:400, h:500 } },
  "sound:1":{ format:"audio", prompt:"Which fixture made this sound?",
    media:{ kind:"audio", src:tone("tone", 440), start:0, duration:1, mime:"audio/mpeg" } },
  "aux:2":{ format:"audio", prompt:"Name the fixture song.",
    media:{ kind:"audio", src:tone("tone-high", 880), start:0.2, duration:0.6, mime:"audio/mpeg" } },
  "web:1":{ format:"video", prompt:"Which fixture video is this?",
    media:{ kind:"video", src:clip("video", "0x553377", 660), w:640, h:360, start:0, duration:2, mime:"video/mp4" } },
  "web:2":{ format:"image", prompt:"Which fixture site is this?",
    media:{ kind:"image", src:still("crop", "0x2f6f4f", 480, 270), w:480, h:270, mime:"image/webp" },
    revealMedia:{ kind:"image", src:still("crop-full", "0x2f6f4f", 1280, 720), w:1280, h:720 } },
  "sil:1":{ format:"image", prompt:"Who is this?",
    media:{ kind:"image", src:still("silhouette", "0x000000", 600, 600), w:600, h:600, mime:"image/webp" },
    revealMedia:{ kind:"image", src:still("silhouette-reveal", "0xf2c84b", 600, 600), w:600, h:600 } },
};

const CATEGORIES = ["nba", "kim", "lore", "aux", "web", "sound", "sil"];
const records = [];
const columns = [];
for (const category of CATEGORIES) {
  const slots = [];
  for (let tier = 1; tier <= 5; tier++) {
    const id = `fx-${category}-${tier}`;
    records.push(base(id, category, tier, special[`${category}:${tier}`] || {}));
    slots.push(id);
  }
  columns.push({ category, name:"", slots });
}
/* a sixth record a column can swap in, and one not ready */
records.push(base("fx-lore-6", "lore", 3, { prompt:"Fixture spare: which letter?" }));
records.push(base("fx-kim-6", "kim", 2, { status:"confirm", personal:"needs-brandon", verified:undefined, sources:[] }));

const json = JSON.stringify({ records:records.map(record => JSON.parse(JSON.stringify(record))), plan:{ columns } }, null, 1);
writeFileSync(path.join(ROOT, "worker", "triviaQBank", "_fixtures.json"), `${json}\n`);
console.log(`${records.length} fixture records, media in public/tq`);
