/* Worst-case data for the fit audit (dev/fit/scenarios.js, the `worst-`
   views): what a guest or the commissioner can actually type, pick or
   cause, at the limits the server keeps, written through the real reducers
   so nothing here is a value the Worker would refuse or trim.

   - display names at the profile's 16 (a wide all-caps pair, a 16-letter
     handle with no space, stacked Vietnamese marks, a CJK name with no
     photo, emoji, one and two letters, an apostrophe and a hyphen)
   - team names at 24 with a 15-letter word, CJK with no space, emoji
   - win songs and a karaoke song as Spotify and YouTube name them (a long
     classical title, featured artists, Korean and Japanese titles)
   - a ruling's 80-character reason, a renamed event at 28
   - a Trivia round with the 160-character question and 60-character
     options (the longest English words, one per option)
   - Where and When places at 60 and a caption at 140
   - award titles at 40, a lyric line at 160
   - a board ruled to 18,500 and below zero with a tie at every place

   Each `worst*` decorator takes a state the scenarios built and returns it
   rewritten; `worstBase` builds the one that needs players marked Not
   coming before anything is played. Pure apart from the reducers it calls. */
import { EMPTY_STATE, RESET_PROGRESS_CONFIRMATION, ROSTER, computeStandings, rosterOf } from "../../shared/core.js";
import { floatSlate } from "../../shared/float.js";
import { cleanLyrics } from "../../shared/karaokeLyrics.js";
import { applyAction } from "../../worker/actions.js";
import { KARAOKE_FIT_LYRICS } from "./karaokeLyricsFixture.js";

let serial = 0;
const gm = () => ({ isGm:true, qa:true, progressReset:true, environment:"local", player:"Brandon", deviceId:"fit-worst",
  actionId:`worst-${++serial}`, showControl:false });
const as = player => ({ isGm:false, player, deviceId:`fit-worst-${player}`, actionId:`worst-${++serial}` });
function run(state, type, payload, ctx = gm()) {
  const result = applyAction(state, type, payload, ctx);
  if (!result.ok) throw new Error(`worst ${type}: ${result.error}`);
  return result;
}

/* ── people ── */
/* every display name at or under the 16 a profile keeps */
export const WORST_NAMES = Object.freeze({
  Brandon:"Brandon Tran", Evan:"Ev", Eyob:"Eyob Tesfamariam", Sahil:"Sahil Venkatesh", Khoa:"Nguyễn Đăng Khoa",
  Chinh:"Chính 🍺", Adi:"Adi 🔥🔥🔥", Chiang:"蔣家豪", Richard:"MAXIMILIAN WOLFE", Allan:"Allan Montgomery",
  Henry:"TheRealSlimShady", Ben:"B", Jeremy:"Jeremy O'Neil-Wu",
});
/* who has a photo: the rest letter their initials (the CJK name, the
   stacked marks, the handle, the one letter, the apostrophe) */
export const WORST_PHOTOS = Object.freeze(["Brandon", "Evan", "Eyob", "Sahil", "Chinh", "Adi", "Richard", "Allan"]);
/* the phone's viewer is FIT_GUEST (Richard): the wide all-caps name */

export function worstNames(state) {
  for (const player of rosterOf(state)) {
    const display = WORST_NAMES[player];
    run(state, "saveProfile", { player, display });
    if (state.profiles[player].display !== display) throw new Error(`worst: ${player}'s name did not keep (${display})`);
  }
  return state;
}

/* ── teams ── */
/* written names at the 24 a team keeps, words at 15 or under */
export const WORST_TEAM_NAMES = Object.freeze(["MAXIMUM OVERDRIVE WOLVES", "Quarterpounders Unite 🍔", "蔣家豪的冠軍隊",
  "Ctrl Alt Defeat 🍺🍺🍺🍺", "Dink Responsibly Please", "Les Quizerables Reunited"]);
/* every team of `evId`'s draw named by the commissioner; `pairs` names the
   teams of two too (unnamed, a pair letters both names: "A & B") */
export function worstTeamNames(state, evId, { pairs = false } = {}) {
  const draw = state.draws?.[evId];
  if (!draw?.teams?.length) throw new Error(`worst: no draw for ${evId}`);
  draw.teams.forEach((team, index) => {
    if ((team.players?.length || 0) < 2 || (team.players.length === 2 && !pairs)) return;
    run(state, "nameTeam", { evId, drawId:draw.id, team:index, name:WORST_TEAM_NAMES[index % WORST_TEAM_NAMES.length] });
  });
  return state;
}

