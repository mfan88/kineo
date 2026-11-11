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

- [x] Money helpers: integer cents, add, multiply by quantity, apply tax (rounding rule decided and tested), format as CAD
- [x] Types and Zod schemas: Patient, Visit, PriceItem, LineItem, Invoice, Profile, InvoiceStyle
- [x] Invoice totals: subtotal, tax, total from line items + price list, with tests
- [x] Invoice status rules: draft → sent → paid, undo paid → sent, what is locked in each state, with tests
- [x] Visits on invoices: a visit belongs to at most one invoice; add/remove only while draft, with tests
- [x] Note rules: add to note (append), replace note, edit timestamp, locked when its invoice is paid, with tests
- [x] Profile rules: fields marked "show on invoice" are required, with tests
- [x] Home grouping: Ready to invoice / Not sent yet / Waiting on payment from visits and invoices, with tests

## Phase 1C: database (`supabase/`)

- [x] `supabase init`; enable Clerk third-party auth in `config.toml`
- [x] Migration: tables for profiles, practice_settings, patients, visits (with `invoice_id`), price_items, invoices, invoice_lines, invoice_styles
- [x] Migration: row-level security on every table, keyed on the Clerk user ID
- [x] RLS tests: user A can never read or change user B's data
- [x] `seed.sql` with made-up test data only

## Phase 1D: desktop app shell (`apps/desktop`)

- [x] `pnpm create tauri-app desktop` (React, TypeScript, Vite, pnpm); rename package to `@kineo/desktop`; productName "Kineo", window title "Kineō"
- [x] `packages/tokens` and HeroUI theme with the sky palette and Inter
- [x] Navigation: Home with settings icon, back arrow on every other screen, no top bar or sidebar
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

- `docs/tech-stack.md` still lists "eslint" under `packages/config`; update it to Oxlint (config lives in the root `.oxlintrc.json`).
- Fill in the `Lint` command in `CLAUDE.md` Commands (`pnpm lint`) along with the other placeholders.
- Record the money decisions in `CLAUDE.md` domain rules: tax rates are stored in basis points (5% = 500), and tax is worked out once on the invoice subtotal, rounded half up to the cent.
- Record in `CLAUDE.md` domain rules: line items copy name and price from the price list; invoice numbers are per-practitioner integers shown with an optional constant prefix.
- Record in `CLAUDE.md` domain rules: a sent invoice can never go back to draft; notes stay editable on a sent (unpaid) invoice and lock only once paid.
- Record in `CLAUDE.md` domain rules: an invoice is for one patient, so only that patient's visits can go on it.
- Add `supabase/.env.example` with blank `CLERK_DOMAIN=`, `SEED_OWNER_ID=` and `SEED_DATABASE_URL=` lines (my permissions block writing `.env*` files). `config.toml` reads `CLERK_DOMAIN`; `pnpm db:seed` reads the other two.
- Database triggers for the remaining locks: invoice_lines and tax fields editable only while the invoice is a draft, visit notes locked once the invoice is paid, and status changes limited to draft → sent → paid and paid → sent.
- `supabase start` needs a real `CLERK_DOMAIN` (it fetches the Clerk OpenID config), and Docker's `docker-credential-desktop` isn't on the shell PATH here, so image pulls fail without adding `/Applications/Docker.app/Contents/Resources/bin` to PATH.
- Fill in the `Tests` command in `CLAUDE.md` Commands: `pnpm check` for code, `pnpm test:db` for database (RLS) tests, which needs Docker.
- `pnpm db:seed` needs `psql`, which isn't installed on this Mac; run it on the server, or install the Postgres client (`brew install libpq`).
- Bundle identifier is `tech.fenna.kineo` (desktop now). Use the same ID for the Expo iOS app so both share one App Store Connect record (universal purchase); Android can use it as its package name too.
- Desktop window: still the default 800×600 and the default Tauri icons. Set a sensible size or minimum size, and replace the icons with Kineō's once there's a logo.
- CSP is `null` in `tauri.conf.json` (template default). Set a strict Content-Security-Policy before talking to Supabase or PowerSync (allow only the API origin).
- Update the palette in `CLAUDE.md` and `docs/design-brief.md` to match `@kineo/tokens`: primary buttons and links use `#0369A1` (hover `#075985`), `#0284C7` is for focus borders, the active tab and icons, and placeholders use `#67676F`. The brief's own colours failed 4.5:1 for button text, links and placeholders.
- HeroUI's full stylesheet is ~470 kB (44 kB gzipped). Fine for a desktop app; revisit if load time matters.
- `@kineo/desktop` has no component tests yet. Add Vitest + Testing Library (needs your OK for the dependencies) so navigation and later screens are checked by `pnpm check`, not only by hand.
