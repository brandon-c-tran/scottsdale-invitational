import React, { useEffect, useState } from "react";
import { disp } from "../../../shared/core.js";
import { Avatar } from "../identity/PlayerIdentity.jsx";
import { serverNow } from "../../lib/serverClock.js";
import { nowPlayingModel } from "./nowPlaying.js";

/* Bottom corner of the canvas while a win song plays: the player's photo
   chip, their name, the song, and "MVP · {event}" for a team MVP. Leaves
   when the song's record ends. */
export function NowPlaying({ state, events, now = serverNow }) {
  const [tick, setTick] = useState(0);
  const model = nowPlayingModel(state, events, now());
  useEffect(() => {
    if (!model) return undefined;
    const timer = setTimeout(() => setTick(value => value + 1), Math.max(50, model.until - now() + 30));
    return () => clearTimeout(timer);
  }, [model?.key, model?.until, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!model) return null;
  return <div className={`tv-now${model.mvp ? " is-mvp" : ""}`} key={model.key} role="status">
    <Avatar state={state} p={model.player} size={112} />
    <div className="tv-now-text">
      <div className="tv-label tv-now-label">{model.mvp ? `MVP · ${model.mvp}` : "Now playing"}</div>
      <div className="tv-display tv-now-name">{disp(state, model.player)}</div>
      {model.track && <div className="tv-now-track">{model.track.name}{model.track.artists ? ` · ${model.track.artists}` : ""}</div>}
    </div>
  </div>;
}
