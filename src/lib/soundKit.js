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
     win song: its dry voice skips the hush gate. A cut recipe (a music
     bed's bar) runs dry and wet through its own gate, which the caller can
     close while it rings (playRecipe) */
  g.connect(lp); lp.connect(p); p.connect(E.cutDry || (E.open && E.openDry ? E.openDry : E.dry)); p.connect(s);
  s.connect(E.cutWet || E.wet);
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
  /* silent until its envelope starts: a source started a sample before
     its first automation event would pass that sample at full gain (a click) */
  const g = c.createGain(); g.gain.value = 0;
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
  const g = c.createGain(); g.gain.value = 0;
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
  /* two taps on the mic, the follow spot swinging round, its shutter
     opening on the hit, the PA coming up under the first note */
  karaoke:(E, t) => { M.felt(E, t + 1.0, { gain:0.55 }); M.knock(E, t + 1.0, { pitch:0.55, gain:0.32 });
    M.felt(E, t + 1.24, { gain:0.6 }); M.knock(E, t + 1.24, { pitch:0.55, gain:0.36 });
    hum(E, t + PLAY, HIT - PLAY, 260, 760, 0.045);
    M.knock(E, t + HIT - 0.03, { pitch:0.62, gain:0.6 }); M.clack(E, t + HIT - 0.028, { pitch:0.6, gain:0.28, double:false });
    const v = voice(E, { send:0.3, bright:0.5, gain:0.4 }); mode(E, v, t + HIT + 0.04, NOTE.D3, 1.1, 0.05, { a:0.08 });
    M.bell(E, t + HIT + 0.32, NOTE.A5, { gain:0.12, dec:0.9, send:0.3 }); },
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
  /* the river running, both paddles dipping in turn (left, right), the
     rush over the lip, then the floatie smacking down into the pool */
  float:(E, t) => { hum(E, t + 0.3, HIT - 0.3, 420, 260, 0.05);
    [0, 0.25, 0.5, 0.75].forEach((dt, i) => {
      burst(E, voice(E, { pan:i % 2 ? 0.3 : -0.3, send:0.25, bright:0.6, gain:0.32 }), t + PLAY + dt,
        { type:"bandpass", f:880 + i * 40, q:1.3, d:0.12, peak:0.42, a:0.01 });
      M.felt(E, t + PLAY + dt + 0.01, { gain:0.22, pan:i % 2 ? 0.3 : -0.3 }); });
    whoosh(E, t + HIT - 0.3, { d:0.3, f0:500, f1:1800, peak:0.1 });
    M.drum(E, t + HIT, { f:92, dec:0.26, gain:0.6 });
    burst(E, voice(E, { send:0.3, bright:1, gain:0.4 }), t + HIT + 0.01, { type:"highpass", f:2200, d:0.36, peak:0.42 });
    bloop(E, t + HIT + 0.06, NOTE.D4, 0.32); },
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

/* ── shared shapes for the cartoon foley (BIT_PARTS below) ──
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
     a wooden tick-tock under four bells on the motif. A cut recipe, so an
     early reveal (everyone locked in) closes a bar that still rings. */
  { id:"think", name:"The Final's clock", ms:THINK_BAR_S * 1000, cut:true,
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
/* ══ the action bits' foley (explosionwalk, dontlookback, quicksand) ══ */
/* a long noise on a looping source (it never runs off the end of the
   noise buffer): dying away from its peak (a roar, a rumble), or held and
   cut (`hold`: a hiss, a gurgle). Returns its gain. */
function noiseBed(E, dest, t, { d = 1, f = 500, q = 0.7, peak = 0.4, a = 0.004, type = "lowpass", hold = false } = {}) {
  const c = E.ctx;
  const s = c.createBufferSource(); s.buffer = E.noise; s.loop = true;
  const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  if (hold) g.gain.setValueAtTime(peak, t + Math.max(a, d - 0.05));
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(a + 0.01, d));
  s.connect(fl); fl.connect(g); g.connect(dest);
  track(E, s, fl, g); trackSource(E, s);
  s.start(t, Math.random() * 0.5); s.stop(t + Math.max(a + 0.01, d) + 0.05);
  return g;
}
/* dry little ticks scattered over d: fire crackling, sand thrown */
function crackle(E, t, d, { gain = 0.25, every = 0.05 } = {}) {
  for (let x = 0, i = 0; x < d && i < 48; i++, x += every * rnd(0.5, 1.5)) M.tick(E, t + x, { gain:gain * rnd(0.4, 1), pitch:rnd(1.2, 2) });
}
/* an explosion: the crack, the ground's thump under it, the roar dying,
   the buttes answering, debris ticking down. `slow` is the film slowed
   down under it: lower, longer, the top end gone */
function explosion(E, t, { slow = false } = {}) {
  const v = voice(E, { send:0.36, bright:slow ? 0.4 : 0.9, gain:1 });
  burst(E, v, t, { type:"highpass", f:1800, q:0.7, d:0.02, peak:0.9 });
  burst(E, v, t + 0.003, { f:700, q:0.6, d:0.1, peak:0.85 });
  M.drum(E, t, { f:slow ? NOTE.D2 / 2 : NOTE.D2, dec:slow ? 1.6 : 0.9, gain:1 });
  mode(E, v, t, slow ? 33 : 46, slow ? 1.8 : 1.1, 0.75, { drop:1.2 });
  phantom(E, v, t, 46, 0.4, 0.5);
  noiseBed(E, v, t + 0.01, { d:slow ? 2.6 : 1.4, f:slow ? 340 : 760, peak:0.55 });
  [[0.32, 0.24, 0.5], [0.71, 0.12, -0.55]].forEach(([dt, gain, pan]) =>
    noiseBed(E, voice(E, { send:0.55, bright:0.4, gain, pan }), t + dt * (slow ? 1.6 : 1), { d:0.5, f:520, peak:0.6 }));
  crackle(E, t + (slow ? 0.6 : 0.25), slow ? 1.4 : 0.8, { gain:slow ? 0.1 : 0.2, every:slow ? 0.12 : 0.06 });
}
const CARTOON_PARTS = Object.freeze([
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

  /* ══ action movie (explosionwalk, dontlookback, quicksand) ══ */
  /* the horizon going up (opts.slow: the shot drops into slow motion under it) */
  { id:"bitBoom", name:"Explosion", ms:2800,
    play:(E, t, o = {}) => explosion(E, t, { slow:!!o.slow }) },
  /* a boot on the dirt (opts.step: left, right) */
  { id:"bitStep", name:"Boot step", ms:200,
    play:(E, t, o = {}) => { const p = 1 + ((Number(o.step) || 0) % 2) * 0.06;
      M.knock(E, t, { pitch:0.72 * p, gain:0.55 }); M.felt(E, t + 0.003, { gain:0.38 });
      burst(E, voice(E, { send:0.1, bright:0.7, gain:0.5 }), t + 0.01, { f:1500, q:0.9, d:0.06, peak:0.18 }); } },
  /* a burning chip slamming into the dirt, and burning on */
  { id:"bitSlam", name:"Burning chip lands", ms:900,
    play:(E, t) => { M.drum(E, t, { f:82, dec:0.32, gain:0.95 }); M.clack(E, t + 0.002, { pitch:0.72, gain:0.8 });
      M.felt(E, t + 0.004, { gain:0.8 });
      noiseBed(E, voice(E, { send:0.2, bright:0.8, gain:0.7 }), t + 0.02, { type:"bandpass", f:1300, d:0.5, peak:0.25 });
      crackle(E, t + 0.1, 0.7, { gain:0.2, every:0.05 }); } },
  /* dark glasses slid down a nose (opts.up: pushed back up, a click home) */
  { id:"bitShades", name:"Glasses slide", ms:250,
    play:(E, t, o = {}) => { const up = !!o.up;
      M.tick(E, t + (up ? 0.08 : 0), { gain:0.65, pitch:up ? 1.9 : 1.5 });
      swell(E, voice(E, { send:0.12, bright:1, gain:0.8 }), t, { d:0.12, f0:up ? 1600 : 3200, f1:up ? 3400 : 1500, q:2, peak:0.22 }); } },
  /* light off a lens */
  { id:"bitGlint", name:"Glint", ms:1100,
    play:(E, t) => { M.bell(E, t, NOTE.D6, { gain:0.5, dec:1, send:0.35 }); M.bell(E, t + 0.05, NOTE.A6, { gain:0.32, dec:0.8, send:0.35 });
      burst(E, voice(E, { send:0.3, bright:1, gain:0.4 }), t, { type:"highpass", f:6500, d:0.06, peak:0.12 }); } },
  /* a lit fuse fizzing up (opts.ms), stopping dead */
  { id:"bitFuse", name:"Fuse", ms:1000,
    play:(E, t, o = {}) => { const d = Math.max(0.3, (o.ms || 1000) / 1000);
      const g = noiseBed(E, voice(E, { send:0.15, bright:1, gain:1 }), t, { type:"bandpass", f:5200, q:1.1, d, peak:0.14, a:0.03, hold:true });
      wobble(E, g.gain, t, d, { rate:23, depth:0.05 });
      crackle(E, t + 0.02, d - 0.06, { gain:0.16, every:0.045 }); } },
  /* a chip coming down in the dirt and hopping once (opts.step) */
  { id:"bitChipDrop", name:"Chip lands in the dirt", ms:300,
    play:(E, t, o = {}) => { const p = 0.92 + ((Number(o.step) || 0) % 4) * 0.04;
      M.clack(E, t, { pitch:p, gain:0.6 }); M.felt(E, t + 0.004, { gain:0.32 });
      M.clack(E, t + 0.13, { pitch:p * 1.02, gain:0.2, double:false }); } },
  /* a chip landing flat and settling like a coin */
  { id:"bitSpinDown", name:"Chip settles flat", ms:900,
    play:(E, t) => { M.clack(E, t, { pitch:0.9, gain:0.6 }); spinDown(E, t + 0.04, { dur:0.5, gain:0.55 }); } },
  /* quicksand taking something (opts.ms): a gurgle and its blups;
     opts.deep is a big glug as it goes under */
  { id:"bitSink", name:"Quicksand", ms:1200,
    play:(E, t, o = {}) => { const d = Math.max(0.25, (o.ms || 1200) / 1000);
      const v = voice(E, { send:0.2, bright:0.5, gain:1 });
      const g = noiseBed(E, v, t, { type:"bandpass", f:320, q:3, d, peak:o.deep ? 0.5 : 0.32, a:0.06, hold:true });
      wobble(E, g.gain, t, d, { rate:7.5, depth:0.2 });
      const blups = [[NOTE.D4, NOTE.A4], [NOTE.A3, NOTE.D4], [NOTE.Fs4, NOTE.D5]];
      for (let x = 0.08, i = 0; x < d - 0.05 && i < 12; i++, x += rnd(0.14, 0.3)) glide(E, v, t + x, ...blups[i % 3], 0.07, 0.14);
      if (o.deep) { glide(E, v, t, NOTE.D3, NOTE.D2, 0.3, 0.4); noiseBed(E, v, t, { f:300, d:0.35, peak:0.3 }); } } },
  /* gloves thrashing the air (opts.ms), sand thrown */
  { id:"bitFlail", name:"Flailing", ms:700,
    play:(E, t, o = {}) => { const d = Math.max(0.2, (o.ms || 700) / 1000);
      for (let x = 0, i = 0; x < d - 0.05 && i < 10; i++, x += 0.115)
        travelWhoosh(E, t + x, { d:0.1, from:i % 2 ? 0.3 : -0.3, to:i % 2 ? -0.3 : 0.3, peak:0.2, f0:700, f1:2600 });
      crackle(E, t + 0.05, d, { gain:0.12, every:0.09 }); } },
  /* reaching for all it is worth (opts.ms): a thin note straining up */
  { id:"bitStrain", name:"Straining", ms:500,
    play:(E, t, o = {}) => { const d = Math.max(0.2, (o.ms || 500) / 1000);
      glide(E, voice(E, { send:0.2, bright:0.8, gain:0.6 }), t, NOTE.A4, NOTE.D5, d, 0.12, { type:"triangle", vib:11, depth:0.025 }); } },
  /* a rubber glove closing */
  { id:"bitSqueak", name:"Glove squeak", ms:150,
    play:(E, t) => { glide(E, voice(E, { send:0.12, bright:1, gain:0.5 }), t, NOTE.E5, NOTE.B5, 0.09, 0.24, { type:"square" });
      M.tick(E, t, { gain:0.2, pitch:1.4 }); } },
  /* one bubble up through the sand: blup, pop */
  { id:"bitBubble", name:"Bubble", ms:300,
    play:(E, t) => { const v = voice(E, { send:0.25, bright:0.9, gain:0.8 });
      glide(E, v, t, NOTE.D4, NOTE.A4, 0.1, 0.3);
      M.tick(E, t + 0.11, { gain:0.5, pitch:1.5 }); burst(E, v, t + 0.11, { type:"highpass", f:3000, d:0.03, peak:0.2 }); } },
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
  { id:"bitSqueakSoft", name:"Soft squeak", ms:250,
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
  { id:"bitPaper", name:"Paper", ms:900, play:(E, t, o = {}) => paperCrackle(E, t, Math.max(0.15, (o.ms || 900) / 1000), o.small ? 0.6 : 1, 4200) },
  /* paper crumpled into a ball */
  { id:"bitCrumple", name:"Crumple", ms:500, play:(E, t) => paperCrackle(E, t, 0.45, 1.3, 2400, 2.2) },
  /* a paper ball off a rock, or into the dirt (opts.small) */
  { id:"bitPap", name:"Paper ball", ms:200,
    play:(E, t, o = {}) => { const k = o.small ? 0.6 : 1; M.knock(E, t, { pitch:1.7, gain:0.28 * k }); M.felt(E, t + 0.003, { gain:0.2 * k }); } },
  /* a roadrunner's beep beep, far off along the horizon */
  { id:"bitBeepFar", name:"Far beep", ms:500,
    play:(E, t) => { farBeep(E, t, NOTE.A5); farBeep(E, t + 0.19, NOTE.D6); } },
  /* ── the slapstick bits (springglove, toohype, dynamite) ── */
  /* a big button slammed: a chunky plastic click */
  { id:"bitClick", name:"Button", ms:200,
    play:(E, t) => { M.knock(E, t, { pitch:1.7, gain:0.6 }); M.clack(E, t + 0.004, { pitch:0.75, gain:0.55, double:false });
      M.tick(E, t + 0.05, { gain:0.3, pitch:1.2 }); } },
  /* a spring let go: a twang sliding up, a whoosh out, the coil humming on */
  { id:"bitSproing", name:"Spring lets go", ms:900,
    play:(E, t) => { glide(E, voice(E, { send:0.22, bright:1, gain:0.8 }), t, NOTE.D4, NOTE.D6, 0.12, 0.22, { type:"triangle", vib:30, depth:0.05 });
      travelWhoosh(E, t, { d:0.12, from:-0.35, to:0.45, peak:0.4, f0:900, f1:4200 });
      boing(E, t + 0.07, { f:NOTE.A4, d:0.7, peak:0.16 }); } },
  /* a punch landing: a leather thwack on a low thump */
  { id:"bitPow", name:"Punch", ms:600,
    play:(E, t) => { M.drum(E, t, { f:72, dec:0.32, gain:1 }); M.slap(E, t, { gain:0.95 });
      const v = voice(E, { send:0.2, bright:0.8, gain:0.9 });
      burst(E, v, t, { f:900, q:0.9, d:0.07, peak:0.8 }); burst(E, v, t + 0.003, { type:"lowpass", f:500, q:0.6, d:0.16, peak:0.6 });
      M.knock(E, t + 0.006, { pitch:0.7, gain:0.5 }); } },
  /* very far away in the sky: a high ping and its shimmer */
  { id:"bitTwinkle", name:"Ping", ms:1400,
    play:(E, t) => { M.bell(E, t, NOTE.A6, { gain:0.72, dec:1.2, send:0.42 }); M.bell(E, t, NOTE.D6, { gain:0.32, dec:1, send:0.42 });
      [NOTE.Fs6, NOTE.A6, NOTE.D6 * 2].forEach((f, i) => M.bell(E, t + 0.05 + i * 0.045, f, { gain:0.14, dec:0.4, send:0.5 })); } },
  /* a rubber bounce, a step up D each time (opts.step 0..3) */
  { id:"bitBounce", name:"Bounce", ms:400,
    play:(E, t, o = {}) => { const step = Math.max(0, Math.min(3, Number(o.step) || 0)), f = [NOTE.D4, NOTE.Fs4, NOTE.A4, NOTE.D5][step];
      glide(E, voice(E, { send:0.2, bright:0.8, gain:0.7 }), t, f * 0.7, f * 1.5, 0.16 + step * 0.03, 0.2, { type:"triangle" });
      M.knock(E, t, { pitch:1.2, gain:0.3 }); M.felt(E, t + 0.004, { gain:0.25 }); } },
  /* straight up like a rocket: a pop out of the shoes, a whistle climbing */
  { id:"bitLaunch", name:"Launch", ms:700,
    play:(E, t) => { M.knock(E, t, { pitch:1.5, gain:0.5 }); burst(E, voice(E, { send:0.1, gain:0.6 }), t, { f:600, q:1, d:0.05, peak:0.6 });
      glide(E, voice(E, { send:0.3, bright:1, gain:0.6 }), t + 0.02, NOTE.D5, NOTE.D6 * 2, 0.42, 0.14);
      swell(E, voice(E, { send:0.25, bright:1 }), t, { d:0.4, f0:500, f1:4000, q:0.8, peak:0.32 }); } },
  /* coming back down fast: a whistle falling (opts.ms) */
  { id:"bitFall", name:"Falling", ms:400,
    play:(E, t, o = {}) => { const d = Math.max(0.15, (o.ms || 260) / 1000);
      glide(E, voice(E, { send:0.25, bright:0.9, gain:0.7 }), t, NOTE.A6, NOTE.D5, d, 0.16);
      swell(E, voice(E, { send:0.2, bright:0.9 }), t, { d, f0:3000, f1:600, q:0.8, peak:0.22 }); } },
  /* into the ground: a heavy thump and the dirt cracking round it */
  { id:"bitPlant", name:"Planted", ms:800,
    play:(E, t) => { M.drum(E, t, { f:NOTE.D2, dec:0.6, gain:1 }); M.slap(E, t, { gain:0.7 });
      burst(E, voice(E, { send:0.2, bright:0.6, gain:0.8 }), t + 0.004, { type:"lowpass", f:800, q:0.5, d:0.3, peak:0.7 });
      for (let i = 0; i < 7; i++) M.knock(E, t + 0.03 + i * 0.03 + rnd(0, 0.015), { pitch:rnd(1.4, 2.2), gain:0.2 * (1 - i / 9) }); } },
  /* up out of the dirt: a cork pop */
  { id:"bitPop", name:"Pop", ms:250,
    play:(E, t) => { const v = voice(E, { send:0.18, bright:1, gain:0.8 });
      burst(E, v, t, { f:1400, q:1.4, d:0.02, peak:0.7 }); mode(E, v, t, NOTE.D5, 0.08, 0.35, { drop:-0.35 }); } },
  /* a little sneaker step, a squeak (opts.step alternates) */
  { id:"bitSneaker", name:"Sneaker step", ms:150,
    play:(E, t, o = {}) => { const up = (Number(o.step) || 0) % 2;
      glide(E, voice(E, { send:0.12, bright:1, gain:0.7 }), t, up ? NOTE.Fs5 : NOTE.E5, up ? NOTE.B5 : NOTE.A5, 0.07, 0.14);
      M.knock(E, t, { pitch:1.6, gain:0.24 }); } },
  /* a match struck: the scratch and the flare */
  { id:"bitMatch", name:"Match", ms:500,
    play:(E, t) => { const v = voice(E, { send:0.15, bright:1, gain:0.8 });
      for (let i = 0; i < 4; i++) burst(E, v, t + i * 0.012, { f:3200 - i * 300, q:1.6, d:0.02, peak:0.35 });
      swell(E, voice(E, { send:0.2, bright:0.6 }), t + 0.05, { d:0.35, f0:300, f1:1300, q:0.7, peak:0.3 }); } },
  /* a lit fuse: the hiss and its crackle, hotter as it burns down (opts.ms) */
  { id:"bitFuseHiss", name:"Fuse hiss", ms:1800,
    play:(E, t, o = {}) => { const d = Math.max(0.4, (o.ms || 1800) / 1000), c = E.ctx, v = voice(E, { send:0.15, bright:1 });
      const s = c.createBufferSource(); s.buffer = E.noise; s.loop = true;
      const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 5200; bp.Q.value = 0.8;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.16, t + 0.06);
      g.gain.linearRampToValueAtTime(0.26, t + d * 0.95); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      s.connect(bp); bp.connect(g); g.connect(v); track(E, s, bp, g); trackSource(E, s);
      s.start(t, Math.random(), d + 0.05);
      wobble(E, g.gain, t, d, { rate:23, depth:0.08 });
      for (let x = 0.05; x < d - 0.05; x += rnd(0.04, 0.11)) M.tick(E, t + x, { gain:0.12 + 0.12 * (x / d), pitch:rnd(1.4, 2.2) }); } },
  /* the dynamite: a deep blast, the air cracking, the bits coming down */
  { id:"bitBlast", name:"Dynamite blast", ms:2600,
    play:(E, t) => { M.drum(E, t, { f:NOTE.D2, dec:1.4, gain:1 }); M.drum(E, t + 0.01, { f:44, dec:1.8, gain:0.8 });
      const v = voice(E, { send:0.4, bright:0.9, gain:1 });
      burst(E, v, t, { type:"highpass", f:1800, q:0.6, d:0.03, peak:0.9 });
      burst(E, v, t + 0.002, { f:700, q:0.6, d:0.25, peak:0.9 });
      burst(E, v, t + 0.01, { type:"lowpass", f:420, q:0.5, d:1.6, peak:0.75 });
      for (let i = 0; i < 10; i++) M.knock(E, t + 0.25 + Math.pow(i / 10, 1.4) * 1.1 + rnd(0, 0.04),
        { pitch:rnd(1.2, 2.4), gain:0.16 * (1 - i / 12), pan:rnd(-0.6, 0.6) }); } },
  /* one dry cough of smoke */
  { id:"bitCough", name:"Cough", ms:400,
    play:(E, t) => { const v = voice(E, { send:0.15, bright:0.8, gain:1 });
      burst(E, v, t, { f:1300, q:1.1, d:0.08, peak:0.85 }); burst(E, v, t + 0.004, { type:"lowpass", f:500, q:0.6, d:0.06, peak:0.6 });
      burst(E, v, t + 0.13, { f:1100, q:1.1, d:0.06, peak:0.45 }); } },
  /* a glove landing in the dirt */
  { id:"bitGloveFlop", name:"Glove flop", ms:300,
    play:(E, t) => { M.felt(E, t, { gain:0.6 }); M.knock(E, t + 0.006, { pitch:0.95, gain:0.28 });
      burst(E, voice(E, { send:0.1, bright:0.5, gain:0.4 }), t + 0.01, { type:"lowpass", f:600, d:0.12, peak:0.4 }); } },
  /* ── the deadpan desert (butte, sunset, statue, vulture) ── */
  /* a fingertip on stone: one dry tock */
  { id:"bitPoke", name:"Poke", ms:200,
    play:(E, t) => { M.knock(E, t, { pitch:2.3, gain:0.26 }); M.tick(E, t + 0.002, { gain:0.3, pitch:1.4 }); } },
  /* a crack running up rock (opts.ms): sharp ticks climbing, a snap at the top */
  { id:"bitCrackle", name:"Rock cracks", ms:260,
    play:(E, t, o = {}) => { const d = Math.max(0.1, (o.ms || 200) / 1000), v = voice(E, { send:0.2, bright:1, gain:0.9 });
      for (let i = 0, x = 0; i < 12 && x < d; i++, x += d / 11) burst(E, v, t + x + rnd(0, 0.006), { type:"highpass", f:1800 + i * 300, q:0.8, d:0.01, peak:0.32 + i * 0.02 });
      mode(E, v, t, 140, 0.12, 0.25, { drop:0.4 }); burst(E, v, t + d, { f:2600, q:0.7, d:0.03, peak:0.5 }); } },
  /* rock breaking up and dropping away down a hole: a crunch, a rumble,
     stones knocking, falling away lower and quieter */
  { id:"bitCrumble", name:"Rock crumbles", ms:1100,
    play:(E, t) => { M.drum(E, t, { f:NOTE.D2, dec:0.4, gain:0.7 }); M.slap(E, t, { gain:0.5 });
      burst(E, voice(E, { send:0.3, bright:0.5, gain:0.8 }), t, { type:"lowpass", f:600, q:0.6, d:0.7, peak:0.4 });
      for (let i = 0; i < 16; i++) { const x = Math.pow(i / 16, 1.3) * 0.75;
        M.knock(E, t + 0.02 + x + rnd(0, 0.01), { pitch:rnd(0.6, 1.3) * (1 - x * 0.4), gain:(0.5 - i * 0.025) }); } } },
  /* falling away from us a long way (opts.ms): a whistle sliding down, quieter as it goes, cut dead */
  { id:"bitFallAway", name:"Falling away", ms:700,
    play:(E, t, o = {}) => { const d = Math.max(0.25, (o.ms || 700) / 1000), c = E.ctx, v = voice(E, { send:0.35, bright:0.9 });
      const osc = c.createOscillator(); osc.type = "sine";
      osc.frequency.setValueAtTime(NOTE.A6, t); osc.frequency.exponentialRampToValueAtTime(NOTE.D5, t + d);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.22, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.03, t + d * 0.95); g.gain.linearRampToValueAtTime(0.0001, t + d);
      osc.connect(g); g.connect(v); track(E, osc, g); trackSource(E, osc); osc.start(t); osc.stop(t + d + 0.03); } },
  /* far below: a small, soft thud and a long room */
  { id:"bitFarThud", name:"Far below", ms:900,
    play:(E, t) => { M.drum(E, t, { f:NOTE.D2 * 1.2, dec:0.3, gain:0.32, send:0.6 });
      burst(E, voice(E, { send:0.6, bright:0.35, gain:0.5 }), t + 0.01, { type:"lowpass", f:500, q:0.5, d:0.25, peak:0.3 }); } },
  /* gloves dusted off on each other (opts.step) */
  { id:"bitPat", name:"Dusting off", ms:200,
    play:(E, t, o = {}) => { M.felt(E, t, { gain:0.35 });
      burst(E, voice(E, { send:0.15, bright:0.8, gain:0.6 }), t, { f:1700 + ((Number(o.step) || 0) % 2) * 300, q:0.7, d:0.07, peak:0.35 }); } },
  /* a backglass lamp relay catching (opts.step): the sky steps warmer */
  { id:"bitRelamp", name:"Relamp", ms:250,
    play:(E, t, o = {}) => { const s = Math.max(0, Number(o.step) || 0);
      M.clack(E, t, { pitch:0.7 + s * 0.04, gain:0.22, double:false, bright:0.6 }); M.knock(E, t + 0.004, { pitch:1.1, gain:0.12 }); } },
  /* a winch letting out rope, click by click (opts.ms), a last clunk */
  { id:"bitRatchet", name:"Winch", ms:1200,
    play:(E, t, o = {}) => { const d = Math.max(0.3, (o.ms || 1100) / 1000);
      for (let x = 0, i = 0; x < d - 0.05 && i < 30; x += 0.085, i++) M.tick(E, t + x, { gain:0.32, pitch:1.2 - (i % 2) * 0.08 });
      M.knock(E, t + d, { pitch:1.3, gain:0.3 }); } },
  /* a glint off a lens: a bright ping */
  { id:"bitGleam", name:"Gleam", ms:1300,
    play:(E, t) => { M.bell(E, t, NOTE.A6, { gain:0.42, dec:1.1, send:0.4 }); M.bell(E, t + 0.004, NOTE.A6 * 1.5, { gain:0.12, dec:0.6, send:0.4 });
      burst(E, voice(E, { send:0.3, bright:1, gain:0.3 }), t, { type:"highpass", f:6000, d:0.05, peak:0.25 }); } },
  /* yanked straight up and away: a snap and a rising zip */
  { id:"bitYank", name:"Yank", ms:300,
    play:(E, t) => { M.tick(E, t, { gain:0.5, pitch:1.6 });
      glide(E, voice(E, { send:0.2, bright:1, gain:0.5 }), t + 0.01, NOTE.D5, NOTE.A6, 0.16, 0.14);
      swell(E, voice(E, { send:0.15, bright:0.9 }), t, { d:0.18, f0:900, f1:4200, q:0.9, peak:0.3 }); } },
  /* a sheen running down metal: bells run down the motif over a shimmer */
  { id:"bitSheen", name:"Turned to gold", ms:1400,
    play:(E, t) => { [NOTE.A6, NOTE.Fs6, NOTE.D6, NOTE.A5, NOTE.Fs5].forEach((f, i) => M.bell(E, t + i * 0.07, f, { gain:0.24, dec:0.9, send:0.4 }));
      swell(E, voice(E, { send:0.4, bright:1 }), t, { d:0.5, f0:7000, f1:3000, q:2, peak:0.08 }); } },
  /* a stone block grinding up out of the ground (opts.ms) */
  { id:"bitGrind", name:"Stone grinds", ms:700,
    play:(E, t, o = {}) => { const d = Math.max(0.2, (o.ms || 600) / 1000), c = E.ctx, v = voice(E, { send:0.2, bright:0.6, gain:1 });
      const s = c.createBufferSource(); s.buffer = E.noise; s.loop = true;
      const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 380; bp.Q.value = 1.4;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5, t + 0.06);
      g.gain.setValueAtTime(0.5, t + d * 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      s.connect(bp); bp.connect(g); g.connect(v); track(E, s, bp, g); trackSource(E, s); s.start(t, Math.random(), d + 0.05);
      wobble(E, g.gain, t, d, { rate:23, depth:0.2 }); held(E, v, t, NOTE.D2, d, 0.12, { a:0.05 }); } },
  /* wings (opts.small: a little bird; opts.step) */
  { id:"bitFlap", name:"Wings", ms:250,
    play:(E, t, o = {}) => { const small = !!o.small, v = voice(E, { send:0.15, bright:small ? 0.9 : 0.5, gain:small ? 0.4 : 0.8 });
      burst(E, v, t, { type:"lowpass", f:small ? 2400 : 700, q:0.6, d:small ? 0.05 : 0.12, peak:0.6, a:0.012 });
      if (!small) M.felt(E, t + 0.01, { gain:0.25 }); } },
  /* a beak on gold: tink */
  { id:"bitTink", name:"Tink", ms:700,
    play:(E, t) => { M.bell(E, t, NOTE.A6, { gain:0.38, dec:0.6, send:0.3 }); M.tick(E, t, { gain:0.45, pitch:2 }); } },
  /* a little bird fluffing itself up: a quick soft flutter */
  { id:"bitFluff", name:"Fluff", ms:300,
    play:(E, t) => { const v = voice(E, { send:0.15, bright:0.8, gain:0.5 });
      for (let i = 0; i < 6; i++) burst(E, v, t + i * 0.035, { f:2200 - i * 120, q:0.8, d:0.03, peak:0.45 - i * 0.03 }); } },
  /* a metal arm sagging slowly (opts.ms): a long creak sliding down */
  { id:"bitDroop", name:"Metal sags", ms:1000,
    play:(E, t, o = {}) => { const d = Math.max(0.3, (o.ms || 900) / 1000), c = E.ctx, v = voice(E, { send:0.25, bright:0.7, gain:1 });
      const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 900; bp.Q.value = 3; bp.connect(v); track(E, bp);
      const osc = held(E, bp, t, NOTE.D4, d, 0.36, { type:"sawtooth", a:0.08 });
      osc.frequency.exponentialRampToValueAtTime(NOTE.A3, t + d); wobble(E, osc.frequency, t, d, { rate:11, depth:6 }); } },
  /* a short shuffle in the dirt (opts.step) */
  { id:"bitScoot", name:"Scoot", ms:150,
    play:(E, t, o = {}) => { const s = (Number(o.step) || 0) % 2;
      swell(E, voice(E, { send:0.1, bright:0.8, gain:0.9 }), t, { d:0.09, f0:2400 - s * 300, f1:900, q:1, peak:0.35 }); M.felt(E, t + 0.07, { gain:0.2 }); } },
  /* a napkin flicked open and tucked in */
  { id:"bitFwip", name:"Napkin", ms:200,
    play:(E, t) => { const v = voice(E, { send:0.15, bright:1, gain:0.8 });
      burst(E, v, t, { type:"highpass", f:3000, q:0.7, d:0.02, peak:0.4 }); swell(E, v, t, { d:0.12, f0:1500, f1:4000, q:0.9, peak:0.3 }); } },
  /* a knife drawn across a fork: shing */
  { id:"bitShing", name:"Knife and fork", ms:1000,
    play:(E, t) => { swell(E, voice(E, { send:0.3, bright:1, gain:1 }), t, { d:0.24, f0:2500, f1:6500, q:6, peak:0.3 });
      M.bell(E, t + 0.2, NOTE.A6, { gain:0.25, dec:0.7, send:0.35 }); M.bell(E, t + 0.2, NOTE.E6, { gain:0.12, dec:0.5, send:0.35 }); } },
  /* ══ the team bits (Oct 12) ══ */
  /* ── dominoes ── */
  /* a line going over (opts.ms): clacks one after another, a little
     faster as the chain runs, panned along it left to right (opts.dir -1:
     right to left) */
  { id:"bitClatter", name:"Domino chain", ms:900,
    play:(E, t, o = {}) => { const d = Math.max(0.2, (o.ms || 800) / 1000), n = Math.max(3, Math.min(8, Math.round(d / 0.12)));
      const way = o.dir < 0 ? -1 : 1;
      for (let i = 0; i < n; i++) {
        const x = d * Math.pow(i / Math.max(1, n - 1), 1.12), pan = n > 1 ? way * (-0.6 + 1.2 * i / (n - 1)) : 0;
        M.clack(E, t + x, { pitch:0.86 + (i % 3) * 0.05, gain:0.5, double:false, pan });
        M.felt(E, t + x + 0.004, { gain:0.18 });
      } } },
  /* ── tugofwar ── */
  /* ── slowmowalk ── */
  /* the rest of a chain of far blasts along the horizon (opts.ms): after
     the first, dull booms one after another, panned left to right */
  { id:"bitBoomChain", name:"Far blasts in a row", ms:1600,
    play:(E, t, o = {}) => { const d = Math.max(0.3, (o.ms || 1200) / 1000), n = Math.max(3, Math.min(6, Math.round(d / 0.24) + 1));
      for (let i = 1; i < n; i++) {
        const x = d * i / (n - 1), pan = -0.5 + 1 * i / (n - 1);
        M.drum(E, t + x, { f:NOTE.D2 * (0.9 + (i % 2) * 0.12), dec:0.7, gain:0.55, pan });
        noiseBed(E, voice(E, { send:0.45, bright:0.4, gain:0.5, pan }), t + x + 0.005, { d:0.6, f:420, peak:0.45 });
      } } },
  /* ── pyramid ── */
  /* ── teamphoto ── */
  /* a camera's self-timer (opts.ms): blips coming faster and faster, the
     last ones nearly a tone */
  { id:"bitTimer", name:"Self-timer", ms:2500,
    play:(E, t, o = {}) => { const d = Math.max(0.6, (o.ms || 2500) / 1000);
      const v = voice(E, { send:0.15, bright:1, gain:0.5 });
      for (let x = 0, gap = 0.42; x < d - 0.02; x += gap, gap = Math.max(0.07, gap * 0.8)) {
        held(E, v, t + x, NOTE.A6, Math.min(0.07, gap * 0.5), 0.3, { type:"triangle", a:0.003 });
        M.tick(E, t + x, { gain:0.12, pitch:1.8 });
      } } },
  /* a flash going off: the shutter's clack, the flash's rising whine */
  { id:"bitShutter", name:"Shutter and flash", ms:900,
    play:(E, t) => { M.clack(E, t, { pitch:1.1, gain:0.6, double:true }); M.tick(E, t + 0.03, { gain:0.35, pitch:1.6 });
      glide(E, voice(E, { send:0.2, bright:1, gain:0.18 }), t + 0.05, NOTE.D6, NOTE.D6 * 2, 0.6, 0.12, { type:"sine" }); } },
  /* ── victorylap ── */
  /* a flag snapping in the wind (opts.ms): soft cloth cracks in a slow run */
  { id:"bitFlagFlap", name:"Flag flapping", ms:2400,
    play:(E, t, o = {}) => { const d = Math.max(0.4, (o.ms || 2400) / 1000);
      for (let x = 0, i = 0; x < d; x += 0.34 + (i % 2) * 0.12, i++) {
        const v = voice(E, { send:0.2, bright:0.7, gain:0.5, pan:rnd(-0.15, 0.15) });
        burst(E, v, t + x, { type:"bandpass", f:900 + (i % 3) * 180, q:0.7, d:0.07, peak:0.55, a:0.01 });
      } } },
  /* the wind dropping out of a flag: the last of the gust sliding down,
     and a soft falling whistle as it hangs limp */
  { id:"bitFlagSag", name:"Flag goes limp", ms:1000,
    play:(E, t) => { swell(E, voice(E, { send:0.25, bright:0.6, gain:0.6 }), t, { d:0.5, f0:1200, f1:300, q:0.8, peak:0.2 });
      glide(E, voice(E, { send:0.3, bright:0.8, gain:0.35 }), t + 0.15, NOTE.A5, NOTE.D5, 0.7, 0.1, { type:"sine" }); } },
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
function paperCrackle(E, t, d, k = 1, f = 4200, density = 1) {
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

/* ══ the neon bits (Oct 14, features/gags: neon signs, chips with no
   hands, the house hand). New foley for the new catalog; the cartoon
   parts above stay in the kit. Every pitched note stays in D. ══ */
/* a semitone above D4, for the piano */
const semi = n => NOTE.D4 * Math.pow(2, n / 12);
/* a honky-tonk piano note: two strings a hair apart, a hammer's knock */
function piano(E, t, f, { gain = 0.5, dec = 1.2, pan = 0 } = {}) {
  const v = voice(E, { pan, send:0.26, bright:0.85, gain });
  mode(E, v, t, f, dec, 0.22, { a:0.002, type:"triangle" });
  mode(E, v, t, f * 1.006, dec * 0.9, 0.16, { a:0.002, type:"triangle" });
  mode(E, v, t, f * 2.003, dec * 0.4, 0.06, { a:0.002 });
  burst(E, v, t, { f:2400, q:0.8, d:0.012, peak:0.12 });
}
/* mains hum through a tube: a buzzing saw, band-passed */
function buzz(E, t, d, { peak = 0.06, f = 120, up = false } = {}) {
  const v = voice(E, { send:0.12, bright:0.9, gain:1 });
  const bp = E.ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1300; bp.Q.value = 1.6;
  bp.connect(v); track(E, bp);
  const o = held(E, bp, t, f, d, peak, { type:"sawtooth", a:up ? d * 0.5 : 0.01 });
  wobble(E, o.frequency, t, d, { rate:11, depth:up ? 6 : 1.5 });
}
const NEON_PARTS = Object.freeze([
  /* a tube catching (opts.up: lighting, a rising crackle) or buzzing (opts.ms) */
  { id:"neonBuzz", name:"Tube buzz", ms:400,
    play:(E, t, o = {}) => { const d = Math.max(0.12, (o.ms || 400) / 1000);
      buzz(E, t, d, { peak:o.small ? 0.04 : 0.07, up:!!o.up });
      for (let i = 0; i < (o.up ? 5 : 3); i++) M.tick(E, t + i * d / (o.up ? 6 : 4) * rnd(0.6, 1.2), { gain:0.22 * rnd(0.5, 1), pitch:rnd(1.6, 2.2) });
      if (o.up) swell(E, voice(E, { send:0.15, bright:1, gain:0.6 }), t, { d, f0:500, f1:2600, q:1.4, peak:0.08 }); } },
  /* a fingernail flick: a sharp snap */
  { id:"neonFlick", name:"Flick", ms:160,
    play:(E, t) => { M.tick(E, t, { gain:0.9, pitch:2.1 }); M.knock(E, t + 0.002, { pitch:1.9, gain:0.35 });
      burst(E, voice(E, { send:0.15, bright:1, gain:0.6 }), t, { type:"highpass", f:5200, d:0.018, peak:0.4 }); } },
  /* a bit's own little groove when no win song comes (opts.ms): kick, hat
     and a bass line in D at 125 bpm */
  { id:"bitGroove", name:"Groove", ms:2600,
    play:(E, t, o = {}) => { const d = Math.max(0.5, (o.ms || 2600) / 1000), beat = 0.48;
      const bass = [NOTE.D3, NOTE.D3, NOTE.A2, NOTE.D3 * 0.75];
      const v = voice(E, { send:0.1, bright:0.45, gain:0.55 });
      for (let i = 0, x = 0; x < d - 0.05; i++, x += beat / 2) {
        if (i % 2 === 0) { M.drum(E, t + x, { f:58, dec:0.22, gain:0.55 });
          held(E, v, t + x, bass[(i / 2) % 4], beat * 0.42, 0.2, { type:"triangle", a:0.004 }); }
        else burst(E, voice(E, { send:0.08, bright:1, gain:0.35 }), t + x, { type:"highpass", f:7000, d:0.03, peak:0.4 });
        if (i % 8 === 4) M.slap(E, t + x, { gain:0.35 });
      } } },
  /* a needle dropping on a record: the thump, the crackle of the run-in */
  { id:"bitNeedle", name:"Needle drop", ms:900,
    play:(E, t) => { M.knock(E, t, { pitch:0.72, gain:0.55 }); M.tick(E, t + 0.004, { gain:0.5, pitch:1.4 });
      noiseBed(E, voice(E, { send:0.1, bright:1, gain:0.6 }), t + 0.01, { type:"highpass", f:3200, d:0.85, peak:0.05 });
      crackle(E, t + 0.02, 0.8, { gain:0.12, every:0.07 }); } },
  /* a record scratch: the needle dragged across it, there and back */
  { id:"bitScratch", name:"Record scratch", ms:500,
    play:(E, t) => { const v = voice(E, { send:0.12, bright:1, gain:0.8 });
      glide(E, v, t, 420, 1500, 0.12, 0.22, { type:"sawtooth" }); glide(E, v, t + 0.13, 1500, 260, 0.24, 0.24, { type:"sawtooth" });
      swell(E, voice(E, { send:0.1, bright:1, gain:0.9 }), t, { d:0.34, f0:700, f1:3400, q:1.2, peak:0.3 });
      M.tick(E, t + 0.37, { gain:0.4, pitch:1.3 }); } },
  /* a big knife switch thrown: the clunk and the zap */
  { id:"bitSwitch", name:"Switch thrown", ms:700,
    play:(E, t) => { M.knock(E, t, { pitch:0.6, gain:0.95 }); M.clack(E, t + 0.004, { pitch:0.7, gain:0.6, double:false });
      burst(E, voice(E, { send:0.2, bright:1, gain:0.6 }), t + 0.01, { type:"highpass", f:5000, d:0.08, peak:0.35 });
      buzz(E, t + 0.02, 0.4, { peak:0.09, f:120 }); crackle(E, t + 0.02, 0.25, { gain:0.2, every:0.03 }); } },
  /* glitter off a disco ball (opts.ms): high bells scattered, turning */
  { id:"bitDisco", name:"Glitter", ms:1500,
    play:(E, t, o = {}) => { const d = Math.max(0.4, (o.ms || 1500) / 1000);
      for (let x = 0, i = 0; x < d && i < 30; i++, x += rnd(0.05, 0.12))
        M.bell(E, t + x, ladderNote(8 + Math.floor(rnd(0, 6))), { gain:0.12 * rnd(0.5, 1), dec:0.5, send:0.45, pan:rnd(-0.5, 0.5) });
      swell(E, voice(E, { send:0.3, bright:1 }), t, { d, f0:3000, f1:6000, q:2, peak:0.03 }); } },
  /* a coin dropping into a slot and rolling down inside */
  { id:"bitCoin", name:"Coin in the slot", ms:900,
    play:(E, t) => { M.clack(E, t, { pitch:1.5, gain:0.6, double:false });
      for (let i = 0; i < 5; i++) M.bell(E, t + 0.08 + i * 0.07, NOTE.A6, { gain:0.12 - i * 0.015, dec:0.15, send:0.15 });
      M.knock(E, t + 0.5, { pitch:1.1, gain:0.45 }); } },
  /* a machine trying to start (opts.ms): a motor that catches and drops */
  { id:"bitSputter", name:"Sputter", ms:1200,
    play:(E, t, o = {}) => { const d = Math.max(0.3, (o.ms || 1200) / 1000);
      const v = voice(E, { send:0.15, bright:0.6, gain:0.7 });
      for (let x = 0, i = 0; x < d && i < 24; i++) { const on = rnd(0.05, 0.14);
        held(E, v, t + x, rnd(100, 160), on, 0.16, { type:"sawtooth", a:0.006 });
        burst(E, voice(E, { send:0.1, bright:0.5, gain:0.5 }), t + x, { type:"lowpass", f:900, d:on * 0.6, peak:0.3 });
        x += on + rnd(0.02, 0.1); } } },
  /* one deep bass hit (an 808's boom) */
  { id:"bitBass", name:"Bass hit", ms:1200,
    play:(E, t) => { const v = voice(E, { send:0.15, bright:0.4, gain:1 });
      mode(E, v, t, NOTE.D2 * 0.75, 1, 0.95, { drop:1.6, a:0.003 }); phantom(E, v, t, NOTE.D2, 0.6, 0.7);
      M.drum(E, t, { f:NOTE.D2, dec:0.5, gain:0.7 }); M.slap(E, t, { gain:0.3 }); } },
  /* a lowrider's hydraulics: the hiss, the clunk, a spring */
  { id:"bitHydraulic", name:"Hydraulics", ms:700,
    play:(E, t) => { noiseBed(E, voice(E, { send:0.12, bright:1, gain:0.7 }), t, { type:"highpass", f:2400, d:0.22, peak:0.3 });
      M.knock(E, t + 0.16, { pitch:0.55, gain:0.9 }); boing(E, t + 0.18, { f:NOTE.A3, d:0.3, peak:0.1 }); } },
  /* a saloon piano chord (opts.step: I, IV, V in D) */
  { id:"bitChord", name:"Piano chord", ms:1600,
    play:(E, t, o = {}) => { const roots = [0, 5, 7], r = roots[(Number(o.step) || 0) % 3];
      [r, r + 4, r + 7, r + 12].forEach((n, i) => piano(E, t + i * 0.006, semi(n), { gain:0.42, dec:1.5 }));
      piano(E, t, semi(r - 12), { gain:0.36, dec:1.3 }); } },
  /* one piano key (opts.step: up the scale) */
  { id:"bitPlink", name:"Piano key", ms:800,
    play:(E, t, o = {}) => piano(E, t, ladderNote(4 + (Number(o.step) || 0) % 8), { gain:0.4, dec:0.8 }) },
  /* a pinball flipper's solenoid: a thunk and its buzz */
  { id:"bitFlipper", name:"Flipper", ms:400,
    play:(E, t) => { M.knock(E, t, { pitch:0.9, gain:0.9 }); M.clack(E, t + 0.003, { pitch:0.8, gain:0.6, double:false });
      buzz(E, t, 0.12, { peak:0.08, f:120 }); } },
  /* a pinball bumper: pop and ding */
  { id:"bitBumper", name:"Bumper", ms:900,
    play:(E, t) => { M.knock(E, t, { pitch:1.4, gain:0.7 }); M.bell(E, t + 0.004, NOTE.D6, { gain:0.42, dec:0.7, send:0.3 });
      M.bell(E, t + 0.004, NOTE.A6, { gain:0.24, dec:0.5, send:0.3 }); } },
  /* a big lamp clunking on, and humming */
  { id:"bitSpotlight", name:"Spotlight", ms:1200,
    play:(E, t) => { M.knock(E, t, { pitch:0.5, gain:1 }); M.clack(E, t + 0.006, { pitch:0.6, gain:0.5, double:false });
      buzz(E, t + 0.02, 1, { peak:0.05, f:120 });
      burst(E, voice(E, { send:0.3, bright:1, gain:0.4 }), t + 0.01, { type:"highpass", f:6000, d:0.2, peak:0.15 }); } },
  /* grinding sparks (opts.ms) */
  { id:"bitSparks", name:"Sparks", ms:1200,
    play:(E, t, o = {}) => { const d = Math.max(0.25, (o.ms || 1200) / 1000);
      noiseBed(E, voice(E, { send:0.15, bright:1, gain:0.8 }), t, { type:"bandpass", f:4200, q:2.5, d, peak:0.12, hold:true });
      crackle(E, t, d, { gain:0.3, every:0.025 }); } },
  /* a rocket going up (opts.ms) and bursting */
  { id:"bitFirework", name:"Firework", ms:1800,
    play:(E, t, o = {}) => { const up = Math.max(0.25, ((o.ms || 1800) - 900) / 1000);
      glide(E, voice(E, { send:0.3, bright:1, gain:0.35 }), t, 900, 2600, up, 0.12, { type:"sine" });
      noiseBed(E, voice(E, { send:0.2, bright:1, gain:0.4 }), t, { type:"highpass", f:3000, d:up, peak:0.06 });
      const b = t + up; M.drum(E, b, { f:NOTE.D2, dec:0.7, gain:0.9 });
      burst(E, voice(E, { send:0.45, bright:1, gain:0.8 }), b, { f:1200, q:0.6, d:0.12, peak:0.7 });
      crackle(E, b + 0.15, 0.7, { gain:0.25, every:0.035 }); } },
  /* a firework burst, no rocket */
  { id:"bitBang", name:"Firework burst", ms:1200,
    play:(E, t) => { M.drum(E, t, { f:NOTE.D2, dec:0.7, gain:0.9 }); M.slap(E, t, { gain:0.5 });
      burst(E, voice(E, { send:0.45, bright:1, gain:0.8 }), t, { f:1200, q:0.6, d:0.12, peak:0.7 });
      crackle(E, t + 0.15, 0.7, { gain:0.25, every:0.035 }); } },
  /* a croupier's rake across the felt (opts.ms) */
  { id:"bitRake", name:"Rake", ms:700,
    play:(E, t, o = {}) => { const d = Math.max(0.2, (o.ms || 700) / 1000);
      swell(E, voice(E, { send:0.12, bright:0.6, gain:1 }), t, { d, f0:420, f1:700, q:0.7, peak:0.32 });
      M.felt(E, t + d - 0.04, { gain:0.5 }); } },
  /* rock rumbling (opts.ms) */
  { id:"bitRumble", name:"Rumble", ms:1500,
    play:(E, t, o = {}) => { const d = Math.max(0.4, (o.ms || 1500) / 1000);
      noiseBed(E, voice(E, { send:0.25, bright:0.4, gain:1 }), t, { type:"lowpass", f:220, d, peak:0.55, a:0.15 });
      for (let x = 0, i = 0; x < d && i < 30; i++, x += rnd(0.08, 0.2)) M.knock(E, t + x, { pitch:rnd(0.45, 0.7), gain:rnd(0.15, 0.35) }); } },
  /* a coin rolling on its edge (opts.ms): a soft run of contacts */
  { id:"bitRoll", name:"Rolling", ms:1200,
    play:(E, t, o = {}) => { const d = Math.max(0.3, (o.ms || 1200) / 1000);
      noiseBed(E, voice(E, { send:0.1, bright:0.5, gain:0.6 }), t, { type:"lowpass", f:700, d, peak:0.12, hold:true });
      for (let x = 0, i = 0; x < d && i < 60; i++, x += 0.09) M.clack(E, t + x, { pitch:0.75, gain:0.12, bright:0.4, double:false }); } },
  /* an engine idling (opts.ms) */
  { id:"bitEngine", name:"Engine idle", ms:1600,
    play:(E, t, o = {}) => { const d = Math.max(0.4, (o.ms || 1600) / 1000);
      const v = voice(E, { send:0.12, bright:0.35, gain:1 });
      const g = E.ctx.createGain(); g.gain.value = 0.7; g.connect(v); track(E, g);
      held(E, g, t, NOTE.D2 * 0.75, d, 0.32, { type:"sawtooth", a:0.08 });
      held(E, g, t, NOTE.D2 * 1.5, d, 0.12, { type:"square", a:0.08 });
      wobble(E, g.gain, t, d, { rate:9, depth:0.35 }); } },
].map(Object.freeze));
export const BIT_PARTS = Object.freeze([...CARTOON_PARTS, ...NEON_PARTS]);

/* ── karaoke (features/tv/karaokeSound.js cues them on the room's clock) ── */
export const KARAOKE_PARTS = Object.freeze([
  /* a Legendary vote rains over its singer: a drum and a slap, the motif
     rung up bright, then a sparkle of high bells falling through it */
  { id:"legendary", name:"Legendary", ms:2600,
    play:(E, t) => { M.drum(E, t, { f:NOTE.D2, dec:0.8, gain:0.8 }); M.slap(E, t + 0.004, { gain:0.5 });
      [NOTE.D5, NOTE.Fs5, NOTE.A5, NOTE.D6].forEach((f, i) => M.bell(E, t + i * 0.07, f, { gain:0.5 - i * 0.04, dec:2.2, send:0.35 }));
      for (let i = 0; i < 9; i++) M.bell(E, t + 0.32 + i * 0.11, ladderNote(13 - (i % 6)), { gain:0.14, dec:0.5, send:0.4 }); } },
].map(Object.freeze));

/* ── Where and When (features/tv/geoSound.js cues the room's, on the
   server clock; the phone plays its own taps and its score on the you
   bus). Every pitched note stays in D. ── */
const B1 = NOTE.B4 / 8, E2 = NOTE.E4 / 4, B3 = NOTE.B4 / 2, A3 = NOTE.A3;
/* one bar of the guessing bed, in seconds: 120 a minute in four, so its
   beats fall on the clock's whole seconds (the last ten's ticks ride beats
   one and three) */
export const GEO_BAR_S = 2;
/* the bed's four-bar turn (I, vi, ii, V on D's five notes): the pulse's
   root and eight swung eighths of plucks, the eighth a passing note into
   the next bar */
export const GEO_BED = Object.freeze([
  Object.freeze({ root:NOTE.D2, notes:Object.freeze([NOTE.D4, NOTE.A4, NOTE.Fs4, NOTE.A4, NOTE.D5, NOTE.A4, NOTE.Fs4, NOTE.E4]) }),
  Object.freeze({ root:B1, notes:Object.freeze([B3, NOTE.Fs4, NOTE.D4, NOTE.Fs4, NOTE.B4, NOTE.Fs4, NOTE.D4, NOTE.E4]) }),
  Object.freeze({ root:E2, notes:Object.freeze([NOTE.E4, NOTE.B4, NOTE.A4, NOTE.B4, NOTE.E5, NOTE.B4, NOTE.A4, NOTE.Fs4]) }),
  Object.freeze({ root:NOTE.A2, notes:Object.freeze([A3, NOTE.E4, NOTE.A4, NOTE.E4, NOTE.B4, NOTE.A4, NOTE.E4, NOTE.Fs4]) }),
]);
/* the swing: an offbeat eighth lands this far late (a 0.25 s eighth) */
const GEO_SWING_S = 0.055;
/* the bed's level against the cues over it: about 18 dB under a lock's peak */
export const GEO_BED_LEVEL = 0.6;
/* the pulse: a soft round low note, its octave carrying it on a small speaker */
function bedPulse(E, t, f, peak) {
  const v = voice(E, { send:0.08, bright:0.3, gain:GEO_BED_LEVEL });
  mode(E, v, t, f, 0.42, peak, { a:0.012, drop:0.08 });
  mode(E, v, t, f * 2, 0.24, peak * 0.32, { a:0.01, type:"triangle" });
}
/* a plucked note, kalimba-soft; `bright` opens its filter */
function bedPluck(E, t, f, peak, bright, pan = 0) {
  const v = voice(E, { send:0.14, bright, gain:GEO_BED_LEVEL, pan });
  mode(E, v, t, f, 0.45, peak, { a:0.003, type:"triangle" });
  mode(E, v, t, f * 2, 0.14, peak * 0.28, { a:0.002 });
}
/* the pad: the chord's root and fifth held soft under the bar, rising in
   as the last bar's falls away, so the bars run on as one bed */
function bedPad(E, t, f, peak) {
  const v = voice(E, { send:0.2, bright:0.075, gain:GEO_BED_LEVEL });
  [[f, peak, "triangle"], [f * 1.5, peak * 0.7, "sine"]].forEach(([freq, p, type]) => {
    const o = E.ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = E.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(p, t + 0.3);
    g.gain.setValueAtTime(p, t + GEO_BAR_S - 0.05);
    g.gain.linearRampToValueAtTime(0.0001, t + GEO_BAR_S + 0.3);
    o.connect(g); g.connect(v);
    track(E, o, g); trackSource(E, o);
    o.start(t); o.stop(t + GEO_BAR_S + 0.33);
  });
}
/* a brush on the snare: a short high noise */
function bedBrush(E, t, peak) {
  burst(E, voice(E, { send:0.06, bright:1, gain:GEO_BED_LEVEL }), t, { type:"highpass", f:6500, q:0.7, d:0.03, peak });
}
/* The bed's builder, shared by Where and When and Trivia: one bar of a
   style's four-bar turn (opts.bar picks the chord; opts.tense 1..5 over
   the last bars opens the plucks' filter and fills the brushes in;
   opts.last leaves the bar's end clear for the knock at zero). A bar's
   last notes ring a little into the next, so the bars run on as one
   groove; a cut closes the bar's own gate (cut:true). A style is its turn
   (a root and eight eighths a bar), its swing, its pulse ([eighth, peak]),
   the pulse that fills in from tense 4, the pad's level, the pluck and its
   peaks (on, off the beat), the brushes' peak an eighth, and the high
   answer on four from tense 3 (its second note at tense 5). */
function bedBar(E, t, o, style) {
  const bar = style.turn[Math.max(0, Math.floor(Number(o.bar) || 0)) % style.turn.length];
  const tense = Math.max(0, Math.min(5, Math.floor(Number(o.tense) || 0)));
  const beat = GEO_BAR_S / 4, eighth = beat / 2;
  const at = i => t + i * eighth + (i % 2 ? style.swing : 0);
  const pulses = tense >= 4 ? [...style.pulse, ...style.pulseTense] : style.pulse;
  for (const [i, peak] of pulses) if (!(o.last && i >= 6)) bedPulse(E, at(i), bar.root, peak);
  if (!o.last && style.pad) bedPad(E, t, bar.root * 2, style.pad);
  const bright = 0.12 + tense * 0.06;
  bar.notes.forEach((f, i) => {
    if (!f || (o.last && i >= 6)) return;
    style.pluck(E, at(i), f, style.pluckPeaks[i % 2], bright, i % 2 ? 0.18 : -0.18);
  });
  for (let i = 0; i < 8; i++) {
    if (o.last && i >= 6) break;
    if (style.brushes[i]) bedBrush(E, at(i), style.brushes[i]);
    if (tense >= 2) bedBrush(E, t + i * eighth + eighth / 2, 0.01 + tense * 0.002);
  }
  if (tense >= 3 && !o.last) M.bell(E, t + 3 * beat + style.swing, style.answer[tense >= 5 ? 1 : 0],
    { gain:0.045 * GEO_BED_LEVEL, dec:0.45, send:0.2 });
}
/* Where and When's groove: swung; the low pulse on one and three with a
   ghost before three (four on the floor at the end); kalimba plucks over
   a held pad; brushes on the swung offbeats and lightly on two and four */
const GEO_STYLE = Object.freeze({ turn:GEO_BED, swing:GEO_SWING_S, pulse:[[0, 0.11], [3, 0.045], [4, 0.08]],
  pulseTense:[[2, 0.06], [6, 0.06]], pad:0.026, pluck:bedPluck, pluckPeaks:[0.06, 0.045],
  brushes:[0, 0.035, 0.018, 0.035, 0, 0.035, 0.018, 0.035], answer:[NOTE.A5, NOTE.B5] });
const geoBedBar = (E, t, o = {}) => bedBar(E, t, o, GEO_STYLE);
/* the last seconds' clock: a dry tick each second, climbing and louder as
   it runs down (s from `of` to 1), a knock under the last three */
function clockTick(E, t, s, of) {
  const top = Math.max(2, Math.round(Number(of) || 10));
  const left = Math.max(1, Math.min(top, Math.round(Number(s) || top)));
  const k = (top - left) / (top - 1);
  M.tick(E, t, { pitch:1.2 + 0.5 * k, gain:0.6 + 0.4 * k });
  if (left <= 3) M.knock(E, t + 0.004, { pitch:1.7, gain:0.18 + 0.06 * (3 - left) });
}
/* your score lands on your phone (tier 1 to 3: one note, two, the motif) */
function scoreChime(E, t, tier) {
  const n = Math.max(1, Math.min(3, Math.round(Number(tier) || 1)));
  M.clack(E, t, { gain:0.3, double:false });
  [NOTE.D5, NOTE.Fs5, NOTE.A5].slice(0, n).forEach((f, i) => M.bell(E, t + 0.01 + i * 0.09, f, { gain:0.34, dec:1.1, send:0.2 }));
  if (n === 3) M.bell(E, t + 0.3, NOTE.D6, { gain:0.18, dec:1.4, send:0.2 });
}
export const GEO_PARTS = Object.freeze([
  /* a photo goes up: the slide projector's advance (the carrier knocks,
     the slide drops into the gate, the shutter), the lamp coming up, then
     F sharp to A over the low drum (opts.summary: the knock and one bell) */
  { id:"geoPhoto", name:"A photo goes up", ms:2000,
    play:(E, t, o = {}) => {
      if (o.summary) { M.knock(E, t, { pitch:0.7, gain:0.5 }); M.bell(E, t + 0.01, NOTE.A5, { gain:0.32, dec:1.6 }); return; }
      M.knock(E, t, { pitch:0.62, gain:0.5 }); M.clack(E, t + 0.004, { pitch:0.7, gain:0.4, double:false });
      M.slap(E, t + 0.12, { gain:0.32 }); M.felt(E, t + 0.125, { gain:0.3 });
      hum(E, t + 0.08, 0.55, 260, 1200, 0.045);
      M.tick(E, t + 0.32, { pitch:1.5, gain:0.42 }); M.tick(E, t + 0.37, { pitch:1.3, gain:0.3 });
      M.bell(E, t + 0.44, NOTE.Fs5, { gain:0.34, dec:1.5 });
      M.drum(E, t + 0.58, { f:NOTE.D2, dec:0.7, gain:0.5 });
      M.bell(E, t + 0.58, NOTE.A5, { gain:0.32, dec:2 }); M.bell(E, t + 0.585, NOTE.D5, { gain:0.2, dec:2 }); } },
  /* a player locks in: a pin pushed home, a step up the ladder per lock (opts.step) */
  { id:"geoLock", name:"A guess locks in", ms:500,
    play:(E, t, o = {}) => { M.clack(E, t, { pitch:1.12, gain:1, double:false }); M.knock(E, t + 0.006, { pitch:1.5, gain:0.45 });
      M.bell(E, t + 0.01, ladderNote(5 + Math.min(8, Math.max(0, Number(o.step) || 0))), { gain:0.2, dec:0.5, send:0.2 }); } },
  /* the last ten seconds: a dry clock tick each second, climbing and
     louder as it runs down (opts.s, 10 to 1) */
  { id:"geoTick", name:"The last ten seconds", ms:60,
    play:(E, t, o = {}) => clockTick(E, t, o.s, 10) },
  /* the bed under a photo's minute: one bar (opts.bar, opts.tense, opts.last) */
  { id:"geoBed", name:"The guessing bed", ms:GEO_BAR_S * 1000, cut:true,
    play:(E, t, o = {}) => geoBedBar(E, t, o) },
  /* a guess pin lands on the map: a soft felt tap and a note a step up per pin (opts.step) */
  { id:"geoDrop", name:"A guess pin lands", ms:400,
    play:(E, t, o = {}) => { const step = Math.max(0, Number(o.step) || 0);
      M.felt(E, t, { gain:0.45 }); M.clack(E, t + 0.004, { pitch:0.95 + Math.min(12, step) * 0.015, gain:0.4, double:false });
      M.bell(E, t + 0.006, ladderNote(2 + (step % 9)), { gain:0.14, dec:0.32, send:0.18 }); } },
  /* the lines run from every guess to the answer (opts.ms): a pen drawn
     across the map, rising as they close in */
  { id:"geoLines", name:"The lines run in", ms:1100,
    play:(E, t, o = {}) => { const d = Math.max(0.3, (Number(o.ms) || 1100) / 1000);
      whoosh(E, t, { d, f0:700, f1:3200, peak:0.11 });
      glide(E, voice(E, { send:0.2, bright:0.6, gain:1 }), t + 0.05, NOTE.A4, NOTE.D5, d * 0.9, 0.022); } },
  /* the answer lands: the felt, the knock and the drum under D and A */
  { id:"geoAnswer", name:"The answer lands", ms:2200,
    play:(E, t) => { M.felt(E, t, { gain:0.9 }); M.knock(E, t + 0.006, { pitch:0.9, gain:0.6 });
      M.drum(E, t, { f:NOTE.D2, dec:0.7, gain:0.55 });
      M.bell(E, t + 0.02, NOTE.D5, { gain:0.42, dec:2.2 }); M.bell(E, t + 0.05, NOTE.A5, { gain:0.24, dec:1.8 }); } },
  /* the round's scores settle in (opts.n rows); the last photo's resolve
     the motif up to D (opts.last) */
  { id:"geoSettle", name:"The scores settle", ms:1600,
    play:(E, t, o = {}) => { const n = Math.max(3, Math.min(6, Math.round(Number(o.n) || 4)));
      riffle(E, t, n, { gap:0.06, gain:0.45, pitch:1.02 });
      if (!o.last) { M.bell(E, t + n * 0.06, NOTE.D5, { gain:0.2, dec:0.9, send:0.25 });
        M.bell(E, t + n * 0.06 + 0.08, NOTE.Fs5, { gain:0.2, dec:1.1, send:0.25 }); return; }
      const end = t + n * 0.06 + 0.1;
      [NOTE.A4, NOTE.D5, NOTE.Fs5].forEach((f, i) => M.bell(E, end + i * 0.17, f, { gain:0.36, dec:2 }));
      M.drum(E, end + 0.55, { f:NOTE.D2, dec:1.1, gain:0.6 }); M.bowl(E, end + 0.56, NOTE.D3, { gain:0.32, dec:2.6 });
      M.bell(E, end + 0.56, NOTE.A5, { gain:0.34, dec:2.8 }); M.bell(E, end + 0.6, NOTE.D6, { gain:0.2, dec:2.6 }); } },
  /* your phone: your pin goes in (a tap on the map, a drag let go, a place searched) */
  { id:"geoPin", name:"Your pin", ms:200,
    play:(E, t) => { M.felt(E, t, { gain:0.45 }); M.clack(E, t + 0.004, { pitch:1.05, gain:0.38, double:false });
      M.bell(E, t + 0.008, NOTE.A5, { gain:0.08, dec:0.25, send:0.1 }); } },
  /* your phone: your score lands (opts.tier 1 to 3: one note, two, the motif) */
  { id:"geoScore", name:"Your score", ms:1400,
    play:(E, t, o = {}) => scoreChime(E, t, o.tier) },
].map(Object.freeze));

/* ── Trivia's rounds (features/tv/triviaSound.js cues the room's on the
   server clock and the TV's own reveal; the phone plays your score on the
   you bus). The same bed builder in another groove, every pitched note
   still in D's five. ── */
/* the question's bed: a straight four-bar turn on Bm, D, A and E (sus,
   leaning home to Bm), the low pulse on every beat and the mallets
   running up and down each chord */
export const TRIVIA_BED = Object.freeze([
  Object.freeze({ root:B1, notes:Object.freeze([B3, NOTE.D4, NOTE.Fs4, NOTE.B4, NOTE.D5, NOTE.B4, NOTE.Fs4, NOTE.D4]) }),
  Object.freeze({ root:NOTE.D2, notes:Object.freeze([NOTE.D4, NOTE.Fs4, NOTE.A4, NOTE.D5, NOTE.Fs5, NOTE.D5, NOTE.A4, NOTE.Fs4]) }),
  Object.freeze({ root:NOTE.A2, notes:Object.freeze([A3, NOTE.E4, NOTE.A4, NOTE.B4, NOTE.E5, NOTE.B4, NOTE.A4, NOTE.E4]) }),
  Object.freeze({ root:E2, notes:Object.freeze([NOTE.E4, NOTE.A4, NOTE.B4, NOTE.E5, NOTE.B4, NOTE.A4, NOTE.E4, NOTE.Fs4]) }),
]);
/* a mallet on a wooden bar: short, round, its two-octave partial the wood */
function bedMallet(E, t, f, peak, bright, pan = 0) {
  const v = voice(E, { send:0.12, bright:bright + 0.08, gain:GEO_BED_LEVEL, pan });
  mode(E, v, t, f, 0.26, peak, { a:0.002 });
  mode(E, v, t, f * 4, 0.05, peak * 0.2, { a:0.001 });
  mode(E, v, t, f * 2, 0.08, peak * 0.12, { a:0.001 });
}
const TRIVIA_STYLE = Object.freeze({ turn:TRIVIA_BED, swing:0, pulse:[[0, 0.1], [2, 0.06], [4, 0.085], [6, 0.06]],
  pulseTense:[[3, 0.035], [7, 0.035]], pad:0.018, pluck:bedMallet, pluckPeaks:[0.07, 0.05],
  brushes:[0, 0.03, 0, 0.03, 0, 0.03, 0, 0.03], answer:[NOTE.Fs5, NOTE.A5] });
/* seconds from a part's start, from opts.offsets (ms), else n at a gap */
const offsetsOf = (o, n, gap) => (Array.isArray(o.offsets) && o.offsets.length ? o.offsets : Array.from({ length:n }, (_, i) => i * gap))
  .map(ms => Math.max(0, Number(ms) || 0) / 1000);
export const TRIVIA_PARTS = Object.freeze([
  /* the bed under a live question: one bar (opts.bar, opts.tense, opts.last) */
  { id:"triviaBed", name:"The question's bed", ms:GEO_BAR_S * 1000, cut:true,
    play:(E, t, o = {}) => bedBar(E, t, o, TRIVIA_STYLE) },
  /* the last five seconds, climbing (opts.s, 5 to 1) */
  { id:"triviaTick", name:"The last five seconds", ms:60,
    play:(E, t, o = {}) => clockTick(E, t, o.s, 5) },
  /* the right answer stamps: the slap and knock, the drum under D and A */
  { id:"triviaAnswer", name:"The answer stamps", ms:2000,
    play:(E, t) => { M.slap(E, t, { gain:0.7 }); M.knock(E, t + 0.01, { gain:0.5, pitch:0.9 });
      M.drum(E, t, { f:NOTE.D2, dec:0.6, gain:0.45 });
      M.bell(E, t + 0.02, NOTE.D5, { gain:0.38, dec:2 }); M.bell(E, t + 0.05, NOTE.A5, { gain:0.2, dec:1.6 }); } },
  /* each answer's count rises (opts.offsets): a card flicked over, a step up each */
  { id:"triviaTally", name:"The counts rise", ms:500,
    play:(E, t, o = {}) => offsetsOf(o, 4, 90).forEach((s, i) => M.tick(E, t + s, { gain:0.3, pitch:1.05 + i * 0.06 })) },
  /* the faces of everyone who had it land on the right answer (opts.n, opts.gap), up the ladder */
  { id:"triviaFaces", name:"The faces land", ms:900,
    play:(E, t, o = {}) => offsetsOf(o, Math.max(1, Math.min(7, Math.round(Number(o.n) || 4))), Number(o.gap) || 70)
      .forEach((s, i) => { M.felt(E, t + s, { gain:0.16 });
        M.bell(E, t + s + 0.004, ladderNote(3 + i), { gain:0.15, dec:0.4, send:0.2 }); }) },
  /* the points fly onto the scorers' rows (opts.offsets), then the board settles */
  { id:"triviaPoints", name:"The points land", ms:1400,
    play:(E, t, o = {}) => { const at = offsetsOf(o, 3, 60);
      at.forEach((s, i) => M.clack(E, t + s, { pitch:1.02 + Math.min(10, i) * 0.015, gain:0.45, double:i === at.length - 1 }));
      const end = t + at[at.length - 1] + 0.14;
      M.bell(E, end, NOTE.D5, { gain:0.2, dec:0.9, send:0.25 }); M.bell(E, end + 0.08, NOTE.Fs5, { gain:0.2, dec:1.1, send:0.25 }); } },
  /* the scores stand between rounds: a chip as each row rises (opts.offsets),
     then the motif rung up (opts.summary: the motif alone) */
  { id:"triviaScores", name:"The scores stand", ms:2200,
    play:(E, t, o = {}) => { const at = o.summary ? [] : offsetsOf(o, 13, 90);
      at.forEach((s, i) => M.clack(E, t + s, { pitch:0.95 + Math.min(12, i) * 0.01, gain:0.38, bright:0.8, double:false }));
      const end = t + (at.length ? at[at.length - 1] + 0.25 : 0);
      [NOTE.A4, NOTE.D5, NOTE.Fs5].forEach((f, i) => M.bell(E, end + i * 0.13, f, { gain:0.26, dec:1.4, send:0.3 })); } },
  /* your phone: your points land (opts.tier 1 to 3) */
  { id:"triviaScore", name:"Your points", ms:1400,
    play:(E, t, o = {}) => scoreChime(E, t, o.tier) },
].map(Object.freeze));

export const SOUNDS = Object.freeze(Object.fromEntries([...KIT, ...PARTS, ...BOARD_PARTS, ...BIT_PARTS, ...KARAOKE_PARTS, ...GEO_PARTS,
  ...TRIVIA_PARTS, ...floatParts()].map(s => [s.id, s])));
export const SOUND_IDS = Object.freeze(KIT.map(s => s.id));
export const isSound = id => Object.prototype.hasOwnProperty.call(SOUNDS, id);

/* Play one recipe on an engine at context time t. `pan` places it by canvas
   x (ignored on a phone speaker); every material in the recipe shares it. */
export function playRecipe(E, id, t, { pan = 0, open = false, ...opts } = {}) {
  const s = SOUNDS[id];
  if (!s || !E) return false;
  const was = E.pan, outer = E.graph, wasOpen = E.open, wasDry = E.cutDry, wasWet = E.cutWet;
  const graph = { nodes:[], pending:0, closed:false };
  E.pan = clampPan(pan);
  E.open = !!open;
  E.graph = graph;
  /* a cut recipe's gate: every voice in it passes here (dry and wet), so
     closing it silences what rings without touching the engine */
  const gate = s.cut ? cutGate(E, graph, t) : null;
  let played = false;
  try { s.play(E, t, opts); played = true; }
  finally {
    E.pan = was;
    E.open = wasOpen;
    E.graph = outer;
    E.cutDry = wasDry; E.cutWet = wasWet;
    graph.closed = true;
    /* nothing left to end (or the recipe threw): let it go now */
    if (graph.pending === 0 || !played) releaseGraph(graph);
  }
  return gate ? gate.handle : true;
}
/* A cut recipe's gate (a music bed's bar): its dry and wet go through two
   gains the handle can close. stop() before the bar starts holds it
   silent; while it rings it fades out over CUT_FADE_S. The gains are the
   graph's own nodes, released with it once its sources end. */
export const CUT_FADE_S = 0.2;
export const cutSound = id => !!SOUNDS[id]?.cut;
function cutGate(E, graph, t) {
  const c = E.ctx;
  const dry = c.createGain(), wet = c.createGain();
  dry.gain.value = 1; wet.gain.value = 1;
  dry.connect(E.dry); wet.connect(E.wet);
  graph.nodes.push(dry, wet);
  E.cutDry = dry; E.cutWet = wet;
  let stopped = false;
  const handle = {
    stop(fade = CUT_FADE_S) {
      if (stopped) return;
      stopped = true;
      const now = c.currentTime;
      for (const node of [dry, wet]) {
        try {
          const g = node.gain;
          g.cancelScheduledValues(now);
          if (now <= t) g.setValueAtTime(0, now);
          else { g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(0, now + Math.max(0.01, fade)); }
        } catch {}
      }
    },
  };
  return { handle };
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

/* ════ FLOAT (float/PROTOCOL.md "Sound"; owned by Float's sound build) ════
   Everything from here to the end of the file is Float's: the river race's
   band, the river under it, the field's paddles, the race's moments and the
   phone's own. float/client/sound cues them, the screen's on the room bus
   and the phone's on the you bus; nothing in Field Day plays them.

   floatParts() is a hoisted declaration, so SOUNDS above registers the list
   before this block's constants exist: the list names literals only, and
   every recipe reads the constants when it plays.

   The band: desert surf at night, 120 a minute in four (the beds' bar), a
   twangy guitar through a spring and a slapback, a picked bass, light
   drums. Every pitched note is in D's five; the surf leans on B, D's
   relative minor. ════ */

/* the race's instruments, the river and the moments, as the kit lists them */
export function floatParts() {
  if (floatParts.list) return floatParts.list;
  /* every recipe plays through FL_MIX, its level in the mix by importance */
  const part = (id, name, where, ms, fn, cut = false) => ({ id, name, where, ms, ...(cut ? { cut:true } : {}),
    play:(E, t, o = {}) => flMix(E, id, () => fn(E, t, o)) });
  const TV = ["tv"], PHONE = ["phone"];
  floatParts.list = Object.freeze([
    /* ── the band: one bar each, cut recipes, laid on the room's clock ── */
    /* a bar of the race (opts.leg 0..3, final, bar 0..3 of the turn, phrase 0..7, tense 0..5, fill, crash, first,
       drop "suspend" | "land") */
    part("floatRace", "Float: the race", TV, 2000, flRaceBar, true),
    /* a bar on the grid and under the Cup's intro (opts.bar 0..1) */
    part("floatVamp", "Float: on the grid", TV, 2000, flVampBar, true),
    /* a bar of the lobby's lounge (opts.bar 0..7, section 0..3, cut: between rounds) */
    part("floatLounge", "Float: the lobby", TV, 2000, flLoungeBar, true),
    /* ── the river and the field ── */
    /* a stretch of river (opts.from, opts.to: its layers; ms; fade) */
    part("floatRiver", "Float: the river", TV, 3000, flRiver, true),
    /* the field's paddles going in (opts.n strokes, grains, offsets, pans, span) */
    part("floatPaddles", "Float: the field paddling", TV, 400, flPaddles),
    /* ── the screen's moments ── */
    part("floatCount", "Float: 3, 2, 1", TV, 1000, flCount),
    part("floatGo", "Float: go", TV, 1600, flGo),
    part("floatTitle", "Float: a leg's title", TV, 2400, flTitle),
    part("floatIntro", "Float: the Cup opens", TV, 3600, flIntro),
    part("floatButton", "Float: the round ends", TV, 1800, flButton),
    part("floatOut", "Float: out (a floatie lets go)", TV, 800, flOut),
    part("floatBump", "Float: a bump", TV, 300, flBump),
    part("floatScrape", "Float: off a rock", TV, 350, flScrape),
    part("floatFlip", "Float: a flip", TV, 1000, flFlip),
    part("floatFall", "Float: over the Drop", TV, 900, flFall),
    part("floatImpact", "Float: the Drop lands", TV, 1800, flImpact),
    part("floatLob", "Float: a balloon thrown", TV, 1200, flLob),
    part("floatSplat", "Float: a balloon lands", TV, 600, flSplat),
    part("floatBell", "Float: in at the bar", TV, 1600, flBell),
    part("floatClink", "Float: a drink finished", TV, 500, flClink),
    part("floatJoin", "Float: a rider joins", TV, 900, flJoin),
    part("floatReady", "Float: a rider is ready", TV, 700, flReady),
    part("floatPodium", "Float: the podium fanfare", TV, 4600, flPodium),
    part("floatStamp", "Float: a place on the podium", TV, 900, flStamp),
    part("floatWinner", "Float: the winner's pose", TV, 2200, flWinner),
    /* ── the phone's own (the you bus) ── */
    part("floatDip", "Float: your paddle", PHONE, 200, flYouDip),
    part("floatYouFlip", "Float: you flipped", PHONE, 800, flYouFlip),
    part("floatYouArrive", "Float: you're in", PHONE, 1200, flYouArrive),
    part("floatYouDrink", "Float: your drink", PHONE, 500, flYouDrink),
    part("floatYouThrough", "Float: you're through", PHONE, 1400, flYouThrough),
    part("floatYouThrow", "Float: your balloon", PHONE, 500, flYouThrow),
    part("floatYouSplat", "Float: your balloon lands", PHONE, 700, flYouSplat),
    part("floatYouHit", "Float: you're splashed", PHONE, 500, flYouHit),
    part("floatYouPodium", "Float: your place", PHONE, 1600, flYouPodium),
  ].map(Object.freeze));
  return floatParts.list;
}
/* The mix, by importance (the offline analysis set these, at the TV's and
   the phone's master): each recipe's dry and reverb send pass one gain, so
   the whole of it moves together and its room stays with it. */
const FL_MIX = Object.freeze({
  /* the band and the river, under everything */
  floatRace:0.48, floatVamp:0.8, floatLounge:0.52, floatRiver:0.62, floatPaddles:0.63,
  /* the sequence's big beats */
  floatCount:0.75, floatGo:1.6, floatTitle:0.72, floatIntro:0.65, floatButton:0.75, floatPodium:0.75, floatWinner:0.62, floatImpact:0.62,
  /* the race's moments */
  floatFlip:0.66, floatFall:1.2, floatBump:0.8, floatScrape:0.9, floatLob:2.3, floatSplat:0.88, floatBell:1.1, floatClink:1, floatOut:1.45,
  /* the lobby and the podium's accents */
  floatJoin:2.2, floatReady:1.4, floatStamp:2,
  /* the phone */
  floatDip:1.25, floatYouFlip:1.6, floatYouArrive:1, floatYouDrink:1, floatYouThrough:1.1, floatYouThrow:2.1, floatYouSplat:0.9, floatYouHit:1.5,
  floatYouPodium:1.3,
});
export const FLOAT_MIX = FL_MIX;
function flMix(E, id, play) {
  const k = FL_MIX[id] ?? 1;
  if (k === 1) return play();
  const c = E.ctx, dry = c.createGain(), wet = c.createGain();
  dry.gain.value = k; wet.gain.value = k;
  dry.connect(E.cutDry || (E.open && E.openDry ? E.openDry : E.dry)); wet.connect(E.cutWet || E.wet);
  track(E, dry, wet);
  const was = [E.cutDry, E.cutWet];
  E.cutDry = dry; E.cutWet = wet;
  try { return play(); } finally { E.cutDry = was[0]; E.cutWet = was[1]; }
}
export const FLOAT_PARTS = floatParts();

/* ── the band's grid and notes ── */
/* 120 a minute in four, sixteen steps a bar */
export const FLOAT_BAR_S = 2;
const FL_STEP_S = FLOAT_BAR_S / 16;
/* the slapback: the echo a bar's guitar throws back from the other side */
const FL_SLAP_S = 0.135;
/* Float's notes, every one an octave of NOTE's (D's five) */
const FN = Object.freeze({ A1:NOTE.A2 / 2, B1:NOTE.B4 / 8, D2:NOTE.D2, E2:NOTE.E4 / 4, Fs2:NOTE.Fs4 / 4, A2:NOTE.A2,
  B2:NOTE.B4 / 4, D3:NOTE.D3, E3:NOTE.E4 / 2, Fs3:NOTE.Fs4 / 2, A3:NOTE.A3, B3:NOTE.B4 / 2, D4:NOTE.D4, E4:NOTE.E4,
  Fs4:NOTE.Fs4, A4:NOTE.A4, B4:NOTE.B4, D5:NOTE.D5, E5:NOTE.E5, Fs5:NOTE.Fs5, A5:NOTE.A5, B5:NOTE.B5, D6:NOTE.D6,
  E6:NOTE.E6, Fs6:NOTE.Fs6, A6:NOTE.A6, B6:NOTE.B5 * 2 });
export const FLOAT_NOTES = FN;
const fn = name => FN[name] || 0;
/* the band's instruments against each other (FL_MIX sets the band against the room) */
const FL_BAND = 0.62;
const flInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(Number(v) || 0)));
const flMod = (v, n) => ((Math.floor(Number(v) || 0) % n) + n) % n;
/* a recipe's voices, each made the first time something plays into it */
function flVoices(E, specs) {
  const made = {};
  return name => made[name] || (made[name] = voice(E, specs[name] || {}));
}

/* ── shapes ── */
/* a band of noise sweeping f0 to f1 under a quick attack and a decay: a
   blade going in, a splash, the water landing */
function flSweep(E, dest, t, { type = "bandpass", f0 = 2000, f1 = 600, q = 1, d = 0.2, peak = 0.3, a = 0.004 } = {}) {
  const c = E.ctx, len = Math.max(0.01, a + d);
  const s = c.createBufferSource(); s.buffer = E.noise; s.loop = true;
  const fl = c.createBiquadFilter(); fl.type = type; fl.Q.value = q;
  fl.frequency.setValueAtTime(Math.max(30, f0), t); fl.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + len);
  const g = c.createGain(); g.gain.value = 0;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(Math.max(0.0002, peak), t + Math.max(0.001, a));
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  s.connect(fl); fl.connect(g); g.connect(dest);
  track(E, s, fl, g); trackSource(E, s);
  s.start(t, Math.random() * 1.5); s.stop(t + len + 0.05);
}
/* a drop of water: a tiny bubble's pitch flicking up */
function flPlip(E, dest, t, { f = 1000, gain = 1 } = {}) {
  glide(E, dest, t, f * 0.7, f * 1.7, 0.035, 0.05 * gain);
}
/* a bubble coming up: blub */
function flBlub(E, dest, t, k = 1) {
  glide(E, dest, t, 240, 640, 0.09, 0.1 * k);
}
/* water thrown up and coming down: the hit, the body falling back, the drops */
function flSplash(E, dest, t, { size = 1 } = {}) {
  const k = Math.max(0.2, size);
  flSweep(E, dest, t, { f0:3400, f1:900, q:0.6, d:0.1 + 0.08 * k, peak:0.42 * Math.min(1.3, k), a:0.003 });
  flSweep(E, dest, t + 0.012, { type:"lowpass", f0:5200, f1:380, q:0.7, d:0.3 + 0.35 * k, peak:0.34 * Math.min(1.3, k), a:0.012 });
  mode(E, dest, t, 72, 0.16 + 0.1 * k, 0.42 * Math.min(1.3, k), { drop:0.7 });
  const n = Math.round(4 + 6 * k);
  for (let i = 0; i < n; i++)
    flPlip(E, dest, t + 0.07 + Math.pow(i / n, 1.25) * (0.35 + 0.45 * k) + rnd(0, 0.03), { f:rnd(700, 1800), gain:rnd(0.5, 1) * Math.min(1.2, k) });
}

/* ── the band's instruments ── */
/* The surf guitar: a bright pick (a saw and a square a hair apart) through
   a resonant low-pass that closes as the note rings, the pick bending it up
   into pitch. o: dest (a voice to share), vib (whammy vibrato 0..1), dive
   (a whammy dip at the end, 0..1 of the pitch), trem (tremolo picking,
   picks a second), from (slide in from this ratio over `slide` s), amp (the
   amp's own vibrato channel, Hz), bright, sus, release, bend, pan, send */
function flTwang(E, t, f, d, peak, o = {}) {
  if (!(f > 0) || !(peak > 0)) return;
  const c = E.ctx;
  const dest = o.dest || voice(E, { pan:o.pan || 0, send:o.send ?? 0.9, bright:1, gain:1 });
  const bright = o.bright ?? 1, hold = Math.max(0.04, d), rel = o.release ?? 0.16, sus = o.sus ?? 0.45;
  const end = t + hold + rel + 0.04;
  const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = o.q ?? 3.2;
  const top = Math.min(9000, f * 15 * bright), low = Math.max(180, Math.min(top * 0.8, f * 3.4 * bright));
  lp.frequency.setValueAtTime(top, t);
  lp.frequency.exponentialRampToValueAtTime(low, t + 0.06 + Math.min(hold, 0.3) * 0.6);
  const g = c.createGain(); g.gain.value = 0;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.003);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * sus), t + Math.min(0.1, hold));
  if (hold > 0.1) g.gain.exponentialRampToValueAtTime(Math.max(0.00015, peak * sus * 0.72), t + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + hold + rel);
  lp.connect(g);
  track(E, lp, g);
  if (o.amp) {
    const ag = c.createGain(); ag.gain.value = 0.74;
    const lfo = c.createOscillator(); lfo.type = "sine"; lfo.frequency.value = o.amp;
    const amt = c.createGain(); amt.gain.value = 0.26;
    lfo.connect(amt); amt.connect(ag.gain); g.connect(ag); ag.connect(dest);
    track(E, ag, lfo, amt); trackSource(E, lfo);
    lfo.start(t); lfo.stop(end);
  } else g.connect(dest);
  /* tremolo picking: each pick a quick rise and a fall (an inverted saw on the level, its edge rounded
     to about a millisecond so a pick never clicks), into the filter */
  let into = lp;
  if (o.trem) {
    const tg = c.createGain(); tg.gain.value = 0.62;
    const lfo = c.createOscillator(); lfo.type = "sawtooth"; lfo.frequency.value = o.trem;
    const round = c.createBiquadFilter(); round.type = "lowpass"; round.frequency.value = 160; round.Q.value = 0.5;
    const amt = c.createGain(); amt.gain.value = -0.38;
    lfo.connect(round); round.connect(amt); amt.connect(tg.gain); tg.connect(lp);
    track(E, tg, lfo, round, amt); trackSource(E, lfo);
    lfo.start(t); lfo.stop(end);
    into = tg;
  }
  const bend = o.bend ?? 0.014, slide = o.from ? Math.max(0.05, Math.min(hold, o.slide ?? hold * 0.6)) : 0.04;
  const oscs = [["sawtooth", 1, 0.72], ["square", 1.0035, 0.26]].map(([type, k, level]) => {
    const osc = c.createOscillator(); osc.type = type;
    const fk = f * k;
    osc.frequency.setValueAtTime(fk * (o.from ? o.from : 1 - bend), t);
    osc.frequency.exponentialRampToValueAtTime(fk, t + slide);
    if (o.dive) {
      const from = t + Math.max(slide + 0.02, hold - 0.22);
      osc.frequency.setValueAtTime(fk, from);
      osc.frequency.exponentialRampToValueAtTime(fk * (1 - Math.min(0.75, o.dive)), t + hold + rel);
    }
    const lg = c.createGain(); lg.gain.value = level;
    osc.connect(lg); lg.connect(into);
    track(E, osc, lg); trackSource(E, osc);
    osc.start(t); osc.stop(end);
    return osc;
  });
  if (o.vib) {
    const lfo = c.createOscillator(); lfo.type = "sine"; lfo.frequency.value = o.vibRate || 5.4;
    const amt = c.createGain(); amt.gain.setValueAtTime(0, t);
    amt.gain.linearRampToValueAtTime(f * 0.0075 * o.vib, t + Math.min(hold, 0.3));
    lfo.connect(amt); oscs.forEach(osc => amt.connect(osc.frequency));
    track(E, lfo, amt); trackSource(E, lfo);
    lfo.start(t); lfo.stop(end);
  }
}
/* a chord strummed low to high, a few ms apart */
function flStrum(E, t, names, d, peak, o = {}) {
  names.forEach((name, k) => flTwang(E, t + k * (o.spread ?? 0.008), fn(name), d, peak, o));
}
/* the rhythm guitar's muted chank on the backbeat */
function flChank(E, dest, t, names, k = 1) {
  names.forEach((name, i) => flTwang(E, t + i * 0.005, fn(name), 0.05, 0.07 * k, { dest, bright:0.55, sus:0.25, release:0.04, bend:0.004 }));
  burst(E, dest, t, { f:2600, q:1.4, d:0.022, peak:0.1 * k });
}
/* the spring's drip: a pluck's echo running down the springs */
function flDrip(E, t, gain = 1, pan = -0.2) {
  const v = voice(E, { pan, send:1.4, bright:1, gain });
  glide(E, v, t, 2900, 230, 0.05, 0.1);
  glide(E, v, t + 0.032, 2100, 300, 0.045, 0.045);
}
/* a bass note: picked (a saw through a closing low-pass, the pick's click)
   or plucked upright (a round triangle and a thump) */
