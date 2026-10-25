import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { mapsKeyFrame } from "../../lib/mapsKey.js";
import { ChipFace } from "../identity/PlayerIdentity.jsx";
import { REVEAL, REVEAL_SETTLE, easeOut, mapsConfig, pickRenderer, placeReveal, revealAt, revealPlan, settleViews }
  from "./mapModel.js";
import { googleFailed, onGoogleFailure } from "./maps/googleState.js";
import "./geo.css";

/* Where and When's map. One game over three renderers, each behind the
   same small adapter (the contract is in mapModel.js, the renderers in
   ./maps/): Google's own map when the Worker hands out a browser key
   (capabilities.googleMaps), else MapLibre's vector map over OpenFreeMap's
   "Liberty" style, else Leaflet's raster tiles on a device without WebGL.
   Each loads only when a map first shows; Google's script comes by a
   script tag, never in the bundle. A key Google refuses falls back to
   MapLibre for the session. */
/* the lower 48, where most of the group's photos will be (zooms here are
   a 256 px tile's; MapLibre's were one less) */
const HOME = { lng:-97, lat:38.5, zoom:3.4 };
const ZOOM = Object.freeze({ place:15, revealMax:14, single:12, guessesMax:10 });
/* room kept between the pins and the map's edge on the reveal (the pins'
   own reach is added to it) */
const PAD = Object.freeze({ top:24, bottom:24, left:24, right:24 });
const START_PAD = Object.freeze({ top:40, bottom:40, left:40, right:40 });
const CARD_INSET = 28;
const TYPE_KEY = "si-geo-map-type";

let glLoad = null, leafletLoad = null;
const loadGl = () => glLoad || (glLoad = Promise.all([import("maplibre-gl"), import("maplibre-gl/dist/maplibre-gl.css")])
  .then(([mod]) => mod.default || mod));
const loadLeaflet = () => leafletLoad || (leafletLoad = Promise.all([import("leaflet"), import("leaflet/dist/leaflet.css")])
  .then(([mod]) => mod.default || mod));
/* each renderer: its adapter and its library, both on first use */
const RENDERERS = {
  google:() => Promise.all([import("./maps/googleAdapter.js"), import("./maps/googleLoader.js")])
    .then(([adapter, loader]) => loader.loadGoogleMaps(mapsNow().googleKey).then(g => [adapter.createGoogle, g])),
  gl:() => Promise.all([import("./maps/maplibreAdapter.js"), loadGl()]).then(([adapter, lib]) => [adapter.createMaplibre, lib]),
  leaflet:() => Promise.all([import("./maps/leafletAdapter.js"), loadLeaflet()]).then(([adapter, lib]) => [adapter.createLeaflet, lib]),
};
/* the key, from the newest frame (a rehearsal without a transport has none) */
function mapsNow() {
  return mapsConfig(mapsKeyFrame());
}
function webgl() {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch { return false; }
}
const rendererNow = () => pickRenderer({ ...mapsNow(), webgl:webgl(), googleFailed:googleFailed() });
/* start the download as soon as a game is running, so the first photo's
   map is ready when someone taps Guess where */
export function preloadGeoMap() {
  if (typeof window === "undefined") return;
  RENDERERS[rendererNow()]().catch(() => null);
}
const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
const storedType = () => { try { return window.localStorage.getItem(TYPE_KEY) === "satellite" ? "satellite" : "map"; } catch { return "map"; } };

/* a pin's element: the answer, your pin, or a player's (their photo chip,
   else their color and initials) */
