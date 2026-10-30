/* The Question bank desk's fixture bank (docs/TRIVIA-QBANK.md): 44 made-up
   records over the seven categories and every media kind, a recommended
   board, and the five desk writes run in memory, for the rehearsal page
   (/dev/qbank-preview.html), the fit audit's desk views and the desk's
   tests. Nothing here is a real question or a real fact: the real bank is
   the content builders' worker/triviaQBank/, served to the commissioner
   only. Images are drawn here as SVG; the clips are tones and a test card
   (dev/qbank-media/). */
import { QBANK_CATEGORIES, QBANK_MARKS, QBANK_SLOTS, cleanQBankRecord, mergeQBankEdit } from "../../src/features/trivia/qbankEngine.js";
import { parseImport, planColumns } from "../../src/features/trivia/qbankModel.js";

const svg = body => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240">${body}</svg>`)}`;
const HUES = ["#3d5a80", "#7a4b8c", "#2f6f62", "#8c5a2b", "#5b6b2f", "#803d4a", "#2b5f8c"];
/* a neutral headshot: a face and shoulders on a plain ground */
const headshot = n => svg(`<rect width="320" height="240" fill="${HUES[n % 7]}"/><circle cx="160" cy="98" r="52" fill="#e8c9a8"/>`
  + `<path d="M60 240c10-60 50-84 100-84s90 24 100 84z" fill="#d9d2c3"/><text x="16" y="228" font-family="sans-serif" font-size="14" fill="#fff8">fixture ${n}</text>`);
/* the headshot's reveal: the same face on the team's colors */
const teamReveal = n => svg(`<rect width="320" height="240" fill="${HUES[(n + 3) % 7]}"/><rect y="170" width="320" height="70" fill="#f0b429"/>`
  + `<circle cx="160" cy="98" r="52" fill="#e8c9a8"/><text x="160" y="222" text-anchor="middle" font-family="sans-serif" font-weight="800" font-size="30" fill="#1b1b1b">TEAM ${n}</text>`);
/* a silhouette: one solid shape on white */
const SHAPES = [
  "M160 30l30 60 66 10-48 46 12 66-60-32-60 32 12-66-48-46 66-10z",
  "M90 200c0-80 30-150 70-150s70 70 70 150zM120 60l-30-40 50 20zM200 60l30-40-50 20z",
  "M60 190h200l-20-60h-40l-20-70h-40l-20 70h-40z",
  "M160 20c60 0 90 50 90 100s-40 100-90 100-90-50-90-100 30-100 90-100zM130 100a10 10 0 1 0 1 0z",
];
const silhouette = n => svg(`<rect width="320" height="240" fill="#f4f1ea"/><path d="${SHAPES[n % 4]}" fill="#111" transform="rotate(${n * 7 - 20} 160 120)"/>`);
const original = n => svg(`<rect width="320" height="240" fill="#f4f1ea"/><path d="${SHAPES[n % 4]}" fill="${HUES[n % 7]}" stroke="#111" stroke-width="4"/>`);
/* a screenshot crop: a window, its bars and blocks, no words */
const screenshot = n => svg(`<rect width="320" height="240" fill="#c9d3dd"/><rect x="0" y="0" width="320" height="26" fill="${HUES[n % 7]}"/>`
  + `<circle cx="14" cy="13" r="5" fill="#fff9"/><rect x="16" y="40" width="180" height="120" fill="#fff"/><rect x="206" y="40" width="98" height="56" fill="#ffd166"/>`
  + `<rect x="206" y="104" width="98" height="56" fill="#06d6a0"/><rect x="16" y="172" width="288" height="52" fill="#${(n * 123457 % 0xffffff).toString(16).padStart(6, "0")}"/>`);
const fullShot = n => svg(`<rect width="320" height="240" fill="#e6ebf0"/><rect width="320" height="34" fill="${HUES[n % 7]}"/>`
  + `<text x="12" y="23" font-family="sans-serif" font-weight="700" font-size="16" fill="#fff">Fixture Portal ${n}</text><rect x="16" y="48" width="288" height="176" fill="#fff"/>`);