function flBass(E, dest, t, f, d, peak, { upright = false } = {}) {
  if (!(f > 0) || !(peak > 0)) return;
  const c = E.ctx, hold = Math.max(0.05, d), a = upright ? 0.01 : 0.003;
  const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = upright ? 0.9 : 1.5;
  lp.frequency.setValueAtTime(Math.min(3600, f * (upright ? 8 : 15)), t);
  lp.frequency.exponentialRampToValueAtTime(Math.max(110, f * (upright ? 2.4 : 3.2)), t + 0.16);
  const g = c.createGain(); g.gain.value = 0;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(peak * 0.55, t + a + 0.09);
  g.gain.setValueAtTime(peak * 0.55, t + Math.max(a + 0.09, hold - 0.03));
  g.gain.exponentialRampToValueAtTime(0.0001, t + hold + 0.07);
  lp.connect(g); g.connect(dest);
  track(E, lp, g);
  [[upright ? "triangle" : "sawtooth", upright ? 0.8 : 0.55], ["sine", upright ? 0.5 : 0.6]].forEach(([type, level]) => {
    const osc = c.createOscillator(); osc.type = type;
    osc.frequency.setValueAtTime(f * (upright ? 1.012 : 1.006), t);
    osc.frequency.exponentialRampToValueAtTime(f, t + 0.03);
    const lg = c.createGain(); lg.gain.value = level;
    osc.connect(lg); lg.connect(lp);
    track(E, osc, lg); trackSource(E, osc);
    osc.start(t); osc.stop(t + hold + 0.1);
  });
  burst(E, dest, t, { f:upright ? 900 : 1700, q:1, d:upright ? 0.02 : 0.008, peak:peak * (upright ? 0.4 : 0.3) });
  phantom(E, dest, t, f, Math.min(0.25, hold), peak * 0.5);
}
/* a lap steel: a soft triangle sliding between notes, a slow vibrato */
function flSteel(E, dest, t, f, d, peak, from = 0) {
  if (!(f > 0)) return;
  const c = E.ctx, end = t + d + 0.5;
  const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2600; lp.Q.value = 0.7;
  const g = c.createGain(); g.gain.value = 0;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.05);
  g.gain.setValueAtTime(peak, t + Math.max(0.06, d * 0.7));
  g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.45);
  lp.connect(g); g.connect(dest);
  track(E, lp, g);
  const oscs = [["triangle", 1, 0.8], ["sine", 2, 0.22]].map(([type, k, level]) => {
    const osc = c.createOscillator(); osc.type = type;
    osc.frequency.setValueAtTime(f * k * (from > 0 ? from / f : 0.97), t);
    osc.frequency.exponentialRampToValueAtTime(f * k, t + (from > 0 ? 0.16 : 0.05));
    const lg = c.createGain(); lg.gain.value = level;
    osc.connect(lg); lg.connect(lp);
    track(E, osc, lg); trackSource(E, osc);
    osc.start(t); osc.stop(end);
    return osc;
  });
  const lfo = c.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 5.2;
  const amt = c.createGain(); amt.gain.setValueAtTime(0, t); amt.gain.linearRampToValueAtTime(f * 0.005, t + Math.min(d, 0.35));
  lfo.connect(amt); oscs.forEach(osc => amt.connect(osc.frequency));
  track(E, lfo, amt); trackSource(E, lfo);
  lfo.start(t); lfo.stop(end);
}
/* an air horn: two reeds beating a hair apart and a third a fifth up,
   through the bell's resonance, scooping up into pitch */
