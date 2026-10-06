import React, { useRef, useState } from "react";
import { EDITION } from "../../../shared/core.js";
import { GlassArt } from "../../ui/GlassArt.jsx";
import { useGlassTilt } from "../../ui/useGlassTilt.js";
import { Icon } from "../../ui/Icon.jsx";
import { FDMark } from "../../ui/Brand.jsx";
import { EventName } from "../../ui/OneSafe.jsx";
import { Sheet } from "../../ui/controls.jsx";
import { InstallHint } from "../check-in/InstallHint.jsx";
import { isStandalone } from "../check-in/install.js";
import { TrophyCup, trophyCup } from "./Trophy.jsx";
import { Keepsake } from "../results/Keepsake.jsx";
import { PhotoDesk, PhotoAddButton, usePhotoAdd } from "../photos/PhotoDesk.jsx";
import { PhotoGrid } from "../photos/PhotoGrid.jsx";
import { deskMoments } from "../photos/photoModel.js";
import { programCover } from "./programModel.js";
import { AwardsSheet, GamesSheet, HouseSheet, PayoutsSheet, RulesSheet, hasAwards } from "./ProgramSheets.jsx";
import "./weekend.css";
import "./program.css";

/* Weekend: the program. One scroll, read top to bottom like a printed
   program: the cover (the session's painting, what is on now and what is
   next by the live order, never a time), the story so far (the trophy's
   plates filling event by event), everyone's photos, then the back page
   (House, Rules, Games, Payouts, and Awards once there are any), each a
   sheet. Once the board is crowned the cover is the edition kept
   (Keepsake) and the program reads as the weekend that was. */

function ProgramCover({ cover, GameMark, onEvent }) {
  const paneRef = useRef(null);
  useGlassTilt(paneRef);
  const { lead, then } = cover;
  const open = ev => onEvent?.(ev);
  return <section ref={paneRef} className="fd-program-cover fd-glass-scene" aria-label={lead ? `${lead.label}: ${lead.event.name}` : EDITION.label}>
    <GlassArt depth clear />
    {lead ? <button type="button" className="fd-program-lead" onClick={() => open(lead.event)} disabled={!onEvent}
      aria-label={`${lead.label}: ${lead.event.name}`}>
      {/* what the card is: the event in play now, or the next (first) one */}
      <span className="fd-program-cue" aria-hidden="true">{lead.live && <i className="fd-insert is-live fd-beat-dot" />}
        {lead.live ? "Now" : lead.label === "First" ? "First event" : "Next"}</span>
      <span className="fd-program-title" aria-hidden="true">
        {GameMark && <span className="fd-program-mark"><GameMark id={lead.event.game} variant={lead.event.variant} size={44} /></span>}
        <span className="fd-show is-lead fd-glass-letter"><EventName name={lead.event.name} /></span>
      </span>
    </button> : <div className="fd-program-lead is-edition">
      <span className="fd-show is-lead fd-glass-letter">{EDITION.label}</span>
    </div>}
    {/* the next event, small under the lead: the composition says "then" */}
    {then && <button type="button" className="fd-program-then fd-glass-window" onClick={() => open(then.event)} disabled={!onEvent}
      aria-label={`${then.label}: ${then.event.name}`}>
      <small className="fd-program-then-label" aria-hidden="true">Then</small>
      {GameMark && <GameMark id={then.event.game} variant={then.event.variant} size={28} />}
      <b className="fd-show" aria-hidden="true"><EventName name={then.event.name} /></b>
      {onEvent && <Icon name="next" size={18} />}
    </button>}
  </section>;
}

