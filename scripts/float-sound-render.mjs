/* The Groove's songs rendered offline, for listening and for checking the
   timing: the real kit (src/lib/soundKit.js) and the real planner
   (float/client/sound/groove.js) on an OfflineAudioContext in headless
   Chrome, with the host's clips decoded the way the TV decodes them.

     node scripts/float-sound-render.mjs [paddle rock spin drop moments] [--stems] [--out <dir>]

   Each song: the round card, then all 32 bars as the TV lays them, to
   <out>/<song>.mp3 (default .impeccable/review/float-sound/); --stems adds
   the band, the calls and the answers alone. "moments" renders the lobby's
   loop, the Cup opening, the cut (drumroll, three out), the podium's
   fanfare, a run of flubs and the phone's taps. The onset check renders
   every call and answer alone with its cue laid GROOVE_PRE_MS early and
   reads its beat the way the engine reads a clip (soundKit clipMarks, the
   first rise past 30% of the peak): each must land within 5 ms of the
   beat. Exits 1 when one does not, or a render is silent or clips. */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { launchChrome } from "./headless-chrome.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const value = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const OUT = path.resolve(ROOT, value("--out") || ".impeccable/review/float-sound");
const STEMS = args.includes("--stems");
const asked = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--out");
const SONGS = ["paddle", "rock", "spin", "drop", "lastcall"];
const jobs = asked.length ? asked : [...SONGS, "moments"];