function flHorn(E, t, d, gain = 1, f = NOTE.A4) {
  const c = E.ctx, v = voice(E, { send:0.32, bright:1, gain });
  const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 3400; lp.Q.value = 0.8;
  const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1150; bp.Q.value = 1.8;
  const bg = c.createGain(); bg.gain.value = 0.7;
  const g = c.createGain(); g.gain.value = 0;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.2, t + 0.025);
  g.gain.setValueAtTime(0.2, t + Math.max(0.05, d - 0.04));
  g.gain.linearRampToValueAtTime(0.0001, t + d + 0.1);
  lp.connect(g); bp.connect(bg); bg.connect(g); g.connect(v);
  track(E, lp, bp, bg, g);
  [[1, 0.5, "sawtooth"], [1.0062, 0.42, "sawtooth"], [1.4983, 0.2, "square"]].forEach(([k, level, type]) => {
    const osc = c.createOscillator(); osc.type = type;
    const fk = f * k;
    osc.frequency.setValueAtTime(fk * 0.88, t);
    osc.frequency.exponentialRampToValueAtTime(fk, t + 0.06);
    osc.frequency.setValueAtTime(fk, t + Math.max(0.07, d - 0.05));
    osc.frequency.exponentialRampToValueAtTime(fk * 0.97, t + d + 0.1);
    const lg = c.createGain(); lg.gain.value = level;
    osc.connect(lg); lg.connect(lp); lg.connect(bp);
    track(E, osc, lg); trackSource(E, osc);
    osc.start(t); osc.stop(t + d + 0.14);
  });
}
/* the drums: each plays into a voice the bar shares */
/* light drums: the guitar leads, the kit sits under it */
const FLD = Object.freeze({
  kick(E, v, t, k = 1) { mode(E, v, t, 52, 0.26, 0.55 * k, { drop:1.25, a:0.002 }); burst(E, v, t, { type:"lowpass", f:2800, q:0.7, d:0.006, peak:0.2 * k }); },
  snare(E, v, t, k = 1) { burst(E, v, t, { f:1850, q:0.75, d:0.11, peak:0.34 * k }); burst(E, v, t, { type:"highpass", f:4800, q:0.7, d:0.09, peak:0.16 * k });
    mode(E, v, t, 196, 0.07, 0.2 * k, { drop:0.22 }); },
  rim(E, v, t, k = 1) { burst(E, v, t, { f:1750, q:4.5, d:0.018, peak:0.38 * k }); mode(E, v, t, 840, 0.03, 0.15 * k); mode(E, v, t, 1480, 0.018, 0.07 * k); },
  hat(E, v, t, k = 1, open = false) { burst(E, v, t, { type:"highpass", f:7200, q:0.7, d:open ? 0.22 : 0.028, peak:0.17 * k }); },
  shaker(E, v, t, k = 1) { burst(E, v, t, { f:6200, q:1.2, d:0.05, peak:0.15 * k, a:0.012 }); },
  tom(E, v, t, f = 98, k = 1) { mode(E, v, t, f, 0.3, 0.5 * k, { drop:0.5, a:0.002 }); mode(E, v, t, f * 1.6, 0.11, 0.1 * k, { drop:0.3 });
    burst(E, v, t, { type:"lowpass", f:1500, d:0.03, peak:0.15 * k }); },
  crash(E, v, t, k = 1, d = 1.6) { noiseBed(E, v, t, { type:"highpass", f:4200, q:0.6, d, peak:0.2 * k, a:0.002 });
    [3110, 4290, 5470, 6830].forEach(f => mode(E, v, t, f, d * 0.35, 0.02 * k, { type:"square", a:0.001 }));
    burst(E, v, t, { f:2600, q:0.8, d:0.05, peak:0.17 * k }); },
  brush(E, v, t, k = 1) { burst(E, v, t, { f:2400, q:0.5, d:0.15, peak:0.2 * k, a:0.022 }); },
});
/* a snare roll at `rate` strokes a second, swelling from `from` to `to` */
function flRoll(E, v, t, d, from = 0.15, to = 0.7, rate = 16) {
  const n = Math.max(2, Math.round(d * rate));
  for (let i = 0; i < n; i++) { const k = i / (n - 1); FLD.snare(E, v, t + i / rate + (i ? rnd(-0.003, 0.003) : 0), from + (to - from) * k * k); }
}
/* a noise riser across d, cut dead on the downbeat */
function flRiser(E, t, d, peak, pan = 0) {
  const c = E.ctx, v = voice(E, { pan, send:0.4, bright:1, gain:1 });
  const s = c.createBufferSource(); s.buffer = E.noise; s.loop = true;
  const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 1.2;
  bp.frequency.setValueAtTime(380, t); bp.frequency.exponentialRampToValueAtTime(4200, t + d);
  const g = c.createGain(); g.gain.value = 0;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + d * 0.96);
  g.gain.linearRampToValueAtTime(0.0001, t + d);
  s.connect(bp); bp.connect(g); g.connect(v);
  track(E, s, bp, g); trackSource(E, s);
  s.start(t, Math.random()); s.stop(t + d + 0.05);
}

