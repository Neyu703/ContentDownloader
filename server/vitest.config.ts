import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Vitest 4's defaultExclude no longer skips dist/ — without this, stale compiled test
    // output runs alongside src/ and races it over shared fixture files on disk.
    exclude: ["**/node_modules/**", "**/dist/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      // index.ts only wires app.listen() + the startup yt-dlp update check; see server README/plan.
      exclude: ["src/index.ts"],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
});
