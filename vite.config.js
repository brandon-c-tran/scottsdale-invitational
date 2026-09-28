import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";

/* Link previews need ABSOLUTE urls: og:url especially is meaningless as a
   path, so the live domain is the default rather than something you have to
   remember to pass. SITE_URL still overrides it for a preview deploy. */
const SITE = (process.env.SITE_URL || "https://fielddayseries.com").replace(/\/+$/, "");
const ogUrl = () => ({
  name: "fd-og-url",
  transformIndexHtml: html => html.replaceAll("%SITE_URL%", SITE),
});

/* One id per build, shared by the client bundle and the Worker through
   `define` (shared/build.js reads it). The Worker stamps it on every state
   frame, so a phone running an older bundle knows to reload.
   This config is evaluated once for the client build and again for the
   Worker build, so the id must be derived from the source, never the clock:
   the commit plus a hash of any uncommitted changes. A clock made the two
   halves of one deploy disagree forever. FD_BUILD_ID overrides it. */
const git = args => {
  try { return execSync(`git ${args}`, { stdio:["ignore", "pipe", "ignore"], maxBuffer:64 * 1024 * 1024 }).toString(); }
  catch { return ""; }
};
const sourceId = () => {
  const sha = git("rev-parse --short HEAD").trim();
  const dirty = git("status --porcelain --untracked-files=no") ? git("diff HEAD --binary") : "";
  const suffix = dirty ? createHash("sha256").update(dirty).digest("hex").slice(0, 8) : "";
  return [sha, suffix].filter(Boolean).join("-");
};
const BUILD_ID = process.env.FD_BUILD_ID || sourceId();

const appShell = mode => {
  const staging = mode === "staging";
  const values = {
    APP_THEME_COLOR: staging ? "#101A33" : "#0e191c",
    APP_NAME: staging ? "Field Day Staging" : "Field Day",
    APP_MANIFEST: staging ? "/manifest-staging.webmanifest" : "/manifest.webmanifest",
    APP_FAVICON: staging ? "/favicon-staging.svg" : "/favicon.svg",
    APP_ICON_192: staging ? "/icon-staging-192.png" : "/icon-192.png",
    APP_APPLE_TOUCH_ICON: staging ? "/apple-touch-icon-staging.png" : "/apple-touch-icon.png",
    APP_TITLE: staging ? "Field Day Staging · Scottsdale 2026" : "Field Day · Scottsdale 2026",
  };
  return {
    name: "fd-app-shell",
    transformIndexHtml: html => Object.entries(values).reduce(
      (output, [key, value]) => output.replaceAll(`%${key}%`, value),
      html,
    ),
  };
};

export default defineConfig(({ mode }) => {
  /* Vite reserves the literal mode name "local" for .env.local files, so its
     normal development mode maps explicitly to Wrangler's isolated local
     target. Staging remains named; production is the existing top-level
     Worker and custom domain. */
  if (mode === "development") process.env.CLOUDFLARE_ENV = "local";
  else if (mode === "staging") process.env.CLOUDFLARE_ENV = "staging";
  else delete process.env.CLOUDFLARE_ENV;
  return {
    plugins: [react(), cloudflare(), appShell(mode), ogUrl()],
    define: { __FD_BUILD_ID__: JSON.stringify(BUILD_ID) },
  };
});
