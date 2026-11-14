# Kineō: working notes for Claude

**Naming:** the product's display name is **Kineō** (single character ō, U+014D). Use plain **kineo** for every identifier: repo, package names (`@kineo/...`), bundle IDs, database names, env vars, file names and URLs. Never put ō in code identifiers or file names.

Kineō is a desktop and phone app for **solo physiotherapists in British Columbia** to write visit notes and send invoices. The goal is a calm, uncluttered app where the flow is obvious and there's very little on screen. When in doubt, do less and keep it simple.

You (the Opus orchestrator / **Claude PM**) and your subagents (`worker`, `reviewer`, `canvas-designer`, `test-writer`, `ui-polisher`, `ui-researcher`, and `ui-verifier`) lead architecture, UI design, and final review across the repo, collaborating with the subordinate **Gemini PM** (`agy`) and its subagents via **Linear** and **Slack**.

---

## Multi-Agent Slack, Linear & Worktree System

Prompts may arrive either interactively or via the Slack Socket Mode bridge (`bridge/bridge.py`) on the always-on host:

- **Isolated worktrees:** Claude PM operates in its own checkout (`~/kineo-claude` on the server); Gemini PM operates in its separate worktree (`~/kineo-gemini`). Never assume Gemini shares your working tree or uncommitted files.
- **Slack channels & reactions:** Prompts from `#general` or `#agent-handoffs` pass recent thread context into each turn. When you or a subagent need a user choice or yes/no decision, format options on separate lines starting with `:one:`, `:two:`, `:three:` (up to `:five:`) or `:white_check_mark: Yes` / `:x: No` so the Slack bridge pre-seeds reactions and the user can answer with one tap.
- **Never invoke Gemini subagents directly:** Claude PM must never spawn or call `.agents/agents/*` directly. Always delegate to **Gemini PM** by creating/updating a Linear ticket (team `fenna` / key `MAR`, project `kineō`) with full file paths, acceptance criteria, and branch expectations, then tagging `@Gemini PM Agent` in Slack (`#agent-handoffs` or the active thread) with the Linear issue ID.
- **No hallucination:** Only state file paths, symbol names, command outputs, Linear states, and PR URLs you directly observed in files or tool output. Never guess what Gemini or a subagent did—verify via Linear comments, `git`/`gh`, or Slack.
- **Subagent attribution on Linear comments:** Start every Linear comment with a concise 1-line bold prefix naming the PM and subagents actually run (e.g., `**[Claude PM · reviewer]**` or `**[Claude PM · direct]**`).
- **Pause & resume hygiene:** If you or a subagent hit a quota limit or restart, **check Linear first** (issue status, assignee, and latest comments) plus `gh pr list` before resuming or re-assigning any work, so tasks finished while paused are never repeated or overwritten.

### Claude Quota Optimization (<80% of 5-Hour Cap)

- **Keep Claude PM under ~80% of its 5-hour rolling quota** while utilizing Gemini's higher capacity:
  - **Keep on Claude:** System architecture, Linear ticket scoping, UI research (`ui-researcher`), design canvas (`canvas-designer`, `ui-polisher`), iOS Simulator / Browser visual verification (`ui-verifier`), and final Claude-side `reviewer` sign-off.
  - **Offload to Gemini PM (via Linear + Slack):** Well-scoped implementation tickets (`@kineo/shared`, `@kineo/data`, `apps/desktop`, `apps/web`, `supabase/`), bulk boilerplate, edge-case test suites, first-pass PR checks, and deep PII/RLS audits.
- Keep subagent briefs concise and scoped to 1–3 files. Avoid spawning heavy parallel Claude subagent batches when approaching ~80% quota—hand remaining scoped tickets to Gemini PM via Linear + Slack and pause cleanly.

---

## How we work together

