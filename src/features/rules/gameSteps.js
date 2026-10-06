import { GAMES } from "../../../shared/core.js";
import { RULES_WORDS, RULES_TITLES, ruleWord } from "./rulesWords.js";

/* How to play, drawn. Each set is a game (a GAMES id, or
   "basketball:<variant>") or one of the weekend's own rule sets: 3 or 4
   steps, each a drawing (RulePictures.jsx, keyed like its words) with a 2 to
   4 word label (rulesWords.js), then notes: a variant, house rule or tie
   that changes play, as a glyph and a few words. `win` is the step that
   decides it (drawn lit). The facts behind every set are GAMES' how-to in
   shared/core.js; this file only says how they are drawn.

   Pure: read by GameSteps.jsx, the review page and the tests. */
export const STEP_SETS = Object.freeze({
  putting:{ steps:3, win:3, notes:[["tie", "tie"]] },
  die:{ steps:4, win:4, notes:[["score", "tally"], ["call", "height"], ["plunk", "plunk"]] },
  where:{ steps:4, win:4, notes:[["clock", "timer"], ["max", "max"], ["tie", "tie"]] },
  "basketball:1v1":{ steps:4, win:4, notes:[["fouls", "whistle"]] },
  "basketball:5v5":{ steps:4, win:4, notes:[["half", "half"], ["fouls", "whistle"], ["contact", "contact"]] },
  pickleball:{ steps:4, win:4, notes:[["serve", "serve"]] },
  volleyball:{ steps:4, win:4, notes:[["rotate", "rotate"], ["sets", "sets"], ["cap", "cap"]] },
  "8ball":{ steps:4, win:4, notes:[["rack", "rack"]] },
  pong:{ steps:4, win:4, notes:[["swat", "swat"], ["rerack", "rack"], ["redemption", "redemption"]] },
  trivia:{ steps:3, win:3, notes:[["groom", "ring"], ["family", "home"], ["group", "group"], ["photo", "photo"], ["sports", "sports"]] },
  ragecage:{ steps:4, win:4, notes:[["anywhere", "anywhere"], ["second", "second"], ["third", "third"], ["center", "center"]] },
  beerio:{ steps:4, win:4, notes:[["sip", "nosip"], ["wait", "wait"]] },
  poker:{ steps:4, win:4, notes:[["holdem", "cards"], ["count", "timer"], ["busts", "order"]] },
  spikeball:{ steps:4, win:4, notes:[["move", "move"], ["cap", "cap"]] },
  pingpong:{ steps:3, win:3, notes:[["rally", "serve"]] },
  foosball:{ steps:3, win:3, notes:[["serve", "serve"], ["dead", "redemption"]] },

  /* the weekend's rules (Weekend > Rules), drawn the same way */
  fieldday:{ steps:4, win:4, notes:[["teams", "shuffle"]] },
  betting:{ steps:4, notes:[["floor", "floor"], ["own", "own"], ["side", "side"], ["lock", "lock"], ["fix", "fix"], ["void", "void"]] },
  duels:{ steps:4, win:4, notes:[["early", "early"], ["even", "tie"], ["fouls", "tie"], ["daily", "daily"], ["pair", "pair"], ["lapse", "lapse"], ["finale", "cards"]] },
  draws:{ steps:3, notes:[["private", "private"]] },
  comebacks:{ steps:2, notes:[["gap", "floor"]] },
  safety:{ steps:0, notes:[["optional", "drink"], ["na", "na"], ["forced", "forced"], ["water", "water"], ["own", "own"],
    ["contact", "contact"], ["house", "home"], ["camera", "camera"], ["stop", "stop"]] },
  payouts:{ steps:0, notes:[["team", "group"], ["semis", "semis"], ["crew", "crew"], ["ties", "tie"], ["crown", "putt"]] },
});

/* the weekend's rule sets, in the order the Rules sheet reads them */
export const RULE_SET_ORDER = Object.freeze(["fieldday", "betting", "comebacks", "duels", "draws", "safety"]);

/* a game id (or an event carrying `game` and `variant`) to its set id */
export function stepSetId(game, variant) {
  const id = game && typeof game === "object" ? game.game : game;
  const v = variant ?? (game && typeof game === "object" ? game.variant : undefined);
  if (!id) return null;
  if (v && STEP_SETS[`${id}:${v}`]) return `${id}:${v}`;
  if (STEP_SETS[id]) return id;
  /* a game with variants and none named: its first */
  const first = GAMES[id]?.variants?.[0]?.id;
  if (first && STEP_SETS[`${id}:${first}`]) return `${id}:${first}`;
  return null;
}

export const hasGameSteps = (game, variant) => !!stepSetId(game, variant);

/* the drawn set: { id, title, steps:[{ key, words, win }], notes:[{ key, glyph, words }] } */
export function gameStepsModel(game, variant) {
  const id = stepSetId(game, variant);
  if (!id) return null;
  const set = STEP_SETS[id];
  const [base, v] = id.split(":");
  const title = RULES_TITLES[id] || GAMES[base]?.name || id;
  return {
    id, title, variant:v || null,
    steps:Array.from({ length:set.steps }, (_, index) => {
      const key = `${id}.${index + 1}`;
      return { key, words:ruleWord(key), win:set.win === index + 1 };
    }),
    notes:set.notes.map(([note, glyph]) => {
      const key = `${id}.${note}`;
      return { key, glyph, words:ruleWord(key) };
    }),
  };
}

/* every key a set uses, for the review page and the tests */
export const allStepKeys = () => Object.keys(STEP_SETS).flatMap(id => {
  const model = gameStepsModel(id);
  return [...model.steps, ...model.notes].map(item => item.key);
});
export const unusedWordKeys = () => {
  const used = new Set(allStepKeys());
  return Object.keys(RULES_WORDS).filter(key => !used.has(key));
};
