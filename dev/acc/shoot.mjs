/* node dev/acc/shoot.mjs <out.png> "<query>"  (a static server on :8765 at the repo root) */
import { launchChrome } from "../../scripts/headless-chrome.mjs";
const [out, query = ""] = process.argv.slice(2);
const c = await launchChrome({ width:1600, height:1000 });
try {
  await c.load(`http://127.0.0.1:8765/dev/acc/sheet.html?${query}`);
  const ok = await c.until("window.done", { timeout:180000 });
  if (!ok) { console.log("timeout", await c.evaluate("document.body.innerText.slice(0,300)")); }
  const [w, h] = await c.evaluate("window.done");
  await c.resize(w, h);
  await new Promise(r => setTimeout(r, 300));
  await c.screenshot(out);
  console.log(out, w, h);
} finally { await c.close(); }
