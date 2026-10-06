import React, { useEffect, useRef } from "react";
import { Icon } from "../../ui/Icon.jsx";
import { disp } from "../../../shared/core.js";
import { ChipFace } from "../identity/PlayerIdentity.jsx";
import { usePlayerIdentity } from "../identity/PlayerIdentityContext.js";
import { cardInk } from "../profile/PlayerPass.jsx";
import { floodPlate } from "../identity/chipInk.js";
import { playSound, unlockSound } from "../../lib/sound.js";
import { tapTick } from "../../lib/haptics.js";
import { WALKOUT_TIMING as W, useWalkoutMoment } from "./walkout.js";
import { teamColorPlayer, teamRows } from "./walkoutTeam.js";
import { UP_TIMING, useYoureUp } from "./youreUp.js";
import { EventName, OneSafe } from "../../ui/OneSafe.jsx";
import { LampChase } from "../../ui/ScoreReel.jsx";
import "./moments.css";

/* The phone's half of the room's peaks (Backglass): "You're up" for a
   competitor (and a banner for everyone else) on the TV's face-off beat,
   and the Walkout on the winner's own phone (every teammate's, for a team
   win). Each is a takeover in the
   player's identity color with ink read from it; a tap anywhere puts it
   away, and it leaves on its own. Nothing here writes state: backing
   yourself opens Bets, where the cap and the pending guards live. */
export function MomentsLayer({ state, events, me, active = true, onBets = null }) {
  const up = useYoureUp(state, me, { active });
  const walkout = useWalkoutMoment(state, events, { forPlayer:me || "-" });
  if (!active || !me) return null;
  if (walkout) return <PhoneWalkout state={state} moment={walkout} me={me} />;
  if (up?.role === "player") return <YoureUpTakeover key={up.id} state={state} moment={up} me={me} onBets={onBets} />;
  if (up?.role === "spectator") return <UpBanner key={up.id} state={state} moment={up} onBets={onBets} />;
  return null;
}

/* a takeover that remembers it was put away (the moment keeps playing on
   the room's clock; this phone just stops showing it) */
function useDismiss(id) {
  const [gone, setGone] = React.useState(null);
  return [gone === id, () => setGone(id)];
}

/* `lit`: the winner's own moment lights the glass in their color: light
   falling through the pane from above the record, the glass's one hard
   reflection, and the lamp chase running round the screen in a lit tint of
   that color (the Painted Insert Rule's one exception) */
function Flood({ color, lit = false }) {
  return <div className="fd-moment-flood" aria-hidden="true"><i style={{ background:color }} />
    {lit && <span className="fd-moment-glass" />}
    {lit && <LampChase className="fd-moment-chase" color={`color-mix(in srgb, ${color} 40%, var(--bone))`} />}
  </div>;
}

export function YoureUpTakeover({ state, moment, me, onBets }) {
  const you = usePlayerIdentity(me);
  const ink = cardInk(you.color);
  const [gone, dismiss] = useDismiss(moment.id);
  if (gone) return null;
  const other = moment.other;
  const back = event => {
    event.stopPropagation();
    tapTick(); unlockSound();
    dismiss();
    onBets?.();
  };
  return (
    <div className="fd-moment fd-moment-up" role="dialog" aria-modal="false"
      aria-label={`You’re up: ${moment.event}${moment.label ? `, ${moment.label}` : ""}, vs ${other.name}`}
      style={{ "--tl":`${-Math.round(moment.elapsed)}ms`, "--moment-color":you.color, "--moment-ink":ink,
        "--moment-hold":`${UP_TIMING.total}ms` }}
      onClick={dismiss}>
      <Flood color={you.color} />
      <i className="fd-moment-timer" aria-hidden="true" />
      <div className="fd-moment-body">
        <h2 className="fd-show fd-moment-word">You’re up</h2>
        <p className="fd-moment-sub"><span className="fd-show fd-moment-event"><EventName name={moment.event} /></span>
          {moment.label && <span><OneSafe text={moment.label} /></span>}</p>
        <div className="fd-moment-faces" aria-hidden="true">
          <span className="fd-moment-face is-mine"><ChipFace p={me} size={112} flat /></span>
          <span className="fd-moment-vs">vs</span>
          <span className="fd-moment-face is-other">{other.players.slice(0, 3).map(p =>
            <ChipFace key={p} p={p} size={other.players.length > 1 ? 72 : 112} flat />)}</span>
        </div>
        <p className="fd-moment-against"><b>{other.name}</b></p>
        {moment.partners?.length > 0 && <p className="fd-moment-with">With {moment.partners.map(p => disp(state, p)).join(" & ")}</p>}
        {onBets && <button type="button" className="fd-moment-action" onClick={back}>Back yourself</button>}
        <p className="fd-moment-pays">Winner pays 1:1</p>
      </div>
      <button type="button" className="fd-moment-x" aria-label="Dismiss" onClick={event => { event.stopPropagation(); dismiss(); }}><Icon name="close" size={18} /></button>
    </div>
  );
}

