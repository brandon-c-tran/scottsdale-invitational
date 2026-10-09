import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChipFace } from "../identity/PlayerIdentity.jsx";
import { OneSafe } from "../../ui/OneSafe.jsx";
import { serverNow } from "../../lib/serverClock.js";
import { SAGUAROS } from "../tv/desertModel.js";
import { Takeover } from "../tv/TVTakeover.jsx";
import { GAG_TIMING, TURKEY_FOLLOWERS, gagAt, gagPlan, nextGagEdge } from "./gagModel.js";
import "./gags.css";

/* The gags on the TV (features/gags, gagModel.js): one full-canvas
   takeover at a time, drawn on the session's painting itself (the board
   and the chrome step out while it plays, so the desert floor is the
   stage). Everything runs on the server clock from the gag's own start:
   --tl is minus the ms already gone when this TV joined, so
   calc(var(--tl) + 700ms) is "700 ms in", and each beat arrives from
   GAG_TIMING as a custom property. Every element's resting style is its
   hero frame, so reduced motion and a TV that joins late show a still.
   Transforms and opacity only; the lettering is a fact and a name. */

const fmt = n => (Number(n) || 0).toLocaleString("en-US");
const ms = n => `${Math.round(Number(n) || 0)}ms`;

/* ── which gag, when ── */

/* The gag whose window holds now on this TV (the newest write's, or a QA
   test), woken exactly at each window's edges rather than on the TV's
   one-second tick. `now` holds an instant (a rehearsal, the fit audit). */
export function useGagWindow(state, events, { now: nowOverride } = {}) {
  const plan = useMemo(() => gagPlan(state, events), [state, events]);
  const now = nowOverride ?? serverNow();
  const edge = nowOverride === undefined ? nextGagEdge(plan, now) : null;
  const [, wake] = useState(0);
  useEffect(() => {
    if (!edge) return undefined;
    const timer = setTimeout(() => wake(n => n + 1), Math.max(0, edge - serverNow()) + 20);
    return () => clearTimeout(timer);
  }, [edge]);
  const gag = gagAt(plan, now);
  return { plan, gag:gag ? { ...gag, elapsed:Math.max(0, now - gag.start) } : null };
}

/* Whether this TV plays the gag in its window: decided as the window first
   opens here, so a gag another takeover is holding the room for is
   skipped for good (never queued), and given up if one takes the room
   while it plays. */
export function useGagShown(gag, { blocked = false } = {}) {
  const verdict = useRef({ id:null, play:false });
  if (gag && verdict.current.id !== gag.id) verdict.current = { id:gag.id, play:!blocked };
  if (gag && blocked) verdict.current.play = false;
  return gag && verdict.current.play ? gag : null;
}

/* the ms already gone at a gag's start when this TV first drew it, fixed
   per gag so the CSS delays never restart on a re-render */
function useJoined(id, elapsed) {
  const ref = useRef({ id:null, elapsed:0 });
  if (ref.current.id !== id) ref.current = { id, elapsed:Math.max(0, Math.round(Number(elapsed) || 0)) };
  return ref.current.elapsed;
}

/* a name on one line in its column: Big Shoulders 900 runs about .52em a
   letter */
export const gagNameSize = (text, width, { max = 130, min = 56 } = {}) =>
  Math.max(min, Math.min(max, Math.floor(width / (Math.max(4, String(text || "").length) * 0.52))));

/* ── the takeover ── */

/* the board steps out while a gag holds the room, on the gag's own clock
   (gags.css .tv-main under data-moment~="gag"): its start and length ride
   the canvas, set before the first paint and cleared with the gag */
