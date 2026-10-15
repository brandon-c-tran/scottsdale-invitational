import React, { useEffect, useRef, useState } from "react";
import { disp } from "../../../shared/core.js";
import {
  KARAOKE_TIERS, KARAOKE_UP_MS, karaokeArtists, karaokeLinesFor, karaokeScoreText, karaokeSinger, karaokeSongTitle, karaokeThumb,
  karaokeTurn, karaokeTurnWay, karaokeVideoOf,
} from "../../../shared/karaoke.js";
import { lyricClockMs } from "../../../shared/karaokeLyrics.js";
import { Lyrics } from "../karaoke/Lyrics.jsx";
import { ChipFace } from "../identity/PlayerIdentity.jsx";
import { Icon } from "../../ui/Icon.jsx";
import { OneSafe } from "../../ui/OneSafe.jsx";
import { ScoreReel } from "../../ui/ScoreReel.jsx";
import { serverNow } from "../../lib/serverClock.js";
import { teamRows } from "../moments/walkoutTeam.js";
import { useKaraokePlayer } from "./karaokePlayer.js";
import { useKaraokeRoomClock } from "./karaokeSound.js";
import {
  KARAOKE_DEAL, KARAOKE_ROW_BEATS, KARAOKE_UP_BEATS, karaokeClock, karaokeDealAt, karaokeDealSlots, karaokeNextInstant,
  KARAOKE_LYRIC_STAGE, karaokeLyricSize, karaokePickRoom, karaokeQueue, karaokeRain, karaokeRevealColumns, karaokeRevealRows,
  karaokeTitleFit, karaokeTvStage, karaokeVoteRoom,
} from "./karaokeTv.js";
import "./tv-karaoke.css";

/* Karaoke on the TV (docs/KARAOKE.md): one composition at 1920x1080 on
   the session's painting, a pure view of the game as a TV's frame carries
   it (projectKaraoke: who locked in and who voted, never how), staged by
   karaokeTv.js. It reads the server clock as it draws and wakes on the
   game's own instants (karaokeInstants), never only on the TV's 1 s tick;
   `fixed` holds a still (the fit audit, a rehearsal): no player, a stand-in
   in the video's box. Every entrance runs from its server instant (--tl),
   so a late TV joins mid-sequence and reduced motion shows end states. */

/* minus the ms already gone since `anchor` when this TV first drew it,
   fixed per anchor so a re-render never restarts a server-clock animation */
function useAnchor(anchor, now) {
  const ref = useRef({ anchor:null, tl:0 });
  if (ref.current.anchor !== anchor) ref.current = { anchor, tl:Number.isFinite(anchor) ? Math.round(anchor - now) : 0 };
  return ref.current.tl;
}
const at = ms => `calc(var(--tl) + ${ms}ms)`;

function useKaraokeNow(game, tick, fixed) {
  const [, wake] = useState(0);
  const now = fixed ? tick : Math.max(tick || 0, serverNow());
  const next = fixed ? null : karaokeNextInstant(game, now);
  useEffect(() => {
    if (!next) return undefined;
    const timer = setTimeout(() => wake(n => n + 1), Math.max(0, next - serverNow()) + 10);
    return () => clearTimeout(timer);
  }, [next]);
  return now;
}

/* the box a title is lettered in, the size it takes there */
const UP_TITLE_W = 1180, CARD_TITLE_W = 1360;
function Title({ text, width, className, hero = 150, max = 112 }) {
  const fit = karaokeTitleFit(text, width, { hero, max });
  return <h2 className={`fd-show${fit.marquee ? " is-marquee" : ""} ${className}`} style={{ fontSize:fit.size }}>
    {fit.lines.map((line, i) => <span key={i}>{line}</span>)}
  </h2>;
}

/* what is left of a window as a ring, magenta, the last five seconds clay */
function Ring({ from, until, now }) {
  const total = Math.max(1, until - from);
  const left = Math.max(0, Math.min(total, until - now));
  const r = 92, c = 2 * Math.PI * r;
  return <div className={`tv-karaoke-ring${left <= 5000 ? " is-low" : ""}`} role="timer" aria-label={`${Math.ceil(left / 1000)} seconds`}>
    <svg viewBox="0 0 220 220" aria-hidden="true"><circle cx="110" cy="110" r={r} className="track" />
      <circle cx="110" cy="110" r={r} className="run" style={{ strokeDasharray:c, strokeDashoffset:c * (1 - left / total) }} /></svg>
    <b className="tv-display">{karaokeClock(left)}</b>
  </div>;
}

/* the room as photo chips in balanced rows, each lit once it has (picked,
   voted), never what */
