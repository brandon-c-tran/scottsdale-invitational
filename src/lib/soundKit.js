/* The Field Day kit (A2): every sound is synthesized at runtime from
   oscillators and filtered noise, so there are no files, nothing to license
   and nothing to host. A faithful port of the approved prototype
   (delight3/audio-prototypes.html): the same materials, recipes, levels and
   rooms. Pure functions over an engine; the engine wraps any BaseAudioContext,
   so the same code renders live in src/lib/sound.js and offline in the
   preview's self-test.

   One palette, one key: clay chips, felt, a wooden knock, a card flick, a low
   frame drum, a celesta-like sun-bell and a low bowl; every pitched note is in
   D (D, E, F sharp, A, B). The motif is A, D, F sharp.

   Nothing here reads tournament state or the DOM. */

import { INTRO_TIMING } from "../features/intro/introTiming.js";

export const NOTE = Object.freeze({ D2:73.42, A2:110, D3:146.83, A3:220, D4:293.66, E4:329.63, Fs4:369.99,
  A4:440, B4:493.88, D5:587.33, E5:659.25, Fs5:739.99, A5:880, B5:987.77, D6:1174.66, E6:1318.51, Fs6:1479.98,
  A6:1760 });

/* The chip rain's ladder: each chip that lands on your pile clacks one step
   higher up D major (D E F# A B D'...). */
export const LADDER = Object.freeze([NOTE.D4, NOTE.E4, NOTE.Fs4, NOTE.A4, NOTE.B4, NOTE.D5, NOTE.E5, NOTE.Fs5,
  NOTE.A5, NOTE.B5, NOTE.D6, NOTE.E6, NOTE.Fs6, NOTE.A6]);
export const ladderNote = step => LADDER[Math.max(0, Math.min(LADDER.length - 1, Math.floor(Number(step) || 0)))];

/* The thirteen-phone chord: at the crown's flood every phone sounds one
   sustained sun-bell by its final rank, low (13th) to high (the champion),
   so the room becomes one D chord. */
export const CROWN_CHORD = Object.freeze([NOTE.D3, NOTE.A3, NOTE.D4, NOTE.Fs4, NOTE.A4, NOTE.B4, NOTE.D5, NOTE.Fs5,
  NOTE.A5, NOTE.B5, NOTE.D6, NOTE.Fs6, NOTE.A6]);
/* rank 1 of n takes the top note and last place the bottom D; a shorter
   field spreads across the same span, so the chord keeps its root and top */
export function chordNote(rank, count = CROWN_CHORD.length) {
  const top = CROWN_CHORD.length - 1;
  const n = Math.max(1, Math.floor(Number(count) || 1));
  const r = Math.max(1, Math.min(n, Math.floor(Number(rank) || n)));
  if (n === 1) return CROWN_CHORD[top];
  return CROWN_CHORD[Math.round((n - r) * top / (n - 1))];
}

/* A8: the room follows the weekend's session (weekendPhase keys): a drier,
   brighter pool Friday; a longer, warmer tail at night; the finale longest. */
export const ROOMS = Object.freeze({
  fri:Object.freeze({ len:1.0, decay:3.2, tone:5200, wet:0.16 }),
  sam:Object.freeze({ len:0.8, decay:3.6, tone:6000, wet:0.12 }),
  sap:Object.freeze({ len:1.2, decay:3.0, tone:4200, wet:0.18 }),
  san:Object.freeze({ len:1.8, decay:2.6, tone:2900, wet:0.25 }),
  fin:Object.freeze({ len:2.2, decay:2.4, tone:2500, wet:0.28 }),
});
export const roomKeyFor = phase => Object.prototype.hasOwnProperty.call(ROOMS, phase) ? phase : "fri";
export const roomForPhase = phase => ROOMS[roomKeyFor(phase)];

/* the reverb send is cut on a phone speaker, which is an arm's length away */
export const PHONE_WET = 0.45;
export const wetLevel = (room, listen) => roomForPhase(room).wet * (listen === "phone" ? PHONE_WET : 1);
/* a phone speaker: nothing under ~380 Hz, mono */
export const highpassFor = listen => listen === "phone" ? 380 : 25;

const rnd = (a, b) => a + Math.random() * (b - a);
const clampPan = pan => Math.max(-1, Math.min(1, Number(pan) || 0));

function makeIR(ctx, len, decay) {
  const n = Math.max(1, Math.floor(ctx.sampleRate * len));
  const pre = Math.floor(ctx.sampleRate * 0.012);
  const b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = pre; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
  }
  return b;
}

/* master -> highpass -> gentle compressor -> destination; every voice goes
   through the hush gate (walkout, Quick Draw) before the master, dry and
   through the room. `out` is where the engine lands (a context's destination
   by default). */
export function makeEngine(ctx, { room = "fri", listen = "tv", volume = 0.8, out = null } = {}) {
  const E = { ctx, listen, pan:0 };
  E.master = ctx.createGain(); E.master.gain.value = volume;
  E.hp = ctx.createBiquadFilter(); E.hp.type = "highpass"; E.hp.frequency.value = 25;
  E.comp = ctx.createDynamicsCompressor();
  E.comp.threshold.value = -12; E.comp.knee.value = 10; E.comp.ratio.value = 4;
  E.comp.attack.value = 0.002; E.comp.release.value = 0.18;
  E.master.connect(E.hp); E.hp.connect(E.comp); E.comp.connect(out || ctx.destination);
  E.hush = ctx.createGain(); E.hush.gain.value = 1; E.hush.connect(E.master);
  E.dry = ctx.createGain(); E.dry.connect(E.hush);
  /* the open path: straight to the master, past the walkout duck */
  E.openDry = ctx.createGain(); E.openDry.connect(E.master);
  E.wet = ctx.createGain();
  E.conv = ctx.createConvolver();
  E.wetTone = ctx.createBiquadFilter(); E.wetTone.type = "lowpass";
  E.wetOut = ctx.createGain();
  E.wet.connect(E.conv); E.conv.connect(E.wetTone); E.wetTone.connect(E.wetOut); E.wetOut.connect(E.hush);
  const n = ctx.sampleRate * 2;
  E.noise = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = E.noise.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  setRoom(E, room); setListen(E, listen);
  return E;
}
export function setRoom(E, key) {
  const k = roomKeyFor(key);
  if (E.roomKey === k && E.conv.buffer) return;
  const r = ROOMS[k];
  E.roomKey = k;
  E.conv.buffer = makeIR(E.ctx, r.len, r.decay);
  E.wetTone.frequency.value = r.tone;
  E.wetOut.gain.value = wetLevel(k, E.listen);
}
export function setListen(E, listen) {
  E.listen = listen;
  E.hp.frequency.value = highpassFor(listen);
  E.wetOut.gain.value = wetLevel(E.roomKey, listen);
}

/* ── node lifetime ──
   The TV runs for days, so every node a recipe builds is disconnected once
   its sources have all ended. playRecipe opens a graph; each node made while
   it is open is kept (track), each source counts (trackSource), and the
   last source's onended disconnects the lot. The reverb is the engine's own
   shared convolver, so a voice leaving it never cuts a tail already in it;
   every envelope has reached silence before its source stops. */
function track(E, ...nodes) {
  if (E.graph) E.graph.nodes.push(...nodes);
}
function trackSource(E, src) {
  const graph = E.graph;
  if (!graph) return;
  graph.pending++;
  src.onended = () => {
    src.onended = null;
    if (--graph.pending === 0 && graph.closed) releaseGraph(graph);
  };
}
function releaseGraph(graph) {
  for (const node of graph.nodes) { try { node.disconnect(); } catch {} }
  graph.nodes.length = 0;
}

/* one voice: gain -> tone -> pan -> dry + reverb send. The engine's own
   `pan` (stereo placement by canvas x) adds to the recipe's. */
function voice(E, { pan = 0, send = 0.2, bright = 1, gain = 1 } = {}) {
  const c = E.ctx;
  const g = c.createGain(); g.gain.value = gain;
  const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 0.5;
  lp.frequency.value = Math.min(18000, 13000 * bright);
  const p = c.createStereoPanner(); p.pan.value = E.listen === "phone" ? 0 : clampPan(pan + (E.pan || 0));
  const s = c.createGain(); s.gain.value = send;
  /* an open recipe (a walkout's stinger, the crown) is not ducked under the
     win song: its dry voice skips the hush gate */
  g.connect(lp); lp.connect(p); p.connect(E.open && E.openDry ? E.openDry : E.dry); p.connect(s); s.connect(E.wet);
  track(E, g, lp, p, s);
  return g;
}
/* A phone speaker passes nothing under ~380 Hz, so a low body (a drum, the
   felt, a knock, a bowl) would vanish. On a phone the body is implied by a
   few of its harmonics above the cut (the ear rebuilds the missing
   fundamental); the TV never runs this. */
export const PHANTOM = Object.freeze({ floor:400, ceil:1500, partials:4 });
export function phantomPartials(f, listen = "phone") {
  if (listen !== "phone" || !(f > 0) || f >= PHANTOM.floor) return [];
  const out = [];
  for (let n = Math.max(2, Math.ceil(PHANTOM.floor / f)); n * f <= PHANTOM.ceil && out.length < PHANTOM.partials; n++)
    out.push({ n, f:n * f, amp:0.55 / (out.length + 1) });
  return out;
}
function phantom(E, dest, t, f, d, peak, { a = 0.002 } = {}) {
  for (const [k, part] of phantomPartials(f, E.listen).entries())
    mode(E, dest, t, part.f, Math.max(0.02, d * (0.8 - k * 0.14)), peak * part.amp, { a });
}
/* a damped sine mode, optionally dropping in pitch as it strikes */
function mode(E, dest, t, f, d, peak, { a = 0.001, drop = 0, type = "sine" } = {}) {
  const c = E.ctx;
  const o = c.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f * (1 + drop), t);
  if (drop) o.frequency.exponentialRampToValueAtTime(f, t + Math.min(0.08, d * 0.6));
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  o.connect(g); g.connect(dest);
  track(E, o, g); trackSource(E, o);
  o.start(t); o.stop(t + a + d + 0.03);
}
/* a filtered noise burst */
function burst(E, dest, t, { type = "bandpass", f = 2000, q = 1, d = 0.02, peak = 0.5, a = 0.0008 } = {}) {
  const c = E.ctx;
  const s = c.createBufferSource(); s.buffer = E.noise;
  const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  s.connect(fl); fl.connect(g); g.connect(dest);
  track(E, s, fl, g); trackSource(E, s);
  s.start(t, Math.random() * 1.5, a + d + 0.05);
}
/* chips sliding on felt: a noise band that swells and sweeps */
function swell(E, dest, t, { d = 0.6, f0 = 500, f1 = 900, q = 0.7, peak = 0.2 } = {}) {
  const c = E.ctx;
  const s = c.createBufferSource(); s.buffer = E.noise;
  const fl = c.createBiquadFilter(); fl.type = "bandpass"; fl.Q.value = q;
  fl.frequency.setValueAtTime(f0, t); fl.frequency.linearRampToValueAtTime(f1, t + d);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + d * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  s.connect(fl); fl.connect(g); g.connect(dest);
  track(E, s, fl, g); trackSource(E, s);
  s.start(t, Math.random() * 0.5, d + 0.05);
}