/* ── songs ── */
const spotify = (trackId, name, artists, seconds) => Object.freeze({ provider:"spotify", trackId, uri:`spotify:track:${trackId}`,
  name, artists:Object.freeze([...artists]), durationMs:seconds * 1000, imageUrl:null, explicit:false, startMs:0 });
/* win songs as Spotify names the releases */
export const WORST_SONGS = Object.freeze({
  Richard:spotify("2LlQb7Uoj1kKyGhlkBf9aC",
    "Symphony No. 9 in D Minor, Op. 125 \"Choral\": IV. Presto - Allegro assai - Allegro assai vivace (alla marcia)",
    ["Ludwig van Beethoven", "Berliner Philharmoniker", "Herbert von Karajan"], 1460),
  Henry:spotify("0F7FA14euOIX8KcbEturGH", "Old Town Road (feat. Billy Ray Cyrus) - Remix", ["Lil Nas X", "Billy Ray Cyrus"], 157),
  Chiang:spotify("03UrZgTINDqvnUMbbIMhql", "Gangnam Style (강남스타일)", ["PSY"], 219),
  Khoa:spotify("6habFhsOp2NvshLv26DqMb", "Despacito - Remix", ["Luis Fonsi", "Daddy Yankee", "Justin Bieber"], 229),
  Eyob:spotify("3P3pw6C19j31Rnzgo3JG7o", "強風オールバック (feat. 歌愛ユキ)", ["Yukopi"], 173),
  Brandon:spotify("7ouMYWpwJ422jRcDASZB7P", "Kernkraft 400 (A Better Day)", ["Topic", "A7S"], 165),
  Allan:spotify("4rTfJ2zJXRb0yt2YBSNvHT", "Everybody (Backstreet's Back) - Radio Edit", ["Backstreet Boys"], 225),
});
/* each player's win song saved through saveProfile */
export function worstSongs(state, players = Object.keys(WORST_SONGS)) {
  for (const player of players) {
    if (!WORST_SONGS[player] || !rosterOf(state).includes(player)) continue;
    run(state, "saveProfile", { player, display:state.profiles[player]?.display || player,
      walkoutTrack:{ ...WORST_SONGS[player], artists:[...WORST_SONGS[player].artists] } });
  }
  return state;
}
/* the viewer's karaoke song: the room's long title (its parentheses are the
   song's own, so nothing drops them), a karaoke upload's title and channel
   at their lengths, the alternate a pasted-in-style title */
export const WORST_KARAOKE = Object.freeze({
  ...spotify("4e0bLHDmo6sJDTnyHoNBDK", "I'd Do Anything for Love (But I Won't Do That) - Single Edit", ["Meat Loaf"], 718),
  video:Object.freeze({ id:"wRst0Anythi", seconds:711,
    title:"Meat Loaf - I'd Do Anything for Love (But I Won't Do That) (Karaoke Version with Backing Vocals)",
    channel:"Zoom Karaoke Official: Professional Karaoke Backing Tracks" }),
  alts:Object.freeze([Object.freeze({ id:"wRst0Anyth2", seconds:716, channel:"KaraFun Karaoke",
    title:"I'd Do Anything for Love (But I Won't Do That) | Karaoke Backing Track with Lyrics on Screen" })]),
});
export function worstKaraokeSong(state, player) {
  const { startMs, ...track } = WORST_KARAOKE;
  run(state, "karaokeSong", { track:structuredClone(track) }, as(player));
  return state;
}

/* ── the commissioner's words ── */
export const WORST_RULING = Object.freeze({ player:"Henry", delta:-400,
  reason:"Dropped the trophy on the driveway during the Saturday night victory lap parade" });
export function worstRuling(state, ruling = WORST_RULING) {
  run(state, "adjust", { ...ruling });
  return state;
}
/* a built-in renamed at the 28 an event name keeps */
export const WORST_EVENT_NAME = "Long Putt Sudden Death Final";
export function worstEventName(state, evId = "putt", name = WORST_EVENT_NAME) {
  run(state, "editEvent", { id:evId, patch:{ name } });
  return state;
}

/* Trivia: the commissioner's own round at every limit: the 32-character
   round name, the 160-character question, options at 60, the longest
   English words as options, a closest number with a 24-character unit */
