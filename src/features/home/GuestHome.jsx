import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { awardTable, GAMES, disp } from "../../../shared/core.js";
import { Avatar } from "../identity/PlayerIdentity.jsx";
import { usePlayerIdentity } from "../identity/PlayerIdentityContext.js";
import { cardInk } from "../profile/PlayerPass.jsx";
import { SectionHeading } from "../../ui/layout.jsx";
import { Leaderboard } from "../standings/Standings.jsx";
import { bracketPath, deriveHomeModel, deriveYouStrip, vsNames } from "./homeModel.js";
import { Icon, PathText } from "../../ui/Icon.jsx";
import { LampChase, ScoreReel } from "../../ui/ScoreReel.jsx";
import { GlassArt } from "../../ui/GlassArt.jsx";
import { useGlassTilt } from "../../ui/useGlassTilt.js";
import { EventName, OneSafe } from "../../ui/OneSafe.jsx";
import { useCountUp } from "../../lib/motion.js";
import { DraftEntry } from "../draft/DraftSheet.jsx";
import { contestStacks } from "../wagers/betStacks.js";
import { contestWinLines, ordinal, winLineFor } from "../standings/winImpact.js";
import { SideTerms } from "../comebacks/Comebacks.jsx";
import { contestTerms } from "../comebacks/comebacks.js";
import { WinLine } from "../standings/WinLine.jsx";
import { useFreshChange } from "../../lib/motion.js";
import { AlertsCard } from "../alerts/Alerts.jsx";
import { playSound } from "../../lib/sound.js";
import { youreUpTakes } from "../moments/youreUp.js";
import { yourSongLine } from "../music/winSongModel.js";
import { PayoutLadder } from "../../ui/PayoutLadder.jsx";
import "./home.css";

const fmt = value => (value ?? 0).toLocaleString("en-US");
const ord = n => n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`;
/* opens another view (a sheet, a tab); Next drills into a row */
const Arrow = () => <Icon name="open" size={18} className="fd-home-arrow" />;
const Next = () => <Icon name="next" size={18} className="fd-home-arrow" />;

function People({ state, players, onPlayer }) {
  return <span className="fd-home-player-links">{players.map(player => <button type="button" key={player}
    onClick={() => onPlayer(player)} aria-label={`View ${disp(state, player)}'s player card`}>
    <Avatar state={state} p={player} size={30} /><span>{disp(state, player)}</span>
  </button>)}</span>;
}

/* a team's people as one row of photo chips under its name, each a 44px
   target to their card; the name is the card's, never a roll call here.
   The row wraps whole chips when a team outgrows the width. */
function TeamFaces({ state, players, onPlayer }) {
  return <span className="fd-home-team-faces">{players.map(player => <button type="button" key={player}
    onClick={() => onPlayer(player)} aria-label={`View ${disp(state, player)}'s player card`}>
    <Avatar state={state} p={player} size={36} />
  </button>)}</span>;
}

/* a team block's one win line: yours in your own words ("A win puts you
   3rd"), the other side's as the room reads it ("Win: Ben to 3rd") */
const teamLine = (lines, contest, players, own) => {
  if (own) return { text:own, kind:"rank" };
  const side = contest?.sides?.find(item => players.some(player => item.players.includes(player)));
  return side ? winLineFor(lines, side.key) : null;
};
const teamBlocksFor = assignment => assignment?.kind === "team" && assignment.players.length > 2;

