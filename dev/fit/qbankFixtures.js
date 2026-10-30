/* The Question bank desk's fixture bank (docs/TRIVIA-QBANK.md): 45 made-up
   records over the seven categories and every media kind, a recommended
   board, and the desk's states built through the bank's real writes
   (worker/qbank.js), for the rehearsal page (/dev/qbank-preview.html), the
   fit audit's desk views and the desk's tests. Nothing here is a real
   question or a real fact: the real bank is the content builders'
   worker/triviaQBank/, and these records reach the Worker only through
   `useDeskBank()` (worker/triviaQBank/index.js useQBank), a rehearsal's
   swap. Media: scripts/qbank-desk-media.mjs (public/tq/, listed in
   qbankMedia.json). */
import { QBANK_CATEGORIES, QBANK_SLOTS, cleanQBankRecord } from "../../shared/triviaQBank.js";
import { applyAction } from "../../worker/actions.js";
import { qbankDesk } from "../../worker/qbank.js";
import { useQBank } from "../../worker/triviaQBank/index.js";
import MEDIA from "./qbankMedia.json" with { type:"json" };

const media = (key, extra = {}) => {
  const { kind, src, w, h, mime } = MEDIA[key];
  return { kind, src, ...(w ? { w, h } : {}), mime, ...extra };
};
const audio = (n, start, duration) => media(`tone-${n}`, { start, duration });
const video = (n, start, duration) => media(`clip-${n}`, { start, duration });
const opts = (...texts) => texts.map((text, i) => ({ id:"abcd"[i], text }));
const SOURCE = [{ url:"https://example.com/fixture", note:"Fixture source", checkedAt:"2026-10-29" }];
const WEB = { by:"web", at:"2026-10-29", cutoff:"2026-10-29" };
const PROVIDED = { by:"provided", at:"2026-10-29" };
const SUGGESTED = { by:"suggested", at:"2026-10-29" };

const rec = (id, category, tier, fields) => ({ id, category, tier, format:fields.media ? fields.media.kind : "choice",
  sources:SOURCE, verified:WEB, status:"ready", tags:{ topics:[], likely:[], possible:[], reach:"broad" }, ...fields });

const NBA_TEAMS = ["Phoenix Suns", "Houston Rockets", "Memphis Grizzlies", "Denver Nuggets", "Dallas Mavericks", "Utah Jazz", "Golden State Warriors", "Miami Heat"];
const nba = (n, tier, name, answer, decoys, extra = {}) => rec(`nba-fixture-${n}`, "nba", tier, {
  prompt:"Who does he play for?", subject:name, options:opts(answer, ...decoys), answer:"a",
  reveal:`${answer}. Fixture roster as of the cutoff.`, media:media(`nba-${n}`), revealMedia:media(`nba-${n}-team`),
  tags:{ topics:["league"], likely:tier < 4 ? [] : ["Evan", "Eyob", "Adi"], possible:tier < 4 ? [] : ["Sahil"], reach:tier < 3 ? "broad" : "shared" }, ...extra });
const t = (...picks) => picks.map(i => NBA_TEAMS[i]);

