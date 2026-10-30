/* Bug 2 of the Oct 29 playtest: "sometimes you buzz and then you can't press
   an answer". The phone's board wakes itself on the instants its view
   changes by itself (the buzzer lighting at the arm, the answer turn
   opening at turnAt): a timer for the gap on the server clock. When that
   timer fired a hair short of its instant on the server clock (the clock's
   estimate had moved back between arming and firing: it is the max of the
   last eight samples, and it drops as its best sample ages out; or the
   timer itself ran early), the wake re-rendered on the same instant, the
   effect (deps [next]) did not run again, and nothing was ever armed
   again: the phone sat on its last screen until some frame happened along.
   In a solo game (or any answer turn, where nobody else writes) none does:
   the options never light and the turn times out. Reproduced in headless
   Chrome on the real app with a jittery network: 3 of 8 solo clues froze.

   The fix is src/lib/serverClock.js useServerWake: the timer checks the
   server clock when it fires and arms again until the instant has come,
   and every render after a wake arms again. These run the real hook (and
   the real server clock) in Node over a scripted clock, with the old wake
   beside it, and check every board clock goes through the new one. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const FAKE_REACT = fileURLToPath(new URL("./support/fake-react.mjs", import.meta.url));

/* the real src/lib/serverClock.js, its React the one-component fake */
let mod = null;
async function clockModule() {
  if (mod) return mod;
  const { build } = await import("esbuild");
  const out = await build({ stdin:{ contents:[
    'export * from "./src/lib/serverClock.js";',
    `export * as fakeReact from ${JSON.stringify(FAKE_REACT)};`].join("\n"), resolveDir:ROOT, loader:"js" },
  bundle:true, platform:"neutral", format:"esm", write:false, logLevel:"silent", alias:{ react:FAKE_REACT } });
  mod = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString("base64")}`);
  return mod;
}

/* A scripted world: a local clock and timers (each may fire `early` ms
   before its time, as a timer can), and the component's renders flushed
   after every timer. */
function world({ early = 0 } = {}) {
  let now = 0, seq = 0;
  const timers = new Map();
  const real = { setTimeout:globalThis.setTimeout, clearTimeout:globalThis.clearTimeout, now:Date.now };
  /* an early timer still fires after it was set (a browser's floor is a millisecond or more) */
  globalThis.setTimeout = (fn, ms = 0) => { const id = ++seq; timers.set(id, { at:now + Math.max(1, (Number(ms) || 0) - early), fn }); return id; };
  globalThis.clearTimeout = id => { timers.delete(id); };
  Date.now = () => now;
  return {
    get now() { return now; },
    armed:() => timers.size,
    /* run every timer due up to `until`, re-rendering the component after each */
    advance(until, flush) {
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = Math.max(now, due[1].at);
        due[1].fn();
        flush();
      }
      now = until;
    },
    restore() { globalThis.setTimeout = real.setTimeout; globalThis.clearTimeout = real.clearTimeout; Date.now = real.now; },
  };
}

/* the phone's board clock before the fix, as it was in BoardPlay.jsx */
function oldWake(React, serverNow) {
  return next => {
    const [, wake] = React.useState(0);
    React.useEffect(() => {
      if (!next) return undefined;
      const timer = setTimeout(() => wake(n => n + 1), Math.max(0, next - serverNow()) + 5);
      return () => clearTimeout(timer);
    }, [next]);
  };
}

/* a screen that changes by itself at these server instants (the buzzer at
   the arm, the turn at turnAt - 300, the turn's end), as useBoardNow
   draws: the next instant after the clock it drew with */
async function play({ hook, early = 0, clockBack = 0, backAt = 500 }) {
  const m = await clockModule();
  const React = m.fakeReact;
  const w = world({ early });
  try {
    m.resetServerClock();
    m.noteServerTime(0, 0);
    const instants = [1000, 2200, 9200];
    const draws = [];
    const wakeHook = hook === "old" ? oldWake(React, m.serverNow) : (next, now) => m.useServerWake(next, { drawnAt:now });
    React.mount(() => {
      const now = m.serverNow();
      const next = instants.find(at => at > now) || 0;
      wakeHook(next, now);
      draws.push({ now, next });
      return { now, next };
    });
    const flush = () => { while (React.isDirty()) React.render(); };
    /* the clock's estimate moves back (a pong, or the best sample aging
       out) while the wake for the first instant is armed; nothing renders */
    w.advance(backAt, flush);
    if (clockBack) { m.resetServerClock(); m.noteServerTime(w.now - clockBack, w.now); }
    w.advance(12000, flush);
    React.unmount();
    return { draws, last:draws.at(-1), armed:w.armed() };
  } finally {
    w.restore();
    m.resetServerClock();
  }
}

test("the root cause, on the old wake: the clock moving back between arming and firing freezes the screen on its last state", async () => {
  const stuck = await play({ hook:"old", clockBack:40 });
  assert.equal(stuck.last.next, 1000, "the last thing drawn still waits for the first instant: the buzzer dark, the options dead");
  assert.ok(stuck.last.now < 1000);
  assert.equal(stuck.armed, 0, "and nothing is armed to wake it again");
  const early = await play({ hook:"old", early:8 });
  assert.equal(early.last.next, 1000, "a timer running a few ms early freezes it the same way");
  const fine = await play({ hook:"old" });
  assert.equal(fine.last.next, 0, "with a steady clock it reaches every instant (why it was only sometimes)");
});

test("useServerWake: a wake that lands short arms again, and the screen reaches every instant on the server clock", async () => {
  for (const [label, opts] of [["the clock moving back", { clockBack:40 }], ["a long way back", { clockBack:900 }],
    ["an early timer", { early:8 }], ["both", { clockBack:120, early:8 }], ["steady", {}]]) {
    const run = await play({ hook:"new", ...opts });
    assert.equal(run.last.next, 0, `${label}: every instant reached`);
    assert.ok(run.last.now >= 9200, label);
    /* each instant is drawn on or after it, never stuck short of it */
    for (const at of [1000, 2200, 9200]) assert.ok(run.draws.some(draw => draw.now >= at && draw.now < at + 1000), `${label}: drawn at ${at}`);
    assert.equal(run.armed, 0, `${label}: nothing left armed`);
  }
});

test("armServerWake: it wakes once, on or after the instant by the clock it is given; never early, never twice", async () => {
  const { armServerWake } = await clockModule();
  let clock = 0;
  const timers = [];
  const setTimer = (fn, ms) => { timers.push({ at:clock + ms, fn }); return timers.length; };
  const clearTimer = id => { timers[id - 1] = null; };
  const fire = () => { const t = timers.find(Boolean); timers[timers.indexOf(t)] = null; return t; };
  let woke = 0;
  armServerWake(1000, () => { woke += 1; }, { now:() => clock, setTimer, clearTimer, slack:5 });
  let t = fire();
  assert.equal(t.at, 1005);
  clock = 960; t.fn();
  assert.equal(woke, 0, "short of the instant on the clock: no wake");
  t = fire();
  assert.equal(t.at, 960 + 40 + 5, "armed again for what is left");
  clock = t.at; t.fn();
  assert.equal(woke, 1);
  assert.equal(timers.filter(Boolean).length, 0, "once");
  /* an instant already reached wakes at once; a cancel clears it */
  woke = 0;
  armServerWake(500, () => { woke += 1; }, { now:() => clock, setTimer, clearTimer });
  assert.equal(woke, 1);
  const cancel = armServerWake(5000, () => { woke += 1; }, { now:() => clock, setTimer, clearTimer });
  cancel();
  assert.equal(timers.filter(Boolean).length, 0);
});

test("useServerWake never loops: an instant the drawing already reached wakes nothing", async () => {
  const m = await clockModule();
  const React = m.fakeReact;
  const w = world();
  try {
    m.resetServerClock();
    let renders = 0;
    React.mount(() => { renders += 1; m.useServerWake(500, { drawnAt:800 }); return null; });
    w.advance(5000, () => { while (React.isDirty()) React.render(); });
    assert.equal(renders, 1);
    assert.equal(w.armed(), 0);
    React.unmount();
  } finally { w.restore(); }
});

test("every board clock wakes through useServerWake: the phone's sheet and Home row, its buzzer's lockout, the TV's board and its chase", () => {
  const phone = readFileSync(new URL("../src/features/trivia/BoardPlay.jsx", import.meta.url), "utf8");
  const tv = readFileSync(new URL("../src/features/tv/TVBoard.jsx", import.meta.url), "utf8");
  for (const [name, src] of [["BoardPlay.jsx", phone], ["TVBoard.jsx", tv]]) {
    assert.ok(!/setTimeout\(\s*\(\)\s*=>\s*wake\(/.test(src), `${name}: no bare wake timer left`);
    assert.ok(!/function useWakeAt/.test(src), `${name}: no one-shot wake`);
  }
  assert.match(phone, /function useBoardNow[\s\S]{0,400}useServerWake\(next, \{ drawnAt:now \}\)/);
  assert.match(phone, /useServerWake\(lockUntil, \{ drawnAt:now \}\)/, "the buzzer's lockout ends on time too");
  assert.equal((tv.match(/useServerWake\(fixed \? 0 : next, \{ drawnAt:now, slack:10 \}\)/g) || []).length, 2, "the TV's board and its chase");
});
