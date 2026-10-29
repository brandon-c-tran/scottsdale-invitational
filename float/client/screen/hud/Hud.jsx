/* The words over the scene (float/GROOVE.md "The screen (TV)"): the round
   card through the song's lead, the count-in, Go!, the song's strip and the
   rank strip under it ("Who's ahead"), the narration box ("Practice,
   narrated"), the intro's title, the cut's award cards and its call
   ("After a song"), the chug-off's call, count, clock and stamp, Last
   Call's intro and who drinks, the podium's names, "Check your phone".
   Big, few, on the beat; the frame driver says when each one changes and
   React draws it. */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { BEATS_PER_BAR, SONG_LEAD_MS, songForRound } from "../../../shared/chart.js";
import { bannerAt, lineShownAt, lineSpot, rankStripOn, roundLabel, songName } from "../model/song.js";
import { narrationOf } from "../soundBridge.js";
import { awardValue, cutShow, pctText } from "../model/cut.js";
export { awardValue };
import { RANK, rankMarks, rankNow, rankSlots } from "../model/rank.js";
export { RANK, rankMarks, rankSlots };
import { CHUG_EXPLAINER, CHUG_STAGE, chugCaption, chugClock, chugLayout, chugoffAt, firstChugoff } from "../model/chugoff.js";
export { firstChugoff };
import { LAST_CALL_EXPLAINER, namesText, verdictShown } from "../model/lastcall.js";
import { indexList } from "../model/cupShape.js";
import { podiumSteps } from "../model/flotilla.js";
import { propOf } from "../../art/groove/index.js";
import { useGrooveArt } from "../../art/groove/RiderSprite.jsx";
import { RiderFace } from "../art.jsx";
import { ordinalText } from "./bits.jsx";
import { inkOn, nameFill } from "./identity.js";

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

const songBeat = (st, now) => (st.chart && Number.isFinite(st.songAt) ? (now - st.songAt) / st.chart.beatMs : null);

/* ── the song ── */
export function SongBanner({ store, driver, room }) {
  const st = store.state;
  const banner = useDriven(driver, now => {
    const chart = st.chart;
    const beat = songBeat(st, now);
    if (beat === null || beat < -SONG_LEAD_MS / chart.beatMs) return null;
    return bannerAt(chart, beat, { round:room?.round | 0, rounds:room?.rounds | 0, lastRound:room?.lastRound ?? null });
  }, [room?.round], (a, b) => a?.key === b?.key);
  if (!banner) return null;
  if (banner.kind === "card") return <div className="hd-card" key={banner.key}>
    <span className="hd-card-round">{banner.text}</span>
    <span className="hd-card-name">{banner.sub}</span>
  </div>;
  if (banner.kind === "count") return <div className="hd-count" key={banner.key}><span>{banner.text}</span></div>;
  return <div className={`hd-shout is-${banner.kind}`} key={banner.key}><span>{banner.text}</span></div>;
}

/* the song's strip: practice, play, the breakdown, play; a dot where it is */
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
    {chart.sections.map(s => <i key={s.bar} className={`hd-strip-seg is-${s.kind}`} style={{ left:`${(s.from / chart.beats) * 640}px`, width:`${((s.to - s.from) / chart.beats) * 640}px` }} />)}
    <b className="hd-strip-head" ref={head} />
  </div>;
}

/* ── practice, narrated: the host's line in a box (top in practice, under the strip in the breakdown) ── */
export function Narration({ store, driver }) {
  const st = store.state;
  const line = useDriven(driver, now => {
    const beat = songBeat(st, now);
    const l = beat === null ? null : lineShownAt(narrationOf(st.chart), beat);
    return l ? { key:`${l.from}:${l.text}`, text:l.text, spot:lineSpot(st.chart, l) } : null;
  }, [], (a, b) => a?.key === b?.key);
  if (!line) return null;
  return <div className={`hd-line is-${line.spot}`} key={line.key}><span>{line.text}</span></div>;
}

/* ── who's ahead: every rider as a chip in rank order, the name and percent under it ── */
function RankFace({ entrant }) {
  return <span className="hd-rank-face"><RiderFace entrant={entrant} size={128} className="hd-rank-critter" /></span>;
}

/* mode "song": live, from the store's order (moved at most once a beat);
   mode "cut": the song's final ranking, the line lit at show.line, each out
   struck at its moment, the chug-off's pair ringed */
