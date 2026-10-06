# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

An installable PWA used almost entirely on iPhones (all guests), plus one shared TV in the house rendered on a fixed 1920x1080 canvas. Android-only work is out of scope.

## Users

- **Guests (primary).** 13 friends at a bachelor party weekend, Scottsdale, October 30 to November 1, 2026. Between and during games they glance at their phone for ten seconds: what is on now, am I playing, where do I stand, what did my bets do. Nearly all have already checked in; the design target is a returning guest opening the app after an update, not a first-run user. When phone, TV and commissioner needs conflict, the guest's phone wins.
- **Commissioners.** Brandon (the groom and organizer) and his best men run the weekend from the same app: announce events, draw teams, lock betting, record winners, correct results, run the poker finale. They play too.
- **The room.** Everyone in the house watching the TV together: draws, face-offs, results, standings, the crown.

## Product Purpose

Field Day turns a weekend of bar and backyard games into one tournament with one leaderboard. Everyone starts with 1,000 chips; event placings, wagers on the current contest, duels and rulings move them; whatever a player holds Saturday night is the stack they are dealt for the poker finale, and the chip leader after poker is champion.

Success for the weekend:

- **Nobody has to ask.** Any guest knows their next game, their assignment, their chips and the full standings at a glance.
- **Moments land in the room.** Draws, results, songs and the crown play as shared events on the TV and on phones at the same time.
- **Nothing breaks or is lost.** No lost bets, wrong payouts, or wiped guest data; production holds real answers people plan around.

## Positioning

A private, single-occasion game companion where the whole economy is real poker chips from the first minute: one chip unit (100) is one physical chip, so the number on the board is literally the stack dealt at the finale and nobody does arithmetic. One server is the only authority, so every phone and the TV show the same moment on the same clock.

## Operating Context

- A rented house in Scottsdale over three days, Friday arrival to Sunday departure. Sessions: Friday, Saturday morning, Saturday afternoon, Saturday night, and the poker finale.
- The slate: Long Putt, Beer Die Doubles, Where and When (Fri); 5v5, Pickleball Doubles, 1v1 Basketball (Sat AM); Volleyball, Trivia, 8-Ball, Beer Pong (Sat PM/night); Rage Cage, Beerio Kart; poker. Some are drinking games; Trivia and Where and When are played in the app.
- Phones are pulled out mid-game, outdoors in sun, at night, one-handed, often while holding a drink. The TV runs unattended in the living room as the constant status display.
- Commissioners operate while also playing; routine running happens through a single next-action pill.
- Before the weekend, the app is the invitation (sent months out) and collects what organizing needs: names, numbers, shirt and jersey details, flights, Venmo, drinking, food needs, photos, win songs.
- After the board freezes, the edition is kept as a keepsake: final cards, plates per event, awards, photos.

## Capabilities and Constraints

- Four stable guest areas: Home, Events, Bets, Weekend. Home always shows the full 13-player leaderboard. Profiles, player cards and event details open as sheets. Commissioner controls stay separate from guest navigation.
- Real-time over WebSocket from one Cloudflare Durable Object; clients never write state. Settlement, standings, draws, brackets and lifecycle are derived in one shared module; the server is always right.
- Betting is on the current contest only, placed as chips directly on the board (roulette-style): a fixed rack of 100/200/500/1000, place and retract the last chip. Payouts read "Winner pays 1:1" or "Winner pays 2:1". At-risk cap is half your stack.
- Supporting systems already shipped: draws and captains' snake drafts, brackets and heats, duels and Quick Draw, awards night ballots, Where and When (live photo geo game), photo desk, win songs over Spotify, Web Push alerts, synthesized sound, haptics, the poker table with blind clock.
- Production holds real guest data. A redesign never resets guests, claims, answers or completion markers, and never requires completed setup again.
- Terminology: chips (not points), stack, blinds, bust, draw, heats, bracket, on deck, crew, commissioner, Win song, Away.
- This weekend first: decisions serve October 30 to November 1, 2026. The identity is built to carry future editions (edition facts live in one place), but nothing is traded away now for a hypothetical future one.

## Brand Commitments

- Name: **Field Day** is the enduring event identity; **Scottsdale · 2026** is this edition. Domain: fielddayseries.com.
- Mark: "the chip, lit" (chosen by Brandon, Oct 2): the sun-gold betting chip with bone edge inserts, its center a dark glass window with the desert sun setting behind a butte. One source in `src/ui/fdMark.js` (full / mid / small detail levels); every app icon, favicon and the share card are generated from it by `scripts/icons.mjs`.
- Voice (Brandon's rules, binding): terse and direct. State a fact or delete the line. No em dashes, no exclamation-mark energy, no jokes or asides, no reassuring filler, no corny names, no borrowed casino or sports idiom. Never explain what the UI already shows. Real names of real things stay (blinds, bust, stack). Real names in every commissioner control; fun is for reveals, not admin. No string is protected wording; all copy is editable.
- Visual direction is open (Brandon, October 1, 2026). The incumbent look and the design rules in CLAUDE.md (dark-only palette, session phases, chip skins, "no gradients/glows", type choices) were written by earlier agent sessions, not by Brandon, and are evidence rather than commitments. Design work may replace them. Product mechanics, data contracts and guest data are not open.

## Evidence on Hand

- Real content: the slate and rules (`shared/core.js` `BUILTIN_EVENTS`, `GAMES`), the booking (`LOGISTICS`), the edition (`EDITION`).
- Real guest data in production: 13 profiles, photos, flights, ratings, win songs. Never fabricate guest answers; the QA driver fills only wholly empty slots, and blanks stay blank.
- Product history and audits in `docs/` (REFOUNDATION, UX-REPAIR, PRODUCT-DIRECTION and the September 7 audits).
- Rehearsal tools: `/dev/*-preview.html` pages and the QA console.
- No testimonials, metrics or marketing claims exist; none should be invented.

## Product Principles

1. **Glance, don't study.** Every guest surface answers "what now, where do I stand" in ten seconds. Context the guest needs comes before reference material.
2. **One truth, one moment.** The server decides; phones and TV show the same state on the same clock. Never derive a separate interpretation in a view.
3. **Reduce load, don't add process.** No extra steps, confirmations or setup stages that the game flow can carry itself.
4. **Delight must make results legible.** Motion, sound and reveals exist so the room understands what happened, not as decoration.
5. **Guest input is sacred.** Answers, claims and chips are never lost, reset or silently filled.
6. **Shown, not explained.** The app works with minimal instruction. No helper text, captions that restate the UI, or "A · B" meta lines; state, position, icons and motion carry meaning. Anything that needs explaining (rules, how to play, payouts) is visual first: diagrams, icon steps, short animations, then the fewest words. (Brandon, Oct 2, 2026.)
7. **No clock-watching.** The weekend runs on "now and next", never start times; nobody should have to think about the time.

## Accessibility & Inclusion

- Active controls at least 44px; body text holds 4.5:1 on every surface in every session phase (enforced by `tests/living-theme.test.mjs`).
- Reduced motion shows end states and plays a sequence's one summary sound.
- Legible in sun and at night on iPhone; TV text never below 24px on the 1920x1080 canvas.
- Keyboard-only audit findings are deprioritized for this weekend (mobile touch and the shared TV are the scope).
