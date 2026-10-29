/* The Groove's host voice (float/GROOVE.md "Sound (the Groove)": "The
   host's voice"): every line generated once with OpenAI text-to-speech
   (gpt-4o-mini-tts, a cheerful cartoon host), then with ffmpeg trimmed to
   its start, pitched up for a cartoon voice, peak-normalized and saved as a
   small MP3, with a manifest of each clip's marks read the way the engine
   reads them (soundKit clipMarks: its beat is the first rise past half the
   peak, which the engine lands on the beat).

     node scripts/float-voice.mjs [--groups host,narration,bartender,crowd]
       [--voices coral] [--pick coral] [--rate 1.28]
       [--bartenders sage,fable] [--pick-bartender fable] [--bartender-rate 1]
       [--crowd hey,ooh,aww,chug] [--install-crowd] [--takes 3] [--fresh]
       [--check] [--work <dir>]

   Groups: host (the calls, counts and titles), narration (the practice's
   lines, "Copy me", the chug-off's), bartender (Last Call's countdown, in
   its own voice, not pitched), crowd (several voices at once). An install
   (--pick, --pick-bartender, --install-crowd) merges into the installed
   manifest: only the clips this run made are replaced.

   OPENAI_API_KEY comes from the environment of this process only (never
   printed or written). Raw takes and the processed sets go to --work (the
   session's scratchpad by default, outside the repo); --pick installs one
   voice's set into public/float/groove/voice/ (the MP3s and manifest.json)
   and float/client/sound/voices.js; every voice's set is also written as
   one review sheet per voice (.impeccable/review/float-sound/voices/) to
   listen to side by side. --check transcribes each processed clip (the
   pitch-up must still read as its words). Prompts never name another
   game. The voice is AI-generated: a release's credits say so. */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { clipMarks } from "../src/lib/soundKit.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const value = (name, d) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const VOICES = value("--voices", "coral").split(",").map(s => s.trim()).filter(Boolean);
const PICK = value("--pick", null);
const RATE = Number(value("--rate", "1.28")) || 1.28;
const GROUPS = value("--groups", "host,narration,bartender,crowd").split(",").map(s => s.trim()).filter(Boolean);
const BARTENDERS = value("--bartenders", "sage,fable").split(",").map(s => s.trim()).filter(Boolean);
const PICK_BAR = value("--pick-bartender", null);
const BAR_RATE = Number(value("--bartender-rate", "1")) || 1;
const CROWD_LINES = value("--crowd", "hey,ooh,aww,chug").split(",").map(s => s.trim()).filter(Boolean);
/* only these ids (a redo of a line or two; everything else stays as installed) */
const ONLY = value("--only", null)?.split(",").map(s => s.trim()).filter(Boolean) ?? null;
const only = list => (ONLY ? list.filter(item => ONLY.includes(item.id)) : list);
const WORK = path.resolve(value("--work", path.join(os.tmpdir(), "float-voice")));
const FRESH = args.includes("--fresh"), CHECK = args.includes("--check");
const KEY = process.env.OPENAI_API_KEY;

/* the host's lines: id, the words, how to say them */
const HOST = "You are the host of a cute, bouncy party rhythm game: a cheerful little cartoon critter on a riverbank, calling into a megaphone. "
  + "Bright, bouncy, deadpan-cute energy, crisp and punchy, fast. Say only the words, at once, with no breath before them, "
  + "and stop dead after the last syllable: no drawn-out vowels, no trailing sound.";
