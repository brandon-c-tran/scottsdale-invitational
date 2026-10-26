/* The commissioner QA console, in the menu system's sections, in the order
   a rehearsal runs: where it stands, Watch it play (Sim players: the room
   plays itself on a human clock, worker/tournament.js and shared/qaSim.js),
   Play solo (Trivia or Where and When started for your own player alone,
   worker/qa.js playSolo), Step (one-shot steps, and Play live: the slow
   driver on this phone, real broadcasts one player at a time), Jump to (one event picker and its
   Open / Mid / Done, then one picker of the milestones), Bets and duels,
   Test a moment (one shape, one bit or Random, one Play: worker qaGag),
   Checkpoints (with the dock strip's switch), Lens, then Reset last. Reset
   game progress lives in the commissioner menu's Setup, its one entry.
   Every jump, step, bets action, moment and checkpoint is one server write.
   Commissioner and QA capability only. */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../ui/Icon.jsx";
import { rosterOf, allEventsOf, disp } from "../../../shared/core.js";
import { qaCheckpointSummary, qaSoloTargets, qaTargets } from "../../../shared/qa.js";
import { qaSimOf, simPlayers } from "../../../shared/qaSim.js";
import { GAG_SHAPES } from "../../../shared/gags.js";
import { karaokeLive, karaokeTurn } from "../../../shared/karaoke.js";
import { bitsOf, isTeamBit } from "../gags/bits/registry.js";
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

/* Which karaoke sim the room is waiting on: "songs" in the pick window,
   "votes" once the current singer's song has started and until their vote
   closes, else null. */
export function karaokeQaStep(state) {
  const game = state?.karaoke;
  if (!karaokeLive(state)) return null;
  if (game.phase === "pick") return "songs";
  const turn = game.phase === "turns" ? karaokeTurn(game) : null;
  return turn && Number.isFinite(turn.songAt) && !turn.closedAt && !turn.skipped ? "votes" : null;
}

const BET_ACTIONS = [
  ["everyone", "Everyone bets"],
  ["favorite", "Back the favorite"],
  ["spread", "Spread evenly"],
  ["clear", "Clear bets"],
];

/* The moments a QA test can play, by what happened: each shape's solo
   bits, and its team bits (a side of 3 or more) as their own choice when
   the registry has any. Random on a solo moment lets the TVs pick (the
   server's { shape }); a team moment has no server Random, so this phone
   picks one of its bits. */
const SHAPE_NAMES = { versus:"Upset", win:"Win", loss:"Loss" };
export const MOMENTS = GAG_SHAPES.flatMap(shape => {
  const all = bitsOf(shape);
  const solo = all.filter(bit => !isTeamBit(bit));
  const team = all.filter(isTeamBit);
  const name = SHAPE_NAMES[shape] || shape;
  return [
    solo.length && { key:shape, shape, name, team:false, bits:solo.map(bit => ({ id:bit.id, name:bit.name })) },
    team.length && { key:`${shape}:team`, shape, name:`Team ${name.toLowerCase()}`, team:true,
      bits:team.map(bit => ({ id:bit.id, name:bit.name })) },
  ].filter(Boolean);
});
export function momentPayload(moment, bitId = "", random = Math.random) {
  if (!moment) return null;
  if (bitId && moment.bits.some(bit => bit.id === bitId)) return { bit:bitId };
  if (!moment.team) return { shape:moment.shape };
  return { bit:moment.bits[Math.floor(random() * moment.bits.length) % moment.bits.length].id };
}

/* where the jump picker opens: the event the board is at, else the next
   one not done, else the last */
function defaultEvent(rows) {
  return (rows.find(row => row.phases.some(phase => phase.current))
    || rows.find(row => row.stage < 3) || rows.at(-1))?.id || "";
}