const useLayout = typeof window === "undefined" ? useEffect : useLayoutEffect;
function useCanvasClock(ref, gag, joined) {
  useLayout(() => {
    const canvas = ref.current?.closest?.("[data-tv-canvas]");
    if (!canvas || !gag) return undefined;
    canvas.style.setProperty("--gag-tl", `${-joined}ms`);
    canvas.style.setProperty("--gag-ms", ms(gag.ms));
    return () => { canvas.style.removeProperty("--gag-tl"); canvas.style.removeProperty("--gag-ms"); };
  }, [gag?.id]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function TVGag({ state, gag, lamp = "var(--sun)" }) {
  const joined = useJoined(gag?.id, gag?.elapsed);
  const anchor = useRef(null);
  useCanvasClock(anchor, gag, joined);
  if (!gag) return null;
  const T = GAG_TIMING[gag.kind];
  const beats = Object.fromEntries(Object.entries(T).filter(([, value]) => typeof value === "number")
    .map(([name, value]) => [`--g-${name}`, ms(value)]));
  (T.x || []).forEach((value, i) => { beats[`--g-x${i}`] = ms(value); });
  const label = gag.kind === "turkey" ? `${gag.count} in a row: ${gag.name}`
    : gag.kind === "strike" ? `Upset: ${gag.name}`
      : gag.kind === "gutter" ? `${gag.name}, -${fmt(gag.amount)}`
        : `${gag.name}, ${gag.place}`;
  return (
    <Takeover kind="gag" className={`tv-gag is-${gag.kind}`} label={label}
      style={{ "--tl":`${-joined}ms`, "--gag-ms":ms(gag.ms), "--gag-lamp":lamp, ...beats }}>
      <span ref={anchor} hidden />
      {gag.kind === "turkey" && <TurkeyGag gag={gag} />}
      {gag.kind === "strike" && <StrikeGag gag={gag} />}
      {gag.kind === "gutter" && <GutterGag gag={gag} />}
      {gag.kind === "vultures" && <VulturesGag gag={gag} />}
    </Takeover>
  );
}

/* lettering painted on the art: bone on a heavy ink keyline, lit from
   behind in the gag's lamp, stamped in on its beat */
function Letter({ className = "", beat, style, children }) {
  return <div className={`tv-gag-letter fd-show ${className}`} style={{ "--beat":`var(--g-${beat})`, ...style }}>{children}</div>;
}

/* ── turkey: a player's third straight win ──
   A cartoon turkey struts in along the desert floor and fans its tail: the
   fan is the player's own chips, the head their photo chip with a beak and
   a wattle. Three strike marks stamp in over it, a beat apart, then the
   count and the name. A whole side on the run: the lead struts ahead, up
   to three smaller turkeys trail it, then "+N". */
/* the tail fans up and back from behind the body; the head stands forward
   of it on the neck, clear of every tail chip */
const TURKEY = Object.freeze({ w:600, h:560, fanX:212, fanY:322, reach:234, from:-182, to:-80, feathers:7, chip:104,
  headX:484, headY:146, head:164 });
const FAN_ANGLES = Array.from({ length:TURKEY.feathers },
  (_, i) => TURKEY.from + i * (TURKEY.to - TURKEY.from) / (TURKEY.feathers - 1));
/* where the flock stands: the lead's centre, and its followers trailing
   to its left (the first `gap` behind it, then a `step` apart), each drawn
   over the one ahead so every head shows, the last still on the canvas */
const FLOCK = Object.freeze({ lead:660, floor:932, gap:253, step:120, follower:0.42 });

function Feather({ player, angle, index, scale }) {
  const chip = Math.round(TURKEY.chip * scale);
  return (
    <span className="tv-gag-feather" style={{ "--a":`${Math.round(angle + 90)}deg`, "--i":index }}>
      <svg className="tv-gag-quill" viewBox="-44 -252 88 252" width={88 * scale} height={252 * scale}
        style={{ left:-44 * scale, top:-252 * scale }} aria-hidden="true">
        <path className={index % 2 ? "is-b" : "is-a"} d="M-9 0C-40-118-46-182-40-214A40 40 0 0 1 40-214C46-182 40-118 9 0Z" />
        <path className="tv-gag-quill-band" d="M-42-196C-30-176 30-176 42-196" />
        <path className="tv-gag-quill-rib" d="M0-8V-190" />
      </svg>
      <span className="tv-gag-fan-chip" style={{ top:-TURKEY.reach * scale, width:chip, height:chip, marginLeft:-chip / 2,
        marginTop:-chip / 2 }}><ChipFace p={player} size={chip} stamp="" flat /></span>
    </span>
  );
}

function Turkey({ player, scale = 1, className = "", style }) {
  const head = Math.round(TURKEY.head * scale);
  /* the beak and the wattle are drawn for a 150px head */
  const bill = head / 150;
  return (
    <div className={`tv-gag-turkey${className ? ` ${className}` : ""}`} data-fit="bleed"
      style={{ width:TURKEY.w * scale, height:TURKEY.h * scale, ...style }}>
      <div className="tv-gag-strut">
        <div className="tv-gag-fan" style={{ left:TURKEY.fanX * scale, top:TURKEY.fanY * scale }}>
          {FAN_ANGLES.map((angle, i) => <Feather key={i} player={player} angle={angle} index={i} scale={scale} />)}
        </div>
        <svg className="tv-gag-bird" viewBox={`0 0 ${TURKEY.w} ${TURKEY.h}`} width={TURKEY.w * scale} height={TURKEY.h * scale}
          aria-hidden="true">
          <g className="tv-gag-leg is-back">
            <path className="tv-gag-limb-ink" d="M266 472L258 546M258 546L292 556M258 546L276 562M258 546L232 554" />
            <path className="tv-gag-limb" d="M266 472L258 546M258 546L292 556M258 546L276 562M258 546L232 554" />
          </g>
          <path className="tv-gag-neck-ink" d="M388 324C432 268 430 236 470 196" />
          <path className="tv-gag-neck" d="M388 324C432 268 430 236 470 196" />
          <ellipse className="tv-gag-body" cx="296" cy="372" rx="168" ry="130" />
          <path className="tv-gag-breast" d="M378 262C468 282 492 404 428 472C408 492 368 482 372 440C376 378 350 300 378 262Z" />
          <path className="tv-gag-scallop" d="M168 338q21 24 42 0q21 24 42 0q21 24 42 0q21 24 42 0M150 382q21 24 42 0q21 24 42 0q21 24 42 0q21 24 42 0q21 24 42 0M170 428q21 24 42 0q21 24 42 0q21 24 42 0q21 24 42 0" />
          <path className="tv-gag-wing" d="M204 318C250 282 360 290 398 350C418 384 392 428 336 432C296 434 262 420 240 396L216 412L224 384L198 392L212 362L186 360Z" />
          <path className="tv-gag-wing-line" d="M246 340C292 322 344 330 372 360M256 372C292 358 334 364 360 390" />
          <ellipse className="tv-gag-sheen" cx="240" cy="296" rx="70" ry="26" />
          <g className="tv-gag-leg is-front">
            <path className="tv-gag-limb-ink" d="M330 474L336 548M336 548L372 556M336 548L354 564M336 548L308 556" />
            <path className="tv-gag-limb" d="M330 474L336 548M336 548L372 556M336 548L354 564M336 548L308 556" />
          </g>
        </svg>
        <div className="tv-gag-head" style={{ left:TURKEY.headX * scale - head / 2, top:TURKEY.headY * scale - head / 2,
          width:head, height:head }}>
          {/* a gobble bobs the head, twice; each on its own layer so neither holds the other still */}
          <div className="tv-gag-head-in">
            <span className="tv-gag-face"><ChipFace p={player} size={head} flat /></span>
            <svg className="tv-gag-beak" viewBox="0 0 230 210" width={230 * bill} height={210 * bill} aria-hidden="true">
              <path className="tv-gag-wattle" d="M144 98C170 110 178 146 160 178C152 192 134 186 138 166C142 144 134 120 136 102Z" />
              <path className="tv-gag-bill" d="M138 60L208 80L138 102C146 88 146 74 138 60Z" />
              <path className="tv-gag-bill-line" d="M146 81L196 80" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

/* a bowling sheet's strike mark: an X in its box, lit when it stamps */
function StrikeMark({ index }) {
  return (
    <span className="tv-gag-mark" style={{ "--beat":`var(--g-x${index})` }} aria-hidden="true">
      <svg viewBox="0 0 150 150" width="150" height="150">
        <path className="tv-gag-mark-ink" d="M38 38L112 112M112 38L38 112" />
        <path className="tv-gag-mark-x" d="M38 38L112 112M112 38L38 112" />
      </svg>
    </span>
  );
}

/* the count and the name stand right of the lead's beak */
const TURKEY_WORDS = 1050;
function TurkeyGag({ gag }) {
  const [lead, ...followers] = gag.players;
  const words = 1856 - TURKEY_WORDS;
  return <>
    <div className="tv-gag-flock">
      <Turkey player={lead} className="is-lead" style={{ left:FLOCK.lead - TURKEY.w / 2, top:FLOCK.floor - TURKEY.h }} />
      {followers.slice(0, TURKEY_FOLLOWERS).map((player, i) => {
        const x = FLOCK.lead - FLOCK.gap - i * FLOCK.step;
        return <Turkey key={player} player={player} scale={FLOCK.follower} className="is-follower"
          style={{ left:x - (TURKEY.w * FLOCK.follower) / 2, top:FLOCK.floor - TURKEY.h * FLOCK.follower, "--i":i + 1 }} />;
      })}
    </div>
    {gag.more > 0 && <span className="tv-gag-more fd-show" style={{ "--beat":"var(--g-count)" }}>{`+${gag.more}`}</span>}
    <div className="tv-gag-marks" style={{ left:FLOCK.lead - 245 }}>{[0, 1, 2].map(i => <StrikeMark key={i} index={i} />)}</div>
    <div className="tv-gag-words is-turkey" style={{ left:TURKEY_WORDS }}>
      <Letter className="tv-gag-big" beat="count"><OneSafe text={`${gag.count} IN A ROW`} /></Letter>
      <Letter className="tv-gag-name" beat="name" style={{ fontSize:gagNameSize(gag.name, words, { max:124 }) }}>
        {gag.name}</Letter>
    </div>
  </>;
}

/* ── the lane: strike and gutter ──
   A bowling lane laid along the desert floor, seen from its side and a
   little above: the far gutter, the boards with their arrows, the near
   gutter and its lip, the pin deck under a dark masking panel. */
const LANE = Object.freeze({ far:818, top:834, bottom:930, gutter:956, face:990, deck:1380, end:1920 });
/* ten pins in their triangle down the deck: rows run away from the
   bowler (to the right), each row's pins across the lane's width (nearer
   pins lower on the canvas, drawn later and a little larger) */
const PINS = Object.freeze([0, 1, 2, 3].flatMap(row => Array.from({ length:row + 1 }, (_, k) => ({
  row, k, x:1500 + row * 64, y:882 + (k - row / 2) * 24,
}))).sort((a, b) => a.y - b.y || b.x - a.x));
/* How each pin leaves when the ball comes through, in PINS order (px, deg,
   ms): [across, the arc's top, where it lands (or leaves the frame), its
   spin, how long]. The headpin (index 5, the first beaten chip on it)
   hops back up the lane, under the lettering; most land lying down round
   the ball (a turn of 90 or 270), the rest leave the frame. */
const PIN_FLIGHT = Object.freeze([
  [520, -420, 300, 640, 900], [180, -300, 30, 450, 820], [460, -620, -200, 900, 960], [-260, -340, 34, -450, 840],
  [120, -240, 30, 270, 780], [-600, -240, 40, -810, 1000], [380, -200, 140, 500, 880], [-140, -340, 40, -270, 860],
  [60, -500, 28, 810, 900], [200, -160, 270, 420, 820],
]);

function Lane() {
  return (
    <svg className="tv-gag-lane" viewBox="0 0 1920 1080" width="1920" height="1080" data-fit="bleed" aria-hidden="true">
      <rect className="tv-gag-gutter-far" x="-20" y={LANE.far} width="1960" height={LANE.top - LANE.far} />
      <rect className="tv-gag-boards" x="-20" y={LANE.top} width="1960" height={LANE.bottom - LANE.top} />
      <path className="tv-gag-boards-alt" d="M-20 846H1940V858H-20ZM-20 870H1940V882H-20ZM-20 894H1940V906H-20ZM-20 918H1940V930H-20Z" />
      <rect className="tv-gag-deck" x={LANE.deck} y={LANE.top} width={LANE.end - LANE.deck} height={LANE.bottom - LANE.top} />
      <path className="tv-gag-board-line" d="M-20 846H1940M-20 858H1940M-20 870H1940M-20 882H1940M-20 894H1940M-20 906H1940M-20 918H1940" />
      <rect className="tv-gag-gloss" x="-20" y={LANE.top + 2} width="1960" height="9" />
      <path className="tv-gag-dots" d="M320 846h8M320 870h8M320 894h8M320 918h8" />
      <path className="tv-gag-foul" d="M182 834V930" />
      <path className="tv-gag-arrows" d="M600 841l26 5-26 5zM648 857l26 5-26 5zM696 873l26 5-26 5zM648 889l26 5-26 5zM600 905l26 5-26 5z" />
      <rect className="tv-gag-gutter-near" x="-20" y={LANE.bottom} width="1960" height={LANE.gutter - LANE.bottom} />
      <rect className="tv-gag-face" x="-20" y={LANE.gutter} width="1960" height={LANE.face - LANE.gutter} />
    </svg>
  );
}
/* the near gutter's lip, drawn in front of a ball that has dropped into it */
const GutterLip = () => (
  <svg className="tv-gag-lip" viewBox="0 0 1920 1080" width="1920" height="1080" data-fit="bleed" aria-hidden="true">
    <rect x="-20" y={LANE.gutter - 12} width="1960" height="12" />
    <rect className="tv-gag-lip-light" x="-20" y={LANE.gutter - 12} width="1960" height="3" />
    <rect className="tv-gag-face" x="-20" y={LANE.gutter} width="1960" height={LANE.face - LANE.gutter} />
  </svg>
);

/* one pin: the classic profile in bone, two neck stripes, its shade, and
   a beaten player's chip on its belly when it carries one */
const PIN_PATH = "M-17 0C-25-14-29-36-27-54C-25-74-15-88-11-102C-9-110-10-116-13-124C-16-134-12-150 0-150"
  + "C12-150 16-134 13-124C10-116 9-110 11-102C15-88 25-74 27-54C29-36 25-14 17 0Z";
function Pin({ pin, index, player = null, scale = 1, flight = null }) {
  const clip = `tv-gag-pin-${useId().replace(/:/g, "")}`;
  const [fx, fy, fall, fr, dur] = flight || [0, 0, 0, 0, 900];
  const w = 64 * scale, h = 160 * scale;
  return (
    <div className="tv-gag-pin" style={{ left:pin.x - w / 2, top:pin.y - h + 4, width:w, height:h, "--fx":`${fx}px`,
      "--fy":`${fy}px`, "--fr":`${fr}deg`, "--fall":`${fall}px`, "--fdur":`${dur}ms`, "--d":`${(index % 4) * 28}ms` }}>
      <div className="tv-gag-pin-up">
        <div className="tv-gag-pin-spin">
          <svg viewBox="-32 -156 64 160" width={w} height={h} aria-hidden="true">
            <defs><clipPath id={clip}><path d={PIN_PATH} /></clipPath></defs>
            <path className="tv-gag-pin-body" d={PIN_PATH} />
            <g clipPath={`url(#${clip})`}>
              <path className="tv-gag-pin-shade" d="M8-152C26-130 34-60 22 4H40V-152Z" />
              <path className="tv-gag-pin-stripe" d="M-20-114H20M-20-103H20" />
            </g>
            <path className="tv-gag-pin-line" d={PIN_PATH} />
          </svg>
          {player && <span className="tv-gag-pin-chip"><ChipFace p={player} size={Math.round(56 * scale)} flat /></span>}
        </div>
      </div>
    </div>
  );
}

/* the nearest pin of each row, front row first: where the beaten side's
   chips go, as many as fit */
const CHIP_PINS = [3, 2, 1, 0].map(row => PINS.filter(pin => pin.row === row).sort((a, b) => b.y - a.y)[0])
  .sort((a, b) => a.x - b.x);
function PinDeck({ beaten = [], flying = false }) {
  const carriers = new Map(CHIP_PINS.slice(0, beaten.length).map((pin, i) => [pin, beaten[i]]));
  return <div className={`tv-gag-pins${flying ? " is-flying" : ""}`}>
    {PINS.map((pin, i) => <Pin key={`${pin.row}:${pin.k}`} pin={pin} index={i} player={carriers.get(pin) || null}
      scale={0.94 + (pin.y - 846) / 600} flight={flying ? PIN_FLIGHT[i] : null} />)}
  </div>;
}

/* a ball: one player's chip rolling, or a side's chips set in a dark ball */
function Ball({ players = [], size = 200 }) {
  if (players.length <= 1) return <span className="tv-gag-ball-face"><ChipFace p={players[0]} size={size} flat /></span>;
  const set = players.slice(0, 3);
  const chip = Math.round(size * (set.length === 2 ? 0.46 : 0.42));
  const spots = set.length === 2 ? [[-0.24, 0], [0.24, 0]] : [[0, -0.25], [-0.23, 0.15], [0.23, 0.15]];
  return (
    <span className="tv-gag-ball-team" style={{ width:size, height:size }}>
      {set.map((player, i) => <span key={player} className="tv-gag-ball-chip" style={{ left:size / 2 + spots[i][0] * size - chip / 2,
        top:size / 2 + spots[i][1] * size - chip / 2 }}><ChipFace p={player} size={chip} flat /></span>)}
    </span>
  );
}

/* ── strike: an upset ──
   The lane runs along the floor; the winning side rolls in as the ball and
   takes all ten pins (the beaten side's chips riding the front ones) in
   cartoon arcs. UPSET lights in the money's amber, then the name. */
const STRIKE = Object.freeze({ ball:200, rest:1620, impact:1440, y:888, burstX:1600, burstY:740 });
/* the crash: a cartoon burst behind the rack as the ball meets the headpin,
   its points standing over the pins' heads */
const BURST = Array.from({ length:24 }, (_, i) => {
  const r = i % 2 ? 62 : 150 - (i % 4) * 14, a = (i / 24) * Math.PI * 2;
  return `${Math.round(Math.cos(a) * r)},${Math.round(Math.sin(a) * r * 0.8)}`;
}).join(" ");
function StrikeGag({ gag }) {
  return <>
    <Lane />
    <svg className="tv-gag-pow" viewBox="-160 -130 320 260" width="440" height="358" data-fit="bleed" aria-hidden="true"
      style={{ left:STRIKE.burstX - 220, top:STRIKE.burstY - 179 }}>
      <polygon className="tv-gag-pow-out" points={BURST} />
      <polygon className="tv-gag-pow-in" points={BURST} transform="scale(.62)" />
    </svg>
    <PinDeck beaten={gag.beaten || []} flying />
    <div className="tv-gag-ball is-strike" style={{ left:STRIKE.rest - STRIKE.ball / 2, top:STRIKE.y - STRIKE.ball,
      width:STRIKE.ball, height:STRIKE.ball, "--to-impact":`${STRIKE.impact - STRIKE.rest}px`, "--from":`${-200 - STRIKE.rest}px` }}>
      <div className="tv-gag-ball-in"><div className="tv-gag-ball-plow"><div className="tv-gag-ball-spin"><div className="tv-gag-ball-spin2">
        <Ball players={gag.players} size={STRIKE.ball} />
      </div></div></div></div>
    </div>
    <div className="tv-gag-words is-center">
      <Letter className="tv-gag-upset" beat="word">UPSET</Letter>
      <Letter className="tv-gag-name" beat="name" style={{ fontSize:gagNameSize(gag.name, 1500, { max:120 }) }}>{gag.name}</Letter>
    </div>
  </>;
}

/* ── gutter: one bettor's big loss ──
   The bettor's chip rolls down the lane, wobbles, drops into the near
   gutter and rolls off the end past ten standing pins. The amount in the
   loss's clay, then the name. */
/* `y` is where the ball's foot rests once it has dropped, its lower fifth
   behind the near gutter's lip and its ink ring clear of the face's foot
   (gags.css lifts it onto the boards until the drop) */
const GUTTER = Object.freeze({ ball:190, x:1240, y:LANE.face - 8 });
function GutterGag({ gag }) {
  return <>
    <Lane />
    <PinDeck />
    <div className="tv-gag-ball is-gutter" style={{ left:GUTTER.x - GUTTER.ball / 2, top:GUTTER.y - GUTTER.ball,
      width:GUTTER.ball, height:GUTTER.ball }}>
      <div className="tv-gag-gx1"><div className="tv-gag-gx2"><div className="tv-gag-gx3">
        <div className="tv-gag-gy1"><div className="tv-gag-gy2">
          <div className="tv-gag-wobble"><div className="tv-gag-gspin1"><div className="tv-gag-gspin2">
            <Ball players={gag.players} size={GUTTER.ball} />
          </div></div></div>
        </div></div>
      </div></div></div>
    </div>
    <GutterLip />
    <div className="tv-gag-words is-center">
      <Letter className="tv-gag-amount" beat="amount">{`-${fmt(gag.amount)}`}</Letter>
      <Letter className="tv-gag-name" beat="name" style={{ fontSize:gagNameSize(gag.name, 1500, { max:120 }) }}>{gag.name}</Letter>
    </div>
  </>;
}

/* ── vultures: a new last place ──
   The player's chip stands on the desert floor between two saguaros while
   a tumbleweed blows through; three vultures circle over it, then flap
   off. The place in the loss's clay, then the name. */
const PERCH = Object.freeze({ x:1240, floor:936, chip:236, orbitY:340 });
function Saguaro({ x, scale, shape = 0 }) {
  return (
    <svg className="tv-gag-saguaro" viewBox="-70 -210 140 214" width={140 * scale} height={214 * scale}
      style={{ left:x - 70 * scale, top:PERCH.floor - 210 * scale }} data-fit="bleed" aria-hidden="true">
      <path className="tv-gag-cactus" d={SAGUAROS[shape].d} />
      <path className="tv-gag-cactus-rib" d="M-4-6V-176M6-6V-170M-36-84V-116M34-114V-146" />
    </svg>
  );
}
/* a vulture, wings up, facing right: a bald head with a googly eye on a
   white ruff */
function Vulture({ index }) {
  return (
    <div className="tv-gag-vulture" style={{ "--v":index }}>
      <div className="tv-gag-v-in"><div className="tv-gag-v-out"><div className="tv-gag-v-orbit"><div className="tv-gag-v-body">
        <svg viewBox="-150 -140 300 200" width="330" height="220" aria-hidden="true">
          {/* both wings sweep up and back from the shoulders, fingered at the tips, clear of the head */}
          <g className="tv-gag-v-wing is-far">
            <path d="M-8-18C-22-54-44-78-72-94L-96-114L-92-96L-116-102L-108-86L-130-86L-118-72L-138-66C-108-40-76-22-44-4Z" />
          </g>
          <path className="tv-gag-v-tail" d="M-48 6L-104 30L-96 14L-110 8L-94-2L-54-10Z" />
          <ellipse className="tv-gag-v-torso" cx="-8" cy="0" rx="56" ry="32" />
          <path className="tv-gag-v-belly" d="M-40 16C-14 30 22 28 40 12" />
          <path className="tv-gag-v-neck" d="M44-12C60-30 70-46 88-52" />
          <path className="tv-gag-v-ruff" d="M26-24C34-38 48-36 54-28C64-34 74-22 68-12C76-4 68 8 58 6C52 16 38 14 32 6C20 6 18-12 26-24Z" />
          <circle className="tv-gag-v-head" cx="96" cy="-56" r="22" />
          <path className="tv-gag-v-beak" d="M114-64C134-64 142-50 132-36C128-44 120-46 112-44Z" />
          <circle className="tv-gag-v-eye" cx="99" cy="-62" r="11" />
          <circle className="tv-gag-v-pupil" cx="103" cy="-60" r="5" />
          <g className="tv-gag-v-wing is-near">
            <path d="M12-14C2-52-16-80-40-100L-60-126L-58-108L-82-120L-76-102L-100-106L-90-90L-112-88C-88-52-60-24-24 4Z" />
            <path className="tv-gag-v-quill" d="M-6-22C-18-48-32-68-50-84M-22-10C-40-34-58-52-80-66" />
          </g>
        </svg>
      </div></div></div></div>
    </div>
  );
}
function Tumbleweed() {
  return (
    <div className="tv-gag-tumble" aria-hidden="true"><div className="tv-gag-tumble-hop"><div className="tv-gag-tumble-spin">
      <svg viewBox="-50 -50 100 100" width="104" height="104">
        <path d="M-38 6C-34-30 10-46 36-18C52 4 30 40-4 38C-34 36-46 10-30-10C-14-30 26-26 30 4C32 26 6 32-10 22C-26 12-14-8 4-6M-20-36C0-20-6 20 20 34M-42-8C-12 0 18-14 40 0M-14 40C-6 10 12-6 28-34" />
      </svg>
    </div></div></div>
  );
}
function VulturesGag({ gag }) {
  return <>
    <Tumbleweed />
    <Saguaro x={PERCH.x - 300} scale={1.6} shape={1} />
    <Saguaro x={PERCH.x + 300} scale={1.25} shape={0} />
    <span className="tv-gag-perch-shadow" style={{ left:PERCH.x - 150, top:PERCH.floor - 14 }} aria-hidden="true" />
    <span className="tv-gag-perch" style={{ left:PERCH.x - PERCH.chip / 2, top:PERCH.floor - PERCH.chip }}>
      <span className="tv-gag-perch-shake"><ChipFace p={gag.players[0]} size={PERCH.chip} flat /></span>
    </span>
    <div className="tv-gag-orbit" style={{ left:PERCH.x, top:PERCH.orbitY }}>
      {[0, 1, 2].map(i => <Vulture key={i} index={i} />)}
    </div>
    <div className="tv-gag-words is-left">
      <Letter className="tv-gag-place" beat="place">{gag.place}</Letter>
      <Letter className="tv-gag-name" beat="name" style={{ fontSize:gagNameSize(gag.name, 760, { max:124 }) }}>{gag.name}</Letter>
    </div>
  </>;
}
