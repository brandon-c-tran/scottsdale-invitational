/* One build id for the client bundle and the Worker. vite.config.js defines
   __FD_BUILD_ID__ once per build and both environments inherit it, so a
   phone can tell that the Worker it is talking to shipped after its own
   bundle. Plain Node (tests, scripts) has no define and reads "dev", which
   never counts as a mismatch. */
/* global __FD_BUILD_ID__ */
const BUILD_ID = typeof __FD_BUILD_ID__ === "string" && __FD_BUILD_ID__ ? __FD_BUILD_ID__ : "dev";

const buildsDiffer = (client, server) =>
  typeof client === "string" && typeof server === "string"
  && client !== "dev" && server !== "dev" && client !== server;

export { BUILD_ID, buildsDiffer };
