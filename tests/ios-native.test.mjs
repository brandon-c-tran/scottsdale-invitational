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

/* each style rule's selector, with the preludes of the blocks it sits inside */
function rules(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out = [], open = [];
  let prelude = "";
  for (const ch of text) {
    if (ch === "{") {
      const head = prelude.trim();
      if (!head.startsWith("@")) out.push({ selector:head, within:[...open] });
      open.push(head); prelude = ""; continue;
    }
    if (ch === "}") { open.pop(); prelude = ""; continue; }
    if (ch === ";") { prelude = ""; continue; }
    prelude += ch;
  }
  return out;
}

test("hover styles live only where a pointer hovers (a tap leaves :hover stuck on iPhone)", () => {
  const stuck = [];
  for (const file of cssFiles("src")) for (const rule of rules(readFileSync(file, "utf8"))) {
    if (!rule.selector.includes(":hover")) continue;
    if (rule.within.some(head => /^@media[^{]*\(\s*hover\s*:\s*hover\s*\)/.test(head))) continue;
    stuck.push(`${file}: ${rule.selector}`);
  }
  assert.deepEqual(stuck, []);
});
