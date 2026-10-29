/* The Groove's music on the room's clock (pure; float/GROOVE.md "Sound (the
   Groove)"). A song is planned from its chart (float/shared/chart.js, the
   truth for every cue's beat), bar by bar:

     the band     one bar of the song a bar (soundKit floatGroove, a cut
                  recipe), told its section, the cues it answers and the
                  calls and lines it leaves room for
     the host     a call on every cue's call beat: "Ready" for a hey ("Hey"
                  twice for a double), a sung "ba" for each hop, a whirl for
                  a spin (with "Spin!" as a new pattern starts), the drop's
                  "three, two, one"; in the breakdown the rhythm a bar ahead
                  in the song's own sound (echo cues); the count-in "one,
                  two, three, four" in the intro's last bar; the practice's
                  narration (chart.lines) and "Copy me", each placed so it
                  never covers a call (narration)
     the answer   on every cue's own beat, for everyone: a kayak paddle's stroke,
                  the crowd's "Hey!", a hop's boing on its call's note, a
                  spin's whoosh, the drop's plunge; an echo in its song's sound

   Each is an event { beat, id, opts } on the song's beats from its beat 0;
   the screen lays a bar's events a bar ahead, each at
   songAt + beat * BEAT_MS - GROOVE_PRE_MS (soundKit sounds a Groove beat
   GROOVE_PRE_S after its cue's time, so a voice's soft start and a
   whoosh's swell lead into the beat). The music is the game, so it plays
   under reduced motion too.

   Between the songs: the cut's show (CUT_BEATS), the chug-off (CHUGOFF_BEATS)
   and Last Call's countdown (lastCallEvents, lastCallBeats), whose beats the
   screen and the phone land their pictures on. */
import { BEAT_MS } from "../../shared/beat.js";
import { BAR_MS, BEATS_PER_BAR, CHUGOFF, SONG_LEAD_MS, SONG_MS, breakdownSection, chartOf, sectionsOf } from "../../shared/chart.js";
import { VOICE } from "./voices.js";

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
/* The cut's show (float/GROOVE.md "After a song"). The room sends its beats
   as `room.show` (float/shared/cup.js cutShowOf: grades, awards[], line,
   outs[{ i, at }], bubble), and the sound lands on those: every rider's
   grade stamped at once on `grades` (the TV's one stamp, each phone its
   own jingle), a sting per award card, the drumroll for `roll` ms into the
   cut line, then each rider out from the bottom: their sting on their `at`
   and their song's slapstick exit `exit` after it. CUT_BEATS mirrors the
   engine's CUT_SHOW for a room that sends no show (ms from the cut's start;
   cutBeats(n, awards) spells it out). */
export const CUT_BEATS = Object.freeze({ grades:400, awards:2400, award:1200, roll:2000, after:800, gap:1400, exit:300 });
export function cutBeats(out = 0, awards = 0) {
  const C = CUT_BEATS, n = Math.max(0, out | 0), cards = Math.max(0, Math.min(3, awards | 0));
  const line = C.awards + cards * C.award;
  const outs = Array.from({ length:n }, (_, k) => line + C.after + k * C.gap);
  return { grades:C.grades, awards:Array.from({ length:cards }, (_, k) => C.awards + k * C.award), roll:line - C.roll, line,
    outs, exits:outs.map(at => at + C.exit), end:n ? outs[n - 1] + C.gap : line + 400 };
}
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

