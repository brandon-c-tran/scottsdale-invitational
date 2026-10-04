/* Development-only rehearsal of the guest surfaces that live outside Home
   and Bets: the player card (front and season back), the profile sheet
   with jersey and win song, the awards ballot, a team MVP vote, Where and
   When on the phone, poker Table view, photos, and every check-in step.
   Sample state is built in memory with the real reducers (qaAdvance and
   the actions); nothing connects to the tournament.
   ?surface=card|back|profile|awards|awards-results|mvp|geo|geo-reveal|table|photos|checkin&step=-1..5&section=card|jersey|travel|walkout */
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { EMPTY_STATE, ROSTER, CHIP_COLORS, CHIP_SKINS, BUILTIN_EVENTS, computeStandings, allEventsOf } from "../shared/core.js";
import { projectPrompts } from "../shared/prompts.js";
import { applyAction } from "../worker/actions.js";
import { PlayerIdentityProvider } from "../src/features/identity/PlayerIdentityContext.js";
import { PlayerSheet } from "../src/features/profile/PlayerSheet.jsx";
import { PlayerPass } from "../src/features/profile/PlayerPass.jsx";
import { ProfileSheet } from "../src/App.jsx";
import { Shell } from "../src/ui/Shell.jsx";
import { AwardsBallot, AwardsResults } from "../src/features/awards/AwardsHome.jsx";
import { awardResults } from "../shared/prompts.js";
import { MvpHome } from "../src/features/mvp/MvpHome.jsx";
import { GeoPlaySheet, GeoHome } from "../src/features/geo/GeoPlay.jsx";
import { TableView } from "../src/features/poker/TableView.jsx";
import { PhotoDesk } from "../src/features/photos/PhotoDesk.jsx";
import { Onboarding } from "../src/features/check-in/Onboarding.jsx";

