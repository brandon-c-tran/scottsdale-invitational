/* The Leaflet renderer (the adapter contract is in ../mapModel.js):
   OpenStreetMap's raster tiles, for a device without WebGL. Markers are
   the same nodes the other renderers draw (a DivIcon holding the element). */
const RASTER = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const CREDIT = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export function createLeaflet(L, box, { interactive = true, home, onReady }) {
  /* quarter zooms, so the camera the reveal computes is the one it gets */
  const m = L.map(box, { zoomControl:interactive, dragging:interactive, scrollWheelZoom:interactive,
    doubleClickZoom:interactive, touchZoom:interactive, keyboard:false, boxZoom:false, worldCopyJump:true,
    zoomSnap:0.25, zoomDelta:1 }).setView([home.lat, home.lng], 3);
  const layer = L.tileLayer(RASTER, { attribution:CREDIT, maxZoom:19 }).addTo(m);
  setTimeout(() => m.invalidateSize(), 250);
  /* a node's own size (as the page's CSS draws it) sets its icon's,
     anchored at its foot or its middle */
  const icon = (node, anchor) => {
    node.style.visibility = "hidden";
    box.append(node);
    const w = node.offsetWidth || 36, h = node.offsetHeight || 48;
    node.remove();
    node.style.visibility = "";
    return L.divIcon({ html:node, className:"fd-geo-icon", iconSize:[w, h], iconAnchor:anchor === "center" ? [w / 2, h / 2] : [w / 2, h] });
  };
  let pin = null;
  const lines = [];
  queueMicrotask(() => onReady?.());
  return {
    kind:"leaflet",
    map:m,
    size:() => ({ width:box.clientWidth, height:box.clientHeight }),
    camera:() => { const c = m.getCenter(); return { lat:c.lat, lng:c.lng, zoom:m.getZoom() }; },
    move(cam, ms = 0) {
      const zoom = Math.floor(cam.zoom * 4) / 4;
      m.setView([cam.lat, cam.lng], zoom, ms > 0 ? { animate:true, duration:ms / 1000 } : { animate:false });
    },
    onClick(fn) {
      m.on("click", event => { const point = event.latlng.wrap(); fn({ lat:point.lat, lng:point.lng }); });
    },
    setPin(point, { node, draggable = true, onDrag } = {}) {
      pin?.remove(); pin = null;
      if (!point) return;
      pin = L.marker([point.lat, point.lng], { icon:icon(node, "bottom"), draggable, keyboard:false }).addTo(m);
      pin.on("dragend", () => { const p = pin.getLatLng().wrap(); onDrag?.({ lat:p.lat, lng:p.lng }); });
    },
    inView(point) { return m.getBounds().contains([point.lat, point.lng]); },
    addMarker(node, point, { anchor = "bottom" } = {}) {
      return L.marker([point.lat, point.lng], { icon:icon(node, anchor), keyboard:false }).addTo(m);
    },
    /* Leaflet draws the lines whole once they are due (no per-frame growth) */
    setLines(segs, k = 1) {
      lines.splice(0).forEach(line => line.remove());
      if (k < 1) return;
      segs.forEach(seg => lines.push(L.polyline([[seg.from.lat, seg.from.lng], [seg.to.lat, seg.to.lng]],
        { color:seg.color || "#f4ecd8", weight:3, opacity:0.85, dashArray:"6 6" }).addTo(m)));
    },
    types:[],
    setType() {},
    /* the tile layer's load: every tile of the view in (a jump starts
       loading at once, so a layer not loading has nothing to wait for) */
    settled(ms = 1200) {
      return new Promise(resolve => {
        let timer = 0;
        const done = () => { clearTimeout(timer); layer.off?.("load", done); resolve(); };
        if (!layer.isLoading?.()) { timer = setTimeout(done, 0); return; }
        timer = setTimeout(done, ms);
        layer.once("load", done);
      });
    },
    remove() { pin?.remove(); m.remove(); },
  };
}
