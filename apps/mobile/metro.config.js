// Metro with Uniwind (Tailwind 4 for React Native). Expo's default config already
// handles the monorepo (watching the workspace packages it imports).
const { getDefaultConfig } = require("expo/metro-config");
const { withUniwindConfig } = require("uniwind/metro");

const config = getDefaultConfig(__dirname);

module.exports = withUniwindConfig(config, {
  cssEntryFile: "./global.css",
  dtsFile: "./src/uniwind-types.d.ts",
});
