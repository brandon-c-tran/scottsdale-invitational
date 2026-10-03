---
name: Field Day
description: A lit pinball backglass for a weekend tournament. Chip counts are score reels, state is lamps, and a win lights the glass for its winner.
colors:
  glass-ground: "#090b14"
  glass-panel: "#121626"
  glass-panel-raised: "#1b2033"
  bone-ink: "#f4ecd8"
  ink-black: "#0a0910"
  muted-lilac: "#b2abc2"
  muted-lilac-bright: "#d9d2e3"
  disabled-lilac: "#968fa6"
  lamp-live-magenta: "#ff3fa4"
  lamp-live-text: "#ff74bf"
  lamp-chip-amber: "#ffa630"
  lamp-info-cyan: "#5fdcf0"
  info-cyan-deep: "#2bb8d0"
  filament-you: "#ffe04a"
  clay-loss: "#e8433a"
  clay-text: "#ff8a7a"
  gain-green: "#7be38f"
  pool-lamp: "#5fb8d6"
  adobe-lamp: "#ff7a3c"
  silver-place: "#a9b4c2"
  bronze-place: "#d08a52"
  poker-25: "#3f9a5f"
  poker-100: "#30313b"
  poker-500: "#7a4fc0"
  poker-1000: "#f0b53c"
  art-indigo: "#18205e"
  art-cobalt: "#2443c4"
  art-violet: "#4a2690"
  art-plum: "#2c1240"
  art-rose: "#e0457a"
  art-tangerine: "#ff6f2c"
  art-cream: "#ffe7b3"
  art-turquoise: "#17aeb0"
  art-terracotta: "#c24a26"
  art-umber: "#4e2416"
  art-sage: "#1f4a3f"
  art-teal: "#0d3a46"
typography:
  show:
    fontFamily: "'Big Shoulders Display', 'Arial Narrow', sans-serif"
    fontSize: "clamp(30px, 9vw, 38px)"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "0"
  show-sheet:
    fontFamily: "'Big Shoulders Display', 'Arial Narrow', sans-serif"
    fontSize: "25px"
    fontWeight: 400
    lineHeight: 1.08
    letterSpacing: "0"
  marquee:
    fontFamily: "'Big Shoulders Inline Display', 'Big Shoulders Display', sans-serif"
    fontSize: "clamp(40px, 11.5vw, 56px)"
    fontWeight: 900
    lineHeight: 1.02
    letterSpacing: "0.01em"
  brand:
    fontFamily: "'Big Shoulders Display', 'Arial Narrow', sans-serif"
    fontSize: "22px"
    fontWeight: 400
    lineHeight: 1
  headline:
    fontFamily: "'Big Shoulders Display', 'Arial Narrow', sans-serif"
    fontSize: "clamp(34px, 9vw, 44px)"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "0.01em"
  title:
    fontFamily: "'Big Shoulders Display', 'Arial Narrow', sans-serif"
    fontSize: "24px"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "0.02em"
  reel:
    fontFamily: "'Big Shoulders Display', 'Arial Narrow', sans-serif"
    fontSize: "22px"
    fontWeight: 800
    lineHeight: 1
    fontFeature: "tnum"
  label:
    fontFamily: "'Big Shoulders Display', 'Arial Narrow', sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.08em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
  body-control:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1
  tv-hero:
    fontFamily: "'Big Shoulders Display', 'Arial Narrow', sans-serif"
    fontSize: "120px"
    fontWeight: 800
    lineHeight: 1
  tv-primary:
    fontFamily: "'Big Shoulders Display', 'Arial Narrow', sans-serif"
    fontSize: "56px"
    fontWeight: 800
    lineHeight: 1
  tv-secondary:
    fontFamily: "'Big Shoulders Display', 'Arial Narrow', sans-serif"
    fontSize: "40px"
    fontWeight: 800
    lineHeight: 1
  tv-label:
    fontFamily: "'Big Shoulders Display', 'Arial Narrow', sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "0.08em"
  tv-body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif"
    fontSize: "40px"
    fontWeight: 600
    lineHeight: 1.3
rounded:
  tag: "6px"
  button: "8px"
  control: "10px"
  panel: "14px"
  tv-panel: "18px"
  pill: "99px"
spacing:
  hairline: "4px"
  tight: "8px"
  row: "12px"
  gutter: "16px"
  header: "18px"
  section: "30px"
  tv-edge: "40px"
components:
  button-primary:
    backgroundColor: "{colors.lamp-chip-amber}"
    textColor: "{colors.ink-black}"
    typography: "{typography.body-control}"
    rounded: "{rounded.button}"
    padding: "12px 16px"
    height: "48px"
  button-primary-compact:
    backgroundColor: "{colors.lamp-chip-amber}"
    textColor: "{colors.ink-black}"
    rounded: "{rounded.button}"
    padding: "8px 12px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.glass-panel}"
    textColor: "{colors.bone-ink}"
    typography: "{typography.body-control}"
    rounded: "{rounded.button}"
    padding: "12px 16px"
    height: "48px"
  button-destructive:
    backgroundColor: "{colors.glass-panel}"
    textColor: "{colors.clay-text}"
    rounded: "{rounded.button}"
    padding: "12px 16px"
    height: "48px"
  button-commit:
    backgroundColor: "{colors.clay-loss}"
    textColor: "{colors.bone-ink}"
    rounded: "{rounded.button}"
    padding: "12px 16px"
    height: "48px"
  link-info:
    textColor: "{colors.lamp-info-cyan}"
    padding: "8px 0"
  header-you:
    textColor: "{colors.filament-you}"
    typography: "{typography.reel}"
    rounded: "{rounded.control}"
    padding: "7px 10px 6px"
    height: "44px"
  nav-tab:
    textColor: "{colors.muted-lilac-bright}"
    height: "52px"
  nav-tab-active:
    textColor: "{colors.lamp-info-cyan}"
    rounded: "{rounded.pill}"
    width: "52px"
  sheet:
    backgroundColor: "{colors.glass-panel}"
    textColor: "{colors.bone-ink}"
    rounded: "{rounded.panel}"
    padding: "16px"
  glass-field:
    backgroundColor: "{colors.glass-ground}"
    textColor: "{colors.bone-ink}"
    rounded: "{rounded.panel}"
  input-text:
    backgroundColor: "{colors.glass-ground}"
    textColor: "{colors.bone-ink}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "48px"
  tag:
    textColor: "{colors.muted-lilac}"
    rounded: "{rounded.tag}"
    padding: "3px 8px"
  tv-glass-panel:
    textColor: "{colors.bone-ink}"
    rounded: "{rounded.tv-panel}"
  tv-ticker:
    backgroundColor: "{colors.ink-black}"
    textColor: "{colors.bone-ink}"
    typography: "{typography.tv-body}"
    rounded: "16px"
    height: "60px"