const COUNT = `${HOST} You are counting a band in: one word, very short and clipped (a third of a second), landing hard on the beat.`;
export const LINES = Object.freeze([
  { id:"ready", text:"Ready?", how:`${HOST} A quick, perky "Ready?" with a little lift at the end, as a cue before everyone shouts.` },
  { id:"hey", text:"Hey!", how:`${HOST} One short, sharp "Hey!", like a cheerleader's call.` },
  { id:"ba", text:"Bah!", how:`${HOST} Sing one very short staccato syllable, "bah", on a single steady pitch, bright and bouncy, like one note in a tune.` },
  { id:"spin", text:"Spin!", how:`${HOST} One quick, playful "Spin!".` },
  { id:"one", text:"One!", how:COUNT },
  { id:"two", text:"Two!", how:COUNT },
  { id:"three", text:"Three!", how:COUNT },
  { id:"four", text:"Four!", how:COUNT },
  { id:"drink", text:"Drink!", how:`${HOST} A delighted, punchy "Drink!", the party's favorite moment.` },
  { id:"herewego", text:"Here we go!", how:`${HOST} An excited "Here we go!", quick, as the music starts.` },
  { id:"title-paddle", text:"Paddle Party!", how:`${HOST} Announce the round's name like a game show title card: "Paddle Party!"` },
  { id:"title-rock", text:"Rock Hop!", how:`${HOST} Announce the round's name like a game show title card: "Rock Hop!"` },
  { id:"title-spin", text:"Spin Cycle!", how:`${HOST} Announce the round's name like a game show title card: "Spin Cycle!"` },
  { id:"title-drop", text:"The Drop!", how:`${HOST} Announce the round's name like a big game show title card: "The Drop!"` },
  { id:"title-fireworks", text:"Fireworks!", how:`${HOST} Announce the grand final round's name like the biggest game show title card of the night, thrilled: "Fireworks!"` },
  { id:"lastcall", text:"Last call!", how:`${HOST} A sly, delighted "Last call!", like a bartender ringing the bell before the final round of drinks.` },
]);
/* the host's narration (chart.lines: the practice's text box, "Copy me" over
   the breakdown) and the chug-off's call, in the host's voice */
const SAY = `${HOST} You are telling the players what to do next, clearly and brightly, like a game's friendly instructor, quick and light.`;
export const NARRATION = Object.freeze([
  { id:"say-paddle", text:"Paddle on one and three!", how:SAY },
  { id:"say-readyhey", text:"When I say Ready, you say Hey!", how:`${SAY} Lean on "Ready" and "Hey".` },
  { id:"say-watch", text:"Watch!", how:SAY },
  /* Paddle Party's v3 practice: both at once (GROOVE.md v3 6) */
  { id:"say-keephey", text:"Keep paddling. Hey on four!", how:`${SAY} Two quick phrases, a tiny pause between them; lean on "Hey".` },
  { id:"say-bothnow", text:"Both now!", how:`${SAY} Quick and encouraging: two syllables.` },
  { id:"say-turn", text:"Your turn!", how:`${SAY} Very quick and clipped: two syllables, about a third of a second.` },
  { id:"say-hoptwo", text:"Hop two beats after me!", how:SAY },
  { id:"say-twotime", text:"Two this time!", how:SAY },
  { id:"say-spinone", text:"Spin one beat after me!", how:SAY },
  /* tempo: quicker without going higher (it must fit between Spin Cycle's whirls) */
  { id:"say-backbeat", text:"On the backbeat!", how:`${SAY} Very quick and clipped, no pause between the words: about half a second.`, tempo:1.45 },
  { id:"say-allthree", text:"All three, in turn!", how:SAY },
  { id:"say-hop", text:"Hop, hop!", how:`${SAY} Two quick, bouncy hops: "Hop, hop!"` },
  { id:"say-spin", text:"Spin!", how:SAY },
  { id:"say-copy", text:"Copy me!", how:`${SAY} A playful, teasing "Copy me!", as the music changes.` },
  { id:"chugoff", text:"Chug-off!", how:`${HOST} Announce a head-to-head drinking race like a game show's big moment: "Chug-off!"` },
  { id:"chug", text:"Chug!", how:`${HOST} The starting shout of a race: one short, explosive "Chug!".` },
  { id:"chug-explain", text:"Last one in against first one out. First to finish keeps the spot.",
    how:`${SAY} Explain the rule quickly and plainly, two short sentences, a tiny pause between them.` },
]);
/* Last Call's bartender: a second voice, not pitched (the host's is) */
const BAR = "You are the bartender in a cute cartoon party game, behind the counter at closing time: warm, dry and steady, a little sly. "
  + "Say only the words, at once, with no breath before them, and stop dead after the last syllable.";
