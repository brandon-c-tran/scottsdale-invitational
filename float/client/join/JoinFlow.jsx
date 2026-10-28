/* The standalone join (/float/play, float/PROTOCOL.md "Pages"), in the
   Groove's look (GROOVE.md "The look"): the art's lobby scene behind, the
   rider's own critter on the water, paper and ink, the pixel face for the
   headings. The room code when the link had none, then the rider, then the
   controller.

   A returning phone sees its rider and one button: Join. A new one names
   its rider, picks a colour and a critter (the Locker), answers "Drinking?",
   and joins. The rider is kept on the phone (joinModel.js RIDER_KEY), a
   look changed in the lobby too. Join is a tap, so the sound unlocks there
   and the controller opens already able to play it. Leave comes back here. */
import React, { useEffect, useMemo, useRef, useState } from "react";
import FloatController from "../controller/FloatController.jsx";
import LockerPicker from "../locker/LockerPicker.jsx";
import Portrait from "../locker/Portrait.jsx";
import { Critter, usePreloadArt } from "../controller/art.jsx";
import { Scenery } from "../controller/parts.jsx";
import { floatDeviceId } from "../net.js";
import { critterName } from "../locker/lockerModel.js";
import { unlockSound } from "../controller/sound.js";
import { tapTick } from "../../../src/lib/haptics.js";
import { CODE_LENGTH, JOIN_COLORS, canJoin, cleanCode, cleanDraft, loadRider, riderOf, saveRider, withRoom } from "./joinModel.js";
import "../controller/controller.css";
import "./join.css";

function Back({ onBack, label = "Back" }) {
  return <button type="button" className="flj-back" onClick={() => { tapTick(); onBack(); }} aria-label={label}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
  </button>;
}

function Top({ room, onBack }) {
  return <div className="flj-top"><Back onBack={onBack} label="Another room" /><span className="flj-room" aria-label="Room code">{room.toUpperCase()}</span></div>;
}

function Code({ onCode }) {
  const [code, setCode] = useState("");
  const input = useRef(null);
  useEffect(() => { input.current?.focus({ preventScroll:true }); }, []);
  const change = event => {
    const next = cleanCode(event.target.value);
    setCode(next);
    if (next.length === CODE_LENGTH) { input.current?.blur(); onCode(next); }
  };
  return <section className="flj-screen flj-code">
    <div className="flj-code-main">
      <h1 className="flj-brand">Float</h1>
      <span className="flj-kicker" id="flj-code-label">Room code</span>
      <label className="flj-boxes" data-len={code.length}>
        {Array.from({ length:CODE_LENGTH }, (_, k) => <span key={k} className={`flj-box${k === code.length ? " is-next" : ""}${code[k] ? " is-on" : ""}`}
          aria-hidden="true">{code[k] ? code[k].toUpperCase() : ""}</span>)}
        <input ref={input} className="flj-code-input" value={code} onChange={change} inputMode="text" autoCapitalize="characters"
          autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="go" maxLength={8} aria-labelledby="flj-code-label" />
      </label>
    </div>
  </section>;
}

function Ready({ room, draft, groom, onJoin, onEdit, onBack }) {
  const entrant = { ...draft, ...(groom ? { groom:true } : {}) };
  return <section className="flj-screen flj-ready">
    <Top room={room} onBack={onBack} />
    <div className="flj-ready-main">
      <h1 className="flj-name">{draft.name}</h1>
      <span className="flj-chip">{critterName(draft.look.critter)}</span>
    </div>
    <div className="flj-float"><div className="flj-bob"><Critter entrant={entrant} size={280} /></div></div>
    <div className="flj-actions">
      <button type="button" className="flj-join" onClick={onJoin}>Join</button>
      <button type="button" className="flj-quiet" onClick={() => { tapTick(); onEdit(); }}>Change</button>
    </div>
  </section>;
}

