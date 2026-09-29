import React, { useEffect, useMemo, useRef, useState } from "react";
import qrcode from "qrcode-generator";
import {
  ROSTER, disp, resolveWager, resolveCurrentContest, resolveWeekendOperation,
} from "../../../shared/core.js";
import { resolveShowScene } from "../../../shared/show.js";
import { Avatar, AvatarStack } from "../identity/PlayerIdentity.jsx";
import { GameMark } from "../../ui/GameMark.jsx";
import { FDMark } from "../../ui/Brand.jsx";
import { wagerPickLabel, mergeWagerLines } from "../wagers/Wagers.jsx";
import { BetStacks, FitStacks } from "../wagers/BetStacks.jsx";
import { STACK_CAP, contestStacks, stackName, stackGeometry, pickStacks } from "../wagers/betStacks.js";
import {
  fmt, signed, editionLabel, payoutLine, oddsLine, phaseBand, placeName, sessionLabel,
  tvCanvasFit, tvSceneView, ambientIndex, TV_AMBIENT_MS,
  tvLiveEvent, nextUpEvent, nextOpenMatch, latestResultOf, resultPresentation, resultMomentPhase, resultMomentFor,
  advanceMoment, advanceHoldUntil, correctionMoment, dockCard, decidedWinner, contestSideView,
  tvConnection, tickerItems, tickerPage, tvBusy, championView,
  duelBoard, spotlightPlayer,
} from "./tvModel.js";
import { IntroOverlay, TVDrawReveal } from "./TVCeremony.jsx";
import { TVDraft } from "./TVDraft.jsx";
import { TVPoker } from "./TVPoker.jsx";
import {
  StageGroups, WeekendProgressCard, StackRaceCard, DuelBoardCard, SpotlightCard, RosterWall,
  TrophyCard,
} from "./TVCards.jsx";
import { TVWinLine, useContestWinLines } from "./TVCards.jsx";
import { TVBracket } from "./TVBracket.jsx";
import { ChampionMoment } from "./TVChampion.jsx";
import { useBracketMotion, useCrownMoment } from "./tvMotion.js";
import { DesertBand } from "./DesertBand.jsx";
import { constellationStars, isDaySky, isNightSky } from "./desertModel.js";
import { weekendPhase } from "../../ui/phase.js";
import { TowersBoard, useTowersMode, towersFailure } from "./TowersBoard.jsx";
import { towerLeaders, standingsTowerRows, resultTowerRows } from "./towersModel.js";
import { useServerNow } from "./serverClock.js";
import { useRoomSound } from "./roomSound.js";
import { SoundUnlockChip } from "./SoundUnlockChip.jsx";
import "./tv.css";
import "./tvScenes.css";

const EMPTY = [];
/* the backdrop's stars keep one patch of sky, right of the masthead type
   and above the strip's peaks, whichever band is showing */
const STAR_BOX = { left:1140, right:1860, top:8, bottom:44 };
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

/* Exit TV is for whoever is holding the remote: it hides once the pointer
   has been still, and any pointer, touch, or key brings it back */
