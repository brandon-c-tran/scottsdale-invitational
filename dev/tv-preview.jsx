/* The real TV mode over the interface rehearsal's sample states, in memory.
   /dev/tv-preview.html?scenario=crowd-match (any efficiency-preview id).
   No socket: the transport is never started; the TV only renders. */
import React from "react";
import { createRoot } from "react-dom/client";
import { allEventsOf, computeStandings, wagerBoardEvent } from "../shared/core.js";
import { TVMode } from "../src/features/tv/TVMode.jsx";
import { PlayerIdentityProvider } from "../src/features/identity/PlayerIdentityContext.js";
import { Shell } from "../src/ui/Shell.jsx";
import { createEfficiencyFixture } from "./efficiency-preview.jsx";
import "../src/ui/shell.css";

const id = new URLSearchParams(location.search).get("scenario") || "crowd-match";
const { state } = createEfficiencyFixture(id);
const events = allEventsOf(state);
const standings = computeStandings(state);
const Spotlight = () => null;

createRoot(document.getElementById("tv")).render(
  <PlayerIdentityProvider profiles={state.profiles}><Shell tv environment="isolated preview">
    <TVMode standings={standings} state={state} events={events} onDeckEv={wagerBoardEvent(state, events)}
      allTied={false} champion={null} coChamps={[]} showControlEnabled={false} rankDeltas={{}}
      connection={{ ready:true, connected:true, status:"open", version:1 }} EventSpotlight={Spotlight}
      ceremony={null} onExit={() => {}} />
  </Shell></PlayerIdentityProvider>);
