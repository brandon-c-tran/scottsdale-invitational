import React, { useEffect, useState } from "react";
import { disp } from "../../../shared/core.js";
import { Avatar, ChipFace } from "../identity/PlayerIdentity.jsx";
import { usePlayerIdentity } from "../identity/PlayerIdentityContext.js";
import { TrophyHero } from "../weekend/Trophy.jsx";
import { DesertBand } from "./DesertBand.jsx";
import { fmt, signed, readableInk } from "./tvModel.js";
import { CROWN_TIMING as C, useTimeline, useTimelineCount } from "./tvMotion.js";

/* The champion, full frame, in their own identity color the way their
   player card wears it: the trophy under the night sky of the weekend's
   winners with the champion's own stars joined, a plate for every event
   winner, their chip, the final stack, wins, and the path to the title.
   A tie stays on night.

   When the crown is fresh (M18) it arrives the way p5 plays it: the final
   standings step down, the champion's row rises, their color floods out
   from their own face, their chip drops and turns twice, CHAMPION stamps,
   the name sets letter by letter, and the stack counts up in 25s. Every
   TV plays it from the same server instant; a reload shows the frame. */

/* the prelude rows, in canvas pixels inside the main area (956 tall) */
const MAIN_H = 956, MAST_H = 118;
const ROWS_TOP = 84, ROW_STEP = 60, ROW_H = 56, ROW_LEFT = 56;
const RISE_SCALE = 1.06;
const CANVAS_MID = 960;
/* avatar centre in an unscaled row: left pad 22, rank 40, gap 18, avatar 40 */
const AVATAR_X = 22 + 40 + 18 + 20;
const FLOOD_R = 2100;

export function crownRise(index, slot, count) {
  const to = MAIN_H / 2 - ROW_H / 2 + (slot - (count - 1) / 2) * 72;
  return to - (ROWS_TOP + index * ROW_STEP);
}
/* where the flood starts: the lead champion's face after the rise, in the
   flood layer's own pixels (it reaches up over the masthead) */
export function floodOrigin(count = 1) {
  const y = MAIN_H / 2 + (0 - (count - 1) / 2) * 72;
  /* the row grows about its own centre, which is the canvas's */
  return { x:CANVAS_MID + (ROW_LEFT + AVATAR_X - CANVAS_MID) * RISE_SCALE, y:y + MAST_H };
}

