import { mergeConfig } from "vitest/config";

import { sharedVitestConfig } from "../../vitest.shared.js";

export default mergeConfig(sharedVitestConfig, {
  // tsconfig keeps `jsx: "preserve"` for Next.js; tests need Vite to compile JSX.
  oxc: { jsx: { runtime: "automatic" } },
  // Resolve the `@/*` alias from tsconfig, as shadcn components import through it.
  resolve: { tsconfigPaths: true },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
  },
});
