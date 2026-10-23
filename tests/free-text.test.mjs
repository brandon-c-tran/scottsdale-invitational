/* Free text a guest or the commissioner writes reaches the server's state
   clean and capped (shared/freeText.js): control characters and invisible
   direction or format marks out, emoji kept whole, never cut inside a
   character, and what is already stored is never rewritten. Each write path
   that keeps free text is pinned here: a display name, an event's name and
   note, a ruling's reason, a correction's reason, a Where and When place and
   caption, a Trivia question, its options and round name, an award's title,
   food or drink needs, the house notes. */
import test from "node:test";
import assert from "node:assert/strict";

import { AWARD_VALUES, EMPTY_STATE, RESET_PROGRESS_CONFIRMATION, allEventsOf, resolveCurrentContest } from "../shared/core.js";
import { applyAction } from "../worker/actions.js";
import { capText, cleanFreeText } from "../shared/freeText.js";
import { cleanNeeds } from "../shared/guestSetup.js";

const ch = (...codes) => String.fromCodePoint(...codes);
const RLO = ch(0x202E), ZWSP = ch(0x200B), BOM = ch(0xFEFF), BEL = ch(7), NUL = ch(0), LSEP = ch(0x2028);
const FOX = ch(0x1F98A), TECHNOLOGIST = ch(0x1F469, 0x1F3FD, 0x200D, 0x1F4BB), SCOTLAND = ch(0x1F3F4, 0xE0067, 0xE0062,
  0xE0073, 0xE0063, 0xE0074, 0xE007F);

let n = 0;
const gm = () => ({ isGm:true, qa:true, progressReset:true, environment:"local", player:"Brandon", deviceId:"free-text",
  actionId:`ft-${++n}`, showControl:false });
const as = player => ({ isGm:false, player, deviceId:`free-text-${player}`, actionId:`ft-${++n}` });
const act = (state, type, payload, ctx = gm()) => {
  const result = applyAction(state, type, payload, ctx);
  assert.equal(result.ok, true, `${type}: ${result.error}`);
  return result;
};
const fresh = (target = "locker") => {
  const state = structuredClone(EMPTY_STATE);
  act(state, "qaAdvance", { target, seed:7, confirm:RESET_PROGRESS_CONFIRMATION, confirmPokerLive:true });
  return state;
};

test("free text: controls and invisible marks out, spaces squeezed, emoji whole", () => {
  assert.equal(cleanFreeText(`  Big\nTom\t `, 16), "Big Tom", "a line break or tab is a space");
  assert.equal(cleanFreeText(`Evil${RLO}eman`, 16), "Evileman", "a direction override is dropped, not lettered");
  assert.equal(cleanFreeText(`a${ZWSP}b${BOM}c${BEL}d${NUL}`, 16), "abcd", "zero-width, byte-order and bell marks are dropped");
  assert.equal(cleanFreeText(`a${LSEP}b`, 16), "a b");
  assert.equal(cleanFreeText(`${TECHNOLOGIST} Priya`, 16), `${TECHNOLOGIST} Priya`, "a joined emoji keeps its joiner");
  assert.equal(cleanFreeText(`${SCOTLAND} Scot`, 30), `${SCOTLAND} Scot`, "a subdivision flag keeps its tags");
  assert.equal(cleanFreeText(`Nguye${ch(0x302, 0x303)}n`, 16), `Nguy${ch(0x1EC5)}n`, "composed (NFC), so lengths count letters");
  assert.equal(cleanFreeText(42, 16), "", "not text");
  assert.equal(cleanFreeText(`${NUL}${BEL}`, 16), "", "nothing left");
  assert.equal(cleanFreeText("line one\r\n\r\n\r\nline two  ", 300, { lines:true }), "line one\n\nline two", "a note keeps its breaks");
  assert.equal(cleanFreeText("line one\nline two", 300), "line one line two");
});

test("free text: capped at a character boundary, never inside an emoji", () => {
  assert.equal(cleanFreeText("x".repeat(20), 16), "x".repeat(16));
  assert.equal(cleanFreeText(`Fifteen chars!!${FOX}`, 16), "Fifteen chars!!", "a fox cut in half is no fox");
  const cut = cleanFreeText(`Fourteen char ${TECHNOLOGIST}`, 16);
  assert.ok(!/[\uD800-\uDBFF]$/.test(cut) && !cut.endsWith(ch(0x200D)), "no lone surrogate, no dangling joiner");
  assert.ok(cut.length <= 16);
  assert.equal(capText(`abc${FOX}`, 4), "abc");
  assert.equal(capText("short", 16), "short");
});

