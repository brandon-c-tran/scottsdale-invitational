/* The look picker (float/PROTOCOL.md "Components", "Looks"):
   <LockerPicker look onChange groom />, a character select in a phone
   sheet. The rider stands in the light at the top with their critter's
   name, floatie and its four stats; tabs below hold the critters as
   portrait tiles, the floaties as cards (stats and twist), and hats,
   shades and poses as chips. A pick lands at once: onChange(nextLook) with
   a whole legal look, the rider hops, a new floatie's stats grow and
   shrink into place. The crown shows only when groom.

   Optional, for the preview: color, name, photo, number, skin (the
   rider's own colour and chip). Without them the rider stands in a
   neutral colour. It positions nothing fixed and brings its own styles
   (fll-), so it sits in Field Day's Profile, the join and the lobby alike. */
import React, { useEffect, useRef, useState } from "react";
import { tapTick } from "../../../src/lib/haptics.js";
import { FLOATIES, floatieOf } from "../../shared/floaties.js";
import { CRITTERS } from "../../shared/looks.js";
import Portrait from "./Portrait.jsx";
import FloatieCard, { FloatieGlyph } from "./FloatieCard.jsx";
import { CheckBadge, LookGlyph } from "./LockerIcons.jsx";
import { LOCKER_TABS, critterTile, lockerEntrant, lockerLook, lockerOptions, pickLook, statMoves } from "./lockerModel.js";
import { preloadPortraits } from "./portrait.js";
import "./locker.css";

const critterName = id => CRITTERS.find(c => c.id === id)?.name || "";

/* the floatie's four stats as pips; the ones a switch gained light up,
   the ones it lost fade out */
function StatStrip({ from, to, moveKey }) {
  return <dl className="fll-strip" key={moveKey}>
    {statMoves(from, to).map(stat => <div key={stat.id} className="fll-strip-row">
      <dt>{stat.name}</dt>
      <dd aria-label={`${stat.name} ${stat.value} of 5`}>
        {[1, 2, 3, 4, 5].map(n => {
          const on = n <= stat.value, gained = on && n > stat.was, lost = !on && n <= stat.was;
          return <i key={n} className={`${on ? "is-on" : ""}${gained ? " is-gain" : ""}${lost ? " is-loss" : ""}`}
            style={{ "--n":n - 1 }} />;
        })}
      </dd>
    </div>)}
  </dl>;
}

const reducedMotion = () => { try { return !!globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches; } catch { return false; } };

function Hero({ entrant, floatie, from, moveKey, pop }) {
  const art = useRef(null);
  /* a pick: the rider hops in the light (a squash, a lift, a settle) */
  useEffect(() => {
    const el = art.current;
    if (!pop || !el || typeof el.animate !== "function" || reducedMotion()) return;
    el.animate([{ transform:"translateY(0) scale(1, 1)" }, { transform:"translateY(2px) scale(1.06, 0.92)", offset:0.18 },
      { transform:"translateY(-14px) scale(0.97, 1.04)", offset:0.5 }, { transform:"translateY(0) scale(1, 1)" }],
      { duration:420, easing:"cubic-bezier(0.33, 1, 0.68, 1)" });
  }, [pop]);
  return <div className="fll-hero">
    <div className="fll-stage" aria-hidden="true"><i className="fll-spot" /><i className="fll-ripple" key={pop} /></div>
    <div className="fll-hero-art" ref={art}>
      <Portrait entrant={entrant} size={124} label={`${critterName(entrant.look.critter)} on a ${floatie.name}`} />
    </div>
    <div className="fll-hero-text">
      <b className="fll-hero-name" key={entrant.look.critter}>{critterName(entrant.look.critter)}</b>
      <span className="fll-hero-floatie"><FloatieGlyph id={floatie.id} /><span>{floatie.name}</span></span>
      <StatStrip from={from} to={floatie.id} moveKey={moveKey} />
    </div>
  </div>;
}

function Tabs({ tab, onTab }) {
  const index = Math.max(0, LOCKER_TABS.findIndex(t => t.id === tab));
  const keys = event => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = LOCKER_TABS[(index + step + LOCKER_TABS.length) % LOCKER_TABS.length];
    onTab(next.id);
    event.currentTarget.parentElement?.querySelector(`[data-tab="${next.id}"]`)?.focus();
  };
  return <div className="fll-tabs" role="tablist" aria-label="Look" style={{ "--tabs":LOCKER_TABS.length, "--at":index }}>
    <i className="fll-tab-ink" aria-hidden="true" />
    {LOCKER_TABS.map(t => <button key={t.id} type="button" role="tab" data-tab={t.id} aria-selected={tab === t.id}
      tabIndex={tab === t.id ? 0 : -1} className={tab === t.id ? "is-on" : ""} onKeyDown={keys}
      onClick={() => onTab(t.id)}>{t.name}</button>)}
  </div>;
}

