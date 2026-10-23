import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ROSTER, CHIP_GRAY, CHIP_COLORS, CHIP_SKINS } from "../shared/core.js";
import { resolvePlayerIdentity } from "../src/features/identity/playerIdentity.js";
import {
  PlayerIdentityProvider,
  usePlayerIdentity,
} from "../src/features/identity/PlayerIdentityContext.js";

import { CHIP_INKS, chipInkIsDark, contrastRatio, letterPlate } from "../src/features/identity/chipInk.js";
const player = ROSTER[0];
const lightColor = CHIP_COLORS.find(color => chipInkIsDark(color.hex));
const darkColor = CHIP_COLORS.find(color => !chipInkIsDark(color.hex));

test("saved chip selections and player numbers retain their existing presentation", () => {
  for (const color of CHIP_COLORS) {
    for (const skin of CHIP_SKINS) {
      const profile = Object.freeze({ color:color.hex, skin, num:0 });
      const profiles = Object.freeze({ [player]:profile });
      assert.deepEqual(resolvePlayerIdentity(profiles, player), {
        color:color.hex, isLight:chipInkIsDark(color.hex), skin, num:0, photo:null,
      });
    }
  }
  assert.equal(resolvePlayerIdentity({ [player]:{ num:99 } }, player).num, 99);
});

test("missing or invalid chip selections use the previous gray and classic defaults", () => {
  const expected = { color:CHIP_GRAY, isLight:false, skin:"ticks", num:1, photo:null };
  for (const profiles of [undefined, null, {}, { [player]:null }, {
    [player]:{ color:"unclaimed-color", skin:"unknown-skin", num:null },
  }]) {
    assert.deepEqual(resolvePlayerIdentity(profiles, player), expected);
  }
  for (const [index, name] of ROSTER.entries()) {
    assert.equal(resolvePlayerIdentity({}, name).num, index + 1);
  }
  assert.deepEqual(resolvePlayerIdentity({}, "Unknown player"), { ...expected, num:null });
  assert.equal(resolvePlayerIdentity(undefined, undefined).num, null);
});

test("independent profile sets never share a player's appearance", () => {
  const first = { [player]:{ color:lightColor.hex, skin:"crown", num:7 } };
  const second = { [player]:{ color:darkColor.hex, skin:"wave", num:14 } };
  const original = structuredClone(first);
  assert.equal(resolvePlayerIdentity(first, player).num, 7);
  assert.equal(resolvePlayerIdentity(second, player).num, 14);
  assert.deepEqual(resolvePlayerIdentity(first, player), {
    color:lightColor.hex, isLight:true, skin:"crown", num:7, photo:null,
  });
  assert.deepEqual(first, original);
});

function IdentityProbe({ name = player }) {
  const identity = usePlayerIdentity(name);
  return createElement("i", {
    "data-color":identity.color,
    "data-skin":identity.skin,
    "data-number":identity.num,
  });
}

test("nested previews use their own provider and leave the surrounding identity intact", () => {
  const outer = { [player]:{ color:lightColor.hex, skin:"crown", num:7 } };
  const inner = { [player]:{ color:darkColor.hex, skin:"wave", num:14 } };
  const html = renderToStaticMarkup(createElement(PlayerIdentityProvider, { profiles:outer },
    createElement(IdentityProbe),
    createElement(PlayerIdentityProvider, { profiles:inner }, createElement(IdentityProbe)),
    createElement(IdentityProbe),
  ));
  const numbers = [...html.matchAll(/data-number="(\d+)"/g)].map(match => Number(match[1]));
  assert.deepEqual(numbers, [7, 14, 7]);
  assert.equal([...html.matchAll(/data-skin="crown"/g)].length, 2);
  assert.equal([...html.matchAll(/data-skin="wave"/g)].length, 1);
});

test("the provider reads current profiles and supports the initial empty state", () => {
  const render = profiles => renderToStaticMarkup(createElement(PlayerIdentityProvider,
    { profiles }, createElement(IdentityProbe)));
  assert.match(render(undefined), /data-number="1"/);
  assert.match(render({ [player]:{ num:23 } }), /data-number="23"/);
  assert.match(render({ [player]:{ num:0 } }), /data-number="0"/);
  assert.match(render(null), /data-number="1"/);
});

test("identity consumers require an explicit application or preview provider", () => {
  assert.throws(() => renderToStaticMarkup(createElement(IdentityProbe)),
    /inside PlayerIdentityProvider/);
});

test("a color's ink and letter plate are worked out once, keyed by the color and the inks", () => {
  for (const hex of [...CHIP_COLORS.map(color => color.hex), CHIP_GRAY]) {
    const plate = letterPlate(hex);
    assert.equal(letterPlate(hex), plate, "every disc of one color shares the answer");
    assert.ok(Object.isFrozen(plate), "no caller can change it for the next");
    assert.equal(plate.dark, chipInkIsDark(hex));
    assert.ok(contrastRatio(plate.fill, plate.ink) >= 4.5, `${hex} letters at 4.5:1`);
    assert.equal(letterPlate(hex, { ...CHIP_INKS }), plate, "keyed by the inks' values, not the object");
  }
  /* other inks are another answer */
  const flipped = { dark:CHIP_INKS.bone, bone:CHIP_INKS.dark };
  const hex = CHIP_COLORS[0].hex;
  assert.equal(chipInkIsDark(hex, flipped), !chipInkIsDark(hex));
  assert.notEqual(letterPlate(hex, flipped), letterPlate(hex));
  assert.equal(letterPlate(hex, flipped).dark, !letterPlate(hex).dark);
  /* anything not a hex string is never remembered and keeps bone */
  assert.deepEqual(letterPlate(null), { fill:null, ink:CHIP_INKS.bone, dark:false });
  assert.equal(chipInkIsDark(undefined), false);
});