/* ── materials ── */
export const M = {
  /* clay chip on chip: a bright contact, two short body modes, and usually a second softer contact */
  clack(E, t, o = {}) {
    const p = (o.pitch || 1) * rnd(0.96, 1.04);
    const v = voice(E, { pan:o.pan || 0, send:o.send ?? 0.12, bright:o.bright ?? 1, gain:o.gain ?? 1 });
    burst(E, v, t, { f:3300 * p, q:2.2, d:0.016, peak:0.5 });
    mode(E, v, t, 2380 * p, 0.04, 0.24); mode(E, v, t, 3960 * p, 0.026, 0.13);
    mode(E, v, t, 5650 * p, 0.014, 0.05); mode(E, v, t, 250 * p, 0.022, 0.2);
    if (o.double !== false) {
      const t2 = t + rnd(0.009, 0.016);
      burst(E, v, t2, { f:3000 * p, q:2, d:0.012, peak:0.2 }); mode(E, v, t2, 2450 * p, 0.025, 0.09);
    }
  },
  /* a chip or hand landing on felt */
  felt(E, t, o = {}) {
    const v = voice(E, { pan:o.pan || 0, send:0.1, bright:0.6, gain:o.gain ?? 1 });
    burst(E, v, t, { type:"lowpass", f:520, q:0.7, d:0.09, peak:0.7 });
    mode(E, v, t, 92, 0.13, 0.55, { drop:0.5 });
    phantom(E, v, t, 92, 0.1, 0.5);
  },
  /* knuckle on a wooden table */
  knock(E, t, o = {}) {
    const p = (o.pitch || 1) * rnd(0.98, 1.02);
    const v = voice(E, { pan:o.pan || 0, send:0.18, bright:0.8, gain:o.gain ?? 1 });
    mode(E, v, t, 185 * p, 0.11, 0.55, { drop:0.25 });
    phantom(E, v, t, 185 * p, 0.09, 0.45);
    mode(E, v, t, 530 * p, 0.05, 0.2);
    burst(E, v, t, { f:1500 * p, q:1.3, d:0.014, peak:0.3 });
  },
  /* a card turning over */
  tick(E, t, o = {}) {
    const v = voice(E, { pan:o.pan || 0, send:0.15, bright:1, gain:o.gain ?? 1 });
    burst(E, v, t, { type:"highpass", f:2600, q:0.7, d:0.011, peak:0.32 });
    burst(E, v, t + 0.004, { f:850, q:0.9, d:0.026, peak:0.14 });
    mode(E, v, t, 1650 * (o.pitch || 1), 0.012, 0.06);
  },
  /* a card set down hard in its seat */
  slap(E, t, o = {}) {
    const v = voice(E, { pan:o.pan || 0, send:0.16, bright:0.8, gain:o.gain ?? 1 });
    burst(E, v, t, { f:1150, q:0.6, d:0.055, peak:0.75 });
    burst(E, v, t, { type:"lowpass", f:400, q:0.7, d:0.08, peak:0.5 });
    mode(E, v, t, 110, 0.09, 0.35, { drop:0.4 });
    phantom(E, v, t, 110, 0.08, 0.35);
  },
  /* the sun-bell: celesta-like, harmonic, warm, short strike */
  bell(E, t, f, o = {}) {
    const dec = o.dec || 2.4;
    const v = voice(E, { pan:o.pan || 0, send:o.send ?? 0.38, bright:1, gain:o.gain ?? 1 });
    [[1, 0.24, dec], [2.0, 0.07, dec * 0.45], [3.0, 0.022, dec * 0.3], [4.07, 0.035, dec * 0.14], [6.1, 0.012, dec * 0.07]]
      .forEach(([r, amp, d]) => mode(E, v, t, f * r * (1 + rnd(-0.0008, 0.0008)), d, amp, { a:0.003 }));
    mode(E, v, t, f * 1.0025, dec * 0.8, 0.08, { a:0.003 });
    /* a low bell on a phone: its own upper harmonics carry it */
    if (f < PHANTOM.floor) phantom(E, v, t, f, dec * 0.5, 0.2, { a:0.003 });
    burst(E, v, t, { type:"highpass", f:4000, d:0.005, peak:0.04 });
  },
  /* a low singing bowl: inharmonic, slow beating */
  bowl(E, t, f, o = {}) {
    const dec = o.dec || 4.5;
    const v = voice(E, { pan:o.pan || 0, send:0.45, bright:0.9, gain:o.gain ?? 1 });
    [[1, 0.22, dec], [1.004, 0.12, dec], [2.71, 0.08, dec * 0.55], [5.15, 0.03, dec * 0.3]]
      .forEach(([r, amp, d]) => mode(E, v, t, f * r, d, amp, { a:0.006 }));
    phantom(E, v, t, f, dec * 0.4, 0.16, { a:0.006 });
    burst(E, v, t, { type:"lowpass", f:600, d:0.03, peak:0.12 });
  },
  /* a low frame drum, felt beater */
  drum(E, t, o = {}) {
    const f = o.f || 68;
    const v = voice(E, { pan:o.pan || 0, send:o.send ?? 0.2, bright:0.5, gain:o.gain ?? 1 });
    mode(E, v, t, f, o.dec || 0.55, 0.85, { drop:1.4, a:0.002 });
    mode(E, v, t, f * 1.59, 0.16, 0.18, { drop:0.3 });
    phantom(E, v, t, f, Math.min(0.3, (o.dec || 0.55) * 0.5), 0.6);
    burst(E, v, t, { type:"lowpass", f:900, d:0.03, peak:0.25 });
  },
};
/* chips gathered into a stack; returns its length in seconds */
export function riffle(E, t, n, o = {}) {
  const gap = o.gap || 0.045;
  let x = 0;
  for (let i = 0; i < n; i++) {
    M.clack(E, t + x, { pitch:(o.pitch || 1) * (1 - i * 0.008), gain:(o.gain ?? 0.8) * (0.9 - i * 0.03),
      bright:o.bright ?? 1, pan:o.pan || 0, double:i === n - 1 });
    x += gap * rnd(0.85, 1.2);
  }
  return x;
}
/* a chip spinning down flat, like a coin: the contacts close in */
export function spinDown(E, t, o = {}) {
  const dur = o.dur || 1.1, g = o.gain ?? 0.8;
  let dt = 0.11, x = 0, i = 0;
  while (x < dur && i < 90) {
    const k = x / dur;
    M.clack(E, t + x, { pitch:1.05 - 0.1 * k, gain:g * (0.3 + 0.4 * k), bright:0.55, double:false, pan:o.pan || 0 });
    x += dt; dt = Math.max(0.009, dt * 0.9); i++;
  }
  M.felt(E, t + x + 0.01, { gain:0.45 * g });
}
/* a soft mallet roll that swells */
export function roll(E, t, o = {}) {
  const dur = o.dur || 0.6, from = o.from ?? 0.08, to = o.to ?? 0.55;
  const hits = Math.floor(dur * 24);
  for (let i = 0; i < hits; i++) {
    const k = i / Math.max(1, hits - 1);
    M.drum(E, t + i / 24 + rnd(-0.006, 0.006), { f:(o.f || 66) * rnd(0.99, 1.01), dec:0.16, gain:from + (to - from) * k * k, send:0.3 });
  }
}

/* ── the game intros (S2) ──
   Seconds from the announcement, on introTiming.js's beats: the move
   starts at INTRO_TIMING.play and lands on INTRO_TIMING.hit. Every pitched
   note stays in D. */
const HIT = INTRO_TIMING.hit / 1000, PLAY = INTRO_TIMING.play / 1000;
const bloop = (E, t, f, gain = 0.4) => { const v = voice(E, { send:0.2, bright:0.7, gain });
  mode(E, v, t, f * 1.5, 0.16, 0.5, { drop:-0.33 }); };
const bounce = (E, t, gain = 0.7, pitch = 1) => { M.drum(E, t, { f:118 * pitch, dec:0.12, gain }); M.felt(E, t + 0.004, { gain:gain * 0.6 }); };
const swish = (E, t, gain = 0.35) => burst(E, voice(E, { send:0.25, bright:1, gain }), t, { type:"bandpass", f:3400, q:0.8, d:0.26, peak:0.6 });
const hum = (E, t, d, f0, f1, peak = 0.06) => swell(E, voice(E, { send:0.2, bright:0.6 }), t, { d, f0, f1, q:1.2, peak });
export const INTRO_FOLEY = Object.freeze({
  putting:(E, t) => { M.knock(E, t + PLAY, { pitch:1.7, gain:0.45 }); M.clack(E, t + PLAY + 0.004, { pitch:0.8, gain:0.4, double:false });
    hum(E, t + PLAY, HIT - PLAY - 0.1, 320, 210, 0.05);
    M.clack(E, t + HIT - 0.09, { pitch:0.7, gain:0.35, double:false }); M.clack(E, t + HIT - 0.05, { pitch:0.66, gain:0.3, double:false });
    M.knock(E, t + HIT, { pitch:0.72, gain:0.7 }); },
  die:(E, t) => { whoosh(E, t + PLAY, { d:0.4, peak:0.12 }); M.knock(E, t + 1.38, { gain:0.8 });
    M.knock(E, t + 1.6, { pitch:1.2, gain:0.25 }); bloop(E, t + HIT, NOTE.D5); burst(E, voice(E, { gain:0.3 }), t + HIT + 0.02, { type:"highpass", f:2600, d:0.12, peak:0.3 }); },
  where:(E, t) => { M.tick(E, t + PLAY); for (let i = 0; i < 9; i++) M.tick(E, t + PLAY + 0.1 + i * 0.1 * (1 - i * 0.05), { gain:0.3, pitch:1.3 });
    hum(E, t + HIT - 0.35, 0.34, 2400, 800, 0.08); M.felt(E, t + HIT, { gain:0.8 }); M.knock(E, t + HIT + 0.005, { gain:0.6 }); },
  "basketball:5v5":(E, t) => { bounce(E, t + 0.45, 0.5); whoosh(E, t + PLAY + 0.05, { d:0.5, peak:0.14 }); swish(E, t + HIT, 0.45); },
  pickleball:(E, t) => { M.knock(E, t + 0.9, { pitch:1.9, gain:0.6 }); M.clack(E, t + 0.902, { pitch:0.75, gain:0.5, double:false });
    M.knock(E, t + HIT, { pitch:1.6, gain:0.4 }); M.knock(E, t + HIT + 0.24, { pitch:1.6, gain:0.22 }); },
  "basketball:1v1":(E, t) => { bounce(E, t + 0.475); bounce(E, t + 0.825); swish(E, t + HIT, 0.45);
    bounce(E, t + 2.15, 0.55); bounce(E, t + 2.4, 0.35); },
  volleyball:(E, t) => { M.felt(E, t + PLAY, { gain:0.5 }); M.slap(E, t + 1.3, { gain:0.9 }); whoosh(E, t + 1.32, { d:0.4, peak:0.16 });
    M.felt(E, t + HIT, { gain:1 }); burst(E, voice(E, { gain:0.4, bright:0.5 }), t + HIT, { type:"lowpass", f:900, d:0.2, peak:0.4 }); },
  trivia:(E, t) => { M.tick(E, t + 0.9); M.tick(E, t + 1.05, { pitch:1.2 });
    for (let i = 0; i < 8; i++) M.bell(E, t + 0.9 + i * 0.11, ladderNote(i % 4 + 3), { gain:0.12, dec:0.3, send:0.15 });
    const v = voice(E, { send:0.15, bright:0.35, gain:0.5 }); mode(E, v, t + HIT, NOTE.A3, 0.4, 0.09, { type:"sawtooth", a:0.004 });
    mode(E, v, t + HIT, NOTE.A2, 0.4, 0.07, { type:"square", a:0.004 }); },
  "8ball":(E, t) => { M.clack(E, t + 1.05, { pitch:0.8, gain:0.7 }); M.knock(E, t + 1.05, { pitch:1.4, gain:0.3 });
    riffle(E, t + 1.25, 8, { pitch:1.25, gap:0.022, gain:0.75 }); M.clack(E, t + 1.5, { pitch:1.2, gain:0.25, double:false });
    M.knock(E, t + HIT, { pitch:0.78, gain:0.75 }); M.drum(E, t + HIT + 0.01, { f:110, dec:0.15, gain:0.45 }); },
  pong:(E, t) => { whoosh(E, t + PLAY, { d:0.35, peak:0.06 }); bloop(E, t + HIT, NOTE.A4, 0.5);
    burst(E, voice(E, { gain:0.25 }), t + HIT + 0.01, { type:"highpass", f:3000, d:0.1, peak:0.3 }); M.knock(E, t + HIT + 0.08, { pitch:1.5, gain:0.2 }); },
  ragecage:(E, t) => { M.knock(E, t + 1.15, { pitch:1.6, gain:0.5 }); bloop(E, t + 1.35, NOTE.D5, 0.35);
    M.knock(E, t + 1.2, { pitch:1.7, gain:0.3 }); hum(E, t + 1.45, 0.34, 600, 1300, 0.05);
    M.slap(E, t + HIT, { gain:0.9 }); M.knock(E, t + HIT + 0.01, { pitch:1.2, gain:0.6 }); },
  beerio:(E, t) => { const v = voice(E, { send:0.15, bright:0.4, gain:0.35 });
    mode(E, v, t + 0.5, NOTE.A2, 1.5, 0.08, { type:"sawtooth", drop:-0.25, a:0.2 }); mode(E, v, t + 0.5, NOTE.D3, 1.5, 0.05, { type:"square", drop:-0.25, a:0.2 });
    burst(E, voice(E, { gain:0.25 }), t + 1.3, { type:"bandpass", f:2600, q:3, d:0.32, peak:0.3 });
    M.bell(E, t + HIT, NOTE.D5, { gain:0.35, dec:0.8 }); M.bell(E, t + HIT + 0.09, NOTE.Fs5, { gain:0.35, dec:0.8 }); },
  poker:(E, t) => { M.tick(E, t + PLAY); M.tick(E, t + PLAY + 0.16);
    for (let i = 0; i < 17; i++) M.clack(E, t + 1.0 + i * 0.045 + (i > 4 ? 0.02 : 0), { pitch:1 - (i % 6) * 0.02, gain:0.4, double:false });
    M.tick(E, t + HIT - 0.12, { pitch:1.1 }); M.tick(E, t + HIT - 0.04, { pitch:1.15 }); },
  mark:(E, t) => { hum(E, t + PLAY, HIT - PLAY, 1200, 400, 0.05); M.felt(E, t + HIT, { gain:0.8 }); M.knock(E, t + HIT + 0.01, { gain:0.6 }); },
});
/* the backlight catching (relay clicks under a rising hum), then the game's
   move, then the name: the frame drum and the motif A, D, F sharp */
