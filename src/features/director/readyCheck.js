/* Ready check: the commissioner's one look at what the weekend still needs,
   three weeks out and again on Friday morning. Every row is one fact read
   from the commissioner's own frame, never a guess: the guests' answers
   (counted over the weekend's roster, rosterOf, so a Not coming player never
   counts), the in-app games' content, and the room (the TVs, the speaker,
   alerts, the autopilot). A fact the frame does not carry (no TV list yet,
   the speaker not read, a desk whose capability is off) leaves its row out.
   Pure; nothing here writes.

   readyCheck(state, { capabilities, tvs, receivedAt, speaker, now }) gives
   [{ id, title, icon, rows }], empty sections dropped. A row:
     id, label  two or three words
     have, of   counts where they make sense (of null: a plain count; both
                null: the lamp alone)
     value      a short state word, or the speaker's name
     state      "ready" | "partial" | "missing" | "off" (switched off)
     opens      the commissioner menu id of the desk that fixes it, or null
     missing    the roster players a guest row still waits on, roster order */
import { allEventsOf, rosterOf } from "../../../shared/core.js";
import { checkInComplete } from "../../../shared/checkin.js";
import { jerseyConfirmed } from "../../../shared/guestSetup.js";
import { cleanWhen } from "../../../shared/geo.js";
import { triviaQuestionTotal } from "../../../shared/trivia.js";
import { hasKaraokeSong } from "../../../shared/karaoke.js";
import { hasFloatLook } from "../../../shared/float.js";
import { deskBallot } from "../awards/awardsModel.js";
import { speakerValue } from "../speaker/speakerModel.js";
import { liveTvs } from "./tvHealth.js";

export const READY_STATES = Object.freeze(["ready", "partial", "missing", "off"]);

const level = (have, of) => have >= of ? "ready" : have > 0 ? "partial" : "missing";
const row = (id, label, fields) => ({ id, label, have:null, of:null, value:null, state:"ready", opens:null, missing:[], ...fields });

/* one guest answer, counted over the roster */
function guestRow(state, roster, id, label, done, opens = null) {
  const missing = roster.filter(player => !done(state.profiles?.[player] || null, player));
  const have = roster.length - missing.length;
  return row(id, label, { have, of:roster.length, state:level(have, roster.length), opens, missing });
}

/* booked with both legs; "not booked yet" is still owed. Legs saved before
   the yes/no existed count as booked. */
export const flightsDone = profile => profile?.flightsBooked !== false && !!profile?.flightIn && !!profile?.flightOut;

function guestRows(state, capabilities) {
  const roster = rosterOf(state);
  return [
    /* the server's own rule: a saved name, a chip color and private ratings */
    guestRow(state, roster, "checkedIn", "Checked in", (profile, player) => checkInComplete(state, player), "attendance"),
    guestRow(state, roster, "photos", "Photos", profile => !!profile?.photoV),
    guestRow(state, roster, "colors", "Chip colors", profile => !!profile?.color),
    /* once ordered, what prints is settled */
    state.jerseysLocked ? row("jerseys", "Jerseys ordered", { opens:"travelSheet" })
      : guestRow(state, roster, "jerseys", "Jerseys confirmed", jerseyConfirmed, "travelSheet"),
    /* only while guests can pick one; the Speaker sheet lists them */
    capabilities.audioCatalog === true && guestRow(state, roster, "songs", "Win songs", profile => !!profile?.walkoutTrack,
      capabilities.audioDirector === true ? "audioDirector" : null),
    /* only while Karaoke is still to play and guests can pick its songs;
       the Karaoke desk shows whose video plays */
    capabilities.karaoke === true && ahead(state, allEventsOf(state), "karaoke")
      && guestRow(state, roster, "karaoke", "Karaoke songs", (profile, player) => hasKaraokeSong(state, player), "karaoke"),
    /* only while Float is still to play with its room on; the Float desk
       counts them too (a rider without one races their default) */
    capabilities.float === true && ahead(state, allEventsOf(state), "float")
      && guestRow(state, roster, "floaties", "Critters", profile => hasFloatLook(profile), "float"),
    guestRow(state, roster, "flights", "Flights", flightsDone, "travelSheet"),
    guestRow(state, roster, "venmo", "Venmo", profile => !!profile?.venmo, "travelSheet"),
    guestRow(state, roster, "drinks", "Drinks answered", profile => typeof profile?.drinking === "boolean", "travelSheet"),
  ].filter(Boolean);
}

