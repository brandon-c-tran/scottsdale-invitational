import React, { useEffect, useRef, useState } from "react";
import { disp } from "../../../shared/core.js";
import { Avatar } from "../identity/PlayerIdentity.jsx";
import { lastWinnerUndo } from "./directorPill.js";
import { tapTick } from "../../lib/haptics.js";
import { RunOfShowPanel, useHold } from "./RunOfShow.jsx";
import { playSound } from "../../lib/sound.js";
import "./director.css";
import { Icon } from "../../ui/Icon.jsx";

/* A recorded winner can be taken back with one tap for this long. */
const UNDO_WINDOW_MS = 5000;

/* The pill's more button: the tray above the pill holds the run of show
   (Now, Next, Then), the beat's alternatives (Random draw, Change crew,
   Open event...) and, last, its edge cases (Skip). A dot marks a tray that
   holds actions. A hold on the pill opens it too. */
export function PillMore({ open, onToggle, actions = false, disabled = false }) {
  return <button type="button" data-pill-more className={`fd-pill-more${open ? " is-open" : ""}${actions ? " has-actions" : ""}`}
    aria-expanded={open} aria-label="More" disabled={disabled} onClick={onToggle}>
    <Icon name="more" size={20} />
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

/* The commissioner's next step: exactly one primary action. The label is
   the verb, the lines say what it acts on, and both wrap instead of
   truncating. A match being played shows its two sides as the winner
   targets; faces beside them open player cards. Everything else the beat
   allows waits in the more tray. Writes wait for acknowledgement and go
   through onWrite, which owns the weekend-start confirm. */
export function DirectorPill({ model, state, events, onWrite, onOpen, onPlayer, director = null, showControl = false, health = null,
  audio = null }) {
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const [recent, setRecent] = useState(null);
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
  /* the TV's state rides in the pill as one more line; alone, it is the dock */
  /* the win song's control (CueRack pill): one slot in the pill's row */
  const song = audio ? <span className="fd-director-song">{audio}</span> : null;
  if (!model && !(undo?.enabled)) return health || audio ? <div className="fd-director is-health-only">{song}{health}</div> : null;

  const write = async run => {
    if (busy.current) return undefined;
    busy.current = true; setPending(true); setError("");
    try {
      const result = await onWrite(run.write, run.payload);
      /* A7: saved on the server's acknowledgement, not on the tap */
      if (result?.ok !== true) {
        /* a declined weekend-start confirm is not a failure */
        if (result && !result.extra?.needsStartConfirm) playSound("S26", { bus:"gm" });
        setError(result?.error || "Not saved. Try again."); return result;
      }
      playSound("S25", { bus:"gm" });
      if (run.recorded) setRecent({ name:run.recorded, evId:run.payload.evId, at:Date.now(),
        posted:!!result.extra?.posted });
      return result;
    } catch (failure) {
      playSound("S26", { bus:"gm" });
      setError(failure?.message || "Not saved. Try again.");
      return { ok:false, error:failure?.message };
    } finally { busy.current = false; setPending(false); }
  };
  const perform = run => {
    if (!run || busy.current) return undefined;
    setTrayOpen(false);
    return run.write ? write(run) : onOpen?.(run);
  };
  const takeBack = () => write({ write:"undoLastContest",
    payload:{ evId:recent.evId, contestId:undo.contestId, contestRevision:undo.contestRevision } })
    .then(result => { if (result?.ok) setRecent(null); return result; });

  const more = model && <PillMore open={trayOpen} actions={model.extras.length > 0}
    onToggle={() => setTrayOpen(open => !open)} />;
  return <div className="fd-director" aria-busy={pending || undefined}>
    {undo?.enabled && <div className="fd-director-recent" role="status">
      <Icon name="check" size={18} lit /><span>{recent.name}</span>
      <button type="button" disabled={pending} onClick={takeBack}>
        <Icon name="undo" size={16} />{pending ? "Undoing" : "Undo"}</button>
    </div>}
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
          {model.sides.map(side => <div className="fd-director-side" key={String(side.key)}>
            <button type="button" className="fd-director-pick" disabled={pending}
              aria-label={`Winner: ${side.name}`} onClick={() => { if (side.run && !busy.current) tapTick(); return perform(side.run); }}>
              <span>{side.name}</span><small>{pending ? "Saving" : "Won"}</small></button>
            <div className="fd-director-faces">{side.players.map(player => <button type="button" key={player}
              aria-label={`View ${disp(state, player)}'s player card`} disabled={!onPlayer}
              onClick={() => onPlayer?.(player)}><Avatar state={state} p={player} size={30} /></button>)}</div>
          </div>)}
        </section>
      : <div className="fd-director-row">{more}{song}<button type="button" className={`fd-director-pill${model.blocked ? " is-blocked" : ""}`}
          disabled={pending} {...hold.bind} onClick={() => hold.consume() ? undefined : perform(model.run)}>
          <span className="fd-director-text">
            <span className="fd-director-label">{model.label}</span>
            {model.lines.map(line => <span className="fd-director-note" key={line}>{line}</span>)}
            {health}
          </span>
          <span className="fd-director-chevron" aria-hidden="true"><Icon name="next" size={20} /></span>
        </button></div>)}
  </div>;
}