---

# Design System: Field Day

## Overview

**Creative North Star: "The Lit Backglass"**

Field Day is a lit pinball backglass. The ground is blue-black glass; panels are reverse-painted onto it and lit from behind; ink is bone. Chip counts are score reels, every digit in its own window. State is lamps: a lamp is steady when live, flashing when pending, unlit when done, and struck through when void. When someone wins, the glass lights for them: their color floods, a lamp chase runs the frame, and the room hears it. It refuses the category default of a dark sportsbook dashboard: no slate cards with soft rounded tiles, no data-viz chrome.

The phone is operated in ten-second glances, so the world is dense and legible before it is decorative. Each viewport carries exactly one painting (the session's Scottsdale desert, shared with the TV); everything else is flat painted glass in the ink of its job. The TV is the stage: the whole 1920x1080 canvas is the painting, content stands on dark glass above the horizon, and the thirteen chip towers stand on the desert floor as the standings. Motion and sound exist to make a result legible to the room; they are anchored to the server clock so every screen moves together.

Lettering does the brand work, in one family. Big Shoulders Display at 900 letters the moments, event names and people's names; its Inline cut (Big Shoulders Inline Display, marquee lettering) is reserved for hero lettering on moments (`.fd-show.is-marquee`), never small, where it gets busy. Brandon chose this single-family system on Oct 2 over Big Shoulders (show weight), which clashed with the condensed face. Big Shoulders Display, condensed and heavy, runs the reels, ranks and labels like a scoreboard. The system face carries everything functional.

**Key Characteristics:**
- Blue-black glass ground in every session; the session lives in the painting and one lamp, never in the surfaces.
- Three system lamps with fixed jobs (magenta live, amber chips, cyan navigation) plus a reserved filament yellow for "you".
- Player identity colors are painted inserts, never lit, except in that player's own winning moment.
- Score reels with apertures for the hero counts (your own, the champion, a contest's total); plain numerals with room around them everywhere else; lamp inserts for every state.
- One painting per viewport; every other panel is a painted glass field.
- Gradients are welcome where they make the glass real (Brandon, Oct 2: "you can use gradients if it genuinely would fit this really awesome glass theme"): light falling across a pane, depth in a recessed window, the glow behind lit lettering, a lens, a drum, the painting's sky. Never as decoration that means nothing (no rainbow buttons, no gradient text).

## Colors

A night palette of blue-black glass and bone ink, lit by three lamps with fixed jobs and one filament that belongs to the viewer alone.

### Primary
- **Live Magenta** (lamp-live-magenta): the "live/now" lamp. The current contest's frame, the lit word over a live event, the nav badge for something waiting on you, the TV's UP NOW banner and live status dot. Text in this family uses **Live Magenta Text** (lamp-live-text) for contrast; the fill hue is never set as small text.

### Secondary
- **Chip Amber** (lamp-chip-amber): chips and money. Chip totals on the betting board, payouts, the duel panel's lamp, the leader's tower ring, the primary action fill (`--action-fill`), the TV frame chase at rest, the finale's lamp. The token is named `--sun` in code.

### Tertiary
- **Info Cyan** (lamp-info-cyan): navigation and information. The active tab's lamp, links, sheet header actions, focus rings (2px outline, 3px offset), selection, caret and form accents, information panels (setup to-dos, waiting states). **Deep Cyan** (info-cyan-deep, `--accent`) is the same lamp's fill tone.
- **Filament** (filament-you): reserved for "you". Your header reel and rank, your leaderboard row, your score reel tone, your chase when you are up. Always paired with its bloom (`--you-bloom`). Nothing else uses this color.

### Neutral
- **Glass Ground** (glass-ground): page and TV ground, every session.
- **Glass Panel** (glass-panel) and **Raised Panel** (glass-panel-raised): sheets, secondary buttons, toasts, raised plates.
- **Bone** (bone-ink): primary text and lettering on art.
- **Ink Black** (ink-black, `--ink0`): text on lit fills (amber buttons), the lettering keyline on the painting, reel recesses, poker chip ink, cacti silhouettes.
- **Muted Lilac** (muted-lilac) and **Bright Lilac** (muted-lilac-bright): secondary text and labels; **Disabled Lilac** (disabled-lilac) for disabled text. Every body-text token holds 4.5:1 on every surface (enforced by `tests/living-theme.test.mjs`).
- Lines are bone at low alpha: `--line` 14%, `--bone-line` 16%, `--ghost-line` 30% (sheet edges, inputs).

### Signal and place colors
- **Clay** (clay-loss) is loss and danger as a fill or a line (commit buttons, a correction past the cap, a dropped connection ring). Text in the family is **Clay Text** (clay-text).
- **Gain Green** (gain-green): a rise (`.fd-motion-delta.is-up`, rank up, a won settle zone). A fall uses `--live2`.
- **Silver** and **Bronze**: 2nd and 3rd place rims on the TV board.
- **Poker chips**: one flat color per denomination, 25 green, 100 charcoal, 500 violet, 1000 gold.

### The session lamp and the painting's inks
- `--phase` is the session's own lamp, drawn as a 3px line and a strip of bulb dots along the top of the header: Friday **Pool** (pool-lamp), Saturday morning amber, Saturday afternoon **Adobe** (adobe-lamp), Saturday night magenta, finale amber. The `data-phase` blocks swap only `--phase`; surfaces, ink, lamps and chip colors never change.
- The `--art-*` inks paint the backglass only (TV canvas and phone `GlassArt`), mixed per session in `glass-art.css` and `tv.css`. Friday: indigo to cobalt sky, violet glow, teal mesas, cream moon, stars. Saturday morning: violet to rose to tangerine sky, terracotta mesas, a big striped sun at the horizon. Saturday afternoon: cobalt to turquoise sky, tangerine-terracotta mesas, cream sun. Saturday night: plum to violet sky, rose-lit mesas, a striped rose moon, stars. Finale: the glass's own ground ramp, no disc, amber rim, stars. Art inks are never text and never state.

### Named Rules
**The Fixed Jobs Rule.** A lamp's color is its job. Magenta is live and now, amber is chips and money, cyan is navigation and info. A new surface picks the lamp by what the thing is, never by what looks good beside it.

**The Filament Rule.** Filament yellow with its bloom means "you" and nothing else. If an element is not the viewer's own, it may not use `--you`, `--you-bloom` or `--you-tint`.

**The Painted Insert Rule.** A player's identity color is paint, not light: chip faces, bars, tower stacks and card fills are flat and carry no bloom. The single exception is that player's own winning moment, when their color floods the screen and lights the lamp chase.

**The Glass Stays Black Rule.** The ground is blue-black in every session. The session shows in the painting and in `--phase`, never in a surface ramp.

## Typography

**Moment Font:** Big Shoulders Display 900 (`--fd-show`); hero lettering in Big Shoulders Inline Display (`--fd-marquee`, self-hosted `public/fonts/big-shoulders-inline-display-latin.woff2`)
**Display Font:** Big Shoulders Display, variable 100 to 900 (self-hosted `public/fonts/big-shoulders-display-latin.woff2`, falling back to Arial Narrow)
**Body Font:** the system face (-apple-system, SF Pro Text, Segoe UI, system-ui)

**Character:** Big Shoulders Display at 900 is the sign on the glass: condensed and heavy, set as written (mixed case) for names and event names, so it runs larger than a wide face would. The same family at 700 to 800, uppercase and tracked, is the scoreboard for labels and ranks. The Inline cut is marquee lettering for the one hero line on a screen. The system face stays out of the way.

### Hierarchy
- **Show** (Big Shoulders Display 900, set as written and never uppercased, letter-spacing .01em, line-height 1.02 to 1.15 and never under 1.15 in a clipped box): event names in lists 22 to 25px, sheet titles 30px, the brand 26px, names on cards up to 68px. Sheets that name an event or a person use it (`.is-show`).
- **Marquee** (`.fd-show.is-marquee`, Big Shoulders Inline Display 900): the one hero line on a screen only: the live event on Home and Bets (clamp(40px, 11.5vw, 56px)), the champion's name (44px), a moment's headline ("You're up", the walkout name, a drawn team; clamp(56px, 18 to 24vw, 120px)). Never two on one screen, never small.
- **Headline** (Big Shoulders 800, clamp(34px, 9vw, 44px), 1, uppercase, .01em): page headings.
- **Title** (Big Shoulders 800, 24px, 1.1, uppercase, .02em): section and plain sheet headings.
- **Reel** (Big Shoulders 800, tabular figures): chip counts in score reels; 22px in the header, scaled by em everywhere else.
- **Label** (Big Shoulders 700 to 800, 12 to 16px, uppercase, .06 to .12em): ranks, column heads, statuses, "Latest result".
- **Body** (system 400 to 600, 12 to 15px, line-height 1.3 to 1.6): everything functional. Controls are 15px/600 (13px compact). Fields render at 16px minimum so iOS never zooms.
- **Rows** (decided Oct 2): the names in repeated rows (the 13 leaderboard rows, a side's backers, the flights board, the draw's cards) stay in the system face at 14 to 16px/600 for legibility at a ten-second glance; Brandon never asked to change them. Big Shoulders letters a name only where it is the subject (a card, a moment, a plate, a tower).
- **Fallback while the face loads:** `font-display:swap` stands in a local condensed face sized to Big Shoulders' width and line box (`BS Fallback Condensed`: Helvetica Neue Condensed Black on iPhone; `BS Fallback Narrow`: Arial Narrow Bold elsewhere; `size-adjust` with ascent and descent overrides), so a slow load never shows the wide system face or reflows a plate. Both woff2 files are preloaded.

### TV scale (1920x1080 canvas, read at ten feet)
Hero 120px and up (table totals, champion), primary 56 to 72px (leader, side totals, masthead event 52px), secondary 40px (names, reels, ticker text, body), labels 24 to 32px. Nothing on the canvas is under 24px.

### Named Rules
**The Phone Floor Rule.** No phone text below 12px. TV text never below 24px canvas pixels.

**The Flagged One Rule.** Big Shoulders draws "1" as a bare stroke, so uppercased beside letters it reads as I or a bar. Every label with letters that contains a lone 1 goes through `OneSafe`, which keeps the family's own 1 (same face, weight, case, cap height) and draws a flag on it (`.fd-one::before`: the face's own hyphen, cut to .23em and turned -35deg off the stem's top, behind the stem, with a .07em left margin so it never touches the letter before). Being a glyph, the flag carries the lettering's ink, keyline and inline cut at every size from 12px to 160px; never a body-face substitute. Every event name with a digit goes through `EventName`, which keeps it out of uppercase ("1v1 Basketball", never "1V1 BASKETBALL"). A bare number (a rank alone, a clock, a reel) stays in the display face. The show weight's 1 is flagless too, so show lettering with a digit goes through `EventName` as well.

**The Names Are Lettered Rule.** Event names and people's names are the show weight, as written; uppercase Big Shoulders is for data and labels.

**The No Stranger's Number Rule.** A player number never stands in for a person. A chip or avatar shows the photo, else the initials (at 12px or more, on a plate that holds 4.5:1, `letterPlate` in chipInk.js), else nothing. Your own number appears only on your own card, jersey and editor.

## Layout

The phone is a single column, max 620px (1040px for check-in, unbounded for TV), centered on the glass ground with 1px side lines above 700px. A sticky header (58px row, 18px left / 14px right padding, safe-area aware) carries the FD mark, the edition, and your filament reel and rank; a fixed four-tab bar (`--fd-nav-height`, 74px plus safe area) carries Home, Events, Bets, Weekend. Content rhythm: 4px hairline gaps inside groups, 8 to 12px between rows, 16px sheet and panel padding, 30px before a section heading. Every active control is at least 44px; primary buttons are 48px. Nothing fixed floats over the page: the commissioner's dock (the QA strip when QA is on, and the next-step pill with the TV's state in it, the win song's control sitting in the pill's own row while a song plays or one missed) is one glass shelf on the tab bar, and the page, the sticky You row, the bets rack, toasts and receipts all clear its measured height (`--fd-dock-h`). The bets rack rides in the page's flow under the board it bets on, sticky above the tab bar and dock while the board scrolls, so it never covers the bracket or the bets after it. The pill carries exactly one primary action; its alternatives and edge cases (Random draw, Change crew, Skip, last) wait in the tray its more button opens, under the run of show.

**The One Menu Rule.** The More menu, the commissioner's menu and the QA console are one system (`src/ui/Menu.jsx`, model in `features/director/menuModel.js`): sections with an icon and a short label over one glass list, 52px rows, a value only when it is state, a switch for on/off, destructive and rare rows last, Exit alone at the foot. No sentence explains a row. With the You reel in the header, the brand's words step aside below 430px so the row never touches.

Home's first viewport is: header; the live contest panel (the painting behind your strip, the event lettered whole on the dark desert floor under its horizon and the pane's one way into the event sheet, then the contest on clear glass below with its one action; the rules and the bracket live in the event sheet) or, with nothing live, your strip carrying the painting; then the 13 lamp rows of the leaderboard (~47px each) with your row filament-lit and sticky above the tab bar.