function Edit({ room, draft, groom, setDraft, onJoin, onBack, onLocker }) {
  const ok = canJoin(draft);
  const set = patch => setDraft(d => ({ ...d, ...patch }));
  const entrant = { ...draft, name:draft.name || "?", ...(groom ? { groom:true } : {}) };
  return <section className="flj-screen flj-edit">
    <Top room={room} onBack={onBack} />
    <button type="button" className="flj-float is-small" onClick={() => { tapTick(); onLocker(); }} aria-label="Change critter">
      <span className="flj-bob"><Critter entrant={entrant} size={190} /></span>
    </button>
    <div className="flj-card">
      <label className="flj-field">
        <span>Name</span>
        <input value={draft.name} onChange={event => set({ name:event.target.value.slice(0, 16) })} maxLength={16}
          autoComplete="nickname" autoCapitalize="words" autoCorrect="off" spellCheck={false} enterKeyHint="done" />
      </label>
      <fieldset className="flj-field">
        <legend>Colour</legend>
        <div className="flj-colors">{JOIN_COLORS.map(color => <button key={color} type="button" className={`flj-swatch${draft.color === color ? " is-on" : ""}`}
          style={{ "--c":color }} aria-pressed={draft.color === color} aria-label={color}
          onClick={() => { tapTick(); set({ color }); }} />)}</div>
      </fieldset>
      <div className="flj-field">
        <span className="flj-label">Critter</span>
        <button type="button" className="flj-look" onClick={() => { tapTick(); onLocker(); }}>
          <Portrait entrant={{ ...entrant, photo:undefined, number:undefined }} size={44} />
          <span>{critterName(draft.look.critter)}</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>
      <fieldset className="flj-field">
        <legend>Drinking?</legend>
        <div className="flj-yesno">{[["Yes", true], ["No", false]].map(([label, value]) => <button key={label} type="button"
          className={draft.drinks === value ? "is-on" : ""} aria-pressed={draft.drinks === value}
          onClick={() => { tapTick(); set({ drinks:value }); }}>{label}</button>)}</div>
      </fieldset>
    </div>
    <div className="flj-actions is-pinned">
      <button type="button" className="flj-join" disabled={!ok} onClick={onJoin}>Join</button>
    </div>
  </section>;
}

function LockerSheet({ draft, setDraft, groom, onDone }) {
  return <section className="flj-screen flj-sheet">
    <div className="flj-top"><h2 className="flj-sheet-title">Critter</h2>
      <button type="button" className="flj-done" onClick={() => { tapTick(); onDone(); }}>Done</button></div>
    <div className="flj-sheet-body">
      <LockerPicker look={draft.look} onChange={look => setDraft(d => ({ ...d, look }))} groom={groom} color={draft.color} name={draft.name}
        tone="light" />
    </div>
  </section>;
}

/* the page: the lobby scene behind everything, the rider's colour, their art fetched ahead */
function JoinPage({ draft, groom, children }) {
  usePreloadArt({ ...draft, ...(groom ? { groom:true } : {}) });
  return <div className="flj-root" style={{ "--me":draft.color }}>
    <div className="flj-backdrop" aria-hidden="true"><Scenery scene="lobby" /></div>
    {children}
  </div>;
}

/* initialRoom: from the link (or null for the code); connect: how to open
   the room (the mock for ?mock=1); skip: straight to the controller */
export default function JoinFlow({ initialRoom = null, connect = undefined, skip = false, defaultRider = null }) {
  const seed = useMemo(() => floatDeviceId(), []);
  /* the groom (a host that says so): his crown and his Winnie */
  const groom = !!defaultRider?.groom;
  const saved = useMemo(() => loadRider(undefined, { seed, groom }), [seed, groom]);
  const [room, setRoom] = useState(initialRoom);
  /* a new rider answers "Drinking?" themselves, whatever a host prefilled */
  const [draft, setDraft] = useState(() => saved || cleanDraft({ ...(defaultRider || {}), drinks:null }, { seed, groom }));
  const [step, setStep] = useState(() => !initialRoom ? "code" : skip ? "play" : saved ? "ready" : "edit");
  const [rider, setRider] = useState(() => skip ? riderOf(saved || cleanDraft({ ...(defaultRider || {}), drinks:true }, { seed, groom }), { groom }) : null);

  /* the room's code in the address, so a reload or a shared link lands here */
  const goRoom = code => {
    try { globalThis.history?.replaceState?.(null, "", withRoom(globalThis.location.href, code)); } catch {}
    setRoom(code);
    setStep(saved ? "ready" : "edit");
  };
  const toCode = () => {
    try { globalThis.history?.replaceState?.(null, "", withRoom(globalThis.location.href, null)); } catch {}
    setRoom(null);
    setStep("code");
  };
  const join = () => {
    if (!canJoin(draft)) return;
    tapTick();
    unlockSound();
    saveRider(draft);
    setRider(riderOf(draft, { groom }));
    setStep("play");
  };
  /* a look changed in the lobby is this phone's look from now on */
  const onLook = look => setDraft(d => {
    const next = { ...d, look };
    saveRider(next);
    return next;
  });

  if (step === "play" && rider && room) {
    return <FloatController room={room} rider={rider} connect={connect} onLook={onLook}
      onExit={() => { setStep("ready"); setRider(null); }} />;
  }
  return <JoinPage draft={draft} groom={groom}>
    {step === "code" && <Code onCode={goRoom} />}
    {step === "ready" && room && <Ready room={room} draft={draft} groom={groom} onJoin={join} onEdit={() => setStep("edit")} onBack={toCode} />}
    {step === "edit" && room && <Edit room={room} draft={draft} groom={groom} setDraft={setDraft} onJoin={join} onBack={toCode}
      onLocker={() => setStep("locker")} />}
    {step === "locker" && <LockerSheet draft={draft} setDraft={setDraft} groom={groom} onDone={() => setStep("edit")} />}
  </JoinPage>;
}