export function RankStrip({ store, driver, room, entrants, mode = "song" }) {
  const st = store.state;
  const root = useRef(null);
  const chips = useRef(new Map());
  const cutLine = useRef(null);
  const show = useMemo(() => (mode === "cut" ? cutShow(room, st.songField) : null), [mode, room]); // eslint-disable-line react-hooks/exhaustive-deps
  const field = mode === "cut" ? show.ranking.map(r => r.i) : st.songField;
  const final = !!room?.lastRound || room?.cut === null;
  const fieldKey = field.join(",");
  const slots = rankSlots(field.length);
  useEffect(() => {
    let order = "", on = null, lineKey = "", marksKey = "", struck = "";
    const pcts = new Map();
    return driver.add(now => {
      let ranking = null, through = null, visible = false;
      if (mode === "song") {
        const beat = songBeat(st, now);
        visible = beat !== null && rankStripOn(st.chart, beat);
        const r = visible ? rankNow(store, now) : null;
        if (r) { ranking = r.order; through = r.through; }
      } else {
        visible = true;
        ranking = show.ranking.map(r => r.i);
        const firstOut = show.ranking.findIndex(r => r.out || (show.chugoff && r.i === show.chugoff.b));
        through = !show.last && firstOut > 0 && Number.isFinite(show.line) && now >= show.line ? firstOut : null;
      }
      if (root.current && on !== visible) { root.current.dataset.on = visible ? "1" : ""; on = visible; }
      if (!visible || !ranking) return;
      const key = ranking.join(",");
      if (key !== order) {
        order = key;
        ranking.forEach((i, k) => {
          const node = chips.current.get(i);
          if (node) node.style.transform = `translate3d(${(slots.x(k)).toFixed(1)}px, 0, 0)`;
        });
      }
      const marks = rankMarks(ranking, { final });
      const mk = JSON.stringify(marks);
      if (mk !== marksKey) {
        marksKey = mk;
        for (const [i, node] of chips.current) {
          const label = marks[i] || "";
          node.dataset.mark = label ? (ranking.indexOf(i) === 0 ? "lead" : "top") : "";
          const tag = node.querySelector(".hd-rank-mark");
          if (tag && tag.textContent !== label) tag.textContent = label;
        }
      }
      const lk = through === null ? "" : `${through}`;
      if (cutLine.current && lk !== lineKey) {
        lineKey = lk;
        cutLine.current.dataset.on = through === null ? "" : "1";
        if (through !== null) cutLine.current.style.transform = `translate3d(${(slots.x(through) - 4).toFixed(1)}px, 0, 0)`;
      }
      if (mode === "song") {
        for (const i of ranking) {
          const live = store.liveOf(i);
          const text = Number.isFinite(live) ? `${Math.round(live)}%` : "";
          if (pcts.get(i) !== text) {
            pcts.set(i, text);
            const node = chips.current.get(i)?.querySelector(".hd-rank-pct");
            if (node) node.textContent = text;
          }
        }
      } else {
        const gone = show.outs.filter(o => now >= o.at).map(o => o.i).join(",");
        if (gone !== struck) {
          struck = gone;
          const set = new Set(gone ? gone.split(",").map(Number) : []);
          for (const [i, node] of chips.current) node.dataset.out = set.has(i) ? "1" : "";
        }
      }
    });
  }, [driver, store, mode, show, fieldKey, final]); // eslint-disable-line react-hooks/exhaustive-deps
  const bubble = show?.chugoff ? [show.chugoff.a, show.chugoff.b] : [];
  return <div className={`hd-rank is-${mode}${final ? " is-final" : ""}`} ref={root} data-on="" aria-hidden="true">
    {field.map((i, k) => {
      const e = entrants[i];
      const row = show?.ranking.find(r => r.i === i);
      return <div key={i} className={`hd-rank-chip${bubble.includes(i) ? " is-bubble" : ""}`} style={{ width:slots.w, transform:`translate3d(${slots.x(k)}px, 0, 0)`,
        "--c":e?.color || "#9aa39e", "--name":nameFill(e?.color) }}
        ref={node => { if (node) chips.current.set(i, node); else chips.current.delete(i); }}>
        <span className="hd-rank-mark" />
        <span className="hd-rank-ring"><RankFace entrant={e} /></span>
        <span className="hd-rank-name">{e?.name || "Rider"}</span>
        <span className="hd-rank-pct">{row ? pctText(row.pct) : ""}</span>
      </div>;
    })}
    <i className="hd-rank-cut" ref={cutLine} data-on="" />
  </div>;
}

/* ── the intro ── */
export function IntroTitle() {
  return <div className="hd-intro">
    <span className="hd-intro-word">Float</span>
  </div>;
}

