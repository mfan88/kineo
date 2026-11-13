# Kineō tasks

Shared checklist for building Kineō. Each task should take about an hour.
Work top to bottom unless told otherwise. Tick a task (`[x]`) only when it meets the definition of done in `CLAUDE.md`.
Add follow-ups you discover to **Discovered** at the bottom rather than doing them unasked.
A phase with its own file is linked from its heading here; its tasks count as part of this list.

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
- [x] **D13. End-to-end check against the server:** signed-in sync with the real Clerk template, offline edits syncing later, the same account on two devices, row-level security blocking another user, and the server's RLS/locks rejecting a bad write cleanly. Fix what it finds; record results in the task.
  - **Results** (Nov 2026, macOS, Tauri, against the ZimaBoard):
    - Signed-in sync with the real Clerk `powersync` template: works (D2, D12). The session token carries the Supabase `role` claim (PostgREST accepts writes).
    - Offline edits: a patient and note added offline synced once back online; Sign out offered the unsynced-changes warning while offline.
    - A change made on the server (practice settings prefix) appeared in the open app within seconds, without a restart.
    - Server lock: with an invoice marked sent on the server while the app was offline, adding a visit to it offline was refused on upload with "Visits can't be added once an invoice is sent. That change was undone.", and the app showed the server's copy.
    - Row-level security: a second Clerk user saw an empty practice; signing back in as the first restored their data. (Also covered by the 62 RLS and 15 Storage database tests.)
    - Two physical devices on one account: not tried yet (no second computer with the app); the server-change check covers changes arriving from elsewhere.
    - Fixed: checkboxes, switches and radio options only responded to clicks on their label, not on the box, switch or dot. HeroUI 3.2's `Content` is the clickable label, so the control now sits inside it (Invoice, Profile, Invoice style).

## Phase 2b: before mobile

The phone app will write the same data as the desktop app, so the shared rules, the server's checks and the docs a new session reads first need to be complete before it starts.

- [x] **E1. Bring `CLAUDE.md` and the docs up to date:** record the decisions made along the way so a new session (the mobile work) starts from them.
  - `CLAUDE.md` domain rules: tax rates in basis points (5% = 500), worked out once on the invoice subtotal and rounded half up; line items copy name and price from the price list; invoice numbers are per-practitioner integers with an optional constant prefix; an invoice is for one patient, so only that patient's visits can go on it; a sent invoice never goes back to draft; notes stay editable on a sent invoice and lock once paid; an invoice can't be sent while a profile field marked "show on invoice" is empty.
  - `CLAUDE.md` Commands: install, desktop dev, type-check, lint (`pnpm lint`), tests (`pnpm check`; `pnpm test:db` for database tests, needs Docker), Rust 1.96+ for the desktop app.
  - `CLAUDE.md` design rules: the wordmark in the window's top-left corner on desktop, and the small wordmark with Terms and Privacy at the bottom of Settings (as in `docs/brand.md`).
  - `docs/design-brief.md`: the sign-in screen (email code first, password as the alternative, inline errors) and Sign out at the bottom of Settings with the unsynced-changes dialog.
  - `docs/tech-stack.md`: Oxlint (not ESLint) under `packages/config`; new tables the apps need offline must be added to the `powersync` publication and `infra/powersync/sync-config.yaml`.
- [x] **E2. Server-side locks:** database triggers so the server enforces the remaining rules whichever app writes: invoice lines and the tax fields change only while the invoice is a draft; visit notes lock once the invoice is paid; status changes only draft → sent → paid and paid → sent. pgTAP tests for each, in the style of `supabase/tests/rls.test.sql`; check the desktop app shows the refusal message when one is hit.
- [x] **E3. Invoice numbers and all-or-nothing invoices (decision first):** two devices working offline can give two invoices the same number, and an invoice uploads as several requests, so a refused visit leaves it half-made. Decide how numbers are assigned (e.g. by the server when the invoice is first saved there, or renumbered on conflict), then make creating an invoice with its visits one database operation (e.g. a Postgres function the connector calls) so it either fully happens or doesn't.
- [x] **E4. One profile, settings and style row per practitioner:** if two devices save these for the first time before syncing, they create two rows and the server refuses the second. Give each a fixed ID per practitioner (e.g. derived from the Clerk user ID) so first saves on any device update the same row. Tests in `@kineo/data`.

