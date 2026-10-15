/* Tap on the beat (Oct 14): the speaker's latency, measured once, so a
   win song can be sent early and land on its bit's beat
   (shared/bitMusic.js). Two runs of three taps: on the phone's own click
   (your reaction, with no delay), then on the speaker (your reaction plus
   the speaker's delay); the difference of the two medians is the
   speaker's latency, saved as private:spotify:latency. Each round counts
   in on three lamps and then sounds after an unknown wait, so a tap
   answers the sound and never the count. */
import React, { useEffect, useReducer, useRef, useState } from "react";
import { CALIBRATION_IDLE, CALIBRATION_ROUNDS, TAP_WINDOW_MS, calibrationStep } from "../../../shared/bitMusic.js";
import { spotifyCalibrate, spotifyLatency } from "../../lib/client.js";
import { playSound, unlockSound } from "../../lib/sound.js";
import { serverNow } from "../../lib/serverClock.js";
import { ActionButton } from "../../ui/controls.jsx";

/* the count-in before each round's sound: three lamps */
export const COUNT_IN_MS = 1200;
/* a click lands an unknown while after the count (like the speaker does) */
const clickGap = () => 400 + Math.round(Math.random() * 900);

export function SpeakerTiming({ latencyMs = null, latencyDefault = 900, onSaved }) {
  const [cal, dispatch] = useReducer(calibrationStep, CALIBRATION_IDLE);
  const [count, setCount] = useState(null);
  const [busy, setBusy] = useState(false);
  const timers = useRef([]);
  const live = cal.step === "clicks" || cal.step === "speaker";
  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const later = (fn, ms) => { timers.current.push(setTimeout(fn, Math.max(0, ms))); };
  useEffect(() => clear, []);

  /* one round: count in, then the sound (the phone's click, or the
     speaker's song from the Worker's request) */
  useEffect(() => {
    if (!live || cal.heard !== null) return undefined;
    let cancelled = false;
    clear();
    (async () => {
      if (cal.step === "clicks") {
        const end = serverNow() + COUNT_IN_MS;
        setCount({ end });
        const at = end + clickGap();
        const handle = playSound("bitBumper", { bus:"you", at, open:true });
        if (!handle) { dispatch({ type:"fail", error:"Turn Sound on to time the speaker" }); setCount(null); return; }
        later(() => { if (!cancelled) { setCount(null); dispatch({ type:"sound", at }); } }, end - serverNow());
      } else {
        const result = await spotifyCalibrate();
        if (cancelled) return;
        if (!result?.ok) { dispatch({ type:"fail", error:result?.error || "The speaker didn't answer" }); return; }
        setCount({ end:result.at });
        later(() => { if (!cancelled) { setCount(null); dispatch({ type:"sound", at:result.at }); } }, result.at - serverNow());
      }
    })();
    return () => { cancelled = true; };
  }, [cal.step, cal.round, cal.heard === null]); // eslint-disable-line react-hooks/exhaustive-deps

  /* a round nobody tapped runs again */
  useEffect(() => {
    if (!live || cal.heard === null) return undefined;
    const timer = setTimeout(() => dispatch({ type:"retry" }), TAP_WINDOW_MS + 2000);
    return () => clearTimeout(timer);
  }, [cal.heard]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = () => { try { unlockSound(); } catch {} clear(); setCount(null); dispatch({ type:"start" }); };
  const tap = () => { if (live && cal.heard !== null) dispatch({ type:"tap", at:serverNow() }); };
  const save = async () => {
    if (busy || cal.latency === null) return;
    setBusy(true);
    const result = await spotifyLatency(cal.latency);
    setBusy(false);
    if (!result?.ok) return dispatch({ type:"fail", error:result?.error || "Could not save" });
    onSaved?.(result.latencyMs);
    dispatch({ type:"reset" });
  };

  if (!live && cal.step !== "done") return (
    <div className="fd-speaker-timing">
      <p className="fd-speaker-timing-line">
        <b>{latencyMs === null ? "Not set" : `${latencyMs} ms`}</b>
        {latencyMs === null && <small>{`Using ${latencyDefault} ms`}</small>}
      </p>
      <ActionButton variant="secondary" onClick={start}>Tap on the beat</ActionButton>
      {cal.error && <div role="alert" className="fd-speaker-error">{cal.error}</div>}
    </div>
  );
  if (cal.step === "done") return (
    <div className="fd-speaker-timing">
      <p className="fd-speaker-timing-line"><b>{cal.latency === null ? "No reading" : `${cal.latency} ms`}</b></p>
      <div className="fd-speaker-timing-actions">
        <ActionButton onClick={save} pending={busy} disabled={cal.latency === null}>Save</ActionButton>
        <ActionButton variant="secondary" onClick={start} disabled={busy}>Again</ActionButton>
      </div>
      {cal.error && <div role="alert" className="fd-speaker-error">{cal.error}</div>}
    </div>
  );
  return (
    <div className="fd-speaker-timing is-live">
      <p className="fd-speaker-timing-step">{`${cal.step === "clicks" ? "Phone" : "Speaker"} ${Math.min(cal.round + 1, CALIBRATION_ROUNDS)} of ${CALIBRATION_ROUNDS}`}</p>
      <CountLamps key={`${cal.step}:${cal.round}:${count?.end || "on"}`} end={count?.end || null} />
      <button type="button" className={`fd-speaker-pad${cal.heard !== null ? " is-armed" : ""}`} onPointerDown={tap}
        aria-label="Tap when you hear it">Tap</button>
    </div>
  );
}

/* three lamps that light across the count-in, then all lit while it listens */
function CountLamps({ end }) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!end) return undefined;
    const timer = setInterval(() => tick(n => n + 1), 80);
    return () => clearInterval(timer);
  }, [end]);
  const left = end ? end - serverNow() : 0;
  const lit = end ? Math.min(3, Math.max(0, 3 - Math.ceil(left / (COUNT_IN_MS / 3)))) : 3;
  return <span className="fd-speaker-lamps" aria-hidden="true">
    {[0, 1, 2].map(i => <span key={i} className={`fd-insert${i < lit ? "" : " is-off"}`} />)}
  </span>;
}
