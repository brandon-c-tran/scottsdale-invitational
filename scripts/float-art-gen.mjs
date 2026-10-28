/* Float Groove art: image generation (OpenAI Images API), the raw step of
   the art pipeline (float/GROOVE.md "The art pipeline"). The key comes only
   from the environment (OPENAI_API_KEY) and is never printed or written.

     node scripts/float-art-gen.mjs <jobs.json> [--only <regex>] [--force] [--concurrency 5]

   jobs: [{ name, prompt, refs?:[file, ...], size?, quality?, background?, model?,
            fidelity?, format? }]
   With refs the job is an edit (/v1/images/edits, every ref an image[]);
   without, a generation. Each image lands in <raw>/gen/<name>.png; a job
   whose image is already there is skipped (--force redoes it), so a run
   that drops costs nothing to resume. Every request is logged to
   <raw>/requests.log (name, model, outcome, seconds; never the key). */
import fs from "node:fs";
import path from "node:path";
import { RAW, logRequest } from "./float-art-lib.mjs";

const args = process.argv.slice(2);
const jobsFile = args.find(a => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--only" && args[args.indexOf(a) - 1] !== "--concurrency");
const value = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const ONLY = value("--only") ? new RegExp(value("--only")) : null;
const FORCE = args.includes("--force");
const CONCURRENCY = Number(value("--concurrency") || 5);
const key = process.env.OPENAI_API_KEY;
if (!key) { console.error("OPENAI_API_KEY missing"); process.exit(1); }
if (!jobsFile) { console.error("usage: float-art-gen.mjs <jobs.json>"); process.exit(1); }
const jobs = JSON.parse(fs.readFileSync(jobsFile, "utf8").replace(/^﻿/, "")).filter(job => !ONLY || ONLY.test(job.name));
const GEN = path.join(RAW, "gen");
fs.mkdirSync(GEN, { recursive:true });
const DEFAULT_MODEL = "gpt-image-2.5-sunburst";
const MIME = { ".png":"image/png", ".jpg":"image/jpeg", ".jpeg":"image/jpeg", ".webp":"image/webp" };

async function run(job) {
  const out = path.join(GEN, `${job.name}.png`);
  if (!FORCE && fs.existsSync(out)) { console.log(`${job.name}: kept (exists)`); return { name:job.name, kept:true }; }
  const model = job.model || DEFAULT_MODEL;
  const started = Date.now();
  let res;
  if (job.refs?.length) {
    const form = new FormData();
    form.append("model", model);
    form.append("prompt", job.prompt);
    form.append("size", job.size || "1024x1024");
    form.append("n", "1");
    if (job.quality) form.append("quality", job.quality);
    if (job.background) form.append("background", job.background);
    if (job.fidelity) form.append("input_fidelity", job.fidelity);
    if (job.format) form.append("output_format", job.format);
    for (const ref of job.refs) {
      const file = path.resolve(ref);
      form.append("image[]", new Blob([fs.readFileSync(file)], { type:MIME[path.extname(file).toLowerCase()] || "image/png" }), path.basename(file));
    }
    res = await fetch("https://api.openai.com/v1/images/edits", { method:"POST", headers:{ Authorization:`Bearer ${key}` }, body:form });
  } else {
    const body = { model, prompt:job.prompt, size:job.size || "1024x1024", n:1 };
    if (job.quality) body.quality = job.quality;
    if (job.background) body.background = job.background;
    if (job.format) body.output_format = job.format;
    res = await fetch("https://api.openai.com/v1/images/generations", {
      method:"POST", headers:{ Authorization:`Bearer ${key}`, "Content-Type":"application/json" }, body:JSON.stringify(body),
    });
  }
  const seconds = Math.round((Date.now() - started) / 100) / 10;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = String(json?.error?.message || "").slice(0, 240);
    logRequest({ name:job.name, model, ok:false, status:res.status, message, seconds, edit:!!job.refs?.length });
    console.log(`${job.name}: ${model} refused (${res.status}) ${message}`);
    return { name:job.name, ok:false, status:res.status, message };
  }
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) {
    logRequest({ name:job.name, model, ok:false, status:res.status, message:"no image", seconds });
    console.log(`${job.name}: ${model} returned no image`);
    return { name:job.name, ok:false };
  }
  fs.writeFileSync(out, Buffer.from(b64, "base64"));
  logRequest({ name:job.name, model, ok:true, seconds, size:job.size, quality:job.quality, background:job.background, edit:!!job.refs?.length, usage:json.usage || null });
  console.log(`${job.name}: ${model} ok in ${seconds}s -> ${out}`);
  return { name:job.name, ok:true, file:out };
}

const queue = [...jobs];
const results = [];
await Promise.all(Array.from({ length:Math.max(1, CONCURRENCY) }, async () => {
  while (queue.length) {
    const job = queue.shift();
    results.push(await run(job).catch(error => { console.log(`${job.name}: failed ${error.message}`); logRequest({ name:job.name, ok:false, message:error.message }); return { name:job.name, ok:false }; }));
  }
}));
const made = results.filter(r => r.ok).length;
console.log(`${made} made, ${results.filter(r => r.kept).length} kept, ${results.filter(r => r.ok === false).length} failed`);
