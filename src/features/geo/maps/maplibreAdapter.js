/* The MapLibre renderer (the adapter contract is in ../mapModel.js): a
   vector map over OpenFreeMap's free "Liberty" style, OpenStreetMap's
   landmarks, parks, water and street names. The map without a Google key.
   MapLibre's tiles are 512 px, so its zoom is the contract's (256 px) less one. */
export const LIBERTY = "https://tiles.openfreemap.org/styles/liberty";
const LINES = "fd-geo-lines";

export function createMaplibre(maplibre, box, { interactive = true, home, onReady, onFail }) {
  const m = new maplibre.Map({ container:box, style:LIBERTY, center:[home.lng, home.lat], zoom:home.zoom - 1,
    attributionControl:{ compact:true }, interactive, dragRotate:false, pitchWithRotate:false, touchPitch:false,
    renderWorldCopies:true, fadeDuration:150 });
  m.touchZoomRotate?.disableRotation();
  /* a point of interest the style names but ships no icon for draws
     without one, instead of warning */
  m.on("styleimagemissing", event => {
    if (!m.hasImage(event.id)) m.addImage(event.id, { width:1, height:1, data:new Uint8Array(4) });
  });
  m.on("load", () => {
    /* the credit starts folded to its (i), not open across the map */
    box.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
    onReady?.();
  });
  m.on("error", event => { if (!m.loaded() && /style|Failed to fetch/i.test(String(event?.error?.message || ""))) onFail?.(); });
  let pin = null;
  const segData = (segs, k) => ({ type:"FeatureCollection", features:segs.map(seg => ({
    type:"Feature", properties:{ color:seg.color || "#f4ecd8" },
    geometry:{ type:"LineString", coordinates:[[seg.from.lng, seg.from.lat],
      [seg.from.lng + (seg.to.lng - seg.from.lng) * k, seg.from.lat + (seg.to.lat - seg.from.lat) * k]] },
  })) });
  return {
    kind:"gl",
    map:m,
    size:() => ({ width:box.clientWidth, height:box.clientHeight }),
    camera:() => { const c = m.getCenter(); return { lat:c.lat, lng:c.lng, zoom:m.getZoom() + 1 }; },
    move(cam, ms = 0, { fly = false } = {}) {
      const to = { center:[cam.lng, cam.lat], zoom:cam.zoom - 1 };
      if (!(ms > 0)) m.jumpTo(to);
      else if (fly) m.flyTo({ ...to, duration:ms, essential:true });
      else m.easeTo({ ...to, duration:ms, essential:true });
    },
    onClick(fn) {
      m.on("click", event => { const point = event.lngLat.wrap(); fn({ lat:point.lat, lng:point.lng }); });
    },
    setPin(point, { node, draggable = true, onDrag } = {}) {
      pin?.remove(); pin = null;
      if (!point) return;
      pin = new maplibre.Marker({ element:node, anchor:"bottom", draggable }).setLngLat([point.lng, point.lat]).addTo(m);
      pin.on("dragend", () => { const p = pin.getLngLat().wrap(); onDrag?.({ lat:p.lat, lng:p.lng }); });
    },
    inView(point) { return m.getBounds().contains([point.lng, point.lat]); },
    addMarker(node, point, { anchor = "bottom" } = {}) {
      return new maplibre.Marker({ element:node, anchor }).setLngLat([point.lng, point.lat]).addTo(m);
    },
    setLines(segs, k = 1) {
      const source = m.getSource(LINES);
      if (source) { source.setData(segData(segs, k)); return; }
      if (!segs.length) return;
      m.addSource(LINES, { type:"geojson", data:segData(segs, k) });
      m.addLayer({ id:LINES, type:"line", source:LINES, layout:{ "line-cap":"round" },
        paint:{ "line-color":["get", "color"], "line-width":3, "line-opacity":0.9, "line-dasharray":[1.5, 1.5] } });
    },
    types:[],
    setType() {},
    remove() { pin?.remove(); m.remove(); },
  };
}
