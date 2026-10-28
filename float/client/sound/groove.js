/* The Groove's music on the room's clock (pure; float/GROOVE.md "Sound (the
   Groove)"). A song is planned from its chart (float/shared/chart.js, the
   truth for every cue's beat), bar by bar:

     the band     one bar of the song a bar (soundKit floatGroove, a cut
                  recipe), told its section, the cues it answers and the
                  calls it leaves room for
     the host     a call on every cue's call beat: "Ready" for a hey ("Hey"
                  twice for a double), a sung "ba" for each hop, a whirl for
                  a spin (with "Spin!" as a new pattern starts), the drop's
                  "three, two, one"; "Here we go!" in the intro, the
                  count-in "one, two, three, four" in its last bar and in
                  the drink break's, "Drink!" as the break starts
     the answer   on every cue's own beat, for everyone: a paddle's splash,
                  the crowd's "Hey!", a hop's boing on its call's note, a
                  spin's whoosh, the drop's plunge

   Each is an event { beat, id, opts } on the song's beats from its beat 0;
   the screen lays a bar's events a bar ahead, each at
   songAt + beat * BEAT_MS - GROOVE_PRE_MS (soundKit sounds a Groove beat
   GROOVE_PRE_S after its cue's time, so a voice's soft start and a
   whoosh's swell lead into the beat). The music is the game, so it plays
   under reduced motion too. */
import { BEAT_MS } from "../../shared/beat.js";
import { BAR_MS, BEATS_PER_BAR, LAST_CALL_ID, SONG_LEAD_MS, SONG_MS, chartOf, drinkSection, sectionsOf } from "../../shared/chart.js";

export { BEAT_MS, BAR_MS };
/* soundKit GROOVE_PRE_S, in ms */
export const GROOVE_PRE_MS = 150;
/* a beat's cue this late is dropped rather than played off its beat */
export const GROOVE_LATE_MS = 40;
/* a bar's events are laid this far ahead of its downbeat (and go on the audio
   clock then: a stalled page never drops or drags a bar) */
export const GROOVE_LEAD_MS = 1800;
/* The podium, ms from its start (the room's startAt): the fanfare's roll,
   then each place on its beat and the crowd (soundKit GROOVE_PODIUM_MS
   plus the roll's lead). The screen reveals the places on these. */
export const PODIUM_LEAD_MS = 500;
export const PODIUM_BEATS = Object.freeze({ roll:PODIUM_LEAD_MS, third:PODIUM_LEAD_MS + 1000, second:PODIUM_LEAD_MS + 2000,
  first:PODIUM_LEAD_MS + 3000, cheer:PODIUM_LEAD_MS + 4000, pose:PODIUM_LEAD_MS + 4000 });
/* The cut, ms from its start: the drumroll, the reveal on its hit, then
   one rider out each `gap` (the screen and the phone reveal on these). */
export const CUT_BEATS = Object.freeze({ roll:500, reveal:2500, gap:500 });
/* the song's round card (up SONG_LEAD_MS before beat 0): its sting's hit a
   beat after the card goes up, the host's title a beat after that (ms from songAt) */
export const TITLE_BEATS = Object.freeze({ card:-SONG_LEAD_MS, sting:-SONG_LEAD_MS + 500, title:-SONG_LEAD_MS + 1000 });

const B = BEATS_PER_BAR;
const round3 = x => Math.round(x * 1000) / 1000;
const barOf = beat => Math.floor(beat / B + 1e-9);
const inBar = beat => round3(beat - barOf(beat) * B);

/* the chart a room plays: its own when it is whole, else chart.js's */
export function chartFor(room) {
  const c = room?.chart;
  if (c && typeof c === "object" && Array.isArray(c.cues) && Array.isArray(c.sections) && Array.isArray(c.modes) && c.id) return c;
  return chartOf(room?.song ?? room?.chartId ?? null);
}

/* the section a bar is in: { sec, part (which of its kind: play A 0, B 1), k (the bar in it), len, next } */
export function barPlan(chart, bar) {
  const sections = chart?.sections?.length ? chart.sections : sectionsOf();
  const i = sections.findIndex(s => bar >= s.bar && bar < s.bar + s.bars);
  if (i < 0) return null;
  const s = sections[i], k = bar - s.bar;
  return { sec:s.kind, part:sections.slice(0, i).filter(x => x.kind === s.kind).length, k, len:s.bars,
    next:k < s.bars - 1 ? s.kind : sections[i + 1]?.kind ?? null };
}

/* every cue with where it sits: its bar, its beat in the bar, its section's
   bar (k), and n of `of` (its place among its bar's cues of its kind) */
function placed(chart) {
  const out = (chart?.cues || []).map(cue => ({ cue, bar:barOf(cue.beat), b:inBar(cue.beat) }));
  for (const p of out) {
    const same = out.filter(q => q.bar === p.bar && q.cue.kind === p.cue.kind);
    p.n = same.indexOf(p); p.of = same.length;
    p.k = barPlan(chart, p.bar)?.k ?? 0;
  }
  return out;
}

