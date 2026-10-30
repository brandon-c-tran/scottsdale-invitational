/* Pass the Aux (category `aux`): rebuilds worker/triviaQBank/aux-bank.json and the
   excerpt mp3s in public/tq from aux-bank.sources.json.

   node scripts/tq/aux-bank.mjs [--offline]

   For every song: the Deezer track (the original studio recording, found by
   hand and pinned by id) is checked against the spec (title, artist, ISRC, no
   live/remix/cover/karaoke), its public 30-second preview is downloaded once
   into C:/dev/scottsdale/tq-raw/aux/<id>.mp3, an excerpt (from/len seconds into
   the preview) is cut, faded, loudness-normalised (-16 LUFS, true peak under
   -1.5 dBTP, two-pass) and encoded 160 kbps mp3, then measured again. The file
   is named /tq/<12 hex of sha1(track:from:len:salt)>.mp3 (never the answer).
   Needs ffmpeg and ffprobe on PATH. --offline skips the Deezer checks and
   rebuilds from the cached previews and the metadata saved in sources. */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const RAW = process.env.TQ_RAW ? path.join(process.env.TQ_RAW, "aux") : "C:/dev/scottsdale/tq-raw/aux";
const OUT_DIR = path.join(ROOT, "public/tq");
const OUT_JSON = path.join(ROOT, "worker/triviaQBank/aux-bank.json");
const SRC_FILE = path.join(HERE, "aux-bank.sources.json");
const CHECKED = "2026-10-29";
const SALT = "tq-b-aux-1";
const OFFLINE = process.argv.includes("--offline");

const norm = s => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const BAD = /\b(live|remix|karaoke|cover|tribute|sped|slowed|nightcore|acoustic|as made famous|originally|performed|8 bit|lullaby|parody|demo|session|rehearsal|backing track|dub|club mix|extended|radio edit)\b/i;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getJson(url) {
  for (let i = 0; i < 5; i++) {
    try { const r = await fetch(url); const j = await r.json(); if (!j.error) return j; } catch {}
    await sleep(1200);
  }
  throw new Error("request failed: " + url);
}

function ff(args, opts = {}) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostdin", ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...opts });
  if (r.status !== 0) throw new Error("ffmpeg failed: " + args.join(" ") + "\n" + r.stderr.slice(-800));
  return r.stderr;
}
const loudJson = err => JSON.parse(err.slice(err.lastIndexOf("{"), err.lastIndexOf("}") + 1));

