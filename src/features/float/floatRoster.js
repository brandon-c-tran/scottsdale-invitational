/* Float's riders on the TV (TVFloatRoster.jsx): while Float is still ahead
   (not played, not skipped, no Cup started) and the room is bound, one turn
   of the gap's rotation stands every rider coming in the look they picked,
   drawn by the room's own art (float/client/art riderPortrait), each name
   under its rider; a rider whose still is not in yet, or a TV that cannot
   draw them, shows the photo chip. Pure: TVMode and the fit audit build the
   same rotation from it, and the stills' store runs in node. */
import { rosterOf } from "../../../shared/core.js";
import { floatCup, floatEventOf, floatRider } from "../../../shared/float.js";

export const FLOAT_ROSTER_CARD = "float-roster";

/* every rider coming (Not coming left out), or null when there is no turn */
export function floatRosterRiders(state, events, { float = false } = {}) {
  if (!float || !state || state.frozen) return null;
  const ev = floatEventOf(state, events);
  if (!ev || state.shelved?.[ev.id] || state.results?.[ev.id] || floatCup(state)) return null;
  const riders = rosterOf(state).map(player => floatRider(state, player));
  return riders.length ? riders : null;
}

/* the gap's own cards with the riders' turn after what is next */
export function withFloatRoster(cards, on) {
  if (!on || cards.includes(FLOAT_ROSTER_CARD)) return cards;
  const at = cards.indexOf("next");
  const out = [...cards];
  out.splice(at < 0 ? out.length : at + 1, 0, FLOAT_ROSTER_CARD);
  return out;
}

/* canvas px: the panel, its rows of at most seven riders (the longer row
   first) and each rider's column, as large as the widest row allows up to
   `col` (two rows then stand clear of the masthead); a short roster's
   panel is only as wide as its riders */
export const ROSTER_PANEL = Object.freeze({ width:1680, pad:64, gap:28, col:200, perRow:7 });
export function rosterLayout(count, { width = ROSTER_PANEL.width, pad = ROSTER_PANEL.pad, gap = ROSTER_PANEL.gap,
  col = ROSTER_PANEL.col, perRow = ROSTER_PANEL.perRow } = {}) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  const rows = [];
  for (let left = n, k = Math.ceil(n / perRow); k > 0; k -= 1) {
    const take = Math.ceil(left / k);
    rows.push(take);
    left -= take;
  }
  const widest = Math.max(1, ...rows);
  const size = Math.min(col, Math.floor((width - 2 * pad - (widest - 1) * gap) / widest));
  return { rows, col:size, width:Math.min(width, widest * size + (widest - 1) * gap + 2 * pad) };
}

/* a still is the rider as the room would draw it: the look, the chip, the name */
export const portraitKey = rider => JSON.stringify([rider?.look || null, rider?.color || null, rider?.skin || null,
  rider?.number ?? null, rider?.photo || null, !!rider?.groom, rider?.name || null]);
const cleanUrl = url => typeof url === "string" && /^(data:image\/(png|jpeg|webp)[;,]|blob:)/.test(url) ? url : null;
const within = (promise, ms) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("timeout")), ms);
  promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
});

/* The stills, drawn one at a time (a TV draws one rider, then the next),
   kept by look for the session, so the turn after the first is instant. A
   still that throws, answers no image or takes longer than `wait` is none
   (the chip stands in, and it is not asked again); past `cap` stills in a
   session nothing more is drawn. */
export function portraitStore({ wait = 8000, cap = 40 } = {}) {
  const urls = new Map(), queued = new Set(), listeners = new Set();
  let line = Promise.resolve(), drawn = 0;
  const land = (key, url) => {
    urls.set(key, url);
    queued.delete(key);
    listeners.forEach(fn => fn());
  };
  return {
    get:rider => urls.get(portraitKey(rider)) || null,
    has:rider => urls.has(portraitKey(rider)),
    request(draw, rider, options = {}) {
      const key = portraitKey(rider);
      if (typeof draw !== "function" || urls.has(key) || queued.has(key) || drawn >= cap) return false;
      drawn += 1;
      queued.add(key);
      line = line.then(() => within(Promise.resolve().then(() => draw(rider, options)), wait))
        .then(url => land(key, cleanUrl(url)), () => land(key, null));
      return true;
    },
    idle:() => line,
    listen(fn) {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
  };
}
