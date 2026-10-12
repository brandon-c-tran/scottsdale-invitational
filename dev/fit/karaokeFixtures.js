/* Karaoke fixtures (docs/KARAOKE.md): games built straight from the
   contract for the fit audit (dev/fit/scenarios.js) and the TV's tests,
   while the server's karaoke writes live on their own branch. The base is
   real (qaAdvance to Karaoke, Lock and start through the real reducers);
   the game itself is written the way the writes would write it, through
   the shared model (karaokeGameId, karaokeOrder, karaokeSnapshot,
   karaokeSchedule, karaokeLegendary, karaokeRanking, karaokeRevealSchedule),
   every instant relative to `now`, then projected the way a TV's frame
   carries it (projectKaraoke(state, null): who voted and when, never how;
   each song only once its singer is up). Never a real YouTube or Spotify
   address: video ids are stand-ins and covers are drawn data URIs.

   karaokeStage(stage, { now, project }) -> state
     pick           the pick window 40 s in, eight of thirteen locked in
     order          the running order dealt 3 s in
     up             the third singer up next, 4 s into the walk-up
     singing        the third singer's video 50 s in, four votes in
     practice       the same with a practice song (no video): the lit card
     failed         the same with a video that will not play (no
                    alternate left): the lit card
     voting         the song over 8 s ago, eight of twelve voted
     legendary      the second singer's vote closed Legendary 0.9 s ago
     reveal-mid     every singer sang; the reveal down to 6th
     reveal-podium  the reveal with 1st just in
   Pure apart from the reducers it calls; deterministic. */
import { EMPTY_STATE, RESET_PROGRESS_CONFIRMATION, allEventsOf, presentPlayers, resolveCurrentContest } from "../../shared/core.js";
import {
  KARAOKE_LEGENDARY_MS, KARAOKE_ORDER_HOLD_MS, KARAOKE_PICK_MS, KARAOKE_PRACTICE_SONGS, KARAOKE_UP_MS, karaokeGameId,
  karaokeLegendary, karaokeOrder, karaokeRanking, karaokeRevealSchedule, karaokeSchedule, karaokeSnapshot, karaokeSongMs,
  projectKaraoke,
} from "../../shared/karaoke.js";
import { applyAction } from "../../worker/actions.js";
import { svgDataUri } from "./standins.js";