function Assignment({ current, state, onPlayer, lines = [], winYou = null }) {
  const a = current.assignment;
  if (!a || a.kind === "spectator") return null;
  if (a.kind === "pending" || a.kind === "crew") return <div className="fd-home-assignment">
    <strong><OneSafe text={a.label} /></strong><small>{a.kind === "crew" ? "Your role" : "The draw"}</small>
  </div>;
  if (a.kind === "solo" && !a.group) return null;
  const status = { "up-now":"Your match", next:"Your next match", waiting:"Waiting for an opponent",
    out:"Eliminated", won:"Winner", through:"Through to the final", final:"Final", playing:"Your group" }[a.status];
  /* a team of three or more: each side is one block, headed by its name,
     its people as a tidy grid of faces; a quiet "vs" between the blocks */
  if (teamBlocksFor(a)) {
    return <div className="fd-home-assignment fd-home-teams">
      <div className="fd-home-team is-mine"><h3><OneSafe text={vsNames(state, a.players, current.event.id)} /></h3>
        <TeamFaces state={state} players={a.players} onPlayer={onPlayer} />
        <WinLine line={teamLine(lines, current.contest, a.players, winYou)} className="fd-home-team-win" /></div>
      {a.opponents.length > 0 && <>
        <p className="fd-home-teams-vs" aria-hidden="true"><span>vs</span></p>
        <div className="fd-home-team"><h3><OneSafe text={vsNames(state, a.opponents, current.event.id)} /></h3>
          <TeamFaces state={state} players={a.opponents} onPlayer={onPlayer} />
          <WinLine line={teamLine(lines, current.contest, a.opponents, null)} className="fd-home-team-win" /></div>
      </>}
      {status && (!a.opponents.length || ["out", "won", "through"].includes(a.status))
        && <p className="fd-home-assignment-status">{current.awaitingResult ? "Awaiting result" : status}</p>}
    </div>;
  }
  return <div className="fd-home-assignment">
    {a.partners.length > 0 && <div><small><OneSafe text={a.label} /></small>
      <People state={state} players={a.partners} onPlayer={onPlayer} /></div>}
    {a.opponents.length > 0 && <div><small><OneSafe text={status || "Against"} /></small>
      <span className="fd-home-opponents"><span>vs</span><People state={state} players={a.opponents} onPlayer={onPlayer} /></span></div>}
    {a.group && <div><small><OneSafe text={a.group.name || status} /></small><People state={state}
      players={a.group.players.filter(player => !a.players.includes(player))} onPlayer={onPlayer} /></div>}
    {status && (!a.opponents.length || ["out", "won", "through"].includes(a.status))
      && <p className="fd-home-assignment-status">{current.awaitingResult ? "Awaiting result" : status}</p>}
  </div>;
}

/* Added events may have no game. Their rules are the event description,
   which the event sheet already carries, so no dead Rules target renders. */
export const hasGameRules = event => {
  const game = GAMES[event?.game];
  return !!(game?.howto || game?.variants?.some(variant => variant.howto));
};

const names = (state, players) => players.map(player => disp(state, player)).join(" & ");

/* One line of personal state under the room's matchup: where you stand in
   this event even when the contest on screen is someone else's. */
export function personalLine({ current, state }) {
  const a = current?.assignment;
  if (!a) return null;
  if (a.kind === "crew") return a.label;
  if (a.kind !== "team" && a.kind !== "solo") return null;
  const partner = a.partners?.length && a.partners.length <= 2 ? ` with ${names(state, a.partners)}` : "";
  const round = a.match?.roundName?.replace(/s$/, "");
  if (a.status === "out") return "You’re out";
  if (a.status === "won") return `You won${partner}`;
  if (a.status === "through") return `You’re through to the final${partner}`;
  if (a.status === "final") return `You’re in the final${partner}`;
  if (a.status === "up-now") return partner ? `You’re up${partner}` : null;
  if (a.match) {
    if (a.opponents.length) return `Next: ${round} vs ${vsNames(state, a.opponents, current.event?.id)}${partner}`;
    if (a.match.feeder) return `Next: ${round} vs winner of ${a.match.feeder}${partner}`;
    return `Next: ${round}${partner}`;
  }
  if (a.group?.name) return `You’re in ${a.group.name}${partner}`;
  return a.partners?.length && a.partners.length <= 2 ? `With ${names(state, a.partners)}` : null;
}

/* M10: when your own match becomes the current contest freshly, a gold line
   sweeps the card once and "You're playing" stamps in, then rests as a
   plain label. Returns the change id while it plays, else null. */
