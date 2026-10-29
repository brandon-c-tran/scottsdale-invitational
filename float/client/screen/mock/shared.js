/* What both stand-in rooms share (mockNet.js): the roster's phones, a seeded
   hash, the skills, the fake socket, and the moments a shot opens on. */
import { CRITTER_IDS, cleanLook, defaultLook, HAT_IDS, POSE_IDS, SHADE_IDS } from "../../../shared/looks.js";
import { FLOATIE_IDS } from "../../../shared/floaties.js";

export const NAMES = ["Brandon", "Evan", "Eyob", "Sahil", "Khoa", "Chinh", "Adi", "Chiang", "Richard", "Allan", "Henry", "Ben", "Jeremy",
  "Marco", "Dev", "Theo"];
export const COLORS = ["#ff5a4e", "#ffc93c", "#3dc6e0", "#8bd450", "#b57cf0", "#ff8a3d", "#2f8cff", "#ff6fae", "#20c39a",
  "#e8455f", "#6c6cf5", "#c6d63a", "#14a8a8", "#f29e4c", "#9e6bd8", "#7fb8ff"];

/* a phone from the roster: one critter each, the groom crowned */
export function mockRider(k) {
  const name = NAMES[k % NAMES.length];
  const groom = name === "Brandon";
  const hats = HAT_IDS.filter(id => id !== "crown");
  const look = cleanLook({
    ...defaultLook(name, FLOATIE_IDS),
    /* the groom rides Winnie, the critter only he may pick */
    critter:groom ? "winnie" : CRITTER_IDS[k % CRITTER_IDS.length],
    hat:groom ? "crown" : hats[(k * 5 + 1) % hats.length],
    shades:SHADE_IDS[(k * 3) % SHADE_IDS.length],
    pose:POSE_IDS[k % POSE_IDS.length],
  }, { groom, floatieIds:FLOATIE_IDS, seed:name });
  return { name, color:COLORS[k % COLORS.length], look, drinks:k % 7 !== 5, number:k + 1, ...(groom ? { groom:true } : {}) };
}

/* ── a seeded hash: the same Cup every time for a seed ── */
export const hash01 = (...parts) => {
  let h = 2166136261;
  for (const part of parts) {
    h ^= Math.imul((part | 0) + 0x9e3779b9, 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 15), 0xc2b2ae35);
    h ^= h >>> 13;
  }
  h = Math.imul(h ^ (h >>> 16), 0x27d4eb2f);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
};
export const gauss = (...parts) => {
  const u = Math.max(1e-6, hash01(...parts, 1)), v = hash01(...parts, 2);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
/* spread skills, sharpest first, shuffled by the seed */
export function mockSkills(n, seed = 3) {
  const list = Array.from({ length:n }, (_, k) => 0.95 - (0.68 * k) / Math.max(1, n - 1));
  return list.map((skill, k) => ({ skill, key:hash01(seed, k, 77) })).sort((a, b) => a.key - b.key).map(item => item.skill);
}

export class FakeSocket {
  constructor(onText) { this.onText = onText; this.readyState = 1; this.listeners = {}; }
  send(text) { if (this.readyState === 1 && this.onText) this.onText(text); }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  accept() {}
  close() { this.readyState = 3; for (const fn of this.listeners.close || []) fn({}); }
}

/* The moments a shot opens on: a phase (and round; "last" the final's),
   then `ms` after it began, or the song's `beat`. */
export const SHOTS = Object.freeze({
  lobby:{ lobby:true },
  /* a Field Day Cup reserved by the Tournament, waiting for its start */
  fdlobby:{ lobby:true, fieldday:true },
  intro:{ phase:"intro", ms:2600 },
  card:{ phase:"song", round:0, ms:1300 },
  count:{ phase:"song", round:0, beat:5.2 },
  /* practice, narrated: the first line, Ready and Hey, the host's demo (the Watch) */
  practice:{ phase:"song", round:0, beat:9.3 },
  ready:{ phase:"song", round:0, beat:13.25 },
  watch:{ phase:"song", round:0, beat:19.15 },
  go:{ phase:"song", round:0, beat:24.25 },
  play:{ phase:"song", round:0, beat:39.3 },
  hey:{ phase:"song", round:0, beat:47.25 },
  /* rowing (item 10): a stroke on 1 dipping one side, the next on 3 the other */
  row:{ phase:"song", round:0, beat:40.2 },
  row3:{ phase:"song", round:0, beat:42.2 },
  /* the breakdown: the host plays a bar ("Copy me"), everyone copies it */
  copy:{ phase:"song", round:0, beat:57.3 },
  echo:{ phase:"song", round:0, beat:61.2 },
  late:{ phase:"song", round:0, beat:92.3 },
  outro:{ phase:"song", round:0, beat:120.35 },
  /* the cut's show: the grades, the awards, the outs' exits, the chug-off's call */
  grades:{ phase:"cut", round:0, ms:1200 },
  awards:{ phase:"cut", round:0, ms:5200 },
  cutout:{ phase:"cut", round:0, ms:8900 },
  cutnext:{ phase:"cut", round:0, ms:12600 },
  /* the chug-off: its call (the first explains itself), the race, who keeps the spot */
  chugcall:{ phase:"chugoff", round:0, ms:1800 },
  chug:{ phase:"chugoff", round:0, after:"goAt", ms:2500 },
  keeps:{ phase:"chugoff", round:0, after:"winAt", ms:1300 },
  /* Last Call, the countdown: the first's intro, a count, dark, the reveal, the verdict */
  bar:{ phase:"lastcall", round:0, songMs:3500 },
  lccount:{ phase:"lastcall", round:0, songMs:9300 },
  dark:{ phase:"lastcall", round:0, songMs:15300 },
  reveal:{ phase:"lastcall", round:0, songMs:21000 },
  drinks:{ phase:"lastcall", round:0, songMs:23600 },
  /* the later tricks: the clock winding down, the foam */
  slow:{ phase:"lastcall", round:1, songMs:11900 },
  foam:{ phase:"lastcall", round:2, songMs:10900 },
  rock:{ phase:"song", round:1, beat:42.3 },
  spin:{ phase:"song", round:2, beat:34.6 },
  sign:{ phase:"song", round:"last", beat:13.5 },
  final:{ phase:"song", round:"last", beat:101.3 },
  drop:{ phase:"song", round:"last", beat:120.45 },
  finalcut:{ phase:"cut", round:"last", ms:3500 },
  podium:{ phase:"podium", ms:5400 },
  feedback:{ phase:"feedback", ms:2500 },
});
export const MOCK_SHOTS = Object.freeze(Object.keys(SHOTS));

/* a moment's time from the phases seen: `seen` maps "phase:round" to
   { startAt, songAt, goAt, winAt } (and "last" to the final's round); null until it is known */
export function shotTime(shot, seen, rounds) {
  const plan = SHOTS[shot];
  if (!plan || plan.lobby) return null;
  const round = plan.round === "last" ? Math.max(0, (rounds | 0) - 1) : plan.round;
  const key = round === undefined ? plan.phase : `${plan.phase}:${round}`;
  const at = seen[key];
  if (!at) return null;
  if (plan.beat !== undefined) return Number.isFinite(at.songAt) ? at.songAt + plan.beat * 500 : null;
  if (plan.songMs !== undefined) return Number.isFinite(at.songAt) ? at.songAt + plan.songMs : null;
  if (plan.after) return Number.isFinite(at[plan.after]) ? at[plan.after] + (plan.ms || 0) : null;
  return Number.isFinite(at.startAt) ? at.startAt + (plan.ms || 0) : null;
}
