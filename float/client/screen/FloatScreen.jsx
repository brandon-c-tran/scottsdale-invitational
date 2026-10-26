/* The shared screen for one room (float/PROTOCOL.md "Components"):
   <FloatScreen room={id} /> fills its parent, opens its own connection as a
   screen, and draws the race in 3D at serverNow() - INTERP_MS with the HUD
   over it. Field Day embeds it on its 1920x1080 TV canvas; /float wraps it
   (ScreenApp: the code, the QR, hosting).

     room      the room id
     hosting   this screen runs the lobby (Start, bots, drinking)
     joinUrl   the phones' join link, drawn as a QR in the lobby
     mock      true: the stand-in room (also ?mock=1)
     quality   "high" | "medium" | "low" | "lowest" (also ?quality=); else automatic
     muted     true while the screen is mounted but hidden (Field Day's own
               scene over it): no sound, the 3D paused, no HUD; the
               connection stays, so it comes back current. Default false.

   three.js loads only here, behind a dynamic import, so nothing that imports
   this component pays for it until it mounts. No WebGL, a failed load, a
   lost context or a device too slow for the lowest tier: the flat map. */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createScreenStore } from "./model/screenStore.js";
import { indexList, throughFor } from "./model/cupShape.js";
import { useFloatScreenSound, useFloatSoundUnlockNeeded, unlockFloatSound, PODIUM_BEATS } from "../sound/index.js";
import { Arrivals, CapClock, Countdown, CutBoard, CutLamp, Feedback, IntroMap, NameTags, Plate, Podium, Rail, ReplayLamp, Ribbon, TitleCard } from "./hud/Hud.jsx";
import Lobby from "./hud/Lobby.jsx";
import { SoundIcon } from "./hud/bits.jsx";
import "./screen.css";

/* the connection: float/client/net.js, the one the phones use; with
   ?mock=1 the real room run in this tab (mockNet.js) */
export async function loadConnect(mock = false) {
  if (mock) return (await import("./mockNet.js")).connectFloat;
  return (await import("../net.js")).connectFloat;
}

function createBus() {
  const fns = new Set();
  const bus = {
    last:null,
    on(fn) { fns.add(fn); return () => fns.delete(fn); },
    emit(frame) {
      bus.last = frame;
      fns.forEach(fn => fn(frame));
      try { window.__floatFrames = (window.__floatFrames || 0) + 1; } catch {}
    },
  };
  return bus;
}

let webgl = null;
function webglAvailable() {
  if (webgl !== null) return webgl;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    webgl = !!gl;
    gl?.getExtension?.("WEBGL_lose_context")?.loseContext();
  } catch { webgl = false; }
  return webgl;
}

const param = key => {
  try { return new URLSearchParams(window.location.search).get(key); } catch { return null; }
};

const pageShown = () => { try { return document.visibilityState !== "hidden"; } catch { return true; } };