const EXIT_IDLE_MS = 3000;
function usePointerActive() {
  const [active, setActive] = useState(true);
  useEffect(() => {
    let t = setTimeout(() => setActive(false), EXIT_IDLE_MS);
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

/* a display size that fits a name's longest word into its column */
const fitDisplay = (text, max, width) => {
  const longest = Math.max(4, ...String(text || "").split(/\s+/).map(word => word.length));
  return Math.max(40, Math.min(max, Math.floor(width / (longest * 0.5))));
};

const Move = ({ delta, className = "tv-move" }) => !delta ? <span className={className} /> : (
  <span className={`${className} ${delta > 0 ? "is-up" : "is-down"}`}
    aria-label={`${delta > 0 ? "Up" : "Down"} ${Math.abs(delta)}`}>
    {delta > 0 ? "▲" : "▼"}{Math.abs(delta)}</span>
);

function Masthead({ state, onDeckEv, showOnDeck, connection, lastUpdateAt, final, dock, day = false }) {
  const offline = connection.mode === "reconnecting";
  const since = lastUpdateAt ? new Date(lastUpdateAt).toLocaleTimeString([], { hour:"numeric", minute:"2-digit" }) : null;
  return (
    <header className="tv-mast">
      <FDMark size={64} variant={day ? undefined : "night"} />
      <div className="tv-display tv-mast-title">Field Day</div>
      {!dock && <div className="tv-mast-edition">{editionLabel()}</div>}
      {offline ? (
        <span className="tv-status is-offline" role="status"><i />
          {since ? `Reconnecting · last update ${since}` : "Reconnecting"}</span>
      ) : final ? (
        <span className="tv-status is-final">Final</span>
      ) : (
        <span className={`tv-status${state.live ? " is-live" : ""}`}><i />
          {state.live ? "Weekend live" : "Check-in"}</span>
      )}
      {dock ? <div className="tv-dock">{dock}</div> : showOnDeck && onDeckEv && (
        <div className="tv-ondeck">
          <span className="tv-label" style={{ color:"var(--live2)" }}><i className="fd-beat-dot tv-beat" aria-hidden="true" />Betting open</span>
          <b>{onDeckEv.name}</b>
        </div>
      )}
    </header>
  );
}

function TickerItem({ state, it }) {
  return (
    <span className="tv-ticker-item">
      <span className="tv-ticker-tag" style={{ background:it.tone }}>{it.tag}</span>
      {(it.players || []).map(p => <Avatar key={p} state={state} p={p} size={34} />)}
      <span className="tv-ticker-text">{it.text}</span>
    </span>
  );
}
/* scrolling normally; reduced motion cuts between pages on the server clock */
function Ticker({ state, items, reducedMotion, now }) {
  if (reducedMotion) {
    const page = tickerPage(items, now);
    return (
      <div className="tv-ticker is-paged" aria-label={`Ticker, page ${page.index + 1} of ${page.pages}`}>
        {page.items.map((it, i) => <TickerItem key={`${page.index}-${i}`} state={state} it={it} />)}
      </div>
    );
  }
  return (
    <div className="tv-ticker">
      <div className="tv-ticker-track" style={{ animationDuration:`${Math.max(28, items.length * 10)}s` }}>
        {[0, 1].map(k => (
          <span key={k} style={{ display:"inline-flex", alignItems:"center" }} aria-hidden={k === 1 || undefined}>
            {items.map((it, i) => <TickerItem key={i} state={state} it={it} />)}
          </span>
        ))}
      </div>
    </div>
  );
}

/* all thirteen, the leader on sun with dark ink, rank arrows from the last move */
function StandingsBoard({ state, standings, allTied, rankDeltas = {}, title }) {
  const leader = !allTied ? standings[0] : null;
  const rest = leader ? standings.slice(1) : standings;
  const half = Math.ceil(rest.length / 2);
  return (
    <div className="tv-board">
      {title && <div className="tv-display tv-title" style={{ fontSize:56 }}>{title}</div>}
      {leader && (
        <div className="tv-leader">
          <div className="tv-rank">1</div>
          <Avatar state={state} p={leader.player} size={68} />
          <div>
            <div className="tv-name">{disp(state, leader.player)}</div>
            <div className="tv-sub">{leader.wins} win{leader.wins === 1 ? "" : "s"}
              {leader.betNet !== 0 ? ` · bets ${signed(leader.betNet)}` : ""}</div>
          </div>
          <Move delta={rankDeltas[leader.player]} />
          <div key={leader.pts} className="tv-pts" style={{ animation:"si-pop .5s ease-out" }}>{fmt(leader.pts)}</div>
        </div>
      )}
      <div className="tv-board-cols">
        {[rest.slice(0, half), rest.slice(half)].map((col, ci) => (
          <div key={ci} style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {col.map(r => (
              <div key={r.player} className={`tv-row${!allTied && r.rank === 2 ? " is-silver"
                : !allTied && r.rank === 3 ? " is-bronze" : ""}`}>
                <div className="tv-rank">{allTied ? "·" : r.rank}</div>
                <Avatar state={state} p={r.player} size={52} />
                <div className="tv-name">{disp(state, r.player)}</div>
                <Move delta={rankDeltas[r.player]} />
                <div key={r.pts} className="tv-pts" style={{ animation:"si-pop .5s ease-out" }}>{fmt(r.pts)}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Chip Towers: the standings as stacks of each player's own chip ──
   The table and the labels are flat HTML; the towers are a transparent
   WebGL layer over them, loaded only on a TV that can draw it. */
const TOWER_BASE = 716;
const TOWER_TABLE = 560;
const TOWER_SLOT = 136;
const towerNameSize = name => {
  const longest = Math.max(4, ...String(name || "").split(/\s+/).map(word => word.length));
  return Math.max(24, Math.min(32, Math.floor(TOWER_SLOT / (longest * 0.5))));
};
function TowersView({ state, rows, head = null, height, towers, fallback, splits = false, rankDeltas = {} }) {
  const leaders = towerLeaders(rows);
  const labelFor = row => {
    const name = disp(state, row.player);
    const delta = splits ? row.move : rankDeltas[row.player];
    return <>
      <b className="tv-tower-name" style={{ fontSize:towerNameSize(name) }}>{name}</b>
      <span className="tv-tower-pts">{fmt(row.pts)}{delta ? <Move delta={delta} className="tv-move tv-tower-move" /> : null}</span>
      {splits && row.award ? <span className="tv-tower-split">Event <b>{signed(row.award)}</b></span> : null}
      {splits && row.bets ? <span className="tv-tower-split">Bets <b>{signed(row.bets)}</b></span> : null}
    </>;
  };
  return (
    <div className="tv-towers-pane">
      <div className="tv-towers-table" style={{ top:TOWER_TABLE }} />
      <TowersBoard fallback={fallback} rows={rows} leaders={leaders} width={1920} height={height} baseY={TOWER_BASE}
        top={head ? 104 : 48} pixelRatio={towers.pixelRatio} reducedMotion={towers.reducedMotion} labelFor={labelFor} />
      {head && <div className="tv-towers-head tv-on-sky">{head}</div>}
    </div>
  );
}

/* compact standings rail beside a live event (the poker table has its own,
   TVPoker.jsx) */
function Rail({ state, standings, allTied, rankDeltas = {} }) {
  return (
    <aside className="tv-rail">
      <div className="tv-rail-head tv-label">Standings</div>
      {standings.map((r, i) => (
        <div key={r.player} className={`tv-rail-row${i === 0 && !allTied ? " is-lead" : ""}`}>
          <span className="tv-rank">{allTied ? "·" : r.rank}</span>
          <Avatar state={state} p={r.player} size={36} />
          <span className="tv-name">{disp(state, r.player)}</span>
          <Move delta={rankDeltas[r.player]} />
          <span className="tv-pts">{fmt(r.pts)}</span>
        </div>
      ))}
    </aside>
  );
}

/* The current contest, large: every side's faces and name, and the chips
   riding it as each bettor's own stack, biggest first, a first name under
   each and the side's total at the head of its felt. Any two-sided contest
   is a head-to-head. A bracket match IS the up-now banner: gold outline,
   round named once. */
const TV_STACKS = {
  h2h:{ face:88, faceMany:64, chip:64, cap:STACK_CAP },
  grid:{ face:64, faceMany:52, chip:52, cap:STACK_CAP },
  compact:{ face:44, faceMany:36, chip:48, cap:8 },
};
/* A wide field keeps every side on screen: rows with chips take the room
   they need, and the chips shrink only when many rows carry them. */
const COMPACT_SIZES = [[50, 8], [46, 8], [42, 7], [38, 6], [34, 6], [30, 5]];
const COMPACT_ROW = 64, COMPACT_GAP = 14, COMPACT_NAME = 30, COMPACT_PAD = 20, COMPACT_PER_LINE = 3, COMPACT_SLOTS = 6;
/* lines: for each grid row, how many lines of stacks its fullest card needs */
export function compactStackSize(lines, budget) {
  for (const [chip, cap] of COMPACT_SIZES) {
    const line = stackGeometry(chip, cap).height + COMPACT_NAME + 6;
    const used = lines.reduce((sum, count) => sum + Math.max(COMPACT_ROW, count ? COMPACT_PAD + count * line : 0), 0)
      + (lines.length - 1) * COMPACT_GAP;
    if (used <= budget) return { chip, cap };
  }
  const [chip, cap] = COMPACT_SIZES[COMPACT_SIZES.length - 1];
  return { chip, cap };
}
function ContestBoard({ state, events, ev, contest }) {
  const stacks = contestStacks(state, events, contest);
  /* X8: a wide field's rows have no room for the line */
  const winLines = useContestWinLines(state, ev, contest.sides.length > 4 ? null : contest, events);
  const betting = contest.phase === "betting-open";
  const n = contest.sides.length;
  const h2h = n === 2;
  const compact = n > 4;
  const colCount = h2h ? 2 : n <= 6 ? 2 : 3;
  const upNow = contest.kind === "match";
  const head = upNow ? `Up now · ${contest.label}` : contest.label !== ev.name ? contest.label : null;
  let size = h2h ? TV_STACKS.h2h : compact ? TV_STACKS.compact : TV_STACKS.grid;
  if (compact) {
    const lines = Array.from({ length:Math.ceil(n / colCount) }, () => 0);
    contest.sides.forEach((side, index) => {
      const row = Math.floor(index / colCount);
      lines[row] = Math.max(lines[row], Math.ceil(Math.min(COMPACT_SLOTS, stacks.get(side.key)?.stacks.length || 0) / COMPACT_PER_LINE));
    });
    size = { ...size, ...compactStackSize(lines, head ? 660 : 716) };
  }
  const cols = h2h ? "1fr auto 1fr" : `repeat(${colCount},1fr)`;
  const cards = contest.sides.map(side => {
    const view = contestSideView(state, ev, contest, side);
    const ride = stacks.get(side.key) || { stacks:[], total:0 };
    const face = view.players.length > 2 ? size.faceMany : size.face;
    const total = ride.total > 0 && <div className="tv-side-total">{fmt(ride.total)}</div>;
    /* a wide field's row keeps two lines of stacks; past that the smallest group */
    const pile = ride.stacks.length > 0 && <BetStacks stacks={ride.stacks} size={size.chip} cap={size.cap}
      className="tv-stacks" names={p => stackName(state, p)} tagSize={24} slots={COMPACT_SLOTS} />;
    /* a felt fits any number of bettors without covering its total (P1) */
    const felt = ride.stacks.length > 0 && <FitStacks stacks={ride.stacks} total={ride.total} totalClass="tv-side-total"
      chip={size.chip} cap={size.cap} min={34} className="tv-stacks-fit" names={p => stackName(state, p)} tagSize={24} />;
    /* a wide field: one row per side, its stacks beside the name */
    if (compact) return (
      <div key={String(side.key)} className={`tv-side is-row${ride.stacks.length ? " has-chips" : ""}`}>
        <div className="tv-side-faces">
          {view.players.map(p => <Avatar key={p} state={state} p={p} size={face} />)}
        </div>
        <div className="tv-side-id">
          <div className="tv-side-name">{view.name}</div>
          {total}
        </div>
        {pile}
      </div>
    );
    return (
      <div key={String(side.key)} className={`tv-side${ride.stacks.length ? " has-chips" : ""}`}>
        <div className="tv-side-top">
          <div className="tv-side-faces">
            {view.players.map(p => <Avatar key={p} state={state} p={p} size={face} />)}
          </div>
          <div className="tv-side-name">{view.name}</div>
        </div>
        <TVWinLine lines={winLines} sideKey={side.key} />
        <div className={`tv-felt${ride.stacks.length ? "" : " is-empty"}`}>
          {felt || <span className="tv-felt-empty">{betting ? "No chips yet" : "No bets"}</span>}
        </div>
      </div>
    );
  });
  return (
    <div className={`tv-contest${upNow ? " is-up-now" : ""}`}>
      {head && <div className="tv-display tv-contest-head">{upNow && <i className="fd-beat-dot tv-beat" aria-hidden="true" />}{head}</div>}
      <div className={`tv-sides${compact ? " is-compact" : ""}${h2h ? " is-h2h" : ""}`} style={{ gridTemplateColumns:cols }}>
        {h2h ? [cards[0], <div key="vs" className="tv-vs">VS</div>, cards[1]] : cards}
      </div>
      <div className="tv-contest-foot">{betting ? "Betting open" : "Bets locked"} · {oddsLine(contest)}</div>
    </div>
  );
}

/* a finished bracket or stage waiting on its official result: the room sees
   who won it and the whole draw, never the commissioner's next step */
function DecidedWinner({ state, ev, winner, motion = null }) {
  const plural = winner.players.length > 1;
  return (
    <div className="tv-decided">
      <div className="tv-decided-winner">
        <div className="tv-side-faces">
          {winner.players.map(p => <Avatar key={p} state={state} p={p} size={112} ring />)}
        </div>
        <div className="tv-display tv-decided-name">{winner.name}</div>
        <div className="tv-display tv-decided-stamp">{plural ? "Win" : "Wins"}</div>
      </div>
      {state.brackets?.[ev.id] ? <TVBracket state={state} ev={ev} size="full" motion={motion} /> : <StageGroups state={state} ev={ev} />}
    </div>
  );
}

/* The decided contest's chips settle: the winners' stacks grow by their
   payout, every other stack slides back to the bank. */
const SETTLE_LOSE_AT = 700, SETTLE_PAY_AT = 1300;
function SettleBoard({ state, settle, size = 56 }) {
  if (!settle?.any) return null;
  const names = p => stackName(state, p);
  return (
    <div className="tv-settle">
      {settle.winners.length > 0 && <div className="tv-settle-zone is-won">
        <div className="tv-settle-head" style={{ animationDelay:`${SETTLE_PAY_AT}ms` }}>{signed(settle.paid)}</div>
        <BetStacks stacks={settle.winners} size={size} names={names} delay={SETTLE_PAY_AT} tagSize={24} className="tv-stacks" />
      </div>}
      {settle.losers.length > 0 && <div className="tv-settle-zone is-lost">
        <div className="tv-settle-head" style={{ animationDelay:`${SETTLE_LOSE_AT}ms` }}>{signed(-settle.lost)}</div>
        <BetStacks stacks={settle.losers} size={size} names={names} delay={SETTLE_LOSE_AT} tagSize={24} className="tv-stacks" />
      </div>}
    </div>
  );
}

function AdvanceMoment({ state, moment, slot = false }) {
  const chips = !!moment.settle?.any;
  /* over a bracket, the card keeps to the contest's space so the bracket
     below can carry the winners forward */
  if (slot) return (
    <div className={`tv-advance is-slot${chips ? " has-settle" : ""}`} role="status">
      <div className="tv-advance-who">
        <div className="tv-label">{moment.round}</div>
        <div className="tv-advance-line">
          <div style={{ display:"flex", gap:10, flexShrink:0 }}>
            {moment.players.map(p => <Avatar key={p} state={state} p={p} size={80} ring />)}
          </div>
          <div className="tv-display tv-advance-name">{moment.name}</div>
        </div>
        <div key={moment.id} className="tv-display tv-advance-stamp">{moment.verb}</div>
        {moment.detail && <div className="tv-advance-detail">{moment.detail}</div>}
      </div>
      <SettleBoard key={`settle-${moment.id}`} state={state} settle={moment.settle} />
    </div>
  );
  return (
    <div className={`tv-advance${chips ? " has-settle" : ""}`} role="status">
      <div className="tv-label">{moment.round}</div>
      <div style={{ display:"flex", gap:16 }}>
        {moment.players.map(p => <Avatar key={p} state={state} p={p} size={chips ? 96 : 120} ring />)}
      </div>
      <div className="tv-display tv-advance-name">{moment.name}</div>
      <div key={moment.id} className="tv-display tv-advance-stamp">{moment.verb}</div>
      {moment.detail && <div className="tv-advance-detail">{moment.detail}</div>}
      <SettleBoard key={`settle-${moment.id}`} state={state} settle={moment.settle} />
    </div>
  );
}

function LeadChange({ state, leader, previous }) {
  if (!leader) return null;
  const names = leader.players.map(p => disp(state, p));
  return (
    <div className="tv-leadchange" role="status">
      <AvatarStack state={state} players={leader.players} size={48} max={3} />
      <b>{names.join(" and ")} {names.length > 1 ? "lead" : "leads"} · {fmt(leader.pts)}</b>
      {previous && (
        <span className="tv-prev" aria-label={`Previously ${previous.players.map(p => disp(state, p)).join(" and ")}`}>
          <AvatarStack state={state} players={previous.players} size={36} max={2} />
        </span>
      )}
    </div>
  );
}
function CorrectionCard({ state, correction }) {
  return (
    <div className="tv-correction" role="status">
      <AvatarStack state={state} players={correction.players} size={44} max={3} />
      <b>Corrected · {correction.text}</b>
    </div>
  );
}

/* one podium place: a single side large, a split place stacked, a wide tie
   counted */
function PodiumPlace({ state, item, backers = null }) {
  const first = item.place === 1;
  const width = first ? 620 : 470;
  const single = item.groups.length === 1;
  const wide = item.groups.length > 3;
  const riding = first && backers?.winners?.length > 0;
  const face = first ? (item.players.length > 2 ? 120 : riding ? 170 : 220) : item.players.length > 2 ? 84 : 140;
  return (
    <div className={`tv-place${first ? " is-first" : ""}`}>
      <div className="tv-place-rank">{placeName(item.place)}</div>
      {single || wide ? <>
        <div className="tv-place-faces">
          {item.players.map(p => <Avatar key={p} state={state} p={p} size={wide ? 64 : face} ring={first} />)}
        </div>
        <div className="tv-display tv-place-name"
          style={{ fontSize:fitDisplay(item.names[0], first ? 120 : 64, width) }}>{item.names[0]}</div>
      </> : (
        <div className="tv-place-split">
          {item.groups.map(group => (
            <div key={group.name} className="tv-place-group">
              <div className="tv-side-faces">
                {group.players.map(p => <Avatar key={p} state={state} p={p} size={first ? 96 : 64} />)}</div>
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
        <BetStacks stacks={backers.winners} size={46} names={p => stackName(state, p)} delay={900} tagSize={24}
          className="tv-stacks" />
      </div>}
    </div>
  );
}

const ROW_STEP = 60;
/* one result, told twice: a podium climbing third to first, then all thirteen
   rows moving from where they stood to where they stand, each change split
   into the event award and the bets on it (poker: final stacks). */
function ResultSequence({ state, model, phase, directedStep = null, towers = null }) {
  if (!model) return null;
  if (phase.phase === "podium") {
    const shown = new Set(model.revealOrder.slice(0, Math.min(model.revealOrder.length, phase.revealed)).map(p => p.place));
    const at = place => model.podium.find(item => item.place === place);
    return (
      <div className="tv-pane tv-result">
        <div className="tv-result-band" style={{ background:phaseBand({ session:model.session }) }} />
        <div className="tv-result-head">
          <GameMark id={model.game} size={96} />
          <div>
            <div className="tv-label" style={{ color:"var(--sun)" }}>{model.kind === "stacks" ? "Final stacks" : "Final"}</div>
            <div className="tv-display tv-result-name">{model.eventName}</div>
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
    <div style={{ display:"flex", alignItems:"center", gap:24, height:70, marginBottom:6 }}>
      <div className="tv-display tv-title" style={{ fontSize:52 }}>
        {model.kind === "stacks" ? "Final stacks" : directedStep ? "Standings updated" : "Standings"}</div>
      <div className="tv-label">{model.eventName}</div>
      <div style={{ marginLeft:"auto" }}>
        {phase.sorted && model.leadChanged && <LeadChange state={state} leader={model.leader} previous={model.previousLeader} />}
      </div>
    </div>
  );
  const flat = (
    <div className="tv-pane" style={{ paddingTop:0 }}>
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
              {phase.sorted ? <Move delta={row.move} /> : <span className="tv-move" />}
              <Avatar state={state} p={row.player} size={40} />
              <span className="tv-name">{disp(state, row.player)}</span>
              {model.kind === "stacks" ? (
                <span className="tv-split">{row.away ? "Away" : row.busted ? "Busted" : `Started ${fmt(row.before)}`}</span>
              ) : (<>
                <span className="tv-split">{row.award ? <>Event <b>{signed(row.award)}</b></> : null}</span>
                <span className="tv-split">{row.bets ? <>Bets <b>{signed(row.bets)}</b></> : null}</span>
              </>)}
              <span key={pts} className="tv-pts">{fmt(pts)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
  if (towers?.on && model.kind !== "stacks")
    return <TowersView state={state} rows={resultTowerRows(model, phase.sorted)} head={head} height={towers.height}
      towers={towers} fallback={flat} splits />;
  return flat;
}


function DirectedScene({ state, events, scene, now, standings, rankDeltas, reducedMotion, towers = null, crown = null }) {
  const kind = scene.active.kind;
  if (kind === "standings") {
    const flat = <div className="tv-pane"><StandingsBoard state={state} standings={standings} allTied={false}
      rankDeltas={rankDeltas} title="Standings" /></div>;
    return towers?.on ? <TowersView state={state} rows={standingsTowerRows(standings)} rankDeltas={rankDeltas}
      head={<div className="tv-display tv-title" style={{ fontSize:56 }}>Standings</div>}
      height={towers.height} towers={towers} fallback={flat} /> : flat;
  }
  if (kind === "champion") {
    const view = championView(state, events, scene.standings);
    return view ? <ChampionMoment state={state} view={view} standings={scene.standings} moment={crown} /> : null;
  }
  if (kind === "opening") {
    if (scene.stepKey === "room") return <RosterWall state={state} />;
    return (
      <div className="tv-pane tv-center">
        <FDMark size={150} variant="night" />
        <div className="tv-display" style={{ fontSize:170, lineHeight:0.82, color:"var(--sun)", marginTop:26 }}>Field Day</div>
        <div className="tv-mast-edition" style={{ fontSize:32, marginTop:22 }}>{editionLabel()}</div>
      </div>
    );
  }
  if (kind === "winner") {
    const model = resultPresentation(state, events, scene.active.eventId);
    const anchor = scene.stepKey === "standings" ? Number(scene.active.updatedAt) : Number(scene.active.startedAt);
    const phase = resultMomentPhase(anchor, now, { reducedMotion, step:scene.stepKey });
    return <ResultSequence state={state} model={model} phase={phase} directedStep={scene.stepKey} towers={towers} />;
  }
  return null;
}

function NextUpCard({ ev }) {
  const session = sessionLabel(ev);
  return (
    <div className="tv-pane tv-center">
      <div className="tv-label" style={{ marginBottom:18 }}>Next up</div>
      <GameMark id={ev.game} size={130} />
      <div className="tv-next-card">
        <div className="tv-next-band" style={{ background:phaseBand(ev) }} />
        <div className="tv-display tv-next-name">{ev.name}</div>
        <div className="tv-next-facts">{[session, payoutLine(ev)].filter(Boolean).join(" · ")}</div>
      </div>
      {ev.desc && <div className="tv-body" style={{ marginTop:22, maxWidth:1100 }}>{ev.desc}</div>}
    </div>
  );
}

/* ═════════════ the TV ═════════════ */
function TVMode({ standings, state, events, onDeckEv: onDeckInput, allTied, champion, coChamps, showControlEnabled,
  rankDeltas = {}, connection: connectionInput = {}, onExit, EventSpotlight, ceremony = null, now: nowOverride }) {
  const tickNow = useServerNow(nowOverride === undefined ? 1000 : 0);
  const now = nowOverride ?? tickNow;
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
  const operationLifecycle = operation.lifecycle;
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
  const openBook = mergeWagerLines(allW.filter(x => x.r.status === "pending")).slice(0, 9);
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
  const upNextDraw = activeBracketEv ? state.draws[activeBracketEv.id] : null;
  const liveContest = liveEv ? resolveCurrentContest(state, liveEv) : null;
  const advance = liveEv ? advanceMoment(state, liveEv, now) : null;
  const decided = liveEv && !liveContest ? decidedWinner(state, liveEv) : null;
  /* M14 and M18: what moves, fresh only, from the write's own server time */
  const bracketMotion = useBracketMotion(state, activeBracketEv, upNext ? [upNext.r, upNext.m] : null);
  const crown = useCrownMoment(state, showScene);
  const slotAdvance = !!advance && advance.kind === "match" && !!activeBracketEv;

  const resultMoment = resultMomentFor(state, events, now, sceneView, showScene);
  const resultModel = useMemo(() => resultMoment ? resultPresentation(state, events, resultMoment.eventId) : null,
    [state, events, resultMoment?.eventId]); // eslint-disable-line react-hooks/exhaustive-deps
  const correction = champion ? null : correctionMoment(state, events, now);
  /* A3: the room's sounds, on the same beats and server anchors */
  useRoomSound({ state, events, standings, allTied, liveEv, showScene, advance, bracketMotion, crown, now });

  /* the Desert Clock: the session's sky behind the masthead, the whole
     horizon behind the towers; winners' stars from Saturday night on. The
     phones' surfaces read the same weekendPhase. */
  const phase = weekendPhase(state, events, { liveEvent:liveEv, operationEvent:operationEv });
  const day = isDaySky(phase);
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

  const dock = final ? null : dockCard({ now, correction,
    lead:leadCard && !directed && !resultModel ? leadCard : null,
    holdUntil:leadCard ? advanceHoldUntil(state, liveEv, leadCard.at) : 0 });

  /* the update reload waits for a gap in what is actually on screen */
  const busy = tvBusy({ sceneView, resultMoment:resultModel, advance, intro:sceneIntroEv || ceremonyIntroEv,
    reveal:ceremonyReveal, dock });
  useEffect(() => {
    if (typeof window !== "undefined") window.__FD_CEREMONY__ = busy;
  }, [busy]);
  useEffect(() => () => { if (typeof window !== "undefined") window.__FD_CEREMONY__ = false; }, []);

  const board = useMemo(() => duelBoard(state), [state]);
  const ambient = useMemo(() => {
    const s = ["board"];
    if (final) return s;
    if (joinNeeded && qrUrl) s.push("join");
    if (nextEv) s.push("next");
    if (latest) s.push("latest");
    if (openBook.length) s.push("book");
    if (state.live && latest) s.push("progress");
    if (state.live) s.push("trophy");
    if (state.live && !allTied) s.push("race");
    if (board.recent.length) s.push("duels");
    if (Object.keys(state.profiles || {}).length) s.push("spotlight");
    return s;
  }, [final, joinNeeded, qrUrl, nextEv, latest, openBook.length, state.live, allTied, board.recent.length, state.profiles]);
  /* server time picks the card, so every TV in the house shows the same one;
     reduced motion still rotates, it just cuts instead of fading */
  const scene = ambient[ambientIndex(ambient.length, now)] || "board";

  const items = tickerItems({ state, events, standings, allTied, draftLive, liveCrew, latest, upNext, upNextDraw,
    onDeckEv, openWon:mergeWagerLines(allW.filter(x => x.r.status === "won")), nextEv, now });

  const showTicker = !final && !(directed && sceneView.ticker === false) && connection.mode !== "loading";
  const towers = {
    on:towersMode === "3d",
    height:1080 - 6 - 118 - (showTicker ? 74 : 0),
    pixelRatio:Math.min(1.5, Math.max(1, (typeof window === "undefined" ? 1 : window.devicePixelRatio || 1) * fit.scale)),
    reducedMotion,
  };

  let content, liveShown = false, bandTall = false;
  if (connection.mode === "loading") {
    content = <div className="tv-pane tv-center" role="status">
      <FDMark size={120} variant="night" />
      <div className="tv-display" style={{ fontSize:72, color:"var(--bone)", marginTop:24 }}>Connecting</div>
    </div>;
  } else if (directed) {
    const kind = showScene.active.kind;
    const winnerModel = kind === "winner" ? resultPresentation(state, events, showScene.active.eventId) : null;
    const winnerPhase = kind === "winner" ? resultMomentPhase(showScene.stepKey === "standings" ? Number(showScene.active.updatedAt)
      : Number(showScene.active.startedAt), now, { reducedMotion, step:showScene.stepKey }) : null;
    bandTall = towers.on && (kind === "standings"
      || (winnerPhase?.phase === "standings" && !!winnerModel && winnerModel.kind !== "stacks"));
    content = <DirectedScene state={state} events={events} scene={showScene} now={now}
      standings={standings} rankDeltas={rankDeltas} reducedMotion={reducedMotion} towers={towers} crown={crown} />;
  } else if (champion) {
    const view = championView(state, events, standings);
    content = view ? <ChampionMoment state={state} view={view} standings={standings} moment={crown} /> : null;
  } else if (resultModel) {
    const resultPhase = resultMomentPhase(resultMoment.anchor, now, { reducedMotion });
    bandTall = towers.on && resultPhase.phase === "standings" && resultModel.kind !== "stacks";
    content = <ResultSequence state={state} model={resultModel} phase={resultPhase} towers={towers} />;
  } else if (state.poker && !state.results[state.poker.id]) {
    content = <TVPoker state={state} standings={standings} now={now} />;
  } else if (draftLive) {
    content = <TVDraft state={state} ev={draftLive.ev} d={draftLive.d} />;
  } else if (liveEv) {
    liveShown = true;
    const inContest = liveContest && ["betting-open", "betting-locked", "in-progress", "awaiting-result"].includes(liveContest.phase);
    /* the lifecycle label belongs to the live event only, never another's */
    const label = onDeckEv?.id === liveEv.id ? "Betting open"
      : operationEv?.id === liveEv.id && operationLifecycle ? operationLifecycle.label : "Live";
    content = <>
      <div className="tv-pane" style={{ position:"relative" }}>
        <div className="tv-live-head">
          <GameMark id={liveEv.game} size={80} />
          <div>
            <div className="tv-label">{label}</div>
            <div className="tv-display tv-live-name">{liveEv.name}</div>
          </div>
        </div>
        {inContest ? <>
          <div className="tv-contest-slot">
          <ContestBoard state={state} events={events} ev={liveEv} contest={liveContest} />
          {slotAdvance && <AdvanceMoment state={state} moment={advance} slot />}
          </div>
          {activeBracketEv && <TVBracket state={state} ev={activeBracketEv} hot={upNext ? [upNext.r, upNext.m] : null}
            motion={bracketMotion} />}
          {!activeBracketEv && activeStageEv && <StageGroups state={state} ev={activeStageEv} />}
        </> : decided ? <DecidedWinner state={state} ev={liveEv} winner={decided} motion={bracketMotion} />
          : activeBracketEv ? <TVBracket state={state} ev={activeBracketEv} size="full"
            hot={upNext ? [upNext.r, upNext.m] : null} motion={bracketMotion} />
            : activeStageEv ? <StageGroups state={state} ev={activeStageEv} />
              : <div className="tv-card tv-center" style={{ flex:1, padding:36 }}>
                <GameMark id={liveEv.game} size={130} />
                <div className="tv-body" style={{ marginTop:20 }}>{payoutLine(liveEv)}</div>
              </div>}
        {advance && !slotAdvance && <AdvanceMoment state={state} moment={advance} />}
      </div>
      <Rail state={state} standings={standings} allTied={allTied} rankDeltas={rankDeltas} />
    </>;
  } else if (scene === "join") {
    content = <div className="tv-pane tv-center" style={{ flexDirection:"row", gap:110 }}>
      <div style={{ textAlign:"left" }}>
        <FDMark size={130} variant="night" />
        <div className="tv-display" style={{ fontSize:140, lineHeight:0.9, color:"var(--sun)", margin:"26px 0 10px" }}>Field<br />Day</div>
        <div className="tv-mast-edition" style={{ fontSize:28 }}>{editionLabel()}</div>
        <div className="tv-body" style={{ color:"var(--bone)", marginTop:22 }}>Scan to check in.</div>
      </div>
      <div className="tv-qr">
        <img src={qrUrl} alt="Scan to join" />
        <div className="tv-display" style={{ fontSize:28, color:"var(--ink0)", marginTop:10 }}>Player check-in</div>
      </div>
    </div>;
  } else if (scene === "next" && nextEv) {
    content = <NextUpCard ev={nextEv} />;
  } else if (scene === "latest" && latest) {
    const model = resultPresentation(state, events, latest.ev.id);
    content = model ? <ResultSequence state={state} model={model} phase={{ phase:"podium", revealed:3 }} /> : null;
  } else if (scene === "book") {
    /* every open pick with the stacks riding it, as on the live board */
    const picks = pickStacks(openBook.map(x => x.w), w => wagerPickLabel(state, w, events)).slice(0, 6);
    content = <div className="tv-pane tv-center">
      <div className="tv-label">Betting</div>
      <div className="tv-display" style={{ fontSize:64, color:"var(--bone)", marginBottom:24 }}>
        {openBook.length} open wager{openBook.length === 1 ? "" : "s"}</div>
      <div className="tv-book" style={{ gridTemplateColumns:picks.length > 3 ? "1fr 1fr" : "1fr" }}>
        {picks.map(pick => (
          <div key={pick.key} className="tv-book-pick">
            <div className="tv-book-id">
              <div className="tv-display tv-book-name">{pick.name}</div>
              <div className="tv-denoms">{pick.ctx}</div>
              <div className="tv-side-total">{fmt(pick.total)}</div>
            </div>
            <BetStacks stacks={pick.stacks} size={48} names={p => stackName(state, p)} tagSize={24} className="tv-stacks" />
          </div>
        ))}
      </div>
    </div>;
  } else if (scene === "trophy") {
    content = <TrophyCard state={state} events={events} />;
  } else if (scene === "progress") {
    content = <WeekendProgressCard state={state} events={events} />;
  } else if (scene === "race") {
    content = <StackRaceCard state={state} standings={standings} />;
  } else if (scene === "duels") {
    content = <DuelBoardCard state={state} />;
  } else if (scene === "spotlight") {
    const player = spotlightPlayer(state, now, TV_AMBIENT_MS * ambient.length);
    content = player ? <SpotlightCard state={state} events={events} standings={standings} player={player} />
      : <div className="tv-pane"><StandingsBoard state={state} standings={standings} allTied={allTied} rankDeltas={rankDeltas} /></div>;
  } else {
    const flat = <div className="tv-pane"><StandingsBoard state={state} standings={standings} allTied={allTied}
      rankDeltas={rankDeltas} /></div>;
    bandTall = towers.on;
    content = towers.on ? <TowersView state={state} rows={standingsTowerRows(standings)} rankDeltas={rankDeltas}
      height={towers.height} towers={towers} fallback={flat} /> : flat;
  }

  const dockNode = dock?.kind === "correction" ? <CorrectionCard state={state} correction={dock.correction} />
    : dock?.kind === "lead" ? <LeadChange state={state} leader={dock.lead.leader} previous={dock.lead.previous} /> : null;

  return (
    <div className="tv-stage fd-night">
      <div className={`tv-canvas${day ? " is-day" : ""}${bandTall ? " is-towers" : ""}`} data-tv-canvas data-phase={phase}
        data-towers={towers.on ? "3d" : towersFailure() || "2d"}
        style={{ left:fit.left, top:fit.top, transform:`scale(${fit.scale})` }}>
        <DesertBand phase={phase} variant={bandTall ? "full" : "strip"} width={1920} height={bandTall ? 118 + TOWER_TABLE : 118}
          stars={skyStars} starBox={STAR_BOX} className="tv-backdrop" />
        <Masthead state={state} onDeckEv={onDeckEv} connection={connection} lastUpdateAt={lastUpdateAt}
          showOnDeck={!final && !directed && !liveShown} final={final} dock={dockNode} day={day} />
        <main className="tv-main" style={connection.mode === "reconnecting" ? { opacity:0.72 } : undefined}>
          {content}
        </main>
        {showTicker && <Ticker state={state} items={items} reducedMotion={reducedMotion} now={now} />}
        {sceneIntroEv && <IntroOverlay state={state} ev={sceneIntroEv} EventSpotlight={EventSpotlight} reducedMotion={reducedMotion} />}
        {ceremonyIntroEv && <IntroOverlay key={ceremonyIntroEv.id} state={state} ev={ceremonyIntroEv} EventSpotlight={EventSpotlight}
          handoff={!!ceremony?.handoff} reducedMotion={reducedMotion} onDone={ceremony?.onIntroDone || null} />}
        {ceremonyReveal && <TVDrawReveal key={ceremonyReveal.id} state={state} events={events} reveal={ceremonyReveal}
          reducedMotion={reducedMotion} onDone={ceremony?.onRevealDone || null} />}
        <SoundUnlockChip />
      </div>
      <button type="button" className={`tv-exit${pointerActive ? "" : " is-idle"}`} onClick={onExit}
        aria-label="Exit TV mode">Exit TV</button>
    </div>
  );
}

/* local wall time of the last snapshot, for the reconnecting label */
function useLastUpdate(version) {
  const [at, setAt] = useState(null);
  useEffect(() => { if (version) setAt(Date.now()); }, [version]);
  return at;
}

export { TVMode };