/* A song's whole sound as events on its beats: [{ beat, id, opts, kind }]
   in order (kind: bar, call, answer, count, line). Last Call's chart is
   its own (lastCallEvents). */
export function songEvents(chart) {
  if (!chart?.cues || !chart?.id) return [];
  if (chart.id === LAST_CALL_ID) return lastCallEvents(chart);
  const song = chart.id, cues = placed(chart), events = [];
  const add = (beat, id, opts, kind) => events.push({ beat:round3(beat), id, opts, kind });
  /* the host's calls: one note a cue, a fixed lead before it */
  const calls = [];
  for (const p of cues) {
    const { cue } = p;
    if (cue.call === null || cue.call === undefined) continue;
    if (cue.kind === "drop") { for (let j = 0; j < 3; j++) calls.push({ beat:cue.call + j, kind:"drop", p, j }); continue; }
    calls.push({ beat:cue.call, kind:cue.kind, p });
  }
  const sections = chart.sections?.length ? chart.sections : sectionsOf();
  for (let bar = 0; bar < (chart.bars || 0); bar++) {
    const plan = barPlan(chart, bar);
    if (!plan) continue;
    const hits = cues.filter(p => p.bar === bar).map(p => [p.b, p.cue.kind]);
    const mine = calls.filter(c => barOf(c.beat) === bar);
    const opts = { song, bar, ...plan, mode:chart.modes?.[bar] ?? null, hits, calls:mine.map(c => [inBar(c.beat), c.kind]) };
    if (plan.sec === "outro" && plan.k === 0) opts.finish = hits.length ? hits[hits.length - 1][0] : 0;
    /* the drop's countdown: the music cuts after the bar's first beat */
    if (!hits.length && mine.some(c => c.kind === "drop")) opts.cut = true;
    add(bar * B, "floatGroove", opts, "bar");
  }
  for (const c of calls) {
    const { p } = c, base = { song, k:p.k, n:p.n, of:p.of };
    if (c.kind === "drop") add(c.beat, "floatVoice", { line:["three", "two", "one"][c.j] }, "call");
    else if (c.kind === "hey") {
      const double = cues.some(q => q !== p && q.cue.kind === "hey" && Math.abs(q.cue.beat - p.cue.beat) <= 0.5);
      add(c.beat, "floatVoice", { line:double ? "hey" : "ready", ...base }, "call");
    } else if (c.kind === "hop") add(c.beat, "floatVoice", { line:"ba", ...base }, "call");
    else if (c.kind === "spin") add(c.beat, "floatWhirl", { song, quick:spinQuick(calls, c), say:spinSays(cues, p, sections) }, "call");
  }
  for (const p of cues) add(p.cue.beat, "floatAnswer", { kind:p.cue.kind, song, k:p.k, b:p.b, n:p.n, of:p.of }, "answer");
  /* the intro: "Here we go!" on its third beat, the count-in on its last bar's beats */
  const intro = sections.find(s => s.kind === "intro");
  if (intro) {
    add(intro.from + 2, "floatVoice", { line:"herewego" }, "line");
    countIn(intro.to).forEach(([beat, line]) => add(beat, "floatVoice", { line }, "count"));
  }
  /* the drink break: "Drink!" as it starts, the count back in its last bar */
  const drink = sections.find(s => s.kind === "drink");
  if (drink) {
    add(drink.from, "floatVoice", { line:"drink" }, "line");
    countIn(drink.to).forEach(([beat, line]) => add(beat, "floatVoice", { line }, "count"));
  }
  const order = { bar:0, answer:1, call:2, count:3, line:4 };
  events.sort((a, b) => a.beat - b.beat || order[a.kind] - order[b.kind]);
  /* a voice is cut short of the next one (`after`, seconds past its beat):
     the host's lines and the whistle's "Spin!", and the crowd's quick "Hey! Hey!" */
  shortOf(events.filter(e => e.id === "floatVoice" || e.id === "floatWhirl"));
  shortOf(events.filter(e => e.id === "floatAnswer" && e.opts.kind === "hey"));
  return events;
}
function shortOf(list) {
  list.forEach((e, i) => {
    const next = list.slice(i + 1).find(n => n.beat > e.beat);
    if (next) e.opts.after = round3(Math.min(1.5, ((next.beat - e.beat) * BEAT_MS) / 1000 - 0.03));
  });
}
const countIn = to => ["one", "two", "three", "four"].map((line, i) => [to - 4 + i, line]);
/* a spin's whistle is short when the next spin call is half a beat behind it */
const spinQuick = (calls, c) => calls.some(d => d !== c && d.kind === "spin" && d.beat > c.beat && d.beat - c.beat <= 0.5);
/* "Spin!" with the whistle on a section's first spin, and when a bar's pattern changes */
function spinSays(cues, p, sections) {
  const spins = cues.filter(q => q.cue.kind === "spin");
  const i = spins.indexOf(p);
  if (i <= 0) return true;
  const prev = spins[i - 1];
  const sec = s => sections.find(x => s.bar >= x.bar && s.bar < x.bar + x.bars)?.from;
  if (sec(prev) !== sec(p)) return true;
  if (prev.bar === p.bar) return false;
  const shape = bar => spins.filter(q => q.bar === bar).map(q => q.b).join(",");
  return shape(p.bar) !== shape(prev.bar) && p.n === 0;
}

