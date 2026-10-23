/* Karaoke on the phone (docs/KARAOKE.md): the screen by phase, turn and
   role; when the sheet opens by itself (once per moment, for players who
   are here, never the vote for its singer); songs never shown before their
   turn on any surface, the commissioner's included; the vote's single
   flight (the newest tap wins, the lit tier never flickers back); the
   reveal held to the TV's instants; Home's row and headline; the singer's
   own You're up; the "You're up next" pocket alert; the commissioner's
   tray; the copy. The real components render over games built from the
   contract (dev/fit/karaokePhoneFixtures.js) through the real projection. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { ROSTER } from "../shared/core.js";
import {
  KARAOKE_LEGENDARY_MS, KARAOKE_RESTART_CONFIRM, KARAOKE_TIERS, KARAOKE_UP_MS, karaokeAutoBeat, karaokeRevealAt, karaokeSchedule,
  karaokeSkipConfirm, projectKaraoke,
} from "../shared/karaoke.js";
import { publicState } from "../worker/publicState.js";
import { alertsFor } from "../worker/pushAlerts.js";
import { KARAOKE_FIT_ORDER, KARAOKE_FIT_VIEWER, karaokePhoneStage } from "../dev/fit/karaokePhoneFixtures.js";
import {
  clockText, karaokeHomeLine, karaokeOpenKey, karaokeScreen, karaokeSongAhead, karaokeTray, karaokeView, karaokeYou,
  nextKaraokeInstant, singerUpKey, singerUpMoment, tierPaint,
} from "../src/features/karaoke/karaokeModel.js";
import { voteFlight } from "../src/features/karaoke/voteFlight.js";
import { deriveYouStrip } from "../src/features/home/homeModel.js";
import { UP_TIMING } from "../src/features/moments/youreUp.js";
import * as pocket from "../src/features/alerts/pocketAlerts.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
/* the server renderer's note about layout effects */
const say = console.error;
console.error = (...args) => /useLayoutEffect/.test(String(args[0])) ? undefined : say(...args);

const NOW = 1_900_000_000_000;
const ME = KARAOKE_FIT_VIEWER;
const stage = (name, now = NOW) => karaokePhoneStage(name, { now });
/* a phone's frame as the Worker sends it, the game projected for its viewer */
const phone = (state, player = ME, { gm = false } = {}) => ({ ...publicState(state, { player, isGm:gm }), karaoke:projectKaraoke(state, player) });
const view = (state, player = ME, now = NOW) => karaokeView(phone(state, player), player, now);
const away = (state, player) => ({ ...state, away:{ ...(state.away || {}), [player]:{ at:1 } } });
/* the song's own write, as karaokeStartSong makes it */
const startSong = (state, songAt) => {
  const game = state.karaoke, singer = game.order[game.index];
  Object.assign(game.turns[singer], karaokeSchedule(game.songs[singer], songAt));
  return state;
};
const at = (index) => KARAOKE_FIT_ORDER[index];
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

/* ── the screen ── */
test("the phone's screen follows the phase, the turn and who it is for", () => {
  assert.equal(karaokeScreen(view(stage("pick"))), "pick");
  assert.equal(karaokeScreen(view(stage("pick-none"))), "pick");
  assert.equal(karaokeScreen(view(stage("pick-broken"))), "pick");
  assert.equal(view(stage("pick-broken")).broken, true, "a failed video asks for another song");
  assert.equal(view(stage("pick")).broken, false);
  assert.equal(karaokeScreen(view(stage("pick-locked"))), "pick-locked");
  assert.equal(karaokeScreen(view(away(stage("pick"), ME))), "pick-watch", "away: the room, no picking");
  assert.equal(karaokeScreen(view(stage("up"))), "up", "your walk-up");
  assert.equal(karaokeScreen(view(stage("up"), "Evan")), "up-watch", "everyone else's");
  assert.equal(karaokeScreen(view(stage("singing"))), "singing", "your song: no vote");
  assert.equal(karaokeScreen(view(stage("singing"), "Evan")), "vote", "everyone else votes while you sing");
  assert.equal(karaokeScreen(view(stage("up-watch"))), "up-watch");
  assert.equal(karaokeScreen(view(stage("vote"))), "vote");
  assert.equal(karaokeScreen(view(stage("voted"))), "vote");
  assert.equal(view(stage("voted")).myVote, 5, "your own vote, from the frame's `mine`");
  assert.equal(karaokeScreen(view(stage("closing"))), "vote-closing", "the song over, the vote still open");
  assert.equal(karaokeScreen(view(stage("closed"))), "vote-closed");
  assert.equal(karaokeScreen(view(away(stage("vote"), ME))), "up-watch", "away: no vote");
  assert.equal(karaokeScreen(view(stage("vote"), "Ben")), "vote", "a player who sat out still votes");
  const legendary = stage("legendary");
  assert.equal(karaokeScreen(view(legendary)), "legendary", "your turn closed Legendary");
  assert.equal(karaokeScreen(view(legendary, at(4))), "up", "the next singer is up after the rain");
  assert.equal(karaokeScreen(view(legendary, "Evan")), "up-watch");
  assert.equal(karaokeScreen(view(legendary, ME, legendary.karaoke.turns[ME].closedAt + KARAOKE_LEGENDARY_MS)), "up-watch",
    "the stamp holds for the rain, then the next singer");
  assert.equal(karaokeScreen(view(stage("reveal"))), "reveal");
  assert.equal(karaokeView({ karaoke:null }, ME, NOW), null, "no game, no view");
  const posted = stage("reveal");
  posted.results = { ...posted.results, karaoke:{ slots:[[at(6)]] } };
  assert.equal(karaokeScreen(view(posted)), null, "nothing once the result posts");
});

