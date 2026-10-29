/* Development-only: Float's Groove, heard through the real thing. A fake
   room drives the TV's own runner (float/client/sound/grooveScreen.js) on
   the real engine (src/lib/sound.js), so each song plays exactly as the TV
   plays it: the round card, then bar by bar from songAt with the host's
   calls and the band's answers; misses can flub. The grid shows the song's
   bars and beats, the host's calls (top) and the cues (bottom), and the
   playhead on the clock. The moments (the lobby's loop, the Cup opening,
   the cut's show and the chug-off after each song, Last Call's three
   countdowns, the podium) and the phone's taps and grades play from the
   buttons. No
   connection, storage or remote service. */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { chartOf, SONGS, SONG_LEAD_MS, SONG_MS } from "../float/shared/chart.js";
import { createGrooveScreenSound, loadGrooveVoice } from "../float/client/sound/grooveScreen.js";
import { floatCheerSound, floatDoneSound, floatTapSound } from "../float/client/sound/groovePhone.js";
import { songEvents } from "../float/client/sound/groove.js";
import { primeSound, playSound, setSoundRoom, setSoundSurface, unlockSound, clipIds, clipReady, subscribeSound } from "../src/lib/sound.js";

const field = Array.from({ length:13 }, (_, i) => i);
const entrants = field.map(i => ({ device:`d${i}`, bot:i > 0, drinks:true }));

/* a room in this page: it only sends what the TV's runner reads */
function makeRoom() {
  const handlers = {};
  const net = { on(type, fn) { (handlers[type] ||= new Set()).add(fn); return () => handlers[type].delete(fn); },
    onStatus() { return () => {}; }, serverNow:() => Date.now(), status:() => "open" };
  const emit = (t, msg) => (handlers[t] || []).forEach(fn => fn({ s:Date.now(), ...msg }));
  return { net, emit };
}
const base = { code:"DEV", round:0, rounds:4, field, out:[], entrants, drinking:true };