export const WORST_TRIVIA_ROUND = Object.freeze({ id:"tworstround1", source:"custom", name:"Brandon & Steph: The Early Years",
  questions:Object.freeze([
    Object.freeze({ id:"qworstwords1", format:"choice",
      text:"At the 2019 office spelling bee, which word did Brandon spell correctly in front of the whole floor to win a framed certificate and a gift card to the diner?",
      options:Object.freeze(["Pneumonoultramicroscopicsilicovolcanoconiosis", "Supercalifragilisticexpialidocious",
        "Antidisestablishmentarianism", "Floccinaucinihilipilification"]), answer:1 }),
    Object.freeze({ id:"qworstorder1", format:"choice",
      text:"What did Brandon order the first time he took everyone to the diner on Camelback after the fantasy draft, then refuse to share with anybody?",
      options:Object.freeze(["A patty melt with extra pickles and a side of onion rings", "Chicken and waffles with hot honey and a side of grits",
        "Two full breakfasts, then a third one to go for the drive", "Nothing at all, he left early to catch the end of the Suns"]),
      answer:2 }),
    Object.freeze({ id:"qworstmiles1", format:"number",
      text:"How many miles did the group drive on the road trip from Phoenix to Big Sur and back, counting the wrong turn near Bakersfield?",
      answer:1489, digits:4, unit:"miles there and back" }),
  ]) });
/* Where and When: places at the 60 a round keeps (one a single word, a
   real place), a caption at 140 */
export const WORST_GEO_ROUNDS = Object.freeze([
  Object.freeze({ id:"gworstround1", photo:Object.freeze({ id:"gworstphoto1", w:1200, h:1600 }), lat:53.2219, lng:-4.2045,
    place:"Llanfairpwllgwyngyllgogerychwyrndrobwllllantysiliogogogoch", when:"2022-08-14T16",
    caption:"The station sign everyone made us stop for on the way to the ferry, twice, because the first photo of all of us was blurry" }),
  Object.freeze({ id:"gworstround2", photo:Object.freeze({ id:"gworstphoto2", w:1600, h:1200 }), lat:36.0544, lng:-112.1401,
    place:"Grand Canyon Village, Grand Canyon National Park, Arizona", when:"2019-07-04T05",
    caption:"The night we drove four hours to see the sunrise and all slept through it in the parking lot because somebody forgot the alarm" }),
]);
/* awards at the 40 a title keeps */
export const WORST_BALLOT = Object.freeze({ id:"bworstawards", kind:"awards", questions:Object.freeze([
  Object.freeze({ id:"qworstsleep", title:"Most Likely To Fall Asleep At The Table", nominees:null, allowSelf:false }),
  Object.freeze({ id:"qworstcomeback", title:"Best Comeback Of The Entire Weekend", nominees:null, allowSelf:false }),
]) });
/* a lyric line at the 160 a line keeps, where the stand-in's long line is */
export const WORST_LYRIC = "And we kept on driving through the canyon with the windows down and the radio up until the sun came over Camelback and nobody wanted the night to end";
export const WORST_LYRICS = Object.freeze(cleanLyrics(KARAOKE_FIT_LYRICS.map(line =>
  line.text.startsWith("We were never meant") ? { t:line.t, text:WORST_LYRIC } : { ...line })));

/* ── the board ── */
/* a tie at every place, a leader at 18,500 and two below zero (the first
   ten: a board with three not coming is tied all the way down) */
export const WORST_SPREAD = Object.freeze([18500, 18500, 12400, 12400, 7700, 7700, 3100, 3100, -2400, -2400, 1000, 1000, 0]);
export function worstSpread(state, values = WORST_SPREAD) {
  const now = Object.fromEntries(computeStandings(state).map(row => [row.player, row.pts]));
  rosterOf(state).forEach((player, i) => {
    const delta = (values[i] ?? 1000) - (now[player] ?? 1000);
    if (delta) run(state, "adjust", { player, delta, reason:"fit" });
  });
  return state;
}
/* three not coming (marked before anything is played, as the server
   requires) and one away, then the weekend played to `target` by QA */
export const WORST_OUT = Object.freeze(["Evan", "Sahil", "Ben"]);
export const WORST_AWAY = "Chinh";
export function worstBase(target, { out = WORST_OUT, away = WORST_AWAY, seed = 7 } = {}) {
  /* the slate a server starts with (scenarios.js fresh): Float plays, Beerio Kart stands by */
  const state = floatSlate(structuredClone(EMPTY_STATE));
  out.forEach(player => run(state, "setOut", { player, out:true }));
  run(state, "qaAdvance", { target, seed, confirm:RESET_PROGRESS_CONFIRMATION, confirmPokerLive:true });
  if (away) run(state, "setAway", { player:away, away:true });
  return state;
}
/* the players a worst view puts on the roster, for the tests */
export const WORST_ROSTER = ROSTER;
