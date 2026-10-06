import React, { useEffect, useRef, useState } from "react";
import { disp } from "../../../shared/core.js";
import { Avatar } from "../identity/PlayerIdentity.jsx";
import { lastWinnerUndo } from "./directorPill.js";
import { tapTick } from "../../lib/haptics.js";
import { RunOfShowPanel, useHold } from "./RunOfShow.jsx";
import { playSound } from "../../lib/sound.js";
import "./director.css";
import { Icon } from "../../ui/Icon.jsx";
import { serverNow } from "../../lib/serverClock.js";
import { useReducedMotion } from "../../lib/motion.js";
import { writeError, writeUncertain } from "../../lib/writeErrors.js";

/* A recorded winner can be taken back with one tap for this long. The
   server allows the take-back until the next contest moves (shared/show.js
   postedFinalUndo, contestUndoAvailability); the pill offers it this long. */
export const UNDO_WINDOW_MS = 10000;
/* A lock with no bets in waits quiet this long after betting opens (still
   one tap), so a reflexive tap after a winner does not close an empty
   market; the first bet, or the wait running out, lights it. */
export const ZERO_BET_WAIT_MS = 30000;
/* a side's faces on the pill: up to four card targets, then one "+N" that
   opens the event, where every card is (a 7 v 6 never wraps the dock) */
const PILL_FACES = 4;

/* The pill's more button: the tray above the pill holds the run of show
   (Now, Next, Then), the beat's alternatives (Random draw, Captains draft,
   Open event...) and, last, its edge cases (Skip). A tray that holds
   actions says so on the button itself: a chevron pointing up at where the
   tray opens, over the count of its actions. A tray of only the run of
   show keeps the plain more glyph. A hold on the pill opens it too. */
export function PillMore({ open, onToggle, actions = false, count = 0, disabled = false }) {
  const shown = actions ? Math.max(1, count) : 0;
  return <button type="button" data-pill-more className={`fd-pill-more${open ? " is-open" : ""}${actions ? " has-actions" : ""}`}
    aria-expanded={open} aria-label={shown ? `More, ${shown} action${shown === 1 ? "" : "s"}` : "More"} disabled={disabled} onClick={onToggle}>
    {shown ? <span className="fd-pill-more-peek" aria-hidden="true">
        <Icon name={open ? "down" : "up"} size={16} /><b>{shown}</b></span>
      : <Icon name="more" size={20} />}
  </button>;
}

function PillTray({ model, state, events, director, showControl, pending, onPick }) {
  const alts = model.extras.filter(extra => extra.kind !== "skip");
  const edges = model.extras.filter(extra => extra.kind === "skip");
  const row = (extra, edge) => <button type="button" key={extra.label} disabled={pending}
    className={`fd-pill-tray-row${edge ? " is-edge" : ""}`} onClick={() => onPick(extra.run)}>
    {edge && <Icon name="skip" size={16} />}
    <span>{extra.label}</span>
    {!edge && <Icon name="next" size={16} />}
  </button>;
  return <section className="fd-pill-tray" aria-label="More">
    <RunOfShowPanel state={state} events={events} director={director} showControl={showControl} embedded />
    {!!alts.length && <div className="fd-pill-tray-group">{alts.map(extra => row(extra, false))}</div>}
    {!!edges.length && <div className="fd-pill-tray-group is-edge">{edges.map(extra => row(extra, true))}</div>}
  </section>;
}

/* The autopilot's wait on the beat it will take by itself: a live lamp
   draining along the pill's foot, on the server clock, so a glance says
   how long until the room moves on. A tap still takes the beat now. */
function AutoDrain({ auto, tone = "auto" }) {
  const reduced = useReducedMotion();
  const seen = useRef({ key:null, at:0 });
  if (!auto) return null;
  const now = serverNow();
  if (seen.current.key !== auto.key) seen.current = { key:auto.key, at:now };
  const from = Number.isFinite(auto.from) ? auto.from : seen.current.at;
  const total = Math.max(1000, auto.at - from);
  const left = Math.min(total, Math.max(0, auto.at - now));
  return <span key={auto.key} aria-hidden="true" className={`fd-director-auto${tone === "bets" ? " is-bets" : ""}${reduced ? " is-still" : ""}`}
    style={{ "--auto-total":`${total}ms`, "--auto-elapsed":`${left - total}ms`, "--auto-left":(left / total).toFixed(3) }} />;
}

/* The winner just recorded: their faces and name with WON stamped on as the
   write lands, and Undo beside it while the window drains along the foot. */
