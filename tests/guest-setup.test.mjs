/* Before the weekend: the jersey a guest confirms (back name, number, size),
   the commissioner's "Jerseys ordered" lock, Venmo / drinking / food needs,
   who sees them, and Home's list of what is still owed. */
import test from "node:test";
import assert from "node:assert/strict";

import { EMPTY_STATE, RESET_PROGRESS_CONFIRMATION, ROSTER } from "../shared/core.js";
import {
  cleanBackName, cleanNeeds, cleanVenmo, jerseyConfirmed, jerseyName, setupTodo,
} from "../shared/guestSetup.js";
import { QA_PROGRESS_KEYS } from "../shared/qa.js";
import { publicState } from "../worker/publicState.js";
import { applyAction } from "../worker/actions.js";

const me = ROSTER[0], other = ROSTER[1];
const gm = { isGm:true, player:null };
const guest = player => ({ isGm:false, player });
const fresh = () => {
  const state = structuredClone(EMPTY_STATE);
  state.profiles[me] = { display:"Evan" };
  state.profiles[other] = { display:"Jeremy", num:12, size:"M" };
  return state;
};
const save = (state, fields, ctx = guest(me)) =>
  applyAction(state, "saveProfile", { player:me, display:state.profiles[me]?.display || me, ...fields }, ctx);

test("back names are uppercase letters up to 12, Venmo drops the @, needs stay short", () => {
  assert.equal(cleanBackName("  van  der  berg "), "VAN DER BERG");
  assert.equal(cleanBackName("O'Neil-Jr."), "O'NEIL-JR.");
  assert.equal(cleanBackName("José"), "JOSÉ");
  assert.equal(cleanBackName(""), null);
  assert.equal(cleanBackName("THIRTEEN CHAR"), undefined);
  assert.equal(cleanBackName("A🔥"), undefined);
  assert.equal(cleanVenmo("@Evan-Lee_2"), "Evan-Lee_2");
  assert.equal(cleanVenmo("  "), null);
  assert.equal(cleanVenmo("evan lee"), undefined);
  assert.equal(cleanNeeds("  no   shellfish "), "no shellfish");
  assert.equal(cleanNeeds("x".repeat(121)), undefined);
  assert.equal(jerseyName({ display:"Evan 🔥" }, me), "EVAN");
  assert.equal(jerseyName({ display:"Christopher Alexander" }, me), "CHRISTOPHER");
  assert.equal(jerseyName({ backName:"TRAN", display:"Evan" }, me), "TRAN");
});

test("confirming pins the back name it showed and stores what was confirmed", () => {
  const state = fresh();
  assert.equal(save(state, { confirmJersey:true }).error, "Pick a number first");
  assert.equal(save(state, { num:7, confirmJersey:true }).error, "Pick a size first");
  assert.equal(state.profiles[me].num, undefined, "a refused confirm saves nothing");
  assert.equal(save(state, { num:7, size:"L", confirmJersey:true }).ok, true);
  const profile = state.profiles[me];
  assert.equal(profile.backName, "EVAN");
  assert.deepEqual({ ...profile.jerseyOk, at:0 }, { name:"EVAN", num:7, size:"L", at:0 });
  assert.equal(jerseyConfirmed(profile, me), true);

  /* renaming yourself does not move the jersey; changing what prints does */
  assert.equal(save(state, { display:"Ev" }).ok, true);
  assert.equal(jerseyConfirmed(state.profiles[me], me), true);
  assert.equal(save(state, { size:"XL" }).ok, true);
  assert.equal(jerseyConfirmed(state.profiles[me], me), false);
  assert.equal(save(state, { backName:"tran", confirmJersey:true }).ok, true);
  assert.equal(state.profiles[me].jerseyOk.name, "TRAN");
  assert.equal(state.profiles[me].jerseyOk.size, "XL");
  assert.equal(save(state, { backName:"far too long name" }).ok, false);
});

