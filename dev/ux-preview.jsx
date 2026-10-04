/* Development-only rehearsal. Uses the real wagering components and action
   validation in memory. No WebSocket, persistence, or remote data. */
import React, { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { EMPTY_STATE, ROSTER, CHIP_COLORS, BUILTIN_EVENTS, makeBracket, computeStandings } from "../shared/core.js";
import { applyAction } from "../worker/actions.js";
import { PlayerIdentityProvider } from "../src/features/identity/PlayerIdentityContext.js";
import { PlayerSheet } from "../src/features/profile/PlayerSheet.jsx";
import { Wagers } from "../src/features/wagers/Wagers.jsx";
import { Shell } from "../src/ui/Shell.jsx";
import { GameMark } from "../src/ui/GameMark.jsx";

const me = ROSTER[0];
function fixture(kind) {
  const state = structuredClone(EMPTY_STATE);
  state.live = true;
  state.profiles = Object.fromEntries(ROSTER.map((p,i) => [p,{ display:p, num:i+1, color:CHIP_COLORS[i*2].hex, skin:["ticks","crown","wave"][i%3] }]));
  state.onDeck = kind === "bracket" ? "8ball" : "putt";
  if (kind === "bracket") {
    state.draws["8ball"] = {id:"preview-draw",teams:Array.from({length:4},(_,i)=>({players:ROSTER.slice(i*2,i*2+2)}))};
    state.brackets["8ball"] = makeBracket(4);
  } else {
    state.wagers = [{id:"preview-stack",player:me,eventId:"putt",kind:"outright",pick:ROSTER[1],pickPlayers:[ROSTER[1]],
      stake:kind === "maxed" ? 500 : 200,chips:kind === "maxed" ? [{stake:500}] : [{stake:100},{stake:100}]}];
    if (kind === "locked") state.onDeck = null;
  }
  return state;
}
function Preview() {
  const [kind,setKind] = useState("winner");
  const [state,setState] = useState(() => fixture("winner"));
  const [player,setPlayer] = useState(null);
  const [failure,setFailure] = useState(false);
  const stateRef = useRef(state); stateRef.current = state;
  const action = async (type,payload) => {
    await new Promise(resolve => setTimeout(resolve,250));
    if (failure) return {ok:false,error:"Preview: connection failed. Try again."};
    const next = structuredClone(stateRef.current);
    const result = applyAction(next,type,payload,{player:me,deviceId:"ux-preview",actionId:crypto.randomUUID()});
    if (result.ok) { stateRef.current=next; setState(next); }
    return result;
  };
  const ev = BUILTIN_EVENTS.find(e=>e.id === (kind === "bracket" ? "8ball" : "putt"));
  return <PlayerIdentityProvider profiles={state.profiles}><Shell environment="local preview">
    <div style={{padding:"14px 18px",borderBottom:"1px solid var(--line)",display:"flex",gap:12,alignItems:"center",fontSize:12}}>
      <label>Sample data <select aria-label="Preview scenario" value={kind} onChange={e=>{setKind(e.target.value);setState(fixture(e.target.value));}} style={{padding:8,background:"var(--paper)",color:"var(--ink)"}}>
        <option value="winner">Winner</option><option value="bracket">Bracket</option><option value="locked">Locked</option><option value="maxed">At limit</option>
      </select></label>
      <label><input type="checkbox" checked={failure} onChange={e=>setFailure(e.target.checked)} />Fail next actions</label>
    </div>
    <Wagers state={state} me={me} standings={computeStandings(state)} events={BUILTIN_EVENTS} wagerEv={ev}
      onDeckEv={state.onDeck ? ev : null} GameMark={GameMark} onPlayer={setPlayer}
      onEvents={()=>window.location.assign('/')} onPick={wager=>action("placeWager",{wager})} onRetract={id=>action("retractWager",{id})} />
    <div className="fd-nav-wrap"><nav className="fd-nav" aria-label="Preview" style={{alignItems:"center",justifyContent:"space-between",paddingLeft:20,paddingRight:20,fontSize:12}}>
      <span style={{color:"var(--muted2)"}}>Betting preview</span><a href="/" style={{color:"var(--sun)",padding:"12px 0"}}>Open the app ›</a>
    </nav></div>
    {player && <PlayerSheet state={state} me={me} p={player} standings={computeStandings(state)} events={BUILTIN_EVENTS}
      onClose={()=>setPlayer(null)} onDuel={stake=>action("sendDuel",{to:player,game:"quickdraw",stake})} />}
  </Shell></PlayerIdentityProvider>;
}
const previewRoot = import.meta.hot?.data.root || createRoot(document.getElementById("root"));
previewRoot.render(<Preview />);
if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(data => { data.root = previewRoot; });
}
