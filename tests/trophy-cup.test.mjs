/* The weekend's cup (Oct 3): the champion on the cup, every event's
   winners engraved on its base, one band per session in slate order.
   The pure model (src/features/weekend/trophy.js) is what the phone, the
   TV and the keepsake all draw, so it is tested here on real reducer
   states (dev/fit/scenarios.js). */
import test from "node:test";
import assert from "node:assert/strict";
import { EMPTY_STATE, SESSIONS, allEventsOf, computeStandings } from "../shared/core.js";
import { fresh, longNames, act } from "../dev/fit/scenarios.js";
import {
  CUP_TV, ENGRAVE, cupEngravings, cupTvLayout, engraveTotal, fitChampionName, fitPlateName, plateEngraving, plateNameWidth,
  trophyCup,
} from "../src/features/weekend/trophy.js";
import { engraveCues } from "../src/features/tv/roomSound.js";

const cupOf = state => trophyCup(state, allEventsOf(state));
const plateOf = (cup, id) => cup.plates.find(plate => plate.eventId === id);

test("one band per session, top to bottom in time, plates in slate order; the finale is the cup", () => {
  const state = structuredClone(EMPTY_STATE);
  const events = allEventsOf(state);
  const cup = trophyCup(state, events);
  assert.deepEqual(cup.bands.map(band => band.session), ["fri", "sam", "sap", "san"]);
  assert.deepEqual(cup.bands.map(band => band.label), SESSIONS.slice(0, 4).map(session => session.label));
  const slate = events.filter(ev => !ev.finale).map(ev => ev.id);
  assert.deepEqual(cup.bands.flatMap(band => band.plates.map(plate => plate.eventId)), slate, "slate order, band by band");
  assert.ok(!cup.plates.some(plate => plate.eventId === "poker"), "the finale has no plate");
  assert.equal(cup.total, 12);
  assert.equal(cup.posted, 0);
  assert.ok(cup.plates.every(plate => !plate.posted && !plate.engraving), "every plate blank before a result");
  assert.equal(cup.crowned, false);
  assert.deepEqual(cup.champions, []);
});

test("a reordered slate keeps each band's plates in the new order; a skipped event has no plate", () => {
  const state = structuredClone(EMPTY_STATE);
  state.eventOrder = ["where", "putt", "die"];
  state.shelved = { pong:true };
  const cup = cupOf(state);
  assert.deepEqual(cup.bands[0].plates.map(plate => plate.eventId), ["where", "putt", "die"]);
  assert.ok(!plateOf(cup, "pong"));
  assert.equal(cup.total, 11);
});

test("posted plates are engraved, the rest stay blank, the next one is outlined", () => {
  const early = cupOf(fresh("event:die:done"));
  assert.equal(early.posted, 2);
  assert.deepEqual(early.plates.filter(plate => plate.posted).map(plate => plate.eventId), ["putt", "die"]);
  assert.ok(early.plates.filter(plate => plate.posted).every(plate => plate.postedAt > 0 && plate.engraving?.players.length));
  assert.deepEqual(early.plates.filter(plate => plate.next).map(plate => plate.eventId), ["where"], "the next event is outlined");
  assert.ok(!plateOf(early, "where").live, "not lit until it is in play");

  const mid = cupOf(fresh("event:volley:done"));
  assert.equal(mid.posted, 7);
  assert.equal(mid.bands[2].plates.filter(plate => plate.posted).length, 1, "Saturday afternoon: one engraved");

  const live = cupOf(fresh("event:putt:open"));
  assert.ok(plateOf(live, "putt").next && plateOf(live, "putt").live, "the event in play is lit");
});