/* ── when it opens by itself ── */
test("the sheet opens by itself once per moment, only for players who are here, never the vote for its singer", () => {
  const pick = stage("pick");
  const key = (state, player = ME, now = NOW) => karaokeOpenKey(view(state, player, now), now);
  assert.equal(key(pick), `pick:${pick.karaoke.id}`);
  const locked = stage("pick-locked");
  assert.equal(key(locked), `pick:${locked.karaoke.id}`, "locking in keeps the window's one key");
  assert.equal(key(away(pick, ME)), null, "the absent never");

  /* the singer: one key from the walk-up through the song and its vote */
  const s = stage("up");
  const game = s.karaoke, id = game.id, index = game.index;
  assert.equal(at(index), ME);
  assert.equal(key(s), `turn:${id}:${index}:${ME}`);
  startSong(s, NOW + 1500);
  const { songAt, endAt, closeAt } = game.turns[ME];
  for (const now of [songAt, songAt + 60000, endAt, closeAt - 1]) assert.equal(key(s, ME, now), `turn:${id}:${index}:${ME}`);
  for (const now of [songAt, endAt]) assert.ok(!String(key(s, ME, now)).startsWith("vote"), "never the vote for its singer");

  /* a voter: from the song's start, and again at its end if they had not voted by then */
  const voter = "Evan";
  assert.equal(key(s, voter, NOW), null, "the walk-up waits for the song");
  assert.equal(key(s, voter, songAt - 1), null);
  assert.equal(key(s, voter, songAt), `vote:${id}:${index}:${ME}`);
  assert.equal(key(s, voter, endAt - 1), `vote:${id}:${index}:${ME}`);
  assert.equal(key(s, voter, endAt), `vote-end:${id}:${index}:${ME}`, "the song over and no vote yet: once more");
  game.votes[ME] = { [voter]:{ tier:4, at:songAt + 20000 } };
  assert.equal(key(s, voter, endAt), `vote:${id}:${index}:${ME}`, "voted during the song: no second opening");
  game.votes[ME] = { [voter]:{ tier:4, at:endAt + 1000 } };
  assert.equal(key(s, voter, endAt + 2000), `vote-end:${id}:${index}:${ME}`, "a vote after the end keeps its key: voting never closes the sheet");
  assert.equal(key(away(s, voter), voter, songAt), null, "an absent voter is never opened");

  /* Legendary: the singer's own stamp has its own key */
  const legendary = stage("legendary");
  assert.equal(key(legendary), `legendary:${legendary.karaoke.id}:${KARAOKE_FIT_ORDER.indexOf(ME)}:${ME}`);
  /* the reveal: one key for all of it */
  const reveal = stage("reveal");
  const revealAt = reveal.karaoke.revealAt;
  assert.equal(key(reveal), `reveal:${reveal.karaoke.id}`);
  assert.equal(key(reveal, ME, revealAt + 60000), `reveal:${reveal.karaoke.id}`);
  assert.equal(key(reveal, "Ben"), `reveal:${reveal.karaoke.id}`, "a player who sat out sees the results too");
  reveal.results = { ...reveal.results, karaoke:{ slots:[[at(6)]] } };
  assert.equal(key(reveal), null, "posted: closed for good");
});

