import React, { useEffect, useRef, useState } from "react";
import { MVP_PTS, disp } from "../../../shared/core.js";
import { ChipFace } from "../identity/PlayerIdentity.jsx";
import { dispatch } from "../../lib/client.js";
import { tapTick } from "../../lib/haptics.js";
import { serverNow } from "../../lib/serverClock.js";
import { Sheet } from "../../ui/controls.jsx";
import { mvpHomeModel } from "./mvpHome.js";
import "../awards/awards.css";

const sendVote = payload => dispatch("mvpVote", payload, { retry:true });

/* re-render each second while a vote runs, and when the result line expires */
function useTicker(active) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => setTick(value => value + 1), 1000);
    return () => clearInterval(timer);
  }, [active]);
}

/* every teammate a photo chip: tap to vote, tap another to change it */
function MvpVote({ state, model, onVote }) {
  const [pending, setPending] = useState(null);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const vote = async player => {
    if (busy.current || !model.canVote || model.mine === player) return;
    tapTick();
    busy.current = true;
    setPending(player); setError("");
    try {
      const result = await onVote({ evId:model.evId, pick:player });
      if (result?.ok !== true) setError(result?.error || "Not saved. Try again.");
    } catch { setError("Not saved. Try again."); }
    finally { busy.current = false; setPending(null); }
  };
  return <div className="fd-awards-body">
    <div className="fd-awards-grid" aria-busy={!!pending}>
      {model.picks.map(player => {
        const picked = pending ? pending === player : model.mine === player;
        return <button type="button" key={player} disabled={!model.canVote}
          className={`fd-awards-nominee${picked ? " is-picked" : ""}${pending === player ? " is-fresh" : ""}`}
          aria-pressed={picked} aria-label={picked ? `Your vote: ${disp(state, player)}` : `Vote for ${disp(state, player)}`}
          onClick={() => vote(player)}>
          <span className="fd-awards-chip"><ChipFace p={player} size={44} flat /></span>
          <span>{disp(state, player)}</span>
        </button>;
      })}
    </div>
    {error ? <p className="fd-awards-error" role="alert">{error}</p>
      : <p className="fd-awards-note">MVP +{MVP_PTS}</p>}
  </div>;
}

/* The winning team's vote, open on Home as soon as it starts (it closes
   itself in a minute). Then the MVP, for the team. */
export function MvpHome({ state, me, events, onPlayer, onVote = sendVote, now }) {
  const at = now ?? serverNow();
  const model = mvpHomeModel(state, me, events, at);
  useTicker(!!model && now === undefined);
  if (!model) return null;

  /* the MVP is the mark: their own chip, which opens their card */
  if (model.kind === "result") {
    const name = model.you ? "You" : disp(state, model.winner);
    return <section className="fd-awards is-results" aria-label="Team MVP">
      <button type="button" className="fd-awards-entry" onClick={() => onPlayer?.(model.winner)}
        aria-label={`Team MVP, ${model.name}: ${disp(state, model.winner)}. View player card`}>
        <span className="fd-awards-mark" aria-hidden="true"><ChipFace p={model.winner} size={34} flat /></span>
        <span><small>{model.name} MVP</small><strong className="fd-awards-winner">{name}{model.you
          ? <em className="fd-awards-chips"> +{MVP_PTS}</em> : null}</strong></span>
      </button>
    </section>;
  }

  const left = Math.max(0, Math.ceil((model.closesAt - at) / 1000));
  const status = model.mine ? `Your vote: ${disp(state, model.mine)}` : `${model.voted} of ${model.voters} voted`;
  return <section className={`fd-awards fd-lamp${model.mine ? " is-done" : " is-live"}`} aria-label="Team MVP vote">
    <div className="fd-awards-entry" role="heading" aria-level={2}>
      <span><small><i className="fd-insert fd-beat-dot" aria-hidden="true" />{model.name} MVP</small><strong>{status}</strong></span>
      <span className="fd-awards-entry-go fd-awards-clock">{left} s</span>
    </div>
    <MvpVote state={state} model={model} onVote={onVote} />
  </section>;
}

/* A teammate who still owes a vote gets it as a sheet, wherever they are in
   the app, once per vote: the Home row is easy to miss in a one-minute
   window. It leaves as soon as the vote lands (the Home row keeps it), when
   dismissed, or when the vote closes. `blocked` waits while another sheet
   is open. */
export function MvpVoteSheet({ state, me, events, onVote = sendVote, blocked = false, now }) {
  const at = now ?? serverNow();
  const model = mvpHomeModel(state, me, events, at);
  const open = model?.kind === "vote" && model.canVote && !model.mine && model.closesAt > at;
  useTicker(open && now === undefined);
  const [dismissed, setDismissed] = useState(null);
  const key = open ? `${model.evId}:${model.closesAt}` : null;
  if (!open || blocked || dismissed === key) return null;
  const left = Math.max(0, Math.ceil((model.closesAt - at) / 1000));
  return <Sheet title="Vote team MVP" subtitle={`${left} s`} onClose={() => setDismissed(key)}>
    <MvpVote state={state} model={model} onVote={onVote} />
  </Sheet>;
}
