import React, { memo, useEffect, useState } from "react";
import { disp } from "../../../shared/core.js";
import { Avatar, ChipFace } from "../identity/PlayerIdentity.jsx";
import { usePlayerIdentity } from "../identity/PlayerIdentityContext.js";
import { floodPlate } from "../identity/chipInk.js";
import { LampChase, ScoreReel } from "../../ui/ScoreReel.jsx";
import { GameMark } from "../../ui/GameMark.jsx";
import { CrownCup } from "../weekend/Trophy.jsx";
import { DesertBand } from "./DesertBand.jsx";
import { fmt, sideNameFit } from "./tvModel.js";
import { CROWN_TIMING as C, crownOutAt, useTimeline } from "./tvMotion.js";
import { Takeover } from "./TVTakeover.jsx";

/* The champion, full frame, in their own identity color the way their
   player card wears it, read from the couch in one glance: who (their chip
   and their name, the hero), the final stack (one number), and how they
   won it (a medal per podium finish: the event's mark and the place). The
   night painting with the weekend's cup holds the left. Every event's winner is
   the trophy's own turn in the frozen rotation (results/classPhoto.js),
   not a list here. A tie stays on night.

   When the crown is fresh it is the produced crown (Backglass, about 23s,
   CROWN_TIMING): the chrome leaves and night falls on the art, thirteen
   towers stand in final order unlit (steel chips, an empty socket for the
   face, no name, no number), then they light one by one from last place up
   to 3rd, each in its player's color with its face, name, final stack and
   place stamped on its beat, so the countdown is what reveals the board;
   the last two hold unlit, 2nd lights, the champion's tower lights as it
   rises and cascades, their
   color floods out from it, the name lands, the lamps chase in their color
   and the constellation joins. Every TV plays it from the same server
   instant; a reload shows the frame (and the frozen TV then takes turns
   with the class photo and the trophy).

   Cheap to draw on a TV's small GPU: a tower is one SVG (a pattern of
   chips, not an element per chip), going dark is an overlay's opacity
   (never a filter), the flood is a small disc scaled up, and only the
   counting number re-renders while it counts. */

/* the hall, in canvas pixels */
export const HALL = Object.freeze({ left:110, right:1810, floor:860, chipH:12, chipGap:2, maxChips:34, face:84, chipW:92 });
const FLOOD_R = 2300;
/* the flood's disc is drawn this big and scaled to FLOOD_R */
const FLOOD_DISC = 160;
/* the night painting on the flood: the left of the canvas, full height */
const CHAMP_SKY = Object.freeze({ width:800, height:1080 });
/* the frame's room beside the painting: the canvas less the painting, the
   frame's padding and the safe area */
const BODY_W = 1920 - 56 - 744 - 56 - 64 - 8;
const CHIP = Object.freeze({ one:200, many:150 });
const MEDAL = Object.freeze({ mark:76, gap:20, max:6, named:140 });

/* Each tower's place in the hall: centre x, chips, top y, and when it
   goes dark (or rises, for a champion). Pure, so the room's sounds pan to
   the same towers (roomSound crownCues). */