test("a display name: cleaned and capped at 16 on a new write, a saved one kept as it is", () => {
  const state = fresh();
  act(state, "saveProfile", { player:"Henry", display:`  Henry${RLO} Nguyen${ZWSP}  ` }, as("Henry"));
  assert.equal(state.profiles.Henry.display, "Henry Nguyen");
  act(state, "saveProfile", { player:"Henry", display:`Henry Nguyen ${FOX}` }, as("Henry"));
  assert.equal(state.profiles.Henry.display, `Henry Nguyen ${FOX}`, "15 units, the fox whole");
  act(state, "saveProfile", { player:"Henry", display:`Henry Nguyen Jr${FOX}` }, as("Henry"));
  assert.equal(state.profiles.Henry.display, "Henry Nguyen Jr", "17 units: the fox goes whole, not half");
  assert.equal(applyAction(state, "saveProfile", { player:"Henry", display:`${ZWSP}${BEL}` }, as("Henry")).error, "Add your name");
  /* a name stored before the cleaner (here with a mark it would drop) is
     never rewritten by a save that sends it back unchanged */
  state.profiles.Ben = { ...state.profiles.Ben, display:`Ben${ZWSP}` };
  act(state, "saveProfile", { player:"Ben", display:`Ben${ZWSP}`, venmo:"ben-w" }, as("Ben"));
  assert.equal(state.profiles.Ben.display, `Ben${ZWSP}`);
  assert.equal(state.profiles.Ben.venmo, "ben-w");
});

test("needs: control marks out, refused past 120", () => {
  assert.equal(cleanNeeds(`No${BEL} shellfish${RLO}`), "No shellfish");
  assert.equal(cleanNeeds("x".repeat(121)), undefined);
  assert.equal(cleanNeeds(`${NUL} `), null);
});

test("the commissioner's words: event names, rulings, corrections, houses", () => {
  const state = fresh();
  act(state, "editEvent", { id:"putt", patch:{ name:`Long Putt${RLO}\nSudden Death Final Round`, desc:"Line one\r\nLine two" } });
  const putt = allEventsOf(state).find(ev => ev.id === "putt");
  assert.equal(putt.name, "Long Putt Sudden Death Final", "28 at most, one line");
  assert.equal(putt.desc, "Line one\nLine two");
  assert.equal(applyAction(state, "editEvent", { id:"putt", patch:{ name:`${ZWSP} ` } }, gm()).error, "Name the event");
  act(state, "addEvent", { ev:{ id:"cornhole", name:`Cornhole${BEL} Championship Finals Night`, value:AWARD_VALUES[0],
    kind:"solo" } });
  assert.equal(allEventsOf(state).find(ev => ev.id === "cornhole").name, "Cornhole Championship Finals");
  act(state, "adjust", { player:"Henry", delta:-400, reason:`Dropped the trophy${RLO}\n on the driveway during the Saturday night victory lap parade again` });
  assert.equal(state.adjustments[0].reason, "Dropped the trophy on the driveway during the Saturday night victory lap parade");
  act(state, "saveLogistics", { venueNote:`Door code 4411${BEL}\r\nPark on the left`, checkIn:`Fri 4 PM${RLO}` });
  assert.equal(state.logistics.venueNote, "Door code 4411\nPark on the left");
  assert.equal(state.logistics.checkIn, "Fri 4 PM");
});

test("a correction's reason: one clean line of at most 100", () => {
  const state = fresh("event:putt:open");
  const ev = allEventsOf(state).find(item => item.id === "putt");
  const contest = resolveCurrentContest(state, ev);
  act(state, "lockAndStart", { evId:"putt", contestId:contest.id, contestRevision:contest.revision, startWeekend:true });
  act(state, "beginResultEntry", { evId:"putt" });
  act(state, "saveResult", { evId:"putt", slots:[["Evan"], ["Khoa"], ["Adi"]] });
  act(state, "saveResult", { evId:"putt", slots:[["Khoa"], ["Evan"], ["Adi"]], confirmOverwrite:true,
    correctionReason:`Wrong${RLO} order\n${"x".repeat(120)}` });
  const reason = state.results.putt.correctionReason;
  assert.ok(reason.startsWith("Wrong order x") && reason.length <= 100 && !reason.includes(RLO) && !reason.includes("\n"), reason);
});

test("Where and When, Trivia and awards: the commissioner's text cleaned at its caps", () => {
  const state = fresh();
  act(state, "geoSaveRound", { id:"gfreetext1", photo:{ id:"gfreephoto1", w:1600, h:1200 }, lat:36.05, lng:-112.14,
    place:`Grand Canyon${RLO} Village`, when:"2019-07-04T05", caption:`Sunrise${BEL}\nmissed` });
  assert.deepEqual([state.geoRounds[0].place, state.geoRounds[0].caption], ["Grand Canyon Village", "Sunrise missed"]);
  act(state, "triviaSaveRound", { round:{ id:"tfreetext01", source:"custom", name:`The groom${ZWSP}${RLO}`, questions:[
    { id:"qfreetext01", format:"choice", text:`Which${BEL} one?`, options:[`A${RLO}`, "B", "C", `D${ZWSP}`], answer:0 },
  ] } });
  const round = state.triviaRounds.find(item => item.id === "tfreetext01");
  assert.equal(round.name, "The groom");
  assert.equal(round.questions[0].text, "Which one?");
  assert.deepEqual(round.questions[0].options, ["A", "B", "C", "D"]);
  act(state, "promptSave", { id:"bfreetext", kind:"awards", questions:[{ id:"qfreetitle", title:`Best${ZWSP} dressed${RLO}`, nominees:null }] });
  assert.equal(state.prompts.ballots[0].questions[0].title, "Best dressed");
});
