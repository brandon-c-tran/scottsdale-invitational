/* The karaoke video on the TV (docs/KARAOKE.md "YouTube", "The TV
   report"). One YT.Player for the game, built on a slot this module
   appends to its host (React never owns the iframe), so TVMode's one-second
   tick and the stage changing round it never re-create it. Its moves
   follow karaokeVideoPlan (karaokeTv.js) on timers against the server
   clock:
     cue    from a singer's walk-up the upload is cued (its picture only;
            the song is public from upAt), the player out of view
     play   at songAt the player comes into view, then plays; a TV that
            mounts or reloads mid-song loads it where the room is
            (karaokeVideoSeconds)
     stop   at ENDED, at endAt, or when the turn is cut, closed or
            skipped: the video stops and leaves the screen. Never a player
            out of view making sound, never YouTube's end screen.
   Reports (onStatus, the TV report's tvVideo): "ready" when a turn's
   upload is cued or a problem has passed, "playing" once the video really
   plays (getCurrentTime past 0.5 s) with `at`, when its time 0 played on
   the server clock, "error" with YouTube's code, "blocked" when the
   browser would not start it (onAutoplayBlocked, or still unstarted or
   cued 3 s after it was told to play); the TV then shows Click to play
   (play()). The TV's Sound switch mutes it. `time()` is the video's own
   position in seconds while it plays (null otherwise), the clock the
   lyric stage lights the words by. A TV held still (`fixed`: the
   fit audit, a rehearsal) never creates a player, and nothing here runs
   at import time. */
import { useEffect, useRef, useState } from "react";
import { YT_STATE, loadYouTube } from "../../lib/youtube.js";
import { serverNow } from "../../lib/serverClock.js";
import { unlockSound, useSoundEnabled } from "../../lib/sound.js";
import { karaokeTurn, karaokeVideoSeconds } from "../../../shared/karaoke.js";
import { karaokeVideoPlan } from "./karaokeTv.js";

/* no controls, no keyboard, no fullscreen, no annotations, inline: the
   room watches; nothing on the TV is ever pressed on the video itself */
export const KARAOKE_PLAYER_VARS = Object.freeze({ controls:0, disablekb:1, fs:0, rel:0, iv_load_policy:3, playsinline:1 });
/* told to play and still unstarted or cued this long after: blocked */
export const KARAOKE_BLOCKED_MS = 3000;
/* the video counts as playing once its own time is past this */
export const KARAOKE_PLAYING_S = 0.5;
/* a cued song started less than this long ago plays from its start; later
   (a mount or reload mid-song) it loads where the room is */
const START_SLACK_MS = 1500;
const POLL_MS = 250;

/* one report a change: { key, state, code?, at? } */
const sameReport = (a, b) => !!a && !!b && a.key === b.key && a.state === b.state && a.code === b.code;

/* whether this TV runs a player for the game at all: a still never does */
export const karaokePlayerOn = (game, fixed = false) => !fixed && game?.phase === "turns" && !!game?.id;

/* The player's controller, one per game (exported for the tests, which
   hand it a stand-in IFrame API and host): `read()` is { game, onStatus }
   as of now, `onBlocked(key | null)` raises or lowers Click to play. */