function Room({ state, room, size, perRow, className = "" }) {
  const rows = teamRows(room.lanes.length, perRow);
  const groups = [];
  rows.reduce((from, n) => { groups.push(room.lanes.slice(from, from + n)); return from + n; }, 0);
  return <div className={`tv-karaoke-room ${className}`} role="group" aria-label={`${room.count} of ${room.total}`}>
    {groups.map((lanes, r) => <div className="tv-karaoke-room-row" key={r}>
      {lanes.map(lane => <span key={lane.player} className={`tv-karaoke-seat${lane.lit ? " is-lit" : ""}`}>
        <span className="tv-karaoke-seat-chip"><ChipFace p={lane.player} size={size} /></span>
        <span className="tv-karaoke-seat-name">{disp(state, lane.player)}</span>
      </span>)}
    </div>)}
  </div>;
}
const Count = ({ room, className = "" }) => <span className={`tv-display tv-karaoke-count ${className}`}>
  <OneSafe text={`${room.count} of ${room.total}`} /></span>;

/* the song's cover, else its video's picture; a still never reaches YouTube */
function Art({ song, turn, fixed, size }) {
  const video = karaokeVideoOf(song, turn);
  const src = song?.imageUrl || (!fixed && video ? karaokeThumb(video.id) : null);
  return <span className="tv-karaoke-art" style={{ width:size, height:size }}>
    {src ? <img src={src} alt="" width={size} height={size} /> : <Icon name="song" size={Math.round(size * 0.4)} />}
  </span>;
}

/* the pick window: the room picks on their phones, the TV counts them in */
function Pick({ state, game, now }) {
  const room = karaokePickRoom(state, game);
  return <section className="tv-karaoke-pane tv-glass is-live tv-karaoke-pick">
    <header className="tv-karaoke-head">
      <h2 className="fd-show is-marquee tv-karaoke-hero">Pick your song</h2>
      <Ring from={Number(game.startedAt) || 0} until={Number(game.pickUntil) || 0} now={now} />
    </header>
    <Room state={state} room={room} size={104} perRow={7} />
    <Count room={room} />
  </section>;
}

/* the running order, dealt a card at a time from the window's close */
function Order({ state, game, now }) {
  const tl = useAnchor(karaokeDealAt(game), now);
  const order = game.order || [];
  const slots = karaokeDealSlots(order.length);
  const rows = [];
  order.forEach((player, i) => {
    const row = slots[i].row;
    if (!rows[row]) rows[row] = [];
    rows[row].push({ player, i });
  });
  return <section className="tv-karaoke-order" style={{ "--tl":`${tl}ms` }}>
    <h2 className="fd-show tv-karaoke-title">Running order</h2>
    <div className="tv-karaoke-queue" role="list">
      {rows.map((row, r) => <div className="tv-karaoke-queue-row" key={r}>
        {row.map(({ player, i }) => <div key={player} role="listitem" className={`tv-karaoke-ticket${i === 0 ? " is-first" : ""}`}
          style={{ animationDelay:at(KARAOKE_DEAL.lead + i * KARAOKE_DEAL.step) }}>
          <span className="tv-display tv-karaoke-ticket-n">{i + 1}</span>
          <ChipFace p={player} size={120} />
          <span className="fd-show tv-karaoke-ticket-name">{disp(state, player)}</span>
        </div>)}
      </div>)}
    </div>
  </section>;
}

/* a singer up next: their chip lands, their name, then their song stamps
   in (public from here); the next two on deck; the clock to the song */