/* ── Last Call (GROOVE.md "Last Call") ──
   Between songs at the bar: the bartender's bell and "Last call!" in the
   phase's lead (moments: the screen sounds them from a fresh room), then
   eight bars of the bar's own groove from songAt; each grab's slides (the
   glass sliding toward you, a step brighter each), the catch on its beat
   for everyone, a reveal two beats later as the offsets go up, and who
   drinks on the last bar's downbeat (the crowd's "Ooh!", the host's
   "Drink!" a beat after). Beats from the bar's songAt. */
export const LAST_CALL_BEATS = Object.freeze({ bell:-4, call:-2, reveal:2, drinks:28, drink:29 });
export function lastCallEvents(chart) {
  if (!chart?.cues) return [];
  const events = [], add = (beat, id, opts, kind) => events.push({ beat:round3(beat), id, opts, kind });
  const grabs = chart.cues;
  for (let bar = 0; bar < (chart.bars || 0); bar++) {
    const plan = barPlan(chart, bar) || { sec:"play", part:0, k:bar, len:chart.bars, next:null };
    const inThis = beat => barOf(beat) === bar;
    add(bar * B, "floatBar", { bar, ...plan, slides:grabs.flatMap(g => g.slides || []).filter(inThis).map(inBar),
      grabs:grabs.map(g => g.beat).filter(inThis).map(inBar), drinks:LAST_CALL_BEATS.drinks >= bar * B && LAST_CALL_BEATS.drinks < bar * B + B }, "bar");
  }
  grabs.forEach((g, k) => {
    (g.slides || []).forEach((beat, n, all) => add(beat, "floatSlide", { k, n, of:all.length, quick:all.length > 3 }, "call"));
    add(g.beat, "floatGrab", { k }, "answer");
    add(g.beat + LAST_CALL_BEATS.reveal, "floatReveal", { k }, "line");
  });
  add(LAST_CALL_BEATS.drinks, "floatDrinks", {}, "line");
  add(LAST_CALL_BEATS.drink, "floatVoice", { line:"drink" }, "line");
  const order = { bar:0, answer:1, call:2, count:3, line:4 };
  return events.sort((a, b) => a.beat - b.beat || order[a.kind] - order[b.kind]);
}

/* the events grouped by the bar they are laid with (each event's own bar) */
const SLOTS = new Map();
export function songSlots(chart) {
  if (!chart?.id) return [];
  const key = `${chart.id}:${chart.v ?? 1}:${chart.cues?.length ?? 0}`;
  if (!SLOTS.has(key)) {
    const slots = Array.from({ length:chart.bars || 0 }, () => []);
    for (const ev of songEvents(chart)) slots[Math.min(slots.length - 1, Math.max(0, barOf(ev.beat)))]?.push(ev);
    SLOTS.set(key, slots);
  }
  return SLOTS.get(key);
}
/* an event's cue time on the room's clock */
export const eventAt = (songAt, beat) => songAt + beat * BEAT_MS - GROOVE_PRE_MS;
/* the bar a song plays at room time t (fractional; negative before beat 0) */
export const songBar = (songAt, t) => (t - songAt) / BAR_MS;
/* the instant a song's last bar has rung */
export const songEnd = songAt => songAt + SONG_MS;

/* the drink break's beats, for the flubs (a rider who has not tapped Done is chugging) */
export function drinkBeats(chart) {
  const s = drinkSection(chart);
  return s ? { from:s.from, to:s.to } : null;
}

/* ── the lobby's loop ── */
/* eight bars on the server's own bar grid, so every screen in a room is on the same bar */
export const LOBBY_BARS = 8;
export const lobbyBar = at => ((Math.round(at / BAR_MS) % LOBBY_BARS) + LOBBY_BARS) % LOBBY_BARS;
/* its section (four, eight bars each), on the same grid */
export const lobbySection = at => ((Math.floor(Math.round(at / BAR_MS) / LOBBY_BARS) % 4) + 4) % 4;
/* the next bar line of the server's grid at or after `at` */
export const barLine = (at, anchor = 0) => anchor + Math.ceil((at - anchor) / BAR_MS) * BAR_MS;
