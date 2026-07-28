import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { validateSnapshot } from "../worker/snapshot.js";

const [, , command, ...argv] = process.argv;

function parseArgs(args) {
  const parsed = { _: [] };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      parsed._.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const value = args[index + 1] && !args[index + 1].startsWith("--")
      ? args[++index] : true;
    parsed[key] = value;
  }
  return parsed;
}

const args = parseArgs(argv);
const token = process.env.FIELD_DAY_SNAPSHOT_TOKEN || process.env.FIELD_DAY_GM_TOKEN;
const sha256 = text => createHash("sha256").update(text).digest("hex");
const snapshotSha256 = snapshot => sha256(JSON.stringify(snapshot));
const targetUrl = () => String(args.url || "").replace(/\/+$/, "");
const isProductionHost = url => {
  const host = new URL(url).hostname;
  return host === "fielddayseries.com" || host.endsWith(".fielddayseries.com");
};

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function requireToken() {
  if (!token) throw new Error("FIELD_DAY_SNAPSHOT_TOKEN or FIELD_DAY_GM_TOKEN is required");
}

async function responseJson(response) {
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); }
  catch { throw new Error(`Server returned ${response.status} with a non-JSON body`); }
  if (!response.ok) throw new Error(body.error || body.errors?.join("; ") || `Request failed: ${response.status}`);
  return { body, text };
}

async function validateFile(file) {
  const path = resolve(file);
  const text = await readFile(path, "utf8");
  let snapshot;
  try { snapshot = JSON.parse(text); }
  catch { throw new Error("Malformed JSON"); }
  const checked = validateSnapshot(snapshot);
  if (!checked.ok) throw new Error(checked.errors.join("; "));
  console.log(JSON.stringify({
    ok: true,
    file: path,
    sha256: snapshotSha256(snapshot),
    metadata: snapshot.metadata,
    entries: checked.stats.entries,
    photos: checked.stats.photos,
  }, null, 2));
  return { snapshot, text, checked };
}

async function exportSnapshot() {
  requireToken();
  const url = targetUrl();
  const out = args.out && resolve(String(args.out));
  if (!url || !out) throw new Error("Usage: snapshot:export -- --url <url> --out <file>");
  if (isProductionHost(url) && args.confirm !== "production-export")
    throw new Error("Production export requires --confirm production-export");

  const response = await fetch(`${url}/api/admin/snapshot`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const { body } = await responseJson(response);
  const checked = validateSnapshot(body);
  if (!checked.ok) throw new Error(`Exported snapshot failed validation: ${checked.errors.join("; ")}`);
  const output = `${JSON.stringify(body, null, 2)}\n`;
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, output, { flag: "wx" });
  console.log(JSON.stringify({
    ok: true,
    file: out,
    sha256: snapshotSha256(body),
    metadata: body.metadata,
    entries: checked.stats.entries,
    photos: checked.stats.photos,
  }, null, 2));
}

async function restoreSnapshot() {
  requireToken();
  const url = targetUrl();
  const file = args.file && String(args.file);
  const confirm = String(args.confirm || "");
  if (!url || !file || !["local", "staging"].includes(confirm))
    throw new Error("Usage: snapshot:restore -- --url <url> --file <file> --confirm local|staging");
  if (isProductionHost(url))
    throw new Error("Production restore is prohibited");

  const { text } = await validateFile(file);
  const response = await fetch(`${url}/api/admin/restore`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Field-Day-Confirm": confirm,
    },
    body: text,
  });
  const { body } = await responseJson(response);
  if (body.environment !== confirm)
    throw new Error(`Server restored ${body.environment}, expected ${confirm}`);
  console.log(JSON.stringify(body, null, 2));
}

async function recoverBackup() {
  requireToken();
  const url = targetUrl();
  const backupKey = String(args.backup || "");
  const confirm = String(args.confirm || "");
  if (!url || !backupKey || !["local", "staging"].includes(confirm))
    throw new Error("Usage: snapshot:recover -- --url <url> --backup <key> --confirm local|staging");
  if (isProductionHost(url)) throw new Error("Production backup recovery is prohibited");

  const response = await fetch(`${url}/api/admin/restore-backup`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Field-Day-Confirm": confirm,
    },
    body: JSON.stringify({ backupKey }),
  });
  const { body } = await responseJson(response);
  if (body.environment !== confirm)
    throw new Error(`Server recovered ${body.environment}, expected ${confirm}`);
  console.log(JSON.stringify(body, null, 2));
}

try {
  if (command === "validate") {
    const file = args._[0];
    if (!file) throw new Error("Usage: snapshot:validate -- <file>");
    await validateFile(file);
  } else if (command === "export") {
    await exportSnapshot();
  } else if (command === "restore") {
    await restoreSnapshot();
  } else if (command === "recover") {
    await recoverBackup();
  } else {
    throw new Error("Expected command: validate, export, restore, or recover");
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
