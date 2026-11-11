# Kineō design brief

Product name: **Kineō** (display name, single character ō). Use plain **kineo** for every identifier: repo, packages, bundle IDs, URLs, file names.

## Who

- Solo physiotherapist, British Columbia first
- Native app on desktop and phone (not a website)

## Navigation

- Desktop: **no top bar and no sidebar.** Everything flows from Home. Home has a small settings icon at the top right; every other screen has only a back arrow at the top left.
- Phone: bottom tab bar (Home, Patients, Invoices, Settings), active tab sky blue. Detail screens (patient, invoice, preview, new patient, profile, price list) show a back arrow. Extra top padding (64px; back arrow row 52px) for the status bar and notch.

## Screens

1. **Home:** date, "Who are you seeing?", patient search, recent patient chips, then Invoices in three groups: Ready to invoice, Not sent yet, Waiting on payment ("See all" link).
2. **Patients:** live search, "New patient" button, "No patients match" empty state offering to add the name.
3. **New patient:** Full name (required), Reason for visit (optional), then opens the patient's note.
4. **Patient:** name, condition, last visit summary; note box with quick chips, typing or dictation, Save as today's visit, Copy last note, Clear; visit list with status tags and per-visit "Add to note" / "Replace note"; "Invoice N visit(s)" button.
5. **Invoices:** list with number, patient, total, status tag.
6. **Invoice editor:** visits included (checkboxes), line items from the price list dropdown plus quantity, optional tax, totals. Draft → "Preview and send"; sent → "Record payment"; paid → logged message. Locked once sent.
7. **Invoice preview:** the invoice exactly as the patient receives it (style + profile), Download PDF, Share, Mark as sent; error if there are no line items.
8. **Settings:** Your profile, Price list and tax, Invoice style (desktop only; phone shows a note instead).
9. **Profile (both apps):** Full name, Title or certification, Clinic name, Address, Phone, each with "Show on invoice". Fields shown on invoices are required.
10. **Price list and tax:** item name and price, add item, default tax rate.
11. **Invoice style (desktop only):** logo upload, accent colour (Sky, Forest, Ocean, Plum, Charcoal), font (Nunito, Serif, Clean), header layout (logo left or centred), footer note, live preview.
12. **States:** skeleton loading, "You're all caught up" empty states, inline errors, toasts ("Note saved", "Invoice sent", "Marked paid" with Undo, "Patient added", "Profile saved").

## Business rules

- Notes and invoices are separate; a note can be invoiced later. One invoice can cover several visits.
- The patient handles payment and insurance claims. "Paid" is only for the practitioner's tax records.
- Tax is off by default and optional per invoice.

## Visual style

- HeroUI conventions: 12–16px radius, soft shadows, grey-filled inputs (`#F4F4F5`) that turn white with a primary border on focus, pill chips and status tags, sentence case, no uppercase, Inter.
- Palette: primary `#0284C7`, hover `#0369A1`, text on tint `#075985`, tint `#E0F2FE`, page background `#F7FBFF`, text `#11181C`, muted `#71717A`, borders `#E4E4E7`, error `#B42318`.
- Rejected directions: top app bar, desktop sidebar, MUI (too blocky), terracotta palette.