Sheets rise from the bottom (max 560px, 900px wide variant, 94dvh), centered as a 12px-radius dialog from 700px up. Their header is sticky, 62px, title and actions once.

The TV stage is a fixed 1920x1080 canvas scaled and letterboxed. Content keeps 64px from the sides and 54px (5%, title safe) from the top and bottom, so a TV's overscan never trims a word; only the painting and the frame's lamps run to the canvas edge. A 124px masthead holds two 64px glass pill signs at that inset on the painted sky (event and status left, clock right); the main pane follows; a 272px standings horizon of thirteen towers stands on the desert floor (horizon line at y 856); and a 120px ticker strip ends in a 60px glass plate 54px above the bottom, a page at a time (two short facts side by side or one long one centered), cross-fading every 6s.

**The Fits By Construction Rule.** Variable-length content (names, team names, event names, lists of people, bets, results) fits its box by construction: a measured size (`sideNameFit`, `towerNameFit`, `championNameFit`, the bracket's `sideBracketDims`), wrapping at a space, columns or rows chosen by count (`medalLayout`, the geo results' `geoRevealRows`, the poker ring's `tableRing`), or "+N" folding with the full list one tap or one turn away. Never by hidden overflow: no ellipsis on a person's or an event's name, no `overflow:hidden` list that quietly drops rows, no fixed box a long name runs out of. The only truncation allowed is free text from outside the app (a song title, an artist), marked `data-fit="ellipsis"`. Line boxes hold their descenders (1.15 or more in any box that clips). TV text keeps 64px from the sides and 54px from the top and bottom; a chip or avatar too small to letter its initials at the surface's floor (`TextFloor`: 12px phone, 24px TV) shows its color and skin alone. The fit audit is the judge: `npm run audit:fit` renders every TV scene and phone view from real reducer states and fails on clipped, truncated, out-of-bounds, overlapping, covered or under-floor text; documented exceptions live in `dev/fit/exceptions.js`.

**The One Painting Rule.** A viewport carries one painting (`GlassArt` in a `.fd-glass-scene`). On Home it sits in the live contest panel when a contest is live (your strip is then lettered into it, inset) and in your strip when nothing is live; the crown card uses the Saturday-night painting; Bets puts it behind the current event's name; check-in puts it behind the invitation. Every other panel is a painted glass field.

## Elevation & Depth

Depth is optical, not floating. Panels are glass: a bevel (`--glass-edge`: a 7% white top lip, a 45% black bottom lip), lit from behind in their lamp's ink, and a bloom when lit. Shadows are deep and blue-black, never pure black, and are reserved for things that genuinely sit over the glass (sheets, toasts, the TV's now-playing strip). Glass you can feel (`useGlassTilt`): Home's lit pane, your strip when it carries the painting, and the betting rack lean a few degrees toward a finger (the pressed point recedes, the glass sinks 5px) and spring back with one small overshoot; one hard reflection band (7% bone, no blur) brightens and slides as the pane leans and, where scroll timelines run, crosses the pane as it travels the viewport. The painting inside (`GlassArt depth`) is four plates (sky, far range, buttes, floor) that part as the pane leans and drift a few px with scroll. Touch only, never device orientation; reduced motion is still and level. Rack denominations are coins with a body (`Coin`): they lean back in the tray showing their edge, the chosen one stands and lifts, a placed chip spins on its edge as it flies and one taken back flips home.

