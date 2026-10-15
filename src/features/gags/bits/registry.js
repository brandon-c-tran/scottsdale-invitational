/* Bits (Oct 10; the neon catalog since Oct 14): the room's comic moments,
   drawn like animated Vegas signs. The cast is the players' own photo
   chips, neon-rimmed coins that act by moving alone (no hands); the one
   hand in the world is the house's (neon/Neon.jsx HouseHand). A bit is a
   few seconds of physical comedy written for a SHAPE of moment, picked
   per moment from its shape's pool:

     versus  an upset: cast.a won, cast.b was beaten
     win     a run of wins, a new leader: cast.a
     loss    a big losing bet, a new last place: cast.a
     idle    the TV's downtime (attract mode)

   and a STYLE, which is how the winner's song meets it (shared/bitMusic.js):

     music       the song starts on the bit's action (`song.beat`), its
                 wind-up holding at `song.hold` until the speaker plays
     punchline   the song starts on the punchline (`song.beat`); its own
                 foley first, ducked under the song after
     songless    no song: a loss, an idle vignette

   This file is the contract, pure data and nothing that draws (the scenes
   are bits/scenes.jsx, keyed by id; the catalog's entries are
   bits/catalog/*.js), so the moment model, the Worker, the TV, a phone
   and the tests read the same timings:

     id, name   the bit, and what the reel calls it
     shape, style
     ms         its length; a moment bit runs MOMENT_MS.min to .max
     span       derived: how long it holds the screen, its last frame kept
                until the lettering has stood READ_MS (a TV window, a
                phone's overlay and the stage's lift-off all run on it)
     beats      named instants (ms from its start): the scene's CSS reads
                each as var(--b-<name>) and its cues land on them, so
                retiming a beat moves the motion and the sound together
     still      the punchline instant: reduced motion shows this frame
     summary    reduced motion's one sound, at the start
     song       { beat, hold } (music) or { beat } (punchline); null songless
     letter     { at, over, place }: when the name (and the moment's fact)
                lights, whose name, and where the shot leaves room for it
                (top-left, top-right or top); null letters nothing (idle)
     camera     the shot (bits/camera.js): its zoom and centre, moves on the
                bit's clock, shakes and washes
     cast       the roles the scene needs: { a:{ role, max }, b:... }; a
                team bit's roles carry min:1 and max:TEAM_MAX
     team       a team bit: played when a side has TEAM_MIN or more
     needs      "song": only while a win song is playing (needle scratch)
     cut        the beat a playing song is cut on (needle scratch)
     cues       [{ at, sound, pan, opts }]: kit recipes on the room bus
     fits       the triggers it suits (default: every trigger of its shape) */
import { UPSET } from "./catalog/upset.js";
import { MUSIC } from "./catalog/music.js";
import { SHOW } from "./catalog/show.js";
import { LOSS } from "./catalog/loss.js";
import { TEAM } from "./catalog/team.js";
import { IDLE } from "./catalog/idle.js";
import { IDLE_MS, MOMENT_MS, TEAM_MAX, TEAM_MIN } from "./catalog/common.js";

export { IDLE_MS, MOMENT_MS, TEAM_MAX, TEAM_MIN };

export const BIT_SHAPES = Object.freeze({
  versus:Object.freeze({ name:"Versus", triggers:Object.freeze(["An upset"]) }),
  win:Object.freeze({ name:"Win", triggers:Object.freeze(["3 straight wins", "A new leader"]) }),
  loss:Object.freeze({ name:"Loss", triggers:Object.freeze(["A big losing bet", "A new last place"]) }),
  idle:Object.freeze({ name:"Idle", triggers:Object.freeze(["Between games"]) }),
});
export const SHAPES = Object.freeze(Object.keys(BIT_SHAPES));
export const BIT_STYLES = Object.freeze({ music:"Song on the action", punchline:"Song on the punchline", songless:"No song" });
export const STYLES = Object.freeze(Object.keys(BIT_STYLES));
/* how long a bit takes to come up on the painting and to lift off it */
export const BIT_IN_MS = 260;
export const BIT_OUT_MS = 380;
/* how long the name and the fact take to light (bits.css bit-sign, the
   fact a beat behind): a still shows them lit */
export const LETTER_LAND_MS = 700;
export const LETTER_PLACES = Object.freeze(["top-left", "top-right", "top"]);
/* the least time a lit name and fact stand before the bit lifts off */
export const READ_MS = 1800;
const spanOf = bit => bit.letter ? Math.max(bit.ms, Math.round(bit.letter.at + LETTER_LAND_MS + READ_MS)) : bit.ms;

