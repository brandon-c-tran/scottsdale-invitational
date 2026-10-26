/* Paddle strokes from touches (float/PROTOCOL.md: {t:"stroke", side, p}).
   Pure, so it is tested without a browser: the controller feeds every touch
   in content space (x right, y down, CSS px, t in ms) and gets one
   onStroke({ id, side, p, kind, at }) per stroke.

   A stroke is a pull: a thumb moving down its half, the way a paddle pulls
   water back. It fires when the pull ends, so its power reads the whole pull:
     lift     the thumb comes off (most strokes)
     reverse  the thumb rises REVERSE_PX from the pull's lowest point, so a
              thumb that scrubs down and up without lifting strokes each pull
     stall    the thumb stops going down for STALL_MS (pulled and held)
   After any of them the next pull starts from where the thumb is, so a
   resting thumb that jitters never blocks the swipe that follows it.
   Power is the pull's speed and length together; a tap (barely moving, and
   quick) is a light stroke. A pull slower than MIN_SPEED or longer than
   MAX_PULL_MS is a drift (a resting thumb or palm shifting), not a stroke,
   and one side never fires twice within FLOOR_MS. */

export const STROKE = Object.freeze({
  MIN_PX:14,          // the travel that makes a pull a stroke
  START_PX:2,         // moving down this far from the top starts a pull
  REVERSE_PX:10,      // rising this far from the lowest point ends a pull
  STALL_MS:150,       // not going down for this long ends a pull
  MAX_PULL_MS:900,    // a pull longer than this is a drift
  MIN_SPEED:0.08,     // px per ms: a pull slower than this is a drift
  TAP_PX:16,          // a touch that wanders less than this ...
  TAP_MS:320,         // ... and lifts within this is a tap
  TAP_P:0.3,          // a tap is a light stroke, and no stroke is lighter
  BASE_P:0.25,        // the weakest pull before the floor
  FULL_PX:120,        // a full-length pull
  FULL_SPEED:1.2,     // a full-speed pull, px per ms
  FRAME_MS:16,        // a pull left its top at most a frame before it was seen moving
  FLOOR_MS:80,        // the shortest gap between two strokes on one side
});

const round2 = v => Math.round(v * 100) / 100;

/* a pull's power, 0..1, from its travel (px) and time (ms) */
export function strokePower(travel, ms, k = STROKE) {
  const speed = travel / Math.max(k.FRAME_MS, ms);
  const s = Math.min(1, speed / k.FULL_SPEED);
  const l = Math.min(1, travel / k.FULL_PX);
  const p = k.BASE_P + (1 - k.BASE_P) * Math.pow(s, 0.8) * (0.5 + 0.5 * l);
  return round2(Math.min(1, Math.max(k.TAP_P, p)));
}

export function createStrokes({ onStroke = () => {}, k = STROKE } = {}) {
  const touches = new Map();
  const lastAt = { L:-Infinity, R:-Infinity };

  const fire = (touch, kind, at, p) => {
    if (at - lastAt[touch.side] < k.FLOOR_MS) return null;
    lastAt[touch.side] = at;
    touch.strokes++;
    const stroke = { id:touch.id, side:touch.side, p, kind, at };
    onStroke(stroke);
    return stroke;
  };
  /* the pull in hand, if it is a stroke; the next pull starts from `y` */
  const endPull = (touch, kind, at, y) => {
    const travel = touch.bottom - touch.top, ms = Math.max(k.FRAME_MS, touch.bottomT - touch.pullT);
    touch.pulling = false;
    touch.top = y; touch.topT = at;
    if (travel < k.MIN_PX || ms > k.MAX_PULL_MS || travel / ms < k.MIN_SPEED) return null;
    return fire(touch, kind, at, strokePower(travel, ms, k));
  };
  const track = (touch, x, y, t) => {
    touch.wander = Math.max(touch.wander, Math.hypot(x - touch.x0, y - touch.y0));
    let fired = null;
    if (!touch.pulling) {
      if (y <= touch.top) { touch.top = y; touch.topT = t; }
      else if (y - touch.top > k.START_PX) {
        touch.pulling = true;
        touch.pullT = Math.max(touch.lastT, t - k.FRAME_MS);
        touch.bottom = y; touch.bottomT = t;
      }
    } else if (y > touch.bottom) { touch.bottom = y; touch.bottomT = t; }
    else if (touch.bottom - y >= k.REVERSE_PX) fired = endPull(touch, "reverse", t, y);
    touch.lastY = y; touch.lastT = t;
    return fired;
  };

  return {
    down(id, side, x, y, t) {
      const touch = { id, side:side === "R" ? "R" : "L", x0:x, y0:y, t0:t, wander:0, top:y, topT:t, bottom:y, bottomT:t,
        pullT:t, pulling:false, lastY:y, lastT:t, strokes:0 };
      touches.set(id, touch);
      return touch.side;
    },
    move(id, x, y, t) {
      const touch = touches.get(id);
      return touch ? track(touch, x, y, t) : null;
    },
    /* the thumb comes off: the pull it was making, else a tap */
    up(id, x, y, t) {
      const touch = touches.get(id);
      if (!touch) return null;
      let fired = track(touch, x, y, t);
      if (!fired && touch.pulling) fired = endPull(touch, "lift", t, y);
      if (!fired && !touch.strokes && touch.wander < k.TAP_PX && t - touch.t0 <= k.TAP_MS) fired = fire(touch, "tap", t, k.TAP_P);
      touches.delete(id);
      return fired;
    },
    /* the system took the touch (touchcancel): it ends without a stroke */
    cancel(id) { touches.delete(id); },
    /* pulls that stopped going down; call when stallAt() comes due */
    tick(t) {
      const fired = [];
      for (const touch of touches.values()) {
        if (!touch.pulling || t - touch.bottomT < k.STALL_MS) continue;
        const stroke = endPull(touch, "stall", t, touch.lastY);
        if (stroke) fired.push(stroke);
      }
      return fired;
    },
    /* when the next stall could fire, or null */
    stallAt() {
      let at = null;
      for (const touch of touches.values()) if (touch.pulling) at = Math.min(at ?? Infinity, touch.bottomT + k.STALL_MS);
      return at;
    },
    sideOf:id => touches.get(id)?.side ?? null,
    /* how far the touch is pulling below where its pull began (the blade follows it 1:1) */
    pullOf:id => {
      const touch = touches.get(id);
      return touch?.pulling ? Math.max(0, touch.lastY - touch.top) : 0;
    },
    /* the sides with a thumb down now */
    sides() { return new Set([...touches.values()].map(touch => touch.side)); },
    clear() { touches.clear(); },
  };
}

/* The room drops a phone's strokes past 10 a second, and the river's
   cadence bucket ignores them well before that, so the phone sends at most
   `max` in any `windowMs`. Pure: allow(t) says whether a stroke at t goes. */
export function createStrokeGate({ max = 8, windowMs = 1000 } = {}) {
  const sent = [];
  return {
    allow(t) {
      while (sent.length && t - sent[0] >= windowMs) sent.shift();
      if (sent.length >= max) return false;
      sent.push(t);
      return true;
    },
    clear() { sent.length = 0; },
  };
}