const ENTRY = `
import { makeEngine, playRecipe, clipMarks, GROOVE_PRE_S } from "./src/lib/soundKit.js";
import { songEvents, songSlots, eventAt, TITLE_BEATS, GROOVE_PRE_MS, PODIUM_BEATS, CUT_BEATS, LAST_CALL_BEATS } from "./float/client/sound/groove.js";
import { chartOf, SONG_MS } from "./float/shared/chart.js";
const SR = 44100;
async function engine(ctx, listen = "tv") {
  const E = makeEngine(ctx, { room:"san", listen, volume:listen === "tv" ? 0.7 : 0.6 });
  E.clips = new Map();
  if (window.__dry) E.wetOut.gain.value = 0;
  for (const clip of window.__clips || []) {
    const bytes = Uint8Array.from(atob(clip.base64), ch => ch.charCodeAt(0)).buffer;
    const buffer = await ctx.decodeAudioData(bytes);
    E.clips.set(clip.id, { buffer, ...clipMarks(buffer.getChannelData(0), buffer.sampleRate) });
  }
  return E;
}
const STEM = { band:id => id === "floatGroove", calls:id => id === "floatVoice" || id === "floatWhirl", answers:id => id === "floatAnswer" };
function wav(buffer) {
  const n = buffer.length, ch = buffer.numberOfChannels, out = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const str = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF"); out.setUint32(4, 36 + n * ch * 2, true); str(8, "WAVE"); str(12, "fmt "); out.setUint32(16, 16, true);
  out.setUint16(20, 1, true); out.setUint16(22, ch, true); out.setUint32(24, buffer.sampleRate, true); out.setUint32(28, buffer.sampleRate * ch * 2, true);
  out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true); str(36, "data"); out.setUint32(40, n * ch * 2, true);
  const data = [...Array(ch)].map((_, c) => buffer.getChannelData(c));
  let peak = 0, sum = 0;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) {
    const v = data[c][i]; peak = Math.max(peak, Math.abs(v)); sum += v * v;
    out.setInt16(44 + (i * ch + c) * 2, Math.max(-1, Math.min(1, v)) * 32767, true);
  }
  let bin = ""; const bytes = new Uint8Array(out.buffer);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return { base64:btoa(bin), peak, rms:Math.sqrt(sum / (n * ch)), ms:Math.round(n / buffer.sampleRate * 1000) };
}
/* Lay slots as the TV does, a lead before each: the render suspends there,
   the ended voices are let go (their onended runs on this thread, as live),
   and the slot's recipes go in. Laid all at once, nothing would be let go
   until the end, and every finished filter would run on to the last sample. */
async function laid(ctx, slots, lead = 0.6) {
  const q = 128 / SR;
  const times = slots.map(slot => Math.max(0, Math.floor((slot.at - lead) / q) * q));
  slots.forEach((slot, i) => {
    if (times[i] <= 0) { slot.lay(); return; }
    ctx.suspend(times[i]).then(async () => { await new Promise(r => setTimeout(r, 0)); slot.lay(); ctx.resume(); });
  });
  return ctx.startRendering();
}
/* a song as the TV plays it: the round card, then its bars from songAt (stem: one part alone) */
window.__song = async (song, stem = null) => {
  const lead = 3.5, seconds = lead + chartOf(song).ms / 1000 + 3;
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * seconds), SR);
  const E = await engine(ctx);
  const songAt = lead * 1000, keep = id => !stem || STEM[stem](id);
  const slots = songSlots(chartOf(song)).map((events, bar) => ({ at:(songAt + bar * 2000 - GROOVE_PRE_MS) / 1000,
    lay:() => events.forEach(ev => { if (keep(ev.id)) playRecipe(E, ev.id, eventAt(songAt, ev.beat) / 1000, ev.opts); }) }));
  if (!stem) slots.unshift({ at:0.1, lay:() => {
    if (song === "lastcall") {
      playRecipe(E, "floatBell", (songAt + LAST_CALL_BEATS.bell * 500) / 1000, { first:true });
      playRecipe(E, "floatVoice", (songAt + LAST_CALL_BEATS.call * 500 - GROOVE_PRE_MS) / 1000, { line:"lastcall" });
      return;
    }
    playRecipe(E, "floatSting", (songAt + TITLE_BEATS.sting - GROOVE_PRE_MS) / 1000, { song });
    playRecipe(E, "floatVoice", (songAt + TITLE_BEATS.title - GROOVE_PRE_MS) / 1000, { line:"title-" + song });
  } });
  const t0 = performance.now();
  const buffer = await laid(ctx, slots);
  const out = wav(buffer);
  out.renderMs = Math.round(performance.now() - t0);
  return out;
};
/* the moments between the songs, one after another */
window.__moments = async () => {
  const ctx = new OfflineAudioContext(2, SR * 44, SR);
  const E = await engine(ctx);
  const at = s => s - GROOVE_PRE_S;
  for (let b = 0; b < 8; b++) playRecipe(E, "floatLobby", at(0.5 + b * 2), { bar:b });
  [[1.2, "floatHello"], [3.4, "floatHello"], [5.1, "floatSet"], [7.3, "floatSet"]].forEach(([s, id]) => playRecipe(E, id, s));
  playRecipe(E, "floatOpen", at(17));
  const cut = 22;
  playRecipe(E, "floatRoll", at(cut + CUT_BEATS.roll / 1000), { ms:CUT_BEATS.reveal - CUT_BEATS.roll });
  [0, 1, 2].forEach(k => playRecipe(E, "floatGone", at(cut + (CUT_BEATS.reveal + k * CUT_BEATS.gap) / 1000), { step:k, pan:-0.4 + k * 0.4 }));
  const podium = 28;
  playRecipe(E, "floatFanfare", at(podium + PODIUM_BEATS.roll / 1000));
  [0, 0.04, 0.6, 1.4, 1.43, 1.46].forEach((x, i) => playRecipe(E, "floatFlub", 36 + x, { pan:-0.6 + i * 0.2, n:i % 3 + 1 }));
  [[38.5, "floatDone"], [38.9, "floatDone"], [39.6, "floatCheer"], [40.1, "floatCheer"]].forEach(([s, id], i) => playRecipe(E, id, s, { step:i }));
  return wav(await ctx.startRendering());
};
/* the lobby's loop alone, its four sections (32 bars) */
window.__lobby = async () => {
  const ctx = new OfflineAudioContext(2, SR * 66, SR);
  const E = await engine(ctx);
  const slots = Array.from({ length:32 }, (_, b) => ({ at:0.5 + b * 2 - GROOVE_PRE_S, lay:() => playRecipe(E, "floatLobby", 0.5 + b * 2 - GROOVE_PRE_S, { bar:b % 8, section:Math.floor(b / 8) }) }));
  return wav(await laid(ctx, slots));
};
/* the phone's own, on a phone's engine */
window.__phone = async () => {
  const ctx = new OfflineAudioContext(2, SR * 9, SR);
  const E = await engine(ctx, "phone");
  ["perfect", "nice", "ok", "early", "late", null].forEach((q, i) => ["paddle", "hey", "hop", "spin"].forEach((kind, j) =>
    playRecipe(E, "floatYouTap", 0.3 + i * 0.9 + j * 0.2, { q, kind })));
  [[6, "floatYouDone"], [6.8, "floatYouCheer"], [7.3, "floatYouSafe"], [8.0, "floatYouOut"]].forEach(([s, id]) => playRecipe(E, id, s));
  playRecipe(E, "floatYouPlace", 8.6, { place:1 });
  return wav(await ctx.startRendering());
};
/* one recipe alone, its cue pre before a beat at 1 s (GROOVE_PRE_S: a Groove cue's): where does its beat land? */
window.__onset = async (id, opts, pre = GROOVE_PRE_S) => {
  const ctx = new OfflineAudioContext(1, SR * 3, SR);
  window.__dry = true;
  const E = await engine(ctx);
  window.__dry = false;
  playRecipe(E, id, 1 - pre, opts);
  const buffer = await ctx.startRendering();
  const m = clipMarks(buffer.getChannelData(0), SR);
  let peak = 0; for (const v of buffer.getChannelData(0)) peak = Math.max(peak, Math.abs(v));
  return { beat:m.beat, start:m.start, peak };
};
window.__ready = true;
`;

