import { defineConfig } from "vitest/config";

// Plain logic only for now (helpers in src/utils); React Native components get a
// testing setup when the first screens arrive.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