function ProgramPhotos({ state, me, gm, onPlayer, onAll }) {
  const list = deskMoments(state, { gm });
  const adder = usePhotoAdd();
  if (!list.length && !me) return null;
  return <section className="fd-program-section fd-program-photos" aria-labelledby="fd-program-photos">
    <div className="fd-program-head">
      <h2 id="fd-program-photos">Photos</h2>
      {list.length > 0 && <button type="button" className="fd-program-link" onClick={onAll} aria-label={`All ${list.length} photos`}>
        All {list.length}<Icon name="next" size={18} /></button>}
      {me && list.length > 0 && <PhotoAddButton adder={adder} label="Add" />}
      {me && adder.field}
    </div>
    {adder.line && <p className="fd-photo-line" role="status">{adder.line}</p>}
    {list.length > 0
      ? <PhotoGrid state={state} moments={list} me={me} gm={gm} onPlayer={onPlayer} limit={6} onMore={onAll} />
      : <button type="button" className="fd-program-first-photo" onClick={adder.open} disabled={!!adder.step} aria-busy={!!adder.step || undefined}>
        <Icon name="camera" size={36} /><span>{adder.step ? `Adding ${adder.step.at} of ${adder.step.total}` : "Add photos"}</span></button>}
  </section>;
}

const TILES = [["house", "House"], ["rules", "Rules"], ["games", "Games"], ["payouts", "Payouts"]];

export function Guide({ events, state, me, onProfile, GameMark, standings, gm = false, onPlayer, onBracket, onEvent, photos = null }) {
  const st = state || {};
  const cover = programCover(st, events);
  const kept = cover.mode === "kept";
  const [sheet, setSheet] = useState(null);
  const cup = trophyCup(st, events);
  const tiles = hasAwards(st) ? [...TILES, ["awards", "Awards"]] : TILES;
  const eventOf = id => events.find(ev => ev.id === id);
  const openPlate = onEvent ? id => { const ev = eventOf(id); if (ev) onEvent(ev); } : null;
  const close = () => setSheet(null);

  return <div className="fd-weekend fd-program">
    <h1 className="fd-weekend-sr">Weekend</h1>
    {kept
      ? <Keepsake state={st} events={events} standings={standings} me={me} gm={gm} onPlayer={onPlayer} onBracket={onBracket} photos={photos}
        onPlate={openPlate} />
      : <ProgramCover cover={cover} GameMark={GameMark} onEvent={onEvent} />}

    {/* the back page's index right under the cover: the house, the rules,
        the games and the payouts are one tap from the top */}
    <nav className={`fd-program-index${tiles.length % 2 ? " is-odd" : ""}`} aria-label="Weekend reference">
      {tiles.map(([id, label]) => <button key={id} type="button" className="fd-program-tile" onClick={() => setSheet(id)}>
        <Icon name={id} size={34} /><span>{label}</span></button>)}
    </nav>

    {!kept && <section className="fd-program-section fd-program-trophy" aria-labelledby="fd-program-trophy">
      {/* the cup's own plates show how far the weekend has come */}
      <div className="fd-program-head"><h2 id="fd-program-trophy">Trophy</h2></div>
      <TrophyCup state={st} events={events} cup={cup} onPlate={openPlate} />
    </section>}

    <ProgramPhotos state={st} me={me} gm={gm} onPlayer={onPlayer} onAll={() => setSheet("photos")} />

    {!isStandalone() && <details className="fd-weekend-install">
      <summary><FDMark size={24} /><span>Install Field Day</span>
        <Icon name="expand" size={18} className="fd-weekend-install-toggle" /></summary><InstallHint />
    </details>}

    {sheet === "house" && <HouseSheet state={st} me={me} onProfile={onProfile ? () => { close(); onProfile(); } : null} onClose={close} />}
    {sheet === "rules" && <RulesSheet onClose={close} />}
    {sheet === "games" && <GamesSheet events={events} GameMark={GameMark} onClose={close} />}
    {sheet === "payouts" && <PayoutsSheet events={events} GameMark={GameMark} onClose={close} />}
    {sheet === "awards" && <AwardsSheet state={st} onPlayer={onPlayer} onClose={close} />}
    {sheet === "photos" && <Sheet title="Photos" onClose={close} className="fd-program-sheet">
      <PhotoDesk state={st} me={me} gm={gm} onPlayer={onPlayer} /></Sheet>}
  </div>;
}
