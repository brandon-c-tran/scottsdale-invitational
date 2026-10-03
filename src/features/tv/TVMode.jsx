import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import qrcode from "qrcode-generator";
import {
  ROSTER, disp, resolveWager, resolveCurrentContest, resolveWeekendOperation,
} from "../../../shared/core.js";
import { resolveShowScene } from "../../../shared/show.js";
import { ChipFace } from "../identity/PlayerIdentity.jsx";
import { TextFloor, usePlayerIdentity } from "../identity/PlayerIdentityContext.js";
import { resolvePlayerIdentity } from "../identity/playerIdentity.js";
import { GameMark } from "../../ui/GameMark.jsx";
import { FDMark } from "../../ui/Brand.jsx";
import { ScoreReel } from "../../ui/ScoreReel.jsx";
import { EventName, OneSafe } from "../../ui/OneSafe.jsx";
import { PayoutLadder } from "../../ui/PayoutLadder.jsx";
import { mergeWagerLines } from "../wagers/Wagers.jsx";
import { BetStacks, FitStacks } from "../wagers/BetStacks.jsx";
import { STACK_CAP, contestStacks, stackName, stackMaxHeight } from "../wagers/betStacks.js";
import {
  fmt, signed, editionLabel, oddsLine, phaseBand, placeName,
  tvCanvasFit, tvSceneView, ambientIndex, TV_AMBIENT_MS, TV_AMBIENT_TURN_MS, TV_TICKER_PAGE_MS,
  tvLiveEvent, nextUpEvent, nextOpenMatch, latestResultOf, resultPresentation, resultMomentPhase, resultMomentFor,
  advanceMoment, advanceHoldUntil, correctionMoment, dockCard, decidedWinner, contestSideView,
  tvConnection, tickerItems, tickerSpread, tvBusy, podiumGroups, championView, contestLamp, sideNameFit, tvClock, stageChrome, boardLevel,
} from "./tvModel.js";
import { IntroOverlay, TVDrawReveal } from "./TVCeremony.jsx";
import { TVDraft } from "./TVDraft.jsx";
import { TVPoker } from "./TVPoker.jsx";
import { StageGroups, RosterWall, TrophyCard, TVWinLine, useContestWinLines } from "./TVCards.jsx";
import { winLineFor } from "../standings/winImpact.js";
import { TVBracket } from "./TVBracket.jsx";
import { ChampionMoment } from "./TVChampion.jsx";
import { CROWN_TIMING, useBracketMotion, useCrownMoment } from "./tvMotion.js";
import { ClassPhoto, useClassMoment } from "./TVClassPhoto.jsx";
import { FaceOff } from "./TVFaceOff.jsx";
import { faceOffView, useFaceOff } from "./faceOff.js";
import { frozenAmbient } from "../results/classPhoto.js";
import { crownAnchor } from "../results/crownTiming.js";
import { Backglass } from "./DesertBand.jsx";
import { constellationStars, isNightSky } from "./desertModel.js";
import { weekendPhase } from "../../ui/phase.js";
import { TowersBoard, useTowersMode, towersFailure } from "./TowersBoard.jsx";
import { towerChips, towerLeaders, standingsTowerRows, resultTowerRows } from "./towersModel.js";
import { useServerNow } from "./serverClock.js";
import { serverNow } from "../../lib/serverClock.js";
import { weekendFacts } from "../results/weekendFacts.js";
import { useRoomSound } from "./roomSound.js";
import { SoundUnlockChip } from "./SoundUnlockChip.jsx";
import { SoundEarlyControl, useTvSoundReport, useTvWakeLock } from "./TVDevice.jsx";
import { NowPlaying } from "./NowPlaying.jsx";
import { TVWalkout, useTvWalkout } from "./TVWalkout.jsx";
import { TVPokerMoments, usePokerMoments } from "./TVPokerMoments.jsx";
import { AwardsReveal } from "../awards/TVAwards.jsx";
import { TVGeo } from "./TVGeo.jsx";
import { awardOnTv } from "../../../shared/prompts.js";
import { TVPhotoCard } from "../photos/TVPhotoCard.jsx";
import { tvPhotoGap, tvPhotoRotation, withPhotoTurns } from "../photos/photoModel.js";
import "./tv.css";
import "./tvScenes.css";

const EMPTY = [];
/* The stage: a slim masthead, the board, the standings horizon (the chip
   towers on the painted desert floor) while an event plays, and the ticker
   along the bottom. Canvas pixels. Content keeps EDGE from the canvas's
   sides and SAFE_Y from its top and bottom (a TV's overscan trims up to ~3%
   a side; 5% is title safe); the painting and the frame's lamps alone run
   to the edge. */
export const EDGE = 64;
export const SAFE_Y = 54;
const MAST_PLATE = 64, TICKER_PLATE = 60;
export const MAST_H = SAFE_Y + MAST_PLATE + 6, TICKER_H = 6 + TICKER_PLATE + SAFE_Y;
/* the horizon's floor sits on the painting's floor line (y 856), its
   labels clear of the ticker plate */
const HORIZON_H = 272, HORIZON_BASE = 170;
const HORIZON_SLOT = (1920 - 2 * EDGE) / 13;
/* the bracket or the heats beside the live board */
const SIDE_W = 760, BOARD_W = 1920 - 2 * EDGE;
/* the bracket's room in that panel: the live row (the canvas less the
   masthead, horizon and ticker, less the row's and the panel's padding),
   less the round heads and the up-now outline */
const SIDE_FIT = { width:SIDE_W - 48, height:1080 - MAST_H - HORIZON_H - TICKER_H - 26 - 36 - 34 - 16 };
/* A big bracket (seven entrants up) takes the live row's full width as a
   band under the current match, which stands above it as a compact board:
   the live row (564px between the masthead and the horizon) less its
   padding is the match's 176px and the band's 344px. The band's room is
   less its padding, the round heads and the up-now outline. */
export const BIG_BRACKET = 7;
const BAND_H = 344;
const BAND_FIT = { width:BOARD_W - 56, height:BAND_H - 24 - 34 - 18 };
const reducedMotionNow = () => typeof window !== "undefined"
  && !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

