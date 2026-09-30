/* Development-only rehearsal for results on YOUR phone: the chips-moved
   receipt (X2), your own chip shower (M19), and the crown with the last card
   (X5, M18 phone). Real components against sample state in memory; no app
   connection, storage, or remote service. ?scene=receipt|top|shower|crown|
   crown-other|card|quiet picks what plays on load; ?me= picks the viewer. */
import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { BUILTIN_EVENTS, CHIP_COLORS, EMPTY_STATE, ROSTER, computeStandings } from "../shared/core.js";
import { MotionRoot } from "../src/lib/motion.js";
import { PlayerIdentityProvider } from "../src/features/identity/PlayerIdentityContext.js";
import { Shell } from "../src/ui/Shell.jsx";
import { AppHeader, AppNavigation } from "../src/ui/AppChrome.jsx";
import { GameMark } from "../src/ui/GameMark.jsx";
import { GuestHome } from "../src/features/home/GuestHome.jsx";
import { chipSnapshot, resultMoment } from "../src/features/results/resultMoment.js";
import { ChipReceipt } from "../src/features/results/ChipReceipt.jsx";
import { ChipShower } from "../src/features/results/ChipShower.jsx";
import { LastCardLayer } from "../src/features/results/LastCard.jsx";
import { lastCardModel } from "../src/features/results/lastCard.js";
import { renderLastCardImage } from "../src/features/results/cardImage.js";
import { cardInk } from "../src/features/profile/PlayerPass.jsx";

const q = new URLSearchParams(location.search);
const events = BUILTIN_EVENTS;
const byId = id => events.find(event => event.id === id);
const H = 60 * 60 * 1000, FRI = Date.UTC(2026, 9, 31, 1, 0);
const base = () => {
  const state = structuredClone(EMPTY_STATE);
  state.live = true;
  state.profiles = Object.fromEntries(ROSTER.map((player, index) => [player, {
    display:player, num:index + 1, color:CHIP_COLORS[(index * 7 + 2) % CHIP_COLORS.length].hex,
    skin:["ticks", "crown", "wave", "dash", "star"][index % 5],
  }]));
  return state;
};
const [evan, khoa, sahil, adi, chiang] = ROSTER;
const me = q.get("me") || evan;

/* a whole weekend for the crown and the card */
function weekend() {
  const state = base();
  const place = (id, slots, at) => { state.results[id] = { slots, ts:at, revision:1 }; };
  place("putt", [[khoa], [evan], [adi]], FRI + H);
  place("bball1", [[evan], [sahil], [chiang]], FRI + 14 * H);
  place("where", [[sahil], [khoa], [evan]], FRI + 19 * H);
  place("ragecage", [[evan], [chiang], [khoa]], FRI + 26 * H);
  place("beerio", [[khoa], [adi], [sahil]], FRI + 27 * H);
  state.wagers = [
    { id:"b1", player:evan, kind:"outright", eventId:"where", pick:sahil, pickPlayers:[sahil], stake:300, mult:2 },
    { id:"b2", player:evan, kind:"outright", eventId:"beerio", pick:adi, pickPlayers:[adi], stake:400, mult:2 },
    { id:"b3", player:evan, kind:"outright", eventId:"putt", pick:khoa, pickPlayers:[khoa], stake:200, mult:2 },
  ];
  const duel = (id, from, to, a, b, at) => ({ id, from, to, stake:200, status:"open", ts:at,
    runs:{ [from]:{ ms:a, ts:at }, [to]:{ ms:b, ts:at + 60000 } } });
  state.duels = [duel("q1", evan, adi, 240, 310, FRI + 3 * H), duel("q2", chiang, evan, 280, 330, FRI + 16 * H),
    duel("q3", evan, khoa, 250, 270, FRI + 22 * H)];
  state.results.poker = { slots:[[sahil], [evan], []], seats:ROSTER, ts:FRI + 31 * H, revision:1,
    stacks:Object.fromEntries(ROSTER.map((p, i) => [p, p === sahil ? 6000 : p === evan ? 1500 : Math.max(0, 2600 - i * 225)])) };
  state.frozen = true;
  return state;
}

