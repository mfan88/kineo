# Funding and invoices: findings, decisions and rules

Read this before building any screen, schema or rule that involves funders, billing recipients or invoice reference details. It records what we found, what we decided and why, and which parts are fixed.

Sources: Mobbin research and BC government pages read on 13 November 2026, plus the decisions made while designing the storyboard. Background reports: [`research/funded-programs-invoicing.md`](research/funded-programs-invoicing.md) (funder facts and app patterns). Designs: [kineō funding and invoices storyboard](https://claude.ai/artifact/Nc4KpNEafBd5fh4fEs4Jpv) (private canvas, light and dark; boards named below).

## How to use this document

Every rule here has one of four labels. Treat them differently.

| Label                    | Meaning                                                             | What you do                                                              |
| ------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **FIXED (funder)**       | Required by a funder's own published rules. We can't change it.     | Build the app around it. Never relax it.                                 |
| **FIXED (product)**      | A decision the owner made or a rule in `CLAUDE.md`.                 | Keep it. Change it only if the owner says so.                            |
| **FLEXIBLE**             | A design choice made to fit the app's flow. The reasoning is given. | Adapt layout, wording and component choice, as long as the reason holds. |
| **PENDING / UNVERIFIED** | Proposed but not approved, or a fact we could not confirm.          | Ask before building. Don't treat as settled.                             |

If a flexible choice would break a fixed rule, the fixed rule wins.

---

## 1. Product scope (FIXED, product)

- Kineō is practitioner-only. Patients, parents and funders never use the app and have no workflow in it.
- Kineō produces invoices. The practitioner submits them (portal, mail, email, fax). **Kineō never submits claims or invoices to a funder.** This holds under `CLAUDE.md` ("Patients handle payment and insurance themselves. Kineō never submits insurance claims").
- Funded patients are the one place where someone other than the patient pays. "Paid" is still only the practitioner's record for their taxes.
- Notes and invoices stay separate. **Invoices never include note text**, funded or not.
- Existing invoice rules are unchanged by this feature: one patient per invoice, `draft → sent → paid` with paid → sent for undo, sent and paid invoices locked, tax optional and off by default, money in integer cents, numbers per practitioner padded to four digits.
- Never log funding details, billing numbers, claim numbers or patient names. They are health-related. Test data is made up only (the storyboard's 4821 and K1234567 are made-up).

---

## 2. What the funders require

Everything in this section was read from official pages on 13 November 2026. Funder rules change; re-check before relying on a detail.

### 2.1 Autism Funding and its replacement (FIXED, funder)

- Autism Funding (Under Age 6 and Ages 6–18, Ministry of Children and Family Development) **ends 31 March 2027**. It is replaced by the **BC Children and Youth Disability Benefit (CYDB)**. The provider page already covers both.
- Physiotherapy is eligible. Under-6 families must use providers on the Registry of Autism Service Providers (RASP), which lists physical therapists. The CYDB policy (August 2026) lists registered physiotherapists as eligible.
- Families hire the provider. Government pays the provider directly, after the service.
- Before invoicing, a Request to Pay (Autism Funding) or Request for Services (CYDB) sets a maximum hourly or daily rate and a maximum amount for the funding period. The provider then gets a **billing number** (Autism Funding) or **authorization number** (CYDB). **A new one is issued each funding period.** Service should start only after the number arrives.
- **An invoice must include** (official page and sample invoice):
  - provider full name, mailing address, phone;
  - payee name, address, phone, if different from the provider;
  - the billing or authorization number;
  - an invoice number of **at least four characters**;
  - the child's first and last name;
  - for each service: date (day, month, year), type of service, amount (hours or days), rate (per hour or day);
  - total cost. The sample also shows GST/HST totals, a note that the rate includes PST if applicable, and signature lines.
- **Bill to** (printed on the sample): Autism Funding Branch, Ministry of Children and Family Development, PO Box 9776 STN PROV GOVT, Victoria BC V8W 9S5. CYDB uses a different mailbox (`cfd.disabilitybenefit@gov.bc.ca`); its mailing address on the page is the same PO Box.
- **Rules:** invoice monthly; submit within **six months** of the service date; no future-dated services, no cancelled or missed appointments; give the family a copy of every submitted invoice (CYDB encourages sharing it with the family before submitting).
- CYDB: no separate invoice field list was found. The page points to the same Sample Invoice. Treat the Autism Funding list as the working list.

### 2.2 WorkSafeBC (FIXED, funder, partly unverified)

- A contract with WorkSafeBC is needed to bill physiotherapy. Treatment is payable only on an accepted claim. The claim number is the key identifier.
- Bill within **90 days** of the service date. Bill electronically; paper (Form 267) only when the worker has no BC Personal Health Number.
- Fee code 19102 per visit, one visit per day per claim; extension requests use 19103. The invoice date is tied to the date on the matching report.
- The only invoice field list we could read is the hospital one: worker's name, gender, date of birth, Personal Health Number, date of injury, diagnostic, side of body, body part and nature of injury codes, service location, date of service, payee number, practitioner number, fee code, amount. The physio billing guide (a 2022 document) refers to the same worker, claim and injury information and the MSP payee number.
- **Unverified:** whether the physio field list is identical, and any recipient address.

### 2.3 ICBC (FIXED, funder, mostly unverified)

- Direct billing needs ICBC approval. The terms say each invoice "must accurately identify the Customer and the individuals that provided the Services". Invoicing is in ICBC's own app against pre-approved sessions, using the claim number.
- **Unverified:** the full field list and any recipient address.

### 2.4 Self-pay and extended health receipts (FIXED for what is listed, otherwise flexible)

- **Pacific Blue Cross** needs a receipt with: name of the person treated, date of service, name and registration of the physiotherapist, length of the service, amount charged, amounts paid by the client or another payer. No recipient address is required.
- The **College of Physical Therapists of BC** standards list the financial records to keep: provider and organization, date and service, the client's unique identification, the fee, method and date of payment and the payer, and any balance owing. Invoices and receipts must be clear and accurate.
- Other insurers may differ. These two are examples, not a complete rule.

### 2.5 Not researched (PENDING)

At Home Program and other Children and Youth with Support Needs lines, Jordan's Principle, NIHB, Veterans Affairs, MSP supplementary benefits. A BC provider's notice mentions billing At Home, Autism Funding, Jordan's Principle, Variety, CKNW and CLBC separately, so each is its own funder with its own references. Do not assume they match Autism Funding.

### 2.6 Facts that drive design

1. **The required set differs by funder.** Autism Funding needs a recipient address and one number. WorkSafeBC needs far more and is billed electronically. This is why funding types are user-defined and not hard-coded.
2. **The label changes.** "Billing number" becomes "authorization number" in under five months. Labels must be data, never code.
3. **The number changes each funding period.** A new period is a new patient funding, not an edit.
4. **Funders reject what they didn't authorize.** Missing or wrong numbers get invoices returned, and families can end up owing the cost. The app should stop a send, not warn after it.
5. **WorkSafeBC and ICBC are billed in their own systems.** A Kineō PDF matters most for Autism Funding/CYDB and self-pay. For the others it is a record and a helper.

---

## 3. The model (FIXED, product)

Three layers. Each copies from the one above when it is created, so later edits never change history.

**Funding type** (Settings, desktop only). The template, owned by the practitioner.

- Name.
- **Recipient name and address: mandatory on every type.** A type missing either cannot be used to send an invoice.
- Any number of **details**: label, kind (text or date), and **Show on invoice**.
- Starting points (Autism Funding, CYDB, ICBC, Blank) are only copies. Choosing one creates an ordinary editable type. A starting point never changes a type that already exists. Start from what we verified in section 2; leave unverified values (WorkSafeBC and ICBC addresses) empty.

**Patient funding** (patient screen, both apps). One patient on one type for one period.

- A copy of the type's recipient and details, plus this patient's values.
- Optional period start and end.
- A patient with no active funding is **self-pay**.
- A new funding period means a new funding. End the old one, add the new one.

**Invoice.**

- Copies **Bill to** (name and address) and the details marked Show on invoice when it is created.
- Editable while a draft. **Locked once sent**, like lines and tax. Later changes to the funding or type never alter a sent invoice.
- Funded: Bill to is the funder, and the patient is the named client.
- Self-pay: Bill to is the patient. A name is enough, an address is optional.

### Mandatory rules for the model (FIXED, product)

1. A shown detail must be filled in before an invoice can be sent. This is the same rule as profile fields marked "show on invoice".
2. A funded invoice cannot be sent without a recipient name and address.
3. A send is **blocked**, not warned. The message names what is missing, and focus moves to it. Example: "Add the billing number before sending."
4. The snapshot is taken at creation and locked on send. Changing a funding type must never alter a sent invoice.
5. Funding types are created and edited on desktop only. The phone adds values to existing types and picks Bill to, and tells the user to make new types on their computer. This follows the rule that invoice style stays desktop only.
6. Private and self-pay patients see nothing extra by default. Funding is opt-in per patient.
7. Funding type, detail and label text are user data. Never hard-code funder names or labels in business logic. Presets live in `packages/shared` as data.
8. Business logic (required-before-send, snapshotting, locks) lives in `packages/shared` with tests, and the server enforces it, like the other invoice rules. Neither app duplicates it.

---

## 4. Screens and what you can change

Boards in the storyboard: Main (system), DesktopFundingTypes, DesktopFundingEditor, DesktopPatientBilling, DesktopBillTo, DesktopInvoiceFunded, PhoneFunding.

### Must stay as designed

| Element                                                                  | Why                                                                                         |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Recipient name and address are required on a type                        | Funders bill a named recipient at an address. The owner decided this.                       |
| Show on invoice per detail; shown means required                         | Matches profile fields. Keeps the rule simple and consistent.                               |
| Send blocked, with a named message, and focus on the first missing field | Funders return incomplete invoices; a warning is not enough.                                |
| Bill to is one row in the invoice editor, with Change                    | Funded and self-pay use the same place and the same words.                                  |
| Funding type editing only on desktop                                     | Desktop-only rule for configuration screens.                                                |
| Invoice preview shows Bill to, client and shown details                  | The preview is the PDF. Funders read it.                                                    |
| Funded invoice shows a date for each service                             | Autism Funding requires dated services.                                                     |
| Locked once sent                                                         | Existing invoice rules.                                                                     |
| Self-pay: name only is enough; address optional                          | Owner decision. Pacific Blue Cross doesn't require an address either.                       |
| Funding chips are outlined grey, not tinted                              | Sky tint already means Draft. Chips say who is billed; tags say what state something is in. |
| No note text on invoices                                                 | `CLAUDE.md`.                                                                                |
| One primary button per screen; other actions are text buttons            | `CLAUDE.md` design rules.                                                                   |
| Every state shown in the storyboard (empty, error, locked, sent)         | States are required by the design rules, not optional.                                      |

### Can change to fit the flow

- Layout, spacing, column widths, card order and where a screen sits in the navigation, within the global rules (no top bar or sidebar on desktop, bottom tab bar on phone).
- Wording, as long as it stays plain, warm and short, starts buttons with a verb, and names what to do. The error pattern "Add the X before sending" should stay.
- Whether Change on Bill to opens a menu, a sheet or a dialog.
- The order of details, and how many show before "Add detail".
- How period dates are entered (text, picker).
- Icons, as long as chips and tags keep an icon and a word.
- Whether the patient screen shows funding above or below visits, as long as billing is visible before invoicing.
- Animation and toast timing, within the existing loading and pending rules.

### Pending (ask the owner)

1. **Two token changes.** An input edge colour (#878791 light, #6B7684 dark) and a darker light-mode switch track (was #E4E4E7, 1.27:1). Both change the HeroUI input convention, so they need approval. Until then use the existing tokens, but note that the filled input alone is a weak boundary.
2. **Required and Show as one switch or two.** The storyboard uses one (Show on invoice, shown means required). The owner described a mandatory set plus optional extras, so a separate Required switch may be wanted.
3. **Is an identifier mandatory on every type?** The storyboard treats it as an ordinary detail. The recommendation is recipient only mandatory, because the required set differs by funder.
4. **Hours.** Lines are whole-number quantities, so a 60-minute session is a price-list item ("Physiotherapy, 60 min"). Autism Funding wants hours and an hourly rate. Fractional hours would need a schema change.
5. **Registration number and session length on self-pay invoices.** Pacific Blue Cross requires the physiotherapist's registration and the length of service. The profile has no registration field. The storyboard shows a placeholder only.
6. **Child as patient.** Is the named client the patient, with a parent or guardian as contact? The model has one name per patient today.
7. **Rate warnings.** An optional authorized hourly rate and period maximum could warn when an invoice goes over. Never block on it.
8. **Deadline cue on Home.** The oldest unbilled visit's age, against six months (Autism Funding, CYDB) and 90 days (WorkSafeBC). Beyond the brief.
9. **GST/HST treatment** on physiotherapy services is unverified. Tax stays optional per invoice.

---

## 5. Design reasoning

- **Generic label and value details, not funder-specific screens.** Stripe, Revolut and Jobber give invoices free-form custom fields. None hard-code a funder. We need the same because the required set differs by funder and the labels change.
- **Two levels.** Business-wide identifiers (QuickBooks' registration number toggle) are set once. Per-customer references are entered where the invoice is made. This maps to profile fields and patient fundings.
- **Copy at creation.** OpenAI's PO number applies to future invoices only. Kineō already copies name and price onto a line. Same idea: a past invoice never changes.
- **Optional, deferrable and escapable.** Headspace, Zocdoc, CVS and Lloyds treat insurance details as optional, skippable and removable, and give self-pay a default ("I'm paying out of pocket instead"). Nothing about funding blocks a note or a visit. It matters only when billing.
- **Funded and self-pay look the same.** One Bill to row, same words. This keeps the app calm and the flow obvious.
- **Colour.**
  - No new brand hues. One sky ramp and one zinc ramp.
  - Funding chips are outlined grey so they can't be read as the Draft tag.
  - Missing details reuse the existing error pair (#B42318 on #FEE4E2, 5.45:1) with an icon and words.
  - Text on a grey input fill uses the placeholder grey (#67676F, 5.10:1). The muted grey (#71717A) is only 4.40:1 on the fill.
  - Invoice paper stays white in both modes.
- **Accessibility.** Visible labels; "Required" written as a word; errors under the field tied with `aria-describedby`; switches are buttons with `role="switch"` and unique names; native radios for the Bill to list; focus ring 2 px sky (4.10:1 light, 8:1 dark); targets at least 44 px; phone inputs 16 px so iOS doesn't zoom.
- **Type.** Inter; labels 14/500; helper text 13; tabular figures and break-anywhere for identifiers; long recipient names wrap and are never cut; chips and tags never wrap.

---

## 6. Where to look when you build

- Existing invoice and note rules: `CLAUDE.md`, `packages/shared`.
- Tokens: `packages/tokens` (light, dark, status tags). Funding chips use the neutral colours; the two pending token changes are not in it yet.
- Storyboard boards and their dark copies: the canvas linked at the top.
- Check anything marked PENDING or UNVERIFIED with the owner before you build on it. If the owner answers one, update this file and remove the label.
