---
version: 1
slug: "src-app-jsx"
primary_target: "src/App.jsx"
related_targets: ["src/features/tv/TVMode.jsx"]
---

# Field Day app: phone and TV (redesign, Oct 2026)

Scope: every guest phone surface (Home, Events, Bets, Weekend, sheets, moments) and TV mode. Mode: Operate on the phone; the TV is the stage for shared moments. Audience, job and constraints live in PRODUCT.md. The old look (dark slate, Barlow/Inter, phase ramp, "no glows") is replaced; mechanics, data contracts and guest data are untouched.

Owner decisions (Oct 2): do everything in the critique of Oct 1 (.impeccable/critique/), the whole look is open, phone sound plays through the silent switch, deploy to staging when done.

Memorable moments to build: the Walkout (win song takeover), "You're up" sting (TV + competitors' phones), the room sorts itself at the draw, chip rain with a pitch ladder, the produced crown with the thirteen-phone chord, a sky that keeps score, the broadcast poker table.

## Direction contract

THESIS: Field Day is a lit pinball backglass. Chip counts are score reels, state is lamps, a win lights the glass for its winner. It refuses the category default: a dark sportsbook dashboard of rounded cards on slate.

OWN-WORLD: Blue-black glass ground, reverse-painted panels, bone ink. Three system lamps with fixed jobs: magenta = live/now, amber = chips and money, cyan = navigation and info. Filament yellow with bloom is reserved for "you" and nothing else. Player identity colors are painted inserts, never lit. One type family (Brandon, Oct 2): Big Shoulders Display 900 for names, event names, moments, reels, ranks and labels; its Inline cut only for hero lettering; the system face for body. Lamp states: steady live, flashing pending, unlit done, struck void.

STORY: A guest glances, finds their lit lamp, reads their reel and rank, sees what is live in magenta, and puts chips on it. When they win, the glass lights for them and the room hears it.

FIRST VIEWPORT: Phone Home: header with the FD mark and your filament-lit reel and rank; below it the live contest panel lit magenta ("You're up vs Henry" in Big Shoulders 900) with its one action; then 13 lamp rows (identity insert, name, reel) with your row filament-lit; standard four-tab bar. TV: the whole canvas is the backglass painting: the contest on lit glass above, the 13 chip towers with their reels standing on the desert floor as the standings horizon (the critique item "make the towers the permanent lower third", approved by Brandon on Oct 2 with "do everything"), a lamp chase on the frame at rest.

FORM: Backglass (pinball backglasses, lamp inserts, score reels), candidate 5 of 7, seed 7bf867a7. Signature move: digit-by-digit score reels with a relay clack, and a lamp chase around the glass in the winner's color.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

- Session phases (weekendPhase) carry over as the backglass art's time of day, not as a surface ramp.
