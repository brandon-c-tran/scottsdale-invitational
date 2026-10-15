/* Where and When on Google's map (Oct 14): one game over three renderers
   behind one adapter (src/features/geo/mapModel.js), Google's only with a
   key the Worker hands out, its script by tag and never in the bundle, and
   the answer's card never over a pin. */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ADAPTER_MEMBERS, CARD_CORNERS, REVEAL, cardCovered, cardRect, fitCamera, mapsConfig, pickRenderer, pinBox, placeReveal,
  project, revealAt, revealPlan,
} from "../src/features/geo/mapModel.js";
import { googleFailed, resetGoogleState } from "../src/features/geo/maps/googleState.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = path => readFileSync(join(root, path), "utf8");

/* ── a little DOM, enough for the adapters ── */
function el(tag = "div") {
  const node = {
    tag, children:[], parent:null, className:"", innerHTML:"", dataset:{}, listeners:{},
    style:{ cssText:"", setProperty(name, value) { this[name] = value; } },
    classList:{ set:new Set(), add(c) { this.set.add(c); }, remove(c) { this.set.delete(c); } },
    offsetWidth:40, offsetHeight:50, clientWidth:1000, clientHeight:700,
    append(...nodes) { nodes.forEach(n => { n.parent?.children.splice(n.parent.children.indexOf(n), 1); n.parent = this; this.children.push(n); }); },
    remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; },
    replaceChildren() { this.children = []; },
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
    querySelector() { return null },
    getBoundingClientRect:() => ({ left:0, top:0 }),
    setPointerCapture() {},
  };
  return node;
}
async function withDom(fn) {
  const saved = { document:globalThis.document, window:globalThis.window };
  const head = el("head");
  globalThis.document = { head, createElement:el };
  globalThis.window = {};
  try { return await fn({ head }); } finally { Object.assign(globalThis, saved); }
}

/* ── the renderer and its gate ── */
test("no key draws MapLibre (Leaflet without WebGL); a key draws Google; a refused key falls back", () => {
  assert.deepEqual(mapsConfig(null), { googleKey:null });
  assert.deepEqual(mapsConfig({ capabilities:{ googleMaps:false }, mapsKey:"AIzaTEST" }), { googleKey:null },
    "the key counts only with the capability");
  assert.deepEqual(mapsConfig({ capabilities:{ googleMaps:true }, mapsKey:" AIzaTEST " }), { googleKey:"AIzaTEST" });
  assert.equal(pickRenderer({}), "gl");
  assert.equal(pickRenderer({ webgl:false }), "leaflet");
  assert.equal(pickRenderer({ googleKey:"AIzaTEST", webgl:false }), "google", "Google's map needs no WebGL");
  assert.equal(pickRenderer({ googleKey:"AIzaTEST", googleFailed:true }), "gl");
});

test("the transport hands the frame's key to the map; a stand-in transport leaves none", async () => {
  const { mapsKeyFrame, noteMapsKey } = await import("../src/lib/mapsKey.js");
  assert.deepEqual(mapsConfig(mapsKeyFrame()), { googleKey:null }, "nothing until a frame says so");
  noteMapsKey({ googleMaps:true }, "AIzaTEST");
  assert.deepEqual(mapsConfig(mapsKeyFrame()), { googleKey:"AIzaTEST" });
  noteMapsKey({ googleMaps:false }, null);
  assert.deepEqual(mapsConfig(mapsKeyFrame()), { googleKey:null }, "a frame without the capability turns it off");
  assert.match(read("src/lib/client.js"), /noteMapsKey\(snapshot\.capabilities, snapshot\.mapsKey\)/);
});

