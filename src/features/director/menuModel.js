/* The app's two menus as data: the header's More menu (anyone) and the
   commissioner's menu (the star). One grouping logic and one renderer
   (src/ui/Menu.jsx MenuSections); App maps each item id to its action.

   The commissioner's sections run in the order a hand reaches for them:
   what needs doing now, the room's TV and speaker, the games he runs, the
   people and the trip, then setup. Destructive rows still open their own
   confirm; Exit stands alone at the foot. Values are state ("2 away",
   "8 photos", the speaker's name), never a sentence about the row. A new
   desk (Trivia) is one more item in GAME_DESKS. Pure. */

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

const section = (id, title, icon, items, extra = {}) => ({ id, title, icon, items:items.filter(Boolean), ...extra });

/* f: what the App knows. Missing flags read as off. */
export function moreMenu(f = {}) {
  return [
    section("you", "You", "person", [
      { id:"profile", name:"Your profile" },
    ]),
    section("weekend", "Weekend", "weekend", [
      { id:"trip", name:"Trip details", icon:"house" },
      { id:"rules", name:"Rules", icon:"rules" },
      { id:"tv", name:"TV mode", icon:"tv" },
    ]),
    section("commissioner", "Commissioner", "star", [
      f.gm ? { id:"commissioner", name:"Commissioner menu" }
        : { id:"commissioner", name:"Commissioner", icon:"lock" },
    ]),
  ].filter(item => item.items.length);
}

/* the games the commissioner runs from a desk of their own */
const GAME_DESKS = [
  f => ({ id:"geo", name:"Where and When", icon:"pin", value:plural(f.geoPhotos || 0, "photo") }),
  f => ({ id:"trivia", name:"Trivia", icon:"games", value:plural(f.triviaQuestions || 0, "question") }),
  f => ({ id:"awards", name:"Awards", icon:"awards", value:f.awardsNote || null }),
];

export function commissionerMenu(f = {}) {
  const away = f.away || [];
  return [
    section("now", "Now", "then", [
      f.crownReady && { id:"crown", name:"Crown the champion", icon:"trophy" },
      f.onDeck && { id:"lockBets", name:"Lock bets", value:f.onDeck, icon:"lock", chevron:false },
      ...(f.takeBacks || []).map(ev => ({ id:`takeBack:${ev.id}`, name:`Take back ${ev.name}`, icon:"undo" })),
      f.lockerRoom && { id:"lockerRoom", name:"Back to the locker room", icon:"back" },
      f.frozen && { id:"unfreeze", name:"Unfreeze board", tone:"destructive" },
    ]),
    section("room", "TV and sound", "tv", [
      { id:"showControl", name:"TV", icon:"tv", value:f.tvNow || null },
      f.audioDirector && { id:"audioDirector", name:"Speaker", icon:"song", value:f.speaker || null },
    ]),
    section("games", "Games", "games", GAME_DESKS.map(desk => desk(f))),
    section("people", "People and trip", "people", [
      { id:"attendance", name:"Who is here", icon:"people", value:away.length ? `${away.length} away` : "Everyone" },
      { id:"travelSheet", name:"Travel sheet", icon:"plane" },
      { id:"logistics", name:"Trip details", icon:"house" },
    ]),
    section("setup", "Setup", "lock", [
      { id:"gmDevices", name:"Commissioner devices", icon:"person" },
      f.snapshotExport && { id:"snapshot", name:"Export snapshot", icon:"down", chevron:false },
      f.qaAllowed && { id:"qa", name:"QA", icon:"flask", value:f.qaOn ? "Strip on" : null },
      f.progressReset && { id:"reset", name:"Reset game progress", tone:"destructive" },
    ]),
    section("exit", null, null, [
      { id:"exit", name:"Exit commissioner", icon:"exit", chevron:false },
    ]),
  ].filter(item => item.items.length);
}