function pinNode(kind, { color = "", label = "", drop = false, delay = 0, chip = false } = {}) {
  const outer = document.createElement("div");
  outer.className = `fd-geo-marker is-${kind}${drop ? " is-dropping" : ""}`;
  outer.dataset.kind = kind;
  if (color) outer.style.setProperty("--pin", color);
  if (delay) outer.style.setProperty("--drop-delay", `${delay}ms`);
  outer.innerHTML = kind === "answer"
    ? `<span class="fd-geo-pulse"></span><span class="fd-geo-head"><i></i></span>`
    : `<span class="fd-geo-head${chip ? " has-chip" : ""}">${label && !chip ? `<b>${label}</b>` : ""}</span><span class="fd-geo-stem"></span>`;
  return outer;
}
/* each pin's size as this map's CSS draws it (the TV's are bigger) */
function measurePins(host) {
  const take = (kind, fallback) => {
    const node = pinNode(kind);
    node.style.cssText = "position:absolute;left:0;top:0;visibility:hidden;pointer-events:none";
    host.append(node);
    const size = { w:node.offsetWidth || fallback.w, h:node.offsetHeight || fallback.h,
      head:node.querySelector(".fd-geo-head")?.offsetWidth || fallback.head };
    node.remove();
    return size;
  };
  return { guess:take("player", { w:36, h:48, head:30 }), answer:take("answer", { w:44, h:44, head:34 }) };
}

/* `pick`: tap anywhere (or drag the pin) to place one pin: onPick({ lat, lng }).
   `reveal`: the answer, every guess (a player's photo chip when it names
   its `player`) and a line from each to the answer; with `animate`, the
   guesses drop one by one, the lines draw out, the answer lands, and the
   camera opens to frame them all. `since`: how far into the reveal this
   screen is (the server clock), so a late screen joins mid-scene. `card`:
   the answer's card, set in the top corner no pin covers.
   `idle`: nothing drawn, the map kept loaded for the next reveal (the TV
   holds one map under the photo for the whole game).
   `settle`: before the beats, the reveal's views are drawn and their
   tiles waited for (REVEAL_SETTLE); `onStart({ since })` says when the
   beats begin and how far in (also at once without `settle`, and when the
   map fails), so a screen can hold a clean frame until then. */