test("the Worker hands out the key only when GOOGLE_MAPS_KEY is set, on the frame beside the capability", async () => {
  const { Tournament, mapsKeyOf } = await import("../worker/tournament.js");
  assert.equal(mapsKeyOf({ GOOGLE_MAPS_KEY:"  AIzaTEST " }), "AIzaTEST");
  assert.equal(mapsKeyOf({}), "");
  const frameFor = async env => {
    const entries = new Map(), sockets = [];
    const storage = { async get(k) { return structuredClone(entries.get(k)); }, async put(k, v) { entries.set(k, structuredClone(v)); },
      async delete() {}, async list() { return new Map(); }, async transaction(fn) { return fn(storage); } };
    const tournament = new Tournament({ blockConcurrencyWhile() {}, getWebSockets:() => sockets, storage, waitUntil() {} }, env);
    await tournament.hydrateFromStorage();
    let attachment = null;
    const ws = { frames:[], send(frame) { ws.frames.push(JSON.parse(frame)); }, serializeAttachment(v) { attachment = v; },
      deserializeAttachment() { return attachment; }, close() {} };
    sockets.push(ws);
    await tournament.webSocketMessage(ws, JSON.stringify({ type:"hello", actionId:"h1", deviceId:"device-maps-0000-4000-8000-000000000001",
      payload:{ view:"tv" } }));
    return ws.frames.filter(frame => frame.type === "state").at(-1);
  };
  const off = await frameFor({ APP_ENV:"local" });
  assert.equal(off.capabilities.googleMaps, false);
  assert.equal("mapsKey" in off, false);
  const on = await frameFor({ APP_ENV:"local", GOOGLE_MAPS_KEY:"AIzaTEST" });
  assert.equal(on.capabilities.googleMaps, true);
  assert.equal(on.mapsKey, "AIzaTEST");
  assert.doesNotMatch(JSON.stringify(on.state), /AIzaTEST/, "never in state");
  const unconfigured = await frameFor({ GOOGLE_MAPS_KEY:"AIzaTEST" });
  assert.equal(unconfigured.capabilities.googleMaps, false, "an unconfigured Worker offers nothing");
});

test("Google's loader: one script tag with the key, resolved on Google's callback; a refused key fails the session", async () => {
  resetGoogleState();
  const { googleScriptUrl, loadGoogleMaps } = await import("../src/features/geo/maps/googleLoader.js");
  const url = new URL(googleScriptUrl("AIzaTEST"));
  assert.equal(url.origin + url.pathname, "https://maps.googleapis.com/maps/api/js");
  assert.equal(url.searchParams.get("key"), "AIzaTEST");
  assert.equal(url.searchParams.get("loading"), "async");
  assert.ok(url.searchParams.get("callback"));
  await withDom(async ({ head }) => {
    await assert.rejects(loadGoogleMaps(""), /No Google Maps key/);
    const loading = loadGoogleMaps("AIzaTEST");
    assert.equal(loadGoogleMaps("AIzaTEST"), loading, "one load per page");
    assert.equal(head.children.length, 1);
    assert.match(head.children[0].src, /maps\.googleapis\.com\/maps\/api\/js\?key=AIzaTEST/);
    const imported = [];
    globalThis.window.google = { maps:{ Map:class {}, importLibrary:async name => { imported.push(name); return {}; } } };
    globalThis.window[url.searchParams.get("callback")]();
    assert.equal((await loading).Map, globalThis.window.google.maps.Map);
    assert.deepEqual(imported.sort(), ["core", "maps"]);
    assert.equal(googleFailed(), false);
    /* Google calls gm_authFailure on a key it refuses (a referrer not allowed) */
    globalThis.window.gm_authFailure();
    assert.equal(googleFailed(), true);
    assert.equal(pickRenderer({ googleKey:"AIzaTEST", googleFailed:googleFailed() }), "gl");
    await assert.rejects(loadGoogleMaps("AIzaTEST"), /unavailable/);
  });
  resetGoogleState();
});

