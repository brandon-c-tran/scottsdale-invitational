import React, { useEffect, useRef, useState } from "react";
import { dispatch } from "../../lib/client.js";
import { tapTick } from "../../lib/haptics.js";
import { useReducedMotion } from "../../lib/motion.js";
import { playSound, unlockSound } from "../../lib/sound.js";
import { writeError } from "../../lib/writeErrors.js";
import { disp } from "../../../shared/core.js";
import { KARAOKE_TIERS, karaokeArtists } from "../../../shared/karaoke.js";
import { ChipFace } from "../identity/PlayerIdentity.jsx";
import { songTitle } from "../home/GuestHome.jsx";
import { Icon } from "../../ui/Icon.jsx";
import { MenuGroup, MenuRow } from "../../ui/Menu.jsx";
import { KaraokeSongPicker } from "./KaraokeSongPicker.jsx";
import { Countdown, Drain, useKaraokeNow } from "./KaraokeClock.jsx";
import { karaokeOpenKey, karaokeScreen, karaokeTray, karaokeView, ordinal, tierOf, tierPaint } from "./karaokeModel.js";
import { voteFlight } from "./voteFlight.js";
import "./karaoke.css";

/* the game's writes, each retried once with the same action id */
export const sendKaraoke = (type, payload) => dispatch(type, payload, { retry:true });

/* a song as the room reads it: its cover (or a drawn sleeve), the title
   without a release's suffix, the artists. `hero`: the pick window's own
   song, the sleeve over its title; `sm`: one line each, under a name */
function Song({ song, size = "lg", className = "" }) {
  if (!song) return null;
  return <div className={`fd-karaoke-song is-${size}${className ? ` ${className}` : ""}`}>
    <span className="fd-karaoke-cover" aria-hidden="true">
      {song.imageUrl ? <img src={song.imageUrl} alt="" /> : <Icon name="song" size={size === "hero" ? 64 : size === "lg" ? 30 : 20} />}</span>
    <span className="fd-karaoke-song-text">
      <b data-fit={size === "sm" ? "ellipsis" : undefined}>{songTitle(song.name)}</b>
      <small data-fit={size === "sm" ? "ellipsis" : undefined}>{karaokeArtists(song)}</small></span>
  </div>;
}

/* the room as chips, each lit as it happens (locked in, voted), never what */
function Room({ lanes, label, big = false }) {
  return <ul className={`fd-karaoke-room${big ? " is-big" : ""}`} aria-label={label}>
    {lanes.map(lane => <li key={lane.player} className={`${lane.lit ? "is-lit" : ""}${lane.mine ? " is-mine" : ""}`}>
      <ChipFace p={lane.player} size={big ? 40 : 22} /></li>)}
  </ul>;
}
const pickRoom = view => view.room.map(lane => ({ player:lane.player, lit:lane.ready, mine:lane.mine }));
const voteRoom = view => view.voterRoom.map(lane => ({ player:lane.player, lit:lane.voted, mine:lane.mine }));

/* ── the pick window ── */
/* Your song with Keep (locks you in) and Change (the picker, in the sheet,
   its previews muted so the room never hears it); no song yet, or one
   whose video failed the check: the picker. Locked in, Change still
   opens the picker (a new song keeps you locked in). */
function Pick({ view, onAct, karaoke }) {
  const [changing, setChanging] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const song = view.mySong;
  const locked = view.myReady;
  const picking = !song || view.broken || changing;
  const landed = (result, sound = true) => {
    if (result?.ok === true) { setChanging(false); setError(""); if (sound) playSound("stamp", { bus:"you" }); }
    else if (!result?.uncertain) { setError(writeError(result)); playSound("S26", { bus:"you" }); }
    return result;
  };
  const keep = async () => {
    if (busy.current) return;
    tapTick(); unlockSound();
    if (locked) { setChanging(false); return; }
    busy.current = true; setPending(true); setError("");
    try { landed(await onAct("karaokeReady", { gameId:view.game.id })); }
    finally { busy.current = false; setPending(false); }
  };
  const choose = async track => {
    setError("");
    return landed(await onAct("karaokeSong", { track }));
  };
  const change = () => { tapTick(); unlockSound(); setChanging(true); setError(""); };
  return <>
    <main className={`fd-karaoke-body is-pick${picking ? " is-picking" : ""}`}>
      {picking ? <>
        {view.broken && !changing && <p className="fd-karaoke-broken" role="status"><Icon name="close" size={16} />Pick another song</p>}
        <KaraokeSongPicker value={view.broken ? null : song} enabled={karaoke} muted compact onChoose={choose} />
      </> : <Song song={song} size="hero" className={locked ? "is-locked" : ""} />}
    </main>
    <footer className="fd-karaoke-foot">
      <Room lanes={pickRoom(view)} label={`${view.readyCount} of ${view.roomCount} locked in`} />
      {error && <p className="fd-karaoke-error" role="alert">{error}</p>}
      {locked && !changing ? <div className="fd-karaoke-actions">
          <button type="button" className="fd-karaoke-secondary" onClick={change}>Change</button>
          <div className="fd-karaoke-primary is-done"><Icon name="lock" size={18} />Locked in</div>
        </div>
        : song && !view.broken && <div className="fd-karaoke-actions">
          {!changing && <button type="button" className="fd-karaoke-secondary" onClick={change}>Change</button>}
          <button type="button" className="fd-karaoke-primary" disabled={pending} onClick={keep}>Keep</button>
        </div>}
    </footer>
  </>;
}

