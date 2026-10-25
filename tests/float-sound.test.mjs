/* Float's sound, the core (float/PROTOCOL.md "Sound"; float/client/sound):
   the gun and the countdown on the room's clock, the catch-up and stale
   gates, the band's bars on a rolling window from the gun (laid during the
   countdown so bar 0 lands on time), the beds' stops on every change, a
   screen that joins late, the lounge on the server's own grid, the
   connection's grace, reduced motion, and Float's clock turned into the
   engine's. Synthetic message streams through the pure step and the
   runner; the recipes themselves are tests/float-sound-kit.test.mjs. */
import test, { mock } from "node:test";
import assert from "node:assert/strict";

globalThis.__FD_BUILD_ID__ = "build-test";
const screen = await import("../float/client/sound/screen.js");
const music = await import("../float/client/sound/music.js");
const cup = await import("../float/client/sound/cup.js");
const T0 = 1_900_000_000_000;

/* a room message */
const room = (phase, s, extra = {}) => ({ t:"room", s, phase, mode:"party", code:"BXRT", round:0, rounds:4, leg:0,
  field:[0, 1, 2], out:[], entrants:[{ device:"a", look:{ pose:"flex" } }, { device:"b" }, { device:"c" }], ...extra });
/* run messages through the pure step, collecting the cues */
function run(messages, { reduced = false, visible = true, lag = 40 } = {}) {
  let mem = screen.initialScreen();
  const cues = [];
  for (const msg of messages) {
    const r = screen.screenStep(mem, msg, { now:(msg.now ?? msg.s) + lag, visible, reduced });
    mem = r.mem; cues.push(...r.cues);
  }
  return { mem, cues };
}
const ids = cues => cues.map(cue => cue.id);
const welcome = s => ({ t:"welcome", s, you:{ device:"tv", role:"screen" } });

test("the gun: a countdown names it as its end, or as the race's start; the numbers on its last three seconds, the go on the gun", () => {
  const s = T0;
  /* startAt the countdown's own start, endsAt the gun */
  const a = run([welcome(s), room("lobby", s), room("grid", s + 1000), room("countdown", s + 5000, { startAt:s + 5000, endsAt:s + 8000 })]);
  const gun = s + 8000;
  assert.equal(a.mem.gun.at, gun);
  assert.deepEqual(a.cues.filter(cue => cue.id === "floatCount").map(cue => [cue.at - gun, cue.opts.n]), [[-3000, 3], [-2000, 2], [-1000, 1]]);
  assert.deepEqual(a.cues.filter(cue => cue.id === "floatGo").map(cue => cue.at), [gun]);
  /* startAt the gun itself (ahead of the message), endsAt something later (the cap) */
  const b = run([welcome(s), room("lobby", s), room("countdown", s + 5000, { startAt:s + 8000, endsAt:s + 120000 })]);
  assert.equal(b.mem.gun.at, s + 8000, "the first instant well ahead of the message is the gun");
  /* nothing named: a 3 s countdown from the message */
  assert.equal(run([welcome(s), room("lobby", s), room("countdown", s + 5000)]).mem.gun.at, s + 8000);
  /* the round keeps its gun: a later message in the countdown about something else cannot move it */
  const c = run([welcome(s), room("lobby", s), room("countdown", s + 5000, { endsAt:s + 8000 }), room("countdown", s + 6500, { endsAt:s + 9000, entrants:[] })]);
  assert.equal(c.mem.gun.at, s + 8000);
  assert.equal(c.cues.filter(cue => cue.id === "floatGo").length, 1, "the same countdown counts once");
  /* the race's own startAt corrects a gun that moved (a restarted room's resume) */
  assert.equal(cup.gunTime({ phase:"race", round:0, startAt:s + 9500, s:s + 9500 }, { round:0, at:s + 8000 }), s + 9500);
  /* a final counts with its weight */
  const f = run([welcome(s), room("lobby", s), room("countdown", s + 5000, { round:3, leg:3, endsAt:s + 8000 })]);
  assert.ok(f.cues.filter(cue => /floatCount|floatGo/.test(cue.id)).every(cue => cue.opts.final === true));
  /* a countdown message that lands late counts only what is still ahead */
  const late = run([welcome(s), room("lobby", s), { ...room("countdown", s + 5000, { endsAt:s + 8000 }), now:s + 6200 }]);
  assert.deepEqual(late.cues.filter(cue => cue.id === "floatCount").map(cue => cue.opts.n), [2, 1]);
  assert.equal(screen.COUNT_BEATS.length, 3);
});

