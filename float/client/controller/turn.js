/* The phone held sideways (float/PROTOCOL.md "The phone held sideways").
   Pure geometry, shared by the frame, the touch input and the headless check.

   Many iPhones keep rotation lock on, so a phone held sideways can still
   report a portrait viewport. Sideways screens then draw the controller
   turned a quarter: `turn` is the content's rotation in degrees about the
   viewport's centre, 90 for a phone turned with its top to the left (the
   common grip), -90 for the other way, 0 in a landscape viewport, where the
   system already turned the page. Content space is the landscape layout:
   x right and y down as the player sees it. */

export const TURN_KEY = "float-turn";

/* the turn for a viewport { w, h }: sideways screens in a portrait viewport turn */
export function frameTurn({ w, h }, sideways, prefer = 90) {
  if (!sideways || !(h > w)) return 0;
  return prefer === -90 ? -90 : 90;
}

/* the frame's box in the viewport: the content's size, centred, then turned */
export function frameBox({ w, h }, turn) {
  const cw = turn ? h : w, ch = turn ? w : h;
  return { cw, ch, left:(w - cw) / 2, top:(h - ch) / 2, transform:turn ? `rotate(${turn}deg)` : "none" };
}

/* a viewport point (relative to the frame's container) in content space */
export function toContent(vx, vy, { w, h }, turn) {
  if (turn === 90) return { x:vy, y:w - vx };
  if (turn === -90) return { x:h - vy, y:vx };
  return { x:vx, y:vy };
}

/* a content point back in the viewport (the headless check aims its touches with it) */
export function toViewport(cx, cy, { w, h }, turn) {
  if (turn === 90) return { x:w - cy, y:cx };
  if (turn === -90) return { x:cy, y:h - cx };
  return { x:cx, y:cy };
}

/* which viewport edge's safe-area inset pads each content edge */
export function insetEdges(turn) {
  if (turn === 90) return { top:"right", right:"bottom", bottom:"left", left:"top" };
  if (turn === -90) return { top:"left", right:"top", bottom:"right", left:"bottom" };
  return { top:"top", right:"right", bottom:"bottom", left:"left" };
}

/* the frame's custom properties: --sa-top etc. for content-space safe areas */
export function insetVars(turn) {
  const edges = insetEdges(turn);
  return Object.fromEntries(Object.entries(edges).map(([edge, from]) => [`--sa-${edge}`, `env(safe-area-inset-${from}, 0px)`]));
}

const storage = () => { try { return globalThis.localStorage || null; } catch { return null; } };
export const savedTurn = (store = storage()) => {
  try { return store?.getItem(TURN_KEY) === "-90" ? -90 : 90; } catch { return 90; }
};
export const saveTurn = (turn, store = storage()) => {
  try { store?.setItem(TURN_KEY, turn === -90 ? "-90" : "90"); } catch {}
};
