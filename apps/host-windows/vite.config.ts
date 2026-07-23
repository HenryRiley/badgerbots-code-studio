import { defineConfig } from "vite";

export default defineConfig({
  clearScreen: false,
  server: { strictPort: true },
  envPrefix: ["VITE_", "TAURI_"],
  build: { target: "es2021", sourcemap: true },
});