export const QBANK_FIXTURE_RECORDS = Object.freeze([
  /* Who He Play For? */
  nba(1, 1, "Avery Lane", NBA_TEAMS[0], t(1, 2, 3)),
  nba(2, 2, "Marcus Hollow", NBA_TEAMS[1], t(0, 4, 5)),
  nba(3, 3, "Theo Brightwater", NBA_TEAMS[2], t(6, 7, 0)),
  nba(4, 3, "Jalen Okonkwo-Pierce", NBA_TEAMS[3], t(4, 1, 6), { status:"confirm", verified:SUGGESTED, notes:"Traded at the deadline? Check the date." }),
  nba(5, 3, "Rafael Dunmore", NBA_TEAMS[4], t(0, 5, 3)),
  nba(6, 4, "Quentin Sato", NBA_TEAMS[5], t(2, 3, 7)),
  nba(7, 5, "Ellis Marchetti", NBA_TEAMS[6], t(7, 1, 4)),
  nba(8, 5, "Dorian Vale", NBA_TEAMS[7], t(5, 6, 2), { status:"asset", revealMedia:undefined }),
  /* Kim & Winnie */
  rec("kim-fixture-1", "kim", 1, { prompt:"What color is the fixture dog's coat?", options:opts("Apricot", "Black", "Silver", "Chocolate"), answer:"a",
    reveal:"Apricot. Fixture fact.", verified:PROVIDED, personal:"provided", tags:{ topics:["dog"], likely:["Evan"], possible:[], reach:"broad" } }),
  rec("kim-fixture-2", "kim", 2, { prompt:"Which class did the fixture couple take together?", options:opts("Dance lessons", "Pottery", "Cooking", "Climbing"), answer:"a",
    reveal:"Dance lessons. Fixture fact.", verified:PROVIDED, personal:"provided" }),
  rec("kim-fixture-3", "kim", 3, { prompt:"What song did the fixture couple pick for their first dance?", options:opts("Fixture Song A", "Fixture Song B", "Fixture Song C", "Fixture Song D"), answer:"b",
    reveal:"Fixture Song B. Flagged as a possible wedding surprise.", verified:PROVIDED, personal:"provided", surprise:true }),
  rec("kim-fixture-4", "kim", 4, { prompt:"How did the fixture couple first meet?", options:opts("At a party", "At school", "Through a friend", "Online"), answer:"c",
    reveal:"Waiting on Brandon.", verified:SUGGESTED, status:"confirm", personal:"needs-brandon", sources:[] }),
  rec("kim-fixture-5", "kim", 5, { prompt:"On what date did the fixture dog come home?", options:opts("October 4", "October 14", "September 4", "November 4"), answer:"a",
    reveal:"October 4. Fixture fact.", verified:PROVIDED, personal:"provided", tags:{ topics:["dog"], likely:["Evan", "Eyob"], possible:[], reach:"deep" } }),
  rec("kim-fixture-6", "kim", 5, { prompt:"Where did the fixture proposal happen?", options:opts("A hotel by the sea", "A rooftop bar", "A city park", "A vineyard"), answer:"a",
    reveal:"Waiting on Brandon to confirm the plans happened.", verified:SUGGESTED, status:"confirm", personal:"needs-brandon", sources:[] }),
  /* Brandon Lore */
  rec("lore-fixture-1", "lore", 1, { prompt:"Which state did the fixture groom grow up in?", options:opts("Texas", "Oklahoma", "Arizona", "Georgia"), answer:"a",
    reveal:"Texas. Fixture fact.", verified:PROVIDED, personal:"provided" }),
  rec("lore-fixture-2", "lore", 2, { prompt:"What did the fixture groom build as a gift?", options:opts("A smart mirror", "A bookshelf", "A drone", "A guitar"), answer:"a",
    reveal:"A smart mirror. Fixture fact.", verified:PROVIDED, personal:"provided" }),
  rec("lore-fixture-3", "lore", 3, { prompt:"Which car does the fixture groom drive?", options:opts("Sport sedan A", "Sport sedan B", "Hatchback C", "Coupe D"), answer:"a",
    reveal:"Sport sedan A. Fixture fact.", verified:PROVIDED, personal:"provided" }),
  rec("lore-fixture-4", "lore", 4, { prompt:"What was the fixture groom's first concert venue?", options:opts("Fixture Factory", "Fixture Hall", "Fixture Arena", "Fixture Garden"), answer:"a",
    reveal:"Fixture Factory. Fixture fact.", verified:PROVIDED, personal:"provided" }),
  rec("lore-fixture-5", "lore", 5, { prompt:"Which class rank did the fixture groom finish high school with?", options:opts("Third", "First", "Fifth", "Tenth"), answer:"a",
    reveal:"Third. Fixture fact.", verified:PROVIDED, personal:"provided" }),
  rec("lore-fixture-6", "lore", 3, { prompt:"Which sister came on the fixture road trip?", options:opts("The older one", "The younger one", "Both", "Neither"), answer:"b",
    reveal:"Waiting on Brandon.", verified:SUGGESTED, status:"confirm", personal:"needs-brandon", sources:[] }),
  /* Pass the Aux */
  rec("aux-fixture-1", "aux", 1, { prompt:"Name the song.", options:opts("Fixture Anthem", "Fixture Ballad", "Fixture Groove", "Fixture Lullaby"), answer:"a",
    reveal:"Fixture Anthem, Fixture Artist (2013).", media:audio(1, 2, 8), tags:{ topics:["party"], likely:[], possible:["Chinh", "Khoa"], reach:"broad" } }),
  rec("aux-fixture-1b", "aux", 1, { prompt:"Name the song.", options:opts("Fixture Anthem", "Fixture Ballad", "Fixture Groove", "Fixture Lullaby"), answer:"a",
    reveal:"Fixture Anthem, Fixture Artist (2013). The chorus.", media:audio(1, 11, 7), variantOf:"aux-fixture-1" }),
  rec("aux-fixture-2", "aux", 2, { prompt:"Name the song.", options:opts("Kitchen Dance", "Porch Light", "Night Drive", "Slow Morning"), answer:"a",
    reveal:"Kitchen Dance, Fixture Band.", media:audio(2, 0, 9), surprise:true }),
  rec("aux-fixture-3", "aux", 3, { prompt:"Name the song.", options:opts("Train Song", "Heart Song", "Neon Song", "Rain Song"), answer:"c",
    reveal:"Neon Song, Fixture Guitarist.", media:audio(3, 4, 8), tags:{ topics:["guitar"], likely:["Evan"], possible:[], reach:"shared" } }),
  rec("aux-fixture-4", "aux", 4, { prompt:"Name the song.", options:opts("Cliffs Song", "Fire Song", "Jonas Song", "Everlong Song"), answer:"a",
    reveal:"Cliffs Song, a rhythm-game classic.", media:audio(4, 3, 10), tags:{ topics:["rhythm game"], likely:["Evan", "Eyob"], possible:[], reach:"deep" } }),
  rec("aux-fixture-5", "aux", 5, { prompt:"Name the song.", options:opts("Bubbles", "Tints", "Come Down", "Am I Wrong"), answer:"a",
    reveal:"Bubbles, Fixture Drummer.", media:audio(5, 9, 8) }),
  rec("aux-fixture-6", "aux", 3, { prompt:"Name the song.", options:opts("Lucky Dance", "Around the Room", "One More Time Again", "Lose Yourself Dance"), answer:"a",
    reveal:"Lucky Dance, Fixture Duo.", media:audio(6, 0, 6), status:"asset", notes:"The clip is a remix. Find the original." }),
  /* Internet Archaeology */
  rec("web-fixture-1", "web", 1, { prompt:"Which game portal is this?", options:opts("Fixture Clips", "Fixture Games", "Fixture Arcade", "Fixture Grounds"), answer:"a",
    reveal:"Fixture Clips, the portal.", media:media("web-1"), revealMedia:media("web-1-full") }),
  rec("web-fixture-2", "web", 2, { prompt:"Finish the phrase: \"Never gonna give you ...\"", options:opts("up", "away", "more", "back"), answer:"a",
    reveal:"Up. The fixture meme.", tags:{ topics:["meme", "youtube"], likely:[], possible:[], reach:"broad" } }),
  rec("web-fixture-3", "web", 3, { prompt:"Which creator made this video?", options:opts("Fixture Higa", "Fixture Jumba", "Fixture Trix", "Fixture Ghetto"), answer:"a",
    reveal:"Fixture Higa, 2009.", media:video(1, 1, 6), tags:{ topics:["youtube"], likely:["Richard", "Allan", "Jeremy"], possible:[], reach:"shared" } }),
  rec("web-fixture-4", "web", 4, { prompt:"Which browser game is this?", options:opts("Territory Fixture", "Stick Fixture", "Bow Fixture", "Sift Fixture"), answer:"a",
    reveal:"Territory Fixture.", media:media("web-4"), revealMedia:media("web-4-full"),
    tags:{ topics:["flash"], likely:["Richard", "Allan", "Jeremy"], possible:[], reach:"deep" } }),
  rec("web-fixture-5", "web", 5, { prompt:"Which online game is this lobby from?", options:opts("Fixture Online", "Fixture Fighter", "Fixture Saga", "Fixture Chase"), answer:"a",
    reveal:"Fixture Online.", media:media("web-5"), revealMedia:media("web-5-full"),
    tags:{ topics:["mmo"], likely:["Richard", "Allan", "Jeremy"], possible:[], reach:"deep" } }),
  rec("web-fixture-6", "web", 3, { prompt:"Which video is this?", options:opts("Fixture Rain", "Fixture Unicorn", "Fixture Turtles", "Fixture Rainbow"), answer:"d",
    reveal:"Fixture Rainbow, 2010.", media:video(2, 2, 5), flags:["reveals-answer"], notes:"The title card shows in the first second." }),
  /* You Know This Sound */
  rec("sound-fixture-1", "sound", 1, { prompt:"Which system starts up with this sound?", options:opts("Windows", "macOS", "PlayStation 2", "Xbox 360"), answer:"a",
    reveal:"A fixture startup sound.", media:audio(7, 0, 5) }),
  rec("sound-fixture-2", "sound", 2, { prompt:"Which app is calling?", options:opts("Skype", "Messenger", "Discord", "Steam"), answer:"a",
    reveal:"A fixture ringtone.", media:audio(8, 5, 4) }),
  rec("sound-fixture-3", "sound", 3, { prompt:"Which creature makes this sound?", options:opts("Creeper", "Ghast", "Enderman", "Blaze"), answer:"a",
    reveal:"A fixture hiss.", media:audio(9, 14, 3), tags:{ topics:["minecraft"], likely:["Chinh", "Khoa"], possible:[], reach:"shared" } }),
  rec("sound-fixture-4", "sound", 4, { prompt:"Which summoner spell is this?", options:opts("Flash", "Ghost", "Teleport", "Cleanse"), answer:"a",
    reveal:"A fixture spell.", media:audio(10, 12, 2), tags:{ topics:["league"], likely:["Chinh", "Khoa"], possible:[], reach:"shared" } }),
  rec("sound-fixture-5", "sound", 5, { prompt:"Which game's login theme is this?", options:opts("Fixture Story", "Fixture Chase", "Fixture Fighter", "Fixture Audition"), answer:"a",
    reveal:"A fixture theme.", media:audio(11, 8, 9), tags:{ topics:["mmo"], likely:["Chinh", "Khoa"], possible:[], reach:"deep" } }),
  rec("sound-fixture-6", "sound", 2, { prompt:"Which game says this when you die?", options:opts("GTA V", "GTA IV", "Red Dead 2", "Max Payne 3"), answer:"a",
    reveal:"A fixture sting.", media:audio(12, 15, 3), status:"rejected", notes:"Too easy." }),
  /* Silhouette Showdown */
  ...[1, 2, 3, 4, 5].map(n => rec(`sil-fixture-${n}`, "sil", n, { prompt:"Who is this?", options:opts(`Fixture Creature ${n}`, `Fixture Robot ${n}`, `Fixture Knight ${n}`, `Fixture Mouse ${n}`), answer:"abcd"[n % 4],
    reveal:`The fixture shape ${n}.`, media:media(`sil-${n}`), revealMedia:media(`sil-${n}-original`),
    ...(n === 5 ? { tags:{ topics:["mmo"], likely:["Richard", "Allan", "Jeremy"], possible:[], reach:"deep" } } : {}) })),
  rec("sil-fixture-6", "sil", 2, { prompt:"Which game is this helmet from?", options:opts("Fixture Rim", "Fixture Ring", "Fixture Witch", "Fixture Souls"), answer:"a",
    reveal:"Fixture Rim's helmet.", media:media("sil-6"), revealMedia:media("sil-6-original"), tags:{ topics:["rpg"], likely:["Evan", "Eyob", "Sahil"], possible:[], reach:"shared" } }),
]);