test("a load or a reconnect is a catch-up: the first room on a connection sounds nothing, and nor does anything stale or hidden", () => {
  const s = T0;
  /* a screen that loads mid-countdown: silent, though it learns the gun */
  const load = run([welcome(s), room("countdown", s + 100, { endsAt:s + 3000 })]);
  assert.deepEqual(load.cues, []);
  assert.equal(load.mem.gun.at, s + 3000);
  /* a reconnect: the status closes and opens, and the next room is a catch-up again */
  let mem = run([welcome(s), room("lobby", s)]).mem;
  mem = screen.screenStatus(mem, "closed", s + 10);
  mem = screen.screenStatus(mem, "open", s + 2000);
  assert.equal(mem.live, false);
  let r = screen.screenStep(mem, room("grid", s + 2100), { now:s + 2120 });
  assert.deepEqual(r.cues, [], "the room after a reconnect is news to nobody");
  r = screen.screenStep(r.mem, room("countdown", s + 4000, { endsAt:s + 7000 }), { now:s + 4030 });
  assert.ok(ids(r.cues).includes("floatGo"), "and the next one is live again");
  /* a welcome alone starts a catch-up too (the room restarted) */
  assert.equal(screen.screenStep(r.mem, welcome(s + 5000), { now:s + 5000 }).mem.live, false);
  /* stale: a room or an event stamped long before it lands */
  const stale = run([welcome(s), room("lobby", s), { ...room("grid", s + 1000), now:s + 1000 + screen.ROOM_FRESH_MS + 1 }]);
  assert.deepEqual(stale.cues, []);
  const live = run([welcome(s), room("lobby", s), room("race", s + 1000, { startAt:s + 1000 })]).mem;
  assert.deepEqual(screen.screenStep(live, { t:"ev", s:s + 2000, e:"flip", i:1 }, { now:s + 2000 + screen.EV_FRESH_MS + 1 }).cues, []);
  assert.equal(screen.screenStep(live, { t:"ev", s:s + 2000, e:"flip", i:1 }, { now:s + 2060 }).cues[0].id, "floatFlip");
  /* hidden: nothing sounds, though the memory keeps up */
  const hidden = screen.screenStep(live, room("cut", s + 3000), { now:s + 3020, visible:false });
  assert.deepEqual(hidden.cues, []);
  assert.equal(hidden.mem.view.phase, "cut");
});

test("the race's bed: bar 0 on the gun, bars end to end, the turn and the phrase (a fill on the eighth bar, a crash on the ninth)", () => {
  const s = T0, gun = s + 8000;
  const { mem } = run([welcome(s), room("lobby", s), room("countdown", s + 5000, { endsAt:gun })]);
  const track = music.musicTrack(mem);
  assert.deepEqual([track.mode, track.anchor, track.leg, track.final], ["race", gun, 0, false]);
  assert.equal(track.key, `race:0:${gun}`);
  const bars = music.barsBetween(track, s, gun + 20 * music.BAR_MS, mem);
  assert.equal(bars[0].at, gun, "nothing before the gun");
  assert.ok(bars.every((bar, i) => bar.at === gun + i * music.BAR_MS && bar.id === "floatRace"), "bars butt end to end on the gun");
  assert.deepEqual(bars.slice(0, 8).map(bar => bar.opts.bar), [0, 1, 2, 3, 0, 1, 2, 3], "the four-bar turn");
  assert.deepEqual(bars.slice(0, 10).map(bar => bar.opts.fill), [false, false, false, false, false, false, false, true, false, false]);
  assert.deepEqual(bars.slice(0, 10).map(bar => bar.opts.crash), [false, false, false, false, false, false, false, false, true, false]);
  assert.equal(bars[0].opts.first, true, "the gun's bar hits the chord");
  assert.equal(music.BAR_MS, 2000, "120 a minute in four, the numbers on whole beats of it");
  assert.ok(screen.COUNT_BEATS.every(ms => ms % (music.BAR_MS / 4) === 0), "3, 2, 1 fall on the band's beats");
  /* the lounge and the vamp elsewhere */
  assert.equal(music.musicTrack(run([welcome(s), room("lobby", s)]).mem).mode, "lounge");
  assert.equal(music.musicTrack(run([welcome(s), room("lobby", s), room("grid", s + 1000)]).mem).mode, "vamp");
  assert.equal(music.musicTrack(run([welcome(s), room("lobby", s), room("podium", s + 1000, { podium:[0, 1, 2] })]).mem), null, "the podium's fanfare has the room");
  assert.equal(music.musicTrack(run([welcome(s), room("lobby", s)]).mem, { reduced:true }), null);
});