test("who a plate engraves: a player, a pair by first names, a team by its name", () => {
  const state = fresh("event:volley:done");
  const cup = cupOf(state);
  const putt = plateOf(cup, "putt").engraving;
  assert.equal(putt.kind, "solo");
  assert.equal(putt.players.length, 1);

  const die = plateOf(cup, "die").engraving;
  assert.equal(die.kind, "pair");
  assert.equal(die.players.length, 2);
  assert.match(die.name, /^\S+ & \S+$/, "a pair is both first names");

  const bball5 = plateOf(cup, "bball5").engraving;
  assert.equal(bball5.kind, "team");
  assert.ok(bball5.players.length >= 6, "the whole side");
  const team = state.draws.bball5.teams.find(item => item.players.every(p => bball5.players.includes(p)));
  assert.equal(bball5.name, team.name, "a team is engraved by its name");
});

test("first names for a pair: a surname is dropped, a name with no first name stays whole", () => {
  const state = structuredClone(EMPTY_STATE);
  state.profiles = { Henry:{ display:"Henry Nguyen" }, Jeremy:{ display:"j vo" } };
  state.draws = { die:{ id:"d1", teams:[{ players:["Henry", "Jeremy"] }] } };
  assert.equal(plateEngraving(state, "die", ["Henry", "Jeremy"]).name, "Henry & j vo");
  state.draws.die.teams[0].name = "Dink Responsibly";
  assert.equal(plateEngraving(state, "die", ["Henry", "Jeremy"]).name, "Dink Responsibly", "a pair that took a name keeps it");
});

test("a split 1st names both; past two it is counted", () => {
  const state = structuredClone(EMPTY_STATE);
  state.profiles = { Adi:{ display:"Adi" }, Ben:{ display:"Ben" }, Evan:{ display:"Evan" } };
  const two = plateEngraving(state, "putt", ["Adi", "Ben"]);
  assert.equal(two.kind, "tie");
  assert.equal(two.name, "Adi, Ben");
  assert.equal(plateEngraving(state, "putt", ["Adi", "Ben", "Evan"]).name, "3 tied");
});

test("renamed teams are engraved by their new names, every one fitting a TV plate at 24px or more", () => {
  const state = ["die", "bball5", "volley"].reduce((s, evId) => longNames(s, evId), fresh("event:trivia:done"));
  const cup = cupOf(state);
  const layout = cupTvLayout(cup);
  cup.bands.forEach((band, index) => band.plates.filter(plate => plate.posted).forEach(plate => {
    const fit = fitPlateName(plate.engraving.name, plateNameWidth(layout.bands[index].plateW, plate.engraving.players.length));
    assert.ok(fit.size >= 24, `${plate.eventId}: ${fit.size}px`);
    assert.ok(fit.lines.length <= 2);
    /* the plaque holds the name's lines beside its game's mark and faces */
    const height = Math.max(CUP_TV.plate.mark, CUP_TV.plate.face, fit.lines.length * fit.size * 1.12);
    assert.ok(height <= layout.bands[index].plateH, `${plate.eventId} fits its plate (${Math.round(height)})`);
  }));
  assert.ok(cup.plates.some(plate => /Quizerables/.test(plate.engraving?.name || "")));
});

test("the TV's cup keeps the 24px floor and stays inside the canvas", () => {
  const layout = cupTvLayout(cupOf(structuredClone(EMPTY_STATE)));
  assert.ok(layout.width <= 1920 - 2 * 64, "inside the title-safe width");
  assert.equal(layout.bands.length, 4);
  layout.bands.forEach(band => {
    assert.equal(band.cols, 3);
    assert.ok(band.plateH >= 2 * CUP_TV.plate.name.two * 1.12, "a plaque holds a name in two lines beside its mark and faces");
    assert.ok(band.width <= layout.width, "no tier wider than the cup's room");
  });
  const used = CUP_TV.bowl.height + CUP_TV.collar - CUP_TV.sag + CUP_TV.top + CUP_TV.foot
    + layout.bands.reduce((sum, band) => sum + band.height, 0) + 3 * CUP_TV.rim;
  assert.ok(used <= CUP_TV.height, `the cup fits the main area (${used})`);
  assert.equal(fitChampionName("Adi").size, 52);
  const long = fitChampionName("Squilliam & Henry Nguyen");
  assert.ok(long.size >= 24 && long.lines.length === 2, "co-champions take two lines");
});

