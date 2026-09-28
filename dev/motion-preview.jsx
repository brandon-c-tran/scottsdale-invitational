/* Development-only motion rehearsal (M0, M1/M20, sheets). Real chrome,
   sheets and motion hooks against sample state in memory; frames are
   published by hand instead of by a socket, so each rule of the fresh-change
   gate can be tried: a fresh broadcast counts, a catch-up or a correction
   lands at once. No app connection, storage, or remote service. */
import React, { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { EMPTY_STATE, ROSTER, CHIP_COLORS } from "../shared/core.js";
import { publishFrame } from "../src/lib/frameGate.js";
import { MotionRoot, fly, signedChips, useCountUp } from "../src/lib/motion.js";
import { PlayerIdentityProvider } from "../src/features/identity/PlayerIdentityContext.js";
import { Avatar, BankChip } from "../src/features/identity/PlayerIdentity.jsx";
import { Shell } from "../src/ui/Shell.jsx";
import { AppHeader, AppNavigation } from "../src/ui/AppChrome.jsx";
import { Sheet } from "../src/ui/controls.jsx";
import { GameMark } from "../src/ui/GameMark.jsx";

const me = ROSTER[0];
const state = structuredClone(EMPTY_STATE);
state.live = true;
state.profiles = Object.fromEntries(ROSTER.map((player, index) => [player, {
  display:player, num:index + 1, color:CHIP_COLORS[(index * 2) % CHIP_COLORS.length].hex,
  skin:["ticks", "crown", "wave"][index % 3],
}]));
const control = { padding:"8px 10px", minHeight:44, background:"var(--paper)", color:"var(--ink)",
  border:"1px solid var(--line)", borderRadius:6, font:"inherit", fontSize:12 };
const fmt = n => Math.round(n).toLocaleString("en-US");

function Row({ player, pts }) {
  const { value, delta } = useCountUp(pts, { key:player });
  return <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 0", borderBottom:"1px solid var(--line)" }}>
    <Avatar state={state} p={player} size={34} />
    <strong style={{ flex:1 }}>{player}</strong>
    <span style={{ position:"relative", font:"700 24px/1 var(--fd-display)", fontVariantNumeric:"tabular-nums" }}>
      {fmt(value)}
      {delta && <span key={delta.id} className={`fd-motion-delta ${delta.amount > 0 ? "is-up" : "is-down"}`}
        style={{ position:"absolute", right:0, bottom:"100%", fontSize:16 }}>{signedChips(delta.amount)}</span>}
    </span>
  </div>;
}

function Preview() {
  const [pts, setPts] = useState(1800);
  const [connected, setConnected] = useState(true);
  const [sheet, setSheet] = useState(false);
  const [tab, setTab] = useState("bets");
  const version = useRef(1);
  const chip = useRef(null);
  const change = (amount, frame) => {
    publishFrame({ version:++version.current, lastAction:"saveResult", ...frame });
    setPts(value => value + amount);
  };
  return <PlayerIdentityProvider profiles={state.profiles}>
    <Shell environment="preview">
      <AppHeader state={state} me={me} connected={connected} loaded GameMark={GameMark}
        wagerEv={{ name:"8-Ball Doubles", game:"8ball" }} wagerMarketOpen onBets={() => {}}
        onHome={() => {}} onProfile={() => setSheet(true)} onMenu={() => {}} />
      <main className="fd-main" style={{ padding:"8px 20px 120px" }}>
        <Row player={me} pts={pts} />
        <div style={{ display:"flex", flexWrap:"wrap", gap:8, margin:"16px 0" }}>
          <button type="button" style={control} data-act="fresh" onClick={() => change(400, { fresh:true })}>Fresh +400</button>
          <button type="button" style={control} data-act="catchup" onClick={() => change(400, { fresh:false, reason:"first" })}>Catch-up +400</button>
          <button type="button" style={control} data-act="correction" onClick={() => change(-400, { fresh:false, correction:true, reason:"correction" })}>Correction −400</button>
          <button type="button" style={control} data-act="link" onClick={() => setConnected(value => !value)}>{connected ? "Drop link" : "Restore link"}</button>
          <button type="button" style={control} data-act="sheet" onClick={() => setSheet(true)}>Open sheet</button>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <span ref={chip} style={{ display:"inline-flex" }}><BankChip p={me} size={46} val={200} /></span>
          <button type="button" style={control} data-act="fly-home" onClick={() => fly(chip.current, "tab:home", { arc:90, land:true })}>Fly to Home</button>
          <button type="button" style={control} data-act="fly-profile" onClick={() => fly(chip.current, "header:profile", { arc:40, land:true, duration:520 })}>Fly to profile</button>
        </div>
      </main>
      <AppNavigation tab={tab} onTab={setTab} badges={{ board:"a duel is waiting" }} />
      {sheet && <Sheet title="Sheet motion" subtitle="Rises over a fading scrim" onClose={() => setSheet(false)}>
        {Array.from({ length:8 }, (_, index) => <p key={index} style={{ color:"var(--muted2)", fontSize:13 }}>
          Row {index + 1}</p>)}
      </Sheet>}
      <MotionRoot connected={connected} loaded />
    </Shell>
  </PlayerIdentityProvider>;
}

/* for scripted checks of the no-op paths */
window.__fdMotion = { fly, publishFrame };
const root = import.meta.hot?.data.root || createRoot(document.getElementById("root"));
if (import.meta.hot) import.meta.hot.data.root = root;
root.render(<Preview />);