## Phase 3: phone app (`apps/mobile`)

Done through M20. The tasks (M1 onward) are in [`tasks-phase-3.md`](tasks-phase-3.md).

## Phase 4: UI v2 overhaul (`apps/desktop`, `apps/mobile`, `packages/tokens`)

Done. The tasks (U0 onward) are in [`ui-tasks.md`](ui-tasks.md).

## Phase 5: funding and invoices (`supabase/`, `packages/*`, `apps/desktop`, `apps/mobile`)

Done (F1–F23). The tasks are in [`funding-tasks.md`](funding-tasks.md); the rules are in [`funding-info.md`](funding-info.md).

## Phase 6: invoice numbers (`packages/shared`, `supabase/`, `packages/data`, `apps/desktop`, `apps/mobile`)

A practitioner builds their invoice number from parts and can carry on from the numbers they used before Kineō. Decided: the parts are prefix (text), year, month and number, each on or off and in any order, number always on, joined by one separator (`-`, `/`, `.` or none); the number is padded to 1–6 digits; counting never restarts (the year is only shown); a starting number sets the lowest next number. Year and month come from the invoice's date (sent, or created while a draft) in the practitioner's time zone. A sent invoice keeps the number it was sent with, whatever the settings later say. Edited in Price list and tax on both apps.