### Liquid glass (Oct 3)
The hero objects get a body: a thick pane that bends light. Built only from the `--lg-*` tokens in `:root` over the pane's own fill (`.fd-liquid`, `src/ui/backglass.css`): **lip** (`--lg-lip`, a 30% white top lip and a dark underside), **fringe** (`--lg-fringe`, a cool cyan and a warm magenta 1px where the side edges split the light), **fall** (`--lg-fall`, light falling off down the pane), **bands** (`--lg-bands`, the two reflection bands a thick pane shows, one strong and one faint), **caustic** (`--lg-caustic`, light gathering at the foot) and **sweep** (`--lg-sweep`, one pass of light across the pane when it lands, `.fd-liquid-sweep`, transform only). It frosts (backdrop blur 18px, saturate 1.5) only where something really sits behind it: the bets rack riding over the felt. Where it lives: the TV podium's steps, the crowned champion's flood, the next-event ribbon over the towers, the coverless win song's record, the rack, your last card (held like the player card: it leans toward a finger, a band of light slides across it). Everyday rows, sheets and menus stay painted fields.

### Shadow Vocabulary
- **Glass edge** (`box-shadow: inset 0 1px 0 rgba(255,255,255,.07), inset 0 -1px 0 rgba(0,0,0,.45)`): every reverse-painted panel, sheet header and button.
- **Shadow 1 / 2 / 3** (`0 2px 10px rgba(2,3,10,.6)`, `0 8px 24px rgba(2,3,10,.7)`, `0 14px 40px rgba(2,3,10,.78)`): small lifts, TV glass panels, sheets and toasts.
- **Liquid glass**: `--lg-lip` and `--lg-fringe` (see Liquid glass) on hero panes only.
- **Lamp blooms**: `--live-bloom` (1px magenta ring + 16px at 38%), `--chip-bloom` (amber, 16px at 35%), `--you-bloom` (1px filament ring + 14px at 45% + 38px at 20%). A lit `.fd-lamp` uses a 1px ring plus an 18px glow at 38% of its lamp.