/* ── the race's music ── */
/* the turn: four bars on B, B, D and E; the riff asks on B and answers a step up */
const FL_TURN = Object.freeze(["B", "B", "D", "E"]);
/* the riff, a bar at a time: [step, note, sixteenths, how]; v a whammy vibrato, d a dive at the end */
const FL_RIFF = Object.freeze([
  [[0, "B2", 2], [3, "B2", 1], [4, "D3", 2], [6, "E3", 2], [8, "Fs3", 4, "v"], [12, "E3", 2], [14, "D3", 2]],
  [[0, "B2", 6, "v"], [8, "A2", 2], [10, "B2", 2], [12, "D3", 4]],
  [[0, "D3", 2], [3, "D3", 1], [4, "Fs3", 2], [6, "A3", 2], [8, "B3", 4, "v"], [12, "A3", 2], [14, "Fs3", 2]],
  [[0, "E3", 4], [4, "Fs3", 2], [6, "A3", 2], [8, "B3", 6, "d"], [14, "A3", 1], [15, "Fs3", 1]],
]);
/* the final's lead, tremolo-picked an octave over the riff: t tremolo, d a dive */
const FL_LEAD = Object.freeze([
  [[0, "Fs4", 8, "t"], [8, "E4", 4, "t"], [12, "D4", 4]],
  [[0, "B3", 12, "td"], [12, "A3", 2], [14, "B3", 2]],
  [[0, "A4", 8, "t"], [8, "Fs4", 4, "t"], [12, "E4", 4]],
  [[0, "Fs4", 8, "t"], [8, "E4", 4], [12, "D4", 2], [14, "E4", 2]],
]);
/* the bass in eighths, the phrase's last bar walking home to B */
const FL_BASS = Object.freeze({
  B:["B1", "B1", "Fs2", "B2", "B1", "B1", "Fs2", "A2"],
  D:["D2", "D2", "A2", "D3", "D2", "D2", "A2", "B2"],
  E:["E2", "E2", "B2", "E3", "E2", "E2", "B2", "D3"],
  home:["E2", "E2", "B2", "E3", "D3", "B2", "A2", "Fs2"],
});
const FL_CHORD = Object.freeze({ B:["B2", "Fs3", "B3"], D:["D3", "A3", "D4"], E:["E3", "B3", "E4"] });
/* Whirlpool Bend's arpeggio, spinning round the room in sixteenths */
const FL_WHIRL = Object.freeze({ B:["B3", "D4", "Fs4", "A4", "Fs4", "D4", "B3", "A3"], D:["D4", "Fs4", "A4", "B4", "A4", "Fs4", "D4", "B3"],
  E:["E4", "A4", "B4", "D5", "B4", "A4", "E4", "D4"] });
