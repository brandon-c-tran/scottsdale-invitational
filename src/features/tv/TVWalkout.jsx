import React, { useEffect, useRef } from "react";
import { disp } from "../../../shared/core.js";
import { Avatar, ChipFace } from "../identity/PlayerIdentity.jsx";
import { usePlayerIdentity } from "../identity/PlayerIdentityContext.js";
import { Icon } from "../../ui/Icon.jsx";
import { LampChase } from "../../ui/ScoreReel.jsx";
import { WALKOUT_TIMING as W, useWalkoutMoment } from "../moments/walkout.js";
import { teamColorPlayer, teamRows } from "../moments/walkoutTeam.js";
import { podiumBeatAt, latestResultOf, readableInk } from "./tvModel.js";
import { playCues, walkoutCues } from "./roomSound.js";
import { Takeover } from "./TVTakeover.jsx";

/* the song's cover (or the winner's chip) is centred here on the canvas;
   the flood grows from it */
export const WALKOUT_ORIGIN = Object.freeze({ x:470, y:540 });
const FLOOD_R = 2400;
/* the text column right of the cover, in canvas pixels */
const TEXT_W = 900;
/* one line in the column: the marquee cut at 900 runs about 0.52em a
   letter, Big Shoulders' song line about 0.47em */
export const walkoutNameSize = name => Math.max(96, Math.min(220, Math.floor(TEXT_W / (Math.max(4, String(name || "").length) * 0.52))));
export const walkoutSongSize = title => Math.max(64, Math.min(124, Math.floor(TEXT_W / (Math.max(6, String(title || "").length) * 0.47))));

/* ── a team's walkout ──
   The team is the hero: its name across the top, every member's photo
   chip in a balanced block under it (one row up to five, then even rows),
   the song credited at the foot with its cover, and the one whose pick it
   is marked by that cover on their chip. Everything is sized from the
   canvas by count and length, inside 1920 x 1080 less 72px top and bottom. */
export const WALKOUT_TEAM_ORIGIN = Object.freeze({ x:960, y:560 });
const TEAM_W = 1560;
const TEAM_H = 1080 - 2 * 72;
const TEAM_GAP = 32;          // between the name, the chips and the credit
const CREDIT_H = 112;
const CHIP_GAP = 56;          // between chips in a row
const ROW_GAP = 24;

/* the team's name: one line while the marquee cut stays large, else two
   lines broken at the space nearest the middle (" & " first) */
export function walkoutTeamName(name) {
  const text = String(name || "").trim();
  const fit = longest => Math.floor(TEAM_W / (Math.max(4, longest) * 0.52));
  const one = fit(text.length);
  const spaces = [...text.matchAll(/ /g)].map(match => match.index);
  if (one >= 110 || !spaces.length) return { lines:[text], size:Math.max(72, Math.min(180, one)) };
  const amp = text.indexOf(" & ");
  const cut = amp > 0 ? amp + 2
    : spaces.reduce((best, at) => Math.abs(at - text.length / 2) < Math.abs(best - text.length / 2) ? at : best, spaces[0]);
  const lines = [text.slice(0, cut).trim(), text.slice(cut).trim()];
  return { lines, size:Math.max(72, Math.min(130, fit(Math.max(...lines.map(line => line.length))))) };
}

/* rows, chip size and labels for a team of any size */
export function walkoutTeamLayout(team) {
  const count = team?.players?.length || 0;
  const rows = teamRows(count, 5);
  const across = Math.max(1, ...rows);
  const name = walkoutTeamName(team?.name);
  /* a pair's name is its two names; a named team labels its chips */
  const labelled = !!team?.named || count > 2;
  const nameH = Math.ceil(name.size * 1.2) * name.lines.length;
  const space = TEAM_H - nameH - CREDIT_H - 2 * TEAM_GAP;
  const byWidth = Math.floor((TEAM_W - (across - 1) * CHIP_GAP) / across);
  const labelH = labelled ? Math.ceil(44 * 1.2) + 10 : 0;
  const byHeight = Math.floor((space - (rows.length - 1) * ROW_GAP) / Math.max(1, rows.length)) - labelH;
  const chip = Math.max(120, Math.min(300, byWidth, byHeight));
  return { rows, chip, name, labelled, slot:chip + CHIP_GAP - 8 };
}