function useYoureUp(contest, me) {
  const yours = contest && me && contest.players?.includes(me)
    && (contest.kind !== "ffa" || contest.sides.length === 2) ? contest.id : null;
  const change = useFreshChange(yours, me || "");
  const [playing, setPlaying] = useState(null);
  useLayoutEffect(() => {
    /* S9 with the stamp; reduced motion keeps the sound, not the sweep */
    /* a two-sided contest's competitor hears the "You're up" sting on the
       TV's face-off beat instead (moments/youreUp.js) */
    if (change.fresh && change.to && !youreUpTakes(contest, me)) playSound("S9", { key:`up:${change.to}` });
    if (!change.animate || !change.to) return undefined;
    setPlaying(change.changeId);
    const timer = setTimeout(() => setPlaying(current => current === change.changeId ? null : current), 1400);
    return () => clearTimeout(timer);
  }, [change.changeId]); // eslint-disable-line react-hooks/exhaustive-deps
  return yours ? playing : null;
}

/* in your own 1v1 or free-for-all: what a win plays, or the way to pick one */
function SongLine({ line, onWinSong }) {
  if (!line) return null;
  if (line.song) return <p className="fd-home-song"><Icon name="song" size={16} />
    <span>Win and <strong>{line.song}</strong> plays</span></p>;
  return onWinSong ? <button type="button" className="fd-home-song is-pick" onClick={onWinSong}>
    <Icon name="song" size={16} /><span>Pick a win song</span><Arrow /></button> : null;
}

/* The You strip: your face, rank and reel, lit in your filament, and the one
   line that says whether you are up, what you won, or what is riding. Its
   insert takes the line's lamp: magenta live, amber chips, cyan info.
   Home has one painting: with nothing live the strip carries it (the
   session's painting fills the card); with a contest live the strip is
   lettered into the contest's painting instead (inset), the two one piece. */
function YouStrip({ state, me, strip, onRoute, inset = false }) {
  const count = useCountUp(strip.pts, { key:"you-strip" });
  /* lettered into the contest's pane the strip is read, not tapped: the
     pane's one way into the event is its name */
  const tap = strip.route && !inset ? () => onRoute(strip.route) : null;
  /* with its own painting the strip is a pane of glass you can press */
  const paneRef = useRef(null);
  useGlassTilt(paneRef, { enabled:!inset });
  /* your face stands in the sky, the reel reads through a score window cut
     in the glass, the line through a window of its own */
  const body = <>
    {!inset && <GlassArt depth clear />}
    <span className="fd-you-strip-face"><Avatar state={state} p={me} size={46} /></span>
    <span className="fd-you-strip-score fd-glass-window">
      <span className="fd-you-strip-rank">{strip.rank ? <OneSafe text={strip.rank.text} /> : "Your chips"}</span>
      <ScoreReel value={count.value} tone="you" drum spin clack={count.counting} label={`${strip.pts.toLocaleString("en-US")} chips`} />
    </span>
    {strip.text && <span className="fd-you-strip-line fd-glass-window">
      <i className={`fd-insert is-${strip.tone}${strip.tone === "live" ? " fd-beat-dot" : ""}`} aria-hidden="true" />
      <span className={strip.up ? "fd-show fd-you-strip-up" : undefined}>{strip.text}</span>
      {tap && <Icon name="next" size={18} className="fd-you-strip-go" />}</span>}
  </>;
  const label = `${strip.rank ? `${strip.rank.tied ? `Tied for ${strip.rank.n}` : strip.rank.text}, ` : ""}${strip.pts.toLocaleString("en-US")} chips${strip.text ? `. ${strip.text}` : ""}`;
  const className = `fd-you-strip ${inset ? "is-inset" : "fd-glass-scene"} is-${strip.tone}`;
  return tap ? <button type="button" ref={paneRef} className={className} onClick={tap} aria-label={label}>{body}</button>
    : <section ref={paneRef} className={className} aria-label={label}>{body}</section>;
}

function EventFocus(props) {
  return props.model.current ? <EventTable {...props} /> : null;
}

/* X1: the current contest as one compact card: the event, its sides with
   what is bet on each and what a win means, and the actions. */
