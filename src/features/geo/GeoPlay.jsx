import React, { useEffect, useRef, useState } from "react";
import { dispatch } from "../../lib/client.js";
import { serverNow } from "../../lib/serverClock.js";
import { tapTick } from "../../lib/haptics.js";
import { Sheet } from "../../ui/controls.jsx";
import { usePlayerIdentity } from "../identity/PlayerIdentityContext.js";
import { GeoMap } from "./GeoMap.jsx";
import { geoPhotoSrc, geoView, hourLabel, milesLabel, offLabel, whenLabel } from "./geoModel.js";
import "./geo.css";

const sendGuess = payload => dispatch("geoGuess", payload, { retry:true });
const fmt = n => (n ?? 0).toLocaleString("en-US");
const HOURS = Array.from({ length:24 }, (_, h) => h);

function useTicking(active) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(timer);
  }, [active]);
}

/* your pin, your date and hour, sent; changeable until the reveal */
function GuessForm({ view, onGuess }) {
  const mine = view.mine;
  const [pin, setPin] = useState(mine ? { lat:mine.lat, lng:mine.lng } : null);
  const [date, setDate] = useState(mine ? mine.when.slice(0, 10) : "");
  const [hour, setHour] = useState(mine ? Number(mine.when.slice(11, 13)) : 19);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const when = date ? `${date}T${String(hour).padStart(2, "0")}` : "";
  const same = mine && pin && mine.lat === Math.round(pin.lat * 1e5) / 1e5 && mine.lng === Math.round(pin.lng * 1e5) / 1e5
    && mine.when === when;
  const send = async () => {
    if (busy.current || !pin || !date || same) return;
    tapTick();
    busy.current = true; setPending(true); setError("");
    try {
      const result = await onGuess({ roundId:view.roundId, lat:pin.lat, lng:pin.lng, when });
      if (result?.ok !== true) setError(result?.error || "Not saved. Try again.");
    } catch { setError("Not saved. Try again."); }
    finally { busy.current = false; setPending(false); }
  };
  return <div className="fd-geo-guess">
    <GeoMap mode="pick" pin={pin} onPick={setPin} className="fd-geo-pick" label="Drop your pin where this was taken" />
    <p className="fd-geo-hint">{pin ? "Tap again to move your pin" : "Tap the map where this was taken"}</p>
    <div className="fd-geo-when">
      <label><span>Date</span><input type="date" value={date} min="1950-01-01" max="2030-12-31"
        onChange={event => setDate(event.target.value)} /></label>
      <label><span>Hour</span><select value={hour} onChange={event => setHour(Number(event.target.value))}>
        {HOURS.map(h => <option key={h} value={h}>{hourLabel(h)}</option>)}
      </select></label>
    </div>
    {error && <p className="fd-geo-error" role="alert">{error}</p>}
    <button type="button" className="fd-geo-send" disabled={pending || !pin || !date || same} onClick={send}>
      {pending ? "Saving…" : same ? "Locked in" : mine ? "Update guess" : "Lock in guess"}</button>
    {mine && <p className="fd-geo-hint">You can change it until the reveal.</p>}
  </div>;
}

/* the reveal, from your side: the answer, your two scores, where you stand */
function YourRound({ state, me, view }) {
  const identity = usePlayerIdentity(me);
  const score = view.mineScored;
  const row = view.standings.find(item => item.player === me);
  const answer = view.round;
  return <div className="fd-geo-yours">
    <div className="fd-geo-answer"><small>The answer</small><strong>{answer.place}</strong><span>{whenLabel(answer.when)}</span>
      {answer.caption && <em>{answer.caption}</em>}</div>
    <GeoMap mode="reveal" answer={answer} className="fd-geo-reveal-map" label="The answer and your pin"
      guesses={score ? [{ lat:score.guess.lat, lng:score.guess.lng, color:identity.color, label:"" }] : []} />
    {score ? <dl className="fd-geo-score">
      <div><dt>Where</dt><dd>+{fmt(score.where)}</dd><span>{milesLabel(score.miles)} off</span></div>
      <div><dt>When</dt><dd>+{fmt(score.when)}</dd><span>{offLabel(score.hours)}</span></div>
    </dl> : <p className="fd-geo-hint">No guess this round.</p>}
    {row && <p className="fd-geo-rank">{fmt(row.total)} total · {ordinal(row.rank)} of {view.standings.length}</p>}
  </div>;
}
const ordinal = n => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"}`;

/* A player's view of the live game as a sheet. It opens by itself for each
   new photo and each reveal (once each), waits while another sheet is open,
   and reopens from Home. */
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
  if (!view || !view.playing || blocked || dismissed === key) return null;
  if (view.phase === "guess" && !view.round) return null;
  if (view.done && !view.revealed) return null;
  const subtitle = view.phase === "guess" ? `Photo ${view.n} of ${view.total} · ${view.secondsLeft} s`
    : `Photo ${view.n} of ${view.total}`;
  return <Sheet title="Where and When" subtitle={subtitle} onClose={() => setDismissed(key)} className="fd-geo-sheet">
    {view.round && <img className="fd-geo-photo" src={geoPhotoSrc(view.round)} alt={`Photo ${view.n}`}
      width={view.round.photo.w} height={view.round.photo.h} />}
    {view.phase === "guess"
      ? <GuessForm key={view.roundId} view={view} onGuess={onGuess} />
      : view.revealed ? <YourRound state={state} me={me} view={view} /> : null}
  </Sheet>;
}

/* Home's row while a game runs, for a player who closed the sheet */
export function GeoHome({ state, me, onOpen, now }) {
  const view = geoView(state, me, now ?? serverNow());
  useTicking(!!view && view.phase === "guess" && now === undefined);
  if (!view || !view.playing || (view.done && !view.revealed)) return null;
  const status = view.phase === "guess" ? view.mine ? "Guess locked in" : `${view.secondsLeft} s to guess`
    : view.mineScored ? `+${fmt(view.mineScored.total)} this photo` : "Revealed";
  return <button type="button" className="fd-geo-home" onClick={onOpen}>
    <span><small><i className="fd-beat-dot" aria-hidden="true" />Where and When · Photo {view.n} of {view.total}</small>
      <strong>{status}</strong></span><span aria-hidden="true">↗</span>
  </button>;
}

