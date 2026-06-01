import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST || "127.0.0.1";
const isTauriDebug = Boolean(process.env.TAURI_ENV_DEBUG);

export default defineConfig({
  plugins: [react()],
  server: {
    host,
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:4177",
    },
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
    ...(isTauriDebug ? { minify: false, sourcemap: true } : {}),
  },
});
