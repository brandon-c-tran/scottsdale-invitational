/* The commissioner QA console. Jump to any point of the weekend, step the
   current contest, and save or restore checkpoints: each is one server
   write. The slow live driver (real broadcasts, one player at a time) stays
   behind "Play it live". Commissioner and QA capability only. */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ROSTER, allEventsOf } from "../../../shared/core.js";
import { qaCheckpointSummary, qaTargets } from "../../../shared/qa.js";
import { Btn, Sheet, Tag } from "../../ui/controls.jsx";
import { useCheckpointList, useQaFast } from "./useQaFast.js";
import "./qa.css";

const savedAt = ms => {
  try { return new Date(ms).toLocaleString([], { weekday:"short", hour:"numeric", minute:"2-digit" }); }
  catch { return ""; }
};

/* Pinned to the top of the sheet, so the ask is in view from whichever row
   was tapped. */
export function QaConfirm({ qa }) {
  const box = useRef(null);
  useEffect(() => { box.current?.scrollIntoView?.({ block:"nearest" }); }, [qa.prompt]);
  if (!qa.prompt) return null;
  return (
    <div ref={box} className="fd-qa-confirm" role="alert">
      {qa.prompt.production && <Tag tone="flame">production</Tag>}
      <p>{qa.prompt.message}</p>
      <Btn kind="flame" compact onClick={qa.confirm}>{qa.prompt.poker ? "Replace the table" : "Confirm"}</Btn>
      <Btn kind="ghost" compact onClick={qa.cancel}>Cancel</Btn>
    </div>
  );
}

function Segments({ phases, qa, name }) {
  const off = !!qa.pending;
  return (
    <div className="fd-qa-seg">
      {phases.map(phase => (
        <button key={phase.key} type="button" disabled={off} aria-busy={qa.pending === phase.key || undefined}
          aria-label={`${name}: ${phase.label}`}
          className={phase.current ? "is-current" : phase.reached ? "is-reached" : ""}
          onClick={() => qa.jump(phase.key, `${name} · ${phase.label}`)}>{phase.label}</button>
      ))}
    </div>
  );
}

