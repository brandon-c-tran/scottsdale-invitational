import React, { useEffect, useRef, useState } from "react";
import { EDITION, ROSTER, SPORTS, RATINGS, allEventsOf } from "../../../shared/core.js";
import { TravelMap, TRAVEL_CITIES, VenueCard, TravelFields, SizeRow } from "../travel/Travel.jsx";
import { ProfileEditor } from "../profile/ProfileEditor.jsx";
import { InstallHint } from "./InstallHint.jsx";
import { createCheckInSubmission } from "./submission.js";
import "./arrival.css";

const STAGES = ["Your invitation", "The tournament", "The roster", "The details", "Your card", "Private ratings"];

function InvitationArt() {
  return <div className="fd-invitation-art" aria-label="Field Day. Scottsdale, 2026.">
    <div className="fd-invitation-eyebrow"><span>YOUR INVITATION</span><span>2026</span></div>
    <div className="fd-invitation-wordmark" aria-hidden="true"><span>FIELD</span><span>DAY<span className="fd-invitation-period">.</span></span></div>
    <div className="fd-invitation-seal" aria-hidden="true">
      <svg viewBox="0 0 100 100"><path d="M50 1 59 10 72 6 77 19 91 23 90 37 100 50 90 60 94 74 80 79 76 93 62 91 50 100 40 90 26 94 21 80 7 76 9 62 0 50 10 40 6 26 20 21 24 7 38 9Z" fill="currentColor" /></svg>
      <span><strong>{ROSTER.length}</strong><small>PLAYERS</small></span>
    </div>
    <div className="fd-invitation-edition"><span>SCOTTSDALE, AZ</span><span>{EDITION.short}<br />2026</span></div>
  </div>;
}

function RatingForm({ ratings, setRatings }) {
  const rated = SPORTS.filter(s => ratings[s.id] !== undefined).length;
  return <div>
    <div className="fd-rating-status"><span role="status">{rated} of {SPORTS.length} rated</span>
      {rated < SPORTS.length && <button type="button" className="fd-text-button"
        onClick={() => setRatings(current => Object.fromEntries(SPORTS.map(s => [s.id, current[s.id] ?? 2])))}>
        Set remaining to Average</button>}
    </div>
    {[["sport", "Sports"], ["drink", "Drinking games"]].map(([group, title]) => <div className="fd-rating-group" key={group}>
      <h3 className="fd-eyebrow">{title}</h3>
      <div className="fd-rating-labels" aria-hidden="true"><span />
        <div>{["Never", "Rough", "Avg", "Solid", "Elite"].map(text => <span key={text}>{text}</span>)}</div>
      </div>
      {SPORTS.filter(s => s.group === group).map(s => <div className="fd-rating-row" key={s.id}>
        <div><strong>{s.label}</strong><small>{RATINGS.find(r => r.v === ratings[s.id])?.label || "Not rated"}</small></div>
        <div className="fd-rating-options" role="group" aria-label={s.label}>
          {RATINGS.map((r, i) => <button type="button" key={r.v} aria-label={`${s.label}: ${r.label}`}
            aria-pressed={ratings[s.id] === r.v} className={ratings[s.id] >= r.v ? "is-filled" : ""}
            onClick={() => setRatings(current => ({ ...current, [s.id]:r.v }))}>{i + 1}</button>)}
        </div>
      </div>)}
    </div>)}
  </div>;
}

/* Mount only after the first server snapshot. Drafts initialize once from the
   saved guest answers, then survive broadcasts and rejected submissions. */
