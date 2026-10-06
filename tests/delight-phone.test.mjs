import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BUILTIN_EVENTS, CHIP_COLORS, CHIP_SKINS, EMPTY_STATE, ROSTER } from "../shared/core.js";

/* Phone delight: Riso tilt card, turned chip, and Android haptics. Real
   modules compiled once with React external; no transport or storage. */
const root = fileURLToPath(new URL("../", import.meta.url));
const load = async (name, contents) => {
  const compiled = await build({
    stdin:{ contents, resolveDir:root, loader:"jsx" },
    bundle:true, platform:"node", format:"cjs", external:["react"],
    loader:{ ".css":"empty" }, write:false, logLevel:"silent",
  });
  const mod = new Module(fileURLToPath(new URL(name, import.meta.url)));
  mod.filename = mod.id;
  mod.paths = Module._nodeModulePaths(root);
  mod._compile(compiled.outputFiles[0].text, mod.filename);
  return mod.exports;
};
const ui = await load("delight-phone.cjs", `
  export * from "./src/features/profile/tilt.js";
  export { useRisoTilt } from "./src/features/profile/useRisoTilt.js";
  export * from "./src/lib/haptics.js";
  export * from "./src/features/identity/chipCoin.js";
  export { ChipCoin } from "./src/features/identity/ChipCoin.jsx";
  export { PlayerPass } from "./src/features/profile/PlayerPass.jsx";
  export { ChipPicker } from "./src/features/profile/ProfileEditor.jsx";
  export { VibrationToggle } from "./src/features/profile/VibrationToggle.jsx";
  export { guestLedger, playedContests, updateHaptic } from "./src/features/home/guestUpdates.js";
  export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";
`);

const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1";
const DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36";
const noop = () => {};
const textOf = values => values.map(value => Array.isArray(value) ? textOf(value)
  : React.isValidElement(value) ? textOf([value.props.children])
    : typeof value === "string" || typeof value === "number" ? String(value) : "").join("");

