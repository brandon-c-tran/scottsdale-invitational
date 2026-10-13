/* The app's two menus as data: the header's More menu (anyone) and the
   commissioner's menu (the star). One grouping logic and one renderer
   (src/ui/Menu.jsx MenuSections); App maps each item id to its action.

   The commissioner's sections run in the order a hand reaches for them:
   what needs doing now, the show (the TV, the speaker, and Settings: every
   switch the weekend has in one list, settingsMenu below), the games he
   runs, the people and the trip, then setup. Destructive rows still open their own
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
    /* the commissioner has one way in: the header's GM. This row is only
       the PIN (a guest's phone) or the way back from the guest view, where
       the header hides it */
    section("commissioner", "Commissioner", "star", [
      !f.gm ? { id:"commissioner", name:"Commissioner", icon:"lock" }
        : f.guestLens ? { id:"commissioner", name:"Back to commissioner", icon:"star" } : null,
    ]),
  ].filter(item => item.items.length);
}

/* the games the commissioner runs from a desk of their own */
const GAME_DESKS = [
  f => ({ id:"geo", name:"Where and When", icon:"pin", value:plural(f.geoPhotos || 0, "photo") }),
  f => ({ id:"trivia", name:"Trivia", icon:"games", value:plural(f.triviaQuestions || 0, "question") }),
  /* Karaoke's desk, when the build has one (f.karaoke: its value, or "") */
  f => f.karaoke !== undefined && f.karaoke !== null
    ? { id:"karaoke", name:"Karaoke", icon:"song", value:f.karaoke || null } : null,
  f => ({ id:"awards", name:"Awards", icon:"awards", value:f.awardsNote || null }),
];

export function commissionerMenu(f = {}) {
  const away = f.away || [];
  const out = f.out || [];
  /* what the weekend still needs (readyCheck.js): the priority in Now
     before the weekend is live, a check in Setup after. `readyCheck` is its
     value ("4 to do", "Ready") */
  const ready = f.readyCheck ? { id:"readyCheck", name:"Ready check", icon:"check", value:f.readyCheck } : null;
  return [
    section("now", "Now", "then", [
      f.crownReady && { id:"crown", name:"Crown the champion", icon:"trophy" },
      /* the same write and the same words as the pill's lock beat */
      f.onDeck && { id:"lockStart", name:"Lock and start", value:f.onDeck, icon:"lock", chevron:false },
      ...(f.takeBacks || []).map(ev => ({ id:`takeBack:${ev.id}`, name:`Take back ${ev.name}`, icon:"undo", tone:"destructive" })),
      f.lockerRoom && { id:"lockerRoom", name:"Back to the locker room", icon:"back" },
      f.frozen && { id:"unfreeze", name:"Unfreeze board", tone:"destructive" },
      !f.live && ready,
    ]),
    section("room", "The show", "tv", [
      { id:"showControl", name:"TV", icon:"tv", value:f.tvNow || null },
      f.audioDirector && { id:"audioDirector", name:"Speaker", icon:"sound", value:f.speaker || null },
      /* every switch in one list; its value names what is off */
      { id:"settings", name:"Settings", icon:"menu", value:f.settingsOff || null },
    ]),
    section("games", "Games", "games", GAME_DESKS.map(desk => desk(f))),
    section("people", "People", "people", [
      { id:"attendance", name:"Who is coming", icon:"people",
        value:f.arrivals ? `${f.arrivals.here} of ${f.arrivals.total} here`
          : out.length ? `${f.coming} coming` : away.length ? `${away.length} away` : "Everyone" },
      { id:"travelSheet", name:"Travel sheet", icon:"plane" },
      { id:"logistics", name:"Trip details", icon:"house" },
    ]),
    section("setup", "Setup", "lock", [
      f.live && ready,
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

/* Every switch the weekend has, in one list (the menu's Settings row).
   Each item is a switch (`pressed`) and its id is the write App makes: the
   same write as the switch's own home, which keeps its control too (the
   pill's tray, the TV sheet, Speaker, Who is coming, the travel sheet, the
   QA console). A switch whose capability is off is not listed. */
export function settingsMenu(f = {}) {
  return [
    section("show", "The show", "tv", [
      { id:"autopilot", name:"Autopilot", pressed:!f.autopilotHeld },
      { id:"gags", name:"Gags", pressed:f.gags !== false },
      /* the speaker's own setting: unknown until Spotify answers */
      f.audioDirector && { id:"autoWinSongs", name:"Play win songs automatically",
        pressed:f.autoWinSongs === true, disabled:typeof f.autoWinSongs !== "boolean" },
    ]),
    section("people", "People", "people", [
      { id:"door", name:"Check-in", value:f.doorOpen ? "Open" : "Closed", pressed:!!f.doorOpen },
      { id:"jerseys", name:"Jerseys ordered", pressed:!!f.jerseysLocked },
    ]),
    section("setup", "Setup", "lock", [
      f.qaAllowed && { id:"qaStrip", name:"QA strip", pressed:!!f.qaOn },
    ]),
  ].filter(item => item.items.length);
}

/* the Settings row's value: what is off that the weekend means to run */
export function settingsOff(f = {}) {
  const off = [f.autopilotHeld && "Autopilot", f.gags === false && "Gags", f.autoWinSongs === false && "Win songs"]
    .filter(Boolean);
  return off.length ? `${off.join(", ")} off` : null;
}
