/* Team names (Oct 3): suggestions made from the team itself, and the rules
   a name has to meet. Pure and import-free (shared/core.js imports it for
   the draw's default names), so the Durable Object, every phone and the TV
   compute the same three suggestions from the same state.

   A suggestion is built from who is on the team and what they are playing:
   their first names (an alliteration on one, a blend of two), their jersey
   numbers, their chip colors (as a named family), the team's size, the
   game's own nouns and puns, and the desert. Each draw id + team seeds one
   fixed sequence; round 0 is the first three, a shuffle reads the next
   three. Suggestions stay within SUGGESTION_MAX; a written name within
   TEAM_NAME_MAX. Nothing crude, and nothing about a person but their own
   name, number and color.

   A team of three or more is stored with the first suggestion as its name
   at the draw; a pair keeps "A & B" until someone names it. Names lock
   when the event's first contest locks or starts (teamNamesLocked); the
   commissioner can always rename. Names are labels only: wagers, brackets
   and results reference team keys and players, never a name. */

export const TEAM_NAME_MAX = 24;
export const SUGGESTION_MAX = 20;
export const SUGGESTION_COUNT = 3;

/* the desert mascots, kept as one flavor among many */
export const MASCOTS = Object.freeze(["Sidewinders", "Javelinas", "Roadrunners", "Coyotes", "Scorpions",
  "Gila Monsters", "Jackrabbits", "Rattlers", "Dust Devils", "Bobcats", "Vultures", "Quail"]);

/* ── a written name ── */
/* undefined: not a name (wrong type, too long); null: empty */
export function cleanTeamName(raw) {
  if (raw === null) return null;
  if (typeof raw !== "string") return undefined;
  const text = raw.normalize("NFC").replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ")
    .replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (Array.from(text).length > TEAM_NAME_MAX) return undefined;
  return text;
}
/* a word longer than this cannot shrink onto a TV card at the 24px floor */
export const TEAM_WORD_MAX = 15;
/* why a written name is refused, or null */
export function teamNameProblem(raw) {
  const name = cleanTeamName(raw);
  if (name === undefined) return `Up to ${TEAM_NAME_MAX} characters`;
  if (name && name.split(" ").some(word => Array.from(word).length > TEAM_WORD_MAX)) return `Words up to ${TEAM_WORD_MAX} letters`;
  return null;
}
export const teamNameKey = name => String(name || "").normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();

/* names lock once the event's first contest locks or starts, a result posts,
   the event is shelved or the board freezes */
export function teamNamesLocked(state, evId) {
  if (!state || state.frozen) return true;
  if (state.results?.[evId] || state.shelved?.[evId]) return true;
  const op = state.eventOps?.[evId] || {};
  return !!(op.startedAt || op.bettingLockedAt || op.resultEntryAt);
}

/* ── seeded order ── */
function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const shuffled = (list, random) => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
};
/* a draw id is "d<time>-<random>": the random part seeds, so a seeded
   rehearsal names its teams the same way every run */
export const drawSeed = drawId => String(drawId || "").replace(/^d\d+-/, "");

/* ── what the team is made of ── */
const VOWEL = /[aeiouy]/i;
const titleCase = word => word ? word[0].toUpperCase() + word.slice(1) : "";
/* the first word of a display name, letters only, as a name reads */
export function firstName(display) {
  const word = String(display || "").trim().split(/\s+/)[0] || "";
  const letters = word.replace(/[^A-Za-z]/g, "");
  if (letters.length < 2 || !VOWEL.test(letters)) return null;
  return titleCase(letters.toLowerCase());
}