export function QASheet({ state, status, me, guestLens, busy, environment, dispatch, notify,
  onSwitch, onLens, onPlayLive, onBets, onDuelMe, onDuels, pokerOn, onBustOne, onCountRest,
  onRerun, onReplayMine, onResetRequest, onClose }) {
  const [confirmRerun, setConfirmRerun] = useState(false);
  const [name, setName] = useState("");
  const qa = useQaFast({ dispatch, environment, notify,
    onDone:type => { if (type === "qaAdvance" || type === "qaRestore") onClose(); } });
  useCheckpointList(qa);
  const events = useMemo(() => allEventsOf(state), [state]);
  const targets = useMemo(() => qaTargets(state, events), [state, events]);
  const here = useMemo(() => qaCheckpointSummary(state, events).label, [state, events]);
  const off = busy || !!qa.pending;
  const finished = status.current === "No active event";

  return (
    <Sheet title={`QA · ${status.environment}`} onClose={onClose} className="fd-qa-sheet">
      <QaConfirm qa={qa} />
      <div className="fd-qa-stats">
        <div><strong>{status.completed}/{status.total}</strong><span>Events</span></div>
        <div><strong>{status.pendingWagers}</strong><span>Open bets</span></div>
        <div><strong>{status.openDuels}</strong><span>Open duels</span></div>
        <div><strong>{status.profiles}/{ROSTER.length}</strong><span>Profiles</span></div>
      </div>
      <div className="fd-qa-now">
        <strong>{status.current} · {status.phase}</strong>
        <small>Next: {status.next}</small>
        {status.blockers.length > 0 && <small className="is-blocked">Blocked: {status.blockers.join(" · ")}</small>}
      </div>

      <div className="fd-qa-section"><span>This event</span></div>
      <div className="fd-qa-actions">
        <Btn kind="primary" compact disabled={off || finished} onClick={() => qa.jump("step", "Contest simmed")}>
          Sim contest</Btn>
        <Btn kind="dark" compact disabled={off || finished} onClick={() => qa.jump("finish", "Event finished")}>
          Finish event</Btn>
        <Btn kind="ghost" compact disabled={off || finished} onClick={onPlayLive}>Play it live (slow)</Btn>
      </div>
      <div className="fd-qa-actions" style={{ marginTop:8 }}>
        <Btn kind="ghost" compact disabled={off} onClick={onBets}>Add bets</Btn>
        <Btn kind="ghost" compact disabled={off} onClick={onDuelMe}>Duel me</Btn>
        <Btn kind="ghost" compact disabled={off} onClick={onDuels}>Duels round</Btn>
        {pokerOn && <Btn kind="ghost" compact disabled={off} onClick={onBustOne}>Bust one</Btn>}
        {pokerOn && <Btn kind="ghost" compact disabled={off} onClick={onCountRest}>Count the rest</Btn>}
      </div>

      <div className="fd-qa-section"><span>Checkpoints</span></div>
      <form className="fd-qa-save" onSubmit={event => {
        event.preventDefault();
        qa.save(name).then(result => { if (result?.ok) setName(""); });
      }}>
        <input value={name} maxLength={40} placeholder={here} aria-label="Checkpoint name"
          onChange={event => setName(event.target.value)} disabled={off} />
        <Btn kind="dark" compact type="submit" disabled={off}>Save</Btn>
      </form>
      <div className="fd-qa-list">
        {qa.checkpoints === null && <div className="fd-qa-empty">Loading</div>}
        {qa.checkpoints?.length === 0 && <div className="fd-qa-empty">None saved</div>}
        {(qa.checkpoints || []).map(point => (
          <div key={point.id} className="fd-qa-point">
            <span>
              <b>{point.name}</b>
              <small>{[point.summary?.label !== point.name ? point.summary?.label : null,
                `${point.summary?.results ?? 0} results`, savedAt(point.savedAt)].filter(Boolean).join(" · ")}</small>
            </span>
            <Btn kind="dark" compact disabled={off} onClick={() => qa.restore(point)}>Restore</Btn>
            <button type="button" className="fd-qa-x" aria-label={`Delete ${point.name}`} disabled={off}
              onClick={() => qa.remove(point.id)}>✕</button>
          </div>
        ))}
      </div>

      <div className="fd-qa-section"><span>Jump to</span></div>
      <div className="fd-qa-list">
        <div className="fd-qa-row">
          <b>{targets.locker.label}</b>
          <button type="button" className={`fd-qa-end${targets.locker.current ? " is-current" : ""}`} disabled={off}
            aria-busy={qa.pending === "locker" || undefined}
            aria-label="Go to the locker room" onClick={() => qa.jump("locker", targets.locker.label)}>Go</button>
        </div>
      </div>
      {targets.sessions.map(session => (
        <div key={session.id || "added"}>
          <div className="fd-qa-section">
            <span>{session.label}</span>
            {session.key && (
              <button type="button" className={`fd-qa-end${session.reached ? " is-reached" : ""}`} disabled={off}
                aria-busy={qa.pending === session.key || undefined}
                aria-label={`End of ${session.label}`} onClick={() => qa.jump(session.key, `End of ${session.label}`)}>End</button>
            )}
          </div>
          <div className="fd-qa-list">
            {session.events.map(row => (
              <div key={row.id} className="fd-qa-row">
                <b className={row.stage === 3 ? "is-done" : ""}>{row.name}</b>
                <Segments phases={row.phases} qa={qa} name={row.name} />
              </div>
            ))}
          </div>
        </div>
      ))}
      {targets.poker.length > 0 && (
        <>
          <div className="fd-qa-section"><span>Finale</span></div>
          <div className="fd-qa-list">
            <div className="fd-qa-row">
              <b>Poker</b>
              <Segments phases={targets.poker.map(item => ({ ...item,
                label:{ set:"Set", live:"Live", counted:"Counted" }[item.phase] }))} qa={qa} name="Poker" />
            </div>
            <div className="fd-qa-row">
              <b>{targets.crowned.label}</b>
              <button type="button" className={`fd-qa-end${targets.crowned.current ? " is-current" : ""}`}
                disabled={off} aria-busy={qa.pending === "crowned" || undefined}
                aria-label="Go to crowned" onClick={() => qa.jump("crowned", "Champion crowned")}>Go</button>
            </div>
          </div>
        </>
      )}

      <div className="fd-qa-section"><span>View as player</span></div>
      <div className="fd-qa-players">
        {ROSTER.map(player => (
          <button key={player} type="button" disabled={off} aria-pressed={me === player}
            onClick={() => onSwitch(player)}>{player}</button>
        ))}
      </div>
      <div className="fd-qa-actions" style={{ marginTop:8 }}>
        <Btn kind={guestLens ? "primary" : "ghost"} compact onClick={onLens}>
          {guestLens ? "Guest view on" : "Guest view"}</Btn>
        <Btn kind="ghost" compact onClick={onReplayMine}>Redo check-in here</Btn>
      </div>

      <div className="fd-qa-section"><span>All phones</span></div>
      <div className="fd-qa-actions">
        {confirmRerun
          ? <Btn kind="flame" compact onClick={() => { setConfirmRerun(false); onRerun(); }}>
              Confirm, release every chip</Btn>
          : <Btn kind="ghost" compact onClick={() => setConfirmRerun(true)}>Reopen check-in</Btn>}
        {confirmRerun && <Btn kind="ghost" compact onClick={() => setConfirmRerun(false)}>Keep it closed</Btn>}
      </div>
      <p className="fd-qa-note">Reopening check-in releases every claimed chip color. Profiles, photos,
        ratings, shirt sizes, and flights stay saved.</p>

      <div className="fd-qa-section" style={{ color:"var(--clay-text)" }}><span>Danger zone</span></div>
      <div className="fd-qa-danger">
        <b>Reset game progress</b>
        <p>Clears the rehearsal and keeps people, travel, ratings, and the event setup.</p>
        <Btn kind="danger" compact disabled={off} onClick={onResetRequest}>Review reset</Btn>
      </div>
    </Sheet>
  );
}
