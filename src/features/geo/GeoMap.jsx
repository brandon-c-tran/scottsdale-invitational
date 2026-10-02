import React, { useEffect, useRef, useState } from "react";
import "./geo.css";

/* Leaflet loads only when a Where and When map is first on screen. */
let leaflet = null;
const loadLeaflet = () => leaflet || (leaflet = Promise.all([import("leaflet"), import("leaflet/dist/leaflet.css")])
  .then(([mod]) => mod.default || mod));

/* OpenStreetMap's own tiles: no key, fine for a room of thirteen (CARTO's
   free basemaps now answer "API key required"). geo.css darkens them. */
const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
/* the lower 48, where most of the group's photos will be */
const HOME = { center:[39.5, -98.35], zoom:3 };

const pinHtml = (kind, color = "", label = "") =>
  `<span class="fd-geo-pin is-${kind}" style="${color ? `--pin:${color}` : ""}">${label ? `<b>${label}</b>` : ""}</span>`;

/* `pick`: tap to place one pin (onPick({ lat, lng })). `reveal`: the answer,
   every guess in its player's color with a line to the answer, framed. */
export function GeoMap({ mode = "pick", pin = null, onPick, answer = null, guesses = [], className = "", label = "Map",
  interactive = true }) {
  const box = useRef(null), map = useRef(null), layer = useRef(null), L = useRef(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let gone = false;
    loadLeaflet().then(lib => {
      if (gone || !box.current) return;
      L.current = lib;
      const m = lib.map(box.current, { zoomControl:interactive, attributionControl:true, worldCopyJump:true,
        dragging:interactive, scrollWheelZoom:interactive, doubleClickZoom:interactive, touchZoom:interactive,
        boxZoom:false, keyboard:interactive, tap:interactive }).setView(HOME.center, HOME.zoom);
      lib.tileLayer(TILES, { attribution:ATTRIBUTION, maxZoom:19 }).addTo(m);
      layer.current = lib.layerGroup().addTo(m);
      m.on("click", event => {
        if (mode !== "pick") return;
        const point = event.latlng.wrap();
        pickRef.current?.({ lat:point.lat, lng:point.lng });
      });
      map.current = m;
      setReady(true);
      /* the sheet or canvas may still be settling its size */
      setTimeout(() => m.invalidateSize(), 250);
    }).catch(() => { if (!gone) setFailed(true); });
    return () => { gone = true; map.current?.remove(); map.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* draw the pins whenever they change */
  const key = JSON.stringify([mode, pin, answer, guesses]);
  useEffect(() => {
    const lib = L.current, m = map.current, group = layer.current;
    if (!ready || !lib || !m || !group) return;
    group.clearLayers();
    const icon = html => lib.divIcon({ html, className:"fd-geo-icon", iconSize:[28, 28], iconAnchor:[14, 14] });
    if (mode === "pick") {
      if (pin) {
        lib.marker([pin.lat, pin.lng], { icon:icon(pinHtml("guess")), keyboard:false }).addTo(group);
        if (m.getZoom() < 4) m.setView([pin.lat, pin.lng], 4);
      }
      return;
    }
    const points = [];
    for (const guess of guesses) {
      if (answer) lib.polyline([[guess.lat, guess.lng], [answer.lat, answer.lng]],
        { color:guess.color || "#e8d48b", weight:2, opacity:0.75, dashArray:"6 6" }).addTo(group);
      lib.marker([guess.lat, guess.lng], { icon:icon(pinHtml("player", guess.color, guess.label)), keyboard:false })
        .addTo(group);
      points.push([guess.lat, guess.lng]);
    }
    if (answer) {
      lib.marker([answer.lat, answer.lng], { icon:icon(pinHtml("answer")), keyboard:false, zIndexOffset:1000 }).addTo(group);
      points.push([answer.lat, answer.lng]);
    }
    if (points.length > 1) m.fitBounds(points, { padding:[40, 40], maxZoom:13 });
    else if (points.length === 1) m.setView(points[0], 11);
  }, [ready, key]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div className={`fd-geo-map${className ? ` ${className}` : ""}`} role="application" aria-label={label}>
    <div ref={box} className="fd-geo-map-box" />
    {failed && <p className="fd-geo-map-failed">The map didn't load. Check the connection.</p>}
  </div>;
}