/* a fake connection, a recorder for the engine, and a hand-turned clock */
function rig({ reduced = false, visible = true, status = "open" } = {}) {
  let now = T0;
  const handlers = {}, statusFns = [];
  const net = { on(type, fn) { (handlers[type] ||= new Set()).add(fn); return () => handlers[type].delete(fn); },
    onStatus(fn) { statusFns.push(fn); return () => {}; }, serverNow:() => now, status:() => status };
  const played = [];
  const play = (id, at, options) => {
    const entry = { id, at, opts:options?.opts || {}, cancelled:false, key:options?.key ?? null };
    played.push(entry);
    return { cancel() { entry.cancelled = true; } };
  };
  const runner = screen.createFloatScreenSound(net, { play, reduced:() => reduced, visible:() => visible, setInterval:() => 0, clearInterval:() => {} });
  const emit = (type, msg = {}) => (handlers[type] || []).forEach(fn => fn({ s:now, ...msg }));
  const advance = (ms, step = 125) => { for (let t = 0; t < ms; t += step) { now += step; runner.tick(); } };
  return { net, played, runner, emit, advance, now:() => now, set:at => { now = at; }, status:next => statusFns.forEach(fn => fn(next)) };
}
const course = {
  id:"salt", line:Array.from({ length:260 }, (_, k) => [k * 4, 0, 24]),
  legs:[{ id:"putin", name:"Put-in", s0:0, s1:300, grid:10, finish:290 }, { id:"narrows", name:"The Narrows", s0:300, s1:520, grid:310, finish:510 },
    { id:"whirl", name:"Whirlpool Bend", s0:520, s1:760, grid:530, finish:750 }, { id:"drop", name:"The Drop", s0:760, s1:1030, grid:770, finish:1020 }],
  zones:[{ k:"pool", s0:0, s1:80 }, { k:"riffle", s0:80, s1:200 }, { k:"narrows", s0:300, s1:500 }, { k:"whirlpool", s0:560, s1:640 },
    { k:"drop", s0:880, s1:950 }, { k:"bar", s0:960, s1:1040 }],
  elev:[[0, 20], [900, 18], [940, 17.6], [944, 12], [1040, 12]],
};
export { course as FLOAT_TEST_COURSE };

test("the runner lays the band a bar ahead: the vamp after the title, bar 0 on the gun during the countdown, and every bar on its line", () => {
  const r = rig();
  r.emit("welcome", { you:{ device:"tv" } });
  r.emit("room", { ...room("lobby", r.now()), course });
  r.advance(1000);
  const grid = r.now() + 500;
  r.set(grid);
  r.emit("room", room("grid", grid, { startAt:grid }));
  assert.equal(r.played.filter(p => p.id === "floatTitle").length, 1);
  r.advance(3500);
  const vamp = r.played.filter(p => p.id === "floatVamp");
  assert.equal(vamp[0].at, grid + music.TITLE_HOLD_MS, "the title's sting has the vamp's first bar line to itself");
  const cd = r.now(), gun = cd + 3000;
  r.emit("room", room("countdown", cd, { startAt:cd, endsAt:gun }));
  assert.ok(vamp.every(p => p.cancelled), "the countdown takes over from the vamp, the ringing bar fading");
  r.advance(2500);
  const race = r.played.filter(p => p.id === "floatRace");
  assert.equal(race.length, 1, "bar 0 is laid during the countdown");
  assert.equal(race[0].at, gun);
  assert.ok(race[0].at - (cd + 2375) >= music.MUSIC_LEAD_MS - 125 - 1, "about a lead ahead of its start");
  r.emit("room", room("race", gun, { startAt:gun }));
  r.advance(10000);
  const bars = r.played.filter(p => p.id === "floatRace");
  assert.deepEqual(bars.map(p => p.at - gun), [0, 2000, 4000, 6000, 8000, 10000], "the race message keeps the countdown's track: no restart, no doubles");
  assert.ok(bars.every(p => !p.cancelled));
  /* the round ends: every bar still to come dropped, the one ringing faded (cancel), and the button */
  const cutAt = r.now();
  r.emit("room", room("cut", cutAt));
  const live = bars.filter(p => p.at > cutAt - music.BAR_MS);
  assert.ok(live.length >= 2 && live.every(p => p.cancelled), "the bar ringing and the bar laid ahead, both stopped");
  assert.equal(r.played.filter(p => p.id === "floatButton").length, 1);
  r.advance(4000);
  const lounge = r.played.filter(p => p.id === "floatLounge");
  assert.ok(lounge.length && lounge[0].at >= bars.at(-1).at + music.CUT_HOLD_MS - 2000, "the lounge comes in after the button and the stings");
  assert.ok(lounge.every(p => p.at % music.BAR_MS === 0 && p.opts.cut === true));
  /* the podium: the band drops out for the fanfare */
  const podiumAt = r.now();
  r.emit("room", room("podium", podiumAt, { round:3, podium:[0, 1, 2] }));
  assert.ok(lounge.filter(p => p.at > podiumAt - music.BAR_MS).every(p => p.cancelled));
  r.advance(3000);
  assert.equal(r.played.filter(p => /floatRace|floatVamp|floatLounge/.test(p.id) && !p.cancelled && p.at > podiumAt - music.BAR_MS).length, 0,
    "nothing from the band under the fanfare");
  assert.equal(r.played.filter(p => p.id === "floatPodium").length, 1);
  r.runner.stop();
});

