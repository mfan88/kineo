import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Lets tests read heroui.css with `?raw` (Vitest skips CSS by default).
    css: { include: [/heroui\.css/] },
  },
});