const query = new URLSearchParams(location.search);
const surface = query.get("surface") || "card";
const me = ROSTER[0];
const LOCAL = { isGm:true, qa:true, progressReset:true, environment:"local" };
const ok = (state, type, payload, ctx) => {
  const result = applyAction(state, type, payload, ctx);
  if (!result.ok) console.warn(type, result.error);
  return result;
};
const reach = target => {
  const state = structuredClone(EMPTY_STATE);
  ok(state, "qaAdvance", { target, seed:7 }, LOCAL);
  return state;
};
/* a drawn head and shoulders, so the card's photo window has a portrait */
const portrait = (hue = "#c98a5b", shirt = "#2a3b6e") => `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#8fa3b8"/>
  <circle cx="100" cy="82" r="40" fill="${hue}"/><path d="M28 200c6-48 38-70 72-70s66 22 72 70z" fill="${shirt}"/>
  <path d="M60 70c4-30 30-42 52-38 22 4 32 22 30 40-10-14-30-18-52-14-14 2-24 6-30 12z" fill="#3a2a20"/></svg>`)}`;
const dress = state => {
  ROSTER.forEach((player, index) => {
    state.profiles[player] = { display:player, num:index + 1, color:CHIP_COLORS[(index * 3) % CHIP_COLORS.length].hex,
      skin:CHIP_SKINS[index % CHIP_SKINS.length], ...state.profiles[player] };
  });
  state.profiles[me] = { ...state.profiles[me], walkoutTrack:{ name:"Mr. Brightside", artists:["The Killers"], durationMs:222000,
    trackId:"t1", url:"#", startMs:65000 } };
  return state;
};

function cardState() {
  return dress(reach("session:sap"));
}
function awardsState(revealed) {
  const state = dress(structuredClone(EMPTY_STATE));
  state.live = true;
  ok(state, "promptPublish", { ballot:{ id:"bawards1", kind:"awards", questions:[
    { id:"qfraud", title:"Fraud of the weekend", nominees:null, allowSelf:false },
    { id:"qclutch", title:"Most clutch", nominees:[ROSTER[1], ROSTER[2], ROSTER[3]], allowSelf:false },
    { id:"qhost", title:"Best host", nominees:[me, ROSTER[1]], allowSelf:true },
  ] } }, { isGm:true, player:me, deviceId:"gm", actionId:"pub" });
  ok(state, "promptRespond", { id:"bawards1", questionId:"qfraud", choice:ROSTER[4] }, { player:me, deviceId:"d", actionId:"v1" });
  if (revealed) {
    ROSTER.forEach((player, i) => ok(state, "promptRespond", { id:"bawards1", questionId:"qfraud", choice:i % 2 ? ROSTER[4] : ROSTER[5] },
      { player, deviceId:`d${i}`, actionId:`r${i}` }));
    ok(state, "promptClose", { id:"bawards1" }, { isGm:true, player:me, deviceId:"gm", actionId:"close" });
    ok(state, "promptReveal", { id:"bawards1" }, { isGm:true, player:me, deviceId:"gm", actionId:"rev" });
  }
  state.prompts = projectPrompts(state.prompts, { player:me });
  return state;
}
function mvpState() {
  const state = dress(structuredClone(EMPTY_STATE));
  state.live = true;
  const team = [me, ROSTER[1], ROSTER[2]];
  state.results.volley = { ts:1, slots:[team, [ROSTER[3], ROSTER[4], ROSTER[5]]] };
  state.mvp = { volley:{ id:"mvp-1", team, openedAt:Date.now(), closesAt:Date.now() + 42000, voted:1, mine:null } };
  return state;
}
const ROUNDS = [
  { id:"gaaaaaa1", photo:{ id:"gphoto01", w:1600, h:1200 }, lat:37.8199, lng:-122.4783, place:"Golden Gate Bridge",
    when:"2019-07-04T21", caption:"Fourth of July" },
  { id:"gaaaaaa2", photo:{ id:"gphoto02", w:1200, h:1600 }, lat:40.758, lng:-73.9855, place:"Times Square", when:"2021-12-31T23" },
];
function geoState(reveal) {
  const state = dress(structuredClone(EMPTY_STATE));
  const gm = id => ({ isGm:true, player:ROSTER[12], deviceId:"gm", actionId:id });
  ROUNDS.forEach((round, i) => ok(state, "geoSaveRound", round, gm(`s${i}`)));
  ok(state, "announceEvent", { evId:"where", startWeekend:true }, gm("ann"));
  const ev = allEventsOf(state).find(item => item.id === "where");
  const contest = { id:state.eventOps?.where?.contest?.id, revision:state.eventOps?.where?.contest?.revision };
  ok(state, "lockAndStart", { evId:"where", contestId:contest.id, contestRevision:contest.revision }, gm("lock"));
  ok(state, "geoStart", { evId:"where" }, gm("start"));
  const roundId = state.geo?.order?.[0];
  ok(state, "geoGuess", { roundId, lat:37.6, lng:-122.3, when:"2019-07-04T18", done:reveal }, { player:me, deviceId:"d", actionId:"g1" });
  if (reveal) {
    ok(state, "geoGuess", { roundId, lat:34.05, lng:-118.24, when:"2018-07-04T20", done:true }, { player:ROSTER[1], deviceId:"d1", actionId:"g2" });
    ok(state, "geoReveal", { evId:"where", roundId }, gm("rev"));
  }
  return { state, ev };
}
function tableState() {
  const state = dress(reach("poker:live"));
  return state;
}
function photoState() {
  const state = dress(structuredClone(EMPTY_STATE));
  state.live = true;
  state.moments = Array.from({ length:7 }, (_, i) => ({ id:`m0000000000${i}`, by:ROSTER[i % 4], at:Date.now() - i * 60000, w:1600, h:1200 }));
  return state;
}

function Preview() {
  const [state, setState] = useState(() => {
    if (surface === "awards") return awardsState(false);
    if (surface === "awards-results") return awardsState(true);
    if (surface === "mvp") return mvpState();
    if (surface === "geo" || surface === "geo-reveal") return geoState(surface === "geo-reveal").state;
    if (surface === "table") return tableState();
    if (surface === "photos") return photoState();
    if (surface === "checkin") {
      const fresh = structuredClone(EMPTY_STATE);
      ROSTER.forEach((player, index) => { if (index % 3) fresh.profiles[player] = { color:CHIP_COLORS[index].hex, skin:"ticks" }; });
      fresh.profiles[me] = { display:me, num:7, color:CHIP_COLORS[6].hex, skin:"crown" };
      return fresh;
    }
    if (surface === "profile") {
      const live = cardState();
      live.profiles[me] = { ...live.profiles[me], backName:"BRANDON", size:"L", venmo:"brandon-t", drinking:true };
      return live;
    }
    return cardState();
  });
  const standings = computeStandings(state);
  const events = allEventsOf(state);
  const step = Number(query.get("step") ?? 0);
  const [stepNow, setStep] = useState(step);
  useEffect(() => {
    if (surface !== "back") return undefined;
    const timer = setTimeout(() => document.querySelectorAll(".fd-pass").forEach(card => card.click()), 300);
    return () => clearTimeout(timer);
  }, []);
  const noop = async () => ({ ok:true });
  const photo = portrait();
  if (surface === "checkin") return <PlayerIdentityProvider profiles={state.profiles}><Shell environment="local preview" arrival>
    <Onboarding step={stepNow} me={stepNow > 0 ? me : null} state={state} pick={noop} saveProfile={noop} submitSeeds={noop}
      next={() => setStep(value => value + 1)} back={() => setStep(value => value - 1)} done={() => {}} onTv={() => {}} onChip={noop} />
  </Shell></PlayerIdentityProvider>;
  return <PlayerIdentityProvider profiles={state.profiles}><Shell environment="local preview">
    <div style={{ padding:"12px 16px 120px" }}>
      {(surface === "card" || surface === "back") && <>
        <PlayerPass state={state} p={ROSTER[2]} photo={photo} viewer={me} events={events} standings={standings} />
        <PlayerPass state={state} p={ROSTER[5]} photo={portrait("#8a5a3c", "#7a1f2b")} viewer={me} events={events} standings={standings} compact />
      </>}
      {surface === "sheet" && <PlayerSheet state={state} me={me} p={ROSTER[2]} standings={standings} events={events}
        onClose={() => {}} onDuel={noop} />}
      {surface === "profile" && <ProfileSheet state={state} me={me} onClose={() => {}} save={noop} onChip={noop}
        initialSection={query.get("section") || "card"} spotifyCatalogEnabled songSnippets />}
      {surface === "awards" && <AwardsBallot state={state} me={me} onVote={noop} initiallyOpen />}
      {surface === "awards-results" && <AwardsResults state={state} rows={awardResults(state)} onPlayer={() => {}} now={0} />}
      {surface === "mvp" && <MvpHome state={state} me={me} events={events} onVote={noop} />}
      {(surface === "geo" || surface === "geo-reveal") && <>
        <GeoHome state={state} me={me} onOpen={() => {}} />
        <GeoPlaySheet state={state} me={me} onGuess={noop} />
      </>}
      {surface === "table" && <TableView state={state} me={state.poker?.seats?.[0] || me} onClose={() => {}} />}
      {surface === "photos" && <PhotoDesk state={state} me={me} />}
    </div>
  </Shell></PlayerIdentityProvider>;
}

createRoot(document.getElementById("root")).render(<Preview />);
export { portrait };