test("the crown engraves the champion on the cup", () => {
  const state = fresh("crowned");
  const cup = cupOf(state);
  assert.equal(cup.crowned, true);
  /* the cup carries whoever tops the frozen board: one champion, or every
     co-champion on a tie */
  const standings = computeStandings(state);
  const top = standings.filter(row => row.pts === standings[0].pts).map(row => row.player).sort();
  assert.deepEqual(cup.champions.map(champ => champ.player).sort(), top);
  assert.equal(cup.posted, cup.total, "every plate engraved by the crown");
});

test("engravings: a plate engraves the first trophy turn after its result's moment, once", () => {
  const state = fresh("event:die:done");
  /* Long Putt posted well before Beer Die */
  state.results.putt.confirmedAt = state.results.putt.ts = state.results.die.confirmedAt - 3_600_000;
  const cup = cupOf(state);
  const die = plateOf(cup, "die");
  const hold = 20000, cycleMs = 80000;
  /* this turn starts 5s after the result's moment ended: it engraves */
  const turnAt = die.postedAt + hold + 5000;
  const plan = cupEngravings(cup, { turnAt, cycleMs, hold });
  assert.deepEqual(plan.map(item => item.target), ["die"]);
  assert.equal(plan[0].at, turnAt + ENGRAVE.lead);
  /* the next pass of the rotation does not engrave it again */
  assert.deepEqual(cupEngravings(cup, { turnAt:turnAt + cycleMs, cycleMs, hold }), []);
  /* a turn while the result still holds the room leaves it for the next one */
  assert.deepEqual(cupEngravings(cup, { turnAt:die.postedAt + 5000, cycleMs, hold }), []);
  assert.deepEqual(cupEngravings(cup, { turnAt:die.postedAt + 5000 + cycleMs, cycleMs, hold }).map(item => item.target), ["die"]);
  /* no turn, nothing */
  assert.deepEqual(cupEngravings(cup, {}), []);
  assert.equal(engraveTotal([]), 0);
  assert.equal(engraveTotal(plan), ENGRAVE.sweep + ENGRAVE.settle);
});

test("engravings: the champion is cut into the cup after the crown and its class photo", () => {
  const cup = cupOf(fresh("crowned"));
  const crownEnd = 1_800_000_000_000, period = 12000;
  const turnAt = crownEnd + period + 3000;
  const plan = cupEngravings(cup, { turnAt, cycleMs:3 * period, hold:20000, crownEnd, crownHold:period });
  assert.deepEqual(plan.map(item => item.target), ["cup"]);
  assert.deepEqual(cupEngravings(cup, { turnAt:turnAt + 3 * period, cycleMs:3 * period, hold:20000, crownEnd, crownHold:period }), []);
});

test("one room sound per engraving turn, on the turn's clock", () => {
  const plan = [{ key:"die:1", target:"die", at:1000 }, { key:"putt:2", target:"putt", at:1700 }];
  const cues = engraveCues(plan, ENGRAVE.cut);
  assert.equal(cues.length, 1);
  assert.equal(cues[0].id, "engrave");
  assert.equal(cues[0].at, 1000 + ENGRAVE.cut);
  assert.equal(cues[0].key, "engrave:die:1|putt:2");
  assert.deepEqual(engraveCues([]), []);
});

test("a correction re-engraves: the plate reads the official result", () => {
  const state = fresh("event:putt:done");
  const before = plateOf(cupOf(state), "putt").engraving.players[0];
  const slots = state.results.putt.slots.map(list => [...list]);
  const swapped = [slots[1], slots[0], slots[2]];
  act(state, "saveResult", { evId:"putt", slots:swapped, correctionReason:"Wrong winner", confirmOverwrite:true });
  const after = plateOf(cupOf(state), "putt").engraving.players[0];
  assert.notEqual(after, before);
  assert.equal(after, swapped[0][0]);
});
