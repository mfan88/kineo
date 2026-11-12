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
  packages/config/            shared tsconfig, eslint, prettier
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
- **Sign-in methods:** email code and email + password. No social sign-in for now. Keep Clerk's leaked-password check on.
- **Session storage (D5):** the client token is kept in the OS keychain (`keyring` crate 4.2: macOS Keychain, Windows Credential Manager, Linux Secret Service) through three app commands in `src-tauri/src/session_store.rs` that can only read, replace or clear one entry (`tech.fenna.kineo` / `clerk-client-token`). It's read once before Clerk's first request and saved whenever Clerk returns a new one. Checked on macOS: still signed in after a restart.
- **Privacy:** pass `telemetry={false}` to `ClerkProvider`. Clerk also loads a bot-protection script from `*.protect.clerk.com`; the Content-Security-Policy must allow it.
- Checked in the Tauri window on macOS: both methods sign in and sign out.

## Backend (phase 1: owner's server machine)

- Self-hosted Supabase in Docker: Postgres, PostgREST API, Storage (logos, PDFs). Supabase Auth is not used for login.
- Self-hosted PowerSync service.
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

## Data

- Beta: made-up patient data only. Real patient data requires BC PIPA safeguards and College record-keeping compliance (confirm before use).

### Desktop local database (decided in D2, Nov 2026)

The desktop app uses **PowerSync's Tauri SDK**: `tauri-plugin-powersync` (Rust) with `@powersync/tauri-plugin` (JavaScript), pinned to exact versions (0.2.0, 0.0.6, `powersync` 0.1.1, `@powersync/common` 2.0.0) because it's alpha.

- **Why not the web SDK:** it keeps SQLite in webview storage (OPFS/IndexedDB), which PowerSync says doesn't reliably survive Tauri app updates. Unsynced notes could be lost.
- **Storage:** an ordinary SQLite file in the app's data folder (`~/Library/Application Support/tech.fenna.kineo` on macOS), which the app creates at startup. Survives restarts and updates.
- **Sync runs in Rust,** shared by all windows. Connecting is only possible from Rust, and **the connector must be written in Rust** (`fetch_credentials`, `upload_data`): JavaScript connectors aren't supported yet. The page passes the database's `rustHandle` and the Clerk `powersync` token to a Rust command. So D6's connector lives in `src-tauri`, not `packages/data`; the phone app gets its own TypeScript connector. Business rules stay shared, and the server enforces the locks.
- **JavaScript API** is PowerSync's common one (`Schema`, `Table`, `column`, `db.getAll`, `db.watch`, `db.writeTransaction`), so `packages/data` (schema and queries) can be shared with the phone app. With PowerSync's views, `rowsAffected` can be 0 on a successful UPDATE/DELETE: use `RETURNING id` instead.
- **Offline first:** the app must open local data without waiting for Clerk, which can't load offline. D3/D8 restore the signed-in state from the keychain (D5) and only need Clerk online for signing in and fresh tokens.
- **Where things live (D4):** the schema for all eight tables and the row types are in `@kineo/data` (shared with the phone app; a test checks them against the migrations). Each app opens its own PowerSync database with that schema: desktop in `apps/desktop/src/data/database.ts` (`kineo.db`).
- **The connector (D6)** is in `src-tauri/src/sync/`. Rust asks the page for Clerk tokens (`kineo://token-request` event, answered with `sync_token_reply`): the `powersync` template for PowerSync, the session token for PostgREST. Each local change becomes one PostgREST request (PUT as an upsert, PATCH for the changed columns, DELETE), with booleans turned back from 0/1 using `BOOLEAN_COLUMNS` from `@kineo/data`. A 401, timeout, rate limit, server error or network failure is retried later. Any other refusal (e.g. a locked invoice) drops that change, tells the page (`kineo://upload-rejected`, shown as an error toast), and PowerSync restores the server's copy. Server addresses are fixed in Rust, so tokens only go to Kineō's servers.
- **Needs Rust 1.96 or newer** (`powersync_core`).
- Checked in the Tauri window on macOS: local rows survive a restart; signed in and synced from `sync.getkineo.work` with the `powersync` token (`aud` `getkineo-sync`); reopened offline with data intact.

## Phase 2

- Move the database to hosted Supabase in the Canada region; Clerk stays. Mostly a config change plus a database migration.
