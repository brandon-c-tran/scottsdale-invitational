import React, { useEffect, useRef, useState } from "react";
import { disp, overflowRoleMeta, resolveCurrentContest } from "../../../shared/core.js";
import { Avatar } from "../identity/PlayerIdentity.jsx";
import { EventName } from "../../ui/OneSafe.jsx";
import { PayoutLadder } from "../../ui/PayoutLadder.jsx";
import { GlassArt } from "../../ui/GlassArt.jsx";
import { drawStepAt, drawSequenceMs, revealTimeline, startDrawPlayback } from "../weekend/drawReveal.js";
import { DRAW_TV, drawLayout, tvDrawGroups } from "./drawLayout.js";
import "./tv-moments.css";
import "./tv-draw.css";
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

/* One side or entry of a draw card as the room reads it: its faces and its
   name, all on the card's one beat (the card turns, they are there). A card
   that has not turned holds the same places as unlit seats and blank
   plates, so nothing moves when it turns and nothing of it shows early. */
function DrawLine({ state, line, face, covered = false }) {
  const people = line.avatars || [];
  if (covered) return (
    <div className="tv-draw-line is-covered" aria-hidden="true">
      <div className="tv-draw-faces">{people.map((_, i) => <i key={i} className="tv-draw-seat" />)}</div>
      <div className="tv-draw-text">
        <i className="tv-draw-plate" />
        {line.members && <i className="tv-draw-plate is-small" />}
      </div>
    </div>
  );
  return (
    <div className="tv-draw-line">
      <div className="tv-draw-faces">
        {people.map(p => <span key={p} className="tv-draw-face" data-player={p}><Avatar state={state} p={p} size={face} /></span>)}
      </div>
      <div className="tv-draw-text">
        <div className="fd-show tv-draw-name"><EventName name={line.text} /></div>
        {line.members && <div className="tv-draw-members">{line.members}</div>}
      </div>
    </div>
  );
}

function DrawCard({ state, group, card, box, index, shown, settled }) {
  const covered = !shown;
  const lines = group.lines.map((line, j) => group.bye
    ? <div key={j} className="tv-draw-tile"><DrawLine state={state} line={line} face={card.face} covered={covered} /></div>
    : <React.Fragment key={j}>
        {group.vs && j > 0 && <div className="tv-draw-vs"><span>vs</span></div>}
        <DrawLine state={state} line={line} face={card.face} covered={covered} />
      </React.Fragment>);
  return (
    <section className={`tv-draw-card is-${card.kind || "team"} is-${card.mode}${shown ? " is-shown" : " is-covered"}${settled ? " is-settled" : ""}`}
      aria-hidden={covered} data-card={index}
      style={{ left:box.x, top:box.y, width:box.w, height:box.h, "--face":`${card.face}px`, "--name":`${card.name}px`,
        "--card-index":index, "--tiles":card.tileCols || 1 }}>
      {group.title && <h3 className="fd-show tv-draw-title">
        {/* a team's own name stays covered with its people */}
        {covered && group.team ? <i className="tv-draw-plate" /> : <EventName name={group.title} />}
      </h3>}
      <div className={group.bye ? "tv-draw-tiles" : "tv-draw-body"}>{lines}</div>
    </section>
  );
}

/* The draw at canvas scale, the game intro's next beat: the same painting
   behind the dimmed glass, the event's name where the intro docked it, the
   frame's lamps in the session's lamp (TVMode), and the cards standing on
   the glass, lit but unturned, centered and balanced for any count
   (drawLayout). Each card turns over as one unit on the room's clock (the
   server's announcement stamp, the same timeline every phone reads), then
   the crew as the last step, exactly as the phones count it. A TV that
   joins late starts at the current step with the turned cards as they lie.
   Reduced motion shows the whole draw at once. Presentation only: it reads
   the saved draw. */
const TV_REVEAL_LATE_HOLD_MS = 2500;
export function TVDrawReveal({ state, events = [], reveal, reducedMotion = false, onDone = null, now:clockNow = serverNow }) {
  const groups = tvDrawGroups(state, reveal);
  const layout = drawLayout(reveal, groups);
  const crew = reveal.crew || [];
  const total = groups.length + (crew.length ? 1 : 0);
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
  const ev = events.find(item => item.id === reveal.evId);
  const contest = ev && state.onDeck === ev.id ? resolveCurrentContest(state, ev) : null;
  /* the intro just handed over: the glass comes back up from its veil and
     the unturned cards stand; a TV that joined later shows them as they lie */
  const fresh = joined === 0 && !reducedMotion;
  const versus = layout.kind === "versus";
  const first = layout.boxes[0];
  return (
    <div className={`tv-reveal fd-night${fresh ? " is-fresh" : ""}${reducedMotion ? " is-still" : ""}`} role="status" aria-live="polite"
      aria-label={`${reveal.title}: ${reveal.subtitle}`}>
      <div className="tv-reveal-paint" aria-hidden="true"><GlassArt clear={{ from:.22, to:.78 }} /></div>
      <i className="tv-reveal-veil" aria-hidden="true" />
      <h2 className="fd-show is-marquee fd-glass-letter tv-reveal-name"><EventName name={reveal.subtitle} /></h2>
      {groups.map((group, index) => (
        <DrawCard key={index} state={state} group={group} card={layout.cards[index]} box={layout.boxes[index]} index={index}
          shown={index < shown} settled={index < joined || reducedMotion} />
      ))}
      {versus && first && <div className="tv-vs tv-reveal-vs"
        aria-hidden="true" style={{ left:first.x + first.w + DRAW_TV.gap, top:first.y + Math.round((layout.cardH - DRAW_TV.vsBadge) / 2) }}>VS</div>}
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
        {complete && contest && <div className="tv-reveal-odds">
          <span className="tv-status is-pending"><i className="fd-insert is-pending" />Betting open</span>
          <span>{oddsLine(contest)}</span>
        </div>}
      </div>
    </div>
  );
}