/* everyone else: both sides on one line at the top, for a few seconds */
export function UpBanner({ state, moment, onBets }) {
  const [gone, dismiss] = useDismiss(moment.id);
  if (gone) return null;
  const [a, b] = moment.sides;
  return (
    <div className="fd-moment-banner" role="status" style={{ "--tl":`${-Math.round(moment.elapsed)}ms`,
      "--moment-hold":`${UP_TIMING.banner}ms` }}>
      <button type="button" className="fd-moment-banner-main" onClick={() => { dismiss(); onBets?.(); }}
        aria-label={`${moment.event}: ${a.name} vs ${b.name}. Open Bets`}>
        <span className="fd-moment-banner-chips" aria-hidden="true">
          {a.players.slice(0, 2).map(p => <ChipFace key={p} p={p} size={34} flat />)}
          <i>vs</i>
          {b.players.slice(0, 2).map(p => <ChipFace key={p} p={p} size={34} flat />)}
        </span>
        <span className="fd-moment-banner-text"><b>{a.name} vs {b.name}</b>
          <small><EventName name={moment.event} />{moment.label && <> <OneSafe text={moment.label} /></>}</small></span>
      </button>
      <button type="button" className="fd-moment-banner-x" aria-label="Dismiss" onClick={dismiss}><Icon name="close" size={18} /></button>
    </div>
  );
}

/* the Walkout on the winner's own phone: their color, the art, their name
   stamping as the song fades in on the speaker, the stinger with it */
