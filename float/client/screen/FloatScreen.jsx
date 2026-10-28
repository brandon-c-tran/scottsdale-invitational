/* The shared screen for one room (float/GROOVE.md "The screen (TV) and the
   phone"): <FloatScreen room={id} /> fills its parent, opens its own
   connection as a screen, and draws the Cup in 2D on a fixed 1920 x 1080
   stage, letterboxed: DOM and CSS, no WebGL. Field Day embeds it on its own
   1920x1080 TV canvas; /float wraps it (ScreenApp: the code, the QR,
   hosting).

     room      the room id
     hosting   this screen runs the lobby (Start, bots, drinking)
     joinUrl   the phones' join link, drawn as a QR in the lobby
     mock      true: the stand-in room (also ?mock=1)
     quality   "high" | "medium" | "low" | "lowest" (also ?quality=); the
               lower tiers drop the water's checker and the far layers' drift
     onStats   called about once a second with { fps, tier }
     muted     true while the screen is mounted but hidden (Field Day's own
               scene over it): no sound, nothing drawn or moving; the
               connection stays, so it comes back current. Default false.

   One requestAnimationFrame loop (stage/driver.js) writes every transform
   from the server clock; React renders only when a room message lands. */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createScreenStore } from "./model/store.js";
import { sceneFor, sceneMode } from "./model/song.js";
import { createDriver } from "./stage/driver.js";
import Scene, { layerOffset } from "./stage/Scene.jsx";
import Cast from "./stage/Cast.jsx";
import Host from "./stage/Host.jsx";
import Pieces from "./stage/Pieces.jsx";
import Lobby from "./hud/Lobby.jsx";
import { CutBoard, Feedback, IntroTitle, LastCallBanner, PodiumBlocks, PodiumList, SongBanner, SongStrip } from "./hud/Hud.jsx";
import Bar from "./stage/Bar.jsx";
import * as floatSound from "../sound/index.js";
import "./screen.css";

/* the connection: float/client/net.js, the one the phones use; with
   ?mock=1 the scripted room in this tab (mockNet.js) */
export async function loadConnect(mock = false) {
  if (mock) return (await import("./mockNet.js")).connectFloat;
  return (await import("../net.js")).connectFloat;
}

const param = key => {
  try { return new URLSearchParams(window.location.search).get(key); } catch { return null; }
};
const pageShown = () => { try { return document.visibilityState !== "hidden"; } catch { return true; } };

/* the podium's beats: the sound's own when it says them (its reveal lands on its fanfare) */
const PODIUM_BEATS = floatSound.PODIUM_BEATS || { third:1450, second:2200, first:2700, pose:3400 };

/* ?debug=1: a small corner readout (the screen's frame rate, each phone's round trip) */
function DebugReadout({ fps, tier, rtt = {}, entrants = [] }) {
  const rows = entrants.map(e => ({ name:e?.name, bot:e?.bot, ms:rtt?.[e?.device] })).filter(r => r.name && !r.bot);
  return <div className="fs-debug">
    <div>TV {fps ?? "?"} fps · {tier}</div>
    {rows.map(r => <div key={r.name}>{r.name}: {Number.isFinite(r.ms) ? `${Math.round(r.ms)} ms` : "no ping yet"}</div>)}
  </div>;
}

function SoundIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true">
    <path fill="currentColor" d="M4 9h4l5-4v14l-5-4H4z" />
    <path fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
  </svg>;
}