function EventTable({ model, state, me, events, standings, onOpen, onRules, onBets, onBracket, onPlayer, GameMark,
  songs = false, onWinSong, strip = null, you = null }) {
  const current = model.current;
  const event = current.event;
  const before = model.mode === "before";
  const betHere = model.betting?.open && model.betting.event.id === event.id;
  const bettingLabel = model.betting?.canPlace ? "Place chips" : "View bets";
  const running = ["in-progress", "result-entry"].includes(current.lifecycle.phase);
  const away = !!(me && state.away?.[me]);
  /* a bracket game reads as one line: your path, or the next match */
  const path = !before && onBracket ? bracketPath(state, event, me) : null;
  const a = current.assignment;
  const role = a?.kind === "crew";
  /* in the contest on screen, "You're playing" already says it; a bracket
     path already says what is next */
  const mine = !before && !away && current.contest?.kind !== "ffa" && current.contest?.sides?.length > 0
    && !current.contest.players?.includes(me) && !(path?.mine && a?.match)
    ? personalLine({ current, state, model }) : null;
  const contest = !before ? current.contest : null;
  const sided = contest?.kind !== "ffa" && contest?.sides?.length > 0;
  const playing = !!contest?.players?.includes(me);
  const youUp = useYoureUp(contest, me);
  /* Home's lit panel is one pane of glass: it leans under a finger and its
     painting parts into layers (useGlassTilt, GlassArt depth) */
  const paneRef = useRef(null);
  useGlassTilt(paneRef);
  const pots = contest ? contestStacks(state, events, contest) : null;
  /* what is riding on this contest: your bet, the room's, what a bet pays */
  const pool = pots ? [...pots.values()] : [];
  const inPlay = pool.reduce((sum, side) => sum + side.total, 0);
  const yourBet = pool.reduce((sum, side) => sum + side.stacks.filter(stack => stack.player === me)
    .reduce((total, stack) => total + stack.stake, 0), 0);
  const riding = !before && !!contest && (betHere || inPlay > 0);
  /* X8: a wide field shows only your own side's line */
  const ownSide = contest?.kind === "ffa" ? contest.sides.find(side => side.players.includes(me))?.key : undefined;
  /* team blocks carry one line each (the other team's too, and a
     spectator reads both), so a two-sided field reads every side */
  const teamBlocks = !!contest?.sides?.some(side => side.players.length > 2)
    && (sided || contest.sides.length === 2 || teamBlocksFor(current.assignment));
  const lines = useMemo(() => !contest || !teamBlocks && ownSide === undefined && !contest.players?.includes(me) ? []
    : contestWinLines(state, event, contest, { events, standings, keys:sided || teamBlocks ? null : [ownSide] }),
  [state, event.id, contest?.id, events, standings, sided, ownSide, teamBlocks]); // eslint-disable-line react-hooks/exhaustive-deps
  const twoUp = sided && contest.sides.length === 2 && contest.sides.every(side => side.players.length <= 2);
  /* v3.1: what each side pays and which one faces the bounty */
  const terms = sided && contest ? contestTerms(state, contest, standings) : null;
  const termsFor = side => terms?.any && !terms.wide ? terms.sides[side.key] : null;
  /* sides of three or more read as team blocks, not a row of names */
  const teamSides = sided && teamBlocks;
  const song = !away ? yourSongLine(state, contest, me, { songs }) : null;
  /* the panel is a lamp: steady while betting is open or the game is on,
     flashing while it waits on a result, unlit before it starts */
  const phase = current.lifecycle.phase;
  const lamp = before ? "" : current.awaitingResult ? " is-pending" : running || phase === "betting-open" ? " is-live" : "";
  const prize = event.value ? fmt(awardTable(event)[0] || event.value) : null;
  /* what a win means for you, once, in your own words: where it puts you.
     The status already says what a win pays; other sides' lines live on
     Bets and the TV. */
  const yourSide = contest?.sides?.find(side => side.players.includes(me))?.key;
  const yourLine = yourSide === undefined ? null : winLineFor(lines, yourSide);
  const winYou = yourLine?.kind === "rank"
    ? yourLine.tied ? `A win ties you for ${ordinal(yourLine.rank)}` : `A win puts you ${ordinal(yourLine.rank)}` : null;
  /* Home's one lit piece of backglass whenever there is a contest: the
     session's painting fills its head, your strip is lettered into the sky,
     the event's name is painted on the horizon with the game's medallion
     seated on it, and the contest sits on the clear glass below. The status
     reads as units that wrap whole, no separators. */
  return <section ref={paneRef} className={`fd-home-focus fd-lamp${lamp}${running ? " is-running" : ""}${youUp ? " is-your-turn" : ""}`}
    aria-label={`${event.name}: ${current.status}`}>
    {youUp && <LampChase key={youUp} tone="you" />}
    <div className={`fd-home-scene fd-glass-scene${you ? " has-you" : ""}`}>
      <GlassArt depth clear />
      {you}
      <button type="button" className="fd-home-event-title" onClick={() => onOpen(event)} aria-label={`Open ${event.name}`}>
        <span className="fd-home-event-mark"><GameMark id={event.game} variant={event.variant} size={40} /></span>
        <h2 className="fd-show is-marquee fd-glass-letter"><EventName name={event.name} /></h2>
        <Icon name="next" size={24} className="fd-home-event-go" />
      </button>
    </div>
    {/* the rules and the bracket live in the event sheet, one tap on the name */}
    <div className="fd-home-focus-meta">
      <span className="fd-home-status"><span><i className={`fd-insert${lamp === " is-live" ? " fd-beat-dot" : lamp || " is-done"}`} aria-hidden="true" />
        {current.status}</span>
        {prize && <PayoutLadder ev={event} size="tiny" className="fd-home-prize" />}</span>
    </div>
    {sided
      ? <div className="fd-home-assignment"><div className="fd-home-contest-label"><span><OneSafe text={contest.label} /></span>
          {playing && <span className={`fd-home-playing${youUp ? " is-stamping" : ""}`} key={youUp || "rest"}>You’re playing</span>}</div>
          {teamSides ? <div className="fd-home-teams">
            {contest.sides.map((side, index) => {
              const pot = pots?.get(side.key)?.total || 0;
              const yours = side.players.includes(me);
              /* one line per team: yours in your own words, the other's as
                 the room reads it */
              const line = yours && winYou ? { text:winYou, kind:"rank" } : winLineFor(lines, side.key);
              return <React.Fragment key={String(side.key)}>
                {index > 0 && <p className="fd-home-teams-vs" aria-hidden="true"><span>vs</span></p>}
                <div className={`fd-home-team${yours ? " is-mine" : ""}`}>
                  <h3><OneSafe text={vsNames(state, side.players, event.id)} />
                    {pot > 0 && <span className="fd-home-pot" aria-label={`${fmt(pot)} chips bet on this side`}><strong>{fmt(pot)}</strong></span>}</h3>
                  <TeamFaces state={state} players={side.players} onPlayer={onPlayer} />
                  <WinLine line={line} className="fd-home-team-win" />
                  {termsFor(side) && <SideTerms terms={termsFor(side)} className="fd-home-terms" />}
                </div>
              </React.Fragment>;
            })}
          </div> : <div className={`fd-home-sides${twoUp ? " is-two" : ""}`}>
            {contest.sides.map((side, index) => {
              const pot = pots?.get(side.key)?.total || 0;
              const backed = !!pots?.get(side.key)?.stacks.some(stack => stack.player === me);
              return <React.Fragment key={String(side.key)}>
                {index > 0 && twoUp && <span className="fd-home-versus" aria-hidden="true"><span>vs</span></span>}
                <div className={`fd-home-side${side.players.includes(me) || backed ? " is-mine" : ""}`}>
                  <People state={state} players={side.players} onPlayer={onPlayer} />
                  {pot > 0 && <span className="fd-home-pot" aria-label={`${fmt(pot)} chips bet on this side`}>
                    <strong>{fmt(pot)}</strong></span>}
                  {termsFor(side) && <SideTerms terms={termsFor(side)} className="fd-home-terms" />}
                </div>
              </React.Fragment>;
            })}
          </div>}
          {winYou && !teamSides && <p className="fd-home-win-you">{winYou}</p>}
          <SongLine line={song} onWinSong={onWinSong} />
          {away ? <p className="fd-home-personal">Marked away</p>
            : (!strip || role) && mine && <p className="fd-home-personal">{mine}</p>}
        </div>
      : !before && (away ? <div className="fd-home-assignment"><p className="fd-home-personal">Marked away</p></div>
        : <>
          <Assignment current={current} state={state} onPlayer={onPlayer} lines={lines} winYou={winYou} />
          {winYou && !teamBlocksFor(current.assignment) && <p className="fd-home-win-you is-own">{winYou}</p>}
          <SongLine line={song} onWinSong={onWinSong} />
        </>)}
    {/* your own way through the bracket, read here; the bracket is in the event sheet */}
    {path?.mine && <p className="fd-home-path"><span><PathText text={path.text} /></span></p>}
    {/* what is riding beside the one action that matters now: the chips
        while betting is open, nothing big once play is locked. The event
        itself opens from its name. */}
    {(riding || betHere) && <div className="fd-home-event-actions">
      {riding && (yourBet > 0 || inPlay > 0) && <p className="fd-home-riding">
        {yourBet > 0 && <span>Your bet <strong>{fmt(yourBet)}</strong></span>}
        {inPlay > 0 && <span>In play <strong>{fmt(inPlay)}</strong></span>}</p>}
      {betHere && (model.betting.canPlace
        ? <button type="button" className="fd-home-primary is-chip" onClick={onBets}>{playing ? "Back yourself" : bettingLabel}</button>
        : <button type="button" className="fd-home-text-link" onClick={onBets}>{bettingLabel}<Arrow /></button>)}
    </div>}
  </section>;
}

