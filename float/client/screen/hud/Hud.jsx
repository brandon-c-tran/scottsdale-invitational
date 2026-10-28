/* The words over the scene (float/GROOVE.md "The screen (TV)"): the round
   card through the song's lead, Practice, Go!, Drink!, the song's strip,
   the intro's title, the cut's board and the next song's card, the podium's
   names, "Check your phone". Big, few, on the beat; the frame driver says
   when each one changes and React draws it. */
import React, { useEffect, useRef, useState } from "react";
import { BEATS_PER_BAR, SONG_LEAD_MS } from "../../../shared/chart.js";
import { bannerAt, roundLabel, songName } from "../model/song.js";
import { cutOuts, cutRankingOf, cutTimeline, pctText } from "../model/cut.js";
import { indexList } from "../model/cupShape.js";
import { PODIUM } from "../model/flotilla.js";
import { RiderFace } from "../art.jsx";
import { ordinalText } from "./bits.jsx";
import { inkOn } from "./identity.js";

/* a value from the frame loop, re-rendered only when it changes */
export function useDriven(driver, select, deps = [], equal = (a, b) => a === b) {
  const [value, setValue] = useState(() => (driver ? select(driver.serverNow()) : null));
  const ref = useRef(value);
  useEffect(() => {
    if (!driver) return undefined;
    return driver.add(now => {
      const next = select(now);
      if (!equal(ref.current, next)) { ref.current = next; setValue(next); }
    });
  }, [driver, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  return value;
}

/* ── the song ── */
export function SongBanner({ store, driver, room }) {
  const st = store.state;
  const banner = useDriven(driver, now => {
    const chart = st.chart;
    if (!chart || !Number.isFinite(st.songAt)) return null;
    const beat = (now - st.songAt) / chart.beatMs;
    if (beat < -SONG_LEAD_MS / chart.beatMs) return null;
    return bannerAt(chart, beat, { round:room?.round | 0, rounds:room?.rounds | 0, lastRound:room?.lastRound ?? null });
  }, [room?.round], (a, b) => a?.key === b?.key);
  if (!banner) return null;
  if (banner.kind === "card") return <div className="hd-card" key={banner.key}>
    <span className="hd-card-round">{banner.text}</span>
    <span className="hd-card-name">{banner.sub}</span>
  </div>;
  if (banner.kind === "practice") return <div className="hd-practice" key={banner.key}><span>{banner.text}</span></div>;
  return <div className={`hd-shout is-${banner.kind}`} key={banner.key}><span>{banner.text}</span></div>;
}

/* the song's strip: practice, play, the drink, play; a dot where it is */
export function SongStrip({ store, driver }) {
  const st = store.state;
  const head = useRef(null);
  const chart = st.chart;
  useEffect(() => driver.add(now => {
    const c = st.chart;
    if (!head.current || !c || !Number.isFinite(st.songAt)) return;
    const t = Math.max(0, Math.min(1, (now - st.songAt) / (c.beats * c.beatMs)));
    head.current.style.transform = `translate3d(${(t * 640).toFixed(1)}px, 0, 0)`;
  }), [driver, st]);
  if (!chart?.sections) return null;
  return <div className="hd-strip" aria-hidden="true">
    {chart.sections.map(s => <i key={s.bar} className={`hd-strip-seg is-${s.kind}`} style={{ left:`${(s.from / chart.beats) * 640}px`, width:`${((s.to - s.from) / chart.beats) * 640}px` }}>
      {s.kind === "drink" && <CupIcon />}
    </i>)}
    <b className="hd-strip-head" ref={head} />
  </div>;
}

function CupIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h12l-1.6 15.2A2 2 0 0 1 14.4 21H9.6a2 2 0 0 1-2-1.8L6 4Z" fill="#fff6d6" stroke="#1d1a24" strokeWidth="2" strokeLinejoin="round" /><path d="M7 8h10" stroke="#f0b33a" strokeWidth="3" /></svg>;
}

/* ── the intro ── */
export function IntroTitle({ room }) {
  const n = indexList(room?.field).length || (room?.entrants || []).filter(Boolean).length;
  return <div className="hd-intro">
    <span className="hd-intro-word">Float</span>
    {n > 0 && <span className="hd-intro-sub">{n} riders · {roundsText(room?.rounds)}</span>}
  </div>;
}
const roundsText = rounds => (rounds | 0) === 1 ? "1 song" : `${rounds | 0} songs`;

/* ── the cut: the song's ranking, the line, the stamps; then the next song ── */
export function CutBoard({ store, driver, room, entrants }) {
  const st = store.state;
  const ranking = cutRankingOf(room, st.songField);
  const going = cutOuts(ranking);
  const start = Number.isFinite(room?.startAt) ? room.startAt : st.phaseStart;
  const ms = (room?.endsAt ?? 0) - (room?.startAt ?? 0);
  const timeline = cutTimeline(going.length, ms);
  const last = !!room?.lastRound || room?.cut === null;
  const elapsed = useDriven(driver, now => Math.floor((now - start) / 50) * 50, [start]);
  const stamped = going.filter((_, k) => elapsed >= timeline.stampAt(k));
  const boardGone = !last && elapsed >= timeline.boardOut;
  const showNext = !last && elapsed >= timeline.next;
  const through = ranking.length - going.length;
  const cols = ranking.length > 7 ? 2 : 1;
  const perCol = Math.ceil(ranking.length / cols);
  const songId = room?.song || st.chart?.id;
  const nextRound = (room?.round | 0) + 1;
  const nextSong = nextRound >= (room?.rounds | 0) - 1 ? "drop" : ["paddle", "rock", "spin"][Math.min(2, nextRound)];
  return <>
    {!boardGone && <div className={`hd-board${cols > 1 ? " is-two" : ""}${elapsed >= timeline.boardOut - 350 && !last ? " is-leaving" : ""}`}>
      <div className="hd-board-head">
        <span className="hd-board-round">{roundLabel(room?.round | 0, room?.rounds | 0, room?.lastRound ?? null)}</span>
        <span className="hd-board-name">{songName(songId)}</span>
      </div>
      <div className="hd-board-cols">
        {Array.from({ length:cols }, (_, c) => <div key={c} className="hd-board-col">
          {ranking.slice(c * perCol, (c + 1) * perCol).map((row, k) => {
            const e = entrants[row.i];
            const isStamped = stamped.includes(row.i);
            const cutLine = !last && through > 0 && going.length > 0 && row.place === through + 1;
            return <React.Fragment key={row.i}>
              {cutLine && <div className="hd-cutline" />}
              <div className={`hd-row${isStamped ? " is-out" : ""}${row.place <= 3 && last ? " is-top" : ""}`} style={{ "--c":e?.color || "#999", "--ink":inkOn(e?.color), animationDelay:`${(c * perCol + k) * 55}ms` }}>
                <span className="hd-row-place">{row.place}</span>
                <RiderFace entrant={e} pose={isStamped ? "out" : "idle"} className="hd-row-face" />
                <span className="hd-row-name">{e?.name || "Rider"}</span>
                <span className="hd-row-pct">{pctText(row.pct)}</span>
                {isStamped && <span className="hd-stamp">Out</span>}
              </div>
            </React.Fragment>;
          })}
        </div>)}
      </div>
    </div>}
    {showNext && <div className="hd-next">
      <span className="hd-next-label">Next</span>
      <span className="hd-next-round">{roundLabel(nextRound, room?.rounds | 0, nextRound >= (room?.rounds | 0) - 1)}</span>
      <span className="hd-next-name">{songName(nextSong)}</span>
      <span className="hd-next-sub">{through <= 3 ? `${through} for the podium` : `${through} riders`}</span>
    </div>}
  </>;
}

/* ── the podium ── */
export const PODIUM_REVEAL = Object.freeze({ third:1450, second:2200, first:2700, pose:3400 });
export function PodiumBlocks({ store, driver, room, entrants, beats = PODIUM_REVEAL }) {
  const st = store.state;
  const podium = indexList(room?.podium);
  const start = Number.isFinite(room?.startAt) ? room.startAt : st.phaseStart;
  const elapsed = useDriven(driver, now => Math.floor((now - start) / 100) * 100, [start]);
  const at = { 3:beats.third, 2:beats.second, 1:beats.first };
  return <div className="hd-podium">
    {PODIUM.map(block => {
      const i = podium[block.place - 1];
      const e = Number.isInteger(i) ? entrants[i] : null;
      const lit = elapsed >= at[block.place];
      return <div key={block.place} className={`hd-block is-${block.place}${lit ? " is-lit" : ""}`}
        style={{ left:block.x - block.w / 2, top:block.top, width:block.w, height:block.h, "--c":e?.color || "#ccc", "--ink":inkOn(e?.color) }}>
        <span className="hd-block-place">{ordinalText(block.place)}</span>
        {e && lit && <span className="hd-block-name">{e.name}</span>}
      </div>;
    })}
  </div>;
}

export function PodiumList({ room, entrants }) {
  const podium = indexList(room?.podium);
  const standings = indexList(room?.standings).filter(i => !podium.includes(i));
  if (!standings.length) return null;
  return <div className="hd-rest">
    {standings.slice(0, 13).map((i, k) => <div key={i} className="hd-rest-row" style={{ "--c":entrants[i]?.color || "#999" }}>
      <span className="hd-rest-place">{ordinalText(k + 4)}</span>
      <i className="hd-rest-dot" />
      <span className="hd-rest-name">{entrants[i]?.name}</span>
    </div>)}
  </div>;
}

export function Feedback() {
  return <div className="hd-phone">
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <rect x="13" y="3" width="22" height="42" rx="5" fill="#fffdf8" stroke="#1d1a24" strokeWidth="3.2" />
      <rect x="20" y="38" width="8" height="2.6" rx="1.3" fill="#1d1a24" />
      <path d="M19 15h10M19 21h10M19 27h6" stroke="#1d1a24" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
    <span>Check your phone</span>
  </div>;
}

export { BEATS_PER_BAR };
