/* The room's HUD over the river (game-ui-ux: anchored to the canvas edges,
   scaled from a 1920x1080 stage, event-driven): the round's plate, the cap
   clock, the standings rail with the cut line, the ribbon of everyone's
   progress, names over heads, the title cards, 3 2 1, arrivals, the cut,
   the podium and "Check your phone". Anything that moves every frame is
   written straight to the DOM from the frame bus; React re-renders only
   when the room or the order changes. */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { FLAG } from "../../../shared/protocol.js";
import { COUNT_BEATS, PODIUM_BEATS } from "../../sound/index.js";
import { Chip, DoneIcon, DrinkIcon, FlagIcon, Num, OneSafe, Ordinal, ordinalHtml, PhoneIcon, SwimIcon } from "./bits.jsx";
import { inkOn } from "./identity.js";
import { cupStandings, cutOf, has, isPlaced, legLength, titleFor } from "../model/hudModel.js";
import { indexList } from "../model/cupShape.js";

const ROW_H = 54;
const CUT_GAP = 30;

/* re-render on a frame only when `select` changes */
export function useFrameValue(bus, select, equal = (a, b) => a === b) {
  const [value, setValue] = useState(() => select(bus.last));
  const ref = useRef(value);
  useEffect(() => bus.on(frame => {
    const next = select(frame);
    if (!equal(ref.current, next)) { ref.current = next; setValue(next); }
  }), [bus]); // eslint-disable-line react-hooks/exhaustive-deps
  return value;
}

const orderKey = frame => (frame?.order || []).map(o => `${o.i}:${o.state}:${o.place ?? ""}:${has(o.f, FLAG.HANDS_OFF) ? 1 : 0}${has(o.f, FLAG.SWIM) ? 1 : 0}${has(o.f, FLAG.DRANK) ? 1 : 0}`).join(",");

/* ── the round's plate ── */
export function Plate({ room, geo }) {
  const t = titleFor(room, geo);
  if (!t.leg) return null;
  return <div className="fs-plate fs-glass">
    <span className="fs-label"><OneSafe>{t.label}</OneSafe></span>
    <span className="fs-show">{t.legName}</span>
    <span className="fs-sub">{t.goes}</span>
  </div>;
}

/* ── the cap: the round ends 30 s after its first finisher ── */
/* the round's end, once it is near: 30 s after the first finisher, or the
   last 30 s of the hard cap */