const MEDIA = "/dev/qbank-media";
const audio = (file, start, duration) => ({ kind:"audio", src:`${MEDIA}/${file}`, start, duration, mime:"audio/mpeg" });
const video = (file, start, duration) => ({ kind:"video", src:`${MEDIA}/${file}`, w:160, h:90, start, duration, mime:"video/mp4" });
const image = src => ({ kind:"image", src, w:320, h:240, mime:"image/svg+xml" });
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
  reveal:`${answer}. Fixture roster as of the cutoff.`, media:image(headshot(n)), revealMedia:image(teamReveal(n)),
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
  nba(8, 5, "Dorian Vale", NBA_TEAMS[7], t(5, 6, 2), { status:"asset", media:image(headshot(8)) }),
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
    reveal:"Fixture Anthem, Fixture Artist (2013).", media:audio("tone1.mp3", 2, 8), tags:{ topics:["party"], likely:[], possible:["Chinh", "Khoa"], reach:"broad" } }),
  rec("aux-fixture-1b", "aux", 1, { prompt:"Name the song.", options:opts("Fixture Anthem", "Fixture Ballad", "Fixture Groove", "Fixture Lullaby"), answer:"a",
    reveal:"Fixture Anthem, Fixture Artist (2013). The chorus.", media:audio("tone1.mp3", 11, 7), variantOf:"aux-fixture-1" }),
  rec("aux-fixture-2", "aux", 2, { prompt:"Name the song.", options:opts("Kitchen Dance", "Porch Light", "Night Drive", "Slow Morning"), answer:"a",
    reveal:"Kitchen Dance, Fixture Band.", media:audio("tone2.mp3", 0, 9), surprise:true }),
  rec("aux-fixture-3", "aux", 3, { prompt:"Name the song.", options:opts("Train Song", "Heart Song", "Neon Song", "Rain Song"), answer:"c",
    reveal:"Neon Song, Fixture Guitarist.", media:audio("tone3.mp3", 4, 8), tags:{ topics:["guitar"], likely:["Evan"], possible:[], reach:"shared" } }),
  rec("aux-fixture-4", "aux", 4, { prompt:"Name the song.", options:opts("Cliffs Song", "Fire Song", "Jonas Song", "Everlong Song"), answer:"a",
    reveal:"Cliffs Song, a rhythm-game classic.", media:audio("tone4.mp3", 3, 10), tags:{ topics:["rhythm game"], likely:["Evan", "Eyob"], possible:[], reach:"deep" } }),
  rec("aux-fixture-5", "aux", 5, { prompt:"Name the song.", options:opts("Bubbles", "Tints", "Come Down", "Am I Wrong"), answer:"a",
    reveal:"Bubbles, Fixture Drummer.", media:audio("tone5.mp3", 9, 8) }),
  rec("aux-fixture-6", "aux", 3, { prompt:"Name the song.", options:opts("Lucky Dance", "Around the Room", "One More Time Again", "Lose Yourself Dance"), answer:"a",
    reveal:"Lucky Dance, Fixture Duo.", media:audio("tone6.mp3", 0, 6), status:"asset", notes:"The clip is a remix. Find the original." }),
  /* Internet Archaeology */
  rec("web-fixture-1", "web", 1, { prompt:"Which game portal is this?", options:opts("Fixture Clips", "Fixture Games", "Fixture Arcade", "Fixture Grounds"), answer:"a",
    reveal:"Fixture Clips, the portal.", media:image(screenshot(1)), revealMedia:image(fullShot(1)), format:"image" }),
  rec("web-fixture-2", "web", 2, { prompt:"Finish the phrase: \"Never gonna give you ...\"", options:opts("up", "away", "more", "back"), answer:"a",
    reveal:"Up. The fixture meme.", tags:{ topics:["meme", "youtube"], likely:[], possible:[], reach:"broad" } }),
  rec("web-fixture-3", "web", 3, { prompt:"Which creator made this video?", options:opts("Fixture Higa", "Fixture Jumba", "Fixture Trix", "Fixture Ghetto"), answer:"a",
    reveal:"Fixture Higa, 2009.", media:video("clip1.mp4", 1, 6), tags:{ topics:["youtube"], likely:["Richard", "Allan", "Jeremy", "Henry"], possible:[], reach:"shared" } }),
  rec("web-fixture-4", "web", 4, { prompt:"Which browser game is this?", options:opts("Territory Fixture", "Stick Fixture", "Bow Fixture", "Sift Fixture"), answer:"a",
    reveal:"Territory Fixture.", media:image(screenshot(4)), revealMedia:image(fullShot(4)), format:"image",
    tags:{ topics:["flash"], likely:["Richard", "Allan", "Jeremy", "Henry"], possible:[], reach:"deep" } }),
  rec("web-fixture-5", "web", 5, { prompt:"Which online game is this lobby from?", options:opts("Fixture Online", "Fixture Fighter", "Fixture Saga", "Fixture Chase"), answer:"a",
    reveal:"Fixture Online.", media:image(screenshot(5)), revealMedia:image(fullShot(5)), format:"image",
    tags:{ topics:["mmo"], likely:["Richard", "Allan", "Jeremy", "Henry"], possible:[], reach:"deep" } }),
  rec("web-fixture-6", "web", 3, { prompt:"Which video is this?", options:opts("Fixture Rain", "Fixture Unicorn", "Fixture Turtles", "Fixture Rainbow"), answer:"d",
    reveal:"Fixture Rainbow, 2010.", media:{ ...video("clip2.mp4", 2, 5), revealing:true }, notes:"The title card shows in the first second." }),
  /* You Know This Sound */
  rec("sound-fixture-1", "sound", 1, { prompt:"Which system starts up with this sound?", options:opts("Windows", "macOS", "PlayStation 2", "Xbox 360"), answer:"a",
    reveal:"A fixture startup sound.", media:audio("tone7.mp3", 0, 5) }),
  rec("sound-fixture-2", "sound", 2, { prompt:"Which app is calling?", options:opts("Skype", "Messenger", "Discord", "Steam"), answer:"a",
    reveal:"A fixture ringtone.", media:audio("tone8.mp3", 5, 4) }),
  rec("sound-fixture-3", "sound", 3, { prompt:"Which creature makes this sound?", options:opts("Creeper", "Ghast", "Enderman", "Blaze"), answer:"a",
    reveal:"A fixture hiss.", media:audio("tone9.mp3", 14, 3), tags:{ topics:["minecraft"], likely:["Chinh", "Khoa"], possible:[], reach:"shared" } }),
  rec("sound-fixture-4", "sound", 4, { prompt:"Which summoner spell is this?", options:opts("Flash", "Ghost", "Teleport", "Cleanse"), answer:"a",
    reveal:"A fixture spell.", media:audio("tone10.mp3", 12, 2), tags:{ topics:["league"], likely:["Chinh", "Khoa"], possible:[], reach:"shared" } }),
  rec("sound-fixture-5", "sound", 5, { prompt:"Which game's login theme is this?", options:opts("Fixture Story", "Fixture Chase", "Fixture Fighter", "Fixture Audition"), answer:"a",
    reveal:"A fixture theme.", media:audio("tone11.mp3", 8, 9), tags:{ topics:["mmo"], likely:["Chinh", "Khoa"], possible:[], reach:"deep" } }),
  rec("sound-fixture-6", "sound", 2, { prompt:"Which game says this when you die?", options:opts("GTA V", "GTA IV", "Red Dead 2", "Max Payne 3"), answer:"a",
    reveal:"A fixture sting.", media:audio("tone12.mp3", 15, 3), status:"rejected", notes:"Too easy." }),
  /* Silhouette Showdown */
  ...[1, 2, 3, 4, 5].map(n => rec(`sil-fixture-${n}`, "sil", n, { prompt:"Who is this?", options:opts(`Fixture Creature ${n}`, `Fixture Robot ${n}`, `Fixture Knight ${n}`, `Fixture Mouse ${n}`), answer:"abcd"[n % 4],
    reveal:`The fixture shape ${n}.`, media:image(silhouette(n)), revealMedia:image(original(n)), format:"image",
    ...(n === 5 ? { tags:{ topics:["mmo"], likely:["Richard", "Allan", "Jeremy", "Henry"], possible:[], reach:"deep" } } : {}) })),
  rec("sil-fixture-6", "sil", 2, { prompt:"Which game is this helmet from?", options:opts("Fixture Rim", "Fixture Ring", "Fixture Witch", "Fixture Souls"), answer:"a",
    reveal:"Fixture Rim's helmet.", media:image(silhouette(6)), revealMedia:image(original(6)), format:"image", tags:{ topics:["rpg"], likely:["Evan", "Eyob", "Sahil"], possible:[], reach:"shared" } }),
]);

