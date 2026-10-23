import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import qrcode from "qrcode-generator";
import {
  ROSTER, rosterOf, disp, resolveWager, resolveCurrentContest, resolveWeekendOperation,
} from "../../../shared/core.js";
import { resolveShowScene } from "../../../shared/show.js";
import { ChipFace } from "../identity/PlayerIdentity.jsx";
import { DISC_OVERLAP } from "../identity/discLetters.js";
import { TextFloor, usePlayerIdentity } from "../identity/PlayerIdentityContext.js";
import { resolvePlayerIdentity } from "../identity/playerIdentity.js";
import { GameMark } from "../../ui/GameMark.jsx";
import { FDMark } from "../../ui/Brand.jsx";
import { ScoreReel } from "../../ui/ScoreReel.jsx";
import { EventName } from "../../ui/OneSafe.jsx";
import { PayoutLadder } from "../../ui/PayoutLadder.jsx";
import { mergeWagerLines } from "../wagers/Wagers.jsx";
import { TVTable, TVSettledTable, matchLabel } from "./TVTable.jsx";
import { BAND_TABLE_H, TABLE_H, entryContest } from "./tvTable.js";
import {
  fmt, signed, editionLabel, phaseBand,
  tvCanvasFit, tvSceneView, ambientIndex, TV_AMBIENT_MS, TV_AMBIENT_TURN_MS, TV_TROPHY_HOLD_MS, TV_TICKER_PAGE_MS, TV_RESULT_MOMENT_MS,
  tvLiveEvent, nextUpEvent, nextOpenMatch, latestResultOf, resultPresentation, resultMomentPhase, resultMomentFor,
  advanceMoment, advanceHoldUntil, correctionMoment, dockCard, decidedWinner,
  tvConnection, tickerItems, tickerSpread, TICKER_HALF_PX, TICKER_CORNER_PX, tvBusy, podiumGroups, championView, contestLamp, stageChrome, boardLevel,
  backersRail,
} from "./tvModel.js";
import { IntroOverlay, TVDrawReveal } from "./TVCeremony.jsx";
import { TVDraft } from "./TVDraft.jsx";
import { TVPoker } from "./TVPoker.jsx";
import { StageGroups, RosterWall, TrophyCard } from "./TVCards.jsx";
import { TVBracket } from "./TVBracket.jsx";
import { TVPodium, BackersRail } from "./TVPodium.jsx";
import { ChampionMoment } from "./TVChampion.jsx";
import { CROWN_TIMING, useBracketMotion, useCrownMoment } from "./tvMotion.js";
import { ClassPhoto, useClassMoment } from "./TVClassPhoto.jsx";
import { FaceOff } from "./TVFaceOff.jsx";
import { faceOffView, useFaceOff } from "./faceOff.js";
import { byeTeachWindow, underdogTeachWindow, useTeach } from "./teach.js";
import { FROZEN_TURNS, frozenAmbient } from "../results/classPhoto.js";
import { crownAnchor } from "../results/crownTiming.js";
import { Backglass } from "./DesertBand.jsx";
import { constellationStars, isNightSky } from "./desertModel.js";
import { weekendPhase } from "../../ui/phase.js";
import { TowersBoard, useTowersMode, towersFailure } from "./TowersBoard.jsx";
import { towerChips, towerChipPx, towerCountSize, towerLeaders, towerLayout, towerStackPx, standingsTowerRows, resultTowerRows } from "./towersModel.js";
import { useServerNow } from "./serverClock.js";
import { serverNow } from "../../lib/serverClock.js";
import { weekendFacts } from "../results/weekendFacts.js";
import { useGagSound, useRoomSound } from "./roomSound.js";
import { TVGag, useGagShown, useGagWindow } from "../gags/TVGags.jsx";
import { gagHoldMs, gagLamp } from "../gags/gagModel.js";
import { TVHighlight } from "../gags/TVHighlight.jsx";
import { highlightAt, highlightReel, highlightSince, withHighlightTurns } from "../gags/highlights.js";
import { SoundUnlockChip } from "./SoundUnlockChip.jsx";
import { SoundEarlyControl, useTvSoundReport, useTvWakeLock } from "./TVDevice.jsx";
import { NowPlaying } from "./NowPlaying.jsx";
import { TVWalkout, useTvWalkout } from "./TVWalkout.jsx";
import { TVPokerMoments, usePokerMoments } from "./TVPokerMoments.jsx";
import { TVShowdown, useTvShowdown } from "./TVShowdown.jsx";
import { AwardsReveal } from "../awards/TVAwards.jsx";
import { TVGeo } from "./TVGeo.jsx";
import { TVTrivia } from "./TVTrivia.jsx";
import { TVKaraoke } from "./TVKaraoke.jsx";
import { karaokeSongOn, karaokeTvBusy } from "./karaokeTv.js";
import { useBoardChrome } from "./TVBoard.jsx";
import { triviaLive } from "../../../shared/trivia.js";
import { karaokeLive } from "../../../shared/karaoke.js";
import { isBoardGame } from "../../../shared/triviaBoard.js";
import { awardOnTv } from "../../../shared/prompts.js";
import { TVPhotoCard } from "../photos/TVPhotoCard.jsx";
import { tvPhotoGap, tvPhotoRotation, withPhotoTurns } from "../photos/photoModel.js";
import { TVRecord } from "./TVRecords.jsx";
import { recordAt, recordCards, withRecordTurns } from "./recordsModel.js";
import { TVAttract } from "./TVAttract.jsx";
import { ATTRACT_EARLY_MS, attractAt, attractRoom, withAttractTurns } from "./attractModel.js";
import { CORNER_GAP, CORNER_W, TVArriveCorner, TVLobby } from "./TVArrivals.jsx";
import { arrivalsBoard, arriveUrl } from "../arrivals/arrivalsModel.js";
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
/* the horizon's chips fill less of their slot than the board's, and its
   short stacks keep 3px a chip (towersModel's towerLayout) */
const HORIZON_FILL = 0.56, HORIZON_MIN_CHIP = 3;
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

/* players as their photo chips: the identity chip with the saved photo in
   its middle, else their initials. One treatment everywhere on the TV.
   Overlapped faces tuck a fifth under the next, clear of the letters. */
/* more than five faces stand in balanced rows (six is three and three),
   never a row of five and one left alone */