function RecentWinner({ state, recent, pending, onUndo }) {
  const reduced = useReducedMotion();
  const left = Math.max(0, recent.at + UNDO_WINDOW_MS - Date.now());
  return <div className={`fd-director-recent${reduced ? " is-still" : ""}`} role="status">
    {recent.players?.length > 0 && <span className="fd-director-recent-faces" aria-hidden="true">
      {recent.players.slice(0, 3).map(player => <Avatar key={player} state={state} p={player} size={32} />)}</span>}
    <span className="fd-director-recent-name">{recent.name}</span>
    <b className="fd-director-stamp">Won</b>
    <button type="button" disabled={pending} onClick={onUndo}>
      <Icon name="undo" size={16} />{pending ? "Undoing" : "Undo"}</button>
    <span className="fd-director-recent-drain" aria-hidden="true"
      style={{ "--undo-total":`${UNDO_WINDOW_MS}ms`, "--undo-elapsed":`${left - UNDO_WINDOW_MS}ms` }} />
  </div>;
}

/* One side of the match being played, framed as one unit: its faces (each
   opens that player's card, never records anything) over one filled
   winner button lettered with the side's name. The two frames are equal
   (a matchup is symmetric) and stand apart across VS; the gap and the
   frame around the faces are inert, so a stray tap there does nothing. */
function WinnerSide({ state, side, index, pending, picking, onPick, onPlayer, onMore }) {
  const shown = side.players.length > PILL_FACES ? side.players.slice(0, PILL_FACES - 1) : side.players;
  const more = side.players.length - shown.length;
  return <div className={`fd-director-side is-${index ? "b" : "a"}${picking ? " is-picking" : ""}`}>
    <div className="fd-director-faces">
      {shown.map(player => <button type="button" key={player}
        aria-label={`View ${disp(state, player)}'s player card`} disabled={!onPlayer}
        onClick={() => onPlayer?.(player)}><Avatar state={state} p={player} size={34} /></button>)}
      {more > 0 && <button type="button" className="fd-director-faces-more" disabled={!onMore}
        aria-label={`${side.name}: all ${side.players.length} players`} onClick={onMore}>+{more}</button>}
    </div>
    <button type="button" className="fd-director-pick" disabled={pending}
      aria-label={`Winner: ${side.name}`} onClick={onPick}>
      <span className="fd-director-pick-name">{side.name}</span>
      {/* the cup says what a tap does; "Won" is the stamp after it lands */}
      <span className="fd-director-pick-verb">{picking ? "Saving" : <Icon name="trophy" size={18} />}</span>
    </button>
  </div>;
}

/* The commissioner's next step: exactly one primary action. The label is
   the verb, the lines say what it acts on, and both wrap instead of
   truncating. A match being played shows its two sides as the winner
   targets; faces beside them open player cards. Everything else the beat
   allows waits in the more tray. Writes wait for acknowledgement and go
   through onWrite, which owns the weekend-start confirm. */