/* one fresh result for the receipt */
function receiptStates() {
  const before = base();
  before.results.putt = { slots:[[khoa], [adi], [chiang]], ts:FRI, revision:1 };
  before.wagers = [
    { id:"w1", player:me, kind:"outright", eventId:"where", pick:khoa, pickPlayers:[khoa], stake:200, mult:2 },
    { id:"w2", player:me, kind:"outright", eventId:"where", pick:sahil, pickPlayers:[sahil], stake:200, mult:2 },
  ];
  const after = structuredClone(before);
  after.results.nine = { slots:[[khoa], [me], [adi]], ts:FRI + H, revision:1 };
  return { before, after };
}

/* the saved image, as Save card would hand it to the share sheet */
function SavedImage() {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    const state = weekend();
    const player = q.get("me") || evan;
    const color = state.profiles[player].color;
    renderLastCardImage(lastCardModel(state, player, { events }), { color, ink:cardInk(color) })
      .then(blob => blob && setUrl(URL.createObjectURL(blob)));
  }, []);
  return url ? <img src={url} alt="" style={{ display:"block", width:"100%" }} /> : null;
}

function Preview() {
  const scene = q.get("scene") || "receipt";
  const crown = scene.startsWith("crown") || scene === "card";
  const { before, after } = useMemo(receiptStates, []);
  const state = useMemo(() => crown ? weekend() : after, [crown, after]);
  const standings = useMemo(() => computeStandings(state), [state]);
  const viewer = scene === "crown" ? computeStandings(weekend())[0].player : me;
  const [moment, setMoment] = useState(null);
  const [shower, setShower] = useState(0);
  const [tab, setTab] = useState(scene === "top" ? "bets" : "board");
  useEffect(() => {
    const t = setTimeout(() => {
      if (scene === "receipt" || scene === "top" || scene === "shower") {
        const found = resultMoment({ prev:chipSnapshot(before, me, events, computeStandings(before)),
          next:chipSnapshot(after, me, events, computeStandings(after)), prevState:before, state:after, events,
          frame:{ fresh:true } });
        setMoment(found);
        if (found?.celebrate) setShower(n => n + 1);
      }
      if (scene === "static") setMoment({ ...resultMoment({ prev:chipSnapshot(before, me, events, computeStandings(before)),
        next:chipSnapshot(after, me, events, computeStandings(after)), prevState:before, state:after, events,
        frame:{ fresh:true } }), animate:false });
    }, Number(q.get("delay") || 300));
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <PlayerIdentityProvider profiles={state.profiles}>
    <Shell environment="preview">
      <AppHeader state={state} me={viewer} connected loaded GameMark={GameMark} onHome={() => {}} onProfile={() => {}} onMenu={() => {}} />
      <main className="fd-main" style={{ padding:"0 20px 120px" }}>
        <GuestHome state={state} me={viewer} events={events} standings={standings} GameMark={GameMark}
          onPlayer={() => {}} onOpen={() => {}} onBets={() => {}} onStandings={() => {}} onEvents={() => {}}
          onLastCard={crown ? () => {} : undefined} deltas={{}} />
      </main>
      <AppNavigation tab={tab} onTab={setTab} />
      {moment && <ChipReceipt moment={moment} dock={scene === "top" ? "top" : "bottom"}
        onDismiss={() => q.get("hold") ? null : setMoment(null)} onStandings={() => {}} onSettled={() => {}} />}
      <ChipShower burst={shower} p={me} />
      {crown && <LastCardLayer state={state} me={viewer} events={events} standings={standings}
        mode={scene === "card" ? "card" : "moment"} onClose={() => {}} onStandings={() => {}} />}
      <MotionRoot connected loaded />
    </Shell>
  </PlayerIdentityProvider>;
}

createRoot(document.getElementById("root")).render(q.get("scene") === "png" ? <SavedImage /> : <Preview />);
