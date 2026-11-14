# Phase 9: items on notes and invoice branding

Linked from `docs/tasks.md`. Decided with Marcus on 13 November 2026.

## What we're building

1. **Items on a note.** When writing a note, the practitioner can add items from the price list. This is optional, and they can add several. When the visit goes on an invoice, its items become lines on that invoice.
2. **Lines on the invoice stay as they are.** "Add line item" on the invoice editor works exactly as before.
3. **"Bill for"** replaces "Client" everywhere a funded invoice names the patient: the template, the Bill to summary and the funding type editor's sample.
4. **Invoice branding (desktop Invoice style).** Up to one header logo (today's logo) and up to one footer logo. The footer logo sits centred above "Made with Kineō" and below the footer note. With no logos, the screen shows a single "Branding · No branding" line with a + button.
5. **Page layout.** The invoice reads as a letter page. Short invoices fill the page, so "Made with Kineō" sits near the bottom. Parts are grouped into sections instead of all having equal gaps.
6. **"Made with Kineō" switch.** It's on by default, and anyone can turn it off during the beta. A practitioner who turns it off keeps it off; there's no beta flag in code.

## Rules (fixed)

### Visit items

- A **visit item** is a copy of a price list item, made when it's added to a visit: price item id (null once that item is deleted), name, unit price in cents, a whole-number quantity of at least 1, and a position starting at 0.
- Adding a price item that's already on the visit raises its quantity by 1, so there's never a second row for it.
- A visit's items can be changed only while the visit **is not on an invoice**. Once it's on one, its lines are changed on the invoice instead. The server enforces this for requests from the apps. A request with no signed-in practitioner (an admin) can still delete them, the same exception as `visits_corrections`.
- **Putting a visit on a draft invoice**, either by creating the invoice or by ticking the visit on the editor, copies each of its items onto the invoice. Each line gets `visit_id` set to that visit and its position continues after the existing lines (visits oldest first, then each visit's item order). The line's `service_date` is the visit's date on a funded invoice and null on a self-pay one. Name, price and price item id come from the visit item, not the price list, so the price is the one copied when the item was added to the note.
- **Taking a visit off a draft invoice** deletes the lines on _that invoice_ whose `visit_id` is that visit, closes up the positions, then runs the existing "lines losing their date" step for the rest. Lines added on the invoice itself (`visit_id` null) are never touched. Putting the visit back copies its items again.
- Cancelling an invoice changes nothing here: its lines stay as a record, and the visit keeps its items, so invoicing it again copies them again.
- Deleting a visit deletes its items too. Undo puts both back.
- Note text never reaches an invoice. Only item names do.

### Branding

- `invoice_styles.logo_path` stays the header logo. A new `footer_logo_path` follows the same rules: PNG, JPEG or SVG up to 1 MB, in the same `logos` bucket and owner folder.
- New `invoice_styles.show_made_with` is a boolean, true by default. A missing local value (an older row) reads as true.
- Invoice style stays **desktop only**. The phone only renders the footer logo and respects `show_made_with`.

## Schema (agreed)

Migration `supabase/migrations/20261117090000_visit_items_and_branding.sql`:

- `public.visit_items`:
  - `id uuid primary key default gen_random_uuid()`
  - `owner_id text not null` (non-blank check)
  - `visit_id uuid not null`
  - `price_item_id uuid references price_items(id) on delete set null`
  - `name text not null` (non-blank)
  - `unit_price_cents bigint not null >= 0`
  - `quantity integer not null >= 1`
  - `position integer not null default 0 >= 0`
  - `created_at timestamptz not null default now()`
  - Foreign key `(visit_id, owner_id)` → `visits(id, owner_id)` `on delete cascade`, plus an index on `visit_id`.
  - Row-level security keyed on the owner, the same as the other tables.
  - Added to the PowerSync publication.
  - A trigger refuses insert, update or delete while the visit's `invoice_id` is set and `public.requesting_owner_id() is not null`, with the message: `This visit is on an invoice, so its items can't be changed. Change the lines on the invoice instead.`
- `public.invoice_lines.visit_id uuid` (nullable), with a foreign key `(visit_id, owner_id)` → `visits(id, owner_id)` `on delete set null (visit_id)` (Postgres 17), plus an index.
- `public.invoice_styles`:
  - `footer_logo_path text`, with the same check as `logo_path`
  - `show_made_with boolean not null default true`
- `infra/powersync/sync-config.yaml` gets a `visit_items` query.
- Both uploaders' `TABLES` lists get `visit_items`, making 11 tables.

## UI

### Desktop: patient screen note box

- Between the note text area and the date/buttons row there's an **Items** area. When it's empty, it shows a ghost text button "+ Add item" that opens a menu of the price list ("Initial assessment · $120.00").
- Each chosen item is a row: the name, its price, a − / + quantity stepper (44px targets; − is disabled at 1) and a remove icon button labelled "Remove {name}". "+ Add item" stays under the rows.
- With an empty price list, the area shows the muted text "Add items to your price list to bill them with a note." with a "Price list" link.
- "Save note" saves the items with the visit and clears them from the box. "Replace note" never touches items.
- In the visit list, a visit with items shows them as muted text under its note: "Initial assessment × 1 · Treatment × 2". A visit that isn't on an invoice gets an "Edit items" text button, which opens a dialog with the same item picker and a "Save items" primary button; saving shows the toast "Items saved".

### Phone: patient screen

- The same Items area sits under the note input. "+ Add item" opens a bottom sheet listing the price list.
- Visit rows show the same muted items line. "Edit items" (visit not invoiced) opens a sheet with the picker and "Save items".

### Desktop: Invoice style

- The Logo field is replaced by **Branding**:
  - With no logos, one line reads "Branding · No branding" (label, then muted text) with a + icon button labelled "Add a logo". It opens a menu: "Header logo", "Footer logo".
  - With at least one logo, the line reads "Branding", and the + shows only while a slot is free (its menu lists only the free slots).
  - Each logo that's set gets a row: a thumbnail, its name ("Header logo" / "Footer logo"), and "Replace" and "Remove" text buttons.
  - "PNG, JPEG or SVG, up to 1 MB." appears once, under the field.
- A **switch** after the footer note: "Show “Made with Kineō”", with the description "Free to turn off during the beta."
- Saving deletes a replaced or removed footer logo from Storage, the same way the header logo is handled today.

### Invoice template (both apps)

- The page is a letter page: on screen, `.page` is up to 8.5in wide with `aspect-ratio: 8.5 / 11` (it grows taller for long invoices) and 0.6in padding. In print it has no padding and a minimum height of `calc(11in - 1.2in - 0.1in)`, so a short invoice still prints on one page.
- `.page` is a flex column with four sections and 32px between them:
  1. **Header**: header and rule, 16px apart.
  2. **Bill to**.
  3. **Items**: table and totals, 12px apart.
  4. **Footer**: footer note, footer logo, then "Made with Kineō", 12px apart, with `margin-top: auto` so it sits at the bottom of the page.
- The footer logo is centred, at most 40px high and 160px wide. It renders only when `style.footerLogoPath` and `footerLogoSrc` are both set.
- "Made with Kineō" renders only when `style.showMadeWith` is true.
- Desktop's `InvoiceFrame` draws the page at 816px wide and scales it to fit its column (transform with a ResizeObserver), so the preview keeps the page's proportions. The phone keeps its full-width preview; the aspect ratio still pushes the footer down.

## Tickets

- [x] **I1. Database:** the migration above, `sync-config.yaml`, and pgTAP tests in `supabase/tests/visit_items.test.sql` (RLS, the lock trigger, the cascade, set null, the new style columns). Add the new table to `rls.test.sql` if it lists tables.
- [x] **I2. Shared rules:** `visitItemSchema` / `VisitItem`; `LineItem.visitId` (nullable, optional); `InvoiceStyle.footerLogoPath` and `showMadeWith`; `packages/shared/src/visits/items.ts` with tests; "Bill for" in `funding/billTo.ts`.
- [x] **I3. Uploaders:** `visit_items` in desktop `upload.rs` and phone `upload.ts` `TABLES`, with tests.
- [x] **I4. Data schema:** local tables and columns, `BOOLEAN_COLUMNS`, mappers, `practiceData` (`visitItems`), and the demo data, with tests.
- [x] **I5. Invoice template:** "Bill for", the footer logo, the Made with switch, and the page layout and sections, with tests.
- [x] **I6. Data writes:** `saveVisit` with items, `setVisitItems`, delete and restore with items, `createInvoice` and `setVisitOnInvoice` copying and removing lines, `saveInvoiceStyle` with the new fields, with tests.
- [x] **I7. Desktop stores:** the `PracticeStore` interface, `LiveStore`, `DemoStore` and `DemoPracticeStore`, plus footer logo clean-up, with tests.
- [x] **I8. Desktop patient screen:** the items picker on the note, the visit rows, and the Edit items dialog, with tests.
- [x] **I9. Desktop Invoice style:** Branding and the Made with switch, with tests.
- [x] **I10. Desktop preview:** the `InvoiceFrame` scaling and the footer logo in `useInvoiceHtml` / `styleSample`; "Bill for" in the funding type editor sample and the tests.
- [x] **I11. Phone patient screen:** the items picker, the visit rows, and Edit items, with tests.
- [x] **I12. Phone invoice preview:** the footer logo through `logo-context` and "Bill for" in the tests.
