# Workflow report: settings, profile, branding and price list

Research from Mobbin (November 2026) on how invoicing and small-business apps lay out settings, the practitioner profile, invoice appearance, app appearance and the list of billable items. It ends with screens to add to the [Kineō v2 storyboard](https://claude.ai/artifact/NsrUrTUR5PDWYH3b5jFh45).

Kineō's scope for these screens is set in [design-brief.md](../design-brief.md) (screens 8–11): Settings with Your profile, Price list and tax, Invoice style (desktop only), account and sign out. Nothing below adds to that scope, except where marked **optional**.

---

## 1. The settings hub

### Freenow (iOS): rows with the current value underneath

- [Adding company detail](https://mobbin.com/flows/159a8907-4033-427d-ae84-82f0d72237e7?tab=screens) · [Editing company details](https://mobbin.com/flows/6628f04b-4379-4daa-a450-19aec782d234?tab=screens)
- Each row has an icon, a title and the current value as a subtitle ("Company details · Mobbin", "Payment method · Apple Pay"), so you can check settings without opening them.
- A missing item shows inline on the row ("Work email · Unverified") and as a banner above the list.
- Edit screen: heading, one-line reason ("Fill in your company details for invoicing"), stacked fields, one Save button pinned at the bottom. Saving returns to the hub with a "Company details saved" toast.

### Instacart (iOS): short list, one level deep

- [Business settings](https://mobbin.com/flows/a2dd1997-a2ea-4c8d-a46b-fd6b8f679dc6?tab=screens)
- Three plain rows (General, Custom fields, Tax exemptions). Shows how short a settings hub can be when the product is small.

### Xero (web): grouped rows with descriptions

- [Creating a branding theme](https://mobbin.com/flows/e80c1c90-7691-4583-a66f-a1ba4bb3eaa1?tab=screens) (screen 1 is the settings hub)
- Groups (General, Sales, Purchases), each row a link plus one sentence on what is inside ("Update your organisation's name, logo, or contact information").

**What fits Kineō:** Freenow's row shape (title, current value, status) inside Xero's "one sentence per row" clarity. Kineō has three rows, so no groups are needed.

---

## 2. Profile and business details

- **Freenow**, above: one screen, one Save, toast on return.
- **Xero branding theme**, "Your business details" panel: each business field has a **toggle that shows or hides it on invoices**, with the empty state written under the label ("Phone · No phone number"). This is almost exactly Kineō's "Show on invoice" rule.

**What fits Kineō:** the profile is a single form. Each field gets a "Show on invoice" switch on the same row. When a shown field is empty, the row says so in error text ("Shown on invoices. Add a phone number."). That is the same message the invoice preview's send block points to, so the user can fix it in one step.

---

## 3. Invoice appearance (document branding)

### Xero (web): accordion of settings beside a live document

- [Creating a branding theme](https://mobbin.com/flows/e80c1c90-7691-4583-a66f-a1ba4bb3eaa1?tab=screens)
- Left: collapsible sections (Your business details, Customer details, Brand and styling, Content, Payment). Right: the invoice at true size with zoom and a desktop/phone toggle.
- Brand and styling: logo drop zone with "Delete logo", logo position as a three-part segmented control (Left, Center, Right), brand colour, font.
- Supports several saved themes, which is more than a solo practitioner needs.

### Bonsai (web): form left, "Brand preview" right, one save

- [Editing branding settings](https://mobbin.com/flows/baecf5e7-cb13-447f-b99f-9af020d0ca84?tab=screens)
- Logo file with a remove button and size picker, header image, font, colour with hex field. A single "Save changes" at the top right. Toast: "Your branding settings have been saved."
- Note under the heading: "Changes only affect newly created documents." Worth copying, because Kineō's sent invoices are locked.

### Square (web): layout as picture cards

- [Customization](https://mobbin.com/flows/46d13781-4ac9-42ba-86c8-cf0c9bfd1937?tab=screens)
- Three thumbnail cards (Original, Modern, Classic) with a name and a one-line description. Preview and Save buttons above.
- Also lets you rename invoice labels ("Item(s)", "Quantity"). More than Kineō needs.

**What fits Kineō:** Bonsai's two-column layout and single save, Xero's segmented control for logo position, Square's picture cards for header layout and font. Kineō's choices are already few (5 accents, 3 fonts, 2 header layouts), so they can all show as cards and swatches with no dropdowns.

---

## 4. Price list (custom line items)

### Beside (iOS): list plus a sheet

- [Adding a product or service](https://mobbin.com/flows/ea90f510-4f57-430b-b22e-21302aa3a3b7?tab=screens)
- List of name and price rows, each with a delete icon, a + in the header, and one Save at the bottom.
- New item opens a sheet: Name, Price (number pad opens straight away), Description (optional), Done top-right.

### Revolut Business (iOS): catalogue with search

- [Adding a product](https://mobbin.com/flows/f6e6616b-d0d6-43d7-94d1-27980ce6f98b?tab=screens)
- Big title, search, "New product" pill top-right, rows with price on the trailing edge. Toast: "Product added". Categories are more than Kineō needs.

### Jobber (iOS): adding a custom line inside the invoice

- [Adding a line item](https://mobbin.com/flows/a963fd19-2f4c-4588-bed2-ad660d5cc867?tab=screens)
- From the invoice: Name, description, unit price, quantity, a live total and "Save line item".

**What fits Kineō:** Beside's list and sheet for the price list, with Revolut's "Product added" toast. In the invoice editor, keep picking from the price list (the domain rule), and add a "New price list item" shortcut at the end of the picker that opens the same sheet. The new item then joins both the list and the invoice. That gives Jobber's speed without one-off lines that bypass the price list.

---

## 5. App appearance (optional, not in the brief)

- [GitHub](https://mobbin.com/screens/1dd7bc8c-1a31-4169-9f1b-3b9287d4d539): three rows (Automatic, Dark, Light) with a check. The simplest pattern.
- [Matter](https://mobbin.com/screens/f29e8e34-8c0b-4095-a9e3-c7edc4848678): System, Light and Dark as small picture cards.
- [Substack](https://mobbin.com/screens/0b20258f-630b-4a53-b2d2-5f9f022380c7) and [Klarna](https://mobbin.com/screens/4a7578be-302b-42bc-a3c0-9b91ed441b74): appearance mixed with default tab, app icon and themes. Busier than Kineō wants.

**What fits Kineō:** the brief has no dark mode, and `@kineo/tokens` has no dark palette. If you want one later, use GitHub's three rows, with "Match system" as the default. Until then, leave appearance out of Settings.

---

## 6. Comparison

| Flow                | Best example          | Steps to change one thing    | Why it is efficient                                  | What to avoid                                   |
| ------------------- | --------------------- | ---------------------------- | ---------------------------------------------------- | ----------------------------------------------- |
| Settings hub        | Freenow               | 1 tap to the right screen    | Current value and problems visible in the list       | Deep nesting, Instacart's empty rows            |
| Profile             | Xero business details | Edit field, toggle, save     | "Show on invoice" toggle on the field                | Separate screen for invoice visibility          |
| Invoice appearance  | Bonsai + Xero         | Pick, see preview, save once | Live preview beside every control                    | Multiple themes, header images, renaming labels |
| Price list          | Beside                | +, two fields, Done          | Sheet keeps the list in view; number pad opens first | Categories, currencies, billing periods         |
| Add line in invoice | Jobber                | Without leaving the invoice  | No trip to Settings mid-invoice                      | One-off lines that skip the price list          |
| App appearance      | GitHub                | One tap                      | Three choices, default follows the system            | Themes, icons, launch tabs                      |

Shared patterns across the best flows:

1. **Show the current value in the list**, so settings can be checked without opening them.
2. **One save per screen**, pinned at the bottom on phone and top-right of content on desktop; a toast naming what was saved.
3. **Preview next to the control** whenever the setting changes how a document looks.
4. **Explain the effect in one line** ("Shown on invoices", "Only affects new invoices").
5. **Problems surface where they are fixed**: a missing profile field shows on the Settings row, on the field, and in the invoice preview's send block, all with the same wording.

---

## 7. Screens to add to the v2 storyboard

Each fits the existing frames: same tokens, status tags, one filled button per screen, back arrow on detail screens, no bars on desktop.

### Phone: "Settings and price list" (4 screens)

1. **Settings hub.** Settings tab active. Three cards (Your profile, Price list and tax, Invoice style), each with the current value as a subtitle: "Dana Reid · 1 field missing" in error text with the error icon, "6 items · Tax 5%", "Set on desktop". Below: "Signed in as name@example.com" and a quiet "Sign out".
2. **Your profile.** One form. Each field row: label, input, "Show on invoice" switch. The empty Phone field with its switch on shows "Shown on invoices. Add a phone number." Primary "Save profile" pinned above the tab bar. Toast "Profile saved".
3. **Price list and tax.** List of name and price rows; "Add item" as the one filled button; a "Default tax rate" row below the list with "5%" and a note "Used when you turn tax on for an invoice".
4. **New item sheet.** Bottom sheet over the list: Name, Price with the number pad open, Done. Toast on the list: "Item added".

Link: the phone invoice preview's "Open Settings" error goes to screen 2, closing the loop with the existing PhoneInvoice frame.

### Desktop: "Settings" (1 frame) and "Invoice style" (1 frame)

1. **Settings.** Back arrow, a centred column (max 640px) with the same three rows as the phone hub plus their subtitles. No wordmark top-left; the small wordmark with Terms and Privacy sits at the bottom middle (as in the brief).
2. **Invoice style.** Bonsai's two columns:
   - Left: Logo (drop zone, Replace, Remove), Header layout (two picture cards: Logo left, Logo centred), Accent colour (five swatches with names and a check on the chosen one; colour is never the only cue), Font (three cards showing "Aa" in each font), Footer note (textarea).
   - Right: the live invoice preview from the existing DesktopInvoice frame, using the selected style.
   - One "Save style" button top-right; a line under the title: "Only affects invoices you haven't sent yet."

### Desktop invoice editor: one small addition

In the existing DesktopInvoice frame, the "+ Add from price list" menu ends with "New price list item", opening the same sheet as on phone (as a dialog on desktop).

### Optional

A single "Appearance" row (Match system, Light, Dark) if you decide to add dark mode. It needs a dark palette in `@kineo/tokens` first, so it is left out of the storyboard until then.
