import React from "react";
import { Icon } from "../../ui/Icon.jsx";
import { NowRow } from "../../ui/NowRow.jsx";
import { EventName, OneSafe } from "../../ui/OneSafe.jsx";
import { Countdown, useKaraokeNow } from "./KaraokeClock.jsx";
import { karaokeHomeLine, karaokeSongAhead, karaokeView, karaokeYou, tierPaint } from "./karaokeModel.js";
import "./karaoke.css";

/* your tier, in its paint */
const TierMark = ({ line, paint }) => <span className="fd-karaoke-tiermark" style={{ "--tier":paint.color }}>
  <span className="fd-karaoke-tierlens" aria-hidden="true" /><span className="is-tier">{line.em}</span></span>;

/* Home's karaoke row. While a game runs: what it wants of you (Pick your
   song with the seconds, Locked in, You’re up, Up next, the singer with
   Vote or your tier, Results), one tap back into the sheet; gone once the
   result posts. Before it, while the karaoke event is still to come in a
   live weekend and you have no song, one row into Profile > Karaoke
   (`onSong`; `karaoke`: the capability). `inCard`: a row of Home's Now
   card (ui/NowRow.jsx), beside Where and When's and Trivia's. */
export function KaraokeHome({ state, me, onOpen, onSong = null, karaoke = false, now: fixed, inCard = false }) {
  const now = useKaraokeNow(state?.karaoke, fixed);
  const view = karaokeView(state, me, now);
  if (!view) {
    const ahead = onSong ? karaokeSongAhead(state, me, { karaoke }) : null;
    if (!ahead) return null;
    if (inCard) return <NowRow className="fd-karaoke-now" tone="info" label={<EventName name={ahead.name} />}
      status="Pick a karaoke song" go="Pick" onClick={onSong} ariaLabel={`${ahead.name}. Pick a karaoke song`} />;
    return <button type="button" className="fd-karaoke-home is-ahead" onClick={onSong}>
      <span><small><i className="fd-insert is-info is-pending" aria-hidden="true" />{ahead.name}</small>
        <strong>Pick a karaoke song</strong></span><Icon name="next" size="1em" />
    </button>;
  }
  const line = karaokeHomeLine(state, view);
  if (!line) return null;
  const paint = tierPaint(line.tier);
  if (inCard) {
    /* what the game asks of you is the card's headline (the You strip,
       karaokeYou), so its row stays away; the row is the rest: your tier,
       the room's place, a spectator's way in */
    if (karaokeYou(state, me)?.word) return null;
    /* what asks you now fills the row's verb */
    const voting = line.em === "Vote";
    const asks = (view.phase === "pick" && view.here && !view.myReady) || voting
      || (view.phase === "turns" && view.singer === view.me && view.stage === "up");
    const extra = line.until ? <Countdown until={line.until} fixed={fixed} />
      : paint ? <TierMark line={line} paint={paint} />
        : view.phase === "turns" && view.total ? `Singer ${view.n} of ${view.total}` : null;
    return <NowRow className="fd-karaoke-now" status={<OneSafe text={line.strong} />} extra={extra}
      go={voting ? "Vote" : view.phase === "pick" && asks ? "Pick" : "Open"} primary={asks} onClick={onOpen}
      ariaLabel={`Karaoke. ${line.strong}${line.em ? `. ${line.em}` : ""}. Open`} />;
  }
  return <button type="button" className="fd-karaoke-home" onClick={onOpen}>
    <span><small><i className="fd-insert fd-beat-dot" aria-hidden="true" />Karaoke</small>
      <strong><OneSafe text={line.strong} /></strong>
      {line.until ? <em><Countdown until={line.until} fixed={fixed} /></em>
        : line.em ? <em className={paint ? "is-tier" : ""} style={paint ? { "--tier":paint.color } : undefined}>
          {paint && <span className="fd-karaoke-tierlens" aria-hidden="true" />}{line.em}</em> : null}</span>
    <Icon name="open" size="1em" />
  </button>;
}