/* a drawn cover, a hue a song (the audit never reaches Spotify's image host) */
const cover = hue => svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="hsl(${hue} 45% 28%)"/>`
  + `<circle cx="22" cy="24" r="11" fill="hsl(${(hue + 40) % 360} 70% 62%)"/><path d="M0 50 20 34l12 9 12-10 20 17v14H0z" fill="hsl(${(hue + 180) % 360} 40% 45%)"/></svg>`);
/* thirteen songs as Spotify names the releases (the TV drops the suffixes),
   a long title, two artists, two without a cover; stand-in video ids */
export const KARAOKE_FIT_SONGS = Object.freeze([
  ["Mr. Brightside", ["The Killers"], 222, 20], ["Don't Stop Believin' - 2022 Remaster", ["Journey"], 251, 200],
  ["Total Eclipse of the Heart - 2008 Remaster", ["Bonnie Tyler"], 270, 300], ["I Want It That Way", ["Backstreet Boys"], 213, null],
  ["Bohemian Rhapsody - Remastered 2011", ["Queen"], 354, 0], ["Livin' On A Prayer", ["Bon Jovi"], 249, 220],
  ["Wonderwall - Remastered", ["Oasis"], 258, 120], ["Sweet Caroline", ["Neil Diamond"], 203, 340],
  ["Africa", ["TOTO"], 295, null], ["Hey Ya!", ["OutKast"], 235, 60], ["Since U Been Gone", ["Kelly Clarkson"], 188, 280],
  ["Islands in the Stream", ["Kenny Rogers", "Dolly Parton"], 250, 160], ["Teenage Dirtbag", ["Wheatus"], 241, 30],
].map(([name, artists, seconds, hue], k) => Object.freeze(karaokeSnapshot({
  provider:"spotify", trackId:`fitkaraoke${String(k + 1).padStart(2, "0")}songid00`, name, artists, durationMs:seconds * 1000,
  imageUrl:hue === null ? null : cover(hue),
  video:{ id:`fitKaraoke${(k + 1).toString(36)}`, title:`${name.split(" - ")[0]} (Karaoke Version)`, channel:"Stingray Karaoke", seconds },
  alts:[],
}))));

let serial = 0;
const gm = () => ({ isGm:true, qa:true, progressReset:true, environment:"local", player:"Brandon", deviceId:"fit-karaoke",
  actionId:`karaoke-${++serial}`, showControl:false });
function run(state, type, payload) {
  const result = applyAction(state, type, payload, gm());
  if (!result.ok) throw new Error(`${type}: ${result.error}`);
}
/* Karaoke under way: betting locked and the event started; the game is written below */
function base() {
  const state = structuredClone(EMPTY_STATE);
  run(state, "qaAdvance", { target:"event:karaoke:open", seed:7, confirm:RESET_PROGRESS_CONFIRMATION, confirmPokerLive:true });
  const ev = allEventsOf(state).find(item => item.id === "karaoke");
  const contest = resolveCurrentContest(state, ev);
  run(state, "lockAndStart", { evId:"karaoke", contestId:contest.id, contestRevision:contest.revision, startWeekend:true });
  return state;
}

/* a vote's tier, seeded by voter and singer (FNV-1a), leaning on each
   singer's own night so the scores spread; `legendary` singers draw high */
function tierFor(voter, singer, lean, legendary) {
  let h = 0x811c9dc5;
  for (const ch of `${voter}|${singer}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  if (legendary) return h % 3 === 0 ? 5 : 6;
  return Math.max(1, Math.min(6, lean + (h % 3) - 1));
}
const LEAN = Object.freeze([5, 3, 4, 2, 5, 4, 3, 4, 1, 5, 3, 4, 2]);

/* the game at its pick window */
function pickGame(state, now, startedAt) {
  const id = karaokeGameId("karaoke", startedAt);
  return { id, eventId:"karaoke", startedAt, phase:"pick", pickUntil:startedAt + KARAOKE_PICK_MS, moreTime:0, ready:{}, broken:{},
    order:[], out:[], songs:{}, index:-1, turns:{}, votes:{}, revealAt:null, ranking:null, empty:false, finishedAt:null, ops:{} };
}
/* the window closed `closedAt`: the order drawn, every song copied in */
function drawOrder(state, game, closedAt) {
  const room = presentPlayers(state);
  room.forEach((player, k) => { game.ready[player] = closedAt - 60000 + k * 3000; });
  game.phase = "turns";
  game.order = karaokeOrder(room, game.id);
  game.order.forEach((player, k) => { game.songs[player] = structuredClone(KARAOKE_FIT_SONGS[k % KARAOKE_FIT_SONGS.length]); });
  game.index = 0;
  game.turns = { [game.order[0]]:{ upAt:closedAt + KARAOKE_ORDER_HOLD_MS, songAt:null, endAt:null, closeAt:null, video:0 } };
}
/* singer `k` sings from `upAt`: the walk-up, the song, every voter votes
   during it; closed `closedAt` when given */
function sing(state, game, k, upAt, { closedAt = null, voters = null, legendary = false } = {}) {
  const singer = game.order[k];
  const songAt = upAt + KARAOKE_UP_MS + 1500;
  const turn = { upAt, video:0, ...karaokeSchedule(game.songs[singer], songAt, { video:0 }) };
  const room = presentPlayers(state).filter(player => player !== singer);
  const voting = voters ?? room;
  game.votes[singer] = Object.fromEntries(voting.map((voter, i) => [voter,
    { tier:tierFor(voter, singer, LEAN[k % LEAN.length], legendary), at:songAt + 30000 + i * 7000 }]));
  if (closedAt !== null) Object.assign(turn, { closedAt, legendary:karaokeLegendary(game.votes[singer]) });
  game.turns[singer] = turn;
  return turn;
}
/* a whole turn: the walk-up, the song's lead, the song, and the vote
   closing 12 s after it (everyone in) */
