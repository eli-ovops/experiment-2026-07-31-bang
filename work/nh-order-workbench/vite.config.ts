import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  base: "./",
  plugins: [react(), viteSingleFile()],
  build: {
    target: "es2022",
    sourcemap: false,
    cssCodeSplit: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER
  }
});
