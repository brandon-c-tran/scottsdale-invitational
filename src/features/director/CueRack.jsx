import React, { useEffect, useState, useSyncExternalStore } from "react";
import { disp } from "../../../shared/core.js";
import { SANS } from "../../ui/theme.js";
import { spotifyPause, spotifyPlay, spotifyPlayer } from "../../lib/client.js";
import { serverNow } from "../../lib/serverClock.js";
import { tapTick } from "../../lib/haptics.js";
import {
  CUE_BRIDGE_MS, WALKOUT_POLL_MS, cueRackItems, dockItems, effectiveWalkout, shouldPollWalkout,
  soundingWalkout, walkoutOf,
} from "./walkout.js";

/* The audio cue is a chip beside the pill, never a wire into a scene:
   playback happens only on an explicit tap, and its failure is a toast, not
   a scene problem. One chip per relevant player covers ties and teams. While
   the server's walkout record is live the chip is Stop, for as long as the
   song actually plays. The rack beside the pill and the one docked in a
   sheet header share this device's command state. */
let cueState = { busy:"", reconnect:false, bridge:null };
const listeners = new Set();
const setCueState = patch => {
  cueState = { ...cueState, ...patch };
  for (const listener of listeners) listener();
};
const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
const readCueState = () => cueState;
const useCueState = () => useSyncExternalStore(subscribe, readCueState, readCueState);

/* re-render at the next moment the chips could change: the song's expected
   end, or the end of this device's own answer taking precedence */
function useCueClock(walkout, bridge) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const waits = [];
    if (walkout) waits.push(walkout.until - serverNow());
    if (bridge) waits.push(bridge.clientAt + CUE_BRIDGE_MS - Date.now());
    const next = waits.filter(wait => wait > 0);
    if (!next.length) return undefined;
    const timer = setTimeout(() => setTick(n => n + 1), Math.min(...next) + 50);
    return () => clearTimeout(timer);
  }, [walkout, bridge]);
}

/* The commissioner's phone asks the speaker while a walkout is up. The
   server reconciles the record from the answer (clears it when the song
   stopped, moves its end when it drifted) and broadcasts, so every screen's
   silence follows the speaker, not a guess. */
export function useWalkoutWatch(state, enabled) {
  const { bridge } = useCueState();
  const active = enabled && shouldPollWalkout(state, bridge, Date.now());
  useEffect(() => {
    if (!active || typeof window === "undefined") return undefined;
    let stopped = false, inFlight = false;
    const poll = async () => {
      if (stopped || inFlight || document.visibilityState === "hidden") return;
      inFlight = true;
      try { await spotifyPlayer(); } finally { inFlight = false; }
    };
    const timer = setInterval(poll, WALKOUT_POLL_MS);
    return () => { stopped = true; clearInterval(timer); };
  }, [active]);
}

export function CueRack({ state, candidates = [], notify, onAudio, docked = false }) {
  const { busy, reconnect, bridge } = useCueState();
  const walkout = effectiveWalkout(walkoutOf(state), bridge, Date.now());
  useCueClock(walkout, bridge);
  const sounding = soundingWalkout(walkout, serverNow());
  const all = cueRackItems(state, candidates, sounding);
  const items = docked ? dockItems(all) : all;
  /* beside the pill, more than two cues (a pair, a team) carry just the
     name, so they wrap into rows instead of a column over the screen */
  const short = docked || items.length > 2;

  const failed = (result, fallback) => {
    if (result.code === "reauthorize") setCueState({ reconnect:true });
    notify?.(result.error || fallback);
  };
  const play = async item => {
    if (cueState.busy || !item.track) return;
    tapTick();
    setCueState({ busy:item.player });
    const result = await spotifyPlay({ uri:item.track.uri, positionMs:item.track.startMs || 0,
      player:item.player, durationMs:item.track.durationMs });
    setCueState({ busy:"" });
    if (!result.ok) return failed(result, "Playback failed");
    setCueState({ reconnect:false, bridge:{ walkout:result.walkout || null, serverAt:serverNow(),
      clientAt:Date.now() } });
    notify?.(`${disp(state, item.player)}'s song playing`, null, "gold", item.player);
  };
  const stop = async () => {
    if (cueState.busy) return;
    tapTick();
    setCueState({ busy:"stop" });
    const result = await spotifyPause();
    setCueState({ busy:"" });
    if (!result.ok) return failed(result, "Could not stop playback");
    setCueState({ bridge:{ walkout:null, serverAt:serverNow(), clientAt:Date.now() } });
  };

  const chip = (key, { onClick, active = false, pending = false, glyph, text, aria }) => (
    <button key={key} type="button" disabled={!!busy} aria-busy={pending || undefined} onClick={onClick}
      aria-label={aria} className={docked ? "fd-cue-chip is-docked" : "fd-cue-chip"}
      style={{ display:"flex", alignItems:"center", gap:docked ? 5 : 7, minHeight:44, flexShrink:0,
        background:active ? "var(--sun)" : "var(--night)", border:"1px solid var(--sun)",
        color:active ? "var(--ink0)" : "var(--sun)", borderRadius:99,
        padding:docked ? "6px 11px" : "8px 14px", cursor:busy ? "default" : "pointer",
        opacity:busy && !pending ? 0.6 : 1, boxShadow:docked ? "none" : "var(--shadow-2)",
        maxWidth:docked ? "34vw" : "78vw" }}>
      <span aria-hidden="true" style={{ fontSize:13 }}>{glyph}</span>
      <span style={{ fontFamily:SANS, fontWeight:700, fontSize:12.5, whiteSpace:"nowrap",
        overflow:"hidden", textOverflow:"ellipsis" }}>{text}</span>
    </button>
  );
  if (reconnect && !sounding) return docked ? null : chip("reconnect", {
    onClick:() => { setCueState({ reconnect:false }); onAudio?.(); },
    glyph:"♪", text:"Reconnect Spotify in Audio Director" });
  return items.map(item => {
    const name = item.player ? disp(state, item.player) : null;
    const full = item.sounding
      ? name ? `Stop ${name}'s song` : "Stop the song"
      : `Play ${name}'s song`;
    return chip(item.player || "music", {
      onClick:() => item.sounding ? stop() : play(item),
      active:item.sounding,
      pending:busy === item.player || (item.sounding && busy === "stop"),
      glyph:item.sounding ? "■" : "♪",
      text:short ? (item.sounding ? `Stop${name ? ` ${name}` : ""}` : name) : full,
      aria:full,
    });
  });
}

/* test seam: the shared command state, reset between cases */
export const resetCueState = () => setCueState({ busy:"", reconnect:false, bridge:null });
export const cueStateForTest = () => cueState;
