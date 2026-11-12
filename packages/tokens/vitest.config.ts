import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Lets tests read the theme files (heroui.css, heroui-native.css) with `?raw`
    // (Vitest skips CSS by default).
    css: { include: [/heroui(-native)?\.css/] },
  },
});