const NUMBER = `${BAR} You are counting down to closing time: say the one number, firm and clear, the same way every time, short (under half a second).`;
export const BARTENDER_LINES = Object.freeze([
  ...["Ten", "Nine", "Eight", "Seven", "Six", "Five", "Four"].map((word, k) => ({ id:`bar-${10 - k}`, text:`${word}.`, how:NUMBER })),
  /* Last Call's rush (v3): six, five, four 0.7 s apart, the same voice quicker (tempo, not pitch) */
  ...["Six", "Five", "Four"].map((word, k) => ({ id:`bar-${6 - k}q`, text:`${word}.`, how:`${NUMBER} Quick and clipped: the clock is speeding up.`, tempo:1.3 })),
  { id:"bar-lastcall", text:"Last call!", how:`${BAR} Ring in the last round: a sly, delighted "Last call!".` },
  { id:"bar-explain", text:"The bar closes at zero. Tap on zero. Farthest off drinks.",
    how:`${BAR} Explain the game in three short, plain sentences, a small pause between them, a little smile in "Farthest off drinks".` },
]);
/* the crowd: several people at once, each its own voice and pitch ("Hey!" on
   the beat, "Ooh!" as Last Call names who drinks, "Aww!" as a rider is out) */
const CROWD_HOW = Object.freeze({
  hey:"One person in a happy party crowd shouting together on the beat: a single short, loud, joyful \"Hey!\". No breath before it.",
  ooh:"One person in a party crowd reacting together, teasing and delighted, as a friend has to drink: a short rising \"Ooooh!\". No breath before it.",
  aww:"One person in a party crowd reacting together, sympathetic and playful, as a friend is knocked out of a game: a short falling \"Awww!\". No breath before it.",
  chug:"One person in a rowdy party crowd chanting together on the beat as two friends race to finish a drink: a single short, punchy \"Chug!\". No breath before it.",
});
const CROWD_TEXT = Object.freeze({ hey:"Hey!", ooh:"Ooooh!", aww:"Awww!", chug:"Chug!" });
export const CROWD_TAKES = Object.freeze([
  { id:"crowd-hey-1", voice:"ash", rate:1.0 }, { id:"crowd-hey-2", voice:"nova", rate:1.12 }, { id:"crowd-hey-3", voice:"echo", rate:0.94 },
  { id:"crowd-hey-4", voice:"shimmer", rate:1.18 }, { id:"crowd-hey-5", voice:"onyx", rate:0.9 }, { id:"crowd-hey-6", voice:"sage", rate:1.06 },
  { id:"crowd-ooh-1", voice:"ash", rate:1.0 }, { id:"crowd-ooh-2", voice:"nova", rate:1.1 }, { id:"crowd-ooh-3", voice:"echo", rate:0.95 },
  { id:"crowd-ooh-4", voice:"shimmer", rate:1.15 },
  { id:"crowd-aww-1", voice:"ash", rate:1.0 }, { id:"crowd-aww-2", voice:"nova", rate:1.1 }, { id:"crowd-aww-3", voice:"echo", rate:0.95 },
  { id:"crowd-aww-4", voice:"shimmer", rate:1.15 },
  { id:"crowd-chug-1", voice:"ash", rate:1.0 }, { id:"crowd-chug-2", voice:"nova", rate:1.1 }, { id:"crowd-chug-3", voice:"echo", rate:0.94 },
  { id:"crowd-chug-4", voice:"shimmer", rate:1.15 }, { id:"crowd-chug-5", voice:"onyx", rate:0.92 }, { id:"crowd-chug-6", voice:"sage", rate:1.05 },
].map(take => ({ ...take, line:take.id.split("-")[1] })));

const ffmpeg = (argv, input = null) => {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-v", "error", ...argv], { input, maxBuffer:256 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`ffmpeg ${argv.join(" ")}: ${String(r.stderr || "").slice(0, 400)}`);
  return r.stdout;
};
/* a file's samples as mono float32 at `rate` */
function samples(file, rate) {
  const buf = ffmpeg(["-i", file, "-f", "f32le", "-ac", "1", "-ar", String(rate), "-"]);
  return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
}
const peakOf = data => { let p = 0; for (let i = 0; i < data.length; i++) p = Math.max(p, Math.abs(data[i])); return p; };
const rms = (data, from, win) => { let s = 0; for (let i = from; i < from + win && i < data.length; i++) s += data[i] * data[i]; return Math.sqrt(s / win); };
/* the envelope's peak (RMS over 5 ms), clipMarks' reference */
function peakEnvelope(data, sr) {
  const win = Math.round(sr * 0.005), hop = Math.round(sr * 0.001);
  let p = 0;
  for (let i = 0; i + win <= data.length; i += hop) p = Math.max(p, rms(data, i, win));
  return p;
}