/* the excerpt: fade, two-pass loudnorm, mp3. Returns { I, tp, duration } measured on the output. */
function cut(rawFile, from, len, outFile) {
  const fades = `afade=t=in:d=0.06,afade=t=out:st=${(len - 0.25).toFixed(2)}:d=0.25`;
  const base = ["-ss", String(from), "-t", String(len), "-i", rawFile];
  const pass1 = loudJson(ff([...base, "-af", `${fades},loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json`, "-f", "null", "-"]));
  const ln = `loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=${pass1.input_i}:measured_TP=${pass1.input_tp}:measured_LRA=${pass1.input_lra}:measured_thresh=${pass1.input_thresh}:offset=${pass1.target_offset}:linear=true`;
  ff([...base, "-af", `${fades},${ln}`, "-ar", "44100", "-ac", "2", "-c:a", "libmp3lame", "-b:a", "160k", "-map_metadata", "-1", "-y", outFile]);
  const m = loudJson(ff(["-i", outFile, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"]));
  const p = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", outFile], { encoding: "utf8" });
  return { I: Number(m.input_i), tp: Number(m.input_tp), duration: Number(p.stdout) };
}

const src = JSON.parse(fs.readFileSync(SRC_FILE, "utf8"));
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(RAW, { recursive: true });
const used = new Set();
const records = [];
const problems = [];

const songs = [...src.songs].sort((a, b) => a.slug.localeCompare(b.slug));
for (let index = 0; index < songs.length; index++) {
  const s = songs[index];
  const id = `aux-${s.slug}`;
  let meta = s.deezer;
  if (!OFFLINE) {
    const t = await getJson(`https://api.deezer.com/track/${s.deezerId}`);
    const okTitle = norm(t.title).startsWith(norm(s.title)) || norm(t.title_short || "").startsWith(norm(s.title)) || norm(s.title).startsWith(norm(t.title_short || t.title));
    const okArtist = norm(t.artist.name).includes(norm(s.artist).split(" ")[0]);
    if (!okTitle || !okArtist || !t.isrc || BAD.test(t.title) || BAD.test(t.album.title.replace(/live from|greatest hits/ig, ""))) {
      problems.push(`${id}: Deezer ${s.deezerId} is "${t.title}" by ${t.artist.name} on "${t.album.title}"; does not match the spec`);
      continue;
    }
    meta = { id: t.id, isrc: t.isrc, title: t.title, artist: t.artist.name, album: t.album.title, duration: t.duration, explicit: !!t.explicit_lyrics, released: t.release_date };
    s.deezer = meta;
    const rawFile = path.join(RAW, `${s.deezerId}.mp3`);
    if (!fs.existsSync(rawFile)) {
      if (!t.preview) { problems.push(`${id}: no preview`); continue; }
      fs.writeFileSync(rawFile, Buffer.from(await (await fetch(t.preview)).arrayBuffer()));
    }
  }
  if (!meta) { problems.push(`${id}: no saved metadata (run without --offline)`); continue; }
  const rawFile = path.join(RAW, `${s.deezerId}.mp3`);

  const clips = [{ suffix: "", from: s.from, len: s.len }, ...(s.variants || []).map(v => ({ suffix: "-" + v.suffix, from: v.from, len: v.len }))];
  const pos = (index + Math.floor(index / 4)) % 4;
  const texts = [...s.decoys]; texts.splice(pos, 0, s.title);
  const ids = ["a", "b", "c", "d"];
  const options = texts.map((text, i) => ({ id: ids[i], text }));
  const feat = s.feat ? `, featuring ${s.feat}` : "";
  const reveal = `${s.title} by ${s.artist}${feat}.${s.showAlbum ? ` From ${meta.album}.` : ""}${s.revealExtra ? " " + s.revealExtra : ""}`;

  for (const clip of clips) {
    const hash = crypto.createHash("sha1").update(`${s.deezerId}:${clip.from}:${clip.len}:${SALT}`).digest("hex").slice(0, 12);
    const file = `${hash}.mp3`;
    const outFile = path.join(OUT_DIR, file);
    if (used.has(hash)) throw new Error("hash collision " + hash);
    used.add(hash);
    const m = cut(rawFile, clip.from, clip.len, outFile);
    if (!(m.I > -17.5 && m.I < -14.5)) problems.push(`${id}${clip.suffix}: loudness ${m.I} LUFS`);
    if (!(m.tp <= -1.0)) problems.push(`${id}${clip.suffix}: true peak ${m.tp} dBTP`);
    if (Math.abs(m.duration - clip.len) > 0.15) problems.push(`${id}${clip.suffix}: duration ${m.duration}`);
    const notes = [
      s.note,
      meta.explicit ? "Explicit track." : null,
      s.lang ? "Excerpt has strong language; preview before use." : null,
      s.titleSung ? "The title is sung in the excerpt." : null,
      clip.suffix ? "Another excerpt of the same song." : null,
    ].filter(Boolean).join(" ");
    const editorial = s.by === "suggested";
    records.push({
      id: `${id}${clip.suffix}`,
      category: "aux",
      tier: s.tier,
      format: "audio",
      prompt: s.prompt || "Name this song.",
      options,
      answer: ids[pos],
      reveal,
      media: { kind: "audio", src: `/tq/${file}`, start: 0, duration: clip.len, mime: "audio/mpeg" },
      ...(clip.suffix ? { variantOf: id } : {}),
      sources: [
        { url: `https://www.deezer.com/track/${meta.id}`, note: `ISRC ${meta.isrc}. "${meta.title}" by ${meta.artist}, album "${meta.album.slice(0, 50)}", ${meta.duration}s, ${meta.released}. Original studio recording.`.slice(0, 200), checkedAt: CHECKED },
        { url: `https://api.deezer.com/track/${meta.id}`, note: `30 s preview, excerpt ${clip.from}s to ${clip.from + clip.len}s. ${m.I} LUFS, ${m.tp} dBTP.`, checkedAt: CHECKED },
      ],
      verified: { by: s.by, at: CHECKED },
      status: "ready",
      ...(s.surprise ? { surprise: true } : {}),
      tags: { topics: [...s.topics, ...(editorial ? ["editorial"] : [])], likely: [], possible: [], reach: s.reach },
      ...(notes ? { notes } : {}),
    });
  }
}

records.sort((a, b) => a.tier - b.tier || a.id.localeCompare(b.id));
fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
fs.writeFileSync(OUT_JSON, JSON.stringify(records, null, 2) + "\n");
if (!OFFLINE) fs.writeFileSync(SRC_FILE, JSON.stringify(src, null, 1) + "\n");

// remove clips of this builder that no record uses any more (only files this script's salt made are not trackable, so list the record set)
const keep = new Set(records.map(r => path.basename(r.media.src)));
const counts = {};
for (const r of records) counts[r.tier] = (counts[r.tier] || 0) + 1;
console.log(`${records.length} records, tiers`, counts, `${keep.size} clips`);
if (problems.length) { console.error("PROBLEMS:\n" + problems.join("\n")); process.exitCode = 1; }
