# Kineō tech stack

Identifiers use plain **kineo** (repo, packages `@kineo/...`, bundle IDs, database, Clerk app, domain). Display name is **Kineō**.

## Apps

- **Phone (iOS, Android):** Expo + React Native + HeroUI Native
- **Desktop (Mac, Windows):** Tauri 2 + React + Vite + HeroUI v3. Invoice style screen is desktop only. Tauri `productName` is "Kineo"; window title is "Kineō".
- **`@kineo/shared`:** types, Zod schemas, invoice maths (integer cents), note rules. Plain TypeScript, no framework.
- **`@kineo/data`:** local SQLite on each device + PowerSync client for offline-first sync. The only database access layer.

## Repo layout (pnpm workspaces + Turborepo)

```
kineo/
  apps/mobile/                Expo (Expo Router: (tabs)/, patient/[id], invoice/[id])
  apps/desktop/               Tauri + React + Vite (src/, src-tauri/)
  packages/shared/            types, Zod schemas, invoice maths, note rules + tests
  packages/data/              PowerSync schema, local SQLite queries, sync
  packages/tokens/            colours, radius, spacing, font for both HeroUI themes
  packages/invoice-template/  one HTML invoice for preview and PDF on both apps
  packages/config/            shared tsconfig and prettier (Oxlint config is the root .oxlintrc.json)
  supabase/                   migrations (tables + RLS), seed.sql (fake data), RLS tests, config.toml (Clerk)
  infra/                      docker-compose (Supabase + PowerSync), Caddyfile, powersync/, backup/, .env.example
  docs/                       design-brief.md, tech-stack.md, tasks.md, images/
  .claude/                    settings.json, skills/next-step
  .github/workflows/ci.yml
```

### Rules

- Business logic lives only in `packages/shared`.
- Screens never query the database directly; they go through `packages/data`.
- UI components are not shared between apps (different HeroUI libraries); only logic and tokens are shared.
- No secrets committed; only `.env.example` files with blank values.

## Auth

- Clerk (Expo SDK on phone, React SDK on desktop).
- Clerk tokens are verified by self-hosted Supabase via third-party auth (Clerk JWKS). Row-level security is keyed on the Clerk user ID.
- PowerSync is configured with Clerk's JWKS too.
- Tokens are stored in secure storage (`expo-secure-store` / OS keychain).
- Clerk is US-hosted and holds practitioner identity only; patient data stays in our database. Mention this in the privacy notice.

### Desktop sign-in (decided in D1, Nov 2026)

Clerk has no official Tauri SDK, and its normal cookie sessions don't work in the Tauri window (WKWebView won't keep Clerk's cookies). The desktop app instead uses Clerk's **Native API** (token mode), the same way Clerk's Expo and Electron SDKs do:

- **Packages:** `@clerk/react` (v6) for hooks and `ClerkProvider`, given an instance of `@clerk/clerk-js`. Set up in `apps/desktop/src/auth/clerk.ts`.
- **Token mode:** every Clerk request omits cookies, adds `_is_native=1`, and carries the client token in `Authorization`; Clerk returns the updated token in its `Authorization` response header. "Native API" must stay on in the Clerk dashboard (Configure → Native applications).
- **Requests go through Rust.** The webview always adds an `Origin` header, and Clerk refuses requests with both `Origin` and `Authorization`. So in the Tauri window, requests to the Clerk Frontend API are sent by the `clerk_request` command (`src-tauri/src/clerk_http.rs`, `reqwest`), which only calls HTTPS Clerk hosts and never forwards `Origin` or `Cookie`. Chosen over Tauri's HTTP plugin so the "no Origin" rule is our tested code, not a plugin default. Add the production Clerk domain to its allow-list when there is one.
- **Custom sign-in screen**, not Clerk's prebuilt components (they assume a browser with cookies and don't follow our design rules). Built in D3 on the `useSignIn` API (`signIn.password`, `signIn.emailCode`).
- **Sign-in methods:** email code and email + password, and Google (Phase 8). Anyone can create an account (A2): full name, email and a required Terms and Privacy agreement, then the emailed code (`signUp.create({ emailAddress, legalAccepted: true })`, `verifications.sendEmailCode` / `verifyEmailCode`, `finalize`). Keep Clerk's leaked-password check on. The full name isn't sent to Clerk: it's held in memory and saved as Your profile's full name once the practice is open, only if that's empty (`profileWithSignUpName`).
- **Google on desktop (A5):** Google refuses sign-in inside an embedded web view, so it happens in the default browser. `client.signIn.create({ strategy: "oauth_google", redirectUrl: "https://www.getkineo.work/signed-in/" })` gives Google's page, opened by the `open_sign_in_page` command (`src-tauri/src/browser.rs`: only HTTPS pages on `accounts.google.com` or Clerk's own hosts). After Google, Clerk sends the browser to the website's `/signed-in/` page (`apps/web/signed-in/`), which says "You're signed in to Kineō", removes the query from the address bar and forwards it to `kineo://sso-callback` (so the tab doesn't stay on Google's page). The app receives that link (`tauri-plugin-deep-link`, scheme in `tauri.conf.json`) and brings its window to the front (`src-tauri/src/focus.rs`; on macOS 14+ through cooperative activation); the auth gate reads `rotating_token_nonce` from it and finishes with Clerk's classic objects (`client.signIn.reload({ rotatingTokenNonce })`, and `client.signUp.create({ transfer: true })` for a new account), since the newer API has no way to pass the nonce. A new account that still needs the agreement gets "One more step" (`signUp.update({ legalAccepted: true })`). macOS only for now: Windows and Linux need the single-instance plugin first, and `tauri dev` can't receive the link on macOS (use a bundled build).
- **Session storage (D5):** the client token is kept in the OS keychain (`keyring` crate 4.2: macOS Keychain, Windows Credential Manager, Linux Secret Service) through three app commands in `src-tauri/src/session_store.rs` that can only read, replace or clear one entry (`tech.fenna.kineo` / `clerk-client-token`). It's read once before Clerk's first request and saved whenever Clerk returns a new one. Checked on macOS: still signed in after a restart.
- **Privacy:** pass `telemetry={false}` to `ClerkProvider`. Clerk also loads a bot-protection script from `*.protect.clerk.com`; the Content-Security-Policy must allow it.
- Checked in the Tauri window on macOS: both methods sign in and sign out.