/* the window for anyone not picking: the room lighting as each locks in */
function PickWatch({ view }) {
  return <main className="fd-karaoke-body is-watch">
    <Room big lanes={pickRoom(view)} label={`${view.readyCount} of ${view.roomCount} locked in`} />
  </main>;
}

/* ── a turn ── */
/* the singer's own walk-up and song: You’re up, then Singing, with the room
   lighting as it votes (never how) */
function Stage({ view, me, word }) {
  const up = word === "You’re up";
  return <>
    <main className={`fd-karaoke-body is-stage${up ? " is-up" : ""}`}>
      <h2 className={`fd-karaoke-word${up ? " is-up" : ""}`}>{word}</h2>
      <span className="fd-karaoke-face is-mine"><ChipFace p={me} size={112} /></span>
      <Song song={view.singerSong} />
    </main>
    {!up && <footer className="fd-karaoke-foot">
      <Room lanes={voteRoom(view)} label={`${view.votedCount} of ${view.voters.length} voted`} />
    </footer>}
  </>;
}

/* someone else's walk-up (and their song, for anyone without a vote) */
function UpWatch({ state, view }) {
  return <main className="fd-karaoke-body is-stage">
    <p className="fd-karaoke-eyebrow">{view.stage === "up" ? "Up next" : "Singing"}</p>
    <span className="fd-karaoke-face"><ChipFace p={view.singer} size={112} /></span>
    <h2 className="fd-karaoke-name">{disp(state, view.singer)}</h2>
    <Song song={view.singerSong} />
  </main>;
}

/* Build Battle's six, low to high, two by three: each its own painted
   insert and its name; yours lit in your filament. */
function Tiers({ lit, disabled, onTap }) {
  return <ol className="fd-karaoke-tiers" aria-label="Vote">
    {KARAOKE_TIERS.map(tier => {
      const paint = tierPaint(tier);
      const on = lit === tier.value;
      return <li key={tier.id}>
        <button type="button" className={`fd-karaoke-tier is-${tier.id}${on ? " is-mine" : ""}`} aria-pressed={on} disabled={disabled}
          style={{ "--tier":paint.color, "--tier-text":paint.ink }} onClick={() => onTap(tier.value)}>
          <span>{tier.name}</span>
        </button>
      </li>;
    })}
  </ol>;
}

/* The vote while someone sings: their chip, name and song, the six tiers.
   A tap ticks and lights at once; one write is in the air at a time and the
   newest tap wins (voteFlight), so the lit tier never flickers back on an
   older echo. Closed, the tiers rest with yours still lit; a tap that
   landed late says the server's reason. */
