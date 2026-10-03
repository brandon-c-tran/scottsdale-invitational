import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EMPTY_STATE, ROSTER } from "../shared/core.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const compiled = buildSync({
  stdin:{ contents:`
    export { HomeDuels } from "./src/features/home/HomeDuels.jsx";
    export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";
  `, resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react"],
  loader:{ ".css":"empty" }, write:false, logLevel:"silent",
});
const componentModule = new Module(fileURLToPath(new URL("home-duels-ui.cjs", import.meta.url)));
componentModule.filename = componentModule.id;
componentModule.paths = Module._nodeModulePaths(root);
componentModule._compile(compiled.outputFiles[0].text, componentModule.filename);
const { HomeDuels, PlayerIdentityProvider } = componentModule.exports;
const [me, other, third, fourth] = ROSTER;
const duel = (patch = {}) => ({ id:"received", from:other, to:me, status:"open", stake:100, runs:{}, ...patch });
const fresh = () => ({ ...structuredClone(EMPTY_STATE), live:true, duels:[duel()] });
const textOf = values => values.map(value => Array.isArray(value) ? textOf(value)
  : React.isValidElement(value) ? textOf([value.props.children])
    : typeof value === "string" || typeof value === "number" ? String(value) : "").join("");

// Exercise the actual component handlers. Browser rendering separately checks
// wrapping, focus and state-driven pending/error updates.
function controls(state, overrides = {}) {
  const buttons = [], viewed = [], played = [], declined = [], voided = [];
  const createElement = React.createElement;
  React.createElement = (type, props, ...children) => {
    if (type === "button") buttons.push({
      name:props?.["aria-label"] || textOf(children), disabled:!!props?.disabled,
      minHeight:props?.style?.minHeight, click:props?.onClick,
    });
    return createElement(type, props, ...children);
  };
  let html;
  try {
    html = renderToStaticMarkup(createElement(PlayerIdentityProvider, { profiles:state.profiles },
      createElement(HomeDuels, {
        state, me, gm:false, onPlayer:player => viewed.push(player), onPlay:id => played.push(id),
        onDecline:id => { declined.push(id); return { ok:true }; },
        onVoid:id => { voided.push(id); return { ok:true }; }, ...overrides,
      })));
  } finally { React.createElement = createElement; }
  const named = name => {
    const button = buttons.find(item => item.name === name);
    assert.ok(button, `Missing control: ${name}`);
    return button;
  };
  return { buttons, html, viewed, played, declined, voided, named,
    click(name) { const button = named(name); assert.equal(button.disabled, false); return button.click(); },
  };
}

test("home duels show only the player's unresolved challenges during the live weekend", () => {
  const state = fresh();
  state.duels.push(
    duel({ id:"others", from:third, to:fourth }),
    duel({ id:"declined", status:"declined" }),
    duel({ id:"settled", runs:{ [me]:{ ms:150 }, [other]:{ ms:200 } } }),
  );
  assert.equal((controls(state).html.match(/<article /g) || []).length, 1);
  for (const patch of [
    { live:false }, { frozen:true }, { poker:{ id:"poker" } },
    { results:{ poker:{ stacks:{ [me]:1000 } } } }, { duels:[] },
  ]) assert.equal(controls({ ...state, ...patch }).html, "");
  assert.equal(controls(state, { me:null }).html, "");
});

test("opponent cards, play and decline have separate targets and preserve the duel id", async () => {
  const view = controls(fresh());
  view.click(`View ${other}'s player card`);
  assert.deepEqual(view.viewed, [other]);
  assert.deepEqual(view.played, []);
  assert.deepEqual(view.declined, []);
  view.click(`Play Quick Draw with ${other}`);
  assert.deepEqual(view.played, ["received"]);
  await view.click(`Decline duel with ${other}`);
  assert.deepEqual(view.declined, ["received"]);
  assert.ok(!view.buttons.some(button => button.name.startsWith("Void")));
  assert.match(view.html, /Challenged you/);
  assert.match(view.html, /100/);
});

// Rule change (consent model): the recipient may decline until THEY draw,
// even after the challenger has; the challenger's time is never shown.
test("decline stays until the recipient runs and waiting players cannot replay", () => {
  const sender = controls({ ...fresh(), duels:[duel({ from:me, to:other })] });
  assert.ok(!sender.buttons.some(button => button.name.startsWith("Decline")));
  assert.match(sender.html, /Your turn/);
  const started = controls({ ...fresh(), duels:[duel({ runs:{ [other]:{ ms:180 } } })] });
  assert.ok(started.buttons.some(button => button.name.startsWith("Decline")));
  assert.ok(started.buttons.some(button => button.name.startsWith("Play")));
  /* the painted band's geometry is decoration (aria-hidden svg), not a time */
  assert.doesNotMatch(started.html.replace(/<svg[^>]*aria-hidden="true"[\s\S]*?<\/svg>/g, ""), /180/);
  const waiting = controls({ ...fresh(), duels:[duel({ runs:{ [me]:{ ms:180 } } })] });
  assert.ok(!waiting.buttons.some(button => button.name.startsWith("Play")));
  assert.match(waiting.html, /Waiting for [^<]+ to draw/);
});

test("all duel targets remain at least 44px high including the three-action commissioner state", async () => {
  const state = fresh();
  state.profiles[other] = { display:"Long Player Name" };
  const view = controls(state, { gm:true });
  assert.equal(view.buttons.length, 4);
  assert.ok(view.buttons.every(button => button.minHeight >= 44));
  view.click("View Long Player Name's player card");
  await view.click("Void duel with Long Player Name");
  assert.deepEqual(view.viewed, [other]);
  assert.deepEqual(view.voided, ["received"]);
  assert.match(view.html, /overflow-wrap:anywhere/);
  assert.doesNotMatch(view.html, /white-space:nowrap|text-overflow:ellipsis/);
});

test("a pending decline blocks repeat writes, void, play and navigation until acknowledged", async () => {
  let acknowledge;
  const calls = [];
  const view = controls(fresh(), { gm:true, onDecline:id => {
    calls.push(id); return new Promise(resolve => { acknowledge = resolve; });
  } });
  const first = view.click(`Decline duel with ${other}`);
  assert.equal(view.click(`Decline duel with ${other}`), first);
  assert.equal(view.click(`Void duel with ${other}`), first);
  view.click(`Play Quick Draw with ${other}`);
  view.click(`View ${other}'s player card`);
  await Promise.resolve();
  assert.deepEqual(calls, ["received"]);
  assert.deepEqual(view.voided, []);
  assert.deepEqual(view.played, []);
  assert.deepEqual(view.viewed, []);
  acknowledge({ ok:true });
  assert.equal((await first).ok, true);
  view.click(`Decline duel with ${other}`);
  view.click(`Play Quick Draw with ${other}`);
  assert.deepEqual(calls, ["received"]);
  assert.deepEqual(view.played, []);
});

test("a rejected or missing acknowledgement and a thrown write allow an explicit retry", async () => {
  for (const fail of [() => ({ ok:false, error:"Already in play" }), () => undefined,
    () => { throw new Error("Offline"); }]) {
    let attempts = 0;
    const view = controls(fresh(), { onDecline:() => { attempts++; return attempts === 1 ? fail() : { ok:true }; } });
    const first = await view.click(`Decline duel with ${other}`);
    assert.equal(first.ok, false);
    assert.match(first.error, /Already in play|Try again/);
    assert.equal((await view.click(`Decline duel with ${other}`)).ok, true);
    assert.equal(attempts, 2);
  }
});
