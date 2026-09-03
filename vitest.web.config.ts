import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@web": fileURLToPath(new URL("./src/web", import.meta.url)),
      "@shared": fileURLToPath(new URL("./ts/shared", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    include: ["test/web/**/*.test.tsx"],
    setupFiles: ["./test/setup-web.ts"],
    passWithNoTests: true,
  },
});
