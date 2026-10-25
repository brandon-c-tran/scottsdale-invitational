import { handleClientError } from "./clientError.js";

export { Tournament } from "./tournament.js";
/* Float, the river game (float/PROTOCOL.md): one Durable Object per room */
export { FloatRoom } from "../float/worker/room.js";

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === "/api/client-error") return handleClientError(req);
    if (url.pathname === "/float/ws") {
      const room = url.searchParams.get("room") || "test";
      if (!/^[a-z0-9-]{1,32}$/.test(room)) return new Response("Bad room", { status:400 });
      return env.FLOAT.get(env.FLOAT.idFromName(room)).fetch(req);
    }
    if (url.pathname === "/ws" || url.pathname.startsWith("/api/")) {
      const id = env.TOURNAMENT.idFromName("main");
      return env.TOURNAMENT.get(id).fetch(req);
    }
    return env.ASSETS.fetch(req);
  },
};