/* Your own place under the champion, in your identity color. */
function OwnFinish({ row, me }) {
  const identity = usePlayerIdentity(me);
  return <p className="fd-home-own-finish" style={{ "--finish-color":identity.color, "--finish-ink":cardInk(identity.color) }}>
    You finished <strong>{ord(row.rank)}</strong></p>;
}

/* Before the weekend: the one travel answer still missing, asked outright as
   a row of the list. Not yet saves through the same profile write and
   pending guard. */
function FlightsQuestion({ onYes, onNotYet }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const notYet = async () => {
    if (busy.current) return;
    busy.current = true; setPending(true); setError("");
    try {
      const result = await onNotYet();
      if (result?.ok !== true) setError(result?.error || "Not saved. Try again.");
    } catch { setError("Not saved. Try again."); }
    finally { busy.current = false; setPending(false); }
  };
  return <div className="fd-home-flights" role="group" aria-label="Flights" aria-busy={pending}>
    <span>Booked your flights?</span>
    <button type="button" disabled={pending} onClick={onYes}>Yes</button>
    <button type="button" disabled={pending} onClick={notYet}>{pending ? "Saving…" : "Not yet"}</button>
    {error && <p role="alert">{error}</p>}
  </div>;
}

/* Before the weekend: what this guest still owes, each row opening the
   profile section that finishes it, the flights question in travel's place.
   Gone once nothing is left. */