/* every claimable chip color by its family name (shared/core.js CHIP_COLORS) */
const COLOR_FAMILIES = Object.freeze({
  "#C05B33":"Rust", "#D97742":"Copper", "#E39A3B":"Saffron", "#D89C2F":"Gold", "#C9B25A":"Mustard",
  "#A8A03F":"Olive", "#77804C":"Moss", "#4E6E39":"Cactus", "#6E9450":"Clover", "#3F7D5C":"Pine",
  "#557B72":"Sage", "#2F7E83":"Teal", "#4F93A3":"Lagoon", "#3B6E9C":"Cobalt", "#5E7291":"Slate",
  "#6D6FA8":"Periwinkle", "#7C5CA6":"Violet", "#8A4F62":"Plum", "#A6527C":"Orchid", "#B23B5E":"Raspberry",
  "#B23B2E":"Chili", "#8E3B2F":"Brick", "#7A5C43":"Cocoa", "#A9663F":"Terracotta", "#B37A4A":"Caramel",
  "#8C6A54":"Saddle", "#6F6546":"Mesquite", "#4E4A3C":"Basalt", "#9AA1A8":"Silver", "#B9AF9B":"Stone",
  "#D1C0A0":"Sand", "#E3D7BD":"Ivory",
});
export const colorFamily = hex => (typeof hex === "string" && COLOR_FAMILIES[hex.toUpperCase()]) || null;
/* a family's own phrase, where one reads naturally */
const COLOR_PHRASES = Object.freeze({
  Rust:"Rust Belt", Copper:"Copper State", Gold:"Gold Rush", Mustard:"Cut the Mustard", Olive:"Olive Branch",
  Moss:"Moss Bosses", Cactus:"Cactus League", Clover:"Lucky Clover", Pine:"Pine Valley", Sage:"Sage Advice",
  Teal:"Teal Deal", Lagoon:"Blue Lagoon", Cobalt:"Cobalt Blues", Slate:"Clean Slate", Violet:"Ultra Violet",
  Plum:"Plum Crazy", Raspberry:"Razzle Dazzle", Chili:"Red Hot Chili", Brick:"Brick House", Cocoa:"Hot Cocoa",
  Terracotta:"Terracotta Army", Saddle:"Saddle Up", Mesquite:"Mesquite Smoke", Basalt:"Basalt & Pepper",
  Silver:"Silver Linings", Stone:"Stone Cold", Sand:"Sandstorm", Ivory:"Ivory Tower", Saffron:"Saffron Sunset",
  Periwinkle:"Periwinkle Twinkle", Orchid:"Orchid Bloom", Caramel:"Caramel Drizzle",
});

const ONES = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
  "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
export function numberWord(n) {
  if (!Number.isInteger(n) || n < 0 || n > 99) return null;
  if (n < 20) return ONES[n];
  return n % 10 ? `${TENS[Math.floor(n / 10)]}-${ONES[n % 10]}` : TENS[n / 10];
}
/* numbers that read as something else are left alone */
const NUMBERS_SKIPPED = new Set([69, 420, 666]);
/* two numbers that already make a phrase */
const NUMBER_PAIRS = Object.freeze({ "7-11":"Seven Eleven", "7-24":"Twenty-Four Seven", "5-9":"Nine to Five",
  "1-2":"One-Two Punch", "4-10":"Ten-Four", "3-2-1":"Three Two One" });

/* ── what they are playing ── */
const GAME_WORDS = Object.freeze({
  basketball:{ nouns:["Buckets", "Ballers", "Hoopers", "Dimes", "Swishers", "Bigs"],
    puns:["Full Court Press", "Nothing But Net", "Pick and Roll", "Fast Break", "Alley Oops", "Bank Shots", "Splash Bros"] },
  volleyball:{ nouns:["Spikers", "Diggers", "Setters", "Blockers", "Bumpers"],
    puns:["Block Party", "Net Gain", "Sandbaggers", "Bump Set Spike", "Dig Deep", "Sets Appeal", "Ace Ventura"] },
  trivia:{ nouns:["Brains", "Scholars", "Know-It-Alls", "Wizards", "Professors"],
    puns:["Smarty Pints", "Les Quizerables", "Quizzly Bears", "Brain Trust", "Fact Checkers", "Trivia Newton-John",
      "Quiz Khalifa", "Ivy Leaguers"] },
  pong:{ nouns:["Bouncers", "Splashers", "Rerackers", "Cuppers"],
    puns:["Re-Rack City", "Sink or Swim", "Pong Island", "Cup Cakes", "Island Time"] },
  die:{ nouns:["Rollers", "Tossers", "Dicers", "Catchers"],
    puns:["Die Hards", "Roll Models", "Snake Eyes", "Dice Dice Baby", "Plunk Rock"] },
  pickleball:{ nouns:["Picklers", "Dinkers", "Volleyers", "Kitchen Crew"],
    puns:["Big Dill", "Dill With It", "In a Pickle", "Dink Responsibly", "Kitchen Rules"] },
  "8ball":{ nouns:["Sharks", "Breakers", "Bankers", "Cue Balls"],
    puns:["Rack Attack", "Corner Pocket", "Chalk Talk", "Cue Tips", "Behind the 8"] },
  putting:{ nouns:["Putters", "Aces", "Birdies", "Eagles"],
    puns:["Tin Cuppers", "Hole in One", "Putt Pirates", "The Long Game"] },
  ragecage:{ nouns:["Stackers", "Bouncers", "Cagers"],
    puns:["Cage Match", "Stack Attack", "Rage Against", "Full Stack"] },
  beerio:{ nouns:["Racers", "Drifters", "Shells", "Karts"],
    puns:["Blue Shells", "Banana Peels", "Rainbow Road", "Drift Kings", "Item Box"] },
  where:{ nouns:["Explorers", "Navigators", "Pinners"],
    puns:["Lost and Found", "Pin Drop", "Way Off Course"] },
});
/* Scottsdale itself */
const DESERT = Object.freeze(["Dry Heat", "Heat Wave", "Camelback Crew", "Monsoon Season", "Saguaro Squad",
  "High Noon", "Valley Heat", "Mirage", "Desert Bloom", "Sonoran Sunset"]);
