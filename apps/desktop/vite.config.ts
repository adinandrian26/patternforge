import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

export default defineConfig({
  clearScreen: false,
  plugins: [preact()],
  server: {
    host: "localhost",
    port: 1420,
    strictPort: true,
  },
  build: {
    target: "es2021",
    sourcemap: false,
  },
});
