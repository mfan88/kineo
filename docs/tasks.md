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
- [x] Patient, part 1: name, condition, last visit summary; note box with typing, Save as today's visit, Copy last note, Clear; "Note saved" toast
- [x] Patient, part 2: visit list with status tags (not invoiced / draft / sent / paid), per-visit "Add to note" / "Replace note" (locked once paid), "Invoice N visit(s)" button that creates a draft invoice
- [x] Invoice editor: visit checkboxes, line items from the price list with quantity, tax toggle with the default rate, live totals; draft → "Preview and send", sent → "Record payment", paid → logged message; everything locked once sent
- [x] Invoice preview: the invoice as the patient sees it (profile fields shown on invoices, invoice style), Mark as sent with "Invoice sent" toast, error when there are no line items. Download PDF and Share come with `packages/invoice-template`
- [x] Record payment: "Marked paid" toast with Undo (paid → sent)
- [x] Invoices list: number, patient, total, status tag, newest first; Home's "See all" opens it
- [x] Settings screen with links to Your profile, Price list and tax, Invoice style
- [x] Profile: five fields each with "Show on invoice", inline errors from `profileErrors`, "Profile saved" toast
- [x] Price list and tax: list, add, edit and remove items (name + price), default tax rate, invoice number prefix
- [x] Wire Home: search results and recent patient chips open the patient; invoice rows open the invoice

## Phase 1F: invoice template and style (`packages/invoice-template`, `apps/desktop`)

- [x] `packages/invoice-template`: one HTML invoice (profile, patient, visits, lines, tax, totals, style, "Made with kineō") used by the desktop preview, plus Download PDF via the system print dialog
- [x] Invoice style in the demo store: `saveInvoiceStyle` validated with `invoiceStyleSchema`, with tests; turn the greyed-out Settings row into a link to `/settings/invoice-style`
- [x] Invoice style screen: accent colour (Sky, Forest, Ocean, Plum, Charcoal swatches), font (Clean, Serif, Nunito), header layout (logo left or centred), footer note with a 500-character limit; "Style saved" toast; desktop only
- [x] Live preview on the Invoice style screen: the invoice template beside the form, updating as you change options before saving (uses the latest invoice, or a made-up sample if there are none)
- [x] Logo upload: choose a PNG, JPEG or SVG up to 1 MB, preview it, remove it; inline errors for the wrong type or size; kept as a data URL in the demo store until `packages/data` and Supabase Storage exist
- [x] Bundle the Nunito font (`@fontsource-variable/nunito`) so the "Nunito" invoice font renders in the preview and PDF instead of falling back to system fonts

## Phase S: server (`infra/`)

Target: the ZimaBoard (Ubuntu LTS, headless) with Docker already running other containers, and Caddy 2.11 installed on the host with Authelia SSO. Kineō runs as its own Compose project (`kineo`), binds only to `127.0.0.1`, and never takes ports 80/443. `infra/caddy/kineo.caddy` is linked into `/etc/caddy/sites.d/` for `api.getkineo.work` (Supabase REST + Storage) and `sync.getkineo.work` (PowerSync), both direct (DNS → home IP). Setup is: clone the repo, run `infra/setup.sh`, link the Caddy drop-in and reload Caddy.

