// Disposable local runtime for the commissioner concurrency audit only.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const dir = resolve(root, ".commissioner-audit-2026-09-07");
mkdirSync(dir, { recursive:true });
writeFileSync(resolve(dir, "wrangler.json"), JSON.stringify({
  name:"field-day-commissioner-audit", main:resolve(root, "worker/index.js"),
  compatibility_date:"2026-07-21", compatibility_flags:["nodejs_compat"],
  assets:{ directory:resolve(root, "dist/client"), binding:"ASSETS", not_found_handling:"single-page-application", run_worker_first:["/ws", "/api/*"] },
  durable_objects:{ bindings:[{ name:"TOURNAMENT", class_name:"Tournament" }] },
  migrations:[{ tag:"v1", new_sqlite_classes:["Tournament"] }],
  vars:{ APP_ENV:"local", APP_VERSION:"commissioner-audit-2026-09-07", GM_PIN:"2468",
    QA_ENABLED:"true", PROGRESS_RESET_ENABLED:"true", M2_SHOW_CONTROL_ENABLED:"true",
    M2_AUDIO_CATALOG_ENABLED:"false", M2_AUDIO_PLAYBACK_ENABLED:"false" },
}, null, 2));
const child = spawn(process.execPath, [resolve(root, "node_modules/wrangler/bin/wrangler.js"),
  "dev", "--config", resolve(dir, "wrangler.json"), "--local", "--port", "5183",
  "--inspector-port", "9243", "--persist-to", resolve(dir, "state"),
  "--log-level", "warn", "--show-interactive-dev-session=false"], {
  cwd:dir, stdio:"inherit", windowsHide:true,
  env:{ ...process.env, XDG_CONFIG_HOME:resolve(dir, "config"), WRANGLER_LOG_PATH:resolve(dir, "logs"),
    WRANGLER_REGISTRY_PATH:resolve(dir, "registry"), WRANGLER_SEND_METRICS:"false" },
});
console.log("Commissioner audit only: ws://127.0.0.1:5183/ws. Separate storage; test PIN 2468.");
child.on("exit", code => process.exit(code ?? 0));
process.on("SIGINT", () => child.kill());
