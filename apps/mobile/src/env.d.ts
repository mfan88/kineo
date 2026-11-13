// Types the app needs before any tool has run, so a fresh checkout (CI) type-checks.
// Expo writes expo-env.d.ts and Uniwind writes src/uniwind-types.d.ts when the dev
// server starts; both are git-ignored and say the same as this file. If the themes
// in global.css change, change them here too.

/// <reference types="expo/types" />
/// <reference types="uniwind/types" />

declare module "uniwind" {
  export interface UniwindConfig {
    themes: readonly ["light", "dark"];
  }
}

// Makes this file a module, so the block above adds to Uniwind's types instead of
// replacing them.
// oxlint-disable-next-line unicorn/require-module-specifiers
export {};
