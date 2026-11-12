// Screen tests (*.test.tsx) with Expo's Jest preset and React Native Testing
// Library; plain logic (*.test.ts) runs in Vitest. `pnpm test` runs both.
const preset = require("jest-expo/jest-preset");

// Packages that ship untranspiled code and must go through Babel, on top of the
// preset's own list (React Native, Expo, React Navigation…).
const alsoTransform = [
  "heroui-native",
  "uniwind",
  "@gorhom",
  "tailwind-variants",
  "tailwind-merge",
  // @kineo/data builds desktop's schema with @powersync/common, which ships ES modules.
  "@powersync",
];

module.exports = {
  preset: "jest-expo",
  testMatch: ["<rootDir>/src/**/*.test.tsx"],
  // Reanimated's resolver (which wraps Worklets') picks their plain-JS builds
  // (no native module in Jest); the setup file swaps in Reanimated's official mock.
  resolver: "react-native-reanimated/jest/resolver",
  setupFiles: ["react-native-gesture-handler/jestSetup.js", "<rootDir>/jest.setup.js"],
  transformIgnorePatterns: preset.transformIgnorePatterns.map((pattern) =>
    pattern.startsWith("/node_modules/(?!(")
      ? pattern.replace("/node_modules/(?!(", `/node_modules/(?!(${alsoTransform.join("|")}|`)
      : pattern,
  ),
};
