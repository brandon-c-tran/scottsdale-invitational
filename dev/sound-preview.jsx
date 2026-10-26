/* Development-only sound rehearsal (A1, A2, A3, A8). Every kit sound and
   the five sequences on the production schedules (roomSound.js advanceCues
   and crownCues, the draw's drawStepDelay, the TV chip limiter), with the
   TV vs phone speaker, the session's room, the walkout and Quick Draw hush
   and reduced motion. A second panel drives the real engine (src/lib/sound.js)
   to show its routing and gates. ?selftest renders every recipe, sequence and
   room offline and writes SELFTEST OK or SELFTEST FAIL into the title.
   No app connection, storage, or remote service. */
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { BIT_PARTS, BOARD_PARTS, FLOAT_PARTS, GEO_PARTS, KARAOKE_PARTS, KIT, PARTS, SOUNDS, ROOMS, TRIVIA_PARTS, makeEngine, playRecipe, setListen, setRoom,
  limitChips } from "../src/lib/soundKit.js";
import { barsBetween as floatBars } from "../float/client/sound/music.js";
import { RIVER_FADE_MS, RIVER_MIX, RIVER_SEG_MS, RIVER_STEP_MS } from "../float/client/sound/river.js";
import { PODIUM_BEATS } from "../float/client/sound/screen.js";
import { advanceCues, crownCues, revealPans } from "../src/features/tv/roomSound.js";
import { geoClockCues, geoRevealCues } from "../src/features/tv/geoSound.js";
import { triviaBoardCues, triviaClockCues, triviaRevealCues } from "../src/features/tv/triviaSound.js";
import { DRAW_INTRO_MS, drawStepDelay } from "../src/features/weekend/drawReveal.js";
import { ADVANCE_TIMING, CROWN_TIMING } from "../src/features/tv/tvMotion.js";
import { MOTION } from "../src/lib/motion.js";
import {
  playSound, cueAt, setSoundSurface, setWalkout, setQuickDrawHush, unlockSound, isHushed, busAllowed,
  soundSurface, subscribeSound, __soundEngine,
} from "../src/lib/sound.js";
import { serverNow } from "../src/lib/serverClock.js";
import "../src/ui/experience.css";

const GROUPS = [
  ["Arrival and announcement", ["S1", "S2", "S3", "S4"]],
  ["Betting", ["S5", "S6", "S7", "S8"]],
  ["A contest decided", ["S9", "S10", "S11", "S12", "S13"]],
  ["Results and standings", ["S14", "S15"]],
  ["Duels", ["S16", "S17"]],
  ["Draft", ["S18", "S19"]],
  ["Poker finale", ["S20", "S21", "S22"]],
  ["Crown", ["S23", "S24"]],
  ["Commissioner", ["S25", "S26"]],
  ["Sequence parts", PARTS.map(part => part.id)],
  ["Trivia board", BOARD_PARTS.map(part => part.id)],
  ["Bits", BIT_PARTS.map(part => part.id)],
  ["Karaoke", KARAOKE_PARTS.map(part => part.id)],
  ["Where and When", GEO_PARTS.map(part => part.id)],
  ["Trivia", TRIVIA_PARTS.map(part => part.id)],
  ["Float", FLOAT_PARTS.map(part => part.id)],
];