export function Onboarding({ step, me, state, pick, saveProfile, submitSeeds, next, back, done, onTv, onChip }) {
  const [selected, setSelected] = useState(me || null);
  const [ratings, setRatings] = useState({});
  const [display, setDisplay] = useState("");
  const [photo, setPhoto] = useState(null);
  const [num, setNum] = useState("");
  const [size, setSize] = useState(null);
  const [flightsBooked, setFlightsBooked] = useState(null);
  const [flightIn, setFlightIn] = useState(null);
  const [flightOut, setFlightOut] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = useRef(createCheckInSubmission());
  const heading = useRef(null);
  const hydratedPlayer = useRef(null);
  useEffect(() => {
    if (!me || hydratedPlayer.current === me) return;
    hydratedPlayer.current = me;
    const profile = state.profiles?.[me];
    setDisplay(profile?.display || me);
    setNum(profile?.num != null ? String(profile.num) : "");
    setSize(profile?.size ?? null);
    setFlightsBooked(profile?.flightsBooked ?? null);
    setFlightIn(profile?.flightIn || null);
    setFlightOut(profile?.flightOut || null);
    setPhoto(null);
    setRatings({ ...state.seeds?.[me] });
  }, [me, state.profiles, state.seeds]);
  useEffect(() => {
    setError("");
    heading.current?.focus({ preventScroll:true });
    window.scrollTo({ top:0, behavior:"instant" });
  }, [step]);

  const saveAndGo = async (save, advance = next) => {
    setBusy(true); setError("");
    const result = await submit.current(save, advance);
    if (!result.ok) setError(result.error || "Couldn't save. Try again.");
    setBusy(false);
  };
  const saveChip = async (color, skin) => {
    setBusy(true); setError("");
    const result = await submit.current(() => onChip(color, skin), () => {});
    if (!result.ok) setError(result.error || "Couldn't save your chip. Try again.");
    setBusy(false);
  };
  const title = step === -1 ? "Take Field Day with you"
    : ["Claim your spot", "The bachelor party is a tournament", "Thank you for flying in for this", "Getting there", "Set up your profile", "Rate yourself"][step];
  const intro = step === -1 ? "Add it to your home screen for live scores, draws, and bets all weekend."
    : ["Pick your name to unlock the trip details and give me the additional information I’ll need for logistics. It’ll only take ~2 minutes.",
      `${ROSTER.length} players, ${allEventsOf(state).filter(e => !e.finale).length} events, one board. Win events and land bets to collect points all weekend, then your points become your chips at the poker finale. Whoever wins the poker table is the Field Day champion.`,
      `${ROSTER.length} players coming in from ${TRAVEL_CITIES.length} cities.`,
      "",
      "",
      "These stay private. They’re only used to make fair teams."][step];
  /* Once the weekend is live a straggler is already here: flights become
     optional, the shirt size is still needed. */
  const canContinue = step === 0 ? !!selected : step === 3 ? !!size && (flightsBooked !== null || !!state.live)
    : step === 4 ? !!display.trim() && !!state.profiles?.[me]?.color
    : step === 5 ? SPORTS.every(s => ratings[s.id] !== undefined) : true;
  const continueLabel = step === -1 ? "Skip, stay in the browser" : step === 0 ? selected ? `Continue as ${selected}` : "Pick your name"
    : step === 5 ? "Finish check-in" : "Continue";
  const go = () => {
    if (step === 0) return saveAndGo(() => pick(selected));
    if (step === 3) return saveAndGo(() => saveProfile({ display:(display || me).trim() || me, size,
      ...(flightsBooked === null ? {} : { flightsBooked, flightIn, flightOut }) }));
    if (step === 4) return saveAndGo(() => saveProfile({ display:display.trim(), num:num === "" ? null : Number(num), ...(photo ? { photo } : {}) }));
    if (step === 5) return saveAndGo(() => submitSeeds(ratings), done);
    next();
  };

  return <main className="fd-arrival" aria-busy={busy}>
    <header className="fd-arrival-header">
      <span className="fd-eyebrow">FIELD DAY / SCOTTSDALE</span>
      <span className="fd-arrival-progress">{step < 0 ? "WELCOME" : `${String(step + 1).padStart(2, "0")} / 06`}</span>
      {step >= 0 && <div className="fd-arrival-progress-track" aria-label={`Check-in step ${step + 1} of 6: ${STAGES[step]}`}>
        {STAGES.map((stage, i) => <span key={stage} className={i <= step ? "is-complete" : ""} />)}
      </div>}
    </header>
    <div className={`fd-arrival-layout${step <= 0 ? " is-invitation" : ""}`}>
      <aside className="fd-arrival-aside">
        {step <= 0 ? <InvitationArt /> : <div className="fd-arrival-chapter" aria-hidden="true">
          <span className="fd-eyebrow">FIELD DAY / 2026</span><strong>{String(step + 1).padStart(2, "0")}</strong>
          <span className="fd-chapter-name">{STAGES[step]}</span><span className="fd-chapter-date">{EDITION.long}</span>
        </div>}
      </aside>
      <section className="fd-arrival-main" key={step}>
        <div className="fd-arrival-heading"><h1 ref={heading} tabIndex={-1}>{title}</h1>{intro && <p>{intro}</p>}</div>
        <fieldset className="fd-arrival-fields" disabled={busy}>
          {step === -1 && <div className="fd-install"><InstallHint /><p>Open it from your home screen to finish your two-minute check-in.</p></div>}
          {step === 0 && <div className="fd-guest-list" role="group" aria-label="Who are you?">
            {ROSTER.map((p, i) => <button type="button" key={p} onClick={() => setSelected(p)} aria-pressed={selected === p}>
              <span className="fd-guest-index">{String(i + 1).padStart(2, "0")}</span><span>{p}</span><span className="fd-guest-check" aria-hidden="true">{selected === p ? "↗" : "+"}</span>
            </button>)}
          </div>}
          {step === 1 && <>
            <div className="fd-starting-stack"><span className="fd-eyebrow">EVERYONE STARTS AT</span><strong>1,000<span>CHIPS</span></strong></div>
            <div className="fd-weekend-rules">
              {[["01", "Collect points", "Win events and land bets. Whatever you have Saturday night becomes your poker stack."],
                ["02", "Betting", "Every event can be bet on. Only half your points can be at risk at one time."],
                ["03", "Duels", "Challenge anyone to Quick Draw. You name the ante, and the fastest tap takes the pot."],
                ["04", "The trophy", "The winner of the poker finale is the Field Day champion and takes home the Scottsdale 2026 trophy."]].map(([n, name, body]) =>
                <div key={n}><span>{n}</span><div><h2>{name}</h2><p>{body}</p></div></div>)}
            </div>
          </>}
          {step === 2 && <div className="fd-arrival-map"><TravelMap /><div className="fd-destination-note"><strong>Scottsdale, Arizona</strong><span>{EDITION.long}</span></div></div>}
          {step === 3 && <><VenueCard lg={state.logistics || {}} /><div className="fd-details-panel">
            <h2>Information I need</h2>
            <TravelFields booked={flightsBooked} setBooked={setFlightsBooked} flightIn={flightIn} setFlightIn={setFlightIn} flightOut={flightOut} setFlightOut={setFlightOut} />
            <SizeRow lb="T-shirt size" value={size} onPick={setSize} />
          </div></>}
          {step === 4 && <ProfileEditor state={state} me={me} display={display} setDisplay={setDisplay} photo={photo} setPhoto={setPhoto}
            num={num} setNum={setNum} showSize={false} onChip={saveChip} />}
          {step === 5 && <RatingForm ratings={ratings} setRatings={setRatings} />}
        </fieldset>
        <footer className="fd-arrival-actions">
          {error && <p className="fd-save-error" role="alert">{error}</p>}
          <button type="button" className="fd-continue" disabled={busy || !canContinue} onClick={go}>
            <span>{busy ? "Saving…" : continueLabel}</span><span aria-hidden="true">↗</span>
          </button>
          <div className="fd-arrival-links">
            {step > 0 && <button type="button" className="fd-text-button" disabled={busy} onClick={back}>← Back</button>}
            {step === 0 && onTv && <button type="button" className="fd-text-button" onClick={onTv} disabled={busy}>TV mode</button>}
            {step === 4 && !state.profiles?.[me]?.color && <span>Choose a chip color to continue.</span>}
          </div>
        </footer>
      </section>
    </div>
  </main>;
}