async function speak({ voice, text, how, file }) {
  if (!FRESH && fs.existsSync(file) && fs.statSync(file).size > 1000) return file;
  if (!KEY) throw new Error("OPENAI_API_KEY is not set for this process");
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method:"POST", headers:{ Authorization:`Bearer ${KEY}`, "Content-Type":"application/json" },
    body:JSON.stringify({ model:"gpt-4o-mini-tts", voice, input:text, instructions:how, response_format:"wav" }),
  });
  if (!res.ok) throw new Error(`speech ${voice} "${text}": ${res.status} ${(await res.text()).slice(0, 200)}`);
  fs.mkdirSync(path.dirname(file), { recursive:true });
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

/* trim to the take's own start (a hair of lead-in kept) and end, pitch it up
   by `rate` (speed with it: a cartoon), peak at -1 dB, and encode */
function processTake(raw, out, rate, tempo = 1) {
  const SR = 24000, data = samples(raw, SR);
  const m = clipMarks(data, SR);
  /* the end: the last moment past 5% of the peak (-26 dB; the tail under it is lost under the band) */
  const env = 0.05 * peakEnvelope(data, SR);
  let last = data.length - 1;
  const hop = Math.round(SR * 0.002), win = Math.round(SR * 0.005);
  for (let i = data.length - win; i > 0; i -= hop) { if (rms(data, i, win) >= env) { last = i + win; break; } }
  const start = Math.max(0, m.start - 0.025), end = Math.min(m.dur, last / SR + 0.03);
  const peak = peakOf(data.subarray(Math.floor(start * SR), Math.ceil(end * SR)));
  const gain = peak > 0 ? -1 - 20 * Math.log10(peak) : 0;
  const len = (end - start) / rate / tempo;
  fs.mkdirSync(path.dirname(out), { recursive:true });
  ffmpeg(["-y", "-i", raw, "-af", [`atrim=start=${start.toFixed(4)}:end=${end.toFixed(4)}`, "asetpts=PTS-STARTPTS",
    `asetrate=${Math.round(SR * rate)}`, "aresample=44100", ...(tempo !== 1 ? [`atempo=${tempo}`] : []), "afade=t=in:d=0.004", `afade=t=out:st=${Math.max(0, len - 0.025).toFixed(4)}:d=0.025`,
    `volume=${gain.toFixed(2)}dB`].join(","), "-ac", "1", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "64k", out]);
  const decoded = samples(out, 44100), marks = clipMarks(decoded, 44100);
  return { onset:Math.round(marks.beat * 1000), start:Math.round(marks.start * 1000), dur:Math.round(marks.dur * 1000), f0:marks.f0, glide:marks.glide };
}

async function transcribe(file) {
  const form = new FormData();
  form.append("model", "whisper-1");
  form.append("language", "en");
  form.append("file", new Blob([fs.readFileSync(file)], { type:"audio/mpeg" }), path.basename(file));
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", { method:"POST", headers:{ Authorization:`Bearer ${KEY}` }, body:form });
  if (!res.ok) return `(${res.status})`;
  return String((await res.json()).text || "").trim();
}
const words = s => String(s).toLowerCase().replace(/-/g, " ").replace(/[^a-z0-9 ]/g, "").replace(/\b0\b/g, "zero").replace(/\b(1|won)\b/g, "one").replace(/\b(2|to|too)\b/g, "two")
  .replace(/\b5\b/g, "five").replace(/\b6\b/g, "six").replace(/\b7\b/g, "seven").replace(/\b8\b/g, "eight").replace(/\b9\b/g, "nine").replace(/\b10\b/g, "ten")
  .replace(/\b3\b/g, "three").replace(/\b(4|for)\b/g, "four").replace(/\b(bah|ba|baa|bar)\b/g, "bah")
  .replace(/\bo{2,}h+\b|\buh+ ?oh+\b/g, "ooh").replace(/\ba+w+\b|\bo+w+\b/g, "aww").trim();

