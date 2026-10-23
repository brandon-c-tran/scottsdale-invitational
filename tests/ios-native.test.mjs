import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

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

test("hover styles live only where a pointer hovers (a tap leaves :hover stuck on iPhone)", () => {
  const stuck = [];
  for (const file of cssFiles("src")) for (const rule of rules(readFileSync(file, "utf8"))) {
    if (!rule.selector.includes(":hover")) continue;
    if (rule.within.some(head => /^@media[^{]*\(\s*hover\s*:\s*hover\s*\)/.test(head))) continue;
    stuck.push(`${file}: ${rule.selector}`);
  }
  assert.deepEqual(stuck, []);
});
