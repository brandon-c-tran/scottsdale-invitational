/* The phone's whole game for one room (float/PROTOCOL.md "Components"):
   <FloatController room={id} rider={rider} onExit={fn} />, full screen.
   rider: { name, color, look, drinks?, pid?, photo?, number?, skin?, groom? }

   Optional, beyond the contract's props:
     connect  how to open the room (default connectFloat; the /float/play
              page passes the mock room for ?mock=1)
     onLook   called with the rider's new look when they change it here,
              so a host can keep it (Field Day's profile, the join's storage)

   It opens its own connection (hello carries the rider, and its latest look
   on every reconnect), renders whatever the room says, and never decides
   the game. What the room must confirm (ready, a look, a drink) is driven
   from the room's own state and sent again after every reconnect, with the
   thumbs on the paddles now. */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { connectFloat } from "../net.js";
import { cleanColor, cleanName } from "../../shared/protocol.js";
import { cleanLook } from "../../shared/looks.js";
import { FLOATIE_IDS } from "../../shared/floaties.js";
import { useFloatControllerSound, unlockFloatSound } from "../sound/index.js";
import { createWakeLock } from "../../../src/lib/wakeLock.js";
import { haptic, tapTick } from "../../../src/lib/haptics.js";
import Frame from "./Frame.jsx";
import RaceScreen from "./RaceScreen.jsx";
import Screens from "./Screens.jsx";
import { useRoom } from "./useRoom.js";
import { countFor, drinksOn, gunAt, raceView, screenOf } from "./controllerModel.js";
import { saveTurn, savedTurn } from "./turn.js";
import "./controller.css";

const DRINK_RETRY_MS = 4000;

/* the page is a game while this is open: awake, still, unzoomable */
function useGameSurface() {
  const lock = useRef(null);
  useEffect(() => {
    const wake = createWakeLock();
    lock.current = wake;
    wake.start();
    const html = document.documentElement, body = document.body;
    const saved = [html.style.overflow, body.style.overflow, html.style.overscrollBehavior, body.style.overscrollBehavior];
    html.style.overflow = body.style.overflow = "hidden";
    html.style.overscrollBehavior = body.style.overscrollBehavior = "none";
    const stop = event => { if (event.cancelable) event.preventDefault(); };
    const opts = { passive:false };
    document.addEventListener("gesturestart", stop, opts);
    document.addEventListener("gesturechange", stop, opts);
    document.addEventListener("dblclick", stop, opts);
    return () => {
      wake.release();
      [html.style.overflow, body.style.overflow, html.style.overscrollBehavior, body.style.overscrollBehavior] = saved;
      document.removeEventListener("gesturestart", stop, opts);
      document.removeEventListener("gesturechange", stop, opts);
      document.removeEventListener("dblclick", stop, opts);
    };
  }, []);
  return lock;
}

/* the room's clock, ticking only while a screen counts something */
function useServerNow(net, every) {
  const [now, setNow] = useState(() => net?.serverNow?.() ?? Date.now());
  useEffect(() => {
    if (!net || !every) return undefined;
    setNow(net.serverNow());
    const id = setInterval(() => setNow(net.serverNow()), every);
    return () => clearInterval(id);
  }, [net, every]);
  return net && every ? now : (net?.serverNow?.() ?? Date.now());
}

