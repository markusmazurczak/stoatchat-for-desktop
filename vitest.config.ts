// eslint-plugin-import's node resolver does not understand package "exports" maps.
// eslint-disable-next-line import/no-unresolved
import { defineConfig } from "vitest/config";

// Fork-only test infrastructure (not proposed upstream).
// Electron APIs are mocked per test via `vi.mock("electron", ...)`.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    passWithNoTests: true,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/*.d.ts"],
      reporter: ["text", "html", "lcov"],
    },
  },
});