/* the five sequences, built from the production schedules */
function sequences() {
  const n = 6, mine = 2;
  const pans = revealPans({ groups:Array.from({ length:n }, () => ({})) });
  const q1 = [{ at:0, id:"S2", where:"tv", label:"Intro as the game mark lands" }];
  for (let i = 0; i < n; i++) {
    const at = DRAW_INTRO_MS + drawStepDelay(i, n);
    q1.push({ at, id:"S3", pan:pans[i], where:"tv", label:`Card ${i + 1} turns` });
    if (i === mine) q1.push({ at, id:"S4", where:"phone", label:"Your card rings" });
  }
  const q2 = advanceCues({ id:"q2", decidedAt:1, settle:{ winners:[1], losers:[1] } },
    { anchor:1, matches:[{ target:{ r:1, m:0, index:0 } }], hotTo:[1, 0] })
    .map(cue => ({ ...cue, at:cue.at - 1, where:"tv", label:SOUNDS[cue.id].name }));
  q2.push({ at:MOTION.stamp + 250 + MOTION.flight + 420, id:"S12", where:"phone", label:"Your winnings land in Home" });
  const q3 = crownCues({ id:"q3", anchor:1 }).map(cue => ({ ...cue, at:cue.at - 1, where:"tv", label:SOUNDS[cue.id].name }));
  const times = [150, 420, 700, 760, 820, 880, 1500, 1900, 1960, 2600, 2650, 2700, 2750, 2800, 3400, 3900];
  const { plan } = limitChips(null, times.map((at, k) => ({ at, pan:k % 3 === 0 ? 0.55 : -0.55 })));
  const q4 = plan.filter(item => item.kind !== "skip").map(item => item.kind === "riffle"
    ? { at:item.at, id:"crowd", opts:{ n:item.n }, pan:item.pan * 0.6, where:"tv", label:`${item.n} chips at once: one riffle` }
    : { at:item.at, id:"S5", pan:item.pan, where:"tv", label:`A chip lands ${item.pan < 0 ? "left" : "right"}` });
  const q5 = [{ at:0, id:"S20", where:"tv", label:"Stacks build on the deal" },
    { at:1600, id:"S21", where:"tv", label:"Level 2: blinds up" }, { at:4200, id:"S22", where:"tv", label:"A bust tips flat" }];
  return [
    { id:"Q1", title:"Announce and draw", events:q1, summary:"S4" },
    { id:"Q2", title:"A match decided", events:q2, summary:"S10", note:`ADVANCE_TIMING total ${ADVANCE_TIMING.total} ms` },
    { id:"Q3", title:"The crown", events:q3, summary:"S1", note:`CROWN_TIMING total ${CROWN_TIMING.total} ms` },
    { id:"Q4", title:"Betting opens on the TV", events:q4, summary:null },
    { id:"Q5", title:"Finale: deal, level, bust", events:q5, summary:null },
  ];
}
const SEQS = sequences();
const seqLength = q => Math.max(...q.events.map(e => e.at)) + 2500;