export function GeoMap({ mode = "pick", pin = null, onPick, answer = null, guesses = [], className = "", label = "Map",
  interactive = true, animate = false, onTap, focus = null, pad = null, since = 0, card = null, gestures = "greedy",
  settle = false, onStart }) {
  const box = useRef(null), api = useRef(null), cardRef = useRef(null);
  const markers = useRef([]), timers = useRef([]), frames = useRef([]), seq = useRef(0);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const tapRef = useRef(onTap);
  tapRef.current = onTap;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const sinceRef = useRef(since);
  sinceRef.current = since;
  const startRef = useRef(onStart);
  startRef.current = onStart;
  /* the reveal on screen (none while idle) */
  const revealKey = mode === "reveal" ? JSON.stringify([answer, guesses]) : "";
  /* the pin was just dragged where it is: it stands there, it does not drop again */
  const dragged = useRef(false);
  const [renderer, setRenderer] = useState(rendererNow);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [types, setTypes] = useState([]);
  const [type, setType] = useState(storedType);
  const [chips, setChips] = useState([]);
  const [corner, setCorner] = useState(null);

  const stop = () => {
    markers.current.forEach(item => item.remove()); markers.current = [];
    timers.current.forEach(clearTimeout); timers.current = [];
    frames.current.forEach(cancelAnimationFrame); frames.current = [];
  };

  /* Google refused the key after all: the same map, on MapLibre */
  useEffect(() => renderer === "google"
    ? onGoogleFailure(() => setRenderer(pickRenderer({ webgl:webgl() }))) : undefined, [renderer]);

  useEffect(() => {
    let gone = false, made = null;
    setReady(false); setFailed(false); setTypes([]); setChips([]);
    RENDERERS[renderer]()
      .then(([create, library]) => {
        if (gone || !box.current) return;
        made = create(library, box.current, { interactive, gestures, home:HOME,
          onReady:() => { if (!gone) setReady(true); }, onFail:() => { if (!gone) setFailed(true); } });
        api.current = made;
        made.onClick(point => {
          if (modeRef.current !== "pick") return;
          dragged.current = false;
          tapRef.current?.();
          pickRef.current?.(point);
        });
        if (made.types.length) { made.setType(type); setTypes(made.types); }
      })
      .catch(() => {
        if (gone) return;
        if (renderer === "leaflet") setFailed(true);
        else setRenderer(renderer === "gl" || !webgl() ? "leaflet" : "gl");
      });
    return () => {
      gone = true;
      stop();
      api.current = null;
      try { made?.remove(); } catch {}
    };
  }, [renderer]); // eslint-disable-line react-hooks/exhaustive-deps

  /* your pin: it drops where you tap, and you can drag it */
  const pinKey = pin ? `${pin.lat.toFixed(5)},${pin.lng.toFixed(5)}` : "";
  useEffect(() => {
    const a = api.current;
    if (!ready || mode !== "pick" || !a) return;
    if (!pin) { a.setPin(null); return; }
    const drop = !dragged.current;
    dragged.current = false;
    a.setPin(pin, { node:pinNode("guess", { drop }), draggable:interactive, onDrag:point => {
      dragged.current = true;
      tapRef.current?.();
      pickRef.current?.(point);
    } });
    /* a pin set off screen (a search, a saved guess) comes into view */
    if (!a.inView(pin)) a.move({ ...pin, zoom:a.camera().zoom }, reducedMotion() ? 0 : 600);
  }, [ready, pinKey]); // eslint-disable-line react-hooks/exhaustive-deps

  /* a searched place: fly there ({ lat, lng, zoom, key }; the search's
     zooms are MapLibre's, one under a 256 px tile's) */
  useEffect(() => {
    const a = api.current;
    if (!ready || !focus || !a) return;
    a.move({ lat:focus.lat, lng:focus.lng, zoom:focus.zoom !== undefined ? focus.zoom + 1 : ZOOM.place },
      reducedMotion() ? 0 : 1400, { fly:true });
  }, [ready, focus?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  /* the reveal, on the beats of mapModel.js revealPlan; idle clears it
     and keeps the map */
  useEffect(() => {
    const a = api.current;
    if (!ready || !a || mode === "pick") return undefined;
    stop();
    setChips([]);
    a.setLines([], 1);
    const run = ++seq.current;
    if (mode !== "reveal") { setCorner(null); return undefined; }
    const live = () => seq.current === run && api.current === a;
    const after = (ms, fn) => timers.current.push(setTimeout(fn, ms));
    const size = a.size();
    const pins = measurePins(box.current);
    const cardBox = cardRef.current ? { w:cardRef.current.offsetWidth, h:cardRef.current.offsetHeight } : null;
    const points = [...guesses, ...(answer ? [answer] : [])];
    const kinds = [...guesses.map(() => "guess"), ...(answer ? ["answer"] : [])];
    const final = placeReveal({ points, kinds, size, pad:pad || PAD, pins, card:cardBox, inset:CARD_INSET,
      maxZoom:ZOOM.revealMax, single:ZOOM.single });
    const segs = answer ? guesses.map(guess => ({ from:guess, to:answer, color:guess.color })) : [];
    /* the guesses land first, framed (the card's corner kept clear); then
       the lines run to the answer as the camera opens to hold everything;
       then the answer lands */
    const start = guesses.length ? placeReveal({ points:guesses, kinds:guesses.map(() => "guess"), size, pad:START_PAD, pins,
      card:cardBox, inset:CARD_INSET, maxZoom:ZOOM.guessesMax, single:ZOOM.guessesMax,
      corners:final.corner ? [final.corner] : undefined }).camera : null;
    /* a pin: `delay` null stands it already landed, else it drops
       (negative: joined mid-fall) */
    const add = (item, kind, delay, i = 0) => {
      const chip = kind === "player" && !!item.player;
      const node = pinNode(kind, { color:item.color, label:item.label, drop:delay !== null, delay:delay || 0, chip });
      markers.current.push(a.addMarker(node, item, { anchor:kind === "answer" ? "center" : "bottom" }));
      if (chip) setChips(list => [...list, { key:`${run}:${i}`, node:node.querySelector(".fd-geo-head"), player:item.player,
        size:pins.guess.head }]);
    };
    const moving = animate && !reducedMotion();
    const plan = revealPlan(guesses.length);
    /* the beats, `since` ms in */
    const play = since => {
      setCorner(final.corner);
      startRef.current?.({ since });
      const at = moving ? revealAt(plan, since) : { over:true };
      if (at.over) {
        if (final.camera) a.move(final.camera, 0);
        guesses.forEach((guess, i) => add(guess, "player", null, i));
        a.setLines(segs, 1);
        if (answer) add(answer, "answer", null);
        return;
      }
      if (start || final.camera) a.move(start || final.camera, 0);
      if (final.camera) {
        if (at.cameraIn > 0) after(at.cameraIn, () => a.move(final.camera, REVEAL.camera));
        else a.move(final.camera, at.cameraMs);
      }
      guesses.forEach((guess, i) => {
        const delay = at.drops[i];
        if (delay === null || delay <= 0) add(guess, "player", delay, i);
        else after(delay, () => add(guess, "player", 0, i));
      });
      after(at.linesIn, () => {
        const from = at.linesFrom, ms = (1 - from) * REVEAL.lines, began = performance.now();
        const step = () => {
          if (api.current !== a) return;
          const k = ms > 0 ? Math.min(1, (performance.now() - began) / ms) : 1;
          a.setLines(segs, easeOut(from + (1 - from) * k));
          if (k < 1) frames.current.push(requestAnimationFrame(step));
        };
        step();
      });
      if (answer) {
        if (at.answer === null || at.answer <= 0) add(answer, "answer", at.answer);
        else after(at.answer, () => add(answer, "answer", 0));
      }
    };
    if (!settle) { play(sinceRef.current); return undefined; }
    /* the settle: the final framing drawn first (its tiles fetched for the
       camera's opening), then the frame the beats start on, each waited
       for within the one cap; a reveal that is over draws the final alone */
    const views = settleViews({ start, final:final.camera, size, over:!moving || revealAt(plan, sinceRef.current).over });
    const began = performance.now();
    (async () => {
      for (const view of views) {
        a.move(view.camera, 0);
        await a.settled(Math.min(view.ms, Math.max(0, REVEAL_SETTLE.cap - (performance.now() - began))));
        if (!live()) return;
      }
      play(sinceRef.current);
    })();
    return () => { if (seq.current === run) seq.current++; };
  }, [ready, revealKey, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  /* a map that never draws still lets its screen go on */
  useEffect(() => {
    if (failed && mode === "reveal") startRef.current?.({ since:sinceRef.current, failed:true });
  }, [failed, revealKey, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const chooseType = next => {
    setType(next);
    api.current?.setType(next);
    try { window.localStorage.setItem(TYPE_KEY, next); } catch {}
  };
  return <div className={`fd-geo-map is-${renderer}${className ? ` ${className}` : ""}`} role="application" aria-label={label}>
    <div ref={box} className="fd-geo-map-box" />
    {!ready && !failed && <span className="fd-geo-map-loading" aria-hidden="true" />}
    {failed && <p className="fd-geo-map-failed">The map didn't load. Check the connection.</p>}
    {ready && interactive && types.length > 1 && <div className="fd-geo-type" role="group" aria-label="Map type">
      {types.map(item => <button key={item} type="button" aria-pressed={type === item} onClick={() => chooseType(item)}>
        {item === "satellite" ? "Satellite" : "Map"}</button>)}
    </div>}
    {card && <div ref={cardRef} className={`fd-geo-card is-${corner || "tl"}${corner || failed ? " is-placed" : ""}`}>{card}</div>}
    {chips.map(chip => chip.node ? createPortal(<ChipFace p={chip.player} size={chip.size} />, chip.node, chip.key) : null)}
  </div>;
}
