/* Karaoke's own lyrics (docs/KARAOKE.md "Lyrics"): a song sung over an
   instrumental upload shows its words on the TV and the phones, timed to
   the video. The words are LRCLIB's synced lyrics (LRC), fetched by the
   Worker (worker/lyrics.js) and kept in the game as lines; this module is
   the pure half both sides share:

     parseLrc(text)          LRC to [{ t, text, words? }] (t in ms, sorted;
                             an empty text is a break between lines;
                             enhanced LRC's <mm:ss.xx> word stamps become
                             `words`, each { t, text })
     cleanLyrics(lines)      what a write may store: bounded, sorted, junk
                             dropped; null when nothing is left
     lyricCue(lines, ms)     where the song is at `ms` (the video's own time
                             plus the song's nudge): the line being sung,
                             the next one, how far through it the singer is
                             and each word's share of it, so a line lights
                             word by word (a line without word stamps
                             sweeps at a singing pace, never slower than
                             the gap to the next line allows)
     karaokeLyricsOffset     the commissioner's nudge, ±0.25 s a step

   Never imports anything: the TV, the phones, the Worker and the tests all
   read the same clock. */

/* at most this many lines and characters a line (a long song is ~90 lines) */
export const LYRICS_MAX_LINES = 400;
export const LYRICS_MAX_TEXT = 160;
/* the nudge: a step, and as far as it goes either way */
export const LYRICS_NUDGE_STEP_MS = 250;
export const LYRICS_NUDGE_MAX_MS = 10000;
/* a line without word stamps is sung at about this pace (ms a character),
   never quicker than LYRICS_MIN_LINE_MS a line, never past the next line */
export const LYRICS_MS_PER_CHAR = 80;
export const LYRICS_MIN_LINE_MS = 1200;
/* a line stays lit this long past its sweep while the next one waits */
export const LYRICS_HOLD_MS = 4000;

const STAMP = /\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g;
const WORD = /<(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)>/g;
const toMs = (min, sec) => {
  const [whole, frac = ""] = String(sec).replace(":", ".").split(".");
  const ms = frac ? Math.round(Number(`0.${frac}`) * 1000) : 0;
  return Number(min) * 60000 + Number(whole) * 1000 + ms;
};
const tidy = value => String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();

/* An enhanced line's words: "<00:12.10> Just <00:12.40> a small" */
function wordsOf(body) {
  WORD.lastIndex = 0;
  if (!WORD.test(body)) return null;
  WORD.lastIndex = 0;
  const words = [];
  const parts = body.split(WORD);
  /* split keeps the captures: [before, min, sec, after, min, sec, after...] */
  for (let i = 1; i + 2 < parts.length; i += 3) {
    const t = toMs(parts[i], parts[i + 1]);
    for (const word of tidy(parts[i + 2]).split(" ").filter(Boolean)) words.push({ t, text:word });
  }
  return words.length ? words : null;
}

/* LRC text to lines, sorted by time. Metadata tags ([ar:], [ti:]...) are
   skipped; [offset:+N] (ms, positive is earlier) is applied; a line with
   several stamps repeats at each. */
export function parseLrc(text) {
  if (typeof text !== "string" || !text.trim()) return [];
  let offset = 0;
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const meta = /^\s*\[offset:\s*([+-]?\d+)\s*\]\s*$/i.exec(raw);
    if (meta) { offset = Number(meta[1]) || 0; continue; }
    STAMP.lastIndex = 0;
    const stamps = [];
    let match, end = 0;
    const line = raw.trim();
    while ((match = STAMP.exec(line)) && match.index === end) {
      stamps.push(toMs(match[1], match[2]));
      end = STAMP.lastIndex;
    }
    if (!stamps.length) continue;
    const body = line.slice(end);
    const words = wordsOf(body);
    const plain = tidy(body.replace(WORD, " "));
    for (const t of stamps) out.push({ t, text:plain, ...(words ? { words:words.map(word => ({ ...word })) } : {}) });
  }
  return out.map(line => ({ ...line, t:Math.max(0, line.t - offset),
    ...(line.words ? { words:line.words.map(word => ({ ...word, t:Math.max(0, word.t - offset) })) } : {}) }))
    .sort((a, b) => a.t - b.t);
}

/* What may be stored: whole ms, sorted, at most LYRICS_MAX_LINES lines of
   LYRICS_MAX_TEXT characters, no two breaks in a row, no break first.
   Null when no line has words. */