test("the phone wakes on the game's own instants, never ticking through a song", () => {
  const vote = stage("vote");
  const turn = vote.karaoke.turns[at(4)];
  assert.equal(nextKaraokeInstant(vote.karaoke, NOW), turn.endAt, "mid-song, the next wake is the song's end");
  assert.equal(nextKaraokeInstant(vote.karaoke, turn.endAt), turn.closeAt);
  /* a whole song, start to end: no wake in between */
  const wakes = [];
  for (let now = turn.songAt; now < turn.endAt; now = nextKaraokeInstant(vote.karaoke, now)) wakes.push(now);
  assert.deepEqual(wakes, [turn.songAt]);
  /* the walk-up's end is a wake (a closed turn's scheduled close may be one too: a spare render, never a tick) */
  const up = stage("up");
  const walkEnd = up.karaoke.turns[ME].upAt + KARAOKE_UP_MS;
  let now = NOW, steps = 0;
  while (now < walkEnd && steps++ < 5) now = nextKaraokeInstant(up.karaoke, now);
  assert.equal(now, walkEnd);
  assert.ok(steps <= 2);
  const pick = stage("pick");
  assert.equal(nextKaraokeInstant(pick.karaoke, NOW), pick.karaoke.pickUntil);
  const sheet = read("src/features/karaoke/KaraokePlay.jsx") + read("src/features/karaoke/KaraokeHome.jsx");
  assert.doesNotMatch(sheet, /setInterval/, "no interval: the clock wakes on instants, a countdown ticks itself alone");
  assert.equal(clockText(84000), "1:24");
  assert.equal(clockText(13001), "14");
  assert.equal(clockText(-5), "0");
});

