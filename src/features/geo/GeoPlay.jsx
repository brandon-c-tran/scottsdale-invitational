import React, { useEffect, useRef, useState } from "react";
import { dispatch } from "../../lib/client.js";
import { serverNow } from "../../lib/serverClock.js";
import { tapTick } from "../../lib/haptics.js";
import { useReducedMotion } from "../../lib/motion.js";
import { GEO_ROUND_MS } from "../../../shared/geo.js";
import { usePlayerIdentity } from "../identity/PlayerIdentityContext.js";
import { GeoMap, preloadGeoMap } from "./GeoMap.jsx";
import { WhenPicker, formatWhen, parseWhen } from "./WhenPicker.jsx";
import { geoPhotoSrc, geoView, milesLabel, offLabel, whenLabel } from "./geoModel.js";
import "./geo.css";

const sendGuess = payload => dispatch("geoGuess", payload, { retry:true });
const fmt = n => Math.round(n ?? 0).toLocaleString("en-US");
const ordinal = n => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"}`;

function useTicking(active, ms = 250) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => setTick(n => n + 1), ms);
    return () => clearInterval(timer);
  }, [active, ms]);
}

/* a number that runs up to its value once, after a delay */
function useCountTo(target, { delay = 0, ms = 900, run = true } = {}) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(run && !reduced ? 0 : target);
  useEffect(() => {
    if (!run || reduced) { setShown(target); return undefined; }
    let raf = 0;
    const timer = setTimeout(() => {
      const began = performance.now();
      const step = () => {
        const k = Math.min(1, (performance.now() - began) / ms);
        setShown(target * (1 - (1 - k) ** 3));
        if (k < 1) raf = requestAnimationFrame(step);
      };
      step();
    }, delay);
    return () => { clearTimeout(timer); cancelAnimationFrame(raf); };
  }, [target, delay, ms, run, reduced]);
  return shown;
}

/* the clock: a ring that runs out with the photo's minute */
function Clock({ closesAt, now }) {
  const left = Math.max(0, closesAt - now);
  const k = Math.max(0, Math.min(1, left / GEO_ROUND_MS));
  const seconds = Math.ceil(left / 1000);
  const r = 17, c = 2 * Math.PI * r;
  return <span className={`fd-geo-clock${seconds <= 10 ? " is-low" : ""}`} role="timer" aria-label={`${seconds} seconds left`}>
    <svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r={r} className="track" />
      <circle cx="20" cy="20" r={r} className="run" style={{ strokeDasharray:c, strokeDashoffset:c * (1 - k) }} /></svg>
    <b>{seconds}</b>
  </span>;
}

/* the guess: the photo, where, when, then Lock in */
function GuessGame({ view, onGuess, now }) {
  const mine = view.mine;
  const [step, setStep] = useState(mine ? "map" : "photo");
  const [pin, setPin] = useState(mine ? { lat:mine.lat, lng:mine.lng } : null);
  const [wall, setWall] = useState(() => parseWhen(mine?.when));
  const [whenSet, setWhenSet] = useState(!!mine);
  const [fill, setFill] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [stamped, setStamped] = useState(0);
  const busy = useRef(false);
  const when = formatWhen(wall);
  const same = !!mine && !!pin && mine.lat === Math.round(pin.lat * 1e5) / 1e5 && mine.lng === Math.round(pin.lng * 1e5) / 1e5
    && mine.when === when;
  const lockIn = async () => {
    if (busy.current || !pin || same) return;
    tapTick();
    busy.current = true; setPending(true); setError("");
    try {
      const result = await onGuess({ roundId:view.roundId, lat:pin.lat, lng:pin.lng, when });
      if (result?.ok !== true) setError(result?.error || "Not saved. Try again.");
      else setStamped(n => n + 1);
    } catch { setError("Not saved. Try again."); }
    finally { busy.current = false; setPending(false); }
  };
  const go = next => { tapTick(); setStep(next); };
  /* the server takes a guess for a few seconds past the clock (GEO_GRACE_MS) */
  const over = now > view.closesAt + 3000;
  const primary = over ? (mine ? { label:"Locked in", run:null, done:true } : { label:"Time's up", run:null })
    : step === "photo" ? { label:"Guess where", run:() => go("map") }
    : step === "map" ? (pin ? { label:"Next: when", run:() => go("when") } : { label:"Tap the map to drop your pin", run:null })
      : !pin ? { label:"Drop your pin first", run:() => go("map") }
        : same ? { label:"Locked in", run:null, done:true }
          : { label:pending ? "Locking in…" : mine ? "Update guess" : "Lock in", run:lockIn, lock:true };
  return <>
    <main className={`fd-geo-game-body is-${step}`}>
      {step === "photo" && <button type="button" className={`fd-geo-game-photo${fill ? " is-fill" : ""}`}
        onClick={() => setFill(value => !value)} aria-label={fill ? "Fit the photo" : "Fill the screen with the photo"}>
        <img src={geoPhotoSrc(view.round)} alt={`Photo ${view.n}`} /></button>}
      {step === "map" && <div className="fd-geo-game-map">
        <GeoMap mode="pick" pin={pin} onPick={point => { setPin(point); }} onTap={tapTick} className="fd-geo-full"
          label="Drop your pin where this was taken" />
        <button type="button" className="fd-geo-peek" onClick={() => go("photo")} aria-label="Back to the photo">
          <img src={geoPhotoSrc(view.round)} alt="" /></button>
        <span className="fd-geo-tip">{pin ? "Drag the pin, or tap to move it" : "Tap where it was taken"}</span>
      </div>}
      {step === "when" && <div className="fd-geo-game-when">
        <button type="button" className="fd-geo-peek is-inline" onClick={() => go("photo")} aria-label="Back to the photo">
          <img src={geoPhotoSrc(view.round)} alt="" /></button>
        <WhenPicker value={wall} set={whenSet}
          onChange={(next, turned) => { setWall(next); if (turned) setWhenSet(true); }} />
      </div>}
    </main>
    <footer className="fd-geo-game-foot">
      <nav className="fd-geo-steps" aria-label="Steps">
        {[["photo", "Photo", true], ["map", "Where", !!pin], ["when", "When", whenSet]].map(([id, name, done]) =>
          <button type="button" key={id} aria-pressed={step === id} className={done && id !== "photo" ? "is-done" : ""}
            onClick={() => go(id)}>{done && id !== "photo" && <i aria-hidden="true">✓</i>}{name}</button>)}
      </nav>
      {error && <p className="fd-geo-error" role="alert">{error}</p>}
      <button type="button" key={`${primary.done ? "done" : "go"}:${stamped}`} disabled={!primary.run || pending}
        className={`fd-geo-primary${primary.lock ? " is-lock" : ""}${primary.done ? " is-done" : ""}`} onClick={primary.run || undefined}>
        {primary.done && <i aria-hidden="true">✓</i>}{primary.label}</button>
      {primary.done && !over && <p className="fd-geo-note">Change anything until the reveal.</p>}
      {over && <p className="fd-geo-note">Waiting for the reveal.</p>}
    </footer>
  </>;
}

