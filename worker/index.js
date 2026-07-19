export { Tournament } from "./tournament.js";

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === "/ws" || url.pathname.startsWith("/api/")) {
      const id = env.TOURNAMENT.idFromName("main");
      return env.TOURNAMENT.get(id).fetch(req);
    }
    return env.ASSETS.fetch(req);
  },
};
