/* Every rules word the app shows, in one place, one line each. Brandon edits
   a label by changing its string; the drawing beside it lives in
   gameSteps.js / RulePictures.jsx and never needs touching. A label is 2 to
   4 words: the picture carries the rest. Review page: /dev/rules-review.html
   (lists every key below with its drawing).

   Key shape: "<set>.<step number>" for a step, "<set>.<note>" for a note
   (a variant, house rule or tie that changes play). Sets are GAMES ids
   (shared/core.js), "basketball:<variant>", and the weekend's own rules
   (fieldday, betting, duels, draws, safety, payouts).

   STATUS: reviewed by Brandon on /dev/rules-review.html (Oct 3, 2026); his one
   edit (safety.camera) is applied. The comebacks set (comebacks.*, v3.1) is
   awaiting Brandon's review. */
export const RULES_WORDS = Object.freeze({
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

  /* comebacks (v3.1): awaiting Brandon's review */
  "comebacks.1": "Beat the leader: +200",
  "comebacks.2": "Underdog: Winner pays 2:1",
  "comebacks.gap": "Underdog: 1,000 behind",
  "comebacks.3": "Byes to the bottom",
  "comebacks.lock": "Leader fixed at lock",

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
  "payouts.crown": "Tied champions: one putt",
});

/* the titles the Rules sheet sets under */
export const RULES_TITLES = Object.freeze({
  fieldday: "Field Day",
  betting: "Betting",
  duels: "Duels",
  draws: "Draws",
  comebacks: "Comebacks",
  safety: "House rules",
  payouts: "Payouts",
});

/* the word for a key; a missing key shows itself so the review page flags it */
export const ruleWord = key => RULES_WORDS[key] ?? key;