/* TAKES takes of a line; the one kept is heard as its words (--check) and
   the snappiest: short, its beat early (a sung "ba" must hold a pitch) */
const TAKES = Math.max(1, Math.min(5, Number(value("--takes", "3")) || 3));
/* heard as its words: every word of the line in what whisper heard */
const heardRight = (heard, text) => { const got = words(heard).split(/\s+/); return words(text).split(/\s+/).every(w => got.includes(w)); };
async function bestTake({ voice, text, how, id, rate, dir, pitched = false, tempo = 1 }) {
  const takes = [];
  for (let n = 1; n <= TAKES; n++) {
    const raw = await speak({ voice, text, how, file:path.join(WORK, "raw", dir, `${id}-${n}.wav`) });
    const out = path.join(WORK, "set", dir, "takes", `${id}-${n}.mp3`);
    const take = { n, path:out, ...processTake(raw, out, rate, tempo) };
    if (CHECK) take.heard = await transcribe(out);
    takes.push(take);
  }
  /* a sung "ba" must hold its pitch: its glide counts against it */
  const score = t => (CHECK && !heardRight(t.heard, text) ? 1e6 : 0) + (pitched && !(t.f0 > 0) ? 1e5 : 0) + (pitched ? 3000 * (t.glide ?? 1) : 0)
    + t.dur + 1.5 * t.onset;
  const best = takes.reduce((a, b) => (score(b) < score(a) ? b : a));
  const out = path.join(WORK, "set", dir, `${id}.mp3`);
  fs.copyFileSync(best.path, out);
  return { ...best, path:out, takes:takes.map(t => `${t.dur}/${t.onset}${CHECK ? ` "${t.heard}"` : ""}`).join(", ") };
}
/* one voice's set of `lines`: the best take of each, processed, with its marks */
async function voiceSet(voice, lines = LINES, rate = RATE, dir = voice) {
  const set = [];
  for (const line of lines) {
    const best = await bestTake({ voice, text:line.text, how:line.how, id:line.id, rate, dir, pitched:line.id === "ba", tempo:line.tempo || 1 });
    set.push({ id:line.id, text:line.text, file:`${line.id}.mp3`, voice, ...best });
  }
  return set;
}
async function crowdSet() {
  const set = [];
  for (const take of only(CROWD_TAKES.filter(t => CROWD_LINES.includes(t.line)))) {
    const text = CROWD_TEXT[take.line];
    const best = await bestTake({ voice:take.voice, text, how:CROWD_HOW[take.line], id:take.id, rate:take.rate, dir:"crowd" });
    set.push({ id:take.id, text, file:`${take.id}.mp3`, voice:take.voice, ...best });
  }
  return set;
}
/* a review sheet: every clip in turn, 0.45 s apart, as one MP3 */
function sheet(set, out) {
  fs.mkdirSync(path.dirname(out), { recursive:true });
  const list = path.join(WORK, `sheet-${path.basename(out, ".mp3")}.txt`);
  const gap = path.join(WORK, "gap.mp3");
  if (!fs.existsSync(gap)) ffmpeg(["-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", "0.45", "-c:a", "libmp3lame", "-b:a", "64k", gap]);
  fs.writeFileSync(list, set.flatMap(c => [`file '${c.path.replaceAll("\\", "/")}'`, `file '${gap.replaceAll("\\", "/")}'`]).join("\n"));
  ffmpeg(["-y", "-f", "concat", "-safe", "0", "-i", list, "-c:a", "libmp3lame", "-b:a", "96k", out]);
}

