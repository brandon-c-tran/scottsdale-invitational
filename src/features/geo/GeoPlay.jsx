import React, { useEffect, useRef, useState } from "react";
import { dispatch } from "../../lib/client.js";
import { serverNow } from "../../lib/serverClock.js";
import { tapTick } from "../../lib/haptics.js";
import { useReducedMotion } from "../../lib/motion.js";
import { GEO_ROUND_MS } from "../../../shared/geo.js";
import { usePlayerIdentity } from "../identity/PlayerIdentityContext.js";
import { GeoMap, preloadGeoMap } from "./GeoMap.jsx";
import { WhenPicker, formatWhen, parseWhen } from "./WhenPicker.jsx";
import { PlaceSearch } from "./PlaceSearch.jsx";
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

/* The guess: the photo, where, when, then Lock in. The draft saves itself
   as it changes (and once more just before the clock runs out), so
   whatever is set when time is up is the guess: a pin and no date scores
   the pin. A part never touched is not sent, so the wheels' starting date
   never counts. Lock in marks it done; later changes still save. */
const AUTOSAVE_MS = 450;
function GuessGame({ view, onGuess, now }) {
  const mine = view.mine;
  const pinned = Number.isFinite(mine?.lat) && Number.isFinite(mine?.lng);
  const [step, setStep] = useState(pinned ? "map" : "photo");
  const [pin, setPin] = useState(pinned ? { lat:mine.lat, lng:mine.lng } : null);
  const [wall, setWall] = useState(() => parseWhen(mine?.when));
  const [whenSet, setWhenSet] = useState(!!mine?.when);
  const [fill, setFill] = useState(false);
  const [focus, setFocus] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [stamped, setStamped] = useState(0);
  const sent = useRef(null), inflight = useRef(null), again = useRef(false), lockedRef = useRef(!!mine?.done);
  const draft = { lat:pin ? pin.lat : null, lng:pin ? pin.lng : null, when:whenSet ? formatWhen(wall) : null };
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const left = view.closesAt - now;
  const seconds = Math.max(0, Math.ceil(left / 1000));
  /* the server takes a guess for a few seconds past the clock (GEO_GRACE_MS) */
  const over = left < -3000;
  const overRef = useRef(over);
  overRef.current = over;

  /* one save at a time; the newest draft wins */
  const save = async (done = lockedRef.current) => {
    const current = draftRef.current;
    if (overRef.current || (current.lat === null && !current.when)) return null;
    const payload = { roundId:view.roundId, ...current, done };
    const key = JSON.stringify(payload);
    if (key === sent.current) return { ok:true };
    if (inflight.current) { again.current = true; return inflight.current; }
    setSaving(true);
    inflight.current = (async () => {
      try {
        const result = await onGuess(payload);
        if (result?.ok === true) { sent.current = key; setError(""); }
        else if (!overRef.current) setError(result?.error || "Not saved. Trying again.");
        return result;
      } catch { setError("Not saved. Trying again."); return null; }
      finally {
        inflight.current = null; setSaving(false);
        if (again.current) { again.current = false; save(); }
      }
    })();
    return inflight.current;
  };
  const draftKey = JSON.stringify(draft);
  useEffect(() => {
    if (draft.lat === null && !draft.when) return undefined;
    const timer = setTimeout(() => save(), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [draftKey]); // eslint-disable-line react-hooks/exhaustive-deps
  /* the last second: send whatever is there now */
  const flushed = useRef(false);
  useEffect(() => {
    if (!flushed.current && left < 1500 && left > -2500) { flushed.current = true; save(); }
  }, [left < 1500]); // eslint-disable-line react-hooks/exhaustive-deps

  const lockIn = async () => {
    if (!pin || !whenSet) return;
    tapTick();
    lockedRef.current = true;
    const result = await save(true);
    if (result?.ok) setStamped(n => n + 1);
    else lockedRef.current = !!mine?.done;
  };
  const go = next => { tapTick(); setStep(next); };
  const locked = !!mine?.done;
  /* the screen says time is up at zero; the server's grace still takes the last save */
  const timeUp = left <= 0;
  const hurry = !timeUp && seconds <= 10 ? ` · ${seconds}s` : "";
  const primary = timeUp ? { label:mine ? "Time's up · guess saved" : "Time's up", run:null, done:!!mine }
    : step === "photo" ? { label:`Guess where${hurry}`, run:() => go("map") }
    : step === "map" ? (pin ? { label:`Next: when${hurry}`, run:() => go("when") }
      : { label:`Tap the map to drop your pin${hurry}`, run:null })
      : !pin ? { label:`Drop your pin${hurry}`, run:() => go("map") }
        : locked ? { label:"Locked in", run:null, done:true }
          : { label:`Lock in${hurry}`, run:lockIn, lock:true };
  /* what is saved, in words, once time is up */
  const kept = mine ? [Number.isFinite(mine.lat) ? "your pin" : "no pin", mine.when ? whenLabel(mine.when) : "no date"].join(" · ") : "";
  return <>
    <main className={`fd-geo-game-body is-${step}`}>
      {step === "photo" && <button type="button" className={`fd-geo-game-photo${fill ? " is-fill" : ""}`}
        onClick={() => setFill(value => !value)} aria-label={fill ? "Fit the photo" : "Fill the screen with the photo"}>
        <img src={geoPhotoSrc(view.round)} alt={`Photo ${view.n}`} /></button>}
      {step === "map" && <div className="fd-geo-game-map">
        <GeoMap mode="pick" pin={pin} onPick={point => { setPin(point); }} onTap={tapTick} className="fd-geo-full"
          focus={focus} label="Drop your pin where this was taken" />
        <button type="button" className="fd-geo-peek" onClick={() => go("photo")} aria-label="Back to the photo">
          <img src={geoPhotoSrc(view.round)} alt="" /></button>
        <PlaceSearch className="is-floating" onPick={place => {
          setFocus({ lat:place.lat, lng:place.lng, zoom:place.zoom, key:`${place.key}:${Date.now()}` });
          setPin({ lat:place.lat, lng:place.lng });
        }} />
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
      <button type="button" key={`${primary.done ? "done" : "go"}:${stamped}`} disabled={!primary.run}
        className={`fd-geo-primary${primary.lock ? " is-lock" : ""}${primary.done ? " is-done" : ""}${hurry ? " is-hurry" : ""}`}
        onClick={primary.run || undefined}>
        {primary.done && <i aria-hidden="true">✓</i>}{primary.label}</button>
      {timeUp ? <p className="fd-geo-note">{mine ? `Saved: ${kept}. Waiting for the reveal.` : "Waiting for the reveal."}</p>
        : (pin || whenSet) && <p className="fd-geo-note">{saving ? "Saving…" : locked
          ? "Changes save until the reveal." : "Your guess saves as you go."}</p>}
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
        guesses={score && score.miles !== null ? [{ lat:score.guess.lat, lng:score.guess.lng, color:identity.color, label:"" }] : []} />
    </main>
    <footer className="fd-geo-game-foot is-reveal">
      <div className="fd-geo-result">
        <div className="fd-geo-answer"><small>The answer</small><strong>{answer.place}</strong>
          <span>{whenLabel(answer.when)}</span>{answer.caption && <em>{answer.caption}</em>}</div>
        {score ? <div className="fd-geo-score">
          <div><small>Where</small><b>+{fmt(where)}</b><span>{score.miles === null ? "No pin" : `${milesLabel(miles)} off`}</span></div>
          <div><small>When</small><b>+{fmt(whenPts)}</b><span>{score.hours === null ? "No date" : offLabel(score.hours)}</span></div>
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
  const leftMs = view ? view.closesAt - at : 0;
  const secondsLeft = Math.max(0, Math.ceil(leftMs / 1000));
  const urgent = view?.phase === "guess" && leftMs > 0 && secondsLeft <= 10;
  const playing = !!view?.playing;
  useEffect(() => { if (playing) preloadGeoMap(); }, [playing]);
  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = before; };
  }, [open]);
  if (!open) return null;
  return <div className={`fd-geo-game is-${view.phase}${urgent ? " is-urgent" : ""}`} role="dialog" aria-modal="true"
    aria-label="Where and When">
    <header className="fd-geo-game-head">
      <span className="fd-geo-count"><small>Where and When</small><b>Photo {view.n} <i>of {view.total}</i></b></span>
      {view.phase === "guess" && <Clock closesAt={view.closesAt} now={at} />}
      <button type="button" className="fd-geo-close" onClick={() => setDismissed(key)} aria-label="Close">×</button>
      {/* the minute, draining across the top of the screen */}
      {view.phase === "guess" && <span className="fd-geo-timebar" aria-hidden="true">
        <i style={{ transform:`scaleX(${Math.max(0, Math.min(1, leftMs / GEO_ROUND_MS))})` }} /></span>}
    </header>
    {urgent && secondsLeft <= 5 && <span className="fd-geo-final" key={secondsLeft} aria-hidden="true">{secondsLeft}</span>}
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
