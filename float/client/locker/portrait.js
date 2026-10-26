/* Portraits of looks (float/PROTOCOL.md "Art": riderPortrait). The art
   module carries three.js, so it is imported only here, on first use, as its
   own chunk: Field Day's Profile (which embeds the Locker) and the phone
   controller never pull three.js in with their own code.

   One portrait renders at a time with a breath between them, and every one
   is kept (by look, colour, identity and size), so a grid of tiles fills in
   without stalling a frame and a look seen once never renders again. */

const MAX_KEPT = 120;
const cache = new Map();
let art = null;
let chain = Promise.resolve();

const loadArt = () => (art ||= import("../art/index.js").catch(error => { art = null; throw error; }));
const breathe = () => new Promise(resolve => setTimeout(resolve, 0));

const hash = text => {
  let h = 2166136261;
  for (let k = 0; k < text.length; k += Math.max(1, text.length >> 9)) { h ^= text.charCodeAt(k); h = Math.imul(h, 16777619); }
  return `${text.length.toString(36)}${(h >>> 0).toString(36)}`;
};

/* what riderPortrait reads of an entrant */
export function portraitEntrant({ name = "", color = "#9aa39e", look = {}, photo = null, number = null, skin = null, groom = false } = {}) {
  return { name, color, look:{ critter:look.critter, floatie:look.floatie, hat:look.hat, shades:look.shades, pose:look.pose },
    ...(photo ? { photo } : {}), ...(number !== null && number !== undefined ? { number } : {}), ...(skin ? { skin } : {}),
    ...(groom ? { groom:true } : {}) };
}

export function portraitKey(entrant = {}, size = 128) {
  const look = entrant.look || {};
  return [size, entrant.color || "", look.critter || "", look.floatie || "", look.hat || "", look.shades || "", look.pose || "",
    entrant.photo ? hash(String(entrant.photo)) : "", entrant.number ?? "", entrant.skin || "", entrant.groom ? 1 : 0].join("|");
}

export const cachedPortrait = (entrant, size) => cache.get(portraitKey(entrant, size))?.url || null;

/* resolves to a PNG data URL, or null if the art cannot draw it */
export function requestPortrait(entrant, size = 128) {
  const key = portraitKey(entrant, size);
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit.promise;
  }
  const entry = { url:null, promise:null };
  const subject = portraitEntrant(entrant);
  entry.promise = chain = chain.then(breathe).then(loadArt).then(mod => mod.riderPortrait(subject, { size })).then(url => {
    entry.url = typeof url === "string" && url ? url : null;
    if (!entry.url) cache.delete(key);
    return entry.url;
  }, () => { cache.delete(key); return null; });
  cache.set(key, entry);
  while (cache.size > MAX_KEPT) cache.delete(cache.keys().next().value);
  return entry.promise;
}

/* start the art chunk loading early (a lobby that will show portraits) */
export const preloadPortraits = () => { loadArt().catch(() => {}); };