/* ── the cut as a show: the award cards a beat apart, then the call ── */
export function CutShow({ store, driver, room, entrants }) {
  const st = store.state;
  const show = useMemo(() => cutShow(room, st.songField), [room]); // eslint-disable-line react-hooks/exhaustive-deps
  const elapsed = useDriven(driver, now => Math.floor(now / 50) * 50, []);
  const cards = show.awards.filter(a => elapsed >= a.at && elapsed < show.awardsEnd);
  const nextRound = (room?.round | 0) + 1;
  const nextSong = songForRound(nextRound, room?.rounds | 0);
  const barNext = room?.drinking !== false && !show.last && room?.cut !== undefined;
  const through = show.ranking.filter(r => !r.out).length;
  return <>
    {cards.length > 0 && <div className="hd-awards">
      {cards.map(a => {
        const e = entrants[a.i];
        return <div key={`${a.id}:${a.i}`} className="hd-award" style={{ "--c":e?.color || "#9aa39e", "--name":nameFill(e?.color) }}>
          <span className="hd-award-label">{a.label}</span>
          <span className="hd-award-who"><RankFace entrant={e} /><span className="hd-award-name">{e?.name}</span></span>
          <span className="hd-award-value">{awardValue(a)}</span>
        </div>;
      })}
    </div>}
    {show.chugoff && elapsed >= show.callAt && <ChugCall a={entrants[show.chugoff.a]} b={entrants[show.chugoff.b]} />}
    {!show.chugoff && !show.last && elapsed >= show.nextAt && (barNext ? <div className="hd-next">
      <span className="hd-next-label">Next</span>
      <span className="hd-next-name">Last Call</span>
    </div> : <div className="hd-next">
      <span className="hd-next-label">Next</span>
      <span className="hd-next-round">{roundLabel(nextRound, room?.rounds | 0, nextRound >= (room?.rounds | 0) - 1)}</span>
      <span className="hd-next-name">{songName(nextSong)}</span>
      <span className="hd-next-sub">{through <= 3 ? `${through} for the podium` : `${through} riders`}</span>
    </div>)}
  </>;
}

/* "Chug-off!" and the two names */
function ChugCall({ a, b, explain = false, top = false }) {
  return <div className={`hd-chugcall${top ? " is-top" : ""}`}>
    <span className="hd-chugcall-title">Chug-off!</span>
    <span className="hd-chugcall-names">
      <span style={{ "--name":nameFill(a?.color) }}>{a?.name}</span>
      <i>vs</i>
      <span style={{ "--name":nameFill(b?.color) }}>{b?.name}</span>
    </span>
    {explain && <span className="hd-chugcall-sub">{CHUG_EXPLAINER}</span>}
  </div>;
}


/* ── the chug-off: the call, 3 2 1, Chug!, the clock between them, the stamp ── */
export function ChugHud({ store, driver, room, entrants }) {
  const st = store.state;
  const clock = useRef(null);
  const view = useDriven(driver, now => {
    const c = chugoffAt(st.chugoff || room?.chugoff, now, { seen:st.done, startAt:st.phaseStart, decidedAt:st.chugoffDecidedAt, first:firstChugoff(room) });
    if (!c) return null;
    return { key:`${c.stage}:${c.count}:${c.winner}:${c.by}:${Object.keys(c.done).join(",")}`, ...c };
  }, [room], (x, y) => x?.key === y?.key);
  useEffect(() => driver.add(now => {
    if (!clock.current) return;
    const c = chugoffAt(st.chugoff || room?.chugoff, now, { seen:st.done, startAt:st.phaseStart, decidedAt:st.chugoffDecidedAt, first:firstChugoff(room) });
    /* the clock between them counts 3 2 1, then the race */
    const text = !c || c.stage === "call" ? "0.0" : c.stage === "count" ? c.count : chugClock(c.clockMs);
    if (clock.current.textContent !== text) clock.current.textContent = text;
  }), [driver, room]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!view) return null;
  const a = entrants[view.a], b = entrants[view.b];
  const spots = chugLayout(view.a, view.b);
  const winnerSpot = view.winner !== null ? spots[view.winner] : null;
  return <>
    {(view.stage === "call" || view.stage === "count") && <ChugCall a={a} b={b} explain={firstChugoff(room)} top />}
    {view.stage === "chug" && view.count && <div className="hd-shout is-chug" key="chug"><span>{view.count}</span></div>}
    <div className={`hd-chugclock is-${view.stage}${view.winner !== null ? " is-stopped" : ""}`} key={view.stage === "count" ? `n:${view.count}` : "clock"}
      style={{ left:CHUG_STAGE.x, top:CHUG_STAGE.timerY }}><span ref={clock}>{view.stage === "count" ? view.count : "0.0"}</span></div>
    {[view.a, view.b].map(i => Number.isFinite(view.done[i]) && i !== view.winner && <span key={i} className="hd-chugdone"
      style={{ left:spots[i].x, top:CHUG_STAGE.y - 330 }}>Done</span>)}
    {winnerSpot && (view.stage === "won" || view.stage === "exit") && <div className="hd-keeps" style={{ left:winnerSpot.x, top:CHUG_STAGE.y - 350 }}>
      <span className="hd-keeps-stamp">Keeps the spot</span>
      {chugCaption(view.by) && <span className="hd-keeps-by">{chugCaption(view.by)}</span>}
    </div>}
  </>;
}