function Faces({ players, size, overlap = false, className = "", maxCols = 5 }) {
  const rows = !overlap && players.length > maxCols ? Math.ceil(players.length / 2) : 0;
  return (
    <div className={`tv-faces${overlap ? " is-overlap" : ""}${rows ? " is-rows" : ""}${className ? ` ${className}` : ""}`}
      style={overlap ? { "--overlap":`${-Math.round(size * DISC_OVERLAP)}px` } : rows ? { "--face-cols":rows } : undefined}>
      {players.map(p => <ChipFace key={p} p={p} size={size} />)}
    </div>
  );
}

/* The slim masthead: the FD chip and the event being played in backglass
   lettering, its lamp (betting open flashes, play is steady); nothing live,
   the weekend's name. The edition balances it on the right. No wall clock:
   the weekend runs on now and next (PRODUCT 7). The dock (a correction, a
   lead change), Reconnecting or Final take the edition's place, and a win
   song's strip takes the right while it plays. */
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
        </> : <span className="tv-mast-title fd-show">Field Day</span>}
      </div>
      {playing}
      <SoundUnlockChip />
      <div className="tv-mast-right" data-fit-region="masthead">
        {dock ? <div className="tv-dock">{dock}</div>
          : offline ? <span className="tv-status is-offline" role="status"><i />
            Reconnecting</span>
            : final ? <span className="tv-status is-final">Final</span>
              : <span className="tv-mast-edition">{editionLabel()}</span>}
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
/* `quiet` (a live trivia or Where and When question) holds one page still,
   so nothing moves under the room while it thinks */
