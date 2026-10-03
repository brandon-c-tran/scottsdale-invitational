/* The commissioner QA console, in the menu system's sections: where the
   rehearsal stands, Step, Bets, Jump to, Lens, Checkpoints, then Reset
   last. Every jump, step, bets action and checkpoint is one server write.
   The slow live driver (real broadcasts, one player at a time) stays as
   Play live. Commissioner and QA capability only. */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../ui/Icon.jsx";
import { ROSTER, allEventsOf, disp } from "../../../shared/core.js";
import { qaCheckpointSummary, qaTargets } from "../../../shared/qa.js";
import { Btn, Sheet, Tag } from "../../ui/controls.jsx";
import { MenuGroup, MenuRow } from "../../ui/Menu.jsx";
import { Avatar } from "../identity/PlayerIdentity.jsx";
import { useCheckpointList, useQaFast } from "./useQaFast.js";
import "./qa.css";

const savedAt = ms => {
  try { return new Date(ms).toLocaleString([], { weekday:"short", hour:"numeric", minute:"2-digit" }); }
  catch { return ""; }
};
const fmt = n => Number(n || 0).toLocaleString("en-US");
const ENV = { local:"Local", staging:"Staging", production:"Production" };

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

/* a section head in the menu system's shape, over free content */
function Part({ icon, title, children, aside = null }) {
  return <section className="fd-menu-section fd-qa-part" aria-label={title}>
    <h3 className="fd-menu-head"><span className="fd-menu-head-glyph" aria-hidden="true"><Icon name={icon} size={18} /></span>
      <span>{title}</span>{aside}</h3>
    {children}
  </section>;
}

const BET_ACTIONS = [
  ["everyone", "Everyone bets"],
  ["favorite", "Back the favorite"],
  ["spread", "Spread evenly"],
  ["clear", "Clear bets"],
];