export function CapClock({ room, bus }) {
  const left = useFrameValue(bus, frame => {
    if (!Number.isFinite(room?.endsAt) || !frame) return null;
    const ms = room.endsAt - frame.now;
    if (ms > 30500) return null;
    return ms > 0 ? Math.ceil(ms / 1000) : 0;
  });
  if (left === null) return null;
  return <div className={`fs-clock fs-glass${left <= 10 ? " is-low" : ""}`}>
    <span className="fs-clock-dot" />
    <span className="fs-label">Ends in</span>
    <span className="fs-num">{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</span>
  </div>;
}

/* placed: the flag; at the takeout without the drink: the lamp; on the
   water: swimming, drinking, or the drink done */
function StateIcons({ o, drinking = true }) {
  const f = o.f | 0;
  if (o.state === "placed") return <span className="fs-state fs-ico-flag"><FlagIcon /></span>;
  if (o.state === "waiting") return <span className="fs-lamp is-amber is-flash"><DrinkIcon />Drink</span>;
  return <span className="fs-state">
    {has(f, FLAG.SWIM) && <span className="fs-ico-swim"><SwimIcon /></span>}
    {has(f, FLAG.HANDS_OFF) && drinking && <span className="fs-ico-drink"><DrinkIcon /></span>}
    {has(f, FLAG.DRANK) && drinking && !has(f, FLAG.HANDS_OFF) && <span className="fs-ico-done"><DoneIcon /></span>}
  </span>;
}

/* ── the standings rail ── */
export function Rail({ room, bus, entrants }) {
  const key = useFrameValue(bus, orderKey);
  const frame = bus.last;
  const order = useMemo(() => frame?.order || [], [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const through = frame?.through ?? order.length;
  if (!order.length) return null;
  const showCut = through > 0 && through < order.length;
  const gap = showCut ? CUT_GAP : 0;
  const top = k => k * ROW_H + (showCut && k >= through ? gap : 0);
  return <div className="fs-rail fs-glass">
    <div className="fs-rail-list" style={{ height:`calc(var(--u) * ${order.length * ROW_H + gap})` }}>
      {order.map((o, k) => {
        const e = entrants[o.i];
        return <div key={o.i} className={`fs-row${o.state === "placed" ? " is-placed" : ""}${showCut && k >= through ? " is-below" : ""}`}
          style={{ transform:`translateY(calc(var(--u) * ${top(k)}))` }}>
          <span className="fs-place fs-num"><Num n={o.state === "placed" ? o.place : k + 1} /></span>
          <Chip entrant={e} size={40} />
          <span className="fs-name">{e?.name || "Rider"}</span>
          <StateIcons o={o} drinking={room?.drinking !== false} />
        </div>;
      })}
      {showCut && <div className="fs-cutline" style={{ transform:`translateY(calc(var(--u) * ${through * ROW_H + gap / 2}))` }}><span>Cut</span></div>}
    </div>
  </div>;
}

/* ── the ribbon: everyone's progress down the leg ── */
export function Ribbon({ room, geo, bus, entrants }) {
  const wrap = useRef(null);
  const chips = useRef(new Map());
  const cutRef = useRef(null);
  const leg = geo?.legs?.[Math.max(0, Math.min((geo?.legs?.length || 1) - 1, room?.leg | 0))];
  const len = legLength(leg);
  const field = indexList(room?.field);
  const zones = useMemo(() => (leg ? geo.zones.filter(z => z.s1 > leg.grid && z.s0 < leg.finish && z.k !== "bar" && z.k !== "split")
    .map(z => ({ k:z.k, a:Math.max(0, (z.s0 - leg.grid) / len), b:Math.min(1, (z.s1 - leg.grid) / len) })) : []), [geo, leg, len]);
  useEffect(() => bus.on(frame => {
    const el = wrap.current;
    if (!el || !frame) return;
    const width = el.clientWidth;
    const u = width / 1300;
    const chip = 40 * u;
    const order = frame.order || [];
    /* the leader first: it takes the low lane; crowds stack three high, then overlap */
    const lanes = [-1e9, -1e9, -1e9];
    for (const o of order) {
      const node = chips.current.get(o.i);
      if (!node) continue;
      const home = o.state !== "racing";
      const t = home ? 1 : Math.max(0, Math.min(1, o.p / len));
      const x = t * width;
      let lane = lanes.findIndex(at => Math.abs(at - x) >= chip * 0.86);
      if (lane < 0) lane = 0;
      lanes[lane] = x;
      node.style.transform = `translate(${x - chip / 2}px, ${-lane * chip * 0.7}px)`;
      node.style.zIndex = String(100 - o.rank);
    }
    const cut = cutRef.current;
    if (cut) {
      const through = frame.through ?? order.length;
      const last = order.find(o => o.rank === through);
      if (!last || through >= order.length) cut.style.opacity = "0";
      else {
        const t = last.state !== "racing" ? 1 : Math.max(0, Math.min(1, last.p / len));
        cut.style.opacity = "1";
        cut.style.transform = `translateX(${t * width - chip * 0.62}px)`;
      }
    }
  }), [bus, len]);
  if (!leg || !field.length) return null;
  return <div className="fs-ribbon" ref={wrap}>
    <div className="fs-ribbon-track">
      {zones.map((z, k) => <span key={k} className={`fs-ribbon-zone is-${z.k}`} style={{ left:`${z.a * 100}%`, width:`${Math.max(0.6, (z.b - z.a) * 100)}%` }} />)}
    </div>
    <span className="fs-ribbon-end is-start" />
    <span className="fs-ribbon-end is-finish" />
    <span className="fs-ribbon-cut" ref={cutRef} style={{ opacity:0 }}><span>Cut</span></span>
    {field.map(i => <span key={i} className="fs-ribbon-chip" style={{ "--c":entrants[i]?.color || "#999" }}
      ref={node => { if (node) chips.current.set(i, node); else chips.current.delete(i); }}>
      <Chip entrant={entrants[i]} size={40} />
    </span>)}
  </div>;
}

/* ── names over heads ── */
export function NameTags({ bus, entrants, phase, big = false }) {
  const nodes = useRef(new Map());
  useEffect(() => bus.on(frame => {
    if (!frame) return;
    const tags = (frame.tags || []).slice();
    const through = frame.through ?? 0;
    const prio = t => (t.state === "waiting" ? 0 : has(t.f, FLAG.SWIM) || has(t.f, FLAG.HANDS_OFF) ? 1 : t.rank === 1 ? 2
      : Math.abs(t.rank - through - 0.5) < 1.5 ? 3 : 4 + t.rank * 0.1) + t.z * 0.5;
    tags.sort((a, b) => prio(a) - prio(b));
    const placed = [];
    const seen = new Set();
    const scale = frame.width / 1920;
    for (const t of tags) {
      const node = nodes.current.get(t.i);
      if (!node) continue;
      seen.add(t.i);
      if (!t.on) { node.style.opacity = "0"; continue; }
      const w = (node.offsetWidth || 120), h = (node.offsetHeight || 44);
      const x = t.x - w / 2, y = t.y - h;
      const overlap = placed.some(p => x < p.x + p.w - 6 * scale && x + w > p.x + 6 * scale && y < p.y + p.h && y + h > p.y);
      placed.push({ x, y, w, h });
      node.style.transform = `translate(${x}px, ${y}px)`;
      node.style.opacity = overlap ? "0.16" : "1";
      node.style.zIndex = String(Math.round(1000 - prio(t) * 10));
      const lamp = node.querySelector(".fs-tag-state");
      const want = t.state === "waiting" ? "drink" : t.state === "placed" ? `place:${t.place ?? ""}` : has(t.f, FLAG.HANDS_OFF) ? "sip" : has(t.f, FLAG.SWIM) ? "swim" : "";
      if (lamp && lamp.dataset.state !== want) {
        lamp.dataset.state = want;
        lamp.className = `fs-tag-state${want ? "" : " is-empty"}`;
        lamp.innerHTML = want === "drink" ? `<span class="fs-lamp is-amber is-flash">Finish your drink</span>`
          : want === "sip" ? `<span class="fs-lamp is-amber">Drinking</span>`
          : want === "swim" ? `<span class="fs-lamp is-cyan">Swimming</span>` : "";
      }
      const place = node.querySelector(".fs-tag-place");
      if (place) {
        const n = t.state === "placed" ? (frame.order?.find(o => o.i === t.i)?.place || t.rank) : 0;
        if (place.dataset.n !== String(n)) { place.dataset.n = String(n); place.innerHTML = n ? ordinalHtml(n) : ""; }
      }
    }
    for (const [i, node] of nodes.current) if (!seen.has(i)) node.style.opacity = "0";
  }), [bus]);
  return <div className="fs-tags">
    {entrants.map((e, i) => e && <div key={i} className={`fs-tag${big ? " is-big" : ""}`} data-phase={phase}
      style={{ "--c":e.color || "#999", "--ink":inkOn(e.color) }}
      ref={node => { if (node) nodes.current.set(i, node); else nodes.current.delete(i); }}>
      <div className="fs-tag-state" />
      <span className="fs-tag-name"><span className="fs-tag-place" />{e.name}</span>
    </div>)}
  </div>;
}

/* ── the title card on the grid ── */
export function TitleCard({ room, geo }) {
  const t = titleFor(room, geo);
  if (!t.leg) return null;
  return <div className="fs-title fs-glass fs-in" key={`${room?.round}`}>
    <span className="fs-label"><OneSafe>{t.label}</OneSafe></span>
    <span className="fs-show">{t.legName}</span>
    <span className="fs-sub">{t.goes}</span>
  </div>;
}

/* ── the intro: each leg's name as its shot plays ── */
export function IntroLower({ geo, bus }) {
  const shot = useFrameValue(bus, frame => (frame?.camKey?.startsWith("intro:") && !frame.camKey.endsWith("grid") ? frame.shot ?? null : null));
  const leg = shot === null ? null : geo?.legs?.[shot];
  if (!leg) return null;
  return <div className="fs-lower" key={shot}>
    <span className="fs-label"><OneSafe>{`Leg ${shot + 1}`}</OneSafe></span>
    <span className="fs-show">{leg.name}</span>
  </div>;
}

/* ── 3 2 1 on the countdown's beats, GO on the gun ── */
export function Countdown({ gun, bus }) {
  const n = useFrameValue(bus, frame => {
    if (!Number.isFinite(gun) || !frame) return null;
    const left = gun - frame.now;
    if (left <= 0 && left > -1100) return "GO";
    for (let k = COUNT_BEATS.length - 1; k >= 0; k--) {
      const beat = COUNT_BEATS[k];
      if (left <= beat && left > beat - 1000) return String(COUNT_BEATS.length - k);
    }
    return null;
  });
  if (!n) return null;
  return <div className="fs-count"><span key={n} className={`fs-count-n${n === "GO" ? " is-go" : ""}`}>{n === "GO" ? "Go" : n}</span></div>;
}

/* ── arrivals: each place as it lands ── */
export function Arrivals({ room, entrants, through, final }) {
  const [toasts, setToasts] = useState([]);
  const seen = useRef(new Set());
  const round = room?.round | 0;
  useEffect(() => { seen.current = new Set(); setToasts([]); }, [round]);
  useEffect(() => {
    const rows = (Array.isArray(room?.results) ? room.results : []).filter(isPlaced);
    const fresh = rows.filter(row => !seen.current.has(row.i));
    if (!fresh.length) return;
    fresh.forEach(row => seen.current.add(row.i));
    /* a screen that joins late does not replay old places */
    if (fresh.length > 3) return;
    setToasts(list => [...list, ...fresh.map(row => ({ i:row.i, place:row.place, id:`${round}:${row.i}` }))].slice(-3));
  }, [room?.results, round]);
  useEffect(() => {
    if (!toasts.length) return undefined;
    const timer = setTimeout(() => setToasts(list => list.slice(1)), 2600);
    return () => clearTimeout(timer);
  }, [toasts]);
  if (!toasts.length) return null;
  return <div className="fs-toasts">
    {toasts.map(t => <div key={t.id} className="fs-toast fs-glass">
      <span className="fs-num"><Ordinal n={t.place} /></span>
      <Chip entrant={entrants[t.i]} size={52} />
      <span className="fs-show">{entrants[t.i]?.name}</span>
      {!final && t.place <= through && <span className="fs-lamp is-cyan">Through</span>}
    </div>)}
  </div>;
}

/* ── the instant replay's lamp, while it plays ── */
export function ReplayLamp({ bus, entrants }) {
  const replay = useFrameValue(bus, frame => (frame?.replay ? frame.replay.i ?? -1 : null));
  if (replay === null) return null;
  const who = replay >= 0 ? entrants[replay] : null;
  return <>
    <div className="fs-letterbox" />
    <div className="fs-replay">
      <span className="fs-lamp is-cyan fs-replay-lamp"><span className="fs-replay-dot" />Replay</span>
      {who && <span className="fs-replay-who fs-show">{who.name}</span>}
    </div>
  </>;
}

/* ── the cut: who goes home, then the next leg ── */
export function CutBoard({ room, geo, entrants, raceField, bus, since, replayEnds = null }) {
  /* with a replay, the board waits for it to end */
  const start = Number.isFinite(replayEnds) ? replayEnds : since;
  const elapsed = useFrameValue(bus, frame => (frame && Number.isFinite(start) ? Math.floor((frame.now - start) / 100) * 100 : 0));
  const replaying = useFrameValue(bus, frame => !!frame?.replay);
  if (replaying || elapsed < 0) return null;
  const { cut } = cutOf(room, raceField);
  const results = Array.isArray(room?.results) ? room.results : [];
  const placed = results.map(r => r.i).filter(i => !cut.includes(i));
  const rest = raceField.filter(i => !placed.includes(i) && !cut.includes(i));
  const order = [...placed, ...rest, ...cut];
  /* the outs stamp from the back of the field to the nearest miss */
  const stampOrder = cut.slice().reverse();
  const nextLeg = geo?.legs?.[(room?.leg | 0) + 1];
  const t = titleFor(room, geo);
  const boardGone = elapsed > 9200;
  const field = order.length;
  const nextField = field - cut.length;
  return <>
    {elapsed < 9800 && <div className={`fs-cut${boardGone ? " fs-fade-out" : ""}`}>
      <div className="fs-cut-head">
        <span className="fs-label"><OneSafe>{t.label}</OneSafe></span>
        <span className="fs-show">{t.legName}</span>
      </div>
      <div className="fs-cut-grid">
        {order.map((i, k) => {
          const isOut = cut.includes(i);
          const at = 1700 + stampOrder.indexOf(i) * 420;
          const stamped = isOut && elapsed >= at;
          return <div key={i} className={`fs-card fs-glass${isOut ? " is-out" : ""}${stamped ? " is-stamped" : ""}`} style={{ animationDelay:`${k * 45}ms` }}>
            <span className="fs-num"><Num n={k + 1} /></span>
            <Chip entrant={entrants[i]} size={96} out={stamped} />
            <span className="fs-name">{entrants[i]?.name}</span>
            {stamped && <span className="fs-stamp">Out</span>}
          </div>;
        })}
      </div>
    </div>}
    {boardGone && nextLeg && <div className="fs-next fs-glass">
      <span className="fs-label">Next</span>
      <span className="fs-show">{nextLeg.name}</span>
      <span className="fs-sub">{nextField <= 3 ? "The final" : `${nextField} riders`}</span>
    </div>}
  </>;
}

/* ── the podium: the places land on the band's beats ── */
export function Podium({ room, entrants, bus, anchor, elapsedAt }) {
  const podium = indexList(room?.podium);
  const spots = useFrameValue(bus, frame => frame?.podium || null, (a, b) => JSON.stringify(a) === JSON.stringify(b));
  const elapsed = useFrameValue(bus, frame => (frame && Number.isFinite(anchor) ? Math.floor((frame.now - anchor) / 100) * 100 : 0));
  void elapsedAt;
  const beat = { 3:PODIUM_BEATS.third, 2:PODIUM_BEATS.second, 1:PODIUM_BEATS.first };
  const standings = cupStandings(room).filter(i => !podium.includes(i));
  return <>
    {(spots || []).map(spot => {
      const i = podium[spot.place - 1];
      if (i === undefined || elapsed < beat[spot.place] || !spot.on) return null;
      const e = entrants[i];
      return <div key={spot.place} className={`fs-pod is-${spot.place}`} style={{ left:spot.x, top:spot.y, "--c":e?.color || "#999", "--ink":inkOn(e?.color) }}>
        <span className="fs-num"><Ordinal n={spot.place} /></span>
        <span className="fs-show">{e?.name}</span>
      </div>;
    })}
    {elapsed > 6500 && standings.length > 0 && <div className="fs-final fs-glass">
      {standings.slice(0, 10).map((i, k) => <div key={i} className="fs-final-row">
        <span className="fs-num"><Ordinal n={k + 4} /></span>
        <Chip entrant={entrants[i]} size={34} />
        <span className="fs-name">{entrants[i]?.name}</span>
      </div>)}
    </div>}
  </>;
}

export function Feedback() {
  return <>
    <div className="fs-dim" />
    <div className="fs-phone fs-glass">
      <PhoneIcon />
      <span className="fs-show">Check your phone</span>
    </div>
  </>;
}