/* the recommended board: each category's first record at each value */
const pick = (category, tier) => QBANK_FIXTURE_RECORDS.find(record => record.category === category && record.tier === tier && !record.variantOf)?.id || null;
export const QBANK_FIXTURE_RECOMMENDED = Object.freeze({
  columns:QBANK_CATEGORIES.map(category => ({ category:category.id, name:category.name,
    slots:Array.from({ length:QBANK_SLOTS }, (_, slot) => pick(category.id, slot + 1)) })),
});

/* The fixtures as the Worker's bank (a rehearsal's swap, never the real
   bank's files); hands back the restore. Every record must meet the
   bank's rules, or the Worker would leave it out. */
export function useDeskBank() {
  const bad = QBANK_FIXTURE_RECORDS.map(record => cleanQBankRecord(record).error).filter(Boolean);
  if (bad.length) throw new Error(`desk fixtures break the bank's rules: ${bad.join("; ")}`);
  return useQBank({ records:structuredClone(QBANK_FIXTURE_RECORDS), recommended:structuredClone(QBANK_FIXTURE_RECOMMENDED) });
}

const GM = { isGm:true, player:null, deviceId:"desk-fixture", environment:"local" };
let writes = 0;
/* one of the desk's writes, the Worker's own reducer, as the commissioner */
export function deskWrite(state, type, payload) {
  return applyAction(state, type, payload, { ...GM, actionId:`desk-${++writes}` });
}
/* GET /api/trivia/qbank, as the Worker answers it for this state */
export const qbankFixtureResponse = (state = {}) => structuredClone(qbankDesk(state));

