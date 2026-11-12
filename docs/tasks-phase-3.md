# Kineō tasks: Phase 3, phone app

Part of the shared checklist in [`tasks.md`](tasks.md), split out so each is easier to read. Same rules: work top to bottom, tick a task (`[x]`) only when it meets the definition of done in `CLAUDE.md`, and add follow-ups to **Discovered** in `tasks.md`.

## Phase 3: phone app (`apps/mobile`)

The phone app shares `@kineo/shared`, `@kineo/data` and `@kineo/tokens` with desktop and follows the phone rules in `docs/design-brief.md`: bottom tab bar, back arrows on detail screens, generous top padding, no invoice style screens. Each step leaves an app that runs; tabs appear as their screens are built, never as placeholders.

### Shell

- [x] **M1. Scaffold `apps/mobile`:** Expo with TypeScript and Expo Router (decide the Expo SDK version and template at the start), package `@kineo/mobile`, display name "Kineō", bundle ID / package `tech.fenna.kineo` (same as desktop, per Notes). Metro resolves the workspace packages with the hoisted pnpm layout; `typecheck`, `lint` (Oxlint) and `test` scripts wired into Turborepo so `pnpm check` covers it; `pnpm dev:mobile` starts it. Runs on the iOS simulator. A tiny screen proves `@kineo/shared` imports work (e.g. formats a made-up amount), then is replaced in M3.
- [x] **M2. Theme from `@kineo/tokens`:** HeroUI Native set up (and the styling it needs; decide at the start) with the sky palette, radius, soft shadows and Inter loaded with `expo-font` and bundled for offline. A test checks the theme's colours come from `@kineo/tokens`, not copies.
- [x] **M3. Navigation and Home on demo data:** Expo Router layout with the bottom tab bar (active tab sky blue, icons, labels in sentence case) and a stack for detail screens, each with only a back arrow; 64px top padding with a 52px back-arrow row, safe areas on notched phones, touch targets at least 44px. Home on made-up demo data, as on desktop ("Who are you seeing?", search, recent patients, the three invoice groups). Only the Home tab shows until the other tabs' screens exist.
- [x] **M4. Shared demo data:** move the made-up demo practice out of `apps/desktop` into one shared place (decide where: e.g. a `demo` export of `@kineo/data` or `@kineo/shared`) so both apps' tests and demo screens use the same data. Desktop keeps passing its tests. Done before M3 (Home needs it): `@kineo/data/demo`, `createDemoPractice()`.
- [x] **M5. Icon, launch screen and app name:** the iOS icon (full-bleed 1024 px) and Android adaptive icon (foreground, `#E0F2FE` background, monochrome layer) drawn from `docs/brand.md`, like desktop's `pnpm --filter @kineo/desktop icon`; launch screen with the pale sky background, icon on a white tile and the wordmark below; "Kineō" under the icon on the home screen.
- [x] **M6. Shell check on both platforms:** run on the iOS simulator and an Android emulator; check safe areas, the tab bar, back navigation (including Android's back button), text sizes with larger accessibility text, contrast and 44px targets. Record what was checked here, and fix what it finds.
  - **iOS** (iPhone 16 Pro simulator, iOS 18, development build, 2026-11-12):
    - Icon, "Kineō" under it on the home screen, and the launch screen (tile and wordmark on pale sky) match `docs/brand.md`.
    - Safe areas: content clears the Dynamic Island and status bar (64 pt top space); the tab bar clears the home indicator.
    - Tab bar: one tab (Home), sky icon. Fixed: its label was sky text (about 4.1:1); now `primaryStrong` `#0369A1` (5.9:1), icon still sky.
    - Larger text: at the largest accessibility size, text grew about 3× and split "Who are you seeing?" one word per line. Fixed: text may now grow up to 2×, headings 1.5× (`src/components/text.tsx`, and HeroUI's own text through the provider). Checked at the largest size: everything still grows and wraps cleanly. iOS applies a new text size when the app restarts.
    - Contrast: body `#11181C`, muted `#71717A` (4.6:1 on the page), chip text `#075985` on tint, all at least 4.5:1.
    - Targets: search field 48 pt, tab bar native. Recent-patient chips are about 43 pt tall; they aren't tappable yet, so make them 44 pt when they link to patients.
    - Back navigation: no detail screens yet, so the back arrow is covered by `screen.test.tsx` only; check it live with the first detail screen.
  - **Android** (Pixel 10a emulator, Google Play image, development build, 2026-11-12):
    - Fixed: the app crashed on start. The tab icon's `md` (Material Symbols) name needs `expo-symbols`, now installed. iOS wasn't affected (it uses SF Symbols).
    - Fixed: the tab bar and active-tab pill were Material's default lavender; now `surface` white and the brand `tint`.
    - Icon: adaptive icon (mark on tint) shows in the launcher's circle mask. In the dock it had a light blue outline, which is the Pixel launcher's ring for suggested apps, not part of the icon. Launch screen: white tile on pale sky, no wordmark (as planned for Android 12+).
    - Safe areas: content clears the status bar and the tab bar clears the gesture bar.
    - Back button: on Home it leaves the app to the launcher, as expected. Back from a detail screen is untested until the first one exists (as on iOS).
    - Larger text: at Android's largest font size (2×), everything wraps cleanly; the 2× cap matches Android's own maximum.
    - Contrast and targets: same colours and sizes as iOS; the active tab label is `primaryStrong`.
    - Development builds on Android 17 ask for "nearby devices" (`ACCESS_LOCAL_NETWORK`) to reach Metro. It comes from React Native's debug manifest only and isn't in release builds; allow it on test devices.

### Then (break down when the shell is done)

- Spikes: Clerk's Expo SDK (sign-in methods as desktop: email code and password; session in `expo-secure-store`), and PowerSync's React Native SDK (storage, offline, restart). Note: `@powersync/react-native` 1.35 expects `@powersync/common` 1.x, while `@kineo/data` uses 2.0 (required by the desktop Tauri plugin); the spike must settle how both apps share `@kineo/data`.
- Sign-in screen, session storage and Sign out, as on desktop (D3, D5, D8).
- The TypeScript connector: Clerk tokens, uploads to PostgREST, new invoices through `rpc/create_invoice`, `ownRowId` for profile, settings and style, refusals shown as toasts (see Notes).
- Screens: Patients, New patient, Patient (with notes), Invoices, Invoice editor, Invoice preview (send only once synced), Settings, Profile, Price list and tax. Settings shows a note instead of Invoice style.
- End-to-end check against the server, including one account on the phone and desktop together.