const report = [];
const sets = {}, bars = {};
const hostLines = only([...(GROUPS.includes("host") ? LINES : []), ...(GROUPS.includes("narration") ? NARRATION : [])]);
const tag = ONLY ? `-${ONLY.join("-")}` : GROUPS.includes("host") ? "" : "-narration";
if (hostLines.length) for (const voice of VOICES) {
  sets[voice] = await voiceSet(voice, hostLines, RATE, voice);
  sheet(sets[voice], path.join(ROOT, ".impeccable/review/float-sound/voices", `${voice}${tag}.mp3`));
}
if (GROUPS.includes("bartender")) for (const voice of BARTENDERS) {
  bars[voice] = await voiceSet(voice, only(BARTENDER_LINES), BAR_RATE, `bartender-${voice}`);
  sheet(bars[voice], path.join(ROOT, ".impeccable/review/float-sound/voices", `bartender-${voice}.mp3`));
}
const crowd = GROUPS.includes("crowd") ? await crowdSet() : [];
if (crowd.length) sheet(crowd, path.join(ROOT, ".impeccable/review/float-sound/voices", `crowd${CROWD_LINES.length < 4 ? `-${CROWD_LINES.join("-")}` : ""}.mp3`));
const line = (name, set) => {
  const ok = set.filter(c => !CHECK || heardRight(c.heard, c.text)).length;
  report.push(`${name}: ${set.map(c => `${c.id} ${c.dur}ms beat@${c.onset}${c.f0 ? ` f0 ${c.f0}` : ""}${CHECK ? ` "${c.heard}"` : ""}`).join(" | ")}  (${ok}/${set.length} heard)`);
};
for (const [voice, set] of Object.entries(sets)) line(voice, set);
for (const [voice, set] of Object.entries(bars)) line(`bartender ${voice}`, set);
if (crowd.length) line("crowd", crowd);
console.log(report.join("\n"));

/* the install: merged into the installed manifest, only this run's clips replaced */
if (PICK || PICK_BAR || args.includes("--install-crowd")) {
  const fresh = [];
  if (PICK) { if (!sets[PICK]) throw new Error(`--pick ${PICK}: not among --voices`); fresh.push(...sets[PICK]); }
  if (PICK_BAR) { if (!bars[PICK_BAR]) throw new Error(`--pick-bartender ${PICK_BAR}: not among --bartenders`); fresh.push(...bars[PICK_BAR]); }
  if (args.includes("--install-crowd")) fresh.push(...crowd);
  const dir = path.join(ROOT, "public/float/groove/voice"), file = path.join(dir, "manifest.json");
  fs.mkdirSync(dir, { recursive:true });
  const old = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { clips:[] };
  const ids = new Set(fresh.map(c => c.id));
  const entry = c => ({ id:c.id, file:c.file, onset:c.onset, dur:c.dur, f0:c.f0 || 0, text:c.text, voice:c.voice });
  for (const c of fresh) fs.copyFileSync(c.path, path.join(dir, c.file));
  const clips = [...(old.clips || []).filter(c => !ids.has(c.id)), ...fresh.map(entry)];
  const manifest = { v:1, voice:old.voice || PICK, rate:old.rate || RATE, bartender:PICK_BAR || old.bartender || null,
    bartenderRate:PICK_BAR ? BAR_RATE : old.bartenderRate ?? null, model:"gpt-4o-mini-tts", aiGenerated:true, clips };
  fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
  const js = `/* The Groove's voices (written by scripts/float-voice.mjs; do not edit by
   hand): the clips under public/float/groove/voice/, as the clip path
   registers them. Each: id (soundKit GROOVE_LINES and the crowd's), file,
   onset (ms: the beat point, the first rise past 30% of the peak), dur (ms),
   f0 (Hz at the beat, 0 unpitched), voice. The host is VOICE.voice, Last
   Call's bartender VOICE.bartender. The engine reads its own marks from
   the decoded samples; these are the script's, for the planner (a
   narration line is placed by its length), the tests and a look. The
   voices are AI-generated (OpenAI text-to-speech): a release's credits say
   so. */
export const VOICE = Object.freeze({
  base:"/float/groove/voice/",
  voice:${JSON.stringify(manifest.voice)},
  bartender:${JSON.stringify(manifest.bartender)},
  clips:Object.freeze([
${clips.map(c => `    Object.freeze({ id:${JSON.stringify(c.id)}, file:${JSON.stringify(c.file)}, onset:${c.onset}, dur:${c.dur}, f0:${c.f0 || 0}, voice:${JSON.stringify(c.voice || manifest.voice)} }),`).join("\n")}
  ]),
});
`;
  fs.writeFileSync(path.join(ROOT, "float/client/sound/voices.js"), js);
  console.log(`installed ${fresh.length} clips (${[...ids].join(", ")}); ${clips.length} in all`);
}