test("a screen that joins mid-race hears the band from the next bar line and no moment of the race so far", () => {
  const r = rig();
  const gun = T0 - 13_300;
  r.emit("welcome", { you:{ device:"tv" } });
  r.emit("room", { ...room("race", r.now(), { startAt:gun }), course });
  r.advance(3000);
  const bars = r.played.filter(p => p.id === "floatRace");
  assert.ok(bars.length >= 1);
  assert.equal(bars[0].at, gun + 7 * music.BAR_MS, "on the race's own grid, the next bar line ahead");
  assert.deepEqual(bars.map(p => p.opts.bar), bars.map(p => Math.round((p.at - gun) / music.BAR_MS) % 4));
  assert.equal(r.played.filter(p => /floatGo|floatCount|floatTitle/.test(p.id)).length, 0, "no countdown, title or gun from a catch-up");
  r.runner.stop();
});

test("the lounge rides the server's own bar grid, so every screen in a room is on the same bar", () => {
  const a = rig(), b = rig();
  for (const r of [a, b]) { r.emit("welcome", {}); r.emit("room", room("lobby", r.now())); }
  a.advance(9000);
  b.set(T0 + 3_333); b.advance(5000);
  const atA = new Map(a.played.filter(p => p.id === "floatLounge").map(p => [p.at, JSON.stringify(p.opts)]));
  const shared = b.played.filter(p => p.id === "floatLounge" && atA.has(p.at));
  assert.ok(shared.length >= 2);
  assert.ok(shared.every(p => atA.get(p.at) === JSON.stringify(p.opts)), "the same bar, the same chord, the same section");
  assert.ok(a.played.filter(p => p.id === "floatLounge").every(p => p.at % music.BAR_MS === 0));
  /* a 32-bar form: the turn every 8, a section every 8 */
  const cue = n => music.barCue({ mode:"lounge", anchor:0 }, n);
  assert.deepEqual([cue(0).opts, cue(9).opts, cue(31).opts], [{ bar:0, section:0, cut:false }, { bar:1, section:1, cut:false }, { bar:7, section:3, cut:false }]);
});

test("the connection: the beds hold through a blip and stop after the grace; reopened, the first room is a catch-up", () => {
  const r = rig();
  r.emit("welcome", {});
  r.emit("room", { ...room("lobby", r.now()), course });
  r.advance(4000);
  const before = r.played.filter(p => p.id === "floatLounge").length;
  r.status("closed");
  r.advance(2000);
  assert.ok(r.played.filter(p => p.id === "floatLounge").length > before, "a blip: the band plays on");
  r.advance(2000);
  const stopped = r.played.filter(p => p.id === "floatLounge" || p.id === "floatRiver");
  assert.ok(stopped.every(p => p.cancelled || p.at < r.now()), "past the grace: everything still to come is dropped");
  const count = r.played.length;
  r.advance(3000);
  assert.equal(r.played.length, count, "and nothing new is laid while the connection is down");
  r.status("open");
  r.emit("room", room("grid", r.now()));
  assert.equal(r.played.filter(p => p.id === "floatTitle").length, 0, "the room after reopening is a catch-up");
  r.advance(4000);
  assert.ok(r.played.filter(p => p.id === "floatVamp").length > 0, "the beds come back on the next bar line");
  r.runner.stop();
});

