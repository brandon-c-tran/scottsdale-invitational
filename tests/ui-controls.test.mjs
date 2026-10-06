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
    export { ActionButton, MenuRow, Sheet } from "./src/ui/controls.jsx";
    export { WRITE_ERRORS, writeError, writeUncertain } from "./src/lib/writeErrors.js";
    export { DrawAnnouncement } from "./src/features/weekend/EventAnnouncement.jsx";
    export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";
  `, resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react"],
  loader:{ ".css":"empty" }, write:false, logLevel:"silent",
});
const mod = new Module(fileURLToPath(new URL("ui-controls.cjs", import.meta.url)));
mod.filename = mod.id; mod.paths = Module._nodeModulePaths(root);
mod._compile(compiled.outputFiles[0].text, mod.filename);
const { ActionButton, MenuRow, Sheet, WRITE_ERRORS, writeError, writeUncertain, DrawAnnouncement, PlayerIdentityProvider } = mod.exports;

function render(Component, props) {
  const buttons = [], create = React.createElement;
  React.createElement = (type, attributes, ...children) => {
    if (type === "button") buttons.push(attributes);
    return create(type, attributes, ...children);
  };
  try {
    const html = renderToStaticMarkup(create(PlayerIdentityProvider, { profiles:{} }, create(Component, props)));
    return { buttons, html };
  } finally { React.createElement = create; }
}

for (const [name, Component, labelProps] of [
  ["ActionButton", ActionButton, { children:"Save" }],
  ["MenuRow", MenuRow, { name:"Save" }],
]) {
  test(`${name} prevents immediate duplicate actions and unlocks after acknowledgement or failure`, async () => {
    let requests = 0, finish, fail;
    const { buttons } = render(Component, { ...labelProps, onClick:() => {
      requests++;
      return new Promise((resolve, reject) => { finish = resolve; fail = reject; });
    } });
    const click = buttons[0].onClick;
    const first = click(); click();
    assert.equal(requests, 1, "The guard must be immediate, before a React render");
    finish({ ok:true }); await first;
    const second = click(); click();
    assert.equal(requests, 2);
    finish({ ok:false, error:"Try again" }); await second;
    const third = click();
    assert.equal(requests, 3);
    fail(new Error("Connection lost")); await third;
    const retry = click();
    assert.equal(requests, 4);
    finish({ ok:true }); await retry;
  });

  test(`${name} respects disabled state and releases its guard after a synchronous error`, () => {
    let requests = 0;
    const disabled = render(Component, { ...labelProps, disabled:true, onClick:() => { requests++; } });
    assert.equal(disabled.buttons[0].disabled, true);
    disabled.buttons[0].onClick();
    assert.equal(requests, 0);
    const active = render(Component, { ...labelProps, onClick:() => {
      if (++requests === 1) throw new Error("Failed before sending");
      return { ok:true };
    } });
    assert.throws(active.buttons[0].onClick, /Failed before sending/);
    assert.deepEqual(active.buttons[0].onClick(), { ok:true });
    assert.equal(requests, 2);
  });
}

test("an externally pending action is a disabled native button", () => {
  let requests = 0;
  const { buttons } = render(ActionButton, { children:"Save", pending:true, onClick:() => { requests++; } });
  assert.equal(buttons[0].disabled, true);
  assert.equal(buttons[0]["aria-busy"], true);
  buttons[0].onClick();
  assert.equal(requests, 0);
});

test("a two-team draw preserves the stored team names and independent player targets", () => {
  const state = structuredClone(EMPTY_STATE), viewed = [];
  let bets = 0;
  const { html, buttons } = render(DrawAnnouncement, { state,
    reveal:{ title:"The draw", subtitle:"Volleyball", versus:[
      { name:"The Sidewinders", players:ROSTER.slice(0, 6) },
      { name:"The Coyotes", players:ROSTER.slice(6, 12) },
    ] }, onClose:() => {}, onPlayer:player => viewed.push(player), onBets:() => { bets++; },
  });
  assert.match(html, /<h3>The Sidewinders<\/h3>/);
  assert.match(html, /<h3>The Coyotes<\/h3>/);
  for (const player of ROSTER.slice(0, 12)) {
    const control = buttons.find(button => button["aria-label"] === `View ${player}'s player card`);
    assert.ok(control); assert.equal(control.disabled, false); control.onClick();
  }
  assert.deepEqual(viewed, ROSTER.slice(0, 12));
  assert.equal(bets, 0);
});

test("a sheet holds its commit at the foot, in thumb reach; Close stays in the header", () => {
  const { html } = render(Sheet, { title:"Crown the champion", onClose:() => {},
    footer:React.createElement(ActionButton, null, "Crown Evan"), children:React.createElement("p", null, "Body") });
  const header = html.slice(html.indexOf('class="fd-sheet-header"'), html.indexOf('class="fd-sheet-body"'));
  assert.match(header, /aria-label="Close"/);
  assert.doesNotMatch(header, /Crown Evan/, "the commit is never top right");
  assert.ok(html.indexOf('class="fd-sheet-footer"') > html.indexOf('class="fd-sheet-body"'), "the footer follows the body");
  assert.match(html.slice(html.indexOf('class="fd-sheet-footer"')), /Crown Evan/);
  assert.doesNotMatch(render(Sheet, { title:"Plain", onClose:() => {} }).html, /fd-sheet-footer/, "no footer unless asked");
});

test("a failed write names the problem and what to do; a refusal keeps its reason", () => {
  for (const line of Object.values(WRITE_ERRORS)) {
    assert.doesNotMatch(line, /—|Try again|try again/, line);
    assert.match(line, /Tap again|board|Check/, `${line} says what to do`);
  }
  assert.equal(writeError({ ok:false, error:"Betting is locked" }), "Betting is locked");
  assert.equal(writeError({ ok:false, error:"No response, try again" }), WRITE_ERRORS.timeout, "an old transport line maps");
  assert.equal(writeError({ ok:false, error:"Couldn't save. Try again." }), WRITE_ERRORS.serverFailed);
  assert.equal(writeError(new TypeError("Failed to fetch")), WRITE_ERRORS.offline);
  assert.equal(writeError(undefined), WRITE_ERRORS.notApplied);
  assert.equal(writeError({}, "The count didn't save. Tap Save count again."), "The count didn't save. Tap Save count again.");
  assert.equal(writeUncertain({ ok:false, uncertain:true }), true);
  assert.equal(writeUncertain({ ok:false, error:"x" }), false);
});
