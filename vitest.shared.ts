import { defineConfig } from "vitest/config";

export const sharedVitestConfig = defineConfig({
  test: {
    coverage: {
      exclude: ["**/*.config.*", "**/*.d.ts", "**/dist/**"],
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      thresholds: {
        branches: 85,
        functions: 90,
        lines: 90,
        statements: 90,
      },
    },
    passWithNoTests: true,
    restoreMocks: true,
  },
});