function Vote({ state, view, onAct }) {
  const [snap, setSnap] = useState({ pending:null, error:"", sending:false });
  const flight = useRef(null);
  if (!flight.current) flight.current = voteFlight({
    send:tier => onAct("karaokeVote", { gameId:view.game.id, index:view.index, singer:view.singer, tier }),
    update:setSnap, errorOf:result => writeError(result), initial:view.myVote,
  });
  useEffect(() => { flight.current.echo(view.myVote); }, [view.myVote]);
  const lit = snap.pending ?? view.myVote;
  const tap = tier => {
    if (!view.voteOpen) return;
    tapTick();
    flight.current.tap(tier).then(result => {
      if (result && result.ok !== true && !result.uncertain) playSound("S26", { bus:"you" });
    });
  };
  return <>
    <main className="fd-karaoke-body is-vote">
      {/* the singer holds the space above; the six dock in the thumb's reach */}
      <div className="fd-karaoke-singer">
        <ChipFace p={view.singer} size={84} />
        <b className="fd-karaoke-singer-name">{disp(state, view.singer)}</b>
        <Song song={view.singerSong} size="sm" />
      </div>
      <h3 className="fd-karaoke-vote-title">Vote</h3>
      <Tiers lit={lit} disabled={!view.voteOpen} onTap={tap} />
    </main>
    <footer className="fd-karaoke-foot">
      <Room lanes={voteRoom(view)} label={`${view.votedCount} of ${view.voters.length} voted`} />
      {snap.error && <p className="fd-karaoke-error" role="alert">{snap.error}</p>}
      {!view.voteOpen && <div className="fd-karaoke-primary is-over">Vote closed</div>}
    </footer>
  </>;
}

/* your turn closed Legendary: the word stamps in its own gold insert while
   the TV rains it */
function Legendary({ view, me }) {
  const tier = tierOf(KARAOKE_TIERS.length);
  const paint = tierPaint(tier);
  return <main className="fd-karaoke-body is-legendary">
    <h2 className="fd-karaoke-legendary" style={{ "--tier":paint.color, "--tier-text":paint.ink }}>{tier.name}</h2>
    <span className="fd-karaoke-face is-mine"><ChipFace p={me} size={112} /></span>
    <Song song={view.mySong} />
  </main>;
}

/* The reveal, at the TV's own beat: every place stands ready, each row
   filling in at its instant (last place first), never before; yours lit. */
function Reveal({ state, view }) {
  /* the row that turned last stays in view as the reveal climbs */
  const shown = view.rows.filter(row => row.shown);
  const newest = shown.length ? shown.reduce((a, b) => (b.at ?? 0) > (a.at ?? 0) ? b : a).player : null;
  const newestRef = useRef(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    newestRef.current?.scrollIntoView?.({ block:"nearest", behavior:reduced ? "auto" : "smooth" });
  }, [newest]); // eslint-disable-line react-hooks/exhaustive-deps
  return <main className="fd-karaoke-body is-reveal">
    <ol className="fd-karaoke-ranking">
      {view.rows.map(row => row.shown
        ? <li key={row.player} ref={row.player === newest ? newestRef : null}
            className={`is-shown${row.mine ? " is-mine" : ""}${row.place <= 3 ? " is-podium" : ""}`}>
            <span className="fd-karaoke-place">{ordinal(row.place)}</span>
            <ChipFace p={row.player} size={34} />
            <span className="fd-karaoke-who"><b>{disp(state, row.player)}</b>
              {row.song && <small data-fit="ellipsis">{songTitle(row.song.name)}</small>}</span>
            <span className="fd-karaoke-score"><b>{row.scoreText}</b>
              {row.tier && <i className="fd-karaoke-tierchip" style={{ "--tier":tierPaint(row.tier).color,
                "--tier-text":tierPaint(row.tier).ink }}>{row.tier.name}</i>}</span>
          </li>
        : <li key={row.player} className="is-ahead" aria-hidden="true"><span className="fd-karaoke-place">{ordinal(row.place)}</span></li>)}
    </ol>
  </main>;
}

/* ── the commissioner's tray: his pill is under the sheet, so its beat and
   moves ride the sheet's header ── */
function Tray({ items, onAct, onDone }) {
  const [error, setError] = useState("");
  const run = async item => {
    tapTick();
    setError("");
    const result = await onAct(item.type, item.payload);
    if (result?.ok === true) { playSound("S25", { bus:"gm" }); onDone(); }
    else if (!result?.uncertain) { playSound("S26", { bus:"gm" }); setError(writeError(result)); }
    return result;
  };
  return <section className="fd-karaoke-tray" aria-label="Commissioner">
    <MenuGroup>
      {items.map(item => <MenuRow key={item.id} name={item.label} chevron={false} tone={item.edge ? "destructive" : undefined}
        onClick={() => run(item)} />)}
    </MenuGroup>
    {error && <p className="fd-karaoke-error" role="alert">{error}</p>}
  </section>;
}

