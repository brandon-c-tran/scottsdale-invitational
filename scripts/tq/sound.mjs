/* You Know This Sound (category `sound`): rebuilds worker/triviaQBank/sound.json
   and the clip mp3s in public/tq from sound.sources.json.

   node scripts/tq/sound.mjs [--offline]

   Every sound comes from a public source: a game wiki's own file page
   (Minecraft Wiki, League of Legends Wiki, MapleStory Wiki, Wikipedia) or an
   Internet Archive item. Each is downloaded once into
   C:/dev/scottsdale/tq-raw/sound/<slug>.<ext> (its sha1 and size are saved
   back into sound.sources.json), silence is trimmed from both ends (and the
   clip capped at `max` seconds), faded, loudness-normalised (about -16 LUFS,
   true peak under -1 dBTP), encoded 160 kbps mp3 and measured again. The
   file is named /tq/<12 hex of sha1(source url + salt)>.mp3.
   Needs ffmpeg and ffprobe on PATH. --offline skips downloads and metadata
   lookups (the raw files must already be in tq-raw). */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const RAW = process.env.TQ_RAW ? path.join(process.env.TQ_RAW, "sound") : "C:/dev/scottsdale/tq-raw/sound";
const OUT_DIR = path.join(ROOT, "public/tq");
const OUT_JSON = path.join(ROOT, "worker/triviaQBank/sound.json");
const SRC_FILE = path.join(HERE, "sound.sources.json");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "tq-sound-"));
const CHECKED = "2026-10-29";
const SALT = "tq-b-sound-1";
const UA = "FieldDayTriviaBuilder/1.0 (private party game; contact brandontran3900@gmail.com)";
const OFFLINE = process.argv.includes("--offline");
const sleep = ms => new Promise(r => setTimeout(r, ms));

const GUESTS = {
  minecraft: ["Chinh", "Khoa"],
  league: ["Chinh", "Khoa", "Chiang", "Henry", "Ben", "Richard", "Allan", "Jeremy"],
  maplestory: ["Richard", "Allan", "Jeremy"],
  gta: ["Eyob", "Henry", "Ben"],
};

async function fetchRetry(url, init = {}) {
  for (let i = 0; i < 5; i++) {
    try {
      const r = await fetch(url, { ...init, headers: { "User-Agent": UA, ...(init.headers || {}) } });
      if (r.ok) return r;
      if (r.status === 429 || r.status >= 500) { await sleep(2500 * (i + 1)); continue; }
      throw new Error(`${r.status} ${url}`);
    } catch (e) { if (i === 4) throw e; await sleep(1500); }
  }
}

async function resolveSource(s) {
  const src = s.source;
  if (src.type === "archive") {
    return { url: `https://archive.org/download/${src.item}/${encodeURIComponent(src.file)}`, page: `https://archive.org/details/${src.item}` };
  }
  const u = `${src.api}?action=query&titles=${encodeURIComponent("File:" + src.file)}&prop=imageinfo&iiprop=url|timestamp&format=json`;
  const j = await (await fetchRetry(u)).json();
  const page = Object.values(j.query.pages)[0];
  const info = page?.imageinfo?.[0];
  if (!info) throw new Error("no file page for " + src.file);
  return { url: info.url, page: info.descriptionurl, uploaded: info.timestamp };
}

function ff(args) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostdin", "-y", ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error("ffmpeg failed: " + args.join(" ") + "\n" + r.stderr.slice(-600));
  return r.stderr;
}
const loudJson = err => JSON.parse(err.slice(err.lastIndexOf("{"), err.lastIndexOf("}") + 1));
const probeDuration = f => Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { encoding: "utf8" }).stdout);
const LN = "loudnorm=I=-16:TP=-1.5:LRA=11";

/* a clip shorter than 3 s is measured padded with silence (silence is gated out) */
function measure(file, dur) {
  const pad = dur < 3 ? "apad=whole_dur=3.5," : "";
  return loudJson(ff(["-i", file, "-af", `${pad}${LN}:print_format=json`, "-f", "null", "-"]));
}