export function cleanLyrics(lines) {
  if (!Array.isArray(lines)) return null;
  const out = [];
  for (const line of lines) {
    if (!line || typeof line !== "object") continue;
    const t = Math.round(Number(line.t));
    if (!Number.isFinite(t) || t < 0 || t > 60 * 60 * 1000) continue;
    const text = tidy(line.text).slice(0, LYRICS_MAX_TEXT);
    const entry = { t, text };
    if (text && Array.isArray(line.words)) {
      const words = line.words.map(word => ({ t:Math.round(Number(word?.t)), text:tidy(word?.text).slice(0, 40) }))
        .filter(word => Number.isFinite(word.t) && word.t >= 0 && word.text).slice(0, 40);
      if (words.length) entry.words = words.sort((a, b) => a.t - b.t);
    }
    out.push(entry);
  }
  out.sort((a, b) => a.t - b.t);
  const kept = [];
  for (const line of out) {
    const last = kept[kept.length - 1];
    if (!line.text && (!last || !last.text)) continue;
    kept.push(line);
  }
  while (kept.length && !kept[kept.length - 1].text) kept.pop();
  return kept.some(line => line.text) ? kept.slice(0, LYRICS_MAX_LINES) : null;
}

/* the nudge as stored: a whole number of steps, within the max */
export function cleanLyricsOffset(value) {
  const ms = Math.round(Number(value) / LYRICS_NUDGE_STEP_MS) * LYRICS_NUDGE_STEP_MS;
  return Number.isFinite(ms) ? Math.max(-LYRICS_NUDGE_MAX_MS, Math.min(LYRICS_NUDGE_MAX_MS, ms)) : 0;
}
/* the nudge as the desk letters it: "+0.5 s", "-1.25 s", "0 s" */
export function lyricsOffsetText(ms) {
  const value = cleanLyricsOffset(ms) / 1000;
  return `${value > 0 ? "+" : value < 0 ? "-" : ""}${String(Math.abs(value))} s`;
}

/* the words of a line, each with its share of the line [a, b) as a
   fraction of the line's sweep: by its stamps when it has them, else by
   its characters */
function shares(line, span) {
  const text = line.text || "";
  if (Array.isArray(line.words) && line.words.length && span > 0) {
    const words = line.words;
    return words.map((word, k) => {
      const end = k + 1 < words.length ? words[k + 1].t : line.t + span;
      return { text:word.text, a:Math.max(0, (word.t - line.t) / span), b:Math.min(1, Math.max(0, (end - line.t) / span)) };
    });
  }
  const words = text.split(" ").filter(Boolean);
  const total = words.reduce((sum, word) => sum + word.length + 1, 0) || 1;
  let at = 0;
  return words.map(word => {
    const a = at / total;
    at += word.length + 1;
    return { text:word, a, b:at / total };
  });
}
/* how long a line's sweep runs: its last word's stamp plus a beat, or the
   singing pace, never past the next line */
function sweepOf(line, next) {
  const gap = next ? Math.max(1, next.t - line.t) : Infinity;
  const words = Array.isArray(line.words) ? line.words : null;
  const sung = words?.length ? words[words.length - 1].t - line.t + 600
    : Math.max(LYRICS_MIN_LINE_MS, (line.text || "").length * LYRICS_MS_PER_CHAR);
  return Math.max(1, Math.min(gap, sung));
}

/* Where the song is at `ms`: { index, line, next, progress, words } with
   `line` the one being sung (null before the first, in a break, or long
   after the last), `next` the one after it (or the first, before it),
   `progress` 0 to 1 through the line's sweep, `words` [{ text, a, b }]
   for lighting each word as progress passes it, and `index` the line's
   place (-1 for none). Pure. */
export function lyricCue(lines, ms) {
  const list = Array.isArray(lines) ? lines : [];
  const none = { index:-1, line:null, next:null, progress:0, words:[] };
  if (!list.length || !Number.isFinite(ms)) return none;
  let lo = 0, hi = list.length - 1, at = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].t <= ms) { at = mid; lo = mid + 1; } else hi = mid - 1;
  }
  const upcoming = from => list.slice(from).find(line => line.text) || null;
  if (at < 0) return { ...none, next:upcoming(0) };
  const line = list[at];
  const next = upcoming(at + 1);
  if (!line.text) return { ...none, index:at, next };
  const following = list[at + 1] || null;
  const sweep = sweepOf(line, following);
  /* the last line goes out once it has been sung and held */
  if (!following && ms > line.t + sweep + LYRICS_HOLD_MS) return { ...none, index:at };
  const progress = Math.max(0, Math.min(1, (ms - line.t) / sweep));
  return { index:at, line, next, progress, words:shares(line, sweep) };
}

/* A word's lit share at `progress`: 0 dark, 1 lit, between for the word
   being sung (the sweep runs through it). */
export const wordFill = (word, progress) => word.b <= word.a ? (progress >= word.a ? 1 : 0)
  : Math.max(0, Math.min(1, (progress - word.a) / (word.b - word.a)));

/* The song's own time on the screens that are not the TV: the video's
   position on the server clock (from when a TV really saw it start, else
   from the song's start) plus the nudge, in ms. */
export function lyricClockMs(turn, now, offset = 0) {
  if (!turn || !Number.isFinite(turn.songAt)) return null;
  const from = Number(turn.playedAt) || Number(turn.songAt);
  return Math.max(0, now - from) + cleanLyricsOffset(offset);
}