### Named Rules
**The Light Means State Rule.** A glow is a lamp, and a lamp is state. Nothing glows for decoration; an element blooms only when it is live, pending, chips in play, the active tab, or you.

**The Liquid Glass Rule.** Liquid glass is for the hero objects that deserve a body, never for everyday rows or sheets. Tokens only, transform and opacity motion, and a backdrop blur only where something really sits behind the pane.

## Shapes

Corners are moderate and consistent: 6px tags and small controls, 8px buttons, 10px fields, segmented controls and your header plate, 14px panels and sheet tops, 18px TV glass panels, 99px pills, round lamp inserts and chips. Inside a glass field a keyline is painted 4px in from the edge at 10px radius. Score reel windows are cut at .1em radius. Chips are circles with edge-tick skins; the middle is drawn last (photo medallion or number). The TV masthead plates are full pills on 64px. Lines are 1px; lit frames add a 1px ring rather than a thicker border.

## Components

### Buttons
Solid, square-shouldered, glass-bevelled.
- **Shape:** gently rounded (8px), 48px tall (44px compact), 12px 16px padding.
- **Primary:** amber fill with ink-black text, the money lamp: Play, Place, Confirm.
- **Secondary / Tertiary:** glass panel fill, 1px line, bone (secondary) or bright lilac (tertiary) text.
- **Destructive:** glass panel, clay text. **Commit** (irreversible confirm): clay fill, bone text, 1.5px ink-black border.
- **States:** pending at 60% opacity with `aria-busy`, disabled at 35%; a 0.1s press transform. Focus is the cyan ring.
- **Links and header actions:** one quiet treatment everywhere: cyan text, 13 to 14px/600, an open arrow when it leaves the view, no fill.

