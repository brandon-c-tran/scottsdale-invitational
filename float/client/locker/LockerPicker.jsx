/* The look picker (float/PROTOCOL.md "Components", float/GROOVE.md "The art
   pipeline"): <LockerPicker look onChange groom />, a character select in a
   phone sheet. The rider stands in the light at the top, their critter in
   their own colour with its name; below, every critter they may pick as a
   portrait in that colour (the 13, and Winnie for the groom alone:
   crittersFor). A pick lands at once: onChange(nextLook) with a whole
   legal look, and the rider hops. Hats, shades, poses and floatie designs
   are hidden for now; a look keeps them.

   Optional, for the preview: color, name, photo, number, skin (the rider's
   own colour and chip). Without them the rider stands in a neutral colour.
   It positions nothing fixed and brings its own styles (fll-), so it sits
   in Field Day's Profile, the join and the lobby alike. */
import React, { useEffect, useRef, useState } from "react";
import { tapTick } from "../../../src/lib/haptics.js";
import Portrait from "./Portrait.jsx";
import { CheckBadge } from "./LockerIcons.jsx";
import { Critter } from "../controller/art.jsx";
import { critterName, critterTile, lockerEntrant, lockerLook, lockerOptions, pickLook } from "./lockerModel.js";
import { preloadPortraits } from "./portrait.js";
import "./locker.css";

const reducedMotion = () => { try { return !!globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches; } catch { return false; } };

function Hero({ entrant, pop }) {
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
  return <div className="fll-hero">
    <div className="fll-stage" aria-hidden="true"><i className="fll-spot" /><i className="fll-ripple" key={pop} /></div>
    <div className="fll-hero-art" ref={art} role="img" aria-label={name}>
      <Critter entrant={entrant} pose={happy ? "nice" : "idle"} size={136} />
    </div>
    <div className="fll-hero-text">
      <b className="fll-hero-name" key={entrant.look.critter}>{name}</b>
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

export default function LockerPicker({ look = {}, onChange = () => {}, groom = false, color = null, name = "", photo = null,
  number = null, skin = null }) {
  const clean = lockerLook(look, { groom });
  const entrant = lockerEntrant({ look:clean, color, name, photo, number, skin, groom });
  const [pop, setPop] = useState(0);
  useEffect(() => { preloadPortraits(); }, []);
  const onPick = id => {
    const next = pickLook(clean, "critter", id, { groom });
    if (!next) return;
    tapTick();
    setPop(n => n + 1);
    onChange(next);
  };
  return <div className="fll-root fll-locker" style={{ "--fll-c":entrant.color }}>
    <Hero entrant={entrant} pop={pop} />
    <CritterGrid entrant={entrant} groom={groom} onPick={onPick} />
  </div>;
}