const work = fs.mkdtempSync(path.join(os.tmpdir(), "float-render-"));
const bundle = await build({ stdin:{ contents:ENTRY, resolveDir:ROOT, loader:"js" }, bundle:true, format:"iife", platform:"browser",
  target:["chrome110"], write:false, logLevel:"silent", define:{ "process.env.NODE_ENV":"\"production\"", __FD_BUILD_ID__:"\"render\"" } });
const page = path.join(work, "render.html");
fs.writeFileSync(page, `<!doctype html><meta charset="utf-8"><title>render</title><script>${bundle.outputFiles[0].text}</script>`);
const voiceDir = path.join(ROOT, "public/float/groove/voice");
const clips = fs.existsSync(path.join(voiceDir, "manifest.json")) ? JSON.parse(fs.readFileSync(path.join(voiceDir, "manifest.json"), "utf8")).clips
  .map(c => ({ id:c.id, base64:fs.readFileSync(path.join(voiceDir, c.file)).toString("base64") })) : [];

const chrome = await launchChrome({ width:800, height:600 });
let bad = false;
const toMp3 = (wavB64, file) => {
  const tmp = path.join(work, `${path.basename(file, ".mp3")}.wav`);
  fs.writeFileSync(tmp, Buffer.from(wavB64, "base64"));
  fs.mkdirSync(path.dirname(file), { recursive:true });
  const r = spawnSync("ffmpeg", ["-hide_banner", "-v", "error", "-y", "-i", tmp, "-c:a", "libmp3lame", "-b:a", "192k", file]);
  if (r.status !== 0) throw new Error(String(r.stderr));
  return file;
};
try {
  await chrome.load(pathToFileURL(page).href);
  await chrome.until("window.__ready === true", { timeout:20000 });
  await chrome.evaluate(`window.__clips = ${JSON.stringify(clips)}; true`);
  for (const job of jobs.filter(j => j !== "onsets")) {
    const renders = job === "moments" ? [["moments", "window.__moments()"], ["phone", "window.__phone()"], ["lobby", "window.__lobby()"]]
      : [[job, `window.__song(${JSON.stringify(job)})`], ...(STEMS ? ["band", "calls", "answers"].map(s => [`${job}-${s}`, `window.__song(${JSON.stringify(job)}, ${JSON.stringify(s)})`]) : [])];
    for (const [name, expr] of renders) {
      const t0 = Date.now();
      const r = await chrome.evaluate(expr);
      r.took = Date.now() - t0;
      const file = toMp3(r.base64, path.join(OUT, `${name}.mp3`));
      const ok = r.peak > 0.02 && r.peak <= 1;
      if (!ok) bad = true;
      console.log(`${ok ? "ok " : "BAD"} ${path.relative(ROOT, file).padEnd(46)} ${String(r.ms).padStart(6)} ms  peak ${r.peak.toFixed(3)}  rms ${r.rms.toFixed(4)}  (${(r.took / 1000).toFixed(1)} s${r.renderMs ? `, render ${(r.renderMs / 1000).toFixed(1)} s` : ""})`);
    }
  }
  /* the onset check: every call and answer alone */
  const checks = [
    ...["ready", "hey", "ba", "spin", "one", "two", "three", "four", "drink", "herewego"].map(line => ["floatVoice", { line, song:"rock", k:0, n:0, of:1 }, line]),
    ...[0, 1, 2].map(n => ["floatVoice", { line:"ba", song:"rock", k:3, n, of:3, after:0.22 }, `ba ${n + 1} of 3`]),
    ["floatWhirl", { song:"spin" }, "whirl"], ["floatWhirl", { song:"spin", say:true }, "whirl + Spin!"],
    ["floatAnswer", { kind:"paddle", song:"paddle", k:0, b:0, n:0, of:2 }, "splash"], ["floatAnswer", { kind:"hey", song:"paddle", k:1, b:3 }, "crowd Hey!"],
    ["floatAnswer", { kind:"hop", song:"rock", k:0, b:2, n:0, of:1 }, "boing"], ["floatAnswer", { kind:"spin", song:"spin", k:0, b:1 }, "whoosh"],
    ["floatAnswer", { kind:"drop", song:"drop", k:0, b:0 }, "the drop"],
    ["floatGroove", { song:"paddle", bar:6, sec:"play", part:0, k:0, len:8, next:"play", only:["drums"] }, "a bar's downbeat (drums)"],
    ["floatSting", { song:"paddle" }, "the round card's hit"],
  ];
  /* the reference: a card's tick (an instant attack) at 1 s, read the same way: the engine's own delay
     (the master's compressor looks a few ms ahead) and the reading's own, which every sound shares */
  const ref = await chrome.evaluate(`window.__onset("S3", {}, 0)`);
  console.log(`    reference: an instant attack at 1 s reads at +${((ref.beat - 1) * 1000).toFixed(1)} ms (the engine and the reading)`);
  const rows = [];
  for (const [id, opts, label] of checks) {
    const r = await chrome.evaluate(`window.__onset(${JSON.stringify(id)}, ${JSON.stringify(opts)})`);
    const err = Math.round((r.beat - ref.beat) * 10000) / 10;
    const ok = Math.abs(err) <= 5 && r.peak > 0.005;
    if (!ok) bad = true;
    rows.push({ label, id, err, lead:Math.round((1 - r.start) * 1000), peak:Math.round(r.peak * 1000) / 1000, ok });
    console.log(`${ok ? "ok " : "BAD"} onset ${label.padEnd(28)} ${err >= 0 ? "+" : ""}${err.toFixed(1)} ms  (soft start ${Math.round((1 - r.start) * 1000)} ms ahead, peak ${r.peak.toFixed(3)})`);
  }
  fs.mkdirSync(OUT, { recursive:true });
  fs.writeFileSync(path.join(OUT, "onsets.json"), `${JSON.stringify({ at:new Date().toISOString(), clips:clips.length, rows }, null, 2)}\n`);
} finally {
  await chrome.close();
  fs.rmSync(work, { recursive:true, force:true });
}
if (bad) process.exitCode = 1;