### Lamp inserts
A lensed lamp set in the glass, 12px: a dark seat and chrome rim (`--lens-rim`), a domed lens lit from its center (radial lens gradient in the lamp's color) with a 9px bloom and a specular glint up-left. States: **steady** (lit), **pending** (flashes on a 1.2s stepped cycle between lit and a dim filament, `--lens-dim`, never fully off, so pending never reads as unlit), **done** (clear glass: the same lens with no hue left in it, `--lens-spent`, glint at 38%, so done never reads as a dim live), **void** (unlit with a muted bar across at -38deg). A live insert joins the room's heartbeat (2s, phased to the server clock) as a steady lamp: the lens stays lit and only its bloom breathes (`fd-beat-lamp`). The same four states apply to whole panels via `.fd-lamp` (`is-live`, `is-pending`, `is-done`, `is-void`), tinted by job (`is-chip`, `is-info`, `is-you`).

### Score reels
A hero count is a reel: your own (the You strip, the header), the champion's, a contest's hero total, the TV's single biggest number on a scene. The thirteen leaderboard rows are plain Big Shoulders numerals (26px, 800, tabular; bone, the leader amber, yours filament) with no breakdown at rest; a rank move shows only while it rolls. Each digit of a reel sits in its own window: a dark recess tinted 4% of its tone (8 to 9% when toned), a bezel (dark seat, lit lower lip), the drum's curvature shading top and bottom, and a hairline where the drum meets the window. Measures are in em so one reel reads at 16px in a row and 40px+ on the TV. Each changed drum rolls to its digit in 240ms on an overshoot curve (`cubic-bezier(.3,1.35,.5,1)`); drums are keyed from the right so a gained digit keeps the lower drums. Tones: default bone, `is-you` filament with a 12px glow, `is-chip` amber, `is-live` magenta. Reduced motion shows the number. Separators (comma, minus) sit outside windows. Your own reel (the Home You strip) clacks: one dry relay click (`detent`, you bus) as each counted step lands, at most every 45ms, only while a fresh count runs (`clack={count.counting}`), so loads, reconnects and catch-ups stay silent. Windows are roomy, never tight on the figure: 1.4em tall, .2em either side, .1em between windows, soft curvature. Hero numbers take the drum cut (`ScoreReel drum`): each digit is a real cylinder, ten faces round a rotateX ring behind the window in perspective, rolling forward on a count (backward on a loss, never the long way) with momentum (longer rolls take longer, to 900ms) and a short settle on `--ease-drum`. Your own reel takes a flick (`spin`): a vertical flick spins every drum whole turns and they land left to right back on your number, each with the relay click. The header and leaderboard keep the flat cut.

### Pot and backers (the bets board)
Every bet side is one pot and a list (Brandon, Oct 2, replacing a stack per bettor on a felt). The pot is one amber chip tower (one chip per 100, a tower top past ten) with the side's total beside it as a 30px numeral, the side's one big number. Under it the backers, one 44px row each (photo chip, name in the system face, amount right-aligned in amber tabular numerals), biggest first, four rows then a quiet "N more" that opens the whole list in a sheet; your own row is lit in your filament, reads "You" and takes your last chip back (an undo glyph says so). The side you can back ends on one full-width "+ 100" (the rack's chip; "Max N" at the cap), and a placed chip flies from the rack into the pot. A side you cannot back shows no + and no word. A side nobody backs yet shows the felt's open seat (a dashed chip ring, faintly amber where you can put the first chip), never a hollow pot and a 0. A wide board states the cap once, on the meter ("Max 500"); each row's + only goes quiet. Every part keeps its height, so both sides of a matchup mirror. A wide board (3+ sides) is one 56px row a side: photo and name, the pot's total, your chips lit (a tap takes the last back) or how many back it, then the +. The decided board holds the same shape: the winners' rows read what they were paid in green, a losing side's rows dim.

### Trophy plates
One plate per event on the stepped plinth. Every plate is lettered one way: the event and its winners as written, in the show weight (800 to 900, never uppercased; a digit's case kept by `EventName`), 14px on the phone, 24 to 28px on the TV. A posted plate is bone engraved with its winners' photo chips and names in won-green; a blank plate is an unlit insert (frosted glass, its centre a shade warmer, one glint on its top lip), never a black box.

### Lamp chase
A ring of bulbs (5px dots on a 9-unit dash, 4px drop glow) running around a frame, 0.9s per step. Tones: live, chip, you, or a winner's own color. On the phone it rings the live contest panel in filament when you are up. On the TV the frame is its own ring of 7px bulbs 40px apart, 14px in from the canvas edge, with no glow: the unlit bulbs are the lamp's color sunk 70% in ink, every third is lit, and the lit three step on one bulb at a time, 1.2s a step in amber at rest, 180ms a step in the winner's own color while their podium holds the room, and back to the rest pace in the champion's color once the board is crowned. Static and lit under reduced motion. The phone's walkout lights it too: the winner's color floods the screen, light falls through the glass from above the record (bone at a low alpha over their color, a darker foot, the one hard reflection) and the chase runs round the screen in a lit tint of their color.

### Painted glass fields
The panel that is not the painting. A field is the glass reverse-painted flat in its job's ink at 8% over the ground, a 30% border, one hard diagonal reflection across the pane (3% white from 64% to 71% at 112deg), a keyline 4px inside at 22%, and a 6px halftone of the same ink shading the lower-right corner. Jobs: `fd-field-live` (magenta: betting elsewhere), `fd-field-chip` (amber: duels), `fd-field-info` (cyan: setup to-dos, waiting states). The lamp state sits on the frame; a done field keeps its paint at 18% with the lamp off.

### Lettering on the painting
Text on art is bone Big Shoulders (show weight) on a heavy ink-black keyline (2px in eight directions plus a 4px drop) with a 22px glow in its lamp; the keyline carries contrast on any sky. A line of plain text on the painting sits in a window cut in the glass (ink-black at 88%, 9px radius, inset bezel).

### Navigation
Standard four-tab bar on the chrome (`--chrome`, 96% ground, 18px blur). Tabs are 12px/600 bright lilac with an icon in a 52x30 pill; the current tab is lit cyan: info-tint fill, a 1px cyan ring at 55%, a 14px cyan glow, and a 4px drop glow on the icon. A magenta insert badge marks a tab with something waiting on you. Icons are one family (`Icon.jsx`): line glyphs on a 24 grid, round caps and joins, the stroke stepping with size (2.1 at 14px to 1.5 at 40px+); `lit` fills the same silhouette and cuts its detail out (a mask), so the current tab is a lit glyph, not only a lit pill. Game marks (`GameMark.jsx`) are the same grid set in a round insert of dark glass, the game's one object filled. The FD mark is the chip lit: the amber chip with bone edge inserts, its middle a window of glass with the sun setting behind a butte (`fdMark.js`, the one source for the app and every generated icon).

### Inputs / Fields
Ground-black field, 48px tall, 10px radius, 1px ghost line (30% bone), an inset shadow pressing it into the glass, 16px text. Focus is the cyan outline ring. Placeholders are muted lilac.

### Sheets
A reverse-painted panel rising over a 70% scrim with 3px blur: glass panel fill, ghost-line edge, 14px top corners, glass edge plus shadow 3. Rises in 260ms (ease-out), falls in 200ms (ease-exit).

### TV stage
- **Painting canvas:** the whole canvas is `desertModel`'s backglass: five banded sky layers, the session's disc (striped where it sinks), the far range, Camelback's hump, two buttes lit on one face, saguaros, and an always-dark floor.
- **Masthead:** slim, two glass pill signs; event name in Big Shoulders (show weight), status as a lamp (Betting open flashes, Playing is steady), clock in Big Shoulders.
- **Content glass:** `--tv-glass` (the ground mixed 20% toward the panel ink, opaque: glass is reverse-painted, so no painting or saguaro shows through a pane; light falls across it as a 4% bone wash down its top third beside the one hard reflection) panels with 18px radius, glass edge and shadow 2. Inside a pane nothing is a second card: a felt, a spot on a wide field, a backers' tray or a draft queue is a window cut in the pane (`--tv-window`, ink-black at 88%, 10px radius, its bevel inward: a dark top lip, a lit bottom lip). The result podium's steps are the one TV glass with a body (liquid glass; see the podium below).
- **Towers horizon:** thirteen cel-shaded 3D chip towers as the permanent standings, each chip's middle the player's photo (plain without one, never a jersey number), the leader ringed in amber; flat board fallback when WebGL is missing or slow. At rest a tower's label is two lines in a fixed 132px slot (clamped inside the safe sides): the name on one line, fitted from 30px down to 24 and, wider than the slot at 24, narrowed to it (measured in the browser, never two lines, so every count stands on one baseline), then its count as a plain amber numeral (no reel, no rank, no arrow; position is the rank). On a result's step every name stays with its tower through the re-sort: a mover's change takes the count's line once and fades back to the new count, a tower that did not move leaves that line empty meanwhile (never a dimmed balance), the rest of the names step to lilac and the winner's lights green; the result's headline (the event, then the winner's photo chips and "{Name} wins" in the Inline lettering on an ink keyline) fills the empty sky above the towers. Reduced motion keeps the board at rest.
- **The current match over a big bracket:** a bracket of seven entrants or more (`BIG_BRACKET`) takes the live row's full width as a band (344px) under the match, which stands above it as one compact row: the two sides face each other across VS with "Winner pays 1:1" under it; with bets each side's stacks stand beside its name, with none the faces and names take the room (no empty felt, no "No bets"). The band sizes its rows to its height (every name one line at 24px or more), letters round heads whole where the column allows and short (R1, QF, SF) where it does not, outlines the live match with its UP NOW tab and ticks decided winners. Six or fewer keep the bracket in the side panel. A match is named by its round ("Semifinal 1", "Round 1 Match 3"), never "Up now · …".
- **The champion card:** at rest their color is light behind liquid glass (lit from above, falling off to the edges, the reflection bands, a halftone in the corner; the middle stays their exact color for the ink), and their chip turns a few degrees on show. Read from the couch in one glance: the champion's chip (200px) and name (the Inline lettering, one line as large as 150px allows, else two), "Champion", then the final stack as one 136px numeral, then a medal per podium finish (the event's GameMark with its place on a badge, 1st amber, others bone, the event's name under it while the medal is wide enough), up to six a row. The night painting with the trophy holds the left. No bordered pills, no list of plates: every event's winner is the trophy's own turn. The frozen TV takes turns on the server clock: champion, class photo, trophy.
- **The poker ring:** thirteen fixed seat boxes (266px wide, 96px live, 128px while the deal builds) on an ellipse computed from the box (`tableRing`), so no seat touches another, the safe sides or the ticker; the felt sits inside the ring and carries only numbers (chips in play, the blinds, the level and its clock), the masthead names the game.
- **What an event pays:** `PayoutLadder` (src/ui), never a "400 · 200 · 100 chips" line: a podium. Each paid place is one unit on one floor: a real chip stack (one chip per 100, scaled to the tallest) whose top chip is stamped with the place (1st amber, 2nd silver, 3rd bronze; crew a muted plain chip on a low dashed step), standing on a glass step lettered with the amount; steps rise by place and stand 2nd, 1st, 3rd. Equal columns across its container, so it fills a sheet instead of sitting in a corner. Filled after a result (`winners`), each step carries its winners' photo chips (their cards one tap away) and names, or a team its name, in place of a "1st: Name +400" list. A row or the ticker uses the one-line variant (place medallion and amount). The TV intro, the next-up card, the live board and the ticker use it; no rules paragraph or session/format meta line appears on the TV.
- **Next up (ambient):** the next event's mark and name with what it pays, one row on glass over the towers, which stay the lower third; no "Next" label (the composition says it). The board's own turn carries the same as one ribbon of liquid glass high in its sky (`NextRibbon`), so the towers never stand under an empty 60% of the canvas.
- **The result podium (`TVPodium.jsx`, `tvModel.podiumStage`):** three stepped liquid-glass plinths standing on the painting's desert floor (canvas y 880), 2nd 1st 3rd, joined, 1st tallest and centred (600, 460, 460 wide; 318, 226, 164 tall). The event's mark and name are lettered on the sky over them (show weight on the ink keyline, no card). Each place's people stand on its lid, faces and names sized by count (`standFit`: one row while it is about as large, else balanced rows; a split place stands as groups, a tie past three is counted), and its place is cut in the face in the Inline lettering with its award stamped under it. The empty podium rises first; each place lights and its people drop on its beat (`podiumBeatAt`: 3rd, 2nd, held, 1st), all from the result's server instant, so the stamps and the room's sounds land together. 1st is lit through in its winner's own color with a shaft of that light from above and a pool on the floor; light sweeps every face once 1st has landed. The winners' backers never ride in 1st's step: they take the ticker's place on one rail (`backersRail`: photo chip, first name, what it paid; faces and amounts past five; "+N" past what fits), landing 300ms after the last place with the S12 pay sound.
- **A wide field's spots:** every name at one size on one line (`fieldNameFit`), lettered as written, faces stepping down (56, 48, 40) before any name would wrap.
- **The finale's room:** the painting's floor falls into the dark around the poker table under its own amber lamp, so no horizon line or saguaro stands behind a seat.
- **A win song with no cover:** the song is a record, its grooves turning, the winner's chip still at its center as the label; never two copies of the same badge.
- **Commissioner's TV controls:** Exit TV and Sound early sit in the bottom corners of the letterbox, hidden on load and shown only while a pointer moves (3s idle), never over the masthead or the clock; a room with no pointer never sees them.
- **Ticker:** one glass plate inset 64px, a page at a time (two short facts side by side with a hairline between, a long one alone and centered), each fact: a quiet lilac label and hairline, the people as photo chips, then the fact in 34px body with any amount as a Big Shoulders numeral in its role's ink (chips amber, a won bet green, a loss clay). Nothing in it is lit; it never repeats the live board (on deck next, the biggest bet, the last result's biggest swing, the weekend's facts, the leader, chips in play, won bets, duels, rulings, the next event). Facts keep to the moment: won bets only for the last result and only until a contest or a draft takes the room, the result on screen never repeated, and the live finale only the table's own news (the last seat out, the next blinds, the deepest stack still in, the average stack). A label never repeats its fact's first word, and never reads as a bracket round (a posted result is "Result", not "Final"). A 0.7s cross-fade every 6s.
- **Takeovers:** a moment that owns the room sets `data-takeover` (TVMode's intro, draw, champion, awards) or `data-moment` (moment layers) on the canvas. The masthead exits up, the ticker down, the horizon drops 60px, all over 0.45s; under `data-moment` the chrome and now-playing fade over 420ms. A moment with a chase color sets `data-chase` and the frame lights in that color; otherwise the rest chase steps out. The chrome returns the frame the moment ends.

### Motion grammar
Named timings live once in `src/lib/motion.js` (`MOTION`, `EASE`) and mirror as `--motion-*` / `--ease-*`. Only fresh changes animate; a load, reconnect, catch-up or correction shows end states. Moments run from a shared server instant (`--tl`), so a late screen joins mid-sequence; every element's resting style is its end state.
- **Cheap on a TV's small GPU:** a moment animates transform and opacity only (going dark is an overlay's opacity, never a filter), draws repeated parts as one picture (a crown tower is one SVG pattern of chips, not an element per chip), re-renders only what changes (the counting number alone), scales a small disc for a flood rather than a screen-sized one, and draws 3D props flat while it plays (the crown's trophy). Measured under a 4x CPU throttle with software compositing: the produced crown holds 60fps.
- **Ease out** `cubic-bezier(.2,.8,.2,1)` for entrances; **Ease land** `cubic-bezier(.3,.7,.35,1.25)` for anything that lands and settles with a slight overshoot (stamps, art standing up, the link-return pop); **Ease exit** `cubic-bezier(.5,0,.75,.4)` for leaving.
- **Reel:** 240ms overshoot per drum; counts step in 100s over 750ms; the delta rises 18px and fades over 1100ms.
- **Takeover grammar:** lean-in (the glass dims, 900ms), reveal (stamps at 320 to 380ms on ease-land, slams at 420ms), settle (hold, then lift off over 500 to 700ms).

| Moment | Lean-in | Reveal | Settle / total |
|---|---|---|---|
| Game intro (TV and every phone) | dark glass, the backlight flickers on 0 to 560ms; the painting and the game's set push in on plates 120 to 1620ms | the game's move from 700ms lands at 1800ms, the name stamps there (380ms), light crosses the glass 2200ms, the podium rises 2500ms | a draw follows: the set dims and the name docks 3750ms; the draw takes over at 4200ms |
| Face-off (TV) | dim 0 to 900ms, sting | sides slam at 900 / 1250ms, VS at 1900ms, record types 42ms a letter from 2700ms, win lines 3900ms | lifts off at 6600ms (3 beats + 600ms), total 7100ms |
| You're up (phone) | your color floods 0 to 700ms | YOU'RE UP stamps at 250ms (380ms), sting on the TV's VS | 7000ms player, 5000ms spectator banner |
| Walkout (win song) | color floods from the chip 0 to 800ms | art stands 250ms (520ms), name stamps 700ms (360ms) with the song's fade-in, song and artist 1100ms | docks into Now playing at 8400ms (700ms), total 9100ms |
| Walkout (team win) | the team's color (its first member's, as at the draw) floods from the centre 0 to 800ms | every member's chip lands 250ms on, 80ms apart (one row to five, then balanced rows), the team's name stamps 700ms, the song's cover sets into the singer's chip and the credit rises 1100ms | as the solo walkout; on every teammate's phone, yours lit |
| Crown (TV and every phone) | night falls 0 to 1800ms, "Final" lights 700ms | towers stand from 1600ms (100ms apart, done by 3.5s), go dark 13th to 3rd from 3600ms every 600ms, the last two hold 10200ms (2s), 2nd dark 12200ms, champion rises 13000ms, floods 14500ms, chip 15400ms, CHAMPION stamps 15900ms | name 16200ms, stack counts in 25s 17600 to 19400ms, medals 18200ms, constellation joins 19800ms, total 23500ms |
| Standings change | | rows slide 560ms, ranks roll 200ms | a settled result holds 2400ms |
| Heartbeat | | | one 2000ms beat, server-phased |
| Sheets | | rise 260ms | fall 200ms |

### Sound identity
Every sound is synthesized in one key, D (D, E, F sharp, A, B), with the motif A, D, F sharp. Materials: clay chips, felt, a wooden knock, a card flick, a low frame drum, a celesta-like sun-bell, a low bowl. Chip rain climbs a D-major ladder one step per chip; the crown's flood sounds a thirteen-phone D chord, each phone one bell by final rank (champion on top). Buses: `room` only on the TV, `you` (your own taps and moments) and `gm` (the commissioner's acknowledgement) only on a phone. The room's reverb follows the session (drier Friday, longest at the finale; phones take 45% of the send). Under a win song everything ducks to 25% over 150ms, except open recipes (the walkout stinger, the crown). Phone speakers cut below 380Hz, so low bodies (drum, felt, knock, bowl) are implied by up to four harmonics between 400 and 1500Hz. A cue more than 300ms late is dropped.

## Do's and Don'ts

### Do:
- **Do** pick a lamp by job: magenta (`--lamp-live`) for live and now, amber (`--sun`) for chips and money, cyan (`--lamp-info`) for navigation and info.
- **Do** show a hero count as a `ScoreReel`, every other count as a plain numeral, and every state as a lamp (steady live, flashing pending, unlit done, struck void).
- **Do** leave labels uncolored: a status reads in bone beside its lamp insert; color belongs to the lamp, the amount, the link and you.
- **Do** keep one painting per viewport (`GlassArt` in a `.fd-glass-scene`) and make every other panel a `.fd-glass-field` in its job's ink.
- **Do** letter event and people's names in Big Shoulders (show weight), and wrap any Big Shoulders label holding a lone 1 in `OneSafe` and any event name with a digit in `EventName`.
- **Do** anchor every moment to the server clock and give each animated element its end state as its resting style.
- **Do** keep phone text at 12px or more, TV text at 24px or more, and active controls at 44px or more.
- **Do** route every sound through `playSound` in the key of D on the right bus.

### Don't:
- **Don't** use `--you`, `--you-bloom` or `--you-tint` on anything that is not the viewer's own.
- **Don't** light a player's identity color (bloom, glow, chase) outside that player's own winning moment.
- **Don't** tint the glass ground by session; the session belongs to the painting and `--phase`.
- **Don't** put an eyebrow or kicker label above a heading; the heading carries itself. State sits in a lamp beside it (the Weekend cover lights a lamp for a live event; the row under it always reads "Then").
- **Don't** join two clauses on one line with a bullet, a dot or an icon between them. One fact per line (rules notes stack, a glyph leading each), or draw it.
- **Don't** use a gradient that means nothing (gradient text, decorative color washes on controls). **Do** use gradients that describe the glass: light across a pane, a recessed window's depth, a lit lens, a drum's curvature, the sky.
- **Don't** repeat a banner strip; one live line per surface.
- **Don't** set a lone 1 in uppercase Big Shoulders beside letters, or uppercase an event name that contains a digit.
- **Don't** let a glow appear without a state behind it.
- **Don't** write a raw hex or rgba outside `:root`, its `data-phase` blocks, and the player colors.