const SIZE_PHRASES = Object.freeze({
  2:["Double Trouble", "Dynamic Duo", "Tag Team"],
  3:["Triple Threat", "Three's Company", "Hat Trick", "The Trifecta"],
  4:["Fab Four", "Four on the Floor"],
  5:["High Five", "Famous Five"],
  6:["Six Pack", "Sixth Sense"],
  7:["Lucky Sevens", "Magnificent Seven", "Seventh Heaven"],
});
/* plural nouns by first letter, for an alliteration on a first name */
const LETTER_NOUNS = Object.freeze({
  A:["Aces", "Armadillos", "Aviators", "Arrows"], B:["Bandits", "Bobcats", "Bombers", "Blazers"],
  C:["Coyotes", "Comets", "Cougars", "Chargers"], D:["Dust Devils", "Dynamos", "Drifters", "Daredevils"],
  E:["Eagles", "Embers", "Elites", "Express"], F:["Falcons", "Firebirds", "Flyers"],
  G:["Geckos", "Gila Monsters", "Giants", "Gunslingers"], H:["Hawks", "Hotshots", "Hornets", "Heat"],
  I:["Iguanas", "Icons"], J:["Javelinas", "Jackrabbits", "Jets"], K:["Kings", "Knights", "Kestrels"],
  L:["Lizards", "Lobos", "Legends"], M:["Mavericks", "Mustangs", "Mesas"], N:["Nomads", "Navigators"],
  O:["Outlaws", "Ospreys"], P:["Pumas", "Prospectors", "Panthers"], Q:["Quail", "Quakes"],
  R:["Rattlers", "Roadrunners", "Rockets", "Rangers"], S:["Scorpions", "Sidewinders", "Stingers", "Sharks"],
  T:["Thunderbirds", "Tumbleweeds", "Titans"], U:["Unicorns"], V:["Vultures", "Vipers"],
  W:["Wranglers", "Wildcats", "Wolves"], Y:["Yellowjackets"], Z:["Zephyrs", "Zingers"],
});

/* ── blends ── */
const CONSONANTS = /[^aeiouy]/;
/* "Brandon" -> "Bran": through the first vowel group and one consonant */
function headOf(name) {
  const s = name.toLowerCase();
  const v = s.search(VOWEL);
  if (v < 0) return null;
  let i = v;
  while (i < s.length && VOWEL.test(s[i])) i++;
  /* a digraph stays whole: "Richard" -> "Rich" */
  if (i < s.length) i += /^(ch|sh|th|ph|ng|ck)/.test(s.slice(i)) ? 2 : 1;
  return name.slice(0, Math.min(i, s.length));
}
/* "Sahil" -> "hil": from the consonant after the first vowel group */
function tailOf(name) {
  const s = name.toLowerCase();
  const v = s.search(VOWEL);
  if (v < 0) return null;
  let i = v;
  while (i < s.length && VOWEL.test(s[i])) i++;
  return i < s.length ? s.slice(i) : s.slice(v);
}
/* no run of four consonants, or three without an h ("Brankhoa" reads, "Brankt" does not) */
const sayable = word => !/[^aeiouy]{4,}/i.test(word) && !/[aeiouy]{3,}/i.test(word)
  && !(word.match(/[^aeiouy]{3}/gi) || []).some(run => !/h/i.test(run));