### Phone sign-in (decided in M7, Nov 2026)

Clerk's Expo SDK works as is: it already uses the Native API (token mode), so the phone needs none of desktop's workarounds (no request proxy, no keychain commands of our own).

- **Packages:** `@clerk/expo` 4.15.1, pinned exactly (`@clerk/clerk-expo` is deprecated). It brings `@clerk/react` ^6.18 and `@clerk/clerk-js` ^6.42, the same generation as desktop, so the sign-in calls are the same: `signIn.emailCode.sendCode` / `verifyCode` and `signIn.password`. The only extra package is `expo-secure-store`; Clerk's other peers (social sign-in, passkeys, biometrics) are optional and not installed. Both add config plugins, so a new development build is needed after changing them.
- **Custom sign-in screen** (M16), as on desktop, not Clerk's prebuilt components. Same methods: email code first, password as the alternative, Create an account (A3), and Google (A4).
- **Google on the phone (A4):** `useSSO` from `@clerk/expo/experimental` (the same newer API as the sign-in calls; experimental, so recheck on Clerk upgrades), with `expo-auth-session` and `expo-web-browser` (native code: needs a new development build). It opens Google in the browser sheet and comes back through `kineo://sso-callback` (`src/app/sso-callback.tsx` only redirects Home, for Android). A new account that still needs the agreement gets "One more step", or finishes straight away when the box on Create an account is already ticked. Google's first and last name go into Your profile as the full name.
- **Activate the session after each step.** A finished sign-in doesn't always carry `createdSessionId`; make `signIn.createdSessionId ?? client.sessions[0].id` active with `setActive`, as desktop's `activate()` does. Without the fallback the code sign-in succeeds but the app stays signed out (seen in the spike).
- **Session storage:** `ClerkProvider`'s `tokenCache`, backed by `expo-secure-store` (Keychain on iOS, Keystore-encrypted storage on Android). Use our own small cache with `keychainAccessible: AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`, not Clerk's built-in `@clerk/expo/token-cache`, which uses `AFTER_FIRST_UNLOCK` and so lets the session move to another phone through an encrypted backup. Never AsyncStorage.
- **Tokens:** `getToken()` for PostgREST and `getToken({ template: "powersync" })` for PowerSync, as on desktop (checked: audience `getkineo-sync`, subject is the Clerk user ID).
- **Privacy:** `telemetry={false}` on `ClerkProvider`. The key is `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` in `apps/mobile/.env.local` (git-ignored); never the secret key.
- **Offline start (M16):** `ClerkProvider`'s `__experimental_resourceCache` keeps Clerk's last-known client and settings, so the app starts signed in without a connection. It uses our own storage (`src/auth/secure-storage.ts`: `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`, values split into 1000-character pieces), not `@clerk/expo/resource-cache`, which uses `AFTER_FIRST_UNLOCK`. Experimental in Clerk: recheck when upgrading `@clerk/expo`. Each practitioner gets their own database file, `kineo-<Clerk user ID>.db`.
- Checked on the iOS simulator (development build): email code signs in, the session token and `powersync` token come back, sign-out works, and the session survives quitting and reopening the app. The password call works (Clerk answered), but refused the test account's password as found in a data breach (`form_password_pwned`, the leaked-password check), so a successful password sign-in on the phone is still to be seen in M16 with a different password. Android not run yet (same SDK; check in M16).

