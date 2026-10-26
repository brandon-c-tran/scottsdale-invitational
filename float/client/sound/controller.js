/* The phone's own sound (float/PROTOCOL.md "Sound"), on the you bus:
   only what is yours, soft, and never a loss.

     taps     your paddle (a soft dip, one of four, never the same twice
              running, lower on the left), your drink, your balloon: the
              controller calls floatStrokeSound, floatDrinkSound and
              floatThrowSound in its own touch handlers, so they land with
              the thumb. Without them, the server's echo stands in: the
              stroke bits rising on your `me`, your own `drink` and
              `balloon` events (a tap this recent keeps the echo quiet).
     moments  your flip (your `flip` event, or SWIM rising on your `me`),
              you in at the bar (your `arrive`, or ARRIVED rising), your
              balloon landing on someone (a `splash` you threw), a balloon
              landing on you, "through" when the cut leaves you in, your
              place on the podium.

   Silent: being out (no loss sound, ever), the countdown (the TV counts
   for the room), anyone else's moments, a catch-up (the first room
   message on a connection), anything stale or while the page is hidden.
   Pure apart from the runner, the taps and the hook at the bottom. */
import { useEffect, useRef } from "react";
import { installSoundUnlock, playSound, unlockSound } from "../../../src/lib/sound.js";
import { FLAG, cupView, has, indexOf } from "./cup.js";

export const ME_FRESH_MS = 1500;
export const PHONE_EV_FRESH_MS = 1000;
/* a `me` further from the last than this is a gap: it only records */
export const ME_GAP_MS = 600;
/* a tap this recent stands for the server's echo of it */
export const TAP_ECHO_MS = 2500;
/* your paddle: one dip each STROKE_GAP_MS at most */
export const STROKE_GAP_MS = 45;
export const FLIP_HOLD_MS = 1500;

/* the controller's taps (wall clock), shared by the tap functions and the runner */
const taps = { stroke:-Infinity, drink:-Infinity, throw:-Infinity, lastDip:-Infinity, variant:-1 };
export const lastTaps = () => ({ ...taps });

export function initialController({ me = null, open = true } = {}) {
  return { open, live:false, me:indexOf(me), view:null, raced:null, flags:null, flagsAt:0, lastFlip:-Infinity, arrived:null,
    through:null, placed:null, variant:-1 };
}
export function controllerStatus(mem, status) {
  const open = status === "open";
  if (open && !mem.open) return { ...mem, open:true, live:false, flags:null };
  if (!open && mem.open) return { ...mem, open:false, live:false, flags:null };
  return mem;
}

const nextVariant = last => { let v = Math.floor(Math.random() * 4); if (v === last) v = (v + 1) % 4; return v; };

/* One message through the phone's sound: the memory to keep and the cues
   it owes ({ id, opts }), each to play now on the you bus. ctx: now
   (Float's server ms), visible, me (the controller's own index, if it
   knows), taps (lastTaps()), wall (Date.now()). */
export function controllerStep(mem, msg, ctx = {}) {
  const m = { ...(mem || initialController()) };
  const now = Number(ctx.now) || Date.now(), wall = Number(ctx.wall) || Date.now(), visible = ctx.visible !== false;
  const tapped = ctx.taps || taps;
  if (Number.isInteger(ctx.me)) m.me = ctx.me;
  const me = m.me, cues = [];
  const s = Number(msg?.s);
  switch (msg?.t) {
    case "welcome": {
      const mine = indexOf(msg.you?.entrant);
      return { mem:{ ...m, live:false, flags:null, me:Number.isInteger(ctx.me) ? ctx.me : mine ?? m.me }, cues };
    }
    case "me": {
      if (Number.isInteger(Number(msg.i)) && !Number.isInteger(ctx.me)) m.me = Number(msg.i);
      const f = Number(msg.f) | 0, was = m.flags;
      const fresh = m.live && visible && was !== null && Number.isFinite(s) && now - s <= ME_FRESH_MS && s - m.flagsAt <= ME_GAP_MS && s > m.flagsAt;
      if (fresh) {
        /* the echo of a stroke, when the controller does not report its taps */
        if (wall - tapped.stroke > TAP_ECHO_MS) for (const [bit, side] of [[FLAG.STROKE_L, "L"], [FLAG.STROKE_R, "R"]])
          if (has(f, bit) && !has(was, bit)) { m.variant = nextVariant(m.variant); cues.push({ id:"floatDip", opts:{ side, p:0.7, v:m.variant } }); }
        if (has(f, FLAG.SWIM) && !has(was, FLAG.SWIM) && now - m.lastFlip > FLIP_HOLD_MS) { m.lastFlip = now; cues.push({ id:"floatYouFlip" }); }
        const round = m.view?.round ?? 0;
        if (has(f, FLAG.ARRIVED) && !has(was, FLAG.ARRIVED) && m.arrived !== round) { m.arrived = round; cues.push({ id:"floatYouArrive" }); }
      }
      if (Number.isFinite(s)) { m.flags = f; m.flagsAt = s; }
      return { mem:m, cues };
    }
    case "room": {
      const v = cupView(msg);
      if (!v) return { mem:m, cues };
      const at = Number.isFinite(v.s) ? v.s : now;
      const prev = m.view, fresh = m.live && visible && now - at <= ME_FRESH_MS;
      m.view = v; m.live = true;
      if (v.phase === "race" && Number.isInteger(me) && v.field.includes(me)) m.raced = v.round;
      const moved = prev && (prev.phase !== v.phase || prev.round !== v.round);
      if (fresh && moved && Number.isInteger(me)) {
        /* through: you raced the round and the cut left you in (out: silent) */
        if (v.phase === "cut" && m.raced === prev.round && !v.out.includes(me) && m.through !== prev.round) {
          m.through = prev.round; cues.push({ id:"floatYouThrough" });
        }
        const place = v.podium.indexOf(me) + 1;
        if (v.phase === "podium" && place >= 1 && place <= 3 && m.placed !== at) { m.placed = at; cues.push({ id:"floatYouPodium", opts:{ place } }); }
      }
      return { mem:m, cues };
    }
    case "ev": {
      const fresh = m.live && visible && Number.isFinite(s) && now - s <= PHONE_EV_FRESH_MS;
      if (!fresh || !Number.isInteger(me)) return { mem:m, cues };
      const i = Number(msg.i), j = msg.j === undefined || msg.j === null ? null : Number(msg.j);
      const round = m.view?.round ?? 0;
      if (msg.e === "splash" && j === me) { cues.push({ id:"floatYouHit" }); return { mem:m, cues }; }
      if (i !== me) return { mem:m, cues };
      if (msg.e === "flip" && now - m.lastFlip > FLIP_HOLD_MS) { m.lastFlip = now; cues.push({ id:"floatYouFlip" }); }
      else if (msg.e === "arrive" && m.arrived !== round) { m.arrived = round; cues.push({ id:"floatYouArrive" }); }
      else if (msg.e === "drink" && wall - tapped.drink > TAP_ECHO_MS && m.view?.drinking !== false) cues.push({ id:"floatYouDrink" });
      else if (msg.e === "balloon" && wall - tapped.throw > TAP_ECHO_MS) cues.push({ id:"floatYouThrow" });
      else if (msg.e === "splash" && j !== null && j !== me) cues.push({ id:"floatYouSplat" });
      return { mem:m, cues };
    }
    default: return { mem:m, cues };
  }
}