/* ── offline self-test: every recipe, sequence and room renders non-silent and unclipped ── */
async function measure(label, seconds, fn, { room = "san", listen = "tv" } = {}) {
  const sr = 44100;
  const oc = new OfflineAudioContext(2, Math.ceil(sr * seconds), sr);
  const E = makeEngine(oc, { room, listen });
  fn(E, 0.05);
  const buf = await oc.startRendering();
  let peak = 0, sum = 0;
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; sum += d[i] * d[i]; }
  }
  const rms = Math.sqrt(sum / (buf.length * 2));
  const ok = Number.isFinite(peak) && peak > 0.02 && peak <= 1.0;
  return { label, peak, rms, ok };
}
async function selftest() {
  const rows = [];
  try {
    for (const s of [...KIT, ...PARTS, ...BOARD_PARTS, ...BIT_PARTS, ...KARAOKE_PARTS, ...GEO_PARTS, ...TRIVIA_PARTS, ...FLOAT_PARTS])
      rows.push(await measure(`${s.id} ${s.name}`, Math.max(1.5, s.ms / 1000 + 1.5), (E, t) => playRecipe(E, s.id, t)));
    /* Float on its own planners (float/client/sound): the river under the band, the moments over it */
    const floatRiver = (E, t, mixes) => { let last = null;
      mixes.forEach((mix, k) => { playRecipe(E, "floatRiver", t + k * RIVER_STEP_MS / 1000, { ms:RIVER_SEG_MS, fade:RIVER_FADE_MS, from:last || mix, to:mix }); last = mix; }); };
    const race = (leg, final) => ({ mode:"race", anchor:0, from:0, leg, final });
    const raceMem = (leg, final) => ({ view:{ phase:"race", round:leg, rounds:4, leg, final, field:[0, 1, 2] }, pack:{ leaderFrac:0, s:0 } });
    rows.push(await measure("float: the count-in (3 2 1 and the sticks), the gun, the Put-in's first bars", 14, (E, t) => {
      [3, 2, 1].forEach((n, k) => playRecipe(E, "floatCount", t + k, { n }));
      [0.5, 1.5, 2.5].forEach(x => playRecipe(E, "floatCountTick", t + x));
      playRecipe(E, "floatGo", t + 3);
      floatBars(race(0, false), 0, 8000, raceMem(0, false)).forEach(bar => playRecipe(E, bar.id, t + 3 + bar.at / 1000, bar.opts));
      floatRiver(E, t, Array.from({ length:5 }, () => ({ ...RIVER_MIX.pool, churn:0.4, crickets:0, level:1 })));
      for (let x = 3.1; x < 11; x += 0.11) playRecipe(E, "floatPaddles", t + x, { n:4, grains:1, pan:0 });
    }));
    rows.push(await measure("float: the final at the Drop (tense to 5, the lip, the landing, the bells)", 20, (E, t) => {
      floatBars(race(3, true), 0, 16000, raceMem(3, true)).forEach((bar, i) => playRecipe(E, bar.id, t + bar.at / 1000,
        { ...bar.opts, tense:[0, 0, 1, 2, 3, 4, 5, 5][i], drop:i === 3 ? "suspend" : i === 4 ? "land" : undefined }));
      floatRiver(E, t, Array.from({ length:8 }, (_, k) => ({ ...RIVER_MIX.drop, roar:Math.min(1, k / 3), hiss:0.7, churn:0.2, crickets:0, level:1 })));
      [[7.2, "floatFall"], [8.0, "floatImpact"], [8.9, "floatImpact", { small:true }], [11.3, "floatFlip"], [13, "floatBell", { first:true }],
        [13.6, "floatClink"], [14.2, "floatSplat"], [15.1, "floatBell", { step:1 }]].forEach(([s, id, o]) => playRecipe(E, id, t + s, o || {}));
    }));
    rows.push(await measure("float: the round ends: the button, four out, the lounge", 12, (E, t) => {
      playRecipe(E, "floatButton", t);
      [0, 1, 2, 3].forEach(k => playRecipe(E, "floatOut", t + 0.65 + k * 0.38, { step:k, pan:-0.6 + k * 0.4 }));
      floatBars({ mode:"lounge", anchor:0, from:0, cut:true }, 4000, 12000).forEach(bar => playRecipe(E, bar.id, t + (bar.at - 4000) / 1000 + 3.2, bar.opts));
    }));
    rows.push(await measure("float: the podium, its places and the winner's air guitar", 9, (E, t) => {
      playRecipe(E, "floatPodium", t, { open:true });
      [[3, PODIUM_BEATS.third], [2, PODIUM_BEATS.second], [1, PODIUM_BEATS.first]].forEach(([place, ms]) => playRecipe(E, "floatStamp", t + ms / 1000, { place }));
      playRecipe(E, "floatWinner", t + PODIUM_BEATS.pose / 1000, { pose:"airguitar" });
    }));
    rows.push(await measure("float: the lobby at night (the lounge, the pool, the crickets, riders joining)", 18, (E, t) => {
      floatBars({ mode:"lounge", anchor:0, from:0 }, 16000, 32000).forEach(bar => playRecipe(E, bar.id, t + (bar.at - 16000) / 1000, bar.opts));
      floatRiver(E, t, Array.from({ length:7 }, () => ({ ...RIVER_MIX.pool, crickets:1, level:0.8 })));
      [2.1, 5.5, 5.7, 11].forEach(s => playRecipe(E, "floatJoin", t + s)); playRecipe(E, "floatReady", t + 8);
    }));
    rows.push(await measure("float: your paddle, your flip, through (a phone)", 5, (E, t) => {
      for (let i = 0; i < 12; i++) playRecipe(E, "floatDip", t + i * 0.18, { side:i % 2 ? "R" : "L", v:i % 4 });
      playRecipe(E, "floatYouFlip", t + 2.4); playRecipe(E, "floatYouThrough", t + 3.4);
    }, { listen:"phone" }));
    rows.push(await measure("float: your strokes on the beat (perfect, good, then late), your groove's chimes (a phone)", 8, (E, t) => {
      for (let i = 0; i < 14; i++) playRecipe(E, "floatDip", t + i * 0.5 + (i > 9 ? 0.22 : 0), { side:i % 2 ? "R" : "L", v:i % 4,
        q:i < 5 ? "perfect" : i < 10 ? "good" : "late" });
      [[2.1, 1], [4.1, 2], [6.6, 3]].forEach(([s, level]) => playRecipe(E, "floatYouLevel", t + s, { level }));
    }, { listen:"phone" }));
    rows.push(await measure("float: a rider locks in over the final at the Drop's roar", 6, (E, t) => {
      floatBars(race(3, true), 0, 6000, raceMem(3, true)).forEach(bar => playRecipe(E, bar.id, t + bar.at / 1000, { ...bar.opts, tense:3 }));
      floatRiver(E, t, Array.from({ length:3 }, () => ({ ...RIVER_MIX.drop, roar:1, hiss:0.8, crickets:0, level:1 })));
      playRecipe(E, "floatLockedIn", t + 2.5, { pan:0.3 });
    }));
    /* the board's loudest moment: a buzz-in pile-up, the order, a wrong, a right */
    rows.push(await measure("board: four buzzes, the order, wrong then right", 4, (E, t) => {
      [0, 0.07, 0.14, 0.21].forEach((dt, i) => playRecipe(E, "buzzIn", t + dt, { step:i, pan:-0.6 + i * 0.4 }));
      [0, 0.12, 0.24, 0.36].forEach((dt, i) => playRecipe(E, "orderStamp", t + 0.7 + dt, { place:i + 1 }));
      playRecipe(E, "boardWrong", t + 2.2);
      playRecipe(E, "boardRight", t + 3.0);
    }));
    /* Where and When on its production schedules: a photo's last fourteen
       seconds (the bed, the tense bars, the ticks, the knock), then a
       twelve-pin reveal of the last photo */
    rows.push(await measure("geo: the minute's end, then a 12-pin reveal", 21, (E, t) => {
      const closesAt = 60000, from = closesAt - 14000;
      geoClockCues({ phase:"guess", startedAt:1, closesAt }, from).forEach(cue =>
        playRecipe(E, cue.id, t + (cue.at - from) / 1000, { ...(cue.opts || {}) }));
      geoRevealCues({ start:closesAt + 3000, count:12, pans:Array.from({ length:12 }, (_, i) => -0.7 + i * 0.127),
        revealedAt:closesAt + 3000, rows:6, last:true }).forEach(cue =>
        playRecipe(E, cue.id, t + (cue.at - from) / 1000, { pan:cue.pan || 0, ...(cue.opts || {}) }));
    }));
    /* Trivia on its production schedules: a 20 s question from its sting
       (the bed, the tense bars, the ticks, the knock), its reveal with a
       full room, the scores between rounds; a tune question (the bed in
       after the clip); the final podium */
    const lay = (E, t, cues, from) => cues.forEach(cue =>
      playRecipe(E, cue.id, t + (cue.at - from) / 1000, { pan:cue.pan || 0, ...(cue.opts || {}) }));
    const question = { phase:"question", format:"choice", startsAt:2500, closesAt:22500 };
    rows.push(await measure("trivia: a question, its reveal, the scores", 40, (E, t) => {
      playRecipe(E, "sting", t);
      lay(E, t, triviaClockCues(question, 0), 0);
      [6200, 9100, 14800].forEach((at, i) => playRecipe(E, "S18", t + at / 1000, { pan:-0.5 + i * 0.5 }));
      lay(E, t, triviaRevealCues({ anchor:24000, reveal:{ options:4, faces:7, points:[0, 1, 2, 3, 4, 5, 6, 7] } }), 0);
      lay(E, t, triviaBoardCues({ anchor:34000, rows:13 }), 0);
    }));
    rows.push(await measure("trivia: name that tune (the bed after the clip), the final podium", 30, (E, t) => {
      lay(E, t, triviaClockCues({ ...question, format:"tune" }, 0), 0);
      lay(E, t, triviaBoardCues({ anchor:25000, rows:13, last:true }), 0);
    }));
    for (const q of SEQS)
      rows.push(await measure(`${q.id} ${q.title}`, seqLength(q) / 1000 + 1,
        (E, t) => q.events.forEach(ev => playRecipe(E, ev.id, t + ev.at / 1000, { pan:ev.pan || 0, ...(ev.opts || {}) }))));
    for (const room of Object.keys(ROOMS)) {
      rows.push(await measure(`room ${room}: S1 on the TV`, 4, (E, t) => playRecipe(E, "S1", t), { room }));
      rows.push(await measure(`room ${room}: S5 on a phone`, 1.5, (E, t) => playRecipe(E, "S5", t), { room, listen:"phone" }));
    }
  } catch (error) { rows.push({ label:`ERROR ${error?.stack || error}`, peak:0, rms:0, ok:false }); }
  const fails = rows.filter(row => !row.ok).length;
  document.title = fails ? "SELFTEST FAIL" : "SELFTEST OK";
  window.__soundSelftest = { fails, rows };
  return rows;
}