/* ── the adapter contract: every renderer, the same members ── */
function fakeGoogle() {
  const made = { maps:[], lines:[], overlays:[] };
  class LatLng { constructor(lat, lng) { this._lat = lat; this._lng = lng; } lat() { return this._lat; } lng() { return this._lng; } }
  class Map {
    constructor(div, options) { this.div = div; this.options = options; this.cam = { ...options.center, zoom:options.zoom };
      this.moves = []; made.maps.push(this); }
    getCenter() { return new LatLng(this.cam.lat, this.cam.lng); }
    getZoom() { return this.cam.zoom; }
    moveCamera({ center, zoom }) { this.cam = { ...center, zoom }; this.moves.push(this.cam); }
    setMapTypeId(type) { this.type = type; }
    addListener(type, fn) { (this.listeners ||= {})[type] = fn; }
    getBounds() { return { contains:() => true }; }
    getDiv() { return this.div; }
  }
  class OverlayView {
    static preventMapHitsAndGesturesFrom() {}
    setMap(map) { this.map = map; if (map) { made.overlays.push(this); this.onAdd(); this.draw(); } else this.onRemove?.(); }
    getPanes() { return { overlayMouseTarget:el() }; }
    getProjection() { return { fromLatLngToDivPixel:ll => ({ x:ll.lng(), y:ll.lat() }),
      fromLatLngToContainerPixel:ll => ({ x:ll.lng(), y:ll.lat() }), fromContainerPixelToLatLng:p => new LatLng(p.y, p.x) }; }
  }
  class Polyline { constructor(options) { this.options = options; made.lines.push(this); } setPath(path) { this.options.path = path; }
    setMap(map) { this.options.map = map; } }
  return { made, g:{ Map, OverlayView, Polyline, LatLng, Point:class { constructor(x, y) { this.x = x; this.y = y; } },
    event:{ addListenerOnce:(map, type, fn) => fn(), clearInstanceListeners() {} } } };
}
function fakeMaplibre() {
  const made = { maps:[], markers:[] };
  class Marker {
    constructor(options) { this.options = options; made.markers.push(this); }
    setLngLat(lngLat) { this.lngLat = lngLat; return this; } addTo() { return this; } on() { return this; } remove() { this.gone = true; }
  }
  class Map {
    constructor(options) { this.options = options; this.cam = { center:options.center, zoom:options.zoom }; this.sources = {}; made.maps.push(this); }
    on() {} jumpTo(to) { this.cam = to; } easeTo(to) { this.cam = to; this.eased = true; } flyTo(to) { this.cam = to; this.flew = true; }
    getCenter() { return { lng:this.cam.center[0], lat:this.cam.center[1] }; } getZoom() { return this.cam.zoom; }
    getSource(id) { return this.sources[id]; } addSource(id, spec) { this.sources[id] = { data:spec.data, setData(d) { this.data = d; } }; }
    addLayer(layer) { this.layer = layer; } getBounds() { return { contains:() => true }; } remove() { this.removed = true; }
  }
  return { made, lib:{ Map, Marker } };
}
function fakeLeaflet() {
  const made = { views:[], markers:[], lines:[] };
  const map = { setView(center, zoom, options) { made.views.push({ center, zoom, options }); this.c = center; this.z = zoom; return this; },
    getCenter() { return { lat:this.c[0], lng:this.c[1] }; }, getZoom() { return this.z; }, on() {}, invalidateSize() {}, remove() {},
    getBounds() { return { contains:() => true }; } };
  const added = item => ({ ...item, addTo() { return this; }, on() { return this; }, remove() { this.gone = true; } });
  return { made, L:{ map:() => map, tileLayer:() => added({}), divIcon:options => options,
    marker:(at, options) => { const m = added({ at, options }); made.markers.push(m); return m; },
    polyline:(points, options) => { const l = added({ points, options }); made.lines.push(l); return l; } } };
}
const HOME = { lat:38.5, lng:-97, zoom:3.4 };

