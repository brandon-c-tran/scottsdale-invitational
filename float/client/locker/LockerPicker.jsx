/* The look picker (float/PROTOCOL.md "Components", float/GROOVE.md "The art
   pipeline", "Looks, the Groove"): <LockerPicker look onChange groom />, a
   character select in a phone sheet. The rider stands in the light at the
   top, their critter in their own colour with what they wear; below, tabs:
   Critter (the 13, and Winnie for the groom alone: crittersFor), Hat (the
   crown the groom's alone), Glasses, and Tee only with a photo (the photo
   tee prints it), each option a portrait of the rider's critter wearing
   it. A pick lands at once: onChange(nextLook) with a whole legal look,
   and the rider hops. Poses and floatie designs are hidden; a look keeps
   them.

   Optional, for the preview: color, name, photo, number, skin (the rider's
   own colour and chip). Without them the rider stands in a neutral colour.
   tone "light" draws it on the Groove's paper (the join, the lobby).
   It positions nothing fixed and brings its own styles (fll-), so it sits
   in Field Day's Profile, the join and the lobby alike. */
import React, { useEffect, useRef, useState } from "react";
import { tapTick } from "../../../src/lib/haptics.js";
import Portrait from "./Portrait.jsx";
import { CheckBadge } from "./LockerIcons.jsx";
import { Critter } from "../controller/art.jsx";
import { critterName, critterTile, lockerEntrant, lockerLook, lockerOptions, lockerTabs, lookTile, optionName, pickLook } from "./lockerModel.js";
import { preloadPortraits } from "./portrait.js";
import "./locker.css";

const reducedMotion = () => { try { return !!globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches; } catch { return false; } };

function Hero({ entrant, pop, tab }) {
  const art = useRef(null);
  const [happy, setHappy] = useState(false);
  useEffect(() => {
    if (!pop) return undefined;
    setHappy(true);
    const id = setTimeout(() => setHappy(false), 700);
    return () => clearTimeout(id);
  }, [pop]);
  /* a pick: the rider hops in the light (a squash, a lift, a settle) */
  useEffect(() => {
    const el = art.current;
    if (!pop || !el || typeof el.animate !== "function" || reducedMotion()) return;
    el.animate([{ transform:"translateY(0) scale(1, 1)" }, { transform:"translateY(2px) scale(1.06, 0.92)", offset:0.18 },
      { transform:"translateY(-16px) scale(0.97, 1.04)", offset:0.5 }, { transform:"translateY(0) scale(1, 1)" }],
      { duration:420, easing:"cubic-bezier(0.33, 1, 0.68, 1)" });
  }, [pop]);
  const name = critterName(entrant.look.critter);
  /* what the rider wears, under the critter's name */
  const worn = ["hat", "shades", "shirt"].map(kind => entrant.look[kind] && entrant.look[kind] !== "none" && (kind !== "shirt" || entrant.photo)
    ? optionName(kind, entrant.look[kind]) : null).filter(Boolean);
  return <div className="fll-hero">
    <div className="fll-stage" aria-hidden="true"><i className="fll-spot" /><i className="fll-ripple" key={pop} /></div>
    <div className="fll-hero-art" ref={art} role="img" aria-label={name}>
      <Critter entrant={entrant} pose={happy ? "nice" : "idle"} size={150} />
    </div>
    <div className="fll-hero-text">
      <b className="fll-hero-name" key={entrant.look.critter}>{name}</b>
      {worn.length > 0 && <span className="fll-hero-worn" key={`${tab}:${worn.join(",")}`}>{worn.join(" · ")}</span>}
    </div>
  </div>;
}

function CritterGrid({ entrant, groom, onPick }) {
  return <ul className="fll-critters">
    {lockerOptions("critter", { groom }).map(c => {
      const on = entrant.look.critter === c.id;
      return <li key={c.id}>
        <button type="button" className={`fll-tile${on ? " is-on" : ""}${c.groom ? " is-groom" : ""}`} aria-pressed={on} onClick={() => onPick(c.id)}>
          <span className="fll-tile-art"><Portrait entrant={critterTile(entrant, c.id)} size={58} />{on && <CheckBadge />}</span>
          <span className="fll-tile-name">{c.name}</span>
        </button>
      </li>;
    })}
  </ul>;
}

/* a hat, glasses or the tee: the rider's critter wearing each */
function LookGrid({ entrant, kind, groom, onPick }) {
  return <ul className="fll-critters">
    {lockerOptions(kind, { groom }).map(option => {
      const on = (entrant.look[kind] || "none") === option.id;
      return <li key={option.id}>
        <button type="button" className={`fll-tile is-${kind}${on ? " is-on" : ""}${option.groom ? " is-groom" : ""}`} aria-pressed={on} onClick={() => onPick(option.id)}>
          <span className="fll-tile-art"><Portrait entrant={lookTile(entrant, kind, option.id)} size={58}
            frame={kind === "hat" || kind === "shades" ? "head" : "full"} neutral={kind === "hat" || kind === "shades"} />{on && <CheckBadge />}</span>
          <span className="fll-tile-name">{option.name}</span>
        </button>
      </li>;
    })}
  </ul>;
}

function Tabs({ tabs, tab, onTab }) {
  const at = Math.max(0, tabs.findIndex(t => t.id === tab));
  return <div className="fll-tabs" role="tablist" style={{ "--tabs":tabs.length, "--at":at }}>
    <i className="fll-tab-ink" aria-hidden="true" />
    {tabs.map(t => <button key={t.id} type="button" role="tab" aria-selected={t.id === tab} className={t.id === tab ? "is-on" : ""}
      onClick={() => onTab(t.id)}>{t.name}</button>)}
  </div>;
}

/* tone: "dark" (Field Day's profile, the default) or "light" (the Groove's
   own pages: the standalone join, the lobby) */
export default function LockerPicker({ look = {}, onChange = () => {}, groom = false, color = null, name = "", photo = null,
  number = null, skin = null, tone = "dark" }) {
  const clean = lockerLook(look, { groom });
  const entrant = lockerEntrant({ look:clean, color, name, photo, number, skin, groom });
  const [pop, setPop] = useState(0);
  const tabs = lockerTabs({ photo });
  const [tabState, setTab] = useState({ id:"critter", dir:null });
  /* a tab that went away (the photo did) falls back to the critter */
  const tab = tabs.some(t => t.id === tabState.id) ? tabState.id : "critter";
  useEffect(() => { preloadPortraits(); }, []);
  const onPick = (kind, id) => {
    const next = pickLook(clean, kind, id, { groom });
    if (!next) return;
    tapTick();
    setPop(n => n + 1);
    onChange(next);
  };
  const onTab = id => {
    if (id === tab) return;
    tapTick();
    const from = tabs.findIndex(t => t.id === tab), to = tabs.findIndex(t => t.id === id);
    setTab({ id, dir:to > from ? "next" : "back" });
  };
  return <div className={`fll-root fll-locker${tone === "light" ? " fll-light" : ""}`} style={{ "--fll-c":entrant.color }}>
    <Hero entrant={entrant} pop={pop} tab={tab} />
    {tabs.length > 1 && <Tabs tabs={tabs} tab={tab} onTab={onTab} />}
    <div className="fll-panel" key={tab} data-dir={tabState.dir || undefined} role="tabpanel">
      {tab === "critter" ? <CritterGrid entrant={entrant} groom={groom} onPick={id => onPick("critter", id)} />
        : <LookGrid entrant={entrant} kind={tab} groom={groom} onPick={id => onPick(tab, id)} />}
    </div>
  </div>;
}
