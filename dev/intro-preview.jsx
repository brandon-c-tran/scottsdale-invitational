/* Game intro rehearsal: every game's intro on a true 390px phone and the
   real TV canvas side by side, no socket. /dev/intro-preview.html
     ?game=<event id>   which event (default putt; "custom" is a
                        commissioner-added game with no art of its own)
     &t=<ms>            start that far into the intro
     &pause=1           freeze there (stills)
     &reduced=1         reduced motion (the finished frame)
     &handoff=1         a draw follows (the TV docks the name)
   The two frames load this page with &frame=phone or &frame=tv. Replay
   gives both frames one shared start a beat ahead and sounds the room's S2
   on it, as the TV would. */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { EMPTY_STATE, ROSTER, CHIP_COLORS, BUILTIN_EVENTS, computeStandings } from "../shared/core.js";
import { TVMode } from "../src/features/tv/TVMode.jsx";
import { EventAnnouncement } from "../src/features/weekend/EventAnnouncement.jsx";
import { PlayerIdentityProvider } from "../src/features/identity/PlayerIdentityContext.js";
import { Shell } from "../src/ui/Shell.jsx";
import { INTRO_MS, introScene } from "../src/features/intro/introTiming.js";
import { playSound, setSoundSurface, unlockSound } from "../src/lib/sound.js";
import "../src/ui/shell.css";

const params = new URLSearchParams(location.search);
const frame = params.get("frame");
const CUSTOM = { id:"custom", n:99, session:"san", value:1600, name:"Cornhole", kind:"solo", game:"cornhole" };
const EVENTS = [...BUILTIN_EVENTS, CUSTOM];
const gameId = params.get("game") || "putt";
const ev = EVENTS.find(item => item.id === gameId) || EVENTS[0];
const T = Math.max(0, Number(params.get("t")) || 0);
const reduced = params.get("reduced") === "1";
const handoff = params.get("handoff") === "1";
/* the session's painting and lamp, as the phones' root carries it */
document.documentElement.setAttribute("data-phase", ev.session || "fri");

function sampleState(anchor) {
  const state = structuredClone(EMPTY_STATE);
  state.profiles = Object.fromEntries(ROSTER.map((player, index) => [player, {
    display:player, num:index + 1, color:CHIP_COLORS[index * 2 % CHIP_COLORS.length].hex }]));
  state.live = true;
  state.onDeck = ev.id;
  state.eventOps = { [ev.id]:{ announcedAt:anchor } };
  return state;
}
if (params.get("pause") === "1") {
  const style = document.createElement("style");
  /* the intro freezes; the sheet around it still rises */
  style.textContent = ".fd-intro, .fd-intro *, .fd-intro *::before, .tv-frame-lamps * { animation-play-state:paused !important; }";
  document.head.append(style);
}