/* the recommended board: each category's first record at each value */
const pick = (category, tier) => QBANK_FIXTURE_RECORDS.find(record => record.category === category && record.tier === tier && !record.variantOf)?.id || null;
export const QBANK_FIXTURE_RECOMMENDED = Object.freeze({
  columns:QBANK_CATEGORIES.map(category => ({ category:category.id, name:category.name,
    slots:Array.from({ length:QBANK_SLOTS }, (_, slot) => pick(category.id, slot + 1)) })),
});

/* the GET's answer: the records and the recommended board */
export const qbankFixtureResponse = () => ({ ok:true, records:structuredClone(QBANK_FIXTURE_RECORDS),
  recommended:structuredClone(QBANK_FIXTURE_RECOMMENDED) });

/* A desk's state: `stage` "fresh" (the recommended board), "worked" (a few
   edits and marks, an empty slot, a repeat), "empty" (nothing picked) */
export function qbankFixtureState(stage = "worked", base = {}) {
  const state = { ...base, triviaPlan:{ ...structuredClone(QBANK_FIXTURE_RECOMMENDED), updatedAt:1 }, triviaBankEdits:{}, triviaBankMarks:{} };
  if (stage === "empty") state.triviaPlan.columns.forEach(column => { column.slots = column.slots.map(() => null); });
  if (stage === "worked") {
    const columns = state.triviaPlan.columns;
    columns[0].slots[2] = "nba-fixture-4";
    columns[3].slots[4] = null;
    columns[4].slots[2] = "web-fixture-6";
    columns[3].slots[1] = "aux-fixture-1b";
    columns[5].slots[1] = "sound-fixture-6";
    state.triviaBankEdits = { "nba-fixture-2":{ reveal:"Houston Rockets. Edited by the host." }, "aux-fixture-3":{ media:{ start:6 } } };
    state.triviaBankMarks = { "nba-fixture-5":"fav", "aux-fixture-6":"short", "sound-fixture-6":"reject", "sil-fixture-6":"short" };
  }
  return state;
}