/* a member's name under their chip, sized to its slot */
export const walkoutLabelSize = (label, slot) =>
  Math.max(24, Math.min(44, Math.floor(slot / (Math.max(4, String(label || "").length) * 0.5))));

/* A free-for-all posts its podium 3rd, 2nd, 1st; its winner's song starts
   with the write. The walkout holds until 1st has turned on the podium,
   so the song never tells the room before the podium does. */
export function podiumHoldUntil(state, events, player, startedAt) {
  const latest = latestResultOf(state, events);
  const res = latest?.res;
  if (!res || res.stacks || !(res.slots?.[0] || []).includes(player)) return null;
  const posted = Number(res.confirmedAt || res.ts) || 0;
  if (!posted || Math.abs(Number(startedAt) - posted) > 15000) return null;
  const places = Math.min(3, (res.slots || []).filter(slot => slot?.length).length);
  return posted + podiumBeatAt(Math.max(0, places - 1)) + 600;
}

/* The walkout the TV plays now (TVMode lists it as a takeover), and its
   stinger and stamp on the room's clock, once. */
export function useTvWalkout(state, events) {
  const walkout = state?.showControl?.audio?.walkout || null;
  const delayTo = walkout?.player ? podiumHoldUntil(state, events, walkout.player, walkout.startedAt) : null;
  const moment = useWalkoutMoment(state, events, { delayTo });
  const played = useRef(null);
  useEffect(() => {
    if (!moment || played.current === moment.id) return;
    played.current = moment.id;
    playCues(walkoutCues({ id:moment.id, anchor:moment.anchor, stamp:W.stamp }));
  }, [moment?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return moment;
}

/* The Walkout on the TV: full canvas, about nine seconds, then it docks
   into the Now playing strip (top right) that carries the rest of the clip. */
export function TVWalkout({ state, moment }) {
  if (!moment) return null;
  return <WalkoutStage state={state} moment={moment} />;
}

function WalkoutStage({ state, moment }) {
  if (moment.team && !moment.mvp) return <TeamWalkout state={state} moment={moment} />;
  return <SoloWalkout state={state} moment={moment} />;
}

/* the cover the walkout record carries, else the saved song's */
function coverOf(state, moment) {
  const saved = state?.profiles?.[moment.player]?.walkoutTrack || null;
  return moment.track?.imageUrl || (moment.track && saved?.name === moment.track.name ? saved.imageUrl : null) || null;
}

function SoloWalkout({ state, moment }) {
  const identity = usePlayerIdentity(moment.player);
  const color = identity.color;
  const ink = readableInk(color);
  const name = disp(state, moment.player);
  const art = coverOf(state, moment);
  const size = walkoutNameSize(name);
  return (
    <Takeover kind="walkout" className={`tv-walkout${moment.mvp ? " is-mvp" : ""}${ink === "var(--ink0)" ? " is-ink-dark" : ""}`}
      label={`${moment.mvp ? "MVP" : "Win song"}: ${name}${moment.track ? `, ${moment.track.name}` : ""}`}
      style={{ "--tl":`${-Math.round(moment.elapsed)}ms`, "--walk-color":color, "--walk-ink":ink,
        "--walk-x":`${WALKOUT_ORIGIN.x}px`, "--walk-y":`${WALKOUT_ORIGIN.y}px`, "--walk-r":`${FLOOD_R}px` }}>
      <div className="tv-walkout-dock">
        <div className="tv-walkout-panel">
          <i className="tv-walkout-flood" aria-hidden="true" />
        </div>
        <LampChase color={color} className="tv-walkout-chase" />
        <div className={`tv-walkout-art${art ? " has-cover" : ""}`} aria-hidden="true">
          {art ? <img src={art} alt="" width={640} height={640} />
            : <span className="tv-walkout-coin"><ChipFace p={moment.player} size={560} flat /></span>}
          <span className="tv-walkout-photo"><Avatar state={state} p={moment.player} size={art ? 240 : 210} /></span>
        </div>
        <div className="tv-walkout-text">
          <div className="fd-show is-marquee tv-walkout-name" style={{ fontSize:size }} aria-hidden="true">{name}</div>
          {moment.mvp && <div className="tv-walkout-mvp" aria-hidden="true">
            <b className="fd-show">MVP</b><span>{moment.mvpEvent || "Team MVP"}</span></div>}
          {moment.track && <div className="tv-walkout-track" aria-hidden="true">
            <b data-fit="ellipsis" style={{ fontSize:walkoutSongSize(moment.track.name) }}>{moment.track.name}</b>
            {moment.track.artists && <span data-fit="ellipsis">{moment.track.artists}</span>}
          </div>}
        </div>
      </div>
    </Takeover>
  );
}

/* A pair's or a team's win: the team in its color (its first member's, as
   at the draw), the singer marked by the song's cover on their chip */
function TeamWalkout({ state, moment }) {
  const team = moment.team;
  const identity = usePlayerIdentity(teamColorPlayer(team));
  const color = identity.color;
  const ink = readableInk(color);
  const art = coverOf(state, moment);
  const layout = walkoutTeamLayout(team);
  let next = 0;
  const rows = layout.rows.map(n => team.players.slice(next, next += n));
  return (
    <Takeover kind="walkout" className={`tv-walkout is-team${ink === "var(--ink0)" ? " is-ink-dark" : ""}`}
      label={`Win song: ${team.name}${moment.track ? `, ${moment.track.name}, picked by ${disp(state, moment.player)}` : ""}`}
      style={{ "--tl":`${-Math.round(moment.elapsed)}ms`, "--walk-color":color, "--walk-ink":ink,
        "--walk-x":`${WALKOUT_TEAM_ORIGIN.x}px`, "--walk-y":`${WALKOUT_TEAM_ORIGIN.y}px`, "--walk-r":`${FLOOD_R}px`,
        "--team-chip":`${layout.chip}px`, "--team-slot":`${layout.slot}px` }}>
      <div className="tv-walkout-dock">
        <div className="tv-walkout-panel">
          <i className="tv-walkout-flood" aria-hidden="true" />
        </div>
        <LampChase color={color} className="tv-walkout-chase" />
        <div className="tv-walkout-team" aria-hidden="true">
          <div className="fd-show is-marquee tv-walkout-teamname" style={{ fontSize:layout.name.size }}>
            {layout.name.lines.map(line => <span key={line}>{line}</span>)}
          </div>
          <div className="tv-walkout-squad">
            {rows.map((row, r) => <div className="tv-walkout-row" key={r}>
              {row.map(p => {
                const label = disp(state, p);
                return <span className={`tv-walkout-member${p === moment.player ? " is-singer" : ""}`} key={p}
                  style={{ "--i":team.players.indexOf(p) }}>
                  <span className="tv-walkout-member-chip">
                    <ChipFace p={p} size={layout.chip} flat />
                    {p === moment.player && moment.track && <span className="tv-walkout-mark">
                      {art ? <img src={art} alt="" width={96} height={96} />
                        : <Icon name="song" size={Math.round(layout.chip * .2)} lit />}
                    </span>}
                  </span>
                  {layout.labelled && <b className="fd-show" style={{ fontSize:walkoutLabelSize(label, layout.slot) }}>{label}</b>}
                </span>;
              })}
            </div>)}
          </div>
          {moment.track && <div className="tv-walkout-credit">
            {art ? <img src={art} alt="" width={112} height={112} />
              : <span className="tv-walkout-credit-disc"><Icon name="song" size={56} lit /></span>}
            <span className="tv-walkout-credit-text">
              <b data-fit="ellipsis">{moment.track.name}</b>
              {moment.track.artists && <span data-fit="ellipsis">{moment.track.artists}</span>}
            </span>
          </div>}
        </div>
      </div>
    </Takeover>
  );
}
