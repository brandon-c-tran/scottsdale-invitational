import React, { useEffect, useRef, useState } from "react";
import "./geo.css";

/* Where and When's map. A vector map (MapLibre over OpenFreeMap's free
   "Liberty" style: OpenStreetMap's landmarks, parks, water, roads and
   street names with their icons, the closest free match to Google Maps;
   smooth pinch and zoom, crisp labels at every zoom), loaded only when a
   map first shows. A device without WebGL gets raster tiles through
   Leaflet instead. Both draw the same pins. */
const STYLE = "https://tiles.openfreemap.org/styles/liberty";
const RASTER = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const RASTER_CREDIT = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
/* the lower 48, where most of the group's photos will be */
const HOME = { lng:-97, lat:38.5, zoom:2.4 };

let glLoad = null, leafletLoad = null;
const loadGl = () => glLoad || (glLoad = Promise.all([import("maplibre-gl"), import("maplibre-gl/dist/maplibre-gl.css")])
  .then(([mod]) => mod.default || mod));
const loadLeaflet = () => leafletLoad || (leafletLoad = Promise.all([import("leaflet"), import("leaflet/dist/leaflet.css")])
  .then(([mod]) => mod.default || mod));
/* start the download as soon as a game is running, so the first photo's
   map is ready when someone taps Guess where */
export function preloadGeoMap() {
  if (typeof window === "undefined") return;
  (webgl() ? loadGl() : loadLeaflet()).catch(() => null);
}
function webgl() {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch { return false; }
}
const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

/* a pin's element: the answer, your pin, or a player's (their color and initials) */
function pinNode(kind, { color = "", label = "", drop = false, delay = 0 } = {}) {
  const outer = document.createElement("div");
  outer.className = `fd-geo-marker is-${kind}${drop ? " is-dropping" : ""}`;
  if (color) outer.style.setProperty("--pin", color);
  if (delay) outer.style.setProperty("--drop-delay", `${delay}ms`);
  outer.innerHTML = kind === "answer"
    ? `<span class="fd-geo-pulse"></span><span class="fd-geo-head"><i></i></span>`
    : `<span class="fd-geo-head">${label ? `<b>${label}</b>` : ""}</span><span class="fd-geo-stem"></span>`;
  return outer;
}

/* `pick`: tap anywhere (or drag the pin) to place one pin: onPick({ lat, lng }).
   `reveal`: the answer, every guess and a line from each to the answer;
   with `animate`, the guesses drop one by one, the lines draw out, the
   answer lands, and the camera opens to frame them all. */