export default function FloatController({ room = "test", rider = null, onExit = null, connect = connectFloat, onLook = null }) {
  const groom = !!rider?.groom;
  const [look, setLookState] = useState(() => cleanLook(rider?.look, { groom, floatieIds:FLOATIE_IDS, seed:rider?.pid || rider?.name || "" }));
  const me = useMemo(() => ({ ...(rider || {}), name:cleanName(rider?.name) || "Rider", color:cleanColor(rider?.color) || "#ff5a4f",
    drinks:rider?.drinks !== false, look }), [rider, look]);
  const meRef = useRef(me);
  meRef.current = me;

  const [net, setNet] = useState(null);
  useEffect(() => {
    const opened = connect({ room, role:"controller", hello:() => ({ rider:meRef.current }) });
    setNet(opened);
    return () => opened.close();
  }, [room, connect]);

  const game = useRoom(net, { pid:rider?.pid || null });
  const gameRef = useRef(game);
  gameRef.current = game;
  const { idx } = game;
  const taps = useFloatControllerSound(net, { me:idx >= 0 ? idx : null });
  const wake = useGameSurface();

  const { screen, sideways } = screenOf({ room:game.room, idx });
  const entrant = useMemo(() => ({ ...me, ...(game.room?.entrants?.[idx] || {}) }), [me, game.room, idx]);
  const view = raceView(game.me);
  const round = Number(game.room?.round) || 0;
  const gun = gunAt(game.room);
  const now = useServerNow(net, screen === "countdown" ? 100 : ["cut", "outcut", "beach", "grid"].includes(screen) ? 250 : 0);

  /* ── what the room has to confirm, sent again after a reconnect ── */
  const intents = useRef({ ready:null, look:null, drink:null, hands:0 });
  const [drinkSent, setDrinkSent] = useState(null);
  useEffect(() => {
    if (!net) return undefined;
    return net.onStatus(status => {
      if (status !== "open") return;
      const i = intents.current, phase = gameRef.current.room?.phase;
      net.send({ t:"hands", n:i.hands });
      if (i.ready !== null && (!phase || phase === "lobby")) net.send({ t:"ready", on:i.ready });
      if (i.look) net.send({ t:"look", look:i.look });
      if (i.drink !== null && i.drink === (Number(gameRef.current.room?.round) || 0)) net.send({ t:"drink" });
    });
  }, [net]);
  useEffect(() => {
    const i = intents.current, phase = game.room?.phase, mine = game.room?.entrants?.[idx]?.look;
    if (phase && phase !== "lobby") i.ready = null;
    if (i.look && mine && mine.critter === i.look.critter && mine.floatie === i.look.floatie && mine.hat === i.look.hat
      && mine.shades === i.look.shades && mine.pose === i.look.pose) i.look = null;
    if (i.drink !== null && (i.drink !== round || view.drank)) i.drink = null;
  });

  /* ── the paddles ── */
  const live = screen === "race" && !view.arrived;
  const liveRef = useRef({ live, screen, gun });
  liveRef.current = { live, screen, gun };
  const onStroke = useCallback(stroke => {
    const state = liveRef.current;
    const going = state.live || (state.screen === "countdown" && Number.isFinite(state.gun) && net?.serverNow() >= state.gun);
    if (going) net?.send({ t:"stroke", side:stroke.side, p:stroke.p });
    taps.stroke(stroke.side, stroke.p);
  }, [net, taps]);
  const onHands = useCallback(n => {
    intents.current.hands = n;
    net?.send({ t:"hands", n });
  }, [net]);
  const onTouchEnd = useCallback(() => { unlockFloatSound(); wake.current?.start(); }, [wake]);
  useEffect(() => {
    if (!net) return undefined;
    const away = () => { intents.current.hands = 0; net.send({ t:"hands", n:0 }); };
    window.addEventListener("pagehide", away);
    return () => window.removeEventListener("pagehide", away);
  }, [net]);

  /* ── the drink ── */
  const owes = idx >= 0 && drinksOn(game.room, idx);
  const sent = drinkSent && drinkSent.round === round && (game.status !== "open" || Date.now() - drinkSent.at < DRINK_RETRY_MS);
  const drink = !owes ? null : view.drank ? "done" : sent ? "sent" : "idle";
  const [, retick] = useState(0);
  useEffect(() => {
    if (drink !== "sent") return undefined;
    const id = setTimeout(() => retick(n => n + 1), DRINK_RETRY_MS + 50);
    return () => clearTimeout(id);
  }, [drink, drinkSent]);
  const onDrink = useCallback(() => {
    tapTick();
    haptic("pick");
    taps.drink();
    const r = Number(gameRef.current.room?.round) || 0;
    intents.current.drink = r;
    setDrinkSent({ round:r, at:Date.now() });
    net?.send({ t:"drink" });
  }, [net, taps]);

  /* ── the look, the ready, the balloons, the feedback ── */
  const setLook = useCallback(next => {
    const clean = cleanLook(next, { groom, floatieIds:FLOATIE_IDS, seed:rider?.pid || rider?.name || "" });
    setLookState(clean);
    intents.current.look = clean;
    net?.send({ t:"look", look:clean });
    onLook?.(clean);
  }, [net, groom, rider, onLook]);
  const setReady = useCallback(on => {
    tapTick();
    unlockFloatSound();
    intents.current.ready = !!on;
    net?.send({ t:"ready", on:!!on });
  }, [net]);
  const throwAt = useCallback(at => {
    tapTick();
    haptic("place");
    taps.throw();
    net?.send({ t:"balloon", at });
  }, [net, taps]);
  const sendFeedback = useCallback(answers => net?.send({ t:"feedback", answers }), [net]);

  /* ── the turn ── */
  const [prefer, setPrefer] = useState(savedTurn);
  const geomRef = useRef({});
  const flip = useCallback(() => {
    tapTick();
    setPrefer(turn => { const next = turn === -90 ? 90 : -90; saveTurn(next); return next; });
  }, []);
  const count = screen === "countdown" ? countFor(gun, now) : null;
  const racing = screen === "race" || screen === "countdown";
  return <div className="flc-root" style={{ "--me":entrant.color }} data-screen={screen}>
    <Frame sideways={sideways} prefer={prefer} geomRef={geomRef}>
      {({ turn }) => racing
        ? <RaceScreen entrant={entrant} view={view} geomRef={geomRef} live={live} count={count} drink={drink} onDrink={onDrink}
          onStroke={onStroke} onHands={onHands} onTouchEnd={onTouchEnd} onFlip={turn ? flip : null} />
        : <Screens screen={screen} game={game} entrant={entrant} me={me} now={now} groom={groom} drink={drink}
          onDrink={onDrink} onReady={setReady} onLook={setLook} onThrow={throwAt} onFeedback={sendFeedback}
          onFlip={turn ? flip : null} onExit={onExit} />}
    </Frame>
    {game.status !== "open" && <div className="flc-link" role="status">{game.status === "closed" ? "Disconnected" : "Reconnecting"}</div>}
  </div>;
}