export function crownHall(standings = [], champions = []) {
  const n = standings.length;
  const lead = new Set(champions);
  const top = Math.max(1, ...standings.map(row => Number(row.pts) || 0));
  const colW = n ? (HALL.right - HALL.left) / n : 0;
  return standings.map((row, index) => {
    const chips = Math.max(1, Math.round(HALL.maxChips * Math.max(0, Number(row.pts) || 0) / top));
    const height = chips * (HALL.chipH + HALL.chipGap);
    const champ = lead.has(row.player);
    return { player:row.player, pts:row.pts, rank:row.rank, index, champ, chips,
      x:Math.round(HALL.left + colW * (index + 0.5)), top:HALL.floor - height,
      outAt:champ ? null : crownOutAt(Math.max(index, champions.length), n) };
  });
}
const ordinal = n => {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

/* the champion's name: one line as large as the room allows, else two at
   the space, never cut (solid Big Shoulders 900 runs about half an em a letter) */
export function championNameFit(title, width = BODY_W - CHIP.one - 36) {
  const fit = sideNameFit(title, width / 1.08, { max:150, min:96 });
  return fit.lines.length > 1 ? { ...fit, size:Math.min(fit.size, 108) } : fit;
}

/* the medals in rows by count: up to eight a row, the event under each
   while the medal is wide enough to name it */
export function medalLayout(count, width = BODY_W) {
  const n = Math.max(1, count);
  const rows = Math.ceil(n / MEDAL.max);
  const perRow = Math.ceil(n / rows);
  const tile = Math.min(150, Math.floor((width - (perRow - 1) * MEDAL.gap) / perRow));
  return { rows, perRow, tile, named:tile >= MEDAL.named };
}


export function ChampionMoment({ state, events = [], view, standings = [], moment = null }) {
  const lead = view.players[0];
  const identity = usePlayerIdentity(lead);
  /* the flood is their color lit (floodPlate): the same hue, never a dull field */
  const plate = view.tied ? null : floodPlate(identity.color);
  const color = plate ? plate.color : null;
  const ink = plate ? (plate.dark ? "var(--ink0)" : "var(--bone)") : "var(--bone)";
  const inkClass = ink === "var(--ink0)" ? "is-ink-dark" : "is-ink-bone";
  const timeline = useTimeline(moment?.id || null, moment?.anchor, C.total);
  const playing = timeline.playing && !!moment;
  const [flooded, setFlooded] = useState(!playing);
  useEffect(() => {
    if (!playing) { setFlooded(true); return undefined; }
    setFlooded(false);
    const t = setTimeout(() => setFlooded(true), Math.max(0, C.flood + C.floodMs * 0.3 - timeline.elapsed));
    return () => clearTimeout(t);
  }, [playing, moment?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const names = view.players.map(p => disp(state, p));
  const title = names.join(" & ");
  /* the champion's chip carries their photo: one coin, no second portrait */
  const chipSize = view.players.length > 1 ? CHIP.many : CHIP.one;
  const nameFit = championNameFit(title, BODY_W - (view.players.length > 1 ? 0 : chipSize + 36));
  const hall = playing ? crownHall(standings, view.players) : [];
  const origin = hall.find(tower => tower.champ) || { x:960, top:540 };
  const beats = {
    "--c-night":`${C.night}ms`, "--c-night-ms":`${C.nightMs}ms`, "--c-title":`${C.title}ms`, "--c-towers":`${C.towers}ms`,
    "--c-hold2":`${C.holdTwo}ms`, "--c-rise":`${C.rise}ms`, "--c-rise-ms":`${C.riseMs}ms`, "--c-flood":`${C.flood}ms`,
    "--c-flood-ms":`${C.floodMs}ms`, "--c-chip":`${C.chip}ms`, "--c-tag":`${C.tag}ms`, "--c-stats":`${C.stats}ms`,
    "--c-lines":`${C.lines}ms`, "--c-line-stagger":`${C.lineStagger}ms`,
  };
  const style = {
    ...(playing ? { "--tl":`${-Math.round(timeline.elapsed)}ms`, ...beats } : null),
    ...(color ? { "--champ-color":color, "--champ-ink":ink, "--flood-x":`${origin.x}px`, "--flood-y":`${origin.top - 150}px`,
      "--flood-scale":String(Math.ceil((FLOOD_R * 2) / FLOOD_DISC)), "--flood-disc":`${FLOOD_DISC}px` } : null),
  };
  let letter = 0;
  const bleed = !!color;
  const medals = !view.tied && view.path.length > 0 ? medalLayout(view.path.length, BODY_W) : null;
  const frame = (
    <div className={`tv-champ${view.tied ? " is-tied" : ""}${bleed ? " is-bleed" : ""}`}>
      <div className="tv-champ-prize">
        <div className="tv-champ-sky">
          <DesertBand phase="fin" variant="full" width={bleed ? CHAMP_SKY.width : 600} height={bleed ? CHAMP_SKY.height : 760}
            stars={view.stars} lines={view.lines} showStars />
          {/* the weekend's own cup, the champion engraved on its cartouche
              as their name lands (a late TV joins mid-cut) */}
          <div className="tv-champ-trophy">
            <CrownCup state={state} events={events} variant="tv" engraveAt={playing ? C.name - timeline.elapsed : null} /></div>
        </div>
      </div>
      <div className="tv-champ-body">
        <div className={`tv-champ-hero${view.players.length > 1 ? " is-many" : ""}`}>
          <div className="tv-champ-faces">
            {view.players.map(p => (
              <span key={p} className="tv-crown-coin" style={{ width:chipSize, height:chipSize }}>
                <span className="tv-crown-coin-spin"><ChipFace p={p} size={chipSize} /></span>
              </span>
            ))}
          </div>
          <div className="tv-champ-who">
            <div className="fd-show tv-champ-name" style={{ fontSize:nameFit.size }} aria-label={title}>
              {title.split(/(\s+)/).map((word, w) => /^\s+$/.test(word) ? <span key={w}>{word}</span> : (
                <span key={w} className="tv-crown-word">{[...word].map((ch, i) => (
                  <span key={i} className="tv-crown-letter" aria-hidden="true"
                    style={playing ? { animationDelay:`calc(var(--tl) + ${C.name + (letter++) * C.nameStagger}ms)` } : undefined}>{ch}</span>
                ))}</span>
              ))}
            </div>
            <div className="tv-champ-title">{view.players.length > 1 ? "Champions" : "Champion"}</div>
          </div>
        </div>
        <div className="tv-champ-stack">
          {/* the crown's one hero number: its drums spin up from zero on the
              crown's own beat (a late TV joins mid-spin; at rest it stands) */}
          <b><ScoreReel value={view.pts} drum tone="chip" label={fmt(view.pts)} from={playing ? 0 : null}
            at={`calc(var(--tl) + ${C.count}ms)`} /></b>
          <span>final stack</span>
        </div>
        {medals && (
          <ol className={`tv-champ-medals${medals.named ? "" : " is-bare"}`} aria-label="Podium finishes"
            style={{ gridTemplateColumns:`repeat(${medals.perRow}, ${medals.tile}px)` }}>
            {view.path.map((item, i) => (
              <li key={item.eventId} className={`tv-medal is-p${item.place}`} aria-label={item.label}
                style={playing ? { animationDelay:`calc(var(--tl) + ${C.path + i * C.pathStagger}ms)` } : undefined}>
                <span className="tv-medal-mark">
                  <GameMark id={item.game} size={MEDAL.mark} />
                  <b className="tv-medal-place">{item.place}</b>
                </span>
                {medals.named && <span className="tv-medal-name">{item.name}</span>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
  const className = `tv-crown${playing ? " is-playing" : ""}${color ? ` is-flood ${inkClass}` : " is-tied"}${flooded ? " is-flooded" : ""}`;
  if (!playing) return (
    <div className={className} style={style}>
      {color && <div className="tv-crown-flood" aria-hidden="true" />}
      {frame}
    </div>
  );
  return (
    <Takeover kind="crown" className={className} style={style} label={`Champion: ${title}`}>
      <div className="tv-crown-night" aria-hidden="true" />
      <div className="fd-show is-marquee tv-crown-final" aria-hidden="true">Final</div>
      <CrownHall state={state} hall={hall} />
      {color && <div className="tv-crown-panel" aria-hidden="true"><i className="tv-crown-disc" /></div>}
      {color && <LampChase color={color} className="tv-crown-chase" />}
      <div className="tv-crown-frame">{frame}</div>
    </Takeover>
  );
}

/* The towers in final order: each stands unlit, then lights on its beat
   (the beat its tower used to go dark on, so the room's sounds land with
   it) with its face, name, final stack and place; the champion's lights
   as it rises and cascades. Drawn once: nothing in it changes while the
   crown plays. */
const CrownHall = memo(function CrownHall({ state, hall }) {
  return (
    <div className="tv-crown-hall" aria-hidden="true">
      <i className="tv-crown-floor" />
      {hall.map(tower => <CrownTower key={tower.player} state={state} tower={tower} count={hall.length} />)}
    </div>
  );
});

/* a tower of chips as one picture: a pattern of chip edges in the
   player's color, each with its dark underside */
function TowerChips({ chips, color, id }) {
  const pitch = HALL.chipH + HALL.chipGap;
  const h = chips * pitch;
  return (
    <svg className="tv-crown-chips" width={HALL.chipW} height={h} viewBox={`0 0 ${HALL.chipW} ${h}`} aria-hidden="true">
      <defs>
        <pattern id={id} width={HALL.chipW} height={pitch} patternUnits="userSpaceOnUse" y={h % pitch}>
          <rect x="0" y={HALL.chipGap} width={HALL.chipW} height={HALL.chipH} rx={HALL.chipW / 2} ry={HALL.chipH / 2}
            fill="var(--night-deep)" />
          <rect x="0" y={HALL.chipGap} width={HALL.chipW} height={HALL.chipH - 3} rx={HALL.chipW / 2} ry={(HALL.chipH - 3) / 2}
            fill={color} />
        </pattern>
      </defs>
      <rect width={HALL.chipW} height={h} fill={`url(#${id})`} />
    </svg>
  );
}

/* a tower's name fits its column: one line, else two at the space,
   lettered as written (measured at the caps' width, the widest it runs) */
function TowerName({ name, width }) {
  const fit = sideNameFit(String(name), width / 1.08, { max:26, min:24, caps:true });
  return <span className="tv-crown-name" style={{ fontSize:fit.size }}>
    {fit.lines.length > 1 ? <>{fit.lines[0]}<br />{fit.lines[1]}</> : name}</span>;
}

function CrownTower({ state, tower, count }) {
  const identity = usePlayerIdentity(tower.player);
  /* when this tower lights: its place's beat, or the champion's rise */
  const reveal = { "--reveal":`${tower.outAt ?? C.rise}ms` };
  const stand = { "--stand":`${C.towers + (count - 1 - tower.index) * C.towersStagger}ms` };
  return (
    <div className={`tv-crown-tower${tower.champ ? " is-champ" : ""}${tower.outAt !== null ? " is-out" : ""}`}
      style={{ left:tower.x, "--tc":identity.color, ...stand, ...reveal }}>
      <div className="tv-crown-stack">
        {tower.champ && Array.from({ length:10 }, (_, k) => <i key={`f${k}`} className="tv-crown-fall"
          style={{ "--k":k, "--dx":`${(k % 2 ? 1 : -1) * (40 + k * 23)}px`, "--fall":`${tower.top}px` }} />)}
        <span className="tv-crown-face"><i className="tv-crown-socket" />
          <span className="tv-crown-portrait"><Avatar state={state} p={tower.player} size={HALL.face} /></span></span>
        <span className="tv-crown-chipset">
          <TowerChips chips={tower.chips} color="var(--tv-crown-steel)" id={`crown-steel-${tower.index}`} />
          <span className="tv-crown-lit"><TowerChips chips={tower.chips} color={identity.color} id={`crown-chips-${tower.index}`} /></span>
        </span>
      </div>
      <div className="tv-crown-label">
        <TowerName name={disp(state, tower.player)} width={(HALL.right - HALL.left) / count - 8} />
        <span className="tv-crown-pts">{fmt(tower.pts)}</span>
      </div>
      {!tower.champ && <div className="fd-show tv-crown-place" style={{ top:tower.top - HALL.face - 74 }}>{ordinal(tower.index + 1)}</div>}
    </div>
  );
}