- [x] Compose stack: `infra/docker-compose.yml` (Postgres, PostgREST, Storage, postgres-meta, Studio; no Supabase Auth or gateway), pinned versions, project `kineo`, named volumes, healthchecks, `restart: unless-stopped`, ports on `127.0.0.1:55321–55324`; `infra/kineo.env.example` with every variable blank and explained; `infra/db/init/` sets role passwords and creates `auth.jwt()` (shared with `pnpm test:db`)
- [x] PowerSync: `journeyapps/powersync-service:1.28.2` on `127.0.0.1:55325`, bucket storage in a separate `powersync_storage` database on the same server, read-only `powersync_role`, the `powersync` publication (a migration listing the eight tables), Clerk JWKS auth with a required audience, and one sync stream returning only rows where `owner_id = auth.user_id()`
- [x] Caddy snippet: `infra/caddy/kineo.caddy`, a drop-in for `/etc/caddy/sites.d/` (standard directives only) with `api.getkineo.work` (`/rest/v1/*` → PostgREST, `/storage/v1/*` → Storage) and `sync.getkineo.work` (`/sync/*`, `/write-checkpoint*` → PowerSync); everything else 404; no Authelia (machine APIs checked by Clerk tokens); security headers, body limits (1 MB, 10 MB for Storage), token-free access log; validated and route-tested on Caddy 2.11
- [x] Setup script: `infra/setup.sh` (safe to re-run): checks tools and that the 127.0.0.1 ports are free; creates `infra/kineo.env` (chmod 600), asks for the four values you set, generates every secret (HS256 anon/service keys included) and rebuilds `JWT_JWKS` from Clerk's keys each run; refuses to generate a new database password when a Kineō database volume already exists; starts the database, applies `supabase/migrations` once each (checksums in `kineo_meta.applied_migrations`, edited migrations refused), optional `--seed`, then starts the rest; never prints a secret
- [x] systemd: `infra/systemd/kineo.service` (starts the stack after Docker on boot, stops it cleanly; verified with `systemd-analyze`) installed by `infra/systemd/install.sh` (root; `setup.sh` runs it when run with sudo, otherwise prints the command); `infra/update.sh` (fast-forward pull, image pull, `setup.sh`, PowerSync restart when its config changed, Caddy/systemd reminders, status); `infra/status.sh` health check (containers, local endpoints, migrations, `--public` for the Caddy URLs; exit 1 on any problem)
- [x] Backups: `infra/backup/backup.sh` (three `age`-encrypted parts per run: `public` + `kineo_meta` schemas, Storage records, uploaded files; streamed, never plaintext on disk; keeps the newest `BACKUP_KEEP`) with `kineo-backup.service` + nightly `kineo-backup.timer` (enabled by `install.sh` once `BACKUP_AGE_RECIPIENT` and `BACKUP_DIR` are set); `infra/backup/restore.sh` checks every part first, then restores in one transaction as a temporary role so grants match exactly; tested end to end (backup of one stack restored into a fresh one; a damaged backup changes nothing)
- [x] `infra/README.md`: first-time setup (DNS records for `api` and `sync`, clone, `setup.sh`, linking the Caddy drop-in into `/etc/caddy/sites.d/`, Clerk settings), day-to-day (status, logs, update, restore), and what's deliberately not exposed
- [x] Data on the SSD: `KINEO_DATA_DIR` (default `/mnt/nvme/kineo`) holds the `db/`, `db-config/` and `storage/` folders behind the three volumes; `setup.sh` refuses the system disk, `kineo.service` and the backup service wait for the mount (`RequiresMountsFor`), and a missing folder stops the database instead of starting it empty

## Later (not yet broken down)

- `packages/data`: PowerSync + local SQLite, connected to the server
- Clerk sign-in on desktop
- `apps/mobile` with Expo and the same screens

## Phase W: website tasks

- [x] **W1. Scaffold `apps/web`:** Astro (after the TypeScript 7 check described above), package `@kineo/web`, static output, scripts wired into Turborepo, Oxlint working, `pnpm check` passing. Add `apps/web/dist/` and `.astro/` to `.gitignore` if needed.
- [x] **W2. Brand assets:** add `apps/web/public/` assets built from the icon SVG in `docs/brand.md`: `favicon.svg`, a 32 px and 180 px PNG fallback (apple-touch-icon), and a 1200×630 social preview image (`og.png`) showing the lockup on the tint background. Self-host Sora and Inter.
- [x] **W3. Layout and styles:** base layout with header, footer, page metadata (title, description, Open Graph tags, canonical URL using a `[SITE URL]` placeholder in one config file), global CSS variables from the brand palette, a reusable wordmark component that draws the macron bar, and a skip-to-content link.
- [x] **W4. Home page:**
  - Hero on tint: lockup, the headline "Less paperwork, more patients.", one supporting line ("Simple notes and invoicing for physiotherapists."), and a primary "Download" button linking to `/download`.
  - "What it does" section: three short blocks (visit notes, invoicing, works offline) written from `docs/design-brief.md`.
  - "Built for solo physios in BC" section explaining who it's for.
  - "Your patients' privacy" section in plain language, linking to the privacy page. Only claims that are true per `docs/tech-stack.md`.
- [x] **W5. Download data:** one typed data file (`apps/web/src/data/downloads.ts`) listing each platform (iPhone, Android, Mac, Windows) with a name, a short requirement line, a link and a status of `available`, `beta` or `coming-soon`. Every link starts as a placeholder and every status as `coming-soon`. Add a small Vitest test that every entry has a valid status and that available entries have a real https link.
- [x] **W6. Download page:** one card per platform from the data file, with the platform name and requirement line. Cards with a link show a button; `coming-soon` cards show a calm "Coming soon" tag instead. Add a short "Join the beta" note with a `mailto:` link to `[CONTACT EMAIL]` (no forms).
- [x] **W7. Legal pages:** create `docs/legal/privacy.md` and `docs/legal/terms.md` with the headings below and `[TO BE WRITTEN]` under each, then render them at `/privacy` and `/terms` with a "Last updated" date taken from the file's front matter and the draft banner.
  - Privacy headings: Who we are · What we collect · Patient information · Where your data is stored · Who we share it with · How long we keep it · Your rights · Security · Children · Changes to this policy · Contact.
  - Terms headings: Agreement · The service · Your account · Your responsibilities · Patient data and professional obligations · Fees · Beta software · Intellectual property · Disclaimers · Limitation of liability · Ending your account · Changes · Governing law · Contact.