### Clerk dashboard settings (sign-in, sign-up and Google)

Both apps rely on these; set them on each Clerk instance (development and production):

- **Native applications:** Native API on (Configure → Native applications). Add `kineo://sso-callback` (phone) and `https://www.getkineo.work/signed-in/` (desktop, which forwards to `kineo://sso-callback`) to the allowed redirect URLs, so Clerk returns the `rotating_token_nonce` there after Google.
- **Email:** email address required, verified by **email verification code**. Sign-in by email code and by **password**; at sign-up, a password is **optional** (not required), since the apps don't ask for one there. Leaked-password protection on.
- **Sign-up:** sign-ups allowed (open to anyone). No other required fields (name, username, phone): the apps collect only the email and the agreement, and show "Your account couldn't be finished…" if Clerk asks for more.
- **Legal consent:** on (Configure → Legal), with the Terms (`https://getkineo.work/terms/`) and Privacy policy (`https://getkineo.work/privacy/`). The apps send `legalAccepted: true` only after the box is ticked.
- **Google:** on (Configure → SSO connections → Google). The development instance can use Clerk's shared credentials; production needs **custom credentials**: a Google Cloud OAuth client of type _Web application_, with Clerk's **Authorized redirect URI** (shown on that page) added in Google Cloud, scopes `email` and `profile` only.
- **Supabase integration** and the **`powersync` JWT template**, as in `infra/README.md`.

## Backend (phase 1: owner's server machine)

- Self-hosted Supabase in Docker: Postgres, PostgREST API, Storage (logos, PDFs). Supabase Auth is not used for login.
- Self-hosted PowerSync service. A table the apps need offline must be added to the `powersync` publication (`ALTER PUBLICATION powersync ADD TABLE …`, in a migration) and to `infra/powersync/sync-config.yaml`, keyed on `owner_id` like the others.
- Caddy reverse proxy with automatic HTTPS on the project domain (e.g. `api.<domain>`).
  - Publish only: REST API, Storage, PowerSync.
  - Never publish: Studio dashboard, Postgres port 5432, the service role key.
  - Rate limiting; DNS challenge preferred so port 80 stays closed.
  - Router forwards 443 only; ISP must allow inbound connections (no CGNAT).
- Server hardening: disk encryption, updates, separate network segment if possible, admin access over Tailscale or locally only.
- Backups: automatic encrypted Postgres dumps to an external drive plus an encrypted offsite copy in Canada.

## Development workflow

- Local Claude Code sessions in the repo; the owner does all commits, branches and pushes.
- `.claude/settings.json` blocks git write commands and runs a type-check after edits; `CLAUDE.md` holds the working agreement.
- Shared task list in `docs/tasks.md`, hour-sized tasks.
- `pnpm check` (type-check, lint, tests) runs locally and in CI.

### Phone builds (EAS)