/* ── the voices' clips: their lengths place the narration ── */
const CLIPS = new Map((VOICE?.clips || []).map(c => [c.id, c]));
/* a clip's beat point and length (ms), from the manifest; an estimate when it has none */
export function clipSpan(id, text = "") {
  const c = CLIPS.get(id);
  if (c && c.dur > 0) return { onset:Math.max(0, c.onset || 0), dur:c.dur };
  const words = String(text || id || "").split(/[\s-]+/).filter(Boolean).length || 1;
  return { onset:50, dur:180 + words * 230 };
}
/* the practice's narration: a chart line's text to the host's clip */
export const LINE_CLIPS = Object.freeze({
  "paddle on 1 and 3":"say-paddle", "when i say ready you say hey":"say-readyhey", "watch":"say-watch", "your turn":"say-turn",
  "keep paddling hey on 4":"say-keephey", "both now":"say-bothnow",
  "watch the fuse":"say-watchfuse", "launch two beats after i light":"say-launchtwo", "two quick ones":"say-twoquick", "three in a row":"say-threerow",
  "hop two beats after me":"say-hoptwo", "two this time":"say-twotime", "spin one beat after me":"say-spinone",
  "on the backbeat":"say-backbeat", "all three in turn":"say-allthree", "hop":"say-hop", "spin":"say-spin", "copy me":"say-copy",
});
const lineKey = text => String(text || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
export const lineClip = text => LINE_CLIPS[lineKey(text)] || null;

/* what an echo cue sounds like: its song's own sound (The Drop mixes them:
   its first three phrases paddle, hop, spin, its last one each in turn) */
const ECHO = Object.freeze({ paddle:"paddle", rock:"hop", spin:"spin" });
function echoAs(song, phrase, n) {
  if (ECHO[song]) return ECHO[song];
  const order = ["paddle", "hop", "spin"];
  return phrase < 3 ? order[phrase] : order[n % 3];
}

/* every cue with where it sits: its bar, its beat in the bar, its section's
   bar (k), and n of `of` (its place among its bar's cues of its kind); an
   echo also its phrase (which of the breakdown's four) and its sound */
function placed(chart) {
  const out = (chart?.cues || []).map(cue => ({ cue, bar:barOf(cue.beat), b:inBar(cue.beat) }));
  for (const p of out) {
    const same = out.filter(q => q.bar === p.bar && q.cue.kind === p.cue.kind);
    p.n = same.indexOf(p); p.of = same.length;
    p.k = barPlan(chart, p.bar)?.k ?? 0;
  }
  const bd = breakdownSection(chart);
  for (const p of out) {
    if (p.cue.kind !== "echo") continue;
    p.phrase = bd ? Math.max(0, Math.floor((p.bar - bd.bar) / 2)) : 0;
    p.as = echoAs(chart.id, p.phrase, p.n);
  }
  return out;
}

/* A song's whole sound as events on its beats: [{ beat, id, opts, kind }]
   in order (kind: bar, call, answer, count, line). Last Call's countdown is
   its own (lastCallEvents). */
export function songEvents(chart) {
  if (!chart?.cues || !chart?.id) return [];
  if (chart.countdown) return lastCallEvents(chart);
  const song = chart.id, all = placed(chart), events = [];
  /* a blackout bar (chart.dark): the host's calls and the band's answers in it are out */
  const dark = darkBars(chart), lit = beat => !dark.has(barOf(beat));
  const cues = all;
  const add = (beat, id, opts, kind) => { const e = { beat:round3(beat), id, opts, kind }; events.push(e); return e; };
  /* the host's calls: one note a cue, a fixed lead before it */
  const calls = [];
  for (const p of cues) {
    const { cue } = p;
    if (cue.call === null || cue.call === undefined) continue;
    if (cue.kind === "drop") { for (let j = 0; j < 3; j++) calls.push({ beat:cue.call + j, kind:"drop", p, j }); continue; }
    calls.push({ beat:cue.call, kind:cue.kind === "echo" ? p.as : cue.kind, echo:cue.kind === "echo", p });
  }
  for (let j = calls.length - 1; j >= 0; j--) if (!lit(calls[j].beat)) calls.splice(j, 1);
  const sections = chart.sections?.length ? chart.sections : sectionsOf();
  for (const c of calls) {
    const { p } = c, base = { song, k:p.k, n:p.n, of:p.of };
    if (c.kind === "drop") add(c.beat, "floatVoice", { line:["three", "two", "one"][c.j] }, "call");
    else if (c.echo) {
      /* the host's rhythm, a bar ahead, in the song's sound */
      if (c.kind === "hop") add(c.beat, "floatVoice", { line:"ba", ...base, k:8 + p.phrase }, "call");
      else if (c.kind === "spin") add(c.beat, "floatWhirl", { song, quick:spinQuick(calls, c), say:false }, "call");
      else add(c.beat, "floatEcho", { as:c.kind, song, n:p.n, of:p.of }, "call");
    } else if (c.kind === "hey") {
      const double = cues.some(q => q !== p && q.cue.kind === "hey" && Math.abs(q.cue.beat - p.cue.beat) <= 0.5);
      add(c.beat, "floatVoice", { line:double ? "hey" : "ready", ...base }, "call");
    } else if (c.kind === "hop") add(c.beat, "floatVoice", { line:"ba", ...base }, "call");
    else if (c.kind === "spin") add(c.beat, "floatWhirl", { song, quick:spinQuick(calls, c), say:spinSays(cues, p, sections) }, "call");
    /* a rocket's call: the host lights its fuse */
    else if (c.kind === "rocket") add(c.beat, "floatFuse", { n:p.n }, "call");
  }
  for (const p of cues) {
    if (!lit(p.cue.beat)) continue;
    const echo = p.cue.kind === "echo";
    add(p.cue.beat, "floatAnswer", { kind:echo ? p.as : p.cue.kind, song, k:echo ? 8 + p.phrase : p.k, b:p.b, n:p.n, of:p.of,
      ...(echo ? { echo:true } : {}), ...(p.cue.demo ? { demo:true } : {}) }, "answer");
  }
  /* rowing under another song's move: a stroke on the beat of a host's call steps back for it */
  const called = new Set(events.filter(e => e.kind === "call").map(e => e.beat));
  for (const e of events) if (e.id === "floatAnswer" && e.opts.kind === "paddle" && !e.opts.demo && called.has(e.beat)) e.opts.under = true;
  /* after the finale's rockets the sky fills */
  const sky = skyBeat(chart);
  if (sky !== null) add(sky, "floatSky", {}, "line");
  /* the intro: the count-in on its last bar's beats */
  const intro = sections.find(s => s.kind === "intro");
  if (intro) countIn(intro.to).forEach(([beat, line]) => add(beat, "floatVoice", { line }, "count"));
  /* the narration, each line placed clear of every call */
  const said = narration(chart, events);
  for (const n of said) add(n.beat, "floatVoice", { line:n.line, ...(n.rate !== 1 ? { rate:n.rate } : {}), narration:true }, "line");
  /* the band's bars, told their cues, calls and the narration's spans */
  for (let bar = 0; bar < (chart.bars || 0); bar++) {
    const plan = barPlan(chart, bar);
    if (!plan) continue;
    const hits = cues.filter(p => p.bar === bar).map(p => [p.b, p.cue.kind === "echo" ? p.as : p.cue.kind]);
    const mine = calls.filter(c => barOf(c.beat) === bar);
    const lines = said.flatMap(n => spanIn(n.from, n.to, bar));
    const opts = { song, bar, ...plan, mode:chart.modes?.[bar] ?? null, hits, calls:[...mine.map(c => [inBar(c.beat), c.kind]), ...lines] };
    if (dark.has(bar)) opts.dark = true;
    else if (dark.has(bar - 1)) opts.back = true;
    if (plan.sec === "outro" && plan.k === 0) opts.finish = hits.length ? hits[hits.length - 1][0] : 0;
    /* the drop's countdown: the music cuts after the bar's first beat */
    if (!hits.length && mine.some(c => c.kind === "drop")) opts.cut = true;
    add(bar * B, "floatGroove", opts, "bar");
  }
  const order = { bar:0, answer:1, call:2, count:3, line:4 };
  events.sort((a, b) => a.beat - b.beat || order[a.kind] - order[b.kind]);
  /* a voice is cut short of the next one (`after`, seconds past its beat):
     the host's calls and the whistle's "Spin!", and the crowd's quick "Hey! Hey!" */
  shortOf(events.filter(e => (e.id === "floatVoice" && !e.opts.narration) || e.id === "floatWhirl"));
  shortOf(events.filter(e => e.id === "floatAnswer" && e.opts.kind === "hey"));
  /* a fuse sizzles up to the next one at most */
  shortOf(events.filter(e => e.id === "floatFuse"));
  return events;
}
/* the blackout bars (float/GROOVE.md v3 8): chart.dark's bar indices */
export function darkBars(chart) {
  return new Set((Array.isArray(chart?.dark) ? chart.dark : []).map(Number).filter(Number.isInteger));
}
/* Fireworks (float/GROOVE.md v3 9). A rider's firework bursts ROCKET_BURST_MS
   after its rocket's beat (the launch on the beat, the burst a beat later),
   panned to the rider, its size by the judgement; a miss fizzles as the room
   calls it. The screen lands the burst's picture on the same instant. */
export const ROCKET_BURST_MS = BEAT_MS;
export const BURST_SIZE = Object.freeze({ perfect:1, nice:0.75, ok:0.55, early:0.3, late:0.3 });
/* the beat the sky fills after the finale (from songAt): two beats after the
   last cue when the song ends on rockets, else null */
export function skyBeat(chart) {
  const cues = chart?.cues || [];
  const last = cues[cues.length - 1];
  if (!last || last.kind !== "rocket" || !Number.isFinite(chart?.beats)) return null;
  return Math.min(last.beat + 2, chart.beats - 2);
}
/* a narration's span in a bar, as [beat in the bar, "line", its length in beats] */
function spanIn(from, to, bar) {
  const a = Math.max(from, bar * B), b = Math.min(to, (bar + 1) * B);
  return b > a ? [[inBar(a), "line", round3(b - a)]] : [];
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

/* ── the narration (float/GROOVE.md "Practice, narrated") ──
   The host says each of chart.lines once, placed by its clip's length:
   never over a call (the host's voice, a whirl, the breakdown's rhythm) or
   the crowd's "Hey!" (NARRATION_GAP_MS clear each side); as near its
   line's beat as it can be, after it rather than before (the text goes up
   on its beat), off the riders' own beats where it can; the song's first
   line before its first cue (what to do, before anything happens: in the
   intro's first bar, ahead of the count-in). A line too long for its room
   is said a little quicker (up to NARRATION_RATE). Returns [{ text, line
   (the clip), rate, beat (where its beat point lands), from, to (the
   beats it is heard over), show (its text's beat) }]. */
export const NARRATION_GAP_MS = 40;
export const NARRATION_RATE = 1.2;
/* how far from its text a line may be said (the song's first, in the intro, aside) */
export const NARRATION_REACH_MS = 4000;
/* how long each sound holds the host's room (ms before and after its beat) */
function busySpan(e) {
  if (e.id === "floatWhirl") return [30, e.opts?.say ? Math.max(340, clipSpan("spin").dur) : 250];
  if (e.id === "floatEcho") return [30, 260];
  /* a fuse: its strike (the sizzle may sit under a line) */
  if (e.id === "floatFuse") return [30, 200];
  /* the crowd's Hey: its shout (its tail may sit under a line) */
  if (e.id === "floatAnswer") return [60, 310];
  const span = clipSpan(e.opts?.line);
  /* "Ready?" holds the room until the crowd answers it: nothing is said between a call and its Hey */
  if (e.opts?.line === "ready" || e.opts?.line === "hey") return [Math.min(150, span.onset), 2 * BEAT_MS + 310];
  return [Math.min(150, span.onset), Math.max(120, span.dur - span.onset) / (e.opts?.rate || 1)];
}
export function narration(chart, events = null) {
  const lines = (chart?.lines || []).map(line => ({ ...line, line:lineClip(line.text) })).filter(line => line.line);
  if (!lines.length) return [];
  const evs = events || songEvents({ ...chart, lines:[] });
  const busy = evs.filter(e => (e.id === "floatVoice" && !e.opts?.narration) || e.id === "floatWhirl" || e.id === "floatEcho" || e.id === "floatFuse"
    || (e.id === "floatAnswer" && e.opts?.kind === "hey"))
    .map(e => { const [pre, post] = busySpan(e), t = e.beat * BEAT_MS; return [t - pre - NARRATION_GAP_MS, t + post + NARRATION_GAP_MS]; });
  const played = (chart.cues || []).filter(cue => !cue.demo).map(cue => cue.beat * BEAT_MS);
  /* the first thing to watch or play (a demo too) */
  const firstCue = chart.cues?.length ? Math.min(...chart.cues.map(cue => cue.beat * BEAT_MS)) : Infinity;
  const out = [];
  lines.forEach((line, k) => {
    const span = clipSpan(line.line, line.text), s0 = line.beat * BEAT_MS;
    const until = Number.isFinite(line.until) ? line.until * BEAT_MS : s0 + BAR_MS * 2;
    let best = null;
    for (const rate of [1, 1.1, NARRATION_RATE]) {
      const dur = span.dur / rate;
      const taken = [...busy, ...out.map(n => [n.from * BEAT_MS - 80, n.to * BEAT_MS + 80])].sort((a, b) => a[0] - b[0]);
      /* the free room between the busy spans, from just after beat 0 */
      const gaps = [];
      let from = 100;
      for (const [a, b] of taken) { if (a > from) gaps.push([from, a]); from = Math.max(from, b); }
      gaps.push([from, Infinity]);
      for (const [g0, g1] of gaps) {
        if (g1 - g0 < dur) continue;
        for (const s of new Set([Math.min(Math.max(s0, g0), g1 - dur), g0, g1 - dur].filter(Number.isFinite))) {
          if (s < g0 || s + dur > g1) continue;
          if (k === 0 && s + dur > firstCue - 100) continue;
          /* near its text: a line said far from it would be about something else */
          if (k > 0 && Math.abs(s - s0) > NARRATION_REACH_MS) continue;
          const over = played.filter(t => t > s + 20 && t < s + dur - 20).length;
          const score = Math.abs(s - s0) * (s < s0 ? 1.5 : 1) + over * 400 + (s + dur > until ? 1500 : 0) + (rate - 1) * 4000;
          if (!best || score < best.score) best = { s, score, rate, dur };
        }
      }
    }
    if (best) out.push({ text:line.text, line:line.line, rate:best.rate, beat:Math.round(best.s + span.onset / best.rate) / BEAT_MS,
      from:round3(best.s / BEAT_MS), to:round3((best.s + best.dur) / BEAT_MS), show:line.beat });
  });
  return out;
}

/* ── Last Call (float/GROOVE.md "Last Call: the countdown") ──
   The bar closes at zero. In the intro the bar's own groove (walking
   upright, brushes) under the bartender's bell and "Last call!", and on the
   first Last Call the bartender saying what it is; the band stops as the
   count starts. Then the bartender says each number with `say` (his voice,
   not the host's), a clock tick on each `tick`, the trick's slapstick at
   `hideAt` (lights: the cord pulled and the power going down; slow: the
   clock winding down; ticks: the foam spilling over it), and nothing once
   it is dark: no tick, no number, no bell at zero. The bell rings only at
   `revealAt` (the offsets go up), the verdict's sting at `verdictAt`.
   LAST_CALL_BEATS (ms from songAt): the bell, "Last call!" and the first
   one's explanation; lastCallBeats(chart) spells out every moment. */
export const LAST_CALL_BEATS = Object.freeze({ bell:0, call:600, explain:1800 });
export function lastCallBeats(chart) {
  const cd = chart?.countdown;
  if (!cd) return null;
  return { trick:cd.trick, first:!!cd.first, bell:LAST_CALL_BEATS.bell, call:LAST_CALL_BEATS.call, explain:cd.first ? LAST_CALL_BEATS.explain : null,
    count:cd.introMs, steps:cd.steps.map(s => ({ n:s.n, at:s.at, say:!!s.say, tick:!!s.tick, show:!!s.show })),
    hide:cd.hideAt, zero:cd.zeroAt, reveal:cd.revealAt, verdict:cd.verdictAt };
}
export function lastCallEvents(chart) {
  const cd = chart?.countdown;
  if (!cd) return [];
  const events = [], add = (ms, id, opts, kind) => events.push({ beat:round3(ms / BEAT_MS), id, opts, kind });
  /* the bar's groove under the intro, stopping as the count starts */
  const bars = Math.ceil(cd.introMs / BAR_MS);
  for (let bar = 0; bar < bars; bar++) add(bar * BAR_MS, "floatBar", { bar, len:round3(Math.min(B, (cd.introMs - bar * BAR_MS) / BEAT_MS)) }, "bar");
  add(LAST_CALL_BEATS.bell, "floatBell", { first:true }, "line");
  add(LAST_CALL_BEATS.call, "floatBarVoice", { line:"bar-lastcall" }, "line");
  if (cd.first) add(LAST_CALL_BEATS.explain, "floatBarVoice", { line:"bar-explain" }, "line");
  cd.steps.forEach((step, k) => {
    /* a count said quicker than a second (rush) takes the bartender's quick take of it */
    const gap = (cd.steps[k + 1]?.at ?? cd.zeroAt) - step.at;
    const quick = gap < 900 && CLIPS.has(`bar-${step.n}q`);
    if (step.say) add(step.at, "floatBarVoice", { line:`bar-${step.n}${quick ? "q" : ""}` }, "count");
    if (step.tick) add(step.at, "floatTick", { n:step.n }, "count");
  });
  add(cd.hideAt, "floatTrick", { trick:cd.trick }, "line");
  add(cd.revealAt, "floatZero", {}, "line");
  add(cd.verdictAt, "floatDrinks", {}, "line");
  const order = { bar:0, answer:1, call:2, count:3, line:4 };
  return events.sort((a, b) => a.beat - b.beat || order[a.kind] - order[b.kind]);
}

/* ── the chug-off (float/GROOVE.md "The chug-off") ──
   ms from the phase's start, and from goAt: the host's "Chug-off!", the
   first chug-off's rule, "three, two, one" on the beats before goAt and
   "Chug!" on it, the room chanting from goAt until the first Done; the
   winner's stamp as the room names them, the loser's exit REVEAL_MS later.
   The plan follows the room's own intro (goAt - startAt): the first one
   says its rule only when the intro holds it and the count (about 6 s; the
   room's 4 s does not, so it counts like the rest), and a drumroll stands
   in for the count when there is no room for it. */
export const CHUGOFF_BEATS = Object.freeze({ call:150, explain:1000, count:Object.freeze([-1500, -1000, -500]), chug:0, exit:CHUGOFF.REVEAL_MS });
export function chugoffPlan(intro = CHUGOFF.INTRO_MS, { first = false } = {}) {
  const ms = Number.isFinite(intro) && intro > 0 ? intro : CHUGOFF.INTRO_MS;
  const rule = clipSpan("chug-explain");
  const fits = CHUGOFF_BEATS.explain + rule.dur - Math.min(150, rule.onset) + 150 <= ms + CHUGOFF_BEATS.count[0];
  const call = CHUGOFF_BEATS.call, explain = first && fits ? CHUGOFF_BEATS.explain : null;
  /* the rule ends this long before the count (or "Chug!") */
  const clear = explain === null ? call + clipSpan("chugoff").dur + 100 : explain + clipSpan("chug-explain").dur + 150;
  const count = CHUGOFF_BEATS.count.map(at => ms + at);
  const counts = count.every(at => at >= clear);
  return { call, explain, count:counts ? count : [], roll:counts ? null : Math.min(ms - 300, Math.max(clear, ms - 1500)), chug:ms };
}

/* the events grouped by the bar they are laid with (each event's own bar) */
const SLOTS = new Map();
export function songSlots(chart) {
  if (!chart?.id) return [];
  const key = `${chart.id}:${chart.v ?? 1}:${chart.cues?.length ?? 0}:${chart.lines?.length ?? 0}:${(chart.dark || []).join(".")}`;
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

/* ── the lobby's loop ── */
/* eight bars on the server's own bar grid, so every screen in a room is on the same bar */
export const LOBBY_BARS = 8;
export const lobbyBar = at => ((Math.round(at / BAR_MS) % LOBBY_BARS) + LOBBY_BARS) % LOBBY_BARS;
/* its section (four, eight bars each), on the same grid */
export const lobbySection = at => ((Math.floor(Math.round(at / BAR_MS) / LOBBY_BARS) % 4) + 4) % 4;
/* the next bar line of the server's grid at or after `at` */
export const barLine = (at, anchor = 0) => anchor + Math.ceil((at - anchor) / BAR_MS) * BAR_MS;
