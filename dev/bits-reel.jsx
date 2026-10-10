/* The bits review reel (dev only, never deployed). Every registered bit,
   grouped by shape, played on the real BitStage over the session's
   painting, with a sample cast from the roster: real identity colors and
   skins, and the fit audit's stand-in photos (dev/fit/standins.js).
   scripts/build-bits-reel.mjs bundles it into one self-contained page.

     (no query)               the reel
     ?frame=<id>&t=<ms>       one bit frozen at an instant, full viewport
       &phase=fri|sam|sap|san|fin   &cast=<cast key>   &trigger=<n>
       &reduced=1             reduced motion's still
     ?sheet=1                 the rig and the props on the painting
   (scripts/bit-frames.mjs renders ?frame and ?sheet to PNGs.) */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ROSTER, CHIP_COLORS } from "../shared/core.js";
import { PlayerIdentityProvider, TextFloor } from "../src/features/identity/PlayerIdentityContext.js";
import { BitStage } from "../src/features/gags/BitStage.jsx";
import { BIT_SHAPES, BIT_STYLES, BITS, SHAPES, bitsOf, pickBit } from "../src/features/gags/bits/registry.js";
import { CastChip, CastPhotosProvider, GloveArt, ShoeArt } from "../src/features/gags/cast/CastChip.jsx";
import { GLOVE_POSE_NAMES } from "../src/features/gags/cast/gloveArt.js";
import { Anvil, ChipStack, DizzyStars, Dust, MuzzleFlash, Puff, Revolver, Roadrunner, SpeedLines, Sunglasses, SweatDrop,
  Tumbleweed } from "../src/features/gags/props/Props.jsx";
import { Backglass } from "../src/features/tv/DesertBand.jsx";
import { setSoundRoom, setSoundSurface, unlockSound } from "../src/lib/sound.js";
import { BIT_PARTS, makeEngine, playRecipe } from "../src/lib/soundKit.js";
import { standInPhoto, svgDataUri } from "./fit/standins.js";
import "../src/ui/experience.css";
import "../src/ui/backglass.css";
import "../src/ui/motion.css";
import "./bits-reel.css";

const params = new URLSearchParams(location.search);

/* ── the sample cast: the roster with real chip colors and skins ── */
const SKINS = ["ticks", "flame", "dots", "star", "ring", "bolt", "dash", "crown", "wave", "quad", "saw", "plain", "ticks"];
const COLOR_AT = [13, 1, 16, 9, 19, 4, 11, 21, 6, 17, 2, 24, 14];
const NAMES = { Henry:"Henry Nguyen" };
const PROFILES = Object.fromEntries(ROSTER.map((player, i) => [player, {
  display:NAMES[player] || player, color:CHIP_COLORS[COLOR_AT[i] % CHIP_COLORS.length].hex, skin:SKINS[i % SKINS.length], photoV:1,
}]));
const PHOTOS = Object.fromEntries(ROSTER.map(player => [player, svgDataUri(standInPhoto(player))]));
const STATE = { profiles:PROFILES };

/* who plays each shape, by cast size */
const CASTS = {
  versus:[
    { key:"1v1", label:"1 v 1", cast:{ a:["Khoa"], b:["Sahil"] } },
    { key:"2v2", label:"2 v 2", cast:{ a:["Adi", "Chiang"], b:["Richard", "Allan"] } },
    { key:"4v6", label:"4 v 6", cast:{ a:["Brandon", "Evan", "Eyob", "Ben"], b:["Henry", "Jeremy", "Chinh", "Khoa", "Sahil", "Adi"] } },
  ],
  win:[
    { key:"1", label:"Solo", cast:{ a:["Eyob"] } },
    { key:"2", label:"Pair", cast:{ a:["Adi", "Chiang"] } },
  ],
  loss:[
    { key:"1", label:"Evan", cast:{ a:["Evan"] } },
    { key:"long", label:"Long name", cast:{ a:["Henry"] } },
  ],
  idle:[{ key:"room", label:"The room", cast:{ a:["Brandon", "Evan", "Eyob"] } }],
};
/* what a moment letters under the name, by trigger */
const FACTS = { "A big losing bet":"-1,000", "A new last place":"13th" };
const PHASES = [["fri", "Friday"], ["sam", "Sat morning"], ["sap", "Sat afternoon"], ["san", "Sat night"], ["fin", "Finale"]];
const castFor = (bit, key) => (CASTS[bit.shape] || CASTS.loss).find(item => item.key === key) || (CASTS[bit.shape] || CASTS.loss)[0];
const secs = ms => (Math.round(ms / 10) / 100).toFixed(2);

/* sound: the reel is a TV, so the room bus; the iPhone's playback
   session (through the silent switch) is set while it unlocks as a phone */
function unlockAudio() {
  try { setSoundSurface("phone"); unlockSound(); setSoundSurface("tv"); } catch {}
}

