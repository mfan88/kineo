# Website brief: apps/web

Hand this to the coding agent once the current desktop tasks are done.

---

## Instructions for Claude

Read `CLAUDE.md`, `docs/brand.md`, `docs/design-brief.md` and `docs/tech-stack.md` first. Then:

1. Add the **Phase W: website** tasks below to the end of `docs/tasks.md`, exactly as written.
2. Work through them one at a time using the same rules as every other task: small steps, no stubs, `pnpm check` passing, tick each one off, suggest a commit message, and never commit or push.
3. Stop after **W8** and report back. Don't start anything beyond this list.

If anything in this brief conflicts with `CLAUDE.md`, `CLAUDE.md` wins. Ask before deciding anything not covered here.

---

## What the website is

A small, static, public site for Kineō. It is **not** a web version of the app. It exists to:

- explain what Kineō is and who it's for;
- show where to download the apps;
- host the **privacy policy** and **terms of use** (both app stores require a working privacy policy link);
- give a contact email for support and security reports.

Pages: Home, Download, Privacy, Terms, and a 404 page. Nothing else for now.

## Technical rules

- Lives in `apps/web` as package `@kineo/web`, with `dev`, `build`, `typecheck`, `lint` and `test` scripts that work with the root Turborepo setup.
- **Framework:** Astro, building to fully static HTML in `apps/web/dist`. Before installing, check that Astro and its type-checking (`astro check`) work with the repo's TypeScript 7 setup. If they don't, stop and tell me; the fallback is a plain Vite static build. Don't install a second TypeScript version without asking.
- Linting is Oxlint, same as the rest of the repo. No ESLint.
- Styling: plain CSS or CSS variables using values from `@kineo/tokens` if that package exists by then; otherwise CSS variables matching `docs/brand.md` exactly. No UI component library.
- Fonts: Sora 600 for headings and the wordmark, Inter 400/600 for body text. Self-host them in `apps/web/public/fonts` (no Google Fonts requests, which keeps the privacy policy simple).
- **No analytics, cookies, trackers, third-party scripts or embeds.** If something seems to need one, ask first.
- Must work well on a phone, pass basic accessibility (real headings, link text, alt text, 4.5:1 contrast, visible focus), and score well on Lighthouse.
- No deployment setup yet. The build output just needs to be a static `dist/` folder that Cloudflare Pages or Netlify could serve.

## Design

Follow `docs/brand.md`:

- Mist background (`#F7FBFF`), Tint (`#E0F2FE`) for the hero and highlight sections, Deep (`#075985`) for headings and the wordmark, Sky (`#0284C7`) for buttons and links.
- Lowercase **kineō** wordmark with the macron drawn as a separate sky-blue bar (never the font's built-in ō). Lockup (icon + wordmark) in the header.
- Calm and spacious, with generous whitespace and rounded corners (12–24px). It should feel like the app: no busy layouts, no stock photos, no gradients beyond the brand's own.
- Header: lockup on the left; links to Download, Privacy, Terms on the right, collapsing neatly on phones.
- Footer: small lockup, links to Privacy, Terms and the contact email, and "© 2026 Marcus Fan".

## Content rules

- **Don't invent facts:** no made-up features, testimonials, stats, prices, release dates or store links. Use clearly marked placeholders like `[APP STORE LINK]` or `[CONTACT EMAIL]`.
- **Don't write legal text.** Privacy and Terms pages render Markdown files from `docs/legal/`. Create those files with the section headings listed below and a `[TO BE WRITTEN]` placeholder under each one, plus a visible "Draft: not yet in effect" banner. I'll write the actual text (and have it reviewed) separately.
- Feature descriptions come only from `docs/design-brief.md`.
- Tone: plain, warm and short, sentence case, no exclamation marks.

---

## Phase W: website tasks

- [ ] **W1. Scaffold `apps/web`:** Astro (after the TypeScript 7 check described above), package `@kineo/web`, static output, scripts wired into Turborepo, Oxlint working, `pnpm check` passing. Add `apps/web/dist/` and `.astro/` to `.gitignore` if needed.
- [ ] **W2. Brand assets:** add `apps/web/public/` assets built from the icon SVG in `docs/brand.md`: `favicon.svg`, a 32 px and 180 px PNG fallback (apple-touch-icon), and a 1200×630 social preview image (`og.png`) showing the lockup on the tint background. Self-host Sora and Inter.
- [ ] **W3. Layout and styles:** base layout with header, footer, page metadata (title, description, Open Graph tags, canonical URL using a `[SITE URL]` placeholder in one config file), global CSS variables from the brand palette, a reusable wordmark component that draws the macron bar, and a skip-to-content link.
- [ ] **W4. Home page:**
  - Hero on tint: lockup, the headline "Less paperwork, more patients.", one supporting line ("Simple notes and invoicing for physiotherapists."), and a primary "Download" button linking to `/download`.
  - "What it does" section: three short blocks (visit notes, invoicing, works offline) written from `docs/design-brief.md`.
  - "Built for solo physios in BC" section explaining who it's for.
  - "Your patients' privacy" section in plain language, linking to the privacy page. Only claims that are true per `docs/tech-stack.md`.
- [ ] **W5. Download data:** one typed data file (`apps/web/src/data/downloads.ts`) listing each platform (iPhone, Android, Mac, Windows) with a name, a short requirement line, a link and a status of `available`, `beta` or `coming-soon`. Every link starts as a placeholder and every status as `coming-soon`. Add a small Vitest test that every entry has a valid status and that available entries have a real https link.
- [ ] **W6. Download page:** one card per platform from the data file, with the platform name and requirement line. Cards with a link show a button; `coming-soon` cards show a calm "Coming soon" tag instead. Add a short "Join the beta" note with a `mailto:` link to `[CONTACT EMAIL]` (no forms).
- [ ] **W7. Legal pages:** create `docs/legal/privacy.md` and `docs/legal/terms.md` with the headings below and `[TO BE WRITTEN]` under each, then render them at `/privacy` and `/terms` with a "Last updated" date taken from the file's front matter and the draft banner.
  - Privacy headings: Who we are · What we collect · Patient information · Where your data is stored · Who we share it with · How long we keep it · Your rights · Security · Children · Changes to this policy · Contact.
  - Terms headings: Agreement · The service · Your account · Your responsibilities · Patient data and professional obligations · Fees · Beta software · Intellectual property · Disclaimers · Limitation of liability · Ending your account · Changes · Governing law · Contact.
- [ ] **W8. 404 page and final pass:** friendly 404 with a link home; check every page on a phone width and at desktop width, heading order, link text, contrast and keyboard focus; run a production build and confirm `dist/` contains only static files. Report Lighthouse scores if you can run it locally; otherwise list what you checked.