/* a blend of two first names, the way couples get one: "Brankhoa" */
export function blendNames(a, b) {
  if (!a || !b || a === b) return null;
  const options = [];
  for (const [x, y] of [[a, b], [b, a]]) {
    const head = headOf(x), tail = tailOf(y);
    if (head && head.length >= 2 && y.length <= 5) options.push(head + y.toLowerCase());
    if (head && tail && head.length >= 2 && tail.length >= 2) options.push(head + tail);
  }
  return options.find(word => word.length >= 5 && word.length <= 9 && sayable(word)
    && word.toLowerCase() !== a.toLowerCase() && word.toLowerCase() !== b.toLowerCase()
    && CONSONANTS.test(word.toLowerCase())) || null;
}

/* ── safety ── */
const NEVER = /(fuck|shit|cunt|dick|cock|puss|tits|twat|wank|fag|nigg|rape|slut|whore|porn|sex|cum\b|\bass\b|anal|nazi|kkk|69|420)/i;
/* phrases that would read as a dig */
const UNKIND = new Set(["Rust Buckets", "Brick Ballers", "Brick Bigs", "Moss Bosses"]);
export const safeName = text => !NEVER.test(String(text || "").replace(/[^a-z0-9\s]/gi, ""));

/* ── the generator ── */
/* members: [{ name, num, color }] (display name, jersey number, chip hex),
   in the team's order. Returns every candidate by category. */
export function teamNameCandidates({ members = [], game = null, size = members.length } = {}) {
  const firsts = [...new Set(members.map(m => firstName(m.name)).filter(Boolean))];
  const words = GAME_WORDS[game] || null;
  const nouns = words?.nouns || ["Squad", "Crew", "Club"];
  const out = { name:[], color:[], number:[], game:[], size:[], desert:[] };

  /* first names: an alliteration, a blend of two */
  for (const first of firsts) {
    const letter = first[0];
    const pool = [...nouns.filter(noun => noun[0] === letter), ...(LETTER_NOUNS[letter] || [])];
    for (const noun of pool.slice(0, 2)) out.name.push(`${first}'s ${noun}`);
  }
  for (let i = 0; i < firsts.length; i++) for (let j = i + 1; j < firsts.length; j++) {
    const blend = blendNames(firsts[i], firsts[j]);
    if (!blend) continue;
    if (size === 2) out.name.push(blend);
    else if (size === 3) out.name.push(`${blend} & Co.`);
  }

  /* chip colors: the family's own phrase, a color on the game's noun, two together */
  const colors = [...new Set(members.map(m => colorFamily(m.color)).filter(Boolean))];
  for (const color of colors) {
    if (COLOR_PHRASES[color]) out.color.push(COLOR_PHRASES[color]);
    out.color.push(`${color} ${nouns[0]}`);
    if (nouns[1]) out.color.push(`${color} ${nouns[1]}`);
  }
  for (let i = 0; i + 1 < colors.length && i < 3; i++) out.color.push(`${colors[i]} & ${colors[i + 1]}`);

  /* jersey numbers: a pair that already says something, two spelled out, the sum */
  const nums = [...new Set(members.map(m => m.num).filter(n => Number.isInteger(n) && n >= 0 && n <= 99))]
    .filter(n => !NUMBERS_SKIPPED.has(n)).sort((x, y) => x - y);
  for (let i = 0; i < nums.length; i++) for (let j = i + 1; j < nums.length; j++) {
    const pair = NUMBER_PAIRS[`${nums[i]}-${nums[j]}`];
    if (pair) out.number.push(pair);
  }
  if (nums.length >= 3 && NUMBER_PAIRS[nums.slice(0, 3).join("-")]) out.number.push(NUMBER_PAIRS[nums.slice(0, 3).join("-")]);
  if (size <= 3) for (let i = 0; i + 1 < nums.length; i++) out.number.push(`${numberWord(nums[i])} ${numberWord(nums[i + 1])}`);
  if (nums.length >= 2) {
    const sum = nums.reduce((total, n) => total + n, 0);
    if (sum >= 100) out.number.push(sum === 100 ? "The Hundred Club" : "Triple Digits");
    else if (!NUMBERS_SKIPPED.has(sum) && sum >= 10) out.number.push(`The ${sum} Club`);
  }

  /* the game, the team's size, the desert, the mascots */
  if (words) out.game.push(...words.puns);
  out.size.push(...(SIZE_PHRASES[size] || []));
  out.desert.push(...DESERT, ...MASCOTS.map(mascot => `The ${mascot}`));
  if (colors[0]) out.desert.push(`${colors[0]} ${MASCOTS[hash(colors[0]) % MASCOTS.length]}`);

  const fits = text => text.length <= SUGGESTION_MAX && safeName(text) && !UNKIND.has(text);
  for (const key of Object.keys(out)) out[key] = [...new Set(out[key])].filter(fits);
  return out;
}