export function createKaraokeController({ host, read, onBlocked = () => {}, loadApi = loadYouTube,
  makeSlot = () => document.createElement("div") }) {
  let player = null, slot = null, ready = false, gone = false, loading = false;
  let key = null, id = null, cued = null, started = false, muted = false;
  let last = null;
  /* keys whose time 0 was reported, and keys that ended or failed (never started again) */
  const played = new Set(), done = new Set();
  const timers = { play:0, stop:0, blocked:0, poll:0 };
  const clear = (...names) => names.forEach(name => { clearTimeout(timers[name]); clearInterval(timers[name]); timers[name] = 0; });
  const call = (fn, ...args) => { try { return player?.[fn]?.(...args); } catch { return undefined; } };
  const report = status => {
    if (gone || !status?.key || sameReport(last, status)) return;
    last = status;
    try { read().onStatus?.(status); } catch {}
  };
  /* a problem reported for a turn that has passed (or been fixed) is not the room's now */
  const settle = () => { if (last && (last.state === "blocked" || last.state === "error")) report({ key:last.key, state:"ready" }); };
  const show = on => {
    if (!host) return;
    if (on) host.setAttribute("data-on", "");
    else host.removeAttribute("data-on");
  };
  const blocked = on => { onBlocked(on ? key : null); };
  const stop = () => {
    clear("blocked", "poll");
    if (started) call("stopVideo");
    started = false;
    show(false);
    blocked(false);
  };
  /* the time 0 instant once the video is really playing, reported once a key */
  const watchPlaying = () => {
    if (played.has(key) || timers.poll) return;
    const check = () => {
      const t = Number(call("getCurrentTime")) || 0;
      if (call("getPlayerState") !== YT_STATE.PLAYING || t <= KARAOKE_PLAYING_S) return false;
      clear("poll");
      played.add(key);
      report({ key, state:"playing", at:Math.round(serverNow() - t * 1000) });
      return true;
    };
    if (!check()) timers.poll = setInterval(check, POLL_MS);
  };
  const armBlocked = () => {
    clear("blocked");
    timers.blocked = setTimeout(() => {
      const state = call("getPlayerState");
      if (!started || (state !== YT_STATE.UNSTARTED && state !== YT_STATE.CUED)) return;
      report({ key, state:"blocked" });
      blocked(true);
    }, KARAOKE_BLOCKED_MS);
  };
  const start = plan => {
    started = true;
    /* in view first: a player starts only once the room can see it */
    show(true);
    const now = serverNow();
    if (cued === plan.key && now - plan.songAt < START_SLACK_MS) call("playVideo");
    else call("loadVideoById", { videoId:plan.id, startSeconds:karaokeVideoSeconds(karaokeTurn(read().game), now) });
    armBlocked();
  };
  const at = (instant, fn) => setTimeout(fn, Math.max(0, instant - serverNow()));

  const ensure = () => {
    if (player || loading || gone) return;
    loading = true;
    loadApi().then(YT => {
      loading = false;
      if (gone || player) return;
      slot = makeSlot();
      host.appendChild(slot);
      player = new YT.Player(slot, {
        width:"100%", height:"100%", playerVars:{ ...KARAOKE_PLAYER_VARS },
        events:{
          onReady:() => { ready = true; call(muted ? "mute" : "unMute"); sync(); },
          onStateChange:event => {
            if (event.data === YT_STATE.CUED) { cued = key; return; }
            if (event.data === YT_STATE.ENDED) { done.add(key); stop(); return; }
            if (event.data !== YT_STATE.PLAYING) return;
            /* playing without being told to (a stale command): out of view, so it stops */
            if (!started) { call("stopVideo"); return; }
            clear("blocked");
            blocked(false);
            watchPlaying();
          },
          onError:event => {
            const code = Number(event?.data);
            report({ key, state:"error", ...(Number.isInteger(code) ? { code } : {}) });
            done.add(key);
            stop();
          },
          onAutoplayBlocked:() => {
            if (!started) return;
            report({ key, state:"blocked" });
            blocked(true);
          },
        },
      });
    }, () => {
      /* YouTube did not load here: the room's video cannot start on this TV */
      loading = false;
      const plan = karaokeVideoPlan(read().game, serverNow());
      if (!gone && plan?.mode === "play") { key = plan.key; report({ key, state:"blocked" }); }
    });
  };

  /* the player catches up with the turn on now */
  function sync() {
    if (gone) return;
    clear("play", "stop");
    const plan = karaokeVideoPlan(read().game, serverNow());
    if (!plan) { stop(); settle(); return; }
    /* the player's onReady syncs again */
    if (!ready) { ensure(); return; }
    if (plan.key !== key || plan.id !== id) {
      stop();
      settle();
      key = plan.key; id = plan.id; cued = null;
      report({ key, state:"ready" });
      if (plan.mode === "cue") call("cueVideoById", plan.id);
    }
    if (plan.mode === "cue") {
      if (started) stop();
      if (plan.songAt) timers.play = at(plan.songAt, sync);
    } else if (plan.mode === "play" && !done.has(key)) {
      if (!started) start(plan);
      timers.stop = at(plan.endAt, sync);
    } else stop();
  }

  return {
    sync,
    mute(off) { muted = !!off; if (ready) call(muted ? "mute" : "unMute"); },
    /* the video's own time while it plays, paused or buffers; else null */
    time() {
      if (!ready || !started || gone) return null;
      const state = call("getPlayerState");
      if (state !== YT_STATE.PLAYING && state !== YT_STATE.PAUSED && state !== YT_STATE.BUFFERING) return null;
      const t = Number(call("getCurrentTime"));
      return Number.isFinite(t) ? t : null;
    },
    /* Click to play: one press on the TV lets the browser start it with
       sound (and the room's own sounds); a second TV joins the room where
       it is, the first plays from the start and its report moves the end */
    play() {
      unlockSound();
      const plan = karaokeVideoPlan(read().game, serverNow());
      if (!ready || plan?.mode !== "play" || plan.key !== key) return;
      const turn = karaokeTurn(read().game);
      started = true;
      show(true);
      if (turn?.playedAt) call("seekTo", karaokeVideoSeconds(turn, serverNow()), true);
      call("playVideo");
      armBlocked();
    },
    destroy() {
      settle();
      gone = true;
      clear("play", "stop", "blocked", "poll");
      call("destroy");
      player = null;
      /* whatever YouTube left in the box goes with it */
      if (slot?.parentNode) slot.parentNode.removeChild(slot);
      try { if (host) host.textContent = ""; } catch {}
      show(false);
    },
  };
}

/* TVKaraoke's player: renders nothing itself. `host` is the box the
   iframe lives in (always mounted through the game's turns); `blocked`
   while this TV could not start the video on now; `play` for the sign. */
export function useKaraokePlayer({ game, fixed = false, onStatus = null }) {
  const host = useRef(null);
  const ctl = useRef(null);
  const latest = useRef(null);
  latest.current = { game, onStatus };
  const [blockedKey, setBlockedKey] = useState(null);
  const sound = useSoundEnabled();
  const on = karaokePlayerOn(game, fixed);
  const plan = on ? karaokeVideoPlan(game, serverNow()) : null;
  const step = plan ? `${plan.key}|${plan.id}|${plan.songAt}|${plan.endAt}` : "none";
  useEffect(() => {
    if (!on || !host.current) return undefined;
    const controller = createKaraokeController({ host:host.current, read:() => latest.current, onBlocked:setBlockedKey });
    ctl.current = controller;
    controller.mute(!sound);
    controller.sync();
    return () => { controller.destroy(); if (ctl.current === controller) ctl.current = null; setBlockedKey(null); };
  }, [on, game?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { ctl.current?.sync(); }, [step]);
  useEffect(() => { ctl.current?.mute(!sound); }, [sound]);
  return { host, blocked:!!plan && plan.mode === "play" && blockedKey === plan.key, play:() => ctl.current?.play(),
    time:() => ctl.current?.time() ?? null };
}