function useCanvasFit() {
  const read = () => typeof window === "undefined"
    ? tvCanvasFit(1920, 1080) : tvCanvasFit(window.innerWidth, window.innerHeight);
  const [fit, setFit] = useState(read);
  useEffect(() => {
    const onResize = () => setFit(read());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return fit;
}

/* Exit TV and Sound early are for whoever is holding the remote: hidden
   on load (a room with no pointer never sees them), shown by a pointer,
   touch or key, and hidden again once it has been still 3 s */
const EXIT_IDLE_MS = 3000;
function usePointerActive() {
  const [active, setActive] = useState(false);
  useEffect(() => {
    let t = null;
    const wake = () => {
      setActive(true);
      clearTimeout(t);
      t = setTimeout(() => setActive(false), EXIT_IDLE_MS);
    };
    const kinds = ["pointermove", "pointerdown", "touchstart", "keydown"];
    kinds.forEach(kind => window.addEventListener(kind, wake, { passive:true }));
    return () => { clearTimeout(t); kinds.forEach(kind => window.removeEventListener(kind, wake)); };
  }, []);
  return active;
}

/* a display size that keeps a name on one line where it can stand at 60%
   of its full size, else fits its longest word and lets it wrap */
const fitLine = (text, max, width) => {
  const one = Math.floor(width / (Math.max(4, String(text || "").length) * 0.5));
  return one >= max * 0.6 ? Math.min(max, one) : fitDisplay(text, max, width);
};
/* a display size that fits a name's longest word into its column */
const fitDisplay = (text, max, width) => {
  const longest = Math.max(4, ...String(text || "").split(/\s+/).map(word => word.length));
  return Math.max(40, Math.min(max, Math.floor(width / (longest * 0.5))));
};


/* players as their photo chips: the identity chip with the saved photo in
   its middle, else the jersey number. One treatment everywhere on the TV. */
/* more than five faces stand in balanced rows (six is three and three),
   never a row of five and one left alone */
function Faces({ players, size, overlap = false, className = "", maxCols = 5 }) {
  const rows = !overlap && players.length > maxCols ? Math.ceil(players.length / 2) : 0;
  return (
    <div className={`tv-faces${overlap ? " is-overlap" : ""}${rows ? " is-rows" : ""}${className ? ` ${className}` : ""}`}
      style={overlap ? { "--overlap":`${-Math.round(size * 0.3)}px` } : rows ? { "--face-cols":rows } : undefined}>
      {players.map(p => <ChipFace key={p} p={p} size={size} />)}
    </div>
  );
}

/* The slim masthead: the FD chip and the event being played in backglass
   lettering, its lamp (betting open flashes, play is steady), and the wall
   clock. Nothing live: the weekend's name. The dock (a correction, a lead
   change) takes the clock's place. */
function Masthead({ event = null, lamp = null, connection, lastUpdateAt, final, dock, now, playing = null }) {
  const offline = connection.mode === "reconnecting";
  return (
    <header className="tv-mast">
      <div className="tv-mast-plate" data-fit-region="masthead">
        <FDMark size={52} variant="night" />
        {event ? <>
          <span className="tv-mast-event fd-show"><EventName name={event.name} /></span>
          {lamp && <span className={`tv-status is-${lamp.state}`}><i className={`fd-insert${lamp.state === "pending" ? " is-pending" : ""}`} />
            {lamp.label}</span>}
        </> : <>
          <span className="tv-mast-title fd-show">Field Day</span>
          <span className="tv-mast-edition">{editionLabel()}</span>
        </>}
      </div>
      {playing}
      <div className="tv-mast-right" data-fit-region="masthead">
        {dock ? <div className="tv-dock">{dock}</div>
          : offline ? <span className="tv-status is-offline" role="status"><i />
            Reconnecting</span>
            : final ? <span className="tv-status is-final">Final</span>
              : (clock => <span className="tv-mast-clock" aria-label={`Time ${clock.time} ${clock.period}`.trim()}>
                {clock.time}{clock.period && <small>{clock.period}</small>}</span>)(tvClock(now))}
      </div>
    </header>
  );
}

/* one fact on the ticker's glass: its label, the people in it as photo
   chips, then the fact, an amount set as a numeral in its role's ink */
function TickerItem({ it, className = "" }) {
  const parts = it.parts || [it.text];
  return (
    <div className={`tv-ticker-item${className ? ` ${className}` : ""}`}>
      <span className="tv-ticker-tag">{it.tag}</span>
      {(it.players || []).length > 0 && <Faces players={it.players} size={44} overlap={it.players.length > 2} />}
      <span className={`tv-ticker-text${parts.some(part => part?.ladder) ? " has-ladder" : ""}`}>{parts.map((part, i) => typeof part === "string" ? <React.Fragment key={i}>{part}</React.Fragment>
        : part.ladder ? <PayoutLadder key={i} pays={part.ladder} size="ticker" className="tv-ticker-ladder" />
        : <b key={i} className={`tv-ticker-amount is-${part.role || "chip"}`}>{part.amount}</b>)}</span>
    </div>
  );
}
/* one page of the plate: two short facts side by side, or one alone,
   centered across it */
function TickerPage({ items, className = "" }) {
  return (
    <div className={`tv-ticker-page${items.length > 1 ? " is-pair" : " is-solo"}${className ? ` ${className}` : ""}`}>
      {items.map((it, i) => <TickerItem key={i} it={it} />)}
    </div>
  );
}
/* A page at a time, held on the server clock so every TV shows the same
   one; the outgoing page fades as the next arrives. Reduced motion cuts. */
function Ticker({ items, reducedMotion, now }) {
  const page = tickerSpread(items, now);
  const age = Math.max(0, Number(now) || 0) % TV_TICKER_PAGE_MS;
  const prev = !reducedMotion && page.pages > 1 && age < 1000 ? tickerSpread(items, now - TV_TICKER_PAGE_MS) : null;
  return (
    <div className={`tv-ticker${reducedMotion ? " is-cut" : ""}`} aria-label={`Ticker, ${page.index + 1} of ${page.pages}`}>
      <div className="tv-ticker-glass" aria-hidden="true" data-fit-region="ticker" />
      {prev && prev.index !== page.index && prev.items.length > 0 && <TickerPage key={`out-${prev.index}`} items={prev.items}
        className="is-leaving" />}
      {page.items.length > 0 && <TickerPage key={`in-${page.index}`} items={page.items}
        className={page.pages > 1 ? "is-entering" : ""} />}
    </div>
  );
}

/* all thirteen, the leader's count as the board's one reel, every other
   row a plain numeral: the flat board where the towers cannot draw */
function StandingsBoard({ state, standings, allTied, title }) {
  const leader = !allTied ? standings[0] : null;
  const rest = leader ? standings.slice(1) : standings;
  const half = Math.ceil(rest.length / 2);
  return (
    <div className="tv-board">
      {title && <div className="tv-display tv-title">{title}</div>}
      {leader && (
        <div className="tv-leader">
          <div className="tv-rank">1</div>
          <ChipFace p={leader.player} size={72} />
          <div className="tv-name">{disp(state, leader.player)}</div>
          <ScoreReel value={leader.pts} tone="chip" className="tv-pts" />
        </div>
      )}
      <div className="tv-board-cols">
        {[rest.slice(0, half), rest.slice(half)].map((col, ci) => (
          <div key={ci} className="tv-board-col">
            {col.map(r => (
              <div key={r.player} className={`tv-row${!allTied && r.rank === 2 ? " is-silver"
                : !allTied && r.rank === 3 ? " is-bronze" : ""}`}>
                <div className="tv-rank">{allTied ? "·" : r.rank}</div>
                <ChipFace p={r.player} size={56} />
                <div className="tv-name">{disp(state, r.player)}</div>
                <span className="tv-pts">{fmt(r.pts)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Chip Towers: the standings as stacks of each player's own chip ──
   The towers are a transparent WebGL layer on the painted desert floor,
   loaded only on a TV that can draw it; the names and reels are HTML. */
/* the towers' floor in their pane: the painting's floor line, with the
   labels' two lines under it clear of the ticker */
const towerBase = height => height - 106;
/* every tower's label is one fixed slot with a gutter on each side, so
   neighbours never touch however long a name runs */
export const TOWER_LABEL_W = 132;
/* the name fits the slot on one line: as large as it goes (30px down to
   24), and a name still wider at 24 is narrowed to the slot (measured in
   the browser, `squeeze` is the estimate), so every tower's count stands on
   one baseline; never two lines, never an ellipsis */
export const towerNameFit = name => {
  const text = String(name || "").toUpperCase();
  const size = Math.max(24, Math.min(30, Math.floor(TOWER_LABEL_W / Math.max(1, text.length * 0.5))));
  const est = text.length * 0.5 * size;
  return { size, lines:[text], squeeze:est > TOWER_LABEL_W ? Math.max(0.75, TOWER_LABEL_W / est) : 1 };
};
export const towerNameSize = name => towerNameFit(name).size;
/* A tower's label at rest is its name and one plain numeral; position is
   the rank. On a result's step (`change`) the move shows once: a mover's
   change takes the count's line and fades, a tower that did not move shows
   nothing there, every name stays (the winner's lit green), then the board
   is at rest again. */
const towerLabel = (state, { change = false } = {}) => row => {
  const name = disp(state, row.player);
  const delta = change ? (row.award || 0) + (row.bets || 0) : 0;
  return <>
    {delta ? <span className={`tv-tower-delta${delta < 0 ? " is-down" : ""}`}>{signed(delta)}</span> : null}
    <TowerName name={name} />
    <span className="tv-tower-pts">{fmt(row.pts)}</span>
  </>;
};
function TowerName({ name }) {
  const fit = towerNameFit(name);
  const ref = useRef(null);
  const [squeeze, setSqueeze] = useState(fit.squeeze);
  useLayoutEffect(() => {
    let live = true;
    const measure = () => {
      const w = ref.current?.offsetWidth || 0;
      if (live && w) setSqueeze(Math.min(1, TOWER_LABEL_W / w));
    };
    measure();
    document.fonts?.ready?.then(measure);
    return () => { live = false; };
  }, [name, fit.size]);
  return <b className="tv-tower-name" style={{ fontSize:fit.size }}>
    <span ref={ref} className="tv-tower-name-text" style={squeeze < 1 ? { transform:`scaleX(${squeeze.toFixed(3)})` } : undefined}>
      {name}</span></b>;
}
const towerMoved = row => !!((row.award || 0) + (row.bets || 0));
const towerClass = winners => row => `${towerMoved(row) ? "is-moved" : "is-still"}${winners.has(row.player) ? " is-win" : ""}`;
/* the sky above the towers: a sign, or a result's headline in the empty
   upper half (the towers stand under it) */
const HEADLINE_TOP = 330;
function TowersView({ state, rows, head = null, headline = null, winners = null, height, towers, fallback, change = false,
  sound = "fresh" }) {
  const leaders = towerLeaders(rows);
  return (
    <div className={`tv-towers-pane${change ? " is-change" : ""}`}>
      <TowersBoard fallback={fallback} rows={rows} leaders={leaders} width={1920} height={height}
        baseY={towerBase(height)} top={headline ? HEADLINE_TOP : head ? 120 : 40} pixelRatio={towers.pixelRatio}
        reducedMotion={towers.reducedMotion} labelFor={towerLabel(state, { change })}
        labelClass={change ? towerClass(winners || new Set()) : null} sound={sound} />
      {headline}
      {head && <div className="tv-towers-head tv-sign">{head}</div>}
    </div>
  );
}

/* the flat horizon where WebGL is absent: each player's chip on a painted
   column one chip-edge per 100, in the same fixed slots */
function FlatTower({ p, chips, px }) {
  const identity = usePlayerIdentity(p);
  const h = Math.max(4, Math.round(chips * px));
  const edges = [];
  if (px >= 4) for (let i = 1; i < chips; i++) edges.push(Math.round(h - i * px));
  return (
    <svg className="tv-flat-tower" width="60" height={h} viewBox={`0 0 60 ${h}`} aria-hidden="true">
      <rect width="60" height={h} rx="4" style={{ fill:identity.color }} />
      {edges.length > 0 && <g className="tv-flat-edges">{edges.map(y => <line key={y} x1="0" x2="60" y1={y} y2={y} />)}</g>}
    </svg>
  );
}
function FlatHorizon({ rows, label }) {
  const tallest = Math.max(1, ...rows.map(row => towerChips(row.pts)));
  const px = Math.min(12, (HORIZON_BASE - 84) / tallest);
  return (
    <div className="tv-flat-horizon">
      {rows.map(row => (
        <div key={row.player} className="tv-flat-slot">
          <div className="tv-flat-stand" style={{ height:HORIZON_BASE }}>
            <ChipFace p={row.player} size={68} />
            <FlatTower p={row.player} chips={towerChips(row.pts)} px={px} />
          </div>
          <div className="tv-tower-label is-flat">{label(row)}</div>
        </div>
      ))}
    </div>
  );
}
/* The standings horizon under the live board: all thirteen towers in rank
   order on the desert floor, each in its own slot with its name and reel.
   It replaces the old standings rail, so the board gets the full width. */
function Horizon({ state, standings, towers }) {
  const rows = standingsTowerRows(standings);
  const label = towerLabel(state);
  const flat = <FlatHorizon rows={rows} label={label} />;
  return (
    <section className="tv-horizon" aria-label="Standings">
      {towers.on ? <TowersBoard fallback={flat} rows={rows} width={1920} height={HORIZON_H} baseY={HORIZON_BASE} top={8}
        slotWidth={HORIZON_SLOT} pixelRatio={towers.pixelRatio} reducedMotion={towers.reducedMotion} labelFor={label} />
        : flat}
    </section>
  );
}

/* A side's name, as large as its column allows, on one line or two lines
   broken at the team's "&". */
function SideName({ name, width, max, min }) {
  const fit = sideNameFit(name, width, { max, min, caps:true });
  return (
    <div className="tv-side-title" style={{ fontSize:fit.size }}>
      <div className="tv-side-name">{fit.lines.length > 1 ? <>{fit.lines[0]}<br />{fit.lines[1]}</> : name}</div>
    </div>
  );
}

/* The current contest, large: every side's photo chips and name, and the
   chips riding it as each bettor's own stack, a first name under each and
   the side's total at the head of its felt. Any two-sided contest is a
   head-to-head. A bracket match is the up-now board: lit, round named
   once. A wide field is one felt with a spot per side. */
const TV_STACKS = {
  h2h:{ face:96, faceMany:64, chip:64 },
  grid:{ face:72, faceMany:56, chip:52 },
};
const PANEL_PAD = 28;
const FIELD = { gap:14, chip:44, small:40 };
/* a wide field's felt: one row up to seven sides, two past that; every spot
   one fixed size before any chip lands, its stack band as tall as the
   tallest stack with its value and first name */
export function fieldLayout(count, width) {
  const n = Math.max(1, count);
  const rows = n > 7 ? 2 : 1;
  const perRow = Math.ceil(n / rows);
  const spot = Math.floor((width - (perRow - 1) * FIELD.gap) / perRow);
  const chip = spot >= 220 ? FIELD.chip : FIELD.small;
  return { rows, perRow, spot, chip, slots:Math.max(1, Math.floor((spot - 24) / 84)), stackH:Math.ceil(stackMaxHeight(chip) + 58) };
}
function FieldFelt({ state, ev, contest, stacks, width }) {
  const layout = fieldLayout(contest.sides.length, width);
  const any = contest.sides.some(side => (stacks.get(side.key)?.stacks.length || 0) > 0);
  return (
    <div className={`tv-sides is-field${any ? "" : " is-quiet"}`}
      style={{ gridTemplateColumns:`repeat(${layout.perRow}, minmax(0, 1fr))`, "--field-stack-h":`${layout.stackH}px` }}>
      {contest.sides.map(side => {
        const view = contestSideView(state, ev, contest, side);
        const ride = stacks.get(side.key) || { stacks:[], total:0 };
        const face = view.players.length > 1 ? 44 : 56;
        const facesW = face + (view.players.length - 1) * face * 0.7;
        /* one stack carries its own amount; two or more get the side's total */
        const summed = ride.stacks.length > 1;
        return (
          <div key={String(side.key)} className={`tv-side is-spot${ride.stacks.length ? " has-chips" : ""}`}>
            <div className="tv-spot-id">
              <Faces players={view.players} size={face} overlap />
              <SideName name={view.name} width={layout.spot - 28 - facesW - 12} max={40} min={24} />
            </div>
            {any && <div className="tv-spot-felt">
              {summed && <div className="tv-side-total">{fmt(ride.total)}</div>}
              {ride.stacks.length > 0 && <BetStacks stacks={ride.stacks} size={layout.chip} cap={STACK_CAP} className="tv-stacks"
                names={p => stackName(state, p)} slots={layout.slots} />}
            </div>}
          </div>
        );
      })}
    </div>
  );
}
/* The current match above a big bracket's band: one row, the two sides
   facing each other across VS with the payout under it. With bets each
   side's stacks stand beside its name; with none the faces and names take
   the room (no empty felt, no "No bets" line). The round is the bracket's
   own outline below, never a second heading. */
function ContestBand({ state, ev, contest, stacks, width, lamp }) {
  const any = contest.sides.some(side => (stacks.get(side.key)?.stacks.length || 0) > 0);
  const half = Math.floor((width - PANEL_PAD * 2 - 260) / 2);
  const cards = contest.sides.map((side, index) => {
    const view = contestSideView(state, ev, contest, side);
    const ride = stacks.get(side.key) || { stacks:[], total:0 };
    const face = any ? 76 : 112;
    const facesW = face + (view.players.length - 1) * face * 0.7;
    const nameW = (any ? Math.floor(half * 0.46) : half) - facesW - 24;
    return (
      <div key={String(side.key)} className={`tv-side is-band${index ? " is-right" : ""}${ride.stacks.length ? " has-chips" : ""}`}>
        <div className="tv-side-top">
          <Faces players={view.players} size={face} overlap={view.players.length > 1} />
          <SideName name={view.name} width={nameW} max={any ? 60 : 88} min={36} />
        </div>
        {any && <div className={`tv-felt${ride.stacks.length ? "" : " is-empty"}`}>
          {ride.total > 0 && <div className="tv-side-total">{fmt(ride.total)}</div>}
          {ride.stacks.length > 0 && <FitStacks stacks={ride.stacks} total={0} chip={48} cap={STACK_CAP} min={30}
            className="tv-stacks-fit" names={p => stackName(state, p)} valueAt="below" />}
        </div>}
      </div>
    );
  });
  return (
    <div className={`tv-contest tv-glass is-band${any ? "" : " is-quiet"}${lamp ? " fd-lamp is-live" : ""}`}>
      <div className="tv-sides is-h2h">
        {cards[0]}
        <div className="tv-versus-col">
          <div className="tv-versus fd-show" aria-label="versus">VS</div>
          <div className="tv-contest-odds">{oddsLine(contest)}</div>
        </div>
        {cards[1]}
      </div>
    </div>
  );
}

/* "Round 1 · Match 3" reads as "Round 1 Match 3", "Semifinals · Match 2"
   as "Semifinal 2" (the shape of bracketMatchName in core) */
export const matchTitle = label => {
  const match = /^(.*) · Match (\d+)$/.exec(String(label || ""));
  if (!match) return label;
  const [, round, n] = match;
  /* an older stored label: a final is just "Final" */
  if (/^Finals?$/.test(round)) return "Final";
  return /\d$/.test(round) ? `${round} Match ${n}` : `${round.replace(/s$/, "")} ${n}`;
};
function ContestBoard({ state, events, ev, contest, width = BOARD_W }) {
  const stacks = contestStacks(state, events, contest);
  const n = contest.sides.length;
  const h2h = n === 2;
  const field = n > 4;
  /* X8: a wide field's spots have no room for the line */
  const winLines = useContestWinLines(state, ev, field ? null : contest, events);
  const lamp = contestLamp(contest);
  const upNow = contest.kind === "match";
  /* the match by its name ("Semifinal 1", "Round 1 Match 3"): the lit lamp
     beside it says it is the one being played */
  const head = upNow ? matchTitle(contest.label) : contest.label !== ev.name ? contest.label : null;
  const size = h2h ? TV_STACKS.h2h : TV_STACKS.grid;
  const inner = width - PANEL_PAD * 2;
  /* every felt on the board draws one chip size: each reports the level it
     needs, and all stand at the deepest */
  const [fitNeed, setFitNeed] = useState({});
  const sideKeys = contest.sides.map(side => String(side.key));
  const floor = Math.max(0, ...sideKeys.map(key => fitNeed[`${contest.id}:${key}`] || 0));
  const ladder = Math.max(0, ...contest.sides.map(side => stacks.get(side.key)?.stacks.length || 0));
  const reportFit = key => level => setFitNeed(prev => prev[key] === level ? prev : { ...prev, [key]:level });
  const any = contest.sides.some(side => (stacks.get(side.key)?.stacks.length || 0) > 0);
  let body;
  if (field) body = <FieldFelt state={state} ev={ev} contest={contest} stacks={stacks} width={inner} />;
  else {
    const anyWinLine = contest.sides.some(side => !!winLineFor(winLines, side.key));
    /* three or four sides stand in one row, each its full height */
    const sideW = h2h ? Math.floor((inner - 120 - 2 * 16) / 2) - 40 : Math.floor((inner - (n - 1) * 16) / n) - 40;
    const cols = h2h ? "minmax(0, 1fr) auto minmax(0, 1fr)" : `repeat(${n}, minmax(0, 1fr))`;
    const cards = contest.sides.map(side => {
      const view = contestSideView(state, ev, contest, side);
      const ride = stacks.get(side.key) || { stacks:[], total:0 };
      /* a team past three: the name on its own line, the chips overlapped under it */
      const many = view.players.length > 3;
      const face = many ? 56 : view.players.length > 2 ? size.faceMany : size.face;
      const facesW = view.players.length * (face + 8);
      /* a felt fits any number of bettors without covering its total (P1); the
         stacks stand as one pile centered in it */
      const felt = ride.stacks.length > 0 && <FitStacks stacks={ride.stacks} total={0}
        chip={size.chip} cap={STACK_CAP} min={34} className="tv-stacks-fit" names={p => stackName(state, p)}
        valueAt="below" ladder={ladder} floor={floor} onLevel={reportFit(`${contest.id}:${String(side.key)}`)} />;
      return (
        <div key={String(side.key)} className={`tv-side${ride.stacks.length ? " has-chips" : ""}`}>
          <div className={`tv-side-top${many ? " is-many" : ""}`}>
            {many && <SideName name={view.name} width={sideW} max={h2h ? 64 : 48} min={36} />}
            <Faces players={view.players} size={face} overlap={many} />
            {!many && <SideName name={view.name} width={h2h ? sideW - facesW - 18 : sideW} max={h2h ? 64 : 48} min={h2h ? 44 : 32} />}
          </div>
          {anyWinLine && <div className="tv-side-win"><TVWinLine lines={winLines} sideKey={side.key} /></div>}
          {any && <div className={`tv-felt${ride.stacks.length ? "" : " is-empty"}`}>
            {ride.total > 0 && <div className="tv-side-total">{fmt(ride.total)}</div>}
            {felt || <span className="tv-felt-empty">No bets</span>}
          </div>}
        </div>
      );
    });
    body = (
      <div className={`tv-sides${h2h ? " is-h2h" : " is-grid"}${any ? "" : " is-quiet"}`} style={{ gridTemplateColumns:cols }}>
        {h2h ? [cards[0], <div key="vs" className="tv-versus fd-show" aria-label="versus">VS</div>, cards[1]] : cards}
      </div>
    );
  }
  return (
    <div className={`tv-contest tv-glass${upNow ? " is-up-now" : ""}${lamp ? " fd-lamp is-live" : ""}`}>
      {head && <div className="tv-contest-head">
        {upNow && <i className="fd-beat-dot tv-beat" aria-hidden="true" />}<OneSafe text={head} /></div>}
      {body}
      <div className="tv-contest-foot">{oddsLine(contest)}</div>
    </div>
  );
}

/* a finished bracket or stage waiting on its official result: the room sees
   who won it and the whole draw, never the commissioner's next step */
function DecidedWinner({ state, ev, winner, motion = null }) {
  const plural = winner.players.length > 1;
  return (
    <div className="tv-decided">
      <div className="tv-decided-winner tv-glass">
        <Faces players={winner.players} size={96} />
        <div className="tv-display tv-decided-name">{winner.name}</div>
        <div className="fd-show is-marquee tv-decided-stamp">{plural ? "Win" : "Wins"}</div>
      </div>
      {state.brackets?.[ev.id] ? <TVBracket state={state} ev={ev} motion={motion} /> : <StageGroups state={state} ev={ev} />}
    </div>
  );
}

/* The decided contest's chips settle: the winners' stacks grow by their
   payout, every other stack slides back to the bank. One row, always: past
   `fit` stacks a zone folds its smallest into one "+N" stack, so a crowd of
   bettors never stacks the board into a column. */
const SETTLE_LOSE_AT = 700, SETTLE_PAY_AT = 1300;
const SETTLE_FIT = { won:6, lost:3 }, SETTLE_SLOT_FIT = { won:4, lost:2 };
function SettleBoard({ state, settle, size = 56, fit = SETTLE_FIT }) {
  if (!settle?.any) return null;
  const names = p => stackName(state, p);
  return (
    <div className="tv-settle">
      {settle.winners.length > 0 && <div className="tv-settle-zone is-won">
        <div className="tv-settle-head" style={{ animationDelay:`${SETTLE_PAY_AT}ms` }}>{signed(settle.paid)}</div>
        <BetStacks stacks={settle.winners} size={size} names={names} delay={SETTLE_PAY_AT} className="tv-stacks"
          slots={fit.won} valueAt="below" />
      </div>}
      {settle.losers.length > 0 && <div className="tv-settle-zone is-lost">
        <div className="tv-settle-head" style={{ animationDelay:`${SETTLE_LOSE_AT}ms` }}>{signed(-settle.lost)}</div>
        <BetStacks stacks={settle.losers} size={size} names={names} delay={SETTLE_LOSE_AT} className="tv-stacks"
          slots={fit.lost} valueAt="below" />
      </div>}
    </div>
  );
}

/* the round under the stamp, with what the win means next: each its own
   unit, spaced apart, never joined by a dot */
const AdvanceDetail = ({ moment }) => {
  const parts = [moment.round, ...String(moment.detail || "").split(" · ")].filter(Boolean);
  return parts.length ? <div className="tv-advance-detail">{parts.map(part => <span key={part}>{part}</span>)}</div> : null;
};
function AdvanceMoment({ state, moment, slot = false }) {
  const chips = !!moment.settle?.any;
  /* over a bracket, the card keeps to the contest's space so the bracket
     beside it can carry the winners forward; with bets to pay, the winner
     sits on top and the chips settle in one row under it */
  if (slot) return (
    <div className={`tv-advance is-slot${chips ? " has-settle" : ""}`} role="status">
      <div className="tv-advance-who">
        <div className="tv-advance-line">
          <Faces players={moment.players} size={chips ? 72 : 88} />
          <div className="tv-display tv-advance-name">{moment.name}</div>
        </div>
        <div className="tv-advance-call">
          <div key={moment.id} className="fd-show is-marquee tv-advance-stamp">{moment.verb}</div>
          <AdvanceDetail moment={moment} />
        </div>
      </div>
      <SettleBoard key={`settle-${moment.id}`} state={state} settle={moment.settle} size={48} fit={SETTLE_SLOT_FIT} />
    </div>
  );
  return (
    <div className={`tv-advance${chips ? " has-settle" : ""}`} role="status">
      <Faces players={moment.players} size={chips ? 104 : 128} />
      <div className="tv-display tv-advance-name">{moment.name}</div>
      <div key={moment.id} className="fd-show is-marquee tv-advance-stamp">{moment.verb}</div>
      <AdvanceDetail moment={moment} />
      <SettleBoard key={`settle-${moment.id}`} state={state} settle={moment.settle} />
    </div>
  );
}

function LeadChange({ state, leader, previous }) {
  if (!leader) return null;
  const names = leader.players.map(p => disp(state, p));
  return (
    <div className="tv-leadchange" role="status">
      <Faces players={leader.players.slice(0, 3)} size={52} overlap />
      <b>{names.join(" and ")} {names.length > 1 ? "lead" : "leads"}</b>
      <b className="tv-leadchange-pts">{fmt(leader.pts)}</b>
      {previous && (
        <span className="tv-prev" aria-label={`Previously ${previous.players.map(p => disp(state, p)).join(" and ")}`}>
          <Faces players={previous.players.slice(0, 2)} size={40} overlap />
        </span>
      )}
    </div>
  );
}
function CorrectionCard({ correction }) {
  return (
    <div className="tv-correction" role="status">
      <Faces players={correction.players.slice(0, 3)} size={48} overlap />
      <b>Corrected</b><span>{correction.text}</span>
    </div>
  );
}

/* one podium place: a single side large, a split place stacked, a wide tie
   counted */
function PodiumPlace({ state, item, backers = null }) {
  const first = item.place === 1;
  /* a win lights the glass for its winner: one winning side's own color */
  const lit = first && item.groups.length === 1 ? resolvePlayerIdentity(state.profiles, item.players[0]).color : null;
  const width = first ? 620 : 470;
  const single = item.groups.length === 1;
  const wide = item.groups.length > 3;
  const riding = first && backers?.winners?.length > 0;
  /* a team stands in one row of faces where the pane has the width */
  const inner = width - 40;
  const base = first ? (item.players.length > 4 ? 76 : item.players.length > 2 ? 104 : riding ? 128 : 176)
    : item.players.length > 2 ? 76 : 120;
  /* up to seven stand in one row, shrunk to the pane's width (never under
     56); more stand in balanced rows */
  const face = item.players.length > 2 && item.players.length <= 7
    ? Math.max(56, Math.min(base, Math.floor((inner + 12) / item.players.length) - 12)) : base;
  const cols = Math.max(1, Math.floor((inner + 12) / (face + 12)));
  return (
    <div className={`tv-place${first ? " is-first" : " tv-glass"}${lit ? " is-lit" : ""}`} style={lit ? { "--win":lit } : undefined}>
      <div className="tv-place-rank"><OneSafe text={placeName(item.place)} /></div>
      {single || wide ? <>
        <Faces players={item.players} size={wide ? 64 : face} className="tv-place-faces" maxCols={cols} />
        <div className="tv-display tv-place-name"
          style={{ fontSize:fitLine(item.names[0], first ? 104 : 64, width) }}>{item.names[0]}</div>
      </> : (
        <div className="tv-place-split">
          {item.groups.map(group => (
            <div key={group.name} className="tv-place-group">
              <Faces players={group.players} size={first ? 96 : 64} />
              <div className="tv-display tv-place-group-name">{group.name}</div>
            </div>
          ))}
        </div>
      )}
      {item.amount ? <div className="tv-place-amount">
        {item.unit === "stack" ? `${fmt(item.amount)} chips` : `+${fmt(item.amount)}${item.players.length > 1 ? " each" : ""}`}
      </div> : null}
      {riding && <div className="tv-place-backers">
        <div className="tv-settle-head" style={{ animationDelay:"900ms" }}>{signed(backers.paid)}</div>
        <BetStacks stacks={backers.winners} size={46} names={p => stackName(state, p)} delay={900}
          className="tv-stacks" valueAt="below" />
      </div>}
    </div>
  );
}

/* A result's step, over the towers: the event and its winner in the
   backglass lettering, in the sky the towers leave empty; a lead change
   under it once the towers have sorted. */
function ResultHeadline({ model, lead = null }) {
  const first = model.podium.find(item => item.place === 1);
  if (!first) return null;
  const wide = first.groups.length > 3;
  const plural = first.groups.length > 1 || first.players.length > 1;
  const text = wide ? first.names[0] : `${first.names.join(" and ")} ${plural ? "win" : "wins"}`;
  const size = Math.max(72, Math.min(128, Math.floor(1500 / (Math.max(8, text.length) * 0.5))));
  return (
    <div className="tv-result-headline" role="status">
      <div className="fd-show tv-result-headline-event"><EventName name={model.eventName} /></div>
      <div className="tv-result-headline-win">
        {!wide && <Faces players={first.players.slice(0, 4)} size={96} overlap={first.players.length > 2} />}
        <span className="fd-show is-marquee tv-result-headline-name" style={{ fontSize:size }}>{text}</span>
      </div>
      {lead}
    </div>
  );
}

const ROW_STEP = 60;
/* one result, told twice: a podium climbing third to first, then all thirteen
   moving from where they stood to where they stand, each mover's change
   shown once (poker: final stacks). */
function ResultSequence({ state, model, phase, towers = null }) {
  if (!model) return null;
  if (phase.phase === "podium") {
    const shown = new Set(model.revealOrder.slice(0, Math.min(model.revealOrder.length, phase.revealed)).map(p => p.place));
    const at = place => model.podium.find(item => item.place === place);
    return (
      <div className="tv-pane tv-result">
        <div className="tv-result-head tv-sign">
          <GameMark id={model.game} variant={model.variant} size={88} />
          <div>
            <div className="fd-show tv-result-name"><EventName name={model.eventName} /></div>
            <div className="tv-label tv-result-sub">{model.kind === "stacks" ? "Final stacks" : "Final"}</div>
          </div>
        </div>
        <div className="tv-podium">
          {[2, 1, 3].map(place => {
            const item = at(place);
            if (!item || !shown.has(place)) return <div key={place} className="tv-place-slot" />;
            return <PodiumPlace key={place} state={state} item={item} backers={model.winnerStacks} />;
          })}
        </div>
      </div>
    );
  }
  const order = phase.sorted ? model.rows.map(row => row.player) : model.beforeOrder;
  const leaderSet = new Set(model.leader?.players || []);
  const head = (
    <div className="tv-result-rows-head">
      <div className="tv-display tv-title">{model.kind === "stacks" ? "Final stacks" : "Standings"}</div>
      <div className="tv-result-rows-event">{model.eventName}</div>
      <div style={{ marginLeft:"auto" }}>
        {phase.sorted && model.leadChanged && <LeadChange state={state} leader={model.leader} previous={model.previousLeader} />}
      </div>
    </div>
  );
  const flat = (
    <div className="tv-pane tv-result-rows">
      {head}
      <div className="tv-move-list" style={{ height:ROW_STEP * model.rows.length }}>
        {model.rows.map(row => {
          const index = order.indexOf(row.player);
          const pts = phase.sorted ? row.after : row.before;
          const rank = phase.sorted ? row.rankAfter : row.rankBefore;
          return (
            <div key={row.player} className={`tv-move-row${phase.sorted && leaderSet.has(row.player) ? " is-lead" : ""}${row.busted ? " is-out" : ""}${row.away ? " is-away" : ""}`}
              style={{ top:index * ROW_STEP }}>
              <span className="tv-rank">{rank}</span>
              <ChipFace p={row.player} size={44} />
              <span className="tv-name">{disp(state, row.player)}</span>
              {model.kind === "stacks" ? (
                <span className="tv-split">{row.away ? "Away" : row.busted ? "Busted" : `Started ${fmt(row.before)}`}</span>
              ) : <span className={`tv-split${row.change < 0 ? " is-down" : ""}`}>
                {phase.sorted && row.change ? signed(row.change) : null}</span>}
              <span className="tv-pts">{fmt(pts)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
  if (towers?.on && model.kind !== "stacks") {
    const winners = new Set(model.podium.find(item => item.place === 1)?.players || []);
    const lead = phase.sorted && model.leadChanged ? <LeadChange state={state} leader={model.leader} previous={model.previousLeader} /> : null;
    return <TowersView state={state} rows={resultTowerRows(model, phase.sorted)} height={towers.height} winners={winners}
      headline={<ResultHeadline model={model} lead={lead} />} towers={towers} fallback={flat} change={phase.sorted} sound="scene" />;
  }
  return flat;
}


function DirectedScene({ state, events, scene, now, standings, reducedMotion, towers = null, crown = null,
  classMoment = null }) {
  const kind = scene.active.kind;
  if (kind === "standings") {
    const flat = <div className="tv-pane"><StandingsBoard state={state} standings={standings} allTied={false}
      title="Standings" /></div>;
    return towers?.on ? <TowersView state={state} rows={standingsTowerRows(standings)}
      head={<div className="tv-display tv-title">Standings</div>}
      height={towers.height} towers={towers} fallback={flat} /> : flat;
  }
  if (kind === "champion") {
    /* D3: the champion scene's second step is the class photo */
    if (scene.stepKey === "class")
      return <ClassPhoto state={state} events={events} standings={scene.standings} moment={classMoment} />;
    const view = championView(state, events, scene.standings);
    return view ? <ChampionMoment state={state} view={view} standings={scene.standings} moment={crown} /> : null;
  }
  if (kind === "opening") {
    if (scene.stepKey === "room") return <RosterWall state={state} />;
    return (
      <div className="tv-pane tv-center">
        <div className="tv-opening tv-sign">
          <FDMark size={150} variant="night" />
          <div className="fd-show is-marquee tv-opening-title">Field Day</div>
          <div className="tv-mast-edition">{editionLabel()}</div>
        </div>
      </div>
    );
  }
  if (kind === "winner") {
    const model = resultPresentation(state, events, scene.active.eventId);
    const anchor = scene.stepKey === "standings" ? Number(scene.active.updatedAt) : Number(scene.active.startedAt);
    const phase = resultMomentPhase(anchor, now, { reducedMotion, step:scene.stepKey });
    return <ResultSequence state={state} model={model} phase={phase} towers={towers} />;
  }
  return null;
}

/* what is next: its mark, its name, and what it pays as a ladder; the
   rules are a phone's tap away, never a paragraph on the wall */
function NextUpCard({ ev }) {
  return (
    <div className="tv-pane tv-center">
      <div className="tv-next-card tv-glass">
        <span className="tv-next-band" style={{ background:phaseBand(ev) }} />
        <div className="tv-next-head">
          <GameMark id={ev.game} variant={ev.variant} size={96} />
          <div className="fd-show is-marquee tv-next-name"><EventName name={ev.name} /></div>
        </div>
        <PayoutLadder ev={ev} size="tv" className="tv-next-ladder" />
      </div>
    </div>
  );
}

/* ═════════════ the TV ═════════════ */
function TVMode({ standings, state, events, onDeckEv: onDeckInput, allTied: allTiedInput, champion, coChamps, showControlEnabled,
  rankDeltas = {}, connection: connectionInput = {}, onExit, ceremony = null, now: nowOverride,
  onSoundStatus = null }) {
  /* a level board has no leader and no ranks, whatever the caller says */
  const allTied = !!allTiedInput || (!state.frozen && boardLevel(standings));
  const tickNow = useServerNow(nowOverride === undefined ? 1000 : 0);
  useTvWakeLock();
  useTvSoundReport(onSoundStatus);
  const now = nowOverride ?? tickNow;
  /* the intro reads the room's clock once, when it opens */
  const introClock = useCallback(() => nowOverride ?? serverNow(), [nowOverride]);
  const fit = useCanvasFit();
  const reducedMotion = reducedMotionNow();
  const connection = tvConnection(connectionInput);
  const lastUpdateAt = useLastUpdate(connectionInput.version);
  const pointerActive = usePointerActive();
  const towersMode = useTowersMode();

  const operation = useMemo(() => resolveWeekendOperation(state, events), [state, events]);
  const showScene = useMemo(() => showControlEnabled ? resolveShowScene(state, events) : null,
    [showControlEnabled, state, events]);
  const sceneView = tvSceneView(showScene, now);
  const operationEv = operation.event;
  /* a shelved event is never on deck or live, whatever the prop says */
  const onDeckEv = onDeckInput && !state.shelved?.[onDeckInput.id] ? onDeckInput : null;

  const draftLive = useMemo(() => {
    for (const [eid, d] of Object.entries(state.drafts || {})) {
      const ev = events.find(e => e.id === eid);
      if (ev && d && !state.shelved?.[eid] && !state.results?.[eid]) return { ev, d };
    }
    return null;
  }, [state.drafts, state.shelved, state.results, events]);
  const latest = useMemo(() => latestResultOf(state, events), [state, events]);
  const liveEv = useMemo(() => tvLiveEvent(state, events, operationEv), [state, events, operationEv]);
  const nextEv = useMemo(() => nextUpEvent(state, events, { liveEv, operationEv }), [state, events, liveEv, operationEv]);
  const allW = useMemo(() => (state.wagers || []).map(w => ({ w, r:resolveWager(state, w, events) })),
    [state, events]);
  const joinNeeded = Object.keys(state.profiles || {}).length < ROSTER.length;
  const qrUrl = useMemo(() => {
    try {
      const qr = qrcode(0, "M");
      qr.addData(window.location.origin);
      qr.make();
      return qr.createDataURL(8, 0);
    } catch { return null; }
  }, []);

  const activeBracketEv = liveEv && state.brackets?.[liveEv.id] && state.draws?.[liveEv.id] ? liveEv : null;
  const activeStageEv = liveEv && state.stages?.[liveEv.id] ? liveEv : null;
  const liveCrew = (liveEv && state.draws?.[liveEv.id]?.roles) || draftLive?.d.roles || [];
  const upNext = activeBracketEv ? nextOpenMatch(state.brackets[activeBracketEv.id]) : null;
  const liveContest = liveEv ? resolveCurrentContest(state, liveEv) : null;
  const advance = liveEv ? advanceMoment(state, liveEv, now) : null;
  const decided = liveEv && !liveContest ? decidedWinner(state, liveEv) : null;
  /* M14 and M18: what moves, fresh only, from the write's own server time */
  const bracketMotion = useBracketMotion(state, activeBracketEv, upNext ? [upNext.r, upNext.m] : null);
  const crown = useCrownMoment(state, showScene);
  /* D3: the frozen TV's rotation keys on the crown, read once; a later
     write (a walkout, the scene ending) moves state.updatedAt and must not
     restart the champion's hold */
  const crownAt = useRef(null);
  if (!state.frozen) crownAt.current = null;
  else if (!crownAt.current) crownAt.current = crown?.anchor || crownAnchor(state) || 0;
  /* D3: the class photo's entrance */
  const classMoment = useClassMoment(showScene);
  /* beside a bracket or the heats, the moment keeps to the contest's card */
  const slotAdvance = !!advance && !!(activeBracketEv || activeStageEv) && !!liveContest
    && ["betting-open", "betting-locked", "in-progress", "awaiting-result"].includes(liveContest.phase);

  const resultMoment = resultMomentFor(state, events, now, sceneView, showScene);
  const resultModel = useMemo(() => resultMoment ? resultPresentation(state, events, resultMoment.eventId) : null,
    [state, events, resultMoment?.eventId]); // eslint-disable-line react-hooks/exhaustive-deps
  const correction = champion ? null : correctionMoment(state, events, now);

  /* the backglass: the session's painting across the whole canvas; winners'
     stars from Saturday night on. The phones read the same weekendPhase. */
  const phase = weekendPhase(state, events, { liveEvent:liveEv, operationEvent:operationEv });
  const stars = useMemo(() => constellationStars(state, events), [state.results, events]); // eslint-disable-line react-hooks/exhaustive-deps
  const skyStars = isNightSky(phase) ? stars : EMPTY;

  /* a lead change outside a result moment gets its card in the masthead */
  const leaderKey = !allTied && standings[0] ? standings.filter(r => r.rank === 1).map(r => r.player).sort().join("+") : "";
  const leadRef = useRef(null);
  const [leadCard, setLeadCard] = useState(null);
  useEffect(() => {
    const prev = leadRef.current;
    leadRef.current = { key:leaderKey, players:standings.filter(r => r.rank === 1).map(r => r.player), pts:standings[0]?.pts };
    if (prev === null || !leaderKey || prev.key === leaderKey || state.frozen) return;
    setLeadCard({ leader:{ players:leadRef.current.players, pts:standings[0].pts },
      previous:prev.key ? { players:prev.players, pts:prev.pts } : null, at:now });
  }, [leaderKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const final = !!champion || !!state.frozen;
  const directed = sceneView?.covers && sceneView.mode === "scene";
  const sceneIntroEv = sceneView?.mode === "intro-overlay" ? events.find(e => e.id === sceneView.eventId) : null;
  const ceremonyReveal = !sceneIntroEv ? ceremony?.reveal || null : null;
  const ceremonyIntroEv = !sceneIntroEv && !ceremonyReveal && ceremony?.intro
    ? events.find(e => e.id === ceremony.intro && !state.results?.[e.id]) || null : null;
  /* D2: the face-off when a two-sided contest opens for bets, after the
     intro and draw or the decided contest (faceOffStart); anything still
     covering the live pane then holds it (faceOffGate) */
  /* D6: the award being revealed holds the room (nothing is in play) */
  const award = useMemo(() => awardOnTv(state, events), [state, events]);
  const liveCovered = !!(sceneIntroEv || ceremonyIntroEv || ceremonyReveal || directed || resultModel);
  const faceOff = useFaceOff(state, liveEv, liveContest, { covered:liveCovered });
  /* A3: the room's sounds, on the same beats and server anchors */
  useRoomSound({ state, events, standings, allTied, liveEv, showScene, advance, bracketMotion, crown, now, faceOff });
  /* Backglass moments: the walkout, the finale's bust card and blinds up,
     and whether the produced crown is still playing (each a takeover) */
  const walkoutMoment = useTvWalkout(state, events);
  const pokerMoments = usePokerMoments(state, now);
  const crownPlaying = !!crown && now - Number(crown.anchor) < CROWN_TIMING.total;

  const dock = final ? null : dockCard({ now, correction,
    lead:leadCard && !directed && !resultModel ? leadCard : null,
    holdUntil:leadCard ? advanceHoldUntil(state, liveEv, leadCard.at) : 0 });

  /* the update reload waits for a gap in what is actually on screen */
  const busy = tvBusy({ sceneView, resultMoment:resultModel, advance, intro:sceneIntroEv || ceremonyIntroEv,
    reveal:ceremonyReveal, dock }) || !!faceOff || !!award || !!walkoutMoment || !!pokerMoments.takeover || crownPlaying;
  useEffect(() => {
    if (typeof window !== "undefined") window.__FD_CEREMONY__ = busy;
  }, [busy]);
  useEffect(() => () => { if (typeof window !== "undefined") window.__FD_CEREMONY__ = false; }, []);

  /* Takeovers: while one owns the room the stage's chrome (masthead,
     horizon, ticker) leaves (`data-takeover` on the canvas), and a chase
     color lights the lamp frame (`data-chase`). Moment scenes add entries
     here: { takeover:"walkout", chase:{ color } }. */
  /* a win lights the glass for its winner: the frame runs in their color
     while their podium holds the room, and rests in the champion's once
     the board is crowned */
  const podiumEv = directed && showScene?.active?.kind === "winner" && showScene.stepKey !== "standings" ? showScene.active.eventId
    : resultMoment && resultMomentPhase(resultMoment.anchor, now, { reducedMotion }).phase === "podium" ? resultMoment.eventId : null;
  const podiumWin = podiumEv && state.results?.[podiumEv]?.slots?.[0]?.length
    ? podiumGroups(state, podiumEv, state.results[podiumEv].slots[0]) : [];
  const winColor = podiumWin.length === 1 ? resolvePlayerIdentity(state.profiles, podiumWin[0].players[0]).color : null;
  const champColor = state.frozen && !crownPlaying && !directed && (coChamps || []).length <= 1 && standings[0]
    ? resolvePlayerIdentity(state.profiles, standings[0].player).color : null;
  /* the game intro runs the frame in the session's own lamp */
  const momentTakeovers = [(sceneIntroEv || ceremonyIntroEv) && { chase:{ color:"var(--phase)", pace:"run" } },
    winColor && { chase:{ color:winColor, pace:"run" } },
    champColor && { chase:{ color:champColor, pace:"rest" } },
    faceOff && { takeover:"faceoff", chase:{ color:"var(--lamp-live)", pace:"run" } },
    walkoutMoment && { takeover:"walkout" }, pokerMoments.takeover && { takeover:pokerMoments.takeover },
    crownPlaying && { takeover:"crown" }].filter(Boolean);
  const chrome = stageChrome({ intro:!!(sceneIntroEv || ceremonyIntroEv), reveal:!!ceremonyReveal,
    champion:!!directed && showScene?.active?.kind === "champion", award:!!award, extra:momentTakeovers });

  /* D11: photos take ambient turns only in a real gap */
  const photos = useMemo(() => tvPhotoRotation(state), [state.moments]); // eslint-disable-line react-hooks/exhaustive-deps
  const photoGap = tvPhotoGap({ loading:connection.mode === "loading", final, directed, result:!!resultModel,
    poker:!!state.poker && !state.results?.[state.poker.id], draft:!!draftLive, live:!!liveEv,
    intro:!!(sceneIntroEv || ceremonyIntroEv), reveal:!!ceremonyReveal, faceOff:!!faceOff });
  /* F: the gap's few cards, each held: the board, what is next, the latest
     result and the trophy (the join code before everyone has checked in) */
  const ambientCards = useMemo(() => {
    const s = ["board"];
    if (final) return s;
    if (joinNeeded && qrUrl) s.push("join");
    if (nextEv) s.push("next");
    if (latest) s.push("latest");
    if (state.live) s.push("trophy");
    return s;
  }, [final, joinNeeded, qrUrl, nextEv, latest, state.live]);
  const ambient = photoGap ? withPhotoTurns(ambientCards, photos.length) : ambientCards;
  /* server time picks the card, so every TV in the house shows the same one;
     reduced motion still rotates, it just cuts instead of fading */
  const scene = ambient[ambientIndex(ambient.length, now, TV_AMBIENT_TURN_MS)] || "board";

  const facts = useMemo(() => weekendFacts(state, events), [state, events]);
  const items = tickerItems({ state, events, standings, allTied, liveCrew, latest, liveEv, liveContest,
    onDeckEv, openWon:mergeWagerLines(allW.filter(x => x.r.status === "won")), nextEv, now, facts, draft:!!draftLive, showing:resultModel?.eventId || null });

  const showTicker = !final && !(directed && sceneView.ticker === false) && !award && connection.mode !== "loading";
  const towers = {
    on:towersMode === "3d",
    height:1080 - MAST_H - (showTicker ? TICKER_H : 0),
    pixelRatio:Math.min(1.5, Math.max(1, (typeof window === "undefined" ? 1 : window.devicePixelRatio || 1) * fit.scale)),
    reducedMotion,
  };

  const geoOnTv = !!state.geo?.order && !state.results?.[state.geo.eventId];
  let content, liveShown = false, horizonShown = false, mastEvent = null, mastLamp = null;
  if (connection.mode === "loading") {
    content = <div className="tv-pane tv-center" role="status">
      <div className="tv-opening tv-sign">
        <FDMark size={120} variant="night" />
        <div className="tv-display tv-connecting">Connecting</div>
      </div>
    </div>;
  } else if (directed) {
    content = <DirectedScene state={state} events={events} scene={showScene} now={now}
      standings={standings} reducedMotion={reducedMotion} towers={towers} crown={crown}
      classMoment={classMoment} />;
  } else if (award) {
    content = <AwardsReveal key={`${award.ballotId}:${award.index}`} state={state} view={award} now={now}
      reducedMotion={reducedMotion} />;
  } else if (champion) {
    /* D3: once the crown has held, the frozen TV takes turns between the
       champion and the class photo on the server clock */
    const frame = frozenAmbient({ now, crownAt:crown?.anchor || crownAt.current || 0, crownMs:CROWN_TIMING.total,
      period:TV_AMBIENT_MS });
    const view = frame === "champion" ? championView(state, events, standings) : null;
    content = frame === "class" ? <ClassPhoto state={state} events={events} standings={standings} />
      : frame === "trophy" ? <TrophyCard state={state} events={events} />
      : view ? <ChampionMoment state={state} view={view} standings={standings} moment={crown} /> : null;
  } else if (resultModel) {
    const resultPhase = resultMomentPhase(resultMoment.anchor, now, { reducedMotion });
    content = <ResultSequence state={state} model={resultModel} phase={resultPhase} towers={towers} />;
  } else if (state.poker && !state.results[state.poker.id]) {
    mastEvent = events.find(e => e.id === state.poker.id) || null;
    mastLamp = state.poker.startedAt ? { label:"Playing", state:"live" } : null;
    content = <TVPoker state={state} standings={standings} now={now} />;
  } else if (draftLive) {
    mastEvent = draftLive.ev;
    content = <TVDraft state={state} ev={draftLive.ev} d={draftLive.d} />;
  } else if (geoOnTv) {
    /* Where and When holds the room from its first photo to its result */
    content = <TVGeo state={state} now={now} />;
  } else if (liveEv) {
    liveShown = true;
    mastEvent = liveEv;
    const inContest = liveContest && ["betting-open", "betting-locked", "in-progress", "awaiting-result"].includes(liveContest.phase);
    /* the masthead's lamp reads the contest itself, so it can never say
       betting is open while the board says it is locked */
    mastLamp = inContest ? contestLamp(liveContest) : decided ? { label:"Decided", state:"live" } : { label:"Live", state:"live" };
    const beside = inContest && (activeBracketEv || activeStageEv);
    const band = !!beside && !!activeBracketEv && (state.draws?.[activeBracketEv.id]?.teams?.length || 0) >= BIG_BRACKET;
    if (band) content = <div className="tv-live is-band">
      <div className="tv-live-main">
        <div className="tv-contest-slot">
          {liveContest.sides.length === 2
            ? <ContestBand state={state} ev={liveEv} contest={liveContest} stacks={contestStacks(state, events, liveContest)}
              width={BOARD_W} lamp={contestLamp(liveContest)} />
            : <ContestBoard state={state} events={events} ev={liveEv} contest={liveContest} width={BOARD_W} />}
          {slotAdvance && <AdvanceMoment state={state} moment={advance} slot />}
        </div>
        {advance && !slotAdvance && <AdvanceMoment state={state} moment={advance} />}
        {faceOff && (() => {
          const view = faceOffView(state, liveEv, liveContest, events);
          return view ? <FaceOff state={state} events={events} ev={liveEv} contest={liveContest} view={view} moment={faceOff} /> : null;
        })()}
      </div>
      <div className="tv-live-band tv-glass" style={{ height:BAND_H }}>
        <TVBracket state={state} ev={activeBracketEv} hot={upNext ? [upNext.r, upNext.m] : null}
          motion={bracketMotion} size="band" fit={BAND_FIT} />
      </div>
    </div>;
    else content = <div className="tv-live">
      <div className="tv-live-main">
        {inContest ? <>
          <div className="tv-contest-slot">
            <ContestBoard state={state} events={events} ev={liveEv} contest={liveContest}
              width={beside ? BOARD_W - SIDE_W - 28 : BOARD_W} />
            {slotAdvance && <AdvanceMoment state={state} moment={advance} slot />}
          </div>
        </> : decided ? <DecidedWinner state={state} ev={liveEv} winner={decided} motion={bracketMotion} />
          : activeBracketEv ? <div className="tv-glass tv-live-bracket"><TVBracket state={state} ev={activeBracketEv} size="full"
            hot={upNext ? [upNext.r, upNext.m] : null} motion={bracketMotion} /></div>
            : activeStageEv ? <div className="tv-glass tv-live-bracket"><StageGroups state={state} ev={activeStageEv} /></div>
              : <div className="tv-glass tv-center tv-live-idle">
                <GameMark id={liveEv.game} variant={liveEv.variant} size={130} />
                <PayoutLadder ev={liveEv} size="tv" />
              </div>}
        {advance && !slotAdvance && <AdvanceMoment state={state} moment={advance} />}
        {faceOff && inContest && (() => {
          const view = faceOffView(state, liveEv, liveContest, events);
          return view ? <FaceOff state={state} events={events} ev={liveEv} contest={liveContest} view={view} moment={faceOff} /> : null;
        })()}
      </div>
      {beside && <aside className="tv-live-side tv-glass" style={{ width:SIDE_W }}>
        {activeBracketEv ? <TVBracket state={state} ev={activeBracketEv} hot={upNext ? [upNext.r, upNext.m] : null}
          motion={bracketMotion} size="side" fit={SIDE_FIT} /> : <StageGroups state={state} ev={activeStageEv} />}
      </aside>}
    </div>;
  } else if (scene === "join") {
    content = <div className="tv-pane tv-center">
      <div className="tv-join tv-glass">
        <div className="tv-join-copy">
          <FDMark size={120} variant="night" />
          <div className="fd-show is-marquee tv-join-title">Field Day</div>
          <div className="tv-mast-edition">{editionLabel()}</div>
          <div className="tv-body tv-join-line">Scan to check in.</div>
        </div>
        <div className="tv-qr">
          <img src={qrUrl} alt="Scan to join" />
          <div className="tv-display tv-qr-label">Player check-in</div>
        </div>
      </div>
    </div>;
  } else if (scene === "photos" && photos.length) {
    content = <TVPhotoCard state={state} list={photos} now={now} />;
  } else if (scene === "next" && nextEv) {
    /* what is next stands over the standings: the towers stay the lower third */
    horizonShown = true;
    content = <NextUpCard ev={nextEv} />;
  } else if (scene === "latest" && latest) {
    const model = resultPresentation(state, events, latest.ev.id);
    content = model ? <ResultSequence state={state} model={model} phase={{ phase:"podium", revealed:3 }} /> : null;
  } else if (scene === "trophy") {
    content = <TrophyCard state={state} events={events} />;
  } else {
    const flat = <div className="tv-pane"><StandingsBoard state={state} standings={standings} allTied={allTied}
      /></div>;
    content = towers.on ? <TowersView state={state} rows={standingsTowerRows(standings)}
      height={towers.height} towers={towers} fallback={flat} /> : flat;
  }
  /* betting open on an event not yet in play: its name in the masthead */
  if (!mastEvent && !final && !directed && !award && onDeckEv && connection.mode !== "loading") {
    mastEvent = onDeckEv;
    mastLamp = { label:"Betting open", state:"pending" };
  }
  const showHorizon = (liveShown || horizonShown) && connection.mode !== "loading";

  const dockNode = dock?.kind === "correction" ? <CorrectionCard correction={dock.correction} />
    : dock?.kind === "lead" ? <LeadChange state={state} leader={dock.lead.leader} previous={dock.lead.previous} /> : null;

  return (
    <TextFloor px={24}><div className="tv-stage fd-night">
      <div className={`tv-canvas${showHorizon ? " has-horizon" : ""}`} data-tv-canvas data-phase={phase}
        data-towers={towers.on ? "3d" : towersFailure() || "2d"}
        data-takeover={chrome.takeover || undefined} data-chase={chrome.chase ? "" : undefined}
        style={{ left:fit.left, top:fit.top, transform:`scale(${fit.scale})`, "--tv-mast-h":`${MAST_H}px`, "--tv-foot-h":`${TICKER_H}px`,
          ...(chrome.chase?.color ? { "--chase":chrome.chase.color } : {}) }}>
        <Backglass phase={phase} stars={skyStars} className="tv-backdrop" />
        <Masthead event={mastEvent} lamp={mastLamp} connection={connection} lastUpdateAt={lastUpdateAt}
          final={final} dock={dockNode} now={now} playing={!award && <NowPlaying state={state} events={events} />} />
        <main className="tv-main" style={connection.mode === "reconnecting" ? { opacity:0.72 } : undefined}>
          {content}
        </main>
        {showHorizon && <Horizon state={state} standings={standings} towers={towers} />}
        {showTicker && <Ticker items={items} reducedMotion={reducedMotion} now={now} />}
        {sceneIntroEv && <IntroOverlay key={sceneIntroEv.id} state={state} ev={sceneIntroEv} reducedMotion={reducedMotion}
          sceneAt={showScene?.active?.startedAt} now={introClock}
          handoff={!!(state.draws?.[sceneIntroEv.id] || state.stages?.[sceneIntroEv.id])} />}
        {ceremonyIntroEv && <IntroOverlay key={ceremonyIntroEv.id} state={state} ev={ceremonyIntroEv}
          handoff={!!ceremony?.handoff} reducedMotion={reducedMotion} onDone={ceremony?.onIntroDone || null} now={introClock} />}
        {ceremonyReveal && <TVDrawReveal key={ceremonyReveal.id} state={state} events={events} reveal={ceremonyReveal}
          reducedMotion={reducedMotion} onDone={ceremony?.onRevealDone || null} />}
        <TVWalkout state={state} moment={walkoutMoment} />
        <TVPokerMoments state={state} moments={pokerMoments} />
        <FrameLamps color={chrome.chase?.color || null} pace={chrome.chase?.pace || "rest"} />
        <SoundUnlockChip />
      </div>
      <SoundEarlyControl idle={!pointerActive} />
      <button type="button" className={`tv-exit${pointerActive ? "" : " is-idle"}`} onClick={onExit}
        aria-label="Exit TV mode">Exit TV</button>
    </div></TextFloor>
  );
}

/* The frame's lamps: a ring of bulbs set in the glass around the whole
   canvas, every third one lit and stepping on, amber and slow at rest; a
   moment's own color, quick, while it holds the room. No glow. Reduced
   motion holds them steady. */
const FRAME = { inset:14, radius:22, pitch:40 };
export function frameBeads(width = 1920, height = 1080, frame = FRAME) {
  const w = width - 2 * frame.inset, h = height - 2 * frame.inset;
  const perimeter = 2 * (w + h) - (8 - 2 * Math.PI) * frame.radius;
  return Math.max(3, Math.round(perimeter / frame.pitch / 3) * 3);
}
function FrameLamps({ color = null, pace = "rest" }) {
  const beads = frameBeads();
  const rect = { x:FRAME.inset, y:FRAME.inset, width:1920 - 2 * FRAME.inset, height:1080 - 2 * FRAME.inset,
    rx:FRAME.radius, pathLength:beads };
  return (
    <svg className={`tv-frame-lamps is-${pace}`} width="1920" height="1080" viewBox="0 0 1920 1080"
      style={color ? { "--chase":color } : undefined} aria-hidden="true" focusable="false">
      <rect className="tv-frame-bulbs" {...rect} />
      <rect className="tv-frame-lit" {...rect} />
    </svg>
  );
}

/* local wall time of the last snapshot, for the reconnecting label */
function useLastUpdate(version) {
  const [at, setAt] = useState(null);
  useEffect(() => { if (version) setAt(Date.now()); }, [version]);
  return at;
}

export { TVMode };