- [x] **N1. Shared rules:** the number format (parts, separator, digits, prefix) with its Zod schema and default, building a number for an invoice date, the next number with a starting number, and the starting number's checks, with tests.
- [x] **N2. Database:** `practice_settings` columns for the parts, separator, digits and starting number (today's prefix split into prefix and separator so numbers look the same); `invoices.display_number`, set when an invoice is sent and locked from then on (backfilled for sent, paid and cancelled invoices as they show today); `create_invoice` honours the starting number; pgTAP tests; local schema in `@kineo/data` and its check.
- [x] **N3. Data and screens:** read and save the new settings; Send saves the number; every place that shows a number (both apps, the invoice template, PDF names) uses the saved number once sent and the current format before.
- [x] **N4. Desktop settings:** an Invoice numbers section in Price list and tax: parts with on/off and move up/down, prefix, separator, digits, starting number, and a live example ("Next invoice: INV-2026-0142").
- [x] **N5. Phone settings:** the same section on the phone's Price list and tax.
- [x] **N6. Docs:** the invoice number rules in `CLAUDE.md` and `docs/design-brief.md`.

## Phase 7: correcting mistakes (`packages/*`, `supabase/`, `apps/desktop`, `apps/mobile`)

From the workflow review: a practitioner couldn't fix a typo in a patient's name, remove a visit saved by mistake, or date a note written after the day. Decided: a visit is deleted at once with an Undo toast that stays until dismissed; a visit's date is picked when saving (default today) and can change later, both only while the visit isn't on an invoice and never to a day after today.

- [x] **P1. Edit a patient's details:** full name and reason for visit, from the patient screen on both apps ("Edit details", "Patient updated"); drafts billed to the patient take the new name, sent invoices keep theirs; tests.
- [x] **P2. Delete a visit:** a visit not on an invoice can be deleted from the patient's visit list on both apps, with "Visit deleted" and Undo; the server refuses deleting a visit that's on an invoice; tests, pgTAP included.
- [x] **P3. A visit's date:** chosen when saving a note (default today) and changeable while the visit isn't on an invoice, never after today; the server enforces both; tests, pgTAP included.

## Phase 8: account creation (`packages/shared`, `apps/desktop`, `apps/mobile`, Clerk)

New practitioners create their own account in either app. Decided: sign-up with email and a 6-digit code (a password is optional, for the password sign-in) or with Google; open to anyone; asks for the full name once and saves it as Your profile's full name; a required "I agree to the Terms and Privacy policy" checkbox, recorded by Clerk. New dependencies agreed with Google: `expo-auth-session` and `expo-web-browser` (phone), Tauri's deep-link plugin (desktop).

- [x] **A1. Shared sign-up rules:** the sign-up form's checks (full name, email, consent) and Clerk's sign-up errors as plain messages, beside the sign-in ones in `@kineo/shared`; tests.
- [x] **A2. Desktop sign-up:** "Create an account" from the sign-in screen: full name, email, the consent checkbox, then the emailed code; the full name goes into Your profile on first sign-in; tests.
- [x] **A3. Phone sign-up:** the same on the phone; tests.
- [x] **A4. Google on the phone:** "Continue with Google" on sign-in and sign-up through Clerk's `useSSO` (the browser sheet, back by `kineo://`); a new Google account still agrees to the Terms first; tests.
- [ ] **A5. Google on desktop:** "Continue with Google" opens the browser and comes back through a `kineo://` link (deep-link plugin), then finishes the sign-in with Clerk; `browser.rs` allows Clerk's sign-in host; checked on macOS.
- [ ] **A6. Docs and settings:** sign-in methods in `docs/tech-stack.md`, the brief's sign-up screens, Google in the privacy policy draft, and the Clerk dashboard settings (sign-up, legal consent, Google, native redirect URLs) written down.

## Later (not yet broken down)

- Nothing yet.

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

<!-- Add follow-ups here as they come up. -->

- Phone: delete the pre-sign-in `kineo-local.db` (owner `local-device`, from M9) left on test devices; M16 no longer opens it. Only made-up test data, so low priority.
- Phone: with the keyboard open, the first tap on a button or another field seemed only to close the keyboard (iOS simulator, sign-in screen). Check by hand whether it happens on a device and on other form screens.
- Phone sign-in: return in the email field on the password step does nothing; it could move to the password field.
- Phone (U5): the first-sync and offline screens draw the wordmark in Inter, because the phone app doesn't bundle Sora (brand font). Add `@expo-google-fonts/sora` and load it in `_layout.tsx` if the exact wordmark is wanted (new dependency, needs your OK).
- U5 pending buttons cover add patient, save note, save profile, save style, Mark as sent and Share PDF. The sign-in buttons, Download PDF (the system print dialog), Sign out and logo upload still use their old pending behaviour; give them the same treatment if you want them to match.
- U5: "Offline · saved on this device" shows for any draft invoice not yet uploaded, even briefly while online (it clears as soon as the upload finishes).
- U11: while a new invoice isn't on the server yet, the desktop live preview still prints the proposed number, though the title says "Number: Given when you're online". It can't be sent or downloaded then, so nobody else sees it; decide whether the preview should show a placeholder instead.
- U10: an invoice detail lists its visit dates as they are, so two visits on one day read "12 Nov, 12 Nov". Show such a day once with a count ("12 Nov (2)") if that reads better.
- U6: the phone's Patients tab list (`screens/patients`) still uses the old row style; give it the Recent-row look if you want the two lists to match.

- U14: the phone's New item sheet uses `keyboardBehavior="interactive"`; check by hand on a device that the fields stay above the keyboard.
- U16: phone inputs keep their grey fill on focus (only the border turns sky); the brief says they turn to the surface colour, as on desktop. HeroUI Native has no focus fill, so it needs an override of its input background layer.
- U16: Home's search "Clear search" button is HeroUI's 20 px icon inside the field; give it a 44 px target if it matters (it has space around it, so it meets WCAG's 24 px rule).

### Before launch

- Website placeholders to fill before launch, shown in red on the site: the store/download links in `apps/web/src/data/downloads.ts` (set each status as builds ship). The site address, contact email and copyright are filled in `config.ts`.
- Website legal text: `docs/legal/privacy.md` and `terms.md` have headings and `[TO BE WRITTEN]` only; change `status: draft` to remove the draft banner once reviewed. The privacy policy should mention Clerk (US-hosted, practitioner identity only) per `docs/tech-stack.md`.
- Website: run Lighthouse once a deploy target exists (not run locally; it would need downloading). `og.png` is regenerated with `pnpm --filter @kineo/web assets`, which needs Google Chrome (or `CHROME_PATH`). `vite preview` doesn't serve `404.html` for unknown paths; Cloudflare Pages and Netlify do.
- Download PDF on macOS opens the Save panel and writes the PDF directly (`src-tauri/src/pdf.rs`: WebKit's print operation in save-to-file mode, no print dialog), from a shadow-root copy of the invoice on the main page (`src/invoice/printInvoice.ts`). Checked in a debug Mac build: a saved PDF is one letter page with only the invoice, its accent colour, font and selectable text; Cancel does nothing. Windows and Linux fall back to the print dialog (`print()`); check that when packaging for Windows. "Share" from the brief isn't built yet.
- Offsite backup copy (encrypted, Canada) once a provider is chosen; `infra/backup/backup.sh` writes local encrypted dumps only for now.
- No rate limiting at the edge: the ZimaBoard's Caddy has no rate-limit module. Brute force isn't possible on these hosts (no password endpoints; Clerk handles sign-in and rate-limits it), but a flood of bad-token requests would reach PostgREST/PowerSync. Revisit with fail2ban on the access log, or Cloudflare in front, if it ever matters.
- Production Clerk instance: add its Frontend API domain to `ALLOWED_HOST_SUFFIXES` in `apps/desktop/src-tauri/src/clerk_http.rs`, and to `connect-src` in both `csp` and `devCsp` in `tauri.conf.json` if it isn't under `*.clerk.accounts.dev` (Clerk's requests go through Rust, so this is only a fallback). Check that `cdn.protect.clerk.com` is still where its `protect_config` loader points.
- A release build signed with a different identity may ask for keychain access again; check when packaging the app.
- Try the same account on two computers once a second machine has the app (D13 covered server-side changes only).
- Windows and Linux use the same macOS-shaped icon (rounded tile with a transparent margin and shadow), so it may look small there; draw the Windows shape from docs/brand.md (lightly rounded tile, .ico sizes 16–256) before packaging for Windows.

- Desktop: opening the app again a few seconds after quitting it twice showed a blank window until it was quit and opened again (debug builds, while testing PDFs). Possibly the previous instance still closing the local database; check with a release build.

- Invoice numbers (N2) and visit corrections (P2, P3): run `infra/update.sh` on the server before installing builds with Phase 6 or 7. Until the server has `20261115090000_invoice_numbers.sql`, saving Price list and tax and sending invoices are refused on upload (unknown columns). Older builds keep working after the migration (the server fills in a sent invoice's number itself).
- Invoice numbers (N4/N5): the new Invoice numbers sections are covered by tests but haven't been looked at on screen yet (the Mac was locked when the debug build ran). Check both, light and dark, and the phone with the keyboard open on Next invoice number.

- Sign-up (A2, A3): not yet tried against the real Clerk instance on either app. Turn on sign-ups (email code, password optional) and legal consent in Clerk, then create an account in the Tauri window and on the phone (signed out first); check the exact error code Clerk returns when the agreement is missing (`signUpError` guesses two) and that a new account lands signed in with Your profile's full name filled.

- The Terms and Privacy page addresses are written twice: desktop's `LEGAL_LINKS` (`apps/desktop/src/components/legal.ts`) and the phone's sign-up screen. Move them into `@kineo/shared` if a third place needs them.

- Google on the phone (A4): needs a new development or TestFlight build (`expo-auth-session` and `expo-web-browser` include native code; Expo Go and older builds won't have them). In Clerk, turn on Google (custom credentials from the Google Cloud client) and add `kineo://sso-callback` to the allowed redirect URLs for native apps; then try an existing account, a new one (it should stop at "One more step"), and closing the browser sheet. Uses `useSSO` from `@clerk/expo/experimental` (the same newer API as the sign-in screens); recheck it on every Clerk upgrade.
- "Continue with Google" is a plain text button. Google's branding guidelines prefer its "G" logo on the button; add it (an SVG from Google's guidelines) if you want to follow them exactly.

### Later

- Funding, deferred (see `docs/funding-info.md` §4): a separate Required switch for details (today one Show on invoice switch, shown means required); an identifier mandatory per funding type; fractional hours on lines; registration number and session length on self-pay invoices (Pacific Blue Cross receipts); a child as patient with a parent or guardian contact; an authorized-rate warning when a line goes over; a Home cue for the oldest unbilled visit against six months (Autism Funding, CYDB) and 90 days (WorkSafeBC); GST/HST treatment on physiotherapy; verified WorkSafeBC and ICBC recipient addresses and field lists; the CYDB recipient name (the starting point leaves it empty).
- HeroUI's full stylesheet is ~470 kB (44 kB gzipped). Fine for a desktop app; revisit if load time matters.
- `pnpm check` doesn't run the Rust tests or clippy; add `cargo test` and `cargo clippy` for `apps/desktop/src-tauri` to CI.
- D3/D8: open the local database without waiting for Clerk (it can't load offline); restore the signed-in state from the keychain (D5).
- The sync and API addresses are fixed in `src-tauri/src/sync/mod.rs` (`SYNC_URL`, `API_URL`); a local or staging server would need a build-time setting.
- `watchPracticeData` rebuilds all the data on every change to any table. Fine for a solo practice's data size; if it ever feels slow, watch per screen instead.
- If a different person signs in, the previous person's unsynced changes are cleared without a warning (their data can't be uploaded under someone else's account). Rare on a solo practitioner's computer; revisit if clinics share machines.
- Logo tests in Rust leave small folders under the system temp folder (`kineo-logos-test-*`); tidy them in the tests if they pile up.
- `DemoStore` still holds its own copy of the rules (used by screen tests through `DemoPracticeStore`). Consider running screen tests against `LiveStore` on an in-memory SQLite database instead, then deleting `DemoStore`.
- A logo chosen in Invoice style but never saved stays in Storage (the old one is deleted only when a new one is saved). Delete unsaved uploads when leaving the screen, if it matters.
- Download PDF may print before the logo has loaded on a slow first load; disable it until the logo is ready if that shows up.
- One desktop test failed once during `pnpm check` (199 tests, all packages running at once) and passed on nine reruns; its name wasn't captured. Likely a timeout under load. If it recurs, note which test and raise its timeout or make it wait more precisely. Seen again in M10 with Metro running: `NewPatient.test.tsx` "adds the patient, confirms it and moves on to their screen" failed once and passed on five reruns.

### Notes

How things work, kept for reference.

- `supabase start` needs a real `CLERK_DOMAIN` (it fetches the Clerk OpenID config), and Docker's `docker-credential-desktop` isn't on the shell PATH here, so image pulls fail without adding `/Applications/Docker.app/Contents/Resources/bin` to PATH.
- `pnpm db:seed` needs `psql`, which isn't installed on this Mac; run it on the server, or install the Postgres client (`brew install libpq`).
- Bundle identifier is `tech.fenna.kineo` (desktop now). Use the same ID for the Expo iOS app so both share one App Store Connect record (universal purchase); Android can use it as its package name too.
- Studio runs without Supabase's API gateway, so its table editor and SQL editor work but its Storage and API docs pages may not; use it over an SSH tunnel to `127.0.0.1:55323`.
- `setup.sh` restarts PostgREST and Storage when Clerk's key set changes (only on key rotation), a few seconds of API downtime.
- Clerk's request hooks are `__internal_onBeforeRequest` / `__internal_onAfterResponse` (renamed from `__unstable__` in clerk-js 6); they can change without notice, so pin `@clerk/clerk-js` and recheck sign-in on every Clerk upgrade.
- PowerSync's Tauri SDK is alpha: pin exact versions and recheck sync and offline opening on every upgrade.
- Desktop Content-Security-Policy (`app.security.csp` in `tauri.conf.json`; `devCsp` adds Vite's websocket and inline React-refresh script): the webview loads only its own files, Clerk Protect's script (`cdn.protect.clerk.com`) and `data:` images and fonts; Clerk, PostgREST, PowerSync and Storage are all reached from Rust, so the webview needs no connection to Kineō's servers. Inline styles are allowed (HeroUI and the invoice frame), and `dangerousDisableAssetCspModification: ["style-src"]` stops Tauri adding hashes that would switch `'unsafe-inline'` off. Checked in a debug `.app` build: restored sign-in, sync, invoice frame with Nunito, Invoice style. Anything new the webview loads from elsewhere must be added there.
- Legal links open the browser in front through `src-tauri/src/browser.rs`; only `https://getkineo.work/` pages are allowed. Add other pages there if the app links to more of the website.
- New invoices upload through the `create_invoice` database function, not as separate rows (E3). The phone app's connector must do the same: send a transaction's invoice PUT and the visit PATCHes that point at it as one `rpc/create_invoice` call, and block sending a draft while its PUT is still in `ps_crud`.
- Profile, practice settings and invoice style rows have fixed IDs per practitioner (E4): `ownRowId(table, userId)` in `@kineo/data`, `public.own_row_id(table, owner)` in Postgres; both are version 5 UUIDs in Kineō's namespace and must stay identical (tests in both check the same values). The phone app must use `ownRowId` when it first saves any of these rows.
- React is pinned to one version for every app (`overrides` in `pnpm-workspace.yaml`, currently 19.3.0, what Expo SDK 58 needs). Two copies broke `react-dom` for desktop's tests. When upgrading Expo's SDK, raise React there to match.
- Phone app tests (M3): plain logic (`*.test.ts`) in Vitest, screens (`*.test.tsx`) in Jest with `jest-expo` and React Native Testing Library 14, where `render` and `fireEvent` are async (`await` them). `jest.config.js` uses Reanimated's resolver and `jest.setup.js` mocks Reanimated and stubs Worklets' `getUIRuntimeHolder`; recheck both after Reanimated, Worklets or Gesture Handler upgrades. Wrap screens in `SafeAreaProvider` with `initialMetrics` or they render nothing. Jest has no compiled CSS, so Uniwind's variables read as missing there; `jest.setup.js` drops exactly the two messages that causes (Uniwind's "We couldn't find your variable --theme" and HeroUI's "[colorKit.RGB]" fallback to black). The app has the variables and shows neither.
- Phone inputs: the brief's "grey fill that turns white with a primary border on focus" is desktop-only in `@kineo/tokens` (`--field-focus`, `--field-border-focus`); HeroUI Native has no such variables and draws its own focus ring with `--focus`. Check how inputs look when focused in the first phone screen with a form, and match the brief there.
- Phone buttons use 16px corners (HeroUI Native's 3xl/4xl sizes pinned in `heroui-native.css`), where desktop's are pill-shaped; check they read as the same app in M6.
- Hermes (the phone's JavaScript engine) lacks `Array.prototype.toSorted` and `structuredClone`, which `@kineo/shared` and `@kineo/data` use or used. `src/utils/polyfills.ts` adds `toSorted` (imported first in `_layout.tsx`); the demo data copies with JSON instead. Shared code meant for the phone should avoid newer built-ins, or add them there.
- Phone Home rows (recent patients, search matches, invoice to-dos) aren't tappable yet; link them when the patient and invoice screens exist on the phone, and add the other tabs (Patients, Invoices, Settings) to `NativeTabs` in `src/app/_layout.tsx` as their screens land.
- Phone tabs use `NativeTabs` from `expo-router/native-tabs` (`unstable-native-tabs` is deprecated in SDK 58, though Expo's docs still show it).
- Phone icons and launch images come from `pnpm --filter @kineo/mobile icons` (`apps/mobile/scripts/icons.mts`, needs Chrome for the wordmark; output in `apps/mobile/assets` is committed). Expo Go shows its own icon and launch screen, so check them in M6 with a development build (`npx expo run:ios` / `run:android`).
- Android 12+ shows the launch image inside a circle, so the Android launch screen has the white tile only, without the wordmark under it (`splash-android.png`); iOS has both, as the brief says.
- CocoaPods crashes on `npx expo run:ios` unless the shell uses a UTF-8 locale (the app name has ō): `export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8` (e.g. in `~/.zshrc`), then `pod install` in `apps/mobile/ios` once.
- The phone's PowerSync SDK is a pinned dev release (`@powersync/react-native` 0.0.0-dev-20261020125654, op-sqlite 18.2.5), because no stable PowerSync React Native driver builds on React Native 0.88 yet (M8). Watch for a stable release and move to it; until then don't let `pnpm update` or `npx expo install --fix` change these two.
