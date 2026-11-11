import { defineConfig, type UserConfig } from "vite";
import react from "@vitejs/plugin-react";
// @ts-expect-error type error without @types/node package
import process from "node:process";

// Set by `tauri dev` when running on a phone or another device on the network.
const host: string | undefined = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/ (options tailored for `tauri dev` and `tauri build`)
export default defineConfig((): UserConfig => ({
  plugins: [react()],
  // Don't hide Rust errors.
  clearScreen: false,
  server: {
    // Tauri expects a fixed port; fail if it isn't available.
    port: 1420,
    strictPort: true,
    host: host ?? false,
    ...(host ? { hmr: { protocol: "ws", host, port: 1421 } } : {}),
    // Don't watch the Rust side.
    watch: { ignored: ["**/src-tauri/**"] },
  },
}));
