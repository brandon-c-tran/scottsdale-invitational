/* Where and When on the TV, on a live clock: the real TVMode over the real
   reducers, two photos played through guess -> reveal -> next, with the
   map's own events and the pins logged against one
   clock (performance.now()). scripts/geo-reveal-timing.mjs drives it in
   headless Chrome and prints the numbers. No socket, nothing stored. */
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import maplibregl from "maplibre-gl";
import { ROSTER, allEventsOf, computeStandings, resolveCurrentContest } from "../shared/core.js";
import { TVMode } from "../src/features/tv/TVMode.jsx";
import { publishFrame } from "../src/lib/frameGate.js";
import { PlayerIdentityProvider } from "../src/features/identity/PlayerIdentityContext.js";
import { Shell } from "../src/ui/Shell.jsx";
import { FIT_ARRIVE_CODE, FIT_GM, GEO_ROUNDS, act, dress, fresh } from "./fit/scenarios.js";
import "../src/ui/shell.css";

const params = new URLSearchParams(location.search);
const T = performance.now.bind(performance);
const log = window.__geoLog = [];
const note = (name, extra = {}) => log.push({ name, t:Math.round(T()), ...extra });

/* the map's own events and camera calls */
const tiles = window.__geoTiles = [];
const proto = maplibregl.Map.prototype;
const fire = proto.fire;
proto.fire = function (event, ...rest) {
  const type = typeof event === "string" ? event : event?.type;
  if (["load", "idle", "moveend"].includes(type)) note(`map:${type}`);
  /* each vector tile asked for (not one the map kept), and each one in */
  const tile = event?.tile?.tileID?.key;
  if (tile !== undefined && /dataloading$/.test(type)) tiles.push({ key:tile, start:Math.round(T()), end:Infinity });
  else if (tile !== undefined && /data$/.test(type)) {
    const open = tiles.find(item => item.key === tile && item.end === Infinity);
    if (open) open.end = Math.round(T());
  }
  return fire.call(this, event, ...rest);
};
for (const name of ["jumpTo", "easeTo", "flyTo"]) {
  const orig = proto[name];
  proto[name] = function (options, ...rest) {
    note(`map:${name}`, { zoom:+(options?.zoom ?? 0).toFixed(2), ms:options?.duration || 0 });
    return orig.call(this, options, ...rest);
  };
}
/* the pins, the loading shimmer and the cover */
new MutationObserver(records => {
  for (const record of records) {
    if (record.type === "attributes" && record.target.matches?.(".tv-geo-cover"))
      note(record.target.classList.contains("is-off") ? "cover:off" : "cover:on");
    record.addedNodes.forEach(node => {
      if (node.nodeType !== 1) return;
      if (node.matches?.(".fd-geo-marker") && node.isConnected) note("pin", { kind:node.dataset.kind });
      node.querySelectorAll?.(".fd-geo-marker").forEach(pin => pin.isConnected && note("pin", { kind:pin.dataset.kind }));
      if (node.matches?.(".fd-geo-map")) note("map:mounted");
    });
    record.removedNodes.forEach(node => {
      if (node.nodeType === 1 && node.matches?.(".fd-geo-map-loading")) note("map:ready");
      if (node.nodeType === 1 && node.matches?.(".fd-geo-map")) note("map:unmounted");
    });
  }
}).observe(document.documentElement, { subtree:true, childList:true, attributes:true, attributeFilter:["class"] });

const playerCtx = player => ({ isGm:false, player, deviceId:`timing-${player}`, actionId:`timing-${player}-${Math.random()}` });
const work = fresh("event:die:done");
const rounds = GEO_ROUNDS.slice(0, 2);
rounds.forEach(round => act(work, "geoSaveRound", structuredClone(round)));
act(work, "announceEvent", { evId:"where" });
const contest = resolveCurrentContest(work, allEventsOf(work).find(ev => ev.id === "where"));
act(work, "lockAndStart", { evId:"where", contestId:contest.id, contestRevision:contest.revision });
act(work, "geoStart", { evId:"where" });
dress(work);
const players = ROSTER.filter(p => p !== FIT_GM);
/* the first photo's guesses spread round the answer (the camera barely
   opens); the second's huddled far from it (the camera opens a long way,
   onto tiles the guesses' view never loaded) */
const guessAll = (round, r) => players.forEach((player, i) => act(work, "geoGuess", { roundId:round.id,
  ...(r === 0 ? { lat:round.lat + (i - 6) * 0.9, lng:round.lng + (i % 5) * 1.3 }
    : { lat:round.lat - 6 + (i - 6) * 0.08, lng:round.lng - 18 + (i % 5) * 0.12 }),
  when:round.when.replace(/T\d\d$/, `T${String((i * 5) % 24).padStart(2, "0")}`), done:true }, playerCtx(player)));

const GUESS_MS = Number(params.get("guess") || 6000), HOLD_MS = Number(params.get("hold") || 14000);
function Harness() {
  const [state, setState] = useState(() => structuredClone(work));
  useEffect(() => {
    const push = name => { note(name); setState(structuredClone(work)); };
    const steps = [];
    let at = 0;
    rounds.forEach((round, r) => {
      steps.push([at + 1000, () => { guessAll(round, r); push(`guesses:${r + 1}`); }]);
      steps.push([at + GUESS_MS, () => { act(work, "geoReveal", { roundId:round.id }); push(`reveal:${r + 1}`); }]);
      at += GUESS_MS + HOLD_MS;
      if (r < rounds.length - 1) steps.push([at, () => { act(work, "geoNext", { roundId:round.id }); push(`guess:${r + 2}`); }]);
    });
    steps.push([at, () => { window.__DONE__ = true; }]);
    note("guess:1");
    const timers = steps.map(([ms, fn]) => setTimeout(fn, ms));
    return () => timers.forEach(clearTimeout);
  }, []);
  const events = allEventsOf(state);
  const standings = computeStandings(state);
  return <PlayerIdentityProvider profiles={state.profiles}><Shell tv environment="isolated preview">
    <TVMode standings={standings} state={state} events={events} onDeckEv={null} allTied={false} champion={null} coChamps={[]}
      showControlEnabled={false} rankDeltas={{}} connection={{ ready:true, connected:true, status:"open", version:1 }}
      EventSpotlight={() => null} ceremony={null} onExit={() => {}} arriveCode={FIT_ARRIVE_CODE} />
  </Shell></PlayerIdentityProvider>;
}
publishFrame({ version:1, fresh:false });
createRoot(document.getElementById("tv")).render(<Harness />);
