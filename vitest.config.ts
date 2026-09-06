import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    testTimeout: 20000,
    fileParallelism: false, // Run test files sequentially to avoid database collision
  },
});