/* Server render with every native element's props recorded. */
function render(element, profiles = {}) {
  const elements = [];
  const createElement = React.createElement;
  React.createElement = (type, props, ...children) => {
    if (typeof type === "string") elements.push({ type, props:props || {}, text:textOf(children) });
    return createElement(type, props, ...children);
  };
  let html;
  try {
    html = renderToStaticMarkup(createElement(ui.PlayerIdentityProvider, { profiles }, element));
  } finally { React.createElement = createElement; }
  const buttons = elements.filter(item => item.type === "button")
    .map(item => ({ ...item.props, name:(item.props["aria-label"] || item.text).trim() }));
  return { html, elements, buttons };
}
/* A temporary browser-ish global for code that reads window/navigator. */
function withGlobals(values, run) {
  const saved = Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  for (const [key, value] of Object.entries(values))
    Object.defineProperty(globalThis, key, { value, configurable:true, writable:true });
  try { return run(); } finally {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}
const memoryStorage = () => {
  const map = new Map();
  return { getItem:key => map.has(key) ? map.get(key) : null, setItem:(key, value) => map.set(key, String(value)),
    removeItem:key => map.delete(key) };
};
const media = reduce => () => ({ matches:reduce, addEventListener:noop, removeEventListener:noop });

test("tilt math clamps every input to one unit and keeps a short press a tap", () => {
  assert.equal(ui.clampUnit(4), 1);
  assert.equal(ui.clampUnit(-4), -1);
  assert.equal(ui.clampUnit(.25), .25);
  assert.equal(ui.clampUnit(NaN), 0);
  assert.equal(ui.clampUnit(Infinity), 0);

  assert.deepEqual(ui.dragTilt(5, 5, 360, 450), { x:0, y:0, dragging:false }, "under 8px flips");
  const drag = ui.dragTilt(63, -40, 360, 450);
  assert.equal(drag.dragging, true);
  assert.ok(Math.abs(drag.x - .5) < 1e-9);
  assert.ok(Math.abs(drag.y - -40 / (450 * .35)) < 1e-9);
  assert.deepEqual(ui.dragTilt(4000, -4000, 360, 450), { x:1, y:-1, dragging:true });
  assert.deepEqual(ui.dragTilt(20, 0, 0, 0), { x:1, y:0, dragging:true }, "a collapsed card cannot divide by zero");

  const rect = { left:10, top:20, width:200, height:250 };
  assert.deepEqual(ui.hoverTilt(110, 145, rect), { x:0, y:0 });
  assert.deepEqual(ui.hoverTilt(9999, -9999, rect), { x:1, y:-1 });
  assert.deepEqual(ui.hoverTilt(1, 1, null), { x:0, y:0 });

  const base = { gamma:4, beta:55 };
  assert.deepEqual(ui.orientationTilt({ gamma:4, beta:55 }, base), { x:0, y:0 }, "the first reading is level");
  assert.deepEqual(ui.orientationTilt({ gamma:14, beta:45 }, base), { x:.5, y:-.5 });
  assert.deepEqual(ui.orientationTilt({ gamma:90, beta:-90 }, base), { x:1, y:-1 });
  assert.deepEqual(ui.orientationTilt({ gamma:null, beta:3 }, base), { x:0, y:0 });
  const drifted = ui.recenter(base, { gamma:14, beta:55 });
  assert.ok(drifted.gamma > 4 && drifted.gamma < 5, "the baseline drifts slowly toward how the phone is held");

  let frame = { x:0, y:0, settled:false }, frames = 0;
  while (!frame.settled && frames < 200) { frame = ui.stepToward(frame, { x:1, y:-1 }, ui.TILT.follow); frames++; }
  assert.deepEqual(frame, { x:1, y:-1, settled:true });
  assert.ok(frames > 10 && frames < 60, `follow converges in about half a second (${frames} frames)`);

  assert.equal(ui.tiltTransform(1, 1), "rotateX(-7.000deg) rotateY(9.000deg)");
  assert.equal(ui.tiltTransform(-9, 0), "rotateX(0.000deg) rotateY(-9.000deg)");
  assert.equal(ui.plateStrength(0, 0), 0, "the plate is in register while level");
  assert.equal(ui.plateStrength(.8, .8), 1);
});

test("device orientation is Android only and never asks for permission", () => {
  function Plain() {}
  function Gated() {}
  Gated.requestPermission = async () => "granted";
  assert.equal(ui.canFollowOrientation({ userAgent:ANDROID, OrientationEvent:Plain }), true);
  assert.equal(ui.canFollowOrientation({ userAgent:"", platform:"Android", OrientationEvent:Plain }), true);
  assert.equal(ui.canFollowOrientation({ userAgent:ANDROID, OrientationEvent:Gated }), false);
  assert.equal(ui.canFollowOrientation({ userAgent:IPHONE, OrientationEvent:Plain }), false);
  assert.equal(ui.canFollowOrientation({ userAgent:IPHONE, OrientationEvent:Gated }), false);
  assert.equal(ui.canFollowOrientation({ userAgent:DESKTOP, OrientationEvent:Plain }), false);
  assert.equal(ui.canFollowOrientation({ userAgent:ANDROID }), false);
  const source = readFileSync(new URL("../src/features/profile/useRisoTilt.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /requestPermission\s*\(/, "the tilt never prompts for motion access");
});

test("haptics fire only on Android, never with reduced motion, an opt-out, or on the TV", () => {
  const android = { userAgent:ANDROID, canVibrate:true, reducedMotion:false, optedOut:false, tv:false };
  assert.equal(ui.hapticsAllowed(android), true);
  assert.equal(ui.hapticsAllowed({ ...android, userAgent:"", platform:"Android" }), true);
  assert.equal(ui.hapticsAllowed({ ...android, userAgent:IPHONE }), false, "iOS");
  assert.equal(ui.hapticsAllowed({ ...android, userAgent:DESKTOP }), false, "desktop Chrome has vibrate but no motor");
  assert.equal(ui.hapticsAllowed({ ...android, canVibrate:false }), false);
  assert.equal(ui.hapticsAllowed({ ...android, reducedMotion:true }), false);
  assert.equal(ui.hapticsAllowed({ ...android, optedOut:true }), false);
  assert.equal(ui.hapticsAllowed({ ...android, tv:true }), false);
  assert.equal(ui.vibrationAvailable({ ...android, optedOut:true }), true, "the toggle stays reachable after opting out");
  assert.equal(ui.vibrationAvailable({ ...android, userAgent:IPHONE }), false);

  assert.equal(ui.isTvLocation({ pathname:"/tv", search:"" }), true);
  assert.equal(ui.isTvLocation({ pathname:"/", search:"?tv" }), true);
  assert.equal(ui.isTvLocation({ pathname:"/", search:"?m=1" }), false);

  assert.equal(ui.HAPTIC_PATTERNS.place, 8);
  assert.equal(ui.HAPTIC_PATTERNS.retract, 5);
  assert.deepEqual(ui.HAPTIC_PATTERNS.pick, [20, 40, 20]);
  assert.ok(Number(ui.HAPTIC_PATTERNS.settle) > 0 && [ui.HAPTIC_PATTERNS.lead].flat().every(ms => ms <= 60));
});

test("haptic() vibrates through the gate and honours this device's opt-out", () => {
  const calls = [];
  const env = (userAgent, reduce = false, pathname = "/") => ({
    window:{ matchMedia:media(reduce), location:{ pathname, search:"" } },
    navigator:{ userAgent, vibrate:pattern => { calls.push(pattern); return true; } },
    localStorage:memoryStorage(),
  });
  withGlobals(env(ANDROID), () => {
    assert.equal(ui.haptic("place"), true);
    assert.equal(ui.haptic("retract"), true);
    assert.equal(ui.haptic("pick"), true);
    assert.equal(ui.haptic("nonsense"), false);
    ui.setVibrationOptOut(true);
    assert.equal(ui.vibrationOptedOut(), true);
    assert.equal(ui.haptic("place"), false);
    ui.setVibrationOptOut(false);
    assert.equal(ui.haptic("settle"), true);
    ui.setHapticSurface("tv");
    assert.equal(ui.haptic("lead"), false, "the TV surface is silent even on an Android browser");
    ui.setHapticSurface("phone");
  });
  withGlobals(env(ANDROID, true), () => assert.equal(ui.haptic("place"), false));
  withGlobals(env(ANDROID, false, "/tv"), () => assert.equal(ui.haptic("place"), false));
  withGlobals(env(IPHONE), () => assert.equal(ui.haptic("place"), false));
  withGlobals(env(DESKTOP), () => assert.equal(ui.haptic("place"), false));
  assert.deepEqual(calls, [8, 5, [20, 40, 20], 15]);
});

test("the Haptics toggle is offered on iPhone and vibrating Android phones and stores a local opt-out", () => {
  const androidEnv = { userAgent:ANDROID, canVibrate:true, reducedMotion:false, tv:false };
  withGlobals({ localStorage:memoryStorage() }, () => {
    for (const environment of [androidEnv, { userAgent:IPHONE, canVibrate:false, reducedMotion:false, tv:false },
      { userAgent:IPHONE, canVibrate:false, reducedMotion:true, tv:false }]) {
      const shown = render(React.createElement(ui.VibrationToggle, { environment }));
      const toggle = shown.buttons.find(button => button.role === "switch");
      assert.ok(toggle, "a switch is rendered");
      assert.equal(toggle["aria-checked"], true, "on by default");
      assert.match(shown.html, />Haptics</);
      assert.equal(typeof toggle.onClick, "function");
    }
  });
  for (const environment of [{ ...androidEnv, userAgent:DESKTOP }, { ...androidEnv, reducedMotion:true },
    { ...androidEnv, tv:true }, { ...androidEnv, canVibrate:false }, { userAgent:IPHONE, tv:true }])
    assert.equal(render(React.createElement(ui.VibrationToggle, { environment })).html, "");
  withGlobals({ localStorage:(() => { const s = memoryStorage(); s.setItem(ui.VIBRATION_KEY, "off"); return s; })() }, () => {
    const off = render(React.createElement(ui.VibrationToggle, { environment:androidEnv }));
    assert.equal(off.buttons.find(button => button.role === "switch")["aria-checked"], false);
  });
});

test("the coin rim carries each skin's inserts and a release always lands face up", () => {
  for (const skin of CHIP_SKINS) assert.equal(ui.edgeInserts(skin).length, ui.COIN_FACETS, skin);
  const count = skin => ui.edgeInserts(skin).filter(Boolean).length;
  assert.equal(count("ticks"), 8);
  assert.equal(count("plain"), 0);
  assert.equal(count("ring"), 0);
  assert.equal(count("dots"), 12);
  assert.equal(count("flame"), 6);
  assert.equal(ui.edgeInserts("ticks")[6], true, "the facet seen edge-on carries an insert");
  assert.equal(ui.edgeInserts("unknown").filter(Boolean).length, 8, "unknown skins read as classic ticks");

  const geometry = ui.coinGeometry(112);
  assert.ok(geometry.thickness >= 4 && geometry.thickness < 20);
  assert.ok(geometry.apothem < geometry.radius);
  assert.equal(geometry.step, 15);

  for (const [angle, velocity] of [[0, 0], [70, 0], [200, 0], [-130, 0], [40, 2], [40, -2], [1000, 9]]) {
    const { target, duration } = ui.coinSettle(angle, velocity);
    assert.equal(Math.abs(target % 360), 0, `${angle} lands face up`);
    assert.ok(duration >= 380 && duration <= 1200);
  }
  assert.equal(ui.coinSettle(100, 0).target, 0, "a slow release falls back");
  assert.equal(ui.coinSettle(100, 2).target, 720, "a fling carries on in its direction");
  assert.equal(ui.coinSettle(-100, -2).target, -720);
  assert.equal(ui.coinSettle(NaN, NaN).target, 0);
});

const player = ROSTER[2];
const claimed = () => {
  const state = { ...structuredClone(EMPTY_STATE), live:true };
  state.profiles[player] = { display:"Khoa", num:7, color:CHIP_COLORS[4].hex, skin:"flame" };
  return state;
};

test("the player card keeps its flip button, both faces, and a turned chip", () => {
  const state = claimed();
  const card = render(React.createElement(ui.PlayerPass, { state, p:player }), state.profiles);
  const flip = card.buttons.find(button => button.name === "Khoa's player card. Turn over");
  assert.ok(flip, "the card is still one flip button");
  assert.equal(flip["aria-pressed"], false);
  assert.equal(typeof flip.onClick, "function");
  assert.equal(typeof flip.onPointerDown, "function", "tilt listens on the card surface");
  assert.equal(card.buttons.length, 1, "tilt and spin add no controls");
  assert.match(card.html, /fd-pass-front/);
  assert.match(card.html, /fd-pass-back/);
  assert.match(card.html, /class="fd-pass-faces" aria-hidden="true"><i class="is-on"><\/i><i><\/i>/,
    "two faces drawn as pips, the front lit; no instruction line");
  assert.doesNotMatch(card.html, /Tap to turn over/);
  assert.match(card.html, /class="fd-pass-number fd-pass-plate" aria-hidden="true">07</);
  assert.match(card.html, /class="fd-coin[^"]*" aria-hidden="true"/);
  assert.equal((card.html.match(/fd-coin-facet/g) || []).length, ui.COIN_FACETS);
  assert.equal((card.html.match(/class="fd-coin-face /g) || []).length, 2);
  assert.doesNotMatch(card.html, /gradient/);

  const css = readFileSync(new URL("../src/features/profile/player-pass.css", import.meta.url), "utf8")
    + readFileSync(new URL("../src/features/identity/chip-coin.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /(linear|radial|conic)-gradient|drop-shadow|#[0-9a-f]{3,8}\b/i, "flat tokens only");
  assert.match(css, /\.fd-pass\s*\{[^}]*touch-action:pan-y/, "vertical drags still scroll the sheet");
  assert.match(css, /prefers-reduced-motion:reduce\)\s*\{[^}]*\.fd-pass-tilt,\.fd-pass-shadow \{ transform:none/);
});

test("reduced motion renders a still card with a flat chip and no tilt listeners", () => {
  const state = claimed();
  const card = withGlobals({ window:{ matchMedia:media(true) } },
    () => render(React.createElement(ui.PlayerPass, { state, p:player }), state.profiles));
  const flip = card.buttons.find(button => button.name === "Khoa's player card. Turn over");
  assert.equal(typeof flip.onClick, "function", "the flip survives reduced motion");
  assert.equal(flip.onPointerDown, undefined);
  assert.doesNotMatch(card.html, /fd-coin-facet/);
  assert.match(card.html, /fd-coin is-static/);

  const locked = withGlobals({ window:{ matchMedia:media(true) } },
    () => render(React.createElement(ui.ChipPicker, { state, me:player, num:"7", onChip:noop }), state.profiles));
  assert.match(locked.html, /fd-coin is-static/);
});

test("the locked chip row is a coin and keeps its copy", () => {
  const state = claimed();
  const row = render(React.createElement(ui.ChipPicker, { state, me:player, num:"7", onChip:noop }), state.profiles);
  assert.match(row.html, /fd-profile-chip-locked/);
  assert.match(row.html, /fd-coin-spin/);
  assert.match(row.html, /<p>Locked<\/p>/);
  assert.equal(row.buttons.length, 0, "the spin adds no control");
  const minted = render(React.createElement(ui.ChipCoin, { p:player, size:48, mintOnMount:true }), state.profiles);
  assert.match(minted.html, /fd-coin-drop is-minting/);
  const gray = render(React.createElement(ui.ChipCoin, { p:ROSTER[5], size:48, mintOnMount:true }), {});
  assert.doesNotMatch(gray.html, /is-minting/, "an unclaimed gray chip never mints");
});

test("a sideways drag tilts instead of flipping; a tap still flips", () => {
  let tilt;
  function Probe() {
    const ref = React.useRef({
      style:{ setProperty:noop, removeProperty:noop },
      classList:{ add:noop, remove:noop, contains:() => false },
    });
    tilt = ui.useRisoTilt(ref, true);
    return null;
  }
  const frames = [];
  withGlobals({ requestAnimationFrame:fn => { frames.push(fn); return frames.length; }, cancelAnimationFrame:noop }, () => {
    renderToStaticMarkup(React.createElement(Probe));
    const target = { getBoundingClientRect:() => ({ left:0, top:0, width:360, height:450 }) };
    const pointer = (x, y, extra = {}) => ({ pointerId:1, pointerType:"touch", button:0, clientX:x, clientY:y, currentTarget:target, ...extra });

    tilt.handlers.onPointerDown(pointer(100, 100));
    tilt.handlers.onPointerMove(pointer(104, 103));
    tilt.handlers.onPointerUp(pointer(104, 103));
    assert.equal(tilt.consumeClick(), false, "under 8px is a tap: the card flips");
    assert.equal(frames.length, 0, "a tap never starts the frame loop");

    tilt.handlers.onPointerDown(pointer(100, 100));
    tilt.handlers.onPointerMove(pointer(160, 90));
    assert.equal(frames.length, 1, "one frame is scheduled per burst of input");
    tilt.handlers.onPointerMove(pointer(170, 90));
    assert.equal(frames.length, 1, "moves inside a frame are coalesced");
    tilt.handlers.onPointerUp(pointer(170, 90));
    assert.equal(tilt.consumeClick(), true, "the click that ends a drag does not flip");
    assert.equal(tilt.consumeClick(), false, "only that one click");

    tilt.handlers.onPointerDown(pointer(100, 100));
    tilt.handlers.onPointerMove(pointer(100, 300));
    tilt.handlers.onPointerCancel(pointer(100, 300));
    assert.equal(tilt.consumeClick(), false, "a scroll takes over without eating a later tap");
    tilt.flip();
  });

  let disabled;
  function Off() { disabled = ui.useRisoTilt(React.useRef(null), false); return null; }
  renderToStaticMarkup(React.createElement(Off));
  assert.deepEqual(disabled.handlers, {}, "reduced motion attaches no pointer handlers");
  assert.equal(disabled.consumeClick(), false);
});

test("contests you played in or bet on vibrate once when they settle; corrections never do", () => {
  const pairs = BUILTIN_EVENTS.find(event => event.id === "8ball");
  const putt = BUILTIN_EVENTS.find(event => event.id === "putt");
  const events = [pairs, putt];
  const me = ROSTER[0];
  const before = { ...structuredClone(EMPTY_STATE), live:true };
  before.draws[pairs.id] = { id:"d1", teams:[{ players:[me, ROSTER[1]] }, { players:[ROSTER[2], ROSTER[3]] },
    { players:[ROSTER[4], ROSTER[5]] }, { players:[ROSTER[6], ROSTER[7]] }] };
  before.brackets[pairs.id] = { size:4, rounds:[
    [{ a:{ t:0 }, b:{ t:1 }, winner:null }, { a:{ t:2 }, b:{ t:3 }, winner:null }],
    [{ a:{ w:[0, 0] }, b:{ w:[0, 1] }, winner:null }]] };
  const prev = ui.guestLedger(before, me, events);
  assert.deepEqual(prev.contests, []);

  const otherMatch = structuredClone(before);
  otherMatch.brackets[pairs.id].rounds[0][1].winner = 2;
  const unrelated = ui.guestLedger(otherMatch, me, events);
  assert.equal(ui.updateHaptic(prev, unrelated, { state:otherMatch }), null, "someone else's match is silent");

  const myMatch = structuredClone(otherMatch);
  myMatch.brackets[pairs.id].rounds[0][0].winner = 1;
  const lostMine = ui.guestLedger(myMatch, me, events);
  assert.deepEqual(lostMine.contests, [`match:${pairs.id}:0:0`]);
  assert.equal(ui.updateHaptic(unrelated, lostMine, { state:myMatch }), "settle", "a loss settles for you too");
  assert.equal(ui.updateHaptic(lostMine, ui.guestLedger(myMatch, me, events), { state:myMatch }), null, "only once");

  const final = structuredClone(before);
  final.brackets[pairs.id].rounds[0][0].winner = 0;
  final.brackets[pairs.id].rounds[0][1].winner = 3;
  final.brackets[pairs.id].rounds[1][0].winner = 3;
  assert.deepEqual(ui.playedContests(final, me).sort(), [`match:${pairs.id}:0:0`, `match:${pairs.id}:1:0`]);

  const heats = structuredClone(before);
  heats.stages[putt.id] = { id:"s1", entrantType:"solo", groups:[{ entrants:[me, ROSTER[3]], winner:ROSTER[3] },
    { entrants:[ROSTER[4]], winner:null }] };
  assert.deepEqual(ui.playedContests(heats, me), [`group:${putt.id}:0`]);

  const bet = structuredClone(before);
  bet.wagers = [{ id:"w1", player:me, kind:"outright", eventId:putt.id, pick:ROSTER[8], pickPlayers:[ROSTER[8]], stake:200 }];
  const betPrev = ui.guestLedger(bet, me, events);
  const betDone = structuredClone(bet);
  betDone.results[putt.id] = { slots:[[ROSTER[9]], [ROSTER[10]], [ROSTER[11]]], ts:5, revision:1 };
  assert.equal(ui.updateHaptic(betPrev, ui.guestLedger(betDone, me, events), { state:betDone }), "settle");

  const corrected = structuredClone(betDone);
  corrected.results[putt.id] = { slots:[[me], [ROSTER[10]], [ROSTER[11]]], ts:9, revision:2, correctedAt:9, correctionReason:"Card" };
  corrected.eventOps[putt.id] = { corrections:[{ at:9 }] };
  assert.equal(ui.updateHaptic(ui.guestLedger(betDone, me, events), ui.guestLedger(corrected, me, events), { state:corrected }),
    null, "a correction is never felt, not even a new lead");

  const lead = structuredClone(before);
  lead.results[putt.id] = { slots:[[me], [ROSTER[10]], [ROSTER[11]]], ts:5, revision:1 };
  assert.equal(ui.updateHaptic(prev, ui.guestLedger(lead, me, events), { state:lead }), "lead", "taking the lead outranks the settle");
  const frozen = { ...structuredClone(lead), frozen:true };
  assert.equal(ui.updateHaptic(prev, ui.guestLedger(frozen, me, events), { state:frozen }), "settle");
  const spectator = ROSTER[12];
  assert.equal(ui.updateHaptic(ui.guestLedger(before, spectator, events), ui.guestLedger(lead, spectator, events), { state:lead }),
    null, "another player's result is silent for a spectator with no ticket");

  assert.equal(ui.updateHaptic(null, prev, { state:before }), null, "the first board after load is silent");
  assert.equal(ui.updateHaptic(prev, { ...prev, me:ROSTER[1] }, { state:before }), null);
});

test("haptics hook the guest paths and never the TV", () => {
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const wagers = readFileSync(new URL("../src/features/wagers/Wagers.jsx", import.meta.url), "utf8");
  assert.match(app, /setHapticSurface\(tv \? "tv" : "phone"\)/);
  assert.match(app, /if \(!tv\) haptic\("pick"\)/);
  assert.match(app, /tv \? null : updateHaptic\(prev, next/);
  assert.match(app, /<VibrationToggle \/>/);
  assert.match(wagers, /haptic\(kind === "place" \? "place" : "retract"\)/);
  const tv = readFileSync(new URL("../src/features/tv/TVMode.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(tv, /haptic|vibrate/);
});
