# Kineō phone app (`apps/mobile`)

The phone app for Kineō: Expo, React Native and HeroUI Native. The repo's root `CLAUDE.md` rules all apply here (small steps, no stubs, design and security rules); this file adds what's specific to Expo. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Run these in `apps/mobile` (the repo uses pnpm; there's no Bun):

```bash
npx expo install <package>  # ALWAYS use instead of pnpm add — resolves SDK-compatible versions
npx expo start              # start the dev server (or `pnpm dev:mobile` from the repo root)
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Lint is Oxlint (`pnpm lint`), not `expo lint`; type-check with `pnpm typecheck`. From the repo root, `pnpm check` runs type-check, lint and tests for every package; run it before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

## Styling (HeroUI Native + Uniwind)

- Style with Tailwind classes in `className` (Uniwind). The theme (palette, radius, shadows, Inter) comes from `@kineo/tokens/heroui-native.css`, imported by `global.css`; change colours there, never in screens, and never hard-code hex values.
- `className` works on React Native's own components. Components from other packages (e.g. `SafeAreaView` from `react-native-safe-area-context`) need wrapping once with `withUniwind` from `uniwind`, or their classes are silently ignored.
- Light theme only (the design brief has no dark mode); `_layout.tsx` keeps it with `Uniwind.setTheme("light")`. Uniwind needs every theme to define the same variables, so theme-wide values (fonts) go in `@theme`, not the light variant.
- Inter is bundled with `@expo-google-fonts/inter` and loaded under the names in `nativeFontFaces` (`@kineo/tokens`).
- After changing `global.css` or the theme, restart Metro with `--clear` if styles look stale.
