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

## Phase 2

- Move the database to hosted Supabase in the Canada region; Clerk stays. Mostly a config change plus a database migration.
