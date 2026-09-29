/* D11, the photo desk: pure presentation reads of `state.moments`, the
   public records the server projects into every frame (worker/moments.js,
   worker/publicState.js): { id, by, at, takenAt, w, h }, plus `hidden:true`
   on the commissioner's frames only. No device id ever arrives here. */

const MOMENT_ID = /^m[a-z0-9]{10,32}$/;

/* the phone's upload shape: longest side, JPEG quality, thumbnail side */
export const PHOTO_PREP = Object.freeze({ side:1600, quality:0.8, thumbSide:480, thumbQuality:0.72,
  /* re-encoded bytes the server accepts; the phone steps quality down to fit */
  maxBytes:1_450_000, maxThumbBytes:150_000, perBatch:10 });

/* the TV: the newest photos, one every six seconds, so an ambient card
   (TV_AMBIENT_MS, 12 s) shows two; a busy desk gets a second card */
export const TV_PHOTO_MS = 6000;
export const TV_PHOTO_RECENT = 30;
export const TV_PHOTO_SECOND_TURN = 8;

export const momentSrc = (id, thumb = false) => `/api/moments/${encodeURIComponent(id)}${thumb ? "/thumb" : ""}`;

const records = state => (Array.isArray(state?.moments) ? state.moments : [])
  .filter(item => item && MOMENT_ID.test(item.id || "") && typeof item.by === "string");
const newestFirst = list => [...list].sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0)
  || (a.id < b.id ? 1 : -1));

/* what everyone sees: never a hidden one, even on a commissioner's frame */
export const visibleMoments = state => newestFirst(records(state).filter(item => !item.hidden));

/* the Weekend grid: the commissioner also sees hidden ones, marked */
export const deskMoments = (state, { gm = false } = {}) =>
  newestFirst(records(state).filter(item => gm || !item.hidden));

export const canDeleteMoment = (moment, { me = null, gm = false } = {}) =>
  !!moment && (gm || (!!me && moment.by === me));

/* a landscape photo fills the TV; a portrait or square one stands whole */
export const photoFit = moment => {
  const w = Number(moment?.w) || 0, h = Number(moment?.h) || 0;
  return w && h && w / h >= 1.2 ? "cover" : "contain";
};

/* ── the TV ──
   A photo turn is an ambient gap: nothing is live, drawn, played, directed
   or posting. Every one of these covers the room with something that
   matters more than a photo. */
export function tvPhotoGap({ loading = false, final = false, directed = false, result = false, poker = false,
  draft = false, live = false, intro = false, reveal = false, faceOff = false } = {}) {
  return !(loading || final || directed || result || poker || draft || live || intro || reveal || faceOff);
}

export const tvPhotoRotation = state => visibleMoments(state).slice(0, TV_PHOTO_RECENT);

/* The ambient cards with the photo turns in them: one at the end, and a
   second halfway through once the desk has enough to show. */
export function withPhotoTurns(cards, count) {
  if (!count) return cards;
  const out = [...cards];
  if (count >= TV_PHOTO_SECOND_TURN && out.length >= 4) out.splice(Math.ceil(out.length / 2), 0, "photos");
  out.push("photos");
  return out;
}

/* server time picks the photo, so every TV shows the same one */
export function tvPhotoAt(list, now, period = TV_PHOTO_MS) {
  if (!list?.length) return null;
  const turn = Math.floor(Math.max(0, Number(now) || 0) / period);
  const index = turn % list.length;
  return { moment:list[index], next:list[(index + 1) % list.length], index, turn };
}

/* "Sat 3:42 PM", from when the photo was taken (or added) */
export function momentWhen(moment, locale = undefined) {
  const at = Number(moment?.takenAt) || Number(moment?.at) || 0;
  if (!at) return "";
  const date = new Date(at);
  const day = date.toLocaleDateString(locale, { weekday:"short" });
  const time = date.toLocaleTimeString(locale, { hour:"numeric", minute:"2-digit" });
  return `${day} ${time}`;
}

/* The target size for a photo whose longest side is `max`, never enlarged. */
export function fitSide(width, height, max) {
  const w = Math.max(1, Math.round(Number(width) || 1)), h = Math.max(1, Math.round(Number(height) || 1));
  const scale = Math.min(1, max / Math.max(w, h));
  return { width:Math.max(1, Math.round(w * scale)), height:Math.max(1, Math.round(h * scale)) };
}

/* One line for a batch that ended: how many went up, and why the rest did
   not (the first error the server gave). */
export function batchLine({ added = 0, failed = 0, error = "", skipped = 0 } = {}) {
  const parts = [];
  if (!failed) { if (added) parts.push(`${added} photo${added === 1 ? "" : "s"} added`); }
  else parts.push(`${added ? `${added} added. ` : ""}${failed} not added${error ? `: ${error}` : ""}`);
  if (skipped) parts.push(`${PHOTO_PREP.perBatch} at a time`);
  return parts.join(". ");
}