export function GeoMap({ mode = "pick", pin = null, onPick, answer = null, guesses = [], className = "", label = "Map",
  interactive = true, animate = false, onTap, focus = null }) {
  const box = useRef(null), map = useRef(null), lib = useRef(null), kind = useRef(null);
  const markers = useRef([]), pinMarker = useRef(null), timers = useRef([]);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const tapRef = useRef(onTap);
  tapRef.current = onTap;
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let gone = false;
    const after = (ms, fn) => timers.current.push(setTimeout(fn, ms));
    const startGl = maplibre => {
      const m = new maplibre.Map({ container:box.current, style:STYLE, center:[HOME.lng, HOME.lat], zoom:HOME.zoom,
        attributionControl:{ compact:true }, interactive, dragRotate:false, pitchWithRotate:false, touchPitch:false,
        renderWorldCopies:true, fadeDuration:150 });
      m.touchZoomRotate?.disableRotation();
      m.on("click", event => {
        if (mode !== "pick") return;
        const point = event.lngLat.wrap();
        tapRef.current?.();
        pickRef.current?.({ lat:point.lat, lng:point.lng });
      });
      /* a point of interest the style names but ships no icon for draws
         without one, instead of warning */
      m.on("styleimagemissing", event => {
        if (!m.hasImage(event.id)) m.addImage(event.id, { width:1, height:1, data:new Uint8Array(4) });
      });
      m.on("load", () => {
        if (gone) return;
        /* the credit starts folded to its (i), not open across the map */
        box.current?.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
        setReady(true);
      });
      m.on("error", event => { if (!m.loaded() && /style|Failed to fetch/i.test(String(event?.error?.message || ""))) setFailed(true); });
      return m;
    };
    const startLeaflet = L => {
      const m = L.map(box.current, { zoomControl:interactive, dragging:interactive, scrollWheelZoom:interactive,
        doubleClickZoom:interactive, touchZoom:interactive, keyboard:false, boxZoom:false, worldCopyJump:true })
        .setView([HOME.lat, HOME.lng], 3);
      L.tileLayer(RASTER, { attribution:RASTER_CREDIT, maxZoom:19 }).addTo(m);
      m.on("click", event => {
        if (mode !== "pick") return;
        const point = event.latlng.wrap();
        tapRef.current?.();
        pickRef.current?.({ lat:point.lat, lng:point.lng });
      });
      after(250, () => m.invalidateSize());
      setReady(true);
      return m;
    };
    (webgl() ? loadGl().then(maplibre => ["gl", maplibre]) : loadLeaflet().then(L => ["leaflet", L]))
      .catch(() => loadLeaflet().then(L => ["leaflet", L]))
      .then(([which, library]) => {
        if (gone || !box.current) return;
        kind.current = which; lib.current = library;
        map.current = which === "gl" ? startGl(library) : startLeaflet(library);
      })
      .catch(() => { if (!gone) setFailed(true); });
    return () => {
      gone = true;
      timers.current.forEach(clearTimeout); timers.current = [];
      map.current?.remove(); map.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* your pin: it drops where you tap, and you can drag it */
  const pinKey = pin ? `${pin.lat.toFixed(5)},${pin.lng.toFixed(5)}` : "";
  useEffect(() => {
    if (!ready || mode !== "pick") return;
    const m = map.current, L = lib.current;
    pinMarker.current?.remove?.();
    pinMarker.current = null;
    if (!pin) return;
    const node = pinNode("guess", { drop:true });
    if (kind.current === "gl") {
      pinMarker.current = new L.Marker({ element:node, anchor:"bottom", draggable:interactive })
        .setLngLat([pin.lng, pin.lat]).addTo(m);
      /* a pin set off screen (a search, a saved guess) comes into view */
      if (!m.getBounds().contains([pin.lng, pin.lat])) m.easeTo({ center:[pin.lng, pin.lat], duration:reducedMotion() ? 0 : 600 });
      pinMarker.current.on("dragend", () => {
        const point = pinMarker.current.getLngLat().wrap();
        tapRef.current?.();
        pickRef.current?.({ lat:point.lat, lng:point.lng });
      });
    } else {
      const icon = L.divIcon({ html:node.outerHTML, className:"fd-geo-icon", iconSize:[36, 48], iconAnchor:[18, 48] });
      pinMarker.current = L.marker([pin.lat, pin.lng], { icon, draggable:interactive, keyboard:false }).addTo(m);
      pinMarker.current.on("dragend", () => {
        const point = pinMarker.current.getLatLng().wrap();
        pickRef.current?.({ lat:point.lat, lng:point.lng });
      });
    }
  }, [ready, pinKey]); // eslint-disable-line react-hooks/exhaustive-deps

  /* a searched place: fly there ({ lat, lng, zoom, key }) */
  useEffect(() => {
    if (!ready || !focus) return;
    const m = map.current;
    if (kind.current === "gl") m.flyTo({ center:[focus.lng, focus.lat], zoom:focus.zoom ?? 14, duration:reducedMotion() ? 0 : 1400,
      essential:true });
    else m.setView([focus.lat, focus.lng], focus.zoom ?? 14);
  }, [ready, focus?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  /* the reveal */
  const revealKey = JSON.stringify([answer, guesses]);
  useEffect(() => {
    if (!ready || mode !== "reveal") return;
    const m = map.current, L = lib.current, gl = kind.current === "gl";
    markers.current.forEach(item => item.remove()); markers.current = [];
    timers.current.forEach(clearTimeout); timers.current = [];
    const after = (ms, fn) => timers.current.push(setTimeout(fn, ms));
    const moving = animate && !reducedMotion();
    const points = [...guesses.map(guess => [guess.lng, guess.lat]), ...(answer ? [[answer.lng, answer.lat]] : [])];
    const frame = (duration = 0) => {
      if (!points.length) return;
      if (gl) {
        if (points.length === 1) m.easeTo({ center:points[0], zoom:11, duration });
        else {
          const bounds = points.reduce((b, p) => b.extend(p), new L.LngLatBounds(points[0], points[0]));
          m.fitBounds(bounds, { padding:{ top:70, bottom:70, left:60, right:60 }, maxZoom:13, duration });
        }
      } else if (points.length === 1) m.setView([points[0][1], points[0][0]], 11);
      else m.fitBounds(points.map(([lng, lat]) => [lat, lng]), { padding:[50, 50], maxZoom:13 });
    };
    const addMarker = (node, lng, lat) => {
      if (gl) markers.current.push(new L.Marker({ element:node, anchor:node.classList.contains("is-answer") ? "center" : "bottom" })
        .setLngLat([lng, lat]).addTo(m));
      else {
        const answerPin = node.classList.contains("is-answer");
        const icon = L.divIcon({ html:node.outerHTML, className:"fd-geo-icon", iconSize:answerPin ? [44, 44] : [36, 48],
          iconAnchor:answerPin ? [22, 22] : [18, 48] });
        markers.current.push(L.marker([lat, lng], { icon, keyboard:false }).addTo(m));
      }
    };
    /* lines grow from each guess to the answer */
    const LINES = "fd-geo-lines";
    const lineData = progress => ({ type:"FeatureCollection", features:answer ? guesses.map(guess => ({
      type:"Feature", properties:{ color:guess.color || "#e8d48b" },
      geometry:{ type:"LineString", coordinates:[[guess.lng, guess.lat],
        [guess.lng + (answer.lng - guess.lng) * progress, guess.lat + (answer.lat - guess.lat) * progress]] },
    })) : [] });
    const drawLines = progress => {
      if (gl) {
        const source = m.getSource(LINES);
        if (source) source.setData(lineData(progress));
        else {
          m.addSource(LINES, { type:"geojson", data:lineData(progress) });
          m.addLayer({ id:LINES, type:"line", source:LINES, layout:{ "line-cap":"round" },
            paint:{ "line-color":["get", "color"], "line-width":3, "line-opacity":0.9, "line-dasharray":[1.5, 1.5] } });
        }
      } else if (progress >= 1 && answer) {
        guesses.forEach(guess => markers.current.push(L.polyline([[guess.lat, guess.lng], [answer.lat, answer.lng]],
          { color:guess.color || "#e8d48b", weight:3, opacity:0.85, dashArray:"6 6" }).addTo(m)));
      }
    };
    if (!moving) {
      frame(0);
      guesses.forEach(guess => addMarker(pinNode("player", { color:guess.color, label:guess.label }), guess.lng, guess.lat));
      drawLines(1);
      if (answer) addMarker(pinNode("answer"), answer.lng, answer.lat);
      return undefined;
    }
    /* the guesses land first, framed; then the lines run to the answer as
       it lands; then the camera opens to hold everything */
    const drop = 110;
    if (gl && guesses.length) {
      const g = guesses.map(guess => [guess.lng, guess.lat]);
      const start = g.reduce((b, p) => b.extend(p), new L.LngLatBounds(g[0], g[0]));
      m.fitBounds(start, { padding:80, maxZoom:9, duration:0 });
    } else frame(0);
    guesses.forEach((guess, i) => after(300 + i * drop, () =>
      addMarker(pinNode("player", { color:guess.color, label:guess.label, drop:true }), guess.lng, guess.lat)));
    const linesAt = 300 + guesses.length * drop + 250;
    after(linesAt, () => {
      frame(1300);
      const began = performance.now();
      const step = () => {
        if (map.current !== m) return;
        const k = Math.min(1, (performance.now() - began) / 1100);
        drawLines(1 - (1 - k) ** 3);
        if (k < 1) requestAnimationFrame(step);
      };
      if (gl) step(); else drawLines(1);
    });
    if (answer) after(linesAt + 1000, () => addMarker(pinNode("answer", { drop:true }), answer.lng, answer.lat));
    return undefined;
  }, [ready, revealKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div className={`fd-geo-map${className ? ` ${className}` : ""}`} role="application" aria-label={label}>
    <div ref={box} className="fd-geo-map-box" />
    {!ready && !failed && <span className="fd-geo-map-loading" aria-hidden="true" />}
    {failed && <p className="fd-geo-map-failed">The map didn't load. Check the connection.</p>}
  </div>;
}