/* the drums by leg, each harder than the last */
const FL_DRUMS = Object.freeze([
  /* the Put-in: a lazy kick, a cross-stick on two and four, a shaker */
  Object.freeze({ kick:[0, 8], rim:[4, 12], shaker:[0, 2, 4, 6, 8, 10, 12, 14] }),
  /* the Narrows: the backbeat comes in, hats on the eighths */
  Object.freeze({ kick:[0, 6, 8], hat:[0, 2, 4, 6, 8, 10, 12, 14] }),
  /* Whirlpool Bend: the floor tom rolls under it */
  Object.freeze({ kick:[0, 6, 8, 11], hat:[0, 2, 4, 6, 8, 10, 12, 14], tom:[2, 10] }),
  /* The Drop: sixteenths on the hat, the kick pushing */
  Object.freeze({ kick:[0, 6, 8, 11, 14], hat16:true, tom:[2, 10] }),
]);
const FL_FILL = Object.freeze([[12, NOTE.D3], [13, NOTE.B4 / 4], [14, NOTE.Fs4 / 4], [15, NOTE.E4 / 4]]);

/* One bar of the race. The leg sets the arrangement (the Put-in sparse,
   each leg adding a layer), the final adds the tremolo lead, and tense
   (1..5, the leader near the takeout or the cap running) opens the hat,
   ghosts the snare, picks the long notes, pushes the kick and rolls the
   snare into a riser. drop "suspend" holds the band on a tremolo and a
   riser as the leader reaches the lip; "land" (and first, the gun) hits
   the chord and the crash. */