- [x] **W8. 404 page and final pass:** friendly 404 with a link home; check every page on a phone width and at desktop width, heading order, link text, contrast and keyboard focus; run a production build and confirm `dist/` contains only static files. Report Lighthouse scores if you can run it locally; otherwise list what you checked.

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
- HeroUI's full stylesheet is ~470 kB (44 kB gzipped). Fine for a desktop app; revisit if load time matters.
- Home: add a loading skeleton when data comes from `packages/data` (it's synchronous demo data for now, so there's nothing to load).
- Check contrast of HeroUI's soft "warning" (Draft) and "success" (Paid) chips; `@kineo/tokens` doesn't set warning or success colours yet, so they use HeroUI defaults that may be under 4.5:1.
- Record in `CLAUDE.md` domain rules: an invoice can't be sent while a profile field marked "show on invoice" is empty (the preview blocks Mark as sent and says which field).
- Website placeholders to fill before launch, all shown in red on the site: `[SITE URL]` and `[CONTACT EMAIL]` in `apps/web/src/site/config.ts`, and the store/download links in `apps/web/src/data/downloads.ts` (set each status as builds ship).
- Website legal text: `docs/legal/privacy.md` and `terms.md` have headings and `[TO BE WRITTEN]` only; change `status: draft` to remove the draft banner once reviewed. The privacy policy should mention Clerk (US-hosted, practitioner identity only) per `docs/tech-stack.md`.
- Website: run Lighthouse once a deploy target exists (not run locally; it would need downloading). `og.png` is regenerated with `pnpm --filter @kineo/web assets`, which needs Google Chrome (or `CHROME_PATH`). `vite preview` doesn't serve `404.html` for unknown paths; Cloudflare Pages and Netlify do.
- Download PDF uses `print()` on the invoice frame (the system dialog's "Save as PDF"). Verified in Chrome; not yet checked inside the Tauri window on macOS, where WKWebView's print support needs confirming (fallback: a Rust-side print or PDF command). "Share" from the brief isn't built yet.
- Logos with `packages/data`: upload the image to Supabase Storage (owner-only bucket policy), store its storage path in `invoice_styles.logo_path`, and pass a short-lived signed URL (or an inlined data URL for PDFs) as the template's `logoSrc`. Today the demo store keeps the image itself as a data URL in `logoPath`.
- Offsite backup copy (encrypted, Canada) once a provider is chosen; `infra/backup/backup.sh` writes local encrypted dumps only for now.
- Server env file is `infra/kineo.env` (template `infra/kineo.env.example`) rather than `infra/.env`, because Claude's permissions block writing `.env*` files. The old empty `infra/.env.example` can be deleted.
- Studio runs without Supabase's API gateway, so its table editor and SQL editor work but its Storage and API docs pages may not; use it over an SSH tunnel to `127.0.0.1:55323`.
- Clerk: create a JWT template for PowerSync whose `aud` equals `POWERSYNC_JWT_AUDIENCE`, keep its lifetime at 60 minutes or less, and use it in `packages/data` when fetching PowerSync credentials. A full signed-in sync test needs this, so it's checked when `packages/data` connects (only startup, replication and the "no token → 401" path were tested locally).
- New tables that the apps need offline must be added to the `powersync` publication (`ALTER PUBLICATION powersync ADD TABLE …`) and to `infra/powersync/sync-config.yaml`.
- No rate limiting at the edge: the ZimaBoard's Caddy has no rate-limit module. Brute force isn't possible on these hosts (no password endpoints; Clerk handles sign-in and rate-limits it), but a flood of bad-token requests would reach PostgREST/PowerSync. Revisit with fail2ban on the access log, or Cloudflare in front, if it ever matters.
- Back up `infra/kineo.env` somewhere safe (password manager or the encrypted offsite copy): without it the existing database can't be reached and `setup.sh` will refuse to continue. Cover this in the backup task and README.
- `setup.sh` restarts PostgREST and Storage when Clerk's key set changes (only on key rotation), a few seconds of API downtime.
- `infra/update.sh` is only lint-checked: its git pull can't be exercised here before the files are committed. Try it once on the ZimaBoard after the first push.
- Backups need `age` on the server (`sudo apt install age`) and an age key pair made on your own computer (`age-keygen -o kineo-backup.key`); the private key never goes on the server. Test a restore occasionally (e.g. onto a spare machine) so you know the key and backups work.