function process_(raw, s, outFile) {
  const t1 = path.join(TMP, `${s.slug}-1.wav`), t2 = path.join(TMP, `${s.slug}-2.wav`);
  const trim = "silenceremove=start_periods=1:start_duration=0.01:start_threshold=-55dB";
  const pre = [s.ss ? ["-ss", String(s.ss)] : [], s.t ? ["-t", String(s.t)] : []].flat();
  ff([...pre, "-i", raw, "-vn", "-ar", "44100", "-ac", "2", "-af", `${trim},areverse,${trim},areverse,atrim=0:${s.max || 10}`, t1]);
  const d1 = probeDuration(t1);
  const fo = Math.min(0.15, d1 / 3);
  ff(["-i", t1, "-af", `afade=t=in:d=0.01,afade=t=out:st=${(d1 - fo).toFixed(3)}:d=${fo.toFixed(3)}`, t2]);
  let m = measure(t2, d1), mode = "loudnorm";
  const finite = Number.isFinite(Number(m.input_i)) && Number(m.input_i) > -60;
  if (finite) {
    const ln = `${LN}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
    ff(["-i", t2, "-af", ln, "-ar", "44100", "-ac", "2", "-c:a", "libmp3lame", "-b:a", "160k", "-map_metadata", "-1", outFile]);
  }
  let after = finite ? measure(outFile, d1) : null;
  const bad = a => !a || Number(a.input_tp) > -1.0 || Math.abs(Number(a.input_i) + 16) > 2.5;
  if (bad(after) && finite) {
    /* peaky material (hisses, clicks): gain to -16 LUFS, then a limiter keeps the peaks under -1.5 dBFS */
    const gain = -16 - Number(m.input_i);
    ff(["-i", t2, "-af", `volume=${gain.toFixed(2)}dB,alimiter=limit=0.84:attack=2:release=40:level=disabled`, "-ar", "44100", "-ac", "2", "-c:a", "libmp3lame", "-b:a", "160k", "-map_metadata", "-1", outFile]);
    after = measure(outFile, d1); mode = "limited";
  }
  if (bad(after)) {
    /* last resort: peak-normalise to -3 dBFS */
    const vd = ff(["-i", t2, "-af", "volumedetect", "-f", "null", "-"]);
    const max = Number(/max_volume: (-?[\d.]+) dB/.exec(vd)[1]);
    ff(["-i", t2, "-af", `volume=${(-3 - max).toFixed(2)}dB`, "-ar", "44100", "-ac", "2", "-c:a", "libmp3lame", "-b:a", "160k", "-map_metadata", "-1", outFile]);
    after = measure(outFile, d1); mode = "peak -3 dBFS";
  }
  return { I: Number(after.input_i), tp: Number(after.input_tp), duration: probeDuration(outFile), mode, source: d1 };
}

const src = JSON.parse(fs.readFileSync(SRC_FILE, "utf8"));
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(RAW, { recursive: true });
const records = [], problems = [], used = new Set();

const sounds = [...src.sounds].sort((a, b) => a.slug.localeCompare(b.slug));
for (let index = 0; index < sounds.length; index++) {
  const s = sounds[index];
  const id = `sound-${s.slug}`;
  try {
    const ext = path.extname(s.source.file).toLowerCase() || ".bin";
    const rawFile = path.join(RAW, `${s.slug}${ext}`);
    let info = s.fetched;
    if (!OFFLINE) {
      const where = await resolveSource(s);
      if (!fs.existsSync(rawFile)) {
        const r = await fetchRetry(where.url);
        fs.writeFileSync(rawFile, Buffer.from(await r.arrayBuffer()));
        await sleep(400);
      }
      const buf = fs.readFileSync(rawFile);
      info = s.fetched = { url: where.url, page: where.page, sha1: crypto.createHash("sha1").update(buf).digest("hex"), bytes: buf.length, ...(where.uploaded ? { uploaded: where.uploaded } : {}) };
    }
    if (!info || !fs.existsSync(rawFile)) throw new Error("raw file missing");

    const hash = crypto.createHash("sha1").update(`${info.url}:${s.max || 10}:${s.ss || 0}:${SALT}`).digest("hex").slice(0, 12);
    if (used.has(hash)) throw new Error("hash collision");
    used.add(hash);
    const outFile = path.join(OUT_DIR, `${hash}.mp3`);
    const m = process_(rawFile, s, outFile);
    if (m.I < -45) problems.push(`${id}: silent (${m.I} LUFS)`);
    if (!(m.tp <= -1.0)) problems.push(`${id}: true peak ${m.tp}`);
    if (m.duration < 0.15 || m.duration > 30) problems.push(`${id}: duration ${m.duration}`);

    const pos = (index + Math.floor(index / 4)) % 4;
    const texts = [...s.decoys]; texts.splice(pos, 0, s.answer);
    const ids = ["a", "b", "c", "d"];
    const status = s.status || "ready";
    const likely = [...new Set(s.topics.flatMap(t => GUESTS[t] || []))];
    const notes = [s.note, m.mode === "peak -3 dBFS" ? `Short sound, peak-normalised (${m.I} LUFS).` : null].filter(Boolean).join(" ");
    const base = s.variantOf ? records.find(r => r.id === `sound-${s.variantOf}`) : null;
    if (base) { texts.length = 0; base.options.forEach(o => texts.push(o.text)); }
    records.push({
      id,
      category: "sound",
      tier: s.tier,
      format: "audio",
      prompt: s.prompt,
      options: texts.map((text, i) => ({ id: ids[i], text })),
      answer: base ? base.answer : ids[pos],
      ...(base ? { variantOf: base.id } : {}),
      reveal: s.reveal,
      media: { kind: "audio", src: `/tq/${hash}.mp3`, start: 0, duration: Number(m.duration.toFixed(2)), mime: "audio/mpeg" },
      sources: [
        { url: info.page, note: `${s.source.label}. File "${s.source.file}"${info.uploaded ? `, uploaded ${info.uploaded.slice(0, 10)}` : ""}.`.slice(0, 200), checkedAt: CHECKED },
        { url: info.url.slice(0, 500), note: `Downloaded ${CHECKED}, sha1 ${info.sha1.slice(0, 12)}, ${info.bytes} bytes. Trimmed to ${m.source.toFixed(2)} s; ${m.I} LUFS, ${m.tp} dBTP.`.slice(0, 200), checkedAt: CHECKED },
      ],
      verified: { by: "web", at: CHECKED },
      status,
      tags: { topics: s.topics, likely, possible: [], reach: s.reach },
      ...(notes ? { notes } : {}),
    });
  } catch (e) {
    problems.push(`${id}: ${e.message.split("\n")[0]}`);
  }
}

records.sort((a, b) => a.tier - b.tier || a.id.localeCompare(b.id));
fs.writeFileSync(OUT_JSON, JSON.stringify(records, null, 2) + "\n");
if (!OFFLINE) fs.writeFileSync(SRC_FILE, JSON.stringify(src, null, 1) + "\n");
fs.rmSync(TMP, { recursive: true, force: true });
const counts = {};
for (const r of records) counts[r.tier] = (counts[r.tier] || 0) + 1;
console.log(`${records.length} records, tiers`, counts);
if (problems.length) { console.error("PROBLEMS:\n" + problems.join("\n")); process.exitCode = 1; }
