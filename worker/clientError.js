/* POST /api/client-error: the crash screen reports what broke so it shows up
   in `wrangler tail`. Nothing is stored. Answered by the Worker itself, never
   the Durable Object, so a crash loop cannot slow the tournament down.
   Limits are per isolate: good enough to stop a looping TV from flooding the
   log, which is the only realistic abuse for a 13-person app. */
const MAX_BODY_BYTES = 16 * 1024;
const WINDOW_MS = 60 * 1000;
const PER_CLIENT_LIMIT = 6;
const GLOBAL_LIMIT = 60;

const recent = new Map();
let globalWindow = { start:0, count:0 };

const text = (value, max) => typeof value === "string" ? value.slice(0, max) : undefined;

function allow(key, now) {
  if (now - globalWindow.start >= WINDOW_MS) globalWindow = { start:now, count:0 };
  if (globalWindow.count >= GLOBAL_LIMIT) return false;
  const hits = (recent.get(key) || []).filter(at => now - at < WINDOW_MS);
  if (hits.length >= PER_CLIENT_LIMIT) { recent.set(key, hits); return false; }
  hits.push(now);
  recent.set(key, hits);
  if (recent.size > 500) {
    for (const [entry, times] of recent)
      if (!times.some(at => now - at < WINDOW_MS)) recent.delete(entry);
  }
  globalWindow.count++;
  return true;
}

async function handleClientError(req, { now = Date.now(), log = console.error } = {}) {
  if (req.method !== "POST") return new Response("Method not allowed", { status:405 });
  const declared = Number(req.headers.get("Content-Length") || 0);
  if (declared > MAX_BODY_BYTES) return new Response(null, { status:413 });
  const key = req.headers.get("CF-Connecting-IP") || "unknown";
  if (!allow(key, now)) return new Response(null, { status:429, headers:{ "Retry-After":"60" } });
  let body = null;
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return new Response(null, { status:413 });
    body = JSON.parse(raw);
  } catch {
    return new Response(null, { status:400 });
  }
  log(JSON.stringify({
    event:"client-error",
    message:text(body?.message, 500),
    stack:text(body?.stack, 4000),
    componentStack:text(body?.componentStack, 4000),
    build:text(body?.build, 80),
    path:text(body?.path, 200),
    tv:body?.tv === true,
    attempt:Number.isSafeInteger(body?.attempt) ? body.attempt : undefined,
    userAgent:text(req.headers.get("User-Agent") || "", 200),
  }));
  return new Response(null, { status:204 });
}

const resetClientErrorLimits = () => { recent.clear(); globalWindow = { start:0, count:0 }; };

export { handleClientError, resetClientErrorLimits };
