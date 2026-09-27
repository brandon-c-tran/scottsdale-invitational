import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EMPTY_STATE, BUILTIN_EVENTS, ROSTER, defaultQaParticipants } from "../shared/core.js";
import { applyAction } from "../worker/actions.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const blocked = names => names.map(name => `export const ${name}=()=>{
  throw new Error("${name} must not run in the isolated App regression");
};`).join("\n");
const compiled = await build({
  stdin:{ contents:`export { default as App } from "./src/App.jsx";
    export { setTestSnapshot } from "./src/lib/client.js";`, resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react"],
  loader:{ ".css":"empty" }, write:false, logLevel:"silent",
  plugins:[{ name:"isolated-announcement-app", setup(builder) {
    builder.onLoad({ filter:/[\\/]src[\\/]lib[\\/]client\.js$/ }, () => ({ loader:"js", contents:`
      let snapshot;
      export const setTestSnapshot=value=>{snapshot=value;};
      export const useTournament=()=>snapshot;
      export const localGet=key=>key==="si-onboard-v5"?"yes":key==="si-me"?snapshot.testPlayer:
        key==="si-gm"&&snapshot.testGm?"yes":null;
      export const hasGmToken=()=>true;
      ${blocked(["dispatch", "uploadPhoto", "downloadSnapshot", "localSet", "getDeviceId", "setGmToken",
        "spotifyStatus", "spotifyPlayer", "spotifySearch", "spotifyAuthorize", "spotifyDisconnect",
        "spotifyPlay", "spotifyPause", "spotifyDevice"])}
    ` }));
    builder.onLoad({ filter:/[\\/]features[\\/]check-in[\\/]install\.js$/ }, () => ({ loader:"js", contents:
      `export const installEvt=null;\n${blocked(["onInstallReady", "firstOnboardStep", "isStandalone", "isIOS"])}` }));
  } }],
});
const componentModule = new Module(fileURLToPath(new URL("announcement-app.cjs", import.meta.url)));
componentModule.filename = componentModule.id;
componentModule.paths = Module._nodeModulePaths(root);
componentModule._compile(compiled.outputFiles[0].text, componentModule.filename);
const { App, setTestSnapshot } = componentModule.exports;

/* Render the actual App and all its children. Retain its ref cells across
   two server renders to represent an already mounted phone receiving the
   next snapshot; a single static render misses the announcement branch.
   SSR does not run effects, so the mounted phone's observed on-deck value
   is committed explicitly. No transport, storage, or tournament is touched. */
function phone({ gm = false, player = ROSTER[0] } = {}) {
  const cells = [];
  let onDeckRef;
  const render = (state, version = 1, lastAction = null) => {
    const useRef = React.useRef, useLayoutEffect = React.useLayoutEffect;
    let cursor = 0;
    React.useRef = initial => {
      const created = useRef(initial), index = cursor++;
      if (!cells[index]) cells[index] = created;
      if (initial === "UNSET") onDeckRef = cells[index];
      return cells[index];
    };
    // Layout has no server DOM; keep its hook semantics without warnings.
    React.useLayoutEffect = React.useEffect;
    setTestSnapshot({ state, ready:true, connected:false, version, lastAction,
      environment:"test", capabilities:{}, testGm:gm, testPlayer:player });
    try { return renderToStaticMarkup(React.createElement(App)); }
    finally { React.useRef = useRef; React.useLayoutEffect = useLayoutEffect; }
  };
  return { render, commitOnDeck(value) {
    assert.ok(onDeckRef, "The actual App registered its observed market ref");
    onDeckRef.current = value;
  } };
}

let command = 0;
const host = () => ({ isGm:true, player:ROSTER[0], deviceId:"announcement-test", actionId:`announce-${++command}` });
for (const gm of [false, true]) {
  for (const [type, evId] of [["announceEvent", "putt"], ["announceAndDraw", "bball"]]) {
    test(`${gm ? "commissioner" : "guest"}: mounted App survives ${type} and its first live snapshot`, () => {
      const device = phone({ gm }), before = structuredClone(EMPTY_STATE);
      assert.match(device.render(before), /fd-home is-before/);
      device.commitOnDeck(before.onDeck);
      const state = structuredClone(before), event = BUILTIN_EVENTS.find(ev => ev.id === evId);
      const result = applyAction(state, type, { evId, ...(type === "announceAndDraw"
        ? { players:defaultQaParticipants(event) } : {}) }, host());
      assert.equal(result.ok, true, result.error);
      assert.equal(state.live, true);
      assert.equal(state.onDeck, evId);
      const html = device.render(state, 2, type);
      assert.match(html, /fd-home is-live/);
      assert.ok(html.includes(event.name));
      assert.match(html, /Place chips/);
      assert.deepEqual(state.wagers, []);
      device.commitOnDeck(state.onDeck);
      assert.match(device.render(state, 2, type), /fd-home is-live/, "A subsequent render still works");
    });
  }
}

test("a fresh App can reconnect directly to an already-open first event", () => {
  const state = structuredClone(EMPTY_STATE);
  assert.equal(applyAction(state, "announceEvent", { evId:"putt" }, host()).ok, true);
  assert.match(phone().render(state), /fd-home is-live/);
});