export function QASheet({ state, status, me, guestLens, busy, environment, dispatch, notify, market = null,
  onSwitch, onLens, onPlayLive, onDuelMe, onDuels, pokerOn, onBustOne, onCountRest,
  onRerun, onReplayMine, onResetRequest, onExit, onClose }) {
  const [confirmRerun, setConfirmRerun] = useState(false);
  const [name, setName] = useState("");
  const qa = useQaFast({ dispatch, environment, notify,
    onDone:type => { if (type === "qaAdvance" || type === "qaRestore" || type === "qaBets") onClose(); } });
  useCheckpointList(qa);
  const events = useMemo(() => allEventsOf(state), [state]);
  const targets = useMemo(() => qaTargets(state, events), [state, events]);
  const here = useMemo(() => qaCheckpointSummary(state, events).label, [state, events]);
  const off = busy || !!qa.pending;
  const finished = status.current === "No active event";

  return (
    <Sheet title="QA" onClose={onClose} className="fd-qa-sheet"
      headerActions={<span className={`fd-qa-badge is-sheet${status.environment === "production" ? " is-production" : ""}`}>
        <Icon name="flask" size={16} lit />{ENV[status.environment] || status.environment}</span>}>
      <QaConfirm qa={qa} />
      <div className="fd-qa-now">
        <div className="fd-qa-now-head">
          <strong>{status.current}</strong>
          <span>{status.phase}</span>
        </div>
        {status.next !== "No pending action" && <div className="fd-qa-now-next"><Icon name="then" size={14} />{status.next}</div>}
        {status.blockers.length > 0 && <div className="fd-qa-now-next is-blocked">{status.blockers.join(", ")}</div>}
        <dl className="fd-qa-stats">
          <div><dt>Events</dt><dd>{status.completed}/{status.total}</dd></div>
          <div><dt>Open bets</dt><dd>{status.pendingWagers}</dd></div>
          <div><dt>Open duels</dt><dd>{status.openDuels}</dd></div>
        </dl>
      </div>

      <Part icon="then" title="Step">
        <div className="fd-qa-actions">
          <Btn kind="primary" compact disabled={off || finished} onClick={() => qa.jump("step", "Contest simmed")}>
            Sim contest</Btn>
          <Btn kind="dark" compact disabled={off || finished} onClick={() => qa.jump("finish", "Event finished")}>
            Finish event</Btn>
          <Btn kind="ghost" compact disabled={off || finished} onClick={onPlayLive}>Play live</Btn>
          {pokerOn && <Btn kind="ghost" compact disabled={off} onClick={onBustOne}>Bust one</Btn>}
          {pokerOn && <Btn kind="ghost" compact disabled={off} onClick={onCountRest}>Count the rest</Btn>}
        </div>
      </Part>

      <Part icon="bets" title="Bets" aside={market
        ? <span className="fd-qa-aside">{market.bets} bet{market.bets === 1 ? "" : "s"}{market.chips ? `, ${fmt(market.chips)}` : ""}</span>
        : <span className="fd-qa-aside">Closed</span>}>
        <div className="fd-qa-bets">
          {BET_ACTIONS.map(([mode, label]) => (
            <button key={mode} type="button" className={`fd-qa-bet${mode === "clear" ? " is-clear" : ""}`}
              disabled={off || !market || (mode === "clear" && !market.bets)} aria-busy={qa.pending === `bets:${mode}` || undefined}
              onClick={() => qa.bets(mode, market)}>{label}</button>
          ))}
        </div>
        <div className="fd-qa-actions">
          <Btn kind="ghost" compact disabled={off} onClick={onDuelMe}>Duel me</Btn>
          <Btn kind="ghost" compact disabled={off} onClick={onDuels}>Duels round</Btn>
        </div>
      </Part>

      <Part icon="events" title="Jump to">
        <div className="fd-qa-list">
          <div className="fd-qa-row">
            <b>{targets.locker.label}</b>
            <button type="button" className={`fd-qa-end${targets.locker.current ? " is-current" : ""}`} disabled={off}
              aria-busy={qa.pending === "locker" || undefined}
              aria-label="Go to the locker room" onClick={() => qa.jump("locker", targets.locker.label)}>Go</button>
          </div>
        </div>
        {targets.sessions.map(session => (
          <div key={session.id || "added"} className="fd-qa-session">
            <div className="fd-qa-session-head">
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
          <div className="fd-qa-session">
            <div className="fd-qa-session-head"><span>Finale</span></div>
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
          </div>
        )}
      </Part>

      <Part icon="person" title="Lens">
        <div className="fd-qa-players" role="group" aria-label="As player">
          {ROSTER.map(player => (
            <button key={player} type="button" disabled={off} aria-pressed={me === player}
              onClick={() => onSwitch(player)}><Avatar state={state} p={player} size={24} />{disp(state, player)}</button>
          ))}
        </div>
        <MenuGroup>
          <MenuRow name="Guest view" pressed={!!guestLens} onClick={onLens} />
          <MenuRow name="Redo check-in here" icon="undo" onClick={onReplayMine} />
        </MenuGroup>
      </Part>

      <Part icon="check" title="Checkpoints">
        <form className="fd-qa-save" onSubmit={event => {
          event.preventDefault();
          qa.save(name).then(result => { if (result?.ok) setName(""); });
        }}>
          <input value={name} maxLength={40} placeholder={here} aria-label="Checkpoint name"
            onChange={event => setName(event.target.value)} disabled={off} />
          <Btn kind="dark" compact type="submit" disabled={off}>Save</Btn>
        </form>
        {(qa.checkpoints === null || qa.checkpoints.length > 0) && <div className="fd-qa-list">
          {qa.checkpoints === null && <div className="fd-qa-empty" aria-busy="true">Loading</div>}
          {(qa.checkpoints || []).map(point => (
            <div key={point.id} className="fd-qa-point">
              <span>
                <b>{point.name}</b>
                <small>{point.summary?.label !== point.name ? `${point.summary?.label}, ` : ""}{savedAt(point.savedAt)}</small>
              </span>
              <Btn kind="dark" compact disabled={off} onClick={() => qa.restore(point)}>Restore</Btn>
              <button type="button" className="fd-qa-x" aria-label={`Delete ${point.name}`} disabled={off}
                onClick={() => qa.remove(point.id)}><Icon name="close" size={18} /></button>
            </div>
          ))}
        </div>}
      </Part>

      <MenuGroup title="Reset" icon="undo">
        {confirmRerun
          ? <MenuRow name="Release every chip color" tone="destructive" chevron={false}
              onClick={() => { setConfirmRerun(false); onRerun(); }} />
          : <MenuRow name="Reopen check-in" chevron={false} onClick={() => setConfirmRerun(true)} />}
        {confirmRerun && <MenuRow name="Keep check-in closed" chevron={false} onClick={() => setConfirmRerun(false)} />}
        <MenuRow name="Reset game progress" tone="destructive" disabled={off} onClick={onResetRequest} />
        {onExit && <MenuRow name="QA mode" pressed onClick={onExit} />}
      </MenuGroup>
    </Sheet>
  );
}
