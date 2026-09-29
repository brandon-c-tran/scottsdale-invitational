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
import { KIT, PARTS, SOUNDS, ROOMS, makeEngine, playRecipe, setListen, setRoom, limitChips } from "../src/lib/soundKit.js";
import { advanceCues, crownCues, revealPans } from "../src/features/tv/roomSound.js";
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
    for (const s of [...KIT, ...PARTS])
      rows.push(await measure(`${s.id} ${s.name}`, Math.max(1.5, s.ms / 1000 + 1.5), (E, t) => playRecipe(E, s.id, t)));
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
