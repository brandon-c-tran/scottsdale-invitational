/* Image generation for Float's look-dev (OpenAI Images API). The key comes
   only from the environment (OPENAI_API_KEY), never printed.
   node imagegen.mjs <outDir> <jobs.json>
   jobs: [{ name, prompt, size?, model?, background?, quality? }] */
import fs from "node:fs";
import path from "node:path";

const [outDir, jobsFile] = process.argv.slice(2);
const key = process.env.OPENAI_API_KEY;
if (!key) { console.error("OPENAI_API_KEY missing"); process.exit(1); }
const jobs = JSON.parse(fs.readFileSync(jobsFile, "utf8"));
fs.mkdirSync(outDir, { recursive: true });
const MODELS = ["gpt-image-2.5-sunburst", "gpt-image-2", "gpt-image-1.5", "gpt-image-1"];

async function generate(job) {
  const models = job.model ? [job.model] : MODELS;
  for (const model of models) {
    const body = { model, prompt: job.prompt, size: job.size || "1536x1024", n: 1 };
    if (job.quality) body.quality = job.quality;
    if (job.background) body.background = job.background;
    const started = Date.now();
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { console.log(`${job.name}: ${model} refused (${res.status}) ${String(json?.error?.message || "").slice(0, 160)}`); continue; }
    const b64 = json?.data?.[0]?.b64_json;
    if (!b64) { console.log(`${job.name}: ${model} returned no image`); continue; }
    const file = path.join(outDir, `${job.name}.png`);
    fs.writeFileSync(file, Buffer.from(b64, "base64"));
    console.log(`${job.name}: ${model} ok in ${((Date.now() - started) / 1000).toFixed(1)} s -> ${file}`);
    return;
  }
}

await Promise.all(jobs.map(job => generate(job).catch(error => console.log(`${job.name}: failed ${error.message}`))));
