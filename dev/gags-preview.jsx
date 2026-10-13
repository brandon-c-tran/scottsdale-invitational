/* Gags rehearsal (local only, never deployed): the real TV over weekends
   the real reducers played (dev/fit/scenarios.js gagWeekend), the write
   that owes each moment landed live in memory. No socket, no Worker.

   Play lands the write now as a fresh frame, so the TV runs the room's own
   sequence: the decided contest or the result's podium, the moment's bit
   on its slot with its sounds on the room bus, then whatever follows (the
   next face-off waits for it). With a win song, the speaker's write lands
   SONG_LAG_MS later as the Worker's does: the walkout first, then the bit.
   The tap that plays is the one sound needs.

     /dev/gags-preview.html
       ?trigger=upset|streak|leader|bigloss|last   which moment (default upset)
       &song=1      the winner's win song walks out first
       &test=1      the QA console's test of its shape (qaGag { shape })
       &bit=<id>    the QA console's test of that bit (qaGag { bit })
       &off=1       Gags off on the TV sheet (a test still plays)
       &t=<ms>      the bit already that far in on load (a TV joining late, silent)
       &in=<ms>     the write already landed, its bit starting that long after load (a live run from the top)
       &pause=1     frozen there (stills)
       &reduced=1   reduced motion: the still for the window and its one sound
       &bare=1      no controls */