function CritterGrid({ entrant, groom, onPick }) {
  return <ul className="fll-critters">
    {lockerOptions("critter", { groom }).map(c => {
      const on = entrant.look.critter === c.id;
      return <li key={c.id}>
        <button type="button" className={`fll-tile${on ? " is-on" : ""}`} aria-pressed={on} onClick={() => onPick("critter", c.id)}>
          <span className="fll-tile-art"><Portrait entrant={critterTile(entrant, c.id)} size={58} />{on && <CheckBadge />}</span>
          <span className="fll-tile-name">{c.name}</span>
        </button>
      </li>;
    })}
  </ul>;
}

function FloatieGrid({ entrant, onPick }) {
  return <ul className="fll-floaties">
    {FLOATIES.map(f => {
      const on = entrant.look.floatie === f.id;
      return <li key={f.id}>
        <button type="button" className="fll-card-button" aria-pressed={on} onClick={() => onPick("floatie", f.id)}>
          <FloatieCard floatie={f} selected={on} />
        </button>
      </li>;
    })}
  </ul>;
}

function ChipGrid({ kind, entrant, groom, onPick }) {
  return <ul className={`fll-chips is-${kind}`}>
    {lockerOptions(kind, { groom }).map(option => {
      const on = entrant.look[kind] === option.id;
      return <li key={option.id}>
        <button type="button" className={`fll-chip${on ? " is-on" : ""}${option.groom ? " is-groom" : ""}`} aria-pressed={on}
          onClick={() => onPick(kind, option.id)}>
          <LookGlyph kind={kind} id={option.id} /><span>{option.name}</span>
        </button>
      </li>;
    })}
  </ul>;
}

export default function LockerPicker({ look = {}, onChange = () => {}, groom = false, color = null, name = "", photo = null,
  number = null, skin = null, initialTab = "critter" }) {
  const clean = lockerLook(look, { groom });
  const entrant = lockerEntrant({ look:clean, color, name, photo, number, skin, groom });
  const floatie = floatieOf(clean.floatie);
  const [tab, setTab] = useState(LOCKER_TABS.some(t => t.id === initialTab) ? initialTab : "critter");
  const [dir, setDir] = useState(0);
  const [pop, setPop] = useState(0);
  /* the floatie before the last switch, so its stats can move from there */
  const from = useRef({ id:clean.floatie, key:0 });
  const shown = useRef(clean.floatie);
  if (shown.current !== clean.floatie) {
    from.current = { id:shown.current, key:from.current.key + 1 };
    shown.current = clean.floatie;
  }
  useEffect(() => { preloadPortraits(); }, []);
  const onTab = next => {
    if (next === tab) return;
    const a = LOCKER_TABS.findIndex(t => t.id === tab), b = LOCKER_TABS.findIndex(t => t.id === next);
    setDir(b > a ? 1 : -1);
    setTab(next);
  };
  const onPick = (kind, id) => {
    const next = pickLook(clean, kind, id, { groom });
    if (!next) return;
    tapTick();
    setPop(n => n + 1);
    onChange(next);
  };
  return <div className="fll-root fll-locker" style={{ "--fll-c":entrant.color }}>
    <Hero entrant={entrant} floatie={floatie} from={from.current.id} moveKey={from.current.key} pop={pop} />
    <Tabs tab={tab} onTab={onTab} />
    <div className="fll-panel" role="tabpanel" aria-label={LOCKER_TABS.find(t => t.id === tab)?.name} key={tab}
      data-dir={dir > 0 ? "next" : dir < 0 ? "back" : "none"}>
      {tab === "critter" && <CritterGrid entrant={entrant} groom={groom} onPick={onPick} />}
      {tab === "floatie" && <FloatieGrid entrant={entrant} onPick={onPick} />}
      {(tab === "hat" || tab === "shades" || tab === "pose") && <ChipGrid kind={tab} entrant={entrant} groom={groom} onPick={onPick} />}
    </div>
  </div>;
}
