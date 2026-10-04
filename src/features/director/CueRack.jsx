import React, { useEffect, useState, useSyncExternalStore } from "react";
import { disp } from "../../../shared/core.js";
import { spotifyPause, spotifyPlay, spotifyPlayer, spotifyRetry } from "../../lib/client.js";
import { serverNow } from "../../lib/serverClock.js";
import { tapTick } from "../../lib/haptics.js";
import {
  CUE_BRIDGE_MS, WALKOUT_POLL_MS, cueRackItems, dockItems, effectiveWalkout, shouldPollWalkout,
  soundingWalkout, walkoutOf,
} from "./walkout.js";
import { Icon } from "../../ui/Icon.jsx";
import { Avatar } from "../identity/PlayerIdentity.jsx";

/* The audio cue is a chip beside the pill, never a wire into a scene:
   playback happens only on an explicit tap, and its failure is a toast, not
   a scene problem. One chip per relevant player covers ties and teams. While
   the server's walkout record is live the chip is Stop, for as long as the
   song actually plays. The rack beside the pill and the one docked in a
   sheet header share this device's command state. */
/* a missed win song stays offered for this long */
const MISS_SHOWN_MS = 10 * 60 * 1000;
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

/* `pill`: the dock's own slot in the pill's row, one compact control while
   a song plays (the winner's photo chip with a song mark, and Stop) or one
   missed song (the same chip, and Retry); nothing otherwise. Quiet glass,
   never amber: amber is the pill's one action and money. */
export function CueRack({ state, candidates = [], notify, onAudio, docked = false, pill = false }) {
  const { busy, reconnect, bridge } = useCueState();
  const walkout = effectiveWalkout(walkoutOf(state), bridge, Date.now());
  useCueClock(walkout, bridge);
  const sounding = soundingWalkout(walkout, serverNow());
  const all = cueRackItems(state, candidates, sounding);
  const items = pill ? all.filter(item => item.sounding) : docked ? dockItems(all) : all;
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

  const chip = (key, { onClick, active = false, pending = false, glyph, text, aria, player = null, act = "stop" }) => pill ? (
    <button key={key} type="button" disabled={!!busy} aria-busy={pending || undefined} onClick={onClick} aria-label={aria}
      className={`fd-cue-now${active ? " is-playing" : ""}${act === "retry" ? " is-miss" : ""}`}>
      <span className="fd-cue-now-face" aria-hidden="true">
        {player ? <Avatar state={state} p={player} size={30} /> : <Icon name="song" size={18} />}
        <span className="fd-cue-now-badge"><Icon name="song" size={11} /></span>
      </span>
      <span className="fd-cue-now-act" aria-hidden="true"><Icon name={act === "retry" ? "undo" : "stop"} size={16} /></span>
    </button>
  ) : (
    <button key={key} type="button" disabled={!!busy} aria-busy={pending || undefined} onClick={onClick}
      aria-label={aria} className={`fd-cue-chip${docked ? " is-docked" : ""}${active ? " is-active" : ""}`}>
      <span className="fd-cue-glyph" aria-hidden="true">{glyph}</span>
      <span className="fd-cue-text">{text}</span>
    </button>
  );
  if (reconnect && !sounding) return docked || pill ? null : chip("reconnect", {
    onClick:() => { setCueState({ reconnect:false }); onAudio?.(); },
    glyph:<Icon name="song" size={15} />, text:"Reconnect Spotify" });
  /* a win song that should have played and did not: why, and one retry */
  const miss = state.showControl?.audio?.miss;
  const missed = !sounding && miss?.player && serverNow() - Number(miss.at) < MISS_SHOWN_MS ? miss : null;
  const retry = async () => {
    if (cueState.busy) return;
    tapTick();
    setCueState({ busy:"retry" });
    const result = await spotifyRetry();
    setCueState({ busy:"" });
    if (!result.ok) return failed(result, "Playback failed");
    setCueState({ reconnect:false });
    notify?.(`${disp(state, missed.player)}'s song playing`, null, "gold", missed.player);
  };
  const missChip = missed ? chip("miss", {
    onClick:/reconnect|connected/i.test(missed.reason) ? () => onAudio?.() : retry,
    pending:busy === "retry", glyph:<Icon name="undo" size={15} />, player:missed.player, act:"retry",
    text:docked ? `Retry ${disp(state, missed.player)}` : `${disp(state, missed.player)}'s song didn't play: ${missed.reason}`,
    aria:`${disp(state, missed.player)}'s song didn't play. ${missed.reason}. Retry`,
  }) : null;
  const list = [missChip, ...items.map(item => {
    const name = item.player ? disp(state, item.player) : null;
    const full = item.sounding
      ? name ? `Stop ${name}'s song` : "Stop the song"
      : `Play ${name}'s song`;
    return chip(item.player || "music", {
      onClick:() => item.sounding ? stop() : play(item),
      active:item.sounding,
      pending:busy === item.player || (item.sounding && busy === "stop"),
      glyph:<Icon name={item.sounding ? "stop" : "song"} size={15} />,
      text:short ? (item.sounding ? `Stop${name ? ` ${name}` : ""}` : name) : full,
      aria:full, player:item.player || null,
    });
  })].filter(Boolean);
  /* the pill's slot holds one control: the song playing, else the miss */
  return pill ? [list.find(node => node !== missChip) || missChip].filter(Boolean) : list;
}

/* test seam: the shared command state, reset between cases */
export const resetCueState = () => setCueState({ busy:"", reconnect:false, bridge:null });
export const cueStateForTest = () => cueState;