function flRaceBar(E, t, o = {}) {
  const leg = flInt(o.leg, 0, 3), tense = flInt(o.tense, 0, 5), turn = flMod(o.bar, 4), chord = FL_TURN[turn];
  /* each leg a little more of the band than the last, and the last stretch swelling with its tense */
  const phrase = flMod(o.phrase ?? o.bar, 8), final = !!o.final;
  const lv = FL_BAND * [0.86, 0.93, 1, 1.05][leg] * (final ? 1.04 : 1) * (1 + tense * 0.04) * (Number(o.level) > 0 ? Number(o.level) : 1);
  const at = i => t + i * FL_STEP_S;
  const suspend = o.drop === "suspend", hit = o.drop === "land" || !!o.first;
  /* a rehearsal's stems (opts.only: "drums", "bass", "guitar"); the room always hears the whole band */
  const only = Array.isArray(o.only) ? o.only : null, on = part => !only || only.includes(part);
  const V = flVoices(E, { kick:{ send:0.04, bright:0.8, gain:lv }, snare:{ pan:0.06, send:0.24, bright:1, gain:lv },
    hat:{ pan:0.32, send:0.08, bright:1, gain:lv }, tom:{ pan:-0.18, send:0.22, bright:0.7, gain:lv },
    crash:{ pan:-0.3, send:0.3, bright:1, gain:lv }, bass:{ send:0.06, bright:1, gain:lv },
    gtr:{ pan:-0.26, send:0.95, bright:1, gain:lv }, echo:{ pan:0.38, send:1.1, bright:0.6, gain:lv },
    chank:{ pan:0.42, send:0.5, bright:0.9, gain:lv }, lead:{ pan:0.12, send:1, bright:1, gain:lv },
    whirlL:{ pan:-0.6, send:0.8, bright:1, gain:lv }, whirlR:{ pan:0.6, send:0.8, bright:1, gain:lv } });
  const kit = FL_DRUMS[leg];
  /* the drums */
  if (!on("drums")) { /* a rehearsal's other stems */ } else if (suspend) {
    FLD.tom(E, V("tom"), t, NOTE.Fs4 / 4, 0.9);
    flRiser(E, t, FLOAT_BAR_S, 0.11 * lv);
  } else {
    const train = final && tense >= 3;
    const kicks = new Set(kit.kick);
    if (tense >= 4 || train) [0, 4, 8, 12].forEach(s => kicks.add(s));
    kicks.forEach(s => FLD.kick(E, V("kick"), at(s), s % 8 === 0 ? 1 : 0.78));
    if (leg === 0 && tense < 2) kit.rim.forEach(s => FLD.rim(E, V("snare"), at(s), 0.8));
    else {
      const snares = train ? [[2, 0.45], [4, 1], [6, 0.45], [10, 0.45], [12, 1], [14, 0.45]] : [[4, 1], [12, 1]];
      if (tense >= 2) snares.push([7, 0.2], [15, 0.24]);
      if (tense >= 4) snares.push([13, 0.4], [14, 0.5], [15, 0.62]);
      snares.forEach(([s, k]) => FLD.snare(E, V("snare"), at(s), k * 0.85));
    }
    if (tense >= 5) flRoll(E, V("snare"), at(8), 8 * FL_STEP_S, 0.1, 0.5);
    if (leg === 0) kit.shaker.forEach(s => FLD.shaker(E, V("hat"), at(s), s % 4 === 2 ? 0.9 : 0.55));
    else if (kit.hat16 || tense >= 3) for (let s = 0; s < 16; s++) FLD.hat(E, V("hat"), at(s), s % 2 ? 0.42 : 0.8);
    else kit.hat.forEach(s => FLD.hat(E, V("hat"), at(s), s % 4 === 0 ? 0.6 : 0.85));
    if (tense >= 1 && leg > 0) FLD.hat(E, V("hat"), at(14), 0.7, true);
    (kit.tom || []).forEach(s => FLD.tom(E, V("tom"), at(s), NOTE.Fs4 / 4, 0.5));
    if (o.fill) FL_FILL.forEach(([s, f]) => FLD.tom(E, V("tom"), at(s), f, leg ? 0.85 : 0.6));
    if (o.crash || hit || (tense >= 3 && turn % 2 === 0)) FLD.crash(E, V("crash"), t, hit ? 1 : 0.7);
    if (tense >= 4) flRiser(E, t, FLOAT_BAR_S, (tense >= 5 ? 0.09 : 0.055) * lv, 0.1);
  }
  /* the bass */
  const line = FL_BASS[phrase === 7 && chord === "E" ? "home" : chord];
  if (!on("bass")) { /* a rehearsal's other stems */ } else if (suspend) flBass(E, V("bass"), t, FN.B1, FLOAT_BAR_S * 0.95, 0.3);
  else if (leg === 0 && tense < 2)
    [[0, 0, 5], [6, 2, 2], [8, 4, 5], [14, 3, 2]].forEach(([s, k, len]) => flBass(E, V("bass"), at(s), fn(line[k]), len * FL_STEP_S * 0.9, s % 8 === 0 ? 0.26 : 0.19));
  else line.forEach((name, k) => flBass(E, V("bass"), at(k * 2), fn(name), FL_STEP_S * 1.6, k % 4 === 0 ? 0.26 : 0.2));
  /* the guitar */
  if (!on("guitar")) return;
  if (suspend) {
    flTwang(E, t, FN.B3, FLOAT_BAR_S * 0.92, 0.12, { dest:V("gtr"), trem:16, vib:0.5, sus:0.8 });
    flDrip(E, t, 0.7 * lv);
  } else if (leg === 0 && turn % 2 === 1 && tense < 3) {
    /* the Put-in answers its own call with one chord, left to ring */
    flStrum(E, t, FL_CHORD[chord], 0.7, 0.14, { dest:V("gtr"), vib:0.7, sus:0.5 });
    flStrum(E, t + FL_SLAP_S, FL_CHORD[chord], 0.5, 0.045, { dest:V("echo"), bright:0.6 });
  } else {
    FL_RIFF[turn].forEach(([s, name, len, how]) => {
      const f = fn(name), d = len * FL_STEP_S * 0.92;
      const shape = { vib:how === "v" ? 1 : 0, dive:how === "d" ? 0.11 : 0, trem:tense >= 3 && len >= 4 ? 16 : 0 };
      flTwang(E, at(s), f, d, 0.34, { dest:V("gtr"), ...shape });
      flTwang(E, at(s) + FL_SLAP_S, f, d * 0.85, 0.1, { dest:V("echo"), bright:0.6, ...shape });
    });
    if (phrase === 0 || hit) flDrip(E, t, 0.6 * lv);
  }
  if (hit) flStrum(E, t, FL_CHORD.B, 0.9, 0.11, { dest:V("chank"), vib:0.6 });
  if (leg >= 1 && !suspend) [4, 12].forEach(s => flChank(E, V("chank"), at(s), FL_CHORD[chord], 1));
  if (leg === 2 && !suspend && phrase >= 4 && turn >= 2)
    FL_WHIRL[chord].forEach((name, k) => flTwang(E, at(8 + k), fn(name), 0.12, 0.055, { dest:V(k % 2 ? "whirlR" : "whirlL"), bright:0.8, sus:0.3 }));
  if (!suspend && (final || (leg === 3 && phrase >= 4)))
    FL_LEAD[turn].forEach(([s, name, len, how = ""]) => flTwang(E, at(s), fn(name), len * FL_STEP_S * 0.95, 0.15,
      { dest:V("lead"), trem:how.includes("t") ? 16 : 0, vib:0.8, dive:how.includes("d") ? 0.18 : 0 }));
}

/* On the grid: a palm-muted pedal on B (the bass in eighths, the guitar
   chugging three, three and two), hats and a kick; the second bar lifts
   to D and E on its last beat */
function flVampBar(E, t, o = {}) {
  const bar = flMod(o.bar, 2), lv = FL_BAND * 0.85;
  const at = i => t + i * FL_STEP_S;
  const V = flVoices(E, { kick:{ send:0.04, bright:0.8, gain:lv }, hat:{ pan:0.32, send:0.08, bright:1, gain:lv },
    bass:{ send:0.06, bright:1, gain:lv }, gtr:{ pan:-0.24, send:0.9, bright:1, gain:lv }, echo:{ pan:0.38, send:1.1, bright:0.6, gain:lv } });
  [0, 8].forEach(s => FLD.kick(E, V("kick"), at(s), s ? 0.6 : 0.85));
  for (let s = 0; s < 16; s += 2) FLD.hat(E, V("hat"), at(s), s % 4 ? 0.7 : 0.4);
  for (let k = 0; k < 8; k++) flBass(E, V("bass"), at(k * 2), FN.B1, FL_STEP_S * 1.2, k % 4 === 0 ? 0.28 : 0.2);
  [0, 3, 6, 8, 11].forEach(s => flTwang(E, at(s), FN.B2, 0.07, 0.12, { dest:V("gtr"), bright:0.5, sus:0.3, release:0.05 }));
  if (bar === 1) [[12, "D3", 0.2], [14, "E3", 0.24]].forEach(([s, name, d]) => {
    flTwang(E, at(s), fn(name), d, 0.14, { dest:V("gtr"), vib:s === 14 ? 0.7 : 0 });
    flTwang(E, at(s) + FL_SLAP_S, fn(name), d * 0.8, 0.045, { dest:V("echo"), bright:0.6 });
  });
  else flTwang(E, at(14), FN.B2, 0.07, 0.12, { dest:V("gtr"), bright:0.5, sus:0.3, release:0.05 });
}

/* the lobby's lounge: an eight-bar turn rocking D, A, B minor, A (E sus on
   the seventh), a clean guitar arpeggio through the amp's vibrato, an
   upright bass, and a lap steel singing over bars three, four, seven and
   eight; the drums come and go by section so the loop breathes */
const FL_LOUNGE = (() => {
  const D = { arp:["D3", "A3", "D4", "Fs4", "A4", "Fs4", "D4", "A3"], bass:[[0, "D2", 6], [8, "A2", 4], [12, "Fs2", 2], [14, "E2", 2]] };
  const A = { arp:["A2", "E3", "A3", "B3", "E4", "B3", "A3", "E3"], bass:[[0, "A2", 6], [8, "E2", 4], [12, "Fs2", 2], [14, "A2", 2]] };
  const Bm = { arp:["B2", "Fs3", "B3", "D4", "Fs4", "D4", "B3", "Fs3"], bass:[[0, "B1", 6], [8, "Fs2", 4], [12, "A2", 2], [14, "B2", 2]] };
  const Es = { arp:["E3", "A3", "B3", "E4", "A4", "E4", "B3", "A3"], bass:[[0, "E2", 6], [8, "B2", 4], [12, "A2", 2], [14, "Fs2", 2]] };
  return Object.freeze([D, A, { ...Bm, steel:[[0, "Fs4", 6], [6, "E4", 2], [8, "D4", 6], [14, "B3", 2]] },
    { ...A, steel:[[0, "E4", 12], [12, "B3", 4]] }, D, A, { ...Es, steel:[[0, "A4", 6], [6, "B4", 2], [8, "A4", 4], [12, "Fs4", 4]] },
    { ...A, steel:[[0, "E4", 16]] }]);
})();
/* the score, for the tests (every note a name in FLOAT_NOTES) */
export const FLOAT_SCORE = Object.freeze({ turn:FL_TURN, riff:FL_RIFF, lead:FL_LEAD, bass:FL_BASS, chord:FL_CHORD, whirl:FL_WHIRL, lounge:FL_LOUNGE });
function flLoungeBar(E, t, o = {}) {
  const bar = flMod(o.bar, 8), section = flMod(o.section, 4), between = !!o.cut, chord = FL_LOUNGE[bar], lv = FL_BAND * 0.72;
  /* a lazy swing on the eighths */
  const at = i => t + i * FL_STEP_S + (i % 4 === 2 ? 0.03 : 0);
  const V = flVoices(E, { kick:{ send:0.06, bright:0.7, gain:lv }, snare:{ pan:0.06, send:0.3, bright:0.9, gain:lv },
    hat:{ pan:0.3, send:0.12, bright:1, gain:lv }, bass:{ send:0.08, bright:1, gain:lv },
    gtr:{ pan:-0.22, send:1.1, bright:1, gain:lv }, steel:{ pan:0.24, send:1.15, bright:1, gain:lv } });
  chord.bass.forEach(([s, name, len]) => flBass(E, V("bass"), at(s), fn(name), len * FL_STEP_S, s === 0 ? 0.3 : 0.22, { upright:true }));
  chord.arp.forEach((name, k) => flTwang(E, at(k * 2), fn(name), 0.42, k === 0 ? 0.075 : 0.06,
    { dest:V("gtr"), bright:0.55, sus:0.5, release:0.3, amp:4.6, bend:0.006 }));
  if (between || section === 1 || section === 2) for (let s = 0; s < 16; s += 2) FLD.shaker(E, V("hat"), at(s), s % 4 ? 0.5 : 0.3);
  if (between || section === 2) { FLD.kick(E, V("kick"), at(0), 0.5); FLD.brush(E, V("snare"), at(8), 0.8); }
  if (!between && (section === 1 || section === 3) && chord.steel) {
    let prev = 0;
    chord.steel.forEach(([s, name, len]) => { const f = fn(name); flSteel(E, V("steel"), at(s), f, len * FL_STEP_S, 0.07, prev); prev = f; });
  }
}