test("every renderer is the one adapter: the same members, pins as our nodes, lines, the camera in 256 px zooms", async () => {
  const { createGoogle, googleMapOptions } = await import("../src/features/geo/maps/googleAdapter.js");
  const { createMaplibre } = await import("../src/features/geo/maps/maplibreAdapter.js");
  const { createLeaflet } = await import("../src/features/geo/maps/leafletAdapter.js");
  const { BACKGLASS_MAP_STYLE } = await import("../src/features/geo/maps/googleStyle.js");
  globalThis.queueMicrotask ||= fn => Promise.resolve().then(fn);
  await withDom(async () => {
    globalThis.requestAnimationFrame = () => 0;
    globalThis.cancelAnimationFrame = () => {};
    const google = fakeGoogle(), gl = fakeMaplibre(), leaflet = fakeLeaflet();
    const ready = [];
    const adapters = {
      google:createGoogle(google.g, el(), { interactive:true, home:HOME, onReady:() => ready.push("google") }),
      gl:createMaplibre(gl.lib, el(), { interactive:true, home:HOME }),
      leaflet:createLeaflet(leaflet.L, el(), { interactive:true, home:HOME, onReady:() => ready.push("leaflet") }),
    };
    for (const [kind, adapter] of Object.entries(adapters)) {
      assert.deepEqual(ADAPTER_MEMBERS.filter(member => !(member in adapter)), [], `${kind} has every member`);
      assert.equal(adapter.kind, kind);
      for (const member of ADAPTER_MEMBERS.filter(name => !["kind", "types"].includes(name)))
        assert.equal(typeof adapter[member], "function", `${kind}.${member}`);
      assert.ok(Array.isArray(adapter.types));
      /* the camera speaks 256 px zooms whatever the library */
      adapter.move({ lat:37.8, lng:-122.5, zoom:9 }, 0);
      const cam = adapter.camera();
      assert.ok(Math.abs(cam.zoom - 9) < 0.01 && Math.abs(cam.lat - 37.8) < 1e-9, `${kind} camera ${JSON.stringify(cam)}`);
      const marker = adapter.addMarker(el(), { lat:37.8, lng:-122.5 }, { anchor:"center" });
      assert.equal(typeof marker.remove, "function");
      marker.remove();
      adapter.setLines([{ from:{ lat:30, lng:-120 }, to:{ lat:40, lng:-110 }, color:"#ff0" }], 1);
      adapter.setPin({ lat:1, lng:2 }, { node:el(), draggable:true, onDrag() {} });
      adapter.setPin(null);
    }
    await Promise.resolve();
    assert.deepEqual(ready.sort(), ["google", "leaflet"]);
    /* MapLibre's tiles are 512 px: its own zoom is one less */
    assert.equal(gl.made.maps[0].options.zoom, HOME.zoom - 1);
    assert.equal(gl.made.maps[0].cam.zoom, 8);
    assert.equal(gl.made.markers[0].options.anchor, "center");
    assert.deepEqual(gl.made.maps[0].sources["fd-geo-lines"].data.features[0].geometry.coordinates, [[-120, 30], [-110, 40]]);
    adapters.gl.move({ lat:0, lng:0, zoom:5 }, 1400, { fly:true });
    assert.equal(gl.made.maps[0].flew, true, "a searched place flies, as before");
    /* Leaflet keeps quarter zooms and draws a line once it is due */
    assert.equal(leaflet.made.lines.length, 1);
    assert.equal(leaflet.made.markers[0].options.icon.html.tag, "div", "Leaflet holds our node itself");

    /* Google: its map, in the app's style, none of its chrome, our pins */
    const map = google.made.maps[0];
    assert.equal(map.options.styles, BACKGLASS_MAP_STYLE);
    assert.equal(map.options.gestureHandling, "greedy");
    for (const off of ["streetViewControl", "fullscreenControl", "mapTypeControl", "clickableIcons", "disableDefaultUI"])
      assert.equal(map.options[off], off === "disableDefaultUI", off);
    assert.equal("mapId" in map.options, false, "no Map ID: a JSON style and HTML pins");
    assert.equal(googleMapOptions({ interactive:false, home:HOME }).gestureHandling, "none", "the TV's map holds still");
    assert.deepEqual(adapters.google.types, ["map", "satellite"]);
    adapters.google.setType("satellite");
    assert.equal(map.type, "hybrid", "satellite carries the names");
    adapters.google.setType("map");
    assert.equal(map.type, "roadmap");
    assert.equal(google.made.lines.length, 1);
    assert.equal(google.made.lines[0].options.strokeOpacity, 0, "dashes, drawn by the line's icons");
    adapters.google.setLines([{ from:{ lat:30, lng:-120 }, to:{ lat:40, lng:-110 } }], .5);
    assert.deepEqual(google.made.lines[0].options.path[1], { lat:35, lng:-115 }, "half way, the same line grown");
    adapters.google.setLines([], 1);
    assert.equal(google.made.lines[0].options.map, null);
    let picked = null;
    adapters.google.onClick(point => { picked = point; });
    map.listeners.click({ latLng:new google.g.LatLng(10, 190), stop() {} });
    assert.deepEqual(picked, { lat:10, lng:-170 }, "a tap past the date line wraps");
    for (const adapter of Object.values(adapters)) adapter.remove();
  });
});

