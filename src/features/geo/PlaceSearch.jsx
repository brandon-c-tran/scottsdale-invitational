import React, { useEffect, useRef, useState } from "react";
import { tapTick } from "../../lib/haptics.js";

/* Search as you type over OpenStreetMap's places (Photon: free, no key),
   nudged toward the United States. Picking one hands back { lat, lng,
   name, zoom }: the map flies there and the pin drops on it. */
const ENDPOINT = "https://photon.komoot.io/api/";
const DEBOUNCE_MS = 280;

const placeLabel = p => [p.name, p.city !== p.name ? p.city : null, p.state, p.country !== "United States" ? p.country : null]
  .filter(Boolean).join(", ");
const zoomFor = p => ["country"].includes(p.type) ? 4 : ["state"].includes(p.type) ? 6 : ["city", "county", "district"].includes(p.type) ? 11 : 16;

export function PlaceSearch({ onPick, className = "", placeholder = "Search a place" }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const seq = useRef(0), picked = useRef(false);
  useEffect(() => {
    /* the box shows the chosen place's name: that is not a new search */
    if (picked.current) { picked.current = false; return undefined; }
    const q = query.trim();
    if (q.length < 2) { setResults([]); return undefined; }
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`${ENDPOINT}?q=${encodeURIComponent(q)}&limit=5&lang=en&lat=39&lon=-98`);
        const body = r.ok ? await r.json() : null;
        if (mine !== seq.current) return;
        setResults((body?.features || []).filter(f => Array.isArray(f.geometry?.coordinates)).slice(0, 5)
          .map((f, i) => ({ key:`${f.properties.osm_id || i}`, label:placeLabel(f.properties), lng:f.geometry.coordinates[0],
            lat:f.geometry.coordinates[1], name:f.properties.name || "", zoom:zoomFor(f.properties) })));
        setOpen(true);
      } catch { if (mine === seq.current) setResults([]); }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);
  const pick = result => {
    tapTick();
    onPick(result);
    setOpen(false);
    picked.current = true;
    seq.current += 1;
    setQuery(result.label);
    document.activeElement?.blur?.();
  };
  return <div className={`fd-geo-place${className ? ` ${className}` : ""}`}>
    <input type="search" value={query} placeholder={placeholder} aria-label={placeholder} autoComplete="off" enterKeyHint="search"
      onChange={event => { setQuery(event.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
      onKeyDown={event => { if (event.key === "Enter" && results[0]) { event.preventDefault(); pick(results[0]); } }} />
    {open && results.length > 0 && <ul role="listbox">
      {results.map(result => <li key={result.key}>
        <button type="button" role="option" aria-selected="false" onClick={() => pick(result)}>{result.label}</button>
      </li>)}
    </ul>}
  </div>;
}