function App() {
  const room = useMemo(makeRoom, []);
  const [on, setOn] = useState(false);
  const [song, setSong] = useState(null);
  const [misses, setMisses] = useState(true);
  const [, tick] = useState(0);
  const timers = useRef([]);
  useEffect(() => {
    setSoundSurface("tv"); setSoundRoom("san");
    const runner = createGrooveScreenSound(room.net, { visible:() => true });
    room.emit("welcome", { you:{ role:"screen" } });
    room.emit("room", { ...base, phase:"lobby" });
    const off = subscribeSound(() => tick(n => n + 1));
    return () => { runner.stop(); off(); };
  }, [room]);
  useEffect(() => { let raf = 0; const loop = () => { tick(n => n + 1); raf = requestAnimationFrame(loop); }; raf = requestAnimationFrame(loop); return () => cancelAnimationFrame(raf); }, []);
  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const later = (ms, fn) => timers.current.push(setTimeout(fn, ms));
  const start = () => { primeSound(); unlockSound(); loadGrooveVoice(); setOn(true); };
  const phase = (p, extra = {}) => room.emit("room", { ...base, phase:p, startAt:Date.now(), ...extra });

  function play(id) {
    clear();
    const startAt = Date.now() + 200, songAt = startAt + SONG_LEAD_MS, chart = chartOf(id);
    setSong({ id, songAt });
    room.emit("room", { ...base, phase:"song", song:id, startAt, songAt, endsAt:songAt + SONG_MS + 1500, s:startAt });
    if (misses) for (const cue of chart.cues) {
      /* a few riders miss a cue now and then: the room judges a miss 550 ms after its time */
      const who = field.filter(i => (i * 7 + cue.id * 3) % 23 === 0);
      if (who.length) later(songAt + cue.beat * 500 + 550 - Date.now(), () => who.forEach(i => room.emit("ev", { e:"hit", i, c:cue.id, q:"miss" })));
    }
    later(songAt + SONG_MS + 1500 - Date.now(), () => cutShow(id));
  }
  const stop = () => { clear(); setSong(null); phase("lobby"); };
  /* the cut's show on the room's beats (three out below the bubble), then the chug-off for the spot */
  function cutShow(id = "paddle") {
    clear(); setSong(null);
    const songAt = Date.now() - 70000;
    room.emit("room", { ...base, phase:"song", song:id, songAt, startAt:songAt - 3000 });
    const t0 = Date.now() + 100;
    const show = { grades:t0 + 400, awards:[t0 + 2400, t0 + 3600, t0 + 4800], line:t0 + 6000,
      outs:[{ i:11, at:t0 + 6800 }, { i:12, at:t0 + 8200 }, { i:7, at:t0 + 9600 }], bubble:[5, 6] };
    room.emit("room", { ...base, phase:"cut", song:id, startAt:t0, endsAt:t0 + 15000, out:[11, 12, 7], show,
      awards:[{ id:"perfects", i:0 }, { id:"streak", i:3 }, { id:"splashes", i:9 }] });
    later(15100, () => chugoff(id));
  }
  function chugoff(id = "paddle") {
    const t0 = Date.now() + 50, goAt = t0 + 4000, c = { a:5, b:6, goAt, doneAt:{}, winner:null, by:null };
    room.emit("room", { ...base, phase:"chugoff", song:id, startAt:t0, chugoff:c });
    later(goAt + 6500 - Date.now(), () => {
      room.emit("ev", { e:"done", i:6 });
      room.emit("room", { ...base, phase:"chugoff", song:id, startAt:t0, chugoff:{ ...c, doneAt:{ 6:6500 }, winner:6, by:"chug" } });
    });
  }
  function lastCall(trick) {
    clear(); setSong(null);
    const id = `lastcall-${trick}`, chart = chartOf(id), startAt = Date.now() + 100, songAt = startAt + 3000;
    const msg = lastCall => ({ ...base, phase:"lastcall", song:id, startAt, songAt, endsAt:songAt + chart.ms + 1500, lastCall });
    room.emit("room", msg({ totals:[], worst:null }));
    later(songAt + chart.countdown.revealAt - 50 - Date.now(), () => room.emit("room", msg({ totals:field.map(i => ({ i, ms:i * 37 })), worst:[12] })));
  }

  const now = Date.now();
  const beat = song ? (now - song.songAt) / 500 : null;
  const ready = clipIds().filter(clipReady).length;
  return (
    <div style={{ font:"15px system-ui, sans-serif", color:"#e8e2d4", padding:20, maxWidth:1200 }}>
      <h1 style={{ font:"700 26px system-ui", margin:"0 0 6px" }}>Float Groove sound</h1>
      <p style={{ margin:"0 0 14px", color:"#9aa4b2" }}>The TV's own runner on the real engine. Host voice: {ready} of {clipIds().length} clips decoded.</p>
      {!on ? <button style={btn} onClick={start}>Start sound</button> : (
        <>
          <div style={row}>
            {SONGS.map(s => <button key={s.id} style={{ ...btn, ...(song?.id === s.id ? lit : {}) }} onClick={() => play(s.id)}>{s.name}</button>)}
            <button style={btn} onClick={stop}>Stop (lobby)</button>
            <label style={{ marginLeft:12 }}><input type="checkbox" checked={misses} onChange={e => setMisses(e.target.checked)} /> misses flub</label>
          </div>
          <div style={row}>
            <button style={btn} onClick={() => { clear(); setSong(null); phase("lobby"); }}>Lobby loop</button>
            <button style={btn} onClick={() => { clear(); setSong(null); phase("intro"); }}>The Cup opens</button>
            {["paddle", "rock", "spin"].map(id => <button key={id} style={btn} onClick={() => cutShow(id)}>After {id}: show + chug-off</button>)}
            <button style={btn} onClick={() => { clear(); setSong(null); phase("podium", { podium:[4, 0, 9] }); }}>Podium</button>
            {["lights", "slow", "ticks"].map(t => <button key={t} style={btn} onClick={() => lastCall(t)}>Last Call: {t}</button>)}
          </div>
          <div style={row}>
            <span style={{ color:"#9aa4b2" }}>Phone taps (switches this page to a phone):</span>
            {["perfect", "nice", "ok", "early", "late", null].map(q => <button key={String(q)} style={btn} onClick={() => { setSoundSurface("phone"); floatTapSound(q, "paddle"); setSoundSurface("tv"); }}>{q || "no cue"}</button>)}
            <button style={btn} onClick={() => { setSoundSurface("phone"); floatDoneSound(); setSoundSurface("tv"); }}>Done</button>
            {["superb", "ok", "tryagain"].map(g => <button key={g} style={btn} onClick={() => { setSoundSurface("phone"); playSound("floatYouGrade", { bus:"you", opts:{ grade:g } }); setSoundSurface("tv"); }}>{g}</button>)}
            <button style={btn} onClick={() => { setSoundSurface("phone"); floatTapSound("late", "zero"); setSoundSurface("tv"); }}>Last Call tap</button>
            <button style={btn} onClick={() => { setSoundSurface("phone"); floatCheerSound(); setSoundSurface("tv"); }}>Cheer</button>
          </div>
          {song && <Grid id={song.id} beat={beat} />}
        </>
      )}
    </div>
  );
}

