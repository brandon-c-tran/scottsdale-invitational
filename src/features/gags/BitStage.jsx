import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { TextFloor, usePlayerIdentity } from "../identity/PlayerIdentityContext.js";
import { floodColor } from "../identity/chipInk.js";
import { OneSafe } from "../../ui/OneSafe.jsx";
import { useReducedMotion } from "../../lib/motion.js";
import { serverNow } from "../../lib/serverClock.js";
import { Backglass } from "../tv/DesertBand.jsx";
import { useBitSound } from "../tv/bitSound.js";
import { CastPhotosProvider } from "./cast/CastChip.jsx";
import { cameraCss } from "./bits/camera.js";
import { BIT_IN_MS, BIT_OUT_MS, beatVars, bitById } from "./bits/registry.js";
import { SCENES } from "./bits/scenes.jsx";
import "../tv/tv.css";
import "./bits.css";

/* Bits on the TV's painting (Oct 10). A BitLayer is one bit, shot by its
   camera: the session's painting, a pool of light on its floor and the
   scene, zoomed together about the floor (bits/camera.js), with the name
   and the fact lettered on the screen over it. A BitStage is a whole
   1920 x 1080 canvas (the painting at rest behind a BitLayer) scaled into
   its box, for the review reel, the frames tool and, later, a phone. On
   the TV a BitLayer covers TVMode's own painting the way the gags do.

   The clock: `start` is the bit's start on the server clock, and a screen
   that mounts late joins mid-bit (--tl is minus the ms already gone); `at`
   shows an instant instead (with `frozen`, held there). Reduced motion
   holds the bit's `still` and plays its one summary sound. Nothing here
   reads or writes tournament state beyond the profiles it is handed. */

/* a name on one line in its column: Big Shoulders 900 runs about .52em a letter */
export const bitNameSize = (text, width = 900, { max = 110, min = 48 } = {}) =>
  Math.max(min, Math.min(max, Math.floor(width / (Math.max(4, String(text || "").length) * 0.52))));

const displayName = (state, player) => String(state?.profiles?.[player]?.display || player || "");
const useLayout = typeof window === "undefined" ? useEffect : useLayoutEffect;

/* the ms already gone at the bit's start when this screen drew it, fixed
   per bit so the CSS delays never restart on a re-render */
function useJoined(key, { start, at, reduced, still }) {
  const ref = useRef({ key:null, elapsed:0 });
  if (ref.current.key !== key) {
    const elapsed = reduced ? still : at !== undefined && at !== null ? Number(at)
      : Number.isFinite(Number(start)) ? serverNow() - Number(start) : 0;
    ref.current = { key, elapsed:Math.max(0, Math.round(Number(elapsed) || 0)) };
  }
  return ref.current.elapsed;
}

/* the lamp behind the lettering: a win is its winner's own moment (the
   Lit Flood rule); a loss is the clay */
function useBitLamp(bit, lead) {
  const identity = usePlayerIdentity(lead || null);
  if (bit?.shape === "loss") return "var(--clay)";
  return lead ? floodColor(identity.color) : "var(--sun)";
}

/* the name, and the moment's fact under it, where the shot leaves room */
function BitLetters({ bit, name, fact }) {
  if (!name && !fact) return null;
  const place = bit.letter?.place || "top";
  const loss = bit.shape === "loss";
  return (
    <div className={`bit-words is-${place}`}>
      {name && <div className="bit-letter fd-show" style={{ fontSize:bitNameSize(name, place === "top" ? 1600 : 900) }}>{name}</div>}
      {fact && <div className={`bit-letter fd-show is-fact${loss ? " is-loss" : ""}`}><OneSafe text={fact} /></div>}
    </div>
  );
}

/* a run of one kind of jolt on the bit's clock: the first fills both ways,
   the rest forwards, so each starts where the last left off */
const runOf = (items, make) => items.map((item, i) => make(item, i === 0 ? "both" : "forwards")).join(", ");

/* One bit. `cast` is { a:[players], b:[players] } by the bit's roles;
   `name` is lettered (default: the display name of the side the bit
   letters), `fact` under it ("-1,000"); a bit whose letter is null (idle)
   letters neither. `phase` is the session's painting.
   `sound` cues the bit's foley on the room bus from its start. `rate`
   slows it (the reel). */
