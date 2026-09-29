/* Pocket alert (Web Push) keys for one environment.

   node scripts/vapid-keys.mjs --put staging
   node scripts/vapid-keys.mjs --put production

   Generates a fresh P-256 pair and hands both halves straight to
   `wrangler secret put` on stdin, so the private key is never printed,
   typed, or written to disk. Only the public key is shown. Setting a
   production secret is a production change: run it only with approval.

   Replacing a pair invalidates every phone's subscription; each phone
   subscribes again with the new key the next time it opens the app. */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const b64u = bytes => Buffer.from(bytes).toString("base64url");

export async function generateVapidPair() {
  const pair = await crypto.subtle.generateKey({ name:"ECDSA", namedCurve:"P-256" }, true, ["sign", "verify"]);
  const publicKey = b64u(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)));
  const privateKey = (await crypto.subtle.exportKey("jwk", pair.privateKey)).d;
  return { publicKey, privateKey };
}

async function main() {
  const index = process.argv.indexOf("--put");
  const target = index >= 0 ? process.argv[index + 1] : null;
  if (!["staging", "production"].includes(target)) {
    console.error("Name the target: node scripts/vapid-keys.mjs --put staging (or production).");
    process.exitCode = 1;
    return;
  }
  const { publicKey, privateKey } = await generateVapidPair();
  const wrangler = fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url));
  for (const [name, value] of [["VAPID_PRIVATE_KEY", privateKey], ["VAPID_PUBLIC_KEY", publicKey]]) {
    const args = [wrangler, "secret", "put", name, ...(target === "staging" ? ["--env", "staging"] : [])];
    const result = spawnSync(process.execPath, args, { input:`${value}\n`, stdio:["pipe", "inherit", "inherit"] });
    if (result.status !== 0) {
      console.error(`${name} was not stored (${target}). Run this again: the two halves only work as a pair.`);
      process.exitCode = 1;
      return;
    }
  }
  console.log(`Stored VAPID_PRIVATE_KEY and VAPID_PUBLIC_KEY for ${target}.`);
  console.log(`Public key: ${publicKey}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