/* ── the river ── */
/* a stretch of river's layers, a riffle by default (so it reads alone):
   flow (the moving body, low-passed at tone), babble (a riffle's gurgle),
   hiss (spray), roar (the falls, a low thunder), swirl (the whirlpool
   circling the room), churn (the field's paddles run together, by their
   rate), laps (water slapping vinyl), plips (drops), crickets (the desert
   at night), level (all of it) */
const FL_RIVER = Object.freeze({ flow:0.6, tone:800, babble:0.5, hiss:0.15, roar:0, swirl:0, churn:0, laps:0, plips:1, crickets:0, level:1.5 });
export const FLOAT_RIVER_LAYERS = Object.freeze(Object.keys(FL_RIVER));
/* One stretch: an equal-power rise and fall at each end, so the stretches
   laid over each other hold one level, and every layer moving from `from`
   to `to` across the middle. Each side is its own noise, so the river is
   wide. */
function flRiver(E, t, o = {}) {
  const c = E.ctx;
  const d = Math.max(0.6, (Number(o.ms) || 3000) / 1000), F = Math.min(d / 2.5, Math.max(0.05, (Number(o.fade) || 750) / 1000));
  const a = { ...FL_RIVER, ...(o.from || o.to || {}) }, b = { ...FL_RIVER, ...(o.to || o.from || {}) };
  const L = voice(E, { pan:-0.62, send:0.24, bright:1, gain:1 }), R = voice(E, { pan:0.62, send:0.24, bright:1, gain:1 });
  const RISE = [0.383, 0.707, 0.924, 1], FALL = [0.924, 0.707, 0.383];
  const env = side => {
    const g = c.createGain(); g.gain.value = 0;
    g.gain.setValueAtTime(0.0001, t);
    RISE.forEach((p, k) => g.gain.linearRampToValueAtTime(p, t + F * (k + 1) / 4));
    g.gain.setValueAtTime(1, t + d - F);
    FALL.forEach((p, k) => g.gain.linearRampToValueAtTime(p, t + d - F + F * (k + 1) / 4));
    g.gain.linearRampToValueAtTime(0.0001, t + d);
    g.connect(side); track(E, g);
    return g;
  };
  const sides = [env(L), env(R)];
  const lvl = (x, key, scale) => Math.max(0.0001, (Number(x[key]) || 0) * scale * (Number(x.level) || 0));
  /* one noise layer each side: through its filters (each [type, f0, f1, q]), its level moving a to b over the hold */
  const layer = (key, scale, filters, extra) => {
    const from = lvl(a, key, scale), to = lvl(b, key, scale);
    if (from <= 0.0001 && to <= 0.0001) return;
    sides.forEach((dest, side) => {
      const s = c.createBufferSource(); s.buffer = E.noise; s.loop = true;
      if (s.playbackRate) s.playbackRate.value = side ? 0.94 : 1.06;
      let node = s;
      track(E, s); trackSource(E, s);
      for (const [type, f0, f1, q] of filters) {
        const fl = c.createBiquadFilter(); fl.type = type; fl.Q.value = q;
        fl.frequency.setValueAtTime(f0, t); fl.frequency.setValueAtTime(f0, t + F); fl.frequency.linearRampToValueAtTime(f1, t + d - F);
        node.connect(fl); node = fl; track(E, fl);
      }
      const g = c.createGain(); g.gain.value = 0;
      g.gain.setValueAtTime(from, t); g.gain.setValueAtTime(from, t + F); g.gain.linearRampToValueAtTime(to, t + d - F);
      node.connect(g); track(E, g);
      if (extra) extra(g, side); else g.connect(dest);
      s.start(t, Math.random() * 1.9); s.stop(t + d + 0.05);
    });
  };
  const lfo = (param, rate, depth, phase = 0) => {
    const osc = c.createOscillator(); osc.type = "sine"; osc.frequency.value = rate;
    const amt = c.createGain(); amt.gain.value = depth;
    osc.connect(amt); amt.connect(param);
    track(E, osc, amt); trackSource(E, osc);
    osc.start(t + phase); osc.stop(t + d + 0.05);
  };
  layer("flow", 0.07, [["lowpass", a.tone, b.tone, 0.5], ["highpass", 60, 60, 0.5]]);
  /* the babble: a band of noise gurgling (its level shaken by two slow wobbles a hair apart) */
  layer("babble", 0.06, [["bandpass", 1700, 1700, 1.3]], (g, side) => {
    const am = c.createGain(); am.gain.value = 0.62;
    lfo(am.gain, side ? 3.1 : 3.7, 0.22); lfo(am.gain, side ? 7.9 : 6.7, 0.16, 0.05);
    g.connect(am); am.connect(sides[side]); track(E, am);
  });
  layer("hiss", 0.03, [["highpass", 4600, 4600, 0.6]]);
  layer("roar", 0.11, [["lowpass", 560, 560, 0.6]]);
  layer("roar", 0.08, [["bandpass", 95, 95, 0.9]]);
  /* the whirlpool: a band circling the room, one side swelling as the other falls */
  layer("swirl", 0.09, [["bandpass", 640, 640, 3]], (g, side) => {
    const am = c.createGain(); am.gain.value = 0.5;
    lfo(am.gain, 0.36, side ? -0.48 : 0.48);
    g.connect(am); am.connect(sides[side]); track(E, am);
  });
  /* the field's paddles run together: a band of water thrashed a dozen times a second */
  layer("churn", 0.05, [["bandpass", 1050, 1050, 0.9]], (g, side) => {
    const am = c.createGain(); am.gain.value = 0.6;
    lfo(am.gain, side ? 11.3 : 9.7, 0.34);
    g.connect(am); am.connect(sides[side]); track(E, am);
  });
  /* water slapping the vinyl now and then, drops, and the crickets in the hold */
  const mean = key => ((Number(a[key]) || 0) * (Number(a.level) || 0) + (Number(b[key]) || 0) * (Number(b.level) || 0)) / 2;
  const holdFrom = t + F, holdLen = Math.max(0.1, d - 2 * F);
  for (let i = 0, n = Math.round(mean("laps") * 2); i < n; i++) {
    const v = i % 2 ? R : L, x = holdFrom + rnd(0, holdLen - 0.4);
    swell(E, v, x, { d:0.38, f0:340, f1:760, q:1.1, peak:0.05 });
    mode(E, v, x + 0.22, 170, 0.08, 0.05, { drop:0.3 });
  }
  for (let i = 0, n = Math.round(mean("plips") * holdLen * 1.6); i < n; i++)
    flPlip(E, i % 2 ? R : L, holdFrom + rnd(0, holdLen), { f:rnd(800, 1900), gain:rnd(0.25, 0.6) });
  const crickets = mean("crickets");
  if (crickets > 0.01) [[L, 4650, 0.13], [R, 4920, 0.6]].forEach(([dest, f, phase]) => {
    const osc = c.createOscillator(); osc.type = "sine"; osc.frequency.value = f;
    const g = c.createGain(); g.gain.value = 0;
    g.gain.setValueAtTime(0, t);
    for (let x = holdFrom + phase; x < holdFrom + holdLen - 0.15; x += rnd(0.75, 1.1))
      for (let p = 0; p < 3; p++) {
        const s0 = x + p * 0.045;
        g.gain.setValueAtTime(0, s0); g.gain.linearRampToValueAtTime(0.012 * crickets, s0 + 0.004);
        g.gain.linearRampToValueAtTime(0.009 * crickets, s0 + 0.016); g.gain.linearRampToValueAtTime(0, s0 + 0.022);
      }
    osc.connect(g); g.connect(dest);
    track(E, osc, g); trackSource(E, osc);
    osc.start(t); osc.stop(t + d + 0.05);
  });
}

/* ── the field ── */
/* a paddle going in: the blade's band of noise sweeping down, the little cavity it leaves */
function flDip(E, dest, t, { pitch = 1, gain = 1 } = {}) {
  flSweep(E, dest, t, { f0:2200 * pitch, f1:700 * pitch, q:1.5, d:0.085, peak:0.24 * gain, a:0.005 });
  glide(E, dest, t + 0.004, 620 * pitch, 330 * pitch, 0.07, 0.07 * gain);
}
/* Strokes on the screen: dips where they were (opts.offsets ms, opts.pans),
   at most opts.grains of them (3), each a little quieter in a crowd
   (opts.n, the strokes they stand for). A big field never sounds one dip
   a stroke: the river's churn layer carries the rest. */
function flPaddles(E, t, o = {}) {
  const n = Math.max(1, Math.min(60, Math.round(Number(o.n) || 1)));
  const offsets = Array.isArray(o.offsets) ? o.offsets : [], pans = Array.isArray(o.pans) ? o.pans : [];
  const span = Math.max(0.02, (Number(o.span) || 60) / 1000), grains = Math.min(n, flInt(o.grains || 3, 1, 5));
  const V = flVoices(E, { L:{ pan:-0.45, send:0.28, bright:1, gain:1 }, C:{ pan:0, send:0.28, bright:1, gain:1 },
    R:{ pan:0.45, send:0.28, bright:1, gain:1 } });
  const side = p => p < -0.2 ? "L" : p > 0.2 ? "R" : "C";
  const k = 1 / Math.sqrt(Math.max(1, n / grains));
  for (let i = 0; i < grains; i++) {
    const dt = Number.isFinite(Number(offsets[i])) ? Math.max(0, Number(offsets[i])) / 1000 : i * span / grains + rnd(0, span / grains);
    const pan = Number.isFinite(Number(pans[i])) ? Number(pans[i]) : rnd(-0.5, 0.5);
    flDip(E, V(side(pan)), t + dt, { pitch:rnd(0.85, 1.2), gain:k * rnd(0.7, 1) });
  }
}

/* ── the screen's moments ── */
/* 3, 2, 1: a floor tom and a guitar fifth stepping up B, D, E; under the 1 the snare rolls into the gun */
function flCount(E, t, o = {}) {
  const n = flInt(o.n || 3, 1, 3), k = 3 - n;
  const dr = voice(E, { send:0.32, bright:0.8, gain:1 }), g = voice(E, { pan:-0.15, send:1, bright:1, gain:1 });
  FLD.tom(E, dr, t, [FN.Fs2, FN.A2, FN.B2][k], 1);
  FLD.kick(E, dr, t, 0.6);
  flTwang(E, t, [FN.B2, FN.D3, FN.E3][k], 0.55, 0.22, { dest:g, vib:0.7 });
  flTwang(E, t + 0.01, [FN.Fs3, FN.A3, FN.B3][k], 0.55, 0.15, { dest:g, vib:0.7 });
  flDrip(E, t + 0.005, 0.7);
  if (o.final) FLD.tom(E, dr, t + 0.25, [FN.Fs2, FN.A2, FN.B2][k] * 0.75, 0.6);
  if (n === 1) flRoll(E, voice(E, { pan:0.06, send:0.25, bright:1, gain:1 }), t + 0.5, 0.46, 0.1, 0.5);
}
/* the gun: an air horn and every paddle hitting the water at once (the final: two horns, a fourth apart) */
function flGo(E, t, o = {}) {
  flHorn(E, t, o.final ? 1.15 : 0.85, 1);
  if (o.final) flHorn(E, t + 0.015, 1.15, 0.5, NOTE.D5);
  FLD.kick(E, voice(E, { send:0.05, bright:0.8, gain:1 }), t, 1);
  flSplash(E, voice(E, { send:0.3, bright:1, gain:0.5 }), t + 0.06, { size:0.7 });
}
/* A leg's title: dun, dun, dun, DAAH on the toms, the last note ringing
   on the whammy. The Narrows throws it back off the canyon, Whirlpool Bend
   spins an arpeggio round the room, The Drop falls off the end of it, the
   final adds the horns and a roll (opts.summary: the last note and the crash) */
function flTitle(E, t, o = {}) {
  const leg = flInt(o.leg, 0, 3), final = !!o.final;
  const g = voice(E, { pan:-0.2, send:1.05, bright:1, gain:1 }), echo = voice(E, { pan:0.4, send:1.2, bright:0.6, gain:1 });
  const dr = voice(E, { send:0.25, bright:0.8, gain:1 }), cv = voice(E, { pan:-0.3, send:0.3, bright:1, gain:1 });
  const lines = [["B2", "D3", "E3", "Fs3"], ["B2", "B2", "D3", "E3"], ["Fs3", "E3", "D3", "B2"], ["B2", "D3", "E3", "A3"]];
  const notes = final ? ["B2", "D3", "E3", "B3"] : lines[leg];
  const hit = t + (o.summary ? 0 : 0.75);
  if (!o.summary) {
    flDrip(E, t, 0.8);
    if (final) flRoll(E, dr, t, 0.72, 0.08, 0.45);
    notes.slice(0, 3).forEach((name, k) => {
      const x = t + k * 0.25;
      flTwang(E, x, fn(name), 0.18, 0.2, { dest:g });
      flTwang(E, x + FL_SLAP_S, fn(name), 0.15, 0.06, { dest:echo, bright:0.6 });
      FLD.tom(E, dr, x, [FN.Fs2, FN.A2, FN.B2][k], 0.7);
    });
  }
  const last = fn(notes[3]), shape = { vib:1, trem:final ? 16 : 0, dive:leg === 3 && !final ? 0.5 : 0, sus:0.6 };
  flTwang(E, hit, last, 1.3, 0.24, { dest:g, ...shape });
  flTwang(E, hit + FL_SLAP_S, last, 1.05, 0.07, { dest:echo, bright:0.6, ...shape });
  if (leg === 1 && !final) [0.27, 0.405].forEach((e, j) => flTwang(E, hit + e, last, 0.6, 0.045 / (j + 1), { dest:echo, bright:0.5 }));
  FLD.kick(E, dr, hit, 1);
  FLD.crash(E, cv, hit, 0.9, 2);
  flBass(E, voice(E, { send:0.06, bright:1, gain:1 }), hit, FN.B1, 1.2, 0.34);
  if (o.summary) return;
  if (leg === 2 && !final)
    FL_WHIRL.B.forEach((name, k) => flTwang(E, hit + 0.3 + k * 0.07, fn(name) * 2, 0.1, 0.05, { pan:Math.sin(k * Math.PI / 4) * 0.7, send:1, bright:0.8 }));
  if (leg === 3 && !final) {
    fallWhistle(E, hit + 0.15, 0.7);
    M.drum(E, hit + 0.88, { f:NOTE.D2, dec:0.9, gain:0.9 });
    flSplash(E, voice(E, { send:0.4, bright:1, gain:0.8 }), hit + 0.9, { size:1 });
  }
  if (final) { flHorn(E, hit, 1.1, 0.6, NOTE.D5); flHorn(E, hit + 0.01, 1.1, 0.48, NOTE.A4); }
}
/* the Cup opens: the spring's drip, a tremolo dive down the low string (the
   surf's own opening), the chord and the crash, then the riff's first
   notes (opts.summary: the chord and the crash) */
function flIntro(E, t, o = {}) {
  const g = voice(E, { pan:-0.2, send:1.1, bright:1, gain:1 }), echo = voice(E, { pan:0.4, send:1.2, bright:0.6, gain:1 });
  const dr = voice(E, { send:0.2, bright:0.8, gain:1 }), bv = voice(E, { send:0.06, bright:1, gain:1 });
  const hit = t + (o.summary ? 0 : 1.5);
  if (!o.summary) {
    flDrip(E, t, 1);
    flTwang(E, t + 0.05, FN.B2, 1.4, 0.2, { dest:g, trem:16, from:4, slide:1.3, sus:0.85, release:0.08 });
    flRiser(E, t + 0.2, 1.3, 0.08);
  }
  flStrum(E, hit, ["B2", "Fs3", "B3", "D4"], 0.9, 0.15, { dest:g, vib:0.8 });
  flStrum(E, hit + FL_SLAP_S, ["B2", "Fs3", "B3"], 0.7, 0.045, { dest:echo, bright:0.6 });
  FLD.crash(E, voice(E, { pan:-0.3, send:0.3, bright:1, gain:1 }), hit, 1, 2);
  FLD.kick(E, dr, hit, 1);
  flBass(E, bv, hit, FN.B1, 0.9, 0.34);
  if (o.summary) return;
  [[0.5, "B2", 0.18], [0.75, "B2", 0.18], [1.0, "D3", 0.18], [1.25, "E3", 0.7]].forEach(([dt, name, d], k) => {
    flTwang(E, hit + dt, fn(name), d, 0.2, { dest:g, vib:k === 3 ? 1 : 0 });
    flTwang(E, hit + dt + FL_SLAP_S, fn(name), d * 0.8, 0.06, { dest:echo, bright:0.6 });
    FLD.tom(E, dr, hit + dt, [FN.Fs2, FN.Fs2, FN.A2, FN.B2][k], 0.6);
  });
}
/* the round ends: the band stops on a chord, tremolo-picked and dived away */
function flButton(E, t) {
  const g = voice(E, { pan:-0.2, send:1.1, bright:1, gain:1 });
  flStrum(E, t, ["B2", "Fs3", "B3", "D4"], 0.8, 0.15, { dest:g, trem:16, dive:0.35, sus:0.7 });
  FLD.crash(E, voice(E, { pan:-0.3, send:0.3, bright:1, gain:1 }), t, 1, 1.8);
  FLD.kick(E, voice(E, { send:0.05, bright:0.8, gain:1 }), t, 1);
  flBass(E, voice(E, { send:0.06, bright:1, gain:1 }), t, FN.B1, 1.1, 0.34);
  flDrip(E, t + 0.01, 0.8);
}
/* Out: a floatie letting go. The valve squeals, the air goes out as a
   flapping reed that sinks, a hiss under it; each rider out a step lower
   down D's five (opts.step) */