/* ── the taps: call these inside the controller's own touch handlers ── */
const clamp01 = v => Math.max(0, Math.min(1, Number.isFinite(Number(v)) ? Number(v) : 0.8));
/* your paddle going in (side "L" or "R", power 0..1) */
export function floatStrokeSound(side = "L", power = 0.8) {
  try {
    unlockSound();
    const t = Date.now();
    taps.stroke = t;
    if (t - taps.lastDip < STROKE_GAP_MS) return null;
    taps.lastDip = t;
    taps.variant = nextVariant(taps.variant);
    return playSound("floatDip", { bus:"you", opts:{ side:side === "R" ? "R" : "L", p:clamp01(power), v:taps.variant } });
  } catch { return null; }
}
/* "Finished my drink" */
export function floatDrinkSound() {
  try { unlockSound(); taps.drink = Date.now(); return playSound("floatYouDrink", { bus:"you" }); } catch { return null; }
}
/* a water balloon thrown */
export function floatThrowSound() {
  try { unlockSound(); taps.throw = Date.now(); return playSound("floatYouThrow", { bus:"you" }); } catch { return null; }
}
export const FLOAT_TAPS = Object.freeze({ stroke:floatStrokeSound, drink:floatDrinkSound, throw:floatThrowSound });

/* ── the runner and the hook ── */
const pageVisible = () => { try { return globalThis.document?.visibilityState !== "hidden"; } catch { return true; } };
const floatNow = net => () => { try { const n = Number(net?.serverNow?.()); return Number.isFinite(n) && n > 0 ? n : Date.now(); } catch { return Date.now(); } };

/* Runs the phone's sound for one connection. `play(id, options)` sounds a
   cue now (default: playSound on the you bus). */
export function createFloatControllerSound(net, { me = null, play = null, visible = pageVisible } = {}) {
  if (!net || typeof net.on !== "function") return { stop() {}, setMe() {}, memory:() => null };
  const now = floatNow(net);
  const cue = play || ((id, options) => playSound(id, { bus:"you", ...options }));
  let own = indexOf(me);
  let status = "open";
  try { status = typeof net.status === "function" ? net.status() : "open"; } catch {}
  let mem = initialController({ me:own, open:status !== "closed" && status !== "connecting" });
  const offs = ["welcome", "me", "room", "ev"].map(type => {
    try {
      return net.on(type, msg => {
        try {
          const r = controllerStep(mem, { ...msg, t:type }, { now:now(), visible:visible(), me:own, taps:lastTaps(), wall:Date.now() });
          mem = r.mem;
          for (const c of r.cues) { try { cue(c.id, { opts:c.opts || {} }); } catch {} }
        } catch {}
      });
    } catch { return null; }
  });
  let offStatus = null;
  try { offStatus = net.onStatus?.(next => { mem = controllerStatus(mem, next); }) ?? null; } catch {}
  return {
    stop() { offs.forEach(off => { try { off?.(); } catch {} }); try { offStatus?.(); } catch {} },
    setMe(value) { own = indexOf(value); },
    memory:() => mem,
  };
}

/* The phone's sound for a connection: the global unlock (the first touch
   anywhere), and the runner. `me` is your entrant (an index, or the `me`
   message); the hook learns it from the room too. Returns the taps. */
export function useFloatControllerSound(net, { me = null } = {}) {
  const runner = useRef(null);
  const own = indexOf(me);
  useEffect(() => {
    try { installSoundUnlock(); } catch {}
    if (!net) return undefined;
    const r = createFloatControllerSound(net, { me:own });
    runner.current = r;
    return () => { r.stop(); runner.current = null; };
  }, [net]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { runner.current?.setMe(own); }, [own]);
  return FLOAT_TAPS;
}
