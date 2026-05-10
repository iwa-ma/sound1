import { defineConfig } from "vite";

/** Relative base works when hosted under GitHub Pages project URLs. */
export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    assetsDir: "assets",
  },
});