/* ── the camera and the card ── */
const TV = { width:1160, height:800 };
const TV_PINS = { guess:{ w:64, h:88 }, answer:{ w:70, h:70 } };
const CARD = { w:470, h:190 };
/* the fit audit's room: twelve guesses spread round the Golden Gate Bridge */
const ANSWER = { lat:37.8199, lng:-122.4783 };
const spread = (around, n = 12) => Array.from({ length:n }, (_, i) => ({ lat:around.lat + (i - 6) * 0.9, lng:around.lng + (i % 5) * 1.3 }));
const inside = (box, size) => box.left >= 0 && box.top >= 0 && box.right <= size.width && box.bottom <= size.height;

test("the camera fits every point inside the padding", () => {
  const points = [...spread(ANSWER), ANSWER];
  const pad = { top:100, bottom:40, left:60, right:300 };
  const cam = fitCamera(points, TV, pad, { maxZoom:14 });
  for (const point of points) {
    const p = project(point, cam, TV);
    assert.ok(p.x >= pad.left - 1 && p.x <= TV.width - pad.right + 1 && p.y >= pad.top - 1 && p.y <= TV.height - pad.bottom + 1,
      JSON.stringify(p));
  }
  assert.equal(fitCamera([ANSWER], TV, pad, { single:12 }).zoom, 12, "one point centers at its own zoom");
  assert.ok(fitCamera([ANSWER, { lat:37.82, lng:-122.478 }], TV, {}, { maxZoom:14 }).zoom <= 14, "never closer than maxZoom");
});

test("the answer's card stands in a top corner no pin covers, on any spread of guesses", () => {
  const cases = {
    "the fit audit's room": spread(ANSWER),
    "everyone out west, north of the answer": Array.from({ length:12 }, (_, i) => ({ lat:ANSWER.lat + 1 + (i % 4), lng:ANSWER.lng - 3 + i * 0.6 })),
    "the whole country": Array.from({ length:12 }, (_, i) => ({ lat:28 + (i * 7) % 20, lng:-124 + i * 4.6 })),
    "a crowd in both top corners": [{ lat:48, lng:-124 }, { lat:48, lng:-70 }, { lat:47, lng:-123 }, { lat:47, lng:-71 },
      { lat:30, lng:-100 }, { lat:26, lng:-80 }],
    "one guess": [{ lat:40, lng:-100 }],
    "no guesses": [],
  };
  for (const [name, guesses] of Object.entries(cases)) {
    const points = [...guesses, ANSWER];
    const kinds = [...guesses.map(() => "guess"), "answer"];
    const placed = placeReveal({ points, kinds, size:TV, pad:{ top:40, bottom:40, left:48, right:48 }, pins:TV_PINS, card:CARD,
      inset:28, maxZoom:14, single:12 });
    assert.ok(CARD_CORNERS.includes(placed.corner), name);
    assert.equal(cardCovered(placed.corner, CARD, TV, 28, placed.boxes), 0, `${name}: no pin under the card`);
    placed.boxes.forEach(box => assert.ok(inside(box, TV), `${name}: every pin whole on the map ${JSON.stringify(box)}`));
  }
  /* the open map wins when a corner is already clear: no room given away */
  const west = [{ lat:36, lng:-90 }, { lat:34, lng:-88 }, { lat:30, lng:-85 }];
  const open = placeReveal({ points:[...west, { lat:31, lng:-86 }], kinds:["guess", "guess", "guess", "answer"], size:TV,
    pad:{ top:40, bottom:40, left:48, right:48 }, pins:TV_PINS, card:CARD, maxZoom:14 });
  const bare = placeReveal({ points:[...west, { lat:31, lng:-86 }], kinds:["guess", "guess", "guess", "answer"], size:TV,
    pad:{ top:40, bottom:40, left:48, right:48 }, pins:TV_PINS, card:null, maxZoom:14 });
  assert.equal(open.camera.zoom, bare.camera.zoom, "a clear corner keeps the frame as close as without a card");
  /* a pin box reaches up from its point (a guess) or round it (the answer) */
  assert.deepEqual(pinBox({ x:100, y:200 }, "guess", TV_PINS), { left:68, right:132, top:112, bottom:200 });
  assert.deepEqual(pinBox({ x:100, y:200 }, "answer", TV_PINS), { left:65, right:135, top:165, bottom:235 });
  assert.deepEqual(cardRect("tr", CARD, TV, 28), { left:662, right:1132, top:28, bottom:218 });
});