const turnMs = (game, i) => KARAOKE_UP_MS + 1500 + karaokeSongMs(game.songs[game.order[i]], { video:0 }) + 12000;
/* the singers before `k` sang and closed, back to back, ending at `until` */
function sungBefore(state, game, k, until, { legendaryAt = -1 } = {}) {
  let at = until;
  const turns = [];
  for (let i = k - 1; i >= 0; i--) {
    at -= turnMs(game, i);
    turns.unshift([i, at, at + turnMs(game, i)]);
  }
  turns.forEach(([i, upAt, closedAt]) => sing(state, game, i, upAt, { closedAt, legendary:i === legendaryAt }));
}

export function karaokeStage(stage, { now = Date.now(), project = true } = {}) {
  const state = base();
  const room = presentPlayers(state);
  let game;
  if (stage === "pick") {
    game = pickGame(state, now, now - 40000);
    room.slice(0, 8).forEach((player, k) => { game.ready[player] = game.startedAt + 6000 + k * 3500; });
  } else {
    /* the window closed well before the moment, unless the moment is the deal */
    const closedAt = stage === "order" ? now - 3000 : now - 30 * 60000;
    game = pickGame(state, now, closedAt - KARAOKE_PICK_MS + 20000);
    drawOrder(state, game, closedAt);
    if (stage === "order") {
      /* the deal: nothing else yet */
    } else if (stage === "reveal-mid" || stage === "reveal-podium") {
      sungBefore(state, game, game.order.length, now - 60000, { legendaryAt:4 });
      game.phase = "reveal";
      game.index = game.order.length - 1;
      game.ranking = karaokeRanking(game);
      const steps = karaokeRevealSchedule(game.ranking).steps;
      /* reveal-mid: 6th just stamped; reveal-podium: 1st 1.6 s in */
      const step = stage === "reveal-mid" ? steps.find(item => item.place === 6) : steps[steps.length - 1];
      game.revealAt = now - step.at - (stage === "reveal-mid" ? 600 : 1600);
    } else {
      /* the third singer's turn */
      const k = 2;
      game.index = k;
      if (stage === "legendary") {
        /* the second singer's vote closed Legendary 0.9 s ago: the third is up once the rain is done */
        const closedAt = now - 900, upAt = closedAt - turnMs(game, 1);
        sungBefore(state, game, 1, upAt);
        sing(state, game, 1, upAt, { closedAt, legendary:true });
        game.turns[game.order[k]] = { upAt:closedAt + KARAOKE_LEGENDARY_MS, songAt:null, endAt:null, closeAt:null, video:0 };
      } else if (stage === "up") {
        const upAt = now - 4000;
        sungBefore(state, game, k, upAt);
        game.turns[game.order[k]] = { upAt, songAt:null, endAt:null, closeAt:null, video:0 };
      } else {
        const singer = game.order[k];
        if (stage === "practice") game.songs[singer] = structuredClone(KARAOKE_PRACTICE_SONGS[2]);
        const length = karaokeSongMs(game.songs[singer], { video:0 });
        /* singing: 50 s in (a practice song 12 s in); voting: the song ended 8 s ago */
        const into = stage === "voting" ? length + 8000 : stage === "practice" ? 12000 : 50000;
        const songAt = now - into;
        const upAt = songAt - KARAOKE_UP_MS - 1500;
        sungBefore(state, game, k, upAt);
        const voters = room.filter(player => player !== singer);
        const turn = sing(state, game, k, upAt, { voters:voters.slice(0, stage === "voting" ? 8 : 4) });
        /* the votes landed during the song, before the moment */
        Object.values(game.votes[singer]).forEach((vote, i) => { vote.at = Math.min(now - 1000, songAt + 4000 + i * 6000); });
        if (stage === "failed") turn.failed = 150;
      }
    }
  }
  state.karaoke = game;
  if (project) state.karaoke = projectKaraoke(state, null);
  state.updatedAt = now;
  return state;
}
