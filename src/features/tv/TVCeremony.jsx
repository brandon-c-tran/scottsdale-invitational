import React, { useEffect, useRef, useState } from "react";
import { disp, teamLabel, overflowRoleMeta, resolveCurrentContest } from "../../../shared/core.js";
import { Avatar } from "../identity/PlayerIdentity.jsx";
import { EventName } from "../../ui/OneSafe.jsx";
import { PayoutLadder } from "../../ui/PayoutLadder.jsx";
import { DRAW_PARTNER_BEAT_MS, drawStepAt, drawSequenceMs, partnerFaces, revealTimeline, startDrawPlayback } from "../weekend/drawReveal.js";
import "./tv-moments.css";
import { serverNow } from "../../lib/serverClock.js";
import { GameIntro } from "../intro/GameIntro.jsx";
import {
  TV_INTRO_AUTO_MS, TV_INTRO_AUTO_REDUCED_MS, TV_REVEAL_HOLD_MS, oddsLine,
} from "./tvModel.js";

/* The TV's own ceremonies. They render INSIDE the scaled canvas, so a 1080p
   set and a 4K set show the same layout; the phone versions stay sheets. */

/* The announcement: the game intro (features/intro) at canvas scale, the
   game's own scene, its name, and what it pays as the podium on the floor
   (no rules, no meta line). It runs from the announcement's server stamp,
   the same frame as every phone; a TV that joins late joins mid-scene.
   With Show Control the event-intro scene drives it (its start is the
   fallback anchor); without, the legacy chain does, and it closes on its
   own on the same clock (or hands over to the draw at INTRO_MS). */
export function IntroOverlay({ state, ev, handoff = false, reducedMotion = false, onDone = null, sceneAt = null,
  now:clockNow = serverNow }) {
  const stamped = Number(state?.eventOps?.[ev.id]?.announcedAt) || Number(sceneAt) || 0;
  const [anchor] = useState(() => stamped > 0 && clockNow() - stamped < TV_INTRO_AUTO_MS ? stamped : clockNow());
  const doneRef = useRef(onDone); doneRef.current = onDone;
  useEffect(() => {
    if (!doneRef.current) return undefined;
    const hold = reducedMotion ? TV_INTRO_AUTO_REDUCED_MS : TV_INTRO_AUTO_MS;
    const t = setTimeout(() => doneRef.current?.(), Math.max(1500, anchor + hold - clockNow()));
    return () => clearTimeout(t);
  }, [ev.id, reducedMotion]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="tv-intro fd-night" role="status" aria-label={`Up next: ${ev.name}`}>
      <GameIntro ev={ev} surface="tv" anchor={anchor} reduced={reducedMotion} handoff={handoff} now={clockNow}
        ladder={<PayoutLadder ev={ev} size="tv" className="tv-intro-ladder" />} />
    </div>
  );
}

/* A draw item as the room reads it: the team name past two players, then
   every face and name, large enough to read from the couch. */
function DrawLine({ state, avatars, text, size = 64, partner = false }) {
  const people = avatars || [];
  const named = people.length > 2;
  return (
    <div className="tv-draw-line">
      <div className="tv-draw-faces">
        {people.map((p, i) => partner && i === people.length - 1
          /* the held beat: this side's last partner lands after the rest */
          ? <span key={p} className="tv-partner" style={{ "--partner-beat":`${DRAW_PARTNER_BEAT_MS}ms` }}>
              <Avatar state={state} p={p} size={size} /></span>
          : <Avatar key={p} state={state} p={p} size={size} />)}
      </div>
      <div className="tv-draw-text">
        <div className="tv-draw-name">{text}</div>
        {named && <div className="tv-draw-crew">{people.map(p => disp(state, p)).join(", ")}</div>}
      </div>
    </div>
  );
}

/* The draw at canvas scale: matchups, teams or heats land one at a time on
   the room's clock (the server's announcement stamp, the same timeline every
   phone reads), then the crew as the last step, exactly as the phones count
   it. A TV that joins late starts at the current step. Reduced motion shows
   the whole draw at once. Presentation only: it reads the saved draw. */