function gameIntro(E, t, o = {}) {
  const chord = at => { M.drum(E, at, { f:NOTE.D2, dec:0.8, gain:0.75 }); M.slap(E, at, { gain:0.35 });
    M.bell(E, at + 0.01, NOTE.A4, { gain:0.55, dec:2.6 }); M.bell(E, at + 0.07, NOTE.D5, { gain:0.5, dec:2.6 });
    M.bell(E, at + 0.14, NOTE.Fs5, { gain:0.42, dec:3 }); };
  if (o.summary) { chord(t); return; }
  M.knock(E, t, { pitch:0.7, gain:0.4 });
  [0.09, 0.15, 0.26, 0.34].forEach((dt, i) => M.tick(E, t + dt, { gain:0.25 + i * 0.05, pitch:0.9 }));
  hum(E, t, 0.6, 180, 900, 0.07);
  (INTRO_FOLEY[o.game] || INTRO_FOLEY.mark)(E, t);
  chord(t + HIT);
  M.bell(E, t + INTRO_TIMING.sweep / 1000 + 0.3, NOTE.A5, { gain:0.14, dec:1.6, send:0.4 });
}

/* ── the kit ──
   where: tv (the room), phone (the owner's own moments), gm (the
   commissioner's phone). ms: roughly how long it rings. */
export const KIT = Object.freeze([
  { id:"S1", name:"Field Day call", where:["tv"], ms:900,
    play:(E, t) => { M.drum(E, t, { f:NOTE.D2, dec:0.9, gain:0.7 }); M.bell(E, t, NOTE.A4, { gain:0.8 });
      M.bell(E, t + 0.17, NOTE.D5, { gain:0.75 }); M.bell(E, t + 0.34, NOTE.Fs5, { gain:0.7, dec:3.2 }); } },
  /* the game intro: the backlight catching, the game's own move on the
     intro's beats (introFoley), and the name's chord on the hit; opts.game
     is the intro scene, opts.summary (reduced motion) is the chord alone */
  { id:"S2", name:"Event intro", where:["tv", "phone"], ms:INTRO_TIMING.total,
    play:(E, t, o = {}) => gameIntro(E, t, o) },
  { id:"S3", name:"Card turns", where:["tv"], ms:30,
    play:(E, t) => M.tick(E, t) },
  { id:"S4", name:"Your card", where:["phone"], ms:500,
    play:(E, t) => { M.bell(E, t, NOTE.D5, { gain:0.9, dec:1.8, send:0.25 }); M.bell(E, t + 0.09, NOTE.Fs5, { gain:0.5, dec:1.4, send:0.25 }); } },
  { id:"S5", name:"Chip placed", where:["phone", "tv"], ms:30,
    play:(E, t, o = {}) => chipPlaced(E, t, o) },
  { id:"S6", name:"Chip taken back", where:["phone"], ms:30,
    play:(E, t) => M.clack(E, t, { pitch:0.84, gain:0.7, bright:0.5, double:false }) },
  { id:"S7", name:"At your limit", where:["phone"], ms:120,
    play:(E, t) => { M.clack(E, t); M.felt(E, t + 0.03, { gain:0.5 }); M.clack(E, t + 0.07, { pitch:0.9, gain:0.45, double:false }); } },
  { id:"S8", name:"Betting locks", where:["tv"], ms:150,
    play:(E, t) => { M.felt(E, t, { gain:0.9 }); M.knock(E, t + 0.018, { pitch:0.9, gain:0.8 }); } },
  { id:"S9", name:"You're playing", where:["phone"], ms:500,
    play:(E, t) => { M.drum(E, t, { f:82, dec:0.3, gain:0.7 }); M.drum(E, t + 0.16, { f:110, dec:0.3, gain:0.6 });
      M.bell(E, t + 0.3, NOTE.A4, { gain:0.5, dec:1.6 }); } },
  { id:"S10", name:"Won", where:["tv"], ms:120,
    play:(E, t) => { M.drum(E, t, { f:120, dec:0.18, gain:0.8 }); M.clack(E, t + 0.005, { gain:0.9 }); } },
  { id:"S11", name:"To the bank", where:["tv"], ms:600,
    play:(E, t) => { swell(E, voice(E, { send:0.1, bright:0.4, gain:1 }), t, { d:0.5, f0:900, f1:420, peak:0.18 });
      riffle(E, t + 0.25, 4, { pitch:0.8, bright:0.45, gain:0.45, gap:0.05 }); } },
  { id:"S12", name:"Payout", where:["phone", "tv"], ms:300,
    play:(E, t) => riffle(E, t, 6, { pitch:1.02, gap:0.042, gain:0.85 }) },
  { id:"S13", name:"Advance", where:["tv"], ms:900,
    play:(E, t) => { swell(E, voice(E, { send:0.15, bright:0.6 }), t, { d:0.75, f0:600, f1:1100, peak:0.12 });
      M.knock(E, t + 0.8, { gain:0.6 }); M.clack(E, t + 0.81, { gain:0.7 }); } },
  { id:"S14", name:"Result posted", where:["tv"], ms:1500,
    play:(E, t) => { M.bell(E, t, NOTE.A4, { gain:0.7, dec:2.8 }); M.bell(E, t + 0.07, NOTE.D5, { gain:0.55, dec:2.8 }); } },
  { id:"S15", name:"New leader", where:["tv", "phone"], ms:1500,
    play:(E, t) => { M.bell(E, t, NOTE.A4, { gain:0.6 }); M.bell(E, t + 0.14, NOTE.D5, { gain:0.75, dec:2.6 }); } },
  { id:"S16", name:"Challenged", where:["phone"], ms:250,
    play:(E, t) => { M.knock(E, t); M.knock(E, t + 0.13, { pitch:1.04, gain:0.85 }); } },
  { id:"S17", name:"Duel won", where:["phone"], ms:300,
    play:(E, t) => riffle(E, t, 5, { pitch:1.04, gap:0.04, gain:0.8 }) },
  { id:"S18", name:"Pick", where:["tv", "phone"], ms:100,
    play:(E, t) => M.slap(E, t) },
  { id:"S19", name:"Your pick", where:["phone"], ms:900,
    play:(E, t) => { M.knock(E, t, { gain:0.5 }); M.bell(E, t + 0.02, NOTE.Fs5, { gain:0.6, dec:1.6, send:0.25 }); } },
  { id:"S20", name:"Deal", where:["tv"], ms:900,
    play:(E, t) => riffle(E, t, 12, { pitch:0.95, gap:0.07, gain:0.55 }) },
  { id:"S21", name:"Blinds up", where:["tv"], ms:3000,
    play:(E, t) => { M.bowl(E, t, NOTE.A2, { gain:0.9 }); M.bowl(E, t, NOTE.D3, { gain:0.35, dec:3.5 }); } },
  { id:"S22", name:"Bust", where:["tv"], ms:1200,
    play:(E, t) => spinDown(E, t, { dur:1.0, gain:0.8 }) },
  { id:"S23", name:"Roll to the flood", where:["tv"], ms:1400,
    play:(E, t) => { roll(E, t, { dur:0.6 }); M.drum(E, t + 0.6, { f:NOTE.D2, dec:1.0 });
      M.bell(E, t + 0.6, NOTE.D4, { gain:0.6, dec:3 }); M.bell(E, t + 0.6, NOTE.A4, { gain:0.5, dec:3 }); } },
  { id:"S24", name:"Champion's chip", where:["tv", "phone"], ms:1300,
    play:(E, t) => { M.clack(E, t, { gain:1 }); spinDown(E, t + 0.05, { dur:1.15, gain:0.7 }); } },
  { id:"S25", name:"Saved", where:["gm"], ms:400,
    play:(E, t) => { M.clack(E, t, { gain:0.35, double:false }); M.bell(E, t + 0.01, NOTE.A5, { gain:0.18, dec:0.6, send:0.1 }); } },
  /* two notes falling a fourth (B to F#) on a dead wooden knock: it did not happen */
  { id:"S26", name:"Didn't save", where:["gm", "phone"], ms:500,
    play:(E, t) => { M.knock(E, t, { gain:0.6 }); M.bell(E, t + 0.005, NOTE.B4, { gain:0.32, dec:0.5, send:0.08 });
      M.knock(E, t + 0.17, { pitch:0.84, gain:0.55 }); M.bell(E, t + 0.175, NOTE.Fs4, { gain:0.3, dec:0.7, send:0.08 }); } },
].map(Object.freeze));

/* S5 with weight: what you put down sounds like what it is. A 100 is one
   clack; a 500 is lower and lands on felt; a 1,000 is a short riffle over a
   low drum. Each chip on your stack on that side climbs a little higher. */
export const CHIP_WEIGHT = Object.freeze({ heightStep:0.025, heightCap:10 });
export function chipPitch(height = 0) {
  return 1 + Math.min(CHIP_WEIGHT.heightCap, Math.max(0, Math.floor(Number(height) || 0))) * CHIP_WEIGHT.heightStep;
}
function chipPlaced(E, t, o = {}) {
  const denom = Number(o.denom) || 100;
  const p = chipPitch(o.height);
  if (denom >= 1000) {
    M.drum(E, t, { f:NOTE.D2, dec:0.3, gain:0.5 });
    riffle(E, t + 0.004, 3, { pitch:0.92 * p, gap:0.034, gain:0.75 });
    return;
  }
  if (denom >= 500) {
    M.clack(E, t, { pitch:0.86 * p });
    M.felt(E, t + 0.012, { gain:0.55 });
    return;
  }
  if (denom >= 200) {
    M.clack(E, t, { pitch:0.95 * p });
    M.clack(E, t + 0.028, { pitch:0.97 * p, gain:0.55, double:false });
    return;
  }
  M.clack(E, t, { pitch:p });
}

/* a noise band sweeping up (or down) and panned: a whoosh past the camera */
function whoosh(E, t, { d = 0.45, f0 = 320, f1 = 2600, peak = 0.32, pan = 0 } = {}) {
  const v = voice(E, { pan, send:0.2, bright:0.9 });
  swell(E, v, t, { d, f0, f1, q:0.9, peak });
}

/* ── the gags (features/gags): the bowling alley's cartoon sounds ──
   Built from the same voices as the rest of the kit; every pitched note
   stays in D. */
/* a held tone with an attack and a release (a damped mode only rings) */
function held(E, dest, t, f, d, peak, { type = "sine", a = 0.02, glide = 0 } = {}) {
  const c = E.ctx;
  const o = c.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f * (1 + glide), t);
  if (glide) o.frequency.exponentialRampToValueAtTime(f, t + Math.min(0.12, d * 0.4));
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.setValueAtTime(peak, t + Math.max(a, d * 0.7));
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g); g.connect(dest);
  track(E, o, g); trackSource(E, o);
  o.start(t); o.stop(t + d + 0.03);
  return o;
}
/* a slow wobble on a param (a vibrato, a tremolo): an LFO of `rate` Hz
   swinging it by `depth`, faded in over `fade` s */
