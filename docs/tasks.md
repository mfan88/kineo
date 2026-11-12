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
- [x] Caddy snippet: `infra/caddy/kineo.caddy`, a drop-in for `/etc/caddy/sites.d/` (standard directives only) with `api.getkineo.work` (`/rest/v1/*` → PostgREST, `/storage/v1/*` → Storage) and `sync.getkineo.work` (`/sync/*`, `/write-checkpoint*` → PowerSync); everything else 404; no Authelia (machine APIs checked by Clerk tokens); security headers, body limits (1 MB, 10 MB for Storage), token-free access log (to Caddy's journal, no log file); validated, route-tested and reload-tested as a non-root user on Caddy 2.11
- [x] Setup script: `infra/setup.sh` (safe to re-run): checks tools and that the 127.0.0.1 ports are free; creates `infra/kineo.env` (chmod 600), asks for the four values you set, generates every secret (HS256 anon/service keys included) and rebuilds `JWT_JWKS` from Clerk's keys each run; refuses to generate a new database password when a Kineō database volume already exists; starts the database, applies `supabase/migrations` once each (checksums in `kineo_meta.applied_migrations`, edited migrations refused), optional `--seed`, then starts the rest; never prints a secret
- [x] systemd: `infra/systemd/kineo.service` (starts the stack after Docker on boot, stops it cleanly; verified with `systemd-analyze`) installed by `infra/systemd/install.sh` (root; `setup.sh` runs it when run with sudo, otherwise prints the command); `infra/update.sh` (fast-forward pull, image pull, `setup.sh`, PowerSync restart when its config changed, Caddy/systemd reminders, status); `infra/status.sh` health check (containers, local endpoints, migrations, `--public` for the Caddy URLs; exit 1 on any problem)
- [x] Backups: `infra/backup/backup.sh` (three `age`-encrypted parts per run: `public` + `kineo_meta` schemas, Storage records, uploaded files; streamed, never plaintext on disk; keeps the newest `BACKUP_KEEP`) with `kineo-backup.service` + nightly `kineo-backup.timer` (enabled by `install.sh` once `BACKUP_AGE_RECIPIENT` and `BACKUP_DIR` are set); `infra/backup/restore.sh` checks every part first, then restores in one transaction as a temporary role so grants match exactly; tested end to end (backup of one stack restored into a fresh one; a damaged backup changes nothing)
- [x] `infra/README.md`: first-time setup (DNS records for `api` and `sync`, clone, `setup.sh`, linking the Caddy drop-in into `/etc/caddy/sites.d/`, Clerk settings), day-to-day (status, logs, update, restore), and what's deliberately not exposed
- [x] Data on the SSD: `KINEO_DATA_DIR` (default `/mnt/nvme/kineo`) holds the `db/`, `db-config/` and `storage/` folders behind the three volumes; `setup.sh` refuses the system disk, `kineo.service` and the backup service wait for the mount (`RequiresMountsFor`), and a missing folder stops the database instead of starting it empty

## Phase 2: desktop sign-in and sync (`apps/desktop`, `packages/data`)

Connects the desktop app to the server: Clerk sign-in, then the device's own SQLite database synced through PowerSync, replacing the demo store. Steps marked **(decision)** start by asking before anything is built; new dependencies need an OK as usual. Both spikes come first because their answers can change the later steps.

- [x] **D1. Clerk in Tauri (spike, decision):** check whether `@clerk/clerk-react` works inside the Tauri window (it isn't served from a normal web origin, which can break Clerk's cookie sessions). Outcome: a short note in `docs/tech-stack.md` choosing Clerk's prebuilt components or a custom sign-in on Clerk's lower-level API, and which sign-in methods to offer (email code, password, Google, …). Throwaway code is removed afterwards.
- [x] **D2. PowerSync in Tauri (spike, decision):** compare PowerSync's web SDK (SQLite in the webview, OPFS/IndexedDB) with a native SQLite plugin for Tauri: offline persistence, size, and whether it survives app restarts and updates. Outcome: a note in `docs/tech-stack.md` choosing one. Throwaway code is removed afterwards.
- [x] **D3. Sign-in screen:** Clerk wired into `apps/desktop` per D1, with a calm sign-in screen in the app's style; nothing else shows until signed in; the Clerk publishable key comes from an env file (never committed). Tests for the signed-out and signed-in states.
- [x] **D4. `packages/data` and the local schema:** create the package (`@kineo/data`), the PowerSync client per D2, and table definitions mirroring the eight server tables (column names and types match the migrations; a test checks they stay in step).
- [x] **D5. Secure session storage (decision on the plugin):** keep Clerk's session in the OS keychain via a Tauri plugin rather than webview storage, as `CLAUDE.md` requires; the app stays signed in across restarts.
- [x] **D6. The connector:** `fetchCredentials` gets a token from Clerk's `powersync` JWT template; `uploadData` sends local changes to PostgREST (`api.getkineo.work/rest/v1`) with the session token and handles rejected writes (e.g. a sent invoice) by surfacing an error rather than retrying forever. Tests with a fake server.
- [x] **D7. Reading data:** typed, live-updating queries in `@kineo/data` for every screen (patients, visits, invoices with lines and totals, profile, settings, price list, style), returning the same shapes as the demo store so screens change little.
- [x] **D8. Sign-out and session expiry:** sign-out disconnects PowerSync and clears the local database and keychain entry, so the next person on the computer sees nothing; an expired session returns to sign-in without losing unsynced changes (they upload after signing back in as the same user).
- [x] **D9. Writing data: patients and notes:** add patient, save visit, add to / replace note, through `@kineo/shared` rules, writing to the local database.
- [x] **D10. Writing data: invoices:** create invoice, visits on and off, line items, tax, send, record and undo payment.
- [x] **D11. Writing data: settings:** profile, price list, tax and prefix, invoice style, and logo upload to Storage (replacing the data-URL logo).
- [x] **D12. Switch the screens over:** every screen reads and writes through `@kineo/data` instead of `DemoStore`; loading skeletons where data isn't ready yet; the demo store stays only for tests.
- [ ] **D13. End-to-end check against the server:** signed-in sync with the real Clerk template, offline edits syncing later, the same account on two devices, row-level security blocking another user, and the server's RLS/locks rejecting a bad write cleanly. Fix what it finds; record results in the task.

## Later (not yet broken down)

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
- D3: turn Clerk telemetry off (`telemetry={false}` on `ClerkProvider`); it's on by default and sends events to `clerk-telemetry.com`.
- CSP: also allow Clerk's bot-protection script and probes (`*.protect.clerk.com`) and Clerk's Frontend API domain.
- D6: confirm the Clerk session token carries `role: "authenticated"` (from the Supabase integration); PostgREST and Storage need it. Not checked during D1.
- Production Clerk instance: add its Frontend API domain to `ALLOWED_HOST_SUFFIXES` in `apps/desktop/src-tauri/src/clerk_http.rs`.
- Clerk's request hooks are `__internal_onBeforeRequest` / `__internal_onAfterResponse` (renamed from `__unstable__` in clerk-js 6); they can change without notice, so pin `@clerk/clerk-js` and recheck sign-in on every Clerk upgrade.
- `pnpm check` doesn't run the Rust tests or clippy; add `cargo test` and `cargo clippy` for `apps/desktop/src-tauri` to CI.
- D6 is now Rust: the PowerSync connector (`fetch_credentials` via the page's Clerk `powersync` token, `upload_data` to PostgREST) lives in `apps/desktop/src-tauri`, because the Tauri SDK only connects from Rust. Update D6's wording when starting it.
- D3/D8: open the local database without waiting for Clerk (it can't load offline); restore the signed-in state from the keychain (D5).
- D4: move `@powersync/common` from `apps/desktop` to `packages/data` when the package is created; `apps/desktop` keeps `@powersync/tauri-plugin`. The `powersync` and `async-trait` crates are installed for D6 and unused until then.
- PowerSync's Tauri SDK is alpha: pin exact versions and recheck sync and offline opening on every upgrade.
- The D2 spike left `kineo-spike.db` in `~/Library/Application Support/tech.fenna.kineo`; it can be deleted.
- Document in `CLAUDE.md` Commands: the desktop app needs Rust 1.96+ (`rustup update stable`).
- D3 needs `apps/desktop/.env.local` with `VITE_CLERK_PUBLISHABLE_KEY` to start (see `apps/desktop/README.md`); my permissions block writing `.env*` files, so create it by hand. Also add a blank `apps/desktop/.env.example`.
- The sign-in screen waits for Clerk, so the app can't open offline yet. D5 (keychain session) and D8 should let it open local data without Clerk, per the D2 note.
- No sign-out yet (D8). Until then, quitting the app signs out, because the session is held in memory (D5 keeps it).
- Sign-in screen: add a design-brief section for it (Kineō name above "Sign in", email code first, password as the alternative, inline errors).
- `createDatabase()` in `apps/desktop/src/data/database.ts` isn't called yet; D7 opens it once signed in (and D8 closes and clears it on sign-out).
- Local schema stores booleans as 0/1 and dates/times as ISO text; D7's queries convert them to the screens' shapes (booleans, cents as numbers).
- D8: sign-out must call `keychainTokenStore.clear()` (the `session_token_clear` command exists but nothing calls it yet), so the next person on the computer isn't signed in.
- A release build signed with a different identity may ask for keychain access again; check when packaging the app.
- D7: call `startSync(db, getToken)` (`apps/desktop/src/data/sync.ts`) once signed in; nothing calls it yet.
- Uploads aren't atomic across a transaction: each change is its own PostgREST request, so if the server refuses the second change of a transaction, the first stays saved. Fine for single-row writes; if D9–D11 write several rows together (e.g. an invoice with its lines), consider a Postgres function that applies them in one transaction.
- The sync and API addresses are fixed in `src-tauri/src/sync/mod.rs` (`SYNC_URL`, `API_URL`); a local or staging server would need a build-time setting.
- D12: the screens switch from `useDemoState()` to `watchPracticeData(db, userId, …)` (`@kineo/data`), which gives the same shape (`PracticeData` = `DemoState`); the desktop app opens the database (`createDatabase()`), calls `startSync`, and shows loading skeletons until the first `onData`. Invoice totals stay computed on screen with `invoiceTotals` from `@kineo/shared`.
- `watchPracticeData` rebuilds all the data on every change to any table. Fine for a solo practice's data size; if it ever feels slow, watch per screen instead.
- Rows that can't be read are left out and reported through `onError` (table name only). D12 should log those to the console without row contents, or show a quiet notice.
- Design brief: record that Sign out sits at the bottom of Settings ("Signed in as …"), and the unsynced-changes dialog ("Stay signed in" / "Sign out anyway").
- If a different person signs in, the previous person's unsynced changes are cleared without a warning (their data can't be uploaded under someone else's account). Rare on a solo practitioner's computer; revisit if clinics share machines.
- The unsynced-changes warning is only covered by tests until D9 makes the app write data; check it by hand then (offline, change something, Sign out).
- The app now opens the local database and syncs after sign-in, though screens still read demo data until D12.
- D12: the screens call `PracticeWriter` (`@kineo/data`) instead of `DemoStore` for patients and notes; its methods are async and throw `WriteError` (safe to show) or the shared `NoteRuleError`, like the demo store's `StoreError`.
- `DemoStore` and `PracticeWriter` now hold the same patient and note rules twice (validation messages, empty-note checks). D12 should make the demo store a thin wrapper over the writer, or drop it outside tests, so the rules live in one place.
- `@kineo/data` tests use Node's built-in `node:sqlite`, which prints an "experimental" warning in test output; harmless.
- Invoice numbers on two devices: each picks the next number from its own local copy, so two invoices created offline on desktop and phone could get the same number; the server's unique (owner, number) constraint then refuses the second, which is dropped with an error toast. Decide before the phone app writes invoices (e.g. renumber on conflict, or have the server assign numbers).
- Creating an invoice uploads as several requests (invoice, then each visit). If the server refuses a visit (e.g. it's on another device's invoice), the invoice stays without it; see the atomic-upload follow-up from D6.
- Server: apply the logo migration with `sudo infra/update.sh` (adds the `logos` bucket and its access rules), then `sudo infra/status.sh --public`.
- D12: the Invoice style screen uploads with `uploadLogo`, saves the returned path with `saveInvoiceStyle`, then deletes the old logo with `deleteLogo`; invoices show it with `logoDataUrl(path)` instead of the data URL in `logoPath`. Until then the demo store still stores a data URL.
- First save of profile, settings or style on two devices before either has synced creates two rows for the same practitioner; the server's unique owner constraint refuses the second (error toast, server copy restored). Rare; consider fixed row IDs per practitioner if it happens.
- Removing a price item doesn't clear `price_item_id` on copied lines locally; the server does it (on delete set null) and sync brings it back. Harmless, since lines keep their own name and price.
- Logo tests in Rust leave small folders under the system temp folder (`kineo-logos-test-*`); tidy them in the tests if they pile up.
- `DemoStore` still holds its own copy of the rules (used by screen tests through `DemoPracticeStore`). Consider running screen tests against `LiveStore` on an in-memory SQLite database instead, then deleting `DemoStore`.
- A logo chosen in Invoice style but never saved stays in Storage (the old one is deleted only when a new one is saved). Delete unsaved uploads when leaving the screen, if it matters.
- Download PDF may print before the logo has loaded on a slow first load; disable it until the logo is ready if that shows up.
- The app still can't open offline (Clerk must load first); see the D3/D8 follow-ups.
