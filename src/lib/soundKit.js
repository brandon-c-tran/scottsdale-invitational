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

export const NOTE = Object.freeze({ D2:73.42, A2:110, D3:146.83, A3:220, D4:293.66, E4:329.63, Fs4:369.99,
  A4:440, B4:493.88, D5:587.33, E5:659.25, Fs5:739.99, A5:880 });

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

/* one voice: gain -> tone -> pan -> dry + reverb send. The engine's own
   `pan` (stereo placement by canvas x) adds to the recipe's. */
function voice(E, { pan = 0, send = 0.2, bright = 1, gain = 1 } = {}) {
  const c = E.ctx;
  const g = c.createGain(); g.gain.value = gain;
  const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 0.5;
  lp.frequency.value = Math.min(18000, 13000 * bright);
  const p = c.createStereoPanner(); p.pan.value = E.listen === "phone" ? 0 : clampPan(pan + (E.pan || 0));
  const s = c.createGain(); s.gain.value = send;
  g.connect(lp); lp.connect(p); p.connect(E.dry); p.connect(s); s.connect(E.wet);
  return g;
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
  },
  /* knuckle on a wooden table */
  knock(E, t, o = {}) {
    const p = (o.pitch || 1) * rnd(0.98, 1.02);
    const v = voice(E, { pan:o.pan || 0, send:0.18, bright:0.8, gain:o.gain ?? 1 });
    mode(E, v, t, 185 * p, 0.11, 0.55, { drop:0.25 });
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
  },
  /* the sun-bell: celesta-like, harmonic, warm, short strike */
  bell(E, t, f, o = {}) {
    const dec = o.dec || 2.4;
    const v = voice(E, { pan:o.pan || 0, send:o.send ?? 0.38, bright:1, gain:o.gain ?? 1 });
    [[1, 0.24, dec], [2.0, 0.07, dec * 0.45], [3.0, 0.022, dec * 0.3], [4.07, 0.035, dec * 0.14], [6.1, 0.012, dec * 0.07]]
      .forEach(([r, amp, d]) => mode(E, v, t, f * r * (1 + rnd(-0.0008, 0.0008)), d, amp, { a:0.003 }));
    mode(E, v, t, f * 1.0025, dec * 0.8, 0.08, { a:0.003 });
    burst(E, v, t, { type:"highpass", f:4000, d:0.005, peak:0.04 });
  },
  /* a low singing bowl: inharmonic, slow beating */
  bowl(E, t, f, o = {}) {
    const dec = o.dec || 4.5;
    const v = voice(E, { pan:o.pan || 0, send:0.45, bright:0.9, gain:o.gain ?? 1 });
    [[1, 0.22, dec], [1.004, 0.12, dec], [2.71, 0.08, dec * 0.55], [5.15, 0.03, dec * 0.3]]
      .forEach(([r, amp, d]) => mode(E, v, t, f * r, d, amp, { a:0.006 }));
    burst(E, v, t, { type:"lowpass", f:600, d:0.03, peak:0.12 });
  },
  /* a low frame drum, felt beater */
  drum(E, t, o = {}) {
    const f = o.f || 68;
    const v = voice(E, { pan:o.pan || 0, send:o.send ?? 0.2, bright:0.5, gain:o.gain ?? 1 });
    mode(E, v, t, f, o.dec || 0.55, 0.85, { drop:1.4, a:0.002 });
    mode(E, v, t, f * 1.59, 0.16, 0.18, { drop:0.3 });
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

/* ── the kit ──
   where: tv (the room), phone (the owner's own moments), gm (the
   commissioner's phone). ms: roughly how long it rings. */
export const KIT = Object.freeze([
  { id:"S1", name:"Field Day call", where:["tv"], ms:900,
    play:(E, t) => { M.drum(E, t, { f:NOTE.D2, dec:0.9, gain:0.7 }); M.bell(E, t, NOTE.A4, { gain:0.8 });
      M.bell(E, t + 0.17, NOTE.D5, { gain:0.75 }); M.bell(E, t + 0.34, NOTE.Fs5, { gain:0.7, dec:3.2 }); } },
  { id:"S2", name:"Event intro", where:["tv"], ms:1200,
    play:(E, t) => { M.drum(E, t, { f:NOTE.D2, dec:0.8 }); M.bell(E, t + 0.02, NOTE.D4, { gain:0.8, dec:3 });
      M.bell(E, t + 0.02, NOTE.A4, { gain:0.6, dec:3 }); M.bell(E, t + 0.42, NOTE.D5, { gain:0.4 }); } },
  { id:"S3", name:"Card turns", where:["tv"], ms:30,
    play:(E, t) => M.tick(E, t) },
  { id:"S4", name:"Your card", where:["phone"], ms:500,
    play:(E, t) => { M.bell(E, t, NOTE.D5, { gain:0.9, dec:1.8, send:0.25 }); M.bell(E, t + 0.09, NOTE.Fs5, { gain:0.5, dec:1.4, send:0.25 }); } },
  { id:"S5", name:"Chip placed", where:["phone", "tv"], ms:30,
    play:(E, t) => M.clack(E, t) },
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
  { id:"S26", name:"Didn't save", where:["gm", "phone"], ms:300,
    play:(E, t) => { M.felt(E, t, { gain:0.7 }); M.felt(E, t + 0.15, { gain:0.55 }); } },
].map(Object.freeze));

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
].map(Object.freeze));

export const SOUNDS = Object.freeze(Object.fromEntries([...KIT, ...PARTS].map(s => [s.id, s])));
export const SOUND_IDS = Object.freeze(KIT.map(s => s.id));
export const isSound = id => Object.prototype.hasOwnProperty.call(SOUNDS, id);

/* Play one recipe on an engine at context time t. `pan` places it by canvas
   x (ignored on a phone speaker); every material in the recipe shares it. */
export function playRecipe(E, id, t, { pan = 0, ...opts } = {}) {
  const s = SOUNDS[id];
  if (!s || !E) return false;
  const was = E.pan;
  E.pan = clampPan(pan);
  try { s.play(E, t, opts); } finally { E.pan = was; }
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