function SetupList({ items, flights, onOpen }) {
  const at = flights ? items.findIndex(item => item.id === "details" || item.id === "song") : -1;
  const rows = items.map(item => <button type="button" key={item.id} onClick={() => onOpen(item)}>
    <span>{item.label}</span><Next /></button>);
  if (flights) rows.splice(at < 0 ? rows.length : at, 0, <React.Fragment key="flights">{flights}</React.Fragment>);
  return <section className="fd-home-setup fd-glass-field fd-field-info fd-lamp is-info is-pending" aria-label="Before the weekend">
    <h2>Before the weekend <span>{rows.length} left</span></h2>
    {rows}
  </section>;
}

export function GuestHome({ state, me, events, standings, onPlayer, onEvents,
  onOpen, onRules = onOpen, onBets, onBracket, onStandings, onDraft, deltas, GameMark, StatPills, pokerContent, duelContent,
  awardsContent = null, mvpContent = null,
  since, onSince, onSinceDismiss, flightsAnswered = false, onFlightsYes, onFlightsNotYet, onLastCard,
  setup = [], onSetup, songs = false, onWinSong }) {
  const model = deriveHomeModel({ state, me, events, standings });
  const exposed = !!model.standing?.exposure && model.mode === "live";
  const before = model.mode === "before", finale = model.mode === "finale", complete = model.mode === "complete";
  const leaders = (standings || []).filter(row => row.rank === 1);
  const ownRow = (standings || []).find(row => row.player === me);
  const latest = events.filter(event => state.results?.[event.id]?.slots?.[0]?.length && !state.shelved?.[event.id])
    .sort((a, b) => (state.results[b.id].ts || 0) - (state.results[a.id].ts || 0))[0];
  const bettingElsewhere = model.betting?.open && model.betting.event.id !== model.current?.event.id;
  const sinceText = typeof since === "string" ? since : since?.text;
  const sinceRoute = typeof since === "string" ? { type:"settled" } : since?.route;
  const sinceDetail = (typeof since === "object" && since?.detail) || sinceText;
  const sinceMore = typeof since === "object" ? since?.more || 0 : 0;
  const profile = me ? state.profiles?.[me] || {} : null;
  const askFlights = before && !!profile && !!onFlightsNotYet && !flightsAnswered && profile.flightsBooked !== true
    && !profile.flightIn && !profile.flightOut;
  const strip = me ? deriveYouStrip({ state, me, events, standings:standings || [], model }) : null;
  const routeStrip = route => route.type === "bets" ? onBets?.()
    : route.type === "bracket" && onBracket ? onBracket(route.ev) : onOpen?.(route.ev);
  /* one painting per viewport: the contest carries it, your strip lettered
     into it; with no contest on Home your strip carries it alone */
  const contestPainted = !finale && !complete && !!model.current;
  const you = strip ? <YouStrip state={state} me={me} strip={strip} onRoute={routeStrip} inset={contestPainted || complete} /> : null;

  return <div className={`fd-home is-${model.mode}`}>
    {(finale || complete) ? <div className="fd-home-heading"><h1>{complete ? "Final standings" : "The finale"}</h1></div>
      : <h1 className="fd-home-sr">Home</h1>}

    {!contestPainted && !complete && you}

    {/* before the weekend the event below asks nothing of a guest yet; this does */}
    {before && (askFlights || (onSetup && setup.length > 0)) && <SetupList items={onSetup ? setup : []} onOpen={onSetup}
      flights={askFlights ? <FlightsQuestion onYes={onFlightsYes} onNotYet={onFlightsNotYet} /> : null} />}

    {!finale && !complete && events.filter(event => state.drafts?.[event.id] && !state.draws?.[event.id]
      && !state.shelved?.[event.id] && !state.results?.[event.id]).map(event =>
      <DraftEntry key={event.id} state={state} ev={event} me={me} onOpen={() => (onDraft || onOpen)(event)}/>)}

    {complete ? <section className="fd-home-finish fd-lamp is-chip is-live" aria-label={state.frozen ? "Champion" : "Final chip counts"}>
      {/* the final screen's one lit piece: the night painting, your finish
          lettered into its sky, the champion standing on its horizon */}
      <div className="fd-home-scene fd-glass-scene has-you">
        <GlassArt phase="san" clear />
        {you}
        {leaders.map(row => <button type="button" key={row.player} onClick={() => onPlayer(row.player)}
          className="fd-home-winner" aria-label={`View ${disp(state, row.player)}'s player card`}>
          <Avatar state={state} p={row.player} size={68} /><strong className="fd-show is-marquee fd-glass-letter">{disp(state, row.player)}</strong></button>)}
      </div>
      <h2 className="fd-home-finish-title">{state.frozen ? leaders.length > 1 ? "Tied for the championship" : "Champion" : "Final chip counts"}</h2>
      {leaders[0] && <p><strong><ScoreReel value={leaders[0].pts} tone="chip" drum /></strong> chips</p>}
      {ownRow && !strip && !leaders.some(row => row.player === me) && <OwnFinish row={ownRow} me={me} />}
      {state.frozen && onLastCard && <button type="button" className="fd-lastcard-entry" onClick={onLastCard}>
        {me ? "Your last card" : "The champion's card"}<Arrow /></button>}
    </section> : finale ? <section className="fd-home-poker" aria-label="Championship Poker">
      {pokerContent}<button type="button" className="fd-home-text-link" onClick={() => onRules(model.finale.event)}>Poker rules<Arrow /></button>
    </section> : <EventFocus model={model} state={state} me={me} events={events} standings={standings} onOpen={onOpen} onRules={onRules} onBets={onBets} onBracket={onBracket} onPlayer={onPlayer} GameMark={GameMark}
      songs={songs} onWinSong={onWinSong} strip={strip} you={contestPainted ? you : null} />}

    <AlertsCard me={me} />
    {awardsContent}

    {model.mode === "live" && duelContent}
    {bettingElsewhere && <button type="button" className="fd-home-betting fd-glass-field fd-field-live fd-lamp is-live" onClick={onBets}
      aria-label={`${model.betting.event.name}. Betting open. ${model.betting.canPlace ? "Place chips" : "View bets"}`}>
      <GameMark id={model.betting.event.game} variant={model.betting.event.variant} size={32} /><span><strong className="fd-show"><EventName name={model.betting.event.name} /></strong>
        <small><i className="fd-insert fd-beat-dot" aria-hidden="true" />Betting open</small></span>
      <span>{model.betting.canPlace ? "Place chips" : "View bets"}<Next /></span></button>}

    <section className="fd-home-leaderboard" aria-label="Leaderboard">
      {/* your exposure sits beside the one standings route; your bar draws it */}
      <SectionHeading title="Leaderboard" action={<span className="fd-home-board-actions">
        {exposed && !!model.standing.atRisk && <button type="button" className="fd-home-exposure" onClick={onBets}>{fmt(model.standing.atRisk)} in bets<Arrow /></button>}
        {exposed && !!model.standing.duelAntes && <span className="fd-home-exposure">{fmt(model.standing.duelAntes)} in duels</span>}
        <button type="button" onClick={onStandings} className="fd-home-text-link">Standings <Arrow /></button></span>} />
      {sinceText && <div className="fd-home-since">
        <button type="button" onClick={() => onSince?.(sinceRoute)} aria-label={`${sinceDetail}. ${
          sinceRoute?.type === "event" ? "Open the event" : sinceRoute?.type === "settled" ? "View settled bets" : "View standings"}`}>
          <span>{sinceText}</span>{sinceMore > 0 && <b className="fd-home-since-more">+{sinceMore}</b>}<Arrow /></button>
        {onSinceDismiss && <button type="button" className="fd-home-since-dismiss" onClick={onSinceDismiss}
          aria-label="Dismiss"><Icon name="close" size={18} /></button>}
      </div>}
      <Leaderboard state={state} standings={standings} me={me} onPlayer={onPlayer} starting={before} deltas={deltas}
        StatPills={StatPills} myAtRisk={model.standing?.atRisk || 0}
        scoreLabel={finale ? "STARTING CHIPS" : undefined} ariaLabel={finale ? "Poker starting stacks" : undefined} />
    </section>

    {/* reference under the board: the leaderboard keeps the first screen.
        The since line already names the result it reports. */}
    {!before && !finale && !complete && latest && !sinceText && <section className="fd-home-result" aria-label="Latest result">
      <button type="button" className="fd-home-result-event" onClick={() => onOpen(latest)} aria-label={`Latest result: ${latest.name}`}>
        <strong className="fd-show"><EventName name={latest.name} /></strong><small>Latest result</small></button>
      <People state={state} players={state.results[latest.id].slots[0]} onPlayer={onPlayer} />
      <span className="fd-home-result-award">+{fmt(awardTable(latest)[0])}</span>
    </section>}
    {mvpContent}

    {model.upcoming.length > 0 && <section className="fd-home-upcoming" aria-label="Coming up">
      <SectionHeading title="Coming up" action={<button type="button" className="fd-home-text-link" onClick={onEvents}>All events <Arrow /></button>} />
      {model.upcoming.slice(0, 2).map(event => <button type="button" key={event.id} className="fd-home-next" onClick={() => onOpen(event)}>
        <GameMark id={event.game} variant={event.variant} size={34} /><span><strong className="fd-show"><EventName name={event.name} /></strong></span>
        <Next /></button>)}
    </section>}
  </div>;
}