const FL_OUT = Object.freeze([NOTE.A3, NOTE.Fs4 / 2, NOTE.E4 / 2, NOTE.D3, NOTE.B4 / 4, NOTE.A2, NOTE.Fs4 / 4, NOTE.E4 / 4]);
function flOut(E, t, o = {}) {
  const c = E.ctx, v = voice(E, { send:0.18, bright:1, gain:1 });
  const f0 = FL_OUT[flInt(o.step, 0, FL_OUT.length - 1)];
  glide(E, v, t, NOTE.E6, NOTE.B5, 0.12, 0.045, { type:"triangle", vib:31, depth:0.04 });
  const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 1.3;
  bp.frequency.setValueAtTime(1100, t + 0.05); bp.frequency.exponentialRampToValueAtTime(480, t + 0.72);
  const flap = c.createGain(); flap.gain.value = 0.6;
  const g = c.createGain(); g.gain.value = 0;
  g.gain.setValueAtTime(0.0001, t + 0.05); g.gain.linearRampToValueAtTime(0.22, t + 0.09);
  g.gain.setValueAtTime(0.22, t + 0.45); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.74);
  const osc = c.createOscillator(); osc.type = "sawtooth";
  osc.frequency.setValueAtTime(f0, t + 0.05); osc.frequency.exponentialRampToValueAtTime(f0 * 0.5, t + 0.74);
  osc.connect(flap); flap.connect(bp); bp.connect(g); g.connect(v);
  track(E, bp, flap, g, osc); trackSource(E, osc);
  osc.start(t + 0.05); osc.stop(t + 0.78);
  wobble(E, flap.gain, t + 0.05, 0.7, { rate:27, depth:0.4 });
  flSweep(E, v, t + 0.06, { f0:3200, f1:1200, q:0.9, d:0.6, peak:0.05, a:0.05 });
  mode(E, v, t + 0.7, 120, 0.06, 0.18, { drop:0.4 });
}
/* a bump: vinyl on vinyl, a rubber thud, a squeak and the bounce back (opts.big: a pile-up, with a boing) */
function flBump(E, t, o = {}) {
  const big = !!o.big, p = rnd(0.9, 1.15), v = voice(E, { send:0.16, bright:0.8, gain:big ? 1.15 : 1 });
  mode(E, v, t, 96 * p, 0.13, 0.6, { drop:0.6, a:0.002 });
  burst(E, v, t, { type:"lowpass", f:900, d:0.04, peak:0.3 });
  glide(E, v, t + 0.004, 640 * p, 1010 * p, 0.09, 0.07, { type:"triangle", vib:26, depth:0.05 });
  mode(E, v, t + 0.085, 110 * p, 0.08, 0.25, { drop:0.4 });
  if (big) boing(E, t + 0.02, { f:NOTE.D4, d:0.45, peak:0.13 });
}
/* off a rock: a duller thud, the vinyl scraping, a little gravel */
function flScrape(E, t) {
  const c = E.ctx, v = voice(E, { send:0.15, bright:0.9, gain:1 });
  mode(E, v, t, 130, 0.1, 0.45, { drop:0.5 });
  const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1150; bp.Q.value = 2.2;
  const g = c.createGain(); g.gain.value = 0;
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.11, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
  const osc = c.createOscillator(); osc.type = "sawtooth"; osc.frequency.value = 210 * rnd(0.92, 1.08);
  osc.connect(bp); bp.connect(g); g.connect(v);
  track(E, bp, g, osc); trackSource(E, osc);
  osc.start(t); osc.stop(t + 0.3);
  wobble(E, g.gain, t, 0.26, { rate:34, depth:0.05 });
  for (let i = 0; i < 4; i++) M.tick(E, t + 0.03 + i * 0.05 + rnd(0, 0.02), { gain:0.22, pitch:rnd(1.2, 1.8) });
}
/* a flip: a whoop up and over, the splash, bubbles coming up (opts.summary: the splash) */
function flFlip(E, t, o = {}) {
  const v = voice(E, { send:0.32, bright:1, gain:1 });
  if (o.summary) { flSplash(E, v, t, { size:1 }); return; }
  glide(E, voice(E, { send:0.25, bright:1, gain:0.55 }), t, NOTE.D5, NOTE.D6, 0.16, 0.08, { type:"triangle" });
  flSplash(E, v, t + 0.1, { size:1 });
  [0.42, 0.56, 0.74].forEach((dt, i) => flBlub(E, v, t + dt, 1 - i * 0.22));
}
/* over the lip of the Drop: the rush of the fall and a slide whistle going down (opts.ms) */
function flFall(E, t, o = {}) {
  const d = Math.max(0.3, (Number(o.ms) || 800) / 1000);
  swell(E, voice(E, { send:0.3, bright:1, gain:1 }), t, { d, f0:400, f1:2600, q:0.7, peak:0.2 });
  fallWhistle(E, t + 0.05, d * 0.9);
}
/* the Drop lands: the plunge's boom, the big splash, the spray coming down (opts.small: a later rider's) */
function flImpact(E, t, o = {}) {
  const k = o.small ? 0.55 : 1, v = voice(E, { send:0.4, bright:1, gain:k });
  M.drum(E, t, { f:NOTE.D2, dec:0.9 * k + 0.2, gain:0.9 * k });
  mode(E, v, t, 44, 0.7, 0.7, { drop:1.1 });
  flSplash(E, v, t + 0.005, { size:1.4 * k });
  noiseBed(E, voice(E, { send:0.5, bright:0.9, gain:0.5 * k }), t + 0.05, { type:"highpass", f:3200, d:1.4 * k, peak:0.18, a:0.08 });
}
/* a water balloon's arc (opts.ms, the flight): a slide whistle up and over, the throw's swish */
function flLob(E, t, o = {}) {
  const d = Math.max(0.5, (Number(o.ms) || 1200) / 1000), up = d * 0.45;
  const v = voice(E, { send:0.3, bright:1, gain:0.7 });
  burst(E, v, t, { f:2400, q:1, d:0.06, peak:0.3 });
  glide(E, v, t, NOTE.A4, NOTE.A5, up, 0.1, { vib:6, depth:0.015 });
  glide(E, v, t + up, NOTE.A5, NOTE.E5, d - up - 0.05, 0.09, { vib:6, depth:0.015 });
}
/* a balloon lands: the pop, the water, the drops, the rider spun round (opts.summary: no spin) */
function flSplat(E, t, o = {}) {
  const v = voice(E, { send:0.3, bright:1, gain:1 });
  burst(E, v, t, { type:"highpass", f:2600, q:0.7, d:0.012, peak:0.85 });
  flSweep(E, v, t + 0.004, { type:"lowpass", f0:3000, f1:500, q:0.8, d:0.26, peak:0.5, a:0.004 });
  for (let i = 0; i < 5; i++) flPlip(E, v, t + 0.08 + i * 0.05 + rnd(0, 0.03), { f:rnd(800, 1600), gain:0.8 });
  if (!o.summary) glide(E, voice(E, { send:0.25, bright:1, gain:0.4 }), t + 0.05, NOTE.D5, NOTE.A5, 0.42, 0.06, { type:"triangle", vib:13, depth:0.08 });
}
/* the bar's brass hand bell: an inharmonic ring off a strike */
function flRing(E, dest, t, f, k = 1) {
  [[1, 0.3, 1.6], [2, 0.12, 0.9], [2.76, 0.1, 0.55], [4.07, 0.05, 0.3], [5.4, 0.03, 0.18]]
    .forEach(([r, amp, dec]) => mode(E, dest, t, f * r * (1 + rnd(-0.0006, 0.0006)), dec, amp * k, { a:0.0015 }));
  burst(E, dest, t, { type:"highpass", f:5200, d:0.006, peak:0.2 * k });
}
/* in at the takeout: the bar's bell (opts.first: rung three times and a cymbal; opts.step varies the rest) */
function flBell(E, t, o = {}) {
  const v = voice(E, { send:0.45, bright:1, gain:1 });
  if (o.first) {
    [0, 0.16, 0.32].forEach((dt, i) => flRing(E, v, t + dt, NOTE.D6, i === 2 ? 0.85 : 0.65));
    FLD.crash(E, voice(E, { pan:-0.3, send:0.3, bright:1, gain:1 }), t + 0.32, 0.5, 1.4);
    return;
  }
  flRing(E, v, t, [NOTE.A5, NOTE.B5, NOTE.Fs5, NOTE.D6][flMod(o.step, 4)], 0.75);
}
/* a drink finished: two glasses meeting, the ice */
function flClink(E, t, o = {}) {
  const v = voice(E, { send:0.32, bright:1, gain:1 });
  const glass = (x, f, k) => {
    [[1, 0.16, 0.42], [2.32, 0.07, 0.2], [4.25, 0.035, 0.09]].forEach(([r, amp, dec]) => mode(E, v, x, f * r, dec, amp * k, { a:0.001 }));
    burst(E, v, x, { type:"highpass", f:6000, d:0.004, peak:0.25 * k });
  };
  const f = [NOTE.A6, FN.B6][flMod(o.step, 2)];
  glass(t, f, 1); glass(t + 0.014, f === NOTE.A6 ? FN.B6 : NOTE.A6, 0.7);
  for (let i = 0; i < 3; i++) M.tick(E, t + 0.05 + i * rnd(0.03, 0.06), { gain:0.18, pitch:rnd(1.6, 2.2) });
}
/* a rider joins the lobby: their floatie pumped up, the vinyl squeaking tight, a bell */
function flJoin(E, t) {
  const v = voice(E, { send:0.2, bright:1, gain:1 });
  [0, 0.11, 0.22].forEach((dt, i) => flSweep(E, v, t + dt, { f0:900 + i * 300, f1:1500 + i * 400, q:1.4, d:0.08, peak:0.16, a:0.02 }));
  glide(E, v, t + 0.32, NOTE.A5, NOTE.D6, 0.09, 0.07, { type:"triangle", vib:22, depth:0.03 });
  M.bell(E, t + 0.4, NOTE.D6, { gain:0.14, dec:0.6, send:0.3 });
}
/* a rider is ready: a squeak and a bell */
function flReady(E, t) {
  glide(E, voice(E, { send:0.15, bright:1, gain:0.8 }), t, NOTE.E5, NOTE.B5, 0.07, 0.06, { type:"triangle" });
  M.bell(E, t + 0.02, NOTE.A5, { gain:0.16, dec:0.7, send:0.3 });
}
/* The podium fanfare (the band out): a snare roll, the chord and the crash
   at PODIUM hit, da-da-da up B, D, E, F sharp, then the big B chord
   tremolo-picked under two horns (opts.summary: the chord and the crash) */
function flPodium(E, t, o = {}) {
  const g = voice(E, { pan:-0.2, send:1.05, bright:1, gain:1 }), echo = voice(E, { pan:0.4, send:1.2, bright:0.6, gain:1 });
  const dr = voice(E, { send:0.25, bright:0.9, gain:1 }), bv = voice(E, { send:0.06, bright:1, gain:1 });
  const cv = voice(E, { pan:-0.3, send:0.3, bright:1, gain:1 });
  if (o.summary) {
    flStrum(E, t, ["B2", "Fs3", "B3", "D4"], 1.4, 0.16, { dest:g, vib:1 });
    FLD.crash(E, cv, t, 1, 2); FLD.kick(E, dr, t, 1); flBass(E, bv, t, FN.B1, 1.4, 0.34);
    return;
  }
  flRoll(E, dr, t, 1.4, 0.08, 0.65, 20);
  const hit = t + 1.45;
  FLD.crash(E, cv, hit, 1, 2.2); FLD.kick(E, dr, hit, 1); flBass(E, bv, hit, FN.B1, 0.4, 0.34);
  flStrum(E, hit, ["B2", "Fs3", "B3"], 0.35, 0.16, { dest:g });
  [["D3", "A3", "D4"], ["E3", "B3", "E4"], ["Fs3", "B3", "Fs4"]].forEach((names, k) => {
    const x = hit + 0.5 + k * 0.25;
    flStrum(E, x, names, 0.2, 0.15, { dest:g });
    FLD.snare(E, dr, x, 0.6); FLD.kick(E, dr, x, 0.6);
    flBass(E, bv, x, fn(names[0]) / 2, 0.2, 0.28);
  });
  const big = hit + 1.25;
  flStrum(E, big, ["B2", "Fs3", "B3", "D4", "Fs4"], 1.8, 0.15, { dest:g, trem:16, vib:1, dive:0.12, sus:0.75 });
  flStrum(E, big + FL_SLAP_S, ["B2", "Fs3", "B3"], 1.4, 0.045, { dest:echo, bright:0.6 });
  FLD.crash(E, cv, big, 1, 2.4); FLD.kick(E, dr, big, 1); flBass(E, bv, big, FN.B1, 1.8, 0.34); flDrip(E, big, 1);
  flHorn(E, big, 1.0, 0.55, NOTE.D5); flHorn(E, big + 0.01, 1.0, 0.45, NOTE.A4);
}
/* a place on the podium lights (opts.place 3, 2, 1): a bell up the motif over the fanfare's hit */
function flStamp(E, t, o = {}) {
  const place = flInt(o.place || 3, 1, 3);
  M.bell(E, t, [NOTE.D6, NOTE.A5, NOTE.Fs5][place - 1], { gain:place === 1 ? 0.42 : 0.3, dec:place === 1 ? 2 : 1.3, send:0.35 });
  if (place === 1) M.bell(E, t + 0.004, NOTE.A6, { gain:0.16, dec:1.4, send:0.35 });
}
/* the winner's pose (opts.pose): air guitar shreds up the neck and dives;
   a chug glugs and slams the cup down; a backflip spins, splashes and
   lands a ta-da; a flex (and anything else) hits two power chords and sparkles */
function flWinner(E, t, o = {}) {
  const pose = String(o.pose || "");
  const g = voice(E, { pan:-0.1, send:1.05, bright:1, gain:1 }), dr = voice(E, { send:0.25, bright:0.9, gain:1 });
  const sparkle = x => [NOTE.D6, NOTE.Fs6, NOTE.A6, FN.B6].forEach((f, i) => M.bell(E, x + i * 0.06, f, { gain:0.12, dec:0.8, send:0.45, pan:-0.4 + i * 0.27 }));
  if (pose === "airguitar") {
    ["B3", "D4", "E4", "Fs4", "A4", "B4", "D5", "E5"].forEach((name, k) => flTwang(E, t + k * 0.06, fn(name), 0.07, 0.14, { dest:g, bright:1.1 }));
    flTwang(E, t + 0.5, FN.Fs5, 1.2, 0.17, { dest:g, vib:1.2, dive:0.6, trem:16, sus:0.8 });
    FLD.crash(E, dr, t + 0.5, 0.9, 1.8); FLD.kick(E, dr, t + 0.5, 1);
  } else if (pose === "chug") {
    for (let i = 0; i < 4; i++) glide(E, voice(E, { send:0.15, bright:0.8, gain:0.8 }), t + i * 0.19, 330, 190, 0.13, 0.16);
    M.knock(E, t + 0.86, { pitch:0.8, gain:0.9 }); M.felt(E, t + 0.86, { gain:0.6 });
    flClink(E, t + 0.9, { step:0 });
    sparkle(t + 1.1);
  } else if (pose === "backflip") {
    swell(E, voice(E, { send:0.25, bright:1, gain:1 }), t, { d:0.42, f0:400, f1:3000, q:0.8, peak:0.32 });
    flSplash(E, voice(E, { send:0.35, bright:1, gain:0.8 }), t + 0.48, { size:1 });
    M.bell(E, t + 0.8, NOTE.D5, { gain:0.38, dec:1.2 }); M.bell(E, t + 0.95, NOTE.A5, { gain:0.42, dec:1.6 });
    FLD.crash(E, dr, t + 0.95, 0.7, 1.6);
  } else {
    [[0, ["B2", "Fs3", "B3"]], [0.3, ["E3", "B3", "E4"]]].forEach(([dt, names], k) => {
      flStrum(E, t + dt, names, k ? 0.9 : 0.2, 0.16, { dest:g, vib:k ? 1 : 0 });
      FLD.kick(E, dr, t + dt, 1); FLD.tom(E, dr, t + dt, k ? NOTE.E4 / 4 : NOTE.B4 / 8 * 1.5, 0.8);
    });
    FLD.crash(E, dr, t + 0.3, 0.8, 1.6);
    sparkle(t + 0.42);
  }
}

/* ── the phone's own (the you bus): above the phone speaker's floor, soft ── */
/* your paddle: a soft dip (opts.side L/R, p 0..1 the stroke's power, v 0..3 which of four) */
function flYouDip(E, t, o = {}) {
  const right = o.side === "R", p = Math.max(0, Math.min(1, Number(o.p ?? 0.8))), vr = flMod(o.v, 4);
  const pitch = [1, 1.09, 0.94, 1.16][vr] * (right ? 1.07 : 0.93) * rnd(0.98, 1.02);
  const v = voice(E, { send:0.18, bright:0.9, gain:0.45 + 0.45 * p });
  flSweep(E, v, t, { f0:2400 * pitch, f1:900 * pitch, q:1.4, d:0.08, peak:0.2, a:0.004 });
  glide(E, v, t + 0.004, 900 * pitch, 520 * pitch, 0.06, 0.08);
  if (vr === 3) flPlip(E, v, t + 0.14, { f:1500 * pitch, gain:0.6 });
}
/* you flipped: your splash and your bubbles */
function flYouFlip(E, t) {
  const v = voice(E, { send:0.2, bright:1, gain:0.7 });
  flSplash(E, v, t, { size:0.7 });
  [0.32, 0.46].forEach((dt, i) => flBlub(E, v, t + dt, 1 - i * 0.25));
}
/* you're in at the takeout: the bar's bell, then D up to A */
function flYouArrive(E, t) {
  flRing(E, voice(E, { send:0.3, bright:1, gain:0.7 }), t, NOTE.D6, 0.8);
  M.bell(E, t + 0.18, NOTE.D5, { gain:0.32, dec:1, send:0.2 }); M.bell(E, t + 0.3, NOTE.A5, { gain:0.36, dec:1.4, send:0.2 });
}
/* your drink: the glasses meet */
function flYouDrink(E, t) { flClink(E, t, { step:1 }); }
/* through at the cut: the motif rung up to D */
function flYouThrough(E, t) {
  M.clack(E, t, { gain:0.3, double:false });
  [NOTE.D5, NOTE.Fs5, NOTE.A5].forEach((f, i) => M.bell(E, t + 0.01 + i * 0.09, f, { gain:0.32, dec:1.1, send:0.2 }));
  M.bell(E, t + 0.3, NOTE.D6, { gain:0.2, dec:1.4, send:0.2 });
}
/* your balloon away: the whistle going up */
function flYouThrow(E, t) {
  const v = voice(E, { send:0.2, bright:1, gain:0.6 });
  burst(E, v, t, { f:2400, q:1, d:0.05, peak:0.25 });
  glide(E, v, t, NOTE.A4, NOTE.A5, 0.4, 0.09, { vib:6, depth:0.015 });
}
/* your balloon landed: the splat and a bright note */
function flYouSplat(E, t) {
  const v = voice(E, { send:0.2, bright:1, gain:0.7 });
  burst(E, v, t, { type:"highpass", f:2600, q:0.7, d:0.012, peak:0.7 });
  flSweep(E, v, t + 0.004, { type:"lowpass", f0:3000, f1:600, q:0.8, d:0.22, peak:0.4, a:0.004 });
  M.bell(E, t + 0.12, NOTE.A5, { gain:0.3, dec:0.9, send:0.2 });
}
/* you got splashed: a soft splash and a blub */
function flYouHit(E, t) {
  const v = voice(E, { send:0.2, bright:1, gain:0.5 });
  flSweep(E, v, t, { type:"lowpass", f0:3000, f1:600, q:0.8, d:0.24, peak:0.4, a:0.006 });
  flBlub(E, v, t + 0.25, 0.8);
}
/* your place on the podium (opts.place): the motif, the whole of it for 1st */
function flYouPodium(E, t, o = {}) {
  const place = flInt(o.place || 3, 1, 3);
  M.clack(E, t, { gain:0.3, double:false });
  [NOTE.D5, NOTE.Fs5, NOTE.A5].slice(0, 4 - place).forEach((f, i) => M.bell(E, t + 0.01 + i * 0.1, f, { gain:0.34, dec:1.2, send:0.2 }));
  if (place === 1) { M.bell(E, t + 0.32, NOTE.D6, { gain:0.26, dec:1.6, send:0.2 }); M.bell(E, t + 0.36, NOTE.A6, { gain:0.12, dec:1.2, send:0.2 }); }
}
/* ════ end of Float ════ */
