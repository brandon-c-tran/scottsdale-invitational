/* A bit's frames as PNGs, for looking at the drawing and the timing:
   the real BitStage at 1920 x 1080 in headless Chrome, frozen at each
   instant (ms from the bit's start), from the bits reel bundled with its
   fonts inline (no network).

     node scripts/bit-frames.mjs quickdraw 0 1300 1500 1900 2600 3400 4300
       --phase fri|sam|sap|san|fin   the session's painting (default sap)
       --cast <key>                  a reel cast (versus 1v1 2v2 4v6, loss 1 long, win 1 2)
       --trigger <n>                 which of the bit's triggers (its fact)
       --reduced                     reduced motion's still (no instants needed)
       --out <dir>                   default .impeccable/review/bits/frames
       --only <group>                build only that catalog group (upset, music, show, loss, team, idle)
     node scripts/bit-frames.mjs sheet   the rig and the props on the painting
     node scripts/bit-frames.mjs --soundcheck   every recipe and cue sheet, offline: not silent, not clipped
     node scripts/bit-frames.mjs anvil --wav <file>   the bit's cue sheet as the soundcheck renders it
                                   (the --phase room), cut to the bit, as a 16-bit PCM WAV

   Prints each PNG's path. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildReel, wrapForLocal } from "./build-bits-reel.mjs";
import { launchChrome } from "./headless-chrome.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const flags = new Set(["--phase", "--cast", "--trigger", "--out", "--wav", "--only"]);
const value = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const positional = args.filter((arg, i) => !arg.startsWith("--") && !flags.has(args[i - 1]));
const [bit = "quickdraw", ...times] = positional;
const OUT = path.resolve(ROOT, value("--out") || ".impeccable/review/bits/frames");
const phase = value("--phase") || "sap";
const cast = value("--cast");
const trigger = value("--trigger");
const reduced = args.includes("--reduced");

const { out } = await buildReel({ out:path.join(OUT, "reel.html"), localFonts:true, only:value("--only") });
const page = pathToFileURL(wrapForLocal(out)).href;
const chrome = await launchChrome({ width:1920, height:1080 });
const errors = [];
chrome.on(m => {
  if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description?.split("\n")[0]
    || m.params.exceptionDetails.text);
});
const shots = [];
/* --soundcheck: the bit recipes and each bit's whole cue sheet, rendered offline */
if (args.includes("--soundcheck")) {
  try {
    await chrome.load(`${page}?soundcheck=1`);
    await chrome.until("document.body.dataset.ready === '1'", { timeout:60000 });
    const rows = await chrome.evaluate("window.__soundcheck");
    rows.forEach(row => console.log(`${row.ok ? "ok  " : "BAD "} ${row.label.padEnd(24)} peak ${row.peak.toFixed(3)}  rms ${row.rms.toFixed(3)}`));
    if (rows.some(row => !row.ok)) process.exitCode = 1;
  } finally { await chrome.close(); }
  process.exit();
}
/* --wav <file>: the bit's cue sheet, rendered offline, as a WAV */
if (value("--wav")) {
  try {
    await chrome.load(`${page}?${new URLSearchParams({ wav:bit, phase })}`);
    await chrome.until("document.body.dataset.ready === '1'", { timeout:60000 });
    const wav = await chrome.evaluate("window.__wav");
    if (!wav || wav.error) throw new Error(wav?.error || "no WAV");
    const file = path.resolve(value("--wav"));
    fs.mkdirSync(path.dirname(file), { recursive:true });
    fs.writeFileSync(file, Buffer.from(wav.base64, "base64"));
    console.log(`${path.relative(ROOT, file)}  ${wav.ms} ms  peak ${wav.peak.toFixed(3)}`);
    if (wav.peak > 1 || wav.peak < 0.02) process.exitCode = 1;
  } finally { await chrome.close(); }
  process.exit();
}
/* --contact: every instant asked for, as one grid */
if (args.includes("--contact")) {
  try {
    const ts = (times.length ? times : ["0"]).map(t => Math.max(0, Number(t) || 0));
    await chrome.load(`${page}?${new URLSearchParams({ contact:bit, ts:ts.join(","), phase, ...(cast ? { cast } : {}), ...(trigger ? { trigger } : {}) })}`);
    await chrome.until("document.body.dataset.ready === '1'");
    const file = path.join(OUT, `${bit}-contact${phase !== "sap" ? `-${phase}` : ""}${cast ? `-${cast}` : ""}.png`);
    console.log(path.relative(ROOT, await chrome.screenshot(file)));
  } finally { await chrome.close(); }
  process.exit();
}
try {
  const instants = bit === "sheet" ? [null] : reduced ? ["still"] : (times.length ? times : ["0"]).map(t => Math.max(0, Number(t) || 0));
  for (const t of instants) {
    const query = bit === "sheet" ? new URLSearchParams({ sheet:times[0] || "1", phase })
      : new URLSearchParams({ frame:bit, t:String(t === "still" ? 0 : t), phase, ...(cast ? { cast } : {}), ...(trigger ? { trigger } : {}),
        ...(reduced ? { reduced:"1" } : {}) });
    await chrome.load(`${page}?${query}`);
    await chrome.until("document.body.dataset.ready === '1'");
    const name = bit === "sheet" ? `sheet-${times[0] || "rig"}-${phase}` : `${bit}-${t === "still" ? "still" : String(t).padStart(4, "0")}`
      + `${phase !== "sap" ? `-${phase}` : ""}${cast ? `-${cast}` : ""}${trigger ? `-t${trigger}` : ""}`;
    shots.push(await chrome.screenshot(path.join(OUT, `${name}.png`)));
  }
} finally { await chrome.close(); }
shots.forEach(file => console.log(path.relative(ROOT, file)));
if (errors.length) { console.error(errors.map(e => `  ${e}`).join("\n")); process.exitCode = 1; }
