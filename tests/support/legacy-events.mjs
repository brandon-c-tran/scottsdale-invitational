/* Event shapes the v1 slate had and the current slate dropped (Sept 29): a
   4-team 3v3 bracket at 800, pairs pools (Spikeball), solo heats of three
   (Ping Pong), a pairs bracket at 800 (Foosball), a solo 1200 (Nine-Hole),
   an even two-team game (Flip Cup) and a solo timed event (The Gauntlet).
   The draw, draft, stage and correction code still supports every one of
   them, so suites that exercise those shapes add them to a state as custom
   events (state.customEvents, which allEventsOf reads like the built-ins)
   instead of depending on the slate. */

export const LEGACY_EVENTS = Object.freeze([
  { id:"bball", n:105, session:"sam", value:800, name:"3v3 Basketball", kind:"team", sport:"bball", game:"basketball", variant:"3v3",
    teamCfg:{ teams:4, size:3, bracket:4 },
    desc:"Half court to 7 by 1s and 2s, win by 1. Call your own fouls." },
  { id:"spike", n:106, session:"sam", value:800, name:"Spikeball Doubles", kind:"pairs", sport:"spike", game:"spikeball",
    teamCfg:{ teams:6, size:2 },
    stageCfg:{ kind:"pools", nGroups:2, advance:1 },
    desc:"Two pools, winners meet in the final. To 11, win by 2, cap 15." },
  { id:"pingpong", n:107, session:"sam", value:800, name:"Ping Pong", kind:"solo", sport:"pingpong", game:"pingpong",
    stageCfg:{ kind:"heats", nGroups:3, advance:1 },
    desc:"Round-robin heats, then a final. Games to 11, win by 2, serve switches every two." },
  { id:"foosball", n:108, session:"sam", value:800, name:"Foosball", kind:"pairs", sport:"foosball", game:"foosball",
    teamCfg:{ teams:6, size:2, bracket:6 },
    desc:"Single elimination doubles. Split the rods, no spinning, first to 10 goals." },
  { id:"nine", n:110, session:"sap", value:1200, name:"Nine-Hole Putting", kind:"solo", sport:"golf", game:"putting",
    desc:"Nine holes, lowest total strokes. Max 5 per hole." },
  { id:"flip", n:113, session:"san", value:1600, name:"Flip Cup", kind:"team", sport:"flip", game:"flipcup",
    teamCfg:{ teams:2, size:6 },
    desc:"Best of 3. Flip clean, next teammate goes." },
  { id:"gauntlet", n:117, session:"san", value:1600, name:"The Gauntlet", kind:"solo", game:"gauntlet",
    desc:"One timed circuit: pressure putt, flip your cup, pong shot, die toss, center cup. Fastest clean run wins." },
]);

export const legacyEvent = id => LEGACY_EVENTS.find(ev => ev.id === id);

/* the state with the named legacy events added (all of them when none are named) */
export function withLegacyEvents(state, ids = null) {
  const wanted = LEGACY_EVENTS.filter(ev => !ids || ids.includes(ev.id));
  const have = new Set((state.customEvents || []).map(ev => ev.id));
  state.customEvents = [...(state.customEvents || []), ...wanted.filter(ev => !have.has(ev.id)).map(ev => structuredClone(ev))];
  return state;
}
