import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { SHEET_DRAG, dragOffset, homeSettled, project, rawOffset, releasePlan, releaseVelocity, rubberband, scrimShare, springFor,
  unband } from "../src/ui/sheetDragModel.js";
import { springStep } from "../src/ui/useGlassTilt.js";

/* Every guest is on an iPhone, in the installed app. These keep the platform
   layer native: what a tap leaves behind, what a long press does, and how a
   sheet answers a finger. */
function cssFiles(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return cssFiles(path);
    return name.endsWith(".css") ? [path] : [];
  });
}

/* each style rule: its selector, its declarations, and the preludes of the
   blocks it sits inside */
function rules(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out = [], open = [];
  let prelude = "";
  for (const ch of text) {
    const rule = open.at(-1)?.rule;
    if (ch === "{") {
      const head = prelude.trim();
      const entry = { head, rule:head.startsWith("@") ? null : { selector:head, body:"", within:open.map(o => o.head) } };
      if (entry.rule) out.push(entry.rule);
      open.push(entry); prelude = ""; continue;
    }
    if (ch === "}") { open.pop(); prelude = ""; continue; }
    if (rule) rule.body += ch;
    if (ch === ";") { prelude = ""; continue; }
    prelude += ch;
  }
  return out;
}

test("a long press on a control selects nothing; a card shown to press and hold keeps its callout", () => {
  const shell = readFileSync("src/ui/shell.css", "utf8");
  /* every press answers at once: a button or a disclosure row sinks while held */
  assert.ok(shell.includes("button:active:not(:disabled), summary:active { transform: scale(0.97); }"));
  assert.match(shell, /:where\(button, \[role=button\], summary\) \{ -webkit-user-select:none; user-select:none; -webkit-touch-callout:none; \}/);
  assert.match(shell, /:where\(button, \[role=button\], a, label, summary, input, select, textarea\) \{ touch-action:manipulation; \}/);
  assert.match(readFileSync("src/features/results/results.css", "utf8"),
    /\.fd-crown-preview img \{[^}]*-webkit-touch-callout:default; user-select:auto; -webkit-user-select:auto; \}/);
  /* never on a label or a field's wrapper: Safari can keep the field inside from taking the caret */
  for (const file of cssFiles("src")) for (const rule of rules(readFileSync(file, "utf8")))
    assert.ok(!/(^|[\s,>])label\b|fd-[\w-]*field\b/.test(rule.selector) || !/user-select:\s*none/.test(rule.body), `${file}: ${rule.selector}`);
});