function Ticker({ items, reducedMotion, now, quiet = false, narrow = false }) {
  /* nothing new to say: no plate at all, never a line that repeats the masthead */
  if (!items?.length) return <div className="tv-ticker is-empty" aria-hidden="true" />;
  /* the arrivals corner narrows the plate: a pair must fit what is left */
  const half = narrow ? TICKER_HALF_PX - TICKER_CORNER_PX / 2 : TICKER_HALF_PX;
  const page = tickerSpread(items, quiet ? 0 : now, TV_TICKER_PAGE_MS, half);
  const age = Math.max(0, Number(now) || 0) % TV_TICKER_PAGE_MS;
  const prev = !quiet && !reducedMotion && page.pages > 1 && age < 1000 ? tickerSpread(items, now - TV_TICKER_PAGE_MS, TV_TICKER_PAGE_MS, half) : null;
  return (
    <div className={`tv-ticker${reducedMotion ? " is-cut" : ""}`} aria-label={`Ticker, ${page.index + 1} of ${page.pages}`}>
      <div className="tv-ticker-glass" aria-hidden="true" data-fit-region="ticker" />
      {prev && prev.index !== page.index && prev.items.length > 0 && <TickerPage key={`out-${prev.index}`} items={prev.items}
        className="is-leaving" />}
      {page.items.length > 0 && <TickerPage key={`in-${page.index}`} items={page.items}
        className={page.pages > 1 && !quiet ? "is-entering" : ""} />}
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
/* every tower's label is its slot's width less a gutter (towerLayout), so
   neighbours never touch however long a name runs or how many play; this
   is the full roster's, the default when no slot is given */
export const TOWER_LABEL_W = Math.floor(towerLayout({ width:1920, edge:EDGE, count:ROSTER.length }).labelW);
/* the name fits the slot on one line: as large as it goes (30px down to
   24), and a name still wider at 24 is narrowed to the slot (measured in
   the browser, `squeeze` is the estimate), so every tower's count stands on
   one baseline; never two lines. Past TOWER_SQUEEZE it ends in an ellipsis. */
export const TOWER_SQUEEZE = 0.72;
export const towerNameFit = (name, width = TOWER_LABEL_W) => {
  /* lettered as written; measured as capitals, the widest it could run */
  const text = String(name || "");
  const size = Math.max(24, Math.min(30, Math.floor(width / Math.max(1, text.length * 0.5))));
  const est = text.length * 0.5 * size;
  return { size, lines:[text], squeeze:est > width ? Math.max(TOWER_SQUEEZE, width / est) : 1 };
};
export const towerNameSize = name => towerNameFit(name).size;
/* A tower's label at rest is its name and one plain numeral; position is
   the rank. On a result's step (`change`) the move shows once: a mover's
   change takes the count's line and fades, a tower that did not move reads
   a quiet ±0 there (never a blank that looks missing), every name stays
   bone, then the board is at rest again. A mover's count comes back on a slim reel showing what
   it was, then rolls to what it is once the change has lifted away, its
   windows lit for the step (the movers read apart from the rest); the
   board at rest is plain numerals again. */
export const TOWER_REEL_AT_MS = 3950;
const towerLabel = (state, { change = false } = {}) => (row, { labelW = TOWER_LABEL_W } = {}) => {
  const name = disp(state, row.player);
  const delta = change ? (row.award || 0) + (row.bets || 0) : 0;
  /* one size for the count, the change and the reel's start, the longest of them */
  const size = towerCountSize([fmt(row.pts), fmt(row.pts - delta), signed(delta)]
    .reduce((a, b) => (b.length > a.length ? b : a), ""), labelW);
  return <>
    {delta ? <span className={`tv-tower-delta${delta < 0 ? " is-down" : ""}`} style={{ fontSize:size }}>{signed(delta)}</span>
      : change ? <span className="tv-tower-delta is-zero" style={{ fontSize:size }}>±0</span> : null}
    <TowerName name={name} width={labelW} />
    <span className={`tv-tower-pts${row.pts < 0 ? " is-down" : ""}`} style={{ fontSize:size }}>{delta
      ? <ScoreReel value={row.pts} from={row.pts - delta} motion="always" slim label={fmt(row.pts)} at={TOWER_REEL_AT_MS} />
      : fmt(row.pts)}</span>
  </>;
};
function TowerName({ name, width = TOWER_LABEL_W }) {
  const fit = towerNameFit(name, width);
  const ref = useRef(null);
  const [squeeze, setSqueeze] = useState(fit.squeeze);
  const [clip, setClip] = useState(false);
  useLayoutEffect(() => {
    let live = true;
    const measure = () => {
      const w = ref.current?.scrollWidth || 0;
      if (!live || !w) return;
      setSqueeze(Math.max(TOWER_SQUEEZE, Math.min(1, width / w)));
      setClip(width / w < TOWER_SQUEEZE);
    };
    measure();
    document.fonts?.ready?.then(measure);
    return () => { live = false; };
  }, [name, fit.size, width]);
  const style = squeeze < 1 ? { transform:`scaleX(${squeeze.toFixed(3)})` } : {};
  /* past the narrowest it goes, the name ends in an ellipsis inside the slot */
  if (clip) Object.assign(style, { maxWidth:Math.floor(width / TOWER_SQUEEZE), overflow:"hidden", textOverflow:"ellipsis" });
  return <b className="tv-tower-name" style={{ fontSize:fit.size }}>
    <span ref={ref} className="tv-tower-name-text" style={style}>{name}</span></b>;
}
const towerMoved = row => !!((row.award || 0) + (row.bets || 0));
const towerClass = winners => row => `${towerMoved(row) ? "is-moved" : "is-still"}${winners.has(row.player) ? " is-win" : ""}`;
/* the sky above the towers: a sign, or a result's headline in the empty
   upper half (the towers stand under it) */
const HEADLINE_TOP = 330;
/* arrivals: a tower whose player is still on the road stands unlit */
const roadClass = (base, road) => !road?.size ? base
  : row => [base ? base(row) : "", road.has(row.player) ? "is-road" : ""].filter(Boolean).join(" ");
function TowersView({ state, rows, head = null, headline = null, ribbon = null, winners = null, height, towers, fallback,
  change = false, sound = "fresh", road = null, width = 1920 }) {
  const leaders = towerLeaders(rows);
  return (
    <div className={`tv-towers-pane${change ? " is-change" : ""}`}>
      <TowersBoard fallback={fallback} rows={rows} leaders={leaders} width={width} height={height} edge={EDGE}
        baseY={towerBase(height)} top={headline ? HEADLINE_TOP : ribbon ? RIBBON_TOP : head ? 120 : 40} pixelRatio={towers.pixelRatio}
        reducedMotion={towers.reducedMotion} labelFor={towerLabel(state, { change })}
        labelClass={roadClass(change ? towerClass(winners || new Set()) : null, road)} sound={sound} />
      {headline}
      {ribbon}
      {head && <div className="tv-towers-head tv-sign">{head}</div>}
    </div>
  );
}

/* The board's sky while the weekend waits: what is next, one ribbon of
   liquid glass high over the towers (its mark, its name, what it pays). No
   "Next" label: the composition says it. */
const RIBBON_TOP = 190;
/* The ribbon floats in the middle of the sky the towers leave: high over a
   tall board, lower over a short one, so the sky is never one empty band */
const RIBBON_H = 140, RIBBON_MIN = 34, RIBBON_CLEAR = 36;
export function ribbonTop(rows = [], height = 836) {
  const baseY = towerBase(height);
  const tallest = Math.max(1, ...rows.map(row => towerChips(row.pts)));
  const layout = towerLayout({ width:1920, baseY, count:Math.max(1, rows.length), tallest, top:RIBBON_TOP, edge:EDGE });
  const sky = baseY - towerStackPx(layout, tallest) - RIBBON_CLEAR;
  return Math.max(RIBBON_MIN, Math.round((sky - RIBBON_H) / 2));
}
function NextRibbon({ ev, top = RIBBON_MIN }) {
  return (
    <div className="tv-next-ribbon fd-liquid fd-liquid-sweep" aria-label={`Next: ${ev.name}`} style={{ top }}>
      <GameMark id={ev.game} variant={ev.variant} size={92} />
      <span className="fd-show tv-next-ribbon-name"
        style={{ fontSize:Math.max(40, Math.min(92, Math.floor(1120 / (Math.max(6, ev.name.length) * 0.47)))) }}>
        <EventName name={ev.name} /></span>
      <PayoutLadder ev={ev} size="ticker" className="tv-next-ribbon-ladder" />
    </div>
  );
}

/* the flat horizon where WebGL is absent: each player's chip on a painted
   column one chip-edge per 100, in the same fixed slots, thinned past the
   knee like the towers (towerChipPx); an empty stack is its hollow base */
function FlatTower({ p, chips, scale }) {
  const identity = usePlayerIdentity(p);
  if (!chips) return (
    <svg className="tv-flat-tower is-empty" width="60" height="8" viewBox="0 0 60 8" aria-hidden="true">
      <rect x="1" y="1" width="58" height="6" rx="3" />
    </svg>
  );
  const thick = j => (j < scale.knee ? scale.small : scale.big);
  const tops = [];
  for (let j = 0, y = 0; j < chips; j++) { y += thick(j); tops.push(y); }
  const h = Math.max(4, Math.round(tops[chips - 1]));
  const edges = tops.slice(0, -1).filter((_, j) => thick(j) >= 4 && thick(j + 1) >= 4).map(y => Math.round(h - y));
  return (
    <svg className="tv-flat-tower" width="60" height={h} viewBox={`0 0 60 ${h}`} aria-hidden="true">
      <rect width="60" height={h} rx="4" style={{ fill:identity.color }} />
      {edges.length > 0 && <g className="tv-flat-edges">{edges.map(y => <line key={y} x1="0" x2="60" y1={y} y2={y} />)}</g>}
    </svg>
  );
}
function FlatHorizon({ rows, label, road = null, width = 1920 }) {
  const tallest = Math.max(1, ...rows.map(row => towerChips(row.pts)));
  const scale = towerChipPx({ room:HORIZON_BASE - 84, tallest, naturalPx:12, minChipPx:HORIZON_MIN_CHIP });
  const fit = { labelW:towerLayout({ width, edge:EDGE, count:rows.length }).labelW, count:rows.length };
  return (
    <div className="tv-flat-horizon" style={{ gridTemplateColumns:`repeat(${Math.max(1, rows.length)}, minmax(0, 1fr))`,
      ...(width < 1920 ? { right:1920 - width + EDGE } : {}) }}>
      {rows.map(row => (
        <div key={row.player} className={`tv-flat-slot${road?.has(row.player) ? " is-road" : ""}`}>
          <div className="tv-flat-stand" style={{ height:HORIZON_BASE }}>
            <ChipFace p={row.player} size={68} />
            <FlatTower p={row.player} chips={towerChips(row.pts)} scale={scale} />
          </div>
          <div className="tv-tower-label is-flat">{label(row, fit)}</div>
        </div>
      ))}
    </div>
  );
}
/* The standings horizon under the live board: every player's tower in rank
   order on the desert floor, each in its own slot with its name and reel.
   It replaces the old standings rail, so the board gets the full width. */
/* `width`: narrower while the arrivals corner plate holds the bottom right */
function Horizon({ state, standings, towers, road = null, width = 1920 }) {
  const rows = standingsTowerRows(standings);
  const label = towerLabel(state);
  const flat = <FlatHorizon rows={rows} label={label} road={road} width={width} />;
  return (
    <section className="tv-horizon" aria-label="Standings">
      {towers.on ? <TowersBoard fallback={flat} rows={rows} width={width} height={HORIZON_H} baseY={HORIZON_BASE} top={8}
        edge={EDGE} fill={HORIZON_FILL} minChipPx={HORIZON_MIN_CHIP} pixelRatio={towers.pixelRatio} reducedMotion={towers.reducedMotion} labelFor={label}
        labelClass={roadClass(null, road)} />
        : flat}
    </section>
  );
}

/* The current contest is the table (TVTable.jsx): the felt every phone is
   a seat at, from above at room scale, a spot per side with the room's %
   rising in it as an amber fill and the bettors' stacks standing on it. */
export const matchTitle = matchLabel;

/* a finished bracket or stage waiting on its official result: the room sees
   who won it and the whole draw, never the commissioner's next step */
function DecidedWinner({ state, ev, winner, motion = null }) {
  const plural = winner.players.length > 1;
  return (
    <div className="tv-decided">
      <div className="tv-decided-winner tv-glass">
        <Faces players={winner.players} size={96} />
        <div className="tv-display tv-decided-name">{winner.name}</div>
        <div className="fd-show tv-decided-stamp">{plural ? "Win" : "Wins"}</div>
      </div>
      {state.brackets?.[ev.id] ? <TVBracket state={state} ev={ev} motion={motion} /> : <StageGroups state={state} ev={ev} />}
    </div>
  );
}

/* the round under the stamp, with what the win means next: each its own
   unit, spaced apart, never joined by a dot */
const AdvanceDetail = ({ moment }) => {
  const parts = [moment.round, ...String(moment.detail || "").split(" · ")].filter(Boolean);
  return parts.length ? <div className="tv-advance-detail">{parts.map(part => <span key={part}>{part}</span>)}</div> : null;
};
/* The decided contest: its table settling on the decision's server time
   (TVSettledTable: the winner's spot floods and stamps WON, the glove
   rakes the losers' chips to the bank, the winners' stacks grow). Over a
   bracket it keeps to the contest's space, so the bracket beside it can
   carry the winners forward. A contest whose sides cannot be read back
   (an old record) keeps the winner's card. */
function AdvanceMoment({ state, events, ev, moment, width, band = false, clock }) {
  const entry = (state.eventOps?.[ev.id]?.contestStack || []).find(item => item.id === moment.id) || state.eventOps?.[ev.id]?.lastContest;
  if (entryContest(state, ev, entry)) return (
    <div className={`tv-advance-table${band ? " is-band" : ""}`}>
      <TVSettledTable key={moment.id} state={state} events={events} ev={ev} advance={moment} width={width}
        height={band ? BAND_TABLE_H : TABLE_H} band={band} clock={clock} />
    </div>
  );
  return (
    <div className="tv-advance" role="status">
      <Faces players={moment.players} size={band ? 72 : 128} />
      <div className="tv-display tv-advance-name">{moment.name}</div>
      <div key={moment.id} className="fd-show tv-advance-stamp">{moment.verb}</div>
      {!band && <AdvanceDetail moment={moment} />}
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
        <span className="fd-show tv-result-headline-name" style={{ fontSize:size }}>{text}</span>
      </div>
      {lead}
    </div>
  );
}

const ROW_STEP = 60;
/* the flat list's room between the masthead and the ticker: the main area
   less the pane's padding (16 + 20), the list's top (12) and its head (76 +
   8). Thirteen rows at 60 would run into the ticker; the step shrinks to
   fit (54 for thirteen), each row 4px shorter than its step. */
const RESULT_LIST_H = 1080 - MAST_H - TICKER_H - 36 - 12 - 84;
export const resultRowStep = count => Math.min(ROW_STEP, Math.floor(RESULT_LIST_H / Math.max(1, count)));
/* a moved row's count lands once the rows have slid to their places */
const RESULT_ROW_REEL_AT_MS = 600;
/* one result, told twice: a podium climbing third to first, then all thirteen
   moving from where they stood to where they stand, each mover's change
   shown once (poker: final stacks). */
function ResultSequence({ state, model, phase, towers = null, anchor = null, now = 0 }) {
  if (!model) return null;
  if (phase.phase === "podium")
    return <TVPodium key={`${model.eventId}:${model.revision}:${anchor || 0}`} state={state} model={model} anchor={anchor} now={now} />;
  const order = phase.sorted ? model.rows.map(row => row.player) : model.beforeOrder;
  const leaderSet = new Set(model.leader?.players || []);
  const step = resultRowStep(model.rows.length);
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
      <div className="tv-move-list" style={{ height:step * model.rows.length }}>
        {model.rows.map(row => {
          const index = order.indexOf(row.player);
          const pts = phase.sorted ? row.after : row.before;
          const rank = phase.sorted ? row.rankAfter : row.rankBefore;
          return (
            <div key={row.player} className={`tv-move-row${phase.sorted && leaderSet.has(row.player) ? " is-lead" : ""}${row.busted ? " is-out" : ""}${row.away ? " is-away" : ""}`}
              style={{ transform:`translateY(${index * step}px)`, height:step - 4 }}>
              <span className="tv-rank">{rank}</span>
              <ChipFace p={row.player} size={44} />
              <span className="tv-name">{disp(state, row.player)}</span>
              {model.kind === "stacks" ? (
                <span className="tv-split">{row.away ? "Away" : row.busted ? "Busted" : `Started ${fmt(row.before)}`}</span>
              ) : <span className={`tv-split${row.change < 0 ? " is-down" : ""}`}>
                {phase.sorted && row.change ? signed(row.change) : null}</span>}
              <span className="tv-pts">{phase.sorted && row.change && model.kind !== "stacks"
                ? <ScoreReel value={pts} from={row.before} motion="always" slim label={fmt(pts)} at={RESULT_ROW_REEL_AT_MS} />
                : fmt(pts)}</span>
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
    return view ? <ChampionMoment state={state} events={events} view={view} standings={scene.standings} moment={crown} /> : null;
  }
  if (kind === "opening") {
    if (scene.stepKey === "room") return <RosterWall state={state} />;
    return (
      <div className="tv-pane tv-center">
        <div className="tv-opening tv-sign">
          <FDMark size={150} variant="night" />
          <div className="fd-show tv-opening-title">Field Day</div>
          <div className="tv-mast-edition">{editionLabel()}</div>
        </div>
      </div>
    );
  }
  if (kind === "winner") {
    const model = resultPresentation(state, events, scene.active.eventId);
    const anchor = scene.stepKey === "standings" ? Number(scene.active.updatedAt) : Number(scene.active.startedAt);
    const phase = resultMomentPhase(anchor, now, { reducedMotion, step:scene.stepKey });
    return <ResultSequence state={state} model={model} phase={phase} towers={towers} anchor={anchor} now={now} />;
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
          <div className="tv-next-top">
            <GameMark id={ev.game} variant={ev.variant} size={96} />
            <span className="tv-status is-next"><i className="fd-insert" />Up next</span>
          </div>
          <div className="fd-show tv-next-name"><EventName name={ev.name} /></div>
        </div>
        <PayoutLadder ev={ev} size="tv" className="tv-next-ladder" />
      </div>
    </div>
  );
}

/* ═════════════ the TV ═════════════ */
function TVMode({ standings, state, events, onDeckEv: onDeckInput, allTied: allTiedInput, champion, coChamps, showControlEnabled,
  rankDeltas = {}, connection: connectionInput = {}, onExit, ceremony = null, now: nowOverride,
  onSoundStatus = null, arriveCode = null, onVideoStatus = null }) {
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
  const joinNeeded = rosterOf(state).some(p => !state.profiles?.[p]);
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
  /* Gags (features/gags): the room's moments, each a bit in its own window
     on the server clock (the next face-off is timed after one) */
  const gagWindow = useGagWindow(state, events, { now:nowOverride });
  const liveCovered = !!(sceneIntroEv || ceremonyIntroEv || ceremonyReveal || directed || resultModel);
  const faceOff = useFaceOff(state, liveEv, liveContest, { covered:liveCovered });
  /* H10: the first underdog and the first byes this TV shows are taught
     once, on the server clock (teach.js) */
  const underdogTeach = useTeach("underdog", underdogTeachWindow(state, liveEv, liveContest), now);
  const byeTeach = useTeach("bye", activeBracketEv ? byeTeachWindow(state, activeBracketEv) : null, now);
  /* A3: the room's sounds, on the same beats and server anchors */
  useRoomSound({ state, events, standings, allTied, liveEv, showScene, advance, bracketMotion, crown, now, faceOff });
  /* Backglass moments: the walkout, the finale's bust card and blinds up,
     and whether the produced crown is still playing (each a takeover) */
  const walkoutMoment = useTvWalkout(state, events);
  const pokerMoments = usePokerMoments(state, now);
  const crownPlaying = !!crown && now - Number(crown.anchor) < CROWN_TIMING.total;
  /* Karaoke (TVKaraoke.jsx) holds the room from its pick window to its
     result; a song holds it alone (a takeover: nothing over the video) */
  const karaokeOnTv = karaokeLive(state) && !state.karaoke.empty;
  const karaokeSong = karaokeOnTv && karaokeSongOn(state.karaoke, now);
  /* Quick Draw's showdown holds the room only in a gap (nothing live,
     drawn, posting or playing a moment); otherwise its result leads the
     ticker (tickerItems) */
  const showdown = useTvShowdown(state, { now:nowOverride, gap:tvPhotoGap({ loading:connection.mode === "loading", final,
    directed, result:!!resultModel, poker:!!state.poker && !state.results?.[state.poker.id], draft:!!draftLive, live:!!liveEv,
    intro:!!(sceneIntroEv || ceremonyIntroEv), reveal:!!ceremonyReveal, faceOff:!!faceOff })
    && !award && !walkoutMoment && !pokerMoments.takeover && !crownPlaying
    && !(state.geo?.order && !state.results?.[state.geo.eventId])
    && !triviaLive(state) && !karaokeLive(state) });
  /* the Trivia board's own lamps: the buzzers live, the Daily Double, the Final's clock */
  const boardLamps = useBoardChrome(state, nowOverride);
  /* a moment plays only while nothing else holds the room (a result's is
     fine: its bit plays over the podium, or over the winner scene's
     standings once a win song has walked out first), skipped and never
     queued */
  const gag = useGagShown(gagWindow.gag, { blocked:connection.mode === "loading" || final || !!award || !!walkoutMoment
    || !!pokerMoments.takeover || crownPlaying || !!showdown || !!faceOff || !!(sceneIntroEv || ceremonyIntroEv) || !!ceremonyReveal
    || karaokeSong || (directed && showScene?.active?.kind !== "winner") });
  useGagSound({ state, plan:gagWindow.plan, gag });
  /* a lead that changed with a decided contest docks after its gag too */
  const gagHold = useMemo(() => liveEv ? gagHoldMs(state, liveEv, events) : 0, [state, events, liveEv]);
  const leadHold = leadCard ? advanceHoldUntil(state, liveEv, leadCard.at) : 0;

  const dock = final ? null : dockCard({ now, correction,
    lead:leadCard && !directed && !resultModel ? leadCard : null,
    holdUntil:leadHold && leadHold + gagHold });

  /* the update reload waits for a gap in what is actually on screen */
  const busy = tvBusy({ sceneView, resultMoment:resultModel, advance, intro:sceneIntroEv || ceremonyIntroEv,
    reveal:ceremonyReveal, dock }) || !!faceOff || !!award || !!walkoutMoment || !!pokerMoments.takeover || crownPlaying
    || (karaokeOnTv && karaokeTvBusy(state.karaoke)) || !!showdown || !!gag;
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
  /* the game intro runs the frame in the session's own lamp; the draw
     after it keeps that lamp lit at the rest pace while its cards turn */
  const momentTakeovers = [(sceneIntroEv || ceremonyIntroEv) && { chase:{ color:"var(--phase)", pace:"run" } },
    ceremonyReveal && { chase:{ color:"var(--phase)", pace:"rest" } },
    winColor && { chase:{ color:winColor, pace:"run" } },
    champColor && { chase:{ color:champColor, pace:"rest" } },
    faceOff && { takeover:"faceoff", chase:{ color:"var(--lamp-live)", pace:"run" } },
    walkoutMoment && { takeover:"walkout" }, pokerMoments.takeover && { takeover:pokerMoments.takeover },
    crownPlaying && { takeover:"crown" },
    showdown && { takeover:"showdown", chase:{ color:"var(--lamp-live)", pace:"run" } },
    !directed && !award && !champion && boardLamps,
    karaokeSong && { takeover:"karaoke" },
    gag && { takeover:"gag", chase:gagLamp(state, gag) }].filter(Boolean);
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
  /* Rivalries and records (Oct 10): the weekend's own records take turns in
     the same gap, one card a turn, the next records turn the next card
     (recordsModel.js); only cards with data behind them */
  const records = useMemo(() => photoGap ? recordCards(state, events) : EMPTY, [photoGap, state, events]);
  /* attract mode (attractModel.js): an idle vignette cast from the room, its own turn after the records */
  const room = useMemo(() => photoGap ? attractRoom(state) : EMPTY, [photoGap, state]);
  /* the highlight reel (features/gags/highlights.js): the weekend's moments
     replayed, one a turn, newest first */
  const reel = useMemo(() => photoGap ? highlightReel(state, events) : EMPTY, [photoGap, state, events]);
  const ambient = photoGap ? withAttractTurns(withPhotoTurns(withHighlightTurns(withRecordTurns(ambientCards, records.length), reel.length),
    photos.length), room.length) : ambientCards;
  /* server time picks the card, so every TV in the house shows the same one;
     reduced motion still rotates, it just cuts instead of fading */
  const turnCard = ambient[ambientIndex(ambient.length, now, TV_AMBIENT_TURN_MS)] || "board";
  const scene = turnCard === "trophy" && now % TV_AMBIENT_TURN_MS >= TV_TROPHY_HOLD_MS ? "board" : turnCard;
  const record = scene === "records" ? recordAt(records, ambient, now, TV_AMBIENT_TURN_MS) : null;
  const highlight = scene === "highlights" ? highlightAt(reel, ambient, now, TV_AMBIENT_TURN_MS, highlightSince(state, events, reel))
    : null;

  const geoOnTv = !!state.geo?.order && !state.results?.[state.geo.eventId];
  /* Trivia holds the room from its first question to its result */
  const triviaOnTv = triviaLive(state);
  /* the board's rail of scores stands in the ticker's place */
  const boardOnTv = triviaOnTv && isBoardGame(state.trivia);
  /* Arrivals (Oct 4): from check-in opening until the first game is
     announced the TV is the lobby, the room filling up round the check-in
     code; after that, while anyone is on the way, the code rides a corner
     plate beside the standings. The code reaches only a TV socket. */
  const arrivals = arrivalsBoard(state, now);
  const road = arrivals.open ? new Set(arrivals.onTheWay) : null;
  const arriveLink = arriveCode && typeof window !== "undefined" ? arriveUrl(window.location.origin, arriveCode) : null;
  const lobbyOn = arrivals.stage === "lobby" && connection.mode !== "loading" && !directed && !award && !champion && !resultModel
    && !(state.poker && !state.results?.[state.poker.id]) && !draftLive && !geoOnTv && !triviaOnTv && !karaokeOnTv;
  const cornerWanted = arrivals.stage === "corner" && !!arriveLink && !final && !directed && !award && !resultModel
    && connection.mode !== "loading";
  const cornerWidth = 1920 - CORNER_W - CORNER_GAP;
  /* the vignette plays over the gap's own board (its turn's card), never
     under anything that holds the room or a card docked in the masthead */
  const attract = photoGap && !award && !geoOnTv && !triviaOnTv && !karaokeOnTv && !lobbyOn && !chrome.takeover && !dock
    ? attractAt({ ambient, now, room, early:nowOverride === undefined ? ATTRACT_EARLY_MS : 0 }) : null;

  const facts = useMemo(() => weekendFacts(state, events), [state, events]);
  const showTicker = !final && !(directed && sceneView.ticker === false) && !award && !lobbyOn && connection.mode !== "loading"
    && !(boardOnTv && !directed && !resultModel);
  const towers = {
    on:towersMode === "3d",
    height:1080 - MAST_H - (showTicker ? TICKER_H : 0),
    pixelRatio:Math.min(1.5, Math.max(1, (typeof window === "undefined" ? 1 : window.devicePixelRatio || 1) * fit.scale)),
    reducedMotion,
  };

  let content, liveShown = false, horizonShown = false, mastEvent = null, mastLamp = null, rail = null, ribbonOn = false,
    cornerShown = false, recordShown = null;
  if (connection.mode === "loading") {
    content = <div className="tv-pane tv-center" role="status">
      <div className="tv-opening tv-sign">
        <FDMark size={120} variant="night" />
        <div className="tv-display tv-connecting">Connecting</div>
      </div>
    </div>;
  } else if (directed) {
    /* a winner scene's podium: its backers ride the rail */
    const scene = showScene?.active;
    if (scene?.kind === "winner" && showScene.stepKey !== "standings") {
      const model = resultPresentation(state, events, scene.eventId);
      if (model) rail = { model, anchor:Number(scene.startedAt) };
    }
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
      : frame === "trophy" ? <TrophyCard state={state} events={events} now={now}
        turn={{ turnAt:Math.floor(now / TV_AMBIENT_MS) * TV_AMBIENT_MS, cycleMs:FROZEN_TURNS.length * TV_AMBIENT_MS,
          hold:TV_RESULT_MOMENT_MS, crownEnd:(crown?.anchor || crownAt.current || 0) + CROWN_TIMING.total, crownHold:TV_AMBIENT_MS }} />
      : view ? <ChampionMoment state={state} events={events} view={view} standings={standings} moment={crown} /> : null;
  } else if (resultModel) {
    const resultPhase = resultMomentPhase(resultMoment.anchor, now, { reducedMotion, holdSort:!!gag });
    content = <ResultSequence state={state} model={resultModel} phase={resultPhase} towers={towers}
      anchor={resultMoment.anchor} now={now} />;
    if (resultPhase.phase === "podium") rail = { model:resultModel, anchor:resultMoment.anchor };
  } else if (state.poker && !state.results[state.poker.id]) {
    mastEvent = events.find(e => e.id === state.poker.id) || null;
    mastLamp = state.poker.startedAt ? { label:"Playing", state:"live" } : null;
    content = <TVPoker state={state} standings={standings} now={now} />;
  } else if (draftLive) {
    mastEvent = draftLive.ev;
    content = <TVDraft state={state} ev={draftLive.ev} d={draftLive.d} />;
  } else if (geoOnTv) {
    /* Where and When holds the room from its first photo to its result */
    mastEvent = events.find(e => e.id === state.geo.eventId) || null;
    mastLamp = state.geo.phase === "guess" ? { label:"Playing", state:"live" } : null;
    content = <TVGeo state={state} now={now} />;
  } else if (triviaOnTv) {
    mastEvent = events.find(e => e.id === state.trivia.eventId) || null;
    mastLamp = ["question", "clue", "answer", "dd-clue", "final-clue"].includes(state.trivia.phase) ? { label:"Playing", state:"live" } : null;
    content = <TVTrivia state={state} now={now} fixed={nowOverride !== undefined} />;
  } else if (karaokeOnTv) {
    /* Karaoke holds the room from its pick window to its result */
    mastEvent = events.find(e => e.id === state.karaoke.eventId) || null;
    mastLamp = ["pick", "turns"].includes(state.karaoke.phase) ? { label:"Playing", state:"live" } : null;
    content = <TVKaraoke state={state} now={now} fixed={nowOverride !== undefined} onVideoStatus={onVideoStatus} />;
  } else if (lobbyOn) {
    /* the lobby: the check-in code at the center, the seats round it */
    content = <TVLobby state={state} board={arrivals} now={now} url={arriveLink} />;
  } else if (liveEv) {
    liveShown = true;
    cornerShown = cornerWanted;
    mastEvent = liveEv;
    const inContest = liveContest && ["betting-open", "betting-locked", "in-progress", "awaiting-result"].includes(liveContest.phase);
    /* the masthead's lamp reads the contest itself, so it can never say
       betting is open while the board says it is locked */
    mastLamp = inContest ? contestLamp(liveContest) : decided ? { label:"Decided", state:"live" } : { label:"Live", state:"live" };
    const beside = inContest && (activeBracketEv || activeStageEv);
    const band = !!beside && !!activeBracketEv && (state.draws?.[activeBracketEv.id]?.teams?.length || 0) >= BIG_BRACKET;
    if (band) content = <div className="tv-live is-band">
      <div className="tv-live-main">
        {/* the decided contest's table settles in the next one's place for its moment */}
        <div className="tv-contest-slot">
          {advance ? <AdvanceMoment state={state} events={events} ev={liveEv} moment={advance} width={BOARD_W} band clock={introClock} />
            : <TVTable state={state} events={events} ev={liveEv} contest={liveContest} width={BOARD_W}
              height={BAND_TABLE_H} band={liveContest.sides.length === 2} teach={!!underdogTeach?.active} clock={introClock} />}
        </div>
        {faceOff && (() => {
          const view = faceOffView(state, liveEv, liveContest, events);
          return view ? <FaceOff state={state} events={events} ev={liveEv} contest={liveContest} view={view} moment={faceOff}
            teach={!!underdogTeach} /> : null;
        })()}
      </div>
      <div className="tv-live-band tv-glass" style={{ height:BAND_H }}>
        <TVBracket state={state} ev={activeBracketEv} hot={upNext ? [upNext.r, upNext.m] : null}
          motion={bracketMotion} size="band" fit={BAND_FIT} teachBye={byeTeach} now={now} />
      </div>
    </div>;
    else content = <div className="tv-live">
      <div className="tv-live-main">
        {/* the decided contest's table settles in the live table's place
            for its moment (over a bracket, beside it), then the next deals in */}
        {advance ? <div className="tv-contest-slot">
          <AdvanceMoment state={state} events={events} ev={liveEv} moment={advance}
            width={slotAdvance ? BOARD_W - SIDE_W - 28 : BOARD_W} clock={introClock} />
        </div> : inContest ? <div className="tv-contest-slot">
          <TVTable state={state} events={events} ev={liveEv} contest={liveContest}
            width={beside ? BOARD_W - SIDE_W - 28 : BOARD_W} teach={!!underdogTeach?.active} clock={introClock} />
        </div> : decided ? <DecidedWinner state={state} ev={liveEv} winner={decided} motion={bracketMotion} />
          : activeBracketEv ? <div className="tv-glass tv-live-bracket"><TVBracket state={state} ev={activeBracketEv} size="full"
            hot={upNext ? [upNext.r, upNext.m] : null} motion={bracketMotion} teachBye={byeTeach} now={now} /></div>
            : activeStageEv ? <div className="tv-glass tv-live-bracket"><StageGroups state={state} ev={activeStageEv} /></div>
              : <div className="tv-glass tv-center tv-live-idle">
                <GameMark id={liveEv.game} variant={liveEv.variant} size={130} />
                <PayoutLadder ev={liveEv} size="tv" />
              </div>}
        {faceOff && inContest && (() => {
          const view = faceOffView(state, liveEv, liveContest, events);
          return view ? <FaceOff state={state} events={events} ev={liveEv} contest={liveContest} view={view} moment={faceOff}
            teach={!!underdogTeach} /> : null;
        })()}
      </div>
      {beside && <aside className="tv-live-side tv-glass" style={{ width:SIDE_W }}>
        {activeBracketEv ? <TVBracket state={state} ev={activeBracketEv} hot={upNext ? [upNext.r, upNext.m] : null}
          motion={bracketMotion} size="side" fit={SIDE_FIT} teachBye={byeTeach} now={now} /> : <StageGroups state={state} ev={activeStageEv} />}
      </aside>}
    </div>;
  } else if (scene === "join") {
    content = <div className="tv-pane tv-center">
      <div className="tv-join tv-glass">
        <div className="tv-join-copy">
          <FDMark size={120} variant="night" />
          <div className="fd-show tv-join-title">Field Day</div>
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
  } else if (record) {
    const turnAt = Math.floor(now / TV_AMBIENT_TURN_MS) * TV_AMBIENT_TURN_MS;
    content = <TVRecord key={`${record.id}@${turnAt}`} state={state} card={record} turnAt={turnAt} now={now} />;
    recordShown = record.kind;
  } else if (highlight) {
    content = <TVHighlight key={`${highlight.entry.id}@${highlight.turnAt}`} state={state} entry={highlight.entry}
      turnAt={highlight.turnAt} now={now} phase={phase} />;
  } else if (scene === "next" && nextEv) {
    /* what is next stands over the standings: the towers stay the lower third */
    horizonShown = true;
    cornerShown = cornerWanted;
    content = <NextUpCard ev={nextEv} />;
  } else if (scene === "latest" && latest) {
    const model = resultPresentation(state, events, latest.ev.id);
    content = model ? <ResultSequence state={state} model={model} phase={{ phase:"podium", revealed:3 }} /> : null;
  } else if (scene === "trophy") {
    /* the plates posted since the cup last held the room engrave on this turn */
    content = <TrophyCard state={state} events={events} now={now}
      turn={{ turnAt:Math.floor(now / TV_AMBIENT_TURN_MS) * TV_AMBIENT_TURN_MS, cycleMs:ambient.length * TV_AMBIENT_TURN_MS,
        hold:TV_RESULT_MOMENT_MS }} />;
  } else {
    const flat = <div className="tv-pane"><StandingsBoard state={state} standings={standings} allTied={allTied}
      /></div>;
    ribbonOn = towers.on && !!nextEv && !final;
    /* the corner plate rides the towers board; the flat board has no room for it */
    cornerShown = cornerWanted && towers.on;
    content = towers.on ? <TowersView state={state} rows={standingsTowerRows(standings)}
      ribbon={nextEv && !final ? <NextRibbon ev={nextEv} top={ribbonTop(standingsTowerRows(standings), towers.height)} /> : null}
      height={towers.height} towers={towers} fallback={flat} road={road} width={cornerShown ? cornerWidth : 1920} /> : flat;
  }
  /* betting open on an event not yet in play: its name in the masthead */
  if (!mastEvent && !final && !directed && !award && onDeckEv && connection.mode !== "loading") {
    mastEvent = onDeckEv;
    mastLamp = { label:"Betting open", state:"pending" };
  }
  const tickerAll = tickerItems({ state, events, standings, allTied, liveCrew, latest, liveEv, liveContest,
    onDeckEv, openWon:mergeWagerLines(allW.filter(x => x.r.status === "won")), nextEv, now, facts, draft:!!draftLive, showing:resultModel?.eventId || null,
    /* events already lettered on screen: the draft's in the masthead, the
       gap card's next event or the board's ribbon; the ticker never repeats them */
    lettered:[draftLive?.ev?.id, scene === "next" || ribbonOn ? nextEv?.id : null, !liveEv && !draftLive ? onDeckEv?.id : null].filter(Boolean) });
  /* a records card's swing is the weekend's biggest: the ticker's (the
     latest result's) steps aside, never two "Biggest swing"s on one screen */
  const items = recordShown === "swing" ? tickerAll.filter(item => item.tag !== "Biggest swing") : tickerAll;
  const showHorizon = (liveShown || horizonShown) && connection.mode !== "loading";
  /* a live question holds the ticker still */
  const quietTicker = (geoOnTv && state.geo?.phase === "guess") || (triviaOnTv && state.trivia?.phase === "question") || karaokeOnTv;
  /* while a podium holds the room, its winners' backers take the ticker's place */
  const railOn = !!rail && !!backersRail(rail.model.winnerStacks);

  const dockNode = dock?.kind === "correction" ? <CorrectionCard correction={dock.correction} />
    : dock?.kind === "lead" ? <LeadChange state={state} leader={dock.lead.leader} previous={dock.lead.previous} /> : null;

  return (
    <TextFloor px={24}><div className="tv-stage fd-night">
      <div className={`tv-canvas${showHorizon ? " has-horizon" : ""}${cornerShown ? " has-arrive-corner" : ""}`} data-tv-canvas data-phase={phase}
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
        {attract && <TVAttract key={attract.key} state={state} attract={attract} phase={phase} now={now} fixed={nowOverride !== undefined} />}
        {showHorizon && <Horizon state={state} standings={standings} towers={towers} road={road}
          width={cornerShown ? cornerWidth : 1920} />}
        {cornerShown && <TVArriveCorner board={arrivals} url={arriveLink} />}
        {showTicker && (railOn ? <BackersRail state={state} model={rail.model} anchor={rail.anchor} now={now}
          key={`rail:${rail.model.eventId}:${rail.model.revision}:${rail.anchor}`} />
          : <Ticker items={items} reducedMotion={reducedMotion} now={now} quiet={quietTicker} narrow={cornerShown} />)}
        {sceneIntroEv && <IntroOverlay key={sceneIntroEv.id} state={state} ev={sceneIntroEv} reducedMotion={reducedMotion}
          sceneAt={showScene?.active?.startedAt} now={introClock}
          handoff={!!(state.draws?.[sceneIntroEv.id] || state.stages?.[sceneIntroEv.id])} />}
        {ceremonyIntroEv && <IntroOverlay key={ceremonyIntroEv.id} state={state} ev={ceremonyIntroEv}
          handoff={!!ceremony?.handoff} reducedMotion={reducedMotion} onDone={ceremony?.onIntroDone || null} now={introClock} />}
        {ceremonyReveal && <TVDrawReveal key={ceremonyReveal.id} state={state} events={events} reveal={ceremonyReveal}
          reducedMotion={reducedMotion} onDone={ceremony?.onRevealDone || null} />}
        <TVWalkout state={state} moment={walkoutMoment} events={events} />
        <TVPokerMoments state={state} moments={pokerMoments} />
        {showdown && <TVShowdown key={showdown.duel.id} state={state} active={showdown} now={nowOverride} />}
        {gag && <TVGag key={gag.id} state={state} gag={gag} phase={phase} />}
        <FrameLamps color={chrome.chase?.color || null} pace={chrome.chase?.pace || "rest"} />
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