function wobble(E, param, t, d, { rate = 5.5, depth = 1, fade = 0 } = {}) {
  const c = E.ctx;
  const lfo = c.createOscillator(); lfo.type = "sine"; lfo.frequency.value = rate;
  const amount = c.createGain();
  amount.gain.setValueAtTime(fade ? 0 : depth, t);
  if (fade) amount.gain.linearRampToValueAtTime(depth, t + fade);
  lfo.connect(amount); amount.connect(param);
  track(E, lfo, amount); trackSource(E, lfo);
  lfo.start(t); lfo.stop(t + d + 0.03);
}
/* one gobble: a buzzy throat through a formant, its loudness shaken fast
   (the warble) and its pitch falling a little */
function gobble(E, t, { f = 290, d = 0.28, peak = 0.5, rate = 24, pan = 0 } = {}) {
  const c = E.ctx;
  const v = voice(E, { pan, send:0.16, bright:0.85 });
  const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 980; bp.Q.value = 3.2;
  const bp2 = c.createBiquadFilter(); bp2.type = "bandpass"; bp2.frequency.value = 2350; bp2.Q.value = 5;
  const throat = c.createGain(); throat.gain.setValueAtTime(0.55, t);
  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.linearRampToValueAtTime(peak, t + 0.018);
  env.gain.setValueAtTime(peak, t + d * 0.72);
  env.gain.exponentialRampToValueAtTime(0.0001, t + d);
  const o = c.createOscillator(); o.type = "sawtooth";
  o.frequency.setValueAtTime(f * 1.22, t);
  o.frequency.exponentialRampToValueAtTime(f, t + d * 0.55);
  const air = c.createGain(); air.gain.value = 0.45;
  o.connect(bp); o.connect(bp2); bp2.connect(air); bp.connect(throat); air.connect(throat); throat.connect(env); env.connect(v);
  track(E, bp, bp2, throat, env, air, o); trackSource(E, o);
  o.start(t); o.stop(t + d + 0.03);
  wobble(E, throat.gain, t, d, { rate, depth:0.45 });
}
/* something heavy rolling down a lane: a low drum of the boards under a
   noise rumble, travelling across the room from `from` to `to` */
function laneRoll(E, t, { d = 1, from = -0.8, to = 0.8, peak = 0.3 } = {}) {
  const c = E.ctx;
  const g = c.createGain(); g.gain.value = 1;
  const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 0.6; lp.frequency.value = 1400;
  const p = c.createStereoPanner();
  const travel = E.listen === "phone" ? 0 : 1;
  p.pan.setValueAtTime(clampPan(from) * travel, t);
  p.pan.linearRampToValueAtTime(clampPan(to) * travel, t + d);
  const s = c.createGain(); s.gain.value = 0.16;
  g.connect(lp); lp.connect(p); p.connect(E.open && E.openDry ? E.openDry : E.dry); p.connect(s); s.connect(E.wet);
  track(E, g, lp, p, s);
  swell(E, g, t, { d, f0:140, f1:260, q:0.7, peak });
  held(E, g, t, 55, d, peak * 0.9, { a:d * 0.5 });
  /* the seams between the boards, closer together as it speeds up */
  for (let x = 0.08, gap = 0.16; x < d - 0.05; x += gap, gap = Math.max(0.07, gap * 0.9))
    M.knock(E, t + x, { pitch:0.62, gain:0.08 + 0.12 * (x / d), pan:clampPan(from + (to - from) * (x / d)) });
}
/* a brass note: a sawtooth that scoops up to its pitch, its lowpass opening
   on the attack (the wah), an optional vibrato that grows */
function brass(E, t, f, { d = 0.3, peak = 0.34, vib = 0 } = {}) {
  const c = E.ctx;
  const v = voice(E, { send:0.22, bright:0.75 });
  const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 2.4;
  lp.frequency.setValueAtTime(f * 1.6, t);
  lp.frequency.linearRampToValueAtTime(f * 5.5, t + Math.min(0.12, d * 0.4));
  lp.frequency.linearRampToValueAtTime(f * 2.4, t + d);
  lp.connect(v);
  track(E, lp);
  const low = held(E, lp, t, f, d, peak, { type:"sawtooth", a:0.035, glide:-0.05 });
  const high = held(E, lp, t, f * 1.003, d, peak * 0.55, { type:"sawtooth", a:0.04, glide:-0.05 });
  if (vib) [low, high].forEach(o => wobble(E, o.frequency, t, d, { rate:5.4, depth:f * vib, fade:d * 0.35 }));
}
/* a bird's harsh call: a square falling in pitch, rasped by a fast tremolo */
function caw(E, t, { f = 820, d = 0.2, peak = 0.32, pan = 0 } = {}) {
  const c = E.ctx;
  const v = voice(E, { pan, send:0.22, bright:1 });
  const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1450; bp.Q.value = 1.4;
  const rasp = c.createGain(); rasp.gain.setValueAtTime(0.6, t);
  bp.connect(rasp); rasp.connect(v);
  track(E, bp, rasp);
  const o = held(E, bp, t, f * 0.72, d, peak, { type:"square", a:0.012, glide:0.4 });
  o.frequency.exponentialRampToValueAtTime(f * 0.62, t + d);
  wobble(E, rasp.gain, t, d, { rate:38, depth:0.4 });
  burst(E, v, t, { f:2400, q:1.2, d:d * 0.6, peak:peak * 0.6 });
}

/* The parts the prototype's sequences (Q1 to Q5) compose on the real
   constants: the bracket advance, the crown's other beats, and a crowd of
   chips landing on the TV board at once. */
