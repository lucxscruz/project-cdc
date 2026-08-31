import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 60_000,
    pool: "forks",
    include: ["tests/integration/**/*.test.ts"],
    globals: true,
  },
});