/* ── secrecy ── */
test("a song shows only once its singer is up, or to its owner, on every surface, the commissioner's included", async () => {
  const { React, wrap, KaraokeSheet, KaraokeHome } = await components();
  const later = KARAOKE_FIT_ORDER.slice(5);
  const titles = player => karaokePhoneStage("vote", { now:NOW }).karaoke.songs[player].name;
  const unsung = later.map(titles);
  /* the commissioner's raw frame carries every song: none may show early */
  for (const name of ["pick", "up", "up-watch", "vote", "closing"]) {
    const raw = stage(name);
    const gmFrame = { ...raw };
    const v = karaokeView(gmFrame, "Brandon", NOW);
    for (const player of later.filter(player => player !== "Brandon")) assert.equal(v.songOf(player), null, `${name}: ${player}'s song stays hidden`);
    const html = wrap(gmFrame, React.createElement(KaraokeSheet, { state:gmFrame, me:"Brandon", gm:true, now:NOW, initiallyOpen:true }))
      + wrap(gmFrame, React.createElement(KaraokeHome, { state:gmFrame, me:"Brandon", now:NOW, onOpen() {} }));
    for (const title of unsung.filter(title => title !== titles("Brandon"))) assert.ok(!html.includes(title.replace(/'/g, "&#x27;")),
      `${name}: "${title}" is not on the commissioner's phone`);
    const strip = deriveYouStrip({ state:gmFrame, me:"Brandon" });
    for (const title of unsung) assert.ok(!JSON.stringify(strip || {}).includes(title));
  }
  /* the pick window: your own song only (your profile's), nobody else's */
  const pick = view(stage("pick"));
  assert.equal(pick.mySong.name, "Bohemian Rhapsody - Remastered 2011");
  assert.ok(KARAOKE_FIT_ORDER.filter(player => player !== ME).every(player => pick.songOf(player) === null));
  /* mid-game: every song up to the current turn, and your own */
  const vote = view(stage("vote"), "Adi");
  assert.equal(vote.songOf(at(4)).name, titles(at(4)));
  assert.equal(vote.songOf(at(0)).name, titles(at(0)));
  assert.equal(vote.songOf("Adi").name, titles("Adi"), "your own, before your turn");
  assert.equal(vote.songOf("Brandon"), null);
  /* the frame itself: projectKaraoke sends nobody a later song, nor anyone's tier but their own */
  const frame = phone(stage("vote"), "Adi");
  assert.deepEqual(Object.keys(frame.karaoke.songs).sort(), [...KARAOKE_FIT_ORDER.slice(0, 5), "Adi"].sort());
  assert.ok(!JSON.stringify(frame.karaoke).includes("\"tier\""), "no tier rides a frame");
});

/* ── the vote ── */
test("the vote: one write in the air, the newest tap wins, and the lit tier never flickers back on an older echo", async () => {
  const sent = [], answer = [];
  let heard = null;
  const flight = voteFlight({ send:tier => new Promise(resolve => { sent.push(tier); answer.push(resolve); }),
    update:snap => { heard = snap; }, initial:null });
  flight.tap(4);
  assert.deepEqual(sent, [4]);
  assert.equal(flight.lit(), 4, "lit at once");
  flight.tap(6);
  flight.tap(5);
  assert.deepEqual(sent, [4], "one write in the air");
  assert.equal(flight.lit(), 5, "the newest tap is lit");
  flight.echo(4);
  assert.equal(flight.lit(), 5, "an older echo never lights an older tier");
  answer[0]({ ok:true });
  await tick();
  assert.deepEqual(sent, [4, 5], "then the newest alone, never the one in between");
  flight.echo(4);
  assert.equal(flight.lit(), 5);
  answer[1]({ ok:true });
  await tick();
  flight.echo(5);
  assert.equal(flight.lit(), 5);
  assert.equal(heard.pending, null, "settled on the frame's own tier");
  flight.tap(5);
  await tick();
  assert.deepEqual(sent, [4, 5], "the tier you have already: nothing sent");
  /* a refusal: the frame's tier again, beside the server's reason */
  flight.tap(2);
  answer[2]({ ok:false, error:"The vote is closed" });
  await tick();
  assert.equal(flight.lit(), 5);
  assert.equal(heard.error, "The vote is closed");
  /* an unanswered write holds its tier until the transport settles it */
  let settle = null;
  flight.tap(3);
  answer[3]({ ok:false, uncertain:true, settled:new Promise(resolve => { settle = resolve; }) });
  await tick();
  assert.equal(flight.lit(), 3);
  flight.echo(5);
  assert.equal(flight.lit(), 3, "a frame from before it landed");
  settle({ ok:false, error:"Not applied" });
  await tick();
  assert.equal(flight.lit(), 5, "not applied: the frame's tier again");
  /* one that did land holds */
  flight.tap(6);
  answer[4]({ ok:false, uncertain:true, settled:Promise.resolve({ ok:true }) });
  await tick(); await tick();
  assert.equal(flight.lit(), 6);
  assert.equal(flight.state().server, 6);
});

test("the vote's six: painted inserts, yours lit, closed at its close, never on the singer's phone", async () => {
  const { React, wrap, KaraokeSheet } = await components();
  const sheet = (state, player = ME, extra = {}) => {
    const s = phone(state, player);
    return wrap(s, React.createElement(KaraokeSheet, { state:s, me:player, now:NOW, onAct:async () => ({ ok:true }), ...extra }));
  };
  const vote = sheet(stage("vote"));
  assert.match(vote, /fd-karaoke-game is-vote/);
  assert.equal((vote.match(/<button type="button" class="fd-karaoke-tier/g) || []).length, KARAOKE_TIERS.length);
  KARAOKE_TIERS.forEach(tier => assert.ok(vote.includes(`>${tier.name}</span>`), tier.name));
  assert.match(vote, /--tier:var\(--tier-1\)/);
  assert.match(vote, /--tier:var\(--tier-6\);--tier-text:var\(--tier-6-ink\)/, "Legendary's gold takes the dark ink");
  assert.doesNotMatch(vote, /aria-pressed="true"/, "nothing lit before you vote");
  const voted = sheet(stage("voted"));
  assert.match(voted, /class="fd-karaoke-tier is-amazing is-mine" aria-pressed="true"/, "your Amazing, lit in the filament");
  const closed = sheet(stage("closed"));
  assert.match(closed, />Vote closed</);
  assert.equal((closed.match(/class="fd-karaoke-tier[^"]*" aria-pressed="[a-z]+" disabled=""/g) || []).length, KARAOKE_TIERS.length);
  assert.match(sheet(stage("closing")), /fd-karaoke-drain/, "the grace drains to the close");
  for (const name of ["up", "singing"]) assert.doesNotMatch(sheet(stage(name)), /fd-karaoke-tier/, `${name}: the singer never votes`);
  assert.match(sheet(stage("singing")), />Singing</);
  assert.match(sheet(stage("up")), />You’re up</);
  assert.deepEqual(tierPaint(KARAOKE_TIERS[2]), { color:"var(--tier-3)", ink:"var(--tier-ink)" });
});

/* ── the sheet's screens ── */
test("the sheet: the pick window, the walk-ups, Legendary, the absent and the posted result", async () => {
  const { React, wrap, KaraokeSheet } = await components();
  const sheet = (state, player = ME, extra = {}) => {
    const s = phone(state, player);
    return wrap(s, React.createElement(KaraokeSheet, { state:s, me:player, now:NOW, onAct:async () => ({ ok:true }), ...extra }));
  };
  const pick = sheet(stage("pick"));
  assert.match(pick, /fd-karaoke-game is-pick/);
  assert.match(pick, />Pick your song</);
  assert.match(pick, />Bohemian Rhapsody</, "your song, its release suffix dropped");
  assert.match(pick, />Keep</);
  assert.match(pick, />Change</);
  assert.match(pick, /role="timer"[^>]*>1:24</, "the seconds left");
  assert.match(pick, /fd-karaoke-drain/);
  assert.match(sheet(stage("pick-none")), /data-placeholder="karaoke-song-picker"|fd-song-search/, "no song yet: the picker");
  const broken = sheet(stage("pick-broken"));
  assert.match(broken, />Pick another song</);
  assert.doesNotMatch(broken, />Keep</, "a song whose video failed cannot be kept");
  const locked = sheet(stage("pick-locked"));
  assert.match(locked, />Locked in</);
  assert.doesNotMatch(locked, />Keep</);
  assert.equal((pick.match(/<li class="is-lit/g) || []).length, 6, "the room's chips light as each locks in");
  assert.match(sheet(stage("up")), /Singer 4 of 12/);
  assert.equal(sheet(stage("up"), at(4)), "", "a voter's sheet waits for the song");
  assert.equal(sheet(stage("up-watch")), "", "someone else's walk-up waits for the song");
  assert.match(sheet(stage("up-watch"), ME, { initiallyOpen:true }), />Up next</, "Home's row opens it");
  assert.match(sheet(stage("legendary")), /fd-karaoke-legendary/);
  /* the absent: opened from Home only */
  assert.equal(sheet(away(stage("vote"), ME)), "");
  assert.match(sheet(away(stage("vote"), ME), ME, { initiallyOpen:true }), /fd-karaoke-game is-up-watch/);
  assert.equal(sheet(away(stage("pick"), ME)), "");
  assert.match(sheet(away(stage("pick"), ME), ME, { initiallyOpen:true }), /fd-karaoke-room is-big/);
  /* posted: gone, so the chip receipt docks */
  const posted = stage("reveal");
  posted.results = { ...posted.results, karaoke:{ slots:[[at(6)]] } };
  assert.equal(sheet(posted), "");
  assert.equal(sheet(posted, ME, { initiallyOpen:true }), "");
  /* waiting under any open sheet */
  assert.equal(sheet(stage("vote"), ME, { blocked:true }), "");
});

test("the reveal: each row at the TV's instant, never before; yours lit", async () => {
  const { React, wrap, KaraokeSheet } = await components();
  const s = stage("reveal");
  const v = view(s);
  assert.equal(v.rows.length, KARAOKE_FIT_ORDER.length);
  for (const row of v.rows) {
    const turns = karaokeRevealAt(s.karaoke, row.player);
    assert.equal(view(s, ME, turns - 1).rows.find(item => item.player === row.player).shown, false, `${row.place} held`);
    assert.equal(view(s, ME, turns).rows.find(item => item.player === row.player).shown, true, `${row.place} turned`);
  }
  const shown = v.rows.filter(row => row.shown).map(row => row.place);
  assert.deepEqual(shown, [5, 6, 7, 8, 9, 10, 11, 12], "last place first, eight turned so far");
  assert.equal(nextKaraokeInstant(s.karaoke, NOW), karaokeRevealAt(s.karaoke, v.rows.find(row => row.place === 4).player),
    "the phone wakes on the next row's instant");
  const html = wrap(phone(s), React.createElement(KaraokeSheet, { state:phone(s), me:ME, now:NOW }));
  assert.equal((html.match(/<li class="is-ahead"/g) || []).length, 4);
  const winner = v.rows.find(row => row.place === 1);
  assert.ok(!html.includes(`>${winner.player}<`), "the winner is not on a phone before the TV turns them");
  assert.ok(!html.includes(winner.scoreText) || v.rows.some(row => row.shown && row.scoreText === winner.scoreText));
  assert.match(html, /class="is-shown is-mine"/, "your row, lit");
  assert.match(html, />Results</);
  const end = wrap(phone(s), React.createElement(KaraokeSheet, { state:phone(s), me:ME, now:NOW + 120000 }));
  assert.equal((end.match(/<li class="is-ahead"/g) || []).length, 0, "every row once the reveal is done");
});

/* ── Home ── */
test("Home's row by phase, gone once the result posts; the song row before the game", async () => {
  const { React, wrap, KaraokeHome } = await components();
  const home = (state, player = ME, extra = {}) => {
    const s = phone(state, player);
    return wrap(s, React.createElement(KaraokeHome, { state:s, me:player, now:NOW, onOpen() {}, onSong() {}, ...extra }));
  };
  assert.match(home(stage("pick")), />Pick your song</);
  assert.match(home(stage("pick")), />1:24</);
  assert.match(home(stage("pick-locked")), />Locked in</);
  assert.match(home(stage("up")), />You’re up</);
  assert.match(home(stage("singing")), />Singing</);
  assert.match(home(stage("up-watch")), />Up next: Henry</);
  assert.match(home(stage("vote")), />Henry<\/strong><em[^>]*>Vote</);
  assert.match(home(stage("voted")), /class="is-tier"[^>]*>(?:<span[^>]*><\/span>)?Amazing</, "your tier, in its paint");
  /* the same rows inside Home's Now card (ui/NowRow.jsx) */
  const card = (state, player = ME, extra = {}) => home(state, player, { inCard:true, ...extra });
  /* what the game asks of you is the card's headline (the You strip): no row */
  assert.equal(card(stage("pick")), "", "Pick your song is the strip's");
  assert.equal(card(stage("vote")), "", "Vote is the strip's");
  assert.match(card(stage("voted")), /class="fd-now-row is-live fd-karaoke-now"/);
  assert.match(card(stage("voted")), /class="is-tier">Amazing</, "your tier, in its paint");
  assert.doesNotMatch(card(stage("voted")), /is-primary/, "voted asks nothing");
  assert.match(card(stage("up-watch")), /Singer \d+ of \d+/);
  assert.match(card(stage("ahead"), ME, { karaoke:true }), />Pick a karaoke song</);
  assert.match(home(stage("reveal")), />Results</);
  const posted = stage("reveal");
  posted.results = { ...posted.results, karaoke:{ slots:[[at(6)]] } };
  assert.equal(home(posted), "");
  /* before Lock and start: a song to pick, with the capability on */
  const ahead = stage("ahead");
  assert.equal(karaokeSongAhead(phone(ahead), ME, { karaoke:true })?.id, "karaoke");
  assert.match(home(ahead, ME, { karaoke:true }), />Pick a karaoke song</);
  assert.equal(home(ahead, ME, { karaoke:false }), "", "off without the capability");
  assert.equal(home(ahead, "Evan", { karaoke:true }), "", "nothing once you have a song");
  assert.equal(karaokeHomeLine(phone(stage("vote")), view(stage("vote"))).em, "Vote");
});

test("Home's headline speaks karaoke while the game runs, never a generic You're up for the whole room", () => {
  const strip = (state, player) => deriveYouStrip({ state:phone(state, player), me:player });
  const up = strip(stage("up"), ME);
  assert.equal(up.word, "You’re up");
  assert.deepEqual(up.route, { type:"karaoke", ev:up.route.ev });
  assert.equal(up.route.ev.id, "karaoke");
  assert.equal(strip(stage("singing"), ME).word, "Singing");
  const vote = stage("vote");
  assert.deepEqual([strip(vote, ME).word, strip(vote, ME).line], ["Vote", "Henry"]);
  /* the next singer, once their vote is in */
  vote.karaoke.votes[at(4)][at(5)] = { tier:4, at:NOW - 1000 };
  assert.equal(strip(vote, at(5)).word, "Up next");
  assert.equal(karaokeYou(phone(vote, at(5)), at(5)).word, "Up next");
  /* asked nothing: no karaoke word, and never the generic You're up */
  const voted = stage("voted");
  assert.notEqual(strip(voted, ME)?.word, "You’re up");
  assert.notEqual(strip(stage("up-watch"), ME)?.word, "You’re up");
  assert.equal(strip(stage("pick"), ME).word, "Pick your song");
  assert.equal(strip(stage("pick-locked"), ME).word, "Locked in");
  assert.equal(strip(stage("reveal"), ME).word, "Results");
});

/* ── the singer's own You're up ── */
test("the singer's own You're up: their walk-up only, gone once the song starts or the turn moves", async () => {
  const { React, wrap, SingerUpTakeover, SINGER_UP_MS } = await components();
  const up = stage("up");
  assert.equal(singerUpKey(phone(up), ME), `karaoke:${up.karaoke.id}:${up.karaoke.index}:${ME}`);
  assert.equal(singerUpKey(phone(up, "Evan"), "Evan"), null, "never anyone else's");
  const moment = singerUpMoment(phone(up), ME);
  assert.equal(moment.anchor, up.karaoke.turns[ME].upAt);
  assert.equal(moment.song.name, "Bohemian Rhapsody - Remastered 2011");
  assert.equal(singerUpKey(phone(startSong(structuredClone(up), NOW + 1500)), ME), null, "Start song ends it");
  const later = structuredClone(up);
  later.karaoke.turns[ME].later = true;
  later.karaoke.order = [...later.karaoke.order.filter(player => player !== ME), ME];
  assert.equal(singerUpKey(phone(later), ME), null, "Later moves it");
  /* after a Legendary close the next singer's takeover waits for the rain */
  const legendary = stage("legendary");
  const next = singerUpMoment(phone(legendary, at(4)), at(4));
  assert.equal(next.key, `karaoke:${legendary.karaoke.id}:${legendary.karaoke.index}:${at(4)}`);
  assert.equal(next.anchor, legendary.karaoke.turns[ME].closedAt + KARAOKE_LEGENDARY_MS);
  assert.ok(next.anchor > NOW);
  assert.equal(SINGER_UP_MS, Math.min(UP_TIMING.total, KARAOKE_UP_MS), "the takeover's length, or the walk-up's");
  const html = wrap(phone(up), React.createElement(SingerUpTakeover, { moment:{ ...moment, id:"m1", elapsed:0 }, me:ME }));
  assert.match(html, />You’re up</);
  assert.match(html, />Bohemian Rhapsody</);
  assert.match(html, />Queen</);
  const layer = read("src/features/moments/PhoneMoments.jsx");
  const order = ["if (walkout)", "if (bit.moment)", "if (up?.role === \"player\")", "if (sing)"].map(line => layer.indexOf(line));
  assert.ok(order.every(index => index > 0) && order.every((index, k) => !k || order[k - 1] < index),
    "after the walkout, the bit and the face-off's You're up");
});

/* ── the pocket alert ── */
test("You're up next: the next singer as a song starts, once, never the actor, never a song's name", () => {
  const before = stage("up");
  const after = startSong(structuredClone(before), NOW + 1500);
  const got = alertsFor(before, after);
  assert.deepEqual(got.map(alert => [alert.player, alert.reason]), [[at(4), "sing"]]);
  const [alert] = got;
  assert.equal(alert.key, `sing:${at(4)}:${after.karaoke.id}:${after.karaoke.index}`);
  assert.equal(alert.message.title, "You’re up next");
  assert.equal(alert.message.body, "Karaoke");
  assert.equal(alert.message.url, "/?alert=sing");
  assert.equal(alert.message.topic, "sing");
  assert.doesNotMatch(JSON.stringify(got), /—|!/);
  for (const song of Object.values(after.karaoke.songs)) assert.ok(!JSON.stringify(got).includes(song.name), "no song's name");
  assert.deepEqual(alertsFor(before, after, { actor:at(4) }), [], "never the player who made the write");
  /* once: a later video, a moved end, a retry */
  const swapped = startSong(structuredClone(after), NOW + 30000);
  assert.deepEqual(alertsFor(after, swapped), []);
  assert.deepEqual(alertsFor(after, structuredClone(after)), []);
  /* the next singer away: the next one here hears it */
  const short = away(structuredClone(before), at(4));
  const shortAfter = startSong(structuredClone(short), NOW + 1500);
  assert.deepEqual(alertsFor(short, shortAfter).map(item => item.player), [at(5)]);
  /* silent outside a running game's song start */
  const pick = stage("pick");
  const locked = structuredClone(pick);
  locked.karaoke.ready[ME] = NOW;
  assert.deepEqual(alertsFor(pick, locked), [], "a lock-in owes nothing");
  const walk = stage("up-watch");
  assert.deepEqual(alertsFor(structuredClone(walk), walk), [], "a walk-up owes nothing");
  const posted = structuredClone(after);
  posted.results = { ...posted.results, karaoke:{ slots:[[at(0)]] } };
  assert.deepEqual(alertsFor(before, posted), [], "nothing once the result posts");
  const ahead = stage("ahead");
  assert.deepEqual(alertsFor(ahead, structuredClone(ahead)), [], "no game: nothing");
  /* the phone accepts it */
  assert.ok(pocket.ALERT_REASONS.includes("sing"));
  assert.deepEqual(pocket.alertRoute("/?alert=sing"), { reason:"sing", ev:null });
  const app = read("src/App.jsx");
  assert.match(app, /route\.reason === "sing"\) \{ setModal\(null\); setTab\("board"\); setKaraokeForce\(n => n \+ 1\); return true; \}/);
});

/* ── the commissioner ── */
test("the commissioner's tray: the pill's beat and its moves, the same writes, his own sheet only", async () => {
  const { React, wrap, KaraokeSheet } = await components();
  const tray = (state, now = NOW) => karaokeTray(phone(state, "Brandon", { gm:true }), view(state, "Brandon", now), now);
  const vote = stage("vote");
  const items = tray(vote);
  assert.deepEqual(items.map(item => item.label), ["Close vote", "End song", "Next video", "Skip Henry"]);
  assert.deepEqual(items.map(item => item.type), ["karaokeNext", "karaokeEndSong", "karaokeNextVideo", "karaokeSkip"]);
  assert.deepEqual(items[0].payload, karaokeAutoBeat(vote).payload, "the beat is the autopilot's own write");
  assert.deepEqual(items[1].payload, { gameId:vote.karaoke.id, index:vote.karaoke.index });
  assert.deepEqual(tray(stage("pick")).map(item => item.label), ["Start singing", "More time", "Restart"]);
  assert.deepEqual(tray(stage("pick")).at(-1).payload, { gameId:stage("pick").karaoke.id, confirm:true });
  assert.deepEqual(tray(stage("up")).map(item => item.label), ["Start song", "Later", "Next video", `Skip ${ME}`]);
  assert.deepEqual(tray(stage("closing")).map(item => item.label), ["Close vote", "Skip Henry"]);
  /* Restart and Skip throw something away: the sheet's tray asks first, in the pill's words */
  assert.equal(tray(stage("pick")).at(-1).confirm, KARAOKE_RESTART_CONFIRM);
  assert.equal(items.at(-1).confirm, karaokeSkipConfirm("Henry"));
  assert.ok(items.slice(0, -1).every(item => !item.confirm), "the beat and the plain moves never ask");
  assert.match(read("src/features/karaoke/KaraokePlay.jsx"), /item\.confirm && typeof window !== "undefined" && !window\.confirm\(item\.confirm\)/);
  const g = phone(vote, "Brandon", { gm:true });
  assert.match(wrap(g, React.createElement(KaraokeSheet, { state:g, me:"Brandon", gm:true, now:NOW })), /aria-label="Commissioner"/);
  const guest = phone(vote, ME);
  assert.doesNotMatch(wrap(guest, React.createElement(KaraokeSheet, { state:guest, me:ME, now:NOW })), /aria-label="Commissioner"/);
});

/* ── wiring and copy ── */
test("App mounts the game beside Trivia's, waits on modals, and Home's row and strip reopen it", () => {
  const app = read("src/App.jsx");
  assert.match(app, /\{me && <KaraokeSheet state=\{state\} me=\{me\} blocked=\{!!modal\} force=\{karaokeForce\} gm=\{gmView\}/);
  /* a row of Home's Now card, beside Where and When's and Trivia's */
  assert.match(app, /<KaraokeHome state=\{state\} me=\{me\} inCard karaoke=\{capabilities\.karaoke === true\} onOpen=\{\(\) => setKaraokeForce\(n => n \+ 1\)\}/);
  assert.ok(app.indexOf("<TriviaHome state={state} me={me} inCard") < app.indexOf("<KaraokeHome"), "inside gameContent, after Trivia's");
  assert.match(app, /onKaraoke=\{\(\) => setKaraokeForce\(n => n \+ 1\)\}/);
  assert.ok(app.indexOf("<TriviaPlaySheet") < app.indexOf("<KaraokeSheet"));
  const home = read("src/features/home/GuestHome.jsx");
  assert.match(home, /route\.type === "karaoke" && onKaraoke \? onKaraoke\(\)/);
  assert.match(home, /event\.game !== "karaoke" \? yourSongLine/, "no win-song line on karaoke");
});

test("copy and paint: terse labels, no em dash or exclamation, the curly apostrophe, tokens only", async () => {
  const { React, wrap, KaraokeSheet, KaraokeHome } = await components();
  const files = ["src/features/karaoke/KaraokePlay.jsx", "src/features/karaoke/KaraokeHome.jsx", "src/features/karaoke/karaokeModel.js",
    "src/features/karaoke/singerUp.js", "src/features/karaoke/KaraokeClock.jsx", "src/features/karaoke/voteFlight.js"];
  for (const file of files) {
    const src = read(file);
    assert.doesNotMatch(src, /—/, `${file}: no em dash`);
    assert.doesNotMatch(src, /You're/, `${file}: the curly apostrophe`);
  }
  /* every rendered word, the songs' own titles aside */
  const songs = Object.values(stage("reveal").karaoke.songs).flatMap(song => [song.name, ...song.artists]);
  for (const name of ["pick", "pick-broken", "pick-locked", "up", "singing", "up-watch", "legendary", "vote", "voted", "closing", "closed", "reveal"]) {
    const s = phone(stage(name));
    let text = wrap(s, React.createElement(KaraokeSheet, { state:s, me:ME, now:NOW, initiallyOpen:true }))
      + wrap(s, React.createElement(KaraokeHome, { state:s, me:ME, now:NOW, onOpen() {} }));
    text = text.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
    for (const song of songs) text = text.split(song).join(" ");
    assert.doesNotMatch(text, /—|!/, `${name}: no em dash, no exclamation`);
  }
  const css = read("src/features/karaoke/karaoke.css");
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(css) && !/rgba?\(/.test(css), "tokens only");
  assert.doesNotMatch(css, /color:\s*var\(--clay\)/, "clay text is --clay-text");
  for (let k = 1; k <= KARAOKE_TIERS.length; k++) assert.ok(read("src/ui/experience.css").includes(`--tier-${k}:`), `--tier-${k}`);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.ok(ROSTER.includes(ME));
});

/* ── the real components ── */
let ui = null;
async function components() {
  if (ui) return ui;
  const { buildSync } = await import("esbuild");
  const { Module } = await import("node:module");
  const React = (await import("react")).default;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const out = buildSync({ stdin:{ contents:[
    'export { KaraokeSheet } from "./src/features/karaoke/KaraokePlay.jsx";',
    'export { KaraokeHome } from "./src/features/karaoke/KaraokeHome.jsx";',
    'export { SingerUpTakeover } from "./src/features/moments/PhoneMoments.jsx";',
    'export { SINGER_UP_MS } from "./src/features/karaoke/singerUp.js";',
    'export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";'].join("\n"),
  resolveDir:ROOT, loader:"jsx" }, bundle:true, platform:"node", format:"cjs", external:["react", "react-dom", "qrcode-generator", "three"],
  loader:{ ".css":"empty" }, write:false, logLevel:"silent" });
  const mod = new Module(fileURLToPath(new URL("karaoke-phone.cjs", import.meta.url)));
  mod.filename = mod.id; mod.paths = Module._nodeModulePaths(ROOT);
  mod._compile(out.outputFiles[0].text, mod.filename);
  const wrap = (s, node) => renderToStaticMarkup(React.createElement(mod.exports.PlayerIdentityProvider, { profiles:s.profiles || {} }, node));
  ui = { ...mod.exports, React, wrap };
  return ui;
}
