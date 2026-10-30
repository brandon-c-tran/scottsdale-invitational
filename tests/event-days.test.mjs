import test from "node:test";
import assert from "node:assert/strict";
import { EMPTY_STATE, SESSIONS, allEventsOf, resolveWeekendOperation } from "../shared/core.js";
import { applyAction } from "../worker/actions.js";

/* Rain: the commissioner moves an event to another day, shelves one, and
   the schedule, the pill's "next" and Reorder all follow the day. */
let serial = 0;
const gm = () => ({ isGm:true, player:"Brandon", deviceId:"gm", actionId:`day-${++serial}`, environment:"local" });
const fresh = () => structuredClone(EMPTY_STATE);
const act = (state, type, payload) => {
  const result = applyAction(state, type, payload, gm());
  assert.equal(result.ok, true, `${type}: ${result.error}`);
  return result;
};
const day = id => SESSIONS.findIndex(session => session.id === id);
const order = state => allEventsOf(state).filter(ev => !state.shelved[ev.id]).map(ev => ev.id);

test("the slate reads in day order, whatever the stored order says", () => {
  const state = fresh();
  const days = allEventsOf(state).map(ev => day(ev.session));
  assert.deepEqual(days, [...days].sort((a, b) => a - b));
  /* a stored order that puts a Saturday game first does not pull it ahead of Friday */
  state.eventOrder = ["pong", ...order(state).filter(id => id !== "pong")];
  assert.ok(order(state).indexOf("pong") > order(state).indexOf("karaoke"));
  assert.equal(resolveWeekendOperation(state).event.id, "putt");
});

test("a built-in moved to another day takes that day's turn", () => {
  const state = fresh();
  act(state, "editEvent", { id:"bball1", patch:{ session:"san" } });
  const ids = order(state);
  assert.ok(ids.indexOf("bball1") > ids.indexOf("pong"), "after Saturday afternoon's last game");
  assert.ok(ids.indexOf("bball1") < ids.indexOf("poker"), "before the finale");
  assert.equal(allEventsOf(state).find(ev => ev.id === "bball1").session, "san");
  /* and back */
  act(state, "editEvent", { id:"bball1", patch:{ session:"sam" } });
  assert.ok(order(state).indexOf("bball1") < order(state).indexOf("volley"));
});

test("a shelved built-in leaves the pill's turn and comes back whole", () => {
  const state = fresh();
  act(state, "shelve", { id:"putt", on:true });
  assert.equal(resolveWeekendOperation(state).event.id, "die");
  act(state, "shelve", { id:"putt", on:false });
  assert.equal(resolveWeekendOperation(state).event.id, "putt");
});

test("Reorder within a day keeps the days apart", () => {
  const state = fresh();
  const ids = order(state);
  const a = ids.indexOf("8ball"), b = ids.indexOf("pong");
  [ids[a], ids[b]] = [ids[b], ids[a]];
  act(state, "reorderEvents", { ids });
  const after = order(state);
  assert.ok(after.indexOf("pong") < after.indexOf("8ball"));
  assert.ok(after.indexOf("pong") > after.indexOf("bball1"), "still after Saturday morning");
});
