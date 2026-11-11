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
- [x] Home screen on fake data from `@kineo/shared` (no database yet)

## Phase 1E: desktop screens on demo data (`apps/desktop`)

Screens use an in-memory demo store and the rules in `@kineo/shared`; `packages/data` replaces the store later. Each screen covers its empty, error and locked states, and toasts where the brief lists them.

- [x] Component tests: Vitest + Testing Library in `@kineo/desktop`, wired into `pnpm check`, with tests for the existing navigation and Home (needs OK for the new dev dependencies)
- [x] Demo store: in-memory React store seeded from `data/demo.ts`, with actions that go through `@kineo/shared` rules (add patient, save visit, add/replace note, create/edit invoice, send, record payment, undo), plus a toast host (HeroUI Toast)
- [x] New patient: full name (required), reason for visit (optional), "Patient added" toast, then opens the patient; reached from Home's "No patients match" with the name filled in
- [ ] Patient, part 1: name, condition, last visit summary; note box with typing, Save as today's visit, Copy last note, Clear; "Note saved" toast
- [ ] Patient, part 2: visit list with status tags (not invoiced / draft / sent / paid), per-visit "Add to note" / "Replace note" (locked once paid), "Invoice N visit(s)" button that creates a draft invoice
- [ ] Invoice editor: visit checkboxes, line items from the price list with quantity, tax toggle with the default rate, live totals; draft → "Preview and send", sent → "Record payment", paid → logged message; everything locked once sent
- [ ] Invoice preview: the invoice as the patient sees it (profile fields shown on invoices, invoice style), Mark as sent with "Invoice sent" toast, error when there are no line items. Download PDF and Share come with `packages/invoice-template`
- [ ] Record payment: "Marked paid" toast with Undo (paid → sent)
- [ ] Invoices list: number, patient, total, status tag, newest first; Home's "See all" opens it
- [ ] Settings screen with links to Your profile, Price list and tax, Invoice style
- [ ] Profile: five fields each with "Show on invoice", inline errors from `profileErrors`, "Profile saved" toast
- [ ] Price list and tax: list, add, edit and remove items (name + price), default tax rate, invoice number prefix
- [ ] Wire Home: search results and recent patient chips open the patient; invoice rows open the invoice

## Later (not yet broken down)

- `packages/data`: PowerSync + local SQLite, connected to the server
- Clerk sign-in on desktop
- Invoice style screen on desktop (logo, accent colour, font, header layout, footer note, live preview); needs `packages/invoice-template` for the preview
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
- Home: search results, recent patient chips and invoice rows aren't clickable yet, because the Patient and Invoice screens don't exist. Link them when those screens land, along with the "See all" link to the Invoices list and the "No patients match" → add patient option.
- Home: add a loading skeleton when data comes from `packages/data` (it's synchronous demo data for now, so there's nothing to load).
- New patient → Patient: after adding a patient the app goes to `/patients/:id`, which lands Home until the Patient screen's route exists. In "Patient, part 1", add the route and make the New patient test check the Patient screen opens.
