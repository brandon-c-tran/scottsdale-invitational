var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// shared/teamNames.js
function cleanTeamName(raw) {
  if (raw === null) return null;
  if (typeof raw !== "string") return void 0;
  const text = raw.normalize("NFC").replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ").replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (Array.from(text).length > TEAM_NAME_MAX) return void 0;
  return text;
}
function teamNameProblem(raw) {
  const name = cleanTeamName(raw);
  if (name === void 0) return `Up to ${TEAM_NAME_MAX} characters`;
  if (name && name.split(" ").some((word) => Array.from(word).length > TEAM_WORD_MAX)) return `Words up to ${TEAM_WORD_MAX} letters`;
  return null;
}
function teamNamesLocked(state, evId) {
  if (!state || state.frozen) return true;
  if (state.results?.[evId] || state.shelved?.[evId]) return true;
  const op = state.eventOps?.[evId] || {};
  return !!(op.startedAt || op.bettingLockedAt || op.resultEntryAt);
}
function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = a + 1831565813 >>> 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function firstName(display) {
  const word = String(display || "").trim().split(/\s+/)[0] || "";
  const letters = word.replace(/[^A-Za-z]/g, "");
  if (letters.length < 2 || !VOWEL.test(letters)) return null;
  return titleCase(letters.toLowerCase());
}
function numberWord(n) {
  if (!Number.isInteger(n) || n < 0 || n > 99) return null;
  if (n < 20) return ONES[n];
  return n % 10 ? `${TENS[Math.floor(n / 10)]}-${ONES[n % 10]}` : TENS[n / 10];
}
function headOf(name) {
  const s = name.toLowerCase();
  const v = s.search(VOWEL);
  if (v < 0) return null;
  let i = v;
  while (i < s.length && VOWEL.test(s[i])) i++;
  if (i < s.length) i += /^(ch|sh|th|ph|ng|ck)/.test(s.slice(i)) ? 2 : 1;
  return name.slice(0, Math.min(i, s.length));
}
function tailOf(name) {
  const s = name.toLowerCase();
  const v = s.search(VOWEL);
  if (v < 0) return null;
  let i = v;
  while (i < s.length && VOWEL.test(s[i])) i++;
  return i < s.length ? s.slice(i) : s.slice(v);
}
function blendNames(a, b) {
  if (!a || !b || a === b) return null;
  const options = [];
  for (const [x, y] of [[a, b], [b, a]]) {
    const head2 = headOf(x), tail = tailOf(y);
    if (head2 && head2.length >= 2 && y.length <= 5) options.push(head2 + y.toLowerCase());
    if (head2 && tail && head2.length >= 2 && tail.length >= 2) options.push(head2 + tail);
  }
  return options.find((word) => word.length >= 5 && word.length <= 9 && sayable(word) && word.toLowerCase() !== a.toLowerCase() && word.toLowerCase() !== b.toLowerCase() && CONSONANTS.test(word.toLowerCase())) || null;
}
function teamNameCandidates({ members = [], game = null, size = members.length } = {}) {
  const firsts = [...new Set(members.map((m) => firstName(m.name)).filter(Boolean))];
  const words = GAME_WORDS[game] || null;
  const nouns = words?.nouns || ["Squad", "Crew", "Club"];
  const out = { name: [], color: [], number: [], game: [], size: [], desert: [] };
  for (const first of firsts) {
    const letter = first[0];
    const pool = [...nouns.filter((noun) => noun[0] === letter), ...LETTER_NOUNS[letter] || []];
    for (const noun of pool.slice(0, 2)) out.name.push(`${first}'s ${noun}`);
  }
  for (let i = 0; i < firsts.length; i++) for (let j = i + 1; j < firsts.length; j++) {
    const blend = blendNames(firsts[i], firsts[j]);
    if (!blend) continue;
    if (size === 2) out.name.push(blend);
    else if (size === 3) out.name.push(`${blend} & Co.`);
  }
  const colors = [...new Set(members.map((m) => colorFamily(m.color)).filter(Boolean))];
  for (const color of colors) {
    if (COLOR_PHRASES[color]) out.color.push(COLOR_PHRASES[color]);
    out.color.push(`${color} ${nouns[0]}`);
    if (nouns[1]) out.color.push(`${color} ${nouns[1]}`);
  }
  for (let i = 0; i + 1 < colors.length && i < 3; i++) out.color.push(`${colors[i]} & ${colors[i + 1]}`);
  const nums = [...new Set(members.map((m) => m.num).filter((n) => Number.isInteger(n) && n >= 0 && n <= 99))].filter((n) => !NUMBERS_SKIPPED.has(n)).sort((x, y) => x - y);
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
  if (words) out.game.push(...words.puns);
  out.size.push(...SIZE_PHRASES[size] || []);
  out.desert.push(...DESERT, ...MASCOTS.map((mascot) => `The ${mascot}`));
  if (colors[0]) out.desert.push(`${colors[0]} ${MASCOTS[hash(colors[0]) % MASCOTS.length]}`);
  const fits = (text) => text.length <= SUGGESTION_MAX && safeName(text) && !UNKIND.has(text);
  for (const key of Object.keys(out)) out[key] = [...new Set(out[key])].filter(fits);
  return out;
}
function suggestionSequence({ seed = "", members = [], game = null, size = members.length, taken = [] } = {}) {
  const random = rng(hash(`fd-team:${seed}`));
  const pools = teamNameCandidates({ members, game, size });
  const shuffledPools = Object.fromEntries(Object.entries(pools).map(([key, list]) => [key, shuffled(list, random)]));
  const personal = shuffled(["name", "color", "number"], random);
  const order = [
    personal[0],
    "game",
    personal[1],
    personal[2],
    random() < 0.5 ? "size" : "desert",
    "game",
    random() < 0.5 ? "desert" : "size"
  ];
  const blocked = new Set(taken.map(teamNameKey));
  const seen = /* @__PURE__ */ new Set();
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
        seen.add(k);
        sequence.push(next);
        left = true;
        break;
      }
    }
  }
  return sequence;
}
function suggestTeamNames(options = {}, round = 0, count = SUGGESTION_COUNT) {
  const sequence = suggestionSequence(options);
  if (!sequence.length) return [];
  const sets = Math.max(1, Math.ceil(sequence.length / count));
  const start = ((Number(round) || 0) % sets + sets) % sets * count;
  const out = sequence.slice(start, start + count);
  for (let i = 0; out.length < Math.min(count, sequence.length); i++) out.push(sequence[i]);
  return out;
}
function teamMembers(state, players = []) {
  return players.map((player) => {
    const profile = state?.profiles?.[player] || {};
    return {
      name: profile.display || player,
      num: Number.isInteger(profile.num) ? profile.num : null,
      color: profile.color || null
    };
  });
}
function teamNameInput(state, ev, draw, index) {
  const team = draw?.teams?.[index];
  if (!team) return null;
  return {
    seed: `${drawSeed(draw.id)}:${index}`,
    members: teamMembers(state, team.players),
    game: ev?.game || null,
    size: team.players.length,
    taken: (draw.teams || []).filter((other, i) => i !== index && other?.name).map((other) => other.name)
  };
}
function teamNameSuggestions(state, ev, draw, index, round = 0) {
  const input = teamNameInput(state, ev, draw, index);
  return input ? suggestTeamNames(input, round) : [];
}
var TEAM_NAME_MAX, SUGGESTION_MAX, SUGGESTION_COUNT, MASCOTS, TEAM_WORD_MAX, teamNameKey, shuffled, drawSeed, VOWEL, titleCase, COLOR_FAMILIES, colorFamily, COLOR_PHRASES, ONES, TENS, NUMBERS_SKIPPED, NUMBER_PAIRS, GAME_WORDS, DESERT, SIZE_PHRASES, LETTER_NOUNS, CONSONANTS, sayable, NEVER, UNKIND, safeName;
var init_teamNames = __esm({
  "shared/teamNames.js"() {
    TEAM_NAME_MAX = 24;
    SUGGESTION_MAX = 20;
    SUGGESTION_COUNT = 3;
    MASCOTS = Object.freeze([
      "Sidewinders",
      "Javelinas",
      "Roadrunners",
      "Coyotes",
      "Scorpions",
      "Gila Monsters",
      "Jackrabbits",
      "Rattlers",
      "Dust Devils",
      "Bobcats",
      "Vultures",
      "Quail"
    ]);
    TEAM_WORD_MAX = 15;
    teamNameKey = (name) => String(name || "").normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
    shuffled = (list, random) => {
      const out = [...list];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    };
    drawSeed = (drawId) => String(drawId || "").replace(/^d\d+-/, "");
    VOWEL = /[aeiouy]/i;
    titleCase = (word) => word ? word[0].toUpperCase() + word.slice(1) : "";
    COLOR_FAMILIES = Object.freeze({
      "#C05B33": "Rust",
      "#D97742": "Copper",
      "#E39A3B": "Saffron",
      "#D89C2F": "Gold",
      "#C9B25A": "Mustard",
      "#A8A03F": "Olive",
      "#77804C": "Moss",
      "#4E6E39": "Cactus",
      "#6E9450": "Clover",
      "#3F7D5C": "Pine",
      "#557B72": "Sage",
      "#2F7E83": "Teal",
      "#4F93A3": "Lagoon",
      "#3B6E9C": "Cobalt",
      "#5E7291": "Slate",
      "#6D6FA8": "Periwinkle",
      "#7C5CA6": "Violet",
      "#8A4F62": "Plum",
      "#A6527C": "Orchid",
      "#B23B5E": "Raspberry",
      "#B23B2E": "Chili",
      "#8E3B2F": "Brick",
      "#7A5C43": "Cocoa",
      "#A9663F": "Terracotta",
      "#B37A4A": "Caramel",
      "#8C6A54": "Saddle",
      "#6F6546": "Mesquite",
      "#4E4A3C": "Basalt",
      "#9AA1A8": "Silver",
      "#B9AF9B": "Stone",
      "#D1C0A0": "Sand",
      "#E3D7BD": "Ivory"
    });
    colorFamily = (hex) => typeof hex === "string" && COLOR_FAMILIES[hex.toUpperCase()] || null;
    COLOR_PHRASES = Object.freeze({
      Rust: "Rust Belt",
      Copper: "Copper State",
      Gold: "Gold Rush",
      Mustard: "Cut the Mustard",
      Olive: "Olive Branch",
      Moss: "Moss Bosses",
      Cactus: "Cactus League",
      Clover: "Lucky Clover",
      Pine: "Pine Valley",
      Sage: "Sage Advice",
      Teal: "Teal Deal",
      Lagoon: "Blue Lagoon",
      Cobalt: "Cobalt Blues",
      Slate: "Clean Slate",
      Violet: "Ultra Violet",
      Plum: "Plum Crazy",
      Raspberry: "Razzle Dazzle",
      Chili: "Red Hot Chili",
      Brick: "Brick House",
      Cocoa: "Hot Cocoa",
      Terracotta: "Terracotta Army",
      Saddle: "Saddle Up",
      Mesquite: "Mesquite Smoke",
      Basalt: "Basalt & Pepper",
      Silver: "Silver Linings",
      Stone: "Stone Cold",
      Sand: "Sandstorm",
      Ivory: "Ivory Tower",
      Saffron: "Saffron Sunset",
      Periwinkle: "Periwinkle Twinkle",
      Orchid: "Orchid Bloom",
      Caramel: "Caramel Drizzle"
    });
    ONES = [
      "Zero",
      "One",
      "Two",
      "Three",
      "Four",
      "Five",
      "Six",
      "Seven",
      "Eight",
      "Nine",
      "Ten",
      "Eleven",
      "Twelve",
      "Thirteen",
      "Fourteen",
      "Fifteen",
      "Sixteen",
      "Seventeen",
      "Eighteen",
      "Nineteen"
    ];
    TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
    NUMBERS_SKIPPED = /* @__PURE__ */ new Set([69, 420, 666]);
    NUMBER_PAIRS = Object.freeze({
      "7-11": "Seven Eleven",
      "7-24": "Twenty-Four Seven",
      "5-9": "Nine to Five",
      "1-2": "One-Two Punch",
      "4-10": "Ten-Four",
      "3-2-1": "Three Two One"
    });
    GAME_WORDS = Object.freeze({
      basketball: {
        nouns: ["Buckets", "Ballers", "Hoopers", "Dimes", "Swishers", "Bigs"],
        puns: ["Full Court Press", "Nothing But Net", "Pick and Roll", "Fast Break", "Alley Oops", "Bank Shots", "Splash Bros"]
      },
      volleyball: {
        nouns: ["Spikers", "Diggers", "Setters", "Blockers", "Bumpers"],
        puns: ["Block Party", "Net Gain", "Sandbaggers", "Bump Set Spike", "Dig Deep", "Sets Appeal", "Ace Ventura"]
      },
      trivia: {
        nouns: ["Brains", "Scholars", "Know-It-Alls", "Wizards", "Professors"],
        puns: [
          "Smarty Pints",
          "Les Quizerables",
          "Quizzly Bears",
          "Brain Trust",
          "Fact Checkers",
          "Trivia Newton-John",
          "Quiz Khalifa",
          "Ivy Leaguers"
        ]
      },
      pong: {
        nouns: ["Bouncers", "Splashers", "Rerackers", "Cuppers"],
        puns: ["Re-Rack City", "Sink or Swim", "Pong Island", "Cup Cakes", "Island Time"]
      },
      die: {
        nouns: ["Rollers", "Tossers", "Dicers", "Catchers"],
        puns: ["Die Hards", "Roll Models", "Snake Eyes", "Dice Dice Baby", "Plunk Rock"]
      },
      pickleball: {
        nouns: ["Picklers", "Dinkers", "Volleyers", "Kitchen Crew"],
        puns: ["Big Dill", "Dill With It", "In a Pickle", "Dink Responsibly", "Kitchen Rules"]
      },
      "8ball": {
        nouns: ["Sharks", "Breakers", "Bankers", "Cue Balls"],
        puns: ["Rack Attack", "Corner Pocket", "Chalk Talk", "Cue Tips", "Behind the 8"]
      },
      putting: {
        nouns: ["Putters", "Aces", "Birdies", "Eagles"],
        puns: ["Tin Cuppers", "Hole in One", "Putt Pirates", "The Long Game"]
      },
      ragecage: {
        nouns: ["Stackers", "Bouncers", "Cagers"],
        puns: ["Cage Match", "Stack Attack", "Rage Against", "Full Stack"]
      },
      beerio: {
        nouns: ["Racers", "Drifters", "Shells", "Karts"],
        puns: ["Blue Shells", "Banana Peels", "Rainbow Road", "Drift Kings", "Item Box"]
      },
      where: {
        nouns: ["Explorers", "Navigators", "Pinners"],
        puns: ["Lost and Found", "Pin Drop", "Way Off Course"]
      }
    });
    DESERT = Object.freeze([
      "Dry Heat",
      "Heat Wave",
      "Camelback Crew",
      "Monsoon Season",
      "Saguaro Squad",
      "High Noon",
      "Valley Heat",
      "Mirage",
      "Desert Bloom",
      "Sonoran Sunset"
    ]);
    SIZE_PHRASES = Object.freeze({
      2: ["Double Trouble", "Dynamic Duo", "Tag Team"],
      3: ["Triple Threat", "Three's Company", "Hat Trick", "The Trifecta"],
      4: ["Fab Four", "Four on the Floor"],
      5: ["High Five", "Famous Five"],
      6: ["Six Pack", "Sixth Sense"],
      7: ["Lucky Sevens", "Magnificent Seven", "Seventh Heaven"]
    });
    LETTER_NOUNS = Object.freeze({
      A: ["Aces", "Armadillos", "Aviators", "Arrows"],
      B: ["Bandits", "Bobcats", "Bombers", "Blazers"],
      C: ["Coyotes", "Comets", "Cougars", "Chargers"],
      D: ["Dust Devils", "Dynamos", "Drifters", "Daredevils"],
      E: ["Eagles", "Embers", "Elites", "Express"],
      F: ["Falcons", "Firebirds", "Flyers"],
      G: ["Geckos", "Gila Monsters", "Giants", "Gunslingers"],
      H: ["Hawks", "Hotshots", "Hornets", "Heat"],
      I: ["Iguanas", "Icons"],
      J: ["Javelinas", "Jackrabbits", "Jets"],
      K: ["Kings", "Knights", "Kestrels"],
      L: ["Lizards", "Lobos", "Legends"],
      M: ["Mavericks", "Mustangs", "Mesas"],
      N: ["Nomads", "Navigators"],
      O: ["Outlaws", "Ospreys"],
      P: ["Pumas", "Prospectors", "Panthers"],
      Q: ["Quail", "Quakes"],
      R: ["Rattlers", "Roadrunners", "Rockets", "Rangers"],
      S: ["Scorpions", "Sidewinders", "Stingers", "Sharks"],
      T: ["Thunderbirds", "Tumbleweeds", "Titans"],
      U: ["Unicorns"],
      V: ["Vultures", "Vipers"],
      W: ["Wranglers", "Wildcats", "Wolves"],
      Y: ["Yellowjackets"],
      Z: ["Zephyrs", "Zingers"]
    });
    CONSONANTS = /[^aeiouy]/;
    sayable = (word) => !/[^aeiouy]{4,}/i.test(word) && !/[aeiouy]{3,}/i.test(word) && !(word.match(/[^aeiouy]{3}/gi) || []).some((run2) => !/h/i.test(run2));
    NEVER = /(fuck|shit|cunt|dick|cock|puss|tits|twat|wank|fag|nigg|rape|slut|whore|porn|sex|cum\b|\bass\b|anal|nazi|kkk|69|420)/i;
    UNKIND = /* @__PURE__ */ new Set(["Rust Buckets", "Brick Ballers", "Brick Bigs", "Moss Bosses"]);
    safeName = (text) => !NEVER.test(String(text || "").replace(/[^a-z0-9\s]/gi, ""));
  }
});

// shared/core.js
function cleanLeg(v) {
  if (v === null || v === void 0 || v === "") return null;
  if (typeof v === "string") return v.trim() ? { note: v.trim().slice(0, 90) } : null;
  if (typeof v !== "object") return void 0;
  const out = {};
  const air = String(v.air || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3);
  const num = String(v.num ?? "").replace(/\D/g, "").slice(0, 4);
  if (air) out.air = air;
  if (num) out.num = num;
  if (typeof v.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v.time)) out.time = v.time;
  if (typeof v.note === "string" && v.note.trim()) out.note = v.note.trim().slice(0, 90);
  return Object.keys(out).length ? out : null;
}
function legTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${(h + 11) % 12 + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
function allEventsOf(state) {
  const evs = [
    ...BUILTIN_EVENTS.map((e) => {
      const event = { ...e, ...state.eventEdits?.[e.id] || {} };
      return { ...event, participation: participationForEvent(event) };
    }),
    ...(state.customEvents || []).map((event) => ({
      ...event,
      participation: participationForEvent(event)
    }))
  ];
  const ord = state.eventOrder || [];
  if (ord.length) {
    const idx = (id) => {
      const i = ord.indexOf(id);
      return i < 0 ? 999 : i;
    };
    evs.sort((a, b) => idx(a.id) - idx(b.id) || (a.n || 99) - (b.n || 99));
  }
  return evs;
}
function teamFit(ev, count = ROSTER.length) {
  const cfg = ev?.teamCfg;
  if (!cfg || !Number.isInteger(cfg.teams) || !Number.isInteger(cfg.size) || cfg.teams < 2 || cfg.size < 1) return null;
  if (participationForEvent(ev).type === "all") {
    if (count < cfg.teams) return null;
    const split = Array.from({ length: cfg.teams }, (_, i) => Math.floor(count / cfg.teams) + (i < count % cfg.teams ? 1 : 0));
    return { teams: cfg.teams, size: split[0], bracket: null, reduced: count < cfg.teams * cfg.size, split };
  }
  if (count >= cfg.teams * cfg.size)
    return { teams: cfg.teams, size: cfg.size, bracket: cfg.bracket || null, reduced: false };
  if (cfg.bracket || ev.kind === "pairs" || ev.stageCfg) {
    const teams = Math.floor(count / cfg.size);
    return teams >= 2 ? { teams, size: cfg.size, bracket: cfg.bracket ? teams : null, reduced: true } : null;
  }
  const size = Math.floor(count / cfg.teams);
  return size >= 1 ? { teams: cfg.teams, size, bracket: null, reduced: true } : null;
}
function eventCapacity(ev, count) {
  const policy = participationForEvent(ev);
  if (policy.type === "strict-teams") {
    if (count !== void 0 && ev?.teamCfg) {
      const fit2 = teamFit(ev, count);
      return fit2 ? fit2.teams * fit2.size : null;
    }
    return Number.isInteger(policy.teams) && Number.isInteger(policy.size) ? policy.teams * policy.size : null;
  }
  if (policy.type === "fixed") return Number.isInteger(policy.entrants) ? policy.entrants : null;
  return null;
}
function validateEventParticipants(ev, selected, active = ROSTER) {
  const policy = participationForEvent(ev);
  const activeUnique = [...new Set(active)];
  const activeSet = new Set(activeUnique);
  if (!Array.isArray(selected))
    return { ok: false, code: "selection-required", error: "Choose who is playing" };
  const players = [...new Set(selected)];
  if (players.length !== selected.length)
    return { ok: false, code: "duplicate-player", error: "A player is selected twice" };
  if (players.some((player) => !activeSet.has(player)))
    return { ok: false, code: "inactive-player", error: "Only confirmed players can participate" };
  const fit2 = policy.type === "strict-teams" && ev?.teamCfg ? teamFit(ev, activeUnique.length) : null;
  const capacity = policy.type === "strict-teams" && ev?.teamCfg ? fit2 ? fit2.teams * fit2.size : ev.teamCfg.teams * ev.teamCfg.size : eventCapacity(ev);
  if (policy.type === "all") {
    if (players.length !== activeUnique.length || activeUnique.some((player) => !players.includes(player)))
      return {
        ok: false,
        code: "all-required",
        error: `All ${activeUnique.length} confirmed players are required`,
        selectedCount: players.length,
        activeCount: activeUnique.length,
        required: activeUnique.length
      };
  } else if (policy.type === "strict-teams" || policy.type === "fixed") {
    if (!capacity || capacity < 1)
      return { ok: false, code: "bad-policy", error: "Event participation is not configured" };
    if (ev?.teamCfg && !fit2)
      return {
        ok: false,
        code: "roster-short",
        error: `This event needs ${2 * ev.teamCfg.size} players; ${activeUnique.length} present`,
        selectedCount: players.length,
        activeCount: activeUnique.length,
        required: 2 * ev.teamCfg.size
      };
    if (activeUnique.length < capacity)
      return {
        ok: false,
        code: "roster-short",
        error: `This event needs ${capacity} players; ${activeUnique.length} confirmed`,
        selectedCount: players.length,
        activeCount: activeUnique.length,
        required: capacity
      };
    if (players.length !== capacity) {
      const overflow2 = Math.max(0, activeUnique.length - capacity);
      return {
        ok: false,
        code: "wrong-count",
        error: `Select exactly ${capacity} players${overflow2 ? ` and assign ${overflow2} overflow ${overflow2 === 1 ? "role" : "roles"}` : ""}`,
        selectedCount: players.length,
        activeCount: activeUnique.length,
        required: capacity,
        overflow: overflow2
      };
    }
  } else if (policy.type === "selection") {
    const min = Number.isInteger(policy.min) ? policy.min : 1;
    const max = Number.isInteger(policy.max) ? policy.max : activeUnique.length;
    if (players.length < min || players.length > max)
      return {
        ok: false,
        code: "outside-range",
        error: `Select ${min} to ${max} players`,
        selectedCount: players.length,
        activeCount: activeUnique.length
      };
  } else if (policy.type === "approximate-teams") {
    const min = Number.isInteger(policy.min) ? policy.min : 2;
    if (players.length < min)
      return {
        ok: false,
        code: "roster-short",
        error: `Select at least ${min} players`,
        selectedCount: players.length,
        activeCount: activeUnique.length
      };
  } else {
    return { ok: false, code: "bad-policy", error: "Unknown participation policy" };
  }
  const overflow = activeUnique.filter((player) => !players.includes(player));
  if (overflow.length && !policy.allowSitOut)
    return { ok: false, code: "overflow-not-allowed", error: "Every confirmed player must participate" };
  return {
    ok: true,
    players,
    overflow,
    capacity,
    fit: fit2,
    selectedCount: players.length,
    activeCount: activeUnique.length,
    policy
  };
}
function suggestParticipants(state, ev) {
  if (!ev) return null;
  const present = presentPlayers(state);
  if (!ev.teamCfg) return ev.stageCfg?.kind === "heats" ? { players: present, roles: [], fit: null } : null;
  const fit2 = teamFit(ev, present.length);
  if (!fit2) return null;
  if (participationForEvent(ev).type === "all") return { players: present, roles: [], fit: fit2 };
  const counts = {}, last = {};
  const tally = (roles, at) => (Array.isArray(roles) ? roles : []).forEach((item) => {
    if (!item?.player) return;
    counts[item.player] = (counts[item.player] || 0) + 1;
    last[item.player] = Math.max(last[item.player] || 0, Number(at) || 0);
  });
  Object.entries(state.draws || {}).forEach(([id, draw]) => {
    if (id !== ev.id) tally(draw?.roles, draw?.ts);
  });
  Object.entries(state.stages || {}).forEach(([id, stage]) => {
    if (id !== ev.id) tally(stage?.roles, stage?.ts);
  });
  const order = [...present].sort((a, b) => (counts[a] || 0) - (counts[b] || 0) || (last[a] || 0) - (last[b] || 0) || ROSTER.indexOf(b) - ROSTER.indexOf(a));
  const crew = order.slice(0, present.length - fit2.teams * fit2.size);
  return {
    players: present.filter((player) => !crew.includes(player)),
    roles: crew.map((player, index) => ({ player, role: OVERFLOW_ROLES[index % OVERFLOW_ROLES.length] })),
    fit: fit2
  };
}
function draftTurn(draft) {
  if (!draft?.id || !Array.isArray(draft.teams) || !draft.teams.length || !Array.isArray(draft.picks) || !Array.isArray(draft.pool)) return null;
  const pickIndex = draft.picks.length, remaining = draft.pool.length;
  const complete = remaining === 0;
  const teamIndex = complete ? null : snakeTeam(pickIndex, draft.teams.length);
  return {
    draftId: draft.id,
    pickIndex,
    draftRevision: Number(draft.revision || 0),
    teamIndex,
    captain: teamIndex === null ? null : draft.teams[teamIndex].captain,
    round: Math.floor(pickIndex / draft.teams.length) + 1,
    totalPicks: pickIndex + remaining,
    remaining,
    complete
  };
}
function teamLabel(state, t) {
  if (t.name) return t.name;
  const names = t.players.map((p) => disp(state, p));
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `Team ${names[0]}`;
}
function stageFinalists(st) {
  if (!st) return null;
  return st.groups.every((g) => (g.through || []).length >= st.advance) ? st.groups.flatMap((g) => g.through) : null;
}
function stageEntrantView(state, st, key) {
  if (st.entrantType === "team") {
    const draw = state.draws[st.eventId];
    const t = draw?.teams?.[key];
    return t ? { players: t.players, name: teamLabel(state, t) } : { players: [], name: "?" };
  }
  return { players: [key], name: disp(state, key) };
}
function resolveWager(state, w, events) {
  if (w.status === "void") return { status: "void", delta: 0 };
  const ev = events.find((e) => e.id === w.eventId);
  if (!ev) return { status: "void", delta: 0 };
  if (state.shelved?.[w.eventId]) return { status: "void", delta: 0 };
  if (w.kind === "outright") {
    if (w.pickTeam) {
      const draw = state.draws[w.eventId];
      if (!draw || draw.id !== w.drawId) return { status: "void", delta: 0 };
    }
    const res = state.results[w.eventId];
    if (!res || !res.slots?.[0]) return { status: "pending", delta: 0 };
    const winners = res.slots[0];
    const won = w.pickTeam ? w.pickPlayers.every((p) => winners.includes(p)) : winners.includes(w.pick);
    return { status: won ? "won" : "lost", delta: won ? wagerMult(w) * w.stake : -w.stake };
  }
  if (w.kind === "match") {
    const draw = state.draws[w.eventId];
    if (!draw || draw.id !== w.drawId) return { status: "void", delta: 0 };
    const br = state.brackets[w.eventId];
    const match = br?.rounds?.[w.match[0]]?.[w.match[1]];
    if (!match) return { status: "void", delta: 0 };
    if (match.winner === null || match.winner === void 0) return { status: "pending", delta: 0 };
    const won = match.winner === w.teamIdx;
    return { status: won ? "won" : "lost", delta: won ? w.stake : -w.stake };
  }
  if (w.kind === "stage" || w.kind === "heat") {
    const st = state.stages[w.eventId];
    if (!st || st.id !== w.stagesId) return { status: "void", delta: 0 };
    if (st.entrantType === "team") {
      const draw = state.draws[w.eventId];
      if (!draw || draw.id !== st.drawId) return { status: "void", delta: 0 };
    }
    if (w.final) {
      if (st.finalWinner === null || st.finalWinner === void 0) return { status: "pending", delta: 0 };
      const won2 = st.finalWinner === w.pickKey;
      return { status: won2 ? "won" : "lost", delta: won2 ? w.stake : -w.stake };
    }
    const g = st.groups[w.group];
    if (!g) return { status: "void", delta: 0 };
    if (w.kind === "heat") {
      if (g.winner === null || g.winner === void 0) return { status: "pending", delta: 0 };
      const won2 = g.winner === w.pickKey;
      return { status: won2 ? "won" : "lost", delta: won2 ? w.stake : -w.stake };
    }
    if ((g.through || []).length < st.advance) return { status: "pending", delta: 0 };
    const won = g.through.includes(w.pickKey);
    return { status: won ? "won" : "lost", delta: won ? w.stake : -w.stake };
  }
  return { status: "void", delta: 0 };
}
function resolveDuel(duel) {
  if (duel.status !== "open") return { settled: false, status: duel.status };
  if (!duelAccepted(duel)) return { settled: false, status: "open" };
  const a = duel.runs?.[duel.from], b = duel.runs?.[duel.to];
  if (!a || !b) return { settled: false, status: "open" };
  const score = (r) => r.foul ? Infinity : r.ms;
  if (score(a) === score(b)) return { settled: true, push: true };
  const winner = score(a) < score(b) ? duel.from : duel.to;
  return { settled: true, push: false, winner, loser: winner === duel.from ? duel.to : duel.from };
}
function duelPhase(duel, now2 = Date.now()) {
  if (!duel) return null;
  if (duel.status !== "open")
    return duel.status === "declined" || duel.status === "withdrawn" ? duel.status : "void";
  if (resolveDuel(duel).settled) return "settled";
  if (!duelAccepted(duel)) return duelLapsed(duel, now2) ? "lapsed" : "offered";
  return "live";
}
function duelReserve(state, player, now2 = Date.now()) {
  if (!player) return 0;
  return (state?.duels || []).reduce((sum, duel) => {
    const phase = duelPhase(duel, now2);
    const stake = Number(duel.stake) || 0;
    if (phase === "live" && (duel.from === player || duel.to === player)) return sum + stake;
    if (phase === "offered" && duel.from === player) return sum + stake;
    return sum;
  }, 0);
}
function duelRoom(state, player, { events, rows, now: now2 = Date.now() } = {}) {
  const standings = rows || computeStandings(state);
  const pts = standings.find((row) => row.player === player)?.pts ?? 0;
  const exposure = atRisk(state, player, events || allEventsOf(state)) + duelReserve(state, player, now2);
  const cap = maxRisk(pts);
  return {
    pts,
    cap,
    exposure,
    capRoom: cap - exposure,
    balanceRoom: pts - exposure,
    room: Math.min(cap - exposure, pts - exposure)
  };
}
function resultAwards(state, ev, res) {
  const table = awardTable(ev);
  const draw = state.draws?.[ev?.id];
  const out = [];
  const thirdEach = table[2] || 0;
  (res?.slots || []).forEach((players, place) => {
    const each = table[place] || 0;
    (players || []).forEach((player) => out.push({ player, place, pts: each }));
  });
  if (!res?.stacks && thirdEach > 0) {
    const placed = new Set(out.map((award) => award.player));
    (draw?.roles || []).forEach(({ player }) => {
      if (player && !placed.has(player)) out.push({ player, place: "crew", pts: thirdEach });
    });
  }
  return out;
}
function awardPlan(ev, draw = null) {
  const table = awardTable(ev);
  const crew = draw ? (draw.roles || []).length > 0 : Number.isInteger(eventCapacity(ev)) && eventCapacity(ev) < ROSTER.length;
  const rows = table.map((pts, place) => ({ place, pts }));
  return [
    ...rows,
    ...crew ? [{ place: "crew", pts: rows[2].pts }] : []
  ].filter((row) => row.pts > 0);
}
function mvpStands(state, evId) {
  const record = state?.mvp?.[evId], result = state?.results?.[evId];
  return !!record && !!result && !result.stacks && sameSet(result.slots?.[0] || [], record.team || []);
}
function mvpAwards(state) {
  return Object.entries(state?.mvp || {}).filter(([evId, record]) => record?.closedAt && record.winner && mvpStands(state, evId)).map(([eventId, record]) => ({ eventId, player: record.winner, pts: MVP_PTS, at: Number(record.closedAt) }));
}
function computeStandings(state) {
  const pts = {}, wins = {}, betNet = {}, duelNet = {}, awardPts = {}, mvpPts = {};
  ROSTER.forEach((p) => {
    pts[p] = START;
    wins[p] = 0;
    betNet[p] = 0;
    duelNet[p] = 0;
    awardPts[p] = 0;
    mvpPts[p] = 0;
  });
  const evs = allEventsOf(state);
  Object.entries(state.results || {}).forEach(([eid, res]) => {
    const ev = evs.find((e) => e.id === eid);
    if (!ev || !res) return;
    resultAwards(state, ev, res).forEach(({ player, place, pts: award }) => {
      if (pts[player] === void 0) return;
      pts[player] += award;
      awardPts[player] += award;
      if (place === 0) wins[player] += 1;
    });
  });
  mvpAwards(state).forEach(({ player, pts: award }) => {
    if (pts[player] === void 0) return;
    pts[player] += award;
    mvpPts[player] += award;
  });
  (state.wagers || []).forEach((w) => {
    const r = resolveWager(state, w, evs);
    if (r.status === "won" || r.status === "lost") {
      if (pts[w.player] !== void 0) {
        pts[w.player] += r.delta;
        betNet[w.player] += r.delta;
      }
    }
  });
  (state.duels || []).forEach((d) => {
    const r = resolveDuel(d);
    if (!r.settled || r.push) return;
    if (pts[r.winner] !== void 0) {
      pts[r.winner] += d.stake;
      duelNet[r.winner] += d.stake;
    }
    if (pts[r.loser] !== void 0) {
      pts[r.loser] -= d.stake;
      duelNet[r.loser] -= d.stake;
    }
  });
  const rulings = (state.adjustments || []).filter((a) => !a.removedAt);
  rulings.forEach((a) => {
    if (pts[a.player] !== void 0 && !postCountRuling(a)) pts[a.player] += a.delta;
  });
  let stacksRes = null;
  Object.values(state.results || {}).forEach((res) => {
    if (res?.stacks) stacksRes = res;
  });
  let leaders = null;
  if (stacksRes) {
    ROSTER.forEach((p) => {
      pts[p] = stacksRes.stacks[p] ?? 0;
    });
    rulings.forEach((a) => {
      if (postCountRulingApplies(a, stacksRes) && pts[a.player] !== void 0) pts[a.player] += a.delta;
    });
    const seats = (Array.isArray(stacksRes.seats) ? stacksRes.seats : Array.isArray(state.poker?.seats) ? state.poker.seats : ROSTER).filter((p) => pts[p] !== void 0);
    const top = seats.length ? Math.max(...seats.map((p) => pts[p])) : 0;
    leaders = new Set(top > 0 ? seats.filter((p) => pts[p] === top) : []);
  }
  const lead = (p) => leaders?.has(p) ? 1 : 0;
  const outRank = (p) => {
    const i = (stacksRes?.outs || []).indexOf(p);
    return i >= 0 ? i : stacksRes?.stacks?.[p] === 0 ? -1 : Infinity;
  };
  const rows = ROSTER.map((p) => ({
    player: p,
    pts: pts[p],
    wins: wins[p],
    betNet: betNet[p],
    duelNet: duelNet[p],
    awardPts: awardPts[p],
    mvpPts: mvpPts[p]
  })).sort((x, y) => lead(y.player) - lead(x.player) || y.pts - x.pts || (stacksRes ? outRank(y.player) - outRank(x.player) : 0) || y.wins - x.wins || x.player.localeCompare(y.player));
  let rank = 0, prev = null;
  rows.forEach((r, i) => {
    const key = `${lead(r.player)}:${r.pts}`;
    if (key !== prev || stacksRes && r.pts === 0) {
      rank = i + 1;
      prev = key;
    }
    r.rank = rank;
  });
  return rows;
}
function atRisk(state, p, events) {
  return (state.wagers || []).filter((w) => w.player === p && resolveWager(state, w, events).status === "pending").reduce((s, w) => s + w.stake, 0);
}
function playerStrength(state, p, sport, rows) {
  rows = rows || computeStandings(state);
  const norm = (x, lo, hi) => hi > lo ? (x - lo) / (hi - lo) : 0.5;
  const sv = state.seeds?.[p] || {};
  const vals = Object.values(sv);
  const overall = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 2;
  const r = rows.find((x) => x.player === p);
  const aps = rows.map((x) => x.awardPts), ws = rows.map((x) => x.wins);
  return 0.35 * norm(sv[sport] ?? 2, 1, 4) + 0.15 * norm(overall, 1, 4) + 0.35 * norm(r?.awardPts ?? 0, Math.min(...aps), Math.max(...aps)) + 0.15 * norm(r?.wins ?? 0, Math.min(...ws), Math.max(...ws));
}
function bracketMatchName(bracket, r, m) {
  const name = bracketRoundName(bracket?.size, r);
  if ((bracket?.rounds?.[r]?.length || 1) <= 1) return name;
  return /\d$/.test(name) ? `${name} Match ${m + 1}` : `${name.replace(/s$/, "")} ${m + 1}`;
}
function resolveSlot(br, slot) {
  if (!slot) return null;
  if (slot.t !== void 0) return slot.t;
  const src = br.rounds[slot.w[0]]?.[slot.w[1]];
  return src && src.winner !== null && src.winner !== void 0 ? src.winner : null;
}
function bracketMatchOpen(br, r, m) {
  const match = br?.rounds?.[r]?.[m];
  if (!match || match.winner !== null && match.winner !== void 0) return false;
  return resolveSlot(br, match.a) !== null && resolveSlot(br, match.b) !== null;
}
function bracketOrder(br) {
  const order = [];
  (br?.rounds || []).forEach((round, r) => round.forEach((_, m) => order.push([r, m])));
  const next = Array.isArray(br?.next) ? br.next : null;
  if (next && bracketMatchOpen(br, next[0], next[1]))
    return [[next[0], next[1]], ...order.filter(([r, m]) => r !== next[0] || m !== next[1])];
  return order;
}
function contestTarget(state, ev) {
  if (!ev || state.results?.[ev.id] || state.shelved?.[ev.id] || ev.finale || state.drafts?.[ev.id] && !state.draws?.[ev.id]) return null;
  const draw = state.draws?.[ev.id];
  if (ev.teamCfg && !draw) return null;
  const br = state.brackets?.[ev.id];
  if (ev.teamCfg?.bracket && !br) return null;
  if (br) {
    for (const [r, m] of bracketOrder(br)) {
      const match = br.rounds[r][m];
      if (match.winner !== null && match.winner !== void 0) continue;
      const keys = [resolveSlot(br, match.a), resolveSlot(br, match.b)];
      if (keys.some((key) => key === null || key === void 0 || !draw?.teams?.[key])) continue;
      return {
        id: `match:${ev.id}:${draw.id}:${r}:${m}`,
        kind: "match",
        match: [r, m],
        drawId: draw.id,
        /* named as the bracket names it: "Final", "Semifinal 1", "Round 1 Match 3" */
        label: bracketMatchName(br, r, m),
        sides: keys.map((key) => ({ key, players: [...draw.teams[key].players] }))
      };
    }
    return null;
  }
  const st = state.stages?.[ev.id];
  if (needsStageSetup(state, ev)) return null;
  if (st) {
    if (st.entrantType === "team" && (!draw || st.drawId !== draw.id)) return null;
    const sides = (keys) => keys.map((key) => ({ key, players: stageEntrantView(state, st, key).players }));
    const group = st.groups.findIndex((g) => (g.through || []).length < st.advance || st.contestVersion === 1 && (g.winner === null || g.winner === void 0));
    if (group >= 0) return {
      id: `heat:${ev.id}:${st.id}:${group}`,
      kind: "heat",
      group,
      stagesId: st.id,
      drawId: st.drawId || null,
      label: st.groups[group].name,
      sides: sides(st.groups[group].entrants)
    };
    const finalists = stageFinalists(st);
    if (!finalists || st.finalWinner !== null && st.finalWinner !== void 0) return null;
    return {
      id: `final:${ev.id}:${st.id}`,
      kind: "stage-final",
      stagesId: st.id,
      drawId: st.drawId || null,
      label: "Final",
      sides: sides(finalists)
    };
  }
  return {
    id: `ffa:${ev.id}:${draw?.id || "solo"}`,
    kind: "ffa",
    drawId: draw?.id || null,
    label: ev.name,
    sides: draw ? draw.teams.map((team, key) => ({ key, players: [...team.players] })) : presentPlayers(state).map((key) => ({ key, players: [key] }))
  };
}
function resolveCurrentContest(state, ev) {
  const target = contestTarget(state, ev);
  if (!target) return null;
  const op = eventOpOf(state, ev.id);
  const stored = op.contest;
  const same = stored?.id === target.id;
  const legacy = !stored;
  let phase;
  if (same) phase = stored.phase;
  else if (stored || op.resultEntryAt) phase = "awaiting-result";
  else if (op.startedAt || bracketStarted(state.brackets?.[ev.id]) || stagesStarted(state.stages?.[ev.id]))
    phase = "in-progress";
  else if (state.onDeck === ev.id) phase = "betting-open";
  else phase = op.bettingLockedAt ? "betting-locked" : "scheduled";
  const nextAction = phase === "betting-open" ? lifecycleAction("lock-betting", "Lock bets and start") : phase === "betting-locked" ? lifecycleAction("start-event", "Start") : phase === "awaiting-result" ? lifecycleAction("post-result", "Post result") : phase === "scheduled" ? lifecycleAction("open-betting", "Open betting") : target.kind === "ffa" ? lifecycleAction("enter-result", "Enter result") : lifecycleAction("record-contest-winner", "Record winner");
  return {
    ...target,
    eventId: ev.id,
    revision: same ? Number(stored.revision || 0) : Number(op.contestRevision || 0),
    phase,
    legacy,
    players: [...new Set(target.sides.flatMap((side) => side.players))],
    nextAction
  };
}
function contestBetEligibility(contest, player, sideKey) {
  const side = contest?.sides.find((item) => item.key === sideKey);
  if (!side || !isActivePlayer(player)) return false;
  if (wideField(contest)) return true;
  return !contest.players.includes(player) || side.players.includes(player);
}
function wagerSide(state, w) {
  if (w.kind === "match") return w.teamIdx;
  if (w.kind !== "outright") return w.pickKey;
  if (!w.pickTeam) return w.pick;
  if (Number.isInteger(w.teamIdx)) return w.teamIdx;
  const teams = state.draws?.[w.eventId]?.teams || [];
  const want = [...w.pickPlayers || []].sort().join("|");
  const index = teams.findIndex((team) => [...team.players].sort().join("|") === want);
  return index < 0 ? null : index;
}
function contestSideOf(state, contest, player, events = allEventsOf(state)) {
  if (!contest || wideField(contest)) return null;
  const held = (state.wagers || []).find((w) => w.player === player && wagerMatchesContest(w, contest) && resolveWager(state, w, events).status === "pending");
  return held ? wagerSide(state, held) : null;
}
function wagerMatchesContest(wager, contest) {
  if (!contest || wager.eventId !== contest.eventId) return false;
  if (wager.contestId && wager.contestId !== contest.id) return false;
  if (contest.kind === "ffa") return wager.kind === "outright" && (!contest.drawId || wager.pickTeam && wager.drawId === contest.drawId);
  if (contest.kind === "match") return wager.kind === "match" && wager.drawId === contest.drawId && wager.match?.[0] === contest.match[0] && wager.match?.[1] === contest.match[1];
  return wager.stagesId === contest.stagesId && (contest.kind === "heat" ? wager.kind === "heat" && !wager.final && wager.group === contest.group : wager.kind === "stage" && wager.final === true);
}
function enforceExposure(state, now2 = Date.now()) {
  if (pokerLive(state) || stacksPosted(state)) return [];
  const events = allEventsOf(state);
  const rows = computeStandings(state);
  const voided = [];
  for (const { player, pts } of rows) {
    const limit = Math.max(0, Math.min(maxRisk(pts), pts));
    const items = [];
    for (const w of (state.wagers || []).filter((w2) => w2.player === player && resolveWager(state, w2, events).status === "pending")) {
      const chips = Array.isArray(w.chips) && w.chips.length ? w.chips : null;
      if (!chips) items.push({ w, stake: w.stake, ts: w.updatedAt || w.ts || 0, order: 0 });
      else chips.forEach((chip2, index) => items.push({
        w,
        chip: chip2,
        stake: Number(chip2.stake) || 0,
        ts: chip2.ts || w.ts || 0,
        order: index
      }));
    }
    for (const d of state.duels || []) {
      const phase = duelPhase(d, now2);
      if (phase === "live" && (d.from === player || d.to === player) || phase === "offered" && d.from === player)
        items.push({ d, stake: d.stake, ts: d.acceptedAt || d.ts || 0, order: 0 });
    }
    let exposure = items.reduce((sum, item) => sum + item.stake, 0);
    items.sort((a, b) => b.ts - a.ts || b.order - a.order);
    for (const item of items) {
      if (exposure <= limit) break;
      if (item.d) {
        if (!(item.d.status === "open" && !resolveDuel(item.d).settled)) continue;
        item.d.status = "void";
        Object.assign(item.d, { voidedAt: now2, voidedBy: "exposure" });
        voided.push({ type: "duel", id: item.d.id, players: [item.d.from, item.d.to], stake: item.d.stake });
      } else if (item.chip && item.w.chips.length > 1 && item.w.chips.at(-1) === item.chip) {
        item.w.chips.pop();
        item.w.stake = Math.max(0, item.w.stake - item.stake);
        item.w.updatedAt = now2;
        item.w.voidedChips = [...item.w.voidedChips || [], { ...item.chip, voidedAt: now2 }];
        voided.push({ type: "chip", id: item.w.id, player, eventId: item.w.eventId, stake: item.stake });
      } else {
        if (item.w.status === "void") continue;
        item.w.status = "void";
        Object.assign(item.w, { voidedAt: now2, voidedBy: "exposure" });
        voided.push({ type: "wager", id: item.w.id, player, eventId: item.w.eventId, stake: item.w.stake });
        exposure -= item.w.stake - item.stake;
      }
      exposure -= item.stake;
    }
  }
  return voided;
}
function refundTotals(items = []) {
  const totals = /* @__PURE__ */ new Map();
  items.forEach((item) => {
    if (item?.player) totals.set(item.player, (totals.get(item.player) || 0) + Number(item.stake || 0));
  });
  return [...totals].map(([player, stake]) => ({ player, stake }));
}
function voidWagerRecords(state, ids, reason, now2 = Date.now()) {
  const wanted = new Set(ids);
  const events = allEventsOf(state);
  const voided = [];
  (state.wagers || []).forEach((wager) => {
    if (!wanted.has(wager.id) || wager.status === "void") return;
    const was = resolveWager(state, wager, events).status;
    wager.status = "void";
    wager.voidReason = reason;
    wager.voidedAt = now2;
    if (was === "won" || was === "lost") wager.voidedFrom = was;
    voided.push({ id: wager.id, player: wager.player, stake: Number(wager.stake || 0) });
  });
  return voided;
}
function contestStackOf(state, evId) {
  const op = eventOpOf(state, evId);
  if (Array.isArray(op.contestStack)) return op.contestStack;
  return op.lastContest ? [op.lastContest] : [];
}
function contestEntryLabel(state, ev, entry) {
  if (!entry) return "";
  if (typeof entry.short === "string" && entry.short) return entry.short;
  if (entry.kind === "match" && Array.isArray(entry.match)) {
    const [r, m] = entry.match;
    const br = state.brackets?.[ev?.id];
    const size = state.draws?.[ev?.id]?.teams?.length || br?.size;
    return bracketMatchName({ size, rounds: br?.rounds }, r, m);
  }
  if (entry.kind === "heat") return state.stages?.[ev?.id]?.groups?.[entry.group]?.name || `Heat ${Number(entry.group) + 1}`;
  return "Final";
}
function restoreContestEntry(state, evId, entry) {
  if (entry.kind === "match") {
    const match = state.brackets?.[evId]?.rounds?.[entry.match[0]]?.[entry.match[1]];
    if (match) match.winner = entry.previousWinner ?? null;
  } else if (entry.kind === "heat") {
    const group = state.stages?.[evId]?.groups?.[entry.group];
    if (group) {
      group.winner = entry.previousWinner ?? null;
      group.through = [...entry.previousThrough || []];
    }
  } else if (state.stages?.[evId]) state.stages[evId].finalWinner = entry.previousWinner ?? null;
}
function applyContestCorrection(state, ev, contestId, now2 = Date.now()) {
  const stack2 = [...contestStackOf(state, ev.id)];
  const index = stack2.findIndex((entry) => entry.id === contestId);
  if (index < 0) return null;
  const target = stack2[index], later = stack2.slice(index + 1);
  const events = allEventsOf(state);
  const ids = /* @__PURE__ */ new Set();
  const current = resolveCurrentContest(state, ev);
  if (current) (state.wagers || []).forEach((wager) => {
    if (wagerMatchesContest(wager, current) && resolveWager(state, wager, events).status === "pending") ids.add(wager.id);
  });
  later.forEach((entry) => {
    const contest = contestOfEntry(ev.id, entry);
    (state.wagers || []).forEach((wager) => {
      if (wager.status !== "void" && wagerMatchesContest(wager, contest)) ids.add(wager.id);
    });
  });
  [...stack2.slice(index)].reverse().forEach((entry) => restoreContestEntry(state, ev.id, entry));
  const returned = voidWagerRecords(state, [...ids], "Previous result corrected", now2);
  const op = state.eventOps[ev.id];
  if (target.kind === "match" && state.brackets?.[ev.id])
    state.brackets[ev.id].next = [target.match[0], target.match[1]];
  op.contestRevision = Number(op.contestRevision || 0) + 1;
  op.contest = { id: target.id, revision: op.contestRevision, phase: "in-progress" };
  op.bettingLockedAt = now2;
  delete op.resultEntryAt;
  op.contestStack = stack2.slice(0, index);
  if (op.contestStack.length) op.lastContest = op.contestStack.at(-1);
  else delete op.lastContest;
  if (state.onDeck === ev.id) state.onDeck = null;
  const exposure = enforceExposure(state, now2);
  return {
    contestId: target.id,
    contestRevision: op.contestRevision,
    label: contestEntryLabel(state, ev, target),
    rewinds: later.map((entry) => contestEntryLabel(state, ev, entry)),
    voidIds: returned.map((item) => item.id),
    refunds: refundTotals([...returned, ...exposure.filter((item) => item.type !== "duel")]),
    voidDuels: exposure.filter((item) => item.type === "duel").map((item) => ({ id: item.id, players: item.players, stake: item.stake })),
    voided: exposure
  };
}
function contestCorrectionAvailability(state, ev, contestId = null, now2 = Date.now()) {
  const op = eventOpOf(state, ev?.id);
  const stack2 = ev ? contestStackOf(state, ev.id) : [];
  const entry = contestId ? stack2.find((item) => item.id === contestId) : stack2.at(-1);
  const short = entry ? contestEntryLabel(state, ev, entry) : "";
  const response = (blocker, preview2 = {}) => ({
    enabled: !blocker,
    blocker: blocker || null,
    contestId: entry?.id || null,
    contestRevision: Number(op.contestRevision || 0),
    label: entry ? `Correct ${short}` : null,
    contest: short || null,
    rewinds: [],
    voidIds: [],
    refunds: [],
    voidDuels: [],
    voided: [],
    ...preview2
  });
  if (!ev || !entry) return response("No previous contest to correct");
  if (state.frozen) return response("The board is frozen");
  if (state.results?.[ev.id]) return response("The event result is already posted");
  if (state.poker || stacksPosted(state)) return response("The finale is underway");
  if (state.onDeck && state.onDeck !== ev.id) return response("Close the current betting market first");
  const rewound = stack2.slice(stack2.indexOf(entry));
  if (rewound.some((item) => item.drawId && state.draws?.[ev.id]?.id !== item.drawId || item.stagesId && state.stages?.[ev.id]?.id !== item.stagesId))
    return response("Draw changed, refresh and try again");
  const preview = structuredClone(state);
  const moved = applyContestCorrection(preview, allEventsOf(preview).find((item) => item.id === ev.id), entry.id, now2);
  if (!moved) return response("No previous contest to correct");
  const { contestId: _id, contestRevision: _revision, label: _label, ...rest } = moved;
  return response(null, rest);
}
function correctionText(state, moved = {}) {
  const duels = (moved.voidDuels || []).map((duel) => duelPairText(state, duel.players));
  return [
    moved.rewinds?.length ? `Rewinds ${moved.rewinds.join(", ")}` : "",
    refundText(state, moved.refunds || []),
    duels.length ? `Voids ${duels.join(", ")} duel${duels.length === 1 ? "" : "s"}` : ""
  ].filter(Boolean).map((line) => `${line}.`).join(" ");
}
function announcementTakeBack(state, ev) {
  const op = eventOpOf(state, ev?.id);
  const response = (blocker, extra = {}) => ({
    enabled: !blocker,
    blocker: blocker || null,
    eventId: ev?.id || null,
    refunds: [],
    voidIds: [],
    ...extra
  });
  if (!ev) return response("No such event");
  const announced = state.onDeck === ev.id || !!op.contest || !!op.bettingOpenedAt || !!op.bettingLockedAt;
  if (!announced) return response("Not announced");
  if (state.frozen) return response("The board is frozen");
  if (state.results?.[ev.id]) return response("Result already posted");
  if (op.startedAt || op.resultEntryAt || contestStackOf(state, ev.id).length || bracketStarted(state.brackets?.[ev.id]) || stagesStarted(state.stages?.[ev.id]))
    return response("The event has already started");
  const events = allEventsOf(state);
  const pending = (state.wagers || []).filter((wager) => wager.eventId === ev.id && resolveWager(state, wager, events).status === "pending");
  return response(null, { voidIds: pending.map((wager) => wager.id), refunds: refundTotals(pending) });
}
function resultReadiness(state, ev) {
  const blockers = [];
  if (state.drafts?.[ev.id] && !state.draws?.[ev.id])
    blockers.push("Finish or cancel the captains draft");
  if (ev.teamCfg && !state.draws?.[ev.id])
    blockers.push("Set the teams first");
  const bracket = state.brackets?.[ev.id];
  if (bracket && bracketChampion(bracket) === null)
    blockers.push("Complete the bracket");
  const stages = state.stages?.[ev.id];
  if (needsStageSetup(state, ev)) blockers.push(`Set up ${ev.stageCfg.kind} first`);
  if (ev.teamCfg?.bracket && !bracket) blockers.push("Set up the bracket first");
  if (stages && (!stageFinalists(stages) || stages.finalWinner === null || stages.finalWinner === void 0))
    blockers.push(`Complete the ${stages.kind === "heats" ? "heats" : "pools"} and final`);
  return { ok: blockers.length === 0, blockers };
}
function resolveEventLifecycle(state, ev) {
  if (!ev) return {
    phase: "scheduled",
    label: EVENT_PHASE_LABELS.scheduled,
    blockers: ["Event not found"],
    nextAction: null
  };
  const result = state.results?.[ev.id];
  const op = eventOpOf(state, ev.id);
  const finish = resultReadiness(state, ev);
  const response = (phase, nextAction = null, blockers = []) => ({
    eventId: ev.id,
    phase,
    label: EVENT_PHASE_LABELS[phase],
    blockers,
    nextAction,
    revision: Number(op.revision || result?.revision || 0)
  });
  if (state.shelved?.[ev.id]) return response("shelved");
  if (result) return response("complete");
  if (ev.finale) {
    if (!state.poker) {
      const blockers = [];
      const events = allEventsOf(state);
      const pendingWagers = (state.wagers || []).filter((w) => resolveWager(state, w, events).status === "pending").length;
      if (pendingWagers)
        blockers.push(`Settle ${pendingWagers} open bet${pendingWagers === 1 ? "" : "s"} first`);
      return response(
        "setup",
        lifecycleAction("setup-poker", "Set up the poker table", blockers),
        blockers
      );
    }
    if (op.resultEntryAt)
      return response("result-entry", lifecycleAction("post-poker-result", "Post the final chip counts"));
    if (!state.poker.startedAt)
      return response("setup", lifecycleAction("start-poker", "Start the poker table"));
    return response("in-progress", lifecycleAction("run-poker", "Run the poker table"));
  }
  const draw = state.draws?.[ev.id];
  const draft = state.drafts?.[ev.id];
  if (draft && !draw)
    return response("draw-pending", lifecycleAction("continue-draft", `Continue the ${ev.name} draft`));
  if (ev.teamCfg && !draw)
    return response("draw-pending", lifecycleAction("prepare-draw", `Choose players and draw ${ev.name}`));
  if (needsStageSetup(state, ev))
    return response("setup", lifecycleAction("prepare-stages", `Set up ${ev.stageCfg.kind}`));
  if (op.contest) {
    if (op.resultEntryAt)
      return response("result-entry", lifecycleAction("post-result", `Post the ${ev.name} result`, finish.blockers), finish.blockers);
    const contest = resolveCurrentContest(state, ev);
    if (contest) return response(
      contest.phase === "awaiting-result" ? "result-entry" : contest.phase,
      contest.nextAction,
      contest.phase === "in-progress" ? finish.blockers : []
    );
    return response("in-progress", lifecycleAction("enter-result", `Enter the ${ev.name} result`, finish.blockers), finish.blockers);
  }
  const competitionStarted = !!op.startedAt || bracketStarted(state.brackets?.[ev.id]) || stagesStarted(state.stages?.[ev.id]);
  if (state.onDeck === ev.id && !competitionStarted)
    return response("betting-open", lifecycleAction("lock-betting", `Lock betting on ${ev.name}`));
  if (op.resultEntryAt)
    return response(
      "result-entry",
      lifecycleAction("post-result", `Post the ${ev.name} result`, finish.blockers),
      finish.blockers
    );
  if (competitionStarted) {
    let action;
    if (resolveCurrentContest(state, ev)?.kind !== "ffa" && !finish.ok)
      action = lifecycleAction("record-contest-winner", "Record winner");
    else action = lifecycleAction("enter-result", `Enter the ${ev.name} result`);
    return response("in-progress", action, finish.blockers);
  }
  if (op.bettingLockedAt)
    return response("betting-locked", lifecycleAction("start-event", `Start ${ev.name}`));
  if (draw)
    return response("draw-revealed", lifecycleAction("open-betting", `Open betting on ${ev.name}`));
  return response("setup", lifecycleAction("open-betting", `Open betting on ${ev.name}`));
}
function eventInPlay(state, ev) {
  if (!ev || state.results?.[ev.id] || state.shelved?.[ev.id]) return false;
  if (ev.finale) return state.poker?.id === ev.id && !!state.poker.startedAt;
  const phase = resolveEventLifecycle(state, ev).phase;
  if (phase === "in-progress" || phase === "result-entry") return true;
  return phase === "betting-locked" && !!state.eventOps?.[ev.id]?.bettingLockedAt;
}
var ROSTER_CONFIG, ROSTER_STATUSES, rosterPlayers, ALL_PLAYERS, ROSTER, isActivePlayer, isAway, presentPlayers, PT, START, MAX_RISK, BUYIN_FLOOR, maxRisk, AWARDS, awardTable, SPORTS, RATINGS, SESSIONS, RAW_BUILTIN_EVENTS, OVERFLOW_ROLES, OVERFLOW_ROLE_META, overflowRoleMeta, participationForEvent, BUILTIN_EVENTS, GAMES, SLOT_META, OUTRIGHT_MULT, wagerMult, SIZES, AIRLINES, CHIP_GRAY, CHIP_COLORS, CHIP_SKINS, EDITION, LOGISTICS, EMPTY_STATE, RESET_PROGRESS_PRESERVED_KEYS, shapeLabel, disp, shuffle, snakeTeam, TEAM_NAMES, pokerLive, stacksPosted, CHIP_MIN, POKER_CONFIG, DUEL_LAPSE_MS, duelAccepted, duelLapsed, duelLapsesAt, duelOpen, duelBetween, DUEL_DAILY_LIMIT, duelsSentToday, postCountRuling, postCountRulingApplies, MVP_PTS, MVP_WINDOW_MS, sameSet, MAX_BRACKET, ROUND_NAMES, bracketRoundName, bracketChampion, EVENT_PHASE_LABELS, eventOpOf, bracketStarted, stagesStarted, needsStageSetup, wideField, contestMult, contestOfEntry, contestUndoAvailability, contestCorrections, refundText, duelPairText, lifecycleAction;
var init_core = __esm({
  "shared/core.js"() {
    init_teamNames();
    ROSTER_CONFIG = [
      { id: "Brandon", name: "Brandon", status: "confirmed" },
      { id: "Evan", name: "Evan", status: "confirmed" },
      { id: "Eyob", name: "Eyob", status: "confirmed" },
      { id: "Sahil", name: "Sahil", status: "confirmed" },
      { id: "Khoa", name: "Khoa", status: "confirmed" },
      { id: "Chinh", name: "Chinh", status: "confirmed" },
      { id: "Adi", name: "Adi", status: "confirmed" },
      { id: "Chiang", name: "Chiang", status: "confirmed" },
      { id: "Richard", name: "Richard", status: "confirmed" },
      { id: "Allan", name: "Allan", status: "confirmed" },
      { id: "Henry", name: "Henry", status: "confirmed" },
      { id: "Ben", name: "Ben", status: "confirmed" },
      { id: "Jeremy", name: "Jeremy", status: "confirmed" }
    ];
    ROSTER_STATUSES = ["confirmed", "pending", "out"];
    rosterPlayers = (config = ROSTER_CONFIG, statuses = ["confirmed"]) => {
      const allowed = new Set(statuses);
      return config.filter((player) => allowed.has(player.status)).map((player) => player.id);
    };
    ALL_PLAYERS = rosterPlayers(ROSTER_CONFIG, ROSTER_STATUSES);
    ROSTER = rosterPlayers();
    isActivePlayer = (id) => ROSTER.includes(id);
    isAway = (state, id) => !!state?.away?.[id];
    presentPlayers = (state) => ROSTER.filter((player) => !isAway(state, player));
    PT = 100;
    START = 10 * PT;
    MAX_RISK = 5 * PT;
    BUYIN_FLOOR = 6 * PT;
    maxRisk = (pts) => Math.max(MAX_RISK, Math.floor(pts / 2 / PT) * PT);
    AWARDS = { 400: [400, 200, 100], 800: [800, 400, 200], 1200: [1200, 600, 300], 1600: [1600, 800, 400] };
    awardTable = (ev) => Array.isArray(ev?.pays) && ev.pays.length === 3 ? ev.pays : AWARDS[ev?.value] || [0, 0, 0];
    SPORTS = [
      { id: "bball", label: "Basketball", group: "sport" },
      { id: "volley", label: "Volleyball", group: "sport" },
      { id: "spike", label: "Spikeball", group: "sport" },
      { id: "golf", label: "Putting", group: "sport" },
      { id: "pool", label: "Pool", group: "sport" },
      { id: "pingpong", label: "Ping Pong", group: "sport" },
      { id: "foosball", label: "Foosball", group: "sport" },
      { id: "pickleball", label: "Pickleball", group: "sport" },
      { id: "kart", label: "Mario Kart", group: "drink" },
      { id: "pong", label: "Beer Pong", group: "drink" },
      { id: "die", label: "Beer Die", group: "drink" },
      { id: "flip", label: "Flip Cup", group: "drink" },
      { id: "cage", label: "Rage Cage", group: "drink" }
    ];
    RATINGS = [
      { v: 1, label: "Never played" },
      { v: 1.5, label: "Rough" },
      { v: 2, label: "Average" },
      { v: 3, label: "Solid" },
      { v: 4, label: "Elite" }
    ];
    SESSIONS = [
      { id: "fri", label: "Friday Night", tag: "400 CHIPS" },
      { id: "sam", label: "Saturday Morning", tag: "800 CHIPS" },
      { id: "sap", label: "Saturday Afternoon", tag: "1200 CHIPS" },
      { id: "san", label: "Saturday Night", tag: "1600 CHIPS" },
      { id: "fin", label: "The Finale", tag: "POKER" }
    ];
    RAW_BUILTIN_EVENTS = [
      /* ── Friday night · 400 ── */
      {
        id: "putt",
        n: 1,
        session: "fri",
        value: 400,
        name: "Long Putt",
        kind: "solo",
        sport: "golf",
        game: "putting",
        desc: "Three attempts from one spot. Closest wins. A sunk putt beats everything. Ties: sudden death."
      },
      {
        id: "die",
        n: 2,
        session: "fri",
        value: 400,
        name: "Beer Die Doubles",
        kind: "pairs",
        sport: "die",
        game: "die",
        teamCfg: { teams: 6, size: 2, bracket: 6 },
        desc: "Single elimination doubles. Toss the die over the line, they catch off the bounce. Sinking it in a cup wins the game."
      },
      {
        id: "where",
        n: 3,
        session: "fri",
        value: 400,
        name: "Where and When",
        kind: "solo",
        game: "where",
        desc: "Photos from Brandon's past. Pin where each was taken and guess the date and hour. Highest total wins."
      },
      /* ── Saturday morning · 800 ── */
      /* everyone plays: captains draft two sides of seven and six. Winners only. */
      {
        id: "bball5",
        n: 4,
        session: "sam",
        value: 800,
        name: "5v5 Full Court",
        kind: "team",
        sport: "bball",
        game: "basketball",
        variant: "5v5",
        teamCfg: { teams: 2, size: 6 },
        pays: [800, 0, 0],
        participation: { type: "all", allowSitOut: true, overflowRoles: [] },
        desc: "Captains draft two sides, seven and six. Full court, twos and threes on the clock. Ahead at the horn wins."
      },
      {
        id: "pickleball",
        n: 5,
        session: "sam",
        value: 800,
        name: "Pickleball Doubles",
        kind: "pairs",
        sport: "pickleball",
        game: "pickleball",
        teamCfg: { teams: 6, size: 2, bracket: 6 },
        desc: "Single elimination doubles. No volleys in the kitchen. Games to 11, win by 2."
      },
      /* a bracket of everyone present: entrants are teams of one, seeded by the
         draw, and the top seeds take the byes */
      {
        id: "bball1",
        n: 6,
        session: "sam",
        value: 800,
        name: "1v1 Basketball",
        kind: "solo",
        sport: "bball",
        game: "basketball",
        variant: "1v1",
        teamCfg: { teams: 13, size: 1, bracket: 13 },
        desc: "Single elimination, everyone in. Ones to 5, make it take it, win by 1."
      },
      /* ── Saturday afternoon · 1200 ── */
      {
        id: "volley",
        n: 7,
        session: "sap",
        value: 1200,
        name: "Sand Volleyball",
        kind: "team",
        sport: "volley",
        game: "volleyball",
        teamCfg: { teams: 4, size: 3, bracket: 4 },
        desc: "Four teams of three, single elimination. Best of three sets to 15, cap 17. Rotate servers."
      },
      {
        id: "8ball",
        n: 8,
        session: "sap",
        value: 1200,
        name: "8-Ball Doubles",
        kind: "pairs",
        sport: "pool",
        game: "8ball",
        teamCfg: { teams: 6, size: 2, bracket: 6 },
        desc: "Single elimination. One rack per matchup, alternating shots. Ball-in-hand on scratches."
      },
      {
        id: "pong",
        n: 9,
        session: "sap",
        value: 1200,
        name: "Beer Pong Doubles",
        kind: "pairs",
        sport: "pong",
        game: "pong",
        teamCfg: { teams: 6, size: 2, bracket: 6 },
        desc: "Single elimination. Six cups, one re-rack. Bounce counts two, can be swatted. Redemption in semis and final."
      },
      /* ── Saturday night · 1600 ── */
      {
        id: "trivia",
        n: 10,
        session: "san",
        value: 1600,
        name: "Trivia",
        kind: "team",
        game: "trivia",
        teamCfg: { teams: 4, size: 3 },
        desc: "Four teams of three, one game. Most points wins."
      },
      {
        id: "ragecage",
        n: 11,
        session: "san",
        value: 1600,
        name: "Rage Cage",
        kind: "solo",
        sport: "cage",
        game: "ragecage",
        pays: [1600, 1600, 400],
        desc: "Everyone circles the cups, two balls in play. Get stacked on and you are out. The last two go head to head."
      },
      {
        id: "beerio",
        n: 12,
        session: "san",
        value: 1600,
        name: "Beerio Kart",
        kind: "solo",
        sport: "kart",
        game: "beerio",
        stageCfg: { kind: "heats", nGroups: 4, advance: 1 },
        desc: "Heats of four, then a final. Crack a beer at the line, pull over to drink, finish it before you cross. Highest total wins."
      },
      /* ── The Finale · poker. No value: the result carries chip stacks that
         BECOME the standings, it never pays awards. ── */
      {
        id: "poker",
        n: 13,
        session: "fin",
        name: "Championship Poker",
        kind: "solo",
        finale: true,
        game: "poker",
        desc: "Whatever you have Saturday night is the stack you start the finale with. No-limit hold'em, blinds on the clock. Final chip counts are the final standings."
      }
    ];
    OVERFLOW_ROLES = ["referee", "scorekeeper", "photographer", "on-deck", "sit-out"];
    OVERFLOW_ROLE_META = Object.freeze({
      referee: Object.freeze({
        label: "Event official",
        short: "Official",
        detail: "Calls rules and settles close plays."
      }),
      scorekeeper: Object.freeze({
        label: "Scorekeeper",
        short: "Score",
        detail: "Tracks the score and reports the finish."
      }),
      photographer: Object.freeze({
        label: "Photographer",
        short: "Camera",
        detail: "Captures the matchup and the winner."
      }),
      "on-deck": Object.freeze({
        label: "On-deck lead",
        short: "Next up",
        detail: "Gets the next matchup ready."
      }),
      "sit-out": Object.freeze({
        label: "Event host",
        short: "Host",
        detail: "Resets the station between games."
      })
    });
    overflowRoleMeta = (role) => OVERFLOW_ROLE_META[role] || OVERFLOW_ROLE_META["sit-out"];
    participationForEvent = (ev) => {
      if (ev?.participation) return ev.participation;
      if (ev?.teamCfg) return {
        type: "strict-teams",
        teams: ev.teamCfg.teams,
        size: ev.teamCfg.size,
        allowSitOut: true,
        overflowRoles: OVERFLOW_ROLES
      };
      return { type: "all", allowSitOut: false, overflowRoles: [] };
    };
    BUILTIN_EVENTS = RAW_BUILTIN_EVENTS.map((ev) => ({
      ...ev,
      participation: participationForEvent(ev)
    }));
    GAMES = {
      putting: { name: "Putting", howto: {
        players: "Solo",
        gear: ["Putter", "One ball"],
        objective: "Sink it, or finish closest to the pin.",
        steps: ["Putt from the marked spot.", "A make beats any miss. Otherwise the closest ball wins."],
        win: "Closest of three attempts wins. Ties go to sudden death."
      } },
      "8ball": { name: "8-Ball", howto: {
        players: "Pairs",
        gear: ["Pool table", "Full rack", "Two cues"],
        objective: "Clear your group, then sink the 8.",
        steps: ["Break, then split stripes and solids.", "Partners alternate shots.", "A scratch gives the other pair ball in hand.", "Call the 8 before you shoot it."],
        win: "First pair to legally sink the 8 wins."
      } },
      pong: { name: "Beer Pong", howto: {
        players: "Pairs",
        gear: ["Table", "Ten cups", "Two balls"],
        objective: "Sink every cup on the far end first.",
        steps: ["Rack six, one re-rack on request.", "Both partners throw each turn.", "Bounces count two and can be swatted."],
        win: "First pair to sink all their cups wins.",
        house: "Redemption throw in the semis and final."
      } },
      die: { name: "Beer Die", howto: {
        players: "Pairs",
        gear: ["Table", "One die", "Four cups", "A pour"],
        objective: "Land the die in their cup, or make them miss the catch.",
        steps: ["Sit across the table, cups on your two corners.", "Toss the die up past head height and onto the far end.", "It has to bounce off the table. No darting it, no skying it.", "They catch it one-handed off the bounce, or you score."],
        win: "First pair to the set score wins. Sinking the die in a cup ends it on the spot.",
        house: "Call your own height on the toss. A plunk means chug."
      } },
      basketball: { name: "Basketball", variants: [
        { id: "1v1", label: "1v1", howto: {
          players: "Solo, single elimination",
          gear: ["Half court", "One ball"],
          objective: "Score five before your opponent.",
          steps: ["Check the ball up top.", "Everything counts one.", "Make it, take it.", "Call your own fouls."],
          win: "First to five wins the game. Win the final to take the event."
        } },
        { id: "5v5", label: "5v5", howto: {
          players: "Two teams of five",
          gear: ["Full court", "One ball", "A clock"],
          objective: "Be ahead when time runs out.",
          steps: ["Tip off to start.", "Twos inside the arc, threes beyond it.", "Clear past half on a change of possession.", "Call your own fouls.", "Two halves, running clock."],
          win: "Ahead at the horn wins.",
          house: "No hard contact."
        } }
      ] },
      spikeball: { name: "Spikeball", howto: {
        players: "Pairs",
        gear: ["Spikeball net", "One ball"],
        objective: "Force them to miss the net.",
        steps: ["Serve to the returner.", "Three touches to hit the net back.", "Move any direction after the serve.", "A miss or bad hit ends the point."],
        win: "To eleven, win by two, cap fifteen."
      } },
      pingpong: { name: "Ping Pong", howto: {
        players: "Solo",
        gear: ["Table", "Paddles", "One ball"],
        objective: "Win points until eleven.",
        steps: ["Rally for serve, then serve two and hand it over.", "Serve must clear the net and bounce once each side.", "Let it bounce once on your side before returning."],
        win: "Games to eleven, win by two. The winner of the final takes the event."
      } },
      foosball: { name: "Foosball", howto: {
        players: "Pairs",
        gear: ["Foosball table", "One ball"],
        objective: "Score on their goal, defend yours.",
        steps: ["Split the rods with your partner.", "Serve through the side hole.", "No spinning. A goal off a full spin does not count.", "A dead ball goes back to the serve."],
        win: "First pair to ten goals wins."
      } },
      volleyball: { name: "Volleyball", howto: {
        players: "Two teams",
        gear: ["Sand court", "Net", "One ball"],
        objective: "Ground the ball on their side.",
        steps: ["Serve from behind the line.", "Three touches a side, clean contact only.", "Rotate on every side-out.", "Every rally scores a point."],
        win: "Best two of three sets to fifteen, win by two, cap seventeen."
      } },
      pickleball: { name: "Pickleball", howto: {
        players: "Pairs",
        gear: ["Court", "Paddles", "One ball"],
        objective: "Win the rally without faulting in the kitchen.",
        steps: ["Serve underhand, cross court, past the kitchen.", "Let it bounce once each side before volleying.", "Stay out of the kitchen on volleys.", "Only the serving side scores."],
        win: "Games to eleven, win by two."
      } },
      beerio: { name: "Beerio Kart", howto: {
        players: "Heats of four",
        gear: ["Switch", "Four controllers", "A beer each"],
        objective: "Win the race, but finish your beer to count.",
        steps: ["Open a beer at the start line.", "Pull over to drink, no sipping while you steer.", "Finish the beer before the finish line, or wait there until it is gone."],
        win: "Best finishes advance to the final. Highest total wins."
      } },
      ragecage: { name: "Rage Cage", howto: {
        players: "Everyone, last standing",
        gear: ["A cup per player", "Center cup", "Two balls"],
        objective: "Sink your ball and pass it on before you get stacked.",
        steps: [
          "One cup each in a circle, the center cup filled by everyone. Two balls start on opposite sides.",
          "Bounce into your cup. Make it on the first try and pass to anyone; otherwise pass left.",
          "Make yours while the player to your left is still shooting and stack on them. Stacked players drink and are out.",
          "The last two go head to head. The loser drinks the center cup."
        ],
        win: "Last one standing takes 1st, the final loser 2nd, the third-to-last out 3rd. 1st and 2nd pay the same."
      } },
      where: { name: "Where and When", howto: {
        players: "Solo",
        gear: ["Your phone", "The TV"],
        objective: "Place each photo: where it was taken, and when.",
        steps: [
          "A photo from Brandon's past goes up on the TV and your phone.",
          "Drop a pin where it was taken and pick the date and hour. You can change it until the reveal.",
          "60 seconds a photo.",
          "Each photo scores up to 5,000 for where and 5,000 for when. 10 miles off is about 4,700; a month off about 3,900."
        ],
        win: "Highest total wins. A tie goes to more points for where, then to the faster guesses."
      } },
      trivia: { name: "Trivia", howto: {
        players: "Teams of three",
        gear: ["Your phone", "The TV"],
        objective: "Most points after every round.",
        steps: [
          "A question goes up on the TV and every phone.",
          "Your team shares one answer. Anyone on it can change it until one of you locks it in.",
          "A right answer scores 500, plus up to 500 the sooner your team locks.",
          "Closest number: the nearest team scores 1,000, the next 500. Exact scores 250 more."
        ],
        win: "Most points wins. A tie goes to the team that locked its scoring answers faster."
      } },
      poker: { name: "Poker", howto: {
        players: "Everyone, one table",
        gear: ["Cards", "Chips", "The clock"],
        objective: "Finish with the biggest stack.",
        steps: ["Whatever you have Saturday night is the stack you start the finale with.", "No-limit hold'em. Blinds rise on the clock.", "Bust and you are out.", "When the last level ends, count your stack."],
        win: "Chip leader takes the championship. Final chip counts are the final standings, and elimination order ranks the busts."
      } }
    };
    SLOT_META = [
      { label: "1st", team: "Winners", color: "var(--accent)" },
      { label: "2nd", team: "Runners-up", color: "var(--silver)" },
      { label: "3rd", team: "3rd place", color: "var(--bronze)" }
    ];
    OUTRIGHT_MULT = 2;
    wagerMult = (w) => w?.kind === "outright" ? Number.isInteger(w.mult) ? w.mult : OUTRIGHT_MULT : 1;
    SIZES = ["S", "M", "L", "XL", "XXL"];
    AIRLINES = ["WN", "AA", "UA", "DL", "AS", "B6", "NK", "F9"];
    CHIP_GRAY = "#6B6558";
    CHIP_COLORS = [
      { hex: "#C05B33" },
      { hex: "#D97742" },
      { hex: "#E39A3B" },
      { hex: "#D89C2F" },
      { hex: "#C9B25A" },
      { hex: "#A8A03F" },
      { hex: "#77804C" },
      { hex: "#4E6E39" },
      { hex: "#6E9450" },
      { hex: "#3F7D5C" },
      { hex: "#557B72" },
      { hex: "#2F7E83" },
      { hex: "#4F93A3" },
      { hex: "#3B6E9C" },
      { hex: "#5E7291" },
      { hex: "#6D6FA8" },
      { hex: "#7C5CA6" },
      { hex: "#8A4F62" },
      { hex: "#A6527C" },
      { hex: "#B23B5E" },
      { hex: "#B23B2E" },
      { hex: "#8E3B2F" },
      { hex: "#7A5C43" },
      { hex: "#A9663F" },
      { hex: "#B37A4A" },
      { hex: "#8C6A54" },
      { hex: "#6F6546" },
      { hex: "#4E4A3C" },
      { hex: "#9AA1A8" },
      { hex: "#B9AF9B" },
      { hex: "#D1C0A0" },
      { hex: "#E3D7BD" }
    ];
    CHIP_SKINS = [
      "ticks",
      "plain",
      "dash",
      "quad",
      "dots",
      "ring",
      "saw",
      "flame",
      "star",
      "bolt",
      "wave",
      "crown"
    ];
    EDITION = {
      name: "Scottsdale",
      year: 2026,
      label: "Scottsdale \xB7 2026",
      long: "October 30 to November 1, 2026",
      short: "Oct 30 to Nov 1"
    };
    LOGISTICS = {
      v: 2,
      venue: "10848 North Aberdeen Road, Scottsdale, AZ",
      venueNote: "",
      airport: "PHX",
      airportName: "Phoenix Sky Harbor",
      checkIn: "Fri Oct 30, 4:00 PM",
      checkOut: "Sun Nov 1, 10:00 AM",
      hostIn: { air: "WN", num: "4663", time: "08:40" },
      hostOut: { air: "UA", num: "1885", time: "20:37" }
    };
    EMPTY_STATE = {
      v: 9,
      live: false,
      results: {},
      wagers: [],
      wagerOps: {},
      adjustments: [],
      seeds: {},
      draws: {},
      brackets: {},
      stages: {},
      drafts: {},
      duels: [],
      poker: null,
      profiles: {},
      customEvents: [],
      shelved: {},
      away: {},
      onDeck: null,
      frozen: false,
      onboardEpoch: 0,
      eventEdits: {},
      eventOrder: [],
      eventOps: {},
      showControl: { active: null, history: [] },
      logistics: { ...LOGISTICS },
      prompts: { ballots: [], responses: {} },
      mvp: {},
      jerseysLocked: false,
      geoRounds: [],
      geo: null,
      triviaRounds: [],
      trivia: null,
      updatedAt: 0
    };
    RESET_PROGRESS_PRESERVED_KEYS = Object.freeze([
      "profiles",
      "seeds",
      "logistics",
      "onboardEpoch",
      "customEvents",
      "eventEdits",
      "eventOrder",
      /* D6: ballots are guest answers, not game progress */
      "prompts",
      /* the jersey order is placed once, whatever the games do */
      "jerseysLocked",
      /* Where and When's authored photos and answers are configuration; the
         game played on them (state.geo) is progress */
      "geoRounds",
      /* Trivia's set list (bank picks and the commissioner's own questions) is
         configuration; the game played on it (state.trivia) is progress */
      "triviaRounds"
    ]);
    shapeLabel = (fit2) => !fit2 ? "" : fit2.split && new Set(fit2.split).size > 1 ? fit2.split.join(" v ") : fit2.size === 1 ? `${fit2.teams} players` : `${fit2.teams} teams of ${fit2.size}`;
    disp = (state, p) => state.profiles?.[p]?.display || p;
    shuffle = (arr) => {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };
    snakeTeam = (k, T) => {
      const r = Math.floor(k / T), p = k % T;
      return r % 2 === 0 ? p : T - 1 - p;
    };
    TEAM_NAMES = MASCOTS.map((mascot) => `The ${mascot}`);
    pokerLive = (state) => {
      const pk = state.poker;
      return !!(pk && pk.startedAt && !state.results[pk.id]);
    };
    stacksPosted = (state) => Object.values(state.results || {}).some((r) => r?.stacks);
    CHIP_MIN = 25;
    POKER_CONFIG = Object.freeze({
      minimumStack: BUYIN_FLOOR,
      stackQuantum: PT,
      countQuantum: CHIP_MIN,
      maxStack: null,
      rounding: "exact",
      denominations: Object.freeze([1e3, 500, 100, 25]),
      blindPack: Object.freeze({ denomination: 25, count: 8, minimumStack: 400 }),
      /* small chips to play with before any 1000 is dealt */
      workingLayer: Object.freeze([Object.freeze({ v: 100, n: 10 }), Object.freeze({ v: 500, n: 2 })])
    });
    DUEL_LAPSE_MS = 10 * 60 * 1e3;
    duelAccepted = (duel) => !!duel && (!duel.consent || !!duel.acceptedAt);
    duelLapsed = (duel, now2 = Date.now()) => !!duel && duel.status === "open" && !duelAccepted(duel) && now2 - Number(duel.ts || 0) >= DUEL_LAPSE_MS;
    duelLapsesAt = (duel) => duel?.consent ? Number(duel.ts || 0) + DUEL_LAPSE_MS : null;
    duelOpen = (duel, now2 = Date.now()) => {
      const phase = duelPhase(duel, now2);
      return phase === "offered" || phase === "live";
    };
    duelBetween = (state, a, b, now2 = Date.now()) => (state?.duels || []).find((duel) => duelOpen(duel, now2) && duel.to && (duel.from === a && duel.to === b || duel.from === b && duel.to === a)) || null;
    DUEL_DAILY_LIMIT = 3;
    duelsSentToday = (state, player, now2 = Date.now()) => (state?.duels || []).filter((duel) => duel.from === player && Number(duel.ts || 0) > now2 - 24 * 60 * 60 * 1e3 && !["declined", "withdrawn", "lapsed"].includes(duelPhase(duel, now2))).length;
    postCountRuling = (a, stacksRes = null) => a.pokerRevision !== void 0 || !!stacksRes && a.ts > stacksRes.ts;
    postCountRulingApplies = (a, stacksRes) => !!stacksRes && (a.pokerRevision !== void 0 ? Number(a.pokerRevision) === Number(stacksRes.revision || 1) : a.ts > stacksRes.ts);
    MVP_PTS = PT;
    MVP_WINDOW_MS = 60 * 1e3;
    sameSet = (left, right) => Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((player) => right.includes(player));
    MAX_BRACKET = 16;
    ROUND_NAMES = {
      2: ["Final"],
      3: ["Semifinal", "Final"],
      4: ["Semifinals", "Final"],
      5: ["Play-in", "Semifinals", "Final"],
      6: ["Play-in", "Semifinals", "Final"],
      7: ["Quarterfinals", "Semifinals", "Final"],
      8: ["Quarterfinals", "Semifinals", "Final"]
    };
    for (let n = 9; n <= MAX_BRACKET; n++) ROUND_NAMES[n] = ["Round 1", "Quarterfinals", "Semifinals", "Final"];
    bracketRoundName = (size, r) => ROUND_NAMES[size]?.[r] || `Round ${r + 1}`;
    bracketChampion = (br) => {
      const last = br.rounds[br.rounds.length - 1][0];
      return last.winner ?? null;
    };
    EVENT_PHASE_LABELS = {
      scheduled: "Scheduled",
      setup: "Setup",
      "draw-pending": "Draw pending",
      "draw-revealed": "Draw revealed",
      "betting-open": "Betting open",
      "betting-locked": "Betting locked",
      "in-progress": "In progress",
      "result-entry": "Result entry",
      complete: "Complete",
      shelved: "Shelved"
    };
    eventOpOf = (state, evId) => state.eventOps?.[evId] || {};
    bracketStarted = (br) => !!br?.rounds?.some((round) => round.some((match) => match.winner !== null && match.winner !== void 0));
    stagesStarted = (st) => !!st && (st.finalWinner !== null && st.finalWinner !== void 0 || st.groups?.some((group) => (group.through || []).length > 0));
    needsStageSetup = (state, ev) => !!ev.stageCfg && !state.stages?.[ev.id] && !(!state.eventOps?.[ev.id]?.contest && (state.onDeck === ev.id || state.eventOps?.[ev.id]?.startedAt || state.eventOps?.[ev.id]?.bettingOpenedAt || state.eventOps?.[ev.id]?.bettingLockedAt || state.eventOps?.[ev.id]?.resultEntryAt));
    wideField = (contest) => contest?.kind === "ffa" && contest.sides.length > 2;
    contestMult = (contest) => wideField(contest) ? OUTRIGHT_MULT : 1;
    contestOfEntry = (evId, entry) => ({
      id: entry.id,
      eventId: evId,
      kind: entry.kind,
      match: entry.match,
      group: entry.group,
      stagesId: entry.stagesId,
      drawId: entry.drawId
    });
    contestUndoAvailability = (state, ev, now2 = Date.now()) => contestCorrectionAvailability(state, ev, null, now2);
    contestCorrections = (state, ev, now2 = Date.now()) => ev ? [...contestStackOf(state, ev.id)].reverse().map((entry) => contestCorrectionAvailability(state, ev, entry.id, now2)) : [];
    refundText = (state, refunds = []) => refunds.length ? `Returns ${refunds.map((item) => `${disp(state, item.player)} ${item.stake}`).join(", ")}` : "";
    duelPairText = (state, players = []) => players.filter(Boolean).map((player) => disp(state, player)).join(" vs ");
    lifecycleAction = (type, label2, blockers = []) => ({
      type,
      label: label2,
      enabled: blockers.length === 0,
      blockers
    });
  }
});

// src/ui/theme.js
var DISPLAY, SANS, BONE, GOLD_GRAD, label, pStyle;
var init_theme = __esm({
  "src/ui/theme.js"() {
    DISPLAY = "var(--fd-display)";
    SANS = "var(--fd-body)";
    BONE = "var(--bone)";
    GOLD_GRAD = "var(--sun)";
    label = { fontFamily: DISPLAY, fontWeight: 700, fontSize: 14, letterSpacing: "0.06em", color: "var(--muted2)", textTransform: "uppercase" };
    pStyle = { fontFamily: SANS, fontSize: 14, lineHeight: 1.6, color: "var(--muted2)", marginBottom: 14 };
  }
});

// src/lib/frameGate.js
function subscribeFrame(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
var REWIND_ACTIONS, JUMP_ACTIONS, INITIAL, frame, listeners, currentFrame;
var init_frameGate = __esm({
  "src/lib/frameGate.js"() {
    REWIND_ACTIONS = Object.freeze(/* @__PURE__ */ new Set([
      "clearResult",
      "correctContest",
      "undoLastContest",
      "voidWager",
      "voidDuel",
      "voidOpenDuels",
      "removeAdjustment",
      "undoDraftPick",
      "cancelDraft",
      "takeBackAnnouncement",
      "returnToLockerRoom",
      "resetTournament",
      "restoreEvent",
      "pokerCancel",
      "pokerUnbust",
      "clearDraw",
      "clearStages"
    ]));
    JUMP_ACTIONS = Object.freeze(/* @__PURE__ */ new Set(["qaAdvance", "qaRestore"]));
    INITIAL = Object.freeze({
      version: 0,
      seq: 0,
      fresh: false,
      live: false,
      correction: false,
      reason: "first",
      lastAction: null,
      at: 0
    });
    frame = INITIAL;
    listeners = /* @__PURE__ */ new Set();
    currentFrame = () => frame;
  }
});

// src/lib/serverClock.js
import { useEffect, useState } from "react";
var MAX_PLAUSIBLE_OFFSET_MS, offset, serverNow;
var init_serverClock = __esm({
  "src/lib/serverClock.js"() {
    MAX_PLAUSIBLE_OFFSET_MS = 12 * 60 * 60 * 1e3;
    offset = 0;
    serverNow = () => Date.now() + offset;
  }
});

// src/lib/motion.js
import React, { useCallback, useEffect as useEffect2, useLayoutEffect, useRef, useState as useState2, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
function useReducedMotion() {
  const [reduced, setReduced] = useState2(prefersReducedMotion);
  useEffect2(() => {
    const media = typeof window !== "undefined" ? window.matchMedia?.(QUERY) : null;
    if (!media) return void 0;
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);
  return reduced;
}
function cubicBezier(x1, y1, x2, y2) {
  const a = (p1, p2) => 1 - 3 * p2 + 3 * p1, b = (p1, p2) => 3 * p2 - 6 * p1, c = (p1) => 3 * p1;
  const at = (t, p1, p2) => ((a(p1, p2) * t + b(p1, p2)) * t + c(p1)) * t;
  const slope = (t, p1, p2) => 3 * a(p1, p2) * t * t + 2 * b(p1, p2) * t + c(p1);
  const solve = (x) => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const d = slope(t, x1, x2);
      if (Math.abs(d) < 1e-6) break;
      const next = t - (at(t, x1, x2) - x) / d;
      if (next < 0 || next > 1) break;
      t = next;
    }
    let lo = 0, hi = 1;
    for (let i = 0; i < 30 && Math.abs(at(t, x1, x2) - x) > 1e-5; i++) {
      if (at(t, x1, x2) < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return t;
  };
  return (x) => x <= 0 ? 0 : x >= 1 ? 1 : at(solve(x), y1, y2);
}
function useMotionFrame() {
  return useSyncExternalStore(subscribeFrame, currentFrame, currentFrame);
}
function freshChangeStep(committed, { value, key = null, frame: frame2, now: now2 = Date.now(), equals = Object.is }) {
  if (!committed) return { fresh: false, changeId: 0, from: value, to: value };
  if (key !== committed.key) return { fresh: false, changeId: committed.changeId, from: value, to: value };
  if (equals(value, committed.value)) return { fresh: false, changeId: committed.changeId, from: committed.from, to: committed.to };
  const byFrame = !!frame2?.fresh && frame2.seq !== committed.frameSeq && now2 - (frame2.at || 0) <= FRESH_WINDOW_MS;
  return byFrame ? { fresh: true, changeId: committed.changeId + 1, from: committed.value, to: value } : { fresh: false, changeId: committed.changeId, from: value, to: value };
}
function useFreshChange(value, key = null, { equals = Object.is } = {}) {
  const frame2 = useMotionFrame();
  const reduced = useReducedMotion();
  const committed = useRef(null);
  const step = freshChangeStep(committed.current, { value, key, frame: frame2, equals });
  useLayoutEffect(() => {
    committed.current = { value, key, frameSeq: frame2.seq, changeId: step.changeId, from: step.from, to: step.to };
  });
  return { ...step, animate: step.fresh && !reduced };
}
function registerFlightTarget(name, el) {
  if (!name || !el) return () => {
  };
  const set = targets.get(name) || /* @__PURE__ */ new Set();
  set.add(el);
  targets.set(name, set);
  return () => {
    set.delete(el);
    if (!set.size && targets.get(name) === set) targets.delete(name);
  };
}
function flightTarget(name) {
  const set = targets.get(name);
  if (!set) return null;
  const list = [...set].reverse();
  return list.find((el) => el.isConnected && rectVisible(rectOf(el))) || null;
}
function useFlightTarget(name) {
  const release = useRef(null);
  return useCallback((el) => {
    release.current?.();
    release.current = el ? registerFlightTarget(name, el) : null;
  }, [name]);
}
function rectVisible(rect, view = viewport()) {
  if (!rect || !(rect.width > 0) || !(rect.height > 0)) return false;
  return rect.left < view.width && rect.top < view.height && rect.left + rect.width > 0 && rect.top + rect.height > 0;
}
function flightKeyframes(from, to, { arc = 0, scale = "fit", fade = false, easing = EASE.out, frames = 16 } = {}) {
  const ease = parseBezier(easing) || easeFn.out;
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const end = scale === "fit" ? Math.min(to.width / from.width, to.height / from.height) : Number.isFinite(scale) ? scale : 1;
  const lift = Number(arc) || 0;
  return Array.from({ length: frames + 1 }, (_, i) => {
    const t = i / frames, e = ease(t);
    const x = dx * e;
    const y = dy * e - 4 * lift * e * (1 - e);
    const s = 1 + (end - 1) * e;
    const frame2 = { offset: t, transform: `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${s.toFixed(4)})` };
    if (fade) frame2.opacity = t < 0.7 ? 1 : Math.max(0, 1 - (t - 0.7) / 0.3);
    return frame2;
  });
}
function legKeyframes(base, a, b, { arc = 0, fade = false, easing = EASE.out, frames = 12 } = {}) {
  const ease = parseBezier(easing) || easeFn.out;
  const cx = (r) => r.left + r.width / 2, cy = (r) => r.top + r.height / 2;
  const fit2 = (r) => Math.min(r.width / base.width, r.height / base.height);
  const sa = fit2(a), sb = fit2(b), lift = Number(arc) || 0;
  return Array.from({ length: frames + 1 }, (_, i) => {
    const t = i / frames, e = ease(t);
    const x = cx(a) + (cx(b) - cx(a)) * e - cx(base);
    const y = cy(a) + (cy(b) - cy(a)) * e - 4 * lift * e * (1 - e) - cy(base);
    const s = sa + (sb - sa) * e;
    const frame2 = { offset: t, transform: `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${s.toFixed(4)})` };
    if (fade) frame2.opacity = t < 0.6 ? 1 : Math.max(0, 1 - (t - 0.6) / 0.4);
    return frame2;
  });
}
function flightLayer() {
  if (typeof document === "undefined") return null;
  if (layerEl?.isConnected) return layerEl;
  layerEl = document.getElementById("fd-flight-layer");
  if (!layerEl) {
    layerEl = document.createElement("div");
    layerEl.id = "fd-flight-layer";
    layerEl.className = "fd-flight-layer";
    layerEl.setAttribute("aria-hidden", "true");
    document.body.appendChild(layerEl);
  }
  return layerEl;
}
function coinBody(node, source) {
  const face = source?.querySelector?.(".fd-coin3d") || source;
  let color = "";
  try {
    color = window.getComputedStyle(face).getPropertyValue("--coin-color").trim();
  } catch {
  }
  return React.createElement(
    "span",
    { className: "fd-coin3d fd-coin3d-fly", style: color ? { "--coin-color": color } : void 0 },
    ...Array.from({ length: COIN_EDGE_LAYERS }, (_, i) => React.createElement("span", { key: i, className: "fd-coin3d-edge", style: { "--z": i + 1 } })),
    React.createElement("span", { key: "face", className: "fd-coin3d-face" }, node)
  );
}
function fly(from, to, options = {}) {
  const {
    node = null,
    duration = MOTION.flight,
    delay = 0,
    arc = 0,
    scale = "fit",
    fade = false,
    easing = EASE.out,
    land = false,
    hold = null
  } = options;
  const skip = Promise.resolve(false);
  if (typeof document === "undefined" || typeof window === "undefined") return skip;
  if (prefersReducedMotion() || document.hidden) return skip;
  if (flightsInAir >= MAX_FLIGHTS) return skip;
  const fromRect = rectOf(from), toRect = rectOf(to);
  if (!rectVisible(fromRect) || !rectVisible(toRect)) return skip;
  const layer = flightLayer();
  if (!layer) return skip;
  const coinFrom = coinEnd(from), coinTo = coinEnd(to);
  const coin = !!(coinFrom || coinTo) && !!node && React.isValidElement(node) && can3d();
  const shell = document.createElement("div");
  shell.className = coin ? "fd-flight is-coin" : "fd-flight";
  Object.assign(shell.style, {
    left: `${fromRect.left}px`,
    top: `${fromRect.top}px`,
    width: `${fromRect.width}px`,
    height: `${fromRect.height}px`
  });
  let unmountReact = null, mounted = Promise.resolve();
  if (node && React.isValidElement(node)) {
    if (!portalHost) return skip;
    const host = portalHost.add(shell, coin ? coinBody(node, coinFrom || coinTo) : node);
    unmountReact = host.remove;
    mounted = Promise.race([
      host.ready.then(() => true),
      new Promise((resolve) => setTimeout(() => resolve(false), 500))
    ]);
  } else {
    const source = node || (typeof from?.cloneNode === "function" ? from : null);
    if (!source) return skip;
    const copy = node ? source : source.cloneNode(true);
    copy.removeAttribute?.("id");
    shell.appendChild(copy);
  }
  layer.appendChild(shell);
  flightsInAir++;
  const frames = flightKeyframes(fromRect, toRect, { arc, scale, fade, easing });
  const done = () => {
    flightsInAir = Math.max(0, flightsInAir - 1);
    unmountReact?.();
    shell.remove();
  };
  shell.style.transform = frames[0].transform;
  return mounted.then((ok) => new Promise((resolve) => {
    if (ok === false) {
      done();
      resolve(false);
      return;
    }
    let animation;
    try {
      animation = shell.animate(frames, { duration, delay, easing: "linear", fill: "forwards" });
    } catch {
      done();
      resolve(false);
      return;
    }
    if (coin) {
      try {
        shell.firstElementChild?.animate(coinTurn(!coinFrom), { duration, delay, easing: EASE.out });
      } catch {
      }
    }
    const pulse = (dest, on) => {
      const target = typeof dest === "string" ? flightTarget(dest) : dest;
      if (on && typeof target?.animate === "function" && !prefersReducedMotion()) {
        const seat = coinEnd(target) ? target.querySelector(".fd-coin3d") : null;
        try {
          if (seat) seat.animate(COIN_SEAT, { duration: MOTION.pop * 1.4, easing: EASE.drum, composite: "add" });
          else target.animate(LAND_SQUASH, { duration: MOTION.pop, easing: EASE.out });
        } catch {
          try {
            target.animate(LAND_SQUASH, { duration: MOTION.pop, easing: EASE.out });
          } catch {
          }
        }
      }
    };
    animation.finished.then(() => {
      if (!hold) {
        done();
        pulse(to, land);
        resolve(true);
        return;
      }
      shell.classList.add("is-hover");
      let timer = 0;
      const capped = new Promise((settle) => {
        timer = setTimeout(() => settle(null), MAX_HOLD_MS);
      });
      Promise.race([Promise.resolve(hold).catch(() => null), capped]).then((next) => {
        clearTimeout(timer);
        shell.classList.remove("is-hover");
        const toRect2 = next?.to ? rectOf(next.to) : null;
        if (!toRect2 || !rectVisible(toRect2) || document.hidden || !shell.isConnected) {
          done();
          resolve(true);
          return;
        }
        let second;
        try {
          second = shell.animate(
            legKeyframes(fromRect, toRect, toRect2, next),
            { duration: next.duration ?? MOTION.flight, easing: "linear", fill: "forwards" }
          );
        } catch {
          done();
          resolve(true);
          return;
        }
        if (coin && coinEnd(next.to)) {
          try {
            shell.firstElementChild?.animate(coinTurn(true), { duration: next.duration ?? MOTION.flight, easing: EASE.out });
          } catch {
          }
        }
        second.finished.then(() => {
          try {
            next.onLand?.();
          } catch {
          }
          pulse(next.to, next.land);
          const child = next.settle && !prefersReducedMotion() ? shell.firstElementChild : null;
          let squash = null;
          try {
            squash = child?.animate?.(LAND_SQUASH, { duration: MOTION.pop, easing: EASE.out }) || null;
          } catch {
          }
          if (!squash) {
            done();
            resolve(true);
            return;
          }
          squash.finished.then(() => {
            done();
            resolve(true);
          }, () => {
            done();
            resolve(true);
          });
        }, () => {
          done();
          resolve(true);
        });
      });
    }, () => {
      done();
      resolve(false);
    });
  }));
}
function holdStage(id, { now: now2 = Date.now(), maxMs = MAX_STAGE_HOLD_MS } = {}) {
  if (!id) return () => {
  };
  const token = {};
  stageHolds.set(id, { token, until: now2 + maxMs });
  stageNotify();
  const timer = typeof setTimeout === "function" ? setTimeout(() => release(), maxMs) : 0;
  timer?.unref?.();
  function release() {
    clearTimeout(timer);
    if (stageHolds.get(id)?.token !== token) return;
    stageHolds.delete(id);
    stageNotify();
  }
  return release;
}
function useStageHold(id, active) {
  useEffect2(() => active && id ? holdStage(id) : void 0, [id, active]);
}
var MOTION, EASE, FRESH_WINDOW_MS, QUERY, prefersReducedMotion, parseBezier, easeFn, signedChips, targets, MAX_FLIGHTS, flightsInAir, rectOf, viewport, MAX_HOLD_MS, layerEl, portalHost, LAND_SQUASH, coinEnd, COIN_EDGE_LAYERS, can3d, coinTurn, COIN_SEAT, MAX_STAGE_HOLD_MS, stageHolds, stageSubs, stageNotify, BEAT_ANIMATIONS;
var init_motion = __esm({
  "src/lib/motion.js"() {
    init_core();
    init_frameGate();
    init_serverClock();
    MOTION = Object.freeze({
      fast: 140,
      // presses, small state flips
      base: 260,
      // standard enter, sheet rise, lock wipe
      story: 720,
      // a composed beat
      count: 750,
      // a number counts in PT steps
      delta: 1100,
      // the change rises off a number and fades
      rowSlide: 560,
      // standings rows move to their new rank
      rowStagger: 10,
      rankRoll: 200,
      // rank digits roll once rows land
      stamp: 320,
      // WON / CHAMPION stamps
      flight: 340,
      // a chip leaves the rack on an arc
      cardFlight: 520,
      // a drafted card flies to its seat
      pop: 320,
      // the catch-up pop when the link returns
      sheetIn: 260,
      sheetOut: 200,
      settleHold: 2400,
      // how long a settled result holds before the next beat
      beat: 2e3,
      // the shared heartbeat period
      reel: 240
      // a score-reel drum turns one digit
    });
    EASE = Object.freeze({
      out: "cubic-bezier(.2,.8,.2,1)",
      land: "cubic-bezier(.3,.7,.35,1.25)",
      exit: "cubic-bezier(.5,0,.75,.4)",
      drum: "cubic-bezier(.3,1.35,.5,1)"
      // a drum or coin settling on its detent
    });
    FRESH_WINDOW_MS = 1500;
    QUERY = "(prefers-reduced-motion: reduce)";
    prefersReducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.(QUERY)?.matches;
    parseBezier = (css) => {
      const m = /cubic-bezier\(([^)]+)\)/.exec(css || "");
      const v = m ? m[1].split(",").map(Number) : null;
      return v && v.length === 4 && v.every(Number.isFinite) ? cubicBezier(...v) : null;
    };
    easeFn = {
      out: parseBezier(EASE.out),
      land: parseBezier(EASE.land),
      exit: parseBezier(EASE.exit),
      cubicOut: (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3)
    };
    signedChips = (n) => {
      const v = Math.round(Number(n) || 0);
      return `${v > 0 ? "+" : v < 0 ? "\u2212" : ""}${Math.abs(v).toLocaleString("en-US")}`;
    };
    targets = /* @__PURE__ */ new Map();
    MAX_FLIGHTS = 24;
    flightsInAir = 0;
    rectOf = (source) => {
      if (!source) return null;
      if (typeof source === "string") {
        const el = flightTarget(source);
        return el ? rectOf(el) : null;
      }
      if (typeof source.getBoundingClientRect === "function") return source.isConnected === false ? null : source.getBoundingClientRect();
      if (["left", "top", "width", "height"].every((k) => Number.isFinite(source[k]))) return source;
      return null;
    };
    viewport = () => typeof window === "undefined" ? { width: 0, height: 0 } : { width: window.innerWidth || 0, height: window.innerHeight || 0 };
    MAX_HOLD_MS = 2e4;
    layerEl = null;
    portalHost = null;
    LAND_SQUASH = Object.freeze([
      { transform: "none" },
      { transform: "translateY(7px) scale(1.1, .9)", offset: 0.3 },
      { transform: "translateY(-2px) scale(.97, 1.03)", offset: 0.65 },
      { transform: "none" }
    ]);
    coinEnd = (end) => {
      const el = typeof end === "string" ? flightTarget(end) : end;
      return el?.dataset && "flyCoin" in el.dataset ? el : null;
    };
    COIN_EDGE_LAYERS = 5;
    can3d = () => typeof CSS === "undefined" || typeof CSS.supports !== "function" || CSS.supports("transform-style", "preserve-3d");
    coinTurn = (home) => home ? [{ transform: "rotateX(0deg)" }, { transform: "rotateX(360deg)" }] : [{ transform: "rotateY(0deg)" }, { transform: "rotateY(720deg)" }];
    COIN_SEAT = Object.freeze([{ transform: "rotateX(40deg)" }, { transform: "rotateX(0deg)" }]);
    MAX_STAGE_HOLD_MS = 6e3;
    stageHolds = /* @__PURE__ */ new Map();
    stageSubs = /* @__PURE__ */ new Set();
    stageNotify = () => stageSubs.forEach((fn) => fn());
    BEAT_ANIMATIONS = Object.freeze(/* @__PURE__ */ new Set(["fd-beat", "fd-beat-dot", "fd-beat-fill", "fd-beat-lamp"]));
  }
});

// src/ui/sheetMotion.js
import { useLayoutEffect as useLayoutEffect2 } from "react";
function noteUnmount() {
  if (unmountedThisCommit) return;
  unmountedThisCommit = true;
  queueMicrotask(() => {
    unmountedThisCommit = false;
  });
}
function sheetGhost(overlay, scrollTop = 0) {
  const ghost = overlay.cloneNode(true);
  ghost.classList.remove("is-swap");
  ghost.classList.add("is-leaving");
  ghost.setAttribute("aria-hidden", "true");
  ghost.setAttribute("inert", "");
  for (const el of ghost.querySelectorAll("[aria-modal],[role=dialog],[tabindex]")) {
    el.removeAttribute("aria-modal");
    el.removeAttribute("role");
    el.removeAttribute("tabindex");
  }
  const panel = ghost.querySelector(".si-sheet");
  return { ghost, panel, scrollTop };
}
function useSheetPresence(overlayRef, panelRef) {
  useLayoutEffect2(() => {
    const overlay = overlayRef.current, panel = panelRef.current;
    mountSeq++;
    if (unmountedThisCommit) overlay?.classList.add("is-swap");
    let scrollTop = 0;
    const onScroll = () => {
      scrollTop = panel.scrollTop;
    };
    panel?.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      panel?.removeEventListener("scroll", onScroll);
      noteUnmount();
      if (!overlay || typeof document === "undefined" || prefersReducedMotion()) return;
      if (panel?.isConnected) scrollTop = panel.scrollTop;
      const { ghost, panel: ghostPanel } = sheetGhost(overlay, scrollTop);
      document.body.appendChild(ghost);
      if (ghostPanel) ghostPanel.scrollTop = scrollTop;
      const seq = mountSeq;
      queueMicrotask(() => {
        if (mountSeq !== seq) {
          ghost.remove();
          return;
        }
        const falling = ghostPanel || ghost;
        falling.addEventListener("animationend", (event) => {
          if (event.target === falling) ghost.remove();
        });
        setTimeout(() => ghost.remove(), MOTION.sheetOut * 5);
      });
    };
  }, []);
}
var mountSeq, unmountedThisCommit;
var init_sheetMotion = __esm({
  "src/ui/sheetMotion.js"() {
    init_motion();
    mountSeq = 0;
    unmountedThisCommit = false;
  }
});

// src/ui/Icon.jsx
import React2, { useId } from "react";
function opticalStroke(size) {
  const px = typeof size === "number" ? size : 18;
  return px <= 14 ? 2.1 : px <= 18 ? 1.95 : px <= 26 ? 1.8 : px <= 36 ? 1.65 : 1.5;
}
function Icon({ name, size = 16, className = "", strokeWidth, lit = false }) {
  const def = ICONS[name];
  const mask = `fd-icon-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  if (!def) return null;
  const on = lit && def.lit;
  return /* @__PURE__ */ React2.createElement(
    "svg",
    {
      className: `fd-icon${on ? " is-lit" : ""}${className ? ` ${className}` : ""}`,
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: strokeWidth ?? opticalStroke(size),
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": "true",
      focusable: "false"
    },
    !on ? def.line : def.lit.cut ? /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("defs", null, /* @__PURE__ */ React2.createElement("mask", { id: mask, maskUnits: "userSpaceOnUse", x: "0", y: "0", width: "24", height: "24" }, /* @__PURE__ */ React2.createElement("rect", { width: "24", height: "24", fill: "#fff", stroke: "none" }), /* @__PURE__ */ React2.createElement("g", { stroke: "#000", fill: "none" }, def.lit.cut))), /* @__PURE__ */ React2.createElement("g", { mask: `url(#${mask})`, fill: "currentColor" }, def.lit.fill)) : /* @__PURE__ */ React2.createElement("g", { fill: "currentColor" }, def.lit.fill)
  );
}
var CHIP_TICKS, HOUSE, SPEAKER, CAMERA, STAR, PIN, PLANE, BOOK, CUP, STACK_TOP, ICONS, ICON_NAMES;
var init_Icon = __esm({
  "src/ui/Icon.jsx"() {
    CHIP_TICKS = [30, 90, 150, 210, 270, 330].map((deg) => {
      const a = deg * Math.PI / 180;
      const p = (r) => `${(12 + Math.cos(a) * r).toFixed(2)} ${(12 + Math.sin(a) * r).toFixed(2)}`;
      return `M${p(5.5)}L${p(6.6)}`;
    }).join("");
    HOUSE = "M4.5 10.3 12 4.2l7.5 6.1v8.2a1.5 1.5 0 0 1-1.5 1.5H6a1.5 1.5 0 0 1-1.5-1.5z";
    SPEAKER = "M4 9.4h3.1L12 5.6v12.8l-4.9-3.8H4z";
    CAMERA = "M3.5 8.6A2.1 2.1 0 0 1 5.6 6.5h2.1l1.7-2.4h5.2l1.7 2.4h2.1a2.1 2.1 0 0 1 2.1 2.1v9.3a2.1 2.1 0 0 1-2.1 2.1H5.6a2.1 2.1 0 0 1-2.1-2.1z";
    STAR = "M12 3.7l2.55 5.2 5.7.82-4.13 4.03.98 5.68L12 16.75l-5.1 2.68.98-5.68L3.75 9.72l5.7-.82z";
    PIN = "M12 20.8s-6.4-5.5-6.4-10.7a6.4 6.4 0 0 1 12.8 0c0 5.2-6.4 10.7-6.4 10.7z";
    PLANE = "M12 3.2c.85 0 1.35.95 1.35 2.2v4.3l6.9 4.1v1.9l-6.9-2.1v4.1l2.1 1.6v1.5L12 20l-3.45.8v-1.5l2.1-1.6v-4.1l-6.9 2.1v-1.9l6.9-4.1V5.4c0-1.25.5-2.2 1.35-2.2z";
    BOOK = "M12 6.6C10 5.1 7 4.6 4 5.2v13.6c3-.6 6-.1 8 1.4 2-1.5 5-2 8-1.4V5.2c-3-.6-6-.1-8 1.4z";
    CUP = "M7.5 4.4h9v4.9a4.5 4.5 0 0 1-9 0z";
    STACK_TOP = "M5 8.2c0-1.66 3.13-3 7-3s7 1.34 7 3-3.13 3-7 3-7-1.34-7-3z";
    ICONS = {
      /* the tab bar */
      home: {
        line: /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("path", { d: HOUSE }), /* @__PURE__ */ React2.createElement("path", { d: "M10 20v-4.4a2 2 0 0 1 4 0V20" })),
        lit: { fill: /* @__PURE__ */ React2.createElement("path", { d: HOUSE }), cut: /* @__PURE__ */ React2.createElement("path", { d: "M10.1 21v-5.3a1.9 1.9 0 0 1 3.8 0V21z", fill: "#000", stroke: "none" }) }
      },
      events: {
        line: /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("circle", { cx: "5.6", cy: "6.5", r: "1.7" }), /* @__PURE__ */ React2.createElement("circle", { cx: "5.6", cy: "12", r: "1.7" }), /* @__PURE__ */ React2.createElement("circle", { cx: "5.6", cy: "17.5", r: "1.7" }), /* @__PURE__ */ React2.createElement("path", { d: "M10.2 6.5h9.3M10.2 12h9.3M10.2 17.5h6.3" })),
        lit: { fill: /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("circle", { cx: "5.6", cy: "6.5", r: "2.1" }), /* @__PURE__ */ React2.createElement("circle", { cx: "5.6", cy: "12", r: "2.1" }), /* @__PURE__ */ React2.createElement("circle", { cx: "5.6", cy: "17.5", r: "2.1" }), /* @__PURE__ */ React2.createElement("path", { d: "M10.2 6.5h9.3M10.2 12h9.3M10.2 17.5h6.3", fill: "none", strokeWidth: "2.4" })), cut: null }
      },
      bets: {
        line: /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("circle", { cx: "12", cy: "12", r: "8.6" }), /* @__PURE__ */ React2.createElement("circle", { cx: "12", cy: "12", r: "2.9" }), /* @__PURE__ */ React2.createElement("path", { d: CHIP_TICKS })),
        lit: { fill: /* @__PURE__ */ React2.createElement("circle", { cx: "12", cy: "12", r: "8.6" }), cut: /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("circle", { cx: "12", cy: "12", r: "2.9" }), /* @__PURE__ */ React2.createElement("path", { d: CHIP_TICKS })) }
      },
      weekend: {
        line: /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("path", { d: "M6.6 16.4a5.4 5.4 0 0 1 10.8 0" }), /* @__PURE__ */ React2.createElement("path", { d: "M3.5 16.4h17M7.5 20h9M12 5.2v2M5.9 8.1l1.4 1.4M18.1 8.1l-1.4 1.4" })),
        lit: { fill: /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("path", { d: "M6.2 16.4a5.8 5.8 0 0 1 11.6 0z" }), /* @__PURE__ */ React2.createElement("path", { d: "M3.5 16.4h17M7.5 20h9M12 5.2v2M5.9 8.1l1.4 1.4M18.1 8.1l-1.4 1.4", fill: "none" })), cut: null }
      },
      /* movement */
      next: { line: /* @__PURE__ */ React2.createElement("path", { d: "m9.5 5.5 6.5 6.5-6.5 6.5" }) },
      back: { line: /* @__PURE__ */ React2.createElement("path", { d: "m14.5 5.5-6.5 6.5 6.5 6.5" }) },
      expand: { line: /* @__PURE__ */ React2.createElement("path", { d: "m5.5 9.5 6.5 6.5 6.5-6.5" }) },
      collapse: { line: /* @__PURE__ */ React2.createElement("path", { d: "m5.5 14.5 6.5-6.5 6.5 6.5" }) },
      open: { line: /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("path", { d: "M7.4 16.6 16.4 7.6" }), /* @__PURE__ */ React2.createElement("path", { d: "M9.2 7.6h7.2v7.2" })) },
      then: { line: /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("path", { d: "M4.5 12h14.6" }), /* @__PURE__ */ React2.createElement("path", { d: "m13.6 6.5 5.5 5.5-5.5 5.5" })) },
      up: { line: /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("path", { d: "M12 19.5V4.9" }), /* @__PURE__ */ React2.createElement("path", { d: "m6.5 10.4 5.5-5.5 5.5 5.5" })) },
      down: { line: /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("path", { d: "M12 4.5v14.6" }), /* @__PURE__ */ React2.createElement("path", { d: "m6.5 13.6 5.5 5.5 5.5-5.5" })) },
      /* marks */
      check: {
        line: /* @__PURE__ */ React2.createElement("path", { d: "m4.9 12.7 4.5 4.5 9.7-9.9" }),
        lit: { fill: /* @__PURE__ */ React2.createElement("circle", { cx: "12", cy: "12", r: "9.2" }), cut: /* @__PURE__ */ React2.createElement("path", { d: "m7.6 12.4 3 3 5.9-6.1" }) }
      },
      close: {
        line: /* @__PURE__ */ React2.createElement("path", { d: "m6.6 6.6 10.8 10.8M17.4 6.6 6.6 17.4" }),
        lit: { fill: /* @__PURE__ */ React2.createElement("circle", { cx: "12", cy: "12", r: "9.2" }), cut: /* @__PURE__ */ React2.createElement("path", { d: "m8.6 8.6 6.8 6.8M15.4 8.6l-6.8 6.8" }) }
      },
      plus: {
        line: /* @__PURE__ */ React2.createElement("path", { d: "M12 5v14M5 12h14" }),
        lit: { fill: /* @__PURE__ */ React2.createElement("circle", { cx: "12", cy: "12", r: "9.2" }), cut: /* @__PURE__ */ React2.createElement("path", { d: "M12 7.6v8.8M7.6 12h8.8" }) }
      },
      minus: { line: /* @__PURE__ */ React2.createElement("path", { d: "M5 12h14" }) },
      more: { line: /* @__PURE__ */ React2.createElement("g", { fill: "currentColor", stroke: "none" }, /* @__PURE__ */ React2.createElement("circle", { cx: "5", cy: "12", r: "1.75" }), /* @__PURE__ */ React2.createElement("circle", { cx: "12", cy: "12", r: "1.75" }), /* @__PURE__ */ React2.createElement("circle", { cx: "19", cy: "12", r: "1.75" })) },
      /* the app's menu (the header's More options): three bars, never the
         pill's dots, which open the next step's alternatives */
      menu: { line: /* @__PURE__ */ React2.createElement("path", { d: "M4.5 7h15M4.5 12h15M4.5 17h10" }) },
      star: { line: /* @__PURE__ */ React2.createElement("path", { d: STAR }), lit: { fill: /* @__PURE__ */ React2.createElement("path", { d: STAR }), cut: null } },
      search: { line: /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("circle", { cx: "10.6", cy: "10.6", r: "6.1" }), /* @__PURE__ */ React2.createElement("path", { d: "m15.2 15.2 4.9 4.9" })) },
      /* media and sound */
      song: {
        line: /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("path", { d: "M9 17.4V5.9l10-2v11.4" }), /* @__PURE__ */ React2.createElement("circle", { cx: "6.5", cy: "17.4", r: "2.5" }), /* @__PURE__ */ React2.createElement("circle", { cx: "16.5", cy: "15.3", r: "2.5" })),
        lit: { fill: /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("path", { d: "M9 17.4V5.9l10-2v11.4", fill: "none" }), /* @__PURE__ */ React2.createElement("circle", { cx: "6.5", cy: "17.4", r: "2.5" }), /* @__PURE__ */ React2.createElement("circle", { cx: "16.5", cy: "15.3", r: "2.5" }), /* @__PURE__ */ React2.createElement("path", { d: "M9 6l10-2v3.2L9 9.2z" })), cut: null }
      },
      sound: {
        line: /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("path", { d: SPEAKER }), /* @__PURE__ */ React2.createElement("path", { d: "M15.4 9.3a3.9 3.9 0 0 1 0 5.4M18.2 6.7a7.6 7.6 0 0 1 0 10.6" })),
        lit: { fill: /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("path", { d: SPEAKER }), /* @__PURE__ */ React2.createElement("path", { d: "M15.4 9.3a3.9 3.9 0 0 1 0 5.4M18.2 6.7a7.6 7.6 0 0 1 0 10.6", fill: "none" })), cut: null }
      },
      mute: {
        line: /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("path", { d: SPEAKER }), /* @__PURE__ */ React2.createElement("path", { d: "m15.6 9.5 5 5M20.6 9.5l-5 5" })),
        lit: { fill: /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("path", { d: SPEAKER }), /* @__PURE__ */ React2.createElement("path", { d: "m15.6 9.5 5 5M20.6 9.5l-5 5", fill: "none" })), cut: null }
      },
      play: { line: /* @__PURE__ */ React2.createElement("path", { d: "M8 5.6v12.8l10.2-6.4z", fill: "currentColor" }) },
      pause: { line: /* @__PURE__ */ React2.createElement("path", { d: "M7.6 5.6h2.4v12.8H7.6zM14 5.6h2.4v12.8H14z", fill: "currentColor" }) },
      stop: { line: /* @__PURE__ */ React2.createElement("rect", { x: "6.4", y: "6.4", width: "11.2", height: "11.2", rx: "1.6", fill: "currentColor" }) },
      camera: {
        line: /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("path", { d: CAMERA }), /* @__PURE__ */ React2.createElement("circle", { cx: "12", cy: "13.1", r: "3.5" })),
        lit: { fill: /* @__PURE__ */ React2.createElement("path", { d: CAMERA }), cut: /* @__PURE__ */ React2.createElement("circle", { cx: "12", cy: "13.1", r: "3.5" }) }
      },
      photo: {
        line: /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("rect", { x: "3.5", y: "4.6", width: "17", height: "14.8", rx: "2.1" }), /* @__PURE__ */ React2.createElement("path", { d: "m3.8 16.6 4.6-4.6 4 4 2.6-2.6 5.2 5.2" }), /* @__PURE__ */ React2.createElement("circle", { cx: "15.6", cy: "9.4", r: "1.5" })),
        lit: { fill: /* @__PURE__ */ React2.createElement("rect", { x: "3.5", y: "4.6", width: "17", height: "14.8", rx: "2.1" }), cut: /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("path", { d: "m3.8 16.6 4.6-4.6 4 4 2.6-2.6 5.2 5.2" }), /* @__PURE__ */ React2.createElement("circle", { cx: "15.6", cy: "9.4", r: "1.5", fill: "#000" })) }
      },
      tv: {
        line: /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("rect", { x: "3", y: "7", width: "18", height: "12.4", rx: "2.1" }), /* @__PURE__ */ React2.createElement("path", { d: "m8.5 2.9 3.5 3.5 3.5-3.5" })),
        lit: { fill: /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("rect", { x: "3", y: "7", width: "18", height: "12.4", rx: "2.1" }), /* @__PURE__ */ React2.createElement("path", { d: "m8.5 2.9 3.5 3.5 3.5-3.5", fill: "none" })), cut: null }
      },
      /* the weekend */
      trophy: {
        line: /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("path", { d: CUP }), /* @__PURE__ */ React2.createElement("path", { d: "M7.5 6.5H5.4a2.6 2.6 0 0 0 2.6 4M16.5 6.5h2.1a2.6 2.6 0 0 1-2.6 4M12 13.8v3.2M8.6 20h6.8" })),
        lit: { fill: /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("path", { d: CUP }), /* @__PURE__ */ React2.createElement("path", { d: "M7.5 6.5H5.4a2.6 2.6 0 0 0 2.6 4M16.5 6.5h2.1a2.6 2.6 0 0 1-2.6 4M12 13.8v3.2M8.6 20h6.8", fill: "none" })), cut: null }
      },
      pin: {
        line: /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("path", { d: PIN }), /* @__PURE__ */ React2.createElement("circle", { cx: "12", cy: "10.1", r: "2.4" })),
        lit: { fill: /* @__PURE__ */ React2.createElement("path", { d: PIN }), cut: /* @__PURE__ */ React2.createElement("circle", { cx: "12", cy: "10.1", r: "2.4", fill: "#000", stroke: "none" }) }
      },
      plane: { line: /* @__PURE__ */ React2.createElement("path", { d: PLANE }), lit: { fill: /* @__PURE__ */ React2.createElement("path", { d: PLANE }), cut: null } },
      /* the house: adobe, flat roof, its vigas and an arched door */
      house: {
        line: /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("path", { d: "M5 20V10.4a1.6 1.6 0 0 1 1.6-1.6h10.8a1.6 1.6 0 0 1 1.6 1.6V20" }), /* @__PURE__ */ React2.createElement("path", { d: "M3.4 20h17.2M3.6 11.6H5M19 11.6h1.4" }), /* @__PURE__ */ React2.createElement("path", { d: "M10 20v-3.8a2 2 0 0 1 4 0V20" })),
        lit: {
          fill: /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("path", { d: "M5 20V10.4a1.6 1.6 0 0 1 1.6-1.6h10.8a1.6 1.6 0 0 1 1.6 1.6V20z" }), /* @__PURE__ */ React2.createElement("path", { d: "M3.4 20h17.2M3.6 11.6H5M19 11.6h1.4", fill: "none" })),
          cut: /* @__PURE__ */ React2.createElement("path", { d: "M10.1 19.2v-3a1.9 1.9 0 0 1 3.8 0v3z", fill: "#000", stroke: "none" })
        }
      },
      rules: {
        line: /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("path", { d: BOOK }), /* @__PURE__ */ React2.createElement("path", { d: "M12 6.6v13.6" })),
        lit: { fill: /* @__PURE__ */ React2.createElement("path", { d: BOOK }), cut: /* @__PURE__ */ React2.createElement("path", { d: "M12 6.2v14.4" }) }
      },
      games: {
        line: /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("rect", { x: "4.4", y: "4.4", width: "15.2", height: "15.2", rx: "3.4" }), /* @__PURE__ */ React2.createElement("g", { fill: "currentColor", stroke: "none" }, /* @__PURE__ */ React2.createElement("circle", { cx: "8.7", cy: "8.7", r: "1.35" }), /* @__PURE__ */ React2.createElement("circle", { cx: "12", cy: "12", r: "1.35" }), /* @__PURE__ */ React2.createElement("circle", { cx: "15.3", cy: "15.3", r: "1.35" }))),
        lit: {
          fill: /* @__PURE__ */ React2.createElement("rect", { x: "4.4", y: "4.4", width: "15.2", height: "15.2", rx: "3.4" }),
          cut: /* @__PURE__ */ React2.createElement("g", { fill: "#000", stroke: "none" }, /* @__PURE__ */ React2.createElement("circle", { cx: "8.7", cy: "8.7", r: "1.45" }), /* @__PURE__ */ React2.createElement("circle", { cx: "12", cy: "12", r: "1.45" }), /* @__PURE__ */ React2.createElement("circle", { cx: "15.3", cy: "15.3", r: "1.45" }))
        }
      },
      payouts: {
        line: /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("path", { d: STACK_TOP }), /* @__PURE__ */ React2.createElement("path", { d: "M5 8.2v3.9c0 1.66 3.13 3 7 3s7-1.34 7-3V8.2M5 12.1V16c0 1.66 3.13 3 7 3s7-1.34 7-3v-3.9" })),
        lit: {
          fill: /* @__PURE__ */ React2.createElement("path", { d: "M5 8.2c0-1.66 3.13-3 7-3s7 1.34 7 3V16c0 1.66-3.13 3-7 3s-7-1.34-7-3z" }),
          cut: /* @__PURE__ */ React2.createElement("path", { d: "M5 8.2c0 1.66 3.13 3 7 3s7-1.34 7-3M5 12.1c0 1.66 3.13 3 7 3s7-1.34 7-3" })
        }
      },
      awards: {
        line: /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("circle", { cx: "12", cy: "14.6", r: "5" }), /* @__PURE__ */ React2.createElement("path", { d: "M8.9 10.7 6.6 3.8h3.6l1.8 5M15.1 10.7l2.3-6.9h-3.6l-1.8 5" })),
        lit: {
          fill: /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("circle", { cx: "12", cy: "14.6", r: "5" }), /* @__PURE__ */ React2.createElement("path", { d: "M8.9 10.7 6.6 3.8h3.6l1.8 5M15.1 10.7l2.3-6.9h-3.6l-1.8 5", fill: "none" })),
          cut: /* @__PURE__ */ React2.createElement("circle", { cx: "12", cy: "14.6", r: "2", fill: "#000", stroke: "none" })
        }
      },
      /* the menus and the commissioner's controls */
      person: {
        line: /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("circle", { cx: "12", cy: "8.4", r: "3.9" }), /* @__PURE__ */ React2.createElement("path", { d: "M4.6 20.2a7.4 7.4 0 0 1 14.8 0" })),
        lit: { fill: /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("circle", { cx: "12", cy: "8.4", r: "3.9" }), /* @__PURE__ */ React2.createElement("path", { d: "M4.6 20.2a7.4 7.4 0 0 1 14.8 0z" })), cut: null }
      },
      people: { line: /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("circle", { cx: "9", cy: "8.6", r: "3.4" }), /* @__PURE__ */ React2.createElement("path", { d: "M2.9 19.6a6.1 6.1 0 0 1 12.2 0" }), /* @__PURE__ */ React2.createElement("path", { d: "M15.4 5.5a3.3 3.3 0 0 1 0 6.3M17.6 13.9a6.1 6.1 0 0 1 3.5 5.7" })) },
      /* skip: a step past the line */
      skip: { line: /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("path", { d: "m5.5 6 6.5 6-6.5 6" }), /* @__PURE__ */ React2.createElement("path", { d: "m12 6 6.5 6-6.5 6" }), /* @__PURE__ */ React2.createElement("path", { d: "M20.5 5.5v13" })) },
      undo: { line: /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("path", { d: "M8.6 5.4 4.4 9.6l4.2 4.2" }), /* @__PURE__ */ React2.createElement("path", { d: "M4.6 9.6h9.6a5.4 5.4 0 0 1 0 10.8H9.6" })) },
      /* the next suggestions (team names) */
      shuffle: { line: /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("path", { d: "M3.8 7.4h3.4c2.2 0 3.6 1.2 4.8 3.4l1 1.9c1.2 2.2 2.6 3.4 4.8 3.4h2.4" }), /* @__PURE__ */ React2.createElement("path", { d: "M3.8 16.6h3.4c1.5 0 2.6-.5 3.5-1.5" }), /* @__PURE__ */ React2.createElement("path", { d: "M13.5 8.9c.9-1 2-1.5 3.5-1.5h2.4" }), /* @__PURE__ */ React2.createElement("path", { d: "m17.6 4.9 2.6 2.5-2.6 2.5M17.6 14.1l2.6 2.5-2.6 2.5" })) },
      /* write your own */
      pencil: { line: /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("path", { d: "M15.6 4.8a2 2 0 0 1 2.8 0l.8.8a2 2 0 0 1 0 2.8L9 18.6l-4.4 1 1-4.4z" }), /* @__PURE__ */ React2.createElement("path", { d: "m13.8 6.6 3.6 3.6" })) },
      /* the rehearsal flask */
      flask: {
        line: /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("path", { d: "M9.4 3.6h5.2M10.2 3.6v5.6L4.9 18.3a1.4 1.4 0 0 0 1.2 2.1h11.8a1.4 1.4 0 0 0 1.2-2.1l-5.3-9.1V3.6" }), /* @__PURE__ */ React2.createElement("path", { d: "M7.2 14.4h9.6" })),
        lit: { fill: /* @__PURE__ */ React2.createElement("path", { d: "M10.2 3.6h3.6v5.6l5.3 9.1a1.4 1.4 0 0 1-1.2 2.1H6.1a1.4 1.4 0 0 1-1.2-2.1l5.3-9.1z" }), cut: /* @__PURE__ */ React2.createElement("path", { d: "M7.2 14.4h9.6" }) }
      },
      exit: { line: /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("path", { d: "M13.4 4.4H6.6a1.6 1.6 0 0 0-1.6 1.6v12a1.6 1.6 0 0 0 1.6 1.6h6.8" }), /* @__PURE__ */ React2.createElement("path", { d: "M10.4 12h10M16.6 8.2l3.8 3.8-3.8 3.8" })) },
      lock: {
        line: /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("rect", { x: "5", y: "10.4", width: "14", height: "10", rx: "2" }), /* @__PURE__ */ React2.createElement("path", { d: "M8.2 10.4V7.6a3.8 3.8 0 0 1 7.6 0v2.8" })),
        lit: { fill: /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("rect", { x: "5", y: "10.4", width: "14", height: "10", rx: "2" }), /* @__PURE__ */ React2.createElement("path", { d: "M8.2 10.4V7.6a3.8 3.8 0 0 1 7.6 0v2.8", fill: "none" })), cut: null }
      }
    };
    ICONS.list = ICONS.events;
    ICON_NAMES = Object.freeze(Object.keys(ICONS));
  }
});

// src/ui/backglass.css
var init_backglass = __esm({
  "src/ui/backglass.css"() {
  }
});

// src/ui/OneSafe.jsx
import React3 from "react";
function oneSafeParts(text, { all = false } = {}) {
  const value = String(text ?? "");
  if (all) return value.includes("1") ? value.split(/(1)/).filter((part) => part !== "") : [value];
  if (!LONE_ONE.test(value) || !/[A-Za-z]/.test(value)) return [value];
  return value.split(/((?<![\d,.])1(?![\d,.]))/).filter((part) => part !== "");
}
function OneSafe({ text, all = false }) {
  const parts = oneSafeParts(text, { all });
  if (parts.length === 1 && !(all && parts[0] === "1")) return parts[0];
  return /* @__PURE__ */ React3.createElement(React3.Fragment, null, parts.map((part, i) => part === "1" ? /* @__PURE__ */ React3.createElement("span", { className: "fd-one", key: i }, "1") : part));
}
function EventName({ name }) {
  const value = String(name ?? "");
  if (!/\d/.test(value)) return value;
  return /* @__PURE__ */ React3.createElement("span", { className: "fd-keep-case" }, /* @__PURE__ */ React3.createElement(OneSafe, { text: value }));
}
var LONE_ONE;
var init_OneSafe = __esm({
  "src/ui/OneSafe.jsx"() {
    init_backglass();
    LONE_ONE = /(?<![\d,.])1(?![\d,.])/;
  }
});

// src/ui/menu.css
var init_menu = __esm({
  "src/ui/menu.css"() {
  }
});

// src/ui/Menu.jsx
import React4, { useRef as useRef2, useState as useState3 } from "react";
var init_Menu = __esm({
  "src/ui/Menu.jsx"() {
    init_Icon();
    init_menu();
  }
});

// src/ui/controls.jsx
import React5, { createContext, useContext, useState as useState4, useEffect as useEffect3, useRef as useRef3 } from "react";
function Tag({ children, tone = "dim", style }) {
  const tones = {
    dim: { color: "var(--muted)", background: "var(--ink-tint)" },
    gold: { color: "var(--accent2)", background: "var(--accent-tint)" },
    flame: { color: "var(--live2)", background: "rgba(192,71,58,0.14)" },
    green: { color: "var(--green)", background: "var(--green-tint)" }
  };
  return /* @__PURE__ */ React5.createElement("span", { style: {
    fontFamily: DISPLAY,
    fontWeight: 700,
    fontSize: 13,
    letterSpacing: "0.05em",
    padding: "3px 8px",
    borderRadius: 6,
    textTransform: "uppercase",
    ...tones[tone],
    ...style
  } }, children);
}
function ActionButton({ children, onClick, variant = "primary", pending, disabled, compact, style, ...props }) {
  const [busy, setBusy] = useState4(false);
  const busyRef = useRef3(false);
  const waiting = !!pending || busy;
  const off = disabled || waiting;
  const handle = (event) => {
    if (off || busyRef.current || !onClick) return;
    busyRef.current = true;
    const finish = () => {
      busyRef.current = false;
      setBusy(false);
    };
    try {
      const result = onClick(event);
      if (result && typeof result.then === "function") {
        setBusy(true);
        return Promise.resolve(result).then((value) => {
          finish();
          return value;
        }, finish);
      }
      busyRef.current = false;
      return result;
    } catch (error) {
      busyRef.current = false;
      throw error;
    }
  };
  return /* @__PURE__ */ React5.createElement(
    "button",
    {
      onClick: handle,
      disabled: off,
      "aria-busy": waiting || void 0,
      ...props,
      style: {
        fontFamily: SANS,
        fontWeight: 600,
        letterSpacing: "0",
        fontSize: compact ? 13 : 15,
        padding: compact ? "8px 12px" : "12px 16px",
        borderRadius: 8,
        minHeight: compact ? 44 : 48,
        boxShadow: "var(--glass-edge)",
        cursor: off ? "default" : "pointer",
        opacity: disabled ? 0.35 : waiting ? 0.6 : 1,
        transition: "transform .1s, opacity .15s",
        ...ACTION_VARIANTS[variant],
        ...style
      }
    },
    children
  );
}
function IconButton({ label: label2, onClick, size = 38, selected, disabled, style, children, ...props }) {
  return /* @__PURE__ */ React5.createElement(
    "button",
    {
      onClick,
      disabled,
      "aria-label": label2,
      title: label2,
      ...props,
      style: {
        width: size,
        height: size,
        borderRadius: 5,
        flexShrink: 0,
        cursor: disabled ? "default" : "pointer",
        background: selected ? "var(--info-tint)" : "transparent",
        border: "1px solid " + (selected ? "var(--lamp-info)" : "var(--line)"),
        color: selected ? "var(--lamp-info)" : "var(--ink)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.35 : 1,
        ...style
      }
    },
    children
  );
}
function Btn({ kind = "primary", ...props }) {
  return /* @__PURE__ */ React5.createElement(ActionButton, { variant: BTN_KIND_VARIANT[kind], ...props });
}
function Sheet({
  title,
  subtitle,
  headerActions,
  onClose,
  onBack,
  children,
  wide,
  busy = false,
  className = "",
  layer = 100,
  show = false,
  heading = true
}) {
  const dialog = useRef3(null);
  const overlay = useRef3(null);
  useSheetPresence(overlay, dialog);
  const dock = useContext(SheetDock);
  const current = useRef3({ busy, onClose });
  current.current = { busy, onClose };
  useEffect3(() => {
    const previousFocus = document.activeElement;
    if (!openSheets++) {
      pageOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    const node = dialog.current;
    node?.focus({ preventScroll: true });
    const keys = (event) => {
      const sheets = document.querySelectorAll('[aria-modal="true"]');
      if (sheets[sheets.length - 1] !== node) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (!current.current.busy) current.current.onClose?.();
      }
      if (event.key !== "Tab") return;
      const focusable = [...node.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]')].filter((element) => element.getClientRects().length && !element.closest("[inert]"));
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (!first) {
        event.preventDefault();
        node.focus();
      } else if (!focusable.includes(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", keys);
    return () => {
      document.removeEventListener("keydown", keys);
      if (!--openSheets) document.body.style.overflow = pageOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);
  return /* @__PURE__ */ React5.createElement("div", { ref: overlay, className: "fd-sheet-overlay", onClick: busy ? void 0 : onClose, style: { zIndex: layer } }, /* @__PURE__ */ React5.createElement(
    "div",
    {
      ref: dialog,
      tabIndex: -1,
      onClick: (e) => e.stopPropagation(),
      className: `si-sheet${wide ? " is-wide" : ""} ${className}`,
      role: "dialog",
      "aria-modal": "true",
      "aria-label": title,
      "aria-busy": busy || void 0
    },
    /* @__PURE__ */ React5.createElement("div", { className: "fd-sheet-header" }, onBack && /* @__PURE__ */ React5.createElement(
      IconButton,
      {
        label: "Back",
        onClick: onBack,
        size: 44,
        disabled: busy,
        style: { marginLeft: -6, border: 0 }
      },
      /* @__PURE__ */ React5.createElement("span", { style: { display: "flex", transform: "scaleX(-1)" } }, /* @__PURE__ */ React5.createElement(Icon, { name: "next", size: 20 }))
    ), heading ? /* @__PURE__ */ React5.createElement("div", { className: `fd-sheet-heading${show ? " is-show" : ""}` }, /* @__PURE__ */ React5.createElement("div", null, typeof title === "string" ? /* @__PURE__ */ React5.createElement(EventName, { name: title }) : title), subtitle && /* @__PURE__ */ React5.createElement("small", null, typeof subtitle === "string" ? /* @__PURE__ */ React5.createElement(OneSafe, { text: subtitle }) : subtitle)) : /* @__PURE__ */ React5.createElement("div", { className: "fd-sheet-heading is-bare", "aria-hidden": "true" }), headerActions && /* @__PURE__ */ React5.createElement("div", { className: "fd-sheet-header-actions" }, headerActions), dock && /* @__PURE__ */ React5.createElement("div", { className: "fd-sheet-dock" }, dock), /* @__PURE__ */ React5.createElement(IconButton, { label: "Close", onClick: onClose, size: 44, disabled: busy, style: { border: 0 } }, /* @__PURE__ */ React5.createElement(Icon, { name: "close", size: 20 }))),
    /* @__PURE__ */ React5.createElement("div", { className: "fd-sheet-body" }, children)
  ));
}
var ACTION_VARIANTS, BTN_KIND_VARIANT, SheetDock, openSheets, pageOverflow;
var init_controls = __esm({
  "src/ui/controls.jsx"() {
    init_theme();
    init_sheetMotion();
    init_Icon();
    init_OneSafe();
    init_Menu();
    ACTION_VARIANTS = {
      primary: { background: "var(--action-fill)", color: "var(--action-ink)", border: "1px solid var(--action-fill)" },
      secondary: { background: "var(--paper)", color: "var(--ink)", border: "1px solid var(--line)" },
      tertiary: { background: "var(--paper)", color: "var(--muted2)", border: "1px solid var(--line)" },
      destructive: { background: "var(--paper)", color: "var(--clay-text)", border: "1px solid var(--line)" },
      commit: { background: "var(--clay)", color: BONE, border: "1.5px solid var(--ink0)" }
    };
    BTN_KIND_VARIANT = { primary: "primary", dark: "secondary", ghost: "tertiary", danger: "destructive", flame: "commit" };
    SheetDock = createContext(null);
    openSheets = 0;
    pageOverflow = "";
  }
});

// shared/prompts.js
var PROMPT_KINDS, PROMPT_SOURCES, PROMPT_RESULTS_WINDOW_MS;
var init_prompts = __esm({
  "shared/prompts.js"() {
    init_core();
    PROMPT_KINDS = Object.freeze(["awards"]);
    PROMPT_SOURCES = Object.freeze(["mvps"]);
    PROMPT_RESULTS_WINDOW_MS = 12 * 60 * 60 * 1e3;
  }
});

// shared/mvp.js
var MVP_HOW;
var init_mvp = __esm({
  "shared/mvp.js"() {
    init_core();
    MVP_HOW = Object.freeze(["votes", "tie", "none"]);
  }
});

// shared/geo.js
var GEO_ROUND_MS, GEO_HOURS_SCALE;
var init_geo = __esm({
  "shared/geo.js"() {
    GEO_ROUND_MS = 60 * 1e3;
    GEO_HOURS_SCALE = 120 * 24;
  }
});

// shared/trivia.js
var TRIVIA_FORMATS, TRIVIA_FORMAT_NAMES, TRIVIA_MS, TRIVIA_NEAR;
var init_trivia = __esm({
  "shared/trivia.js"() {
    TRIVIA_FORMATS = Object.freeze(["choice", "number", "tune", "picture"]);
    TRIVIA_FORMAT_NAMES = Object.freeze({
      choice: "Multiple choice",
      number: "Closest number",
      tune: "Name that tune",
      picture: "Picture"
    });
    TRIVIA_MS = Object.freeze({ choice: 2e4, tune: 2e4, picture: 2e4, number: 3e4 });
    TRIVIA_NEAR = Object.freeze([1e3, 500]);
  }
});

// shared/show.js
function contestName(state, ev, contest) {
  if (!contest) return ev?.name || "";
  if (contest.kind === "match" && Array.isArray(contest.match)) {
    const [r, m] = contest.match;
    return bracketMatchName(state.brackets?.[ev?.id] || {}, r, m);
  }
  if (contest.kind === "ffa") return ev?.name || contest.label || "";
  if (contest.kind === "stage-final" || contest.kind === "final") return "Final";
  if (contest.kind === "heat" && Number.isInteger(contest.group))
    return state.stages?.[ev?.id]?.groups?.[contest.group]?.name || contest.label || "";
  return contest.label || ev?.name || "";
}
function postedFinalUndo(state, ev) {
  const op = state.eventOps?.[ev?.id];
  const last = op?.lastContest, result = state.results?.[ev?.id];
  if (!last || !result || last.postedRevision === void 0 || last.postedRevision === null) return null;
  if (Number(result.revision || 1) !== Number(last.postedRevision))
    return {
      enabled: false,
      blocker: "The result was corrected",
      contestId: last.id,
      contestRevision: Number(op.contestRevision || 0),
      refunds: [],
      voidIds: []
    };
  const probe = { ...state, results: { ...state.results } };
  delete probe.results[ev.id];
  return contestUndoAvailability(probe, ev);
}
var SHOW_TERMINAL_OUTCOMES, SHOW_SCENE_DEFINITIONS, REPLAY_WINDOW_MS, SKIPPABLE_PHASES;
var init_show = __esm({
  "shared/show.js"() {
    init_core();
    init_prompts();
    init_mvp();
    init_geo();
    init_trivia();
    SHOW_TERMINAL_OUTCOMES = Object.freeze(["completed", "skipped", "cancelled"]);
    SHOW_SCENE_DEFINITIONS = Object.freeze({
      opening: Object.freeze({
        label: "Opening",
        intensity: "major",
        steps: Object.freeze(["title", "room"])
      }),
      /* one step: the intro says its piece and the next official write (lock
         and start, the next announcement) retires it, so an announcement never
         costs the host a Continue. Stored scenes from the two-step era clamp to
         this step. */
      "event-intro": Object.freeze({
        label: "Event intro",
        intensity: "normal",
        requiresEvent: true,
        steps: Object.freeze(["title"])
      }),
      winner: Object.freeze({
        label: "Winner",
        intensity: "major",
        requiresEvent: true,
        requiresResult: true,
        steps: Object.freeze(["winner", "standings"])
      }),
      standings: Object.freeze({
        label: "Standings",
        intensity: "routine",
        steps: Object.freeze(["board"])
      }),
      /* the crown, then (D3) the class photo: all thirteen in final order.
         The second step is the commissioner's to take; the champion holds
         until then. A one-step record from before reads as the first step. */
      champion: Object.freeze({
        label: "Champion",
        intensity: "major",
        requiresFrozen: true,
        steps: Object.freeze(["champion", "class"])
      })
    });
    REPLAY_WINDOW_MS = 15 * 60 * 1e3;
    SKIPPABLE_PHASES = Object.freeze(["scheduled", "setup", "draw-pending", "draw-revealed", "betting-open"]);
  }
});

// src/features/identity/chipInk.js
function chipInks() {
  if (live) return live;
  try {
    const root = globalThis.document?.documentElement;
    const css = root && globalThis.getComputedStyle?.(root);
    const dark = css?.getPropertyValue("--ink0")?.trim(), bone = css?.getPropertyValue("--bone")?.trim();
    if (HEX.test(dark || "") && HEX.test(bone || "")) live = Object.freeze({ dark, bone });
  } catch {
  }
  return live || CHIP_INKS;
}
function channels(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return null;
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
}
function luminance(hex) {
  const c = channels(hex);
  if (!c) return null;
  const [r, g, b] = c.map((v) => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrastRatio(a, b) {
  const x = luminance(a), y = luminance(b);
  if (x === null || y === null) return null;
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function chipInkIsDark(color, inks = chipInks()) {
  const dark = contrastRatio(color, inks.dark), bone = contrastRatio(color, inks.bone);
  return dark !== null && bone !== null && dark > bone;
}
function letterPlate(color, inks = chipInks(), min = 4.5) {
  const c = channels(color);
  if (!c) return { fill: color, ink: inks.bone, dark: false };
  const dark = chipInkIsDark(color, inks);
  const ink = dark ? inks.dark : inks.bone;
  let fill = toHex(c);
  for (let step = 1; step <= 20 && (contrastRatio(fill, ink) || 0) < min; step++) {
    const t = step * 0.04;
    fill = toHex(c.map((v) => dark ? v + (1 - v) * t : v * (1 - t)));
  }
  return { fill, ink, dark };
}
var CHIP_INKS, HEX, live, toHex;
var init_chipInk = __esm({
  "src/features/identity/chipInk.js"() {
    CHIP_INKS = Object.freeze({ dark: "#151c1c", bone: "#f2eddf" });
    HEX = /^#[0-9a-f]{6}$/i;
    live = null;
    toHex = (c) => "#" + c.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0")).join("");
  }
});

// src/features/identity/playerIdentity.js
function resolvePlayerIdentity(profiles, player) {
  const profile = profiles?.[player];
  const claimedColor = CHIP_COLORS.find((color2) => color2.hex === profile?.color);
  const rosterIndex = ROSTER.indexOf(player);
  const color = claimedColor?.hex ?? CHIP_GRAY;
  return {
    color,
    /* dark ink on this chip (chipInk.js): whichever ink contrasts more */
    isLight: chipInkIsDark(color),
    skin: CHIP_SKINS.includes(profile?.skin) ? profile.skin : "ticks",
    num: profile?.num ?? (rosterIndex < 0 ? null : rosterIndex + 1),
    photo: photoUrl(profile, player)
  };
}
var photoUrl;
var init_playerIdentity = __esm({
  "src/features/identity/playerIdentity.js"() {
    init_core();
    init_chipInk();
    photoUrl = (profile, player) => profile?.photoV ? `/api/photo/${encodeURIComponent(player)}?v=${profile.photoV}` : null;
  }
});

// src/features/identity/PlayerIdentityContext.js
import { createContext as createContext2, createElement, useContext as useContext2 } from "react";
function PlayerIdentityProvider({ profiles, children }) {
  return createElement(PlayerIdentityContext.Provider, { value: profiles ?? null }, children);
}
function initialsTable(profiles) {
  const key = profiles && typeof profiles === "object" ? profiles : null;
  if (key && tables.has(key)) return tables.get(key);
  const players = [.../* @__PURE__ */ new Set([...ROSTER, ...Object.keys(key || {})])];
  const taken = /* @__PURE__ */ new Set(), table = {};
  for (const player of players) {
    const name = nameOf(key, player), letters = lettersOf(name);
    if (!letters) {
      table[player] = "";
      continue;
    }
    const first = letters[0];
    const words = name.split(/\s+/).map(lettersOf).filter(Boolean);
    const options = [
      ...words.length > 1 ? [words[0][0] + words[1][0]] : [],
      letters.slice(0, 2),
      first + letters[letters.length - 1],
      ...[...letters.slice(2)].map((ch) => first + ch)
    ];
    const pick = options.find((pair) => pair.length === 2 && !taken.has(shapeOf(pair))) || letters.slice(0, 2);
    taken.add(shapeOf(pick));
    table[player] = pick;
  }
  if (key) tables.set(key, table);
  return table;
}
function usePlayerInitials(player) {
  return initialsOf(useContext2(PlayerIdentityContext), player);
}
function usePlayerIdentity(player) {
  const profiles = useContext2(PlayerIdentityContext);
  if (profiles === void 0) {
    throw new Error("Player identity must render inside PlayerIdentityProvider.");
  }
  return resolvePlayerIdentity(profiles, player);
}
var PlayerIdentityContext, LOOKALIKE, shapeOf, nameOf, lettersOf, tables, initialsOf, TextFloorContext, useTextFloor;
var init_PlayerIdentityContext = __esm({
  "src/features/identity/PlayerIdentityContext.js"() {
    init_playerIdentity();
    init_core();
    PlayerIdentityContext = createContext2(void 0);
    LOOKALIKE = { Y: "V", D: "O", Q: "O" };
    shapeOf = (pair) => pair.replace(/[YDQ]/g, (ch) => LOOKALIKE[ch]);
    nameOf = (profiles, player) => String(profiles?.[player]?.display || player || "").trim().toUpperCase();
    lettersOf = (name) => name.replace(/[^A-Z0-9]/g, "");
    tables = /* @__PURE__ */ new WeakMap();
    initialsOf = (profiles, player) => initialsTable(profiles)[player] ?? (profiles?.[player]?.display || player || "").trim().slice(0, 2).toUpperCase();
    TextFloorContext = createContext2(12);
    useTextFloor = () => useContext2(TextFloorContext);
  }
});

// src/features/identity/PlayerIdentity.jsx
import React9, { useId as useId2, useState as useState5 } from "react";
function Avatar({ state, p, size = 34, ring, style, lettered = true }) {
  const prof = state.profiles?.[p];
  const photo = photoUrl(prof, p);
  const [failed, setFailed] = useState5(null);
  const src = photo && failed !== photo ? photo : null;
  const initials = usePlayerInitials(p);
  const identity = usePlayerIdentity(p);
  const plate = letterPlate(identity.color);
  const floor2 = useTextFloor();
  const letterPx = Math.max(floor2, Math.round(size * 0.42));
  return /* @__PURE__ */ React9.createElement("div", { style: {
    width: size,
    height: size,
    borderRadius: "50%",
    flexShrink: 0,
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: src ? "var(--paper2)" : plate.fill,
    position: "relative",
    border: ring ? "2px solid var(--bone)" : "1.5px solid var(--ink0)",
    ...style
  } }, src ? /* @__PURE__ */ React9.createElement("img", { src, alt: "", onError: () => setFailed(photo), style: { width: "100%", height: "100%", objectFit: "cover" } }) : lettered && size >= letterPx * 1.7 && /* @__PURE__ */ React9.createElement("span", { className: "fd-avatar-initials", style: {
    position: "relative",
    display: "block",
    flex: "none",
    width: "auto",
    minWidth: 0,
    maxWidth: "none",
    margin: 0,
    padding: 0,
    overflow: "visible",
    fontFamily: DISPLAY,
    fontWeight: 800,
    fontStyle: "normal",
    fontSize: letterPx,
    lineHeight: 1,
    letterSpacing: 0,
    textAlign: "center",
    textTransform: "uppercase",
    overflowWrap: "normal",
    transform: "none",
    color: plate.dark ? "var(--ink0)" : BONE
  } }, initials));
}
function AvatarStack({ state, players, size = 24, max = 4 }) {
  const show = players.slice(0, max);
  const extra = players.length - show.length;
  return /* @__PURE__ */ React9.createElement("div", { style: { display: "flex", alignItems: "center" } }, show.map((p, pi) => /* @__PURE__ */ React9.createElement(Avatar, { key: p, state, p, size, lettered: false, style: { marginLeft: pi > 0 ? -size * 0.32 : 0 } })), extra > 0 && /* @__PURE__ */ React9.createElement("div", { style: {
    width: size,
    height: size,
    borderRadius: "50%",
    marginLeft: -size * 0.32,
    background: "var(--paper2)",
    border: "1.5px solid var(--line)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: SANS,
    fontWeight: 700,
    fontSize: Math.max(12, Math.round(size * 0.4)),
    color: "var(--muted2)",
    flexShrink: 0
  } }, "+", extra));
}
function ChipFace({
  p,
  size = 18,
  empty,
  stamp: stampOverride,
  fallback,
  skin: skinOverride,
  color: colorOverride,
  isLight: lightOverride,
  valueRing = false,
  flat = false
}) {
  const uid = useId2().replace(/:/g, "");
  const clipId = `chip-edge-${uid}`, faceId = `chip-face-${uid}`;
  const identity = usePlayerIdentity(p);
  const initials = usePlayerInitials(p);
  const floor2 = useTextFloor();
  const [failed, setFailed] = useState5(null);
  if (empty) return /* @__PURE__ */ React9.createElement("div", { style: {
    width: size,
    height: size,
    borderRadius: "50%",
    border: "1.5px dashed var(--muted)",
    opacity: 0.45,
    flexShrink: 0
  } });
  const color = colorOverride || identity.color;
  const light = lightOverride ?? identity.isLight;
  const skin = skinOverride || identity.skin;
  const skinInk = light ? "var(--ink0)" : "var(--chip-mark)";
  const inlay = light ? "rgba(42,33,25,0.08)" : "rgba(251,243,228,0.10)";
  const inlayLine = light ? "rgba(42,33,25,0.38)" : "rgba(251,243,228,0.36)";
  const photo = stampOverride == null && size >= PHOTO_MIN && identity.photo && failed !== identity.photo ? identity.photo : null;
  const lettered = stampOverride == null && fallback == null;
  const stamp = stampOverride != null ? stampOverride : fallback != null ? fallback : size >= Math.max(floor2, size * INITIALS_UNITS / 32) * 2.2 ? initials : "";
  const initialsUnits = Math.max(INITIALS_UNITS, floor2 * 32 / size);
  const plate = lettered && stamp ? letterPlate(color) : null;
  return /* @__PURE__ */ React9.createElement(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 32 32",
      "aria-hidden": "true",
      style: {
        flexShrink: 0,
        display: "block",
        filter: size >= 32 && !flat ? "drop-shadow(0 2px 2px rgba(0,0,0,.22))" : "none"
      }
    },
    /* @__PURE__ */ React9.createElement("defs", null, /* @__PURE__ */ React9.createElement("clipPath", { id: clipId }, /* @__PURE__ */ React9.createElement("circle", { cx: "16", cy: "16", r: "14.7" })), photo && /* @__PURE__ */ React9.createElement("clipPath", { id: faceId }, /* @__PURE__ */ React9.createElement("circle", { cx: "16", cy: "16", r: "9.3" }))),
    /* @__PURE__ */ React9.createElement("circle", { cx: "16", cy: "16", r: "14.7", fill: color, stroke: "var(--ink0)", strokeWidth: "1.45" }),
    /* @__PURE__ */ React9.createElement("circle", { cx: "16", cy: "16", r: "13.25", fill: "none", stroke: inlayLine, strokeWidth: ".65", opacity: ".72" }),
    /* @__PURE__ */ React9.createElement("g", { clipPath: `url(#${clipId})` }, chipMarks(skin, 16, 12.4, skinInk)),
    photo ? /* @__PURE__ */ React9.createElement(React9.Fragment, null, /* @__PURE__ */ React9.createElement("circle", { cx: "16", cy: "16", r: "9.3", fill: "var(--paper2)" }), /* @__PURE__ */ React9.createElement(
      "image",
      {
        href: photo,
        x: "6.7",
        y: "6.7",
        width: "18.6",
        height: "18.6",
        preserveAspectRatio: "xMidYMid slice",
        clipPath: `url(#${faceId})`,
        onError: () => setFailed(photo)
      }
    ), /* @__PURE__ */ React9.createElement("circle", { cx: "16", cy: "16", r: "9.3", fill: "none", stroke: skinInk, strokeWidth: ".9" })) : /* @__PURE__ */ React9.createElement("circle", { cx: "16", cy: "16", r: "8.75", fill: plate ? plate.fill : inlay, stroke: inlayLine, strokeWidth: ".8" }),
    /* @__PURE__ */ React9.createElement(
      "path",
      {
        d: "M7.4 9.4A10.8 10.8 0 0 1 24.6 9.4",
        fill: "none",
        stroke: "rgba(255,255,255,.38)",
        strokeWidth: ".75",
        strokeLinecap: "round",
        opacity: ".65"
      }
    ),
    /* @__PURE__ */ React9.createElement(
      "path",
      {
        d: "M24.6 22.6A10.8 10.8 0 0 1 7.4 22.6",
        fill: "none",
        stroke: "rgba(23,16,9,.45)",
        strokeWidth: ".7",
        strokeLinecap: "round",
        opacity: ".55"
      }
    ),
    valueRing && /* @__PURE__ */ React9.createElement(
      "circle",
      {
        cx: "16",
        cy: "16",
        r: "7.25",
        fill: "none",
        strokeWidth: ".8",
        stroke: light ? "var(--ink0)" : "var(--bone)",
        opacity: ".48"
      }
    ),
    !photo && size >= 20 && stamp != null && stamp !== "" && /* @__PURE__ */ React9.createElement(
      "text",
      {
        x: "16",
        y: "16.8",
        textAnchor: "middle",
        dominantBaseline: "central",
        fontFamily: DISPLAY,
        fontWeight: plate ? 800 : 700,
        fontStyle: "normal",
        fontSize: plate ? initialsUnits : valueRing && stamp >= 100 ? 8.7 : 11.7,
        letterSpacing: plate ? ".02em" : void 0,
        fill: plate ? plate.dark ? "var(--ink0)" : "var(--bone)" : light ? "var(--ink0)" : "var(--bone)"
      },
      stamp
    )
  );
}
function BankChip({ p, size = 18, empty, val }) {
  return /* @__PURE__ */ React9.createElement(ChipFace, { p, size, empty, stamp: val, valueRing: val != null });
}
var CHIP_SKIN_PATHS, chipMarks, PHOTO_MIN, INITIALS_UNITS;
var init_PlayerIdentity = __esm({
  "src/features/identity/PlayerIdentity.jsx"() {
    init_Icon();
    init_theme();
    init_PlayerIdentityContext();
    init_playerIdentity();
    init_chipInk();
    CHIP_SKIN_PATHS = Object.freeze({
      flame: "M0 -3.9C1.9 -1.5 2.3 -0.5 2.3 0.6 2.3 2.1 1.3 3 0 3S-2.3 2.1 -2.3 0.6C-2.3-0.5-1.9-1.5 0-3.9Z",
      star: "M0 -3C0.35-0.9 0.55-0.7 2.7-0.35 0.55 0 0.35 0.2 0 2.3c-0.35-2.1-0.55-2.3-2.7-2.65C-0.55-0.7-0.35-0.9 0-3Z",
      bolt: "M-2.7-2.4 0 .2 2.7-2.4 2.7.2 0 2.9-2.7.2 0-2.4Z",
      crown: "M-6.2 3.4 -5-3.6-2.1-0.9 0-5.2 2.1-0.9 5-3.6 6.2 3.4Z"
    });
    chipMarks = (skin, cx = 16, edge = 12.4, ink = "var(--chip-mark)") => {
      const pt = (r, deg) => {
        const a = deg * Math.PI / 180;
        return [cx + Math.cos(a) * r, cx + Math.sin(a) * r];
      };
      const lines = (n, off, r12, r22, w) => Array.from({ length: n }, (_, i) => {
        const [x1, y1] = pt(r12, i * (360 / n) + off), [x2, y2] = pt(r22, i * (360 / n) + off);
        return /* @__PURE__ */ React9.createElement(
          "line",
          {
            key: i,
            x1,
            y1,
            x2,
            y2,
            stroke: ink,
            strokeWidth: w,
            strokeLinecap: "round"
          }
        );
      });
      if (skin === "plain") return null;
      if (skin === "dash") return /* @__PURE__ */ React9.createElement(
        "circle",
        {
          cx,
          cy: cx,
          r: edge - 1.1,
          fill: "none",
          stroke: ink,
          strokeWidth: "3",
          strokeDasharray: "8.4 11.4",
          strokeLinecap: "butt"
        }
      );
      if (skin === "ring") return /* @__PURE__ */ React9.createElement(React9.Fragment, null, /* @__PURE__ */ React9.createElement("circle", { cx, cy: cx, r: edge - 2.5, fill: "none", stroke: ink, strokeWidth: "1.15" }), /* @__PURE__ */ React9.createElement("circle", { cx, cy: cx, r: edge - 4.4, fill: "none", stroke: ink, strokeWidth: ".8", opacity: ".8" }));
      if (skin === "quad") return lines(4, 0, edge - 3.6, edge + 0.6, 3.4);
      if (skin === "dots") return Array.from({ length: 12 }, (_, i) => {
        const [x, y] = pt(edge - 1.45, i * 30 + 15);
        return /* @__PURE__ */ React9.createElement("circle", { key: i, cx: x, cy: y, r: "1.08", fill: ink });
      });
      const around = (n, d, r, spin = 0) => Array.from({ length: n }, (_, i) => {
        const a = i * (360 / n) + spin, [x, y] = pt(r, a);
        return /* @__PURE__ */ React9.createElement(
          "path",
          {
            key: i,
            d,
            fill: ink,
            transform: `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${a + 90})`
          }
        );
      });
      if (skin === "saw") {
        const n = 11, p2 = [];
        for (let i = 0; i < n * 2; i++) {
          const [x, y] = pt(i % 2 ? edge - 3.6 : edge + 0.5, i * (180 / n) - 90);
          p2.push(`${x.toFixed(2)},${y.toFixed(2)}`);
        }
        return /* @__PURE__ */ React9.createElement(
          "polygon",
          {
            points: p2.join(" "),
            fill: "none",
            stroke: ink,
            strokeWidth: "1.5",
            strokeLinejoin: "round"
          }
        );
      }
      if (skin === "flame") return around(6, CHIP_SKIN_PATHS.flame, edge - 0.6);
      if (skin === "star") return around(6, CHIP_SKIN_PATHS.star, edge - 0.9);
      if (skin === "bolt") return around(6, CHIP_SKIN_PATHS.bolt, edge - 0.8);
      if (skin === "wave") {
        const n = 60, d = [];
        for (let i = 0; i <= n; i++) {
          const [x, y] = pt(edge - 1.9 + Math.sin(i / n * Math.PI * 14) * 1.5, i * (360 / n));
          d.push(`${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`);
        }
        return /* @__PURE__ */ React9.createElement("path", { d: d.join(" "), fill: "none", stroke: ink, strokeWidth: "1.5" });
      }
      if (skin === "crown") return /* @__PURE__ */ React9.createElement(
        "path",
        {
          d: CHIP_SKIN_PATHS.crown,
          fill: ink,
          transform: `translate(${cx} ${cx - 8.3})`
        }
      );
      return lines(8, 22.5, edge - 3, edge + 0.6, 2.4);
    };
    PHOTO_MIN = 24;
    INITIALS_UNITS = 13;
  }
});

// src/features/weekend/competition-bracket.css
var init_competition_bracket = __esm({
  "src/features/weekend/competition-bracket.css"() {
  }
});

// src/features/weekend/CompetitionBracket.jsx
import React10, { useEffect as useEffect4, useRef as useRef4 } from "react";
function bracketLayout(bracket) {
  const rounds = bracket?.rounds || [];
  const centers = rounds.map((round) => round.map(() => null));
  const at = { cursor: 0 };
  const last = rounds.length - 1;
  if (last >= 0) rounds[last].forEach((_, m) => placeTree(rounds, centers, last, m, at));
  rounds.forEach((round, r) => round.forEach((_, m) => {
    if (centers[r][m] === null) {
      centers[r][m] = at.cursor + 0.5;
      at.cursor += 1;
    }
  }));
  return { centers, units: Math.max(at.cursor, 1) };
}
function placeTree(rounds, centers, r, m, at) {
  const match = rounds[r]?.[m];
  if (!match) return at.cursor;
  const side = (slot) => {
    if (slot?.w) return placeTree(rounds, centers, slot.w[0], slot.w[1], at);
    const center2 = at.cursor + 0.25;
    at.cursor += 0.5;
    return center2;
  };
  const leaf = !match.a?.w && !match.b?.w;
  let center;
  if (leaf) {
    center = at.cursor + 0.5;
    at.cursor += 1;
  } else center = (side(match.a) + side(match.b)) / 2;
  centers[r][m] = center;
  return center;
}
function CompetitionBracket({ state, ev, me, gm = false, onPick, onPlayer, size = "md", hot, pending = false, pickable = true }) {
  const bracket = state.brackets?.[ev.id], draw = state.draws?.[ev.id];
  const scroller = useRef4(null);
  const compact = size === "compact";
  const contest = bracket && draw ? resolveCurrentContest(state, ev) : null;
  const active = contest?.kind === "match" ? contest.match : null;
  useEffect4(() => {
    const el = scroller.current;
    if (!el || compact || !active || el.scrollWidth <= el.clientWidth) return;
    const card = el.querySelector(".fd-bracket-match.is-current");
    if (card) el.scrollLeft = Math.max(0, card.offsetLeft - (el.clientWidth - card.offsetWidth) / 2);
  }, [compact, active?.[0], active?.[1]]);
  if (!bracket || !draw) return null;
  const rounds = bracket.rounds;
  const R = rounds.length;
  const { centers, units } = bracketLayout(bracket);
  const dims = SIZES2[!compact ? "full" : R >= 4 ? "compactTall" : "compact"];
  const cardH = dims.head + dims.row * 2 + 1 + 2;
  const unit = cardH + dims.gap;
  const height = Math.ceil(units * unit);
  const colW = `((100% - ${(R - 1) * dims.colGap}px) / ${R})`;
  const colLeft = (r) => `calc(${colW} * ${r} + ${r * dims.colGap}px)`;
  const topOf = (r, m) => centers[r][m] * unit - cardH / 2;
  const rowY = (r, m, index) => topOf(r, m) + 1 + dims.head + dims.row / 2 + index * (dims.row + 1);
  const canRecord = pickable && gm && !!onPick && contest?.phase === "in-progress" && !state.frozen && !state.results?.[ev.id] && !state.poker && !state.shelved?.[ev.id];
  const names = ROUND_NAMES[bracket.size] || [];
  const connectors = [];
  rounds.forEach((round, r) => round.forEach((match, m) => [match.a, match.b].forEach((slot, index) => {
    if (!slot?.w) return;
    const [fr, fm] = slot.w;
    const y1 = centers[fr][fm] * unit, y2 = rowY(r, m, index);
    const top = Math.min(y1, y2) - 1, h = Math.abs(y2 - y1) + 2;
    const decided3 = rounds[fr][fm].winner !== null && rounds[fr][fm].winner !== void 0;
    const a = (y1 - top) / h * 100, b = (y2 - top) / h * 100;
    connectors.push(/* @__PURE__ */ React10.createElement(
      "svg",
      {
        key: `${r}-${m}-${index}`,
        className: `fd-bracket-line${decided3 ? " is-advanced" : ""}`,
        "aria-hidden": "true",
        viewBox: "0 0 100 100",
        preserveAspectRatio: "none",
        style: { left: `calc(${colLeft(fr)} + ${colW})`, width: dims.colGap, top, height: h }
      },
      /* @__PURE__ */ React10.createElement("path", { d: `M0 ${a} H50 V${b} H100`, vectorEffect: "non-scaling-stroke" })
    ));
  })));
  const stage = /* @__PURE__ */ React10.createElement("div", { className: "fd-bracket-stage", style: {
    height,
    minWidth: compact ? 0 : R * dims.minCol + (R - 1) * dims.colGap
  } }, connectors, rounds.map((round, r) => round.map((match, m) => {
    const sides = [resolveSlot(bracket, match.a), resolveSlot(bracket, match.b)];
    const isCurrent = active?.[0] === r && active?.[1] === m;
    const highlighted = isCurrent || hot?.[0] === r && hot?.[1] === m;
    const decided3 = match.winner !== null && match.winner !== void 0;
    const status = statusOf(contest, isCurrent);
    return /* @__PURE__ */ React10.createElement(
      "div",
      {
        key: `${r}-${m}`,
        className: `fd-bracket-match${highlighted ? " is-current" : ""}${decided3 ? " is-decided" : ""}`,
        style: { left: colLeft(r), width: `calc(${colW})`, top: topOf(r, m), height: cardH },
        "aria-label": `${names[r] || `Round ${r + 1}`}, match ${m + 1}${status ? `, ${status.toLowerCase()}` : ""}`
      },
      !compact && /* @__PURE__ */ React10.createElement("div", { className: "fd-bracket-match-label" }, /* @__PURE__ */ React10.createElement("span", null, bracketMatchName(bracket, r, m)), status && /* @__PURE__ */ React10.createElement("strong", { className: "fd-bracket-lamp" }, /* @__PURE__ */ React10.createElement("i", { className: `fd-insert${status === "Betting open" ? " is-pending" : status === "Up next" ? " is-done" : ""}`, "aria-hidden": "true" }), /* @__PURE__ */ React10.createElement("span", { className: "fd-bracket-sr fd-sr" }, status))),
      sides.map((key, index) => {
        const team = key === null || key === void 0 ? null : draw.teams[key];
        const won = decided3 && match.winner === key, lost = decided3 && !!team && !won;
        const name = team ? teamLabel(state, team) : "TBD";
        const fullName = team?.players.map((player) => disp(state, player)).join(" & ");
        const mine = !!team?.players.includes(me);
        const className = `fd-bracket-team${won ? " is-winner" : ""}${lost ? " is-loser" : ""}${mine ? " is-you" : ""}${team ? "" : " is-empty"}`;
        if (compact) return /* @__PURE__ */ React10.createElement("div", { key: index, className }, team && /* @__PURE__ */ React10.createElement("span", { className: "fd-bracket-faces", "aria-hidden": "true" }, team.players.slice(0, 3).map((player) => /* @__PURE__ */ React10.createElement(Avatar, { key: player, state, p: player, size: 20 }))), /* @__PURE__ */ React10.createElement("span", { className: "fd-bracket-name" }, name), won && /* @__PURE__ */ React10.createElement("span", { className: "fd-bracket-outcome", "aria-hidden": "true" }, /* @__PURE__ */ React10.createElement(Icon, { name: "check", size: "1em" })));
        const selectable = canRecord && isCurrent && !decided3 && sides.every((side) => side !== null && side !== void 0);
        return /* @__PURE__ */ React10.createElement("div", { key: index, className }, team && /* @__PURE__ */ React10.createElement("div", { className: "fd-bracket-players" }, team.players.map((player) => /* @__PURE__ */ React10.createElement(
          "button",
          {
            key: player,
            type: "button",
            "aria-label": `View ${disp(state, player)}'s player card`,
            disabled: pending || !onPlayer,
            onClick: () => onPlayer?.(player)
          },
          /* @__PURE__ */ React10.createElement(Avatar, { state, p: player, size: 26 })
        ))), /* @__PURE__ */ React10.createElement(
          "button",
          {
            type: "button",
            className: "fd-bracket-pick",
            disabled: !selectable || pending,
            "aria-label": selectable ? `Winner: ${fullName}` : `${fullName || "To be determined"}${won ? ", winner" : ""}`,
            onClick: () => selectable && onPick(r, m, key)
          },
          /* @__PURE__ */ React10.createElement("span", { className: "fd-bracket-name" }, name),
          won && /* @__PURE__ */ React10.createElement("span", { className: "fd-bracket-outcome", "aria-hidden": "true" }, /* @__PURE__ */ React10.createElement(Icon, { name: "check", size: "1em" })),
          selectable && /* @__PURE__ */ React10.createElement("span", { className: "fd-bracket-pick-hint" }, pending ? "Saving\u2026" : "Win")
        ));
      })
    );
  })));
  const heads = /* @__PURE__ */ React10.createElement("div", { className: "fd-bracket-heads", style: { minWidth: compact ? 0 : R * dims.minCol + (R - 1) * dims.colGap } }, rounds.map((_, r) => /* @__PURE__ */ React10.createElement("span", { key: r, style: { left: colLeft(r), width: `calc(${colW})` } }, compact && R >= 4 && COMPACT_ROUNDS[names[r]] || names[r] || `Round ${r + 1}`)));
  if (compact) return /* @__PURE__ */ React10.createElement("div", { className: "fd-competition-bracket is-compact", "aria-hidden": "true" }, /* @__PURE__ */ React10.createElement("div", { className: "fd-bracket-scroll" }, heads, stage));
  return /* @__PURE__ */ React10.createElement("section", { className: "fd-competition-bracket", "aria-label": `${ev.name} bracket`, "aria-busy": pending }, /* @__PURE__ */ React10.createElement("div", { className: "fd-bracket-scroll", ref: scroller }, heads, stage));
}
function BracketPeek({ state, ev, me, onOpen, label: label2 = "Bracket", card = false }) {
  if (!state.brackets?.[ev?.id] || !state.draws?.[ev.id]) return null;
  return /* @__PURE__ */ React10.createElement(
    "button",
    {
      type: "button",
      className: `fd-bracket-peek${card ? " is-card" : ""}`,
      onClick: () => onOpen(ev),
      "aria-label": `Open the full ${ev.name} bracket`
    },
    /* @__PURE__ */ React10.createElement("span", { className: "fd-bracket-peek-head" }, /* @__PURE__ */ React10.createElement("span", null, label2), /* @__PURE__ */ React10.createElement("span", null, "Full bracket ", /* @__PURE__ */ React10.createElement(Icon, { name: "open", size: 16 }))),
    /* @__PURE__ */ React10.createElement(CompetitionBracket, { state, ev, me, size: "compact" })
  );
}
var SIZES2, COMPACT_ROUNDS, statusOf;
var init_CompetitionBracket = __esm({
  "src/features/weekend/CompetitionBracket.jsx"() {
    init_Icon();
    init_core();
    init_PlayerIdentity();
    init_competition_bracket();
    SIZES2 = {
      /* two rounds stand side by side on a 390px phone: a round past them is a swipe, landing on its column */
      full: { head: 22, row: 48, gap: 14, minCol: 160, colGap: 28 },
      compact: { head: 0, row: 28, gap: 10, minCol: 0, colGap: 18 },
      /* a field past eight: the same picture at a glance, tighter rows */
      compactTall: { head: 0, row: 22, gap: 6, minCol: 0, colGap: 14 }
    };
    COMPACT_ROUNDS = { Quarterfinals: "Quarters", Semifinals: "Semis" };
    statusOf = (contest, isCurrent) => !isCurrent ? null : contest.phase === "in-progress" ? "Playing" : contest.phase === "betting-open" ? "Betting open" : contest.phase === "awaiting-result" ? "Awaiting result" : "Up next";
  }
});

// src/features/director/directorPill.js
function contestIsFinal(state, ev, contest) {
  if (!contest) return false;
  if (contest.kind === "stage-final") return true;
  if (contest.kind !== "match") return false;
  const rounds = state.brackets?.[ev.id]?.rounds || [];
  return contest.match?.[0] === rounds.length - 1;
}
function lastWinnerUndo(state, ev) {
  if (!ev) return { enabled: false };
  return postedFinalUndo(state, ev) || contestUndoAvailability(state, ev);
}
var init_directorPill = __esm({
  "src/features/director/directorPill.js"() {
    init_core();
    init_show();
    init_geo();
    init_trivia();
  }
});

// src/lib/haptics.js
function isIOS({ userAgent = "", platform = "", maxTouchPoints = 0 } = {}) {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return true;
  return /Macintosh/i.test(userAgent) && Number(maxTouchPoints) > 1 && !/Android/i.test(platform);
}
function isAndroid({ userAgent = "", platform = "" } = {}) {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return false;
  return /Android/i.test(platform) || /Android/i.test(userAgent);
}
function hapticsAllowed({ userAgent, platform, canVibrate, reducedMotion, optedOut, tv: tv2 }) {
  return !!canVibrate && isAndroid({ userAgent, platform }) && !reducedMotion && !optedOut && !tv2;
}
function tickAllowed({ userAgent, platform, maxTouchPoints, optedOut, tv: tv2 }) {
  return isIOS({ userAgent, platform, maxTouchPoints }) && !optedOut && !tv2;
}
function hapticEnvironment() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return null;
  return {
    userAgent: navigator.userAgent || "",
    platform: navigator.userAgentData?.platform || "",
    canVibrate: typeof navigator.vibrate === "function",
    maxTouchPoints: Number(navigator.maxTouchPoints) || 0,
    reducedMotion: !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches,
    tv: tvSurface || isTvLocation(window.location || {})
  };
}
function haptic(kind) {
  const pattern = HAPTIC_PATTERNS[kind];
  const env = hapticEnvironment();
  if (!pattern || !env || !hapticsAllowed({ ...env, optedOut: vibrationOptedOut() })) return false;
  try {
    return navigator.vibrate(pattern) !== false;
  } catch {
    return false;
  }
}
function tickSwitch(doc) {
  const label2 = doc.createElement("label");
  label2.setAttribute("aria-hidden", "true");
  label2.style.display = "none";
  const input = doc.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", "");
  input.tabIndex = -1;
  label2.appendChild(input);
  label2.addEventListener("click", (event) => event.stopPropagation());
  return label2;
}
function tapTick() {
  const env = hapticEnvironment();
  if (!env || !tickAllowed({ ...env, optedOut: vibrationOptedOut() })) return false;
  try {
    const doc = globalThis.document;
    const host = doc?.head || doc?.body;
    if (!host) return false;
    const label2 = tickSwitch(doc);
    host.appendChild(label2);
    label2.click();
    label2.remove();
    return true;
  } catch {
    return false;
  }
}
var VIBRATION_KEY, HAPTIC_PATTERNS, storage, vibrationOptedOut, isTvLocation, tvSurface;
var init_haptics = __esm({
  "src/lib/haptics.js"() {
    VIBRATION_KEY = "si-vibration";
    HAPTIC_PATTERNS = Object.freeze({
      place: 8,
      retract: 5,
      pick: [20, 40, 20],
      settle: 15,
      lead: [15, 50, 15]
    });
    storage = () => {
      try {
        return globalThis.localStorage || null;
      } catch {
        return null;
      }
    };
    vibrationOptedOut = () => {
      try {
        return storage()?.getItem(VIBRATION_KEY) === "off";
      } catch {
        return false;
      }
    };
    isTvLocation = ({ pathname = "", search = "" } = {}) => pathname === "/tv" || new URLSearchParams(search).has("tv");
    tvSurface = false;
  }
});

// src/features/identity/chipCoin.js
function edgeInserts(skin, n = COIN_FACETS) {
  const every = (step, width = 1, offset2 = 0) => Array.from(
    { length: n },
    (_, i) => (i - offset2 + n) % n % step < width
  );
  switch (skin) {
    case "plain":
    case "ring":
      return Array(n).fill(false);
    case "dash":
      return every(4, 2);
    case "quad":
      return every(6, 2, 5);
    case "dots":
    case "saw":
      return every(2);
    case "flame":
    case "star":
    case "bolt":
      return every(4, 1, 2);
    case "wave":
      return every(3, 2);
    case "crown":
      return Array.from({ length: n }, (_, i) => i === 0 || i === 1 || i === n - 1);
    default:
      return every(3);
  }
}
function coinGeometry(size, n = COIN_FACETS) {
  const radius = size * (15.4 / 32);
  const thickness = Math.max(4, Math.round(size * 0.1));
  const chord = 2 * radius * Math.sin(Math.PI / n) + 0.6;
  const apothem = radius * Math.cos(Math.PI / n);
  return { radius, thickness, chord, apothem, step: 360 / n };
}
function coinSettle(angle, velocity = 0) {
  const a = Number.isFinite(angle) ? angle : 0;
  const v = Number.isFinite(velocity) ? Math.max(-3, Math.min(3, velocity)) : 0;
  const projected = a + v * 240;
  const target = Math.round(projected / 360) * 360;
  const duration = Math.round(Math.max(380, Math.min(1200, Math.abs(target - a) * 1.6)));
  return { target: target === 0 ? 0 : target, duration };
}
var COIN_FACETS, COIN_DEG_PER_PX, COIN_TAP_SLOP;
var init_chipCoin = __esm({
  "src/features/identity/chipCoin.js"() {
    COIN_FACETS = 24;
    COIN_DEG_PER_PX = 0.9;
    COIN_TAP_SLOP = 4;
  }
});

// src/features/wagers/betStacks.js
function stackGeometry(size, shown, ring = false) {
  const D = Math.max(8, Number(size) || 0);
  const pad = Math.max(1.5, D * 0.04);
  const rx = D * 15.4 / 32, ry = rx * STACK_TILT, t = Math.max(2.4, D * 0.115);
  const yFace = pad + D * STACK_TILT / 2;
  return {
    D,
    pad,
    rx,
    ry,
    t,
    cx: pad + D / 2,
    yFace,
    width: D + pad * 2,
    height: yFace + Math.max(1, shown) * t + ry + pad + (ring ? 3 : 0)
  };
}
function stackView(stake, cap = STACK_CAP) {
  const chips = stackChipCount(stake);
  return { chips, shown: Math.min(chips, cap), capped: chips > cap };
}
function orderStacks(entries = []) {
  const byPlayer = /* @__PURE__ */ new Map();
  for (const entry of entries) {
    if (!entry?.player) continue;
    byPlayer.set(entry.player, (byPlayer.get(entry.player) || 0) + (Number(entry.stake) || 0));
  }
  return [...byPlayer].filter(([, stake]) => stake > 0).map(([player, stake]) => ({ player, stake, ...stackView(stake) })).sort((a, b) => b.stake - a.stake || a.player.localeCompare(b.player));
}
function sideKeyOf(state, contest, wager) {
  if (contest.kind === "ffa" && wager.pickTeam) {
    const side = contest.sides?.find((item) => item.players.length === wager.pickPlayers?.length && item.players.every((p) => wager.pickPlayers.includes(p)));
    if (side) return side.key;
  }
  return wagerSide(state, wager);
}
function settledStacks(state, events, contest, matches = (wager) => wagerMatchesContest(wager, contest)) {
  const won = /* @__PURE__ */ new Map(), lost = /* @__PURE__ */ new Map();
  (state.wagers || []).forEach((wager) => {
    if (!contest || !matches(wager)) return;
    const result = resolveWager(state, wager, events);
    if (result.status !== "won" && result.status !== "lost") return;
    const into = result.status === "won" ? won : lost;
    const cur = into.get(wager.player) || { player: wager.player, stake: 0, paid: 0 };
    cur.stake += Number(wager.stake) || 0;
    if (result.status === "won") cur.paid += Math.max(0, result.delta);
    into.set(wager.player, cur);
  });
  const shape = (map, status) => [...map.values()].map((item) => ({
    ...item,
    ...stackView(item.stake),
    status,
    after: status === "won" ? item.stake + item.paid : 0
  })).sort((a, b) => b.stake - a.stake || a.player.localeCompare(b.player));
  const winners = shape(won, "won"), losers = shape(lost, "lost");
  return {
    winners,
    losers,
    paid: winners.reduce((sum, item) => sum + item.paid, 0),
    lost: losers.reduce((sum, item) => sum + item.stake, 0),
    any: winners.length + losers.length > 0
  };
}
function groupStacks(stacks = [], slots = Infinity, keep = null) {
  const list = stacks || [];
  const room = Math.max(1, Math.floor(Number(slots) || 0) || 1);
  if (!Number.isFinite(Number(slots)) || list.length <= room) return { shown: list, rest: null };
  const size = Math.max(1, room - 1);
  let shown = list.slice(0, size);
  const kept = keep ? list.find((item) => item.player === keep) : null;
  if (kept && !shown.includes(kept)) shown = [...list.slice(0, size - 1), kept];
  const tail = list.filter((item) => !shown.includes(item));
  return { shown, rest: {
    players: tail.map((item) => item.player),
    count: tail.length,
    total: stacksTotal(tail),
    stacks: tail
  } };
}
function contestWinnerKey(state, evId, contest) {
  if (!contest) return null;
  if (contest.kind === "ffa") {
    const first = state.results?.[evId]?.slots?.[0];
    const top = Array.isArray(first) ? first : first != null ? [first] : [];
    if (!top.length) return null;
    const side = (contest.sides || []).find((item) => item.players.some((p) => top.includes(p)));
    return side ? side.key : null;
  }
  const stack2 = state.eventOps?.[evId]?.contestStack;
  const list = Array.isArray(stack2) ? stack2 : state.eventOps?.[evId]?.lastContest ? [state.eventOps[evId].lastContest] : [];
  for (let i = list.length - 1; i >= 0; i--) if (list[i]?.id === contest.id) return list[i].winner ?? null;
  return null;
}
function decidedContest(state, events, evId, contest) {
  const winner = contestWinnerKey(state, evId, contest);
  if (!contest || winner === null || winner === void 0) return null;
  const bySide = new Map((contest.sides || []).map((side) => [side.key, /* @__PURE__ */ new Map()]));
  (state.wagers || []).forEach((wager) => {
    if (!wagerMatchesContest(wager, contest)) return;
    const result = resolveWager(state, wager, events);
    if (result.status !== "won" && result.status !== "lost") return;
    const side = bySide.get(sideKeyOf(state, contest, wager));
    if (!side) return;
    const cur = side.get(wager.player) || { player: wager.player, stake: 0, paid: 0, status: result.status };
    cur.stake += Number(wager.stake) || 0;
    if (result.status === "won") cur.paid += Math.max(0, result.delta);
    side.set(wager.player, cur);
  });
  const sides = (contest.sides || []).map((side) => {
    const stacks = [...bySide.get(side.key).values()].sort((a, b) => b.stake - a.stake || a.player.localeCompare(b.player));
    const won = side.key === winner;
    return {
      key: side.key,
      players: side.players,
      won,
      stacks,
      total: stacksTotal(stacks),
      paid: stacks.reduce((sum, item) => sum + item.paid, 0)
    };
  });
  return {
    winner,
    sides,
    paid: sides.reduce((sum, side) => sum + side.paid, 0),
    lost: sides.filter((side) => !side.won).reduce((sum, side) => sum + side.total, 0),
    any: sides.some((side) => side.stacks.length > 0)
  };
}
var STACK_CAP, STACK_TILT, STACK_TOWER, towerTiers, towerGap, stackChipCount, stacksTotal, hoverRect, faceRect, rackTargetFor;
var init_betStacks = __esm({
  "src/features/wagers/betStacks.js"() {
    init_core();
    STACK_CAP = 10;
    STACK_TILT = 0.6;
    STACK_TOWER = 2;
    towerTiers = (chips, cap = STACK_CAP) => chips <= cap ? 0 : chips <= 2 * cap ? 1 : STACK_TOWER;
    towerGap = (size) => Math.max(4, Math.round(Math.max(8, Number(size) || 0) * 0.14));
    stackChipCount = (stake) => {
      const value = Math.max(0, Number(stake) || 0);
      return value > 0 ? Math.max(1, Math.floor(value / PT)) : 0;
    };
    stacksTotal = (stacks) => stacks.reduce((sum, item) => sum + item.stake, 0);
    hoverRect = (anchor, size, lift = 8) => anchor ? {
      left: anchor.left + anchor.width / 2 - size / 2,
      top: anchor.top - size - lift,
      width: size,
      height: size
    } : null;
    faceRect = (svgRect) => svgRect ? {
      left: svgRect.left,
      top: svgRect.top - svgRect.width * 0.2,
      width: svgRect.width,
      height: svgRect.width
    } : null;
    rackTargetFor = (value, denoms, fallback) => `bets:rack:${denoms.includes(value) ? value : fallback}`;
  }
});

// src/features/wagers/bet-stacks.css
var init_bet_stacks = __esm({
  "src/features/wagers/bet-stacks.css"() {
  }
});

// src/features/wagers/BetStacks.jsx
import React12, { useEffect as useEffect6, useLayoutEffect as useLayoutEffect3, useMemo, useRef as useRef6, useState as useState7 } from "react";
function Rim({ cx, rx, ry, yt, t, inserts, turn, stroke }) {
  const yb = yt + t;
  const band = `M${r2(cx - rx)} ${r2(yt)}L${r2(cx - rx)} ${r2(yb)}A${r2(rx)} ${r2(ry)} 0 0 0 ${r2(cx + rx)} ${r2(yb)}L${r2(cx + rx)} ${r2(yt)}A${r2(rx)} ${r2(ry)} 0 0 1 ${r2(cx - rx)} ${r2(yt)}Z`;
  const marks = [];
  inserts.forEach((ink, index) => {
    if (!ink) return;
    const mid = (index + turn) % COIN_FACETS * FACET + FACET / 2;
    const a = Math.max(0, mid - FACET / 2), b = Math.min(180, mid + FACET / 2);
    if (b <= a) return;
    const pt = (deg, y) => `${r2(cx + rx * Math.cos(deg * Math.PI / 180))},${r2(y + ry * Math.sin(deg * Math.PI / 180))}`;
    marks.push(/* @__PURE__ */ React12.createElement(
      "polygon",
      {
        key: index,
        className: "fd-stack-insert",
        points: `${pt(a, yt)} ${pt(b, yt)} ${pt(b, yb)} ${pt(a, yb)}`
      }
    ));
  });
  return /* @__PURE__ */ React12.createElement(React12.Fragment, null, /* @__PURE__ */ React12.createElement("path", { className: "fd-stack-rim", d: band }), marks, /* @__PURE__ */ React12.createElement(
    "path",
    {
      className: "fd-stack-seam",
      d: `M${r2(cx - rx)} ${r2(yb)}A${r2(rx)} ${r2(ry)} 0 0 0 ${r2(cx + rx)} ${r2(yb)}`,
      strokeWidth: stroke
    }
  ));
}
function ChipStack({
  p,
  stake,
  paid = 0,
  size = 40,
  cap = STACK_CAP,
  mine = false,
  settle = null,
  delay = 0,
  tag = true,
  tagSize = null,
  groups = null,
  chip: chip2 = null,
  count = null,
  tower = false
}) {
  const player = usePlayerIdentity(p);
  const floor2 = useTextFloor();
  const identity = chip2 ? { color: chip2.color, isLight: !!chip2.isLight, skin: chip2.skin || "quad", num: chip2.stamp } : player;
  const chips = count ?? stackChipCount(stake);
  const paidChips = count == null ? stackChipCount(paid) : 0;
  const tiers = tower ? towerTiers(chips + paidChips, cap) : 0;
  const gap = tiers ? towerGap(size) : 0;
  const shown = Math.max(1, Math.min(chips + paidChips, cap)) + tiers;
  const base = settle === "won" && chips + paidChips > cap ? Math.max(1, Math.min(cap - 1, Math.round(cap * chips / (chips + paidChips)))) : Math.min(chips, shown);
  const paying = settle === "won" && shown > base;
  const seen = useRef6(null);
  if (!seen.current) seen.current = { shown, from: shown };
  else if (seen.current.shown !== shown)
    seen.current = { shown, from: shown > seen.current.shown ? seen.current.shown : shown };
  const dropped = settle ? 0 : Math.max(0, shown - seen.current.from);
  const { D, pad, rx, ry, t, cx, width, yFace, height: body } = stackGeometry(size, shown);
  const height = body + gap;
  const inserts = edgeInserts(identity.skin);
  const stroke = Math.max(0.8, D / 44);
  const light = identity.isLight;
  const value = stake + (settle === "won" ? paid : 0);
  const capped = chips + paidChips > cap;
  const breakAt = shown - tiers;
  const chipAt = (i) => {
    const yt = yFace + (shown - 1 - i) * t + (i < breakAt ? gap : 0);
    const isPaid = paying && i >= base;
    const isNew = !isPaid && i >= shown - dropped;
    return /* @__PURE__ */ React12.createElement(
      "g",
      {
        key: i,
        className: `fd-stack-chip${isPaid ? " is-paid" : ""}${isNew ? " is-drop" : ""}`,
        style: isPaid ? { animationDelay: `${delay + (i - base) * 70}ms` } : void 0
      },
      /* @__PURE__ */ React12.createElement(Rim, { cx, rx, ry, yt, t, inserts, turn: TURNS[i % TURNS.length] + 1, stroke })
    );
  };
  const rims = [];
  if (groups?.length) {
    let start = 0;
    groups.forEach((value2, index) => {
      const end = index === groups.length - 1 ? shown : Math.min(shown, start + stackChipCount(value2));
      if (end <= start) return;
      rims.push(/* @__PURE__ */ React12.createElement("g", { key: `tap-${index}`, className: "fd-stack-tap", "data-chip-stake": value2 }, Array.from({ length: end - start }, (_, k) => chipAt(start + k))));
      start = end;
    });
  } else for (let i = 0; i < shown; i++) rims.push(chipAt(i));
  if (tiers) {
    const yb = yFace + (shown - breakAt) * t + gap / 2;
    rims.push(/* @__PURE__ */ React12.createElement(
      "path",
      {
        key: "break",
        className: "fd-stack-break",
        strokeWidth: Math.max(1.2, D / 22),
        d: `M${r2(cx - rx)} ${r2(yb)}A${r2(rx)} ${r2(ry)} 0 0 0 ${r2(cx + rx)} ${r2(yb)}`
      }
    ));
  }
  const rise = paying ? (shown - base) * t : 0;
  const stampPx = chip2 && identity.num != null ? D * (String(identity.num).length > 3 ? 0.25 : String(identity.num).length > 2 ? 0.3 : 0.36) : 0;
  const stamp = chip2 && stampPx >= floor2 - 0.25 ? identity.num : null;
  return /* @__PURE__ */ React12.createElement(
    "span",
    {
      className: `fd-stack${light ? " is-light" : ""}${mine ? " is-mine" : ""}${settle ? ` is-${settle}` : ""}`,
      style: { "--stack-color": identity.color, width, animationDelay: settle === "lost" ? `${delay}ms` : void 0 },
      "data-stack-player": chip2 ? void 0 : p,
      "data-chip-value": chip2 ? chip2.stamp : void 0,
      "data-stack-chips": shown,
      "data-stack-tower": tiers || void 0
    },
    capped && tag && /* @__PURE__ */ React12.createElement("span", { className: "fd-stack-tag", style: tagSize ? { fontSize: tagSize } : void 0 }, fmt(value)),
    /* @__PURE__ */ React12.createElement("svg", { width: r2(width), height: r2(height), viewBox: `0 0 ${r2(width)} ${r2(height)}`, "aria-hidden": "true" }, mine && /* @__PURE__ */ React12.createElement(
      "ellipse",
      {
        className: "fd-stack-ring",
        cx: r2(cx),
        cy: r2(yFace + shown * t + gap + 1.5),
        rx: r2(rx + 2.5),
        ry: r2(ry + 2),
        strokeWidth: Math.max(1.6, D / 18)
      }
    ), rims, /* @__PURE__ */ React12.createElement(
      "g",
      {
        key: `face-${shown}`,
        className: `fd-stack-face${dropped ? " is-drop" : ""}${paying ? " is-rising" : ""}`,
        style: paying ? {
          "--stack-rise": `${r2(rise)}px`,
          animationDelay: `${delay}ms`,
          animationDuration: `${(shown - base) * 70 + 120}ms`
        } : void 0
      },
      /* @__PURE__ */ React12.createElement("g", { transform: `translate(${r2(pad)} ${r2(yFace - D * STACK_TILT / 2)}) scale(1 ${STACK_TILT})` }, /* @__PURE__ */ React12.createElement(
        ChipFace,
        {
          p,
          size: D,
          flat: true,
          ...chip2 ? { stamp: "", color: identity.color, isLight: identity.isLight, skin: identity.skin } : {}
        }
      )),
      D >= 20 && stamp != null && /* @__PURE__ */ React12.createElement(
        "text",
        {
          x: r2(cx),
          y: r2(yFace + D * 0.02),
          textAnchor: "middle",
          dominantBaseline: "central",
          fontFamily: DISPLAY,
          fontWeight: "700",
          className: "fd-stack-num",
          fontSize: r2(stampPx),
          transform: `translate(0 ${r2(yFace)}) scale(1 .86) translate(0 ${r2(-yFace)})`
        },
        stamp
      )
    ))
  );
}
function StackGroup({ rest, size = 40, cap = STACK_CAP, names = false, label: label2 = true, valueAt = "below", style = void 0 }) {
  const players = rest.players;
  const value = /* @__PURE__ */ React12.createElement("span", { className: "fd-stacks-value" }, fmt(rest.total));
  return /* @__PURE__ */ React12.createElement(
    "div",
    {
      className: "fd-stacks-slot fd-stacks-group",
      role: "img",
      style,
      "aria-label": `${players.length} more: ${fmt(rest.total)} chips`
    },
    /* @__PURE__ */ React12.createElement("span", { className: "fd-stacks-body" }, /* @__PURE__ */ React12.createElement(
      ChipStack,
      {
        chip: groupChip(players.length),
        count: stackChipCount(rest.total),
        size,
        cap,
        tag: false,
        tower: true
      }
    ), valueAt === "side" && value),
    valueAt !== "side" && value,
    names && label2 && /* @__PURE__ */ React12.createElement("span", { className: "fd-stacks-name fd-stacks-count" }, "+", players.length)
  );
}
function BetStacks({
  stacks,
  size = 40,
  names = null,
  cap = STACK_CAP,
  settle = null,
  delay = 0,
  className = "",
  mine = null,
  slots = Infinity,
  valueAt = "below"
}) {
  if (!stacks?.length) return null;
  const { shown, rest } = groupStacks(stacks, slots, mine);
  return /* @__PURE__ */ React12.createElement("div", { className: `fd-stacks${valueAt === "side" ? " is-value-side" : ""}${className ? ` ${className}` : ""}` }, shown.map((item, index) => {
    const result = settle || item.status || null;
    const at = delay + index * 90;
    const value = /* @__PURE__ */ React12.createElement("span", { className: "fd-stacks-value" }, fmt(item.stake + (result === "won" ? item.paid || 0 : 0)));
    return /* @__PURE__ */ React12.createElement(
      "div",
      {
        key: item.player,
        className: `fd-stacks-slot${result === "lost" ? " is-lost" : ""}`,
        style: result === "lost" ? { animationDelay: `${at}ms` } : void 0
      },
      /* @__PURE__ */ React12.createElement("span", { className: "fd-stacks-body" }, /* @__PURE__ */ React12.createElement(
        ChipStack,
        {
          p: item.player,
          stake: item.stake,
          paid: item.paid || 0,
          size,
          cap,
          tag: false,
          tower: true,
          settle: result === "won" ? "won" : null,
          delay: at,
          mine: !!mine && item.player === mine
        }
      ), valueAt === "side" && value),
      valueAt !== "side" && value,
      names && /* @__PURE__ */ React12.createElement("span", { className: "fd-stacks-name" }, names(item.player))
    );
  }), rest && /* @__PURE__ */ React12.createElement(StackGroup, { key: "group", rest, size, cap, names: !!names, valueAt }));
}
var fmt, r2, FACET, TURNS, groupChip;
var init_BetStacks = __esm({
  "src/features/wagers/BetStacks.jsx"() {
    init_theme();
    init_PlayerIdentity();
    init_PlayerIdentityContext();
    init_chipCoin();
    init_betStacks();
    init_bet_stacks();
    fmt = (n) => (Number(n) || 0).toLocaleString("en-US");
    r2 = (n) => Math.round(n * 100) / 100;
    FACET = 360 / COIN_FACETS;
    TURNS = [0, 0, 1, 0, 2, 0, 1];
    groupChip = (count) => ({ color: "var(--silver)", isLight: true, skin: "plain", stamp: `+${count}` });
  }
});

// src/ui/payout-ladder.css
var init_payout_ladder = __esm({
  "src/ui/payout-ladder.css"() {
  }
});

// src/ui/PayoutLadder.jsx
import React13 from "react";
function payoutSteps(pays, { crew = null } = {}) {
  const table = Array.isArray(pays) ? pays : [0, 0, 0];
  const places = table.map((amount, i) => ({ place: i + 1, amount: Number(amount) || 0 })).filter((step) => step.amount > 0);
  if (crew && Number(crew) > 0) places.push({ place: null, amount: Number(crew), crew: true });
  return places;
}
function ladderChips(amount, top, max) {
  if (!max) return 0;
  const unit = Math.max(100, Math.ceil(top / max / 100) * 100);
  return Math.max(1, Math.round(amount / unit));
}
function podiumOrder(steps) {
  const by = (place) => steps.find((step) => step.place === place);
  const order = steps.length >= 2 && by(2) ? [by(2), by(1), ...steps.filter((step) => step.place !== 1 && step.place !== 2)] : steps;
  return order.filter(Boolean);
}
function Winners({ state, players = [], label: label2 = null, size, me = null, onPlayer = null }) {
  if (!state || !players.length) return null;
  const named = players.length <= 2;
  const name = (p) => state.profiles?.[p]?.display || p;
  return /* @__PURE__ */ React13.createElement("span", { className: "fd-ladder-winners" }, /* @__PURE__ */ React13.createElement("span", { className: "fd-ladder-faces" }, players.map((p) => onPlayer ? /* @__PURE__ */ React13.createElement(
    "button",
    {
      key: p,
      type: "button",
      className: `fd-ladder-face${p === me ? " is-you" : ""}`,
      onClick: () => onPlayer(p),
      "aria-label": `View ${name(p)}'s player card`
    },
    /* @__PURE__ */ React13.createElement(Avatar, { state, p, size })
  ) : /* @__PURE__ */ React13.createElement(Avatar, { key: p, state, p, size }))), /* @__PURE__ */ React13.createElement("span", { className: "fd-ladder-who" }, named ? players.map(name).join(" & ") : label2 || `${players.length} players`));
}
function PayoutLadder({
  ev = null,
  pays = null,
  size = "phone",
  crew = null,
  className = "",
  state = null,
  winners = null,
  labels = null,
  me = null,
  onPlayer = null
}) {
  const table = pays || awardTable(ev);
  const steps = payoutSteps(table, { crew });
  if (!steps.length) return null;
  const s = SIZES3[size] || SIZES3.phone;
  const label2 = steps.map((step) => `${step.crew ? "Crew" : PLACE_LABEL[step.place - 1]} ${fmt2(step.amount)}`).join(", ");
  if (!s.podium) {
    const shown = size === "tiny" ? steps.slice(0, 1) : steps;
    return /* @__PURE__ */ React13.createElement("ol", { className: `fd-ladder is-${size}${className ? ` ${className}` : ""}`, "aria-label": label2 }, shown.map((step) => /* @__PURE__ */ React13.createElement(
      "li",
      {
        key: step.crew ? "crew" : step.place,
        className: `fd-ladder-step is-place-${step.crew ? "crew" : step.place}`
      },
      /* @__PURE__ */ React13.createElement(
        "span",
        {
          className: "fd-ladder-medal",
          style: { width: s.medal, height: s.medal, fontSize: Math.round(s.medal * 0.5) },
          "aria-hidden": "true"
        },
        step.crew ? "" : step.place
      ),
      /* @__PURE__ */ React13.createElement("b", { className: "fd-ladder-amount", "aria-hidden": "true" }, fmt2(step.amount))
    )));
  }
  const top = Math.max(...steps.map((step) => step.amount));
  const order = podiumOrder(steps);
  const filled = !!winners && !!state;
  return /* @__PURE__ */ React13.createElement(
    "ol",
    {
      className: `fd-ladder is-podium is-${size}${filled ? " is-filled" : ""}${className ? ` ${className}` : ""}`,
      "aria-label": label2,
      style: { "--ladder-cols": order.length, "--ladder-step": `${s.step}px` }
    },
    order.map((step) => {
      const key = step.crew ? "crew" : step.place;
      const chips = ladderChips(step.amount, top, s.maxChips);
      const who = filled ? step.crew ? winners.crew || [] : winners[step.place - 1] || [] : [];
      return /* @__PURE__ */ React13.createElement("li", { key, className: `fd-ladder-step is-place-${key}`, style: { "--rise": STEP_RISE[key] } }, /* @__PURE__ */ React13.createElement("span", { className: "fd-ladder-stand", "aria-hidden": "true" }, /* @__PURE__ */ React13.createElement(
        ChipStack,
        {
          chip: { ...PLACE_CHIP[key], stamp: step.crew ? "" : String(step.place) },
          count: chips,
          size: s.chip,
          cap: s.maxChips,
          tag: false
        }
      ), /* @__PURE__ */ React13.createElement("span", { className: "fd-ladder-plinth" }, /* @__PURE__ */ React13.createElement("b", { className: "fd-ladder-amount" }, fmt2(step.amount)))), filled && /* @__PURE__ */ React13.createElement(
        Winners,
        {
          state,
          players: who,
          label: labels?.[step.crew ? "crew" : step.place - 1],
          size: s.avatar,
          me,
          onPlayer
        }
      ));
    })
  );
}
var fmt2, SIZES3, PLACE_LABEL, STEP_RISE, PLACE_CHIP;
var init_PayoutLadder = __esm({
  "src/ui/PayoutLadder.jsx"() {
    init_core();
    init_BetStacks();
    init_PlayerIdentity();
    init_payout_ladder();
    fmt2 = (n) => (Number(n) || 0).toLocaleString("en-US");
    SIZES3 = {
      tv: { chip: 76, maxChips: 9, step: 132, avatar: 56, podium: true },
      phone: { chip: 42, maxChips: 8, step: 72, avatar: 36, podium: true },
      ticker: { medal: 48, podium: false },
      tiny: { medal: 24, podium: false }
    };
    PLACE_LABEL = ["1st", "2nd", "3rd"];
    STEP_RISE = { 1: 1, 2: 0.78, 3: 0.6, crew: 0.52 };
    PLACE_CHIP = {
      1: { color: "var(--sun)", isLight: true, skin: "plain" },
      2: { color: "var(--silver)", isLight: true, skin: "plain" },
      3: { color: "var(--bronze)", isLight: true, skin: "plain" },
      crew: { color: "var(--muted)", isLight: false, skin: "plain" }
    };
  }
});

// src/ui/GameMark.jsx
import React15 from "react";
function GameMark({ id, size = 54, hero = false, variant }) {
  const glyph = MARKS[variant ? `${id}:${variant}` : id] || MARKS[id] || CHIP;
  const small = size <= 34;
  const scale = small ? 0.9 : 0.76;
  const stroke = size <= 28 ? 2.05 : size <= 48 ? 1.85 : size <= 96 ? 1.65 : 1.45;
  const at = 12 - 12 * scale;
  const glass = hero ? "var(--paper)" : "var(--paper2)";
  return /* @__PURE__ */ React15.createElement(
    "svg",
    {
      className: `fd-game-mark${hero ? " is-hero" : ""}`,
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      "aria-hidden": "true",
      focusable: "false",
      style: { flexShrink: 0, display: "block", color: "var(--fd-mark-ink, var(--ink))", "--fd-mark-glass": glass }
    },
    /* @__PURE__ */ React15.createElement("circle", { cx: "12", cy: "12", r: "11.9", fill: "var(--ink0)" }),
    /* @__PURE__ */ React15.createElement("circle", { cx: "12", cy: "12", r: small ? 11.1 : 10.9, fill: glass }),
    /* @__PURE__ */ React15.createElement(
      "path",
      {
        d: small ? "M2.2 13.6a9.9 9.9 0 0 0 19.6 0" : "M2.4 13.6a9.7 9.7 0 0 0 19.2 0",
        fill: "none",
        stroke: "var(--bone)",
        strokeOpacity: ".16",
        strokeWidth: ".5",
        strokeLinecap: "round"
      }
    ),
    /* @__PURE__ */ React15.createElement(
      "g",
      {
        transform: `translate(${at} ${at}) scale(${scale})`,
        fill: "none",
        stroke: "currentColor",
        strokeWidth: stroke,
        strokeLinecap: "round",
        strokeLinejoin: "round"
      },
      glyph
    )
  );
}
var BALL, MARKS, CHIP, GAME_MARK_IDS;
var init_GameMark = __esm({
  "src/ui/GameMark.jsx"() {
    BALL = { fill: "currentColor", stroke: "none" };
    MARKS = {
      /* Long Putt: the flag, the cup, and a ball a long way out */
      putting: /* @__PURE__ */ React15.createElement(React15.Fragment, null, /* @__PURE__ */ React15.createElement("path", { d: "M14 18.6V4.2" }), /* @__PURE__ */ React15.createElement("path", { d: "M14 4.2 19.6 6.6 14 9z", fill: "currentColor" }), /* @__PURE__ */ React15.createElement("ellipse", { cx: "14", cy: "18.8", rx: "3.4", ry: "1.15" }), /* @__PURE__ */ React15.createElement("circle", { cx: "5.2", cy: "18.6", r: "1.75", ...BALL })),
      /* Beer Die: the die mid-toss */
      die: /* @__PURE__ */ React15.createElement(React15.Fragment, null, /* @__PURE__ */ React15.createElement("rect", { x: "5.4", y: "5.4", width: "13.2", height: "13.2", rx: "3", transform: "rotate(-12 12 12)" }), /* @__PURE__ */ React15.createElement("g", { ...BALL }, /* @__PURE__ */ React15.createElement("circle", { cx: "8.8", cy: "9.4", r: "1.35" }), /* @__PURE__ */ React15.createElement("circle", { cx: "12", cy: "12", r: "1.35" }), /* @__PURE__ */ React15.createElement("circle", { cx: "15.2", cy: "14.6", r: "1.35" }))),
      /* Where and When: a pin dropped on the map, its ring on the ground */
      where: /* @__PURE__ */ React15.createElement(React15.Fragment, null, /* @__PURE__ */ React15.createElement("path", { d: "M12 16.6s-5-4.3-5-8.4a5 5 0 0 1 10 0c0 4.1-5 8.4-5 8.4z" }), /* @__PURE__ */ React15.createElement("circle", { cx: "12", cy: "8.2", r: "1.9", ...BALL }), /* @__PURE__ */ React15.createElement("path", { d: "M7.4 16.9c-2 .5-3.2 1.2-3.2 2 0 1.4 3.5 2.4 7.8 2.4s7.8-1 7.8-2.4c0-.8-1.2-1.5-3.2-2" })),
      /* basketball: a ball with its seams (5v5); 1v1 is the hoop, side on, the
         shot coming in */
      basketball: /* @__PURE__ */ React15.createElement(React15.Fragment, null, /* @__PURE__ */ React15.createElement("circle", { cx: "12", cy: "12", r: "8.4" }), /* @__PURE__ */ React15.createElement("path", { d: "M3.6 12h16.8M12 3.6v16.8M6.1 6c2.4 1.6 3.4 3.6 3.4 6s-1 4.4-3.4 6M17.9 6c-2.4 1.6-3.4 3.6-3.4 6s1 4.4 3.4 6" })),
      "basketball:1v1": /* @__PURE__ */ React15.createElement(React15.Fragment, null, /* @__PURE__ */ React15.createElement("path", { d: "M17.2 3.4v9M17.2 8h2.6v12.6" }), /* @__PURE__ */ React15.createElement("path", { d: "M8.6 10.2h8.6M9.4 10.2l1.6 5.6h3.4l1.6-5.6" }), /* @__PURE__ */ React15.createElement("circle", { cx: "6.2", cy: "5.2", r: "2.4", ...BALL })),
      /* Pickleball: the paddle and the holed ball */
      pickleball: /* @__PURE__ */ React15.createElement(React15.Fragment, null, /* @__PURE__ */ React15.createElement("g", { transform: "rotate(-32 10.4 10.4)" }, /* @__PURE__ */ React15.createElement("rect", { x: "5.4", y: "2.8", width: "10", height: "11.6", rx: "3.2" }), /* @__PURE__ */ React15.createElement("path", { d: "M10.4 14.4v5.6", strokeWidth: "2.8" })), /* @__PURE__ */ React15.createElement("circle", { cx: "17.8", cy: "17.6", r: "2.9", ...BALL }), /* @__PURE__ */ React15.createElement("g", { fill: "var(--fd-mark-glass)", stroke: "none" }, /* @__PURE__ */ React15.createElement("circle", { cx: "16.9", cy: "16.8", r: ".55" }), /* @__PURE__ */ React15.createElement("circle", { cx: "18.7", cy: "16.8", r: ".55" }), /* @__PURE__ */ React15.createElement("circle", { cx: "17.8", cy: "18.5", r: ".55" }))),
      /* Volleyball: the ball over the net (three seams from one point read as
         a star at 24px, so the ball carries two curved panel lines and the net
         says the game) */
      volleyball: /* @__PURE__ */ React15.createElement(React15.Fragment, null, /* @__PURE__ */ React15.createElement("circle", { cx: "12", cy: "8.6", r: "5.6" }), /* @__PURE__ */ React15.createElement("path", { d: "M7.3 5.9c2.9-.3 5.9 1.1 7.6 3.7M6.9 10.6c2.8-1.4 6.3-1.3 8.9.6M10.3 3.3c1.9 1.6 2.9 4.1 2.6 6.6" }), /* @__PURE__ */ React15.createElement("path", { d: "M3.6 16.6h16.8M3.6 20.2h16.8M3.6 16.6v3.6M20.4 16.6v3.6M7.8 16.6v3.6M12 16.6v3.6M16.2 16.6v3.6", strokeWidth: ".9" })),
      /* Trivia: a card with the question on it */
      trivia: /* @__PURE__ */ React15.createElement(React15.Fragment, null, /* @__PURE__ */ React15.createElement("rect", { x: "4.8", y: "3.6", width: "14.4", height: "16.8", rx: "2.4" }), /* @__PURE__ */ React15.createElement("path", { d: "M9.6 9.6a2.4 2.4 0 1 1 3.6 2.1c-.8.5-1.2 1-1.2 1.9v.5" }), /* @__PURE__ */ React15.createElement("circle", { cx: "12", cy: "16.9", r: "1.2", ...BALL })),
      /* 8-Ball: the black ball's window and its 8 */
      "8ball": /* @__PURE__ */ React15.createElement(React15.Fragment, null, /* @__PURE__ */ React15.createElement("circle", { cx: "12", cy: "12", r: "8.4" }), /* @__PURE__ */ React15.createElement("circle", { cx: "12", cy: "11.2", r: "3.9", ...BALL }), /* @__PURE__ */ React15.createElement("g", { stroke: "var(--fd-mark-glass)", strokeWidth: "1" }, /* @__PURE__ */ React15.createElement("circle", { cx: "12", cy: "9.9", r: "1" }), /* @__PURE__ */ React15.createElement("circle", { cx: "12", cy: "12.45", r: "1.3" }))),
      /* Beer Pong: the ball dropping into the cup */
      pong: /* @__PURE__ */ React15.createElement(React15.Fragment, null, /* @__PURE__ */ React15.createElement("path", { d: "M6.6 10.2h10.8M7.3 10.2l1.4 9a1.5 1.5 0 0 0 1.5 1.3h3.6a1.5 1.5 0 0 0 1.5-1.3l1.4-9" }), /* @__PURE__ */ React15.createElement("path", { d: "M7.9 14h8.2" }), /* @__PURE__ */ React15.createElement("circle", { cx: "14.6", cy: "4.9", r: "2", ...BALL })),
      /* Rage Cage: a cup stacked on a cup, the ball after it */
      ragecage: /* @__PURE__ */ React15.createElement(React15.Fragment, null, /* @__PURE__ */ React15.createElement("path", { d: "M4.6 12.4h9.6M5.2 12.4l1.2 7.2a1.3 1.3 0 0 0 1.3 1.1h4.4a1.3 1.3 0 0 0 1.3-1.1l1.2-7.2" }), /* @__PURE__ */ React15.createElement("path", { d: "M6.8 8.2h9.6M7.4 8.2l.6 4.2M15.8 8.2l-1 6.2" }), /* @__PURE__ */ React15.createElement("circle", { cx: "18.2", cy: "4.8", r: "1.8", ...BALL })),
      /* Beerio Kart: the wheel */
      beerio: /* @__PURE__ */ React15.createElement(React15.Fragment, null, /* @__PURE__ */ React15.createElement("circle", { cx: "12", cy: "12", r: "8.4" }), /* @__PURE__ */ React15.createElement("circle", { cx: "12", cy: "12.6", r: "2.4", ...BALL }), /* @__PURE__ */ React15.createElement("path", { d: "M3.7 11.6c2.3-.6 4.6-.6 6 .3M20.3 11.6c-2.3-.6-4.6-.6-6 .3M12 15v5.3" })),
      /* Poker: two cards, the front one showing its pip */
      poker: /* @__PURE__ */ React15.createElement(React15.Fragment, null, /* @__PURE__ */ React15.createElement("rect", { x: "4.2", y: "5", width: "9.4", height: "13.4", rx: "1.9", transform: "rotate(-12 8.9 11.7)" }), /* @__PURE__ */ React15.createElement("rect", { x: "10.2", y: "4.6", width: "9.4", height: "13.4", rx: "1.9", transform: "rotate(10 14.9 11.3)", fill: "var(--fd-mark-glass)" }), /* @__PURE__ */ React15.createElement("path", { d: "m14.8 8.3 2.4 3.1-2.4 3.1-2.4-3.1z", ...BALL })),
      /* earlier slates (kept for their events and the add-event picker) */
      spikeball: /* @__PURE__ */ React15.createElement(React15.Fragment, null, /* @__PURE__ */ React15.createElement("ellipse", { cx: "12", cy: "16.2", rx: "8.2", ry: "3.2" }), /* @__PURE__ */ React15.createElement("path", { d: "M6 18.4 4.8 20.6M18 18.4l1.2 2.2M8.4 15.6h7.2" }), /* @__PURE__ */ React15.createElement("circle", { cx: "12", cy: "6.4", r: "2.6", ...BALL })),
      pingpong: /* @__PURE__ */ React15.createElement(React15.Fragment, null, /* @__PURE__ */ React15.createElement("circle", { cx: "10", cy: "9.6", r: "5.6" }), /* @__PURE__ */ React15.createElement("path", { d: "m6.2 13.8-2.6 4.4", strokeWidth: "2.6" }), /* @__PURE__ */ React15.createElement("circle", { cx: "17.6", cy: "17", r: "2.2", ...BALL })),
      foosball: /* @__PURE__ */ React15.createElement(React15.Fragment, null, /* @__PURE__ */ React15.createElement("path", { d: "M3.6 6.2h16.8" }), /* @__PURE__ */ React15.createElement("circle", { cx: "12", cy: "9.4", r: "2.1" }), /* @__PURE__ */ React15.createElement("path", { d: "M12 11.5v4.3M9.4 13h5.2M12 15.8l-2.6 3.8M12 15.8l2.6 3.8" }), /* @__PURE__ */ React15.createElement("circle", { cx: "18.4", cy: "18.6", r: "1.8", ...BALL }))
    };
    CHIP = /* @__PURE__ */ React15.createElement(React15.Fragment, null, /* @__PURE__ */ React15.createElement("circle", { cx: "12", cy: "12", r: "8.4" }), /* @__PURE__ */ React15.createElement("circle", { cx: "12", cy: "12", r: "3", ...BALL }), /* @__PURE__ */ React15.createElement("path", { d: [30, 90, 150, 210, 270, 330].map((deg) => {
      const a = deg * Math.PI / 180, x = (r) => (12 + Math.cos(a) * r).toFixed(2), y = (r) => (12 + Math.sin(a) * r).toFixed(2);
      return `M${x(5.2)} ${y(5.2)}L${x(6.6)} ${y(6.6)}`;
    }).join("") }));
    GAME_MARK_IDS = Object.freeze(Object.keys(MARKS).filter((id) => !id.includes(":")));
  }
});

// src/features/intro/introTiming.js
function introScene(ev) {
  const game = ev?.game || null;
  if (!game) return FALLBACK_SCENE;
  if (game === "basketball") return ev?.variant === "1v1" ? "basketball:1v1" : "basketball:5v5";
  return INTRO_SCENES.includes(game) ? game : FALLBACK_SCENE;
}
function introElapsed(anchor, now2, { reduced = false } = {}) {
  const a = Number(anchor), n = Number(now2);
  if (reduced || !Number.isFinite(a) || a <= 0 || !Number.isFinite(n)) return reduced ? INTRO_MS : 0;
  return Math.max(-INTRO_LEAD_MS, Math.min(INTRO_MS, n - a));
}
var INTRO_TIMING, INTRO_MS, INTRO_REDUCED_MS, INTRO_SCENES, FALLBACK_SCENE, INTRO_LEAD_MS;
var init_introTiming = __esm({
  "src/features/intro/introTiming.js"() {
    INTRO_TIMING = Object.freeze({
      flicker: 0,
      flickerMs: 560,
      // lean-in: the glass is dark, the backlight warms up and catches
      dolly: 120,
      dollyMs: 1500,
      // the painting's plates and the game's set push in, near plates most
      play: 700,
      // the game's move starts (the wind-up, the toss, the break)
      hit: 1800,
      // the hero beat lands: the drop, the swish, the stack
      nameMs: 380,
      // the game's name stamps on the hit
      sweep: 2200,
      sweepMs: 800,
      // light crosses the glass and the lettering
      ladder: 2500,
      ladderMs: 420,
      // what it pays rises (TV)
      recede: 3750,
      recedeMs: 450,
      // a draw behind it: the set dims, the name docks where the draw letters it
      total: 4200
    });
    INTRO_MS = INTRO_TIMING.total;
    INTRO_REDUCED_MS = 650;
    INTRO_SCENES = Object.freeze([
      "putting",
      "die",
      "where",
      "basketball:5v5",
      "pickleball",
      "basketball:1v1",
      "volleyball",
      "trivia",
      "8ball",
      "pong",
      "ragecage",
      "beerio",
      "poker"
    ]);
    FALLBACK_SCENE = "mark";
    INTRO_LEAD_MS = 1e3;
  }
});

// src/features/weekend/drawReveal.js
function drawRevealGroups(state, reveal) {
  return reveal.versus ? reveal.versus.map((team, index) => ({
    title: team.name || `Team ${index + 1}`,
    lines: [{ avatars: team.players, text: team.players.map((player) => disp(state, player)).join(" & ") }]
  })) : reveal.groups || [];
}
function partnerFaces(group) {
  const lines = group?.lines || [];
  const count = (line) => (line.avatars || []).length;
  if (group?.bye) return lines.map(() => -1);
  if (group?.vs) return lines.map((line) => partnerDelay(count(line) - 1, count(line)) ? count(line) - 1 : -1);
  const faces = lines.reduce((n, line) => n + Math.max(1, count(line)), 0);
  return lines.map((line, j) => faces > 1 && j === lines.length - 1 && count(line) ? count(line) - 1 : -1);
}
function drawStepAt(elapsed, total) {
  const count = Math.max(0, Math.floor(Number(total) || 0));
  const t = Number(elapsed);
  if (!count || !Number.isFinite(t)) return 0;
  let shown = 0;
  while (shown < count && drawStepDelay(shown, count) <= t) shown++;
  return shown;
}
function revealTimeline(state, evId, { reveal = null, reducedMotion = false } = {}) {
  const announcedAt = Number(state?.eventOps?.[evId]?.announcedAt) || 0;
  if (!announcedAt) return null;
  const handoffAt = announcedAt + (reducedMotion ? DRAW_INTRO_REDUCED_MS : DRAW_INTRO_MS);
  const item = reveal ? saved(state, reveal) : null;
  const drewAt = item ? revealTime(state, evId, item) : 0;
  return { introAt: announcedAt, handoffAt, revealAt: Math.max(handoffAt, drewAt || 0) };
}
function startDrawPlayback({
  total,
  reducedMotion = false,
  onStep,
  schedule = setTimeout,
  cancel = clearTimeout,
  startAt = null,
  now: now2 = null
}) {
  let active = true;
  const timers = [];
  const stop = () => {
    active = false;
    timers.forEach(cancel);
  };
  const skip = () => {
    stop();
    onStep(total);
  };
  const anchored = Number.isFinite(startAt) && typeof now2 === "function";
  const elapsed = anchored ? now2() - startAt : 0;
  const joined = reducedMotion || total === 0 ? total : drawStepAt(elapsed, total);
  if (joined >= total) onStep(total);
  else {
    onStep(joined);
    for (let index = joined; index < total; index++) {
      const delay = Math.max(0, drawStepDelay(index, total) - elapsed);
      timers.push(schedule(() => {
        if (active) onStep(index + 1);
      }, delay));
    }
  }
  return { stop, skip, joined };
}
var REVEAL_FRESH_MS, revealTime, DRAW_INTRO_MS, DRAW_INTRO_REDUCED_MS, DRAW_FIRST_STEP_MS, DRAW_STEP_MS, DRAW_STEP_MIN_MS, DRAW_SEQUENCE_CAP_MS, DRAW_PARTNER_BEAT_MS, drawStepGap, drawStepDelay, partnerDelay, saved;
var init_drawReveal = __esm({
  "src/features/weekend/drawReveal.js"() {
    init_introTiming();
    init_core();
    REVEAL_FRESH_MS = 2 * 60 * 1e3;
    revealTime = (state, evId, item) => Number(item.ts) || Number(state.eventOps?.[evId]?.drawRevealedAt) || parseInt(String(item.id).replace(/^\D+/, ""), 10) || 0;
    DRAW_INTRO_MS = INTRO_MS;
    DRAW_INTRO_REDUCED_MS = INTRO_REDUCED_MS;
    DRAW_FIRST_STEP_MS = 480;
    DRAW_STEP_MS = 2e3;
    DRAW_STEP_MIN_MS = 1300;
    DRAW_SEQUENCE_CAP_MS = 16e3;
    DRAW_PARTNER_BEAT_MS = 900;
    drawStepGap = (total) => total <= 1 ? DRAW_STEP_MS : Math.max(DRAW_STEP_MIN_MS, Math.min(DRAW_STEP_MS, DRAW_SEQUENCE_CAP_MS / (total - 1)));
    drawStepDelay = (index, total) => DRAW_FIRST_STEP_MS + index * drawStepGap(total);
    partnerDelay = (faceIndex, faces) => faces > 1 && faceIndex === faces - 1 ? DRAW_PARTNER_BEAT_MS : 0;
    saved = (state, reveal) => {
      const draw = state?.draws?.[reveal?.evId], stage = state?.stages?.[reveal?.evId];
      return draw?.id === reveal?.id ? draw : stage?.id === reveal?.id ? stage : null;
    };
  }
});

// src/ui/motion.js
var init_motion2 = __esm({
  "src/ui/motion.js"() {
    init_motion();
  }
});

// src/features/identity/chip-coin.css
var init_chip_coin = __esm({
  "src/features/identity/chip-coin.css"() {
  }
});

// src/features/identity/ChipCoin.jsx
import React16, { useEffect as useEffect7, useRef as useRef7, useState as useState8 } from "react";
function ChipCoin({ p, size = 48, stamp, fallback, mint = false, mintOnMount = false, className = "" }) {
  const identity = usePlayerIdentity(p);
  const reduced = useReducedMotion();
  const spinRef = useRef7(null);
  const drag = useRef7(null);
  const angle = useRef7(0);
  const frame2 = useRef7(0);
  const settle = useRef7(0);
  const dragged = useRef7(false);
  const claimed = identity.color !== CHIP_GRAY;
  const key = `${identity.color}|${identity.skin}`;
  const seen = useRef7(key);
  const [mints, setMints] = useState8(() => mintOnMount && claimed ? 1 : 0);
  useEffect7(() => {
    if (seen.current === key) return;
    seen.current = key;
    if (mint && claimed && !reduced) {
      angle.current = 0;
      setMints((count) => count + 1);
    }
  }, [key, mint, claimed, reduced]);
  useEffect7(() => () => {
    cancelAnimationFrame(frame2.current);
    clearTimeout(settle.current);
  }, []);
  if (reduced) return /* @__PURE__ */ React16.createElement("span", { className: `fd-coin is-static ${className}`, style: { width: size, height: size }, "aria-hidden": "true" }, /* @__PURE__ */ React16.createElement(ChipFace, { p, size, stamp, fallback }));
  const paint = () => {
    frame2.current = 0;
    if (spinRef.current) spinRef.current.style.transform = `rotateY(${angle.current.toFixed(2)}deg)`;
  };
  const onPointerDown = (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.stopPropagation();
    dragged.current = false;
    const el = spinRef.current;
    if (!el) return;
    if (settle.current) {
      clearTimeout(settle.current);
      settle.current = 0;
      angle.current = angleOf(getComputedStyle(el).transform);
    }
    el.style.transition = "none";
    paint();
    drag.current = { id: event.pointerId, x0: event.clientX, a0: angle.current, at: performance.now(), last: angle.current, v: 0 };
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
    }
  };
  const onPointerMove = (event) => {
    const d = drag.current;
    if (!d || event.pointerId !== d.id) return;
    event.stopPropagation();
    const dx = event.clientX - d.x0;
    if (Math.abs(dx) >= COIN_TAP_SLOP) dragged.current = true;
    if (!dragged.current) return;
    const now2 = performance.now();
    angle.current = d.a0 + dx * COIN_DEG_PER_PX;
    const dt = Math.max(1, now2 - d.at);
    d.v = d.v * 0.6 + (angle.current - d.last) / dt * 0.4;
    d.last = angle.current;
    d.at = now2;
    if (!frame2.current) frame2.current = requestAnimationFrame(paint);
  };
  const onPointerEnd = (event) => {
    const d = drag.current;
    if (!d || event.pointerId !== d.id) return;
    drag.current = null;
    if (!dragged.current) return;
    event.stopPropagation();
    cancelAnimationFrame(frame2.current);
    frame2.current = 0;
    const el = spinRef.current;
    if (!el) return;
    const idle = performance.now() - d.at > 90;
    const { target, duration } = coinSettle(angle.current, idle ? 0 : d.v);
    el.style.transition = `transform ${duration}ms cubic-bezier(.2,.8,.2,1)`;
    el.style.transform = `rotateY(${target}deg)`;
    settle.current = setTimeout(() => {
      settle.current = 0;
      angle.current = 0;
      el.style.transition = "none";
      el.style.transform = "rotateY(0deg)";
    }, duration + 30);
  };
  const g = coinGeometry(size);
  const inserts = edgeInserts(identity.skin);
  return /* @__PURE__ */ React16.createElement(
    "span",
    {
      className: `fd-coin${identity.isLight ? " is-light" : ""} ${className}`,
      "aria-hidden": "true",
      style: {
        width: size,
        height: size,
        perspective: `${size * 6}px`,
        "--coin-color": identity.color,
        "--coin-h": `${g.thickness}px`,
        "--coin-chord": `${g.chord.toFixed(2)}px`,
        "--coin-apothem": `${g.apothem.toFixed(2)}px`,
        "--coin-step": `${g.step}deg`
      },
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
      onClickCapture: (event) => {
        if (!dragged.current) return;
        dragged.current = false;
        event.stopPropagation();
        event.preventDefault();
      }
    },
    /* @__PURE__ */ React16.createElement("span", { key: mints, className: `fd-coin-drop${mints ? " is-minting" : ""}` }, /* @__PURE__ */ React16.createElement("span", { className: "fd-coin-spin", ref: spinRef }, inserts.map((ink, index) => /* @__PURE__ */ React16.createElement(
      "span",
      {
        key: index,
        className: `fd-coin-facet${ink ? " is-ink" : ""}`,
        style: { "--i": index }
      }
    )), /* @__PURE__ */ React16.createElement("span", { className: "fd-coin-face is-front" }, /* @__PURE__ */ React16.createElement(ChipFace, { p, size, stamp, fallback })), /* @__PURE__ */ React16.createElement("span", { className: "fd-coin-face is-back" }, /* @__PURE__ */ React16.createElement(ChipFace, { p, size, stamp, fallback }))))
  );
}
var angleOf;
var init_ChipCoin = __esm({
  "src/features/identity/ChipCoin.jsx"() {
    init_core();
    init_motion2();
    init_PlayerIdentity();
    init_PlayerIdentityContext();
    init_chipCoin();
    init_chip_coin();
    angleOf = (transform) => {
      const values = /matrix3d\(([^)]+)\)/.exec(transform || "")?.[1]?.split(",").map(Number);
      return values ? Math.atan2(-values[2], values[0]) * 180 / Math.PI : 0;
    };
  }
});

// src/lib/soundKit.js
function makeIR(ctx, len, decay) {
  const n = Math.max(1, Math.floor(ctx.sampleRate * len));
  const pre = Math.floor(ctx.sampleRate * 0.012);
  const b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = pre; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
  }
  return b;
}
function makeEngine(ctx, { room = "fri", listen = "tv", volume = 0.8, out = null } = {}) {
  const E = { ctx, listen, pan: 0 };
  E.master = ctx.createGain();
  E.master.gain.value = volume;
  E.hp = ctx.createBiquadFilter();
  E.hp.type = "highpass";
  E.hp.frequency.value = 25;
  E.comp = ctx.createDynamicsCompressor();
  E.comp.threshold.value = -12;
  E.comp.knee.value = 10;
  E.comp.ratio.value = 4;
  E.comp.attack.value = 2e-3;
  E.comp.release.value = 0.18;
  E.master.connect(E.hp);
  E.hp.connect(E.comp);
  E.comp.connect(out || ctx.destination);
  E.hush = ctx.createGain();
  E.hush.gain.value = 1;
  E.hush.connect(E.master);
  E.dry = ctx.createGain();
  E.dry.connect(E.hush);
  E.openDry = ctx.createGain();
  E.openDry.connect(E.master);
  E.wet = ctx.createGain();
  E.conv = ctx.createConvolver();
  E.wetTone = ctx.createBiquadFilter();
  E.wetTone.type = "lowpass";
  E.wetOut = ctx.createGain();
  E.wet.connect(E.conv);
  E.conv.connect(E.wetTone);
  E.wetTone.connect(E.wetOut);
  E.wetOut.connect(E.hush);
  const n = ctx.sampleRate * 2;
  E.noise = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = E.noise.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  setRoom(E, room);
  setListen(E, listen);
  return E;
}
function setRoom(E, key) {
  const k = roomKeyFor(key);
  if (E.roomKey === k && E.conv.buffer) return;
  const r = ROOMS[k];
  E.roomKey = k;
  E.conv.buffer = makeIR(E.ctx, r.len, r.decay);
  E.wetTone.frequency.value = r.tone;
  E.wetOut.gain.value = wetLevel(k, E.listen);
}
function setListen(E, listen) {
  E.listen = listen;
  E.hp.frequency.value = highpassFor(listen);
  E.wetOut.gain.value = wetLevel(E.roomKey, listen);
}
function track(E, ...nodes) {
  if (E.graph) E.graph.nodes.push(...nodes);
}
function trackSource(E, src) {
  const graph = E.graph;
  if (!graph) return;
  graph.pending++;
  src.onended = () => {
    src.onended = null;
    if (--graph.pending === 0 && graph.closed) releaseGraph(graph);
  };
}
function releaseGraph(graph) {
  for (const node of graph.nodes) {
    try {
      node.disconnect();
    } catch {
    }
  }
  graph.nodes.length = 0;
}
function voice(E, { pan = 0, send = 0.2, bright = 1, gain = 1 } = {}) {
  const c = E.ctx;
  const g = c.createGain();
  g.gain.value = gain;
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.Q.value = 0.5;
  lp.frequency.value = Math.min(18e3, 13e3 * bright);
  const p = c.createStereoPanner();
  p.pan.value = E.listen === "phone" ? 0 : clampPan(pan + (E.pan || 0));
  const s = c.createGain();
  s.gain.value = send;
  g.connect(lp);
  lp.connect(p);
  p.connect(E.open && E.openDry ? E.openDry : E.dry);
  p.connect(s);
  s.connect(E.wet);
  track(E, g, lp, p, s);
  return g;
}
function phantomPartials(f, listen = "phone") {
  if (listen !== "phone" || !(f > 0) || f >= PHANTOM.floor) return [];
  const out = [];
  for (let n = Math.max(2, Math.ceil(PHANTOM.floor / f)); n * f <= PHANTOM.ceil && out.length < PHANTOM.partials; n++)
    out.push({ n, f: n * f, amp: 0.55 / (out.length + 1) });
  return out;
}
function phantom(E, dest, t, f, d, peak, { a = 2e-3 } = {}) {
  for (const [k, part] of phantomPartials(f, E.listen).entries())
    mode(E, dest, t, part.f, Math.max(0.02, d * (0.8 - k * 0.14)), peak * part.amp, { a });
}
function mode(E, dest, t, f, d, peak, { a = 1e-3, drop = 0, type = "sine" } = {}) {
  const c = E.ctx;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f * (1 + drop), t);
  if (drop) o.frequency.exponentialRampToValueAtTime(f, t + Math.min(0.08, d * 0.6));
  const g = c.createGain();
  g.gain.setValueAtTime(1e-4, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(1e-4, t + a + d);
  o.connect(g);
  g.connect(dest);
  track(E, o, g);
  trackSource(E, o);
  o.start(t);
  o.stop(t + a + d + 0.03);
}
function burst(E, dest, t, { type = "bandpass", f = 2e3, q = 1, d = 0.02, peak = 0.5, a = 8e-4 } = {}) {
  const c = E.ctx;
  const s = c.createBufferSource();
  s.buffer = E.noise;
  const fl = c.createBiquadFilter();
  fl.type = type;
  fl.frequency.value = f;
  fl.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(1e-4, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(1e-4, t + a + d);
  s.connect(fl);
  fl.connect(g);
  g.connect(dest);
  track(E, s, fl, g);
  trackSource(E, s);
  s.start(t, Math.random() * 1.5, a + d + 0.05);
}
function swell(E, dest, t, { d = 0.6, f0 = 500, f1 = 900, q = 0.7, peak = 0.2 } = {}) {
  const c = E.ctx;
  const s = c.createBufferSource();
  s.buffer = E.noise;
  const fl = c.createBiquadFilter();
  fl.type = "bandpass";
  fl.Q.value = q;
  fl.frequency.setValueAtTime(f0, t);
  fl.frequency.linearRampToValueAtTime(f1, t + d);
  const g = c.createGain();
  g.gain.setValueAtTime(1e-4, t);
  g.gain.linearRampToValueAtTime(peak, t + d * 0.6);
  g.gain.exponentialRampToValueAtTime(1e-4, t + d);
  s.connect(fl);
  fl.connect(g);
  g.connect(dest);
  track(E, s, fl, g);
  trackSource(E, s);
  s.start(t, Math.random() * 0.5, d + 0.05);
}
function riffle(E, t, n, o = {}) {
  const gap = o.gap || 0.045;
  let x = 0;
  for (let i = 0; i < n; i++) {
    M.clack(E, t + x, {
      pitch: (o.pitch || 1) * (1 - i * 8e-3),
      gain: (o.gain ?? 0.8) * (0.9 - i * 0.03),
      bright: o.bright ?? 1,
      pan: o.pan || 0,
      double: i === n - 1
    });
    x += gap * rnd(0.85, 1.2);
  }
  return x;
}
function spinDown(E, t, o = {}) {
  const dur = o.dur || 1.1, g = o.gain ?? 0.8;
  let dt = 0.11, x = 0, i = 0;
  while (x < dur && i < 90) {
    const k = x / dur;
    M.clack(E, t + x, { pitch: 1.05 - 0.1 * k, gain: g * (0.3 + 0.4 * k), bright: 0.55, double: false, pan: o.pan || 0 });
    x += dt;
    dt = Math.max(9e-3, dt * 0.9);
    i++;
  }
  M.felt(E, t + x + 0.01, { gain: 0.45 * g });
}
function roll(E, t, o = {}) {
  const dur = o.dur || 0.6, from = o.from ?? 0.08, to = o.to ?? 0.55;
  const hits = Math.floor(dur * 24);
  for (let i = 0; i < hits; i++) {
    const k = i / Math.max(1, hits - 1);
    M.drum(E, t + i / 24 + rnd(-6e-3, 6e-3), { f: (o.f || 66) * rnd(0.99, 1.01), dec: 0.16, gain: from + (to - from) * k * k, send: 0.3 });
  }
}
function gameIntro(E, t, o = {}) {
  const chord = (at) => {
    M.drum(E, at, { f: NOTE.D2, dec: 0.8, gain: 0.75 });
    M.slap(E, at, { gain: 0.35 });
    M.bell(E, at + 0.01, NOTE.A4, { gain: 0.55, dec: 2.6 });
    M.bell(E, at + 0.07, NOTE.D5, { gain: 0.5, dec: 2.6 });
    M.bell(E, at + 0.14, NOTE.Fs5, { gain: 0.42, dec: 3 });
  };
  if (o.summary) {
    chord(t);
    return;
  }
  M.knock(E, t, { pitch: 0.7, gain: 0.4 });
  [0.09, 0.15, 0.26, 0.34].forEach((dt, i) => M.tick(E, t + dt, { gain: 0.25 + i * 0.05, pitch: 0.9 }));
  hum(E, t, 0.6, 180, 900, 0.07);
  (INTRO_FOLEY[o.game] || INTRO_FOLEY.mark)(E, t);
  chord(t + HIT);
  M.bell(E, t + INTRO_TIMING.sweep / 1e3 + 0.3, NOTE.A5, { gain: 0.14, dec: 1.6, send: 0.4 });
}
function chipPitch(height = 0) {
  return 1 + Math.min(CHIP_WEIGHT.heightCap, Math.max(0, Math.floor(Number(height) || 0))) * CHIP_WEIGHT.heightStep;
}
function chipPlaced(E, t, o = {}) {
  const denom = Number(o.denom) || 100;
  const p = chipPitch(o.height);
  if (denom >= 1e3) {
    M.drum(E, t, { f: NOTE.D2, dec: 0.3, gain: 0.5 });
    riffle(E, t + 4e-3, 3, { pitch: 0.92 * p, gap: 0.034, gain: 0.75 });
    return;
  }
  if (denom >= 500) {
    M.clack(E, t, { pitch: 0.86 * p });
    M.felt(E, t + 0.012, { gain: 0.55 });
    return;
  }
  if (denom >= 200) {
    M.clack(E, t, { pitch: 0.95 * p });
    M.clack(E, t + 0.028, { pitch: 0.97 * p, gain: 0.55, double: false });
    return;
  }
  M.clack(E, t, { pitch: p });
}
function whoosh(E, t, { d = 0.45, f0 = 320, f1 = 2600, peak = 0.32, pan = 0 } = {}) {
  const v = voice(E, { pan, send: 0.2, bright: 0.9 });
  swell(E, v, t, { d, f0, f1, q: 0.9, peak });
}
function playRecipe(E, id, t, { pan = 0, open = false, ...opts } = {}) {
  const s = SOUNDS[id];
  if (!s || !E) return false;
  const was = E.pan, outer = E.graph, wasOpen = E.open;
  const graph = { nodes: [], pending: 0, closed: false };
  E.pan = clampPan(pan);
  E.open = !!open;
  E.graph = graph;
  let played = false;
  try {
    s.play(E, t, opts);
    played = true;
  } finally {
    E.pan = was;
    E.open = wasOpen;
    E.graph = outer;
    graph.closed = true;
    if (graph.pending === 0 || !played) releaseGraph(graph);
  }
  return true;
}
var NOTE, LADDER, ladderNote, CROWN_CHORD, ROOMS, roomKeyFor, roomForPhase, PHONE_WET, wetLevel, highpassFor, rnd, clampPan, PHANTOM, M, HIT, PLAY, bloop, bounce, swish, hum, INTRO_FOLEY, KIT, CHIP_WEIGHT, PARTS, SOUNDS, SOUND_IDS, isSound, CHIP_DENSITY;
var init_soundKit = __esm({
  "src/lib/soundKit.js"() {
    init_introTiming();
    NOTE = Object.freeze({
      D2: 73.42,
      A2: 110,
      D3: 146.83,
      A3: 220,
      D4: 293.66,
      E4: 329.63,
      Fs4: 369.99,
      A4: 440,
      B4: 493.88,
      D5: 587.33,
      E5: 659.25,
      Fs5: 739.99,
      A5: 880,
      B5: 987.77,
      D6: 1174.66,
      E6: 1318.51,
      Fs6: 1479.98,
      A6: 1760
    });
    LADDER = Object.freeze([
      NOTE.D4,
      NOTE.E4,
      NOTE.Fs4,
      NOTE.A4,
      NOTE.B4,
      NOTE.D5,
      NOTE.E5,
      NOTE.Fs5,
      NOTE.A5,
      NOTE.B5,
      NOTE.D6,
      NOTE.E6,
      NOTE.Fs6,
      NOTE.A6
    ]);
    ladderNote = (step) => LADDER[Math.max(0, Math.min(LADDER.length - 1, Math.floor(Number(step) || 0)))];
    CROWN_CHORD = Object.freeze([
      NOTE.D3,
      NOTE.A3,
      NOTE.D4,
      NOTE.Fs4,
      NOTE.A4,
      NOTE.B4,
      NOTE.D5,
      NOTE.Fs5,
      NOTE.A5,
      NOTE.B5,
      NOTE.D6,
      NOTE.Fs6,
      NOTE.A6
    ]);
    ROOMS = Object.freeze({
      fri: Object.freeze({ len: 1, decay: 3.2, tone: 5200, wet: 0.16 }),
      sam: Object.freeze({ len: 0.8, decay: 3.6, tone: 6e3, wet: 0.12 }),
      sap: Object.freeze({ len: 1.2, decay: 3, tone: 4200, wet: 0.18 }),
      san: Object.freeze({ len: 1.8, decay: 2.6, tone: 2900, wet: 0.25 }),
      fin: Object.freeze({ len: 2.2, decay: 2.4, tone: 2500, wet: 0.28 })
    });
    roomKeyFor = (phase) => Object.prototype.hasOwnProperty.call(ROOMS, phase) ? phase : "fri";
    roomForPhase = (phase) => ROOMS[roomKeyFor(phase)];
    PHONE_WET = 0.45;
    wetLevel = (room, listen) => roomForPhase(room).wet * (listen === "phone" ? PHONE_WET : 1);
    highpassFor = (listen) => listen === "phone" ? 380 : 25;
    rnd = (a, b) => a + Math.random() * (b - a);
    clampPan = (pan) => Math.max(-1, Math.min(1, Number(pan) || 0));
    PHANTOM = Object.freeze({ floor: 400, ceil: 1500, partials: 4 });
    M = {
      /* clay chip on chip: a bright contact, two short body modes, and usually a second softer contact */
      clack(E, t, o = {}) {
        const p = (o.pitch || 1) * rnd(0.96, 1.04);
        const v = voice(E, { pan: o.pan || 0, send: o.send ?? 0.12, bright: o.bright ?? 1, gain: o.gain ?? 1 });
        burst(E, v, t, { f: 3300 * p, q: 2.2, d: 0.016, peak: 0.5 });
        mode(E, v, t, 2380 * p, 0.04, 0.24);
        mode(E, v, t, 3960 * p, 0.026, 0.13);
        mode(E, v, t, 5650 * p, 0.014, 0.05);
        mode(E, v, t, 250 * p, 0.022, 0.2);
        if (o.double !== false) {
          const t2 = t + rnd(9e-3, 0.016);
          burst(E, v, t2, { f: 3e3 * p, q: 2, d: 0.012, peak: 0.2 });
          mode(E, v, t2, 2450 * p, 0.025, 0.09);
        }
      },
      /* a chip or hand landing on felt */
      felt(E, t, o = {}) {
        const v = voice(E, { pan: o.pan || 0, send: 0.1, bright: 0.6, gain: o.gain ?? 1 });
        burst(E, v, t, { type: "lowpass", f: 520, q: 0.7, d: 0.09, peak: 0.7 });
        mode(E, v, t, 92, 0.13, 0.55, { drop: 0.5 });
        phantom(E, v, t, 92, 0.1, 0.5);
      },
      /* knuckle on a wooden table */
      knock(E, t, o = {}) {
        const p = (o.pitch || 1) * rnd(0.98, 1.02);
        const v = voice(E, { pan: o.pan || 0, send: 0.18, bright: 0.8, gain: o.gain ?? 1 });
        mode(E, v, t, 185 * p, 0.11, 0.55, { drop: 0.25 });
        phantom(E, v, t, 185 * p, 0.09, 0.45);
        mode(E, v, t, 530 * p, 0.05, 0.2);
        burst(E, v, t, { f: 1500 * p, q: 1.3, d: 0.014, peak: 0.3 });
      },
      /* a card turning over */
      tick(E, t, o = {}) {
        const v = voice(E, { pan: o.pan || 0, send: 0.15, bright: 1, gain: o.gain ?? 1 });
        burst(E, v, t, { type: "highpass", f: 2600, q: 0.7, d: 0.011, peak: 0.32 });
        burst(E, v, t + 4e-3, { f: 850, q: 0.9, d: 0.026, peak: 0.14 });
        mode(E, v, t, 1650 * (o.pitch || 1), 0.012, 0.06);
      },
      /* a card set down hard in its seat */
      slap(E, t, o = {}) {
        const v = voice(E, { pan: o.pan || 0, send: 0.16, bright: 0.8, gain: o.gain ?? 1 });
        burst(E, v, t, { f: 1150, q: 0.6, d: 0.055, peak: 0.75 });
        burst(E, v, t, { type: "lowpass", f: 400, q: 0.7, d: 0.08, peak: 0.5 });
        mode(E, v, t, 110, 0.09, 0.35, { drop: 0.4 });
        phantom(E, v, t, 110, 0.08, 0.35);
      },
      /* the sun-bell: celesta-like, harmonic, warm, short strike */
      bell(E, t, f, o = {}) {
        const dec = o.dec || 2.4;
        const v = voice(E, { pan: o.pan || 0, send: o.send ?? 0.38, bright: 1, gain: o.gain ?? 1 });
        [[1, 0.24, dec], [2, 0.07, dec * 0.45], [3, 0.022, dec * 0.3], [4.07, 0.035, dec * 0.14], [6.1, 0.012, dec * 0.07]].forEach(([r, amp, d]) => mode(E, v, t, f * r * (1 + rnd(-8e-4, 8e-4)), d, amp, { a: 3e-3 }));
        mode(E, v, t, f * 1.0025, dec * 0.8, 0.08, { a: 3e-3 });
        if (f < PHANTOM.floor) phantom(E, v, t, f, dec * 0.5, 0.2, { a: 3e-3 });
        burst(E, v, t, { type: "highpass", f: 4e3, d: 5e-3, peak: 0.04 });
      },
      /* a low singing bowl: inharmonic, slow beating */
      bowl(E, t, f, o = {}) {
        const dec = o.dec || 4.5;
        const v = voice(E, { pan: o.pan || 0, send: 0.45, bright: 0.9, gain: o.gain ?? 1 });
        [[1, 0.22, dec], [1.004, 0.12, dec], [2.71, 0.08, dec * 0.55], [5.15, 0.03, dec * 0.3]].forEach(([r, amp, d]) => mode(E, v, t, f * r, d, amp, { a: 6e-3 }));
        phantom(E, v, t, f, dec * 0.4, 0.16, { a: 6e-3 });
        burst(E, v, t, { type: "lowpass", f: 600, d: 0.03, peak: 0.12 });
      },
      /* a low frame drum, felt beater */
      drum(E, t, o = {}) {
        const f = o.f || 68;
        const v = voice(E, { pan: o.pan || 0, send: o.send ?? 0.2, bright: 0.5, gain: o.gain ?? 1 });
        mode(E, v, t, f, o.dec || 0.55, 0.85, { drop: 1.4, a: 2e-3 });
        mode(E, v, t, f * 1.59, 0.16, 0.18, { drop: 0.3 });
        phantom(E, v, t, f, Math.min(0.3, (o.dec || 0.55) * 0.5), 0.6);
        burst(E, v, t, { type: "lowpass", f: 900, d: 0.03, peak: 0.25 });
      }
    };
    HIT = INTRO_TIMING.hit / 1e3;
    PLAY = INTRO_TIMING.play / 1e3;
    bloop = (E, t, f, gain = 0.4) => {
      const v = voice(E, { send: 0.2, bright: 0.7, gain });
      mode(E, v, t, f * 1.5, 0.16, 0.5, { drop: -0.33 });
    };
    bounce = (E, t, gain = 0.7, pitch = 1) => {
      M.drum(E, t, { f: 118 * pitch, dec: 0.12, gain });
      M.felt(E, t + 4e-3, { gain: gain * 0.6 });
    };
    swish = (E, t, gain = 0.35) => burst(E, voice(E, { send: 0.25, bright: 1, gain }), t, { type: "bandpass", f: 3400, q: 0.8, d: 0.26, peak: 0.6 });
    hum = (E, t, d, f0, f1, peak = 0.06) => swell(E, voice(E, { send: 0.2, bright: 0.6 }), t, { d, f0, f1, q: 1.2, peak });
    INTRO_FOLEY = Object.freeze({
      putting: (E, t) => {
        M.knock(E, t + PLAY, { pitch: 1.7, gain: 0.45 });
        M.clack(E, t + PLAY + 4e-3, { pitch: 0.8, gain: 0.4, double: false });
        hum(E, t + PLAY, HIT - PLAY - 0.1, 320, 210, 0.05);
        M.clack(E, t + HIT - 0.09, { pitch: 0.7, gain: 0.35, double: false });
        M.clack(E, t + HIT - 0.05, { pitch: 0.66, gain: 0.3, double: false });
        M.knock(E, t + HIT, { pitch: 0.72, gain: 0.7 });
      },
      die: (E, t) => {
        whoosh(E, t + PLAY, { d: 0.4, peak: 0.12 });
        M.knock(E, t + 1.38, { gain: 0.8 });
        M.knock(E, t + 1.6, { pitch: 1.2, gain: 0.25 });
        bloop(E, t + HIT, NOTE.D5);
        burst(E, voice(E, { gain: 0.3 }), t + HIT + 0.02, { type: "highpass", f: 2600, d: 0.12, peak: 0.3 });
      },
      where: (E, t) => {
        M.tick(E, t + PLAY);
        for (let i = 0; i < 9; i++) M.tick(E, t + PLAY + 0.1 + i * 0.1 * (1 - i * 0.05), { gain: 0.3, pitch: 1.3 });
        hum(E, t + HIT - 0.35, 0.34, 2400, 800, 0.08);
        M.felt(E, t + HIT, { gain: 0.8 });
        M.knock(E, t + HIT + 5e-3, { gain: 0.6 });
      },
      "basketball:5v5": (E, t) => {
        bounce(E, t + 0.45, 0.5);
        whoosh(E, t + PLAY + 0.05, { d: 0.5, peak: 0.14 });
        swish(E, t + HIT, 0.45);
      },
      pickleball: (E, t) => {
        M.knock(E, t + 0.9, { pitch: 1.9, gain: 0.6 });
        M.clack(E, t + 0.902, { pitch: 0.75, gain: 0.5, double: false });
        M.knock(E, t + HIT, { pitch: 1.6, gain: 0.4 });
        M.knock(E, t + HIT + 0.24, { pitch: 1.6, gain: 0.22 });
      },
      "basketball:1v1": (E, t) => {
        bounce(E, t + 0.475);
        bounce(E, t + 0.825);
        swish(E, t + HIT, 0.45);
        bounce(E, t + 2.15, 0.55);
        bounce(E, t + 2.4, 0.35);
      },
      volleyball: (E, t) => {
        M.felt(E, t + PLAY, { gain: 0.5 });
        M.slap(E, t + 1.3, { gain: 0.9 });
        whoosh(E, t + 1.32, { d: 0.4, peak: 0.16 });
        M.felt(E, t + HIT, { gain: 1 });
        burst(E, voice(E, { gain: 0.4, bright: 0.5 }), t + HIT, { type: "lowpass", f: 900, d: 0.2, peak: 0.4 });
      },
      trivia: (E, t) => {
        M.tick(E, t + 0.9);
        M.tick(E, t + 1.05, { pitch: 1.2 });
        for (let i = 0; i < 8; i++) M.bell(E, t + 0.9 + i * 0.11, ladderNote(i % 4 + 3), { gain: 0.12, dec: 0.3, send: 0.15 });
        const v = voice(E, { send: 0.15, bright: 0.35, gain: 0.5 });
        mode(E, v, t + HIT, NOTE.A3, 0.4, 0.09, { type: "sawtooth", a: 4e-3 });
        mode(E, v, t + HIT, NOTE.A2, 0.4, 0.07, { type: "square", a: 4e-3 });
      },
      "8ball": (E, t) => {
        M.clack(E, t + 1.05, { pitch: 0.8, gain: 0.7 });
        M.knock(E, t + 1.05, { pitch: 1.4, gain: 0.3 });
        riffle(E, t + 1.25, 8, { pitch: 1.25, gap: 0.022, gain: 0.75 });
        M.clack(E, t + 1.5, { pitch: 1.2, gain: 0.25, double: false });
        M.knock(E, t + HIT, { pitch: 0.78, gain: 0.75 });
        M.drum(E, t + HIT + 0.01, { f: 110, dec: 0.15, gain: 0.45 });
      },
      pong: (E, t) => {
        whoosh(E, t + PLAY, { d: 0.35, peak: 0.06 });
        bloop(E, t + HIT, NOTE.A4, 0.5);
        burst(E, voice(E, { gain: 0.25 }), t + HIT + 0.01, { type: "highpass", f: 3e3, d: 0.1, peak: 0.3 });
        M.knock(E, t + HIT + 0.08, { pitch: 1.5, gain: 0.2 });
      },
      ragecage: (E, t) => {
        M.knock(E, t + 1.15, { pitch: 1.6, gain: 0.5 });
        bloop(E, t + 1.35, NOTE.D5, 0.35);
        M.knock(E, t + 1.2, { pitch: 1.7, gain: 0.3 });
        hum(E, t + 1.45, 0.34, 600, 1300, 0.05);
        M.slap(E, t + HIT, { gain: 0.9 });
        M.knock(E, t + HIT + 0.01, { pitch: 1.2, gain: 0.6 });
      },
      beerio: (E, t) => {
        const v = voice(E, { send: 0.15, bright: 0.4, gain: 0.35 });
        mode(E, v, t + 0.5, NOTE.A2, 1.5, 0.08, { type: "sawtooth", drop: -0.25, a: 0.2 });
        mode(E, v, t + 0.5, NOTE.D3, 1.5, 0.05, { type: "square", drop: -0.25, a: 0.2 });
        burst(E, voice(E, { gain: 0.25 }), t + 1.3, { type: "bandpass", f: 2600, q: 3, d: 0.32, peak: 0.3 });
        M.bell(E, t + HIT, NOTE.D5, { gain: 0.35, dec: 0.8 });
        M.bell(E, t + HIT + 0.09, NOTE.Fs5, { gain: 0.35, dec: 0.8 });
      },
      poker: (E, t) => {
        M.tick(E, t + PLAY);
        M.tick(E, t + PLAY + 0.16);
        for (let i = 0; i < 17; i++) M.clack(E, t + 1 + i * 0.045 + (i > 4 ? 0.02 : 0), { pitch: 1 - i % 6 * 0.02, gain: 0.4, double: false });
        M.tick(E, t + HIT - 0.12, { pitch: 1.1 });
        M.tick(E, t + HIT - 0.04, { pitch: 1.15 });
      },
      mark: (E, t) => {
        hum(E, t + PLAY, HIT - PLAY, 1200, 400, 0.05);
        M.felt(E, t + HIT, { gain: 0.8 });
        M.knock(E, t + HIT + 0.01, { gain: 0.6 });
      }
    });
    KIT = Object.freeze([
      {
        id: "S1",
        name: "Field Day call",
        where: ["tv"],
        ms: 900,
        play: (E, t) => {
          M.drum(E, t, { f: NOTE.D2, dec: 0.9, gain: 0.7 });
          M.bell(E, t, NOTE.A4, { gain: 0.8 });
          M.bell(E, t + 0.17, NOTE.D5, { gain: 0.75 });
          M.bell(E, t + 0.34, NOTE.Fs5, { gain: 0.7, dec: 3.2 });
        }
      },
      /* the game intro: the backlight catching, the game's own move on the
         intro's beats (introFoley), and the name's chord on the hit; opts.game
         is the intro scene, opts.summary (reduced motion) is the chord alone */
      {
        id: "S2",
        name: "Event intro",
        where: ["tv", "phone"],
        ms: INTRO_TIMING.total,
        play: (E, t, o = {}) => gameIntro(E, t, o)
      },
      {
        id: "S3",
        name: "Card turns",
        where: ["tv"],
        ms: 30,
        play: (E, t) => M.tick(E, t)
      },
      {
        id: "S4",
        name: "Your card",
        where: ["phone"],
        ms: 500,
        play: (E, t) => {
          M.bell(E, t, NOTE.D5, { gain: 0.9, dec: 1.8, send: 0.25 });
          M.bell(E, t + 0.09, NOTE.Fs5, { gain: 0.5, dec: 1.4, send: 0.25 });
        }
      },
      {
        id: "S5",
        name: "Chip placed",
        where: ["phone", "tv"],
        ms: 30,
        play: (E, t, o = {}) => chipPlaced(E, t, o)
      },
      {
        id: "S6",
        name: "Chip taken back",
        where: ["phone"],
        ms: 30,
        play: (E, t) => M.clack(E, t, { pitch: 0.84, gain: 0.7, bright: 0.5, double: false })
      },
      {
        id: "S7",
        name: "At your limit",
        where: ["phone"],
        ms: 120,
        play: (E, t) => {
          M.clack(E, t);
          M.felt(E, t + 0.03, { gain: 0.5 });
          M.clack(E, t + 0.07, { pitch: 0.9, gain: 0.45, double: false });
        }
      },
      {
        id: "S8",
        name: "Betting locks",
        where: ["tv"],
        ms: 150,
        play: (E, t) => {
          M.felt(E, t, { gain: 0.9 });
          M.knock(E, t + 0.018, { pitch: 0.9, gain: 0.8 });
        }
      },
      {
        id: "S9",
        name: "You're playing",
        where: ["phone"],
        ms: 500,
        play: (E, t) => {
          M.drum(E, t, { f: 82, dec: 0.3, gain: 0.7 });
          M.drum(E, t + 0.16, { f: 110, dec: 0.3, gain: 0.6 });
          M.bell(E, t + 0.3, NOTE.A4, { gain: 0.5, dec: 1.6 });
        }
      },
      {
        id: "S10",
        name: "Won",
        where: ["tv"],
        ms: 120,
        play: (E, t) => {
          M.drum(E, t, { f: 120, dec: 0.18, gain: 0.8 });
          M.clack(E, t + 5e-3, { gain: 0.9 });
        }
      },
      {
        id: "S11",
        name: "To the bank",
        where: ["tv"],
        ms: 600,
        play: (E, t) => {
          swell(E, voice(E, { send: 0.1, bright: 0.4, gain: 1 }), t, { d: 0.5, f0: 900, f1: 420, peak: 0.18 });
          riffle(E, t + 0.25, 4, { pitch: 0.8, bright: 0.45, gain: 0.45, gap: 0.05 });
        }
      },
      {
        id: "S12",
        name: "Payout",
        where: ["phone", "tv"],
        ms: 300,
        play: (E, t) => riffle(E, t, 6, { pitch: 1.02, gap: 0.042, gain: 0.85 })
      },
      {
        id: "S13",
        name: "Advance",
        where: ["tv"],
        ms: 900,
        play: (E, t) => {
          swell(E, voice(E, { send: 0.15, bright: 0.6 }), t, { d: 0.75, f0: 600, f1: 1100, peak: 0.12 });
          M.knock(E, t + 0.8, { gain: 0.6 });
          M.clack(E, t + 0.81, { gain: 0.7 });
        }
      },
      {
        id: "S14",
        name: "Result posted",
        where: ["tv"],
        ms: 1500,
        play: (E, t) => {
          M.bell(E, t, NOTE.A4, { gain: 0.7, dec: 2.8 });
          M.bell(E, t + 0.07, NOTE.D5, { gain: 0.55, dec: 2.8 });
        }
      },
      {
        id: "S15",
        name: "New leader",
        where: ["tv", "phone"],
        ms: 1500,
        play: (E, t) => {
          M.bell(E, t, NOTE.A4, { gain: 0.6 });
          M.bell(E, t + 0.14, NOTE.D5, { gain: 0.75, dec: 2.6 });
        }
      },
      {
        id: "S16",
        name: "Challenged",
        where: ["phone"],
        ms: 250,
        play: (E, t) => {
          M.knock(E, t);
          M.knock(E, t + 0.13, { pitch: 1.04, gain: 0.85 });
        }
      },
      {
        id: "S17",
        name: "Duel won",
        where: ["phone"],
        ms: 300,
        play: (E, t) => riffle(E, t, 5, { pitch: 1.04, gap: 0.04, gain: 0.8 })
      },
      {
        id: "S18",
        name: "Pick",
        where: ["tv", "phone"],
        ms: 100,
        play: (E, t) => M.slap(E, t)
      },
      {
        id: "S19",
        name: "Your pick",
        where: ["phone"],
        ms: 900,
        play: (E, t) => {
          M.knock(E, t, { gain: 0.5 });
          M.bell(E, t + 0.02, NOTE.Fs5, { gain: 0.6, dec: 1.6, send: 0.25 });
        }
      },
      {
        id: "S20",
        name: "Deal",
        where: ["tv"],
        ms: 900,
        play: (E, t) => riffle(E, t, 12, { pitch: 0.95, gap: 0.07, gain: 0.55 })
      },
      {
        id: "S21",
        name: "Blinds up",
        where: ["tv"],
        ms: 3e3,
        play: (E, t) => {
          M.bowl(E, t, NOTE.A2, { gain: 0.9 });
          M.bowl(E, t, NOTE.D3, { gain: 0.35, dec: 3.5 });
        }
      },
      {
        id: "S22",
        name: "Bust",
        where: ["tv"],
        ms: 1200,
        play: (E, t) => spinDown(E, t, { dur: 1, gain: 0.8 })
      },
      {
        id: "S23",
        name: "Roll to the flood",
        where: ["tv"],
        ms: 1400,
        play: (E, t) => {
          roll(E, t, { dur: 0.6 });
          M.drum(E, t + 0.6, { f: NOTE.D2, dec: 1 });
          M.bell(E, t + 0.6, NOTE.D4, { gain: 0.6, dec: 3 });
          M.bell(E, t + 0.6, NOTE.A4, { gain: 0.5, dec: 3 });
        }
      },
      {
        id: "S24",
        name: "Champion's chip",
        where: ["tv", "phone"],
        ms: 1300,
        play: (E, t) => {
          M.clack(E, t, { gain: 1 });
          spinDown(E, t + 0.05, { dur: 1.15, gain: 0.7 });
        }
      },
      {
        id: "S25",
        name: "Saved",
        where: ["gm"],
        ms: 400,
        play: (E, t) => {
          M.clack(E, t, { gain: 0.35, double: false });
          M.bell(E, t + 0.01, NOTE.A5, { gain: 0.18, dec: 0.6, send: 0.1 });
        }
      },
      /* two notes falling a fourth (B to F#) on a dead wooden knock: it did not happen */
      {
        id: "S26",
        name: "Didn't save",
        where: ["gm", "phone"],
        ms: 500,
        play: (E, t) => {
          M.knock(E, t, { gain: 0.6 });
          M.bell(E, t + 5e-3, NOTE.B4, { gain: 0.32, dec: 0.5, send: 0.08 });
          M.knock(E, t + 0.17, { pitch: 0.84, gain: 0.55 });
          M.bell(E, t + 0.175, NOTE.Fs4, { gain: 0.3, dec: 0.7, send: 0.08 });
        }
      }
    ].map(Object.freeze));
    CHIP_WEIGHT = Object.freeze({ heightStep: 0.025, heightCap: 10 });
    PARTS = Object.freeze([
      {
        id: "ride",
        name: "Winners ride the connector",
        ms: 800,
        play: (E, t, o = {}) => swell(E, voice(E, { send: 0.15, bright: 0.6 }), t, { d: (o.ms || 800) / 1e3, f0: 600, f1: 1100, peak: 0.12 })
      },
      {
        id: "land",
        name: "They land in the next slot",
        ms: 120,
        play: (E, t) => {
          M.knock(E, t, { gain: 0.6 });
          M.clack(E, t + 0.01, { gain: 0.7 });
        }
      },
      {
        id: "upNow",
        name: "UP NOW moves on",
        ms: 1800,
        play: (E, t) => M.bell(E, t, NOTE.A4, { gain: 0.35, dec: 1.8 })
      },
      {
        id: "stepDown",
        name: "The other rows step down",
        ms: 300,
        play: (E, t) => riffle(E, t, 4, { pitch: 0.8, gain: 0.35, bright: 0.5, gap: 0.06 })
      },
      {
        id: "crownCount",
        name: "The final stack counts",
        ms: 1200,
        play: (E, t, o = {}) => riffle(E, t, 12, { gap: (o.ms || 1200) / 1e3 / 12, gain: 0.5, pitch: 0.98 })
      },
      {
        id: "crownCall",
        name: "The Field Day call, complete",
        ms: 4e3,
        play: (E, t) => {
          M.bell(E, t, NOTE.A4, { gain: 0.7 });
          M.bell(E, t + 0.17, NOTE.D5, { gain: 0.7 });
          M.bell(E, t + 0.34, NOTE.Fs5, { gain: 0.65 });
          M.bell(E, t + 0.62, NOTE.A5, { gain: 0.55, dec: 4 });
          M.drum(E, t + 0.62, { f: NOTE.D2, dec: 1.2, gain: 0.6 });
        }
      },
      {
        id: "faceOff",
        name: "The sides meet",
        ms: 600,
        play: (E, t) => {
          M.drum(E, t, { f: NOTE.D2, dec: 0.5, gain: 0.55 });
          M.knock(E, t + 0.02, { pitch: 0.85, gain: 0.45 });
        }
      },
      {
        id: "crowd",
        name: "Several chips at once",
        ms: 300,
        play: (E, t, o = {}) => riffle(E, t, Math.max(3, Math.min(6, o.n || 4)), { gain: 0.7, gap: 0.04 })
      },
      /* a picker wheel passing one value: a dry, quiet detent click */
      {
        id: "detent",
        name: "A wheel passes a value",
        ms: 20,
        play: (E, t) => M.tick(E, t, { gain: 0.45, pitch: 1.25 })
      },
      /* ── the takeover grammar (Backglass) ── */
      /* the lean-in: the room dims and a sting turns heads before a peak */
      {
        id: "sting",
        name: "Lean in",
        ms: 1400,
        play: (E, t) => {
          swell(E, voice(E, { send: 0.25, bright: 0.7 }), t, { d: 0.7, f0: 260, f1: 1500, q: 0.8, peak: 0.16 });
          M.drum(E, t + 0.7, { f: NOTE.D2, dec: 0.9, gain: 0.75 });
          M.bell(E, t + 0.7, NOTE.D5, { gain: 0.55, dec: 2.2 });
          M.bell(E, t + 0.7, NOTE.A5, { gain: 0.3, dec: 1.6 });
        }
      },
      /* a side enters from its own edge (pan -1 left, 1 right) */
      {
        id: "whoosh",
        name: "A side slams in",
        ms: 500,
        play: (E, t) => {
          whoosh(E, t, { d: 0.42, peak: 0.3 });
          M.slap(E, t + 0.4, { gain: 0.7 });
        }
      },
      /* VS: a drum, a slap and a low bell, held */
      {
        id: "vsHit",
        name: "VS",
        ms: 2600,
        play: (E, t) => {
          M.drum(E, t, { f: NOTE.D2, dec: 1.1, gain: 0.95 });
          M.slap(E, t + 4e-3, { gain: 0.85 });
          M.bowl(E, t + 0.01, NOTE.D3, { gain: 0.6, dec: 2.6 });
          M.bell(E, t + 0.01, NOTE.A4, { gain: 0.25, dec: 1.8 });
        }
      },
      /* one letter of the head-to-head typing in */
      {
        id: "typeTick",
        name: "A letter types in",
        ms: 20,
        play: (E, t) => M.tick(E, t, { gain: 0.35, pitch: 1.4 })
      },
      /* a place stamps on the podium (opts.place: 3, 2, 1) */
      {
        id: "podium",
        name: "A place stamps",
        ms: 900,
        play: (E, t, o = {}) => {
          const top = Number(o.place) === 1;
          M.knock(E, t, { gain: 0.7, pitch: top ? 1.1 : 0.95 });
          M.clack(E, t + 6e-3, { gain: 0.7 });
          M.bell(E, t + 0.01, top ? NOTE.D5 : Number(o.place) === 2 ? NOTE.A4 : NOTE.Fs4, { gain: top ? 0.6 : 0.4, dec: top ? 2.4 : 1.4 });
          if (top) M.drum(E, t, { f: NOTE.D2, dec: 0.6, gain: 0.6 });
        }
      },
      /* ── the walkout ── */
      /* as the win song fades in: a short chord stab, past the duck */
      {
        id: "stinger",
        name: "Walkout stinger",
        ms: 1600,
        play: (E, t) => {
          M.drum(E, t, { f: NOTE.D2, dec: 0.8, gain: 0.85 });
          riffle(E, t, 4, { gap: 0.03, gain: 0.5, pitch: 1.05 });
          M.bell(E, t + 0.02, NOTE.A4, { gain: 0.5, dec: 2 });
          M.bell(E, t + 0.02, NOTE.D5, { gain: 0.5, dec: 2 });
          M.bell(E, t + 0.02, NOTE.Fs5, { gain: 0.45, dec: 2.4 });
        }
      },
      /* the name stamps */
      {
        id: "stamp",
        name: "A name stamps",
        ms: 300,
        play: (E, t) => {
          M.slap(E, t, { gain: 0.8 });
          M.knock(E, t + 0.01, { gain: 0.5, pitch: 0.9 });
        }
      },
      /* a name cut into the cup: the graver's quick strokes, then the metal rings */
      {
        id: "engrave",
        name: "A plate engraves",
        ms: 1600,
        play: (E, t) => {
          for (let i = 0; i < 5; i++) M.tick(E, t + i * 0.055, { gain: 0.32, pitch: 1.35 + i * 0.04 });
          M.bell(E, t + 0.3, NOTE.D6, { gain: 0.32, dec: 1.6, send: 0.3 });
          M.bell(E, t + 0.3, NOTE.A5, { gain: 0.24, dec: 1.9, send: 0.3 });
        }
      },
      /* ── "You're up" on a competitor's phone: two notes, low then high ── */
      {
        id: "youUp",
        name: "You're up",
        ms: 1200,
        play: (E, t) => {
          M.drum(E, t, { f: 82, dec: 0.28, gain: 0.7 });
          M.bell(E, t + 5e-3, NOTE.D5, { gain: 0.6, dec: 1.1, send: 0.2 });
          M.drum(E, t + 0.19, { f: 110, dec: 0.32, gain: 0.65 });
          M.bell(E, t + 0.195, NOTE.A5, { gain: 0.6, dec: 1.6, send: 0.22 });
        }
      },
      /* your team turns up at the draw: your color floods */
      {
        id: "teamUp",
        name: "Your team",
        ms: 1600,
        play: (E, t) => {
          M.bell(E, t, NOTE.D5, { gain: 0.7, dec: 1.6, send: 0.25 });
          M.bell(E, t + 0.09, NOTE.Fs5, { gain: 0.55, dec: 1.6, send: 0.25 });
          M.bell(E, t + 0.18, NOTE.A5, { gain: 0.5, dec: 2, send: 0.25 });
          M.felt(E, t, { gain: 0.5 });
        }
      },
      /* ── chip rain ── */
      /* a chip lands on your pile, one step up the ladder (opts.step) */
      {
        id: "rain",
        name: "A chip lands on the pile",
        ms: 400,
        play: (E, t, o = {}) => {
          const f = ladderNote(o.step);
          M.clack(E, t, { pitch: 0.9 + (f / NOTE.D4 - 1) * 0.18, gain: 0.7, double: false });
          M.bell(E, t + 3e-3, f, { gain: 0.22, dec: 0.45, send: 0.15 });
        }
      },
      /* the pile sweeps into your total */
      {
        id: "sweep",
        name: "The pile sweeps home",
        ms: 700,
        play: (E, t, o = {}) => {
          swell(E, voice(E, { send: 0.1, bright: 0.6 }), t, { d: 0.4, f0: 500, f1: 1300, peak: 0.14 });
          riffle(E, t + 0.18, Math.max(4, Math.min(10, o.n || 6)), { gap: 0.032, gain: 0.6, pitch: 1.06 });
        }
      },
      /* a loss: your stack slides off to the bank, quietly */
      {
        id: "loss",
        name: "To the bank, yours",
        ms: 800,
        play: (E, t) => {
          swell(E, voice(E, { send: 0.08, bright: 0.35 }), t, { d: 0.55, f0: 760, f1: 300, peak: 0.13 });
          riffle(E, t + 0.32, 3, { pitch: 0.74, bright: 0.4, gain: 0.32, gap: 0.06 });
        }
      },
      /* a bigger win rings more chips (opts.n) */
      {
        id: "payout",
        name: "Payout by size",
        ms: 900,
        play: (E, t, o = {}) => {
          const n = Math.max(4, Math.min(16, Math.round(o.n || 6)));
          riffle(E, t, n, { pitch: 1.02, gap: Math.max(0.026, 0.05 - n * 15e-4), gain: 0.85 });
          if (n >= 10) M.bell(E, t + n * 0.035, NOTE.D5, { gain: 0.4, dec: 1.6 });
        }
      },
      /* a placed chip settles on the felt */
      {
        id: "chipLand",
        name: "A chip settles",
        ms: 120,
        play: (E, t) => {
          M.felt(E, t, { gain: 0.35 });
          M.clack(E, t + 0.01, { pitch: 0.9, gain: 0.3, bright: 0.6, double: false });
        }
      },
      /* you passed someone on the board: a quiet rising pair as your row lands */
      {
        id: "rankUp",
        name: "You moved up",
        ms: 900,
        play: (E, t) => {
          M.bell(E, t, NOTE.Fs5, { gain: 0.32, dec: 0.9, send: 0.2 });
          M.bell(E, t + 0.12, NOTE.A5, { gain: 0.34, dec: 1.2, send: 0.2 });
        }
      },
      /* ── the produced crown ── */
      /* night falls on the art */
      {
        id: "nightFall",
        name: "Night falls",
        ms: 4e3,
        play: (E, t) => {
          M.bowl(E, t, NOTE.D3, { gain: 0.7, dec: 4 });
          M.bowl(E, t, NOTE.A2, { gain: 0.4, dec: 4.5 });
          swell(E, voice(E, { send: 0.4, bright: 0.4 }), t, { d: 2.2, f0: 1400, f1: 300, peak: 0.1 });
        }
      },
      /* the towers stand in final order */
      {
        id: "towersUp",
        name: "The towers stand",
        ms: 1800,
        play: (E, t) => riffle(E, t, 13, { gap: 0.11, gain: 0.5, pitch: 0.92 })
      },
      /* a tower goes dark: the name and final stack stamp (opts.pan) */
      {
        id: "towerOut",
        name: "A tower goes dark",
        ms: 900,
        play: (E, t) => {
          M.knock(E, t, { gain: 0.65, pitch: 0.88 });
          M.slap(E, t + 8e-3, { gain: 0.45 });
          M.bowl(E, t + 0.01, NOTE.A2, { gain: 0.25, dec: 1.4 });
        }
      },
      /* the last two hold: a roll that swells (opts.ms) */
      {
        id: "holdRoll",
        name: "The last two hold",
        ms: 4e3,
        play: (E, t, o = {}) => roll(E, t, { dur: Math.max(1, (o.ms || 4e3) / 1e3), from: 0.05, to: 0.6, f: NOTE.D2 })
      },
      /* the champion's tower rises and cascades */
      {
        id: "cascade",
        name: "The champion's tower",
        ms: 2400,
        play: (E, t) => {
          swell(E, voice(E, { send: 0.3, bright: 0.8 }), t, { d: 1.4, f0: 300, f1: 2200, peak: 0.16 });
          for (let i = 0; i < 18; i++) M.clack(E, t + 0.5 + i * 0.05, { pitch: 0.9 + i * 0.02, gain: 0.55, double: false });
          M.drum(E, t + 1.45, { f: NOTE.D2, dec: 1.2, gain: 0.9 });
        }
      },
      /* one phone's note in the room's chord (opts.f), sustained */
      {
        id: "chord",
        name: "Your note in the chord",
        ms: 7e3,
        play: (E, t, o = {}) => {
          const f = Number(o.f) || NOTE.D5;
          M.bell(E, t, f, { gain: 0.8, dec: 6.5, send: 0.3 });
          const v = voice(E, { send: 0.3, bright: 0.8, gain: 0.6 });
          mode(E, v, t, f, 6, 0.12, { a: 0.35 });
          mode(E, v, t, f * 2, 3.5, 0.03, { a: 0.4 });
          phantom(E, v, t, f, 5, 0.1, { a: 0.35 });
        }
      },
      /* ── the finale ── */
      /* the bust card lands */
      {
        id: "bustCard",
        name: "Out",
        ms: 1600,
        play: (E, t) => {
          M.slap(E, t, { gain: 0.8 });
          M.bowl(E, t + 0.01, NOTE.D3, { gain: 0.45, dec: 1.8 });
          M.bell(E, t + 0.02, NOTE.Fs4, { gain: 0.25, dec: 1.2 });
        }
      }
    ].map(Object.freeze));
    SOUNDS = Object.freeze(Object.fromEntries([...KIT, ...PARTS].map((s) => [s.id, s])));
    SOUND_IDS = Object.freeze(KIT.map((s) => s.id));
    isSound = (id) => Object.prototype.hasOwnProperty.call(SOUNDS, id);
    CHIP_DENSITY = Object.freeze({ minGap: 120, crowd: 3, window: 400 });
  }
});

// src/lib/sound.js
import { useEffect as useEffect8, useState as useState9 } from "react";
function walkoutActive(walkout, now2 = serverNow()) {
  if (!walkout || typeof walkout !== "object") return false;
  const until = Number(walkout.until);
  return Number.isFinite(until) && now2 < until;
}
function hushReason({ walkout = null, quickDraw = false, now: now2 = serverNow() } = {}) {
  if (quickDraw) return "quickDraw";
  if (walkoutActive(walkout, now2)) return "walkout";
  return null;
}
function scheduleTime({ at, now: now2, currentTime = 0, outputLatency = 0, lateMs = LATE_MS }) {
  const target = Number(at);
  if (!Number.isFinite(target)) return null;
  const ahead = target - Number(now2);
  if (ahead < -lateMs) return null;
  const latency = Math.max(0, Number(outputLatency) || 0);
  return Math.max(currentTime + 5e-3, currentTime + ahead / 1e3 - latency);
}
function freshFrameNow(frame2 = currentFrame(), now2 = Date.now()) {
  return !!frame2?.fresh && now2 - (Number(frame2.at) || 0) <= SOUND_FRESH_MS;
}
function notify() {
  for (const fn of [...listeners2]) {
    try {
      fn();
    } catch {
    }
  }
}
function phoneSession() {
  try {
    if (engine.surface !== "tv" && globalThis.navigator?.audioSession && globalThis.navigator.audioSession.type !== PHONE_AUDIO_SESSION)
      globalThis.navigator.audioSession.type = PHONE_AUDIO_SESSION;
  } catch {
  }
}
function context(create) {
  if (engine.ctx || !create) return engine.ctx;
  const AC = contextClass();
  if (!AC) return null;
  phoneSession();
  try {
    const ctx = new AC({ latencyHint: "interactive" });
    engine.ctx = ctx;
    engine.E = makeEngine(ctx, {
      room: engine.room,
      listen: engine.surface === "tv" ? "tv" : "phone",
      volume: MASTER_VOLUME[engine.surface === "tv" ? "tv" : "phone"]
    });
    ctx.onstatechange = () => {
      if (ctx.state === "running") engine.resuming = false;
      notify();
    };
    applyHush(true);
    notify();
  } catch {
    engine.ctx = null;
    engine.E = null;
  }
  return engine.ctx;
}
function resume(ctx) {
  if (!ctx || ctx.state === "running" || ctx.state === "closed") return;
  engine.resuming = true;
  try {
    const p = ctx.resume();
    if (p?.then) p.then(() => {
      engine.resuming = false;
      notify();
    }, () => {
      engine.resuming = false;
      notify();
    });
  } catch {
    engine.resuming = false;
  }
}
function unlockSound() {
  if (soundOptedOut()) return false;
  const ctx = context(true);
  if (!ctx) return false;
  resume(ctx);
  if (!engine.unlockedOnce) {
    engine.unlockedOnce = true;
    try {
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate || 44100);
      src.connect(ctx.destination);
      src.onended = () => {
        try {
          src.disconnect();
        } catch {
        }
      };
      src.start(0);
    } catch {
    }
  }
  return true;
}
function isMuted(now2 = serverNow()) {
  return hushLevel(hushReason({ walkout: engine.walkout, quickDraw: engine.quickDraw, now: now2 })) === 0;
}
function applyHush(immediate = false) {
  const level = hushLevel(hushReason({ walkout: engine.walkout, quickDraw: engine.quickDraw }));
  engine.hushed = level < 1;
  const E = engine.E;
  if (!E) return;
  try {
    const g = E.hush.gain, t = E.ctx.currentTime;
    g.cancelScheduledValues(t);
    if (immediate) g.setValueAtTime(level, t);
    else {
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(level, t + HUSH_RAMP_S);
    }
  } catch {
  }
}
function seenKey(key) {
  if (key === null || key === void 0) return false;
  const k = String(key);
  if (engine.keys.includes(k)) return true;
  engine.keys.push(k);
  if (engine.keys.length > KEY_MEMORY) engine.keys.shift();
  return false;
}
function playSound(id, {
  bus = "you",
  at = null,
  delayMs = 0,
  pan = 0,
  key = null,
  lateMs = LATE_MS,
  opts = {},
  open = false
} = {}) {
  try {
    if (!isSound(id) || soundOptedOut() || !busAllowed(bus, engine.surface)) return null;
    const ctx = context(false);
    if (!running(ctx) || !engine.E) return null;
    const now2 = serverNow();
    const target = at === null || at === void 0 ? now2 + Math.max(0, Number(delayMs) || 0) : Number(at);
    if (!Number.isFinite(target) || target - now2 < -lateMs) return null;
    if (isMuted(Math.max(now2, target))) return null;
    if (bus === "gm" && ackYields(id, engine.lastYouAt, target)) return null;
    if (seenKey(key)) return null;
    if (bus === "you") engine.lastYouAt = target;
    const early = bus === "room" ? soundEarlyMs() : 0;
    const land = target - early;
    const fire = () => {
      if (soundOptedOut() || !busAllowed(bus, engine.surface) || isMuted(target) || !engine.E) return;
      const c = engine.ctx;
      const when = scheduleTime({
        at: land,
        now: serverNow(),
        currentTime: c.currentTime,
        outputLatency: c.outputLatency || c.baseLatency || 0,
        lateMs: lateMs + early
      });
      if (when === null) return;
      playRecipe(engine.E, id, when, { pan, ...opts, open });
      try {
        globalThis.__FD_SOUND_LOG__?.push?.({ id, bus, at: target, when, currentTime: c.currentTime, pan });
      } catch {
      }
    };
    const wait = land - now2 - LOOKAHEAD_MS;
    if (wait <= 0) {
      fire();
      return { cancel() {
      } };
    }
    let timer = null;
    timer = setTimeout(() => {
      engine.timers.delete(timer);
      fire();
    }, wait);
    engine.timers.add(timer);
    return { cancel() {
      clearTimeout(timer);
      engine.timers.delete(timer);
    } };
  } catch {
    return null;
  }
}
var SOUND_KEY, MASTER_VOLUME, BUSES, LATE_MS, LOOKAHEAD_MS, HUSH_RAMP_S, WALKOUT_DUCK, SOUND_FRESH_MS, TV_EARLY_KEY, TV_EARLY_MAX_MS, TV_EARLY_STEP_MS, clampEarlyMs, storage2, soundOptedOut, soundEarlyMs, busAllowed, hushLevel, GM_YIELD_MS, ackYields, engine, listeners2, PHONE_AUDIO_SESSION, contextClass, running, KEY_MEMORY;
var init_sound = __esm({
  "src/lib/sound.js"() {
    init_soundKit();
    init_soundKit();
    init_serverClock();
    init_frameGate();
    SOUND_KEY = "si-sound";
    MASTER_VOLUME = Object.freeze({ tv: 0.7, phone: 0.6 });
    BUSES = Object.freeze({ room: "tv", you: "phone", gm: "phone" });
    LATE_MS = 300;
    LOOKAHEAD_MS = 250;
    HUSH_RAMP_S = 0.15;
    WALKOUT_DUCK = 0.25;
    SOUND_FRESH_MS = 1500;
    TV_EARLY_KEY = "si-tv-early";
    TV_EARLY_MAX_MS = 400;
    TV_EARLY_STEP_MS = 10;
    clampEarlyMs = (ms) => {
      const n = Math.round((Number(ms) || 0) / TV_EARLY_STEP_MS) * TV_EARLY_STEP_MS;
      return Math.max(0, Math.min(TV_EARLY_MAX_MS, n));
    };
    storage2 = () => {
      try {
        return globalThis.localStorage || null;
      } catch {
        return null;
      }
    };
    soundOptedOut = () => {
      try {
        return storage2()?.getItem(SOUND_KEY) === "off";
      } catch {
        return false;
      }
    };
    soundEarlyMs = () => {
      try {
        return clampEarlyMs(storage2()?.getItem(TV_EARLY_KEY));
      } catch {
        return 0;
      }
    };
    busAllowed = (bus, surface) => !!BUSES[bus] && BUSES[bus] === (surface === "tv" ? "tv" : "phone");
    hushLevel = (reason) => reason === "quickDraw" ? 0 : reason === "walkout" ? WALKOUT_DUCK : 1;
    GM_YIELD_MS = 400;
    ackYields = (id, lastYouAt, target) => id === "S25" && Number.isFinite(Number(lastYouAt)) && Number(lastYouAt) > 0 && Math.abs(Number(target) - Number(lastYouAt)) <= GM_YIELD_MS;
    engine = {
      ctx: null,
      E: null,
      surface: "phone",
      room: "fri",
      walkout: null,
      quickDraw: false,
      hushed: false,
      resuming: false,
      unlockedOnce: false,
      keys: [],
      chips: null,
      timers: /* @__PURE__ */ new Set(),
      walkoutTimer: null,
      lastYouAt: 0,
      factory: null,
      installed: false
    };
    listeners2 = /* @__PURE__ */ new Set();
    PHONE_AUDIO_SESSION = "playback";
    contextClass = () => engine.factory || typeof globalThis !== "undefined" && (globalThis.AudioContext || globalThis.webkitAudioContext) || null;
    running = (ctx) => !!ctx && (ctx.state === "running" || engine.resuming);
    KEY_MEMORY = 200;
  }
});

// src/ui/ScoreReel.jsx
import React17, { useEffect as useEffect9, useLayoutEffect as useLayoutEffect4, useRef as useRef8 } from "react";
function drumSteps(from, to, direction) {
  const a = Number(from) || 0, b = Number(to) || 0;
  if (a === b) return 0;
  return direction < 0 ? -((a - b + 10) % 10) : (b - a + 10) % 10;
}
function DrumDigit({ digit, value, register, index }) {
  const ref = useRef8(null);
  const st = useRef8(null);
  if (!st.current) st.current = { digit, value, angle: Number(digit) * DRUM.faceDeg, timers: [], placed: false };
  useIsoLayoutEffect(() => {
    const el = ref.current, s = st.current;
    if (!el) return;
    if (!s.placed) {
      s.placed = true;
      el.style.transition = "none";
      el.style.setProperty("--a", `${s.angle}deg`);
      void el.offsetWidth;
      el.style.removeProperty("transition");
      return;
    }
    const direction = value < s.value ? -1 : 1;
    s.value = value;
    if (s.digit === digit) return;
    const steps = drumSteps(s.digit, digit, direction);
    s.digit = digit;
    s.angle += steps * DRUM.faceDeg;
    el.style.setProperty("--drum-ms", `${drumRollMs(steps)}ms`);
    el.style.setProperty("--a", `${s.angle}deg`);
  }, [digit, value]);
  useEffect9(() => {
    if (!register) return void 0;
    return register(index, {
      spin(turns, delay, duration, sign) {
        const el = ref.current, s = st.current;
        if (!el) return;
        s.angle += sign * turns * 360;
        el.style.setProperty("--drum-ms", `${duration}ms`);
        el.style.setProperty("--drum-delay", `${delay}ms`);
        el.style.setProperty("--drum-ease", "var(--ease-drum-spin)");
        el.style.setProperty("--a", `${s.angle}deg`);
        s.timers.push(setTimeout(() => playSound("detent", { bus: "you" }), delay + duration * 0.78));
        s.timers.push(setTimeout(() => {
          el.style.removeProperty("--drum-delay");
          el.style.removeProperty("--drum-ease");
        }, delay + duration + 40));
      }
    });
  }, [register, index]);
  useEffect9(() => () => st.current?.timers.forEach(clearTimeout), []);
  const cur = String(digit);
  return /* @__PURE__ */ React17.createElement("span", { className: "fd-drum", ref }, [...DIGITS].map((d, i) => /* @__PURE__ */ React17.createElement(
    "span",
    {
      key: d,
      className: `fd-drum-face${d === cur ? " is-current" : ""}`,
      style: { "--i": i }
    },
    d
  )));
}
function ScoreReel({ value, tone = null, label: label2 = null, className = "", clack = false, drum = false, spin = false }) {
  const n = Number(value) || 0;
  const last = useRef8({ value: n, at: 0 });
  useEffect9(() => {
    const prev = last.current;
    if (prev.value === n) return;
    const at = now();
    if (clack && at - prev.at >= CLACK_GAP_MS) {
      playSound("detent", { bus: "you" });
      last.current = { value: n, at };
    } else last.current = { value: n, at: prev.at };
  }, [n, clack]);
  const drums = useRef8(/* @__PURE__ */ new Map());
  const register = useRef8((index, api) => {
    drums.current.set(index, api);
    return () => {
      if (drums.current.get(index) === api) drums.current.delete(index);
    };
  }).current;
  const flick = useRef8(null);
  const spinnable = drum && spin;
  const text = `${n < 0 ? "\u2212" : ""}${Math.abs(n).toLocaleString("en-US")}`;
  const cells = [...text];
  const spinAll = (speed, sign) => {
    const order = [...drums.current.keys()].sort((a, b) => a - b);
    const turns = flickTurns(speed);
    order.forEach((index, at) => drums.current.get(index)?.spin(
      turns + (at > 1 ? 1 : 0),
      at * DRUM.spinStaggerMs,
      DRUM.spinMs + at * DRUM.spinStaggerMs,
      sign
    ));
  };
  const handlers = spinnable ? {
    onPointerDown: (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      flick.current = { id: event.pointerId, y: event.clientY, t: now(), spun: false };
    },
    onPointerMove: (event) => {
      const f = flick.current;
      if (!f || f.id !== event.pointerId || f.spun) return;
      const dy = event.clientY - f.y;
      if (Math.abs(dy) < DRUM.flickPx) return;
      f.spun = true;
      if (prefersReducedMotion()) return;
      tapTick();
      spinAll(Math.abs(dy) / Math.max(16, now() - f.t), dy > 0 ? 1 : -1);
    },
    onPointerUp: (event) => {
      if (flick.current?.id === event.pointerId && !flick.current.spun) flick.current = null;
    },
    onPointerCancel: () => {
      flick.current = null;
    },
    /* a flick is not a tap on whatever the reel sits in */
    onClickCapture: (event) => {
      if (flick.current?.spun) {
        event.preventDefault();
        event.stopPropagation();
      }
      flick.current = null;
    }
  } : {};
  return /* @__PURE__ */ React17.createElement(
    "span",
    {
      className: `fd-reel${drum ? " is-drum" : ""}${spinnable ? " is-spinnable" : ""}${tone ? ` is-${tone}` : ""}${className ? ` ${className}` : ""}`,
      role: "img",
      "aria-label": label2 ?? text,
      ...handlers
    },
    cells.map((ch, i) => {
      const key = cells.length - i;
      if (!/\d/.test(ch)) return /* @__PURE__ */ React17.createElement("span", { className: "fd-reel-sep", key: `s${key}`, "aria-hidden": "true" }, ch);
      return /* @__PURE__ */ React17.createElement("span", { className: "fd-reel-cell", key: `d${key}`, "aria-hidden": "true" }, drum ? /* @__PURE__ */ React17.createElement(DrumDigit, { digit: ch, value: n, register: spinnable ? register : null, index: i }) : /* @__PURE__ */ React17.createElement("span", { className: "fd-reel-strip", style: { "--d": ch } }, [...DIGITS].map((d) => /* @__PURE__ */ React17.createElement("span", { key: d }, d))), /* @__PURE__ */ React17.createElement("span", { className: "fd-reel-sizer" }, ch));
    })
  );
}
function LampChase({ tone = "live", color = null, running: running2 = true, className = "" }) {
  return /* @__PURE__ */ React17.createElement(
    "svg",
    {
      className: `fd-chase is-${tone}${running2 ? " is-running" : ""}${className ? ` ${className}` : ""}`,
      style: color ? { "--chase": color } : void 0,
      "aria-hidden": "true",
      focusable: "false"
    },
    /* @__PURE__ */ React17.createElement("rect", { x: "0", y: "0", width: "100%", height: "100%", pathLength: "400" })
  );
}
var DIGITS, CLACK_GAP_MS, useIsoLayoutEffect, now, DRUM, drumRollMs, flickTurns;
var init_ScoreReel = __esm({
  "src/ui/ScoreReel.jsx"() {
    init_sound();
    init_haptics();
    init_motion();
    init_backglass();
    DIGITS = "0123456789";
    CLACK_GAP_MS = 45;
    useIsoLayoutEffect = typeof window === "undefined" ? useEffect9 : useLayoutEffect4;
    now = () => typeof performance !== "undefined" ? performance.now() : Date.now();
    DRUM = Object.freeze({
      faceDeg: 36,
      // ten faces round the ring
      radius: 1.5388,
      // ring radius per face height: 1 / (2 tan 18deg)
      rollMs: 260,
      // one digit
      perStepMs: 55,
      // each further digit adds momentum
      maxRollMs: 900,
      spinMs: 720,
      // a flicked drum's spin, plus a stagger per drum
      spinStaggerMs: 150,
      maxTurns: 3,
      flickPx: 14
      // vertical travel before a press is a flick
    });
    drumRollMs = (steps) => Math.min(DRUM.maxRollMs, DRUM.rollMs + Math.max(0, Math.abs(steps) - 1) * DRUM.perStepMs);
    flickTurns = (speed) => Math.max(1, Math.min(DRUM.maxTurns, Math.round(Math.abs(Number(speed) || 0) * 1.6)));
  }
});

// src/features/profile/tilt.js
function dragTilt(dx, dy, width, height) {
  const dragging = Math.hypot(dx, dy) >= TILT.dragThreshold;
  if (!dragging) return { x: 0, y: 0, dragging: false };
  return {
    x: clampUnit(dx / Math.max(1, width * TILT.dragReach)),
    y: clampUnit(dy / Math.max(1, height * TILT.dragReach)),
    dragging: true
  };
}
function hoverTilt(clientX, clientY, rect) {
  if (!rect?.width || !rect?.height) return { x: 0, y: 0 };
  return {
    x: clampUnit((clientX - rect.left - rect.width / 2) / (rect.width / 2)),
    y: clampUnit((clientY - rect.top - rect.height / 2) / (rect.height / 2))
  };
}
function orientationTilt({ gamma, beta }, base) {
  if (!Number.isFinite(gamma) || !Number.isFinite(beta) || !base) return { x: 0, y: 0 };
  return {
    x: clampUnit((gamma - base.gamma) / TILT.orientationRange),
    y: clampUnit((beta - base.beta) / TILT.orientationRange)
  };
}
function stepToward(current, target, rate) {
  const x = current.x + (target.x - current.x) * rate;
  const y = current.y + (target.y - current.y) * rate;
  const settled = Math.abs(target.x - x) < 2e-3 && Math.abs(target.y - y) < 2e-3;
  return settled ? { x: target.x, y: target.y, settled } : { x, y, settled };
}
function canFollowOrientation({ userAgent = "", platform = "", OrientationEvent } = {}) {
  if (typeof OrientationEvent !== "function") return false;
  if (typeof OrientationEvent.requestPermission === "function") return false;
  if (/iPhone|iPad|iPod/i.test(userAgent)) return false;
  return /Android/i.test(platform) || /Android/i.test(userAgent);
}
var TILT, clampUnit, recenter, plateStrength;
var init_tilt = __esm({
  "src/features/profile/tilt.js"() {
    TILT = Object.freeze({
      dragThreshold: 8,
      // px before a press becomes a tilt instead of a flip
      dragReach: 0.35,
      // fraction of the card that reaches full tilt
      follow: 0.18,
      // per-frame lerp while a pointer leads
      orientationFollow: 0.12,
      orientationRange: 20,
      // degrees of phone tilt for full card tilt
      recenter: 0.01,
      // the orientation baseline drifts toward how the phone is held
      releaseMs: 520,
      openMs: 700,
      flipHoldMs: 650,
      open: Object.freeze({ x: 0.35, y: -0.2 }),
      rotateX: 7,
      rotateY: 9
    });
    clampUnit = (value) => Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
    recenter = (base, reading, rate = TILT.recenter) => ({
      gamma: base.gamma + (reading.gamma - base.gamma) * rate,
      beta: base.beta + (reading.beta - base.beta) * rate
    });
    plateStrength = (x, y) => Math.min(1, Math.hypot(x, y) * 2.5);
  }
});

// src/features/profile/useRisoTilt.js
import { useEffect as useEffect10, useLayoutEffect as useLayoutEffect5, useRef as useRef9 } from "react";
function useRisoTilt(ref, enabled) {
  const st = useRef9(null);
  if (!st.current) st.current = {
    cur: { x: 0, y: 0 },
    target: { x: 0, y: 0 },
    raf: 0,
    pointer: null,
    hover: null,
    orient: null,
    suppress: false,
    hold: 0,
    timer: 0,
    opened: false,
    visible: true
  };
  const s = st.current;
  const write = (x, y) => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--tx", x.toFixed(4));
    el.style.setProperty("--ty", y.toFixed(4));
    el.style.setProperty("--tm", plateStrength(x, y).toFixed(3));
  };
  const frame2 = () => {
    s.raf = 0;
    const rate = s.pointer || s.hover ? TILT.follow : TILT.orientationFollow;
    s.cur = stepToward(s.cur, s.target, rate);
    write(s.cur.x, s.cur.y);
    if (!s.cur.settled) s.raf = requestAnimationFrame(frame2);
  };
  const follow = (target) => {
    const el = ref.current;
    if (!el) return;
    s.target = target;
    clearTimeout(s.timer);
    if (el.classList.contains("is-releasing")) {
      el.classList.remove("is-releasing");
      s.cur = { x: 0, y: 0 };
    }
    el.classList.add("is-tilting");
    if (!s.raf) s.raf = requestAnimationFrame(frame2);
  };
  const release = (ms = TILT.releaseMs) => {
    const el = ref.current;
    if (s.raf) cancelAnimationFrame(s.raf);
    s.raf = 0;
    if (!el) return;
    if (s.orient?.target && Date.now() >= s.hold) {
      follow(s.orient.target);
      return;
    }
    s.target = { x: 0, y: 0 };
    s.cur = { x: 0, y: 0 };
    el.style.setProperty("--tilt-release", `${ms}ms`);
    el.classList.add("is-releasing");
    write(0, 0);
    clearTimeout(s.timer);
    s.timer = setTimeout(() => el.classList.remove("is-releasing", "is-tilting"), ms + 60);
  };
  const reset = () => {
    const el = ref.current;
    if (s.raf) cancelAnimationFrame(s.raf);
    clearTimeout(s.timer);
    s.raf = 0;
    s.pointer = null;
    s.hover = null;
    s.cur = { x: 0, y: 0 };
    s.target = { x: 0, y: 0 };
    if (!el) return;
    el.classList.remove("is-releasing", "is-tilting");
    ["--tx", "--ty", "--tm", "--tilt-release"].forEach((name) => el.style.removeProperty(name));
  };
  const openSettle = () => {
    if (s.opened || !ref.current) return;
    s.opened = true;
    s.cur = { ...TILT.open };
    write(TILT.open.x, TILT.open.y);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!s.pointer && !s.hover) release(TILT.openMs);
    }));
  };
  useIsoLayoutEffect2(() => {
    if (!enabled) {
      reset();
      return void 0;
    }
    const el = ref.current;
    if (!el || typeof window === "undefined") return void 0;
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.bottom > 0 && rect.top < window.innerHeight) openSettle();
    return void 0;
  }, [enabled]);
  useEffect10(() => {
    if (!enabled) return void 0;
    const el = ref.current;
    if (!el || typeof IntersectionObserver !== "function") return void 0;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.some((entry) => entry.isIntersecting);
      s.visible = visible;
      if (visible) openSettle();
      else if (s.orient) {
        s.orient = null;
        release();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [enabled]);
  useEffect10(() => {
    if (!enabled || typeof window === "undefined") return void 0;
    const allowed = canFollowOrientation({
      userAgent: navigator.userAgent,
      platform: navigator.userAgentData?.platform,
      OrientationEvent: window.DeviceOrientationEvent
    });
    if (!allowed) return void 0;
    const onOrient = (event) => {
      if (!s.visible || !Number.isFinite(event.gamma) || !Number.isFinite(event.beta)) return;
      const reading = { gamma: event.gamma, beta: event.beta };
      if (!s.orient) s.orient = { base: reading, target: { x: 0, y: 0 } };
      s.orient.base = recenter(s.orient.base, reading);
      s.orient.target = orientationTilt(reading, s.orient.base);
      if (!s.pointer && !s.hover && Date.now() >= s.hold) follow(s.orient.target);
    };
    window.addEventListener("deviceorientation", onOrient);
    return () => {
      window.removeEventListener("deviceorientation", onOrient);
      s.orient = null;
    };
  }, [enabled]);
  useEffect10(() => () => {
    if (s.raf) cancelAnimationFrame(s.raf);
    clearTimeout(s.timer);
  }, []);
  const handlers = enabled ? {
    onPointerDown: (event) => {
      s.suppress = false;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const rect = event.currentTarget.getBoundingClientRect();
      s.pointer = { id: event.pointerId, x0: event.clientX, y0: event.clientY, w: rect.width, h: rect.height, dragging: false };
    },
    onPointerMove: (event) => {
      if (s.pointer && event.pointerId === s.pointer.id) {
        const tilt = dragTilt(event.clientX - s.pointer.x0, event.clientY - s.pointer.y0, s.pointer.w, s.pointer.h);
        if (tilt.dragging) {
          s.pointer.dragging = true;
          follow(tilt);
        }
        return;
      }
      if (event.pointerType !== "mouse" || Date.now() < s.hold) return;
      if (!s.hover) s.hover = { rect: event.currentTarget.getBoundingClientRect() };
      follow(hoverTilt(event.clientX, event.clientY, s.hover.rect));
    },
    onPointerUp: (event) => {
      if (!s.pointer || event.pointerId !== s.pointer.id) return;
      if (s.pointer.dragging) {
        s.suppress = Date.now();
        s.pointer = null;
        release();
      } else s.pointer = null;
    },
    onPointerCancel: () => {
      s.pointer = null;
      release();
    },
    onPointerLeave: (event) => {
      if (event.pointerType !== "mouse") return;
      s.hover = null;
      if (s.pointer) s.pointer = null;
      release();
    }
  } : {};
  return {
    handlers,
    /* true once for the click that ends a tilt drag */
    consumeClick() {
      const recent = s.suppress && Date.now() - s.suppress < 500;
      s.suppress = false;
      return !!recent;
    },
    /* the flip turns a level card */
    flip() {
      if (!enabled) return;
      s.hold = Date.now() + TILT.flipHoldMs;
      s.hover = null;
      release();
    }
  };
}
var useIsoLayoutEffect2;
var init_useRisoTilt = __esm({
  "src/features/profile/useRisoTilt.js"() {
    init_tilt();
    useIsoLayoutEffect2 = typeof window === "undefined" ? useEffect10 : useLayoutEffect5;
  }
});

// src/features/profile/seasonStats.js
function roundShort(teamCount, round) {
  const name = ROUND_NAMES[teamCount]?.[round];
  return name ? ROUND_SHORT[name] || name : `Round ${round + 1}`;
}
function stagePlayers(state, st, key, evId = st.eventId) {
  if (st.entrantType === "team") {
    const draw = state.draws?.[evId];
    if (!draw || st.drawId && draw.id !== st.drawId) return [];
  }
  return stageEntrantView(state, { ...st, eventId: evId }, key).players || [];
}
function groupWinner(st, group) {
  if (decided(group?.winner)) return group.winner;
  const through = group?.through || [];
  return st.advance === 1 && through.length === 1 ? through[0] : null;
}
function bracketStanding(state, ev, teamIdx) {
  const br = state.brackets?.[ev.id], draw = state.draws?.[ev.id];
  if (!br?.rounds || !draw?.teams) return null;
  let next = null;
  for (let r = 0; r < br.rounds.length; r++) {
    for (const match of br.rounds[r]) {
      const sides = [resolveSlot(br, match.a), resolveSlot(br, match.b)];
      if (!sides.includes(teamIdx)) continue;
      if (decided(match.winner) && match.winner !== teamIdx)
        return { out: true, label: roundShort(draw.teams.length, r) };
      if (!decided(match.winner) && next === null) next = r;
    }
  }
  return { out: false, label: next === null ? "" : roundShort(draw.teams.length, next) };
}
function stageStanding(state, st, player, evId) {
  const keyOf = (key) => stagePlayers(state, st, key, evId).includes(player);
  const group = (st.groups || []).find((g) => (g.entrants || []).some(keyOf));
  if (!group) return null;
  const through = group.through || [];
  const winner = groupWinner(st, group);
  const qualified = through.some(keyOf) || decided(winner) && keyOf(winner);
  const groupDone = through.length >= st.advance || decided(winner);
  if (groupDone && !qualified) return { out: true, label: "Heat" };
  if (!groupDone) return { out: false, label: group.name || "Heat" };
  if (decided(st.finalWinner) && !keyOf(st.finalWinner)) return { out: true, label: "Final" };
  return { out: false, label: "Final" };
}
function eventRow(state, ev, player) {
  if (!ev || ev.finale || state.shelved?.[ev.id]) return null;
  const res = state.results?.[ev.id];
  if (!res && !eventInPlay(state, ev)) return null;
  const draw = state.draws?.[ev.id], st = state.stages?.[ev.id];
  const teamIdx = teamIndexOf(draw, player);
  const crew = [...draw?.roles || [], ...st?.roles || []].some((role) => role?.player === player);
  const played = teamIdx >= 0 ? true : st?.entrantType === "solo" ? (st.groups || []).some((g) => (g.entrants || []).includes(player)) : draw?.teams ? false : !crew && !isAway(state, player);
  const base = { id: ev.id, name: ev.name, session: ev.session, value: ev.value || 0 };
  if (res) {
    const award = resultAwards(state, ev, res).find((item) => item.player === player);
    if (award && award.place === "crew") return { ...base, status: "crew", place: "Crew", award: award.pts };
    if (award) return { ...base, status: "placed", rank: award.place, place: placeLabel(award.place), award: award.pts };
    if (crew) return { ...base, status: "crew", place: "Crew", award: 0 };
    if (!played) return null;
    const exit = teamIdx >= 0 && state.brackets?.[ev.id] ? bracketStanding(state, ev, teamIdx) : st ? stageStanding(state, st, player, ev.id) : null;
    return { ...base, status: "out", place: exit?.label || "\u2013", award: 0 };
  }
  if (crew) return { ...base, status: "crew", place: "Crew", award: null };
  if (!played) return null;
  const standing = teamIdx >= 0 && state.brackets?.[ev.id] ? bracketStanding(state, ev, teamIdx) : st ? stageStanding(state, st, player, ev.id) : null;
  if (standing?.out) return { ...base, status: "out", place: standing.label, award: null };
  return { ...base, status: "playing", place: standing?.label || "\u2013", award: null };
}
function wagerPickPlayers(state, wager) {
  if (Array.isArray(wager?.pickPlayers) && wager.pickPlayers.length) return wager.pickPlayers;
  if (wager?.kind === "outright") return wager.pick ? [wager.pick] : [];
  if (wager?.kind === "match") return state.draws?.[wager.eventId]?.teams?.[wager.teamIdx]?.players || [];
  if (wager?.kind === "stage" || wager?.kind === "heat") {
    const st = state.stages?.[wager.eventId];
    return st ? stagePlayers(state, st, wager.pickKey, wager.eventId) : [];
  }
  return [];
}
function betRecord(state, player, events = allEventsOf(state)) {
  const out = { won: 0, lost: 0, net: 0, pending: 0, atRisk: 0, best: null };
  (state.wagers || []).forEach((wager) => {
    if (wager.player !== player) return;
    const result = resolveWager(state, wager, events);
    if (result.status === "pending") {
      out.pending += 1;
      out.atRisk += Number(wager.stake) || 0;
      return;
    }
    if (result.status !== "won" && result.status !== "lost") return;
    out[result.status] += 1;
    out.net += result.delta;
    if (result.status === "won" && (!out.best || result.delta > out.best.delta)) {
      const ev = events.find((item) => item.id === wager.eventId);
      out.best = {
        eventId: wager.eventId,
        name: ev?.name || wager.evName || "",
        delta: result.delta,
        stake: Number(wager.stake) || 0,
        pick: wagerPickPlayers(state, wager)
      };
    }
  });
  return out;
}
function duelTally(state, player, other = null) {
  const out = { won: 0, lost: 0, push: 0, net: 0 };
  (state.duels || []).forEach((duel) => {
    if (duel.from !== player && duel.to !== player) return;
    if (other && duel.from !== other && duel.to !== other) return;
    const result = resolveDuel(duel);
    if (!result.settled) return;
    if (result.push) {
      out.push += 1;
      return;
    }
    const stake = Number(duel.stake) || 0;
    if (result.winner === player) {
      out.won += 1;
      out.net += stake;
    } else {
      out.lost += 1;
      out.net -= stake;
    }
  });
  return out;
}
function eventMeetings(state, a, b, events = allEventsOf(state)) {
  if (!a || !b || a === b) return [];
  const out = [];
  const meet = (ev, label2, sides, winnerSide) => {
    const sideA = sides.findIndex((players) => players.includes(a));
    const sideB = sides.findIndex((players) => players.includes(b));
    if (sideA < 0 || sideB < 0 || sideA === sideB) return;
    if (sides.length > 2 && winnerSide !== sideA && winnerSide !== sideB) return;
    out.push({ eventId: ev.id, event: ev.name, label: label2, won: winnerSide === sideA });
  };
  events.forEach((ev) => {
    if (!ev || ev.finale || state.shelved?.[ev.id]) return;
    const draw = state.draws?.[ev.id], br = state.brackets?.[ev.id], st = state.stages?.[ev.id];
    if (br?.rounds && draw?.teams) {
      br.rounds.forEach((round, r) => round.forEach((match, m) => {
        if (!decided(match.winner)) return;
        const keys = [resolveSlot(br, match.a), resolveSlot(br, match.b)];
        if (keys.some((key) => !draw.teams[key])) return;
        meet(
          ev,
          contestEntryLabel(state, ev, { kind: "match", match: [r, m] }),
          keys.map((key) => draw.teams[key].players || []),
          keys.indexOf(match.winner)
        );
      }));
      return;
    }
    if (st?.groups) {
      st.groups.forEach((group) => {
        const winner = groupWinner(st, group);
        if (!decided(winner)) return;
        const keys = group.entrants || [];
        meet(ev, group.name || "Heat", keys.map((key) => stagePlayers(state, st, key, ev.id)), keys.indexOf(winner));
      });
      const finalists = stageFinalists(st);
      if (finalists && decided(st.finalWinner))
        meet(ev, "Final", finalists.map((key) => stagePlayers(state, st, key, ev.id)), finalists.indexOf(st.finalWinner));
      return;
    }
    const res = state.results?.[ev.id];
    if (draw?.teams?.length === 2 && res?.slots?.[0]?.length) {
      const sides = draw.teams.map((team) => team.players || []);
      const winnerSide = sides.findIndex((players) => res.slots[0].some((player) => players.includes(player)));
      if (winnerSide >= 0) meet(ev, ev.name, sides, winnerSide);
    }
  });
  return out;
}
function betsOn(state, viewer, player, events = allEventsOf(state)) {
  const out = { won: 0, lost: 0, net: 0 };
  (state.wagers || []).forEach((wager) => {
    if (wager.player !== viewer || !wagerPickPlayers(state, wager).includes(player)) return;
    const result = resolveWager(state, wager, events);
    if (result.status !== "won" && result.status !== "lost") return;
    out[result.status] += 1;
    out.net += result.delta;
  });
  return out;
}
function headToHead(state, a, b, events = allEventsOf(state)) {
  const meetings = eventMeetings(state, a, b, events);
  const duels = duelTally(state, a, b);
  const won = meetings.filter((meeting) => meeting.won).length + duels.won;
  const lost = meetings.filter((meeting) => !meeting.won).length + duels.lost;
  return { player: a, other: b, meetings, duels, won, lost, count: won + lost + duels.push };
}
function rivalries(state, player, { events = allEventsOf(state), limit = 3 } = {}) {
  return ROSTER.filter((other) => other !== player).map((other) => headToHead(state, player, other, events)).filter((record) => record.won + record.lost > 0).sort((x, y) => y.won + y.lost - (x.won + x.lost) || Math.abs(x.won - x.lost) - Math.abs(y.won - y.lost) || ROSTER.indexOf(x.other) - ROSTER.indexOf(y.other)).slice(0, limit);
}
function seasonStats(state, player, { events = allEventsOf(state), standings, viewer = null } = {}) {
  const rows = events.map((ev) => eventRow(state, ev, player)).filter(Boolean);
  const bets = betRecord(state, player, events);
  const duels = duelTally(state, player);
  const table = state.live ? standings || computeStandings(state) : null;
  const row = table?.find((item) => item.player === player) || null;
  const moved = !!table?.some((item) => item.pts !== START);
  const own = !!viewer && viewer === player;
  const versus = viewer && !own ? headToHead(state, viewer, player, events) : null;
  const mvps = mvpAwards(state).filter((item) => item.player === player).length;
  return {
    player,
    events: rows,
    wins: rows.filter((item) => item.status === "placed" && item.rank === 0).length,
    mvps,
    bets,
    duels,
    rank: moved ? row?.rank ?? null : null,
    pts: row ? row.pts : null,
    versus: versus && versus.count > 0 ? { ...versus, bets: betsOn(state, viewer, player, events) } : null,
    rivals: own ? rivalries(state, player, { events }) : [],
    active: rows.length > 0 || bets.won + bets.lost + bets.pending > 0 || duels.won + duels.lost + duels.push > 0 || mvps > 0 || moved
  };
}
var decided, placeLabel, ROUND_SHORT, teamIndexOf, recordText;
var init_seasonStats = __esm({
  "src/features/profile/seasonStats.js"() {
    init_core();
    decided = (value) => value !== null && value !== void 0;
    placeLabel = (place) => ["1st", "2nd", "3rd"][place] || `${place + 1}th`;
    ROUND_SHORT = { Semifinals: "SF", Semifinal: "SF", Quarterfinals: "QF", Quarterfinal: "QF" };
    teamIndexOf = (draw, player) => Array.isArray(draw?.teams) ? draw.teams.findIndex((team) => team?.players?.includes(player)) : -1;
    recordText = ({ won = 0, lost = 0, push = 0 }) => `${won}-${lost}${push ? `-${push}` : ""}`;
  }
});

// src/features/profile/player-pass.css
var init_player_pass = __esm({
  "src/features/profile/player-pass.css"() {
  }
});

// src/features/profile/PlayerPass.jsx
import React18, { useEffect as useEffect11, useMemo as useMemo2, useRef as useRef10, useState as useState10 } from "react";
function cardInk(color) {
  const luminanceOf = (hex) => {
    const channels2 = hex.slice(1).match(/.{2}/g).map((value) => parseInt(value, 16) / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return channels2[0] * 0.2126 + channels2[1] * 0.7152 + channels2[2] * 0.0722;
  };
  const luminance2 = luminanceOf(color), darkLuminance = luminanceOf("#070b09");
  return (luminance2 + 0.05) / (darkLuminance + 0.05) >= 1.05 / (luminance2 + 0.05) ? "#070b09" : "#ffffff";
}
function PlayerPass({
  state,
  p,
  display,
  num,
  photo,
  compact = false,
  mint = false,
  viewer = null,
  events,
  standings,
  onFlip,
  own = true
}) {
  const identity = usePlayerIdentity(p);
  const initials = usePlayerInitials(p);
  const [flipped, setFlipped] = useState10(false);
  const reducedMotion = useReducedMotion();
  const cardRef = useRef10(null);
  const tilt = useRisoTilt(cardRef, !reducedMotion && !!p);
  const profile = state.profiles?.[p] || {};
  const name = display?.trim() || profile.display || p;
  const number = !own ? null : num !== void 0 && num !== null && num !== "" ? Number(num) : identity.num;
  const saved2 = photo || (profile.photoV ? `/api/photo/${encodeURIComponent(p)}?v=${profile.photoV}` : null);
  const [failed, setFailed] = useState10(null);
  const portrait = saved2 && failed !== saved2 ? saved2 : null;
  const rows = useMemo2(() => standings || (state.live ? computeStandings(state) : null), [standings, state]);
  const standing = state.live ? rows?.find((row) => row.player === p) : null;
  const season = useMemo2(
    () => p ? seasonStats(
      state,
      p,
      { events: events || allEventsOf(state), standings: rows || void 0, viewer }
    ) : null,
    [state, p, events, rows, viewer]
  );
  const sheet = !!season && (season.active || !!season.versus);
  const seasonRef = useRef10(null);
  const [backHeight, setBackHeight] = useState10(0);
  useEffect11(() => {
    const body = seasonRef.current, face = body?.parentElement;
    if (!body || !face || typeof window === "undefined") {
      setBackHeight(0);
      return void 0;
    }
    const measure = () => {
      const cs = window.getComputedStyle(face);
      const frame2 = ["paddingTop", "paddingBottom", "borderTopWidth", "borderBottomWidth"].reduce((sum, key) => sum + (parseFloat(cs[key]) || 0), 0);
      setBackHeight(Math.ceil(body.offsetHeight + frame2));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return void 0;
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    return () => observer.disconnect();
  }, [sheet]);
  if (!p) return null;
  const longest = Math.max(4, ...name.split(/\s+/).map((word) => word.length));
  const monogram = (name === (profile.display || p) ? initials : String(name || "").trim().slice(0, 2).toUpperCase()) || "FD";
  const ghost = number == null ? monogram : String(number).padStart(2, "0");
  const turn = () => {
    const next = !flipped;
    setFlipped(next);
    onFlip?.(next);
  };
  return /* @__PURE__ */ React18.createElement(
    "div",
    {
      className: `fd-pass-wrap${compact ? " fd-pass-compact" : ""}`,
      style: {
        "--pass-color": identity.color,
        "--pass-ink": identity.isLight ? "var(--ink0)" : "var(--bone)",
        "--pass-name-chars": longest
      }
    },
    /* @__PURE__ */ React18.createElement(
      "button",
      {
        type: "button",
        ref: cardRef,
        className: "fd-pass",
        ...tilt.handlers,
        style: backHeight ? { minHeight: flipped ? backHeight : 0 } : void 0,
        onClick: () => {
          if (tilt.consumeClick()) return;
          tilt.flip();
          turn();
        },
        "aria-label": `${name}'s player card. ${flipped ? "Show front" : "Turn over"}`,
        "aria-pressed": flipped
      },
      /* @__PURE__ */ React18.createElement("span", { className: "fd-pass-shadow", "aria-hidden": "true" }),
      /* @__PURE__ */ React18.createElement("span", { className: "fd-pass-tilt" }, /* @__PURE__ */ React18.createElement("span", { className: `fd-pass-inner${flipped ? " is-flipped" : ""}` }, /* @__PURE__ */ React18.createElement("span", { className: "fd-pass-face fd-pass-front", "aria-hidden": flipped }, /* @__PURE__ */ React18.createElement("span", { className: "fd-pass-bulbs", "aria-hidden": "true" }), /* @__PURE__ */ React18.createElement("span", { className: "fd-pass-top" }, /* @__PURE__ */ React18.createElement("span", { className: "fd-pass-mark" }, "Field Day"), /* @__PURE__ */ React18.createElement("span", null, EDITION.label)), /* @__PURE__ */ React18.createElement("span", { className: "fd-pass-art" }, /* @__PURE__ */ React18.createElement("span", { className: "fd-pass-orbit" }), /* @__PURE__ */ React18.createElement("span", { className: "fd-pass-number" }, ghost), /* @__PURE__ */ React18.createElement("span", { className: "fd-pass-number fd-pass-plate", "aria-hidden": "true" }, ghost), portrait && /* @__PURE__ */ React18.createElement("span", { className: "fd-pass-window" }, /* @__PURE__ */ React18.createElement("img", { className: "fd-pass-photo", src: portrait, alt: "", onError: () => setFailed(portrait) })), /* @__PURE__ */ React18.createElement("span", { className: `fd-pass-chip${portrait ? " with-photo" : ""}` }, /* @__PURE__ */ React18.createElement(ChipCoin, { p, size: portrait ? 74 : 112, stamp: number == null ? void 0 : String(number), mint }))), /* @__PURE__ */ React18.createElement("span", { className: "fd-pass-name" }, name), /* @__PURE__ */ React18.createElement("span", { className: "fd-pass-foot" }, /* @__PURE__ */ React18.createElement("span", null, /* @__PURE__ */ React18.createElement(OneSafe, { text: EDITION.short })), number != null && /* @__PURE__ */ React18.createElement("span", null, /* @__PURE__ */ React18.createElement(OneSafe, { text: `PLAYER / ${number}` })))), /* @__PURE__ */ React18.createElement("span", { className: `fd-pass-face fd-pass-back${sheet ? " is-season" : ""}`, "aria-hidden": !flipped }, /* @__PURE__ */ React18.createElement("span", { className: "fd-pass-bulbs", "aria-hidden": "true" }), sheet ? /* @__PURE__ */ React18.createElement(
        SeasonBack,
        {
          state,
          name,
          number,
          season,
          walkout: profile.walkoutTrack?.name,
          bodyRef: seasonRef
        }
      ) : /* @__PURE__ */ React18.createElement(React18.Fragment, null, /* @__PURE__ */ React18.createElement("span", { className: "fd-pass-top" }, /* @__PURE__ */ React18.createElement("span", { className: "fd-pass-mark" }, "Field Day"), /* @__PURE__ */ React18.createElement("span", null, EDITION.year)), /* @__PURE__ */ React18.createElement("span", { className: "fd-pass-back-title" }, /* @__PURE__ */ React18.createElement("span", null, name), /* @__PURE__ */ React18.createElement("b", null, number == null ? "Player card" : `Player ${String(number).padStart(2, "0")}`)), /* @__PURE__ */ React18.createElement("span", { className: "fd-pass-facts" }, /* @__PURE__ */ React18.createElement("span", null, /* @__PURE__ */ React18.createElement("span", null, "Scottsdale, Arizona"), /* @__PURE__ */ React18.createElement("span", null, /* @__PURE__ */ React18.createElement(OneSafe, { text: EDITION.short }))), standing && /* @__PURE__ */ React18.createElement("span", null, /* @__PURE__ */ React18.createElement("span", null, "Current chips"), /* @__PURE__ */ React18.createElement("strong", { className: "fd-pass-chips" }, standing.pts.toLocaleString("en-US"))), profile.walkoutTrack?.name && /* @__PURE__ */ React18.createElement("span", null, /* @__PURE__ */ React18.createElement("span", null, "Win song"), /* @__PURE__ */ React18.createElement("strong", null, profile.walkoutTrack.name)))))))
    ),
    /* @__PURE__ */ React18.createElement("span", { className: "fd-pass-hint" }, flipped ? "Tap to see the front" : "Tap to turn over")
  );
}
function SeasonBack({ state, name, number, season, walkout, bodyRef }) {
  const { versus, events, bets, duels, rivals } = season;
  const settledBets = bets.won + bets.lost;
  const settledDuels = duels.won + duels.lost + duels.push;
  let index = 0;
  const order = () => ({ "--i": index++ });
  const totals = [
    season.rank !== null && { key: "rank", value: String(season.rank), label: "Rank" },
    /* a plain number: digit windows are for hero numbers, not a stat row */
    season.pts !== null && { key: "chips", value: Number(season.pts).toLocaleString("en-US"), label: "Chips", tone: "chip" },
    settledBets > 0 && { key: "bets", value: signedChips(bets.net), label: `Bets ${recordText(bets)}`, tone: "chip" },
    settledDuels > 0 && { key: "duels", value: recordText(duels), label: "Quick Draw" },
    season.mvps > 0 && { key: "mvps", value: String(season.mvps), label: season.mvps === 1 ? "Team MVP" : "Team MVPs" }
  ].filter(Boolean);
  const meetings = versus ? versus.meetings.slice(-3) : [];
  return /* @__PURE__ */ React18.createElement("span", { className: "fd-pass-season", ref: bodyRef }, /* @__PURE__ */ React18.createElement("span", { className: "fd-pass-top" }, /* @__PURE__ */ React18.createElement("span", { className: "fd-pass-mark" }, "Field Day"), /* @__PURE__ */ React18.createElement("span", null, EDITION.year)), /* @__PURE__ */ React18.createElement("span", { className: "fd-pass-season-head" }, /* @__PURE__ */ React18.createElement("span", { className: "fd-pass-season-title" }, name), number != null && /* @__PURE__ */ React18.createElement("span", { className: "fd-pass-season-ghost" }, String(number).padStart(2, "0"))), versus && /* @__PURE__ */ React18.createElement("span", { className: "fd-pass-box fd-pass-row", style: order() }, /* @__PURE__ */ React18.createElement("span", { className: "fd-pass-box-head" }, /* @__PURE__ */ React18.createElement("span", null, "You vs ", name), /* @__PURE__ */ React18.createElement("strong", null, recordText(versus))), meetings.map((meeting, at) => /* @__PURE__ */ React18.createElement("span", { className: "fd-pass-line", key: `${meeting.eventId}-${at}` }, /* @__PURE__ */ React18.createElement("span", null, meeting.event), /* @__PURE__ */ React18.createElement("strong", null, meeting.won ? "You" : name))), versus.duels.won + versus.duels.lost + versus.duels.push > 0 && /* @__PURE__ */ React18.createElement("span", { className: "fd-pass-line" }, /* @__PURE__ */ React18.createElement("span", null, "Quick Draw"), /* @__PURE__ */ React18.createElement("strong", null, recordText(versus.duels))), versus.bets.won + versus.bets.lost > 0 && /* @__PURE__ */ React18.createElement("span", { className: "fd-pass-line" }, /* @__PURE__ */ React18.createElement("span", null, "Your bets on ", name), /* @__PURE__ */ React18.createElement("strong", null, signedChips(versus.bets.net)))), events.length > 0 && /* @__PURE__ */ React18.createElement("span", { className: "fd-pass-table" }, /* @__PURE__ */ React18.createElement("span", { className: "fd-pass-table-head fd-pass-row", style: order() }, /* @__PURE__ */ React18.createElement("span", null, "Event"), /* @__PURE__ */ React18.createElement("span", null, "Place"), /* @__PURE__ */ React18.createElement("span", null, "Chips")), events.map((row) => /* @__PURE__ */ React18.createElement("span", { key: row.id, className: `fd-pass-table-row fd-pass-row is-${row.status}`, style: order() }, /* @__PURE__ */ React18.createElement("span", null, row.name), /* @__PURE__ */ React18.createElement("strong", null, row.place), /* @__PURE__ */ React18.createElement("span", null, awardText(row))))), totals.length > 0 && /* @__PURE__ */ React18.createElement("span", { className: "fd-pass-totals fd-pass-row", style: order() }, totals.map((item) => /* @__PURE__ */ React18.createElement("span", { key: item.key }, /* @__PURE__ */ React18.createElement("strong", { className: item.tone ? `is-${item.tone}` : void 0 }, item.value), /* @__PURE__ */ React18.createElement("small", null, item.label)))), rivals.length > 0 && /* @__PURE__ */ React18.createElement("span", { className: "fd-pass-box fd-pass-row", style: order() }, /* @__PURE__ */ React18.createElement("span", { className: "fd-pass-box-head" }, /* @__PURE__ */ React18.createElement("span", null, "Rivalries")), rivals.map((record) => /* @__PURE__ */ React18.createElement("span", { className: "fd-pass-line", key: record.other }, /* @__PURE__ */ React18.createElement("span", null, "vs ", disp(state, record.other)), /* @__PURE__ */ React18.createElement("strong", null, recordText(record))))), walkout && /* @__PURE__ */ React18.createElement("span", { className: "fd-pass-line fd-pass-walkout fd-pass-row", style: order() }, /* @__PURE__ */ React18.createElement("span", null, "Win song"), /* @__PURE__ */ React18.createElement("strong", null, walkout)));
}
var awardText;
var init_PlayerPass = __esm({
  "src/features/profile/PlayerPass.jsx"() {
    init_core();
    init_ChipCoin();
    init_PlayerIdentityContext();
    init_motion2();
    init_motion();
    init_ScoreReel();
    init_OneSafe();
    init_useRisoTilt();
    init_seasonStats();
    init_player_pass();
    awardText = (row) => row.award === null || row.award === void 0 ? row.status === "playing" ? "Playing" : "\u2013" : row.award > 0 ? signedChips(row.award) : "0";
  }
});

// src/ui/phase.js
var PHASES, isPhase;
var init_phase = __esm({
  "src/ui/phase.js"() {
    init_core();
    PHASES = Object.freeze(["fri", "sam", "sap", "san", "fin"]);
    isPhase = (phase) => PHASES.includes(phase);
  }
});

// src/features/tv/desertModel.js
function skyline(points, { width, horizon, amp, x0 = 0, x1 = 1, envelope = () => 1, bottom }) {
  const at = ([x, h]) => [r1((x0 + x * (x1 - x0)) * width), r1(horizon - h * amp * envelope(x0 + x * (x1 - x0)))];
  const pts = points.map(at);
  const first = pts[0], last = pts[pts.length - 1];
  const lead = x0 > 0 ? [[0, first[1]]] : [];
  const tail = x1 < 1 ? [[width, last[1]]] : [];
  const all = [...lead, ...pts, ...tail];
  return `M${all.map(([x, y]) => `${x} ${y}`).join("L")}V${bottom}H0Z`;
}
function glassStars(count = 46, { width = GLASS.width, top = 16, bottom = 640 } = {}) {
  let seed = 3107741;
  const next = () => {
    seed = Math.imul(seed, 1103515245) + 12345 >>> 0;
    return seed / 4294967295;
  };
  return Array.from({ length: count }, () => ({
    x: Math.round(16 + next() * (width - 32)),
    y: Math.round(top + next() * (bottom - top)),
    r: Math.round((1.4 + next() * 1.8) * 10) / 10,
    dim: next() > 0.6
  }));
}
function discStripes(disc, horizon = GLASS.horizon) {
  if (!disc?.stripes || !(disc.r > 0)) return [];
  const out = [];
  const top = disc.y - disc.r * 0.15;
  let y = top, gap = 10, k = 0;
  while (y < Math.min(horizon, disc.y + disc.r)) {
    const h = 5 + k * 3;
    const band = GLASS_BANDS.find(([from, to]) => y + h / 2 >= from && y + h / 2 < to)?.[2] || "glow";
    out.push({ y: Math.round(y), h, band });
    y += h + gap;
    gap = Math.max(5, gap - 1);
    k += 1;
  }
  return out;
}
function backglassScene({ width = GLASS.width, height = GLASS.height } = {}) {
  const horizon = GLASS.horizon;
  const bands = GLASS_BANDS.map(([from, to, layer]) => ({ y: from, h: to - from, layer }));
  const far = skyline(FAR, { width, horizon, amp: 190, bottom: horizon + 2 });
  const hump = skyline(MID, {
    width,
    horizon,
    amp: 120,
    x0: 0.34,
    x1: 0.7,
    envelope: (x) => smooth(0.3, 0.42, x) * (1 - smooth(0.6, 0.74, x)),
    bottom: horizon + 2
  });
  const buttes = BUTTES.map((b) => ({ lit: poly(b.lit), shade: poly(b.shade) }));
  const cacti = GLASS_CACTI.map(([x, scale, shape]) => ({ x, y: horizon + 18, scale, d: SAGUAROS[shape].d }));
  return {
    width,
    height,
    horizon,
    floor: GLASS.floor,
    bands,
    far,
    hump,
    buttes,
    cacti,
    stars: glassStars(),
    starBox: { left: 140, right: width - 140, top: 120, bottom: 560 }
  };
}
var DESERT_DAY, DESERT_NIGHT, FAR, MID, SAGUAROS, r1, smooth, GLASS, GLASS_STARRY, GLASS_BANDS, GLASS_DISC, BUTTES, GLASS_CACTI, poly;
var init_desertModel = __esm({
  "src/features/tv/desertModel.js"() {
    init_phase();
    DESERT_DAY = Object.freeze(["sam", "sap"]);
    DESERT_NIGHT = Object.freeze(["san", "fin"]);
    FAR = [
      [0, 0.5],
      [0.075, 0.625],
      [0.131, 0.5625],
      [0.206, 0.78],
      [0.2625, 0.69],
      [0.325, 0.84],
      [0.4, 0.72],
      [0.475, 0.81],
      [0.55, 0.67],
      [0.625, 0.78],
      [0.706, 0.69],
      [0.7875, 0.83],
      [0.8625, 0.7],
      [0.9375, 0.78],
      [1, 0.72]
    ];
    MID = [
      [0, 0.25],
      [0.1125, 0.34],
      [0.1875, 0.5],
      [0.2375, 0.69],
      [0.28125, 0.78],
      [0.325, 0.69],
      [0.356, 0.59],
      [0.4, 0.69],
      [0.4375, 0.91],
      [0.475, 1],
      [0.5125, 0.94],
      [0.55, 0.78],
      [0.6, 0.56],
      [0.6875, 0.41],
      [0.8125, 0.375],
      [1, 0.31]
    ];
    SAGUAROS = [
      { d: "M-14 0V-160a14 14 0 0 1 28 0V0ZM-14-80h-30v-40a12 12 0 0 1 24 0v22h6ZM14-110h30v-40a12 12 0 0 0-24 0v22h-6Z" },
      { d: "M-17 0V-195a17 17 0 0 1 34 0V0ZM-17-105h-38v-56a14 14 0 0 1 28 0v34h10ZM17-75h36v-40a14 14 0 0 0-28 0v18h-8Z" },
      { d: "M-10 0V-92a10 10 0 0 1 20 0V0ZM10-52h20v-26a9 9 0 0 0-18 0v8h-2Z" }
    ];
    r1 = (n) => Math.round(n * 10) / 10;
    smooth = (a, b, x) => {
      const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
      return t * t * (3 - 2 * t);
    };
    GLASS = Object.freeze({ width: 1920, height: 1080, horizon: 856, floor: 944 });
    GLASS_STARRY = Object.freeze(["fri", "san", "fin"]);
    GLASS_BANDS = [[0, 300, "sky"], [300, 500, "sky2"], [500, 650, "sky3"], [650, 760, "sky4"], [760, GLASS.horizon, "glow"]];
    GLASS_DISC = Object.freeze({
      fri: { x: 1580, y: 770, r: 76, stripes: false },
      sam: { x: 430, y: GLASS.horizon, r: 220, stripes: true },
      sap: { x: 1500, y: 800, r: 104, stripes: false },
      san: { x: 1480, y: GLASS.horizon, r: 160, stripes: true },
      fin: { x: 960, y: GLASS.horizon, r: 0, stripes: false }
    });
    BUTTES = [
      {
        lit: [[40, 856], [150, 716], [176, 700], [430, 700], [452, 716], [520, 856]],
        shade: [[430, 700], [470, 700], [500, 716], [620, 856], [520, 856], [452, 716]]
      },
      {
        lit: [[1250, 856], [1360, 740], [1384, 728], [1640, 728], [1662, 740], [1760, 856]],
        shade: [[1640, 728], [1700, 728], [1726, 740], [1900, 856], [1760, 856], [1662, 740]]
      }
    ];
    GLASS_CACTI = [[300, 1.25, 1], [760, 0.8, 0], [1180, 0.95, 2], [1830, 1.35, 0]];
    poly = (points) => `M${points.map(([x, y]) => `${x} ${y}`).join("L")}Z`;
  }
});

// src/ui/glass-art.css
var init_glass_art = __esm({
  "src/ui/glass-art.css"() {
  }
});

// src/ui/GlassArt.jsx
import React21, { memo, useId as useId3, useSyncExternalStore as useSyncExternalStore2 } from "react";
function readPhase() {
  const phase = typeof document === "undefined" ? null : document.documentElement.getAttribute("data-phase");
  return isPhase(phase) ? phase : "fri";
}
function subscribe(onChange) {
  if (typeof MutationObserver === "undefined" || typeof document === "undefined") return () => {
  };
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-phase"] });
  return () => observer.disconnect();
}
function clearZone(clear) {
  if (!clear) return null;
  if (clear === true) return { from: 0, to: 1 };
  return { from: Math.max(0, Number(clear.from) || 0), to: Math.min(1, clear.to ?? 1) };
}
function GlassArtView({ phase = null, className = "", depth = false, clear = false }) {
  const rootPhase = useRootPhase();
  const session = isPhase(phase) ? phase : rootPhase;
  const clip = `fd-glass-clip-${useId3().replace(/:/g, "")}`;
  const span = SPAN, top = 0;
  const { width, horizon, floor: h } = SCENE;
  const left = Math.max(0, Math.min(width - span, CENTER[session] - span / 2));
  const tv2 = GLASS_DISC[session];
  const disc = tv2?.r > 0 ? { ...tv2, y: tv2.y - (LIFT[session] || 0) } : null;
  const stripes = disc?.r > 0 ? discStripes(disc) : [];
  const zone = clearZone(clear);
  const box2 = { viewBox: `${left} ${top} ${span} ${h}`, preserveAspectRatio: "xMidYMax slice", "aria-hidden": "true", focusable: "false" };
  const sky = /* @__PURE__ */ React21.createElement(React21.Fragment, null, SCENE.bands.map((band) => /* @__PURE__ */ React21.createElement("rect", { key: band.layer, className: `fd-glass-${band.layer}`, y: band.y, width, height: band.h })), /* @__PURE__ */ React21.createElement("g", { className: "fd-glass-stars" }, SCENE.stars.filter((star) => star.y > top - 6).map((star, i) => /* @__PURE__ */ React21.createElement("circle", { key: i, cx: star.x, cy: star.y, r: star.r * 2.2, opacity: star.dim ? 0.5 : 1 }))), disc?.r > 0 && /* @__PURE__ */ React21.createElement("g", { className: "fd-glass-disc", clipPath: `url(#${clip})` }, /* @__PURE__ */ React21.createElement("circle", { cx: disc.x, cy: disc.y, r: disc.r }), stripes.map((stripe) => /* @__PURE__ */ React21.createElement(
    "rect",
    {
      key: stripe.y,
      className: `fd-glass-${stripe.band}`,
      x: disc.x - disc.r - 2,
      y: stripe.y,
      width: disc.r * 2 + 4,
      height: stripe.h
    }
  ))));
  const range = /* @__PURE__ */ React21.createElement(React21.Fragment, null, /* @__PURE__ */ React21.createElement("path", { className: "fd-glass-far", d: SCENE.far }), /* @__PURE__ */ React21.createElement("path", { className: "fd-glass-mid", d: SCENE.hump }));
  const buttes = SCENE.buttes.map((butte, i) => /* @__PURE__ */ React21.createElement("g", { key: i }, /* @__PURE__ */ React21.createElement("path", { className: "fd-glass-mesa", d: butte.lit }), /* @__PURE__ */ React21.createElement("path", { className: "fd-glass-shade", d: butte.shade })));
  const below = depth ? 80 : 0;
  const floor2 = /* @__PURE__ */ React21.createElement(React21.Fragment, null, /* @__PURE__ */ React21.createElement("rect", { className: "fd-glass-ground", y: horizon, width, height: SCENE.floor - horizon + below }), /* @__PURE__ */ React21.createElement("rect", { className: "fd-glass-rim", y: horizon, width, height: 6 }), /* @__PURE__ */ React21.createElement("g", { className: "fd-glass-cactus" }, SCENE.cacti.filter((c) => standsClear(c, left, zone)).map((c, i) => /* @__PURE__ */ React21.createElement("path", { key: i, d: c.d, transform: `translate(${c.x} ${c.y}) scale(${c.scale})` }))));
  const clipDef = /* @__PURE__ */ React21.createElement("defs", null, /* @__PURE__ */ React21.createElement("clipPath", { id: clip }, /* @__PURE__ */ React21.createElement("rect", { y: top, width, height: horizon - top })));
  if (!depth) return /* @__PURE__ */ React21.createElement("svg", { className: `fd-glass-art${className ? ` ${className}` : ""}`, "data-phase": phase ? session : void 0, ...box2 }, clipDef, sky, range, buttes, floor2);
  return /* @__PURE__ */ React21.createElement(
    "span",
    {
      className: `fd-glass-art fd-glass-depth${className ? ` ${className}` : ""}`,
      "data-phase": phase ? session : void 0,
      "aria-hidden": "true"
    },
    /* @__PURE__ */ React21.createElement("svg", { "data-glass-depth": "0", ...box2 }, clipDef, sky),
    /* @__PURE__ */ React21.createElement("svg", { "data-glass-depth": "1", ...box2 }, /* @__PURE__ */ React21.createElement("rect", { className: "fd-glass-far", y: horizon, width, height: SCENE.floor - horizon + 80 }), range),
    /* @__PURE__ */ React21.createElement("svg", { "data-glass-depth": "2", ...box2 }, buttes),
    /* @__PURE__ */ React21.createElement("svg", { "data-glass-depth": "3", ...box2 }, floor2)
  );
}
var SCENE, CENTER, SPAN, LIFT, useRootPhase, SAGUARO_HALF, standsClear, GlassArt;
var init_GlassArt = __esm({
  "src/ui/GlassArt.jsx"() {
    init_desertModel();
    init_phase();
    init_glass_art();
    SCENE = backglassScene();
    CENTER = { fri: 1330, sam: 620, sap: 1290, san: 1290, fin: 960 };
    SPAN = 1100;
    LIFT = { fri: 50, sam: 40, sap: 50, san: 60 };
    useRootPhase = () => useSyncExternalStore2(subscribe, readPhase, () => "fri");
    SAGUARO_HALF = 56;
    standsClear = (cactus, left, zone) => {
      if (!zone) return true;
      const half = SAGUARO_HALF * cactus.scale;
      const a = (cactus.x - half - left) / SPAN, b = (cactus.x + half - left) / SPAN;
      return b < zone.from || a > zone.to;
    };
    GlassArt = memo(GlassArtView);
  }
});

// src/features/intro/IntroScenes.jsx
import React22 from "react";
function Plates({ far = null, mid = null, near = null }) {
  return /* @__PURE__ */ React22.createElement(React22.Fragment, null, far && /* @__PURE__ */ React22.createElement("g", { className: "fi-far" }, far), mid && /* @__PURE__ */ React22.createElement("g", { className: "fi-mid" }, mid), near && /* @__PURE__ */ React22.createElement("g", { className: "fi-near" }, near));
}
function Burst({ x, y, r = 70, flat = 1 }) {
  const rays = [0, 45, 90, 135, 180, 225, 270, 315];
  return /* @__PURE__ */ React22.createElement("g", { className: "fi-burst", transform: `translate(${x} ${y}) scale(1 ${flat})`, "aria-hidden": "true" }, /* @__PURE__ */ React22.createElement("circle", { r, fill: "none", stroke: BONE2, strokeWidth: "6", style: { ...box, ...run("fi-ring", 620, INTRO_TIMING.hit, "cubic-bezier(.1,.7,.3,1)") } }), /* @__PURE__ */ React22.createElement("circle", { r: r * 0.6, fill: "none", stroke: BONE2, strokeWidth: "4", style: { ...box, ...run("fi-ring", 520, INTRO_TIMING.hit + 110, "cubic-bezier(.1,.7,.3,1)") } }), rays.map((deg) => /* @__PURE__ */ React22.createElement("g", { key: deg, transform: `rotate(${deg})` }, /* @__PURE__ */ React22.createElement(
    "path",
    {
      d: `M${r * 0.55} 0H${r * 1.05}`,
      stroke: BONE2,
      strokeWidth: "6",
      strokeLinecap: "round",
      style: { ...box, transformOrigin: "left center", ...run("fi-ray", 460, INTRO_TIMING.hit, "cubic-bezier(.1,.7,.3,1)") }
    }
  ))));
}
function Spray({ x, y, color, n = 7, spread = 70, rise = 70, size = 6, at = INTRO_TIMING.hit }) {
  return /* @__PURE__ */ React22.createElement("g", { transform: `translate(${x} ${y})` }, Array.from({ length: n }, (_, i) => {
    const k = n > 1 ? i / (n - 1) : 0.5;
    const dx = Math.round((k - 0.5) * 2 * spread), dy = -Math.round(rise * (1 - Math.abs(k - 0.5) * 1.1));
    return /* @__PURE__ */ React22.createElement(
      "circle",
      {
        key: i,
        r: size * (i % 2 ? 0.8 : 1),
        fill: color,
        stroke: K,
        strokeWidth: "2",
        style: { "--dx": `${dx}px`, "--dy": `${dy}px`, ...run("fi-spray", 520 + i % 3 * 60, at, "cubic-bezier(.2,.7,.4,1)") }
      }
    );
  }));
}
function Cup({ x, y, w = 44, h = 50, body = "var(--art-rose)", rim = BONE2, inner = null, style }) {
  const r = w / 2, b = r * 0.78, ry = Math.max(4, w * 0.16);
  return /* @__PURE__ */ React22.createElement("g", { style }, /* @__PURE__ */ React22.createElement("path", { d: `M${x - r} ${y}L${x - b} ${y + h}Q${x} ${y + h + ry * 0.9} ${x + b} ${y + h}L${x + r} ${y}Z`, fill: body, stroke: K, strokeWidth: "4", strokeLinejoin: "round" }), /* @__PURE__ */ React22.createElement("path", { d: `M${x - r * 0.62} ${y + h * 0.2}L${x - b * 0.62} ${y + h * 0.88}`, stroke: BONE2, strokeOpacity: ".28", strokeWidth: Math.max(3, w * 0.08), strokeLinecap: "round" }), /* @__PURE__ */ React22.createElement("ellipse", { cx: x, cy: y, rx: r, ry, fill: inner || mix(body, 55, K), stroke: rim, strokeWidth: Math.max(3, w * 0.09) }));
}
function Flight({ x, y, children, xs, ys, body = null }) {
  return /* @__PURE__ */ React22.createElement("g", { style: xs }, /* @__PURE__ */ React22.createElement("g", { style: ys }, /* @__PURE__ */ React22.createElement("g", { transform: `translate(${x} ${y})` }, /* @__PURE__ */ React22.createElement("g", { style: { ...box, ...body } }, children))));
}
function Putting() {
  const green = mix("var(--art-sage)", 62, "var(--art-turquoise)");
  return /* @__PURE__ */ React22.createElement(
    Plates,
    {
      far: /* @__PURE__ */ React22.createElement(React22.Fragment, null, /* @__PURE__ */ React22.createElement("path", { d: "M880 470V244", stroke: K, strokeWidth: "12", strokeLinecap: "round" }), /* @__PURE__ */ React22.createElement("path", { d: "M880 470V244", stroke: BONE2, strokeWidth: "5", strokeLinecap: "round" }), /* @__PURE__ */ React22.createElement("g", { style: { ...box, transformOrigin: "right center", ...run("fi-flag", 700, INTRO_TIMING.hit, "ease-in-out", " 2 alternate") } }, /* @__PURE__ */ React22.createElement("path", { d: "M878 246L782 270L878 296Z", fill: "var(--art-rose)", stroke: K, strokeWidth: "4", strokeLinejoin: "round" }))),
      mid: /* @__PURE__ */ React22.createElement(React22.Fragment, null, /* @__PURE__ */ React22.createElement("path", { d: "M-300 600V560C40 520 520 482 800 462L1010 452C1052 466 1030 494 962 507C800 540 610 574 580 600Z", fill: mix(green, 70, K) }), /* @__PURE__ */ React22.createElement("path", { d: "M-300 600V570C40 532 540 490 806 470L1000 460C1030 470 1012 488 958 500C800 532 620 566 590 600Z", fill: green }), /* @__PURE__ */ React22.createElement("path", { d: "M220 590C420 530 640 494 900 470", fill: "none", stroke: BONE2, strokeOpacity: ".14", strokeWidth: "26", strokeLinecap: "round" }), /* @__PURE__ */ React22.createElement(
        "path",
        {
          d: "M372 562Q620 500 866 474",
          fill: "none",
          stroke: BONE2,
          strokeOpacity: ".4",
          strokeWidth: "4",
          strokeLinecap: "round",
          pathLength: "100",
          strokeDasharray: "100",
          style: run("fi-trail", 1050, INTRO_TIMING.play, "cubic-bezier(.2,.65,.3,1)")
        }
      ), /* @__PURE__ */ React22.createElement("ellipse", { cx: "880", cy: "472", rx: "22", ry: "7", fill: K, stroke: BONE2, strokeOpacity: ".5", strokeWidth: "2" }), /* @__PURE__ */ React22.createElement("g", { style: { ...box, ...run("fi-putt-roll", 1050, INTRO_TIMING.play, "cubic-bezier(.2,.65,.3,1)") } }, /* @__PURE__ */ React22.createElement("g", { style: { ...box, ...run("fi-putt-drop", 130, INTRO_TIMING.hit - 80, "cubic-bezier(.5,0,.8,.5)") } }, /* @__PURE__ */ React22.createElement("circle", { cx: "372", cy: "560", r: "15", fill: BONE2, stroke: K, strokeWidth: "4" }), /* @__PURE__ */ React22.createElement("circle", { cx: "367", cy: "555", r: "4", fill: "var(--ink0)", opacity: ".12" }))), /* @__PURE__ */ React22.createElement(Burst, { x: 880, y: 470, r: 62, flat: 0.45 })),
      near: /* @__PURE__ */ React22.createElement("g", { style: { transformOrigin: "190px -60px", ...run("fi-putter", 420, INTRO_TIMING.play - 300, "cubic-bezier(.45,0,.3,1)") } }, /* @__PURE__ */ React22.createElement("path", { d: "M190 -60L318 548", stroke: K, strokeWidth: "14", strokeLinecap: "round" }), /* @__PURE__ */ React22.createElement("path", { d: "M190 -60L318 548", stroke: "var(--silver)", strokeWidth: "6", strokeLinecap: "round" }), /* @__PURE__ */ React22.createElement("path", { d: "M298 546h52a7 7 0 0 1 0 16h-52z", fill: "var(--silver)", stroke: K, strokeWidth: "4", strokeLinejoin: "round" }), /* @__PURE__ */ React22.createElement("path", { d: "M190 -60l26 124", stroke: K, strokeWidth: "20", strokeLinecap: "round" }))
    }
  );
}
function Die() {
  const wood = mix("var(--art-umber)", 70, "var(--art-tangerine)");
  const beer = mix("var(--art-tangerine)", 40, "var(--art-cream)");
  const cup2 = (x, y, k) => /* @__PURE__ */ React22.createElement(Cup, { key: k, x, y, w: 46, h: 48, body: mix("var(--art-cream)", 30, "var(--art-turquoise)"), inner: beer });
  return /* @__PURE__ */ React22.createElement(
    Plates,
    {
      mid: /* @__PURE__ */ React22.createElement(React22.Fragment, null, /* @__PURE__ */ React22.createElement("path", { d: "M230 455H970L1030 520H170Z", fill: wood, stroke: K, strokeWidth: "5", strokeLinejoin: "round" }), /* @__PURE__ */ React22.createElement("path", { d: "M170 520H1030V548H170Z", fill: mix(wood, 55, K), stroke: K, strokeWidth: "5", strokeLinejoin: "round" }), /* @__PURE__ */ React22.createElement("path", { d: "M200 548v52M978 548v52", stroke: K, strokeWidth: "20" }), /* @__PURE__ */ React22.createElement("path", { d: "M600 457V518", stroke: BONE2, strokeOpacity: ".45", strokeWidth: "4", strokeDasharray: "10 8" }), /* @__PURE__ */ React22.createElement("path", { d: "M260 466H940", stroke: BONE2, strokeOpacity: ".12", strokeWidth: "6" }), cup2(270, 452, "a"), cup2(318, 470, "b"), cup2(880, 452, "c"), /* @__PURE__ */ React22.createElement("ellipse", { cx: "790", cy: "490", rx: "40", ry: "8", fill: "none", stroke: BONE2, strokeWidth: "4", style: { ...box, ...run("fi-ring", 420, 1380) } })),
      near: /* @__PURE__ */ React22.createElement(React22.Fragment, null, cup2(930, 470, "d"), /* @__PURE__ */ React22.createElement(
        Flight,
        {
          x: 230,
          y: 330,
          xs: run("fi-die-x", 1100, INTRO_TIMING.play, "linear"),
          ys: run("fi-die-y", 1100, INTRO_TIMING.play, "linear"),
          body: run("fi-die-spin", 1100, INTRO_TIMING.play, "linear")
        },
        /* @__PURE__ */ React22.createElement("g", { style: { ...box, ...run("fi-sink", 140, INTRO_TIMING.hit - 40, "cubic-bezier(.5,0,.8,.5)") } }, /* @__PURE__ */ React22.createElement("rect", { x: "-19", y: "-19", width: "38", height: "38", rx: "8", fill: BONE2, stroke: K, strokeWidth: "4" }), [[-8, -8], [8, -8], [0, 0], [-8, 8], [8, 8]].map(([cx, cy]) => /* @__PURE__ */ React22.createElement("circle", { key: `${cx}${cy}`, cx, cy, r: "3.6", fill: K })))
      ), /* @__PURE__ */ React22.createElement(Spray, { x: 930, y: 468, color: beer }), /* @__PURE__ */ React22.createElement(Burst, { x: 930, y: 470, r: 60, flat: 0.5 }))
    }
  );
}
function Where() {
  const paper = mix("var(--art-cream)", 82, K);
  return /* @__PURE__ */ React22.createElement(
    Plates,
    {
      mid: /* @__PURE__ */ React22.createElement(React22.Fragment, null, /* @__PURE__ */ React22.createElement("path", { d: "M250 442H950L1080 600H120Z", fill: paper, stroke: K, strokeWidth: "5", strokeLinejoin: "round" }), /* @__PURE__ */ React22.createElement("path", { d: "M610 470C710 456 830 472 870 502C910 542 826 584 706 572C626 562 566 520 610 470Z", fill: mix("var(--art-turquoise)", 80, "var(--art-cream)"), stroke: K, strokeWidth: "3" }), /* @__PURE__ */ React22.createElement("path", { d: "M170 596C380 524 520 522 700 472S930 450 1004 446", fill: "none", stroke: "var(--art-terracotta)", strokeWidth: "7", strokeLinecap: "round" }), /* @__PURE__ */ React22.createElement("path", { d: "M330 600C390 540 420 500 470 444M760 600C740 540 760 480 820 444", fill: "none", stroke: mix("var(--art-terracotta)", 60, paper), strokeWidth: "4" }), [476, 516, 560].map((y) => /* @__PURE__ */ React22.createElement("path", { key: y, d: `M${250 - (y - 442) * 0.82} ${y}H${950 + (y - 442) * 0.82}`, stroke: K, strokeOpacity: ".12", strokeWidth: "2" })), /* @__PURE__ */ React22.createElement("ellipse", { cx: "520", cy: "522", rx: "34", ry: "9", fill: K, opacity: ".35", style: { ...box, ...run("fi-shadow", 350, INTRO_TIMING.hit - 350, GRAVITY_DOWN) } }), [0, 160].map((d) => /* @__PURE__ */ React22.createElement(
        "ellipse",
        {
          key: d,
          cx: "520",
          cy: "522",
          rx: "70",
          ry: "18",
          fill: "none",
          stroke: "var(--art-rose)",
          strokeWidth: "5",
          style: { ...box, ...run("fi-ripple", 760, INTRO_TIMING.hit + d, "cubic-bezier(.1,.7,.3,1)") }
        }
      ))),
      near: /* @__PURE__ */ React22.createElement(React22.Fragment, null, /* @__PURE__ */ React22.createElement("g", { transform: "rotate(-8 360 300)" }, /* @__PURE__ */ React22.createElement("g", { style: { ...box, ...run("fi-photo", 420, INTRO_TIMING.play, "var(--ease-land)") } }, /* @__PURE__ */ React22.createElement("rect", { x: "288", y: "214", width: "144", height: "168", rx: "5", fill: BONE2, stroke: K, strokeWidth: "5" }), /* @__PURE__ */ React22.createElement("rect", { x: "300", y: "226", width: "120", height: "118", fill: mix("var(--art-cobalt)", 70, "var(--art-indigo)") }), /* @__PURE__ */ React22.createElement("circle", { cx: "388", cy: "262", r: "16", fill: "var(--art-cream)" }), /* @__PURE__ */ React22.createElement("path", { d: "M300 344L300 312L330 296L352 316L376 300L420 326V344Z", fill: "var(--art-terracotta)" }))), /* @__PURE__ */ React22.createElement("g", null, /* @__PURE__ */ React22.createElement("circle", { cx: "846", cy: "292", r: "74", fill: K }), /* @__PURE__ */ React22.createElement("circle", { cx: "846", cy: "292", r: "66", fill: BONE2 }), Array.from({ length: 12 }, (_, i) => /* @__PURE__ */ React22.createElement("path", { key: i, d: "M846 232v12", stroke: K, strokeWidth: i % 3 ? 3 : 6, transform: `rotate(${i * 30} 846 292)` })), /* @__PURE__ */ React22.createElement("g", { style: { transformOrigin: "846px 292px", ...run("fi-hour", 1100, INTRO_TIMING.play, "cubic-bezier(.2,.7,.3,1)") } }, /* @__PURE__ */ React22.createElement("path", { d: "M846 292V252", stroke: K, strokeWidth: "9", strokeLinecap: "round" })), /* @__PURE__ */ React22.createElement("g", { style: { transformOrigin: "846px 292px", ...run("fi-minute", 1100, INTRO_TIMING.play, "cubic-bezier(.2,.7,.3,1)") } }, /* @__PURE__ */ React22.createElement("path", { d: "M846 292V240", stroke: "var(--art-rose)", strokeWidth: "6", strokeLinecap: "round" })), /* @__PURE__ */ React22.createElement("circle", { cx: "846", cy: "292", r: "7", fill: K })), /* @__PURE__ */ React22.createElement("g", { style: run("fi-pin-drop", 350, INTRO_TIMING.hit - 350, GRAVITY_DOWN) }, /* @__PURE__ */ React22.createElement("g", { style: { transformBox: "fill-box", transformOrigin: "50% 100%", ...run("fi-squash", 360, INTRO_TIMING.hit, "var(--ease-land)") } }, /* @__PURE__ */ React22.createElement("path", { d: "M520 520C510 494 486 480 486 456A34 34 0 1 1 554 456C554 480 530 494 520 520Z", fill: "var(--art-rose)", stroke: K, strokeWidth: "5", strokeLinejoin: "round" }), /* @__PURE__ */ React22.createElement("circle", { cx: "520", cy: "455", r: "12", fill: BONE2, stroke: K, strokeWidth: "3" }))))
    }
  );
}
function Ball({ r, fill = "var(--art-tangerine)", seams = true }) {
  return /* @__PURE__ */ React22.createElement(React22.Fragment, null, /* @__PURE__ */ React22.createElement("circle", { r, fill, stroke: K, strokeWidth: Math.max(3, r * 0.12) }), seams && /* @__PURE__ */ React22.createElement(
    "path",
    {
      d: `M${-r} 0H${r}M0 ${-r}V${r}M${-r * 0.62} ${-r * 0.78}C${-r * 0.1} ${-r * 0.3} ${-r * 0.1} ${r * 0.3} ${-r * 0.62} ${r * 0.78}M${r * 0.62} ${-r * 0.78}C${r * 0.1} ${-r * 0.3} ${r * 0.1} ${r * 0.3} ${r * 0.62} ${r * 0.78}`,
      fill: "none",
      stroke: K,
      strokeWidth: Math.max(2, r * 0.07)
    }
  ), /* @__PURE__ */ React22.createElement("path", { d: `M${-r * 0.55} ${-r * 0.35}A${r * 0.7} ${r * 0.7} 0 0 1 ${-r * 0.1} ${-r * 0.68}`, fill: "none", stroke: BONE2, strokeOpacity: ".45", strokeWidth: Math.max(2, r * 0.12), strokeLinecap: "round" }));
}
function Net({ x, y, w = 56, h = 46 }) {
  const top = x - w / 2, b = w * 0.32;
  return /* @__PURE__ */ React22.createElement(
    "path",
    {
      d: `M${top} ${y}L${x - b} ${y + h}M${top + w} ${y}L${x + b} ${y + h}M${top + w * 0.25} ${y}L${x - b * 0.4} ${y + h}M${top + w * 0.75} ${y}L${x + b * 0.4} ${y + h}M${top + 4} ${y + h * 0.35}H${top + w - 4}M${x - b - 2} ${y + h * 0.7}H${x + b + 2}`,
      fill: "none",
      stroke: BONE2,
      strokeOpacity: ".8",
      strokeWidth: "3",
      strokeLinecap: "round"
    }
  );
}
function FullCourt() {
  return /* @__PURE__ */ React22.createElement(
    Plates,
    {
      far: /* @__PURE__ */ React22.createElement(React22.Fragment, null, /* @__PURE__ */ React22.createElement("path", { d: "M600 456V316", stroke: K, strokeWidth: "14" }), /* @__PURE__ */ React22.createElement("rect", { x: "548", y: "300", width: "104", height: "70", rx: "4", fill: BONE2, stroke: K, strokeWidth: "5" }), /* @__PURE__ */ React22.createElement("rect", { x: "582", y: "334", width: "36", height: "28", fill: "none", stroke: "var(--art-rose)", strokeWidth: "4" }), /* @__PURE__ */ React22.createElement("g", { style: { transformBox: "fill-box", transformOrigin: "50% 0", ...run("fi-net", 420, INTRO_TIMING.hit, "var(--ease-land)") } }, /* @__PURE__ */ React22.createElement(Net, { x: 600, y: 390, w: 54, h: 40 })), /* @__PURE__ */ React22.createElement("ellipse", { cx: "600", cy: "390", rx: "28", ry: "7", fill: "none", stroke: "var(--art-tangerine)", strokeWidth: "6" })),
      mid: /* @__PURE__ */ React22.createElement(React22.Fragment, null, /* @__PURE__ */ React22.createElement("path", { d: "M360 455H840L1110 600H90Z", fill: WOOD_COURT, stroke: K, strokeWidth: "5", strokeLinejoin: "round" }), /* @__PURE__ */ React22.createElement("path", { d: "M528 455H672L690 482H510Z", fill: mix("var(--art-rose)", 60, WOOD_COURT) }), /* @__PURE__ */ React22.createElement("path", { d: "M266 506H934M466 455Q600 500 734 455", fill: "none", stroke: BONE2, strokeOpacity: ".55", strokeWidth: "4" }), /* @__PURE__ */ React22.createElement("ellipse", { cx: "600", cy: "506", rx: "74", ry: "14", fill: "none", stroke: BONE2, strokeOpacity: ".55", strokeWidth: "4" }), /* @__PURE__ */ React22.createElement("path", { d: "M210 600Q600 520 990 600", fill: "none", stroke: BONE2, strokeOpacity: ".55", strokeWidth: "5" }), /* @__PURE__ */ React22.createElement("path", { d: "M470 600L500 560H700L730 600", fill: mix("var(--art-rose)", 60, WOOD_COURT), stroke: BONE2, strokeOpacity: ".55", strokeWidth: "4" })),
      near: /* @__PURE__ */ React22.createElement(React22.Fragment, null, /* @__PURE__ */ React22.createElement("path", { d: "M-70 795V270H-14V795Z", fill: K }), /* @__PURE__ */ React22.createElement("path", { d: "M-150 100H80V290H-150Z", fill: K, stroke: BONE2, strokeOpacity: ".3", strokeWidth: "5" }), /* @__PURE__ */ React22.createElement("path", { d: "M-40 190H40V270H-40Z", fill: "none", stroke: BONE2, strokeOpacity: ".22", strokeWidth: "5" }), /* @__PURE__ */ React22.createElement("ellipse", { cx: "20", cy: "300", rx: "62", ry: "15", fill: "none", stroke: mix("var(--art-tangerine)", 55, K), strokeWidth: "9" }), /* @__PURE__ */ React22.createElement(
        Flight,
        {
          x: 300,
          y: 510,
          xs: run("fi-heave-x", 1100, INTRO_TIMING.play, "linear"),
          ys: run("fi-heave-y", 1100, INTRO_TIMING.play, "linear"),
          body: run("fi-heave-spin", 1100, INTRO_TIMING.play, "linear")
        },
        /* @__PURE__ */ React22.createElement("g", { style: { ...box, ...run("fi-swish", 220, INTRO_TIMING.hit, "cubic-bezier(.5,0,.8,.5)") } }, /* @__PURE__ */ React22.createElement(Ball, { r: 36 }))
      ), /* @__PURE__ */ React22.createElement(Burst, { x: 600, y: 398, r: 58 }))
    }
  );
}
function Pickleball() {
  const court = mix("var(--art-cobalt)", 70, "var(--art-teal)");
  return /* @__PURE__ */ React22.createElement(
    Plates,
    {
      mid: /* @__PURE__ */ React22.createElement(React22.Fragment, null, /* @__PURE__ */ React22.createElement("path", { d: "M300 455H900L1080 600H120Z", fill: court, stroke: K, strokeWidth: "5", strokeLinejoin: "round" }), /* @__PURE__ */ React22.createElement("path", { d: "M268 480H932L999 535H201Z", fill: mix("var(--art-turquoise)", 70, court) }), /* @__PURE__ */ React22.createElement("path", { d: "M268 480H932M201 535H999M600 535L600 600M600 455V480", fill: "none", stroke: BONE2, strokeWidth: "4", strokeOpacity: ".8" }), /* @__PURE__ */ React22.createElement("path", { d: "M238 505V448M962 505V448", stroke: K, strokeWidth: "10", strokeLinecap: "round" }), /* @__PURE__ */ React22.createElement("path", { d: "M238 460H962V503H238Z", fill: K, fillOpacity: ".5" }), /* @__PURE__ */ React22.createElement("path", { d: Array.from({ length: 24 }, (_, i) => `M${250 + i * 30} 462V503`).join(""), stroke: BONE2, strokeOpacity: ".22", strokeWidth: "2" }), /* @__PURE__ */ React22.createElement("path", { d: "M238 460H962", stroke: BONE2, strokeWidth: "6" }), /* @__PURE__ */ React22.createElement("ellipse", { cx: "560", cy: "478", rx: "16", ry: "4", fill: K, opacity: ".4" }), /* @__PURE__ */ React22.createElement(Burst, { x: 560, y: 474, r: 48, flat: 0.5 })),
      near: /* @__PURE__ */ React22.createElement(React22.Fragment, null, /* @__PURE__ */ React22.createElement("g", { style: { transformOrigin: "930px 800px", ...run("fi-paddle", 360, INTRO_TIMING.play + 80, "cubic-bezier(.4,0,.2,1)") } }, /* @__PURE__ */ React22.createElement("path", { d: "M896 560L926 820", stroke: K, strokeWidth: "40", strokeLinecap: "round" }), /* @__PURE__ */ React22.createElement("path", { d: "M896 560L926 820", stroke: mix(K, 70, BONE2), strokeWidth: "26", strokeLinecap: "round", strokeDasharray: "6 16" }), /* @__PURE__ */ React22.createElement("rect", { x: "822", y: "384", width: "148", height: "186", rx: "50", fill: "var(--art-rose)", stroke: K, strokeWidth: "7" }), /* @__PURE__ */ React22.createElement("path", { d: "M852 414C880 400 920 400 942 414", stroke: BONE2, strokeOpacity: ".4", strokeWidth: "7", fill: "none", strokeLinecap: "round" })), /* @__PURE__ */ React22.createElement(
        Flight,
        {
          x: 840,
          y: 440,
          xs: run("fi-dink-x", 1400, INTRO_TIMING.play + 200, "linear"),
          ys: run("fi-dink-y", 1400, INTRO_TIMING.play + 200, "linear"),
          body: run("fi-dink-size", 1400, INTRO_TIMING.play + 200, "linear")
        },
        /* @__PURE__ */ React22.createElement("circle", { r: "17", fill: "var(--art-cream)", stroke: K, strokeWidth: "4" }),
        /* @__PURE__ */ React22.createElement("g", { fill: K, opacity: ".55" }, /* @__PURE__ */ React22.createElement("circle", { cx: "-6", cy: "-4", r: "2.6" }), /* @__PURE__ */ React22.createElement("circle", { cx: "6", cy: "-4", r: "2.6" }), /* @__PURE__ */ React22.createElement("circle", { cx: "0", cy: "6", r: "2.6" }))
      ))
    }
  );
}
function OneOnOne() {
  return /* @__PURE__ */ React22.createElement(
    Plates,
    {
      far: /* @__PURE__ */ React22.createElement(React22.Fragment, null, /* @__PURE__ */ React22.createElement("path", { d: "M960 600V214H900", fill: "none", stroke: K, strokeWidth: "18", strokeLinejoin: "round" }), /* @__PURE__ */ React22.createElement("path", { d: "M960 600V214H900", fill: "none", stroke: mix("var(--art-cobalt)", 70, BONE2), strokeWidth: "8", strokeLinejoin: "round" }), /* @__PURE__ */ React22.createElement("rect", { x: "886", y: "196", width: "14", height: "128", fill: BONE2, stroke: K, strokeWidth: "4" })),
      mid: /* @__PURE__ */ React22.createElement(React22.Fragment, null, /* @__PURE__ */ React22.createElement("path", { d: "M-300 470H1500V795H-300Z", fill: WOOD_COURT }), /* @__PURE__ */ React22.createElement("path", { d: "M-300 470H1500", stroke: K, strokeWidth: "5" }), /* @__PURE__ */ React22.createElement("path", { d: "M640 470H1500V500H640Z", fill: mix("var(--art-rose)", 55, WOOD_COURT) }), /* @__PURE__ */ React22.createElement("path", { d: "M-300 520H1500", stroke: BONE2, strokeOpacity: ".1", strokeWidth: "20" }), /* @__PURE__ */ React22.createElement("g", { style: { transformBox: "fill-box", transformOrigin: "50% 0", ...run("fi-net", 420, INTRO_TIMING.hit, "var(--ease-land)") } }, /* @__PURE__ */ React22.createElement(Net, { x: 852, y: 294, w: 66, h: 52 })), /* @__PURE__ */ React22.createElement("path", { d: "M818 292H888", stroke: "var(--art-tangerine)", strokeWidth: "8", strokeLinecap: "round" }), /* @__PURE__ */ React22.createElement("ellipse", { cx: "852", cy: "292", rx: "35", ry: "8", fill: "none", stroke: K, strokeWidth: "3" })),
      near: /* @__PURE__ */ React22.createElement(React22.Fragment, null, /* @__PURE__ */ React22.createElement(
        Flight,
        {
          x: 0,
          y: 0,
          xs: run("fi-one-x", 2100, 300, "linear"),
          ys: run("fi-one-y", 2100, 300, "linear"),
          body: run("fi-one-spin", 2100, 300, "linear")
        },
        /* @__PURE__ */ React22.createElement(Ball, { r: 30 })
      ), /* @__PURE__ */ React22.createElement("path", { d: "M818 292H852", stroke: "var(--art-tangerine)", strokeWidth: "8", strokeLinecap: "round" }), /* @__PURE__ */ React22.createElement(Burst, { x: 852, y: 300, r: 56 }))
    }
  );
}
function Volleyball() {
  const sand = mix("var(--art-cream)", 66, "var(--art-tangerine)");
  return /* @__PURE__ */ React22.createElement(
    Plates,
    {
      mid: /* @__PURE__ */ React22.createElement(React22.Fragment, null, /* @__PURE__ */ React22.createElement("path", { d: "M260 455H940L1120 600H80Z", fill: sand, stroke: K, strokeWidth: "5", strokeLinejoin: "round" }), [[300, 560], [420, 520], [700, 585], [860, 540], [990, 590], [560, 470], [780, 478]].map(([x, y]) => /* @__PURE__ */ React22.createElement("circle", { key: x, cx: x, cy: y, r: "4", fill: K, opacity: ".14" })), /* @__PURE__ */ React22.createElement("path", { d: "M198 505V330M1002 505V330", stroke: K, strokeWidth: "14", strokeLinecap: "round" }), /* @__PURE__ */ React22.createElement("path", { d: "M198 505V330M1002 505V330", stroke: BONE2, strokeWidth: "5", strokeLinecap: "round" }), /* @__PURE__ */ React22.createElement("path", { d: "M198 340H1002V398H198Z", fill: K, fillOpacity: ".45" }), /* @__PURE__ */ React22.createElement("path", { d: `${Array.from({ length: 27 }, (_, i) => `M${212 + i * 29.5} 340V398`).join("")}M198 360H1002M198 379H1002`, stroke: BONE2, strokeOpacity: ".25", strokeWidth: "2" }), /* @__PURE__ */ React22.createElement("path", { d: "M198 340H1002", stroke: BONE2, strokeWidth: "8" }), /* @__PURE__ */ React22.createElement("ellipse", { cx: "790", cy: "494", rx: "26", ry: "6", fill: K, opacity: ".35" }), /* @__PURE__ */ React22.createElement(Spray, { x: 790, y: 490, color: sand, n: 9, spread: 90, rise: 60, size: 7 }), /* @__PURE__ */ React22.createElement(Burst, { x: 790, y: 488, r: 64, flat: 0.45 })),
      near: /* @__PURE__ */ React22.createElement(React22.Fragment, null, /* @__PURE__ */ React22.createElement(
        Flight,
        {
          x: 0,
          y: 0,
          xs: run("fi-vb-x", 1450, INTRO_TIMING.play, "linear"),
          ys: run("fi-vb-y", 1450, INTRO_TIMING.play, "linear"),
          body: run("fi-vb-size", 1450, INTRO_TIMING.play, "linear")
        },
        /* @__PURE__ */ React22.createElement("circle", { r: "30", fill: BONE2, stroke: K, strokeWidth: "4" }),
        /* @__PURE__ */ React22.createElement("path", { d: "M-26-14C-10-20 10-16 24 0M-28 10C-8 2 14 6 26 18M-6-29C4-14 6 8 0 29", fill: "none", stroke: "var(--art-cobalt)", strokeWidth: "4" })
      ), /* @__PURE__ */ React22.createElement("g", { transform: "translate(500 140)" }, /* @__PURE__ */ React22.createElement("circle", { r: "44", fill: "none", stroke: BONE2, strokeWidth: "5", style: { ...box, ...run("fi-ring", 380, 1300) } })))
    }
  );
}
function Trivia() {
  const desk = mix("var(--art-violet)", 70, "var(--art-plum)");
  const lit = "var(--art-cream)", dark = mix("var(--art-cream)", 18, K);
  const desks = [345, 515, 685, 855];
  const blink = (i, k) => run("fi-blink", 180, 900 + (k * 4 + i) * 110, "steps(1, end)");
  return /* @__PURE__ */ React22.createElement(
    Plates,
    {
      mid: /* @__PURE__ */ React22.createElement(React22.Fragment, null, /* @__PURE__ */ React22.createElement("g", { style: { ...box, ...run("fi-card-back", 150, 900, "cubic-bezier(.5,0,.8,.5)") } }, /* @__PURE__ */ React22.createElement("rect", { x: "474", y: "196", width: "252", height: "166", rx: "14", fill: mix("var(--art-cobalt)", 80, K), stroke: K, strokeWidth: "6" }), /* @__PURE__ */ React22.createElement("rect", { x: "490", y: "212", width: "220", height: "134", rx: "8", fill: "none", stroke: BONE2, strokeOpacity: ".4", strokeWidth: "3", strokeDasharray: "8 8" })), /* @__PURE__ */ React22.createElement("g", { style: { ...box, ...run("fi-card-front", 200, 1050, "var(--ease-land)") } }, /* @__PURE__ */ React22.createElement("rect", { x: "474", y: "196", width: "252", height: "166", rx: "14", fill: BONE2, stroke: K, strokeWidth: "6" }), /* @__PURE__ */ React22.createElement("path", { d: "M570 252C570 222 630 222 630 252C630 276 600 278 600 302", fill: "none", stroke: K, strokeWidth: "18", strokeLinecap: "round" }), /* @__PURE__ */ React22.createElement("circle", { cx: "600", cy: "334", r: "10", fill: K }))),
      near: /* @__PURE__ */ React22.createElement(React22.Fragment, null, desks.map((x, i) => /* @__PURE__ */ React22.createElement("g", { key: x }, /* @__PURE__ */ React22.createElement("g", { style: i === 2 ? { ...box, ...run("fi-buzz", 220, INTRO_TIMING.hit - 60, "var(--ease-land)") } : void 0 }, /* @__PURE__ */ React22.createElement("ellipse", { cx: x, cy: "420", rx: "32", ry: "14", fill: i === 2 ? "var(--art-rose)" : mix("var(--art-rose)", 40, K), stroke: K, strokeWidth: "4" }), /* @__PURE__ */ React22.createElement("ellipse", { cx: x, cy: "414", rx: "22", ry: "8", fill: BONE2, opacity: ".18" })), /* @__PURE__ */ React22.createElement("path", { d: `M${x - 76} 428H${x + 76}V444H${x - 76}Z`, fill: BONE2, stroke: K, strokeWidth: "4" }), /* @__PURE__ */ React22.createElement("path", { d: `M${x - 66} 444H${x + 66}L${x + 58} 590H${x - 58}Z`, fill: desk, stroke: K, strokeWidth: "5", strokeLinejoin: "round" }), [-34, 0, 34].map((dx) => /* @__PURE__ */ React22.createElement("g", { key: dx }, /* @__PURE__ */ React22.createElement("circle", { cx: x + dx, cy: "486", r: "11", fill: dark, stroke: K, strokeWidth: "3" }), [0, 1].map((k) => /* @__PURE__ */ React22.createElement("circle", { key: k, cx: x + dx, cy: "486", r: "11", fill: lit, style: blink(i, k), opacity: "0" })), i === 2 && /* @__PURE__ */ React22.createElement("circle", { cx: x + dx, cy: "486", r: "11", fill: lit, style: run("fi-on", 120, INTRO_TIMING.hit, "steps(1, end)") }))))), /* @__PURE__ */ React22.createElement(Burst, { x: 685, y: 418, r: 60, flat: 0.6 }))
    }
  );
}
function EightBall() {
  const felt = mix("var(--art-sage)", 78, "var(--art-teal)");
  return /* @__PURE__ */ React22.createElement(
    Plates,
    {
      mid: /* @__PURE__ */ React22.createElement(React22.Fragment, null, /* @__PURE__ */ React22.createElement("path", { d: "M250 410H950L1090 600H110Z", fill: mix("var(--art-umber)", 85, K), stroke: K, strokeWidth: "5", strokeLinejoin: "round" }), /* @__PURE__ */ React22.createElement("path", { d: "M286 424H914L1036 590H164Z", fill: felt }), /* @__PURE__ */ React22.createElement("path", { d: "M300 432H900", stroke: BONE2, strokeOpacity: ".1", strokeWidth: "10" }), [[290, 428, 14], [910, 428, 14], [600, 422, 11], [170, 586, 20], [1030, 586, 20]].map(([x, y, r]) => /* @__PURE__ */ React22.createElement("circle", { key: x + y, cx: x, cy: y, r, fill: K })), RACK.map(([x, y], i) => i === 4 ? null : /* @__PURE__ */ React22.createElement("g", { key: i, style: {
        "--dx": `${SCATTER[i][0]}px`,
        "--dy": `${SCATTER[i][1]}px`,
        ...run("fi-scatter", 620, 1250, "cubic-bezier(.15,.7,.3,1)")
      } }, /* @__PURE__ */ React22.createElement("circle", { cx: x, cy: y, r: "13", fill: RACK_INK[i], stroke: K, strokeWidth: "3" }), /* @__PURE__ */ React22.createElement("circle", { cx: x - 4, cy: y - 4, r: "3", fill: BONE2, opacity: ".45" }))), /* @__PURE__ */ React22.createElement("g", { style: run("fi-eight", 550, 1250, "cubic-bezier(.2,.6,.45,1)") }, /* @__PURE__ */ React22.createElement("g", { style: { ...box, ...run("fi-sink", 110, INTRO_TIMING.hit - 30, "cubic-bezier(.5,0,.8,.5)") } }, /* @__PURE__ */ React22.createElement("circle", { cx: "600", cy: "466", r: "13", fill: K, stroke: BONE2, strokeOpacity: ".5", strokeWidth: "2" }), /* @__PURE__ */ React22.createElement("circle", { cx: "600", cy: "466", r: "6", fill: BONE2 }), /* @__PURE__ */ React22.createElement("path", { d: "M600 463.4a1.6 1.6 0 1 0 .01 0M600 466.6a2 2 0 1 0 .01 0", fill: "none", stroke: K, strokeWidth: "1.4" }))), /* @__PURE__ */ React22.createElement("g", { style: run("fi-cueball", 700, 1050, "cubic-bezier(.2,.8,.4,1)") }, /* @__PURE__ */ React22.createElement("circle", { cx: "600", cy: "560", r: "17", fill: BONE2, stroke: K, strokeWidth: "4" })), /* @__PURE__ */ React22.createElement(Burst, { x: 910, y: 428, r: 50, flat: 0.55 })),
      near: /* @__PURE__ */ React22.createElement("g", { style: run("fi-cue", 400, INTRO_TIMING.play, "cubic-bezier(.6,0,.2,1)") }, /* @__PURE__ */ React22.createElement("path", { d: "M606 584L712 900", stroke: K, strokeWidth: "22", strokeLinecap: "round" }), /* @__PURE__ */ React22.createElement("path", { d: "M606 584L712 900", stroke: mix("var(--art-cream)", 70, "var(--art-umber)"), strokeWidth: "12", strokeLinecap: "round" }), /* @__PURE__ */ React22.createElement("path", { d: "M606 584L612 602", stroke: BONE2, strokeWidth: "12", strokeLinecap: "round" }), /* @__PURE__ */ React22.createElement("path", { d: "M660 744L712 900", stroke: mix("var(--art-umber)", 80, K), strokeWidth: "14" }))
    }
  );
}
function Pong() {
  const table = mix("var(--art-indigo)", 60, "var(--art-cobalt)");
  const cups = [[560, 438], [600, 438], [640, 438], [580, 450], [620, 450], [600, 462]];
  return /* @__PURE__ */ React22.createElement(
    Plates,
    {
      mid: /* @__PURE__ */ React22.createElement(React22.Fragment, null, /* @__PURE__ */ React22.createElement("path", { d: "M470 440H730L1000 600H200Z", fill: table, stroke: K, strokeWidth: "5", strokeLinejoin: "round" }), /* @__PURE__ */ React22.createElement("path", { d: "M486 446L232 596M714 446L968 596", stroke: BONE2, strokeWidth: "5", strokeOpacity: ".75" }), /* @__PURE__ */ React22.createElement("path", { d: "M600 446V596", stroke: BONE2, strokeWidth: "3", strokeOpacity: ".35" }), cups.map(([x, y], i) => /* @__PURE__ */ React22.createElement(
        Cup,
        {
          key: i,
          x,
          y: y - 22,
          w: 36,
          h: 24,
          style: i === 4 ? { ...box, transformOrigin: "50% 100%", ...run("fi-wobble", 520, INTRO_TIMING.hit, "ease-out") } : void 0
        }
      )), /* @__PURE__ */ React22.createElement(Spray, { x: 620, y: 428, color: mix("var(--art-tangerine)", 40, "var(--art-cream)"), n: 6, spread: 40, rise: 50, size: 5 }), /* @__PURE__ */ React22.createElement(Burst, { x: 620, y: 430, r: 48, flat: 0.5 })),
      near: /* @__PURE__ */ React22.createElement(React22.Fragment, null, /* @__PURE__ */ React22.createElement(Cup, { x: 190, y: 500, w: 96, h: 110 }), /* @__PURE__ */ React22.createElement(Cup, { x: 1010, y: 500, w: 96, h: 110 }), /* @__PURE__ */ React22.createElement(
        Flight,
        {
          x: 440,
          y: 470,
          xs: run("fi-pong-x", 1100, INTRO_TIMING.play, "linear"),
          ys: run("fi-pong-y", 1100, INTRO_TIMING.play, "linear"),
          body: run("fi-pong-size", 1100, INTRO_TIMING.play, "linear")
        },
        /* @__PURE__ */ React22.createElement("g", { style: { ...box, ...run("fi-sink", 120, INTRO_TIMING.hit - 40, "cubic-bezier(.5,0,.8,.5)") } }, /* @__PURE__ */ React22.createElement("circle", { r: "19", fill: BONE2, stroke: K, strokeWidth: "4" }), /* @__PURE__ */ React22.createElement("circle", { cx: "-6", cy: "-6", r: "5", fill: K, opacity: ".1" }))
      ))
    }
  );
}
function RageCage() {
  const wood = mix("var(--art-umber)", 70, "var(--art-terracotta)");
  const cage = [[520, 470], [560, 462], [600, 458], [640, 462], [680, 470], [560, 484], [600, 488], [640, 484]];
  return /* @__PURE__ */ React22.createElement(
    Plates,
    {
      mid: /* @__PURE__ */ React22.createElement(React22.Fragment, null, /* @__PURE__ */ React22.createElement("ellipse", { cx: "600", cy: "520", rx: "440", ry: "92", fill: mix(wood, 60, K) }), /* @__PURE__ */ React22.createElement("ellipse", { cx: "600", cy: "506", rx: "440", ry: "86", fill: wood, stroke: K, strokeWidth: "5" }), /* @__PURE__ */ React22.createElement("ellipse", { cx: "600", cy: "500", rx: "380", ry: "64", fill: "none", stroke: BONE2, strokeOpacity: ".1", strokeWidth: "10" }), cage.map(([x, y], i) => /* @__PURE__ */ React22.createElement(Cup, { key: i, x, y: y - 20, w: 34, h: 26, body: mix("var(--art-rose)", 70, K) })), /* @__PURE__ */ React22.createElement("ellipse", { cx: "400", cy: "556", rx: "34", ry: "8", fill: "none", stroke: BONE2, strokeWidth: "4", style: { ...box, ...run("fi-ring", 380, 1150) } })),
      near: /* @__PURE__ */ React22.createElement(React22.Fragment, null, /* @__PURE__ */ React22.createElement(Cup, { x: 720, y: 512, w: 60, h: 56 }), /* @__PURE__ */ React22.createElement("g", { style: run("fi-stack", 350, 1450, "cubic-bezier(.45,0,.3,1)") }, /* @__PURE__ */ React22.createElement(Cup, { x: 480, y: 512, w: 60, h: 56 })), /* @__PURE__ */ React22.createElement(Flight, { x: 0, y: 0, xs: run("fi-rc-x", 650, INTRO_TIMING.play, "linear"), ys: run("fi-rc-y", 650, INTRO_TIMING.play, "linear") }, /* @__PURE__ */ React22.createElement("g", { style: { ...box, ...run("fi-sink", 90, 1350, "cubic-bezier(.5,0,.8,.5)") } }, /* @__PURE__ */ React22.createElement("circle", { r: "13", fill: BONE2, stroke: K, strokeWidth: "4" }))), /* @__PURE__ */ React22.createElement(Flight, { x: 0, y: 0, xs: run("fi-rc2-x", 900, INTRO_TIMING.play - 200, "linear"), ys: run("fi-rc2-y", 900, INTRO_TIMING.play - 200, "linear") }, /* @__PURE__ */ React22.createElement("circle", { r: "13", fill: BONE2, stroke: K, strokeWidth: "4" })), /* @__PURE__ */ React22.createElement(Burst, { x: 720, y: 500, r: 62, flat: 0.6 }))
    }
  );
}
function Kart() {
  const road = mix(K, 74, "var(--art-indigo)");
  const checker = [];
  for (let c = 0; c < 10; c++) for (let r = 0; r < 2; r++)
    if ((c + r) % 2 === 0) checker.push(/* @__PURE__ */ React22.createElement("rect", { key: `${c}${r}`, x: 392 + c * 38, y: 528 + r * 10, width: "38", height: "10", fill: BONE2 }));
  return /* @__PURE__ */ React22.createElement(
    Plates,
    {
      mid: /* @__PURE__ */ React22.createElement(React22.Fragment, null, /* @__PURE__ */ React22.createElement("path", { d: "M232 455H312C480 470 700 540 1110 600L1560 690V800H470C446 700 426 630 408 600C376 520 320 474 232 455Z", fill: road, stroke: K, strokeWidth: "5", strokeLinejoin: "round" }), /* @__PURE__ */ React22.createElement("path", { d: "M312 455C480 470 700 540 1110 600L1560 690", fill: "none", stroke: "var(--art-rose)", strokeWidth: "12", strokeDasharray: "28 28" }), /* @__PURE__ */ React22.createElement("path", { d: "M312 455C480 470 700 540 1110 600L1560 690", fill: "none", stroke: BONE2, strokeWidth: "12", strokeDasharray: "28 28", strokeDashoffset: "28" }), /* @__PURE__ */ React22.createElement("path", { d: "M272 456C400 478 520 540 760 600L1000 800", fill: "none", stroke: BONE2, strokeOpacity: ".5", strokeWidth: "5", strokeDasharray: "22 26" }), /* @__PURE__ */ React22.createElement("path", { d: "M392 528H772V548H392Z", fill: K }), checker, /* @__PURE__ */ React22.createElement("path", { d: "M392 528H772V548H392Z", fill: BONE2, style: run("fi-flash", 420, INTRO_TIMING.hit, "ease-out"), opacity: "0" }), /* @__PURE__ */ React22.createElement(
        "path",
        {
          d: "M430 504C470 520 520 534 566 544",
          fill: "none",
          stroke: K,
          strokeOpacity: ".7",
          strokeWidth: "7",
          pathLength: "100",
          strokeDasharray: "100",
          style: run("fi-trail", 420, 1300, "linear")
        }
      )),
      near: /* @__PURE__ */ React22.createElement(React22.Fragment, null, /* @__PURE__ */ React22.createElement("g", { style: run("fi-kart-path", 1700, INTRO_TIMING.play - 200, "linear") }, /* @__PURE__ */ React22.createElement("g", { style: { ...box, ...run("fi-kart-body", 1700, INTRO_TIMING.play - 200, "linear") } }, /* @__PURE__ */ React22.createElement("g", { transform: "translate(-70 -52)" }, /* @__PURE__ */ React22.createElement("ellipse", { cx: "70", cy: "96", rx: "66", ry: "10", fill: K, opacity: ".35" }), /* @__PURE__ */ React22.createElement("path", { d: "M8 66L22 40H112L136 62L128 80H14Z", fill: "var(--art-rose)", stroke: K, strokeWidth: "5", strokeLinejoin: "round" }), /* @__PURE__ */ React22.createElement("path", { d: "M34 42L52 20H86L98 42Z", fill: mix("var(--art-rose)", 60, K), stroke: K, strokeWidth: "4", strokeLinejoin: "round" }), /* @__PURE__ */ React22.createElement("circle", { cx: "70", cy: "18", r: "16", fill: BONE2, stroke: K, strokeWidth: "4" }), /* @__PURE__ */ React22.createElement("path", { d: "M58 14H84", stroke: "var(--art-cobalt)", strokeWidth: "6", strokeLinecap: "round" }), /* @__PURE__ */ React22.createElement("rect", { x: "108", y: "28", width: "16", height: "26", rx: "3", fill: "var(--art-cream)", stroke: K, strokeWidth: "3" }), /* @__PURE__ */ React22.createElement("path", { d: "M108 34H124", stroke: "var(--art-cobalt)", strokeWidth: "4" }), /* @__PURE__ */ React22.createElement("circle", { cx: "30", cy: "84", r: "15", fill: K, stroke: BONE2, strokeOpacity: ".4", strokeWidth: "3" }), /* @__PURE__ */ React22.createElement("circle", { cx: "112", cy: "84", r: "15", fill: K, stroke: BONE2, strokeOpacity: ".4", strokeWidth: "3" })))), /* @__PURE__ */ React22.createElement("g", { transform: "translate(520 532)" }, [-50, -20, 10, 40, 70].map((deg) => /* @__PURE__ */ React22.createElement(
        "path",
        {
          key: deg,
          d: "M0 0L-38 0",
          transform: `rotate(${deg})`,
          stroke: "var(--art-tangerine)",
          strokeWidth: "5",
          strokeLinecap: "round",
          style: { ...box, transformOrigin: "right center", ...run("fi-ray", 320, 1420, "ease-out") }
        }
      ))), /* @__PURE__ */ React22.createElement(Burst, { x: 600, y: 538, r: 70, flat: 0.45 }))
    }
  );
}
function Card({ x, y, rot, suit, deal, flipAt }) {
  const spade = "M0-26C-10-14-26-4-26 8C-26 18-14 22-5 15L-9 28H9L5 15C14 22 26 18 26 8C26-4 10-14 0-26Z";
  const heart = "M0 24C-14 12-26 2-26-10C-26-20-18-26-10-26C-5-26-1-22 0-18C1-22 5-26 10-26C18-26 26-20 26-10C26 2 14 12 0 24Z";
  return /* @__PURE__ */ React22.createElement("g", { style: { ...box, ...deal } }, /* @__PURE__ */ React22.createElement("g", { transform: `translate(${x} ${y}) rotate(${rot})` }, /* @__PURE__ */ React22.createElement("g", { style: { ...box, ...run("fi-card-back", 80, flipAt, "cubic-bezier(.5,0,.8,.5)") } }, /* @__PURE__ */ React22.createElement("rect", { x: "-40", y: "-56", width: "80", height: "112", rx: "8", fill: mix("var(--art-cobalt)", 80, K), stroke: K, strokeWidth: "4" }), /* @__PURE__ */ React22.createElement("rect", { x: "-31", y: "-47", width: "62", height: "94", rx: "4", fill: "none", stroke: BONE2, strokeOpacity: ".45", strokeWidth: "3" })), /* @__PURE__ */ React22.createElement("g", { style: { ...box, ...run("fi-card-front", 120, flipAt + 80, "var(--ease-land)") } }, /* @__PURE__ */ React22.createElement("rect", { x: "-40", y: "-56", width: "80", height: "112", rx: "8", fill: BONE2, stroke: K, strokeWidth: "4" }), /* @__PURE__ */ React22.createElement("path", { d: suit === "heart" ? heart : spade, fill: suit === "heart" ? "var(--art-rose)" : K }))));
}
function Stack({ x, y, ink, n, at }) {
  return /* @__PURE__ */ React22.createElement("g", null, Array.from({ length: n }, (_, i) => /* @__PURE__ */ React22.createElement("g", { key: i, style: run("fi-chip", 200, at + i * 70, "var(--ease-land)") }, /* @__PURE__ */ React22.createElement("ellipse", { cx: x, cy: y - i * 9, rx: "30", ry: "10", fill: ink, stroke: K, strokeWidth: "3" }), /* @__PURE__ */ React22.createElement("path", { d: `M${x - 30} ${y - i * 9}v5a30 10 0 0 0 60 0v-5`, fill: mix(ink, 70, K), stroke: K, strokeWidth: "3" }), /* @__PURE__ */ React22.createElement("path", { d: `M${x - 14} ${y - i * 9 + 9}v4M${x + 14} ${y - i * 9 + 9}v4`, stroke: BONE2, strokeWidth: "4" }))));
}
function Poker() {
  const felt = mix("var(--art-sage)", 80, K);
  return /* @__PURE__ */ React22.createElement(
    Plates,
    {
      mid: /* @__PURE__ */ React22.createElement(React22.Fragment, null, /* @__PURE__ */ React22.createElement("ellipse", { cx: "600", cy: "528", rx: "490", ry: "116", fill: mix("var(--art-umber)", 85, K), stroke: K, strokeWidth: "5" }), /* @__PURE__ */ React22.createElement("ellipse", { cx: "600", cy: "526", rx: "452", ry: "96", fill: felt }), /* @__PURE__ */ React22.createElement("ellipse", { cx: "600", cy: "524", rx: "300", ry: "58", fill: "none", stroke: BONE2, strokeOpacity: ".2", strokeWidth: "4" }), [6, 3, 0].map((d) => /* @__PURE__ */ React22.createElement("rect", { key: d, x: 572 + d * 0.5, y: 434 + d, width: "56", height: "40", rx: "5", fill: mix("var(--art-cobalt)", 80, K), stroke: K, strokeWidth: "3" })), /* @__PURE__ */ React22.createElement("rect", { x: "579", y: "440", width: "42", height: "28", rx: "3", fill: "none", stroke: BONE2, strokeOpacity: ".45", strokeWidth: "2" }), /* @__PURE__ */ React22.createElement(Stack, { x: 420, y: 548, ink: "var(--poker-500)", n: 5, at: 1e3 }), /* @__PURE__ */ React22.createElement(Stack, { x: 780, y: 548, ink: "var(--poker-1000)", n: 6, at: 1060 }), /* @__PURE__ */ React22.createElement(Stack, { x: 700, y: 574, ink: "var(--poker-25)", n: 3, at: 1120 }), /* @__PURE__ */ React22.createElement(Stack, { x: 500, y: 576, ink: "var(--poker-100)", n: 3, at: 1180 })),
      near: /* @__PURE__ */ React22.createElement(React22.Fragment, null, /* @__PURE__ */ React22.createElement(Card, { x: 556, y: 520, rot: -9, suit: "spade", deal: run("fi-deal-1", 360, INTRO_TIMING.play, "cubic-bezier(.2,.7,.3,1)"), flipAt: INTRO_TIMING.hit - 200 }), /* @__PURE__ */ React22.createElement(Card, { x: 636, y: 524, rot: 7, suit: "heart", deal: run("fi-deal-2", 360, INTRO_TIMING.play + 160, "cubic-bezier(.2,.7,.3,1)"), flipAt: INTRO_TIMING.hit - 120 }), /* @__PURE__ */ React22.createElement(Burst, { x: 596, y: 522, r: 96, flat: 0.7 }))
    }
  );
}
function MarkScene({ gameId, variant }) {
  return /* @__PURE__ */ React22.createElement(
    Plates,
    {
      mid: /* @__PURE__ */ React22.createElement(React22.Fragment, null, /* @__PURE__ */ React22.createElement("ellipse", { cx: "600", cy: "536", rx: "190", ry: "36", fill: K }), /* @__PURE__ */ React22.createElement("ellipse", { cx: "600", cy: "528", rx: "180", ry: "32", fill: mix("var(--art-cream)", 18, K), stroke: BONE2, strokeOpacity: ".4", strokeWidth: "4" }), /* @__PURE__ */ React22.createElement("ellipse", { cx: "600", cy: "528", rx: "110", ry: "18", fill: K, opacity: ".4", style: { ...box, ...run("fi-shadow", 1100, INTRO_TIMING.play, GRAVITY_DOWN) } })),
      near: /* @__PURE__ */ React22.createElement(React22.Fragment, null, /* @__PURE__ */ React22.createElement("g", { style: run("fi-mark-drop", 1100, INTRO_TIMING.play, GRAVITY_DOWN) }, /* @__PURE__ */ React22.createElement("g", { style: { transformBox: "fill-box", transformOrigin: "50% 100%", ...run("fi-squash", 360, INTRO_TIMING.hit, "var(--ease-land)") } }, /* @__PURE__ */ React22.createElement("g", { transform: "translate(480 280)" }, /* @__PURE__ */ React22.createElement(GameMark, { id: gameId, variant, size: 240, hero: true })))), /* @__PURE__ */ React22.createElement(Burst, { x: 600, y: 520, r: 150, flat: 0.3 }))
    }
  );
}
function IntroDiorama({ scene, gameId, variant }) {
  const Scene = SCENES[scene];
  return Scene ? /* @__PURE__ */ React22.createElement(Scene, null) : /* @__PURE__ */ React22.createElement(MarkScene, { gameId, variant });
}
var K, BONE2, mix, run, box, GRAVITY_DOWN, WOOD_COURT, RACK, RACK_INK, SCATTER, SCENES;
var init_IntroScenes = __esm({
  "src/features/intro/IntroScenes.jsx"() {
    init_GameMark();
    init_introTiming();
    K = "var(--ink0)";
    BONE2 = "var(--bone)";
    mix = (a, pct, b) => `color-mix(in srgb, ${a} ${pct}%, ${b})`;
    run = (name, ms, at, ease = "var(--ease-out)", extra = "") => {
      const value = `${name} ${ms}ms ${ease} calc(var(--tl, 0ms) + ${at}ms) both${extra}`;
      return { "--fa": value, animation: value };
    };
    box = { transformBox: "fill-box", transformOrigin: "center" };
    GRAVITY_DOWN = "cubic-bezier(.4,0,.75,.45)";
    WOOD_COURT = mix("var(--art-tangerine)", 52, "var(--art-umber)");
    RACK = [[600, 490], [586, 478], [614, 478], [572, 466], [600, 466], [628, 466], [558, 454], [586, 454], [614, 454], [642, 454]];
    RACK_INK = [
      "var(--art-tangerine)",
      "var(--art-cobalt)",
      "var(--art-rose)",
      "var(--art-violet)",
      null,
      "var(--art-turquoise)",
      "var(--art-terracotta)",
      "var(--art-cream)",
      "var(--art-sage)",
      "var(--art-indigo)"
    ];
    SCATTER = [[-150, 40], [-250, 10], [180, 32], [-120, 22], null, [250, 12], [-230, 6], [-60, 30], [90, 24], [230, 8]];
    SCENES = Object.freeze({
      putting: Putting,
      die: Die,
      where: Where,
      "basketball:5v5": FullCourt,
      pickleball: Pickleball,
      "basketball:1v1": OneOnOne,
      volleyball: Volleyball,
      trivia: Trivia,
      "8ball": EightBall,
      pong: Pong,
      ragecage: RageCage,
      beerio: Kart,
      poker: Poker
    });
  }
});

// src/features/intro/intro.css
var init_intro = __esm({
  "src/features/intro/intro.css"() {
  }
});

// src/features/intro/GameIntro.jsx
import React23, { useEffect as useEffect13, useRef as useRef11, useState as useState12 } from "react";
function useIntroElapsed(anchor, { reduced = false, now: now2 = serverNow } = {}) {
  const [elapsed] = useState12(() => reduced ? INTRO_MS : Number(anchor) > 0 ? introElapsed(anchor, now2()) : 0);
  return elapsed;
}
function GameIntro({
  ev,
  surface = "phone",
  anchor = null,
  reduced = false,
  handoff = false,
  ladder = null,
  now: now2 = serverNow,
  sound = false
}) {
  const scene = introScene(ev);
  const elapsed = useIntroElapsed(anchor, { reduced, now: now2 });
  const rung = useRef11(false);
  useEffect13(() => {
    if (!sound || rung.current || !(Number(anchor) > 0)) return;
    rung.current = true;
    if (!freshFrameNow()) return;
    playSound("S2", { bus: "you", at: Number(anchor), key: `intro:${ev?.id}:${anchor}`, opts: { game: scene, summary: reduced } });
  }, []);
  const tv2 = surface === "tv";
  return /* @__PURE__ */ React23.createElement(
    "div",
    {
      className: `fd-intro is-${surface}${handoff && !reduced ? " is-handoff" : ""}${reduced ? " is-still" : ""}`,
      "data-scene": scene,
      style: { "--tl": `${reduced ? STILL_TL : -Math.round(elapsed)}ms` }
    },
    /* @__PURE__ */ React23.createElement("div", { className: "fd-intro-paint", "aria-hidden": "true" }, /* @__PURE__ */ React23.createElement(GlassArt, { depth: true, clear: { from: 0.22, to: 0.78 } })),
    /* @__PURE__ */ React23.createElement(
      "svg",
      {
        className: "fd-intro-set",
        viewBox: tv2 ? TV_BOX : PHONE_BOX,
        preserveAspectRatio: "xMidYMax meet",
        "aria-hidden": "true",
        focusable: "false"
      },
      /* @__PURE__ */ React23.createElement(IntroDiorama, { scene, gameId: ev?.game, variant: ev?.variant })
    ),
    /* @__PURE__ */ React23.createElement("div", { className: "fd-intro-light", "aria-hidden": "true" }),
    /* @__PURE__ */ React23.createElement("div", { className: "fd-intro-base", "aria-hidden": "true" }),
    /* @__PURE__ */ React23.createElement("div", { className: "fd-intro-dark", "aria-hidden": "true" }),
    ladder && /* @__PURE__ */ React23.createElement("div", { className: "fd-intro-ladder" }, ladder),
    /* @__PURE__ */ React23.createElement("i", { className: "fd-intro-sweep", "aria-hidden": "true" }),
    /* @__PURE__ */ React23.createElement("i", { className: "fd-intro-veil", "aria-hidden": "true" }),
    /* @__PURE__ */ React23.createElement("div", { className: "fd-intro-title" }, /* @__PURE__ */ React23.createElement("h2", { className: "fd-show is-marquee fd-glass-letter fd-intro-name" }, /* @__PURE__ */ React23.createElement(EventName, { name: ev?.name || "" }))),
    !tv2 && /* @__PURE__ */ React23.createElement(LampChase, { className: "fd-intro-chase", color: "var(--phase)" })
  );
}
var STILL_TL, TV_BOX, PHONE_BOX;
var init_GameIntro = __esm({
  "src/features/intro/GameIntro.jsx"() {
    init_GlassArt();
    init_ScoreReel();
    init_OneSafe();
    init_serverClock();
    init_sound();
    init_IntroScenes();
    init_introTiming();
    init_intro();
    STILL_TL = -(INTRO_MS + 6e4);
    TV_BOX = "-273 0 1745 795";
    PHONE_BOX = "270 150 660 495";
  }
});

// src/lib/motionKit.js
import { useLayoutEffect as useLayoutEffect6, useRef as useRef13, useState as useState14 } from "react";
function useFreshHold(value, key = null, ms = MOTION.story, options) {
  const change = useFreshChange(value, key, options);
  const [held, setHeld] = useState14(0);
  useLayoutEffect6(() => {
    if (!change.animate) return void 0;
    setHeld(change.changeId);
    const t = setTimeout(() => setHeld((current) => current === change.changeId ? 0 : current), ms);
    return () => clearTimeout(t);
  }, [change.changeId]);
  return change.animate ? change.changeId : held;
}
function childOffsets(container, attr = "data-flip") {
  const map = /* @__PURE__ */ new Map();
  if (!container || typeof container.getBoundingClientRect !== "function") return map;
  const box2 = container.getBoundingClientRect();
  const scale = container.offsetWidth ? box2.width / container.offsetWidth || 1 : 1;
  for (const el of container.querySelectorAll(`[${attr}]`)) {
    const r = el.getBoundingClientRect();
    map.set(el.getAttribute(attr), {
      left: (r.left - box2.left) / scale,
      top: (r.top - box2.top) / scale,
      width: r.width / scale,
      height: r.height / scale
    });
  }
  return map;
}
function flipMoves(before, after, { threshold = 0.5 } = {}) {
  const moves = [], entering = [];
  for (const [key, to] of after) {
    const from = before?.get(key);
    if (!from) {
      entering.push(key);
      continue;
    }
    const dx = from.left - to.left, dy = from.top - to.top;
    if (Math.abs(dx) >= threshold || Math.abs(dy) >= threshold) moves.push({ key, dx, dy });
  }
  return { moves, entering };
}
function useFlip(ref, {
  play = false,
  attr = "data-flip",
  duration = MOTION.rowSlide,
  delay = 0,
  stagger = 0,
  easing = EASE.out,
  enter = true,
  onPlay = null
} = {}) {
  const last = useRef13(null);
  useLayoutEffect6(() => {
    const container = ref.current;
    const before = last.current;
    const after = childOffsets(container, attr);
    last.current = after;
    if (!play || !before || !container || prefersReducedMotion()) return;
    try {
      onPlay?.(before, after, container);
    } catch {
    }
    const { moves, entering } = flipMoves(before, after);
    const find = (key) => container.querySelector(`[${attr}="${typeof CSS !== "undefined" && CSS.escape ? CSS.escape(key) : key}"]`);
    moves.forEach(({ key, dx, dy }, index) => {
      const el = find(key);
      if (typeof el?.animate !== "function") return;
      try {
        el.animate(
          [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }],
          { duration, delay: delay + index * stagger, easing, fill: "backwards" }
        );
      } catch {
      }
    });
    if (enter) entering.forEach((key, index) => {
      const el = find(key);
      if (typeof el?.animate !== "function") return;
      try {
        el.animate(
          [{ opacity: 0, transform: "translateX(12px)" }, { opacity: 1, transform: "none" }],
          { duration: MOTION.base, delay: delay + (moves.length + index) * stagger, easing, fill: "backwards" }
        );
      } catch {
      }
    });
  });
}
var init_motionKit = __esm({
  "src/lib/motionKit.js"() {
    init_motion();
  }
});

// src/features/draft/draftModel.js
function landedPick(draft, change) {
  if (!draft || !change?.fresh) return null;
  const { from, to } = change;
  if (!Number.isInteger(from) || to !== from + 1 || draft.picks.length !== to) return null;
  const pick = draft.picks[to - 1];
  return pick ? { player: pick.player, team: pick.team, pick: to } : null;
}
var init_draftModel = __esm({
  "src/features/draft/draftModel.js"() {
    init_core();
  }
});

// src/features/poker/pokerMotion.js
var init_pokerMotion = __esm({
  "src/features/poker/pokerMotion.js"() {
    init_core();
  }
});

// src/features/poker/poker-motion.css
var init_poker_motion = __esm({
  "src/features/poker/poker-motion.css"() {
  }
});

// src/features/poker/PokerMotion.jsx
import React26, { useEffect as useEffect16, useLayoutEffect as useLayoutEffect7, useRef as useRef15, useState as useState16 } from "react";
var init_PokerMotion = __esm({
  "src/features/poker/PokerMotion.jsx"() {
    init_core();
    init_PlayerIdentity();
    init_BetStacks();
    init_motion();
    init_motionKit();
    init_pokerMotion();
    init_poker_motion();
  }
});

// src/features/poker/pokerChips.js
var POKER_CHIPS, POKER_DENOMINATIONS;
var init_pokerChips = __esm({
  "src/features/poker/pokerChips.js"() {
    init_core();
    POKER_CHIPS = Object.freeze({
      25: Object.freeze({ color: "var(--poker-25)", isLight: false, skin: "quad" }),
      100: Object.freeze({ color: "var(--poker-100)", isLight: false, skin: "quad" }),
      500: Object.freeze({ color: "var(--poker-500)", isLight: false, skin: "quad" }),
      1e3: Object.freeze({ color: "var(--poker-1000)", isLight: true, skin: "quad" })
    });
    POKER_DENOMINATIONS = POKER_CONFIG.denominations;
  }
});

// src/features/poker/poker-chips.css
var init_poker_chips = __esm({
  "src/features/poker/poker-chips.css"() {
  }
});

// src/features/poker/PokerChips.jsx
import React27, { useLayoutEffect as useLayoutEffect8, useRef as useRef16 } from "react";
var init_PokerChips = __esm({
  "src/features/poker/PokerChips.jsx"() {
    init_BetStacks();
    init_motion();
    init_motionKit();
    init_pokerChips();
    init_pokerMotion();
    init_poker_chips();
  }
});

// src/lib/wakeLock.js
var init_wakeLock = __esm({
  "src/lib/wakeLock.js"() {
  }
});

// src/features/tv/serverClock.js
var init_serverClock2 = __esm({
  "src/features/tv/serverClock.js"() {
    init_serverClock();
  }
});

// src/ui/fdMark.js
var MARK_INKS, MARK_INKS_STAGING, HORIZON, BUTTE, BUTTE_LIT, FAR2;
var init_fdMark = __esm({
  "src/ui/fdMark.js"() {
    MARK_INKS = Object.freeze({
      chip: "#ffa630",
      ink: "#0a0910",
      bone: "#f4ecd8",
      /* sky, top to horizon: violet, violet-rose, rose, tangerine */
      sky: ["#4a2690", "#953685", "#e0457a", "#ff6f2c"],
      sun: "#ffca78",
      far: "#7d295a",
      mesa: "#cb493f",
      shade: "#241034",
      floor: "#331914"
    });
    MARK_INKS_STAGING = Object.freeze({
      chip: "#35c8f5",
      ink: "#101a33",
      bone: "#f7fbff",
      sky: ["#12163b", "#18205e", "#1f3396", "#2c3fa6"],
      sun: "#ffe7b3",
      far: "#132c53",
      mesa: "#2c306b",
      shade: "#0b1f28",
      floor: "#0b1c25",
      badge: "#eb3f78"
    });
    HORIZON = 38.8;
    BUTTE = `M10 ${HORIZON}L15 32.6 15.8 29.2H24.4L25.2 32.4 32.6 ${HORIZON}Z`;
    BUTTE_LIT = `M22.2 29.2H24.4L25.2 32.4 32.6 ${HORIZON}H25.4L23.3 32.6Z`;
    FAR2 = `M13 ${HORIZON}L19 37 23 37.6 29 36.2 34 37.3 40 35.8 46 37 52 ${HORIZON}Z`;
  }
});

// src/ui/Brand.jsx
import React31, { useId as useId4, useMemo as useMemo3 } from "react";
var init_Brand = __esm({
  "src/ui/Brand.jsx"() {
    init_fdMark();
  }
});

// src/ui/layout.jsx
import React34 from "react";
function PageHeading({ title, children, aside }) {
  return /* @__PURE__ */ React34.createElement("header", { className: "fd-page-heading" }, /* @__PURE__ */ React34.createElement("div", { className: "fd-page-heading-row" }, /* @__PURE__ */ React34.createElement("h1", null, title), aside), children);
}
var init_layout = __esm({
  "src/ui/layout.jsx"() {
  }
});

// src/ui/useGlassTilt.js
import { useEffect as useEffect20 } from "react";
function leanToward(clientX, clientY, rect, { dragging = false } = {}) {
  if (!rect?.width || !rect?.height) return { x: 0, y: 0 };
  const reach = dragging ? 1 : GLASS_TILT.press;
  return {
    x: clampUnit2((clientX - rect.left - rect.width / 2) / (rect.width / 2)) * reach,
    y: clampUnit2((clientY - rect.top - rect.height / 2) / (rect.height / 2)) * reach
  };
}
function springStep(pos, vel, target, dt, { stiffness = GLASS_TILT.stiffness, damping = GLASS_TILT.damping } = {}) {
  const step = Math.min(Math.max(dt, 0), 1 / 30);
  const next = vel + (-(pos - target) * stiffness - vel * damping) * step;
  return { pos: pos + next * step, vel: next };
}
function paneTransform({ x, y, z }, { base = "", max = GLASS_TILT.maxDeg, sink = GLASS_TILT.sinkPx } = {}) {
  return `${base ? `${base} ` : ""}perspective(${GLASS_TILT.perspective}px) rotateX(${(-y * max).toFixed(3)}deg) rotateY(${(x * max).toFixed(3)}deg) translateZ(${(-z * sink).toFixed(2)}px)`;
}
function supports3d() {
  if (typeof CSS === "undefined" || typeof CSS.supports !== "function") return true;
  return CSS.supports("transform-style", "preserve-3d");
}
function useGlassTilt(ref, { enabled = true, max = GLASS_TILT.maxDeg, sink = GLASS_TILT.sinkPx, glare = true } = {}) {
  useEffect20(() => {
    const el = ref?.current;
    if (!enabled || !el || typeof window === "undefined" || typeof document === "undefined") return void 0;
    const lean3d = supports3d();
    const s = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, tx: 0, ty: 0, tz: 0, raf: 0, last: 0, pointer: null, base: "", active: false };
    let glareEl = null, band = null;
    if (glare && window.getComputedStyle(el).position !== "static") {
      glareEl = document.createElement("span");
      glareEl.className = "fd-tilt-glare";
      glareEl.setAttribute("aria-hidden", "true");
      band = document.createElement("span");
      glareEl.appendChild(band);
      el.appendChild(glareEl);
    }
    el.setAttribute("data-glass-tilt", "rest");
    let layers = [];
    const write = () => {
      if (lean3d) el.style.transform = paneTransform(s, { base: s.base, max, sink });
      const [far, , , near] = GLASS_TILT.depthPx;
      layers.forEach((layer) => {
        const k = GLASS_TILT.depthPx[layer.depth] ?? (layer.depth > 0 ? near : far);
        layer.el.style.translate = `${(s.x * k).toFixed(2)}px ${(s.y * k * 0.6).toFixed(2)}px`;
      });
      if (band) {
        band.style.translate = `${(-s.x * GLASS_TILT.glareTravel * 100 / 0.28).toFixed(2)}% 0`;
        glareEl.style.opacity = (0.5 + 0.5 * Math.min(1, Math.hypot(s.x, s.y) * 1.6 + s.z * 0.3)).toFixed(3);
      }
    };
    const rest = () => {
      s.active = false;
      el.setAttribute("data-glass-tilt", "rest");
      el.style.removeProperty("transform");
      layers.forEach((layer) => layer.el.style.removeProperty("translate"));
      if (band) {
        band.style.removeProperty("translate");
        glareEl.style.removeProperty("opacity");
      }
    };
    const frame2 = (now2) => {
      const dt = s.last ? (now2 - s.last) / 1e3 : 1 / 60;
      s.last = now2;
      const x = springStep(s.x, s.vx, s.tx, dt), y = springStep(s.y, s.vy, s.ty, dt), z = springStep(s.z, s.vz, s.tz, dt);
      s.x = x.pos;
      s.vx = x.vel;
      s.y = y.pos;
      s.vy = y.vel;
      s.z = z.pos;
      s.vz = z.vel;
      const settled = springSettled(s.x, s.vx, s.tx) && springSettled(s.y, s.vy, s.ty) && springSettled(s.z, s.vz, s.tz);
      if (settled && !s.pointer && !s.tx && !s.ty && !s.tz) {
        s.raf = 0;
        s.last = 0;
        s.x = s.y = s.z = 0;
        rest();
        return;
      }
      write();
      s.raf = requestAnimationFrame(frame2);
    };
    const start = () => {
      if (!s.active) {
        const own = window.getComputedStyle(el).transform;
        s.base = own && own !== "none" ? own : "";
        layers = [...el.querySelectorAll("[data-glass-depth]")].map((node) => ({ el: node, depth: Number(node.getAttribute("data-glass-depth")) || 0 }));
        s.active = true;
        el.setAttribute("data-glass-tilt", "on");
      }
      if (!s.raf) {
        s.last = 0;
        s.raf = requestAnimationFrame(frame2);
      }
    };
    const aim = (target, z) => {
      s.tx = target.x;
      s.ty = target.y;
      s.tz = z;
      start();
    };
    const release = () => {
      s.pointer = null;
      s.tx = 0;
      s.ty = 0;
      s.tz = 0;
      if (s.active) start();
    };
    const onDown = (event) => {
      if (prefersReducedMotion() || event.pointerType === "mouse" && event.button !== 0) return;
      const rect = el.getBoundingClientRect();
      s.pointer = { id: event.pointerId, x0: event.clientX, y0: event.clientY, rect, dragging: false };
      aim(leanToward(event.clientX, event.clientY, rect), 1);
    };
    const onMove = (event) => {
      const p = s.pointer;
      if (!p || event.pointerId !== p.id) return;
      if (!p.dragging && Math.hypot(event.clientX - p.x0, event.clientY - p.y0) >= GLASS_TILT.dragPx) p.dragging = true;
      aim(leanToward(event.clientX, event.clientY, p.rect, { dragging: p.dragging }), 1);
    };
    const onUp = (event) => {
      if (s.pointer && event.pointerId === s.pointer.id) release();
    };
    const onLeave = (event) => {
      if (s.pointer && event.pointerId === s.pointer.id && event.pointerType === "mouse") release();
    };
    el.addEventListener("pointerdown", onDown, { passive: true });
    el.addEventListener("pointermove", onMove, { passive: true });
    el.addEventListener("pointerup", onUp, { passive: true });
    el.addEventListener("pointercancel", release, { passive: true });
    el.addEventListener("pointerleave", onLeave, { passive: true });
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", release);
      el.removeEventListener("pointerleave", onLeave);
      if (s.raf) cancelAnimationFrame(s.raf);
      rest();
      el.removeAttribute("data-glass-tilt");
      glareEl?.remove();
    };
  }, [ref, enabled, max, sink, glare]);
}
var GLASS_TILT, clampUnit2, springSettled;
var init_useGlassTilt = __esm({
  "src/ui/useGlassTilt.js"() {
    init_motion();
    GLASS_TILT = Object.freeze({
      maxDeg: 3,
      press: 0.45,
      // a still press leans this much of the way
      dragPx: 6,
      // movement before a press becomes a drag
      sinkPx: 5,
      perspective: 1100,
      stiffness: 240,
      // the spring back: one small overshoot, then level
      damping: 24,
      /* the painting's layers slide by depth per unit lean, far to near, so
         the near floor moves most and the sky least */
      depthPx: Object.freeze([-1.5, 0, 2.5, 4.5]),
      /* the band slides this share of its pane per unit lean */
      glareTravel: 0.22
    });
    clampUnit2 = (value) => Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
    springSettled = (pos, vel, target) => Math.abs(pos - target) < 2e-3 && Math.abs(vel) < 0.01;
  }
});

// src/features/standings/winImpact.js
function joinNames(names) {
  if (names.length <= 1) return names[0] || "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}
function winSlots(state, ev, contest, sideKey) {
  if (!ev || !contest || ev.finale || !(awardTable(ev)[0] > 0)) return null;
  const side = contest.sides?.find((item) => item.key === sideKey);
  if (!side?.players?.length) return null;
  const table = awardTable(ev);
  if (contest.kind === "match") {
    const br = state.brackets?.[ev.id], draw = state.draws?.[ev.id];
    if (!br || !draw?.teams || !Array.isArray(contest.match)) return null;
    const [r] = contest.match;
    if (r !== br.rounds.length - 1) return null;
    const runner = contest.sides.find((item) => item.key !== sideKey);
    const before = br.rounds.length > 1 ? br.rounds[br.rounds.length - 2] : [];
    const third = before.map((match) => [resolveSlot(br, match.a), resolveSlot(br, match.b)].find((key) => known(key) && known(match.winner) && key !== match.winner)).filter((key) => known(key) && draw.teams[key]);
    return [
      [...side.players],
      table[1] > 0 && runner ? [...runner.players] : [],
      table[2] > 0 ? third.flatMap((key) => draw.teams[key].players) : []
    ];
  }
  if (contest.kind === "stage-final") return [[...side.players], [], []];
  if (contest.kind === "ffa") {
    const other = contest.sides.length === 2 ? contest.sides.find((item) => item.key !== sideKey) : null;
    return [[...side.players], table[1] > 0 && other ? [...other.players] : [], []];
  }
  return null;
}
function contestWinLines(state, ev, contest, { events = allEventsOf(state), standings, keys = null } = {}) {
  if (!state || !ev || !contest?.sides?.length) return [];
  const settled = (state.wagers || []).filter((w) => resolveWager(state, w, events).status !== "pending");
  const base = { ...state, wagers: settled };
  const beforeRows = standings || computeStandings(state);
  const before = new Map(beforeRows.map((row) => [row.player, row]));
  return contest.sides.map((side) => {
    if (keys && !keys.includes(side.key)) return null;
    const slots = winSlots(state, ev, contest, side.key);
    if (!slots) return null;
    const after = computeStandings({ ...base, results: {
      ...state.results || {},
      [ev.id]: { slots, ts: 0, revision: 1 }
    } });
    const afterBy = new Map(after.map((row) => [row.player, row]));
    const players = side.players.filter((p) => before.has(p) && afterBy.has(p));
    if (!players.length) return null;
    const movers = players.filter((p) => afterBy.get(p).rank < before.get(p).rank);
    if (movers.length) {
      const best = Math.min(...movers.map((p) => afterBy.get(p).rank));
      const group = movers.filter((p) => afterBy.get(p).rank === best);
      const shared = after.filter((row) => row.rank === best).length > group.length;
      const whole = group.length === side.players.length && group.length > 2;
      const names2 = whole ? teamLabel(state, { players: side.players, name: state.draws?.[ev.id]?.teams?.[side.key]?.name }) : joinNames(group.map((p) => disp(state, p)));
      const plural = group.length > 1 && !whole;
      const text = shared ? `Win: ${names2} ${plural ? "tie" : "ties"} for ${ordinal(best)}` : `Win: ${names2} to ${ordinal(best)}`;
      return { key: side.key, kind: "rank", rank: best, tied: shared, players: group, text };
    }
    const award = afterBy.get(players[0]).pts - before.get(players[0]).pts;
    if (!(award > 0)) return null;
    const names = players.length > 2 ? teamLabel(state, { players, name: state.draws?.[ev.id]?.teams?.[side.key]?.name }) : joinNames(players.map((p) => disp(state, p)));
    return { key: side.key, kind: "chips", award, players, text: `Win: ${names} +${fmt5(award)}` };
  });
}
var known, ordinal, fmt5, winLineFor;
var init_winImpact = __esm({
  "src/features/standings/winImpact.js"() {
    init_core();
    known = (key) => key !== null && key !== void 0;
    ordinal = (n) => {
      const tail = n % 100;
      if (tail >= 11 && tail <= 13) return `${n}th`;
      return `${n}${["th", "st", "nd", "rd"][n % 10] || "th"}`;
    };
    fmt5 = (n) => (n ?? 0).toLocaleString("en-US");
    winLineFor = (lines, key) => (lines || []).find((line) => line && line.key === key) || null;
  }
});

// src/features/standings/win-line.css
var init_win_line = __esm({
  "src/features/standings/win-line.css"() {
  }
});

// src/features/standings/WinLine.jsx
import React36 from "react";
function WinLine({ line, className = "" }) {
  if (!line?.text) return null;
  return /* @__PURE__ */ React36.createElement("small", { className: `fd-win-line${line.kind === "rank" ? " is-rank" : ""}${className ? ` ${className}` : ""}` }, line.text);
}
var init_WinLine = __esm({
  "src/features/standings/WinLine.jsx"() {
    init_win_line();
  }
});

// src/lib/client.js
var dispatch;
var init_client = __esm({
  "src/lib/client.js"() {
    dispatch = () => {
      throw new Error("dispatch is unavailable in the isolated preview");
    };
  }
});

// src/features/check-in/install.js
var installEvt, onInstallReady, isIOS2;
var init_install = __esm({
  "src/features/check-in/install.js"() {
    installEvt = null;
    onInstallReady = () => {
      throw new Error("onInstallReady is unavailable in the isolated preview");
    };
    isIOS2 = () => {
      throw new Error("isIOS is unavailable in the isolated preview");
    };
  }
});

// src/features/tv/tvModel.js
var RESULT_PODIUM_BEATS_MS, RESULT_PODIUM_STEP_MS, PODIUM_STAGE, BACKERS_RAIL, TICKER_ROLES, FACT_ROLES, TICKER_FACT_TAGS, CUE_WINDOW_MS;
var init_tvModel = __esm({
  "src/features/tv/tvModel.js"() {
    init_core();
    init_desertModel();
    init_phase();
    init_betStacks();
    init_introTiming();
    RESULT_PODIUM_BEATS_MS = Object.freeze([0, 900, 2400]);
    RESULT_PODIUM_STEP_MS = RESULT_PODIUM_BEATS_MS[1];
    PODIUM_STAGE = Object.freeze({
      floor: 756,
      lid: 26,
      roomTop: 136,
      pad: 22,
      gap: 14,
      minFace: 44,
      order: Object.freeze([2, 1, 3]),
      width: Object.freeze({ 1: 600, 2: 460, 3: 460 }),
      height: Object.freeze({ 1: 318, 2: 226, 3: 164 }),
      /* the largest faces a place stands: alone, a pair, a team */
      face: Object.freeze({ 1: Object.freeze([168, 128, 104]), 2: Object.freeze([128, 104, 88]), 3: Object.freeze([128, 104, 88]) }),
      name: Object.freeze({ 1: 92, 2: 60, 3: 60 }),
      title: Object.freeze({ max: 92, min: 56, mark: 84, gap: 26, width: 1792 })
    });
    BACKERS_RAIL = Object.freeze({
      width: 1792,
      pad: 30,
      tag: 236,
      total: 200,
      named: 236,
      bare: 120,
      more: 92,
      gap: 18,
      afterMs: 300
    });
    TICKER_ROLES = Object.freeze(["info", "chip", "won", "loss"]);
    FACT_ROLES = Object.freeze({ streak: "info", first: "chip", wins: "info", bet: "won" });
    TICKER_FACT_TAGS = Object.freeze({ first: "Milestone" });
    CUE_WINDOW_MS = 3 * 60 * 1e3;
  }
});

// src/features/tv/tvMotion.js
import { useEffect as useEffect22, useRef as useRef22, useState as useState23 } from "react";
var ADVANCE_TIMING, CROWN_TIMING, inOut;
var init_tvMotion = __esm({
  "src/features/tv/tvMotion.js"() {
    init_core();
    init_motion();
    init_serverClock();
    ADVANCE_TIMING = Object.freeze({
      fill: 0,
      fillMs: 240,
      // the winning row fills sun from the left
      stamp: 120,
      stampMs: 320,
      // WON stamps
      lose: 250,
      loseMs: 300,
      // the losing row steps back
      lift: 700,
      ride: 760,
      rideMs: 800,
      // the winners lift off and ride the connector
      land: 1540,
      landMs: 320,
      // they land in the next slot
      upNow: 1900,
      upNowMs: 600,
      // UP NOW travels to the next open match
      unfill: 2700,
      unfillMs: 500,
      // the fill settles to the bracket's resting style
      total: 3200
    });
    CROWN_TIMING = Object.freeze({
      night: 0,
      nightMs: 1800,
      // lean-in: night falls on the art
      title: 700,
      // "Final" lights
      towers: 1600,
      towersMs: 1500,
      towersStagger: 100,
      // the towers stand, last place first
      hold: 3300,
      // the final standings, as they stood
      stepDown: 3600,
      stepStagger: 600,
      stepMs: 500,
      // a tower goes dark, 13th up to 3rd
      holdTwo: 10200,
      holdTwoMs: 2e3,
      // the last two hold
      second: 12200,
      // 2nd goes dark
      rise: 13e3,
      riseMs: 1500,
      // the champion's tower rises and cascades
      flood: 14500,
      floodMs: 1e3,
      // their color floods from their tower
      chip: 15400,
      chipMs: 1400,
      // their chip drops and turns twice
      tag: 15900,
      tagMs: 300,
      // CHAMPION stamps
      name: 16200,
      nameStagger: 60,
      nameMs: 380,
      stats: 17200,
      statsMs: 300,
      count: 17600,
      countMs: 1800,
      // the final stack counts in 25s
      path: 18200,
      pathStagger: 110,
      pathMs: 300,
      lines: 19800,
      lineStagger: 300,
      lineMs: 300,
      // the constellation joins
      total: 23500
    });
    inOut = cubicBezier(0.65, 0, 0.35, 1);
  }
});

// src/features/tv/faceOff.js
import { useEffect as useEffect23, useRef as useRef23, useState as useState24 } from "react";
var FACEOFF_TIMING;
var init_faceOff = __esm({
  "src/features/tv/faceOff.js"() {
    init_core();
    init_seasonStats();
    init_motion();
    init_serverClock();
    init_drawReveal();
    init_tvModel();
    init_tvMotion();
    FACEOFF_TIMING = Object.freeze({
      dim: 0,
      dimMs: 900,
      // lean-in: the glass dims, the sting
      slide: 900,
      slideMs: 420,
      // the left side slams in
      slide2: 1250,
      // the right side slams in
      vs: 1900,
      vsMs: 420,
      // VS hits, then holds
      h2h: 2700,
      typeMs: 42,
      // the record types in, one tick a letter
      lines: 3900,
      linesMs: 300,
      // X8: what a win does
      settle: 3 * MOTION.beat + 600,
      settleMs: 500,
      // it lifts off the betting board
      total: 3 * MOTION.beat + 1100
    });
  }
});

// shared/audio.js
var MAX_TRACK_DURATION_MS, WALKOUT_MAX_MS, WIN_SONG_CLIP_MS;
var init_audio = __esm({
  "shared/audio.js"() {
    MAX_TRACK_DURATION_MS = 12 * 60 * 60 * 1e3;
    WALKOUT_MAX_MS = 4 * 60 * 1e3;
    WIN_SONG_CLIP_MS = 30 * 1e3;
  }
});

// src/features/check-in/InstallHint.jsx
import React43, { useEffect as useEffect26, useState as useState31 } from "react";
function InstallHint() {
  const [, bump] = useState31(0);
  useEffect26(() => onInstallReady(() => bump((x) => x + 1)), []);
  if (installEvt) return /* @__PURE__ */ React43.createElement(Btn, { onClick: () => installEvt.prompt(), style: { alignSelf: "flex-start" } }, "Add to home screen");
  if (isIOS2()) return /* @__PURE__ */ React43.createElement("div", null, [["1", "Tap the Share button in Safari"], ["2", "Tap Add to Home Screen"]].map(([n, t]) => /* @__PURE__ */ React43.createElement("div", { key: n, style: { display: "flex", gap: 12, alignItems: "center", padding: "7px 0" } }, /* @__PURE__ */ React43.createElement("span", { style: { fontFamily: DISPLAY, fontWeight: 700, fontSize: 19, color: "var(--accent2)" } }, n), /* @__PURE__ */ React43.createElement("span", { style: { fontFamily: SANS, fontSize: 16, color: "var(--ink)" } }, t))));
  return /* @__PURE__ */ React43.createElement("div", { style: { fontFamily: SANS, fontSize: 16, color: "var(--ink)" } }, "In your browser menu, choose Add to Home Screen.");
}
var init_InstallHint = __esm({
  "src/features/check-in/InstallHint.jsx"() {
    init_controls();
    init_theme();
    init_install();
  }
});

// src/features/weekend/programModel.js
var init_programModel = __esm({
  "src/features/weekend/programModel.js"() {
    init_core();
    init_prompts();
  }
});

// src/features/weekend/trophy.js
var SESSION_LABEL, ENGRAVE, CUP_TV;
var init_trophy = __esm({
  "src/features/weekend/trophy.js"() {
    init_core();
    init_teamNames();
    init_programModel();
    SESSION_LABEL = Object.fromEntries(SESSIONS.map((session) => [session.id, session.label]));
    ENGRAVE = Object.freeze({ lead: 900, stagger: 700, sweep: 1100, cut: 520, settle: 600 });
    CUP_TV = Object.freeze({
      width: 1480,
      label: 196,
      pad: 12,
      gap: 12,
      rim: 6,
      sag: 16,
      line: 3,
      top: 34,
      foot: 27,
      platePad: 10,
      bowl: Object.freeze({ width: 600, height: 240, cartouche: Object.freeze({ width: 260, height: 112 }) }),
      collar: 24,
      height: 796,
      plate: Object.freeze({
        face: 44,
        overlap: 14,
        padX: 16,
        gapX: 12,
        event: 24,
        name: Object.freeze({ max: 32, min: 28, two: 26, floor: 24 })
      })
    });
  }
});

// src/features/weekend/trophy.css
var init_trophy2 = __esm({
  "src/features/weekend/trophy.css"() {
  }
});

// src/features/weekend/Trophy.jsx
import React44, { useEffect as useEffect27, useId as useId5, useLayoutEffect as useLayoutEffect11, useState as useState32 } from "react";
var BOWL_BOX, ENGRAVE_MS;
var init_Trophy = __esm({
  "src/features/weekend/Trophy.jsx"() {
    init_PlayerIdentity();
    init_OneSafe();
    init_motion();
    init_programModel();
    init_trophy();
    init_trophy2();
    BOWL_BOX = Object.freeze({ w: 600, h: 240 });
    ENGRAVE_MS = ENGRAVE.sweep + ENGRAVE.settle;
  }
});

// src/features/results/weekendFacts.js
var FACT_TAGS;
var init_weekendFacts = __esm({
  "src/features/results/weekendFacts.js"() {
    init_core();
    init_lastCard();
    init_resultMoment();
    init_seasonStats();
    FACT_TAGS = Object.freeze({ streak: "Streak", first: "First", wins: "Milestone", bet: "Record" });
  }
});

// src/features/results/resultMoment.js
var init_resultMoment = __esm({
  "src/features/results/resultMoment.js"() {
    init_core();
    init_weekendFacts();
  }
});

// src/features/results/lastCard.js
var SESSION_ORDER, SESSION_TICKS;
var init_lastCard = __esm({
  "src/features/results/lastCard.js"() {
    init_core();
    init_resultMoment();
    SESSION_ORDER = SESSIONS.map((session) => session.id);
    SESSION_TICKS = Object.freeze({ fri: "FRI", sam: "SAT AM", sap: "SAT PM", san: "SAT NIGHT", fin: "POKER" });
  }
});

// src/features/results/crownTiming.js
var CROWN_CARD_HOLD_MS, PHONE_CROWN;
var init_crownTiming = __esm({
  "src/features/results/crownTiming.js"() {
    init_tvMotion();
    CROWN_CARD_HOLD_MS = 1400;
    PHONE_CROWN = Object.freeze({
      night: CROWN_TIMING.night,
      title: CROWN_TIMING.title,
      // the glass dims; "Final" lights
      you: CROWN_TIMING.towers,
      youMs: CROWN_TIMING.towersMs,
      // your own chip and final stack stand up
      rise: CROWN_TIMING.rise,
      riseMs: CROWN_TIMING.riseMs,
      // the champion's face rises with their tower
      flood: CROWN_TIMING.flood,
      floodMs: CROWN_TIMING.floodMs,
      // the room goes one color; your note sounds
      chip: CROWN_TIMING.chip,
      chipMs: CROWN_TIMING.chipMs,
      // their chip drops and turns twice
      tag: CROWN_TIMING.tag,
      name: CROWN_TIMING.name,
      nameStagger: CROWN_TIMING.nameStagger,
      stats: CROWN_TIMING.stats,
      count: CROWN_TIMING.count,
      countMs: CROWN_TIMING.countMs,
      turn: CROWN_TIMING.total + CROWN_CARD_HOLD_MS
      // this phone's own last card
    });
  }
});

// src/features/results/classPhoto.js
var CLASS_TIMING, FROZEN_TURNS;
var init_classPhoto = __esm({
  "src/features/results/classPhoto.js"() {
    init_core();
    CLASS_TIMING = Object.freeze({
      fade: 0,
      fadeMs: 400,
      chip: 300,
      chipStagger: 70,
      chipMs: 420,
      title: 1500,
      titleMs: 400,
      total: 2600
    });
    FROZEN_TURNS = Object.freeze(["champion", "class", "trophy"]);
  }
});

// src/features/photos/photoModel.js
var PHOTO_PREP;
var init_photoModel = __esm({
  "src/features/photos/photoModel.js"() {
    PHOTO_PREP = Object.freeze({
      side: 1600,
      quality: 0.8,
      thumbSide: 480,
      thumbQuality: 0.72,
      /* re-encoded bytes the server accepts; the phone steps quality down to fit */
      maxBytes: 145e4,
      maxThumbBytes: 15e4,
      perBatch: 10
    });
  }
});

// src/features/photos/prepareMoment.js
var init_prepareMoment = __esm({
  "src/features/photos/prepareMoment.js"() {
    init_photoModel();
  }
});

// shared/guestSetup.js
var init_guestSetup = __esm({
  "shared/guestSetup.js"() {
  }
});

// src/features/travel/travel.css
var init_travel = __esm({
  "src/features/travel/travel.css"() {
  }
});

// src/features/travel/Travel.jsx
import React50, { useState as useState38 } from "react";
function TravelMap() {
  const arc = (c) => {
    const mx = (c.x + TRAVEL_DEST.x) / 2;
    const lift = 9 + Math.abs(c.x - TRAVEL_DEST.x) * 0.3;
    return `M${c.x} ${c.y} Q${mx} ${Math.min(c.y, TRAVEL_DEST.y) - lift} ${TRAVEL_DEST.x} ${TRAVEL_DEST.y}`;
  };
  return /* @__PURE__ */ React50.createElement(
    "svg",
    {
      viewBox: "-5 -3 110 104",
      width: "100%",
      height: "100%",
      preserveAspectRatio: "xMidYMid meet",
      "aria-hidden": "true",
      style: { display: "block", overflow: "hidden", maxWidth: "100%", maxHeight: "100%" }
    },
    /* @__PURE__ */ React50.createElement("g", { style: { animation: "si-fade .8s ease-out both" } }, US_DOTS.map(([x, y], i) => /* @__PURE__ */ React50.createElement("circle", { key: i, cx: x, cy: y, r: "0.62", fill: "var(--muted)", opacity: "0.45" }))),
    TRAVEL_CITIES.map((c, i) => /* @__PURE__ */ React50.createElement(
      "path",
      {
        key: "r" + c.n,
        d: arc(c),
        fill: "none",
        stroke: "var(--accent2)",
        strokeWidth: "0.8",
        strokeLinecap: "round",
        strokeDasharray: "140",
        pathLength: "140",
        style: { "--len": 140, animation: `si-route 1.1s ease-out ${0.3 + i * 0.18}s both` }
      }
    )),
    TRAVEL_CITIES.map((c, i) => /* @__PURE__ */ React50.createElement(
      "circle",
      {
        className: "fd-travel-motion",
        key: "m" + c.n,
        r: "1.7",
        fill: "var(--sun)",
        stroke: "var(--ink0)",
        strokeWidth: "0.5",
        opacity: "0"
      },
      /* @__PURE__ */ React50.createElement("set", { attributeName: "opacity", to: "1", begin: `${1.2 + i * 0.18}s` }),
      /* @__PURE__ */ React50.createElement("animateMotion", { dur: "3.6s", begin: `${1.2 + i * 0.18}s`, repeatCount: "indefinite", path: arc(c) })
    )),
    TRAVEL_CITIES.map((c, i) => /* @__PURE__ */ React50.createElement("g", { key: c.n, style: { animation: `si-in .4s ease-out ${i * 0.18}s both` } }, /* @__PURE__ */ React50.createElement("circle", { cx: c.x, cy: c.y, r: "1.9", fill: "var(--paper)", stroke: "var(--bone)", strokeWidth: "0.9" }), /* @__PURE__ */ React50.createElement(
      "text",
      {
        x: c.x + c.dx,
        y: c.y + c.dy,
        textAnchor: c.a,
        fontFamily: SANS,
        fontWeight: "700",
        fontSize: "3.4",
        fill: "var(--muted2)",
        letterSpacing: "0.15"
      },
      c.n.toUpperCase()
    ))),
    /* @__PURE__ */ React50.createElement(
      "circle",
      {
        cx: TRAVEL_DEST.x,
        cy: TRAVEL_DEST.y,
        r: "4.6",
        fill: "none",
        stroke: "var(--sun)",
        strokeWidth: "0.9",
        style: { animation: "si-land 2.2s ease-in-out infinite" }
      }
    ),
    /* @__PURE__ */ React50.createElement("circle", { cx: TRAVEL_DEST.x, cy: TRAVEL_DEST.y, r: "2.8", fill: "var(--sun)", stroke: "var(--ink0)", strokeWidth: "0.8" }),
    /* @__PURE__ */ React50.createElement(
      "text",
      {
        x: TRAVEL_DEST.x,
        y: TRAVEL_DEST.y - 8,
        textAnchor: "middle",
        fontFamily: DISPLAY,
        fontWeight: "700",
        fontSize: "6",
        fill: "var(--signal-text, var(--sun))",
        letterSpacing: "0.3"
      },
      "SCOTTSDALE"
    )
  );
}
function HouseArt() {
  return /* @__PURE__ */ React50.createElement("div", { style: { position: "relative", aspectRatio: "16 / 9", background: "var(--paper2)", overflow: "hidden" } }, /* @__PURE__ */ React50.createElement(
    "img",
    {
      src: "/airbnb-compound-field-day.webp",
      alt: "",
      width: "1440",
      height: "810",
      loading: "eager",
      decoding: "async",
      style: {
        width: "100%",
        height: "100%",
        display: "block",
        objectFit: "cover",
        filter: "saturate(.94) contrast(1.02)"
      }
    }
  ));
}
function InfoCell({ lb, v, first }) {
  return /* @__PURE__ */ React50.createElement("div", { style: {
    flex: 1,
    minWidth: 0,
    padding: "11px 14px",
    borderLeft: first ? "none" : "1px solid var(--line)"
  } }, /* @__PURE__ */ React50.createElement("div", { style: { ...label, marginBottom: 4 } }, lb), /* @__PURE__ */ React50.createElement("div", { style: {
    fontFamily: SANS,
    fontWeight: 700,
    fontSize: 14,
    color: "var(--ink)",
    lineHeight: 1.35
  } }, v));
}
function VenueCard({ lg, compact = false }) {
  const mapUrl = lg.venue ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lg.venue)}` : null;
  const inL = cleanLeg(lg.hostIn), outL = cleanLeg(lg.hostOut);
  const hostLegs = [
    inL && ["Lands", inL.note || legTime(inL.time) && `Fri ${legTime(inL.time)}`],
    outL && ["Leaves", outL.note || legTime(outL.time) && `Sun ${legTime(outL.time)}`]
  ].filter((x) => x && x[1]);
  return /* @__PURE__ */ React50.createElement("div", null, /* @__PURE__ */ React50.createElement("div", { style: CARD }, !compact && /* @__PURE__ */ React50.createElement(HouseArt, null), /* @__PURE__ */ React50.createElement("div", { style: { padding: "12px 14px", borderTop: compact ? void 0 : "1px solid var(--line)" } }, /* @__PURE__ */ React50.createElement("div", { style: { ...label, marginBottom: 5 } }, "The house"), lg.venue && /* @__PURE__ */ React50.createElement("div", { style: {
    fontFamily: SANS,
    fontWeight: 600,
    fontSize: 15.5,
    lineHeight: 1.45,
    userSelect: "text",
    color: "var(--ink)"
  } }, lg.venue), lg.venueNote && /* @__PURE__ */ React50.createElement("div", { style: {
    fontFamily: SANS,
    fontSize: 13,
    color: "var(--muted2)",
    marginTop: 5,
    lineHeight: 1.5
  } }, lg.venueNote), mapUrl && /* @__PURE__ */ React50.createElement(
    "a",
    {
      href: mapUrl,
      target: "_blank",
      rel: "noreferrer",
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        minHeight: 44,
        marginTop: 2,
        fontFamily: SANS,
        fontWeight: 600,
        fontSize: 15,
        color: "var(--lamp-info)",
        textDecoration: "none"
      }
    },
    "Open in Maps",
    /* @__PURE__ */ React50.createElement(Icon, { name: "open", size: 16 })
  )), (lg.checkIn || lg.checkOut) && /* @__PURE__ */ React50.createElement("div", { style: { display: "flex", borderTop: "1px solid var(--line)" } }, /* @__PURE__ */ React50.createElement(InfoCell, { lb: "Check in", v: lg.checkIn || "TBD", first: true }), /* @__PURE__ */ React50.createElement(InfoCell, { lb: "Checkout", v: lg.checkOut || "TBD" }))), (lg.airport || hostLegs.length > 0) && /* @__PURE__ */ React50.createElement("div", { style: CARD }, lg.airport && /* @__PURE__ */ React50.createElement("div", { style: { display: "flex", alignItems: "center", gap: 14, padding: "12px 14px" } }, /* @__PURE__ */ React50.createElement("span", { style: { display: "flex", flexShrink: 0, color: "var(--accent2)" } }, /* @__PURE__ */ React50.createElement(Icon, { name: "plane", size: 20, lit: true })), /* @__PURE__ */ React50.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React50.createElement("div", { style: { ...label, marginBottom: 3 } }, "Fly into"), /* @__PURE__ */ React50.createElement("div", { style: { fontFamily: SANS, fontSize: 13, color: "var(--muted2)" } }, lg.airportName)), /* @__PURE__ */ React50.createElement("div", { style: {
    fontFamily: DISPLAY,
    fontWeight: 700,
    fontSize: 30,
    letterSpacing: "0.06em",
    color: "var(--signal-text, var(--sun))",
    lineHeight: 1
  } }, lg.airport)), hostLegs.length > 0 && /* the flight codes matter to nobody but Brandon; the times are how
     people work out who they are sharing a ride with */
  /* @__PURE__ */ React50.createElement("div", { style: { borderTop: lg.airport ? "1px solid var(--line)" : "none" } }, /* @__PURE__ */ React50.createElement("div", { style: { ...label, padding: "10px 14px 0" } }, "My flights"), /* @__PURE__ */ React50.createElement("div", { style: { display: "flex" } }, hostLegs.map(([lb, v], i) => /* @__PURE__ */ React50.createElement(InfoCell, { key: lb, lb, v, first: i === 0 }))))));
}
function FlightEntry({ leg: raw, dir, setLeg }) {
  const leg = raw || {};
  const set = (patch) => setLeg({ ...leg, ...patch });
  const box2 = {
    background: "var(--paper)",
    border: "1.5px solid var(--line)",
    borderRadius: 10,
    height: 48,
    display: "flex",
    alignItems: "center",
    padding: "0 8px",
    boxSizing: "border-box"
  };
  const bare = {
    background: "none",
    border: "none",
    padding: 0,
    minWidth: 0,
    width: "100%",
    height: "100%",
    minHeight: 44,
    boxSizing: "border-box",
    color: "var(--ink)"
  };
  const cap = { ...label, marginTop: 5, color: "var(--muted)" };
  return /* @__PURE__ */ React50.createElement("div", { className: "fd-flight-entry-wrap" }, /* @__PURE__ */ React50.createElement("div", { className: "fd-flight-entry" }, /* @__PURE__ */ React50.createElement("div", { style: { minWidth: 0 } }, /* @__PURE__ */ React50.createElement("div", { style: box2 }, /* @__PURE__ */ React50.createElement(
    "input",
    {
      value: leg.air || "",
      list: "fd-airlines",
      placeholder: "UA",
      autoCapitalize: "characters",
      "aria-label": "Airline",
      onChange: (e) => set({ air: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3) }),
      style: { ...bare, fontFamily: SANS, fontWeight: 700, fontSize: 16, letterSpacing: "0.1em" }
    }
  )), /* @__PURE__ */ React50.createElement("div", { style: cap }, "Airline")), /* @__PURE__ */ React50.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React50.createElement("div", { style: box2 }, /* @__PURE__ */ React50.createElement(
    "input",
    {
      value: leg.num || "",
      inputMode: "numeric",
      placeholder: "1885",
      "aria-label": "Flight number",
      onChange: (e) => set({ num: e.target.value.replace(/\D/g, "").slice(0, 4) }),
      style: { ...bare, fontFamily: SANS, fontWeight: 700, fontSize: 16 }
    }
  )), /* @__PURE__ */ React50.createElement("div", { style: cap }, "Flight no.")), /* @__PURE__ */ React50.createElement("div", { className: "fd-flight-time", style: { minWidth: 0 } }, /* @__PURE__ */ React50.createElement("div", { style: box2 }, /* @__PURE__ */ React50.createElement(
    "input",
    {
      type: "time",
      value: leg.time || "",
      onChange: (e) => set({ time: e.target.value }),
      "aria-label": dir === "out" ? "Departure time" : "Landing time",
      style: {
        ...bare,
        fontFamily: SANS,
        fontWeight: 700,
        fontSize: 16,
        color: leg.time ? "var(--ink)" : "var(--muted)"
      }
    }
  )), /* @__PURE__ */ React50.createElement("div", { style: cap }, dir === "out" ? "Takes off" : "Lands"))));
}
function FlightPass({ leg: raw, dir, small, edit, setLeg, person = null, codeless = false }) {
  if (edit) return /* @__PURE__ */ React50.createElement(FlightEntry, { leg: raw, dir, setLeg });
  const leg = cleanLeg(raw);
  if (!leg) return null;
  if (leg.note) return /* @__PURE__ */ React50.createElement("div", { className: "fd-flight-pass is-note" }, person, /* @__PURE__ */ React50.createElement("span", { className: "fd-flight-pass-note" }, leg.note));
  const t = legTime(leg.time);
  return /* @__PURE__ */ React50.createElement("div", { className: `fd-flight-pass${small ? " is-small" : ""}` }, /* @__PURE__ */ React50.createElement("span", { className: "fd-flight-pass-who" }, person || /* @__PURE__ */ React50.createElement(Icon, { name: "plane", size: small ? 16 : 18, lit: true })), !codeless && /* @__PURE__ */ React50.createElement("span", { className: "fd-flight-pass-code" }, leg.air && /* @__PURE__ */ React50.createElement("small", null, leg.air), leg.num && /* @__PURE__ */ React50.createElement("b", null, leg.num)), /* @__PURE__ */ React50.createElement("span", { className: "fd-flight-pass-when" }, t && /* @__PURE__ */ React50.createElement("b", null, t), /* @__PURE__ */ React50.createElement("small", null, dir === "out" ? "Leaves Sun" : "Lands Fri")));
}
function LegField({ lb, dir, leg, setLeg }) {
  const filled = leg && (leg.air || leg.num || leg.time);
  return /* @__PURE__ */ React50.createElement("div", { style: { marginBottom: 12 } }, /* @__PURE__ */ React50.createElement("div", { style: { display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 } }, /* @__PURE__ */ React50.createElement("span", { style: label }, lb), filled && /* @__PURE__ */ React50.createElement("button", { onClick: () => setLeg(null), style: {
    marginLeft: "auto",
    background: "none",
    border: "none",
    cursor: "pointer",
    minHeight: 44,
    minWidth: 44,
    padding: 0,
    fontFamily: SANS,
    fontWeight: 700,
    fontSize: 12,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "var(--muted)"
  } }, "Clear")), /* @__PURE__ */ React50.createElement(FlightPass, { leg, dir, edit: true, setLeg }));
}
function TravelLists() {
  return /* @__PURE__ */ React50.createElement("datalist", { id: "fd-airlines" }, AIRLINES.map((a) => /* @__PURE__ */ React50.createElement("option", { key: a, value: a })));
}
function SizeRow({ lb, value, onPick, allowClear }) {
  return /* @__PURE__ */ React50.createElement("div", { style: { marginBottom: 12 } }, /* @__PURE__ */ React50.createElement("div", { style: { ...label, marginBottom: 6 } }, lb), /* @__PURE__ */ React50.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 5 } }, SIZES.map((sz) => /* @__PURE__ */ React50.createElement(
    "button",
    {
      key: sz,
      onClick: () => onPick(allowClear && value === sz ? null : sz),
      "aria-label": `${lb}: ${sz}`,
      "aria-pressed": value === sz,
      style: {
        fontFamily: SANS,
        fontWeight: 700,
        fontSize: 13,
        height: 48,
        padding: 0,
        borderRadius: 10,
        cursor: "pointer",
        background: value === sz ? `var(--selection-fill, ${GOLD_GRAD})` : "var(--paper2)",
        color: value === sz ? "var(--ink0)" : "var(--ink)",
        border: value === sz ? "1.5px solid var(--ink0)" : "1.5px solid var(--line)"
      }
    },
    sz
  ))));
}
function TravelFields({ booked, setBooked, flightIn, setFlightIn, flightOut, setFlightOut }) {
  const opt = (on) => ({
    fontFamily: SANS,
    fontWeight: 700,
    fontSize: 14,
    height: 48,
    padding: 0,
    borderRadius: 10,
    cursor: "pointer",
    background: on ? `var(--selection-fill, ${GOLD_GRAD})` : "var(--paper2)",
    color: on ? "var(--ink0)" : "var(--ink)",
    border: on ? "1.5px solid var(--ink0)" : "1.5px solid var(--line)"
  });
  return /* @__PURE__ */ React50.createElement("div", null, /* @__PURE__ */ React50.createElement(TravelLists, null), /* @__PURE__ */ React50.createElement("div", { style: {
    fontFamily: SANS,
    fontWeight: 600,
    fontSize: 15,
    color: "var(--ink)",
    marginBottom: 8
  } }, "Booked your flights?"), /* @__PURE__ */ React50.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 14 } }, /* @__PURE__ */ React50.createElement("button", { onClick: () => setBooked(true), "aria-pressed": booked === true, style: opt(booked === true) }, "Yes"), /* @__PURE__ */ React50.createElement(
    "button",
    {
      onClick: () => {
        setBooked(false);
        setFlightIn(null);
        setFlightOut(null);
      },
      "aria-pressed": booked === false,
      style: opt(booked === false)
    },
    "Not yet"
  )), booked === true && /* @__PURE__ */ React50.createElement(React50.Fragment, null, /* @__PURE__ */ React50.createElement(LegField, { lb: "Landing Friday", dir: "in", leg: flightIn, setLeg: setFlightIn }), /* @__PURE__ */ React50.createElement(LegField, { lb: "Leaving Sunday", dir: "out", leg: flightOut, setLeg: setFlightOut })), booked === false && /* @__PURE__ */ React50.createElement("div", { style: {
    fontFamily: SANS,
    fontSize: 13.5,
    color: "var(--muted2)",
    lineHeight: 1.55,
    marginBottom: 12
  } }, "Once you book, tap your player icon in the header to add your flights."));
}
var geo, US_LL, inUS, US_DOTS, TRAVEL_CITIES, TRAVEL_DEST, CARD;
var init_Travel = __esm({
  "src/features/travel/Travel.jsx"() {
    init_Icon();
    init_core();
    init_guestSetup();
    init_theme();
    init_controls();
    init_travel();
    geo = (lon, lat) => [(lon + 125) / 55 * 100, (49 - lat) / 24 * 100];
    US_LL = [
      [-124.7, 48.4],
      [-124.2, 43.3],
      [-122.4, 37.8],
      [-120.6, 34.5],
      [-117.1, 32.5],
      [-114.7, 32.7],
      [-111, 31.3],
      [-108.2, 31.3],
      [-106.5, 31.8],
      [-104.5, 29.7],
      [-103, 29],
      [-99.1, 26.4],
      [-97.1, 25.9],
      [-95, 29],
      [-93.8, 29.7],
      [-91, 29.2],
      [-89, 29.2],
      [-88, 30.3],
      [-85, 29.7],
      [-84, 30],
      [-82.8, 27.9],
      [-82, 26.5],
      [-80.4, 25.2],
      [-80.1, 27],
      [-81.4, 30.7],
      [-79.2, 33],
      [-77, 35],
      [-75.5, 37],
      [-75.5, 39],
      [-74, 40.5],
      [-71.5, 41.3],
      [-70, 42],
      [-70.7, 43.5],
      [-67, 44.8],
      [-71.5, 45],
      [-76, 44],
      [-79, 43.3],
      [-83, 42],
      [-83.5, 45.8],
      [-88, 48.2],
      [-95, 49],
      [-104, 49],
      [-117, 49]
    ].map(([lo, la]) => geo(lo, la));
    inUS = (x, y) => {
      let hit = false;
      for (let i = 0, j = US_LL.length - 1; i < US_LL.length; j = i++) {
        const [xi, yi] = US_LL[i], [xj, yj] = US_LL[j];
        if (yi > y !== yj > y && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit;
      }
      return hit;
    };
    US_DOTS = (() => {
      const step = 2.6, out = [];
      for (let y = 1; y < 100; y += step)
        for (let x = 1; x < 100; x += step) if (inUS(x, y)) out.push([x, y]);
      return out;
    })();
    TRAVEL_CITIES = [
      { n: "San Francisco", ll: [-122.4, 37.8], dx: 3.6, dy: -4.2, a: "start" },
      { n: "San Diego", ll: [-117.2, 32.7], dx: -1, dy: 6.6, a: "middle" },
      { n: "Tulsa", ll: [-96, 36.2], dx: 0, dy: -4.6, a: "middle" },
      { n: "Dallas", ll: [-96.8, 32.8], dx: 4, dy: 1.2, a: "start" },
      { n: "Austin", ll: [-97.7, 30.3], dx: -4, dy: 1.2, a: "end" },
      { n: "Baton Rouge", ll: [-91.2, 30.5], dx: 4, dy: 1.2, a: "start" },
      { n: "New York", ll: [-74, 40.7], dx: -4.5, dy: -4.6, a: "end" }
    ].map((c) => {
      const [x, y] = geo(...c.ll);
      return { ...c, x, y };
    });
    TRAVEL_DEST = (() => {
      const [x, y] = geo(-111.9, 33.5);
      return { x, y };
    })();
    CARD = {
      background: "var(--paper)",
      border: "1px solid var(--line)",
      borderRadius: 14,
      marginBottom: 12,
      overflow: "hidden"
    };
  }
});

// src/features/teams/teams.css
var init_teams = __esm({
  "src/features/teams/teams.css"() {
  }
});

// src/features/teams/RenameText.jsx
import React53, { useEffect as useEffect32, useLayoutEffect as useLayoutEffect12, useState as useState41 } from "react";
function RenameText({ name, as: Tag2 = "span", className = "", style, children }) {
  const change = useFreshChange(name);
  const [flash, setFlash] = useState41(0);
  useLayoutEffect12(() => {
    if (change.animate) setFlash(change.changeId);
  }, [change.changeId]);
  useEffect32(() => {
    if (!flash) return void 0;
    const timer = setTimeout(() => setFlash(0), RELETTER_MS + 200);
    return () => clearTimeout(timer);
  }, [flash]);
  return /* @__PURE__ */ React53.createElement(
    Tag2,
    {
      key: flash || "rest",
      className: `${className}${flash ? " fd-relettered" : ""}`.trim() || void 0,
      style
    },
    children ?? name
  );
}
var RELETTER_MS;
var init_RenameText = __esm({
  "src/features/teams/RenameText.jsx"() {
    init_motion();
    init_teams();
    RELETTER_MS = 900;
  }
});

// src/ui/Coin.jsx
import React54 from "react";
function Coin({ p = null, color = null, unlit = false, className = "", children }) {
  const identity = usePlayerIdentity(p);
  const tone = unlit ? null : color || identity.color;
  return /* @__PURE__ */ React54.createElement(
    "span",
    {
      className: `fd-coin3d${unlit ? " is-unlit" : ""}${className ? ` ${className}` : ""}`,
      "aria-hidden": "true",
      style: tone ? { "--coin-color": tone } : void 0
    },
    Array.from({ length: COIN_EDGE_LAYERS2 }, (_, i) => /* @__PURE__ */ React54.createElement("span", { key: i, className: "fd-coin3d-edge", style: { "--z": i + 1 } })),
    /* @__PURE__ */ React54.createElement("span", { className: "fd-coin3d-face" }, children)
  );
}
var COIN_EDGE_LAYERS2;
var init_Coin = __esm({
  "src/ui/Coin.jsx"() {
    init_PlayerIdentityContext();
    COIN_EDGE_LAYERS2 = 5;
  }
});

// src/features/wagers/wagers.css
var init_wagers = __esm({
  "src/features/wagers/wagers.css"() {
  }
});

// src/features/wagers/Wagers.jsx
import React55, { useEffect as useEffect33, useLayoutEffect as useLayoutEffect13, useMemo as useMemo9, useRef as useRef34, useState as useState42 } from "react";
function wagerPickLabel(state, w, events) {
  const ev = events.find((e) => e.id === w.eventId);
  const evName = ev?.name || "removed event";
  const pickName = w.pickTeam || w.pickPlayers?.length > 1 ? teamLabel(state, { players: w.pickPlayers }) : disp(state, w.pickPlayers ? w.pickPlayers[0] : w.pick);
  if (w.kind === "outright") return { pick: pickName, ctx: `to win ${evName}` };
  if (w.kind === "match") return { pick: pickName, ctx: `to win the ${w.matchName || "matchup"} in ${evName}` };
  if (w.kind === "heat") return { pick: pickName, ctx: `to win ${w.groupName || "the heat"} in ${evName}` };
  if (w.final) return { pick: pickName, ctx: `to win the Final in ${evName}` };
  return { pick: pickName, ctx: `to advance from ${w.groupName} in ${evName}` };
}
function mergeWagerLines(list) {
  const key = ({ w, r }) => [
    w.player,
    r.status,
    w.kind,
    w.eventId,
    w.kind === "outright" ? (w.pickTeam ? "t:" + w.drawId + ":" + (w.pickPlayers || []).join("+") : "p:" + w.pick) + ":x" + wagerMult(w) : w.kind === "match" ? "m:" + w.drawId + ":" + (w.match || []).join("-") + ":" + w.teamIdx : "s:" + w.stagesId + ":" + (w.final ? "F" : w.group) + ":" + w.pickKey
  ].join("|");
  const out = /* @__PURE__ */ new Map();
  for (const x of list) {
    const k = key(x), cur = out.get(k);
    if (!cur) out.set(k, { w: { ...x.w, ids: [x.w.id] }, r: { ...x.r } });
    else {
      cur.w.stake += x.w.stake;
      cur.w.ids.push(x.w.id);
      if (typeof x.r.delta === "number") cur.r.delta = (cur.r.delta || 0) + x.r.delta;
    }
  }
  return [...out.values()];
}
function MarketPick({
  state,
  me,
  players,
  name,
  bets,
  marketOpen,
  canPick,
  onPick,
  onRetract,
  onPlayer,
  roleLabel,
  unavailableReason,
  unavailableLabel = "Opponent",
  tapStake,
  capLabel,
  capReason,
  winLine,
  winSlot = false,
  lines = 2,
  named = false
}) {
  const [pendingAction, setPendingAction] = useState42(null);
  const [actionError, setActionError] = useState42(null);
  const [checking, setChecking] = useState42(null);
  const pendingRef = useRef34(false);
  const pendingKindRef = useRef34(null), queueRef = useRef34([]);
  const [queued, setQueued] = useState42(0);
  const wellRef = useRef34(null), mineRef = useRef34(null), flightRef = useRef34(null);
  const mine = bets.filter((x) => x.w.player === me).sort((a, b) => {
    const latest = ({ w }) => w.chips?.[w.chips.length - 1]?.ts || w.updatedAt || w.ts || 0;
    return latest(a) - latest(b);
  });
  const mineTotal = mine.reduce((total, x) => total + x.w.stake, 0);
  const chip2 = lines === 1 ? ROW_CHIP : PHONE_CHIP;
  const live2 = useRef34({ state, mineTotal });
  live2.current = { state, mineTotal };
  const mineChips = mine.flatMap(({ w }) => w.chips?.length ? w.chips.map((chip3) => chip3.stake) : [w.stake]);
  const otherStacks = orderStacks(bets.filter((x) => x.w.player !== me).map(({ w }) => ({ player: w.player, stake: w.stake })));
  const sideTotal = mineTotal + stacksTotal(otherStacks);
  const landed = (kind, before, total) => kind === "place" ? total > before : total < before;
  const shownTotal = useRef34(mineTotal);
  useEffect33(() => {
    if (shownTotal.current === mineTotal) return;
    shownTotal.current = mineTotal;
    setActionError(null);
  }, [mineTotal]);
  const alive = useRef34(true);
  useEffect33(() => () => {
    alive.current = false;
    flightRef.current?.cancel();
  }, []);
  useEffect33(() => {
    if (!checking || checking.settled || state === checking.state) return;
    if (!landed(checking.kind, checking.before, mineTotal)) {
      setActionError(checking.kind === "place" ? "Not placed" : "Not removed");
      checking.flight?.back();
    } else checking.flight?.land();
    pendingRef.current = false;
    setChecking(null);
  }, [state, mineTotal, checking]);
  const mineFace = () => mineRef.current?.querySelector(".fd-stack > svg")?.getBoundingClientRect() || null;
  const placeFlight = () => {
    if (!me || typeof document === "undefined" || prefersReducedMotion()) return null;
    const source = flightTarget(`bets:rack:${tapStake}`);
    const face = mineFace();
    const anchor = face || mineRef.current?.getBoundingClientRect() || wellRef.current?.getBoundingClientRect();
    if (!source || !anchor) return null;
    let release = () => {
    };
    const hold = new Promise((resolve) => {
      release = resolve;
    });
    try {
      source.animate(
        [{ transform: "scale(1)" }, { transform: "scale(.9)" }, { transform: "scale(1)" }],
        { duration: MOTION.fast * 2, easing: EASE.out }
      );
    } catch {
    }
    fly(source, hoverRect(anchor, chip2, face ? 10 : 6), {
      node: /* @__PURE__ */ React55.createElement(BankChip, { p: me, size: 46, val: tapStake }),
      arc: 64,
      hold
    });
    let settled = false;
    const finish = (next) => {
      if (!settled) {
        settled = true;
        release(next);
      }
    };
    return {
      /* the state is already painted when the ack lands; wait one frame so
         the new stack is measured, then drop onto it */
      land: () => requestAnimationFrame(() => {
        const now2 = mineFace();
        const onLand = () => playSound("chipLand");
        if (now2) finish({ to: faceRect(now2), duration: MOTION.fast, settle: true, onLand });
        else if (mineRef.current) finish({ to: mineRef.current, duration: MOTION.fast * 1.5, land: true, onLand });
        else finish(null);
      }),
      back: () => finish({ to: flightTarget(`bets:rack:${tapStake}`) || source, arc: 40, duration: MOTION.flight }),
      cancel: () => finish(null)
    };
  };
  const retractFlight = () => {
    if (!me || typeof document === "undefined" || prefersReducedMotion()) return null;
    const face = mineFace();
    const from = face ? faceRect(face) : mineRef.current?.getBoundingClientRect();
    if (!from) return null;
    const value = mineChips[mineChips.length - 1];
    return {
      land: () => {
        const to = flightTarget(rackTargetFor(value, RACK_DENOMS, tapStake));
        if (to) fly(from, to, { node: /* @__PURE__ */ React55.createElement(BankChip, { p: me, size: Math.round(from.width), val: value }), arc: 48, land: true });
      },
      back: () => {
      },
      cancel: () => {
      }
    };
  };
  const chipSound = (kind) => {
    unlockSound();
    playSound(
      kind === "place" ? capLabel ? "S7" : "S5" : "S6",
      { opts: { denom: tapStake, height: Array.isArray(mineChips) ? mineChips.length : 0 } }
    );
  };
  const act = (kind, callback, queuedTap = false) => {
    if (pendingRef.current) {
      if (kind === "place" && pendingKindRef.current === "place" && !queuedTap && queueRef.current.length < PLACE_QUEUE) {
        tapTick();
        chipSound(kind);
        queueRef.current.push(callback);
        setQueued(queueRef.current.length);
      }
      return;
    }
    if (!queuedTap) tapTick();
    if (!queuedTap) chipSound(kind);
    pendingRef.current = true;
    pendingKindRef.current = kind;
    const before = live2.current.mineTotal;
    setPendingAction(kind);
    setActionError(null);
    const flight = kind === "place" ? placeFlight() : retractFlight();
    flightRef.current = flight;
    let holding = false, saved2 = false;
    const finish = () => {
      if (!holding) {
        pendingRef.current = false;
        pendingKindRef.current = null;
      }
      setPendingAction(null);
      const next = saved2 && !holding && alive.current ? queueRef.current.shift() : null;
      if (!next) queueRef.current = [];
      setQueued(queueRef.current.length);
      if (next) act("place", next, true);
    };
    const check = (result) => {
      if (isUncertainResult(result)) {
        if (!landed(kind, before, live2.current.mineTotal)) {
          holding = true;
          const settled = typeof result?.settled?.then === "function";
          setChecking({ kind, before, state: live2.current.state, settled, flight });
          if (settled) result.settled.then((outcome) => outcome, () => ({ ok: false })).then((outcome) => {
            if (!alive.current) return;
            if (outcome?.ok === true) {
              haptic(kind === "place" ? "place" : "retract");
              flight?.land();
            } else if (!landed(kind, before, live2.current.mineTotal)) {
              setActionError(kind === "place" ? "Not placed" : "Not removed");
              playSound("S26");
              flight?.back();
            } else flight?.land();
            pendingRef.current = false;
            setChecking(null);
          });
        } else flight?.land();
        return result;
      }
      if (result?.ok === false) {
        setActionError(result.error || "Bet not saved.");
        playSound("S26");
        flight?.back();
      } else if (result?.ok === true) {
        saved2 = true;
        haptic(kind === "place" ? "place" : "retract");
        flight?.land();
      } else flight?.cancel();
      return result;
    };
    const fail = (error) => {
      const message = error?.message || "Bet not saved.";
      setActionError(message);
      playSound("S26");
      flight?.back();
      return { ok: false, error: message };
    };
    try {
      const result = callback();
      if (result?.then) return Promise.resolve(result).then(check, fail).finally(finish);
      const checked = check(result);
      finish();
      return checked;
    } catch (error) {
      finish();
      return fail(error);
    }
  };
  const busyKind = pendingAction || checking?.kind || null;
  const everyone = orderStacks([...otherStacks, ...mineTotal > 0 ? [{ player: me, stake: mineTotal }] : []]);
  const [listOpen, setListOpen] = useState42(false);
  const showWell = !unavailableReason && marketOpen && players.length > 0;
  const shownRows = lines === 1 ? [] : backerRows(everyone, me);
  const more = everyone.length - shownRows.length;
  const winInline = lines === 1 && players.length === 1;
  const namePrefix = `Win: ${name} `;
  const inlineLine = winInline && winLine?.text?.startsWith(namePrefix) ? { ...winLine, text: `Win ${winLine.text.slice(namePrefix.length)}` } : winLine;
  const busyPlace = !!busyKind && !(pendingAction === "place" && !checking && queued < PLACE_QUEUE);
  const placeButton = showWell && /* @__PURE__ */ React55.createElement(
    "button",
    {
      type: "button",
      ref: wellRef,
      className: `fd-wagers-place${capLabel != null ? " is-capped" : ""}`,
      disabled: !canPick || busyPlace,
      onClick: () => act("place", onPick),
      "aria-label": canPick ? `Place a chip on ${name}` : name,
      "aria-description": unavailableReason || capReason || (canPick ? `Add ${fmt6(tapStake)} chips` : void 0)
    },
    /* @__PURE__ */ React55.createElement(Icon, { name: "plus", size: lines === 1 ? 18 : 20 }),
    capLabel !== "" && /* @__PURE__ */ React55.createElement("span", null, capLabel || fmt6(tapStake))
  );
  const retract = () => act("remove", () => onRetract(mine[mine.length - 1].w.id));
  const backerRow = (item) => {
    const you = item.player === me;
    const body = /* @__PURE__ */ React55.createElement(React55.Fragment, null, /* @__PURE__ */ React55.createElement(Avatar, { state, p: item.player, size: 24 }), /* @__PURE__ */ React55.createElement("span", { className: "fd-wagers-backer-name" }, you ? "You" : disp(state, item.player)), /* @__PURE__ */ React55.createElement("span", { className: "fd-wagers-backer-amount" }, fmt6(item.stake)), you && marketOpen && /* @__PURE__ */ React55.createElement(Icon, { name: "undo", size: 16, className: "fd-wagers-backer-back" }));
    if (you) return marketOpen ? /* @__PURE__ */ React55.createElement("li", { key: item.player }, /* @__PURE__ */ React55.createElement(
      "button",
      {
        type: "button",
        className: "fd-wagers-backer is-you",
        disabled: !!busyKind,
        onClick: retract,
        "aria-label": `Retract your last chip on ${name}`,
        "aria-description": `Remove ${fmt6(mineChips[mineChips.length - 1])} chips; ${fmt6(mineTotal)} total on this pick`
      },
      body
    )) : /* @__PURE__ */ React55.createElement("li", { key: item.player }, /* @__PURE__ */ React55.createElement("span", { className: "fd-wagers-backer is-you", role: "img", "aria-label": `${fmt6(mineTotal)} of your chips on ${name}` }, body));
    return /* @__PURE__ */ React55.createElement("li", { key: item.player }, /* @__PURE__ */ React55.createElement(
      "button",
      {
        type: "button",
        className: "fd-wagers-backer",
        disabled: !onPlayer,
        onClick: () => onPlayer?.(item.player),
        "aria-label": `View ${disp(state, item.player)}'s player card (${fmt6(item.stake)} chips)`
      },
      body
    ));
  };
  const potStack = /* @__PURE__ */ React55.createElement(
    ChipStack,
    {
      chip: POT_CHIP,
      count: stackChipCount(sideTotal),
      size: lines === 1 ? ROW_CHIP : PHONE_CHIP,
      cap: STACK_CAP,
      tag: false,
      tower: true
    }
  );
  const pot = /* @__PURE__ */ React55.createElement("span", { ref: mineRef, className: `fd-wagers-pot-stack${sideTotal > 0 ? "" : " is-empty"}`, "aria-hidden": "true" }, sideTotal > 0 && potStack);
  const faceOnly = players.length > 3 || (lines === 1 && players.length > 2 || named) && players.some((player) => disp(state, player).length > (named ? 10 : 8));
  return /* @__PURE__ */ React55.createElement("div", { className: `fd-wagers-pick${lines === 1 ? " is-one-line" : ""}${mineTotal ? " is-mine" : ""}${roleLabel ? " is-your-side" : ""}${unavailableReason ? " is-unavailable" : ""}${busyKind ? ` is-pending-${busyKind}` : ""}` }, /* @__PURE__ */ React55.createElement("div", { className: `fd-wagers-pick-identity${players.length > 2 || named ? " is-team" : ""}` }, players.length === 1 ? /* @__PURE__ */ React55.createElement(
    "button",
    {
      type: "button",
      className: "fd-wagers-player",
      disabled: !onPlayer,
      onClick: () => onPlayer?.(players[0]),
      "aria-label": `View ${name}'s player card`
    },
    /* @__PURE__ */ React55.createElement(Avatar, { state, p: players[0], size: lines === 1 ? 34 : 26 }),
    winInline ? /* @__PURE__ */ React55.createElement("span", { className: "fd-wagers-player-text" }, /* @__PURE__ */ React55.createElement("span", null, name), /* @__PURE__ */ React55.createElement(WinLine, { line: inlineLine, className: "fd-wagers-win-inline" })) : /* @__PURE__ */ React55.createElement("span", null, name)
  ) : /* @__PURE__ */ React55.createElement(React55.Fragment, null, (players.length > 2 || named) && /* @__PURE__ */ React55.createElement(RenameText, { name, className: `fd-wagers-team-name${name.length > 16 ? " is-long" : ""}` }), /* @__PURE__ */ React55.createElement(
    "span",
    {
      className: `fd-wagers-team-players${faceOnly ? " is-many" : ""}`,
      style: faceOnly ? { "--fd-team-n": players.length } : void 0
    },
    players.map((player) => /* @__PURE__ */ React55.createElement(
      "button",
      {
        type: "button",
        key: player,
        disabled: !onPlayer,
        onClick: () => onPlayer?.(player),
        title: disp(state, player),
        "aria-label": `View ${disp(state, player)}'s player card`
      },
      /* @__PURE__ */ React55.createElement(Avatar, { state, p: player, size: 24 }),
      !faceOnly && /* @__PURE__ */ React55.createElement("span", null, disp(state, player))
    ))
  ))), winSlot && !winInline && /* @__PURE__ */ React55.createElement("div", { className: "fd-wagers-win-slot" }, /* @__PURE__ */ React55.createElement(WinLine, { line: winLine, className: "fd-wagers-win" })), lines === 1 ? /* @__PURE__ */ React55.createElement(
    "div",
    {
      className: "fd-wagers-pot is-row",
      role: "group",
      "aria-label": `Bets on ${name}`,
      "aria-busy": !!busyKind,
      "aria-description": unavailableReason || void 0
    },
    roleLabel && /* @__PURE__ */ React55.createElement("span", { className: "fd-wagers-pick-role" }, roleLabel),
    /* @__PURE__ */ React55.createElement("span", { ref: mineRef, className: `fd-wagers-pot-total${sideTotal > 0 ? "" : " is-empty"}` }, sideTotal > 0 ? fmt6(sideTotal) : null),
    /* @__PURE__ */ React55.createElement("span", { className: "fd-wagers-pot-who" }, mineTotal > 0 ? marketOpen ? /* @__PURE__ */ React55.createElement(
      "button",
      {
        type: "button",
        className: "fd-wagers-pot-you",
        disabled: !!busyKind,
        onClick: retract,
        "aria-label": `Retract your last chip on ${name}`,
        "aria-description": `Remove ${fmt6(mineChips[mineChips.length - 1])} chips; ${fmt6(mineTotal)} total on this pick`
      },
      /* @__PURE__ */ React55.createElement(Icon, { name: "undo", size: 14 }),
      fmt6(mineTotal)
    ) : /* @__PURE__ */ React55.createElement("span", { className: "fd-wagers-pot-you", role: "img", "aria-label": `${fmt6(mineTotal)} of your chips on ${name}` }, fmt6(mineTotal)) : everyone.length > 0 && /* @__PURE__ */ React55.createElement(
      "button",
      {
        type: "button",
        className: "fd-wagers-pot-count",
        onClick: () => setListOpen(true),
        "aria-label": `${everyone.length} backing ${name}`
      },
      /* @__PURE__ */ React55.createElement(Icon, { name: "people", size: 14 }),
      everyone.length
    )),
    placeButton
  ) : /* @__PURE__ */ React55.createElement(
    "div",
    {
      className: "fd-wagers-pot",
      role: "group",
      "aria-label": `Bets on ${name}`,
      "aria-busy": !!busyKind,
      "aria-description": unavailableReason || void 0
    },
    /* @__PURE__ */ React55.createElement("div", { className: "fd-wagers-pot-head" }, pot, sideTotal > 0 && /* @__PURE__ */ React55.createElement("span", { className: "fd-wagers-pot-total" }, fmt6(sideTotal)), roleLabel && /* @__PURE__ */ React55.createElement("span", { className: "fd-wagers-pick-role" }, roleLabel)),
    shownRows.length ? /* @__PURE__ */ React55.createElement("ol", { className: "fd-wagers-backers" }, shownRows.map(backerRow)) : /* @__PURE__ */ React55.createElement("div", { className: `fd-wagers-seat${showWell ? " is-open" : ""}`, "aria-hidden": "true" }, /* @__PURE__ */ React55.createElement("i", null)),
    /* @__PURE__ */ React55.createElement("div", { className: "fd-wagers-backers-more" }, more > 0 && /* @__PURE__ */ React55.createElement(
      "button",
      {
        type: "button",
        onClick: () => setListOpen(true),
        "aria-label": `All ${everyone.length} backing ${name}`
      },
      more,
      " more"
    )),
    /* @__PURE__ */ React55.createElement("div", { className: "fd-wagers-place-slot" }, placeButton)
  ), checking && /* @__PURE__ */ React55.createElement("p", { className: "fd-wagers-pick-checking", role: "status" }, "Checking\u2026"), actionError && !checking && /* @__PURE__ */ React55.createElement("p", { className: "fd-wagers-pick-error", role: "alert" }, actionError), listOpen && /* @__PURE__ */ React55.createElement(Sheet, { title: name, onClose: () => setListOpen(false), className: "fd-wagers-backers-sheet" }, /* @__PURE__ */ React55.createElement("div", { className: "fd-wagers-pot-head is-sheet" }, /* @__PURE__ */ React55.createElement("span", { className: "fd-wagers-pot-stack", "aria-hidden": "true" }, sideTotal > 0 && potStack), /* @__PURE__ */ React55.createElement("span", { className: "fd-wagers-pot-total" }, fmt6(sideTotal))), /* @__PURE__ */ React55.createElement("ol", { className: "fd-wagers-backers is-all" }, everyone.map(backerRow))));
}
function backerRows(everyone = [], me = null, rows = BACKER_ROWS) {
  if (everyone.length <= rows) return everyone;
  const top = everyone.slice(0, rows);
  const mine = me ? everyone.find((item) => item.player === me) : null;
  return mine && !top.includes(mine) ? [...top.slice(0, rows - 1), mine] : top;
}
function SettleStrip({ me, settling }) {
  const { view, label: label2 } = settling;
  return /* @__PURE__ */ React55.createElement(
    "section",
    {
      className: "fd-wagers-settle",
      role: "status",
      "aria-label": `${label2} settled: ${fmt6(view.paid)} paid, ${fmt6(view.lost)} lost`
    },
    /* @__PURE__ */ React55.createElement("h2", null, label2),
    /* @__PURE__ */ React55.createElement("div", { className: "fd-wagers-settle-row", "aria-hidden": "true" }, view.winners.length > 0 && /* @__PURE__ */ React55.createElement("div", { className: "fd-wagers-settle-zone is-won" }, /* @__PURE__ */ React55.createElement("strong", null, "+", fmt6(view.paid)), /* @__PURE__ */ React55.createElement(BetStacks, { stacks: view.winners, size: 24, delay: 900, mine: me })), view.losers.length > 0 && /* @__PURE__ */ React55.createElement("div", { className: "fd-wagers-settle-zone is-lost" }, /* @__PURE__ */ React55.createElement("strong", null, "\u2212", fmt6(view.lost)), /* @__PURE__ */ React55.createElement(BetStacks, { stacks: view.losers, size: 24, delay: 450, mine: me })))
  );
}
function RackChip({ value, me, disabled, selected, onClick }) {
  const target = useFlightTarget(`bets:rack:${value}`);
  return /* @__PURE__ */ React55.createElement(
    "button",
    {
      type: "button",
      ref: target,
      disabled,
      onClick,
      "data-fly-coin": "",
      "aria-pressed": selected,
      "aria-label": `Bet ${value} a tap`,
      className: selected ? "is-selected" : disabled ? "is-unlit" : ""
    },
    /* @__PURE__ */ React55.createElement(Coin, { p: me, unlit: disabled }, disabled ? /* @__PURE__ */ React55.createElement(UnlitChip, { value }) : /* @__PURE__ */ React55.createElement(BankChip, { p: me, size: 46, val: value }))
  );
}
function UnlitChip({ value }) {
  const ticks = Array.from({ length: 8 }, (_, i) => i * 45);
  return /* @__PURE__ */ React55.createElement("svg", { className: "fd-wagers-unlit", viewBox: "0 0 46 46", width: "46", height: "46", "aria-hidden": "true", focusable: "false" }, /* @__PURE__ */ React55.createElement("circle", { cx: "23", cy: "23", r: "21.5", className: "fd-wagers-unlit-body" }), ticks.map((angle) => /* @__PURE__ */ React55.createElement(
    "rect",
    {
      key: angle,
      x: "21",
      y: "2.5",
      width: "4",
      height: "7",
      rx: "1",
      className: "fd-wagers-unlit-tick",
      transform: `rotate(${angle} 23 23)`
    }
  )), /* @__PURE__ */ React55.createElement("circle", { cx: "23", cy: "23", r: "12.5", className: "fd-wagers-unlit-face" }), /* @__PURE__ */ React55.createElement("text", { x: "23", y: "23", className: "fd-wagers-unlit-value", textAnchor: "middle", dominantBaseline: "central" }, value));
}
function HeldBoard({ state, me, held, view, onSkip }) {
  const mineRef = useRef34(null);
  useStageHold(`bets:held:${held.id}`, true);
  const paid = (view.sides.find((side) => side.won)?.stacks || []).filter((item) => item.player === me).reduce((sum, item) => sum + item.paid, 0);
  useEffect33(() => {
    if (!me || paid <= 0) return void 0;
    const timer = setTimeout(() => {
      const svg = mineRef.current?.querySelector(".fd-stack > svg");
      if (!svg) return;
      const from = faceRect(svg.getBoundingClientRect());
      const count = Math.max(1, Math.min(5, Math.round(paid / PT)));
      for (let i = 0; i < count; i++) fly(from, "tab:home", {
        node: /* @__PURE__ */ React55.createElement(BankChip, { p: me, size: Math.round(from.width), val: PT }),
        delay: i * 70,
        arc: 60,
        duration: 560,
        scale: 0.7,
        fade: true,
        land: i === count - 1
      });
    }, HOME_FLIGHT_AT);
    return () => clearTimeout(timer);
  }, []);
  const { contest, ev, label: label2, winSlot = false } = held;
  const lines = (contest.sides || []).length > 2 ? 1 : 2;
  const sides = contest.kind === "ffa" ? view.sides.filter((side) => side.won || side.stacks.length) : view.sides;
  const nameOf3 = (side) => {
    const drawn = typeof side.key === "number" ? state.draws?.[ev.id]?.teams?.[side.key] : null;
    return side.players.length === 1 ? disp(state, side.players[0]) : teamLabel(state, drawn || { players: side.players });
  };
  return /* @__PURE__ */ React55.createElement("section", { className: "fd-wagers-event fd-wagers-held", onClick: onSkip, "aria-label": `${label2} settled` }, /* @__PURE__ */ React55.createElement("div", { className: "fd-wagers-contest-heading" }, /* @__PURE__ */ React55.createElement("div", null, /* @__PURE__ */ React55.createElement("h2", null, contest.kind === "ffa" ? "Winner" : label2), /* @__PURE__ */ React55.createElement("p", null, contestMult(contest) === 1 ? "Winner pays 1:1" : "Winner pays 2:1"))), /* @__PURE__ */ React55.createElement("div", { className: "fd-wagers-picks" }, sides.map((side) => {
    const head2 = side.won ? side.paid > 0 && /* @__PURE__ */ React55.createElement("span", { className: "fd-wagers-held-head is-up" }, "+", fmt6(side.paid)) : side.total > 0 && /* @__PURE__ */ React55.createElement("span", { className: "fd-wagers-held-head is-down" }, "\u2212", fmt6(side.total));
    return /* @__PURE__ */ React55.createElement("div", { key: String(side.key), className: `fd-wagers-pick fd-wagers-held-side${lines === 1 ? " is-one-line" : ""} ${side.won ? "is-won" : "is-lost"}` }, /* @__PURE__ */ React55.createElement("div", { className: `fd-wagers-pick-identity${side.players.length > 2 ? " is-team" : ""}` }, side.players.length === 1 ? /* @__PURE__ */ React55.createElement("span", { className: "fd-wagers-player" }, /* @__PURE__ */ React55.createElement(Avatar, { state, p: side.players[0], size: 26 }), /* @__PURE__ */ React55.createElement("span", null, nameOf3(side))) : /* @__PURE__ */ React55.createElement(React55.Fragment, null, side.players.length > 2 && /* @__PURE__ */ React55.createElement("span", { className: "fd-wagers-team-name" }, nameOf3(side)), /* @__PURE__ */ React55.createElement(
      "span",
      {
        className: `fd-wagers-team-players${side.players.length > 3 ? " is-many" : ""}`,
        style: side.players.length > 3 ? { "--fd-team-n": side.players.length } : void 0
      },
      side.players.map((player) => /* @__PURE__ */ React55.createElement("span", { key: player, className: "fd-wagers-held-face" }, /* @__PURE__ */ React55.createElement(Avatar, { state, p: player, size: 24 }), side.players.length <= 3 && /* @__PURE__ */ React55.createElement("span", null, disp(state, player))))
    ))), winSlot && !(lines === 1 && side.players.length === 1) && /* @__PURE__ */ React55.createElement("div", { className: "fd-wagers-win-slot" }), /* @__PURE__ */ React55.createElement("div", { className: `fd-wagers-pot is-held${lines === 1 ? " is-row" : ""}` }, /* @__PURE__ */ React55.createElement("div", { className: "fd-wagers-pot-head" }, /* @__PURE__ */ React55.createElement("span", { ref: mineRef, className: `fd-wagers-pot-stack${side.total > 0 ? "" : " is-empty"}`, "aria-hidden": "true" }, side.total > 0 && /* @__PURE__ */ React55.createElement(
      ChipStack,
      {
        chip: POT_CHIP,
        count: stackChipCount(side.total + (side.won ? side.paid : 0)),
        size: lines === 1 ? ROW_CHIP : PHONE_CHIP,
        cap: STACK_CAP,
        tag: false,
        tower: true,
        settle: side.won ? "won" : null,
        delay: 500
      }
    )), head2 || /* @__PURE__ */ React55.createElement("span", { className: "fd-wagers-pot-total is-empty" }, "0"), side.won && /* @__PURE__ */ React55.createElement("span", { className: "fd-wagers-won", "aria-label": "Won" }, "WON")), lines !== 1 && /* @__PURE__ */ React55.createElement("ol", { className: "fd-wagers-backers" }, backerRows(side.stacks, me).map((item, index) => /* @__PURE__ */ React55.createElement("li", { key: item.player }, /* @__PURE__ */ React55.createElement(
      "span",
      {
        className: `fd-wagers-backer${item.player === me ? " is-you" : ""}${side.won ? "" : " is-lost"}`,
        style: side.won ? void 0 : { animationDelay: `${200 + index * 90}ms` }
      },
      /* @__PURE__ */ React55.createElement(Avatar, { state, p: item.player, size: 24 }),
      /* @__PURE__ */ React55.createElement("span", { className: "fd-wagers-backer-name" }, item.player === me ? "You" : disp(state, item.player)),
      /* @__PURE__ */ React55.createElement("span", { className: `fd-wagers-backer-amount${side.won ? " is-up" : ""}` }, side.won ? `+${fmt6(item.paid)}` : fmt6(item.stake))
    )))), lines !== 1 && /* @__PURE__ */ React55.createElement("div", { className: "fd-wagers-backers-more" }, side.stacks.length > BACKER_ROWS && /* @__PURE__ */ React55.createElement("span", null, side.stacks.length - backerRows(side.stacks, me).length, " more"))));
  })));
}
function StackMeter({ pts, cap, bets, duels, room, capBinds = false }) {
  const exposure = bets + duels;
  const scale = Math.max(pts, exposure, cap, 1);
  const at = (value) => Math.max(0, Math.min(100, value / scale * 100));
  const pct = (value) => `${at(value)}%`;
  const betsIn = Math.min(bets, cap), duelsIn = Math.min(duels, Math.max(0, cap - betsIn));
  const over = Math.max(0, exposure - cap);
  const capped = room < PT && pts - exposure >= PT;
  return /* @__PURE__ */ React55.createElement(
    "div",
    {
      className: `fd-wagers-meter${capped ? " is-capped" : ""}${over ? " is-over" : ""}`,
      role: "meter",
      "aria-label": "Chips at risk",
      "aria-valuemin": 0,
      "aria-valuemax": Math.max(cap, exposure),
      "aria-valuenow": exposure,
      "aria-valuetext": `${fmt6(exposure)} at risk, ${fmt6(cap)} maximum, ${fmt6(pts)} in your stack${duels ? `, ${fmt6(duels)} reserved for duels` : ""}`
    },
    /* @__PURE__ */ React55.createElement("div", { className: "fd-wagers-meter-top", "aria-hidden": "true" }, capBinds ? /* @__PURE__ */ React55.createElement("span", { className: "fd-wagers-meter-room is-max" }, /* @__PURE__ */ React55.createElement("strong", null, "Max ", fmt6(cap))) : /* @__PURE__ */ React55.createElement("span", { className: "fd-wagers-meter-room" }, /* @__PURE__ */ React55.createElement("strong", null, fmt6(room)), /* @__PURE__ */ React55.createElement("small", null, "to bet")), exposure > 0 && /* @__PURE__ */ React55.createElement("span", { className: "fd-wagers-meter-down" }, fmt6(exposure), /* @__PURE__ */ React55.createElement("small", null, "in bets"))),
    /* @__PURE__ */ React55.createElement("div", { className: "fd-wagers-meter-bar", "aria-hidden": "true" }, betsIn > 0 && /* @__PURE__ */ React55.createElement("span", { className: "is-bets", style: { left: 0, width: pct(betsIn) } }), duelsIn > 0 && /* @__PURE__ */ React55.createElement("span", { className: "is-duels", style: { left: pct(betsIn), width: pct(duelsIn) } }), over > 0 && /* @__PURE__ */ React55.createElement("span", { className: "is-over", style: { left: pct(cap), width: pct(over) } }), /* @__PURE__ */ React55.createElement("i", { className: "fd-wagers-meter-notch", style: { left: pct(cap) } })),
    /* @__PURE__ */ React55.createElement("div", { className: "fd-wagers-meter-scale", "aria-hidden": "true" }, /* @__PURE__ */ React55.createElement("span", { className: "is-cap", style: { left: `${Math.min(92, Math.max(8, at(cap)))}%` } }, fmt6(cap)), at(cap) <= 72 && /* @__PURE__ */ React55.createElement("span", { className: "is-stack" }, fmt6(pts)))
  );
}
function WagerLine({ x, state, events, gm, manage = false, onVoid, onPlayer }) {
  const { w, r } = x;
  const label2 = wagerPickLabel(state, w, events);
  const win = wagerMult(w) * w.stake;
  const [confirming, setConfirming] = useState42(false), [voiding, setVoiding] = useState42(false);
  const voidBusy = useRef34(false);
  const ids = w.ids || [w.id];
  const voidable = gm && manage && r.status === "pending" && !!onVoid;
  return /* @__PURE__ */ React55.createElement("article", { className: `fd-wagers-line is-${r.status}` }, /* @__PURE__ */ React55.createElement(
    "button",
    {
      type: "button",
      className: "fd-wagers-ledger-player",
      disabled: !onPlayer,
      onClick: () => onPlayer?.(w.player),
      "aria-label": `View ${disp(state, w.player)}'s player card`
    },
    /* @__PURE__ */ React55.createElement(Avatar, { state, p: w.player, size: 32 })
  ), /* @__PURE__ */ React55.createElement("div", { className: "fd-wagers-line-copy" }, /* @__PURE__ */ React55.createElement("span", { className: "fd-wagers-line-bettor" }, /* @__PURE__ */ React55.createElement(
    "button",
    {
      type: "button",
      disabled: !onPlayer,
      onClick: () => onPlayer?.(w.player)
    },
    disp(state, w.player)
  ), " ", /* @__PURE__ */ React55.createElement("span", null, fmt6(w.stake), " chips")), /* @__PURE__ */ React55.createElement("strong", null, label2.pick), /* @__PURE__ */ React55.createElement("span", { className: "fd-wagers-line-context" }, label2.ctx)), /* @__PURE__ */ React55.createElement("div", { className: "fd-wagers-line-result" }, r.status === "pending" && /* @__PURE__ */ React55.createElement(React55.Fragment, null, /* @__PURE__ */ React55.createElement("small", null, "To win"), /* @__PURE__ */ React55.createElement("strong", null, "+", fmt6(win))), r.status === "won" && /* @__PURE__ */ React55.createElement(React55.Fragment, null, /* @__PURE__ */ React55.createElement("small", null, "Won"), /* @__PURE__ */ React55.createElement("strong", null, "+", fmt6(r.delta))), r.status === "lost" && /* @__PURE__ */ React55.createElement(React55.Fragment, null, /* @__PURE__ */ React55.createElement("small", null, "Lost"), /* @__PURE__ */ React55.createElement("strong", null, fmt6(r.delta))), r.status === "void" && /* @__PURE__ */ React55.createElement("small", { className: "is-void" }, "Void"), voidable && !confirming && /* @__PURE__ */ React55.createElement(
    "button",
    {
      type: "button",
      className: "fd-wagers-void",
      onClick: () => setConfirming(true)
    },
    "Void"
  )), voidable && confirming && /* @__PURE__ */ React55.createElement("div", { className: "fd-wagers-void-confirm", role: "group", "aria-label": "Confirm void" }, /* @__PURE__ */ React55.createElement("span", null, disp(state, w.player), ", ", ids.length, " bet", ids.length === 1 ? "" : "s", ", ", fmt6(w.stake), " chips back"), /* @__PURE__ */ React55.createElement("button", { type: "button", className: "is-commit", disabled: voiding, onClick: async () => {
    if (voidBusy.current) return void 0;
    voidBusy.current = true;
    setVoiding(true);
    try {
      const result = await onVoid(ids);
      if (result?.ok !== false) setConfirming(false);
      return result;
    } finally {
      voidBusy.current = false;
      setVoiding(false);
    }
  } }, voiding ? "Voiding\u2026" : `Void ${ids.length === 1 ? "bet" : `${ids.length} bets`}`), /* @__PURE__ */ React55.createElement("button", { type: "button", disabled: voiding, onClick: () => setConfirming(false) }, "Keep")));
}
function contestPick(contest, side, event) {
  const common = {
    eventId: event.id,
    evName: event.name,
    contestId: contest.id,
    contestRevision: contest.revision,
    pickPlayers: [...side.players]
  };
  if (contest.kind === "ffa") {
    const pickTeam2 = typeof side.key === "number";
    return {
      ...common,
      kind: "outright",
      pickTeam: pickTeam2,
      ...pickTeam2 ? { drawId: contest.drawId } : { pick: side.key }
    };
  }
  if (contest.kind === "match") return {
    ...common,
    kind: "match",
    pickTeam: true,
    drawId: contest.drawId,
    match: [...contest.match],
    teamIdx: side.key,
    matchName: contest.label
  };
  const pickTeam = typeof side.key === "number";
  const stage = {
    ...common,
    stagesId: contest.stagesId,
    pickKey: side.key,
    pickTeam,
    ...pickTeam && contest.drawId ? { drawId: contest.drawId } : {}
  };
  return contest.kind === "heat" ? { ...stage, kind: "heat", group: contest.group, groupName: contest.label } : { ...stage, kind: "stage", final: true };
}
function samePick(wager, pick) {
  if (wager.kind !== pick.kind || wager.eventId !== pick.eventId) return false;
  if (wager.contestId && pick.contestId && wager.contestId !== pick.contestId) return false;
  if (pick.kind === "outright") return !!wager.pickTeam === !!pick.pickTeam && (pick.pickTeam ? wager.drawId === pick.drawId && (wager.pickPlayers || []).join("|") === pick.pickPlayers.join("|") : wager.pick === pick.pick);
  if (pick.kind === "match") return wager.drawId === pick.drawId && wager.teamIdx === pick.teamIdx && wager.match?.[0] === pick.match[0] && wager.match?.[1] === pick.match[1];
  return wager.stagesId === pick.stagesId && wager.pickKey === pick.pickKey && !!wager.final === !!pick.final && (pick.final || wager.group === pick.group);
}
function Wagers({
  state,
  me,
  standings,
  gm,
  events,
  wagerEv,
  onEvents,
  onEvent,
  onPick,
  onVoid,
  onRetract,
  onPlayer,
  GameMark: GameMark2,
  openSettled = false,
  onSettledSeen
}) {
  const [settledOpen, setSettledOpen] = useState42(() => openSettled && me ? `st:${me}` : null);
  const [settledShown, setSettledShown] = useState42(!!openSettled);
  const settledRef = useRef34(null);
  useEffect33(() => {
    if (!openSettled) return;
    setSettledShown(true);
    if (me) setSettledOpen(`st:${me}`);
    settledRef.current?.scrollIntoView?.({ block: "start" });
    onSettledSeen?.();
  }, [openSettled]);
  const [denom, setDenom] = useState42(PT);
  const [manage, setManage] = useState42(false);
  const resolved = useMemo9(
    () => (state.wagers || []).map((w) => ({ w, r: resolveWager(state, w, events) })),
    [state, events]
  );
  const pending = resolved.filter((x) => x.r.status === "pending");
  const pendingLines = mergeWagerLines(pending);
  const settledLines = mergeWagerLines(resolved.filter((x) => x.r.status !== "pending"));
  const settledByPlayer = useMemo9(() => {
    const groups = /* @__PURE__ */ new Map();
    for (const x of settledLines) {
      const group = groups.get(x.w.player) || { player: x.w.player, lines: [], net: 0 };
      group.lines.push(x);
      group.net += x.r.delta || 0;
      groups.set(x.w.player, group);
    }
    return [...groups.values()].sort((a, b) => b.net - a.net || a.player.localeCompare(b.player));
  }, [settledLines]);
  const wagerRisk = me ? atRisk(state, me, events) : 0;
  const myPts = standings.find((row) => row.player === me)?.pts ?? 0;
  const myCap = maxRisk(myPts);
  const duelAntes = me ? duelReserve(state, me) : 0;
  const myExp = wagerRisk + duelAntes;
  const room = me ? Math.max(0, Math.min(myCap - myExp, myPts - myExp)) : 0;
  const capBinds = !!me && room < PT && myPts - myExp >= PT;
  useEffect33(() => {
    if (denom > PT && room >= PT && denom > room)
      setDenom([...RACK_DENOMS].reverse().find((value) => value <= room) || PT);
  }, [room, denom]);
  const tapStake = denom <= room ? denom : [...RACK_DENOMS].reverse().find((value) => value <= room) || PT;
  const ev = wagerEv;
  const finaleClosed = stacksPosted(state) || !!(state.poker && !state.results?.[state.poker.id]);
  const contest = ev ? resolveCurrentContest(state, ev) : null;
  const lifecycle = ev ? resolveEventLifecycle(state, ev) : null;
  const marketOpen = !!contest && contest.phase === "betting-open" && !!state.live && !state.frozen && !state.results?.[ev?.id] && !stacksPosted(state) && !(state.poker && !state.results?.[state.poker.id]);
  const ownSide = contest?.sides.find((side) => side.players.includes(me));
  const evenMoney = contestMult(contest) === 1;
  const restricted = !!ownSide && evenMoney;
  const contestNoun = contest?.kind === "match" || contest?.kind === "ffa" ? "match" : contest?.kind === "heat" ? "heat" : "final";
  const restriction = restricted ? `You can only bet on ${ownSide.players.length > 1 ? "your team" : "yourself"} in this ${contestNoun}.` : null;
  const heldSide = me && contest ? contestSideOf(state, contest, me, events) : null;
  const winLines = useMemo9(
    () => contest && ev ? contestWinLines(state, ev, contest, { events }) : [],
    [state, ev?.id, contest?.id]
  );
  const wide = contest?.kind === "ffa" && (contest?.sides || []).length > 2;
  const picks = (contest?.sides || []).map((side) => {
    const own = side.players.includes(me);
    const drawnTeam = typeof side.key === "number" ? state.draws?.[ev.id]?.teams?.[side.key] : null;
    const name = side.players.length === 1 ? disp(state, side.players[0]) : teamLabel(state, drawnTeam || { players: side.players });
    const pick = contestPick(contest, side, ev);
    const eligible = !!me && contestBetEligibility(contest, me, side.key);
    const otherSide = eligible && heldSide !== null && heldSide !== side.key;
    return {
      key: side.key,
      state,
      me,
      players: side.players,
      name,
      named: side.players.length === 2 && !!drawnTeam?.name,
      marketOpen,
      onRetract: (id) => onRetract(id, { contestId: contest.id, contestRevision: contest.revision }),
      onPlayer,
      tapStake,
      bets: pending.filter((x) => samePick(x.w, pick)),
      winLine: wide && !own ? null : winLineFor(winLines, side.key),
      roleLabel: own ? side.players.length > 1 ? "Your team" : "Back yourself" : null,
      unavailableReason: restricted && !eligible ? restriction : otherSide && marketOpen ? "One side per contest. Your chips are on the other side." : null,
      unavailableLabel: restricted && !eligible ? "Opponent" : "Other side",
      canPick: marketOpen && room >= PT && eligible && !otherSide,
      capLabel: marketOpen && eligible && !otherSide && capBinds ? `Max ${fmt6(myCap)}` : null,
      capReason: marketOpen && eligible && !otherSide && capBinds ? `At your ${fmt6(myCap)} limit` : null,
      onPick: () => onPick({ ...pick, stake: tapStake })
    };
  });
  if (contest?.kind === "ffa") picks.sort((a, b) => Number(!!b.roleLabel) - Number(!!a.roleLabel));
  const winSlot = picks.some((pick) => !!pick.winLine?.text);
  const lines = picks.length > 2 ? 1 : 2;
  picks.forEach((pick) => {
    pick.winSlot = winSlot;
    pick.lines = lines;
    if (lines === 1 && pick.capLabel) pick.capLabel = "";
  });
  const status = marketOpen ? "Betting open" : contest?.phase === "awaiting-result" ? "Awaiting result" : !contest ? lifecycle?.label || "Betting locked" : "Betting locked";
  const boardKey = ev ? `${ev.id}:${contest?.id || ""}` : "";
  const boardChange = useFreshChange(boardKey);
  const frame2 = useMotionFrame();
  const watched = useRef34(null);
  const [settling, setSettling] = useState42(null);
  const [held, setHeld] = useState42(null);
  const [dealing, setDealing] = useState42(0);
  useLayoutEffect13(() => {
    const prev = watched.current;
    watched.current = ev && contest ? { ev, contest, winSlot, label: contest.kind === "ffa" ? ev.name || "Winner" : contest.label } : null;
    if (!boardChange.fresh || !prev || prev.contest.id === contest?.id) return;
    const decided3 = decidedContest(state, events, prev.ev.id, prev.contest);
    if (!decided3) return;
    if (boardChange.animate) {
      setSettling(null);
      setHeld({ id: `${prev.contest.id}:${boardChange.changeId}`, ...prev });
      return;
    }
    const view = settledStacks(state, events, prev.contest);
    if (view.any) setSettling({ id: prev.contest.id, label: prev.label, view });
  }, [boardKey]);
  const heldView = held ? decidedContest(state, events, held.ev.id, held.contest) : null;
  const endHold = () => {
    setHeld(null);
    setDealing((value) => value + 1);
  };
  useEffect33(() => {
    if (!held) return void 0;
    const timer = setTimeout(endHold, MOTION.settleHold);
    return () => clearTimeout(timer);
  }, [held?.id]);
  useEffect33(() => {
    if (held && (!heldView || frame2.correction)) setHeld(null);
  }, [held?.id, !!heldView, frame2.seq]);
  useEffect33(() => {
    if (!dealing) return void 0;
    const timer = setTimeout(() => setDealing(0), MOTION.story + 200);
    return () => clearTimeout(timer);
  }, [dealing]);
  useEffect33(() => {
    if (!settling) return void 0;
    const timer = setTimeout(() => setSettling(null), SETTLE_SHOW_MS);
    return () => clearTimeout(timer);
  }, [settling?.id]);
  const peek = !!onEvent && !!ev && !state.results?.[ev.id] && !!state.brackets?.[ev.id] && !!state.draws?.[ev.id];
  const contextLabel = contest?.kind === "match" || state.brackets?.[ev?.id] ? "Full bracket" : contest?.kind === "heat" || contest?.kind === "stage-final" || state.stages?.[ev?.id] ? "Heats and final" : "Event details";
  const holding = !!(held && heldView);
  const headEv = holding ? held.ev : ev;
  const liveDot = marketOpen && !holding;
  const rackShown = !!(me && ev && marketOpen && !holding);
  const rootRef = useRef34(null), rackRef = useRef34(null);
  useGlassTilt(rackRef, { enabled: rackShown, max: 2 });
  return /* @__PURE__ */ React55.createElement(
    "div",
    {
      ref: rootRef,
      className: `fd-wagers${rackShown ? " has-rack" : ""}`,
      style: { "--fd-wagers-numerals": DISPLAY, "--fd-wagers-body": SANS }
    },
    headEv ? /* @__PURE__ */ React55.createElement("header", { className: `fd-wagers-event-heading fd-lamp${liveDot ? " is-live" : ""}` }, /* @__PURE__ */ React55.createElement("div", { className: "fd-wagers-scene fd-glass-scene" }, /* @__PURE__ */ React55.createElement(GlassArt, { clear: true }), /* @__PURE__ */ React55.createElement("h1", { className: "fd-show is-marquee fd-glass-letter" }, /* @__PURE__ */ React55.createElement(EventName, { name: headEv.name })), GameMark2 && /* @__PURE__ */ React55.createElement("span", { className: "fd-wagers-event-mark" }, /* @__PURE__ */ React55.createElement(GameMark2, { id: headEv.game, variant: headEv.variant, size: 34 }))), /* @__PURE__ */ React55.createElement("div", { className: "fd-wagers-event-meta" }, /* @__PURE__ */ React55.createElement("span", { className: `fd-wagers-status${liveDot ? " is-open" : ""}` }, /* @__PURE__ */ React55.createElement("i", { className: liveDot ? "fd-insert fd-beat-dot" : "fd-insert is-done", "aria-hidden": "true" }), holding ? "Settled" : status), contest && !holding && /* @__PURE__ */ React55.createElement("span", { className: "fd-wagers-payout" }, evenMoney ? "Winner pays 1:1" : "Winner pays 2:1"))) : /* @__PURE__ */ React55.createElement(PageHeading, { title: "Bets" }),
    settling && /* @__PURE__ */ React55.createElement(SettleStrip, { key: settling.id, me, settling }),
    holding && /* @__PURE__ */ React55.createElement(HeldBoard, { key: held.id, state, me, held, view: heldView, onSkip: endHold }),
    !ev && !holding && /* @__PURE__ */ React55.createElement("section", { className: `fd-wagers-waiting fd-glass-field fd-field-info${state.frozen || finaleClosed ? " is-finished" : ""}` }, /* @__PURE__ */ React55.createElement("div", { className: "fd-wagers-waiting-copy" }, /* @__PURE__ */ React55.createElement("h2", null, state.frozen ? "The board is frozen." : finaleClosed ? "Betting is closed for the finale" : state.live ? "Between events" : "Betting opens with the first event"), !state.frozen && !finaleClosed && /* @__PURE__ */ React55.createElement(ActionButton, { variant: "secondary", onClick: onEvents }, "Browse the events"))),
    ev && !holding && /* @__PURE__ */ React55.createElement("section", { className: "fd-wagers-event" }, (contest?.kind !== "ffa" || onEvent && !peek) && /* @__PURE__ */ React55.createElement("div", { className: "fd-wagers-contest-heading" }, /* @__PURE__ */ React55.createElement("div", null, contest?.kind !== "ffa" && /* @__PURE__ */ React55.createElement("h2", null, /* @__PURE__ */ React55.createElement(OneSafe, { text: contest?.label || "Bets" }))), onEvent && !peek && /* @__PURE__ */ React55.createElement("button", { type: "button", className: "fd-wagers-context", onClick: () => onEvent(ev) }, contextLabel, /* @__PURE__ */ React55.createElement(Icon, { name: "open", size: 18 }))), contest && picks.length > 0 ? /* @__PURE__ */ React55.createElement("div", { className: "fd-wagers-play" }, /* @__PURE__ */ React55.createElement(
      "section",
      {
        className: `fd-wagers-market fd-wagers-contest is-${contest.kind}${dealing ? " is-dealing" : ""}`,
        "aria-label": contest.label
      },
      /* @__PURE__ */ React55.createElement("div", { className: `fd-wagers-picks${lines === 1 ? " is-rows" : ""}` }, picks.map((pick) => /* @__PURE__ */ React55.createElement(MarketPick, { ...pick, key: `${contest.id}:${pick.key}` })))
    ), rackShown && /* @__PURE__ */ React55.createElement("section", { ref: rackRef, className: `fd-wagers-rack fd-night${dealing ? " is-dealing" : ""}`, "aria-label": "Choose your betting chip" }, /* @__PURE__ */ React55.createElement(StackMeter, { pts: myPts, cap: myCap, bets: wagerRisk, duels: duelAntes, room, capBinds }), /* @__PURE__ */ React55.createElement("div", { className: "fd-wagers-denoms", role: "group", "aria-label": "Chip value per tap" }, RACK_DENOMS.map((value) => {
      const affordable = value <= room;
      return /* @__PURE__ */ React55.createElement(
        RackChip,
        {
          key: value,
          value,
          me,
          disabled: !affordable,
          selected: tapStake === value && affordable,
          onClick: () => {
            tapTick();
            setDenom(value);
          }
        }
      );
    })))) : /* @__PURE__ */ React55.createElement("p", { className: "fd-wagers-contest-waiting" }, state.results?.[ev.id] ? "Result posted." : "Waiting for the next contest."), me && marketOpen && myPts - myExp < PT && /* @__PURE__ */ React55.createElement("p", { className: "fd-wagers-limit", role: "status" }, "No chips available."), peek && /* @__PURE__ */ React55.createElement(BracketPeek, { state, ev, me, onOpen: onEvent, card: true })),
    pendingLines.length > 0 && /* @__PURE__ */ React55.createElement("details", { className: "fd-wagers-history", open: !contest || void 0 }, /* @__PURE__ */ React55.createElement("summary", null, "Open bets ", /* @__PURE__ */ React55.createElement("span", null, pendingLines.length), /* @__PURE__ */ React55.createElement(Icon, { name: "plus", size: 20, className: "fd-wagers-summary-icon" })), gm && onVoid && /* @__PURE__ */ React55.createElement(
      "button",
      {
        type: "button",
        className: "fd-wagers-manage",
        "aria-pressed": manage,
        onClick: () => setManage((value) => !value)
      },
      manage ? "Done" : "Manage"
    ), /* @__PURE__ */ React55.createElement("div", { className: "fd-wagers-ledger" }, pendingLines.map((x) => /* @__PURE__ */ React55.createElement(WagerLine, { key: x.w.id, x, state, events, gm, manage, onVoid, onPlayer })))),
    settledLines.length > 0 && /* @__PURE__ */ React55.createElement(
      "details",
      {
        className: "fd-wagers-history",
        ref: settledRef,
        open: settledShown,
        onToggle: (event) => setSettledShown(event.currentTarget.open)
      },
      /* @__PURE__ */ React55.createElement("summary", null, "Settled ", /* @__PURE__ */ React55.createElement("span", null, settledLines.length), /* @__PURE__ */ React55.createElement(Icon, { name: "plus", size: 20, className: "fd-wagers-summary-icon" })),
      /* @__PURE__ */ React55.createElement("div", { className: "fd-wagers-settled-list" }, settledByPlayer.map((group) => {
        const key = `st:${group.player}`, open = settledOpen === key;
        return /* @__PURE__ */ React55.createElement("div", { className: `fd-wagers-settled${open ? " is-open" : ""}`, key: group.player }, /* @__PURE__ */ React55.createElement("div", { className: "fd-wagers-settled-row" }, /* @__PURE__ */ React55.createElement(
          "button",
          {
            type: "button",
            className: "fd-wagers-settled-person",
            disabled: !onPlayer,
            onClick: () => onPlayer?.(group.player),
            "aria-label": `View ${disp(state, group.player)}'s player card`
          },
          /* @__PURE__ */ React55.createElement(Avatar, { state, p: group.player, size: 32 }),
          /* @__PURE__ */ React55.createElement("strong", null, disp(state, group.player))
        ), /* @__PURE__ */ React55.createElement(
          "button",
          {
            type: "button",
            className: "fd-wagers-settled-toggle",
            "aria-expanded": open,
            "aria-label": `${open ? "Hide" : "View"} settled bets by ${disp(state, group.player)}`,
            onClick: () => setSettledOpen((current) => current === key ? null : key)
          },
          /* @__PURE__ */ React55.createElement("small", null, group.lines.length, " bet", group.lines.length === 1 ? "" : "s"),
          /* @__PURE__ */ React55.createElement("span", { className: `fd-wagers-net${group.net > 0 ? " is-up" : group.net < 0 ? " is-down" : ""}` }, group.net > 0 ? "+" : "", fmt6(group.net)),
          /* @__PURE__ */ React55.createElement("span", { className: "fd-wagers-settled-arrow" }, /* @__PURE__ */ React55.createElement(Icon, { name: open ? "minus" : "plus", size: 20 }))
        )), open && /* @__PURE__ */ React55.createElement("div", { className: "fd-wagers-settled-detail" }, group.lines.map((x) => /* @__PURE__ */ React55.createElement(WagerLine, { key: x.w.id, x, state, events, gm, onVoid, onPlayer }))));
      }))
    )
  );
}
var PHONE_CHIP, ROW_CHIP, fmt6, RACK_DENOMS, isUncertainResult, PLACE_QUEUE, POT_CHIP, BACKER_ROWS, SETTLE_SHOW_MS, HOME_FLIGHT_AT;
var init_Wagers = __esm({
  "src/features/wagers/Wagers.jsx"() {
    init_core();
    init_theme();
    init_controls();
    init_haptics();
    init_sound();
    init_layout();
    init_PlayerIdentity();
    init_CompetitionBracket();
    init_BetStacks();
    init_betStacks();
    init_motion();
    init_winImpact();
    init_WinLine();
    init_GlassArt();
    init_OneSafe();
    init_Icon();
    init_RenameText();
    init_Coin();
    init_useGlassTilt();
    init_wagers();
    PHONE_CHIP = 28;
    ROW_CHIP = 18;
    fmt6 = (n) => (n ?? 0).toLocaleString("en-US");
    RACK_DENOMS = [PT, 2 * PT, 5 * PT, 10 * PT];
    isUncertainResult = (result) => result?.ok !== true && (result?.uncertain === true || result?.status === "uncertain" || /no response/i.test(String(result?.error || "")));
    PLACE_QUEUE = 4;
    POT_CHIP = Object.freeze({ color: "var(--sun)", isLight: true, skin: "plain", stamp: "" });
    BACKER_ROWS = 4;
    SETTLE_SHOW_MS = 4600;
    HOME_FLIGHT_AT = 1300;
  }
});

// src/PhotoCropper.jsx
import React56, { useCallback as useCallback3, useEffect as useEffect34, useRef as useRef35, useState as useState43 } from "react";
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
function fit(view, image, diameter) {
  if (!image || !diameter) return view;
  const coverScale = Math.max(diameter / image.width, diameter / image.height);
  const scale = coverScale * view.zoom;
  const maxX = Math.max(0, (image.width * scale - diameter) / 2);
  const maxY = Math.max(0, (image.height * scale - diameter) / 2);
  return {
    zoom: clamp(view.zoom, MIN_ZOOM, MAX_ZOOM),
    x: clamp(view.x, -maxX, maxX),
    y: clamp(view.y, -maxY, maxY)
  };
}
function PhotoCropper({
  src,
  onConfirm,
  onCancel,
  outputSize = 384,
  quality = 0.84
}) {
  const dialogRef = useRef35(null);
  const cancelRef = useRef35(null);
  const stageRef = useRef35(null);
  const imageRef = useRef35(null);
  const dragRef = useRef35(null);
  const [image, setImage] = useState43(null);
  const [stageSize, setStageSize] = useState43(0);
  const [view, setView] = useState43({ zoom: 1, x: 0, y: 0 });
  const [status, setStatus] = useState43("loading");
  const [error, setError] = useState43("");
  const diameter = Math.max(0, stageSize - 32);
  useEffect34(() => {
    const node = stageRef.current;
    if (!node) return void 0;
    const measure = () => setStageSize(node.getBoundingClientRect().width);
    measure();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(node);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  useEffect34(() => {
    let disposed = false;
    setStatus("loading");
    setError("");
    setImage(null);
    setView({ zoom: 1, x: 0, y: 0 });
    if (!src) {
      setStatus("error");
      setError("That photo could not be opened. Choose another image.");
      return void 0;
    }
    const nextImage = new Image();
    nextImage.decoding = "async";
    nextImage.onload = () => {
      if (disposed) return;
      if (!nextImage.naturalWidth || !nextImage.naturalHeight) {
        setStatus("error");
        setError("That photo could not be opened. Choose another image.");
        return;
      }
      imageRef.current = nextImage;
      setImage({ width: nextImage.naturalWidth, height: nextImage.naturalHeight });
      setStatus("ready");
    };
    nextImage.onerror = () => {
      if (disposed) return;
      setStatus("error");
      setError("That photo could not be opened. Choose another image.");
    };
    nextImage.src = src;
    return () => {
      disposed = true;
      nextImage.onload = null;
      nextImage.onerror = null;
    };
  }, [src]);
  useEffect34(() => {
    setView((current) => fit(current, image, diameter));
  }, [image, diameter]);
  useEffect34(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cancelRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, []);
  const updateZoom = useCallback3((nextZoom) => {
    setView((current) => {
      const zoom = clamp(Number(nextZoom), MIN_ZOOM, MAX_ZOOM);
      const ratio = zoom / current.zoom;
      return fit(
        { zoom, x: current.x * ratio, y: current.y * ratio },
        image,
        diameter
      );
    });
  }, [image, diameter]);
  const moveBy = useCallback3((dx, dy) => {
    setView((current) => fit(
      { ...current, x: current.x + dx, y: current.y + dy },
      image,
      diameter
    ));
  }, [image, diameter]);
  const onPointerDown = (event) => {
    if (status !== "ready" || dragRef.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY
    };
  };
  const onPointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    moveBy(event.clientX - drag.x, event.clientY - drag.y);
    drag.x = event.clientX;
    drag.y = event.clientY;
  };
  const endPointer = (event) => {
    if (dragRef.current?.id !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };
  const onCropKeyDown = (event) => {
    const amount = event.shiftKey ? 20 : 7;
    const direction = {
      ArrowLeft: [amount, 0],
      ArrowRight: [-amount, 0],
      ArrowUp: [0, amount],
      ArrowDown: [0, -amount]
    }[event.key];
    if (!direction) return;
    event.preventDefault();
    moveBy(...direction);
  };
  const onDialogKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel?.();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...dialogRef.current.querySelectorAll(
      'button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])'
    )];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  const confirm = () => {
    const source = imageRef.current;
    if (!source || !image || !diameter || status !== "ready") return;
    try {
      const canvas = document.createElement("canvas");
      const size = clamp(Math.round(outputSize) || 384, 128, 1024);
      canvas.width = size;
      canvas.height = size;
      const context2 = canvas.getContext("2d");
      const coverScale2 = Math.max(diameter / image.width, diameter / image.height);
      const scale = coverScale2 * view.zoom;
      const sourceSize = diameter / scale;
      const sourceX = image.width / 2 - view.x / scale - sourceSize / 2;
      const sourceY = image.height / 2 - view.y / scale - sourceSize / 2;
      context2.imageSmoothingEnabled = true;
      context2.imageSmoothingQuality = "high";
      context2.fillStyle = "#241B12";
      context2.fillRect(0, 0, size, size);
      context2.drawImage(
        source,
        sourceX,
        sourceY,
        sourceSize,
        sourceSize,
        0,
        0,
        size,
        size
      );
      onConfirm?.(canvas.toDataURL("image/jpeg", clamp(quality, 0.5, 0.95)));
    } catch {
      setError("That photo could not be cropped. Choose another image.");
    }
  };
  const coverScale = image && diameter ? Math.max(diameter / image.width, diameter / image.height) : 0;
  const renderedWidth = image ? image.width * coverScale * view.zoom : 0;
  const renderedHeight = image ? image.height * coverScale * view.zoom : 0;
  return /* @__PURE__ */ React56.createElement("div", { className: "fd-crop-overlay", role: "presentation" }, /* @__PURE__ */ React56.createElement("style", null, `
        .fd-crop-overlay {
          position: fixed;
          inset: 0;
          z-index: 10000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          background: rgba(10, 6, 3, 0.78);
          backdrop-filter: blur(7px);
          -webkit-backdrop-filter: blur(7px);
          animation: fd-crop-fade 160ms ease-out both;
        }
        .fd-crop-dialog {
          width: min(430px, 100%);
          max-height: min(720px, calc(100dvh - 24px));
          overflow-y: auto;
          overscroll-behavior: contain;
          border: 1px solid var(--line, rgba(251,243,228,0.13));
          border-radius: 18px;
          background: var(--paper, #241b12);
          color: var(--ink, #f4ead9);
          box-shadow: var(--shadow-3, 0 14px 40px rgba(10,6,3,0.7));
          font-family: var(--fd-body);
          animation: fd-crop-rise 180ms ease-out both;
        }
        .fd-crop-header {
          display: flex;
          align-items: flex-start;
          gap: 16px;
          padding: 18px 18px 12px;
        }
        .fd-crop-title {
          margin: 0;
          font-family: var(--fd-display);
          font-size: 27px;
          font-weight: 800;
          line-height: 1;
          letter-spacing: .025em;
          text-transform: uppercase;
        }
        .fd-crop-close,
        .fd-crop-zoom-button {
          display: inline-grid;
          flex: 0 0 auto;
          place-items: center;
          padding: 0;
          color: var(--ink, #f4ead9);
          border: 1px solid var(--line, rgba(251,243,228,0.13));
          background: var(--paper2, #332619);
          cursor: pointer;
        }
        .fd-crop-close {
          width: 36px;
          height: 36px;
          margin-left: auto;
          border-radius: 50%;
          font-size: 23px;
          line-height: 1;
        }
        .fd-crop-stage {
          position: relative;
          width: min(360px, calc(100% - 36px));
          aspect-ratio: 1;
          margin: 0 auto;
          overflow: hidden;
          border: 1px solid var(--line, rgba(251,243,228,0.13));
          border-radius: 14px;
          background:
            radial-gradient(circle at 50% 50%, #2d2115 0 45%, #171009 78%);
          touch-action: none;
          cursor: grab;
          user-select: none;
        }
        .fd-crop-stage:active { cursor: grabbing; }
        .fd-crop-stage:focus-visible,
        .fd-crop-dialog button:focus-visible,
        .fd-crop-dialog input:focus-visible {
          outline: 3px solid var(--sun, #f0b02f);
          outline-offset: 3px;
        }
        .fd-crop-window {
          position: absolute;
          left: 16px;
          top: 16px;
          width: calc(100% - 32px);
          height: calc(100% - 32px);
          overflow: hidden;
          border-radius: 50%;
          background: var(--paper2, #332619);
          box-shadow:
            0 0 0 2px var(--sun, #f0b02f),
            0 0 0 999px rgba(10, 6, 3, 0.58);
        }
        .fd-crop-image {
          position: absolute;
          max-width: none;
          pointer-events: none;
          -webkit-user-drag: none;
          image-orientation: from-image;
          will-change: width, height, transform;
        }
        .fd-crop-loading {
          position: absolute;
          inset: 16px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          color: var(--muted2, #c9b896);
          font-size: 13px;
          text-align: center;
        }
        .fd-crop-controls { padding: 18px; }
        .fd-crop-zoom-row {
          display: grid;
          grid-template-columns: 38px minmax(0, 1fr) 38px;
          align-items: center;
          gap: 10px;
        }
        .fd-crop-zoom-button {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          font-size: 22px;
          font-weight: 700;
        }
        .fd-crop-zoom-button:disabled { cursor: default; opacity: .4; }
        .fd-crop-range {
          width: 100%;
          height: 32px;
          margin: 0;
          accent-color: var(--sun, #f0b02f);
          cursor: pointer;
        }
        .fd-crop-error {
          margin: 10px 0 0;
          color: var(--accent2, #d97a50);
          font-size: 12px;
          line-height: 1.4;
          text-align: center;
        }
        .fd-crop-actions {
          display: grid;
          grid-template-columns: 1fr 1.35fr;
          gap: 10px;
          margin-top: 15px;
        }
        .fd-crop-action {
          min-height: 48px;
          padding: 11px 16px;
          border-radius: 11px;
          font: 700 15px/1 var(--fd-body);
          cursor: pointer;
        }
        .fd-crop-cancel {
          border: 1px solid var(--line, rgba(251,243,228,0.13));
          color: var(--ink, #f4ead9);
          background: var(--paper2, #332619);
        }
        .fd-crop-use {
          border: 1.5px solid var(--ink0, #2a2119);
          color: var(--ink0, #2a2119);
          background: var(--sun, #f0b02f);
        }
        .fd-crop-action:disabled { cursor: default; opacity: .45; }
        @keyframes fd-crop-fade { from { opacity: 0; } }
        @keyframes fd-crop-rise {
          from { opacity: 0; transform: translateY(10px) scale(.985); }
        }
        @media (max-width: 540px) {
          .fd-crop-overlay { align-items: flex-end; padding: 0; }
          .fd-crop-dialog {
            width: 100%;
            max-height: calc(100dvh - 10px);
            border-width: 1px 0 0;
            border-radius: 20px 20px 0 0;
          }
          .fd-crop-header { padding-top: 16px; }
          .fd-crop-stage { width: min(350px, calc(100% - 28px)); }
          .fd-crop-controls { padding: 15px 18px max(18px, env(safe-area-inset-bottom)); }
        }
        @media (prefers-reduced-motion: reduce) {
          .fd-crop-overlay, .fd-crop-dialog { animation: none; }
        }
      `), /* @__PURE__ */ React56.createElement(
    "section",
    {
      ref: dialogRef,
      className: "fd-crop-dialog",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "fd-crop-title",
      onKeyDown: onDialogKeyDown
    },
    /* @__PURE__ */ React56.createElement("header", { className: "fd-crop-header" }, /* @__PURE__ */ React56.createElement("div", null, /* @__PURE__ */ React56.createElement("h2", { id: "fd-crop-title", className: "fd-crop-title" }, "Frame your photo")), /* @__PURE__ */ React56.createElement(
      "button",
      {
        ref: cancelRef,
        type: "button",
        className: "fd-crop-close",
        "aria-label": "Cancel photo crop",
        onClick: onCancel
      },
      /* @__PURE__ */ React56.createElement(Icon, { name: "close", size: 20 })
    )),
    /* @__PURE__ */ React56.createElement(
      "div",
      {
        ref: stageRef,
        className: "fd-crop-stage",
        role: "group",
        tabIndex: status === "ready" ? 0 : -1,
        "aria-label": "Photo crop area. Drag the photo or use arrow keys to reposition it.",
        onKeyDown: onCropKeyDown,
        onPointerDown,
        onPointerMove,
        onPointerUp: endPointer,
        onPointerCancel: endPointer
      },
      /* @__PURE__ */ React56.createElement("div", { className: "fd-crop-window" }, status === "ready" && /* @__PURE__ */ React56.createElement(
        "img",
        {
          className: "fd-crop-image",
          src,
          alt: "",
          draggable: "false",
          style: {
            width: renderedWidth,
            height: renderedHeight,
            left: "50%",
            top: "50%",
            transform: `translate(calc(-50% + ${view.x}px), calc(-50% + ${view.y}px))`
          }
        }
      )),
      status !== "ready" && /* @__PURE__ */ React56.createElement("div", { className: "fd-crop-loading", role: "status" }, status === "loading" ? "Opening photo\u2026" : "Photo unavailable")
    ),
    /* @__PURE__ */ React56.createElement("div", { className: "fd-crop-controls" }, /* @__PURE__ */ React56.createElement("div", { className: "fd-crop-zoom-row" }, /* @__PURE__ */ React56.createElement(
      "button",
      {
        type: "button",
        className: "fd-crop-zoom-button",
        "aria-label": "Zoom out",
        disabled: status !== "ready" || view.zoom <= MIN_ZOOM,
        onClick: () => updateZoom(view.zoom - ZOOM_STEP)
      },
      /* @__PURE__ */ React56.createElement("span", { "aria-hidden": "true" }, "\u2212")
    ), /* @__PURE__ */ React56.createElement(
      "input",
      {
        className: "fd-crop-range",
        type: "range",
        min: MIN_ZOOM,
        max: MAX_ZOOM,
        step: "0.01",
        value: view.zoom,
        disabled: status !== "ready",
        "aria-label": `Photo zoom, ${Math.round(view.zoom * 100)} percent`,
        onChange: (event) => updateZoom(event.target.value)
      }
    ), /* @__PURE__ */ React56.createElement(
      "button",
      {
        type: "button",
        className: "fd-crop-zoom-button",
        "aria-label": "Zoom in",
        disabled: status !== "ready" || view.zoom >= MAX_ZOOM,
        onClick: () => updateZoom(view.zoom + ZOOM_STEP)
      },
      /* @__PURE__ */ React56.createElement("span", { "aria-hidden": "true" }, "+")
    )), error && /* @__PURE__ */ React56.createElement("p", { className: "fd-crop-error", role: "alert" }, error), /* @__PURE__ */ React56.createElement("div", { className: "fd-crop-actions" }, /* @__PURE__ */ React56.createElement(
      "button",
      {
        type: "button",
        className: "fd-crop-action fd-crop-cancel",
        onClick: onCancel
      },
      "Cancel"
    ), /* @__PURE__ */ React56.createElement(
      "button",
      {
        type: "button",
        className: "fd-crop-action fd-crop-use",
        disabled: status !== "ready",
        onClick: confirm
      },
      "Use photo"
    )))
  ));
}
var MAX_ZOOM, MIN_ZOOM, ZOOM_STEP;
var init_PhotoCropper = __esm({
  "src/PhotoCropper.jsx"() {
    init_Icon();
    MAX_ZOOM = 4;
    MIN_ZOOM = 1;
    ZOOM_STEP = 0.1;
  }
});

// src/features/profile/ProfileEditor.jsx
import React57, { useEffect as useEffect35, useId as useId6, useRef as useRef36, useState as useState44 } from "react";
function ProfileEditor({
  state,
  me,
  display,
  setDisplay,
  photo,
  setPhoto,
  num,
  setNum,
  size,
  setSize,
  onChip,
  showSize = true,
  numLocked = false
}) {
  const identity = usePlayerIdentity(me);
  const fileRef = useRef36(null);
  const numberErrorId = useId6();
  const [cropSource, setCropSource] = useState44(null);
  const prof = state.profiles?.[me];
  const current = photo || (prof?.photoV ? `/api/photo/${encodeURIComponent(me)}?v=${prof.photoV}` : null);
  const takenBy = num !== "" ? Object.entries(state.profiles || {}).find(([p, pr]) => p !== me && pr?.num === Number(num)) : null;
  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setCropSource(reader.result);
    reader.readAsDataURL(f);
    e.target.value = "";
  };
  return /* @__PURE__ */ React57.createElement("div", { className: "fd-profile-editor" }, me && (state.live ? /* @__PURE__ */ React57.createElement("details", { className: "fd-profile-preview" }, /* @__PURE__ */ React57.createElement("summary", null, "Player card preview"), /* @__PURE__ */ React57.createElement(PlayerPass, { state, p: me, display, num, photo, compact: true, mint: true })) : /* @__PURE__ */ React57.createElement(PlayerPass, { state, p: me, display, num, photo, compact: true, mint: true })), /* @__PURE__ */ React57.createElement("div", { className: "fd-profile-controls" }, /* @__PURE__ */ React57.createElement(
    "div",
    {
      "aria-hidden": "true",
      className: "fd-profile-color-rail",
      style: { background: me ? identity.color : "var(--accent)" }
    }
  ), /* @__PURE__ */ React57.createElement("div", { className: "fd-profile-fields" }, /* @__PURE__ */ React57.createElement("div", { className: "fd-profile-photo-row" }, /* @__PURE__ */ React57.createElement(
    "button",
    {
      type: "button",
      onClick: () => fileRef.current?.click(),
      className: "fd-profile-photo-button",
      "aria-label": current ? "Change your photo" : "Add your photo"
    },
    /* @__PURE__ */ React57.createElement(Icon, { name: "camera", size: 18 }),
    /* @__PURE__ */ React57.createElement("span", null, current ? "Change photo" : "Add a photo"),
    /* @__PURE__ */ React57.createElement("span", { "aria-hidden": "true", className: "fd-profile-photo-action" }, /* @__PURE__ */ React57.createElement(Icon, { name: current ? "open" : "plus", size: "1em" }))
  ), /* @__PURE__ */ React57.createElement("input", { ref: fileRef, type: "file", accept: "image/*", onChange: onFile, style: { display: "none" } }), cropSource && /* @__PURE__ */ React57.createElement(
    PhotoCropper,
    {
      src: cropSource,
      onCancel: () => setCropSource(null),
      onConfirm: (cropped) => {
        setPhoto(cropped);
        setCropSource(null);
      }
    }
  )), /* @__PURE__ */ React57.createElement("div", { className: "fd-profile-name-row" }, /* @__PURE__ */ React57.createElement("label", { className: "fd-profile-field" }, /* @__PURE__ */ React57.createElement("span", null, "Display name"), /* @__PURE__ */ React57.createElement(
    "input",
    {
      value: display,
      onChange: (e) => setDisplay(e.target.value),
      maxLength: 16,
      "aria-label": "Display name",
      autoComplete: "nickname"
    }
  )), /* @__PURE__ */ React57.createElement("label", { className: "fd-profile-field fd-profile-number-field" }, /* @__PURE__ */ React57.createElement("span", null, "No."), /* @__PURE__ */ React57.createElement(
    "input",
    {
      value: num,
      inputMode: "numeric",
      placeholder: "00",
      "aria-label": "Player number",
      disabled: numLocked,
      "aria-invalid": !!takenBy,
      "aria-describedby": takenBy ? numberErrorId : void 0,
      onChange: (e) => setNum(e.target.value.replace(/\D/g, "").slice(0, 2))
    }
  ))), takenBy && /* @__PURE__ */ React57.createElement("div", { id: numberErrorId, className: "fd-profile-number-error", role: "status" }, disp(state, takenBy[0]), " already has ", Number(num), ".")), onChip && me && /* @__PURE__ */ React57.createElement(ChipPicker, { state, me, onChip, num, embedded: true })), showSize && /* @__PURE__ */ React57.createElement("div", { style: { marginTop: 18 } }, /* @__PURE__ */ React57.createElement(SizeRow, { lb: "T-shirt size", value: size, onPick: setSize, allowClear: true })));
}
function ChipPicker({ state, me, onChip, num, embedded = false }) {
  const mine = state.profiles?.[me] || {};
  const stamp = num !== void 0 && num !== "" && num !== null ? Number(num) : mine.num;
  const owner = (hex) => Object.entries(state.profiles || {}).find(([p, pr]) => pr?.color === hex)?.[0];
  const lateClaim = !!state.live && !mine.color;
  const locked = !!state.live && !lateClaim;
  const { skin: savedSkin } = usePlayerIdentity(me);
  const [draftSkin, setDraftSkin] = useState44(null);
  const skin = lateClaim ? draftSkin || mine.skin || CHIP_SKINS[0] : savedSkin;
  const patterns = /* @__PURE__ */ React57.createElement(
    PatternPicker,
    {
      me,
      skin,
      locked,
      stamp,
      onPick: (sk) => lateClaim ? setDraftSkin(sk) : onChip(void 0, sk)
    }
  );
  const wasLate = useRef36(lateClaim);
  const [justClaimed, setJustClaimed] = useState44(false);
  useEffect35(() => {
    if (wasLate.current && locked) setJustClaimed(true);
    wasLate.current = lateClaim;
  }, [lateClaim, locked]);
  if (locked) return /* @__PURE__ */ React57.createElement("div", { className: "fd-profile-chip-locked" }, /* @__PURE__ */ React57.createElement(ChipCoin, { key: justClaimed ? "minted" : "locked", p: me, size: 48, fallback: stamp, mintOnMount: justClaimed }), /* @__PURE__ */ React57.createElement("div", null, /* @__PURE__ */ React57.createElement("strong", null, CHIP_SKIN_META[skin] || "Classic", " pattern"), /* @__PURE__ */ React57.createElement("p", null, "Locked")));
  return /* @__PURE__ */ React57.createElement("div", { className: "fd-chip-picker", style: {
    background: "var(--paper)",
    border: embedded ? "none" : "1px solid var(--line)",
    borderTop: embedded ? "1px solid var(--line)" : void 0,
    borderRadius: embedded ? 0 : 14,
    padding: embedded ? "14px 12px 13px" : 12
  } }, !embedded && /* @__PURE__ */ React57.createElement("div", { style: { display: "flex", alignItems: "center", gap: 14, marginBottom: 15 } }, /* @__PURE__ */ React57.createElement("div", { style: { position: "relative", width: 80, height: 80, flexShrink: 0, display: "grid", placeItems: "center" } }, /* @__PURE__ */ React57.createElement("span", { "aria-hidden": "true", style: {
    position: "absolute",
    inset: 4,
    borderRadius: "50%",
    background: "var(--sun-tint)",
    border: "1px solid var(--line)"
  } }), /* @__PURE__ */ React57.createElement("div", { style: { position: "relative" } }, /* @__PURE__ */ React57.createElement(ChipFace, { p: me, size: 70, fallback: stamp }))), /* @__PURE__ */ React57.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React57.createElement("div", { style: {
    fontFamily: SANS,
    fontWeight: 700,
    fontSize: 12,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    color: "var(--accent2)",
    marginBottom: 4
  } }, "Chip design"), /* @__PURE__ */ React57.createElement("div", { style: {
    fontFamily: DISPLAY,
    fontWeight: 700,
    fontSize: 26,
    lineHeight: 1,
    textTransform: "uppercase",
    color: "var(--ink)"
  } }, "Your chip"), mine.color && /* @__PURE__ */ React57.createElement("div", { style: { fontFamily: SANS, fontSize: 12.5, color: "var(--muted2)", lineHeight: 1.45, marginTop: 5 } }, CHIP_SKIN_META[skin] || "Classic", " pattern"))), lateClaim && patterns, lateClaim && /* @__PURE__ */ React57.createElement("p", { className: "fd-chip-late-note" }, "Claiming a color locks your chip for the weekend."), /* @__PURE__ */ React57.createElement("div", { style: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 8
  } }, /* @__PURE__ */ React57.createElement("div", { style: { ...label } }, "Color"), !mine.color && /* @__PURE__ */ React57.createElement("div", { style: { fontFamily: SANS, fontSize: 12, color: "var(--muted)" } }, "First come, first served")), /* @__PURE__ */ React57.createElement("div", { className: "fd-chip-colors" }, CHIP_COLORS.map((c) => {
    const by = owner(c.hex);
    const isMine = by === me;
    const taken = by && !isMine;
    return /* @__PURE__ */ React57.createElement(
      "button",
      {
        type: "button",
        key: c.hex,
        disabled: taken || locked,
        onClick: () => lateClaim ? onChip(c.hex, skin) : onChip(isMine ? null : c.hex, void 0),
        "aria-label": taken ? `Color taken by ${disp(state, by)}` : isMine ? "Release selected chip color" : `Claim chip color ${c.hex}`,
        "aria-pressed": isMine,
        title: taken ? `Taken by ${disp(state, by)}` : void 0,
        style: {
          position: "relative",
          width: "100%",
          aspectRatio: "1",
          borderRadius: "50%",
          padding: 3,
          display: "grid",
          placeItems: "center",
          cursor: taken || locked ? "default" : "pointer",
          background: isMine ? "var(--info-tint)" : "transparent",
          border: isMine ? "2px solid var(--lamp-info)" : "1px solid transparent",
          boxShadow: isMine ? "0 0 12px color-mix(in srgb, var(--lamp-info) 40%, transparent)" : "none",
          opacity: taken ? 0.42 : locked && !isMine ? 0.55 : 1
        }
      },
      /* @__PURE__ */ React57.createElement("span", { style: {
        position: "relative",
        display: "grid",
        placeItems: "center",
        width: "100%",
        aspectRatio: "1",
        maxWidth: 34,
        borderRadius: "50%",
        background: c.hex,
        border: "1.5px solid var(--bone-line)"
      } }, taken && /* @__PURE__ */ React57.createElement("span", { style: {
        fontFamily: SANS,
        fontWeight: 800,
        fontSize: 12,
        color: chipInkIsDark(c.hex) ? "var(--ink0)" : "var(--bone)"
      } }, initialsOf(state.profiles, by)), isMine && /* @__PURE__ */ React57.createElement(
        "svg",
        {
          width: "14",
          height: "14",
          viewBox: "0 0 16 16",
          fill: "none",
          stroke: chipInkIsDark(c.hex) ? "var(--ink0)" : "var(--bone)",
          strokeWidth: "2.4",
          strokeLinecap: "round",
          strokeLinejoin: "round",
          "aria-hidden": "true"
        },
        /* @__PURE__ */ React57.createElement("path", { d: "m3.2 8.3 3 3 6.6-6.6" })
      ))
    );
  })), !lateClaim && patterns);
}
function PatternPicker({ me, skin, locked, stamp, onPick }) {
  return /* @__PURE__ */ React57.createElement(React57.Fragment, null, /* @__PURE__ */ React57.createElement("div", { style: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 8
  } }, /* @__PURE__ */ React57.createElement("div", { style: { ...label } }, "Pattern")), /* @__PURE__ */ React57.createElement("div", { className: "fd-chip-patterns" }, CHIP_SKINS.map((sk) => /* @__PURE__ */ React57.createElement(
    "button",
    {
      type: "button",
      key: sk,
      disabled: locked,
      onClick: () => onPick(sk),
      "aria-label": `Chip pattern ${CHIP_SKIN_META[sk] || sk}`,
      "aria-pressed": skin === sk,
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 5,
        minHeight: 72,
        padding: "7px 4px 6px",
        borderRadius: 10,
        cursor: locked ? "default" : "pointer",
        background: skin === sk ? "var(--info-tint)" : "var(--bg)",
        border: skin === sk ? "1.5px solid var(--lamp-info)" : "1px solid var(--line)",
        boxShadow: skin === sk ? "0 0 12px color-mix(in srgb, var(--lamp-info) 30%, transparent)" : "var(--glass-edge)",
        opacity: locked && skin !== sk ? 0.55 : 1
      }
    },
    /* @__PURE__ */ React57.createElement(ChipFace, { p: me, size: 42, skin: sk, fallback: stamp }),
    /* @__PURE__ */ React57.createElement("span", { style: {
      fontFamily: SANS,
      fontWeight: 700,
      fontSize: 12,
      color: skin === sk ? "var(--ink)" : "var(--muted2)",
      lineHeight: 1.1
    } }, CHIP_SKIN_META[sk] || sk)
  ))));
}
var CHIP_SKIN_META;
var init_ProfileEditor = __esm({
  "src/features/profile/ProfileEditor.jsx"() {
    init_core();
    init_theme();
    init_PhotoCropper();
    init_PlayerIdentity();
    init_ChipCoin();
    init_PlayerIdentityContext();
    init_Travel();
    init_PlayerPass();
    init_chipInk();
    init_Icon();
    CHIP_SKIN_META = {
      ticks: "Classic",
      plain: "Clean",
      dash: "Split",
      quad: "Four block",
      dots: "Pips",
      ring: "Double ring",
      saw: "Zigzag",
      flame: "Petal",
      star: "Starburst",
      bolt: "Chevron",
      wave: "Ripple",
      crown: "Crown"
    };
  }
});

// src/features/moments/walkoutTeam.js
var WALKOUT_WIN_MS;
var init_walkoutTeam = __esm({
  "src/features/moments/walkoutTeam.js"() {
    init_core();
    WALKOUT_WIN_MS = 30 * 1e3;
  }
});

// src/features/moments/walkout.js
import { useEffect as useEffect39, useRef as useRef40, useState as useState47 } from "react";
var WALKOUT_TIMING;
var init_walkout = __esm({
  "src/features/moments/walkout.js"() {
    init_audio();
    init_mvp();
    init_motion();
    init_serverClock();
    init_tvMotion();
    init_walkoutTeam();
    init_walkoutTeam();
    WALKOUT_TIMING = Object.freeze({
      flood: 0,
      floodMs: 800,
      // their color floods out from their chip
      art: 250,
      artMs: 520,
      // the album art and their photo stand up
      stamp: 700,
      stampMs: 360,
      // the name stamps as the song fades in; the stinger
      sub: 1100,
      subMs: 400,
      // the song and artist
      dock: 8400,
      dockMs: 700,
      // it docks into the Now playing strip
      total: 9100
    });
  }
});

// src/features/director/director.css
var init_director = __esm({
  "src/features/director/director.css"() {
  }
});

// src/features/director/tvHealth.js
var TV_STALE_MS;
var init_tvHealth = __esm({
  "src/features/director/tvHealth.js"() {
    TV_STALE_MS = 60 * 1e3;
  }
});

// src/features/awards/awardsModel.js
var AWARD_TIMING;
var init_awardsModel = __esm({
  "src/features/awards/awardsModel.js"() {
    init_core();
    init_prompts();
    AWARD_TIMING = Object.freeze({
      title: 0,
      nominees: 500,
      nomineeStagger: 45,
      chips: 1500,
      chipMin: 200,
      chipMax: 420,
      chipSpread: 3e3,
      stampAfter: 900,
      settleAfter: 600
    });
  }
});

// src/features/awards/awards.css
var init_awards = __esm({
  "src/features/awards/awards.css"() {
  }
});

// src/features/geo/geo.css
var init_geo2 = __esm({
  "src/features/geo/geo.css"() {
  }
});

// src/features/geo/GeoMap.jsx
import React73, { useEffect as useEffect50, useRef as useRef50, useState as useState58 } from "react";
var init_GeoMap = __esm({
  "src/features/geo/GeoMap.jsx"() {
    init_geo2();
  }
});

// src/features/geo/Wheel.jsx
import React74, { useEffect as useEffect51, useLayoutEffect as useLayoutEffect17, useRef as useRef51, useState as useState59 } from "react";
var ROWS, CENTER2;
var init_Wheel = __esm({
  "src/features/geo/Wheel.jsx"() {
    init_haptics();
    init_sound();
    ROWS = 5;
    CENTER2 = (ROWS - 1) / 2;
  }
});

// src/features/geo/geoModel.js
var hourLabel;
var init_geoModel = __esm({
  "src/features/geo/geoModel.js"() {
    init_core();
    init_geo();
    hourLabel = (h) => `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;
  }
});

// src/features/geo/WhenPicker.jsx
import React75, { useEffect as useEffect52, useMemo as useMemo13 } from "react";
var MONTHS, MONTH_ITEMS, YEAR_ITEMS, HOUR_ITEMS;
var init_WhenPicker = __esm({
  "src/features/geo/WhenPicker.jsx"() {
    init_Wheel();
    init_geoModel();
    MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    MONTH_ITEMS = MONTHS.map((label2, i) => ({ value: i + 1, label: label2 }));
    YEAR_ITEMS = Array.from({ length: 2026 - 1980 + 1 }, (_, i) => ({ value: 1980 + i, label: String(1980 + i) }));
    HOUR_ITEMS = Array.from({ length: 24 }, (_, h) => ({ value: h, label: hourLabel(h) }));
  }
});

// src/features/geo/PlaceSearch.jsx
import React76, { useEffect as useEffect53, useRef as useRef52, useState as useState60 } from "react";
var init_PlaceSearch = __esm({
  "src/features/geo/PlaceSearch.jsx"() {
    init_haptics();
  }
});

// src/features/trivia/triviaModel.js
var LETTERS;
var init_triviaModel = __esm({
  "src/features/trivia/triviaModel.js"() {
    init_core();
    init_trivia();
    LETTERS = Object.freeze(["A", "B", "C", "D"]);
  }
});

// src/features/trivia/trivia.css
var init_trivia2 = __esm({
  "src/features/trivia/trivia.css"() {
  }
});

// src/features/director/tvSheetModel.js
var TV_STEP_NAMES;
var init_tvSheetModel = __esm({
  "src/features/director/tvSheetModel.js"() {
    init_core();
    init_show();
    init_phase();
    init_tvHealth();
    TV_STEP_NAMES = Object.freeze({
      title: "Title",
      room: "Roster",
      ready: "Ready",
      winner: "Winner",
      standings: "Standings",
      board: "Board",
      champion: "Champion",
      class: "Class photo"
    });
  }
});

// src/features/speaker/speakerModel.js
var init_speakerModel = __esm({
  "src/features/speaker/speakerModel.js"() {
  }
});

// src/features/speaker/speakerStatus.js
import { useEffect as useEffect58, useSyncExternalStore as useSyncExternalStore6 } from "react";
var init_speakerStatus = __esm({
  "src/features/speaker/speakerStatus.js"() {
    init_client();
  }
});

// src/features/check-in/submission.js
function createCheckInSubmission() {
  let pending = null;
  return (save, advance) => {
    if (pending) return pending;
    pending = Promise.resolve().then(save).catch(() => ({ ok: false, error: "Couldn't save. Try again." })).then(async (result) => {
      if (result?.ok !== true) {
        return { ...result, ok: false, error: result?.error || "Couldn't save. Try again." };
      }
      await advance();
      return result;
    }).finally(() => {
      pending = null;
    });
    return pending;
  };
}
var init_submission = __esm({
  "src/features/check-in/submission.js"() {
  }
});

// src/features/check-in/arrival.css
var init_arrival = __esm({
  "src/features/check-in/arrival.css"() {
  }
});

// src/features/check-in/Onboarding.jsx
var Onboarding_exports = {};
__export(Onboarding_exports, {
  Onboarding: () => Onboarding
});
import React84, { useEffect as useEffect59, useRef as useRef58, useState as useState65 } from "react";
function InvitationArt() {
  return /* @__PURE__ */ React84.createElement("div", { className: "fd-invitation-art", "aria-label": `Field Day. ${EDITION.name}, ${EDITION.year}.` }, /* @__PURE__ */ React84.createElement(LampChase, { tone: "live" }), /* @__PURE__ */ React84.createElement("div", { className: "fd-invitation-scene fd-glass-scene" }, /* @__PURE__ */ React84.createElement(GlassArt, { clear: true }), /* @__PURE__ */ React84.createElement("div", { className: "fd-invitation-wordmark", "aria-hidden": "true" }, /* @__PURE__ */ React84.createElement("span", null, "Field"), /* @__PURE__ */ React84.createElement("span", null, "Day"))), /* @__PURE__ */ React84.createElement("div", { className: "fd-invitation-seal", "aria-hidden": "true" }, /* @__PURE__ */ React84.createElement("svg", { viewBox: "0 0 100 100" }, /* @__PURE__ */ React84.createElement("path", { d: "M50 1 59 10 72 6 77 19 91 23 90 37 100 50 90 60 94 74 80 79 76 93 62 91 50 100 40 90 26 94 21 80 7 76 9 62 0 50 10 40 6 26 20 21 24 7 38 9Z", fill: "currentColor" })), /* @__PURE__ */ React84.createElement("span", null, /* @__PURE__ */ React84.createElement("strong", null, ROSTER.length), /* @__PURE__ */ React84.createElement("small", null, "Players"))), /* @__PURE__ */ React84.createElement("div", { className: "fd-invitation-edition" }, /* @__PURE__ */ React84.createElement("span", null, "Scottsdale, AZ"), /* @__PURE__ */ React84.createElement("span", null, /* @__PURE__ */ React84.createElement(OneSafe, { text: EDITION.short }), /* @__PURE__ */ React84.createElement("br", null), EDITION.year)));
}
function RatingForm({ ratings, setRatings }) {
  const rated = SPORTS.filter((s) => ratings[s.id] !== void 0).length;
  return /* @__PURE__ */ React84.createElement("div", null, /* @__PURE__ */ React84.createElement("div", { className: "fd-rating-status" }, /* @__PURE__ */ React84.createElement("span", { role: "status" }, rated, " of ", SPORTS.length, " rated"), rated < SPORTS.length && /* @__PURE__ */ React84.createElement(
    "button",
    {
      type: "button",
      className: "fd-text-button",
      onClick: () => setRatings((current) => Object.fromEntries(SPORTS.map((s) => [s.id, current[s.id] ?? 2])))
    },
    "Set remaining to Average"
  )), [["sport", "Sports"], ["drink", "Drinking games"]].map(([group, title]) => /* @__PURE__ */ React84.createElement("div", { className: "fd-rating-group", key: group }, /* @__PURE__ */ React84.createElement("h3", { className: "fd-eyebrow" }, title), /* @__PURE__ */ React84.createElement("div", { className: "fd-rating-labels", "aria-hidden": "true" }, /* @__PURE__ */ React84.createElement("span", null), /* @__PURE__ */ React84.createElement("div", null, ["Never", "Rough", "Avg", "Solid", "Elite"].map((text) => /* @__PURE__ */ React84.createElement("span", { key: text }, text)))), SPORTS.filter((s) => s.group === group).map((s) => /* @__PURE__ */ React84.createElement("div", { className: "fd-rating-row", key: s.id }, /* @__PURE__ */ React84.createElement("div", null, /* @__PURE__ */ React84.createElement("strong", null, s.label), /* @__PURE__ */ React84.createElement("small", null, RATINGS.find((r) => r.v === ratings[s.id])?.label || "Not rated")), /* @__PURE__ */ React84.createElement("div", { className: "fd-rating-options", role: "group", "aria-label": s.label }, RATINGS.map((r, i) => /* @__PURE__ */ React84.createElement(
    "button",
    {
      type: "button",
      key: r.v,
      "aria-label": `${s.label}: ${r.label}`,
      "aria-pressed": ratings[s.id] === r.v,
      className: ratings[s.id] >= r.v ? "is-filled" : "",
      onClick: () => setRatings((current) => ({ ...current, [s.id]: r.v }))
    },
    i + 1
  ))))))));
}
function Onboarding({ step, me, state, pick, saveProfile, submitSeeds, next, back, done, onTv, onChip }) {
  const [selected, setSelected] = useState65(me || null);
  const [ratings, setRatings] = useState65({});
  const [display, setDisplay] = useState65("");
  const [photo, setPhoto] = useState65(null);
  const [num, setNum] = useState65("");
  const [size, setSize] = useState65(null);
  const [flightsBooked, setFlightsBooked] = useState65(null);
  const [flightIn, setFlightIn] = useState65(null);
  const [flightOut, setFlightOut] = useState65(null);
  const [busy, setBusy] = useState65(false);
  const [error, setError] = useState65("");
  const submit = useRef58(createCheckInSubmission());
  const heading = useRef58(null);
  const hydratedPlayer = useRef58(null);
  useEffect59(() => {
    if (!me || hydratedPlayer.current === me) return;
    hydratedPlayer.current = me;
    const profile = state.profiles?.[me];
    setDisplay(profile?.display || me);
    setNum(profile?.num != null ? String(profile.num) : "");
    setSize(profile?.size ?? null);
    setFlightsBooked(profile?.flightsBooked ?? null);
    setFlightIn(profile?.flightIn || null);
    setFlightOut(profile?.flightOut || null);
    setPhoto(null);
    setRatings({ ...state.seeds?.[me] });
  }, [me, state.profiles, state.seeds]);
  useEffect59(() => {
    setError("");
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [step]);
  const saveAndGo = async (save, advance = next) => {
    setBusy(true);
    setError("");
    const result = await submit.current(save, advance);
    if (!result.ok) setError(result.error || "Couldn't save. Try again.");
    setBusy(false);
  };
  const saveChip = async (color, skin) => {
    setBusy(true);
    setError("");
    const result = await submit.current(() => onChip(color, skin), () => {
    });
    if (!result.ok) setError(result.error || "Couldn't save your chip. Try again.");
    setBusy(false);
  };
  const title = step === -1 ? "Add Field Day to your home screen" : ["Claim your spot", "The bachelor party is a tournament", "Thank you for flying in for this", "Getting there", "Set up your profile", "Rate yourself"][step];
  const intro = step === -1 ? "" : [
    "",
    `${ROSTER.length} players, ${allEventsOf(state).filter((e) => !e.finale).length} events, one board.`,
    `${ROSTER.length} players coming in from ${TRAVEL_CITIES.length} cities.`,
    "",
    "",
    "Private"
  ][step];
  const canContinue = step === 0 ? !!selected : step === 3 ? !!size && (flightsBooked !== null || !!state.live) : step === 4 ? !!display.trim() && !!state.profiles?.[me]?.color : step === 5 ? SPORTS.every((s) => ratings[s.id] !== void 0) : true;
  const continueLabel = step === -1 ? "Skip, stay in the browser" : step === 0 ? selected ? `Continue as ${selected}` : "Pick your name" : step === 5 ? "Finish check-in" : "Continue";
  const go = () => {
    if (step === 0) return saveAndGo(() => pick(selected));
    if (step === 3) return saveAndGo(() => saveProfile({
      display: (display || me).trim() || me,
      size,
      ...flightsBooked === null ? {} : { flightsBooked, flightIn, flightOut }
    }));
    if (step === 4) return saveAndGo(() => saveProfile({ display: display.trim(), num: num === "" ? null : Number(num), ...photo ? { photo } : {} }));
    if (step === 5) return saveAndGo(() => submitSeeds(ratings), done);
    next();
  };
  return /* @__PURE__ */ React84.createElement("main", { className: "fd-arrival", "aria-busy": busy }, /* @__PURE__ */ React84.createElement("header", { className: "fd-arrival-header" }, /* @__PURE__ */ React84.createElement("span", { className: "fd-arrival-mark" }, "Field Day ", /* @__PURE__ */ React84.createElement("span", null, EDITION.label)), /* @__PURE__ */ React84.createElement("span", { className: "fd-arrival-progress" }, step < 0 ? "WELCOME" : /* @__PURE__ */ React84.createElement(OneSafe, { all: true, text: `${String(step + 1).padStart(2, "0")} / 06` })), step >= 0 && /* @__PURE__ */ React84.createElement("div", { className: "fd-arrival-progress-track", "aria-label": `Check-in step ${step + 1} of 6: ${STAGES[step]}` }, STAGES.map((stage, i) => /* @__PURE__ */ React84.createElement("span", { key: stage, className: i <= step ? "is-complete" : "" })))), /* @__PURE__ */ React84.createElement("div", { className: `fd-arrival-layout${step <= 0 ? " is-invitation" : ""}` }, /* @__PURE__ */ React84.createElement("aside", { className: "fd-arrival-aside" }, step <= 0 ? /* @__PURE__ */ React84.createElement(InvitationArt, null) : /* @__PURE__ */ React84.createElement("div", { className: "fd-arrival-chapter", "aria-hidden": "true" }, /* @__PURE__ */ React84.createElement("strong", null, String(step + 1).padStart(2, "0")), /* @__PURE__ */ React84.createElement("span", { className: "fd-chapter-name" }, STAGES[step]), /* @__PURE__ */ React84.createElement("span", { className: "fd-chapter-date" }, EDITION.long))), /* @__PURE__ */ React84.createElement("section", { className: "fd-arrival-main", key: step }, /* @__PURE__ */ React84.createElement("div", { className: "fd-arrival-heading" }, /* @__PURE__ */ React84.createElement("h1", { ref: heading, tabIndex: -1 }, title), intro && /* @__PURE__ */ React84.createElement("p", null, intro)), /* @__PURE__ */ React84.createElement("fieldset", { className: "fd-arrival-fields", disabled: busy }, step === -1 && /* @__PURE__ */ React84.createElement("div", { className: "fd-install" }, /* @__PURE__ */ React84.createElement(InstallHint, null)), step === 0 && /* @__PURE__ */ React84.createElement("div", { className: "fd-guest-list", role: "group", "aria-label": "Who are you?" }, ROSTER.map((p, i) => /* @__PURE__ */ React84.createElement("button", { type: "button", key: p, onClick: () => setSelected(p), "aria-pressed": selected === p }, /* @__PURE__ */ React84.createElement("span", { className: "fd-guest-index" }, /* @__PURE__ */ React84.createElement(OneSafe, { all: true, text: String(i + 1).padStart(2, "0") })), /* @__PURE__ */ React84.createElement("span", { className: "fd-guest-name" }, p)))), step === 1 && /* @__PURE__ */ React84.createElement(React84.Fragment, null, /* @__PURE__ */ React84.createElement("div", { className: "fd-starting-stack" }, /* @__PURE__ */ React84.createElement("strong", null, /* @__PURE__ */ React84.createElement(ScoreReel, { value: 1e3, tone: "chip", label: "1,000 chips" }), /* @__PURE__ */ React84.createElement("span", null, "Chips")), /* @__PURE__ */ React84.createElement("span", { className: "fd-starting-stack-sub" }, "Everyone\u2019s starting stack")), /* @__PURE__ */ React84.createElement("div", { className: "fd-weekend-rules" }, [
    ["01", "Collect chips", "Win events and bets. Whatever you have Saturday night is your poker stack."],
    ["02", "Betting", "Bet on each contest before it starts. Only half your chips can be at risk at one time."],
    ["03", "Duels", "Challenge anyone to Quick Draw for an ante you name. Fastest tap wins both antes."],
    ["04", "The trophy", `The winner of the poker finale is the Field Day champion and takes home the ${EDITION.name} ${EDITION.year} trophy.`]
  ].map(([n, name, body]) => /* @__PURE__ */ React84.createElement("div", { key: n }, /* @__PURE__ */ React84.createElement("span", null, n), /* @__PURE__ */ React84.createElement("div", null, /* @__PURE__ */ React84.createElement("h2", null, name), /* @__PURE__ */ React84.createElement("p", null, body)))))), step === 2 && /* @__PURE__ */ React84.createElement("div", { className: "fd-arrival-map" }, /* @__PURE__ */ React84.createElement(TravelMap, null), /* @__PURE__ */ React84.createElement("div", { className: "fd-destination-note" }, /* @__PURE__ */ React84.createElement("strong", null, "Scottsdale, Arizona"), /* @__PURE__ */ React84.createElement("span", null, EDITION.long))), step === 3 && /* @__PURE__ */ React84.createElement(React84.Fragment, null, /* @__PURE__ */ React84.createElement(VenueCard, { lg: state.logistics || {} }), /* @__PURE__ */ React84.createElement("div", { className: "fd-details-panel" }, /* @__PURE__ */ React84.createElement("h2", null, "Information I need"), /* @__PURE__ */ React84.createElement(TravelFields, { booked: flightsBooked, setBooked: setFlightsBooked, flightIn, setFlightIn, flightOut, setFlightOut }), /* @__PURE__ */ React84.createElement(SizeRow, { lb: "T-shirt size", value: size, onPick: setSize }))), step === 4 && /* @__PURE__ */ React84.createElement(
    ProfileEditor,
    {
      state,
      me,
      display,
      setDisplay,
      photo,
      setPhoto,
      num,
      setNum,
      showSize: false,
      onChip: saveChip
    }
  ), step === 5 && /* @__PURE__ */ React84.createElement(RatingForm, { ratings, setRatings })), /* @__PURE__ */ React84.createElement("footer", { className: "fd-arrival-actions" }, error && /* @__PURE__ */ React84.createElement("p", { className: "fd-save-error", role: "alert" }, error), /* @__PURE__ */ React84.createElement("button", { type: "button", className: "fd-continue", disabled: busy || !canContinue, onClick: go }, /* @__PURE__ */ React84.createElement("span", null, busy ? "Saving\u2026" : continueLabel), /* @__PURE__ */ React84.createElement(Icon, { name: "then", size: "1.1em" })), /* @__PURE__ */ React84.createElement("div", { className: "fd-arrival-links" }, step > 0 && /* @__PURE__ */ React84.createElement("button", { type: "button", className: "fd-text-button", disabled: busy, onClick: back }, /* @__PURE__ */ React84.createElement(Icon, { name: "back", size: "1em" }), "Back"), step === 0 && onTv && /* @__PURE__ */ React84.createElement("button", { type: "button", className: "fd-text-button", onClick: onTv, disabled: busy }, "TV mode"), step === 4 && !state.profiles?.[me]?.color && /* @__PURE__ */ React84.createElement("span", null, "Choose a chip color to continue."))))));
}
var STAGES;
var init_Onboarding = __esm({
  "src/features/check-in/Onboarding.jsx"() {
    init_core();
    init_Travel();
    init_ProfileEditor();
    init_InstallHint();
    init_ScoreReel();
    init_GlassArt();
    init_OneSafe();
    init_submission();
    init_arrival();
    init_Icon();
    STAGES = ["Your invitation", "The tournament", "The roster", "The details", "Your card", "Private ratings"];
  }
});

// src/features/weekend/HowToSheet.jsx
init_core();
init_controls();
import React8 from "react";

// src/features/rules/GameSteps.jsx
import React7 from "react";

// src/features/rules/gameSteps.js
init_core();

// src/features/rules/rulesWords.js
var RULES_WORDS = Object.freeze({
  /* Long Putt (putting) */
  "putting.1": "Three putts",
  "putting.2": "Closest ball wins",
  "putting.3": "A make beats all",
  "putting.tie": "Tie: sudden death",
  /* Beer Die (die) */
  "die.1": "Toss above head height",
  "die.2": "Bounce it first",
  "die.3": "Dropped catch: you score",
  "die.4": "Sink it, game over",
  "die.score": "First to the score",
  "die.call": "Call your height",
  "die.plunk": "Plunk: chug",
  /* Where and When (where) */
  "where.1": "A photo goes up",
  "where.2": "Pin where, pick when",
  "where.3": "Closer scores more",
  "where.4": "Highest total wins",
  "where.clock": "60 seconds a photo",
  "where.max": "5,000 where, 5,000 when",
  "where.tie": "Tie: pins, then speed",
  /* Basketball 1v1 */
  "basketball:1v1.1": "Check it up top",
  "basketball:1v1.2": "Every bucket counts one",
  "basketball:1v1.3": "Make it, take it",
  "basketball:1v1.4": "First to five",
  "basketball:1v1.fouls": "Call your own fouls",
  /* Basketball 5v5 */
  "basketball:5v5.1": "Tip off",
  "basketball:5v5.2": "Twos and threes",
  "basketball:5v5.3": "Two halves, running clock",
  "basketball:5v5.4": "Ahead at the horn",
  "basketball:5v5.half": "Clear past half",
  "basketball:5v5.fouls": "Call your own fouls",
  "basketball:5v5.contact": "No hard contact",
  /* Pickleball */
  "pickleball.1": "Serve underhand, crosscourt",
  "pickleball.2": "One bounce each side",
  "pickleball.3": "No kitchen volleys",
  "pickleball.4": "Eleven, win by two",
  "pickleball.serve": "Only servers score",
  /* Volleyball */
  "volleyball.1": "Serve from the line",
  "volleyball.2": "Three touches a side",
  "volleyball.3": "Every rally scores",
  "volleyball.4": "Fifteen, win by two",
  "volleyball.rotate": "Rotate on side-out",
  "volleyball.sets": "Best two of three",
  "volleyball.cap": "Cap at 17",
  /* 8-Ball */
  "8ball.1": "Break, claim a group",
  "8ball.2": "Partners alternate",
  "8ball.3": "Scratch: ball in hand",
  "8ball.4": "Call the 8",
  "8ball.rack": "One rack a match",
  /* Beer Pong (pong) */
  "pong.1": "Six cups a side",
  "pong.2": "Both partners throw",
  "pong.3": "A bounce counts two",
  "pong.4": "Clear their cups",
  "pong.swat": "Bounces can be swatted",
  "pong.rerack": "One re-rack",
  "pong.redemption": "Redemption: semis, final",
  /* Trivia */
  "trivia.1": "Question on the TV",
  "trivia.2": "Right answers score",
  "trivia.3": "Most points wins",
  "trivia.groom": "The groom",
  "trivia.family": "The family",
  "trivia.group": "The group",
  "trivia.photo": "A photo round",
  "trivia.sports": "Sports, pop culture",
  /* Rage Cage */
  "ragecage.1": "Two balls, one circle",
  "ragecage.2": "Bounce it in, pass",
  "ragecage.3": "Stacked, you're out",
  "ragecage.4": "Last one standing",
  "ragecage.anywhere": "First try: pass anywhere",
  "ragecage.second": "Final loser: 2nd",
  "ragecage.third": "Third-to-last out: 3rd",
  "ragecage.center": "Loser drinks the center",
  /* Beerio Kart (beerio) */
  "beerio.1": "Open at the line",
  "beerio.2": "Stop to drink",
  "beerio.3": "Empty before the finish",
  "beerio.4": "Heat winners to final",
  "beerio.sip": "No sipping while steering",
  "beerio.wait": "Not empty? Wait there",
  /* Championship Poker (poker) */
  "poker.1": "Saturday's chips, your stack",
  "poker.2": "Blinds rise each level",
  "poker.3": "Bust, you're out",
  "poker.4": "Biggest stack wins",
  "poker.holdem": "No-limit hold'em",
  "poker.count": "Count after last level",
  "poker.busts": "First out, last place",
  /* earlier slates, kept for their events */
  "spikeball.1": "Serve to the returner",
  "spikeball.2": "Three touches",
  "spikeball.3": "Miss, lose the point",
  "spikeball.4": "Eleven, win by two",
  "spikeball.move": "Move anywhere",
  "spikeball.cap": "Cap at 15",
  "pingpong.1": "Two serves each",
  "pingpong.2": "One bounce each side",
  "pingpong.3": "Eleven, win by two",
  "pingpong.rally": "Rally for serve",
  "foosball.1": "Split the rods",
  "foosball.2": "No spinning",
  "foosball.3": "First to ten",
  "foosball.serve": "Serve through the side",
  "foosball.dead": "Dead ball: serve again",
  /* the weekend: how Field Day works */
  "fieldday.1": "Everyone starts with 1,000",
  "fieldday.2": "Events and bets pay",
  "fieldday.3": "Chips become your stack",
  "fieldday.4": "Chip leader is champion",
  "fieldday.teams": "Teams redrawn every event",
  /* betting */
  "betting.1": "Bet the live contest",
  "betting.2": "Winner pays 1:1",
  "betting.3": "Winner pays 2:1",
  "betting.4": "Half your stack, max",
  "betting.floor": "Never capped under 500",
  "betting.own": "Playing? Back your side",
  "betting.side": "One side per contest",
  "betting.lock": "Locks when play starts",
  "betting.fix": "Corrections fix payouts",
  "betting.void": "Brandon voids any bet",
  /* duels */
  "duels.1": "Challenge from a card",
  "duels.2": "Same ante both sides",
  "duels.3": "Tap on the flash",
  "duels.4": "Fastest tap takes both",
  "duels.early": "Early tap: foul",
  "duels.even": "Same time: chips back",
  "duels.fouls": "Two fouls: chips back",
  "duels.daily": "Three a day",
  "duels.pair": "One duel per pair",
  "duels.lapse": "Lapses after 10 minutes",
  "duels.finale": "Void once poker deals",
  /* draws */
  "draws.1": "Teams balanced by skill",
  "draws.2": "Results count more later",
  "draws.3": "Some events: captains draft",
  "draws.private": "Ratings stay private",
  /* house rules (safety) */
  "safety.optional": "Alcohol optional",
  "safety.na": "NA counts the same",
  "safety.forced": "Nobody is forced",
  "safety.water": "Rack cups hold water",
  "safety.own": "Your own cup",
  "safety.contact": "No hard contact",
  "safety.house": "Respect the house",
  "safety.camera": "Photos and videos encouraged",
  "safety.stop": "Brandon can stop anything",
  /* payouts (the ladders are drawn; these are the exceptions) */
  "payouts.team": "Every teammate: full amount",
  "payouts.semis": "Both semifinal losers: 3rd",
  "payouts.crew": "Crew: 3rd",
  "payouts.ties": "Ties: settled at once",
  "payouts.crown": "Tied champions: one putt"
});
var RULES_TITLES = Object.freeze({
  fieldday: "Field Day",
  betting: "Betting",
  duels: "Duels",
  draws: "Draws",
  safety: "House rules",
  payouts: "Payouts"
});
var ruleWord = (key) => RULES_WORDS[key] ?? key;

// src/features/rules/gameSteps.js
var STEP_SETS = Object.freeze({
  putting: { steps: 3, win: 3, notes: [["tie", "tie"]] },
  die: { steps: 4, win: 4, notes: [["score", "tally"], ["call", "height"], ["plunk", "plunk"]] },
  where: { steps: 4, win: 4, notes: [["clock", "timer"], ["max", "max"], ["tie", "tie"]] },
  "basketball:1v1": { steps: 4, win: 4, notes: [["fouls", "whistle"]] },
  "basketball:5v5": { steps: 4, win: 4, notes: [["half", "half"], ["fouls", "whistle"], ["contact", "contact"]] },
  pickleball: { steps: 4, win: 4, notes: [["serve", "serve"]] },
  volleyball: { steps: 4, win: 4, notes: [["rotate", "rotate"], ["sets", "sets"], ["cap", "cap"]] },
  "8ball": { steps: 4, win: 4, notes: [["rack", "rack"]] },
  pong: { steps: 4, win: 4, notes: [["swat", "swat"], ["rerack", "rack"], ["redemption", "redemption"]] },
  trivia: { steps: 3, win: 3, notes: [["groom", "ring"], ["family", "home"], ["group", "group"], ["photo", "photo"], ["sports", "sports"]] },
  ragecage: { steps: 4, win: 4, notes: [["anywhere", "anywhere"], ["second", "second"], ["third", "third"], ["center", "center"]] },
  beerio: { steps: 4, win: 4, notes: [["sip", "nosip"], ["wait", "wait"]] },
  poker: { steps: 4, win: 4, notes: [["holdem", "cards"], ["count", "timer"], ["busts", "order"]] },
  spikeball: { steps: 4, win: 4, notes: [["move", "move"], ["cap", "cap"]] },
  pingpong: { steps: 3, win: 3, notes: [["rally", "serve"]] },
  foosball: { steps: 3, win: 3, notes: [["serve", "serve"], ["dead", "redemption"]] },
  /* the weekend's rules (Weekend > Rules), drawn the same way */
  fieldday: { steps: 4, win: 4, notes: [["teams", "shuffle"]] },
  betting: { steps: 4, notes: [["floor", "floor"], ["own", "own"], ["side", "side"], ["lock", "lock"], ["fix", "fix"], ["void", "void"]] },
  duels: { steps: 4, win: 4, notes: [["early", "early"], ["even", "tie"], ["fouls", "tie"], ["daily", "daily"], ["pair", "pair"], ["lapse", "lapse"], ["finale", "cards"]] },
  draws: { steps: 3, notes: [["private", "private"]] },
  safety: { steps: 0, notes: [
    ["optional", "drink"],
    ["na", "na"],
    ["forced", "forced"],
    ["water", "water"],
    ["own", "own"],
    ["contact", "contact"],
    ["house", "home"],
    ["camera", "camera"],
    ["stop", "stop"]
  ] },
  payouts: { steps: 0, notes: [["team", "group"], ["semis", "semis"], ["crew", "crew"], ["ties", "tie"], ["crown", "putt"]] }
});
var RULE_SET_ORDER = Object.freeze(["fieldday", "betting", "duels", "draws", "safety"]);
function stepSetId(game, variant) {
  const id = game && typeof game === "object" ? game.game : game;
  const v = variant ?? (game && typeof game === "object" ? game.variant : void 0);
  if (!id) return null;
  if (v && STEP_SETS[`${id}:${v}`]) return `${id}:${v}`;
  if (STEP_SETS[id]) return id;
  const first = GAMES[id]?.variants?.[0]?.id;
  if (first && STEP_SETS[`${id}:${first}`]) return `${id}:${first}`;
  return null;
}
var hasGameSteps = (game, variant) => !!stepSetId(game, variant);
function gameStepsModel(game, variant) {
  const id = stepSetId(game, variant);
  if (!id) return null;
  const set = STEP_SETS[id];
  const [base, v] = id.split(":");
  const title = RULES_TITLES[id] || GAMES[base]?.name || id;
  return {
    id,
    title,
    variant: v || null,
    steps: Array.from({ length: set.steps }, (_, index) => {
      const key = `${id}.${index + 1}`;
      return { key, words: ruleWord(key), win: set.win === index + 1 };
    }),
    notes: set.notes.map(([note, glyph]) => {
      const key = `${id}.${note}`;
      return { key, glyph, words: ruleWord(key) };
    })
  };
}

// src/features/rules/RulePictures.jsx
import React6 from "react";
var F = { fill: "currentColor", stroke: "none" };
var ball = (x, y, r = 2.1) => /* @__PURE__ */ React6.createElement("circle", { cx: x, cy: y, r, ...F });
var Faint = ({ children }) => /* @__PURE__ */ React6.createElement("g", { className: "fd-rp-faint" }, children);
var Lit = ({ children }) => /* @__PURE__ */ React6.createElement("g", { className: "fd-rp-lit" }, children);
var Gone = ({ children }) => /* @__PURE__ */ React6.createElement("g", { className: "fd-rp-gone" }, children);
var trail = (d) => /* @__PURE__ */ React6.createElement("path", { className: "fd-rp-trail", d });
var Num = ({ x, y, size = 11, anchor = "middle", children }) => /* @__PURE__ */ React6.createElement("text", { className: "fd-rp-num", x, y, fontSize: size, textAnchor: anchor }, children);
var head = (x, y, deg = 0) => /* @__PURE__ */ React6.createElement("path", { d: "M-2.6 -2.4 0 0-2.6 2.4", transform: `translate(${x} ${y}) rotate(${deg})` });
var floor = (y = 34) => /* @__PURE__ */ React6.createElement(Faint, null, /* @__PURE__ */ React6.createElement("path", { d: `M4 ${y}H60` }));
var bust = (x, y, r = 2.4) => /* @__PURE__ */ React6.createElement("g", null, /* @__PURE__ */ React6.createElement("circle", { cx: x, cy: y, r }), /* @__PURE__ */ React6.createElement("path", { d: `M${x - r * 1.8} ${y + r * 3.5}a${r * 1.8} ${r * 1.8} 0 0 1 ${r * 3.6} 0` }));
var cup = (x, top, w = 7, h = 8) => /* @__PURE__ */ React6.createElement("path", { d: `M${x - w / 2} ${top}h${w}l-${w * 0.14} ${h}h-${w * 0.72}z` });
var crown = (x, base, s = 1) => /* @__PURE__ */ React6.createElement(Lit, null, /* @__PURE__ */ React6.createElement("path", { ...F, d: `M${x - 5 * s} ${base}l${-1 * s} ${-7 * s} ${3.5 * s} ${3 * s} ${2.5 * s} ${-5 * s} ${2.5 * s} ${5 * s} ${3.5 * s} ${-3 * s} ${-1 * s} ${7 * s}z` }));
var die = (x, y, s = 5, deg = -14) => /* @__PURE__ */ React6.createElement("g", { transform: `rotate(${deg} ${x} ${y})` }, /* @__PURE__ */ React6.createElement("rect", { x: x - s / 2, y: y - s / 2, width: s, height: s, rx: s * 0.22, ...F }), /* @__PURE__ */ React6.createElement("g", { className: "fd-rp-glass" }, /* @__PURE__ */ React6.createElement("circle", { cx: x - s * 0.2, cy: y - s * 0.2, r: s * 0.11 }), /* @__PURE__ */ React6.createElement("circle", { cx: x + s * 0.2, cy: y + s * 0.2, r: s * 0.11 })));
var stack = (x, base, n, w = 14) => /* @__PURE__ */ React6.createElement("g", null, Array.from({ length: n }, (_, i) => /* @__PURE__ */ React6.createElement("rect", { key: i, x: x - w / 2, y: base - (i + 1) * 3.6, width: w, height: 2.9, rx: 1.45, ...F })));
var hoop = (bx = 54, y = 13) => /* @__PURE__ */ React6.createElement("g", null, /* @__PURE__ */ React6.createElement("path", { d: `M${bx} ${y - 8}V${y + 6}` }), /* @__PURE__ */ React6.createElement("path", { d: `M${bx - 10} ${y}H${bx}` }), /* @__PURE__ */ React6.createElement("path", { className: "fd-rp-faint", d: `M${bx - 9} ${y}l2 6h4l2-6` }));
var halfCourt = /* @__PURE__ */ React6.createElement(Faint, null, /* @__PURE__ */ React6.createElement("path", { d: "M4 3.5H60" }), /* @__PURE__ */ React6.createElement("path", { d: "M26 3.5V17H38V3.5" }), /* @__PURE__ */ React6.createElement("path", { d: "M10 3.5V9A22 22 0 0 0 54 9V3.5" }));
var rimTop = /* @__PURE__ */ React6.createElement("g", null, /* @__PURE__ */ React6.createElement("path", { d: "M28 5H36" }), /* @__PURE__ */ React6.createElement("circle", { cx: "32", cy: "7.6", r: "2.1" }));
var tv = (x, y, w, h) => /* @__PURE__ */ React6.createElement("g", null, /* @__PURE__ */ React6.createElement("rect", { x, y, width: w, height: h, rx: "2" }), /* @__PURE__ */ React6.createElement("path", { d: `M${x + w / 2} ${y + h}v3.5M${x + w / 2 - 6} ${y + h + 3.5}h12` }));
var scoreToWin = (big, small = "+2") => /* @__PURE__ */ React6.createElement("g", null, /* @__PURE__ */ React6.createElement(Num, { x: 27, y: 30, size: 24 }, big), /* @__PURE__ */ React6.createElement(Lit, null, /* @__PURE__ */ React6.createElement(Num, { x: 49, y: 22, size: 13 }, small)));
var firstTo = (n, mark = "ball") => {
  const gap = Math.min(10, 50 / (n - 1));
  const x0 = 32 - gap * (n - 1) / 2;
  return /* @__PURE__ */ React6.createElement("g", null, Array.from({ length: n }, (_, i) => {
    const x = x0 + i * gap;
    const node = mark === "card" ? /* @__PURE__ */ React6.createElement("rect", { x: x - 2.4, y: 25, width: 4.8, height: 6.4, rx: 1, ...F }) : ball(x, 28, 2.6);
    return /* @__PURE__ */ React6.createElement(React6.Fragment, { key: i }, i === n - 1 ? /* @__PURE__ */ React6.createElement(Lit, null, node) : node);
  }), crown(x0 + gap * (n - 1), 20, 0.9));
};
var twoBounces = /* @__PURE__ */ React6.createElement("g", null, /* @__PURE__ */ React6.createElement(Faint, null, /* @__PURE__ */ React6.createElement("path", { d: "M4 18H60M4 36H60" })), /* @__PURE__ */ React6.createElement("path", { d: "M32 18v-6M32 36v-6" }), trail("M6 11Q26 -2 43 17.4Q47 12 54 11"), trail("M58 29Q38 16 21 35.4Q17 30 10 29"), /* @__PURE__ */ React6.createElement(Faint, null, /* @__PURE__ */ React6.createElement("path", { d: "M41 16.8l1.6 1.2 1.6-1.2M19 34.8l1.6 1.2 1.6-1.2" })), ball(54, 11, 1.8), ball(10, 29, 1.8));
var kart = (x = 0, y = 0) => /* @__PURE__ */ React6.createElement("g", { transform: `translate(${x} ${y})` }, /* @__PURE__ */ React6.createElement("path", { d: "M6 27h27l-3-7H21l-3-5h-5l-2 5H6z" }), /* @__PURE__ */ React6.createElement("circle", { cx: "16", cy: "11", r: "2.4" }), /* @__PURE__ */ React6.createElement("circle", { cx: "11.5", cy: "29", r: "3.4", ...F }), /* @__PURE__ */ React6.createElement("circle", { cx: "27.5", cy: "29", r: "3.4", ...F }));
var can = (x, y, h = 14, deg = 0) => /* @__PURE__ */ React6.createElement("g", { transform: `rotate(${deg} ${x} ${y + h / 2})` }, /* @__PURE__ */ React6.createElement("rect", { x: x - 4, y, width: "8", height: h, rx: "1.6" }), /* @__PURE__ */ React6.createElement("path", { d: `M${x - 2.4} ${y - 1.4}h4.8` }));
var stopwatch = (x, y, r = 10) => /* @__PURE__ */ React6.createElement("g", null, /* @__PURE__ */ React6.createElement("circle", { cx: x, cy: y, r }), /* @__PURE__ */ React6.createElement("path", { d: `M${x} ${y - r}v-2.6M${x - 2.6} ${y - r - 2.8}h5.2` }), /* @__PURE__ */ React6.createElement(Lit, null, /* @__PURE__ */ React6.createElement("path", { d: `M${x} ${y}l${r * 0.5} ${-r * 0.5}` })));
var chip = (x, y, r = 5) => /* @__PURE__ */ React6.createElement("g", null, /* @__PURE__ */ React6.createElement("circle", { cx: x, cy: y, r, ...F }), /* @__PURE__ */ React6.createElement("circle", { className: "fd-rp-glass-line", cx: x, cy: y, r: r * 0.5 }));
var tallestCrowned = /* @__PURE__ */ React6.createElement("g", null, floor(), /* @__PURE__ */ React6.createElement("g", null, stack(16, 34, 4, 11)), /* @__PURE__ */ React6.createElement(Lit, null, stack(32, 34, 6, 11)), /* @__PURE__ */ React6.createElement("g", null, stack(48, 34, 3, 11)), crown(32, 10, 0.9));
var checkUp = /* @__PURE__ */ React6.createElement("g", null, halfCourt, rimTop, ball(32, 26, 2.2), /* @__PURE__ */ React6.createElement("circle", { cx: "23", cy: "31", r: "2.6", ...F }), /* @__PURE__ */ React6.createElement("circle", { cx: "41", cy: "31", r: "2.6", ...F }), trail("M25.5 29Q32 21 38.5 29"), head(38.5, 29, 50));
var scoreArc = (inside, outside) => /* @__PURE__ */ React6.createElement("g", null, /* @__PURE__ */ React6.createElement(Faint, null, /* @__PURE__ */ React6.createElement("path", { d: "M4 3.5H60" }), /* @__PURE__ */ React6.createElement("path", { d: "M9 3.5V7A23 23 0 0 0 55 7V3.5" })), rimTop, /* @__PURE__ */ React6.createElement(Num, { x: 32, y: 24.5, size: 12 }, inside), /* @__PURE__ */ React6.createElement(Num, { x: 32, y: 39.5, size: 11 }, outside));
var RULE_PICTURES = {
  /* ── Long Putt ── */
  "putting.1": /* @__PURE__ */ React6.createElement("g", null, floor(), /* @__PURE__ */ React6.createElement("path", { d: "M10 8 17.6 32.6" }), /* @__PURE__ */ React6.createElement("path", { d: "M14 33.2H21.6", strokeWidth: "2.6" }), ball(26, 32), ball(31.5, 32), ball(37, 32), /* @__PURE__ */ React6.createElement("path", { d: "M54 34V12" }), /* @__PURE__ */ React6.createElement("path", { d: "M54 12l7 2.6-7 2.6z", ...F }), /* @__PURE__ */ React6.createElement("ellipse", { cx: "54", cy: "34", rx: "3.4", ry: "1.1" })),
  "putting.2": /* @__PURE__ */ React6.createElement("g", null, /* @__PURE__ */ React6.createElement(Faint, null, /* @__PURE__ */ React6.createElement("ellipse", { cx: "32", cy: "22", rx: "27", ry: "14" })), /* @__PURE__ */ React6.createElement("circle", { cx: "34", cy: "21", r: "1.8", ...F }), /* @__PURE__ */ React6.createElement("path", { d: "M34 21V5" }), /* @__PURE__ */ React6.createElement("path", { d: "M34 5l6 2.4-6 2.4z", ...F }), ball(12, 27, 1.9), ball(53, 14, 1.9), trail("M41.6 26.2L36.4 22.4"), /* @__PURE__ */ React6.createElement(Lit, null, ball(44, 28, 2), /* @__PURE__ */ React6.createElement("circle", { cx: "44", cy: "28", r: "4" }))),
  "putting.3": /* @__PURE__ */ React6.createElement("g", null, /* @__PURE__ */ React6.createElement(Faint, null, /* @__PURE__ */ React6.createElement("path", { d: "M4 30H27M37 30H60" })), /* @__PURE__ */ React6.createElement("path", { d: "M27 30V37H37V30" }), /* @__PURE__ */ React6.createElement("path", { d: "M35.6 30V10" }), /* @__PURE__ */ React6.createElement("path", { d: "M35.6 10l6.4 2.6-6.4 2.6z", ...F }), trail("M8 27Q22 16 31 31"), /* @__PURE__ */ React6.createElement(Lit, null, ball(31.6, 34.4, 2.2)), ball(14, 28, 2), crown(17, 15, 0.85)),
  /* ── Beer Die ── */
  "die.1": /* @__PURE__ */ React6.createElement("g", null, /* @__PURE__ */ React6.createElement(Faint, null, /* @__PURE__ */ React6.createElement("path", { d: "M3 11.5H61", strokeDasharray: "1.5 2.5" })), /* @__PURE__ */ React6.createElement("path", { d: "M12 28H52", strokeWidth: "2.2" }), /* @__PURE__ */ React6.createElement("path", { d: "M15 28v8M49 28v8" }), cup(15, 22, 5, 6), cup(49, 22, 5, 6), bust(6, 15, 2.3), trail("M9 13Q30 -10 44 26"), die(28.3, 5, 4.6)),
  "die.2": /* @__PURE__ */ React6.createElement("g", null, /* @__PURE__ */ React6.createElement("path", { d: "M8 28H56", strokeWidth: "2.2" }), /* @__PURE__ */ React6.createElement("path", { d: "M11 28v8M53 28v8" }), cup(11, 22, 5, 6), cup(53, 22, 5, 6), trail("M8 4Q30 2 38 26"), trail("M38 26Q42 12 48 9"), /* @__PURE__ */ React6.createElement(Faint, null, /* @__PURE__ */ React6.createElement("path", { d: "M35 23.6l1.6 1.6M41 23.6l-1.6 1.6" })), die(49, 8.6, 4.4, 18)),
  "die.3": /* @__PURE__ */ React6.createElement("g", null, /* @__PURE__ */ React6.createElement(Faint, null, /* @__PURE__ */ React6.createElement("path", { d: "M4 37H60" })), /* @__PURE__ */ React6.createElement("path", { d: "M4 22H38", strokeWidth: "2.2" }), /* @__PURE__ */ React6.createElement("path", { d: "M8 22v15M34 22v15" }), bust(51, 7, 2.3), trail("M38 20Q48 4 55 33"), /* @__PURE__ */ React6.createElement(Lit, null, die(56, 34.4, 4.4, 10), /* @__PURE__ */ React6.createElement(Num, { x: 20, y: 15, size: 13 }, "+1"))),
  "die.4": /* @__PURE__ */ React6.createElement("g", null, /* @__PURE__ */ React6.createElement("path", { d: "M6 32H58", strokeWidth: "2.2" }), /* @__PURE__ */ React6.createElement("path", { d: "M24 14h16l-2.4 18H26.4z" }), /* @__PURE__ */ React6.createElement(Faint, null, /* @__PURE__ */ React6.createElement("path", { d: "M25 19h14" })), trail("M5 9Q18 -2 29 9"), /* @__PURE__ */ React6.createElement(Lit, null, die(32, 13, 5, 30)), crown(50, 13, 0.9)),
  /* ── Where and When ── */
  "where.1": /* @__PURE__ */ React6.createElement("g", null, tv(22, 4, 36, 24), /* @__PURE__ */ React6.createElement(Faint, null, /* @__PURE__ */ React6.createElement("path", { d: "M25 25l7-9 5 5 4-4 14 8" })), /* @__PURE__ */ React6.createElement("circle", { cx: "49", cy: "10.5", r: "2.2", ...F }), /* @__PURE__ */ React6.createElement("rect", { x: "5", y: "11", width: "12", height: "21", rx: "2.2" }), /* @__PURE__ */ React6.createElement(Faint, null, /* @__PURE__ */ React6.createElement("path", { d: "M7 27l3.5-4.5 2 2 1.6-1.6 2 4" })), /* @__PURE__ */ React6.createElement("circle", { cx: "13.2", cy: "15.6", r: "1.1", ...F })),
  "where.2": /* @__PURE__ */ React6.createElement("g", null, /* @__PURE__ */ React6.createElement("rect", { x: "4", y: "7", width: "28", height: "26", rx: "2.2" }), /* @__PURE__ */ React6.createElement(Faint, null, /* @__PURE__ */ React6.createElement("path", { d: "M4 21Q15 15 32 24M15 7v26" })), /* @__PURE__ */ React6.createElement(Lit, null, /* @__PURE__ */ React6.createElement("path", { d: "M18 24.5s-5-4.3-5-8.4a5 5 0 0 1 10 0c0 4.1-5 8.4-5 8.4z", ...F })), /* @__PURE__ */ React6.createElement("circle", { className: "fd-rp-glass", cx: "18", cy: "16", r: "1.7" }), /* @__PURE__ */ React6.createElement("rect", { x: "37", y: "9", width: "23", height: "23", rx: "2.2" }), /* @__PURE__ */ React6.createElement("path", { d: "M37 15H60M42 6.5v4.5M55 6.5v4.5" }), /* @__PURE__ */ React6.createElement("g", { ...F }, /* @__PURE__ */ React6.createElement("circle", { cx: "42.5", cy: "20.5", r: "1.3" }), /* @__PURE__ */ React6.createElement("circle", { cx: "48.5", cy: "20.5", r: "1.3" }), /* @__PURE__ */ React6.createElement("circle", { cx: "54.5", cy: "20.5", r: "1.3" }), /* @__PURE__ */ React6.createElement("circle", { cx: "42.5", cy: "26.5", r: "1.3" }), /* @__PURE__ */ React6.createElement("circle", { cx: "54.5", cy: "26.5", r: "1.3" })), /* @__PURE__ */ React6.createElement(Lit, null, /* @__PURE__ */ React6.createElement("circle", { cx: "48.5", cy: "26.5", r: "2.6" }))),
  "where.3": /* @__PURE__ */ React6.createElement("g", null, /* @__PURE__ */ React6.createElement(Faint, null, /* @__PURE__ */ React6.createElement("path", { d: "M8 4V34H60" })), /* @__PURE__ */ React6.createElement("path", { d: "M9 7C20 25 34 31 58 32.5" }), /* @__PURE__ */ React6.createElement(Lit, null, ball(12, 11.6, 2.4)), ball(44, 31, 2)),
  "where.4": /* @__PURE__ */ React6.createElement("g", null, floor(), /* @__PURE__ */ React6.createElement("rect", { x: "12", y: "20", width: "8", height: "14", rx: "1" }), /* @__PURE__ */ React6.createElement("path", { d: "M12 27h8" }), /* @__PURE__ */ React6.createElement(Lit, null, /* @__PURE__ */ React6.createElement("rect", { x: "28", y: "13", width: "8", height: "21", rx: "1" }), /* @__PURE__ */ React6.createElement("path", { d: "M28 23.5h8" })), /* @__PURE__ */ React6.createElement("rect", { x: "44", y: "25", width: "8", height: "9", rx: "1" }), /* @__PURE__ */ React6.createElement("path", { d: "M44 29.5h8" }), crown(32, 10, 0.85)),
  /* ── Basketball 1v1 ── */
  "basketball:1v1.1": checkUp,
  "basketball:1v1.2": /* @__PURE__ */ React6.createElement("g", null, floor(36), hoop(), trail("M8 32Q26 -4 46 11"), /* @__PURE__ */ React6.createElement(Lit, null, ball(46.5, 11, 2.4), /* @__PURE__ */ React6.createElement(Num, { x: 22, y: 24, size: 14 }, "1"))),
  "basketball:1v1.3": /* @__PURE__ */ React6.createElement("g", null, floor(36), hoop(), ball(48, 24, 2.4), trail("M46 29Q32 40 17 29"), head(17, 29, 220), bust(11, 17, 2.4)),
  "basketball:1v1.4": firstTo(5),
  /* ── Basketball 5v5 ── */
  "basketball:5v5.1": /* @__PURE__ */ React6.createElement("g", null, /* @__PURE__ */ React6.createElement(Faint, null, /* @__PURE__ */ React6.createElement("ellipse", { cx: "32", cy: "34", rx: "13", ry: "3" })), bust(21, 17, 2.4), bust(43, 17, 2.4), trail("M24 13Q28 6 30.5 6"), trail("M40 13Q36 6 33.5 6"), /* @__PURE__ */ React6.createElement(Lit, null, ball(32, 5, 2.6))),
  "basketball:5v5.2": scoreArc("2", "3"),
  "basketball:5v5.3": /* @__PURE__ */ React6.createElement("g", null, stopwatch(19, 22, 10.5), /* @__PURE__ */ React6.createElement(Lit, null, /* @__PURE__ */ React6.createElement("rect", { x: "36", y: "16", width: "10", height: "11", rx: "1.4", ...F })), /* @__PURE__ */ React6.createElement("rect", { x: "48", y: "16", width: "10", height: "11", rx: "1.4" })),
  "basketball:5v5.4": /* @__PURE__ */ React6.createElement("g", null, /* @__PURE__ */ React6.createElement("path", { d: "M5 17h4l10-6v18l-10-6H5z" }), /* @__PURE__ */ React6.createElement(Faint, null, /* @__PURE__ */ React6.createElement("path", { d: "M23 14a8 8 0 0 1 0 12M27 11a12 12 0 0 1 0 18" })), /* @__PURE__ */ React6.createElement("rect", { x: "34", y: "7", width: "25", height: "25", rx: "2.2" }), /* @__PURE__ */ React6.createElement(Lit, null, /* @__PURE__ */ React6.createElement("rect", { x: "38.5", y: "13", width: "6.5", height: "15", rx: "1", ...F })), /* @__PURE__ */ React6.createElement("rect", { x: "48.5", y: "19", width: "6.5", height: "9", rx: "1" })),
  /* ── Pickleball ── */
  "pickleball.1": /* @__PURE__ */ React6.createElement("g", null, /* @__PURE__ */ React6.createElement(Faint, null, /* @__PURE__ */ React6.createElement("rect", { x: "4", y: "5", width: "56", height: "30", rx: "1" }), /* @__PURE__ */ React6.createElement("path", { d: "M24 5v30M40 5v30M4 20h20M40 20h20" })), /* @__PURE__ */ React6.createElement("path", { d: "M32 3v34", strokeWidth: "2" }), /* @__PURE__ */ React6.createElement("circle", { cx: "7.5", cy: "29", r: "2.4", ...F }), trail("M10 27Q30 2 50 12"), head(50, 12, 30), /* @__PURE__ */ React6.createElement(Lit, null, /* @__PURE__ */ React6.createElement("rect", { x: "41", y: "6", width: "18", height: "13", rx: "1", className: "fd-rp-wash" }))),
  "pickleball.2": twoBounces,
  "pickleball.3": /* @__PURE__ */ React6.createElement("g", null, /* @__PURE__ */ React6.createElement(Faint, null, /* @__PURE__ */ React6.createElement("path", { d: "M4 5H60V35H4z" }), /* @__PURE__ */ React6.createElement("path", { d: "M42 5v30" })), /* @__PURE__ */ React6.createElement(Faint, null, /* @__PURE__ */ React6.createElement("path", { d: "M33 12l8-7M33 20l9-8M33 28l9-8M35 35l7-7" })), /* @__PURE__ */ React6.createElement("path", { d: "M32 3v34", strokeWidth: "2" }), /* @__PURE__ */ React6.createElement("circle", { cx: "38", cy: "23", r: "2.4", ...F }), /* @__PURE__ */ React6.createElement("circle", { cx: "40.4", cy: "14", r: "1.8" }), /* @__PURE__ */ React6.createElement("circle", { cx: "38", cy: "18.5", r: "9" }), /* @__PURE__ */ React6.createElement("path", { d: "M31.6 24.9 44.4 12.1" })),
  "pickleball.4": scoreToWin("11"),
  /* ── Volleyball ── */
  "volleyball.1": /* @__PURE__ */ React6.createElement("g", null, floor(), /* @__PURE__ */ React6.createElement("path", { d: "M11 34v-4" }), /* @__PURE__ */ React6.createElement("path", { d: "M37 34V12" }), /* @__PURE__ */ React6.createElement("rect", { x: "36", y: "12", width: "2.4", height: "9", ...F }), bust(6, 17, 2.3), trail("M9 13Q26 -3 49 21"), ball(50, 22, 2)),
  "volleyball.2": /* @__PURE__ */ React6.createElement("g", null, floor(), /* @__PURE__ */ React6.createElement("path", { d: "M48 34V12" }), /* @__PURE__ */ React6.createElement("rect", { x: "47", y: "12", width: "2.4", height: "9", ...F }), trail("M6 30Q11 12 17 24Q23 9 29 22Q37 0 56 18"), /* @__PURE__ */ React6.createElement("circle", { cx: "6", cy: "30", r: "2.2" }), /* @__PURE__ */ React6.createElement("circle", { cx: "17", cy: "24", r: "2.2" }), /* @__PURE__ */ React6.createElement("circle", { cx: "29", cy: "22", r: "2.2" })),
  "volleyball.3": /* @__PURE__ */ React6.createElement("g", null, floor(), /* @__PURE__ */ React6.createElement("path", { d: "M30 34V12" }), /* @__PURE__ */ React6.createElement("rect", { x: "29", y: "12", width: "2.4", height: "9", ...F }), trail("M8 12Q30 -6 48 31"), /* @__PURE__ */ React6.createElement(Faint, null, /* @__PURE__ */ React6.createElement("path", { d: "M43 33l-2-2.4M53 33l2-2.4" })), ball(48, 31.6, 2.2), /* @__PURE__ */ React6.createElement(Lit, null, /* @__PURE__ */ React6.createElement(Num, { x: 49, y: 18, size: 13 }, "+1"))),
  "volleyball.4": scoreToWin("15"),
  /* ── 8-Ball ── */
  "8ball.1": /* @__PURE__ */ React6.createElement("g", null, /* @__PURE__ */ React6.createElement(Faint, null, /* @__PURE__ */ React6.createElement("rect", { x: "4", y: "5", width: "56", height: "30", rx: "3" })), /* @__PURE__ */ React6.createElement(Faint, null, /* @__PURE__ */ React6.createElement("g", { ...F }, /* @__PURE__ */ React6.createElement("circle", { cx: "6", cy: "7", r: "1.6" }), /* @__PURE__ */ React6.createElement("circle", { cx: "32", cy: "6", r: "1.6" }), /* @__PURE__ */ React6.createElement("circle", { cx: "58", cy: "7", r: "1.6" }), /* @__PURE__ */ React6.createElement("circle", { cx: "6", cy: "33", r: "1.6" }), /* @__PURE__ */ React6.createElement("circle", { cx: "32", cy: "34", r: "1.6" }), /* @__PURE__ */ React6.createElement("circle", { cx: "58", cy: "33", r: "1.6" }))), /* @__PURE__ */ React6.createElement("path", { d: "M2 21.6 10.6 20.4", strokeWidth: "2.4" }), /* @__PURE__ */ React6.createElement("circle", { cx: "14", cy: "20", r: "2" }), trail("M17 20H40"), ball(44, 20, 1.8), /* @__PURE__ */ React6.createElement("circle", { cx: "47.6", cy: "18", r: "1.8" }), ball(47.6, 22, 1.8), /* @__PURE__ */ React6.createElement("circle", { cx: "51.2", cy: "16", r: "1.8" }), ball(51.2, 20, 1.8), /* @__PURE__ */ React6.createElement("circle", { cx: "51.2", cy: "24", r: "1.8" })),
  "8ball.2": /* @__PURE__ */ React6.createElement("g", null, bust(20, 15, 2.6), bust(44, 15, 2.6), trail("M25 9Q32 3 39 9"), head(39, 9, 40), trail("M39 31Q32 37 25 31"), head(25, 31, 220)),
  "8ball.3": /* @__PURE__ */ React6.createElement("g", null, /* @__PURE__ */ React6.createElement(Faint, null, /* @__PURE__ */ React6.createElement("path", { d: "M4 22V5h22" })), /* @__PURE__ */ React6.createElement("circle", { cx: "9", cy: "10", r: "3.2", ...F }), trail("M24 26 12 13"), /* @__PURE__ */ React6.createElement("circle", { cx: "25.5", cy: "27.5", r: "2" }), /* @__PURE__ */ React6.createElement("path", { d: "M41 36v-9a1.6 1.6 0 0 1 3.2 0v-5a1.6 1.6 0 0 1 3.2 0v4.6-1.4a1.6 1.6 0 0 1 3.2 0v2a1.6 1.6 0 0 1 3.2 0V31a5 5 0 0 1-5 5z" }), /* @__PURE__ */ React6.createElement(Lit, null, /* @__PURE__ */ React6.createElement("circle", { cx: "47.6", cy: "13", r: "2.8" }))),
  "8ball.4": /* @__PURE__ */ React6.createElement("g", null, /* @__PURE__ */ React6.createElement(Faint, null, /* @__PURE__ */ React6.createElement("path", { d: "M38 5h22v17" })), /* @__PURE__ */ React6.createElement("circle", { cx: "55", cy: "10", r: "3.2", ...F }), /* @__PURE__ */ React6.createElement(Lit, null, /* @__PURE__ */ React6.createElement("circle", { cx: "55", cy: "10", r: "6.4" })), trail("M27.6 24 50.4 13"), /* @__PURE__ */ React6.createElement("circle", { cx: "23", cy: "27", r: "4.4", ...F }), /* @__PURE__ */ React6.createElement("circle", { className: "fd-rp-glass", cx: "23", cy: "26", r: "1.9" })),
  /* ── Beer Pong ── */
  "pong.1": /* @__PURE__ */ React6.createElement("g", null, /* @__PURE__ */ React6.createElement(Faint, null, /* @__PURE__ */ React6.createElement("rect", { x: "4", y: "7", width: "56", height: "26", rx: "2" }), /* @__PURE__ */ React6.createElement("path", { d: "M32 7v26" })), /* @__PURE__ */ React6.createElement("g", null, [[9, 15], [9, 20], [9, 25], [13.4, 17.5], [13.4, 22.5], [17.8, 20]].map(([x, y]) => /* @__PURE__ */ React6.createElement("circle", { key: `l${y}${x}`, cx: x, cy: y, r: "2" }))), /* @__PURE__ */ React6.createElement("g", null, [[55, 15], [55, 20], [55, 25], [50.6, 17.5], [50.6, 22.5], [46.2, 20]].map(([x, y]) => /* @__PURE__ */ React6.createElement("circle", { key: `r${y}${x}`, cx: x, cy: y, r: "2" })))),
  "pong.2": /* @__PURE__ */ React6.createElement("g", null, /* @__PURE__ */ React6.createElement("path", { d: "M30 30H62", strokeWidth: "2.2" }), cup(44, 24, 5, 6), cup(50, 24, 5, 6), cup(56, 24, 5, 6), bust(7, 6, 2.2), bust(7, 22, 2.2), trail("M11 7Q30 -4 43 21"), trail("M11 23Q33 6 50 21"), ball(43.4, 21.4, 1.7), ball(50, 21.4, 1.7)),
  "pong.3": /* @__PURE__ */ React6.createElement("g", null, /* @__PURE__ */ React6.createElement("path", { d: "M4 30H60", strokeWidth: "2.2" }), /* @__PURE__ */ React6.createElement("path", { d: "M7 30v6M57 30v6" }), trail("M6 6Q18 6 26 29"), trail("M26 29Q36 10 49 23"), /* @__PURE__ */ React6.createElement(Faint, null, /* @__PURE__ */ React6.createElement("path", { d: "M23 26.6l1.6 1.6M29 26.6l-1.6 1.6" })), cup(43, 24, 5, 6), /* @__PURE__ */ React6.createElement(Lit, null, cup(49, 24, 5, 6), cup(55, 24, 5, 6))),
  "pong.4": /* @__PURE__ */ React6.createElement("g", null, /* @__PURE__ */ React6.createElement(Faint, null, /* @__PURE__ */ React6.createElement("rect", { x: "4", y: "8", width: "56", height: "27", rx: "2" }), /* @__PURE__ */ React6.createElement("path", { d: "M32 8v27" })), /* @__PURE__ */ React6.createElement(Faint, null, [[9, 17], [9, 22], [9, 27], [13.4, 19.5], [13.4, 24.5], [17.8, 22]].map(([x, y]) => /* @__PURE__ */ React6.createElement("circle", { key: `l${y}${x}`, cx: x, cy: y, r: "2" }))), /* @__PURE__ */ React6.createElement(Gone, null, [[55, 17], [55, 22], [55, 27], [50.6, 19.5], [50.6, 24.5], [46.2, 22]].map(([x, y]) => /* @__PURE__ */ React6.createElement("circle", { key: `r${y}${x}`, cx: x, cy: y, r: "2" }))), crown(51, 13, 0.85)),
  /* ── Trivia ── */
  "trivia.1": /* @__PURE__ */ React6.createElement("g", null, tv(14, 4, 36, 24), /* @__PURE__ */ React6.createElement("path", { d: "M28.4 12a3.6 3.6 0 1 1 5.4 3.1c-1.2.7-1.8 1.4-1.8 2.7v.8", strokeWidth: "1.9" }), /* @__PURE__ */ React6.createElement("circle", { cx: "32", cy: "23", r: "1.3", ...F })),
  "trivia.2": /* @__PURE__ */ React6.createElement("g", null, bust(8, 22, 2), bust(15, 19, 2), bust(22, 22, 2), bust(42, 22, 2), bust(49, 19, 2), bust(56, 22, 2), /* @__PURE__ */ React6.createElement(Lit, null, /* @__PURE__ */ React6.createElement("circle", { cx: "15", cy: "7", r: "2.6", ...F }), /* @__PURE__ */ React6.createElement("path", { d: "M15 1.6v-1M9.6 7h-1.4M20.4 7h1.4M11.2 3.2l-1-1M18.8 3.2l1-1" })), /* @__PURE__ */ React6.createElement(Lit, null, /* @__PURE__ */ React6.createElement(Num, { x: 32, y: 14, size: 13 }, "+1"))),
  "trivia.3": firstTo(7, "card"),
  /* ── Rage Cage ── */
  "ragecage.1": /* @__PURE__ */ React6.createElement("g", null, Array.from({ length: 10 }, (_, i) => {
    const a = i * Math.PI / 5;
    return /* @__PURE__ */ React6.createElement("circle", { key: i, cx: (32 + Math.cos(a) * 23).toFixed(2), cy: (20 + Math.sin(a) * 13).toFixed(2), r: "2.4" });
  }), /* @__PURE__ */ React6.createElement("circle", { cx: "32", cy: "20", r: "4.4" }), /* @__PURE__ */ React6.createElement("circle", { cx: "32", cy: "20", r: "2.2" }), ball(55, 20, 1.5), ball(9, 20, 1.5)),
  "ragecage.2": /* @__PURE__ */ React6.createElement("g", null, /* @__PURE__ */ React6.createElement("path", { d: "M4 30H60", strokeWidth: "2.2" }), cup(34, 22, 6, 8), trail("M8 8Q16 8 22 29"), trail("M22 29Q28 14 33 21"), /* @__PURE__ */ React6.createElement(Faint, null, /* @__PURE__ */ React6.createElement("path", { d: "M19 26.6l1.6 1.6M25 26.6l-1.6 1.6" })), cup(52, 22, 6, 8), trail("M38 16Q44 9 49 16"), head(49, 16, 50)),
  "ragecage.3": /* @__PURE__ */ React6.createElement("g", null, floor(36), /* @__PURE__ */ React6.createElement("path", { d: "M24 18h16l-2.2 18H26.2z" }), /* @__PURE__ */ React6.createElement("path", { d: "M23 11h18l-2.4 16H25.4z" }), /* @__PURE__ */ React6.createElement(Lit, null, ball(44, 5, 2)), trail("M42.4 6.4 37 10")),
  "ragecage.4": /* @__PURE__ */ React6.createElement("g", null, floor(36), /* @__PURE__ */ React6.createElement(Gone, null, bust(8, 22, 2.2), bust(19, 22, 2.2), bust(45, 22, 2.2), bust(56, 22, 2.2)), /* @__PURE__ */ React6.createElement(Lit, null, bust(32, 20, 2.6)), crown(32, 13, 0.85)),
  /* ── Beerio Kart ── */
  "beerio.1": /* @__PURE__ */ React6.createElement("g", null, kart(0, 2), /* @__PURE__ */ React6.createElement(Faint, null, /* @__PURE__ */ React6.createElement("path", { d: "M40 4v32", strokeDasharray: "3 3" })), can(50, 16, 15), /* @__PURE__ */ React6.createElement(Lit, null, /* @__PURE__ */ React6.createElement("path", { d: "M48 10l-1.6-4M52 10l1.6-4M50 9.6V5" }))),
  "beerio.2": /* @__PURE__ */ React6.createElement("g", null, kart(0, 2), /* @__PURE__ */ React6.createElement(Lit, null, /* @__PURE__ */ React6.createElement("path", { d: "M41 9v12M47 9v12", strokeWidth: "2.6" })), can(56, 12, 14, 32)),
  "beerio.3": /* @__PURE__ */ React6.createElement("g", null, /* @__PURE__ */ React6.createElement("path", { d: "M48 36V5" }), /* @__PURE__ */ React6.createElement("rect", { x: "48", y: "5", width: "12", height: "9" }), /* @__PURE__ */ React6.createElement("g", { ...F }, /* @__PURE__ */ React6.createElement("rect", { x: "48", y: "5", width: "3", height: "3" }), /* @__PURE__ */ React6.createElement("rect", { x: "54", y: "5", width: "3", height: "3" }), /* @__PURE__ */ React6.createElement("rect", { x: "51", y: "8", width: "3", height: "3" }), /* @__PURE__ */ React6.createElement("rect", { x: "57", y: "8", width: "3", height: "3" }), /* @__PURE__ */ React6.createElement("rect", { x: "48", y: "11", width: "3", height: "3" }), /* @__PURE__ */ React6.createElement("rect", { x: "54", y: "11", width: "3", height: "3" })), can(20, 12, 15, 180), trail("M28 22H42"), head(42, 22, 0)),
  "beerio.4": /* @__PURE__ */ React6.createElement("g", null, [6, 15, 24, 33].map((y, i) => /* @__PURE__ */ React6.createElement("g", { key: y }, /* @__PURE__ */ React6.createElement(Lit, null, ball(6, y, 1.9)), ball(12, y, 1.9), ball(18, y, 1.9), trail(`M23 ${y}L42 ${10 + i * 6.6}`))), /* @__PURE__ */ React6.createElement(Lit, null, ball(46, 10, 2.2)), ball(46, 16.6, 2.2), ball(46, 23.2, 2.2), ball(46, 29.8, 2.2), crown(55, 13, 0.75)),
  /* ── Championship Poker ── */
  "poker.1": /* @__PURE__ */ React6.createElement("g", null, /* @__PURE__ */ React6.createElement(Faint, null, /* @__PURE__ */ React6.createElement("rect", { x: "5", y: "9", width: "20", height: "5", rx: "1.5" }), /* @__PURE__ */ React6.createElement("rect", { x: "5", y: "25", width: "20", height: "5", rx: "1.5" })), /* @__PURE__ */ React6.createElement(Lit, null, /* @__PURE__ */ React6.createElement("rect", { x: "5", y: "17", width: "20", height: "5", rx: "1.5" })), trail("M29 19.5H37"), head(37.5, 19.5, 0), /* @__PURE__ */ React6.createElement(Lit, null, stack(50, 34, 7, 14))),
  "poker.2": /* @__PURE__ */ React6.createElement("g", null, stopwatch(15, 22, 9.5), floor(), /* @__PURE__ */ React6.createElement(Lit, null, stack(35, 34, 2, 9), stack(46, 34, 4, 9), stack(57, 34, 6, 9))),
  "poker.3": /* @__PURE__ */ React6.createElement("g", null, floor(), /* @__PURE__ */ React6.createElement(Gone, null, /* @__PURE__ */ React6.createElement("rect", { x: "9", y: "27", width: "16", height: "3", rx: "1.5" }), /* @__PURE__ */ React6.createElement("rect", { x: "9", y: "23", width: "16", height: "3", rx: "1.5" })), bust(42, 17, 2.6), trail("M49 22H58"), head(58.4, 22, 0)),
  "poker.4": tallestCrowned,
  /* ── earlier slates ── */
  "spikeball.1": /* @__PURE__ */ React6.createElement("g", null, /* @__PURE__ */ React6.createElement("circle", { cx: "32", cy: "20", r: "7" }), /* @__PURE__ */ React6.createElement(Faint, null, /* @__PURE__ */ React6.createElement("circle", { cx: "32", cy: "20", r: "4" })), /* @__PURE__ */ React6.createElement("circle", { cx: "9", cy: "31", r: "2.4", ...F }), /* @__PURE__ */ React6.createElement(Faint, null, /* @__PURE__ */ React6.createElement("circle", { cx: "9", cy: "9", r: "2.4", ...F }), /* @__PURE__ */ React6.createElement("circle", { cx: "55", cy: "31", r: "2.4", ...F })), /* @__PURE__ */ React6.createElement(Lit, null, /* @__PURE__ */ React6.createElement("circle", { cx: "55", cy: "9", r: "2.4", ...F })), trail("M11 29Q22 22 28 21.6"), trail("M35 18Q45 11 51.6 10")),
  "spikeball.2": /* @__PURE__ */ React6.createElement("g", null, floor(36), /* @__PURE__ */ React6.createElement("ellipse", { cx: "50", cy: "30", rx: "9", ry: "2.4" }), /* @__PURE__ */ React6.createElement("path", { d: "M43 31.4 41.6 36M57 31.4l1.4 4.6" }), trail("M6 26Q10 10 16 21Q22 8 28 19Q38 4 49 29"), /* @__PURE__ */ React6.createElement("circle", { cx: "6", cy: "26", r: "2.2" }), /* @__PURE__ */ React6.createElement("circle", { cx: "16", cy: "21", r: "2.2" }), /* @__PURE__ */ React6.createElement("circle", { cx: "28", cy: "19", r: "2.2" })),
  "spikeball.3": /* @__PURE__ */ React6.createElement("g", null, floor(36), /* @__PURE__ */ React6.createElement("ellipse", { cx: "38", cy: "28", rx: "9", ry: "2.4" }), /* @__PURE__ */ React6.createElement("path", { d: "M31 29.4 29.6 36M45 29.4l1.4 4.6" }), trail("M8 6Q22 4 28.6 27"), trail("M28.6 27Q24 30 18 34"), /* @__PURE__ */ React6.createElement(Gone, null, /* @__PURE__ */ React6.createElement("circle", { cx: "16", cy: "33.4", r: "2" }))),
  "spikeball.4": scoreToWin("11"),
  "pingpong.1": /* @__PURE__ */ React6.createElement("g", null, /* @__PURE__ */ React6.createElement("path", { d: "M4 28H60", strokeWidth: "2.2" }), /* @__PURE__ */ React6.createElement("path", { d: "M32 28v-6M8 28v8M56 28v8" }), ball(8, 16, 2), ball(14, 16, 2), trail("M18 10Q32 0 46 10"), head(46, 10, 40), /* @__PURE__ */ React6.createElement(Gone, null, /* @__PURE__ */ React6.createElement("circle", { cx: "50", cy: "16", r: "2" }), /* @__PURE__ */ React6.createElement("circle", { cx: "56", cy: "16", r: "2" }))),
  "pingpong.2": twoBounces,
  "pingpong.3": scoreToWin("11"),
  "foosball.1": /* @__PURE__ */ React6.createElement("g", null, /* @__PURE__ */ React6.createElement(Faint, null, /* @__PURE__ */ React6.createElement("rect", { x: "6", y: "5", width: "52", height: "30", rx: "2" })), [14, 26].map((x) => /* @__PURE__ */ React6.createElement("g", { key: x }, /* @__PURE__ */ React6.createElement("path", { d: `M${x} 2v36` }), /* @__PURE__ */ React6.createElement("rect", { x: x - 2, y: "11", width: "4", height: "5", rx: "1", ...F }), /* @__PURE__ */ React6.createElement("rect", { x: x - 2, y: "24", width: "4", height: "5", rx: "1", ...F }))), /* @__PURE__ */ React6.createElement(Faint, null, [38, 50].map((x) => /* @__PURE__ */ React6.createElement("g", { key: x }, /* @__PURE__ */ React6.createElement("path", { d: `M${x} 2v36` }), /* @__PURE__ */ React6.createElement("rect", { x: x - 2, y: "11", width: "4", height: "5", rx: "1" }), /* @__PURE__ */ React6.createElement("rect", { x: x - 2, y: "24", width: "4", height: "5", rx: "1" })))), ball(32, 20, 1.8)),
  "foosball.2": /* @__PURE__ */ React6.createElement("g", null, /* @__PURE__ */ React6.createElement("path", { d: "M6 20H58" }), /* @__PURE__ */ React6.createElement("rect", { x: "29", y: "12", width: "6", height: "16", rx: "2", ...F }), /* @__PURE__ */ React6.createElement("path", { d: "M24 9a12 12 0 1 1-2 13" }), head(22, 22, 110), /* @__PURE__ */ React6.createElement("path", { d: "M17 34 47 6", strokeWidth: "2.2" })),
  "foosball.3": /* @__PURE__ */ React6.createElement("g", null, /* @__PURE__ */ React6.createElement("path", { d: "M54 9v22M54 9h6M54 31h6" }), trail("M8 26Q24 18 44 20"), /* @__PURE__ */ React6.createElement(Lit, null, ball(47, 20, 2.4)), /* @__PURE__ */ React6.createElement(Num, { x: 18, y: 14, size: 14 }, "10")),
  /* ── the weekend ── */
  "fieldday.1": /* @__PURE__ */ React6.createElement("g", null, floor(36), /* @__PURE__ */ React6.createElement(Faint, null, bust(12, 20, 2.2), bust(52, 20, 2.2)), /* @__PURE__ */ React6.createElement(Lit, null, stack(32, 36, 9, 16))),
  "fieldday.2": /* @__PURE__ */ React6.createElement("g", null, floor(), /* @__PURE__ */ React6.createElement("path", { d: "M5 6h11v4a5.5 5.5 0 0 1-11 0z" }), /* @__PURE__ */ React6.createElement("path", { d: "M10.5 15.5V19M7 20h7" }), chip(55, 11, 5), trail("M12 23Q16 30 23 29"), head(23.4, 29, 0), trail("M52 19Q48 30 41 29"), head(40.6, 29, 180), /* @__PURE__ */ React6.createElement(Lit, null, stack(32, 34, 6, 13))),
  "fieldday.3": /* @__PURE__ */ React6.createElement("g", null, floor(), /* @__PURE__ */ React6.createElement(Lit, null, stack(14, 34, 7, 14)), trail("M25 20H34"), head(34.4, 20, 0), /* @__PURE__ */ React6.createElement("rect", { x: "39", y: "9", width: "11", height: "16", rx: "1.8", transform: "rotate(-10 44.5 17)" }), /* @__PURE__ */ React6.createElement("rect", { x: "46", y: "10", width: "11", height: "16", rx: "1.8", transform: "rotate(10 51.5 18)", className: "fd-rp-card" }), /* @__PURE__ */ React6.createElement("path", { d: "m51.5 13.4 2.4 3.4-2.4 3.4-2.4-3.4z", ...F })),
  "fieldday.4": tallestCrowned,
  "betting.1": /* @__PURE__ */ React6.createElement("g", null, /* @__PURE__ */ React6.createElement(Faint, null, /* @__PURE__ */ React6.createElement("rect", { x: "8", y: "3.5", width: "48", height: "9", rx: "2" }), /* @__PURE__ */ React6.createElement("rect", { x: "8", y: "27.5", width: "48", height: "9", rx: "2" })), /* @__PURE__ */ React6.createElement(Lit, null, /* @__PURE__ */ React6.createElement("rect", { x: "8", y: "15.5", width: "48", height: "9", rx: "2" })), /* @__PURE__ */ React6.createElement(Lit, null, chip(49, 20, 3))),
  "betting.2": /* @__PURE__ */ React6.createElement("g", null, bust(13, 9, 2.6), bust(51, 9, 2.6), /* @__PURE__ */ React6.createElement(Faint, null, /* @__PURE__ */ React6.createElement("path", { d: "M32 6v16" })), /* @__PURE__ */ React6.createElement(Lit, null, /* @__PURE__ */ React6.createElement(Num, { x: 32, y: 35, size: 14 }, "1:1"))),
  "betting.3": /* @__PURE__ */ React6.createElement("g", null, bust(9, 9, 2.2), bust(24, 9, 2.2), bust(40, 9, 2.2), bust(55, 9, 2.2), /* @__PURE__ */ React6.createElement(Lit, null, /* @__PURE__ */ React6.createElement(Num, { x: 32, y: 35, size: 14 }, "2:1"))),
  "betting.4": /* @__PURE__ */ React6.createElement("g", null, /* @__PURE__ */ React6.createElement("rect", { x: "5", y: "15", width: "54", height: "10", rx: "5" }), /* @__PURE__ */ React6.createElement(Lit, null, /* @__PURE__ */ React6.createElement("rect", { x: "5", y: "15", width: "27", height: "10", rx: "5", ...F })), /* @__PURE__ */ React6.createElement("path", { d: "M32 9v22", strokeWidth: "2" })),
  "duels.1": /* @__PURE__ */ React6.createElement("g", null, /* @__PURE__ */ React6.createElement("rect", { x: "7", y: "4", width: "21", height: "31", rx: "3" }), /* @__PURE__ */ React6.createElement("circle", { cx: "17.5", cy: "15", r: "5", ...F }), /* @__PURE__ */ React6.createElement(Faint, null, /* @__PURE__ */ React6.createElement("path", { d: "M12 25h11M12 29h7" })), trail("M31 19.5H40"), head(40.4, 19.5, 0), bust(51, 13, 3)),
  "duels.2": /* @__PURE__ */ React6.createElement("g", null, floor(), /* @__PURE__ */ React6.createElement(Lit, null, stack(14, 34, 3, 14), stack(50, 34, 3, 14)), /* @__PURE__ */ React6.createElement("path", { d: "M27 21h10M27 26h10" })),
  "duels.3": /* @__PURE__ */ React6.createElement("g", null, /* @__PURE__ */ React6.createElement("rect", { x: "21", y: "3", width: "22", height: "34", rx: "3.4" }), /* @__PURE__ */ React6.createElement(Lit, null, /* @__PURE__ */ React6.createElement("circle", { cx: "32", cy: "16", r: "3.4", ...F }), /* @__PURE__ */ React6.createElement("path", { d: "M32 8.6V6.4M32 23.4v2.2M24.6 16h-2.2M39.4 16h2.2M26.8 10.8l-1.6-1.6M37.2 10.8l1.6-1.6M26.8 21.2l-1.6 1.6M37.2 21.2l1.6 1.6" })), /* @__PURE__ */ React6.createElement(Faint, null, /* @__PURE__ */ React6.createElement("circle", { cx: "32", cy: "31", r: "2.2" }))),
  "duels.4": /* @__PURE__ */ React6.createElement("g", null, floor(), stopwatch(15, 22, 9.5), /* @__PURE__ */ React6.createElement(Lit, null, stack(46, 34, 6, 14)), crown(46, 9, 0.85)),
  "draws.1": /* @__PURE__ */ React6.createElement("g", null, /* @__PURE__ */ React6.createElement("path", { d: "M32 7v27M24 34h16M12 11h40" }), /* @__PURE__ */ React6.createElement("path", { d: "M12 11 7 22M12 11l5 11M52 11l-5 11M52 11l5 11" }), /* @__PURE__ */ React6.createElement("path", { d: "M6 22a6 3 0 0 0 12 0zM46 22a6 3 0 0 0 12 0z" }), /* @__PURE__ */ React6.createElement("g", { ...F }, /* @__PURE__ */ React6.createElement("circle", { cx: "9.6", cy: "19", r: "1.7" }), /* @__PURE__ */ React6.createElement("circle", { cx: "14.4", cy: "19", r: "1.7" }), /* @__PURE__ */ React6.createElement("circle", { cx: "49.6", cy: "19", r: "1.7" }), /* @__PURE__ */ React6.createElement("circle", { cx: "54.4", cy: "19", r: "1.7" }))),
  "draws.2": /* @__PURE__ */ React6.createElement("g", null, floor(), /* @__PURE__ */ React6.createElement("g", { ...F }, /* @__PURE__ */ React6.createElement("rect", { x: "7", y: "28", width: "7", height: "6", rx: "1" }), /* @__PURE__ */ React6.createElement("rect", { x: "18", y: "24", width: "7", height: "10", rx: "1" }), /* @__PURE__ */ React6.createElement("rect", { x: "29", y: "19", width: "7", height: "15", rx: "1" }), /* @__PURE__ */ React6.createElement("rect", { x: "40", y: "13", width: "7", height: "21", rx: "1" })), /* @__PURE__ */ React6.createElement(Lit, null, /* @__PURE__ */ React6.createElement("rect", { x: "51", y: "6", width: "7", height: "28", rx: "1", ...F }))),
  "draws.3": /* @__PURE__ */ React6.createElement("g", null, bust(11, 12, 2.8), bust(53, 12, 2.8), /* @__PURE__ */ React6.createElement(Lit, null, /* @__PURE__ */ React6.createElement("circle", { cx: "11", cy: "20.6", r: "1.6", ...F }), /* @__PURE__ */ React6.createElement("circle", { cx: "53", cy: "20.6", r: "1.6", ...F })), ball(26, 30, 2), ball(32, 30, 2), ball(38, 30, 2), trail("M24 26Q19 22 17 18"), head(17, 18, 235))
};
var NOTE_GLYPHS = {
  tie: /* @__PURE__ */ React6.createElement(React6.Fragment, null, /* @__PURE__ */ React6.createElement("circle", { cx: "6", cy: "12", r: "2.8", ...F }), /* @__PURE__ */ React6.createElement("circle", { cx: "18", cy: "12", r: "2.8", ...F }), /* @__PURE__ */ React6.createElement("path", { d: "M10.4 10.2h3.2M10.4 13.8h3.2" })),
  tally: /* @__PURE__ */ React6.createElement("path", { d: "M6 6v12M10 6v12M14 6v12M18 6v12M4 16 20 8" }),
  height: /* @__PURE__ */ React6.createElement(React6.Fragment, null, /* @__PURE__ */ React6.createElement("path", { d: "M5 4.5h14", strokeDasharray: "1.4 2" }), /* @__PURE__ */ React6.createElement("path", { d: "M12 20V8.5M8.5 12 12 8.5l3.5 3.5" })),
  plunk: /* @__PURE__ */ React6.createElement(React6.Fragment, null, /* @__PURE__ */ React6.createElement("path", { d: "M5 10h10l-1.5 10h-7z" }), /* @__PURE__ */ React6.createElement("rect", { x: "15", y: "3", width: "5", height: "5", rx: "1.1", transform: "rotate(14 17.5 5.5)", ...F })),
  timer: /* @__PURE__ */ React6.createElement(React6.Fragment, null, /* @__PURE__ */ React6.createElement("circle", { cx: "12", cy: "13.5", r: "7.2" }), /* @__PURE__ */ React6.createElement("path", { d: "M12 6.3V3.6M9.8 3h4.4M12 13.5l3.4-3.4" })),
  max: /* @__PURE__ */ React6.createElement(React6.Fragment, null, /* @__PURE__ */ React6.createElement("rect", { x: "5", y: "6", width: "5.5", height: "14", rx: "1", ...F }), /* @__PURE__ */ React6.createElement("rect", { x: "13.5", y: "6", width: "5.5", height: "14", rx: "1", ...F })),
  whistle: /* @__PURE__ */ React6.createElement(React6.Fragment, null, /* @__PURE__ */ React6.createElement("circle", { cx: "9", cy: "14.5", r: "5" }), /* @__PURE__ */ React6.createElement("path", { d: "M13 10.5h7v4h-5.6" }), /* @__PURE__ */ React6.createElement("circle", { cx: "9", cy: "14.5", r: "1.4", ...F })),
  half: /* @__PURE__ */ React6.createElement(React6.Fragment, null, /* @__PURE__ */ React6.createElement("rect", { x: "3.5", y: "6", width: "17", height: "12", rx: "1" }), /* @__PURE__ */ React6.createElement("path", { d: "M12 6v12" }), /* @__PURE__ */ React6.createElement("circle", { cx: "12", cy: "12", r: "2.4" })),
  contact: /* @__PURE__ */ React6.createElement(React6.Fragment, null, /* @__PURE__ */ React6.createElement("circle", { cx: "7", cy: "8", r: "2.3" }), /* @__PURE__ */ React6.createElement("path", { d: "M3 17a4 4 0 0 1 8 0" }), /* @__PURE__ */ React6.createElement("circle", { cx: "17", cy: "8", r: "2.3" }), /* @__PURE__ */ React6.createElement("path", { d: "M13 17a4 4 0 0 1 8 0" }), /* @__PURE__ */ React6.createElement("path", { d: "M4 21 20 3" })),
  serve: /* @__PURE__ */ React6.createElement(React6.Fragment, null, /* @__PURE__ */ React6.createElement("circle", { cx: "6", cy: "16", r: "2.3", ...F }), /* @__PURE__ */ React6.createElement("path", { d: "M9 13.5Q14 5 20 9.5" }), /* @__PURE__ */ React6.createElement("path", { d: "M17.2 7.4 20 9.5l-2.8 1.8" })),
  rotate: /* @__PURE__ */ React6.createElement(React6.Fragment, null, /* @__PURE__ */ React6.createElement("path", { d: "M18.5 9a7 7 0 0 0-12.6.6" }), /* @__PURE__ */ React6.createElement("path", { d: "M5.5 15a7 7 0 0 0 12.6-.6" }), /* @__PURE__ */ React6.createElement("path", { d: "M18.9 4.8 18.5 9l-4.1-.6M5.1 19.2 5.5 15l4.1.6" })),
  sets: /* @__PURE__ */ React6.createElement(React6.Fragment, null, /* @__PURE__ */ React6.createElement("circle", { cx: "5.5", cy: "12", r: "2.8", ...F }), /* @__PURE__ */ React6.createElement("circle", { cx: "12", cy: "12", r: "2.8", ...F }), /* @__PURE__ */ React6.createElement("circle", { cx: "18.5", cy: "12", r: "2.8" })),
  cap: /* @__PURE__ */ React6.createElement(React6.Fragment, null, /* @__PURE__ */ React6.createElement("path", { d: "M4 5h16", strokeWidth: "2.4" }), /* @__PURE__ */ React6.createElement("path", { d: "M12 20V9.5M8.5 13 12 9.5l3.5 3.5" })),
  rack: /* @__PURE__ */ React6.createElement("g", { ...F }, /* @__PURE__ */ React6.createElement("circle", { cx: "12", cy: "6", r: "1.8" }), /* @__PURE__ */ React6.createElement("circle", { cx: "9", cy: "11", r: "1.8" }), /* @__PURE__ */ React6.createElement("circle", { cx: "15", cy: "11", r: "1.8" }), /* @__PURE__ */ React6.createElement("circle", { cx: "6", cy: "16", r: "1.8" }), /* @__PURE__ */ React6.createElement("circle", { cx: "12", cy: "16", r: "1.8" }), /* @__PURE__ */ React6.createElement("circle", { cx: "18", cy: "16", r: "1.8" })),
  swat: /* @__PURE__ */ React6.createElement(React6.Fragment, null, /* @__PURE__ */ React6.createElement("rect", { x: "3.5", y: "10", width: "8", height: "10.5", rx: "3" }), /* @__PURE__ */ React6.createElement("path", { d: "M5.2 10V6.2M7.5 10V5.2M9.8 10V6.2" }), /* @__PURE__ */ React6.createElement("circle", { cx: "17", cy: "8.5", r: "2.6", ...F }), /* @__PURE__ */ React6.createElement("path", { d: "M14.4 14.4l-1.4 1.4M19.6 13.6l.8 1.8" })),
  redemption: /* @__PURE__ */ React6.createElement(React6.Fragment, null, /* @__PURE__ */ React6.createElement("path", { d: "M18 6v5a4 4 0 0 1-4 4H6" }), /* @__PURE__ */ React6.createElement("path", { d: "M9 12 6 15l3 3" })),
  ring: /* @__PURE__ */ React6.createElement(React6.Fragment, null, /* @__PURE__ */ React6.createElement("circle", { cx: "12", cy: "14.5", r: "6" }), /* @__PURE__ */ React6.createElement("path", { d: "M12 8.5 9.6 5.6 12 3l2.4 2.6z", ...F })),
  home: /* @__PURE__ */ React6.createElement(React6.Fragment, null, /* @__PURE__ */ React6.createElement("path", { d: "M4.6 11 12 4.8l7.4 6.2V19.5H4.6z" }), /* @__PURE__ */ React6.createElement("path", { d: "M10.4 19.5v-4.2h3.2v4.2" })),
  group: /* @__PURE__ */ React6.createElement(React6.Fragment, null, /* @__PURE__ */ React6.createElement("circle", { cx: "6", cy: "9", r: "2" }), /* @__PURE__ */ React6.createElement("path", { d: "M2.6 16a3.4 3.4 0 0 1 6.8 0" }), /* @__PURE__ */ React6.createElement("circle", { cx: "12", cy: "7", r: "2" }), /* @__PURE__ */ React6.createElement("path", { d: "M8.6 14a3.4 3.4 0 0 1 6.8 0" }), /* @__PURE__ */ React6.createElement("circle", { cx: "18", cy: "9", r: "2" }), /* @__PURE__ */ React6.createElement("path", { d: "M14.6 16a3.4 3.4 0 0 1 6.8 0" })),
  photo: /* @__PURE__ */ React6.createElement(React6.Fragment, null, /* @__PURE__ */ React6.createElement("rect", { x: "3.5", y: "5.5", width: "17", height: "13", rx: "2" }), /* @__PURE__ */ React6.createElement("path", { d: "m5 16.5 4-4 3 3 2-2 4 3.5" }), /* @__PURE__ */ React6.createElement("circle", { cx: "15.6", cy: "9.4", r: "1.4", ...F })),
  sports: /* @__PURE__ */ React6.createElement(React6.Fragment, null, /* @__PURE__ */ React6.createElement("circle", { cx: "12", cy: "12", r: "7.5" }), /* @__PURE__ */ React6.createElement("path", { d: "M4.5 12h15M12 4.5v15" })),
  anywhere: /* @__PURE__ */ React6.createElement(React6.Fragment, null, /* @__PURE__ */ React6.createElement("circle", { cx: "6", cy: "12", r: "2.4", ...F }), /* @__PURE__ */ React6.createElement("path", { d: "M9.5 12H19M9.5 10l8-5M9.5 14l8 5" }), /* @__PURE__ */ React6.createElement("path", { d: "M17 9.8 19 12l-2 2.2" })),
  second: /* @__PURE__ */ React6.createElement(React6.Fragment, null, /* @__PURE__ */ React6.createElement("path", { d: "M3 20h18M8 20V9h8v11M3 20v-7h5M16 20v-4h5" }), /* @__PURE__ */ React6.createElement("path", { d: "M3.6 13.6h3.8v5.8H3.6z", ...F })),
  third: /* @__PURE__ */ React6.createElement(React6.Fragment, null, /* @__PURE__ */ React6.createElement("path", { d: "M3 20h18M8 20V9h8v11M3 20v-7h5M16 20v-4h5" }), /* @__PURE__ */ React6.createElement("path", { d: "M16.6 16.6h3.8v2.8h-3.8z", ...F })),
  center: /* @__PURE__ */ React6.createElement(React6.Fragment, null, /* @__PURE__ */ React6.createElement("circle", { cx: "12", cy: "12", r: "7.5" }), /* @__PURE__ */ React6.createElement("circle", { cx: "12", cy: "12", r: "3.6", ...F })),
  nosip: /* @__PURE__ */ React6.createElement(React6.Fragment, null, /* @__PURE__ */ React6.createElement("rect", { x: "8", y: "4", width: "8", height: "16", rx: "2" }), /* @__PURE__ */ React6.createElement("path", { d: "M4.5 19.5 19.5 4.5" })),
  wait: /* @__PURE__ */ React6.createElement(React6.Fragment, null, /* @__PURE__ */ React6.createElement("path", { d: "M7 21V3.5" }), /* @__PURE__ */ React6.createElement("rect", { x: "7", y: "3.5", width: "12", height: "9" }), /* @__PURE__ */ React6.createElement("g", { ...F }, /* @__PURE__ */ React6.createElement("rect", { x: "7", y: "3.5", width: "3", height: "3" }), /* @__PURE__ */ React6.createElement("rect", { x: "13", y: "3.5", width: "3", height: "3" }), /* @__PURE__ */ React6.createElement("rect", { x: "10", y: "6.5", width: "3", height: "3" }), /* @__PURE__ */ React6.createElement("rect", { x: "16", y: "6.5", width: "3", height: "3" }), /* @__PURE__ */ React6.createElement("rect", { x: "7", y: "9.5", width: "3", height: "3" }), /* @__PURE__ */ React6.createElement("rect", { x: "13", y: "9.5", width: "3", height: "3" }))),
  total: /* @__PURE__ */ React6.createElement(React6.Fragment, null, /* @__PURE__ */ React6.createElement("rect", { x: "8", y: "4", width: "8", height: "16", rx: "1" }), /* @__PURE__ */ React6.createElement("path", { d: "M8 12h8" }), /* @__PURE__ */ React6.createElement("path", { d: "M8 4h8v8H8z", ...F })),
  cards: /* @__PURE__ */ React6.createElement(React6.Fragment, null, /* @__PURE__ */ React6.createElement("rect", { x: "4", y: "5", width: "9", height: "13", rx: "1.6", transform: "rotate(-10 8.5 11.5)" }), /* @__PURE__ */ React6.createElement("rect", { x: "11", y: "6", width: "9", height: "13", rx: "1.6", transform: "rotate(10 15.5 12.5)", className: "fd-rp-card" })),
  order: /* @__PURE__ */ React6.createElement("path", { d: "M5 7h14M5 12h10M5 17h6" }),
  move: /* @__PURE__ */ React6.createElement(React6.Fragment, null, /* @__PURE__ */ React6.createElement("path", { d: "M12 3.5v17M3.5 12h17" }), /* @__PURE__ */ React6.createElement("path", { d: "M9.6 6 12 3.5 14.4 6M9.6 18l2.4 2.5 2.4-2.5M6 9.6 3.5 12 6 14.4M18 9.6l2.5 2.4-2.5 2.4" })),
  runner: /* @__PURE__ */ React6.createElement(React6.Fragment, null, /* @__PURE__ */ React6.createElement("circle", { cx: "12", cy: "7.5", r: "3" }), /* @__PURE__ */ React6.createElement("path", { d: "M6 19.5a6 6 0 0 1 12 0" })),
  shuffle: /* @__PURE__ */ React6.createElement(React6.Fragment, null, /* @__PURE__ */ React6.createElement("path", { d: "M3.5 7h4c4 0 5 10 9 10h4M3.5 17h4c4 0 5-10 9-10h4" }), /* @__PURE__ */ React6.createElement("path", { d: "M18.4 4.8 20.5 7l-2.1 2.2M18.4 14.8l2.1 2.2-2.1 2.2" })),
  floor: /* @__PURE__ */ React6.createElement(React6.Fragment, null, /* @__PURE__ */ React6.createElement("rect", { x: "3", y: "9", width: "18", height: "6", rx: "3" }), /* @__PURE__ */ React6.createElement("path", { d: "M3 12a3 3 0 0 1 3-3h4v6H6a3 3 0 0 1-3-3z", ...F }), /* @__PURE__ */ React6.createElement("path", { d: "M10 6v12" })),
  own: /* @__PURE__ */ React6.createElement(React6.Fragment, null, /* @__PURE__ */ React6.createElement("circle", { cx: "9", cy: "8", r: "2.6" }), /* @__PURE__ */ React6.createElement("path", { d: "M4.4 17.5a4.6 4.6 0 0 1 9.2 0" }), /* @__PURE__ */ React6.createElement("circle", { cx: "17.5", cy: "15", r: "3.4", ...F })),
  side: /* @__PURE__ */ React6.createElement(React6.Fragment, null, /* @__PURE__ */ React6.createElement("circle", { cx: "12", cy: "12", r: "7.5" }), /* @__PURE__ */ React6.createElement("circle", { cx: "12", cy: "12", r: "3" })),
  lock: /* @__PURE__ */ React6.createElement(React6.Fragment, null, /* @__PURE__ */ React6.createElement("rect", { x: "6", y: "11", width: "12", height: "9", rx: "2" }), /* @__PURE__ */ React6.createElement("path", { d: "M8.5 11V8a3.5 3.5 0 0 1 7 0v3" })),
  fix: /* @__PURE__ */ React6.createElement(React6.Fragment, null, /* @__PURE__ */ React6.createElement("path", { d: "M7 9h8a4 4 0 0 1 0 8H9" }), /* @__PURE__ */ React6.createElement("path", { d: "M10 5.5 6.5 9l3.5 3.5" })),
  void: /* @__PURE__ */ React6.createElement(React6.Fragment, null, /* @__PURE__ */ React6.createElement("circle", { cx: "12", cy: "12", r: "7.5" }), /* @__PURE__ */ React6.createElement("path", { d: "M6.7 17.3 17.3 6.7" })),
  early: /* @__PURE__ */ React6.createElement(React6.Fragment, null, /* @__PURE__ */ React6.createElement("path", { d: "M7 21V4" }), /* @__PURE__ */ React6.createElement("path", { d: "M7 4h10l-2.6 3.5L17 11H7z", ...F })),
  daily: /* @__PURE__ */ React6.createElement(React6.Fragment, null, /* @__PURE__ */ React6.createElement("rect", { x: "4", y: "5.5", width: "16", height: "14.5", rx: "2" }), /* @__PURE__ */ React6.createElement("path", { d: "M4 9.5h16M8 3.5v4M16 3.5v4" }), /* @__PURE__ */ React6.createElement("g", { ...F }, /* @__PURE__ */ React6.createElement("circle", { cx: "8", cy: "14.5", r: "1.3" }), /* @__PURE__ */ React6.createElement("circle", { cx: "12", cy: "14.5", r: "1.3" }), /* @__PURE__ */ React6.createElement("circle", { cx: "16", cy: "14.5", r: "1.3" }))),
  pair: /* @__PURE__ */ React6.createElement(React6.Fragment, null, /* @__PURE__ */ React6.createElement("circle", { cx: "8", cy: "8", r: "2.4" }), /* @__PURE__ */ React6.createElement("path", { d: "M3.8 17a4.2 4.2 0 0 1 8.4 0" }), /* @__PURE__ */ React6.createElement("circle", { cx: "16", cy: "8", r: "2.4" }), /* @__PURE__ */ React6.createElement("path", { d: "M11.8 17a4.2 4.2 0 0 1 8.4 0" })),
  lapse: /* @__PURE__ */ React6.createElement("path", { d: "M7.5 3.5h9l-4.5 8.5 4.5 8.5h-9l4.5-8.5z" }),
  private: /* @__PURE__ */ React6.createElement(React6.Fragment, null, /* @__PURE__ */ React6.createElement("path", { d: "M3 12s3.4-5.6 9-5.6 9 5.6 9 5.6-3.4 5.6-9 5.6S3 12 3 12z" }), /* @__PURE__ */ React6.createElement("circle", { cx: "12", cy: "12", r: "2.3" }), /* @__PURE__ */ React6.createElement("path", { d: "M5 19 19 5" })),
  drink: /* @__PURE__ */ React6.createElement(React6.Fragment, null, /* @__PURE__ */ React6.createElement("path", { d: "M6.5 5h11l-1.6 14.5H8.1z" }), /* @__PURE__ */ React6.createElement("path", { d: "M7.2 10h9.6" })),
  na: /* @__PURE__ */ React6.createElement(React6.Fragment, null, /* @__PURE__ */ React6.createElement("path", { d: "M3.5 7h7l-1 11h-5z" }), /* @__PURE__ */ React6.createElement("path", { d: "M13.5 7h7l-1 11h-5z", ...F })),
  forced: /* @__PURE__ */ React6.createElement(React6.Fragment, null, /* @__PURE__ */ React6.createElement("circle", { cx: "9", cy: "8", r: "2.6" }), /* @__PURE__ */ React6.createElement("path", { d: "M4.4 17.5a4.6 4.6 0 0 1 9.2 0" }), /* @__PURE__ */ React6.createElement("path", { d: "m14.6 12.6 2.2 2.2 4-4.4" })),
  water: /* @__PURE__ */ React6.createElement("path", { d: "M12 3.5S5.6 10.8 5.6 14.4a6.4 6.4 0 0 0 12.8 0C18.4 10.8 12 3.5 12 3.5z" }),
  camera: /* @__PURE__ */ React6.createElement(React6.Fragment, null, /* @__PURE__ */ React6.createElement("circle", { cx: "12", cy: "12", r: "4" }), /* @__PURE__ */ React6.createElement("ellipse", { cx: "12", cy: "12", rx: "9", ry: "3.6", transform: "rotate(-18 12 12)" }), /* @__PURE__ */ React6.createElement("circle", { cx: "12", cy: "12", r: "1.4", ...F })),
  stop: /* @__PURE__ */ React6.createElement(React6.Fragment, null, /* @__PURE__ */ React6.createElement("path", { d: "M8.6 3.5h6.8l5 5v6.8l-5 5H8.6l-5-5V8.5z" }), /* @__PURE__ */ React6.createElement("path", { d: "M8 12h8" })),
  semis: /* @__PURE__ */ React6.createElement("path", { d: "M3.5 5h5v6h-5M8.5 8h4M3.5 13h5v6h-5M8.5 16h4M12.5 8v8M12.5 12h8" }),
  crew: /* @__PURE__ */ React6.createElement(React6.Fragment, null, /* @__PURE__ */ React6.createElement("circle", { cx: "12", cy: "12", r: "7.5", strokeDasharray: "2 2.4" }), /* @__PURE__ */ React6.createElement("circle", { cx: "12", cy: "12", r: "3" })),
  putt: /* @__PURE__ */ React6.createElement(React6.Fragment, null, /* @__PURE__ */ React6.createElement("path", { d: "M12 20V4" }), /* @__PURE__ */ React6.createElement("path", { d: "M12 4l7 2.6-7 2.6z", ...F }), /* @__PURE__ */ React6.createElement("ellipse", { cx: "12", cy: "20", rx: "5", ry: "1.6" }))
};
var PICTURE_KEYS = Object.freeze(Object.keys(RULE_PICTURES));

// src/features/rules/GameSteps.jsx
var STROKE = { sheet: 1.3, card: 1.6, tv: 0.9 };
function StepPicture({ id, size = "sheet" }) {
  const art = RULE_PICTURES[id];
  return /* @__PURE__ */ React7.createElement(
    "svg",
    {
      className: "fd-rules-pic",
      viewBox: "0 0 64 40",
      "aria-hidden": "true",
      focusable: "false",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: STROKE[size] || STROKE.sheet,
      strokeLinecap: "round",
      strokeLinejoin: "round"
    },
    art || /* @__PURE__ */ React7.createElement("circle", { cx: "32", cy: "20", r: "6" })
  );
}
function NoteGlyph({ id, size = 20 }) {
  return /* @__PURE__ */ React7.createElement(
    "svg",
    {
      className: "fd-rules-glyph",
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      "aria-hidden": "true",
      focusable: "false",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: size <= 20 ? 1.9 : 1.6,
      strokeLinecap: "round",
      strokeLinejoin: "round"
    },
    NOTE_GLYPHS[id] || /* @__PURE__ */ React7.createElement("circle", { cx: "12", cy: "12", r: "3", fill: "currentColor", stroke: "none" })
  );
}
function GameSteps({ game, variant, size = "sheet", notes = true, max = 0, className = "" }) {
  const model = gameStepsModel(game, variant);
  if (!model) return null;
  const steps = max > 0 ? model.steps.slice(0, max) : model.steps;
  const tile = size === "card" ? ` is-${steps.length}-up` : "";
  return /* @__PURE__ */ React7.createElement("div", { className: `fd-rules is-${size}${tile}${className ? ` ${className}` : ""}`, "data-rules": model.id }, steps.length > 0 && /* @__PURE__ */ React7.createElement("ol", { className: "fd-rules-steps" }, steps.map((step) => /* @__PURE__ */ React7.createElement("li", { key: step.key, className: `fd-rules-step${step.win ? " is-win" : ""}`, "data-rule-key": step.key }, /* @__PURE__ */ React7.createElement("span", { className: "fd-rules-window" }, /* @__PURE__ */ React7.createElement(StepPicture, { id: step.key, size })), /* @__PURE__ */ React7.createElement("span", { className: "fd-rules-words" }, step.words)))), notes && model.notes.length > 0 && /* @__PURE__ */ React7.createElement("ul", { className: "fd-rules-notes" }, model.notes.map((note) => /* @__PURE__ */ React7.createElement("li", { key: note.key, "data-rule-key": note.key }, /* @__PURE__ */ React7.createElement(NoteGlyph, { id: note.glyph, size: size === "tv" ? 32 : 20 }), /* @__PURE__ */ React7.createElement("span", null, note.words)))));
}

// src/features/weekend/HowToSheet.jsx
function HowToSheet({ gameId, variant, ev, onClose }) {
  const game = GAMES[gameId];
  const title = ev?.name || game?.name;
  if (!hasGameSteps(gameId, variant)) return ev?.desc ? /* @__PURE__ */ React8.createElement(Sheet, { title: ev.name, onClose, show: true }, /* @__PURE__ */ React8.createElement("article", { className: "fd-weekend-howto" }, /* @__PURE__ */ React8.createElement("p", { className: "fd-weekend-howto-objective" }, ev.desc))) : null;
  return /* @__PURE__ */ React8.createElement(Sheet, { title, onClose, show: true }, /* @__PURE__ */ React8.createElement("article", { className: "fd-weekend-howto" }, /* @__PURE__ */ React8.createElement(GameSteps, { game: gameId, variant, size: "sheet" })));
}

// src/features/weekend/ContestPanel.jsx
init_core();
init_show();
init_PlayerIdentity();
init_CompetitionBracket();
init_directorPill();
init_haptics();
import React11, { useEffect as useEffect5, useRef as useRef5, useState as useState6 } from "react";
init_Icon();
var nameOf2 = (state, side) => side.name || side.players.map((player) => disp(state, player)).join(" & ");
var UNDO_WINDOW_MS = 5e3;
var ORD = ["1st", "2nd", "3rd", "4th", "5th", "6th"];
var placesPaid = (ev) => awardTable(ev).filter((pts) => pts > 0).length;
function CurrentContest({ state, ev, contest, me, gm, onPlayer, onBets, onLock, onWinner, onResult, onPlayNext, onRecorded, operationBusy, onBusy, blocked }) {
  const [winner, setWinner] = useState6(null), [qualifiers, setQualifiers] = useState6([]);
  const [order, setOrder] = useState6([]);
  const [pending, setPending] = useState6(false), [error, setError] = useState6("");
  const busy = useRef5(false), retry = useRef5(null);
  const open = contest.phase === "betting-open", locked = contest.phase === "betting-locked";
  const running2 = contest.phase === "in-progress" || contest.phase === "awaiting-result";
  const isFfa = contest.kind === "ffa", isBracket = contest.kind === "match";
  const advance = contest.kind === "heat" ? state.stages?.[ev.id]?.advance || 1 : 1;
  const reference2 = { contestId: contest.id, contestRevision: contest.revision };
  const final = contestIsFinal(state, ev, contest);
  const needed = Math.min(placesPaid(ev), contest.sides.length);
  const ordering = gm && contest.kind === "stage-final" && contest.sides.length >= 3 && needed >= 2;
  const act = async (callback) => {
    if (busy.current || operationBusy.current) return;
    busy.current = true;
    operationBusy.current = true;
    onBusy(true);
    retry.current = callback;
    setPending(true);
    setError("");
    try {
      const result = await callback();
      if (result?.ok !== true) setError(result?.error || "Change not saved. Try again.");
      return result;
    } catch (failure) {
      setError(failure?.message || "Change not saved. Try again.");
    } finally {
      busy.current = false;
      operationBusy.current = false;
      onBusy(false);
      setPending(false);
    }
  };
  const sideName = (key) => {
    const side = contest.sides.find((item) => item.key === key);
    return side ? nameOf2(state, side) : "";
  };
  const submit = (payload) => async () => {
    tapTick();
    const result = await onWinner({ ...reference2, ...payload, ...final ? { postResult: true } : {} });
    if (result?.ok === true) onRecorded?.(sideName(payload.winner), !!result.extra?.posted);
    return result;
  };
  const record = (key) => act(submit({ winner: key, qualifiers: [key] }));
  const selectingQualifiers = advance > 1 && winner !== null;
  const unplaced = contest.sides.filter((side) => !order.includes(side.key));
  const fullOrder = order.length >= needed ? order.slice(0, needed) : order.length === needed - 1 && unplaced.length === 1 ? [...order, unplaced[0].key] : null;
  const bracket = isBracket ? state.brackets?.[ev.id] : null;
  const chipsIn = open && (state.wagers || []).some((wager) => wagerMatchesContest(wager, contest) && resolveWager(state, wager, allEventsOf(state)).status === "pending");
  const alternatives = gm && open && bracket && onPlayNext ? bracketOrder(bracket).filter(([r, m]) => bracketMatchOpen(bracket, r, m) && (r !== contest.match[0] || m !== contest.match[1])) : [];
  const canChoose = gm && running2 && !!onWinner;
  const showEntrants = !isFfa && (!isBracket || canChoose);
  const owed = selectingQualifiers ? advance - 1 - qualifiers.length : 0;
  const heading = isBracket ? contestName(state, ev, contest) : contest.label && contest.label !== ev.name ? contest.label : null;
  const playing = !!me && !!contest.players?.includes(me);
  const yourBet = me ? (state.wagers || []).filter((wager) => wager.player === me && wagerMatchesContest(wager, contest) && resolveWager(state, wager, allEventsOf(state)).status === "pending").reduce((sum, wager) => sum + (wager.stake || 0), 0) : 0;
  return /* @__PURE__ */ React11.createElement("section", { className: "fd-contest", "aria-label": "Current contest", "aria-busy": pending }, /* @__PURE__ */ React11.createElement("div", { className: "fd-contest-toolbar" }, /* @__PURE__ */ React11.createElement("div", null, heading && /* @__PURE__ */ React11.createElement("strong", null, heading), /* @__PURE__ */ React11.createElement("span", null, (open || running2) && /* @__PURE__ */ React11.createElement("i", { className: "fd-beat-dot", "aria-hidden": "true" }), open ? "Betting open" : locked ? "Betting locked" : running2 ? "In progress" : "Next contest"), !gm && (playing || yourBet > 0) && /* @__PURE__ */ React11.createElement("span", { className: "fd-contest-you" }, playing && /* @__PURE__ */ React11.createElement("span", null, "You\u2019re playing"), yourBet > 0 && /* @__PURE__ */ React11.createElement("b", { "aria-label": `Your bet ${yourBet.toLocaleString("en-US")}` }, /* @__PURE__ */ React11.createElement("i", { className: "fd-contest-chip", "aria-hidden": "true" }), yourBet.toLocaleString("en-US")))), gm && (open || locked) && /* @__PURE__ */ React11.createElement(
    "button",
    {
      type: "button",
      className: "fd-contest-primary",
      disabled: pending || blocked || !onLock,
      onClick: () => act(() => onLock(reference2))
    },
    pending ? "Starting\u2026" : "Lock bets and start"
  ), !gm && onBets && /* @__PURE__ */ React11.createElement("button", { type: "button", className: "fd-contest-primary", disabled: pending || blocked, onClick: onBets }, open ? playing ? "Back yourself" : "Place chips" : "View bets"), gm && running2 && isFfa && /* @__PURE__ */ React11.createElement(
    "button",
    {
      type: "button",
      className: "fd-contest-primary",
      disabled: pending || !onResult,
      onClick: () => act(async () => {
        const result = await onResult();
        return result === true ? { ok: true } : result;
      })
    },
    "Enter result"
  )), showEntrants && /* @__PURE__ */ React11.createElement("div", { className: "fd-contest-entrants", "aria-label": contest.label }, contest.sides.map((side) => {
    const name = nameOf2(state, side), selected = winner === side.key;
    const qualifier = selectingQualifiers && !selected;
    const place = order.indexOf(side.key);
    const label2 = !canChoose ? name : ordering ? place >= 0 ? `Remove ${name} from ${ORD[place]}` : `${ORD[order.length]}: ${name}` : `${qualifier ? "Also advances" : "Winner"}: ${name}`;
    return /* @__PURE__ */ React11.createElement("div", { key: String(side.key), className: `fd-contest-entrant ${side.players.includes(me) ? "is-you" : ""} ${selected || place === 0 ? "is-winner" : ""}` }, /* @__PURE__ */ React11.createElement(
      "button",
      {
        type: "button",
        className: "fd-contest-entrant-pick",
        disabled: pending || blocked || !canChoose || ordering && place < 0 && order.length >= needed,
        role: canChoose && qualifier ? "checkbox" : void 0,
        "aria-checked": canChoose && qualifier ? qualifiers.includes(side.key) : void 0,
        "aria-pressed": canChoose && (ordering ? place >= 0 : advance > 1 && !qualifier ? selected : void 0),
        "aria-label": label2,
        onClick: () => {
          if (busy.current || operationBusy.current || !canChoose) return;
          if (ordering) {
            setOrder((current) => place >= 0 ? current.slice(0, place) : current.length < needed ? [...current, side.key] : current);
            return;
          }
          if (advance === 1) return record(side.key);
          if (!selectingQualifiers || selected) {
            setWinner(side.key);
            setQualifiers([]);
            return;
          }
          setQualifiers((current) => current.includes(side.key) ? current.filter((key) => key !== side.key) : current.length < advance - 1 ? [...current, side.key] : current);
        }
      },
      /* @__PURE__ */ React11.createElement("span", null, name),
      canChoose && /* @__PURE__ */ React11.createElement("small", null, ordering ? place >= 0 ? ORD[place] : order.length < needed ? ORD[order.length] : "" : selected ? "Winner" : qualifier ? /* @__PURE__ */ React11.createElement(Icon, { name: qualifiers.includes(side.key) ? "check" : "plus", size: "1em" }) : "Win")
    ), /* @__PURE__ */ React11.createElement("div", { className: "fd-contest-entrant-players" }, side.players.map((player) => /* @__PURE__ */ React11.createElement(
      "button",
      {
        key: player,
        type: "button",
        onClick: () => onPlayer?.(player),
        disabled: pending || blocked || !onPlayer,
        "aria-label": `View ${disp(state, player)}'s player card`
      },
      /* @__PURE__ */ React11.createElement(Avatar, { state, p: player, size: 28 })
    ))));
  }), canChoose && advance > 1 && selectingQualifiers && /* @__PURE__ */ React11.createElement("div", { className: "fd-contest-qualifier-actions" }, /* @__PURE__ */ React11.createElement("button", { type: "button", className: "fd-contest-secondary", disabled: pending, onClick: () => {
    setWinner(null);
    setQualifiers([]);
  } }, "Change winner"), /* @__PURE__ */ React11.createElement(
    "button",
    {
      type: "button",
      className: "fd-contest-primary",
      disabled: pending || qualifiers.length !== advance - 1 || !onWinner,
      onClick: () => act(submit({ winner, qualifiers: [winner, ...qualifiers] }))
    },
    pending ? "Saving\u2026" : owed > 0 ? `Pick ${owed} more` : "Record winner"
  )), canChoose && ordering && /* @__PURE__ */ React11.createElement("div", { className: "fd-contest-qualifier-actions" }, /* @__PURE__ */ React11.createElement("button", { type: "button", className: "fd-contest-secondary", disabled: pending || !order.length, onClick: () => setOrder([]) }, "Start over"), /* @__PURE__ */ React11.createElement(
    "button",
    {
      type: "button",
      className: "fd-contest-primary",
      disabled: pending || !fullOrder,
      onClick: () => act(submit({ winner: fullOrder[0], qualifiers: [fullOrder[0]], order: fullOrder }))
    },
    pending ? "Saving\u2026" : fullOrder ? "Record order" : `Pick ${ORD[order.length]}`
  ))), isBracket && /* @__PURE__ */ React11.createElement(
    CompetitionBracket,
    {
      state,
      ev,
      me,
      gm,
      pending: pending || blocked,
      onPlayer,
      pickable: false
    }
  ), !!alternatives.length && /* @__PURE__ */ React11.createElement("div", { className: "fd-contest-reorder" }, alternatives.map(([r, m]) => {
    const label2 = contestName(state, ev, { kind: "match", match: [r, m] });
    return /* @__PURE__ */ React11.createElement(
      "button",
      {
        key: `${r}:${m}`,
        type: "button",
        className: "fd-contest-secondary",
        disabled: pending || blocked || chipsIn,
        onClick: () => act(() => onPlayNext({ ...reference2, match: [r, m] }))
      },
      "Play ",
      label2,
      " next"
    );
  }), chipsIn && /* @__PURE__ */ React11.createElement("p", null, "Chips are on this match.")), error && /* @__PURE__ */ React11.createElement("div", { className: "fd-contest-failure" }, /* @__PURE__ */ React11.createElement("p", { role: "alert", className: "fd-contest-error" }, error), /* @__PURE__ */ React11.createElement("button", { type: "button", className: "fd-contest-secondary", disabled: pending, onClick: () => act(retry.current) }, "Retry")), pending && running2 && !isFfa && /* @__PURE__ */ React11.createElement("p", { className: "fd-contest-saving", role: "status" }, "Saving result\u2026"));
}
function useContestOperations() {
  const operationBusy = useRef5(false), [blocked, onBusy] = useState6(false);
  const [recent, setRecent] = useState6(null);
  useEffect5(() => {
    if (!recent) return;
    const timer = setTimeout(() => setRecent(null), Math.max(0, recent.at + UNDO_WINDOW_MS - Date.now()));
    return () => clearTimeout(timer);
  }, [recent]);
  return { operationBusy, blocked, onBusy, recent, setRecent };
}
function ContestPanel(props) {
  const { state, ev, gm, onResult, onUndo, part = null } = props;
  const own = useContestOperations();
  const { operationBusy, blocked, onBusy, recent, setRecent } = props.operations || own;
  const operations = { operationBusy, blocked, onBusy };
  const showContest = part !== "commissioner", showDesk = part !== "contest";
  const onRecorded = gm && onUndo ? (name, posted) => setRecent({ name, posted, at: Date.now() }) : null;
  const undoRecent = showContest && recent && gm && onUndo ? /* @__PURE__ */ React11.createElement(RecentWinner, { ...props, ...operations, name: recent.name, posted: recent.posted, onDone: () => setRecent(null) }) : null;
  if (state.results?.[ev.id] || state.shelved?.[ev.id] || state.frozen || ev.finale) return undoRecent;
  const correction = recent || !showDesk ? null : /* @__PURE__ */ React11.createElement(ContestCorrection, { ...props, ...operations });
  const lifecycle = resolveEventLifecycle(state, ev), contest = resolveCurrentContest(state, ev);
  if (!contest || !["betting-open", "betting-locked", "in-progress", "awaiting-result"].includes(contest.phase)) {
    return gm && ["enter-result", "post-result"].includes(lifecycle.nextAction?.type) ? /* @__PURE__ */ React11.createElement(React11.Fragment, null, undoRecent, showDesk && /* @__PURE__ */ React11.createElement(ContestFinish, { key: ev.id, onResult, ...operations }), correction) : undoRecent;
  }
  return /* @__PURE__ */ React11.createElement(React11.Fragment, null, undoRecent, showContest && /* @__PURE__ */ React11.createElement(
    CurrentContest,
    {
      key: `${ev.id}:${contest.id}:${contest.revision}:${contest.phase}`,
      ...props,
      ...operations,
      contest,
      onRecorded
    }
  ), correction);
}
function useCorrection({ state, ev, onUndo, operationBusy, onBusy }, after) {
  const [pending, setPending] = useState6(false), [error, setError] = useState6("");
  const busy = useRef5(false);
  const run2 = async (contestId = null) => {
    if (busy.current || operationBusy.current) return;
    const undo = contestId ? contestCorrectionAvailability(state, ev, contestId) : lastWinnerUndo(state, ev);
    busy.current = true;
    operationBusy.current = true;
    onBusy(true);
    setPending(true);
    setError("");
    try {
      const result = await onUndo({ contestId: undo.contestId, contestRevision: undo.contestRevision });
      if (!result?.ok) setError(result?.error || "Change not saved. Try again.");
      else after?.();
    } catch (failure) {
      setError(failure?.message || "Change not saved. Try again.");
    } finally {
      busy.current = false;
      operationBusy.current = false;
      onBusy(false);
      setPending(false);
    }
  };
  return { pending, error, run: run2 };
}
function RecentWinner(props) {
  const { state, ev, name, posted, blocked, onDone } = props;
  const undo = lastWinnerUndo(state, ev);
  const correction = useCorrection(props, onDone);
  if (!undo.enabled) return null;
  const moved = correctionText(state, undo);
  return /* @__PURE__ */ React11.createElement("div", { className: "fd-contest-recent", role: "status" }, /* @__PURE__ */ React11.createElement("span", null, "Winner recorded: ", name, posted ? ". Result posted" : "", moved ? `. ${moved}` : ""), /* @__PURE__ */ React11.createElement("button", { type: "button", disabled: correction.pending || blocked, onClick: () => correction.run() }, correction.pending ? "Undoing\u2026" : "Undo"), correction.error && /* @__PURE__ */ React11.createElement("p", { role: "alert", className: "fd-contest-error" }, correction.error));
}
function ContestFinish({ onResult, operationBusy, blocked, onBusy }) {
  const [pending, setPending] = useState6(false), [error, setError] = useState6("");
  const post = async () => {
    if (operationBusy.current || !onResult) return;
    operationBusy.current = true;
    onBusy(true);
    setPending(true);
    setError("");
    try {
      const result = await onResult();
      if (result !== true && result?.ok !== true) setError(result?.error || "Change not saved. Try again.");
      return result;
    } catch (failure) {
      setError(failure?.message || "Change not saved. Try again.");
    } finally {
      operationBusy.current = false;
      onBusy(false);
      setPending(false);
    }
  };
  return /* @__PURE__ */ React11.createElement("section", { className: "fd-contest", "aria-busy": pending }, /* @__PURE__ */ React11.createElement("div", { className: "fd-contest-toolbar" }, /* @__PURE__ */ React11.createElement("strong", null, "Competition complete"), /* @__PURE__ */ React11.createElement("button", { type: "button", className: "fd-contest-primary", disabled: blocked || pending || !onResult, onClick: post }, pending ? "Opening result\u2026" : "Post event result")), error && /* @__PURE__ */ React11.createElement("div", { className: "fd-contest-failure" }, /* @__PURE__ */ React11.createElement("p", { role: "alert", className: "fd-contest-error" }, error), /* @__PURE__ */ React11.createElement("button", { type: "button", className: "fd-contest-secondary", disabled: blocked || pending, onClick: post }, "Retry")));
}
function lastContestView(state, ev, last) {
  if (!last) return null;
  const draw = state.draws?.[ev.id], stages = state.stages?.[ev.id];
  const team = (key) => draw?.teams?.[key]?.players || [];
  const players = (key) => last.kind === "match" ? team(key) : stages ? stageEntrantView(state, stages, key).players : [];
  const named = (key) => players(key).map((player) => disp(state, player)).join(" & ");
  let keys = [];
  if (last.kind === "match") {
    const match = state.brackets?.[ev.id]?.rounds?.[last.match?.[0]]?.[last.match?.[1]];
    if (match) keys = [resolveSlot(state.brackets[ev.id], match.a), resolveSlot(state.brackets[ev.id], match.b)];
  } else if (last.kind === "heat") keys = stages?.groups?.[last.group]?.entrants || [];
  else keys = stages && stageFinalists(stages) || [];
  const sides = keys.filter((key) => key !== null && key !== void 0).map(named);
  return {
    name: contestName(state, ev, { kind: last.kind, match: last.match, group: last.group }),
    matchup: sides.length === 2 ? sides.join(" vs ") : sides.join(", "),
    winner: named(last.winner)
  };
}
function ContestCorrection(props) {
  const { state, ev, gm, onUndo, blocked } = props;
  const [confirming, setConfirming] = useState6(null);
  const correction = useCorrection(props, () => setConfirming(null));
  const options = contestCorrections(state, ev);
  if (!gm || !onUndo || !options.length) return null;
  const stack2 = contestStackOf(state, ev.id);
  return /* @__PURE__ */ React11.createElement("div", { className: "fd-contest-correction" }, options.map((option) => {
    const view = lastContestView(state, ev, stack2.find((entry) => entry.id === option.contestId));
    const name = view?.name || option.contest;
    const moved = correctionText(state, option);
    return /* @__PURE__ */ React11.createElement(React11.Fragment, { key: option.contestId }, confirming === option.contestId ? /* @__PURE__ */ React11.createElement("div", { className: "fd-contest-confirm" }, /* @__PURE__ */ React11.createElement("p", null, "Reopens ", name, view?.matchup ? `: ${view.matchup}` : "", ".", view?.winner ? ` ${view.winner} loses the win.` : "", moved ? ` ${moved}` : ""), /* @__PURE__ */ React11.createElement(
      "button",
      {
        type: "button",
        disabled: correction.pending || blocked || !option.enabled,
        onClick: () => correction.run(option.contestId)
      },
      correction.pending ? "Undoing\u2026" : `Reopen ${name}`
    ), /* @__PURE__ */ React11.createElement("button", { type: "button", disabled: correction.pending, onClick: () => setConfirming(null) }, "Keep it")) : /* @__PURE__ */ React11.createElement(
      "button",
      {
        type: "button",
        disabled: correction.pending || blocked || !option.enabled,
        onClick: () => setConfirming(option.contestId)
      },
      "Fix ",
      name
    ));
  }), !options[0].enabled && /* @__PURE__ */ React11.createElement("p", null, options[0].blocker), correction.error && /* @__PURE__ */ React11.createElement("p", { role: "alert", className: "fd-contest-error" }, correction.error));
}

// src/features/weekend/EventSheetParts.jsx
init_core();
init_PlayerIdentity();
init_PayoutLadder();
import React14 from "react";
var BEFORE = /* @__PURE__ */ new Set(["scheduled", "setup", "draw-pending", "draw-revealed"]);
function eventStage(state, ev) {
  if (state.results?.[ev.id]) return "after";
  if (state.shelved?.[ev.id] || BEFORE.has(resolveEventLifecycle(state, ev).phase)) return "before";
  return "live";
}
var fmt3 = (n) => (Number(n) || 0).toLocaleString("en-US");
var signed = (n) => `${n > 0 ? "+" : n < 0 ? "\u2212" : ""}${fmt3(Math.abs(n))}`;
function Person({ state, p, me, size = 30, onPlayer }) {
  return /* @__PURE__ */ React14.createElement(
    "button",
    {
      type: "button",
      className: `fd-es-person${p === me ? " is-you" : ""}`,
      disabled: !onPlayer,
      onClick: () => onPlayer?.(p),
      "aria-label": `View ${disp(state, p)}'s player card`
    },
    /* @__PURE__ */ React14.createElement(Avatar, { state, p, size }),
    /* @__PURE__ */ React14.createElement("span", null, disp(state, p))
  );
}
function EventTeams({ state, ev, draw, me, onPlayer }) {
  if (!draw?.teams?.length) return null;
  const two = draw.teams.length === 2;
  return /* @__PURE__ */ React14.createElement("section", { className: `fd-es-pane fd-es-teams${two ? " is-versus" : ""}`, "aria-label": "Teams" }, draw.teams.map((team, i) => {
    const mine = !!me && team.players.includes(me);
    return /* @__PURE__ */ React14.createElement(React14.Fragment, { key: i }, two && i === 1 && /* @__PURE__ */ React14.createElement("span", { className: "fd-es-vs", "aria-hidden": "true" }, "vs"), /* @__PURE__ */ React14.createElement("div", { className: `fd-es-team${mine ? " is-you" : ""}` }, team.players.length > 1 && /* @__PURE__ */ React14.createElement("h3", { className: "fd-show" }, teamLabel(state, team)), /* @__PURE__ */ React14.createElement("div", { className: "fd-es-people" }, team.players.map((p) => /* @__PURE__ */ React14.createElement(Person, { key: p, state, p, me, onPlayer })))));
  }));
}
function EventField({ state, ev, me, onPlayer }) {
  const roles = new Set((state.draws?.[ev.id]?.roles || []).map((item) => item.player));
  const field = presentPlayers(state).filter((p) => !roles.has(p));
  if (!field.length) return null;
  return /* @__PURE__ */ React14.createElement("section", { className: "fd-es-pane fd-es-field", "aria-label": "Playing" }, /* @__PURE__ */ React14.createElement("div", { className: "fd-es-people" }, field.map((p) => /* @__PURE__ */ React14.createElement(Person, { key: p, state, p, me, onPlayer }))));
}
function EventCrew({ state, roles, me, onPlayer }) {
  const crew = (roles || []).filter((item) => item?.player);
  if (!crew.length) return null;
  return /* @__PURE__ */ React14.createElement("section", { className: "fd-es-crew", "aria-label": "Crew" }, /* @__PURE__ */ React14.createElement("span", { className: "fd-es-crew-medal", "aria-hidden": "true" }), /* @__PURE__ */ React14.createElement("div", { className: "fd-es-people" }, crew.map(({ player, role }) => /* @__PURE__ */ React14.createElement("span", { key: player, className: "fd-es-crew-person" }, /* @__PURE__ */ React14.createElement(Person, { state, p: player, me, size: 26, onPlayer }), /* @__PURE__ */ React14.createElement("small", null, overflowRoleMeta(role).short)))));
}
function EventRiding({ state, ev }) {
  const events = allEventsOf(state);
  const open = (state.wagers || []).filter((w) => w.eventId === ev.id && resolveWager(state, w, events).status === "pending");
  const total = open.reduce((sum, w) => sum + (w.stake || 0), 0);
  if (!total) return null;
  const bettors = [...new Set(open.map((w) => w.player))];
  return /* @__PURE__ */ React14.createElement("section", { className: "fd-es-riding", "aria-label": `${fmt3(total)} in play` }, /* @__PURE__ */ React14.createElement("i", { className: "fd-es-chip", "aria-hidden": "true" }), /* @__PURE__ */ React14.createElement("b", null, fmt3(total)), /* @__PURE__ */ React14.createElement("span", { className: "fd-es-riding-label" }, "In play"), /* @__PURE__ */ React14.createElement(AvatarStack, { state, players: bettors, size: 24, max: 6 }));
}
function yourTake(state, ev, me) {
  if (!me) return null;
  const res = state.results?.[ev.id];
  if (!res) return null;
  const events = allEventsOf(state);
  const award = res.stacks ? 0 : resultAwards(state, ev, res).filter((item) => item.player === me).reduce((sum, item) => sum + item.pts, 0);
  const mvp = state.mvp?.[ev.id]?.closedAt && state.mvp[ev.id].winner === me && mvpStands(state, ev.id) ? MVP_PTS : 0;
  const bets = (state.wagers || []).filter((w) => w.player === me && w.eventId === ev.id).map((w) => resolveWager(state, w, events)).filter((r) => r.status === "won" || r.status === "lost").reduce((sum, r) => sum + (r.delta || 0), 0);
  const had = award || mvp || (state.wagers || []).some((w) => w.player === me && w.eventId === ev.id);
  return had ? { total: award + mvp + bets, award, mvp, bets } : null;
}
var PLACES = ["1st", "2nd", "3rd"];
function EventResult({ state, ev, me, onPlayer }) {
  const res = state.results?.[ev.id];
  if (!res?.slots) return null;
  const awards = resultAwards(state, ev, res);
  const crew = awards.filter((award) => award.place === "crew");
  const take = yourTake(state, ev, me);
  const correction = (state.eventOps?.[ev.id]?.corrections || []).at(-1);
  const reason = res.correctedAt || correction ? res.correctionReason || correction?.reason : null;
  const rows = res.slots.map((players, i) => ({ i, players: players || [] })).filter((row) => row.players.length);
  const draw = state.draws?.[ev.id];
  const labelOf = (players) => {
    const teams = (draw?.teams || []).filter((team) => team.players.some((p) => players.includes(p)));
    return teams.length ? teams.map((team) => teamLabel(state, team)).join(", ") : null;
  };
  const podium = !res.stacks && /* @__PURE__ */ React14.createElement("div", { className: "fd-es-pane fd-es-podium-pane" }, /* @__PURE__ */ React14.createElement(
    PayoutLadder,
    {
      ev,
      size: "phone",
      state,
      me,
      onPlayer,
      crew: crew.length ? crew[0].pts : null,
      winners: Object.assign(res.slots.map((players) => players || []), { crew: crew.map((award) => award.player) }),
      labels: Object.assign(res.slots.map((players) => labelOf(players || [])), { crew: null })
    }
  ));
  return /* @__PURE__ */ React14.createElement("section", { className: "fd-es-result", "aria-label": "Result" }, podium, res.stacks && /* @__PURE__ */ React14.createElement("ol", { className: "fd-es-pane fd-es-podium" }, rows.map(({ i, players }) => {
    const pts = res.stacks ? null : awards.find((award) => award.place === i)?.pts ?? 0;
    return /* @__PURE__ */ React14.createElement("li", { key: i, className: `fd-es-place${i === 0 ? " is-first" : ""}` }, /* @__PURE__ */ React14.createElement("span", { className: "fd-es-medal", "aria-label": PLACES[i] || `${i + 1}th` }, i + 1), /* @__PURE__ */ React14.createElement("div", { className: "fd-es-people" }, players.map((p) => /* @__PURE__ */ React14.createElement(Person, { key: p, state, p, me, size: i === 0 ? 36 : 30, onPlayer }))), res.stacks ? /* @__PURE__ */ React14.createElement("b", { className: "fd-es-amount" }, fmt3(res.stacks[players[0]] ?? 0)) : pts > 0 && /* @__PURE__ */ React14.createElement("b", { className: "fd-es-amount" }, "+", fmt3(pts)));
  }), crew.length > 0 && /* @__PURE__ */ React14.createElement("li", { className: "fd-es-place is-crew" }, /* @__PURE__ */ React14.createElement("span", { className: "fd-es-medal is-crew", "aria-label": "Crew" }), /* @__PURE__ */ React14.createElement("div", { className: "fd-es-people" }, crew.map(({ player }) => /* @__PURE__ */ React14.createElement(Person, { key: player, state, p: player, me, size: 26, onPlayer }))), /* @__PURE__ */ React14.createElement("b", { className: "fd-es-amount" }, "+", fmt3(crew[0].pts)))), take && /* @__PURE__ */ React14.createElement(
    "div",
    {
      className: `fd-es-take${take.total > 0 ? " is-won" : take.total < 0 ? " is-lost" : ""}`,
      "aria-label": `Your chips from ${ev.name}: ${signed(take.total)}`
    },
    /* @__PURE__ */ React14.createElement(Avatar, { state, p: me, size: 28 }),
    /* @__PURE__ */ React14.createElement("span", null, "You"),
    /* @__PURE__ */ React14.createElement("b", null, signed(take.total))
  ), reason && /* @__PURE__ */ React14.createElement("p", { className: "fd-es-corrected" }, "Corrected: ", reason));
}
function EventPays({ ev, crew = null }) {
  return /* @__PURE__ */ React14.createElement("section", { className: "fd-es-pays", "aria-label": "Pays" }, /* @__PURE__ */ React14.createElement(PayoutLadder, { ev, size: "phone", crew }));
}

// src/App.jsx
init_CompetitionBracket();

// src/features/weekend/EventAnnouncement.jsx
init_core();
init_show();
init_controls();
init_GameMark();
init_PayoutLadder();
init_PlayerIdentity();
init_PlayerIdentityContext();
init_serverClock();
init_drawReveal();
import React24, { useEffect as useEffect14, useRef as useRef12, useState as useState13 } from "react";

// src/features/moments/TeamSort.jsx
init_core();
init_PlayerIdentity();
init_PlayerIdentityContext();
init_PlayerPass();
init_serverClock();
import React19, { useEffect as useEffect12, useState as useState11 } from "react";
var TEAM_SORT_MS = 4200;
function teamOf(reveal, groups, me) {
  if (!me || !Array.isArray(groups)) return null;
  for (let index = 0; index < groups.length; index++) {
    const group = groups[index];
    if (group.bye) continue;
    const line = group.lines.find((item) => (item.avatars || []).includes(me));
    if (!line) continue;
    const singles = group.lines.every((item) => (item.avatars || []).length <= 1);
    const players = singles && !group.vs && reveal?.title === "The draw" ? group.lines.flatMap((item) => item.avatars || []) : [...line.avatars || []];
    if (players.length < 2) return null;
    const name = group.vs ? line.text : group.title || line.text;
    return { index, players, name };
  }
  return null;
}
function TeamSort({ state, team, at }) {
  const identity = usePlayerIdentity(team?.players?.[0]);
  const ink = cardInk(identity.color);
  const [show, setShow] = useState11(() => serverNow() >= at && serverNow() < at + TEAM_SORT_MS);
  useEffect12(() => {
    const now2 = serverNow();
    const timers = [];
    if (now2 < at) timers.push(setTimeout(() => setShow(true), at - now2));
    timers.push(setTimeout(() => setShow(false), Math.max(0, at + TEAM_SORT_MS - now2)));
    return () => timers.forEach(clearTimeout);
  }, [at]);
  if (!show || !team) return null;
  const elapsed = Math.max(0, serverNow() - at);
  const size = team.players.length > 4 ? 72 : team.players.length > 2 ? 88 : 112;
  return /* @__PURE__ */ React19.createElement(
    "div",
    {
      className: "fd-moment fd-moment-team",
      role: "status",
      "aria-label": `Your team: ${team.players.map((p) => disp(state, p)).join(", ")}`,
      style: {
        "--tl": `${-Math.round(elapsed)}ms`,
        "--moment-color": identity.color,
        "--moment-ink": ink,
        "--moment-hold": `${TEAM_SORT_MS}ms`
      },
      onClick: () => setShow(false)
    },
    /* @__PURE__ */ React19.createElement("div", { className: "fd-moment-flood", "aria-hidden": "true" }, /* @__PURE__ */ React19.createElement("i", { style: { background: identity.color } })),
    /* @__PURE__ */ React19.createElement("div", { className: "fd-moment-body", "aria-hidden": "true" }, /* @__PURE__ */ React19.createElement("h2", { className: "fd-show is-marquee fd-moment-team-name" }, team.name), /* @__PURE__ */ React19.createElement("p", { className: "fd-moment-sub" }, /* @__PURE__ */ React19.createElement("span", null, "Your team")), /* @__PURE__ */ React19.createElement("div", { className: "fd-moment-team-faces" }, team.players.map((p, i) => /* @__PURE__ */ React19.createElement("span", { key: p, style: { "--face": i } }, /* @__PURE__ */ React19.createElement(ChipFace, { p, size, flat: true })))), /* @__PURE__ */ React19.createElement("p", { className: "fd-moment-hold" }, "Hold it up"))
  );
}

// src/features/weekend/EventAnnouncement.jsx
init_sound();

// src/features/weekend/drawPath.js
init_core();
var decided2 = (value) => value !== null && value !== void 0;
var teamPlayers = (draw, index) => [...draw?.teams?.[index]?.players || []];
function feedsInto(bracket, r, m) {
  const rounds = bracket.rounds || [];
  for (let next = r + 1; next < rounds.length; next++)
    for (let index = 0; index < rounds[next].length; index++) {
      const match = rounds[next][index];
      for (const side of ["a", "b"]) {
        const slot = match[side];
        if (slot?.w && slot.w[0] === r && slot.w[1] === m) return { r: next, m: index, side };
      }
    }
  return null;
}
function opponentStop(bracket, draw, slot) {
  const seated = resolveSlot(bracket, slot);
  if (decided2(seated)) return { opponents: teamPlayers(draw, seated), from: null, candidates: [] };
  if (!slot?.w) return { opponents: null, from: null, candidates: [] };
  const [r, m] = slot.w;
  const feeder = bracket.rounds?.[r]?.[m];
  const a = feeder ? resolveSlot(bracket, feeder.a) : null, b = feeder ? resolveSlot(bracket, feeder.b) : null;
  return {
    opponents: null,
    from: bracketMatchName(bracket, r, m),
    candidates: decided2(a) && decided2(b) ? [teamPlayers(draw, a), teamPlayers(draw, b)] : []
  };
}
function bracketDrawPath(state, evId, me) {
  const bracket = state?.brackets?.[evId], draw = state?.draws?.[evId];
  if (!bracket?.rounds?.length || !draw?.teams || !me) return null;
  const team = draw.teams.findIndex((item) => (item?.players || []).includes(me));
  if (team < 0) return null;
  let at = null;
  bracket.rounds.forEach((matches, r) => matches.forEach((match, m) => {
    if (at) return;
    if (resolveSlot(bracket, match.a) === team) at = { r, m, side: "a" };
    else if (resolveSlot(bracket, match.b) === team) at = { r, m, side: "b" };
  }));
  if (!at) return null;
  const steps = [];
  for (let guard = 0; at && guard < 8; guard++) {
    const match = bracket.rounds[at.r][at.m];
    const mine = at.side;
    const final = at.r === bracket.rounds.length - 1;
    const stop = opponentStop(bracket, draw, match[mine === "a" ? "b" : "a"]);
    const won = decided2(match.winner) && match.winner === team;
    const lost = decided2(match.winner) && match.winner !== team;
    steps.push({
      id: `${at.r}:${at.m}`,
      label: bracketMatchName(bracket, at.r, at.m),
      final,
      ...stop,
      won,
      lost
    });
    if (lost) break;
    at = feedsInto(bracket, at.r, at.m);
  }
  return { kind: "bracket", evId, team, steps };
}
function stageDrawPath(state, evId, me) {
  const stage = state?.stages?.[evId];
  if (!stage?.groups?.length || !me) return null;
  const team = stage.entrantType === "team";
  const draw = state?.draws?.[evId];
  const playersOf = (key) => team ? teamPlayers(draw, key) : [key];
  const group = stage.groups.find((item) => (item.entrants || []).some((key) => playersOf(key).includes(me)));
  if (!group) return null;
  const own = (group.entrants || []).find((key) => playersOf(key).includes(me));
  const rivals = (group.entrants || []).filter((key) => key !== own).map(playersOf);
  const advance = Math.max(1, Number(stage.advance) || 1);
  const noun = stage.kind === "pools" ? "pool" : "heat";
  const through = group.through || [];
  const out = through.length >= advance && !through.includes(own);
  const steps = [
    {
      id: `group:${group.name}`,
      label: group.name,
      final: false,
      opponents: rivals.flat(),
      from: null,
      candidates: [],
      note: advance === 1 ? "Winner goes through" : `Top ${advance} go through`,
      won: through.includes(own),
      lost: out
    }
  ];
  if (!out) steps.push({
    id: "final",
    label: "Final",
    final: true,
    opponents: null,
    from: `${stage.groups.length} ${noun} winner${stage.groups.length === 1 ? "" : "s"}`,
    candidates: [],
    won: false,
    lost: false
  });
  return { kind: "stage", evId, steps };
}
function drawPath(state, reveal, me) {
  if (!reveal?.evId || !me) return null;
  const { evId } = reveal;
  const stage = state?.stages?.[evId], draw = state?.draws?.[evId];
  if (stage && reveal.id === stage.id) return stageDrawPath(state, evId, me);
  if (!draw || reveal.id !== draw.id) return null;
  if (state.brackets?.[evId]) return bracketDrawPath(state, evId, me);
  if (stage && (!stage.drawId || stage.drawId === draw.id)) return stageDrawPath(state, evId, me);
  return null;
}
function drawPathText(path, nameOf3 = (player) => player) {
  if (!path?.steps?.length) return "";
  return path.steps.map((step) => {
    const who = step.opponents?.length ? ` vs ${step.opponents.map(nameOf3).join(" & ")}` : step.from ? ` vs ${step.from}${path.kind === "bracket" ? " winner" : ""}` : "";
    return `${step.label}${who}${step.note ? ` (${step.note})` : ""}`;
  }).join(", then ");
}

// src/features/weekend/DrawPath.jsx
init_core();
init_PlayerIdentity();
import React20 from "react";
var Faces = ({ players, size, cls = "" }) => /* @__PURE__ */ React20.createElement("span", { className: `fd-draw-path-faces${cls}` }, players.map((player) => /* @__PURE__ */ React20.createElement(ChipFace, { key: player, p: player, size, flat: true })));
function DrawPathLine({ state, path, me, animate = false }) {
  if (!path?.steps?.length || !me) return null;
  const stops = [{ id: "you", you: true }, ...path.steps];
  const text = drawPathText(path, (player) => disp(state, player));
  return /* @__PURE__ */ React20.createElement(
    "div",
    {
      className: `fd-draw-path${animate ? " is-drawing" : ""}`,
      role: "img",
      "aria-label": `Your path: ${text}`,
      style: { "--path-stops": stops.length, "--path-steps": path.steps.length }
    },
    /* @__PURE__ */ React20.createElement("i", { className: "fd-draw-path-line", "aria-hidden": "true" }),
    /* @__PURE__ */ React20.createElement("ol", { "aria-hidden": "true" }, stops.map((stop, index) => /* @__PURE__ */ React20.createElement(
      "li",
      {
        key: stop.id,
        style: { "--i": index },
        className: `${stop.you ? "is-you" : ""}${stop.final ? " is-final" : ""}${stop.won ? " is-won" : ""}${stop.lost ? " is-lost" : ""}`
      },
      /* @__PURE__ */ React20.createElement("span", { className: "fd-draw-path-node" }, stop.you ? /* @__PURE__ */ React20.createElement(ChipFace, { p: me, size: 30, flat: true }) : /* @__PURE__ */ React20.createElement("i", { className: "fd-draw-path-dot" })),
      /* @__PURE__ */ React20.createElement("b", null, stop.you ? "You" : stop.label),
      !stop.you && (stop.opponents?.length ? /* @__PURE__ */ React20.createElement(Faces, { players: stop.opponents, size: 26 }) : stop.candidates?.length ? /* @__PURE__ */ React20.createElement("span", { className: "fd-draw-path-either" }, stop.candidates.map((team, i) => /* @__PURE__ */ React20.createElement(React20.Fragment, { key: i }, i > 0 && /* @__PURE__ */ React20.createElement("small", null, "or"), /* @__PURE__ */ React20.createElement(Faces, { players: team, size: 24, cls: " is-candidate" })))) : stop.from ? /* @__PURE__ */ React20.createElement("small", null, path.kind === "bracket" ? `${stop.from} winner` : stop.from) : null),
      stop.note && /* @__PURE__ */ React20.createElement("small", { className: "fd-draw-path-note" }, stop.note)
    )))
  );
}

// src/features/weekend/EventAnnouncement.jsx
init_frameGate();
init_OneSafe();
init_GameIntro();
function AnnouncementHero({ ev, visual = null, lamp = null, size = "hero" }) {
  return /* @__PURE__ */ React24.createElement("header", { className: `fd-announcement-hero is-${size}` }, visual ? /* @__PURE__ */ React24.createElement("div", { className: "fd-announcement-game" }, visual) : /* @__PURE__ */ React24.createElement("div", { className: "fd-announcement-mark" }, /* @__PURE__ */ React24.createElement(GameMark, { id: ev.game, variant: ev.variant, size: size === "hero" ? 64 : 44 })), /* @__PURE__ */ React24.createElement("h2", { className: `fd-show${size === "hero" ? " is-marquee" : ""} fd-announcement-name` }, /* @__PURE__ */ React24.createElement(EventName, { name: ev.name })), lamp && /* @__PURE__ */ React24.createElement("span", { className: "fd-announcement-state" }, /* @__PURE__ */ React24.createElement(
    "i",
    {
      className: `fd-insert is-live${lamp.state === "pending" ? " is-pending" : lamp.state === "done" ? " is-done" : ""}`,
      "aria-hidden": "true"
    }
  ), lamp.label));
}
function EventAnnouncement({
  state,
  ev,
  handoff,
  onClose,
  onBets,
  holdMs = DRAW_INTRO_MS,
  visual,
  live: live2 = false,
  anchor = null,
  reduced = false,
  now: clockNow = serverNow
}) {
  const contest = resolveCurrentContest(state, ev);
  const named = !handoff && contest?.kind !== "ffa" ? contestName(state, ev, contest) : null;
  const detail = named && named !== ev.name ? named : null;
  const [elapsed] = useState13(() => {
    const introAt = handoff ? revealTimeline(state, ev.id)?.introAt : null;
    return introAt ? Math.min(holdMs, Math.max(0, clockNow() - introAt)) : 0;
  });
  return /* @__PURE__ */ React24.createElement(Sheet, { title: ev.name, heading: false, onClose, layer: 290, className: "fd-announcement" }, live2 ? /* @__PURE__ */ React24.createElement("div", { className: "fd-announcement-intro" }, /* @__PURE__ */ React24.createElement(GameIntro, { ev, surface: "phone", anchor, reduced, handoff, now: clockNow, sound: true }), /* @__PURE__ */ React24.createElement("span", { className: "fd-announcement-state" }, /* @__PURE__ */ React24.createElement("i", { className: `fd-insert is-live${handoff ? " is-done" : " is-pending"}`, "aria-hidden": "true" }), handoff ? "On deck" : "Betting open")) : /* @__PURE__ */ React24.createElement(
    AnnouncementHero,
    {
      ev,
      visual,
      lamp: handoff ? { label: "On deck", state: "done" } : { label: "Betting open", state: "pending" }
    }
  ), detail && /* @__PURE__ */ React24.createElement("p", { className: "fd-announcement-detail" }, detail), /* @__PURE__ */ React24.createElement("div", { className: `fd-announcement-pays${handoff ? " is-handoff" : ""}` }, /* @__PURE__ */ React24.createElement(PayoutLadder, { ev, size: "phone" })), !handoff && hasGameSteps(ev) && /* @__PURE__ */ React24.createElement(GameSteps, { game: ev, size: "card", notes: false, className: "fd-announcement-steps" }), handoff && /* @__PURE__ */ React24.createElement(
    "div",
    {
      className: "fd-announcement-handoff",
      "aria-hidden": "true",
      style: { "--intro-hold": `${holdMs}ms`, "--intro-elapsed": `${-Math.round(elapsed)}ms` }
    },
    /* @__PURE__ */ React24.createElement("span", null)
  ), /* @__PURE__ */ React24.createElement("div", { className: "fd-announcement-actions" }, onBets && /* @__PURE__ */ React24.createElement(ActionButton, { onClick: onBets }, "Place chips"), /* @__PURE__ */ React24.createElement(ActionButton, { variant: onBets ? "secondary" : "primary", onClick: onClose }, handoff ? "View draw" : "Done")));
}
function useReducedMotion2(override) {
  const [reduced, setReduced] = useState13(() => typeof window === "undefined" || !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  useEffect14(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!media) return;
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);
  return override ?? reduced;
}
function DrawAnnouncement({
  state,
  reveal,
  me = null,
  synced = false,
  onClose,
  onBets,
  onPlayer,
  onBack,
  initialComplete = false,
  reducedMotion: motionOverride,
  now: clockNow = serverNow
}) {
  const groups = drawRevealGroups(state, reveal);
  const total = groups.length + (reveal.crew?.length ? 1 : 0);
  const reducedMotion = useReducedMotion2(motionOverride);
  const startAt = synced && !initialComplete ? revealTimeline(state, reveal.evId, { reveal, reducedMotion })?.revealAt ?? null : null;
  const [joined] = useState13(() => reducedMotion || initialComplete ? total : startAt !== null ? drawStepAt(clockNow() - startAt, total) : 0);
  const [shown, setShown] = useState13(joined);
  const [run2, setRun] = useState13(0);
  const animate = !reducedMotion && !(run2 === 0 && (initialComplete || joined >= total));
  const playback = useRef12(null);
  useEffect14(() => {
    const next = startDrawPlayback({
      total,
      reducedMotion: !animate,
      onStep: setShown,
      ...run2 === 0 && startAt !== null ? { startAt, now: clockNow } : {}
    });
    playback.current = next;
    return () => next.stop();
  }, [reveal.id, total, animate, run2, startAt]);
  const mineIndex = me ? groups.findIndex((group) => group.lines.some((line) => (line.avatars || []).includes(me))) : -1;
  const [liveAtOpen] = useState13(() => !!currentFrame().fresh);
  const team = synced && startAt !== null ? teamOf(reveal, groups, me) : null;
  const teamAt = team && liveAtOpen && !reducedMotion && team.index >= joined && run2 === 0 ? startAt + drawStepDelay(team.index, total) : null;
  useEffect14(() => {
    if (startAt === null || mineIndex < 0 || !reducedMotion && mineIndex < joined) return;
    if (!currentFrame().fresh) return;
    playSound(team ? "teamUp" : "S4", { at: reducedMotion ? startAt : startAt + drawStepDelay(mineIndex, total), key: `card:${reveal.id}` });
  }, [reveal.id]);
  const you = usePlayerIdentity(me);
  const youStyle = { "--fd-you": you.color, "--fd-you-ink": you.isLight ? "var(--ink0)" : "var(--bone)" };
  const complete = shown >= total;
  const path = synced && mineIndex >= 0 ? drawPath(state, reveal, me) : null;
  const actions = /* @__PURE__ */ React24.createElement("div", { className: "fd-announcement-actions" }, onBets && /* @__PURE__ */ React24.createElement(ActionButton, { onClick: onBets }, "Place chips"), /* @__PURE__ */ React24.createElement(ActionButton, { variant: onBets ? "secondary" : "primary", onClick: onClose }, "Done"));
  const skip = () => playback.current?.skip();
  const replay = () => {
    playback.current?.stop();
    setShown(reducedMotion ? total : 0);
    setRun((value) => value + 1);
  };
  const playerButton = (player, visible, index = 0, partner = false) => /* @__PURE__ */ React24.createElement(
    "button",
    {
      type: "button",
      key: player,
      disabled: !visible || !onPlayer,
      tabIndex: visible ? void 0 : -1,
      onClick: () => {
        if (visible) onPlayer?.(player);
      },
      className: partner ? "is-partner" : void 0,
      style: { "--deal-index": index, ...partner ? { "--partner-beat": `${DRAW_PARTNER_BEAT_MS}ms` } : null },
      "aria-label": `View ${disp(state, player)}'s player card`
    },
    /* @__PURE__ */ React24.createElement(Avatar, { state, p: player, size: 30 }),
    /* @__PURE__ */ React24.createElement("span", null, disp(state, player))
  );
  const revealEv = allEventsOf(state).find((item) => item.id === reveal.evId) || null;
  return /* @__PURE__ */ React24.createElement(
    Sheet,
    {
      title: reveal.subtitle || reveal.title,
      heading: !revealEv,
      subtitle: reveal.subtitle ? reveal.title : "The draw",
      onClose,
      onBack,
      layer: 300,
      className: "fd-announcement"
    },
    revealEv && /* @__PURE__ */ React24.createElement(AnnouncementHero, { ev: revealEv, size: "compact" }),
    /* @__PURE__ */ React24.createElement("div", { className: "fd-draw-playback" }, /* @__PURE__ */ React24.createElement("div", { className: `fd-draw-deck${complete ? " is-complete" : ""}`, "aria-hidden": "true" }, /* @__PURE__ */ React24.createElement("i", null), /* @__PURE__ */ React24.createElement("i", null), /* @__PURE__ */ React24.createElement("i", null, "FD")), /* @__PURE__ */ React24.createElement("span", { role: "status", "aria-live": "polite" }, complete ? "Draw complete" : "Revealing the draw"), /* @__PURE__ */ React24.createElement("button", { type: "button", className: "fd-draw-playback-action", onClick: complete ? replay : skip }, complete ? "Replay draw" : "Skip animation")),
    /* @__PURE__ */ React24.createElement("div", { className: `fd-draw-announcement${!animate ? " is-reduced" : ""}`, key: run2 }, groups.map((group, index) => {
      const visible = index < shown;
      const settled = run2 === 0 && index < joined;
      const mine = !!me && group.lines.some((line) => (line.avatars || []).includes(me));
      const ring = mine && visible && animate && !settled;
      const held = partnerFaces(group);
      const lines = group.lines.map((line, j) => {
        const people = line.avatars || [];
        const namedTeam = line.text && people.length > 1 && line.text !== people.map((player) => disp(state, player)).join(" & ") && line.text !== group.title;
        const body = /* @__PURE__ */ React24.createElement(React24.Fragment, null, namedTeam && /* @__PURE__ */ React24.createElement("strong", { className: "fd-draw-team-name" }, line.text), /* @__PURE__ */ React24.createElement("div", { className: "fd-draw-people" }, people.length ? people.map((player, playerIndex) => playerButton(
          player,
          visible,
          playerIndex,
          playerIndex === held[j]
        )) : /* @__PURE__ */ React24.createElement("span", null, line.text)));
        if (group.bye) return /* @__PURE__ */ React24.createElement(
          "div",
          {
            key: j,
            style: { "--deal-index": j },
            className: `fd-draw-bye${me && people.includes(me) ? " is-mine" : ""}`
          },
          body
        );
        return /* @__PURE__ */ React24.createElement(React24.Fragment, { key: j }, group.vs && j > 0 && /* @__PURE__ */ React24.createElement("small", { className: "fd-draw-versus" }, "vs"), body);
      });
      return /* @__PURE__ */ React24.createElement(
        "section",
        {
          key: index,
          style: mine ? youStyle : void 0,
          className: `fd-draw-card ${visible ? "is-revealed" : "is-covered"}${group.bye ? " is-byes" : ""}${settled ? " is-settled" : ""}${mine && visible ? " is-mine" : ""}${ring ? " is-ringing" : ""}`
        },
        /* @__PURE__ */ React24.createElement("div", { className: "fd-draw-card-back", "aria-hidden": "true" }, /* @__PURE__ */ React24.createElement("span", null, String(index + 1).padStart(2, "0"))),
        ring && /* @__PURE__ */ React24.createElement("i", { className: "fd-draw-ring", "aria-hidden": "true" }),
        /* @__PURE__ */ React24.createElement("div", { className: "fd-draw-card-front", "aria-hidden": !visible }, /* @__PURE__ */ React24.createElement("h3", null, group.title, mine && visible && /* @__PURE__ */ React24.createElement("span", { className: "fd-draw-you" }, "You")), group.bye ? /* @__PURE__ */ React24.createElement("div", { className: "fd-draw-byes" }, lines) : lines)
      );
    })),
    !!reveal.crew?.length && /* @__PURE__ */ React24.createElement("div", { className: `fd-draw-crew ${complete ? "is-revealed" : "is-covered"}`, "aria-hidden": !complete }, reveal.crew.map((role) => /* @__PURE__ */ React24.createElement("div", { key: role.player }, playerButton(role.player, complete), /* @__PURE__ */ React24.createElement("span", null, overflowRoleMeta(role.role).label)))),
    teamAt !== null && /* @__PURE__ */ React24.createElement(TeamSort, { state, team, at: teamAt }),
    path && complete ? /* @__PURE__ */ React24.createElement("div", { className: `fd-draw-footer${animate ? " is-drawing" : ""}`, style: youStyle, key: `path-${run2}` }, /* @__PURE__ */ React24.createElement(DrawPathLine, { state, path, me, animate }), actions) : actions
  );
}

// src/features/draft/DraftSheet.jsx
init_core();
init_controls();
init_PlayerIdentity();
init_playerIdentity();
init_haptics();
init_motion();
init_sound();
init_motionKit();
init_draftModel();
init_OneSafe();
import React25, { useEffect as useEffect15, useRef as useRef14, useState as useState15 } from "react";
init_Icon();
var identityStyle = (state, player) => ({ "--draft-color": resolvePlayerIdentity(state.profiles, player).color });
var reference = (turn) => ({ draftId: turn.draftId, pickIndex: turn.pickIndex, draftRevision: turn.draftRevision });
function PlayerLink({ state, player, onPlayer, children, disabled }) {
  return /* @__PURE__ */ React25.createElement(
    "button",
    {
      type: "button",
      className: "fd-draft-person",
      disabled: disabled || !onPlayer,
      onClick: () => onPlayer?.(player),
      "aria-label": `View ${disp(state, player)}'s player card`
    },
    /* @__PURE__ */ React25.createElement(Avatar, { state, p: player, size: 30 }),
    /* @__PURE__ */ React25.createElement("span", null, children || disp(state, player))
  );
}
function DraftEntry({ state, ev, me, onOpen }) {
  const draft = state.drafts?.[ev?.id];
  if (!draft || state.draws?.[ev.id]) return null;
  const turn = draftTurn(draft), mine = turn.captain === me;
  return /* @__PURE__ */ React25.createElement(
    "button",
    {
      type: "button",
      className: `fd-draft-entry${turn.complete ? " is-done" : mine ? " is-mine" : ""}`,
      onClick: onOpen,
      "aria-label": `Open ${ev.name} draft`
    },
    /* @__PURE__ */ React25.createElement(BankChip, { p: turn.captain || draft.teams[0].captain, size: 44 }),
    /* @__PURE__ */ React25.createElement("span", null, /* @__PURE__ */ React25.createElement("strong", null, /* @__PURE__ */ React25.createElement("i", { className: `fd-insert ${turn.complete ? "is-done" : mine ? "is-pending" : "fd-beat-dot"}`, "aria-hidden": "true" }), mine && !turn.complete ? "Your pick" : /* @__PURE__ */ React25.createElement(EventName, { name: ev.name })), /* @__PURE__ */ React25.createElement("span", null, turn.complete ? "Teams picked" : mine ? /* @__PURE__ */ React25.createElement(EventName, { name: ev.name }) : `${disp(state, turn.captain)}'s pick`)),
    /* @__PURE__ */ React25.createElement("b", { "aria-hidden": "true" }, /* @__PURE__ */ React25.createElement(Icon, { name: "open", size: "1em" }))
  );
}
function DraftSheet({
  ev,
  state,
  gm,
  me,
  standings = [],
  pool,
  roles = [],
  onClose,
  onPlayer,
  onStart,
  onPick,
  onUndo,
  onFinalize,
  onCancel
}) {
  const draft = state.drafts?.[ev.id];
  const [captains, setCaptains] = useState15([]), [method, setMethod] = useState15("pick");
  const [pending, setPending] = useState15(""), [error, setError] = useState15("");
  const [confirmCancel, setConfirmCancel] = useState15(false);
  const saving = useRef14(false), board = useRef14(null), focusAfterPick = useRef14(false);
  const turn = draft ? draftTurn(draft) : null;
  const poolBox = useRef14(null), queueBox = useRef14(null);
  const [arriving, setArriving] = useState15(null), [landed, setLanded] = useState15(null);
  const pickChange = useFreshChange(draft?.picks?.length ?? null, draft?.id || null);
  const landing = pickChange.animate ? landedPick(draft, pickChange) : null;
  const passing = useFreshHold(draft?.picks?.length ?? null, draft?.id || null, MOTION.story * 2);
  const handing = useFreshHold(turn?.captain ?? null, draft?.id || null, MOTION.story * 2);
  useFlip(queueBox, { play: !!landing, delay: MOTION.base, duration: MOTION.base });
  useFlip(poolBox, { play: !!landing, delay: 300, duration: 280, stagger: 25, enter: false, onPlay: (before) => {
    const from = before.get(landing.player), box2 = poolBox.current?.getBoundingClientRect();
    const seat = board.current?.querySelector(`[data-seat="${landing.player}"]`);
    if (!from || !box2 || !seat) return;
    const target = seat.getBoundingClientRect(), view = window.innerHeight || 0;
    const offscreen = !rectVisible(target);
    const to = offscreen ? {
      left: target.left,
      width: target.width,
      height: target.height,
      top: target.top > view ? view - target.height * 0.6 : -target.height * 0.4
    } : seat;
    setArriving(landing.player);
    fly({ left: box2.left + from.left, top: box2.top + from.top, width: from.width, height: from.height }, to, {
      node: /* @__PURE__ */ React25.createElement(PickFlyer, { state, player: landing.player }),
      duration: MOTION.cardFlight,
      arc: offscreen ? 0 : 36,
      fade: offscreen
    }).then(() => {
      setArriving((current) => current === landing.player ? null : current);
      setLanded(landing.player);
    });
  } });
  useEffect15(() => {
    if (!landed) return void 0;
    const t = setTimeout(() => setLanded(null), MOTION.story);
    return () => clearTimeout(t);
  }, [landed]);
  const blocked = !!state.frozen || !!state.poker && !state.results?.[state.poker.id] || !!state.results?.[ev.id] || !!state.shelved?.[ev.id] || state.onDeck === ev.id || !!state.eventOps?.[ev.id]?.bettingOpenedAt || !!state.eventOps?.[ev.id]?.startedAt;
  const myTurn = !!turn?.captain && turn.captain === me;
  const canPick = !!turn && !turn.complete && (gm || myTurn) && !blocked;
  const submit = async (name, action, after) => {
    if (saving.current) return { ok: false, error: "Still saving." };
    saving.current = true;
    setPending(name);
    setError("");
    try {
      const result = await action();
      if (result?.ok !== true) {
        setError(result?.error || "Couldn't save. Try again.");
        return result;
      }
      after?.();
      return result;
    } catch (failure) {
      const result = { ok: false, error: failure?.message || "Couldn't save. Try again." };
      setError(result.error);
      return result;
    } finally {
      saving.current = false;
      setPending("");
    }
  };
  useEffect15(() => {
    if (!pending && focusAfterPick.current) {
      board.current?.focus({ preventScroll: true });
      focusAfterPick.current = false;
    }
  }, [pending, turn?.draftRevision]);
  const fit2 = draft?.fit || (pool ? teamFit(ev, pool.length + roles.length) : null) || ev.teamCfg;
  const n = fit2?.teams || 2, size = fit2?.size || 2;
  const chooseMethod = (next) => {
    if (saving.current) return;
    setMethod(next);
    if (next === "random") setCaptains(shuffle(pool || []).slice(0, n));
    else if (next === "seed") setCaptains([...pool || []].sort((a, b) => playerStrength(state, b, ev.sport, standings.length ? standings : void 0) - playerStrength(state, a, ev.sport, standings.length ? standings : void 0)).slice(0, n));
    else setCaptains([]);
  };
  const toggleCaptain = (player) => {
    if (saving.current) return;
    setMethod("pick");
    setCaptains((previous) => previous.includes(player) ? previous.filter((p) => p !== player) : previous.length < n ? [...previous, player] : previous);
  };
  const crew = draft?.roles || roles;
  const shell = (children) => /* @__PURE__ */ React25.createElement(
    Sheet,
    {
      title: ev.name,
      subtitle: "Captains draft",
      show: true,
      onClose,
      busy: !!pending,
      wide: true,
      className: "fd-draft-sheet"
    },
    children
  );
  const confirmed = state.draws?.[ev.id];
  if (!draft && confirmed?.sourceDraftId && (!pool || !gm)) return shell(/* @__PURE__ */ React25.createElement(
    ConfirmedTeams,
    {
      state,
      draw: confirmed,
      me,
      size,
      onPlayer
    }
  ));
  if (!draft && (!pool || !gm)) return shell(/* @__PURE__ */ React25.createElement("p", null, "Draft closed."));
  if (!draft) return shell(/* @__PURE__ */ React25.createElement("div", { className: "fd-draft" }, /* @__PURE__ */ React25.createElement("div", { className: "fd-draft-section-title" }, /* @__PURE__ */ React25.createElement("h2", null, "Choose ", n, " captains"), /* @__PURE__ */ React25.createElement("span", null, n, " teams of ", size)), /* @__PURE__ */ React25.createElement("div", { className: "fd-draft-methods", "aria-label": "Choose captains" }, [["pick", "Choose"], ["seed", "Balanced"], ["random", "Random"]].map(([id, text]) => /* @__PURE__ */ React25.createElement(
    "button",
    {
      type: "button",
      key: id,
      "aria-pressed": method === id,
      disabled: !!pending,
      onClick: () => chooseMethod(id)
    },
    text
  ))), /* @__PURE__ */ React25.createElement("ol", { className: "fd-draft-captain-order", "aria-label": "Captain pick order" }, Array.from({ length: n }, (_, index) => /* @__PURE__ */ React25.createElement("li", { key: `${index}:${captains[index] || "empty"}`, className: captains[index] ? "is-filled" : "" }, /* @__PURE__ */ React25.createElement("small", null, index + 1), captains[index] ? /* @__PURE__ */ React25.createElement(
    "button",
    {
      type: "button",
      disabled: !!pending,
      onClick: () => toggleCaptain(captains[index]),
      "aria-label": `Remove ${disp(state, captains[index])} as captain`
    },
    /* @__PURE__ */ React25.createElement(BankChip, { p: captains[index], size: 36 }),
    /* @__PURE__ */ React25.createElement("span", null, disp(state, captains[index])),
    /* @__PURE__ */ React25.createElement("b", { "aria-hidden": "true" }, /* @__PURE__ */ React25.createElement(Icon, { name: "close", size: "1em" }))
  ) : /* @__PURE__ */ React25.createElement("span", null, "Captain ", index + 1)))), /* @__PURE__ */ React25.createElement("div", { className: "fd-draft-pool", "aria-label": "Players" }, (pool || []).map((player) => /* @__PURE__ */ React25.createElement("div", { className: "fd-draft-candidate", key: player }, /* @__PURE__ */ React25.createElement(
    "button",
    {
      type: "button",
      className: "fd-draft-select",
      "aria-label": `Choose ${disp(state, player)} as captain`,
      "aria-pressed": captains.includes(player),
      disabled: !!pending || !captains.includes(player) && captains.length === n,
      onClick: () => toggleCaptain(player)
    },
    /* @__PURE__ */ React25.createElement(Avatar, { state, p: player, size: 36 }),
    /* @__PURE__ */ React25.createElement("span", null, disp(state, player)),
    /* @__PURE__ */ React25.createElement("b", { "aria-hidden": "true" }, captains.includes(player) ? captains.indexOf(player) + 1 : "+")
  )))), !!crew.length && /* @__PURE__ */ React25.createElement(DraftCrew, { state, roles: crew, onPlayer, disabled: !!pending }), error && /* @__PURE__ */ React25.createElement("p", { className: "fd-draft-error", role: "alert" }, error), /* @__PURE__ */ React25.createElement("div", { className: "fd-draft-footer" }, /* @__PURE__ */ React25.createElement(
    ActionButton,
    {
      disabled: captains.length !== n || blocked,
      pending: !!pending,
      onClick: () => submit("start", () => onStart(captains, pool))
    },
    pending ? "Starting\u2026" : "Start the draft"
  ))));
  const last = draft.picks.at(-1), ref = reference(turn);
  const remainingOrder = Array.from({ length: Math.min(turn.remaining, n + 1) }, (_, offset2) => ({
    pick: turn.pickIndex + offset2,
    team: snakeTeam(turn.pickIndex + offset2, n)
  }));
  const pick = (player) => {
    if (!canPick || saving.current) return;
    tapTick();
    unlockSound();
    focusAfterPick.current = true;
    return submit(
      `pick:${player}`,
      () => onPick(player, ref),
      () => playSound("S18", { bus: "you", delayMs: prefersReducedMotion() ? 0 : MOTION.cardFlight })
    );
  };
  return shell(/* @__PURE__ */ React25.createElement("div", { className: `fd-draft${passing ? " is-fresh" : ""}${handing ? " is-passing" : ""}`, ref: board, tabIndex: -1 }, /* @__PURE__ */ React25.createElement(
    "section",
    {
      className: `fd-draft-turn${myTurn ? " is-mine" : ""}${turn.complete ? " is-complete" : ""}`,
      "aria-label": "Current pick",
      style: identityStyle(state, turn.captain || draft.teams[0].captain)
    },
    /* @__PURE__ */ React25.createElement("div", { className: "fd-draft-turn-copy", key: `${draft.id}:${turn.draftRevision}` }, /* @__PURE__ */ React25.createElement("h2", null, turn.complete ? "Teams picked" : myTurn ? "Your pick" : `${disp(state, turn.captain)}'s pick`), /* @__PURE__ */ React25.createElement("small", null, turn.complete ? /* @__PURE__ */ React25.createElement(React25.Fragment, null, /* @__PURE__ */ React25.createElement("span", null, draft.teams.length, " teams"), /* @__PURE__ */ React25.createElement("span", null, size, " players each")) : /* @__PURE__ */ React25.createElement(React25.Fragment, null, /* @__PURE__ */ React25.createElement("span", null, /* @__PURE__ */ React25.createElement(OneSafe, { text: `Round ${turn.round}` })), /* @__PURE__ */ React25.createElement("span", null, /* @__PURE__ */ React25.createElement(OneSafe, { text: `Pick ${turn.pickIndex + 1} of ${turn.totalPicks}` })))), !turn.complete && canPick && gm && !myTurn && /* @__PURE__ */ React25.createElement("p", null, `Picking for ${disp(state, turn.captain)}`)),
    /* @__PURE__ */ React25.createElement("span", { className: "fd-draft-turn-chip", key: `${draft.id}:${turn.captain || "done"}`, "aria-hidden": "true" }, /* @__PURE__ */ React25.createElement(BankChip, { p: turn.captain || draft.teams[0].captain, size: 64 })),
    /* @__PURE__ */ React25.createElement(
      "div",
      {
        className: "fd-draft-progress",
        role: "progressbar",
        "aria-label": "Draft picks",
        "aria-valuenow": turn.pickIndex,
        "aria-valuemin": 0,
        "aria-valuemax": turn.totalPicks
      },
      /* @__PURE__ */ React25.createElement("span", { style: { width: `${turn.totalPicks ? turn.pickIndex / turn.totalPicks * 100 : 100}%` } })
    )
  ), /* @__PURE__ */ React25.createElement("p", { className: "fd-draft-sr", role: "status", "aria-live": "polite", "aria-atomic": "true" }, last ? `${disp(state, last.player)} joined ${disp(state, draft.teams[last.team].captain)}. ` : "", turn.complete ? "All players picked." : `Pick ${turn.pickIndex + 1}. ${disp(state, turn.captain)} to choose.`), !turn.complete && /* @__PURE__ */ React25.createElement("ol", { className: "fd-draft-queue", "aria-label": "Upcoming pick order", ref: queueBox }, remainingOrder.map(({ pick: pickIndex, team }, index) => /* @__PURE__ */ React25.createElement("li", { key: pickIndex, "data-flip": pickIndex, "aria-current": index === 0 ? "step" : void 0 }, /* @__PURE__ */ React25.createElement("small", null, index === 0 ? "Now" : `Pick ${pickIndex + 1}`), /* @__PURE__ */ React25.createElement("span", null, disp(state, draft.teams[team].captain))))), last && /* @__PURE__ */ React25.createElement("div", { className: "fd-draft-latest", key: `${draft.id}:${draft.picks.length}:${last.player}` }, /* @__PURE__ */ React25.createElement("span", { className: "fd-draft-pick-stamp" }, String(draft.picks.length).padStart(2, "0")), /* @__PURE__ */ React25.createElement(PlayerLink, { state, player: last.player, onPlayer, disabled: !!pending }), /* @__PURE__ */ React25.createElement("span", null, /* @__PURE__ */ React25.createElement(Icon, { name: "then", size: "1em" }), " ", disp(state, draft.teams[last.team].captain))), blocked && /* @__PURE__ */ React25.createElement("p", { className: "fd-draft-error", role: "status" }, "Draft paused."), error && /* @__PURE__ */ React25.createElement("p", { className: "fd-draft-error", role: "alert" }, error), /* @__PURE__ */ React25.createElement("div", { className: `fd-draft-body${turn.complete ? " is-complete" : ""}` }, !turn.complete && /* @__PURE__ */ React25.createElement("section", { className: "fd-draft-available", "aria-label": "Available players" }, /* @__PURE__ */ React25.createElement("div", { className: "fd-draft-section-title" }, /* @__PURE__ */ React25.createElement("h3", null, "Available"), /* @__PURE__ */ React25.createElement("span", null, turn.remaining, " left")), /* @__PURE__ */ React25.createElement("div", { className: "fd-draft-pool", ref: poolBox }, draft.pool.map((player) => /* @__PURE__ */ React25.createElement(
    "div",
    {
      className: `fd-draft-candidate${pending === `pick:${player}` ? " is-lifting" : ""}`,
      key: player,
      "data-flip": player,
      style: identityStyle(state, player)
    },
    /* @__PURE__ */ React25.createElement(
      "button",
      {
        type: "button",
        className: "fd-draft-avatar-link",
        disabled: !!pending || !onPlayer,
        onClick: () => onPlayer?.(player),
        "aria-label": `View ${disp(state, player)}'s player card`
      },
      /* @__PURE__ */ React25.createElement(Avatar, { state, p: player, size: 36 })
    ),
    /* @__PURE__ */ React25.createElement(
      "button",
      {
        type: "button",
        className: "fd-draft-pick",
        disabled: !canPick || !!pending,
        "aria-label": `Draft ${disp(state, player)}`,
        onClick: () => pick(player)
      },
      /* @__PURE__ */ React25.createElement("span", null, disp(state, player)),
      /* @__PURE__ */ React25.createElement("small", null, pending === `pick:${player}` ? "Picking\u2026" : canPick ? "Pick +" : "Available")
    )
  )))), /* @__PURE__ */ React25.createElement("section", { "aria-label": "Draft teams" }, /* @__PURE__ */ React25.createElement("div", { className: "fd-draft-section-title" }, /* @__PURE__ */ React25.createElement("h3", null, "Teams"), /* @__PURE__ */ React25.createElement("span", null, turn.pickIndex, "/", turn.totalPicks, " picks")), /* @__PURE__ */ React25.createElement("div", { className: "fd-draft-teams", style: { "--draft-columns": Math.min(n, 3) } }, draft.teams.map((team, index) => /* @__PURE__ */ React25.createElement(
    "section",
    {
      key: team.captain,
      className: `fd-draft-team${turn.teamIndex === index && !turn.complete ? " is-picking" : ""}${team.players.includes(me) ? " is-yours" : ""}`,
      style: identityStyle(state, team.captain),
      "aria-label": `${disp(state, team.captain)}'s team`
    },
    /* @__PURE__ */ React25.createElement("header", null, /* @__PURE__ */ React25.createElement("small", null, team.players.includes(me) ? "Your team" : `Team ${index + 1}`), /* @__PURE__ */ React25.createElement("span", null, team.players.length, "/", size)),
    /* @__PURE__ */ React25.createElement(PlayerLink, { state, player: team.captain, onPlayer, disabled: !!pending }),
    /* @__PURE__ */ React25.createElement("small", { className: "fd-draft-captain-label" }, "Captain"),
    /* @__PURE__ */ React25.createElement("ol", null, Array.from({ length: size - 1 }, (_, slot) => {
      const player = team.players[slot + 1];
      const seatClass = !player ? "is-empty" : `is-seated${player === last?.player ? " is-latest" : ""}${player === arriving ? " is-arriving" : ""}${player === landed ? " is-landed" : ""}`;
      return /* @__PURE__ */ React25.createElement("li", { key: player || `empty:${slot}`, "data-seat": player || void 0, className: seatClass }, player ? /* @__PURE__ */ React25.createElement(PlayerLink, { state, player, onPlayer, disabled: !!pending }) : /* @__PURE__ */ React25.createElement(React25.Fragment, null, /* @__PURE__ */ React25.createElement("span", { className: "fd-draft-empty-chip", "aria-hidden": "true" }), /* @__PURE__ */ React25.createElement("span", null, "Pick ", Array.from({ length: turn.totalPicks }, (_2, k) => k).filter((k) => snakeTeam(k, n) === index)[slot] + 1)));
    }))
  ))))), !!crew.length && /* @__PURE__ */ React25.createElement(DraftCrew, { state, roles: crew, onPlayer, disabled: !!pending }), gm && /* @__PURE__ */ React25.createElement("div", { className: "fd-draft-footer" }, turn.complete && /* @__PURE__ */ React25.createElement(
    ActionButton,
    {
      disabled: blocked,
      pending: !!pending,
      onClick: () => submit("finish", () => onFinalize(ref), onClose)
    },
    "Confirm teams"
  ), /* @__PURE__ */ React25.createElement("div", { className: "fd-draft-secondary-actions" }, /* @__PURE__ */ React25.createElement(
    ActionButton,
    {
      compact: true,
      variant: "secondary",
      disabled: !draft.picks.length || blocked || !!pending,
      onClick: () => submit("undo", () => onUndo(ref))
    },
    "Undo last pick"
  ), /* @__PURE__ */ React25.createElement(ActionButton, { compact: true, variant: "tertiary", disabled: blocked || !!pending, onClick: () => setConfirmCancel((value) => !value) }, "Cancel draft")), confirmCancel && /* @__PURE__ */ React25.createElement("div", { className: "fd-draft-cancel" }, /* @__PURE__ */ React25.createElement("p", null, "Discard this draft and its picks?"), /* @__PURE__ */ React25.createElement(
    ActionButton,
    {
      compact: true,
      variant: "destructive",
      pending: !!pending,
      onClick: () => submit("cancel", () => onCancel(ref), onClose)
    },
    "Discard draft"
  ), /* @__PURE__ */ React25.createElement(ActionButton, { compact: true, variant: "secondary", disabled: !!pending, onClick: () => setConfirmCancel(false) }, "Keep drafting")))));
}
function ConfirmedTeams({ state, draw, me, size, onPlayer }) {
  const order = draw.teams.map((team, index) => ({ team, index })).sort((a, b) => Number(b.team.players.includes(me)) - Number(a.team.players.includes(me)));
  const role = (draw.roles || []).find((item) => item.player === me);
  return /* @__PURE__ */ React25.createElement("div", { className: "fd-draft" }, /* @__PURE__ */ React25.createElement("div", { className: "fd-draft-section-title" }, /* @__PURE__ */ React25.createElement("h2", null, "Teams confirmed"), /* @__PURE__ */ React25.createElement("span", null, draw.teams.length, " teams of ", size)), role && /* @__PURE__ */ React25.createElement("p", { className: "fd-draft-note fd-draft-role" }, /* @__PURE__ */ React25.createElement("small", null, "Your role"), /* @__PURE__ */ React25.createElement("strong", null, overflowRoleMeta(role.role).label)), /* @__PURE__ */ React25.createElement("div", { className: "fd-draft-teams", style: { "--draft-columns": Math.min(draw.teams.length, 3) } }, order.map(({ team, index }) => {
    const captain = team.captain || team.players[0];
    const yours = team.players.includes(me);
    return /* @__PURE__ */ React25.createElement(
      "section",
      {
        key: captain,
        className: `fd-draft-team${yours ? " is-yours" : ""}`,
        style: identityStyle(state, captain),
        "aria-label": yours ? "Your team" : `${disp(state, captain)}'s team`
      },
      /* @__PURE__ */ React25.createElement("header", null, /* @__PURE__ */ React25.createElement("small", null, yours ? "Your team" : team.name || `Team ${index + 1}`), /* @__PURE__ */ React25.createElement("span", null, team.players.length, "/", size)),
      yours && team.name && /* @__PURE__ */ React25.createElement("strong", { className: "fd-draft-team-name" }, team.name),
      /* @__PURE__ */ React25.createElement(PlayerLink, { state, player: captain, onPlayer }),
      /* @__PURE__ */ React25.createElement("small", { className: "fd-draft-captain-label" }, "Captain"),
      /* @__PURE__ */ React25.createElement("ol", null, team.players.filter((player) => player !== captain).map((player) => /* @__PURE__ */ React25.createElement("li", { key: player, className: "is-seated" }, /* @__PURE__ */ React25.createElement(PlayerLink, { state, player, onPlayer }))))
    );
  })), !!draw.roles?.length && /* @__PURE__ */ React25.createElement(DraftCrew, { state, roles: draw.roles, onPlayer }));
}
function PickFlyer({ state, player }) {
  return /* @__PURE__ */ React25.createElement("div", { className: "fd-draft-flyer", style: identityStyle(state, player) }, /* @__PURE__ */ React25.createElement(Avatar, { state, p: player, size: 36 }), /* @__PURE__ */ React25.createElement("span", null, disp(state, player)));
}
function DraftCrew({ state, roles, onPlayer, disabled }) {
  return /* @__PURE__ */ React25.createElement("div", { className: "fd-draft-crew" }, /* @__PURE__ */ React25.createElement("small", null, "Crew"), roles.map(({ player, role }) => /* @__PURE__ */ React25.createElement("div", { key: player }, /* @__PURE__ */ React25.createElement(PlayerLink, { state, player, onPlayer, disabled }), /* @__PURE__ */ React25.createElement("span", null, overflowRoleMeta(role).label))));
}

// src/App.jsx
init_PokerMotion();

// src/features/poker/TableView.jsx
init_serverClock();
init_haptics();
init_PokerChips();
init_PokerMotion();
init_pokerMotion();
import React28, { useEffect as useEffect17, useRef as useRef17, useState as useState17 } from "react";
import { createPortal as createPortal2 } from "react-dom";

// src/features/poker/tableView.js
init_core();
init_wakeLock();

// src/features/poker/TableView.jsx
init_ScoreReel();
init_OneSafe();
init_Icon();
var DIGITS2 = [..."0123456789"];

// src/App.jsx
init_drawReveal();

// src/features/home/HomeDuels.jsx
import React30, { useRef as useRef19, useState as useState20 } from "react";

// src/features/duels/DuelCard.jsx
init_PlayerIdentity();
import React29, { useRef as useRef18, useState as useState18 } from "react";

// src/features/duels/duelView.js
init_core();
init_serverClock2();
var fmt4 = (n) => (n ?? 0).toLocaleString("en-US");
var duelsOpen = (state) => !!(state?.live && !state.frozen && !(state.poker && !state.results?.[state.poker.id]) && !pokerLive(state) && !stacksPosted(state));
var minutesLeft = (duel, now2 = serverNow()) => {
  const at = duelLapsesAt(duel);
  return at === null ? null : Math.max(1, Math.ceil((at - now2) / 6e4));
};
function duelView(state, duel, me, now2 = serverNow()) {
  const phase = duelPhase(duel, now2);
  const sender = !!me && duel.from === me;
  const recipient = !!me && !!duel.to && duel.to === me;
  const other = sender ? duel.to || null : duel.from;
  const name = other ? disp(state, other) : "Anyone";
  const myRun = me ? duel.runs?.[me] || null : null;
  const otherDrew = !!(other && duel.runs?.[other]);
  const offer = phase === "offered";
  const live2 = phase === "live";
  const takeable = offer && !!duel.open && !!me && !sender && !duelBetween(state, duel.from, me, now2);
  const canAccept = offer && (recipient || takeable);
  const canDecline = offer && recipient || live2 && recipient && !myRun;
  const canWithdraw = offer && sender;
  const canPlay = live2 && (sender || recipient) && !myRun;
  const left = offer ? minutesLeft(duel, now2) : null;
  let status = "";
  if (offer) status = sender ? duel.open ? "Open to anyone" : `Waiting for ${name} to accept` : duel.open ? "Open challenge" : "Challenged you";
  else if (live2) status = myRun ? `Waiting for ${name} to draw` : !duel.consent && recipient && !Object.keys(duel.runs || {}).length ? "Challenged you" : otherDrew ? `${name} has drawn` : "Your turn";
  return {
    phase,
    sender,
    recipient,
    other,
    name,
    myRun,
    otherDrew,
    takeable,
    canAccept,
    canDecline,
    canWithdraw,
    canPlay,
    minutesLeft: left,
    status,
    accepted: duelAccepted(duel),
    involved: sender || recipient
  };
}
function duelResult(state, duel, viewer) {
  const phase = duelPhase(duel);
  if (!duel.to || !duelAccepted(duel)) return null;
  if (phase !== "settled" && phase !== "void") return null;
  const other = duel.from === viewer ? duel.to : duel.from;
  const r = resolveDuel(duel);
  const time = (run2) => !run2 ? "no draw" : run2.foul ? "foul" : Number.isFinite(run2.ms) ? `${run2.ms} ms` : "drew";
  const times = phase === "settled" ? `${time(duel.runs?.[viewer])} vs ${time(duel.runs?.[other])}` : "";
  const outcome = phase === "void" ? "void" : r.push ? "push" : r.winner === viewer ? "won" : "lost";
  const delta = outcome === "won" ? duel.stake : outcome === "lost" ? -duel.stake : 0;
  return { id: duel.id, other, name: disp(state, other), stake: duel.stake, times, outcome, delta, ts: duel.ts };
}
function duelRecord(state, viewer, other) {
  const lines = (state?.duels || []).filter((duel) => duel.from === viewer && duel.to === other || duel.from === other && duel.to === viewer).map((duel) => duelResult(state, duel, viewer)).filter(Boolean).sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const won = lines.filter((line) => line.outcome === "won").length;
  const lost = lines.filter((line) => line.outcome === "lost").length;
  const net = lines.reduce((sum, line) => sum + line.delta, 0);
  return { lines, won, lost, net };
}
var signedChips2 = (n) => `${n > 0 ? "+" : n < 0 ? "-" : ""}${fmt4(Math.abs(n))}`;
var ANTES = [PT, 2 * PT, 5 * PT, 10 * PT];

// src/features/duels/DuelCard.jsx
init_haptics();
var actionStyle = {
  minWidth: 0,
  minHeight: 44,
  padding: "10px 8px",
  borderRadius: 10,
  border: "1px solid var(--line)",
  background: "var(--paper2)",
  color: "var(--ink)",
  fontFamily: "var(--fd-body)",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer"
};
var DONE = { decline: "Declined", withdraw: "Withdrawn", void: "Voided" };
var PENDING = { accept: "Accepting\u2026", decline: "Declining\u2026", withdraw: "Withdrawing\u2026", void: "Voiding\u2026" };
function DuelCard({ state, duel, me, gm, now: now2, onPlay, onAccept, onDecline, onWithdraw, onVoid, onPlayer, bare = false }) {
  const [pendingAction, setPendingAction] = useState18(null);
  const [error, setError] = useState18("");
  const [acknowledged, setAcknowledged] = useState18(null);
  const pending = useRef18(null);
  const finished = useRef18(false);
  const view = duelView(state, duel, me, now2);
  const { other, name } = view;
  const busy = !!pendingAction;
  const submit = (action, handler) => {
    if (pending.current) return pending.current;
    if (finished.current || !handler) return;
    if (action === "accept") tapTick();
    setPendingAction(action);
    setError("");
    const failure = `Couldn't ${action} the duel. Try again.`;
    pending.current = Promise.resolve().then(() => handler(duel.id)).then((result) => {
      if (result?.ok !== true) {
        const rejected = { ok: false, error: result?.error || failure };
        setError(rejected.error);
        return rejected;
      }
      if (DONE[action]) {
        finished.current = true;
        setAcknowledged(DONE[action]);
      }
      return result;
    }).catch(() => {
      setError(failure);
      return { ok: false, error: failure };
    }).finally(() => {
      pending.current = null;
      setPendingAction(null);
    });
    return pending.current;
  };
  const interact = (callback) => {
    if (!pending.current && !finished.current) callback?.();
  };
  const label2 = (key) => pendingAction === key ? PENDING[key] : null;
  const actions = [
    view.canAccept && {
      key: "accept",
      label: label2("accept") || "Accept",
      aria: `Accept duel with ${name}`,
      callback: () => submit("accept", onAccept),
      enabled: !!onAccept,
      primary: true
    },
    view.canPlay && {
      key: "play",
      label: "Play",
      aria: `Play Quick Draw with ${name}`,
      callback: () => interact(() => onPlay?.(duel.id)),
      enabled: !!onPlay,
      primary: true
    },
    view.canDecline && {
      key: "decline",
      label: label2("decline") || "Decline",
      aria: `Decline duel with ${name}`,
      callback: () => submit("decline", onDecline),
      enabled: !!onDecline
    },
    view.canWithdraw && {
      key: "withdraw",
      label: label2("withdraw") || "Withdraw",
      aria: duel.open ? "Withdraw open challenge" : `Withdraw challenge to ${name}`,
      callback: () => submit("withdraw", onWithdraw),
      enabled: !!onWithdraw
    },
    gm && {
      key: "void",
      label: label2("void") || "Void",
      aria: `Void duel with ${name}`,
      callback: () => submit("void", onVoid),
      enabled: !!onVoid,
      danger: true
    }
  ].filter(Boolean);
  const highlight = view.canPlay || view.canAccept;
  return /* @__PURE__ */ React29.createElement(
    "article",
    {
      "aria-label": `Quick Draw with ${name}`,
      "aria-busy": busy,
      className: bare ? void 0 : `fd-glass-field fd-field-chip fd-lamp is-chip${highlight ? " is-live" : ""}`,
      style: bare ? { minWidth: 0 } : { padding: "12px 12px 12px", marginBottom: 8, minWidth: 0 }
    },
    /* @__PURE__ */ React29.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, minWidth: 0 } }, other && onPlayer ? /* @__PURE__ */ React29.createElement(
      "button",
      {
        type: "button",
        "aria-label": `View ${name}'s player card`,
        disabled: busy || !onPlayer || !!acknowledged,
        onClick: () => interact(() => onPlayer?.(other)),
        style: {
          display: "flex",
          alignItems: "center",
          gap: 10,
          flex: 1,
          minWidth: 0,
          minHeight: 44,
          border: 0,
          padding: 0,
          background: "none",
          color: "var(--ink)",
          textAlign: "left",
          cursor: busy ? "default" : "pointer",
          fontFamily: "var(--fd-body)"
        }
      },
      /* @__PURE__ */ React29.createElement(Avatar, { state, p: other, size: 36 }),
      /* @__PURE__ */ React29.createElement("span", { style: { flex: 1, minWidth: 0, overflowWrap: "anywhere" } }, /* @__PURE__ */ React29.createElement("strong", { style: { display: "block", fontSize: 14, fontWeight: 600, lineHeight: 1.3 } }, name), /* @__PURE__ */ React29.createElement("span", { style: { display: "block", marginTop: 3, fontSize: 12, lineHeight: 1.4, color: "var(--muted2)" } }, view.status))
    ) : /* @__PURE__ */ React29.createElement("div", { style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      flex: 1,
      minWidth: 0,
      minHeight: 44,
      fontFamily: "var(--fd-body)",
      color: "var(--ink)"
    } }, other && /* @__PURE__ */ React29.createElement(Avatar, { state, p: other, size: 36 }), /* @__PURE__ */ React29.createElement("span", { style: { flex: 1, minWidth: 0, overflowWrap: "anywhere" } }, /* @__PURE__ */ React29.createElement("strong", { style: { display: "block", fontSize: 14, fontWeight: 600, lineHeight: 1.3 } }, name), /* @__PURE__ */ React29.createElement("span", { style: { display: "block", marginTop: 3, fontSize: 12, lineHeight: 1.4, color: "var(--muted2)" } }, view.status))), /* @__PURE__ */ React29.createElement("span", { style: { flexShrink: 0, textAlign: "right", color: "var(--ink)", fontFamily: "var(--fd-body)" } }, /* @__PURE__ */ React29.createElement("strong", { style: { fontFamily: "var(--fd-display)", fontSize: 24, fontWeight: 800, color: "var(--sun)" } }, (duel.stake || 0).toLocaleString("en-US")), /* @__PURE__ */ React29.createElement("small", { style: { display: "block", color: "var(--muted2)", fontSize: 12, marginTop: 2 } }, "each"))),
    acknowledged ? /* @__PURE__ */ React29.createElement("p", { role: "status", style: { margin: "10px 0 0", color: "var(--muted2)", fontSize: 12 } }, acknowledged) : !!actions.length && /* @__PURE__ */ React29.createElement("div", { style: { display: "grid", gridTemplateColumns: `repeat(${actions.length}, minmax(0, 1fr))`, gap: 8, marginTop: 10 } }, actions.map((action) => /* @__PURE__ */ React29.createElement(
      "button",
      {
        type: "button",
        key: action.key,
        "aria-label": action.aria,
        disabled: busy || !action.enabled,
        onClick: action.callback,
        style: {
          ...actionStyle,
          ...action.primary ? { background: "var(--action-fill)", color: "var(--action-ink)", borderColor: "var(--action-fill)" } : {},
          ...action.danger ? { color: "var(--live2)", borderColor: "var(--danger-line)" } : {},
          cursor: busy || !action.enabled ? "default" : "pointer",
          opacity: busy && pendingAction !== action.key ? 0.55 : 1
        }
      },
      action.label
    ))),
    error && /* @__PURE__ */ React29.createElement("p", { role: "alert", style: {
      margin: "10px 0 0",
      fontFamily: "var(--fd-body)",
      fontSize: 12,
      color: "var(--live2)",
      lineHeight: 1.5,
      overflowWrap: "anywhere"
    } }, error)
  );
}

// src/features/duels/useDuelClock.js
init_core();
init_serverClock2();
import { useEffect as useEffect18, useState as useState19 } from "react";

// src/App.jsx
init_GameMark();
init_PayoutLadder();

// src/ui/AppChrome.jsx
init_PlayerIdentity();
init_core();
init_Brand();
init_controls();
import React33 from "react";

// src/ui/UpdateReady.jsx
import React32 from "react";

// src/ui/AppChrome.jsx
init_ScoreReel();
init_Icon();
init_OneSafe();
init_motion();
var TAB_TARGETS = Object.freeze({ board: "tab:home", sched: "tab:events", bets: "tab:bets", guide: "tab:weekend" });

// src/App.jsx
init_Brand();

// src/features/home/GuestHome.jsx
init_core();
init_PlayerIdentity();
init_PlayerIdentityContext();
init_PlayerPass();
init_layout();
import React38, { useLayoutEffect as useLayoutEffect10, useMemo as useMemo6, useRef as useRef25, useState as useState26 } from "react";

// src/features/standings/Standings.jsx
init_core();
init_PlayerIdentity();
init_PlayerIdentityContext();
init_motion();
import React35, { useCallback as useCallback2, useEffect as useEffect19, useLayoutEffect as useLayoutEffect9, useMemo as useMemo4, useRef as useRef20, useState as useState21 } from "react";

// src/features/standings/boardModel.js
var BOARD_BEATS = Object.freeze({
  count: 150,
  // numbers start counting in 100s, the change rises off them
  slide: 950,
  // rows move to their new rank
  roll: 1300,
  // rank digits roll once the rows have landed
  rollStagger: 16,
  arrows: 1500,
  // rank-change arrows pop
  leader: 1500,
  // the new leader's row warms, one sweep under it
  settle: 3e3
  // everything is at rest
});

// src/features/standings/Standings.jsx
init_controls();
init_ScoreReel();
init_OneSafe();
init_layout();
init_Icon();

// src/features/home/homeModel.js
init_core();
var unresolved = (match) => match.winner === null || match.winner === void 0;
function bracketPath(state, event, me) {
  const bracket = state.brackets?.[event?.id], draw = state.draws?.[event?.id];
  if (!bracket || !draw || state.results?.[event.id]) return null;
  const names = ROUND_NAMES[bracket.size] || [];
  const round = (r) => (names[r] || "Match").replace(/s$/, "");
  const matchName = (r, m) => bracketMatchName(bracket, r, m);
  const contest = resolveCurrentContest(state, event);
  const current = contest?.kind === "match" ? contest.match : null;
  const isCurrent = (r, m) => !!current && current[0] === r && current[1] === m;
  const team = draw.teams.findIndex((item) => item.players.includes(me));
  if (team >= 0) {
    const steps = [];
    let next = null, lost = false;
    bracket.rounds.forEach((matches, r) => matches.forEach((match, m) => {
      const a = resolveSlot(bracket, match.a), b = resolveSlot(bracket, match.b);
      if (a !== team && b !== team) return;
      if (!unresolved(match)) {
        if (match.winner === team) steps.push(`${round(r)} \u2713`);
        else lost = true;
      } else if (!next) next = { r, m, opponent: a === team ? b : a, slot: match[a === team ? "b" : "a"] };
    }));
    if (!lost) {
      if (next && isCurrent(next.r, next.m)) steps.push(`${round(next.r)} now`);
      else if (next) {
        const opponent = next.opponent !== null && next.opponent !== void 0 ? teamLabel(state, draw.teams[next.opponent]) : next.slot?.w ? `winner of ${matchName(next.slot.w[0], next.slot.w[1])}` : null;
        steps.push(opponent ? `${round(next.r)} vs ${opponent}` : round(next.r));
      }
      const won = steps.filter((step) => step.endsWith("\u2713")).length;
      if (steps.length) return { mine: true, text: steps.slice(Math.max(0, won - 1)).join(" \u2192 ") };
    }
  }
  const open = bracketOrder(bracket).filter(([r, m]) => unresolved(bracket.rounds[r][m]) && !isCurrent(r, m));
  const pick = open.find(([r, m]) => bracketMatchOpen(bracket, r, m)) || open[0];
  return pick ? { mine: false, text: `${matchName(pick[0], pick[1])} next` } : null;
}

// src/features/home/GuestHome.jsx
init_Icon();
init_ScoreReel();
init_GlassArt();
init_useGlassTilt();
init_OneSafe();
init_motion();
init_betStacks();
init_winImpact();
init_WinLine();
init_motion();

// src/features/alerts/Alerts.jsx
init_client();
init_install();
import React37, { useEffect as useEffect21, useRef as useRef21, useState as useState22, useSyncExternalStore as useSyncExternalStore3 } from "react";

// src/features/alerts/pocketAlerts.js
init_client();
var ALERT_REASONS = Object.freeze(["playing", "pick", "duel", "mvp"]);
var store = { checked: false, permission: "default", subscribed: false, busy: false, error: "", asked: false };
var cached = { ...store };

// src/features/alerts/Alerts.jsx
init_player_pass();

// src/features/home/GuestHome.jsx
init_sound();

// src/features/moments/youreUp.js
init_core();
init_motion();
init_serverClock();
init_sound();
init_faceOff();
init_tvMotion();
import { useEffect as useEffect24, useMemo as useMemo5, useRef as useRef24, useState as useState25 } from "react";
var UP_TIMING = Object.freeze({
  flood: 0,
  floodMs: 700,
  // your color floods up from your chip
  word: 250,
  wordMs: 380,
  // YOU'RE UP stamps
  sting: FACEOFF_TIMING.vs - FACEOFF_TIMING.slide,
  // the two-note sting, on the TV's VS
  vs: FACEOFF_TIMING.vs - FACEOFF_TIMING.slide + 80,
  // their chip lands opposite yours
  total: 7e3,
  // it leaves on its own
  banner: 5e3
  // a spectator's banner
});

// src/features/music/winSongModel.js
init_audio();

// src/features/home/GuestHome.jsx
init_PayoutLadder();
var hasGameRules = (event) => {
  const game = GAMES[event?.game];
  return !!(game?.howto || game?.variants?.some((variant) => variant.howto));
};

// src/features/home/guestUpdates.js
init_core();
var SINCE_ABSENCE = 2 * 60 * 1e3;

// src/App.jsx
init_haptics();

// src/features/profile/VibrationToggle.jsx
init_haptics();
init_player_pass();
import React39, { useState as useState27 } from "react";

// src/features/profile/SoundToggle.jsx
init_sound();
init_haptics();
init_player_pass();
import React40, { useState as useState28 } from "react";

// src/App.jsx
init_sound();

// src/lib/lazyPart.js
import React41, { lazy, useState as useState29 } from "react";

// src/features/home/phoneSound.js
init_core();
init_sound();
import { useEffect as useEffect25, useRef as useRef26 } from "react";

// src/App.jsx
init_drawReveal();

// src/features/weekend/Schedule.jsx
init_core();
init_PlayerIdentity();
init_layout();
init_PayoutLadder();
import React42, { useRef as useRef27, useState as useState30 } from "react";

// src/features/weekend/scheduleModel.js
init_core();

// src/features/weekend/Schedule.jsx
init_Icon();
init_OneSafe();

// src/features/weekend/Guide.jsx
init_core();
init_GlassArt();
init_useGlassTilt();
init_Icon();
init_OneSafe();
init_controls();
init_InstallHint();
init_install();
init_Trophy();
import React52, { useRef as useRef33, useState as useState40 } from "react";

// src/features/results/Keepsake.jsx
init_core();
init_controls();
init_PlayerIdentity();
init_PlayerIdentityContext();
init_playerIdentity();
init_PlayerPass();
init_CompetitionBracket();
init_Trophy();
import React47, { useEffect as useEffect30, useMemo as useMemo8, useRef as useRef30, useState as useState35 } from "react";

// src/features/results/LastCard.jsx
init_core();
init_PlayerIdentity();
init_PlayerIdentityContext();
init_PlayerPass();
init_motion();
init_useRisoTilt();
init_serverClock();
init_lastCard();
import React46, { useEffect as useEffect29, useMemo as useMemo7, useRef as useRef29, useState as useState34 } from "react";

// src/features/results/cardImage.js
init_lastCard();
var IMAGE_W = 1080;
var IMAGE_H = 1350;
var U = 3;
var W = IMAGE_W / U;
var H = IMAGE_H / U;

// src/features/results/LastCard.jsx
init_crownTiming();
init_sound();

// src/features/results/SavePoster.jsx
import React45, { useEffect as useEffect28, useRef as useRef28, useState as useState33 } from "react";
init_classPhoto();

// src/features/results/posterImage.js
init_PlayerIdentity();
init_playerIdentity();
init_desertModel();
init_classPhoto();

// src/features/results/LastCard.jsx
init_Icon();

// src/features/results/Keepsake.jsx
init_lastCard();

// src/features/results/keepsake.js
init_core();
init_prompts();
init_lastCard();
var SESSION_NAMES = Object.freeze({
  fri: "Friday",
  sam: "Saturday morning",
  sap: "Saturday afternoon",
  san: "Saturday night",
  fin: "Finale"
});

// src/features/results/Keepsake.jsx
init_OneSafe();
init_GlassArt();

// src/features/photos/PhotoDesk.jsx
init_client();
init_photoModel();
init_prepareMoment();
import React49, { useRef as useRef32, useState as useState37 } from "react";

// src/features/photos/PhotoGrid.jsx
init_core();
init_PlayerIdentity();
init_controls();
init_client();
init_photoModel();
import React48, { useEffect as useEffect31, useRef as useRef31, useState as useState36 } from "react";
init_Icon();

// src/features/photos/PhotoDesk.jsx
init_Icon();

// src/features/weekend/Guide.jsx
init_photoModel();
init_programModel();

// src/features/weekend/ProgramSheets.jsx
init_core();
init_controls();
init_Icon();
init_OneSafe();
init_PayoutLadder();
init_PlayerIdentity();
init_Travel();
import React51, { useState as useState39 } from "react";
init_programModel();
var HOST = ROSTER.includes("Brandon") ? "Brandon" : null;

// src/App.jsx
init_programModel();
init_Wagers();
init_PokerChips();
init_PlayerIdentityContext();
init_PlayerIdentity();
init_Travel();
init_ProfileEditor();
import React85, { useState as useState66, useEffect as useEffect60, useLayoutEffect as useLayoutEffect19, useRef as useRef59, useMemo as useMemo15, useCallback as useCallback6, useId as useId9, lazy as lazy2, Suspense } from "react";

// src/features/profile/PlayerSheet.jsx
init_core();
init_PlayerIdentity();
init_controls();
import React58, { useEffect as useEffect36, useMemo as useMemo10, useRef as useRef37, useState as useState45 } from "react";
init_PlayerPass();
init_seasonStats();
init_motion2();
init_serverClock();
init_haptics();
var fmt7 = (n) => (n ?? 0).toLocaleString("en-US");
var OUTCOME = { won: "Won", lost: "Lost", push: "Push", void: "Void" };
function rematchAvailable(state, me, p, { events = [], now: now2 = serverNow() } = {}) {
  if (!me || !p || me === p || !duelsOpen(state)) return false;
  if (state.away?.[me] || state.away?.[p] || duelBetween(state, me, p, now2)) return false;
  return headToHead(state, me, p, events.length ? events : void 0).count > 0;
}
function PlayerSheet({
  state,
  me,
  p,
  standings,
  events = [],
  onClose,
  onBack,
  onEdit,
  onDuel,
  onSent,
  onPlay,
  onAccept,
  onDecline,
  onWithdraw
}) {
  const [ante, setAnte] = useState45(PT);
  const [pending, setPending] = useState45(false);
  const [error, setError] = useState45("");
  const sending = useRef37(false);
  const now2 = serverNow();
  const row = standings.find((item) => item.player === p);
  const duels = state.duels || [];
  const settled = duels.map((d) => resolveDuel(d)).filter((result) => result.settled && !result.push);
  const duelWins = settled.filter((result) => result.winner === p).length;
  const duelLosses = settled.filter((result) => result.loser === p).length;
  const wins = events.filter((event) => state.results[event.id]?.slots?.[0]?.includes(p));
  const own = !!me && me === p;
  const away = !!(state.away?.[p] || me && state.away?.[me]);
  const canDuel = !!(onDuel && me && duelsOpen(state));
  const current = !me ? null : own ? duels.find((d) => d.open && d.from === me && duelPhase(d, now2) === "offered") || null : duelBetween(state, me, p, now2) || duels.find((d) => d.from === p && d.open && duelView(state, d, me, now2).takeable) || null;
  const record = me && !own ? duelRecord(state, me, p) : null;
  const history = own ? duels.map((d) => duelResult(state, d, me)).filter(Boolean).sort((a, b) => (b.ts || 0) - (a.ts || 0)) : record?.lines || [];
  const last = !own ? history[0] : null;
  const room = (player) => duelRoom(state, player, { events, rows: standings, now: now2 }).room;
  const anteMax = canDuel && !away && !current ? Math.min(room(me), own ? Infinity : room(p)) : 0;
  const dailyLimit = !!me && duelsSentToday(state, me, now2) >= DUEL_DAILY_LIMIT;
  const unavailable = dailyLimit ? "Daily limit of 3 challenges reached." : anteMax < PT ? "Not enough chips for an ante." : "";
  const rematch = !!last && last.outcome !== "void" && ante === last.stake;
  const [turned, setTurned] = useState45(false);
  const duelRef = useRef37(null);
  const reducedMotion = useReducedMotion();
  const canRematch = useMemo10(
    () => !!onDuel && rematchAvailable(state, me, p, { events, now: now2 }),
    [state, me, p, events, onDuel]
  );
  const openRematch = () => {
    if (last && last.outcome !== "void" && last.stake <= anteMax) setAnte(last.stake);
    const section = duelRef.current;
    section?.scrollIntoView?.({ block: "center", behavior: reducedMotion ? "auto" : "smooth" });
    section?.querySelector?.("[data-duel-send]")?.focus?.({ preventScroll: true });
  };
  useEffect36(() => {
    setAnte((currentAnte) => currentAnte <= anteMax ? currentAnte : ANTES.filter((value) => value <= anteMax).at(-1) || PT);
  }, [anteMax]);
  useEffect36(() => {
    setAnte(last && last.stake <= anteMax ? last.stake : PT);
    setError("");
  }, [p]);
  const challenge = async () => {
    if (sending.current || !canDuel || away || current || unavailable || ante > anteMax) return;
    tapTick();
    sending.current = true;
    setPending(true);
    setError("");
    try {
      const result = own ? await onDuel(ante, true) : await onDuel(ante);
      if (result?.ok) onSent ? onSent(result) : onClose();
      else setError(result?.error || "Challenge wasn't sent. Try again.");
    } catch (cause) {
      setError(cause?.message || "Challenge wasn't sent. Try again.");
    } finally {
      sending.current = false;
      setPending(false);
    }
  };
  return /* @__PURE__ */ React58.createElement(Sheet, { title: disp(state, p), onClose, onBack, busy: pending, show: true }, /* @__PURE__ */ React58.createElement("div", { className: "fd-player-sheet" }, /* @__PURE__ */ React58.createElement(
    PlayerPass,
    {
      key: p,
      state,
      p,
      compact: true,
      viewer: me || null,
      own: !!me && me === p,
      events: events.length ? events : void 0,
      standings,
      onFlip: setTurned
    }
  ), turned && canRematch && /* @__PURE__ */ React58.createElement(
    ActionButton,
    {
      type: "button",
      className: "fd-player-rematch",
      onClick: openRematch
    },
    "Rematch"
  ), own && onEdit && /* @__PURE__ */ React58.createElement(
    ActionButton,
    {
      type: "button",
      variant: "secondary",
      onClick: onEdit,
      style: { width: "100%" }
    },
    "Edit your profile"
  ), canDuel && (current || !away) && /* @__PURE__ */ React58.createElement("section", { ref: duelRef, className: "fd-player-duel", "aria-label": "Quick Draw challenge" }, /* @__PURE__ */ React58.createElement("details", { className: "fd-player-duel-rules" }, /* @__PURE__ */ React58.createElement("summary", null, /* @__PURE__ */ React58.createElement("h2", null, "Quick Draw"), /* @__PURE__ */ React58.createElement("span", null, "How to play +")), /* @__PURE__ */ React58.createElement("p", null, "Tap when the screen flashes. Fastest tap wins both antes. Tapping early is a foul. An unanswered challenge lapses after ", DUEL_LAPSE_MS / 6e4, " minutes.")), current ? /* @__PURE__ */ React58.createElement(
    DuelCard,
    {
      bare: true,
      state,
      duel: current,
      me,
      now: now2,
      onPlay,
      onAccept,
      onDecline,
      onWithdraw
    }
  ) : unavailable ? /* @__PURE__ */ React58.createElement("p", { className: "fd-player-unavailable", role: "status" }, unavailable) : /* @__PURE__ */ React58.createElement(React58.Fragment, null, /* @__PURE__ */ React58.createElement("fieldset", { className: "fd-player-antes", disabled: pending }, /* @__PURE__ */ React58.createElement("legend", null, "Ante, each"), ANTES.map((value) => /* @__PURE__ */ React58.createElement(
    "button",
    {
      type: "button",
      key: value,
      disabled: value > anteMax || pending,
      "aria-pressed": ante === value,
      "aria-label": `Ante ${fmt7(value)} chips each`,
      onClick: () => setAnte(value)
    },
    /* @__PURE__ */ React58.createElement(BankChip, { p: me, size: 44, val: value })
  ))), error && /* @__PURE__ */ React58.createElement("p", { className: "fd-player-error", role: "alert" }, error), /* @__PURE__ */ React58.createElement(
    ActionButton,
    {
      type: "button",
      "data-duel-send": "",
      onClick: challenge,
      disabled: pending || ante > anteMax,
      pending,
      style: { width: "100%" }
    },
    pending ? "Sending\u2026" : own ? `Challenge anyone for ${fmt7(ante)}` : rematch ? `Rematch for ${fmt7(ante)}` : `Challenge ${disp(state, p)} for ${fmt7(ante)}`
  ))), !!me && history.length > 0 && /* @__PURE__ */ React58.createElement("section", { className: "fd-player-duel-results", "aria-label": "Quick Draw results" }, /* @__PURE__ */ React58.createElement("h2", null, own ? "Your duels" : `You vs ${disp(state, p)}`), record && /* @__PURE__ */ React58.createElement("p", { className: "fd-player-duel-score" }, /* @__PURE__ */ React58.createElement("strong", null, record.won, "-", record.lost), /* @__PURE__ */ React58.createElement("span", null, signedChips2(record.net))), /* @__PURE__ */ React58.createElement("ul", null, history.map((line) => /* @__PURE__ */ React58.createElement("li", { key: line.id, className: `is-${line.outcome}` }, /* @__PURE__ */ React58.createElement("span", null, own ? `vs ${line.name}` : `${fmt7(line.stake)} each`, line.times && /* @__PURE__ */ React58.createElement("small", null, line.times)), /* @__PURE__ */ React58.createElement("strong", null, OUTCOME[line.outcome], line.delta !== 0 && ` ${signedChips2(line.delta)}`)))))));
}

// src/App.jsx
init_InstallHint();
init_tvModel();
init_serverClock();
init_motion();
init_frameGate();
init_resultMoment();

// src/features/results/ChipReceipt.jsx
init_Icon();
init_PlayerIdentity();
init_BetStacks();
init_motion();
init_sound();
init_resultMoment();
import React60, { useEffect as useEffect38, useLayoutEffect as useLayoutEffect14, useRef as useRef39 } from "react";

// src/features/results/ChipShower.jsx
init_PlayerIdentity();
init_motion();
init_sound();
import React59, { useEffect as useEffect37, useMemo as useMemo11, useRef as useRef38, useState as useState46 } from "react";
var SHOWER_CHIPS = 16;
var RAIN = Object.freeze({ min: 4, max: SHOWER_CHIPS, first: 420, gap: 110, fall: 620, bounce: 280, hold: 650, sweep: 520 });

// src/features/moments/PhoneMoments.jsx
init_Icon();
init_core();
init_PlayerIdentity();
init_PlayerIdentityContext();
init_PlayerPass();
init_sound();
init_haptics();
init_walkout();
init_walkoutTeam();
import React61, { useEffect as useEffect40, useRef as useRef41 } from "react";
init_OneSafe();
init_ScoreReel();

// src/features/moments/SkyStrip.jsx
init_core();
init_motion();
init_phase();
init_GameMark();
init_OneSafe();
init_PlayerIdentity();
init_PlayerIdentityContext();
init_desertModel();
init_walkoutTeam();
import React62, { useEffect as useEffect41, useMemo as useMemo12, useState as useState48 } from "react";

// src/features/results/useCrownMoment.js
init_motion();
init_lastCard();
import { useCallback as useCallback4, useEffect as useEffect42, useState as useState49 } from "react";

// src/App.jsx
init_install();
init_core();

// src/features/duels/QuickDraw.jsx
init_core();
init_PlayerIdentity();
init_controls();
import React63, { useCallback as useCallback5, useEffect as useEffect43, useLayoutEffect as useLayoutEffect15, useRef as useRef42, useState as useState50 } from "react";
init_haptics();
init_sound();
var FOUL = Object.freeze({ ms: null, foul: true });

// src/features/duels/DuelDesk.jsx
init_core();
init_controls();
import React64, { useRef as useRef43, useState as useState51 } from "react";

// src/features/director/DirectorPill.jsx
init_core();
init_PlayerIdentity();
init_directorPill();
init_haptics();
import React66, { useEffect as useEffect45, useRef as useRef45, useState as useState52 } from "react";

// src/features/director/RunOfShow.jsx
init_Icon();
init_serverClock();
init_haptics();
import React65, { useEffect as useEffect44, useRef as useRef44 } from "react";

// src/features/director/runOfShow.js
init_core();
init_show();
init_directorPill();
var RUN_SLOTS = Object.freeze(["Now", "Next", "Then"]);

// src/features/director/DirectorPill.jsx
init_sound();
init_director();
init_Icon();

// src/features/director/CueRack.jsx
init_core();
init_client();
init_serverClock();
init_haptics();
import React67, { useEffect as useEffect46, useState as useState53, useSyncExternalStore as useSyncExternalStore4 } from "react";

// src/features/director/walkout.js
init_audio();

// src/features/director/CueRack.jsx
init_Icon();
init_PlayerIdentity();
var MISS_SHOWN_MS = 10 * 60 * 1e3;

// src/features/director/TvHealth.jsx
init_tvHealth();
init_Icon();
import React68, { useEffect as useEffect47, useState as useState54 } from "react";

// src/features/director/CommissionerDock.jsx
import React69, { useLayoutEffect as useLayoutEffect16, useRef as useRef46 } from "react";

// src/features/awards/AwardsHome.jsx
init_core();
init_PlayerIdentity();
init_client();
init_haptics();
init_serverClock();
init_prompts();
init_awardsModel();
init_awards();
init_Icon();
import React70, { useEffect as useEffect48, useRef as useRef47, useState as useState55 } from "react";

// src/features/mvp/MvpHome.jsx
init_core();
init_PlayerIdentity();
init_client();
init_haptics();
init_serverClock();
init_controls();
import React71, { useEffect as useEffect49, useRef as useRef48, useState as useState56 } from "react";

// src/features/mvp/mvpHome.js
init_mvp();
var MVP_RESULT_MS = 2 * 60 * 1e3;

// src/features/mvp/MvpHome.jsx
init_awards();

// src/features/teams/TeamNameCard.jsx
init_core();
init_client();
init_haptics();
init_PlayerIdentity();
init_Icon();
init_RenameText();
import React72, { useRef as useRef49, useState as useState57 } from "react";

// src/features/teams/teamNameModel.js
init_core();
init_teamNames();
function teamNaming(state, ev, index, { gm = false, round = 0 } = {}) {
  const draw = ev ? state?.draws?.[ev.id] : null;
  const team = draw?.teams?.[index];
  if (!team || (team.players?.length || 0) < 2) return null;
  const locked = teamNamesLocked(state, ev.id);
  if (locked && !gm) return null;
  return {
    evId: ev.id,
    drawId: draw.id,
    team: index,
    players: [...team.players],
    name: team.name || null,
    label: teamLabel(state, team),
    named: team.named || null,
    pair: team.players.length === 2,
    locked,
    suggestions: teamNameSuggestions(state, ev, draw, index, round)
  };
}
function myTeamNaming(state, ev, me, options = {}) {
  if (!me || !ev) return null;
  const index = state?.draws?.[ev.id]?.teams?.findIndex((team) => team.players.includes(me)) ?? -1;
  return index < 0 ? null : teamNaming(state, ev, index, options);
}
function checkTeamName(state, naming, raw) {
  const problem = teamNameProblem(raw);
  if (problem) return { error: problem };
  const name = cleanTeamName(raw);
  if (name === null) return naming?.pair ? { name: null } : { error: "Name required" };
  const others = (state?.draws?.[naming?.evId]?.teams || []).filter((team, index) => index !== naming?.team && team?.name);
  if (others.some((team) => teamNameKey(team.name) === teamNameKey(name))) return { error: "Another team has that name" };
  return { name };
}

// src/features/teams/TeamNameCard.jsx
init_teams();
var sendName = (payload) => dispatch("nameTeam", payload, { retry: true });
function NameEditor({ state, naming, round, onRound, onSend, onDone }) {
  const [pending, setPending] = useState57(null);
  const [writing, setWriting] = useState57(false);
  const [draft, setDraft] = useState57("");
  const [error, setError] = useState57("");
  const busy = useRef49(false);
  const current = naming.name;
  const send = async (name) => {
    if (busy.current) return;
    const checked = checkTeamName(state, naming, name);
    if (checked.error) {
      setError(checked.error);
      return;
    }
    if ((checked.name ?? null) === (current ?? null)) {
      setWriting(false);
      onDone?.();
      return;
    }
    busy.current = true;
    setPending(checked.name ?? "");
    setError("");
    try {
      const result = await onSend({ evId: naming.evId, drawId: naming.drawId, team: naming.team, name: checked.name });
      if (result?.ok !== true) setError(result?.error || "Not saved. Try again.");
      else {
        setWriting(false);
        setDraft("");
        onDone?.();
      }
    } catch {
      setError("Not saved. Try again.");
    } finally {
      busy.current = false;
      setPending(null);
    }
  };
  const pick = (name) => {
    tapTick();
    send(name);
  };
  return /* @__PURE__ */ React72.createElement("div", { className: "fd-teamname-edit", "aria-busy": pending !== null }, /* @__PURE__ */ React72.createElement("div", { className: "fd-teamname-chips", role: "group", "aria-label": "Suggestions" }, [...current && !naming.suggestions.includes(current) ? [current] : [], ...naming.suggestions].map((name) => {
    const on = pending !== null ? pending === name : current === name;
    return /* @__PURE__ */ React72.createElement(
      "button",
      {
        type: "button",
        key: name,
        className: `fd-teamname-chip${on ? " is-on" : ""}`,
        "aria-pressed": on,
        disabled: pending !== null,
        onClick: () => pick(name)
      },
      name === current ? /* @__PURE__ */ React72.createElement(RenameText, { name }) : name,
      name === current && pending === null && /* @__PURE__ */ React72.createElement(NamedBy, { state, named: naming.named, size: 22 })
    );
  }), /* @__PURE__ */ React72.createElement(
    "button",
    {
      type: "button",
      className: "fd-teamname-chip is-tool",
      "aria-label": "More names",
      disabled: pending !== null,
      onClick: () => {
        tapTick();
        onRound(round + 1);
      }
    },
    /* @__PURE__ */ React72.createElement(Icon, { name: "shuffle", size: 20 })
  )), writing ? /* @__PURE__ */ React72.createElement("form", { className: "fd-teamname-write", onSubmit: (event) => {
    event.preventDefault();
    send(draft);
  } }, /* @__PURE__ */ React72.createElement(
    "input",
    {
      type: "text",
      value: draft,
      maxLength: TEAM_NAME_MAX,
      autoFocus: true,
      enterKeyHint: "done",
      autoComplete: "off",
      autoCapitalize: "words",
      spellCheck: false,
      "aria-label": "Team name",
      placeholder: naming.label,
      disabled: pending !== null,
      onChange: (event) => {
        setDraft(event.target.value.replace(/[\r\n]+/g, " "));
        setError("");
      }
    }
  ), /* @__PURE__ */ React72.createElement("button", { type: "submit", className: "fd-teamname-save", disabled: pending !== null || !draft.trim() }, pending !== null ? "Saving\u2026" : "Save")) : /* @__PURE__ */ React72.createElement("div", { className: "fd-teamname-own" }, /* @__PURE__ */ React72.createElement(
    "button",
    {
      type: "button",
      className: "fd-teamname-link",
      disabled: pending !== null,
      onClick: () => {
        setWriting(true);
        setDraft("");
        setError("");
      }
    },
    /* @__PURE__ */ React72.createElement(Icon, { name: "pencil", size: 18 }),
    "Write your own"
  ), naming.pair && current && /* @__PURE__ */ React72.createElement(
    "button",
    {
      type: "button",
      className: "fd-teamname-link",
      disabled: pending !== null,
      onClick: () => send(null)
    },
    "Use our names"
  )), error && /* @__PURE__ */ React72.createElement("p", { className: "fd-teamname-error", role: "alert" }, error));
}
function NamedBy({ state, named, size = 28 }) {
  if (!named?.by) return null;
  return /* @__PURE__ */ React72.createElement("span", { className: "fd-teamname-by", role: "img", "aria-label": `Named by ${disp(state, named.by)}` }, /* @__PURE__ */ React72.createElement(Avatar, { state, p: named.by, size }));
}
function TeamNameCard({ state, naming: given, ev, me, gm = false, index = null, onSend = sendName, className = "" }) {
  const [round, setRound] = useState57(0);
  const resolved = given || (index !== null ? teamNaming(state, ev, index, { gm, round }) : myTeamNaming(state, ev, me, { gm, round }));
  const [open, setOpen] = useState57(null);
  if (!resolved) return null;
  const naming = resolved;
  const chosen = !!naming.named;
  const expanded = open ?? (!naming.pair && !chosen && !gm);
  const lamp = chosen || gm ? "" : " fd-lamp is-info is-pending";
  return /* @__PURE__ */ React72.createElement(
    "section",
    {
      className: `fd-teamname fd-glass-field fd-field-info${lamp}${gm ? " is-desk" : ""} ${className}`.trim(),
      "aria-label": gm ? `${naming.label} name` : "Name your team"
    },
    /* @__PURE__ */ React72.createElement("div", { className: "fd-teamname-head" }, expanded && !gm ? /* @__PURE__ */ React72.createElement("h2", { className: "fd-teamname-ask" }, "Name your team") : /* @__PURE__ */ React72.createElement("div", { className: "fd-teamname-current" }, !gm && !naming.name ? /* @__PURE__ */ React72.createElement("h2", { className: "fd-teamname-ask" }, "Name your team") : /* @__PURE__ */ React72.createElement(RenameText, { name: naming.label, as: "h2", className: "fd-show fd-teamname-name" }), naming.name && /* @__PURE__ */ React72.createElement(NamedBy, { state, named: naming.named })), /* @__PURE__ */ React72.createElement(
      "button",
      {
        type: "button",
        className: `fd-teamname-toggle${expanded ? " is-open" : ""}`,
        "aria-expanded": expanded,
        "aria-label": expanded ? "Close" : "Rename",
        onClick: () => setOpen(!expanded)
      },
      /* @__PURE__ */ React72.createElement(Icon, { name: expanded ? "collapse" : "pencil", size: 20 })
    )),
    expanded && /* @__PURE__ */ React72.createElement(
      NameEditor,
      {
        state,
        naming,
        round,
        onRound: setRound,
        onSend,
        onDone: () => {
          if (gm || naming.pair) setOpen(false);
        }
      }
    )
  );
}
function TeamNameDesk({ state, ev, onSend }) {
  const teams = state?.draws?.[ev?.id]?.teams || [];
  if (!teams.some((team) => (team.players?.length || 0) >= 2)) return null;
  return /* @__PURE__ */ React72.createElement("div", { className: "fd-teamname-desk", role: "group", "aria-label": "Team names" }, /* @__PURE__ */ React72.createElement("h3", null, "Team names"), teams.map((team, index) => (team.players?.length || 0) >= 2 && /* @__PURE__ */ React72.createElement(TeamNameCard, { key: `${state.draws[ev.id].id}:${index}`, state, ev, index, gm: true, onSend })));
}

// src/features/geo/GeoPlay.jsx
init_client();
init_serverClock();
init_haptics();
init_motion();
init_geo();
init_PlayerIdentityContext();
init_GeoMap();
init_WhenPicker();
init_PlaceSearch();
init_geoModel();
init_geo2();
init_Icon();
import React77, { useEffect as useEffect54, useRef as useRef53, useState as useState61 } from "react";

// src/features/trivia/TriviaPlay.jsx
init_client();
init_serverClock();
init_haptics();
init_motion();
init_sound();
init_trivia();
init_PlayerIdentity();
init_Wheel();
init_Icon();
init_OneSafe();
init_triviaModel();
init_geo2();
init_trivia2();
import React78, { useEffect as useEffect55, useRef as useRef54, useState as useState62 } from "react";

// src/App.jsx
init_trivia();

// src/features/jersey/Jersey.jsx
init_core();
init_guestSetup();
init_Travel();
import React79, { useId as useId7 } from "react";
init_Icon();

// src/features/profile/TripDetails.jsx
init_guestSetup();
import React80, { useId as useId8 } from "react";

// src/App.jsx
init_guestSetup();

// src/features/music/WinSongPicker.jsx
init_client();
import React82, { useEffect as useEffect57, useRef as useRef56, useState as useState64 } from "react";

// src/features/music/previewPlayer.js
init_client();
init_sound();
import { useSyncExternalStore as useSyncExternalStore5 } from "react";
var KNOWN_MS = 8 * 60 * 1e3;

// src/features/music/SnippetPreview.jsx
init_client();
init_sound();
import React81, { useEffect as useEffect56, useRef as useRef55, useState as useState63 } from "react";

// src/features/music/WinSongPicker.jsx
init_Icon();

// src/App.jsx
init_awardsModel();
init_directorPill();
init_show();
init_client();

// src/ui/Shell.jsx
import React83 from "react";
init_backglass();
function Shell({ children, tv: tv2, arrival, environment = "production" }) {
  return /* @__PURE__ */ React83.createElement("div", { className: `fd-shell${tv2 ? " fd-night" : ""}` }, /* @__PURE__ */ React83.createElement("div", { className: `fd-shell-inner${tv2 ? " is-tv" : arrival ? " is-arrival" : ""}` }, environment !== "production" && /* @__PURE__ */ React83.createElement("div", { className: "fd-environment", "aria-label": `${environment} environment` }, environment, " \xB7 Field Day"), children));
}

// src/ui/usePhaseTheme.js
init_phase();
init_motion2();
import { useLayoutEffect as useLayoutEffect18, useMemo as useMemo14, useRef as useRef57 } from "react";
var STAGING = (() => {
  try {
    return import.meta.env?.MODE === "staging";
  } catch {
    return false;
  }
})();

// src/App.jsx
init_theme();
init_controls();
init_Menu();
init_tvSheetModel();
init_speakerModel();
init_speakerStatus();
init_Icon();
var Onboarding2 = lazy2(() => Promise.resolve().then(() => (init_Onboarding(), Onboarding_exports)).then((module) => ({ default: module.Onboarding })));
var prefersReducedMotion2 = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
var fmt8 = (n) => (n ?? 0).toLocaleString("en-US");
var SINCE_HOLD_MS = 5 * 60 * 1e3;
var DUEL_LAPSE_NOTICE_MS = 15 * 60 * 1e3;
var centeredGridCell = (i, count, columns = 3, gap = 6) => {
  if (i !== count - 1 || count % columns !== 1) return {};
  if (columns % 2) return { gridColumn: String(Math.ceil(columns / 2)) };
  return { gridColumn: "1 / -1", width: `calc(${100 / columns}% - ${gap / 2}px)`, justifySelf: "center" };
};
function PlayerChip({ name, selected, disabled, onClick, small, style }) {
  return /* @__PURE__ */ React85.createElement("button", { onClick, disabled, "aria-pressed": selected, style: {
    fontFamily: SANS,
    fontWeight: 600,
    fontSize: small ? 13 : 14,
    padding: small ? "9px 8px" : "11px 10px",
    borderRadius: 10,
    width: "100%",
    cursor: disabled ? "default" : "pointer",
    background: selected ? GOLD_GRAD : "var(--paper)",
    color: selected ? "var(--ink0)" : disabled ? "var(--disabled)" : "var(--ink)",
    border: selected ? "1.5px solid var(--ink0)" : "1.5px solid var(--line)",
    opacity: disabled && !selected ? 0.4 : 1,
    transition: "all .12s",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    ...style
  } }, name);
}
function EventIntro({ state, ev, handoff, onClose, onBets }) {
  const reduced = prefersReducedMotion2();
  return /* @__PURE__ */ React85.createElement(
    EventAnnouncement,
    {
      state,
      ev,
      handoff,
      onClose,
      onBets,
      live: true,
      reduced,
      anchor: Number(state.eventOps?.[ev.id]?.announcedAt) || null,
      holdMs: reduced ? DRAW_INTRO_REDUCED_MS : DRAW_INTRO_MS
    }
  );
}
function ChipCounter({ start, onDone }) {
  const denominations = [1e3, 500, 100, 25];
  const countId = useId9(), saving = useRef59(false);
  const [counts, setCounts] = useState66(() => {
    let left = start || 0;
    return Object.fromEntries(denominations.map((value) => {
      const n = Math.floor(left / value);
      left -= n * value;
      return [value, n];
    }));
  });
  const [pending, setPending] = useState66(false), [error, setError] = useState66("");
  const total = denominations.reduce((sum, value) => sum + Number(counts[value] || 0) * value, 0);
  const set = (value, count) => {
    if (!saving.current) setCounts((current) => ({ ...current, [value]: count }));
  };
  return /* @__PURE__ */ React85.createElement("div", { className: "fd-chip-counter" }, denominations.map((value) => /* @__PURE__ */ React85.createElement("div", { className: "fd-chip-count-row", key: value }, /* @__PURE__ */ React85.createElement("label", { htmlFor: countId + value }, fmt8(value), " chips"), /* @__PURE__ */ React85.createElement(
    "button",
    {
      type: "button",
      disabled: pending || !Number(counts[value]),
      "aria-label": "Remove one " + value + " chip",
      onClick: () => set(value, Math.max(0, Number(counts[value] || 0) - 1))
    },
    /* @__PURE__ */ React85.createElement(Icon, { name: "minus", size: 16 })
  ), /* @__PURE__ */ React85.createElement(
    "input",
    {
      id: countId + value,
      "aria-label": "Number of " + value + " chips",
      inputMode: "numeric",
      pattern: "[0-9]*",
      value: counts[value],
      disabled: pending,
      onChange: (event) => {
        if (/^\d*$/.test(event.target.value)) set(value, event.target.value);
      }
    }
  ), /* @__PURE__ */ React85.createElement("button", { type: "button", disabled: pending, "aria-label": "Add one " + value + " chip", onClick: () => set(value, Number(counts[value] || 0) + 1) }, /* @__PURE__ */ React85.createElement(Icon, { name: "plus", size: 16 })))), /* @__PURE__ */ React85.createElement("div", { className: "fd-chip-count-total" }, /* @__PURE__ */ React85.createElement("span", null, "Total"), /* @__PURE__ */ React85.createElement("strong", null, fmt8(total))), error && /* @__PURE__ */ React85.createElement("p", { role: "alert" }, error), /* @__PURE__ */ React85.createElement(ActionButton, { disabled: pending, onClick: async () => {
    if (saving.current) return;
    saving.current = true;
    setPending(true);
    setError("");
    try {
      const result = await onDone(total);
      if (result?.ok !== true) setError(result?.error || "Count not saved. Try again.");
    } catch (failure) {
      setError(failure?.message || "Count not saved. Try again.");
    } finally {
      saving.current = false;
      setPending(false);
    }
  }, style: { width: "100%" } }, pending ? "Saving\u2026" : "Save count"));
}
function PokerResultSheet({ state, onClose, onCount, onBust, onUnbust, onPost }) {
  const pk = state.poker;
  const [fixing, setFixing] = useState66(null);
  const [pending, setPending] = useState66(false), [error, setError] = useState66("");
  const saving = useRef59(false);
  const act = async (callback) => {
    if (saving.current) return { ok: false, error: "Saving\u2026" };
    saving.current = true;
    setPending(true);
    setError("");
    try {
      const result = await callback();
      if (result?.ok !== true) setError(result?.error || "Not saved. Try again.");
      return result;
    } catch (failure) {
      const message = failure?.message || "Not saved. Try again.";
      setError(message);
      return { ok: false, error: message };
    } finally {
      saving.current = false;
      setPending(false);
    }
  };
  if (!pk) return null;
  const outSet = new Set(pk.outs.map((o) => o.player));
  const seats = pk.seats || ROSTER;
  const alive = seats.filter((p) => !outSet.has(p));
  const counted = alive.filter((p) => pk.counts?.[p] !== void 0);
  const sum = counted.reduce((s, p) => s + pk.counts[p], 0);
  const allIn = counted.length === alive.length;
  return /* @__PURE__ */ React85.createElement(Sheet, { title: "The table", onClose, busy: pending }, seats.map((p) => {
    const out = outSet.has(p);
    const c = pk.counts?.[p];
    return /* @__PURE__ */ React85.createElement("div", { key: p }, /* @__PURE__ */ React85.createElement("div", { className: "fd-poker-count-row" + (out ? " is-out" : "") }, /* @__PURE__ */ React85.createElement(
      "button",
      {
        className: "fd-poker-count-player",
        disabled: out || pending,
        "aria-expanded": fixing === p,
        "aria-label": out ? `${disp(state, p)} is out` : `Edit ${disp(state, p)}'s chip count`,
        onClick: () => {
          if (!saving.current) setFixing((f) => f === p ? null : p);
        }
      },
      /* @__PURE__ */ React85.createElement(Avatar, { state, p, size: 28 }),
      /* @__PURE__ */ React85.createElement("span", null, disp(state, p)),
      out ? /* @__PURE__ */ React85.createElement(Tag, null, "Out") : c !== void 0 ? /* @__PURE__ */ React85.createElement("strong", null, fmt8(c)) : /* @__PURE__ */ React85.createElement("small", null, "counting")
    ), /* @__PURE__ */ React85.createElement(
      "button",
      {
        className: "fd-poker-count-action",
        disabled: pending,
        "aria-label": `${out ? "Bring back" : "Bust"} ${disp(state, p)}`,
        onClick: () => act(async () => {
          const result = await (out ? onUnbust(p) : onBust(p));
          if (result?.ok) setFixing(null);
          return result;
        })
      },
      out ? "Back in" : "Bust"
    )), fixing === p && !out && /* @__PURE__ */ React85.createElement("div", { className: "fd-night", style: {
      padding: "10px 0",
      borderBottom: "1px solid var(--line)",
      background: "var(--night)",
      margin: "0 -16px",
      paddingLeft: 16,
      paddingRight: 16
    } }, /* @__PURE__ */ React85.createElement(ChipCounter, { start: c, onDone: (total) => act(async () => {
      const result = await onCount(p, total);
      if (result?.ok) setFixing(null);
      return result;
    }) })));
  }), /* @__PURE__ */ React85.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, padding: "12px 0 4px" } }, /* @__PURE__ */ React85.createElement("span", { style: { ...label, flex: 1 } }, "Counted"), /* @__PURE__ */ React85.createElement("span", { style: {
    fontFamily: DISPLAY,
    fontWeight: 700,
    fontSize: 22,
    color: allIn && sum === pk.total ? "var(--green)" : "var(--ink)"
  } }, fmt8(sum)), /* @__PURE__ */ React85.createElement("span", { style: { fontFamily: SANS, fontSize: 12.5, color: "var(--muted)" } }, "of ", fmt8(pk.total))), allIn && sum !== pk.total && /* @__PURE__ */ React85.createElement("div", { style: { fontFamily: SANS, fontSize: 12.5, color: "var(--clay-text)", marginBottom: 10 } }, sum > pk.total ? `${fmt8(sum - pk.total)} over` : `${fmt8(pk.total - sum)} short`, "."), error && /* @__PURE__ */ React85.createElement("p", { role: "alert", style: { color: "var(--clay-text)", fontSize: 13 } }, error), /* @__PURE__ */ React85.createElement(Btn, { disabled: !allIn || pending, onClick: () => act(onPost), style: { width: "100%", marginTop: 8 } }, allIn ? "Post the counts" : `Waiting on ${alive.length - counted.length}`));
}
function PlayerLinks({ state, players, onPlayer, size = 26 }) {
  return /* @__PURE__ */ React85.createElement("div", { className: "fd-player-links" }, players.map((p) => /* @__PURE__ */ React85.createElement(
    "button",
    {
      type: "button",
      key: p,
      className: "fd-player-link",
      onClick: () => onPlayer(p),
      "aria-label": `View ${disp(state, p)}'s player card`
    },
    /* @__PURE__ */ React85.createElement(Avatar, { state, p, size }),
    /* @__PURE__ */ React85.createElement("span", null, disp(state, p))
  )));
}
function EventCrewCard({ state, roles, compact = false, onPlayer }) {
  const assignments = (roles || []).filter((item) => item?.player);
  if (!assignments.length) return null;
  if (compact) {
    if (onPlayer) return /* @__PURE__ */ React85.createElement("div", { className: "fd-event-crew-compact" }, /* @__PURE__ */ React85.createElement("span", { style: label }, "Event crew"), assignments.map((item) => /* @__PURE__ */ React85.createElement("button", { type: "button", key: item.player, onClick: () => onPlayer(item.player), "aria-label": `View ${disp(state, item.player)}'s player card` }, /* @__PURE__ */ React85.createElement(Avatar, { state, p: item.player, size: 24 }), /* @__PURE__ */ React85.createElement("span", null, disp(state, item.player)), /* @__PURE__ */ React85.createElement("small", null, overflowRoleMeta(item.role).short))));
    return /* @__PURE__ */ React85.createElement("div", { style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      minWidth: 0,
      marginTop: 9,
      paddingTop: 8,
      borderTop: "1px solid var(--line)"
    } }, /* @__PURE__ */ React85.createElement("span", { style: { ...label, color: "var(--muted2)", flexShrink: 0 } }, "Event crew"), /* @__PURE__ */ React85.createElement(AvatarStack, { state, players: assignments.map((item) => item.player), size: 20, max: 3 }), /* @__PURE__ */ React85.createElement("span", { style: {
      fontFamily: SANS,
      fontWeight: 600,
      fontSize: 12,
      color: "var(--ink)",
      minWidth: 0,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      flex: 1
    } }, assignments.map((item) => disp(state, item.player)).join(", ")), /* @__PURE__ */ React85.createElement("span", { style: {
      fontFamily: SANS,
      fontWeight: 700,
      fontSize: 12,
      color: "var(--muted2)",
      flexShrink: 0
    } }, assignments.map((item) => overflowRoleMeta(item.role).short).join(" + ")));
  }
  return /* @__PURE__ */ React85.createElement("div", { style: {
    margin: "10px 0 4px",
    padding: "11px 12px",
    borderRadius: 14,
    background: "var(--paper2)",
    border: "1px solid var(--bone-line)"
  } }, /* @__PURE__ */ React85.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 } }, /* @__PURE__ */ React85.createElement("span", { style: { ...label, color: "var(--muted2)", flex: 1 } }, "Event crew")), assignments.map((item, index) => {
    const meta = overflowRoleMeta(item.role);
    if (onPlayer) return /* @__PURE__ */ React85.createElement(
      "button",
      {
        type: "button",
        key: `${item.player}-${index}`,
        className: "fd-crew-link",
        onClick: () => onPlayer(item.player),
        "aria-label": `View ${disp(state, item.player)}'s player card`
      },
      /* @__PURE__ */ React85.createElement(Avatar, { state, p: item.player, size: 30 }),
      /* @__PURE__ */ React85.createElement("span", null, /* @__PURE__ */ React85.createElement("strong", null, disp(state, item.player))),
      /* @__PURE__ */ React85.createElement("small", null, meta.label)
    );
    return /* @__PURE__ */ React85.createElement("div", { key: `${item.player}-${index}`, style: {
      display: "flex",
      alignItems: "center",
      gap: 9,
      padding: index ? "8px 0 0" : "0",
      marginTop: index ? 8 : 0,
      borderTop: index ? "1px solid var(--line)" : "none"
    } }, /* @__PURE__ */ React85.createElement(Avatar, { state, p: item.player, size: 30 }), /* @__PURE__ */ React85.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React85.createElement("div", { style: {
      fontFamily: SANS,
      fontWeight: 700,
      fontSize: 13,
      color: "var(--ink)",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    } }, disp(state, item.player))), /* @__PURE__ */ React85.createElement("span", { style: {
      fontFamily: SANS,
      fontWeight: 700,
      fontSize: 12,
      color: "var(--accent2)",
      background: "var(--accent-tint)",
      borderRadius: 7,
      padding: "4px 7px",
      flexShrink: 0
    } }, meta.label));
  }));
}
function StageGrid({ state, ev, gm, onThrough, onFinal, onPlayer, size = "md" }) {
  const st = state.stages[ev.id];
  if (!st) return null;
  const finalists = stageFinalists(st);
  const dims = {
    md: { av: 24, f: 13.5, tf: 13, pad: "7px 10px", gap: 8, col: "1fr 1fr" },
    lg: { av: 36, f: 19, tf: 17, pad: "11px 14px", gap: 14, col: `repeat(${Math.min(st.groups.length + (finalists ? 1 : 0), 4)}, 1fr)` }
  }[size];
  const GroupCard = ({ title, entrants, through, gIdx, isFinal, wide }) => /* @__PURE__ */ React85.createElement("div", { style: {
    background: "var(--paper2)",
    border: "1px solid " + (isFinal ? "var(--ghost-line)" : "var(--line)"),
    borderRadius: 14,
    overflow: "hidden",
    boxShadow: "var(--shadow-1)",
    ...wide ? { gridColumn: "1 / -1" } : {}
  } }, /* @__PURE__ */ React85.createElement("div", { style: {
    ...label,
    fontSize: size === "lg" ? 13 : 10.5,
    padding: size === "lg" ? "9px 14px 5px" : "7px 10px 3px",
    color: isFinal ? "var(--accent2)" : "var(--muted)"
  } }, title), entrants.map((key) => {
    const v = stageEntrantView(state, st, key);
    const isThrough = isFinal ? st.finalWinner === key : (through || []).includes(key);
    const decided3 = isFinal ? st.finalWinner !== null && st.finalWinner !== void 0 : (through || []).length >= st.advance;
    const dimmed = decided3 && !isThrough;
    const clickable = gm && (isFinal ? onFinal : onThrough);
    if (!gm && onPlayer) return /* @__PURE__ */ React85.createElement("div", { key: String(key), style: {
      padding: dims.pad,
      borderTop: "1px solid var(--line)",
      background: isThrough ? "var(--accent-tint)" : "transparent"
    } }, /* @__PURE__ */ React85.createElement(PlayerLinks, { state, players: v.players, onPlayer, size: dims.av }), isThrough && /* @__PURE__ */ React85.createElement("small", { style: { color: "var(--accent2)" } }, isFinal ? "Winner" : "Advanced"));
    return /* @__PURE__ */ React85.createElement(
      "button",
      {
        key: String(key),
        disabled: !clickable,
        onClick: () => isFinal ? onFinal(key) : onThrough(gIdx, key),
        style: {
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          textAlign: "left",
          padding: dims.pad,
          border: "none",
          borderTop: "1px solid var(--line)",
          cursor: clickable ? "pointer" : "default",
          background: isThrough ? "var(--accent-tint)" : "transparent",
          opacity: dimmed ? 0.38 : 1
        }
      },
      /* @__PURE__ */ React85.createElement(AvatarStack, { state, players: v.players, size: dims.av, max: 3 }),
      /* @__PURE__ */ React85.createElement("span", { style: {
        fontFamily: SANS,
        fontWeight: 700,
        fontSize: dims.f,
        flex: 1,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        color: isThrough ? "var(--accent2)" : "var(--ink)"
      } }, v.name),
      isThrough && /* @__PURE__ */ React85.createElement("span", { style: { fontFamily: SANS, fontWeight: 700, fontSize: dims.tf, color: "var(--accent2)" } }, /* @__PURE__ */ React85.createElement(Icon, { name: isFinal ? "trophy" : "check", size: "1em" }))
    );
  }));
  return /* @__PURE__ */ React85.createElement("div", { style: { display: "grid", gridTemplateColumns: dims.col, gap: dims.gap, alignItems: "start" } }, st.groups.map((g, i) => /* @__PURE__ */ React85.createElement(
    GroupCard,
    {
      key: i,
      title: `${g.name}${st.advance > 1 ? `, top ${st.advance} through` : ""}`,
      entrants: g.entrants,
      through: g.through,
      gIdx: i
    }
  )), finalists && /* @__PURE__ */ React85.createElement(
    GroupCard,
    {
      title: "The Final",
      entrants: finalists,
      isFinal: true,
      wide: size === "md" && (st.groups.length + 1) % 2 === 1
    }
  ));
}
function EventSheet({
  ev,
  state,
  me,
  gm,
  onLock,
  onWinner,
  onUndo,
  onClose,
  onBack,
  onPlayer,
  onBets,
  enterResult,
  clearRes,
  onEdit,
  onDraw,
  onClearDraw,
  onStages,
  onClearStages,
  onThrough,
  onFinal,
  onDeckToggle,
  onStart,
  onShelve,
  onRemove,
  openBracket,
  openDraft,
  onReplay,
  onPlayNext,
  announceNext,
  onAnnounceDraw,
  onSwap,
  onTakeBack
}) {
  const res = state.results[ev.id];
  const [confirmTakeBack, setConfirmTakeBack] = useState66(false);
  const contestOps = useContestOperations();
  const draw = state.draws[ev.id];
  const draftLive = state.drafts?.[ev.id];
  const br = state.brackets[ev.id];
  const st = state.stages[ev.id];
  const table = AWARDS[ev.value] ? awardTable(ev) : void 0;
  const shelvedNow = !!state.shelved[ev.id];
  const [confirmRedraw, setConfirmRedraw] = useState66(false);
  const [confirmRemove, setConfirmRemove] = useState66(false);
  const [confirmClear, setConfirmClear] = useState66(false);
  const [clearReason, setClearReason] = useState66("");
  const [confirmScrap, setConfirmScrap] = useState66(false);
  const [confirmShelve, setConfirmShelve] = useState66(false);
  const openBets = (state.wagers || []).filter((w) => w.eventId === ev.id && resolveWager(state, w, allEventsOf(state)).status === "pending");
  const [editOpen, setEditOpen] = useState66(false);
  const [howTo, setHowTo] = useState66(false);
  const [more, setMore] = useState66(false);
  const [eName, setEName] = useState66("");
  const [eDesc, setEDesc] = useState66("");
  const [eValue, setEValue] = useState66(400);
  const [eSession, setESession] = useState66(null);
  const openEdit = () => {
    setEName(ev.name);
    setEDesc(ev.desc || "");
    setEValue(ev.value ?? 400);
    setESession(SESSIONS.find((s) => s.id === ev.session) ? ev.session : null);
    setEditOpen(true);
  };
  const [suggested] = useState66(() => ev.teamCfg && !state.draws?.[ev.id] ? suggestParticipants(state, ev) : null);
  const [outs, setOuts] = useState66(() => (suggested?.roles || []).map((item) => item.player));
  const [outRoles, setOutRoles] = useState66(() => Object.fromEntries((suggested?.roles || []).map((item) => [item.player, item.role])));
  const [swapOut, setSwapOut] = useState66(""), [swapIn, setSwapIn] = useState66("");
  const [showOuts, setShowOuts] = useState66(false);
  const [stageCfgOpen, setStageCfgOpen] = useState66(!!ev.stageCfg);
  const [nGroups, setNGroups] = useState66(null);
  const [advance, setAdvance] = useState66(ev.stageCfg?.advance || 1);
  const [setupPending, setSetupPending] = useState66(false);
  const [contestPending, setContestPending] = useState66(false);
  const waitForContest = async (callback) => {
    setContestPending(true);
    try {
      return await callback();
    } finally {
      setContestPending(false);
    }
  };
  const [setupError, setSetupError] = useState66("");
  const setupBusy = useRef59(false);
  const saveSetup = async (callback) => {
    if (setupBusy.current) return;
    setupBusy.current = true;
    setSetupPending(true);
    setSetupError("");
    try {
      const result = await callback();
      if (!result?.ok) setSetupError(result?.error || "Change not saved. Try again.");
    } catch (error) {
      setSetupError(error?.message || "Change not saved. Try again.");
    } finally {
      setupBusy.current = false;
      setSetupPending(false);
    }
  };
  const lifecycle = resolveEventLifecycle(state, ev);
  const contest = resolveCurrentContest(state, ev);
  const contestActive = contest && ["betting-open", "betting-locked", "in-progress", "awaiting-result"].includes(contest.phase);
  const setupAllowed = ["setup", "draw-pending", "draw-revealed", "scheduled"].includes(lifecycle.phase);
  const present = presentPlayers(state);
  const inPlayers = present.filter((p) => !outs.includes(p));
  const participantFit = validateEventParticipants(ev, inPlayers, present);
  const overflowAssignments = outs.filter((player) => present.includes(player)).map((player) => ({
    player,
    role: OVERFLOW_ROLES.includes(outRoles[player]) ? outRoles[player] : "sit-out"
  }));
  const isPoker = !!ev.finale;
  const canHeats = ev.kind === "solo" && !ev.teamCfg && !res && !isPoker;
  const canPools = ev.teamCfg && draw && !br && draw.teams.length >= 4 && !res;
  const stageKind = canHeats ? "heats" : "pools";
  const stageEntrantCount = canHeats ? inPlayers.length : draw?.teams?.length || 0;
  const suggestedGroups = Math.min(4, Math.max(2, Math.round(stageEntrantCount / (canHeats ? 4 : 3))));
  const groupsChoice = nGroups ?? ev.stageCfg?.nGroups ?? suggestedGroups;
  const heatsFit = inPlayers.length >= groupsChoice * 2;
  const stage = eventStage(state, ev);
  const crewAward = awardPlan(ev, draw).find((row) => row.place === "crew")?.pts || null;
  const roles = draw?.roles || st?.roles || draftLive?.roles || null;
  const path = stage === "live" && me && !contest?.players?.includes(me) ? bracketPath(state, ev, me) : null;
  const contestShowsSides = contestActive && contest?.kind !== "ffa";
  const contestProps = {
    state,
    ev,
    me,
    gm,
    onPlayer,
    onBets,
    operations: contestOps,
    onLock: (reference2) => waitForContest(() => onLock(reference2)),
    onWinner: (result) => waitForContest(() => onWinner(result)),
    onUndo: (reference2) => waitForContest(() => onUndo(reference2)),
    onResult: () => waitForContest(enterResult),
    onPlayNext: onPlayNext ? (payload) => waitForContest(() => onPlayNext(payload)) : void 0
  };
  const who = /* @__PURE__ */ React85.createElement(React85.Fragment, null, draftLive && !draw && /* @__PURE__ */ React85.createElement("div", { className: "fd-es-block" }, /* @__PURE__ */ React85.createElement(DraftEntry, { state, ev, me, onOpen: () => openDraft() })), draw && !br && !st && !contestShowsSides && /* @__PURE__ */ React85.createElement(EventTeams, { state, ev, draw, me, onPlayer }), br && !contestActive && /* @__PURE__ */ React85.createElement("div", { className: "fd-es-block" }, /* @__PURE__ */ React85.createElement(CompetitionBracket, { state, ev, me, onPlayer })), st && /* @__PURE__ */ React85.createElement("div", { className: "fd-es-block" }, /* @__PURE__ */ React85.createElement(StageGrid, { state, ev, gm: false, onPlayer })), !draw && !draftLive && !st && !ev.teamCfg && !isPoker && stage === "before" && /* @__PURE__ */ React85.createElement(EventField, { state, ev, me, onPlayer }), roles && /* @__PURE__ */ React85.createElement(EventCrew, { state, roles, me, onPlayer }));
  return /* @__PURE__ */ React85.createElement(
    Sheet,
    {
      title: ev.name,
      show: true,
      onClose,
      onBack,
      wide: !!br,
      busy: setupPending || contestPending,
      headerActions: /* @__PURE__ */ React85.createElement(React85.Fragment, null, (draw || st) && onReplay && /* @__PURE__ */ React85.createElement("button", { type: "button", disabled: setupPending || contestPending, onClick: onReplay }, "Replay draw"), hasGameRules(ev) && /* @__PURE__ */ React85.createElement("button", { type: "button", disabled: setupPending || contestPending, onClick: () => setHowTo(true) }, "Rules"))
    },
    howTo && /* @__PURE__ */ React85.createElement(HowToSheet, { gameId: ev.game, variant: ev.variant, ev, onClose: () => setHowTo(false) }),
    /* @__PURE__ */ React85.createElement(ContestPanel, { ...contestProps, part: "contest" }),
    /* @__PURE__ */ React85.createElement(TeamNameCard, { state, ev, me }),
    stage === "before" && /* @__PURE__ */ React85.createElement(React85.Fragment, null, who, /* @__PURE__ */ React85.createElement(GameSteps, { game: ev, size: "card", className: "fd-es-steps" }), !GAMES[ev.game] && ev.desc && /* @__PURE__ */ React85.createElement("p", { className: "fd-es-gm-note" }, ev.desc), table && /* @__PURE__ */ React85.createElement(EventPays, { ev, crew: crewAward })),
    stage === "live" && /* @__PURE__ */ React85.createElement(React85.Fragment, null, path?.mine && /* @__PURE__ */ React85.createElement("p", { className: "fd-es-path" }, path.text), who, /* @__PURE__ */ React85.createElement(EventRiding, { state, ev })),
    stage === "after" && /* @__PURE__ */ React85.createElement(React85.Fragment, null, /* @__PURE__ */ React85.createElement(EventResult, { state, ev, me, onPlayer }), br && /* @__PURE__ */ React85.createElement("details", { className: "fd-event-info" }, /* @__PURE__ */ React85.createElement("summary", null, /* @__PURE__ */ React85.createElement("span", null, "Bracket")), /* @__PURE__ */ React85.createElement(CompetitionBracket, { state, ev, me, onPlayer })), st && /* @__PURE__ */ React85.createElement("details", { className: "fd-event-info" }, /* @__PURE__ */ React85.createElement("summary", null, /* @__PURE__ */ React85.createElement("span", null, st.kind === "heats" ? "Heats" : "Pools")), /* @__PURE__ */ React85.createElement(StageGrid, { state, ev, gm: false, onPlayer }))),
    !contestActive && onBets && stage !== "after" && /* @__PURE__ */ React85.createElement(ActionButton, { variant: "secondary", onClick: onBets, style: { width: "100%", marginBottom: 12 } }, "View bets"),
    gm && /* @__PURE__ */ React85.createElement("section", { className: "fd-es-gm", "aria-labelledby": `fd-es-gm-${ev.id}` }, /* @__PURE__ */ React85.createElement("h2", { id: `fd-es-gm-${ev.id}` }, "Commissioner"), /* @__PURE__ */ React85.createElement(ContestPanel, { ...contestProps, part: "commissioner" }), /* @__PURE__ */ React85.createElement(TeamNameDesk, { state, ev }), !state.frozen && /* @__PURE__ */ React85.createElement(React85.Fragment, null, ev.teamCfg && !draw && !draftLive && !res && (() => {
      const shape = teamFit(ev, present.length) || ev.teamCfg;
      const fit2 = shape.teams * shape.size;
      const diff = inPlayers.length - fit2;
      return /* @__PURE__ */ React85.createElement(React85.Fragment, null, /* @__PURE__ */ React85.createElement("div", { className: "fd-es-gm-fit" }, /* @__PURE__ */ React85.createElement("span", null, shapeLabel(shape)), /* @__PURE__ */ React85.createElement(
        "button",
        {
          type: "button",
          className: `fd-es-gm-count${diff !== 0 ? " is-off" : ""}`,
          "aria-expanded": showOuts,
          "aria-label": `${inPlayers.length} competitors${shape.size === 1 ? "" : ` of ${fit2}`}. Choose who plays`,
          onClick: () => setShowOuts((v) => !v)
        },
        inPlayers.length,
        shape.size === 1 ? "" : ` / ${fit2}`,
        " ",
        /* @__PURE__ */ React85.createElement(Icon, { name: showOuts ? "collapse" : "expand", size: "1em" })
      )), showOuts && /* @__PURE__ */ React85.createElement(React85.Fragment, null, /* @__PURE__ */ React85.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 5, marginBottom: 10 } }, present.map((p, i) => /* @__PURE__ */ React85.createElement(
        PlayerChip,
        {
          key: p,
          name: p,
          small: true,
          selected: !outs.includes(p),
          onClick: () => setOuts((o) => o.includes(p) ? o.filter((x) => x !== p) : [...o, p]),
          style: centeredGridCell(i, present.length, 3, 5)
        }
      ))), overflowAssignments.length > 0 && /* @__PURE__ */ React85.createElement("div", { style: {
        background: "var(--paper2)",
        border: "1px solid var(--bone-line)",
        borderRadius: 14,
        padding: "11px 12px",
        marginBottom: 10
      } }, /* @__PURE__ */ React85.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 3 } }, /* @__PURE__ */ React85.createElement("span", { style: { ...label, flex: 1 } }, "Crew"), table?.[2] > 0 && /* @__PURE__ */ React85.createElement("b", { style: { color: "var(--sun)", fontFamily: DISPLAY, fontWeight: 800, fontSize: 16 } }, "+", fmt8(table[2]))), overflowAssignments.map(({ player }, index) => {
        const role = outRoles[player] || "sit-out";
        return /* @__PURE__ */ React85.createElement("div", { key: player, style: {
          display: "flex",
          alignItems: "center",
          gap: 9,
          padding: index ? "9px 0 0" : "0",
          marginTop: index ? 9 : 0,
          borderTop: index ? "1px solid var(--line)" : "none"
        } }, /* @__PURE__ */ React85.createElement(Avatar, { state, p: player, size: 32 }), /* @__PURE__ */ React85.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React85.createElement("div", { style: {
          fontFamily: SANS,
          fontWeight: 700,
          fontSize: 12.5,
          color: "var(--ink)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap"
        } }, disp(state, player))), /* @__PURE__ */ React85.createElement(
          "select",
          {
            "aria-label": `${disp(state, player)} event crew role`,
            value: role,
            onChange: (event) => setOutRoles((current) => ({ ...current, [player]: event.target.value })),
            style: {
              width: 142,
              maxWidth: "42%",
              padding: "8px 8px",
              borderRadius: 9,
              background: "var(--paper)",
              color: "var(--ink)",
              border: "1px solid var(--line)",
              fontFamily: SANS,
              fontWeight: 700,
              fontSize: 12
            }
          },
          OVERFLOW_ROLES.map((value) => /* @__PURE__ */ React85.createElement("option", { key: value, value }, overflowRoleMeta(value).label))
        ));
      }))), !participantFit.ok && /* @__PURE__ */ React85.createElement("p", { className: "fd-es-gm-note", role: "alert", style: { color: "var(--clay-text)" } }, participantFit.error), /* @__PURE__ */ React85.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 10 } }, /* @__PURE__ */ React85.createElement(
        Btn,
        {
          disabled: !participantFit.ok || setupPending,
          onClick: () => saveSetup(() => announceNext && onAnnounceDraw ? onAnnounceDraw(inPlayers, overflowAssignments) : onDraw(inPlayers, overflowAssignments)),
          style: { flex: 1, whiteSpace: "nowrap", padding: "12px 8px" }
        },
        setupPending ? "Drawing\u2026" : announceNext ? "Announce and draw" : "Run the draw"
      ), ev.kind === "team" && /* @__PURE__ */ React85.createElement(
        Btn,
        {
          kind: "dark",
          disabled: !participantFit.ok,
          onClick: () => openDraft(inPlayers, overflowAssignments),
          style: { flex: 1, whiteSpace: "nowrap", padding: "12px 8px" }
        },
        "Captains draft"
      )));
    })(), ev.teamCfg && draw && !res && setupAllowed && (confirmRedraw ? /* @__PURE__ */ React85.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 10 } }, /* @__PURE__ */ React85.createElement(Btn, { kind: "danger", onClick: () => {
      onClearDraw();
      setConfirmRedraw(false);
    }, style: { flex: 1 } }, "Scrap the draw"), /* @__PURE__ */ React85.createElement(Btn, { kind: "ghost", onClick: () => setConfirmRedraw(false), style: { flex: 1 } }, "Keep it")) : /* @__PURE__ */ React85.createElement(Btn, { kind: "ghost", onClick: () => setConfirmRedraw(true), style: { width: "100%", marginBottom: 10 } }, "Redraw")), (draw || st?.entrantType === "solo") && !res && onSwap && (() => {
      const drawn = draw ? draw.teams.flatMap((team) => team.players) : st.groups.flatMap((group) => group.entrants);
      const bench = present.filter((player) => !drawn.includes(player));
      if (!bench.length) return null;
      const selectStyle = {
        flex: 1,
        minWidth: 120,
        minHeight: 44,
        padding: "8px",
        borderRadius: 9,
        background: "var(--paper)",
        color: "var(--ink)",
        border: "1px solid var(--line)",
        fontFamily: SANS,
        fontWeight: 700,
        fontSize: 12.5
      };
      return /* @__PURE__ */ React85.createElement("details", { className: "fd-event-info" }, /* @__PURE__ */ React85.createElement("summary", null, /* @__PURE__ */ React85.createElement("span", null, "Swap in a player")), /* @__PURE__ */ React85.createElement("div", { style: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 } }, /* @__PURE__ */ React85.createElement(
        "select",
        {
          "aria-label": "Player leaving",
          value: swapOut,
          disabled: setupPending,
          onChange: (event) => setSwapOut(event.target.value),
          style: selectStyle
        },
        /* @__PURE__ */ React85.createElement("option", { value: "" }, "Leaving"),
        drawn.map((player) => /* @__PURE__ */ React85.createElement("option", { key: player, value: player }, disp(state, player)))
      ), /* @__PURE__ */ React85.createElement(
        "select",
        {
          "aria-label": "Player coming in",
          value: swapIn,
          disabled: setupPending,
          onChange: (event) => setSwapIn(event.target.value),
          style: selectStyle
        },
        /* @__PURE__ */ React85.createElement("option", { value: "" }, "Coming in"),
        bench.map((player) => /* @__PURE__ */ React85.createElement("option", { key: player, value: player }, disp(state, player)))
      ), /* @__PURE__ */ React85.createElement(
        ActionButton,
        {
          compact: true,
          disabled: !swapOut || !swapIn || setupPending,
          onClick: () => saveSetup(async () => {
            const result = await onSwap(swapOut, swapIn);
            if (result?.ok) {
              setSwapOut("");
              setSwapIn("");
            }
            return result;
          })
        },
        "Swap in"
      )), /* @__PURE__ */ React85.createElement("p", null, "Voids bets on the player leaving."));
    })(), (canHeats || canPools) && !st && setupAllowed && (!stageCfgOpen ? /* @__PURE__ */ React85.createElement(Btn, { kind: "dark", onClick: () => setStageCfgOpen(true), style: { width: "100%", marginBottom: 10 } }, canHeats ? "Run heats" : "Set up pools") : /* @__PURE__ */ React85.createElement("div", { style: {
      background: "var(--paper2)",
      border: "1px solid var(--line)",
      borderRadius: 14,
      padding: "12px 13px",
      marginBottom: 10
    } }, canHeats && /* @__PURE__ */ React85.createElement(React85.Fragment, null, /* @__PURE__ */ React85.createElement("div", { style: { display: "flex", alignItems: "center", marginBottom: 8 } }, /* @__PURE__ */ React85.createElement("div", { style: { ...label, flex: 1 } }, "Heats"), /* @__PURE__ */ React85.createElement("button", { onClick: () => setShowOuts((v) => !v), style: {
      cursor: "pointer",
      fontFamily: SANS,
      fontWeight: 700,
      fontSize: 12.5,
      padding: "6px 11px",
      borderRadius: 10,
      background: "var(--paper)",
      border: "1px solid var(--line)",
      color: "var(--ink)"
    } }, inPlayers.length, " playing ", /* @__PURE__ */ React85.createElement(Icon, { name: showOuts ? "collapse" : "expand", size: "1em" }))), showOuts && /* @__PURE__ */ React85.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 5, marginBottom: 10 } }, present.map((p, i) => /* @__PURE__ */ React85.createElement(
      PlayerChip,
      {
        key: p,
        name: p,
        small: true,
        selected: !outs.includes(p),
        onClick: () => setOuts((o) => o.includes(p) ? o.filter((x) => x !== p) : [...o, p]),
        style: centeredGridCell(i, present.length, 3, 5)
      }
    ))), !heatsFit && /* @__PURE__ */ React85.createElement("p", { role: "alert", style: { ...pStyle, color: "var(--clay-text)", fontSize: 13 } }, "Heats need at least 2 players each")), /* @__PURE__ */ React85.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 } }, /* @__PURE__ */ React85.createElement("span", { style: { ...label } }, canHeats ? "Heats" : "Pools"), [2, 3, 4].filter((n) => n <= stageEntrantCount).map((n) => /* @__PURE__ */ React85.createElement("button", { key: n, onClick: () => setNGroups(n), style: {
      width: 44,
      height: 44,
      borderRadius: 10,
      cursor: "pointer",
      fontFamily: DISPLAY,
      fontWeight: 700,
      fontSize: 19,
      background: groupsChoice === n ? GOLD_GRAD : "var(--paper)",
      color: groupsChoice === n ? "var(--ink0)" : "var(--ink)",
      border: groupsChoice === n ? "1.5px solid var(--ink0)" : "1.5px solid var(--line)"
    } }, n)), /* @__PURE__ */ React85.createElement("span", { style: { flex: 1 } }), /* @__PURE__ */ React85.createElement("span", { style: { ...label } }, "Through"), [1, 2].map((n) => /* @__PURE__ */ React85.createElement("button", { key: n, onClick: () => setAdvance(n), style: {
      width: 44,
      height: 44,
      borderRadius: 10,
      cursor: "pointer",
      fontFamily: DISPLAY,
      fontWeight: 700,
      fontSize: 19,
      background: advance === n ? GOLD_GRAD : "var(--paper)",
      color: advance === n ? "var(--ink0)" : "var(--ink)",
      border: advance === n ? "1.5px solid var(--ink0)" : "1.5px solid var(--line)"
    } }, n))), /* @__PURE__ */ React85.createElement("div", { style: { display: "flex", gap: 8 } }, /* @__PURE__ */ React85.createElement(
      ActionButton,
      {
        disabled: setupPending || canHeats && !heatsFit,
        onClick: () => saveSetup(() => announceNext && onAnnounceDraw ? onAnnounceDraw(
          canHeats ? inPlayers : null,
          canHeats ? overflowAssignments : null,
          { nGroups: groupsChoice, advance }
        ) : onStages({
          kind: stageKind,
          nGroups: groupsChoice,
          advance,
          players: inPlayers,
          roles: overflowAssignments
        })),
        style: { flex: 1 }
      },
      setupPending ? "Drawing\u2026" : announceNext ? "Announce and draw" : canHeats ? "Draw heats" : "Draw pools"
    ), /* @__PURE__ */ React85.createElement(ActionButton, { variant: "tertiary", onClick: () => setStageCfgOpen(false) }, "Cancel")))), setupError && /* @__PURE__ */ React85.createElement("p", { className: "fd-contest-error", role: "alert" }, setupError), st && !res && setupAllowed && (confirmScrap ? /* @__PURE__ */ React85.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 10 } }, /* @__PURE__ */ React85.createElement(ActionButton, { variant: "commit", onClick: () => {
      onClearStages();
      setConfirmScrap(false);
    }, style: { flex: 1 } }, "Scrap ", st.kind === "heats" ? "heats" : "pools"), /* @__PURE__ */ React85.createElement(ActionButton, { variant: "tertiary", onClick: () => setConfirmScrap(false), style: { flex: 1 } }, "Keep")) : /* @__PURE__ */ React85.createElement(ActionButton, { variant: "destructive", onClick: () => setConfirmScrap(true), style: { width: "100%", marginBottom: 10 } }, "Scrap ", st.kind === "heats" ? "heats" : "pools")), /* @__PURE__ */ React85.createElement("div", { style: { display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" } }, res && !isPoker && /* @__PURE__ */ React85.createElement(
      ActionButton,
      {
        onClick: enterResult,
        style: { flex: 1, whiteSpace: "nowrap", padding: "12px 8px" }
      },
      "Edit result"
    ), !res && lifecycle.nextAction?.type === "open-betting" && /* @__PURE__ */ React85.createElement(
      ActionButton,
      {
        variant: "secondary",
        onClick: onDeckToggle,
        style: { flex: 1, whiteSpace: "nowrap", padding: "12px 8px" }
      },
      "Open betting"
    ), !res && !contestActive && lifecycle.nextAction?.type === "lock-betting" && /* @__PURE__ */ React85.createElement(
      ActionButton,
      {
        variant: "secondary",
        onClick: onDeckToggle,
        style: { flex: 1, whiteSpace: "nowrap", padding: "12px 8px" }
      },
      "Lock betting"
    ), !res && !contestActive && lifecycle.nextAction?.type === "start-event" && /* @__PURE__ */ React85.createElement(
      ActionButton,
      {
        onClick: onStart,
        style: { flex: 1, whiteSpace: "nowrap", padding: "12px 8px" }
      },
      "Start event"
    ), res && !confirmClear && /* @__PURE__ */ React85.createElement(ActionButton, { variant: "destructive", onClick: () => setConfirmClear(true), style: { flex: 1 } }, "Clear")), !res && onTakeBack && announcementTakeBack(state, ev).enabled && (confirmTakeBack ? /* @__PURE__ */ React85.createElement("div", { style: { marginTop: 10 } }, /* @__PURE__ */ React85.createElement("p", { style: { ...pStyle, fontSize: 13, marginBottom: 8 } }, refundText(state, announcementTakeBack(state, ev).refunds) || "No open bets."), /* @__PURE__ */ React85.createElement("div", { style: { display: "flex", gap: 8 } }, /* @__PURE__ */ React85.createElement(
      ActionButton,
      {
        variant: "commit",
        disabled: setupPending,
        style: { flex: 1 },
        onClick: () => saveSetup(async () => {
          const result = await onTakeBack();
          if (result?.ok) setConfirmTakeBack(false);
          return result;
        })
      },
      setupPending ? "Taking back\u2026" : "Take it back"
    ), /* @__PURE__ */ React85.createElement(ActionButton, { variant: "tertiary", disabled: setupPending, onClick: () => setConfirmTakeBack(false) }, "Keep it"))) : /* @__PURE__ */ React85.createElement(
      ActionButton,
      {
        variant: "destructive",
        onClick: () => setConfirmTakeBack(true),
        style: { width: "100%", marginTop: 10 }
      },
      "Take back the announcement"
    )), !res && !contestActive && lifecycle.blockers?.length > 0 && /* @__PURE__ */ React85.createElement("div", { style: { ...pStyle, marginTop: 8, color: "var(--muted)", fontSize: 13 } }, lifecycle.blockers[0]), res && confirmClear && /* @__PURE__ */ React85.createElement("div", { style: {
      marginTop: 10,
      padding: "12px 13px",
      background: "var(--paper2)",
      border: "1px solid var(--line)",
      borderRadius: 14
    } }, /* @__PURE__ */ React85.createElement("div", { style: { ...label, marginBottom: 6 } }, "Reason for clearing"), /* @__PURE__ */ React85.createElement(
      "input",
      {
        value: clearReason,
        onChange: (event) => setClearReason(event.target.value),
        maxLength: 100,
        "aria-label": "Reason for clearing",
        style: {
          width: "100%",
          background: "var(--paper)",
          border: "1px solid var(--line)",
          borderRadius: 10,
          padding: "11px 12px",
          color: "var(--ink)",
          fontFamily: SANS,
          fontWeight: 600,
          fontSize: 14,
          marginBottom: 9,
          outline: "none"
        }
      }
    ), /* @__PURE__ */ React85.createElement("div", { style: { display: "flex", gap: 8 } }, /* @__PURE__ */ React85.createElement(
      ActionButton,
      {
        variant: "commit",
        disabled: !clearReason.trim(),
        onClick: () => clearRes(clearReason),
        style: { flex: 1 }
      },
      "Clear official result"
    ), /* @__PURE__ */ React85.createElement(
      ActionButton,
      {
        variant: "tertiary",
        onClick: () => {
          setConfirmClear(false);
          setClearReason("");
        },
        style: { flex: 1 }
      },
      "Keep it"
    ))), editOpen ? /* @__PURE__ */ React85.createElement("div", { style: {
      background: "var(--paper2)",
      border: "1px solid var(--line)",
      borderRadius: 14,
      padding: "12px 13px",
      marginTop: 8
    } }, /* @__PURE__ */ React85.createElement("div", { style: { ...label, marginBottom: 6 } }, "Name"), /* @__PURE__ */ React85.createElement(
      "input",
      {
        value: eName,
        onChange: (e) => setEName(e.target.value),
        maxLength: 28,
        "aria-label": "Event name",
        style: {
          width: "100%",
          background: "var(--paper)",
          border: "1px solid var(--line)",
          borderRadius: 10,
          padding: "11px 12px",
          color: "var(--ink)",
          fontFamily: SANS,
          fontWeight: 600,
          fontSize: 16,
          marginBottom: 12,
          outline: "none"
        }
      }
    ), /* @__PURE__ */ React85.createElement("div", { style: { ...label, marginBottom: 6 } }, "How to play"), /* @__PURE__ */ React85.createElement(
      "textarea",
      {
        value: eDesc,
        onChange: (e) => setEDesc(e.target.value),
        maxLength: 300,
        rows: 3,
        "aria-label": "Event description",
        style: {
          width: "100%",
          background: "var(--paper)",
          border: "1px solid var(--line)",
          borderRadius: 10,
          padding: "11px 12px",
          color: "var(--ink)",
          fontFamily: SANS,
          fontSize: 14,
          lineHeight: 1.5,
          marginBottom: 12,
          outline: "none",
          resize: "vertical"
        }
      }
    ), /* @__PURE__ */ React85.createElement("div", { style: { ...label, marginBottom: 6 } }, "Worth"), /* @__PURE__ */ React85.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 12 } }, [400, 800, 1200, 1600].map((v) => /* @__PURE__ */ React85.createElement("button", { key: v, disabled: !!res, onClick: () => setEValue(v), style: {
      flex: 1,
      height: 44,
      borderRadius: 10,
      cursor: res ? "default" : "pointer",
      fontFamily: DISPLAY,
      fontWeight: 700,
      fontSize: 16,
      background: eValue === v ? GOLD_GRAD : "var(--paper)",
      color: eValue === v ? "var(--ink0)" : "var(--ink)",
      border: eValue === v ? "1.5px solid var(--ink0)" : "1.5px solid var(--line)"
    } }, v))), /* @__PURE__ */ React85.createElement("div", { style: { ...label, marginBottom: 6 } }, "Session"), /* @__PURE__ */ React85.createElement("div", { style: { display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 } }, [...SESSIONS.map((s) => [s.id, s.label]), [null, "Anytime"]].map(([id, lb]) => /* @__PURE__ */ React85.createElement("button", { key: String(id), onClick: () => setESession(id), style: {
      fontFamily: SANS,
      fontWeight: 600,
      fontSize: 12.5,
      padding: "10px 12px",
      borderRadius: 10,
      cursor: "pointer",
      background: eSession === id ? GOLD_GRAD : "var(--paper)",
      color: eSession === id ? "var(--ink0)" : "var(--ink)",
      border: eSession === id ? "1.5px solid var(--ink0)" : "1.5px solid var(--line)"
    } }, lb))), /* @__PURE__ */ React85.createElement("div", { style: { display: "flex", gap: 8 } }, /* @__PURE__ */ React85.createElement(
      Btn,
      {
        disabled: !eName.trim(),
        onClick: () => {
          onEdit({ name: eName, desc: eDesc, ...res ? {} : { value: eValue }, session: eSession });
          setEditOpen(false);
        },
        style: { flex: 1 }
      },
      "Save"
    ), /* @__PURE__ */ React85.createElement(Btn, { kind: "ghost", onClick: () => setEditOpen(false) }, "Cancel"))) : !more ? /* @__PURE__ */ React85.createElement("button", { onClick: () => setMore(true), style: {
      background: "none",
      border: "none",
      cursor: "pointer",
      fontFamily: SANS,
      fontWeight: 600,
      fontSize: 12.5,
      color: "var(--accent2)",
      minHeight: 44,
      padding: "8px 0",
      display: "block",
      marginLeft: "auto"
    } }, "More ", /* @__PURE__ */ React85.createElement(Icon, { name: "expand", size: "1em" })) : /* @__PURE__ */ React85.createElement("div", { style: { display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" } }, /* @__PURE__ */ React85.createElement(Btn, { kind: "ghost", onClick: openEdit, style: { flex: 1 } }, "Edit details"), !res && !confirmShelve && /* @__PURE__ */ React85.createElement(Btn, { kind: "ghost", onClick: () => shelvedNow || !openBets.length ? onShelve(!shelvedNow) : setConfirmShelve(true), style: { flex: 1 } }, shelvedNow ? "Restore" : "Shelve"), !res && confirmShelve && /* @__PURE__ */ React85.createElement(React85.Fragment, null, /* @__PURE__ */ React85.createElement(Btn, { kind: "danger", onClick: () => {
      setConfirmShelve(false);
      onShelve(true, true);
    }, style: { flex: 1 } }, "Shelve. Returns ", openBets.length, " bet", openBets.length === 1 ? "" : "s", ", ", fmt8(openBets.reduce((sum, w) => sum + w.stake, 0)), " chips"), /* @__PURE__ */ React85.createElement(Btn, { kind: "ghost", onClick: () => setConfirmShelve(false) }, "Keep")), ev.custom && !confirmRemove && /* @__PURE__ */ React85.createElement(Btn, { kind: "danger", onClick: () => setConfirmRemove(true) }, "Remove"), ev.custom && confirmRemove && /* @__PURE__ */ React85.createElement(Btn, { kind: "danger", onClick: onRemove }, "Confirm remove"))))
  );
}
function BracketSheet({ ev, state, me, gm, onClose, onBack, onPlayer, onLock, onWinner, onUndo, onPlayNext, onBets, onPostResult }) {
  const [pending, setPending] = useState66(false);
  const waitFor = async (callback) => {
    setPending(true);
    try {
      return await callback();
    } finally {
      setPending(false);
    }
  };
  const br = state.brackets[ev.id], draw = state.draws[ev.id];
  if (!br || !draw) return null;
  const contest = resolveCurrentContest(state, ev);
  const active = contest && ["betting-open", "betting-locked", "in-progress", "awaiting-result"].includes(contest.phase);
  return /* @__PURE__ */ React85.createElement(Sheet, { title: ev.name, subtitle: "Bracket", show: true, onClose, onBack, busy: pending, wide: true }, /* @__PURE__ */ React85.createElement(
    ContestPanel,
    {
      state,
      ev,
      me,
      gm,
      onPlayer,
      onBets,
      onLock: (reference2) => waitFor(() => onLock(reference2)),
      onWinner: (result) => waitFor(() => onWinner(result)),
      onUndo: (reference2) => waitFor(() => onUndo(reference2)),
      onResult: () => waitFor(onPostResult),
      onPlayNext: onPlayNext ? (payload) => waitFor(() => onPlayNext(payload)) : void 0
    }
  ), !active && /* @__PURE__ */ React85.createElement(CompetitionBracket, { state, ev, me, onPlayer }), /* @__PURE__ */ React85.createElement(EventCrewCard, { state, roles: draw.roles, compact: true, onPlayer }));
}
function ResultSheet({ ev, state, onClose, save }) {
  const existing = state.results[ev.id];
  const table = AWARDS[ev.value] || ev.pays ? awardTable(ev) : [400, 0, 0];
  const slotIdxs = table.map((v, i) => v > 0 ? i : null).filter((i) => i !== null);
  const bracket = state.brackets[ev.id], stage = state.stages[ev.id];
  const sequenced = !!state.eventOps?.[ev.id]?.contest;
  const winnerKnown = sequenced && (bracket && bracketChampion(bracket) !== null || stage && stage.finalWinner !== null && stage.finalWinner !== void 0);
  const editableSlots = slotIdxs.filter((index) => !winnerKnown || index !== 0);
  const paysEach = (index) => resultAwards(state, ev, { slots }).find((award) => award.place === index)?.pts ?? table[index];
  const initial = useMemo15(() => {
    if (existing?.slots) return existing.slots.map((s) => [...s || []]);
    const br = state.brackets[ev.id], draw2 = state.draws[ev.id], st = state.stages[ev.id];
    if (br && draw2) {
      const champ = bracketChampion(br);
      if (champ !== null) {
        const final = br.rounds[br.rounds.length - 1][0];
        const a = resolveSlot(br, final.a), b = resolveSlot(br, final.b);
        const runner = champ === a ? b : a;
        const semis = br.rounds[br.rounds.length - 2] || [];
        const losers = semis.map((match) => [resolveSlot(br, match.a), resolveSlot(br, match.b)].find((side) => side !== null && side !== match.winner)).filter((side) => side !== void 0 && draw2.teams[side]);
        return [
          [...draw2.teams[champ].players],
          table[1] > 0 && runner !== null ? [...draw2.teams[runner].players] : [],
          table[2] > 0 ? losers.flatMap((side) => draw2.teams[side].players) : []
        ];
      }
    }
    if (st && st.finalWinner !== null && st.finalWinner !== void 0) {
      const v = stageEntrantView(state, st, st.finalWinner);
      const finalists = stageFinalists(st) || [];
      const runner = finalists.length === 2 ? finalists.find((key) => key !== st.finalWinner) : void 0;
      return [
        [...v.players],
        table[1] > 0 && runner !== void 0 ? [...stageEntrantView(state, st, runner).players] : [],
        []
      ];
    }
    return [[], [], []];
  }, []);
  const [slots, setSlots] = useState66(initial);
  const [active, setActive] = useState66(editableSlots[0] ?? 0);
  const [byPlayer, setByPlayer] = useState66(false);
  const [confirmCorrection, setConfirmCorrection] = useState66(false);
  const [correctionReason, setCorrectionReason] = useState66("");
  const [pending, setPending] = useState66(false), [error, setError] = useState66("");
  const [emptyCheck, setEmptyCheck] = useState66(null);
  const saving = useRef59(false);
  const post = async (options, allowEmpty = false) => {
    if (saving.current) return;
    if (!allowEmpty && emptyPaid.length) {
      setEmptyCheck(options || {});
      return;
    }
    setEmptyCheck(null);
    saving.current = true;
    setPending(true);
    setError("");
    try {
      const result = await save(slots, options);
      if (result?.ok !== true) setError(result?.error || "Result not saved. Try again.");
    } catch (failure) {
      setError(failure?.message || "Result not saved. Try again.");
    } finally {
      saving.current = false;
      setPending(false);
    }
  };
  const draw = state.draws[ev.id];
  const twoTeams = !winnerKnown && !bracket && !stage && ev.kind !== "solo" && draw?.teams?.length === 2;
  const pickWinner = (team) => setSlots((prev) => {
    if (saving.current) return prev;
    if (team.players.every((p) => prev[0].includes(p))) return [[], [], []];
    const other = draw.teams.find((item) => item !== team);
    return [[...team.players], table[1] > 0 && other ? [...other.players] : [], []];
  });
  const sidesInPlay = draw?.teams?.length && ev.kind !== "solo" ? draw.teams.length : ROSTER.length;
  const emptyPaid = slotIdxs.filter((index) => index > 0 && index < sidesInPlay && !slots[index].length);
  const teamMode = !!draw?.teams?.length && ev.kind !== "solo" && (!byPlayer || sequenced && active === 0);
  const unchanged = !!existing && JSON.stringify(existing.slots || []) === JSON.stringify(slots);
  const taken = (p) => slots.findIndex((s) => s.includes(p));
  const toggle = (p) => setSlots((prev) => {
    if (saving.current || winnerKnown && prev[0].includes(p)) return prev;
    const nx = prev.map((s) => [...s]);
    const w = nx.findIndex((s) => s.includes(p));
    if (sequenced && active === 0) return nx.map((slot, index) => index === 0 ? w === 0 ? [] : [p] : slot.filter((player) => player !== p));
    if (w === active) nx[active] = nx[active].filter((x) => x !== p);
    else {
      if (w >= 0) nx[w] = nx[w].filter((x) => x !== p);
      nx[active].push(p);
    }
    return nx;
  });
  const teamSlot = (t) => slots.findIndex((s) => t.players.length && t.players.every((p) => s.includes(p)));
  const toggleTeam = (t) => setSlots((prev) => {
    if (saving.current || winnerKnown && t.players.some((p) => prev[0].includes(p))) return prev;
    const was = prev.findIndex((s) => t.players.length && t.players.every((p) => s.includes(p)));
    const nx = prev.map((s) => s.filter((p) => !t.players.includes(p)));
    if (sequenced && active === 0) {
      nx[0] = was === 0 ? [] : [...t.players];
      return nx;
    }
    if (was !== active) nx[active] = [...nx[active], ...t.players];
    return nx;
  });
  return /* @__PURE__ */ React85.createElement(Sheet, { title: ev.name, subtitle: "Official result", onClose, busy: pending }, winnerKnown && /* @__PURE__ */ React85.createElement("div", { className: "fd-result-winner" }, /* @__PURE__ */ React85.createElement("small", null, "Winner"), /* @__PURE__ */ React85.createElement("strong", null, slots[0].map((player) => disp(state, player)).join(" & ")), /* @__PURE__ */ React85.createElement("span", null, "+", fmt8(table[0]), slots[0].length > 1 ? " each" : " chips")), winnerKnown && /* @__PURE__ */ React85.createElement("p", { style: { ...pStyle, fontSize: 12.5, color: "var(--muted2)" } }, existing ? "To change the winner, clear the result and correct the final." : "To change the winner, correct the final from the event sheet."), twoTeams && /* @__PURE__ */ React85.createElement("fieldset", { disabled: pending, style: { border: 0, padding: 0, margin: 0, minWidth: 0 } }, /* @__PURE__ */ React85.createElement("div", { style: { ...label, marginBottom: 8 } }, "Winner"), /* @__PURE__ */ React85.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 } }, draw.teams.map((team, i) => {
    const won = team.players.length > 0 && team.players.every((p) => slots[0].includes(p));
    return /* @__PURE__ */ React85.createElement(
      "button",
      {
        key: i,
        type: "button",
        onClick: () => pickWinner(team),
        "aria-pressed": won,
        style: {
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 8,
          minHeight: 88,
          padding: "12px",
          borderRadius: 14,
          cursor: "pointer",
          textAlign: "left",
          background: won ? GOLD_GRAD : "var(--paper)",
          border: won ? "1.5px solid var(--ink0)" : "1.5px solid var(--line)"
        }
      },
      /* @__PURE__ */ React85.createElement(AvatarStack, { state, players: team.players, size: 26, max: 5 }),
      /* @__PURE__ */ React85.createElement("span", { style: {
        fontFamily: SANS,
        fontWeight: 700,
        fontSize: 14,
        color: won ? "var(--ink0)" : "var(--ink)",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        maxWidth: "100%"
      } }, teamLabel(state, team))
    );
  })), slots[0].length > 0 && /* @__PURE__ */ React85.createElement("p", { style: { ...pStyle, fontSize: 12.5, color: "var(--muted2)", margin: "0 0 12px" } }, "+", fmt8(paysEach(0)), " each to the winners", table[1] > 0 ? `, +${fmt8(paysEach(1))} each to the other team` : "", table[2] > 0 && draw.roles?.length ? `, +${fmt8(table[2])} each to the crew` : "", ".")), !twoTeams && !!editableSlots.length && /* @__PURE__ */ React85.createElement("fieldset", { disabled: pending, style: { border: 0, padding: 0, margin: 0, minWidth: 0 } }, /* @__PURE__ */ React85.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 14 } }, editableSlots.map((i) => /* @__PURE__ */ React85.createElement("button", { key: i, onClick: () => setActive(i), style: {
    flex: 1,
    padding: "10px 6px",
    cursor: "pointer",
    borderRadius: 14,
    border: "1px solid " + (active === i ? "var(--accent)" : "var(--line)"),
    background: active === i ? "var(--ink-tint)" : "var(--paper2)"
  } }, /* @__PURE__ */ React85.createElement("div", { style: { fontFamily: SANS, fontWeight: 700, fontSize: 14, color: SLOT_META[i].color } }, ev.kind === "solo" ? SLOT_META[i].label : SLOT_META[i].team), /* @__PURE__ */ React85.createElement("div", { style: { fontFamily: SANS, fontSize: 12, color: "var(--muted)" } }, "+", fmt8(paysEach(i)), " each, ", slots[i].length, " in")))), table[2] > 0 && !!draw?.roles?.length && /* @__PURE__ */ React85.createElement("p", { style: { ...pStyle, fontSize: 12.5, color: "var(--muted)", margin: "-6px 0 12px" } }, "Event crew +", fmt8(table[2]), " each: ", draw.roles.map((role) => disp(state, role.player)).join(", ")), teamMode ? /* @__PURE__ */ React85.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 } }, draw.teams.filter((t) => !winnerKnown || !t.players.some((p) => slots[0].includes(p))).map((t, i) => {
    const w = teamSlot(t);
    return /* @__PURE__ */ React85.createElement("button", { key: i, onClick: () => toggleTeam(t), style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "10px 11px",
      borderRadius: 14,
      cursor: "pointer",
      textAlign: "left",
      background: w === active ? GOLD_GRAD : "var(--paper)",
      border: w === active ? "1.5px solid var(--ink0)" : "1.5px solid var(--line)",
      ...draw.teams.length % 2 === 1 && i === draw.teams.length - 1 ? { gridColumn: "1 / -1" } : {}
    } }, /* @__PURE__ */ React85.createElement(AvatarStack, { state, players: t.players, size: 22, max: 3 }), /* @__PURE__ */ React85.createElement("span", { style: {
      flex: 1,
      fontFamily: SANS,
      fontWeight: 600,
      fontSize: 12.5,
      minWidth: 0,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      color: w === active ? "var(--ink0)" : "var(--ink)"
    } }, teamLabel(state, t)), w >= 0 && w !== active && /* @__PURE__ */ React85.createElement("span", { style: {
      fontFamily: SANS,
      fontWeight: 700,
      fontSize: 12,
      color: SLOT_META[w].color,
      flexShrink: 0
    } }, SLOT_META[w].label));
  })) : /* @__PURE__ */ React85.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8, marginBottom: 10 } }, ROSTER.filter((p) => !winnerKnown || !slots[0].includes(p)).map((p, i) => {
    const w = taken(p);
    return /* @__PURE__ */ React85.createElement(
      PlayerChip,
      {
        key: p,
        name: w >= 0 && w !== active ? `${p} (${SLOT_META[w].label})` : p,
        selected: w === active,
        onClick: () => toggle(p),
        small: true,
        style: centeredGridCell(i, ROSTER.length)
      }
    );
  })), !!draw?.teams?.length && ev.kind !== "solo" && !(sequenced && active === 0) && /* @__PURE__ */ React85.createElement("button", { onClick: () => setByPlayer((v) => !v), style: {
    background: "none",
    border: "none",
    cursor: "pointer",
    fontFamily: SANS,
    fontWeight: 600,
    fontSize: 12.5,
    color: "var(--accent2)",
    minHeight: 44,
    padding: "6px 0",
    display: "block"
  } }, byPlayer ? "Back to teams" : "Pick by player")), error && /* @__PURE__ */ React85.createElement("p", { role: "alert", style: { color: "var(--clay-text)", fontSize: 13 } }, error), emptyCheck && emptyPaid.length > 0 && /* @__PURE__ */ React85.createElement("div", { role: "alert", style: {
    marginBottom: 10,
    padding: "12px 13px",
    background: "var(--paper2)",
    border: "1px solid var(--line)",
    borderRadius: 14
  } }, emptyPaid.map((i) => /* @__PURE__ */ React85.createElement("p", { key: i, style: { ...pStyle, margin: "0 0 6px" } }, SLOT_META[i].label, " place pays ", fmt8(paysEach(i)), ". Nobody selected.")), /* @__PURE__ */ React85.createElement("div", { style: { display: "flex", gap: 8, marginTop: 8 } }, /* @__PURE__ */ React85.createElement(
    ActionButton,
    {
      variant: "commit",
      disabled: pending,
      onClick: () => post(emptyCheck, true),
      style: { flex: 1 }
    },
    "Leave empty"
  ), /* @__PURE__ */ React85.createElement(
    ActionButton,
    {
      variant: "tertiary",
      disabled: pending,
      onClick: () => {
        setActive(emptyPaid[0]);
        setEmptyCheck(null);
      },
      style: { flex: 1 }
    },
    "Choose"
  ))), !existing ? /* @__PURE__ */ React85.createElement(
    ActionButton,
    {
      disabled: slots[0].length === 0 || pending,
      onClick: () => post(),
      style: { width: "100%", fontSize: 16, padding: "14px", marginTop: 4 }
    },
    "Post official result"
  ) : !confirmCorrection ? /* @__PURE__ */ React85.createElement(
    ActionButton,
    {
      disabled: slots[0].length === 0 || unchanged || pending,
      onClick: () => setConfirmCorrection(true),
      style: { width: "100%", fontSize: 16, padding: "14px", marginTop: 4 }
    },
    unchanged ? "Official result" : "Review result correction"
  ) : /* @__PURE__ */ React85.createElement("div", { style: {
    marginTop: 4,
    padding: "12px 13px",
    background: "var(--paper2)",
    border: "1px solid var(--line)",
    borderRadius: 14
  } }, /* @__PURE__ */ React85.createElement("div", { style: { ...label, marginBottom: 6 } }, "Reason for the correction"), /* @__PURE__ */ React85.createElement(
    "input",
    {
      value: correctionReason,
      disabled: pending,
      onChange: (event) => setCorrectionReason(event.target.value),
      maxLength: 100,
      "aria-label": "Reason for the correction",
      style: {
        width: "100%",
        background: "var(--paper)",
        border: "1px solid var(--line)",
        borderRadius: 10,
        padding: "11px 12px",
        color: "var(--ink)",
        fontFamily: SANS,
        fontWeight: 600,
        fontSize: 14,
        marginBottom: 9,
        outline: "none"
      }
    }
  ), /* @__PURE__ */ React85.createElement("div", { style: { display: "flex", gap: 8 } }, /* @__PURE__ */ React85.createElement(
    ActionButton,
    {
      variant: "commit",
      disabled: !correctionReason.trim() || pending,
      onClick: () => post({
        confirmOverwrite: true,
        correctionReason
      }),
      style: { flex: 1 }
    },
    "Replace official result"
  ), /* @__PURE__ */ React85.createElement(ActionButton, { variant: "tertiary", disabled: pending, onClick: () => {
    setConfirmCorrection(false);
    setCorrectionReason("");
  }, style: { flex: 1 } }, "Keep current"))));
}
function Reveal({ state, reveal, me, onClose, onBets, onPlayer }) {
  return /* @__PURE__ */ React85.createElement(DrawAnnouncement, { state, reveal, me, synced: true, onClose, onBets, onPlayer });
}

// <stdin>
init_PlayerIdentityContext();
init_Wagers();
init_GameMark();
init_controls();
export {
  ActionButton,
  BracketSheet,
  ChipCounter,
  DraftEntry,
  DraftSheet,
  EventIntro,
  EventSheet,
  GameMark,
  PlayerIdentityProvider,
  PlayerSheet,
  PokerResultSheet,
  ResultSheet,
  Reveal,
  Sheet,
  Shell,
  Wagers
};