export default function FloatScreen({ room = "test", hosting = false, joinUrl = null, mock, quality, onStats, muted = false }) {
  const rootRef = useRef(null);
  const stageRef = useRef(null);
  const store = useMemo(createScreenStore, []);
  const [net, setNet] = useState(null);
  const [version, setVersion] = useState(0);
  const useMock = mock ?? param("mock") === "1";
  const tier = quality ?? param("quality") ?? "auto";
  const mutedRef = useRef(!!muted);
  mutedRef.current = !!muted;
  /* ?debug=1: the screen's frame rate and every phone's round trip, to tell a slow TV from a slow phone */
  const debug = useMemo(() => param("debug") === "1", []);
  const [fps, setFps] = useState(null);
  const statsRef = useRef(onStats);
  statsRef.current = onStats;
  const driver = useMemo(() => createDriver({
    serverNow:store.serverNow,
    onFps:value => {
      const stats = { fps:value, tier };
      try { window.__floatStats = { ...(window.__floatStats || {}), ...stats }; } catch {}
      statsRef.current?.(stats);
      if (debug) setFps(value);
    },
  }), [store]); // eslint-disable-line react-hooks/exhaustive-deps

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
  floatSound.useFloatScreenSound(net, soundOptions);
  const unlockNeeded = floatSound.useFloatSoundUnlockNeeded();

  /* the stage: 1920 x 1080, scaled to fit its parent and centred (letterboxed) */
  useEffect(() => {
    const el = rootRef.current, stage = stageRef.current;
    if (!el || !stage || typeof ResizeObserver === "undefined") return undefined;
    const apply = () => {
      const w = el.clientWidth || 1920, h = el.clientHeight || 1080;
      const s = Math.min(w / 1920, h / 1080);
      stage.style.transform = `translate(${((w - 1920 * s) / 2).toFixed(2)}px, ${((h - 1080 * s) / 2).toFixed(2)}px) scale(${s.toFixed(5)})`;
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* the loop runs while the screen is shown */
  useEffect(() => {
    driver.setPaused(!!muted);
    return () => driver.stop();
  }, [driver, muted]);

  const st = store.state;
  const roomMsg = st.room;
  const phase = roomMsg ? st.phase : "connecting";
  /* the entrants, the same array until a rider changes (the room rebuilds
     the list on every message; the cast and its frame loop key on it) */
  const entrantsKey = JSON.stringify((Array.isArray(roomMsg?.entrants) ? roomMsg.entrants : []).map(e => e && [e.device, e.pid, e.name, e.color,
    e.look?.critter, !!e.bot, !!e.ready, !!e.groom, e.connected !== false]));
  const entrants = useMemo(() => (Array.isArray(roomMsg?.entrants) ? roomMsg.entrants : []), [entrantsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const scene = sceneFor(phase, st.chart);
  const lite = tier === "low" || tier === "lowest";

  /* the backdrop drifts by depth, faster in a song, still on the podium */
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const layers = [...stage.querySelectorAll(".sc-layer[data-depth]")].map(node => ({ node, depth:Number(node.dataset.depth) || 0 }));
    const checker = stage.querySelector(".sc-checker");
    const speed = phase === "song" || phase === "intro" ? 1 : phase === "lobby" || phase === "cut" ? 0.45 : 0;
    let travel = null, lastNow = null;
    return driver.add(now => {
      if (travel === null) travel = (now / 1000) * 64;
      const dt = lastNow === null ? 0 : Math.max(0, Math.min(120, now - lastNow));
      lastNow = now;
      travel += (dt / 1000) * 64 * speed;
      for (const layer of layers) {
        if (lite && layer.depth < 0.3) continue;
        layer.node.style.transform = `translate3d(${layerOffset(travel * 1000 / 64, layer.depth).toFixed(1)}px, 0, 0)`;
      }
      if (checker && !lite) checker.style.transform = `rotateX(76deg) translate3d(${(-(travel * 0.7) % 240).toFixed(1)}px, 0, 0)`;
      /* the scene's mode (rocks drifting by, the whirl, the falls) follows the bar */
      if (phase === "song" && st.chart && Number.isFinite(st.songAt)) {
        const { mode, section } = sceneMode(st.chart, (now - st.songAt) / st.chart.beatMs);
        const value = `${mode || ""}:${section || ""}`;
        if (stage.dataset.mode !== value) stage.dataset.mode = value;
      }
    });
  }, [driver, scene, phase, lite, st]);

  /* the shots script's handshake: fonts in, the first room drawn */
  useEffect(() => {
    if (!roomMsg || rootRef.current?.dataset.ready) return;
    let alive = true;
    Promise.resolve(document.fonts?.ready).then(() => {
      if (!alive || !rootRef.current) return;
      rootRef.current.dataset.ready = "1";
      try { document.body.dataset.ready = "1"; } catch {}
    });
    return () => { alive = false; };
  }, [roomMsg]);

  const send = msg => { try { net?.send(msg); } catch {} };
  const disconnected = st.status === "closed" || (st.status === "connecting" && !!st.room);
  const water = phase === "lobby" || phase === "intro" || phase === "song" || phase === "cut";

  return <div className="fs-root" ref={rootRef} data-phase={phase} data-muted={muted ? "1" : undefined} data-tier={tier}>
    <div className="fs-stage" ref={stageRef} data-scene={scene}>
      {!muted && <>
        <Scene id={scene} />
        {(phase === "song" || phase === "cut" || phase === "intro" || phase === "lobby") && <Pieces scene={scene} store={store} driver={driver} phase={phase} />}
        {(phase === "podium" || phase === "feedback") && <PodiumBlocks store={store} driver={driver} room={roomMsg} entrants={entrants} beats={PODIUM_BEATS}
          revealed={phase === "feedback"} />}
        {water && phase !== "lobby" && <Host store={store} driver={driver} phase={phase} />}
        {phase === "lastcall" && <Bar store={store} driver={driver} />}
        <Cast store={store} driver={driver} entrants={entrants} phase={phase} room={roomMsg} version={version} />
        <div className="fs-hud">
          {phase === "lobby" && <Lobby room={roomMsg} entrants={entrants} hosting={hosting && roomMsg?.mode !== "fieldday"} joinUrl={joinUrl} send={send}
            serverNow={store.serverNow} />}
          {phase === "intro" && <IntroTitle room={roomMsg} />}
          {phase === "song" && <><SongStrip store={store} driver={driver} /><SongBanner store={store} driver={driver} room={roomMsg} /></>}
          {phase === "cut" && <CutBoard store={store} driver={driver} room={roomMsg} entrants={entrants} />}
          {phase === "lastcall" && <LastCallBanner store={store} driver={driver} entrants={entrants} />}
          {(phase === "podium" || phase === "feedback") && <PodiumList room={roomMsg} entrants={entrants} />}
          {phase === "feedback" && <Feedback />}
        </div>
      </>}
    </div>
    {!muted && debug && <DebugReadout fps={fps} tier={tier} rtt={st.rtt} entrants={entrants} />}
    {!muted && disconnected && <div className="fs-status"><span>Reconnecting</span></div>}
    {/* Field Day's TV has its own Click for sound; the /float page needs this one */}
    {!muted && unlockNeeded && hosting && <button type="button" className="fs-sound" onClick={() => floatSound.unlockFloatSound?.()}><SoundIcon />Click for sound</button>}
  </div>;
}