/* a game still to play: on the slate, not shelved, no result yet */
const ahead = (state, events, game) => events.some(ev => ev.game === game && !state.shelved?.[ev.id] && !state.results?.[ev.id]);
const point = value => typeof value === "number" && Number.isFinite(value);
/* a Where and When round the game can play: its photo, the answer pin, the date and hour */
export const geoRoundReady = round => !!round?.photo?.id && point(round.lat) && point(round.lng) && !!cleanWhen(round.when);

function gameRows(state) {
  const events = allEventsOf(state);
  const rows = [];
  if (ahead(state, events, "trivia")) {
    const questions = triviaQuestionTotal(state.triviaRounds);
    rows.push(row("trivia", "Trivia", { have:questions, state:questions ? "ready" : "missing", opens:"trivia" }));
  }
  if (ahead(state, events, "where")) {
    const rounds = Array.isArray(state.geoRounds) ? state.geoRounds : [];
    const photos = rounds.filter(geoRoundReady).length;
    rows.push(row("geo", "Where and When", { have:photos,
      state:!photos ? "missing" : photos < rounds.length ? "partial" : "ready", opens:"geo" }));
  }
  const awards = deskBallot(state)?.questions?.length || 0;
  rows.push(row("awards", "Awards", { have:awards, state:awards ? "ready" : "missing", opens:"awards" }));
  return rows;
}

function roomRows(state, { capabilities, tvs, receivedAt, speaker, now }) {
  const rows = [];
  /* the TVs that spoke in the last minute (tvHealth.js); a TV on an older
     build never reports its sound and is not counted for it */
  const on = liveTvs(tvs, receivedAt, now);
  if (on) {
    rows.push(row("tv", "TV", { have:on.length, state:on.length ? "ready" : "missing", opens:"showControl" }));
    const heard = on.filter(tv => tv.sound === "on" || tv.sound === "blocked");
    const loud = heard.filter(tv => tv.sound === "on").length;
    if (heard.length) rows.push(row("tvSound", "TV sound", { have:loud, of:heard.length, state:level(loud, heard.length),
      opens:"showControl" }));
  }
  /* the speaker as /api/spotify/status last answered this device */
  if (capabilities.audioDirector === true && speaker && speaker.ok !== false) {
    const connected = !!speaker.configured && !!speaker.connected && !speaker.reconnect;
    const premium = speaker.premium !== false;
    rows.push(row("speaker", "Speaker", { value:connected && !premium ? "Needs Spotify Premium" : speakerValue(speaker),
      state:!connected ? "missing" : !speaker.device?.id || !premium ? "partial" : "ready", opens:"audioDirector" }));
    if (connected && typeof speaker.autoWinSongs === "boolean") {
      const auto = speaker.autoWinSongs && speaker.playbackEnabled !== false;
      rows.push(row("autoSongs", "Auto win songs", { value:auto ? null : "Off", state:auto ? "ready" : "off",
        opens:"audioDirector" }));
    }
  }
  const push = capabilities.push === true;
  rows.push(row("alerts", "Alerts", { value:push ? null : "Off", state:push ? "ready" : "off" }));
  const held = state.autopilot?.hold === true;
  rows.push(row("autopilot", "Autopilot", { value:held ? "Paused" : null, state:held ? "off" : "ready" }));
  return rows;
}

export function readyCheck(state, { capabilities = {}, tvs = null, receivedAt = 0, speaker = null, now = Date.now() } = {}) {
  const s = state || {};
  const caps = capabilities || {};
  return [
    { id:"guests", title:"Guests", icon:"people", rows:guestRows(s, caps) },
    { id:"games", title:"Games", icon:"games", rows:gameRows(s) },
    { id:"room", title:"Room", icon:"tv", rows:roomRows(s, { capabilities:caps, tvs, receivedAt, speaker, now }) },
  ].filter(section => section.rows.length);
}

export const readyRows = sections => sections.flatMap(section => section.rows);
/* everything not ready is to do, a switch left off included */
export const readyTodo = sections => readyRows(sections).filter(item => item.state !== "ready").length;
/* the menu row's value */
export const readyValue = todo => todo ? `${todo} to do` : "Ready";
