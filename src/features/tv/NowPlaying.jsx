import React, { useEffect, useState } from "react";
import { disp } from "../../../shared/core.js";
import { Avatar } from "../identity/PlayerIdentity.jsx";
import { serverNow } from "../../lib/serverClock.js";
import { nowPlayingModel } from "./nowPlaying.js";

/* Top right of the canvas, under the masthead, while a win song plays (kept
   small: it rides over the standings' chip towers): the song's cover with
   the winner's photo chip on its corner, their name, the song, "MVP ·
   {event}" for a team MVP, and a bar that runs out with the clip on the
   server clock (a CSS animation started at the clip's elapsed time, so a
   TV that joins late shows the same bar). Leaves when the record ends. */
export function NowPlaying({ state, events, now = serverNow }) {
  const [tick, setTick] = useState(0);
  const at = now();
  const model = nowPlayingModel(state, events, at);
  useEffect(() => {
    if (!model) return undefined;
    const timer = setTimeout(() => setTick(value => value + 1), Math.max(50, model.until - now() + 30));
    return () => clearTimeout(timer);
  }, [model?.key, model?.until, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!model) return null;
  const length = Math.max(1, model.until - model.startedAt);
  const elapsed = Math.max(0, Math.min(length, at - model.startedAt));
  const art = model.track?.imageUrl;
  return <div className={`tv-now${model.mvp ? " is-mvp" : ""}${art ? " has-art" : ""}`} key={model.key} role="status">
    <div className="tv-now-art">
      {art && <img src={art} alt="" width={96} height={96} />}
      <span className="tv-now-chip"><Avatar state={state} p={model.player} size={art ? 52 : 84} /></span>
    </div>
    <div className="tv-now-text">
      <div className="tv-label tv-now-label">{model.mvp ? `MVP · ${model.mvp}` : "Now playing"}</div>
      <div className="tv-display tv-now-name">{disp(state, model.player)}</div>
      {model.track && <div className="tv-now-track"><b>{model.track.name}</b>
        {model.track.artists ? ` · ${model.track.artists}` : ""}</div>}
    </div>
    <i className="tv-now-bar" aria-hidden="true"
      style={{ animationDuration:`${length}ms`, animationDelay:`${-elapsed}ms` }} />
  </div>;
}
