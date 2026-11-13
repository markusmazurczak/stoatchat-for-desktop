import { defineConfig } from "vite";

// https://vitejs.dev/config
export default defineConfig({
  define: {
    // Fork test builds (STOAT_FORK_BUILD=1) must never auto-update to upstream releases.
    __STOAT_FORK_BUILD__: JSON.stringify(process.env.STOAT_FORK_BUILD === "1"),
  },
  build: {
    rollupOptions: {
      external: ["node-pipewire"],
    },
  },
});