export const PARTS = Object.freeze([
  { id:"ride", name:"Winners ride the connector", ms:800,
    play:(E, t, o = {}) => swell(E, voice(E, { send:0.15, bright:0.6 }), t, { d:(o.ms || 800) / 1000, f0:600, f1:1100, peak:0.12 }) },
  { id:"land", name:"They land in the next slot", ms:120,
    play:(E, t) => { M.knock(E, t, { gain:0.6 }); M.clack(E, t + 0.01, { gain:0.7 }); } },
  { id:"upNow", name:"UP NOW moves on", ms:1800,
    play:(E, t) => M.bell(E, t, NOTE.A4, { gain:0.35, dec:1.8 }) },
  { id:"stepDown", name:"The other rows step down", ms:300,
    play:(E, t) => riffle(E, t, 4, { pitch:0.8, gain:0.35, bright:0.5, gap:0.06 }) },
  { id:"crownCount", name:"The final stack counts", ms:1200,
    play:(E, t, o = {}) => riffle(E, t, 12, { gap:(o.ms || 1200) / 1000 / 12, gain:0.5, pitch:0.98 }) },
  { id:"crownCall", name:"The Field Day call, complete", ms:4000,
    play:(E, t) => { M.bell(E, t, NOTE.A4, { gain:0.7 }); M.bell(E, t + 0.17, NOTE.D5, { gain:0.7 });
      M.bell(E, t + 0.34, NOTE.Fs5, { gain:0.65 }); M.bell(E, t + 0.62, NOTE.A5, { gain:0.55, dec:4 });
      M.drum(E, t + 0.62, { f:NOTE.D2, dec:1.2, gain:0.6 }); } },
  { id:"faceOff", name:"The sides meet", ms:600,
    play:(E, t) => { M.drum(E, t, { f:NOTE.D2, dec:0.5, gain:0.55 }); M.knock(E, t + 0.02, { pitch:0.85, gain:0.45 }); } },
  { id:"crowd", name:"Several chips at once", ms:300,
    play:(E, t, o = {}) => riffle(E, t, Math.max(3, Math.min(6, o.n || 4)), { gain:0.7, gap:0.04 }) },
  /* a picker wheel passing one value: a dry, quiet detent click */
  { id:"detent", name:"A wheel passes a value", ms:20,
    play:(E, t) => M.tick(E, t, { gain:0.45, pitch:1.25 }) },

  /* ── the takeover grammar (Backglass) ── */
  /* the lean-in: the room dims and a sting turns heads before a peak */
  { id:"sting", name:"Lean in", ms:1400,
    play:(E, t) => { swell(E, voice(E, { send:0.25, bright:0.7 }), t, { d:0.7, f0:260, f1:1500, q:0.8, peak:0.16 });
      M.drum(E, t + 0.7, { f:NOTE.D2, dec:0.9, gain:0.75 }); M.bell(E, t + 0.7, NOTE.D5, { gain:0.55, dec:2.2 });
      M.bell(E, t + 0.7, NOTE.A5, { gain:0.3, dec:1.6 }); } },
  /* a side enters from its own edge (pan -1 left, 1 right) */
  { id:"whoosh", name:"A side slams in", ms:500,
    play:(E, t) => { whoosh(E, t, { d:0.42, peak:0.3 }); M.slap(E, t + 0.4, { gain:0.7 }); } },
  /* VS: a drum, a slap and a low bell, held */
  { id:"vsHit", name:"VS", ms:2600,
    play:(E, t) => { M.drum(E, t, { f:NOTE.D2, dec:1.1, gain:0.95 }); M.slap(E, t + 0.004, { gain:0.85 });
      M.bowl(E, t + 0.01, NOTE.D3, { gain:0.6, dec:2.6 }); M.bell(E, t + 0.01, NOTE.A4, { gain:0.25, dec:1.8 }); } },
  /* one letter of the head-to-head typing in */
  { id:"typeTick", name:"A letter types in", ms:20,
    play:(E, t) => M.tick(E, t, { gain:0.35, pitch:1.4 }) },
  /* a place stamps on the podium (opts.place: 3, 2, 1) */
  { id:"podium", name:"A place stamps", ms:900,
    play:(E, t, o = {}) => { const top = Number(o.place) === 1;
      M.knock(E, t, { gain:0.7, pitch:top ? 1.1 : 0.95 }); M.clack(E, t + 0.006, { gain:0.7 });
      M.bell(E, t + 0.01, top ? NOTE.D5 : Number(o.place) === 2 ? NOTE.A4 : NOTE.Fs4, { gain:top ? 0.6 : 0.4, dec:top ? 2.4 : 1.4 });
      if (top) M.drum(E, t, { f:NOTE.D2, dec:0.6, gain:0.6 }); } },

  /* ── the walkout ── */
  /* as the win song fades in: a short chord stab, past the duck */
  { id:"stinger", name:"Walkout stinger", ms:1600,
    play:(E, t) => { M.drum(E, t, { f:NOTE.D2, dec:0.8, gain:0.85 }); riffle(E, t, 4, { gap:0.03, gain:0.5, pitch:1.05 });
      M.bell(E, t + 0.02, NOTE.A4, { gain:0.5, dec:2 }); M.bell(E, t + 0.02, NOTE.D5, { gain:0.5, dec:2 });
      M.bell(E, t + 0.02, NOTE.Fs5, { gain:0.45, dec:2.4 }); } },
  /* the name stamps */
  { id:"stamp", name:"A name stamps", ms:300,
    play:(E, t) => { M.slap(E, t, { gain:0.8 }); M.knock(E, t + 0.01, { gain:0.5, pitch:0.9 }); } },
  /* a name cut into the cup: the graver's quick strokes, then the metal rings */
  { id:"engrave", name:"A plate engraves", ms:1600,
    play:(E, t) => { for (let i = 0; i < 5; i++) M.tick(E, t + i * 0.055, { gain:0.32, pitch:1.35 + i * 0.04 });
      M.bell(E, t + 0.3, NOTE.D6, { gain:0.32, dec:1.6, send:0.3 }); M.bell(E, t + 0.3, NOTE.A5, { gain:0.24, dec:1.9, send:0.3 }); } },

  /* ── "You're up" on a competitor's phone: two notes, low then high ── */
  { id:"youUp", name:"You're up", ms:1200,
    play:(E, t) => { M.drum(E, t, { f:82, dec:0.28, gain:0.7 }); M.bell(E, t + 0.005, NOTE.D5, { gain:0.6, dec:1.1, send:0.2 });
      M.drum(E, t + 0.19, { f:110, dec:0.32, gain:0.65 }); M.bell(E, t + 0.195, NOTE.A5, { gain:0.6, dec:1.6, send:0.22 }); } },
  /* your team turns up at the draw: your color floods */
  { id:"teamUp", name:"Your team", ms:1600,
    play:(E, t) => { M.bell(E, t, NOTE.D5, { gain:0.7, dec:1.6, send:0.25 }); M.bell(E, t + 0.09, NOTE.Fs5, { gain:0.55, dec:1.6, send:0.25 });
      M.bell(E, t + 0.18, NOTE.A5, { gain:0.5, dec:2, send:0.25 }); M.felt(E, t, { gain:0.5 }); } },

  /* ── chip rain ── */
  /* a chip lands on your pile, one step up the ladder (opts.step) */
  { id:"rain", name:"A chip lands on the pile", ms:400,
    play:(E, t, o = {}) => { const f = ladderNote(o.step);
      M.clack(E, t, { pitch:0.9 + (f / NOTE.D4 - 1) * 0.18, gain:0.7, double:false });
      M.bell(E, t + 0.003, f, { gain:0.22, dec:0.45, send:0.15 }); } },
  /* the pile sweeps into your total */
  { id:"sweep", name:"The pile sweeps home", ms:700,
    play:(E, t, o = {}) => { swell(E, voice(E, { send:0.1, bright:0.6 }), t, { d:0.4, f0:500, f1:1300, peak:0.14 });
      riffle(E, t + 0.18, Math.max(4, Math.min(10, o.n || 6)), { gap:0.032, gain:0.6, pitch:1.06 }); } },
  /* a loss: your stack slides off to the bank, quietly */
  { id:"loss", name:"To the bank, yours", ms:800,
    play:(E, t) => { swell(E, voice(E, { send:0.08, bright:0.35 }), t, { d:0.55, f0:760, f1:300, peak:0.13 });
      riffle(E, t + 0.32, 3, { pitch:0.74, bright:0.4, gain:0.32, gap:0.06 }); } },
  /* a bigger win rings more chips (opts.n) */
  { id:"payout", name:"Payout by size", ms:900,
    play:(E, t, o = {}) => { const n = Math.max(4, Math.min(16, Math.round(o.n || 6)));
      riffle(E, t, n, { pitch:1.02, gap:Math.max(0.026, 0.05 - n * 0.0015), gain:0.85 });
      if (n >= 10) M.bell(E, t + n * 0.035, NOTE.D5, { gain:0.4, dec:1.6 }); } },
  /* a placed chip settles on the felt */
  { id:"chipLand", name:"A chip settles", ms:120,
    play:(E, t) => { M.felt(E, t, { gain:0.35 }); M.clack(E, t + 0.01, { pitch:0.9, gain:0.3, bright:0.6, double:false }); } },
  /* you passed someone on the board: a quiet rising pair as your row lands */
  { id:"rankUp", name:"You moved up", ms:900,
    play:(E, t) => { M.bell(E, t, NOTE.Fs5, { gain:0.32, dec:0.9, send:0.2 }); M.bell(E, t + 0.12, NOTE.A5, { gain:0.34, dec:1.2, send:0.2 }); } },

  /* ── the produced crown ── */
  /* night falls on the art */
  { id:"nightFall", name:"Night falls", ms:4000,
    play:(E, t) => { M.bowl(E, t, NOTE.D3, { gain:0.7, dec:4 }); M.bowl(E, t, NOTE.A2, { gain:0.4, dec:4.5 });
      swell(E, voice(E, { send:0.4, bright:0.4 }), t, { d:2.2, f0:1400, f1:300, peak:0.1 }); } },
  /* the towers stand in final order */
  { id:"towersUp", name:"The towers stand", ms:1800,
    play:(E, t) => riffle(E, t, 13, { gap:0.11, gain:0.5, pitch:0.92 }) },
  /* a tower goes dark: the name and final stack stamp (opts.pan) */
  { id:"towerOut", name:"A tower goes dark", ms:900,
    play:(E, t) => { M.knock(E, t, { gain:0.65, pitch:0.88 }); M.slap(E, t + 0.008, { gain:0.45 });
      M.bowl(E, t + 0.01, NOTE.A2, { gain:0.25, dec:1.4 }); } },
  /* the last two hold: a roll that swells (opts.ms) */
  { id:"holdRoll", name:"The last two hold", ms:4000,
    play:(E, t, o = {}) => roll(E, t, { dur:Math.max(1, (o.ms || 4000) / 1000), from:0.05, to:0.6, f:NOTE.D2 }) },
  /* the champion's tower rises and cascades */
  { id:"cascade", name:"The champion's tower", ms:2400,
    play:(E, t) => { swell(E, voice(E, { send:0.3, bright:0.8 }), t, { d:1.4, f0:300, f1:2200, peak:0.16 });
      for (let i = 0; i < 18; i++) M.clack(E, t + 0.5 + i * 0.05, { pitch:0.9 + i * 0.02, gain:0.55, double:false });
      M.drum(E, t + 1.45, { f:NOTE.D2, dec:1.2, gain:0.9 }); } },
  /* one phone's note in the room's chord (opts.f), sustained */
  { id:"chord", name:"Your note in the chord", ms:7000,
    play:(E, t, o = {}) => { const f = Number(o.f) || NOTE.D5;
      M.bell(E, t, f, { gain:0.8, dec:6.5, send:0.3 });
      const v = voice(E, { send:0.3, bright:0.8, gain:0.6 });
      mode(E, v, t, f, 6, 0.12, { a:0.35 }); mode(E, v, t, f * 2, 3.5, 0.03, { a:0.4 });
      phantom(E, v, t, f, 5, 0.1, { a:0.35 }); } },

  /* ── the finale ── */
  /* the bust card lands */
  { id:"bustCard", name:"Out", ms:1600,
    play:(E, t) => { M.slap(E, t, { gain:0.8 }); M.bowl(E, t + 0.01, NOTE.D3, { gain:0.45, dec:1.8 });
      M.bell(E, t + 0.02, NOTE.Fs4, { gain:0.25, dec:1.2 }); } },

  /* ── the gags (features/gags, roomSound.js gagCues) ── */
  /* a cartoon footstep: a turkey strutting in */
  { id:"gagStep", name:"A strutting step", ms:120,
    play:(E, t, o = {}) => { M.knock(E, t, { pitch:1.55 + ((Number(o.step) || 0) % 2) * 0.12, gain:0.28, pan:o.pan || 0 });
      M.felt(E, t + 0.006, { gain:0.22 }); } },
  /* gobble gobble: two warbled calls */
  { id:"gagGobble", name:"Gobble", ms:800,
    play:(E, t) => { gobble(E, t, { f:300, d:0.26, peak:0.5 }); gobble(E, t + 0.3, { f:262, d:0.34, peak:0.46, rate:21 }); } },
  /* a strike mark stamps in: one bell a step up D for each (opts.step 0..2) */
  { id:"gagDing", name:"A strike mark", ms:1400,
    play:(E, t, o = {}) => { const step = Math.max(0, Math.min(2, Number(o.step) || 0));
      M.knock(E, t, { pitch:1.2, gain:0.45 }); M.clack(E, t + 0.004, { pitch:1.15, gain:0.4, double:false });
      M.bell(E, t + 0.008, [NOTE.D5, NOTE.Fs5, NOTE.A5][step], { gain:0.55, dec:1.3, send:0.32 });
      M.bell(E, t + 0.008, [NOTE.D6, NOTE.Fs6, NOTE.A6][step], { gain:0.12, dec:0.7, send:0.32 }); } },
  /* the ball down the lane, across the room left to right (opts.ms) */
  { id:"gagRoll", name:"Down the lane", ms:1100,
    play:(E, t, o = {}) => laneRoll(E, t, { d:Math.max(0.3, (o.ms || 1050) / 1000), from:-0.85, to:o.to ?? 0.75 }) },
  /* ten pins go: a burst of wooden tocks scattering across the room */
  { id:"gagCrash", name:"Pins scatter", ms:900,
    play:(E, t) => { M.drum(E, t, { f:NOTE.D2, dec:0.55, gain:0.85 }); M.slap(E, t, { gain:0.9, pan:0.6 });
      burst(E, voice(E, { gain:0.55, bright:0.7, pan:0.6 }), t, { type:"lowpass", f:1500, d:0.22, peak:0.5 });
      for (let i = 0; i < 24; i++) {
        const at = t + 0.004 + Math.pow(i / 24, 1.5) * 0.46 + rnd(0, 0.012);
        M.knock(E, at, { pitch:rnd(1.3, 2.5), gain:rnd(0.22, 0.55) * (1 - i / 34), pan:rnd(-0.2, 0.95) });
        if (i % 3 === 0) M.clack(E, at + 0.005, { pitch:rnd(0.7, 1.05), gain:0.26, double:false, pan:rnd(0, 0.9) });
      } } },
  /* the upset lit: a bright run up D */
  { id:"gagFlourish", name:"Upset", ms:1800,
    play:(E, t) => { [NOTE.D5, NOTE.Fs5, NOTE.A5, NOTE.D6].forEach((f, i) => M.bell(E, t + i * 0.07, f, { gain:0.5 - i * 0.05, dec:1.6, send:0.36 }));
      M.bell(E, t + 0.32, NOTE.A6, { gain:0.22, dec:1.4, send:0.4 }); riffle(E, t + 0.04, 5, { gap:0.034, gain:0.42, pitch:1.1 });
      M.drum(E, t, { f:NOTE.D2, dec:0.6, gain:0.5 }); } },
  /* the ball drops into the gutter: a hollow clunk */
  { id:"gagClunk", name:"Into the gutter", ms:700,
    play:(E, t) => { M.knock(E, t, { pitch:0.52, gain:0.85 }); M.bowl(E, t + 0.01, NOTE.A2, { gain:0.32, dec:0.7 });
      M.felt(E, t + 0.02, { gain:0.55 }); M.knock(E, t + 0.13, { pitch:0.5, gain:0.3 }); } },
  /* wah wah wah waaah: four brass notes falling down D, the last held and shaking */
  { id:"gagTrombone", name:"The sad trombone", ms:2100,
    play:(E, t) => { brass(E, t, NOTE.A3, { d:0.3 }); brass(E, t + 0.34, NOTE.Fs4 / 2, { d:0.3 });
      brass(E, t + 0.68, NOTE.E4 / 2, { d:0.32 }); brass(E, t + 1.04, NOTE.D3, { d:1.0, vib:0.022, peak:0.36 }); } },
  /* a desert wind whistling through (opts.ms) */
  { id:"gagWind", name:"Desert wind", ms:2000,
    play:(E, t, o = {}) => { const d = Math.max(0.6, (o.ms || 2000) / 1000);
      const c = E.ctx, v = voice(E, { send:0.38, bright:0.9 });
      const s = c.createBufferSource(); s.buffer = E.noise; s.loop = true;
      const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 14;
      bp.frequency.setValueAtTime(620, t); bp.frequency.linearRampToValueAtTime(1180, t + d * 0.45);
      bp.frequency.linearRampToValueAtTime(760, t + d * 0.8); bp.frequency.linearRampToValueAtTime(980, t + d);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.34, t + d * 0.35);
      g.gain.linearRampToValueAtTime(0.22, t + d * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      s.connect(bp); bp.connect(g); g.connect(v); track(E, s, bp, g); trackSource(E, s);
      s.start(t, Math.random() * 0.5, d + 0.05);
      swell(E, voice(E, { send:0.3, bright:0.5 }), t, { d, f0:280, f1:520, q:0.6, peak:0.1 }); } },
  /* a vulture's squawk, twice */
  { id:"gagSquawk", name:"A vulture squawks", ms:600,
    play:(E, t, o = {}) => { caw(E, t, { f:860, d:0.19, pan:o.pan || 0 }); caw(E, t + 0.23, { f:760, d:0.24, pan:o.pan || 0 }); } },
].map(Object.freeze));

