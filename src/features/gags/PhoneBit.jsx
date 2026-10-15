import React, { useRef } from "react";
import { Icon } from "../../ui/Icon.jsx";
import { OneSafe } from "../../ui/OneSafe.jsx";
import { useReducedMotion } from "../../lib/motion.js";
import { serverNow } from "../../lib/serverClock.js";
import { useBitSound } from "../tv/bitSound.js";
import { BitStage } from "./BitStage.jsx";
import { holdBeatOf } from "../../../shared/bitMusic.js";
import { bitById } from "./bits/registry.js";
import { gagCast, gagLamp } from "./gagModel.js";
import "./phone-bit.css";

/* A moment on its player's own phone (phoneBit.js): the TV's bit, the
   whole 16:9 stage across the phone's width on the dark glass, the name
   and the fact lettered under it on the bit's own beat (the TV letters
   them on its sky; at a phone's scale they would be too small there). Same
   server instant as the TV, so a late phone joins mid-bit. Its foley on
   this phone's own bus, from the moment's start; reduced motion holds the
   bit's still with its one summary sound. A tap anywhere puts it away; it
   leaves on its own as the bit ends. Loaded on first use (lazyPart). */

/* the name across the phone: one line while that reads large, else broken
   at its last space when two lines letter it larger (Big Shoulders 900 runs
   about .52em a letter) */
export const PHONE_BIT_NAME_W = 335;
export function phoneBitNameFit(name, width = PHONE_BIT_NAME_W, { max = 64, min = 30, comfort = 44 } = {}) {
  const text = String(name || "");
  const size = letters => Math.max(min, Math.min(max, Math.floor(width / (Math.max(3, letters) * 0.52))));
  const one = size(text.length);
  const cut = text.lastIndexOf(" ");
  if (one >= comfort || cut <= 0) return { size:one, lines:[text] };
  const lines = [text.slice(0, cut), text.slice(cut + 1)];
  const two = size(Math.max(...lines.map(line => line.length)));
  return two > one ? { size:two, lines } : { size:one, lines:[text] };
}

/* the ms already gone at the moment's start when this phone drew it */
function useJoined(id, start) {
  const ref = useRef({ id:null, elapsed:0 });
  if (ref.current.id !== id) ref.current = { id, elapsed:Math.max(0, Math.round(serverNow() - (Number(start) || 0))) };
  return ref.current.elapsed;
}

export function PhoneBit({ state, moment, phase = "fri", onDismiss = null }) {
  const bit = bitById(moment?.bit);
  const reduced = useReducedMotion();
  const joined = useJoined(moment?.id, moment?.start);
  const song = !!moment?.song && moment.song.status !== "none";
  useBitSound({ bit, start:moment?.start, origin:moment?.origin, song, enabled:!!bit && !!moment, reduced, key:`phone:${moment?.id}`, bus:"you",
    cast:gagCast(moment) });
  if (!moment || !bit) return null;
  /* a music bit with its song on the way runs on the server clock (it may
     hold its wind-up until the speaker plays) */
  const clock = song && holdBeatOf(bit) !== null ? { start:moment.start, origin:moment.origin } : { at:joined };
  const fit = phoneBitNameFit(moment.name);
  const loss = bit.shape === "loss";
  const label = [moment.name, moment.fact].filter(Boolean).join(", ");
  return (
    <div className={`fd-moment fd-bit is-${bit.shape}`} role="dialog" aria-modal="false" aria-label={label}
      data-bit={bit.id} onClick={() => onDismiss?.()}
      style={{ "--tl":`${-joined}ms`, "--moment-hold":`${Math.round(Number(moment.end) - Number(moment.start)) || bit.span || bit.ms}ms`, "--b-letter":`${Math.round(bit.letter?.at || 0)}ms`,
        "--bit-lamp":gagLamp(state, moment)?.color || "var(--sun)" }}>
      <div className="fd-bit-body">
        <div className="fd-bit-screen" aria-hidden="true">
          <BitStage phase={phase} bit={bit} cast={gagCast(moment)} state={state} {...clock} runKey={moment.id} letters={false} />
        </div>
        <div className="fd-bit-words">
          <h2 className="fd-show fd-bit-name" style={{ fontSize:fit.size }}>
            {fit.lines.map(line => <span key={line}>{line}</span>)}</h2>
          {moment.fact && <p className={`fd-show fd-bit-fact${loss ? " is-loss" : ""}`}><OneSafe text={moment.fact} /></p>}
        </div>
      </div>
      <button type="button" className="fd-moment-x" aria-label="Dismiss"
        onClick={event => { event.stopPropagation(); onDismiss?.(); }}><Icon name="close" size={18} /></button>
    </div>
  );
}