const TV_REVEAL_LATE_HOLD_MS = 2500;
export function TVDrawReveal({ state, events = [], reveal, reducedMotion = false, onDone = null, now:clockNow = serverNow }) {
  const versus = reveal.versus || null;
  const groups = versus ? null : reveal.groups || [];
  const crew = reveal.crew || [];
  const cards = versus ? 2 : groups.length;
  const total = cards + (crew.length ? 1 : 0);
  const startAt = revealTimeline(state, reveal.evId, { reveal, reducedMotion })?.revealAt ?? null;
  const [joined] = useState(() => reducedMotion ? total : startAt !== null ? drawStepAt(clockNow() - startAt, total) : 0);
  const [shown, setShown] = useState(joined);
  useEffect(() => {
    const playback = startDrawPlayback({ total, reducedMotion, onStep:setShown,
      ...(startAt !== null ? { startAt, now:clockNow } : {}) });
    return () => playback.stop();
  }, [reveal.id, total, reducedMotion, startAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const complete = shown >= total;
  const doneRef = useRef(onDone); doneRef.current = onDone;
  useEffect(() => {
    if (!complete || !doneRef.current) return undefined;
    /* the room's draw holds until the same moment on every TV; a TV that
       arrives after that still shows it briefly */
    const hold = startAt === null ? TV_REVEAL_HOLD_MS : Math.min(TV_REVEAL_HOLD_MS,
      Math.max(TV_REVEAL_LATE_HOLD_MS, startAt + drawSequenceMs(total) + TV_REVEAL_HOLD_MS - clockNow()));
    const t = setTimeout(() => doneRef.current?.(), hold);
    return () => clearTimeout(t);
  }, [complete, reveal.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const settledStyle = index => index < joined && !reducedMotion ? { animation:"none" } : undefined;
  const ev = events.find(item => item.id === reveal.evId);
  const contest = ev && state.onDeck === ev.id ? resolveCurrentContest(state, ev) : null;
  const cols = groups ? (groups.length === 4 ? 2 : Math.min(3, Math.max(1, groups.length))) : 0;
  const faceSize = groups && groups.length > 3 ? 52 : 64;
  return (
    <div className="tv-reveal fd-night" role="status" aria-live="polite"
      aria-label={`${reveal.title}: ${reveal.subtitle}`}>
      <div className="tv-reveal-head">
        <div className="fd-show tv-reveal-name"><EventName name={reveal.subtitle} /></div>
        <div className="tv-label">{reveal.title}</div>
      </div>
      {versus ? (
        <div className="tv-reveal-versus">
          {versus.map((team, index) => (
            <React.Fragment key={index}>
              {index > 0 && <div className="tv-vs tv-reveal-vs" style={{ visibility:shown > 1 ? "visible" : "hidden" }}>VS</div>}
              <section className={`tv-reveal-card${index < shown ? " is-shown" : ""}`} aria-hidden={index >= shown}
                style={settledStyle(index)}>
                <DrawLine state={state} avatars={team.players} text={teamLabel(state, team)}
                  size={team.players.length > 3 ? 72 : 96} partner={team.players.length > 1} />
              </section>
            </React.Fragment>
          ))}
        </div>
      ) : (
        <div className="tv-reveal-grid" style={{ gridTemplateColumns:`repeat(${cols}, 1fr)` }}>
          {groups.map((group, index) => (
            <section key={index} className={`tv-reveal-card${index < shown ? " is-shown" : ""}`} aria-hidden={index >= shown}
              style={settledStyle(index)}>
              <div className="tv-display tv-reveal-group">{group.title}</div>
              {group.lines.map((line, j) => group.bye ? (
                <div key={j} className="tv-reveal-bye"
                  style={{ "--deal-index":j, ...(reducedMotion || index < joined ? { animation:"none" } : null) }}>
                  <DrawLine state={state} avatars={line.avatars} text={line.text} size={faceSize} />
                </div>
              ) : (
                <React.Fragment key={j}>
                  {group.vs && j > 0 && <div className="tv-reveal-versus-mark">vs</div>}
                  <DrawLine state={state} avatars={line.avatars} text={line.text} size={faceSize}
                    partner={partnerFaces(group)[j] >= 0} />
                </React.Fragment>
              ))}
            </section>
          ))}
        </div>
      )}
      <div className="tv-reveal-foot">
        {crew.length > 0 && (
          <div className={`tv-reveal-crew${complete ? " is-shown" : ""}`} aria-hidden={!complete}
            style={joined >= total && !reducedMotion ? { animation:"none" } : undefined}>
            <span className="tv-label">Event crew</span>
            {crew.map(role => (
              <span key={role.player} className="tv-reveal-crew-item">
                <Avatar state={state} p={role.player} size={48} />
                {disp(state, role.player)}, {overflowRoleMeta(role.role).label}
              </span>
            ))}
          </div>
        )}
        {complete && contest && <div className="tv-reveal-odds"><b>Betting open</b><span>{oddsLine(contest)}</span></div>}
      </div>
    </div>
  );
}