/* a pitch that slides (a whistle, a spring), with an optional wobble */
function glide(E, dest, t, f0, f1, d, peak, { type = "sine", vib = 0, depth = 0.03 } = {}) {
  const c = E.ctx;
  const o = c.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + d * 0.85);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + Math.min(0.04, d * 0.2));
  g.gain.setValueAtTime(peak, t + d * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g); g.connect(dest);
  track(E, o, g); trackSource(E, o);
  if (vib > 0) {
    const lfo = c.createOscillator(); lfo.type = "sine"; lfo.frequency.value = vib;
    const amount = c.createGain(); amount.gain.value = f1 * depth;
    lfo.connect(amount); amount.connect(o.frequency);
    track(E, lfo, amount); trackSource(E, lfo);
    lfo.start(t); lfo.stop(t + d + 0.03);
  }
  o.start(t); o.stop(t + d + 0.03);
}
/* the thinking loop's bars: four phrases on the motif, a bell a beat */
const THINK = Object.freeze([[NOTE.D5, NOTE.Fs5, NOTE.A5, NOTE.Fs5], [NOTE.E5, NOTE.A5, NOTE.B5, NOTE.A5],
  [NOTE.D5, NOTE.Fs5, NOTE.A5, NOTE.D6], [NOTE.B5, NOTE.A5, NOTE.Fs5, NOTE.E5]]);
/* one bar of the loop, in seconds */
export const THINK_BAR_S = 2;

/* ── the Trivia board (features/tv/boardSound.js cues them on the room's
   clock; a phone plays its own taps on the you bus) ── */
export const BOARD_PARTS = Object.freeze([
  /* a cell flies up into its clue: a chip lifted, the whoosh, the landing */
  { id:"boardZoom", name:"A cell flies up", ms:1400,
    play:(E, t) => { M.clack(E, t, { pitch:1.2, gain:0.5, double:false }); whoosh(E, t + 0.05, { d:1.05, f0:260, f1:2400, peak:0.16 });
      M.knock(E, t + 1.18, { gain:0.4 }); M.bell(E, t + 1.19, NOTE.A4, { gain:0.32, dec:1.4 }); } },
  /* the buzzers arm: a relay catches and the lamps run up the motif */
  { id:"boardArm", name:"The buzzers arm", ms:900,
    play:(E, t) => { M.knock(E, t, { pitch:1.3, gain:0.4 }); M.clack(E, t + 0.008, { pitch:1.15, gain:0.5, double:false });
      [NOTE.A4, NOTE.D5, NOTE.Fs5, NOTE.A5].forEach((f, i) => M.bell(E, t + 0.02 + i * 0.045, f, { gain:0.3, dec:0.9, send:0.25 }));
      hum(E, t, 0.32, 900, 2400, 0.04); } },
  /* a buzz lands (panned to the player's chip), each one a step higher */
  { id:"buzzIn", name:"A buzz lands", ms:400,
    play:(E, t, o = {}) => { M.clack(E, t, { pitch:1.15, gain:0.6, double:false });
      M.bell(E, t + 0.004, ladderNote(7 + Math.min(5, Number(o.step) || 0)), { gain:0.34, dec:0.4, send:0.15 }); } },
  /* a place in the buzz order stamps (opts.place: 1 loudest, highest) */
  { id:"orderStamp", name:"A place in the order", ms:900,
    play:(E, t, o = {}) => { const place = Math.max(1, Number(o.place) || 1);
      M.slap(E, t, { gain:place === 1 ? 0.8 : 0.5 }); M.knock(E, t + 0.008, { pitch:place === 1 ? 1.1 : 0.95, gain:0.45 });
      M.bell(E, t + 0.01, [NOTE.D5, NOTE.A4, NOTE.Fs4, NOTE.E4, NOTE.D4][Math.min(4, place - 1)], { gain:place === 1 ? 0.45 : 0.28, dec:0.9 }); } },
  /* right: the motif rung up bright */
  { id:"boardRight", name:"Right", ms:1800,
    play:(E, t) => { M.clack(E, t, { gain:0.45, double:false });
      M.bell(E, t, NOTE.D5, { gain:0.5, dec:1.4 }); M.bell(E, t + 0.09, NOTE.Fs5, { gain:0.5, dec:1.4 });
      M.bell(E, t + 0.18, NOTE.A5, { gain:0.55, dec:1.8 }); M.bell(E, t + 0.18, NOTE.D6, { gain:0.22, dec:1.6 }); } },
  /* wrong: a dead knock and a sagging two-note "wah" */
  { id:"boardWrong", name:"Wrong", ms:1000,
    play:(E, t) => { M.knock(E, t, { pitch:0.8, gain:0.7 }); M.drum(E, t, { f:NOTE.A2, dec:0.35, gain:0.5 });
      const v = voice(E, { send:0.12, bright:0.35, gain:0.55 });
      mode(E, v, t + 0.02, NOTE.B4 / 2, 0.2, 0.1, { type:"sawtooth", a:0.01 });
      mode(E, v, t + 0.24, NOTE.Fs4 / 2, 0.5, 0.12, { type:"sawtooth", drop:0.06, a:0.012 });
      phantom(E, v, t + 0.24, NOTE.Fs4 / 2, 0.35, 0.1); } },
  /* the Daily Double: the letters pop in up the ladder, a whistle slides
     up into a spring, and the chord lands with the drum (opts.summary:
     the chord alone) */
  { id:"ddSting", name:"Daily Double", ms:2600,
    play:(E, t, o = {}) => {
      const chord = at => { M.drum(E, at, { f:NOTE.D2, dec:0.9, gain:0.85 }); M.slap(E, at, { gain:0.6 });
        [NOTE.D4, NOTE.Fs4, NOTE.A4, NOTE.D5].forEach((f, i) => M.bell(E, at + 0.01 + i * 0.012, f, { gain:0.42, dec:2.2 })); };
      if (o.summary) { chord(t); return; }
      swell(E, voice(E, { send:0.25, bright:0.6 }), t, { d:0.5, f0:300, f1:1200, q:0.8, peak:0.12 });
      for (let i = 0; i < 11; i++) bloop(E, t + 0.15 + i * 0.085, ladderNote(i % 7 + 2), 0.26);
      glide(E, voice(E, { send:0.3, bright:0.9, gain:0.4 }), t + 1.05, NOTE.D5, NOTE.D6, 0.42, 0.09, { vib:7 });
      glide(E, voice(E, { send:0.2, bright:0.7, gain:0.5 }), t + 1.5, NOTE.A3, NOTE.D4, 0.5, 0.16, { vib:24, depth:0.08 });
      chord(t + 1.55);
      M.bell(E, t + 1.95, NOTE.A5, { gain:0.3, dec:1.6 }); } },
  /* one bar of the Final's thinking loop (opts.bar; opts.last resolves):
     a wooden tick-tock under four bells on the motif */
  { id:"think", name:"The Final's clock", ms:THINK_BAR_S * 1000,
    play:(E, t, o = {}) => {
      const bar = Math.max(0, Math.floor(Number(o.bar) || 0));
      const beat = THINK_BAR_S / 4;
      for (let i = 0; i < 8; i++) M.knock(E, t + i * beat / 2, { pitch:i % 2 ? 1.45 : 1.7, gain:i % 2 ? 0.16 : 0.22 });
      if (bar % 2 === 0) M.bowl(E, t, NOTE.D3, { gain:0.22, dec:2.4 });
      if (o.last) { [NOTE.D5, NOTE.A5, NOTE.D6].forEach(f => M.bell(E, t, f, { gain:0.32, dec:2.2, send:0.3 })); return; }
      THINK[bar % THINK.length].forEach((f, i) => M.bell(E, t + i * beat, f, { gain:i === 0 ? 0.26 : 0.2, dec:0.9, send:0.3 })); } },
  /* a Final turn: the card turns over, then the tally lands (opts.up) */
  { id:"finalTurn", name:"A Final turns", ms:600,
    play:(E, t) => { M.tick(E, t, { gain:0.5 }); M.tick(E, t + 0.06, { pitch:1.15, gain:0.35 }); M.knock(E, t + 0.08, { pitch:0.9, gain:0.35 }); } },
  { id:"tally", name:"A total rolls", ms:900,
    play:(E, t, o = {}) => { const notes = o.up === false ? [NOTE.A4, NOTE.Fs4, NOTE.D4] : [NOTE.D5, NOTE.Fs5, NOTE.A5];
      notes.forEach((f, i) => M.bell(E, t + i * 0.07, f, { gain:0.3, dec:0.8, send:0.2 })); M.clack(E, t, { gain:0.35, double:false }); } },
  /* the phone's buzzer: a fat arcade button bottoming out, and the dead
     thunk of one pressed before its lamp */
  { id:"buzzPress", name:"Your buzzer", ms:300,
    play:(E, t) => { M.knock(E, t, { pitch:1.25, gain:0.75 }); M.clack(E, t + 0.004, { pitch:0.95, gain:0.6 });
      M.bell(E, t + 0.01, NOTE.A5, { gain:0.24, dec:0.35, send:0.1 }); } },
  { id:"buzzDead", name:"Too early", ms:300,
    play:(E, t) => { M.knock(E, t, { pitch:0.72, gain:0.65 }); M.felt(E, t + 0.01, { gain:0.5 }); } },
].map(Object.freeze));

/* ── the bits (features/gags/bits, tv/bitSound.js): cartoon foley for the
   TV's comic moments, cued on each bit's beats from its registry entry.
   Built from the same voices; anything pitched stays in D. ── */
/* a noise sweep that travels across the room (pan from -> to) */
function travelWhoosh(E, t, { d = 0.28, from = 0.9, to = -0.9, peak = 0.45, f0 = 500, f1 = 3800 } = {}) {
  const c = E.ctx;
  const g = c.createGain(); g.gain.value = 1;
  const p = c.createStereoPanner();
  const travel = E.listen === "phone" ? 0 : 1;
  p.pan.setValueAtTime(clampPan(from) * travel, t);
  p.pan.linearRampToValueAtTime(clampPan(to) * travel, t + d);
  const s = c.createGain(); s.gain.value = 0.2;
  g.connect(p); p.connect(E.open && E.openDry ? E.openDry : E.dry); p.connect(s); s.connect(E.wet);
  track(E, g, p, s);
  swell(E, g, t, { d, f0, f1, q:0.8, peak });
}
/* something falling from very high: a whistle sliding down a long way,
   louder as it comes, cut dead at the end (the silence before the hit) */