/* A desk's state on the bank's real writes (call useDeskBank() first):
   "fresh" (the recommended board), "worked" (a few edits and marks, an
   empty slot, a repeat, a clue played anyway), "empty" (nothing picked) */
export function qbankFixtureState(stage = "worked", base = {}) {
  const state = { ...base, triviaPlan:null, triviaBankEdits:{}, triviaBankMarks:{} };
  const run = (type, payload) => {
    const result = deskWrite(state, type, payload);
    if (!result?.ok) throw new Error(`${type}: ${result?.error}`);
  };
  run("qbankImport", { plan:structuredClone(QBANK_FIXTURE_RECOMMENDED), edits:{}, marks:{} });
  if (stage === "empty") QBANK_CATEGORIES.forEach((_, col) => Array.from({ length:QBANK_SLOTS }, (__, slot) =>
    run("qbankAssign", { col, slot, qid:null })));
  if (stage === "worked") {
    run("qbankAssign", { col:0, slot:2, qid:"nba-fixture-4" });
    run("qbankAssign", { col:3, slot:4, qid:null });
    run("qbankAssign", { col:4, slot:2, qid:"web-fixture-6" });
    run("qbankAssign", { col:3, slot:1, qid:"aux-fixture-1b" });
    run("qbankAssign", { col:5, slot:1, qid:"sound-fixture-6" });
    run("qbankAssign", { col:6, slot:1, qid:"sil-fixture-6", force:false });
    run("qbankEdit", { qid:"nba-fixture-2", patch:{ reveal:"Houston Rockets. Edited by the host." } });
    run("qbankEdit", { qid:"aux-fixture-3", patch:{ media:{ start:6 } } });
    run("qbankMark", { qid:"nba-fixture-5", mark:"fav" });
    run("qbankMark", { qid:"aux-fixture-6", mark:"short" });
    run("qbankMark", { qid:"sound-fixture-6", mark:"reject" });
    run("qbankMark", { qid:"sil-fixture-6", mark:"short" });
  }
  return state;
}