function Up({ state, game, now, fixed }) {
  const singer = karaokeSinger(game), turn = karaokeTurn(game, singer);
  const song = game.songs?.[singer] || null;
  const upAt = Number(turn.upAt) || 0;
  const tl = useAnchor(upAt, now);
  const queue = karaokeQueue(state, game, 2);
  /* the clock runs to the song's start once it is written, else to the walk-up's end */
  const until = Number.isFinite(turn.songAt) ? turn.songAt : upAt + KARAOKE_UP_MS;
  return <section className="tv-karaoke-up" style={{ "--tl":`${tl}ms` }}>
    <div className="tv-karaoke-pane tv-glass is-live tv-karaoke-up-main">
      <span className="tv-status is-live tv-karaoke-lamp"><i className="fd-insert" />Up next</span>
      <div className="tv-karaoke-up-singer">
        <span className="tv-karaoke-up-chip" style={{ animationDelay:at(KARAOKE_UP_BEATS.chip) }}><ChipFace p={singer} size={220} /></span>
        <span className="fd-show tv-karaoke-up-name" style={{ animationDelay:at(KARAOKE_UP_BEATS.name) }}>{disp(state, singer)}</span>
        <span className="tv-karaoke-up-art" style={{ animationDelay:at(KARAOKE_UP_BEATS.song) }}>
          <Art song={song} turn={turn} fixed={fixed} size={240} /></span>
      </div>
      {song && <div className="tv-karaoke-up-song" style={{ animationDelay:at(KARAOKE_UP_BEATS.song) }}>
        <Title text={karaokeSongTitle(song.name)} width={UP_TITLE_W} className="tv-karaoke-up-title" />
        <span className="fd-show tv-karaoke-up-artist">{karaokeArtists(song)}</span>
      </div>}
    </div>
    <aside className="tv-karaoke-up-side">
      <Ring from={upAt} until={until} now={now} />
      {queue.length > 0 && <div className="tv-karaoke-deck tv-glass">
        <span className="tv-label">On deck</span>
        <ol>{queue.map(item => <li key={item.player}>
          <span className="tv-display tv-karaoke-deck-n">{item.place}</span>
          <ChipFace p={item.player} size={88} />
          <span className="fd-show tv-karaoke-deck-name">{disp(state, item.player)}</span>
        </li>)}</ol>
      </div>}
    </aside>
  </section>;
}

/* what is left of the song, draining with the server clock a second at a time */
function Drain({ from, until, now }) {
  const total = Math.max(1, until - from);
  const k = Math.max(0, Math.min(1, (until - now) / total));
  return <span className="tv-karaoke-drain" aria-hidden="true"><i style={{ transform:`scaleX(${k.toFixed(4)})` }} /></span>;
}

/* Sung over an instrumental with our own lyrics: the singer's plate beside
   the compact player (their chip, name and song, the song draining), and
   the lyric stage under them, timed to the player's own position (the
   server clock until it plays, and on a still) plus the song's nudge. */
function LyricStage({ state, game, singer, song, turn, now, fixed, player }) {
  const lines = karaokeLinesFor(game, song);
  const offset = Number(song?.lyricsOffset) || 0;
  const clock = useRef(null);
  clock.current = () => {
    const t = player.time?.();
    return Number.isFinite(t) ? t * 1000 + offset : lyricClockMs(karaokeTurn(game, singer), serverNow(), offset);
  };
  const [read] = useState(() => () => clock.current());
  return <>
    <div className="tv-karaoke-plate tv-glass is-live">
      <ChipFace p={singer} size={196} />
      <div className="tv-karaoke-plate-who">
        <span className="fd-show tv-karaoke-plate-name">{disp(state, singer)}</span>
        <span className="tv-karaoke-plate-song" data-fit="ellipsis"><b>{karaokeSongTitle(song?.name)}</b></span>
        <span className="tv-karaoke-plate-artist" data-fit="ellipsis">{karaokeArtists(song)}</span>
      </div>
      <Drain from={Number(turn.songAt)} until={Number(turn.endAt)} now={now} />
    </div>
    <div className="tv-karaoke-lyrics">
      <Lyrics lines={lines} variant="tv" clock={fixed ? null : read}
        at={fixed ? lyricClockMs(turn, now, offset) : null}
        sizeOf={text => karaokeLyricSize(text, KARAOKE_LYRIC_STAGE.w - 160)} />
    </div>
  </>;
}

/* The song's own layer, over the whole canvas from the first singer up to
   the reveal: the video's box (the player's host, always mounted, shown
   only while the video plays; nothing is ever drawn over it), and while
   the song plays the strip under it. A practice song or a failed upload is
   the lit card in the box's place; a still holds a stand-in there. Sung
   with our lyrics, the box is compact in the top right corner and the
   lyric stage takes the rest. */