test("once jerseys are ordered, guests cannot change what prints and the commissioner can", () => {
  const state = fresh();
  save(state, { num:7, size:"L", confirmJersey:true });
  assert.equal(applyAction(state, "lockJerseys", { locked:true }, guest(me)).ok, false);
  assert.equal(applyAction(state, "lockJerseys", { locked:true }, gm).ok, true);
  assert.equal(state.jerseysLocked, true);
  assert.equal(save(state, { num:8 }).error, "Jerseys are already ordered");
  assert.equal(save(state, { size:"M" }).error, "Jerseys are already ordered");
  assert.equal(save(state, { backName:"NEW" }).error, "Jerseys are already ordered");
  assert.equal(save(state, { num:7, size:"L", backName:"evan", venmo:"evan" }).ok, true,
    "resending the same values is not a change");
  assert.equal(save(state, { size:"M" }, gm).ok, true);
  assert.equal(state.profiles[me].size, "M");
  assert.deepEqual(setupTodo(state, me).map(item => item.id).includes("jersey"), false,
    "nothing to confirm once ordered");
});

test("the lock survives a game-progress reset and is never a QA checkpoint key", () => {
  const state = fresh();
  applyAction(state, "lockJerseys", { locked:true }, gm);
  const result = applyAction(state, "resetTournament", { confirm:RESET_PROGRESS_CONFIRMATION },
    { ...gm, progressReset:true });
  assert.equal(result.ok, true, result.error);
  assert.equal(state.jerseysLocked, true);
  assert.ok(!QA_PROGRESS_KEYS.includes("jerseysLocked"));
});

test("Venmo, drinking, food needs and the confirmation are the guest's and the commissioner's only", () => {
  const state = fresh();
  assert.equal(save(state, { venmo:"@evan", drinking:false, needs:"No shellfish", num:7, size:"L",
    confirmJersey:true }).ok, true);
  assert.equal(save(state, { drinking:"no" }).ok, false);
  const seen = viewer => publicState(state, viewer).profiles[me];
  for (const viewer of [guest(other), { isGm:false, player:null }]) {
    const profile = seen(viewer);
    for (const key of ["venmo", "drinking", "needs", "jerseyOk", "size"]) assert.ok(!(key in profile), key);
    assert.equal(profile.backName, "EVAN", "the back of a jersey is public");
  }
  assert.equal(seen(guest(me)).venmo, "evan");
  assert.equal(seen(gm).drinking, false);
  assert.equal(seen(gm).needs, "No shellfish");
  assert.equal(save(state, { venmo:null, needs:"" }).ok, true);
  assert.ok(!("venmo" in state.profiles[me]) && !("needs" in state.profiles[me]));
});

test("Home lists what is still owed, in order, and nothing once done", () => {
  const state = fresh();
  assert.deepEqual(setupTodo(state, null), []);
  assert.deepEqual(setupTodo(state, ROSTER[5]), [], "no profile, nothing to list");
  assert.deepEqual(setupTodo(state, me, { songs:true }).map(item => item.id),
    ["chip", "photo", "jersey", "details", "song"]);
  assert.deepEqual(setupTodo(state, me).map(item => item.section), ["card", "card", "jersey", "travel"]);
  Object.assign(state.profiles[me], { color:"#c33", photoV:1, flightsBooked:true, flightIn:{ air:"UA", num:"1", time:"10:00" } });
  assert.ok(setupTodo(state, me).some(item => item.id === "flights"), "booked with a leg missing");
  state.profiles[me].flightOut = { air:"UA", num:"2", time:"12:00" };
  save(state, { num:7, size:"L", venmo:"evan", drinking:true, confirmJersey:true,
    walkoutTrack:undefined });
  assert.deepEqual(setupTodo(state, me).map(item => item.id), []);
  assert.deepEqual(setupTodo(state, me, { songs:true }).map(item => item.id), ["song"]);
});