/* ── the five writes, in memory (until the engine's reducers land) ── */
const byIdOf = () => new Map(QBANK_FIXTURE_RECORDS.map(record => [record.id, record]));
export function qbankReduce(state, type, payload = {}) {
  const byId = byIdOf();
  const plan = state.triviaPlan || structuredClone(QBANK_FIXTURE_RECOMMENDED);
  if (type === "qbankAssign") {
    const { col, slot, qid } = payload;
    if (!Number.isInteger(col) || col < 0 || col >= QBANK_CATEGORIES.length || !Number.isInteger(slot) || slot < 0 || slot >= QBANK_SLOTS)
      return { ok:false, error:"That slot isn't on the board" };
    if (qid !== null && !byId.has(qid)) return { ok:false, error:"That question isn't in the bank" };
    const columns = planColumns(plan).map(column => ({ ...column, slots:[...column.slots] }));
    if (qid && byId.get(qid).category !== columns[col].category) return { ok:false, error:"That question belongs in another column" };
    columns[col].slots[slot] = qid;
    state.triviaPlan = { columns, updatedAt:Date.now() };
    return { ok:true };
  }
  if (type === "qbankEdit") {
    const { qid, patch } = payload;
    if (!byId.has(qid)) return { ok:false, error:"That question isn't in the bank" };
    const edits = { ...(state.triviaBankEdits || {}) };
    if (!patch) delete edits[qid];
    else {
      const checked = cleanQBankRecord(mergeQBankEdit(byId.get(qid), patch));
      if (checked.error) return { ok:false, error:checked.error };
      edits[qid] = patch;
    }
    state.triviaBankEdits = edits;
    return { ok:true };
  }
  if (type === "qbankMark") {
    const { qid, mark } = payload;
    if (!byId.has(qid)) return { ok:false, error:"That question isn't in the bank" };
    if (mark !== null && !QBANK_MARKS.includes(mark)) return { ok:false, error:"Pick Favorite, Shortlist or Reject" };
    const marks = { ...(state.triviaBankMarks || {}) };
    if (mark) marks[qid] = mark; else delete marks[qid];
    state.triviaBankMarks = marks;
    return { ok:true };
  }
  if (type === "qbankPlanReset") {
    state.triviaPlan = { ...structuredClone(QBANK_FIXTURE_RECOMMENDED), updatedAt:Date.now() };
    return { ok:true };
  }
  if (type === "qbankImport") {
    const parsed = parseImport(payload, { knownIds:new Set(byId.keys()) });
    if (parsed.error) return { ok:false, error:parsed.error };
    state.triviaPlan = { ...parsed.plan, updatedAt:Date.now() };
    state.triviaBankEdits = parsed.edits;
    state.triviaBankMarks = parsed.marks;
    return { ok:true };
  }
  return null;
}
