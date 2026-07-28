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

export default defineConfig({
  plugins: [react(), cloudflare(), ogUrl()],
});
