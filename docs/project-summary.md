# Kineō: project summary

A self-contained overview of everything built so far, written to paste into a chat with someone (or an assistant) who can't see the code, to plan what comes next.

**As of:** 12 November 2026. **Covers:** everything through Phase 3 task M19 (the phone app's end-to-end check). The repository's `docs/tasks.md`, `docs/tasks-phase-3.md` and `docs/tech-stack.md` hold the detail behind it.

This document contains no secrets, keys, server addresses or real patient information. Names in examples are made up.

---

## 1. What Kineō is

Kineō (written with a macron over the o; plain "kineo" in all code and file names) is a desktop and phone app for **solo physiotherapists in British Columbia**. It does two jobs:

1. **Visit notes:** write a short note for each patient visit, by typing or dictation.
2. **Invoices:** turn one or more visits into an invoice, preview it, send it as a PDF, and record when it's paid.

The goal is a calm, uncluttered app with very little on screen, where the next step is always obvious. It isn't a clinic management system: no scheduling, no insurance billing, no multi-practitioner clinics.

**Who it's for:** one practitioner, working alone, often moving between a computer at the clinic and a phone on the go. They need to write notes without a connection and have everything appear on their other device later.

**Status:** both apps work end to end against a real server, with made-up data only. Nothing is released to the public yet.

---

## 2. Domain rules

These are the business rules both apps follow. They live in one shared package (`@kineo/shared`) and the server enforces the important ones as well.

### Notes and visits

- **Notes and invoices are separate.** Saving a note never creates an invoice. A visit can be invoiced later, or never.
- Each visit has a date, a note, and an "edited at" timestamp.
- **"Add to note"** appends to an existing visit's note; **"Replace note"** overwrites it.
- Notes stay editable while the visit's invoice is a draft or sent, and **lock once the invoice is paid**.

### Invoices

- **One invoice can cover several visits.** A visit belongs to at most one invoice. An invoice is for one patient, so only that patient's visits can go on it.
- **Status:** `draft` → `sent` → `paid`, and `paid` → `sent` to undo a payment. A sent invoice never goes back to draft.
- **Sent and paid invoices are locked:** no changes to their visits, line items or tax.
- **Sending** needs at least one line item, and is blocked while any profile field marked "show on invoice" is empty (the preview says which one to fill in).
- **Paid is only a record** for the practitioner's taxes. Patients pay and claim insurance themselves; Kineō never submits claims.

### Line items, money and tax

- **Line items come from a price list** (name + price) set in Settings. Adding a line _copies_ the name and price, so later price changes never alter an existing invoice. Quantity is a whole number, at least 1.
- **Money is stored as whole cents.** No floating point anywhere for money; rounding happens only for display.
- **Tax is optional per invoice and off by default.** The default rate comes from Settings and is copied onto the invoice when tax is turned on. Rates are stored in basis points (5% = 500, up to 100%). Tax is worked out once on the subtotal and rounded half up to the cent.

### Invoice numbers

- Whole numbers per practitioner, counting up from 1, shown padded to four digits with an optional constant prefix (e.g. `INV-0004`).
- A device proposes the next number when it creates an invoice. If another device already used that number (both were offline), the server gives the next free one instead.
- **A new invoice can only be sent or shared once it has reached the server**, because until then its number may still change.

### Profile

- Five fields: full name, title or certification, clinic name, address, phone. Each has a "show on invoice" flag, and a field shown on invoices is required.

### Invoice style (desktop only)

- Logo, accent colour (Sky, Forest, Ocean, Plum, Charcoal), font (Clean, Serif, Nunito), header layout (logo left or centred), and a footer note. Set on the desktop app only; invoices made on the phone use it.

---

## 3. What each app does today

Both apps have the same screens (except Invoice style) and the same flow. Every screen has loading skeletons, friendly empty states ("You're all caught up"), inline errors that say what to do, and short confirmation toasts ("Note saved", "Invoice sent", "Marked paid" with Undo, "Patient added", "Profile saved").

### Desktop (Mac first; Windows planned)

Built with Tauri (a small native shell around a web view) and React.

- **No top bar and no sidebar.** Everything starts from Home. Home has a small settings icon; every other screen has only a back arrow. The Kineō wordmark sits in the window's top-left corner.
- **Sign in:** email code first, password as the alternative; "Can't reach sign-in" with "Try again" when offline at first launch.
- **Home:** "Who are you seeing?" with patient search and recent patients, then invoice to-dos in three groups: Ready to invoice, Not sent yet, Waiting on payment.
- **New patient**, **Patient** (note box, Save as today's visit, Copy last note, Clear, visit list with status tags, "Invoice N visits"), **Invoices** list, **Invoice editor**, **Invoice preview** (exactly as the patient receives it, Download PDF through the system print dialog, Mark as sent).
- **Settings:** Your profile, Price list and tax, Invoice style (with a live preview and logo upload), "Signed in as …" and Sign out (which warns first if some changes haven't reached the server). A small wordmark with Terms and Privacy links at the bottom.

### Phone (iOS and Android)

Built with Expo and React Native.

- **Bottom tab bar:** Home, Patients, Invoices, Settings. Detail screens show a back arrow. Generous space at the top for the notch.
- Same screens and rules as desktop, except:
  - **No Invoice style screen;** Settings has a short note saying it's set on the computer.
  - The price list is a short list of rows to tap rather than a dropdown, and quantity is a − / + stepper.
  - **Share PDF** opens the phone's share sheet (save to Files, Mail, Messages, print). The PDF embeds the logo and the invoice fonts so it matches desktop's.
  - Sign out's warning is the phone's own alert ("Stay signed in" preferred, "Sign out anyway").

### Website

A small static marketing site (Astro): home page ("Less paperwork, more patients."), a download page (every platform currently "Coming soon"), privacy and terms pages (headings only, marked as drafts), and a 404 page. Placeholders for the site address and contact email still need filling in.

---

## 4. Architecture

### Monorepo

One repository, TypeScript throughout, managed with pnpm workspaces and Turborepo:

| Part                        | What it holds                                                                                                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/desktop`              | Tauri 2 + React + Vite + HeroUI (v3). A Rust side handles sync, the keychain and logo files.                                                                                 |
| `apps/mobile`               | Expo + React Native + HeroUI Native, with Expo Router.                                                                                                                       |
| `apps/web`                  | The Astro website.                                                                                                                                                           |
| `packages/shared`           | Types, validation (Zod), invoice maths, status and lock rules, note rules, profile rules, sign-in error wording. **All business logic lives here**; apps never duplicate it. |
| `packages/data`             | The local database schema (eight tables), live queries for every screen, and the "writer" that changes data through the shared rules. Both apps use it.                      |
| `packages/tokens`           | Colours, radius, fonts for both apps' themes (one source of truth).                                                                                                          |
| `packages/invoice-template` | One HTML invoice used for the preview and the PDF on both apps, so what you preview is exactly what the patient gets.                                                        |
| `supabase/`                 | Database migrations, row-level security, server-side locks, tests.                                                                                                           |
| `infra/`                    | Everything to run the server: Docker Compose, reverse proxy config, setup/update/status scripts, encrypted backups.                                                          |

UI components aren't shared between the apps (they use different UI libraries); only logic, data access and design tokens are.

### Local-first data with PowerSync

- **Every device has its own SQLite database.** Screens read and write it directly, so the app is instant and works fully offline.
- **PowerSync** syncs it with the server: changes made on the device queue up and upload when there's a connection; changes from the server (or the other device) stream down.
- Each app has a **connector** that uploads queued changes to the server's REST API (PostgREST) with the signed-in user's token. On desktop it's written in Rust (PowerSync's Tauri SDK requires it); on the phone it's TypeScript. Both follow the same rules:
  - Temporary problems (no connection, expired token, server error) are retried later.
  - A change the server refuses for good (e.g. editing an invoice that was sent on the other device) is dropped, the practitioner sees an error toast in plain words, and the server's version comes back.
- **New invoices upload as one database call** (`create_invoice`) together with the visits put on them, so an invoice is either fully saved or not at all, and a clashing number is fixed by the server.
- Profile, settings and style rows have a fixed ID per practitioner, so first saves on two offline devices update the same row instead of clashing.

### Sign-in with Clerk

- **Clerk** handles practitioner sign-in: email code first, password as the alternative, no social sign-in. Clerk holds the practitioner's identity only; patient data never goes to Clerk.
- The server checks Clerk's tokens directly, and every row is keyed to the Clerk user ID.
- Sessions are kept in the operating system's secure storage (macOS Keychain on desktop; iOS Keychain / Android Keystore on the phone), never in plain storage, and set so they can't move to another device through a backup.
- **Both apps open signed in without a connection,** from the stored session, and only need Clerk online to sign in and refresh tokens.
- **Sign out** removes everything from the device (database, saved logos, session). If some changes haven't uploaded yet, it asks first. An expired session just returns to sign-in and keeps unsynced changes for when the same person signs back in.

### Server (self-hosted for now)

- **Self-hosted Supabase** (Postgres, the REST API and file storage) plus a **self-hosted PowerSync service**, in Docker on a small home server, behind a reverse proxy with automatic HTTPS. Supabase's own login isn't used (Clerk is).
- **Row-level security on every table:** each practitioner can only ever read or change their own rows (62 database tests plus 15 for file storage check this).
- **Server-side locks** (database triggers) enforce the rules whichever app writes: lines and tax change only on drafts, notes lock once paid, status moves only along the allowed path.
- **Logos** are in a private storage bucket, one folder per practitioner, limited to PNG, JPEG or SVG up to 1 MB. Both apps keep a local copy so invoices show the logo offline.
- **Only the REST API, file storage and sync are reachable from outside.** The admin dashboard and the database port are not exposed.
- **Backups:** nightly encrypted backups to local storage, with a tested restore. An offsite copy in Canada isn't set up yet.

### Phone builds (EAS)

Phone builds are made with Expo's EAS service: development builds (for the simulator and test phones), internal preview builds for testers, and store builds. Only the public Clerk key is set as a build variable; no server secrets are in the app.

### Quality checks

- One command runs type-checking, linting (Oxlint) and all tests for every package, locally and in CI.
- Business rules have unit tests (Vitest); screens have component tests on both apps; the database has pgTAP tests for row-level security and the locks; the desktop's Rust code has its own tests.

---

## 5. Main decisions and why

| Decision                                          | Why                                                                                                              | Trade-off                                                                                                                                                                                    |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Local-first with PowerSync**                    | Practitioners write notes where there's no signal; the app must never wait on the network.                       | Two devices editing offline can conflict; handled by server locks, fixed row IDs and server-assigned invoice numbers.                                                                        |
| **Tauri for desktop** (not Electron or a website) | Small, native-feeling, and can keep data in a real file and the OS keychain.                                     | Clerk has no Tauri SDK: desktop uses Clerk's "native" token mode, with sign-in requests sent from Rust.                                                                                      |
| **PowerSync's Tauri SDK** (not its web SDK)       | The web SDK keeps data in browser storage, which may not survive app updates; unsynced notes could be lost.      | It's alpha, so versions are pinned exactly, and the connector has to be written in Rust.                                                                                                     |
| **Expo + React Native for phone**                 | One codebase for iOS and Android, sharing logic and data packages with desktop.                                  | Expo SDK 58 (React Native 0.88) needs a **pre-release PowerSync SDK**, pinned exactly; move to the stable one when it ships.                                                                 |
| **Clerk for sign-in**                             | Handles email codes, passwords, leaked-password checks and rate limiting without building auth.                  | US-hosted (identity only; mention in the privacy policy). Some features used are experimental (the offline start on the phone, request hooks on desktop), so Clerk upgrades need rechecking. |
| **Self-hosted Supabase first**                    | Cheap and fully controlled during the beta.                                                                      | A home server is a single point of failure; the plan is hosted Supabase in Canada later.                                                                                                     |
| **Money in whole cents, tax in basis points**     | No rounding drift, ever.                                                                                         | Conversion only at display time.                                                                                                                                                             |
| **One HTML invoice template for preview and PDF** | What you preview is exactly what the patient gets, on both apps.                                                 | PDFs come from each platform's print engine, so they need checking on each.                                                                                                                  |
| **Server assigns final invoice numbers**          | Two offline devices can't both be trusted to pick the next number.                                               | A new invoice can't be sent until it has reached the server.                                                                                                                                 |
| **Android syncs over WebSockets**                 | In testing, PowerSync's default HTTP streaming never connected on Android (no error); WebSockets worked at once. | Only seen in development builds; recheck in a release build and on PowerSync upgrades.                                                                                                       |

**Pinned pre-release or experimental dependencies** (recheck sync, sign-in and offline opening on every upgrade):

- PowerSync's Tauri SDK (alpha) on desktop.
- PowerSync's React Native SDK (a development release) and its SQLite driver on the phone.
- Clerk's request hooks (desktop) and offline resource cache (phone), both marked experimental or internal by Clerk.

---

## 6. Known limits and open follow-ups

### Before launch

- **Desktop security policy:** the Tauri app has a strict Content-Security-Policy (its own files, Clerk Protect's script, and Tauri's IPC; every server call goes through Rust). The production Clerk instance's domain needs adding when it exists.
- **Production Clerk instance:** everything currently uses Clerk's development instance; a production one is needed, with its domain allowed in the desktop app.
- **Website:** fill in the site address, contact email and download links; write the privacy policy and terms (the privacy policy must mention Clerk).
- **Colour contrast:** the "Draft" and "Paid" status tags use the UI library's default colours, which may be under the 4.5:1 contrast target.
- **Desktop PDF in the app window:** Download PDF uses the system print dialog; confirmed in a browser but not yet inside the Mac app window. There's no "Share" on desktop yet.
- **Offsite backups** (encrypted, in Canada) once a provider is chosen.
- **Two computers on one account** not tried yet (phone + desktop has been).
- **Windows icon** needs its own shape before packaging for Windows; a release build signed differently may ask for keychain access again.
- **Rate limiting:** the server's reverse proxy has none; sign-in is protected by Clerk, but a flood of bad requests would reach the API.

### Product decisions waiting

- **"Quick chips"** on the note box are in the brief but undefined; neither app has them. Decide what they are or drop them.
- **Sent and paid invoices** have no way back to their preview, so their PDF can't be shared again. Consider a quiet "View invoice" button.
- **"Marked paid" Undo** disappears after about four seconds with its toast; consider keeping it longer.

### Smaller follow-ups

- Phone: with the keyboard open, the first tap may only close the keyboard (seen on the iOS simulator); check on a real device. On the password sign-in step, return in the email field could move to the password field.
- Phone: a record that can't be read is silently left out; desktop shows a once-per-session message, the phone should too.
- Phone: test devices still hold an old pre-sign-in database file; harmless, made-up data.
- The sync and API addresses are fixed in code; a staging server would need a build setting.
- The Rust tests and lint aren't part of the CI check yet.
- Every data change re-reads all the practitioner's data; fine at a solo practice's size, revisit if it ever feels slow.
- If a different person signs in on the same desktop, the previous person's unsynced changes are cleared without a warning (rare for a solo practitioner).

---

## 7. Not built yet

- **Hosted Supabase in Canada** (planned next for the database; Clerk stays). Mostly configuration plus a data migration.
- **Releases:** no App Store, Play Store, Mac or Windows release yet. Android store signing and the Play Console aren't set up.
- **Over-the-air phone updates** (EAS Update) aren't set up; they'll need a runtime version policy once there are releases.
- **Real patient data:** the beta uses made-up data only. Real data needs BC privacy law (PIPA) safeguards and the physiotherapy College's record-keeping rules confirmed first.
- **Desktop Share** for invoices (the phone has it), and Windows/Linux packaging.
- **Encrypted local databases:** both apps rely on the operating system's own storage encryption; SQLCipher could be added later.
- **Anything beyond notes and invoices:** no scheduling, no reminders, no reports, no multi-practitioner clinics, no insurance claims (deliberately).
