/* Every disc that stands for a person carries the person: their photo, else
   their initials at the surface's text floor. Never a bare colored disc,
   on the phone (12px floor) or the TV (24px), at any size a screen asks
   for, alone, in a group, or as a chip. */
import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CHIP_COLORS, ROSTER } from "../shared/core.js";
import { avatarLetters, chipLetters, DISC_OVERLAP_MIN } from "../src/features/identity/discLetters.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const compiled = buildSync({
  stdin:{ contents:`
    export { Avatar, AvatarStack, ChipFace, BankChip } from "./src/features/identity/PlayerIdentity.jsx";
    export { ChipCoin } from "./src/features/identity/ChipCoin.jsx";
    export { PlayerIdentityProvider, TextFloor } from "./src/features/identity/PlayerIdentityContext.js";
  `, resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react", "three"],
  loader:{ ".css":"empty" }, write:false, logLevel:"silent",
});
const mod = new Module(fileURLToPath(new URL("person-discs.cjs", import.meta.url)));
mod.filename = mod.id;
mod.paths = Module._nodeModulePaths(root);
mod._compile(compiled.outputFiles[0].text, mod.filename);
const ui = mod.exports;

/* half the room has photos, half does not; every color family */
const profiles = Object.fromEntries(ROSTER.map((player, i) => [player, {
  display:player, color:CHIP_COLORS[(i * 7) % CHIP_COLORS.length].hex, ...(i % 2 ? { photoV:1 } : null) }]));
profiles[ROSTER[2]].display = "j vo";
const state = { profiles };
const withPhoto = ROSTER.filter((_, i) => i % 2);
const noPhoto = ROSTER.filter((_, i) => !(i % 2));
const FLOORS = [12, 24];
const SIZES = [14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 40, 44, 48, 52, 56, 60, 64, 72, 96, 128];

const render = (floor, el) => renderToStaticMarkup(React.createElement(ui.PlayerIdentityProvider, { profiles },
  React.createElement(ui.TextFloor, { px:floor }, el)));

/* each person's avatar in the markup: an <img>, or initials at or above the floor */
function avatars(html) {
  return html.split('class="fd-avatar"').slice(1).map(chunk => {
    const img = /^[^>]*>\s*<img /.test(chunk);
    const m = /class="fd-avatar-initials"[^>]*font-size:(\d+(?:\.\d+)?)px[^>]*>([^<]*)</.exec(chunk.split('class="fd-avatar"')[0]);
    return { img, text:m?.[2] || "", px:m ? Number(m[1]) : 0 };
  });
}
/* each chip face: an <image>, or <text> whose rendered size reaches the floor */
function chips(html) {
  return [...html.matchAll(/<svg width="(\d+(?:\.\d+)?)"[^>]*viewBox="0 0 32 32"[^>]*>([\s\S]*?)<\/svg>/g)].map(([, w, body]) => {
    const t = /<text[^>]*font-size="([\d.]+)"[^>]*>([^<]*)<\/text>/.exec(body);
    return { image:/<image /.test(body), text:t?.[2] || "", px:t ? Number(t[1]) * Number(w) / 32 : 0 };
  });
}
const carries = (disc, floor, label) => {
  assert.ok(disc.img || disc.image || (/^[A-Z0-9]{1,2}$/.test(disc.text) && disc.px >= floor - 0.01),
    `${label}: a person disc carries a photo or initials at ${floor}px (got ${JSON.stringify(disc)})`);
};

test("discLetters: two letters where they fit, else one, always at the floor", () => {
  for (const floor of FLOORS) for (const size of SIZES) {
    const a = avatarLetters(size, floor, "HN");
    assert.ok(a.text.length >= 1 && a.px >= floor, `avatar ${size}@${floor}`);
    const c = chipLetters(size, floor, "HN");
    assert.ok(c.text.length >= 1 && c.units * size / 32 >= floor - 0.01, `chip ${size}@${floor}`);
  }
  assert.equal(avatarLetters(24, 12, "HN").text, "HN");
  assert.equal(avatarLetters(20, 12, "HN").text, "HN");
  assert.equal(chipLetters(24, 12, "HN").text, "HN", "a 24px phone chip still letters both");
  assert.equal(chipLetters(44, 24, "HN").text, "HN", "the TV's 44px faces letter both");
  assert.equal(chipLetters(16, 12, "HN").text, "H", "a tiny chip keeps the first letter");
});

test("an Avatar at every size, with and without a photo, carries the person", () => {
  for (const floor of FLOORS) for (const size of SIZES) for (const p of [...withPhoto.slice(0, 2), ...noPhoto.slice(0, 3)]) {
    const found = avatars(render(floor, React.createElement(ui.Avatar, { state, p, size })));
    assert.equal(found.length, 1);
    carries(found[0], floor, `Avatar ${p} ${size}px floor ${floor}`);
    if (!profiles[p].photoV) assert.ok(!found[0].img);
  }
  /* the old opt-out no longer blanks a face */
  const blanked = avatars(render(24, React.createElement(ui.Avatar, { state, p:noPhoto[0], size:34, lettered:false })));
  carries(blanked[0], 24, "lettered={false}");
});

test("an AvatarStack letters every face and never overlaps discs under 32px", () => {
  for (const floor of FLOORS) for (const size of [16, 20, 24, 26, 28, 30, 32, 36, 40, 48]) {
    const html = render(floor, React.createElement(ui.AvatarStack, { state, players:ROSTER.slice(0, 7), size, max:5 }));
    const found = avatars(html);
    assert.equal(found.length, 5);
    found.forEach((disc, i) => carries(disc, floor, `AvatarStack ${size}px #${i} floor ${floor}`));
    assert.match(html, />\+2</, "the rest is a count");
    if (size < DISC_OVERLAP_MIN) assert.doesNotMatch(html, /margin-left:-/, `${size}px faces stand in a row`);
    else assert.match(html, /margin-left:-/, `${size}px faces overlap`);
  }
});

test("identity chips (ChipFace, BankChip without a value, ChipCoin) carry the person", () => {
  for (const floor of FLOORS) for (const size of SIZES) for (const p of [withPhoto[0], ...noPhoto.slice(0, 3)]) {
    for (const el of [React.createElement(ui.ChipFace, { p, size }), React.createElement(ui.ChipFace, { p, size, flat:true }),
      React.createElement(ui.BankChip, { p, size })]) {
      const found = chips(render(floor, el));
      assert.equal(found.length, 1);
      carries(found[0], floor, `chip ${p} ${size}px floor ${floor}`);
    }
    const coin = chips(render(floor, React.createElement(ui.ChipCoin, { p, size })));
    assert.ok(coin.length >= 1);
    coin.forEach(face => carries(face, floor, `ChipCoin ${p} ${size}px`));
  }
});

test("value chips and explicit stamps keep their stamp, never a face", () => {
  const value = chips(render(12, React.createElement(ui.BankChip, { p:withPhoto[0], size:46, val:500 })))[0];
  assert.equal(value.text, "500");
  assert.equal(value.image, false);
  const blank = chips(render(12, React.createElement(ui.ChipFace, { p:withPhoto[0], size:128, stamp:"" })))[0];
  assert.equal(blank.image, false);
  assert.equal(blank.text, "");
  const typed = chips(render(12, React.createElement(ui.ChipFace, { p:noPhoto[0], size:48, fallback:"12" })))[0];
  assert.equal(typed.text, "12", "the editor previews the typed number");
});
