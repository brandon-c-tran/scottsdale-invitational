import React from "react";
import { Icon } from "../../ui/Icon.jsx";
import { OneSafe } from "../../ui/OneSafe.jsx";
import { Countdown, useKaraokeNow } from "./KaraokeClock.jsx";
import { karaokeHomeLine, karaokeSongAhead, karaokeView, tierPaint } from "./karaokeModel.js";
import "./karaoke.css";

/* Home's karaoke row, under the leaderboard beside Trivia's. While a game
   runs: what it wants of you (Pick your song with the seconds, Locked in,
   You're up, Up next, the singer with Vote or your tier, Results), one tap
   back into the sheet; gone once the result posts. Before it, while the
   karaoke event is still to come in a live weekend and you have no song,
   one row into Profile > Karaoke (`onSong`; `karaoke`: the capability). */
export function KaraokeHome({ state, me, onOpen, onSong = null, karaoke = false, now: fixed }) {
  const now = useKaraokeNow(state?.karaoke, fixed);
  const view = karaokeView(state, me, now);
  if (!view) {
    const ahead = onSong ? karaokeSongAhead(state, me, { karaoke }) : null;
    return ahead ? <button type="button" className="fd-karaoke-home is-ahead" onClick={onSong}>
      <span><small><i className="fd-insert is-info is-pending" aria-hidden="true" />{ahead.name}</small>
        <strong>Pick a karaoke song</strong></span><Icon name="next" size="1em" />
    </button> : null;
  }
  const line = karaokeHomeLine(state, view);
  if (!line) return null;
  const paint = tierPaint(line.tier);
  return <button type="button" className="fd-karaoke-home" onClick={onOpen}>
    <span><small><i className="fd-insert fd-beat-dot" aria-hidden="true" />Karaoke</small>
      <strong><OneSafe text={line.strong} /></strong>
      {line.until ? <em><Countdown until={line.until} fixed={fixed} /></em>
        : line.em ? <em className={paint ? "is-tier" : ""} style={paint ? { "--tier":paint.color, "--tier-text":paint.ink } : undefined}>
          {line.em}</em> : null}</span>
    <Icon name="open" size="1em" />
  </button>;
}
