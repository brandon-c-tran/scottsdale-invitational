import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

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

/* Dev only: the rehearsal pages under /dev. The Workers asset handler
   redirects /dev/x.html to /dev/x (its default html_handling), and Vite
   reads an extensionless request as a module, so the page came back as
   dev/x.jsx. Serve each dev/*.html page itself, before the Worker sees it. */
const devPreviews = () => ({
  name: "fd-dev-previews",
  apply: "serve",
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (req.method !== "GET" && req.method !== "HEAD") return next();
      const page = /^\/dev\/([\w-]+\.html)$/.exec(new URL(req.url, "http://dev.local").pathname)?.[1];
      if (!page) return next();
      let html;
      try { html = await readFile(path.join(server.config.root, "dev", page), "utf8"); }
      catch { return next(); }
      try {
        html = await server.transformIndexHtml(req.url, html);
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.end(req.method === "HEAD" ? undefined : html);
      } catch (error) { next(error); }
    });
  },
});

const appShell = mode => {
  const staging = mode === "staging";
  const values = {
    APP_THEME_COLOR: staging ? "#101A33" : "#090b14",
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
    plugins: [devPreviews(), react(), cloudflare(), appShell(mode), ogUrl()],
    define: { __FD_BUILD_ID__: JSON.stringify(BUILD_ID) },
  };
});
