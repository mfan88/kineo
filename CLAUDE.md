# Kineō: working notes for Claude

**Naming:** the product's display name is **Kineō** (single character ō, U+014D). Use plain **kineo** for every identifier: repo, package names (`@kineo/...`), bundle IDs, database names, env vars, file names and URLs. Never put ō in code identifiers or file names.

Kineō is a desktop and phone app for **solo physiotherapists in British Columbia** to write visit notes and send invoices. The goal is a calm, uncluttered app where the flow is obvious and there's very little on screen. When in doubt, do less and keep it simple.

You are co-building this with me. We work in tandem: I write code too, often at the same time as you.

---

## How we work together

- **Work in small steps.** After each step, stop and summarise: what changed, which files, and what's next.
- **Finish what you start.** No stubs, no `TODO`s, no "you can fill this in", no placeholder functions that return fake data. If you can't finish something, say exactly what's missing and why, and ask.
- **Every step leaves the project working.** It builds, type-checks and passes tests before you report back.
- **Ask before deciding** anything not covered here or in `docs/` (new dependencies, schema changes, UI patterns, file structure changes).
- **I may be editing at the same time.** Re-read a file right before you change it. Never overwrite or revert edits you didn't make. If something I changed conflicts with your task, stop and ask.
- **Stay in scope.** Only touch files the task needs. Mention unrelated problems you notice; don't fix them unasked.
- **Use the task list.** `docs/tasks.md` is our shared checklist. A phase can live in its own file linked from there (Phase 3: `docs/tasks-phase-3.md`). Work on the item I give you (or the next unchecked one if I say "next"), tick it off when done, and add any follow-ups you discover under **Discovered** in `docs/tasks.md`.

## Git rules (strict)

- **Never** run `git commit`, `git push`, `git reset`, `git rebase`, `git checkout`, `git switch`, `git stash` or `git merge`. I handle all commits, branches and pushes.
- You may run read-only git commands: `git status`, `git diff`, `git log`.
- Leave all changes uncommitted. When a step is ready, tell me and suggest a one-line commit message.

## Definition of done

A task is done only when:

1. It does everything the task describes, end to end, with no stubs.
2. Type-check passes, lint passes and tests pass.
3. New logic in `packages/shared` has tests.
4. UI follows the design rules below on both phone and desktop, where the screen exists on both.
5. You've summarised the change and ticked it off in `docs/tasks.md`.

---

## Stack

- **Monorepo**, TypeScript everywhere.
- `apps/mobile`: Expo + React Native + **HeroUI Native**
- `apps/desktop`: Tauri 2 + React + Vite + **HeroUI** (v3)
- `packages/shared`: types, invoice maths, Zod validation, sync layer. **Both apps import from here; never duplicate business logic in an app.**
- `supabase/`: schema, row-level security policies, migrations
- **Auth:** Clerk (`@clerk/clerk-expo` on phone, Clerk React on desktop). Supabase verifies Clerk tokens via third-party auth.
- **Database:** self-hosted Supabase (Postgres) behind Caddy for phase 1; hosted Supabase in Canada later.
- **Offline:** local SQLite on each device, synced with PowerSync. Reads and writes go to the local database first.
- Linting is Oxlint, not ESLint. Don’t add ESLint, typescript-eslint, ts-jest, ts-morph or other tools that need TypeScript’s JavaScript API without asking.

## Commands

Run from the repo root.

- Install: `pnpm install`
- Desktop app: `pnpm --filter @kineo/desktop dev` (needs Rust 1.96+: `rustup update stable`, and `apps/desktop/.env.local` with the Clerk key; see `apps/desktop/README.md`)
- Phone app: not set up yet (`apps/mobile`, Expo)
- Website: `pnpm --filter @kineo/web dev`
- Type-check: `pnpm typecheck`
- Lint: `pnpm lint` (Oxlint)
- Tests: `pnpm test`
- All three at once: `pnpm check`. Also run `pnpm format:check` (Prettier); CI checks it and `pnpm check` doesn't.
- Desktop Rust side: `cargo test` and `cargo clippy --all-targets` in `apps/desktop/src-tauri` (not part of `pnpm check`)
- Database tests (row-level security, Storage rules): `pnpm test:db` (needs Docker)

---

## Domain rules