export function BitLayer({ bit: bitOrId, cast = {}, state = null, phase = "fri", name, fact = null, start, at, frozen = false,
  reduced: reducedProp, sound = false, rate = 1, mode = "tv", runKey = null, onLayer }) {
  const bit = typeof bitOrId === "string" ? bitById(bitOrId) : bitOrId;
  const reducedPref = useReducedMotion();
  const reduced = reducedProp ?? reducedPref;
  const key = `${bit?.id}:${runKey ?? start ?? at ?? 0}:${reduced ? "still" : "live"}`;
  const elapsed = useJoined(key, { start, at, reduced, still:bit?.still || 0 });
  const side = cast?.[bit?.letter?.over || "a"] || [];
  const lamp = useBitLamp(bit, side[0]);
  const layer = useRef(null);
  const held = frozen || reduced;
  /* the reel's slow motion: every animation in the bit at the same rate */
  useLayout(() => {
    if (held || rate === 1 || !layer.current?.getAnimations) return;
    layer.current.getAnimations({ subtree:true }).forEach(animation => { animation.playbackRate = rate; });
  }, [key, rate, held]);
  useEffect(() => { onLayer?.(layer.current); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const t0 = useRef(null);
  if (t0.current?.key !== key) t0.current = { key, start:Number.isFinite(Number(start)) ? Number(start) : serverNow() - elapsed / (rate || 1) };
  useBitSound({ bit, start:t0.current.start, enabled:sound && !frozen && !!bit, reduced, rate, key });
  if (!bit) return null;
  const Scene = SCENES[bit.id];
  const camera = cameraCss(bit, Scene?.anchors?.(cast) || {});
  const shakes = bit.camera?.shakes || [], washes = bit.camera?.washes || [];
  /* an idle vignette (letter:null) letters nothing: no name, no fact */
  const unlettered = bit.letter === null;
  const lettered = unlettered ? null : name !== undefined ? name : side[0] ? displayName(state, side[0]) : null;
  const told = unlettered ? null : fact;
  const motion = value => value ? { "--ba":value, animation:"var(--ba)" } : {};
  return (
    <div ref={layer} className={`bit-layer bit-art is-${bit.id} is-${bit.shape}${held ? " is-frozen" : ""}`} data-bit={bit.id}
      role="img" aria-label={[lettered, told].filter(Boolean).join(", ") || bit.name}
      style={{ "--tl":`${-elapsed}ms`, "--bit-ms":`${bit.ms}ms`, "--bit-in":`${BIT_IN_MS}ms`, "--bit-out":`${BIT_OUT_MS}ms`,
        "--b-letter":`${Math.round(bit.letter?.at || 0)}ms`, "--bit-lamp":lamp, ...beatVars(bit) }}>
      {camera.css && <style>{camera.css}</style>}
      <div className="bit-shake" style={motion(runOf(shakes, (shake, fill) =>
        `${shake.big ? "bit-shake-big 320ms" : "bit-shake 240ms"} linear calc(var(--tl) + ${Math.round(shake.at)}ms) ${fill}`))}>
        <div className="bit-world" style={{ transform:camera.rest,
          ...motion(camera.name && `${camera.name} ${bit.ms}ms linear calc(var(--tl) + 0ms) both`) }}>
          <Backglass phase={phase} className="bit-painting" />
          <div className="bit-floorlight" />
          <div className="bit-scene">{Scene && <Scene bit={bit} cast={cast} state={state} mode={mode} reduced={reduced} phase={phase} />}</div>
        </div>
      </div>
      {/* the sky's dim is for the lettering: an unlettered bit (idle) keeps
         the painting at full light, the cast up high included */}
      {!unlettered && <div className="bit-dim" />}
      {/* the white frame lands just before its instant, so the instant itself shows what lit it */}
      {washes.length > 0 && <div className="bit-wash" style={motion(runOf(washes, (ms, fill) =>
        `bit-wash 40ms linear calc(var(--tl) + ${Math.round(ms) - 40}ms) ${fill}`))} />}
      <BitLetters bit={bit} name={lettered} fact={told} />
    </div>
  );
}

/* the 1920 x 1080 canvas scaled into its box, letterboxed */
function useStageFit(ref) {
  const [fit, setFit] = useState({ scale:1, left:0, top:0 });
  const measure = () => {
    const el = ref.current;
    if (!el) return;
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    const scale = Math.min(w / 1920, h / 1080);
    setFit({ scale, left:(w - 1920 * scale) / 2, top:(h - 1080 * scale) / 2 });
  };
  useLayout(() => {
    measure();
    if (typeof ResizeObserver === "undefined" || !ref.current) return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return fit;
}

/* A bit on its own canvas: the session's painting (`phase`) at rest, the
   bit shot over it. `photos` stands in for the photo server (a rehearsal). */
export function BitStage({ phase = "fri", photos = null, className = "", ...layer }) {
  const box = useRef(null);
  const fit = useStageFit(box);
  return (
    <div ref={box} className={`bit-stage${className ? ` ${className}` : ""}`}>
      <TextFloor px={24}>
        <div className="tv-stage fd-night">
          <div className="tv-canvas bit-canvas" data-tv-canvas data-phase={phase}
            style={{ left:fit.left, top:fit.top, transform:`scale(${fit.scale})` }}>
            <Backglass phase={phase} className="tv-backdrop" />
            <CastPhotosProvider photos={photos}><BitLayer phase={phase} {...layer} /></CastPhotosProvider>
          </div>
        </div>
      </TextFloor>
    </div>
  );
}
