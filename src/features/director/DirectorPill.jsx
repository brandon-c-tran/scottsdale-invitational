import React, { useEffect, useRef, useState } from "react";
import { disp } from "../../../shared/core.js";
import { Avatar } from "../identity/PlayerIdentity.jsx";
import { lastWinnerUndo } from "./directorPill.js";
import { tapTick } from "../../lib/haptics.js";
import "./director.css";

/* A recorded winner can be taken back with one tap for this long. */
const UNDO_WINDOW_MS = 5000;

/* The commissioner's next step. The label is the verb, the lines say what
   it acts on, and both wrap instead of truncating. A match being played
   shows its two sides as the winner targets; faces beside them open player
   cards. Writes wait for acknowledgement and go through onWrite, which owns
   the weekend-start confirm. */
export function DirectorPill({ model, state, events, onWrite, onOpen, onPlayer }) {
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const [recent, setRecent] = useState(null);
  const busy = useRef(false);
  useEffect(() => {
    if (!recent) return undefined;
    const timer = setTimeout(() => setRecent(null), Math.max(0, recent.at + UNDO_WINDOW_MS - Date.now()));
    return () => clearTimeout(timer);
  }, [recent]);
  const ev = recent ? (events || []).find(item => item.id === recent.evId) : null;
  const undo = recent && ev ? lastWinnerUndo(state, ev) : null;
  if (!model && !(undo?.enabled)) return null;

  const write = async run => {
    if (busy.current) return undefined;
    busy.current = true; setPending(true); setError("");
    try {
      const result = await onWrite(run.write, run.payload);
      if (result?.ok !== true) { setError(result?.error || "Not saved. Try again."); return result; }
      if (run.recorded) setRecent({ name:run.recorded, evId:run.payload.evId, at:Date.now(),
        posted:!!result.extra?.posted });
      return result;
    } catch (failure) {
      setError(failure?.message || "Not saved. Try again.");
      return { ok:false, error:failure?.message };
    } finally { busy.current = false; setPending(false); }
  };
  const perform = run => {
    if (!run || busy.current) return undefined;
    return run.write ? write(run) : onOpen?.(run);
  };
  const takeBack = () => write({ write:"undoLastContest",
    payload:{ evId:recent.evId, contestId:undo.contestId, contestRevision:undo.contestRevision } })
    .then(result => { if (result?.ok) setRecent(null); return result; });

  return <div className="fd-director" aria-busy={pending || undefined}>
    {undo?.enabled && <div className="fd-director-recent" role="status">
      <span>Winner recorded: {recent.name}{recent.posted ? ". Result posted." : ""}</span>
      <button type="button" disabled={pending} onClick={takeBack}>{pending ? "Undoing…" : "Undo"}</button>
    </div>}
    {error && <p className="fd-director-error" role="alert">{error}</p>}
    {model && !!model.extras.length && <div className="fd-director-extras">
      {model.extras.map(extra => <button type="button" key={extra.label} disabled={pending}
        onClick={() => perform(extra.run)}>{extra.label}</button>)}
    </div>}
    {model && (model.sides
      ? <section className="fd-director-card" aria-label={`${model.label}. ${model.lines.join(". ")}`}>
          <div className="fd-director-head"><strong>{model.label}</strong>
            {model.lines.map(line => <span key={line}>{line}</span>)}</div>
          {model.sides.map(side => <div className="fd-director-side" key={String(side.key)}>
            <button type="button" className="fd-director-pick" disabled={pending}
              aria-label={`Winner: ${side.name}`} onClick={() => { if (side.run && !busy.current) tapTick(); return perform(side.run); }}>
              <span>{side.name}</span><small>{pending ? "Saving…" : "Won"}</small></button>
            <div className="fd-director-faces">{side.players.map(player => <button type="button" key={player}
              aria-label={`View ${disp(state, player)}'s player card`} disabled={!onPlayer}
              onClick={() => onPlayer?.(player)}><Avatar state={state} p={player} size={30} /></button>)}</div>
          </div>)}
        </section>
      : <button type="button" className={`fd-director-pill${model.blocked ? " is-blocked" : ""}`}
          disabled={pending} onClick={() => perform(model.run)}>
          <span className="fd-director-text">
            <span className="fd-director-label">{model.label}</span>
            {model.lines.map(line => <span className="fd-director-note" key={line}>{line}</span>)}
          </span>
          <span className="fd-director-chevron" aria-hidden="true">›</span>
        </button>)}
  </div>;
}