export function QASheet({ state, status, me, guestLens, busy, environment, dispatch, notify, market = null,
  onSwitch, onLens, onPlayLive, onDuelMe, onDuels, pokerOn, onBustOne, onCountRest,
  onRerun, onReplayMine, qaOn = false, onStrip, onBack, onClose, float = false }) {
  const [confirmRerun, setConfirmRerun] = useState(false);
  const [name, setName] = useState("");
  const [momentKey, setMomentKey] = useState(MOMENTS[0]?.key || "");
  const [bitId, setBitId] = useState("");
  const [momentBusy, setMomentBusy] = useState(false);
  const [pickedEvent, setPickedEvent] = useState("");
  const [pickedMark, setPickedMark] = useState("");
  const moment = MOMENTS.find(item => item.key === momentKey) || MOMENTS[0];
  const playMoment = () => {
    const payload = momentPayload(moment, bitId);
    if (momentBusy || !payload) return;
    setMomentBusy(true);
    Promise.resolve(dispatch("qaGag", payload))
      .then(result => notify?.(result?.ok ? "On the TV" : result?.error || "Not saved"), () => notify?.("Not saved"))
      .finally(() => setMomentBusy(false));
  };
  const qa = useQaFast({ dispatch, environment, notify,
    onDone:type => { if (type === "qaAdvance" || type === "qaRestore" || type === "qaBets") onClose(); } });
  useCheckpointList(qa);
  const events = useMemo(() => allEventsOf(state), [state]);
  const targets = useMemo(() => qaTargets(state, events), [state, events]);
  const solos = useMemo(() => qaSoloTargets(state, events, { float }), [state, events, float]);
  const here = useMemo(() => qaCheckpointSummary(state, events).label, [state, events]);
  const rows = useMemo(() => targets.sessions.flatMap(session => session.events), [targets]);
  const eventId = rows.some(row => row.id === pickedEvent) ? pickedEvent : defaultEvent(rows);
  const eventRow = rows.find(row => row.id === eventId) || null;
  /* the milestones: the locker room, each session's end, the poker table's stages, crowned */
  const marks = useMemo(() => [
    { key:"locker", label:targets.locker.label, done:targets.locker.label },
    ...targets.sessions.filter(session => session.key)
      .map(session => ({ key:session.key, label:`End of ${session.label}`, done:`End of ${session.label}`, reached:session.reached })),
    ...targets.poker.map(item => ({ key:item.key, label:`Poker ${{ set:"set", live:"live", counted:"counted" }[item.phase]}`,
      done:item.label, reached:item.reached, finale:true })),
    ...(targets.poker.length ? [{ key:"crowned", label:targets.crowned.label, done:"Champion crowned",
      reached:targets.crowned.reached, finale:true }] : []),
  ], [targets]);
  const mark = marks.find(item => item.key === pickedMark) || marks.find(item => item.key !== "locker" && !item.reached) || marks[0];
  const off = busy || !!qa.pending;
  const finished = status.current === "No active event";
  const simOn = !!qaSimOf(state);
  const simCount = useMemo(() => simPlayers(state).length, [state]);
  const nightOn = simOn && !!state.qaSim?.night;
  /* karaoke's room: its songs in the pick window, its votes once a song has started */
  const karaokeSim = karaokeQaStep(state);

  return (
    <Sheet title="QA" onClose={onClose} onBack={onBack} className="fd-qa-sheet"
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

      <Part icon="play" title="Watch it play" aside={simOn
        ? <span className="fd-qa-aside fd-qa-sim-lamp"><span className="fd-qa-pulse" aria-hidden="true" />{simCount} playing</span>
        : null}>
        <div className="fd-qa-sim">
          <MenuGroup>
            <MenuRow name="Sim players" pressed={simOn} disabled={off} onClick={() => qa.sim(!simOn)} />
            {simOn && <MenuRow name="Include me" pressed={!!state.qaSim?.includeMe} disabled={off}
              onClick={() => qa.sim(true, { includeMe:!state.qaSim?.includeMe })} />}
            <MenuRow name="Run the night" pressed={nightOn} disabled={off}
              onClick={() => qa.sim(true, { night:!nightOn })} />
          </MenuGroup>
        </div>
      </Part>

      {solos.length > 0 && <Part icon="person" title="Play solo">
        <MenuGroup>
          {solos.map(item => <MenuRow key={item.key} name={item.label}
            value={item.ready ? null : item.game === "where" ? "No photos" : "No questions"}
            disabled={off || !item.ready}
            onClick={() => qa.jump(item.key, `${item.label}: you alone`)} />)}
        </MenuGroup>
      </Part>}

      <Part icon="then" title="Step">
        <div className="fd-qa-actions">
          <Btn kind="primary" compact disabled={off || finished} onClick={() => qa.jump("step", "Contest simmed")}>
            Sim contest</Btn>
          <Btn kind="dark" compact disabled={off || finished} onClick={() => qa.jump("finish", "Event finished")}>
            Finish event</Btn>
          <Btn kind="ghost" compact disabled={off || finished} onClick={onPlayLive}>Play live</Btn>
          {/* Trivia: every team that has not locked answers (worker/trivia.js triviaSimAnswers) */}
          {state.trivia?.phase === "question" && !state.results?.[state.trivia.eventId] && state.trivia.questions?.[state.trivia.index]
            && <Btn kind="ghost" compact disabled={off} onClick={() => dispatch("triviaSimAnswers",
              { questionId:state.trivia.questions[state.trivia.index].id }).then(result => notify?.(result?.ok ? "Answers in" : result?.error || "Not saved"))}>
              Sim answers</Btn>}
          {/* the Trivia board: the room's next moves, never yours (worker/triviaBoard.js boardSim) */}
          {state.trivia?.format === "board" && !state.trivia.finishedAt && !state.results?.[state.trivia.eventId]
            && <Btn kind="ghost" compact disabled={off} onClick={() => dispatch("boardSim", {})
              .then(result => notify?.(result?.ok ? "Moves in" : result?.error || "Not saved"))}>Sim board</Btn>}
          {/* Karaoke: practice songs in the game for anyone without one, everyone
              locked in; then the room's votes on the singer (worker/karaoke.js) */}
          {karaokeSim === "songs" && <Btn kind="ghost" compact disabled={off} onClick={() => dispatch("karaokeSimSongs",
            { gameId:state.karaoke.id }).then(result => notify?.(result?.ok ? "Songs in" : result?.error || "Not saved"))}>
            Sim songs</Btn>}
          {karaokeSim === "votes" && <Btn kind="ghost" compact disabled={off} onClick={() => dispatch("karaokeSimVotes",
            { gameId:state.karaoke.id, index:state.karaoke.index }).then(result => notify?.(result?.ok ? "Votes in" : result?.error || "Not saved"))}>
            Sim votes</Btn>}
          {pokerOn && <Btn kind="ghost" compact disabled={off} onClick={onBustOne}>Bust one</Btn>}
          {pokerOn && <Btn kind="ghost" compact disabled={off} onClick={onCountRest}>Count the rest</Btn>}
        </div>
      </Part>

      <Part icon="events" title="Jump to">
        {eventRow && <div className="fd-qa-pick">
          <select className="fd-qa-select" value={eventId} disabled={off} aria-label="Event"
            onChange={event => setPickedEvent(event.target.value)}>
            {targets.sessions.map(session => (
              <optgroup key={session.id || "added"} label={session.label}>
                {session.events.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
              </optgroup>
            ))}
          </select>
          <Segments phases={eventRow.phases} qa={qa} name={eventRow.name} />
        </div>}
        <div className="fd-qa-pick">
          <select className="fd-qa-select" value={mark.key} disabled={off} aria-label="Milestone"
            onChange={event => setPickedMark(event.target.value)}>
            {marks.filter(item => !item.finale).map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
            {marks.some(item => item.finale) && <optgroup label="Finale">
              {marks.filter(item => item.finale).map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
            </optgroup>}
          </select>
          <button type="button" className="fd-qa-end" disabled={off} aria-busy={qa.pending === mark.key || undefined}
            aria-label={`Go to ${mark.label}`} onClick={() => qa.jump(mark.key, mark.done)}>Go</button>
        </div>
      </Part>

      <Part icon="bets" title="Bets and duels" aside={market
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

      {moment && <Part icon="tv" title="Test a moment">
        <div className="fd-qa-pick fd-qa-moment">
          <select className="fd-qa-select" value={moment.key} disabled={off || momentBusy} aria-label="Moment"
            onChange={event => { setMomentKey(event.target.value); setBitId(""); }}>
            {MOMENTS.map(item => <option key={item.key} value={item.key}>{item.name}</option>)}
          </select>
          <select className="fd-qa-select" value={bitId} disabled={off || momentBusy} aria-label="Bit"
            onChange={event => setBitId(event.target.value)}>
            <option value="">Random</option>
            {moment.bits.map(bit => <option key={bit.id} value={bit.id}>{bit.name}</option>)}
          </select>
          <Btn kind="primary" compact disabled={off || momentBusy} onClick={playMoment}>Play</Btn>
        </div>
      </Part>}

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
        {onStrip && <div className="fd-qa-strip-switch">
          <MenuGroup><MenuRow name="QA strip" pressed={!!qaOn} onClick={onStrip} /></MenuGroup>
        </div>}
      </Part>

      <Part icon="person" title="Lens">
        <div className="fd-qa-players" role="group" aria-label="As player">
          {rosterOf(state).map(player => (
            <button key={player} type="button" disabled={off} aria-pressed={me === player}
              onClick={() => onSwitch(player)}><Avatar state={state} p={player} size={24} />{disp(state, player)}</button>
          ))}
        </div>
        <MenuGroup>
          <MenuRow name="Guest view" pressed={!!guestLens} onClick={onLens} />
          <MenuRow name="Redo check-in here" icon="undo" onClick={onReplayMine} />
        </MenuGroup>
      </Part>

      <MenuGroup title="Reset" icon="undo">
        {confirmRerun
          ? <MenuRow name="Release every chip color" tone="destructive" chevron={false}
              onClick={() => { setConfirmRerun(false); onRerun(); }} />
          : <MenuRow name="Reopen check-in" chevron={false} onClick={() => setConfirmRerun(true)} />}
        {confirmRerun && <MenuRow name="Keep check-in closed" chevron={false} onClick={() => setConfirmRerun(false)} />}
      </MenuGroup>
    </Sheet>
  );
}
