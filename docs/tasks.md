# Kineō tasks

Shared checklist for building Kineō. Each task should take about an hour.
Work top to bottom unless told otherwise. Tick a task (`[x]`) only when it meets the definition of done in `CLAUDE.md`.
Add follow-ups you discover to **Discovered** at the bottom rather than doing them unasked.

## Phase 1A: foundation

- [x] Root workspace: pnpm, Turborepo, root `package.json`, `.gitignore`, `.npmrc`
- [x] `packages/config`: `tsconfig.base.json` (strict mode), shared Prettier config, `package.json` as `@kineo/config`
- [x] `packages/shared` setup: `package.json` as `@kineo/shared` (exports point at `src/index.ts`, no build step), Zod, Vitest, `typecheck` / `lint` / `test` scripts
- [x] Root lint setup: Oxlint with `oxlint-tsgolint@7`, one `.oxlintrc.json` at the root, `lint` script (`oxlint --type-aware`) in every package

## Phase 1B: core logic (`packages/shared`)

- [ ] Money helpers: integer cents, add, multiply by quantity, apply tax (rounding rule decided and tested), format as CAD
- [ ] Types and Zod schemas: Patient, Visit, PriceItem, LineItem, Invoice, Profile, InvoiceStyle
- [ ] Invoice totals: subtotal, tax, total from line items + price list, with tests
- [ ] Invoice status rules: draft → sent → paid, undo paid → sent, what is locked in each state, with tests
- [ ] Visits on invoices: a visit belongs to at most one invoice; add/remove only while draft, with tests
- [ ] Note rules: add to note (append), replace note, edit timestamp, locked when its invoice is paid, with tests
- [ ] Profile rules: fields marked "show on invoice" are required, with tests
- [ ] Home grouping: Ready to invoice / Not sent yet / Waiting on payment from visits and invoices, with tests

## Phase 1C: database (`supabase/`)

- [ ] `supabase init`; enable Clerk third-party auth in `config.toml`
- [ ] Migration: tables for profiles, patients, visits, price_items, invoices, invoice_lines, invoice_visits, invoice_styles
- [ ] Migration: row-level security on every table, keyed on the Clerk user ID
- [ ] RLS tests: user A can never read or change user B's data
- [ ] `seed.sql` with made-up test data only

## Phase 1D: desktop app shell (`apps/desktop`)

- [ ] `pnpm create tauri-app desktop` (React, TypeScript, Vite, pnpm); rename package to `@kineo/desktop`; productName "Kineo", window title "Kineō"
- [ ] `packages/tokens` and HeroUI theme with the sky palette and Inter
- [ ] Navigation: Home with settings icon, back arrow on every other screen, no top bar or sidebar
- [ ] Home screen on fake data from `@kineo/shared` (no database yet)

## Later (not yet broken down)

- `packages/data`: PowerSync + local SQLite, connected to the server
- Clerk sign-in on desktop
- Patient, invoice, settings, profile and invoice style screens on desktop
- `apps/mobile` with Expo and the same screens
- `packages/invoice-template` and PDF export
- Server setup: self-hosted Supabase, PowerSync, Caddy, backups (`infra/`)

## Discovered

<!-- Add follow-ups here as they come up -->
- Root `pnpm format:check` should be run once over the whole repo now that the shared Prettier config is active (existing files may need reformatting).
- Drop `--passWithNoTests` from `@kineo/shared` `test` once the money helpers add the first tests.
- `@kineo/shared` `src/index.ts` is `export {}` until the money helpers land, which gives one Oxlint warning (`unicorn/require-module-specifiers`); it goes away with the first real export.
- `docs/tech-stack.md` still lists "eslint" under `packages/config`; update it to Oxlint (config lives in the root `.oxlintrc.json`).
- Fill in the `Lint` command in `CLAUDE.md` Commands (`pnpm lint`) along with the other placeholders.
