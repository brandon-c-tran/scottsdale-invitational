import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

/* Link previews need ABSOLUTE urls: og:url especially is meaningless as a
   path, so the live domain is the default rather than something you have to
   remember to pass. SITE_URL still overrides it for a preview deploy. */
const SITE = (process.env.SITE_URL || "https://fielddayseries.com").replace(/\/+$/, "");
const ogUrl = () => ({
  name: "fd-og-url",
  transformIndexHtml: html => html.replaceAll("%SITE_URL%", SITE),
});

const appShell = mode => {
  const staging = mode === "staging";
  const values = {
    APP_THEME_COLOR: staging ? "#101A33" : "#171009",
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
  };
});