export function DirectorPill({ model, state, events, onWrite, onOpen, onPlayer, director = null, showControl = false, health = null,
  audio = null }) {
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const [recent, setRecent] = useState(null), [picking, setPicking] = useState(null);
  const busy = useRef(false);
  /* D5: a hold on the pill, or the more button, opens the tray */
  const [trayOpen, setTrayOpen] = useState(false);
  const hold = useHold(() => setTrayOpen(true));
  useEffect(() => {
    if (!recent) return undefined;
    const timer = setTimeout(() => setRecent(null), Math.max(0, recent.at + UNDO_WINDOW_MS - Date.now()));
    return () => clearTimeout(timer);
  }, [recent]);
  /* a new beat closes the tray: its actions belonged to the last one */
  const beatKey = model ? `${model.type}:${model.evId || ""}:${model.label}` : "";
  useEffect(() => { setTrayOpen(false); }, [beatKey]);
  const ev = recent ? (events || []).find(item => item.id === recent.evId) : null;
  const undo = recent && ev ? lastWinnerUndo(state, ev) : null;
  /* an empty market's lock stays quiet until a bet lands or the wait ends */
  const [, setTick] = useState(0);
  const quietUntil = model?.bets === 0 && model.openedAt ? model.openedAt + ZERO_BET_WAIT_MS : 0;
  useEffect(() => {
    const wait = quietUntil - serverNow();
    if (!quietUntil || wait <= 0) return undefined;
    const timer = setTimeout(() => setTick(n => n + 1), wait + 50);
    return () => clearTimeout(timer);
  }, [quietUntil]);
  /* while the last winner can still be taken back, the next beat waits
     under it, unlit and untappable: Undo is the one live control */
  const waiting = !!(recent && undo?.enabled);
  /* an empty market's lock: the pill solid and tappable, its verb unlit, an
     amber lamp draining along its foot toward the moment it lights. The
     drain is the room's wait for bets, never the autopilot's magenta */
  const quiet = !waiting && quietUntil > serverNow();
  const betWait = quiet && !model?.auto ? { key:`bets:${model.openedAt}`, from:model.openedAt, at:quietUntil } : null;
  /* the TV's state rides in the pill as one more line; alone, it is the dock */
  /* the win song's control (CueRack pill): one slot in the pill's row */
  const song = audio ? <span className="fd-director-song">{audio}</span> : null;
  if (!model && !(undo?.enabled)) return health || audio ? <div className="fd-director is-health-only">{song}{health}</div> : null;

  const write = async (run, key = null) => {
    if (busy.current) return undefined;
    busy.current = true; setPending(true); setPicking(key); setError("");
    try {
      let result = await onWrite(run.write, run.payload);
      /* sent but unanswered: it may have landed. Hold the pill (no second
         tap) and say so until the next state settles it */
      if (writeUncertain(result)) {
        setError(writeError(result));
        result = await Promise.resolve(result.settled).catch(() => null) || result;
        if (result?.ok === true) setError("");
      }
      /* A7: saved on the server's acknowledgement, not on the tap */
      if (result?.ok !== true) {
        /* a declined weekend-start confirm is not a failure */
        if (result?.extra?.needsStartConfirm) return result;
        playSound("S26", { bus:"gm" });
        setError(writeError(result)); return result;
      }
      playSound("S25", { bus:"gm" });
      if (run.recorded) setRecent({ name:run.recorded, players:run.recordedPlayers || [], evId:run.payload.evId,
        at:Date.now(), posted:!!result.extra?.posted });
      return result;
    } catch (failure) {
      playSound("S26", { bus:"gm" });
      const message = writeError(failure);
      setError(message);
      return { ok:false, error:message };
    } finally { busy.current = false; setPending(false); setPicking(null); }
  };
  const perform = (run, key = null) => {
    if (!run || busy.current) return undefined;
    setTrayOpen(false);
    return run.write ? write(run, key) : onOpen?.(run);
  };
  const takeBack = () => write({ write:"undoLastContest",
    payload:{ evId:recent.evId, contestId:undo.contestId, contestRevision:undo.contestRevision } })
    .then(result => { if (result?.ok) setRecent(null); return result; });

  const more = model && <PillMore open={trayOpen} actions={model.extras.length > 0} count={model.extras.length}
    onToggle={() => setTrayOpen(open => !open)} />;
  return <div className="fd-director" aria-busy={pending || undefined}>
    {undo?.enabled && <RecentWinner state={state} recent={recent} pending={pending} onUndo={takeBack} />}
    {error && <p className="fd-director-error" role="alert">{error}</p>}
    {model && trayOpen && <PillTray model={model} state={state} events={events} director={director}
      showControl={showControl} pending={pending} onPick={perform} />}
    {model && (model.sides
      ? <section className="fd-director-card" aria-label={`${model.label}. ${model.lines.join(". ")}`}>
          <div className="fd-director-headrow">
            <div className="fd-director-head" {...hold.bind}><strong>{model.label}</strong>
              {model.lines.map(line => <span key={line}>{line}</span>)}{health}</div>
            {song}{more}
          </div>
          {/* a matchup faces itself across VS; a heat's field of three or
              more stands as tiles, up to four across, one tap a winner */}
          <div className={`fd-director-sides${model.sides.length > 2 ? ` is-field is-cols-${Math.min(4, model.sides.length > 4 ? 3 : model.sides.length)}` : ""}`}>
            {model.sides.flatMap((side, index) => [
              index > 0 && model.sides.length === 2 && <span key="vs" className="fd-director-vs" aria-hidden="true">vs</span>,
              <WinnerSide key={String(side.key)} state={state} side={side} index={index} pending={pending || waiting}
                picking={picking === side.key} onPlayer={onPlayer}
                onMore={model.evId && onOpen ? () => perform({ open:"event", evId:model.evId }) : null}
                onPick={() => { if (side.run && !busy.current) tapTick(); return perform(side.run, side.key); }} />,
            ].filter(Boolean))}
          </div>
        </section>
      : <div className="fd-director-row">{more}{song}<button type="button"
          className={`fd-director-pill${model.blocked ? " is-blocked" : ""}${model.auto ? " is-auto" : ""}${model.held ? " is-held" : ""}${quiet ? " is-quiet" : ""}${waiting ? " is-waiting" : ""}`}
          disabled={pending || waiting} {...hold.bind} onClick={() => hold.consume() ? undefined : perform(model.run)}>
          <AutoDrain auto={model.auto} />
          <AutoDrain auto={betWait} tone="bets" />
          <span className="fd-director-text">
            {/* the verb, and the bets riding on a lock drawn beside it, so
                the lines under it keep the pill's whole width */}
            <span className="fd-director-labelrow">
              <span className="fd-director-label">{model.held && <Icon name="pause" size={14} />}{model.label}</span>
              {/* the bets lamp: lit with its count once chips are in; at
                  none, the chip alone and unlit, never a "0" */}
              {model.bets !== null && model.bets !== undefined && <span className={`fd-director-bets${model.bets ? "" : " is-empty"}`}
                aria-label={model.bets ? `${model.bets} bet${model.bets === 1 ? "" : "s"} in` : "No bets in"}>
                <Icon name="bets" size={16} />{model.bets ? model.bets : null}</span>}
            </span>
            {model.lines.map(line => <span className="fd-director-note" key={line}>{line}</span>)}
            {health}
          </span>
          <span className="fd-director-chevron" aria-hidden="true"><Icon name="next" size={20} /></span>
        </button></div>)}
  </div>;
}
