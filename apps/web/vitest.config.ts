import { mergeConfig } from "vitest/config";

import { sharedVitestConfig } from "../../vitest.shared.js";

export default mergeConfig(sharedVitestConfig, {
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
  },
});