export function ChampionMoment({ state, view, standings = [], moment = null }) {
  const lead = view.players[0];
  const identity = usePlayerIdentity(lead);
  const color = view.tied ? null : identity.color;
  const ink = color ? readableInk(color) : "var(--bone)";
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
  const many = view.plates.length > 7;
  const skyH = many ? 300 : 380;
  const chipSize = view.players.length > 1 ? 170 : 220;
  const stack = useTimelineCount(playing, timeline.startedAt, { to:view.pts, start:C.count, ms:C.countMs, step:25 });
  const wins = useTimelineCount(playing, timeline.startedAt, { to:view.wins, start:C.count + 200, ms:600 });
  const bets = useTimelineCount(playing, timeline.startedAt, { to:view.betNet, start:C.count + 300, ms:800, step:100 });
  const origin = floodOrigin(view.players.length);
  const style = {
    ...(playing ? { "--tl":`${-Math.round(timeline.elapsed)}ms` } : null),
    ...(color ? { "--champ-color":color, "--champ-ink":ink, "--flood-x":`${origin.x}px`, "--flood-y":`${origin.y}px` } : null),
  };
  let letter = 0;
  return (
    <div className={`tv-crown${playing ? " is-playing" : ""}${color ? ` is-flood ${inkClass}` : " is-tied"}${flooded ? " is-flooded" : ""}`}
      style={style}>
      {playing && <CrownPrelude state={state} standings={standings} champions={view.players} />}
      {color && <div className="tv-crown-flood" aria-hidden="true" />}
      <div className={`tv-champ${view.tied ? " is-tied" : ""}`}>
        <div className="tv-champ-prize">
          <div className="tv-champ-sky" style={{ height:skyH }}>
            <DesertBand phase="fin" variant="full" width={740} height={skyH} stars={view.stars} lines={view.lines} showStars />
            <div className="tv-champ-trophy"><TrophyHero size={many ? 230 : 290} plate="FIELD DAY" /></div>
          </div>
          <div className="tv-plates" style={{ gridTemplateColumns:many ? "1fr 1fr" : "1fr" }}>
            {view.plates.map(plate => (
              <div key={plate.eventId} className="tv-plate"><b>{plate.name}</b><span>{plate.winner}</span></div>
            ))}
          </div>
        </div>
        <div className="tv-champ-body">
          <div className="tv-champ-tag">Champion</div>
          <div className="tv-champ-faces">
            {view.players.map(p => (
              <span key={p} className="tv-crown-coin" style={{ width:chipSize, height:chipSize }}>
                <span className="tv-crown-coin-spin"><ChipFace p={p} size={chipSize} /></span>
              </span>
            ))}
            {view.players.length === 1 && <span className="tv-crown-photo">
              <Avatar state={state} p={lead} size={170} style={{ border:"5px solid var(--champ-ink, var(--bone))" }} /></span>}
          </div>
          <div className="tv-champ-name" style={{ fontSize:title.length > 18 ? 104 : 150 }} aria-label={title}>
            {title.split(/(\s+)/).map((word, w) => /^\s+$/.test(word) ? <span key={w}>{word}</span> : (
              <span key={w} className="tv-crown-word">{[...word].map((ch, i) => (
                <span key={i} className="tv-crown-letter" aria-hidden="true"
                  style={playing ? { animationDelay:`calc(var(--tl) + ${C.name + (letter++) * C.nameStagger}ms)` } : undefined}>{ch}</span>
              ))}</span>
            ))}
          </div>
          <div className="tv-champ-stats">
            <span><b>{fmt(stack)}</b> final stack</span>
            <span><b>{wins}</b> win{view.wins === 1 ? "" : "s"}</span>
            {view.betNet !== 0 && <span><b>{signed(bets)}</b> bets</span>}
          </div>
          {!view.tied && view.path.length > 0 && (
            <div className="tv-champ-path">
              {view.path.map((item, i) => <span key={item.eventId}
                style={playing ? { animationDelay:`calc(var(--tl) + ${C.path + i * C.pathStagger}ms)` } : undefined}>{item.label}</span>)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* the final standings as they stood: everyone else steps down, bottom row
   first, and the champion's row rises to the middle */
function CrownPrelude({ state, standings, champions }) {
  const lead = new Set(champions);
  const count = standings.length;
  const rows = standings.map((row, index) => ({ row, index, champ:lead.has(row.player), slot:champions.indexOf(row.player) }));
  return (
    <div className="tv-crown-prelude" aria-hidden="true">
      <div className="tv-display tv-crown-title">Final standings</div>
      {rows.map(({ row, index, champ, slot }) => {
        const rise = champ ? crownRise(index, slot, champions.length) : 0;
        const style = champ
          ? { top:ROWS_TOP + index * ROW_STEP, "--rise":`${rise}px`, "--rise-scale":RISE_SCALE,
            animationDelay:`calc(var(--tl) + ${C.rise}ms)` }
          : { top:ROWS_TOP + index * ROW_STEP,
            animationDelay:`calc(var(--tl) + ${C.stepDown + (count - 1 - index) * C.stepStagger}ms)` };
        return (
          <div key={row.player} className={`tv-crown-row${champ ? " is-champ" : ""}`} style={style}>
            <span className="tv-rank">{row.rank}</span>
            <Avatar state={state} p={row.player} size={40} />
            <span className="tv-name">{disp(state, row.player)}</span>
            <span className="tv-pts">{fmt(row.pts)}</span>
          </div>
        );
      })}
    </div>
  );
}