test("reduced motion: no band, no river, no paddles; the countdown is its go and the podium its chord", () => {
  const r = rig({ reduced:true });
  r.emit("welcome", {});
  r.emit("room", { ...room("lobby", r.now()), course });
  r.emit("room", room("grid", r.now() + 10));
  const cd = r.now() + 20;
  r.emit("room", room("countdown", cd, { endsAt:cd + 3000 }));
  r.advance(6000);
  r.emit("room", room("race", r.now(), { startAt:cd + 3000 }));
  for (let k = 1; k < 10; k++) r.emit("snap", { s:r.now() + k * 50, k:[[0, k, 0, 0, k % 2 ? 16 : 32, k]] });
  r.advance(3000);
  r.emit("room", room("podium", r.now(), { round:3, podium:[0, 1, 2] }));
  const heard = r.played.map(p => p.id);
  assert.deepEqual(heard.filter(id => /floatRace|floatVamp|floatLounge|floatRiver|floatPaddles|floatCount/.test(id)), []);
  assert.deepEqual(heard.filter(id => id === "floatGo").length, 1);
  assert.deepEqual(r.played.filter(p => p.id === "floatTitle").map(p => p.opts.summary), [true]);
  assert.deepEqual(r.played.filter(p => /floatPodium|floatStamp|floatWinner/.test(p.id)).map(p => [p.id, p.opts.summary]), [["floatPodium", true]]);
  r.runner.stop();
});

test("Float's clock to the engine's: a cue at the room's +1 s lands a second ahead on the audio clock, whatever either clock's offset", async () => {
  mock.timers.enable({ apis:["setTimeout", "Date"], now:T0 });
  try {
    const sound = await import("../src/lib/sound.js");
    const clock = await import("../src/lib/serverClock.js");
    const made = [];
    class Ctx {
      constructor() { this.state = "suspended"; this.currentTime = 10; this.sampleRate = 8000; this.outputLatency = 0.05; this.destination = {};
        this.starts = []; made.push(this); }
      node(kind) { const ctx = this; const param = () => ({ value:1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime() {} });
        return { kind, gain:param(), frequency:param(), Q:param(), pan:param(), threshold:param(), knee:param(), ratio:param(), attack:param(), release:param(),
          connect(n) { return n; }, disconnect() {}, start(t) { ctx.starts.push(t); }, stop() {} }; }
      createGain() { return this.node("gain"); } createBiquadFilter() { return this.node("filter"); } createDynamicsCompressor() { return this.node("comp"); }
      createConvolver() { return this.node("conv"); } createStereoPanner() { return this.node("pan"); } createOscillator() { return this.node("osc"); }
      createBufferSource() { return this.node("src"); } createBuffer(c, l) { return { length:l, numberOfChannels:c, getChannelData:() => new Float32Array(l) }; }
      resume() { this.state = "running"; this.onstatechange?.(); return Promise.resolve(); } close() { this.state = "closed"; }
    }
    sound.__resetSoundEngine({ factory:Ctx });
    sound.setSoundSurface("tv");
    sound.primeSound();
    /* Field Day's clock 2 s ahead of this device, Float's room 7 s ahead */
    clock.resetServerClock();
    clock.noteServerTime(Date.now() + 2000, Date.now());
    let handlers = {};
    const net = { on(type, fn) { (handlers[type] ||= []).push(fn); return () => {}; }, serverNow:() => Date.now() + 7000, status:() => "open" };
    /* reduced, so the gun is the only thing that sounds */
    const runner = screen.createFloatScreenSound(net, { setInterval:() => 0, clearInterval:() => {}, reduced:() => true, visible:() => true });
    const emit = (type, msg) => handlers[type]?.forEach(fn => fn({ s:net.serverNow(), ...msg }));
    emit("welcome", {});
    emit("room", room("lobby", net.serverNow()));
    const ctx = made[0];
    ctx.starts.length = 0;
    /* a countdown whose gun is 1 s ahead on Float's clock */
    emit("room", room("countdown", net.serverNow(), { endsAt:net.serverNow() + 1000 }));
    assert.equal(ctx.starts.length, 0, "a cue a second out waits on a timer");
    mock.timers.tick(760);
    assert.ok(ctx.starts.length > 0, "and is scheduled a lookahead before it is due");
    const earliest = Math.min(...ctx.starts);
    assert.ok(Math.abs(earliest - (10 + 0.25 - 0.05)) < 0.02, `the gun lands on Float's second, on the audio clock: ${earliest}`);
    assert.equal(screen.toEngine(5000, 4000, 9000), 10000);
    runner.stop();
    clock.resetServerClock();
    sound.__resetSoundEngine();
  } finally { mock.timers.reset(); }
});
