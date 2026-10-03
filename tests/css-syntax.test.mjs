import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/* A stray "}" is not a build error: the browser silently swallows the rule
   after it (an Oct 2 Gauntlet removal dropped the trophy's keyframes this
   way). Every stylesheet balances its braces and never closes one it did
   not open. */
function cssFiles(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return cssFiles(path);
    return name.endsWith(".css") ? [path] : [];
  });
}

test("every stylesheet's braces balance", () => {
  for (const file of cssFiles("src")) {
    const text = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/"[^"\n]*"|'[^'\n]*'/g, "\"\"");
    let depth = 0, line = 1;
    for (const ch of text) {
      if (ch === "\n") line++;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        assert.ok(depth >= 0, `${file}:${line} closes a brace it never opened`);
      }
    }
    assert.equal(depth, 0, `${file} leaves ${depth} brace(s) open`);
  }
});