- **Notes and invoices are separate.** Saving a visit note never creates an invoice. A note can be invoiced later.
- **One invoice can cover several visits.** A visit belongs to at most one invoice. An invoice is for one patient, so only that patient's visits can go on it.
- **Invoice status:** `draft` → `sent` → `paid`, and back from `paid` to `sent` (undoing a payment). A sent invoice never goes back to draft. Sent and paid invoices are locked: no changes to their visits, line items or tax.
- **Sending** needs at least one line item, and is blocked while a profile field marked "show on invoice" is empty (the preview says which field to fill in). A new invoice can only be sent (or downloaded) once it has reached the server, because until then the server may still give it a different number.
- **Invoice numbers** are whole numbers per practitioner, counting up from 1, shown with an optional constant prefix from Settings and padded to four digits (e.g. `INV-0004`). A device proposes the next number; if another device already used it, the server's `create_invoice` function gives the next free one instead.
- **Patients handle payment and insurance themselves.** Kineō never submits insurance claims. "Paid" is only a record for the practitioner's taxes.
- **Line items** come from the practitioner's price list (name + price) set in Settings. A line copies the name and price when it's added, so later price list changes never alter an existing invoice. Quantity is a whole number of at least 1.
- **Tax** is optional per invoice and off by default. The default rate is set in Settings; turning tax on copies that rate onto the invoice. Rates are stored in basis points (5% = 500, up to 100%). Tax is worked out once on the invoice subtotal and rounded half up to the cent.
- **Money:** store amounts as integer cents. Never use floating point for money. Round only when displaying.
- **Visit notes:** "Add to note" appends; "Replace note" overwrites. Keep an edit timestamp on every visit. Notes stay editable while the invoice is a draft or sent, and lock once it's paid.
- **Profile fields** (full name, title or certification, clinic name, address, phone) each have a "show on invoice" flag. A field shown on invoices is required.
- **Invoice style** (logo, accent colour, font, header layout, footer note) is **desktop only**. The phone app must not include invoice style screens.

## Design rules

The full brief is in `docs/design-brief.md`. Key rules:

- **HeroUI conventions:** rounded corners (12–16px), soft shadows, grey-filled inputs (`#F4F4F5`) that turn white with a primary border on focus, pill-shaped chips and status tags, sentence case, no uppercase labels. Font: Inter.
- **Palette** (source of truth: `@kineo/tokens`): light and dark, picked by the Appearance setting (Match system by default, stored per device). Light: brand sky `#0284C7` for focus borders, active tab, icons and the macron (never for text); primary buttons and links `#0369A1`, hover `#075985`; text on tint `#075985`, tint `#E0F2FE`, page background `#F7FBFF`, text `#11181C`, muted text `#71717A`, placeholders `#67676F`, borders `#E4E4E7`, error `#B42318`. Dark (`darkColors`): page `#0B1117`, surfaces with a 1px ring instead of shadows, sky `#38BDF8` buttons with dark text. Never hard-code colours; invoices and their previews stay on white in both modes.
- **Status tags** use `statusTags` / `darkStatusTags`, each with an icon and a word.
- **Navigation:**
  - Desktop: **no top bar and no sidebar.** Everything flows from Home. Home has a small settings icon at the top right; every other screen has only a back arrow at the top left of its content. The Kineō wordmark sits in the window's top-left corner on every screen except Settings and its screens, which instead show a small wordmark at the bottom middle with Terms and Privacy links (see `docs/brand.md`).
  - Phone: a bottom tab bar (Home, Patients, Invoices, Settings). Detail screens show a back arrow. Leave generous top padding for the status bar and notch. 16px side margins; the primary button is pinned at the bottom.
- **Home:** "Who are you seeing?" with patient search and recent patients, then to-do cards with counts: Ready to invoice, Not sent yet, Waiting on payment.
- **States are required, not optional:** loading skeletons shaped like the screen (after 300ms, at least 400ms), pending text in buttons ("Saving…", "Sending…"), friendly empty states ("You're all caught up"), inline errors that say what to do, and toasts for confirmations ("Note saved", "Invoice sent", "Marked paid" with Undo, which stays until dismissed).
- One primary button per screen; other actions are text buttons. Spacing 8 / 16 / 24–32px. Touch targets at least 44px. Text contrast at least 4.5:1. Invoices never include note text.
- **Do not add:** top app bars, sidebars, extra menus, dashboards or features not in the brief. If a screen feels busy, remove something.

## Security and privacy

Kineō stores personal health information. Treat every change with that in mind.

- Every table holding practitioner data has row-level security keyed on the Clerk user ID. No table is ever left without RLS.
- Only the Supabase anon key and the Clerk publishable key go in app code. **Never** put the Supabase service role key, database passwords or any secret in the apps, in client code or in committed files.
- Never log note contents, patient names or other patient details, including in error messages and analytics.
- Store auth tokens in secure storage (`expo-secure-store` on phone, the OS keychain on desktop), never in plain local storage.
- Use made-up test data only. Never add real patient information to seeds, fixtures, tests or screenshots.

## Writing style (UI copy)

- Plain, warm and short. Sentence case. No exclamation marks on system messages.
- Buttons start with a verb: "Save note", "Preview and send", "Record payment".
- Errors say what happened and what to do: "Add at least one line item before sending."