/* The game on a phone, full screen (z 140, not a sheet of the modal
   stack). It opens by itself once per moment for players who are here (the
   pick window, the singer's own turn, a voter's vote as the song starts
   and again at its end if they have not voted, the singer's Legendary, the
   reveal), never the vote for its singer and never for the absent; waits
   while a sheet is open; Home's row reopens it, for spectators too. It
   wakes on the game's own instants and closes for good when the result
   posts, so the chip receipt docks. */
export function KaraokeSheet({ state, me, blocked = false, force = 0, gm = false, karaoke = true, onAct = sendKaraoke,
  now: fixed, initiallyOpen = false }) {
  const now = useKaraokeNow(state?.karaoke, fixed);
  const view = karaokeView(state, me, now);
  const screen = karaokeScreen(view);
  const auto = karaokeOpenKey(view, now);
  const key = auto ?? (screen ? `${screen}:${view.game.id}:${view.index}` : null);
  const [dismissed, setDismissed] = useState(null);
  const [opened, setOpened] = useState(initiallyOpen);
  const [trayOpen, setTrayOpen] = useState(false);
  const forced = useRef(force);
  useEffect(() => {
    if (force !== forced.current) { forced.current = force; setDismissed(null); setOpened(true); }
  }, [force]);
  /* a new moment closes the tray: its moves belonged to the last one */
  useEffect(() => { setTrayOpen(false); }, [screen, view?.index]);
  const open = !!screen && !blocked && dismissed !== key && (auto !== null || opened);
  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = before; };
  }, [open]);
  if (!open) return null;
  const close = () => { setDismissed(key); setOpened(false); setTrayOpen(false); };
  const tray = gm ? karaokeTray(state, view, now) : [];
  const trayShown = trayOpen && tray.length > 0;
  const turn =["up", "up-watch", "singing", "vote", "vote-closing", "vote-closed"].includes(screen);
  const title = screen.startsWith("pick") ? "Pick your song" : screen === "reveal" || screen === "done" ? "Results"
    : screen === "legendary" ? `Singer ${view.myIndex + 1} of ${view.total}` : turn ? `Singer ${view.n} of ${view.total}` : "Karaoke";
  /* the window on the clock: the pick, a walk-up, a vote's grace */
  const walking = (screen === "up" || screen === "up-watch") && view.stage === "up";
  const timer = screen.startsWith("pick") ? { from:view.pickFrom, until:view.pickUntil }
    : walking ? { from:view.upAt, until:view.walkUntil }
      : screen === "vote-closing" ? { from:view.endAt, until:view.closeAt } : null;
  const props = { state, view, me, onAct };
  return <div className={`fd-karaoke-game is-${screen}${trayShown ? " is-tray" : ""}`} role="dialog" aria-modal="true" aria-label="Karaoke">
    <header className="fd-karaoke-head">
      <span className="fd-karaoke-count"><small>Karaoke</small><b>{title}</b></span>
      {timer && <Countdown until={timer.until} fixed={fixed} />}
      {tray.length > 0 && <button type="button" className={`fd-karaoke-more${trayShown ? " is-open" : ""}`} aria-label="Commissioner"
        aria-expanded={trayShown} onClick={() => setTrayOpen(value => !value)}><Icon name="more" size={20} /></button>}
      <button type="button" className="fd-karaoke-close" onClick={close} aria-label="Close"><Icon name="close" size={20} /></button>
      {timer && <span className="fd-karaoke-timebar"><Drain key={`${screen}:${timer.until}`} from={timer.from} until={timer.until} now={now} /></span>}
    </header>
    {/* the commissioner's moves open under the head; the game rests behind them */}
    <div className="fd-karaoke-trayslot">{trayShown && <Tray items={tray} onAct={onAct} onDone={() => setTrayOpen(false)} />}</div>
    {screen === "pick" || screen === "pick-locked" ? <Pick key={view.game.id} view={view} onAct={onAct} karaoke={karaoke} />
      : screen === "pick-watch" ? <PickWatch view={view} />
        : screen === "up" ? <Stage {...props} word="You’re up" />
          : screen === "singing" ? <Stage {...props} word="Singing" />
            : screen === "up-watch" ? <UpWatch {...props} />
              : screen === "legendary" ? <Legendary {...props} />
                : screen === "reveal" || screen === "done" ? <Reveal {...props} />
                  : <Vote key={`${view.game.id}:${view.index}:${view.singer}`} {...props} />}
  </div>;
}
