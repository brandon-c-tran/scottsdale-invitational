/* The Google renderer (the adapter contract is in ../mapModel.js): Google's
   own map in the Backglass style (a JSON style, no Map ID), a Map /
   Satellite switch (satellite is Google's hybrid: imagery with names),
   greedy one-finger gestures on the phone's full-bleed map, and none of
   Google's chrome (no Street View, fullscreen or map type control). Pins
   are our own HTML nodes on an OverlayView, so no Map ID or Advanced
   Markers are needed and they are the very nodes the other renderers draw.
   The camera moves by our own tween (fractional zoom), so a reveal opens
   the same way on every renderer. */
import { BACKGLASS_MAP_BACKGROUND, BACKGLASS_MAP_STYLE } from "./googleStyle.js";
import { cameraAlong, sameCamera } from "../mapModel.js";

const easeInOut = k => k < .5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
const wrapLng = lng => ((lng + 180) % 360 + 360) % 360 - 180;

export function googleMapOptions({ interactive = true, gestures = "greedy", home }) {
  return {
    center:{ lat:home.lat, lng:home.lng }, zoom:home.zoom, minZoom:2, maxZoom:20,
    mapTypeId:"roadmap", styles:BACKGLASS_MAP_STYLE, backgroundColor:BACKGLASS_MAP_BACKGROUND,
    disableDefaultUI:true, zoomControl:false, mapTypeControl:false, streetViewControl:false, fullscreenControl:false,
    rotateControl:false, scaleControl:false, cameraControl:false, keyboardShortcuts:false, clickableIcons:false,
    gestureHandling:interactive ? gestures : "none", isFractionalZoomEnabled:true, tilt:0, heading:0,
  };
}