function SongLayer({ state, game, now, stage, fixed, player }) {
  const singer = karaokeSinger(game), turn = karaokeTurn(game, singer);
  const song = game.songs?.[singer] || null;
  const video = karaokeVideoOf(song, turn);
  const singing = stage === "singing" && !!turn;
  const card = singing && (!video || !!turn.failed);
  const lyric = !!turn && karaokeTurnWay(game, singer, turn) === "lyrics";
  const room = karaokeVoteRoom(state, game, singer);
  return <div className={`tv-karaoke-song${lyric ? " is-lyrics" : ""}`}>
    <div ref={player.host} className={`tv-karaoke-video${lyric ? " is-compact" : ""}`} />
    {singing && fixed && !card && <div className={`tv-karaoke-standin${lyric ? " is-compact" : ""}`} aria-hidden="true">
      <Icon name="play" size={lyric ? 96 : 160} /></div>}
    {singing && lyric && !card && <LyricStage state={state} game={game} singer={singer} song={song} turn={turn} now={now}
      fixed={fixed} player={player} />}
    {card && <div className="tv-karaoke-card tv-glass">
      <Title text={karaokeSongTitle(song?.name)} width={CARD_TITLE_W} className="tv-karaoke-card-title" hero={170} max={128} />
      <span className="fd-show tv-karaoke-card-artist">{karaokeArtists(song)}</span>
      <Drain from={Number(turn.songAt)} until={Number(turn.endAt)} now={now} />
    </div>}
    {singing && <div className={`tv-karaoke-strip tv-glass${lyric && !card ? " is-room" : ""}`}>
      {!(lyric && !card) && <>
        <ChipFace p={singer} size={64} />
        <span className="fd-show tv-karaoke-strip-name">{disp(state, singer)}</span>
        <span className="tv-karaoke-strip-song" data-fit="ellipsis"><b>{karaokeSongTitle(song?.name)}</b>
          <span>{karaokeArtists(song)}</span></span>
      </>}
      {player.blocked
        ? <button type="button" className="tv-karaoke-play fd-lamp is-live is-pending" onClick={() => player.play()}>
          <Icon name="play" size={40} lit /><b className="fd-show">Click to play</b></button>
        : <>
          <span className="tv-karaoke-strip-room" role="group" aria-label={`${room.count} of ${room.total}`}>
            {room.lanes.map(lane => <span key={lane.player} className={`tv-karaoke-strip-seat${lane.lit ? " is-lit" : ""}`}>
              <ChipFace p={lane.player} size={44} /></span>)}
          </span>
          <Count room={room} className="is-strip" />
        </>}
    </div>}
  </div>;
}

/* the song is over: the room votes on their phones, the TV shows who has */
function Voting({ state, game, now }) {
  const singer = karaokeSinger(game), turn = karaokeTurn(game, singer);
  const song = game.songs?.[singer] || null;
  const room = karaokeVoteRoom(state, game, singer);
  const endAt = Number(turn.endAt) || 0;
  return <section className="tv-karaoke-pane tv-glass is-live tv-karaoke-vote">
    <header className="tv-karaoke-head">
      <ChipFace p={singer} size={200} />
      <div className="tv-karaoke-vote-who">
        <span className="fd-show tv-karaoke-vote-name">{disp(state, singer)}</span>
        {song && <span className="tv-karaoke-vote-song" data-fit="ellipsis"><b>{karaokeSongTitle(song.name)}</b> {karaokeArtists(song)}</span>}
      </div>
      <Ring from={endAt} until={Math.max(endAt, Number(turn.closeAt) || endAt)} now={now} />
    </header>
    <div className="tv-karaoke-vote-tiers">
      <span className="fd-show is-marquee tv-karaoke-hero">Vote</span>
      <ol className="tv-karaoke-tiers">{KARAOKE_TIERS.map(tier =>
        <li key={tier.id} className={`tv-karaoke-tier is-${tier.value}`}>{tier.name}</li>)}</ol>
    </div>
    <Room state={state} room={room} size={84} perRow={12} className="is-voters" />
    <Count room={room} />
  </section>;
}

/* Build Battle's rain: Legendary falls over the singer as the word stamps in */
const DROPS = Object.freeze(Array.from({ length:30 }, (_, i) => ({
  x:Math.round(((i * 37) % 30) / 30 * 1720 + 36), y:Math.round(((i * 53) % 29) / 29 * 700 + 40),
  delay:Math.round(((i * 41) % 30) / 30 * 1900), d:1500 + ((i * 29) % 7) * 120, r:((i * 67) % 90) - 45,
})));
function Legendary({ state, game, rain, now }) {
  const tl = useAnchor(rain.closedAt, now);
  const song = game.songs?.[rain.player] || null;
  return <section className="tv-karaoke-legendary" style={{ "--tl":`${tl}ms` }}>
    <div className="tv-karaoke-rain" aria-hidden="true">
      {DROPS.map((drop, i) => <i key={i} style={{ "--x":`${drop.x}px`, "--y":`${drop.y}px`, "--r":`${drop.r}deg`,
        animationDuration:`${drop.d}ms`, animationDelay:at(drop.delay) }} />)}
    </div>
    <div className="tv-karaoke-legend">
      <span className="tv-karaoke-legend-chip"><ChipFace p={rain.player} size={260} /></span>
      <span className="fd-show tv-karaoke-legend-name">{disp(state, rain.player)}</span>
      {song && <span className="tv-karaoke-legend-song">{karaokeSongTitle(song.name)}</span>}
      <span className="fd-show is-marquee tv-karaoke-legend-word" style={{ animationDelay:at(250) }}>Legendary</span>
    </div>
  </section>;
}