export default function FloatScreen({ room = "test", hosting = false, joinUrl = null, mock, quality, onStats, muted = false }) {
  const rootRef = useRef(null);
  const canvasRef = useRef(null);
  const flatRef = useRef(null);
  const drawRef = useRef(null);
  const sizeRef = useRef({ w:1920, h:1080 });
  const store = useMemo(createScreenStore, []);
  const bus = useMemo(createBus, []);
  const [net, setNet] = useState(null);
  const [, setVersion] = useState(0);
  const [view, setView] = useState(() => (param("flat") === "1" ? "flat" : "3d"));
  const useMock = mock ?? param("mock") === "1";
  const tier = quality ?? param("quality") ?? "auto";
  const mutedRef = useRef(!!muted);
  mutedRef.current = !!muted;

  /* the connection */
  useEffect(() => {
    let alive = true, conn = null, detach = null;
    loadConnect(useMock).then(connect => {
      if (!alive) return;
      conn = connect({ room, role:"screen", hello:{} });
      detach = store.attach(conn);
      setNet(conn);
    }).catch(error => console.error("Float connect", error));
    return () => { alive = false; detach?.(); try { conn?.close(); } catch {} setNet(null); };
  }, [room, useMock, store]);

  useEffect(() => store.subscribe(() => setVersion(v => v + 1)), [store]);

  /* the sound runner reads this on every step: muted reads as a hidden page
     (its beds stop within a tick, no moment cues) */
  const soundOptions = useMemo(() => ({ visible:() => !mutedRef.current && pageShown() }), []);
  useFloatScreenSound(net, soundOptions);
  const unlockNeeded = useFloatSoundUnlockNeeded();

  /* the parent's size: the stage scale for the HUD, the renderer's size */
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    const apply = () => {
      const w = el.clientWidth || 1920, h = el.clientHeight || 1080;
      sizeRef.current = { w, h };
      el.style.setProperty("--u", `${Math.min(w / 1920, h / 1080)}px`);
      drawRef.current?.resize(w, h);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* the 3D world, or the flat map */
  useEffect(() => {
    let alive = true, drawer = null;
    const fail = () => { if (alive) setView("flat"); };
    const stats = s => { try { window.__floatStats = { ...(window.__floatStats || {}), ...s }; } catch {} onStats?.(s); };
    if (view === "3d") {
      if (!webglAvailable()) { setView("flat"); return undefined; }
      import("./world/World.js").then(mod => {
        if (!alive) return;
        drawer = mod.createWorld({ canvas:canvasRef.current, store, quality:tier, onFrame:frame => bus.emit(frame), onFail:fail, onStats:stats });
        if (!drawer) { fail(); return; }
        drawRef.current = drawer;
        drawer.resize(sizeRef.current.w, sizeRef.current.h);
        drawer.setPaused?.(mutedRef.current);
        /* for the shots script and a console: the world's own handle */
        try { window.__floatWorld = drawer; } catch {}
      }).catch(error => { console.error("Float world", error); fail(); });
    } else {
      import("./flat/FlatMap.js").then(mod => {
        if (!alive) return;
        drawer = mod.createFlatMap({ canvas:flatRef.current, store, onFrame:frame => bus.emit(frame), onStats:stats });
        drawRef.current = drawer;
        drawer.resize(sizeRef.current.w, sizeRef.current.h);
        drawer.setPaused?.(mutedRef.current);
      }).catch(error => console.error("Float flat map", error));
    }
    return () => { alive = false; drawer?.dispose(); if (drawRef.current === drawer) drawRef.current = null; };
  }, [view, store, bus, tier]); // eslint-disable-line react-hooks/exhaustive-deps

  /* hidden under a scene: stop drawing; back: pick up where the room is */
  useEffect(() => { drawRef.current?.setPaused?.(!!muted); }, [muted]);

  const st = store.state;
  const roomMsg = st.room;
  const geo = st.geo;
  const phase = st.phase;
  const entrants = Array.isArray(roomMsg?.entrants) ? roomMsg.entrants : [];
  const through = throughFor(roomMsg);
  const final = typeof roomMsg?.lastRound === "boolean" ? roomMsg.lastRound
    : (roomMsg?.rounds | 0) > 0 && (roomMsg?.round | 0) >= (roomMsg.rounds | 0) - 1;
  /* the podium's beats count from its message, as the band's do (+60 ms) */
  const podiumAnchor = Number.isFinite(st.phaseStart) ? st.phaseStart + 60 : null;

  /* the podium's beats in the world: confetti per place, then the poses */
  useEffect(() => {
    if (phase !== "podium" || !Number.isFinite(podiumAnchor)) return undefined;
    const podium = indexList(roomMsg?.podium);
    const timers = [];
    const at = (ms, fn) => {
      const delay = podiumAnchor + ms - store.serverNow();
      if (delay < -1500) { if (ms === PODIUM_BEATS.pose) fn(); return; }
      timers.push(setTimeout(fn, Math.max(0, delay)));
    };
    at(PODIUM_BEATS.third, () => drawRef.current?.podiumBurst?.(3));
    at(PODIUM_BEATS.second, () => drawRef.current?.podiumBurst?.(2));
    at(PODIUM_BEATS.first, () => drawRef.current?.podiumBurst?.(1));
    at(PODIUM_BEATS.pose, () => podium.forEach(i => drawRef.current?.pose?.(i, entrants[i]?.look?.pose || "flex")));
    return () => timers.forEach(clearTimeout);
  }, [phase, podiumAnchor]); // eslint-disable-line react-hooks/exhaustive-deps

  /* the shots script's handshake: fonts in, the river drawn */
  useEffect(() => {
    let alive = true;
    const off = bus.on(frame => {
      if (!alive || !frame || rootRef.current?.dataset.ready) return;
      Promise.resolve(document.fonts?.ready).then(() => {
        if (!alive || !rootRef.current) return;
        rootRef.current.dataset.ready = "1";
        try { document.body.dataset.ready = "1"; } catch {}
      });
    });
    return () => { alive = false; off(); };
  }, [bus]);

  const send = msg => { try { net?.send(msg); } catch {} };
  const disconnected = st.status === "closed" || (st.status === "connecting" && !!st.room);

  return <div className="fs-root" ref={rootRef} data-phase={phase} data-view={view} data-muted={muted ? "1" : undefined}>
    {view === "3d" ? <canvas key="gl" className="fs-canvas" ref={canvasRef} /> : <canvas key="flat" className="fs-canvas" ref={flatRef} />}
    {!muted && <div className="fs-hud">
      {phase === "lobby" && <Lobby room={roomMsg} entrants={entrants} hosting={hosting && roomMsg?.mode !== "fieldday"} joinUrl={joinUrl} send={send}
        serverNow={store.serverNow} />}
      {phase === "intro" && <IntroMap geo={geo} bus={bus} />}
      {(phase === "grid" || phase === "countdown" || phase === "race") && <NameTags bus={bus} entrants={entrants} phase={phase} big={phase !== "race"} />}
      {phase === "grid" && <TitleCard room={roomMsg} geo={geo} />}
      {phase === "race" && <>
        <Plate room={roomMsg} geo={geo} />
        <CapClock room={roomMsg} bus={bus} />
        <CutLamp bus={bus} />
        <Rail room={roomMsg} bus={bus} entrants={entrants} />
        <Ribbon room={roomMsg} geo={geo} bus={bus} entrants={entrants} />
        <Arrivals room={roomMsg} entrants={entrants} through={through} final={final} />
      </>}
      {(phase === "countdown" || phase === "race") && <Countdown gun={st.gunRound === (roomMsg?.round | 0) ? st.gun : null} bus={bus} />}
      {phase === "cut" && <CutBoard room={roomMsg} geo={geo} entrants={entrants} raceField={st.raceField} bus={bus} since={st.phaseStart}
        replayEnds={store.replayWindow()?.to ?? null} />}
      {phase === "cut" && <ReplayLamp bus={bus} entrants={entrants} />}
      {(phase === "podium" || phase === "feedback") && <Podium room={roomMsg} entrants={entrants} bus={bus} anchor={phase === "podium" ? podiumAnchor : -1e12} />}
      {phase === "feedback" && <Feedback />}
      {disconnected && <div className="fs-status"><span className="fs-lamp is-clay is-flash">Reconnecting</span></div>}
      {/* Field Day's TV has its own Click for sound; the /float page needs this one */}
      {unlockNeeded && hosting && <button type="button" className="fs-sound" onClick={() => unlockFloatSound()}><SoundIcon />Click for sound</button>}
    </div>}
  </div>;
}
