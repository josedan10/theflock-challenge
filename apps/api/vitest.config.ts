import { mergeConfig } from "vitest/config";

import { sharedVitestConfig } from "../../vitest.shared.js";

export default mergeConfig(sharedVitestConfig, {
  test: {
    // End-to-end suites run against real PostgreSQL containers in parallel;
    // the 5 s default is too tight for that I/O on a busy machine. This is a
    // time budget, not a retry.
    testTimeout: 20_000,
  },
});