/* The team's whole suggestion sequence: categories taken in turn, so any
   three in a row mix the people (names, colors, numbers) with the game and
   the place. `taken` (other teams' names) never appears. */
export function suggestionSequence({ seed = "", members = [], game = null, size = members.length, taken = [] } = {}) {
  const random = rng(hash(`fd-team:${seed}`));
  const pools = teamNameCandidates({ members, game, size });
  const shuffledPools = Object.fromEntries(Object.entries(pools).map(([key, list]) => [key, shuffled(list, random)]));
  /* people first, then the game, then whatever is left */
  const personal = shuffled(["name", "color", "number"], random);
  const order = [personal[0], "game", personal[1], personal[2], random() < 0.5 ? "size" : "desert", "game",
    random() < 0.5 ? "desert" : "size"];
  const blocked = new Set(taken.map(teamNameKey));
  const seen = new Set();
  const sequence = [];
  let left = true;
  while (left) {
    left = false;
    for (const key of order) {
      const pool = shuffledPools[key];
      while (pool.length) {
        const next = pool.shift();
        const k = teamNameKey(next);
        if (blocked.has(k) || seen.has(k)) continue;
        seen.add(k); sequence.push(next); left = true;
        break;
      }
    }
  }
  return sequence;
}

/* three suggestions for a round (0 first, each shuffle the next three) */
export function suggestTeamNames(options = {}, round = 0, count = SUGGESTION_COUNT) {
  const sequence = suggestionSequence(options);
  if (!sequence.length) return [];
  const sets = Math.max(1, Math.ceil(sequence.length / count));
  const start = (((Number(round) || 0) % sets) + sets) % sets * count;
  const out = sequence.slice(start, start + count);
  for (let i = 0; out.length < Math.min(count, sequence.length); i++) out.push(sequence[i]);
  return out;
}

/* ── from the tournament state ── */
export function teamMembers(state, players = []) {
  return players.map(player => {
    const profile = state?.profiles?.[player] || {};
    return { name:profile.display || player, num:Number.isInteger(profile.num) ? profile.num : null,
      color:profile.color || null };
  });
}
/* what a team's suggestions are made of: the event's game, its people and
   every other team's name in this draw */
export function teamNameInput(state, ev, draw, index) {
  const team = draw?.teams?.[index];
  if (!team) return null;
  return { seed:`${drawSeed(draw.id)}:${index}`, members:teamMembers(state, team.players), game:ev?.game || null,
    size:team.players.length,
    taken:(draw.teams || []).filter((other, i) => i !== index && other?.name).map(other => other.name) };
}
export function teamNameSuggestions(state, ev, draw, index, round = 0) {
  const input = teamNameInput(state, ev, draw, index);
  return input ? suggestTeamNames(input, round) : [];
}
/* The draw's stored names: every team of three or more takes its first
   suggestion, no two alike; pairs and singles keep their players' names. */
export function defaultTeamNames(state, ev, drawId, teams) {
  const names = [];
  teams.forEach((team, index) => {
    if ((team.players?.length || 0) < 3) { names.push(null); return; }
    const sequence = suggestionSequence({ seed:`${drawSeed(drawId)}:${index}`, members:teamMembers(state, team.players),
      game:ev?.game || null, size:team.players.length, taken:names.filter(Boolean) });
    names.push(sequence[0] || `Team ${index + 1}`);
  });
  return names;
}
