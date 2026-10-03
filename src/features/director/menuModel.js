/* The app's two menus as data: the header's More menu (anyone) and the
   commissioner's menu (the star). One grouping logic and one renderer
   (src/ui/Menu.jsx MenuSections); App maps each item id to its action.

   Grouping, in the order a hand reaches for it: who you are, the weekend,
   the room's TV, then the commissioner's work by how often it happens. Rare
   and destructive rows sit last, and every one of them still opens its own
   confirm; Exit stands alone at the foot. Values are state ("2 away",
   "8 photos"), never a sentence about the row. Pure. */

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

export function commissionerMenu(f = {}) {
  const away = f.away || [];
  return [
    section("show", "The room", "tv", [
      f.showControl && { id:"showControl", name:"Show Control", value:f.scene || "Ambient" },
      !f.showControl && f.audioDirector && { id:"audioDirector", name:"Audio Director" },
      { id:"tvShortcut", name:"Copy TV sound shortcut", chevron:false },
    ]),
    section("weekend", "Weekend", "weekend", [
      f.crownReady && { id:"crown", name:"Crown the champion", icon:"trophy" },
      { id:"attendance", name:"Who is here", icon:"people", value:away.length ? `${away.length} away` : "Everyone" },
      { id:"geo", name:"Where and When", icon:"pin", value:plural(f.geoPhotos || 0, "photo") },
      { id:"trivia", name:"Trivia", icon:"games", value:plural(f.triviaQuestions || 0, "question") },
      { id:"awards", name:"Awards", icon:"awards", value:f.awardsNote || null },
    ]),
    section("fix", "Fix", "undo", [
      f.onDeck && { id:"lockBets", name:"Lock bets", value:f.onDeck, icon:"lock", chevron:false },
      ...(f.takeBacks || []).map(ev => ({ id:`takeBack:${ev.id}`, name:`Take back ${ev.name}`, icon:"undo" })),
      f.lockerRoom && { id:"lockerRoom", name:"Back to the locker room", icon:"back" },
      f.frozen && { id:"unfreeze", name:"Unfreeze board", tone:"destructive" },
    ]),
    section("records", "Records", "rules", [
      { id:"logistics", name:"Trip details", icon:"house" },
      { id:"travelSheet", name:"Travel sheet", icon:"plane" },
      { id:"gmDevices", name:"Commissioner devices", icon:"person" },
      f.snapshotExport && { id:"snapshot", name:"Export snapshot", chevron:false },
    ]),
    section("rehearsal", "Rehearsal", "flask", [
      f.qaAllowed && { id:"qa", name:"QA mode", pressed:!!f.qaOn },
      f.progressReset && { id:"reset", name:"Reset game progress", tone:"destructive" },
    ]),
    section("exit", null, null, [
      { id:"exit", name:"Exit commissioner", icon:"exit", chevron:false },
    ]),
  ].filter(item => item.items.length);
}