/* ── the reveal's beats, on the server clock ── */
test("the reveal's beats: drops, lines, camera and the answer; a late screen joins mid-scene; past the end it stands still", () => {
  const plan = revealPlan(3);
  assert.deepEqual(plan.drops, [300, 410, 520]);
  assert.equal(plan.lines, 300 + 3 * 110 + 250);
  assert.equal(plan.answer, plan.lines + REVEAL.answerAfter);
  const start = revealAt(plan, 0);
  assert.deepEqual(start.drops, [300, 410, 520]);
  assert.equal(start.linesIn, plan.lines);
  assert.equal(start.cameraMs, REVEAL.camera);
  /* 450 ms in: the first fell 150 ms ago (still falling), the third is to come */
  const mid = revealAt(plan, 450);
  assert.deepEqual(mid.drops, [-150, -40, 70]);
  /* well into the lines: every guess stands, the lines pick up part way, the camera is mid-move */
  const late = revealAt(plan, plan.lines + 550);
  assert.deepEqual(late.drops, [null, null, null]);
  assert.equal(late.linesIn, 0);
  assert.equal(late.linesFrom, 0.5);
  assert.equal(late.cameraMs, REVEAL.camera - 550);
  assert.equal(late.answer, REVEAL.answerAfter - 550);
  assert.deepEqual(revealAt(plan, plan.end), { over:true });
  assert.deepEqual(revealAt(plan, 9000), { over:true }, "a TV that came in long after sees the end at once");
});

/* ── the boundary: Google's script by tag, never in the bundle ── */
test("Google's script and adapter load only by dynamic import; no package, no key in the source", () => {
  const files = [];
  const walk = dir => readdirSync(dir, { withFileTypes:true }).forEach(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (/\.(jsx?|mjs|css|html|jsonc?)$/.test(entry.name)) files.push(path);
  });
  ["src", "shared", "worker", "dev"].forEach(dir => walk(join(root, dir)));
  files.push(join(root, "wrangler.jsonc"), join(root, "index.html"));
  const rel = file => file.replace(/\\/g, "/").slice(root.replace(/\\/g, "/").length);
  const text = new Map(files.map(file => [rel(file), readFileSync(file, "utf8")]));
  const googleUrl = [...text].filter(([, body]) => body.includes("maps.googleapis.com")).map(([file]) => file);
  assert.deepEqual(googleUrl.filter(file => !file.startsWith("dev/efficiency-components")), ["src/features/geo/maps/googleLoader.js"]);
  const staticGoogle = [...text].filter(([, body]) => /import[^;(]*from\s*["'][^"']*maps\/google(Adapter|Loader)(\.js)?["']/.test(body));
  assert.deepEqual(staticGoogle.map(([file]) => file), [], "the adapter and loader are never imported statically");
  const geoMap = text.get("src/features/geo/GeoMap.jsx");
  assert.match(geoMap, /import\("\.\/maps\/googleAdapter\.js"\)/);
  assert.match(geoMap, /import\("\.\/maps\/googleLoader\.js"\)/);
  assert.match(geoMap, /import\("maplibre-gl"\)/, "MapLibre stays a lazy chunk too");
  /* no key ever lands in the source (Google's keys start AIza) */
  assert.deepEqual([...text].filter(([file, body]) => /AIza[0-9A-Za-z_-]{20,}/.test(body) && !file.startsWith("tests/")).map(([f]) => f), []);
  const pkg = JSON.parse(read("package.json"));
  assert.deepEqual(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter(name => /google/i.test(name)), []);
  /* after a build, the entry chunk carries no Google script */
  const assets = join(root, "dist/client/assets");
  if (existsSync(assets)) readdirSync(assets).filter(name => /^index-.*\.js$/.test(name))
    .forEach(name => assert.ok(!readFileSync(join(assets, name), "utf8").includes("maps.googleapis.com"), name));
});

test("Brandon's setup note names the API, the referrers and the secret", () => {
  const doc = read("docs/GOOGLE-MAPS.md");
  for (const needle of ["Maps JavaScript API", "https://fielddayseries.com/*",
    "https://scottsdale-invitational-staging.btran-backdrop.workers.dev/*", "http://localhost:*/*",
    "npx wrangler secret put GOOGLE_MAPS_KEY", "--env staging"])
    assert.ok(doc.includes(needle), needle);
  assert.doesNotMatch(doc, /—/, "no em dashes");
});
