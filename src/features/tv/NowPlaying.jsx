import React, { useEffect, useState } from "react";
import { disp } from "../../../shared/core.js";
import { Avatar } from "../identity/PlayerIdentity.jsx";
import { serverNow } from "../../lib/serverClock.js";
import { nowPlayingModel } from "./nowPlaying.js";

/* A sign in the masthead row, beside the clock, while a win song plays (it
   reserves its own place there, so it never covers the board, a bracket or
   the standings): the song's cover with the winner's photo chip on its
   corner, their name, the song, "MVP · {event}" for a team MVP, and a bar
   that runs out with the clip on the server clock (a CSS animation started
   at the clip's elapsed time, so a TV that joins late shows the same bar).
   Leaves when the record ends. */
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
  if (model.team) return <TeamNowPlaying state={state} model={model} length={length} elapsed={elapsed} />;
  return <div className={`tv-now${model.mvp ? " is-mvp" : ""}${art ? " has-art" : ""}`} key={model.key} role="status">
    <div className="tv-now-art">
      {art && <img src={art} alt="" width={60} height={60} />}
      <span className="tv-now-chip"><Avatar state={state} p={model.player} size={art ? 34 : 60} /></span>
    </div>
    {/* two lines in the masthead's 64px plate: who (and MVP), then the song */}
    <div className="tv-now-text" aria-label={model.mvp ? `${disp(state, model.player)}, MVP of ${model.mvp}` : undefined}>
      <div className="tv-now-line">
        <span className="tv-display tv-now-name">{disp(state, model.player)}</span>
        {model.mvp && <span className="tv-now-mvp">MVP</span>}
      </div>
      {model.track && <div className="tv-now-track" data-fit="ellipsis"><b>{model.track.name}</b>
        {model.track.artists && <span className="tv-now-artist">{model.track.artists}</span>}</div>}
    </div>
    <i className="tv-now-bar" aria-hidden="true"
      style={{ animationDuration:`${length}ms`, animationDelay:`${-elapsed}ms` }} />
  </div>;
}

/* the strip's widest (tv.css .tv-now) and its fixed parts, for the team's name */
const STRIP_W = 640, STRIP_PAD = 8 + 30, STRIP_GAP = 16, STACK_OVERLAP = 12;
export const nowStackChip = count => count > 4 ? 34 : 40;
/* the team's name in Big Shoulders at 24 to 28px, sized to what the stack leaves */
export function nowTeamNameSize(name, count) {
  const chip = nowStackChip(count);
  const stack = chip + Math.max(0, count - 1) * (chip - STACK_OVERLAP);
  const room = STRIP_W - STRIP_PAD - STRIP_GAP - stack;
  return Math.max(24, Math.min(28, Math.floor(room / (Math.max(4, String(name || "").length) * 0.46))));
}

/* a pair's or a team's win: the team's chips in a stack, its name, then the song */
function TeamNowPlaying({ state, model, length, elapsed }) {
  const { team } = model;
  const chip = nowStackChip(team.players.length);
  return <div className="tv-now is-team" key={model.key} role="status"
    aria-label={`${team.name}${model.track ? `, ${model.track.name}` : ""}`}>
    <span className="tv-faces is-overlap tv-now-stack" style={{ "--overlap":`-${STACK_OVERLAP}px` }} aria-hidden="true">
      {team.players.map((p, i) => <span key={p} style={{ "--i":i }}><Avatar state={state} p={p} size={chip} lettered={false} /></span>)}
    </span>
    <div className="tv-now-text" aria-hidden="true">
      <div className="tv-now-line">
        <span className="tv-display tv-now-name" style={{ fontSize:nowTeamNameSize(team.name, team.players.length) }}>{team.name}</span>
      </div>
      {model.track && <div className="tv-now-track" data-fit="ellipsis"><b>{model.track.name}</b>
        {model.track.artists && <span className="tv-now-artist">{model.track.artists}</span>}</div>}
    </div>
    <i className="tv-now-bar" aria-hidden="true"
      style={{ animationDuration:`${length}ms`, animationDelay:`${-elapsed}ms` }} />
  </div>;
}
