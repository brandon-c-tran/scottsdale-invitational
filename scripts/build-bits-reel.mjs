/* The bits review reel as one self-contained page (dev/bits-reel.jsx):
   every script and stylesheet inline, React included, the stand-in photos
   as data URIs, Big Shoulders from Google Fonts and nothing else from the
   network. Written as page content for a claude.ai artifact (the host adds
   the doctype and the head), and printed with its size.

     node scripts/build-bits-reel.mjs              .impeccable/review/bits/bits-reel.html
       --out <file>       somewhere else
       --local-fonts      Big Shoulders inline from public/fonts (no network at all: the frames tool)
       --check            open it in headless Chrome, as the host would wrap it, at a phone's size
                          and the TV's, and fail on a console error or a request to any other host */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { ARTIFACT_SKELETON, launchChrome } from "./headless-chrome.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const value = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
export const REEL_OUT = path.join(ROOT, ".impeccable/review/bits/bits-reel.html");
const LIMIT = 3 * 1024 * 1024;
const GOOGLE_FONTS = "https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@700;800;900&display=swap";
export const REEL_TITLE = "Field Day Bits";

export async function buildReel({ out = REEL_OUT, localFonts = false } = {}) {
  const result = await build({
    absWorkingDir:ROOT, entryPoints:["dev/bits-reel.jsx"], bundle:true, write:false, outdir:"bits-reel-out",
    format:"iife", platform:"browser", target:["es2020", "chrome100", "safari15"], minify:true, legalComments:"none",
    define:{ "process.env.NODE_ENV":"\"production\"", __FD_BUILD_ID__:"\"bits-reel\"" },
    /* the app's self-hosted fonts are dropped below: the page takes Big Shoulders from Google Fonts */
    external:["/fonts/*"], logLevel:"warning",
  });
  const js = result.outputFiles.find(file => file.path.endsWith(".js")).text;
  let css = result.outputFiles.find(file => file.path.endsWith(".css"))?.text || "";
  css = css.replace(/@font-face\s*\{[^}]*url\(\/fonts\/[^}]*\}/g, "");
  const stray = css.match(/url\((?!["']?data:)[^)]*\)/g) || [];
  if (stray.length) throw new Error(`the reel's CSS still loads ${stray.join(", ")}`);
  const fonts = localFonts
    ? `<style>@font-face{font-family:'Big Shoulders Display';font-style:normal;font-weight:100 900;font-display:block;src:url(data:font/woff2;base64,${
      fs.readFileSync(path.join(ROOT, "public/fonts/big-shoulders-display-latin.woff2")).toString("base64")}) format('woff2')}</style>`
    : `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`
      + `<link rel="stylesheet" href="${GOOGLE_FONTS}">`;
  const html = `<meta charset="utf-8">\n<title>${REEL_TITLE}</title>\n${fonts}\n`
    + `<style>${css.replace(/<\/style/gi, "<\\/style")}</style>\n<div id="root"></div>\n`
    + `<script>${js.replace(/<\/script/gi, "<\\/script")}</script>\n`;
  fs.mkdirSync(path.dirname(out), { recursive:true });
  fs.writeFileSync(out, html);
  return { out, bytes:Buffer.byteLength(html) };
}

/* the page as the host would wrap it, beside it, for a local look */
export function wrapForLocal(file) {
  const wrapped = file.replace(/\.html$/, ".local.html");
  fs.writeFileSync(wrapped, ARTIFACT_SKELETON(fs.readFileSync(file, "utf8")));
  return wrapped;
}

async function check(file) {
  const wrapped = wrapForLocal(file);
  const chrome = await launchChrome({ width:390, height:844 });
  const problems = [], hosts = new Set();
  chrome.on(m => {
    if (m.method === "Runtime.exceptionThrown") problems.push(m.params.exceptionDetails.exception?.description?.split("\n")[0]
      || m.params.exceptionDetails.text);
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error")
      problems.push(m.params.args.map(arg => arg.value ?? arg.description ?? "").join(" "));
    if (m.method === "Log.entryAdded" && m.params.entry.level === "error" && !/fonts\.(googleapis|gstatic)/.test(m.params.entry.url || ""))
      problems.push(`${m.params.entry.text} ${m.params.entry.url || ""}`.trim());
    if (m.method === "Network.requestWillBeSent") {
      const url = m.params.request.url;
      if (/^https?:/.test(url)) hosts.add(new URL(url).host);
    }
  });
  try {
    for (const [w, h, label] of [[390, 844, "phone"], [844, 390, "phone, sideways"], [1440, 900, "desktop"]]) {
      await chrome.resize(w, h, { mobile:w < 900, scale:w < 900 ? 3 : 1 });
      await chrome.load(pathToFileURL(wrapped).href);
      const ok = await chrome.until("document.querySelectorAll('.br-card .bit-layer').length >= 3");
      if (!ok) problems.push(`${label}: the reel did not render its bits`);
      const wide = await chrome.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1");
      if (wide) problems.push(`${label}: the page scrolls sideways`);
      /* play one, so the stage's motion and sound paths run */
      await chrome.evaluate("document.querySelector('.br-play')?.click(), true");
      await new Promise(resolve => setTimeout(resolve, 900));
      const playing = await chrome.evaluate("!!document.querySelector('.br-card .bit-layer:not(.is-frozen)')");
      if (!playing) problems.push(`${label}: Play did not start the bit`);
    }
  } finally { await chrome.close(); }
  const others = [...hosts].filter(host => !/^fonts\.(googleapis|gstatic)\.com$/.test(host));
  if (others.length) problems.push(`requests to ${others.join(", ")}`);
  return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const { out, bytes } = await buildReel({ out:value("--out") ? path.resolve(value("--out")) : REEL_OUT, localFonts:args.includes("--local-fonts") });
  const size = bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(2)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
  console.log(`${path.relative(ROOT, out)}  ${size} (${bytes} bytes)`);
  if (bytes > LIMIT) { console.error(`over the ${LIMIT / 1024 / 1024} MB limit`); process.exitCode = 1; }
  if (args.includes("--check")) {
    const problems = await check(out);
    if (problems.length) { console.error(problems.map(p => `  ${p}`).join("\n")); process.exitCode = 1; }
    else console.log("ran headless at 390x844, 844x390 and 1440x900: no console errors, no other hosts");
  }
}