- **Work in small steps.** After each step, stop and summarise: what changed, which files, and what's next.
- **Finish what you start.** No stubs, no `TODO`s, no "you can fill this in", no placeholder functions that return fake data. If you can't finish something, say exactly what's missing and why, and ask.
- **Every step leaves the project working.** It builds, type-checks and passes tests before you report back.
- **Ask before deciding** anything not covered here or in `docs/` (new dependencies, schema changes, UI patterns, file structure changes).
- **My manual edits may be uncommitted.** Before you or a subagent edits a file, check `git status` and re-read the file right before changing it. Never revert or overwrite changes you didn't make without asking me. If something I changed conflicts with your task, stop and ask.
- **Stay in scope & log discovered items on Linear:** Only touch files the task needs, and never fix unrelated problems unasked. Whenever you or a subagent discover an out-of-scope bug, follow-up, manual/visual check, server/migration step, or pre-launch reminder, leave `docs/tasks.md` untouched and report it in **Linear** (team `fenna` / `MAR`, project `kineō`): check for an existing issue first, then create a `Backlog` issue labeled **`Discovered`** (plus `Bug` / `Improvement` / `Feature` as appropriate) with a plain-English **Summary**, source ticket (`MAR-XX`), and context, and mention the new `MAR-XX` key in your reply.
- **Linear is the single source of truth.** Track all tasks, assignments, discovered follow-ups, and review status in **Linear** (team `fenna` / `MAR`, project `kineō`). Leave `docs/tasks.md` untouched unless explicitly asked to update it.

## Git rules (strict, global)

These apply to every session (interactive and Slack/Linear):

- **Never commit or push directly to `main`, and NEVER merge any branch or PR.** The user reviews and merges every PR manually.
- **Branch from `origin/main`:** Before creating a new feature/phase branch in either worktree, run `git fetch origin` and branch from `origin/main` (not stale local `main`) so merged GitHub PRs are always included without manual pulls on the server.
- **Branch nomenclature (required globally):**
  - Bug fix or related issue: `fix/<short-hyphenated-description>`
  - New frontend feature: `feature/<short-hyphenated-description>`
  - New backend feature or DB migration: `backend/<short-hyphenated-description>`
  - Anything outside those 3 categories: `misc/<short-hyphenated-description>`