const freezeAll = value => Array.isArray(value) ? Object.freeze(value.map(freezeAll))
  : value && typeof value === "object" ? Object.freeze(Object.fromEntries(Object.entries(value).map(([k, v]) => [k, freezeAll(v)]))) : value;
const freeze = bit => freezeAll({ ...bit, fits:bit.fits || BIT_SHAPES[bit.shape].triggers, span:spanOf(bit) });

export const BITS = Object.freeze([...UPSET, ...MUSIC, ...SHOW, ...LOSS, ...TEAM, ...IDLE].map(freeze));
const BY_ID = new Map(BITS.map(bit => [bit.id, bit]));
export const bitById = id => BY_ID.get(id) || null;
export const bitsOf = shape => BITS.filter(bit => bit.shape === shape);

/* FNV-1a over a string: the same seed hashes the same on every screen */
export function seedHash(text) {
  let h = 0x811c9dc5;
  for (const ch of String(text)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/* A team bit: one written for sides of more than one */
export const isTeamBit = bit => !!bit?.team;
const sideCount = side => Array.isArray(side) ? side.length : Math.max(0, Math.floor(Number(side) || 0));
/* A moment's sides, { a, b } (players, or how many), are team sized when
   the larger side has TEAM_MIN or more: a doubles upset, a volleyball
   three, the full court's 7 v 6 play a team bit; a 1 v 1 a solo one. */
export const teamSized = sides => Math.max(0, ...Object.values(sides || {}).map(sideCount)) >= TEAM_MIN;
/* what a moment can play: a bit that needs a song playing only while one
   plays (`when.songPlaying`) */
const playable = (bit, when) => bit.needs !== "song" || !!when?.songPlaying;
/* The pool a moment picks from: its shape's team bits when it is team
   sized and the shape has any, else the shape's solo bits (a loss is
   always one player) */
export function poolOf(shape, sides = null, when = null) {
  const all = bitsOf(shape).filter(bit => playable(bit, when));
  const team = all.filter(isTeamBit);
  return team.length && teamSized(sides) ? team : all.filter(bit => !isTeamBit(bit));
}
/* the pool's name, so a moment model keeps each pool's own rotation */
export const poolKey = (shape, sides = null) => isTeamBit(poolOf(shape, sides)[0]) ? `${shape}:team` : shape;

/* The bit a moment plays: one of its pool (poolOf: its shape, its sides
   and whether a song is playing), picked by its seed (the moment's own
   key, so every TV, phone and the Worker pick the same), never one in
   `recent` (bit ids already played, newest last) while any other remains;
   when all have played, never the newest again if the pool has another.
   Null for a shape with no bits. */
export function pickBit(shape, seed, recent = [], sides = null, when = null) {
  const pool = poolOf(shape, sides, when);
  if (!pool.length) return null;
  const played = Array.isArray(recent) ? recent : [];
  let candidates = pool.filter(bit => !played.includes(bit.id));
  if (!candidates.length) {
    const newest = played[played.length - 1];
    candidates = pool.length > 1 ? pool.filter(bit => bit.id !== newest) : pool;
  }
  return candidates[seedHash(`${shape}:${seed}`) % candidates.length];
}

/* The bit as this cast plays it: its `pairs` entries whose sides match
   the cast (a side named with a count matches a side of exactly that
   many) add their cues, shakes and white frames on the bit's clock. The
   same object for the same match, and a cast bit casts to itself. */
const CAST_BITS = new Map();
const byAt = (x, y) => (x?.at ?? x) - (y?.at ?? y);
export function castBit(bit, cast) {
  if (!bit?.pairs?.length) return bit;
  const hits = bit.pairs.map((entry, i) => [entry, i])
    .filter(([entry]) => Object.entries(entry.sides || {}).every(([role, n]) => sideCount(cast?.[role]) === n));
  if (!hits.length) return bit;
  const key = `${bit.id}:${hits.map(([, i]) => i).join(",")}`;
  if (!CAST_BITS.has(key)) {
    const add = name => hits.flatMap(([entry]) => entry[name] || []);
    const camera = hits.reduce((cam, [entry]) => entry.camera ? { ...cam, ...entry.camera } : cam, bit.camera || {});
    CAST_BITS.set(key, freezeAll({ ...bit, pairs:[], cues:[...bit.cues, ...add("cues")].sort(byAt),
      camera:{ ...camera, shakes:[...(camera.shakes || []), ...add("shakes")].sort(byAt),
        washes:[...(camera.washes || []), ...add("washes")].sort(byAt) } }));
  }
  return CAST_BITS.get(key);
}

/* a bit's beats as custom properties for its scene's CSS */
export const beatVars = bit => Object.fromEntries(Object.entries(bit?.beats || {}).map(([name, ms]) => [`--b-${name}`, `${Math.round(ms)}ms`]));