const box = { background:"var(--paper)", border:"1px solid var(--line)", borderRadius:10, padding:12 };
const btn = { minHeight:44, padding:"8px 12px", borderRadius:6, border:"1px solid var(--line)", background:"var(--paper2)",
  color:"var(--ink)", font:"500 13px/1.2 Inter, system-ui, sans-serif", cursor:"pointer" };
const on = { ...btn, background:"var(--sun)", color:"var(--ink0)", borderColor:"var(--sun)" };

function Segment({ value, options, onChange, label }) {
  return <div role="group" aria-label={label} style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
    {options.map(([v, text]) => <button key={v} type="button" data-v={v} aria-pressed={value === v}
      style={value === v ? on : btn} onClick={() => onChange(v)}>{text}</button>)}
  </div>;
}

function Preview() {
  const ctx = useRef(null), eng = useRef(null);
  const [listen, setListenUi] = useState("tv");
  const [room, setRoomUi] = useState("fri");
  const [volume, setVolume] = useState(80);
  const [walkout, setWalkoutUi] = useState(false);
  const [qd, setQd] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [lit, setLit] = useState({});
  const [results, setResults] = useState(null);
  const [live, setLive] = useState({ surface:soundSurface(), hushed:false, log:[] });

  const ensure = () => {
    if (!ctx.current) {
      try { if (navigator.audioSession) navigator.audioSession.type = "ambient"; } catch {}
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx.current = new AC({ latencyHint:"interactive" });
      eng.current = makeEngine(ctx.current, { room, listen, volume:volume / 100 });
    }
    if (ctx.current.state !== "running") ctx.current.resume().catch(() => {});
    return eng.current;
  };
  useEffect(() => { if (eng.current) setRoom(eng.current, room); document.documentElement.dataset.phase = room; }, [room]);
  useEffect(() => { if (eng.current) setListen(eng.current, listen); }, [listen]);
  useEffect(() => { if (eng.current) eng.current.master.gain.setTargetAtTime(volume / 100, ctx.current.currentTime, 0.02); }, [volume]);
  useEffect(() => {
    if (!eng.current) return;
    const g = eng.current.hush.gain, t = ctx.current.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(walkout || qd ? 0 : 1, t + 0.15);
  }, [walkout, qd]);
  useEffect(() => { if (new URLSearchParams(location.search).has("selftest")) selftest().then(setResults); }, []);
  useEffect(() => subscribeSound(() => setLive(current => ({ ...current, surface:soundSurface(), hushed:isHushed() }))), []);

  const flash = (key, ms) => { setLit(v => ({ ...v, [key]:true })); setTimeout(() => setLit(v => ({ ...v, [key]:false })), Math.max(250, ms)); };
  const playOne = id => { const E = ensure(); playRecipe(E, id, ctx.current.currentTime + 0.03); flash(id, SOUNDS[id].ms); };
  const playSeq = q => {
    const E = ensure();
    const t0 = ctx.current.currentTime + 0.06;
    if (reduced) { if (q.summary) playRecipe(E, q.summary, t0); flash(q.id, 600); return; }
    q.events.forEach(ev => playRecipe(E, ev.id, t0 + ev.at / 1000, { pan:ev.pan || 0, ...(ev.opts || {}) }));
    flash(q.id, seqLength(q));
  };

  /* the real engine: routing and gates */
  const note = text => setLive(current => ({ ...current, log:[`${new Date().toLocaleTimeString()} ${text}`, ...current.log].slice(0, 8),
    hushed:isHushed(), surface:soundSurface() }));
  const liveButtons = [
    ["Phone surface", () => { setSoundSurface("phone"); note("Surface: phone (you and gm buses)"); }],
    ["TV surface", () => { setSoundSurface("tv"); note("Surface: TV (room bus)"); }],
    ["Your chip (you)", () => { unlockSound(); note(playSound("S5", { bus:"you" }) ? "S5 played on the you bus" : `S5 silent (${busAllowed("you", soundSurface()) ? "gated" : "wrong surface"})`); }],
    ["Room intro in 1 s (room)", () => { unlockSound(); note(cueAt("S2", serverNow() + 1000) ? "S2 cued on the room clock" : `S2 silent (${busAllowed("room", soundSurface()) ? "gated" : "wrong surface"})`); }],
    ["Late cue (400 ms ago)", () => { unlockSound(); note(cueAt("S14", serverNow() - 400) ? "played" : "Late cue dropped"); }],
    ["Walkout 5 s", () => { setWalkout({ player:"Evan", trackId:"preview", startedAt:serverNow(), until:serverNow() + 5000 }); note("Walkout: silent until it ends"); }],
    ["End walkout", () => { setWalkout(null); note("Walkout cleared"); }],
    ["Quick Draw armed", () => { setQuickDrawHush(!__soundEngine().quickDraw); note(`Quick Draw hush ${__soundEngine().quickDraw ? "on" : "off"}`); }],
  ];

  return <main style={{ padding:"20px 16px 64px", maxWidth:1100, margin:"0 auto", color:"var(--ink)", background:"var(--bg)", minHeight:"100vh" }}>
    <header style={{ borderTop:"3px solid var(--phase, var(--pool))", paddingTop:20 }}>
      <h1 style={{ font:"700 40px/1 'Barlow Condensed', 'Arial Narrow', sans-serif", textTransform:"uppercase", margin:0 }}>Field Day sound</h1>
      <p style={{ color:"var(--muted2)", margin:"8px 0 16px" }}>26 synthesized sounds, the sequence parts, and the five sequences on the production timings.</p>
    </header>
    <section style={{ ...box, display:"grid", gap:12, marginBottom:20 }}>
      <label style={{ display:"flex", gap:12, alignItems:"center" }}>Volume
        <input type="range" min="0" max="100" value={volume} onChange={e => setVolume(Number(e.target.value))} /></label>
      <Segment label="Listen" value={listen} onChange={setListenUi} options={[["tv", "TV speaker"], ["phone", "Phone speaker"]]} />
      <Segment label="Room" value={room} onChange={setRoomUi} options={[["fri", "Friday"], ["sam", "Sat AM"], ["sap", "Sat PM"], ["san", "Sat night"], ["fin", "Finale"]]} />
      <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
        <button type="button" id="hushWalkout" aria-pressed={walkout} style={walkout ? on : btn} onClick={() => { ensure(); setWalkoutUi(v => !v); }}>Walkout playing</button>
        <button type="button" id="hushQD" aria-pressed={qd} style={qd ? on : btn} onClick={() => { ensure(); setQd(v => !v); }}>Quick Draw armed</button>
        <button type="button" id="reduced" aria-pressed={reduced} style={reduced ? on : btn} onClick={() => setReduced(v => !v)}>Reduced motion</button>
      </div>
    </section>
    {GROUPS.map(([title, ids]) => <section key={title} style={{ marginBottom:18 }}>
      <h2 style={{ font:"700 24px/1 'Barlow Condensed', 'Arial Narrow', sans-serif", textTransform:"uppercase", margin:"0 0 8px" }}>{title}</h2>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(200px, 1fr))", gap:8 }}>
        {ids.map(id => { const s = SOUNDS[id]; return <button key={id} type="button" className="snd" data-s={id}
          style={{ ...(lit[id] ? on : btn), textAlign:"left" }} onClick={() => playOne(id)}>
          <b>{id}</b> {s.name}<br /><small>{(s.where || ["tv"]).join(" · ")} · {s.ms < 1000 ? `${s.ms} ms` : `${(s.ms / 1000).toFixed(1)} s`}</small></button>; })}
      </div>
    </section>)}
    <h2 style={{ font:"700 24px/1 'Barlow Condensed', 'Arial Narrow', sans-serif", textTransform:"uppercase", margin:"24px 0 8px" }}>Sequences</h2>
    {SEQS.map(q => <section key={q.id} style={{ ...box, marginBottom:10 }}>
      <button type="button" className="seq" data-q={q.id} style={lit[q.id] ? on : btn} onClick={() => playSeq(q)}>{q.id} {q.title}</button>
      {q.note && <small style={{ color:"var(--muted)", marginLeft:10 }}>{q.note}</small>}
      <ol style={{ margin:"8px 0 0", paddingLeft:20, color:"var(--muted2)", fontSize:12 }}>
        {q.events.map((ev, k) => <li key={k}><b style={{ color:"var(--ink)" }}>{(ev.at / 1000).toFixed(2)}s</b> {ev.where === "phone" ? "Phone" : "TV"} · {ev.id} · {ev.label}</li>)}
      </ol>
    </section>)}
    <h2 style={{ font:"700 24px/1 'Barlow Condensed', 'Arial Narrow', sans-serif", textTransform:"uppercase", margin:"24px 0 8px" }}>The engine</h2>
    <section style={{ ...box }}>
      <p style={{ margin:"0 0 8px", color:"var(--muted2)" }}>Surface {live.surface} · {live.hushed ? "hushed" : "open"}</p>
      <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
        {liveButtons.map(([label, fn]) => <button key={label} type="button" className="live" style={btn} onClick={fn}>{label}</button>)}
      </div>
      <ol id="live-log" style={{ margin:"8px 0 0", paddingLeft:20, fontSize:12, color:"var(--muted2)" }}>{live.log.map((line, k) => <li key={k}>{line}</li>)}</ol>
    </section>
    {results && <pre id="selftest" style={{ ...box, marginTop:20, fontSize:12, whiteSpace:"pre-wrap" }}>
      {`${results.some(r => !r.ok) ? "SELFTEST FAIL" : "SELFTEST OK"} (${results.length} renders)\n`}
      {results.map(r => `${r.ok ? "ok  " : "FAIL"} ${r.label.padEnd(38)} peak ${r.peak.toFixed(3)}  rms ${r.rms.toFixed(4)}`).join("\n")}
    </pre>}
  </main>;
}

window.__fdSound = { selftest, SEQS };
const root = import.meta.hot?.data.root || createRoot(document.getElementById("root"));
if (import.meta.hot) import.meta.hot.data.root = root;
root.render(<Preview />);