export function PhoneWalkout({ state, moment, me = null }) {
  const you = usePlayerIdentity(moment.player);
  /* a win lights the glass in their color (floodPlate), its ink read from that */
  const lit = floodPlate(you.color);
  const ink = lit.ink;
  const [gone, dismiss] = useDismiss(moment.id);
  const rung = useRef(null);
  useEffect(() => {
    if (rung.current === moment.id) return;
    rung.current = moment.id;
    playSound("stinger", { at:moment.anchor + W.stamp, key:`walkout:${moment.id}`, open:true });
  }, [moment.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (gone) return null;
  if (moment.team) return <TeamWalkout state={state} moment={moment} me={me} onDismiss={dismiss} />;
  const art = moment.track?.imageUrl || null;
  const what = "Win song";
  return (
    <div className="fd-moment fd-moment-walkout" role="dialog" aria-modal="false"
      aria-label={`Your win song${moment.track ? `: ${moment.track.name}` : ""}`}
      style={{ "--tl":`${-Math.round(moment.elapsed)}ms`, "--moment-color":lit.color, "--moment-ink":ink,
        "--moment-hold":`${W.dock}ms` }}
      onClick={dismiss}>
      <Flood color={lit.color} lit />
      {/* the whole screen: the name and what won it at the top, the record
          (the song's cover as its sleeve, your chip sliding out of it as the
          disc) in the middle, the song lettered at the foot */}
      <div className="fd-moment-body fd-walkout">
        <div className="fd-walkout-head">
          <h2 className="fd-show fd-moment-name">{disp(state, moment.player)}</h2>
          <p className="fd-moment-sub"><span><OneSafe text={what} /></span></p>
        </div>
        <div className={`fd-walkout-record${art ? " has-sleeve" : ""}`} aria-hidden="true">
          {art && <img className="fd-walkout-sleeve" src={art} alt="" width={200} height={200} />}
          <span className="fd-walkout-disc"><ChipFace p={moment.player} size={200} flat /></span>
        </div>
        {moment.track && <div className="fd-walkout-track">
          <p className="fd-show fd-walkout-title">{moment.track.name}</p>
          {moment.track.artists && <p className="fd-walkout-artist"><OneSafe text={moment.track.artists} /></p>}
        </div>}
      </div>
      <button type="button" className="fd-moment-x" aria-label="Dismiss" onClick={event => { event.stopPropagation(); dismiss(); }}><Icon name="close" size={18} /></button>
    </div>
  );
}

/* A team's win on every teammate's phone: the team's name, everyone's chip
   with yours lit, the singer's chip marked by the song's cover, in the
   team's color (its first member's, as at the draw) */
function TeamWalkout({ state, moment, me, onDismiss }) {
  const team = moment.team;
  const tint = floodPlate(usePlayerIdentity(teamColorPlayer(team)).color);
  const ink = tint.ink;
  const art = moment.track?.imageUrl || null;
  const rows = teamRows(team.players.length, 4);
  const across = Math.max(1, ...rows);
  /* the name breaks only at spaces: its longest word sets the size */
  const longest = Math.max(4, ...String(team.name).split(/\s+/).map(word => word.length));
  let next = 0;
  return (
    <div className="fd-moment fd-moment-walkout is-team" role="dialog" aria-modal="false"
      aria-label={`${team.name}${moment.track ? `: ${moment.track.name}` : ""}`}
      style={{ "--tl":`${-Math.round(moment.elapsed)}ms`, "--moment-color":tint.color, "--moment-ink":ink,
        "--moment-hold":`${W.dock}ms`, "--name-w":longest, "--across":across,
        "--chip-max":`${team.players.length > 3 ? 88 : team.players.length > 2 ? 104 : 128}px` }}
      onClick={onDismiss}>
      <Flood color={tint.color} lit />
      <div className="fd-moment-body fd-walkout">
        <div className="fd-walkout-head">
          <h2 className="fd-show fd-moment-name fd-walkout-teamname">{team.name}</h2>
          {team.event && <p className="fd-moment-sub"><span className="fd-show fd-moment-event"><EventName name={team.event} /></span></p>}
        </div>
        <div className="fd-walkout-squad" aria-hidden="true">
          {rows.map((n, r) => <div className="fd-walkout-row" key={r}>
            {team.players.slice(next, next += n).map(p => <span key={p} style={{ "--i":team.players.indexOf(p) }}
              className={`fd-walkout-member${p === me ? " is-you" : ""}${p === moment.player ? " is-singer" : ""}`}>
              <ChipFace p={p} size={128} flat />
              {p === moment.player && moment.track && <span className="fd-walkout-mark">
                {art ? <img src={art} alt="" width={48} height={48} /> : <Icon name="song" size={18} lit />}
              </span>}
            </span>)}
          </div>)}
        </div>
        {moment.track && <div className="fd-walkout-credit">
          {art ? <img src={art} alt="" width={64} height={64} />
            : <span className="fd-walkout-credit-disc"><Icon name="song" size={30} lit /></span>}
          <span>
            <p className="fd-show fd-walkout-credit-title" data-fit="ellipsis">{moment.track.name}</p>
            {moment.track.artists && <p className="fd-walkout-artist" data-fit="ellipsis">{moment.track.artists}</p>}
          </span>
        </div>}
      </div>
      <button type="button" className="fd-moment-x" aria-label="Dismiss" onClick={event => { event.stopPropagation(); onDismiss(); }}><Icon name="close" size={18} /></button>
    </div>
  );
}