function fallWhistle(E, t, d) {
  const c = E.ctx;
  const v = voice(E, { send:0.28, bright:0.9, gain:1 });
  const o = c.createOscillator(); o.type = "sine";
  o.frequency.setValueAtTime(NOTE.D6, t);
  o.frequency.exponentialRampToValueAtTime(NOTE.D4, t + d);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.05, t + 0.08);
  g.gain.linearRampToValueAtTime(0.2, t + d * 0.95);
  g.gain.linearRampToValueAtTime(0.0001, t + d);
  o.connect(g); g.connect(v);
  track(E, o, g); trackSource(E, o);
  o.start(t); o.stop(t + d + 0.03);
  wobble(E, o.frequency, t, d, { rate:6, depth:12, fade:d * 0.3 });
}
/* a spring: up past its note, settling with a wobble that dies away */
function boing(E, t, { f = NOTE.D4, d = 0.6, peak = 0.24 } = {}) {
  const c = E.ctx;
  const v = voice(E, { send:0.25, bright:0.8, gain:1 });
  const o = c.createOscillator(); o.type = "triangle";
  o.frequency.setValueAtTime(f * 0.6, t);
  o.frequency.exponentialRampToValueAtTime(f * 1.3, t + 0.05);
  o.frequency.exponentialRampToValueAtTime(f, t + 0.12);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g); g.connect(v);
  track(E, o, g); trackSource(E, o);
  o.start(t); o.stop(t + d + 0.03);
  const lfo = c.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 17;
  const depth = c.createGain(); depth.gain.setValueAtTime(f * 0.14, t); depth.gain.exponentialRampToValueAtTime(0.5, t + d);
  lfo.connect(depth); depth.connect(o.frequency);
  track(E, lfo, depth); trackSource(E, lfo);
  lfo.start(t); lfo.stop(t + d + 0.03);
  phantom(E, v, t, f, d * 0.5, peak * 0.6);
}
/* one bird call: a reedy square chirping up to its note, a tongue click */
function beep(E, t, f) {
  const c = E.ctx;
  const v = voice(E, { send:0.2, bright:1, gain:1 });
  const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = f * 2; bp.Q.value = 0.9;
  bp.connect(v); track(E, bp);
  held(E, bp, t, f, 0.11, 0.42, { type:"square", a:0.004, glide:-0.08 });
  held(E, bp, t, f * 2, 0.08, 0.1, { type:"sine", a:0.004 });
  M.tick(E, t, { gain:0.25, pitch:1.9 });
}
/* the desert's wind: a low moan under a thin whistle, rising and falling */
function desertWind(E, t, d) {
  const c = E.ctx;
  [[420, 900, 1.1, 5], [1300, 2100, 0.3, 16]].forEach(([lo, hi, peak, q]) => {
    const v = voice(E, { send:0.4, bright:0.9 });
    const s = c.createBufferSource(); s.buffer = E.noise; s.loop = true;
    const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = q;
    bp.frequency.setValueAtTime(lo, t); bp.frequency.linearRampToValueAtTime(hi, t + d * 0.4);
    bp.frequency.linearRampToValueAtTime(lo * 1.2, t + d * 0.75); bp.frequency.linearRampToValueAtTime(hi * 0.8, t + d);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + d * 0.3);
    g.gain.linearRampToValueAtTime(peak * 0.6, t + d * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    s.connect(bp); bp.connect(g); g.connect(v);
    track(E, s, bp, g); trackSource(E, s);
    s.start(t, Math.random() * 0.5, d + 0.05);
  });
}
export const BIT_PARTS = Object.freeze([
  /* a gunshot in the desert: the crack, a thump, and the buttes answering twice */
  { id:"bitCrack", name:"Gun crack", ms:900,
    play:(E, t) => { const v = voice(E, { send:0.32, bright:1, gain:1 });
      burst(E, v, t, { type:"highpass", f:2400, q:0.7, d:0.012, peak:0.95 });
      burst(E, v, t + 0.002, { f:1100, q:0.8, d:0.05, peak:0.75 });
      mode(E, v, t, 95, 0.12, 0.8, { drop:1.2 }); phantom(E, v, t, 95, 0.1, 0.6);
      burst(E, v, t + 0.01, { type:"lowpass", f:1800, q:0.5, d:0.3, peak:0.22 });
      [[0.19, 0.3, 0.5], [0.42, 0.12, -0.6]].forEach(([dt, gain, pan]) => { const e = voice(E, { send:0.5, bright:0.45, gain, pan });
        burst(E, e, t + dt, { f:900, q:0.7, d:0.08, peak:0.8 }); mode(E, e, t + dt, 90, 0.1, 0.5, { drop:0.6 }); }); } },
  /* a bullet off a rock: a whine falling away, wobbling */
  { id:"bitRicochet", name:"Ricochet", ms:650,
    play:(E, t) => { M.tick(E, t, { gain:0.5, pitch:1.6 });
      glide(E, voice(E, { send:0.35, bright:1, gain:0.5 }), t + 0.01, 3000, 1400, 0.55, 0.22, { type:"triangle", vib:28, depth:0.04 }); } },
  /* an anvil landing: a dead heavy thump and the iron ringing on */
  { id:"bitClang", name:"Anvil clang", ms:2200,
    play:(E, t) => { M.drum(E, t, { f:NOTE.D2, dec:0.5, gain:1 }); M.slap(E, t, { gain:0.8 });
      const v = voice(E, { send:0.42, bright:1, gain:1 });
      burst(E, v, t, { f:3200, q:0.8, d:0.04, peak:0.6 });
      [[1, 0.26, 1.8], [2.76, 0.13, 1.1], [5.4, 0.06, 0.6], [8.93, 0.03, 0.35]]
        .forEach(([r, amp, d]) => mode(E, v, t, NOTE.D5 * r * (1 + rnd(-0.002, 0.002)), d, amp, { a:0.001 }));
      mode(E, v, t, NOTE.D5 * 1.004, 1.6, 0.1, { a:0.001 }); } },
  /* something falling from very high (opts.ms) */
  { id:"bitWhistle", name:"Slide whistle down", ms:1200,
    play:(E, t, o = {}) => fallWhistle(E, t, Math.max(0.3, (o.ms || 1200) / 1000)) },
  /* a fast thing past the camera, across the room (opts.from, opts.to) */
  { id:"bitStreak", name:"Whoosh streak", ms:350,
    play:(E, t, o = {}) => travelWhoosh(E, t, { d:0.28, from:o.from ?? 0.9, to:o.to ?? -0.9 }) },
  /* a two-tone bird call: beep beep */
  { id:"bitBeep", name:"Bird beep", ms:500,
    play:(E, t) => { beep(E, t, NOTE.A5); beep(E, t + 0.19, NOTE.D6); } },
  /* flat in the dirt: a thud and the dust it throws */
  { id:"bitThud", name:"Dust thud", ms:500,
    play:(E, t) => { M.drum(E, t, { f:58, dec:0.32, gain:1 }); M.felt(E, t, { gain:0.9 });
      burst(E, voice(E, { send:0.18, bright:0.5, gain:0.6 }), t + 0.01, { type:"lowpass", f:700, q:0.5, d:0.3, peak:0.45 }); } },
  /* the desert's wind (opts.ms) */
  { id:"bitWind", name:"Desert wind", ms:2000,
    play:(E, t, o = {}) => desertWind(E, t, Math.max(0.6, (o.ms || 2000) / 1000)) },
  /* a spring (opts.small: a little one) */
  { id:"bitBoing", name:"Boing", ms:700,
    play:(E, t, o = {}) => boing(E, t, o.small ? { f:NOTE.A4, d:0.35, peak:0.14 } : { f:NOTE.D4, d:0.6, peak:0.24 }) },
  /* a little metal thing in the dirt: tink, tink */
  { id:"bitClink", name:"Clink", ms:500,
    play:(E, t) => { M.bell(E, t, NOTE.A6, { gain:0.3, dec:0.25, send:0.2 }); M.tick(E, t, { gain:0.5, pitch:1.8 });
      M.bell(E, t + 0.12, NOTE.Fs6, { gain:0.16, dec:0.2, send:0.2 }); M.tick(E, t + 0.12, { gain:0.25, pitch:1.7 }); } },
  /* a gun whipped out: a short swish and the hammer */
  { id:"bitDraw", name:"Draw", ms:150,
    play:(E, t) => { burst(E, voice(E, { send:0.15, bright:1, gain:0.5 }), t, { f:3000, q:1, d:0.09, peak:0.5 });
      M.clack(E, t + 0.08, { pitch:1.4, gain:0.35, double:false }); } },
  /* a breath across a barrel */
  { id:"bitPuff", name:"Blow", ms:400,
    play:(E, t) => swell(E, voice(E, { send:0.15, bright:0.7, gain:1 }), t, { d:0.32, f0:1400, f1:700, q:0.9, peak:0.32 }) },
  /* a revolver spun on a finger: a whirr of clicks winding down */
  { id:"bitTwirl", name:"Twirl", ms:450,
    play:(E, t) => { for (let i = 0, x = 0, dt = 0.022; i < 16; i++, x += dt, dt *= 1.09) M.tick(E, t + x, { gain:0.5 - i * 0.02, pitch:1.5 });
      swell(E, voice(E, { send:0.2, bright:0.8 }), t, { d:0.36, f0:2200, f1:1200, q:1, peak:0.07 }); } },
  /* off a glove: a hollow bonk */
  { id:"bitBonk", name:"Bonk", ms:300,
    play:(E, t) => { mode(E, voice(E, { send:0.2, bright:0.7, gain:0.7 }), t, NOTE.A4, 0.16, 0.4, { drop:0.3, type:"triangle" });
      M.knock(E, t, { pitch:1.5, gain:0.4 }); } },
  /* stars round a dizzy head: little bells round the motif (opts.ms) */
  { id:"bitStars", name:"Dizzy stars", ms:900,
    play:(E, t, o = {}) => { const d = Math.max(0.3, (o.ms || 900) / 1000), notes = [NOTE.A6, NOTE.Fs6, NOTE.D6, NOTE.Fs6];
      for (let i = 0, x = 0; x < d; i++, x += 0.12) M.bell(E, t + x, notes[i % 4], { gain:0.22, dec:0.25, send:0.3 }); } },
  /* peeling up off the floor: a sticky rip rising */
  { id:"bitPeel", name:"Peel", ms:450,
    play:(E, t) => { const c = E.ctx, v = voice(E, { send:0.15, bright:1, gain:1 });
      const s = c.createBufferSource(); s.buffer = E.noise;
      const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 2;
      bp.frequency.setValueAtTime(700, t); bp.frequency.exponentialRampToValueAtTime(3600, t + 0.36);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.35, t + 0.25);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      s.connect(bp); bp.connect(g); g.connect(v); track(E, s, bp, g); trackSource(E, s);
      s.start(t, Math.random(), 0.45);
      wobble(E, g.gain, t, 0.4, { rate:42, depth:0.18 }); } },
  /* a hop (opts.step): a light knock in the dirt */
  { id:"bitHop", name:"Hop", ms:150,
    play:(E, t, o = {}) => { M.knock(E, t, { pitch:1.35 + ((Number(o.step) || 0) % 2) * 0.1, gain:0.32 }); M.felt(E, t + 0.004, { gain:0.25 }); } },
  /* heels dug into the dirt (opts.ms: how long it slides) */
  { id:"bitSkid", name:"Skid", ms:350,
    play:(E, t, o = {}) => { const v = voice(E, { send:0.15, bright:0.9, gain:1 });
      const d = Math.max(0.12, (o.ms || 260) / 1000), n = Math.min(18, Math.round(d / 0.024));
      for (let i = 0; i < n; i++) burst(E, v, t + i * 0.024, { f:2600 - i * 900 / n, q:2.5, d:0.03, peak:0.3 - i * 0.2 / n });
      M.felt(E, t + d - 0.02, { gain:0.4 }); } },
  /* winding up to run: feet a blur on the spot, faster and higher (opts.ms) */
  { id:"bitRev", name:"Wind up", ms:400,
    play:(E, t, o = {}) => { const d = Math.max(0.15, (o.ms || 400) / 1000);
      for (let x = 0, dt = 0.05, i = 0; x < d && i < 40; i++, x += dt, dt = Math.max(0.016, dt * 0.86))
        M.knock(E, t + x, { pitch:1.3 + (x / d) * 0.9, gain:0.2 + (x / d) * 0.22 });
      swell(E, voice(E, { send:0.2, bright:0.7 }), t, { d, f0:300, f1:1400, q:1.2, peak:0.1 }); } },
  /* off like a shot: a little whistle up and a swish away to the left */
  { id:"bitZip", name:"Zip", ms:300,
    play:(E, t) => { glide(E, voice(E, { send:0.2, bright:1, gain:0.5 }), t, NOTE.D6, NOTE.A6, 0.16, 0.12);
      travelWhoosh(E, t, { d:0.22, from:0, to:-0.9, peak:0.3 }); } },
  /* ── idle (Oct 10): the downtime vignettes' foley, kept low (the room is
     talking); helpers below the list ── */
  /* a sleeper's breath: in through the nose, out on a thin whistle (opts.small: quieter) */
  { id:"bitSnore", name:"Snore", ms:1500,
    play:(E, t, o = {}) => { const k = o.small ? 0.7 : 1;
      swell(E, voice(E, { send:0.25, bright:0.6 }), t, { d:0.7, f0:450, f1:1000, q:1.2, peak:0.16 * k });
      glide(E, voice(E, { send:0.3, bright:0.9, gain:0.5 }), t + 0.78, NOTE.D6, NOTE.A5, 0.5, 0.05 * k, { vib:5, depth:0.01 });
      swell(E, voice(E, { send:0.25, bright:0.5 }), t + 0.75, { d:0.6, f0:900, f1:420, q:1, peak:0.09 * k }); } },
  /* a moth's wings (opts.ms) */
  { id:"bitFlutter", name:"Moth flutter", ms:1500, play:(E, t, o = {}) => flutter(E, t, Math.max(0.3, (o.ms || 1500) / 1000)) },
  /* a glove slapped down on a face */
  { id:"bitSwat", name:"Swat", ms:400,
    play:(E, t) => { M.slap(E, t, { gain:0.55 }); M.felt(E, t + 0.004, { gain:0.35 });
      burst(E, voice(E, { send:0.15, bright:1, gain:0.4 }), t, { type:"highpass", f:2400, d:0.03, peak:0.4 }); } },
  /* a little table straining (opts.ms; opts.small: shorter, softer) */
  { id:"bitCreak", name:"Creak", ms:900, play:(E, t, o = {}) => creak(E, t, Math.max(0.2, (o.ms || 900) / 1000), o.small ? 0.6 : 1) },
  /* a drop of sweat (opts.small: quieter) */
  { id:"bitDrip", name:"Drip", ms:250,
    play:(E, t, o = {}) => { const k = o.small ? 0.6 : 1;
      glide(E, voice(E, { send:0.3, bright:1, gain:0.6 }), t, NOTE.D6, NOTE.A6, 0.08, 0.16 * k);
      M.tick(E, t, { gain:0.12 * k, pitch:1.8 }); } },
  /* a cactus spine: a sharp tick and a yip up (opts.big: the last one) */
  { id:"bitPrick", name:"Prick", ms:400,
    play:(E, t, o = {}) => { const k = o.big ? 1.5 : 1;
      M.tick(E, t, { gain:0.35 * k, pitch:2 }); M.bell(E, t, NOTE.A6, { gain:0.12 * k, dec:0.2, send:0.2 });
      glide(E, voice(E, { send:0.2, bright:1, gain:0.5 }), t + 0.02, NOTE.A5, NOTE.D6 * (o.big ? 2 : 1), 0.14, 0.07 * k, { type:"triangle" }); } },
  /* a hurt glove shaken out: quick swishes, fading */
  { id:"bitShake", name:"Shake it out", ms:500,
    play:(E, t) => { const v = voice(E, { send:0.15, bright:0.9, gain:1 });
      for (let i = 0; i < 6; i++) burst(E, v, t + i * 0.075, { f:2600 - i * 120, q:1.1, d:0.045, peak:0.16 - i * 0.02 }); } },
  /* a little stepladder set down, or going over (opts.small) */
  { id:"bitLadder", name:"Stepladder", ms:300,
    play:(E, t, o = {}) => { const k = o.small ? 0.6 : 1;
      M.knock(E, t, { pitch:1.15, gain:0.4 * k }); M.knock(E, t + 0.06, { pitch:1.35, gain:0.25 * k });
      M.bell(E, t + 0.004, NOTE.Fs6, { gain:0.05 * k, dec:0.18, send:0.15 }); } },
  /* a push-up's breath, harder each time (opts.step) */
  { id:"bitHuff", name:"Huff", ms:450,
    play:(E, t, o = {}) => { const s = Math.min(3, Math.max(0, Number(o.step) || 0));
      swell(E, voice(E, { send:0.15, bright:0.6 }), t, { d:0.2 + s * 0.07, f0:950 + s * 60, f1:520, q:1.1, peak:0.2 + s * 0.06 }); } },
  /* flat on the floor, softly (the dust thud, quieter, for a vignette) */
  { id:"bitFlop", name:"Flop", ms:450,
    play:(E, t) => { M.drum(E, t, { f:62, dec:0.26, gain:0.4 }); M.felt(E, t, { gain:0.45 });
      burst(E, voice(E, { send:0.18, bright:0.5, gain:0.4 }), t + 0.01, { type:"lowpass", f:700, q:0.5, d:0.25, peak:0.35 }); } },
  /* a rubber glove's squeak */
  { id:"bitSqueak", name:"Squeak", ms:250,
    play:(E, t) => glide(E, voice(E, { send:0.2, bright:1, gain:0.5 }), t, NOTE.A5, NOTE.D6, 0.15, 0.09, { type:"triangle", vib:18, depth:0.02 }) },
  /* a broom's stroke across the dirt (opts.step varies it) */
  { id:"bitSweep", name:"Sweep", ms:400,
    play:(E, t, o = {}) => { const p = 1 + ((Number(o.step) || 0) % 3) * 0.06, v = voice(E, { send:0.15, bright:0.9 });
      swell(E, v, t, { d:0.28, f0:3200 * p, f1:2200 * p, q:0.9, peak:0.16 });
      for (let i = 0; i < 5; i++) burst(E, v, t + 0.03 + i * 0.045, { type:"highpass", f:3600, d:0.006, peak:0.1 }); } },
  /* a gust across the room, right to left (opts.ms) */
  { id:"bitGust", name:"Gust", ms:1300,
    play:(E, t, o = {}) => { const d = Math.max(0.5, (o.ms || 1300) / 1000);
      travelWhoosh(E, t, { d, from:0.8, to:-0.8, peak:0.22, f0:260, f1:1300 }); desertWind(E, t + 0.1, d * 0.8); } },
  /* paper unfolding, or turned (opts.ms; opts.small: quieter) */
  { id:"bitPaper", name:"Paper", ms:900, play:(E, t, o = {}) => crackle(E, t, Math.max(0.15, (o.ms || 900) / 1000), o.small ? 0.6 : 1, 4200) },
  /* paper crumpled into a ball */
  { id:"bitCrumple", name:"Crumple", ms:500, play:(E, t) => crackle(E, t, 0.45, 1.3, 2400, 2.2) },
  /* a paper ball off a rock, or into the dirt (opts.small) */
  { id:"bitPap", name:"Paper ball", ms:200,
    play:(E, t, o = {}) => { const k = o.small ? 0.6 : 1; M.knock(E, t, { pitch:1.7, gain:0.28 * k }); M.felt(E, t + 0.003, { gain:0.2 * k }); } },
  /* a roadrunner's beep beep, far off along the horizon */
  { id:"bitBeepFar", name:"Far beep", ms:500,
    play:(E, t) => { farBeep(E, t, NOTE.A5); farBeep(E, t + 0.19, NOTE.D6); } },
].map(Object.freeze));

