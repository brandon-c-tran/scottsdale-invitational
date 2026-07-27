import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

/* Link previews want an ABSOLUTE og:image, and the domain is not known at
   commit time. `SITE_URL=https://... npm run build` stamps it in; with the
   variable unset the tag stays relative, which most chat clients still
   resolve, so a plain build is never broken by forgetting it. */
const ogUrl = () => ({
  name: "fd-og-url",
  transformIndexHtml: html => html.replaceAll("%SITE_URL%", (process.env.SITE_URL || "").replace(/\/$/, "")),
});

export default defineConfig({
  plugins: [react(), cloudflare(), ogUrl()],
});