/* each <input .../> in a file, by its aria-label */
const inputs = file => Object.fromEntries([...readFileSync(file, "utf8").matchAll(/<input\b[\s\S]*?\/>/g)]
  .map(([tag]) => [/aria-label=(?:"([^"]+)"|\{`([^`]+)`\}|\{(\w+)\})/.exec(tag)?.slice(1).find(Boolean), tag]));

test("names, handles and codes are typed as written: no autocorrect, no spellcheck", () => {
  const fields = [
    ["src/features/profile/ProfileEditor.jsx", "Display name"],
    ["src/features/jersey/Jersey.jsx", "Name on back"],
    ["src/features/profile/TripDetails.jsx", "Venmo username"],
    ["src/features/teams/TeamNameCard.jsx", "Team name"],
    ["src/features/travel/Travel.jsx", "Airline"],
    ["src/features/geo/PlaceSearch.jsx", "placeholder"],
    ["src/features/music/WinSongPicker.jsx", "Search Spotify"],
    ["src/features/karaoke/KaraokeSongPicker.jsx", "Paste a YouTube link"],
  ];
  for (const [file, label] of fields) {
    const tag = inputs(file)[label];
    assert.ok(tag, `${file}: no input labelled ${label}`);
    assert.match(tag, /autoCorrect="off"/, `${file} ${label}`);
    assert.match(tag, /spellCheck=\{false\}/, `${file} ${label}`);
  }
  /* a return key that says Done puts the keyboard away (no form to submit) */
  for (const [file, label] of [["src/features/profile/ProfileEditor.jsx", "Display name"], ["src/features/jersey/Jersey.jsx", "Name on back"],
    ["src/features/profile/TripDetails.jsx", "Venmo username"], ["src/features/profile/TripDetails.jsx", "Food or drink needs"]]) {
    const tag = inputs(file)[label];
    assert.match(tag, /enterKeyHint="done"/, `${file} ${label}`);
    assert.match(tag, /e\.key === "Enter"\) e\.currentTarget\.blur\(\)/, `${file} ${label}`);
  }
});

test("a full-screen pane that scrolls keeps its scroll: the page under it never moves", () => {
  const loose = [];
  for (const file of cssFiles("src")) for (const rule of rules(readFileSync(file, "utf8"))) {
    if (!/overflow-y:\s*auto/.test(rule.body) || !/inset:\s*0/.test(rule.body)) continue;
    if (!/overscroll-behavior/.test(rule.body)) loose.push(`${file}: ${rule.selector}`);
  }
  assert.deepEqual(loose, []);
});

test("what holds a sheet's foot stands clear of the home indicator", () => {
  const all = cssFiles("src").flatMap(file => rules(readFileSync(file, "utf8")).map(rule => ({ ...rule, file })));
  for (const selector of [".fd-sheet-footer", ".fd-profile-save", ".fd-draw-footer", ".si-sheet .fd-standings-list>.is-you"]) {
    const rule = all.find(r => r.selector === selector && /position:\s*sticky/.test(r.body));
    assert.ok(rule, selector);
    assert.match(rule.body, /safe-area-inset-bottom/, `${rule.file}: ${selector}`);
  }
  /* the profile's Save is flush with the foot, so the body leaves no padding under it */
  assert.ok(all.some(r => r.selector === ".fd-sheet-body:has(> .fd-profile-save:last-child)" && /padding-bottom:\s*0/.test(r.body)));
});

test("hover styles live only where a pointer hovers (a tap leaves :hover stuck on iPhone)", () => {
  const stuck = [];
  for (const file of cssFiles("src")) for (const rule of rules(readFileSync(file, "utf8"))) {
    if (!rule.selector.includes(":hover")) continue;
    if (rule.within.some(head => /^@media[^{]*\(\s*hover\s*:\s*hover\s*\)/.test(head))) continue;
    stuck.push(`${file}: ${rule.selector}`);
  }
  assert.deepEqual(stuck, []);
});

/* ── a sheet put away by its header (ui/useSheetDrag.js, ui/sheetDragModel.js) ── */
test("down the sheet follows the finger; up, and while it cannot close, it gives and resists", () => {
  assert.equal(dragOffset(120), 120);
  assert.equal(dragOffset(0), 0);
  const up = [10, 40, 120, 400, 4000].map(raw => -dragOffset(-raw));
  up.reduce((prev, y) => { assert.ok(y > prev && y < SHEET_DRAG.upLimit); return y; }, 0);
  const locked = [10, 60, 300, 3000].map(raw => dragOffset(raw, { locked:true }));
  locked.reduce((prev, y) => { assert.ok(y > prev && y < SHEET_DRAG.lockedLimit); return y; }, 0);
  /* caught mid-spring, it is picked up where it stands */
  for (const offset of [-30, -5, 0, 20, 300]) assert.ok(Math.abs(dragOffset(rawOffset(offset)) - offset) < 1e-6, offset);
  for (const offset of [5, 30, 50]) assert.ok(Math.abs(dragOffset(rawOffset(offset, { locked:true }), { locked:true }) - offset) < 1e-6);
  assert.ok(Math.abs(rubberband(unband(20, 48), 48) - 20) < 1e-9);
});

test("a release goes past half its height, by distance or by momentum, and comes home otherwise", () => {
  const height = 700;
  /* a slow drag: distance decides */
  assert.equal(releasePlan({ offset:200, velocity:0, height }).dismiss, false);
  assert.equal(releasePlan({ offset:360, velocity:0, height }).dismiss, true);
  /* a flick: momentum carries it (projected as a scroll view coasts) */
  assert.ok(Math.abs(project(1) - 499) < 1e-6);
  assert.equal(releasePlan({ offset:60, velocity:1.2, height }).dismiss, true);
  /* past half but thrown back up: it stays */
  assert.equal(releasePlan({ offset:420, velocity:-1, height }).dismiss, false);
  /* a twitch on a header button never puts the sheet away, however fast */
  assert.equal(releasePlan({ offset:SHEET_DRAG.minFling - 1, velocity:5, height }).dismiss, false);
  /* a sheet that cannot close never goes */
  assert.equal(releasePlan({ offset:600, velocity:4, height, locked:true }).dismiss, false);
  /* a flick falls at the finger's speed, inside the fall's bounds; a slow release takes the sheet's own fall */
  const flick = releasePlan({ offset:100, velocity:2, height });
  assert.equal(flick.fallMs, 300);
  assert.equal(releasePlan({ offset:300, velocity:4, height }).fallMs, 140);
  assert.equal(releasePlan({ offset:500, velocity:2.5, height }).fallMs, SHEET_DRAG.fallMin);
  assert.equal(releasePlan({ offset:400, velocity:.1, height }).fallMs, null);
});

test("the release speed reads the drag's last moment, and a finger that stopped releases at rest", () => {
  const samples = [{ t:0, y:0 }, { t:100, y:10 }, { t:150, y:40 }, { t:200, y:100 }];
  assert.equal(releaseVelocity(samples, 205), (100 - 10) / 100);
  assert.equal(releaseVelocity(samples, 200 + SHEET_DRAG.still + 1), 0);
  assert.equal(releaseVelocity([{ t:0, y:0 }], 1), 0);
  assert.equal(releaseVelocity([], 1), 0);
});

test("the scrim thins as the sheet goes down, and the spring home lands without a bounce", () => {
  assert.equal(scrimShare(0, 600), 1);
  assert.equal(scrimShare(300, 600), .5);
  assert.equal(scrimShare(-20, 600), 1);
  assert.equal(scrimShare(900, 600), 0);
  /* critically damped from a release mid-drag: home in about half a second, never far past it */
  const spring = springFor();
  for (const [start, velocity] of [[240, 0], [120, 900], [-30, 0]]) {
    let pos = start, vel = velocity, t = 0, lowest = Math.min(0, start);
    while (!homeSettled(pos, vel) && t < 3) { ({ pos, vel } = springStep(pos, vel, 0, 1 / 60, spring)); t += 1 / 60; lowest = Math.min(lowest, pos); }
    assert.ok(t < .9, `${start} settles in ${t.toFixed(2)}s`);
    if (start > 0) assert.ok(lowest > -2, `${start} overshoots to ${lowest}`);
  }
});

test("every sheet's header is its grip, phones only, and a dragged sheet falls from where the finger left it", () => {
  const controls = readFileSync("src/ui/controls.jsx", "utf8");
  assert.match(controls, /useSheetDrag\(\{ overlay, panel:dialog, grip, busy, onClose \}\)/);
  assert.match(controls, /<div ref=\{grip\} className="fd-sheet-header">/);
  const experience = readFileSync("src/ui/experience.css", "utf8");
  assert.match(experience, /@media\(max-width:699\.98px\) \{\s*\.fd-sheet-header \{ touch-action:none; -webkit-user-select:none; user-select:none;/);
  const motion = readFileSync("src/ui/motion.css", "utf8");
  assert.match(motion, /@keyframes fd-sheet-fall \{ from \{ transform:translateY\(var\(--fd-sheet-drag, 0px\)\); \}/);
  assert.match(motion, /@keyframes fd-scrim-out \{ from \{ opacity:var\(--fd-sheet-dim, 1\); \}/);
  assert.match(motion, /\.fd-sheet-overlay\.is-leaving\.is-flung \.si-sheet \{ animation:fd-sheet-fall var\(--fd-fling-ms/);
  /* the drag stands down where a sheet is a dialog, and for a mouse */
  const hook = readFileSync("src/ui/useSheetDrag.js", "utf8");
  assert.match(hook, /const DIALOG = "\(min-width: 700px\)";/);
  assert.match(hook, /event\.pointerType === "mouse"/);
});
