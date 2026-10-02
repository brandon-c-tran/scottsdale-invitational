/* Build the actual app sheets for an isolated local rehearsal. Transport and
   install modules are replaced at bundle time; production imports are intact. */
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const blocked = names => names.map(name => `export const ${name} = () => {
  throw new Error("${name} is unavailable in the isolated preview");
};`).join("\n");
await build({
  absWorkingDir:root,
  stdin:{ contents:`
    export { EventSheet, BracketSheet, EventIntro, Reveal, ResultSheet, PokerResultSheet, ChipCounter } from "./src/App.jsx";
    export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";
    export { PlayerSheet } from "./src/features/profile/PlayerSheet.jsx";
    export { Wagers } from "./src/features/wagers/Wagers.jsx";
    export { Shell } from "./src/ui/Shell.jsx";
    export { GameMark } from "./src/ui/GameMark.jsx";
    export { Sheet, ActionButton } from "./src/ui/controls.jsx";
    export { DraftSheet, DraftEntry } from "./src/features/draft/DraftSheet.jsx";
  `, resolveDir:root, loader:"jsx" },
  outfile:"dev/efficiency-components.js", bundle:true, platform:"browser", format:"esm",
  /* Leaflet's stylesheet names its control images */
  loader:{ ".png":"dataurl" },
  external:["react", "react/*", "react-dom", "react-dom/*"],
  plugins:[{ name:"isolated-preview", setup(builder) {
    builder.onLoad({ filter:/[\\/]src[\\/]lib[\\/]client\.js$/ }, () => ({
      contents:blocked(["useTournament", "dispatch", "uploadPhoto", "downloadSnapshot", "localGet", "localSet",
        "getDeviceId", "setGmToken", "hasGmToken", "spotifyStatus", "spotifyPlayer", "spotifySearch",
        "spotifyAuthorize", "spotifyDisconnect", "spotifyPlay", "spotifyPause", "spotifyDevice", "spotifyAutoWinSongs", "songPreview", "songSnippet", "spotifyRetry", "geoUploadPhoto", "geoDeleteRound", "geoPhotoUrl"]), loader:"js",
    }));
    builder.onLoad({ filter:/[\\/]features[\\/]check-in[\\/]install\.js$/ }, () => ({
      contents:`export const installEvt = null;\n${blocked(["onInstallReady", "firstOnboardStep", "isStandalone", "isIOS"])}`,
      loader:"js",
    }));
  } }],
  logLevel:"info",
});