- The phone app is the expo.dev project `kineo` (owner `marcuscmfan2`; ID in `apps/mobile/app.json`). Run `eas` commands from `apps/mobile`; the GitHub connection's base directory is `apps/mobile`.
- `apps/mobile/eas.json` profiles: `development` (development client, iOS simulator), `development-device` (development client on a registered phone), `preview` (internal distribution for testers), `production` (store). All pin Node 24.11.1 and pnpm 12.18.0, and use EAS environment variables of the same name. Build numbers are kept on expo.dev (`appVersionSource: remote`), and `production` raises them itself.
- `expo-dev-client` is only in development builds. `ios.config.usesNonExemptEncryption: false` (HTTPS only) skips App Store Connect's export compliance question.
- Environment variables live on expo.dev per environment, as **Sensitive**: only `EXPO_PUBLIC_` values, which end up in the app anyway (now `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`; production needs a production Clerk instance's `pk_live_` key). Never Clerk's secret key, the Supabase service role key or database passwords. Local runs keep using `apps/mobile/.env.local`.
- Not set up yet: EAS Update (add with a runtime version policy once there are releases), and Android signing and Play Console (EAS makes the keystore on the first Android build).

## Data

- Beta: made-up patient data only. Real patient data requires BC PIPA safeguards and College record-keeping compliance (confirm before use).

### Desktop local database (decided in D2, Nov 2026)

The desktop app uses **PowerSync's Tauri SDK**: `tauri-plugin-powersync` (Rust) with `@powersync/tauri-plugin` (JavaScript), pinned to exact versions (0.2.0, 0.0.6, `powersync` 0.1.1, `@powersync/common` 2.0.0) because it's alpha.

- **Why not the web SDK:** it keeps SQLite in webview storage (OPFS/IndexedDB), which PowerSync says doesn't reliably survive Tauri app updates. Unsynced notes could be lost.
- **Storage:** an ordinary SQLite file in the app's data folder (`~/Library/Application Support/tech.fenna.kineo` on macOS), which the app creates at startup. Survives restarts and updates.
- **Sync runs in Rust,** shared by all windows. Connecting is only possible from Rust, and **the connector must be written in Rust** (`fetch_credentials`, `upload_data`): JavaScript connectors aren't supported yet. The page passes the database's `rustHandle` and the Clerk `powersync` token to a Rust command. So D6's connector lives in `src-tauri`, not `packages/data`; the phone app gets its own TypeScript connector. Business rules stay shared, and the server enforces the locks.
- **JavaScript API** is PowerSync's common one (`Schema`, `Table`, `column`, `db.getAll`, `db.watch`, `db.writeTransaction`), so `packages/data` (schema and queries) can be shared with the phone app. With PowerSync's views, `rowsAffected` can be 0 on a successful UPDATE/DELETE: use `RETURNING id` instead.
- **Offline first:** the app must open local data without waiting for Clerk, which can't load offline. D3/D8 restore the signed-in state from the keychain (D5) and only need Clerk online for signing in and fresh tokens.
- **Where things live (D4):** the schema for all eight tables and the row types are in `@kineo/data` (shared with the phone app; a test checks them against the migrations). Each app opens its own PowerSync database with that schema: desktop in `apps/desktop/src/data/database.ts` (`kineo.db`), with `AppSchema`; the phone builds its own with `buildAppSchema` (see Phone local database).
- **The connector (D6)** is in `src-tauri/src/sync/`. Rust asks the page for Clerk tokens (`kineo://token-request` event, answered with `sync_token_reply`): the `powersync` template for PowerSync, the session token for PostgREST. Each local change becomes one PostgREST request (PUT as an upsert, PATCH for the changed columns, DELETE), with booleans turned back from 0/1 using `BOOLEAN_COLUMNS` from `@kineo/data`. A 401, timeout, rate limit, server error or network failure is retried later. Any other refusal (e.g. a locked invoice) drops that change, tells the page (`kineo://upload-rejected`, shown as an error toast), and PowerSync restores the server's copy. Server addresses are fixed in Rust, so tokens only go to Kineō's servers.
- **Logos (D11)** live in Storage's private `logos` bucket, one folder per practitioner (their Clerk user ID), with row-level security on `storage.objects` limiting each to their own folder (PNG, JPEG or SVG, up to 1 MB). The invoice style stores the logo's path; each upload gets a new file name. The desktop app uploads, reads and deletes logos through Rust (`src-tauri/src/logos.rs`, address fixed in Rust, session token from the token bridge) and keeps a copy of each in the app's data folder, so invoices show it offline; Sign out deletes the copies. Storage creates its own tables on first start, so `infra/setup.sh` starts it before applying migrations.
- **Phone logos and invoice fonts (M17a):** the phone downloads a logo from Storage with the session token (`apps/mobile/src/invoice/logo.ts`, address fixed there), keeps a copy in `Documents/logos/`, and puts it in the invoice as a `data:` URI, since iOS can't print local image files. The invoice fonts are embedded the same way: Fontsource's woff2 files as base64 in `src/invoice/fonts.generated.ts` (about 280 KB; regenerate with `pnpm --filter @kineo/mobile invoice-fonts`). Both apps build the `@font-face` rules with `invoiceFontFaceCss`.
- **Android syncs over WebSockets (M19):** on Android, PowerSync's default HTTP streaming (via `expo/fetch`) never connected and reported no error, at least in the development build. The app passes `connectionMethod: SyncStreamConnectionMethod.WEB_SOCKET` on Android; iOS keeps HTTP. Recheck on PowerSync upgrades and in a release build.
- **The phone's connector (M17)** is TypeScript, in `apps/mobile/src/sync/`, and follows the desktop rules above line for line: one PostgREST request per change, booleans restored with `BOOLEAN_COLUMNS`, a new invoice and its visits as one `create_invoice` call, 401/408/429/5xx and network failures retried (PowerSync calls `uploadData` again), any other refusal dropped and shown as an error toast via `uploadRejectionMessage`. Tokens come from Clerk's `getToken` (`template: "powersync"` for PowerSync). Server addresses are fixed in `connector.ts`.
- **New invoices (E3)** upload as one call to the `create_invoice` database function (`supabase/migrations/…_create_invoice.sql`), with the visits put on them in the same transaction: saved together or not at all, and a number another device already used is replaced with the next free one. The apps watch PowerSync's upload queue (`ps_crud`) and don't let a new invoice be sent until it has uploaded. A phone connector must do the same.
- **Needs Rust 1.96 or newer** (`powersync_core`).
- Checked in the Tauri window on macOS: local rows survive a restart; signed in and synced from `sync.getkineo.work` with the `powersync` token (`aud` `getkineo-sync`); reopened offline with data intact.

### Phone local database (decided in M8, Nov 2026)

The phone app uses **PowerSync's React Native SDK with op-sqlite**, from PowerSync's in-development release, pinned exactly: `@powersync/react-native` `0.0.0-dev-20261020125654` and `@op-engineering/op-sqlite` `18.2.5`. Move to the stable release when PowerSync ships one for React Native 0.88, and recheck sync and offline opening on every upgrade.

- **Why the dev release:** Expo SDK 58 is React Native 0.88, which has only the new architecture (the old bridge, `RCTCxxBridge`, was removed in 0.87). Both drivers the stable SDK (1.35) supports use that bridge and don't compile: `@journeyapps/react-native-quick-sqlite` 2.5 and op-sqlite 15 (the newest `@powersync/op-sqlite` accepts). PowerSync's dev SDK drops quick-sqlite and uses op-sqlite 17–18, which supports bridgeless React Native. Downgrading Expo instead would have redone the phone shell.
- **Not encrypted,** as on desktop: the phone's own storage encryption protects it (iOS data protection, Android file-based encryption). op-sqlite can add SQLCipher later if that changes.
- **Two PowerSync versions, one `@kineo/data`.** Desktop's Tauri SDK needs `@powersync/common` 2.0.0 (and `@kineo/data` keeps its own 2.0.0); the phone's SDK brings its own `common`. `@kineo/data` doesn't depend on either version's types:
  - The schema is plain data (`TABLE_DEFINITIONS`), and each app builds it with its own PowerSync: `buildAppSchema<ColumnType, Table, Schema>({ column, Table, Schema })` (give the three types; TypeScript can't infer them through PowerSync's generic `Table`). `AppSchema` is the 2.0 build desktop uses. Both versions turn it into identical schema JSON (checked). Row types come from the definitions, not from PowerSync.
  - The database is described by the four methods `@kineo/data` calls (`watchWithCallback`, `writeTransaction`, and the transaction's `execute` and `getOptional`, in `src/database.ts`), which both versions have.
  - Query rows are read with `rowsOf(result)`, from `rows._array`, which both versions have. Don't use 2.0's `result.array`: the 1.x `common` doesn't have it, and the phone would silently read no rows.
- Checked on the iOS simulator (development build, never connected to a server): the database opens with the phone-built schema; `PracticeWriter.addPatient` writes and queues the change in `ps_crud`; `watchPracticeData` shows it live; the rows are still there after quitting and reopening the app. Built for Android in M9: the database opens on the Pixel emulator and Home reads it.

### Phone invoice preview and PDF (decided in M14, Nov 2026)

- **Preview:** the HTML from `@kineo/invoice-template`, shown in `react-native-webview` with scripts off. The phone lays it out at a letter page's width (816 CSS px) and scales it to the screen, so the preview looks like the PDF (`previewHtml` in `apps/mobile/src/utils/invoice-preview.ts`).
- **PDF:** `expo-print` makes it from the same HTML, unchanged. iOS ignores the template's `@page` margin, so the same 0.6 in is passed as `margins`; Android reads `@page`.
- **Sharing:** one "Share PDF" button opens the system share sheet (`expo-sharing`): save to Files, Mail, Messages, print. The file is named after the invoice ("Invoice INV-0004.pdf", with `expo-file-system`) and lives in the app's cache; a newer PDF of the same invoice replaces it. `expo-sharing`'s config plugin is only for receiving shares and isn't used.
- **Not yet:** the logo and embedded fonts (M17a). A draft can't be sent or shared until it has reached the server, which on the phone needs the connector (M17).

## Phase 2

- Move the database to hosted Supabase in the Canada region; Clerk stays. Mostly a config change plus a database migration.