/* ── one bit on its card ── */
function BitCard({ bit, phase, reduced, request, onPlayed }) {
  const [castKey, setCastKey] = useState(castFor(bit).key);
  const [trigger, setTrigger] = useState(bit.fits[0]);
  const [slow, setSlow] = useState(false);
  const [view, setView] = useState({ mode:"poster", run:0, t:bit.still });
  const timer = useRef(null);
  const card = useRef(null);
  const sample = castFor(bit, castKey);
  const fact = FACTS[trigger] || null;
  const play = (rate = slow ? 0.25 : 1) => {
    unlockAudio();
    clearTimeout(timer.current);
    setView(prev => ({ mode:"play", run:prev.run + 1, t:0, rate }));
    timer.current = setTimeout(() => setView(prev => ({ ...prev, mode:"done" })), (reduced ? 1600 : bit.ms / rate) + 250);
    onPlayed?.(bit.id);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  /* "Random" asked for this card */
  useEffect(() => {
    if (!request) return;
    card.current?.scrollIntoView({ behavior:"smooth", block:"center" });
    play(1);
  }, [request]); // eslint-disable-line react-hooks/exhaustive-deps
  const freeze = t => { clearTimeout(timer.current); setView(prev => ({ mode:"frozen", run:prev.run + 1, t })); };
  const playing = view.mode === "play";
  const stage = playing
    ? { at:0, rate:view.rate, sound:true, runKey:`${bit.id}:${view.run}` }
    : { at:view.mode === "frozen" ? view.t : bit.still, frozen:true, runKey:`${bit.id}:still:${view.t}:${view.run}` };
  const instants = [["Start", 0], ...Object.entries(bit.beats).map(([name, ms]) => [name, ms]), ["Still", bit.still], ["End", bit.ms]]
    .sort((x, y) => x[1] - y[1]);
  return (
    <article ref={card} className="br-card" aria-labelledby={`br-${bit.id}`}>
      <div className="br-stage">
        <BitStage key={`${stage.runKey}:${castKey}:${trigger}:${phase}:${reduced}`} bit={bit} cast={sample.cast} state={STATE} phase={phase}
          photos={PHOTOS} fact={fact} reduced={reduced} {...stage} />
        {!playing && <button type="button" className="br-play" onClick={() => play()} aria-label={`Play ${bit.name}`}>
          <span className="br-badge">
            <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z" fill="currentColor" /></svg>
            {view.mode === "poster" ? "Play" : "Replay"}
          </span>
        </button>}
      </div>
      <div className="br-meta">
        <h3 id={`br-${bit.id}`} className="br-name">{bit.name}</h3>
        <p className="br-line"><span>{BIT_STYLES[bit.style]}</span><span>{`${secs(bit.ms)} s`}</span></p>
      </div>
      <div className="br-controls">
        <div className="br-seg" role="group" aria-label="Trigger">
          {bit.fits.map(item => <button key={item} type="button" aria-pressed={trigger === item} onClick={() => setTrigger(item)}>{item}</button>)}
        </div>
        <div className="br-seg" role="group" aria-label="Cast">
          {(CASTS[bit.shape] || []).map(item => <button key={item.key} type="button" aria-pressed={castKey === item.key}
            onClick={() => setCastKey(item.key)}>{item.label}</button>)}
        </div>
        <div className="br-seg" role="group" aria-label="Speed">
          <button type="button" aria-pressed={!slow} onClick={() => setSlow(false)}>1x</button>
          <button type="button" aria-pressed={slow} onClick={() => { setSlow(true); play(0.25); }}>0.25x</button>
        </div>
      </div>
      <div className="br-instants" role="group" aria-label="Jump to an instant">
        {instants.map(([name, ms]) => <button key={`${name}:${ms}`} type="button" className={view.mode === "frozen" && view.t === ms ? "is-on" : ""}
          onClick={() => freeze(ms)}><span>{name}</span><b>{secs(ms)}</b></button>)}
      </div>
      <label className="br-scrub">
        <span className="br-sr">Scrub</span>
        <input type="range" min="0" max={bit.ms} step="20" value={view.mode === "frozen" ? view.t : playing ? 0 : bit.still}
          onChange={event => freeze(Number(event.target.value))} />
        <output>{`${secs(view.mode === "frozen" ? view.t : bit.still)} s`}</output>
      </label>
    </article>
  );
}

function Reel() {
  const [phase, setPhase] = useState("sap");
  const [reduced, setReduced] = useState(() => !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  const [recent, setRecent] = useState({});
  const [request, setRequest] = useState({});
  useEffect(() => { setSoundRoom(phase); }, [phase]);
  useEffect(() => {
    const first = () => unlockAudio();
    window.addEventListener("pointerdown", first, { once:true, capture:true });
    return () => window.removeEventListener("pointerdown", first, { capture:true });
  }, []);
  const played = (shape, id) => setRecent(prev => ({ ...prev, [shape]:[...(prev[shape] || []).filter(x => x !== id), id].slice(-8) }));
  const random = shape => {
    unlockAudio();
    const bit = pickBit(shape, `${Date.now()}`, recent[shape] || []);
    if (bit) setRequest(prev => ({ ...prev, [bit.id]:(prev[bit.id] || 0) + 1 }));
  };
  const shapes = SHAPES.filter(shape => bitsOf(shape).length);
  return (
    <main className="br">
      <header className="br-head">
        <h1 className="br-title">Bits</h1>
        <div className="br-global">
          <label className="br-select"><span>Painting</span>
            <select value={phase} onChange={event => setPhase(event.target.value)}>
              {PHASES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          <div className="br-seg" role="group" aria-label="Motion">
            <button type="button" aria-pressed={!reduced} onClick={() => setReduced(false)}>Full motion</button>
            <button type="button" aria-pressed={reduced} onClick={() => setReduced(true)}>Reduced</button>
          </div>
        </div>
      </header>
      {shapes.map(shape => (
        <section key={shape} className="br-shape" aria-labelledby={`br-shape-${shape}`}>
          <div className="br-shape-head">
            <h2 id={`br-shape-${shape}`}>{BIT_SHAPES[shape].name}</h2>
            <button type="button" className="br-random" onClick={() => random(shape)}>Random</button>
          </div>
          <div className="br-cards">
            {bitsOf(shape).map(bit => <BitCard key={bit.id} bit={bit} phase={phase} reduced={reduced} request={request[bit.id] || 0}
              onPlayed={id => played(shape, id)} />)}
          </div>
        </section>
      ))}
    </main>
  );
}

/* ── ?contact=<id>&ts=0,500,...: many instants as one sheet, each frame
   lettered with its time (scripts/bit-frames.mjs --contact) ── */
function ContactView() {
  const bit = BITS.find(item => item.id === params.get("contact")) || BITS[0];
  const ts = (params.get("ts") || "").split(",").map(Number).filter(Number.isFinite).slice(0, 16);
  const sample = castFor(bit, params.get("cast"));
  const trigger = bit.fits[Number(params.get("trigger")) || 0] || bit.fits[0];
  const cols = ts.length > 9 ? 4 : ts.length > 4 ? 3 : 2;
  useMarkReady();
  return (
    <div className="br-frame br-contact" style={{ gridTemplateColumns:`repeat(${cols}, 1fr)` }}>
      {ts.map(t => <div key={t} className="br-contact-cell">
        <BitStage bit={bit} cast={sample.cast} state={STATE} phase={params.get("phase") || "sap"} photos={PHOTOS}
          fact={FACTS[trigger] || null} at={t} frozen runKey={`c${t}`} />
        <span className="br-contact-t">{`${secs(t)} s`}</span>
      </div>)}
    </div>
  );
}

/* ── one frame, full viewport (scripts/bit-frames.mjs) ── */
function FrameView() {
  const bit = BITS.find(item => item.id === params.get("frame")) || BITS[0];
  const t = Math.max(0, Number(params.get("t")) || 0);
  const sample = castFor(bit, params.get("cast"));
  const trigger = bit.fits[Number(params.get("trigger")) || 0] || bit.fits[0];
  const reduced = params.get("reduced") === "1";
  useMarkReady();
  return <div className="br-frame"><BitStage bit={bit} cast={sample.cast} state={STATE} phase={params.get("phase") || "sap"}
    photos={PHOTOS} fact={FACTS[trigger] || null} at={t} frozen reduced={reduced} runKey="frame" /></div>;
}
function useMarkReady() {
  useEffect(() => {
    let done = false;
    const ready = () => { if (!done) { done = true; document.body.dataset.ready = "1"; } };
    const fonts = document.fonts?.ready || Promise.resolve();
    fonts.then(() => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(ready, 250))));
    const fallback = setTimeout(ready, 4000);
    return () => clearTimeout(fallback);
  }, []);
}

/* ── the rig sheet: every glove pose, the shoes, the cast, every prop ── */
function SheetView() {
  useMarkReady();
  const phase = params.get("phase") || "sap";
  return (
    <div className="br-frame">
      <div className="bit-stage">
        <TextFloor px={24}>
          <div className="tv-stage fd-night">
            <div className="tv-canvas bit-canvas" data-tv-canvas data-phase={phase} style={{ left:0, top:0 }}>
              <Backglass phase={phase} className="tv-backdrop" />
              <CastPhotosProvider photos={PHOTOS}>
                {params.get("sheet") === "gloves" && <div className="bit-layer bit-art br-sheet" style={{ "--tl":"0ms", animation:"none" }}>
                  {GLOVE_POSE_NAMES.map((pose, i) => <span key={pose} className="br-at" style={{ left:200 + (i % 4) * 460, top:i < 4 ? 330 : 800 }}>
                    <span className="br-at"><GloveArt pose={pose} scale={2.4} /></span>
                    <span className="br-tag" style={{ left:-150, top:170 }}>{pose}</span>
                  </span>)}
                </div>}
                {params.get("sheet") !== "gloves" && <div className="bit-layer bit-art br-sheet" style={{ "--tl":"0ms", "--bit-ms":"1ms", animation:"none" }}>
                  {GLOVE_POSE_NAMES.map((pose, i) => <span key={pose} className="br-at" style={{ left:110 + i * 220, top:190 }}>
                    <span className="br-at" style={{ left:-40, top:0 }}><GloveArt pose={pose} /></span>
                    <span className="br-at" style={{ left:40, top:0, transform:"scaleX(-1)" }}><GloveArt pose={pose} scale={0.75} /></span>
                    <span className="br-tag" style={{ left:-60, top:96 }}>{pose}</span>
                  </span>)}
                  <span className="br-at" style={{ left:1810, top:200 }}><ShoeArt /></span>
                  <span className="br-at" style={{ left:110, top:420 }}><Revolver /></span>
                  <span className="br-at" style={{ left:260, top:420 }}><Revolver pivot="guard" scale={1.6} /></span>
                  <span className="br-at" style={{ left:440, top:400 }}><MuzzleFlash /></span>
                  <span className="br-at" style={{ left:600, top:450 }}><Puff /></span>
                  <span className="br-at" style={{ left:720, top:420 }}><Tumbleweed /></span>
                  <span className="br-at" style={{ left:900, top:470 }}><SweatDrop /></span>
                  <span className="br-at" style={{ left:1040, top:420 }}><Sunglasses /></span>
                  <span className="br-at" style={{ left:1220, top:400 }}><DizzyStars at={0} /></span>
                  <span className="br-at" style={{ left:1560, top:500 }}><Anvil /></span>
                  <span className="br-at" style={{ left:180, top:930 }}><ChipStack player="Evan" /></span>
                  <CastChip player="Khoa" x={480} y={930} facing={1} hands={{ front:"ready", back:"ready" }} />
                  <CastChip player="Sahil" x={820} y={930} facing={-1} hands={{ front:"grip", back:"rest" }}
                    hold={{ front:<Revolver /> }} />
                  <CastChip player="Henry" x={1120} y={930} hands={{ l:"open", r:"point" }} />
                  <span className="br-at" style={{ left:1560, top:930 }}><Roadrunner /></span>
                  <span className="br-at" style={{ left:1500, top:700 }}><SpeedLines length={300} /></span>
                </div>}
              </CastPhotosProvider>
            </div>
          </div>
        </TextFloor>
      </div>
    </div>
  );
}

/* ── ?soundcheck: every bit recipe, and every bit's whole cue sheet on its
   own schedule, rendered offline: not silent, not clipped ── */
async function soundcheck() {
  const render = async (seconds, fn) => {
    const sr = 44100, oc = new OfflineAudioContext(2, Math.ceil(sr * seconds), sr);
    const E = makeEngine(oc, { room:"sap", listen:"tv" });
    fn(E, 0.05);
    const buf = await oc.startRendering();
    let peak = 0, sum = 0;
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; sum += d[i] * d[i]; }
    }
    return { peak:Math.round(peak * 1000) / 1000, rms:Math.round(Math.sqrt(sum / (buf.length * 2)) * 1000) / 1000 };
  };
  const rows = [];
  for (const part of BIT_PARTS) rows.push({ label:part.id, ...await render(part.ms / 1000 + 1.5, (E, t) => playRecipe(E, part.id, t)) });
  for (const bit of BITS) rows.push({ label:`${bit.id} (all cues)`, ...await render(bit.ms / 1000 + 1.5,
    (E, t) => bit.cues.forEach(cue => playRecipe(E, cue.sound, t + cue.at / 1000, { pan:cue.pan || 0, ...(cue.opts || {}) }))) });
  rows.forEach(row => { row.ok = row.peak > 0.02 && row.peak <= 1; });
  window.__soundcheck = rows;
  document.body.dataset.ready = "1";
}
function SoundcheckView() {
  useEffect(() => { soundcheck(); }, []);
  return null;
}

function App() {
  const view = params.has("soundcheck") ? <SoundcheckView /> : params.has("contact") ? <ContactView /> : params.has("frame") ? <FrameView />
    : params.has("sheet") ? <SheetView /> : <Reel />;
  return <PlayerIdentityProvider profiles={PROFILES}>{view}</PlayerIdentityProvider>;
}
window.__bits = { BITS, PROFILES };
createRoot(document.getElementById("root")).render(<App />);
