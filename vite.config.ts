import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss(), ...(process.env.COURTSYNC_BROWSER_TEST === "true" ? [] : [cloudflare({ configPath: "./wrangler.jsonc" })])],
  // WeChat's iOS WebView can lag behind the current desktop CSS baseline.
  // Keep responsive rules compatible with older WebKit media-query syntax.
  build: { cssTarget: ["safari14", "chrome88"] },
  resolve: {
    alias: {
      "@web": fileURLToPath(new URL("./src/web", import.meta.url)),
      "@shared": fileURLToPath(new URL("./ts/shared", import.meta.url)),
    },
  },
});