export function createGoogle(g, box, { interactive = true, gestures = "greedy", home, onReady }) {
  /* Google writes its own inline position on the element it draws in, so
     it gets a child of ours that fills the box */
  const host = document.createElement("div");
  host.className = "fd-geo-gmap";
  host.style.width = "100%";
  host.style.height = "100%";
  box.append(host);
  const map = new g.Map(host, googleMapOptions({ interactive, gestures, home }));
  g.event.addListenerOnce(map, "idle", () => onReady?.());

  /* an HTML node pinned to a point: anchored at its foot ("bottom") or its middle */
  class HtmlPin extends g.OverlayView {
    constructor(node, point, anchor) {
      super();
      this.point = point;
      this.wrap = document.createElement("div");
      this.wrap.className = `fd-geo-gpin is-${anchor}`;
      const seat = document.createElement("div");
      seat.className = "fd-geo-gpin-seat";
      seat.append(node);
      this.wrap.append(seat);
      g.OverlayView.preventMapHitsAndGesturesFrom?.(this.wrap);
    }
    onAdd() { this.getPanes().overlayMouseTarget.append(this.wrap); }
    draw() {
      const p = this.getProjection()?.fromLatLngToDivPixel(new g.LatLng(this.point.lat, this.point.lng));
      if (p) this.wrap.style.transform = `translate(${p.x}px, ${p.y}px)`;
    }
    onRemove() { this.wrap.remove(); }
    move(point) { this.point = point; this.draw(); }
    remove() { this.setMap(null); }
  }
  /* a projection for pixels: an overlay with nothing in it */
  const probe = new HtmlPin(document.createElement("i"), home, "center");
  probe.setMap(map);

  /* `moved`: the view changed since its tiles last finished (Google says
     tilesloaded only after a change, so an unmoved view is already in) */
  let pin = null, raf = 0, moved = true;
  const lines = [];
  const camera = () => { const c = map.getCenter(); return { lat:c.lat(), lng:c.lng(), zoom:map.getZoom() }; };
  const jump = cam => {
    if (!sameCamera(camera(), cam)) moved = true;
    map.moveCamera({ center:{ lat:cam.lat, lng:cam.lng }, zoom:cam.zoom });
  };
  const dash = color => [{ icon:{ path:"M 0,-1 0,1", strokeOpacity:0.9, strokeColor:color, strokeWeight:3, scale:3 },
    offset:"0", repeat:"14px" }];

  return {
    kind:"google",
    map,
    size:() => ({ width:box.clientWidth, height:box.clientHeight }),
    camera,
    /* `fly`: a long move lifts out and comes back down, as Google's own does */
    move(cam, ms = 0, { fly = false } = {}) {
      cancelAnimationFrame(raf);
      if (!(ms > 0)) { jump(cam); return; }
      const from = camera(), began = performance.now();
      const far = Math.hypot(cam.lat - from.lat, cam.lng - from.lng);
      const lift = fly ? Math.min(4, Math.max(0, Math.log2(far + 1) * 1.2)) : 0;
      const step = () => {
        const k = Math.min(1, (performance.now() - began) / ms), e = easeInOut(k);
        const at = cameraAlong(from, cam, e);
        jump({ ...at, zoom:at.zoom - lift * Math.sin(Math.PI * e) });
        if (k < 1) raf = requestAnimationFrame(step);
      };
      step();
    },
    onClick(fn) {
      map.addListener("click", event => {
        if (!event.latLng) return;
        event.stop?.();
        fn({ lat:event.latLng.lat(), lng:wrapLng(event.latLng.lng()) });
      });
    },
    /* the pick pin: our node, dragged with the finger (the map holds still
       while it moves) */
    setPin(point, { node, draggable = true, onDrag } = {}) {
      pin?.remove(); pin = null;
      if (!point) return;
      pin = new HtmlPin(node, point, "bottom");
      pin.setMap(map);
      if (!draggable) return;
      pin.wrap.style.touchAction = "none";
      let grab = null;
      pin.wrap.addEventListener("pointerdown", event => {
        const projection = probe.getProjection();
        if (!projection) return;
        const rect = map.getDiv().getBoundingClientRect();
        const at = projection.fromLatLngToContainerPixel(new g.LatLng(pin.point.lat, pin.point.lng));
        grab = { id:event.pointerId, dx:event.clientX - rect.left - at.x, dy:event.clientY - rect.top - at.y };
        pin.wrap.setPointerCapture?.(event.pointerId);
        pin.wrap.classList.add("is-dragging");
        event.stopPropagation();
      });
      const where = event => {
        const rect = map.getDiv().getBoundingClientRect();
        const ll = probe.getProjection().fromContainerPixelToLatLng(
          new g.Point(event.clientX - rect.left - grab.dx, event.clientY - rect.top - grab.dy));
        return { lat:ll.lat(), lng:wrapLng(ll.lng()) };
      };
      pin.wrap.addEventListener("pointermove", event => {
        if (!grab || event.pointerId !== grab.id) return;
        pin.move(where(event));
      });
      const drop = event => {
        if (!grab || event.pointerId !== grab.id) return;
        const moved = where(event);
        grab = null;
        pin.wrap.classList.remove("is-dragging");
        pin.move(moved);
        onDrag?.(moved);
      };
      pin.wrap.addEventListener("pointerup", drop);
      pin.wrap.addEventListener("pointercancel", drop);
    },
    inView(point) { return !!map.getBounds()?.contains(point); },
    addMarker(node, point, { anchor = "bottom" } = {}) {
      const marker = new HtmlPin(node, point, anchor);
      marker.setMap(map);
      return marker;
    },
    setLines(segs, k = 1) {
      while (lines.length > segs.length) lines.pop().setMap(null);
      segs.forEach((seg, i) => {
        const path = [seg.from, { lat:seg.from.lat + (seg.to.lat - seg.from.lat) * k, lng:seg.from.lng + (seg.to.lng - seg.from.lng) * k }];
        if (lines[i]) { lines[i].setPath(path); return; }
        lines.push(new g.Polyline({ map, path, geodesic:false, clickable:false, strokeOpacity:0, icons:dash(seg.color || "#f4ecd8") }));
      });
    },
    types:["map", "satellite"],
    setType(type) { moved = true; map.setMapTypeId(type === "satellite" ? "hybrid" : "roadmap"); },
    settled(ms = 1200) {
      return new Promise(resolve => {
        let timer = 0, listener = null;
        const done = loaded => { clearTimeout(timer); listener?.remove?.(); if (loaded) moved = false; resolve(); };
        if (!moved) { timer = setTimeout(done, 0); return; }
        timer = setTimeout(done, ms);
        listener = g.event.addListenerOnce(map, "tilesloaded", () => done(true));
      });
    },
    remove() {
      cancelAnimationFrame(raf);
      pin?.remove();
      lines.splice(0).forEach(line => line.setMap(null));
      probe.setMap(null);
      g.event.clearInstanceListeners(map);
      host.remove();
    },
  };
}
