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

test("the v3 rack: retired hats and glasses clean to the nearest new one; the groom's crown only when he never picked", async () => {
  const { RETIRED_HATS, RETIRED_SHADES, HAT_IDS, SHADE_IDS } = await import("../float/shared/looks.js");
  for (const [old, now] of Object.entries(RETIRED_HATS)) assert.equal(cleanLook({ hat:old }).hat, now, old);
  for (const [old, now] of Object.entries(RETIRED_SHADES)) assert.equal(cleanLook({ shades:old }).shades, now, old);
  assert.ok(HAT_IDS.length >= 11 && SHADE_IDS.length >= 7);
  assert.equal(cleanLook({}, { groom:true }).hat, "crown");
  assert.equal(cleanLook({ hat:"none" }, { groom:true }).hat, "none");
  assert.equal(cleanLook({ hat:"crown" }).hat, "none", "the crown is the groom's alone");
  assert.equal(cleanLook({}).hat, "none");
  assert.equal(cleanFloatLook({ hat:"visor" }, "Evan").hat, "sunhat", "Field Day's saved look keeps a retired hat as its new one");
});

test("the groom's default look wears the crown; everyone else's no hat", () => {
  assert.equal(defaultLook("Brandon", ["classic"], { groom:true }).hat, "crown");
  assert.equal(defaultLook("Evan").hat, "none");
});