- **Subagents keep Git read-only** (`git status`, `git diff`, `git log`, `git show`). Only the orchestrator (Claude PM or Gemini PM) checks out branches, stages, commits, pushes, and opens PRs.
- **Share branches within a worktree (no branch sprawl):** Multiple subagents and related tickets/phases executing in the **same worktree** (`~/kineo-claude` or `~/kineo-gemini`) should share one feature/phase branch rather than creating a new branch per small ticket (keep parallel subagent file paths non-overlapping).
- **Co-authored commits only:** Include an explicit `Co-authored-by:` trailer on every commit (using env-configured trailers if set, or standard Anthropic/Google co-author trailers alongside the user's Git author).
- **Open a Pull Request** (`gh pr create`) when work is ready for review, post the PR link and branch name to Linear + Slack, and leave merging strictly to the user.

## Subagent Roster & Delegation Protocol

### Claude Subagents (`.claude/agents/` — run by Claude PM)

| Agent             | Model  | Job                                                                         |
| ----------------- | ------ | --------------------------------------------------------------------------- |
| `ui-researcher`   | Sonnet | Mobbin flows and Firecrawl references, filtered through the design brief    |
| `canvas-designer` | Sonnet | Drafts desktop and phone storyboard frames on the design canvas             |
| `ui-polisher`     | Sonnet | One pass over those frames: tokens, contrast, type, accessibility, subtract |
| `worker`          | Sonnet | Implements one ticket (only when kept on Claude rather than Gemini PM)      |
| `test-writer`     | Sonnet | Writes a ticket's tests from its contract                                   |
| `reviewer`        | Haiku  | Mechanical diff and rule check                                              |
| `ui-verifier`     | Sonnet | Runs screen tests and checks the brief in light and dark, all states        |

### Gemini Subagents (`.agents/agents/` — run ONLY by Gemini PM, never directly by Claude)

| Agent                 | Job                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------ |
| `gemini-worker`       | Implements scoped tickets on `shared`, `data`, `desktop`, `web`, or `supabase`       |
| `gemini-test-writer`  | Writes thorough Vitest, Jest, and pgTAP edge-case tests from ticket specs            |
| `gemini-reviewer`     | Mandatory Gemini-side `In Review` gate: diff + rule audit + test/typecheck/lint run  |
| `privacy-rls-auditor` | Deep read-only audit for patient PII leaks, error/log safety, and Supabase RLS rules |

### Delegation & Two-Sided `In Review` Gate

- **Design and research (when needed).** Before splitting tickets for a new screen or flow, send the feature to `ui-researcher`, then `canvas-designer` and `ui-polisher`. Bring open questions to the user (using reaction choices where suitable); skip for non-UI changes.
- **Split into tickets (multi-phase allowed when well-defined):** Break features into 1–3 file Linear tickets. You may create **multiple phases** of Linear tasks upfront whenever the requirements/architecture are already well known and defined and you explicitly wire the task dependencies (`blockedBy` / `blocks` relations and clear phase order).
- **Readable top summary on every Linear task:** Start every Linear issue description with a brief, plain-English **Summary** section for the user explaining what the task will complete, followed by exact file paths, signatures, target shared branch, acceptance criteria, and required checks. Settle open product decisions first.
- **Route efficiently:** Delegate scoped non-UI / Linux-compatible tickets to **Gemini PM** via Linear + Slack to preserve Claude's 5-hour quota; keep Claude-specific UI/iOS work on Claude's `worker`/`test-writer` when needed. Never use built-in `general-purpose` subagents.
- **Two-sided `In Review` check (mandatory):**
  1. When Gemini PM finishes a PR, it moves the Linear ticket to `In Review`, runs `gemini-reviewer` (plus `privacy-rls-auditor` when PII/auth/DB/RLS is touched), posts the review result on Linear, and tags Claude PM in Slack.
  2. Claude PM **must** always run its mandatory `reviewer` subagent (and `ui-verifier` for UI tickets) on every `In Review` ticket/PR before clearing it for the user—never skip it, even if `gemini-reviewer` already passed.
  3. If `reviewer` or `ui-verifier` fails: comment findings on Linear, set status back to `In Progress`, and route fixes back to whichever PM owns the branch.
  4. Only after **both** sides' review subagents pass: comment `[CLEARED FOR HUMAN REVIEW]` on the Linear ticket, run final checks if needed, and notify the user in Slack with the PR link and branch name (never merge).
- **Phase-end conflict & deferred-item resolution:** If any ticket or edit is set aside during a phase due to file/branch conflicts, cross-worktree overlap, or conflicting specs (marked `Blocked`/deferred on Linear), keep moving on unblocked items. Once the phase completes, **Claude PM and Gemini PM must collaborate via Slack (`#agent-handoffs`) and Linear** to jointly decide how to resolve every deferred item (reconciling branches, sequencing follow-up tickets, or escalating genuine product choices to the user in `#general` with `:one:` / `:two:` reaction options) before starting the next phase.

## Definition of done

A task is done only when:

1. It does everything the task describes, end to end, with no stubs.
2. Type-check passes, lint passes, formatting passes (`pnpm format:check`), and tests pass.
3. New logic in `packages/shared` has tests.
4. UI follows the design rules below on both phone and desktop, where the screen exists on both.
5. Both sides' review subagents passed (`gemini-reviewer` + `reviewer`, plus `ui-verifier` for UI), an unmerged PR is open from a properly named branch with co-authored commits, and the Linear ticket is updated.

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
- Phone app: `pnpm dev:mobile` (Expo; needs `apps/mobile/.env.local`; see `apps/mobile/CLAUDE.md` for Expo commands, development builds and its tests)
- Website: `pnpm --filter @kineo/web dev`
- Type-check: `pnpm typecheck`
- Lint: `pnpm lint` (Oxlint)
- Tests: `pnpm test`
- All three at once: `pnpm check`. Also run `pnpm format:check` (Prettier); CI checks it and `pnpm check` doesn't.
- Fast post-task formatting & Oxlint fix on changed files only (saves subagent tokens): `pnpm posttask` (or `pnpm posttask:check` for read-only check).
- Desktop Rust side: `cargo test` and `cargo clippy --all-targets` in `apps/desktop/src-tauri` (not part of `pnpm check`)
- Database tests (row-level security, Storage rules): `pnpm test:db` (needs Docker)

---

## Domain rules

- **Notes and invoices are separate.** Saving a visit note never creates an invoice. A note can be invoiced later.
- **One invoice can cover several visits.** A visit belongs to at most one invoice. An invoice is for one patient, so only that patient's visits can go on it. Creating an invoice (`createInvoice`) for a patient who already has an open draft continues that draft (adding the chosen visits to the newest existing draft) instead of starting a second draft.
- **Invoice status:** `draft` → `sent` → `paid`, and back from `paid` to `sent` (undoing a payment). A draft invoice can be deleted (its visits return to Ready to invoice and its lines are deleted; sent, paid and cancelled invoices cannot be deleted), and its invoice number is skipped and never reused (when the deleted draft had the practice's highest number, `invoice_number_start` moves up to at least `number + 1`). A sent invoice can also be **cancelled** (`sent` → `cancelled`, never from draft or paid; undo a payment first): it keeps its number (never reused), stays as a read-only record with a copy of its visit dates, and its visits go back to Ready to invoice. Nothing leaves cancelled. A sent invoice never goes back to draft. Sent, paid and cancelled invoices are locked: no changes to their visits, line items or tax.
- **Sending** needs at least one line item, and is blocked while a profile field marked "show on invoice" is empty (the preview says which field to fill in). A new invoice can only be sent (or downloaded) once it has reached the server, because until then the server may still give it a different number.
- **Invoice numbers** are whole numbers per practitioner that only count up (they never restart, not even each year). A starting number in Settings lets a practice carry on from numbers used before Kineō; the next number is the highest so far + 1, or the starting number if that's higher, and a new starting number can't be below a number already used. How the number looks is built from parts in Price list and tax (both apps): prefix text, year and month (from the invoice's date in the practitioner's time zone), each on or off, and the number, always on, padded to 1–6 digits; in any order, joined by one separator (`-`, `/`, `.` or none), e.g. `INV-2026-0042`. The rules are `buildInvoiceNumber` in `@kineo/shared` and `public.build_invoice_number` on the server (keep them identical). Sending saves the number as printed (`display_number`), and the server locks it: a sent, paid or cancelled invoice always shows the number it was sent with, whatever the settings say later; drafts show the current format. A device proposes the next number; if another device already used it, the server's `create_invoice` function gives the next free one instead.
- **Patients handle payment and insurance themselves.** Kineō never submits insurance claims. "Paid" is only a record for the practitioner's taxes.
- **Line items** come from the practitioner's price list (name + price) set in Settings. A line copies the name and price when it's added, so later price list changes never alter an existing invoice. Quantity is a whole number of at least 1.
- **Tax** is optional per invoice and off by default. The default rate is set in Settings; turning tax on copies that rate onto the invoice. Rates are stored in basis points (5% = 500, up to 100%). Tax is worked out once on the invoice subtotal and rounded half up to the cent.
- **Money:** store amounts as integer cents. Never use floating point for money. Round only when displaying.
- **Visit notes:** "Add to note" appends; "Replace note" overwrites. Keep an edit timestamp on every visit. Notes stay editable while the invoice is a draft or sent, and lock once it's paid. A visit is dated today unless the practitioner picks an earlier day; while it isn't on an invoice it can be re-dated or deleted (Undo restores it), never dated after today, and once it's on an invoice it keeps its date and can't be deleted (the server enforces both). A patient's name and reason for visit can be corrected; drafts billed to the patient take the new name, sent invoices keep theirs.
- **Visit items:** while writing or editing an uninvoiced visit note, the practitioner can attach items from the price list (`visit_items`, copying name, unit price in cents and whole-number quantity >= 1; adding an item already on the visit increments its quantity). Visit items can be changed only while the visit is not on an invoice (once invoiced, edit the invoice's lines instead). Putting a visit on a draft invoice copies its visit items onto the invoice as lines linked to that visit (`visit_id`, dated with the visit date on funded invoices); taking the visit off a draft removes the lines copied from that visit while leaving lines added directly on the invoice untouched. Deleting a visit deletes its items (Undo restores both). Note text still never goes on an invoice.
- **Profile fields** (full name, title or certification, clinic name, address, phone) each have a "show on invoice" flag. A field shown on invoices is required.
- **Invoice style** (logo, accent colour, font, header layout, footer note, optional footer logo, and a "Show 'Made with Kineō'" switch) is **desktop only**. The footer logo follows the same format and 1 MB Storage rules as the header logo, and is centred in the footer. The "Made with Kineō" switch is on by default (free to turn off during the beta). Both are configured on desktop only and rendered on both apps. The phone app must not include invoice style screens.
- **Funding:** a funded patient is billed to a funder instead of the patient. Read `docs/funding-info.md` before touching funders, Bill to or invoice reference details; it marks which rules are fixed and which are flexible, and overrides "Patients handle payment and insurance themselves" for funded patients only. Funding types (recipient, and details with Show on invoice) are made and edited on **desktop only**; the phone adds values and picks Bill to. A patient funding holds only that patient's values, a period and a link to its type. An invoice snapshots Bill to when it is created, refreshes it while it is a draft, and locks it once sent. Each line on a funded invoice needs a visit date. Sending is blocked while the recipient, a shown detail or a line's date is missing.

## Design rules

The full brief is in `docs/design-brief.md`. Key rules:

- **HeroUI conventions:** rounded corners (12–16px), soft shadows, grey-filled inputs (`#F4F4F5`) that turn white with a primary border on focus, pill-shaped chips and status tags, sentence case, no uppercase labels. Font: Inter.
- **Palette** (source of truth: `@kineo/tokens`): light and dark, picked by the Appearance setting (Match system by default, stored per device). Light: brand sky `#0284C7` for focus borders, active tab, icons and the macron (never for text); primary buttons and links `#0369A1`, hover `#075985`; text on tint `#075985`, tint `#E0F2FE`, page background `#F7FBFF`, text `#11181C`, muted text `#71717A`, placeholders `#67676F`, borders `#E4E4E7`, input border and switch off track `inputEdge` `#878791` (dark `#6B7684`), error `#B42318`. Dark (`darkColors`): page `#0B1117`, surfaces with a 1px ring instead of shadows, sky `#38BDF8` buttons with dark text. Never hard-code colours; invoices and their previews stay on white in both modes.
- **Status tags** use `statusTags` / `darkStatusTags`, each with an icon and a word.
- **Navigation:**
  - Desktop: **no top bar and no sidebar.** Everything flows from Home. A quiet tab bar sits in the window's top-right corner: **Home** and **Invoices** as text links (the current one marked) and the settings icon. Every screen but Home has a back arrow at the top left of its content. The Kineō wordmark sits in the window's top-left corner. Settings and its screens show neither the wordmark nor the tab bar there; instead a small wordmark sits at the bottom middle with Terms and Privacy links (see `docs/brand.md`).
  - Phone: a bottom tab bar (Home, Patients, Invoices, Settings). Detail screens show a back arrow. Leave generous top padding for the status bar and notch. 16px side margins; the primary button is pinned at the bottom.
- **Home:** "Who are you seeing?" with patient search and Recent patients as list rows ("Last visit 4 Nov"), then **To do** count cards: Ready to invoice (N visits), Waiting on payment (N invoices).
- **States are required, not optional:** loading skeletons shaped like the screen (after 300ms, at least 400ms), pending text in buttons ("Saving…", "Sending…"), friendly empty states ("You're all caught up"), inline errors that say what to do, and toasts for confirmations ("Note saved", "Invoice sent", "Marked paid" with Undo, which stays until dismissed).
- One primary button per screen; other actions are text buttons. Spacing 8 / 16 / 24–32px. Touch targets at least 44px. Text contrast at least 4.5:1. Invoices never include note text.
- **Do not add:** top app bars, sidebars, extra menus (beyond desktop's quiet tab bar), dashboards or features not in the brief. If a screen feels busy, remove something.

## Security and privacy

Kineō stores personal health information. Treat every change with that in mind.

- Every table holding practitioner data has row-level security keyed on the Clerk user ID. No table is ever left without RLS.
- Only the Supabase anon key and the Clerk publishable key go in app code. **Never** put the Supabase service role key, database passwords or any secret in the apps, in client code or in committed files.
- Never log note contents, patient names or other patient details, including in error messages and analytics.
- Store auth tokens in secure storage (`expo-secure-store` on phone, the OS keychain on desktop), never in plain local storage.
- Use made-up test data only. Never add real patient information to seeds, fixtures, tests or screenshots.

### Database notes

- `visits` carries `unique (id, owner_id)` so composite foreign keys (`visit_items` and `invoice_lines`) can reference a visit and its owner together.
- `invoice_lines_only_on_draft` treats any update that changes only `price_item_id` and/or `visit_id` as bookkeeping, so it is allowed on any invoice.
- `visit_items` has its own RLS and lock tests in `supabase/tests/visit_items.test.sql` rather than `rls.test.sql`, because its uninvoiced-visit lock trigger fires before `rls.test.sql`'s generic checks can run.

## Writing style (UI copy)

- Plain, warm and short. Sentence case. No exclamation marks on system messages.
- Buttons start with a verb: "Save note", "Preview and send", "Record payment".
- Errors say what happened and what to do: "Add at least one line item before sending."