const KIND = { paddle:["P", "#4fc3f7"], hey:["H", "#ffd54f"], hop:["O", "#81c784"], spin:["S", "#ce93d8"], drop:["D", "#ff8a65"] };
function Grid({ id, beat }) {
  const chart = chartOf(id), events = useMemo(() => songEvents(chart), [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const calls = events.filter(e => e.kind === "call" || e.kind === "count" || e.kind === "line");
  const W = 34, H = 22;
  return (
    <div style={{ marginTop:16 }}>
      <div style={{ color:"#9aa4b2", marginBottom:6 }}>{chart.name}: beat {beat === null ? "" : beat < 0 ? `card (${Math.ceil(-beat)})` : Math.floor(beat)}
        {beat >= 0 ? `, ${chart.sections.find(s => beat >= s.from && beat < s.to)?.kind || "done"}` : ""}</div>
      <div style={{ display:"grid", gridTemplateColumns:`repeat(8, ${W * 4 + 6}px)`, gap:6 }}>
        {Array.from({ length:chart.bars }, (_, bar) => {
          const sec = chart.sections.find(s => bar >= s.bar && bar < s.bar + s.bars)?.kind;
          return (
            <div key={bar} style={{ background:{ intro:"#252a36", practice:"#203040", play:"#23303a", drink:"#3a2a33", outro:"#2d2a40" }[sec], borderRadius:6, padding:"3px 3px 5px" }}>
              <div style={{ fontSize:11, color:"#8090a0" }}>{bar} {sec}</div>
              {[0, 1].map(rowK => (
                <div key={rowK} style={{ position:"relative", height:H, display:"flex" }}>
                  {[0, 1, 2, 3].map(b => {
                    const at = bar * 4 + b, live = beat !== null && beat >= at && beat < at + 1;
                    return <div key={b} style={{ width:W, height:H, boxSizing:"border-box", borderLeft:"1px solid #3a4250", background:live ? "#ffffff22" : "transparent" }} />;
                  })}
                  {(rowK === 0 ? calls : chart.cues.map(c => ({ beat:c.beat, kind:c.kind })))
                    .filter(e => e.beat >= bar * 4 && e.beat < bar * 4 + 4).map((e, i) => {
                      const [letter, color] = rowK === 0 ? [(e.opts?.line || "~").slice(0, 2), "#e8e2d4"] : KIND[e.kind] || ["?", "#fff"];
                      return <span key={i} style={{ position:"absolute", left:(e.beat - bar * 4) * W + 2, top:3, fontSize:11, fontWeight:700, color }}>{letter}</span>;
                    })}
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <p style={{ color:"#9aa4b2", fontSize:13 }}>Top row: the host (re ready, he hey, ba, ~ a whirl, on two three four the counts, dr Drink!). Bottom: the cues, P paddle, H hey, O hop, S spin, D drop.</p>
    </div>
  );
}
const btn = { font:"600 14px system-ui", padding:"9px 14px", borderRadius:8, border:"1px solid #3a4250", background:"#222833", color:"#e8e2d4", cursor:"pointer" };
const lit = { background:"#3b5bdb", borderColor:"#5c7cfa" };
const row = { display:"flex", gap:8, flexWrap:"wrap", alignItems:"center", marginBottom:10 };

createRoot(document.getElementById("root")).render(<App />);