/* idle's helpers (BIT_PARTS above) */
/* wings: soft low noise shaken fast by a tremolo, swelling in and out */
function flutter(E, t, d) {
  const c = E.ctx, v = voice(E, { send:0.15, bright:0.7 });
  const s = c.createBufferSource(); s.buffer = E.noise; s.loop = true;
  const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 520; bp.Q.value = 1.1;
  const trem = c.createGain(); trem.gain.value = 0.5;
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.16, t + Math.min(0.2, d * 0.3));
  g.gain.setValueAtTime(0.16, t + d * 0.75); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  s.connect(bp); bp.connect(trem); trem.connect(g); g.connect(v);
  track(E, s, bp, trem, g); trackSource(E, s);
  s.start(t, Math.random() * 0.5, d + 0.05);
  wobble(E, trem.gain, t, d, { rate:24, depth:0.5 });
}
/* wood under strain: stick-slip clicks through a resonance, a low groan */
function creak(E, t, d, k = 1) {
  const v = voice(E, { send:0.2, bright:0.8 });
  for (let x = 0, i = 0; x < d && i < 40; i++, x += 0.03 + Math.random() * 0.04)
    burst(E, v, t + x, { f:650 + Math.random() * 450, q:6, d:0.03, peak:0.9 * k });
  const g = voice(E, { send:0.2, bright:0.5, gain:0.6 });
  const bp = E.ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 560; bp.Q.value = 5;
  bp.connect(g); track(E, bp);
  const o = held(E, bp, t, NOTE.A2, d, 0.16 * k, { type:"sawtooth", a:d * 0.3 });
  wobble(E, o.frequency, t, d, { rate:3.2, depth:6 });
}
/* paper: a crackle of short bright ticks over a soft rustle */
function crackle(E, t, d, k = 1, f = 4200, density = 1) {
  const v = voice(E, { send:0.18, bright:1 });
  for (let x = 0, i = 0; x < d && i < 80; i++, x += (0.008 + Math.random() * 0.03) / density)
    burst(E, v, t + x, { type:"highpass", f:f * (0.7 + Math.random() * 0.6), d:0.006 + Math.random() * 0.01, peak:(0.08 + Math.random() * 0.12) * k });
  swell(E, voice(E, { send:0.15, bright:0.7 }), t, { d, f0:1400, f1:2600, q:0.8, peak:0.03 * k });
}
/* a bird call a long way off: the beep's reed, quiet, mostly room */
function farBeep(E, t, f) {
  const v = voice(E, { send:0.55, bright:0.7, gain:0.3 });
  const bp = E.ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = f * 2; bp.Q.value = 0.9;
  bp.connect(v); track(E, bp);
  held(E, bp, t, f, 0.11, 0.4, { type:"square", a:0.004, glide:-0.08 });
}

export const SOUNDS = Object.freeze(Object.fromEntries([...KIT, ...PARTS, ...BOARD_PARTS, ...BIT_PARTS].map(s => [s.id, s])));
export const SOUND_IDS = Object.freeze(KIT.map(s => s.id));
export const isSound = id => Object.prototype.hasOwnProperty.call(SOUNDS, id);

/* Play one recipe on an engine at context time t. `pan` places it by canvas
   x (ignored on a phone speaker); every material in the recipe shares it. */
export function playRecipe(E, id, t, { pan = 0, open = false, ...opts } = {}) {
  const s = SOUNDS[id];
  if (!s || !E) return false;
  const was = E.pan, outer = E.graph, wasOpen = E.open;
  const graph = { nodes:[], pending:0, closed:false };
  E.pan = clampPan(pan);
  E.open = !!open;
  E.graph = graph;
  let played = false;
  try { s.play(E, t, opts); played = true; }
  finally {
    E.pan = was;
    E.open = wasOpen;
    E.graph = outer;
    graph.closed = true;
    /* nothing left to end (or the recipe threw): let it go now */
    if (graph.pending === 0 || !played) releaseGraph(graph);
  }
  return true;
}

/* ── the TV's chip density rule ──
   Chips landing on the TV board: three or more inside 400 ms become one
   riffle; otherwise at most one clack per 120 ms, panned to the side of the
   board they landed on. The batch form is the prototype's roomChips(); the
   limiter below is the same rule applied one landing at a time, live. */
export const CHIP_DENSITY = Object.freeze({ minGap:120, crowd:3, window:400 });
export function roomChips(landings, { minGap = CHIP_DENSITY.minGap, crowd = CHIP_DENSITY.crowd, window = CHIP_DENSITY.window } = {}) {
  const sorted = [...landings].sort((a, b) => a.at - b.at);
  const out = [];
  let i = 0, last = -1e9;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1].at - sorted[i].at <= window) j++;
    const cluster = sorted.slice(i, j + 1);
    if (cluster.length >= crowd) {
      const at = Math.max(cluster[0].at, last + minGap);
      const pan = cluster.reduce((s, c) => s + c.pan, 0) / cluster.length;
      out.push({ at, kind:"riffle", n:Math.min(6, cluster.length), pan, merged:cluster.length });
      last = at + 200;
      i = j + 1;
    } else {
      const c = sorted[i];
      if (c.at - last >= minGap) { out.push({ at:c.at, kind:"clack", pan:c.pan, merged:1 }); last = c.at; }
      else out.push({ at:c.at, kind:"skip", pan:c.pan, merged:0 });
      i++;
    }
  }
  return out;
}
/* Live: a batch of landings (one broadcast can carry several) against what
   already sounded. Returns what to play now; `state` is the limiter memory. */
export function limitChips(memory, landings, { minGap = CHIP_DENSITY.minGap, crowd = CHIP_DENSITY.crowd,
  window = CHIP_DENSITY.window } = {}) {
  const mem = memory || { last:-1e9, recent:[], crowdUntil:-1e9 };
  const out = [];
  for (const landing of [...landings].sort((a, b) => a.at - b.at)) {
    const recent = [...mem.recent.filter(at => landing.at - at <= window), landing.at];
    mem.recent = recent;
    if (landing.at < mem.crowdUntil) { out.push({ at:landing.at, kind:"skip", pan:landing.pan }); continue; }
    if (recent.length >= crowd) {
      const at = Math.max(landing.at, mem.last + minGap);
      out.push({ at, kind:"riffle", n:Math.min(6, recent.length), pan:landing.pan });
      mem.last = at + 200;
      mem.crowdUntil = landing.at + window;
      continue;
    }
    if (landing.at - mem.last >= minGap) { out.push({ at:landing.at, kind:"clack", pan:landing.pan }); mem.last = landing.at; }
    else out.push({ at:landing.at, kind:"skip", pan:landing.pan });
  }
  return { memory:mem, plan:out };
}
