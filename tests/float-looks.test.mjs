/* Looks (float/PROTOCOL.md "Looks", float/GROOVE.md "Special critters"):
   Winnie is the groom's alone, never a default, never a bot. */
import test from "node:test";
import assert from "node:assert/strict";
import { CRITTER_IDS, ALL_CRITTER_IDS, SPECIAL_CRITTER_IDS, cleanLook, crittersFor, defaultLook } from "../float/shared/looks.js";
import { createCup, addBots } from "../float/shared/cup.js";
import { cleanFloatLook } from "../shared/float.js";

test("Winnie: the groom may pick him; nobody else", () => {
  assert.deepEqual(SPECIAL_CRITTER_IDS, ["winnie"]);
  assert.equal(ALL_CRITTER_IDS.length, CRITTER_IDS.length + 1);
  assert.equal(cleanLook({ critter:"winnie" }, { groom:true }).critter, "winnie");
  assert.notEqual(cleanLook({ critter:"winnie" }, { groom:false, seed:"x" }).critter, "winnie");
  assert.equal(cleanFloatLook({ critter:"winnie" }, "Brandon").critter, "winnie");
  assert.notEqual(cleanFloatLook({ critter:"winnie" }, "Evan").critter, "winnie");
  assert.ok(crittersFor({ groom:true }).some(item => item.id === "winnie"));
  assert.ok(!crittersFor().some(item => item.id === "winnie"));
});

test("Winnie is never a default or a bot", () => {
  for (let k = 0; k < 500; k += 1) assert.notEqual(defaultLook(`seed-${k}`).critter, "winnie");
  const cup = createCup({ seed:7 });
  addBots(cup, 16);
  assert.ok(cup.entrants.every(entrant => entrant.look.critter !== "winnie" && entrant.name !== "Winnie"));
});