/* the reveal, from your side: the line from your pin to the answer, then
   your two scores running up */
function YourReveal({ me, view }) {
  const identity = usePlayerIdentity(me);
  const score = view.mineScored;
  const row = view.standings.find(item => item.player === me);
  const answer = view.round;
  const where = useCountTo(score?.where || 0, { delay:1700 });
  const whenPts = useCountTo(score?.when || 0, { delay:1900 });
  const miles = useCountTo(score?.miles || 0, { delay:1500, ms:1100 });
  return <>
    <main className="fd-geo-game-body is-reveal">
      <GeoMap mode="reveal" animate answer={answer} className="fd-geo-full" label="The answer and your pin"
        guesses={score ? [{ lat:score.guess.lat, lng:score.guess.lng, color:identity.color, label:"" }] : []} />
    </main>
    <footer className="fd-geo-game-foot is-reveal">
      <div className="fd-geo-result">
        <div className="fd-geo-answer"><small>The answer</small><strong>{answer.place}</strong>
          <span>{whenLabel(answer.when)}</span>{answer.caption && <em>{answer.caption}</em>}</div>
        {score ? <div className="fd-geo-score">
          <div><small>Where</small><b>+{fmt(where)}</b><span>{milesLabel(miles)} off</span></div>
          <div><small>When</small><b>+{fmt(whenPts)}</b><span>{offLabel(score.hours)}</span></div>
        </div> : <p className="fd-geo-note">No guess this photo.</p>}
        {row && <p className="fd-geo-rank"><b>{fmt(row.total)}</b> total · {ordinal(row.rank)} of {view.standings.length}</p>}
      </div>
    </footer>
  </>;
}

/* A player's game, full screen. It opens by itself for each new photo and
   each reveal (once each), waits while a sheet is open, and Home's row
   reopens it. */
export function GeoPlaySheet({ state, me, blocked = false, force = 0, onGuess = sendGuess, now }) {
  const at = now ?? serverNow();
  const view = geoView(state, me, at);
  useTicking(!!view && view.phase === "guess" && now === undefined);
  const key = view ? `${view.roundId}:${view.phase}` : null;
  const [dismissed, setDismissed] = useState(null);
  const forced = useRef(force);
  useEffect(() => {
    if (force !== forced.current) { forced.current = force; setDismissed(null); }
  }, [force]);
  const open = !!view && view.playing && !blocked && dismissed !== key && !!view.round
    && (view.phase === "guess" || view.revealed);
  const playing = !!view?.playing;
  useEffect(() => { if (playing) preloadGeoMap(); }, [playing]);
  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = before; };
  }, [open]);
  if (!open) return null;
  return <div className={`fd-geo-game is-${view.phase}`} role="dialog" aria-modal="true" aria-label="Where and When">
    <header className="fd-geo-game-head">
      <span className="fd-geo-count"><small>Where and When</small><b>Photo {view.n} <i>of {view.total}</i></b></span>
      {view.phase === "guess" && <Clock closesAt={view.closesAt} now={at} />}
      <button type="button" className="fd-geo-close" onClick={() => setDismissed(key)} aria-label="Close">×</button>
    </header>
    {view.phase === "guess"
      ? <GuessGame key={view.roundId} view={view} onGuess={onGuess} now={at} />
      : <YourReveal key={view.roundId} me={me} view={view} />}
  </div>;
}

/* Home's row while a game runs, for a player who closed it */
export function GeoHome({ state, me, onOpen, now }) {
  const view = geoView(state, me, now ?? serverNow());
  useTicking(!!view && view.phase === "guess" && now === undefined, 1000);
  if (!view || !view.playing || (view.done && !view.revealed)) return null;
  const status = view.phase === "guess" ? view.mine ? "Guess locked in" : `${view.secondsLeft} s to guess`
    : view.mineScored ? `+${fmt(view.mineScored.total)} this photo` : "Revealed";
  return <button type="button" className="fd-geo-home" onClick={onOpen}>
    <span><small><i className="fd-beat-dot" aria-hidden="true" />Where and When · Photo {view.n} of {view.total}</small>
      <strong>{status}</strong></span><span aria-hidden="true">↗</span>
  </button>;
}