/* ── Last Call: its title (and, the first time, what it is); then who drinks ── */
export function LastCallHud({ store, driver, entrants }) {
  const st = store.state;
  const view = useDriven(driver, now => {
    const chart = st.chart;
    if (!chart?.countdown || !Number.isFinite(st.songAt)) return null;
    const drinkers = verdictShown({ songAt:st.songAt, countdown:chart.countdown, lastCall:st.lastCall, lastCallAt:st.lastCallAt }, now);
    if (drinkers?.length) return `drink:${drinkers.join(",")}`;
    /* the title through the lead and the intro (the first Last Call's says what it is) */
    return now - st.songAt < chart.countdown.introMs ? (chart.countdown.first ? "intro:first" : "intro") : null;
  });
  if (!view) return null;
  if (view.startsWith("intro")) return <div className="hd-card is-bar" key="card">
    <span className="hd-card-name">Last Call</span>
    {view === "intro:first" && <span className="hd-card-sub">{LAST_CALL_EXPLAINER}</span>}
  </div>;
  const list = view.slice(6).split(",").map(Number);
  const names = list.map(i => entrants[i]?.name).filter(Boolean);
  return <div className="hd-drinks" key={view}>
    <span className="hd-drinks-names">{namesText(names)}</span>
    <span className="hd-drinks-word">{names.length === 1 ? "drinks" : "drink"}</span>
  </div>;
}

/* ── the podium ── */
export const PODIUM_REVEAL = Object.freeze({ third:1450, second:2200, first:2700, pose:3400 });
export function PodiumBlocks({ store, driver, room, entrants, beats = PODIUM_REVEAL, revealed = false }) {
  const st = store.state;
  const podium = indexList(room?.podium);
  const start = Number.isFinite(room?.startAt) ? room.startAt : st.phaseStart;
  /* the feedback after it: everything revealed, standing */
  const elapsed = useDriven(driver, now => (revealed ? Infinity : Math.floor((now - start) / 100) * 100), [start, revealed]);
  const at = { 3:beats.third, 2:beats.second, 1:beats.first };
  const colors = podium.map(i => entrants[i]?.color).filter(Boolean);
  const m = useGrooveArt();
  const prop = m ? propOf("podium") : null;
  const steps = podiumSteps(prop);
  const frame = prop?.src ? { w:1120, h:1120 * (prop.h / prop.w), left:960 - 1120 * ((prop.anchor?.[0] ?? prop.w / 2) / prop.w),
    top:1066 - 1120 * ((prop.anchor?.[1] ?? prop.h) / prop.w) } : null;
  return <div className="hd-podium">
    <Confetti colors={colors} on={elapsed >= beats.first} />
    {frame && <img className="hd-podium-art" src={prop.src} alt="" draggable={false} style={{ left:frame.left, top:frame.top, width:frame.w, height:frame.h }} />}
    {steps.map(step => {
      const i = podium[step.place - 1];
      const e = Number.isInteger(i) ? entrants[i] : null;
      const lit = elapsed >= at[step.place];
      const drawn = !frame;
      return <div key={step.place} className={`hd-block is-${step.place}${lit ? " is-lit" : ""}${drawn ? " is-drawn" : ""}`}
        style={{ left:step.x - step.w / 2, top:step.y, width:step.w, height:1080 - step.y, "--c":e?.color || "#ccc", "--ink":inkOn(e?.color) }}>
        <span className="hd-block-place">{ordinalText(step.place)}</span>
        {e && lit && <span className="hd-block-name">{e.name}</span>}
      </div>;
    })}
  </div>;
}

/* confetti in the three's colours, falling once 1st is revealed */
const CONFETTI_INKS = ["#ffc23d", "#ff6fae", "#7fd6f2", "#fffdf8"];
export function Confetti({ colors = [], on = true }) {
  const pieces = useMemo(() => {
    const inks = [...colors.filter(Boolean), ...CONFETTI_INKS];
    return Array.from({ length:54 }, (_, k) => ({
      x:(k * 211 + 37) % 1900, delay:(k * 173) % 2400, ms:2600 + ((k * 97) % 1600), turn:((k * 61) % 2 ? 1 : -1) * (360 + (k * 41) % 400),
      sway:((k * 29) % 120) - 60, w:12 + (k % 3) * 6, h:20 + (k % 4) * 5, color:inks[k % inks.length],
    }));
  }, [colors.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!on) return null;
  return <div className="hd-confetti" aria-hidden="true">
    {pieces.map((p, k) => <i key={k} style={{ left:p.x, width:p.w, height:p.h, background:p.color, animationDelay:`${p.delay}ms`,
      animationDuration:`${p.ms}ms`, "--turn":`${p.turn}deg`, "--sway":`${p.sway}px` }} />)}
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