import React, { useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { allEventsOf, computeStandings } from "../shared/core.js";
import { GAG_SHAPES } from "../shared/gags.js";
import { GAG_TRIGGERS, TRIGGER_SHAPE, gagPlan, gagWrites, winnersOf } from "../src/features/gags/gagModel.js";
import { bitById, bitsOf } from "../src/features/gags/bits/registry.js";
import { TVMode } from "../src/features/tv/TVMode.jsx";
import { PlayerIdentityProvider } from "../src/features/identity/PlayerIdentityContext.js";
import { Shell } from "../src/ui/Shell.jsx";
import { publishFrame } from "../src/lib/frameGate.js";
import { setSoundSurface, unlockSound, useSoundSystem } from "../src/lib/sound.js";
import { act, aged, dress, gagWeekend } from "./fit/scenarios.js";
import "../src/ui/shell.css";

const params = new URLSearchParams(location.search);
const KIND = GAG_TRIGGERS.includes(params.get("trigger")) ? params.get("trigger") : "upset";
const BIT = bitById(params.get("bit"))?.shape && GAG_SHAPES.includes(bitById(params.get("bit")).shape) ? params.get("bit") : null;
const TEST = params.get("test") === "1" || !!BIT;
const SONG = params.get("song") === "1" && !TEST;
const OFF = params.get("off") === "1";
const REDUCED = params.get("reduced") === "1";
const T = params.has("t") ? Math.max(0, Number(params.get("t")) || 0) : params.has("in") ? -Math.max(0, Number(params.get("in")) || 0) : null;
const PAUSED = params.get("pause") === "1";
const BARE = params.get("bare") === "1";
const LABEL = Object.freeze({ upset:"Upset", streak:"Streak", leader:"New leader", bigloss:"Big losing bet", last:"New last place" });
/* how long the board sits before the write lands, after Play */
const LAND_MS = 900;
/* how long after the write the speaker answers and its walkout lands */
const SONG_LAG_MS = 1200;
const WIN_CLIP_MS = 30000;

/* ?pause: the CSS held where it stands (Play lets it go) */
let pauseStyle = null;
if (PAUSED) {
  pauseStyle = document.createElement("style");
  pauseStyle.textContent = "*, *::before, *::after { animation-play-state:paused !important; }";
  document.head.append(pauseStyle);
}
/* ?reduced=1: every reduced-motion block holds as if the device asked
   (the HTML already answers the JS query) */
function promoteReducedMotion() {
  const rules = [];
  for (const sheet of document.styleSheets) {
    let list = [];
    try { list = sheet.cssRules; } catch { continue; }
    for (const rule of list) {
      if (rule instanceof CSSMediaRule && /prefers-reduced-motion:\s*reduce/.test(rule.conditionText || rule.media?.mediaText || ""))
        for (const inner of rule.cssRules) rules.push(inner.cssText);
    }
  }
  let style = document.getElementById("gp-reduced");
  if (!style) { style = document.createElement("style"); style.id = "gp-reduced"; }
  style.textContent = rules.join("\n");
  document.head.append(style);
}

/* what a socket delivers: plain JSON (in memory the reducers share some
   objects, which a clock shift would move twice) */
const asFrame = state => JSON.parse(JSON.stringify(state));
/* the kind's weekend, settled (the room has sat in it a while), Gags as
   asked: the state just before the write, and the write */
function weekend(kind) {
  const parts = gagWeekend(kind, { test:TEST, shape:TRIGGER_SHAPE[kind], bit:BIT });
  if (OFF) act(parts.state, "setGags", { on:false });
  return { ...parts, state:dress(aged(asFrame(parts.state))) };
}
const landed = (parts, state) => asFrame(parts.write(structuredClone(state)));
const owedBy = state => gagPlan(state, allEventsOf(state))[0] || null;
/* the speaker's write (the Worker's stampWalkout): the newest write's
   winner's song, started `at` (default SONG_LAG_MS after that write) */
function sung(state, at = null) {
  const write = gagWrites(state, allEventsOf(state)).at(-1);
  const player = write ? winnersOf(state, write)[0] : null;
  if (!player) return state;
  const start = at ?? write.at + SONG_LAG_MS;
  const next = structuredClone(state);
  next.showControl = { ...(next.showControl || {}), audio:{ ...(next.showControl?.audio || {}),
    walkout:{ player, trackId:null, startedAt:start, until:start + WIN_CLIP_MS, auto:true } } };
  return next;
}
/* every server stamp moved so the owed gag started `t` ms ago */
function joined(state, t) {
  const gag = owedBy(state);
  return gag ? aged(state, gag.start - (Date.now() - t)) : state;
}
const describe = gag => !gag ? (OFF ? "Gags off: nothing owed" : "Nothing owed")
  : [gag.test ? "QA test" : LABEL[gag.trigger], bitById(gag.bit)?.name, gag.name, gag.fact,
    `${((gag.start - gag.at) / 1000).toFixed(1)} s after the write`, `${(gag.ms / 1000).toFixed(1)} s long`].filter(Boolean).join(" · ");

function Tv({ state, now }) {
  const events = useMemo(() => allEventsOf(state), [state]);
  const standings = useMemo(() => computeStandings(state), [state]);
  const onDeckEv = state.onDeck && !state.frozen ? events.find(ev => ev.id === state.onDeck && !state.results?.[ev.id]) || null : null;
  const allTied = standings.length > 0 && standings[0].pts === standings[standings.length - 1].pts && !state.frozen;
  return <TVMode standings={standings} state={state} events={events} onDeckEv={onDeckEv} allTied={allTied}
    champion={null} coChamps={[]} showControlEnabled={false} rankDeltas={{}}
    connection={{ ready:true, connected:true, status:"open", version:1 }} EventSpotlight={() => null}
    ceremony={null} onExit={() => {}} now={now} />;
}

function Rehearsal() {
  const [run, setRun] = useState(() => {
    const parts = weekend(KIND);
    const landedNow = landed(parts, parts.state);
    const after = SONG ? sung(landedNow) : landedNow;
    const owed = owedBy(after);
    /* ?t: a TV that joins the gag that far in (a first snapshot, silent);
       with ?pause its clock holds there too */
    const state = T === null ? parts.state : joined(after, T);
    return { id:0, kind:KIND, parts, state, owed, landing:false, song:false, now:PAUSED && T !== null ? Date.now() : undefined };
  });
  const [t, setT] = useState(T ?? 0);
  useSoundSystem({ state:run.state, tv:true });
  useEffect(() => { if (REDUCED) promoteReducedMotion(); }, []);
  /* Play: the kind's weekend on a fresh TV (the hooks' first snapshot),
     then the write lands as a fresh frame */
  const play = kind => {
    unlockSound(); setSoundSurface("tv");
    pauseStyle?.remove(); pauseStyle = null;
    const parts = weekend(kind);
    publishFrame({ fresh:false, reason:"quiet" });
    setRun(prev => ({ id:prev.id + 1, kind, parts, state:parts.state, owed:null, landing:true, song:false, now:undefined }));
  };
  useEffect(() => {
    if (!run.landing) return undefined;
    /* one render sees the new state and its fresh frame together, as the
       transport delivers them */
    const timer = setTimeout(() => {
      const after = landed(run.parts, run.state);
      flushSync(() => {
        setRun(prev => prev.id === run.id ? { ...prev, state:after, owed:owedBy(SONG ? sung(after) : after), landing:false,
          song:SONG } : prev);
        publishFrame({ version:run.id, fresh:true, lastAction:run.parts.action });
      });
    }, LAND_MS);
    return () => clearTimeout(timer);
  }, [run.id, run.landing]); // eslint-disable-line react-hooks/exhaustive-deps
  /* ?song: the speaker answers, and its write lands as the Worker's does */
  useEffect(() => {
    if (!run.song) return undefined;
    const timer = setTimeout(() => flushSync(() => {
      setRun(prev => prev.id === run.id ? { ...prev, state:sung(prev.state, Date.now()), song:false } : prev);
      publishFrame({ version:run.id, fresh:true, lastAction:"walkoutStart" });
    }), SONG_LAG_MS);
    return () => clearTimeout(timer);
  }, [run.id, run.song]); // eslint-disable-line react-hooks/exhaustive-deps
  const go = extra => {
    const next = new URLSearchParams({ trigger:run.kind, ...(SONG ? { song:"1" } : {}), ...(TEST && !BIT ? { test:"1" } : {}),
      ...(BIT ? { bit:BIT } : {}),
      ...(OFF ? { off:"1" } : {}), ...(REDUCED ? { reduced:"1" } : {}), ...extra });
    for (const [key, value] of [...next]) if (value === "") next.delete(key);
    location.search = `?${next}`;
  };
  const ms = run.owed?.ms || bitById(BIT)?.ms || 5500;
  /* for the console: the state the TV is drawing */
  window.__gagState = run.state;
  return <PlayerIdentityProvider profiles={run.state.profiles}>
    <Shell tv environment="isolated preview">
      <Tv key={run.id} state={run.state} now={run.now} />
      {!BARE && <div className="gp" role="region" aria-label="Gags rehearsal">
        <style>{`
          .gp { position:fixed; left:16px; top:16px; z-index:200; display:flex; flex-direction:column; gap:10px; max-width:min(560px, calc(100vw - 32px));
            padding:14px 16px; border-radius:14px; background:color-mix(in srgb, var(--paper) 92%, transparent); color:var(--bone);
            box-shadow:var(--shadow-2); font:600 14px/1.4 var(--fd-body); }
          .gp h1 { margin:0; font:900 26px/1 var(--fd-display); letter-spacing:.02em; }
          .gp-row { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
          .gp button { min-height:44px; padding:0 14px; border-radius:10px; border:1px solid var(--ghost-line); background:var(--paper2);
            color:var(--bone); font:700 14px var(--fd-body); cursor:pointer; }
          .gp button[aria-pressed="true"] { background:var(--sun); color:var(--ink0); border-color:transparent; }
          .gp label { display:inline-flex; align-items:center; gap:6px; min-height:44px; padding-right:6px; }
          .gp input[type=range] { flex:1; min-width:160px; accent-color:var(--lamp-info); }
          .gp-owed { color:var(--muted); }
        `}</style>
        <h1>Gags</h1>
        <div className="gp-row">
          {GAG_TRIGGERS.map(kind => <button key={kind} type="button" aria-pressed={!BIT && run.kind === kind} onClick={() => play(kind)}>
            {LABEL[kind]}</button>)}
        </div>
        <div className="gp-row">
          <label>QA test of
            <select value={BIT || ""} onChange={event => go({ bit:event.target.value, test:"" })}>
              <option value="">a shape (Random)</option>
              {GAG_SHAPES.flatMap(shape => bitsOf(shape)).map(bit => <option key={bit.id} value={bit.id}>{bit.name}</option>)}
            </select></label>
        </div>
        <div className="gp-row">
          <label><input type="checkbox" checked={SONG} disabled={TEST} onChange={event => go({ song:event.target.checked ? "1" : "" })} /> Win song</label>
          <label><input type="checkbox" checked={TEST} onChange={event => go({ test:event.target.checked ? "1" : "", bit:"" })} /> QA test</label>
          <label><input type="checkbox" checked={OFF} onChange={event => go({ off:event.target.checked ? "1" : "" })} /> Gags off</label>
          <label><input type="checkbox" checked={REDUCED} onChange={event => go({ reduced:event.target.checked ? "1" : "" })} /> Reduced motion</label>
        </div>
        <div className="gp-row">
          <input type="range" min="0" max={ms} step="50" value={Math.min(t, ms)} aria-label="Time into the gag"
            onChange={event => setT(Number(event.target.value))} />
          <span>{(Math.min(t, ms) / 1000).toFixed(2)} s</span>
          <button type="button" onClick={() => go({ t:String(Math.min(t, ms)), pause:"1" })}>Freeze here</button>
          <button type="button" onClick={() => go({ t:String(Math.min(t, ms)) })}>Play from here</button>
        </div>
        <p className="gp-owed" aria-live="polite" style={{ margin:0 }}>{run.landing ? "Landing the write" : describe(run.owed)}</p>
      </div>}
    </Shell>
  </PlayerIdentityProvider>;
}

createRoot(document.getElementById("root")).render(<Rehearsal />);