/* a score as the reveal rolls it in: whole points, the point, the tenth
   (karaokeScoreText), or a dash for a singer nobody voted on */
function Score({ score, when }) {
  const text = karaokeScoreText(score);
  if (!Number.isFinite(score)) return <span className="tv-display tv-karaoke-score is-none">{text}</span>;
  const [whole, tenth] = text.split(".");
  return <span className="tv-display tv-karaoke-score" role="img" aria-label={text}>
    <ScoreReel value={Number(whole)} from={0} motion="always" at={when} label="" slim />
    <i className="tv-karaoke-point" aria-hidden="true" />
    <ScoreReel value={Number(tenth)} from={0} motion="always" at={when} label="" slim />
  </span>;
}

/* one place on the reveal: dark until its instant, then the singer stamps
   in with their song, the tier their score is nearest and the score */
function RevealRow({ state, game, row, place, now, size = "rest" }) {
  const shown = !!row?.shown;
  const tl = useAnchor(shown ? row.at : null, now);
  const cls = `tv-karaoke-row is-${size}`;
  if (!shown) return <li className={`${cls} is-waiting`}><span className="tv-display tv-karaoke-place">{place}</span></li>;
  const song = game.songs?.[row.player] || null;
  return <li className={cls} style={{ "--tl":`${tl}ms` }}>
    <span className="tv-display tv-karaoke-place">{place}</span>
    <ChipFace p={row.player} size={size === "first" ? 88 : size === "podium" ? 76 : 50} />
    <span className="tv-karaoke-row-who">
      <span className="fd-show tv-karaoke-row-name">{disp(state, row.player)}</span>
      {song && <span className="tv-karaoke-row-song" data-fit="ellipsis">{karaokeSongTitle(song.name)}</span>}
    </span>
    {row.tier && <span className={`tv-karaoke-tier is-${row.tier.value}`}>{row.tier.name}</span>}
    <Score score={row.score} when={at(KARAOKE_ROW_BEATS.reel)} />
  </li>;
}

/* the reveal: last place up, a row a beat, 3rd, 2nd and 1st each longer */
function Reveal({ state, game, now }) {
  const rows = karaokeRevealRows(game, now);
  const cols = karaokeRevealColumns(rows.length);
  const byPlace = new Map(rows.map(row => [row.place, row]));
  const draw = (place, size) => <RevealRow key={place} state={state} game={game} row={byPlace.get(place)} place={place} now={now}
    size={size} />;
  return <section className="tv-karaoke-reveal">
    <h2 className="fd-show tv-karaoke-title">Results</h2>
    {cols.podium.length > 0 && <ol className="tv-karaoke-podium">{cols.podium.map(place => draw(place, place === 1 ? "first" : "podium"))}</ol>}
    {cols.left.length > 0 && <div className="tv-karaoke-rest">
      <ol>{cols.left.map(place => draw(place, "rest"))}</ol>
      <ol>{cols.right.map(place => draw(place, "rest"))}</ol>
    </div>}
  </section>;
}

/* Karaoke on the TV, from the pick window to the reveal; the posted
   result's own moment takes over from there. `onVideoStatus` hears the
   player (the TV report, client.js reportTvVideo through App). */
export function TVKaraoke({ state, now: tick, fixed = false, onVideoStatus = null }) {
  const game = state?.karaoke?.id ? state.karaoke : null;
  const now = useKaraokeNow(game, tick, fixed);
  const stage = karaokeTvStage(game, now);
  const player = useKaraokePlayer({ game, fixed, onStatus:onVideoStatus });
  useKaraokeRoomClock(game, now, { fixed });
  if (!game) return null;
  let body = null;
  if (stage === "pick") body = <Pick state={state} game={game} now={now} />;
  else if (stage === "order") body = <Order state={state} game={game} now={now} />;
  else if (stage === "up") body = <Up state={state} game={game} now={now} fixed={fixed} />;
  else if (stage === "voting") body = <Voting state={state} game={game} now={now} />;
  else if (stage === "legendary") body = <Legendary state={state} game={game} rain={karaokeRain(game, now)} now={now} />;
  else if (stage === "reveal") body = <Reveal state={state} game={game} now={now} />;
  return <div className={`tv-karaoke is-${stage || "idle"}`} data-karaoke={stage || ""}>
    {body}
    {game.phase === "turns" && <SongLayer key="song" state={state} game={game} now={now} stage={stage} fixed={fixed} player={player} />}
  </div>;
}