/* one frame: the phone sheet or the TV canvas, replayed on a message */
function Frame() {
  const [run, setRun] = useState(() => ({ id:0, anchor:Date.now() - T }));
  useEffect(() => {
    const onMessage = event => { if (event.data?.type === "intro-play") setRun(prev => ({ id:prev.id + 1, anchor:event.data.anchor })); };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  const state = useMemo(() => sampleState(run.anchor), [run]);
  if (frame === "tv") {
    const standings = computeStandings(state);
    return <PlayerIdentityProvider profiles={state.profiles}><Shell tv environment="production">
      <TVMode key={run.id} standings={standings} state={state} events={EVENTS} onDeckEv={ev} allTied champion={null} coChamps={[]}
        showControlEnabled={false} rankDeltas={{}} connection={{ ready:true, connected:true, status:"open", version:1 }}
        ceremony={{ intro:ev.id, handoff, reveal:null, onIntroDone:() => {}, onRevealDone:() => {} }} onExit={() => {}} />
    </Shell></PlayerIdentityProvider>;
  }
  return <PlayerIdentityProvider profiles={state.profiles}><Shell environment="production">
    <EventAnnouncement key={run.id} state={state} ev={ev} handoff={handoff} live reduced={reduced} anchor={run.anchor}
      holdMs={INTRO_MS} onClose={() => {}} onBets={handoff ? null : () => {}} />
  </Shell></PlayerIdentityProvider>;
}

/* the rehearsal: picker, replay, reduced motion, a scrubber */
const LEAD_MS = 450;
function Rehearsal() {
  const [t, setT] = useState(T);
  const phone = useRef(null), tv = useRef(null);
  const query = extra => {
    const next = new URLSearchParams({ game:ev.id, ...(reduced ? { reduced:"1" } : {}), ...(handoff ? { handoff:"1" } : {}), ...extra });
    return `?${next}`;
  };
  const go = extra => { location.search = query(extra); };
  const replay = () => {
    unlockSound(); setSoundSurface("tv");
    const anchor = Date.now() + LEAD_MS;
    for (const ref of [phone, tv]) ref.current?.contentWindow?.postMessage({ type:"intro-play", anchor }, "*");
    if (!reduced) playSound("S2", { bus:"room", at:anchor, key:`preview:${anchor}`, opts:{ game:introScene(ev) } });
  };
  const paused = params.get("pause") === "1";
  const src = which => `/dev/intro-preview.html${query({ frame:which, t:String(t), ...(paused ? { pause:"1" } : {}) })}`;
  return <div className="ip">
    <style>{`
      body { background:var(--bg); color:var(--bone); }
      .ip { padding:20px 24px 40px; font:600 14px/1.4 var(--fd-body); }
      .ip-bar { display:flex; flex-wrap:wrap; align-items:center; gap:10px 16px; margin-bottom:18px; }
      .ip-bar h1 { margin:0 12px 0 0; font:900 30px/1.1 var(--fd-display); }
      .ip-bar select, .ip-bar button { min-height:44px; padding:0 14px; border-radius:8px; border:1px solid var(--ghost-line);
        background:var(--paper2); color:var(--bone); font:600 14px var(--fd-body); }
      .ip-bar button.is-primary { background:var(--sun); color:var(--ink0); border-color:transparent; }
      .ip-bar label { display:inline-flex; align-items:center; gap:8px; min-height:44px; }
      .ip-scrub { display:flex; align-items:center; gap:12px; margin-bottom:18px; }
      .ip-scrub input { width:min(640px, 70vw); accent-color:var(--lamp-info); }
      .ip-frames { display:flex; flex-wrap:wrap; gap:24px; align-items:flex-start; }
      .ip-frames figure { margin:0; }
      .ip-frames figcaption { margin-bottom:8px; color:var(--muted2); }
      .ip-phone { width:390px; height:844px; border:0; border-radius:28px; box-shadow:0 0 0 8px var(--paper2); background:var(--bg); }
      .ip-tv-box { width:960px; height:540px; overflow:hidden; border-radius:10px; box-shadow:0 0 0 8px var(--paper2); }
      .ip-tv { width:1920px; height:1080px; border:0; transform:scale(.5); transform-origin:0 0; }
    `}</style>
    <div className="ip-bar">
      <h1>Game intros</h1>
      <select aria-label="Game" value={ev.id} onChange={event => { location.search = `?game=${event.target.value}`; }}>
        {EVENTS.map(item => <option key={item.id} value={item.id}>{item.name}{item.id === "custom" ? " (no art)" : ""}</option>)}
      </select>
      <button type="button" className="is-primary" onClick={replay}>Replay with sound</button>
      <label><input type="checkbox" checked={reduced} onChange={event => go(event.target.checked ? { reduced:"1" } : { reduced:"" })} /> Reduced motion</label>
      <label><input type="checkbox" checked={handoff} onChange={event => go(event.target.checked ? { handoff:"1" } : { handoff:"" })} /> Draw follows</label>
      <button type="button" onClick={() => go({ t:String(t), pause:paused ? "" : "1" })}>{paused ? "Play from here" : "Freeze here"}</button>
    </div>
    <div className="ip-scrub">
      <input type="range" min="0" max={INTRO_MS} step="50" value={t} aria-label="Time into the intro"
        onChange={event => setT(Number(event.target.value))} onPointerUp={() => go({ t:String(t), pause:"1" })}
        onKeyUp={() => go({ t:String(t), pause:"1" })} />
      <span>{(t / 1000).toFixed(2)} s of {(INTRO_MS / 1000).toFixed(1)} s</span>
    </div>
    <div className="ip-frames">
      <figure><figcaption>Phone</figcaption><iframe ref={phone} className="ip-phone" title="Phone" src={src("phone")} /></figure>
      <figure><figcaption>TV</figcaption><div className="ip-tv-box"><iframe ref={tv} className="ip-tv" title="TV" src={src("tv")} /></div></figure>
    </div>
  </div>;
}

createRoot(document.getElementById("root")).render(frame ? <Frame /> : <Shell environment="production"><Rehearsal /></Shell>);
